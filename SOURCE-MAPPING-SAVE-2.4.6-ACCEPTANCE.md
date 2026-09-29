# 来源映射保存修复｜2.4.6 验收记录

日期：2026-09-28

修复范围：已确认来源映射更正为另一个网站商品编号后，保存被旧本机库存编号误判为孤立而拒绝的问题；同时让保存中、成功或失败原因显示在“保存本机确认结果”按钮下方。

行为：当且仅当同一来源标识的已保存映射被明确改为新的非空编号时，原本机库存行会迁移到新编号，历史字段保留。目标编号已存在时仍拒绝保存，不覆盖现有库存。不会读取来源资料或图片，不会写入来源表、Google、KDocs 或 ShopPlus。

验证通过：

- `node --test --test-timeout=30000 test/plan.test.mjs`：8/8，包括“更正已保存映射会迁移同一来源的本机库存编号，不误报孤立编号”。
- `npm run check`：TypeScript、UI 构建、共享兼容和项目检查通过。
- `node --test --test-timeout=120000 test/inventory-shopplus-products.e2e.mjs`：1/1，通过来源映射确认／保存隔离 Electron 回归。
- `git diff --check`：通过。
- 成品 `dist/mac/聊单助手.app`：ad-hoc 签名的 `codesign --verify --deep --strict` 通过；主程序为 x64 Mach-O；隔离启动自检返回 `ok=true`、`packaged=true`、`version=2.4.6`、`schemaVersion=26`。

成品主程序 SHA-256：`01002893c22709cbc3f1e9fc6f200e71813e5de4e9ffec96502572507c342485`。

原固定路径 `dist/聊单助手.app` 的 2.4.4 保留、未移动或删除。可直接使用的新 2.4.6 成品在 `dist/mac/聊单助手.app`。
