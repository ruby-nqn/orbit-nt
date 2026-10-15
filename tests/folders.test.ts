import { describe, expect, it } from 'vitest';
import {
  eligibleBookmarks,
  libraryBookmarks,
  flattenBookmarks,
  activityKey,
} from '../src/core/bookmarks';
import {
  folderVisible,
  includedFolders,
  scheduleActive,
  scheduleSummary,
  toggleFolder,
} from '../src/core/folders';
import {
  defaultPreferences,
  exportPreferences,
  importPreferences,
  validateSettings,
} from '../src/core/settings';
import type { FolderSchedule } from '../src/core/types';

// Construct local wall-clock dates rather than assuming the machine's timezone.
const local = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).getTime();
const work: FolderSchedule = {
  start: '09:00',
  end: '17:00',
  days: [1, 2, 3, 4, 5],
};
const snapshot = flattenBookmarks([
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'Bookmarks bar',
        children: [
          {
            id: 'work',
            title: 'Work',
            children: [
              {
                id: 'inbox',
                title: 'Inbox',
                url: 'https://work.example/inbox',
              },
              {
                id: 'research',
                title: 'Research',
                children: [
                  {
                    id: 'docs',
                    title: 'Docs',
                    url: 'https://work.example/docs',
                  },
                ],
              },
            ],
          },
          {
            id: 'personal',
            title: 'Personal',
            children: [
              {
                id: 'music',
                title: 'Music',
                url: 'https://personal.example/music',
              },
            ],
          },
        ],
      },
    ],
  },
]);
const preferences = () => {
  const p = defaultPreferences();
  p.settings.folderIds = ['1'];
  return p;
};

describe('local folder schedules', () => {
  it('shows weekdays from 09:00 inclusive to 17:00 exclusive', () => {
    expect(scheduleActive(work, local(14, 8, 59))).toBe(false);
    expect(scheduleActive(work, local(14, 9))).toBe(true);
    expect(scheduleActive(work, local(14, 16, 59))).toBe(true);
    expect(scheduleActive(work, local(14, 17))).toBe(false);
  });
  it('uses chosen weekdays and hides work on weekends', () => {
    expect(scheduleActive(work, local(17, 12))).toBe(false); // Saturday
    expect(scheduleActive(work, local(18, 12))).toBe(false); // Sunday
    expect(scheduleActive({ ...work, days: [0] }, local(18, 12))).toBe(true);
  });
  it('assigns overnight windows to their starting day', () => {
    const overnight = { start: '22:00', end: '02:00', days: [5] };
    expect(scheduleActive(overnight, local(16, 21, 59))).toBe(false); // Friday
    expect(scheduleActive(overnight, local(16, 22))).toBe(true);
    expect(scheduleActive(overnight, local(17, 1, 59))).toBe(true); // Saturday
    expect(scheduleActive(overnight, local(17, 2))).toBe(false);
    expect(scheduleActive(overnight, local(17, 23))).toBe(false);
  });
  it('wraps overnight schedules from Sunday into Monday', () => {
    expect(
      scheduleActive(
        { start: '23:00', end: '01:00', days: [0] },
        local(19, 0, 30),
      ),
    ).toBe(true);
  });
  it('supports whole selected days with an overnight window and rejects ambiguous zero duration', () => {
    expect(
      scheduleActive({ start: '00:00', end: '00:01', days: [3] }, local(14, 0)),
    ).toBe(true);
    expect(
      scheduleActive({ ...work, start: '09:00', end: '09:00' }, local(14, 12)),
    ).toBe(false);
  });
  it('keeps manual overrides separate from the saved schedule', () => {
    expect(folderVisible({ mode: 'show', schedule: work }, local(14, 22))).toBe(
      true,
    );
    expect(folderVisible({ mode: 'hide', schedule: work }, local(14, 12))).toBe(
      false,
    );
    expect(folderVisible({ mode: 'auto', schedule: work }, local(14, 22))).toBe(
      false,
    );
    expect(folderVisible(undefined, local(14, 22))).toBe(true);
    expect(
      toggleFolder({ mode: 'auto', schedule: work }, local(14, 22)),
    ).toEqual({ mode: 'show', schedule: work });
    expect(
      toggleFolder({ mode: 'auto', schedule: work }, local(14, 12)),
    ).toEqual({ mode: 'hide', schedule: work });
    expect(toggleFolder({ mode: 'hide' }, local(14, 12))).toEqual({
      mode: 'auto',
    });
  });
  it('describes weekday and overnight schedules clearly', () => {
    expect(scheduleSummary(work)).toBe('Mon, Tue, Wed, Thu, Fri · 09:00–17:00');
    expect(
      scheduleSummary({ ...work, start: '22:00', end: '02:00' }),
    ).toContain('(overnight)');
  });
});

describe('nested folder visibility and library caching', () => {
  it('can hide a subfolder inside an included parent without hiding its siblings', () => {
    const p = preferences();
    p.settings.folderRules.work = { mode: 'hide' };
    expect(
      eligibleBookmarks(snapshot.bookmarks, p, local(14, 12)).map((b) => b.id),
    ).toEqual(['music']);
    expect(libraryBookmarks(snapshot.bookmarks, p)).toHaveLength(3);
  });
  it('can independently hide a deeply nested folder', () => {
    const p = preferences();
    p.settings.folderRules.research = { mode: 'hide' };
    expect(
      eligibleBookmarks(snapshot.bookmarks, p, local(14, 12)).map((b) => b.id),
    ).toEqual(['inbox', 'music']);
  });
  it('does not let a child force itself visible through a hidden parent', () => {
    const p = preferences();
    p.settings.folderRules.work = { mode: 'hide' };
    p.settings.folderRules.research = { mode: 'show' };
    expect(
      eligibleBookmarks(snapshot.bookmarks, p, local(14, 12)).map((b) => b.id),
    ).toEqual(['music']);
  });
  it('applies schedules to descendants and leaves personal bookmarks visible', () => {
    const p = preferences();
    p.settings.folderRules.work = { mode: 'auto', schedule: work };
    expect(
      eligibleBookmarks(snapshot.bookmarks, p, local(14, 12)),
    ).toHaveLength(3);
    expect(
      eligibleBookmarks(snapshot.bookmarks, p, local(14, 18)).map((b) => b.id),
    ).toEqual(['music']);
  });
  it('intersects parent and child schedules', () => {
    const p = preferences();
    p.settings.folderRules.work = { mode: 'auto', schedule: work };
    p.settings.folderRules.research = {
      mode: 'auto',
      schedule: { ...work, start: '12:00', end: '14:00' },
    };
    expect(
      eligibleBookmarks(snapshot.bookmarks, p, local(14, 11)).map((b) => b.id),
    ).toEqual(['inbox', 'music']);
    expect(
      eligibleBookmarks(snapshot.bookmarks, p, local(14, 13)),
    ).toHaveLength(3);
    expect(
      eligibleBookmarks(snapshot.bookmarks, p, local(14, 18)).map((b) => b.id),
    ).toEqual(['music']);
  });
  it('ignores rules outside the included branch and keeps individually hidden bookmarks hidden', () => {
    const p = preferences();
    p.settings.folderIds = ['research'];
    p.settings.folderRules.work = { mode: 'hide' };
    expect(
      eligibleBookmarks(snapshot.bookmarks, p, local(14, 12)).map((b) => b.id),
    ).toEqual(['docs']);
    p.settings.hiddenIds = ['docs'];
    expect(
      eligibleBookmarks(snapshot.bookmarks, p, local(14, 12)),
    ).toHaveLength(0);
  });
  it('keeps history cache identity stable when visibility changes', () => {
    const p = preferences(),
      before = activityKey(libraryBookmarks(snapshot.bookmarks, p), false);
    p.settings.folderRules.work = { mode: 'auto', schedule: work };
    expect(activityKey(libraryBookmarks(snapshot.bookmarks, p), false)).toBe(
      before,
    );
    expect(
      eligibleBookmarks(snapshot.bookmarks, p, local(14, 20)),
    ).toHaveLength(1);
  });
  it('keeps controls for hidden folders and builds complete included paths', () => {
    const p = preferences();
    p.settings.folderRules.work = { mode: 'hide' };
    const controls = includedFolders(snapshot.folders, p.settings);
    expect(controls.map((c) => c.folder.id)).toEqual([
      '1',
      'work',
      'research',
      'personal',
    ]);
    expect(controls.find((c) => c.folder.id === 'research')?.path).toEqual([
      '1',
      'work',
      'research',
    ]);
    p.settings.folderIds = ['work'];
    expect(
      includedFolders(snapshot.folders, p.settings).map((c) => c.folder.id),
    ).toEqual(['work', 'research']);
  });
});

describe('folder preference migration and validation', () => {
  it('loads old settings without folder rules with everything enabled', () => {
    const { folderRules: unused, ...legacy } = defaultPreferences().settings;
    void unused;
    expect(validateSettings(legacy).folderRules).toEqual({});
  });
  it('round-trips schedules and manual visibility overrides', () => {
    const p = preferences();
    p.settings.folderRules.work = { mode: 'auto', schedule: work };
    p.settings.folderRules.personal = { mode: 'hide' };
    expect(importPreferences(exportPreferences(p))).toEqual(p);
  });
  it.each([
    { mode: 'sometimes' },
    { mode: 'auto', schedule: { ...work, start: '9:00' } },
    { mode: 'auto', schedule: { ...work, end: '24:00' } },
    { mode: 'auto', schedule: { ...work, end: '09:00' } },
    { mode: 'auto', schedule: { ...work, days: [] } },
    { mode: 'auto', schedule: { ...work, days: [1, 1] } },
    { mode: 'auto', schedule: { ...work, days: [7] } },
    { mode: 'auto', schedule: { ...work, days: ['1'] } },
  ])('rejects invalid folder preferences %j', (rule) => {
    expect(() =>
      validateSettings({
        ...defaultPreferences().settings,
        folderRules: { work: rule },
      }),
    ).toThrow();
  });
});
