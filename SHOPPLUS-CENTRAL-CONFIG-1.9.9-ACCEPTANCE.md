# 聊单助手 1.9.9｜ShopPlus API 集中配置验收记录

## 本次修复目标

- 将 ShopPlus App Key 与 API Secret 的唯一配置入口收敛到“连接与设置 → 连接服务 → ShopPlus 店铺 API”。
- 订单同步与商品库存复用同一份本机加密配置；订单同步弹窗不再要求重复输入凭据。
- 保持订单读取与商品读取的权限验证独立；状态读取失败时显示准确的“配置状态暂不可读取”，不误报为未配置。

## 实现边界

- 设置页只显示非敏感状态，不显示、复制或记录 App Key／API Secret 原文。实际输入继续使用系统安全输入和既有 `shopplus-api.enc` 本机加密存储。
- 订单同步弹窗未配置时只显示“前往连接与设置”；已配置时只保留订单同步操作。
- 未修改 ShopPlus 订单读取、商品两款采集限制、网站写入／上下架、KDocs／Google、真实订单／客户／WhatsApp、AI、聊天或其他页面。

## 虚构数据验收

所有验收使用临时隔离资料、虚构凭据、虚构订单和虚构商品状态；没有读取、修改或发送真实 ShopPlus、订单、客户或 WhatsApp 数据。

1. 初始订单同步弹窗显示“ShopPlus 尚未在连接与设置配置”，没有“配置 ShopPlus API”按钮，只有“前往连接与设置”。
2. 在设置页点击一次虚构“配置／更换 ShopPlus API”后，App Key／API Secret 都只显示“已安全保存”，不出现虚构 Secret 原文；订单读取状态变为“订单读取已验证”。
3. 返回订单同步后，弹窗显示“ShopPlus 已连接”，同步按钮可用，且不再出现凭据配置入口。
4. 商品库存先显示“ShopPlus 商品读取待验证”；只有一次明确虚构采集后才变为“ShopPlus 商品读取已验证”。
5. 状态读取失败的虚构回归显示“配置状态暂不可读取”，没有误显示为“未配置”。

`npm run check`、`test/orders-management-ui.e2e.mjs`、`test/shopplus-settings-centralization.e2e.mjs` 和 `test/shopplus-api.test.mjs` 共 6 项通过；`git diff --check` 通过。

## 最终 Mac x64 App 验收

- 成品路径：[`聊单助手 1.9.9.app`](dist/聊单助手1.9.9-x64/mac/聊单助手%201.9.9.app)
- 最终包直接启动报告：[`app-verification.json`](artifacts/shopplus-settings-1.9.9/app-verification.json)，记录 `packaged=true`、`version=1.9.9`、`arch=x64`、`configurationCalls=1`、`productCalls=1`、`realShopPlusCalls=0`、`realMessagesSent=0`、`errors=[]`。
- 已人工检查最终包截图：[设置页 1280×820](artifacts/shopplus-settings-1.9.9/shopplus-settings-1280x820.png)、[订单同步 1280×820](artifacts/shopplus-settings-1.9.9/shopplus-order-sync-1280x820.png)、[设置页 820×640](artifacts/shopplus-settings-1.9.9/shopplus-settings-820x640.png)。集中配置卡、按钮和订单同步弹窗均未重叠或截断。
- `codesign --verify --deep --strict` 通过；可执行文件为 `Mach-O 64-bit executable x86_64`。SHA-256：`f53e9a5e4f324c01c50170dd57bfef7e6aa4b2979ed3c327a3b58a5e35242d46`。

## 正常运行切换与边界

最终正常资料目录下的旧 `1.9.8` 首先接受了两种 macOS 正常退出请求，但都没有在限定时间内结束，第二次还留下了等待中的系统退出请求。根据用户此前“启动新版前清理旧版”的明确授权，只对已核对的旧主进程和该等待请求发送一次 `TERM`；随后旧版主进程及 helper 已退出。之后直接启动正常资料目录下的 `1.9.9`，并确认主进程持续运行。正常资料没有用于功能验收。

本轮只认定 D-114 ShopPlus 集中配置局部修复通过；不代表连接与设置整页、订单管理、商品库存或其他页面完整基准通过。旧／新版本的退出行为未在本轮重新认定为通过。未生成 ZIP；当前为 1.9.9，尚未到每五版本一次的 GitHub 递交节点。
