import {
  invalidateIconAsset,
  readIconAsset,
  readIconRecord,
  writeIcon,
  pruneIcons,
} from './cache';
import { decodeIcon } from './images';
import {
  selectCandidates,
  conventionalIcons,
  htmlIcons,
  manifestIcons,
} from './metadata';
import { fetchIconResource } from './network';
import {
  EMPTY_QUALITY,
  FAILURE_TTL,
  SUCCESS_TTL,
  freshIcon,
  iconPage,
  limiter,
  rankIcon,
  type Candidate,
  type IconRecord,
} from './policy';

const jobSlot = limiter(2);
const jobs = new Map<string, Promise<IconRecord>>();
const assetJobs = new Map<string, ReturnType<typeof loadAsset>>();
const rootJobs = new Map<string, Promise<Candidate[]>>();
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
async function metadata(
  url: string,
  signal: AbortSignal,
): Promise<Candidate[]> {
  const page = await fetchIconResource(
    url,
    768_000,
    'text/html,application/xhtml+xml',
    signal,
    true,
  );
  // Login/cross-site landing pages often advertise the wrong brand.
  if (
    new URL(page.url).hostname.replace(/^www\./, '') !==
      new URL(url).hostname.replace(/^www\./, '') ||
    !['text/html', 'application/xhtml+xml'].includes(page.type)
  )
    return [];
  const found = htmlIcons(text(page.bytes), page.url);
  for (const manifest of found.manifests) {
    try {
      const response = await fetchIconResource(
        manifest,
        192_000,
        'application/manifest+json,application/json',
        signal,
      );
      if (response.type.includes('json') || response.type === 'text/plain')
        found.candidates.push(
          ...manifestIcons(JSON.parse(text(response.bytes)), response.url),
        );
    } catch {
      /* A broken manifest must not hide the HTML icons. */
    }
  }
  return found.candidates;
}
async function loadAsset(candidate: Candidate, signal: AbortSignal) {
  const cached = await readIconAsset(candidate.url).catch(() => undefined);
  if (cached && cached.updatedAt + SUCCESS_TTL > Date.now()) {
    try {
      return await decodeIcon(
        new Uint8Array(await cached.blob.arrayBuffer()),
        cached.blob.type,
      );
    } catch {
      await invalidateIconAsset(candidate.url).catch(() => undefined);
    }
  }
  const response = await fetchIconResource(
    candidate.url,
    2_000_000,
    'image/svg+xml,image/png,image/*;q=0.9',
    signal,
  );
  return decodeIcon(response.bytes, response.type);
}
async function resolvePage(key: string): Promise<IconRecord> {
  const previous = await readIconRecord(key).catch(() => undefined);
  const previousAsset = previous?.asset
    ? await readIconAsset(previous.asset).catch(() => undefined)
    : undefined;
  if (freshIcon(previous) && (!previous?.asset || previousAsset))
    return previous!;
  const controller = new AbortController(),
    deadline = setTimeout(() => controller.abort(), 25_000);
  const signal = controller.signal;
  let best:
    | {
        candidate: Candidate;
        blob: Blob;
        quality: Awaited<ReturnType<typeof decodeIcon>>['quality'];
        score: number;
      }
    | undefined;
  try {
    let candidates: Candidate[] = [];
    try {
      candidates = await metadata(key, signal);
    } catch {
      /* Offline, restricted, or authenticated. */
    }
    const origin = new URL(key).origin + '/';
    // Only fall back to origin metadata when the exact page declares no icons.
    if (!candidates.length && key !== origin && !signal.aborted) {
      let root = rootJobs.get(origin);
      if (!root) {
        root = metadata(origin, signal).catch(() => []);
        rootJobs.set(origin, root);
        // Coalesce work in a batch without treating metadata as permanently fresh.
        setTimeout(() => rootJobs.delete(origin), 60_000);
      }
      candidates = await root;
    }
    const declared = selectCandidates(candidates);
    const tried = new Set<string>();
    const inspect = async (candidate: Candidate) => {
      if (signal.aborted || tried.has(candidate.url)) return;
      tried.add(candidate.url);
      try {
        let job = assetJobs.get(candidate.url);
        if (!job) {
          job = loadAsset(candidate, signal);
          assetJobs.set(candidate.url, job);
          // Keep a bounded recent batch, rather than retaining every decoded candidate.
          void job
            .finally(() => {
              if (assetJobs.size > 64) assetJobs.delete(candidate.url);
            })
            .catch(() => undefined);
          setTimeout(() => {
            if (assetJobs.get(candidate.url) === job)
              assetJobs.delete(candidate.url);
          }, 60_000);
        }
        const image = await job;
        const score = rankIcon(candidate, image.quality);
        if (!best || score > best.score) best = { candidate, ...image, score };
      } catch {
        /* A single bad candidate never aborts discovery. */
      }
    };
    for (let i = 0; i < declared.length; i += 2)
      await Promise.all(declared.slice(i, i + 2).map(inspect));
    if (!best || best.score < 63) {
      const common = conventionalIcons(key);
      for (let i = 0; i < common.length; i += 2)
        await Promise.all(common.slice(i, i + 2).map(inspect));
    }
    const now = Date.now();
    // Keep known-good bytes offline, retry tomorrow rather than replacing them with initials.
    const result: IconRecord = best
      ? {
          key,
          asset: best.candidate.url,
          iconUrl: best.candidate.url,
          source: best.candidate.source,
          ...best.quality,
          updatedAt: now,
          expiresAt: now + SUCCESS_TTL,
        }
      : previous?.asset && previousAsset
        ? { ...previous, expiresAt: now + FAILURE_TTL }
        : {
            key,
            ...EMPTY_QUALITY,
            updatedAt: now,
            expiresAt: now + FAILURE_TTL,
          };
    await writeIcon(result, best?.blob).catch(() => undefined);
    // Complete cleanup before the worker closes the temporary document. Negative
    // entries must also stay bounded when every site in a library is inaccessible.
    await pruneIcons().catch(() => undefined);
    return result;
  } finally {
    clearTimeout(deadline);
  }
}
export function resolveIcon(raw: string): Promise<IconRecord> {
  const key = iconPage(raw);
  if (!key) return Promise.reject(new Error('Unsupported website'));
  let job = jobs.get(key);
  if (!job) {
    job = jobSlot(() => resolvePage(key)).finally(() => jobs.delete(key));
    jobs.set(key, job);
  }
  return job;
}
