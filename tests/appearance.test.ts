import { describe, expect, it } from 'vitest';
import { bookmarkFolderColor } from '../src/core/folders';
import { createEntries, flattenBookmarks } from '../src/core/bookmarks';
import {
  defaultPreferences,
  exportPreferences,
  importPreferences,
  migrateInstalledPreferences,
  validatePreferences,
} from '../src/core/settings';

const bookmarks = flattenBookmarks([
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'Library',
        children: [
          {
            id: 'work',
            title: 'Work',
            children: [
              { id: 'docs', title: 'Docs', url: 'https://work.example/docs' },
              {
                id: 'research',
                title: 'Research',
                children: [
                  {
                    id: 'paper',
                    title: 'Paper',
                    url: 'https://work.example/paper',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]).bookmarks;
describe('folder colors and refreshed appearance defaults', () => {
  it('defaults to Lavender dusk and hover/focus labels', () => {
    const p = defaultPreferences();
    expect(p.settings.background).toBe('dusk');
    expect(p.settings.labels).toBe('hover');
  });
  it('inherits a parent color and lets the closest colored subfolder win', () => {
    const p = defaultPreferences();
    p.settings.folderRules.work = { mode: 'auto', color: '#ab55cc' };
    expect(bookmarkFolderColor(bookmarks[1], p.settings.folderRules)).toBe(
      '#ab55cc',
    );
    p.settings.folderRules.research = { mode: 'auto', color: '#44bbcc' };
    expect(bookmarkFolderColor(bookmarks[1], p.settings.folderRules)).toBe(
      '#44bbcc',
    );
    expect(bookmarkFolderColor(bookmarks[0], p.settings.folderRules)).toBe(
      '#ab55cc',
    );
  });
  it('keeps folder and individual bubble accents independent', () => {
    const p = defaultPreferences();
    p.settings.folderRules.work = { mode: 'auto', color: '#ab55cc' };
    p.overrides.docs = { color: '#44bbcc' };
    const entry = createEntries(bookmarks, p)[0];
    expect(entry.folderColor).toBe('#ab55cc');
    expect(entry.color).toBe('#44bbcc');
  });
  it('uses the representative visible bookmark’s folder for grouped entries', () => {
    const p = defaultPreferences();
    p.settings.grouping = true;
    p.settings.folderRules.work = { mode: 'auto', color: '#ab55cc' };
    const entry = createEntries(bookmarks, p)[0];
    expect(entry.members).toHaveLength(2);
    expect(entry.folderColor).toBe('#ab55cc');
  });
  it('persists colors together with schedules and manual visibility', () => {
    const p = defaultPreferences();
    p.settings.folderRules.work = {
      mode: 'hide',
      color: '#ab55cc',
      schedule: { start: '09:00', end: '17:00', days: [1, 2, 3] },
    };
    expect(importPreferences(exportPreferences(p))).toEqual(p);
    expect(() =>
      validatePreferences({
        ...p,
        settings: {
          ...p.settings,
          folderRules: { work: { mode: 'auto', color: 'red' } },
        },
      }),
    ).toThrow('Invalid folder color');
  });
  it('clearing a child color restores inheritance without losing its schedule', () => {
    const p = defaultPreferences();
    p.settings.folderRules.work = { mode: 'auto', color: '#ab55cc' };
    p.settings.folderRules.research = {
      mode: 'auto',
      color: undefined,
      schedule: { start: '10:00', end: '12:00', days: [1] },
    };
    const restored = validatePreferences(p);
    expect(
      bookmarkFolderColor(bookmarks[1], restored.settings.folderRules),
    ).toBe('#ab55cc');
    expect(restored.settings.folderRules.research.schedule?.start).toBe(
      '10:00',
    );
  });
  it('migrates previous installed defaults once while keeping custom choices', () => {
    const legacy = {
      settings: {
        ...defaultPreferences().settings,
        background: 'aurora',
        labels: 'auto',
      },
      overrides: {},
      positions: {},
    };
    const updated = migrateInstalledPreferences(legacy);
    expect(updated.settings.background).toBe('dusk');
    expect(updated.settings.labels).toBe('hover');
    expect(updated.defaultsVersion).toBe(2);
    const chosen = migrateInstalledPreferences({
      ...updated,
      settings: { ...updated.settings, background: 'aurora', labels: 'auto' },
    });
    expect(chosen.settings.background).toBe('aurora');
    expect(chosen.settings.labels).toBe('auto');
    expect(
      migrateInstalledPreferences({
        ...legacy,
        settings: { ...legacy.settings, background: 'solid', labels: 'always' },
      }).settings.background,
    ).toBe('solid');
  });
  it('retains explicit appearance selections when importing an old export', () => {
    const p = defaultPreferences();
    p.settings.background = 'aurora';
    p.settings.labels = 'auto';
    const data = JSON.parse(exportPreferences(p));
    delete data.defaultsVersion;
    const imported = importPreferences(JSON.stringify(data));
    expect(imported.settings.background).toBe('aurora');
    expect(imported.settings.labels).toBe('auto');
  });
});
