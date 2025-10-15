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
}


