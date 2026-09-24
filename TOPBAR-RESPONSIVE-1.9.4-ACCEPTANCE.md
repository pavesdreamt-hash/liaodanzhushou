# 聊单助手 1.9.4｜窄窗口顶栏防重叠验收记录

## 本次修复目标

修复聊天工作台在 820×640 等窄窗口中“聊单助手”名称与 WhatsApp 状态文字可见重叠的问题。

## 最小修复与保护范围

- 仅修改 `ui/src/chat-workbench-desktop.css` 的既有 `max-width:980px` 响应式规则。
- 窄窗口隐藏顶栏版本徽标，状态 pill 靠客户聊天列右边界并缩小间距；视觉上以现有 WhatsApp 图标、状态圆点和“已连接／未连接”短文案显示状态。
- 原状态 DOM 文本、`aria-live`、动态 `aria-label`、连接图标/颜色、点击命中、模式按钮、56 px 顶栏、四列、导航、AI辅助、聊天、订单和父级原生拖动孔位均未改动。大于 980 px 时继续显示完整“WhatsApp 已连接／未连接”文案和版本徽标。
- 工作区原有的未提交修改全部保留；未执行 reset、clean、覆盖或删除。当前批次为第 4 个版本，按用户“五个版本一次 GitHub 功能更新”规则，本轮没有提交或推送 GitHub。

## 真实执行的检查

- `npm run check`：通过 TypeScript、Vite、共享兼容性和项目检查。
- `node --test --test-concurrency=1 --test-timeout=90000 test/workbench-window-drag.e2e.mjs`：1/1 通过。新增断言验证 820×640 下品牌与状态矩形不相交、版本徽标隐藏、短状态伪元素可见、完整 `aria-label` 与状态圆点保留；1280×820 与业务页往返后的宽窗口继续显示完整状态和版本徽标。既有原生拖动、控件孔位、AI辅助点击、导航/列宽/状态变化和模态开关回归继续通过。
- `node --test --test-concurrency=1 --test-timeout=45000 test/main-window-lifecycle.e2e.mjs`：3/3 通过，确认红色关闭隐藏、激活恢复和菜单栏退出没有回归。
- `node --test --test-concurrency=1 --test-timeout=60000 test/chat-workbench-ai-assist.e2e.mjs test/chat-workbench-send.e2e.mjs`：2/2 通过，确认 AI辅助必须人工触发且人工发送入口仍可用。
- `git diff --check`：通过。

## 最终 Mac x64 App 验收

- 最终成品为 [`dist/聊单助手1.9.4-x64/mac/聊单助手 1.9.4.app`](dist/聊单助手1.9.4-x64/mac/聊单助手%201.9.4.app)，没有生成 ZIP。包内版本为 `1.9.4`，可执行文件为 `Mach-O 64-bit executable x86_64`。
- 从该 App 实际直接启动的生产模式隔离验收记录在 [`artifacts/workbench-drag-1.9.4/app-verification.json`](artifacts/workbench-drag-1.9.4/app-verification.json)：`packaged=true`、版本 `1.9.4`、`arch=x64`、`errors=[]`、`fictionalClient=true`、`realMessagesSent=0`、`realAiCalls=0`。
- 820×640 成品中品牌矩形为 x=104..211，状态 pill 为 x=227..304，边界不相交且相隔 16 px；版本徽标为 `display:none`，短状态为“已连接”。1280×820 与 1440×1000 中版本徽标均为 `display:block`，完整 WhatsApp 状态文案可见。已人工查看成品截图：[`820×640`](artifacts/workbench-drag-1.9.4/workbench-drag-820x640.png)、[`1280×820`](artifacts/workbench-drag-1.9.4/workbench-drag-1280x820.png)、[`1440×1000`](artifacts/workbench-drag-1.9.4/workbench-drag-1440x1000.png)。
- 最终包的真实 macOS `CGEvent` 原生拖动均保持窗口尺寸不变：1280×820 左／右各移动 `+44,+20`；820×640 左／右各移动 `+44,+31`；1440×1000 从业务页返回及关闭模态后各移动 `+44,+31`。状态控件、三种顶部模式和父级拖动片段不相交；模态打开时拖动停用、关闭后恢复。
- 该最终 App 已再以正常资料目录直接启动并置于前台，进程为 `聊单助手 1.9.4`。本次只启动正常 App，没有读取、输出、修改或发送任何真实 WhatsApp、客户或订单资料。

## 工作台整页基准状态

- **D-109 窄窗口顶栏品牌／WhatsApp 状态：通过。**
- **D-108 顶部原生拖动：回归通过。**
- **工作台整页完整基准：未核验。** 历史手机底部 P1–P4、其它工作台业务区域和其它页面完整基准不在本轮范围，不能视为通过。
