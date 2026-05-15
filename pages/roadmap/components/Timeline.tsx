import React from 'react';
import { Roadmap, Place, RouteSegment, Address } from '../../../types/roadmap';
import { RoadmapSettings } from '../../../types';
import { isPlace, isRouteSegment } from '../../../utils/typeGuards';
import { isDateKey } from '../../../utils/date';
import RouteBadge from '../../../components/RouteBadge';
import PlaceCard from './PlaceCard';
import type { PlacePoint } from '../../../components/PlaceStaticMap';
import { formatStraightLineDistance } from '../helpers';

export interface RouteEditTrigger {
  placeIndex: number;
  segment: RouteSegment;
  from?: Place;
  to?: Place;
}

interface Props {
  data: Roadmap;
  visibleItemIndices: number[];
  groupKeys: string[];
  groups: Record<string, Array<Place | RouteSegment>>;
  settings: RoadmapSettings;
  subEndpoints: Record<string, { start?: Address; end?: Address }>;
  cardListRef: React.RefObject<HTMLDivElement>;
  didDragRef: React.MutableRefObject<boolean>;
  lastDraggedItemRef: React.MutableRefObject<number | null>;
  onPlaceClick: (place: Place, itemIndex: number) => void;
  onEditRoute: (args: RouteEditTrigger) => void;
}

// Field-journal timeline: spine + numbered bullet (CSS counters in
// _roadmap-page.scss) + PlaceCard + RouteBadge / `+ transit` chip
// interleaved on the spine. Day-eyebrow `DAY n` appears on the first
// visible place of each date group.
export default function Timeline({
  data, visibleItemIndices, groupKeys, groups, settings,
  subEndpoints, cardListRef, didDragRef, lastDraggedItemRef,
  onPlaceClick, onEditRoute,
}: Props) {
  // DAY n numbering for date keys; non-date keys (`第N天`) keep their label.
  const dayNumberMap = new Map<string, number>();
  let dn = 0;
  for (const k of groupKeys) {
    if (isDateKey(k)) { dn++; dayNumberMap.set(k, dn); }
  }
  const keyForPlace = (pl: Place): string => {
    const start = pl.detail?.start_time;
    return start ? String(start).split(' ')[0] : `第${pl.detail?.days ?? 1}天`;
  };
  const labelForKey = (k: string): string => {
    if (!k) return 'wishlist';
    if (isDateKey(k)) {
      const n = dayNumberMap.get(k);
      return n != null ? `DAY ${n}` : k;
    }
    return k;
  };
  const dayLabels: Array<string | undefined> = [];
  let prevKey = '';
  for (let i = 0; i < visibleItemIndices.length; i++) {
    const pl = data.items[visibleItemIndices[i]] as Place;
    const k = keyForPlace(pl);
    dayLabels.push(k !== prevKey ? labelForKey(k) : undefined);
    prevKey = k;
  }

  // Trip-wide place list (geocoded only, in source order) — every card
  // thumbnail receives this same list with its own tripIndex highlighted.
  const tripPlaces: PlacePoint[] = [];
  const tripIndexByItem = new Map<number, number>();
  for (let i = 0; i < data.items.length; i++) {
    const it = data.items[i];
    if (!isPlace(it)) continue;
    const addr = it.detail?.address;
    if (addr && typeof addr.latitude === 'number' && typeof addr.longitude === 'number') {
      tripIndexByItem.set(i, tripPlaces.length);
      tripPlaces.push({
        lat: addr.latitude,
        lng: addr.longitude,
        coordinate_system: addr.coordinate_system,
      });
    }
  }

  return (
    <div className="lac-card-list lac-card-list--timeline" ref={cardListRef}>
      {visibleItemIndices.map((itemIndex, visIdx) => {
        const p = data.items[itemIndex] as Place;
        const nextItem = data.items[itemIndex + 1];
        const routeAfter = isRouteSegment(nextItem) ? nextItem : undefined;
        const hasNextVisible = visIdx < visibleItemIndices.length - 1;
        const dayLabel = dayLabels[visIdx];
        const tripIndex = tripIndexByItem.get(itemIndex) ?? -1;

        const handleCardClick = () => {
          if (didDragRef.current && lastDraggedItemRef.current === itemIndex) {
            didDragRef.current = false;
            lastDraggedItemRef.current = null;
            return;
          }
          onPlaceClick(p, itemIndex);
        };

        return (
          <React.Fragment key={`${p.id}-${itemIndex}`}>
            <PlaceCard
              place={p}
              itemIndex={itemIndex}
              groups={groups}
              settings={settings}
              mapProvider={data.detail?.map_provider}
              onClick={handleCardClick}
              dayLabel={dayLabel}
              tripPlaces={tripPlaces}
              tripIndex={tripIndex}
            />
            {hasNextVisible && routeAfter && (
              <RouteBadge
                segment={routeAfter}
                onClick={() => {
                  let nextPlace: Place | undefined;
                  for (let j = itemIndex + 2; j < data.items.length; j++) {
                    const it = data.items[j];
                    if (isPlace(it)) { nextPlace = it; break; }
                  }
                  onEditRoute({ placeIndex: itemIndex, segment: routeAfter, from: p, to: nextPlace });
                }}
              />
            )}
            {hasNextVisible && !routeAfter && (() => {
              const nextVisibleIdx = visibleItemIndices[visIdx + 1];
              const nextPlace = data.items[nextVisibleIdx] as Place | undefined;
              const fromCoord = subEndpoints[p.id]?.end || p.detail?.address;
              const toCoord = nextPlace ? (subEndpoints[nextPlace.id]?.start || nextPlace.detail?.address) : undefined;
              const distLabel = formatStraightLineDistance(fromCoord, toCoord);
              return (
                <div
                  className="lac-route-badge lac-route-badge--add lac-route-badge--clickable"
                  data-no-drag="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditRoute({
                      placeIndex: itemIndex,
                      segment: { travelMode: 'drive', distance: 0, duration: 0, tolls: 0 },
                      from: p,
                      to: nextPlace,
                    });
                  }}
                >
                  <span className="lac-route-badge-mode">+ transit</span>
                  {distLabel && (
                    <>
                      <span className="lac-route-badge-sep">·</span>
                      <span>{distLabel}</span>
                    </>
                  )}
                </div>
              );
            })()}
          </React.Fragment>
        );
      })}
    </div>
  );
}
