# 聊单助手 1.9.14｜macOS 钥匙串授权连续性验收记录

## 本次修复目标

修复 macOS 钥匙串授权窗口因每次版本都使用不同 App／可执行文件名而反复出现的问题；同时禁止普通启动时主动探测 AI 加密设置。

## 已核验文档与规则

- `AGENTS.md`：桌面 App 必须构建可直接使用的最终成品并实际启动；真实凭据继续只保存在本机安全存储。
- `CONFIRMED-UI-BASELINE.md`：D-119 仅授权安全存储启动时机、Mac 打包身份、固定发布路径、必要验证和文档；D-112 至 D-118 以及其他页面和正常资料受保护。
- `SHOPPLUS-PRODUCT-DETAIL-READABILITY-1.9.13-ACCEPTANCE.md`：上一版产品详情局部验收仍有效，本轮没有重做其页面或数据操作。

## 实现与安全边界

- 打包 App、Finder 显示名和主可执行文件从版本化的“聊单助手 1.9.13”改为固定“聊单助手”；Bundle ID 保持 `com.liaodan.assistant.live`，版本继续由 `CFBundleShortVersionString`、发布说明和应用版本资料准确提供。
- 最新稳定交付位置固定为 [`聊单助手.app`](dist/聊单助手.app)。之后更新必须替换这一固定 App，而不是让用户从带版本号的新 App 路径启动。
- 普通工作台启动不再调用 `assistantSettings.get()`，不会因启动预读 AI 加密设置而触发钥匙串。只有用户明确进入相关设置或执行确实需要已保存密钥的 AI／ShopPlus／Google 操作时才访问安全存储。
- 没有把 Electron `safeStorage` 改成明文，没有导出、读取、打印或修改真实钥匙串内容，也没有调用任何真实 ShopPlus、订单、客户、WhatsApp 或消息操作。
- 本机没有可用的 Apple Developer 代码签名身份，最终 App 仍为 ad-hoc 签名。因此软件不能、也不会替 macOS 自动点击“始终允许”。固定 App 首次实际读取已有密钥时如仍出现系统窗口，用户只需对“聊单助手.app”选择一次“始终允许”；后续版本必须继续使用同一固定路径和名称。

## 最终 Mac x64 App 验收

- 通过 `npm run dist` 构建；未生成 ZIP。该流程构建后以 `ditto` 发布到固定路径 [`聊单助手.app`](dist/聊单助手.app)。
- 最终固定 App 已在临时隔离、虚构设置下直接启动。报告 [`app-verification.json`](artifacts/keychain-continuity-1.9.14/app-verification.json) 记录 `packaged=true`、`version=1.9.14`、`arch=x64`、`fictionalIsolation=true`、`realKeychainAccess=false`、`realShopPlusCalls=0`、`realMessagesSent=0`。
- 最终包 `Info.plist` 已核对：`CFBundleIdentifier=com.liaodan.assistant.live`、`CFBundleName=聊单助手`、`CFBundleDisplayName=聊单助手`、`CFBundleExecutable=聊单助手`、`CFBundleShortVersionString=1.9.14`。可执行文件为 `Mach-O 64-bit executable x86_64`；`codesign --verify --deep --strict` 通过。
- `node --test` 的 30 项安全存储、AI 设置与 ShopPlus 虚构测试、`npm run check`、最终固定 App 直接启动验收和 `git diff --check` 均通过。最终可执行文件 SHA-256 为 `c4db4127e57e25b95935f71654c6d81ea4d08cc9853b042a1178752e5de3a51c`。

## 正常运行切换与范围

交付切换前，唯一正常资料旧版 `1.9.13` 主进程先收到一次 `TERM` 并等待 10 秒，仍没有退出；按用户“启动新版前清理旧版本执行窗口”的明确授权，仅对该已核对 PID 发送一次 `KILL`，随后确认旧主进程退出。之后已直接打开固定路径的最终 `1.9.14`，确认新的主进程持续运行。正常资料未用于功能验收，也没有读取或修改真实钥匙串、ShopPlus、订单、客户、WhatsApp 或聊天资料。

本轮只认定 D-119 钥匙串授权连续性局部修复通过；不代表历史手机底部 P1–P4、退出流程、商品库存、产品详情、订单、KDocs／Google、AI、聊天或其他页面完整基准通过。不生成 ZIP；本版不是每五版本的 GitHub 递交节点。
