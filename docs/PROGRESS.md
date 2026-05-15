# LaC.Roadmap 插件迭代进度

生成日期：2026-04-15（Wave 1–4）→ 2026-05-10（Wave 5）
基础版本：v1.0.0 → v1.1.0 → v1.2.0

## Wave 1 — 架构与数据

目标：把 1000+ 行的 `pages/roadmap/index.tsx` 拆散，把重复数据逻辑下沉到仓储层，并把共享类型集中管理。

- 新增 `repositories/RoadmapRepository.ts`：承担 TOML header 解析 / 写入、wikilink 顺序解析、路线段 lookahead、地点文件与路线文件 CRUD
- 新增 `types/roadmap.ts`、`types/map.ts`：集中 `Roadmap` / `Place` / `RouteSegment` / `Address` / `MapLocation` 类型
- 新增 `utils/date.ts`（统一日期工具，消除 CardCalendar 与 roadmapset 的重复实现）、`utils/timeValidation.ts`、`utils/typeGuards.ts`
- `pages/roadmap/hooks/`：拆出 `useRoadmapGroups`、`usePlaceDragDrop`、`useTabs`
- `pages/roadmap/components/PlaceCard.tsx` 独立
- 修复 `extractTomlHeader` 空行截断、`quoteWikilinksForToml` 别名/引号 bug；route lookahead 跳过空行与时间行

## Wave 2 — 核心体验

目标：补齐设计文档里的 P0 路线段 / 路线编辑能力，并完成双地图 provider 接口抽象。

- 新增 `components/map/providers/`：`IMapProvider` 接口、`GoogleMapProvider`、`AmapProvider`、`MapProviderFactory`，统一 init / marker / search / fitBounds / convertCoordinates / getCoordinateSystem 等方法
- 新增 `components/RouteBadge.tsx` 作为卡片间连接条（`pointer-events: none` + `data-no-drag` 绕开 Sortable）
- 新增 `components/modals/RouteSegmentEditModal.tsx`：点击 RouteBadge 弹窗修改交通方式 / 距离 / 用时 / 费用，或一键自动计算
- 新增 `components/modals/RoadmapEditModal.tsx`：替换原 `prompt()`，支持名称 / 描述 / 起止日期 / 地址 / map_provider
- `services/RouteCalculationService.ts`：统一 Google Directions / 高德路径规划调用
- `components/map/AggregatedMap.tsx` 与 `StaticMap.tsx`、`PlaceStaticMap.tsx` 接入 provider 抽象；子路线点击走导航，`goBack()` 走反向链接

## Wave 3 — 交互打磨

目标：统一 CSS 前缀、修复拖拽 / 标签零散问题、提升视觉反馈。

- 全量将 `lf-` / `lifeflow-` 前缀重命名为 `lac-`（源码 + SCSS + 构建产物清洁）
- `styles/` 目录重构：`_variables.scss` 集中主题色；`_buttons / _modal / _pickers / _map / _utilities.scss` 通用样式；`styles/components/*`、`styles/pages/*` 按组件拆分
- DateTabs 横向滚动（`overflow-x: auto; flex-wrap: nowrap`）
- Sortable 拖拽视觉：ghost 虚线边框 + 拖拽项 box-shadow
- `useTabs` 的 `addDayOnly` / nextKey 基于 dayIndex 计数而非字符串匹配
- `onDropToTab` 插入位置修正（避免落到列表头部）
- 清理 console.log 调试语句，保留 warn / error
- AggregatedMap 的 useEffect 依赖按具体字段而非 settings 对象引用

## Wave 4 — 功能扩展

目标：完成 P2 全部功能（统计 / 导出 / 地点复用 / 路径连线）。

- `components/RoadmapStats.tsx`：汇总总天数 / 地点数 / 距离 / 用时 / 费用
- `services/RoadmapExportService.ts`：纯文本行程单 + ICS 日历导出
- `RoadmapRepository.updatePlaceGeneric`：只写通用字段（name / description / address），保留 parsed 对象顶层（含 `type` / `renders`），因此"地点同时作为子路线入口"的递归结构在编辑保存后不丢失
- `RoadmapRepository.updatePlaceScheduleInRoadmap`：把 start_time / end_time 作为"wikilink 后紧随的时间覆盖行"写回路线文件，实现"同一地点文件在不同路线中拥有独立行程时间"
- `IMapProvider.drawPolylines / clearPolylines`：Google 与 Amap 对等实现；`AggregatedMap` 在 provider 坐标系下按顺序绘制折线，步行 / 骑行为虚线、其余为实线，zIndex 低于 marker

## Wave 5 — 打磨收尾（v1.1.0 → v1.2.0）

目标：清理上一波遗留的技术债（as any / 静默 catch / 过期 SCSS API），并补齐 PROGRESS.md 列出的"建议下一波"功能（GPX/Markdown 导出、polyline 颜色 + legend、彻底删除路线）。

- **as any 收敛 35 → 0**
  - 引入 `ParsedTomlHeader` 类型 + `normalizeRenders` helper，TOML 头部访问全部类型化
  - `RoadmapSettingTab.mapApiProvider` 选择从字符串收敛到 `'none' | 'google' | 'gaode'`
  - `nextDetail` 显式标注 `RoadmapDetail`，`delete` 直接生效
  - `(window as any).AMap` → `window.AMap`（`shims.d.ts` 已声明），`window.google!.maps as any` → 直接调用
  - JSONP 风格的 `(window as any)[callbackName]` 收敛为 `Record<string, unknown>` 局部转换，全局 `as any` 0 处
- **静默 catch 12 → 0**：所有 `catch (_) {}` / `catch (_) { /* ignore */ }` 改为 `console.warn` 或 `Notice` + `console.warn`，best-effort 清理路径（polyline/ResizeObserver 的 disconnect/remove）也加上日志，确保问题不再隐形
- **SCSS 迁移**：`@use "sass:color"` + `color.adjust($color, $lightness: 5%)` 替代 12 处 `lighten()`；`color.mix()` 替代 6 处全局 `mix()`；Dart Sass 3 deprecation 预警全部消除
- **彻底删除路线**：`pages/roadmapset` 上下文菜单新增"彻底删除"项（双重确认 + `app.fileManager.trashFile`），区别于"从集合移除"；CSS 加 `lac-context-item-danger` 警示样式
- **导出格式扩展**：`RoadmapExportService` 新增 `exportMarkdown`（H1/H2/列表 + 统计表格，可贴回 Obsidian）与 `exportGpx`（GPX 1.1 标准 wpt + trk/trkseg，GCJ-02 自动转 WGS84）；UI 加"复制 Markdown"和"下载 GPX"两个按钮
- **polyline 着色 + 图例**：`AggregatedMap` 按 `travelMode` 分配颜色（步行绿/骑行青/摩托橙/驾车蓝/公交紫），左下浮层 legend 仅显示当前路线实际用到的方式；solid/dashed 视觉区分仍由 `styleForTravelMode` 决定

## 设计哲学合规

1. 数据即文件（TOML + Wikilink）：✅ 所有 `vault.create` / `vault.modify` 入口（`RoadmapRepository` 的 createRoadmapFile / savePlaceFile / updateRoadmapMeta / updatePlaceGeneric / updatePlaceScheduleInRoadmap / updateRoadmapItems / updateRootFile，`main.ts` 的初始化示例）全部通过 `stringifyToml` + 手写 `[[wikilink]]` 行写入，未引入其它格式。
2. 双地图 provider 等价：✅ `GoogleMapProvider` 与 `AmapProvider` 均实现 `IMapProvider` 全集；`drawPolylines` / `clearPolylines` 两侧均支持 solid / dashed 与 zIndex 低于 marker；高德容器事件 `stopPropagation` 蒙层问题已修。
3. `lac-` CSS 前缀：✅ 源码、样式、构建产物 grep 无 `\blf-` / `lifeflow-` 残留。
4. 坐标转换 WGS84 ↔ GCJ-02：✅ `AggregatedMap` 无论是 overrideLocations 还是遍历路线地点，都按目标 provider 统一转换后再传给 `drawPolylines` 与 `displaySearchMarkers`；MapSelector / PlaceStaticMap / StaticMap 路径亦按 provider `convertCoordinates` 处理。
5. 递归结构：✅ `updatePlaceGeneric` 用 `parseToml(oldHeader)` 得到完整对象后再合并字段、`stringifyToml` 整体写回，`type = "root"` / `renders = ["roadmap"]` 等顶层字段不会丢失。

## 关键指标

- `pages/roadmap/index.tsx`: 1102 → 746 行（Wave 1）→ Wave 5 微增（+ Markdown/GPX 导出钩子）
- `repositories/RoadmapRepository.ts`: 466 行（新建，Wave 1–4）
- 新增组件：`RouteBadge`、`RoadmapStats`、`PlaceStaticMap`、`StaticMap`、`RouteSegmentEditModal`、`RoadmapEditModal`、`PlaceCard` 等 7+
- 新增 hooks：`useRoadmapGroups`、`usePlaceDragDrop`、`useTabs` 共 3 个
- 新增 services：`RouteCalculationService`、`RoadmapExportService`（plain text / ICS / Markdown / GPX）
- Map provider：2 个（Google / 高德）+ 通用接口 `IMapProvider`
- **`as any`：35 → 0**（Wave 5）
- **静默 `catch (_)`：12 → 0**（Wave 5）
- **SCSS Dart Sass 3 预警：消除**（Wave 5）
- CSS 前缀：统一为 `lac-`，`lf-` / `lifeflow-` 0 处
- 最终 `npm run build`：tsc 无错、esbuild 无错、SCSS 编译无 deprecation 预警

## 遗留 TODO

- 长按标签拖拽排序（§7.2.2）：需设计"日顺序"持久化字段，影响数据格式，优先级低；当前临时拖拽仅 session 内有效
- 用户 Vault 数据一致性问题（§8.2.3 / §8.2.6）属于数据治理，不在代码范围（Wave 1 已修当时存在的重复 `[[秋叶原]]`）
- 路径规划失败时的离线 fallback（当前为 Notice 提示，后续可考虑用直线距离作为默认值）

## 后续建议

- AggregatedMap legend 已实现颜色区分；未来可考虑：地图地点 marker 着色按"已完成 / 进行中 / 未开始"三态色
- 持久化"日顺序"字段，开启长按标签拖拽排序（§7.2.2）
- 增加"地点拖拽到地图"创建新地点的快捷流（视用户验证反馈）
