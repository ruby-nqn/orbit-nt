import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, Palette, RotateCcw, Check } from 'lucide-react';
import {
  folderVisible,
  includedFolders,
  scheduleSummary,
  WEEKDAYS,
  type IncludedFolder,
} from '../core/folders';
import type { FolderRule, Preferences, BookmarkSnapshot } from '../core/types';
import { validatePreferences } from '../core/settings';
import { Modal } from './Modal';

type Update = (fn: (previous: Preferences) => Preferences) => void;
export function setFolderRule(
  prefs: Preferences,
  id: string,
  rule: FolderRule,
): Preferences {
  return {
    ...prefs,
    settings: {
      ...prefs.settings,
      folderRules: { ...prefs.settings.folderRules, [id]: rule },
    },
  };
}

function FolderChip({
  item,
  snapshot,
  prefs,
  update,
  now,
  onSchedule,
  onColor,
  compact,
}: {
  item: IncludedFolder;
  snapshot?: BookmarkSnapshot;
  prefs: Preferences;
  update: Update;
  now: number;
  onSchedule: (item: IncludedFolder) => void;
  onColor: (item: IncludedFolder) => void;
  compact: boolean;
}) {
  const { folder, path } = item,
    rule = prefs.settings.folderRules[folder.id];
  const [popup, setPopup] = useState<{ left: number; top: number }>();
  const chip = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    actions = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined,
    ),
    clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    focusActions = useRef(false);
  const blocked = path
    .slice(0, -1)
    .find((id) => !folderVisible(prefs.settings.folderRules[id], now));
  const parent = blocked
    ? snapshot?.folders.find((f) => f.id === blocked)
    : undefined;
  const active = !blocked && folderVisible(rule, now),
    scheduled = !!rule?.schedule,
    manual = scheduled && rule.mode !== 'auto';
  const reason = parent
    ? `Hidden by ${parent.title}`
    : scheduled && rule.mode === 'auto'
      ? active
        ? 'Scheduled · visible now'
        : 'Scheduled · outside hours'
      : active
        ? 'Visible'
        : 'Hidden';
  const close = () => {
    clearTimeout(hoverTimer.current);
    setPopup(undefined);
  };
  const open = () => {
    clearTimeout(hoverTimer.current);
    const rect = chip.current?.getBoundingClientRect();
    if (rect)
      setPopup({
        left: Math.max(
          8,
          Math.min(innerWidth - 112, rect.left + rect.width / 2 - 48),
        ),
        top: Math.min(innerHeight - 55, rect.bottom + 7),
      });
  };
  const leave = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      if (
        actions.current?.contains(document.activeElement) ||
        trigger.current?.matches(':focus-visible') ||
        chip.current?.matches(':focus-visible')
      )
        return;
      setPopup(undefined);
    }, 140);
  };
  const toggle = () => {
    if (!blocked)
      update((p) =>
        setFolderRule(p, folder.id, {
          ...(p.settings.folderRules[folder.id] ?? { mode: 'auto' }),
          mode: active
            ? 'hide'
            : p.settings.folderRules[folder.id]?.schedule
              ? 'show'
              : 'auto',
        }),
      );
  };
  useEffect(
    () => () => {
      clearTimeout(hoverTimer.current);
      clearTimeout(clickTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!popup) return;
    if (focusActions.current) {
      actions.current?.querySelector<HTMLButtonElement>('button')?.focus();
      focusActions.current = false;
    }
    const dismiss = () => setPopup(undefined);
    window.addEventListener('resize', dismiss);
    document.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('scroll', dismiss, true);
    };
  }, [popup]);
  return (
    <div
      ref={chip}
      tabIndex={blocked ? 0 : -1}
      role={blocked ? 'group' : undefined}
      aria-label={
        blocked
          ? `${folder.title}, hidden by ${parent?.title ?? 'parent folder'}. Down arrow for schedule and color.`
          : undefined
      }
      onKeyDown={(e) => {
        if (blocked && e.key === 'ArrowDown') {
          e.preventDefault();
          focusActions.current = true;
          open();
        }
      }}
      className={`folder-control ${active ? 'active' : ''} ${blocked ? 'parent-hidden' : ''}`}
      title={`${item.label} · ${reason}${scheduled ? ` · ${scheduleSummary(rule.schedule!)}` : ''}`}
      onPointerEnter={open}
      onPointerLeave={leave}
      onFocus={(e) => {
        if (!popup && (e.target as HTMLElement).matches(':focus-visible'))
          open();
      }}
      onBlur={(e) => {
        if (
          !chip.current?.contains(e.relatedTarget as Node) &&
          !actions.current?.contains(e.relatedTarget as Node)
        )
          close();
      }}
    >
      <button
        ref={trigger}
        className="folder-toggle"
        aria-label={`Show ${folder.title} bookmarks`}
        aria-description={`${item.label}. Click to toggle. Double-click to choose a color. Down arrow opens folder actions.`}
        aria-pressed={active}
        disabled={!!blocked}
        style={
          compact ? { paddingLeft: 12 + (path.length - 1) * 14 } : undefined
        }
        onClick={(e) => {
          clearTimeout(clickTimer.current);
          if (e.detail === 0) toggle();
          else if (e.detail === 1) clickTimer.current = setTimeout(toggle, 350);
        }}
        onDoubleClick={() => {
          clearTimeout(clickTimer.current);
          close();
          onColor(item);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusActions.current = true;
            open();
          }
          if (e.key === 'Escape') close();
        }}
      >
        <span
          className="folder-indicator"
          style={
            rule?.color
              ? { background: rule.color, borderColor: rule.color }
              : undefined
          }
        />
        <span className="folder-control-name">
          {folder.title}
          {compact && <small>{reason}</small>}
        </span>
      </button>
      {popup &&
        createPortal(
          <div
            ref={actions}
            role="toolbar"
            aria-label={`${folder.title} actions`}
            className="folder-actions"
            style={popup}
            onPointerEnter={() => clearTimeout(hoverTimer.current)}
            onPointerLeave={leave}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
                (trigger.current?.disabled
                  ? chip.current
                  : trigger.current
                )?.focus();
              }
              if (['Tab', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                const buttons = [
                  ...actions.current!.querySelectorAll('button'),
                ];
                const current = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                buttons[
                  (current +
                    (e.shiftKey || e.key === 'ArrowLeft'
                      ? buttons.length - 1
                      : 1)) %
                    buttons.length
                ]?.focus();
              }
            }}
          >
            <button
              className={`folder-clock ${scheduled ? 'scheduled' : ''}`}
              aria-label={`Schedule ${folder.title}`}
              title="Schedule"
              onClick={() => {
                (trigger.current?.disabled
                  ? chip.current
                  : trigger.current
                )?.focus();
                close();
                onSchedule(item);
              }}
            >
              <Clock3 size={15} />
            </button>
            <button
              className="folder-palette"
              aria-label={`Color ${folder.title}`}
              title="Folder color · double-click the folder"
              onClick={() => {
                (trigger.current?.disabled
                  ? chip.current
                  : trigger.current
                )?.focus();
                close();
                onColor(item);
              }}
            >
              <Palette size={15} />
            </button>
            {manual && (
              <button
                className="folder-auto"
                aria-label={`Resume schedule for ${folder.title}`}
                title="Resume schedule"
                onClick={() => {
                  update((p) =>
                    setFolderRule(p, folder.id, {
                      ...p.settings.folderRules[folder.id],
                      mode: 'auto',
                    }),
                  );
                  close();
                }}
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function FolderControls({
  snapshot,
  prefs,
  update,
  now,
  onSchedule,
  onColor,
  compact = false,
}: {
  snapshot?: BookmarkSnapshot;
  prefs: Preferences;
  update: Update;
  now: number;
  onSchedule: (folder: IncludedFolder) => void;
  onColor: (folder: IncludedFolder) => void;
  compact?: boolean;
}) {
  const folders = includedFolders(snapshot?.folders ?? [], prefs.settings);
  if (!folders.length) return null;
  return (
    <nav
      className={compact ? 'folder-controls' : 'folder-toolbar'}
      aria-label={compact ? 'Folder visibility settings' : 'Folder visibility'}
    >
      <div className="folder-controls-list">
        {folders.map((item) => (
          <FolderChip
            key={item.folder.id}
            item={item}
            snapshot={snapshot}
            prefs={prefs}
            update={update}
            now={now}
            onSchedule={onSchedule}
            onColor={onColor}
            compact={compact}
          />
        ))}
      </div>
    </nav>
  );
}

export function FolderColorDialog({
  item,
  prefs,
  update,
  onClose,
}: {
  item: IncludedFolder;
  prefs: Preferences;
  update: Update;
  onClose: () => void;
}) {
  const color = prefs.settings.folderRules[item.folder.id]?.color;
  const setColor = (color: string | undefined) =>
    update((p) =>
      setFolderRule(p, item.folder.id, {
        ...(p.settings.folderRules[item.folder.id] ?? { mode: 'auto' }),
        color,
      }),
    );
  return (
    <Modal title={`Color ${item.folder.title}`} onClose={onClose}>
      <div className="dialog-form">
        <p className="muted">
          This folder’s color surrounds each bubble and blends into its favicon
          color. Subfolders inherit it unless they have their own color.
        </p>
        <label className="setting-row">
          Folder color
          <input
            data-autofocus
            type="color"
            aria-label="Folder color"
            value={color ?? '#a997dc'}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <button className="text-button" onClick={() => setColor(undefined)}>
          Use inherited color
        </button>
        <button className="primary-button" onClick={onClose}>
          Done
          <Check size={15} />
        </button>
      </div>
    </Modal>
  );
}

export function FolderScheduleDialog({
  item,
  prefs,
  update,
  onClose,
}: {
  item: IncludedFolder;
  prefs: Preferences;
  update: Update;
  onClose: () => void;
}) {
  const rule = prefs.settings.folderRules[item.folder.id];
  const [enabled, setEnabled] = useState(!!rule?.schedule);
  const [start, setStart] = useState(rule?.schedule?.start ?? '09:00'),
    [end, setEnd] = useState(rule?.schedule?.end ?? '17:00');
  const [days, setDays] = useState(rule?.schedule?.days ?? [1, 2, 3, 4, 5]),
    [error, setError] = useState('');
  const save = (e: FormEvent) => {
    e.preventDefault();
    try {
      const next: FolderRule = {
        ...rule,
        mode: 'auto',
        schedule: enabled ? { start, end, days } : undefined,
      };
      const validated = validatePreferences(
        setFolderRule(prefs, item.folder.id, next),
      ).settings.folderRules[item.folder.id];
      update((p) =>
        setFolderRule(p, item.folder.id, {
          ...p.settings.folderRules[item.folder.id],
          mode: 'auto',
          schedule: validated.schedule,
        }),
      );
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to save this schedule.',
      );
    }
  };
  return (
    <Modal title={`Schedule ${item.folder.title}`} onClose={onClose}>
      <form className="folder-schedule-form" onSubmit={save}>
        <label className="setting-row">
          <span>Use a schedule</span>
          <input
            aria-label="Use a schedule"
            className="switch"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </label>
        {enabled && (
          <>
            <div className="folder-time-range">
              <label>
                From
                <input
                  className="text-input"
                  type="time"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <span>to</span>
              <label>
                Until
                <input
                  className="text-input"
                  type="time"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
            <fieldset className="folder-days">
              <legend>Repeat</legend>
              <div>
                {WEEKDAYS.map(({ day, label, name }) => (
                  <button
                    type="button"
                    key={day}
                    aria-label={name}
                    aria-pressed={days.includes(day)}
                    className={days.includes(day) ? 'active' : ''}
                    onClick={() =>
                      setDays((previous) =>
                        previous.includes(day)
                          ? previous.filter((d) => d !== day)
                          : [...previous, day],
                      )
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="folder-day-presets">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setDays([1, 2, 3, 4, 5])}
                >
                  Weekdays
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}
                >
                  Every day
                </button>
              </div>
            </fieldset>
            <p className="muted">
              {Intl.DateTimeFormat().resolvedOptions().timeZone} ·{' '}
              {start > end
                ? 'Overnight, starting on the selected days.'
                : 'Local time.'}
            </p>
          </>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Save schedule
            <Check size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
