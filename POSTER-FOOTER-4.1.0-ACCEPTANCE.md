# 4.1.0 默认工厂、证书和配送图片验收

用户反馈自己生成的图缺少底部整块宣传图片。原因是4.0.9仅在验收中手动导入了样图，App默认资源没有内置。本次修复默认行为：随本机App包含同一宣传图，全新设置及旧空assets设置自动加载；自选底部/工厂/配送图片优先，清除后恢复默认。默认图片不依赖桌面原图或浏览器存储；缺失/损坏明确失败，不用文字占位冒充成功。

## 已执行

- npm run check：类型、UI构建、共享模块与项目检查通过。构建检查新增默认图片必须存在。
- 5项相关测试通过：来源有货与本机图片条件、导出变更校验、真实缓存/坏图及恢复、首次默认读取、缺失拦截、自选素材/清除恢复、素材完整边缘和默认资源缺失/损坏。
- 最终交付App两项实际browser通过：虚构本机＋缓存图片、正式商品资料隔离副本。均从未导入任何素材开始，localStorage为空；默认接口返回的图片与包内资源哈希一致，预览12处像素采样一致。另验证旧空assets设置升级、竖版及清除后恢复默认。
- 真实109款（51款本机导入＋58款Shoplus本机缓存）自动成图，来源有货113、缺图4、待核对12；来源快照2026-10-23 10:21:51。没有手动导入来补齐验收效果。
- 实际JPG：`/Users/apple/Documents/ChatGPT/网站料单Skill/liaodan-assistant-next/交付/聊单助手4.1.0/现货商品合集/现货商品合集-2026-10-24T10-56-05-3b8e3742-01.jpg`，6000×4200，SHA-256 `7af8072c4e1ad0b8cd6a205de1bb0df92ad14178f306365b364707c86134a3cf`。实际预览完整显示工厂、3份证书、配送文字及人物，商品网格保持。
- 成品身份4.1.0/x64/app.isPackaged=true/BrowserWindow=0；174项包内文件与工作区对应，运行元数据及严格深度签名通过。
- 5份正式商品状态文件＋176张主图只复制到隔离目录，181项原文件哈希保持；网站调用0、外部请求0、页面脚本错误0。未读取聊天/订单资料或操作网站/Google/AI，不切换运行中4.0.9。

## 本机资源和交付

- 默认图片 `assets/product-poster-footer.jpg` 随App打包，已被Git忽略，不上传用户业务图片；源码重建所需本机资源见LOCAL-BUILD-RESOURCES.md。
- App：`/Users/apple/Documents/ChatGPT/网站料单Skill/liaodan-assistant-next/交付/聊单助手4.1.0/聊单助手.app`。旧版任务结束后退出旧后台，再双击本版→商品库存→制作商品合集图。无自选底部时自动出现；有旧自选素材时可点“清除自选素材”再生成预览。
- app.asar SHA-256 `e23c9a595b6754f9238de699a0ee92c537959f7c516dba769eb304d9a55ea3b6`；可执行文件 `0a7b6faf2592936116dd1069579fbd0bb88230f9480d4cf4057c18008e6efef8`；默认图片 `a131521cbba4d1d5dd039bfd82e75662e889240d22edecf5828a3e26f982b346`。交付目录SHA256.txt记录App和JPG校验值。
- 清理未运行4.0.5、重复构建及本轮隔离副本，保留4.0.6～4.1.0五App，保留App的15项哈希不变。清理证据在cleanup-proof.json。

## 验收边界和Git

本轮未重验原生可见文件选择/保存对话框、桌面IPC、网站写入或整套App；17项历史全量失败没有宣称修复。原图白底保持。默认宣传素材以用户提供内容为准，本轮未独立验证宣传文案或证书内容。

本轮为4.0.6～4.1.0第五次交付，46项源码/测试/文档已提交并推送4dfd2cf，远端main已核对，详见GIT-SYNC-4.1.0-RECEIPT.md；App、生成JPG、默认业务图片、依赖、凭据和正式资料均不纳入Git。

证据目录：artifacts/poster-footer-4.1.0/ 下 check.log、tests.log、package.log、real-package.log、package-proof.json、package-result.json、real-package-result.json、real-preview.png、real-dialog.png、snapshot-proof.json、cleanup-proof.json。
