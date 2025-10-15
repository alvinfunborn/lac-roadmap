import { MapLocation } from '../../types/map';

// Google Maps 配置工厂函数
export const createGoogleMapConfig = (googleMapsApiKey?: string) => ({
  key: googleMapsApiKey,
  center: { lat: 39.9042, lng: 116.4074 }, // 北京中心点
  zoom: 6, // 中国全境视图缩放级别
  mapTypeId: 'roadmap',
  mapId: 'LIFESET_LACOB_MAP'  // Map ID for AdvancedMarkerElement
});

// 坐标转换工具 - GCJ-02 到 WGS84
export class CoordinateConverter {
  public static gcj02ToWgs84(lng: number, lat: number): [number, number] {
    const a = 6378245.0; // 长半轴
    const ee = 0.00669342162296594323; // 扁率
    let dLat = this.transformLat(lng - 105.0, lat - 35.0);
    let dLng = this.transformLng(lng - 105.0, lat - 35.0);
    const radLat = (lat / 180.0) * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
    const wgsLat = lat - dLat;
    const wgsLng = lng - dLng;
    return [wgsLng, wgsLat];
  }
  public static wgs84ToGcj02(lng: number, lat: number): [number, number] {
    const a = 6378245.0;
    const ee = 0.00669342162296594323;
    let dLat = this.transformLat(lng - 105.0, lat - 35.0);
    let dLng = this.transformLng(lng - 105.0, lat - 35.0);
    const radLat = (lat / 180.0) * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
    const gcjLat = lat + dLat;
    const gcjLng = lng + dLng;
    return [gcjLng, gcjLat];
  }
  private static transformLat(lng: number, lat: number): number {
    let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }
  private static transformLng(lng: number, lat: number): number {
    let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
  }
  public static async convertToWgs84(lng: number, lat: number, fromSystem: string): Promise<[number, number]> {
    const coordSystemLower = (fromSystem || '').toLowerCase();
    if (coordSystemLower === 'wgs84' || coordSystemLower === 'gps' || coordSystemLower === 'wgs-84') {
      return [lng, lat];
    }
    if (coordSystemLower === 'gcj-02' || coordSystemLower === 'gcj02') {
      return this.gcj02ToWgs84(lng, lat);
    }
    return [lng, lat];
  }
}

// 地图API加载器
export const loadGoogleMapsAPI = (apiKey?: string, language?: 'zh' | 'en'): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve(window.google.maps);
      return;
    }
    if (!apiKey) {
      reject(new Error('Google Maps API key is required'));
      return;
    }
    const script = document.createElement('script');
    const lang = language === 'zh' ? 'zh-CN' : 'en';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=__googleMapsCallback&loading=async&libraries=marker,places&language=${lang}`;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    (window as any).__googleMapsCallback = () => {
      if (window.google && window.google.maps) {
        resolve(window.google.maps);
        delete (window as any).__googleMapsCallback;
      } else {
        reject(new Error('Google Maps API failed to load'));
      }
    };
    script.onerror = () => {
      delete (window as any).__googleMapsCallback;
      reject(new Error('Failed to load Google Maps API script'));
    };
    document.head.appendChild(script);
  });
};

// 使用新的 Places API (searchByText) 搜索地点
export const searchPlacesByGoogleAPI = async (keyword: string, apiKey: string, mapInstance?: any): Promise<any[]> => {
  try {
    if (!window.google || !window.google.maps) {
      await loadGoogleMapsAPI(apiKey);
    }
    const { Place } = await (google.maps as any).importLibrary('places');
    const request: any = {
      textQuery: keyword,
      fields: ['displayName', 'formattedAddress', 'location'],
      maxResultCount: 10
    };
    if (mapInstance) {
      const bounds = mapInstance.getBounds();
      if (bounds) {
        request.locationBias = bounds;
      } else {
        const center = mapInstance.getCenter();
        if (center) {
          request.locationBias = {
            center: { lat: center.lat(), lng: center.lng() },
            radius: 50000
          };
        }
      }
    }
    const { places } = await Place.searchByText(request);
    if (places && places.length > 0) {
      return places.map((place: any) => {
        const name = place.displayName || keyword;
        const address = place.formattedAddress || '';
        const location = place.location;
        return {
          name,
          address,
          location: {
            longitude: location.lng(),
            latitude: location.lat(),
            name,
            address,
            coordinate_system: 'WGS84'
          }
        };
      });
    }
    return [];
  } catch (_) {
    return [];
  }
};

// 逆地理编码（根据坐标获取地址）
export const getAddressByCoordinates = async (lng: number, lat: number, apiKey: string): Promise<MapLocation | null> => {
  try {
    if (!window.google || !window.google.maps) {
      await loadGoogleMapsAPI(apiKey);
    }
    const geocoder = new google.maps.Geocoder();
    const latlng = { lat, lng };
    return new Promise((resolve) => {
      geocoder.geocode({ location: latlng }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const result = results[0];
          let name = '';
          if (result.address_components) {
            for (const component of result.address_components) {
              if (component.types.some((type: string) => ['point_of_interest', 'establishment', 'premise', 'subpremise'].includes(type))) {
                name = component.long_name;
                break;
              }
            }
          }
          if (!name && result.formatted_address) {
            const parts = result.formatted_address.split(',');
            const firstPart = parts[0]?.trim() || '';
            if (firstPart && !/^\d+$/.test(firstPart) && firstPart.length > 2) name = firstPart; else if (parts.length > 1) name = parts[1]?.trim() || firstPart; else name = firstPart;
          }
          resolve({ longitude: lng, latitude: lat, name: name || '选中位置', address: result.formatted_address || '', coordinate_system: 'WGS84' });
        } else {
          resolve(null);
        }
      });
    });
  } catch (_) {
    return null;
  }
};

export const getCurrentLocationByIP = async (): Promise<MapLocation | null> => {
  try {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ longitude: 116.4074, latitude: 39.9042, name: '北京市', address: '北京市（默认位置）' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({ longitude: position.coords.longitude, latitude: position.coords.latitude, name: '当前位置', address: '当前位置' });
        },
        () => {
          resolve({ longitude: 116.4074, latitude: 39.9042, name: '北京市', address: '北京市（默认位置）' });
        },
        { timeout: 5000, maximumAge: 0 }
      );
    });
  } catch (_) {
    return null;
  }
};


