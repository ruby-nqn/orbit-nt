import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
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
    [drag, setDrag] = useState<{ x: number; y: number; size: number } | null>(
      null,
    ),
    [landing, setLanding] = useState(false);
  const positionRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{
      id: number;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
      size: number;
      moved: boolean;
    } | null>(null),
    suppressClick = useRef(false);
  useEffect(() => {
    if (!entranceMotion || exiting) setLanding(false);
    if (exiting) {
      pointer.current = null;
      setDrag(null);
    }
  }, [entranceMotion, exiting]);
  useEffect(() => {
    if (!landing) return;
    const timer = setTimeout(() => setLanding(false), 280);
    return () => clearTimeout(timer);
  }, [landing]);
  const cancelDrag = () => {
    const moved = !!pointer.current?.moved;
    pointer.current = null;
    setDrag(null);
    setLanding(moved && entranceMotion);
    if (moved) suppressClick.current = true;
  };
  const dragPoint = (
    p: NonNullable<typeof pointer.current>,
    clientX: number,
    clientY: number,
  ) => {
    const margin = p.size / 2 + 5;
    return {
      x: Math.max(
        margin,
        Math.min(bounds.width - margin, p.originX + clientX - p.startX),
      ),
      y: Math.max(
        margin,
        Math.min(bounds.height - margin, p.originY + clientY - p.startY),
      ),
      size: p.size,
    };
  };
  const color = entry.color ?? autoColor ?? fallbackColor(entry.url);
  const diameter = drag?.size ?? node.size;
  const style = {
    left: drag?.x ?? node.x,
    top: drag?.y ?? node.y,
    width: diameter,
    height: diameter,
    '--accent': color,
    '--folder-accent': entry.folderColor ?? color,
    '--float': `${settings.floatIntensity}px`,
    '--delay': `${-(node.x % 9)}s`,
    '--enter-x': `${bounds.width / 2 - node.x}px`,
    '--enter-y': `${bounds.height / 2 - node.y}px`,
    '--enter-delay': `${(Math.round(node.x + node.y) % 4) * 8}ms`,
    '--favicon-size': `${Math.max(20, (diameter * settings.faviconScale) / 100)}px`,
  } as CSSProperties;
  return (
    <div
      ref={positionRef}
      className={`bubble-position ${dimmed ? 'dimmed' : ''} ${selected ? 'selected' : ''} ${drag ? 'dragging' : ''} ${landing ? 'landing' : ''} ${exiting ? 'exiting' : ''}`}
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
                suppressClick.current = false;
                if (e.detail !== 0) {
                  e.preventDefault();
                  return;
                }
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
              if (e.key === 'Escape' && pointer.current) {
                e.preventDefault();
                e.stopPropagation();
                const id = pointer.current.id;
                cancelDrag();
                if (e.currentTarget.hasPointerCapture(id))
                  e.currentTarget.releasePointerCapture(id);
                return;
              }
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
              setLanding(false);
              const root = positionRef.current!;
              const rect = root.getBoundingClientRect();
              const parent = (
                root.offsetParent as HTMLElement
              ).getBoundingClientRect();
              pointer.current = {
                id: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                originX: rect.left + rect.width / 2 - parent.left,
                originY: rect.top + rect.height / 2 - parent.top,
                size: rect.width,
                moved: false,
              };
              // Capture from press so a fast first movement cannot outrun the circle.
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const p = pointer.current;
              if (!p || p.id !== e.pointerId) return;
              const x = e.clientX - p.startX,
                y = e.clientY - p.startY;
              if (!p.moved && Math.hypot(x, y) > 6) {
                p.moved = true;
              }
              if (p.moved) setDrag(dragPoint(p, e.clientX, e.clientY));
            }}
            onPointerUp={(e) => {
              const p = pointer.current;
              if (
                p &&
                (p.moved ||
                  Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 6)
              ) {
                suppressClick.current = true;
                const release = dragPoint(p, e.clientX, e.clientY);
                // Commit the pointer's final position without transitions before handing
                // the same left/top coordinates to the settled collision layout.
                flushSync(() => setDrag(release));
                positionRef.current?.getBoundingClientRect();
                onDrop(entry.id, release.x, release.y);
                setLanding(entranceMotion);
              }
              pointer.current = null;
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
              setDrag(null);
            }}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={() => {
              if (pointer.current) cancelDrag();
            }}
            onAnimationEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.animationName === 'bubble-land'
              )
                setLanding(false);
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
