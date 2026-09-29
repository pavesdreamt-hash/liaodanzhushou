# 聊单助手 1.9.13｜ShopPlus 产品详情阅读验收记录

## 本次修复目标

只修复 ShopPlus 产品详情的阅读问题：主图收为常规居中预览；把网站介绍中包含的网页格式转换为可阅读的段落和列表，而不是显示格式标签。

## 已核验文档与规则

- `AGENTS.md`：桌面应用必须构建可直接使用的最终成品，并直接启动。
- `CONFIRMED-UI-BASELINE.md`：D-112 的两款有货／500 KiB 图片规则、D-115 的详情跳转和本机编辑、D-116 概览、D-117 列表继续受保护；D-118 只授权本次详情阅读局部调整。
- `SHOPPLUS-PRODUCT-DETAIL-1.9.10-ACCEPTANCE.md`：详情只读网站资料与本机编辑边界继续有效。

## 实现边界

- 主图仅改变详情页显示尺寸和 `contain` 行为；没有重新采集、下载、删除或写入图片。
- 来源介绍原始值继续保留在本机 `sourceLongDescription`／`sourceShortDescription` 字段；界面展示时转换为正常文本、段落和项目符号，不把格式标签或脚本内容作为正文。
- 产品名称、底价和介绍仍只可从详情页编辑到本机；网站售价、库存、图片、来源和 ShopPlus 网站资料继续只读。
- 不读取真实商品、订单、客户或 WhatsApp 资料；所有验证使用隔离虚构数据。

## 最终 Mac x64 App 验收

- 成品已从 [`聊单助手 1.9.13.app`](dist/聊单助手1.9.13-x64/mac/聊单助手%201.9.13.app) 直接启动。最终包报告 [`app-verification.json`](artifacts/inventory-product-1.9.13/app-verification.json) 记录 `packaged=true`、`version=1.9.13`、`arch=x64`、`fictionalProducts=true`、`realShopPlusCalls=0`、`realMessagesSent=0` 与 `errors=[]`。
- 隔离虚构主图的详情预览在 1280×820 和 820×640 下均为不超过 176 px 的正方形，计算样式为 `object-fit: contain`；主图和单张缩略图均未随左卡铺满，非正方形图片可保留背景空白。
- 虚构网站介绍包含 `<h2>`、`<p>`、`<ul><li>`、`<strong>`、`&nbsp;` 与 `<script>`。详情中实际显示为“KY40 产品介绍”、正常段落和两条项目符号；没有显示 HTML 标签或脚本内容。目录测试确认原始 HTML 仍保留于 `sourceLongDescription`，展示转换不会改写来源字段；前端还兼容已在旧版本保存的格式化介绍记录。
- 已人工检查最终包的 [`产品详情 1280×820`](artifacts/inventory-product-1.9.13/shopplus-product-detail-1280x820.png) 和 [`产品详情 820×640`](artifacts/inventory-product-1.9.13/shopplus-product-detail-820x640.png) 截图。图片、缩略图、产品资料和介绍内容没有重叠；详情本机编辑名称、底价和介绍后，虚构网站售价仍为 AED 300，返回库存仍显示同一批两款商品。
- `npm run check`、9 项 ShopPlus／商品库存／详情针对性测试、最终 `.app` 直接启动验收和 `git diff --check` 均通过。`codesign --verify --deep --strict` 通过；成品为 `Mach-O 64-bit executable x86_64`，可执行文件 SHA-256：`026eb2ca8bcdb001c7b2d88ed8addf904890a462842845620a75ac4a0eb324af`。

## 正常运行切换与范围

交付切换前，对唯一正常资料旧版 `1.9.12` 发出 macOS 正常退出请求；15 秒内其主进程仍持续运行。按用户已授权的“启动新版前清理旧版”范围，只对该已核对主进程发送一次 `TERM`，随后确认旧主进程退出，再直接打开正常资料目录下的最终 `1.9.13` 并确认其主进程持续运行。正常资料没有用于功能验收，未读写真实 ShopPlus、订单、客户、WhatsApp 或聊天资料。此次正常退出未响应是运行切换的观察记录，不是本轮产品详情范围内的退出修复验收。

本轮只认定 D-118 产品详情图片与介绍阅读局部修复通过；不代表产品详情其它行为、退出行为、商品库存、网站上下架、订单、KDocs／Google、AI、聊天或其它页面完整基准通过。不生成 ZIP；按现有五版本递交节奏，本版不是 GitHub 递交节点。
