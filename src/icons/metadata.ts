import {
  assetUrl,
  declaredSize,
  preliminaryScore,
  type Candidate,
} from './policy';

export function htmlIcons(html: string, documentUrl: string) {
  // An inert template avoids passive image/iframe loads. Never insert it in a live DOM.
  const doc = document.implementation.createHTMLDocument('');
  const template = doc.createElement('template');
  template.innerHTML = html;
  const root = template.content;
  const base =
    assetUrl(
      root.querySelector('base[href]')?.getAttribute('href') ?? '',
      documentUrl,
    ) ?? documentUrl;
  const candidates: Candidate[] = [],
    manifests: string[] = [];
  for (const link of [...root.querySelectorAll('link[rel][href]')].slice(
    0,
    256,
  )) {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
    const url = assetUrl(link.getAttribute('href')!, base);
    if (!url) continue;
    if (rel.includes('manifest')) {
      manifests.push(url);
      continue;
    }
    if (
      !rel.some((r) =>
        ['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed'].includes(
          r,
        ),
      )
    )
      continue;
    candidates.push({
      url,
      source: rel.some((r) => r.startsWith('apple-touch')) ? 'apple' : 'icon',
      sizes: declaredSize(link.getAttribute('sizes') ?? ''),
      type: (link.getAttribute('type') ?? '').toLowerCase(),
      purpose: ['any'],
    });
  }
  return { candidates, manifests: [...new Set(manifests)].slice(0, 2) };
}
export function manifestIcons(raw: unknown, manifestUrl: string): Candidate[] {
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('icons' in raw) ||
    !Array.isArray(raw.icons)
  )
    return [];
  return raw.icons.slice(0, 64).flatMap((icon: unknown): Candidate[] => {
    if (
      !icon ||
      typeof icon !== 'object' ||
      !('src' in icon) ||
      typeof icon.src !== 'string'
    )
      return [];
    const url = assetUrl(icon.src, manifestUrl);
    if (!url) return [];
    const value = icon as Record<string, unknown>;
    return [
      {
        url,
        source: 'manifest',
        sizes: declaredSize(typeof value.sizes === 'string' ? value.sizes : ''),
        type: typeof value.type === 'string' ? value.type.toLowerCase() : '',
        purpose:
          typeof value.purpose === 'string'
            ? value.purpose.toLowerCase().split(/\s+/)
            : ['any'],
      },
    ];
  });
}
export function candidatesForPage(candidates: Candidate[]): Candidate[] {
  const unique = new Map<string, Candidate>();
  for (const c of candidates) {
    const previous = unique.get(c.url);
    if (!previous || preliminaryScore(c) > preliminaryScore(previous))
      unique.set(c.url, c);
  }
  return [...unique.values()].sort(
    (a, b) => preliminaryScore(b) - preliminaryScore(a),
  );
}
export function selectCandidates(candidates: Candidate[]): Candidate[] {
  const sorted = candidatesForPage(candidates),
    selected = sorted.slice(0, 8);
  // A series of broken SVGs or monochrome variants must not starve full-color raster icons.
  const raster = sorted.find(
    (c) =>
      c.type !== 'image/svg+xml' &&
      !/\.svg(?:\?|$)/i.test(c.url) &&
      (!c.purpose.includes('monochrome') || c.purpose.includes('any')),
  );
  if (raster && !selected.includes(raster))
    selected[selected.length - 1] = raster;
  return selected;
}
export const conventionalIcons = (page: string): Candidate[] =>
  [
    '/apple-touch-icon.png',
    '/favicon.svg',
    '/favicon-192x192.png',
    '/favicon.ico',
  ].map((path) => ({
    url: new URL(path, page).href,
    source: 'conventional',
    sizes: 0,
    type: '',
    purpose: ['any'],
  }));
