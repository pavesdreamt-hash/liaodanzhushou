# 商品详情说明收纳到标题备注：3.9.3

D-235范围：把用户截图中的“查看ShopPlus资料；名称、底价和介绍仅保存到本机。网站库存和上架状态需逐项确认。”移到商品名称标题后的备注入口，悬停可看、点击/键盘可展开完整说明；不再单独占一行。只处理ShopPlus商品详情正常状态，保留未找到时的错误说明、原按钮/表格/资料和全部业务逻辑。上一条“只读试采集”状态栏仅讨论用途，本次没有另行授权删除，不顺带修改。

按连续3.9.3、新批3/5准备交付；保留此前工作区。后台虚构资料验证标题位置、鼠标/键盘开关和宽窄窗口，再构建验证最终App；不弹调试窗口或切换正式App。实际证据如下。

## 成品与使用

Mac x64版本3.9.3，稳定身份`com.liaodan.assistant.live`。精确成品：`/Users/apple/Documents/ChatGPT/网站料单Skill/liaodan-assistant-next/交付/聊单助手3.9.3/聊单助手.app`。等正在运行的任务结束，从Mac顶部菜单栏退出旧后台，在Finder双击此App，核对左上版本3.9.3；沿用原资料，不需终端或测试库。

app.asar SHA256：`efdf2b296dc4a47efa1299d03f2afe357c7ef0e76ad959c934bc783c2bc052c0`；可执行文件：`e77c02475ffb6b518833109ac160bf238bf12a9e217b06ac85d772d879a3a0c4`。交付目录另含SHA256.txt和使用说明。

## 实际核验

- 正式ShopPlus详情复用原标题和共享dialog/trapDialogFocus，原文字放在标题后18px备注按钮中；正常subtitle隐藏，未找到时错误subtitle保留。只改前端局部，业务处理器和其它页面不改。
- npm run check通过；后台正式页面综合1次、最终精确App综合1次通过，证据在`artifacts/product-note-3.9.3/`的check.log、ui/result.json、package/result.json。此低影响界面改动未新增镜像单元或重复全量桌面测试。
- 1280×820和820×640：短标题后8px，备注按钮18×18，原独立说明行不占位置；完整说明title属性保持原文，鼠标点击与Enter打开、Tab留窗、Esc/关闭返回原按钮。长中文加无空格标题仍能打开；未找到商品显示原错误说明且隐藏备注。
- 已亲自查看最终detail-1280.png、note-820.png、missing-820.png；开发时另查看long-title-820.png。窄窗原页面其它已知密度/换行不属于本次整页验收。
- 包内版本3.9.3、isPackaged、临时userData和BrowserWindow=0核对通过；仅隔离虚构资料、无头Chromium和本机HTTP桥，页面错误0、外部请求0。不弹出可见调试窗口或切换用户正式App。
- 165项自有文件逐字节对应，较3.9.2仅renderer/app.js、USER-GUIDE.md、RELEASE-NOTES.md三项变化；旧3.9.2归档与OAuth保持。plist版本/身份、x86_64和严格深度签名通过，见package-files.json。
- 初次验证脚本将隐藏的布局设置dialog一起匹配而失败；限定商品资料说明窗口后通过，失败日志ui.log保留，未修改App迁就断言。

## 保留与边界

通过后检查进程，仅清理非运行3.8.8旧App及重复构建App，分配占用978,324KiB（约955MiB），即时可用空间增加978,928KiB；保留3.8.9～3.9.3五App、新版哈希、源码、正式资料与小型历史证据。见cleanup.json。

本轮未读写正式商品/账号/聊天/Excel或访问真实网站/Google/AI。原生可见窗口/IPC、真实业务端到端、整套App及历史17项全量旧失败未重验，只确认上述局部。新批第3/5次，工作区已修改，HEAD`601708199187ec6f2243ffc8e2363034a357d569`和空暂存保持，未提交/未推送；上批同步收据保持。
