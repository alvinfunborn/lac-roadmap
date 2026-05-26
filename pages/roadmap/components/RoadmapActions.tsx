import React from 'react';
import { t } from '../../../i18n';

interface Props {
  onAddPlace: () => void;
  onAddTrip: () => void;
}

// Bottom action row: dashed `+ add place` / `+ add trip` (full-width pair).
export default function RoadmapActions({ onAddPlace, onAddTrip }: Props) {
  return (
    <div className="lac-roadmap-actions">
      <button type="button" className="lac-btn--quiet lac-btn--add-place" onClick={onAddPlace} title={t('page.roadmap.actions.addPlace')}>{t('page.roadmap.actions.addPlace')}</button>
      <button type="button" className="lac-btn--quiet lac-btn--add-place" onClick={onAddTrip} title={t('page.roadmap.actions.addTrip')}>{t('page.roadmap.actions.addTrip')}</button>
    </div>
  );
}
