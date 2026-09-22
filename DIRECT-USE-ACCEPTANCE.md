# 8.4 直接使用与版本隔离验收

## 交付行为

- ZIP 内应用名称为 `KDocs订单助手 8.4.0.app`。
- ZIP 内不包含 `.command` 启动器，解压后直接双击 `.app`。
- Bundle ID 为 `com.kdocs.orderassistant`。
- 新版正常数据目录为 `~/Library/Application Support/KDocs Order Assistant`，本地管理端口为 `43874`。
- 旧版 `KDocs Inventory Sync` 数据目录和端口不会被新版读写。
- 7.6.0 回溯存档同时保留可运行 App ZIP 和 Git `480c0a4` 源码 ZIP。

## 验收方法

自动检查 ZIP 顶层不存在 `.command`，然后直接启动 App 中的 macOS 可执行文件，核对版本、应用身份、数据目录、管理页面和本地端口。

最终业务验收不再以临时隔离库作为交付依据：使用新版正常数据目录选择用户指定的 ShopPlus 文件，完成预览、缺失成本确认、导入、重启持久化和重复导入保护。验收只记录订单数、商品数和 NULL 成本数，不输出客户资料。

## 结果

- 完整项目测试：220/220 PASS。
- Electron 订单界面、默认浏览器工作区及 900×700 等四种尺寸：7/7 PASS。
- 最终 ZIP：无 `.command`，x86_64，深度签名校验 PASS，Bundle ID 为 `com.kdocs.orderassistant`。
- 直接打开最终 ZIP 内 App：1/1 PASS，显示 8.4，正常数据目录和 43874 端口正确。
- 最终打包版 `.xlsx` / `.xls` / `.csv`、缺失成本、草稿助手入口与生产启动回归：4/4 PASS。
- 用户指定 ShopPlus 文件的正常目录验收：1/1 PASS；导入 10 个订单、12 条商品，12 条成本保持 `NULL`，0 成本为 0 条；重启持久化与 10 个重复订单保护 PASS。
- 7.6.0 回溯 App：x86_64、签名、独立 Bundle ID、独立正常数据目录、43872 端口及页面显示 7.6 全部 PASS。
