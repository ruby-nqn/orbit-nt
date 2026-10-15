const PROTOCOLS = new Set([
  'http:',
  'https:',
  'file:',
  'ftp:',
  'chrome:',
  'vivaldi:',
  'edge:',
  'about:',
]);
export function safeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
// Keep path case, trailing path slashes, scheme, query order and every query parameter.
// URL handles host case, default ports and dot segments. Fragments aren't separate pages.
export function canonicalUrl(raw: string): string | null {
  const safe = safeUrl(raw);
  if (!safe) return null;
  const url = new URL(safe);
  url.hash = '';
  return url.href;
}
export function domainOf(raw: string): string {
  try {
    const url = new URL(raw);
    return url.host || url.protocol.replace(':', '');
  } catch {
    return raw;
  }
}
export function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++)
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}
