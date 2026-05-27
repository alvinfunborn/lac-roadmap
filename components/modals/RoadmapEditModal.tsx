import React, { useEffect, useMemo, useState } from 'react';
import { MapLocation } from '../../types/map';
import { MapProviderKind, RoadmapDetail, Place, RouteSegment, hasCoords } from '../../types/roadmap';
import DatePicker from '../DatePicker';
import PlaceStaticMap, { PlacePoint } from '../PlaceStaticMap';
import MapSelector from '../map/MapSelector';
import { getPlaceStatus } from '../../utils/placeStatus';
import { t } from '../../i18n';

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

/** 派生：items 中第一个有 start_time 的 place 的日期部分（YYYY-MM-DD）。
 *  trip 不再单独维护 start_time —— 显示与编辑都以首个地点的日期为准。 */
function firstPlaceDate(items: Array<Place | RouteSegment> | undefined): string {
  if (!items) return '';
  for (const it of items) {
    if (it && typeof it === 'object' && 'name' in it && 'detail' in it) {
      const p = it as Place;
      const st = p.detail?.start_time;
      if (st) return String(st).slice(0, 10);
    }
  }
  return '';
}

export default function RoadmapEditModal({ visible, initial, mode, settings, onCancel, onConfirm, onDelete, items }: Props) {
  const [name, setName] = useState(initial?.name || '');
  const [desc, setDesc] = useState(initial?.detail?.description || '');
  const [start, setStart] = useState('');
  const [mapProvider, setMapProvider] = useState<string>(initial?.detail?.map_provider || FOLLOW_GLOBAL);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [nameError, setNameError] = useState('');
  // 缩略图点开后的「只读全景地图」遮罩。仅在 items 里至少有一个带坐标的
  // 地点时才开放（thumb 为 placeholder 时不开）。Esc / 背景点击关闭。
  const [viewerVisible, setViewerVisible] = useState(false);

  const derivedStart = useMemo(() => firstPlaceDate(items), [items]);

  useEffect(() => {
    if (visible) {
      setName(initial?.name || '');
      setDesc(initial?.detail?.description || '');
      // start 从 items 派生 —— 用户改它会触发全部地点日期顺移（saveMetaEditor）。
      // 没有任何 dated place 时回退到 detail.start_time（旧数据兼容），最后空串。
      setStart(derivedStart || initial?.detail?.start_time?.slice(0, 10) || '');
      setMapProvider(initial?.detail?.map_provider || FOLLOW_GLOBAL);
      setNameError('');
    }
  }, [visible, initial, derivedStart]);

  const handleSave = () => {
    if (!name.trim()) {
      setNameError(t('modal.common.nameRequired'));
      return;
    }
    setNameError('');
    // 路线不再有自己的「点」(detail.address)；它的位置就是 items 序列。
    // end_time 已经从 UI 里彻底拿掉（它必然等于末位 place 的日期，没有独立含义），
    // saveMetaEditor 落盘前会按 items 重新派生 start_time / end_time 写回 detail。
    const detail: RoadmapDetail = {};
    if (desc) detail.description = desc;
    if (start) detail.start_time = start;
    if (mapProvider && mapProvider !== FOLLOW_GLOBAL) {
      detail.map_provider = mapProvider as MapProviderKind;
    }
    onConfirm({ name: name.trim(), detail });
  };

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
        status: getPlaceStatus(p),
      };
    });
  }, [placesWithCoords]);

  if (!visible) return null;

  const titleStatus = mode === 'create' ? t('modal.trip.status.draft') : t('modal.trip.status.editing');
  const startDate = start ? start.slice(0, 10) : '';

  return (
    <div className="lac-confirm-mask" onClick={(e) => { if (e.currentTarget === e.target) onCancel(); }}>
      <div className="lac-confirm-modal lac-place-edit-modal lac-trip-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lac-confirm-content">
          <div className="lac-confirm-eyebrow lac-eyebrow">
            {mode === 'create' ? t('modal.trip.create.eyebrow') : t('modal.trip.edit.eyebrow')}
          </div>
          <h2 className="lac-confirm-title-serif lac-serif lac-trip-title">
            {name || (mode === 'create' ? t('modal.trip.create.title') : initial?.name || t('modal.trip.fallback.title'))}
            <span className="lac-trip-title-status"> · {titleStatus}</span>
          </h2>

          <div className="lac-place-form">
            {/* NAME */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">{t('modal.place.section.name')}</span>
                <span className="lac-place-where-hint">{t('modal.trip.section.required')}</span>
              </div>
              <input
                type="text"
                value={name}
                placeholder={t('modal.trip.placeholder.name')}
                className={`lac-place-name-input lac-trip-name-input${nameError ? ' lac-input-error' : ''}`}
                onChange={(e) => { setNameError(''); setName(e.target.value); }}
                autoFocus
              />
              {nameError && <div className="lac-field-error">{nameError}</div>}
            </section>

            {/* NOTES */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">{t('modal.place.section.notes')}</span>
              </div>
              <textarea
                value={desc}
                placeholder={t('modal.trip.placeholder.notes')}
                className="lac-place-notes-input"
                onChange={(e) => setDesc(e.target.value)}
              />
            </section>

            {/* WHEN — only the start date. End date was removed (always equals
                the last place's date — no independent meaning). Editing start
                shifts ALL places by the resulting delta in saveMetaEditor. */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">{t('modal.place.section.when')}</span>
              </div>
              <div className="lac-trip-when-row">
                <button type="button" className="lac-place-when-date lac-trip-when-date" onClick={() => setDatePickerVisible(true)}>
                  {startDate || <span className="lac-place-when-placeholder">{t('modal.trip.placeholder.startDate')}</span>}
                </button>
              </div>
            </section>

            {/* WHERE — 路线本身没有「自选地址」；显示从 items 计算出的起点 /
                终点（read-only），右侧缩略图自动适配整条路线的所有地点。 */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">{t('modal.place.section.where')}</span>
                {placesWithCoords.length > 0 && (
                  <span className="lac-place-where-hint">{t('modal.trip.pts', { n: placesWithCoords.length })}</span>
                )}
              </div>
              <div className="lac-place-where-row">
                <div className="lac-place-where-text">
                  {placesWithCoords.length === 0 ? (
                    <div className="lac-place-where-coords">{t('modal.trip.noPlaces')}</div>
                  ) : (
                    <>
                      <div className="lac-trip-endpoint">
                        <span className="lac-trip-endpoint-label">{t('modal.trip.endpoint.start')}</span>
                        <span className="lac-trip-endpoint-name">{startPlace!.name}</span>
                      </div>
                      <div className="lac-trip-endpoint">
                        <span className="lac-trip-endpoint-label">{t('modal.trip.endpoint.end')}</span>
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
                    return {
                      lat: loc.latitude!,
                      lng: loc.longitude!,
                      coordinate_system: loc.coordinate_system,
                      status: getPlaceStatus(p),
                    };
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
                        aria-label={t('modal.trip.thumbAria')}
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
                      aria-label={t('modal.trip.viewerAria')}
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
                <span className="lac-eyebrow">{t('modal.trip.section.provider')}</span>
                {mapProvider === FOLLOW_GLOBAL && <span className="lac-place-where-hint">{t('modal.trip.provider.followGlobal')}</span>}
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
              <button type="button" className="lac-btn lac-btn-danger lac-place-action-delete" onClick={onDelete}>{t('modal.trip.delete.button')}</button>
            ) : <span className="lac-place-action-spacer" />}
            <div className="lac-place-action-trailing">
              <button type="button" className="lac-btn lac-btn-cancel" onClick={onCancel}>{t('modal.trip.cancel')}</button>
              <button type="button" className="lac-btn lac-btn-confirm" onClick={handleSave}>{mode === 'create' ? t('modal.trip.create.button') : t('modal.trip.save.button')}</button>
            </div>
          </div>
        </div>
      </div>

      <DatePicker
        visible={datePickerVisible}
        value={start}
        onCancel={() => setDatePickerVisible(false)}
        onClear={() => { setStart(''); setDatePickerVisible(false); }}
        onConfirm={(val) => { setStart(val); setDatePickerVisible(false); }}
      />

      <MapSelector
        visible={viewerVisible}
        onCancel={() => setViewerVisible(false)}
        onConfirm={() => setViewerVisible(false)}
        settings={{
          ...settings,
          // 用 trip 当前选定的 provider 覆盖全局；FOLLOW_GLOBAL 时落回全局值
          mapApiProvider: mapProvider === FOLLOW_GLOBAL ? settings.mapApiProvider : mapProvider,
        }}
        routeLocations={viewerLocations}
        readOnly={true}
      />
    </div>
  );
}
