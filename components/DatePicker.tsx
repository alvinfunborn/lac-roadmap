import React, { useEffect, useRef, useState } from 'react';

interface DatePickerProps {
  visible: boolean;
  value?: string; // YYYY-MM-DD
  onCancel: () => void;
  onClear: () => void;
  onConfirm: (value: string) => void;
  title?: string;
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

export default function DatePicker({ visible, value, onCancel, onClear, onConfirm, title }: DatePickerProps) {
  const parseDate = (v?: string) => {
    const d = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v) : new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  };

  const init = parseDate(value);
  const [year, setYear] = useState(init.y);
  const [month, setMonth] = useState(init.m);
  const [day, setDay] = useState(init.d);

  useEffect(() => {
    const i = parseDate(value);
    setYear(i.y); setMonth(i.m); setDay(i.d);
  }, [value]);

  const years: number[] = (() => {
    const current = new Date().getFullYear();
    const start = 1900;
    const end = current + 200;
    const arr: number[] = [];
    for (let y = start; y <= end; y++) arr.push(y);
    return arr;
  })();
  const months: number[] = (() => { const a: number[] = []; for (let i = 1; i <= 12; i++) a.push(i); return a; })();
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: number[] = (() => { const a: number[] = []; for (let i = 1; i <= daysInMonth; i++) a.push(i); return a; })();
  // 循环滚动源：月份、日期三段拼接
  const monthLoop: number[] = [...months, ...months, ...months];
  const dayLoop: number[] = [...days, ...days, ...days];

  useEffect(() => { setDay((prevDay: number) => clamp(prevDay, 1, daysInMonth)); }, [daysInMonth]);

  const yearRef = useRef<HTMLDivElement | null>(null);
  const monthRef = useRef<HTMLDivElement | null>(null);
  const dayRef = useRef<HTMLDivElement | null>(null);

  const scrollToSelected = (ref: React.RefObject<HTMLDivElement>, index: number, total?: number) => {
    const container = ref.current;
    if (!container) return;
    const itemHeight = 36; // 与 CSS 保持一致
    const styles = getComputedStyle(container);
    const paddingTop = parseFloat(styles.paddingTop || '0') || 0;
    const centerOffset = (container.clientHeight - itemHeight) / 2;
    const baseIndex = total && total > 0 ? (total + index) : index; // 循环列滚到中间段
    const target = paddingTop + itemHeight * baseIndex - centerOffset;
    container.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
  };

  useEffect(() => {
    if (!visible) return;
    scrollToSelected(yearRef, years.indexOf(year));
    scrollToSelected(monthRef, month - 1, months.length);
    scrollToSelected(dayRef, day - 1, days.length);
  }, [visible, year, month, day, years, months.length, days.length]);

  // 循环列：滚动归一化保持在中间段
  const normalizeLoopScroll = (ref: any, total: number) => {
    const container = ref.current;
    if (!container) return;
    const itemHeight = 36;
    const styles = getComputedStyle(container);
    const paddingTop = parseFloat(styles.paddingTop || '0') || 0;
    const centerOffset = (container.clientHeight - itemHeight) / 2;
    const rawIndex = Math.round((container.scrollTop - paddingTop + centerOffset) / itemHeight);
    let normalized = rawIndex;
    const segmentStart = total;
    const segmentEnd = total * 2 - 1;
    if (rawIndex < segmentStart) normalized += total;
    if (rawIndex > segmentEnd) normalized -= total;
    if (normalized !== rawIndex) {
      const target = paddingTop + normalized * itemHeight - centerOffset;
      container.scrollTo({ top: target, behavior: 'auto' });
    }
  };

  if (!visible) return null;

  const onOk = () => {
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onConfirm(`${year}-${mm}-${dd}`);
  };

  return (
    <div className="lf-picker-mask" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="lf-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lf-picker-content">
          <div className="lf-picker-title">{title || '选择日期'}</div>
          <div className="lf-wheel-container">
            <div className="lf-wheel-column">
              <div className="lf-wheel-items" ref={yearRef}>
                {years.map((y: number) => (
                  <div key={y} className={`lf-wheel-item${y === year ? ' selected' : ''}`} onClick={() => setYear(y)}>{y}</div>
                ))}
              </div>
            </div>
            <div className="lf-wheel-column">
              <div className="lf-wheel-items" ref={monthRef} onScroll={() => normalizeLoopScroll(monthRef, months.length)}>
                {monthLoop.map((m: number, idx: number) => (
                  <div key={`m-${idx}-${m}`} className={`lf-wheel-item${m === month ? ' selected' : ''}`} onClick={() => setMonth(m)}>{m}</div>
                ))}
              </div>
            </div>
            <div className="lf-wheel-column">
              <div className="lf-wheel-items" ref={dayRef} onScroll={() => normalizeLoopScroll(dayRef, days.length)}>
                {dayLoop.map((d: number, idx: number) => (
                  <div key={`d-${idx}-${d}`} className={`lf-wheel-item${d === day ? ' selected' : ''}`} onClick={() => setDay(d)}>{d}</div>
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

