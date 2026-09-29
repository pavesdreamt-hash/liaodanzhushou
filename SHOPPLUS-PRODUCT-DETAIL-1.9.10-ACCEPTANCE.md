# 聊单助手 1.9.10｜ShopPlus 商品详情验收记录

## 本次修复目标

修复商品库存右侧“进入产品详情页”只显示提示、不能打开所选商品的问题。入口现在必须打开当前 ShopPlus 试采集商品的实际本机详情，而不是旧产品档案、确认稿演示资料或阻断提示。

## 已核验文档与规则

- `AGENTS.md`：桌面应用必须交付可直接使用的最终成品，并实际启动该成品。
- `CONFIRMED-UI-BASELINE.md`：D-112 的两款有货采集和 500 KiB 图片限制继续受保护；D-114 的集中安全配置保持；D-115 只授权本次“库存 → ShopPlus 试采集详情”局部修复。
- `SHOPPLUS-PRODUCT-INVENTORY-1.9.7-ACCEPTANCE.md`：首批商品只读采集、主图缓存和本机编辑的既有边界。
- `SHOPPLUS-CENTRAL-CONFIG-1.9.9-ACCEPTANCE.md`：订单与商品读取复用集中安全配置，但验证状态独立。

## 实现边界

- 详情读取当前本机 `shopplus-product-pilot` 记录；不会落入旧产品档案读取路径，也不会带入旧本机图片库入口。
- 详情展示商品名称、唯一商品编号、网站售价、库存数量、产品介绍及已缓存主图。主图只有在既有采集已确认小于 500 KiB 时显示；待人工确认或未缓存时准确说明原因。
- “编辑资料”只可写本机商品名称、底价和介绍；网站售价、库存、主图、来源、上架／下架和 ShopPlus 网站资料只读。
- “返回库存”回到同一批已采集商品。没有新增商品采集、没有重读网站、没有 ShopPlus 写入、没有订单／客户／WhatsApp／AI 操作。

## 虚构数据验收

使用临时隔离资料与两款虚构有货商品：第一款含 499 KiB 缓存主图、网站售价 AED 300、库存 20 和虚构介绍；第二款为 500 KiB 主图待人工确认记录。

验收覆盖：

- 商品库存保留恰好两款虚构有货商品，点击右侧“进入产品详情页”打开第一款的真实详情；详情显示其名称、唯一编号、主图、介绍、网站售价和库存。
- 详情页不出现旧本机图片库入口；“返回库存”回到同一批两款记录。
- 在详情页修改虚构名称与介绍后，只变更虚构本机记录；虚构网站售价仍为 AED 300，未发生网站写入。
- 全程零真实 ShopPlus 调用、零真实订单／客户／WhatsApp 数据读取或写入、零真实消息发送。

## 最终 Mac x64 App 验收

- 成品已从 [`聊单助手 1.9.10.app`](dist/聊单助手1.9.10-x64/mac/聊单助手%201.9.10.app) 直接启动。包验证报告 [`app-verification.json`](artifacts/inventory-product-1.9.10/app-verification.json) 记录 `packaged=true`、`version=1.9.10`、`arch=x64`、`fictionalProducts=true`、`realShopPlusCalls=0`、`realMessagesSent=0` 与 `errors=[]`。
- 最终包的虚构验收实际完成“库存 → 所选商品详情 → 本机编辑 → 返回库存”：详情显示唯一商品编号、网站售价、库存、介绍和已缓存主图；本机编辑后虚构网站售价保持 AED 300。详情入口没有再显示原来的阻断提示，也没有调用旧产品档案／图片库。
- 已人工查看最终包的 [`商品详情 1280×820`](artifacts/inventory-product-1.9.10/shopplus-product-detail-1280x820.png)、[`库存 1280×820`](artifacts/inventory-product-1.9.10/inventory-1280x820.png) 和 [`库存 820×640`](artifacts/inventory-product-1.9.10/inventory-820x640.png) 截图。详情标题、字段、只读标识与返回按钮没有重叠；窄窗口仍由库存表横向滚动保持独立列。
- `npm run check`、8 项 ShopPlus／商品库存针对性测试、最终 `.app` 直接启动验收和 `git diff --check` 均通过。`codesign --verify --deep --strict` 通过；成品为 `Mach-O 64-bit executable x86_64`，可执行文件 SHA-256：`e7bec506fe76c6e41a41edf3f70c32e0dbb1e918bb7adb58f2642de3088ae8fa`。

## 正常运行切换与范围

交付切换前已对唯一的正常资料旧版 `1.9.9` 发出 macOS 正常退出请求，旧主进程与 helper 均自行结束；没有强制终止、没有读取或修改正式资料。随后已直接打开正常资料目录下的最终 `1.9.10`，并确认主进程及 renderer/helper 持续运行。正常资料没有用于功能验收，未重新采集商品，也没有读写真实 ShopPlus、订单、客户、WhatsApp 或聊天资料。

本轮只认定 D-115 的库存到 ShopPlus 试采集详情局部修复通过；不代表商品库存整页、产品详情的其它路径、网站上下架、订单、KDocs／Google、AI、聊天或退出行为完整基准通过。不生成 ZIP；按现有五版本递交节奏，本版不是 GitHub 递交节点。
