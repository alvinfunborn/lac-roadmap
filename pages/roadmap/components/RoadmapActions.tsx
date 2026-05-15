import React, { useEffect, useRef, useState } from 'react';

interface ExportItem {
  label: string;
  onClick: () => void;
}

interface Props {
  onAddPlace: () => void;
  onAddTrip: () => void;
  exportItems?: ExportItem[];
}

// Bottom action row: dashed `+ add place` / `+ add trip` (full-width pair)
// plus a quiet `↓ export` dropdown when `exportItems` is provided. Class
// names are preserved (`.lac-roadmap-actions`, `.lac-btn--quiet`,
// `.lac-btn--add-place`) so existing SCSS keeps applying.
export default function RoadmapActions({ onAddPlace, onAddTrip, exportItems }: Props) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [exportOpen]);

  return (
    <div className="lac-roadmap-actions">
      <button type="button" className="lac-btn--quiet lac-btn--add-place" onClick={onAddPlace} title="添加地点">+ add place</button>
      <button type="button" className="lac-btn--quiet lac-btn--add-place" onClick={onAddTrip} title="添加子路线">+ add trip</button>
      {exportItems && exportItems.length > 0 && (
        <div ref={exportRef} className="lac-roadmap-export">
          <button
            type="button"
            className="lac-btn--quiet lac-btn--export"
            onClick={() => setExportOpen(o => !o)}
            title="导出"
            aria-haspopup="menu"
            aria-expanded={exportOpen}
          >↓ export</button>
          {exportOpen && (
            <div className="lac-roadmap-export-menu" role="menu">
              {exportItems.map(item => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className="lac-roadmap-export-item"
                  onClick={() => { setExportOpen(false); item.onClick(); }}
                >{item.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
