# ShopPlus 两款产品图片补采与详情图库 — 2.0.11 验收

日期：2026-09-25
范围：仅当前已保存的 `001 Sakura Cave`、`002 Dual-Ended Gen 2` 的图片补采与 ShopPlus 产品详情图库。

## 实现边界

- 首批“采集商品（最多 2 款）”仍只保存每款主图；产品详情中的“补采图片”才读取同一页的两款已有商品。
- 补采只调用 ShopPlus `products` 只读列表接口，第一页固定为两款，只按已有远端商品 ID 匹配；不新增商品，也不调用任何网站写接口。
- 每张图片独立执行严格小于 `500 KiB` 的缓存限制。超限、格式不支持或读取失败不会生成假预览，只保留准确的待人工确认／未缓存记录。
- 详情页显示居中、完整显示的 `176 px` 内主图，紧凑横向缩略图带及前／后切换；库存页仍只使用第一张可用主图。
- 视频、网站图片增删、价格／库存／介绍／上下架写回、订单、客户、WhatsApp 与 AI 均不在本轮范围。

## 隔离最终包验收

使用固定 Mac x64 App：

```sh
INVENTORY_PRODUCT_APP_PATH="$PWD/dist/聊单助手.app" node scripts/verify-inventory-product-package.mjs
```

结果：通过。报告 [app-verification.json](artifacts/inventory-product-2.0.11/app-verification.json) 为 `ok=true`、`version=2.0.11`、`packaged=true`、`arch=x64`、`directAppArtifact=true`、`fictionalProducts=true`、`realShopPlusCalls=0`、`realMessagesSent=0`、`errors=[]`。

- 使用隔离虚构两商品；补采只请求一页两款，不新增商品。
- 实际覆盖缓存主图、缓存附图、达到或超过 500 KiB 的待确认占位、缩略图切换、前／后循环切换、返回库存以及 1280×820／820×640。
- 已人工检查 [1280×820 图库截图](artifacts/inventory-product-2.0.11/shopplus-product-gallery-1280x820.png)：主图尺寸、横向缩略图、箭头、图片计数与待人工确认占位均可读。
- `npm run check` 通过；`node --test test/shopplus-product-catalog.test.mjs` 为 `5/5`；`codesign --verify --deep --strict`、x64 Mach-O、`git diff --check` 通过。

源模式 `test/inventory-shopplus-products.e2e.mjs` 在新增图库检查之后仍遇到既有的“概览外层卡片随工作区延伸到底部”断言失败。这是 D-124 已记录的库存整页断言，不属于本轮图库变更；不能把此次局部通过写成库存／产品详情整页通过。最终包的对应局部图库验收通过。

## 正常资料目录的真实只读采集

用户明确授权后，从已启动的固定 `dist/聊单助手.app` 调用一次受限补采。调用前也做了不带凭据的公开 HTTPS 与 Node 连通性检查，均可达；实际 App 调用成功后对本机持久目录回读，结果如下：

| 商品 | 网站返回 | 本机缓存 | 待人工确认 | 不可用 |
| --- | ---: | ---: | ---: | ---: |
| 001 Sakura Cave | 12 | 12 | 0 | 0 |
| 002 Dual-Ended Gen 2 | 15 | 14 | 1 | 0 |
| 合计 | 27 | 26 | 1 | 0 |

两款均为有库存，未因缺货跳过。26 个缓存文件全部严格小于 `500 KiB`，最大为 `398730` 字节；002 的 1 张超限图片没有缓存，仅保留待人工确认状态。没有新增第三款商品，没有读取或修改真实订单、客户、WhatsApp 或 AI 资料，也没有写回 ShopPlus 图片、库存、价格、介绍、上／下架或任何其它网站资料。

真实采集核验的是正常资料目录中的持久记录与图片字节边界；页面视觉截图仍由隔离虚构资料生成，因此本文件不把真实商品图库的页面视觉核验扩大为整页或整站验收。

## 交付

- 固定 App：`dist/聊单助手.app`
- 版本：`2.0.11`
- 架构：Mac x64
- 可执行文件 SHA-256：`b9ae836f1a8ec6492208edd1495cf631780f11cffd474e4012ad4786704b63e7`
- 不生成 ZIP；本次不是 GitHub 五版本递交节点。
