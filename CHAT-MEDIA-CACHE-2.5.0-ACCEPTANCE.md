# 聊单助手 2.5.0：聊天图片按需本机缓存验收

## 范围

只验收桌面聊天区对已查看图片的本机缓存。消息文字、身份核对、订单、发送、翻译、AI、其它页面和所有外部写入均不在本轮范围。

## 行为

- 图片只在当前打开会话进入可见视口后读取，界面沿用最多两张并行读取。
- 首次成功读取后，以账号 ID、聊天 ID 和 WhatsApp 原生消息 ID 保存本机图片缓存。
- 重新打开会话或重启后，缓存命中直接显示本机图片，不请求 WhatsApp；从未查看的图片不下载。
- 缓存最长保留 30 天、总量最多 100 MB；到期或超额只清理图片字节，保留消息和“可在当前会话重试读取”提示。
- 显式重试或已清理后重新进入当前视口，才可再次向 WhatsApp 请求；不发送消息、不修改 WhatsApp 或外部平台。

## 自动核验

`test/manual-chat-history.test.mjs` 使用隔离虚构会话确认成功图片会持久保存，重启后的读取命中本机且不调用 WhatsApp；同时确认超额和过期清理保留消息占位。`test/chat-workbench-media.e2e.mjs` 确认工作台只读取当前视口图片、最多两张并行，失败后可明确重试。`test/media-pipeline.test.mjs` 覆盖原生消息 ID 查找、单张大小限制、内存队列与连接变化保护。

## 成品核验

固定 Mac x64 App：`dist/聊单助手.app`。其可执行文件 SHA-256 为 `53f88cb991aee128aa3ee9c8f9a227e5efb0c3189836bf5dc284ecfa7e489e44`；ZIP `dist/聊单助手-2.5.0-mac-x64.zip` 的 SHA-256 为 `2d2d0fd1e28ff85f910fd7dc33ba6e4c0b1a16127544eb563f52c8a76b9f5a37`。两份 App 都完成 ad-hoc 深度签名校验，并以独立临时资料目录直接启动；启动报告均为 `packaged=true`、`version=2.5.0`、`schemaVersion=26`、`arch=x64`。固定 App 的 `test/chat-workbench-media.e2e.mjs` 隔离 Electron 回归通过。

完整 `npm test` 同时跑出 15 个已有的订单报单格式／确认依据断言失败；它们不涉及本轮图片缓存文件。本轮定向图片历史、传输和桌面视口回归为 16/16 通过，`npm run check` 和 `git diff --check` 也通过。
