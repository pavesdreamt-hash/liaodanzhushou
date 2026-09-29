# 商品图片与商品概览卡阅读尺寸 — 2.1.6 验收记录

日期：2026-09-25

## 本次修复目标

- 加宽商品详情“商品图片”卡片，并让主图和缩略图更易阅读。
- 加宽商品库存右侧“商品概览”外卡。
- 不改变卡片内部字段、图片完整显示、图片采集、缩略图切换或任何业务规则。

## 实现边界

- 桌面宽度的详情图片列为 `380 px`，中等窗口为 `300 px`；主图为 `240 px` 正方形，图片仍为 `object-fit: contain`，不会裁切、拉伸或写回网站。
- 缩略图带及前／后切换按钮只同步放大视觉尺寸；图片数量、顺序、缓存、补采和严格小于 `500 KiB` 的限制不变。
- 商品库存概览外卡在常用桌面宽度为 `340 px`，中等窗口为 `300 px`；图片、商品编号、四格资料、状态、详情入口及产品简介的顺序和紧凑布局不变。
- 保护 1280×820 五列直显、820×640 表格横向滚动、两款有库存上限、所有 ShopPlus 只读边界，以及订单、客户、WhatsApp、AI 与正常资料。

## 实际隔离验收

最终固定 Mac x64 App 从 `dist/聊单助手.app` 直接启动，并在临时隔离资料目录中注入两款虚构有库存商品：一款使用小于 `500 KiB` 的虚构缓存图片，另一款使用达到 `500 KiB` 的虚构待人工确认图片。没有调用真实 ShopPlus、订单、客户、WhatsApp 或 AI。

- 产品详情实测主图为 `240 × 240 px`，`object-fit: contain`；图片比例保持完整，未裁切。缩略图、前／后切换、达到 `500 KiB` 的待人工确认占位和只读补采均通过。
- 1280×820：商品库存继续直接显示五列；详情图片区更宽、主图与缩略图可读。820×640：库存表格继续横向滚动。1440×1000：概览外卡实测 `340 px` 宽且贴合工作区底边，内部资料顺序与底部安全距离保持不变。
- 已人工检查最终包截图：[商品详情图库 1280×820](artifacts/inventory-product-2.1.6/shopplus-product-gallery-1280x820.png) 与 [商品库存 1280×820](artifacts/inventory-product-2.1.6/inventory-1280x820.png)。
- 自动验收报告：[app-verification.json](artifacts/inventory-product-2.1.6/app-verification.json) 为 `ok=true`、`version=2.1.6`、`packaged=true`、`arch=x64`、`fictionalProducts=true`、`realShopPlusCalls=0`、`realMessagesSent=0`、`errors=[]`。
- `npm run check`、隔离源模式 `test/inventory-shopplus-products.e2e.mjs`、最终 App 验收、`codesign --verify --deep --strict`、x64 Mach-O 和 `git diff --check` 均通过。成品可执行文件 SHA-256：`23c73ad2e1a6c0812469a5e46117142397531930edcf02be40899b7ad93df37b`。

## 正常启动与范围

启动 2.1.6 前，已精确核对旧固定 App 主进程 PID `79486`。向该 PID 发送 `TERM` 并最多等待五秒后仍未退出，按用户已授权范围仅强制结束该 PID；未读取或修改正常资料。随后固定路径的 2.1.6 已正常打开，主进程 PID `89579` 持续运行。

本轮只确认图片卡与商品概览卡的阅读尺寸调整，不代表商品库存、产品详情、图片采集、订单、客户、WhatsApp、AI 或其它页面整体重新验收。不生成 ZIP；当前未到每五版本 GitHub 递交节点。
