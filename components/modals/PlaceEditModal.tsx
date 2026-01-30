import { useEffect, useState } from 'react';
import { MapLocation } from '../../types/map';
import MapSelector from '../map/MapSelector';
import DatePicker from '../DatePicker';
import TimePicker from '../TimePicker';
import AddressInput from '../map/AddressInput';
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
}

export default function PlaceEditModal({ visible, initial, settings, onCancel, onConfirm }: Props) {
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
  return (
    <div className="lifeflow-confirm-mask" onClick={(e) => { if (e.currentTarget === e.target) onCancel(); }}>
      <div className="lifeflow-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lifeflow-confirm-content">
          <div className="lifeflow-confirm-title">编辑地点</div>
          <div className="form-grid">
            <label>名称 *</label>
            <input
              type="text"
              value={name}
              placeholder="地点名称"
              className={nameError ? 'lf-input-error' : undefined}
              onChange={(e) => { setNameError(''); handleInputChange('name', e.target.value); }}
            />
            {nameError && <div className="lf-field-error">{nameError}</div>}

            <label>地址</label>
            {settings.mapApiProvider === 'none' ? (
              <input
                type="text"
                value={address?.name || ''}
                onChange={(e) => setAddress(e.target.value ? { name: e.target.value } : undefined)}
                placeholder="地址"
              />
            ) : (
              <AddressInput
                value={address?.name || ''}
                onChange={(value) => setAddress(value ? { name: value } : undefined)}
                onMapClick={() => setPickerVisible(true)}
                placeholder="点击选择地址"
              />
            )}

            <label>开始时间</label>
            <div className="lf-time-input-group">
              <input
                type="text"
                value={extractDateFromTime(start) || ''}
                placeholder="日期"
                readOnly
                onClick={() => openDatePicker('start')}
                className="lf-time-input lf-date-input"
              />
              <input
                type="text"
                value={extractTimeFromDateTime(start) || ''}
                placeholder="时间"
                readOnly
                onClick={() => openTimePicker('start')}
                className="lf-time-input lf-time-input"
              />
            </div>

            <label>结束时间</label>
            <div className="lf-time-input-group">
              <input
                type="text"
                value={extractDateFromTime(end) || ''}
                placeholder="日期"
                readOnly
                onClick={() => openDatePicker('end')}
                className="lf-time-input lf-date-input"
              />
              <input
                type="text"
                value={extractTimeFromDateTime(end) || ''}
                placeholder="时间"
                readOnly
                onClick={() => openTimePicker('end')}
                className="lf-time-input lf-time-input"
              />
            </div>
            {timeError && <div className="lf-field-error">{timeError}</div>}

            <label>描述</label>
            <textarea
              value={desc}
              placeholder="描述"
              onChange={(e) => handleInputChange('description', e.target.value)}
            />
          </div>

          <div className="lifeflow-confirm-actions">
            <button className="lf-btn lf-btn-cancel" onClick={onCancel}>取消</button>
            <button className="lf-btn lf-btn-confirm" onClick={handleSave}>保存</button>
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
          gaodeWebServiceKey: settings.gaodeWebServiceKey,
          googleMapsApiKey: settings.googleMapsApiKey
        }}
      />
    </div>
  );
}
