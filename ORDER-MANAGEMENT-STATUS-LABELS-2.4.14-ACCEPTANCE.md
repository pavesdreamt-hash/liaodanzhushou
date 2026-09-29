# 订单管理状态中文化｜2.4.14 验收

## 本轮范围

仅变更订单管理表格“状态”列的显示文本与轻量色标。筛选、分页、列宽／顺序、详情、草稿删除和订单资料未改变。

## 已核验

- 内部状态 `unshipped`、`shipped_pending` 等不再直接显示；对应中文为“待发货”“待收货”等。
- 状态色仅为浅色标签：待处理浅黄、运输中浅蓝、已签收浅绿、异常／取消浅红。
- 1280×820 截图中状态、全部原有列和“订单详情”入口可同时读取。
- 小窗口继续使用既有表格横向滚动，没有压缩列宽或重排表格。

## 检查与成品

- `npm run check`：通过。
- `test/v100-business-dashboard.test.mjs`：7/7 通过。
- 源码与固定 App 的 `test/orders-management-ui.e2e.mjs`：各 1/1 通过。
- `git diff --check`、固定 App 与 ZIP 解压副本的签名和隔离启动自检：通过。
- 固定 Mac x64 App：`dist/聊单助手.app`
- ZIP：`dist/聊单助手-2.4.14-mac-x64.zip`
- App SHA-256：`cf8bfa9f33c81cf0f2f1e9d2aa345444da71b22c8550a56db9ed14cc4267e750`
- ZIP SHA-256：`e62892ddf9fd2ec35ed7c94558c022caf26ccb1f955469b79f403a96eb635511`

这只是订单管理状态列的局部验收，不代表订单管理整页或其它页面重新完整验收。
