import React from 'react';
import { Place, RouteSegment } from '../../../types/roadmap';
import { RoadmapSettings } from '../../../types';
import PlaceStaticMap, { PlacePoint } from '../../../components/PlaceStaticMap';
import { getPlaceStatusColor, formatPlaceTime } from '../helpers';

// Map legacy state-class strings to the new `.lac-dot--*` modifiers.
const STATUS_DOT: Record<string, string> = {
  'lac-done': 'lac-dot--done',
  'lac-todo': 'lac-dot--plan',
  'lac-na':   'lac-dot--wish',
};

interface Props {
  place: Place;
  itemIndex: number;
  groups: Record<string, Array<Place | RouteSegment>>;
  settings: RoadmapSettings;
  mapProvider?: 'google' | 'gaode';
  onClick: () => void;
  /** When set, render a `DAY N` (or 第N天 / wishlist) mono eyebrow above
   *  the title — and the timeline bullet snaps to the eyebrow row. */
  dayLabel?: string;
  /** All geocoded places in the trip (in source order). Each card thumb
   *  shows the same multi-point context (numbered circles + polyline);
   *  the current card's place is highlighted via `tripIndex`. */
  tripPlaces: PlacePoint[];
  /** 0-based index of this place inside `tripPlaces`. -1 means this
   *  place isn't geocoded and the thumbnail is hidden. */
  tripIndex: number;
}

export default function PlaceCard({
  place, itemIndex, groups, settings, mapProvider, onClick, dayLabel, tripPlaces, tripIndex,
}: Props) {
  const statusCls = getPlaceStatusColor(place, groups);
  const dotCls = STATUS_DOT[statusCls] || 'lac-dot--wish';
  const time = formatPlaceTime(place);
  const desc = place.detail?.description || '';

  const hasCoords = tripIndex >= 0 && tripPlaces.length > 0;

  return (
    <div
      className={`lac-card${dayLabel ? ' lac-card--with-day-eyebrow' : ''}`}
      data-place-index={itemIndex}
      onClick={onClick}
      style={{ cursor: 'grab' }}
    >
      <div className="lac-card-row">
        <div className="lac-card-body">
          {dayLabel && <div className="lac-card-day-eyebrow lac-eyebrow">{dayLabel}</div>}
          <div className="lac-card-name">
            <span className={`lac-dot ${dotCls}`} />
            <span className={`lac-card-title ${statusCls}`}>{place.name}</span>
          </div>
          {time && <div className="lac-card-meta">{time}</div>}
          {desc && <div className="lac-card-desc">{desc}</div>}
        </div>
        {hasCoords && (
          <div className="lac-card-thumb">
            <PlaceStaticMap
              key={`map-${itemIndex}-${place.id}-${tripIndex}`}
              places={tripPlaces}
              currentIndex={tripIndex}
              placeName={place.name}
              mapKey={`${place.id}-trip-${tripPlaces.length}`}
              preferredProvider={mapProvider}
              settings={settings}
            />
          </div>
        )}
      </div>
    </div>
  );
}
