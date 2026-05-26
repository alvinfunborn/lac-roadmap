# LaC.Roadmap 插件

[English](README.md) | 简体中文

Life as Code - Roadmap 是一个 Obsidian 旅行路线规划 / 记录插件。行程以 TOML 形式存放在 Markdown 中——不依赖数据库、不引入私有格式、文件本身就完全可读可改。视图把这些 TOML 渲染为田野日志风格的纵向时间线，配地图、按日分组、路线段、热力图。

![image](docs/demo.png)

## 功能特性

### 🎯 核心功能
- **行程列表 + 行程详情双视图**：roadmapset（集合）页用状态点 + mono 统计行 + 卡片展示所有行程；点击任一行程进入纵向 Field Journal 风格时间线
- **按日分组**：地点按日期自动分组，安静的 `DAY n / 11·01 / count` 三层 mono 标签栏；多选标签筛选时间线
- **路线段编辑**：两个地点之间的 `+ transit` 药丸点击弹窗编辑交通方式（步行 / 骑行 / 摩托 / 驾车 / 公交）/ 距离 / 用时 / 费用，并提供"自动计算"按钮调用 Google Directions 或高德路径规划
- **日历热力图**：每条行程一条单色金度密度条带，可视化行程在时间轴上的分布
- **聚合地图**：每页顶部 hero 地图；点击展开为可平移缩放的只读地图查看器
- **递归结构**：地点文件可同时是子路线入口（`type = "root"`, `renders = ["roadmap"]`），允许"行程套行程"
- **地点复用**：同一地点文件可被多条路线引用，通用字段（name / description / address）写入地点文件，每条路线的专属时间作为覆盖行写入路线文件
- **拖拽**：日内排序、跨标签拖拽改日、自动重算受影响的路线段

### 🗺️ 双地图提供商
- **Google 地图**用于海外行程（WGS84 坐标系）
- **高德地图**用于国内行程（GCJ-02 坐标系）
- 路线级 `map_provider` 字段覆盖全局默认——同一 Vault 中两种 provider 无缝共存
- 坐标系按当前 provider 自动转换（WGS84 ↔ GCJ-02）

### 📊 数据格式

所有数据都是 Markdown 文件顶部的 TOML，使用 `[[Wikilink]]` 表达关系。插件只重写它"拥有"的字段，保留开头注释。

**路线集合根文件 (`roadmap.md`):**
```toml
type = "root"
renders = ["roadmapset"]

[[东京之旅]]
[[京都奈良两日]]
```

**路线文件 (`东京之旅.md`):**
```toml
name = "东京之旅"

[detail]
description = "秋叶原 + 浅草"
start_time = "2025-11-01"
end_time = "2025-11-02"
map_provider = "google"

[[秋叶原]]
travelMode = "transit"
distance = 4800
duration = 1080
tolls = 240

[[浅草寺]]
```

两个 `[[wikilink]]` 之间的字段描述这两个地点之间的路线段。`travelMode` 决定连线样式（步行 / 骑行虚线、其余实线）与颜色。

**地点文件 (`秋叶原.md`):**
```toml
name = "秋叶原"

[detail]
start_time = "2025-11-01 10:00"
end_time = "2025-11-01 12:30"
description = "电器、动漫、复古游戏"

[detail.address]
name = "秋叶原站"
address = "东京都千代田区外神田 1 丁目"
longitude = 139.7741
latitude = 35.6985
coordinate_system = "WGS84"
```

当地点被多条路线引用时，地点文件本身不再保存 `start_time` / `end_time`，每条路线的专属时间以覆盖行形式写在路线文件中 wikilink 紧后：

```toml
[[秋叶原]]
start_time = "2025-11-01 10:00"
end_time = "2025-11-01 12:30"
```

**子路线作为地点 (`京都奈良 Day 2.md`):**
```toml
type = "root"
renders = ["roadmap"]
name = "京都奈良 Day 2"

[detail]
description = "伏见稻荷 + 祇园"

[[伏见稻荷大社]]
[[祇园]]
```

父路线把该文件当作普通 `[[京都奈良 Day 2]]` 地点引用；点击卡片导航进入嵌套时间线。

### 🔧 插件命令

1. **打开 LaC.Roadmap** — 打开行程列表。若配置的入口文件不存在，插件会自动生成示例集合与示例路线，方便立刻看到 UI。
2. **文件右键菜单** — 任意 Markdown 文件 → "用 LaC.Roadmap 打开"，把该文件作为路线集合入口（需在设置中启用）。

### 📁 文件结构

```
LaC/Roadmap/
├── roadmap.md          # 集合根：列出所有行程
├── 东京之旅.md          # 路线 1
├── 秋叶原.md            # 被东京之旅引用的地点
├── 浅草寺.md
├── 京都奈良两日.md       # 路线 2
├── 京都奈良 Day 2.md    # 子路线，同时也作为地点被引用
├── 伏见稻荷大社.md
└── ...
```

### ⚙️ 设置项

- **Entry File（入口文件）**：路线集合根文件的路径，默认 `LaC/Roadmap/roadmap.md`。
- **Enable Context Menu（启用右键菜单）**：在 Markdown 文件右键菜单中显示"用 LaC.Roadmap 打开"。
- **Always Separate Place Schedule（地点时间分离写入）**：地点添加到路线时，把 `start_time` / `end_time` 作为覆盖行写入路线文件，而非地点文件。默认 `true`——保持地点文件在多条路线之间可复用。
- **Map API Provider（地图提供商）**：`None` / `Google Maps` / `AMap (高德)`。`None` 关闭所有地图小部件，回退到纯文本地址输入。
- **AMap JS API Key（高德 Web 端 Key）**：选用高德时必填，用于交互地图渲染。在 [高德开放平台](https://lbs.amap.com/) 申请"Web 端(JS API)"平台。
- **AMap Web Service Key（高德 Web 服务 Key）**：用于地址搜索、地理编码、路径规划、坐标转换。申请"Web 服务"平台。
- **Google Maps API Key（谷歌地图 Key）**：选用 Google 时必填。在 [Google Cloud Console](https://console.cloud.google.com/) 申请并开通 Maps JavaScript API、Places API、Directions API、Geocoding API。
- **Language（语言）**：自动 / 中文 / English。

## 安装方法

> 本项目不会提交 Obsidian 社区插件审核。

### 方式一：BRAT（推荐）
1. 在 Obsidian 社区插件中安装 BRAT。
2. 打开 BRAT 设置。
3. 点击 "Add Beta plugin"，输入仓库地址：`alvinfunborn/lac-roadmap`。
4. 在社区插件中启用 LaC.Roadmap；BRAT 会自动拉取最新 release 并保持更新。

### 方式二：手动安装
1. 从 [GitHub Releases](https://github.com/alvinfunborn/lac-roadmap/releases) 下载最新发布包。
2. 将 `main.js`、`manifest.json`、`styles.css` 解压到 `<vault>/.obsidian/plugins/lac-roadmap/`（目录不存在时自行创建）。
3. 在设置 → 社区插件中启用 LaC.Roadmap。

## 使用方法

### 1. 首次打开
命令面板执行"Open LaC.Roadmap"。若配置的入口文件不存在，插件会在 `LaC/Roadmap/roadmap.md` 下生成集合根 + 示例地点，立刻可以看到 UI。

### 2. 管理行程
在行程列表页：
- **新建行程**：点击底部 `+ NEW TRIP` 按钮，弹窗填写名称 / 描述 / 起止日期 / 地图提供商。
- **打开行程**：点击任一卡片，**当前标签页**就地进入行程详情（顶部 `‹` 返回，不会开新 tab）。
- **未安排区拖拽**：未填日期的行程可以拖拽改顺序；已规划行程按日期自动排序。
- **右键菜单**：右键（移动端长按）卡片，菜单包含"从集合移除 / 复制 / 彻底删除（移入回收站）"。

### 3. 管理地点
在行程详情页：
- **新增地点**：`+ ADD PLACE` 弹出表单，填写名称 / 时间范围 / 地址。地址选择器会调用你配置的地图提供商。
- **嵌套子路线**：`+ ADD TRIP` 创建子路线，父路线把它当作地点引用。
- **编辑路线段**：点击两地点之间的药丸（`walk · 4.8 km · 18 min`）编辑交通方式 / 距离 / 用时 / 费用。`auto-calculate` 按钮调用地图提供商的路径规划 API。
- **补全缺失路线段**：相邻两地点间显示 `+ transit` 表示尚无路线段，点击创建。
- **拖拽地点**：日内拖拽改顺序；拖到日标签上改日；起讫地点变化时自动重算路线段。

### 4. 日标签
- `DAY 1 / 11·01 / 3` — DAY 序号、日历日期、当日地点数。
- 点击多选；空选或全选都等价于显示全部。
- `+ DAY` 临时新增一天占位（仅当前 session 有效，不写入文件），便于预览未来某日的地点分组。
- `wishlist` 收集所有无日期的地点。

### 5. Hero 地图
行程 / 行程列表页顶部的地图是预览态。点击展开为完整的只读地图查看器，可任意平移缩放查看 marker。Hero 之所以做成预览态而非直接交互，是因为 warm-ink 视觉处理（filter + mix-blend-mode 组合）在 Chromium 下不能正确传递指针事件——详见 `docs/PROGRESS.md` 的取舍记录。

## 技术实现

- 基于 Obsidian Plugin API 做文件操作和视图注册。
- React + TypeScript 构建 UI；Sortable.js 处理拖拽。
- 轻量 TOML 读写器，保留开头注释，支持正文中的 `[[wikilink]]`。
- Provider 抽象层（`IMapProvider` + `GoogleMapProvider` / `AmapProvider`），所有地图组件对两种 provider 等价兼容。
- 坐标转换（WGS84 ↔ GCJ-02）在 provider 边界完成，地点文件始终保留其声明的坐标系。
- Field Journal 设计 token 都在 `styles/_variables.scss`；字体走系统 fallback chain（不打包字体、不发起网络请求）。
- Jest 测试 220+，覆盖仓储 / hooks / services / 端到端流程。

## 架构

主要组件：

- `RoadmapPlugin` — 插件主入口，负责视图注册、设置面板。
- `RoadmapView` — Obsidian `ItemView` 宿主；根据文件的 `renders` 字段 dispatch 到 `RoadmapSetPage`（集合根）或 `RoadmapPage`（单条路线）。
- `RoadmapSetPage` — 行程列表 + hero 聚合地图 + 状态计数 + wishlist 拖拽排序。
- `RoadmapPage` — 行程详情，由 header / day tabs / timeline / actions 组成。
  - `RoadmapHeader` — 返回按钮 + serif 标题 + 统计 + hero 地图。
  - `DayTabsStrip` — 三层 mono day tabs + 长按拖拽排序。
  - `Timeline` — 脊柱 + 编号圆 + 地点卡片 + 路线段药丸。
  - `RoadmapActions` — `+ add place / + add trip` 操作行。
- `RoadmapRepository` — TOML 解析、地点 CRUD、子路线识别、路线段写入。
- `RouteCalculationService` — Google Directions / 高德 路径规划封装。
- `MapSelector` — 全屏地图弹窗（既可交互选址，也可只读查看）。
- `AggregatedMap` — Hero 地图小部件，带 warm-ink 滤镜和悬浮装饰。

## 许可证

MIT License
