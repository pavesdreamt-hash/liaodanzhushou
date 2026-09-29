# 聊单助手 1.9.8｜订单详情利润核算验收记录

## 本次修复目标

- 在订单详情“配送与包裹”后恢复真实的“履约与回款／利润核算”卡。
- 只读取现有订单详情字段：商品成交额、商品成本、已确认实际物流费、最终订单利润、包裹履约结果、已登记净回款和登记日期。
- 严格区分 AED 订单利润与 CNY 净回款；未确认物流费、缺成本、未回款或未完成履约时显示准确待确认状态，不补零金额或示例金额。
- 保持 D-104：不恢复订单详情快捷回复、客户聊天、手机框、聊天输入区或关联真实聊天入口。

## 实现范围

- `ui/src/order-business.ts` 以现有 `orders:detail` 返回的真实字段动态构建只读利润卡；草稿明确提示尚未进入核算。
- `ui/src/order-business.css` 仅添加利润卡、状态、两栏信息和四格金额的响应式样式。
- 订单页与订单管理页不再执行确认稿遗留的演示脚本；确认稿 HTML 继续只提供视觉外壳，真实订单读取与交互仍由当前渲染器接管。这样消除了进入订单详情路径上两个无效演示控件产生的页面错误，不改变订单管理的真实列表、筛选、导入或数据。
- 未新增回款登记、物流费确认、履约状态修改、发送、跳转或任何网站写入操作。

## 虚构数据验收

所有验收均在临时隔离资料目录中进行，不读取、修改或发送真实客户、订单、ShopPlus 或 WhatsApp 数据。

1. 虚构已结算订单 `PACKAGE-PROFIT-FINAL-001`：商品成交 AED 100.00、成本 AED 20.00、已确认物流费 AED 5.00、最终订单利润 AED 75.00、已登记净回款 CNY ¥320.00、登记日 2026-09-25。最终 App 页面逐项显示这些真实详情字段。
2. 虚构待确认订单 `PACKAGE-PROFIT-WAIT-001`：已签收但未确认物流费、未登记回款。页面显示“待确认物流费”“待确认”“待回款”，不显示 AED 0.00 或“已完成核算”。
3. 两种虚构订单均验证利润卡内没有 `input`、`button`、`textarea` 或 `select`；不含确认稿的 `AED 12.00`、`AED 150.00` 或演示客户资料。
4. D-104 回归：订单阶段卡、客户／商品双卡、商品视觉、订单合计和配送地图保留；订单详情聊天相关 DOM 为 0；返回工作台后聊天区、输入区和快捷回复入口仍存在。

## 最终成品验收

- 成品路径：[`聊单助手 1.9.8.app`](dist/聊单助手1.9.8-x64/mac/聊单助手%201.9.8.app)
- 最终包直接从该 `.app` 启动的报告：[`app-verification.json`](artifacts/order-detail-profit-package-1.9.8/app-verification.json)，记录 `packaged=true`、`version=1.9.8`、`arch=x64`、`errors=[]`、`realShopPlusCalls=0`、`realMessagesSent=0`。
- 已人工查看最终包截图：已结算订单 [`1280×820`](artifacts/order-detail-profit-package-1.9.8/order-detail-profit-1280x820.png)、[`1440×1000`](artifacts/order-detail-profit-package-1.9.8/order-detail-profit-1440x1000.png)；待确认订单 [`1440×1000`](artifacts/order-detail-profit-package-1.9.8/order-detail-profit-pending-1440x1000.png)。利润卡在常用宽度下两栏对齐、四格金额完整，无重叠或截断。
- `npm run check`、订单详情确认稿回归 E2E、利润卡 E2E、最终包直接启动验收和 `git diff --check` 通过。
- `codesign --verify --deep --strict` 通过；可执行文件为 `Mach-O 64-bit executable x86_64`。最终可执行文件 SHA-256：`4d7762d4f084ea06e1ac310aae2e7ac7d8b7485d103fa8ee2c6f159eaf504746`。
- 交付前，以 macOS 正常退出路径关闭唯一的旧 1.9.7 主进程，确认其受管 helper 与 WhatsApp/Chrome 子进程自行退出；未单独终止它们。之后已直接启动正常资料目录下的 1.9.8，并确认其主进程持续运行。正常资料没有用于上述验收。

## 边界

本轮只认定 D-113 订单详情利润核算局部修复通过；不代表订单详情整页、利润核算页、订单管理、库存、ShopPlus 接口、聊天工作台或其他页面的完整业务／视觉基准通过。未生成 ZIP。当前为 1.9.8，尚未到每五个版本一次的 GitHub 递交节点。
