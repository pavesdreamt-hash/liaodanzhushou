# 2.8.0｜聊天图片可靠回显与本机商品草稿验收

范围仅为桌面“聊单工作台”中已核对的一对一会话：我方成功发送图片后的本机可靠回显，以及从本机商品资料生成可编辑聊天草稿。它不代表整个聊天工作台、订单、库存页或任何外部平台重新验收。

## 可用结果

- 对由人工明确发送、且已取得当前会话 WhatsApp 合法回执的 JPEG、PNG、WebP 图片，应用立即按账号、会话和原生消息 ID 保存安全本机显示副本；PN/LID 别名刷新、重开会话和应用重启后仍显示该副本，不会自动重发或再次读取媒体。
- 输入区新增“商品”入口，只会在当前会话身份核对完成后解锁；主进程再次检查当前受限会话令牌。它只读本机已经同步且当前可用的商品目录，可按名称、商品编号和来源 SPU 查找。详情只在精确选择一款商品时读取本机缓存图片。
- 可选择名称、网站售价、建议售价（定价）、库存、来源库存状态、成本价、底价设置和一张已缓存图片；“加入草稿”只写入可编辑中文输入区和普通待发送附件。取消、移除和关闭都不会发送；仍须人工核对／翻译并点击原有“发送确认”。
- 缺失字段显示“待核对”，不补零、不猜测；没有本机可发送图片时也不会伪造图片。GIF 不会被展示为可发送图片。

## 隔离验证

- `npm run dist` 成功完成：其中 `npm run check`（类型、界面构建、共享兼容性、项目检查）通过，并生成固定 `dist/聊单助手.app`。
- `node --test --test-timeout=30000 test/chat-product-catalog.test.mjs test/manual-chat-history.test.mjs test/manual-chat.test.mjs`：38 / 38 通过。
- 直接启动最终固定 App 的隔离 Electron 回归：`test/chat-workbench-product-picker.e2e.mjs` 2 / 2 通过；断言未核对会话的商品入口保持禁用且商品目录读取次数为 0，`packaged=true`、版本 `2.8.0`。虚构商品可检索并进入可编辑草稿，且没有调用虚构发送接口；虚构发送图片在 PN/LID 刷新后继续显示，本轮媒体重新读取次数为 0。
- `node scripts/verify-keychain-continuity-package.mjs`：通过。它直接启动固定 App，确认稳定包名／可执行名、包标识、x64、`packaged=true` 和版本 `2.8.0`；报告在 `artifacts/keychain-continuity-2.8.0/app-verification.json`，并明确 `fictionalIsolation=true`、真实钥匙串／ShopPlus／消息发送均为 0。
- `codesign --verify --deep --strict dist/聊单助手.app`：通过。
- `git diff --check`：通过。

视觉检查使用完全虚构的会话、图片和商品资料，已实际查看最终固定 App 的截图：

- `artifacts/chat-product-picker-2.8.0/product-picker-1280x820.png`：商品资料可读，详情区独立滚动，底部“取消／加入草稿”完整可见。
- `artifacts/chat-product-picker-2.8.0/product-picker-1440x1000.png`：商品选择、字段勾选、价格、库存和图片状态均可读。
- `artifacts/chat-product-picker-2.8.0/outbound-image-cache-1280x820.png`：PN/LID 刷新后的我方图片气泡显示正常，并保留普通可编辑输入区。

## 成品与边界

- 固定 Mac x64 App：`dist/聊单助手.app`
- 包内版本：`2.8.0`
- 可执行文件 SHA-256：`d42ae50d02793ebb5e25fcd295310ad3748f89ffc2451460b5cb256e850a93a2`

全部自动验收使用隔离虚构号码、会话、消息回执、图片和本机目录；真实 WhatsApp、ShopPlus、订单、客户和 AI 读写／发送均为 0。本轮没有尝试真实发图。

完整旧测试集当前为 456 / 471 通过，余下 15 项是既有订单确认依据／旧报单格式断言，和本轮 D-178 的聊天图片、商品目录桥接及界面文件无交集；因此不将整套旧测试集冒称为通过。该残余需由订单流程维护者另行处理。
