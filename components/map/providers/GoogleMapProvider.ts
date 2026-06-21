/// <reference path="../../../types/shims.d.ts" />
import { IMapProvider } from './IMapProvider';
import { MapLocation, MapSearchResult } from '../../../types/map';
import {
  loadGoogleMapsAPI,
  searchPlacesByGoogleAPI,
  getAddressByCoordinates,
  createGoogleMapConfig,
  CoordinateConverter
} from '../GoogleMap';

declare const google: any;

export class GoogleMapProvider implements IMapProvider {
  private apiKey: string;
  private language: 'zh' | 'en';
  private mapInstance: any = null;
  private currentMarker: any = null;
  private containerElement: HTMLElement | null = null;
  private eventListeners: Array<{ type: string; handler: EventListener; options?: any }> = [];
  private resizeObserver: ResizeObserver | null = null;
  private polylines: any[] = [];

  constructor(apiKey: string, language: 'zh' | 'en' = 'en') {
    this.apiKey = apiKey;
    this.language = language;
  }

  async initMap(container: HTMLElement, initialLocation?: MapLocation, availableProviders?: string[], mapType: 'roadmap' | 'satellite' = 'satellite'): Promise<void> {
    await loadGoogleMapsAPI(this.apiKey, this.language);
    // 默认使用卫星图层（用于顶部地图），可通过参数指定
    const config = createGoogleMapConfig(this.apiKey, mapType);
    this.containerElement = container;
    // NOTE: A previous build registered `mousemove / mouseup / touchmove /
    // touchend / wheel` `stopPropagation` listeners on this container to
    // prevent Obsidian's outer workspace from intercepting events. Those
    // listeners also killed the map's own pan/zoom — Google Maps tracks
    // drags via document-level `mousemove`/`mouseup`, and our handlers
    // ate those before they could bubble up. The map appeared rendered
    // but was completely non-interactive. Removed entirely; Google /
    // AMap handle their own preventDefault internally for wheel zoom.
    this.mapInstance = new google.maps.Map(container, {
      center: config.center,
      zoom: config.zoom,
      mapTypeId: config.mapTypeId,
      mapId: config.mapId,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false,
      rotateControl: false,
      mapTypeControl: false,
      cameraControl: false,
      keyboardShortcuts: false,
      tilt: 0,
      // 默认 'auto' 在可滚动页面会降级到 'cooperative'，要求 Ctrl+滚轮才能
      // 缩放 — 在嵌套于 Obsidian 滚动 leaf 里的 AggregatedMap 上表现为
      // "滚轮 / 缩放都没反应"。'greedy' 强制让滚轮 / 拖拽 / 双指缩放
      // 直接作用于地图，不再要求 modifier 键。
      gestureHandling: 'greedy',
      scaleControl: true,
      scaleControlOptions: { position: google.maps.ControlPosition.BOTTOM_LEFT }
    });
    // ensure map resizes with container (pads/aspect wrappers)
    try {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.mapInstance && google?.maps?.event) {
          google.maps.event.trigger(this.mapInstance, 'resize');
        }
      });
      this.resizeObserver.observe(container);
      setTimeout(() => { if (this.mapInstance && google?.maps?.event) google.maps.event.trigger(this.mapInstance, 'resize'); }, 50);
    } catch (e) { console.warn('[GoogleMapProvider] ResizeObserver setup failed', e); }
    if (initialLocation && initialLocation.longitude && initialLocation.latitude) {
      const [lng, lat] = await this.convertCoordinates(initialLocation);
      this.setCenter(lng, lat, 16);
      this.currentMarker = this.addMarker(lng, lat, initialLocation.name);
    }
  }

  setCenter(lng: number, lat: number, zoom?: number): void { if (!this.mapInstance) return; this.mapInstance.setCenter({ lat, lng }); if (zoom !== undefined) this.mapInstance.setZoom(zoom); }
  addMarker(lng: number, lat: number, title?: string): any {
    if (!this.mapInstance) return null;
    // Render a small red circle dot without labels
    if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
      const el = document.createElement('div');
      el.style.width = '6px';
      el.style.height = '6px';
      el.style.borderRadius = '50%';
      el.style.background = '#ff3b30';
      const marker = new google.maps.marker.AdvancedMarkerElement({ position: { lat, lng }, map: this.mapInstance, title: title || '', content: el });
      return marker;
    }
    const marker = new google.maps.Marker({ position: { lat, lng }, map: this.mapInstance, title: title || '', icon: { path: google.maps.SymbolPath.CIRCLE, scale: 3, fillColor: '#ff3b30', fillOpacity: 1, strokeOpacity: 0 } });
    return marker;
  }
  removeMarker(marker: any): void { if (!marker) return; marker.setMap(null); }
  async searchPlaces(keyword: string): Promise<MapSearchResult[]> { return await searchPlacesByGoogleAPI(keyword, this.apiKey, this.mapInstance); }
  async getAddressByCoordinates(lng: number, lat: number): Promise<MapLocation | null> { return await getAddressByCoordinates(lng, lat, this.apiKey); }
  displaySearchMarkers(results: MapSearchResult[], onClick: (index: number) => void, options?: { markerStyle?: 'circle' | 'number'; statuses?: Array<'done' | 'plan' | 'wish' | undefined>; labels?: Array<number | undefined> }): any[] {
    if (!this.mapInstance || !results.length) return [];
    const useCircle = options?.markerStyle === 'circle';
    const statuses = options?.statuses;
    // 显式编号：子路线占两枚 marker（起点/终点）但共享同一序号，纯位置式 i+1 无法表达，
    // 故允许调用方传 labels 决定每枚 marker 上的数字；缺省回退到 i+1。
    const labels = options?.labels;
    const labelAt = (i: number): string => String(labels?.[i] ?? (i + 1));
    // Legacy-fallback fill palette mirrors --done / --plan / --wish tokens.
    const STATUS_FILL: Record<'done' | 'plan' | 'wish', string> = {
      done: '#B3995D',
      plan: '#D3BC8D',
      wish: '#C77A4A',
    };
    const markers: any[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.location.longitude && result.location.latitude) {
        let marker: any;
        const lat = result.location.latitude;
        const lng = result.location.longitude;
        const status = statuses?.[i];
        if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
          const el = document.createElement('div');
          if (useCircle) {
            el.className = `lac-map-marker-circle${status ? ` lac-map-marker-circle--${status}` : ''}`;
          } else {
            el.className = `lac-map-marker-number${status ? ` lac-map-marker-number--${status}` : ''}`;
            el.textContent = labelAt(i);
          }
          marker = new google.maps.marker.AdvancedMarkerElement({
            position: { lat, lng },
            map: this.mapInstance,
            title: result.name,
            content: el
          });
          marker.addListener('click', () => onClick(i));
        } else {
          // Legacy fallback — pick warm-ink-family fills so they survive the
          // .lac-aggmap-canvas saturate(0.55) hue-rotate(-8deg) filter.
          if (useCircle) {
            const fill = status ? STATUS_FILL[status] : '#C77A4A';
            marker = new google.maps.Marker({
              position: { lat, lng },
              map: this.mapInstance,
              title: result.name,
              icon: { path: google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: fill, fillOpacity: 1, strokeColor: '#ECE4D4', strokeWeight: 1.2 }
            });
          } else {
            const fill = status ? STATUS_FILL[status] : '#D3BC8D';
            marker = new google.maps.Marker({
              position: { lat, lng },
              map: this.mapInstance,
              title: result.name,
              icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: fill, fillOpacity: 1, strokeColor: '#0E1316', strokeWeight: 1.5 },
              label: { text: labelAt(i), color: '#0E1316', fontSize: '10px', fontWeight: 'bold' }
            });
          }
          marker.addListener('click', () => onClick(i));
        }
        markers.push(marker);
      }
    }
    return markers;
  }
  fitBounds(locations: { lng: number; lat: number }[]): void {
    if (!this.mapInstance || !locations.length) return;
    if (locations.length === 1) {
      this.mapInstance.setCenter({ lat: locations[0].lat, lng: locations[0].lng });
      this.mapInstance.setZoom(14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    locations.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
    this.mapInstance.fitBounds(bounds, { top: 24, right: 24, bottom: 24, left: 24 });
  }
  clearMarkers(markers: any[]): void { markers.forEach(marker => { if (marker) { marker.setMap(null); } }); }
  onMapClick(handler: (lng: number, lat: number) => void): void { if (!this.mapInstance) return; this.mapInstance.addListener('click', (e: any) => { if (e.latLng) { const lat = e.latLng.lat(); const lng = e.latLng.lng(); handler(lng, lat); } }); }
  async convertCoordinates(location: MapLocation): Promise<[number, number]> { if (!location.longitude || !location.latitude) return [116.4074, 39.9042]; const coordSystem = location.coordinate_system || 'WGS84'; if (coordSystem.toLowerCase() === 'wgs84' || coordSystem.toLowerCase() === 'gps') return [location.longitude, location.latitude]; if (coordSystem.toLowerCase() === 'gcj-02' || coordSystem.toLowerCase() === 'gcj02') { const [lng, lat] = CoordinateConverter.gcj02ToWgs84(location.longitude, location.latitude); return [lng, lat]; } return await CoordinateConverter.convertToWgs84(location.longitude, location.latitude, coordSystem); }
  getCoordinateSystem(): string { return 'WGS84'; }
  drawPolylines(segments: Array<{ path: Array<[number, number]>; style: 'solid' | 'dashed'; color?: string }>): void {
    if (!this.mapInstance || !segments || !segments.length) return;
    for (const seg of segments) {
      if (!seg.path || seg.path.length < 2) continue;
      const color = seg.color || '#d3bc8d';
      const path = seg.path.map(([lng, lat]) => ({ lat, lng }));
      const opts: any = {
        path,
        geodesic: true,
        strokeColor: color,
        strokeOpacity: seg.style === 'dashed' ? 0 : 0.9,
        strokeWeight: 4,
        zIndex: 1, // markers 默认更高；此处显式低于 markers
        clickable: false,
      };
      if (seg.style === 'dashed') {
        // Google 虚线：strokeOpacity=0 + icons 重复
        opts.icons = [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: color, strokeWeight: 2, scale: 3 },
          offset: '0',
          repeat: '12px'
        }];
      }
      const polyline = new google.maps.Polyline(opts);
      polyline.setMap(this.mapInstance);
      this.polylines.push(polyline);
    }
  }
  clearPolylines(): void {
    if (!this.polylines.length) return;
    for (const pl of this.polylines) { try { pl.setMap(null); } catch (e) { console.warn('[GoogleMapProvider] polyline.setMap(null) failed', e); } }
    this.polylines = [];
  }
  destroy(): void {
    this.clearPolylines();
    // Google Maps v3 没有 builtin destroy。只把 mapInstance 置 null 会让
    // tiles / overlays / iframe / 1000002 蒙层全部留在 container 里。当 React
    // effect 用同一个 container 重新创建别的 provider 时，旧 DOM 在新 DOM 之上
    // 截走所有手势事件 — 表现为"滚轮缩放都没反应"。这里手动把 listener 摘掉
    // 并清空 container。
    if (this.mapInstance && typeof google !== 'undefined' && google.maps?.event) {
      try { google.maps.event.clearInstanceListeners(this.mapInstance); } catch (e) { console.warn('[GoogleMapProvider] clearInstanceListeners failed', e); }
    }
    if (this.containerElement) {
      this.eventListeners.forEach(({ type, handler, options }) => { this.containerElement!.removeEventListener(type, handler, options); });
      this.eventListeners = [];
      if (this.resizeObserver) {
        try { this.resizeObserver.disconnect(); } catch (e) { console.warn('[GoogleMapProvider] resizeObserver.disconnect failed', e); }
        this.resizeObserver = null;
      }
      try { this.containerElement.replaceChildren(); } catch (e) { console.warn('[GoogleMapProvider] container clear failed', e); }
      this.containerElement = null;
    }
    this.mapInstance = null;
    this.currentMarker = null;
  }
}


