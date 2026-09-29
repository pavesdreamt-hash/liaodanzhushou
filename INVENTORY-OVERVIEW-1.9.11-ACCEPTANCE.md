# 聊单助手 1.9.11｜商品库存概览布局验收记录

## 本次修复目标

只调整“商品库存”右侧商品概览：外层卡片延伸到工作区底部，内部资料维持紧凑排列；详情按钮不紧贴外卡底边。移除库存页的“编辑”和“商品图片”入口及其可写弹窗／图片库路径。预览图改为居中正方形完整显示，不裁切非正方形图片。

## 已核验文档与规则

- `AGENTS.md`：桌面应用必须构建可直接使用的最终成品，并直接启动。
- `CONFIRMED-UI-BASELINE.md`：D-112 的两款有货采集与 500 KiB 图片规则、D-114 的集中配置、D-115 的产品详情本机编辑继续受保护；D-116 只授权本次库存概览局部调整。
- `SHOPPLUS-PRODUCT-INVENTORY-1.9.7-ACCEPTANCE.md` 与 `SHOPPLUS-PRODUCT-DETAIL-1.9.10-ACCEPTANCE.md`：库存页只读采集与产品详情本机编辑的既有边界。

## 实现边界

- 概览卡的外框随工作区高度延伸；卡内没有使用 `space-between`、底部定位或其它会分散信息的方式。详情按钮仍紧接状态信息，且保留底部安全留白。
- 库存页不再装配图片库组件，没有“商品图片”按钮、添加、删除、预览管理或图片写入路径；也没有“编辑”按钮及库存页编辑弹窗。
- 商品名称、底价和介绍仍只可从产品详情页编辑到本机试采集记录；网站售价、库存、来源、图片和 ShopPlus 网站资料继续只读。
- 概览预览框为正方形，采用 `object-fit: contain`，只显示既有已缓存主图；空白边显示背景，不裁切或放大填充。
- 不修改两款上限、有货筛选、500 KiB 图片判断、ShopPlus 配置、产品详情数据、订单、客户、WhatsApp、AI、聊天及其他页面。

## 虚构数据验收

最终隔离验收使用两款虚构有货商品：第一款为 499 KiB 缓存主图，第二款为 500 KiB 图片待人工确认。

- 库存页只显示两款虚构有货商品；没有无货记录。
- 已缓存主图显示在正方形预览中，计算样式为 `object-fit: contain`；库存页没有“编辑”或“商品图片”入口。
- 1280×820 下概览外框与工作区底部对齐，详情按钮与卡片底边保留安全间距；820×640 下列表仍保持横向滚动。
- 进入产品详情后仍可本机编辑虚构名称、底价与介绍；全程零真实 ShopPlus／订单／客户／WhatsApp 数据操作。

## 最终 Mac x64 App 验收

- 成品已从 [`聊单助手 1.9.11.app`](dist/聊单助手1.9.11-x64/mac/聊单助手%201.9.11.app) 直接启动。包验证报告 [`app-verification.json`](artifacts/inventory-product-1.9.11/app-verification.json) 记录 `packaged=true`、`version=1.9.11`、`arch=x64`、`fictionalProducts=true`、`realShopPlusCalls=0`、`realMessagesSent=0` 与 `errors=[]`。
- 最终隔离包实测库存页没有 `#ui011-edit` 或 `.product-images-button`。缓存虚构图片的预览框计算为正方形，图片为 `object-fit: contain`；概览外卡底部与工作区底部对齐，而详情按钮与卡片底边保持至少 24 px 安全间距。
- 已人工检查最终包的 [`库存 1280×820`](artifacts/inventory-product-1.9.11/inventory-1280x820.png)、[`库存 820×640`](artifacts/inventory-product-1.9.11/inventory-820x640.png) 与 [`商品详情 1280×820`](artifacts/inventory-product-1.9.11/shopplus-product-detail-1280x820.png) 截图。1280×820 概览外卡延伸到工作区末端，信息没有被拉散；820×640 保留横向表格滚动，未出现重叠。
- `npm run check`、8 项 ShopPlus／商品库存针对性测试、最终 `.app` 直接启动验收和 `git diff --check` 均通过。`codesign --verify --deep --strict` 通过；成品为 `Mach-O 64-bit executable x86_64`，可执行文件 SHA-256：`969009c08c2ec8c05a69a2f897f279b4c16a52c0cf272976c2ed5a9166efaec3`。

## 正常运行切换与范围

交付切换前已对唯一的正常资料旧版 `1.9.10` 发出 macOS 正常退出请求，旧主进程及 helper 自行结束；没有强制终止，也没有读取或修改正常资料。随后已直接打开正常资料目录下的最终 `1.9.11`，并确认主进程及 renderer/helper 持续运行。正常资料没有用于功能验收，未重新采集商品，也没有读写真实 ShopPlus、订单、客户、WhatsApp 或聊天资料。

本轮只认定 D-116 商品库存概览局部修复通过；不代表商品库存其它行为、产品详情、网站上下架、订单、KDocs／Google、AI、聊天或退出行为完整基准通过。不生成 ZIP；按现有五版本递交节奏，本版不是 GitHub 递交节点。
