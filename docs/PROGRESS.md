# LaC.Roadmap 插件迭代进度

生成日期：2026-04-15（Wave 1–4）→ 2026-05-10（Wave 5）→ 2026-05-15（Wave 6–7）
基础版本：v1.0.0 → v1.1.0 → v1.2.0 → v1.3.0 → v1.3.1

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

## Wave 6 — Field Journal redesign 落地（v1.2.0 → v1.3.0）

目标：把 `docs/design/` 里的 Field Journal 设计稿（typography-led / warm-ink palette / 单色金度热力图 / 真正纵向 timeline / 一行 mono 统计）真正落到代码层。

- **Tokens 接入**：`styles/_variables.scss` 复刻 `docs/design/tokens.css`（warm-ink surfaces / parchment text / 三态色 / `--heat-1..5` / radii / shadows），并在 `:root` / `.lac-roadmap-root` / `.lac-roadmapset-root` 三层声明，避免 Obsidian 主题覆盖。
- **Atoms 接入**（`styles/_typography.scss`）：`.lac-stage` / `.lac-mono` / `.lac-serif` / `.lac-eyebrow` / `.lac-dot--{done|plan|wish}`（带 ring shadow） / `.lac-hr` / `.lac-placeholder` / `.lac-stats-line`。
- **统计：5 卡片 → 一行 mono**：`components/RoadmapStats.tsx` 重写为 `lac-stats-line`（数字 var(--text-1) + 单位 var(--text-4)）；trip list 用 `RoadmapSetStats`（status-tinted 计数）。
- **热力图：彩虹 → 单色金度**：`components/CardCalendar.tsx` 改读 `var(--heat-1..5)` / `var(--heat-empty)` / `var(--heat-bg)`，5 阶 alpha 单色金度密度。
- **Day Tabs：浏览器 tab → 三层 mono**：`styles/components/_tabs.scss` + `pages/roadmap/index.tsx` 改成 `DAY n` eyebrow + `MM·DD` mono 主体 + count 三层结构；hairline 底线 + 1.5px gold underline 标 active。Obsidian 主题 button chrome 全 reset。
- **Timeline：列表 → spine + 编号圆**：`styles/pages/_roadmap-page.scss` 用 CSS counters + `::before` pseudo-element 渲染 spine + 编号 bullet（19×19 圆，hairline border，mono 数字），不破坏 DOM 结构 / Sortable.js 选择器。`lac-card-list--timeline` 修饰符开关。
- **RouteBadge / `+ transit` chip**：`components/RouteBadge.tsx` 改成 mono pill（`walk · 4.8 km · 18 min`），travel mode 短标签 `walk/bike/moto/car/train`；`+ transit` dashed 占位用 haversine 直线距离。
- **RoadmapHeader 重做**：back btn (24×24 hairline square + inline SVG chevron) + `trip` eyebrow + status-tinted serif 24px title + mono date range + italic serif desc + stats line + hero `AggregatedMap`，严格按 `RoadmapArtboard` 顺序。
- **PlaceCard 重做**（`pages/roadmap/components/PlaceCard.tsx`）：dayLabel eyebrow + `.lac-dot--*` 状态点 + serif title + mono time + serif italic desc + 56×56 圆角 thumb（替换 100×100 方块），加 ink-tone vignette + 状态色 marker + count chip 拐角悬挂。
- **Roadmapset 对齐 RoadmapSetArtboard**：`pages/roadmapset/index.tsx` 接入 `lac-roadmapset-root` + `LaC · Roadmap` eyebrow + `行程` serif 标题 + `RoadmapSetStats` + hero `AggregatedMap` + `未安排 · wishlist` / `已规划 · planned` section eyebrows + `+ new trip` dashed mono 按钮（替换 floating round +）。
- **Modals Field Journal 化**：`PlaceEditModal` / `RoadmapEditModal` 加 `lac-confirm-eyebrow` + `lac-confirm-title-serif` + `lac-place-section` 字段栈（eyebrow 标 + serif/mono 控件 + 红色 delete / hairline cancel / plan-gold save 三按钮）。新增 `lac-trip-*` 修饰符（路线 modal 特有：when 单行 date→date / where 双 endpoint / provider dropdown）。
- **设计稿沉淀**：`docs/design/`（Field Journal 设计哲学说明 `chat.md` + 4 artboards 的 `artboards.jsx` + 自研 `design-canvas.jsx` 画布 + `tokens.css` 设计变量 + `Roadmap Redesign.html` 外壳 + 40+ 张迭代截图）。

## Wave 7 — 收尾重构（v1.3.0 → v1.3.1）

目标：解决 Wave 6 遗留的 4 项 GAP — 字体未接入、`index.tsx` 1117 行未拆、Export UI 缺失、CSS legacy 残留。约束：保持 Obsidian 插件轻量（无 CDN、无字体打包、无新依赖）。

- **字体：fallback chain 替代 CDN**：`_variables.scss` 的 `--serif/--sans/--mono` 扩到系统已有字型（Source Serif/Cambria/Georgia/CJK serif；Inter/Segoe UI/PingFang；SF Mono/Cascadia/Consolas）。Newsreader/Geist/JetBrains Mono 仍在链首，用户可在 Obsidian 自定义 CSS 里加 Google Fonts `@import` 自动接入；插件本体不打包字体、不发起网络请求。
- **`pages/roadmap/index.tsx` 1117 → 379 行**（−66%）：按 artboard 视觉 section 拆出 4 个组件 + 1 个 hook：
  - `components/RoadmapHeader.tsx`（83）：back btn / eyebrow / title row / desc / stats / hero map（Fragment 输出，外层 wrapper 留在 index.tsx 与 DayTabsStrip 同 box）
  - `components/DayTabsStrip.tsx`（146）：三层 mono day tabs + 长按拖拽排序 + drop targets + `+ day`（长按 state 收回组件内）
  - `components/Timeline.tsx`（166）：spine + Place/Route 交错 + `+ transit` 占位；trip-wide place list 与 dayLabel 计算就近放置
  - `components/RoadmapActions.tsx`（62）：`+ add place` / `+ add trip` dashed 按钮 + `↓ export` 下拉菜单
  - `hooks/usePlaceMutations.ts`（394）：addPlaceFromList / editPlace / deletePlace / onSavePlace / autoInsertRoutesAroundNewPlace / onCreateSubRoadmap 六个 handler 集中（含 PlaceEditModal 与 sub-roadmap modal 的 visible/initial state）
  - `helpers.ts` 加入 `haversineMeters` / `formatStraightLineDistance`（Timeline 用）
  - 新 `index.tsx`：state（5 个）+ 加载 effect + 4 个 hook 编排 + addDayOnly / openMetaEditor / saveMetaEditor / goBack / handlePlaceClick + 6 段 JSX。
- **Export UI 接入**：`RoadmapActions` 新增 `↓ export` 按钮 + 下拉菜单，接 4 个已有 export 函数（plain / markdown / .ics / .gpx）；`_roadmap-page.scss` 加 `.lac-roadmap-export` / `.lac-btn--export` / `.lac-roadmap-export-menu` / `.lac-roadmap-export-item` 样式（向上弹、warm-ink surface、hairline border、mono uppercase items）。
- **CSS legacy 清理**：`.lac-card2` 死代码删除（与 `.lac-card` chrome 完全重复且 0 引用）；`.lac-dot--todo` / `.lac-dot--na` 别名删除（PlaceCard 已直接映射到 `--plan` / `--wish`）；SCSS `$lac-bg` / `$lac-danger` 删除（0 引用）；`--lac-done` / `--lac-todo` CSS-var 别名删除（CardCalendar 已直接读 `--heat-*`）。
- **构建 / 测试**：`npm run build` 通过（tsc + esbuild + SCSS 0 deprecation）；`npm test` 137 / 137 通过。

## 设计哲学合规

1. 数据即文件（TOML + Wikilink）：✅ 所有 `vault.create` / `vault.modify` 入口（`RoadmapRepository` 的 createRoadmapFile / savePlaceFile / updateRoadmapMeta / updatePlaceGeneric / updatePlaceScheduleInRoadmap / updateRoadmapItems / updateRootFile，`main.ts` 的初始化示例）全部通过 `stringifyToml` + 手写 `[[wikilink]]` 行写入，未引入其它格式。
2. 双地图 provider 等价：✅ `GoogleMapProvider` 与 `AmapProvider` 均实现 `IMapProvider` 全集；`drawPolylines` / `clearPolylines` 两侧均支持 solid / dashed 与 zIndex 低于 marker；高德容器事件 `stopPropagation` 蒙层问题已修。
3. `lac-` CSS 前缀：✅ 源码、样式、构建产物 grep 无 `\blf-` / `lifeflow-` 残留。
4. 坐标转换 WGS84 ↔ GCJ-02：✅ `AggregatedMap` 无论是 overrideLocations 还是遍历路线地点，都按目标 provider 统一转换后再传给 `drawPolylines` 与 `displaySearchMarkers`；MapSelector / PlaceStaticMap / StaticMap 路径亦按 provider `convertCoordinates` 处理。
5. 递归结构：✅ `updatePlaceGeneric` 用 `parseToml(oldHeader)` 得到完整对象后再合并字段、`stringifyToml` 整体写回，`type = "root"` / `renders = ["roadmap"]` 等顶层字段不会丢失。

## 关键指标

- `pages/roadmap/index.tsx`: 1102 → 746（Wave 1）→ ~1117（Wave 5–6 redesign 累积）→ **379（Wave 7 拆分）**
- `repositories/RoadmapRepository.ts`: 466 → 525 行（Wave 1–6）
- 组件总数：`RouteBadge`、`RoadmapStats`/`RoadmapSetStats`、`PlaceStaticMap`、`StaticMap`、`RouteSegmentEditModal`、`RoadmapEditModal`、`PlaceCard`、**`RoadmapHeader`、`DayTabsStrip`、`Timeline`、`RoadmapActions`**（Wave 7 新加 4）
- Hooks 总数：`useRoadmapGroups`、`usePlaceDragDrop`、`useTabs`、**`usePlaceMutations`**（Wave 7 新加 1）共 4
- Services：`RouteCalculationService`、`RoadmapExportService`（plain / ICS / Markdown / GPX）
- Map provider：2 个（Google / 高德）+ 通用接口 `IMapProvider`
- **`as any`：35 → 0**（Wave 5；Wave 7 仍 0 — 4 处 Obsidian leaf API workaround 不计）
- **静默 `catch (_)`：12 → 0**（Wave 5）
- **SCSS Dart Sass 3 预警：消除**（Wave 5）
- **死代码清理（Wave 7）**：`.lac-card2` / `.lac-dot--todo` / `.lac-dot--na` / `$lac-bg` / `$lac-danger` / `--lac-done` / `--lac-todo` 已删
- CSS 前缀：统一为 `lac-`，`lf-` / `lifeflow-` 0 处
- 字体策略（Wave 7）：fallback chain 接系统已有字型（Newsreader → Cambria → Georgia → CJK serif；Geist → Inter → Segoe UI；JetBrains Mono → SF Mono → Cascadia → Consolas），**不打包字体、不发起网络请求**
- 测试：137 / 137 通过；`npm run build` tsc 无错、esbuild 无错、SCSS 0 deprecation

## 遗留 TODO

- 长按标签拖拽排序（§7.2.2）：需设计"日顺序"持久化字段，影响数据格式，优先级低；当前临时拖拽仅 session 内有效
- 用户 Vault 数据一致性问题（§8.2.3 / §8.2.6）属于数据治理，不在代码范围（Wave 1 已修当时存在的重复 `[[秋叶原]]`）
- 路径规划失败时的离线 fallback（当前为 Notice 提示，后续可考虑用直线距离作为默认值）

## v1.4.2 — 日期标签直接编辑 + trip 时间派生（2026-05-28）

### Day-tab 直接编辑日期：长按 + 拖拽 + clear

`pages/roadmap/components/DayTabsStrip.tsx` 重写交互层（继续走 PointerEvents，不接入 Sortable.js，因为标签栏本就是按时间排序的纯派生 UI，没有 reorder 语义）。

- **长按 500ms** 触发，未移动 → 释放在原 tab → 弹 `DatePicker`：
  - 日期 tab：picker 预填该日期 → confirm 改组内所有 place 的 `start_time` 日期部分（time-of-day 保留），同步重写 `tempDayKeys`
  - 第N天 tab：picker 无预填 → confirm 一次性把所有 `detail.days = K` 的 place 展开成具体日期（new + (K-N)），清掉 days，规划态切到具体态
  - 未排 tab：picker confirm 给所有 wishlist place 设上 `start_time`
  - **clear 按钮**：日期 tab 清掉组内 `start_time` + `end_time`；第N天 tab 清 `days`；wishlist 化。`tempDayKeys` 里同名 key 一并擦掉
- **长按 + 拖到另一个 tab** → 两组日期/days 互换（不是合并，标签栏本来就按时间排，互换才是用户心智）：
  - date ↔ date：两组 place 的日期部分互换，time-of-day 各自保留
  - 第N天 ↔ 第X天：两组 place 的 days 值互换
  - 任一端是 unplanned / 混合 (date ↔ 第N天)：no-op，留给长按编辑
- 拖拽视效对齐 Sortable.js 卡片：长按触发后 `cloneNode` 出一个 `position: fixed` clone 跟随光标走（drop shadow + scale 1.05 + gold 描边），源 tab 变 ghost (opacity 0.35 + gold tint)，hover 目标 tab 包一圈 1.5px gold inset。8px 位移阈值防止横滑标签栏被劫持成拖拽
- 取消了之前 session-only 的 `reorderTab` / `tabOrderOverride`：标签栏永远按 `compareGroupKey` 排序，无序状态去除

### 日期标签连续填充（无地点日仍占位）

`useTabs.allKeysForTabs` 取出已有 date keys 的 min/max，用 `formatYMD` 一天天补齐中间空缺。空白日 `groups[k]` 是 undefined，下游 `(groups[k] || [])` 全得空数组，count 显示 0，filter / map 不会产任何点。少于 2 个 date key（单日 / 全 第N天 / 全 wishlist）不补齐。

Timeline 的 DAY-N eyebrow 同步改为按"最早 date key 起的 calendar-day 偏移 + 1"算，而不是 sequential 累加 `groupKeys` —— 05-01 / 05-03 / 05-05 这种带空白日的场景，时间轴里现在正确显示 DAY 1 / DAY 3 / DAY 5。

### Trip 编辑器：start_date 顺移 + 移除 end_date

`components/modals/RoadmapEditModal.tsx`：

- 删 `end_time` 状态 / UI / 箭头 / nights 显示。end_date 必然等于末位 place 的日期，没有独立编辑含义
- start_date 从 items 派生（首个有 `start_time` 的 place 的日期），picker 简化为单输入
- `pages/roadmap/index.tsx:saveMetaEditor` 检测 newStart vs oldAnchor（首 place 日期）的 delta：
  - 都有且不等 → 全部有 `start_time` 的 place（含 end_time）顺移 delta 天，time-of-day 保留
  - newStart 有 / oldAnchor 无（全 第N天 规划态）→ 把 `days=N` 展开成 `newStart + (N-1)` 天，清 days
- 落盘走 `updateRoadmapItems`（一次写完 header + items），不再走 `updateRoadmapMeta` 两次写

### Trip-level `detail.start_time` / `end_time` 在 load 时派生

历史 bug：通过长按 tab clear / 拖拽互换 / 长按改日期 这些路径修改 place 日期后，trip 顶部 header 的 daterange 显示不变 —— 因为这些路径只重写 items，trip TOML header 的 `detail.start_time` 还停在旧值，header 读的就是旧值。

修复在 `RoadmapRepository.loadRoadmap`：load 完 items 后，扫一遍所有 dated place 取 min/max 日期，覆盖到 `derivedDetail.start_time` / `end_time`（无 dated place 就 delete）。TOML header 里那两个字段成为 stale cache，每次 load 重新派生，header / roadmapset 排序 / stats 自动一致，下次任何写都把派生值再写回。

### Place 文件不再承载 per-trip 时间字段

历史 bug：clear 中段日期时看着没变化，但末日 clear 正常 —— 因为 load 时 `pData.detail.start_time` 是从 place 文件读的，trip 文件里的覆盖行只是叠在上面；删覆盖，place 文件里的旧值就"复活"。最后一天偶尔正常是因为那个 place 文件恰好没残留。

`RoadmapRepository`：
- `loadRoadmap`：parse 完 place 文件 detail 后，先 `delete detail.start_time / end_time`，再让 trip 覆盖行写入 → trip 文件成了 per-trip 时间的唯一源头
- `placeToToml`：写 place 文件前抹掉 `start_time / end_time / days` 三个 per-trip 字段，新写的 place 文件不会再带这些污染（架构注释一直要求如此，但 save 没强制）

旧测试改：原本"靠 place 文件读 start_time"那条用例改成走 trip override；新增一条 case 锁死 place-file 残留必须被丢弃。

### 顶部 header 微调

`RoadmapHeader.tsx`：返回按钮从 eyebrow-row (TRIP 旁) 搬到 title-row (h1 左)，更近主标识更好点。点击隔离：按钮 `stopPropagation + onBack`，h1 / daterange 自己挂 `onOpenMetaEditor`。CSS 用 `align-self: center` 把方形按钮在 baseline 行里居中，hover/cursor 拆到 h1 + daterange 各自身上。

## v1.4.1 — 移动端长按再拖（2026-05-27）

`pages/roadmap/hooks/usePlaceDragDrop.ts` 与 `pages/roadmapset/index.tsx` 两处 Sortable.js 配置加 `delay: 500` + `delayOnTouchOnly: true` + `touchStartThreshold: 5`。修复：移动端手指一碰卡片就进入拖拽态、整页滚动被吃掉。鼠标侧仍然即触即拖；触摸侧必须长按 500ms 才开始拖拽，长按期间出现 ≥5px 滑动直接放弃拖拽走滚动；短按继续走 onClick 打开编辑。

## Wave 8 — 移除导出 + wishlist 视觉差异 + 同名/拖拽 bug 修（v1.4.0，2026-05-26）

### 移除导出功能

数据已是 TOML + Markdown，Obsidian 自身工作流可直接消费，独立导出格式（plain / Markdown / ICS / GPX）的真实用户旅程没有验证过，维护成本不再划算。

- **UI**：`pages/roadmap/index.tsx` 去掉 `RoadmapExportService` import / `downloadFile` helper / `exportItems` 编排；`RoadmapActions.tsx` 去掉 `exportItems` prop、state、ref、`pointerdown` 收起 effect 和整段下拉菜单 JSX，组件回到只有两枚 dashed `+ add place` / `+ add trip`。
- **Service & 测试**：`services/RoadmapExportService.ts` + `__tests__/services/RoadmapExportService.test.ts` 整文件删除；`__tests__/integration/end_to_end.test.ts` 去掉 export 相关 import 与断言。
- **样式 & i18n**：`_roadmap-page.scss` 删除 4 段 `.lac-roadmap-export*`；`i18n.ts` 删 6 个 export-only key。
- **文档**：`docs/requirements.md` §7.3.2 改为 ❎ 标记；`README.md` / `README.zh-CN.md` 去掉 export 描述与 RoadmapExportService Architecture 提及。

### Wishlist 三态视觉差异（贯穿所有地图面）

`MapLocation` / `PlacePoint` 加 `status?: 'done'|'plan'|'wish'`。`'wish'`（无日期）地点脱离时间轴：**不参与连线、不进入 1/2/3 编号**，单独用 wish 色（`#C77A4A`）圆点呈现。

覆盖 6 处地图面：地点卡片右侧 PlaceStaticMap、PlaceEditModal 缩略图、RoadmapEditModal 缩略图、AggregatedMap (hero)、MapSelector readOnly (hero 展开)、MapSelector picker (PlaceEditModal 选址)。AggregatedMap 与 MapSelector 走"两次 displaySearchMarkers"（planned 走 `'number'` + statuses + polyline；wishlist 走 `'circle'` + wish 色）；PlaceStaticMap 走 SVG 双层圆点 + planned-rank 重新计数（wishlist 不占编号）。PlaceEditModal 的 live 点按表单 `start` 状态实时切换 wish/plan。

### 同名重复地点修复 — 按 itemIndex 写

历史 bug：trip 内同一 `[[name]]` 出现两次时，编辑 wishlist 那条的日期保存会跑到另一条（first-match）。根因是 `updatePlaceScheduleInRoadmap` 按 name 线性查找 + `onSavePlace` 的 nextItems map 也按 name 全替换 + 新 `place.detail` 不带 times → 另一条原有时间被擦掉，新时间写到第一条。

修法：`PlaceEditInitial` 加 `itemIndex`；`editPlace(p, itemIndex?)` 与 `deletePlace(p, itemIndex?)` 透传；`onSavePlace` 非改名分支按 index 替换；`place.detail` 直接携带 start_time/end_time 由 `updateRoadmapItems` inline 落盘（不再走第二次 `updatePlaceScheduleInRoadmap`）。Timeline 既有的 `(place, itemIndex)` 在 `handlePlaceClick` 里接通。增 2 个测试 197 → 199。

### 拖拽自动同步日期判据收紧

历史 bug：用户拖 `6-11 赛里木湖` 到 `6-11 乌鲁木齐` 上方，赛里木湖被改成 `6-10`。根因是旧逻辑"dropped 有 start_time 就取上一张有 start_time 卡片的日期"无条件触发，同日重排被误判为跨日继承。同段代码还调 `savePlaceFile` 把 trip 级时间写进了**共享 place 文件**，污染其他引用同地点的 trip。

修法：自动继承日期只在"前后邻居都指向同一新日期、且与当前日期不同"时触发；仅换 date、保留 time-of-day；去掉 `savePlaceFile` 反向写，per-trip 时间统一由 `updateRoadmapItems` 写 trip 文件。

### Hero MapSelector provider 对齐 trip

历史 bug：roadmap 顶部地图（预览态 AggregatedMap）已通过 `preferredProvider` 走 trip provider（gaode/google），但点击展开的 MapSelector 直接传 raw `settings`，仍是全局 `mapApiProvider`，预览红是高德、点开变 Google。修法：照 `PlaceEditModal:354-360` 既有 pattern 浅拷贝 settings 覆盖 `mapApiProvider` 为 `data.detail.map_provider`。

### i18n 大幅扩面 + 设置/统计 i18n 化 + wishlist 天数计算 + roadmapset 滚动锚 + LazyThumb

由前期 wave 沉淀，与 Wave 8 一起发：`i18n.ts` 把 settings / modals / page strings 全部 zh+en 化（357 行扩张）；`components/settings/RoadmapSettingTab.ts` 完全接入 `t()`；`RoadmapStats` 修 wishlist 桶被错算入天数的问题，统计行接 i18n；`useRoadmapGroups` / `useTabs` / `utils/date` 完善三态分组与排序；`pages/roadmapset/index.tsx` 加跨 mount 滚动锚点记忆（按 trip id + offset，避免 layout 浮动时被钳到偏上）+ LazyThumb（IntersectionObserver 懒挂载 StaticMap）。

### Wave 7 后 BUG 修复

- **roadmapset 卡片点击开新 tab + goBack 历史堆积**：✅ 修复（v1.3.1）。根因是 `main.ts:RoadmapView.setState` 在 in-place 切换 view 时**漏传 `leaf: this.leaf`**——首次 onOpen 传了 leaf，但后续 setState 重新渲染没传，导致 RoadmapSetPage / RoadmapPage 的 `leaf` prop 变 undefined，下次 navigation 落到 `getLeaf(false)` fallback，目标 leaf 不可控（可能落在别的 markdown tab 上），视觉上像"新页面"。修复：(1) `setState` 两处 `React.createElement` 都补 `leaf: this.leaf`；(2) `RoadmapSetPage.openRoadmap` / `handleCopyRoadmap` 抽出 `resolveTargetLeaf()` helper，fallback 链改为 `prop → existing lac-roadmap-view leaf → getLeaf(false)`；(3) `RoadmapPage.handlePlaceClick`（点 sub-roadmap 卡片）应用同样的 fallback 链。
- **顶部 hero map 无法交互**：✅ 兜底实现（v1.3.2）。v1.3.1 的 `pointer-events: auto !important` 防御无效，确认根因是 `.lac-aggmap` 的 `isolation: isolate` + 子级 `filter: saturate brightness hue-rotate` + ::before 的 `mix-blend-mode: overlay` 组合触发 Chromium hit-testing bug——伪元素的 `pointer-events: none` 失效，事件被装饰层吞掉。该 bug 仅影响 hero 上下文（modal 里的 MapSelector 无此组合所以正常）。修复方案：hero 改为 **click-to-expand readOnly viewer**（mirror RoadmapEditModal 的 where-thumb 做法）：`.lac-map-widget` 加 `--clickable` 修饰符（cursor pointer + hover 阴影 + ↗ expand 角落 chip），点击打开 `MapSelector readOnly`，可在 modal 中 pan/zoom 完整地图。两个页面都接通：roadmap 传 `mapLocations`（当前 trip 的可见地点）作为 `routeLocations`；roadmapset 聚合所有 roadmaps 的 geocoded places。

## 后续建议

- AggregatedMap legend 已实现颜色区分；未来可考虑：地图地点 marker 着色按"已完成 / 进行中 / 未开始"三态色
- 持久化"日顺序"字段，开启长按标签拖拽排序（§7.2.2）
- 增加"地点拖拽到地图"创建新地点的快捷流（视用户验证反馈）
