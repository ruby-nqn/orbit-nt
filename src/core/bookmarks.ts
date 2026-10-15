import { canonicalUrl, domainOf, safeUrl } from './urls';
import { activityScore, diameter } from './scoring';
import { EMPTY_ACTIVITY } from './types';
import { bookmarkFolderColor, visibleFolderPath } from './folders';
import type {
  ActivityCache,
  Bookmark,
  BookmarkSnapshot,
  BubbleEntry,
  Preferences,
} from './types';
export interface BookmarkNode {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkNode[];
}
export function flattenBookmarks(
  tree: BookmarkNode[],
  now = Date.now(),
): BookmarkSnapshot {
  const bookmarks: Bookmark[] = [],
    folders: BookmarkSnapshot['folders'] = [];
  let blocked = 0;
  const walk = (nodes: BookmarkNode[], ancestors: string[], depth: number) => {
    for (const node of nodes) {
      if (node.url) {
        const url = safeUrl(node.url),
          canonical = canonicalUrl(node.url);
        if (url && canonical)
          bookmarks.push({
            id: node.id,
            title: node.title || domainOf(url),
            url,
            canonical,
            domain: domainOf(url),
            ancestors,
          });
        else blocked++;
      } else {
        const start = bookmarks.length;
        const folder = {
          id: node.id,
          title: node.title || 'Bookmarks',
          depth: Math.max(0, depth - 1),
          count: 0,
        };
        if (node.id !== '0') folders.push(folder);
        walk(node.children ?? [], [...ancestors, node.id], depth + 1);
        folder.count = bookmarks.length - start;
      }
    }
  };
  walk(tree, [], 0);
  return { bookmarks, folders, updatedAt: now, blocked };
}
export function libraryBookmarks(
  bookmarks: Bookmark[],
  prefs: Preferences,
): Bookmark[] {
  const folders = new Set(prefs.settings.folderIds),
    hidden = new Set(prefs.settings.hiddenIds);
  return bookmarks.filter(
    (b) => b.ancestors.some((id) => folders.has(id)) && !hidden.has(b.id),
  );
}
export function eligibleBookmarks(
  bookmarks: Bookmark[],
  prefs: Preferences,
  now = Date.now(),
): Bookmark[] {
  return libraryBookmarks(bookmarks, prefs).filter((b) =>
    visibleFolderPath(b.ancestors, prefs.settings, now),
  );
}
export function activityKey(bookmarks: Bookmark[], grouping: boolean): string {
  // Full deterministic signature avoids stale cache reuse after folder/URL changes.
  return `${grouping ? 'domain' : 'exact'}:${JSON.stringify([...new Set(bookmarks.map((b) => (grouping ? b.domain : b.canonical)))].sort())}`;
}
export function createEntries(
  bookmarks: Bookmark[],
  prefs: Preferences,
  cache?: ActivityCache,
): BubbleEntry[] {
  const groups = new Map<string, Bookmark[]>();
  for (const b of bookmarks) {
    const id = prefs.settings.grouping ? `domain:${b.domain}` : b.id;
    groups.set(id, [...(groups.get(id) ?? []), b]);
  }
  return [...groups.entries()].map(([id, members]) => {
    const first = members[0],
      override = prefs.overrides[id] ?? {};
    const activity =
      (prefs.settings.grouping
        ? cache?.domains[first.domain]
        : cache?.entries[first.canonical]) ?? EMPTY_ACTIVITY;
    const score = activityScore(
      activity,
      prefs.settings.mode,
      prefs.settings.weights,
    );
    return {
      id,
      members,
      title: prefs.settings.grouping
        ? first.domain.replace(/^www\./, '')
        : first.title,
      url: first.url,
      domain: first.domain,
      activity,
      score,
      size: diameter(score, prefs.settings, override.size),
      pinned: !!override.pinned,
      color: override.color,
      folderColor: bookmarkFolderColor(first, prefs.settings.folderRules),
    };
  });
}
