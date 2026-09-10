import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { App, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { RoadmapRepository } from '../../repositories/RoadmapRepository';
import { Roadmap, Place, RouteSegment, Address, RoadmapDetail } from '../../types/roadmap';
import { RoadmapSettings } from '../../types';
import PlaceEditModal from '../../components/modals/PlaceEditModal';
import RouteSegmentEditModal from '../../components/modals/RouteSegmentEditModal';
import RoadmapEditModal, { RoadmapEditPayload } from '../../components/modals/RoadmapEditModal';
import ConfirmModal from '../../components/modals/ConfirmModal';
import MapSelector from '../../components/map/MapSelector';
import DatePicker from '../../components/DatePicker';
import { isPlace } from '../../utils/typeGuards';
import { compareGroupKey, isDateKey, formatYMD } from '../../utils/date';
import { getPlaceStatus } from '../../utils/placeStatus';
import { dayNumber, setRoadmapDate } from '../../utils/schedule';
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
  // 列表滚动条所在的容器（overflow-y: auto），用来跨「父 ↔ 子路线」导航记忆/恢复
  // 滚动位置。RoadmapView 复用同一个 React 实例，所以 ref/记忆都跨导航存活。
  const listWrapperRef = useRef<HTMLDivElement | null>(null);
  // 每条路线各记一份滚动位置（key = filePath）。返回时恢复，免得每次都从头滚。
  const scrollPositionsRef = useRef<Record<string, number>>({});
  // 已为哪个 filePath 恢复过 —— 同一条路线的后续 setData（编辑）不再重置滚动，
  // 只有切换到别的路线时才恢复一次。
  const restoredScrollForRef = useRef<string | null>(null);
  // filePath 去掉目录/扩展名 == loadRoadmap 里写的 data.id。用它判断当前 data 是否
  // 已经是这条 filePath 的内容（导航瞬间 data 还可能是上一条路线的，需排除）。
  const fileBase = filePath.split('/').pop()?.replace(/\.md$/, '') || filePath;

  useEffect(() => {
    // Cancellation guard. RoadmapView re-renders this same component
    // instance in place on every `setViewState` (parent → sub → back),
    // so state persists across navigations and several runs of this
    // async effect can overlap. Without the guard, a slower run from a
    // previous filePath (e.g. the sub-roadmap, whose subRouteMap is
    // empty) can resolve *after* the current one and clobber the freshly
    // built map — so returning to the parent loses its sub-route entries
    // and the card falls through to the place editor. Ignore every
    // result once the effect has been superseded.
    let cancelled = false;
    (async () => {
      try {
        const r = await repository.loadRoadmap(filePath);
        if (cancelled) return;
        setData(r);
        if (r) {
          const map: Record<string, string> = {};
          const endpoints: Record<string, { start?: Address; end?: Address }> = {};
          for (const it of r.items) {
            if (isPlace(it)) {
              const dest = app.metadataCache.getFirstLinkpathDest(it.id, filePath);
              if (dest && dest instanceof TFile) {
                const isSub = await repository.isSubRoadmapEntry(dest.path);
                if (cancelled) return;
                if (isSub) {
                  map[it.id] = dest.path;
                  try {
                    const sub = await repository.loadRoadmap(dest.path);
                    if (cancelled) return;
                    if (sub) endpoints[it.id] = { start: sub.startPoint, end: sub.endPoint };
                  } catch (e) { console.warn('[RoadmapPage] sub endpoints load failed', e); }
                }
              }
            }
          }
          if (cancelled) return;
          setSubRouteMap(map);
          setSubEndpoints(endpoints);
        }
        // 子路线 provider 继承：一条「roadmap 里的 roadmap」自己没写 map_provider
        // 时，应跟随它所属的父路线（用户直觉「子路线属于这趟行程」），而不是掉回
        // 全局默认 —— 否则父路线高德、子路线却按全局默认显示成 google。
        // 放在首次 setData 之后做：父级查找会扫全库读文件，较慢；提前阻塞会让旧
        // 父页（顶部地图）多停留一帧再跳，造成「先刷一下顶部地图」。这里先把子路线
        // 渲染出来，查到父级 provider 后再以补丁形式回填。
        if (r && !r.detail?.map_provider && await repository.isSubRoadmapEntry(filePath)) {
          if (cancelled) return;
          try {
            const parents = await repository.findRoadmapsReferencingPlace(r.name);
            if (cancelled) return;
            for (const parentPath of parents) {
              const parent = await repository.loadRoadmap(parentPath);
              if (cancelled) return;
              const prov = parent?.detail?.map_provider;
              if (prov) {
                setData(prev => (prev && prev.id === r.id && !prev.detail?.map_provider)
                  ? { ...prev, detail: { ...(prev.detail || {}), map_provider: prov } }
                  : prev);
                break;
              }
            }
          } catch (e) { console.warn('[RoadmapPage] 子路线 provider 继承失败', e); }
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('[RoadmapPage] 加载路线失败', err);
        new Notice(t('notice.loadFailed'));
      }
    })();
    return () => { cancelled = true; };
  }, [repository, filePath, app]);

  // 跨路线导航时恢复列表滚动位置。等当前 data 确实是这条 filePath 的内容
  // （data.id === fileBase）才恢复，且每条路线只恢复一次 —— 同路线内的编辑
  // （setData）不打扰用户当前的滚动位置。useLayoutEffect 在绘制前设置 scrollTop，
  // 避免先闪到顶部再跳。
  useLayoutEffect(() => {
    const el = listWrapperRef.current;
    if (!el || !data || data.id !== fileBase) return;
    if (restoredScrollForRef.current === filePath) return;
    el.scrollTop = scrollPositionsRef.current[filePath] ?? 0;
    restoredScrollForRef.current = filePath;
  }, [filePath, fileBase, data]);

  const { groups, groupKeys, lastPlaceIndex, groupKeyForItem } = useRoadmapGroups(data);

  const {
    selectedTabs, onToggleTab, tabDefs, filteredKeys,
    mapLocations, visibleItemIndices,
  } = useTabs({ data, groups, groupKeys, tempDayKeys, subEndpoints });

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
        const d = dayNumber(p);
        if (!p.detail.start_time) {
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
        if (!hasStart) {
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
   *   - 清空日期时，清掉所有地点的 start/end，按日期间隔还原 days；未安排项放最后一天。
   *   - 保存前重新派生 detail.start_time / detail.end_time：取整理后 items 中
   *     已有 start_time 的最早 / 最晚一项的日期。保留 detail 里这两个字段是
   *     为了 roadmapset 列表页能直接按 trip 排序，不必再加载每条 trip 的 items。
   */
  const saveMetaEditor = async (payload: RoadmapEditPayload) => {
    if (!data) return;
    try {
      const items = setRoadmapDate(data.items, payload.detail.start_time);
      setTempDayKeys([]);
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
      if (derivedTripStart) nextDetail.start_time = derivedTripStart;
      else if (!items.some(isPlace) && payload.detail.start_time) nextDetail.start_time = payload.detail.start_time;
      else delete nextDetail.start_time;
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
   * 删除当前这条路线（含「roadmap 里的 roadmap」子路线 —— 它没有像地点那样的
   * 编辑器删除入口，删除只能从这里走）。语义与 set 页的「彻底删除」一致：
   *   1) 把所有引用了它的父路线里的 [[name]] 条目摘掉（连同其后的 route 段）；
   *   2) 若它本身还挂在 roadmapset 根集合里，也一并移除；
   *   3) 把它的 .md 文件移入回收站（可恢复）；
   *   4) 返回上一层。
   * 通过 meta 编辑器（点标题打开）的删除按钮触发，桌面 / 移动端通用。
   */
  const deleteCurrentRoadmap = async () => {
    if (!data) return;
    const name = data.name;
    const ok = await new ConfirmModal(
      t('page.set.confirm.delete1', { name }),
      t('common.delete'),
      t('common.cancel'),
      true,
    ).open();
    if (!ok) return;
    try {
      // 1) 摘掉所有父路线里的引用。
      const referencing = await repository.findRoadmapsReferencingPlace(name);
      // 用户进来时的上一层（一般唯一）。删除后显式跳回这里 —— 不能用 goBack：
      // 引用刚被摘掉，history/backlink 回退会找不到落点而退到 roadmapset 入口页，
      // 那一页会在 metadataCache 尚未消化「文件已移入回收站」时整页重解析，
      // 期间个别 trip 的 getFirstLinkpathDest 落空被丢掉 → 「缺数据、要重启」。
      const parentToOpen = referencing[0];
      for (const parentPath of referencing) {
        const parent = await repository.loadRoadmap(parentPath);
        if (!parent) continue;
        const remaining: Array<Place | RouteSegment> = [];
        for (let i = 0; i < parent.items.length; i++) {
          const it = parent.items[i];
          if (isPlace(it) && (it as Place).name === name) {
            const next = parent.items[i + 1];
            if (next && !isPlace(next)) i++; // 连同紧随的 route 段一起删
            continue;
          }
          remaining.push(parent.items[i]);
        }
        await repository.updateRoadmapItems(parentPath, parent.name, parent.detail || {}, remaining);
      }
      // 2) 从根集合移除（顶层 trip 的情况；子路线一般不在集合里，no-op）。
      try {
        const ids = await repository.loadRoadmapSet();
        if (ids.includes(data.id)) await repository.updateRootFile(ids.filter(id => id !== data.id));
      } catch (e) { console.warn('[RoadmapPage] remove from set failed', e); }
      // 3) 文件移入回收站。
      const self = app.vault.getAbstractFileByPath(filePath);
      if (self instanceof TFile) {
        try { await app.fileManager.trashFile(self); }
        catch (e) { console.warn('[RoadmapPage] trashFile failed', e); }
      }
      new Notice(t('notice.deletedTrip', { name }));
      setMetaEditorVisible(false);
      // 显式跳回父路线；没有父路线（孤立 trip）才退回 goBack 的常规链路。
      if (parentToOpen) {
        const target = hostLeaf
          || app.workspace.getLeavesOfType('lac-roadmap-view')[0]
          || app.workspace.activeLeaf;
        if (target) {
          await target.setViewState({ type: 'lac-roadmap-view', state: { filePath: parentToOpen }, active: true });
          app.workspace.revealLeaf(target);
        } else {
          await goBack();
        }
      } else {
        await goBack();
      }
    } catch (err) {
      console.warn('[RoadmapPage] 删除路线失败', err);
      new Notice(t('notice.deleteFailed'));
    }
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
    // `subRouteMap` is pre-built by the mount effect, but that runs
    // asynchronously (one file read per item) and can still be empty —
    // or missing this entry — when the card is first clicked. Relying on
    // it alone makes a sub-route card fall through to the place editor
    // whenever the cache lags. Do a live lookup as a fallback so a
    // sub-roadmap always navigates regardless of timing, and memoise it.
    let subPath = subRouteMap[p.id];
    if (!subPath) {
      try {
        const dest = app.metadataCache.getFirstLinkpathDest(p.id, filePath);
        if (dest && dest instanceof TFile && await repository.isSubRoadmapEntry(dest.path)) {
          subPath = dest.path;
          setSubRouteMap(prev => ({ ...prev, [p.id]: dest.path }));
        }
      } catch (e) {
        console.warn('[RoadmapPage] sub-roadmap live lookup failed', e);
      }
    }
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

  // 新建子路线（+ add trip）的日期预填 —— 与「添加地点」(addPlaceFromList) 同源：
  // 取当前选中日期 tab 里最晚的一天预填到 modal 的 WHEN。选中 unplanned 或当前
  // 没有任何日期 tab 时不预填。
  const subRoadmapPrefillDate = ((): string | undefined => {
    if (selectedTabs.has('unplanned')) return undefined;
    const dateKeys = filteredKeys.filter(isDateKey);
    if (dateKeys.length === 0) return undefined;
    return dateKeys.reduce((max, curr) => (curr > max ? curr : max));
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

      <div
        className="lac-roadmap-list-wrapper"
        ref={listWrapperRef}
        onScroll={(e) => {
          // 仅在 data 已对应当前 filePath 时记录 —— 导航瞬间列表里还是上一条路线的
          // 内容，此时的滚动事件不能写到新 filePath 名下，否则会污染它已存的位置。
          if (data?.id === fileBase) scrollPositionsRef.current[filePath] = e.currentTarget.scrollTop;
        }}
      >
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
        onDelete={data ? deleteCurrentRoadmap : undefined}
      />

      {/* 创建嵌套子路线 — `+ add trip` 触发。走纯创建模式（不传 initial / items），
          保存到新文件并把 [[name]] 引用插回父路线。 */}
      <RoadmapEditModal
        visible={places.subRoadmapEditorVisible}
        mode="create"
        settings={settings}
        initial={subRoadmapPrefillDate ? { detail: { start_time: subRoadmapPrefillDate } } : undefined}
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
          label: l.label,
        }))}
        readOnly
      />
    </div>
  );
}
