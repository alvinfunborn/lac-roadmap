import { useEffect, useState } from 'react';
import { MapLocation } from '../../types/map';
import MapSelector from '../map/MapSelector';
import DatePicker from '../DatePicker';
import TimePicker from '../TimePicker';
import PlaceStaticMap from '../PlaceStaticMap';
import { extractDateFromTime, extractTimeFromDateTime, validateTimeFormat, validateTimeRange } from '../../utils/timeValidation';
import { t } from '../../i18n';

interface Props {
  visible: boolean;
  initial?: {
    name?: string;
    start_time?: string;
    end_time?: string;
    description?: string;
    address?: MapLocation;
  };
  settings: any;
  onCancel: () => void;
  onConfirm: (data: {
    name: string;
    start_time?: string;
    end_time?: string;
    description?: string;
    address?: MapLocation;
  }) => void;
  onDelete?: () => void;
  /** All existing place locations of the parent roadmap — passed through
   *  to MapSelector so the trip's other pins / connecting polyline show
   *  as visual context while the user picks an address. */
  routeLocations?: MapLocation[];
  /** 父路线 detail.map_provider —— 优先于全局 settings.mapApiProvider，
   *  让"trip 选了高德"时这条 trip 内新增/编辑地点的地图选择器与缩略图都
   *  用高德，不会被全局默认的 Google 抢走。 */
  preferredProvider?: 'gaode' | 'google';
  /** 打开日期选择器时，没有现成日期的回退落点（YYYY-MM-DD）—— 用 trip 的
   *  start_time 让用户不用从今天往后翻几年；不影响 picker 的清空/取消行为。 */
  defaultPickerDate?: string;
}

export default function PlaceEditModal({ visible, initial, settings, onCancel, onConfirm, onDelete, routeLocations, preferredProvider, defaultPickerDate }: Props) {
  const [name, setName] = useState(initial?.name || '');
  const [start, setStart] = useState(initial?.start_time || '');
  const [end, setEnd] = useState(initial?.end_time || '');
  const [desc, setDesc] = useState(initial?.description || '');
  const [address, setAddress] = useState<MapLocation | undefined>(initial?.address);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [datePickerVisibleFor, setDatePickerVisibleFor] = useState(null as null | 'start' | 'end');
  const [timePickerVisibleFor, setTimePickerVisibleFor] = useState(null as null | 'start' | 'end');
  const [nameError, setNameError] = useState('');
  const [timeError, setTimeError] = useState('');

  useEffect(() => {
    if (visible) {
      setName(initial?.name || '');
      setStart(initial?.start_time || '');
      setEnd(initial?.end_time || '');
      setDesc(initial?.description || '');
      setAddress(initial?.address);
      setNameError('');
      setTimeError('');
    }
  }, [visible, initial]);

  const handleInputChange = (field: 'name' | 'start_time' | 'end_time' | 'description', value: string) => {
    if (field === 'name') {
      setName(value);
      setNameError('');
    } else if (field === 'start_time') {
      setStart(value);
      if (value && !validateTimeFormat(value)) {
        setTimeError(t('modal.place.timeInvalid'));
      } else {
        setTimeError('');
      }
    } else if (field === 'end_time') {
      setEnd(value);
      if (value && !validateTimeFormat(value)) {
        setTimeError(t('modal.place.timeInvalid'));
      } else {
        setTimeError('');
      }
    } else if (field === 'description') {
      setDesc(value);
    }
  };

  const openDatePicker = (which: 'start' | 'end') => setDatePickerVisibleFor(which);
  const clearDate = (which: 'start' | 'end') => {
    const field = which === 'start' ? 'start_time' : 'end_time';
    const currentValue = which === 'start' ? start : end;
    const timePart = extractTimeFromDateTime(currentValue);
    handleInputChange(field, timePart || '');
  };
  const confirmDate = (val: string) => {
    if (!datePickerVisibleFor) return;
    const field = datePickerVisibleFor === 'start' ? 'start_time' : 'end_time';
    const currentValue = datePickerVisibleFor === 'start' ? start : end;
    const timePart = extractTimeFromDateTime(currentValue);
    const newValue = timePart ? `${val} ${timePart}` : val;
    handleInputChange(field, newValue);
    setDatePickerVisibleFor(null);
  };
  const cancelDate = () => setDatePickerVisibleFor(null);

  const openTimePicker = (which: 'start' | 'end') => setTimePickerVisibleFor(which);
  const clearTime = (which: 'start' | 'end') => {
    const field = which === 'start' ? 'start_time' : 'end_time';
    const currentValue = which === 'start' ? start : end;
    const datePart = extractDateFromTime(currentValue);
    handleInputChange(field, datePart || '');
  };
  const confirmTime = (val: string) => {
    if (!timePickerVisibleFor) return;
    const field = timePickerVisibleFor === 'start' ? 'start_time' : 'end_time';
    const currentValue = timePickerVisibleFor === 'start' ? start : end;
    const datePart = extractDateFromTime(currentValue);
    const newValue = datePart ? `${datePart} ${val}` : val;
    handleInputChange(field, newValue);
    setTimePickerVisibleFor(null);
  };
  const cancelTime = () => setTimePickerVisibleFor(null);

  const handleSave = () => {
    if (!name.trim()) {
      setNameError(t('modal.common.nameRequired'));
      return;
    }
    setNameError('');

    if (start && !validateTimeFormat(start)) {
      setTimeError(t('modal.place.startTimeInvalid'));
      return;
    }
    if (end && !validateTimeFormat(end)) {
      setTimeError(t('modal.place.endTimeInvalid'));
      return;
    }

    const timeRangeValidation = validateTimeRange(start, end);
    if (!timeRangeValidation.valid) {
      setTimeError(timeRangeValidation.error || t('modal.place.timeRangeInvalid'));
      return;
    }

    setTimeError('');
    onConfirm({ name, start_time: start, end_time: end, description: desc, address });
  };

  if (!visible) return null;

  const coordSystem = (address?.coordinate_system || '').toUpperCase();
  const hasCoords = typeof address?.latitude === 'number' && typeof address?.longitude === 'number';
  const coordHint = hasCoords
    ? (coordSystem === 'GCJ-02' || coordSystem === 'GCJ02' ? 'GCJ-02 → WGS84' : 'WGS84')
    : '';
  const latText = hasCoords ? `${address!.latitude!.toFixed(4)}°${address!.latitude! >= 0 ? 'N' : 'S'}` : '';
  const lngText = hasCoords ? `${address!.longitude!.toFixed(4)}°${address!.longitude! >= 0 ? 'E' : 'W'}` : '';

  return (
    <div className="lac-confirm-mask" onClick={(e) => { if (e.currentTarget === e.target) onCancel(); }}>
      <div className="lac-confirm-modal lac-place-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lac-confirm-content">
          <div className="lac-confirm-eyebrow lac-eyebrow">
            {initial?.name ? t('modal.place.edit.eyebrow') : t('modal.place.create.eyebrow')}
          </div>
          <h2 className="lac-confirm-title-serif lac-serif">
            {initial?.name || name || t('modal.place.defaultTitle')}
          </h2>
          <div className="lac-place-form">
            {/* NAME */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">{t('modal.place.section.name')}</span>
              </div>
              <input
                type="text"
                value={name}
                placeholder={t('modal.place.placeholder.name')}
                className={`lac-place-name-input${nameError ? ' lac-input-error' : ''}`}
                onChange={(e) => { setNameError(''); handleInputChange('name', e.target.value); }}
              />
              {nameError && <div className="lac-field-error">{nameError}</div>}
            </section>

            {/* WHEN — single line, date + bold time → date + bold time */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">{t('modal.place.section.when')}</span>
              </div>
              <div className="lac-place-when-row">
                <button type="button" className="lac-place-when-date" onClick={() => openDatePicker('start')}>
                  {extractDateFromTime(start) || <span className="lac-place-when-placeholder">{t('modal.place.placeholder.date')}</span>}
                </button>
                <button type="button" className="lac-place-when-time" onClick={() => openTimePicker('start')}>
                  {extractTimeFromDateTime(start) || <span className="lac-place-when-placeholder">{t('modal.place.placeholder.time')}</span>}
                </button>
                <span className="lac-place-when-arrow">→</span>
                <button type="button" className="lac-place-when-date" onClick={() => openDatePicker('end')}>
                  {extractDateFromTime(end) || <span className="lac-place-when-placeholder">{t('modal.place.placeholder.date')}</span>}
                </button>
                <button type="button" className="lac-place-when-time" onClick={() => openTimePicker('end')}>
                  {extractTimeFromDateTime(end) || <span className="lac-place-when-placeholder">{t('modal.place.placeholder.time')}</span>}
                </button>
              </div>
              {timeError && <div className="lac-field-error">{timeError}</div>}
            </section>

            {/* WHERE — address + coords on the left, MAP thumb on the right */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">{t('modal.place.section.where')}</span>
                {coordHint && <span className="lac-place-where-hint">{coordHint}</span>}
              </div>
              <div className="lac-place-where-row">
                <div className="lac-place-where-text">
                  {settings.mapApiProvider === 'none' ? (
                    <input
                      type="text"
                      value={address?.name || ''}
                      onChange={(e) => setAddress(e.target.value ? { name: e.target.value } : undefined)}
                      placeholder={t('modal.place.placeholder.address')}
                      className="lac-place-where-input"
                    />
                  ) : (
                    <input
                      type="text"
                      value={address?.name || ''}
                      placeholder={t('modal.place.placeholder.addressClick')}
                      readOnly
                      onClick={() => setPickerVisible(true)}
                      className="lac-place-where-input lac-place-where-input--clickable"
                    />
                  )}
                  {hasCoords && (
                    <div className="lac-place-where-coords">
                      <span>{latText}</span>
                      <span className="lac-place-where-coords-sep">·</span>
                      <span>{lngText}</span>
                    </div>
                  )}
                </div>
                {settings.mapApiProvider !== 'none' && (
                  <button
                    type="button"
                    className="lac-place-where-thumb"
                    onClick={() => setPickerVisible(true)}
                    aria-label={t('modal.place.mapAria')}
                  >
                    {hasCoords ? (() => {
                      // Render the same multi-point thumb the cards use:
                      // every geocoded place in the trip shows alongside
                      // the one being edited, with the edited one
                      // highlighted as the focus. Build the array by
                      // preserving the trip's order from `routeLocations`,
                      // then swap in the live-edit `address` at the
                      // matching slot (so a coord-drag updates the thumb
                      // in real time). New places (no `initial.name`
                      // match) get appended at the end.
                      // live status: 当前表单里有 start_time 视作 'plan'，否则 'wish'。
                      // 这样用户在 modal 里修改日期时缩略图的本点配色立即响应。
                      const liveStatus = start ? 'plan' : 'wish';
                      const live = {
                        lat: address!.latitude!,
                        lng: address!.longitude!,
                        coordinate_system: address!.coordinate_system,
                        status: liveStatus as 'plan' | 'wish',
                      };
                      const base = (routeLocations || [])
                        .filter(l => typeof l.latitude === 'number' && typeof l.longitude === 'number')
                        .map(l => ({
                          lat: l.latitude!,
                          lng: l.longitude!,
                          coordinate_system: l.coordinate_system,
                          status: l.status,
                          _name: l.name,
                        }));
                      let idx = initial?.name ? base.findIndex(p => p._name === initial.name) : -1;
                      if (idx >= 0) {
                        base[idx] = { ...live, _name: address?.name || '' };
                      } else {
                        idx = base.length;
                        base.push({ ...live, _name: address?.name || '' });
                      }
                      const places = base.map(({ _name, ...rest }) => rest);
                      return (
                        <PlaceStaticMap
                          places={places}
                          currentIndex={idx}
                          placeName={address?.name || ''}
                          mapKey={`${address!.latitude}-${address!.longitude}-${places.length}`}
                          preferredProvider={(preferredProvider || settings.mapApiProvider) as 'google' | 'gaode' | undefined}
                          settings={settings}
                        />
                      );
                    })() : (
                      <span className="lac-place-where-thumb-label">map</span>
                    )}
                  </button>
                )}
              </div>
            </section>

            {/* NOTES */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">{t('modal.place.section.notes')}</span>
              </div>
              <textarea
                value={desc}
                placeholder={t('modal.place.placeholder.notes')}
                className="lac-place-notes-input"
                onChange={(e) => handleInputChange('description', e.target.value)}
              />
            </section>
          </div>

          <div className="lac-place-actions">
            {initial?.name && onDelete ? (
              <button type="button" className="lac-btn lac-btn-danger lac-place-action-delete" onClick={onDelete}>{t('modal.place.delete.label')}</button>
            ) : <span className="lac-place-action-spacer" />}
            <div className="lac-place-action-trailing">
              <button type="button" className="lac-btn lac-btn-cancel" onClick={onCancel}>{t('modal.place.cancel.label')}</button>
              <button type="button" className="lac-btn lac-btn-confirm" onClick={handleSave}>{t('modal.place.save.label')}</button>
            </div>
          </div>
        </div>
      </div>

      <DatePicker
        visible={!!datePickerVisibleFor}
        value={
          // 当前已选日期优先；否则用对端（开始/结束互推）；都没有就落到 trip 的
          // start_time，省去用户从今天往后翻多年的麻烦。
          extractDateFromTime((datePickerVisibleFor === 'start' ? start : end) || '')
          || extractDateFromTime((datePickerVisibleFor === 'start' ? end : start) || '')
          || (defaultPickerDate ? defaultPickerDate.slice(0, 10) : '')
          || ''
        }
        onCancel={cancelDate}
        onClear={() => { if (datePickerVisibleFor) clearDate(datePickerVisibleFor); cancelDate(); }}
        onConfirm={confirmDate}
      />
      <TimePicker
        visible={!!timePickerVisibleFor}
        value={extractTimeFromDateTime((timePickerVisibleFor === 'start' ? start : end) || '') || ''}
        onCancel={cancelTime}
        onClear={() => { if (timePickerVisibleFor) clearTime(timePickerVisibleFor); cancelTime(); }}
        onConfirm={confirmTime}
        title={timePickerVisibleFor === 'start' ? t('modal.place.timePicker.start') : t('modal.place.timePicker.end')}
      />

      <MapSelector
        visible={pickerVisible}
        initialLocation={address}
        onCancel={() => setPickerVisible(false)}
        onConfirm={(loc) => {
          setAddress(loc);
          // 地图选点的名称即地点名称：每次确认选点都同步到 name —— 创建/编辑都生效。
          // 用户仍可在确认 modal 之前手动改 name，但下一次选点会再覆盖。
          if (loc?.name) {
            setName(loc.name);
            setNameError('');
          }
          setPickerVisible(false);
        }}
        settings={{
          // trip 级 provider 优先；MapSelector 直接读 mapApiProvider 当 provider 用
          mapApiProvider: preferredProvider || settings.mapApiProvider,
          gaodeJsApiKey: settings.gaodeJsApiKey,
          gaodeWebServiceKey: settings.gaodeWebServiceKey,
          googleMapsApiKey: settings.googleMapsApiKey
        }}
        routeLocations={routeLocations}
      />
    </div>
  );
}
