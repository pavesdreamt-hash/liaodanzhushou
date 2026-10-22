# 商品分页统一：3.9.1

D-233范围：用户指出批量窗口与库存首页的分页按钮、字号不同。两处共用箭头＋页码组件与样式：28px按钮、15px图标、12px页码，统一边框/圆角/颜色、悬停/禁用/焦点。保留原页数、每页数量、搜索排序和操作逻辑、按钮可访问名称及库存HTML标识；空数据统一0/0且不可翻页。只覆盖这两处，不扩大到来源对应或订单等其它分页；上一轮待上新筛选讨论不在本次实施范围。

验证：真实页面对比computed style和控件几何；首/中/末页、搜索缩页、空数据、键盘与宽窄窗口；最终Mac App隔离零窗口启动和相同控件验收。沿用consistent-dev，静默开发，不读取正式资料/网站。按3.9.1连续交付，新批1/5，不到GitHub提交节点。以下为完成后的实际证据。

## 最终成品与使用

- 版本3.9.1，Mac x64，稳定身份`com.liaodan.assistant.live`。成品：`/Users/apple/Documents/ChatGPT/网站料单Skill/liaodan-assistant-next/交付/聊单助手3.9.1/聊单助手.app`。
- 等当前任务完成，从Mac顶部菜单栏退出旧聊单助手后台，再在Finder中双击这份App，左上版本应为3.9.1。沿用原资料；无需终端或测试数据库。
- app.asar SHA256：`7916fee24fb6ee1659e4a90e1620dc976b867fe1e402bb321a672618815376ec`。可执行文件SHA256：`f60e3fde9060c0c0f77629e77070e1e3ff2b0eaeab6bb835aad439e403c47342`。完整清单在交付目录SHA256.txt。

## 本轮实际验证

- `npm run typecheck`、最终`npm run check`、指定目录Mac x64构建均退出0；日志在`artifacts/pagination-3.9.1/`。没有新增依赖或后端业务改动。
- 后台正式页面综合1次与最终交付App综合1次均通过。精确App在虚构临时资料目录启动，只用无窗口Chromium访问其本机HTTP桥；包内版本3.9.1、isPackaged=true、BrowserWindow=0、外部网站请求0、页面错误0。此为实际包启动与正式渲染页面验收，不是原生可见窗口或IPC验收。
- 两处首/中/末页翻页实际更换商品行；首尾按钮禁用；空搜索0/0且不可翻页；库存清空搜索恢复1/3。Enter翻页、批量两按钮间Tab通过。1280×820与820×640分页都在视口内可达（库存页沿用原正文滚动）；没有扩展修改原窄窗整页布局。
- 两处计算结果相同：font-family Inter/-apple-system/system-ui/PingFang SC/sans-serif，12px、400字重、16.8px行高；按钮28×28、0padding、1px边框、7px圆角，箭头15px/stroke1.8，间距5px，禁用opacity0.5。悬停/焦点规则共用同一作用域CSS，键盘行为已验；没有声称逐像素比较所有鼠标状态。
- 亲自查看最终`package/main-pager-1280.png`、`batch-pager-1280.png`、`batch-pager-820.png`和`inventory-820.png`、`batch-820.png`，两处分页一致。结果为`package/result.json`；开发结果在`ui/result.json`。
- `package-files.json`：165项自有包文件逐字节对应工作区，较3.9.0仅renderer/app.js、USER-GUIDE.md、RELEASE-NOTES.md三项变化；3.9.0原归档哈希与OAuth保持。plist版本/身份、x86_64以及`codesign --verify --deep --strict`通过。
- 初次后台验证受沙箱本机端口限制，授权后台验证后继续。开发验证曾错误地要求被弹窗遮住的主页面分页在视口内，以及要求最后可聚焦项Tab后仍在该按钮；修正测试为关闭弹窗后滚动原页面及两按钮间Tab，未为迎合测试修改其它布局/焦点规则。最终验证通过，失败记录保留。

## 保留与边界

成品通过后检查进程，仅删除未运行的3.8.6旧App和本轮重复构建App；删除分配占用991,524KiB（约968MiB），即时可用空间增加991,900KiB（约969MiB）。保留3.8.7～3.9.1五App、源码及小型历史证据，最终归档哈希再核对保持；详见`cleanup.json`。没有退出/重启用户正式App。

本轮仅验证这两处分页，未读正式商品/聊天/账号/Excel、未操作真实网站/Google/AI；原生IPC、外部业务端到端、整套App与历史17项全量旧失败没有本轮复验，不能称全软件通过。新批第1/5次，工作区已修改，未提交/未推送；HEAD为`601708199187ec6f2243ffc8e2363034a357d569`、暂存区空，上一批五次已同步的收据保留。
