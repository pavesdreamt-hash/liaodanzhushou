# 阶段 0、1 本次检查结果

> 最新进展（2026-09-13）：8.6 设置与 DeepSeek 最小真实请求已通过；指定 WhatsApp 本轮两条新虚构消息的真实读取、刷新稳定性和本地回放去重已通过。应用内读取接入尚未完成。当前证据与边界见 [WHATSAPP-CONNECTION-ACCEPTANCE.md](WHATSAPP-CONNECTION-ACCEPTANCE.md)。以下保留 9 月 12 日历史检查，旧 BLOCKED 不代表当前仍缺密钥或登录。

日期：2026-09-12。实际版本：8.5.0。范围：基线、运行条件、接入设计和真实连接前置检查。

**阶段 0：自动环境检查 PASS。阶段 1：设计及前置检查完成，真实验收 BLOCKED / 等待人工关口 A。总状态 MIXED / BLOCKED。**

本轮没有修改应用源代码、UI、数据库迁移或版本号，没有重新打包或覆盖已安装 App。不能把本报告作为 NEW-01～07 的最终验收报告。

## 1. 阶段 0 实际证据

| 项目 | 本次操作与结果 | 证据 |
|---|---|---|
| 工作区读写与基线 | 创建本次证据目录；保存 150 个代码/文档文件及指纹、原 Git 差异；保留全部既有改动 | `artifacts/phase01-8.5/baseline.json`、`source-manifest.json`、`source-baseline.tar.gz` |
| Git 身份 | 当前 main / c511f84；此前 8.5 交付分支 / e1087b9；不切换工作区、不重置 | `baseline.json`、`git-status-before.txt` |
| 工具环境 | macOS 26.6.2，Intel x86_64；Node 25.8.0、npm 11.11.0；Electron 44.0.0、Playwright Core 1.62.1；约 249 GiB 可用空间 | `environment.json`、当前 package metadata |
| 依赖可安装 | 在一次性临时目录实际下载并安装 playwright-core@1.62.1，生成锁文件；禁用安装脚本；退出码 0，临时目录已清理 | `dependency-install-approved.json`、`dependency-install-approved.log` |
| 项目测试 | 220/220 PASS；失败 0，跳过 0；只证明该现有套件覆盖的行为 | `unit-approved.json`、`unit-approved.log` |
| 项目检查 | `npm run check` 退出码 0 | `project-check.log` |
| 现有最终 ZIP 检查 | ZIP CRC 通过；无 `.command`；解压后版本 8.5.0；x64 二进制和签名检查通过 | `packaged-environment.json`、`environment.json` |
| 实际 App 与浏览器环境 | 从现有最终 ZIP 解压 App，在临时数据目录按 production 模式启动；激活/再次启动事件；网页订单管理→新建虚构草稿→打开助手；1/1 PASS | `packaged-environment.log`、`production-isolated-dashboard.png` |
| 正常资料目录与进程 | 测前未发现匹配的 KDocs/Chrome/Electron 进程；43874/43873/43872/9222 未检出监听；明确正常和回溯数据路径 | `environment.json`、`connections.json` |
| 7.6 回溯存档 | 源码 ZIP 和 x64 App ZIP 均存在，已计算指纹；本轮未启动旧版 | `baseline.json` |

先前失败如何处理：本轮首次沙箱执行遇到 npm DNS `ENOTFOUND`、进程查询 `EPERM` 和测试回环监听 `EPERM`。在已授权范围内申请相应执行权限后，依赖安装、只读进程检查和完整单元套件均通过。失败原始日志继续保留，未删测试或降低断言。

这不表示所有未来网络地址或权限永久可用。完整原生安装脚本、签名公证、Finder 首次安全提示以及正常订单资料目录启动不属于本轮已通过范围；不得把临时数据测试写成这些项目已验收。

本次截图仅包含虚构空白草稿，用于证明页面启动；它不代替阶段 2 的完整布局/滚动验收。

## 2. 阶段 1 实际证据

| 项目 | 实际结果 | 状态 |
|---|---|---|
| 现有读取代码 | 仅有自定义 HTTP `/resolve`、`/messages` 适配器；KDocs 浏览器模块不是 WhatsApp 读取器 | 实现缺口已定位 |
| 可复用工具连接 | 当前工具清单未找到 WhatsApp 读取连接；浏览器连接清单只有 0 标签页的 Codex 内置浏览器。插件目录搜索工具未提供，不能声称查尽所有插件 | 本会话无可直接复用的已连聊天 |
| 专用配置 | 正常、旧版及回溯目录均无 `config/order-assistant.json` | 未配置 |
| 专用凭据 | 只查 `KDocs Order Assistant` 服务下 `ai`、`whatsapp` 项目的存在状态；两者退出码均 44（未找到）；未读取任何密码 | 未配置 |
| 浏览器登录入口 | 临时全新 Chrome 打开 `https://web.whatsapp.com/`：HTTP 200，标题 WhatsApp Web，登录说明可见；测试窗口及资料已清理 | 登录入口 PASS；账号登录未执行 |
| 真实指定聊天 | 未选择目标，未登录；没有取得聊天/消息标识，也没有读取客户消息 | BLOCKED / 等待用户登录及指定范围 |
| 真实 AI 请求 | 没有服务基址、模型及专用密钥；实际调用次数 0/5，未发送客户资料或虚构请求 | BLOCKED / 等待用户安全配置 |
| 接入设计 | 已明确浏览器候选路线、已有官方接口的条件路线、状态、稳定身份、范围校验和安全配置 | 设计完成；读取实现和真实验收未完成 |

证据：`connections.json`、`whatsapp-login-entry.json`、`PHASE-01-CONNECTION-DESIGN.md`。真实连接的缺口同时包括开发尚需验证的读取实现，不能全部归结为用户没有填配置。

## 3. 人工关口 A 的最小参与

用户回来后，先集中提供非秘密信息：日常 WhatsApp 使用入口、AI 服务商与模型（如已有）、允许核验的专用测试聊天与时间范围。

由开发据此准备准确窗口；用户仅完成必要扫码、选择目标、在本机“钥匙串访问”中输入 API 密钥，以及核对少量消息归属。用户不用编辑配置 JSON、实现接口服务、运行测试脚本或重新导入一遍订单。需要读取器调试时由开发处理，不在每个调试步骤要求用户验收。

当前尚无可供核验的真实读取结果，因此不要求用户现在核对“读取成功”。A 通过前，不自动推进真实 AI 补全、真实联合流程或最终 PASS。

## 4. 未执行及后续待办

- 未执行真实账号登录、指定聊天读取、真实 AI 请求；未验证 WhatsApp 页面上稳定标识的取得方式。
- 未读取或修改正式订单数据库，未采集 KDocs，未写入 Google Sheets，未发送 WhatsApp 消息。
- 未重新验证正常用户资料目录或 Finder 首次打开。上轮该入口曾被自动审批拒绝；本轮只检验环境，未把该项改为通过。
- 未实现设计中的连接检查 UI、细分状态及新读取适配器。原 8.5 仍是原有功能。
- 未开始阶段 2–6。执行恢复点见 DELIVERY-PLAN.md。

## 5. 文件与产物归属

本轮任务文档：`AGENTS.md` 的适用流程更新、`DELIVERY-PLAN.md` 状态更新、`PHASE-01-CONNECTION-DESIGN.md`、本报告。证据位于 `artifacts/phase01-8.5/`，源码快照、补丁及原始日志仅本机保存。

现有包只是本轮被检验对象，不是新交付版：

`/Users/apple/Documents/ChatGPT/网站料单Skill/kdocs-diagnostics/kdocs-inventory-app/dist/KDocs库存同步8.5.0-x64.zip`

SHA-256：`7796832034325ea0cbe062c38da3aaa1f496d3e5714c86988d97ead2d02f65e6`。

本轮设计和测试不改变该 ZIP，不要求用户为了本次设计重新下载或打开它。
