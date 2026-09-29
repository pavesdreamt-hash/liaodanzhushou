# 聊单助手 1.9.6｜两入口英文翻译与回译核对验收记录

## 本次修复目标

修复聊单工作台人工回复区的中文转英文路径：保留“中文输入／英文翻译”两个文字入口，去掉重复的“转为英文”按钮；生成后的英文可在同一固定高度输入框直接编辑。英文非空时提供小型双向箭头，按需将当前英文回译成中文以核对含义，不发送、不中断编辑，也不开发商品库联动。

## 已核验文档与规则

- `AGENTS.md`：桌面应用交付必须可直接使用，必须构建／打包并实际启动最终 App。
- `CONFIRMED-UI-BASELINE.md`：D-111 限定为工作台 composer 的翻译、回译、必要测试和文档；商品库存、ShopPlus 接口、真实聊天和其他页面不在本轮范围。
- `COMPOSER-TRANSLATION-1.9.5-ACCEPTANCE.md`：只作为上一版已完成翻译入口的验收背景；1.9.6 以新的两入口行为替代其“转为英文”按钮。

## 实现边界

- “英文翻译”在中文非空且英文为空或与中文不同步时，才作为明确的正向翻译动作；成功后进入可编辑英文。已有对应英文只切换查看／编辑，不重复请求。
- 中文编辑不再删除已手改英文，而是标记需要更新；更新渲染仅在输入值不同的时候写入 textarea，保留光标和选区。
- 回译只在人工模式、英文非空且用户明确点小型双向箭头时发生。浮层并列显示“原中文／英文回译”，不覆盖任何草稿、不发送消息；相同英文结果仅在当前窗口内缓存。
- 主进程新增受限 `translate-draft` 回译桥接：只接受当前英文，强制服务返回逐字相同的英文和非空中文；没有新增 AI purpose、自动重试、订单写入、聊天读取或商品库调用。
- 快捷回复模板、规则、发送确认、附件、表情、AI辅助、WhatsApp、订单、库存和 ShopPlus 行为不改。没有生成 ZIP，也没有 GitHub 推送；1.9.6 不是五版本递交节点。

## 真实执行的检查

- `npm run check`：通过 TypeScript、Vite、共享 WhatsApp 兼容性和项目检查。
- `node --test --test-concurrency=1 --test-timeout=60000 test/manual-translation.test.mjs test/chat-workbench-composer-translation.e2e.mjs test/chat-workbench-ai-assist.e2e.mjs test/chat-workbench-send.e2e.mjs`：11/11 通过。
  - 覆盖两个文字入口、无“转为英文”、普通中文和快捷回复的显式前译、同框英文直改、回译缓存、前译／回译迟到保护、失败保护和零发送。
  - AI 草稿和既有发送入口回归使用虚构会话、虚构号码和虚构附件。
- `git diff --check`：通过。
- 额外检查发现原样式文件范围外存在一个历史 CSS 函数未闭合，浏览器会从该点忽略后续规则。为严格不扩大修改范围，D-111 新样式置于该点之前；未改动该历史订单样式。

## 最终 Mac x64 App 验收

- 最终成品为 `dist/聊单助手1.9.6-x64/mac/聊单助手 1.9.6.app`，不生成 ZIP。包内 Bundle ID 为 `com.liaodan.assistant.live`，版本为 `1.9.6`，可执行文件为 `Mach-O 64-bit executable x86_64`；`codesign --verify --deep --strict` 通过。
- 最终 `.app` 已在生产模式的临时隔离目录中直接启动。验收报告 [`artifacts/composer-translation-1.9.6/app-verification.json`](artifacts/composer-translation-1.9.6/app-verification.json) 记录 `packaged=true`、`version=1.9.6`、`arch=x64`、`errors=[]`、`realMessagesSent=0`、`realAiCalls=0`。
- 使用虚构 WhatsApp 会话、虚构号码、虚构 API key 和模拟前译／回译结果，实际验证：仅两个文字入口；无第三个“转为英文”；前译后的英文可直接编辑；双向箭头浮层保留原中文和英文回译；相同英文再打开不再请求；快捷回复不自动翻译；既有“发送确认”入口仍存在且未发送。
- 已人工查看最终包的 [`1280×820`](artifacts/composer-translation-1.9.6/composer-translation-1280x820.png) 和 [`820×640`](artifacts/composer-translation-1.9.6/composer-translation-820x640.png) 截图。1280×820 显示回译对照与小箭头；820×640 显示两个入口和小箭头，并沿用既有横向滚动策略。
- App 稳定目录清单 SHA-256 为 `eebb9aab4ee17df60bb27368e98d80189ec10521ffb807358efbd26fa030ee9c`；计算方法和值见 [`dist/聊单助手1.9.6-x64/APP-SHA256.txt`](dist/聊单助手1.9.6-x64/APP-SHA256.txt)。

## 正常运行切换与未扩大范围

- 启动新版前，已通过 macOS 正常退出流程关闭正在运行的 1.9.5；确认其主进程退出后，直接启动正常资料目录下的 1.9.6。没有强制结束 WhatsApp 或 Chrome 子进程，也没有读取、输出、修改或发送任何真实 WhatsApp、客户或订单资料。
- 本轮只认定 D-111 输入翻译与回译核对局部修复通过，不代表工作台整页、历史手机底部 P1–P4、商品库存、网站上下架、ShopPlus 商品读取或其它页面完整基准通过。
