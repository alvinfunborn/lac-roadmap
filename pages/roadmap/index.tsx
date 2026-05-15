import React, { useEffect, useRef, useState } from 'react';
import { App, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { RoadmapRepository } from '../../repositories/RoadmapRepository';
import { Roadmap, Place, RouteSegment, Address, RoadmapDetail } from '../../types/roadmap';
import { RoadmapSettings } from '../../types';
import PlaceEditModal from '../../components/modals/PlaceEditModal';
import RouteSegmentEditModal from '../../components/modals/RouteSegmentEditModal';
import RoadmapEditModal, { RoadmapEditPayload } from '../../components/modals/RoadmapEditModal';
import { isPlace } from '../../utils/typeGuards';
import { compareGroupKey, isDateKey } from '../../utils/date';
import { exportPlainText, exportICS, exportMarkdown, exportGpx } from '../../services/RoadmapExportService';
import { MapLocation } from '../../types/map';

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
        new Notice('加载路线失败');
      }
    })();
  }, [repository, filePath, app]);

  const { groups, groupKeys, lastPlaceIndex } = useRoadmapGroups(data);

  const {
    selectedTabs, onToggleTab, tabDefs, filteredKeys,
    mapLocations, visibleItemIndices, reorderTab,
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

  const saveMetaEditor = async (payload: RoadmapEditPayload) => {
    if (!data) return;
    try {
      const nextDetail: RoadmapDetail = { ...(data.detail || {}), ...payload.detail };
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

  // Export handlers — wired into RoadmapActions' export menu.
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
  const exportItems = data ? [
    { label: 'copy plain text', onClick: async () => {
      try { await navigator.clipboard.writeText(exportPlainText(data)); new Notice('已复制'); }
      catch (e) { console.warn('[RoadmapPage] copy failed', e); new Notice('复制失败'); }
    } },
    { label: 'copy markdown', onClick: async () => {
      try { await navigator.clipboard.writeText(exportMarkdown(data)); new Notice('已复制 Markdown'); }
      catch (e) { console.warn('[RoadmapPage] markdown copy failed', e); new Notice('复制失败'); }
    } },
    { label: 'download .ics', onClick: () => {
      try { downloadFile(exportICS(data), `${data.name}.ics`, 'text/calendar'); }
      catch (e) { console.warn('[RoadmapPage] ics download failed', e); new Notice('导出失败'); }
    } },
    { label: 'download .gpx', onClick: () => {
      try { downloadFile(exportGpx(data), `${data.name}.gpx`, 'application/gpx+xml'); }
      catch (e) { console.warn('[RoadmapPage] gpx download failed', e); new Notice('导出失败'); }
    } },
  ] : undefined;

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
  const handlePlaceClick = async (p: Place, _itemIndex: number) => {
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
    places.editPlace(p);
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
        list.push({ ...loc, name: loc.name || (it as Place).name });
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
        />
        <DayTabsStrip
          tabDefs={tabDefs}
          groups={groups}
          groupKeys={groupKeys}
          selectedTabs={selectedTabs}
          onToggleTab={onToggleTab}
          addDayOnly={addDayOnly}
          reorderTab={reorderTab}
          onDropToTab={onDropToTab}
          droppedOnTabRef={droppedOnTabRef}
        />
      </div>

      <div className="lac-roadmap-list-wrapper">
        {data && (
          <Timeline
            data={data}
            visibleItemIndices={visibleItemIndices}
            groupKeys={groupKeys}
            groups={groups}
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
          exportItems={exportItems}
        />
      </div>

      <PlaceEditModal
        visible={places.editorVisible}
        settings={settings}
        initial={places.editInitial}
        onCancel={() => places.setEditorVisible(false)}
        onConfirm={places.onSavePlace}
        onDelete={places.editInitial?.name && data ? async () => {
          const p = (data.items || []).find(it => isPlace(it) && it.name === places.editInitial!.name) as Place | undefined;
          if (p) {
            await places.deletePlace(p);
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
            new Notice('更新路线段失败');
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
    </div>
  );
}
