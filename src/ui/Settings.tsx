import { useState, type ReactNode } from 'react';
import {
  Activity,
  BookOpen,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Layers3,
  Palette,
  Quote,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  RotateCcw,
} from 'lucide-react';
import type {
  BookmarkSnapshot,
  Preferences,
  Settings as SettingsType,
} from '../core/types';
import { exportPreferences, importPreferences } from '../core/settings';
import { modeLabel, weightsFor } from '../core/scoring';
import { clearActivity } from '../data/storage';
import { Modal } from './Modal';
import { FolderControls } from './FolderControls';
import type { IncludedFolder } from '../core/folders';
import { HeaderSettingsPanel } from './HeaderSettings';
type Update = (fn: (previous: Preferences) => Preferences) => void;
export function FolderPicker({
  snapshot,
  selected,
  onChange,
}: {
  snapshot?: BookmarkSnapshot;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const stack: { id: string; depth: number }[] = [];
  return (
    <div className="folder-list">
      {snapshot?.folders.length ? (
        snapshot.folders.map((folder) => {
          while (stack.length && stack.at(-1)!.depth >= folder.depth)
            stack.pop();
          const covered = stack.some((p) => selected.includes(p.id));
          stack.push(folder);
          return (
            <label
              className={`folder-row ${covered ? 'covered' : ''}`}
              key={folder.id}
              style={{ paddingLeft: 14 + folder.depth * 18 }}
            >
              <input
                type="checkbox"
                checked={covered || selected.includes(folder.id)}
                disabled={covered}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, folder.id]
                      : selected.filter((id) => id !== folder.id),
                  )
                }
              />
              <FolderOpen size={17} />
              <span>{folder.title}</span>
              <small>{folder.count}</small>
            </label>
          );
        })
      ) : (
        <p className="muted">
          No bookmark folders found. Add a bookmark in your browser, then retry.
        </p>
      )}
    </div>
  );
}
function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <span>
        {label}
        {detail && <small>{detail}</small>}
      </span>
      <input
        className="switch"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
function Range({
  label,
  value,
  min,
  max,
  unit = '',
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <output>
          {Math.round(value * 10) / 10}
          {unit}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
export function Settings({
  prefs,
  update,
  snapshot,
  onClose,
  refresh,
  onAdd,
  now,
  onSchedule,
  onColor,
}: {
  prefs: Preferences;
  update: Update;
  snapshot?: BookmarkSnapshot;
  onClose: () => void;
  refresh: () => void;
  onAdd: () => void;
  now: number;
  onSchedule: (folder: IncludedFolder) => void;
  onColor: (folder: IncludedFolder) => void;
}) {
  const [tab, setTab] = useState('Bookmarks'),
    [query, setQuery] = useState(''),
    [notice, setNotice] = useState('');
  const s = prefs.settings;
  const set = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) =>
    update((p) => ({ ...p, settings: { ...p.settings, [key]: value } }));
  const error = (e: unknown) =>
    setNotice(
      e instanceof Error ? e.message : 'Unable to complete this action.',
    );
  const tabs = [
    { name: 'Bookmarks', icon: BookOpen },
    { name: 'Activity', icon: Activity },
    { name: 'Appearance', icon: Palette },
    { name: 'Header', icon: Quote },
    { name: 'Layout', icon: Layers3 },
    { name: 'Data', icon: ShieldCheck },
  ];
  const managed =
    snapshot?.bookmarks.filter(
      (b) =>
        b.ancestors.some((id) => s.folderIds.includes(id)) &&
        `${b.title} ${b.url}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <Modal
      title="Make it yours"
      className="settings-backdrop"
      onClose={onClose}
    >
      <p className="panel-subtitle">
        A little more you. Changes save automatically.
      </p>
      <nav className="settings-tabs" aria-label="Settings sections">
        {tabs.map(({ name, icon: Icon }) => (
          <button
            key={name}
            className={tab === name ? 'active' : ''}
            aria-current={tab === name ? 'page' : undefined}
            onClick={() => {
              setTab(name);
              setNotice('');
            }}
          >
            <Icon size={17} />
            <span>{name}</span>
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {tab === 'Bookmarks' && (
          <>
            <Section title="Your bookmark folders">
              <p className="muted">
                Choose your library. Subfolders are included; use the visibility
                controls below to turn any of them off.
              </p>
              <FolderPicker
                snapshot={snapshot}
                selected={s.folderIds}
                onChange={(v) => set('folderIds', v)}
              />
              {!!snapshot?.blocked && (
                <p className="muted">
                  {snapshot.blocked} script, data or unsupported bookmarks are
                  excluded for safe navigation. Your browser bookmarks are
                  unchanged.
                </p>
              )}
              <button className="text-button" onClick={onAdd}>
                + Add a bookmark
              </button>
            </Section>
            <Section title="Folder visibility & schedules">
              <p className="muted">
                Toggle folders here or at the top of Orbit. A hidden parent
                hides its subfolders too. Hover for schedules and colors, or
                double-click a folder to change its color.
              </p>
              <FolderControls
                compact
                snapshot={snapshot}
                prefs={prefs}
                update={update}
                now={now}
                onSchedule={onSchedule}
                onColor={onColor}
              />
            </Section>
            <Section title="Organization">
              <Toggle
                label="Group by website"
                detail="Open a bubble to explore its bookmarked pages."
                checked={s.grouping}
                onChange={(v) => set('grouping', v)}
              />
            </Section>
            <Section title="Visible bookmarks">
              <input
                className="text-input"
                type="search"
                aria-label="Find a bookmark to show or hide"
                placeholder="Find a bookmark…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="manage-list">
                {managed.map((b) => (
                  <div key={b.id} className="manage-row">
                    <span>
                      {b.title}
                      <small>{b.domain}</small>
                    </span>
                    <button
                      className="icon-button"
                      aria-label={`${s.hiddenIds.includes(b.id) ? 'Show' : 'Hide'} ${b.title}`}
                      onClick={() =>
                        set(
                          'hiddenIds',
                          s.hiddenIds.includes(b.id)
                            ? s.hiddenIds.filter((id) => id !== b.id)
                            : [...s.hiddenIds, b.id],
                        )
                      }
                    >
                      {s.hiddenIds.includes(b.id) ? (
                        <EyeOff size={17} />
                      ) : (
                        <Eye size={17} />
                      )}
                    </button>
                  </div>
                ))}
                {!managed.length && (
                  <p className="muted">
                    No matching bookmarks in your selected folders.
                  </p>
                )}
              </div>
              {s.hiddenIds.length > 0 && (
                <button
                  className="text-button"
                  onClick={() => set('hiddenIds', [])}
                >
                  Show all hidden bookmarks
                </button>
              )}
            </Section>
          </>
        )}
        {tab === 'Activity' && (
          <>
            <Section title="Let your habits shape your space">
              <p className="muted">
                Bubbles grow with recent visits. Every bookmark keeps its place,
                even with no activity.
              </p>
              <label className="select-field">
                Activity mode
                <select
                  value={s.mode}
                  onChange={(e) =>
                    set('mode', e.target.value as SettingsType['mode'])
                  }
                >
                  {(
                    ['today', 'three', 'seven', 'balanced', 'custom'] as const
                  ).map((mode) => (
                    <option key={mode} value={mode}>
                      {modeLabel(mode)}
                    </option>
                  ))}
                </select>
              </label>
              <Toggle
                label="Automatic resizing"
                detail="Turn off to keep a calm, uniform orbit."
                checked={s.autoResize}
                onChange={(v) => set('autoResize', v)}
              />
            </Section>
            <Section title="Recency weights">
              <p className="muted">
                Custom mode uses these relative weights across seven local
                calendar days. Weights are normalized to 100%.
              </p>
              {['Today', 'Previous 2 days', 'Previous 4 days'].map(
                (label, i) => (
                  <Range
                    key={label}
                    label={label}
                    value={s.weights[i]}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(v) => {
                      const weights = [...s.weights] as [
                        number,
                        number,
                        number,
                      ];
                      weights[i] = v;
                      if (weights.some((w) => w > 0))
                        update((p) => ({
                          ...p,
                          settings: { ...p.settings, weights, mode: 'custom' },
                        }));
                    }}
                  />
                ),
              )}
              <div className="formula">
                Effective weights:{' '}
                {weightsFor(s.mode, s.weights)
                  .map((w) => `${Math.round(w * 100)}%`)
                  .join(' / ')}
              </div>
            </Section>
            <Section title="Understanding your activity">
              <p className="muted">
                Visit timestamps come from your browser’s available history.
                Missing or cleared history counts as zero. Subframe loads are
                excluded. A logarithmic curve keeps growth gentle, with a fixed
                upper limit.
              </p>
              <button
                className="secondary-button"
                onClick={() => {
                  refresh();
                  setNotice('Refreshing available browser history…');
                }}
              >
                <RotateCcw size={15} /> Refresh activity
              </button>
            </Section>
          </>
        )}
        {tab === 'Appearance' && (
          <>
            <Section title="Set the mood">
              <div className="segmented">
                {(['dark', 'light', 'auto'] as const).map((theme) => (
                  <button
                    key={theme}
                    aria-pressed={s.theme === theme}
                    className={s.theme === theme ? 'active' : ''}
                    onClick={() => set('theme', theme)}
                  >
                    {theme[0].toUpperCase() + theme.slice(1)}
                  </button>
                ))}
              </div>
              <label className="select-field">
                Background
                <select
                  value={s.background}
                  onChange={(e) =>
                    set(
                      'background',
                      e.target.value as SettingsType['background'],
                    )
                  }
                >
                  <option value="aurora">Midnight glow</option>
                  <option value="dusk">Lavender dusk</option>
                  <option value="solid">Solid color</option>
                  <option value="image">Your own image</option>
                </select>
              </label>
              {s.background === 'solid' && (
                <label className="setting-row">
                  Background color
                  <input
                    aria-label="Background color"
                    type="color"
                    value={s.backgroundColor}
                    onChange={(e) => set('backgroundColor', e.target.value)}
                  />
                </label>
              )}
              {s.background === 'image' && (
                <>
                  <label className="upload-button">
                    <Upload size={15} /> Choose a local image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          if (
                            file.size > 2_000_000 ||
                            !['image/png', 'image/jpeg', 'image/webp'].includes(
                              file.type,
                            )
                          )
                            throw new Error(
                              'Choose a PNG, JPEG or WebP smaller than 2 MB.',
                            );
                          const reader = new FileReader();
                          reader.onload = () =>
                            set('backgroundImage', String(reader.result));
                          reader.onerror = () =>
                            setNotice('Could not read that image.');
                          reader.readAsDataURL(file);
                        } catch (e) {
                          error(e);
                        }
                      }}
                    />
                  </label>
                  <p className="muted">
                    PNG, JPEG or WebP, up to 2 MB. Stored only on this device.
                  </p>
                  {s.backgroundImage && (
                    <button
                      className="text-button"
                      onClick={() =>
                        update((p) => ({
                          ...p,
                          settings: {
                            ...p.settings,
                            backgroundImage: '',
                            background: 'aurora',
                          },
                        }))
                      }
                    >
                      Remove image
                    </button>
                  )}
                </>
              )}
            </Section>
            <Section title="Glass & color">
              <Range
                label="Glass opacity"
                value={s.glass}
                min={8}
                max={70}
                unit="%"
                onChange={(v) => set('glass', v)}
              />
              <Range
                label="Blur"
                value={s.blur}
                min={0}
                max={20}
                unit=" px"
                onChange={(v) => set('blur', v)}
              />
              <Range
                label="Color intensity"
                value={s.colorIntensity}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => set('colorIntensity', v)}
              />
              <Range
                label="Favicon scale"
                value={s.faviconScale}
                min={20}
                max={50}
                unit="%"
                onChange={(v) => set('faviconScale', v)}
              />
              <label className="select-field">
                Bookmark labels
                <select
                  value={s.labels}
                  onChange={(e) =>
                    set('labels', e.target.value as SettingsType['labels'])
                  }
                >
                  <option value="auto">Automatic</option>
                  <option value="always">Always visible</option>
                  <option value="hover">On hover & focus</option>
                </select>
              </label>
            </Section>
          </>
        )}
        {tab === 'Header' && (
          <HeaderSettingsPanel
            settings={s.header}
            now={now}
            onChange={(patch) =>
              update((p) => ({
                ...p,
                settings: {
                  ...p.settings,
                  header: { ...p.settings.header, ...patch },
                },
              }))
            }
          />
        )}
        {tab === 'Layout' && (
          <>
            <Section title="Give everything some space">
              <Range
                label="Minimum bubble diameter"
                value={s.minSize}
                min={44}
                max={120}
                unit=" px"
                onChange={(v) =>
                  update((p) => ({
                    ...p,
                    settings: {
                      ...p.settings,
                      minSize: v,
                      maxSize: Math.max(v, p.settings.maxSize),
                    },
                  }))
                }
              />
              <Range
                label="Maximum bubble diameter"
                value={s.maxSize}
                min={64}
                max={240}
                unit=" px"
                onChange={(v) =>
                  update((p) => ({
                    ...p,
                    settings: {
                      ...p.settings,
                      maxSize: v,
                      minSize: Math.min(v, p.settings.minSize),
                    },
                  }))
                }
              />
              <Range
                label="Space between bubbles"
                value={s.spacing}
                min={4}
                max={40}
                unit=" px"
                onChange={(v) => set('spacing', v)}
              />
              <Range
                label="Center attraction"
                value={s.attraction}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => set('attraction', v)}
              />
              <p className="muted">
                On smaller screens, bubbles become more compact. The bookmark
                list always contains your complete collection.
              </p>
            </Section>
            <Section title="A gentle sense of motion">
              <Toggle
                label="Animations"
                detail="Reduced-motion system preferences always take priority."
                checked={s.motion}
                onChange={(v) => set('motion', v)}
              />
              <Range
                label="Floating intensity"
                value={s.floatIntensity}
                min={0}
                max={4}
                step={0.5}
                unit=" px"
                onChange={(v) => set('floatIntensity', v)}
              />
              <Range
                label="Layout movement intensity"
                value={s.physics}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => set('physics', v)}
              />
            </Section>
            <Section title="Start fresh">
              <button
                className="secondary-button"
                onClick={() => {
                  update((p) => ({ ...p, positions: {} }));
                  setNotice(
                    'Positions reset. Pinned bubbles keep their fixed sizes.',
                  );
                }}
              >
                <RotateCcw size={15} /> Reset positions
              </button>
            </Section>
          </>
        )}
        {tab === 'Data' && (
          <>
            <Section title="Your space. Your data.">
              <div className="privacy-card">
                <ShieldCheck size={25} />
                <strong>Private by design</strong>
                <p>
                  Orbit reads bookmarks and available browsing history to
                  arrange your space. Settings, positions and derived visit
                  counts stay in this browser profile. No accounts, analytics,
                  external servers or background website requests.
                </p>
              </div>
            </Section>
            <Section title="Take your preferences with you">
              <p className="muted">
                Exports include appearance, folder IDs, hidden entries, bubble
                colors, fixed sizes and positions. Visit counts and browser
                history are excluded. Folder and bookmark IDs belong to this
                profile; reselect folders on another profile.
              </p>
              <div className="button-row">
                <button
                  className="secondary-button"
                  onClick={() => {
                    const blob = new Blob([exportPreferences(prefs)], {
                        type: 'application/json',
                      }),
                      url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'orbit-preferences.json';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  <Download size={15} /> Export
                </button>
                <label className="upload-button">
                  <Upload size={15} /> Import
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        if (file.size > 5_000_000)
                          throw new Error('Preference file is too large.');
                        const imported = importPreferences(await file.text());
                        update(() => imported);
                        setNotice('Preferences imported.');
                      } catch (e) {
                        error(e);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </Section>
            <Section title="Local activity cache">
              <p className="muted">
                Clear Orbit’s derived counts and reread available history. This
                does not erase browser history or change bookmarks.
              </p>
              <button
                className="secondary-button"
                onClick={() => {
                  void clearActivity()
                    .then(() => {
                      refresh();
                      setNotice('Local activity cache cleared.');
                    })
                    .catch(error);
                }}
              >
                <RotateCcw size={15} /> Clear cached activity
              </button>
            </Section>
            <div className="version-label">
              <SlidersHorizontal size={14} /> Orbit New Tab · 1.3.2
            </div>
          </>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </div>
    </Modal>
  );
}
