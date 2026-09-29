# 2.1.7 报单核对只读资料与英文 TXT：验收记录

验收日期：2026-09-26
交付物：`dist/聊单助手.app`（Mac x64，版本 2.1.7）
范围：仅聊天工作台右侧“报单 TXT → 核对订单”弹窗与生成的报单 TXT。

## 修复目标

- 报单号遵循 `月.日-当天序号`，例如 `9.22-5`；它是唯一允许在核对弹窗编辑的值。
- 客户、地址与商品资料仅供核对，必须只读；不再提供弹窗内“编辑商品明细”。
- 详细地址下放置 `Google Address` URL；商品仅列出 Product Name、Quantity、Price。
- TXT 固定标题和列头使用英文，保留客户原始资料值，不把电话号码并入 Report No.。

## 真实验收

从最终 App 的独立临时资料目录直接启动，创建并激活一笔完全虚构订单：客户 `Fictional Report Customer`、商品 `FIC-REPORT`、数量 `2`、单价 `AED 125.00`。

- 弹窗中仅 `Report No.` 不是只读；7 个客户／地址输入框均为只读。
- 默认号显示为 `9.25-1`；输入 `9.22-5` 并点击“订单确认”后，本机报单号更新，报单卡显示“已核对 ✓”。
- 确认前后客户对象完全相同；没有客户、地址或商品写入路径。
- Google Address 出现在 Detailed Address 后方；长 URL 单行截断，无横向溢出。
- Product Name、Quantity、Price 三列实际分别显示 `FIC-REPORT`、`2`、`AED 125.00`。
- TXT 针对性单元验收确认英文固定字段、单独的 Report No.、Google Address 和三列商品行。

最终包截图：[report-review-dialog-final.png](artifacts/report-review-2.1.7/report-review-dialog-final.png)。

## 核验命令与结果

- `npm run check`：通过。
- `node --test --test-concurrency=1 --test-timeout=60000 test/chat-workbench-report-card.e2e.mjs`：通过。
- `node --test --test-name-pattern='订单确认并人工核对地址后整单生成一份UTF-8 TXT并保持阿拉伯文原文' test/fulfillment-app.test.mjs`：通过。
- 对最终包执行同一报单弹窗 Electron 回归：通过，且断言 `packaged=true`、`version=2.1.7`、`arch=x64`。
- `codesign --verify --deep --strict dist/聊单助手.app`：通过。
- 最终可执行文件：x86_64 Mach-O；SHA-256 `5916b279b2cabbf4df8e5f9c5b181865f367b6347dc74d120b63c9f204dbb307`。
- `git diff --check`：通过。

## 数据与范围规则

验收使用临时隔离目录、虚构订单、虚构客户、虚构商品和本地会话处理器；没有 ShopPlus 网络请求、WhatsApp 读取／发送或正常资料访问。没有生成 ZIP，没有提交或推送 GitHub。本记录只验收 D-133；聊天工作台整页、其它订单编辑、ShopPlus、WhatsApp 和其它页面均未因此重新验收。

交付后，已从固定路径直接打开正常资料目录下的最终 App，并确认主进程 PID `21726` 持续运行；只核对进程与路径，未读取或改动正常资料。
