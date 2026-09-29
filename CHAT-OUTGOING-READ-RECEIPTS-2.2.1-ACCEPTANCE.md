# 2.2.1｜WhatsApp 我方消息送达／已读回执验收

## 修复目标

在聊天工作台右侧的我方消息上显示 WhatsApp 的真实出站回执：单对钩为已发送、灰色双对钩为已送达、蓝色双对钩为已读。未知或缺失回执不猜测显示；客户消息不显示我方回执。

## 真实验收内容

- 固定产物：`dist/聊单助手.app`，Mac x64，包内版本 `2.2.1`。
- 使用该最终 App 直接启动的临时隔离 Electron 会话；所有号码、消息、图片和 IPC 返回值均为虚构。
- 实测 ACK `1`、`2`、`3`、未知值与客户消息的显示边界；将同一虚构消息从 `1` 刷新为 `3` 后，页面自动显示已读双对钩。
- 实测刷新时保留已缓存图片；1280×820 与 820×640 截图已人工核对。
- 未读、未回、全部、会话摘要与左侧状态不因 ACK 改变。
- 无真实 WhatsApp 读取、标记已读或发送；无真实订单、客户、ShopPlus、AI 操作。

截图：`artifacts/chat-outgoing-receipts-2.2.1/outbound-receipts-1280x820.png`、`artifacts/chat-outgoing-receipts-2.2.1/outbound-receipts-820x640.png`。

## 检查结果

- `npm run check`：通过。
- 31 项关联的虚构单元／Electron 回归：通过。
- 最终 App 隔离 E2E：`1 / 1` 通过。
- `codesign --verify --deep --strict`：通过。
- x64 Mach-O：通过。
- `git diff --check`：通过。
- 可执行文件 SHA-256：`0027bcafd9669195cb30a33e472f0f95f371d52c27e025f540021760b64b864e`。

本文件仅记录 D-137 的局部验收，不代表聊天工作台或其它页面整页重新验收。
