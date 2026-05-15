import React, { useEffect, useMemo, useState } from 'react';
import { MapLocation } from '../../types/map';
import { MapProviderKind, RoadmapDetail, Place, RouteSegment, hasCoords } from '../../types/roadmap';
import DatePicker from '../DatePicker';
import PlaceStaticMap, { PlacePoint } from '../PlaceStaticMap';
import MapSelector from '../map/MapSelector';

export interface RoadmapEditPayload {
  name: string;
  detail: RoadmapDetail;
}

interface Props {
  visible: boolean;
  /** 编辑模式：传入现有数据；create 模式：留空 */
  initial?: {
    name?: string;
    detail?: RoadmapDetail;
  };
  mode: 'create' | 'edit';
  settings: any;
  onCancel: () => void;
  onConfirm: (data: RoadmapEditPayload) => void;
  onDelete?: () => void;
  /** Trip's items (places + route segments) — used to render the WHERE
   *  thumbnail with the same multi-place static map as the roadmapset
   *  card thumbs. When omitted (e.g. create flow with no places yet),
   *  the thumb falls back to the diagonal-stripe `MAP` placeholder. */
  items?: Array<Place | RouteSegment>;
}

const FOLLOW_GLOBAL = '__follow_global__';

const PROVIDER_LABEL: Record<string, string> = {
  [FOLLOW_GLOBAL]: 'auto',
  google: 'google',
  gaode: 'gaode',
};
const PROVIDER_META: Record<string, string> = {
  [FOLLOW_GLOBAL]: 'follow global',
  google: 'WGS84 · global',
  gaode: 'GCJ-02 · CN',
};

function diffNights(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0;
  const s = new Date(startISO.slice(0, 10));
  const e = new Date(endISO.slice(0, 10));
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
}

export default function RoadmapEditModal({ visible, initial, mode, settings, onCancel, onConfirm, onDelete, items }: Props) {
  const [name, setName] = useState(initial?.name || '');
  const [desc, setDesc] = useState(initial?.detail?.description || '');
  const [start, setStart] = useState(initial?.detail?.start_time || '');
  const [end, setEnd] = useState(initial?.detail?.end_time || '');
  const [mapProvider, setMapProvider] = useState<string>(initial?.detail?.map_provider || FOLLOW_GLOBAL);
  const [datePickerVisibleFor, setDatePickerVisibleFor] = useState(null as null | 'start' | 'end');
  const [nameError, setNameError] = useState('');
  // 缩略图点开后的「只读全景地图」遮罩。仅在 items 里至少有一个带坐标的
  // 地点时才开放（thumb 为 placeholder 时不开）。Esc / 背景点击关闭。
  const [viewerVisible, setViewerVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initial?.name || '');
      setDesc(initial?.detail?.description || '');
      setStart(initial?.detail?.start_time || '');
      setEnd(initial?.detail?.end_time || '');
      setMapProvider(initial?.detail?.map_provider || FOLLOW_GLOBAL);
      setNameError('');
    }
  }, [visible, initial]);

  const handleSave = () => {
    if (!name.trim()) {
      setNameError('名称不能为空');
      return;
    }
    setNameError('');
    // 路线不再有自己的「点」(detail.address)；它的位置就是 items 序列。
    // start / end 都是从 items 计算出来的派生属性，不在这里写入。
    const detail: RoadmapDetail = {};
    if (desc) detail.description = desc;
    if (start) detail.start_time = start;
    if (end) detail.end_time = end;
    if (mapProvider && mapProvider !== FOLLOW_GLOBAL) {
      detail.map_provider = mapProvider as MapProviderKind;
    }
    onConfirm({ name: name.trim(), detail });
  };

  // Derived display state.
  const nights = useMemo(() => diffNights(start, end), [start, end]);

  // 从 items 计算路线的「起点 / 终点」—— 取第一个 / 最后一个已地理编码的地点
  // (with both lat & lng)。这两个量等同于 Roadmap.startPoint / endPoint
  // (types/roadmap.ts#computeRoadmapEndpoints)，只是在 modal 里重算一遍以
  // 免再把 props 链路加长。当 items 为 undefined（create 模式）或没有任何
  // 地点带坐标时，两者都是 undefined，UI 退回到"暂无地点"占位。
  const placesWithCoords = useMemo(() => {
    const out: Place[] = [];
    for (const it of items || []) {
      if (it && typeof it === 'object' && 'name' in it && 'detail' in it) {
        const p = it as Place;
        if (hasCoords(p.detail?.address)) out.push(p);
      }
    }
    return out;
  }, [items]);
  const startPlace = placesWithCoords[0];
  const endPlace = placesWithCoords[placesWithCoords.length - 1];

  // viewer 用 MapSelector 的 readOnly 模式渲染 —— 它接受 routeLocations:
  // MapLocation[]，把每个地点画成 numbered marker + 折线。地图、底图、scale
  // bar、provider dropdown 这些 chrome 都跟原选址 modal 完全一致，只是搜索
  // 栏 / 坐标 chip / clear / pin-here 被 readOnly 隐藏。
  const viewerLocations = useMemo<MapLocation[]>(() => {
    return placesWithCoords.map(p => {
      const loc = p.detail!.address as MapLocation;
      return {
        name: p.name,
        longitude: loc.longitude,
        latitude: loc.latitude,
        coordinate_system: loc.coordinate_system,
      };
    });
  }, [placesWithCoords]);

  if (!visible) return null;

  const titleStatus = mode === 'create' ? 'draft' : 'editing';
  const startDate = start ? start.slice(0, 10) : '';
  const endDate   = end   ? end.slice(0, 10)   : '';

  return (
    <div className="lac-confirm-mask" onClick={(e) => { if (e.currentTarget === e.target) onCancel(); }}>
      <div className="lac-confirm-modal lac-place-edit-modal lac-trip-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lac-confirm-content">
          <div className="lac-confirm-eyebrow lac-eyebrow">
            {mode === 'create' ? 'new trip · 新路线' : 'edit trip · 编辑路线'}
          </div>
          <h2 className="lac-confirm-title-serif lac-serif lac-trip-title">
            {name || (mode === 'create' ? '新路线' : initial?.name || '路线')}
            <span className="lac-trip-title-status"> · {titleStatus}</span>
          </h2>

          <div className="lac-place-form">
            {/* NAME */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">name</span>
                <span className="lac-place-where-hint">required</span>
              </div>
              <input
                type="text"
                value={name}
                placeholder="路线名称"
                className={`lac-place-name-input lac-trip-name-input${nameError ? ' lac-input-error' : ''}`}
                onChange={(e) => { setNameError(''); setName(e.target.value); }}
                autoFocus
              />
              {nameError && <div className="lac-field-error">{nameError}</div>}
            </section>

            {/* NOTES */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">notes</span>
              </div>
              <textarea
                value={desc}
                placeholder="路线描述"
                className="lac-place-notes-input"
                onChange={(e) => setDesc(e.target.value)}
              />
            </section>

            {/* WHEN — date → date in one mono line, optional `N nights` summary */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">when</span>
                {nights > 0 && <span className="lac-place-where-hint">{nights} nights</span>}
              </div>
              <div className="lac-trip-when-row">
                <button type="button" className="lac-place-when-date lac-trip-when-date" onClick={() => setDatePickerVisibleFor('start')}>
                  {startDate || <span className="lac-place-when-placeholder">起始日期</span>}
                </button>
                <span className="lac-place-when-arrow">→</span>
                <button type="button" className="lac-place-when-date lac-trip-when-date" onClick={() => setDatePickerVisibleFor('end')}>
                  {endDate || <span className="lac-place-when-placeholder">结束日期</span>}
                </button>
              </div>
            </section>

            {/* WHERE — 路线本身没有「自选地址」；显示从 items 计算出的起点 /
                终点（read-only），右侧缩略图自动适配整条路线的所有地点。 */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">where</span>
                {placesWithCoords.length > 0 && (
                  <span className="lac-place-where-hint">{placesWithCoords.length} pts</span>
                )}
              </div>
              <div className="lac-place-where-row">
                <div className="lac-place-where-text">
                  {placesWithCoords.length === 0 ? (
                    <div className="lac-place-where-coords">尚无带坐标的地点</div>
                  ) : (
                    <>
                      <div className="lac-trip-endpoint">
                        <span className="lac-trip-endpoint-label">start</span>
                        <span className="lac-trip-endpoint-name">{startPlace!.name}</span>
                      </div>
                      <div className="lac-trip-endpoint">
                        <span className="lac-trip-endpoint-label">end</span>
                        <span className="lac-trip-endpoint-name">{endPlace!.name}</span>
                      </div>
                    </>
                  )}
                </div>
                {settings.mapApiProvider !== 'none' && (() => {
                  // 收集 items 中所有已地理编码的地点坐标，传给 PlaceStaticMap
                  // 的 autoFit 模式 —— 缩略图会用包围盒中心 + 适配缩放展示
                  // 整条路线，而不是只聚焦在 currentIndex 那一个点上。
                  const placePoints: PlacePoint[] = placesWithCoords.map(p => {
                    const loc = p.detail!.address as MapLocation;
                    return { lat: loc.latitude!, lng: loc.longitude!, coordinate_system: loc.coordinate_system };
                  });
                  const hasAnyCoord = placePoints.length > 0;
                  const effectiveProvider = mapProvider === FOLLOW_GLOBAL
                    ? (settings.mapApiProvider as 'google' | 'gaode' | undefined)
                    : (mapProvider as 'google' | 'gaode');
                  // 有点时是按钮（点开打开只读全景），无点时退回 placeholder 静态 div。
                  if (!hasAnyCoord) {
                    return (
                      <div
                        className="lac-place-where-thumb lac-trip-where-thumb"
                        aria-label="路线总览缩略图"
                      >
                        <span className="lac-place-where-thumb-label">map</span>
                      </div>
                    );
                  }
                  return (
                    <button
                      type="button"
                      className="lac-place-where-thumb lac-trip-where-thumb lac-trip-where-thumb--clickable"
                      onClick={() => setViewerVisible(true)}
                      aria-label="点开查看路线全景地图"
                    >
                      <PlaceStaticMap
                        places={placePoints}
                        currentIndex={-1}
                        placeName={initial?.name || 'trip'}
                        mapKey={`trip-fit-${placePoints.length}-${initial?.name || 'x'}`}
                        preferredProvider={effectiveProvider}
                        settings={settings}
                        autoFit={true}
                      />
                    </button>
                  );
                })()}
              </div>
            </section>

            {/* PROVIDER */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">provider</span>
                {mapProvider === FOLLOW_GLOBAL && <span className="lac-place-where-hint">follow global</span>}
              </div>
              <div className="lac-trip-provider">
                <span className="lac-trip-provider-dot" />
                <select
                  value={mapProvider}
                  onChange={(e) => setMapProvider(e.target.value)}
                  className="lac-trip-provider-select"
                >
                  <option value={FOLLOW_GLOBAL}>auto · follow global</option>
                  <option value="google">google · WGS84 · global</option>
                  <option value="gaode">gaode · GCJ-02 · CN</option>
                </select>
                <span className="lac-trip-provider-caret">▾</span>
              </div>
            </section>
          </div>

          <div className="lac-place-actions">
            {mode === 'edit' && onDelete ? (
              <button type="button" className="lac-btn lac-btn-danger lac-place-action-delete" onClick={onDelete}>delete</button>
            ) : <span className="lac-place-action-spacer" />}
            <div className="lac-place-action-trailing">
              <button type="button" className="lac-btn lac-btn-cancel" onClick={onCancel}>cancel</button>
              <button type="button" className="lac-btn lac-btn-confirm" onClick={handleSave}>{mode === 'create' ? 'create' : 'save'}</button>
            </div>
          </div>
        </div>
      </div>

      <DatePicker
        visible={!!datePickerVisibleFor}
        value={(datePickerVisibleFor === 'start' ? start : end) || ''}
        onCancel={() => setDatePickerVisibleFor(null)}
        onClear={() => {
          if (datePickerVisibleFor === 'start') setStart('');
          else if (datePickerVisibleFor === 'end') setEnd('');
          setDatePickerVisibleFor(null);
        }}
        onConfirm={(val) => {
          if (datePickerVisibleFor === 'start') setStart(val);
          else if (datePickerVisibleFor === 'end') setEnd(val);
          setDatePickerVisibleFor(null);
        }}
      />

      <MapSelector
        visible={viewerVisible}
        onCancel={() => setViewerVisible(false)}
        onConfirm={() => setViewerVisible(false)}
        settings={settings}
        routeLocations={viewerLocations}
        readOnly={true}
      />
    </div>
  );
}
