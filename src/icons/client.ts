import { useEffect, useState } from 'react';
import { hasBrowser } from '../data/storage';
import { invalidateIconAsset, readIconAsset, readIconRecord } from './cache';
import { freshIcon, iconPage, limiter, type IconRecord } from './policy';

export interface DisplayIcon {
  src: string;
  record: IconRecord;
}
interface SharedIcon {
  value?: DisplayIcon;
  listeners: Set<(value: DisplayIcon) => void>;
  started: boolean;
  disposed?: boolean;
}
const shared = new Map<string, SharedIcon>();
// Avoid opening hundreds of long-lived runtime channels on a cold bookmark library.
const discoverySlot = limiter(2);
function entry(key: string) {
  let value = shared.get(key);
  if (!value) {
    value = { listeners: new Set(), started: false };
    shared.set(key, value);
  }
  return value;
}
async function publish(state: SharedIcon, record?: IconRecord) {
  if (
    !record?.asset ||
    (state.value?.record.asset === record.asset &&
      state.value.record.updatedAt === record.updatedAt)
  )
    return;
  const asset = await readIconAsset(record.asset);
  if (!asset || state.disposed) return;
  const src = URL.createObjectURL(asset.blob),
    image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(src);
    await invalidateIconAsset(record.asset).catch(() => undefined);
    return;
  }
  if (state.disposed) {
    URL.revokeObjectURL(src);
    return;
  }
  const previous = state.value;
  state.value = { src, record };
  state.listeners.forEach((listener) => listener(state.value!));
  // Defer revocation until React has committed the replacement to every consumer.
  if (previous) setTimeout(() => URL.revokeObjectURL(previous.src), 1000);
}
async function start(key: string, state: SharedIcon) {
  const cached = await readIconRecord(key).catch(() => undefined);
  await publish(state, cached).catch(() => undefined);
  if (freshIcon(cached) && (!cached?.asset || state.value)) return;
  try {
    const response = (await discoverySlot(() =>
      chrome.runtime.sendMessage({
        type: 'resolveWebsiteIcon',
        url: key,
      }),
    )) as { record?: IconRecord };
    await publish(state, response?.record);
  } catch {
    /* Cached Chromium favicon and initials remain usable offline. */
  }
}
export function useWebsiteIcon(url: string) {
  const key = iconPage(url);
  const [value, setValue] = useState<DisplayIcon>();
  useEffect(() => {
    setValue(undefined);
    if (!hasBrowser() || !key) return;
    const state = entry(key);
    if (state.value) setValue(state.value);
    state.listeners.add(setValue);
    if (!state.started) {
      state.started = true;
      void start(key, state);
    }
    return () => {
      state.listeners.delete(setValue);
      if (shared.size > 256)
        for (const [id, item] of shared) {
          if (!item.listeners.size) {
            item.disposed = true;
            if (item.value) URL.revokeObjectURL(item.value.src);
            shared.delete(id);
            if (shared.size <= 192) break;
          }
        }
    };
  }, [key]);
  return value;
}
