import { useMemo } from 'react';
import { Roadmap, Place, RouteSegment } from '../../../types/roadmap';
import { isPlace, isRouteSegment } from '../../../utils/typeGuards';
import { compareGroupKey, isDateKey } from '../../../utils/date';

export interface RoadmapGroups {
  /** 分组：key => 该日的 items（Place/RouteSegment 交替） */
  groups: Record<string, Array<Place | RouteSegment>>;
  /** 有序分组 key 数组（日期在前、第N天在后） */
  groupKeys: string[];
  /** items 中最后一张地点的下标（-1 表示没有地点） */
  lastPlaceIndex: number;
}

/** 根据 data.items 生成按日/第N天的分组与有序 key */
export function useRoadmapGroups(data: Roadmap | null): RoadmapGroups {
  const groups = useMemo(() => {
    const result: Record<string, Array<Place | RouteSegment>> = {};
    const items = data?.items || [];
    let dayIndex = 1;
    let currentKey = '';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (isPlace(it)) {
        const start = it.detail?.start_time;
        // 无 start_time 时：有 detail.days 用其；否则推断
        const key = start
          ? String(start).split(' ')[0]
          : `第${it.detail?.days ?? dayIndex}天`;
        if (key !== currentKey) {
          currentKey = key;
          if (!start) dayIndex++;
        }
        result[currentKey] = result[currentKey] || [];
        result[currentKey].push(it);
        const next = items[i + 1];
        if (isRouteSegment(next)) {
          result[currentKey].push(next);
          i++;
        }
      }
    }
    return result;
  }, [data]);

  const groupKeys = useMemo(() => {
    return Object.keys(groups).slice().sort(compareGroupKey);
  }, [groups]);

  const lastPlaceIndex = useMemo(() => {
    const items = data?.items || [];
    for (let i = items.length - 1; i >= 0; i--) {
      if (isPlace(items[i])) return i;
    }
    return -1;
  }, [data?.items]);

  return { groups, groupKeys, lastPlaceIndex };
}

export { isDateKey, compareGroupKey };
