import React, { useEffect, useState } from 'react';
import { Notice } from 'obsidian';
import { Place, RouteSegment, TravelMode } from '../../types/roadmap';
import { RouteCalculationService } from '../../services/RouteCalculationService';
import { t } from '../../i18n';

interface Props {
  visible: boolean;
  initial?: RouteSegment;
  /** 起终点：用于"自动计算" */
  from?: Place;
  to?: Place;
  settings: any;
  /** 路线级 map_provider 覆盖 */
  preferredProvider?: 'google' | 'gaode';
  onCancel: () => void;
  onConfirm: (seg: RouteSegment) => void;
  onDelete?: () => void;
}

const MODE_KEYS: TravelMode[] = ['walk', 'bicycle', 'two_wheeler', 'drive', 'transit'];

// Monochrome line glyphs (stroke = currentColor so they tint gold when the
// segment is active). Kept minimal/geometric to read at 20px inside the
// segmented control and to match the field-journal hairline aesthetic.
const MODE_ICON: Record<TravelMode, React.ReactNode> = {
  walk: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 7v6" />
      <path d="M12 13l-2.5 5" />
      <path d="M12 13l2.5 5" />
      <path d="M9 10h6" />
    </svg>
  ),
  bicycle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="16" r="3.5" />
      <circle cx="18" cy="16" r="3.5" />
      <path d="M6 16l4-6h5" />
      <path d="M10 10l2.5 6" />
      <path d="M14.5 7.5H17" />
    </svg>
  ),
  two_wheeler: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="17" r="3" />
      <circle cx="19" cy="17" r="3" />
      <path d="M5 17l4-5h6l3 5" />
      <path d="M9 12l-2-3H5" />
      <path d="M14.5 9.5H17" />
    </svg>
  ),
  drive: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11" />
      <rect x="3.5" y="11" width="17" height="5" rx="1.2" />
      <circle cx="7.5" cy="16.5" r="1.4" />
      <circle cx="16.5" cy="16.5" r="1.4" />
    </svg>
  ),
  transit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="12" height="13" rx="2.4" />
      <path d="M6 11h12" />
      <path d="M9.5 14.2h.01" />
      <path d="M14.5 14.2h.01" />
      <path d="M9 17l-2 3" />
      <path d="M15 17l2 3" />
    </svg>
  ),
};

export default function RouteSegmentEditModal({
  visible, initial, from, to, settings, preferredProvider, onCancel, onConfirm, onDelete,
}: Props) {
  const [travelMode, setTravelMode] = useState<TravelMode>(initial?.travelMode || 'transit');
  const [distance, setDistance] = useState<string>(initial?.distance != null ? String(initial.distance) : '');
  const [duration, setDuration] = useState<string>(initial?.duration != null ? String(initial.duration) : '');
  const [tolls, setTolls] = useState<string>(initial?.tolls != null ? String(initial.tolls) : '');
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    if (visible) {
      setTravelMode(initial?.travelMode || 'transit');
      setDistance(initial?.distance != null ? String(initial.distance) : '');
      setDuration(initial?.duration != null ? String(initial.duration) : '');
      setTolls(initial?.tolls != null ? String(initial.tolls) : '');
    }
  }, [visible, initial]);

  const resolveProvider = (): 'google' | 'gaode' => {
    if (preferredProvider) return preferredProvider;
    return settings?.mapApiProvider === 'gaode' ? 'gaode' : 'google';
  };

  // 实际计算逻辑。mode 显式传入：改交通方式时用的是最新值，而 setTravelMode
  // 是异步的，直接读 state 会拿到旧值。silent=true 用于「切换交通方式自动重算」
  // 场景，失败时不弹 Notice（避免没坐标的段每点一下就报错）。
  const runCalculate = async (mode: TravelMode, silent = false): Promise<void> => {
    if (!from || !to) {
      if (!silent) new Notice(t('modal.routeSegment.noEndpoints'));
      return;
    }
    setCalculating(true);
    try {
      const service = new RouteCalculationService(settings?.googleMapsApiKey, settings?.gaodeWebServiceKey);
      const provider = resolveProvider();
      const result = await service.calculateRoute(from, to, mode, provider);
      if (!result) {
        if (!silent) new Notice(t('modal.routeSegment.calcFailed'));
        return;
      }
      setDistance(String(result.distance));
      setDuration(String(result.duration));
      if (typeof result.tolls === 'number') setTolls(String(result.tolls));
    } catch (e) {
      console.warn('[RouteSegmentEditModal] auto calc failed', e);
      if (!silent) new Notice(t('modal.routeSegment.calcFailedShort'));
    } finally {
      setCalculating(false);
    }
  };

  const autoCalculate = () => runCalculate(travelMode);

  // 改交通方式即重算距离/时间（有起终点时）—— 不同模式距离/时长不同，留旧值会误导。
  const changeMode = (mode: TravelMode) => {
    if (mode === travelMode || calculating) return;
    setTravelMode(mode);
    if (from && to) void runCalculate(mode, true);
  };

  const handleSave = () => {
    const seg: RouteSegment = { travelMode };
    const d = parseFloat(distance);
    const t = parseFloat(duration);
    const to_ = parseFloat(tolls);
    if (!isNaN(d)) seg.distance = d;
    if (!isNaN(t)) seg.duration = t;
    if (!isNaN(to_)) seg.tolls = to_;
    onConfirm(seg);
  };

  if (!visible) return null;

  return (
    <div className="lac-confirm-mask" onClick={(e) => { if (e.currentTarget === e.target) onCancel(); }}>
      <div className="lac-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lac-confirm-content">
          <div className="lac-confirm-eyebrow lac-eyebrow">route segment</div>
          <h2 className="lac-confirm-title-serif lac-serif">{t('modal.routeSegment.title')}</h2>
          <div className="form-grid">
            <label>{t('modal.routeSegment.travelMode')}</label>
            <div className="lac-mode-seg" role="radiogroup" aria-label={t('modal.routeSegment.travelMode')}>
              {MODE_KEYS.map(m => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={travelMode === m}
                  className={`lac-mode-seg-item${travelMode === m ? ' is-active' : ''}`}
                  onClick={() => changeMode(m)}
                  disabled={calculating}
                >
                  <span className="lac-mode-seg-glyph" aria-hidden="true">{MODE_ICON[m]}</span>
                  <span className="lac-mode-seg-label">{t(`modal.routeSegment.mode.${m}`)}</span>
                </button>
              ))}
            </div>

            <label>{t('modal.routeSegment.distance')}</label>
            <input
              type="number"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />

            <label>{t('modal.routeSegment.duration')}</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />

            <label>{t('modal.routeSegment.tolls')}</label>
            <input
              type="number"
              value={tolls}
              onChange={(e) => setTolls(e.target.value)}
            />
          </div>

          <div className="lac-confirm-actions lac-confirm-actions--centered">
            <button
              type="button"
              className="lac-btn lac-btn-cancel"
              onClick={autoCalculate}
              disabled={calculating || !from || !to}
              title={!from || !to ? t('modal.routeSegment.noEndpoints') : t('modal.routeSegment.autoCalc')}
            >{calculating ? t('modal.routeSegment.calculating') : t('modal.routeSegment.autoCalc')}</button>
            {initial && onDelete ? (
              <button type="button" className="lac-btn lac-btn-danger" onClick={onDelete}>{t('modal.common.delete')}</button>
            ) : null}
            <button type="button" className="lac-btn lac-btn-cancel" onClick={onCancel}>{t('modal.common.cancel')}</button>
            <button type="button" className="lac-btn lac-btn-confirm" onClick={handleSave}>{t('modal.common.save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
