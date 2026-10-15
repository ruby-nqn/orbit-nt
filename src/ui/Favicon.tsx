import { useState, type CSSProperties } from 'react';
import { extractColor } from '../core/colors';
import { hasBrowser } from '../data/storage';
function fingerprint(image: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, 16, 16);
    return [...context.getImageData(0, 0, 16, 16).data].join(',');
  } catch {
    return null;
  }
}
let defaultIcon: Promise<string | null> | undefined;
function defaultFingerprint(): Promise<string | null> {
  if (!defaultIcon)
    defaultIcon = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(fingerprint(image));
      image.onerror = () => resolve(null);
      // The reserved .invalid name only asks Chromium's local favicon database.
      // It never triggers a request to this host.
      image.src = faviconUrl('https://orbit-favicon-fallback.invalid/')!;
    });
  return defaultIcon;
}
export function faviconUrl(url: string): string | undefined {
  if (!hasBrowser()) return undefined;
  const endpoint = new URL(chrome.runtime.getURL('_favicon/'));
  endpoint.searchParams.set('pageUrl', url);
  endpoint.searchParams.set('size', '64');
  return endpoint.href;
}
export function Favicon({
  ...props
}: {
  url: string;
  title: string;
  onColor?: (color: string) => void;
  style?: CSSProperties;
}) {
  return <FaviconImage key={props.url} {...props} />;
}
function FaviconImage({
  url,
  title,
  onColor,
  style,
}: {
  url: string;
  title: string;
  onColor?: (color: string) => void;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false),
    src = faviconUrl(url);
  if (!src || failed)
    return (
      <span className="favicon-fallback" aria-hidden="true" style={style}>
        {(Array.from(title.trim())[0] ?? '•').toUpperCase()}
      </span>
    );
  return (
    <img
      className="favicon"
      src={src}
      alt=""
      draggable={false}
      style={style}
      onError={() => setFailed(true)}
      onLoad={async (e) => {
        const image = e.currentTarget;
        const pixels = fingerprint(image);
        const fallback = await defaultFingerprint();
        if (pixels && fallback && pixels === fallback) {
          setFailed(true);
          return;
        }
        if (onColor) {
          const color = extractColor(image);
          if (color) onColor(color);
        }
      }}
    />
  );
}
