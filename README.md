# 聊单助手（Mac 桌面版）

现行规则已按用户要求于 2026-10-09 更正。开始工作先读 [AGENTS.md](AGENTS.md)、[已确认界面与功能基准](CONFIRMED-UI-BASELINE.md) 和 [版本与提交台账](APP-VERSION-INVENTORY.md)；旧阶段计划和发布记录仅按其历史范围使用。

- 编号连续加一、逢 9 进位，不按功能大小跳号。
- 每累计 5 次实际应用交付提交并推送 GitHub；当前已有 6 次未提交交付，待补交，纯文档更正不清零。
- 可用 App 放在项目 `交付` 目录；不默认放桌面或生成 ZIP／DMG。
- 最新成品实际标号仍是 `3.6.0`，本次仅更正文档，没有生成新版或重编号。打开方式见 [USER-GUIDE.md](USER-GUIDE.md)。

正式路线为 Electron + Node.js + Playwright + Google Sheets API。Chrome Extension 已归档，桌面应用不依赖扩展、后台服务器、Python 或用户终端。

核心 Canvas 重建模块由 `../src/layout-probe.mjs`、`../src/reconstruct.mjs` 和 `../src/monitor/text.mjs` 生成到 `shared/`，构建脚本会用 SHA-256 校验，避免已验收算法出现无意分叉。

开发命令：

- `npm test`：单元、集成和真实旧证据回归测试
- `npm run check`：共享代码与安全边界检查
- `npm run start`：开发运行
- 打包前审阅 `package.json` 中的实际构建脚本；按现行规则仅生成并核验 Intel Mac App。`npm run dist` 的旧默认目标包含 DMG，不因该命令存在就默认执行或交付 DMG。

最终用户只需使用打包后的 App，参见 [USER-GUIDE.md](USER-GUIDE.md)。
