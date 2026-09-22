# 8.23.0 Windows 10 x64 交付与验收记录

日期：2026-09-18。状态：开发方检查通过，Windows实机待验收。目标电脑为Windows 10专业工作站版、Intel x64；现有8.22安装包和业务资料保留。

## 交付文件

Windows安装包（未签名）：`/Users/apple/Documents/ChatGPT/网站料单Skill/kdocs-diagnostics/kdocs-inventory-app/dist/windows/KDocs订单助手-8.23.0-windows-x64-Setup.exe`

- 大小：127,502,390字节。
- SHA-256：`729204498fe14c4bc37df3d8c0886f0563cd42b0a8d3a1136eebbd3e1d211be8`。
- 同目录 `.exe.sha256` 校验文件。

Mac ZIP：`/Users/apple/Documents/ChatGPT/网站料单Skill/kdocs-diagnostics/kdocs-inventory-app/dist/KDocs库存同步8.23.0-x64.zip`

- 大小：161,591,297字节。
- SHA-256：`7bab189c85c288dfd51d28d91acefa02d74415f837f1bd8a9dc3d77d3aaea737`。
- 同目录 `.zip.sha256` 校验文件。
- 新解压App为8.23.0；本地ad-hoc签名校验通过，无Apple公证或开发者发布证书。

## 本轮变化

1. Chrome查找共用一个实现：Windows依次检查当前用户、系统64位、系统32位标准目录；保留Mac路径与显式路径。缺失时提示，重试重新检查，不删除凭据。
2. Windows使用独立密码输入窗口：密码遮罩、保存、空值检查、取消、关闭；禁用网页Node访问、限制IPC来源和导航。Mac仍使用原有输入方式。
3. 沿用Electron异步safeStorage，在Windows接入系统DPAPI；真实Windows加密保存、恢复尚待实机检查。密钥不返回管理页面，也不写入日志和安装包。[官方安全存储文档](https://www.electronjs.org/docs/latest/api/safe-storage)。
4. 使用锁定的jszip 3.10.1生成诊断ZIP，不依赖Mac压缩命令；诊断文件选择不包含登录目录与密钥文件，跳过符号链接。
5. Windows沿用托盘“打开管理页面”“退出”和后台同步生命周期；关闭管理页面不退出后台。启动日志包含平台、架构、系统版本。
6. Windows跳过旧Mac钥匙串连接配置；数据目录为 `%APPDATA%\KDocs Order Assistant`。没有新增数据库迁移。普通卸载和覆盖安装保留此资料目录。
7. NSIS按当前用户安装，无需管理员权限，支持安装路径选择、桌面/开始菜单快捷方式与安装后启动。WhatsApp库仍固定1.34.7，Electron44.0.0。
8. 订单界面、阶段逻辑、电话差异仅提醒、独立多语言翻译规则保持8.22行为。

## 开发方检查（当前Mac环境）

| 检查 | 结果与边界 |
| --- | --- |
| 全部单元检查 | 352/352通过，`artifacts/windows-8.23/unit-final.log`；约10.38秒 |
| 项目/共享构建检查 | 通过，`check.log` |
| Windows路径、平台分支、诊断ZIP | 新增3项单元检查通过；模拟Windows环境参数，未冒充Windows执行 |
| 本地密码输入窗口 | 1/1真实Electron窗口测试通过；遮罩、空值、保存、取消、加载期间关闭、拒绝其他页面IPC；在Mac调用Windows输入分支，Windows DPAPI未实测 |
| Windows交叉构建 | NSIS x64安装包生成成功；程序主体PE机器类型0x8664、版本8.23.0；NSIS引导壳为32位，安装的程序为64位 |
| Windows包内容 | 139份源文件逐字节匹配；从最终EXE解出安装载荷，152份文件全部与win-unpacked一致；无业务数据库、登录目录、密钥配置、测试目录混入 |
| Windows运行时来源 | 官方Electron44.0.0 Windows x64运行时；镜像下载SHA与官方SHASUMS一致，详见windows-runtime-integrity.json |
| Mac最终ZIP回归 | 新解压副本11/11通过，约126.11秒；版本/启动、自动接收、关闭页面后接收、切单、电话提示、多语种翻译调用与缓存、图片、断网、三次重启、草稿和备份恢复 |
| Mac包内容 | 139份源文件逐字节匹配；启动页面截图显示8.23，签名结构校验通过 |

测试全部使用隔离虚构数据和模拟AI响应，没有发送真实WhatsApp消息、没有新增真实AI调用、没有修改正式订单。上述约126秒的Mac回归不代表长期在线稳定性。8.20真实验证记录保持原状态；本轮不宣称新增真实扫码或Windows接收成功。

详细证据位于 `artifacts/windows-8.23/`；Windows实机尚未启动该程序，不能把静态检查或Mac测试当作Windows验收。

## Windows安装与实机清单（由用户完成）

将 `.exe` 复制到Windows电脑，先安装Google Chrome。双击安装程序，选择位置，完成后从桌面“KDocs订单助手”启动；无需安装Node或编译工具。首次连接重新扫描手机WhatsApp“已关联设备”二维码，在助手设置重新填写AI密钥。跨电脑可使用普通订单备份恢复业务数据，不复制Mac登录或加密密钥文件。

| 待实机验证项目 | 状态 |
| --- | --- |
| 安装、桌面快捷方式、选择路径、安装后启动、管理页面与托盘退出 | 待验收 |
| 扫码、自动收新文字/图片、不点击刷新、切单不串记录 | 待验收 |
| 密钥保存/恢复、实际AI翻译、电话差异仅提醒 | 待验收 |
| 草稿、备份恢复、断网重连、三次退出重启 | 待验收 |
| 覆盖安装后业务资料保留、普通卸载后资料保留 | 待验收 |

关闭浏览器管理页面后后台继续运行；需要完全退出时在右下角托盘（可能在隐藏图标内）选择“退出”。安装包无发布者签名，如系统提示未知发布者，请核对本报告SHA，不需要关闭系统安全设置。

失败时提供截图和软件导出的诊断ZIP，由开发方定位、修复、重新打包；不要提供AI密钥或WhatsApp登录凭据。诊断日志记录系统和架构以帮助定位。

## 本地提交与资料保护

本轮任务使用独立临时Git索引创建本地任务提交，父提交为8.22交付提交。原工作区HEAD、实际暂存区字节及无关修改保留，不推送。提交收据：`artifacts/windows-8.23/git-delivery.json`；保护检查：workspace-preservation.json。安装包独立交付，不将大型安装文件提交到Git。
