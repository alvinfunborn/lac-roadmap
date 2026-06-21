import { IMapProvider } from './IMapProvider';
import { MapLocation, MapSearchResult } from '../../../types/map';
import {
  loadAMapAPI,
  searchPlacesByWebAPI,
  getAddressByCoordinates,
  createAmapConfig,
  CoordinateConverter as AmapCoordinateConverter
} from '../Amap';

export class AmapProvider implements IMapProvider {
  /** 用于 webapi.amap.com/maps（地图展示），须为「Web端(JS API)」平台 */
  private jsApiKey: string;
  /** 用于 restapi.amap.com/v3/*（搜索/逆地理/坐标转换），须为「Web服务」平台 */
  private webServiceKey: string;
  private language: 'zh' | 'en';
  private mapInstance: any = null;
  private currentMarker: any = null;
  private containerElement: HTMLElement | null = null;
  private eventListeners: Array<{ type: string; handler: EventListener; options?: any }> = [];
  private polylines: any[] = [];

  constructor(jsApiKey: string, language: 'zh' | 'en' = 'zh', webServiceKey?: string) {
    this.jsApiKey = jsApiKey;
    this.webServiceKey = webServiceKey ?? jsApiKey;
    this.language = language;
  }

  async initMap(container: HTMLElement, initialLocation?: MapLocation, availableProviders?: string[], mapType: 'roadmap' | 'satellite' = 'satellite'): Promise<void> {
    const AMap = await loadAMapAPI(this.jsApiKey, this.language);
    const config = createAmapConfig(this.jsApiKey, mapType);
    this.containerElement = container;
    // NOTE: A previous build registered `mousemove / mouseup / touchmove /
    // touchend / wheel` `stopPropagation` listeners on this container,
    // originally to defeat the so-called "高德蒙层问题之二" (AMap appearing
    // non-interactive when nested inside Obsidian's workspace). Those
    // listeners turned out to be the very thing that kept the map from
    // working: AMap (and Google) track drags via document-level
    // `mousemove`/`mouseup`, and our container handlers ate those
    // before they could bubble up to document. With the listeners gone
    // the map pans and zooms normally; if Obsidian's outer scroll ever
    // re-emerges as an issue here, the right fix is to add it back on
    // wheel only, with preventDefault rather than stopPropagation.
    this.mapInstance = new AMap.Map(container, { viewMode: '2D', zoom: config.zoom, center: config.center, mapStyle: config.mapStyle, resizeEnable: true, dragEnable: true, zoomEnable: true, doubleClickZoom: true, scrollWheel: true, renderer: 'canvas', features: ['bg', 'road', 'building', 'point'] });
    AMap.plugin('AMap.Scale', () => { const scale = new AMap.Scale({ position: 'RB', offset: new AMap.Pixel(10, 10) }); this.mapInstance.addControl(scale); });
    if (initialLocation && initialLocation.longitude && initialLocation.latitude) { const [lng, lat] = await this.convertCoordinates(initialLocation); this.setCenter(lng, lat, 16); this.currentMarker = this.addMarker(lng, lat, initialLocation.name); }
    // 等待地图加载完成后再返回，否则后续 addMarker/fitBounds 可能不渲染（容器尺寸或图层未就绪）
    await new Promise<void>((resolve) => {
      if (!this.mapInstance) { resolve(); return; }
      const done = () => { this.mapInstance.off('complete', done); resolve(); };
      this.mapInstance.on('complete', done);
      setTimeout(resolve, 500);
    });
    if (this.mapInstance && typeof this.mapInstance.getSize === 'function') this.mapInstance.getSize();
  }

  setCenter(lng: number, lat: number, zoom?: number): void { if (!this.mapInstance) return; this.mapInstance.setCenter([lng, lat]); if (zoom !== undefined) this.mapInstance.setZoom(zoom); }
  addMarker(lng: number, lat: number, title?: string): any { if (!this.mapInstance) return null; const AMap = window.AMap; const marker = new AMap.Marker({ position: [lng, lat], title: title || '', content: '<div style="width:6px;height:6px;border-radius:50%;background:#ff3b30;"></div>', anchor: 'center' }); this.mapInstance.add(marker); this.currentMarker = marker; return marker; }
  removeMarker(marker: any): void { if (!this.mapInstance || !marker) return; this.mapInstance.remove(marker); if (marker === this.currentMarker) { this.currentMarker = null; } }
  async searchPlaces(keyword: string): Promise<MapSearchResult[]> { return await searchPlacesByWebAPI(keyword, this.webServiceKey); }
  async getAddressByCoordinates(lng: number, lat: number): Promise<MapLocation | null> { return await getAddressByCoordinates(lng, lat, this.webServiceKey); }
  displaySearchMarkers(results: MapSearchResult[], onClick: (index: number) => void, options?: { markerStyle?: 'circle' | 'number'; statuses?: Array<'done' | 'plan' | 'wish' | undefined>; labels?: Array<number | undefined> }): any[] {
    if (!this.mapInstance || !results.length) return [];
    const useCircle = options?.markerStyle === 'circle';
    const statuses = options?.statuses;
    // 显式编号（见 GoogleMapProvider 说明）：子路线起/终点共享同一序号；缺省回退 i+1。
    const labels = options?.labels;
    const labelAt = (i: number): string => String(labels?.[i] ?? (i + 1));
    const AMap = window.AMap;
    const markers: any[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.location.longitude != null && result.location.latitude != null) {
        const lng = result.location.longitude;
        const lat = result.location.latitude;
        const title = result.name || '';
        const status = statuses?.[i];
        // 复用 styles/_map.scss 中统一的 marker 样式，与 Google 侧保持一致。
        const statusCls = status ? ` lac-map-marker-${useCircle ? 'circle' : 'number'}--${status}` : '';
        const content = useCircle
          ? `<div class="lac-map-marker-circle${statusCls}"></div>`
          : `<div class="lac-map-marker-number${statusCls}">${labelAt(i)}</div>`;
        const marker = new AMap.Marker({
          position: [lng, lat],
          title: title || undefined,
          content,
          anchor: 'center'
        });
        marker.on('click', () => onClick(i));
        this.mapInstance.add(marker);
        markers.push(marker);
      }
    }
    if (markers.length > 0 && this.mapInstance && typeof this.mapInstance.getSize === 'function') this.mapInstance.getSize();
    return markers;
  }
  fitBounds(locations: { lng: number; lat: number }[]): void {
    if (!this.mapInstance || !locations.length) return;
    const AMap = window.AMap;
    if (locations.length === 1) {
      this.mapInstance.setCenter([locations[0].lng, locations[0].lat]);
      this.mapInstance.setZoom(13);
      return;
    }
    const xs = locations.map(p => p.lng);
    const ys = locations.map(p => p.lat);
    const bounds = new AMap.Bounds([Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]);
    this.mapInstance.setBounds(bounds, 48);
    const zoom = this.mapInstance.getZoom();
    if (typeof zoom === 'number' && zoom > 3) this.mapInstance.setZoom(zoom - 1);
  }
  clearMarkers(markers: any[]): void { if (!this.mapInstance) return; markers.forEach(marker => { if (marker) { this.mapInstance.remove(marker); } }); }
  onMapClick(handler: (lng: number, lat: number) => void): void { if (!this.mapInstance) return; this.mapInstance.on('click', (e: any) => { const { lng, lat } = e.lnglat; handler(lng, lat); }); }
  async convertCoordinates(location: MapLocation): Promise<[number, number]> { if (!location.longitude || !location.latitude) return [116.4074, 39.9042]; const coordSystem = location.coordinate_system || 'WGS84'; if (coordSystem.toLowerCase() === 'gcj-02' || coordSystem.toLowerCase() === 'gcj02') return [location.longitude, location.latitude]; try { return await AmapCoordinateConverter.convertToGcj02(location.longitude, location.latitude, coordSystem, this.webServiceKey); } catch (e) { console.warn('[AmapProvider] convertCoordinates fallback to original', e); return [location.longitude, location.latitude]; } }
  getCoordinateSystem(): string { return 'GCJ-02'; }
  drawPolylines(segments: Array<{ path: Array<[number, number]>; style: 'solid' | 'dashed'; color?: string }>): void {
    if (!this.mapInstance || !segments || !segments.length) return;
    const AMap = window.AMap;
    if (!AMap) return;
    for (const seg of segments) {
      if (!seg.path || seg.path.length < 2) continue;
      const color = seg.color || '#d3bc8d';
      const path = seg.path.map(([lng, lat]) => [lng, lat]);
      const polyline = new AMap.Polyline({
        path,
        strokeColor: color,
        strokeWeight: 4,
        strokeOpacity: 0.9,
        strokeStyle: seg.style === 'dashed' ? 'dashed' : 'solid',
        // AMap 的 dasharray 仅在 strokeStyle='dashed' 时生效
        strokeDasharray: seg.style === 'dashed' ? [8, 6] : undefined,
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 10, // 低于 marker（AMap Marker 默认 zIndex 12）
      });
      this.mapInstance.add(polyline);
      this.polylines.push(polyline);
    }
  }
  clearPolylines(): void {
    if (!this.mapInstance || !this.polylines.length) return;
    for (const pl of this.polylines) { try { this.mapInstance.remove(pl); } catch (e) { console.warn('[AmapProvider] polyline remove failed', e); } }
    this.polylines = [];
  }
  destroy(): void {
    this.clearPolylines();
    if (this.mapInstance) {
      try { this.mapInstance.destroy(); } catch (e) { console.warn('[AmapProvider] mapInstance.destroy failed', e); }
      this.mapInstance = null;
    }
    if (this.containerElement) {
      this.eventListeners.forEach(({ type, handler, options }) => { this.containerElement!.removeEventListener(type, handler, options); });
      this.eventListeners = [];
      // SDK.destroy() 通常会拆 DOM，但极端情况（已被 React detach 等）兜底清一遍，
      // 保证下次别的 provider initMap 进来时 container 是干净的。
      try { this.containerElement.replaceChildren(); } catch (e) { console.warn('[AmapProvider] container clear failed', e); }
      this.containerElement = null;
    }
    this.currentMarker = null;
  }
}


