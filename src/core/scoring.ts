import type { Activity, Mode, Settings } from './types';
export function dayStart(now: number, daysAgo = 0): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.getTime();
}
export function countVisits(
  visits: { visitTime?: number; visitId?: string; transition?: string }[],
  now: number,
): Activity {
  const result: Activity = { today: 0, previous2: 0, previous4: 0 };
  const today = dayStart(now),
    three = dayStart(now, 2),
    seven = dayStart(now, 6);
  const seen = new Set<string>();
  for (const visit of visits) {
    const t = visit.visitTime;
    if (
      t === undefined ||
      t > now ||
      t < seven ||
      visit.transition === 'auto_subframe' ||
      visit.transition === 'manual_subframe'
    )
      continue;
    if (visit.visitId && seen.has(visit.visitId)) continue;
    if (visit.visitId) seen.add(visit.visitId);
    if (t >= today) result.today++;
    else if (t >= three) result.previous2++;
    else result.previous4++;
  }
  return result;
}
export function weightsFor(
  mode: Mode,
  weights: [number, number, number],
): [number, number, number] {
  if (mode === 'today') return [1, 0, 0];
  if (mode === 'three') return [0.65, 0.35, 0];
  if (mode === 'balanced') return [0.25, 0.35, 0.4];
  if (mode === 'seven') return [0.55, 0.3, 0.15];
  const total = weights.reduce((a, b) => a + b, 0);
  return total > 0
    ? (weights.map((w) => w / total) as [number, number, number])
    : [0.55, 0.3, 0.15];
}
export function activityScore(
  activity: Activity,
  mode: Mode,
  weights: [number, number, number],
): number {
  const w = weightsFor(mode, weights);
  return (
    Math.max(0, activity.today) * w[0] +
    Math.max(0, activity.previous2) * w[1] +
    Math.max(0, activity.previous4) * w[2]
  );
}
// A fixed logarithmic saturation point prevents unrelated bookmarks changing each other's size.
export function normalizeScore(score: number): number {
  return Math.min(
    1,
    Math.log1p(Math.max(0, Number.isFinite(score) ? score : 0)) /
      Math.log1p(40),
  );
}
export function diameter(
  score: number,
  settings: Pick<Settings, 'minSize' | 'maxSize' | 'autoResize'>,
  fixed?: number,
): number {
  if (fixed !== undefined)
    return Math.max(settings.minSize, Math.min(settings.maxSize, fixed));
  if (!settings.autoResize)
    return Math.max(settings.minSize, Math.min(settings.maxSize, 88));
  return (
    settings.minSize +
    (settings.maxSize - settings.minSize) * normalizeScore(score)
  );
}
export function windowVisits(activity: Activity, mode: Mode): number {
  return (
    activity.today +
    (mode === 'today' ? 0 : activity.previous2) +
    (mode === 'today' || mode === 'three' ? 0 : activity.previous4)
  );
}
export function addActivity(a: Activity, b: Activity): Activity {
  return {
    today: a.today + b.today,
    previous2: a.previous2 + b.previous2,
    previous4: a.previous4 + b.previous4,
  };
}
export const modeLabel = (mode: Mode): string =>
  ({
    today: 'Today',
    three: 'Last 3 days',
    seven: 'Last 7 days',
    balanced: 'Balanced',
    custom: 'Custom · 7 days',
  })[mode];
