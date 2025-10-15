import { useEffect, useMemo, useState, useRef } from 'react';
import { App } from 'obsidian';
import { RoadmapRepository } from '../../repositories/RoadmapRepository';
import { Roadmap, Place, RouteSegment } from '../../types/roadmap';
import PlaceEditModal from '../../components/modals/PlaceEditModal';
import ConfirmModal from '../../components/modals/ConfirmModal';
import { RouteBadge, DateTabs } from '../../components';

interface Props {
  app: App;
  repository: RoadmapRepository;
  filePath: string;
  settings: any;
}

export default function RoadmapPage({ app, repository, filePath, settings }: Props) {
  const [data, setData] = useState<Roadmap | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editInitial, setEditInitial] = useState<any | undefined>(undefined);
  const dragIndexRef = useRef<number | null>(null);
  useEffect(() => {
    (async () => {
      const r = await repository.loadRoadmap(filePath);
      setData(r);
    })();
  }, [repository, filePath]);

  const addPlace = () => {
    setEditInitial(undefined);
    setEditorVisible(true);
  };

  const onSavePlace = async (payload: any) => {
    if (!data) return;
    const folder = (filePath.split('/').slice(0, -1).join('/')) || 'LaC/Roadmap';
    const place: Place = { id: payload.name, name: payload.name, detail: {
      start_time: payload.start_time,
      end_time: payload.end_time,
      description: payload.description,
      address: payload.address
    }};
    await repository.savePlaceFile(folder, place);
    const nextItems = [...(data.items || []), place];
    await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, nextItems);
    const r = await repository.loadRoadmap(filePath);
    setData(r);
    setEditorVisible(false);
  };

  const editPlace = (p: Place) => {
    setEditInitial({
      name: p.name,
      start_time: p.detail?.start_time,
      end_time: p.detail?.end_time,
      description: p.detail?.description,
      address: p.detail?.address
    });
    setEditorVisible(true);
  };

  const deletePlace = async (p: Place) => {
    const modal = new ConfirmModal(`删除地点「${p.name}」？`, '删除', '取消', true);
    const ok = await modal.open();
    if (!ok || !data) return;
    const remaining: Array<Place | RouteSegment> = [];
    for (let i = 0; i < data.items.length; i++) {
      const it: any = data.items[i];
      if (it && 'name' in it && it.name === p.name) {
        const next = data.items[i + 1] as any;
        if (next && !('name' in next) && next.travelMode) i++;
        continue;
      }
      remaining.push(data.items[i]);
    }
    await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, remaining);
    const r = await repository.loadRoadmap(filePath);
    setData(r);
  };

  const onDragStart = (idx: number) => { dragIndexRef.current = idx; };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = async (idx: number) => {
    if (!data) return;
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    if (from == null || from === idx) return;
    const items = [...data.items];
    const [moved] = items.splice(from, 1);
    items.splice(idx, 0, moved);
    await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, items);
    const r = await repository.loadRoadmap(filePath);
    setData(r);
  };

  const groups = useMemo(() => {
    const result: Record<string, Array<Place | RouteSegment>> = {};
    const items = data?.items || [];
    let dayIndex = 1;
    let currentKey = '';
    for (let i = 0; i < items.length; i++) {
      const it: any = items[i];
      if (it && 'name' in it) {
        const start = (it as Place).detail?.start_time;
        const key = start ? String(start).split(' ')[0] : `第${dayIndex}天`;
        if (key !== currentKey) { currentKey = key; if (!start) dayIndex++; }
        result[currentKey] = result[currentKey] || [];
        result[currentKey].push(it);
        // 附带下一段 route
        const next = items[i + 1] as any;
        if (next && !('name' in next) && next.travelMode) { result[currentKey].push(next); i++; }
      }
    }
    return result;
  }, [data]);

  const groupKeys = useMemo(() => Object.keys(groups), [groups]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  useEffect(() => {
    if (!activeKey && groupKeys.length > 0) setActiveKey(groupKeys[0]);
  }, [groupKeys, activeKey]);

  return (
    <div className="lac-roadmap-root">
      <div className="lac-card lac-mb-12">Roadmap: {data?.name || filePath}</div>
      <DateTabs tabs={groupKeys} activeKey={activeKey || ''} onChange={setActiveKey} onAdd={() => addPlace()} />
      <div className="lac-row lac-mb-12">
        <button className="lac-btn primary" onClick={addPlace}>+ 新增地点</button>
      </div>
      {(activeKey ? [activeKey] : groupKeys).map(key => (
        <div key={key} className="lac-card lac-mb-12">
          <div className="lac-section-title">{key}</div>
          {(groups[key] || []).map((it, idx) => (
            <div key={idx} className="lac-card lac-mb-8" draggable onDragStart={() => onDragStart(idx)} onDragOver={onDragOver} onDrop={() => onDrop(idx)}>
              {('name' in (it as any)) ? (
                <div className="lac-row lac-justify-between">
                  <div>
                    <div className="lac-title">{(it as any).name}</div>
                    <div className="lac-tag">{(it as Place).detail?.start_time} - {(it as Place).detail?.end_time}</div>
                  </div>
                  <div className="lac-row">
                    <button className="lac-btn" onClick={() => editPlace(it as Place)}>编辑</button>
                    <button className="lac-btn danger" onClick={() => deletePlace(it as Place)}>删除</button>
                  </div>
                </div>
              ) : (
                <RouteBadge segment={it as RouteSegment} />
              )}
            </div>
          ))}
        </div>
      ))}

      <PlaceEditModal
        visible={editorVisible}
        settings={settings}
        initial={editInitial}
        onCancel={() => setEditorVisible(false)}
        onConfirm={onSavePlace}
      />
    </div>
  );
}


