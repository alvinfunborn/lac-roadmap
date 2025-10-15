export type TravelMode = 'walk' | 'bicycle' | 'two_wheeler' | 'drive' | 'transit';

export interface Address {
  name: string;
  address?: string;
  longitude?: number;
  latitude?: number;
  coordinate_system?: string;
}

export interface RouteSegment {
  travelMode: TravelMode;
  distance?: number;
  duration?: number;
  tolls?: number;
}

export interface PlaceDetail {
  start_time?: string;
  end_time?: string;
  description?: string;
  address?: Address;
}

export interface Place {
  id: string;
  name: string;
  detail: PlaceDetail;
}

export interface RoadmapDetail {
  description?: string;
  start_time?: string;
  end_time?: string;
  address?: Address;
}

export interface RoadmapItemGroup {
  key: string; // 分组键（日期或“第N天”）
  items: Array<Place | RouteSegment>;
}

export interface Roadmap {
  id: string;
  name: string;
  detail?: RoadmapDetail;
  items: Array<Place | RouteSegment>;
}

export interface RoadmapSet {
  entries: string[]; // 根文件内的 [[...]] 列表
}


