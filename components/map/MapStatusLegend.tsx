import React from 'react';

export default function MapStatusLegend() {
  return <div className="lac-aggmap-legend" aria-label="地图地点状态">
    {([['done', '已去'], ['plan', '已计划'], ['wish', '想去']] as const).map(([status, label]) =>
      <span key={status} className="lac-aggmap-legend-item">
        <span className={`lac-map-marker-circle lac-map-marker-circle--${status}`} aria-hidden="true" />
        <span>{label}</span>
      </span>
    )}
  </div>;
}
