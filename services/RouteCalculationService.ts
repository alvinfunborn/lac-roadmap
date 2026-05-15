import { Place, RouteSegment, TravelMode } from '../types/roadmap';
import { CoordinateConverter } from '../components/map/GoogleMap';
import { requestUrl } from 'obsidian';

export interface RouteCalculationResult {
  distance: number; // 米
  duration: number; // 分钟
  travelMode: TravelMode;
  tolls?: number;
}

/**
 * 路径规划服务：计算两个地点之间的距离和时长
 */
export class RouteCalculationService {
  private googleApiKey?: string;
  private gaodeApiKey?: string;

  constructor(googleApiKey?: string, gaodeApiKey?: string) {
    this.googleApiKey = googleApiKey;
    this.gaodeApiKey = gaodeApiKey;
  }

  /**
   * 计算两个地点之间的路线
   * @param from 起点
   * @param to 终点
   * @param travelMode 出行方式（默认 transit）
   * @param provider 地图提供商（默认 google）
   */
  async calculateRoute(
    from: Place,
    to: Place,
    travelMode: TravelMode = 'transit',
    provider: 'google' | 'gaode' = 'google'
  ): Promise<RouteCalculationResult | null> {
    const fromLoc = from.detail?.address;
    const toLoc = to.detail?.address;

    if (!fromLoc?.longitude || !fromLoc?.latitude || !toLoc?.longitude || !toLoc?.latitude) {
      console.warn('[RouteCalculationService] Missing coordinates');
      return null;
    }

    // 构造符合类型要求的坐标对象
    const fromCoords = {
      longitude: fromLoc.longitude,
      latitude: fromLoc.latitude,
      coordinate_system: fromLoc.coordinate_system
    };
    const toCoords = {
      longitude: toLoc.longitude,
      latitude: toLoc.latitude,
      coordinate_system: toLoc.coordinate_system
    };

    if (provider === 'google' && this.googleApiKey) {
      return await this.calculateRouteGoogle(fromCoords, toCoords, travelMode);
    } else if (provider === 'gaode' && this.gaodeApiKey) {
      return await this.calculateRouteGaode(fromCoords, toCoords, travelMode);
    }

    console.warn('[RouteCalculationService] No API key available');
    return null;
  }

  /**
   * 使用 Google Directions API 计算路线
   */
  private async calculateRouteGoogle(
    from: { longitude: number; latitude: number; coordinate_system?: string },
    to: { longitude: number; latitude: number; coordinate_system?: string },
    travelMode: TravelMode
  ): Promise<RouteCalculationResult | null> {
    try {
      // 转换坐标系（Google 使用 WGS84）
      let [fromLng, fromLat] = [from.longitude, from.latitude];
      let [toLng, toLat] = [to.longitude, to.latitude];

      const fromSys = (from.coordinate_system || 'WGS84').toLowerCase();
      const toSys = (to.coordinate_system || 'WGS84').toLowerCase();

      if (fromSys === 'gcj-02' || fromSys === 'gcj02') {
        [fromLng, fromLat] = CoordinateConverter.gcj02ToWgs84(fromLng, fromLat);
      }
      if (toSys === 'gcj-02' || toSys === 'gcj02') {
        [toLng, toLat] = CoordinateConverter.gcj02ToWgs84(toLng, toLat);
      }

      // Google Directions API 的 travel mode 映射
      const modeMap: Record<TravelMode, string> = {
        walk: 'walking',
        bicycle: 'bicycling',
        two_wheeler: 'bicycling',
        drive: 'driving',
        transit: 'transit'
      };

      const mode = modeMap[travelMode] || 'transit';
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&mode=${mode}&key=${this.googleApiKey}&language=zh-CN`;

      // 使用 Obsidian 的 requestUrl 绕过 CORS
      const response = await requestUrl({ url, method: 'GET' });
      const data = response.json;

      if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
        console.warn('[RouteCalculationService] Google API returned no routes:', data.status);
        return null;
      }

      const route = data.routes[0];
      const leg = route.legs[0];

      return {
        distance: leg.distance.value, // 米
        duration: Math.round(leg.duration.value / 60), // 秒 -> 分钟
        travelMode,
        tolls: 0 // Google API 不直接提供过路费信息
      };
    } catch (error) {
      console.error('[RouteCalculationService] Google API error:', error);
      return null;
    }
  }

  /**
   * 使用高德路径规划 API 计算路线
   */
  private async calculateRouteGaode(
    from: { longitude: number; latitude: number; coordinate_system?: string },
    to: { longitude: number; latitude: number; coordinate_system?: string },
    travelMode: TravelMode
  ): Promise<RouteCalculationResult | null> {
    try {
      // 转换坐标系（高德使用 GCJ-02）
      let [fromLng, fromLat] = [from.longitude, from.latitude];
      let [toLng, toLat] = [to.longitude, to.latitude];

      const fromSys = (from.coordinate_system || 'WGS84').toLowerCase();
      const toSys = (to.coordinate_system || 'WGS84').toLowerCase();

      if (fromSys === 'wgs84' || fromSys === 'gps') {
        [fromLng, fromLat] = CoordinateConverter.wgs84ToGcj02(fromLng, fromLat);
      }
      if (toSys === 'wgs84' || toSys === 'gps') {
        [toLng, toLat] = CoordinateConverter.wgs84ToGcj02(toLng, toLat);
      }

      // 高德 API 的路径规划类型
      let apiPath = '';
      const origin = `${fromLng},${fromLat}`;
      const destination = `${toLng},${toLat}`;

      if (travelMode === 'walk') {
        apiPath = 'walking';
      } else if (travelMode === 'bicycle' || travelMode === 'two_wheeler') {
        apiPath = 'bicycling';
      } else if (travelMode === 'drive') {
        apiPath = 'driving';
      } else {
        apiPath = 'transit/integrated'; // 公共交通
      }

      const url = `https://restapi.amap.com/v3/direction/${apiPath}?origin=${origin}&destination=${destination}&key=${this.gaodeApiKey}`;

      // 使用 Obsidian 的 requestUrl 绕过 CORS
      const response = await requestUrl({ url, method: 'GET' });
      const data = response.json;

      if (data.status !== '1' || !data.route) {
        console.warn('[RouteCalculationService] Gaode API returned no routes:', data.info);
        return null;
      }

      let distance = 0;
      let duration = 0;

      if (apiPath === 'transit/integrated' && data.route.transits && data.route.transits.length > 0) {
        const transit = data.route.transits[0];
        distance = parseInt(transit.distance, 10);
        duration = Math.round(parseInt(transit.duration, 10) / 60); // 秒 -> 分钟
      } else if (data.route.paths && data.route.paths.length > 0) {
        const path = data.route.paths[0];
        distance = parseInt(path.distance, 10);
        duration = Math.round(parseInt(path.duration, 10) / 60); // 秒 -> 分钟
      }

      return {
        distance,
        duration,
        travelMode,
        tolls: 0
      };
    } catch (error) {
      console.error('[RouteCalculationService] Gaode API error:', error);
      return null;
    }
  }
}
