# 聊单助手（Mac 桌面版）

现行规则已按用户要求于 2026-10-09 更正。开始工作先读 [AGENTS.md](AGENTS.md)、[已确认界面与功能基准](CONFIRMED-UI-BASELINE.md) 和 [版本与提交台账](APP-VERSION-INVENTORY.md)；旧阶段计划和发布记录仅按其历史范围使用。

- 编号连续加一、逢 9 进位，不按功能大小跳号。
- 每累计5次实际应用交付提交并推送GitHub；截至3.6.0的6次积压已补交至7d03ff0，远端已核对。3.6.1至3.6.5这批5次已提交并推送0ec9af9，远端已核对，下一批次当前0次，纯文档和中途修正不重复计数。
- 可用 App 放在项目 `交付` 目录；不默认放桌面或生成 ZIP／DMG。
- 最新交付为从3.6.4连续加一的 `3.6.5`，增加客户资料一键提取及可对照聊天的编辑浮窗；最终成品启动与9项操作回归已验证，旧App保留。打开方式见 [USER-GUIDE.md](USER-GUIDE.md)，诊断与局部验收见 [本轮记录](CUSTOMER-PROFILE-3.6.5-ACCEPTANCE.md)。

正式路线为 Electron + Node.js + Playwright + Google Sheets API。Chrome Extension 已归档，桌面应用不依赖扩展、后台服务器、Python 或用户终端。

核心 Canvas 重建模块最初复制自已验证的后端；当前由本项目 `shared/` 独立维护，构建检查不读取或覆盖外部旧项目。3.6.4在本项目修复父级裁剪及完整行判断，历史无父级裁剪信息的快照保留兼容路径。

开发命令：

- `npm test`：单元、集成和真实旧证据回归测试
- `npm run check`：共享代码与安全边界检查
- `npm run start`：开发运行
- 打包前审阅 `package.json` 中的实际构建脚本。当前 `npm run dist` 生成App并覆盖旧dist发布位置；本轮须指定独立构建目录，再交付到项目 `交付` 目录并验证。ZIP／DMG仅在用户明确要求时生成，不因配置里存在相应字段就默认输出。

最终用户只需使用打包后的 App，参见 [USER-GUIDE.md](USER-GUIDE.md)。
