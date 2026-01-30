> 完整需求与技术说明见：`requirements.md`、`technical.md`。

---

主题色:
#ffffff
#101820 背景色
#b3995d 已开始/已结束
#d3bc8d 未开始
#FF8200 未安排
辅助色:
#4b4b4b 卡片背景色
#aa0000 警告色

这是一个旅行路线规划和记录插件

两个页面, 一个是roadmapset, 一个是roadmap
roadmapset:
顶部1:1世界地图(使用google地图), 地图上显示所有记录的地点
下方显示roadmap列表, 每个roadmap是一个卡片, 卡片显示名称,日期时间, 卡片右侧用1:1的地图, 地图显示该roadmap的所有地点
列表底部有"+"新增按钮, 点击新增即打开新的roadmap页面
点击roadmap卡片打开roadmap页面
长按roadmap卡片打开上下文菜单: 删除/复制

roadmap:
顶部1:1地图(使用google地图), 地图上显示该roadmap的所有地点
下方是一个tab栏, 分tab展示地点, 如果是有日期roadmap, 按日期tab展示, 如果没有日期, 则使用"第一天","第二天"..., tab栏可以左右滑动, tab栏的右侧有添加按钮直接加一天, 点击tab筛选此tab下的所有地点(同时顶部地图只显示该tab下的所有地点), tab栏的左侧有一个"<"返回按钮, 返回上一页
下方显示roadmap的地点列表, 每个地点是一个卡片, 卡片显示地点名称, 地点描述, 地点的日期时间, 上一个地点到此地点的距离/用时/费用 卡片右侧用1:1的地图, 地图显示该地点
列表底部有"+"新增按钮, 点击即弹出新增卡片弹窗, 点击新增弹窗的地址栏弹出地图选择器(可切换地图提供商)
长按tab可以拖拽左右排序
长按地点卡片可以拖拽上下排序


### 源数据文件
# roadmap.md
```
type = "root"
renders = ["roadmapset"]

[[日本之行]]
```

# 日本之行.md
```
name = "日本之行"
type = "root"
renders = ["roadmap"]

[detail]
description = "日本三古都文化之旅"
start_time = "2025-10-04"
end_time = "2025-10-09"
address = { name = "日本" }

[[银座]]
[[秋叶原]]
# travelMode包括walk,bicycle,two_wheeler,drive,transit
route = { travelMode = "drive", distance = 5000, duration = 22, tolls = 122}
[[秋叶原]]
route = { travelMode = "transit", distance = 5000, duration = 33, tolls = 24}
```

# 银座.md
```
name = "银座"
type = "root"
renders = ["roadmap"]

[detail]
start_time = "2025-10-04 11:00:00"
end_time = "2025-10-04 14:00:00"
description = "银座逛街"
address = { name = "银座" }

[[银座药局]]
[[银座奶茶]]
route = { travelMode = "walk", distance = 1000, duration = 10, tolls = 10}
```

# 秋叶原.md
```
name = "秋叶原"

[detail]
start_time = "2025-10-08 15:00:00"
end_time = "2025-10-08 17:00:00"
description = "秋叶原逛二次元"
address = { name = "秋叶原" }

```







