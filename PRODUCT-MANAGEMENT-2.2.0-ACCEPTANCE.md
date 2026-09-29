# 商品管理 2.2.0 验收记录

日期：2026-09-26
交付：`dist/聊单助手.app`（Mac x64，固定路径，无 ZIP）

## 本次修复目标

将“采集商品（最多2款）”改为明确操作的“商品管理”：可把本机目录补充至 2、5、10 或全部在售（首批最多 100）；增加只读的“更新已采集商品资料”；超过十条后使用真实本机分页。上架／下架保持未启用，因为网站写权限、状态字段和二次确认流程均未确认。

## 实际验收内容

- `npm run check`：类型检查、界面构建、共享模块检查和项目检查通过。
- 11 项目标虚构回归通过：商品目录 9 项（包含补充至 5、跨页跳过无货、100 上限、刷新保留本机字段和未返回标记），库存 UI E2E、ShopPlus 集中配置 E2E 各 1 项。
- 直接启动最终 `dist/聊单助手.app` 的隔离 E2E：明确选择 2、5、10、100 四档均准确传入；2 款时仅出现两条有库存虚构商品，5／10 款均为单页；刷新将虚构网站售价更新为 AED 301；选 100 时使用 12 条虚构商品验证 `1 / 2` 分页和第 2 页的第 11–12 条。
- 最终 App 完整验证脚本通过：`packaged=true`、`version=2.2.0`、`arch=x64`、`errors=[]`，26 项库存／详情／图库／布局检查通过；`realShopPlusCalls=0`、`realMessagesSent=0`。
- `codesign --verify --deep --strict`、x64 Mach-O、包内版本和 `git diff --check` 通过。
- 已人工查看最终 App 隔离截图：商品库存 [1280×820](artifacts/product-management-2.2.0/inventory-1280x820.png) 与产品详情 [1280×820](artifacts/product-management-2.2.0/product-detail-1280x820.png)。图片夹具是透明 1px 虚构 PNG，所以预览显示白底；它只用于确认 `contain` 和布局，不代表真实图片采集。

## 数据与边界核对

所有验收使用临时隔离的虚构 ShopPlus IPC、商品、图片和来源库存资料。没有读取或修改真实 ShopPlus、KDocs、Google、订单、客户、WhatsApp 或 AI 数据；没有发送消息，没有网站写回，也没有上架／下架动作。

本轮仅验收 D-136 商品管理局部能力。商品库存、产品详情和其它页面的其他历史基准未因此重新标记为整页通过。

## 交付与启动

- App：`/Users/apple/Documents/ChatGPT/网站料单Skill/liaodan-assistant-next/dist/聊单助手.app`
- 版本：2.2.0
- 架构：x64
- 可执行文件 SHA-256：`3b99443b04877072185d23fd9e7515f8101de10fe6d3958292dc17b353709bd5`
- 已结束旧 2.1.9 固定 App 的 PID `43766`（TERM 无响应后，仅结束该 PID），并直接启动新版 PID `55716`。
- 不生成 ZIP；不是五版本 GitHub 递交节点，未提交或推送。

正常使用时，直接双击或运行：

```sh
open "/Users/apple/Documents/ChatGPT/网站料单Skill/liaodan-assistant-next/dist/聊单助手.app"
```

使用“商品库存”顶部的“商品管理”选择目标数量；需要刷新已保存商品的网站信息时，点击“更新已采集商品资料”。两种操作都是只读，不会写回网站。
