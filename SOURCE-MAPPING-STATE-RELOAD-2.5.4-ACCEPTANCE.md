# 来源映射保存后状态回读｜2.5.4

## 修复范围

保存来源映射后，若本机保存服务返回的只是 `{ action: "complete", result: … }`，页面不再把该完成回执误认为空映射列表。它会用既有的只读 `mapping:status` 接口重新读取完整本机状态，再按用户原先的筛选展示已确认、待确认和待编号资料。

本轮没有重新同步来源资料或网站商品，没有读取图片，也没有写入来源表、Google、KDocs、ShopPlus 或其它外部平台。

## 隔离验收

虚构 Electron 回归让第一次保存刻意只返回完成回执，同时由只读映射状态接口返回三条完整资料。确认第一条后，页面仍显示未确认的第二条候选，摘要仍为“3 条来源资料”；证明页面已回读完整状态，未错误显示“本机尚无可核对资料”。

验证命令：

```text
node --test --test-concurrency=1 --test-timeout=60000 test/inventory-shopplus-products.e2e.mjs
KDOCS_TEST_EXECUTABLE="$PWD/dist/聊单助手.app/Contents/MacOS/聊单助手" node --test --test-concurrency=1 --test-timeout=60000 test/inventory-shopplus-products.e2e.mjs
npm run check
git diff --check
```

全部通过。固定 App 已以隔离临时资料直接启动验收；版本为 `2.5.4`、架构为 x64、ad-hoc 深度签名验证通过。可执行文件 SHA-256：`5ac0e0b108709df291eec9f2a857eddecd3926047d703e37fcabb6173f3bf8b6`。

固定交付物：`dist/聊单助手.app`。本轮未生成压缩包。
