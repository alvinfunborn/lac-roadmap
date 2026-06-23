import React, { useEffect, useRef, useState } from 'react';
import { RoadmapSettings } from '../types';
import { CoordinateConverter } from './map/GoogleMap';
import type { PlaceStatus } from '../utils/placeStatus';

export interface PlacePoint {
  lat: number;
  lng: number;
  /** WGS84 / GCJ-02; defaults to WGS84 when omitted. */
  coordinate_system?: string;
  /** Trip-relative status — 'wish' 脱离时间轴：不连线、不编号、用 wish 色单独画圆点。
   *  缺省视为 'plan'（参与编号 + 连线）。 */
  status?: PlaceStatus;
  /** 显式序号 —— 与列表卡片号对齐。没坐标的地点不进 places，但它占去的号通过这里
   *  反映在后续点上（如缩略图显示 1,2,4，跳过坐标缺失的 3）。缺省回退到数组位置。 */
  label?: number;
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

// ─── 卡片底图 <img> 健壮封装 ─────────────────────────────────────────────
// 列表里几十张卡片若同时各发一个静态图请求，会撞上 Chromium/Electron「单 host 并发
// 连接 ≈6」的上限互相排队/超时，部分变破图。原生 `loading="lazy"` 让浏览器只在缩略图
// 滚近视口时才发请求 —— 天然分批、永不一次性突发，且自己优雅排队不会失败；这比手写
// 全局调度器简单得多也更可靠（之前手写信号量 + 看门狗反而引入死槽，首屏全白）。
// onError 再叠加退避重试兜底偶发失败，重试用尽才回退统一 `map` 占位块。
const MAX_RETRY = 3;
const failedUrls = new Set<string>();

function BasemapImg({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState<string>(url);
  const [failed, setFailed] = useState<boolean>(() => failedUrls.has(url));
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSrc(url);
    setFailed(failedUrls.has(url));
    attemptRef.current = 0;
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [url]);

  if (failed) {
    return (
      <div className="lac-card-map-placeholder">
        <span className="lac-card-map-placeholder-text">map</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="lac-card-map-image"
      draggable={false}
      loading="lazy"
      decoding="async"
      onLoad={() => { attemptRef.current = 0; }}
      onError={() => {
        if (attemptRef.current < MAX_RETRY) {
          attemptRef.current++;
          // 指数退避 + 抖动：偶发失败错峰重发（cache-bust 绕过已缓存的失败响应）。
          const delay = Math.min(4000, 500 * 2 ** (attemptRef.current - 1)) + Math.random() * 400;
          timerRef.current = setTimeout(() => {
            const sep = url.includes('?') ? '&' : '?';
            setSrc(`${url}${sep}_r=${Date.now()}`);
          }, delay);
        } else {
          failedUrls.add(url);
          setFailed(true);
        }
      }}
    />
  );
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

  // 计算 planned 序号（wishlist 跳过编号），并组装仅含 planned 的折线 path。
  // wishlist 单独画圆点（无数字 / wish 配色 / 不参与连线）。
  const PLAN_FILL = '#D3BC8D';
  const WISH_FILL = '#C77A4A';
  type Annotated = { x: number; y: number; visible: boolean; isWish: boolean; plannedIdx: number; label?: number };
  let plannedCounter = 0;
  const annotated: Annotated[] = positions.map((p, i) => {
    const isWish = places[i]?.status === 'wish';
    const plannedIdx = isWish ? -1 : plannedCounter++;
    return { ...p, isWish, plannedIdx, label: places[i]?.label };
  });
  const polylinePts = annotated
    .filter(a => !a.isWish)
    .map(a => `${a.x},${a.y}`)
    .join(' ');
  const plannedCount = plannedCounter;

  return (
    <>
      <BasemapImg url={url} alt={placeName} />
      <svg
        className="lac-card-thumb-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {plannedCount >= 2 && (
          <polyline
            points={polylinePts}
            fill="none"
            stroke={PLAN_FILL}
            strokeOpacity="0.78"
            strokeWidth="1.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {annotated.map((p, i) => {
          if (!p.visible) return null;
          if (p.isWish) {
            // Wishlist：纯色小圆点 + 半透明光晕，无数字
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={5.5} fill={WISH_FILL} fillOpacity={0.22} />
                <circle cx={p.x} cy={p.y} r={3.4} fill={WISH_FILL} stroke="#0E1316" strokeWidth={1.2} />
              </g>
            );
          }
          // Planned：金色圆章 + planned 序号（不是数组下标）
          return (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={6}
                fill={PLAN_FILL}
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
              >{p.label ?? (p.plannedIdx + 1)}</text>
            </g>
          );
        })}
      </svg>
    </>
  );
}
