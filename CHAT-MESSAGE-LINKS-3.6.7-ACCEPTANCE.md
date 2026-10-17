# 3.6.7 局部验收：聊天商品链接打开

日期：2026-10-17。用户指出客户消息中的“打开链接”点击没有反应，授权修复该点击行为。沿用consistent-dev 1.5.0及现行项目规则；仅修复打开流程及必要反馈，未改页面风格或其它业务。

## 原因及修复

3.6.6只生成target=_blank链接，而主窗口setWindowOpenHandler统一拒绝新窗口。隔离虚构中文商品链接在文件桌面/本地网页桌面均复现系统打开次数0；不能把href存在当作可用。

现改为用户点击后经既有受控父页桥接，交主进程调用系统默认浏览器，保留完整中文路径、查询和锚点。App仍保留原聊天，不加载远程商品页。主进程再次校验HTTP/HTTPS网址，拒绝文件/脚本/数据协议、凭据地址、控制字符及过长无效值；原IPC来源校验、HTTP token/origin校验、全局新窗口和导航限制保持。

进行中同网址防重；失败显示“打开失败，点击重试”，悬停显示实际原因，同时在输入区状态反馈。键盘Enter同路径。仅修改消息链接文本/事件及必要状态，原CSS/HTML、消息正文/翻译/图片/发送、历史加载、客户编辑、订单对齐、来源同步和商品规则保持。

## 最终成品结果

- npm run check通过；链接及本地服务7项单元回归7/7通过。
- 最终交付App的相关用例按不重复计8/8通过：文件桌面IPC、本地网页桌面IPC、独立浏览器真实HTTP桥接三项链接；旧消息读取/保留/锚点/迟到响应、订单可见文字及单元格对齐两项；消息动作、客户提取和非模态浮窗、系统安全通知三项。最初7项集合通过，补充独立HTTP后为8项，重复运行两项链接不重复计数。
- 文件/网页桌面均断言runtime=electron及实际file/http协议；独立headless Chromium断言runtime=browser，真实POST app:open-external-link返回200并触达系统入口替身，非法token返回403。仅桌面加载http页面不会自动变成浏览器桥接，此区分已用独立用例验证。
- 中文链接完整交给系统；失败可重试，进行中两次点击仅一次调用，键盘Enter生效，非法协议/凭据不调用系统。App页面/窗口数保持，无网站写入或消息发送。
- 1280×820及820×640下长中文商品网址/打开链接完整位于气泡内，最终截图已实际查看。没有新增CSS或改字号/列宽/图标。
- 真实原生验证：在最终App的隔离虚构消息中点击用户截图YB95公开网址，调用真实shell.openExternal后系统返回成功；随后通过CUA只读浏览器清单确认Chrome标签标题YB95及完整对应网址，标签556240499。未登录、提交表单、购买或写网站，不读取其它页面正文。
- 原生试验前两次因虚构会话入口未成功建立而停在选择会话，未触发链接，不计真实打开失败或成功；改用已验证IPC虚构消息后完成上述真实验证。正式产品源码不为该测试改动。
- 成品已直接正常打开：旧3.6.6主进程98335正常退出，新3.6.7主进程8932；启动日志packaged=true、version=3.6.7、arch=x64、主窗口visible=true。沿用 `/Users/apple/Library/Application Support/Liaodan Assistant Live`，未让用户使用测试资料。

## 保护范围和未检查项

147个包内自有源码/资源/说明逐一与当前工作区哈希对应。对比3.6.6仅src/main.mjs新增受控入口、preload/browser桥接、新external-link模块、renderer/app.js及两份内置说明改变，另同步版本元数据；全部CSS/HTML、订单/商品/来源业务模块、资料提取模块、迁移、资产保持。改前已有3.6.6工作区改动及验收报告保留，没有重置Git或旧成品。

正式商品库存、待同步和来源快照三文件哈希保持；旧3.6.6 App保持，签名严格深度校验通过。测试均使用隔离虚构客户及系统调用替身，真实验证只打开截图指定公开网页，不发消息、不请求真实AI、不写Google或网站。

仅验证系统接受打开及浏览器出现对应YB95标签，不保证所有第三方网页永久可用或网络不失败。原订单编辑弹窗宽度断言、007商品改名身份匹配、17项历史全量失败及整套App历史功能未在本版解决或全部重验；前版记录继续保留，不以本次8/8局部检查宣称全部通过。

## 交付与Git

成品：`/Users/apple/Documents/ChatGPT/网站料单Skill/liaodan-assistant-next/交付/聊单助手3.6.7/聊单助手.app`，正常双击即可，本轮已直接打开。只在项目交付目录生成App，不放桌面，不生成ZIP/DMG，旧App保留。

- app.asar SHA-256：`e895e1f4b6254a8ff7ea63319735f21a8a69108033ec1f3295ef4c70a9b3f78f`
- 可执行文件 SHA-256：`27fc9a8b01a279c7edb6eb2826beb983c0f96150478136907fa69288a807b5ce`
- 校验文件：`交付/聊单助手3.6.7/SHA256.txt`

3.6.6连续加一至3.6.7，新批次第2次；未到每5次节点，本轮源码未提交/未推送，HEAD和暂存保持，上一批0ec9af9已推送记录保持。下个应用版本顺序3.6.8。

证据：artifacts/message-link-3.6.7下before.log、source-tests.log、check-final.log、unit-final.log、final-app-tests.log、final-links.log、http-bridge-test.log、final-ui/、native-open.json、browser-observation.json、package-manifest.json、source-scope.json、package-identity.json、formal-data-after.json、normal-launch.json和normal-startup.json。

完成前重读AGENTS.md和CONFIRMED-UI-BASELINE.md现行规则及本轮D-207，对照实际改动/最终成品；上文通过、失败历史和未检查分别登记。
