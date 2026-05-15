import React, { useEffect, useState, useRef } from 'react';
import { App, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { RoadmapRepository } from '../../repositories/RoadmapRepository';
import { Roadmap, Place, RouteSegment, Address, RoadmapDetail } from '../../types/roadmap';
import { MapLocation } from '../../types/map';
import { RoadmapSettings } from '../../types';
import PlaceEditModal from '../../components/modals/PlaceEditModal';
import ConfirmModal from '../../components/modals/ConfirmModal';
import RouteSegmentEditModal from '../../components/modals/RouteSegmentEditModal';
import { RouteCalculationService } from '../../services/RouteCalculationService';
import { t } from '../../i18n';
import AggregatedMap from '../../components/map/AggregatedMap';
import RouteBadge from '../../components/RouteBadge';
import { isPlace, isRouteSegment } from '../../utils/typeGuards';
import { compareGroupKey, isDateKey } from '../../utils/date';
import { useRoadmapGroups } from './hooks/useRoadmapGroups';
import { usePlaceDragDrop } from './hooks/usePlaceDragDrop';
import { useTabs } from './hooks/useTabs';
import RoadmapEditModal, { RoadmapEditPayload } from '../../components/modals/RoadmapEditModal';
import PlaceCard from './components/PlaceCard';
import type { PlacePoint } from '../../components/PlaceStaticMap';
import RoadmapStats from '../../components/RoadmapStats';
import { exportPlainText, exportICS, exportMarkdown, exportGpx } from '../../services/RoadmapExportService';

/** Haversine 公式 — 大圆距离（米），输入十进制度。 */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Format a straight-line distance for the `+ transit` placeholder.
 *  Returns `undefined` when either endpoint lacks coords so callers can
 *  conditionally omit the trailing chip segment. */
function formatStraightLineDistance(a?: Address, b?: Address): string | undefined {
  if (!a || !b) return undefined;
  if (typeof a.latitude !== 'number' || typeof a.longitude !== 'number') return undefined;
  if (typeof b.latitude !== 'number' || typeof b.longitude !== 'number') return undefined;
  const m = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';
}

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

// PlaceEditModal 保存回调用的 payload 形状（保持与现有行为一致）
interface PlaceEditPayload {
  name: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  address?: MapLocation;
}

// PlaceEditModal initial 形状
interface PlaceEditInitial {
  name?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  address?: MapLocation;
}

export default function RoadmapPage({ app, repository, filePath, settings, leaf: hostLeaf }: Props) {
  const [data, setData] = useState<Roadmap | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editInitial, setEditInitial] = useState<PlaceEditInitial | undefined>(undefined);
  const [metaEditorVisible, setMetaEditorVisible] = useState(false);
  const [tempDayKeys, setTempDayKeys] = useState<string[]>([]);
  // 子路线入口缓存：place id -> file path（仅对 type=root + renders=["roadmap"] 的地点）
  const [subRouteMap, setSubRouteMap] = useState<Record<string, string>>({});
  // 子路线端点缓存：place id → { start, end } 取自 sub roadmap 的 first/last
  // geocoded place address。供 `+ transit` 占位计算直线距离 / 自动路由用。
  const [subEndpoints, setSubEndpoints] = useState<Record<string, { start?: Address; end?: Address }>>({});
  // 路线段编辑弹窗
  const [routeEditState, setRouteEditState] = useState<
    { placeIndex: number; segment: RouteSegment; from?: Place; to?: Place } | null
  >(null);
  // `+ add trip` 触发的子路线创建 modal。落地为带
  // `type = "root"; renders = ["roadmap"]` header 的嵌套文件。
  const [subRoadmapEditorVisible, setSubRoadmapEditorVisible] = useState(false);

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
                  // Cache the sub's first/last geocoded place — used by
                  // the "+ transit" placeholder for the straight-line
                  // distance hint when a route segment is missing.
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
        new Notice('加载路线失败');
      }
    })();
  }, [repository, filePath, app]);

  // 分组（groups / groupKeys / lastPlaceIndex）
  const { groups, groupKeys, lastPlaceIndex } = useRoadmapGroups(data);

  const addPlace = () => {
    setEditInitial(undefined);
    setEditorVisible(true);
  };

  /** 标签栏加号：仅本页临时占位，不修改文件、不创建新地点 */
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

  /**
   * 在新增地点前后自动补 route segment：
   * - 前置地点存在且双方有坐标 → 计算/补 route（计算失败则插空壳并提示）
   * - 后继地点存在且双方有坐标 → 同理
   *
   * 嵌套子路线（type=root + renders=roadmap）作为 place 出现时，
   * 不再用它的 trip-level `detail.address`（往往只是个大区域名）作为
   * 路由端点 — 改用它的 `startPoint`（被路由"指进"时用）/
   * `endPoint`（被路由"指出"时用），即子路线第一/最后一个 geocoded
   * 地点。从父路线视角看：到子路线 = 到它的入口点；
   * 出子路线 = 从它的出口点出发。
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
    let nextIdx = -1;
    for (let i = idx + 1; i < items.length; i++) {
      if (isPlace(items[i])) { nextIdx = i; break; }
    }

    const service = new RouteCalculationService(
      settings?.googleMapsApiKey,
      settings?.gaodeWebServiceKey,
    );
    const provider = (data?.detail?.map_provider || settings?.mapApiProvider || 'google') as 'google' | 'gaode';

    /**
     * 如果 `p` 是 sub-roadmap，加载它的 `startPoint` / `endPoint`，
     * 用对应入口/出口坐标合成一个临时 Place 给路由服务使用。
     * 否则原样返回 `p`。返回值仅供 RouteCalculationService 读 detail.address。
     */
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
        console.warn('[RoadmapPage] resolveEndpoint failed', e);
      }
      return p;
    };

    const buildSeg = async (from: Place, to: Place): Promise<RouteSegment> => {
      try {
        // 父→子时 `to` 用子的 entry；子→父时 `from` 用子的 exit。两端
        // 都可能是 sub-roadmap，所以两边都跑一次 resolveEndpoint。
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
        console.warn('[RoadmapPage] auto route calc failed', e);
      }
      new Notice(t('modal.routeSegment.manualEditHint'));
      return { travelMode: 'drive', distance: 0, duration: 0, tolls: 0 };
    };

    // sub-roadmap 占位也算"有坐标"，因为 resolveEndpoint 会替换为 sub 的端点。
    const isSubRoadmapPlace = (p: Place) => !!subRouteMap[p.id];
    const hasRoutableCoord = (p?: Place) => !!p && (hasCoord(p) || isSubRoadmapPlace(p));

    // prev -> newPlace：若 prev 后无 route 则插入
    if (prevIdx >= 0 && hasRoutableCoord(items[prevIdx] as Place)) {
      const afterPrev = items[prevIdx + 1];
      if (!(afterPrev && !isPlace(afterPrev) && (afterPrev as RouteSegment).travelMode)) {
        const seg = await buildSeg(items[prevIdx] as Place, newPlace);
        items.splice(prevIdx + 1, 0, seg);
      }
    }

    // 重算索引（插入可能前移）
    const idx2 = items.findIndex(it => isPlace(it) && (it as Place).name === newPlace.name);
    if (idx2 < 0) return;

    // newPlace -> next：若 newPlace 后无 route 则插入
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
    void nextIdx;
  };

  const onSavePlace = async (payload: PlaceEditPayload) => {
    if (!data) return;
    const folder = (filePath.split('/').slice(0, -1).join('/')) || 'LaC/Roadmap';

    const isEditMode = !!(editInitial && editInitial.name);
    const alwaysSeparate = settings?.alwaysSeparatePlaceSchedule !== false;

    // 判断该地点是否被多条路线引用
    let multiRef = false;
    if (isEditMode && editInitial?.name) {
      try {
        const refs = await repository.findRoadmapsReferencingPlace(editInitial.name);
        multiRef = refs.filter(p => p !== filePath).length > 0;
      } catch (e) { console.warn('[RoadmapPage] findRoadmapsReferencingPlace failed', e); }
    }
    const separate = alwaysSeparate || multiRef;

    const place: Place = {
      id: payload.name,
      name: payload.name,
      detail: separate ? {
        // 分离模式：地点文件本体不含 start/end_time（由路线文件覆盖）
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
        // 仅更新地点文件通用字段；清理地点本体的 start/end_time
        const origDest = app.metadataCache.getFirstLinkpathDest(editInitial.name, filePath);
        if (origDest && origDest instanceof TFile) {
          // 若改名：重命名文件
          if (payload.name !== editInitial.name) {
            const newPath = `${folder}/${payload.name}.md`;
            try { await app.fileManager.renameFile(origDest, newPath); } catch (e) { console.warn('[RoadmapPage] renameFile failed', e); new Notice('地点重命名失败'); }
          }
          const finalDest = app.metadataCache.getFirstLinkpathDest(payload.name, filePath);
          if (finalDest && finalDest instanceof TFile) {
            await repository.updatePlaceGeneric(finalDest.path, {
              name: payload.name,
              description: payload.description,
              address: payload.address as Address | undefined,
            });
            // 清除地点本体的 start/end_time（避免与覆盖行重复）
            try {
              const raw = await app.vault.read(finalDest);
              const cleaned = raw
                .replace(/^start_time\s*=\s*"[^"]*"\s*\n?/m, '')
                .replace(/^end_time\s*=\s*"[^"]*"\s*\n?/m, '');
              if (cleaned !== raw) await app.vault.modify(finalDest, cleaned);
            } catch (e) { console.warn('[RoadmapPage] cleanup place start/end_time failed', e); }
          }
        } else {
          await repository.savePlaceFile(folder, place);
        }
      } else {
        await repository.savePlaceFile(folder, place);
      }
    } catch (err) {
      console.warn('[RoadmapPage] 保存地点文件失败', err);
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
      // 自动插入 route segment
      await autoInsertRoutesAroundNewPlace(nextItems, place);
    }

    try {
      await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, nextItems);
      // 分离模式：写入时间覆盖行到路线文件
      if (separate) {
        await repository.updatePlaceScheduleInRoadmap(filePath, payload.name, {
          start_time: payload.start_time || null,
          end_time: payload.end_time || null,
        });
      }
      const r = await repository.loadRoadmap(filePath);
      setData(r);
    } catch (err) {
      console.warn('[RoadmapPage] 更新路线文件失败', err);
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
      console.warn('[RoadmapPage] 删除地点失败', err);
      new Notice('删除失败');
    }
  };

  // 选中的 tab 与筛选/可见项逻辑
  const {
    selectedTabs,
    onToggleTab,
    tabDefs,
    filteredKeys,
    mapLocations,
    visibleItemIndices,
    reorderTab,
  } = useTabs({ data, groups, groupKeys, tempDayKeys });

  // Tab 长按拖拽排序（session-only，见 useTabs 中的 TODO）
  const tabLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabDragKeyRef = useRef<string | null>(null);
  const [tabDragActiveKey, setTabDragActiveKey] = useState<string | null>(null);
  const [tabDragOverKey, setTabDragOverKey] = useState<string | null>(null);

  const clearTabLongPress = () => {
    if (tabLongPressTimerRef.current) {
      clearTimeout(tabLongPressTimerRef.current);
      tabLongPressTimerRef.current = null;
    }
  };

  const onTabPointerDown = (key: string | undefined) => {
    if (!key) return;
    clearTabLongPress();
    tabLongPressTimerRef.current = setTimeout(() => {
      tabLongPressTimerRef.current = null;
      tabDragKeyRef.current = key;
      setTabDragActiveKey(key);
    }, 500);
  };
  const onTabPointerUp = () => { clearTabLongPress(); };

  // 列表底部加号：基于当前可见标签的最晚日期
  const addPlaceFromList = () => {
    if (selectedTabs.has('unplanned')) {
      setEditInitial(undefined);
      setEditorVisible(true);
      return;
    }
    if (filteredKeys.length === 0) {
      addPlace();
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

  // 拖拽逻辑抽到 hook
  const {
    didDragRef,
    lastDraggedItemRef,
    droppedOnTabRef,
    onDropToTab,
  } = usePlaceDragDrop({
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
    onDataChanged: setData,
  });

  // 地点状态色与时间格式化：见 helpers.ts

  const openMetaEditor = () => {
    if (!data) return;
    setMetaEditorVisible(true);
  };

  const saveMetaEditor = async (payload: RoadmapEditPayload) => {
    if (!data) return;
    try {
      // 合并：保留未暴露给表单的字段（如未来新增），覆盖表单中的字段
      const nextDetail: RoadmapDetail = { ...(data.detail || {}), ...payload.detail };
      // map_provider 未在 payload 中则视为"跟随全局" → 删除字段
      if (!payload.detail.map_provider) delete nextDetail.map_provider;
      if (!payload.detail.description) delete nextDetail.description;
      if (!payload.detail.start_time) delete nextDetail.start_time;
      if (!payload.detail.end_time) delete nextDetail.end_time;
      if (!payload.detail.address) delete nextDetail.address;
      await repository.updateRoadmapMeta(filePath, payload.name, nextDetail);
      const r = await repository.loadRoadmap(filePath);
      setData(r);
    } catch (err) {
      console.warn('[RoadmapPage] 保存路线元数据失败', err);
      new Notice('保存失败');
    }
    setMetaEditorVisible(false);
  };

  const handleCopyPlainText = async () => {
    if (!data) return;
    try {
      const text = exportPlainText(data);
      await navigator.clipboard.writeText(text);
      new Notice('已复制');
    } catch (e) {
      console.warn('[RoadmapPage] copy failed', e);
      new Notice('复制失败');
    }
  };

  const downloadFile = (text: string, filename: string, mime: string) => {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const handleDownloadICS = () => {
    if (!data) return;
    try { downloadFile(exportICS(data), `${data.name}.ics`, 'text/calendar'); }
    catch (e) { console.warn('[RoadmapPage] ics download failed', e); new Notice('导出失败'); }
  };

  const handleCopyMarkdown = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(exportMarkdown(data));
      new Notice('已复制 Markdown');
    } catch (e) {
      console.warn('[RoadmapPage] markdown copy failed', e);
      new Notice('复制失败');
    }
  };

  const handleDownloadGPX = () => {
    if (!data) return;
    try { downloadFile(exportGpx(data), `${data.name}.gpx`, 'application/gpx+xml'); }
    catch (e) { console.warn('[RoadmapPage] gpx download failed', e); new Notice('导出失败'); }
  };


  /**
   * 创建嵌套子路线 — RoadmapEditModal 的 onConfirm 回调。
   * 写入新文件（带 `type = "root"; renders = ["roadmap"]` header），
   * 然后把 `[[name]]` 引用插入当前父路线的 items 末尾并持久化。
   * 完成后刷新 subRouteMap 让卡片导航能识别。
   */
  const onCreateSubRoadmap = async (payload: RoadmapEditPayload) => {
    if (!data) return;
    const folder = (filePath.split('/').slice(0, -1).join('/')) || 'LaC/Roadmap';
    const name = payload.name.trim();
    if (!name) { new Notice('子路线名称不能为空'); return; }

    // 不允许重名（既是父路线的同名 place，也是 vault 内的同名文件）
    const dup = (data.items || []).some(it => isPlace(it) && (it as Place).name === name);
    if (dup) { new Notice('已有同名地点 / 子路线'); return; }

    try {
      const subFile = await repository.saveSubRoadmapFile(folder, name, payload.detail);
      // 把引用写入父路线
      const placeRef: Place = { id: name, name, detail: {} };
      const nextItems: Array<Place | RouteSegment> = [...(data.items || []), placeRef];
      await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, nextItems);
      // 重新加载 + 刷新 subRouteMap
      const r = await repository.loadRoadmap(filePath);
      setData(r);
      setSubRouteMap(prev => ({ ...prev, [name]: subFile.path }));
      new Notice(`已创建子路线「${name}」`);
    } catch (err) {
      console.warn('[RoadmapPage] 创建子路线失败', err);
      new Notice('创建子路线失败');
    } finally {
      setSubRoadmapEditorVisible(false);
    }
  };

  const goBack = async () => {
    // Use the leaf injected from RoadmapView; fall back to looking it
    // up by view-type + filePath, then to activeLeaf. The injected
    // leaf is the source of truth — `activeLeaf` can drift under
    // focus changes and produce wrong-leaf navigation.
    const leaves = app.workspace.getLeavesOfType('lac-roadmap-view');
    let leaf = hostLeaf
      || leaves.find(l => {
        try { return (l.getViewState()?.state as any)?.filePath === filePath; } catch { return null; }
      })
      || app.workspace.activeLeaf
      || leaves[0];
    if (!leaf) return;

    // Priority 0 — try the leaf's native history first. Every
    // setViewState we issue gets pushed onto leaf.history, so back()
    // is the most accurate "where did the user come from" answer
    // (handles roadmapset → trip → click back, trip → sub-trip → click
    // back, AND any out-of-band navigation Obsidian itself recorded).
    // `history.back` is undocumented but stable across recent
    // Obsidian releases; guard against future removals.
    const history = (leaf as any).history;
    if (history && typeof history.back === 'function') {
      try {
        const before = (leaf.getViewState() as any)?.state?.filePath;
        await history.back();
        const after = (leaf.getViewState() as any)?.state?.filePath;
        // Confirm the back call actually moved us; if not, fall
        // through to the backlinks heuristic below.
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

    // Priority 1 — if the configured entry (the roadmapset) links to this
    // file, that's the "back" target the user expects (roadmapset →
    // roadmap → click back).
    if (backlinks[entryPath]?.[filePath]) {
      if (await navigateTo(entryPath)) return;
    }

    // Priority 2 — any other file that links here (sub-roadmap → parent).
    for (const [sourcePath, links] of Object.entries(backlinks)) {
      if (sourcePath === filePath || sourcePath === entryPath) continue;
      if (links[filePath]) {
        if (await navigateTo(sourcePath)) return;
      }
    }

    // Priority 3 — nothing links here, last-resort fall back to entry.
    await navigateTo(entryPath);
  };

  return (
    <div className="lac-roadmap-root">
      {/* 顶部固定区：标题/统计 → 地图 → 多选标签（严格按 design 顺序）*/}
      <div className="lac-roadmap-header">
        <div className="lac-roadmap-eyebrow-row">
          <button type="button" className="lac-roadmap-back" onClick={goBack} title="返回" aria-label="返回">
            <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
              <polyline points="10 4 6 8 10 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="lac-eyebrow lac-roadmap-eyebrow">trip</div>
        </div>
        {(() => {
          // Tint the serif title by trip status (done / plan / wish), matching
          // PlaceCard's three-state vocabulary.
          const s = data?.detail?.start_time;
          const e = data?.detail?.end_time;
          let kind: 'done' | 'plan' | 'wish' = 'wish';
          if (s || e) {
            const now = new Date();
            try {
              const ed = e ? new Date(String(e).split(' ')[0]) : (s ? new Date(String(s).split(' ')[0]) : null);
              kind = ed && ed.getTime() < now.getTime() ? 'done' : 'plan';
            } catch { kind = 'plan'; }
          }
          const dateRange = (() => {
            if (!s) return '';
            try {
              const sd = new Date(s);
              const fmt = (d: Date) => d.toISOString().slice(5, 10).replace('-', '·'); // MM·DD
              if (!e) return fmt(sd);
              const ed = new Date(e);
              if (sd.getTime() === ed.getTime()) return fmt(sd);
              return `${fmt(sd)} → ${fmt(ed)}`;
            } catch { return ''; }
          })();
          return (
            <div className="lac-roadmap-title-row" onClick={openMetaEditor}>
              <h1 className={`lac-serif lac-roadmap-title lac-roadmap-title--${kind}`}>{data?.name || filePath}</h1>
              {dateRange && <span className="lac-mono lac-roadmap-daterange">{dateRange}</span>}
            </div>
          );
        })()}
        {data?.detail?.description && (
          <div className="lac-serif lac-roadmap-desc">{data.detail.description}</div>
        )}
        <div className="lac-roadmap-stats">
          <RoadmapStats roadmap={data} />
        </div>
        <div className="lac-map-widget">
          <AggregatedMap
            app={app}
            repository={repository}
            settings={settings}
            overrideLocations={mapLocations}
            preferredProvider={data?.detail?.map_provider}
            useNumberedMarkers
          />
        </div>
        {(() => {
          // 三层 day tab：DAY n / 11·01 / count。
          // DAY n 仅给真实日期 tab 编号；temp 日 / 未计划用 ·。count 来自 groups。
          const dateTabNumber = new Map<string, number>();
          let dn = 0;
          for (const t of tabDefs) {
            if (t.key && isDateKey(t.key)) { dn++; dateTabNumber.set(t.id, dn); }
          }
          const tabCount = (id: string, key?: string): number => {
            if (id === 'unplanned') {
              let n = 0;
              for (const k of groupKeys) {
                if (!isDateKey(k)) for (const it of (groups[k] || [])) if (isPlace(it)) n++;
              }
              return n;
            }
            if (!key) return 0;
            let n = 0;
            for (const it of (groups[key] || [])) if (isPlace(it)) n++;
            return n;
          };
          const tabDateLabel = (key: string): string => {
            const m = key.match(/^\d{4}-(\d{2})-(\d{2})$/);
            return m ? `${m[1]}·${m[2]}` : key;
          };
          return (
            <div
              className="lac-tabs"
              onPointerMove={(e) => {
                if (!tabDragKeyRef.current) return;
                const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
                const tabEl = el?.closest?.('[data-tab-key]') as HTMLElement | null;
                const overKey = tabEl?.getAttribute('data-tab-key') || null;
                setTabDragOverKey(overKey);
              }}
              onPointerUp={(e) => {
                const fromKey = tabDragKeyRef.current;
                if (fromKey) {
                  const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
                  const tabEl = el?.closest?.('[data-tab-key]') as HTMLElement | null;
                  const toKey = tabEl?.getAttribute('data-tab-key');
                  if (toKey && toKey !== fromKey) reorderTab(fromKey, toKey);
                }
                tabDragKeyRef.current = null;
                setTabDragActiveKey(null);
                setTabDragOverKey(null);
                clearTabLongPress();
              }}
              onPointerCancel={() => {
                tabDragKeyRef.current = null;
                setTabDragActiveKey(null);
                setTabDragOverKey(null);
                clearTabLongPress();
              }}
            >
              {tabDefs.map(tdef => {
                const dragCls =
                  tdef.key && tabDragActiveKey === tdef.key ? ' lac-tab--dragging' :
                  tdef.key && tabDragOverKey === tdef.key && tabDragActiveKey && tabDragActiveKey !== tdef.key ? ' lac-tab--drag-over' : '';
                const dn = dateTabNumber.get(tdef.id);
                const dayMark = dn != null ? String(dn) : '·';
                const dateLabel = tdef.id === 'unplanned'
                  ? 'wishlist'
                  : (tdef.key && isDateKey(tdef.key) ? tabDateLabel(tdef.key) : tdef.label);
                const count = tabCount(tdef.id, tdef.key);
                return (
                  <button
                    key={tdef.id}
                    data-tab-key={tdef.key || ''}
                    className={`lac-tab ${selectedTabs.has(tdef.id) ? 'active' : ''}${dragCls}`}
                    onClick={() => {
                      // 若刚完成长按拖拽则吞掉 click（避免触发 toggle）
                      if (tabDragActiveKey) return;
                      onToggleTab(tdef.id);
                    }}
                    onPointerDown={() => onTabPointerDown(tdef.key)}
                    onPointerUp={onTabPointerUp}
                    onPointerLeave={onTabPointerUp}
                    {...(tdef.key ? {
                      onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'move'; },
                      onDrop: (e: React.DragEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        droppedOnTabRef.current = true;
                        onDropToTab(tdef.key!);
                      },
                    } : {})}
                  >
                    <span className="lac-day-tab-eyebrow">DAY {dayMark}</span>
                    <span className="lac-day-tab-row">
                      <span className="lac-day-tab-label">{dateLabel}</span>
                      <span className="lac-day-tab-count">{count}</span>
                    </span>
                  </button>
                );
              })}
              <button className="lac-tab lac-tab--add" onClick={addDayOnly} title="添加一天">+ day</button>
            </div>
          );
        })()}
      </div>

      {/* 列表滚动区 — 字段日记式 timeline (spine + 编号小圆 via CSS counters) */}
      <div className="lac-roadmap-list-wrapper">
        <div className="lac-card-list lac-card-list--timeline" ref={cardListRef}>
          {data && (() => {
            // Precompute day-number map for date keys (matches the tab
            // strip's `DAY n` numbering). Non-date keys (`第N天`) keep
            // their original label. Then derive per-place day-eyebrow
            // labels: the first visible place of each day gets one;
            // continuations within the same day get `undefined`.
            const dayNumberMap = new Map<string, number>();
            let dn = 0;
            for (const k of groupKeys) {
              if (isDateKey(k)) { dn++; dayNumberMap.set(k, dn); }
            }
            const keyForPlace = (pl: Place): string => {
              const start = pl.detail?.start_time;
              return start ? String(start).split(' ')[0] : `第${pl.detail?.days ?? 1}天`;
            };
            const labelForKey = (k: string): string => {
              if (!k) return 'wishlist';
              if (isDateKey(k)) {
                const n = dayNumberMap.get(k);
                return n != null ? `DAY ${n}` : k;
              }
              return k; // `第N天`
            };
            const dayLabels: Array<string | undefined> = [];
            let prevKey = '';
            for (let i = 0; i < visibleItemIndices.length; i++) {
              const pl = data.items[visibleItemIndices[i]] as Place;
              const k = keyForPlace(pl);
              dayLabels.push(k !== prevKey ? labelForKey(k) : undefined);
              prevKey = k;
            }

            // Build the trip-wide place list (geocoded only, in source
            // order). Every card thumbnail receives this same list and
            // a per-card `tripIndex` pointing at its own place — the
            // thumbnails then render the multi-point numbered map with
            // each card's place highlighted.
            const tripPlaces: PlacePoint[] = [];
            const tripIndexByItem = new Map<number, number>();
            for (let i = 0; i < data.items.length; i++) {
              const it = data.items[i];
              if (!isPlace(it)) continue;
              const addr = it.detail?.address;
              if (addr && typeof addr.latitude === 'number' && typeof addr.longitude === 'number') {
                tripIndexByItem.set(i, tripPlaces.length);
                tripPlaces.push({
                  lat: addr.latitude,
                  lng: addr.longitude,
                  coordinate_system: addr.coordinate_system,
                });
              }
            }

            return visibleItemIndices.map((itemIndex, visIdx) => {
            const p = data.items[itemIndex] as Place;
            const nextItem = data.items[itemIndex + 1];
            const routeAfter = isRouteSegment(nextItem) ? nextItem : undefined;
            const hasNextVisible = visIdx < visibleItemIndices.length - 1;
            const dayLabel = dayLabels[visIdx];
            const tripIndex = tripIndexByItem.get(itemIndex) ?? -1;

            const handleCardClick = async () => {
              if (didDragRef.current && lastDraggedItemRef.current === itemIndex) {
                didDragRef.current = false;
                lastDraggedItemRef.current = null;
                return;
              }
              const subPath = subRouteMap[p.id];
              if (subPath) {
                const leaf = hostLeaf || app.workspace.activeLeaf;
                if (leaf) {
                  await leaf.setViewState({ type: 'lac-roadmap-view', state: { filePath: subPath }, active: true });
                  app.workspace.revealLeaf(leaf);
                }
                return;
              }
              editPlace(p);
            };

            return (
              <React.Fragment key={`${p.id}-${itemIndex}`}>
                <PlaceCard
                  place={p}
                  itemIndex={itemIndex}
                  groups={groups}
                  settings={settings}
                  mapProvider={data?.detail?.map_provider}
                  onClick={handleCardClick}
                  dayLabel={dayLabel}
                  tripPlaces={tripPlaces}
                  tripIndex={tripIndex}
                />
                {hasNextVisible && routeAfter && (
                  <RouteBadge
                    segment={routeAfter}
                    onClick={() => {
                      // 找"后一个地点"（route 的终点）
                      let nextPlace: Place | undefined;
                      for (let j = itemIndex + 2; j < (data?.items.length || 0); j++) {
                        const it = data!.items[j];
                        if (isPlace(it)) { nextPlace = it; break; }
                      }
                      setRouteEditState({
                        placeIndex: itemIndex,
                        segment: routeAfter,
                        from: p,
                        to: nextPlace,
                      });
                    }}
                  />
                )}
                {/* "+ transit" 占位 — 相邻可见 place 之间没有 RouteSegment 时
                    渲染一个 dashed 安静胶囊，点击开 RouteSegmentEditModal
                    （传入空 segment + from/to 让用户填）。位置 / 类名跟
                    `.lac-route-badge` 一致，由 spine 规则统一对齐。 */}
                {hasNextVisible && !routeAfter && (() => {
                  const nextVisibleIdx = visibleItemIndices[visIdx + 1];
                  const nextPlace = data!.items[nextVisibleIdx] as Place | undefined;
                  // 端点解析：当前 place 用 "exit"（路由出口）；下一个 place
                  // 用 "entry"（路由入口）。Sub-roadmap 用缓存，否则用自身坐标。
                  const fromCoord = subEndpoints[p.id]?.end || p.detail?.address;
                  const toCoord = nextPlace ? (subEndpoints[nextPlace.id]?.start || nextPlace.detail?.address) : undefined;
                  const distLabel = formatStraightLineDistance(fromCoord, toCoord);
                  return (
                    <div
                      className="lac-route-badge lac-route-badge--add lac-route-badge--clickable"
                      data-no-drag="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRouteEditState({
                          placeIndex: itemIndex,
                          // 空 segment：travelMode 默认 drive、其它字段 0；
                          // modal 里可改 travel mode + 距离/时长。
                          segment: { travelMode: 'drive', distance: 0, duration: 0, tolls: 0 },
                          from: p,
                          to: nextPlace,
                        });
                      }}
                    >
                      <span className="lac-route-badge-mode">+ transit</span>
                      {distLabel && (
                        <>
                          <span className="lac-route-badge-sep">·</span>
                          <span>{distLabel}</span>
                        </>
                      )}
                    </div>
                  );
                })()}
              </React.Fragment>
            );
          });
          })()}
        </div>
        <div className="lac-roadmap-actions">
          {/* 两枚并排按钮 — `+ add place` 加普通地点（leaf）、`+ add trip`
              开 RoadmapEditModal 创建嵌套子路线（type=root, renders=roadmap）。
              都是 dashed 安静按钮 + flex:1 等宽。 */}
          <button type="button" className="lac-btn--quiet lac-btn--add-place" onClick={addPlaceFromList} title="添加地点">+ add place</button>
          <button type="button" className="lac-btn--quiet lac-btn--add-place" onClick={() => setSubRoadmapEditorVisible(true)} title="添加子路线">+ add trip</button>
        </div>
      </div>

      <PlaceEditModal
        visible={editorVisible}
        settings={settings}
        initial={editInitial}
        onCancel={() => setEditorVisible(false)}
        onConfirm={onSavePlace}
        onDelete={editInitial?.name && data ? async () => {
          const p = (data.items || []).find(it => isPlace(it) && it.name === editInitial!.name) as Place | undefined;
          if (p) {
            await deletePlace(p);
            setEditorVisible(false);
            setEditInitial(undefined);
          }
        } : undefined}
        routeLocations={(() => {
          // All geocoded places — INCLUDING the place currently being
          // edited — so MapSelector can show its own numbered marker
          // in the trip context. Clicking the map then physically moves
          // that marker to the new spot (MapSelector handles the swap),
          // instead of leaving an old red pin offset from a numbered
          // pin (image copy 36.png).
          if (!data) return undefined;
          const list: MapLocation[] = [];
          for (const it of data.items) {
            if (!isPlace(it)) continue;
            const loc = it.detail?.address as MapLocation | undefined;
            if (loc && typeof loc.longitude === 'number' && typeof loc.latitude === 'number') {
              list.push({ ...loc, name: loc.name || (it as Place).name });
            }
          }
          return list.length ? list : undefined;
        })()}
      />

      {/* 编辑路线段弹窗 */}
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
            new Notice(t('modal.routeSegment.calcFailedShort'));
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

      {/* 编辑路线元数据弹窗 */}
      <RoadmapEditModal
        visible={metaEditorVisible}
        mode="edit"
        settings={settings}
        initial={data ? { name: data.name, detail: data.detail } : undefined}
        items={data?.items}
        onCancel={() => setMetaEditorVisible(false)}
        onConfirm={saveMetaEditor}
      />

      {/* 创建嵌套子路线 — `+ add place` 旁的 `+ new trip` 菜单项触发。
          走纯创建模式（不传 initial / items），保存到新文件并把 [[name]]
          引用插回父路线。 */}
      <RoadmapEditModal
        visible={subRoadmapEditorVisible}
        mode="create"
        settings={settings}
        onCancel={() => setSubRoadmapEditorVisible(false)}
        onConfirm={onCreateSubRoadmap}
      />
    </div>
  );
}
