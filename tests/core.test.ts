import { describe, expect, it } from 'vitest';
import {
  activityScore,
  countVisits,
  dayStart,
  diameter,
  normalizeScore,
  weightsFor,
  windowVisits,
} from '../src/core/scoring';
import { canonicalUrl, safeUrl } from '../src/core/urls';
import {
  createEntries,
  eligibleBookmarks,
  flattenBookmarks,
  type BookmarkNode,
} from '../src/core/bookmarks';
import {
  defaultPreferences,
  exportPreferences,
  importPreferences,
  validatePreferences,
  validateSettings,
} from '../src/core/settings';
import { layoutBubbles } from '../src/core/layout';
import type { ActivityCache, BubbleEntry } from '../src/core/types';
const tree = (
  children: BookmarkNode[] = [
    { id: 'a', title: 'A', url: 'https://example.com' },
  ],
): BookmarkNode[] => [
  { id: '0', title: '', children: [{ id: '1', title: 'Favorites', children }] },
];
const emptyCache = (): ActivityCache => ({
  key: '',
  day: 0,
  updatedAt: 0,
  revision: '',
  entries: {},
  domains: {},
  status: 'ready',
});
const prefs = () => {
  const p = defaultPreferences();
  p.settings.folderIds = ['1'];
  return p;
};
describe('local calendar activity and scoring', () => {
  const now = new Date(2026, 9, 14, 12).getTime();
  it('uses midnight boundaries across today, previous two and previous four days', () => {
    const visits = [
      now,
      dayStart(now),
      dayStart(now) - 1,
      dayStart(now, 2),
      dayStart(now, 2) - 1,
      dayStart(now, 6),
      dayStart(now, 6) - 1,
      now + 1,
    ].map((visitTime, i) => ({ visitTime, visitId: String(i) }));
    expect(countVisits(visits, now)).toEqual({
      today: 2,
      previous2: 2,
      previous4: 2,
    });
  });
  it('counts actual visits, excluding subframes, duplicates and missing timestamps', () => {
    expect(
      countVisits(
        [
          { visitId: '1', visitTime: now },
          { visitId: '1', visitTime: now },
          { visitTime: now, transition: 'auto_subframe' },
          { visitTime: now, transition: 'manual_subframe' },
          {},
        ],
        now,
      ),
    ).toEqual({ today: 1, previous2: 0, previous4: 0 });
  });
  it('uses local date arithmetic instead of subtracting 24-hour blocks', () => {
    const before = new Date(dayStart(new Date(2026, 2, 10, 12).getTime(), 2));
    expect(before.getDate()).toBe(8);
    expect(before.getHours()).toBe(0);
  });
  it('implements the default formula and all preset modes', () => {
    const a = { today: 10, previous2: 20, previous4: 40 };
    expect(activityScore(a, 'seven', [1, 1, 1])).toBeCloseTo(17.5);
    expect(activityScore(a, 'today', [1, 1, 1])).toBe(10);
    expect(activityScore(a, 'three', [1, 1, 1])).toBeCloseTo(13.5);
    expect(activityScore(a, 'balanced', [1, 1, 1])).toBeCloseTo(25.5);
    expect(activityScore(a, 'custom', [2, 3, 5])).toBeCloseTo(28);
    expect(weightsFor('custom', [0, 0, 0])).toEqual([0.55, 0.3, 0.15]);
    expect(windowVisits(a, 'today')).toBe(10);
    expect(windowVisits(a, 'three')).toBe(30);
    expect(windowVisits(a, 'seven')).toBe(70);
  });
  it('handles no history and zero visits without hiding bookmarks', () => {
    expect(countVisits([], now)).toEqual({
      today: 0,
      previous2: 0,
      previous4: 0,
    });
    const b = flattenBookmarks(tree()).bookmarks,
      entries = createEntries(b, prefs());
    expect(entries).toHaveLength(1);
    expect(entries[0].size).toBe(64);
    expect(entries[0].score).toBe(0);
  });
  it('normalizes monotonically with diminishing returns and a hard bound', () => {
    expect(normalizeScore(0)).toBe(0);
    expect(normalizeScore(40)).toBe(1);
    expect(normalizeScore(1e9)).toBe(1);
    expect(normalizeScore(2) - normalizeScore(1)).toBeGreaterThan(
      normalizeScore(20) - normalizeScore(19),
    );
    expect(normalizeScore(-1)).toBe(0);
    expect(normalizeScore(NaN)).toBe(0);
  });
  it('enforces min/max, automatic resizing and fixed size bounds', () => {
    const s = defaultPreferences().settings;
    expect(diameter(0, s)).toBe(64);
    expect(diameter(1e9, s)).toBe(160);
    expect(diameter(1, s, 200)).toBe(160);
    expect(diameter(20, s, 20)).toBe(64);
    expect(diameter(9, { ...s, autoResize: false })).toBe(88);
    expect(
      diameter(2, { ...s, minSize: 90, maxSize: 100 }),
    ).toBeGreaterThanOrEqual(90);
  });
});
describe('URL matching and bookmark lifecycle', () => {
  it('normalizes hostname, default port, fragment, root slash and dot segments safely', () => {
    expect(canonicalUrl('HTTPS://EXAMPLE.COM:443#hi')).toBe(
      'https://example.com/',
    );
    expect(canonicalUrl('https://example.com/a/../b#x')).toBe(
      'https://example.com/b',
    );
    expect(canonicalUrl('https://example.com')).toBe(
      canonicalUrl('https://example.com/'),
    );
  });
  it('preserves meaningful queries, case, schemes and non-root trailing slashes', () => {
    expect(canonicalUrl('https://example.com/a?view=1')).not.toBe(
      canonicalUrl('https://example.com/a?view=2'),
    );
    expect(canonicalUrl('https://example.com/a')).not.toBe(
      canonicalUrl('https://example.com/A'),
    );
    expect(canonicalUrl('https://example.com/a/')).not.toBe(
      canonicalUrl('https://example.com/a'),
    );
    expect(canonicalUrl('https://example.com')).not.toBe(
      canonicalUrl('http://example.com'),
    );
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
    expect(safeUrl('bad url')).toBeNull();
  });
  it('preserves duplicate bookmark identities without multiplying their counts', () => {
    const b = flattenBookmarks(
      tree([
        { id: 'a', title: 'A', url: 'https://example.com' },
        { id: 'b', title: 'B', url: 'https://example.com/#section' },
      ]),
    ).bookmarks;
    const cache = {
      ...emptyCache(),
      entries: {
        'https://example.com/': { today: 3, previous2: 0, previous4: 0 },
      },
    };
    const entries = createEntries(b, prefs(), cache);
    expect(entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(entries.map((e) => e.activity.today)).toEqual([3, 3]);
    expect(entries[0].size).toBe(entries[1].size);
  });
  it('groups only in optional website mode and uses the domain aggregate once', () => {
    const b = flattenBookmarks(
      tree([
        { id: 'a', title: 'A', url: 'https://example.com/a' },
        { id: 'b', title: 'B', url: 'https://example.com/b' },
      ]),
    ).bookmarks;
    const p = prefs();
    p.settings.grouping = true;
    const entries = createEntries(b, p, {
      ...emptyCache(),
      domains: { 'example.com': { today: 9, previous2: 0, previous4: 0 } },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].members).toHaveLength(2);
    expect(entries[0].activity.today).toBe(9);
  });
  it('reflects additions, deletions, renames and folder moves using stable IDs', () => {
    const initial = flattenBookmarks(tree());
    const added = flattenBookmarks(
      tree([
        ...tree()[0].children![0].children!,
        { id: 'b', title: 'B', url: 'https://b.com' },
      ]),
    );
    expect(added.bookmarks.map((b) => b.id)).toEqual(['a', 'b']);
    const removed = flattenBookmarks(
      tree([{ id: 'b', title: 'Renamed', url: 'https://b.com' }]),
    );
    expect(removed.bookmarks).toHaveLength(1);
    expect(removed.bookmarks[0].title).toBe('Renamed');
    const moved = flattenBookmarks([
      {
        id: '0',
        title: '',
        children: [
          {
            id: '2',
            title: 'Other',
            children: tree()[0].children![0].children,
          },
        ],
      },
    ]);
    expect(initial.bookmarks[0].id).toBe(moved.bookmarks[0].id);
    expect(eligibleBookmarks(moved.bookmarks, prefs())).toHaveLength(0);
  });
  it('includes descendants, excludes hidden entries and rejects unsafe bookmarks', () => {
    const snapshot = flattenBookmarks(
      tree([
        {
          id: '2',
          title: 'Nested',
          children: [
            { id: 'a', title: 'A', url: 'https://a.com' },
            { id: 'x', title: 'Unsafe', url: 'javascript:alert(1)' },
          ],
        },
      ]),
    );
    expect(snapshot.blocked).toBe(1);
    expect(snapshot.folders.find((f) => f.id === '1')?.count).toBe(1);
    const p = prefs();
    expect(eligibleBookmarks(snapshot.bookmarks, p)).toHaveLength(1);
    p.settings.hiddenIds = ['a'];
    expect(eligibleBookmarks(snapshot.bookmarks, p)).toHaveLength(0);
  });
});
function bubbles(count: number): BubbleEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    title: String(i),
    url: 'https://example.com',
    domain: 'example.com',
    members: [],
    activity: { today: i, previous2: 0, previous4: 0 },
    score: i,
    size: 64 + (i % 96),
    pinned: false,
  }));
}
describe('collision packing and responsive overflow', () => {
  const options = {
    width: 1100,
    height: 580,
    spacing: 14,
    attraction: 45,
    physics: 50,
    positions: {},
  };
  const check = (
    result: ReturnType<typeof layoutBubbles>,
    count: number,
    width: number,
    height: number,
    spacing = 14,
  ) => {
    expect(
      new Set([...result.nodes.map((n) => n.id), ...result.overflow]).size,
    ).toBe(count);
    for (const n of result.nodes) {
      expect(n.x - n.size / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + n.size / 2).toBeLessThanOrEqual(width);
      expect(n.y - n.size / 2).toBeGreaterThanOrEqual(0);
      expect(n.y + n.size / 2).toBeLessThanOrEqual(height);
      for (const other of result.nodes) {
        if (n.id !== other.id)
          expect(
            Math.hypot(n.x - other.x, n.y - other.y) + 0.02,
          ).toBeGreaterThanOrEqual((n.size + other.size) / 2 + spacing + 8);
      }
    }
  };
  it('produces repeatable nonoverlapping resting positions for normal collections', () => {
    const entries = bubbles(30),
      result = layoutBubbles(entries, options);
    check(result, 30, 1100, 580);
    expect(result).toEqual(layoutBubbles(entries, options));
    expect(result.nodes.length).toBeGreaterThan(20);
  });
  it('gives pinned bubbles priority but resolves conflicting anchors', () => {
    const entries = bubbles(10);
    entries[0].pinned = true;
    entries[1].pinned = true;
    const result = layoutBubbles(entries, {
      ...options,
      positions: {
        '0': { x: 0.5, y: 0.5, manual: true },
        '1': { x: 0.5, y: 0.5, manual: true },
      },
    });
    check(result, 10, 1100, 580);
    expect(result.nodes.filter((n) => ['0', '1'].includes(n.id))).toHaveLength(
      2,
    );
    expect(result.nodes.find((n) => n.id === '1')?.x).toBeCloseTo(550);
  });
  it('adapts to a narrow viewport without discarding a single bookmark', () => {
    const result = layoutBubbles(bubbles(100), {
      ...options,
      width: 340,
      height: 310,
    });
    check(result, 100, 340, 310);
    expect(result.overflow.length).toBeGreaterThan(0);
    expect(result.nodes.every((n) => n.size >= 52 && n.size <= 160)).toBe(true);
  });
  it('keeps normalized manual positions near their targets after resizing', () => {
    const entries = bubbles(1),
      positions = { '0': { x: 0.25, y: 0.6, manual: true } };
    const result = layoutBubbles(entries, {
      ...options,
      width: 600,
      height: 400,
      positions,
    });
    expect(result.nodes[0].x).toBeCloseTo(150);
    expect(result.nodes[0].y).toBeCloseTo(240);
  });
  it('handles tiny and very large collections with bounded canvas work', () => {
    expect(
      layoutBubbles(bubbles(2), { ...options, width: 40 }).overflow,
    ).toHaveLength(2);
    const start = performance.now(),
      result = layoutBubbles(bubbles(5000), options);
    expect(result.nodes.length + result.overflow.length).toBe(5000);
    expect(result.nodes.length).toBeLessThanOrEqual(160);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
describe('validated persistence and portable export', () => {
  it('round-trips manual colors, fixed pins and normalized positions', () => {
    const p = prefs();
    p.overrides.a = { color: '#35c8ab', pinned: true, size: 110 };
    p.positions.a = { x: 0.2, y: 0.8, manual: true };
    expect(importPreferences(exportPreferences(p))).toEqual(p);
    const entries = createEntries(flattenBookmarks(tree()).bookmarks, p);
    expect(entries[0].color).toBe('#35c8ab');
    expect(entries[0].pinned).toBe(true);
    expect(entries[0].size).toBe(110);
  });
  it('removes overrides safely when returning to automatic colors/sizes', () => {
    const p = prefs();
    p.overrides.a = { color: undefined, size: undefined, pinned: false };
    expect(validatePreferences(p).overrides.a).toEqual({ pinned: false });
  });
  it.each([
    { minSize: 200, maxSize: 64 },
    { minSize: -1 },
    { glass: NaN },
    { mode: 'forever' },
    { weights: [0, 0, 0] },
    { backgroundImage: 'https://remote.com/img' },
    { folderIds: ['a', 1] },
  ])('rejects malformed settings %j', (bad) => {
    expect(() =>
      validateSettings({ ...defaultPreferences().settings, ...bad }),
    ).toThrow();
  });
  it('rejects malformed files, incompatible versions and dangerous data', () => {
    expect(() => importPreferences('{')).toThrow();
    expect(() => importPreferences('{"version":2}')).toThrow();
    const p = prefs();
    expect(() =>
      validatePreferences({ ...p, positions: { a: { x: 2, y: 0 } } }),
    ).toThrow();
    expect(() =>
      validatePreferences({ ...p, overrides: { a: { color: 'red' } } }),
    ).toThrow();
    expect(() =>
      importPreferences(
        '{"format":"orbit-new-tab","version":1,"settings":{},"positions":{"__proto__":{"x":0,"y":0}}}',
      ),
    ).toThrow();
  });
});
