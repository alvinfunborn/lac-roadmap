import React, { useRef, useState, useEffect } from 'react';
import { Place, RouteSegment } from '../../../types/roadmap';
import { isPlace } from '../../../utils/typeGuards';
import { isDateKey } from '../../../utils/date';
import { t } from '../../../i18n';
import { TabDef } from '../hooks/useTabs';

interface Props {
  tabDefs: TabDef[];
  groups: Record<string, Array<Place | RouteSegment>>;
  groupKeys: string[];
  selectedTabs: Set<string>;
  onToggleTab: (id: string) => void;
  addDayOnly: () => void;
  onDropToTab: (key: string) => void;
  droppedOnTabRef: React.MutableRefObject<boolean>;
  /** Long-press + release at same tab (no drag) → open date picker. */
  onEditTabDate?: (tabId: string) => void;
  /** Long-press + drop on another tab → swap the two tabs' place dates. */
  onMergeTabsByDrag?: (fromId: string, toId: string) => void;
}

// Day tab strip. Long-press 500ms enters drag mode; drag visual matches the
// place-card Sortable.js style (cursor-following clone with drop shadow, the
// source tab fades to a ghost, the hovered target gets a gold outline).
//
// Releasing on a different tab → onMergeTabsByDrag (swap). Releasing on the
// same tab or off-strip → onEditTabDate (date picker).
export default function DayTabsStrip({
  tabDefs, groups, groupKeys, selectedTabs, onToggleTab, addDayOnly,
  onDropToTab, droppedOnTabRef, onEditTabDate, onMergeTabsByDrag,
}: Props) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedIdRef = useRef<string | null>(null);
  // Initial pointer position — used to cancel the pending long-press if the
  // user starts scrolling horizontally before 500ms (otherwise scrolling
  // accidentally fires drag mode). null when no press is pending.
  const pressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const pressedElRef = useRef<HTMLElement | null>(null);
  // Latest pointer pos — written on every move so the long-press timer can
  // spawn the drag clone at the cursor (which may have drifted since press).
  const lastPointerPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragCloneRef = useRef<HTMLElement | null>(null);
  const [pressedActiveId, setPressedActiveId] = useState<string | null>(null);
  const [pressedOverId, setPressedOverId] = useState<string | null>(null);

  // Cleanup the floating clone if the component unmounts mid-drag.
  useEffect(() => () => removeDragClone(), []);

  const removeDragClone = () => {
    const clone = dragCloneRef.current;
    if (clone && clone.parentElement) clone.parentElement.removeChild(clone);
    dragCloneRef.current = null;
  };

  const positionDragClone = (x: number, y: number) => {
    const clone = dragCloneRef.current;
    if (!clone) return;
    const w = clone.offsetWidth;
    const h = clone.offsetHeight;
    // Anchor center on cursor for a true "carried" feel.
    clone.style.left = `${x - w / 2}px`;
    clone.style.top = `${y - h / 2}px`;
  };

  const spawnDragClone = (sourceEl: HTMLElement, x: number, y: number) => {
    removeDragClone();
    const clone = sourceEl.cloneNode(true) as HTMLElement;
    // Drop interactive / state classes that don't make sense on the clone.
    clone.classList.remove('active', 'lac-tab--dragging', 'lac-tab--drag-over');
    clone.classList.add('lac-tab-drag-clone');
    const rect = sourceEl.getBoundingClientRect();
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    document.body.appendChild(clone);
    dragCloneRef.current = clone;
    positionDragClone(x, y);
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressStartPosRef.current = null;
  };

  const onTabPointerDown = (id: string | undefined, e: React.PointerEvent) => {
    if (!id) return;
    clearLongPress();
    pressStartPosRef.current = { x: e.clientX, y: e.clientY };
    lastPointerPosRef.current = { x: e.clientX, y: e.clientY };
    pressedElRef.current = e.currentTarget as HTMLElement;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      pressedIdRef.current = id;
      setPressedActiveId(id);
      if (pressedElRef.current) {
        spawnDragClone(pressedElRef.current, lastPointerPosRef.current.x, lastPointerPosRef.current.y);
      }
    }, 500);
  };
  const onTabPointerUp = () => clearLongPress();

  // DAY n numbering: only real date tabs get a number; temp / unplanned use ·.
  const dateTabNumber = new Map<string, number>();
  let dn = 0;
  for (const td of tabDefs) {
    if (td.key && isDateKey(td.key)) { dn++; dateTabNumber.set(td.id, dn); }
  }
  const tabCount = (id: string, key?: string): number => {
    if (id === 'unplanned') {
      let n = 0;
      for (const k of groupKeys) {
        if (!isDateKey(k)) for (const it of (groups[k] || [])) if (isPlace(it)) n++;
      }
      return n;
    }
    if (!key) return 0;
    let n = 0;
    for (const it of (groups[key] || [])) if (isPlace(it)) n++;
    return n;
  };
  const tabDateLabel = (key: string): string => {
    const m = key.match(/^\d{4}-(\d{2})-(\d{2})$/);
    return m ? `${m[1]}·${m[2]}` : key;
  };

  const endDrag = () => {
    pressedIdRef.current = null;
    pressedElRef.current = null;
    setPressedActiveId(null);
    setPressedOverId(null);
    removeDragClone();
    clearLongPress();
  };

  return (
    <div
      className="lac-tabs"
      onPointerMove={(e) => {
        lastPointerPosRef.current = { x: e.clientX, y: e.clientY };
        // Pre-long-press: cancel if user scrolls (moves > 8px) so horizontal
        // strip scroll isn't hijacked into a drag.
        if (pressStartPosRef.current && !pressedIdRef.current) {
          const dx = Math.abs(e.clientX - pressStartPosRef.current.x);
          const dy = Math.abs(e.clientY - pressStartPosRef.current.y);
          if (dx > 8 || dy > 8) {
            clearLongPress();
            return;
          }
        }
        if (!pressedIdRef.current) return;
        positionDragClone(e.clientX, e.clientY);
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const tabEl = el?.closest?.('[data-tab-id]') as HTMLElement | null;
        const overId = tabEl?.getAttribute('data-tab-id') || null;
        setPressedOverId(overId);
      }}
      onPointerUp={(e) => {
        const fromId = pressedIdRef.current;
        if (fromId) {
          const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
          const tabEl = el?.closest?.('[data-tab-id]') as HTMLElement | null;
          const toId = tabEl?.getAttribute('data-tab-id') || null;
          if (toId && toId !== fromId) {
            onMergeTabsByDrag?.(fromId, toId);
          } else {
            onEditTabDate?.(fromId);
          }
        }
        endDrag();
      }}
      onPointerCancel={endDrag}
    >
      {tabDefs.map(tdef => {
        const dragCls =
          pressedActiveId === tdef.id ? ' lac-tab--dragging' :
          (pressedOverId === tdef.id && pressedActiveId && pressedActiveId !== tdef.id) ? ' lac-tab--drag-over' : '';
        const dn = dateTabNumber.get(tdef.id);
        const dateLabel = tdef.id === 'unplanned'
          ? t('tabs.unplanned')
          : (tdef.key && isDateKey(tdef.key) ? tabDateLabel(tdef.key) : tdef.label);
        const count = tabCount(tdef.id, tdef.key);
        return (
          <button
            key={tdef.id}
            data-tab-id={tdef.id}
            data-tab-key={tdef.key || ''}
            className={`lac-tab ${selectedTabs.has(tdef.id) ? 'active' : ''}${dragCls}`}
            onClick={() => {
              if (pressedActiveId) return; // swallow click after long-press
              onToggleTab(tdef.id);
            }}
            onPointerDown={(e) => onTabPointerDown(tdef.id, e)}
            onPointerUp={onTabPointerUp}
            {...(tdef.key ? {
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'move'; },
              onDrop: (e: React.DragEvent) => {
                e.preventDefault();
                e.stopPropagation();
                droppedOnTabRef.current = true;
                onDropToTab(tdef.key!);
              },
            } : {})}
          >
            <span className="lac-day-tab-eyebrow">{dn != null ? t('tabs.day.eyebrow', { n: dn }) : t('tabs.day.eyebrow.placeholder')}</span>
            <span className="lac-day-tab-row">
              <span className="lac-day-tab-label">{dateLabel}</span>
              <span className="lac-day-tab-count">{count}</span>
            </span>
          </button>
        );
      })}
      <button className="lac-tab lac-tab--add" onClick={addDayOnly} title={t('tabs.add.title')}>{t('tabs.add')}</button>
    </div>
  );
}
