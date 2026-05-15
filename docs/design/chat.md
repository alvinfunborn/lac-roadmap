Product DNA

"Life as Code" — every trip is a TOML+Wikilink markdown file. The UI sits on top of plain text. Should feel typographic and document-like, not app-dashboard-like.
Three states (done / planning / unscheduled) × two views (trip list / trip detail with timeline of places) × signature element: per-trip calendar heatmap.
What's holding the current design back

Rainbow heatmap (green→yellow→red) clashes with the muted gold theme — it's the loudest thing on screen but says nothing about taste.
#FF8200 neon orange against #b3995d warm gold = two unrelated palettes coexisting.
Card surface #4b4b4b is a flat mid-gray on a deep teal-black bg — heavy, no warmth.
5-up stats card row + 100×100 square map thumbnails glued to dense text = generic dashboard, not field journal.
Browser-tab overlap for dates is a web trope; doesn't suit a planning surface.
Direction Lean into the TOML/document philosophy: a field journal. Typography-led, warm paper-on-ink palette, monochromatic gold heatmap, real vertical timeline for places, data shown as monospace text rather than card chrome.

Let me set up the canvas now.

已完成「LaC.Roadmap · Field Journal redesign」。核心思路：

调性：把"数据即文件"的产品哲学翻译成视觉语言——把仪表盘风格改成田野日志风格。

字型：Newsreader 衬线承载行程名（带温度），Geist 跑 UI，JetBrains Mono 跑日期/距离/坐标这类数据点。
色板：保留 #B3995D/#D3BC8D 作灵魂金色，把 #FF8200 退烧成 #C77A4A，让三种状态色共享同一温度家族。
卡面：从 #4b4b4b 灰板换成 #151B20 暖墨，hairline 与 8px inset 高光。
关键变更：

热力图：彩虹（绿→黄→红）→ 单色金度密度（5 阶 alpha）。从最吵元素退回背景节奏。
统计：5 张卡片 → 一行 mono 文本 2 days · 4 places · 81.3 km · 9h 15m · ¥240。
日期标签：浏览器 tab 重叠样式 → 安静的 DAY 1 / 11·01 / 3 三层文字加底线，不抢戏。
行程明细：地点列表 → 真正的纵向时间线：脊柱 + 编号小圆 + 路段药丸（mode · km · min）挂在脊柱上。
缩略图：100×100 方块紧贴文字 → 56×56 圆角缩在右上角，让文字呼吸。
文件结构：Roadmap Redesign.html（外壳 + 字体 + tokens）、tokens.css（设计变量）、artboards.jsx（4 个 artboard：Trip List / Trip Detail / Edit Modal / Before-After 对照）。