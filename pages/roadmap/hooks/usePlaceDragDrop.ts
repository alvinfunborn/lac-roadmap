import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Roadmap, Place, RouteSegment } from '../../../types/roadmap';
import { RoadmapRepository } from '../../../repositories/RoadmapRepository';
import { RoadmapSettings } from '../../../types';
import { RouteCalculationService } from '../../../services/RouteCalculationService';
import { extractTimeFromDateTime } from '../../../utils/timeValidation';
import { isPlace, isRouteSegment } from '../../../utils/typeGuards';
import { compareGroupKey, isDateKey } from '../../../utils/date';
import { anchorFromPlace } from '../../../utils/schedule';

// sortablejs UMD 导出：default 或直接挂载，兼容 esbuild 打包
type SortableInstance = { destroy: () => void };
type SortableFactory = { create: (el: HTMLElement, opts?: object) => SortableInstance };
const SortableLib = require('sortablejs') as SortableFactory & { default?: SortableFactory };
const Sortable: SortableFactory = SortableLib.default ?? SortableLib;

/**
 * 重排后规整：交通段必须夹在两个地点之间，去掉首/尾的悬挂段（就地修改 arr）。
 * 最常见来源是把「地点 + 它的出向交通段」整块拖到列表末尾 —— 出向段失去了终点
 * 地点变成悬挂段，会在时间轴尾部画出一条指向空气的交通 chip。地点本身落到末尾后
 * 不再有「下一程」，丢掉它原来的出向段即可（用户重新需要时点「+ 添加交通」）。
 */
function stripDanglingSegments(arr: Array<Place | RouteSegment>): void {
  while (arr.length && isRouteSegment(arr[arr.length - 1])) arr.pop();
  while (arr.length && isRouteSegment(arr[0])) arr.shift();
}

interface UsePlaceDragDropParams {
  data: Roadmap | null;
  filePath: string;
  repository: RoadmapRepository;
  settings: RoadmapSettings;
  groups: Record<string, Array<Place | RouteSegment>>;
  groupKeys: string[];
  lastPlaceIndex: number;
  tempDayKeys: string[];
  setTempDayKeys: React.Dispatch<React.SetStateAction<string[]>>;
  visibleItemIndices: number[];
  cardListRef: React.RefObject<HTMLDivElement>;
  onDataChanged: (next: Roadmap | null) => void;
}

export interface PlaceDragDropApi {
  dragIndexRef: React.MutableRefObject<number | null>;
  didDragRef: React.MutableRefObject<boolean>;
  lastDraggedItemRef: React.MutableRefObject<number | null>;
  droppedOnTabRef: React.MutableRefObject<boolean>;
  onDrop: (toItemIndex: number) => Promise<void>;
  onDropToTab: (targetKey: string) => Promise<void>;
}

/**
 * 地点拖拽相关逻辑：
 * - 卡片之间拖拽排序（Sortable.js）
 * - 卡片拖拽到日期标签 onDropToTab
 * - 拖拽完成后的路线段距离重新计算
 */
export function usePlaceDragDrop(params: UsePlaceDragDropParams): PlaceDragDropApi {
  const {
    data,
    filePath,
    repository,
    settings,
    groups,
    groupKeys,
    lastPlaceIndex,
    tempDayKeys,
    setTempDayKeys,
    visibleItemIndices,
    cardListRef,
    onDataChanged,
  } = params;

  const dragIndexRef = useRef<number | null>(null);
  const didDragRef = useRef(false);
  const lastDraggedItemRef = useRef<number | null>(null);
  const droppedOnTabRef = useRef(false);
  const sortableRef = useRef<SortableInstance | null>(null);

  /**
   * 重排序后重算「端点真的变了」的交通段。
   *
   * 重排只是把 data.items 里既有的 Place / RouteSegment 对象换了顺序（splice 浅拷贝
   * 保留对象引用），所以可以用「对象身份」精确比较每条段在 before / after 两个数组里
   * 的左右相邻地点：相邻对没变 → 距离不变，跳过；变了 → 用它在 after 里真正的
   * `prev → next` 端点重算（保留 travelMode）。
   *
   * 这同时修掉了旧实现的两个问题：
   *   1) 旧实现把段当作某地点的「outgoing」却用 `prev → 该地点` 的端点去算，方向/端点
   *      都错（段 items[i] 实际代表 prev → next）。
   *   2) 旧实现靠 splice 之后的下标集合来圈定「受影响段」，下标在增删后会错位，
   *      导致部分应刷新的段没刷新、不该动的反被覆盖。
   */
  const recalculateAffectedRoutes = useCallback(async (
    beforeItems: Array<Place | RouteSegment>,
    afterItems: Array<Place | RouteSegment>,
  ) => {
    const routeService = new RouteCalculationService(
      settings?.googleMapsApiKey,
      settings?.gaodeWebServiceKey
    );
    const provider = (data?.detail?.map_provider || settings?.mapApiProvider || 'google') as 'google' | 'gaode';

    const neighborsOf = (arr: Array<Place | RouteSegment>, seg: RouteSegment): { prev?: Place; next?: Place } => {
      const i = arr.indexOf(seg);
      if (i < 0) return {};
      let prev: Place | undefined;
      for (let j = i - 1; j >= 0; j--) { const it = arr[j]; if (isPlace(it)) { prev = it; break; } }
      let next: Place | undefined;
      for (let j = i + 1; j < arr.length; j++) { const it = arr[j]; if (isPlace(it)) { next = it; break; } }
      return { prev, next };
    };

    for (const seg of afterItems) {
      if (!isRouteSegment(seg)) continue;
      const before = neighborsOf(beforeItems, seg);
      const after = neighborsOf(afterItems, seg);
      // 相邻地点对象引用都没变 → 端点没动，距离/时长不变，跳过。
      if (before.prev === after.prev && before.next === after.next) continue;
      if (!after.prev || !after.next) continue;
      try {
        const result = await routeService.calculateRoute(after.prev, after.next, seg.travelMode, provider);
        if (result) {
          seg.distance = result.distance;
          seg.duration = result.duration;
          seg.tolls = result.tolls;
        } else {
          console.warn(`[RouteCalculation] 计算失败: ${after.prev.name} -> ${after.next.name}`);
        }
      } catch (err) {
        console.warn('[RouteCalculation] 异常', err);
      }
    }
  }, [data?.detail?.map_provider, settings?.googleMapsApiKey, settings?.gaodeWebServiceKey, settings?.mapApiProvider]);

  const onDrop = useCallback(async (toItemIndex: number) => {
    if (!data) return;
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    if (from == null) return;
    const items = [...data.items];
    const fromItem = items[from];
    const nextItem = items[from + 1];
    const takeCount = isPlace(fromItem) && isRouteSegment(nextItem) ? 2 : 1;
    const block = items.splice(from, takeCount);

    // 拖到最后一张卡片上 = 插入到末尾
    const appendMode = toItemIndex >= data.items.length || toItemIndex === lastPlaceIndex;
    let insertAt: number;
    if (appendMode) {
      insertAt = items.length;
    } else if (toItemIndex === from) {
      return;
    } else if (toItemIndex > from) {
      // 向下拖：放到目标 place「之后」（连带其紧跟的 RouteSegment 一起跨过）。
      // splice 已移除 from 起的 takeCount 项，目标 place 在剩余数组中的位置 = toItemIndex - takeCount。
      // 用 toItemIndex - 1 会让相邻向下拖（toItemIndex - takeCount === from）变成原地不动 ⇒ 失效。
      const targetHasRouteAfter = isRouteSegment(data.items[toItemIndex + 1]);
      insertAt = toItemIndex - takeCount + 1 + (targetHasRouteAfter ? 1 : 0);
    } else {
      insertAt = toItemIndex;
    }
    items.splice(insertAt, 0, ...block);
    // 整块（含出向段）落到末尾时，出向段会变成悬挂段 —— 规整掉。droppedPlace 在段
    // 之前，去掉尾部段不改变它的下标，后面的日期同步逻辑不受影响。
    stripDanglingSegments(items);

    // 自动同步日期：仅在"前后两位已排日期的邻居一致地指向同一个新日期"时触发，
    // 把 dropped 的日期换成那个邻居日期（time-of-day 保留）。
    //
    // 历史 bug：旧实现是"只要 dropped 有 start_time 就改成前一张有 start_time
    // 的卡片的时间"。结果同一天内的重排会被误判为跨日继承——例如
    // [6-10 赛里木湖, 6-11 乌鲁木齐, 6-11 赛里木湖] 中把第二个赛里木湖拖到
    // 乌鲁木齐上方，前邻居是 6-10 赛里木湖，dropped 被改成 6-10。"两邻居一致
    // 才继承"的判据正好排除这种歧义同时保留"拖入同质化新日期"的便利。
    //
    // 不再写共享 place 文件 —— per-trip 的 start_time/end_time 走 trip 文件
    // （后面的 updateRoadmapItems 会一并写回）。
    const droppedPlace = isPlace(block[0]) ? { ...block[0], detail: { ...block[0].detail } } : undefined;
    if (droppedPlace) block[0] = droppedPlace;
    if (droppedPlace && droppedPlace.detail?.start_time) {
      const datePart = (s: string | undefined) => s ? String(s).split(' ')[0] : '';
      const currentDate = datePart(droppedPlace.detail.start_time);
      let prevPlace: Place | undefined;
      for (let i = insertAt - 1; i >= 0; i--) {
        const it = items[i];
        if (isPlace(it) && it.detail?.start_time) { prevPlace = it; break; }
      }
      let nextPlace: Place | undefined;
      for (let i = insertAt + 1; i < items.length; i++) {
        const it = items[i];
        if (isPlace(it) && it.detail?.start_time) { nextPlace = it; break; }
      }
      const prevDate = datePart(prevPlace?.detail?.start_time);
      const nextDate = datePart(nextPlace?.detail?.start_time);
      if (prevDate && prevDate === nextDate && prevDate !== currentDate) {
        const time = extractTimeFromDateTime(droppedPlace.detail.start_time);
        const endTime = extractTimeFromDateTime(droppedPlace.detail.end_time || '');
        droppedPlace.detail = {
          ...droppedPlace.detail,
          start_time: time ? `${prevDate} ${time}` : prevDate,
          end_time: endTime ? `${prevDate} ${endTime}` : undefined,
        };
      }
    }

    await recalculateAffectedRoutes(data.items, items);
    await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, items);
    const r = await repository.loadRoadmap(filePath);
    onDataChanged(r);
  }, [data, filePath, lastPlaceIndex, recalculateAffectedRoutes, repository, onDataChanged]);

  const onDropToTab = useCallback(async (targetKey: string) => {
    if (!data) return;
    const from = dragIndexRef.current;
    if (from == null) return;
    const folder = (filePath.split('/').slice(0, -1).join('/')) || 'LaC/Roadmap';
    const items = [...data.items];
    const fromItem = items[from];
    const nextItem = items[from + 1];
    const takeCount = isPlace(fromItem) && isRouteSegment(nextItem) ? 2 : 1;
    const block = items.splice(from, takeCount);
    const droppedPlace = isPlace(block[0]) ? { ...block[0], detail: { ...block[0].detail } } : undefined;
    if (droppedPlace) block[0] = droppedPlace;
    if (!droppedPlace) return;

    const isDate = isDateKey(targetKey);
    droppedPlace.detail = { ...droppedPlace.detail };
    if (isDate) {
      const timePart = extractTimeFromDateTime(droppedPlace.detail?.start_time || '');
      droppedPlace.detail.start_time = timePart ? `${targetKey} ${timePart}` : targetKey;
      const endTimePart = extractTimeFromDateTime(droppedPlace.detail?.end_time || '');
      droppedPlace.detail.end_time = endTimePart ? `${targetKey} ${endTimePart}` : undefined;
      delete (droppedPlace.detail as Partial<typeof droppedPlace.detail> & { days?: number }).days;
    } else {
      const m = targetKey.match(/第(\d+)天/);
      droppedPlace.detail.days = m ? parseInt(m[1], 10) : undefined;
      droppedPlace.detail.start_time = undefined;
      droppedPlace.detail.end_time = undefined;
    }
    const sortKeys = (keys: string[]) => keys.slice().sort(compareGroupKey);
    // 三态 key（与 useRoadmapGroups 对齐）：拖动算位置时如果某地点是 wishlist
    // 状态（没 start_time 也没 days），用临时 dayIndex 作 fallback，仅用于
    // 排序计算，不会写回 detail.days。
    const getKey = (p: Place, di: number) =>
      p.detail?.start_time
        ? String(p.detail.start_time).split(' ')[0]
        : (p.detail?.days != null ? `第${p.detail.days}天` : `第${di}天`);

    let insertAt = -1;
    let dayIndex = 1;
    let currentKey = '';
    let inTarget = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (isPlace(it)) {
        const key = getKey(it, dayIndex);
        if (key !== currentKey) {
          currentKey = key;
          if (!it.detail?.start_time) dayIndex++;
        }
        inTarget = key === targetKey;
        if (inTarget) insertAt = i + 1;
      } else if (inTarget && isRouteSegment(it)) {
        insertAt = i + 1;
      }
    }
    if (insertAt < 0) {
      const allKeys = sortKeys([...Object.keys(groups), ...tempDayKeys]);
      const idx = allKeys.indexOf(targetKey);
      if (idx <= 0) insertAt = 0;
      else {
        const prevKey = allKeys[idx - 1];
        let lastIdx = -1;
        dayIndex = 1;
        currentKey = '';
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (isPlace(it)) {
            const key = getKey(it, dayIndex);
            if (key !== currentKey) {
              currentKey = key;
              if (!it.detail?.start_time) dayIndex++;
            }
            if (key === prevKey) lastIdx = i;
          } else if (lastIdx >= 0 && i === lastIdx + 1) {
            lastIdx = i;
          }
        }
        insertAt = lastIdx + 1;
      }
    }
    const finalInsertAt = Math.min(insertAt, items.length);
    items.splice(finalInsertAt, 0, ...block);
    // 拖到最后一个日期分组时整块可能落在末尾，出向段失去终点 —— 同样规整掉。
    stripDanglingSegments(items);

    const scheduled = anchorFromPlace(data, items, items.indexOf(droppedPlace), from);
    await repository.savePlaceFile(folder, droppedPlace);
    await recalculateAffectedRoutes(data.items, scheduled);
    await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, scheduled);
    if (tempDayKeys.includes(targetKey)) setTempDayKeys(prev => prev.filter(k => k !== targetKey));
    const r = await repository.loadRoadmap(filePath);
    onDataChanged(r);
  }, [data, filePath, groups, tempDayKeys, setTempDayKeys, repository, recalculateAffectedRoutes, onDataChanged]);

  // 通过 ref 暴露最新 onDrop 供 Sortable.js 使用，避免重建 Sortable 实例
  const applyReorderRef = useRef<(to: number) => Promise<void>>(async () => {});
  applyReorderRef.current = onDrop;

  // Sortable.js：基于 pointer 事件，在 Obsidian/Electron 中比 HTML5 DnD 更可靠
  useEffect(() => {
    const el = cardListRef.current;
    const indices = visibleItemIndices;
    if (!el || !data || indices.length === 0) return;
    const so = Sortable.create(el, {
      animation: 150,
      draggable: '.lac-card',
      ghostClass: 'lac-sortable-ghost',
      chosenClass: 'lac-sortable-chosen',
      dragClass: 'lac-sortable-drag',
      // 移动端必须长按再拖，否则手指一碰卡片就进入拖拽态、整页滚动被吃掉。
      // delayOnTouchOnly 让鼠标侧仍是即触即拖；touchStartThreshold 在长按
      // 计时期间出现 ≥5px 滑动直接放弃拖拽，让浏览器接管滚动。
      delay: 500,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      onStart: (evt: { item: HTMLElement }) => {
        const idx = evt.item.getAttribute('data-place-index');
        dragIndexRef.current = idx != null ? parseInt(idx, 10) : null;
      },
      onEnd: (evt: {
        item: HTMLElement;
        oldIndex: number | undefined;
        newIndex: number | undefined;
        oldDraggableIndex: number | undefined;
        newDraggableIndex: number | undefined;
        from: HTMLElement;
      }) => {
        if (droppedOnTabRef.current) { droppedOnTabRef.current = false; return; }
        const { item, oldIndex, newIndex, oldDraggableIndex, newDraggableIndex, from: fromEl } = evt;
        if (oldIndex == null || newIndex == null) return;
        if (oldDraggableIndex == null || newDraggableIndex == null) return;
        if (oldIndex === newIndex) return;

        // CRITICAL: revert Sortable's DOM mutation BEFORE we update React
        // state. Sortable physically moved `item` to `newIndex`; React's
        // virtual DOM still tracks the pre-drag order, so when `setData`
        // re-renders with the new items array, React's reconciliation
        // diffs `pre-drag virtual` vs `new virtual` and issues DOM moves
        // ON TOP OF Sortable's already-applied move — DAY eyebrows /
        // numbered bullets / polyline / transit all end up stale because
        // half of them re-render and half don't. Restoring the original
        // DOM order lets React produce a single clean reorder pass.
        const children = Array.from(fromEl.children) as HTMLElement[];
        // After Sortable's move, `item` sits at newIndex. Compute where
        // its left-neighbour slot would be in the original order:
        //   • moving DOWN (newIndex > oldIndex) → put `item` back before
        //     whatever is currently at oldIndex (i.e. shifted by Sortable
        //     because item is now after it).
        //   • moving UP (newIndex < oldIndex)   → put `item` back before
        //     whatever is currently at oldIndex+1 (which used to be the
        //     element right after item).
        const refIdx = newIndex > oldIndex ? oldIndex : oldIndex + 1;
        const refNode = children[refIdx];
        if (refNode && refNode !== item) {
          fromEl.insertBefore(item, refNode);
        } else {
          fromEl.appendChild(item);
        }

        // 容器里同时有 `.lac-card` 和 `.lac-route-badge` 两类兄弟，所以必须用
        // draggable-relative 索引来查 `visibleItemIndices`（仅 Place 索引）；
        // oldIndex/newIndex 是含 RouteBadge 的全 DOM 位置，会越界返回 undefined，
        // 导致非顶部卡片的 reorder 被静默丢弃。
        const from = indices[oldDraggableIndex];
        const to = indices[newDraggableIndex];
        if (from != null && to != null) {
          dragIndexRef.current = from;
          didDragRef.current = true;
          applyReorderRef.current(to);
        }
      },
    } as object);
    sortableRef.current = so;
    return () => { so.destroy(); sortableRef.current = null; };
  }, [data, visibleItemIndices, cardListRef]);

  return useMemo(() => ({
    dragIndexRef,
    didDragRef,
    lastDraggedItemRef,
    droppedOnTabRef,
    onDrop,
    onDropToTab,
  }), [onDrop, onDropToTab]);
}
