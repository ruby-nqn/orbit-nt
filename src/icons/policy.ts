/** No site-specific rules: exact pages keep their branding; assets can be shared. */
export type IconSource = 'manifest' | 'apple' | 'icon' | 'conventional';
export interface Candidate {
  url: string;
  source: IconSource;
  sizes: number;
  type: string;
  purpose: string[];
}
export interface IconQuality {
  width: number;
  height: number;
  vector: boolean;
  coverage: number;
  transparency: number;
  monochrome: boolean;
  detail: number;
}
export interface IconRecord extends IconQuality {
  key: string;
  asset?: string;
  source?: IconSource;
  iconUrl?: string;
  updatedAt: number;
  expiresAt: number;
}
export const SUCCESS_TTL = 14 * 86400_000;
export const FAILURE_TTL = 86400_000;
export const EMPTY_QUALITY: IconQuality = {
  width: 0,
  height: 0,
  vector: false,
  coverage: 1,
  transparency: 0,
  monochrome: false,
  detail: 1,
};
export function iconPage(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      raw.length > 8192
    )
      return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}
export function assetUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    if (new URL(base).protocol === 'https:' && url.protocol !== 'https:')
      return null;
    return iconPage(url.href);
  } catch {
    return null;
  }
}
export function declaredSize(raw: string): number {
  return Math.max(
    0,
    ...raw.split(/\s+/).map((size) => {
      const match = /^(\d+)x(\d+)$/i.exec(size);
      return match ? Math.min(4096, +match[1], +match[2]) : 0;
    }),
  );
}
export function preliminaryScore(c: Candidate): number {
  return (
    (c.type === 'image/svg+xml' || /\.svg(?:\?|$)/i.test(c.url) ? 50 : 0) +
    Math.min(c.sizes, 512) / 12 +
    { manifest: 25, apple: 18, icon: 10, conventional: 0 }[c.source] -
    (c.purpose.includes('monochrome') && !c.purpose.includes('any') ? 60 : 0)
  );
}
export function rankIcon(c: Candidate, q: IconQuality, target = 192): number {
  const effective = Math.min(q.width, q.height) * Math.sqrt(q.coverage);
  const resolution = q.vector
    ? 58
    : 48 * Math.min(1, effective / target) +
      8 * Math.log2(1 + Math.min(effective, 512) / 192);
  const ratio = Math.min(q.width, q.height) / Math.max(q.width, q.height);
  const mono = c.purpose.includes('monochrome') && !c.purpose.includes('any');
  return (
    resolution +
    (q.vector && !q.monochrome && !mono ? 28 : 0) +
    { manifest: 18, apple: 12, icon: 8, conventional: 0 }[c.source] -
    (1 - ratio) * 65 -
    (1 - q.coverage) * 20 -
    (1 - q.detail) * 35 -
    (mono ? 65 : 0) -
    (c.purpose.includes('maskable') && !c.purpose.includes('any') ? 12 : 0)
  );
}
export const freshIcon = (r: IconRecord | undefined, now = Date.now()) =>
  !!r && r.expiresAt > now;

/** Shared limiter, also used for metadata and asset requests. */
export function limiter(max: number) {
  let active = 0;
  const waiters: (() => void)[] = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= max)
      await new Promise<void>((resolve) => waiters.push(resolve));
    else active++;
    try {
      return await work();
    } finally {
      const next = waiters.shift();
      if (next) next();
      else active--;
    }
  };
}
