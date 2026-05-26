import { useMemo, useState } from 'react';
import { Roadmap, Place, RouteSegment } from '../../../types/roadmap';
import { isPlace, isRouteSegment } from '../../../utils/typeGuards';
import { compareGroupKey, isDateKey } from '../../../utils/date';
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
    reorderTab,
  };
}
