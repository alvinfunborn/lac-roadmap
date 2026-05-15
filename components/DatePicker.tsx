import React, { useMemo, useState, useEffect } from 'react';

interface DatePickerProps {
  visible: boolean;
  value?: string; // YYYY-MM-DD
  onCancel: () => void;
  onClear: () => void;
  onConfirm: (value: string) => void;
  title?: string;
  /** Optional per-day density counts, keyed `YYYY-MM-DD`. Renders the 4px
   *  dot under each cell (recipe step 5 in docs/design/image copy 7.png).
   *  Reuses the heatmap palette — empty days get no dot. */
  dayCounts?: Record<string, number>;
}

const WEEKDAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
const WEEKDAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function parseISO(v?: string): { y: number; m: number; d: number } {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return { y, m, d };
  }
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Returns Monday-leading weekday index (0=mon..6=sun) for the 1st of the month. */
function firstWeekdayMondayIndex(y: number, m: number): number {
  const sunIdx = new Date(y, m - 1, 1).getDay(); // 0=Sun..6=Sat
  return (sunIdx + 6) % 7; // shift so Mon=0
}

export default function DatePicker({ visible, value, onCancel, onClear, onConfirm, title, dayCounts }: DatePickerProps) {
  const initial = parseISO(value);
  const [year, setYear] = useState(initial.y);
  const [month, setMonth] = useState(initial.m); // 1..12
  const [day, setDay] = useState(initial.d);

  // Reset state when re-opened or value changes.
  useEffect(() => {
    if (!visible) return;
    const i = parseISO(value);
    setYear(i.y); setMonth(i.m); setDay(i.d);
  }, [visible, value]);

  const today = useMemo(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  }, [visible]);

  // Compute grid cells: 6 rows × 7 cols, optionally including trailing days.
  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const firstWeekday = useMemo(() => firstWeekdayMondayIndex(year, month), [year, month]);

  const cells = useMemo(() => {
    const arr: Array<{ d: number; inMonth: boolean }> = [];
    // Leading blanks become trailing days of previous month, shown as faint.
    const prevDays = new Date(year, month - 1, 0).getDate();
    for (let i = firstWeekday - 1; i >= 0; i--) {
      arr.push({ d: prevDays - i, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      arr.push({ d, inMonth: true });
    }
    // Pad to 42 cells (6 rows) so the grid never reflows.
    let nextD = 1;
    while (arr.length < 42) {
      arr.push({ d: nextD++, inMonth: false });
    }
    return arr;
  }, [year, month, daysInMonth, firstWeekday]);

  const navMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  };

  const handlePickToday = () => {
    setYear(today.y); setMonth(today.m); setDay(today.d);
  };

  // Build a max for density-dot scaling. MUST be declared BEFORE the
  // `if (!visible) return null` early-return — React requires hooks to
  // be called in the same order on every render. Calling a hook only
  // when `visible === true` causes a hooks-order mismatch that crashes
  // the entire React tree (which is what was producing the "blank page"
  // when the picker first opened).
  const maxCount = useMemo(() => {
    if (!dayCounts) return 0;
    let m = 0;
    for (const k in dayCounts) {
      const v = dayCounts[k];
      if (typeof v === 'number' && v > m) m = v;
    }
    return m;
  }, [dayCounts]);

  if (!visible) return null;

  const onOk = () => onConfirm(iso(year, month, day));

  // Build summary: `MM·DD · weekday`.
  const summaryDate = `${pad2(month)}·${pad2(day)}`;
  const summaryWeekday = WEEKDAY_ABBR[new Date(year, month - 1, day).getDay()];

  return (
    <div
      className="lac-picker-mask"
      onClick={(e) => {
        // Stop propagation so the click doesn't bubble up to the
        // PlaceEditModal mask or down to Obsidian's underlying leaf
        // (which previously misread the click as a navigation gesture
        // and warped to a blank pane).
        e.stopPropagation();
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="lac-picker-modal lac-datepicker" onClick={(e) => e.stopPropagation()}>
        <div className="lac-picker-content">
          {/* Header: eyebrow + serif month + year + nav */}
          <div className="lac-datepicker-head">
            <div className="lac-datepicker-head-left">
              <div className="lac-picker-title">{title || 'date'}</div>
              <div className="lac-datepicker-monthrow">
                <span className="lac-datepicker-month">{MONTH_NAMES[month - 1]}</span>
                <span className="lac-datepicker-year">{year}</span>
              </div>
            </div>
            <div className="lac-datepicker-nav">
              <button type="button" className="lac-datepicker-navbtn" onClick={() => navMonth(-1)} aria-label="prev month">
                <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
                  <polyline points="10 4 6 8 10 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button" className="lac-datepicker-navbtn" onClick={() => navMonth(1)} aria-label="next month">
                <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
                  <polyline points="6 4 10 8 6 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Weekday row */}
          <div className="lac-datepicker-weekrow">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`lac-datepicker-weekday${i >= 5 ? ' lac-datepicker-weekday--weekend' : ''}`}
              >{w}</div>
            ))}
          </div>

          {/* Date grid */}
          <div className="lac-datepicker-grid">
            {cells.map((cell, idx) => {
              if (!cell.inMonth) {
                return <div key={idx} className="lac-datepicker-cell lac-datepicker-cell--out" />;
              }
              const isSelected = cell.d === day;
              const isToday = cell.d === today.d && month === today.m && year === today.y;
              const key = iso(year, month, cell.d);
              const count = dayCounts ? (dayCounts[key] || 0) : 0;
              // 5-tier intensity, same as the global heatmap.
              const tier = count <= 0 || maxCount <= 0 ? 0
                : Math.min(5, Math.ceil((count / maxCount) * 5));
              return (
                <button
                  key={idx}
                  type="button"
                  className={`lac-datepicker-cell${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                  onClick={() => setDay(cell.d)}
                >
                  <span className="lac-datepicker-cell-num">{cell.d}</span>
                  {tier > 0 && <span className={`lac-datepicker-cell-dot lac-datepicker-cell-dot--t${tier}`} />}
                </button>
              );
            })}
          </div>

          {/* Inline summary + `today` shortcut. `clear` and `save` live in
              the unified bottom action row below so all pickers share the
              same `clear · cancel · save` muscle memory. */}
          <div className="lac-datepicker-footer">
            <div className="lac-datepicker-summary">
              <span className="lac-datepicker-summary-date">{summaryDate}</span>
              <span className="lac-datepicker-summary-sep">·</span>
              <span className="lac-datepicker-summary-meta">{summaryWeekday}</span>
            </div>
            <button type="button" className="lac-datepicker-footer-btn" onClick={handlePickToday}>today</button>
          </div>

          {/* Unified action row — same shape as TimePicker. */}
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
