# 2.2.2｜订单数据库迁移签名兼容验收

## 修复目标

修复恢复订单备份时把有效数据库错误提示为“订单数据库迁移签名无效”的问题；保持未知或不完整迁移数据库仍被拒绝。

## 根因与边界

迁移签名校验曾维护一份独立、硬编码的名称清单，清单止于第 25 次迁移，而正式迁移清单已含第 26 次 `shopplus_order_sync_attention`。此外，已发布的第 25 版使用 `v824_business_dashboard`，现行迁移名称为 `business_dashboard_v1`，两者对应同一正式结构。

修复后校验名称直接来自 `ORDER_MIGRATIONS`，仅保留一个已核实的历史别名。未知名称、跳号、未来版本、结构缺失和身份异常仍会拒绝；验证阶段不修改备份原文件。

## 实际验收

- 虚构数据库单元回归：`node --test --test-timeout=30000 test/order-data-protection.test.mjs`，`8 / 8` 通过。
- 虚构隔离 Electron 恢复回归：`node --test --test-concurrency=1 --test-timeout=90000 test/order-data-protection.e2e.mjs`，`1 / 1` 通过。实际选择并恢复第 25 版别名数据库，副本升级至第 26 版。
- 最终固定 App：`node scripts/verify-order-data-protection-package.mjs dist/聊单助手.app`，`1 / 1` 通过。报告确认 `version=2.2.2`、`directAppArtifact=true`、`fictionalIsolation=true`、`realOrdersRead=0`、`realOrdersWritten=0`，并验证当前第 26 版接受、历史别名接受、未知名称拒绝和隔离恢复升级。
- `npm run check`、`codesign --verify --deep --strict`、x64 Mach-O 检查、包内版本和 `git diff --check` 通过。

## 交付与限制

最终交付为 Mac x64 App：`dist/聊单助手.app`；不生成 ZIP。本轮不改页面，也不重新验收订单管理、连接与设置或其它页面。正常资料目录只用于最终 App 启动确认；功能验收使用临时隔离、完全虚构的数据库，未读取或写入真实订单、客户、ShopPlus、WhatsApp 或 AI 资料。
