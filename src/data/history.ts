import { activityKey } from '../core/bookmarks';
import { canonicalUrl, domainOf } from '../core/urls';
import { addActivity, countVisits, dayStart } from '../core/scoring';
import { EMPTY_ACTIVITY } from '../core/types';
import type { Activity, ActivityCache, Bookmark } from '../core/types';
export interface HistorySource {
  search(
    query: chrome.history.HistoryQuery,
  ): Promise<chrome.history.HistoryItem[]>;
  getVisits(details: { url: string }): Promise<chrome.history.VisitItem[]>;
}
export const HISTORY_LIMIT = 5000;
export function cacheUsable(
  cache: ActivityCache | undefined,
  key: string,
  revision: string,
  now: number,
): boolean {
  return (
    !!cache &&
    cache.key === key &&
    cache.revision === revision &&
    cache.day === dayStart(now) &&
    now - cache.updatedAt >= 0 &&
    now - cache.updatedAt < 15 * 60_000
  );
}
export async function collectActivity(
  source: HistorySource,
  bookmarks: Bookmark[],
  grouping: boolean,
  revision: string,
  now = Date.now(),
): Promise<ActivityCache> {
  const cache: ActivityCache = {
    key: activityKey(bookmarks, grouping),
    day: dayStart(now),
    updatedAt: now,
    revision,
    entries: {},
    domains: {},
    status: 'ready',
  };
  const exact = new Set(bookmarks.map((b) => b.canonical)),
    domains = new Set(bookmarks.map((b) => b.domain));
  if (!bookmarks.length) return cache;
  try {
    const items = await source.search({
      text: '',
      startTime: dayStart(now, 6),
      endTime: now,
      maxResults: HISTORY_LIMIT,
    });
    if (items.length >= HISTORY_LIMIT) {
      cache.status = 'partial';
      cache.message =
        'History reached the 5,000 recent URL limit. Counts may be incomplete.';
    }
    // Query only relevant URLs returned by search, in the exact format the API requires.
    const urls = [
      ...new Set(
        items.flatMap((item) => {
          if (!item.url) return [];
          const key = canonicalUrl(item.url);
          return key &&
            (grouping ? domains.has(domainOf(item.url)) : exact.has(key))
            ? [item.url]
            : [];
        }),
      ),
    ];
    const records = new Map<string, chrome.history.VisitItem[]>();
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(8, urls.length) }, async () => {
        while (cursor < urls.length) {
          const url = urls[cursor++];
          try {
            records.set(url, await source.getVisits({ url }));
          } catch {
            cache.status = 'partial';
            cache.message =
              'Some visit details were unavailable. Available visits are shown.';
          }
        }
      }),
    );
    // Deduplicate visit IDs across aliases before aggregating. Duplicate bookmarks read
    // one canonical count; they never cause history to be counted multiple times.
    const seen = new Set<string>();
    for (const [url, visits] of records) {
      const activity = countVisits(
        visits.filter((v) => {
          if (seen.has(v.visitId)) return false;
          seen.add(v.visitId);
          return true;
        }),
        now,
      );
      const key = canonicalUrl(url)!;
      cache.entries[key] = addActivity(
        cache.entries[key] ?? EMPTY_ACTIVITY,
        activity,
      );
      const domain = domainOf(url);
      cache.domains[domain] = addActivity(
        cache.domains[domain] ?? EMPTY_ACTIVITY,
        activity,
      );
    }
    return cache;
  } catch {
    return {
      ...cache,
      status: 'unavailable',
      message:
        'History is unavailable in this browser context. Bookmarks use their minimum size.',
    };
  }
}
export function activityTotal(entries: Record<string, Activity>): number {
  return Object.values(entries).reduce(
    (sum, a) => sum + a.today + a.previous2 + a.previous4,
    0,
  );
}
