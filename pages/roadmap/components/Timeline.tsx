import React from 'react';
import { Roadmap, Place, RouteSegment, Address } from '../../../types/roadmap';
import { RoadmapSettings } from '../../../types';
import { isPlace, isRouteSegment } from '../../../utils/typeGuards';
import { isDateKey } from '../../../utils/date';
import { t } from '../../../i18n';
import RouteBadge from '../../../components/RouteBadge';
import PlaceCard from './PlaceCard';
import type { PlacePoint } from '../../../components/PlaceStaticMap';
import { getPlaceStatus } from '../../../utils/placeStatus';
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
  /** 由 useRoadmapGroups 计算的 itemIndex → day key 映射 —— 单一事实源，避免与 stats / tabs 不一致。 */
  groupKeyForItem: Map<number, string>;
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
  data, visibleItemIndices, groupKeys, groups, groupKeyForItem, settings,
  subEndpoints, cardListRef, didDragRef, lastDraggedItemRef,
  onPlaceClick, onEditRoute,
}: Props) {
  // DAY n numbering for date keys; non-date keys (`第N天`) keep their label.
  const dayNumberMap = new Map<string, number>();
  let dn = 0;
  for (const k of groupKeys) {
    if (isDateKey(k)) { dn++; dayNumberMap.set(k, dn); }
  }
  // 非日期 key 形如 `第${i}天` —— 取出数字以便用本地化标签替换。
  const extractDayN = (k: string): number | null => {
    const m = k.match(/^第(\d+)天$/);
    return m ? parseInt(m[1], 10) : null;
  };
  const labelForKey = (k: string): string => {
    if (!k) return t('tabs.unplanned');
    if (isDateKey(k)) {
      const n = dayNumberMap.get(k);
      return n != null ? t('tabs.day.label', { n }) : k;
    }
    const n = extractDayN(k);
    return n != null ? t('tabs.day.label', { n }) : k;
  };
  const dayLabels: Array<string | undefined> = [];
  let prevKey = '';
  for (let i = 0; i < visibleItemIndices.length; i++) {
    const itemIndex = visibleItemIndices[i];
    const k = groupKeyForItem.get(itemIndex) || '';
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
        status: getPlaceStatus(it as Place),
      });
    }
  }

  return (
    <div className="lac-card-list lac-card-list--timeline" ref={cardListRef}>
      {visibleItemIndices.map((itemIndex, visIdx) => {
        const p = data.items[itemIndex] as Place;
        const nextItem = data.items[itemIndex + 1];
        const storedRoute = isRouteSegment(nextItem) ? nextItem : undefined;
        const hasNextVisible = visIdx < visibleItemIndices.length - 1;
        // 渲染排序后，文件里 P→Q 的 route 段不一定指向显示里 P 的下一张卡。
        // 仅当显示下一张卡正好是文件里紧随 route 之后的那张地点，才认这条 route。
        const displayNextItemIdx = hasNextVisible ? visibleItemIndices[visIdx + 1] : -1;
        const storedNextPlaceIdx = storedRoute ? itemIndex + 2 : itemIndex + 1;
        const routeAfter = storedRoute && displayNextItemIdx === storedNextPlaceIdx ? storedRoute : undefined;
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
                  <span className="lac-route-badge-mode">{t('timeline.addTransit')}</span>
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
