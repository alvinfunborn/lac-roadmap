import { useEffect, useState } from 'react';
import { MapLocation } from '../../types/map';
import MapSelector from '../map/MapSelector';
import DatePicker from '../DatePicker';
import TimePicker from '../TimePicker';
import PlaceStaticMap from '../PlaceStaticMap';
import { extractDateFromTime, extractTimeFromDateTime, validateTimeFormat, validateTimeRange } from '../../utils/timeValidation';

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
}

export default function PlaceEditModal({ visible, initial, settings, onCancel, onConfirm, onDelete, routeLocations }: Props) {
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
        setTimeError('时间格式无效');
      } else {
        setTimeError('');
      }
    } else if (field === 'end_time') {
      setEnd(value);
      if (value && !validateTimeFormat(value)) {
        setTimeError('时间格式无效');
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
      setNameError('名称不能为空');
      return;
    }
    setNameError('');

    // 验证时间格式
    if (start && !validateTimeFormat(start)) {
      setTimeError('开始时间格式无效');
      return;
    }
    if (end && !validateTimeFormat(end)) {
      setTimeError('结束时间格式无效');
      return;
    }

    // 验证时间范围
    const timeRangeValidation = validateTimeRange(start, end);
    if (!timeRangeValidation.valid) {
      setTimeError(timeRangeValidation.error || '时间范围无效');
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
            {initial?.name ? 'edit place' : 'new place'}
          </div>
          <h2 className="lac-confirm-title-serif lac-serif">
            {initial?.name || name || '新地点'}
          </h2>
          <div className="lac-place-form">
            {/* NAME */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">name</span>
              </div>
              <input
                type="text"
                value={name}
                placeholder="地点名称"
                className={`lac-place-name-input${nameError ? ' lac-input-error' : ''}`}
                onChange={(e) => { setNameError(''); handleInputChange('name', e.target.value); }}
              />
              {nameError && <div className="lac-field-error">{nameError}</div>}
            </section>

            {/* WHEN — single line, date + bold time → date + bold time */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">when</span>
              </div>
              <div className="lac-place-when-row">
                <button type="button" className="lac-place-when-date" onClick={() => openDatePicker('start')}>
                  {extractDateFromTime(start) || <span className="lac-place-when-placeholder">日期</span>}
                </button>
                <button type="button" className="lac-place-when-time" onClick={() => openTimePicker('start')}>
                  {extractTimeFromDateTime(start) || <span className="lac-place-when-placeholder">--:--</span>}
                </button>
                <span className="lac-place-when-arrow">→</span>
                <button type="button" className="lac-place-when-date" onClick={() => openDatePicker('end')}>
                  {extractDateFromTime(end) || <span className="lac-place-when-placeholder">日期</span>}
                </button>
                <button type="button" className="lac-place-when-time" onClick={() => openTimePicker('end')}>
                  {extractTimeFromDateTime(end) || <span className="lac-place-when-placeholder">--:--</span>}
                </button>
              </div>
              {timeError && <div className="lac-field-error">{timeError}</div>}
            </section>

            {/* WHERE — address + coords on the left, MAP thumb on the right */}
            <section className="lac-place-section">
              <div className="lac-place-section-head">
                <span className="lac-eyebrow">where</span>
                {coordHint && <span className="lac-place-where-hint">{coordHint}</span>}
              </div>
              <div className="lac-place-where-row">
                <div className="lac-place-where-text">
                  {settings.mapApiProvider === 'none' ? (
                    <input
                      type="text"
                      value={address?.name || ''}
                      onChange={(e) => setAddress(e.target.value ? { name: e.target.value } : undefined)}
                      placeholder="地址"
                      className="lac-place-where-input"
                    />
                  ) : (
                    <input
                      type="text"
                      value={address?.name || ''}
                      placeholder="点击选择地址"
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
                    aria-label="选择地图位置"
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
                      const live = { lat: address!.latitude!, lng: address!.longitude!, coordinate_system: address!.coordinate_system };
                      const base = (routeLocations || [])
                        .filter(l => typeof l.latitude === 'number' && typeof l.longitude === 'number')
                        .map(l => ({ lat: l.latitude!, lng: l.longitude!, coordinate_system: l.coordinate_system, _name: l.name }));
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
                          preferredProvider={settings.mapApiProvider as 'google' | 'gaode' | undefined}
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
                <span className="lac-eyebrow">notes</span>
              </div>
              <textarea
                value={desc}
                placeholder="描述"
                className="lac-place-notes-input"
                onChange={(e) => handleInputChange('description', e.target.value)}
              />
            </section>
          </div>

          <div className="lac-place-actions">
            {initial?.name && onDelete ? (
              <button type="button" className="lac-btn lac-btn-danger lac-place-action-delete" onClick={onDelete}>delete</button>
            ) : <span className="lac-place-action-spacer" />}
            <div className="lac-place-action-trailing">
              <button type="button" className="lac-btn lac-btn-cancel" onClick={onCancel}>cancel</button>
              <button type="button" className="lac-btn lac-btn-confirm" onClick={handleSave}>save</button>
            </div>
          </div>
        </div>
      </div>

      <DatePicker
        visible={!!datePickerVisibleFor}
        value={extractDateFromTime((datePickerVisibleFor === 'start' ? start : end) || '') || ''}
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
        title={timePickerVisibleFor === 'start' ? '开始时间' : '结束时间'}
      />

      <MapSelector
        visible={pickerVisible}
        initialLocation={address}
        onCancel={() => setPickerVisible(false)}
        onConfirm={(loc) => { setAddress(loc); setPickerVisible(false); }}
        settings={{
          mapApiProvider: settings.mapApiProvider,
          gaodeJsApiKey: settings.gaodeJsApiKey,
          gaodeWebServiceKey: settings.gaodeWebServiceKey,
          googleMapsApiKey: settings.googleMapsApiKey
        }}
        routeLocations={routeLocations}
      />
    </div>
  );
}
