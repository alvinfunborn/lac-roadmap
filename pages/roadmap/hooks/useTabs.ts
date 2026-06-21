import { useMemo, useState } from 'react';
import { Roadmap, Place, RouteSegment, Address, hasCoords } from '../../../types/roadmap';
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
  /** 子路线端点缓存：place id → { start, end }（子路线首/末个 geocoded 地点）。
   *  地图标点需要它来给子路线条目画出起点+终点两枚 marker。 */
  subEndpoints?: Record<string, { start?: Address; end?: Address }>;
}

export interface TabsApi {
  selectedTabs: Set<string>;
  setSelectedTabs: React.Dispatch<React.SetStateAction<Set<string>>>;
  onToggleTab: (id: string) => void;
  allKeysForTabs: string[];
  tabDefs: TabDef[];
  filteredKeys: string[];
  filteredPlaces: Place[];
  mapLocations: { lng: number; lat: number; title: string; coordinate_system?: string; travelModeToNext?: RouteSegment['travelMode']; status?: PlaceStatus; label?: number }[];
  visibleItemIndices: number[];
}

/** 标签/筛选/可见项的集中状态 */
export function useTabs({ data, groups, groupKeys, tempDayKeys, subEndpoints }: UseTabsParams): TabsApi {
  // 已选 tab 按「路线身份」(data?.id) 分别记忆。RoadmapView 复用同一个 React 实例
  // 做导航（父 → 子 → 返回），useState 会跨导航保留 —— 若所有路线共用一份选择，
  // 父路线选中的日期 tab 带进子路线会匹配不到任何 key、把子路线地点全挡掉。按 id
  // 分桶后：每条路线维持自己的筛选，子路线默认空选（全部可见），返回父级时其筛选
  // 原样恢复，无需每次重新选。
  const [tabsById, setTabsById] = useState<Record<string, string[]>>({});
  const id = data?.id || '';
  const selectedTabs = useMemo(() => new Set(tabsById[id] || []), [tabsById, id]);

  const setSelectedTabs: React.Dispatch<React.SetStateAction<Set<string>>> = (action) => {
    setTabsById(prev => {
      const current = new Set(prev[id] || []);
      const next = typeof action === 'function'
        ? (action as (p: Set<string>) => Set<string>)(current)
        : action;
      return { ...prev, [id]: Array.from(next) };
    });
  };

  const onToggleTab = (tabId: string) => {
    setSelectedTabs(prev => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId); else next.add(tabId);
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
    const base = [...groupKeys, ...tempDayKeys];
    // 路线有「计划日期」（detail.start_time）但还没有任何带日期的地点时，用计划日期
    // 种出一个日期 tab —— 这样打开一条已定日期的（子）路线就能看到日期标签，且
    // 「+ 添加地点」会默认落到这天，而不是统统进 wishlist。一旦有了真正带日期的
    // 地点，date key 就以地点为准，不再额外种这一天。
    const planned = data?.detail?.start_time ? String(data.detail.start_time).slice(0, 10) : '';
    if (planned && !base.some(isDateKey) && !base.includes(planned)) base.push(planned);
    base.sort(compareGroupKey);
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
  }, [groupKeys, tempDayKeys, data?.detail?.start_time]);

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
    const out: { lng: number; lat: number; title: string; coordinate_system?: string; travelModeToNext?: RouteSegment['travelMode']; status?: PlaceStatus; label?: number }[] = [];
    // 按 filteredKeys 顺序遍历分组，在每个分组内保留 Place 间夹着的 RouteSegment 作为衔接交通方式。
    // 跨分组不假设交通方式（留空 → 默认实线）。
    //
    // 编号（label）：与卡片序号对齐 —— 每张「已计划」卡片占一个序号；子路线条目自己没有
    // 坐标，用它的端点画出「起点 + 终点」两枚 marker，且两枚共用同一序号（= 该卡片号），
    // 这样地图上的数字与列表卡片一一对应，序号不再错位。wishlist 不参与编号。
    let plannedCounter = 0;
    for (const k of filteredKeys) {
      const arr = groups[k] || [];
      let pendingMode: RouteSegment['travelMode'] | undefined;
      for (const it of arr) {
        if (isPlace(it)) {
          const status = getPlaceStatus(it);
          const label = status === 'wish' ? undefined : (++plannedCounter);
          const own = it.detail?.address;
          if (hasCoords(own)) {
            if (out.length > 0 && pendingMode !== undefined) out[out.length - 1].travelModeToNext = pendingMode;
            out.push({ lng: own.longitude, lat: own.latitude, title: it.name || '', coordinate_system: own.coordinate_system, status, label });
            pendingMode = undefined;
          } else {
            // 子路线条目：用端点画起点 + 终点两枚 marker（同一 label）。
            const ep = subEndpoints?.[it.id];
            const s = hasCoords(ep?.start) ? ep!.start : undefined;
            const e = hasCoords(ep?.end) ? ep!.end : undefined;
            if (s) {
              if (out.length > 0 && pendingMode !== undefined) out[out.length - 1].travelModeToNext = pendingMode;
              out.push({ lng: s.longitude!, lat: s.latitude!, title: `${it.name || ''} ·起`, coordinate_system: s.coordinate_system, status, label });
              pendingMode = undefined;
            }
            if (e && e !== s) {
              out.push({ lng: e.longitude!, lat: e.latitude!, title: `${it.name || ''} ·终`, coordinate_system: e.coordinate_system, status, label });
            }
          }
        } else if (isRouteSegment(it)) {
          pendingMode = it.travelMode;
        }
      }
    }
    return out;
  }, [groups, filteredKeys, subEndpoints]);

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
