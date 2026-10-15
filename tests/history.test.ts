import { describe, expect, it, vi } from 'vitest';
import {
  cacheUsable,
  collectActivity,
  HISTORY_LIMIT,
} from '../src/data/history';
import { activityKey, flattenBookmarks } from '../src/core/bookmarks';
import { dayStart } from '../src/core/scoring';
const now = new Date(2026, 9, 14, 12).getTime();
const bookmarks = flattenBookmarks([
  {
    id: '1',
    title: 'folder',
    children: [
      { id: 'a', title: 'A', url: 'https://example.com/page' },
      { id: 'b', title: 'B', url: 'https://example.com/page#other' },
    ],
  },
]).bookmarks;
const visit = (id: string, time = now): chrome.history.VisitItem => ({
  id: 'h',
  visitId: id,
  visitTime: time,
  transition: 'link',
  isLocal: true,
  referringVisitId: '0',
});
describe('real-history adapter contract', () => {
  it('queries a bounded calendar range and reads actual visit timestamps for matching aliases', async () => {
    const source = {
      search: vi.fn().mockResolvedValue([
        { id: 'a', url: 'https://example.com/page', visitCount: 900 },
        { id: 'b', url: 'https://example.com/page#section' },
        { id: 'c', url: 'https://example.com/other' },
      ]),
      getVisits: vi
        .fn()
        .mockImplementation(async ({ url }: { url: string }) =>
          url.includes('#')
            ? [visit('2', dayStart(now) - 1), visit('1')]
            : [visit('1')],
        ),
    };
    const result = await collectActivity(source, bookmarks, false, 'r1', now);
    expect(source.search).toHaveBeenCalledWith({
      text: '',
      startTime: dayStart(now, 6),
      endTime: now,
      maxResults: 5000,
    });
    expect(source.getVisits).toHaveBeenCalledTimes(2);
    expect(result.entries['https://example.com/page']).toEqual({
      today: 1,
      previous2: 1,
      previous4: 0,
    });
    expect(result.status).toBe('ready');
  });
  it('aggregates other pages only in domain mode and never across unrelated hosts', async () => {
    const source = {
      search: vi.fn().mockResolvedValue([
        { id: 'a', url: 'https://example.com/page' },
        { id: 'b', url: 'https://example.com/other' },
        { id: 'c', url: 'https://another.com/page' },
      ]),
      getVisits: vi
        .fn()
        .mockImplementation(async ({ url }: { url: string }) => [visit(url)]),
    };
    const result = await collectActivity(source, bookmarks, true, 'r1', now);
    expect(result.domains['example.com'].today).toBe(2);
    expect(source.getVisits).toHaveBeenCalledTimes(2);
  });
  it('never infers visits when history is empty or permission is unavailable', async () => {
    const empty = await collectActivity(
      { search: async () => [], getVisits: vi.fn() },
      bookmarks,
      false,
      '',
      now,
    );
    expect(empty.entries).toEqual({});
    expect(empty.status).toBe('ready');
    const denied = await collectActivity(
      {
        search: async () => {
          throw new Error('denied');
        },
        getVisits: vi.fn(),
      },
      bookmarks,
      false,
      '',
      now,
    );
    expect(denied.status).toBe('unavailable');
    expect(denied.entries).toEqual({});
  });
  it('reports partial history instead of claiming complete counts at the query limit', async () => {
    const partial = await collectActivity(
      {
        search: async () =>
          Array.from({ length: HISTORY_LIMIT }, (_, i) => ({
            id: String(i),
            url: `https://other.com/${i}`,
          })),
        getVisits: vi.fn(),
      },
      bookmarks,
      false,
      '',
      now,
    );
    expect(partial.status).toBe('partial');
    expect(partial.message).toContain('5,000');
  });
  it('survives missing visit records and reports partial availability', async () => {
    const partial = await collectActivity(
      {
        search: async () => [{ id: 'a', url: bookmarks[0].url }],
        getVisits: async () => {
          throw new Error('restricted');
        },
      },
      bookmarks,
      false,
      '',
      now,
    );
    expect(partial.status).toBe('partial');
    expect(partial.entries).toEqual({});
  });
  it('reuses a fresh persistent cache after worker restart and invalidates on changes or midnight', async () => {
    const cache = await collectActivity(
      { search: async () => [], getVisits: vi.fn() },
      bookmarks,
      false,
      'revision',
      now,
    );
    expect(
      cacheUsable(cache, activityKey(bookmarks, false), 'revision', now + 1000),
    ).toBe(true);
    expect(cacheUsable(cache, cache.key, 'new revision', now + 1000)).toBe(
      false,
    );
    expect(
      cacheUsable(cache, 'different bookmarks', 'revision', now + 1000),
    ).toBe(false);
    expect(
      cacheUsable(cache, cache.key, 'revision', dayStart(now) + 24 * 3600000),
    ).toBe(false);
    expect(cacheUsable(cache, cache.key, 'revision', now + 16 * 60000)).toBe(
      false,
    );
  });
});
