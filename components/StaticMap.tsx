import React, { useEffect, useRef, useState } from 'react';
import { Roadmap, Place } from '../types/roadmap';
import { MapLocation } from '../types/map';
import { RoadmapSettings } from '../types';
import { CoordinateConverter } from './map/GoogleMap';
import { isPlace } from '../utils/typeGuards';

// 将地点坐标转为目标体系：Google 用 WGS84，高德用 GCJ-02
function toTargetCoords(loc: MapLocation, useGaode: boolean): { lng: number; lat: number } {
  let lng = loc.longitude!;
  let lat = loc.latitude!;
  const sys = (loc.coordinate_system || 'WGS84').toLowerCase();
  const isGcj = sys === 'gcj-02' || sys === 'gcj02';
  if (useGaode && !isGcj) {
    [lng, lat] = CoordinateConverter.wgs84ToGcj02(lng, lat);
  } else if (!useGaode && isGcj) {
    [lng, lat] = CoordinateConverter.gcj02ToWgs84(lng, lat);
  }
  return { lng, lat };
}

interface StaticMapProps {
  roadmap: Roadmap;
  settings: RoadmapSettings;
  /** Trip status — kept for back-compat; no longer drives marker color,
   *  since per-place status (done/plan/wish) decides each marker
   *  individually now. */
  status?: 'lac-done' | 'lac-todo' | 'lac-na';
}

type PlaceStatus = 'done' | 'plan' | 'wish';

/** Per-place date-aware status (mirrors getPlaceStatusColor but doesn't
 *  need the groups dict, so it's usable from the roadmapset card list). */
function statusForPlace(place: Place): PlaceStatus {
  const startTime = place.detail?.start_time;
  const endTime = place.detail?.end_time;
  const hasDate = startTime && /^\d{4}-\d{2}-\d{2}/.test(startTime);
  if (!hasDate) return 'wish';
  const now = new Date();
  try {
    if (startTime) {
      const startDate = new Date(startTime);
      if (startDate <= now) return 'done';
    }
    if (endTime) {
      const endDate = new Date(endTime);
      if (endDate <= now) return 'done';
    }
    return 'plan';
  } catch {
    return 'wish';
  }
}

// ─── Web Mercator math ──────────────────────────────────────────────────
// Both Google Static Maps and AMap render in spherical Mercator. We use
// the same projection to compute where each marker should sit on top of
// the basemap image, then render the marker as a DOM circle / pin via
// percentage offsets (so it scales with the displayed thumb size).
//
// Fallback zoom for a single marker (or all-coincident markers) — a
// neighbourhood-to-district scale. Multi-marker trips compute a zoom that
// fits the whole bounding box (see fitZoom) so a province-spanning trip
// like 天山北 doesn't push every pin off the 400px frame at a fixed zoom.
const DEFAULT_ZOOM = 10;

/** Largest integer zoom at which the markers' bounding box still fits inside
 *  ~78% of the source image (mirrors PlaceStaticMap's autoFit). */
function fitZoom(lats: number[], lngs: number[], sourcePx: number): number {
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
  if (lats.length <= 1 || (latMin === latMax && lngMin === lngMax)) return DEFAULT_ZOOM;
  // World pixels at zoom 0 (tile size 256).
  const lngToX0 = (l: number) => (l + 180) / 360 * 256;
  const latToY0 = (l: number) => {
    const s = Math.sin(l * Math.PI / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256;
  };
  const dx = Math.abs(lngToX0(lngMax) - lngToX0(lngMin));
  const dy = Math.abs(latToY0(latMin) - latToY0(latMax));
  const target = sourcePx * 0.78;
  const zoomX = dx > 0 ? Math.log2(target / dx) : 20;
  const zoomY = dy > 0 ? Math.log2(target / dy) : 20;
  // Clamp to 16 — AMap static maps top out around 17; 16 keeps a margin.
  return Math.max(1, Math.min(16, Math.floor(Math.min(zoomX, zoomY))));
}

function latLngToPct(
  lat: number, lng: number,
  centerLat: number, centerLng: number,
  imagePx: number,
  zoom: number,
): { xPct: number; yPct: number; visible: boolean } {
  const worldSize = 256 * Math.pow(2, zoom);
  const lngToX = (l: number) => (l + 180) / 360 * worldSize;
  const latToY = (l: number) => {
    const sinLat = Math.sin(l * Math.PI / 180);
    return (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;
  };
  const dx = lngToX(lng) - lngToX(centerLng);
  const dy = latToY(lat) - latToY(centerLat);
  const xPct = 50 + (dx / imagePx) * 100;
  const yPct = 50 + (dy / imagePx) * 100;
  // 6% margin so markers aren't half-clipped at the thumb edge.
  return {
    xPct,
    yPct,
    visible: xPct >= 6 && xPct <= 94 && yPct >= 6 && yPct <= 94,
  };
}

type PositionedMarker =
  | { kind: 'place'; status: PlaceStatus; xPct: number; yPct: number }
  | { kind: 'roadmap'; xPct: number; yPct: number };

/** 路线集卡片静态图：clean basemap + DOM-overlaid markers (image copy 26). */
export default function StaticMap({ roadmap, settings }: StaticMapProps) {
  const [mapUrl, setMapUrl] = useState<string>('');
  const [hasError, setHasError] = useState(false);
  const [hasCoordinates, setHasCoordinates] = useState(false);
  const [placeCount, setPlaceCount] = useState(0);
  const [markers, setMarkers] = useState<PositionedMarker[]>([]);
  const imageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const generateMapUrl = () => {
      const provider = (roadmap.detail?.map_provider || settings?.mapApiProvider || 'google') as 'google' | 'gaode';
      const useGaode = provider === 'gaode';

      // Collect raw markers (lat/lng + kind/status). Pixel positioning is
      // computed AFTER we know avg center.
      type RawMarker =
        | { kind: 'place'; status: PlaceStatus; lng: number; lat: number }
        | { kind: 'roadmap'; lng: number; lat: number };
      const rawMarkers: RawMarker[] = [];

      const roadmapAddr = roadmap.detail?.address as MapLocation | undefined;
      if (roadmapAddr && typeof roadmapAddr.longitude === 'number' && typeof roadmapAddr.latitude === 'number') {
        const { lng, lat } = toTargetCoords(roadmapAddr, useGaode);
        rawMarkers.push({ kind: 'roadmap', lng, lat });
      }

      const places = roadmap.items.filter(isPlace) as Place[];
      for (const place of places) {
        const loc = place.detail?.address as MapLocation | undefined;
        if (loc && typeof loc.longitude === 'number' && typeof loc.latitude === 'number') {
          const { lng, lat } = toTargetCoords(loc, useGaode);
          rawMarkers.push({ kind: 'place', status: statusForPlace(place), lng, lat });
        }
      }

      setPlaceCount(places.length);

      if (rawMarkers.length === 0) {
        setHasCoordinates(false);
        setHasError(true);
        setMarkers([]);
        return;
      }

      const hasGoogle = !!settings?.googleMapsApiKey;
      const hasGaode = !!settings?.gaodeWebServiceKey;
      if (useGaode && !hasGaode) {
        setHasCoordinates(true);
        setHasError(true);
        return;
      }
      if (!useGaode && !hasGoogle) {
        setHasCoordinates(true);
        setHasError(true);
        return;
      }

      try {
        // Center on the bounding-box midpoint (not the average) and pick a
        // zoom that fits every marker — a fixed zoom pushed pins off-frame
        // on wide trips (e.g. 天山北 spans ~800 km across Xinjiang), leaving
        // the basemap with no visible markers.
        const lats = rawMarkers.map(p => p.lat);
        const lngs = rawMarkers.map(p => p.lng);
        const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

        // Source-image px size — matches the `size` param we request from
        // the API. Used by the Mercator math so marker offsets map onto
        // the right fraction of the rendered thumb. Both providers use 400 px.
        const sourcePx = 400;
        const zoom = fitZoom(lats, lngs, sourcePx);

        if (useGaode) {
          // Clean basemap — no `markers=`, we overlay our own.
          const params = new URLSearchParams({
            key: settings.gaodeWebServiceKey || '',
            location: `${centerLng},${centerLat}`,
            zoom: String(zoom),
            size: `${sourcePx}*${sourcePx}`,
          });
          setMapUrl(`https://restapi.amap.com/v3/staticmap?${params.toString()}`);
        } else {
          const params = new URLSearchParams({
            center: `${centerLat},${centerLng}`,
            zoom: String(zoom),
            size: `${sourcePx}x${sourcePx}`,
            maptype: 'terrain',
            key: settings.googleMapsApiKey || '',
          });
          setMapUrl(`https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`);
        }

        // Compute per-marker DOM positions and stash for render.
        const positioned: PositionedMarker[] = [];
        for (const m of rawMarkers) {
          const { xPct, yPct, visible } = latLngToPct(m.lat, m.lng, centerLat, centerLng, sourcePx, zoom);
          if (!visible) continue;
          if (m.kind === 'roadmap') {
            positioned.push({ kind: 'roadmap', xPct, yPct });
          } else {
            positioned.push({ kind: 'place', status: m.status, xPct, yPct });
          }
        }
        setMarkers(positioned);

        setHasError(false);
        setHasCoordinates(true);
      } catch (error) {
        console.warn('[StaticMap] 生成 URL 失败', error);
        setHasError(true);
        setHasCoordinates(true);
      }
    };

    generateMapUrl();
  }, [roadmap, settings]);

  useEffect(() => {
    if (!mapUrl || hasError || !hasCoordinates) return;
    imageTimeoutRef.current = setTimeout(() => {
      setHasError(true);
    }, 10000);
    return () => {
      if (imageTimeoutRef.current) {
        clearTimeout(imageTimeoutRef.current);
        imageTimeoutRef.current = null;
      }
    };
  }, [mapUrl, hasError, hasCoordinates, roadmap.name]);

  if (!hasCoordinates || hasError || !mapUrl) {
    return (
      <div className="lac-card-map-placeholder">
        <span className="lac-card-map-placeholder-text">map</span>
      </div>
    );
  }

  return (
    <>
      <img
        src={mapUrl}
        alt={`Map for ${roadmap.name}`}
        className="lac-card-map-image"
        onError={() => {
          if (imageTimeoutRef.current) {
            clearTimeout(imageTimeoutRef.current);
            imageTimeoutRef.current = null;
          }
          setHasError(true);
        }}
        onLoad={() => {
          if (imageTimeoutRef.current) {
            clearTimeout(imageTimeoutRef.current);
            imageTimeoutRef.current = null;
          }
        }}
      />
      {markers.map((m, i) => {
        const style: React.CSSProperties = { left: `${m.xPct}%`, top: `${m.yPct}%` };
        if (m.kind === 'roadmap') {
          return (
            <svg
              key={`pin-${i}`}
              className="lac-card-thumb-pin"
              style={style}
              viewBox="0 0 8 12"
              aria-hidden="true"
            >
              <path
                d="M4 0.5c-1.9 0-3.5 1.6-3.5 3.5 0 2.2 2.3 5.2 3.5 7.5 1.2-2.3 3.5-5.3 3.5-7.5 0-1.9-1.6-3.5-3.5-3.5z"
                fill="#B65454"
                stroke="#0E1316"
                strokeWidth="0.6"
              />
            </svg>
          );
        }
        return (
          <span
            key={`mk-${i}`}
            className={`lac-card-thumb-marker lac-card-thumb-marker--${m.status}`}
            style={style}
            aria-hidden="true"
          />
        );
      })}
      {placeCount > 1 && (
        <span className="lac-card-map-count" aria-label={`${placeCount} places`}>{placeCount}</span>
      )}
    </>
  );
}
