# 聊单助手 2.1.4｜订单定时更新与新订单核对提醒验收

## 本次目标

订单管理新增可控的 ShopPlus 订单定时更新，并让每次新写入本机的 ShopPlus 订单在同一页显示待处理提示。定时更新默认关闭，只有用户在订单同步窗口明确选择每 15、30 或 60 分钟后才启用；所有同步继续只读 ShopPlus 订单接口。

“是否加好友”不是 WhatsApp 可由本应用可靠读取的字段。因此提醒只显示可验证事实：电话缺失、没有已核对 WhatsApp 会话、已经关联会话但本机没有本单沟通记录、或已经保存本单沟通记录。界面明确说明该限制，不把任何一种状态称为“未加好友”。

## 实际验收

- `npm run check` 通过：TypeScript、UI 构建、共享模块与项目检查均通过。
- `node --test --test-concurrency=1 --test-timeout=90000 test/shopplus-api.test.mjs test/order-sync-attention.e2e.mjs` 通过 `6 / 6`。其中隔离 Electron 验收实际验证：默认关闭、明确保存“每 15 分钟”、四种逐单核对文案、不可验证好友关系说明、点击“已查看这些新订单”只清除本机提示，以及 `app:orders-synced` 实时事件使页面出现新的待处理提醒和“定时更新发现 1 个新订单”反馈。
- 最终固定 `dist/聊单助手.app` 通过 `node scripts/verify-order-sync-attention-package.mjs "$PWD/dist/聊单助手.app"`：使用临时隔离用户目录、虚构 IPC 订单／会话／消息数据，报告 `1 / 1` 通过；未发出真实 ShopPlus 读取、未写入真实订单／客户、未读取或发送 WhatsApp 消息。
- 最终 App 的 `CFBundleShortVersionString` 为 `2.1.4`，可执行文件为 `Mach-O 64-bit executable x86_64`；`codesign --verify --deep --strict` 通过。
- 最终可执行文件 SHA-256：`c6f31b2949aadfdcb87068b7ec7293e7a00c12d0bbedd2e6fe421793732e131d`。
- 交付前仅精确处理已运行的旧固定 App 主进程 PID `57748`：`TERM` 等待 5 秒后仍存在，按已授权范围只结束同一 PID；之后由新建成品直接启动固定路径 App，主进程 PID `68004` 已确认运行。未使用广泛结束进程命令，未操作正常资料。

## 数据与范围边界

提醒确认只写入本机 `order_sync_attention` 记录，绝不修改 ShopPlus 网站订单、电话、WhatsApp 会话、未读状态、好友关系或消息。相同 ShopPlus 订单号仍跳过，不会重新提示为新订单。应用启动不会自动打开定时同步。

本条只验收订单管理的定时更新与新订单核对提醒。D-066 的九列列表、搜索、日期筛选、分页、横向滚动和详情入口保持保护范围；订单详情、商品库存、聊天工作台、AI、真实连接资料与其它历史整页事项不因本条被重新认定为全部通过。

不生成 ZIP；当前不是每五版本的 GitHub 递交节点。
