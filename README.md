# 聊单助手（Mac 桌面版）

现行规则已按用户要求于 2026-10-09 更正。开始工作先读 [AGENTS.md](AGENTS.md)、[已确认界面与功能基准](CONFIRMED-UI-BASELINE.md) 和 [版本与提交台账](APP-VERSION-INVENTORY.md)；旧阶段计划和发布记录仅按其历史范围使用。

- 编号连续加一、逢 9 进位，不按功能大小跳号。
- 每累计5次真实交付提交并推送GitHub；截至3.6.0积压补交7d03ff0、3.6.1—3.6.5已推送0ec9af9、3.6.6—3.7.0已推送688ae3b、3.7.1—3.7.5已推送8a36b51，远端原核验收据保留。上批3.7.6—3.8.0五次已提交推送905d758且远端核对，本批3.8.1—3.8.5五次已同步4f23b71并核对远端，3.8.6～3.9.0本批五次已同步9a8c7f9，3.9.1起新批；纯文档与候选内部修正不重复计数。
- 可用 App 放在项目 `交付` 目录；不默认放桌面或生成 ZIP／DMG。
- 本轮成品 **3.9.0**：商品变化窗口原地上下架、调价和改规格库存，右上关闭、底部五动作。等当前批次结束，从菜单栏退出旧后台，再双击 `交付/聊单助手3.9.0/聊单助手.app` 核对版本。本批五次已同步GitHub（9a8c7f9）；见[SINGLE-PRODUCT-3.9.0-ACCEPTANCE.md](SINGLE-PRODUCT-3.9.0-ACCEPTANCE.md)。

正式路线为 Electron + Node.js + Playwright + Google Sheets API。Chrome Extension 已归档，桌面应用不依赖扩展、后台服务器、Python 或用户终端。

核心 Canvas 重建模块最初复制自已验证的后端；当前由本项目 `shared/` 独立维护，构建检查不读取或覆盖外部旧项目。3.6.4在本项目修复父级裁剪及完整行判断，历史无父级裁剪信息的快照保留兼容路径。

开发命令：

- `node scripts/check-background.mjs test/相关.test.mjs`：日常默认。后台类型/共享检查和指定单元，不启动桌面 App。
- `node scripts/check-background.mjs --page fb-chat`（或 `inventory`）：额外使用无窗口 Chromium 检查当前构建页面空白状态，截图/收据放入 `artifacts/background-check/`；只用虚构服务，不连接正式资料。缺少浏览器时失败，不回退弹窗。不代表完整业务或最终桌面验收。
- `npm test`：单元、集成和真实旧证据回归测试
- `npm run check`：共享代码与安全边界检查
- `npm run start -- --visible`：集中安排可见桌面验证时使用；省略 `--visible` 会停止，异常退出默认不重启。日常开发不运行可见 Electron 验收脚本，不自动退出/切换用户正式 App，详见 AGENTS.md。
- 打包前审阅 `package.json` 中的实际构建脚本。当前 `npm run dist` 生成App并覆盖旧dist发布位置；本轮须指定独立构建目录，再交付到项目 `交付` 目录并验证。ZIP／DMG仅在用户明确要求时生成，不因配置里存在相应字段就默认输出。

最终用户只需使用打包后的 App，参见 [USER-GUIDE.md](USER-GUIDE.md)。

2026-10-19第五次节点收据：3.7.1—3.7.5五次交付已整理55个源码、测试及必要文档文件，提交`8a36b51c8fea6d3f2b98d066fd1a806329edf31e`并成功推送GitHub，远端main核对同值。App、生成证据、依赖、正式资料及凭据未纳入。此处为后续文档登记，不修改3.7.5 App，也不产生第六次应用迭代。下一批从3.7.6开始。
