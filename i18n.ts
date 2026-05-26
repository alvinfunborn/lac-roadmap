export type LocaleSetting = 'auto' | 'zh' | 'en' | 'zh-CN';

let currentLocale: 'zh' | 'en' = 'zh';

export function resolveLocale(locale: LocaleSetting | undefined): 'zh' | 'en' {
  if (!locale || locale === 'auto') {
    try {
      const lang = (navigator.language || '').toLowerCase();
      return lang.startsWith('zh') ? 'zh' : 'en';
    } catch (_) {
      return 'en';
    }
  }
  if (locale === 'zh-CN') return 'zh';
  return locale;
}

export function setLocale(locale: LocaleSetting | 'zh' | 'en'): void {
  currentLocale = resolveLocale(locale as LocaleSetting);
}

export function getCurrentLocale(): 'zh' | 'en' {
  return currentLocale;
}

type Dict = Record<string, { zh: string; en: string }>;

const dict: Dict = {
  // Common
  'common.confirm': { zh: '确定', en: 'Confirm' },
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.delete': { zh: '删除', en: 'Delete' },
  'common.save': { zh: '保存', en: 'Save' },
  'common.back': { zh: '返回', en: 'Back' },
  'common.add': { zh: '添加', en: 'Add' },
  'common.edit': { zh: '编辑', en: 'Edit' },

  // Menu / Command
  'command.open': { zh: '打开', en: 'Open' },
  'menu.openWith': { zh: '用 LaC.Roadmap 打开', en: 'Open with LaC.Roadmap' },

  // Notices
  'notice.invalidEntry': {
    zh: '入口文件格式无效，需包含 type="root" 且 renders 包含 "roadmapset"',
    en: 'Invalid entry file. It must contain type="root" and renders includes "roadmapset"',
  },
  'notice.entryFileNotExist': { zh: '入口文件不存在', en: 'Entry file does not exist' },
  'notice.openFailed': { zh: '打开失败', en: 'Open failed' },
  'notice.initialDataCreated': { zh: '已创建示例数据', en: 'Sample data created' },
  'notice.loadFailed': { zh: '加载路线失败', en: 'Failed to load roadmap' },
  'notice.saveFailed': { zh: '保存失败', en: 'Save failed' },
  'notice.savePlaceFailed': { zh: '保存地点失败', en: 'Failed to save place' },
  'notice.updateRoadmapFailed': { zh: '更新路线失败', en: 'Failed to update roadmap' },
  'notice.placeRenameFailed': { zh: '地点重命名失败', en: 'Failed to rename place' },
  'notice.deleteFailed': { zh: '删除失败', en: 'Delete failed' },
  'notice.updateSegmentFailed': { zh: '更新路线段失败', en: 'Failed to update route segment' },
  'notice.subRoadmapNameRequired': { zh: '子路线名称不能为空', en: 'Sub-roadmap name is required' },
  'notice.subRoadmapDuplicate': { zh: '已有同名地点 / 子路线', en: 'A place / sub-roadmap with this name already exists' },
  'notice.subRoadmapCreateFailed': { zh: '创建子路线失败', en: 'Failed to create sub-roadmap' },
  'notice.subRoadmapCreated': { zh: '已创建子路线「{name}」', en: 'Created sub-roadmap "{name}"' },
  'notice.deletedTrip': { zh: '已彻底删除「{name}」', en: 'Permanently deleted "{name}"' },
  'notice.fileNotFound': { zh: '未找到对应的 .md 文件', en: 'Could not find the matching .md file' },
  'notice.deleteFileFailed': { zh: '删除文件失败', en: 'Failed to delete file' },
  'map.disabled': { zh: '地图未启用或缺少 API Key', en: 'Map disabled or API key missing' },

  // Settings
  'settings.description': { zh: 'LaC.Roadmap - 旅行路线规划与记录', en: 'LaC.Roadmap - Travel route planning and journaling' },
  'settings.tomlDescription': {
    zh: '根文件 TOML 需包含 type="root" 与 renders=["roadmapset"]',
    en: 'Root TOML must contain type="root" and renders=["roadmapset"]',
  },
  'settings.tomlExample': { zh: '示例 TOML', en: 'TOML example' },
  'settings.usage': { zh: '使用说明', en: 'Usage' },
  'settings.usage.openView': { zh: '命令面板执行"Open LaC.Roadmap"打开视图', en: 'Open the view via command palette: "Open LaC.Roadmap"' },
  'settings.usage.dataFormat': { zh: '在根文件中使用 [[子文件]] 组织路线', en: 'Organise roadmaps with [[child]] links inside the root file' },
  'settings.usage.mapFeature': { zh: '选择地图提供商后可在弹窗中选择地址', en: 'After choosing a map provider, addresses can be picked in dialogs' },
  'settings.entryFile.name': { zh: '入口文件', en: 'Entry file' },
  'settings.entryFile.desc': { zh: '用于渲染路线集的根文件路径', en: 'Path to the root file used to render the roadmap set' },
  'settings.contextMenu.name': { zh: '右键菜单', en: 'Context menu' },
  'settings.contextMenu.desc': { zh: '在文件右键菜单中显示"用 LaC.Roadmap 打开"', en: 'Show "Open with LaC.Roadmap" in the file context menu' },
  'settings.locale.name': { zh: '语言', en: 'Language' },
  'settings.locale.desc': { zh: '界面显示语言', en: 'Interface language' },
  'settings.locale.option.auto': { zh: '跟随系统', en: 'Auto' },
  'settings.locale.option.zh': { zh: '中文', en: 'Chinese' },
  'settings.locale.option.en': { zh: '英文', en: 'English' },
  'settings.map.title': { zh: '地图设置', en: 'Map settings' },
  'settings.map.provider.name': { zh: '地图提供商', en: 'Map provider' },
  'settings.map.provider.desc': { zh: '选择用于地址与地图的提供商', en: 'Choose the provider used for addresses and maps' },
  'settings.map.provider.option.none': { zh: '不使用', en: 'None' },
  'settings.map.provider.option.gaode': { zh: '高德', en: 'Gaode' },
  'settings.map.provider.option.google': { zh: 'Google', en: 'Google' },
  'settings.map.gaodeKey.name': { zh: '高德 Web 服务 Key', en: 'Gaode Web Service Key' },
  'settings.map.gaodeKey.desc': { zh: '用于地点搜索与逆地理编码', en: 'Used for place search and reverse geocoding' },
  'settings.map.gaodeKey.placeholder': { zh: '请输入高德 Web 服务 Key', en: 'Enter Gaode Web Service Key' },
  'settings.map.googleKey.name': { zh: 'Google Maps API Key', en: 'Google Maps API Key' },
  'settings.map.googleKey.desc': { zh: '用于地图与地点搜索', en: 'Used for maps and place search' },
  'settings.map.googleKey.placeholder': { zh: '请输入 Google Maps API Key', en: 'Enter Google Maps API Key' },

  // Sample data
  'main.sampleRoadmap': { zh: '日本之行', en: 'Japan Trip' },
  'main.samplePlace1': { zh: '银座', en: 'Ginza' },
  'main.samplePlace2': { zh: '秋叶原', en: 'Akihabara' },

  // Roadmap edit modal
  'modal.roadmap.create.title': { zh: '新建路线', en: 'New Roadmap' },
  'modal.roadmap.edit.title': { zh: '编辑路线', en: 'Edit Roadmap' },
  'modal.roadmap.name': { zh: '路线名称', en: 'Name' },
  'modal.roadmap.description': { zh: '描述', en: 'Description' },
  'modal.roadmap.start': { zh: '开始日期', en: 'Start date' },
  'modal.roadmap.end': { zh: '结束日期', en: 'End date' },
  'modal.roadmap.address': { zh: '地址/地区', en: 'Address / Region' },
  'modal.roadmap.mapProvider': { zh: '地图提供商', en: 'Map provider' },
  'modal.roadmap.followGlobal': { zh: '跟随全局', en: 'Follow global' },

  // Route-segment modal
  'modal.routeSegment.title': { zh: '编辑路线段', en: 'Edit Route Segment' },
  'modal.routeSegment.travelMode': { zh: '交通方式', en: 'Travel mode' },
  'modal.routeSegment.distance': { zh: '距离（米）', en: 'Distance (m)' },
  'modal.routeSegment.duration': { zh: '用时（分钟）', en: 'Duration (min)' },
  'modal.routeSegment.tolls': { zh: '费用（元）', en: 'Tolls' },
  'modal.routeSegment.autoCalc': { zh: '自动计算', en: 'Auto calculate' },
  'modal.routeSegment.calculating': { zh: '计算中...', en: 'Calculating...' },
  'modal.routeSegment.mode.walk': { zh: '步行', en: 'Walk' },
  'modal.routeSegment.mode.bicycle': { zh: '骑行', en: 'Bicycle' },
  'modal.routeSegment.mode.two_wheeler': { zh: '摩托', en: 'Two-wheeler' },
  'modal.routeSegment.mode.drive': { zh: '驾车', en: 'Drive' },
  'modal.routeSegment.mode.transit': { zh: '公交', en: 'Transit' },
  'modal.routeSegment.noEndpoints': { zh: '缺少起点或终点', en: 'Missing start or end point' },
  'modal.routeSegment.calcFailed': { zh: '路线计算失败：缺少坐标或 API Key', en: 'Route calculation failed: missing coordinates or API key' },
  'modal.routeSegment.calcFailedShort': { zh: '路线计算失败', en: 'Route calculation failed' },
  'modal.routeSegment.manualEditHint': { zh: '已插入空路线段，请手动编辑', en: 'Empty route segment inserted, please edit manually' },

  // Modal common
  'modal.common.cancel': { zh: '取消', en: 'Cancel' },
  'modal.common.save': { zh: '保存', en: 'Save' },
  'modal.common.delete': { zh: '删除', en: 'Delete' },
  'modal.common.nameRequired': { zh: '名称不能为空', en: 'Name is required' },

  // Place edit modal
  'modal.place.create.eyebrow': { zh: '新建地点', en: 'new place' },
  'modal.place.edit.eyebrow': { zh: '编辑地点', en: 'edit place' },
  'modal.place.defaultTitle': { zh: '新地点', en: 'New place' },
  'modal.place.section.name': { zh: '名称', en: 'name' },
  'modal.place.section.when': { zh: '时间', en: 'when' },
  'modal.place.section.where': { zh: '位置', en: 'where' },
  'modal.place.section.notes': { zh: '备注', en: 'notes' },
  'modal.place.placeholder.name': { zh: '地点名称', en: 'Place name' },
  'modal.place.placeholder.date': { zh: '日期', en: 'date' },
  'modal.place.placeholder.time': { zh: '--:--', en: '--:--' },
  'modal.place.placeholder.notes': { zh: '描述', en: 'Description' },
  'modal.place.placeholder.address': { zh: '地址', en: 'Address' },
  'modal.place.placeholder.addressClick': { zh: '点击选择地址', en: 'Click to choose an address' },
  'modal.place.timeInvalid': { zh: '时间格式无效', en: 'Invalid time format' },
  'modal.place.startTimeInvalid': { zh: '开始时间格式无效', en: 'Invalid start time format' },
  'modal.place.endTimeInvalid': { zh: '结束时间格式无效', en: 'Invalid end time format' },
  'modal.place.timeRangeInvalid': { zh: '时间范围无效', en: 'Invalid time range' },
  'modal.place.timePicker.start': { zh: '开始时间', en: 'Start time' },
  'modal.place.timePicker.end': { zh: '结束时间', en: 'End time' },
  'modal.place.delete.label': { zh: '删除', en: 'delete' },
  'modal.place.cancel.label': { zh: '取消', en: 'cancel' },
  'modal.place.save.label': { zh: '保存', en: 'save' },
  'modal.place.mapAria': { zh: '选择地图位置', en: 'Choose map location' },

  // Roadmap set page
  'page.set.eyebrow': { zh: 'LaC · Roadmap', en: 'LaC · Roadmap' },
  'page.set.title': { zh: '行程', en: 'Trips' },
  'page.set.tripCount': { zh: '{n} 条行程', en: '{n} trips' },
  'page.set.section.wishlist': { zh: '未安排', en: 'wishlist' },
  'page.set.section.planned': { zh: '已规划', en: 'planned' },
  'page.set.newTrip': { zh: '+ 新建行程', en: '+ new trip' },
  'page.set.mapExpand': { zh: '↗ 放大', en: '↗ expand' },
  'page.set.mapAria': { zh: '点击放大地图', en: 'Click to expand map' },
  'page.set.menu.remove': { zh: '从集合移除', en: 'Remove from set' },
  'page.set.menu.copy': { zh: '复制', en: 'Duplicate' },
  'page.set.menu.deletePermanent': { zh: '彻底删除', en: 'Delete permanently' },
  'page.set.confirm.remove': { zh: '从集合中移除「{name}」？', en: 'Remove "{name}" from set?' },
  'page.set.confirm.delete1': { zh: '彻底删除「{name}」并将其 .md 文件移入回收站？', en: 'Permanently delete "{name}" and trash its .md file?' },
  'page.set.confirm.delete2': { zh: '此操作不可撤销。文件中的地点引用本身（[[...]]）保留为孤立链接。再次确认彻底删除「{name}」？', en: 'This is irreversible. Place references ([[...]]) become orphan links. Confirm permanent deletion of "{name}"?' },
  'page.set.stats.done': { zh: '{n} 已完成', en: '{n} done' },
  'page.set.stats.planning': { zh: '{n} 规划中', en: '{n} planning' },
  'page.set.stats.wishlist': { zh: '{n} 待安排', en: '{n} wishlist' },
  'page.set.stats.places': { zh: '{n} 个地点', en: '{n} places' },

  // Roadmap page
  'page.roadmap.eyebrow': { zh: '行程', en: 'trip' },
  'page.roadmap.back': { zh: '返回', en: 'Back' },
  'page.roadmap.stats.days': { zh: ' 天', en: ' days' },
  'page.roadmap.stats.places': { zh: ' 个地点', en: ' places' },
  'page.roadmap.actions.addPlace': { zh: '+ 添加地点', en: '+ add place' },
  'page.roadmap.actions.addTrip': { zh: '+ 子路线', en: '+ add trip' },

  // Day tabs / Timeline
  'tabs.day.eyebrow': { zh: '第{n}天', en: 'DAY {n}' },
  'tabs.day.eyebrow.placeholder': { zh: '第·天', en: 'DAY ·' },
  'tabs.day.label': { zh: '第{n}天', en: 'Day {n}' },
  'tabs.day.label.empty': { zh: '未排日', en: '—' },
  'tabs.unplanned': { zh: '未安排', en: 'wishlist' },
  'tabs.add': { zh: '+ 加一天', en: '+ day' },
  'tabs.add.title': { zh: '添加一天', en: 'Add a day' },
  'timeline.addTransit': { zh: '+ 交通', en: '+ transit' },

  // Confirm modal & misc
  'confirm.deletePlace': { zh: '删除地点「{name}」？', en: 'Delete place "{name}"?' },

  // Roadmap (trip) edit modal
  'modal.trip.create.eyebrow': { zh: '新建路线', en: 'new trip' },
  'modal.trip.edit.eyebrow': { zh: '编辑路线', en: 'edit trip' },
  'modal.trip.create.title': { zh: '新路线', en: 'New trip' },
  'modal.trip.fallback.title': { zh: '路线', en: 'Trip' },
  'modal.trip.status.draft': { zh: '草稿', en: 'draft' },
  'modal.trip.status.editing': { zh: '编辑中', en: 'editing' },
  'modal.trip.section.required': { zh: '必填', en: 'required' },
  'modal.trip.placeholder.name': { zh: '路线名称', en: 'Trip name' },
  'modal.trip.placeholder.notes': { zh: '路线描述', en: 'Trip description' },
  'modal.trip.placeholder.startDate': { zh: '起始日期', en: 'Start date' },
  'modal.trip.placeholder.endDate': { zh: '结束日期', en: 'End date' },
  'modal.trip.nights': { zh: '{n} 晚', en: '{n} nights' },
  'modal.trip.pts': { zh: '{n} 个点', en: '{n} pts' },
  'modal.trip.noPlaces': { zh: '尚无带坐标的地点', en: 'No geocoded places yet' },
  'modal.trip.endpoint.start': { zh: '起点', en: 'start' },
  'modal.trip.endpoint.end': { zh: '终点', en: 'end' },
  'modal.trip.thumbAria': { zh: '路线总览缩略图', en: 'Trip overview thumbnail' },
  'modal.trip.viewerAria': { zh: '点开查看路线全景地图', en: 'Open full trip map' },
  'modal.trip.provider.followGlobal': { zh: '跟随全局', en: 'follow global' },
  'modal.trip.section.provider': { zh: '地图提供商', en: 'provider' },
  'modal.trip.cancel': { zh: '取消', en: 'cancel' },
  'modal.trip.create.button': { zh: '创建', en: 'create' },
  'modal.trip.save.button': { zh: '保存', en: 'save' },
  'modal.trip.delete.button': { zh: '删除', en: 'delete' },
};

function formatVars(input: string, vars?: Record<string, string | number>): string {
  if (!vars) return input;
  return input.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ''));
}

export function t(key: string, vars?: Record<string, string | number>, locale?: 'zh' | 'en'): string {
  const lang = locale || currentLocale;
  const entry = dict[key];
  if (!entry) return key;
  const raw = entry[lang] ?? entry.en ?? key;
  return formatVars(raw, vars);
}
