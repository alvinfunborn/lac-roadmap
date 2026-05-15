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

  const autoCalculate = async () => {
    if (!from || !to) {
      new Notice(t('modal.routeSegment.noEndpoints'));
      return;
    }
    setCalculating(true);
    try {
      const service = new RouteCalculationService(settings?.googleMapsApiKey, settings?.gaodeWebServiceKey);
      const provider = resolveProvider();
      const result = await service.calculateRoute(from, to, travelMode, provider);
      if (!result) {
        new Notice(t('modal.routeSegment.calcFailed'));
        return;
      }
      setDistance(String(result.distance));
      setDuration(String(result.duration));
      if (typeof result.tolls === 'number') setTolls(String(result.tolls));
    } catch (e) {
      console.warn('[RouteSegmentEditModal] auto calc failed', e);
      new Notice(t('modal.routeSegment.calcFailedShort'));
    } finally {
      setCalculating(false);
    }
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
            <select
              value={travelMode}
              onChange={(e) => setTravelMode(e.target.value as TravelMode)}
              className="lac-select"
            >
              {MODE_KEYS.map(m => (
                <option key={m} value={m}>{t(`modal.routeSegment.mode.${m}`)}</option>
              ))}
            </select>

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
