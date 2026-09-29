# 已确认来源映射更正｜2.4.5 验收记录

日期：2026-09-27

本次交付只处理“商品库存 → 来源资料”中已保存映射的人工误确认更正。已确认行现在显示“更正对应”和“取消确认”：前者从已采集的网站商品中选定正确项并标记为待保存，后者标记为待选择网站商品。两种操作都不会立即写入；只有点击“保存本机确认结果”才修改本机映射。

验证通过：

- `node --test --test-timeout=30000 test/plan.test.mjs`：7/7，其中包含已保存映射必须明确更正或取消的回归。
- `npm run check`：TypeScript、UI 构建、共享兼容与项目检查通过。
- `node --test --test-timeout=120000 test/inventory-shopplus-products.e2e.mjs`：1/1，通过已确认行打开更正选择器、取消确认仅标记待保存、保存后才写入的隔离 Electron 验收。
- `git diff --check`：通过。
- 成品 `dist/mac/聊单助手.app`：ad-hoc 签名的 `codesign --verify --deep --strict` 通过；主程序为 x64 Mach-O；使用隔离临时资料启动自检返回 `ok=true`、`packaged=true`、`version=2.4.5`、`schemaVersion=26`。

成品主程序 SHA-256：`a4d42d8da05e63f804c573b94764db84500f30f07df1d06bdb09fce2d8a0a54c`。

保留了原固定路径 `dist/聊单助手.app` 的 2.4.4 应用，未移动或删除。新成品位于 `dist/mac/聊单助手.app`；本轮没有读取来源资料或图片，也没有写入来源表、Google、KDocs 或 ShopPlus。
