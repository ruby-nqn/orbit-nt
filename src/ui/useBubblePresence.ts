import { useEffect, useState } from 'react';
import type { BubbleEntry, LayoutNode } from '../core/types';

export interface BubbleView {
  key: string;
  entry: BubbleEntry;
  node: LayoutNode;
}
interface ExitingBubble {
  view: BubbleView;
  expiresAt: number;
}

/** Retain only a short, inert visual snapshot; visibility and layout stay immediate. */
export function useBubblePresence(
  live: BubbleView[],
  activeIds: ReadonlySet<string>,
  motion: boolean,
) {
  const [state, setState] = useState({
    live,
    motion,
    exits: [] as ExitingBubble[],
  });
  let present = state;
  if (state.live !== live || state.motion !== motion) {
    const keys = new Set(live.map((view) => view.key));
    const removed = state.live.filter(
      (view) => !keys.has(view.key) && !activeIds.has(view.entry.id),
    );
    const exits = motion
      ? [
          ...state.exits,
          ...removed.map((view) => ({
            view,
            expiresAt: performance.now() + 240,
          })),
        ].filter((item) => !keys.has(item.view.key))
      : [];
    present = { live, motion, exits };
    // Adjust before commit so an exiting bubble keeps its existing DOM and colors.
    setState(present);
  }
  const exits = present.exits;
  useEffect(() => {
    if (!exits.length) return;
    const deadline = Math.min(...exits.map((item) => item.expiresAt));
    const timer = setTimeout(
      () => {
        setState((current) => ({
          ...current,
          exits: current.exits.filter(
            (item) => item.expiresAt > performance.now(),
          ),
        }));
      },
      Math.max(1, deadline - performance.now() + 1),
    );
    return () => clearTimeout(timer);
  }, [exits]);
  return {
    views: [
      ...live.map((view) => ({ ...view, exiting: false })),
      ...exits.map((item) => ({ ...item.view, exiting: true })),
    ],
    finishExit: (key: string) =>
      setState((current) => ({
        ...current,
        exits: current.exits.filter((item) => item.view.key !== key),
      })),
  };
}
