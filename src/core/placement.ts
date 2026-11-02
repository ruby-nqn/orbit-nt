import { layoutBubbles, type LayoutOptions } from './layout';
import type { BubbleEntry, Position } from './types';

interface Point {
  x: number;
  y: number;
}

/** A packing-aware ellipse: sparse collections have a compact center, dense ones expand. */
export function clusterBounds(entries: BubbleEntry[], options: LayoutOptions) {
  const { width, height, spacing, attraction, positions } = options;
  const clustered = entries.filter((entry) => !positions[entry.id]?.detached);
  const area = clustered.reduce(
    (sum, entry) => sum + Math.PI * (entry.size / 2 + (spacing + 8) / 2) ** 2,
    0,
  );
  const aspect = Math.max(
    0.8,
    Math.min(1.4, Math.sqrt(width / Math.max(1, height))),
  );
  const radius = Math.sqrt(area / (Math.PI * 0.65));
  const spread = 0.55 + (100 - attraction) / 200;
  return {
    x: width / 2,
    y: height / 2,
    radiusX: Math.max(
      1,
      Math.min(
        width * 0.43,
        Math.max(
          Math.min(180, width * 0.22),
          radius * Math.sqrt(aspect) * spread,
        ),
      ),
    ),
    radiusY: Math.max(
      1,
      Math.min(
        height * 0.43,
        Math.max(
          Math.min(140, height * 0.22),
          (radius / Math.sqrt(aspect)) * spread,
        ),
      ),
    ),
  };
}

/** Gravity acts once on release, never repeatedly on an already-saved manual anchor. */
export function gravityDrop(
  point: Point,
  entries: BubbleEntry[],
  options: LayoutOptions,
  pinned = false,
) {
  const center = clusterBounds(entries, options);
  const dx = point.x - center.x,
    dy = point.y - center.y;
  const radius = Math.hypot(dx / center.radiusX, dy / center.radiusY);
  const detached = radius >= 1.55 - 1e-9;
  if (pinned || detached || options.attraction === 0)
    return { ...point, detached };
  const edge = Math.max(0, Math.min(1, (radius - 1) / 0.55));
  const fade = 1 - edge * edge * (3 - 2 * edge);
  const pull = Math.min(
    (options.attraction / 100) * 0.18 * fade,
    Math.min(40, Math.min(options.width, options.height) * 0.05) /
      Math.max(1, Math.hypot(dx, dy)),
  );
  return { x: point.x - dx * pull, y: point.y - dy * pull, detached: false };
}

/** Give the released bubble its destination; relocate neighbors and save the resolved layout. */
export function settleDrop(
  entries: BubbleEntry[],
  options: LayoutOptions,
  id: string,
  point: Point,
) {
  const entry = entries.find((entry) => entry.id === id);
  if (!entry || options.width < 60 || options.height < 60)
    return options.positions;
  const target = gravityDrop(point, entries, options, entry.pinned);
  const positions: Record<string, Position> = {
    ...options.positions,
    [id]: {
      x: Math.max(0, Math.min(1, target.x / options.width)),
      y: Math.max(0, Math.min(1, target.y / options.height)),
      manual: true,
      ...(target.detached ? { detached: true } : {}),
    },
  };
  const layout = layoutBubbles(entries, {
    ...options,
    positions,
    priorityId: id,
  });
  for (const node of layout.nodes) {
    const previous = positions[node.id];
    positions[node.id] = {
      x: node.x / options.width,
      y: node.y / options.height,
      ...(previous?.manual
        ? { manual: true }
        : { attraction: options.attraction }),
      ...(previous?.detached ? { detached: true } : {}),
    };
  }
  return positions;
}
