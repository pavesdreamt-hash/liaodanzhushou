# 8.8 聊天关联与既有问题修复验收

本轮依据：用户在“先找问题，不修复”之后明确要求“把之前的问题，也一并都修复了”。继续当前工作区，保留既有修改。总结果 **MIXED / BLOCKED**：本轮已定位的代码缺陷及本地回归通过；真实系统授权和完整真实链路尚未通过，不能称 NEW-01～NEW-07 全部完成。

## 可直接使用的交付

- ZIP：`dist/KDocs库存同步8.8.0-x64.zip`，151,392,650 字节。
- SHA-256：`57e29ac4cbfae0eb1a4a9d335e3d212549c589df08a40831ea86b261badeaf95`。
- 解压后双击 `KDocs订单助手 8.8.0.app`，不需要 `.command`。先退出旧版，避免旧程序继续占用相同资料。可放入“应用程序”，本次没有覆盖已安装 App。
- 正常资料位置继续为 `~/Library/Application Support/KDocs Order Assistant`；不清空订单，不要求用户操作隔离验收版。自动测试使用临时虚构数据库，未打开正式订单库。
- macOS x64、ZIP 完整性、框架链接、临时签名验证通过；不是 Developer ID 公证版。首次若被系统阻止，请按使用说明的系统“打开”流程处理，不关闭系统安全功能。
- 解压最终 ZIP 中的 App 已真实启动；界面 8.8、包版本 8.8.0，90 个源码/界面/说明文件逐字节相同。package.json 的运行字段一致，electron-builder 正常去除了开发元数据。

## 问题、原因与修复

| 问题 | 查明的原因 | 本轮处理与证据 |
|---|---|---|
| 选了时间能关联，读取又提示时间无效 | 关联未禁止未来时间，读取另用一套校验；页面直接展示 UTC，难以核对 | `assistant-range.mjs` 统一关联/读取校验；页面显示本机时间。未来结束时间在关联前拒绝，未写入半条绑定。`assistant-connection-fixes.test.mjs`、`assistant-connection-ui.e2e.mjs` |
| 默认开始、结束都为当前，结束不再变化 | 两个输入默认现在，保存固定截止，没有“最新”模式 | 新关联开始留空由用户确认，默认每次读取到最新；读取成功才更新截止，失败保留原记录。既有固定范围不扩大；迁移 19 保存模式 |
| 确认关联时提示重新核对 | 核对凭证有 5 分钟有效期；再次核对会清空其他凭证 | 有效凭证独立保留、限制数量；确认前重新核对目标，目标改变时必须再次确认。保留账号/聊天比对，不绕过校验 |
| 账号标识、聊天标识输入框暴露 | label 的 display 样式覆盖 hidden | 助手内显式遵守 hidden，只展示核对后的号码，不要求手填内部标识 |
| 关联后“没反应”，只见笼统失败 | 缺成功反馈；状态刷新清除全局错误；读取失败落库时丢失具体原因 | 操作进度/成功/失败显示在助手内；只读刷新不清除错误；明确保留范围、聊天、加载等原因。虚构 DOM 真实点击与最终包页面验证 |
| 钥匙串输入密码后仍出现/等待 | 界面超时未取消原生操作，之后重试可再次请求；截图不能证明密码是否正确 | 同一原生请求跨超时复用，操作未结束时不发新请求；新增显式重新检查；晚到授权后恢复已有密钥与提取连接，保留 5/5 计数。单元与源码设置 UI 通过；最终包系统授权仍待完成 |
| 8.8 真实核对聊天失败 | 当前运行的 8.7 App 持有同一 WhatsApp profile。Chrome 实际返回“正在现有的浏览器会话中打开”，新进程退出 | 最终包已真实验证显示 `WHATSAPP_PROFILE_IN_USE`，明确要求关闭旧版的专用 WhatsApp 窗口；没有结束旧版 App、删除锁或清空登录资料 |
| 旧读取晚到覆盖新状态 | 仅校验绑定版本，未比较读取版本 | 成功/失败写回同时校验 binding_revision 与 read_revision；较旧失败不能覆盖较新成功结果 |
| 以前的空列表、文件导入、启动器、布局等问题 | 本轮未发现新的回归；不能用它们推断本次聊天连接成功 | 最终包实际完成 xlsx/xls/csv 选择、取消、重选、预览、导入；新草稿返回列表、完整聊单/TXT/重启通过；包名带版本且无 command；助手保留已确认布局 |

订单删除/隐藏只是此前讨论过的功能选择，本轮没有把它作为“已有缺陷”擅自新增。没有删除运行中的旧版及必要回溯包。

## NEW 验收矩阵

下表的 PASS 限定为列出的本地业务规则和虚构数据验证。真实 AI 与真实浏览器状态单独列示。

| 编号 | 实际修改文件 / 复用实现 | 实现与操作证据 | 状态 |
|---|---|---|---|
| NEW-01 空白订单 | 复用 `src/orders/draft-orders.mjs`、`renderer/renderer.js`；本轮不改建单业务 | 唯一 ID/固定编号、可空网站单号、NULL、无空包裹、保存重启、首次返回列表、网站去重；`build-final.log`、`final-packaged-tests.log` | **PASS** |
| NEW-02 草稿资料商品 | 本轮修改 `renderer/draft-orders.js` 的助手部分，复用编辑/成本/系列分包规则 | 原文姓名/电话、来源、正整数、多系列、成本 NULL 和快照、已含优惠不重复扣除；最终包确认/报单/备份重启 | **PASS**（手动及持久化规则） |
| NEW-03 专属助手 | 修改 `renderer/draft-orders.js`、`orders.css`、`renderer.js`、`assistant-settings.js`、`index.html`；`async-secret-storage.mjs`、`assistant-settings.mjs`、`main.mjs`、`preload.cjs`、`local-web-server.mjs` | 切单/关闭/复购隔离、900×700、内部标识隐藏、密钥安全重试；源码加密设置 UI 通过，候选包系统钥匙串等待未完成 | **BLOCKED**：UI/程序保护 PASS，最终包系统授权待用户完成 |
| NEW-04 关联读取 | 新增 `assistant-range.mjs`；修改 `whatsapp-browser.mjs`、`order-assistant.mjs`、`draft-orders.js`、`verify-live-assistant.mjs` | 统一时间、固定/最新、过期核对刷新、切换保护、重复去重、具体错误；虚构 DOM 通过。8.7 两条真实消息历史证据保留；8.8 本次受旧版 profile 占用阻塞 | **BLOCKED**：8.8 真实读取未通过；普通时间边界真实验收还受原授权范围限制 |
| NEW-05 提取补全 | 修改 `order-assistant.mjs` 读取状态保护；复用原字段/商品/价格/证据校验 | 明确/缺失/冲突、询价、未接受报价、改量、换商品、恶意指令、人工值保护、确认后只建议均在本地回归；本轮无真实 AI 请求 | **BLOCKED**：真实 AI 额度已 5/5，修复后新真实请求和广泛样本仍未完成 |
| NEW-06 保存纠正履约 | 新增迁移 `019-assistant-range-mode.mjs`；修改迁移索引、`order-data-protection.mjs`、`order-assistant.mjs`、`packaged-assistant-backup.e2e.mjs` | 同事务/回滚、撤销保护、客户确认、报单失效、原物流费/利润；18→19 失败回滚/备份，最终 App 17→19 升级、助手/依据/确认/成本备份恢复及重启 | **PASS** |
| NEW-07 实际流程 | 扩充 `assistant-connection-ui.e2e.mjs`、`production-startup.e2e.mjs`；复用 `chat-drafts.e2e.mjs`、订单 UI 回归 | 最终包虚构草稿→关联→提取→地址冲突→成交价/成本→客户确认→分包/TXT→重启→同客第二单通过。模拟不代表完整真实链路 | **BLOCKED**：模拟 PASS；真实连接、AI 与必要人工语义验收未全部完成 |

## 验证记录

证据根目录 `artifacts/assistant-fixes-8.8/`：

- `build-final.log`：**256/256** 单元回归通过，失败/跳过 0；项目检查通过，最终构建成功。
- `source-ui.log`：原订单/助手布局/响应式 **8/8** 通过。
- `source-settings-drafts.log`：设置加密、重启、切换、重试按钮及完整虚构聊单 **2/2** 通过；真实 AI 请求 0。
- `connection-ui.log`、`packaged-connection.log`：本次关联界面与真实 DOM 算法各 **2/2** 通过。前者使用源码，后者加载候选包前端与工作区后端；两者均为虚构浏览器页面。
- `packaged-tests.log`：首个候选包 **12 通过、1 失败**。失败是系统钥匙串尚在等待授权，未取得“密钥已保存”。原始失败保留，没有删除该测试或改成 PASS；等待授权时订单仍可操作。
- `final-packaged-tests.log`：补上 profile 占用提示后，重新构建并解压的最终包 **11/11** 业务/启动测试通过。没有重复运行尚无人工授权的密钥保存用例；该项仍 BLOCKED。最终包未修改该次候选包的安全存储逻辑。
- `final-packaged/packaged-assistant-backup.json`：最终包 17→19、迁移前备份、草稿/确认订单/消息/依据/成本恢复及重启通过。
- `final-real-read/packaged-real-read.json`：真实 Chrome 由旧版占用，**BLOCKED**；最终包正确显示原因。本轮没有成功读取消息，没有新增 AI 请求。一次较早复验误归在 inspect 超时，详细追查后定位为 browser open 被占用，原失败记录保留。
- `package-verification.json`、`packaged-source-verification.json`：最终包结构、签名、校验值、版本、90 个文件一致。
- 初次未提权回归出现本机回环端口 `EPERM`，使用允许的环境重跑后全通过；测试首轮的两处旧预期和一处测试时钟参数错误已修正并重跑，未弱化业务断言。

可审核的虚构截图：

- `final-packaged/packaged-browser-assistant-range-900x700.png`：最终包的新版关联区域。
- `final-packaged/import-formats-production-complete.png`：三种格式通过生产模式导入。
- `final-packaged/01-draft-conflict-900x700.png`、`04-conflict-choice.png`：资料和地址冲突。
- `final-packaged/02-report-preview.png`、`03-restart-orders.png`：TXT、重启及两条独立订单。

## 剩余真实关口及责任

1. **用户一次操作**：先退出正在运行的旧版 8.7（包括它打开的专用 WhatsApp 窗口），再打开 8.8。登录资料保留，不需要重新发送那两条测试消息。开发随后复验关联/读取/切单/重启，用户无需跑功能回归。
2. **用户系统授权**：如果 macOS 弹钥匙串框，只在系统窗口完成；回到助手设置点“重新检查安全存储”。代码可以避免重复请求，不能替用户解锁钥匙串，也不能证明输入的密码正确。不索取密码/API 密钥聊天文本。
3. **追加验证授权仍待答复**：原真实 AI 5 次已用完。后续若继续真实提取验收，需明确授权最多再 3 次虚构资料请求，每次 20 秒、无自动重试；未自动开启日常模式绕过额度。
4. **时间边界授权仍待答复**：普通范围算法需在指定同一聊天检查已加载消息的时间元数据（包括边界前的时间），不读/返回范围外正文和标识。此前自动审核因原范围仅限两条新消息而拒绝，未绕过。当前只有精确两条 ID 的授权，不能宣称正常时间筛选已真实通过。
5. **开发继续**：真实条件满足后自主复验、修复、重新验证产物；只将需要人工语义判断的结果集中交给用户一次。未满足前保留 MIXED/BLOCKED，不称整体完工。

没有读取正式订单数据库、真实 KDocs 库存或真实 Google Sheets，没有发送消息、清空数据、提交凭据、覆盖已安装 App 或推送远程。本地提交及原工作区保护证据见 `git-delivery.json`。
