import { MapLocation } from '../../types/map';

export const createAmapConfig = (gaodeWebServiceKey?: string) => ({
  key: gaodeWebServiceKey,
  secret: '',
  center: [116.4074, 39.9042] as [number, number],
  zoom: 6,
  mapStyle: 'amap://styles/normal'
});

export class CoordinateConverter {
  public static async convertToGcj02(lng: number, lat: number, fromSystem: string, apiKey: string): Promise<[number, number]> {
    try {
      const coordSystemLower = (fromSystem || '').toLowerCase();
      if (coordSystemLower === 'gcj-02' || coordSystemLower === 'gcj02') return [lng, lat];
      let coordsys = 'gps';
      if (coordSystemLower === 'wgs84' || coordSystemLower === 'gps') coordsys = 'gps';
      else if (coordSystemLower === 'bd-09' || coordSystemLower === 'baidu') coordsys = 'baidu';
      else if (coordSystemLower === 'mapbar' || coordSystemLower === 'tuba') coordsys = 'mapbar';
      const response = await fetch(`https://restapi.amap.com/v3/assistant/coordinate/convert?key=${apiKey}&locations=${lng},${lat}&coordsys=${coordsys}`);
      const data = await response.json();
      if (data.status === '1' && data.locations) {
        const convertedCoord = data.locations.split(',').map(Number);
        return [convertedCoord[0], convertedCoord[1]];
      } else {
        return [lng, lat];
      }
    } catch (_) { return [lng, lat]; }
  }
}

export const loadAMapAPI = (apiKey?: string, language?: 'zh' | 'en'): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).AMap) {
      resolve((window as any).AMap);
      return;
    }
    const script = document.createElement('script');
    const lang = language === 'en' ? 'en' : 'zh_cn';
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${apiKey || ''}&lang=${lang}`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if ((window as any).AMap) resolve((window as any).AMap); else reject(new Error('AMap API failed to load'));
    };
    script.onerror = () => reject(new Error('Failed to load AMap API script'));
    document.head.appendChild(script);
  });
};

export const searchPlacesByWebAPI = async (keyword: string, apiKey: string): Promise<any[]> => {
  try {
    const searchParams = new URLSearchParams({ key: apiKey, keywords: keyword, citylimit: 'false', output: 'json', extensions: 'all' });
    const response = await fetch(`https://restapi.amap.com/v3/place/text?${searchParams.toString()}`);
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    if (data.status === '1' && data.pois && data.pois.length > 0) {
      return data.pois.map((poi: any) => ({
        name: poi.name,
        address: poi.address,
        location: { longitude: parseFloat(poi.location.split(',')[0]), latitude: parseFloat(poi.location.split(',')[1]), name: poi.name, address: poi.address },
        distance: poi.distance
      }));
    }
    return [];
  } catch (_) { return []; }
};

export const getAddressByCoordinates = async (lng: number, lat: number, apiKey: string): Promise<MapLocation | null> => {
  try {
    const response = await fetch(`https://restapi.amap.com/v3/geocode/regeo?key=${apiKey}&location=${lng},${lat}&poitype=&radius=1000&extensions=all&batch=false&roadlevel=0`);
    const data = await response.json();
    if (data.status === '1' && data.regeocode) {
      const regeocode = data.regeocode;
      const addressComponent = regeocode.addressComponent;
      let name = '';
      if (regeocode.pois && regeocode.pois.length > 0) name = regeocode.pois[0].name; else if (regeocode.roads && regeocode.roads.length > 0) name = regeocode.roads[0].name; else name = `${addressComponent.district || ''}${addressComponent.township || ''}`;
      const address = regeocode.formatted_address || `${addressComponent.province || ''}${addressComponent.city || ''}${addressComponent.district || ''}${addressComponent.township || ''}${addressComponent.neighborhood?.name || ''}`;
      return { longitude: lng, latitude: lat, name: name || '选中位置', address, coordinate_system: 'GCJ-02' };
    }
    return null;
  } catch (_) { return null; }
};


