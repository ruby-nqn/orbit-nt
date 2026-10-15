import { useEffect, useState } from 'react';
import type { FolderRule } from '../core/types';

// Folder/header timing only: this timer never reads history or wakes the worker.
// Minute boundaries also reconcile sleep, clock and timezone changes without polling APIs.
export function useFolderTime(
  rules: Record<string, FolderRule>,
  headerScheduled = false,
): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduled =
      headerScheduled ||
      Object.values(rules).some(
        (rule) => rule.schedule && rule.mode === 'auto',
      );
    const tick = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      const current = Date.now();
      setNow(current);
      if (scheduled) timer = setTimeout(tick, 60_000 - (current % 60_000) + 20);
    };
    tick();
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [rules, headerScheduled]);
  return now;
}
