import { useState, useCallback } from 'react';
import { App, Notice, TFile } from 'obsidian';
import { Roadmap, Place, RouteSegment, Address, RoadmapDetail, hasCoords } from '../../../types/roadmap';
import { MapLocation } from '../../../types/map';
import { RoadmapSettings } from '../../../types';
import { RoadmapRepository } from '../../../repositories/RoadmapRepository';
import { isPlace, isRouteSegment } from '../../../utils/typeGuards';
import { isDateKey } from '../../../utils/date';
import { RouteCalculationService } from '../../../services/RouteCalculationService';
import ConfirmModal from '../../../components/modals/ConfirmModal';
import { RoadmapEditPayload } from '../../../components/modals/RoadmapEditModal';
import { t } from '../../../i18n';

interface PlaceEditPayload {
  name: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  address?: MapLocation;
}

interface PlaceEditInitial {
  name?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  address?: MapLocation;
  /**
   * Position of this place in `data.items` when the editor was opened.
   * Required to disambiguate duplicate `[[name]]` entries in the same
   * trip — without it, the schedule write hits the first matching name.
   * Undefined when opening the editor for a new place.
   */
  itemIndex?: number;
}

interface UsePlaceMutationsParams {
  app: App;
  repository: RoadmapRepository;
  settings: RoadmapSettings;
  filePath: string;
  data: Roadmap | null;
  setData: (r: Roadmap | null) => void;
  filteredKeys: string[];
  selectedTabs: Set<string>;
  subRouteMap: Record<string, string>;
  setSubRouteMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export interface PlaceMutationsApi {
  // Place edit modal state
  editorVisible: boolean;
  setEditorVisible: (v: boolean) => void;
  editInitial: PlaceEditInitial | undefined;
  setEditInitial: (v: PlaceEditInitial | undefined) => void;

  // Sub-roadmap create modal state
  subRoadmapEditorVisible: boolean;
  setSubRoadmapEditorVisible: (v: boolean) => void;

  // Handlers
  addPlaceFromList: () => void;
  editPlace: (p: Place, itemIndex?: number) => void;
  deletePlace: (p: Place, itemIndex?: number) => Promise<void>;
  onSavePlace: (payload: PlaceEditPayload) => Promise<void>;
  onCreateSubRoadmap: (payload: RoadmapEditPayload) => Promise<void>;
}

export function usePlaceMutations({
  app, repository, settings, filePath,
  data, setData,
  filteredKeys, selectedTabs,
  subRouteMap, setSubRouteMap,
}: UsePlaceMutationsParams): PlaceMutationsApi {
  const [editorVisible, setEditorVisible] = useState(false);
  const [editInitial, setEditInitial] = useState<PlaceEditInitial | undefined>(undefined);
  const [subRoadmapEditorVisible, setSubRoadmapEditorVisible] = useState(false);

  /**
   * 调整某地点前后的 route segment。
   *
   * mode = 'insert-if-missing'（创建场景）：仅当前/后某段不存在时才插入新段。
   *   嵌套子路线（type=root + renders=roadmap）作为 place 出现时，路由端点
   *   不再用 trip-level `detail.address`（往往只是个大区域名）—— 改用它的
   *   `startPoint`/`endPoint`（首/末一个 geocoded 地点）。
   *
   * mode = 'recompute'（编辑坐标场景）：强制重算前/后两段，保留原有 travelMode；
   *   原本没有 route 行的两端不补（让用户自己决定要不要加 transit）。
   */
  const applyRoutesAroundPlace = async (
    items: Array<Place | RouteSegment>,
    targetPlace: Place,
    mode: 'insert-if-missing' | 'recompute',
  ) => {
    const hasCoord = (p?: Place) =>
      !!p?.detail?.address &&
      typeof p.detail.address.longitude === 'number' &&
      typeof p.detail.address.latitude === 'number';
    if (!hasCoord(targetPlace)) return;

    const service = new RouteCalculationService(
      settings?.googleMapsApiKey,
      settings?.gaodeWebServiceKey,
    );
    const provider = (data?.detail?.map_provider || settings?.mapApiProvider || 'google') as 'google' | 'gaode';

    const resolveEndpoint = async (p: Place, direction: 'entry' | 'exit'): Promise<Place> => {
      const subPath = subRouteMap[p.id];
      if (!subPath) return p;
      try {
        const sub = await repository.loadRoadmap(subPath);
        const pick = direction === 'entry' ? sub?.startPoint : sub?.endPoint;
        if (sub && pick && typeof pick.longitude === 'number' && typeof pick.latitude === 'number') {
          return {
            ...p,
            detail: { ...(p.detail || {}), address: { ...pick } },
          };
        }
      } catch (e) {
        console.warn('[usePlaceMutations] resolveEndpoint failed', e);
      }
      return p;
    };

    const buildSeg = async (
      from: Place,
      to: Place,
      travelMode: RouteSegment['travelMode'],
    ): Promise<RouteSegment | null> => {
      try {
        const fromEff = await resolveEndpoint(from, 'exit');
        const toEff = await resolveEndpoint(to, 'entry');
        const result = await service.calculateRoute(fromEff, toEff, travelMode, provider);
        if (result) {
          return {
            travelMode: result.travelMode,
            distance: result.distance,
            duration: result.duration,
            tolls: typeof result.tolls === 'number' ? result.tolls : 0,
          };
        }
      } catch (e) {
        console.warn('[usePlaceMutations] route calc failed', e);
      }
      // recompute 模式下计算失败保留原段，不覆盖为空壳；插入模式下回退空壳并提示。
      if (mode === 'insert-if-missing') {
        new Notice(t('modal.routeSegment.manualEditHint'));
        return { travelMode, distance: 0, duration: 0, tolls: 0 };
      }
      return null;
    };

    const isSubRoadmapPlace = (p: Place) => !!subRouteMap[p.id];
    const hasRoutableCoord = (p?: Place) => !!p && (hasCoord(p) || isSubRoadmapPlace(p));

    // — Prev → target —
    let idx = items.findIndex(it => isPlace(it) && (it as Place).name === targetPlace.name);
    if (idx < 0) return;
    let prevIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (isPlace(items[i])) { prevIdx = i; break; }
    }
    if (prevIdx >= 0 && hasRoutableCoord(items[prevIdx] as Place)) {
      const segIdx = prevIdx + 1;
      const existing = items[segIdx];
      const existingIsRoute = existing && !isPlace(existing) && !!(existing as RouteSegment).travelMode;
      const shouldRewrite = mode === 'insert-if-missing' ? !existingIsRoute : existingIsRoute;
      if (shouldRewrite) {
        const travelMode: RouteSegment['travelMode'] =
          existingIsRoute ? (existing as RouteSegment).travelMode : 'drive';
        const seg = await buildSeg(items[prevIdx] as Place, targetPlace, travelMode);
        if (seg) {
          if (existingIsRoute) items[segIdx] = seg;
          else { items.splice(segIdx, 0, seg); idx++; }
        }
      }
    }

    // — target → next —（idx 在前面可能因 splice 前移过，重新找一次更稳）
    idx = items.findIndex(it => isPlace(it) && (it as Place).name === targetPlace.name);
    if (idx < 0) return;
    let nextIdx = -1;
    for (let i = idx + 1; i < items.length; i++) {
      if (isPlace(items[i])) { nextIdx = i; break; }
    }
    if (nextIdx >= 0 && hasRoutableCoord(items[nextIdx] as Place)) {
      const segIdx = idx + 1;
      const existing = items[segIdx];
      const existingIsRoute = existing && !isPlace(existing) && !!(existing as RouteSegment).travelMode;
      const shouldRewrite = mode === 'insert-if-missing' ? !existingIsRoute : existingIsRoute;
      if (shouldRewrite) {
        const travelMode: RouteSegment['travelMode'] =
          existingIsRoute ? (existing as RouteSegment).travelMode : 'drive';
        const seg = await buildSeg(targetPlace, items[nextIdx] as Place, travelMode);
        if (seg) {
          if (existingIsRoute) items[segIdx] = seg;
          else items.splice(segIdx, 0, seg);
        }
      }
    }
  };

  // 子路线被编辑后，若它的首/末地点（startPoint/endPoint）变了，就把引用它的父路线里
  // 「进 / 出这条子路线」的 route 段按新端点重算。父路线的衔接距离不会自己刷新 ——
  // 不重算的话，在子路线加 / 删头尾地点后，父级距离会一直停在旧值。
  const syncParentRouteSegments = async (subName: string, newStart?: Address, newEnd?: Address) => {
    try {
      const parents = await repository.findRoadmapsReferencingPlace(subName);
      if (parents.length === 0) return;
      const service = new RouteCalculationService(settings?.googleMapsApiKey, settings?.gaodeWebServiceKey);
      const asPlace = (addr: Address): Place => ({ id: subName, name: subName, detail: { address: addr } });
      const recalc = async (from: Place, to: Place, travelMode: RouteSegment['travelMode'], provider: 'google' | 'gaode'): Promise<RouteSegment | null> => {
        const result = await service.calculateRoute(from, to, travelMode, provider);
        if (!result) return null;
        return { travelMode: result.travelMode, distance: result.distance, duration: result.duration, tolls: typeof result.tolls === 'number' ? result.tolls : 0 };
      };
      for (const parentPath of parents) {
        if (parentPath === filePath) continue;
        const parent = await repository.loadRoadmap(parentPath);
        if (!parent) continue;
        const items = [...parent.items];
        const provider = (parent.detail?.map_provider || settings?.mapApiProvider || 'google') as 'google' | 'gaode';
        let changed = false;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (!isPlace(it) || (it as Place).name !== subName) continue;
          // 进站段：上一地点 → 子路线 startPoint（文件里存为上一地点的 outgoing route = items[i-1]）
          if (hasCoords(newStart)) {
            const inSeg = items[i - 1];
            const prevPlace = items[i - 2];
            if (isRouteSegment(inSeg) && isPlace(prevPlace) && hasCoords((prevPlace as Place).detail?.address)) {
              const seg = await recalc(prevPlace as Place, asPlace(newStart), (inSeg as RouteSegment).travelMode, provider);
              if (seg) { items[i - 1] = seg; changed = true; }
            }
          }
          // 出站段：子路线 endPoint → 下一地点（items[i+1] 是 route，items[i+2] 是下一地点）
          if (hasCoords(newEnd)) {
            const outSeg = items[i + 1];
            const nextPlace = items[i + 2];
            if (isRouteSegment(outSeg) && isPlace(nextPlace) && hasCoords((nextPlace as Place).detail?.address)) {
              const seg = await recalc(asPlace(newEnd), nextPlace as Place, (outSeg as RouteSegment).travelMode, provider);
              if (seg) { items[i + 1] = seg; changed = true; }
            }
          }
        }
        if (changed) await repository.updateRoadmapItems(parentPath, parent.name, parent.detail || {}, items);
      }
    } catch (e) { console.warn('[usePlaceMutations] syncParentRouteSegments failed', e); }
  };

  // 仅当端点真的变了、且当前文件确实是一条子路线时才去同步父路线 —— 把全库扫描和
  // 路由 API 调用限制在「子路线头尾地点变化」这一种场景，避免每次保存都触发。
  const syncParentsIfEndpointsChanged = async (
    subName: string, oldStart: Address | undefined, oldEnd: Address | undefined, r: Roadmap | null,
  ) => {
    if (!r) return;
    const coordEq = (a?: Address, b?: Address) =>
      (!a && !b) || (!!a && !!b && a.longitude === b.longitude && a.latitude === b.latitude);
    if (coordEq(oldStart, r.startPoint) && coordEq(oldEnd, r.endPoint)) return;
    if (!(await repository.isSubRoadmapEntry(filePath))) return;
    await syncParentRouteSegments(subName, r.startPoint, r.endPoint);
  };

  const onSavePlace = async (payload: PlaceEditPayload) => {
    if (!data) return;
    const folder = (filePath.split('/').slice(0, -1).join('/')) || 'LaC/Roadmap';

    const isEditMode = !!(editInitial && editInitial.name);
    // 架构决策：place 文件可跨 trip 复用，per-trip 的 start_time/end_time
    // 永远写在 trip 文件里作为 wikilink 后的覆盖行，不污染 place 文件。
    // 这里 detail 同时带上 start_time/end_time 是为了让 updateRoadmapItems
    // 直接 inline 写入；旧的 updatePlaceScheduleInRoadmap 二次写入路径只
    // 能锁定第一个同名 wikilink，对同名重复（如一条 trip 中两个 [[赛里木湖]]）
    // 会写错位置，所以这条 UI 写路径不再使用它。
    const place: Place = {
      id: payload.name,
      name: payload.name,
      detail: {
        description: payload.description,
        address: payload.address as Address | undefined,
        start_time: payload.start_time || undefined,
        end_time: payload.end_time || undefined,
      },
    };
    try {
      if (isEditMode && editInitial?.name) {
        const origDest = app.metadataCache.getFirstLinkpathDest(editInitial.name, filePath);
        if (origDest && origDest instanceof TFile) {
          if (payload.name !== editInitial.name) {
            // 静默改名：app.fileManager.renameFile 会触发 Obsidian 的"自动更新内部
            // 链接"弹窗（用户设置为 Prompt 时），但用户已经在我们的 modal 里确认
            // 过保存，不该再被问一次。改用 vault.rename + 手动重写其它 trip 文件
            // 里的 [[oldName]] 引用。
            const oldName = editInitial.name;
            const newName = payload.name;
            const newPath = `${folder}/${newName}.md`;
            try {
              const referencingTrips = await repository.findRoadmapsReferencingPlace(oldName);
              await app.vault.rename(origDest, newPath);
              const re = new RegExp(`\\[\\[${oldName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(\\|[^\\]]*)?\\]\\]`, 'g');
              for (const tripPath of referencingTrips) {
                // 当前 trip 紧接着会被 updateRoadmapItems 整体重写，跳过避免多余写入
                if (tripPath === filePath) continue;
                const tripFile = app.vault.getAbstractFileByPath(tripPath);
                if (!tripFile || !(tripFile instanceof TFile)) continue;
                const raw = await app.vault.read(tripFile);
                const next = raw.replace(re, (_m, alias) => `[[${newName}${alias || ''}]]`);
                if (next !== raw) await app.vault.modify(tripFile, next);
              }
            } catch (e) {
              console.warn('[usePlaceMutations] rename failed', e);
              new Notice(t('notice.placeRenameFailed'));
            }
          }
          const finalDest = app.metadataCache.getFirstLinkpathDest(payload.name, filePath);
          if (finalDest && finalDest instanceof TFile) {
            await repository.updatePlaceGeneric(finalDest.path, {
              name: payload.name,
              description: payload.description,
              address: payload.address as Address | undefined,
            });
            try {
              const raw = await app.vault.read(finalDest);
              const cleaned = raw
                .replace(/^start_time\s*=\s*"[^"]*"\s*\n?/m, '')
                .replace(/^end_time\s*=\s*"[^"]*"\s*\n?/m, '');
              if (cleaned !== raw) await app.vault.modify(finalDest, cleaned);
            } catch (e) { console.warn('[usePlaceMutations] cleanup place start/end_time failed', e); }
          }
        } else {
          await repository.savePlaceFile(folder, place);
        }
      } else {
        await repository.savePlaceFile(folder, place);
      }
    } catch (err) {
      console.warn('[usePlaceMutations] 保存地点文件失败', err);
      new Notice(t('notice.savePlaceFailed'));
      return;
    }

    const isEdit = !!(editInitial && editInitial.name);
    const originalName = isEdit ? editInitial!.name : null;
    // 用 itemIndex 锁定要替换的具体位置，避免同名重复时误替换。
    const editIndex = editInitial?.itemIndex;
    const indexPointsToOriginal = (
      typeof editIndex === 'number'
      && editIndex >= 0
      && editIndex < data.items.length
      && isPlace(data.items[editIndex])
      && (data.items[editIndex] as Place).name === originalName
    );

    let nextItems: Array<Place | RouteSegment>;
    if (isEdit && originalName && originalName !== payload.name) {
      // 改名场景：place 文件已重命名，所有指向旧名的 wikilink 都失效，整 trip 一起换。
      // 同 trip 内的重复（罕见且改名后会全部指向新名）保持现状。
      nextItems = [];
      for (let i = 0; i < data.items.length; i++) {
        const it = data.items[i];
        if (isPlace(it) && it.name === originalName) {
          nextItems.push(place);
          const next = data.items[i + 1];
          if (isRouteSegment(next)) {
            nextItems.push(next);
            i++;
          }
        } else {
          nextItems.push(data.items[i]);
        }
      }
    } else if (isEdit && originalName && indexPointsToOriginal) {
      // 同名编辑：只替换 editIndex 指向的那一项。其它同名 place 保留各自的
      // detail.start_time/detail.address 等。
      nextItems = data.items.map((it, i) => (i === editIndex ? place : it));
    } else if (isEdit && originalName) {
      // Fallback（itemIndex 缺失或失效）：保留旧行为按 name 匹配第一项。
      nextItems = data.items.map(it => {
        if (isPlace(it) && it.name === originalName) return place;
        return it;
      });
    } else {
      const base = data.items || [];
      const newTime = payload.start_time ? new Date(payload.start_time).getTime() : NaN;
      const newIsWishlist = isNaN(newTime);
      let insertIdx = base.length;
      if (!newIsWishlist) {
        // 新增有日期的地点：插到 (a) 第一个日期更晚的地点之前，或
        // (b) 第一个 wishlist（无 start_time 也无 days）地点之前 —— 任一更早即可。
        // 保证 wishlist 永远在时间轴尾部。
        for (let i = 0; i < base.length; i++) {
          const it = base[i];
          if (!isPlace(it)) continue;
          const p = it as Place;
          const t = p.detail?.start_time ? new Date(p.detail.start_time).getTime() : NaN;
          const isWishlist = isNaN(t) && p.detail?.days == null;
          if (isWishlist || (!isNaN(t) && t > newTime)) { insertIdx = i; break; }
        }
      }
      // 新增 wishlist 地点 → 默认 append 到尾部（insertIdx = base.length）
      nextItems = [...base.slice(0, insertIdx), place, ...base.slice(insertIdx)];
      await applyRoutesAroundPlace(nextItems, place, 'insert-if-missing');
    }

    // 编辑场景下坐标变了 → 强制重算前后已有 route segment（保留原 travelMode）。
    if (isEdit) {
      const oldA = editInitial?.address;
      const newA = payload.address;
      const newHasCoords =
        typeof newA?.latitude === 'number' && typeof newA?.longitude === 'number';
      const coordsChanged = newHasCoords && (
        (oldA?.latitude ?? null) !== newA!.latitude ||
        (oldA?.longitude ?? null) !== newA!.longitude
      );
      if (coordsChanged) {
        await applyRoutesAroundPlace(nextItems, place, 'recompute');
      }
    }

    try {
      // start_time/end_time 已经写进 place.detail 由 updateRoadmapItems 落盘；
      // 不再调用 updatePlaceScheduleInRoadmap（它的 first-match 语义在同名
      // 重复时会写错位置）。该 API 仍保留供 RoadmapRepository 直接调用。
      await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, nextItems);
      const r = await repository.loadRoadmap(filePath);
      setData(r);
      await syncParentsIfEndpointsChanged(data.name, data.startPoint, data.endPoint, r);
    } catch (err) {
      console.warn('[usePlaceMutations] 更新路线文件失败', err);
      new Notice(t('notice.updateRoadmapFailed'));
    }
    setEditorVisible(false);
    setEditInitial(undefined);
  };

  const editPlace = (p: Place, itemIndex?: number) => {
    setEditInitial({
      name: p.name,
      start_time: p.detail?.start_time,
      end_time: p.detail?.end_time,
      description: p.detail?.description,
      address: p.detail?.address,
      itemIndex,
    });
    setEditorVisible(true);
  };

  const deletePlace = async (p: Place, itemIndex?: number) => {
    const modal = new ConfirmModal(t('confirm.deletePlace', { name: p.name }), t('common.delete'), t('common.cancel'), true);
    const ok = await modal.open();
    if (!ok || !data) return;
    // 同名重复时按 itemIndex 精确删除；否则回退到删第一个同名项。
    const targetIdx = (
      typeof itemIndex === 'number'
      && itemIndex >= 0
      && itemIndex < data.items.length
      && isPlace(data.items[itemIndex])
      && (data.items[itemIndex] as Place).name === p.name
    ) ? itemIndex : data.items.findIndex(it => isPlace(it) && (it as Place).name === p.name);
    const remaining: Array<Place | RouteSegment> = [];
    for (let i = 0; i < data.items.length; i++) {
      if (i === targetIdx) {
        const next = data.items[i + 1];
        if (isRouteSegment(next)) i++;
        continue;
      }
      remaining.push(data.items[i]);
    }
    try {
      await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, remaining);
      const r = await repository.loadRoadmap(filePath);
      setData(r);
      await syncParentsIfEndpointsChanged(data.name, data.startPoint, data.endPoint, r);
    } catch (err) {
      console.warn('[usePlaceMutations] 删除地点失败', err);
      new Notice(t('notice.deleteFailed'));
    }
  };

  const addPlaceFromList = () => {
    if (selectedTabs.has('unplanned')) {
      setEditInitial(undefined);
      setEditorVisible(true);
      return;
    }
    if (filteredKeys.length === 0) {
      setEditInitial(undefined);
      setEditorVisible(true);
      return;
    }
    const dateKeys = filteredKeys.filter(isDateKey);
    if (dateKeys.length > 0) {
      const latestDate = dateKeys.reduce((max, curr) => curr > max ? curr : max);
      setEditInitial({ start_time: latestDate });
      setEditorVisible(true);
    } else {
      // 没有可见的日期 tab 时，回退到路线自己的「计划日期」（detail.start_time）。
      // 一条已定日期、地点还没排期的（子）路线，加地点应默认落到计划日那天，而不是
      // 统统进 wishlist。计划日期不存在时才真正留空。
      const planned = data?.detail?.start_time ? String(data.detail.start_time).slice(0, 10) : '';
      setEditInitial(planned ? { start_time: planned } : undefined);
      setEditorVisible(true);
    }
  };

  /**
   * 创建嵌套子路线 — RoadmapEditModal 的 onConfirm 回调。
   * 写入新文件（带 `type = "root"; renders = ["roadmap"]` header），
   * 然后把 `[[name]]` 引用插入当前父路线的 items 末尾并持久化。
   * 完成后刷新 subRouteMap 让卡片导航能识别。
   */
  const onCreateSubRoadmap = useCallback(async (payload: RoadmapEditPayload) => {
    if (!data) return;
    const folder = (filePath.split('/').slice(0, -1).join('/')) || 'LaC/Roadmap';
    const name = payload.name.trim();
    if (!name) { new Notice(t('notice.subRoadmapNameRequired')); return; }

    const dup = (data.items || []).some(it => isPlace(it) && (it as Place).name === name);
    if (dup) { new Notice(t('notice.subRoadmapDuplicate')); return; }

    try {
      // 子路线默认继承父路线的 map_provider：用户没在创建弹窗里另选时，把父路线
      // 当前的 provider 写进新子路线文件，省得它掉回全局默认（常和父路线不一致）。
      const subDetail = { ...(payload.detail || {}) };
      if (!subDetail.map_provider && data.detail?.map_provider) {
        subDetail.map_provider = data.detail.map_provider;
      }
      const subFile = await repository.saveSubRoadmapFile(folder, name, subDetail);
      // 把建路线时选定/预填的日期作为父路线里的「每程覆盖」写到 placeRef 上，
      // 这样新子路线与「添加地点」一样落进对应日期的分组，而不是掉进 wishlist。
      const placeRef: Place = {
        id: name,
        name,
        detail: payload.detail?.start_time ? { start_time: payload.detail.start_time } : {},
      };
      const nextItems: Array<Place | RouteSegment> = [...(data.items || []), placeRef];
      await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, nextItems);
      const r = await repository.loadRoadmap(filePath);
      setData(r);
      setSubRouteMap(prev => ({ ...prev, [name]: subFile.path }));
      new Notice(t('notice.subRoadmapCreated', { name }));
    } catch (err) {
      console.warn('[usePlaceMutations] 创建子路线失败', err);
      new Notice(t('notice.subRoadmapCreateFailed'));
    } finally {
      setSubRoadmapEditorVisible(false);
    }
  }, [data, filePath, repository, setData, setSubRouteMap]);

  return {
    editorVisible, setEditorVisible,
    editInitial, setEditInitial,
    subRoadmapEditorVisible, setSubRoadmapEditorVisible,
    addPlaceFromList,
    editPlace,
    deletePlace,
    onSavePlace,
    onCreateSubRoadmap,
  };
}
