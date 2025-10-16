import { useEffect, useMemo, useRef, useState } from 'react';
import { Roadmap, Place } from '../types/roadmap';

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function startOfWeekMonday(d: Date): Date { const x = startOfDay(d); const day = x.getDay(); const offset = (day + 6) % 7; x.setDate(x.getDate() - offset); return x; }
function endOfWeekSunday(d: Date): Date { const s = startOfWeekMonday(d); s.setDate(s.getDate() + 6); return s; }
function formatYMD(d: Date): string { const y=d.getFullYear(); const m=`${d.getMonth()+1}`.padStart(2,'0'); const da=`${d.getDate()}`.padStart(2,'0'); return `${y}-${m}-${da}`; }
function parseDateOrNull(s?: string): Date | null {
  if (!s) return null;
  const raw = s.trim();
  // Support 1-2 digit month/day and optional time with space or T separator
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Math.max(1, Math.min(12, Number(m[2]))) - 1;
    const da = Math.max(1, Math.min(31, Number(m[3])));
    const hh = m[4] ? Number(m[4]) : 0;
    const mi = m[5] ? Number(m[5]) : 0;
    const ss = m[6] ? Number(m[6]) : 0;
    const d = new Date(y, mo, da, hh, mi, ss);
    if (!isNaN(d.getTime())) return d;
  }
  // Fallback: try replacing space with T and letting Date parse
  let iso = raw;
  if (iso.indexOf(' ') > 0 && iso.indexOf('T') === -1) iso = iso.replace(' ', 'T');
  const t = new Date(iso);
  if (!isNaN(t.getTime())) return t;
  return null;
}

export function buildDailyCounts(roadmap: Roadmap): Record<string, number> {
  const map: Record<string, number> = {};
  const places = (roadmap.items || []).filter(it => 'name' in it) as Place[];
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

  // color mapping per requirement: 0 gray, 1 green -> 6 yellow, 6 -> 11 red
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const toHex2 = (n: number) => n.toString(16).padStart(2, '0');
  const rgbToHex = (r: number, g: number, b: number) => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
  const GREEN: [number, number, number] = [0, 255, 0];
  const YELLOW: [number, number, number] = [255, 255, 0];
  const RED: [number, number, number] = [255, 0, 0];
  const GRAY: string = '#4b4b4b';
  const getColorForCount = (cnt: number): string => {
    if (cnt <= 0) return GRAY;
    if (cnt >= 11) return '#ff0000';
    if (cnt <= 6) { const t = (cnt - 1) / 5; return rgbToHex(lerp(GREEN[0], YELLOW[0], t), lerp(GREEN[1], YELLOW[1], t), lerp(GREEN[2], YELLOW[2], t)); }
    const t = (cnt - 6) / 5; return rgbToHex(lerp(YELLOW[0], RED[0], t), lerp(YELLOW[1], RED[1], t), lerp(YELLOW[2], RED[2], t));
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
    let opacity = 1.0;
    if (cnt > 0) {
      fill = getColorForCount(cnt);
      opacity = 1.0;
    } else if (globalRangeDays[key]) {
      // 有路线区间但无地点
      fill = '#4b4b4b';
      opacity = 1.0;
    } else {
      // 无路线区间且无地点：黑灰底（较低不透明度）
      fill = '#000000';
      opacity = 0.10;
    }
    rects.push({ x, y, fill, opacity, key });
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


