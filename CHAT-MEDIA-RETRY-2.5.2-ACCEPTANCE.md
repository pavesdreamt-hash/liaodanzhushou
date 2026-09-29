# 聊天旧图片读取与失败说明：2.5.2 验收记录

范围仅限已核对聊天的当前可见图片：按 WhatsApp 原生消息 ID 直接读取旧图，并保留可公开的失败阶段。本次没有读取真实客户聊天、下载真实媒体、发送消息或改动订单、翻译、AI、ShopPlus、KDocs 或 Google。

## 已核验

- 虚构旧图片在近期消息读取故障时，仍可经已核对消息 ID 直接显示。
- 直接 ID 查询失败时显示受限错误代码 `WHATSAPP_MEDIA_LOOKUP_UNAVAILABLE` 对应的中文重试说明，而不是误称已搜索最新消息。
- 失败代码、说明、时间只保存在相同账号、会话、消息 ID 的本机聊天历史；重开虚构会话仍存在，成功读取会清除该状态。
- `npm run check`、21 项图片历史／传输／桌面视口回归、固定最终 App 桌面媒体回归、`git diff --check` 均通过。
- 固定 App 和 ZIP 新解压副本均在隔离临时资料目录启动：`packaged=true`、`version=2.5.2`、`schemaVersion=26`、`arch=x64`。
- 固定 App 深度签名与 x64 Mach-O 检查通过。

## 交付物

- 固定 App：`dist/聊单助手.app`
- ZIP：`dist/聊单助手-2.5.2-mac-x64.zip`
- App 可执行文件 SHA-256：`695ca7a42c72fa4948de6f6f559940194c5c7d7feb68786e008ab48b8ce43776`
- ZIP SHA-256：`2de8ffbdfa473689cd844e55cf363dc51b9b49508c14eda972a355adabfeda84`

## 未宣称通过

WhatsApp 是否仍保留某张历史原图由其平台决定；当平台不返回媒体时，2.5.2 只能明确说明阶段并保留可重试入口，不能凭本机占位还原原图。
