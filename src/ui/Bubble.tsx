import { useRef, useState, type CSSProperties } from 'react';
import { Pin } from 'lucide-react';
import type { BubbleEntry, LayoutNode, Settings } from '../core/types';
import { fallbackColor } from '../core/colors';
import { modeLabel, windowVisits } from '../core/scoring';
import { Favicon } from './Favicon';
import { useEntrance } from './useEntrance';
export function Bubble({
  entry,
  node,
  settings,
  entranceMotion,
  exiting,
  onExitComplete,
  dimmed,
  selected,
  onDrop,
  onMenu,
  onGroup,
  manualSize,
  bounds,
}: {
  entry: BubbleEntry;
  node: LayoutNode;
  settings: Settings;
  entranceMotion: boolean;
  exiting: boolean;
  onExitComplete: () => void;
  dimmed: boolean;
  selected: boolean;
  manualSize: boolean;
  bounds: { width: number; height: number };
  onDrop: (id: string, x: number, y: number) => void;
  onMenu: (entry: BubbleEntry, x: number, y: number) => void;
  onGroup: (entry: BubbleEntry) => void;
}) {
  const { entering, finishEntrance } = useEntrance(entranceMotion);
  const [autoColor, setAutoColor] = useState<string>(),
    [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const pointer = useRef<{
      id: number;
      startX: number;
      startY: number;
      moved: boolean;
    } | null>(null),
    suppressClick = useRef(false);
  const color = entry.color ?? autoColor ?? fallbackColor(entry.url);
  const style = {
    left: node.x,
    top: node.y,
    width: node.size,
    height: node.size,
    '--accent': color,
    '--folder-accent': entry.folderColor ?? color,
    '--float': `${settings.floatIntensity}px`,
    '--delay': `${-(node.x % 9)}s`,
    '--enter-x': `${bounds.width / 2 - node.x}px`,
    '--enter-y': `${bounds.height / 2 - node.y}px`,
    '--enter-delay': `${(Math.round(node.x + node.y) % 4) * 8}ms`,
    '--favicon-size': `${Math.max(20, (node.size * settings.faviconScale) / 100)}px`,
    ...(drag
      ? {
          transform: `translate(calc(-50% + ${drag.x}px), calc(-50% + ${drag.y}px))`,
        }
      : {}),
  } as CSSProperties;
  return (
    <div
      className={`bubble-position ${dimmed ? 'dimmed' : ''} ${selected ? 'selected' : ''} ${drag ? 'dragging' : ''} ${exiting ? 'exiting' : ''}`}
      style={style}
      inert={exiting}
      aria-hidden={exiting || undefined}
    >
      <div
        className={`bubble-enter ${exiting ? 'bubble-exiting' : entering ? 'bubble-entering' : ''}`}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) {
            if (exiting) onExitComplete();
            else finishEntrance();
          }
        }}
      >
        <div className="bubble-float">
          <a
            href={exiting ? undefined : entry.url}
            tabIndex={exiting ? -1 : undefined}
            className={`bubble labels-${settings.labels} ${node.size < 82 ? 'small' : ''} ${entry.folderColor ? 'folder-tinted' : ''}`}
            aria-label={`${entry.title}, ${entry.activity.today} visits today${entry.pinned ? ', pinned' : ''}${entry.members.length > 1 ? `, ${entry.members.length} pages` : ''}`}
            draggable={false}
            onFocus={finishEntrance}
            onClick={(e) => {
              if (suppressClick.current) {
                e.preventDefault();
                suppressClick.current = false;
                return;
              }
              if (
                entry.id.startsWith('domain:') &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.shiftKey
              ) {
                e.preventDefault();
                onGroup(entry);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              onMenu(entry, e.clientX, e.clientY);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                onMenu(entry, rect.right, rect.top);
              }
            }}
            onPointerDown={(e) => {
              finishEntrance();
              suppressClick.current = false;
              if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey)
                return;
              pointer.current = {
                id: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                moved: false,
              };
            }}
            onPointerMove={(e) => {
              const p = pointer.current;
              if (!p || p.id !== e.pointerId) return;
              const x = e.clientX - p.startX,
                y = e.clientY - p.startY;
              if (Math.hypot(x, y) > 6) {
                p.moved = true;
                e.currentTarget.setPointerCapture(e.pointerId);
              }
              if (p.moved) setDrag({ x, y });
            }}
            onPointerUp={(e) => {
              const p = pointer.current;
              if (p?.moved) {
                suppressClick.current = true;
                onDrop(
                  entry.id,
                  node.x + e.clientX - p.startX,
                  node.y + e.clientY - p.startY,
                );
              }
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
              pointer.current = null;
              setDrag(null);
            }}
            onPointerCancel={() => {
              pointer.current = null;
              setDrag(null);
              suppressClick.current = true;
            }}
          >
            <Favicon
              url={entry.url}
              title={entry.title}
              onColor={setAutoColor}
            />
            <span className="bubble-title">{entry.title}</span>
            {entry.pinned && (
              <Pin size={11} className="pin-marker" aria-hidden="true" />
            )}
            {entry.members.length > 1 && (
              <span className="group-count">{entry.members.length}</span>
            )}
          </a>
          <div
            className="bubble-tooltip"
            role="tooltip"
            style={
              {
                '--tip-shift':
                  node.x < 110 || node.x > bounds.width - 110 ? '0%' : '-50%',
                left:
                  node.x < 110
                    ? 0
                    : node.x > bounds.width - 110
                      ? 'auto'
                      : '50%',
                right: node.x > bounds.width - 110 ? 0 : 'auto',
                ...(node.y > bounds.height - 135
                  ? { top: 'auto', bottom: 'calc(100% + 12px)' }
                  : {}),
              } as CSSProperties
            }
          >
            <strong>{entry.title}</strong>
            <span>{entry.domain}</span>
            <div>
              <b>{entry.activity.today}</b> today <i>·</i>{' '}
              <b>{windowVisits(entry.activity, settings.mode)}</b>{' '}
              {modeLabel(settings.mode).toLowerCase()}
            </div>
            {(manualSize || entry.pinned) && (
              <small>
                {[manualSize ? 'Fixed size' : '', entry.pinned ? 'Pinned' : '']
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
