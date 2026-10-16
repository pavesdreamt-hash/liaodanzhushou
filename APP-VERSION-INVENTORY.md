# 应用版本与 GitHub 提交台账

## 现状与计数（2026-10-16）

- 编号规则：连续加一、逢9进位；详见 [AGENTS.md](AGENTS.md)。历史错误编号只作实际记录保留。
- 最新源码与已交付成品为3.6.5，由3.6.4连续加一，最终成品启动与9项操作回归已验证；下次实际版本为3.6.6。
- 最新成品路径：`/Users/apple/Documents/ChatGPT/网站料单Skill/liaodan-assistant-next/交付/聊单助手3.6.5/聊单助手.app`。3.6.4及更早App、旧dist App保留。
- 最新应用发布提交：`0ec9af9a7190533cb576e5633bc320e8917e9103`，2026-10-16，`release: ship five delivered updates through 3.6.5`，已成功推送并核对远端main；随后同步的文档登记不产生新应用迭代。
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

**截至3.6.0的6次积压已经补交完成。** 新批次从该次成功补交后累计；3.6.1至3.6.5已交付，记为第5次，不因开发、中途修正或文档修改重复计数。本轮5次已提交并推送0ec9af9且远端核对一致；下一批次当前0次，不重算或删除这批真实交付记录。

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
