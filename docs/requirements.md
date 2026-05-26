# LaC.Roadmap 功能文档

> 旅行路线规划与记录插件 — Life as Code 体系的旅行模块。
>
> 本文档既是功能规格说明，也是开发实现的唯一参考。标注 ✅ 的为已实现，⬜ 的为待实现。

---

## 0. 设计哲学

### 0.1 数据即文件

所有数据都是 **TOML + Wikilink 格式的 Markdown 文件**，存储在 Obsidian Vault 中。不依赖数据库、不引入私有二进制格式。用户可以直接用文本编辑器阅读和修改数据，也可以用 Obsidian 的图谱、反向链接、搜索等原生能力浏览数据关系。

### 0.2 为什么是 TOML

TOML 的 array-of-tables 语法 `[[...]]` 与 Obsidian 的 wikilink `[[...]]` 形式一致。这使得数据文件天然同时服务两个身份：

- 对 **Obsidian**：`[[伏见稻荷]]` 是 wikilink，出现在图谱中，支持反向链接和点击跳转
- 对 **插件**：它是有序的地点引用，中间可自然穿插 `route = {...}` 等行内元数据
- 对 **人眼**：整个文件像一份简洁的行程清单，可直接阅读和手动编辑

YAML 的 frontmatter 被 `---` 围住且仅限文件顶部，无法与 wikilink 混排；JSON 过于冗长且 wikilink 被包在字符串里无法被 Obsidian 识别；Obsidian Properties 是扁平 kv，无法表达有序混合序列。TOML 是唯一一个语法能与 Obsidian wikilink 无缝融合的格式。

### 0.3 递归结构

地点本身也可以是路线入口（如"银座"既是"日本之行"的一个地点，又包含"银座药局""银座奶茶"等子地点）。这种递归结构让数据组织自然匹配现实世界的层级关系：一次旅行包含多个城市，一个城市包含多个景区，一个景区包含多个具体去处。

### 0.4 规划 → 记录的完整生命周期

从"未计划"（愿望清单）→"第N天"（粗略规划）→ 具体日期（精确行程）→ 已完成（旅行记录），一条路线在同一套数据结构中自然演进，无需迁移格式。

---

## 1. 数据格式规格

### 1.1 文件层级

```
roadmap.md          ← 根入口 (RoadmapSet)
├── [[日本之行]]     ← 路线 (Roadmap)
│   ├── [[银座]]     ← 地点 (Place)，同时也可以是子路线
│   │   ├── [[银座药局]]
│   │   └── [[银座奶茶]]
│   ├── [[秋叶原]]
│   └── [[随机]]
├── [[未计划周末]]   ← 无日期路线（愿望清单）
└── [[京都奈良两日]]
```

### 1.2 根文件 (RoadmapSet)

```toml
type = "root"
renders = ["roadmapset"]

[[日本之行]]
[[未计划周末]]
[[京都奈良两日]]
```

- `type = "root"` + `renders` 含 `"roadmapset"` 标识此文件为路线集合入口
- `[[...]]` 引用列表定义集合内的路线及其顺序

### 1.3 路线文件 (Roadmap)

```toml
name = "京都奈良两日"

[detail]
description = "京都伏见稻荷 + 奈良公园东大寺两日游"
start_time = "2025-11-01"
end_time = "2025-11-02"
map_provider = "google"

[detail.address]
name = "关西"

[[京都站]]
[[伏见稻荷]]
route = { travelMode = "transit", distance = 4800, duration = 18, tolls = 0 }
[[东大寺]]
route = { travelMode = "walk", distance = 34465, duration = 482, tolls = 0 }
[[奈良公园]]
route = { travelMode = "transit", distance = 42000, duration = 55, tolls = 0 }
```

**字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 路线名称 |
| `detail.description` | 否 | 路线描述 |
| `detail.start_time` | 否 | 开始日期，格式 `YYYY-MM-DD` |
| `detail.end_time` | 否 | 结束日期，格式 `YYYY-MM-DD` |
| `detail.address` | 否 | 路线的总体地址/地区信息 |
| `detail.map_provider` | 否 | 该路线专用的地图提供商（`"google"` 或 `"gaode"`），覆盖全局设置。用于国内路线指定高德、海外路线指定 Google |

**地点引用与路线段：**

- `[[地点名]]` 按出现顺序定义行程
- `route = { travelMode, distance, duration, tolls }` 紧随在 `[[地点A]]` 之后，表示**从地点A到下一个地点**的交通信息
- 可在 `[[地点]]` 后紧随 `start_time = "..."` / `end_time = "..."` 行覆盖地点自身的时间（用于同一地点在不同路线中安排到不同日期）

### 1.4 地点文件 (Place)

```toml
name = "伏见稻荷"

[detail]
start_time = "2025-11-01 10:00:00"
end_time = "2025-11-01 12:30:00"
description = "伏见稻荷大社、千本鸟居"

[detail.address]
name = "伏见稻荷大社"
longitude = 135.7727
latitude = 34.9671
coordinate_system = "WGS84"
```

**字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 地点名称 |
| `detail.start_time` | 否 | 到达时间，格式 `YYYY-MM-DD HH:mm:ss` |
| `detail.end_time` | 否 | 离开时间，格式 `YYYY-MM-DD HH:mm:ss` |
| `detail.description` | 否 | 地点描述 |
| `detail.address.name` | 否 | 地址名称（显示用） |
| `detail.address.longitude` | 否 | 经度 |
| `detail.address.latitude` | 否 | 纬度 |
| `detail.address.coordinate_system` | 否 | 坐标体系：`WGS84`（GPS/Google）或 `GCJ-02`（高德/国测局），默认 `WGS84` |
| `detail.days` | 否 | 无 `start_time` 时表示属于第几天，用于粗略分组 |

**递归：** 地点文件可以同时包含 `type = "root"` 和 `renders = ["roadmap"]`，并通过 `[[子地点]]` 引用子级地点，形成嵌套路线。

### 1.5 路线段 (RouteSegment)

```toml
route = { travelMode = "transit", distance = 5000, duration = 33, tolls = 24 }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `travelMode` | string | `walk` / `bicycle` / `two_wheeler` / `drive` / `transit` |
| `distance` | number | 距离（米） |
| `duration` | number | 用时（分钟） |
| `tolls` | number | 费用（元） |

### 1.6 时间格式约定

- 日期：`YYYY-MM-DD`（如 `2025-11-01`）
- 日期时间：`YYYY-MM-DD HH:mm:ss`（如 `2025-11-01 10:00:00`）
- 仅日期的 `start_time` / `end_time` 用于路线级别的日期范围
- 带时间的用于地点级别的具体到达/离开时刻

---

## 2. 设计规范

### 2.1 主题色

| 用途 | 色值 | CSS 变量 |
|------|------|----------|
| 背景色 | `#101820` | `$lac-bg` |
| 已开始/已结束 | `#b3995d` | `$lac-done` |
| 未开始（已规划） | `#d3bc8d` | `$lac-todo` |
| 未安排 | `#FF8200` | `$lac-na` |
| 卡片背景 | `#4b4b4b` | `$lac-card` |
| 警告色 | `#aa0000` | `$lac-danger` |
| 纯白 | `#ffffff` | `$lac-text` |

### 2.2 状态三态

所有路线和地点都有三种时间状态，用主题色区分：

| 状态 | 判定条件 | 颜色 |
|------|----------|------|
| **已完成** (done) | `start_time` 或 `end_time` 早于当前时间 | `#b3995d` |
| **已规划** (todo) | 有日期但尚未开始 | `#d3bc8d` |
| **未安排** (na) | 无 `start_time` 也无 `end_time` | `#FF8200` |

### 2.3 地图与双提供商

- 顶部聚合地图：宽高比 3:2，展示所有/筛选后的地点标记
- 卡片右侧缩略图：1:1，使用静态地图 API

**双提供商是核心设计，不是可选项。** 插件服务于一个在中国生活、同时去海外旅行的用户。单一地图提供商无法覆盖这两个世界：

- **高德**：国内 POI 精准、地址搜索好用、不用翻墙、符合国测局 GCJ-02 坐标规范 — 但出了中国基本不可用
- **Google**：全球覆盖、海外旅行的唯一选择 — 但在中国大陆被墙，且不了解国内 POI

因此 `map_provider` 字段设计在**路线级别**而非仅全局设置 — "成都美食两日"用高德，"京都奈良两日"用 Google。同一个 Vault、同一套插件，路线之间无缝切换。坐标体系自动转换（WGS84 ↔ GCJ-02）也是为此服务的基础设施。

---

## 3. 页面功能

### 3.1 RoadmapSet 页面（路线集合）

**布局：** 顶部聚合地图 → 路线卡片列表 → 底部新增按钮

#### 3.1.1 顶部聚合地图

- ✅ 聚合所有路线的所有地点坐标，在交互式地图上打点
- ✅ 自动适配视野（fitBounds）使所有点可见
- ✅ 根据地图提供商自动转换坐标体系

#### 3.1.2 路线卡片列表

每张卡片展示：

- ✅ **路线名称**：带状态色
- ✅ **路线描述**：名称后显示
- ✅ **日期范围**：`start_time ~ end_time`
- ✅ **日历热力条** (CardCalendar)：SVG 热力图，按地点的日期统计每日密度，颜色从绿(少)→黄→红(多)渐变；灰色表示路线日期范围内但无地点的天；透明黑表示范围外
- ✅ **静态地图缩略图**：卡片右侧，展示该路线所有地点的聚合静态地图

#### 3.1.3 卡片排序规则

- ✅ **未安排在上，已安排在下**
- ✅ 未安排区：按根文件中的文本顺序倒序
- ✅ 已安排区：按时间倒序；同时间按文本顺序倒序

#### 3.1.4 交互

- ✅ **点击** 卡片 → 在新 tab 中打开该路线的 Roadmap 页面
- ✅ **右键/长按** 卡片 → 上下文菜单：
  - ✅ **删除**：从集合中移除（确认弹窗）
  - ✅ **复制**：复制路线及其所有地点引用，命名为"原名 副本"，打开复制后的路线
- ✅ **拖拽排序**（仅未安排区）：拖拽后写回根文件 `[[...]]` 顺序
- ✅ **底部「+」按钮**：弹出输入框输入路线名称，创建新路线文件并加入集合

### 3.2 Roadmap 页面（单条路线）

**布局：** 顶部聚合地图 → 标题栏 → 标签栏 → 地点卡片列表 → 底部新增按钮

#### 3.2.1 顶部聚合地图

- ✅ 仅显示当前路线的地点（非全集合）
- ✅ 随标签筛选联动：只显示选中标签对应的地点
- ✅ 使用编号标记（数字标记），按路线地点顺序
- ✅ 支持路线级 `map_provider` 覆盖全局设置

#### 3.2.2 标题栏

- ✅ 显示路线名称和描述
- ✅ 点击标题栏 → 弹出编辑弹窗，可修改路线名称和描述

#### 3.2.3 标签栏 (Tabs)

标签栏用于按日期/天数分组筛选地点：

- ✅ **自动分组**：有 `start_time` 的地点按日期分组（`YYYY-MM-DD`），无日期的按 `第N天` 分组
- ✅ **多选筛选**：点击标签切换选中状态，列表和地图联动只显示选中标签的地点；全选或全不选等价于显示全部
- ✅ **"未计划"标签**：显示无日期的地点分组
- ✅ **左侧「‹」返回按钮**：返回 RoadmapSet 页面
- ✅ **右侧「+」按钮**：添加一个空的天数标签（临时占位，用户可拖地点到此标签）
- ✅ **拖拽到标签**：将地点卡片拖拽到日期标签上，自动修改该地点的日期（保留时间部分）并移动到该日末尾
- ⬜ **标签横向滚动**：标签过多时横向滚动而非换行
- ⬜ **长按标签拖拽排序**：改变日期/天数标签的显示顺序

#### 3.2.4 地点卡片列表

每张卡片展示：

- ✅ **地点名称**：带状态色
- ✅ **地点描述**
- ✅ **时间范围**：格式化显示，同日期的结束时间省略日期部分
- ✅ **路线段距离**：若上一地点存在路线段，在日期旁显示距离（≥1km 显示为 km，否则显示 m）
- ✅ **静态地图缩略图**：卡片右侧，显示当前地点和上一地点的位置及连线

#### 3.2.5 地点卡片交互

- ✅ **点击** → 打开 PlaceEditModal 编辑地点
- ✅ **拖拽排序** (Sortable.js)：拖拽地点卡片上下排序
  - ✅ 松手后自动更新文件中的地点顺序
  - ✅ 若被拖拽地点有时间，自动继承上一个有时间地点的日期
  - ✅ 拖拽后自动重新计算受影响的路线段距离（调用地图 API）

#### 3.2.6 新增地点

- ✅ **底部「+」按钮**：打开 PlaceEditModal
  - 若当前选中了日期标签，自动预填最晚日期
  - 若选中"未计划"标签，不预填日期
- ✅ 新增地点按时间正序插入到正确位置

#### 3.2.7 编辑/删除地点

- ✅ **PlaceEditModal**：编辑名称、描述、开始/结束时间、地址
  - ✅ 日期选择器 (DatePicker) + 时间选择器 (TimePicker)
  - ✅ 地址输入 (AddressInput)：点击打开地图选择器
  - ✅ 地图选择器 (MapSelector)：交互式地图选点、搜索地址、可切换地图提供商
  - ✅ 名称校验：不能为空
  - ✅ 时间校验：格式验证、开始时间不能晚于结束时间
- ✅ **删除按钮**：编辑弹窗中可删除地点（确认弹窗）

### 3.3 嵌套路线（递归）

- ✅ 地点文件可同时作为子路线入口（`type = "root"`, `renders = ["roadmap"]`）
- ✅ 点击子路线地点时检测 `renders = ["roadmap"]`，若是则导航进入子路线页面
- ✅ `goBack()` 通过反向链接找到父路线逐级返回，找不到时回退到根入口
- ✅ 子地点同样支持所有 Roadmap 页面功能

---

## 4. 地图系统

### 4.1 双提供商架构

```
IMapProvider (接口)
├── GoogleMapProvider  ← Google Maps JavaScript API (WGS84 坐标系)
└── AmapProvider       ← 高德 JS API (GCJ-02 坐标系)
```

双提供商是插件的核心设计之一。全局设置定义默认提供商，路线级 `map_provider` 字段可逐条覆盖，使国内路线用高德、海外路线用 Google 在同一 Vault 中自然共存。

- ✅ 全局设置 + 路线级覆盖
- ✅ 坐标体系自动转换：`CoordinateConverter` 提供 `wgs84ToGcj02` / `gcj02ToWgs84` 互转
- ✅ 地点文件中 `coordinate_system` 字段记录坐标原始体系，渲染时按目标提供商自动转换
- ✅ 静态地图、交互式地图、路径规划 API 均按当前提供商选择正确的 API 端点和坐标系

### 4.2 地图组件

| 组件 | 用途 | 页面 |
|------|------|------|
| **AggregatedMap** | 交互式聚合地图，多标记点 + 自动适配视野 | 两个页面的顶部 |
| **StaticMap** | 路线卡片右侧静态缩略图（所有地点聚合） | RoadmapSet |
| **PlaceStaticMap** | 地点卡片右侧静态缩略图（当前点+上一点+连线） | Roadmap |
| **MapSelector** | 弹窗内交互式地图选点 | PlaceEditModal |
| **AddressInput** | 地址搜索输入框 | PlaceEditModal |

### 4.3 路线计算服务 (RouteCalculationService)

- ✅ 支持 Google Directions API 和高德路径规划 API
- ✅ 计算两地点间的距离、用时
- ✅ 支持所有交通方式：步行、骑行、驾车、公交
- ✅ 拖拽排序后自动重新计算受影响的路线段

### 4.4 API Key 配置

| 设置项 | 用途 |
|--------|------|
| `gaodeJsApiKey` | 高德 Web 端 (JS API) Key，用于交互式地图展示 |
| `gaodeWebServiceKey` | 高德 Web 服务 Key，用于搜索/静态图/路径规划/坐标转换 |
| `googleMapsApiKey` | Google Maps API Key，用于地图、搜索、静态图、路径规划 |

---

## 5. 设置

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| 语言 | auto | `auto` / `zh-CN` / `en` |
| 入口文件 | `LaC/Roadmap/roadmap.md` | 路线集合根文件路径 |
| 右键菜单 | 启用 | 文件右键显示"用 LaC.Roadmap 打开" |
| 地图提供商 | none | `none` / `gaode` / `google` |
| 高德 JS API Key | - | 交互式地图 |
| 高德 Web 服务 Key | - | 搜索、静态图、路径规划 |
| Google Maps API Key | - | 全功能 |

---

## 6. 排序与拖拽规则

### 6.1 RoadmapSet 卡片排序

1. 未安排（无 start_time 和 end_time）在上，已安排在下
2. 未安排区：按根文件中 `[[...]]` 的文本顺序倒序
3. 已安排区：按 start_time 降序（最近的在前）；同时间按文本顺序倒序
4. 仅未安排的卡片可拖拽，松手后写回根文件顺序

### 6.2 Roadmap 地点排序

1. 按文件中 `[[...]]` 的出现顺序（即文本正序）
2. 同一分组内按 start_time 升序
3. 拖拽排序后自动处理：
   - 修改文件中的 items 顺序
   - 若被拖地点有时间，继承上一个有时间地点的日期
   - 若无上一个有时间地点，检查是否晚于下一个有时间地点，是则改为下一个的时间
   - 重新计算受影响的路线段距离

### 6.3 days 字段

- 用于无 `start_time` 的地点，表示属于第几天
- 存于地点文件的 `[detail]` 中
- 编辑器不直接展示此字段，可自动推断
- 拖拽地点到"第N天"标签时，修改 days 字段并清除 start_time/end_time

---

## 7. 待实现功能

### 7.1 P0 — 核心体验

#### 7.1.1 ✅ 路线段完整展示 (RouteBadge)

已实现。RouteBadge 作为"连接条"展示在两张地点卡片之间，显示交通方式（中文）、距离（km/m）、用时（h+min）、费用。通过 `data-no-drag` 和 `pointer-events: none` 避免干扰 Sortable.js 拖拽。

#### 7.1.2 ✅ 路线段编辑

已实现（Wave 2 + Wave 4）：

- 点击地点之间的 RouteBadge → 弹出 `RouteSegmentEditModal`
- 可手动修改交通方式、距离、用时、费用，也可点击"自动计算"按钮调用 `RouteCalculationService`
- 新增地点或拖拽重排时若两端均有坐标，自动插入路线段并计算

#### 7.1.3 ✅ 新增路线弹窗增强

已实现（Wave 2）。新增路线使用与 `PlaceEditModal` 风格一致的 `RoadmapEditModal`，包含路线名称、描述、开始/结束日期、地址/地区、地图提供商选择字段。

### 7.2 P1 — 交互优化

#### 7.2.1 ✅ 标签栏横向滚动

已实现（Wave 3）。DateTabs 容器改为 `overflow-x: auto; flex-wrap: nowrap`，标签过多时横向滚动不换行。

#### 7.2.2 ⬜ 长按标签拖拽排序

未实现。保留原因：持久化"日的顺序"需要新增字段（影响数据格式），优先级低于其他 P0/P2 项；后续 Wave 再评估。

#### 7.2.3 ✅ 路线编辑弹窗增强

已实现（Wave 2）。`RoadmapEditModal` 支持编辑名称、描述、开始/结束日期、地址/地区、`map_provider` 字段。

### 7.3 P2 — 功能扩展

#### 7.3.1 ✅ 地点复用

已实现（Wave 4）。`RoadmapRepository.updatePlaceGeneric` 只写入地点文件的通用字段（name / description / address），同时保留 `type` / `renders` 等原有顶层字段；`updatePlaceScheduleInRoadmap` 将 start_time / end_time 以"wikilink 后紧随的时间覆盖行"方式写回当前路线文件，保证同一地点在不同路线中拥有独立的行程时间。

#### 7.3.2 ❎ 导出行程（已移除）

Wave 4 + Wave 5 曾实现过 plain / ICS / Markdown / GPX 四种导出格式，Wave 8 整体移除（UI、service、i18n、SCSS、单元/集成测试全部清理）。原因：数据已经是 TOML + Markdown，可直接被 Obsidian 自身工作流（笔记复制、模板、Dataview 等）消费，独立的导出格式收益不足以抵销维护成本。如未来重新引入，需先证明日历/GPS 用户旅程的真实需求。

#### 7.3.3 ✅ 行程统计

已实现（Wave 4）。`components/RoadmapStats.tsx` 汇总总天数、总地点数、总距离、总用时、总费用，显示在 Roadmap 页面。

#### 7.3.4 ✅ 地图路线连线

已实现（Wave 4 + Wave 5）。`IMapProvider` 的 `drawPolylines` / `clearPolylines` 在 Google 与 Amap 两侧对等实现；`AggregatedMap` 按地点顺序在 provider 坐标系下绘制折线，折线 zIndex 低于 marker。
- 步行 / 骑行 = 虚线，其余 = 实线
- Wave 5：折线颜色按交通方式区分（步行绿 / 骑行青 / 摩托橙 / 驾车蓝 / 公交紫），地图左下角显示 legend，仅展示当前路线实际用到的方式

---

## 8. 已知问题（团队审查发现）

### 8.1 Critical — 数据解析

| # | 问题 | 状态 |
|---|------|------|
| 1 | ~~`extractTomlHeader` 遇空行即停止，导致 `[detail]` section 被截断丢失~~ | ✅ 已修复：仅 `[[...]]` 行终止 header |
| 2 | ~~`quoteWikilinksForToml` 对含别名或引号的 wikilink 产生非法 TOML~~ | ✅ 已修复：改用 `extractTomlHeader` 直接提取 TOML 部分，不再做 wikilink 转义 |

### 8.2 Major — 逻辑缺陷

| # | 问题 | 状态 |
|---|------|------|
| 1 | ~~点击子路线地点一律打开编辑弹窗，未导航进入子路线~~ | ✅ 已修复：检测 `isSubRoadmapEntry` 后导航 |
| 2 | ~~`goBack()` 硬编码返回根入口~~ | ✅ 已修复：通过反向链接逐级返回 |
| 3 | `日本之行.md` 中 `[[秋叶原]]` 重复两次导致 UI 显示重复地点 | ⬜ 数据文件待清理（用户 Vault 内容，不在代码修复范围） |
| 4 | `onDropToTab` 拖到临时标签时 insertAt 可能计算为 0（错误插入到列表头部） | ✅ 已修复（Wave 3，`usePlaceDragDrop` 内重新计算落点） |
| 5 | ~~lookahead 逻辑在 route 行后有空行时跳过合法的 start_time 覆盖行~~ | ✅ 已修复：route 查找改为跳过空行和时间行 |
| 6 | `type`/`renders` 字段在路线文件中无统一标准，部分文件有部分没有 | ⬜ 数据一致性待规范（用户 Vault 内容） |

### 8.3 Major — 代码质量

| # | 问题 | 状态 |
|---|------|------|
| 1 | ~~`roadmap/index.tsx` 1063 行过于臃肿~~ | ✅ 已拆分（Wave 1/3）：`useRoadmapGroups` / `usePlaceDragDrop` / `useTabs` hooks，`PlaceStaticMap` / `StaticMap` / `PlaceCard` 独立组件，当前 `index.tsx` 约 746 行 |
| 2 | ~~22+ 处 `console.log` 调试日志未清理~~ | ✅ 已清理（保留 console.warn/error） |
| 3 | ~~37 处 `as any` 类型断言~~ | ✅ Wave 5 收敛至 0（引入 `ParsedTomlHeader` / `RoadmapDetail` / `Record<string, unknown>` 局部转换） |
| 4 | ~~14 处 `catch (_) {}` 静默吞错~~ | ✅ Wave 5 全部转为 `console.warn` 或 `Notice`，best-effort 清理路径也加日志 |
| 5 | ~~弹窗 class 名混用 `lifeflow-`/`lf-` 前缀~~ | ✅ 已全量统一为 `lac-` 前缀（Wave 3，源码/样式/构建产物均已验证无残留） |
| 6 | ~~日期工具函数在 `CardCalendar.tsx` 和 `roadmapset/index.tsx` 中重复定义~~ | ✅ 已提取到 `utils/date.ts` |
| 7 | ~~AggregatedMap 的 useEffect 依赖 `settings` 对象引用，每次渲染都重建地图~~ | ✅ 已改为依赖具体字段 |

### 8.4 Minor — UX 改进

| # | 问题 | 状态 |
|---|------|------|
| 1 | ~~拖拽视觉反馈不足（仅 opacity 变化）~~ | ✅ 已增强（Wave 3）：ghost 虚线边框 + 拖拽项 box-shadow |
| 2 | ~~PlaceEditModal 字段顺序不符合自然填写习惯~~ | ✅ 已调整为：名称 → 时间 → 地址 → 描述 |
| 3 | ~~路线删除仅移除引用，.md 文件残留~~ | ✅ Wave 5 上下文菜单新增"彻底删除"（双重确认 + `app.fileManager.trashFile`，与"从集合移除"并存） |
| 4 | `addDayOnly` 的 nextKey 在混合日期/"第N天"时不稳定 | ✅ 已修复（Wave 3，`useTabs` 基于 dayIndex 计数） |

---

## 9. 目录结构

```
lac-roadmap/
├── main.ts                      # 插件入口，View 注册，命令与右键菜单
├── types.ts                     # RoadmapSettings, DEFAULT_SETTINGS
├── i18n.ts                      # 国际化（zh / en）
├── types/
│   ├── roadmap.ts               # Roadmap, Place, RouteSegment, Address 等核心类型
│   └── map.ts                   # MapLocation, MapSearchResult, MapSelectorProps
├── repositories/
│   └── RoadmapRepository.ts     # 数据读写层：TOML 解析、文件 CRUD
├── services/
│   └── RouteCalculationService.ts  # 路径规划 API 调用
├── pages/
│   ├── roadmapset/index.tsx     # 路线集合页面
│   └── roadmap/index.tsx        # 单条路线页面
├── components/
│   ├── map/
│   │   ├── AggregatedMap.tsx    # 交互式聚合地图
│   │   ├── MapSelector.tsx      # 地图选择器弹窗
│   │   ├── AddressInput.tsx     # 地址搜索输入框
│   │   ├── GoogleMap.tsx        # Google 地图工具 + 坐标转换
│   │   ├── Amap.tsx             # 高德地图工具
│   │   └── providers/
│   │       ├── IMapProvider.ts          # 地图提供商接口
│   │       ├── MapProviderFactory.ts    # 提供商工厂
│   │       ├── GoogleMapProvider.ts     # Google 实现
│   │       └── AmapProvider.ts          # 高德实现
│   ├── modals/
│   │   ├── PlaceEditModal.tsx   # 地点编辑弹窗
│   │   └── ConfirmModal.ts      # 确认弹窗
│   ├── CardCalendar.tsx         # 日历热力条
│   ├── RouteBadge.tsx           # 路线段标签
│   ├── DatePicker.tsx           # 日期选择器
│   ├── TimePicker.tsx           # 时间选择器
│   ├── DateTabs.tsx             # 日期标签组件（备用）
│   └── settings/
│       └── RoadmapSettingTab.ts # 插件设置面板
├── utils/
│   └── timeValidation.ts       # 时间格式校验工具
├── styles/
│   ├── _variables.scss          # 主题色变量
│   ├── roadmap.scss             # 样式入口
│   ├── _buttons.scss, _modal.scss, _pickers.scss, _map.scss, _utilities.scss
│   ├── components/              # 组件样式
│   └── pages/                   # 页面样式
└── docs/
    ├── draft.md                 # 原始设计草案
    ├── requirements.md          # 本文档
    ├── technical.md             # 技术文档
    └── datetime.md              # 排序与时间规则
```

---

## 9. 数据仓库 API (RoadmapRepository)

| 方法 | 说明 |
|------|------|
| `getRootPath()` | 返回根文件路径 |
| `isValidEntry()` | 检查文件是否为有效的路线集合入口 |
| `loadRoadmapSet()` | 解析根文件中所有 `[[...]]`，返回路线 id 列表 |
| `loadRoadmap(filePath)` | 加载路线文件：解析 TOML 头部 + 遍历 wikilink 加载地点 + 解析 route 行 |
| `createRoadmapFile(folderPath, name, detail?)` | 创建或覆盖路线文件 |
| `addRoadmapToSet(roadmapId)` | 将路线 id 追加到根文件 |
| `updateRootFile(roadmapIds)` | 用新的 id 列表重写根文件 |
| `savePlaceFile(folderPath, place)` | 创建或更新地点文件 |
| `updateRoadmapItems(filePath, name, detail, items)` | 重写路线文件的完整内容（头部 + 地点引用 + route 行） |

**TOML 解析技巧：** `quoteWikilinksForToml()` 将 `[[x]]` 转为 `[["x"]]` 再交给 TOML 解析器，避免被误认为 array-of-tables 语法。wikilink 列表的实际解析通过正则独立完成。
