import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FolderOpen,
  List,
  LoaderCircle,
  MoreHorizontal,
  Orbit,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useOrbit } from './data/useOrbit';
import { useFolderTime } from './data/useFolderTime';
import { useHeaderQuote } from './data/useHeaderQuote';
import { hasBrowser } from './data/storage';
import {
  createEntries,
  eligibleBookmarks,
  libraryBookmarks,
} from './core/bookmarks';
import type { IncludedFolder } from './core/folders';
import { layoutBubbles } from './core/layout';
import { modeLabel, windowVisits } from './core/scoring';
import { safeUrl } from './core/urls';
import type {
  Bookmark,
  BubbleEntry,
  Override,
  Settings as SettingsType,
} from './core/types';
import { Bubble } from './ui/Bubble';
import { HeaderTitle } from './ui/HeaderTitle';
import { useBubblePresence } from './ui/useBubblePresence';
import { Favicon } from './ui/Favicon';
import { Modal } from './ui/Modal';
import { FolderPicker, Settings } from './ui/Settings';
import {
  FolderControls,
  FolderScheduleDialog,
  FolderColorDialog,
} from './ui/FolderControls';
type Dialog =
  | { kind: 'customize' | 'activity' | 'group' | 'remove'; entry: BubbleEntry }
  | { kind: 'edit'; bookmark: Bookmark }
  | { kind: 'add' };
function BookmarkForm({
  bookmark,
  folders,
  defaultFolder,
  onDone,
  onError,
}: {
  bookmark?: Bookmark;
  folders: { id: string; title: string; depth: number }[];
  defaultFolder?: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(bookmark?.title ?? ''),
    [url, setUrl] = useState(bookmark?.url ?? 'https://'),
    [folder, setFolder] = useState(defaultFolder ?? folders[0]?.id ?? ''),
    [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const safe = safeUrl(url.trim());
    if (!safe) {
      onError(
        'Use a valid web, file or browser URL. Script and data URLs are not supported.',
      );
      return;
    }
    setBusy(true);
    try {
      if (bookmark)
        await chrome.bookmarks.update(bookmark.id, {
          title: title.trim() || safe,
          url: safe,
        });
      else
        await chrome.bookmarks.create({
          parentId: folder || undefined,
          title: title.trim() || safe,
          url: safe,
        });
      onDone();
    } catch (error) {
      onError(
        error instanceof Error ? error.message : 'Could not save the bookmark.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={(e) => {
        void submit(e);
      }}
      className="dialog-form"
    >
      <label>
        Title
        <input
          data-autofocus
          className="text-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give this bookmark a name"
          maxLength={500}
        />
      </label>
      <label>
        URL
        <input
          className="text-input"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          maxLength={10000}
        />
      </label>
      {!bookmark && (
        <label className="select-field">
          Folder
          <select value={folder} onChange={(e) => setFolder(e.target.value)}>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {'— '.repeat(f.depth)}
                {f.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="muted">This saves directly to your browser bookmarks.</p>
      <button
        className="primary-button"
        disabled={busy || !hasBrowser()}
        type="submit"
      >
        {busy ? 'Saving…' : bookmark ? 'Save bookmark' : 'Add bookmark'}
        <Check size={16} />
      </button>
    </form>
  );
}
function ContextMenu({
  entry,
  x,
  y,
  onClose,
  onAction,
}: {
  entry: BubbleEntry;
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [onClose]);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${entry.title}`}
      className="context-menu"
      style={{
        left: Math.max(8, Math.min(x, window.innerWidth - 238)),
        top: Math.max(8, Math.min(y, window.innerHeight - 380)),
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Tab') {
          onClose();
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const buttons = [...ref.current!.querySelectorAll('button')];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          buttons[
            (index + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) %
              buttons.length
          ]?.focus();
        }
      }}
    >
      <div className="context-title">{entry.title}</div>
      {[
        ['open', 'Open in new tab'],
        ['pin', entry.pinned ? 'Unpin bubble' : 'Pin bubble'],
        ['customize', 'Change color & size'],
        ['activity', 'Show recent activity'],
        ['hide', 'Hide from Orbit'],
        [
          'edit',
          entry.members.length > 1
            ? 'Manage bookmarked pages'
            : 'Edit bookmark',
        ],
        [
          'remove',
          entry.members.length > 1
            ? 'Choose a page to remove…'
            : 'Remove bookmark…',
        ],
      ].map(([action, label]) => (
        <button
          key={action}
          role="menuitem"
          className={action === 'remove' ? 'danger-text' : ''}
          onClick={() => onAction(action)}
        >
          {label}
          {action === 'open' && <ExternalLink size={13} />}
        </button>
      ))}
    </div>,
    document.body,
  );
}
export default function App() {
  const {
    prefs,
    update,
    bookmarks,
    activity,
    loading,
    error,
    ready,
    refresh,
    setError,
  } = useOrbit();
  const [settingsOpen, setSettingsOpen] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [listOpen, setListOpen] = useState(false),
    [query, setQuery] = useState(''),
    [resultIndex, setResultIndex] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(),
    [folderDialog, setFolderDialog] = useState<IncludedFolder>(),
    [folderColorDialog, setFolderColorDialog] = useState<IncludedFolder>(),
    [menu, setMenu] = useState<{ entry: BubbleEntry; x: number; y: number }>(),
    [dialogError, setDialogError] = useState(''),
    [hidden, setHidden] = useState(document.hidden);
  const [size, setSize] = useState({ width: 0, height: 0 }),
    [reducedMotion, setReducedMotion] = useState(
      matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
    [systemLight, setSystemLight] = useState(
      matchMedia('(prefers-color-scheme: light)').matches,
    );
  const canvas = useRef<HTMLDivElement>(null),
    searchRef = useRef<HTMLInputElement>(null);
  const s = prefs.settings;
  const now = useFolderTime(
    s.folderRules,
    s.header.rotate && s.header.scheduled,
  );
  const headerQuote = useHeaderQuote(s.header, now, ready);
  const entranceMotion = s.motion && !hidden && !reducedMotion;
  const selected = useMemo(
    () => eligibleBookmarks(bookmarks?.bookmarks ?? [], prefs, now),
    [bookmarks, prefs, now],
  );
  const foldersPaused =
    !selected.length &&
    libraryBookmarks(bookmarks?.bookmarks ?? [], prefs).length > 0;
  const entries = useMemo(
    () => createEntries(selected, prefs, activity),
    [selected, prefs, activity],
  );
  const layout = useMemo(
    () =>
      layoutBubbles(entries, {
        ...size,
        spacing: s.spacing,
        attraction: s.attraction,
        physics: s.physics,
        positions: prefs.positions,
      }),
    [entries, size, s.spacing, s.attraction, s.physics, prefs.positions],
  );
  const entryMap = useMemo(
    () => new Map(entries.map((e) => [e.id, e])),
    [entries],
  );
  const liveBubbles = useMemo(
    () =>
      s.onboarded
        ? layout.nodes.map((node) => ({
            key: `${node.id}:${entryMap.get(node.id)!.url}`,
            node,
            entry: entryMap.get(node.id)!,
          }))
        : [],
    [layout.nodes, entryMap, s.onboarded],
  );
  const activeIds = useMemo(
    () => new Set(entries.map((entry) => entry.id)),
    [entries],
  );
  const { views: bubbleViews, finishExit } = useBubblePresence(
    liveBubbles,
    activeIds,
    entranceMotion && s.onboarded,
  );
  const results = useMemo(
    () =>
      entries.filter((e) =>
        `${e.title} ${e.url} ${e.members.map((m) => `${m.title} ${m.url}`).join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [entries, query],
  );
  const matching = new Set(results.map((e) => e.id));
  const light = s.theme === 'light' || (s.theme === 'auto' && systemLight);
  useEffect(() => {
    setResultIndex((previous) =>
      Math.min(previous, Math.max(0, results.length - 1)),
    );
  }, [results.length]);
  useEffect(() => {
    // A scheduled folder can disappear while a group or its actions are open.
    // Keep those views scoped to the currently visible members. Preserve the
    // specifically chosen bookmark in edit/remove confirmation dialogs.
    setMenu((previous) => {
      if (!previous) return previous;
      const current = entryMap.get(previous.entry.id);
      return current ? { ...previous, entry: current } : undefined;
    });
    setDialog((previous) => {
      if (
        !previous ||
        previous.kind === 'add' ||
        previous.kind === 'edit' ||
        previous.kind === 'remove'
      )
        return previous;
      const current = entryMap.get(previous.entry.id);
      return current ? { ...previous, entry: current } : undefined;
    });
  }, [entryMap]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: light)'),
      motionMedia = matchMedia('(prefers-reduced-motion: reduce)'),
      motion = () => setReducedMotion(motionMedia.matches),
      theme = () => setSystemLight(media.matches),
      visibility = () => setHidden(document.hidden);
    media.addEventListener('change', theme);
    motionMedia.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      media.removeEventListener('change', theme);
      motionMedia.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
  }, [light]);
  useEffect(() => {
    if (searchOpen || listOpen)
      document
        .querySelector('.result-row.active')
        ?.scrollIntoView({ block: 'nearest' });
  }, [resultIndex, searchOpen, listOpen]);
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
      }),
    );
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.key === '/' || e.key.toLowerCase() === 'b') &&
        !e.repeat &&
        !e.defaultPrevented &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !(e.target as HTMLElement).closest(
          'input, textarea, select, [contenteditable]:not([contenteditable=false])',
        ) &&
        !settingsOpen &&
        !folderDialog &&
        !folderColorDialog &&
        !dialog &&
        !listOpen
      ) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [settingsOpen, dialog, listOpen, folderDialog, folderColorDialog]);
  useEffect(() => {
    if (loading || !ready || !s.onboarded || !layout.nodes.length) return;
    const timeout = setTimeout(
      () =>
        update((p) => {
          const missing = layout.nodes.filter((n) => !p.positions[n.id]);
          if (!missing.length) return p;
          return {
            ...p,
            positions: {
              ...p.positions,
              ...Object.fromEntries(
                missing.map((n) => [
                  n.id,
                  { x: n.x / size.width, y: n.y / size.height },
                ]),
              ),
            },
          };
        }),
      600,
    );
    return () => clearTimeout(timeout);
  }, [layout.nodes, loading, ready, s.onboarded, size, update]);
  const override = (id: string, patch: Override) =>
    update((p) => ({
      ...p,
      overrides: { ...p.overrides, [id]: { ...p.overrides[id], ...patch } },
    }));
  const openDialog = (next: Dialog) => {
    setDialogError('');
    setDialog(next);
    setMenu(undefined);
  };
  const closeMenu = useCallback(() => setMenu(undefined), []);
  const openResult = (entry: BubbleEntry) => {
    if (s.grouping) {
      setSearchOpen(false);
      setListOpen(false);
      openDialog({ kind: 'group', entry });
    } else window.location.assign(entry.url);
  };
  const action = (name: string) => {
    const entry = menu!.entry;
    setMenu(undefined);
    if (name === 'open') {
      void chrome.tabs.create({ url: entry.url });
      return;
    }
    if (name === 'pin') {
      override(
        entry.id,
        entry.pinned
          ? { pinned: false, size: undefined }
          : { pinned: true, size: entry.size },
      );
      return;
    }
    if (name === 'hide') {
      update((p) => ({
        ...p,
        settings: {
          ...p.settings,
          hiddenIds: [
            ...new Set([
              ...p.settings.hiddenIds,
              ...entry.members.map((b) => b.id),
            ]),
          ],
        },
      }));
      return;
    }
    if (name === 'edit') {
      openDialog(
        entry.members.length > 1
          ? { kind: 'group', entry }
          : { kind: 'edit', bookmark: entry.members[0] },
      );
      return;
    }
    if (name === 'remove' && entry.members.length > 1) {
      openDialog({ kind: 'group', entry });
      return;
    }
    openDialog({ kind: name as 'customize' | 'activity' | 'remove', entry });
  };
  const style = {
    '--glass': `${s.glass}%`,
    '--glass-blur': `${s.blur}px`,
    '--color-intensity': `${s.colorIntensity}%`,
    '--layout-duration': s.physics === 0 ? '0ms' : `${300 + s.physics * 11}ms`,
    ...(s.background === 'solid' ? { background: s.backgroundColor } : {}),
    ...(s.background === 'image' && s.backgroundImage
      ? {
          backgroundImage: `linear-gradient(${light ? '#ffffff60, #ffffff70' : '#080f1a60, #080f1a90'}), url("${s.backgroundImage}")`,
        }
      : {}),
  } as CSSProperties;
  const uniqueActivity = new Map(
    entries.map((e) => [
      s.grouping ? e.domain : e.members[0].canonical,
      e.activity,
    ]),
  );
  const totalToday = [...uniqueActivity.values()].reduce(
    (sum, a) => sum + a.today,
    0,
  );
  return (
    <main
      className={`app background-${s.background} ${s.motion && !hidden ? 'motion' : 'still'}`}
      style={style}
    >
      <header className="topbar" aria-label="Orbit controls">
        <a
          className="brand"
          href={hasBrowser() ? chrome.runtime.getURL('index.html') : '#'}
          aria-label="Orbit home"
        >
          <span className="brand-symbol">
            <Orbit size={26} strokeWidth={1.3} />
          </span>
          <span>
            orbit<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="topbar-right">
          <button
            className="icon-button"
            aria-label="Search bookmarks"
            title="Search bookmarks (B or /)"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Open settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      <section className="hero">
        <HeaderTitle
          key={headerQuote}
          quote={headerQuote}
          motion={entranceMotion}
        />
      </section>
      {s.onboarded && (
        <FolderControls
          snapshot={bookmarks}
          prefs={prefs}
          update={update}
          now={now}
          onSchedule={setFolderDialog}
          onColor={setFolderColorDialog}
        />
      )}
      <div
        className="workspace"
        ref={canvas}
        aria-label="Bookmark bubble canvas"
      >
        {bubbleViews.map(({ key, node, entry, exiting }) => {
          return (
            <Bubble
              key={key}
              entry={entry}
              node={node}
              settings={s}
              entranceMotion={entranceMotion}
              exiting={exiting}
              onExitComplete={() => finishExit(key)}
              dimmed={!!query && !matching.has(entry.id)}
              selected={!!query && results[resultIndex]?.id === entry.id}
              manualSize={prefs.overrides[entry.id]?.size !== undefined}
              bounds={size}
              onDrop={(id, x, y) =>
                update((p) => ({
                  ...p,
                  positions: {
                    ...p.positions,
                    [id]: {
                      x: Math.max(0, Math.min(1, x / size.width)),
                      y: Math.max(0, Math.min(1, y / size.height)),
                      manual: true,
                    },
                  },
                }))
              }
              onMenu={(e, x, y) => setMenu({ entry: e, x, y })}
              onGroup={(entry) => openDialog({ kind: 'group', entry })}
            />
          );
        })}
        {loading && !entries.length && (
          <div className="empty-state">
            <LoaderCircle className="loading-icon" size={28} />
            <p>Finding your favorites…</p>
          </div>
        )}
        {!loading && s.onboarded && !entries.length && !bubbleViews.length && (
          <div className="empty-state">
            <span className="empty-icon">
              <FolderOpen size={30} />
            </span>
            <h2>
              {foldersPaused
                ? 'Your spaces are taking a break.'
                : 'A little room for your favorites.'}
            </h2>
            <p>
              {foldersPaused
                ? 'Turn a folder on above, or adjust its schedule.'
                : 'Choose a bookmark folder, or add somewhere new.'}
            </p>
            <div className="button-row">
              <button
                className="primary-button"
                onClick={() => setSettingsOpen(true)}
              >
                {foldersPaused ? 'Manage folders' : 'Choose folders'}
                <ArrowRight size={16} />
              </button>
              <button
                className="secondary-button"
                onClick={() => openDialog({ kind: 'add' })}
              >
                <Plus size={16} /> Add bookmark
              </button>
            </div>
          </div>
        )}
      </div>
      <footer className="footer">
        <div className="orbit-status">
          <span
            className={`status-dot ${activity?.status === 'unavailable' ? 'warning' : ''}`}
          />
          <span>
            {entries.length} {s.grouping ? 'websites' : 'bookmarks'}
            <i>·</i>
            {activity?.status === 'unavailable'
              ? 'History unavailable'
              : `${totalToday} visits today`}
          </span>
        </div>
        <div className="dock">
          <span className="dock-icon">
            <Sparkles size={16} />
          </span>
          <label className="dock-mode">
            <span className="sr-only">Activity mode</span>
            <select
              value={s.mode}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  settings: {
                    ...p.settings,
                    mode: e.target.value as SettingsType['mode'],
                  },
                }))
              }
            >
              {(['today', 'three', 'seven', 'balanced', 'custom'] as const).map(
                (mode) => (
                  <option key={mode} value={mode}>
                    {modeLabel(mode)}
                  </option>
                ),
              )}
            </select>
            <ChevronDown size={13} />
          </label>
          <span className="dock-divider" />
          <button
            onClick={() => {
              setQuery('');
              setListOpen(true);
            }}
            aria-label={`All bookmarks${layout.overflow.length ? `, ${layout.overflow.length} in overflow` : ''}`}
          >
            <List size={17} />
            <span>All bookmarks</span>
            {layout.overflow.length > 0 && <b>{layout.overflow.length} more</b>}
          </button>
        </div>
        <button className="footer-hint" onClick={() => setSearchOpen(true)}>
          Find your space <kbd>B</kbd>
        </button>
      </footer>
      {error && (
        <div role="alert" className="error-banner">
          <CircleHelp size={18} />
          <span>{error}</span>
          <button
            onClick={() => {
              void refresh(true);
            }}
          >
            Retry
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {activity?.status === 'partial' && (
        <div className="cache-notice" role="status">
          {activity.message}
        </div>
      )}
      {ready && !loading && !s.onboarded && !settingsOpen && (
        <Modal
          title="Welcome to your orbit."
          onClose={() => setSettingsOpen(true)}
          className="onboarding-backdrop"
        >
          <div className="onboarding-icon">
            <Orbit size={42} strokeWidth={1} />
          </div>
          <p className="onboarding-intro">
            A quieter home for the places you love.
            <br />
            Choose a folder and watch your bookmarks find their space.
          </p>
          <FolderPicker
            snapshot={bookmarks}
            selected={s.folderIds}
            onChange={(folderIds) =>
              update((p) => ({ ...p, settings: { ...p.settings, folderIds } }))
            }
          />
          <div className="onboarding-privacy">
            <ShieldCheck size={20} />
            <p>
              <strong>Just between you and your browser.</strong> Orbit uses
              bookmarks and recent history to size your bubbles. Everything
              stays on this device. No tracking. No accounts.
            </p>
          </div>
          {!hasBrowser() && (
            <p className="notice">
              Build the project, then load the <strong>dist</strong> folder at{' '}
              <strong>vivaldi://extensions</strong> to connect real browser
              data.
            </p>
          )}
          <button
            className="primary-button full-width"
            disabled={!s.folderIds.length || !hasBrowser()}
            onClick={() =>
              update((p) => ({
                ...p,
                settings: { ...p.settings, onboarded: true },
              }))
            }
          >
            Create my orbit
            <ArrowRight size={17} />
          </button>
        </Modal>
      )}
      {settingsOpen && (
        <Settings
          prefs={prefs}
          update={update}
          snapshot={bookmarks}
          onClose={() => setSettingsOpen(false)}
          refresh={() => {
            void refresh(true);
          }}
          onAdd={() => {
            setSettingsOpen(false);
            openDialog({ kind: 'add' });
          }}
          now={now}
          onSchedule={setFolderDialog}
          onColor={setFolderColorDialog}
        />
      )}
      {(searchOpen || listOpen) && (
        <Modal
          title={searchOpen ? 'Find your space' : 'All bookmarks'}
          wide
          onClose={() => {
            setSearchOpen(false);
            setListOpen(false);
            setQuery('');
          }}
          className="search-backdrop"
        >
          <div className="search-field">
            <Search size={21} />
            <input
              ref={searchRef}
              data-autofocus
              type="search"
              aria-label="Search by bookmark name or URL"
              placeholder="Search bookmarks or paste a name…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setResultIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  setResultIndex(
                    (i) =>
                      (i +
                        (e.key === 'ArrowDown'
                          ? 1
                          : Math.max(1, results.length) - 1)) %
                      Math.max(1, results.length),
                  );
                }
                if (e.key === 'Enter' && results[resultIndex]) {
                  e.preventDefault();
                  openResult(results[resultIndex]);
                }
              }}
            />
            <kbd>esc</kbd>
          </div>
          <div className="result-count">
            {results.length} {results.length === 1 ? 'place' : 'places'}
            {layout.overflow.length > 0
              ? ' · including every overflow bookmark'
              : ' in your orbit'}
          </div>
          <div className="results" role="list">
            <div className="result-list">
              {results.map((entry, i) => (
                <div
                  className={`result-row ${i === resultIndex ? 'active' : ''}`}
                  key={entry.id}
                  role="listitem"
                >
                  <a
                    href={entry.url}
                    onFocus={() => setResultIndex(i)}
                    onClick={(e) => {
                      if (
                        s.grouping &&
                        !e.ctrlKey &&
                        !e.metaKey &&
                        !e.shiftKey
                      ) {
                        e.preventDefault();
                        openResult(entry);
                      }
                    }}
                  >
                    <span className="result-favicon">
                      <Favicon url={entry.url} title={entry.title} />
                    </span>
                    <span className="result-label">
                      {entry.title}
                      <small>
                        {entry.domain}
                        {entry.members.length > 1
                          ? ` · ${entry.members.length} pages`
                          : ''}
                      </small>
                    </span>
                    <span className="result-visits">
                      {windowVisits(entry.activity, s.mode)} visits
                    </span>
                  </a>
                  <button
                    className="icon-button"
                    aria-label={`Actions for ${entry.title}`}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMenu({ entry, x: rect.left - 180, y: rect.bottom });
                    }}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>
              ))}
            </div>
            {!results.length && (
              <p className="no-results">
                No places found. Try another name or URL.
              </p>
            )}
          </div>
          <div className="search-footer">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> to explore
            </span>
            <span>
              <kbd>↵</kbd> to open
            </span>
            <button
              className="text-button"
              onClick={() => {
                setListOpen(false);
                setSearchOpen(false);
                openDialog({ kind: 'add' });
              }}
            >
              + Add bookmark
            </button>
          </div>
        </Modal>
      )}
      {menu && <ContextMenu {...menu} onClose={closeMenu} onAction={action} />}
      {dialog && (
        <Modal
          title={
            dialog.kind === 'customize'
              ? 'A personal touch'
              : dialog.kind === 'activity'
                ? 'Recent activity'
                : dialog.kind === 'group'
                  ? dialog.entry.title
                  : dialog.kind === 'remove'
                    ? 'Remove this bookmark?'
                    : dialog.kind === 'edit'
                      ? 'Edit bookmark'
                      : 'Somewhere new'
          }
          onClose={() => setDialog(undefined)}
        >
          {dialog.kind === 'customize' && (
            <div className="dialog-form">
              <div className="customize-preview">
                <Favicon url={dialog.entry.url} title={dialog.entry.title} />
                <strong>{dialog.entry.title}</strong>
              </div>
              <label className="setting-row">
                Bubble color
                <input
                  aria-label="Bubble color"
                  type="color"
                  value={prefs.overrides[dialog.entry.id]?.color ?? '#9aa9df'}
                  onChange={(e) =>
                    override(dialog.entry.id, { color: e.target.value })
                  }
                />
              </label>
              <button
                className="text-button"
                onClick={() => override(dialog.entry.id, { color: undefined })}
              >
                Use favicon color
              </button>
              <label className="setting-row">
                Fixed size
                <input
                  type="checkbox"
                  className="switch"
                  checked={prefs.overrides[dialog.entry.id]?.size !== undefined}
                  onChange={(e) =>
                    override(dialog.entry.id, {
                      size: e.target.checked ? dialog.entry.size : undefined,
                      ...(e.target.checked ? {} : { pinned: false }),
                    })
                  }
                />
              </label>
              {prefs.overrides[dialog.entry.id]?.size !== undefined && (
                <label className="range-field">
                  <span>
                    Diameter
                    <output>
                      {Math.round(prefs.overrides[dialog.entry.id].size!)} px
                    </output>
                  </span>
                  <input
                    type="range"
                    aria-label="Fixed bubble diameter"
                    min={s.minSize}
                    max={s.maxSize}
                    value={prefs.overrides[dialog.entry.id].size}
                    onChange={(e) =>
                      override(dialog.entry.id, {
                        size: Number(e.target.value),
                      })
                    }
                  />
                </label>
              )}
              <p className="muted">
                Dense layouts may use a smaller, accessible representation.
                Pinning keeps a fixed size and gives its position priority.
              </p>
            </div>
          )}
          {dialog.kind === 'activity' && (
            <div className="activity-detail">
              <div className="customize-preview">
                <Favicon url={dialog.entry.url} title={dialog.entry.title} />
                <strong>{dialog.entry.title}</strong>
              </div>
              <div className="activity-stats">
                {[
                  ['Today', dialog.entry.activity.today],
                  ['Previous 2 days', dialog.entry.activity.previous2],
                  ['Previous 4 days', dialog.entry.activity.previous4],
                ].map(([label, count]) => (
                  <div key={label}>
                    <strong>{count}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <p className="muted">
                {modeLabel(s.mode)} · Weighted score{' '}
                {dialog.entry.score.toFixed(2)} · Target{' '}
                {Math.round(dialog.entry.size)} px
              </p>
              <p className="muted">
                {activity?.message ??
                  'Counts include available top-level visits within seven local calendar days. Cleared or unavailable history is not reconstructed.'}
              </p>
              <p className="formula">
                Size = min + (max − min) × min(1, log(1 + score) / log(41))
              </p>
              {!s.grouping && (
                <p className="muted">
                  Matching uses this exact page URL, excluding its fragment.
                  Other pages on the same website have separate activity.
                </p>
              )}
            </div>
          )}
          {dialog.kind === 'group' && (
            <div className="group-pages">
              <p className="muted">
                Your bookmarked pages on {dialog.entry.domain}. Website activity
                is counted once across all available pages.
              </p>
              {dialog.entry.members.map((b) => (
                <div key={b.id} className="group-page">
                  <a href={b.url}>
                    <Favicon url={b.url} title={b.title} />
                    <span>
                      {b.title}
                      <small>{b.url}</small>
                    </span>
                  </a>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${b.title}`}
                    onClick={() => openDialog({ kind: 'edit', bookmark: b })}
                  >
                    <Settings2 size={16} />
                  </button>
                  <button
                    className="icon-button danger-text"
                    aria-label={`Remove ${b.title}`}
                    onClick={() =>
                      openDialog({
                        kind: 'remove',
                        entry: {
                          ...dialog.entry,
                          members: [b],
                          title: b.title,
                        },
                      })
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {dialog.kind === 'remove' && (
            <div className="dialog-form">
              <p>
                <strong>{dialog.entry.title}</strong> will be removed from your
                actual browser bookmarks.
              </p>
              <p className="muted">
                To keep it in your browser, use “Hide from Orbit” instead.
              </p>
              <div className="button-row">
                <button
                  className="secondary-button"
                  onClick={() => setDialog(undefined)}
                >
                  Keep bookmark
                </button>
                <button
                  className="danger-button"
                  onClick={() => {
                    void chrome.bookmarks
                      .remove(dialog.entry.members[0].id)
                      .then(() => {
                        setDialog(undefined);
                        void refresh();
                      })
                      .catch((e) => setDialogError(String(e)));
                  }}
                >
                  Remove bookmark
                </button>
              </div>
            </div>
          )}
          {(dialog.kind === 'edit' || dialog.kind === 'add') && (
            <BookmarkForm
              bookmark={dialog.kind === 'edit' ? dialog.bookmark : undefined}
              folders={bookmarks?.folders ?? []}
              defaultFolder={s.folderIds.find((id) =>
                bookmarks?.folders.some((f) => f.id === id),
              )}
              onError={setDialogError}
              onDone={() => {
                setDialog(undefined);
                void refresh();
              }}
            />
          )}
          {dialogError && (
            <p className="notice" role="alert">
              {dialogError}
            </p>
          )}
        </Modal>
      )}
      {folderDialog && (
        <FolderScheduleDialog
          key={folderDialog.folder.id}
          item={folderDialog}
          prefs={prefs}
          update={update}
          onClose={() => setFolderDialog(undefined)}
        />
      )}
      {folderColorDialog && (
        <FolderColorDialog
          key={folderColorDialog.folder.id}
          item={folderColorDialog}
          prefs={prefs}
          update={update}
          onClose={() => setFolderColorDialog(undefined)}
        />
      )}
      <div className="sr-only" aria-live="polite">
        {layout.overflow.length
          ? `${layout.overflow.length} additional bookmarks available in All bookmarks.`
          : ''}
      </div>
    </main>
  );
}
