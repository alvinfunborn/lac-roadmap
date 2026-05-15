import React, { useCallback, useEffect, useRef, useState } from 'react';
import CardCalendar, { buildDailyCounts } from '../../components/CardCalendar';
import StaticMap from '../../components/StaticMap';
import { App, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { RoadmapRepository } from '../../repositories/RoadmapRepository';
import { Roadmap } from '../../types/roadmap';
import MapSelector from '../../components/map/MapSelector';
import AggregatedMap from '../../components/map/AggregatedMap';
import ConfirmModal from '../../components/modals/ConfirmModal';
import RoadmapEditModal, { RoadmapEditPayload } from '../../components/modals/RoadmapEditModal';
import { RoadmapSetStats, computeRoadmapStats } from '../../components/RoadmapStats';
import { startOfDay, formatYMD, parseDateOrNull } from '../../utils/date';

// 与 pages/roadmap 一致：用 Sortable.js 接管未安排区卡片的排序，
// 这样能复用 ghost / chosen / drag 样式，提供释放预览与平滑动画。
type SortableInstance = { destroy: () => void };
type SortableFactory = { create: (el: HTMLElement, opts?: object) => SortableInstance };
const SortableLib = require('sortablejs') as SortableFactory & { default?: SortableFactory };
const Sortable: SortableFactory = SortableLib.default ?? SortableLib;

interface Props {
  app: App;
  repository: RoadmapRepository;
  settings: any;
  /** The WorkspaceLeaf hosting this view — passed in by RoadmapView so
   *  navigation calls operate on the *exact* leaf showing this page,
   *  rather than going through `app.workspace.getLeaf()` which can
   *  silently spawn a new tab if the active leaf isn't what we expect. */
  leaf?: WorkspaceLeaf;
}

// StaticMap 组件、坐标转换工具、日历日期辅助函数已分别抽到
// components/StaticMap.tsx 与 utils/date.ts，保持本文件专注于页面组合。

// 2.1 卡片排序：未安排在上、已安排在下；未安排区文本倒序；已安排区时间倒序、同时间文本倒序
function sortRoadmaps(loaded: Roadmap[], ids: string[]): Roadmap[] {
  const orderInMd: Record<string, number> = {};
  ids.forEach((id, i) => { orderInMd[id] = i; });
  const isUnplanned = (r: Roadmap) => !r.detail?.start_time && !r.detail?.end_time;
  return loaded.slice().sort((a, b) => {
    const ua = isUnplanned(a);
    const ub = isUnplanned(b);
    if (ua !== ub) return ua ? -1 : 1;
    if (ua) return (orderInMd[b.id] ?? 0) - (orderInMd[a.id] ?? 0); // 未安排：文本倒序
    const ta = parseDateOrNull(a.detail?.start_time || a.detail?.end_time)?.getTime() ?? 0;
    const tb = parseDateOrNull(b.detail?.start_time || b.detail?.end_time)?.getTime() ?? 0;
    if (ta !== tb) return tb - ta; // 已安排：时间倒序
    return (orderInMd[b.id] ?? 0) - (orderInMd[a.id] ?? 0); // 同时间：文本倒序
  });
}

// per-roadmap counts have been moved to component and re-exported for reuse above

// NOTE: CardCalendar moved out.

export default function RoadmapSetPage({ app, repository, settings, leaf }: Props) {
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [mapVisible, setMapVisible] = useState(false);
  const [globalCounts, setGlobalCounts] = useState<Record<string, number>>({});
  const [globalRangeDays, setGlobalRangeDays] = useState<Record<string, true>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; roadmap: Roadmap } | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  // 防止 Sortable 拖拽结束时的 pointerup 触发卡片 onClick → 误打开 roadmap
  const didDragRef = useRef(false);

  useEffect(() => {
    (async () => {
      const ids = await repository.loadRoadmapSet();
      const roadmapPromises = ids.map(async (id) => {
        const dest = app.metadataCache.getFirstLinkpathDest(id, repository.getRootPath());
        if (dest && dest instanceof TFile) {
          return await repository.loadRoadmap(dest.path);
        }
        return null;
      });
      const loaded = (await Promise.all(roadmapPromises)).filter(Boolean) as Roadmap[];
      const loadedRoadmaps = sortRoadmaps(loaded, ids);
      setRoadmaps(loadedRoadmaps);
      // build global counts across all roadmaps places
      const merged: Record<string, number> = {};
      const rangeDays: Record<string, true> = {};
      for (const rm of loadedRoadmaps) {
        // place counts
        const local = buildDailyCounts(rm);
        Object.keys(local).forEach(k => { merged[k] = (merged[k] || 0) + local[k]; });
        // range days from roadmap start~end
        const rs = parseDateOrNull(rm.detail?.start_time);
        const re = parseDateOrNull(rm.detail?.end_time);
        if (rs && re) {
          const s = startOfDay(rs);
          const e = startOfDay(re);
          for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
            rangeDays[formatYMD(d)] = true;
          }
        }
      }
      setGlobalCounts(merged);
      setGlobalRangeDays(rangeDays);
    })();
  }, [repository, app]);

  const handleAdd = () => {
    setEditModalVisible(true);
  };

  const onConfirmCreate = async (payload: RoadmapEditPayload) => {
    const folder = (repository.getRootPath().split('/').slice(0, -1).join('/')) || 'LaC/Roadmap';
    await repository.createRoadmapFile(folder, payload.name, payload.detail);
    await repository.addRoadmapToSet(payload.name);
    const ids = await repository.loadRoadmapSet();
    const roadmapPromises = ids.map(async (id) => {
      const dest = app.metadataCache.getFirstLinkpathDest(id, repository.getRootPath());
      if (dest && dest instanceof TFile) {
        return await repository.loadRoadmap(dest.path);
      }
      return null;
    });
    const loaded = (await Promise.all(roadmapPromises)).filter(Boolean) as Roadmap[];
    setRoadmaps(sortRoadmaps(loaded, ids));
    setEditModalVisible(false);
  };

  /** Resolve the leaf to navigate on. Prefer the leaf RoadmapView injected
   *  via props (always the right answer when present). Fall back through
   *  any existing lac-roadmap-view leaf before resorting to
   *  `getLeaf(false)` — the latter returns whatever's currently active,
   *  which under focus drift can be a totally unrelated markdown leaf,
   *  producing the "card click opens a new page" symptom. */
  const resolveTargetLeaf = (): WorkspaceLeaf => {
    return leaf
      || app.workspace.getLeavesOfType('lac-roadmap-view')[0]
      || app.workspace.getLeaf(false);
  };

  const openRoadmap = async (roadmap: Roadmap) => {
    try {
      const dest = app.metadataCache.getFirstLinkpathDest(roadmap.id, repository.getRootPath());
      if (dest && dest instanceof TFile) {
        const target = resolveTargetLeaf();
        await target.setViewState({ type: 'lac-roadmap-view', state: { filePath: dest.path }, active: true });
        app.workspace.revealLeaf(target);
      }
    } catch (err) { console.warn('[RoadmapSetPage] openRoadmap failed', err); }
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.('.lac-context-menu')) close();
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [contextMenu]);

  const handleDeleteRoadmap = async (roadmap: Roadmap) => {
    setContextMenu(null);
    const modal = new ConfirmModal(`从集合中移除「${roadmap.name}」？`, '删除', '取消', true);
    const ok = await modal.open();
    if (!ok) return;
    const ids = await repository.loadRoadmapSet();
    const newIds = ids.filter(id => id !== roadmap.id);
    await repository.updateRootFile(newIds);
    const roadmapPromises = newIds.map(async (id) => {
      const dest = app.metadataCache.getFirstLinkpathDest(id, repository.getRootPath());
      if (dest && dest instanceof TFile) return await repository.loadRoadmap(dest.path);
      return null;
    });
    const loaded = (await Promise.all(roadmapPromises)).filter(Boolean) as Roadmap[];
    setRoadmaps(sortRoadmaps(loaded, newIds));
  };

  const handleDeleteRoadmapPermanently = async (roadmap: Roadmap) => {
    setContextMenu(null);
    const confirm1 = await new ConfirmModal(
      `彻底删除「${roadmap.name}」并将其 .md 文件移入回收站？`,
      '继续',
      '取消',
      true,
    ).open();
    if (!confirm1) return;
    const confirm2 = await new ConfirmModal(
      `此操作不可撤销。文件中的地点引用本身（[[...]]）保留为孤立链接。再次确认彻底删除「${roadmap.name}」？`,
      '彻底删除',
      '取消',
      true,
    ).open();
    if (!confirm2) return;

    const dest = app.metadataCache.getFirstLinkpathDest(roadmap.id, repository.getRootPath());
    if (!dest || !(dest instanceof TFile)) {
      new Notice('未找到对应的 .md 文件');
      return;
    }
    try {
      await app.fileManager.trashFile(dest);
    } catch (e) {
      console.warn('[RoadmapSetPage] trashFile failed', e);
      new Notice('删除文件失败');
      return;
    }
    // 同步移除根集合中的引用
    const ids = await repository.loadRoadmapSet();
    const newIds = ids.filter(id => id !== roadmap.id);
    await repository.updateRootFile(newIds);
    const roadmapPromises = newIds.map(async (id) => {
      const d = app.metadataCache.getFirstLinkpathDest(id, repository.getRootPath());
      if (d && d instanceof TFile) return await repository.loadRoadmap(d.path);
      return null;
    });
    const loaded = (await Promise.all(roadmapPromises)).filter(Boolean) as Roadmap[];
    setRoadmaps(sortRoadmaps(loaded, newIds));
    new Notice(`已彻底删除「${roadmap.name}」`);
  };

  const handleCopyRoadmap = async (roadmap: Roadmap) => {
    setContextMenu(null);
    const newName = roadmap.name + ' 副本';
    const folder = (repository.getRootPath().split('/').slice(0, -1).join('/')) || 'LaC/Roadmap';
    const newFilePath = await repository.createRoadmapFile(folder, newName, roadmap.detail);
    await repository.updateRoadmapItems(newFilePath, newName, roadmap.detail || {}, roadmap.items);
    await repository.addRoadmapToSet(newName);
    const ids = await repository.loadRoadmapSet();
    const roadmapPromises = ids.map(async (id) => {
      const dest = app.metadataCache.getFirstLinkpathDest(id, repository.getRootPath());
      if (dest && dest instanceof TFile) return await repository.loadRoadmap(dest.path);
      return null;
    });
    const loaded = (await Promise.all(roadmapPromises)).filter(Boolean) as Roadmap[];
    setRoadmaps(sortRoadmaps(loaded, ids));
    const dest = app.metadataCache.getFirstLinkpathDest(newName, repository.getRootPath());
    if (dest && dest instanceof TFile) {
      const target = resolveTargetLeaf();
      await target.setViewState({ type: 'lac-roadmap-view', state: { filePath: dest.path }, active: true });
      app.workspace.revealLeaf(target);
    }
  };

  const showContextMenu = (e: React.MouseEvent, roadmap: Roadmap) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, roadmap });
  };

  const onCardPointerDown = (roadmap: Roadmap) => {
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      setContextMenu({ x: window.innerWidth / 2 - 60, y: window.innerHeight / 2 - 40, roadmap });
    }, 500);
  };

  const onCardPointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // 2.2 拖拽：仅未安排可拖拽，松手后写回根文件 [[...]] 顺序。
  // 用 Sortable.js（与 pages/roadmap 一致），自带释放预览（ghost）+ 动画。
  const isUnplanned = (r: Roadmap) => !r.detail?.start_time && !r.detail?.end_time;
  const unarrangedCount = roadmaps.filter(isUnplanned).length;

  const applyReorder = useCallback(async (from: number, to: number) => {
    if (from === to) return;
    if (from >= unarrangedCount || to >= unarrangedCount) return;
    const unarranged = roadmaps.slice(0, unarrangedCount);
    const arranged = roadmaps.slice(unarrangedCount);
    const [moved] = unarranged.splice(from, 1);
    unarranged.splice(to, 0, moved);
    const ids = await repository.loadRoadmapSet();
    const arrangedIds = ids.filter(id => {
      const r = roadmaps.find(rm => rm.id === id);
      return r && !isUnplanned(r);
    });
    // 未安排区在 UI 中按 md 顺序倒序展示，所以写回时再倒序回去。
    const newUnarrangedForRoot = unarranged.map(r => r.id).reverse();
    const newIds = [...newUnarrangedForRoot, ...arrangedIds];
    await repository.updateRootFile(newIds);
    setRoadmaps([...unarranged, ...arranged]);
  }, [roadmaps, unarrangedCount, repository]);

  // ref 让 Sortable 始终调到最新闭包，避免每次 roadmaps 变化都重建 Sortable 实例。
  const applyReorderRef = useRef<(from: number, to: number) => Promise<void>>(async () => {});
  applyReorderRef.current = applyReorder;

  useEffect(() => {
    const el = cardListRef.current;
    if (!el) return;
    const so = Sortable.create(el, {
      animation: 150,
      draggable: '.lac-card--compact',
      ghostClass: 'lac-sortable-ghost',
      chosenClass: 'lac-sortable-chosen',
      dragClass: 'lac-sortable-drag',
      // 只允许放在另一张 compact 卡片旁——eyebrow / planned 卡片不是 compact，
      // 自动拒绝为放置目标，防止越过未安排区边界。
      onMove: (evt: { related: HTMLElement }) =>
        evt.related instanceof HTMLElement && evt.related.classList.contains('lac-card--compact'),
      onEnd: (evt: {
        item: HTMLElement;
        oldIndex?: number;
        newIndex?: number;
        oldDraggableIndex?: number;
        newDraggableIndex?: number;
        from: HTMLElement;
      }) => {
        const { item, oldIndex, newIndex, oldDraggableIndex, newDraggableIndex, from: fromEl } = evt;
        if (oldIndex == null || newIndex == null) return;
        if (oldDraggableIndex == null || newDraggableIndex == null) return;
        if (oldIndex === newIndex) return;
        // 先把 Sortable 物理移动的节点放回原位，再由 React 用新数据重排——
        // 否则 React 的虚拟 DOM diff 会叠加在 Sortable 已应用的移动上（与 pages/roadmap 同款问题）。
        const children = Array.from(fromEl.children) as HTMLElement[];
        const refIdx = newIndex > oldIndex ? oldIndex : oldIndex + 1;
        const refNode = children[refIdx];
        if (refNode && refNode !== item) {
          fromEl.insertBefore(item, refNode);
        } else {
          fromEl.appendChild(item);
        }
        didDragRef.current = true;
        applyReorderRef.current(oldDraggableIndex, newDraggableIndex);
      },
    } as object);
    return () => so.destroy();
  }, []);

  // Helper functions for card display
  // Date format matches the design — `YYYY·MM·DD → MM·DD` with mono dots so
  // it sits cleanly next to the place / km tokens on the same line.
  const getDateRange = (roadmap: Roadmap): string => {
    const startTime = roadmap.detail?.start_time;
    const endTime = roadmap.detail?.end_time;
    if (!startTime) return '';
    try {
      const startDate = new Date(startTime);
      const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '·');
      const md = (d: Date) => d.toISOString().slice(5, 10).replace('-', '·');
      if (!endTime) return ymd(startDate);
      const endDate = new Date(endTime);
      if (startDate.toDateString() === endDate.toDateString()) return ymd(startDate);
      return `${ymd(startDate)} → ${md(endDate)}`;
    } catch {
      return '';
    }
  };

  const getStatusColor = (roadmap: Roadmap): string => {
    const startTime = roadmap.detail?.start_time;
    const endTime = roadmap.detail?.end_time;

    if (!startTime && !endTime) return 'lac-na'; // No time planned

    const now = new Date();

    try {
      if (startTime) {
        const startDate = new Date(startTime);
        if (startDate <= now) return 'lac-done'; // Started
      }

      if (endTime) {
        const endDate = new Date(endTime);
        if (endDate <= now) return 'lac-done'; // Ended
      }

      return 'lac-todo'; // Not started yet
    } catch {
      return 'lac-na';
    }
  };

  return (
    <div className="lac-roadmapset-root">
      {/* 顶部固定区：先 eyebrow + h1 + count，再 stats，再地图（严格按 design 顺序）*/}
      <div className="lac-roadmapset-header">
        <div className="lac-eyebrow lac-roadmapset-eyebrow">LaC · Roadmap</div>
        <div className="lac-roadmapset-title-row">
          <h1 className="lac-serif lac-roadmapset-title">行程</h1>
          <span className="lac-mono lac-roadmapset-count">{roadmaps.length} trips</span>
        </div>
        <div className="lac-roadmapset-stats">
          <RoadmapSetStats roadmaps={roadmaps} />
        </div>
        <div
          className="lac-map-widget lac-map-widget--clickable"
          onClick={() => setMapVisible(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMapVisible(true); } }}
          aria-label="点击放大地图"
        >
          <AggregatedMap app={app} repository={repository} settings={settings} />
          <span className="lac-map-widget-expand">↗ expand</span>
        </div>
      </div>

      {/* 下方卡片列表（独立滚动区域）*/}
      <div className="lac-roadmapset-list-wrapper">
        <div className="lac-card-list" ref={cardListRef}>
          {roadmaps.map((roadmap, idx) => {
            const description = roadmap.detail?.description || '';
            const dateRange = getDateRange(roadmap);
            const statusColor = getStatusColor(roadmap);
            const canDrag = isUnplanned(roadmap);
            // Per-card stat trail — places count + total distance, mirroring
            // the design's `range · 4 places · 81.3 km` line. Distance is
            // hidden when zero (e.g. cards with no route segments).
            const cardStats = computeRoadmapStats(roadmap);
            const hasDistance = cardStats.distanceText && cardStats.distanceText !== '0 m';
            // Match PlaceCard's mapping from legacy state class to .lac-dot--* kind.
            const dotCls = statusColor === 'lac-done' ? 'lac-dot--done'
              : statusColor === 'lac-todo' ? 'lac-dot--plan'
              : 'lac-dot--wish';
            // Section eyebrows — at the start of each group. Sortable.js
            // selectors ignore non-card siblings, so injecting these rows
            // doesn't disturb drag-drop.
            const showWishlist = idx === 0 && unarrangedCount > 0;
            const showPlanned  = idx === unarrangedCount && unarrangedCount < roadmaps.length;

            return (
              <React.Fragment key={roadmap.id}>
                {showWishlist && <div className="lac-list-eyebrow lac-eyebrow">未安排 · wishlist</div>}
                {showPlanned  && <div className="lac-list-eyebrow lac-eyebrow">已规划 · planned</div>}
              <div
                className={`lac-card lac-cursor-pointer${canDrag ? ' lac-card--compact' : ''}`}
                onClick={() => {
                  // 拖拽结束的 pointerup 会触发 click——这里吞掉一次，避免误打开 roadmap。
                  if (didDragRef.current) { didDragRef.current = false; return; }
                  openRoadmap(roadmap);
                }}
                onContextMenu={(e) => showContextMenu(e, roadmap)}
                onPointerDown={() => onCardPointerDown(roadmap)}
                onPointerUp={onCardPointerUp}
                onPointerCancel={onCardPointerUp}
                onPointerLeave={onCardPointerUp}
              >
                <div className="lac-card-row">
                  <div className="lac-card-body">
                    <div className="lac-card-name">
                      <span className={`lac-dot ${dotCls}`} />
                      <span className={`lac-card-title ${statusColor}`}>{roadmap.name}</span>
                    </div>
                    {description && <div className="lac-card-desc">{description}</div>}
                    <div className="lac-card-meta">
                      {dateRange && <span>{dateRange}</span>}
                      {dateRange && <span className="lac-card-meta-sep">·</span>}
                      <span className="lac-card-meta-num">{cardStats.placeCount}</span>
                      <span> places</span>
                      {hasDistance && <span className="lac-card-meta-sep">·</span>}
                      {hasDistance && <span className="lac-card-meta-num">{cardStats.distanceText}</span>}
                    </div>
                    {!canDrag && (
                      <div className="lac-card-heatmap">
                        <CardCalendar roadmap={roadmap} globalCounts={globalCounts} globalRangeDays={globalRangeDays} />
                      </div>
                    )}
                  </div>
                  <div className="lac-card-thumb">
                    <StaticMap roadmap={roadmap} settings={settings} status={statusColor as 'lac-done' | 'lac-todo' | 'lac-na'} />
                  </div>
                </div>
              </div>
              </React.Fragment>
            );
          })}
        </div>
        {/* 列表底部新增按钮 — 字段日记式安静的虚线 + new trip */}
        <div style={{ padding: '6px 0 24px' }}>
          <button type="button" className="lac-btn--quiet" onClick={handleAdd}>+ new trip</button>
        </div>
      </div>

      {contextMenu && (
        <div
          className="lac-context-menu"
          style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="lac-btn lac-context-item" onClick={() => handleDeleteRoadmap(contextMenu.roadmap)}>从集合移除</button>
          <button type="button" className="lac-btn lac-context-item" onClick={() => handleCopyRoadmap(contextMenu.roadmap)}>复制</button>
          <button type="button" className="lac-btn lac-context-item lac-context-item-danger" onClick={() => handleDeleteRoadmapPermanently(contextMenu.roadmap)}>彻底删除</button>
        </div>
      )}

      <RoadmapEditModal
        visible={editModalVisible}
        mode="create"
        settings={settings}
        onCancel={() => setEditModalVisible(false)}
        onConfirm={onConfirmCreate}
      />

      {/* Hero map readOnly viewer — opened by clicking the header map.
          Aggregates every geocoded place across all loaded roadmaps so the
          viewer mirrors what AggregatedMap renders in the hero, but in a
          context where pan/zoom actually works. */}
      <MapSelector
        visible={mapVisible}
        initialLocation={undefined}
        onCancel={() => setMapVisible(false)}
        onConfirm={() => setMapVisible(false)}
        settings={settings}
        routeLocations={(() => {
          const locs: { name: string; longitude: number; latitude: number; coordinate_system?: string }[] = [];
          for (const rm of roadmaps) {
            for (const it of rm.items || []) {
              if (it && typeof it === 'object' && 'name' in it && 'detail' in it) {
                const addr: any = (it as any).detail?.address;
                if (addr && typeof addr.longitude === 'number' && typeof addr.latitude === 'number') {
                  locs.push({
                    name: (it as any).name || '',
                    longitude: addr.longitude,
                    latitude: addr.latitude,
                    coordinate_system: addr.coordinate_system,
                  });
                }
              }
            }
          }
          return locs;
        })()}
        readOnly
      />
    </div>
  );
}



