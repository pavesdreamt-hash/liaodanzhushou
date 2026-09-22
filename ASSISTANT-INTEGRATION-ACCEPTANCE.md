# 8.7 订单助手接入验收

2026-09-13。总结果：**MIXED / BLOCKED**。阶段 2–4 的本地实现和自动验证已推进，当前候选包可以直接打开、导入及手动处理订单；尚未达到原任务的全部真实验收 PASS。

用户无需运行测试脚本、重复导入或重新填写 API 密钥。当前必要人工关口是新版 App 的安全存储访问，以及尚未授权的真实验收范围；不是要求用户代替开发排错。

## 1. 可用产物与数据范围

- ZIP：`/Users/apple/Documents/ChatGPT/网站料单Skill/kdocs-diagnostics/kdocs-inventory-app/dist/KDocs库存同步8.7.0-x64.zip`
- SHA-256：`a0cf262caddcbc0c0e732077cd8590e44f45bd71552ac858f2114748e1edbaf8`
- 解压后双击 **KDocs订单助手 8.7.0.app**，自动打开本机管理页面；无需 `.command`。顶部版本为 8.7。
- 正常使用继续采用 `~/Library/Application Support/KDocs Order Assistant`；不会自动覆盖已安装 App。首次打开会按已有规则备份并升级订单结构。旧 7.6 回溯基线及 8.6 ZIP 保留。
- 本次自动化只使用可丢弃虚构订单库；没有读取或修改正式订单，没有采集 KDocs、写入 Google Sheets、发送 WhatsApp 消息或推送远程。
- 仅主进程使用已保存的加密 AI 设置进行已授权验证；没有把密钥打印、传给 renderer 或纳入 Git。正式设置中的开发调用计数为 **5/5**，没有重置或通过日常模式绕过。
- 打包版的加密设置复用目前 BLOCKED。订单导入、手动草稿和原履约功能不依赖此项；不能把此包描述成已经完整验收的自动聊单工具。

## 2. NEW-01 至 NEW-07

“复用”表示本轮没有重写原有业务代码，但使用当前候选版再次验证。文件名均相对项目目录，原始日志及截图位于 `artifacts/assistant-integration-8.7/`。

| 编号 | 实際修改文件与复用范围 | 实现及验收证据 | 当前结论 |
|---|---|---|---|
| NEW-01 空白草稿 | 修改 `renderer/renderer.js`；新增 `test/draft-return-list.e2e.mjs`；复用 `src/orders/draft-orders.mjs` 和原迁移 17 | 唯一 ID/固定编号、可空 ShopPlus 号、NULL 金额、缺资料保存、无空包裹、点击幂等和统计排除。修复首次创建后返回列表仍显示空白。`unit-final.log`、`draft-list.log`、`packaged-regression.log`、`packaged/first-drafts-return-list.png` | **PASS**，虚构数据与最终包验证 |
| NEW-02 资料与商品 | 修改 `src/orders/order-assistant.mjs`、`renderer/draft-orders.js`、`test/chat-drafts.test.mjs`；复用原成本匹配、草稿编辑、系列规则 | 原文姓名、电话展示/搜索与原始值、资料来源、正整数数量、未知成本/金额 NULL、成本快照不随查看/重复提取刷新。KY、NUMERIC、YB 同系列/跨系列、多数量、已含优惠不重复扣除。`unit-final.log`、`replayed-ai-workflow.json`、`packaged-assistant-backup.json` | **PASS**，手动及保存规则；真实模型的广泛表达能力不在此结论内 |
| NEW-03 订单专属助手 | 修改 `renderer/draft-orders.js`、`renderer/orders.css`、`src/main.mjs`、`src/preload.cjs`、`src/local-web-server.mjs`、`src/orders/assistant-settings.mjs`、`renderer/assistant-settings.js`；保留用户已确认的等宽布局 | 专属上下文、切单/关闭、独立复购、900×700/常用尺寸无横向溢出。主进程加密配置、服务商独立设置、20 秒超时/无重试、手动开启日常 20 次上限。源代码版设置及加密重启通过；最终包安全存储访问未成功。`ui-regression-final.log`、`settings-ui-final.log`、`packaged-settings-serial.log` | **BLOCKED**：UI 和隔离规则 PASS；最终包密钥复用需要完成真实系统访问核验 |
| NEW-04 关联读取 | 新增 `src/orders/whatsapp-browser.mjs`、`test/whatsapp-browser.test.mjs`、`test/whatsapp-browser.e2e.mjs`、`scripts/verify-live-assistant.mjs`；修改主进程/桥接及助手 | 专用有沙箱 Chrome、用户确认账号及联系人号码、绑定本单时间范围、原生消息 ID、方向/分钟时间、重复去重、读取期间切换保护、同 ID 内容改变阻断。最终包真实读取两条授权新消息、重复读取、第二单、重启 PASS。`packaged-real-read.json`。普通时间范围完整性算法仅虚构 DOM 通过 | **BLOCKED**：两条已知 ID 的真实读取 PASS；普通时间边界真实验收还需允许检查同一聊天已加载的时间元数据 |
| NEW-05 提取与补全 | 修改 `src/orders/order-assistant.mjs`、`src/orders/assistant-connectors.mjs`、`renderer/draft-orders.js`；新增 `scripts/verify-ai-workflow.mjs`，扩充单元测试 | 只自动填空值、人工值冲突比较、来源/时间、询价与商家报价不算购买、商品替换/数量更改、价格与对应 SKU/数量绑定、拒绝无依据省份及恶意规则文本、已确认订单只建议。真实两消息询价链路的字段/金额断言通过。发现并修复 `AED 30` 格式拒绝，实际响应回放完成正向全流程 | **BLOCKED**：本地样本和实际响应回放 PASS；修复后的新真实请求、歧义/恶意文本真实 AI 验收因 5/5 上限未执行 |
| NEW-06 保存与履约 | 新增迁移 `018-assistant-read-integrity.mjs`、`test/packaged-assistant-backup.e2e.mjs`；修改迁移索引、`order-data-protection.mjs`、`order-assistant.mjs`；为原 `electron-order-ui.e2e.mjs` 增加最终 App 执行入口 | 提取事务失败全回滚、撤销保护后续人工修改、单独客户确认、草稿禁报单/发货、既有分包/TXT/费用/利润、资料改动报单失效。17→18 迁移前备份、DDL 失败回滚、实际 App 备份恢复助手资料/来源/确认/成本，重启一致。`unit-final.log`、`packaged-order-regression.log`、`packaged-assistant-backup.json` | **PASS**，虚构订单/最终 App；真实客户业务没有执行 |
| NEW-07 联合流程 | 新增上述两种验证脚本、最终包恢复测试；更新草稿 Electron 测试及证据目录 | 最终包模拟完整流程：草稿→关联→提取→地址冲突→确认→分包→TXT→重启→同客第二单。实际 DeepSeek 响应回放：4 SKU、7 件、3 系列、AED 220、原商品移除且其他商品保留、成本/TXT/复购一致。真实 WhatsApp 目前只有两条询价/报价，不能据此执行真实成交全流程 | **BLOCKED**：模拟及真实响应回放 PASS；完整真实成交链路与集中人工语义核验未完成 |

## 3. 自动测试与最终 ZIP 核验

| 范围 | 结果 | 证据 |
|---|---|---|
| 完整单元回归 | 246/246 PASS，失败 0，跳过 0 | `unit-final.log` |
| 项目检查 | PASS | `project-check.log` |
| 原订单/布局 Electron 回归 | 8/8 PASS | `ui-regression-final.log` |
| 虚构 DOM 时间范围、只读及方向校验 | 1/1 PASS | `browser-dom-final.log` |
| 源码完整虚构草稿流程、新建返回列表 | 各 1/1 PASS | `fictional-flow-final.log`、`draft-list.log` |
| AI 模拟正向/冲突恶意样本 | 2/2 PASS，真实请求 0 | `mock-ai-workflow.json` |
| 已保存实际 AI 响应回放 | 1/1 PASS，无新增付费请求 | `replayed-ai-workflow.json` |
| 最终 ZIP 的生产模式启动、文件选择与三种格式导入、草稿返回列表、完整模拟流程、等待授权时订单可用 | 6 PASS；同批设置保存 1 FAIL，后续单独复核仍未通过 | `packaged-regression.log` |
| 最终 ZIP 原订单/费用/利润/TXT/备份恢复 | 5/5 PASS | `packaged-order-regression.log` |
| 最终 ZIP 17→18、助手备份恢复和重启 | 1/1 PASS | `packaged-assistant-backup.json`、同名 `.log` |
| 最终 ZIP 真实 WhatsApp 两条消息 | PASS；只读、重复/切单/重启；无 AI 请求 | `packaged-real-read.json` |
| 最终 ZIP 设置保存串行复核 | 未通过：系统安全存储不可用；不把超时写成 PASS | `packaged-settings-serial.log`、`packaged-keychain-read-blocked.json` |
| 包体 | ZIP CRC、8.7.0、x64、签名、14 个相对 Framework 链接、无 command；85 个源码/界面/说明与工作区一致 | `package-verification.json`、`packaged-source-match.json` |

生产模式启动使用临时数据路径验证相同程序入口；不代表已经替用户安装，也不代表 Finder 首次系统提示或正式数据迁移已由用户验收。

源代码设置测试通过；早期 `settings-ui-final.log` 还包含一次漏传包路径的测试调用失败，不把它算作代码失败或删除记录。最终包设置真实失败单独如实保留。部分第一次 UI 验证因连接忙态/截图隐藏选择器失败，修复后由针对性测试覆盖；没有删除断言或用模拟连接冒充真实成功。

## 4. 真实 AI 调用账本

全部使用虚构内容。已使用 **5 次**，请求不自动重试。网页读取不等于 AI 调用。

1. 既有 8.6 的 DeepSeek `deepseek-flash` 连接样本：真实 PASS，约 1.39 秒。证据在 `artifacts/assistant-settings-8.6/live-connection-verification.json`。
2. 真实 WhatsApp 两条新消息→DeepSeek→草稿：姓名/来源、询价不购买、商家报价不接受、无虚构金额/包裹等 6 个断言通过；同一次脚本后来在第二单 UI 等待失败。保留 `live-app-chain-attempt-2.json` 的整体 FAIL，不能改写成全流程 PASS。
3. 多商品正向请求：返回后遇到实际“新草稿返回列表空白”缺陷。已修复并新增最终包 UI 回归。
4. 多商品正向请求：本地商品校验未通过。保留 `real-ai-workflow-attempt-2.json`。
5. 多商品正向请求：捕获实际响应，确认价格/优惠包含 `AED` 前缀而被本地校验拒绝；未错误写入订单。已修复格式兼容及来源校验，并对该实际响应完成回放。原请求的 `real-ai-workflow.json` 继续标 FAIL。

回放证明修复可以处理已经收到的那份真实输出，**不等于修复后再请求一次真实模型成功**。该响应没有保留被拒绝报价的原始结构，因此回放不宣称覆盖该报价识别。真实歧义/恶意文本请求仍未执行。

## 5. 读取器边界与剩余关口

- 已核验的是用户指定的另一自用账号与本轮两条消息。账号/聊天绑定采用分别核对后的电话号码组合，不称作 WhatsApp 平台原生 JID；消息使用平台原生消息 ID。
- 当前基础版限定一对一、中文网页版、已加载范围内至多 20 条文字消息；时间是分钟精度。不会自动向上加载历史，不读取聊天列表正文，不发送消息。
- 图片/语音/文件、已编辑/转发/引用内容、没有可靠方向或时间的消息，以及无法证明完整加载的范围，拒绝本批保存并提示人工处理。连续无方向标志气泡等未覆盖结构不能承诺通用可读。
- 普通范围模式只在页面内检查已加载时间前缀，返回范围完整性的布尔结果及范围内消息元数据；范围外正文/ID 不返回、不发送 AI。此模式已通过虚构 DOM 测试，真实验收必须在额外元数据范围获准后执行。
- 自动审批拒绝过“在真实聊天检查已加载旧消息时间前缀/标识以确定范围”的操作，理由是超出用户“只读本轮新测试消息”限制。该操作没有执行；之后真实测试继续严格限定两条已知 ID，没有绕过拒绝。
- 打包 8.7 的安全存储测试单独运行仍显示不可用；源代码版可以使用已有密钥。尚不能确定用户系统提示是否已经出现，不能直接认定是用户或电脑问题，更不能以明文存储绕过。已打开只核验加密设置的 App 窗口，使用临时订单目录、不调用 AI，等待必要系统访问核验。

## 6. 集中人工事项与后续责任

当前已分别发出最小范围请求，尚无答复不能算批准：

1. **钥匙串**：在“KDocs 8.7 · 仅核验已保存密钥的系统授权”窗口对应的 macOS 提示中，核对程序名称后允许；如果没有提示，只需反馈“没有提示”。不重填 API 密钥。成功标准由开发检查：新版主进程可解密原配置、hasApiKey 为 true；不发付费请求。
2. **AI 开发额度**：是否额外允许最多 3 次虚构请求（总上限 8），继续每次 20 秒、无重试。成功标准由开发完成：修复后实际正向/歧义恶意样本及最终包链路；额度使用明细必须持久化记录，不能通过日常模式绕过验证计数。
3. **聊天时间边界**：是否允许仅检查同一已确认聊天中已加载消息的时间元数据，用于确定本轮范围完整性；仍只读取两条新消息正文。不同意则保留严格两条 ID 验收结果，普通范围真实验收保持 BLOCKED。

收到必要答复后由开发继续真实复验、修复发现的问题、重新验证受影响产物，最后提供一次集中业务/界面核验。用户无需重跑本地回归；在剩余真实和必要人工项目通过前，不给出总 PASS。

## 7. 虚构界面证据

- `artifacts/assistant-integration-8.7/packaged/import-formats-complete.png`：最终包导入。
- `artifacts/assistant-integration-8.7/packaged/first-drafts-return-list.png`：首次草稿返回列表。
- `artifacts/assistant-integration-8.7/packaged/01-draft-conflict-900x700.png`、`04-conflict-choice.png`：900×700 与地址冲突。
- `artifacts/assistant-integration-8.7/packaged/02-report-preview.png`、`03-restart-orders.png`：报单及重启。
- `artifacts/assistant-integration-8.7/fictional-three-series-txt.png`：实际响应回放的三系列报单。

截图只包含虚构客户资料；未保存真实 WhatsApp 全屏或完整聊天正文。测试日志、截图、模型回放和真实连接记录分别标记，不能互相代替。
