export interface RoadmapSettings {
  locale: 'auto' | 'en' | 'zh-CN';
  entryFile: string;
  enableContextMenu: boolean;
  mapApiProvider: 'none' | 'gaode' | 'google';
  googleMapsApiKey?: string;
  gaodeWebServiceKey?: string;
}

export const DEFAULT_SETTINGS: RoadmapSettings = {
  locale: 'auto',
  entryFile: 'LaC/Roadmap/roadmap.md',
  enableContextMenu: true,
  mapApiProvider: 'none',
  googleMapsApiKey: '',
  gaodeWebServiceKey: ''
};


