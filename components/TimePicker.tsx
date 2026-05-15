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

const ITEM_HEIGHT = 30;
const PRESETS = ['09:00', '12:00', '14:00', '18:00', '21:00'] as const;

function parseHM(v?: string, step = 1): { h: number; m: number } {
  if (v && /^\d{2}:\d{2}$/.test(v)) {
    const [h, m] = v.split(':').map((x) => parseInt(x, 10));
    return { h, m };
  }
  const now = new Date();
  return { h: now.getHours(), m: Math.floor(now.getMinutes() / step) * step };
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

export default function TimePicker({ visible, value, onCancel, onClear, onConfirm, title, step = 1 }: TimePickerProps) {
  const initial = parseHM(value, step);
  const [hour, setHour] = useState(initial.h);
  const [minute, setMinute] = useState(initial.m);

  useEffect(() => {
    if (!visible) return;
    const i = parseHM(value, step);
    setHour(i.h); setMinute(i.m);
  }, [visible, value, step]);

  const hours: number[] = (() => { const a: number[] = []; for (let i = 0; i < 24; i++) a.push(i); return a; })();
  const minutes: number[] = (() => { const a: number[] = []; for (let i = 0; i < Math.floor(60 / step); i++) a.push(i * step); return a; })();

  // Triple-tile the source so we can scroll seamlessly through the middle band.
  const hourLoop = [...hours, ...hours, ...hours];
  const minuteLoop = [...minutes, ...minutes, ...minutes];

  const hourRef = useRef<HTMLDivElement | null>(null);
  const minuteRef = useRef<HTMLDivElement | null>(null);

  // Center the selected row inside the column. The wheel container is
  // 5 × ITEM_HEIGHT tall; centerOffset = 2 × ITEM_HEIGHT (the two rows
  // above the center slot).
  const scrollToSelected = (ref: React.RefObject<HTMLDivElement>, index: number, total: number) => {
    const c = ref.current;
    if (!c) return;
    const baseIndex = total + index; // middle segment
    const target = ITEM_HEIGHT * baseIndex - (2 * ITEM_HEIGHT);
    c.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
  };

  useEffect(() => {
    if (!visible) return;
    scrollToSelected(hourRef, hours.indexOf(hour), hours.length);
    scrollToSelected(minuteRef, minutes.indexOf(minute), minutes.length);
  }, [visible, hour, minute, step]);

  // Keep the user's scroll position parked in the middle band as they swipe.
  const normalizeLoopScroll = (ref: React.RefObject<HTMLDivElement>, total: number) => {
    const c = ref.current;
    if (!c) return;
    const rawIndex = Math.round((c.scrollTop + 2 * ITEM_HEIGHT) / ITEM_HEIGHT);
    let normalized = rawIndex;
    if (rawIndex < total) normalized += total;
    if (rawIndex > total * 2 - 1) normalized -= total;
    if (normalized !== rawIndex) {
      c.scrollTo({ top: normalized * ITEM_HEIGHT - 2 * ITEM_HEIGHT, behavior: 'auto' });
    }
  };

  const handleHourScroll = () => normalizeLoopScroll(hourRef, hours.length);
  const handleMinuteScroll = () => normalizeLoopScroll(minuteRef, minutes.length);

  const handlePreset = (preset: string) => {
    const [h, m] = preset.split(':').map(Number);
    setHour(h);
    setMinute(m);
  };

  if (!visible) return null;

  const onOk = () => onConfirm(`${pad2(hour)}:${pad2(minute)}`);

  return (
    <div
      className="lac-picker-mask"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="lac-picker-modal lac-timepicker" onClick={(e) => e.stopPropagation()}>
        <div className="lac-picker-content">
          <div className="lac-timepicker-head">
            <div className="lac-picker-title">time</div>
            {title && <div className="lac-timepicker-head-meta">{title}</div>}
          </div>

          {/* Dual wheels separated by a colon. The container's ::before /
              ::after pseudo-elements (in _pickers.scss) draw the top/bottom
              36px fade-to-surface and the centered selected band. */}
          <div className="lac-timepicker-wheels">
            <div className="lac-timepicker-col">
              <div
                className="lac-timepicker-items"
                ref={hourRef}
                onScroll={handleHourScroll}
              >
                {hourLoop.map((h, idx) => (
                  <button
                    type="button"
                    key={`h-${idx}-${h}`}
                    className={`lac-timepicker-item${h === hour ? ' is-selected' : ''}`}
                    onClick={() => setHour(h)}
                  >
                    {pad2(h)}
                    {h === hour && <span className="lac-timepicker-unit">h</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="lac-timepicker-colon">:</div>
            <div className="lac-timepicker-col">
              <div
                className="lac-timepicker-items"
                ref={minuteRef}
                onScroll={handleMinuteScroll}
              >
                {minuteLoop.map((m, idx) => (
                  <button
                    type="button"
                    key={`m-${idx}-${m}`}
                    className={`lac-timepicker-item${m === minute ? ' is-selected' : ''}`}
                    onClick={() => setMinute(m)}
                  >
                    {pad2(m)}
                    {m === minute && <span className="lac-timepicker-unit">m</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preset pills */}
          <div className="lac-timepicker-presets">
            {PRESETS.map((p) => (
              <button
                type="button"
                key={p}
                className={`lac-timepicker-preset${p === `${pad2(hour)}:${pad2(minute)}` ? ' is-active' : ''}`}
                onClick={() => handlePreset(p)}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="lac-picker-actions">
            <button type="button" className="lac-picker-btn lac-picker-btn-clear" onClick={onClear}>clear</button>
            <button type="button" className="lac-picker-btn lac-picker-btn-cancel" onClick={onCancel}>cancel</button>
            <button type="button" className="lac-picker-btn lac-picker-btn-confirm" onClick={onOk}>save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
