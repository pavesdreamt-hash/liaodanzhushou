# 2.5.3 每日核算连续日期验收

范围仅为“利润核算 → 每日核算明细”的连续日期与补录入口。

- 近 7 天、近 30 天与本月按自然日连续列出。
- 无订单且无日成本的日期显示“未登记”和“登记成本”，金额保持“—”。
- 点击“登记成本”只选择成本表单日期；没有写入每日成本或订单。
- 已保存成本的日期仍保留“查看详情”。

验证：

- `npm run check` 通过。
- `node --test --test-concurrency=1 --test-timeout=60000 test/profit-calendar-days.e2e.mjs test/v100-business-dashboard.test.mjs`：8/8 通过。
- 固定 `dist/聊单助手.app` 的隔离 Electron 回归：1/1 通过。
- 新解压 ZIP 的隔离 Electron 回归：1/1 通过。
- 固定 App 与解压 App 的 `codesign --verify --deep --strict` 通过；均为 `2.5.3`、x64。

成品：

- `dist/聊单助手.app`
- `dist/聊单助手-2.5.3-mac-x64.zip`

本轮没有读取或写入 ShopPlus、WhatsApp、KDocs、Google 或其它外部平台；验收数据均为隔离虚构数据。
