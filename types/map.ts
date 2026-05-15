// 地图相关类型定义（轻量版）
export interface MapLocation {
  longitude?: number;
  latitude?: number;
  name?: string;
  address?: string;
  coordinate_system?: string; // WGS84/GPS, GCJ-02, etc.
}

export interface MapSearchResult {
  name: string;
  address: string;
  location: MapLocation;
  distance?: number;
}

export interface MapSelectorProps {
  visible: boolean;
  initialLocation?: MapLocation;
  onCancel: () => void;
  onConfirm: (location: MapLocation) => void;
  title?: string;
  placeholder?: string;
  settings: any;
  updateSettings?: (newSettings: Partial<any>) => Promise<void>;
  /** Context overlay: existing route places rendered as numbered markers
   *  + connecting polyline so the user can see the trip layout while
   *  picking a new location. */
  routeLocations?: MapLocation[];
  /** 只读查看模式 —— 同样的 mask + map chrome，但去掉所有编辑入口：
   *  搜索栏、map-click 拾取、clear / pin-here、坐标 chip。底栏只剩 close。
   *  Route overlay (`routeLocations`) 照常渲染，所以这是「点开缩略图看
   *  全景」的最便宜路径。 */
  readOnly?: boolean;
}


