# 社区提审复核记录（2026-10-25）

结论：本次发现的材料缺项和离线设置问题已经补修并发布。CostSet 新版已通过官方自动审核；LifeFlow、Roadmap 仍有一个明确的 SDK 阻塞项，不能视为审核完毕或保证收录。

## 最新官方结果

| 插件 | 发布版本 / 提交 | 自动审核 | 剩余 Error |
| --- | --- | --- | --- |
| CostSet | 1.0.2 / 7969447 | Completed | 无 |
| LifeFlow | 1.0.3 / edd907d | Failed | 运行时创建 script 元素 |
| Roadmap | 1.4.11 / 81b56a5 | Failed | 运行时创建 script 元素 |

三个新版的官方依赖检查均通过，官方均确认 main.js 可从源码逐字节复现。两个地图插件的人工复核申请仍为 open，尚无可见回复；沿用 10 月 23 日提交的同一份申请，已将版本引用更新到 1.0.3 和 1.4.11。

## 本次补修

1. Roadmap 原来的静态预览把 None 当成非高德提供商，可在保留 Google Key 时发起请求；部分路线计算也默认回退到 Google。现统一解析地图提供商，None 优先于已保存的路线覆盖设置。地图预览、SDK 初始化、选点器和路线重算遵循关闭设置；本地新增、编辑、排序、手动填写路线仍可使用。
2. LifeFlow、Roadmap 目录的 Optional payment 说明原为空，现已填写第三方地图功能、账户和 API Key、计费与配额，并在保存后重新打开核实。
3. 中英文 README 补充 SDK 和 REST 服务用途、IP/Key/搜索词/视野/坐标传输、地图缩略图及编辑排序后的自动请求、提供商隐私政策、未加密设置及备份同步影响。删除容易误导的“免费 API Key”措辞。
4. 三个发布包加入实际打包依赖的完整许可证文本，保存在 THIRD_PARTY_NOTICES.txt，并作为注释嵌入 main.js；SDK 加载实现未混淆、改名或隐藏。

地图设置改变后需要重新打开视图。已加载的第三方 SDK 不能仅靠切换 None 卸载；需要停止其活动时应设为 None 并重启 Obsidian，已发送的请求无法撤回。

## 材料检查

- 仓库根目录有 README、MIT LICENSE、manifest.json；版本号与 package.json、锁文件根版本、versions.json 及发布标签一致。
- 发布为稳定版本，三个必要资产 main.js、manifest.json、styles.css 均存在。GitHub 提供的九个资产摘要与本地干净源码构建结果一致（按 LF 统一文本换行后比较）。
- minAppVersion 为 1.7.2；本次官方规则检查未发现不支持的 API。构建期 Node 工具与插件运行时代码分开；isDesktopOnly 为 false，但这不等于已完成真实手机验收。
- 两个地图插件默认 None；联网功能须配置自己的账户和 Key；目录均为 Optional payment 且有费用说明。
- 截图当前为空；官方管理说明将其作为可上传的展示材料，自动审核没有因此产生 Error。
- 构建来源证明（artifact attestations）仍为 Recommendation；没有把它记录成已完成。

## 验证及边界

- CostSet：3 项测试；LifeFlow：4 项；Roadmap：23 套、251 项；合计 258 项通过。Roadmap 新增 12 项，覆盖 None + 已有 Key/路线覆盖、缩略图、SDK 初始化、路线服务、编辑和拖拽等路径。
- 三个生产构建通过；从 git archive 的干净目录重新安装并构建，main.js 和 styles.css 与工作仓库一致。GitHub Actions 的 Linux 构建、测试和发布全部成功。
- CostSet、LifeFlow 去掉新增的许可证注释后，main.js 与原发布代码完全一致；未改其运行时逻辑。
- npm audit --omit=dev 使用 npm 官方源，三个结果为 0；CostSet 的 React 依赖历史上列在 devDependencies，因此另以官方后台的依赖扫描结果补充核对。
- 使用当日最新 eslint-plugin-obsidianmd 0.4.2，未发现 Obsidian 专有规则的 Error 或缺少原因的禁用指令。严格 recommended 配置仍报告历史类型等问题：CostSet 221、LifeFlow 707、Roadmap 614 个 Error；不能称为 lint 全通过。官方后台将对应现存类型等问题显示为 Warning，三个新版实际阻塞结果如上表。
- 本轮没有完成真实 iOS/Android、地图服务商账户、SDK 交互及 Obsidian 弹出窗口的全面人工验收。单元测试、可复现构建与人工批准分别代表不同的验证范围。

## 仍需官方明确决定

固定官方 SDK 入口仍会执行第三方远程代码，也不能锁定其下游资源。披露、默认关闭及测试不能消除该审核 Error，人工批准尚未取得。如果官方不接受这种加载模式，需要另行实现并验证打包地图渲染器和受支持的服务调用方式，覆盖现有搜索、地图类型、坐标系及路线交互后再发布。

## 官方依据

- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)：联网、账户、支付及许可证要求。
- [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)：Manifest、最低版本、平台及命令要求。
- [Manage your plugin or theme](https://docs.obsidian.md/community-directory/manage-entry)：分级审核、修复与重新扫描；Warning 不阻止提交。
- [FAQ](https://docs.obsidian.md/community-directory/faq)：付款类型、构建脚本、扫描排除及本地 ESLint。
- [官方 ESLint 插件](https://github.com/obsidianmd/eslint-plugin)。
- 登录后可查看三个管理页：[CostSet](https://community.obsidian.md/account/plugins/lac-costset)、[LifeFlow](https://community.obsidian.md/account/plugins/lac-lifeflow)、[Roadmap](https://community.obsidian.md/account/plugins/lac-roadmap)。
