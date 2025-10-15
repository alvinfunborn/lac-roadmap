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
  private apiKey: string;
  private language: 'zh' | 'en';
  private mapInstance: any = null;
  private currentMarker: any = null;

  constructor(apiKey: string, language: 'zh' | 'en' = 'zh') {
    this.apiKey = apiKey;
    this.language = language;
  }

  async initMap(container: HTMLElement, initialLocation?: MapLocation, availableProviders?: string[]): Promise<void> {
    const AMap = await loadAMapAPI(this.apiKey, this.language);
    const config = createAmapConfig(this.apiKey);
    this.mapInstance = new AMap.Map(container, { viewMode: '2D', zoom: config.zoom, center: config.center, mapStyle: config.mapStyle, resizeEnable: true, dragEnable: true, renderer: 'canvas', features: ['bg', 'road', 'building', 'point'] });
    AMap.plugin('AMap.Scale', () => { const scale = new AMap.Scale({ position: 'RB', offset: new AMap.Pixel(10, 10) }); this.mapInstance.addControl(scale); });
    if (initialLocation && initialLocation.longitude && initialLocation.latitude) { const [lng, lat] = await this.convertCoordinates(initialLocation); this.setCenter(lng, lat, 16); this.currentMarker = this.addMarker(lng, lat, initialLocation.name); }
    setTimeout(() => { if (this.mapInstance) { this.mapInstance.getSize(); } }, 200);
  }

  setCenter(lng: number, lat: number, zoom?: number): void { if (!this.mapInstance) return; this.mapInstance.setCenter([lng, lat]); if (zoom !== undefined) this.mapInstance.setZoom(zoom); }
  addMarker(lng: number, lat: number, title?: string): any { if (!this.mapInstance) return null; const AMap = (window as any).AMap; const marker = new AMap.Marker({ position: [lng, lat], title: title || 'selected', content: '<div class="lf-map-marker">📍</div>', anchor: 'bottom-center' }); this.mapInstance.add(marker); this.currentMarker = marker; return marker; }
  removeMarker(marker: any): void { if (!this.mapInstance || !marker) return; this.mapInstance.remove(marker); if (marker === this.currentMarker) { this.currentMarker = null; } }
  async searchPlaces(keyword: string): Promise<MapSearchResult[]> { return await searchPlacesByWebAPI(keyword, this.apiKey); }
  async getAddressByCoordinates(lng: number, lat: number): Promise<MapLocation | null> { return await getAddressByCoordinates(lng, lat, this.apiKey); }
  displaySearchMarkers(results: MapSearchResult[], onClick: (index: number) => void): any[] { if (!this.mapInstance || !results.length) return []; const AMap = (window as any).AMap; const markers: any[] = []; const positions: [number, number][] = []; for (let i = 0; i < results.length; i++) { const result = results[i]; if (result.location.longitude && result.location.latitude) { const marker = new AMap.Marker({ position: [result.location.longitude, result.location.latitude], title: result.name, content: `<div class="lf-map-marker-number">${i + 1}</div>`, anchor: 'center' }); marker.on('click', () => onClick(i)); this.mapInstance.add(marker); markers.push(marker); positions.push([result.location.longitude, result.location.latitude]); } } if (positions.length > 0) { try { this.mapInstance.setFitView(positions, false, [50, 50, 50, 50]); } catch (_) { this.mapInstance.setCenter(positions[0]); this.mapInstance.setZoom(12); } } return markers; }
  clearMarkers(markers: any[]): void { if (!this.mapInstance) return; markers.forEach(marker => { if (marker) { this.mapInstance.remove(marker); } }); }
  onMapClick(handler: (lng: number, lat: number) => void): void { if (!this.mapInstance) return; this.mapInstance.on('click', (e: any) => { const { lng, lat } = e.lnglat; handler(lng, lat); }); }
  async convertCoordinates(location: MapLocation): Promise<[number, number]> { if (!location.longitude || !location.latitude) return [116.4074, 39.9042]; const coordSystem = location.coordinate_system || 'WGS84'; if (coordSystem.toLowerCase() === 'gcj-02' || coordSystem.toLowerCase() === 'gcj02') return [location.longitude, location.latitude]; try { return await AmapCoordinateConverter.convertToGcj02(location.longitude, location.latitude, coordSystem, this.apiKey); } catch (_) { return [location.longitude, location.latitude]; } }
  getCoordinateSystem(): string { return 'GCJ-02'; }
  destroy(): void { if (this.mapInstance) { this.mapInstance.destroy(); this.mapInstance = null; } this.currentMarker = null; }
}


