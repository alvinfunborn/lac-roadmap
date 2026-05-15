import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Roadmap, Place, RouteSegment } from '../../../types/roadmap';
import { RoadmapRepository } from '../../../repositories/RoadmapRepository';
import { RoadmapSettings } from '../../../types';
import { RouteCalculationService } from '../../../services/RouteCalculationService';
import { extractTimeFromDateTime } from '../../../utils/timeValidation';
import { isPlace, isRouteSegment } from '../../../utils/typeGuards';
import { compareGroupKey, isDateKey } from '../../../utils/date';

// sortablejs UMD 导出：default 或直接挂载，兼容 esbuild 打包
type SortableInstance = { destroy: () => void };
type SortableFactory = { create: (el: HTMLElement, opts?: object) => SortableInstance };
const SortableLib = require('sortablejs') as SortableFactory & { default?: SortableFactory };
const Sortable: SortableFactory = SortableLib.default ?? SortableLib;

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

  /** 重新计算受影响的路线段距离 */
  const recalculateAffectedRoutes = useCallback(async (
    items: Array<Place | RouteSegment>,
    changedIndices: number[]
  ) => {
    const routeService = new RouteCalculationService(
      settings?.googleMapsApiKey,
      settings?.gaodeWebServiceKey
    );
    const provider = (data?.detail?.map_provider || settings?.mapApiProvider || 'google') as 'google' | 'gaode';

    for (const idx of changedIndices) {
      const place = items[idx];
      if (!isPlace(place)) continue;

      const nextItem = items[idx + 1];
      if (!isRouteSegment(nextItem)) continue;

      const routeSegment = nextItem;

      let prevPlace: Place | undefined;
      for (let j = idx - 1; j >= 0; j--) {
        const it = items[j];
        if (isPlace(it)) { prevPlace = it; break; }
      }
      if (!prevPlace) continue;

      try {
        const result = await routeService.calculateRoute(
          prevPlace,
          place,
          routeSegment.travelMode,
          provider
        );
        if (result) {
          routeSegment.distance = result.distance;
          routeSegment.duration = result.duration;
          routeSegment.tolls = result.tolls;
        } else {
          console.warn(`[RouteCalculation] 计算失败: ${prevPlace.name} -> ${place.name}`);
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

    const affectedIndices: number[] = [];
    if (takeCount === 2) affectedIndices.push(insertAt);
    for (let i = from; i < items.length; i++) {
      if (isPlace(items[i])) { affectedIndices.push(i); break; }
    }
    for (let i = insertAt + takeCount; i < items.length; i++) {
      if (isPlace(items[i])) { affectedIndices.push(i); break; }
    }

    // 若有时间：改为上一有时间的卡片的时间；若无，且当前时间>下一有时间的，则改为下一
    const droppedPlace = isPlace(block[0]) ? block[0] : undefined;
    if (droppedPlace && droppedPlace.detail?.start_time) {
      const folder = (filePath.split('/').slice(0, -1).join('/')) || 'LaC/Roadmap';
      let updated = false;
      for (let i = insertAt - 1; i >= 0; i--) {
        const prev = items[i];
        if (isPlace(prev) && prev.detail?.start_time) {
          droppedPlace.detail = {
            ...droppedPlace.detail,
            start_time: prev.detail?.start_time,
            end_time: prev.detail?.end_time,
          };
          await repository.savePlaceFile(folder, droppedPlace);
          updated = true;
          break;
        }
      }
      if (!updated) {
        for (let i = insertAt + 1; i < items.length; i++) {
          const nx = items[i];
          if (isPlace(nx) && nx.detail?.start_time) {
            const droppedT = new Date(droppedPlace.detail!.start_time!).getTime();
            const nextT = new Date(nx.detail!.start_time!).getTime();
            if (!isNaN(droppedT) && !isNaN(nextT) && droppedT > nextT) {
              droppedPlace.detail = {
                ...droppedPlace.detail,
                start_time: nx.detail?.start_time,
                end_time: nx.detail?.end_time,
              };
              await repository.savePlaceFile(folder, droppedPlace);
            }
            break;
          }
        }
      }
    }

    await recalculateAffectedRoutes(items, affectedIndices);
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
    const droppedPlace = isPlace(block[0]) ? block[0] : undefined;
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
    const getKey = (p: Place, di: number) =>
      p.detail?.start_time ? String(p.detail.start_time).split(' ')[0] : `第${p.detail?.days ?? di}天`;

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

    const affectedIndices: number[] = [];
    if (takeCount === 2) affectedIndices.push(finalInsertAt);
    for (let i = from; i < items.length; i++) {
      if (isPlace(items[i])) { affectedIndices.push(i); break; }
    }
    for (let i = finalInsertAt + takeCount; i < items.length; i++) {
      if (isPlace(items[i])) { affectedIndices.push(i); break; }
    }

    await repository.savePlaceFile(folder, droppedPlace);
    await recalculateAffectedRoutes(items, affectedIndices);
    await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, items);
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
