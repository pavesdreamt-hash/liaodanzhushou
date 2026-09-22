# KDocs 库存同步（Mac 桌面版）

正式路线为 Electron + Node.js + Playwright + Google Sheets API。Chrome Extension 已归档，桌面应用不依赖扩展、后台服务器、Python 或用户终端。

核心 Canvas 重建模块由 `../src/layout-probe.mjs`、`../src/reconstruct.mjs` 和 `../src/monitor/text.mjs` 生成到 `shared/`，构建脚本会用 SHA-256 校验，避免已验收算法出现无意分叉。

开发命令：

- `npm test`：单元、集成和真实旧证据回归测试
- `npm run check`：共享代码与安全边界检查
- `npm run start`：开发运行
- `npm run dist`：生成 Intel Mac `.app` 与 `.dmg`

最终用户只需使用打包后的 App，参见 [USER-GUIDE.md](USER-GUIDE.md)。
