import { describe, expect, it } from 'vitest';
import { clusterBounds, gravityDrop, settleDrop } from '../src/core/placement';
import { layoutBubbles, type LayoutOptions } from '../src/core/layout';
import {
  defaultPreferences,
  exportPreferences,
  importPreferences,
  validatePreferences,
} from '../src/core/settings';
import type { BubbleEntry } from '../src/core/types';

const bubbles = (count = 20): BubbleEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i),
    title: String(i),
    url: `https://example.com/${i}`,
    domain: 'example.com',
    members: [],
    activity: { today: 0, previous2: 0, previous4: 0 },
    score: 0,
    size: 80,
    pinned: false,
  }));
const options = (): LayoutOptions => ({
  width: 1400,
  height: 800,
  spacing: 14,
  attraction: 45,
  physics: 50,
  positions: {},
});
const centerDistance = (point: { x: number; y: number }, o: LayoutOptions) =>
  Math.hypot(point.x - o.width / 2, point.y - o.height / 2);

describe('soft center gravity and intentional outliers', () => {
  it('gently pulls an ordinary drop toward the central cluster with bounded movement', () => {
    const entries = bubbles(),
      o = options(),
      c = clusterBounds(entries, o);
    const point = { x: c.x + c.radiusX * 0.85, y: c.y + 25 };
    const target = gravityDrop(point, entries, o);
    expect(target.detached).toBe(false);
    expect(centerDistance(target, o)).toBeLessThan(centerDistance(point, o));
    expect(
      Math.hypot(target.x - point.x, target.y - point.y),
    ).toBeLessThanOrEqual(40);
  });
  it('preserves a clearly distant placement instead of pulling it back', () => {
    const entries = bubbles(),
      o = options(),
      point = { x: 85, y: 85 };
    expect(gravityDrop(point, entries, o)).toEqual({
      ...point,
      detached: true,
    });
  });
  it('does not move the center, pinned drops, or drops with center attraction disabled', () => {
    const entries = bubbles(),
      o = options();
    expect(gravityDrop({ x: 700, y: 400 }, entries, o)).toEqual({
      x: 700,
      y: 400,
      detached: false,
    });
    const point = { x: 800, y: 430 };
    expect(gravityDrop(point, entries, o, true)).toEqual({
      ...point,
      detached: false,
    });
    expect(gravityDrop(point, entries, { ...o, attraction: 0 })).toEqual({
      ...point,
      detached: false,
    });
  });
  it('fades smoothly at the detached boundary', () => {
    const entries = bubbles(),
      o = options(),
      c = clusterBounds(entries, o);
    const a = gravityDrop({ x: c.x + c.radiusX * 1.5499, y: c.y }, entries, o);
    const b = gravityDrop({ x: c.x + c.radiusX * 1.55, y: c.y }, entries, o);
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.1);
    expect(b.detached).toBe(true);
  });
  it('expands the cluster for more bookmarks and excludes intentional outliers', () => {
    const o = options(),
      small = clusterBounds(bubbles(5), o),
      large = clusterBounds(bubbles(40), o);
    expect(large.radiusX).toBeGreaterThan(small.radiusX);
    expect(large.radiusY).toBeGreaterThan(small.radiusY);
    expect(
      clusterBounds(bubbles(21), {
        ...o,
        positions: { '20': { x: 0.05, y: 0.05, manual: true, detached: true } },
      }),
    ).toEqual(clusterBounds(bubbles(20), o));
  });
});

describe('drop placement, collisions and persistence', () => {
  it('prioritizes the dropped bubble and makes a neighbor move out of its destination', () => {
    const entries = bubbles(2),
      o = options();
    o.positions = {
      '0': { x: 0.5, y: 0.5, manual: true },
      '1': { x: 0.75, y: 0.7, manual: true },
    };
    const positions = settleDrop(entries, o, '1', { x: 700, y: 400 });
    expect(positions['1']).toMatchObject({ x: 0.5, y: 0.5, manual: true });
    expect(positions['0']).not.toMatchObject({ x: 0.5, y: 0.5 });
    const restored = layoutBubbles(entries, { ...o, positions });
    const dropped = restored.nodes.find((node) => node.id === '1')!;
    expect(dropped.x).toBeCloseTo(700);
    expect(dropped.y).toBeCloseTo(400);
    const other = restored.nodes.find((node) => node.id === '0')!;
    expect(
      Math.hypot(other.x - dropped.x, other.y - dropped.y),
    ).toBeGreaterThanOrEqual(102 - 0.01);
  });
  it.each([0, 45, 85, 100])(
    'does not compound gravity or cached attraction after a drop at attraction %i',
    (attraction) => {
      const entries = bubbles(),
        o = { ...options(), attraction };
      const positions = settleDrop(entries, o, '15', { x: 730, y: 425 });
      const first = layoutBubbles(entries, { ...o, positions });
      const prefs = defaultPreferences();
      prefs.positions = positions;
      const restored = layoutBubbles(entries, {
        ...o,
        positions: importPreferences(exportPreferences(prefs)).positions,
      });
      expect(restored).toEqual(first);
      for (const node of first.nodes) {
        expect(node.x).toBeCloseTo(positions[node.id].x * o.width);
        expect(node.y).toBeCloseTo(positions[node.id].y * o.height);
      }
    },
  );
  it('retains detached placement across export and clears it when moved back into the cluster', () => {
    const entries = bubbles(),
      o = options();
    const positions = settleDrop(entries, o, '5', { x: 85, y: 85 });
    expect(positions['5'].detached).toBe(true);
    const prefs = defaultPreferences();
    prefs.positions = positions;
    expect(importPreferences(exportPreferences(prefs)).positions['5']).toEqual(
      positions['5'],
    );
    const centered = settleDrop(entries, { ...o, positions }, '5', {
      x: 705,
      y: 405,
    });
    expect(centered['5'].detached).toBeUndefined();
  });
  it('keeps every dense-layout entry accessible and all resting circles in bounds and collision-free', () => {
    const entries = bubbles(100),
      o = { ...options(), width: 390, height: 390 };
    const positions = settleDrop(entries, o, '7', { x: 10, y: 10 });
    const layout = layoutBubbles(entries, { ...o, positions });
    expect(
      new Set([...layout.nodes.map((n) => n.id), ...layout.overflow]).size,
    ).toBe(100);
    for (const a of layout.nodes) {
      expect(a.x - a.size / 2).toBeGreaterThanOrEqual(0);
      expect(a.y - a.size / 2).toBeGreaterThanOrEqual(0);
      expect(a.x + a.size / 2).toBeLessThanOrEqual(o.width);
      expect(a.y + a.size / 2).toBeLessThanOrEqual(o.height);
      for (const b of layout.nodes)
        if (a.id !== b.id)
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
            (a.size + b.size) / 2 + 22 - 0.01,
          );
    }
  });
  it('leaves saved positions unchanged for a removed bookmark or unavailable viewport', () => {
    const o = options();
    expect(settleDrop(bubbles(2), o, 'gone', { x: 50, y: 50 })).toBe(
      o.positions,
    );
    expect(
      settleDrop(bubbles(2), { ...o, width: 0 }, '0', { x: 50, y: 50 }),
    ).toBe(o.positions);
  });
  it.each([
    { detached: 'yes' },
    { attraction: NaN },
    { attraction: -1 },
    { attraction: 101 },
  ])('rejects invalid placement metadata %j', (invalid) => {
    expect(() =>
      validatePreferences({
        ...defaultPreferences(),
        positions: { a: { x: 0.5, y: 0.5, ...invalid } },
      }),
    ).toThrow();
  });
});
