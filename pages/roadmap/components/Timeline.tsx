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
  // DAY n numbering for date keys — anchored to the earliest dated group,
  // measured as calendar-day offset (+1, so the earliest = Day 1). Counting
  // sequentially over groupKeys would mis-number when the trip has gap days
  // with no places (e.g. 05-01 / 05-03 / 05-05 → 1,2,3 instead of 1,3,5).
  const dayNumberMap = new Map<string, number>();
  const dateKeys = groupKeys.filter(isDateKey);
  if (dateKeys.length > 0) {
    const sortedDateKeys = [...dateKeys].sort();
    const [ey, em, ed] = sortedDateKeys[0].split('-').map(Number);
    const anchorMs = new Date(ey, em - 1, ed).getTime();
    for (const k of dateKeys) {
      const [y, mo, d] = k.split('-').map(Number);
      const offsetDays = Math.round((new Date(y, mo - 1, d).getTime() - anchorMs) / 86400000);
      dayNumberMap.set(k, offsetDays + 1);
    }
  }
  // 子路线条目（roadmap 里的 roadmap）本身没有 detail.address —— 它的坐标是子路线
  // 首/末个已地理编码地点（subEndpoints）。给「自动计算交通」用的 from/to 必须把这
  // 个端点坐标补进去，否则 RouteCalculationService 拿不到坐标，报「缺少坐标」。
  // 衔接语义：from 取上一段的「出口」(end)，to 取下一段的「入口」(start)。
  const withEndpoint = (pl: Place | undefined, which: 'start' | 'end'): Place | undefined => {
    if (!pl) return pl;
    const ep = subEndpoints[pl.id];
    const addr = which === 'end' ? ep?.end : ep?.start;
    if (addr && !pl.detail?.address) {
      return { ...pl, detail: { ...(pl.detail || {}), address: addr } };
    }
    return pl;
  };

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
  // 编号（label）与卡片号对齐：每个「已计划」地点都占一个序号，哪怕它没有坐标、
  // 不画在图上 —— 否则缩略图会把没坐标的地点跳过并压缩编号，导致后面所有点的
  // 数字比卡片少（序号对不上）。子路线条目用它的端点代表点参与编号。
  const tripPlaces: PlacePoint[] = [];
  const tripIndexByItem = new Map<number, number>();
  let plannedCounter = 0;
  for (let i = 0; i < data.items.length; i++) {
    const it = data.items[i];
    if (!isPlace(it)) continue;
    const status = getPlaceStatus(it as Place);
    const label = status === 'wish' ? undefined : (++plannedCounter);
    let addr = it.detail?.address;
    if (!(addr && typeof addr.latitude === 'number' && typeof addr.longitude === 'number')) {
      // 子路线条目（roadmap 里的 roadmap）自己没有坐标 —— 用它的端点（子路线首个、
      // 退而求其次末个已地理编码的地点）作代表点，让它在父路线里的卡片也有小地图、
      // 也出现在多点地图上下文中，否则整张卡缺了缩略图。
      const ep = subEndpoints[it.id];
      const cand = (ep?.start && typeof ep.start.latitude === 'number' && typeof ep.start.longitude === 'number')
        ? ep.start
        : (ep?.end && typeof ep.end.latitude === 'number' && typeof ep.end.longitude === 'number')
          ? ep.end
          : undefined;
      addr = cand;
    }
    if (addr && typeof addr.latitude === 'number' && typeof addr.longitude === 'number') {
      tripIndexByItem.set(i, tripPlaces.length);
      tripPlaces.push({
        lat: addr.latitude,
        lng: addr.longitude,
        coordinate_system: addr.coordinate_system,
        status,
        label,
      });
    }
    // 没坐标、又不是子路线的地点：上面的 ++plannedCounter 已经把它的序号占掉了，
    // 不入 tripPlaces（图上不画），但后续点的 label 会自动跳过这个号。
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
                  onEditRoute({ placeIndex: itemIndex, segment: routeAfter, from: withEndpoint(p, 'end'), to: withEndpoint(nextPlace, 'start') });
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
                      from: withEndpoint(p, 'end'),
                      to: withEndpoint(nextPlace, 'start'),
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
