# 7.8.0 启动修复验收

## 修复范围

- `src/main.mjs`、`src/core/ready-opener.mjs`：启动、macOS 激活和重复启动共享初始化结果；初始化未完成时等待，合并同时到达的打开请求。
- 隔离启动使用系统分配端口，避免与正式应用端口冲突；数据目录继续为 KDocs Chat Drafts 7.7 Evaluation。
- package.json、package-lock.json、renderer/index.html、USER-GUIDE.md、RELEASE-NOTES.md 同步 7.8.0 / 7.8。
- 新增 test/ready-opener.test.mjs、test/production-startup.e2e.mjs；更新隔离启动版本断言及 ZIP 包装脚本。

## 验证结果

- PASS：214 项单元与服务测试，包括启动等待、重复请求合并、失败原因保留及浏览器打开重试。
- PASS：项目静态与共享模块检查。
- PASS：7 项 Electron 回归，包括订单导入、报单、履约、备份恢复、重启及响应式布局。
- PASS：3 项打包应用验证，包括聊单虚构流程、隔离启动和数据库迁移持久化。
- PASS：打包应用以 NODE_ENV=production 启动，使用全新临时隔离目录；实际打开默认浏览器，验证管理页、新建草稿和未连接助手状态。未使用测试模式替代正式启动路径。
- PASS：ZIP 解压后 3 项启动/迁移测试通过；另直接以 /bin/zsh 运行原始 .command（无测试参数或 NODE_ENV），实际打开默认浏览器并校验 7.8 页面。
- PASS：x86_64 架构及 codesign 严格验证。
- 关键截图与测试输出：artifacts/startup-7.8/。测试不读取正式订单，不访问客户聊天、不写 Google Sheets。

## 使用

先在旧应用的菜单栏菜单选择退出（若错误提示仍在，先点 OK）。解压 KDocs库存同步7.8.0-x64.zip，双击“启动隔离验收.command”。保留原隔离资料，不覆盖已安装 App。

本次仅修复启动问题。NEW-01 至 NEW-07 的业务范围沿用 CHAT-DRAFT-ACCEPTANCE.md；真实 WhatsApp 和真实 AI 接入仍为 BLOCKED，不将虚构接口流程当作真实接通。
