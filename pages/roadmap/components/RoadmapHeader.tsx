import React from 'react';
import { App } from 'obsidian';
import { Roadmap } from '../../../types/roadmap';
import { RoadmapRepository } from '../../../repositories/RoadmapRepository';
import { RoadmapSettings } from '../../../types';
import RoadmapStats from '../../../components/RoadmapStats';
import AggregatedMap, { MapLocationItem } from '../../../components/map/AggregatedMap';

interface Props {
  app: App;
  repository: RoadmapRepository;
  settings: RoadmapSettings;
  data: Roadmap | null;
  filePath: string;
  mapLocations: MapLocationItem[];
  onBack: () => void;
  onOpenMetaEditor: () => void;
}

// Trip detail header section — back btn + eyebrow + serif tinted title +
// mono date range + italic serif description + mono stats line + hero
// aggregated map. Renders as a Fragment so the outer `.lac-roadmap-header`
// wrapper (which also hosts DayTabsStrip below the hero map) stays in
// index.tsx. Title tint follows trip status via `lac-roadmap-title--{kind}`.
export default function RoadmapHeader({
  app, repository, settings, data, filePath, mapLocations, onBack, onOpenMetaEditor,
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
      const fmt = (d: Date) => d.toISOString().slice(5, 10).replace('-', '·'); // MM·DD
      if (!e) return fmt(sd);
      const ed = new Date(e);
      if (sd.getTime() === ed.getTime()) return fmt(sd);
      return `${fmt(sd)} → ${fmt(ed)}`;
    } catch { return ''; }
  })();

  return (
    <>
      <div className="lac-roadmap-eyebrow-row">
        <button type="button" className="lac-roadmap-back" onClick={onBack} title="返回" aria-label="返回">
          <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
            <polyline points="10 4 6 8 10 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="lac-eyebrow lac-roadmap-eyebrow">trip</div>
      </div>
      <div className="lac-roadmap-title-row" onClick={onOpenMetaEditor}>
        <h1 className={`lac-serif lac-roadmap-title lac-roadmap-title--${kind}`}>{data?.name || filePath}</h1>
        {dateRange && <span className="lac-mono lac-roadmap-daterange">{dateRange}</span>}
      </div>
      {data?.detail?.description && (
        <div className="lac-serif lac-roadmap-desc">{data.detail.description}</div>
      )}
      <div className="lac-roadmap-stats">
        <RoadmapStats roadmap={data} />
      </div>
      <div className="lac-map-widget">
        <AggregatedMap
          app={app}
          repository={repository}
          settings={settings}
          overrideLocations={mapLocations}
          preferredProvider={data?.detail?.map_provider}
          useNumberedMarkers
        />
      </div>
    </>
  );
}
