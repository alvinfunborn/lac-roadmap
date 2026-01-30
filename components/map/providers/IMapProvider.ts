import { MapLocation, MapSearchResult } from '../../../types/map';

export interface IMapProvider {
  initMap(container: HTMLElement, initialLocation?: MapLocation, availableProviders?: string[], mapType?: 'roadmap' | 'satellite'): Promise<void>;
  setCenter(lng: number, lat: number, zoom?: number): void;
  addMarker(lng: number, lat: number, title?: string): any;
  removeMarker(marker: any): void;
  searchPlaces(keyword: string): Promise<MapSearchResult[]>;
  getAddressByCoordinates(lng: number, lat: number): Promise<MapLocation | null>;
  displaySearchMarkers(results: MapSearchResult[], onClick: (index: number) => void): any[];
  clearMarkers(markers: any[]): void;
  onMapClick(handler: (lng: number, lat: number) => void): void;
  convertCoordinates(location: MapLocation): Promise<[number, number]>;
  getCoordinateSystem(): string;
  destroy(): void;
}


