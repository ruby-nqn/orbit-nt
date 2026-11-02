import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assetUrl,
  declaredSize,
  EMPTY_QUALITY,
  FAILURE_TTL,
  freshIcon,
  iconPage,
  limiter,
  rankIcon,
  SUCCESS_TTL,
  type Candidate,
  type IconQuality,
} from '../src/icons/policy';
import {
  candidatesForPage,
  manifestIcons,
  selectCandidates,
} from '../src/icons/metadata';
import { pixelQuality, rasterDimensions } from '../src/icons/images';
import { fetchIconResource } from '../src/icons/network';
const candidate = (changes: Partial<Candidate> = {}): Candidate => ({
  url: 'https://example.com/icon.png',
  source: 'icon',
  sizes: 32,
  type: 'image/png',
  purpose: ['any'],
  ...changes,
});
const quality = (
  size = 192,
  changes: Partial<IconQuality> = {},
): IconQuality => ({ ...EMPTY_QUALITY, width: size, height: size, ...changes });
afterEach(() => vi.unstubAllGlobals());
describe('icon identity and metadata', () => {
  it('preserves paths, queries, origins, and strips fragments', () => {
    expect(iconPage('HTTPS://Example.COM:443/a?tenant=1#x')).toBe(
      'https://example.com/a?tenant=1',
    );
    expect(iconPage('https://example.com/a?tenant=2')).not.toBe(
      iconPage('https://example.com/a?tenant=1'),
    );
  });
  it.each([
    'javascript:alert(1)',
    'file:///x',
    'chrome://settings/',
    'data:image/png,x',
    'https://user:pass@example.com/',
    'not a url',
  ])('rejects unsafe page %s', (raw) => expect(iconPage(raw)).toBeNull());
  it('resolves relative assets and rejects insecure downgrades', () => {
    expect(
      assetUrl('../icon.png', 'https://example.com/app/manifest.json'),
    ).toBe('https://example.com/icon.png');
    expect(assetUrl('//cdn.example.net/icon.svg', 'https://example.com/')).toBe(
      'https://cdn.example.net/icon.svg',
    );
    expect(
      assetUrl('http://example.com/icon.png', 'https://example.com/'),
    ).toBeNull();
    expect(assetUrl('data:image/svg+xml,x', 'https://example.com/')).toBeNull();
  });
  it('reads dimensions defensively', () => {
    expect(declaredSize('32x32 512x512 128x64 any')).toBe(512);
    expect(declaredSize('any broken -1x3')).toBe(0);
    expect(declaredSize('999999x999999')).toBe(4096);
  });
  it('validates manifest arrays and purpose without trusting declared dimensions', () => {
    const icons = manifestIcons(
      {
        icons: [
          null,
          {},
          { src: 'javascript:x' },
          { src: '../512.png', sizes: '512x512', purpose: 'any maskable' },
        ],
      },
      'https://example.com/pwa/app.json',
    );
    expect(icons).toEqual([
      candidate({
        url: 'https://example.com/512.png',
        source: 'manifest',
        sizes: 512,
        type: '',
        purpose: ['any', 'maskable'],
      }),
    ]);
    expect(manifestIcons({ icons: {} }, 'https://example.com/')).toEqual([]);
  });
  it('deduplicates candidates while keeping the most descriptive source', () => {
    const icons = candidatesForPage([
      candidate(),
      candidate({ source: 'manifest', sizes: 512 }),
      candidate({
        url: 'https://example.com/vector.svg',
        type: 'image/svg+xml',
      }),
    ]);
    expect(icons).toHaveLength(2);
    expect(icons.find((c) => c.url.endsWith('.png'))?.source).toBe('manifest');
  });
});
describe('quality ranking', () => {
  it('keeps a raster alternative when many SVG declarations compete', () => {
    const selected = selectCandidates([
      ...Array.from({ length: 12 }, (_, i) =>
        candidate({
          url: `https://example.com/${i}.svg`,
          type: 'image/svg+xml',
        }),
      ),
      candidate({ sizes: 192 }),
    ]);
    expect(selected).toHaveLength(8);
    expect(selected.some((c) => c.url.endsWith('.png'))).toBe(true);
  });
  it('reads oversized PNG headers before image decoding', () => {
    const bytes = new Uint8Array(24),
      view = new DataView(bytes.buffer);
    view.setUint32(16, 100000);
    view.setUint32(20, 100000);
    expect(rasterDimensions(bytes, 'image/png')).toEqual([100000, 100000]);
    expect(rasterDimensions(new Uint8Array(3), 'image/png')).toBeNull();
  });
  it('prefers full-color SVG to a large PNG', () =>
    expect(
      rankIcon(
        candidate({ type: 'image/svg+xml' }),
        quality(64, { vector: true }),
      ),
    ).toBeGreaterThan(
      rankIcon(candidate({ source: 'manifest' }), quality(512)),
    ));
  it('prefers 512 and 192 PWA assets to 32px icons', () => {
    expect(
      rankIcon(candidate({ source: 'manifest' }), quality(512)),
    ).toBeGreaterThan(
      rankIcon(candidate({ source: 'manifest' }), quality(192)),
    );
    expect(
      rankIcon(candidate({ source: 'manifest' }), quality(192)),
    ).toBeGreaterThan(rankIcon(candidate(), quality(32)));
  });
  it('does not trust a false 512px declaration', () =>
    expect(
      rankIcon(candidate({ source: 'apple' }), quality(180)),
    ).toBeGreaterThan(
      rankIcon(candidate({ source: 'manifest', sizes: 512 }), quality(16)),
    ));
  it('penalizes monochrome-only and maskable-only candidates', () => {
    expect(
      rankIcon(
        candidate({ purpose: ['monochrome'] }),
        quality(512, { vector: true, monochrome: true }),
      ),
    ).toBeLessThan(rankIcon(candidate(), quality(180)));
    expect(
      rankIcon(candidate({ purpose: ['maskable'] }), quality(512)),
    ).toBeLessThan(rankIcon(candidate(), quality(512)));
    expect(
      rankIcon(candidate({ purpose: ['any', 'maskable'] }), quality(512)),
    ).toBe(rankIcon(candidate(), quality(512)));
  });
  it('penalizes aspect ratio, excessive padding, and repeated-edge upscale artifacts', () => {
    const good = rankIcon(candidate(), quality(192));
    expect(rankIcon(candidate(), quality(512, { height: 128 }))).toBeLessThan(
      good,
    );
    expect(
      rankIcon(candidate(), quality(512, { coverage: 0.05 })),
    ).toBeLessThan(good);
    expect(rankIcon(candidate(), quality(512, { detail: 0.5 }))).toBeLessThan(
      good,
    );
  });
  it('measures transparent padding and detects empty icons', () => {
    const pixels = new Uint8ClampedArray(16 * 16 * 4);
    expect(pixelQuality(pixels, 16, 16).coverage).toBe(0);
    for (let y = 4; y < 12; y++)
      for (let x = 4; x < 12; x++) {
        const i = (y * 16 + x) * 4;
        pixels[i] = 255;
        pixels[i + 3] = 255;
      }
    expect(pixelQuality(pixels, 16, 16)).toMatchObject({
      coverage: 0.25,
      transparency: 0.75,
      monochrome: false,
    });
  });
});
describe('bounded networking and freshness', () => {
  it('uses a 14 day success cache and a 1 day negative cache', () => {
    expect(SUCCESS_TTL).toBe(14 * 86400_000);
    expect(FAILURE_TTL).toBe(86400_000);
    expect(
      freshIcon(
        { ...EMPTY_QUALITY, key: 'a', updatedAt: 0, expiresAt: 100 },
        99,
      ),
    ).toBe(true);
    expect(
      freshIcon(
        { ...EMPTY_QUALITY, key: 'a', updatedAt: 0, expiresAt: 100 },
        100,
      ),
    ).toBe(false);
    expect(freshIcon(undefined)).toBe(false);
  });
  it('limits concurrent work even after failures', async () => {
    const run = limiter(2);
    let active = 0,
      peak = 0;
    await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        run(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 2));
          active--;
          if (i % 2) throw new Error('fixture');
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(await run(async () => 'available')).toBe('available');
  });
  it('omits cookies/referrer and enforces response-size limits', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response('hello', { headers: { 'Content-Type': 'text/plain' } }),
    );
    vi.stubGlobal('fetch', fetcher);
    expect(
      (await fetchIconResource('https://example.com/', 8, 'text/html')).bytes,
    ).toHaveLength(5);
    expect(fetcher.mock.calls[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        }),
      ]),
    );
    await expect(
      fetchIconResource('https://example.com/', 3, 'text/html'),
    ).rejects.toThrow('too large');
  });
  it('rejects HTTP errors, oversized declarations, and insecure redirects', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 403 }));
    await expect(
      fetchIconResource('https://example.com/', 8, 'text/html'),
    ).rejects.toThrow();
    vi.stubGlobal(
      'fetch',
      async () => new Response('x', { headers: { 'content-length': '99' } }),
    );
    await expect(
      fetchIconResource('https://example.com/', 8, 'text/html'),
    ).rejects.toThrow('too large');
    const redirected = new Response('x');
    Object.defineProperty(redirected, 'url', {
      value: 'http://other.example/',
    });
    vi.stubGlobal('fetch', async () => redirected);
    await expect(
      fetchIconResource('https://example.com/', 8, 'text/html'),
    ).rejects.toThrow();
  });
  it('reads only a bounded HTML prefix from large pages instead of discarding useful head metadata', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('123456789', { headers: { 'content-length': '9' } }),
    );
    const page = await fetchIconResource(
      'https://example.com/',
      4,
      'text/html',
      undefined,
      true,
    );
    expect(new TextDecoder().decode(page.bytes)).toBe('1234');
  });
});
