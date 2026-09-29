# 聊单助手 2.1.3｜当前功能验收审计

## 本次目标

按用户要求清点此前仍被称作“未验收”或“断言失败”的项目，只处理两类：当前仍需的功能，或已经无入口的历史遗留。不属于这两类的页面和代码不修改。

## 审计结论

| 项目 | 结论 | 本次处理 |
| --- | --- | --- |
| 1.0.12 手机底部 P1–P4 | 历史遗留，不是当前功能 | 当前正式路由只使用 `#chat-workbench-desktop`；旧 `#chat-workbench-aligned` 模板、对应旧 DOM 测试和未导入演示重建文件均无入口，已删除。历史基准记录保留。 |
| 商品概览外层卡片到底部 | 当前必要功能 | 源模式曾真实失败；修复工作区子卡高度约束，并在 820 px 高度保留详情按钮至少 24 px 安全间距。 |
| 库存最终包验收 | 当前必要验收 | 脚本原本错误指向旧版本号 App 目录，已改为固定 `dist/聊单助手.app`。 |
| 菜单栏打开／退出 | 当前必要功能 | 浏览器工作区隔离验收发现关闭后可能被重复 macOS 激活事件重显；抑制期内现忽略全部重复激活，菜单栏“打开管理页面”和“退出”语义不变。 |
| `inboxWasOnline`、未使用模板导入 | 已证实冗余 | 已移除；在线轮询继续每 10 秒直接刷新会话列表。 |
| 历史记录中“本轮未重验整页” | 旧交付范围说明 | 保留审计记录，不把它误报为当前缺陷，也没有据此修改其它页面。 |

## 实际验收

- `npm run check` 通过（TypeScript、UI 构建、共享兼容检查、项目检查）。
- 隔离虚构数据源模式：`test/inventory-shopplus-products.e2e.mjs` 通过；验证 2 款有库存商品、卡片底部、详情跳转、图片 500 KiB 规则、1280×820 与 820×640。
- 隔离虚构数据源模式：`test/main-window-lifecycle.e2e.mjs` 连续运行两次均 3/3 通过；覆盖关闭隐藏、激活恢复和菜单栏退出。
- 固定最终 Mac x64 App：`verify-inventory-product-package.mjs` 通过，`errors=[]`、`realShopPlusCalls=0`、`realMessagesSent=0`。
- 固定最终 Mac x64 App：`verify-chat-counters-package.mjs` 通过，`errors=[]`、`realWhatsAppReads=0`、`realMessagesSent=0`。
- 最终 App：`dist/聊单助手.app`，包内版本 `2.1.3`，x64 Mach-O，`codesign --verify --deep --strict` 通过；可执行文件 SHA-256 为 `4cbf35bc7494295e7840e9e3c325cf265ea144970a0e468c49cd8b15f3be72d0`。

本轮不生成 ZIP，不读取、标记、发送或写入真实 WhatsApp、ShopPlus、客户或订单资料。
