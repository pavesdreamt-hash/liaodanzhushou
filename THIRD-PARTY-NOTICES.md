# WhatsApp 连接组件

whatsapp-web.js 1.34.7，Apache License 2.0。
项目：https://github.com/wwebjs/whatsapp-web.js
完整许可：App 内 assets/third-party/whatsapp-web.js-LICENSE。

本发行版对其 src/util/Injected/Utils.js 应用有版本及源文件校验的只读兼容修改：支持 WhatsApp 消息键从 `_serialized` 更名为 `$1`，避免以空键查询最后一条消息，并保留原始消息编号供去重。参考上游尚未合并的 PR #201848：https://github.com/wwebjs/whatsapp-web.js/pull/201848 。修改没有增加发送或编辑消息功能。重新安装依赖和构建时由 scripts/whatsapp-compat.mjs 重现此修改，源文件偏离审核版本时构建失败。

qrcode 1.5.4，MIT License。
项目：https://github.com/soldair/node-qrcode
完整许可：App 内 assets/third-party/qrcode-LICENSE。

jszip 3.10.1，使用MIT许可，用于跨平台诊断ZIP导出。
项目：https://github.com/Stuk/jszip
完整许可：App 内 assets/third-party/jszip-LICENSE。
