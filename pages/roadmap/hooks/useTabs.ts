import { useMemo, useState } from 'react';
import { Roadmap, Place, RouteSegment } from '../../../types/roadmap';
import { isPlace, isRouteSegment } from '../../../utils/typeGuards';
import { compareGroupKey, isDateKey, formatYMD } from '../../../utils/date';
import { PlaceStatus, getPlaceStatus } from '../../../utils/placeStatus';
import { t } from '../../../i18n';

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
}

/** 标签/筛选/可见项的集中状态 */
export function useTabs({ data, groups, groupKeys, tempDayKeys }: UseTabsParams): TabsApi {
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(() => new Set());

  const onToggleTab = (id: string) => {
    setSelectedTabs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Tabs are always sorted by time — date keys ascending, 第N天 by N, unplanned
  // last. (Previously had a session-only override for drag-to-reorder; that
  // gesture now batch-rewrites place dates instead, so order is fully derived.)
  //
  // Date continuity: between the earliest and latest known date keys (from
  // both real groups and user-added temp days) we fill in every missing day
  // so the strip reads as a contiguous calendar. The empty days have no
  // entries in `groups`, so downstream `groups[k] || []` lookups give back
  // an empty array — counts render as 0 and clicking the tab filters to
  // nothing, which is the expected behavior.
  const allKeysForTabs = useMemo(() => {
    const base = [...groupKeys, ...tempDayKeys].sort(compareGroupKey);
    const dates = base.filter(isDateKey).sort();
    if (dates.length < 2) return base;
    const filled = new Set(base);
    const [fy, fm, fd] = dates[0].split('-').map(Number);
    const [ly, lm, ld] = dates[dates.length - 1].split('-').map(Number);
    const cursor = new Date(fy, fm - 1, fd);
    const end = new Date(ly, lm - 1, ld);
    while (cursor.getTime() < end.getTime()) {
      cursor.setDate(cursor.getDate() + 1);
      filled.add(formatYMD(cursor));
    }
    return Array.from(filled).sort(compareGroupKey);
  }, [groupKeys, tempDayKeys]);

  const tabDefs = useMemo<TabDef[]>(() => {
    const defs: TabDef[] = [];
    // 空 key 是 wishlist 桶，不给独立 tab —— 由后面统一的 unplanned tab 接管
    allKeysForTabs.forEach((k, i) => {
      if (!k) return;
      const isTemp = tempDayKeys.includes(k);
      const label = isDateKey(k) ? k : t('tabs.day.label', { n: i + 1 });
      defs.push({ id: isTemp ? `temp-${k}` : `day-${i + 1}`, label, key: k, isTemp });
    });
    defs.push({ id: 'unplanned', label: t('tabs.unplanned') });
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
        // unplanned 只挑空 key 这一个真正"未规划"的桶
        if (groupKeys.includes('')) keys.push('');
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
    const keySet = new Set(filteredKeys);
    // 渲染规范化：tier 0 = 已排日期（子序按时间戳），tier 1 = 显式 days，
    // tier 2 = wishlist 永远殿后。不依赖文件存储顺序，渲染必正确。
    const rank = (p: Place): [number, number] => {
      const start = p.detail?.start_time;
      if (start) {
        const t = new Date(String(start).replace(' ', 'T')).getTime();
        if (!isNaN(t)) return [0, t];
      }
      const days = p.detail?.days;
      if (days != null) return [1, days];
      return [2, 0];
    };
    const collected: Array<{ index: number; rank: [number, number] }> = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!isPlace(it)) continue;
      const p = it as Place;
      const start = p.detail?.start_time;
      const days = p.detail?.days;
      const key = start ? String(start).split(' ')[0] : (days != null ? `第${days}天` : '');
      if (keySet.has(key)) collected.push({ index: i, rank: rank(p) });
    }
    collected.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.index - b.index);
    const out = collected.map(c => c.index);
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
  };
}
