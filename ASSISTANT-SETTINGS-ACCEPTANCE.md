# 8.6 助手设置基础：验收记录

日期：2026-09-13。基线：当前工作区 8.5 与阶段 0、1 提交 `0e8961f`。本次按用户最新要求先做应用内设置基础；没有把后续 WhatsApp 读取和真实模型语义验收提前标为完成。

**当前总结果：MIXED。** 用户现已完成密钥保存，DeepSeek 真实最小样本测试通过（累计 1/5 次）。WhatsApp 实际读取、完整 AI 语义样本与联合流程仍未通过；原交付时的阻塞记录保留在下表，后续变化见下一节。

## 2026-09-13 后续核验更新

用户已保存密钥。通过运行中 App 的公开设置核实：加密文件存在且非空、安全存储可用、真实虚构样本测试已通过，耗时 1386 毫秒，累计使用 1/5 次。当前检查没有新增付费调用，也没有读取密钥明文。证据为 `artifacts/assistant-settings-8.6/live-connection-verification.json`。因此，下文交付时的“首次保存 / AI 最小连接 BLOCKED”已经解除；打包 App 重启后解密、完整 AI 语义及 WhatsApp 真实读取仍未验收。以下原交付记录保留其时间范围。

## 可使用的功能与实际修改文件

| 文件 | 本次实现 |
|---|---|
| `renderer/index.html`、`renderer/renderer.js`、新增 `renderer/assistant-settings.js` / `.css` | 顶部“助手设置”；服务商、模型、密钥状态、保存/更换/删除、虚构资料连接测试；进入设置再返回订单详情保留未保存输入；明确 WhatsApp 未接通 |
| 新增 `src/orders/assistant-settings.mjs` | DeepSeek/GPT 独立配置、加密文件原子保存、修订号保护、请求期间更改配置丢弃旧结果；仅公开白名单状态，不回传密钥；5 次合计调用预算持久化、20 秒/次、不自动重试 |
| 新增 `src/core/native-secret-prompt.mjs`、`src/core/async-secret-storage.mjs` | macOS 隐藏输入窗口；异步钥匙串访问并限制等待；首次无配置启动不读取钥匙串，不降级为明文存储 |
| `src/main.mjs`、`src/preload.cjs`、`src/local-web-server.mjs` | 主进程设置操作和浏览器桥接；设置读取在后台进行，系统授权等待不阻塞订单页面；已有订单服务复用已保存的当前 AI 配置 |
| `src/orders/assistant-connectors.mjs` | DeepSeek 与 OpenAI 请求参数分别处理，错误信息去除远端正文，拒绝截断提取 JSON |
| 新增 `test/assistant-settings.test.mjs`、`test/assistant-settings.e2e.mjs`、`test/assistant-settings-permission.e2e.mjs` | 14 项设置单元测试、浏览器保存/切换/重启回归、最终 App 钥匙串等待时仍能操作订单 |
| `package.json`、`package-lock.json`、`USER-GUIDE.md`、`RELEASE-NOTES.md`、`VERSION-ROLLBACK.md`、`scripts/package-chat-preview.mjs` | 版本统一为 8.6.0 / 界面 8.6，直接 App ZIP，无 .command；包内去掉旧验收报告，保留旧源码/旧 ZIP；更新使用与回溯说明 |
| `DELIVERY-PLAN.md`、`PHASE-01-CONNECTION-DESIGN.md`、本报告 | 记录本次范围、已确认聊天限制及人工关口；不将设计写成已接通 |

订单数据库仍为迁移版本 17，本次未增加迁移。8.4–8.6 沿用新版正常资料目录；7.6 回溯版保持独立。测试只使用临时虚构客户和数据库，未读取或清空正式订单，未采集 KDocs，未写 Google Sheets，未发送消息。目标号码只保存在忽略的本机范围记录中，报告和截图不含真实聊天内容。

## 已执行验证

| 检查 | 结果与证据 |
|---|---|
| 完整单元回归与项目检查 | **PASS：234 / 234，跳过 0**；`artifacts/assistant-settings-8.6/regression-final.json`、`unit-final.log`、`check-final.log` |
| 现有 Electron 界面回归 | **PASS：8 / 8**，含导入、分包、地址、报单、利润、备份恢复、重启和尺寸；`ui-final.json` / `ui-final.log` |
| 源码 Electron 设置流程 | **PASS：1 / 1**；实际 macOS 异步加密，密钥输入与 AI 响应采用虚构 fixture；验证取消、重启、服务商分离、无明文泄漏；`settings-source-async.log` |
| 模拟聊单完整操作 | **PASS：1 / 1**；冲突、TXT、重启、同客户第二单；AI 提取结果为固定 fixture，不代表模型理解聊天；`chat-final.log` |
| 文件选择回归 | 虚构 Excel 文件选择测试通过；早期另一个测试因遗漏 `KDOCS_PACKAGED_APP` 参数失败，修正运行参数后在最终包成功完成导入，未删除失败记录 |
| 最终 ZIP 内 App 的启动、导入、迁移 | **PASS：3 / 3**；非 test 运行模式的启动/激活、真实浏览器文件选择到确认导入、缺失成本保持 NULL、16→17 迁移及自动备份和重启；`final-package-usable.json` / `.log` |
| 最终 App 在钥匙串等待时操作订单 | **PASS：1 / 1**；已新建草稿、返回设置，等待后显示安全存储不可用，不保存明文；`packaged-keychain-availability.json`、`packaged-permission.log` |
| macOS 密钥输入窗口 | 系统隐藏输入框已实际显示并自动关闭，使用虚构默认内容；`native-prompt.json`。未把真实用户粘贴或点击保存视为已测 |
| 最终 App 首次钥匙串授权、加密保存及重启 | **BLOCKED / 等待人工**：保存测试在系统安全存储检查阶段超时，未生成加密配置；需要用户核对并完成可能出现的钥匙串授权后复验，尚不能把原因完全归结为权限；`final-package-async.log`。源码环境的成功不能替代此项 |
| 真实 DeepSeek / OpenAI 请求 | **BLOCKED**：未保存真实密钥；调用 0 / 5。接口请求结构与响应验证只通过模拟；GPT 具体模型待后续选择 |
| WhatsApp 网页真实读取 | **BLOCKED**：尚缺实际读取器的实现与登录后验证；不是只缺一个 token。用户已确认另一个自用账号、本轮新虚构文字、最多 20 条，不读旧历史 |

打包时暴露的启动失败已定位并修复：原同步 `safeStorage.isEncryptionAvailable()` 在系统钥匙串等待时卡住主进程。改为异步访问、按需检查和后台初始化后，最终包的管理页面启动与订单操作通过。保留原失败日志及修复后的验证；没有把系统授权阻塞伪装成成功，也没有绕过钥匙串权限。

## NEW-01 至 NEW-07：本轮状态

本表区分现有功能回归与真实链路；不宣称已完成原始全部自然语言和真实接入验收。

| 编号 | 本次改动关系、证据 | 状态 |
|---|---|---|
| NEW-01 | 未改草稿业务；234 项回归、模拟聊单和最终包新建草稿通过 | 本地回归 PASS |
| NEW-02 | 未改客户/商品/成本规则；成本 NULL 导入、备份恢复、订单编辑回归通过 | 本地回归 PASS |
| NEW-03 | 新增设置入口、安全配置和主进程桥接；两种设置尺寸无横向溢出；原助手布局回归通过；打包密钥首次授权仍待人工 | MIXED |
| NEW-04 | 未新增 WhatsApp 读取器；已记录目标为另一个自用账号及仅本轮新消息；0 条真实读取 | BLOCKED |
| NEW-05 | 增加 DeepSeek 参数、保存配置复用和虚构资料连接测试；模型真实请求与语义样本尚未执行 | 模拟 PASS / 真实 BLOCKED |
| NEW-06 | 未改订单事务及成本快照；现有撤销/报单/恢复测试回归通过，新增设置原子保存和旧请求结果丢弃 | 本地回归 PASS |
| NEW-07 | 虚构固定提取结果下的 UI 流程通过；真实网页聊天加真实 AI 的联合流程未执行 | 模拟 PASS / 真实 BLOCKED |

## 一次人工配置及后续停止点

1. 解压下面的 ZIP，直接双击 `KDocs订单助手 8.6.0.app`，顶部进入“助手设置”。无需 `.command` 或特殊验收版，也无需清空订单。
2. 点击“保存密钥”。如系统显示钥匙串授权，核对请求来自本 App 后在系统窗口授权；接着在“ KDocs 助手设置”隐藏输入框中粘贴 DeepSeek 密钥并保存。若等待超时，完成系统授权后再次点保存。密钥和系统密码都不要发到对话。
3. 成功标准是设置页出现“已保存 · 自动复用”。本步骤由用户完成一次，随后告知“已保存”即可，由助手继续真实请求验证；不要求用户重跑导入、报单或回归测试。
4. 当前是本机临时签名，后续更新可能触发 macOS 重新授权钥匙串。应用会保留加密文件；不能承诺系统永不重新授权。
5. WhatsApp 暂时不用发测试消息或提供其他客户资料。待读取入口准备好后集中进行网页扫码、目标确认和本轮虚构消息范围验收。不能仅凭保存 AI 密钥宣称聊天接通。

真实 AI 验证仅发送固定虚构资料，每次最多 20 秒、合计最多 5 次、不自动重试。待真实连接关口通过后，再继续后续提取语义与业务阶段；不自动越过人工关口。

## 交付文件和实际启动范围

- ZIP：`/Users/apple/Documents/ChatGPT/网站料单Skill/kdocs-diagnostics/kdocs-inventory-app/dist/KDocs库存同步8.6.0-x64.zip`
- 大小：151376441 字节；CRC、x86_64 架构、深度签名校验通过；无 .command。
- SHA-256：`8dd5c11c8a7cb432f36e58130c1dfb11cf73fafe4f2b608fad845b9a0ef414f4`
- 正常启动：解压后双击 App，后台菜单栏程序打开默认浏览器的本地管理页面；可在解压目录直接用，不自动替换 Applications 中已安装版本。
- 正常资料目录：`~/Library/Application Support/KDocs Order Assistant`。本次自动验证使用生产运行路径加临时资料目录；未把它当作正常资料目录/Finder 首次双击授权的验证证据。
- 保留 8.5 ZIP 及创建订单前 7.6 App/源码 ZIP，未覆盖旧安装 App。
- Git：当前主工作区及原暂存内容保留；任务代码以阶段 0、1 提交为父，在独立本地交付分支保存，不切换当前主工作区，不推送。具体提交号见 `artifacts/assistant-settings-8.6/delivery-git.json`。

截图：`artifacts/assistant-settings-8.6/packaged-settings-before-key.png` 为最终包未配置状态；`settings-900x700.png` 为源码 Electron 的虚构设置/模拟接口状态；`order-during-keychain-wait.png` 为最终包等待钥匙串时仍可操作订单的证据；`missing-cost-review-production.png` 为最终包的虚构 Excel 导入核对。

接口依据（2026-09-13 核对）：[DeepSeek 模型与接口](https://api-docs.deepseek.com/quick_start/pricing/)、[DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[Electron safeStorage 与 macOS 签名/钥匙串说明](https://www.electronjs.org/docs/latest/api/safe-storage)。
