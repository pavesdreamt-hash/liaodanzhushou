# 应用版本与 GitHub 提交台账

## 现状与计数（2026-10-19）

- 编号规则：连续加一、逢9进位；详见 [AGENTS.md](AGENTS.md)。历史错误编号只作实际记录保留。
- 最新源码与已交付成品3.7.5，由3.7.4连续加一：商品提醒详情直接人工关闭，原查看/提醒、价格关闭及来源衔接保持。124项相关单元、最终App18项回归及原目录正常启动通过。本批3.7.1—3.7.5五次已成功提交并推送GitHub，应用发布提交8a36b51c8fea6d3f2b98d066fd1a806329edf31e，远端main已核对；下一批从3.7.6开始。下次3.7.6为新批第1次；其它历史缺口保留。
- 最新成品路径：`/Users/apple/Documents/ChatGPT/网站料单Skill/liaodan-assistant-next/交付/聊单助手3.7.5/聊单助手.app`。3.7.4及更早App、旧dist App保留。
- 最新应用发布提交：`8a36b51c8fea6d3f2b98d066fd1a806329edf31e`，2026-10-19，`release: ship five delivered updates through 3.7.5`，已成功推送且远端main核对；本批含3.7.1—3.7.5五次交付，随后收据文档不新增应用迭代。
- 截至3.6.0的6次历史积压补交仍为`7d03ff0fdc16dd6519893806fa5d07beb8315226`，保留原核验记录。
- 该次补交的父提交为2026-10-03的`9565503`（3.3.0）；下面6次交付的原节点遗漏保留，不补造逐版历史提交。

| 原累计交付次数 | 实际历史标号 | 对应交付记录 | 当前提交／GitHub状态 |
| --- | --- | --- | --- |
| 1 | 3.4.0 | SOURCE-CHANGES-3.4.0-ACCEPTANCE.md | 已补交7d03ff0 |
| 2 | 3.5.0 | SOURCE-REVIEW-ORDER-3.5.0-ACCEPTANCE.md | 已补交7d03ff0 |
| 3 | 3.5.1 | REMINDER-REFRESH-3.5.1-ACCEPTANCE.md | 已补交7d03ff0 |
| 4 | 3.5.2 | WEBSITE-PRICE-GUARD-3.5.2-ACCEPTANCE.md | 已补交7d03ff0 |
| 5 | 3.5.3 | NEW-PRODUCT-REMINDER-3.5.3-ACCEPTANCE.md | 原第五次节点遗漏；现已补交7d03ff0 |
| 6 | 3.6.0 | REMINDER-CONTROLS-3.6.0-ACCEPTANCE.md | 已补交7d03ff0 |

**截至3.6.0的6次积压已经补交完成。** 新批次从该次成功补交后累计；3.6.1至3.6.5已交付，记为第5次，不因开发、中途修正或文档修改重复计数。本轮5次已提交并推送0ec9af9且远端核对一致；3.6.6至3.7.0这批5次已提交并推送`688ae3b532ac08985c01ba19a9e6f941721be52b`且核对远端；下一批从3.7.1开始，不删除真实交付记录。

| 新批次累计次数 | 实际交付标号 | 验收记录 | 本地提交／GitHub状态 |
| --- | --- | --- | --- |
| 1 | 3.6.1 | WHATSAPP-SETTINGS-STATUS-3.6.1-ACCEPTANCE.md | 已随本批次提交并推送0ec9af9，远端已核对 |
| 2 | 3.6.2 | WHATSAPP-CALL-NOTICES-3.6.2-ACCEPTANCE.md | 已随本批次提交并推送0ec9af9，远端已核对 |
| 3 | 3.6.3 | WHATSAPP-SYSTEM-NOTICES-3.6.3-ACCEPTANCE.md | 已随本批次提交并推送0ec9af9，远端已核对 |
| 4 | 3.6.4 | KDOCS-SYNC-STABILITY-3.6.4-ACCEPTANCE.md | 已随本批次提交并推送0ec9af9，远端已核对 |
| 5 | 3.6.5 | CUSTOMER-PROFILE-3.6.5-ACCEPTANCE.md | 已随本批次提交并推送0ec9af9，远端已核对 |

## 历史清理与交付记录

下方保留当时的版本、位置与清理事实，不是当前版本清单，不授权新清理、桌面交付、默认 ZIP／DMG 或重新使用旧资料目录。

## 2026-09-21：聊单助手 1.1.4 工作台订单卡片版

新增 `dist/聊单助手1.1.4-x64.zip`，保留旧版 ZIP 与现有订单资料。工作台列表的卡片、状态颜色、需注意圈数和详情按钮点击边界得到局部修复；手机底部旧偏差仍在。

## 2026-09-21：聊单助手 1.1.3 订单电话核对修复版

新增 `dist/聊单助手1.1.3-x64.zip`，保留 1.1.2 和已导入的正式订单。修复已知国家本地电话与完整国际电话的关联误判；真实 WhatsApp 聊天读取及发送仍需实际核验。

## 2026-09-21：聊单助手 1.1.2 真实订单入口版

新增 `dist/聊单助手1.1.2-x64.zip`。从最终 ZIP 新解压 App，以隔离空资料目录核验启动和 1.1.2 版本；旧版包与正式资料未清理。真实订单文件由用户之后导入，真实 WhatsApp 扫码、读取和发送尚未实测。

## 2026-09-21：聊单助手 1.1.0 空白连接版

新增 `dist/聊单助手1.1.0-x64.zip`，与 1.0.12 使用不同的 Bundle ID、资料目录及本地端口；旧版安装包和资料未清理或覆盖。新版首次空白启动并提供真实 WhatsApp 扫码及指定聊天核对入口；真实扫码和读取待用户完成。1.0.12 仍可回溯。

盘点日期：2026-09-12。清理过程只读取应用 `Info.plist` 中的版本，没有读取或移动订单资料。

用户确认后，已将以下低于 7.9.0 的输出移入废纸篓文件夹 `KDocs旧版本-2026-09-12`：

- `/Applications` 中的 7.5.0 安装副本。
- 项目 `dist` 中的 7.6.0、7.7.0、7.8.0 解压应用副本。
- 7.4.0–7.8.0 的旧 ZIP、SHA256、DMG 和 DMG blockmap。

废纸篓未清空，上述文件仍可恢复。`~/Library/Application Support` 下的正式与隔离数据目录均未删除。

8.1.0 首次改为直接使用版，ZIP 内启动器读取标准资料目录。8.1.0 验收后，项目中的 7.9.0 应用与安装包、8.0.0 安装包、原隔离资料和原标准资料均已移入可恢复的 `/Users/apple/.Trash/KDocs旧版本-2026-09-12-第二批`；废纸篓未清空。

8.2.0 新增 `.xls` 和 `.csv` 订单导入。最终验收后，8.1.0 的解压应用、ZIP 和校验文件已移入可恢复的 `/Users/apple/.Trash/KDocs旧版本-2026-09-12-第二批`；标准资料目录保留，废纸篓未清空。

8.3.0 修复库存缺少成本时无法完成订单导入的问题。最终验收后，项目 `dist` 中的两个 8.2 解压副本、ZIP 和校验文件已移入可恢复的 `/Users/apple/.Trash/KDocs旧版本-2026-09-12-第二批`；标准资料目录未参与导入测试，废纸篓未清空。

8.4.0 改为直接双击带版本号的 `.app`，不再包含 `.command` 启动器。新版的 Bundle ID、Application Support 目录和本地端口均与旧版隔离。新增订单功能前的 7.6.0（Git `480c0a4`）作为回溯存档，保存在 `archives/pre-chat-orders-7.6.0`。

8.5.0 将订单助手改为占据详情页原右栏的等宽区域，原右栏内容在助手打开时移动到左栏下方。8.4.0 的安装输出在 8.5.0 验收后清理，7.6.0 回溯存档继续保留。

## 8.18.0（2026-09-17）

当前新增：结构化历史读取、等待占位安全补齐及图片附件缓存。最终交付与实际验收以 ASSISTANT-8.18-ACCEPTANCE.md 为准，8.17 ZIP 保留。


## 8.19.0（2026-09-18）

兼容真实扫码后当前WhatsApp短消息ID布局；本阶段真实连接及最终包验收以ASSISTANT-8.19-ACCEPTANCE.md为准，保留8.18 ZIP。

## 2026-09-18：8.20.0自动消息同步

新增dist/KDocs库存同步8.20.0-x64.zip，最终ZIP新解压App实际启动及版本验证；保留8.19和既有安装版，不覆盖Applications。真实与模拟结果分别记录在ASSISTANT-8.20-ACCEPTANCE.md。当前常用资料目录登录凭据不会从隔离验收目录自动复制；用户在常用软件里首次扫码即可。

接下来做什么、由谁做、是否需要我操作：开发完成最后连续运行记录和任务提交，用户仅按需要扫码及提供少量虚构新消息。

## 2026-09-18：8.21.0

8.21.0 adds per-order phone consistency protection and literal per-message translation. The new ZIP is validated from a fresh extraction; existing installed applications and 8.20 ZIP are preserved. See ASSISTANT-8.21-ACCEPTANCE.md for results and boundaries.

## 2026-09-18：8.22.0

8.22.0 replaces phone blocking with an inline advisory and separates multilingual literal translation from phone and history checks. See ASSISTANT-8.22-ACCEPTANCE.md. Existing releases and installed applications are preserved.

## 2026-09-18：8.23.0

8.23.0 adds Windows 10 x64 platform compatibility and a current-user NSIS installer, preserving business rules and the existing database schema. Mac ZIP regression is verified separately; Windows installation and real connection validation remain pending user-machine acceptance. Existing 8.22 artifacts and installed applications remain untouched. See WINDOWS-8.23-ACCEPTANCE.md.


### 第二批：3.6.6至3.7.0（2026-10-17，已推送）

| 累计交付次数 | 实际交付标号 | 验收记录 | 本地提交／GitHub状态 |
| --- | --- | --- | --- |
| 1 | 3.6.6 | HISTORY-LAYOUT-3.6.6-ACCEPTANCE.md | 已随本批5次提交并推送688ae3b，远端已核对 |
| 2 | 3.6.7 | CHAT-MESSAGE-LINKS-3.6.7-ACCEPTANCE.md | 已随本批5次提交并推送688ae3b，远端已核对 |
| 3 | 3.6.8 | COMPOSER-TRANSLATION-3.6.8-ACCEPTANCE.md | 已随本批5次提交并推送688ae3b，远端已核对 |
| 4 | 3.6.9 | QUICK-REPLIES-3.6.9-ACCEPTANCE.md | 已随本批5次提交并推送688ae3b，远端已核对 |
| 5 | 3.7.0 | PRODUCT-SYNC-WORKFLOW-3.7.0-ACCEPTANCE.md | 已随本批5次提交并推送688ae3b，远端已核对 |

本版修复旧消息读取入口和订单操作列；同一候选内的修正、验证与文档更新不重复计数。上一批0ec9af9的成功推送与0ce167c文档回执保持。

3.6.7：修复聊天商品链接，7项相关成品回归通过并实际打开YB95公开商品页；独立浏览器HTTP桥接亦通过，不重复用例共8项。累计第2次，完整验证边界见本版验收。

3.6.8：人工及AI辅助的明确纯翻译、等待/失败保留、30秒界面恢复与HTTP单层返回已定向验证；12项最终成品回归通过。真实人工点击、正常资料启动及系统安全存储等待的边界见本版验收。累计第3次，未到每5次提交节点；历史缺口保留。

3.6.9：常用快捷回复添加、编辑、确认删除、本机重启保留与原草稿保护定向通过；累计第4次，下次3.7.0为本批第5次提交节点。原真实翻译安全存储等待及历史缺口保留，完整证据见本版验收。

2026-10-17授权后复验：用户明确完成系统授权；正在运行的3.6.9安全存储检查85ms成功，虚构中文真实翻译923ms返回有效英文。只补充核验记录，不修改应用/版本/交付次数，本批仍4/5。详见TRANSLATION-AUTHORIZATION-3.6.9-VERIFICATION.md。


2026-10-17本轮：3.7.0为本批第5次实际交付，三步同步与来源统计、62项相关单元及16项最终成品回归通过；交付路径为项目交付/聊单助手3.7.0/聊单助手.app，旧App保留。正式商品/话术哈希保持，不写网站或发送消息。验收见PRODUCT-SYNC-WORKFLOW-3.7.0-ACCEPTANCE.md。本批3.6.6至3.7.0已提交并推送688ae3b，远端已核对，完整收据如下。


2026-10-17第五次节点收据：本批3.6.6至3.7.0的源码、测试及必要文档共55个文件已提交并成功推送GitHub，应用发布提交`688ae3b532ac08985c01ba19a9e6f941721be52b`，远端main已核对同值。App、证据、依赖、正式资料及凭据未纳入。下一批从3.7.1开始计数；本收据仅更新工作区文档，不修改或重打包3.7.0 App，不增加应用迭代。此前同批各版“未到节点”的文字仍表示当时状态。

### 第三批：3.7.1至3.7.5（2026-10-19，五次已提交并推送8a36b51）

| 累计次数 | 实际交付 | 验收记录 | 本地/GitHub状态 |
| --- | --- | --- | --- |
| 1 | 3.7.1 | PRICE-TASK-REVIEW-3.7.1-ACCEPTANCE.md | 已随本批提交并推送8a36b51，远端已核对 |
| 2 | 3.7.2 | SOURCE-RENAME-3.7.2-ACCEPTANCE.md | 已随本批提交并推送8a36b51，远端已核对 |
| 3 | 3.7.3 | PRICE-ACKNOWLEDGEMENT-3.7.3-ACCEPTANCE.md | 已随本批提交并推送8a36b51，远端已核对 |
| 4 | 3.7.4 | SOURCE-RELATIONS-3.7.4-ACCEPTANCE.md | 已随本批提交并推送8a36b51，远端已核对 |
| 5 | 3.7.5 | REMINDER-DETAIL-CLOSE-3.7.5-ACCEPTANCE.md | 已随本批提交并推送8a36b51，远端已核对 |

本批应用发布提交8a36b51c8fea6d3f2b98d066fd1a806329edf31e的父提交为f60c6ceb3ad553744f784efc76d8498e93e245cb；55个源码/测试/必要文档文件已提交并推送且远端核对，不含App、证据、依赖、正式资料或凭据。后续收据文档提交不增加应用迭代；下一批从3.7.6开始。

2026-10-19第五次节点收据：3.7.1—3.7.5五次交付已整理55个源码、测试及必要文档文件，提交`8a36b51c8fea6d3f2b98d066fd1a806329edf31e`并成功推送GitHub，远端main核对同值。App、生成证据、依赖、正式资料及凭据未纳入。此处为后续文档登记，不修改3.7.5 App，也不产生第六次应用迭代。下一批从3.7.6开始。
