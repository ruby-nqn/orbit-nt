import type { HeaderSettings } from './types';

export const WORK_QUOTES = [
  'Ready when you are.',
  'What are we working on?',
  "Let's make some progress.",
  "What's on the agenda?",
  'Where should we start?',
  "Let's get things moving.",
  "What's the priority today?",
  'Time to make it happen.',
  "What's next on the list?",
  "Let's figure this out.",
  'Got something in mind?',
  "Let's put ideas to work.",
  "What's the plan?",
  'One thing at a time.',
  "Let's get to it.",
];
export const LEISURE_QUOTES = [
  "What's on your mind?",
  'Where to today?',
  "Let's get curious.",
  'What sounds fun?',
  "No rush. What's up?",
  'Fancy a rabbit hole?',
  'What are we exploring?',
  "Let's see where this goes.",
  'Got a random thought?',
  "What's the mood?",
  "Let's wander a little.",
  'Something worth discovering?',
  'What if we tried something new?',
  'Your call.',
  'What are you in the mood for?',
];
export const defaultHeaderSettings = (): HeaderSettings => ({
  rotate: true,
  scheduled: true,
  workStart: '08:00',
  workEnd: '18:00',
  workQuotes: [...WORK_QUOTES],
  leisureQuotes: [...LEISURE_QUOTES],
  fixedQuote: 'Your world, in orbit.',
});

export function validateQuote(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > 120 ||
    [...value].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new Error('Each quote needs 1–120 characters on a single line.');
  return value.trim();
}
export function validateQuoteList(value: unknown, limit = 100): string[] {
  if (!Array.isArray(value) || !value.length || value.length > limit)
    throw new Error(`Use 1–${limit} quotes, one per line.`);
  return [...new Set(value.map(validateQuote))];
}
export function validateHeaderSettings(value: unknown): HeaderSettings {
  const defaults = defaultHeaderSettings();
  if (value === undefined) return defaults;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid header settings.');
  const input = value as Record<string, unknown>;
  const result = { ...defaults };
  for (const key of ['rotate', 'scheduled'] as const) {
    if (key in input) {
      if (typeof input[key] !== 'boolean')
        throw new Error(`Invalid header ${key}.`);
      result[key] = input[key];
    }
  }
  for (const key of ['workStart', 'workEnd'] as const) {
    if (key in input) {
      if (
        typeof input[key] !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(input[key])
      )
        throw new Error('Choose valid start and end times.');
      result[key] = input[key];
    }
  }
  if (result.workStart === result.workEnd)
    throw new Error('Work hours need different start and end times.');
  for (const key of ['workQuotes', 'leisureQuotes'] as const)
    if (key in input) result[key] = validateQuoteList(input[key]);
  if ('fixedQuote' in input)
    result.fixedQuote = validateQuote(input.fixedQuote);
  return result;
}

/** Local clock times; start inclusive, end exclusive. Leisure is the complement. */
export function quoteBlock(
  settings: HeaderSettings,
  now: number,
): 'work' | 'leisure' {
  const date = new Date(now);
  const minute = date.getHours() * 60 + date.getMinutes();
  const minutes = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const start = minutes(settings.workStart),
    end = minutes(settings.workEnd);
  const work =
    start < end
      ? minute >= start && minute < end
      : minute >= start || minute < end;
  return work ? 'work' : 'leisure';
}
export function quotePool(settings: HeaderSettings, now: number): string[] {
  if (!settings.scheduled)
    return [...new Set([...settings.workQuotes, ...settings.leisureQuotes])];
  return quoteBlock(settings, now) === 'work'
    ? settings.workQuotes
    : settings.leisureQuotes;
}
/** Exclude the previous displayed text, including duplicates shared by both lists. */
export function chooseQuote(
  pool: string[],
  previous?: string,
  random = Math.random,
): string {
  const unique = [...new Set(pool)];
  const alternatives = unique.filter((quote) => quote !== previous);
  const candidates = alternatives.length ? alternatives : unique;
  return (
    candidates[
      Math.min(
        candidates.length - 1,
        Math.max(0, Math.floor(random() * candidates.length)),
      )
    ] ?? defaultHeaderSettings().fixedQuote
  );
}
