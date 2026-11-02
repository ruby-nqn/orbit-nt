import { assetUrl, iconPage, limiter } from './policy';
const networkSlot = limiter(4);
export async function fetchIconResource(
  url: string,
  limit: number,
  accept: string,
  signal?: AbortSignal,
  allowPrefix = false,
) {
  return networkSlot(async () => {
    if (!iconPage(url)) throw new Error('Unsupported icon URL');
    const abort = new AbortController();
    const cancel = () => abort.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) abort.abort();
    const timeout = setTimeout(cancel, 6500);
    try {
      const response = await fetch(url, {
        signal: abort.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'follow',
        headers: { Accept: accept },
      });
      if (!response.ok || !assetUrl(response.url || url, url) || !response.body)
        throw new Error('Inaccessible icon resource');
      if (
        !allowPrefix &&
        Number(response.headers.get('content-length')) > limit
      ) {
        await response.body.cancel();
        throw new Error('Resource too large');
      }
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (total + value.byteLength > limit) {
            if (allowPrefix) {
              chunks.push(value.slice(0, limit - total));
              total = limit;
              await reader.cancel();
              break;
            }
            await reader.cancel();
            throw new Error('Resource too large');
          }
          total += value.byteLength;
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return {
        bytes,
        type: (response.headers.get('content-type') ?? '')
          .split(';')[0]
          .trim()
          .toLowerCase(),
        url: response.url || url,
      };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
    }
  });
}
