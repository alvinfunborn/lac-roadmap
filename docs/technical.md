# LaC Roadmap 技术文档

> 与 `requirements.md` 配套，描述架构、数据、接口与实现状态，便于完整实现与维护。

---

## 1. 架构概览

```
main.ts (RoadmapPlugin)
  └── 注册 View (lac-roadmap-view)
  └── RoadmapView (ItemView)
        └── 根据 filePath + isValidEntry() 决定渲染
            ├── RoadmapSetPage  (根文件 type=root, renders 含 roadmapset)
            └── RoadmapPage    (普通路线文件)
  └── RoadmapRepository(app, rootFilePath)  // 注意：roadmap 页时 rootFilePath 为当前路线所在目录的「根」逻辑由调用方传 filePath 区分
```

- **入口**：`main.ts` 注册 `lac-roadmap-view`，通过「用某文件打开」或命令打开视图；`RoadmapView.setState({ filePath })` 决定是集合页还是路线页。
- **数据**：`RoadmapRepository` 以 `rootFilePath` 为根文件路径；`loadRoadmapSet()` 仅对根文件有效；`loadRoadmap(filePath)` 用于任意路线文件。
- **页面**：
  - **RoadmapSetPage**：`repository` 对应根文件，加载 `loadRoadmapSet()` 得到 id 列表，再对每个 id 解析得到 `Roadmap[]`。
  - **RoadmapPage**：接收 `filePath`，用同一 `repository`（根文件仍为配置的 entry）调用 `loadRoadmap(filePath)` 得到当前路线数据。

---

## 2. 数据模型

### 2.1 类型定义位置

- **路线/地点/路段**：`types/roadmap.ts`
- **地图/地址**：`types/map.ts`
- **插件设置**：`types.ts`

### 2.2 核心类型（types/roadmap.ts）

| 类型 | 说明 |
|------|------|
| `TravelMode` | 'walk' \| 'bicycle' \| 'two_wheeler' \| 'drive' \| 'transit' |
| `Address` | name, address?, longitude?, latitude?, coordinate_system? |
| `RouteSegment` | travelMode, distance?, duration?, tolls?（上一地点到当前地点的路段） |
| `PlaceDetail` | start_time?, end_time?, description?, address? |
| `Place` | id, name, detail |
| `RoadmapDetail` | description?, start_time?, end_time?, address? |
| `Roadmap` | id, name, detail?, items: (Place \| RouteSegment)[] |
| `RoadmapItemGroup` | key（日期或「第 N 天」）, items |
| `RoadmapSet` | entries: string[]（根文件 [[...]] 列表） |

- 文件中 **items** 顺序：`[Place, RouteSegment?, Place, RouteSegment?, ...]`，即地点后可选跟一段「到下一地点的路段」。

### 2.3 地图类型（types/map.ts）

| 类型 | 说明 |
|------|------|
| `MapLocation` | longitude?, latitude?, name?, address?, coordinate_system? |
| `MapSearchResult` | name, address, location, distance? |
| `MapSelectorProps` | visible, initialLocation?, onCancel, onConfirm, title?, placeholder?, settings, updateSettings? |

### 2.4 设置（types.ts）

- `RoadmapSettings`：locale, entryFile, enableContextMenu, mapApiProvider ('none'|'gaode'|'google'), googleMapsApiKey?, gaodeWebServiceKey?

---

## 3. 仓库 API（RoadmapRepository）

| 方法 | 说明 |
|------|------|
| `getRootPath()` | 返回 rootFilePath |
| `isValidEntry()` | 根文件存在且 TOML 头中 type=root 且 renders 含 roadmapset |
| `loadRoadmapSet()` | 解析根文件正文中所有 `[[...]]`，返回 id 列表（不含 \| 后缀） |
| `loadRoadmap(filePath)` | 读取路线文件 + 解析双链与 route 行，返回 `Roadmap`（items 含 Place 与 RouteSegment） |
| `createRoadmapFile(folderPath, name, detail?)` | 创建或覆盖路线 md，返回 filePath |
| `addRoadmapToSet(roadmapId)` | 将 id 追加到根文件的 [[...]] 列表 |
| `updateRootFile(roadmapIds)` | 用新 id 列表重写根文件中的 [[...]] 部分 |
| `savePlaceFile(folderPath, place)` | 创建或更新地点 md（TOML 头） |
| `updateRoadmapItems(filePath, name, detail, items)` | 用新 name/detail/items 重写路线文件（保留 [[...]] 与 route 行顺序） |

- TOML 解析：`quoteWikilinksForToml` 将 `[[x]]` 转为 `[["x"]]` 再 parse，避免与 TOML 数组语法冲突。
- 路线文件中「紧随 `[[Place]]` 的 `route = { ... }`」表示「从该 Place 到下一个 Place 的路段」。

---

## 4. 地图层

### 4.1 组件职责

| 组件 | 用途 | 数据来源 |
|------|------|----------|
| **AggregatedMap** | 顶部聚合地图，多标记点 + 适配视野 | 当前实现：仅从 `repository.loadRoadmapSet()` + 各 roadmap 的 items 收集**所有**地点；**不区分**当前是 roadmapset 页还是 roadmap 页，也不接受「当前 roadmap」或「按 tab 筛选」 |
| **MapSelector** | 弹窗内选点/选地址，可切换地图提供商 | settings + initialLocation，onConfirm 回传 MapLocation |
| **StaticMap（roadmapset）** | 卡片右侧 1:1 小图 | Google Static API，单 roadmap 的 place 坐标 |
| **PlaceStaticMap（roadmap）** | 地点卡片右侧 1:1 小图 | 单 place 的 address 坐标 |

### 4.2 待实现：Roadmap 页地图与 tab 联动

- **需求**：Roadmap 页顶部地图只显示「当前 roadmap」的地点；点击 tab 后只显示「该 tab 对应分组」的地点。
- **实现要点**：
  1. 新增 props 或新组件：例如 `AggregatedMap` 支持可选 `places?: Place[]` 或 `locations?: { lng, lat, title }[]`；当传入时不再调用 `loadRoadmapSet()`，仅用传入数据打点并 fitBounds。
  2. RoadmapPage 中：根据 `data`（当前 roadmap）得到所有带坐标的 place；再根据 `filteredKeys` / `selectedTabs` 得到「当前 tab 筛选后的 place 列表」，将该列表传给地图组件。
  3. 若保留单一 AggregatedMap：在 roadmapset 页不传 places（沿用现有逻辑）；在 roadmap 页传入 `filteredPlaces` 或等价的 locations 数组。

### 4.3 地图提供商

- **IMapProvider**：initMap, setCenter, addMarker, removeMarker, searchPlaces, getAddressByCoordinates, displaySearchMarkers, clearMarkers, onMapClick, convertCoordinates, getCoordinateSystem, destroy。
- **MapProviderFactory**：根据 `gaode` | `google` 创建对应实现。
- **Google**：GoogleMapProvider + 静态图 URL（Static API）用于卡片小图。
- **高德**：AmapProvider，国内可用。

---

## 5. 页面与组件实现状态

### 5.1 RoadmapSetPage

- **已实现**：顶部 AggregatedMap、卡片列表（名称、描述、日期、状态色、CardCalendar、StaticMap）、点击卡片打开 roadmap、底部「+」新增路线并打开。
- **未实现**：长按卡片 → 上下文菜单（删除 / 复制）。需在卡片上增加 `onContextMenu` 或长按检测，弹出菜单后调用 `updateRootFile`（删除）或 `createRoadmapFile` + `addRoadmapToSet`（复制）。

### 5.2 RoadmapPage

- **已实现**：顶部地图（当前误用为全集合）、标题行与编辑、按日/「第 N 天」分组 tab、多选 tab 筛选列表、地点卡片（名称、描述、时间、PlaceStaticMap）、底部「+」、PlaceEditModal（地址栏打开 MapSelector）、编辑路线标题/描述、`updateRoadmapItems` 与排序逻辑（内存侧）。
- **未实现或待接好**：
  - 地图：改为「当前 roadmap + 按 tab 筛选」的数据源（见 4.2）。
  - tab 栏左侧「<」返回：调用 `app.workspace.getLeaf(false)` 或历史 back，或关闭当前 tab。
  - tab 栏横向滚动：外层 `overflow-x: auto`，tab 容器不换行。
  - 长按 tab 拖拽排序：tab 顺序与 `groupKeys` 对应，需持久化「日的顺序」或通过重排 items 间接实现（复杂）。
  - 地点卡片展示「上一段：距离/用时/费用」：在渲染每个 place 时，取 `data.items` 中该 place 前一项，若为 RouteSegment 则用 `RouteBadge` 展示。
  - 地点卡片拖拽排序：在卡片 div 上增加 `draggable={true}`、`onDragStart={() => onDragStart(idx)}`、`onDrop`/`onDragOver`，与现有 `onDrop(idx)` 逻辑对接。

### 5.3 共用组件

- **PlaceEditModal**：名称、地址（AddressInput + MapSelector）、开始/结束时间（DatePicker + TimePicker）、描述；校验与 onConfirm 已接好。
- **RouteBadge**：展示 RouteSegment（travelMode, distance, duration, tolls），需在 Roadmap 页地点卡片中按「上一项是否为 RouteSegment」条件渲染。
- **DateTabs**：当前 Roadmap 页未使用；若需「加一天」按钮可复用或仿制，与「+ 加地点」区分。

---

## 6. 样式与主题

- **变量**：`styles/_variables.scss`（$lac-bg, $lac-card, $lac-done, $lac-todo, $lac-na, $lac-danger, $lac-primary, $lac-text 等）。
- **draft 色值**：背景 #101820，已完成 #b3995d，未开始 #d3bc8d，未安排 #FF8200，卡片 #4b4b4b，警告 #aa0000；若需与 draft 完全一致，可在 _variables 中统一替换并检查对比度。
- **地图比例**：draft 要求顶部 1:1；当前 `lac-aggmap-3x2` 为 3:2，可改为 1:1 的 class 或配置项。

---

## 7. 目录结构（简要）

```
lac-roadmap/
├── main.ts                 # 插件入口、View 注册、命令与右键菜单
├── types.ts                # RoadmapSettings
├── types/
│   ├── roadmap.ts          # Roadmap, Place, RouteSegment, Address 等
│   ├── map.ts              # MapLocation, MapSearchResult, MapSelectorProps
│   └── shims.d.ts
├── repositories/
│   └── RoadmapRepository.ts
├── pages/
│   ├── roadmapset/index.tsx
│   └── roadmap/index.tsx
├── components/
│   ├── map/
│   │   ├── AggregatedMap.tsx
│   │   ├── MapSelector.tsx
│   │   ├── AddressInput.tsx
│   │   ├── GoogleMap.tsx, Amap.tsx
│   │   └── providers/
│   ├── modals/
│   │   ├── PlaceEditModal.tsx
│   │   └── ConfirmModal.ts
│   ├── DatePicker.tsx, TimePicker.tsx, DateTabs.tsx
│   ├── CardCalendar.tsx, RouteBadge.tsx
│   └── settings/RoadmapSettingTab.ts
├── styles/
│   ├── _variables.scss, roadmap.scss
│   ├── _map.scss, _modal.scss, _pickers.scss, _buttons.scss, _utilities.scss
│   └── components/, pages/
├── utils/
│   └── timeValidation.ts
├── i18n.ts
└── docs/
    ├── draft.md            # 原始草案
    ├── requirements.md     # 需求文档
    └── technical.md        # 本文档
```

---

## 8. 实现待办（按优先级）

1. **P0**
   - Roadmap 页地图：AggregatedMap 支持可选 `locations`/`places`，RoadmapPage 传入当前 roadmap 的（按 tab 筛选后）地点坐标。
   - 地点卡片：在每张卡片上根据「上一项为 RouteSegment」渲染 RouteBadge（上一段距离/用时/费用）。
   - RoadmapSet 长按卡片：上下文菜单「删除」「复制」，并调用 repository 更新根文件/创建新路线。
2. **P1**
   - Roadmap 页 tab 栏左侧「<」返回。
   - 地点卡片：绑定 draggable + onDragStart/onDrop/onDragOver，与现有 `onDrop(idx)` 和 `updateRoadmapItems` 衔接。
   - Tab 栏横向滚动（CSS + 容器结构）。
3. **P2**
   - 长按 tab 拖拽排序（需定义「日」顺序的持久化方式）。
   - 「加一天」与「加地点」的区分（若产品确认）。
   - 顶部地图 1:1 比例（draft）；主题色与 draft 完全对齐（可选）。

需求与实现的对应关系以 `requirements.md` 为准；本文档侧重接口与实现细节，便于开发时查阅和排期。
