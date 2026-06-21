import { useEffect, useRef, useState } from 'react';
import { App, TFile } from 'obsidian';
import { RoadmapRepository } from '../../repositories/RoadmapRepository';
import { MapProviderFactory } from './providers/MapProviderFactory';
import { IMapProvider } from './providers/IMapProvider';
import { MapLocation, MapSearchResult } from '../../types/map';
import { CoordinateConverter } from './GoogleMap';
import { PlaceStatus, getPlaceStatus } from '../../utils/placeStatus';

export type MapLocationItem = {
  lng: number;
  lat: number;
  title: string;
  coordinate_system?: string;
  /** 通往下一个地点的交通方式；用于决定连线虚/实。没有则不画线到下一个点。 */
  travelModeToNext?: 'walk' | 'bicycle' | 'two_wheeler' | 'drive' | 'transit';
  /** 地点状态：过去/未来/未计划 — 用于按状态着色 marker。 */
  status?: PlaceStatus;
  /** 显式标号（数字 marker 上显示的序号）。子路线的起点/终点共享同一序号，
   *  无法用「数组下标 +1」表达，故由上游显式指定；缺省时回退到位置式编号。 */
  label?: number;
};

function styleForTravelMode(mode?: string): 'solid' | 'dashed' {
  if (mode === 'walk' || mode === 'bicycle') return 'dashed';
  return 'solid';
}

type TravelModeKey = 'walk' | 'bicycle' | 'two_wheeler' | 'drive' | 'transit';

// Per-mode polyline colours — collapsed to the warm-gold family so the
// route reads as one design system, not five competing hues. dashed (walk
// / bicycle) marks "self-powered" travel; the orange-tinged two_wheeler
// nudges away from the golds without leaving the palette.
const TRAVEL_MODE_COLORS: Record<TravelModeKey, string> = {
  walk: '#D3BC8D',       // light gold, dashed
  bicycle: '#D3BC8D',    // light gold, dashed
  two_wheeler: '#C77A4A', // warm terracotta, solid
  drive: '#B3995D',      // deep gold, solid
  transit: '#B3995D',    // deep gold, solid
};

const DEFAULT_POLYLINE_COLOR = '#D3BC8D';

function colorForTravelMode(mode?: string): string {
  if (mode && mode in TRAVEL_MODE_COLORS) return TRAVEL_MODE_COLORS[mode as TravelModeKey];
  return DEFAULT_POLYLINE_COLOR;
}

interface Props {
  app: App;
  repository: RoadmapRepository;
  settings: any;
  /** When set, use these locations instead of loading from repository (e.g. current roadmap + tab filter). */
  overrideLocations?: MapLocationItem[];
  /** 该路线总结地图只用此提供商；缺省用 settings.mapApiProvider */
  preferredProvider?: 'google' | 'gaode';
  /** roadmap 页顶部地图：带数字标记，按路线地点先后顺序 */
  useNumberedMarkers?: boolean;
}

export default function AggregatedMap({ app, repository, settings, overrideLocations, preferredProvider, useNumberedMarkers }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const providerRef = useRef<IMapProvider | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [provider, setProvider] = useState<'none' | 'google' | 'gaode'>('none');
  const [mapError, setMapError] = useState<string | null>(null);
  // Scope chip — top-left floating label. Trip-mode summarises first→last
  // place names; Set-mode falls back to "ALL TRIPS · N PLACES".
  const [scopeTitle, setScopeTitle] = useState<string>('');
  const [pointCount, setPointCount] = useState<number>(0);

  const effectiveProvider = preferredProvider ?? (settings?.mapApiProvider || 'none');
  useEffect(() => {
    const prov = effectiveProvider as 'none' | 'google' | 'gaode';
    const hasKey = prov === 'google' ? !!settings?.googleMapsApiKey : prov === 'gaode' ? !!(settings?.gaodeJsApiKey || settings?.gaodeWebServiceKey) : false;
    setDisabled(prov === 'none' || !hasKey);
    setProvider(prov);
  }, [settings?.googleMapsApiKey, settings?.gaodeJsApiKey, settings?.gaodeWebServiceKey, effectiveProvider]);

  useEffect(() => {
    if (disabled) {
      setMapError(null);
      return;
    }
    setMapError(null);
    let cancelled = false;
    (async () => {
      try {
        const prov = (effectiveProvider as 'google' | 'gaode' | 'none');
        if (prov === 'none') return;
        const apiKey = prov === 'google' ? settings.googleMapsApiKey : (settings.gaodeJsApiKey || settings.gaodeWebServiceKey);
        if (!apiKey) return;

        const ava: string[] = [];
        if (settings.gaodeJsApiKey || settings.gaodeWebServiceKey) ava.push('gaode');
        if (settings.googleMapsApiKey) ava.push('google');

        const inst = MapProviderFactory.createProvider(prov, apiKey, 'zh', prov === 'gaode' ? settings.gaodeWebServiceKey : undefined);
        providerRef.current = inst;

        const targetIsWgs84 = prov === 'google';
        let locations: { lng: number; lat: number; title: string; travelModeToNext?: string; status?: PlaceStatus; label?: number }[];
        if (overrideLocations !== undefined) {
          // 覆盖模式：按当前 provider 统一坐标系（Google→WGS84，Gaode→GCJ-02）
          locations = overrideLocations.map(it => {
            let lng = it.lng;
            let lat = it.lat;
            const sys = (it.coordinate_system || 'WGS84').toLowerCase();
            const isGcj = sys === 'gcj-02' || sys === 'gcj02';
            if (targetIsWgs84 && isGcj) {
              [lng, lat] = CoordinateConverter.gcj02ToWgs84(lng, lat);
            } else if (!targetIsWgs84 && !isGcj) {
              [lng, lat] = CoordinateConverter.wgs84ToGcj02(lng, lat);
            }
            return { lng, lat, title: it.title, travelModeToNext: it.travelModeToNext, status: it.status, label: it.label };
          });
        } else {
          const ids = await repository.loadRoadmapSet();
          locations = [];
          for (const id of ids) {
            const dest = app.metadataCache.getFirstLinkpathDest(id, repository.getRootPath());
            if (!dest || !(dest instanceof TFile)) continue;
            const data = await repository.loadRoadmap(dest.path);
            const items = data?.items || [];
            for (let i = 0; i < items.length; i++) {
              const it: any = items[i];
              if (it && 'name' in it) {
                const loc = (it.detail?.address as MapLocation | undefined);
                if (loc && typeof loc.longitude === 'number' && typeof loc.latitude === 'number') {
                  let lng = loc.longitude;
                  let lat = loc.latitude;
                  const sys = (loc.coordinate_system || 'WGS84').toLowerCase();
                  const isGcj = sys === 'gcj-02' || sys === 'gcj02';
                  if (targetIsWgs84 && isGcj) {
                    [lng, lat] = CoordinateConverter.gcj02ToWgs84(lng, lat);
                  } else if (!targetIsWgs84 && !isGcj) {
                    [lng, lat] = CoordinateConverter.wgs84ToGcj02(lng, lat);
                  }
                  locations.push({ lng, lat, title: it.name || '', status: getPlaceStatus(it) });
                }
              }
            }
          }
        }

        if (cancelled) return;
        // 计算 scope chip 文案：trip 模式取首→末 place 名（截断 6 字），
        // set 模式标 ALL TRIPS。
        if (!cancelled) {
          setPointCount(locations.length);
          if (overrideLocations !== undefined && locations.length > 0) {
            const truncate = (s: string) => (s.length > 6 ? `${s.slice(0, 6)}…` : s);
            const first = truncate(locations[0].title || '');
            const last = truncate(locations[locations.length - 1].title || '');
            setScopeTitle(first && last && first !== last ? `${first} → ${last}` : first || last || '');
          } else {
            setScopeTitle('ALL TRIPS');
          }
        }
        if (containerRef.current) {
          // Belt-and-suspenders：哪怕上一轮 provider.destroy() 没把 DOM 清干净
          // （比如 effect 在 AMap → Google 切换中被打断），强制把 container 清空
          // 再让新 provider 进来；否则两个 provider 的 DOM 会叠在同一个 canvas 上，
          // 顶层的 amap-copyright / Google 1000002 蒙层会吃掉所有手势。
          try { containerRef.current.replaceChildren(); } catch (e) { console.warn('[AggregatedMap] container clear before initMap failed', e); }
          await inst.initMap(containerRef.current, undefined, ava);
          if (cancelled) return;
          await new Promise(r => requestAnimationFrame(r));
          if (cancelled) return;
          const toResult = (loc: { lng: number; lat: number; title: string }): MapSearchResult => ({
            name: loc.title, address: '', location: { longitude: loc.lng, latitude: loc.lat, name: loc.title },
          });
          // 先画折线，再画 markers，让 markers 在折线上层（provider 也通过 zIndex 保证）
          inst.clearPolylines();
          if (useNumberedMarkers) {
            // wishlist 地点（无日期）不在时间轴上，因此不参与连线、不进入 1/2/3 编号；
            // 仅作为单色圆点呈现，让"已计划路线"与"想去但未排"两组视觉上分离。
            const planned = locations.filter(l => l.status !== 'wish');
            const wishlist = locations.filter(l => l.status === 'wish');
            if (planned.length >= 2) {
              const segs: Array<{ path: Array<[number, number]>; style: 'solid' | 'dashed'; color?: string }> = [];
              for (let i = 0; i < planned.length - 1; i++) {
                const a = planned[i];
                const b = planned[i + 1];
                // 仅在 overrideLocations 模式下可得到 travelModeToNext；没有则也画默认实线
                const mode = a.travelModeToNext;
                segs.push({
                  path: [[a.lng, a.lat], [b.lng, b.lat]],
                  style: styleForTravelMode(mode),
                  color: colorForTravelMode(mode),
                });
              }
              if (segs.length) inst.drawPolylines(segs);
            }
            if (planned.length > 0) {
              inst.displaySearchMarkers(planned.map(toResult), () => {}, {
                markerStyle: 'number',
                statuses: planned.map(l => l.status),
                // 子路线起/终点共享卡片序号 —— 显式 labels 让两枚 marker 标同一个号，
                // 后续点的编号也继续与卡片对齐（位置式 i+1 做不到）。
                labels: planned.map(l => l.label),
              });
            }
            if (wishlist.length > 0) {
              inst.displaySearchMarkers(wishlist.map(toResult), () => {}, {
                markerStyle: 'circle',
                statuses: wishlist.map(() => 'wish' as const),
              });
            }
          } else {
            // Set-page aggregated view: single-colour circle markers, no
            // polyline, no per-place status tint (dense scatter reads as
            // one cohort, not a status legend).
            inst.displaySearchMarkers(locations.map(toResult), () => {}, {
              markerStyle: 'circle',
            });
          }
          if (locations.length > 0) inst.fitBounds(locations);
        }
      } catch (error: any) {
        if (!cancelled) {
          console.error('[AggregatedMap] Failed to initialize map:', error);
          setMapError(error?.message || '地图加载失败，可能是网络连接问题或 API Key 配置错误');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
    };
  }, [
    app,
    repository,
    // 精确到用到的字段，避免父组件每次重建 settings 引用时无意义重载
    settings?.googleMapsApiKey,
    settings?.gaodeJsApiKey,
    settings?.gaodeWebServiceKey,
    settings?.mapApiProvider,
    disabled,
    overrideLocations,
    effectiveProvider,
    useNumberedMarkers,
  ]);

  const ratioClass = 'lac-aggmap-3x2';
  const showMessage = disabled || !!mapError;
  const messageText = disabled ? '地图未启用或缺少 API Key' : mapError || '';
  const attribution = provider === 'gaode' ? '© amap · gcj-02' : provider === 'google' ? '© google · wgs-84' : '';
  const pointsLabel = useNumberedMarkers ? 'pts' : 'places';
  return (
    <div className={`lac-aggmap ${ratioClass}`}>
      {showMessage && (
        <div className="lac-aggmap-message" data-lac="map-message">
          <span className="lac-aggmap-message-text">{messageText}</span>
        </div>
      )}
      <div ref={containerRef} className="lac-aggmap-canvas" style={{ pointerEvents: showMessage ? 'none' : 'auto' }} />
      {!showMessage && pointCount > 0 && (
        <div className="lac-aggmap-chip lac-aggmap-chip--scope">
          {scopeTitle && <span>{scopeTitle}</span>}
          {scopeTitle && <span className="lac-aggmap-chip-sep">·</span>}
          <span className="lac-aggmap-chip-num">{pointCount}</span>
          <span>{pointsLabel}</span>
        </div>
      )}
      {!showMessage && attribution && (
        <div className="lac-aggmap-chip lac-aggmap-chip--attribute">{attribution}</div>
      )}
    </div>
  );
}


