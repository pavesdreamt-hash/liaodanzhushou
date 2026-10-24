# 本机打包资源

运行 `npm run check` 和打包前，除已有 Google 桌面授权资源外，还需要 `assets/product-poster-footer.jpg`。这是用户提供的工厂、证书及配送宣传图，已在 `.gitignore` 中排除，只保留在本机和交付 App 中，不上传 GitHub。

本机工程已准备此文件。源码检出到其他电脑时，应使用经授权的同一宣传素材，或从已有可信交付 App 的 `Contents/Resources/app.asar` 提取 `assets/product-poster-footer.jpg` 放回该路径；不能用文字占位或空白文件冒充完整构建。项目检查会阻止缺资源的构建，运行时也会明确提示资源缺失或损坏。

素材由既有合集图“从样图提取底部”逻辑从用户提供的参考图生成，1800×378 JPEG。App 按完整比例绘制，默认资源不依赖桌面原文件、浏览器 localStorage 或网络；自选素材仍留在用户本机设置中并优先使用。
