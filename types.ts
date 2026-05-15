export interface RoadmapSettings {
  locale: 'auto' | 'en' | 'zh-CN';
  entryFile: string;
  enableContextMenu: boolean;
  mapApiProvider: 'none' | 'gaode' | 'google';
  googleMapsApiKey?: string;
  /** 高德 Web 端(JS API) Key，用于地图展示。控制台服务平台选「Web端(JS API)」。 */
  gaodeJsApiKey?: string;
  /** 高德 Web 服务 Key，用于搜索/静态图/坐标转换。控制台服务平台选「Web服务」。 */
  gaodeWebServiceKey?: string;
  /**
   * 是否总是将地点的 start_time/end_time 分离写入路线文件（作为覆盖行），
   * 即使该地点只被一条路线引用。默认 true。
   */
  alwaysSeparatePlaceSchedule?: boolean;
}

export const DEFAULT_SETTINGS: RoadmapSettings = {
  locale: 'auto',
  entryFile: 'LaC/Roadmap/roadmap.md',
  enableContextMenu: true,
  mapApiProvider: 'none',
  googleMapsApiKey: '',
  gaodeJsApiKey: '',
  gaodeWebServiceKey: '',
  alwaysSeparatePlaceSchedule: true,
};


