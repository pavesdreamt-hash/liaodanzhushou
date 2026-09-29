# 2.1.9 来源库存资料融入商品：验收记录

交付物：`dist/聊单助手.app`（Mac x64，版本 2.1.9）
范围：商品库存页的“采集来源资料”、本机 ShopPlus 两商品记录，以及产品详情中既有成本价／建议售价的只读显示。

## 本次实现

- 保留“打开来源库存表”，并新增明确的“采集来源资料”动作。
- 该动作只读取已经写入本机 `LocalInventoryStore.current.products` 的来源库存资料；不打开 KDocs、不触发 KDocs／Google 同步、不读取或写入来源表，也不写回 ShopPlus。
- 仅将来源表的成本价、建议售价融入本机 ShopPlus 商品资料。优先使用商品编号、ShopPlus SPU 或远端商品 ID 的唯一精确匹配；没有编号匹配时才接受唯一同名精确匹配。
- 重复／不匹配项不会猜测写入，会保留原有本机价格并标记待人工匹配。每项保留本机时间、匹配方式和来源编号／名称。
- 商品库存右侧概览与产品详情的成本价、建议售价继续是只读资料；网站售价、库存、图片、介绍、底价和网站数据未改动。

## 隔离虚构验收

- 目录单元回归 `test/shopplus-product-catalog.test.mjs`：6/6 通过。用两款虚构有库存商品验证编号规范化精确匹配、唯一同名精确匹配、AED 金额解析、匹配记录，以及重复同名时不写错资料、保留已有本机价格。
- 源模式 `test/inventory-shopplus-products.e2e.mjs`：通过。虚构界面中“采集来源资料”在已采集两款商品后才可点击；点击一次将成本价 `AED 100.00`、建议售价 `AED 200.00` 显示到右侧概览和产品详情，并保留“商品编号精确匹配”核对说明。
- 最终固定 App 使用同一隔离虚构回归：通过。实际加载 `dist/聊单助手.app/Contents/MacOS/聊单助手`；未发生真实 ShopPlus、KDocs、Google、订单、客户、WhatsApp 或 AI 读取／写入。
- 1280×820 最终 App 截图已人工检查：[final-app-inventory-source-pricing-1280x820.png](artifacts/source-pricing-2.1.9/final-app-inventory-source-pricing-1280x820.png)。顶部四项操作仍完整可见；来源资料状态和两项价格均可读。针对性回归亦继续验证 820×640 的横向表格、产品详情返回、图片缓存边界和两款上限。

## 构建与完整性

- `npm run check` 通过。
- `git diff --check` 通过。
- `electron-builder --mac dir --x64` 已构建固定 App；`codesign --verify --deep --strict` 通过，主程序为 `Mach-O 64-bit executable x86_64`。
- 最终可执行文件 SHA-256：`41dc889e7b9d65de166ca973fa1f4884de858260aa5ebeedac9d7847fa155ac1`。

本条只确认来源库存资料本机融入的局部功能；商品库存、产品详情和其它页面整页仍未重新验收。未生成 ZIP，当前不是 GitHub 五版本递交节点。
