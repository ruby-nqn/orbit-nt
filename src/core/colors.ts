import { domainOf, hash } from './urls';
export const fallbackColor = (url: string): string =>
  `hsl(${hash(domainOf(url)) % 360} 55% 64%)`;
export function extractColor(image: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, 16, 16);
    const data = context.getImageData(0, 0, 16, 16).data;
    let r = 0,
      g = 0,
      b = 0,
      weight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const max = Math.max(data[i], data[i + 1], data[i + 2]),
        min = Math.min(data[i], data[i + 1], data[i + 2]);
      if (data[i + 3] < 128 || max - min < 25) continue;
      const w = (max - min) / 255;
      r += data[i] * w;
      g += data[i + 1] * w;
      b += data[i + 2] * w;
      weight += w;
    }
    if (weight < 2) return null;
    r /= weight * 255;
    g /= weight * 255;
    b /= weight * 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      delta = max - min;
    if (delta < 0.03) return null; // Opposing colorful pixels can average to gray.
    let hue =
      max === r
        ? ((g - b) / delta) % 6
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
    return `hsl(${Math.round(hue)} 55% 64%)`;
  } catch {
    return null;
  } // Favicon may be missing or canvas pixels may be protected.
}
