import type {
  FolderRule,
  Override,
  Position,
  Preferences,
  Settings,
} from './types';
import { defaultHeaderSettings, validateHeaderSettings } from './quotes';
export const DEFAULT_SETTINGS: Settings = {
  header: defaultHeaderSettings(),
  onboarded: false,
  folderIds: [],
  folderRules: {},
  hiddenIds: [],
  grouping: false,
  mode: 'seven',
  weights: [55, 30, 15],
  autoResize: true,
  theme: 'dark',
  background: 'dusk',
  backgroundColor: '#101827',
  backgroundImage: '',
  glass: 24,
  blur: 8,
  colorIntensity: 58,
  faviconScale: 34,
  labels: 'hover',
  minSize: 64,
  maxSize: 160,
  spacing: 14,
  motion: true,
  floatIntensity: 2,
  physics: 50,
  attraction: 45,
};
export const defaultPreferences = (): Preferences => ({
  defaultsVersion: 2,
  settings: {
    ...DEFAULT_SETTINGS,
    header: defaultHeaderSettings(),
    folderIds: [],
    folderRules: {},
    hiddenIds: [],
    weights: [55, 30, 15],
  },
  overrides: {},
  positions: {},
});
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const ids = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= 20000 &&
  v.every((x) => typeof x === 'string' && x.length <= 256);
const hex = (v: unknown): v is string =>
  typeof v === 'string' && /^#[\da-f]{6}$/i.test(v);
export function validateSettings(input: unknown): Settings {
  if (!object(input))
    throw new Error('Preferences must contain a settings object.');
  const result = {
    ...DEFAULT_SETTINGS,
    header: validateHeaderSettings(input.header),
  };
  const enums = {
    mode: ['today', 'three', 'seven', 'balanced', 'custom'],
    theme: ['dark', 'light', 'auto'],
    background: ['aurora', 'dusk', 'solid', 'image'],
    labels: ['auto', 'always', 'hover'],
  };
  for (const [key, choices] of Object.entries(enums)) {
    if (key in input) {
      if (!choices.includes(input[key] as string))
        throw new Error(`Invalid ${key}.`);
      Object.assign(result, { [key]: input[key] });
    }
  }
  for (const key of [
    'onboarded',
    'grouping',
    'autoResize',
    'motion',
  ] as const) {
    if (key in input) {
      if (typeof input[key] !== 'boolean') throw new Error(`Invalid ${key}.`);
      result[key] = input[key];
    }
  }
  for (const key of ['folderIds', 'hiddenIds'] as const) {
    if (key in input) {
      if (!ids(input[key])) throw new Error(`Invalid ${key}.`);
      result[key] = [...new Set(input[key])];
    }
  }
  result.folderRules = map<FolderRule>(input.folderRules ?? {}, (v) => {
    if (!['auto', 'show', 'hide'].includes(v.mode as string))
      throw new Error('Invalid folder visibility mode.');
    const rule: FolderRule = { mode: v.mode as FolderRule['mode'] };
    if (v.color !== undefined) {
      if (!hex(v.color)) throw new Error('Invalid folder color.');
      rule.color = v.color;
    }
    if (v.schedule !== undefined) {
      const s = v.schedule;
      const time = (value: unknown): value is string =>
        typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
      if (
        !object(s) ||
        !time(s.start) ||
        !time(s.end) ||
        s.start === s.end ||
        !Array.isArray(s.days) ||
        s.days.length < 1 ||
        s.days.length > 7 ||
        !s.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) ||
        new Set(s.days).size !== s.days.length
      )
        throw new Error(
          'A folder schedule needs different start/end times and at least one valid weekday.',
        );
      rule.schedule = { start: s.start, end: s.end, days: [...s.days] };
    }
    return rule;
  });
  const limits = {
    glass: [8, 70],
    blur: [0, 20],
    colorIntensity: [0, 100],
    faviconScale: [20, 50],
    minSize: [44, 120],
    maxSize: [64, 240],
    spacing: [4, 40],
    floatIntensity: [0, 4],
    physics: [0, 100],
    attraction: [0, 100],
  };
  for (const [key, [min, max]] of Object.entries(limits)) {
    if (key in input) {
      const n = input[key];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
        throw new Error(`Invalid ${key}: expected ${min}–${max}.`);
      Object.assign(result, { [key]: n });
    }
  }
  if (result.minSize > result.maxSize)
    throw new Error('Minimum size must not exceed maximum size.');
  if ('weights' in input) {
    const w = input.weights;
    if (
      !Array.isArray(w) ||
      w.length !== 3 ||
      !w.every(
        (n) =>
          typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100,
      ) ||
      w.reduce((a, b) => a + b, 0) <= 0
    )
      throw new Error(
        'Weights must be three nonnegative numbers with a positive total.',
      );
    result.weights = [...w] as [number, number, number];
  }
  if ('backgroundColor' in input) {
    if (!hex(input.backgroundColor))
      throw new Error('Invalid background color.');
    result.backgroundColor = input.backgroundColor;
  }
  if ('backgroundImage' in input) {
    const image = input.backgroundImage;
    if (
      typeof image !== 'string' ||
      image.length > 3_000_000 ||
      (image !== '' &&
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z\d+/=]+$/.test(image))
    )
      throw new Error(
        'Background must be a local PNG, JPEG or WebP smaller than 2 MB.',
      );
    result.backgroundImage = image;
  }
  return result;
}
function map<T>(
  input: unknown,
  validate: (v: Record<string, unknown>) => T,
): Record<string, T> {
  if (!object(input) || Object.keys(input).length > 20000)
    throw new Error('Invalid bookmark preferences.');
  return Object.fromEntries(
    Object.entries(input).map(([id, v]) => {
      if (
        !id ||
        id.length > 256 ||
        ['__proto__', 'constructor', 'prototype'].includes(id) ||
        !object(v)
      )
        throw new Error('Invalid bookmark preference.');
      return [id, validate(v)];
    }),
  );
}
export function validatePreferences(input: unknown): Preferences {
  if (!object(input)) throw new Error('Invalid preferences.');
  if (input.defaultsVersion !== undefined && input.defaultsVersion !== 2)
    throw new Error('Unsupported preference defaults version.');
  const settings = validateSettings(input.settings);
  const overrides = map<Override>(input.overrides ?? {}, (v) => {
    const result: Override = {};
    if (v.color !== undefined) {
      if (!hex(v.color)) throw new Error('Invalid bubble color.');
      result.color = v.color;
    }
    if (v.size !== undefined) {
      if (
        typeof v.size !== 'number' ||
        !Number.isFinite(v.size) ||
        v.size < 44 ||
        v.size > 240
      )
        throw new Error('Invalid fixed bubble size.');
      result.size = v.size;
    }
    if ('pinned' in v) {
      if (typeof v.pinned !== 'boolean') throw new Error('Invalid pin.');
      result.pinned = v.pinned;
    }
    return result;
  });
  const positions = map<Position>(input.positions ?? {}, (v) => {
    if (
      typeof v.x !== 'number' ||
      typeof v.y !== 'number' ||
      !Number.isFinite(v.x) ||
      !Number.isFinite(v.y) ||
      v.x < 0 ||
      v.x > 1 ||
      v.y < 0 ||
      v.y > 1 ||
      ('manual' in v && typeof v.manual !== 'boolean')
    )
      throw new Error('Invalid bubble position.');
    return { x: v.x, y: v.y, ...(v.manual ? { manual: true } : {}) };
  });
  return { defaultsVersion: 2, settings, overrides, positions };
}
// Applied only when loading older installed preferences; imports retain their
// explicit appearance choices. A subsequent save records the new defaults version.
export function migrateInstalledPreferences(input: unknown): Preferences {
  const prefs = validatePreferences(input);
  if (object(input) && input.defaultsVersion === undefined) {
    if (prefs.settings.background === 'aurora')
      prefs.settings.background = 'dusk';
    if (prefs.settings.labels === 'auto') prefs.settings.labels = 'hover';
  }
  return prefs;
}
export function exportPreferences(prefs: Preferences): string {
  return JSON.stringify(
    { format: 'orbit-new-tab', version: 1, ...validatePreferences(prefs) },
    null,
    2,
  );
}
export function importPreferences(json: string): Preferences {
  if (json.length > 5_000_000) throw new Error('Preference file is too large.');
  const data: unknown = JSON.parse(json);
  if (!object(data) || data.format !== 'orbit-new-tab' || data.version !== 1)
    throw new Error('This is not a supported Orbit preferences file.');
  return validatePreferences(data);
}
