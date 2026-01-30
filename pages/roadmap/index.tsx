import { useEffect, useMemo, useState, useRef } from 'react';
import { App } from 'obsidian';
import { RoadmapRepository } from '../../repositories/RoadmapRepository';
import { Roadmap, Place, RouteSegment } from '../../types/roadmap';
import PlaceEditModal from '../../components/modals/PlaceEditModal';
import ConfirmModal from '../../components/modals/ConfirmModal';
import AggregatedMap from '../../components/map/AggregatedMap';

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
  const [metaEditorVisible, setMetaEditorVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const dragIndexRef = useRef<number | null>(null);

  // 单地点静态地图（与 roadmapset 卡片一致的 100x100 右侧地图，没有定位点则不显示）
  function PlaceStaticMap({ place }: { place: Place }) {
    const [url, setUrl] = useState<string>('');
    const [hasCoordinates, setHasCoordinates] = useState(false);
    const [err, setErr] = useState(false);
    useEffect(() => {
      try {
        const loc: any = place.detail?.address;
        const hasKey = !!settings?.googleMapsApiKey;
        if (!loc || typeof loc.longitude !== 'number' || typeof loc.latitude !== 'number' || !hasKey) {
          setHasCoordinates(false);
          setErr(true);
          return;
        }
        setHasCoordinates(true);
        const baseUrl = 'https://maps.googleapis.com/maps/api/staticmap';
        const center = `${loc.latitude},${loc.longitude}`;
        const markers = `size:tiny|color:0xff3b30|${loc.latitude},${loc.longitude}`;
        const params = new URLSearchParams({
          center,
          zoom: '12',
          size: '100x100',
          maptype: 'hybrid',
          markers,
          key: settings.googleMapsApiKey
        });
        setUrl(`${baseUrl}?${params.toString()}`);
        setErr(false);
      } catch (_) { 
        setHasCoordinates(false);
        setErr(true);
      }
    }, [place, settings]);

    // 没有定位点则不显示地图
    if (!hasCoordinates) {
      return null;
    }

    if (err || !url) {
      return null;
    }
    return (
      <div className="lac-card-map">
        <img src={url} alt={place.name} className="lac-card-map-image" onError={() => setErr(true)} />
      </div>
    );
  }
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
    
    // 判断是编辑还是新增
    const isEdit = editInitial && editInitial.name;
    const originalName = isEdit ? editInitial.name : null;
    
    let nextItems: Array<Place | RouteSegment>;
    if (isEdit && originalName && originalName !== payload.name) {
      // 编辑且名称改变：需要替换所有相关项（包括可能的 route segment）
      nextItems = [];
      for (let i = 0; i < data.items.length; i++) {
        const it: any = data.items[i];
        if (it && 'name' in it && it.name === originalName) {
          // 替换地点
          nextItems.push(place);
          // 检查下一个是否是 route segment，如果是则保留
          const next = data.items[i + 1] as any;
          if (next && !('name' in next) && next.travelMode) {
            nextItems.push(next);
            i++;
          }
        } else {
          nextItems.push(data.items[i]);
        }
      }
    } else if (isEdit && originalName) {
      // 编辑且名称未改变：只更新地点信息
      nextItems = data.items.map((it: any) => {
        if (it && 'name' in it && it.name === originalName) {
          return place;
        }
        return it;
      });
    } else {
      // 新增：添加到末尾
      nextItems = [...(data.items || []), place];
    }
    
    await repository.updateRoadmapItems(filePath, data.name, data.detail || {}, nextItems);
    const r = await repository.loadRoadmap(filePath);
    setData(r);
    setEditorVisible(false);
    setEditInitial(undefined);
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
  // Multi-select tabs state: set of day indices (全选或全不选都表示显示全部)
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(() => new Set());

  // Build tab definitions: day1..N（有日期则显示日期，否则显示"第X天"），去掉 all 标签
  const tabDefs = useMemo(() => {
    const defs: Array<{ id: string; label: string; key?: string }> = [];
    groupKeys.forEach((k, i) => {
      const isDate = /^\d{4}-\d{2}-\d{2}$/.test(k);
      const label = isDate ? k : `第${i + 1}天`;
      defs.push({ id: `day-${i + 1}`, label, key: k });
    });
    defs.push({ id: 'unplanned', label: '未计划' });
    return defs;
  }, [groupKeys]);

  const onToggleTab = (id: string) => {
    setSelectedTabs(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredKeys = useMemo(() => {
    // 如果全选或全不选，显示全部
    const allTabIds = tabDefs.map(t => t.id);
    const allSelected = allTabIds.length > 0 && allTabIds.every(id => selectedTabs.has(id));
    const noneSelected = selectedTabs.size === 0;
    
    if (allSelected || noneSelected) return groupKeys;
    
    // 否则根据选中的标签筛选
    const wanted = Array.from(selectedTabs);
    const keys: string[] = [];
    for (const id of wanted) {
      if (id === 'unplanned') {
        groupKeys.forEach(k => { if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) keys.push(k); });
        continue;
      }
      const m = id.match(/^day-(\d+)$/);
      if (m) {
        const index = Number(m[1]) - 1;
        if (index >= 0 && index < groupKeys.length) keys.push(groupKeys[index]);
      }
    }
    return keys.length ? keys : groupKeys;
  }, [groupKeys, selectedTabs, tabDefs]);

  // 基于选中标签筛选地点列表（扁平化，不显示 route）
  const filteredPlaces = useMemo(() => {
    const out: Place[] = [];
    filteredKeys.forEach(k => {
      const arr = groups[k] || [];
      for (const it of arr) {
        if ((it as any) && 'name' in (it as any)) out.push(it as Place);
      }
    });
    return out;
  }, [groups, filteredKeys]);

  // 获取地点状态颜色（与 roadmapset 卡片标题颜色逻辑一致）
  const getPlaceStatusColor = (place: Place): string => {
    const startTime = place.detail?.start_time;
    const endTime = place.detail?.end_time;
    
    // 检查是否有具体的日期（格式：yyyy-MM-dd 或包含日期的完整时间）
    const hasDate = startTime && /^\d{4}-\d{2}-\d{2}/.test(startTime);
    
    // 如果没有具体日期，视为未发生（即使规划了"第X天"）
    if (!hasDate) {
      // 如果地点在某个分组中（无论是日期还是"第X天"），视为未发生而不是未计划
      // 所有在 filteredPlaces 中的地点都应该在某个 group 中，但为了安全起见还是检查
      for (const key of Object.keys(groups)) {
        const arr = groups[key] || [];
        if (arr.some((it: any) => it && 'name' in it && (it as Place).name === place.name)) {
          return 'lac-todo'; // 有规划但未发生
        }
      }
      // 完全不在任何分组中（理论上不应该出现），视为未计划
      return 'lac-na';
    }
    
    // 有具体日期，判断是否已发生
    const now = new Date();
    
    try {
      if (startTime) {
        const startDate = new Date(startTime);
        if (startDate <= now) return 'lac-done'; // 已开始
      }
      
      if (endTime) {
        const endDate = new Date(endTime);
        if (endDate <= now) return 'lac-done'; // 已结束
      }
      
      return 'lac-todo'; // 未开始
    } catch {
      return 'lac-na';
    }
  };

  // 格式化地点时间显示（简化格式：去掉秒，同日期省略结束日期）
  const formatPlaceTime = (place: Place): string => {
    const startTime = place.detail?.start_time;
    const endTime = place.detail?.end_time;
    
    if (!startTime) return '';
    
    // 提取日期部分（yyyy-MM-dd）
    const getDatePart = (timeStr: string): string | null => {
      if (!timeStr) return null;
      const dateMatch = timeStr.match(/^(\d{4}-\d{2}-\d{2})/);
      return dateMatch ? dateMatch[1] : null;
    };
    
    // 提取时间部分（去掉秒，只保留 HH:mm）
    const getTimePart = (timeStr: string): string | null => {
      if (!timeStr) return null;
      // 匹配时间部分（可能带秒）
      const timeMatch = timeStr.match(/(?:^|\s)(\d{2}:\d{2})(?::\d{2})?/);
      return timeMatch ? timeMatch[1] : null;
    };
    
    // 解析开始时间
    const startDate = getDatePart(startTime);
    const startTimeOnly = getTimePart(startTime);
    
    // 格式化开始时间
    let formattedStart = '';
    if (startDate && startTimeOnly) {
      formattedStart = `${startDate} ${startTimeOnly}`;
    } else if (startDate) {
      formattedStart = startDate;
    } else if (startTimeOnly) {
      formattedStart = startTimeOnly;
    } else {
      // 无法解析，尝试去掉秒
      formattedStart = startTime.replace(/:\d{2}(?=\s|$)/, '');
    }
    
    // 如果没有结束时间，只返回开始时间
    if (!endTime) {
      return formattedStart;
    }
    
    // 解析结束时间
    const endDate = getDatePart(endTime);
    const endTimeOnly = getTimePart(endTime);
    
    // 判断是否同一天
    const isSameDay = startDate && endDate && startDate === endDate;
    
    // 格式化结束时间
    let formattedEnd = '';
    if (isSameDay && endTimeOnly) {
      // 同一天：只显示时间部分
      formattedEnd = endTimeOnly;
    } else if (endDate && endTimeOnly) {
      // 不同天或没有开始日期：显示完整日期时间
      formattedEnd = `${endDate} ${endTimeOnly}`;
    } else if (endDate) {
      formattedEnd = endDate;
    } else if (endTimeOnly) {
      formattedEnd = endTimeOnly;
    } else {
      // 无法解析，尝试去掉秒
      formattedEnd = endTime.replace(/:\d{2}(?=\s|$)/, '');
    }
    
    return `${formattedStart} ~ ${formattedEnd}`;
  };

  // 打开编辑路线标题/描述弹窗
  const openMetaEditor = () => {
    if (!data) return;
    setEditName(data.name);
    setEditDesc(data.detail?.description || '');
    setMetaEditorVisible(true);
  };

  // 保存路线标题/描述
  const saveMetaEditor = async () => {
    if (!data || !editName.trim()) return;
    const nextDetail = { ...(data.detail || {}), description: editDesc };
    await repository.updateRoadmapItems(filePath, editName.trim(), nextDetail, data.items);
    const r = await repository.loadRoadmap(filePath);
    setData(r);
    setMetaEditorVisible(false);
  };

  return (
    <div className="lac-roadmap-root">
      {/* 顶部地图 3:2 比例，无外边距/内边距，与 roadmapset 一致 */}
      <div className="lac-map-widget lac-mb-12">
        <AggregatedMap app={app} repository={repository} settings={settings} />
      </div>

      {/* 顶部固定区：标题与多选标签 */}
      <div className="lac-roadmap-header">
        <div className="lac-roadmap-title-row" onClick={openMetaEditor}>
          <div className="lac-roadmap-title-text">
            <span className="lac-title">{data?.name || filePath}</span>
            {data?.detail?.description && (
              <>
                <span className="lac-title-separator">·</span>
                <span className="lac-description">{data.detail.description}</span>
              </>
            )}
          </div>
        </div>
        <div className="lac-tabs lac-tabs--browser">
          {tabDefs.map(t => (
            <button
              key={t.id}
              className={`lac-btn lac-tab ${selectedTabs.has(t.id) ? 'active' : ''}`}
              onClick={() => onToggleTab(t.id)}
            >{t.label}</button>
          ))}
          <button className="lac-btn lac-tab" onClick={addPlace}>+</button>
        </div>
      </div>

      {/* 列表滚动区：每个地点独立卡片（与 roadmapset 卡片一致，去掉日历背景） */}
      <div className="lac-roadmap-list-wrapper">
        <div className="lac-card-list">
          {filteredPlaces.map((p, idx) => (
            <div 
              key={`${p.id}-${idx}`} 
              className="lac-card"
              onClick={() => editPlace(p)}
              style={{ cursor: 'pointer' }}
            >
              <div className="lac-card-content">
                <div className="lac-card-text">
                  <div className="lac-card-text-content">
                    <div className="lac-card-title">
                      <div className={`lac-title ${getPlaceStatusColor(p)}`}>{p.name}</div>
                      <div className="lac-description">&nbsp;{p.detail?.description || ''}</div>
                    </div>
                    <div className="lac-tag">{formatPlaceTime(p)}</div>
                  </div>
                </div>
                <PlaceStaticMap place={p} />
              </div>
            </div>
          ))}
        </div>
        {/* 列表底部新增按钮 */}
        <div className="lac-row lac-justify-center lac-mb-12">
          <button className="lac-btn--add" onClick={addPlace}>+</button>
        </div>
      </div>

      <PlaceEditModal
        visible={editorVisible}
        settings={settings}
        initial={editInitial}
        onCancel={() => setEditorVisible(false)}
        onConfirm={onSavePlace}
      />

      {/* 编辑标题/描述弹窗 */}
      {metaEditorVisible && (
        <div className="lf-map-selector-mask" onClick={(e) => { if (e.currentTarget === e.target) setMetaEditorVisible(false); }}>
          <div className="lifeflow-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lifeflow-confirm-content">
              <div className="lifeflow-confirm-title">编辑路线</div>
              <div className="lac-space" />
              <div className="lac-row">
                <input 
                  className="lf-map-search-input" 
                  placeholder="路线名称" 
                  value={editName} 
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveMetaEditor(); }}
                  autoFocus
                />
              </div>
              <div className="lac-space" />
              <div className="lac-row">
                <input 
                  className="lf-map-search-input" 
                  placeholder="路线描述" 
                  value={editDesc} 
                  onChange={(e) => setEditDesc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveMetaEditor(); }}
                />
              </div>
              <div className="lac-space" />
              <div className="lifeflow-confirm-actions">
                <button className="lf-btn lf-btn-cancel" onClick={() => setMetaEditorVisible(false)}>取消</button>
                <button className="lf-btn lf-btn-confirm" onClick={saveMetaEditor}>确定</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


