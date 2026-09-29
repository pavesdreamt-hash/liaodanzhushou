# 聊单助手 1.9.7｜ShopPlus 商品库存首批采集验收记录

## 本次修复目标

只修复“商品库存”页的首批 ShopPlus 商品只读采集。把长期占位说明收进标题旁可键盘访问的圆形问号；页面以五列表和右侧四格概览呈现商品。首次手动采集只保存库存数量大于 0 的商品，硬性限制为两款；每款只处理一张主图，只有实际原始字节数严格小于 500 KiB 才缓存，达到或超过该大小时不缓存、记录来源和原因，等待人工确认。

## 已核验文档与规则

- `AGENTS.md`：桌面应用必须交付可直接使用的最终成品，并实际启动该成品。
- `CONFIRMED-UI-BASELINE.md`：D-112 仅授权商品库存页、独立只读商品试采集、本机图片记录、必要桥接／测试、版本和交付文档；订单、KDocs／Google 同步、产品详情、WhatsApp、客户资料、网站写回和上下架均受保护。
- `COMPOSER-TRANSLATION-1.9.6-ACCEPTANCE.md`：仅作为上一版交付与运行切换的背景；本版不重做 1.9.6 的翻译功能。

## 实现边界

- 商品读取与订单读取使用同一份已安全保存的 ShopPlus 配置，但分别记录验证状态；只有 `products` 只读请求成功后，库存页才显示绿色“ShopPlus 商品读取已验证”。没有重复配置 API，也没有把订单接口的成功冒充为商品接口成功。
- 商品记录使用独立的 `orders/shopplus-product-pilot` 本机目录，不写入订单、产品档案、KDocs 或 Google 表格。网站未提供 SKU 时，按网站商品生成稳定唯一的本机“商品编号”；日常界面不制造多 SKU 概念。
- 每次手动采集只请求首批、最多两项，页面行、持久化记录和图片处理总量都受同一上限约束。无货或库存未知商品跳过且不补采；首批完成后记录为“等待核对”，不会自动追加后续商品。
- 名称、介绍和最低可报价只可保存到本机；网站售价、库存数量和来源介绍只读展示。没有调用创建、更新、删除、上架、下架或任何网站写入接口。
- 已知 `Content-Length` 达到 500 KiB 时不读取响应体；未知长度的流式下载一达到阈值立即中止。未变更来源 URL 的已验证小图或待人工确认记录会复用，不重复下载。
- 左表固定为“序号｜商品名称｜网站售价（AED）｜库存状态｜操作”；右侧固定为一张方图、商品编号／同步状态和“成本价／建议售价／最低可报价／库存数量”四格。常驻长说明未保留在页面中。

## 真实执行的检查

- `npm run check`：通过 TypeScript、Vite、共享 WhatsApp 兼容性和项目检查。
- `node --test test/shopplus-api.test.mjs test/shopplus-product-catalog.test.mjs test/inventory-shopplus-products.e2e.mjs`：8/8 通过。
  - 覆盖商品接口验证与订单接口验证分离、只读字段／分页限制、两款上限、仅有库存记录、固定编号、499 KiB 缓存、正好 500 KiB 不缓存、无 `Content-Length` 时达到阈值中止，以及库存页五列表、问号规则和 820×640 横向滚动。
- `git diff --check`：通过。
- 完整 `npm run test` 曾在本轮工作区执行，显示 402 项通过；20 项现存的订单履约测试失败均要求旧的“订单确认依据”，与本轮没有触及的订单确认逻辑有关，未扩大范围修改。

## 最终 Mac x64 App 验收

- 最终成品为 [`聊单助手 1.9.7.app`](dist/聊单助手1.9.7-x64/mac/聊单助手%201.9.7.app)，不生成 ZIP。包内 Bundle ID 为 `com.liaodan.assistant.live`、版本为 `1.9.7`；可执行文件为 `Mach-O 64-bit executable x86_64`，`codesign --verify --deep --strict` 通过。可执行文件 SHA-256：`410073743b080e16f74aa93932814af0ae96d53e25c62dea318108e1dc2ca22e`。
- 最终 `.app` 已两次从该实际路径直接启动并使用临时隔离资料验收。商品流程验收报告 [`app-verification.json`](artifacts/inventory-product-1.9.7/app-verification.json) 记录 `packaged=true`、`version=1.9.7`、`arch=x64`、`fictionalProducts=true`、`realShopPlusCalls=0`、`realMessagesSent=0`、`errors=[]`。
- 该成品内的虚构读取实际呈现恰好两款有库存商品；无货商品未出现；499 KiB 图片显示缩略图，500 KiB 图片显示“图片待人工确认”且没有图片数据；商品读取状态只在虚构读取成功后变绿。页面问号实际显示库存筛选、两款上限和 500 KiB 规则。
- 已人工查看最终包的 [`1280×820`](artifacts/inventory-product-1.9.7/inventory-1280x820.png) 和 [`820×640`](artifacts/inventory-product-1.9.7/inventory-820x640.png) 截图：前者可直接显示五列，后者表格保持独立列宽并可横向滚动，未出现文字重叠。
- 第二次以生产模式的隔离浏览器工作区直接启动同一 `.app`，报告 [`browser-bridge-verification.json`](artifacts/inventory-product-1.9.7/browser-bridge-verification.json) 记录 `packaged=true`、`version=1.9.7`、`arch=x64`、`fictionalIsolatedData=true`、`realShopPlusCalls=0`、`realMessagesSent=0`、`errors=[]`。它验证库存 iframe 实际拿到商品试采集桥接；未配置／未采集时正确显示“ShopPlus 商品读取待验证”和空状态，不会伪造成功。

## 正常运行切换与未扩大范围

- 交付前先识别到正在运行的旧版 `1.9.6` 主进程；通过两次正常退出请求均未在 15 秒内结束后，按用户已授权的“先清理旧版”范围，仅向该已核对的旧主进程发送终止信号。随后确认其 App helper 与 WhatsApp/Chrome 子进程均已自行退出，未单独强制结束它们。之后直接打开正常资料目录下的最终 `1.9.7`，确认主进程及其 helper 持续运行，系统中没有旧版 App 主进程。
- 最终正常运行的 App 没有用于测试：未读取、输出、修改或发送真实 ShopPlus、客户、订单、WhatsApp 或聊天资料。所有功能验收均使用虚构商品和临时隔离资料。
- 本轮只认定 D-112 商品库存首批采集局部通过；不代表商品库存整页其它行为、产品详情、库存／商品写回、网站上下架、订单、KDocs／Google 同步、聊天工作台或其他页面完整基准通过。当前为 1.9.7，尚未到每五个版本一次的 GitHub 递交节点，因此未提交或推送。
