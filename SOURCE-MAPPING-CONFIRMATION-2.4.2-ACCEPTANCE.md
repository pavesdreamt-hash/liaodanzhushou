# 来源资料与 ShopPlus 商品逐条确认表 — 2.4.2 验收记录

范围仅限“商品库存 → 来源资料”的候选确认表和本机映射未确认语义。没有采集、同步、融入、库存写入、上下架或外部资料写入。

## 已验证

- 版本：`2.4.2`；固定成品：`dist/聊单助手.app`；Mac x64。
- 表格分列展示来源资料、候选网站商品、ShopPlus 商品 ID、规格 ID、网站库存、匹配依据和操作。
- `SP-…` 本机追踪键不会作为网站编号展示、输入或要求人工确认。
- 网站后台入口由只读 ShopPlus 商品 ID 生成；规格 ID 仅作为自动归属／库存定位核验信息。
- “确认对应”必须由用户点选；未点选的候选保存其它行后仍待确认。
- 勾选多条可批量标记待保存确认。
- “不对应”保存后转为待选择网站商品；替换只能从本机已采集目录中选择，重复商品不可选择。
- 1280×820 与 820×640 均在隔离 Electron 成品中验证；窄窗口使用表格自身横向滚动。

## 自动核验

- `npm run check`：通过。
- `node --test --test-timeout=30000 test/real-evidence.test.mjs test/shopplus-product-catalog.test.mjs`：23/23 通过。
- 源码与最终包的 `test/inventory-shopplus-products.e2e.mjs`：通过。
- `codesign --verify --deep --strict dist/聊单助手.app`：通过。
- `file`：`Mach-O 64-bit executable x86_64`。
- `git diff --check`：通过。

## 未重验范围

来源资料登录／同步、价格融入、上架／下架建议、商品库存、产品详情、订单、聊天和 AI 均未随本次局部确认表改动重新做整页验收。
