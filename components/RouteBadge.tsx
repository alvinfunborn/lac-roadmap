import React from 'react';
import { RouteSegment, TravelMode } from '../types/roadmap';

// Short mono labels (matches the design's mono glyphs — `walk` / `bike` /
// `car` / `train` / `moto`). Falls back to the raw mode string if a new
// mode is added without updating this map.
const TRAVEL_MODE_LABEL: Record<TravelMode, string> = {
  walk: 'walk',
  bicycle: 'bike',
  two_wheeler: 'moto',
  drive: 'car',
  transit: 'train',
};

function formatDistance(m: number): string {
  return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m';
}

function formatDuration(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${min} min`;
}

interface Props {
  segment: RouteSegment;
  onClick?: () => void;
}

// Pill chip that hangs on the timeline spine: `train · 4.8 km · 18 min`.
// Class names are preserved (`.lac-route-badge`, `--clickable`) so the
// Sortable `data-no-drag` carve-out and click-to-edit wiring keep working.
export default function RouteBadge({ segment, onClick }: Props) {
  const segs: React.ReactNode[] = [
    <span key="mode" className="lac-route-badge-mode">
      {TRAVEL_MODE_LABEL[segment.travelMode] || segment.travelMode}
    </span>,
  ];
  if (typeof segment.distance === 'number') segs.push(<span key="d">{formatDistance(segment.distance)}</span>);
  if (typeof segment.duration === 'number') segs.push(<span key="t">{formatDuration(segment.duration)}</span>);
  if (typeof segment.tolls === 'number' && segment.tolls > 0) segs.push(<span key="c">{`¥${segment.tolls}`}</span>);

  // Interleave with separator dots while keeping React keys stable.
  const interleaved: React.ReactNode[] = [];
  segs.forEach((s, i) => {
    if (i > 0) interleaved.push(<span key={`s${i}`} className="lac-route-badge-sep">·</span>);
    interleaved.push(s);
  });

  const handleClick = onClick
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick();
      }
    : undefined;

  return (
    <div
      className={`lac-route-badge${onClick ? ' lac-route-badge--clickable' : ''}`}
      data-no-drag="true"
      onClick={handleClick}
    >
      {interleaved}
    </div>
  );
}
