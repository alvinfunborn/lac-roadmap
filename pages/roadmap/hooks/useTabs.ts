import { useMemo, useState } from 'react';
import { Roadmap, Place, RouteSegment } from '../../../types/roadmap';
import { isPlace, isRouteSegment } from '../../../utils/typeGuards';
import { compareGroupKey, isDateKey } from '../../../utils/date';
import { PlaceStatus, getPlaceStatus } from '../../../utils/placeStatus';

export interface TabDef {
  id: string;
  label: string;
  key?: string;
  isTemp?: boolean;
}

interface UseTabsParams {
  data: Roadmap | null;
  groups: Record<string, Array<Place | import('../../../types/roadmap').RouteSegment>>;
  groupKeys: string[];
  tempDayKeys: string[];
}

export interface TabsApi {
  selectedTabs: Set<string>;
  setSelectedTabs: React.Dispatch<React.SetStateAction<Set<string>>>;
  onToggleTab: (id: string) => void;
  allKeysForTabs: string[];
  tabDefs: TabDef[];
  filteredKeys: string[];
  filteredPlaces: Place[];
  mapLocations: { lng: number; lat: number; title: string; coordinate_system?: string; travelModeToNext?: RouteSegment['travelMode']; status?: PlaceStatus }[];
  visibleItemIndices: number[];
  /** 将某 key 从当前位置移动到目标 key 之前/之后（session-only；TODO 持久化） */
  reorderTab: (fromKey: string, toKey: string) => void;
}

/** 标签/筛选/可见项的集中状态 */
export function useTabs({ data, groups, groupKeys, tempDayKeys }: UseTabsParams): TabsApi {
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(() => new Set());
  // session-only 的 tab 顺序覆盖（key 列表）。
  // TODO(Wave 3+): 持久化方案 — 将 tab 顺序落到 roadmap 的 detail.day_order 或修改 items 中
  // "第N天"段的整体相对位置；当前 Wave 仅保存在 session 内，刷新页面会回退到默认排序。
  const [tabOrderOverride, setTabOrderOverride] = useState<string[] | null>(null);

  const onToggleTab = (id: string) => {
    setSelectedTabs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allKeysForTabs = useMemo(() => {
    const base = [...groupKeys, ...tempDayKeys].sort(compareGroupKey);
    if (!tabOrderOverride || tabOrderOverride.length === 0) return base;
    const baseSet = new Set(base);
    const ordered: string[] = [];
    // 先按 override 顺序放置仍存在的 key
    for (const k of tabOrderOverride) {
      if (baseSet.has(k)) { ordered.push(k); baseSet.delete(k); }
    }
    // 将新增的（override 未覆盖的）按默认顺序追加
    for (const k of base) {
      if (baseSet.has(k)) ordered.push(k);
    }
    return ordered;
  }, [groupKeys, tempDayKeys, tabOrderOverride]);

  const reorderTab = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    setTabOrderOverride(prev => {
      const source = prev && prev.length ? prev.slice() : allKeysForTabs.slice();
      const fi = source.indexOf(fromKey);
      const ti = source.indexOf(toKey);
      if (fi < 0 || ti < 0) return prev;
      const [moved] = source.splice(fi, 1);
      const insertAt = source.indexOf(toKey);
      source.splice(insertAt, 0, moved);
      return source;
    });
  };

  const tabDefs = useMemo<TabDef[]>(() => {
    const defs: TabDef[] = [];
    allKeysForTabs.forEach((k, i) => {
      const isTemp = tempDayKeys.includes(k);
      const label = isDateKey(k) ? k : `第${i + 1}天`;
      defs.push({ id: isTemp ? `temp-${k}` : `day-${i + 1}`, label, key: k, isTemp });
    });
    defs.push({ id: 'unplanned', label: '未计划' });
    return defs;
  }, [allKeysForTabs, tempDayKeys]);

  const filteredKeys = useMemo(() => {
    const allTabIds = tabDefs.filter(t => t.id !== 'unplanned').map(t => t.id);
    const allSelected = allTabIds.length > 0 && allTabIds.every(id => selectedTabs.has(id));
    const noneSelected = selectedTabs.size === 0;
    if (allSelected || noneSelected) return allKeysForTabs;

    const keys: string[] = [];
    for (const id of selectedTabs) {
      if (id === 'unplanned') {
        groupKeys.forEach(k => { if (!isDateKey(k)) keys.push(k); });
        continue;
      }
      const tdef = tabDefs.find(d => d.id === id);
      if (tdef?.key) keys.push(tdef.key);
    }
    return keys;
  }, [groupKeys, allKeysForTabs, selectedTabs, tabDefs]);

  const filteredPlaces = useMemo(() => {
    const out: Place[] = [];
    filteredKeys.forEach(k => {
      const arr = groups[k] || [];
      for (const it of arr) {
        if (isPlace(it)) out.push(it);
      }
    });
    return out;
  }, [groups, filteredKeys]);

  const mapLocations = useMemo(() => {
    const out: { lng: number; lat: number; title: string; coordinate_system?: string; travelModeToNext?: RouteSegment['travelMode']; status?: PlaceStatus }[] = [];
    // 按 filteredKeys 顺序遍历分组，在每个分组内保留 Place 间夹着的 RouteSegment 作为衔接交通方式。
    // 跨分组不假设交通方式（留空 → 默认实线）。
    for (const k of filteredKeys) {
      const arr = groups[k] || [];
      let pendingMode: RouteSegment['travelMode'] | undefined;
      for (const it of arr) {
        if (isPlace(it)) {
          const loc = it.detail?.address;
          if (loc && typeof loc.longitude === 'number' && typeof loc.latitude === 'number') {
            // 将前一个 Place 的 travelModeToNext 填为当前 pendingMode
            if (out.length > 0 && pendingMode !== undefined) {
              out[out.length - 1].travelModeToNext = pendingMode;
            }
            out.push({ lng: loc.longitude, lat: loc.latitude, title: it.name || '', coordinate_system: loc.coordinate_system, status: getPlaceStatus(it) });
            pendingMode = undefined;
          }
        } else if (isRouteSegment(it)) {
          pendingMode = it.travelMode;
        }
      }
    }
    return out;
  }, [groups, filteredKeys]);

  const visibleItemIndices = useMemo(() => {
    const items = data?.items || [];
    const out: number[] = [];
    let dayIndex = 1;
    let currentKey = '';
    const keySet = new Set(filteredKeys);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (isPlace(it)) {
        const start = it.detail?.start_time;
        const key = start ? String(start).split(' ')[0] : `第${it.detail?.days ?? dayIndex}天`;
        if (key !== currentKey) {
          currentKey = key;
          if (!start) dayIndex++;
        }
        if (keySet.has(key)) out.push(i);
      }
    }
    return out;
  }, [data?.items, filteredKeys]);

  return {
    selectedTabs,
    setSelectedTabs,
    onToggleTab,
    allKeysForTabs,
    tabDefs,
    filteredKeys,
    filteredPlaces,
    mapLocations,
    visibleItemIndices,
    reorderTab,
  };
}
