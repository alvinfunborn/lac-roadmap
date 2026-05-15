type Locale = 'auto' | 'en' | 'zh' | 'zh-CN';

let currentLocale: Locale = 'auto';

const dict: Record<string, Record<string, string>> = {
  'zh': {
    'command.open': '打开',
    'menu.openWith': '用 LaC.Roadmap 打开',
    'notice.invalidEntry': '入口文件格式无效，需包含 type="root" 且 renders 包含 "roadmapset"',
    'notice.entryFileNotExist': '入口文件不存在',
    'notice.openFailed': '打开失败',
    'notice.initialDataCreated': '已创建示例数据',
    'map.disabled': '地图未启用或缺少 API Key',
    'settings.description': 'LaC.Roadmap - 旅行路线规划与记录',
    'settings.tomlDescription': '根文件 TOML 需包含 type="root" 与 renders=["roadmapset"]',
    'settings.tomlExample': '示例 TOML',
    'settings.usage': '使用说明',
    'settings.usage.openView': '命令面板执行“Open LaC.Roadmap”打开视图',
    'settings.usage.dataFormat': '在根文件中使用 [[子文件]] 组织路线',
    'settings.usage.mapFeature': '选择地图提供商后可在弹窗中选择地址',
    'settings.entryFile.name': '入口文件',
    'settings.entryFile.desc': '用于渲染路线集的根文件路径',
    'settings.contextMenu.name': '右键菜单',
    'settings.contextMenu.desc': '在文件右键菜单中显示“用 LaC.Roadmap 打开”',
    'settings.locale.name': '语言',
    'settings.locale.desc': '界面显示语言',
    'settings.locale.option.auto': '自动',
    'settings.locale.option.zh': '中文',
    'settings.locale.option.en': '英文',
    'settings.map.title': '地图设置',
    'settings.map.provider.name': '地图提供商',
    'settings.map.provider.desc': '选择用于地址与地图的提供商',
    'settings.map.provider.option.none': '不使用',
    'settings.map.provider.option.gaode': '高德',
    'settings.map.provider.option.google': 'Google',
    'settings.map.gaodeKey.name': '高德 Web 服务 Key',
    'settings.map.gaodeKey.desc': '用于地点搜索与逆地理编码',
    'settings.map.gaodeKey.placeholder': '请输入高德 Web 服务 Key',
    'settings.map.googleKey.name': 'Google Maps API Key',
    'settings.map.googleKey.desc': '用于地图与地点搜索',
    'settings.map.googleKey.placeholder': '请输入 Google Maps API Key',
    'main.sampleRoadmap': '日本之行',
    'main.samplePlace1': '银座',
    'main.samplePlace2': '秋叶原',
    'modal.roadmap.create.title': '新建路线',
    'modal.roadmap.edit.title': '编辑路线',
    'modal.roadmap.name': '路线名称',
    'modal.roadmap.description': '描述',
    'modal.roadmap.start': '开始日期',
    'modal.roadmap.end': '结束日期',
    'modal.roadmap.address': '地址/地区',
    'modal.roadmap.mapProvider': '地图提供商',
    'modal.roadmap.followGlobal': '跟随全局',
    'modal.routeSegment.title': '编辑路线段',
    'modal.routeSegment.travelMode': '交通方式',
    'modal.routeSegment.distance': '距离（米）',
    'modal.routeSegment.duration': '用时（分钟）',
    'modal.routeSegment.tolls': '费用（元）',
    'modal.routeSegment.autoCalc': '自动计算',
    'modal.routeSegment.calculating': '计算中...',
    'modal.routeSegment.mode.walk': '步行',
    'modal.routeSegment.mode.bicycle': '骑行',
    'modal.routeSegment.mode.two_wheeler': '摩托',
    'modal.routeSegment.mode.drive': '驾车',
    'modal.routeSegment.mode.transit': '公交',
    'modal.routeSegment.noEndpoints': '缺少起点或终点',
    'modal.routeSegment.calcFailed': '路线计算失败：缺少坐标或 API Key',
    'modal.routeSegment.calcFailedShort': '路线计算失败',
    'modal.routeSegment.manualEditHint': '已插入空路线段，请手动编辑',
    'modal.common.cancel': '取消',
    'modal.common.save': '保存',
    'modal.common.delete': '删除',
    'modal.common.nameRequired': '名称不能为空'
  },
  'en': {
    'command.open': 'Open',
    'menu.openWith': 'Open with LaC.Roadmap',
    'notice.invalidEntry': 'Invalid entry file. It must contain type="root" and renders includes "roadmapset"',
    'notice.entryFileNotExist': 'Entry file does not exist',
    'notice.openFailed': 'Open failed',
    'notice.initialDataCreated': 'Sample data created',
    'main.sampleRoadmap': 'Japan Trip',
    'main.samplePlace1': 'Ginza',
    'main.samplePlace2': 'Akihabara',
    'modal.roadmap.create.title': 'New Roadmap',
    'modal.roadmap.edit.title': 'Edit Roadmap',
    'modal.roadmap.name': 'Name',
    'modal.roadmap.description': 'Description',
    'modal.roadmap.start': 'Start date',
    'modal.roadmap.end': 'End date',
    'modal.roadmap.address': 'Address / Region',
    'modal.roadmap.mapProvider': 'Map provider',
    'modal.roadmap.followGlobal': 'Follow global',
    'modal.routeSegment.title': 'Edit Route Segment',
    'modal.routeSegment.travelMode': 'Travel mode',
    'modal.routeSegment.distance': 'Distance (m)',
    'modal.routeSegment.duration': 'Duration (min)',
    'modal.routeSegment.tolls': 'Tolls',
    'modal.routeSegment.autoCalc': 'Auto calculate',
    'modal.routeSegment.calculating': 'Calculating...',
    'modal.routeSegment.mode.walk': 'Walk',
    'modal.routeSegment.mode.bicycle': 'Bicycle',
    'modal.routeSegment.mode.two_wheeler': 'Two-wheeler',
    'modal.routeSegment.mode.drive': 'Drive',
    'modal.routeSegment.mode.transit': 'Transit',
    'modal.routeSegment.noEndpoints': 'Missing start or end point',
    'modal.routeSegment.calcFailed': 'Route calculation failed: missing coordinates or API key',
    'modal.routeSegment.calcFailedShort': 'Route calculation failed',
    'modal.routeSegment.manualEditHint': 'Empty route segment inserted, please edit manually',
    'modal.common.cancel': 'Cancel',
    'modal.common.save': 'Save',
    'modal.common.delete': 'Delete',
    'modal.common.nameRequired': 'Name is required'
  }
};

export function setLocale(locale: Locale) {
  currentLocale = locale;
}

export function t(key: string): string {
  const lang = currentLocale === 'auto' ? 'zh' : (currentLocale === 'zh-CN' ? 'zh' : currentLocale); // default zh
  return dict[lang]?.[key] ?? key;
}

export function resolveLocale(locale: Locale): Locale {
  return locale;
}


