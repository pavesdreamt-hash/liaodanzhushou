# 聊单助手 1.9.5｜中文草稿与快捷回复英文转换验收记录

## 本次修复目标

恢复聊天工作台人工回复区的中文转英文能力：输入中文或选择既有快捷回复后，用户可通过明确的“转为英文”操作生成可编辑英文草稿。快捷回复的内容、变量和规则不在本轮设计范围。

## 已核验文档与规则

- `AGENTS.md`：最终交付必须可直接使用；Mac 桌面应用必须构建、打包并实际启动。
- `CONFIRMED-UI-BASELINE.md`：D-110 规定本轮仅处理人工回复区的显式转换、草稿保护、测试和交付；“中文输入／英文翻译”继续是查看和手动编辑标签，不得暗中触发翻译或发送。
- `AI-ASSIST-1.9.1-ACCEPTANCE.md` 与 `TOPBAR-RESPONSIVE-1.9.4-ACCEPTANCE.md`：仅作为已完成邻近功能的验收记录；不把 AI 草稿、窄窗口顶栏或整页工作台扩大为本轮已验收范围。
- `DISCUSSION-LOG.md`：商品库存结构、图片缓存、网站上下架和描述回写仅记录为后续讨论，未改库存页面、ShopPlus 商品接口或网站资料。

## 实现边界

- 工作台输入工具行提供唯一、可见的紫色“转为英文”按钮；空中文时禁用，转换中显示“翻译中…”。既有 Cmd/Ctrl+Enter 保持为同一明确转换入口。
- 中文、英文、快捷回复、表情或清空操作均递增草稿版本；重复点击不会重复请求，迟到结果不能覆盖已修改草稿。
- 成功后切换到可编辑英文草稿；失败、未配置或无效结果保留当前中文与原英文，不发送消息。
- 快捷回复仍只填中文并清空旧英文；它不会自动调用翻译或发送，用户必须另点同一个转换按钮。
- 为最终成品的虚构隔离验收增加测试夹具安全存储：只有 `--isolated-user-data` 与 `--orders-test-user-data` 指向完全相同目录且提供模拟设置时才使用；该临时目录由验收脚本删除。正常 App 与非隔离测试仍使用 macOS 安全存储，未写入真实密钥。

## 真实执行的检查

- `npm run check`：通过 TypeScript、Vite、共享 WhatsApp 兼容性和项目检查。
- `node --test --test-concurrency=1 --test-timeout=60000 test/chat-workbench-composer-translation.e2e.mjs`：1/1 通过。覆盖空中文禁用、普通中文仅在点击后转换、快捷回复不自动转换、失败保留双草稿、防重复请求、迟到结果保护、零发送和页面无错误。
- `test/manual-translation.test.mjs`：7/7 通过；既有翻译输入限制、无效结果保护、AI 草稿与图片识别边界保持。
- `test/chat-workbench-ai-assist.e2e.mjs` 与 `test/chat-workbench-send.e2e.mjs`：均通过；AI 草稿仍需明确动作，既有人工发送入口仍可用。发送回归使用虚构号码和虚构附件。
- `git diff --check`：通过。GitHub 发布前已将历史文档和自动化夹具中的旧真实验收号码脱敏为描述文字／虚构号码；未发现真实 API key、token、客户聊天或订单资料。

## 最终 Mac x64 App 验收

- 最终成品为 `dist/聊单助手1.9.5-x64/mac/聊单助手 1.9.5.app`，不生成 ZIP。包内 Bundle ID 为 `com.liaodan.assistant.live`，版本为 `1.9.5`，可执行文件为 `Mach-O 64-bit executable x86_64`；`codesign --verify --deep --strict` 通过。
- 最终 `.app` 已在生产模式的临时隔离目录中直接启动。验收报告 [`artifacts/composer-translation-1.9.5/app-verification.json`](artifacts/composer-translation-1.9.5/app-verification.json) 记录 `packaged=true`、版本 `1.9.5`、`arch=x64`、`errors=[]`、`realMessagesSent=0`、`realAiCalls=0`。
- 使用虚构 WhatsApp 会话、虚构号码、虚构 API key 和模拟翻译响应，实际验证：唯一可见转换按钮、普通中文点击后一次转换、快捷回复填入时调用数为 0、再次明确点击后一次转换、英文可编辑、既有“发送确认”入口仍可见且不发送。
- 已人工查看最终包的 [`1280×820`](artifacts/composer-translation-1.9.5/composer-translation-1280x820.png) 和 [`820×640`](artifacts/composer-translation-1.9.5/composer-translation-820x640.png) 截图；两个尺寸均可看到“转为英文”，820×640 沿用既有横向滚动策略。
- App 稳定目录清单 SHA-256 为 `e12c9ae9c43bfd7f340a118da4fa22b7a2f26807fac42293ff8808c5b40038a1`；计算方法和数值见 [`dist/聊单助手1.9.5-x64/APP-SHA256.txt`](dist/聊单助手1.9.5-x64/APP-SHA256.txt)。

## 正常运行切换与未扩大范围

- 启动新版前，已只通过 macOS 正常退出流程关闭运行中的 1.9.4；约 1 秒内确认其主进程退出，未强制结束 Chrome 或 WhatsApp 子进程。随后直接启动正常资料目录下的 1.9.5，确认 1.9.4 进程为 0、1.9.5 主进程为 1；未读取、输出、修改或发送任何真实 WhatsApp、客户或订单资料。
- 单独的生命周期回归中，“安全退出真正结束应用”通过；两个“红色关闭后保持隐藏”的断言受 macOS 激活时序影响未稳定通过。本轮未改动该已完成的窗口隐藏行为，也不将其算入 D-110 通过项；正常旧版退出和新版启动已按上述实际流程验证。
- 未运行完整 `npm test`。为发布前脱敏而重新执行的一条历史工作台大回归仍有既有的“新消息暂不可用”时序断言失败，另一条历史刷新回归在测试窗口启动阶段超时；它们不覆盖 D-110，未通过项没有被计入本次翻译修复的通过范围，也没有为掩盖它们改应用逻辑。
- 本轮只认定 D-110 输入转换局部修复通过，不代表工作台整页、历史手机底部 P1–P4、商品库存页、网站上下架、快捷回复规则或其它页面完整基准通过。
