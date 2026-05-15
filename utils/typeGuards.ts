import { Place, RouteSegment } from '../types/roadmap';

/** 是否为地点（Place）—— 通过 'name' 字段判别 */
export function isPlace(item: Place | RouteSegment | null | undefined): item is Place {
  return !!item && typeof item === 'object' && 'name' in item;
}

/** 是否为路线段（RouteSegment）—— 通过 'travelMode' 字段判别 */
export function isRouteSegment(item: Place | RouteSegment | null | undefined): item is RouteSegment {
  return !!item && typeof item === 'object' && !('name' in item) && 'travelMode' in item;
}
