import { MapLocation, MapSearchResult } from '../../../types/map';

export interface IMapProvider {
  initMap(container: HTMLElement, initialLocation?: MapLocation, availableProviders?: string[], mapType?: 'roadmap' | 'satellite'): Promise<void>;
  setCenter(lng: number, lat: number, zoom?: number): void;
  addMarker(lng: number, lat: number, title?: string): any;
  removeMarker(marker: any): void;
  searchPlaces(keyword: string): Promise<MapSearchResult[]>;
  getAddressByCoordinates(lng: number, lat: number): Promise<MapLocation | null>;
  displaySearchMarkers(results: MapSearchResult[], onClick: (index: number) => void, options?: { markerStyle?: 'circle' | 'number'; statuses?: Array<'done' | 'plan' | 'wish' | undefined> }): any[];
  /** 缩放地图使所有点刚好在视野内 */
  fitBounds(locations: { lng: number; lat: number }[]): void;
  clearMarkers(markers: any[]): void;
  onMapClick(handler: (lng: number, lat: number) => void): void;
  convertCoordinates(location: MapLocation): Promise<[number, number]>;
  getCoordinateSystem(): string;
  /**
   * 绘制按顺序连接的折线。path 坐标必须已经是当前 provider 坐标系（Google→WGS84，Gaode→GCJ-02）。
   * style: 'solid' 表示实线（drive/transit/two_wheeler 等机动化方式），
   *        'dashed' 表示虚线（walk/bicycle 等步行/骑行）。
   * 折线 zIndex 低于 marker。
   */
  drawPolylines(segments: Array<{ path: Array<[number, number]>; style: 'solid' | 'dashed'; color?: string }>): void;
  /** 清除所有通过 drawPolylines 绘制的折线 */
  clearPolylines(): void;
  destroy(): void;
}


