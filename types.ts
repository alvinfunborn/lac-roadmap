export interface RoadmapSettings {
  locale: 'auto' | 'en' | 'zh' | 'zh-CN';
  entryFile: string;
  mapApiProvider: 'none' | 'gaode' | 'google';
  googleMapsApiKey?: string;
  /** 高德 Web 端(JS API) Key，用于地图展示。控制台服务平台选「Web端(JS API)」。 */
  gaodeJsApiKey?: string;
  /** 高德 Web 服务 Key，用于搜索/静态图/坐标转换。控制台服务平台选「Web服务」。 */
  gaodeWebServiceKey?: string;
}

export const DEFAULT_SETTINGS: RoadmapSettings = {
  locale: 'auto',
  entryFile: 'LaC/Roadmap/roadmap.md',
  mapApiProvider: 'none',
  googleMapsApiKey: '',
  gaodeJsApiKey: '',
  gaodeWebServiceKey: '',
};
