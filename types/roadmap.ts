export type TravelMode = 'walk' | 'bicycle' | 'two_wheeler' | 'drive' | 'transit';

export interface Address {
  name: string;
  address?: string;
  longitude?: number;
  latitude?: number;
  coordinate_system?: string;
}

export interface RouteSegment {
  travelMode: TravelMode;
  distance?: number;
  duration?: number;
  tolls?: number;
}

export interface PlaceDetail {
  start_time?: string;
  end_time?: string;
  description?: string;
  address?: Address;
  /** 用于无 start_time 的地点，表示第几天；存于线路内每次地点引用的 days 覆盖行；编辑器不展示，可自动推断 */
  days?: number;
}

export interface Place {
  id: string;
  name: string;
  detail: PlaceDetail;
}

/** 该路线总结地图（卡片小图/顶部地图）使用的地图提供商，与地点坐标体系一致 */
export type MapProviderKind = 'google' | 'gaode';

export interface RoadmapDetail {
  description?: string;
  start_time?: string;
  end_time?: string;
  address?: Address;
  /** 该路线总结地图只用此提供商；缺省时用设置中的 mapApiProvider */
  map_provider?: MapProviderKind;
}

export interface RoadmapItemGroup {
  key: string; // 分组键（日期或“第N天”）
  items: Array<Place | RouteSegment>;
}

export interface Roadmap {
  id: string;
  name: string;
  detail?: RoadmapDetail;
  items: Array<Place | RouteSegment>;
  /**
   * Computed at load time — the geocoded address of the FIRST place in
   * `items` (entry point of the trip). Used when this roadmap is
   * referenced from a parent roadmap as a sub-trip: the parent computes
   * routes INTO this trip using its `startPoint` rather than the
   * trip-level `detail.address` (which is usually a wide region label).
   * `undefined` when no place in items has coords.
   */
  startPoint?: Address;
  /**
   * Computed at load time — the geocoded address of the LAST place in
   * `items` (exit point of the trip). Used when this roadmap is
   * referenced from a parent roadmap as a sub-trip: the parent computes
   * routes OUT of this trip using its `endPoint`. `undefined` when no
   * place in items has coords.
   */
  endPoint?: Address;
}

/** True when an Address has both numeric longitude AND latitude. */
export function hasCoords(addr: Address | undefined | null): addr is Address & { longitude: number; latitude: number } {
  return !!addr && typeof addr.longitude === 'number' && typeof addr.latitude === 'number';
}

/** Compute first/last geocoded place addresses inside a roadmap's items.
 *  Pure function — used by repository.loadRoadmap to populate
 *  `roadmap.startPoint` / `roadmap.endPoint`. */
export function computeRoadmapEndpoints(items: Array<Place | RouteSegment>): { start?: Address; end?: Address } {
  let start: Address | undefined;
  let end: Address | undefined;
  for (const it of items) {
    if (it && typeof it === 'object' && 'detail' in it) {
      const addr = (it as Place).detail?.address;
      if (hasCoords(addr)) {
        if (!start) start = addr;
        end = addr;
      }
    }
  }
  return { start, end };
}

export interface RoadmapSet {
  entries: string[]; // 根文件内的 [[...]] 列表
}


