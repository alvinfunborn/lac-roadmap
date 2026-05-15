import React from 'react';
import { RoadmapSettings } from '../types';
import { CoordinateConverter } from './map/GoogleMap';

export interface PlacePoint {
  lat: number;
  lng: number;
  /** WGS84 / GCJ-02; defaults to WGS84 when omitted. */
  coordinate_system?: string;
}

interface PlaceStaticMapProps {
  /** All places in the trip, in display order. Polyline connects them
   *  i → i+1; numbered circles are drawn at each. Empty list renders
   *  the unified `MAP` fallback. */
  places: PlacePoint[];
  /** Index of the "focus" place — drawn larger / brighter so the user
   *  can find it inside the trip context. -1 disables highlighting. */
  currentIndex: number;
  placeName: string;
  mapKey: string;
  preferredProvider?: 'google' | 'gaode';
  settings: RoadmapSettings;
  /** When true, derive center + zoom from the bounding box of all points
   *  so the whole trip fits in the thumb. Overrides `currentIndex` focus.
   *  Used by the roadmap editor's overview thumbnail. */
  autoFit?: boolean;
}

// ─── Web Mercator math ──────────────────────────────────────────────────
function toTarget(p: PlacePoint, useGaode: boolean): { lng: number; lat: number } {
  const sys = (p.coordinate_system || 'WGS84').toLowerCase();
  const isGcj = sys === 'gcj-02' || sys === 'gcj02';
  let lng = p.lng;
  let lat = p.lat;
  if (useGaode && !isGcj) [lng, lat] = CoordinateConverter.wgs84ToGcj02(lng, lat);
  else if (!useGaode && isGcj) [lng, lat] = CoordinateConverter.gcj02ToWgs84(lng, lat);
  return { lng, lat };
}

const SOURCE_PX = 400;
// Fixed thumb zoom — anchors the map on the current place at a
// neighbourhood-to-district scale (~5–10 km visible diameter). Other
// places that happen to fall in view show too; ones outside just trail
// off into the polyline tail — we don't auto-fit to the entire trip
// because that would zoom out so far the focus context disappears.
const THUMB_ZOOM = 13;

function lngToWorldX(lng: number, zoom: number): number {
  return (lng + 180) / 360 * (256 * Math.pow(2, zoom));
}
function latToWorldY(lat: number, zoom: number): number {
  const sinLat = Math.sin(lat * Math.PI / 180);
  return (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * (256 * Math.pow(2, zoom));
}

/**
 * 卡片静态地图 — multi-point version (image copy 25):
 *   • clean basemap (no provider markers)
 *   • SVG overlay: polyline through all places + numbered circles
 *   • current place gets a brighter, slightly larger circle
 */
export default function PlaceStaticMap({
  places,
  currentIndex,
  placeName,
  mapKey,
  preferredProvider,
  settings,
  autoFit = false,
}: PlaceStaticMapProps) {
  const provider = (preferredProvider || settings?.mapApiProvider || 'google') as 'google' | 'gaode';
  const useGaode = provider === 'gaode';
  const hasGoogle = !!settings?.googleMapsApiKey;
  const hasGaode = !!settings?.gaodeWebServiceKey;
  if ((useGaode && !hasGaode) || (!useGaode && !hasGoogle)) {
    return (
      <div className="lac-card-map-placeholder">
        <span className="lac-card-map-placeholder-text">map</span>
      </div>
    );
  }
  if (!places || places.length === 0) {
    return (
      <div className="lac-card-map-placeholder">
        <span className="lac-card-map-placeholder-text">map</span>
      </div>
    );
  }

  // Project all places into the target datum once.
  const projected = places.map(p => toTarget(p, useGaode));
  // Two centering modes:
  //   • default — focus on `currentIndex` at a fixed neighbourhood zoom
  //     so the picked place is the visual anchor (place-card thumbs).
  //   • autoFit — bbox midpoint + zoom-to-fit so the entire trip is
  //     visible (roadmap-editor overview thumbnail).
  let centerLat: number;
  let centerLng: number;
  let zoom: number;
  if (autoFit && projected.length > 0) {
    const lats = projected.map(p => p.lat);
    const lngs = projected.map(p => p.lng);
    const latMin = Math.min(...lats), latMax = Math.max(...lats);
    const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
    centerLat = (latMin + latMax) / 2;
    centerLng = (lngMin + lngMax) / 2;
    if (projected.length === 1 || (latMin === latMax && lngMin === lngMax)) {
      zoom = THUMB_ZOOM;
    } else {
      // Compute bbox span in mercator pixels at zoom 0, then pick the
      // largest integer zoom that still fits the span inside 78% of the
      // source image (leaves ~11% padding on each side for marker discs).
      const dxAtZ0 = Math.abs(lngToWorldX(lngMax, 0) - lngToWorldX(lngMin, 0));
      const dyAtZ0 = Math.abs(latToWorldY(latMin, 0) - latToWorldY(latMax, 0));
      const target = SOURCE_PX * 0.78;
      const zoomX = dxAtZ0 > 0 ? Math.log2(target / dxAtZ0) : 20;
      const zoomY = dyAtZ0 > 0 ? Math.log2(target / dyAtZ0) : 20;
      zoom = Math.max(1, Math.min(18, Math.floor(Math.min(zoomX, zoomY))));
    }
  } else {
    const focus = projected[currentIndex >= 0 && currentIndex < projected.length ? currentIndex : 0];
    centerLat = focus.lat;
    centerLng = focus.lng;
    zoom = THUMB_ZOOM;
  }

  // Build clean basemap URL.
  let url: string;
  try {
    if (useGaode) {
      const params = new URLSearchParams({
        key: settings.gaodeWebServiceKey || '',
        size: `${SOURCE_PX}*${SOURCE_PX}`,
        location: `${centerLng},${centerLat}`,
        zoom: String(zoom),
        v: mapKey,
      });
      url = `https://restapi.amap.com/v3/staticmap?${params.toString()}`;
    } else {
      const params = new URLSearchParams({
        size: `${SOURCE_PX}x${SOURCE_PX}`,
        maptype: 'terrain',
        key: settings.googleMapsApiKey || '',
        center: `${centerLat},${centerLng}`,
        zoom: String(zoom),
        v: mapKey,
      });
      url = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
    }
  } catch (err) {
    console.warn('[PlaceStaticMap] 生成 URL 失败', err);
    return (
      <div className="lac-card-map-placeholder">
        <span className="lac-card-map-placeholder-text">map</span>
      </div>
    );
  }

  // Compute pixel positions in % (viewBox 0..100) for each place.
  const cx0 = lngToWorldX(centerLng, zoom);
  const cy0 = latToWorldY(centerLat, zoom);
  const positions = projected.map(p => {
    const x = 50 + (lngToWorldX(p.lng, zoom) - cx0) / SOURCE_PX * 100;
    const y = 50 + (latToWorldY(p.lat, zoom) - cy0) / SOURCE_PX * 100;
    return { x, y, visible: x >= -2 && x <= 102 && y >= -2 && y <= 102 };
  });

  // Polyline points string — skip pairs where either endpoint is off-image
  // by joining only visible runs. Simpler: include all (off-image just
  // means the line extends past the SVG which is fine, it gets clipped
  // by overflow:hidden on the thumb container).
  const polylinePts = positions.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <>
      <img src={url} alt={placeName} className="lac-card-map-image" draggable={false} />
      <svg
        className="lac-card-thumb-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {positions.length >= 2 && (
          <polyline
            points={polylinePts}
            fill="none"
            stroke="#D3BC8D"
            strokeOpacity="0.78"
            strokeWidth="1.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {positions.map((p, i) => {
          if (!p.visible) return null;
          // All markers identical — no special highlight for the current
          // place, since centering the map on it already makes it the
          // focal point. The number inside echoes the trip order from
          // the timeline and the hero map.
          return (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={6}
                fill="#D3BC8D"
                stroke="#0E1316"
                strokeWidth={1.4}
              />
              <text
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={6}
                fontWeight={600}
                fontFamily='"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace'
                fill="#0E1316"
              >{i + 1}</text>
            </g>
          );
        })}
      </svg>
    </>
  );
}
