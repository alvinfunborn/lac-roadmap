import React, { useEffect, useRef, useState } from 'react';
import { App, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { RoadmapRepository } from '../../repositories/RoadmapRepository';
import { Roadmap, Place, RouteSegment, Address, RoadmapDetail } from '../../types/roadmap';
import { RoadmapSettings } from '../../types';
import PlaceEditModal from '../../components/modals/PlaceEditModal';
import RouteSegmentEditModal from '../../components/modals/RouteSegmentEditModal';
import RoadmapEditModal, { RoadmapEditPayload } from '../../components/modals/RoadmapEditModal';
import MapSelector from '../../components/map/MapSelector';
import DatePicker from '../../components/DatePicker';
import { isPlace } from '../../utils/typeGuards';
import { compareGroupKey, isDateKey, formatYMD } from '../../utils/date';
import { getPlaceStatus } from '../../utils/placeStatus';
import { MapLocation } from '../../types/map';
import { t } from '../../i18n';

import { useRoadmapGroups } from './hooks/useRoadmapGroups';
import { usePlaceDragDrop } from './hooks/usePlaceDragDrop';
import { useTabs } from './hooks/useTabs';
import { usePlaceMutations } from './hooks/usePlaceMutations';

import RoadmapHeader from './components/RoadmapHeader';
import DayTabsStrip from './components/DayTabsStrip';
import Timeline, { RouteEditTrigger } from './components/Timeline';
import RoadmapActions from './components/RoadmapActions';

interface Props {
  app: App;
  repository: RoadmapRepository;
  filePath: string;
  settings: RoadmapSettings;
  /** Host leaf (see RoadmapSetPage for rationale). Used by the back
   *  button + sub-roadmap navigation so they always operate on the
   *  exact leaf showing this view. */
  leaf?: WorkspaceLeaf;
}

export default function RoadmapPage({ app, repository, filePath, settings, leaf: hostLeaf }: Props) {
  const [data, setData] = useState<Roadmap | null>(null);
  const [metaEditorVisible, setMetaEditorVisible] = useState(false);
  const [tempDayKeys, setTempDayKeys] = useState<string[]>([]);
  // 子路线入口缓存：place id -> file path（仅对 type=root + renders=["roadmap"] 的地点）
  const [subRouteMap, setSubRouteMap] = useState<Record<string, string>>({});
  // 子路线端点缓存：place id → { start, end } 取自 sub roadmap 的 first/last
  // geocoded place address。供 `+ transit` 占位计算直线距离 / 自动路由用。
  const [subEndpoints, setSubEndpoints] = useState<Record<string, { start?: Address; end?: Address }>>({});
  const [routeEditState, setRouteEditState] = useState<RouteEditTrigger | null>(null);
  // Hero map viewer (read-only MapSelector). Hero AggregatedMap can't be
  // interacted with directly due to a Chromium hit-testing quirk with
  // the warm-ink overlay combo (see _map-widget.scss); clicking opens
  // this viewer instead so users can pan/zoom the same locations.
  const [heroViewerVisible, setHeroViewerVisible] = useState(false);
  // Long-press on a day tab opens this date picker; the tabId tells
  // `applyTabDatePick` which group to remap (date / 第N天 / unplanned).
  const [dateEditTabId, setDateEditTabId] = useState<string | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await repository.loadRoadmap(filePath);
        setData(r);
        if (r) {
          const map: Record<string, string> = {};
          const endpoints: Record<string, { start?: Address; end?: Address }> = {};
          for (const it of r.items) {
            if (isPlace(it)) {
              const dest = app.metadataCache.getFirstLinkpathDest(it.id, filePath);
              if (dest && dest instanceof TFile) {
                const isSub = await repository.isSubRoadmapEntry(dest.path);
                if (isSub) {
                  map[it.id] = dest.path;
                  try {
                    const sub = await repository.loadRoadmap(dest.path);
                    if (sub) endpoints[it.id] = { start: sub.startPoint, end: sub.endPoint };
                  } catch (e) { console.warn('[RoadmapPage] sub endpoints load failed', e); }
                }
              }
            }
          }
          setSubRouteMap(map);
          setSubEndpoints(endpoints);
        }
      } catch (err) {
        console.warn('[RoadmapPage] 加载路线失败', err);
        new Notice(t('notice.loadFailed'));
      }
    })();
  }, [repository, filePath, app]);

  const { groups, groupKeys, lastPlaceIndex, groupKeyForItem } = useRoadmapGroups(data);

  const {
    selectedTabs, onToggleTab, tabDefs, filteredKeys,
    mapLocations, visibleItemIndices,
  } = useTabs({ data, groups, groupKeys, tempDayKeys });

  const places = usePlaceMutations({
    app, repository, settings, filePath,
    data, setData,
    filteredKeys, selectedTabs,
    subRouteMap, setSubRouteMap,
  });

  const { didDragRef, lastDraggedItemRef, droppedOnTabRef, onDropToTab } = usePlaceDragDrop({
    data, filePath, repository, settings,
    groups, groupKeys, lastPlaceIndex,
    tempDayKeys, setTempDayKeys,
    visibleItemIndices, cardListRef,
    onDataChanged: setData,
  });

  /**
   * 长按 tab 后用户选定一个目标日期 → 把当前组里的所有地点的日期改成该日期
   * （或对应偏移），合并到目标日。
   *
   *   日期 tab (YYYY-MM-DD)：组内每个 place 的 start_time 改写为新日期，保留
   *     原有 HH:MM:SS 时间部分；同时把 tempDayKeys 中匹配的 oldKey 改名。
   *
   *   第N天 tab：以 N 为基准，把所有有 detail.days = K 的 place 改为
   *     newDate + (K - N) 天，写入 start_time，并清掉 days。一次性把所有
   *     第N天序列展开成具体日期（用户期望「一下子赋值好每一天」）。
   *     tempDayKeys 里的「第K天」也按相同偏移换成日期。
   *
   *   unplanned (空 key)：把所有 wishlist place（无 start_time 也无 days）的
   *     start_time 都设为 newDate。
   */
  const applyTabDatePick = async (tabId: string, newDate: string) => {
    if (!data) return;
    const tdef = tabDefs.find(t => t.id === tabId);
    const oldKey = tdef?.key ?? '';

    const dayNumFromKey = (k: string): number | null => {
      const m = k.match(/^第(\d+)天$/);
      return m ? Number(m[1]) : null;
    };
    const addDays = (ymd: string, n: number): string => {
      const [y, mo, d] = ymd.split('-').map(Number);
      const dt = new Date(y, (mo || 1) - 1, d || 1);
      dt.setDate(dt.getDate() + n);
      return formatYMD(dt);
    };
    const replaceDate = (existing: string | undefined, target: string): string => {
      if (!existing) return target;
      const m = String(existing).match(/^\d{4}-\d{1,2}-\d{1,2}(.*)$/);
      return m ? target + m[1] : target;
    };

    const nDays = dayNumFromKey(oldKey);
    const items: Array<Place | RouteSegment> = (data.items || []).slice();

    if (isDateKey(oldKey)) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!isPlace(it)) continue;
        const p = it as Place;
        const st = p.detail?.start_time;
        if (st && String(st).startsWith(oldKey)) {
          items[i] = { ...p, detail: { ...(p.detail || {}), start_time: replaceDate(st, newDate) } };
        }
      }
    } else if (nDays != null) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!isPlace(it)) continue;
        const p = it as Place;
        const d = p.detail?.days;
        if (typeof d === 'number') {
          const target = addDays(newDate, d - nDays);
          const detail = { ...(p.detail || {}), start_time: target };
          delete detail.days;
          items[i] = { ...p, detail };
        }
      }
    } else if (oldKey === '' && tdef?.id === 'unplanned') {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!isPlace(it)) continue;
        const p = it as Place;
        const hasStart = !!p.detail?.start_time;
        const hasDays = p.detail?.days != null;
        if (!hasStart && !hasDays) {
          items[i] = { ...p, detail: { ...(p.detail || {}), start_time: newDate } };
        }
      }
    }

    // tempDayKeys 跟随：日期 tab 直接改名；第N天 tab 按偏移换成日期。
    setTempDayKeys(prev => prev.map(k => {
      if (isDateKey(oldKey) && k === oldKey) return newDate;
      const tn = dayNumFromKey(k);
      if (nDays != null && tn != null) return addDays(newDate, tn - nDays);
      return k;
    }));

    try {
      await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, items);
      const r = await repository.loadRoadmap(filePath);
      setData(r);
    } catch (err) {
      console.warn('[RoadmapPage] applyTabDatePick 失败', err);
      new Notice(t('notice.updateRoadmapFailed'));
    }
  };

  /**
   * 长按 tab → date picker → clear：把这一组下所有 place 的日期清掉，丢回 wishlist。
   *
   *   日期 tab (YYYY-MM-DD)：start_time / end_time 清空，become wishlist place
   *   第N天 tab：detail.days 清掉，become wishlist place
   *   unplanned tab：本就是 wishlist，no-op
   *
   * 同时把 tempDayKeys 里对应的 key 删除（空 tab 已经没意义）。
   */
  const clearTabDate = async (tabId: string) => {
    if (!data) return;
    const tdef = tabDefs.find(t => t.id === tabId);
    if (!tdef || tdef.id === 'unplanned') return;
    const key = tdef.key ?? '';
    const items: Array<Place | RouteSegment> = (data.items || []).slice();

    if (isDateKey(key)) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!isPlace(it)) continue;
        const p = it as Place;
        const st = p.detail?.start_time;
        if (st && String(st).startsWith(key)) {
          const nextDetail = { ...(p.detail || {}) };
          delete nextDetail.start_time;
          delete nextDetail.end_time;
          items[i] = { ...p, detail: nextDetail };
        }
      }
    } else {
      const m = key.match(/^第(\d+)天$/);
      const n = m ? Number(m[1]) : null;
      if (n == null) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!isPlace(it)) continue;
        const p = it as Place;
        if (p.detail?.days === n) {
          const nextDetail = { ...(p.detail || {}) };
          delete nextDetail.days;
          items[i] = { ...p, detail: nextDetail };
        }
      }
    }

    // 清后这个 key 就没人住了，从 tempDayKeys 里也擦掉。
    setTempDayKeys(prev => prev.filter(k => k !== key));

    try {
      await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, items);
      const r = await repository.loadRoadmap(filePath);
      setData(r);
    } catch (err) {
      console.warn('[RoadmapPage] clearTabDate 失败', err);
      new Notice(t('notice.updateRoadmapFailed'));
    }
  };

  /**
   * 日期 ↔ 日期 拖拽互换：两个日期下的 place 的 start_time 日期部分互换，
   * 各自时间部分（HH:MM:SS）保留。如果一端没有 place（被填充的空白日 /
   * 临时 tab），则等同于把另一端的 place 整体搬过来。tempDayKeys 里同名
   * key 也跟着互换。
   */
  const swapTabDates = async (fromKey: string, toKey: string) => {
    if (!data || fromKey === toKey) return;
    const replaceDate = (existing: string | undefined, target: string): string => {
      if (!existing) return target;
      const m = String(existing).match(/^\d{4}-\d{1,2}-\d{1,2}(.*)$/);
      return m ? target + m[1] : target;
    };
    const items: Array<Place | RouteSegment> = (data.items || []).slice();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!isPlace(it)) continue;
      const p = it as Place;
      const st = p.detail?.start_time;
      if (!st) continue;
      if (String(st).startsWith(fromKey)) {
        items[i] = { ...p, detail: { ...(p.detail || {}), start_time: replaceDate(st, toKey) } };
      } else if (String(st).startsWith(toKey)) {
        items[i] = { ...p, detail: { ...(p.detail || {}), start_time: replaceDate(st, fromKey) } };
      }
    }
    setTempDayKeys(prev => prev.map(k => {
      if (k === fromKey) return toKey;
      if (k === toKey) return fromKey;
      return k;
    }));
    try {
      await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, items);
      const r = await repository.loadRoadmap(filePath);
      setData(r);
    } catch (err) {
      console.warn('[RoadmapPage] swapTabDates 失败', err);
      new Notice(t('notice.updateRoadmapFailed'));
    }
  };

  /**
   * 第N天 ↔ 第X天 拖拽互换：两个 days 值互换。tempDayKeys 中对应的
   * 「第N天」「第X天」也跟着互换。
   */
  const swapTabDays = async (fromN: number, toN: number) => {
    if (!data || fromN === toN) return;
    const items: Array<Place | RouteSegment> = (data.items || []).slice();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!isPlace(it)) continue;
      const p = it as Place;
      const d = p.detail?.days;
      if (d === fromN) {
        items[i] = { ...p, detail: { ...(p.detail || {}), days: toN } };
      } else if (d === toN) {
        items[i] = { ...p, detail: { ...(p.detail || {}), days: fromN } };
      }
    }
    setTempDayKeys(prev => prev.map(k => {
      if (k === `第${fromN}天`) return `第${toN}天`;
      if (k === `第${toN}天`) return `第${fromN}天`;
      return k;
    }));
    try {
      await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, items);
      const r = await repository.loadRoadmap(filePath);
      setData(r);
    } catch (err) {
      console.warn('[RoadmapPage] swapTabDays 失败', err);
      new Notice(t('notice.updateRoadmapFailed'));
    }
  };

  /**
   * 长按 tab 后拖拽到另一个 tab → 两个 tab 的地点日期互换。
   * - 日期 ↔ 日期：swapTabDates（time-of-day 保留）
   * - 第N天 ↔ 第X天：swapTabDays
   * - 任一端是 unplanned 或 date ↔ 第N天 混合 → no-op，让用户走长按编辑。
   */
  const onMergeTabsByDrag = async (fromId: string, toId: string) => {
    const fromTab = tabDefs.find(t => t.id === fromId);
    const toTab = tabDefs.find(t => t.id === toId);
    if (!fromTab || !toTab || fromTab.id === toTab.id) return;
    if (fromTab.id === 'unplanned' || toTab.id === 'unplanned') return;
    const fromKey = fromTab.key ?? '';
    const toKey = toTab.key ?? '';
    if (isDateKey(fromKey) && isDateKey(toKey)) {
      await swapTabDates(fromKey, toKey);
      return;
    }
    const fromM = fromKey.match(/^第(\d+)天$/);
    const toM = toKey.match(/^第(\d+)天$/);
    if (fromM && toM) {
      await swapTabDays(Number(fromM[1]), Number(toM[1]));
      return;
    }
    // Mixed date ↔ 第N天 — drag isn't expressive enough, leave it to long-press.
  };

  /** Tab 加号：仅本页临时占位，不修改文件、不创建新地点 */
  const addDayOnly = () => {
    const allKeys = [...groupKeys, ...tempDayKeys].sort(compareGroupKey);
    const lastKey = allKeys[allKeys.length - 1];
    let nextKey: string;
    if (!lastKey) {
      nextKey = '第1天';
    } else if (isDateKey(lastKey)) {
      const lastDate = new Date(lastKey);
      lastDate.setDate(lastDate.getDate() + 1);
      nextKey = lastDate.toISOString().split('T')[0];
    } else {
      const m = lastKey.match(/第(\d+)天/);
      nextKey = m ? `第${parseInt(m[1], 10) + 1}天` : `第${allKeys.length + 1}天`;
    }
    setTempDayKeys(prev => [...prev, nextKey]);
  };

  const openMetaEditor = () => { if (data) setMetaEditorVisible(true); };

  /**
   * 保存 trip 元数据。
   *
   * 关键约定（基于「end_date 没有独立含义；start_date 等于首个 place 的日期」）：
   *   - payload.detail.start_time 是用户在 modal 里看到的「首个地点日期」。
   *     如果用户改了它，把所有有 start_time 的 place 顺移 (newStart - oldStart) 天，
   *     time-of-day 保留；end_time 一并按同 delta 顺移。
   *   - 如果当前所有 place 都没有具体日期、只有 detail.days（规划态），新 start
   *     被当作「第 1 天」基准，把所有 days=N 的 place 展开成具体日期，days 字段清掉。
   *   - 保存前重新派生 detail.start_time / detail.end_time：取整理后 items 中
   *     已有 start_time 的最早 / 最晚一项的日期。保留 detail 里这两个字段是
   *     为了 roadmapset 列表页能直接按 trip 排序，不必再加载每条 trip 的 items。
   */
  const saveMetaEditor = async (payload: RoadmapEditPayload) => {
    if (!data) return;
    try {
      const shiftDateInString = (s: string, deltaDays: number): string => {
        const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/);
        if (!m) return s;
        const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        dt.setDate(dt.getDate() + deltaDays);
        return `${formatYMD(dt)}${m[4]}`;
      };
      const addDaysYMD = (ymd: string, n: number): string => {
        const [y, mo, d] = ymd.split('-').map(Number);
        const dt = new Date(y, (mo || 1) - 1, d || 1);
        dt.setDate(dt.getDate() + n);
        return formatYMD(dt);
      };
      const daysBetween = (a: string, b: string): number => {
        const [ay, am, ad] = a.split('-').map(Number);
        const [by, bm, bd] = b.split('-').map(Number);
        return Math.round(
          (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86400000,
        );
      };

      // 当前首个 dated place 的日期（顺移基准）
      let oldAnchor: string | undefined;
      for (const it of (data.items || [])) {
        if (isPlace(it) && (it as Place).detail?.start_time) {
          oldAnchor = String((it as Place).detail!.start_time).slice(0, 10);
          break;
        }
      }
      const newStart = payload.detail.start_time
        ? String(payload.detail.start_time).slice(0, 10)
        : '';

      let items: Array<Place | RouteSegment> = (data.items || []).slice();

      if (newStart && oldAnchor && newStart !== oldAnchor) {
        const delta = daysBetween(oldAnchor, newStart);
        items = items.map(it => {
          if (!isPlace(it)) return it;
          const p = it as Place;
          const st = p.detail?.start_time;
          if (!st) return p;
          const nextDetail = { ...(p.detail || {}), start_time: shiftDateInString(String(st), delta) };
          if (p.detail?.end_time) {
            nextDetail.end_time = shiftDateInString(String(p.detail.end_time), delta);
          }
          return { ...p, detail: nextDetail };
        });
      } else if (newStart && !oldAnchor) {
        // 规划态 → 具体日期：把 days=N 展开成 newStart + (N-1) 天
        items = items.map(it => {
          if (!isPlace(it)) return it;
          const p = it as Place;
          const d = p.detail?.days;
          if (typeof d !== 'number') return p;
          const nextDetail = { ...(p.detail || {}), start_time: addDaysYMD(newStart, d - 1) };
          delete nextDetail.days;
          return { ...p, detail: nextDetail };
        });
      }

      // 重新派生 trip-level start / end —— 取 items 中 dated place 的最早 / 最晚
      const datedTimes = items
        .filter(it => isPlace(it) && (it as Place).detail?.start_time)
        .map(it => String((it as Place).detail!.start_time));
      const sortedTimes = datedTimes.slice().sort((a, b) =>
        new Date(a.replace(' ', 'T')).getTime() - new Date(b.replace(' ', 'T')).getTime(),
      );
      const derivedTripStart = sortedTimes[0]?.slice(0, 10);
      const derivedTripEnd = sortedTimes[sortedTimes.length - 1]?.slice(0, 10);

      const nextDetail: RoadmapDetail = { ...(data.detail || {}), ...payload.detail };
      if (!payload.detail.map_provider) delete nextDetail.map_provider;
      if (!payload.detail.description) delete nextDetail.description;
      if (!payload.detail.address) delete nextDetail.address;
      if (derivedTripStart) nextDetail.start_time = derivedTripStart; else delete nextDetail.start_time;
      if (derivedTripEnd) nextDetail.end_time = derivedTripEnd; else delete nextDetail.end_time;

      // 写整条 trip：items 顺移完毕后通过 updateRoadmapItems 落盘，header 顺带更新。
      // 没有 items 变化的纯改名 / 改描述场景，updateRoadmapItems 仍会重写 body，
      // 但内容等价，等同于 updateRoadmapMeta 的副作用，故路径保持单一。
      await repository.updateRoadmapItems(filePath, payload.name, nextDetail, items);
      const r = await repository.loadRoadmap(filePath);
      setData(r);
    } catch (err) {
      console.warn('[RoadmapPage] 保存路线元数据失败', err);
      new Notice(t('notice.saveFailed'));
    }
    setMetaEditorVisible(false);
  };

  /**
   * Back navigation. Tries (in order):
   *   0. leaf.history.back() — most accurate "where did the user come from"
   *   1. configured entry file if it links to this trip (roadmapset → trip)
   *   2. any other file linking here (sub-roadmap → parent)
   *   3. entry file fallback
   */
  const goBack = async () => {
    const leaves = app.workspace.getLeavesOfType('lac-roadmap-view');
    let leaf = hostLeaf
      || leaves.find(l => {
        try { return (l.getViewState()?.state as any)?.filePath === filePath; } catch { return null; }
      })
      || app.workspace.activeLeaf
      || leaves[0];
    if (!leaf) return;

    const history = (leaf as any).history;
    if (history && typeof history.back === 'function') {
      try {
        const before = (leaf.getViewState() as any)?.state?.filePath;
        await history.back();
        const after = (leaf.getViewState() as any)?.state?.filePath;
        if (after && after !== before) {
          app.workspace.revealLeaf(leaf);
          return;
        }
      } catch (e) {
        console.warn('[RoadmapPage] leaf.history.back() failed', e);
      }
    }

    const entryPath = settings?.entryFile || 'LaC/Roadmap/roadmap.md';
    const backlinks = app.metadataCache.resolvedLinks;
    const navigateTo = async (target: string): Promise<boolean> => {
      if (!target || target === filePath) return false;
      const targetFile = app.vault.getAbstractFileByPath(target);
      if (!targetFile || !(targetFile instanceof TFile)) return false;
      await leaf!.setViewState({ type: 'lac-roadmap-view', state: { filePath: target }, active: true });
      app.workspace.revealLeaf(leaf!);
      return true;
    };

    if (backlinks[entryPath]?.[filePath]) {
      if (await navigateTo(entryPath)) return;
    }
    for (const [sourcePath, links] of Object.entries(backlinks)) {
      if (sourcePath === filePath || sourcePath === entryPath) continue;
      if (links[filePath]) {
        if (await navigateTo(sourcePath)) return;
      }
    }
    await navigateTo(entryPath);
  };

  // Place click routes either to a sub-roadmap (if this place IS one) or
  // to the place editor. Centralised here so Timeline doesn't need to know
  // about subRouteMap or the host leaf. Same leaf-resolution chain as
  // RoadmapSetPage.openRoadmap — prefer the injected hostLeaf, fall
  // through to any existing lac-roadmap-view leaf, then activeLeaf as a
  // last resort. Avoids landing on an unrelated tab and breaking the
  // history-back navigation.
  const handlePlaceClick = async (p: Place, itemIndex: number) => {
    const subPath = subRouteMap[p.id];
    if (subPath) {
      const target = hostLeaf
        || app.workspace.getLeavesOfType('lac-roadmap-view')[0]
        || app.workspace.activeLeaf;
      if (target) {
        await target.setViewState({ type: 'lac-roadmap-view', state: { filePath: subPath }, active: true });
        app.workspace.revealLeaf(target);
      }
      return;
    }
    places.editPlace(p, itemIndex);
  };

  // PlaceEditModal's routeLocations — all geocoded places in this trip
  // (including the one being edited) so MapSelector can show numbered
  // markers in context. Memoised view of data.items.
  const placeEditRouteLocations = ((): MapLocation[] | undefined => {
    if (!data) return undefined;
    const list: MapLocation[] = [];
    for (const it of data.items) {
      if (!isPlace(it)) continue;
      const loc = it.detail?.address as MapLocation | undefined;
      if (loc && typeof loc.longitude === 'number' && typeof loc.latitude === 'number') {
        list.push({
          ...loc,
          name: loc.name || (it as Place).name,
          status: getPlaceStatus(it as Place),
        });
      }
    }
    return list.length ? list : undefined;
  })();

  return (
    <div className="lac-roadmap-root">
      <div className="lac-roadmap-header">
        <RoadmapHeader
          app={app}
          repository={repository}
          settings={settings}
          data={data}
          filePath={filePath}
          mapLocations={mapLocations}
          onBack={goBack}
          onOpenMetaEditor={openMetaEditor}
          onHeroMapClick={() => setHeroViewerVisible(true)}
        />
        <DayTabsStrip
          tabDefs={tabDefs}
          groups={groups}
          groupKeys={groupKeys}
          selectedTabs={selectedTabs}
          onToggleTab={onToggleTab}
          addDayOnly={addDayOnly}
          onDropToTab={onDropToTab}
          droppedOnTabRef={droppedOnTabRef}
          onEditTabDate={setDateEditTabId}
          onMergeTabsByDrag={onMergeTabsByDrag}
        />
      </div>

      <div className="lac-roadmap-list-wrapper">
        {data && (
          <Timeline
            data={data}
            visibleItemIndices={visibleItemIndices}
            groupKeys={groupKeys}
            groups={groups}
            groupKeyForItem={groupKeyForItem}
            settings={settings}
            subEndpoints={subEndpoints}
            cardListRef={cardListRef}
            didDragRef={didDragRef}
            lastDraggedItemRef={lastDraggedItemRef}
            onPlaceClick={handlePlaceClick}
            onEditRoute={setRouteEditState}
          />
        )}
        <RoadmapActions
          onAddPlace={places.addPlaceFromList}
          onAddTrip={() => places.setSubRoadmapEditorVisible(true)}
        />
      </div>

      <PlaceEditModal
        visible={places.editorVisible}
        settings={settings}
        initial={places.editInitial}
        preferredProvider={data?.detail?.map_provider}
        defaultPickerDate={data?.detail?.start_time}
        onCancel={() => places.setEditorVisible(false)}
        onConfirm={places.onSavePlace}
        onDelete={places.editInitial?.name && data ? async () => {
          const idx = places.editInitial!.itemIndex;
          const p = (typeof idx === 'number' && idx >= 0 && idx < (data.items || []).length && isPlace(data.items[idx]))
            ? data.items[idx] as Place
            : (data.items || []).find(it => isPlace(it) && it.name === places.editInitial!.name) as Place | undefined;
          if (p) {
            await places.deletePlace(p, idx);
            places.setEditorVisible(false);
            places.setEditInitial(undefined);
          }
        } : undefined}
        routeLocations={placeEditRouteLocations}
      />

      <RouteSegmentEditModal
        visible={!!routeEditState}
        initial={routeEditState?.segment}
        from={routeEditState?.from}
        to={routeEditState?.to}
        settings={settings}
        preferredProvider={data?.detail?.map_provider}
        onCancel={() => setRouteEditState(null)}
        onConfirm={async (seg) => {
          if (!routeEditState || !data) return;
          try {
            await repository.updateRouteSegment(filePath, routeEditState.placeIndex, seg);
            const r = await repository.loadRoadmap(filePath);
            setData(r);
          } catch (err) {
            console.warn('[RoadmapPage] 更新路线段失败', err);
            new Notice(t('notice.updateSegmentFailed'));
          }
          setRouteEditState(null);
        }}
        onDelete={async () => {
          if (!routeEditState || !data) return;
          try {
            await repository.updateRouteSegment(filePath, routeEditState.placeIndex, null);
            const r = await repository.loadRoadmap(filePath);
            setData(r);
          } catch (err) {
            console.warn('[RoadmapPage] 删除路线段失败', err);
          }
          setRouteEditState(null);
        }}
      />

      <RoadmapEditModal
        visible={metaEditorVisible}
        mode="edit"
        settings={settings}
        initial={data ? { name: data.name, detail: data.detail } : undefined}
        items={data?.items}
        onCancel={() => setMetaEditorVisible(false)}
        onConfirm={saveMetaEditor}
      />

      {/* 创建嵌套子路线 — `+ add trip` 触发。走纯创建模式（不传 initial / items），
          保存到新文件并把 [[name]] 引用插回父路线。 */}
      <RoadmapEditModal
        visible={places.subRoadmapEditorVisible}
        mode="create"
        settings={settings}
        onCancel={() => places.setSubRoadmapEditorVisible(false)}
        onConfirm={places.onCreateSubRoadmap}
      />

      {/* Hero map readOnly viewer — opened by clicking the header map.
          Re-uses MapSelector in readOnly mode (same as RoadmapEditModal's
          where-thumb viewer) so the trip's locations are pan/zoom-able in
          a context that doesn't trigger the hero hit-testing bug. */}
      {/* 长按 day tab → 合并/指派日期。tab 是真日期时以该日期预填，
          其他场景回退到 trip start_time（一般是旅程开始日，方便从那天附近挑）。 */}
      <DatePicker
        visible={!!dateEditTabId}
        value={(() => {
          if (!dateEditTabId) return '';
          const td = tabDefs.find(t => t.id === dateEditTabId);
          if (td?.key && isDateKey(td.key)) return td.key;
          const tripStart = data?.detail?.start_time;
          return tripStart ? String(tripStart).split(' ')[0] : '';
        })()}
        onCancel={() => setDateEditTabId(null)}
        onClear={async () => {
          const id = dateEditTabId;
          setDateEditTabId(null);
          if (id) await clearTabDate(id);
        }}
        onConfirm={async (val) => {
          const id = dateEditTabId;
          setDateEditTabId(null);
          if (id && val) await applyTabDatePick(id, val);
        }}
      />

      <MapSelector
        visible={heroViewerVisible}
        onCancel={() => setHeroViewerVisible(false)}
        onConfirm={() => setHeroViewerVisible(false)}
        settings={{
          ...settings,
          mapApiProvider: data?.detail?.map_provider || settings.mapApiProvider,
        }}
        routeLocations={mapLocations.map(l => ({
          name: l.title,
          longitude: l.lng,
          latitude: l.lat,
          coordinate_system: l.coordinate_system,
          status: l.status,
        }))}
        readOnly
      />
    </div>
  );
}
