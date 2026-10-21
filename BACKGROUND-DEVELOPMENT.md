# 后台开发与验证

2026-10-21，依据用户“每次修改 App 反复弹出调试页面影响电脑使用”的要求。

日常先做后台检查和受影响业务测试，页面检查使用无窗口浏览器及截图。现有普通桌面 E2E 会触发主窗口的置顶/抢焦点，不能作为日常默认。当前产品代码、3.7.6 成品和应用版本保持；只新增开发工具并调整约定，不增加交付次数。

## 已可使用的入口

从本项目目录执行：

```sh
node scripts/check-background.mjs test/ready-opener.test.mjs
node scripts/check-background.mjs --page fb-chat
node scripts/check-background.mjs --page inventory
```

默认做类型/共享模块检查，测试只运行明确指定的 `.test.mjs`。页面检查使用已构建的正式网页资源、独立无窗口 Chromium、空白虚构服务，外部请求被拦截。截图和收据在 `artifacts/background-check/`；不读取正式配置、数据库、Cookie 或密钥，不启动 Electron、不打开 DevTools。需要验证源码 UI 变化时先运行 `npm run check` 生成最新网页；`--skip-check` 仅用于明确复用已有检查/构建结果的场景。

该页面适配目前仅覆盖 FB 聊天及商品库存的空白状态，不代表商品/聊天业务全链路。其它界面和交互应补充同源组件的明确虚构资料适配，不凭空响应真实业务成功。

现有生产处理器回归已有无窗口浏览器模式，例如 `test/source-task-readback.e2e.mjs` 的 `实际browser` 用例。此路线仍启动隔离 Electron 后端，必须使用已有浏览器工作区/临时 URL 文件参数，不创建管理窗口；只选择浏览器用例并核对实际执行数量，避免同文件 IPC 用例又弹窗。桌面 IPC、菜单栏、原生文件选择等必须另行集中验证，不能用网页截图冒充。

`scripts/run-desktop.mjs` 必须明确收到 `--visible` 才启动桌面，异常退出默认停止。日常不使用可选的 `--restart-on-crash`。确需可见成品检查时提前说明并集中安排；不自动退出、重启或切换用户正在使用的正式 App。

## 本轮验证范围

- 类型检查、共享模块检查和 `ready-opener` 三项测试通过。
- 开发启动器未传 `--visible` 时返回失败并提示后台入口，没有启动 Electron。
- 两个页面的 headless 结果和宽窄截图分别在 `artifacts/background-check/` 留档；没有读取真实业务资料或启动桌面 App。
- 未重新执行桌面 IPC/完整业务回归，没有重新打包、升版或修改旧成品。当前既有应用改动/暂存/Git 提交状态保留，本次开发工具和文档未提交、未推送。

这些是开发方式的检查，不是新的应用功能或整个 App 的验收。
