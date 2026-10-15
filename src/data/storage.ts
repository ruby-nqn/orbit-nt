import {
  defaultPreferences,
  migrateInstalledPreferences,
  validatePreferences,
} from '../core/settings';
import type {
  ActivityCache,
  BookmarkSnapshot,
  Preferences,
} from '../core/types';
export const hasBrowser = (): boolean =>
  typeof chrome !== 'undefined' &&
  !!chrome.runtime?.id &&
  !!chrome.storage?.local;
export interface StoredData {
  preferences?: Preferences;
  bookmarkCache?: BookmarkSnapshot;
  activityCache?: ActivityCache;
  historyRevision?: string;
  bookmarkRevision?: string;
}
export async function readLocal(): Promise<StoredData> {
  if (!hasBrowser()) return {};
  return (await chrome.storage.local.get([
    'preferences',
    'bookmarkCache',
    'activityCache',
    'historyRevision',
    'bookmarkRevision',
  ])) as StoredData;
}
export function readPreferences(raw: unknown): Preferences {
  try {
    return raw ? migrateInstalledPreferences(raw) : defaultPreferences();
  } catch {
    return defaultPreferences();
  }
}
export async function savePreferences(preferences: Preferences): Promise<void> {
  if (!hasBrowser())
    throw new Error('Load Orbit as an unpacked extension to save preferences.');
  await chrome.storage.local.set({
    preferences: validatePreferences(preferences),
  });
}
export interface Snapshot {
  bookmarks: BookmarkSnapshot;
  activity: ActivityCache;
}
export async function refreshSnapshot(force = false): Promise<Snapshot> {
  if (!hasBrowser())
    throw new Error(
      'Load the dist folder as an unpacked extension to connect your bookmarks.',
    );
  const response = (await chrome.runtime.sendMessage({
    type: 'snapshot',
    force,
  })) as { data?: Snapshot; error?: string };
  if (!response?.data)
    throw new Error(
      response?.error ||
        'Orbit could not connect to its background service. Reload the extension and retry.',
    );
  return response.data;
}
export async function clearActivity(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: 'clearActivity',
  })) as { error?: string };
  if (response?.error) throw new Error(response.error);
}
