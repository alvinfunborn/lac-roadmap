import React, { useEffect, useRef, useState } from 'react';

interface TimePickerProps {
  visible: boolean;
  value?: string; // HH:MM
  onCancel: () => void;
  onClear: () => void;
  onConfirm: (value: string) => void;
  title?: string;
  step?: number; // minutes step
}

export default function TimePicker({ visible, value, onCancel, onClear, onConfirm, title, step = 1 }: TimePickerProps) {
  const computeInitial = (v?: string, s: number = 1) => {
    if (v && /^\d{2}:\d{2}$/.test(v)) {
      const [h, m] = v.split(':').map((x) => parseInt(x, 10));
      return { h, m };
    }
    const now = new Date();
    return { h: now.getHours(), m: Math.floor(now.getMinutes() / s) * s };
  };
  const initial = computeInitial(value, step);

  const [hour, setHour] = useState(initial.h);
  const [minute, setMinute] = useState(initial.m);

  useEffect(() => { setHour(initial.h); setMinute(initial.m); }, [initial.h, initial.m]);

  const hours: number[] = (() => { const a: number[] = []; for (let i = 0; i < 24; i++) a.push(i); return a; })();
  const minutes: number[] = (() => { const a: number[] = []; for (let i = 0; i < Math.floor(60 / step); i++) a.push(i * step); return a; })();

  // 循环滚动：通过克隆前后各一轮，滚动到中间段
  const hourLoop: number[] = [...hours, ...hours, ...hours];
  const minuteLoop: number[] = [...minutes, ...minutes, ...minutes];

  const hourRef = useRef<HTMLDivElement | null>(null);
  const minuteRef = useRef<HTMLDivElement | null>(null);

  const scrollToSelected = (ref: React.RefObject<HTMLDivElement>, index: number, total: number) => {
    const container = ref.current;
    if (!container) return;
    const itemHeight = 36;
    const styles = getComputedStyle(container);
    const paddingTop = parseFloat(styles.paddingTop || '0') || 0;
    const centerOffset = (container.clientHeight - itemHeight) / 2;
    // 放到中间段的对应索引
    const baseIndex = total + index;
    const target = paddingTop + itemHeight * baseIndex - centerOffset;
    container.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
  };

  useEffect(() => {
    if (!visible) return;
    scrollToSelected(hourRef, hours.indexOf(hour), hours.length);
    scrollToSelected(minuteRef, minutes.indexOf(minute), minutes.length);
  }, [visible, hour, minute, step, value]);

  // 在滚动结束时保持在中间段，制造无缝循环效果
  const normalizeLoopScroll = (ref: any, total: number) => {
    const container = ref.current;
    if (!container) return;
    const itemHeight = 36;
    const styles = getComputedStyle(container);
    const paddingTop = parseFloat(styles.paddingTop || '0') || 0;
    const centerOffset = (container.clientHeight - itemHeight) / 2;
    const rawIndex = Math.round((container.scrollTop - paddingTop + centerOffset) / itemHeight);
    // 将 rawIndex 映射回中间段
    let normalized = rawIndex;
    const segmentStart = total; // 中间段起点
    const segmentEnd = total * 2 - 1; // 中间段终点索引
    if (rawIndex < segmentStart) normalized += total;
    if (rawIndex > segmentEnd) normalized -= total;
    if (normalized !== rawIndex) {
      const target = paddingTop + normalized * itemHeight - centerOffset;
      container.scrollTo({ top: target, behavior: 'auto' });
    }
  };

  if (!visible) return null;

  const onOk = () => {
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    onConfirm(`${hh}:${mm}`);
  };

  return (
    <div className="lf-picker-mask" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="lf-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lf-picker-content">
          <div className="lf-picker-title">{title || '选择时间'}</div>
          <div className="lf-wheel-container">
            <div className="lf-wheel-column">
              <div className="lf-wheel-items" ref={hourRef} onScroll={() => normalizeLoopScroll(hourRef, hours.length)}>
                {hourLoop.map((h, idx) => (
                  <div key={`h-${idx}-${h}`} className={`lf-wheel-item${h === hour ? ' selected' : ''}`} onClick={() => setHour(h)}>{String(h).padStart(2, '0')}</div>
                ))}
              </div>
            </div>
            <div className="lf-wheel-column">
              <div className="lf-wheel-items" ref={minuteRef} onScroll={() => normalizeLoopScroll(minuteRef, minutes.length)}>
                {minuteLoop.map((m, idx) => (
                  <div key={`m-${idx}-${m}`} className={`lf-wheel-item${m === minute ? ' selected' : ''}`} onClick={() => setMinute(m)}>{String(m).padStart(2, '0')}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="lf-picker-actions">
            <button className="lf-picker-btn lf-picker-btn-cancel" onClick={onCancel}>取消</button>
            <button className="lf-picker-btn lf-picker-btn-clear" onClick={onClear}>清除</button>
            <button className="lf-picker-btn lf-picker-btn-confirm" onClick={onOk}>确定</button>
          </div>
        </div>
      </div>
    </div>
  );
}

