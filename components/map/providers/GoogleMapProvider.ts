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

  constructor(apiKey: string, language: 'zh' | 'en' = 'en') {
    this.apiKey = apiKey;
    this.language = language;
  }

  async initMap(container: HTMLElement, initialLocation?: MapLocation, availableProviders?: string[]): Promise<void> {
    await loadGoogleMapsAPI(this.apiKey, this.language);
    const config = createGoogleMapConfig(this.apiKey);
    this.containerElement = container;
    const stopPropagation = (e: Event) => e.stopPropagation();
    const addListener = (type: string, handler: EventListener, options?: any) => { container.addEventListener(type, handler, options); this.eventListeners.push({ type, handler, options }); };
    addListener('touchstart', stopPropagation, { passive: false });
    addListener('touchmove', stopPropagation, { passive: false });
    addListener('touchend', stopPropagation, { passive: false });
    addListener('mousedown', stopPropagation);
    addListener('mousemove', stopPropagation);
    addListener('mouseup', stopPropagation);
    addListener('wheel', stopPropagation, { passive: false });
    this.mapInstance = new google.maps.Map(container, {
      center: config.center,
      zoom: config.zoom,
      mapTypeId: config.mapTypeId,
      mapId: config.mapId,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false,
      rotateControl: false,
      tilt: 0,
      mapTypeControl: false,
      scaleControl: true,
      scaleControlOptions: { position: google.maps.ControlPosition.BOTTOM_LEFT }
    });
    if (initialLocation && initialLocation.longitude && initialLocation.latitude) {
      const [lng, lat] = await this.convertCoordinates(initialLocation);
      this.setCenter(lng, lat, 16);
      this.currentMarker = this.addMarker(lng, lat, initialLocation.name);
    }
  }

  setCenter(lng: number, lat: number, zoom?: number): void { if (!this.mapInstance) return; this.mapInstance.setCenter({ lat, lng }); if (zoom !== undefined) this.mapInstance.setZoom(zoom); }
  addMarker(lng: number, lat: number, title?: string): any {
    if (!this.mapInstance) return null;
    if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
      const marker = new google.maps.marker.AdvancedMarkerElement({ position: { lat, lng }, map: this.mapInstance, title: title || 'selected' });
      return marker;
    }
    const marker = new google.maps.Marker({ position: { lat, lng }, map: this.mapInstance, title: title || 'selected' });
    return marker;
  }
  removeMarker(marker: any): void { if (!marker) return; marker.setMap(null); }
  async searchPlaces(keyword: string): Promise<MapSearchResult[]> { return await searchPlacesByGoogleAPI(keyword, this.apiKey, this.mapInstance); }
  async getAddressByCoordinates(lng: number, lat: number): Promise<MapLocation | null> { return await getAddressByCoordinates(lng, lat, this.apiKey); }
  displaySearchMarkers(results: MapSearchResult[], onClick: (index: number) => void): any[] {
    if (!this.mapInstance || !results.length) return [];
    const markers: any[] = [];
    const bounds: any[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.location.longitude && result.location.latitude) {
        let marker: any;
        if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
          const labelDiv = document.createElement('div'); labelDiv.className = 'lf-map-marker-number'; labelDiv.textContent = String(i + 1);
          marker = new google.maps.marker.AdvancedMarkerElement({ position: { lat: result.location.latitude, lng: result.location.longitude }, map: this.mapInstance, title: result.name, content: labelDiv });
          marker.addListener('click', () => onClick(i));
        } else {
          marker = new google.maps.Marker({ position: { lat: result.location.latitude, lng: result.location.longitude }, map: this.mapInstance, title: result.name, label: { text: String(i + 1), color: 'white', fontSize: '12px', fontWeight: 'bold' } });
          marker.addListener('click', () => onClick(i));
        }
        markers.push(marker); bounds.push(new google.maps.LatLng(result.location.latitude, result.location.longitude));
      }
    }
    if (bounds.length > 0) { const mapBounds = new google.maps.LatLngBounds(); bounds.forEach((pos: any) => mapBounds.extend(pos)); this.mapInstance.fitBounds(mapBounds); }
    return markers;
  }
  clearMarkers(markers: any[]): void { markers.forEach(marker => { if (marker) { marker.setMap(null); } }); }
  onMapClick(handler: (lng: number, lat: number) => void): void { if (!this.mapInstance) return; this.mapInstance.addListener('click', (e: any) => { if (e.latLng) { const lat = e.latLng.lat(); const lng = e.latLng.lng(); handler(lng, lat); } }); }
  async convertCoordinates(location: MapLocation): Promise<[number, number]> { if (!location.longitude || !location.latitude) return [116.4074, 39.9042]; const coordSystem = location.coordinate_system || 'WGS84'; if (coordSystem.toLowerCase() === 'wgs84' || coordSystem.toLowerCase() === 'gps') return [location.longitude, location.latitude]; if (coordSystem.toLowerCase() === 'gcj-02' || coordSystem.toLowerCase() === 'gcj02') { const [lng, lat] = CoordinateConverter.gcj02ToWgs84(location.longitude, location.latitude); return [lng, lat]; } return await CoordinateConverter.convertToWgs84(location.longitude, location.latitude, coordSystem); }
  getCoordinateSystem(): string { return 'WGS84'; }
  destroy(): void { if (this.containerElement) { this.eventListeners.forEach(({ type, handler, options }) => { this.containerElement!.removeEventListener(type, handler, options); }); this.eventListeners = []; this.containerElement = null; } this.mapInstance = null; this.currentMarker = null; }
}


