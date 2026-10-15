import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultPreferences, validatePreferences } from '../core/settings';
import { activityKey, libraryBookmarks } from '../core/bookmarks';
import { dayStart } from '../core/scoring';
import type {
  ActivityCache,
  BookmarkSnapshot,
  Preferences,
} from '../core/types';
import {
  hasBrowser,
  readLocal,
  readPreferences,
  refreshSnapshot,
  savePreferences,
} from './storage';
export function useOrbit() {
  const [prefs, setPrefs] = useState(defaultPreferences),
    [bookmarks, setBookmarks] = useState<BookmarkSnapshot>(),
    [activity, setActivity] = useState<ActivityCache>();
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false);
  const prefsRef = useRef(prefs),
    refreshing = useRef(false),
    queued = useRef(false),
    mounted = useRef(true),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    writes = useRef(Promise.resolve()),
    ownWrites = useRef(new Set<string>());
  const refresh = useCallback(async (force = false) => {
    if (refreshing.current) {
      queued.current = true;
      return;
    }
    refreshing.current = true;
    try {
      const result = await refreshSnapshot(force);
      if (mounted.current) {
        setBookmarks(result.bookmarks);
        setActivity(result.activity);
        setError('');
        if (
          result.activity.key !==
          activityKey(
            libraryBookmarks(result.bookmarks.bookmarks, prefsRef.current),
            prefsRef.current.settings.grouping,
          )
        )
          queued.current = true;
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : 'Unable to load browser data.',
        );
    } finally {
      refreshing.current = false;
      if (mounted.current) setLoading(false);
      if (queued.current && mounted.current) {
        queued.current = false;
        timer.current = setTimeout(() => {
          void refresh();
        }, 300);
      }
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const schedule = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (!document.hidden) void refresh();
      }, 800);
    };
    void readLocal()
      .then((data) => {
        if (!mounted.current) return;
        const initial = readPreferences(data.preferences);
        prefsRef.current = initial;
        setPrefs(initial);
        if (data.bookmarkCache) {
          setBookmarks(data.bookmarkCache);
          setLoading(false);
        }
        if (data.activityCache?.day === dayStart(Date.now()))
          setActivity(data.activityCache);
        setReady(true);
        void refresh();
      })
      .catch(() => {
        setReady(true);
        setLoading(false);
        setError('Could not read local storage.');
      });
    const change = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local') return;
      if (changes.preferences) {
        const next = readPreferences(changes.preferences.newValue),
          previous = prefsRef.current;
        const signature = JSON.stringify(next);
        if (ownWrites.current.has(signature)) {
          ownWrites.current.delete(signature);
          return;
        }
        prefsRef.current = next;
        setPrefs(next);
        if (
          JSON.stringify([
            previous.settings.folderIds,
            previous.settings.hiddenIds,
            previous.settings.grouping,
          ]) !==
          JSON.stringify([
            next.settings.folderIds,
            next.settings.hiddenIds,
            next.settings.grouping,
          ])
        )
          schedule();
      }
      if (changes.historyRevision || changes.bookmarkRevision) schedule();
      if (changes.activityCache)
        setActivity(
          changes.activityCache.newValue as ActivityCache | undefined,
        );
      if (changes.bookmarkCache?.newValue)
        setBookmarks(changes.bookmarkCache.newValue as BookmarkSnapshot);
    };
    if (hasBrowser()) chrome.storage.onChanged.addListener(change);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    // One calendar-boundary wakeup, then reschedule. Date arithmetic respects DST.
    let midnight: ReturnType<typeof setTimeout>;
    const nextDay = () => {
      const next = new Date();
      next.setHours(24, 0, 0, 100);
      midnight = setTimeout(() => {
        if (!document.hidden) void refresh();
        nextDay();
      }, next.getTime() - Date.now());
    };
    nextDay();
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      clearTimeout(midnight);
      if (hasBrowser()) chrome.storage.onChanged.removeListener(change);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  const update = useCallback(
    (fn: (previous: Preferences) => Preferences) => {
      const previous = prefsRef.current;
      const raw = fn(previous);
      if (raw === previous) return;
      const next = validatePreferences(raw);
      const changedData =
        JSON.stringify([
          previous.settings.folderIds,
          previous.settings.hiddenIds,
          previous.settings.grouping,
        ]) !==
        JSON.stringify([
          next.settings.folderIds,
          next.settings.hiddenIds,
          next.settings.grouping,
        ]);
      prefsRef.current = next;
      setPrefs(next);
      const signature = JSON.stringify(next);
      ownWrites.current.add(signature);
      writes.current = writes.current
        .then(() => savePreferences(next))
        .then(() => {
          if (changedData) void refresh();
        })
        .catch((e) => {
          ownWrites.current.delete(signature);
          setError(
            e instanceof Error ? e.message : 'Could not save preferences.',
          );
        });
    },
    [refresh],
  );
  const selected = bookmarks
    ? libraryBookmarks(bookmarks.bookmarks, prefs)
    : [];
  const validActivity =
    activity?.key === activityKey(selected, prefs.settings.grouping) &&
    activity.day === dayStart(Date.now())
      ? activity
      : undefined;
  return {
    prefs,
    update,
    bookmarks,
    activity: validActivity,
    loading,
    error,
    ready,
    refresh,
    setError,
  };
}
