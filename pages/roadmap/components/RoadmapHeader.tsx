import React from 'react';
import { App } from 'obsidian';
import { Roadmap } from '../../../types/roadmap';
import { RoadmapRepository } from '../../../repositories/RoadmapRepository';
import { RoadmapSettings } from '../../../types';
import RoadmapStats from '../../../components/RoadmapStats';
import AggregatedMap, { MapLocationItem } from '../../../components/map/AggregatedMap';
import { t } from '../../../i18n';

interface Props {
  app: App;
  repository: RoadmapRepository;
  settings: RoadmapSettings;
  data: Roadmap | null;
  filePath: string;
  mapLocations: MapLocationItem[];
  onBack: () => void;
  onOpenMetaEditor: () => void;
  /** Click handler for the hero map area. The hero AggregatedMap is
   *  non-interactive (Chromium hit-testing bug with the warm-ink overlay
   *  combo — see _map-widget.scss); the parent wires this to a readOnly
   *  MapSelector viewer modal so users can pan/zoom the same locations
   *  in an interactive context. */
  onHeroMapClick?: () => void;
}

// Trip detail header section — back btn + eyebrow + serif tinted title +
// mono date range + italic serif description + mono stats line + hero
// aggregated map. Renders as a Fragment so the outer `.lac-roadmap-header`
// wrapper (which also hosts DayTabsStrip below the hero map) stays in
// index.tsx. Title tint follows trip status via `lac-roadmap-title--{kind}`.
export default function RoadmapHeader({
  app, repository, settings, data, filePath, mapLocations, onBack, onOpenMetaEditor, onHeroMapClick,
}: Props) {
  const s = data?.detail?.start_time;
  const e = data?.detail?.end_time;
  let kind: 'done' | 'plan' | 'wish' = 'wish';
  if (s || e) {
    const now = new Date();
    try {
      const ed = e ? new Date(String(e).split(' ')[0]) : (s ? new Date(String(s).split(' ')[0]) : null);
      kind = ed && ed.getTime() < now.getTime() ? 'done' : 'plan';
    } catch { kind = 'plan'; }
  }
  const dateRange = (() => {
    if (!s) return '';
    try {
      const sd = new Date(s);
      const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '·'); // YYYY·MM·DD
      const md  = (d: Date) => d.toISOString().slice(5, 10).replace('-', '·');   // MM·DD
      if (!e) return ymd(sd);
      const ed = new Date(e);
      if (sd.getTime() === ed.getTime()) return ymd(sd);
      // 同年只在起点带年份；跨年两端都带，避免读者得自己脑补。
      const sameYear = sd.getUTCFullYear() === ed.getUTCFullYear();
      return sameYear ? `${ymd(sd)} → ${md(ed)}` : `${ymd(sd)} → ${ymd(ed)}`;
    } catch { return ''; }
  })();

  return (
    <>
      <div className="lac-roadmap-eyebrow-row">
        <div className="lac-eyebrow lac-roadmap-eyebrow">{t('page.roadmap.eyebrow')}</div>
      </div>
      <div className="lac-roadmap-title-row">
        <button
          type="button"
          className="lac-roadmap-back"
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          title={t('page.roadmap.back')}
          aria-label={t('page.roadmap.back')}
        >
          <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
            <polyline points="10 4 6 8 10 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1
          className={`lac-serif lac-roadmap-title lac-roadmap-title--${kind}`}
          onClick={onOpenMetaEditor}
        >{data?.name || filePath}</h1>
        {dateRange && (
          <span className="lac-mono lac-roadmap-daterange" onClick={onOpenMetaEditor}>{dateRange}</span>
        )}
      </div>
      {data?.detail?.description && (
        <div className="lac-serif lac-roadmap-desc">{data.detail.description}</div>
      )}
      <div className="lac-roadmap-stats">
        <RoadmapStats roadmap={data} />
      </div>
      <div
        className={`lac-map-widget${onHeroMapClick ? ' lac-map-widget--clickable' : ''}`}
        onClick={onHeroMapClick}
        role={onHeroMapClick ? 'button' : undefined}
        tabIndex={onHeroMapClick ? 0 : undefined}
        onKeyDown={onHeroMapClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHeroMapClick(); } } : undefined}
        aria-label={onHeroMapClick ? t('page.set.mapAria') : undefined}
      >
        <AggregatedMap
          app={app}
          repository={repository}
          settings={settings}
          overrideLocations={mapLocations}
          preferredProvider={data?.detail?.map_provider}
          useNumberedMarkers
        />
        {onHeroMapClick && <span className="lac-map-widget-expand">{t('page.set.mapExpand')}</span>}
      </div>
    </>
  );
}
