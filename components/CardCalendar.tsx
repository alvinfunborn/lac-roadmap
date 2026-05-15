import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Roadmap, Place } from '../types/roadmap';
import { startOfDay, endOfWeekSunday, formatYMD, parseDateOrNull } from '../utils/date';
import { isPlace } from '../utils/typeGuards';

export function buildDailyCounts(roadmap: Roadmap): Record<string, number> {
  const map: Record<string, number> = {};
  const places = (roadmap.items || []).filter(isPlace) as Place[];
  for (const p of places) {
    const ds = p.detail?.start_time || p.detail?.end_time;
    const d = parseDateOrNull(ds);
    if (!d) continue;
    const key = formatYMD(startOfDay(d));
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

export default function CardCalendar({ roadmap, globalCounts, globalRangeDays }: { roadmap: Roadmap; globalCounts: Record<string, number>; globalRangeDays: Record<string, true> }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const measureNow = () => {
      const rect = el.getBoundingClientRect();
      const rectW = Math.floor(rect.width);
      const rectH = Math.floor(rect.height);
      if (rectW && rectW !== width) setWidth(rectW);
      if (rectH && rectH !== height) setHeight(rectH);
    };
    const ro = new ResizeObserver(entries => {
      if (!entries[0]) return;
      const cr = entries[0].contentRect;
      const w = Math.floor(cr.width);
      const h = Math.floor(cr.height);
      if (w !== width) setWidth(w);
      if (h !== height) setHeight(h);
    });
    ro.observe(el); requestAnimationFrame(measureNow); return () => ro.disconnect();
  }, [width, height]);

  const localCounts = useMemo(() => buildDailyCounts(roadmap), [roadmap]);
  const counts = useMemo(() => ({ ...globalCounts, ...localCounts }), [globalCounts, localCounts]);

  // Monochromatic gold density — 5 levels keyed by place-count buckets.
  // Reads CSS custom properties (--heat-1..5) so theme-time colour changes
  // flow through without rebuilding the SVG. Out-of-range / in-range-empty
  // are signalled by --heat-bg / --heat-empty respectively.
  const getColorForCount = (cnt: number): string => {
    if (cnt <= 0) return 'var(--heat-empty)';
    if (cnt >= 5) return 'var(--heat-5)';
    if (cnt >= 4) return 'var(--heat-4)';
    if (cnt >= 3) return 'var(--heat-3)';
    if (cnt >= 2) return 'var(--heat-2)';
    return 'var(--heat-1)';
  };

  const today = startOfDay(new Date());
  const anchor = startOfDay(parseDateOrNull(roadmap.detail?.end_time) || today);
  const end = endOfWeekSunday(anchor);

  const rows = 7;
  const gap = 2;
  // derive cell size from container height so calendar fills vertically
  const derivedCell = height > 0 ? Math.max(6, Math.floor((height - (rows - 1) * gap) / rows)) : 9;
  const cell = derivedCell;
  const colW = cell + gap;
  const svgHeight = rows * cell + (rows - 1) * gap;
  const parentWidth = Math.floor((containerRef.current?.parentElement as HTMLElement | null)?.clientWidth || 0);
  const rectWidth = Math.floor(containerRef.current?.getBoundingClientRect().width || 0);
  const effectiveWidth = width || rectWidth || parentWidth || 180;
  const cols = Math.max(1, Math.floor(effectiveWidth / colW));
  const totalDays = cols * 7;

  const start = new Date(end); start.setDate(start.getDate() - totalDays + 1);

  const rects: Array<{ x:number; y:number; fill:string; opacity:number; key:string }> = [];
  const rs = parseDateOrNull(roadmap.detail?.start_time);
  const re = parseDateOrNull(roadmap.detail?.end_time);

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = formatYMD(d);
    const row = (d.getDay() + 6) % 7;
    const colFromRight = Math.floor((totalDays - 1 - i) / 7);
    const x = Math.max(0, effectiveWidth - (colFromRight + 1) * colW);
    const y = row * (cell + gap);

    const cnt = counts[key] || 0;
    let fill: string;
    if (cnt > 0) {
      fill = getColorForCount(cnt);
    } else if (globalRangeDays[key]) {
      // 有路线区间但无地点
      fill = 'var(--heat-empty)';
    } else {
      // 无路线区间且无地点
      fill = 'var(--heat-bg)';
    }
    rects.push({ x, y, fill, opacity: 1, key });
  }

  return (
    <div className="lac-card-calendar" ref={containerRef}>
      {effectiveWidth > 0 && (
        <svg width="100%" height={svgHeight} viewBox={`0 0 ${effectiveWidth} ${svgHeight}`}>
          {rects.map(r => (
            <rect key={r.key} x={r.x} y={r.y} width={cell} height={cell} rx={1} ry={1} fill={r.fill} fillOpacity={r.opacity} />
          ))}
        </svg>
      )}
    </div>
  );
}


