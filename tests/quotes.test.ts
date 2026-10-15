import { describe, expect, it } from 'vitest';
import {
  WORK_QUOTES,
  LEISURE_QUOTES,
  chooseQuote,
  defaultHeaderSettings,
  quoteBlock,
  quotePool,
  validateHeaderSettings,
  validateQuote,
  validateQuoteList,
} from '../src/core/quotes';
import {
  defaultPreferences,
  exportPreferences,
  importPreferences,
  validateSettings,
} from '../src/core/settings';

const at = (hour: number, minute = 0, day = 14) =>
  new Date(2026, 9, day, hour, minute).getTime();
describe('header quotes and local time blocks', () => {
  it('includes the requested lists and 08:00–18:00 defaults', () => {
    const s = defaultHeaderSettings();
    expect(s).toMatchObject({
      rotate: true,
      scheduled: true,
      workStart: '08:00',
      workEnd: '18:00',
    });
    expect(s.workQuotes).toEqual(WORK_QUOTES);
    expect(s.leisureQuotes).toEqual(LEISURE_QUOTES);
    expect(s.workQuotes).toHaveLength(15);
    expect(s.leisureQuotes).toHaveLength(15);
    expect(s.fixedQuote).toBe('Your world, in orbit.');
  });
  it.each([
    [0, 0, 'leisure'],
    [7, 59, 'leisure'],
    [8, 0, 'work'],
    [17, 59, 'work'],
    [18, 0, 'leisure'],
    [23, 59, 'leisure'],
  ] as const)(
    'uses local inclusive/exclusive boundaries at %i:%i',
    (hour, minute, block) => {
      expect(quoteBlock(defaultHeaderSettings(), at(hour, minute))).toBe(block);
    },
  );
  it('uses the same blocks every day, including weekends', () => {
    expect(quoteBlock(defaultHeaderSettings(), at(12, 0, 17))).toBe('work');
  });
  it('supports overnight work hours with leisure covering the complement', () => {
    const s = {
      ...defaultHeaderSettings(),
      workStart: '22:00',
      workEnd: '02:00',
    };
    for (const [hour, minute, block] of [
      [21, 59, 'leisure'],
      [22, 0, 'work'],
      [0, 0, 'work'],
      [1, 59, 'work'],
      [2, 0, 'leisure'],
    ] as const)
      expect(quoteBlock(s, at(hour, minute))).toBe(block);
  });
  it('selects only the eligible list and mixes both when scheduling is off', () => {
    const s = {
      ...defaultHeaderSettings(),
      workQuotes: ['Work', 'Shared'],
      leisureQuotes: ['Rest', 'Shared'],
    };
    expect(quotePool(s, at(9))).toEqual(['Work', 'Shared']);
    expect(quotePool(s, at(19))).toEqual(['Rest', 'Shared']);
    expect(quotePool({ ...s, scheduled: false }, at(9))).toEqual([
      'Work',
      'Shared',
      'Rest',
    ]);
    expect(quotePool({ ...s, scheduled: false }, at(19))).toEqual([
      'Work',
      'Shared',
      'Rest',
    ]);
  });
  it('avoids immediate repeats, including duplicate text in different lists', () => {
    expect(chooseQuote(['A', 'B', 'A'], 'A', () => 0)).toBe('B');
    expect(chooseQuote(['A', 'B'], 'B', () => 0.99)).toBe('A');
    expect(chooseQuote(['A', 'B', 'C'], undefined, () => 0)).toBe('A');
    expect(chooseQuote(['A', 'B', 'C'], undefined, () => 0.99)).toBe('C');
  });
  it('gracefully retains the only configured quote and has a safe empty fallback', () => {
    expect(chooseQuote(['Only'], 'Only')).toBe('Only');
    expect(chooseQuote([])).toBe('Your world, in orbit.');
  });
});
describe('validated header preferences', () => {
  it('loads new defaults into old preferences without altering other choices', () => {
    const legacy = {
      ...defaultPreferences().settings,
      header: undefined,
      motion: false,
      theme: 'light',
    };
    const s = validateSettings(legacy);
    expect(s.header).toEqual(defaultHeaderSettings());
    expect(s.motion).toBe(false);
    expect(s.theme).toBe('light');
  });
  it('clones lists so independent default preferences cannot affect each other', () => {
    const a = defaultPreferences();
    a.settings.header.workQuotes.push('Custom');
    expect(defaultPreferences().settings.header.workQuotes).toHaveLength(15);
    expect(WORK_QUOTES).toHaveLength(15);
  });
  it('round-trips custom lists, fixed mode, scheduling and overnight hours', () => {
    const p = defaultPreferences();
    p.settings.header = {
      ...defaultHeaderSettings(),
      rotate: false,
      scheduled: false,
      workStart: '22:00',
      workEnd: '02:00',
      workQuotes: ['Build something.'],
      leisureQuotes: ['Take a breath.'],
      fixedQuote: 'My own orbit.',
    };
    expect(importPreferences(exportPreferences(p))).toEqual(p);
    expect(JSON.parse(exportPreferences(p))).not.toHaveProperty(
      'lastHeaderQuote',
    );
  });
  it('trims and deduplicates quotes while preserving literal text safely', () => {
    expect(validateQuoteList([' A ', 'A', 'B'])).toEqual(['A', 'B']);
    expect(validateQuote('<b>My text</b>')).toBe('<b>My text</b>');
  });
  it.each([
    null,
    [],
    { rotate: 'yes' },
    { scheduled: 1 },
    { workStart: '8:00' },
    { workEnd: '24:00' },
    { workStart: '18:00', workEnd: '18:00' },
    { workQuotes: [] },
    { leisureQuotes: [5] },
    { fixedQuote: '' },
    { workQuotes: ['a\nb'] },
    { fixedQuote: 'x'.repeat(121) },
    { workQuotes: Array(101).fill('A') },
  ])('rejects invalid header configuration %j', (value) => {
    expect(() => validateHeaderSettings(value)).toThrow();
  });
});
