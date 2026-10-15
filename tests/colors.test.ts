import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractColor, fallbackColor } from '../src/core/colors';
function pixels(colors: number[][]) {
  const data = new Uint8ClampedArray(colors.flatMap((color) => color));
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data }),
      }),
    }),
  });
}
afterEach(() => vi.unstubAllGlobals());
describe('safe favicon colors', () => {
  const image = {} as HTMLImageElement;
  it('derives a readable hue with normalized saturation and lightness', () => {
    pixels(Array.from({ length: 16 }, () => [255, 0, 0, 255]));
    expect(extractColor(image)).toBe('hsl(0 55% 64%)');
  });
  it('falls back for transparent or monochrome imagery', () => {
    pixels(Array.from({ length: 16 }, () => [255, 0, 0, 0]));
    expect(extractColor(image)).toBeNull();
    pixels(Array.from({ length: 16 }, () => [200, 200, 200, 255]));
    expect(extractColor(image)).toBeNull();
  });
  it('avoids an invalid NaN hue when opposing colors average to gray', () => {
    pixels(
      Array.from({ length: 16 }, (_, i) =>
        i % 2 ? [255, 0, 0, 255] : [0, 255, 255, 255],
      ),
    );
    expect(extractColor(image)).toBeNull();
  });
  it('handles protected or unavailable canvas pixels safely', () => {
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({
          drawImage: () => {
            throw new Error('SecurityError');
          },
        }),
      }),
    });
    expect(extractColor(image)).toBeNull();
  });
  it('uses deterministic hostname accents when no pixels are available', () => {
    expect(fallbackColor('https://example.com/a')).toBe(
      fallbackColor('https://example.com/b?x=1'),
    );
    expect(fallbackColor('https://example.com/a')).toMatch(
      /^hsl\(\d+ 55% 64%\)$/,
    );
  });
});
