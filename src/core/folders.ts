import type {
  Bookmark,
  Folder,
  FolderRule,
  FolderSchedule,
  Settings,
} from './types';

/** The closest colored folder wins, including inherited parent folder colors. */
export function bookmarkFolderColor(
  bookmark: Bookmark,
  rules: Record<string, FolderRule>,
): string | undefined {
  for (let i = bookmark.ancestors.length - 1; i >= 0; i--) {
    const color = rules[bookmark.ancestors[i]]?.color;
    if (color) return color;
  }
  return undefined;
}

export const WEEKDAYS = [
  { day: 1, label: 'Mon', name: 'Monday' },
  { day: 2, label: 'Tue', name: 'Tuesday' },
  { day: 3, label: 'Wed', name: 'Wednesday' },
  { day: 4, label: 'Thu', name: 'Thursday' },
  { day: 5, label: 'Fri', name: 'Friday' },
  { day: 6, label: 'Sat', name: 'Saturday' },
  { day: 0, label: 'Sun', name: 'Sunday' },
] as const;

const minuteOfDay = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export function scheduleActive(schedule: FolderSchedule, now: number): boolean {
  const date = new Date(now),
    day = date.getDay();
  const minute = date.getHours() * 60 + date.getMinutes();
  const start = minuteOfDay(schedule.start),
    end = minuteOfDay(schedule.end);
  if (start === end) return false;
  if (start < end)
    return schedule.days.includes(day) && minute >= start && minute < end;
  // Monday 22:00–02:00 includes early Tuesday, even when Tuesday isn't selected.
  return (
    (minute >= start && schedule.days.includes(day)) ||
    (minute < end && schedule.days.includes((day + 6) % 7))
  );
}

export function folderVisible(
  rule: FolderRule | undefined,
  now: number,
): boolean {
  if (rule?.mode === 'hide') return false;
  if (rule?.mode === 'show') return true;
  return !rule?.schedule || scheduleActive(rule.schedule, now);
}

/** Only rules inside an included branch apply. A hidden parent gates all descendants. */
export function visibleFolderPath(
  path: string[],
  settings: Settings,
  now: number,
): boolean {
  const start = path.findIndex((id) => settings.folderIds.includes(id));
  return (
    start >= 0 &&
    path
      .slice(start)
      .every((id) => folderVisible(settings.folderRules[id], now))
  );
}

export interface IncludedFolder {
  folder: Folder;
  path: string[];
  label: string;
}
export function includedFolders(
  folders: Folder[],
  settings: Settings,
): IncludedFolder[] {
  const stack: Folder[] = [],
    result: IncludedFolder[] = [];
  for (const folder of folders) {
    while (stack.length && stack.at(-1)!.depth >= folder.depth) stack.pop();
    stack.push(folder);
    const first = stack.findIndex((f) => settings.folderIds.includes(f.id));
    if (first >= 0)
      result.push({
        folder,
        path: stack.slice(first).map((f) => f.id),
        label: stack.map((f) => f.title).join(' / '),
      });
  }
  return result;
}

export function scheduleSummary(schedule: FolderSchedule): string {
  const days = WEEKDAYS.filter((d) => schedule.days.includes(d.day));
  const names =
    days.length === 7 ? 'Every day' : days.map((d) => d.label).join(', ');
  return `${names} · ${schedule.start}–${schedule.end}${schedule.start > schedule.end ? ' (overnight)' : ''}`;
}

export function toggleFolder(
  rule: FolderRule | undefined,
  now: number,
): FolderRule {
  return {
    ...rule,
    mode: folderVisible(rule, now) ? 'hide' : rule?.schedule ? 'show' : 'auto',
  };
}
