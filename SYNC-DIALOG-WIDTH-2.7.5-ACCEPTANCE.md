# 商品同步弹窗横向宽度验收（2.7.5）

范围：仅核验“商品同步与更新”弹窗在宽屏的实际横向宽度。三张同步卡、按钮语义、同步动作和弹窗高度不作为本次新的功能改动。

验收结果：在 1280px 宽的隔离 Electron 窗口中，弹窗实际 `getBoundingClientRect().width` 为 880px，符合 `min(880px, viewport - 32px)`（测试允许 1px 取整误差）；三张卡仍同一行。`npm run check`、相关 16 项隔离回归和 `git diff --check` 通过。固定 `dist/聊单助手.app` 的同一 Electron 回归 1/1 通过；直接启动识别为 `packaged=true`、`version=2.7.5`、`arch=x64`；ad-hoc 深度签名验证通过。可执行文件 SHA-256：`46be961e5acfd60d3c6e9ef59db634281d32cb3e83bc5216ea14fcb6aa88334c`。
