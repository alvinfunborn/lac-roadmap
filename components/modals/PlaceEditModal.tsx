import { useEffect, useState } from 'react';
import { MapLocation } from '../../types/map';
import MapSelector from '../map/MapSelector';

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

  useEffect(() => {
    if (visible) {
      setName(initial?.name || '');
      setStart(initial?.start_time || '');
      setEnd(initial?.end_time || '');
      setDesc(initial?.description || '');
      setAddress(initial?.address);
    }
  }, [visible, initial]);

  if (!visible) return null;
  return (
    <div className="lf-map-selector-mask" onClick={(e) => { if (e.currentTarget === e.target) onCancel(); }}>
      <div className="lifeflow-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lifeflow-confirm-content">
          <div className="lifeflow-confirm-title">编辑地点</div>
          <div className="lac-space" />
          <div className="lac-row">
            <input className="lf-map-search-input" placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="lac-space" />
          <div className="lac-row">
            <input className="lf-map-search-input" placeholder="开始时间 YYYY-MM-DD HH:mm:ss" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="lac-space" />
          <div className="lac-row">
            <input className="lf-map-search-input" placeholder="结束时间 YYYY-MM-DD HH:mm:ss" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="lac-space" />
          <div className="lac-row">
            <input className="lf-map-search-input" placeholder="描述" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="lac-space" />
          <div className="lac-row">
            <input className="lf-map-search-input" placeholder="地址（点按右侧按钮从地图选择）" readOnly value={address?.name || ''} />
            <button className="lf-btn" onClick={() => setPickerVisible(true)}>地图</button>
          </div>
          <div className="lac-space" />
          <div className="lifeflow-confirm-actions">
            <button className="lf-btn lf-btn-cancel" onClick={onCancel}>取消</button>
            <button
              className="lf-btn lf-btn-confirm"
              onClick={() => onConfirm({ name, start_time: start, end_time: end, description: desc, address })}
            >保存</button>
          </div>
        </div>
      </div>

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


