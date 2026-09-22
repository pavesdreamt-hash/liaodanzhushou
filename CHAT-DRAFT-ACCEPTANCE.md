# 7.7 聊单草稿与助手补全验收矩阵

所有数据库、客户、聊天及截图均为隔离虚构数据。未读取正式订单或真实聊天，未发送消息，未执行真实库存同步或 Google Sheets 写入。

总结果：**MIXED / BLOCKED**。本地功能与虚构接口流程通过；真实 WhatsApp 与真实 AI 均未接通，不能标为全量 PASS。

| 编号 | 实际修改文件（项目根目录下） | 实现与证据 | 结果 |
|---|---|---|---|
| NEW-01 | `src/orders/draft-orders.mjs`、`src/orders/migrations/017-chat-drafts.mjs`、`src/orders/migrations/index.mjs`、`src/orders/order-app-service.mjs`、`renderer/index.html`、`renderer/draft-orders.js` | 空白草稿、固定递增编号、独立ID、空网站订单号、持久化请求去重；未选商品无包裹；NULL金额；草稿不计发货/利润。专项与网站导入/去重回归通过。 | PASS |
| NEW-02 | `src/orders/draft-orders.mjs`、`src/orders/cost-catalog.mjs`、`src/orders/order-recipient.mjs`、`src/orders/package-report.mjs`、`renderer/draft-orders.js` | 原文姓名；去空格显示电话并保留原文；库存商品候选；正整数数量；每件已含优惠不二次扣减；成本快照及只匹配缺失成本；NUMERIC/KY/YB和通用系列沿用原规则。重启、备份通过。 | PASS |
| NEW-03 | `src/orders/order-assistant.mjs`、`src/orders/assistant-connectors.mjs`、`src/main.mjs`、`src/preload.cjs`、`src/local-web-server.mjs`、`renderer/draft-orders.js`、`renderer/renderer.js`、`renderer/orders.css` | 独立可关闭侧栏，切换隔离；未保存输入阻止助手覆盖；900×700及常用尺寸无页面横向滚动、控件不超卡片边界；密钥仅主进程从钥匙串读取。 | PASS（侧栏及安全配置实现） |
| NEW-04 | `src/orders/order-assistant.mjs`、`src/orders/assistant-connectors.mjs`、`src/orders/assistant-test-fixture.mjs`、`src/main.mjs` | 只读适配契约，账号/稳定聊天ID/时间范围/首次确认；消息ID、方向、时间去重；错误聊天和旧关联请求拒绝。模拟通过。 | BLOCKED：无真实只读聊天服务及指定目标聊天 |
| NEW-05 | `src/orders/order-assistant.mjs`、`src/orders/assistant-connectors.mjs`、`renderer/draft-orders.js` | 空值补全、人工冲突选择；精确来源/字段/购买/数量/单价校验；询价和商家报价不成交；替换及改量不累计；已确认只建议；超时与调用上限。专项含恶意文本、推断省份、金额子串校验。 | BLOCKED：模拟 PASS，真实 AI 请求未执行 |
| NEW-06 | `src/orders/draft-orders.mjs`、`src/orders/order-assistant.mjs`、`src/orders/database.mjs`、`src/orders/order-data-protection.mjs`、`src/orders/order-app-service.mjs`、`src/orders/package-report.mjs` | 同事务及审计；故障回滚；撤销保护；独立客户确认；报单资料变更失效；迁移前备份及重建失败回滚；备份含助手/来源/确认。物流规则未变。 | PASS |
| NEW-07 | `test/chat-drafts.test.mjs`、`test/chat-drafts.e2e.mjs`、`test/chat-preview-launch.e2e.mjs`及现行Electron回归测试 | 虚构新建→关联→提取→冲突处理→净价→成本分包→客户确认→TXT→重启→同客户第二单；源码及打包程序均验证。 | BLOCKED：模拟全流程 PASS，真实流程未执行 |

## 测试与审核证据

- `npm test`：**211/211 PASS**，其中本次 `test/chat-drafts.test.mjs` **16/16 PASS**。含库存同步既有隔离模拟回归，不执行真实采集/Google写入。
- `npm run check`、`git diff --check`：PASS。
- 源码 Electron/浏览器综合套件：**8/8 PASS**，覆盖网站导入、包裹、费用、利润、地址、备份恢复、响应式工作区及聊单流程。
- macOS x64 打包套件：**3/3 PASS**，覆盖虚构全流程、独立目录启动、既有16版订单迁移到17与浏览器工作区。
- 二进制：Mach-O x86_64；本机 ad-hoc 签名校验通过，未做 Apple Developer ID 公证。
- 未执行依赖真实客户文件的 `electron-real-isolation.e2e.mjs`。历史 `packaged-app.e2e.mjs` 固定针对0.1.13旧界面；当前打包验收使用上列三项现行测试，未删除历史测试。
- 命令输出在 `artifacts/chat-drafts/`，只含虚构测试及汇总，无真实聊天或密钥。
- 截图：[900×700草稿侧栏](artifacts/chat-drafts/01-draft-conflict-900x700.png)、[地址冲突选择](artifacts/chat-drafts/04-conflict-choice.png)、[虚构TXT](artifacts/chat-drafts/02-report-preview.png)、[重启及独立订单](artifacts/chat-drafts/03-restart-orders.png)。

## 可用功能与边界

可直接使用手动草稿、资料商品编辑、库存成本快照、人工确认后的原履约流程，以及订单助手侧栏/冲突/撤销实现。聊天读取与AI自动流程只有虚构接口验收证据，普通启动不启用模拟接口。

基础版采用保守校验：自动姓名/地址需要明确标签，商品需要明确客户购买、数量和每件价格依据。不保证任意语言、隐含指代或复杂自然语言报价的识别；不确定时保留空值或要求人工核对。不推断省份、不拆姓名、不把报价当成交。

本次也修复了回归发现的内部导航误清除Excel令牌、浏览器静态资源入口，以及原对齐验收中的16px金额偏差和1px标题边框偏差。变动物流费规则未变。

## 直接运行

解压 `dist/KDocs库存同步7.7.0-x64.zip`，双击文件夹内 **启动隔离验收.command**。默认浏览器显示管理页面；菜单栏K图标可重新打开页面或退出。

独立数据目录：`~/Library/Application Support/KDocs Chat Drafts 7.7 Evaluation`。不会打开正式 `KDocs Inventory Sync` 数据库，不覆盖已安装App。进入订单管理→新建订单。隔离目录没有库存时成本保持未匹配；无需为验收运行真实同步。

如Finder阻止启动，右键启动器选择“打开”；不关闭系统安全功能。也可在终端运行解压目录中的启动器。

## 开工前检查

- 项目目录可读写；Node 25.8.0、npm 11.11.0；npm registry ping 成功，无需新增依赖。
- Electron 44 实际启动成功；初始既有 UI 套件 4/7 通过；最终现行综合UI套件全部通过。
- 初始代码无 WhatsApp 消息接口或助手；没有 AI 环境变量配置。
- 本次新增只读 HTTP 聊天适配器契约，未安装任何客服平台或浏览器扩展。
- 不需要屏幕录制或辅助功能权限。
- 新建迁移版本 17，迁移前自动备份；金额列允许 NULL；外键完整性验证及失败回滚。

## 用户需补充的连接配置

1. 在本机“钥匙串访问”中新建密码项目，项目名称（service）为 `KDocs Order Assistant`。AI 的账号为 `ai`，只读聊天接口令牌账号为 `whatsapp`。密码填对应 API key；不要在聊天或源码中填写。
2. 在应用独立数据目录的 `config/order-assistant.json` 配置非秘密参数：

```json
{"ai":{"baseUrl":"https://YOUR-PROVIDER/v1","model":"YOUR-MODEL"},"chat":{"baseUrl":"http://127.0.0.1:YOUR-PORT"}}
```

3. AI 要求支持 Chat Completions JSON 输出。接口格式依据：[官方 API 文档](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。不默认选择模型或服务商。
4. WhatsApp 仍需提供实际只读适配服务。现有应用没有 WhatsApp Web 浏览器读取模块；仅填写一个 WhatsApp Web 网页地址不能接通。接入服务必须实现下述两个 GET 端点，不得发送消息或扫描其他聊天：
   - `/resolve?accountId=…&chatId=…` → `{accountId,chatId}`，准确核对账号和稳定聊天标识。
   - `/messages?accountId=…&chatId=…&from=…&to=…` → `[{id,accountId,chatId,direction:"customer"或"merchant",sentAt:ISO时间,text}]`。
5. 重启独立测试实例，在订单助手中填写账号、稳定聊天 ID、本单起止时间并确认关联。真实验收标准：读取指定范围消息，消息 ID/方向/时间正确；用虚构聊天发起一次真实 AI 请求。当前没有完成该验收。

连接请求每次超时 20 秒，不自动重试；每种接口每次应用启动最多 20 次请求。AI 输入最多 100,000 字符，每次输出最多 2,500 tokens。HTTP 错误只返回状态及通用错误，不回显服务响应或密钥。完整聊天仅保存在订单数据库，不写入普通日志或报告。

## Git 与已有改动

开工前未提交状态单独保存为基线快照。本任务提交以该快照为父提交保存在本地 `codex/chat-drafts-7.7` 分支，便于只查看本次增量；原工作分支和暂存区不切换、不清理。未修改的既有文件（含本地库存实现、用户AGENTS及原有业务修改）保留原样。没有推送远程。

## 最终 ZIP 验证

直接从交付ZIP解压运行：3/3 PASS。ZIP完整性、Framework相对链接、签名及启动器语法检查通过。

SHA-256：`19b30a8a3e14c89355c557a270207e67fd4c3461d43f2bd940a4cbfd589f11f0`

包大小：150,655,033 字节。未生成DMG。
