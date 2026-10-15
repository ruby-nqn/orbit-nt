import {
  activityKey,
  libraryBookmarks,
  flattenBookmarks,
} from './core/bookmarks';
import { cacheUsable, collectActivity } from './data/history';
import { readLocal, readPreferences } from './data/storage';
import type { Snapshot } from './data/storage';
import { canonicalUrl, domainOf } from './core/urls';
import { chooseQuote, validateQuoteList } from './core/quotes';
const token = () => `${Date.now()}:${crypto.randomUUID()}`;
const invalidateHistory = () => {
  void chrome.storage.local.set({ historyRevision: token() });
};
const invalidateBookmarks = () => {
  void chrome.storage.local.set({ bookmarkRevision: token() });
};
// Register listeners synchronously so each event can wake a suspended MV3 worker.
chrome.history.onVisited.addListener((item) => {
  const canonical = item.url ? canonicalUrl(item.url) : null;
  if (!canonical) return;
  void readLocal().then((stored) => {
    if (!stored.bookmarkCache) {
      invalidateHistory();
      return;
    }
    const prefs = readPreferences(stored.preferences);
    const selected = libraryBookmarks(stored.bookmarkCache.bookmarks, prefs);
    if (
      selected.some((b) =>
        prefs.settings.grouping
          ? b.domain === domainOf(canonical)
          : b.canonical === canonical,
      )
    )
      invalidateHistory();
  });
});
chrome.history.onVisitRemoved.addListener(() => {
  // Remove derived counts immediately; never retain deleted history in the cache.
  void chrome.storage.local.remove('activityCache');
  invalidateHistory();
});
chrome.bookmarks.onCreated.addListener(invalidateBookmarks);
chrome.bookmarks.onRemoved.addListener(invalidateBookmarks);
chrome.bookmarks.onChanged.addListener(invalidateBookmarks);
chrome.bookmarks.onMoved.addListener(invalidateBookmarks);
chrome.bookmarks.onChildrenReordered.addListener(invalidateBookmarks);
chrome.bookmarks.onImportEnded.addListener(invalidateBookmarks);
chrome.runtime.onInstalled.addListener(() => {
  invalidateHistory();
  invalidateBookmarks();
});
chrome.runtime.onStartup.addListener(() => {
  invalidateHistory();
  invalidateBookmarks();
});
let inFlight: Promise<Snapshot> | undefined;
// Serialize small quote requests across new tabs; the last text survives worker restarts.
let quoteQueue = Promise.resolve();
async function snapshot(force: boolean): Promise<Snapshot> {
  const stored = await readLocal(),
    prefs = readPreferences(stored.preferences);
  const bookmarks = flattenBookmarks(await chrome.bookmarks.getTree());
  await chrome.storage.local.set({ bookmarkCache: bookmarks });
  const selected = libraryBookmarks(bookmarks.bookmarks, prefs);
  const revision = stored.historyRevision ?? '',
    key = activityKey(selected, prefs.settings.grouping);
  let activity = stored.activityCache;
  if (force || !cacheUsable(activity, key, revision, Date.now())) {
    activity = await collectActivity(
      chrome.history,
      selected,
      prefs.settings.grouping,
      revision,
    );
    const latest = await readLocal();
    const latestPrefs = readPreferences(latest.preferences);
    // An event or settings change during a scan cannot mark older data as current.
    if (
      (latest.historyRevision ?? '') === revision &&
      activityKey(
        libraryBookmarks(bookmarks.bookmarks, latestPrefs),
        latestPrefs.settings.grouping,
      ) === key
    ) {
      await chrome.storage.local.set({ activityCache: activity });
    }
  }
  return { bookmarks, activity: activity! };
}
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    !message ||
    typeof message !== 'object'
  )
    return false;
  const { type, force } = message as { type?: string; force?: boolean };
  if (type === 'nextHeaderQuote') {
    quoteQueue = quoteQueue
      .then(async () => {
        const pool = validateQuoteList(
          (message as { quotes?: unknown }).quotes,
          200,
        );
        const stored = await chrome.storage.local.get('lastHeaderQuote');
        const quote = chooseQuote(
          pool,
          typeof stored.lastHeaderQuote === 'string'
            ? stored.lastHeaderQuote
            : undefined,
        );
        await chrome.storage.local.set({ lastHeaderQuote: quote });
        respond({ quote });
      })
      .catch(() => respond({ error: 'Could not choose a header quote.' }));
    return true;
  }
  if (type === 'clearActivity') {
    void (async () => {
      await chrome.storage.local.remove('activityCache');
      await chrome.storage.local.set({ historyRevision: token() });
    })().then(
      () => respond({ ok: true }),
      () => respond({ error: 'Could not clear the local cache.' }),
    );
    return true;
  }
  if (type !== 'snapshot') return false;
  // Coalesce requests from several new tabs. Persistent caches, not this variable,
  // provide correctness after the worker is suspended or the browser restarts.
  if (!inFlight)
    inFlight = snapshot(!!force).finally(() => {
      inFlight = undefined;
    });
  void inFlight.then(
    (data) => respond({ data }),
    (error: unknown) =>
      respond({
        error:
          error instanceof Error
            ? error.message
            : 'Could not read browser data.',
      }),
  );
  return true;
});
