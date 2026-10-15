import { hash } from './urls';
import type { BubbleEntry, LayoutNode, LayoutResult, Position } from './types';
interface Options {
  width: number;
  height: number;
  spacing: number;
  attraction: number;
  physics: number;
  positions: Record<string, Position>;
}
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
// Deterministic spatial packing. Every committed circle is checked against all earlier
// circles; no unstable simulation runs after settling. Pinned/manual anchors get priority.
export function layoutBubbles(
  entries: BubbleEntry[],
  options: Options,
): LayoutResult {
  const { width, height, positions, attraction, physics } = options;
  if (width < 60 || height < 60)
    return { nodes: [], overflow: entries.map((e) => e.id) };
  const spacing = options.spacing + 8; // Reserve room for hover and restrained idle motion.
  const nodes: LayoutNode[] = [],
    overflow: string[] = [];
  const ordered = [...entries].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      Number(!!positions[b.id]?.manual) - Number(!!positions[a.id]?.manual) ||
      b.score - a.score ||
      a.id.localeCompare(b.id),
  );
  const budget = width * height * 0.51;
  const desiredArea = ordered.reduce(
    (sum, e) => sum + Math.PI * (e.size / 2 + spacing / 2) ** 2,
    0,
  );
  const shrink = Math.min(1, Math.sqrt(budget / Math.max(1, desiredArea)));
  for (let rank = 0; rank < ordered.length; rank++) {
    const entry = ordered[rank];
    // 52 px remains a comfortably operable target; excess entries go into the list.
    const size = Math.min(entry.size, Math.max(52, entry.size * shrink));
    const r = size / 2,
      margin = r + 5;
    if (margin * 2 > width || margin * 2 > height || rank >= 160) {
      overflow.push(entry.id);
      continue;
    }
    const saved = positions[entry.id];
    const seed = hash(entry.id) / 4294967296;
    const angle = rank * 2.399963 + seed * 0.3;
    const spread =
      (0.22 + (100 - attraction) / 220) *
      Math.sqrt((rank + 0.5) / Math.max(1, ordered.length));
    const centerScale = (0.22 + (100 - attraction) / 220) / (0.22 + 55 / 220);
    const target = saved
      ? saved.manual || entry.pinned
        ? { x: saved.x * width, y: saved.y * height }
        : {
            x: width / 2 + (saved.x - 0.5) * width * centerScale,
            y: height / 2 + (saved.y - 0.5) * height * centerScale,
          }
      : {
          x: width / 2 + Math.cos(angle) * width * spread,
          y: height / 2 + Math.sin(angle) * height * spread,
        };
    const clamp = (p: { x: number; y: number }) => ({
      x: Math.max(margin, Math.min(width - margin, p.x)),
      y: Math.max(margin, Math.min(height - margin, p.y)),
    });
    const valid = (p: { x: number; y: number }) =>
      nodes.every(
        (n) => distance(p, n) >= (size + n.size) / 2 + spacing - 0.01,
      );
    let best: { x: number; y: number } | undefined;
    const origin = clamp(target);
    if (valid(origin)) best = origin;
    else {
      // Search near the existing anchor first. More movement intensity widens sampling.
      const step = 9 + physics / 20;
      const maxRadius = Math.hypot(width, height);
      let attempts = 0;
      for (
        let ring = step;
        ring < maxRadius && !best && attempts < 2000;
        ring += step
      ) {
        const count = Math.max(12, Math.ceil((2 * Math.PI * ring) / 18));
        for (let i = 0; i < count && attempts++ < 2000; i++) {
          const a = (i / count) * Math.PI * 2 + seed;
          const p = {
            x: origin.x + Math.cos(a) * ring,
            y: origin.y + Math.sin(a) * ring,
          };
          if (
            p.x < margin ||
            p.x > width - margin ||
            p.y < margin ||
            p.y > height - margin
          )
            continue;
          if (valid(p)) {
            best = p;
            break;
          }
        }
      }
    }
    if (best) nodes.push({ id: entry.id, ...best, size });
    else overflow.push(entry.id);
  }
  return { nodes, overflow };
}
