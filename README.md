# LaC.Roadmap

Life as Code 体系的 Obsidian 旅行路线规划 / 记录插件。

所有数据以 TOML + Wikilink 形式存放在 Vault 里的 Markdown 文件中：不依赖数据库、可直接阅读与修改、完整融入 Obsidian 图谱与反向链接。

## Features

- 双地图提供商（Google / 高德）：全局默认 + 路线级 `map_provider` 覆盖，海外用 Google、国内用高德，同 Vault 无缝共存
- 坐标系自动转换：WGS84 ↔ GCJ-02 按当前 provider 自动处理
- 递归结构：地点文件可同时作为子路线入口（`type = "root"`, `renders = ["roadmap"]`）
- 交互式聚合地图 + 静态缩略图；按顺序绘制路线连线（步行/骑行虚线 + 其余实线，并按交通方式着色 + 浮层 legend）
- 路线段编辑：点击 RouteBadge 弹出编辑弹窗，支持手动填写与自动计算（调用 Google / 高德路径规划 API）
- 按日期 / "第 N 天" 自动分组；标签多选筛选、拖拽到标签改日、拖拽排序自动继承日期并重算路线段
- 行程统计（天数 / 地点数 / 距离 / 用时 / 费用）与行程导出（纯文本 / Markdown / ICS / GPX 四种格式）
- 地点复用：同一地点文件可被多条路线引用，通用字段写入地点文件，专属时间写入路线文件
- 统一 `lac-` CSS 前缀与主题色变量

## Usage

1. 在 Obsidian 中安装启用插件。
2. 在设置中配置地图 API Key（高德 JS API Key、高德 Web 服务 Key、Google Maps API Key 按需填写）。
3. 执行命令"LaC.Roadmap: 初始化示例数据"会在 `LaC/Roadmap/` 下生成根文件与示例路线。
4. 从根文件的上下文菜单或命令面板打开 Roadmap 视图即可开始使用。

详细数据格式、页面功能、迭代进度见 `docs/requirements.md` 与 `docs/PROGRESS.md`。
