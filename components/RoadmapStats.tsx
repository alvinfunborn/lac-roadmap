import React, { useMemo } from 'react';
import { Roadmap, Place, RouteSegment } from '../types/roadmap';
import { isPlace, isRouteSegment } from '../utils/typeGuards';
import { t } from '../i18n';

interface Props {
  roadmap: Roadmap | null;
}

interface Stats {
  days: number;
  placeCount: number;
  distanceText: string;
  durationText: string;
  tollsText: string;
}

function formatDistance(meters: number): string {
  if (!isFinite(meters) || meters <= 0) return '0 m';
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
  return `${Math.round(meters)} m`;
}

function formatDuration(minutes: number): string {
  if (!isFinite(minutes) || minutes <= 0) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function computeDaysFromRoadmap(roadmap: Roadmap): number {
  const s = roadmap.detail?.start_time;
  const e = roadmap.detail?.end_time;
  if (s && e) {
    const sd = new Date(String(s).split(' ')[0]);
    const ed = new Date(String(e).split(' ')[0]);
    const diff = Math.round((ed.getTime() - sd.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (isFinite(diff) && diff > 0) return diff;
  }
  // Fallback: count unique day groups from items（wishlist 桶不计入天数）
  const daySet = new Set<string>();
  for (const it of roadmap.items) {
    if (isPlace(it)) {
      const start = it.detail?.start_time;
      const days = it.detail?.days;
      if (start) daySet.add(String(start).split(' ')[0]);
      else if (days != null) daySet.add(`第${days}天`);
      // 无 start_time 也无 days → wishlist，不算天数
    }
  }
  return daySet.size;
}

export function computeRoadmapStats(roadmap: Roadmap | null): Stats {
  if (!roadmap) {
    return { days: 0, placeCount: 0, distanceText: '0 m', durationText: '0 min', tollsText: '0' };
  }
  let placeCount = 0;
  let totalDistance = 0;
  let totalDuration = 0;
  let totalTolls = 0;
  for (const it of roadmap.items) {
    if (isPlace(it)) placeCount++;
    else if (isRouteSegment(it)) {
      const seg = it as RouteSegment;
      if (typeof seg.distance === 'number') totalDistance += seg.distance;
      if (typeof seg.duration === 'number') totalDuration += seg.duration;
      if (typeof seg.tolls === 'number') totalTolls += seg.tolls;
    }
  }
  return {
    days: computeDaysFromRoadmap(roadmap),
    placeCount,
    distanceText: formatDistance(totalDistance),
    durationText: formatDuration(totalDuration),
    tollsText: `¥${totalTolls}`,
  };
}

// One-line typographic stat strip — replaces the 5-up dashboard cards.
// Each metric is a span pair: emphasised number + faint unit.
export default function RoadmapStats({ roadmap }: Props) {
  const stats = useMemo(() => computeRoadmapStats(roadmap), [roadmap]);
  const sep = <span className="lac-stats-sep">·</span>;
  return (
    <div className="lac-stats-line">
      <span><span className="lac-stats-num">{stats.days}</span><span className="lac-stats-unit">{t('page.roadmap.stats.days')}</span></span>
      {sep}
      <span><span className="lac-stats-num">{stats.placeCount}</span><span className="lac-stats-unit">{t('page.roadmap.stats.places')}</span></span>
      {sep}
      <span><span className="lac-stats-num">{stats.distanceText}</span></span>
      {sep}
      <span><span className="lac-stats-num">{stats.durationText}</span></span>
      {sep}
      <span><span className="lac-stats-num">{stats.tollsText}</span></span>
    </div>
  );
}

interface SetProps {
  roadmaps: Roadmap[];
}

// Trip-list summary line: status counts in their own colours, then place total.
export function RoadmapSetStats({ roadmaps }: SetProps) {
  const { done, planning, unplanned, placeTotal } = useMemo(() => {
    const now = new Date();
    let done = 0;
    let planning = 0;
    let unplanned = 0;
    let placeTotal = 0;
    for (const r of roadmaps) {
      const s = r.detail?.start_time;
      const e = r.detail?.end_time;
      if (!s && !e) unplanned++;
      else {
        const endDate = e ? new Date(String(e).split(' ')[0]) : (s ? new Date(String(s).split(' ')[0]) : null);
        if (endDate && endDate.getTime() < now.getTime()) done++;
        else planning++;
      }
      for (const it of r.items) if (isPlace(it)) placeTotal++;
    }
    return { total: roadmaps.length, done, planning, unplanned, placeTotal };
  }, [roadmaps]);

  const sep = <span className="lac-stats-sep">·</span>;
  return (
    <div className="lac-stats-line">
      <span className="lac-stats-done">{t('page.set.stats.done', { n: done })}</span>
      {sep}
      <span className="lac-stats-plan">{t('page.set.stats.planning', { n: planning })}</span>
      {sep}
      <span className="lac-stats-wish">{t('page.set.stats.wishlist', { n: unplanned })}</span>
      {sep}
      <span>{t('page.set.stats.places', { n: placeTotal })}</span>
    </div>
  );
}
