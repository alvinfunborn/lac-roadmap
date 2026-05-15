import React, { useRef, useState } from 'react';
import { Place, RouteSegment } from '../../../types/roadmap';
import { isPlace } from '../../../utils/typeGuards';
import { isDateKey } from '../../../utils/date';
import { TabDef } from '../hooks/useTabs';

interface Props {
  tabDefs: TabDef[];
  groups: Record<string, Array<Place | RouteSegment>>;
  groupKeys: string[];
  selectedTabs: Set<string>;
  onToggleTab: (id: string) => void;
  addDayOnly: () => void;
  reorderTab: (from: string, to: string) => void;
  onDropToTab: (key: string) => void;
  droppedOnTabRef: React.MutableRefObject<boolean>;
}

// Day tab strip (DAY n / 11·01 / count three-tier mono). Owns its own
// long-press-to-reorder state — kept local because nothing outside the
// strip needs to read these refs.
export default function DayTabsStrip({
  tabDefs, groups, groupKeys, selectedTabs, onToggleTab, addDayOnly,
  reorderTab, onDropToTab, droppedOnTabRef,
}: Props) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragKeyRef = useRef<string | null>(null);
  const [dragActiveKey, setDragActiveKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const onTabPointerDown = (key: string | undefined) => {
    if (!key) return;
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      dragKeyRef.current = key;
      setDragActiveKey(key);
    }, 500);
  };
  const onTabPointerUp = () => clearLongPress();

  // DAY n numbering: only real date tabs get a number; temp / unplanned use ·.
  const dateTabNumber = new Map<string, number>();
  let dn = 0;
  for (const t of tabDefs) {
    if (t.key && isDateKey(t.key)) { dn++; dateTabNumber.set(t.id, dn); }
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

  return (
    <div
      className="lac-tabs"
      onPointerMove={(e) => {
        if (!dragKeyRef.current) return;
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const tabEl = el?.closest?.('[data-tab-key]') as HTMLElement | null;
        const overKey = tabEl?.getAttribute('data-tab-key') || null;
        setDragOverKey(overKey);
      }}
      onPointerUp={(e) => {
        const fromKey = dragKeyRef.current;
        if (fromKey) {
          const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
          const tabEl = el?.closest?.('[data-tab-key]') as HTMLElement | null;
          const toKey = tabEl?.getAttribute('data-tab-key');
          if (toKey && toKey !== fromKey) reorderTab(fromKey, toKey);
        }
        dragKeyRef.current = null;
        setDragActiveKey(null);
        setDragOverKey(null);
        clearLongPress();
      }}
      onPointerCancel={() => {
        dragKeyRef.current = null;
        setDragActiveKey(null);
        setDragOverKey(null);
        clearLongPress();
      }}
    >
      {tabDefs.map(tdef => {
        const dragCls =
          tdef.key && dragActiveKey === tdef.key ? ' lac-tab--dragging' :
          tdef.key && dragOverKey === tdef.key && dragActiveKey && dragActiveKey !== tdef.key ? ' lac-tab--drag-over' : '';
        const dn = dateTabNumber.get(tdef.id);
        const dayMark = dn != null ? String(dn) : '·';
        const dateLabel = tdef.id === 'unplanned'
          ? 'wishlist'
          : (tdef.key && isDateKey(tdef.key) ? tabDateLabel(tdef.key) : tdef.label);
        const count = tabCount(tdef.id, tdef.key);
        return (
          <button
            key={tdef.id}
            data-tab-key={tdef.key || ''}
            className={`lac-tab ${selectedTabs.has(tdef.id) ? 'active' : ''}${dragCls}`}
            onClick={() => {
              if (dragActiveKey) return; // swallow click after long-press drag
              onToggleTab(tdef.id);
            }}
            onPointerDown={() => onTabPointerDown(tdef.key)}
            onPointerUp={onTabPointerUp}
            onPointerLeave={onTabPointerUp}
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
            <span className="lac-day-tab-eyebrow">DAY {dayMark}</span>
            <span className="lac-day-tab-row">
              <span className="lac-day-tab-label">{dateLabel}</span>
              <span className="lac-day-tab-count">{count}</span>
            </span>
          </button>
        );
      })}
      <button className="lac-tab lac-tab--add" onClick={addDayOnly} title="添加一天">+ day</button>
    </div>
  );
}
