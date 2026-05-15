import { useState, useCallback } from 'react';
import { App, Notice, TFile } from 'obsidian';
import { Roadmap, Place, RouteSegment, Address, RoadmapDetail } from '../../../types/roadmap';
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
  editPlace: (p: Place) => void;
  deletePlace: (p: Place) => Promise<void>;
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
   * 在新增地点前后自动补 route segment：
   * - 前置地点存在且双方有坐标 → 计算/补 route（计算失败则插空壳并提示）
   * - 后继地点存在且双方有坐标 → 同理
   *
   * 嵌套子路线（type=root + renders=roadmap）作为 place 出现时，
   * 不再用它的 trip-level `detail.address`（往往只是个大区域名）作为
   * 路由端点 — 改用它的 `startPoint`（被路由"指进"时用）/
   * `endPoint`（被路由"指出"时用），即子路线第一/最后一个 geocoded
   * 地点。
   */
  const autoInsertRoutesAroundNewPlace = async (
    items: Array<Place | RouteSegment>,
    newPlace: Place,
  ) => {
    const hasCoord = (p?: Place) =>
      !!p?.detail?.address &&
      typeof p.detail.address.longitude === 'number' &&
      typeof p.detail.address.latitude === 'number';
    if (!hasCoord(newPlace)) return;

    const idx = items.findIndex(it => isPlace(it) && (it as Place).name === newPlace.name);
    if (idx < 0) return;

    let prevIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (isPlace(items[i])) { prevIdx = i; break; }
    }

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

    const buildSeg = async (from: Place, to: Place): Promise<RouteSegment> => {
      try {
        const fromEff = await resolveEndpoint(from, 'exit');
        const toEff = await resolveEndpoint(to, 'entry');
        const result = await service.calculateRoute(fromEff, toEff, 'drive', provider);
        if (result) {
          return {
            travelMode: result.travelMode,
            distance: result.distance,
            duration: result.duration,
            tolls: typeof result.tolls === 'number' ? result.tolls : 0,
          };
        }
      } catch (e) {
        console.warn('[usePlaceMutations] auto route calc failed', e);
      }
      new Notice(t('modal.routeSegment.manualEditHint'));
      return { travelMode: 'drive', distance: 0, duration: 0, tolls: 0 };
    };

    const isSubRoadmapPlace = (p: Place) => !!subRouteMap[p.id];
    const hasRoutableCoord = (p?: Place) => !!p && (hasCoord(p) || isSubRoadmapPlace(p));

    if (prevIdx >= 0 && hasRoutableCoord(items[prevIdx] as Place)) {
      const afterPrev = items[prevIdx + 1];
      if (!(afterPrev && !isPlace(afterPrev) && (afterPrev as RouteSegment).travelMode)) {
        const seg = await buildSeg(items[prevIdx] as Place, newPlace);
        items.splice(prevIdx + 1, 0, seg);
      }
    }

    const idx2 = items.findIndex(it => isPlace(it) && (it as Place).name === newPlace.name);
    if (idx2 < 0) return;

    let nextIdx2 = -1;
    for (let i = idx2 + 1; i < items.length; i++) {
      if (isPlace(items[i])) { nextIdx2 = i; break; }
    }
    if (nextIdx2 >= 0 && hasRoutableCoord(items[nextIdx2] as Place)) {
      const afterNew = items[idx2 + 1];
      if (!(afterNew && !isPlace(afterNew) && (afterNew as RouteSegment).travelMode)) {
        const seg = await buildSeg(newPlace, items[nextIdx2] as Place);
        items.splice(idx2 + 1, 0, seg);
      }
    }
  };

  const onSavePlace = async (payload: PlaceEditPayload) => {
    if (!data) return;
    const folder = (filePath.split('/').slice(0, -1).join('/')) || 'LaC/Roadmap';

    const isEditMode = !!(editInitial && editInitial.name);
    const alwaysSeparate = settings?.alwaysSeparatePlaceSchedule !== false;

    let multiRef = false;
    if (isEditMode && editInitial?.name) {
      try {
        const refs = await repository.findRoadmapsReferencingPlace(editInitial.name);
        multiRef = refs.filter(p => p !== filePath).length > 0;
      } catch (e) { console.warn('[usePlaceMutations] findRoadmapsReferencingPlace failed', e); }
    }
    const separate = alwaysSeparate || multiRef;

    const place: Place = {
      id: payload.name,
      name: payload.name,
      detail: separate ? {
        description: payload.description,
        address: payload.address as Address | undefined,
      } : {
        start_time: payload.start_time,
        end_time: payload.end_time,
        description: payload.description,
        address: payload.address as Address | undefined,
      },
    };
    try {
      if (separate && isEditMode && editInitial?.name) {
        const origDest = app.metadataCache.getFirstLinkpathDest(editInitial.name, filePath);
        if (origDest && origDest instanceof TFile) {
          if (payload.name !== editInitial.name) {
            const newPath = `${folder}/${payload.name}.md`;
            try { await app.fileManager.renameFile(origDest, newPath); } catch (e) { console.warn('[usePlaceMutations] renameFile failed', e); new Notice('地点重命名失败'); }
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
      new Notice('保存地点失败');
      return;
    }

    const isEdit = !!(editInitial && editInitial.name);
    const originalName = isEdit ? editInitial!.name : null;

    let nextItems: Array<Place | RouteSegment>;
    if (isEdit && originalName && originalName !== payload.name) {
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
    } else if (isEdit && originalName) {
      nextItems = data.items.map(it => {
        if (isPlace(it) && it.name === originalName) return place;
        return it;
      });
    } else {
      const base = data.items || [];
      const newTime = payload.start_time ? new Date(payload.start_time).getTime() : NaN;
      let insertIdx = base.length;
      if (!isNaN(newTime)) {
        for (let i = 0; i < base.length; i++) {
          const it = base[i];
          if (isPlace(it)) {
            const t = it.detail?.start_time ? new Date(it.detail.start_time).getTime() : NaN;
            if (!isNaN(t) && t > newTime) { insertIdx = i; break; }
          }
        }
      }
      nextItems = [...base.slice(0, insertIdx), place, ...base.slice(insertIdx)];
      await autoInsertRoutesAroundNewPlace(nextItems, place);
    }

    try {
      await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, nextItems);
      if (separate) {
        await repository.updatePlaceScheduleInRoadmap(filePath, payload.name, {
          start_time: payload.start_time || null,
          end_time: payload.end_time || null,
        });
      }
      const r = await repository.loadRoadmap(filePath);
      setData(r);
    } catch (err) {
      console.warn('[usePlaceMutations] 更新路线文件失败', err);
      new Notice('更新路线失败');
    }
    setEditorVisible(false);
    setEditInitial(undefined);
  };

  const editPlace = (p: Place) => {
    setEditInitial({
      name: p.name,
      start_time: p.detail?.start_time,
      end_time: p.detail?.end_time,
      description: p.detail?.description,
      address: p.detail?.address,
    });
    setEditorVisible(true);
  };

  const deletePlace = async (p: Place) => {
    const modal = new ConfirmModal(`删除地点「${p.name}」？`, '删除', '取消', true);
    const ok = await modal.open();
    if (!ok || !data) return;
    const remaining: Array<Place | RouteSegment> = [];
    for (let i = 0; i < data.items.length; i++) {
      const it = data.items[i];
      if (isPlace(it) && it.name === p.name) {
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
    } catch (err) {
      console.warn('[usePlaceMutations] 删除地点失败', err);
      new Notice('删除失败');
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
      setEditInitial(undefined);
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
    if (!name) { new Notice('子路线名称不能为空'); return; }

    const dup = (data.items || []).some(it => isPlace(it) && (it as Place).name === name);
    if (dup) { new Notice('已有同名地点 / 子路线'); return; }

    try {
      const subFile = await repository.saveSubRoadmapFile(folder, name, payload.detail);
      const placeRef: Place = { id: name, name, detail: {} };
      const nextItems: Array<Place | RouteSegment> = [...(data.items || []), placeRef];
      await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, nextItems);
      const r = await repository.loadRoadmap(filePath);
      setData(r);
      setSubRouteMap(prev => ({ ...prev, [name]: subFile.path }));
      new Notice(`已创建子路线「${name}」`);
    } catch (err) {
      console.warn('[usePlaceMutations] 创建子路线失败', err);
      new Notice('创建子路线失败');
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
