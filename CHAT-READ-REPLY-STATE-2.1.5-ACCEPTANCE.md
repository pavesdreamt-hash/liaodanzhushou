# 聊天已读与已接待状态闭环 — 2.1.5 验收

日期：2026-09-25
范围：当前已核对 WhatsApp 会话的已读请求，以及已验证人工发送回执后的左侧会话摘要与统计。

## 修复目标

- 用户主动打开且号码已核对的当前会话，才向 WhatsApp 请求标记已读。
- 会话行与顶部未读继续只以 WhatsApp 原始 `unreadCount` 为准；平台未回传 `0` 时绝不本地清除红圈。
- 只有取得合法 WhatsApp 发送回执，才立即把当前会话显示为“已接待”并重算“未回／全部”。

后台十秒轮询、列表渲染、搜索、筛选和未核对会话都不会标记已读。发送失败或待核实不会修改左侧状态。

## 实际验收

- `npm run check` 通过。
- `node --test --test-timeout=30000 test/manual-chat.test.mjs` 通过 `18 / 18`：验证号码核对、WhatsApp 确认回执和拒绝未确认的已读请求。
- `node --test --test-concurrency=1 --test-timeout=60000 test/chat-workbench-read-reply-state.e2e.mjs` 通过：使用三个隔离虚构会话，确认只对两个已核对且被主动打开的会话各请求一次已读；号码未核对会话从不请求。第一个平台回传 `0` 后红圈消失；第二个仍回传 `7` 时红圈与顶部原始未读数保留。取得虚构发送回执后，第二个会话立即显示“已接待”，`未回` 由 `3` 变为 `2`，原始 `7` 不变。
- 既有 `test/chat-workbench-filter-badges.e2e.mjs` 通过，确认统计的原始未读、去重全部、最后有效方向与零值隐藏未回归。
- 最终固定 App 使用临时隔离资料运行 `node scripts/verify-chat-read-reply-state-package.mjs` 通过：`ok=true`、`version=2.1.5`、`arch=x64`、`realWhatsAppReads=0`、`realMessagesSent=0`、`errors=[]`。
- 最终 App：`dist/聊单助手.app`；`codesign --verify --deep --strict`、x64 Mach-O 检查、包内版本和 `git diff --check` 均通过。可执行文件 SHA-256：`6f05c2dd4887988549243cd980f3578ebd4070f0cb543c0e76d4dfeede6b2320`。

## 数据边界与交付

全部功能验收使用隔离虚构号码、消息、未读数和发送回执。没有读取、标记或发送真实 WhatsApp，未修改真实客户、订单、ShopPlus 或 AI 数据。

交付固定 Mac x64 App：`dist/聊单助手.app`。不生成 ZIP；本次不是 GitHub 五版本递交节点。
