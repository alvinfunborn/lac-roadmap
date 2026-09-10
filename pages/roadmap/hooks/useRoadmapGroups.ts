import { useMemo } from 'react';
import { Roadmap, Place, RouteSegment } from '../../../types/roadmap';
import { isDatedRoadmap, scheduleGroupKey } from '../../../utils/schedule';
import { isPlace, isRouteSegment } from '../../../utils/typeGuards';
import { compareGroupKey, isDateKey } from '../../../utils/date';

export interface RoadmapGroups {
  /** 分组：key => 该日的 items（Place/RouteSegment 交替） */
  groups: Record<string, Array<Place | RouteSegment>>;
  /** 有序分组 key 数组（日期在前、第N天在后） */
  groupKeys: string[];
  /** items 中最后一张地点的下标（-1 表示没有地点） */
  lastPlaceIndex: number;
  /** itemIndex -> 该 item 所属 day key —— 让 Timeline / stats 复用同一分组算法 */
  groupKeyForItem: Map<number, string>;
}

/** 根据 data.items 生成按日/第N天的分组与有序 key */
export function useRoadmapGroups(data: Roadmap | null): RoadmapGroups {
  const { groups, groupKeyForItem } = useMemo(() => {
    const result: Record<string, Array<Place | RouteSegment>> = {};
    const keyForItem = new Map<number, string>();
    const items = data?.items || [];
    const dated = !!data && isDatedRoadmap(data);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (isPlace(it)) {
        const key = scheduleGroupKey(it, dated);
        result[key] = result[key] || [];
        result[key].push(it);
        keyForItem.set(i, key);
        const next = items[i + 1];
        if (isRouteSegment(next)) {
          result[key].push(next);
          i++;
        }
      }
    }
    return { groups: result, groupKeyForItem: keyForItem };
  }, [data]);

  const groupKeys = useMemo(() => {
    return Object.keys(groups).slice().sort(compareGroupKey);
  }, [groups]);

  const lastPlaceIndex = useMemo(() => {
    const items = data?.items || [];
    const dated = !!data && isDatedRoadmap(data);
    for (let i = items.length - 1; i >= 0; i--) {
      if (isPlace(items[i])) return i;
    }
    return -1;
  }, [data?.items]);

  return { groups, groupKeys, lastPlaceIndex, groupKeyForItem };
}

export { isDateKey, compareGroupKey };
