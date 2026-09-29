# 客户聊天未读状态回读 — 2.0.12 验收

日期：2026-09-25
范围：聊天工作台在线状态下的会话列表只读刷新，以及其未读／待回复统计。

## 根因与修复

旧实现每十秒只读取 WhatsApp 的连接状态，并且仅在“离线 → 在线”时调用会话列表读取。用户在手机或其它 WhatsApp 客户端阅读消息时，当前连接通常不会发生重连，因此页面持续使用旧的原始 `unreadCount`。

现在连接在线的每一轮既有十秒轮询都会重新只读读取会话列表元数据。每次结果会一起重绘：会话行未读红圈、顶部“未读”、未读筛选、摘要、时间、最后有效消息方向，以及“全部／未回”统计。不会标记已读、已接待、发送、隐藏／恢复会话或写入客户／订单资料。

“已读”与“未回”仍然独立：原始未读数变为 `0` 后，红圈和顶部未读数必须消失；若最后有效消息仍来自客户，待回复会话仍保留。

## 源码回归

```sh
node --test test/chat-workbench-filter-badges.e2e.mjs
npm run check
```

均通过。回归使用虚构会话，先给同一客户会话 `unreadCount=3`，再在不改变在线状态的情况下改为 `0` 并等待正常十秒轮询；验证行红圈、顶部未读和未读筛选同步清除，而“全部／未回”因最后有效方向仍为客户而各保留 `1`。

## 最终 Mac x64 App 验收

```sh
CHAT_COUNTERS_APP_PATH="$PWD/dist/聊单助手.app" node scripts/verify-chat-counters-package.mjs
```

通过。报告位于 [app-verification.json](artifacts/chat-counters-2.0.12/app-verification.json)，其中：

- `ok=true`、`version=2.0.12`、`packaged=true`、`arch=x64`、`errors=[]`；
- 确认固定最终 App 可直接启动；
- 确认在线、无重连时会用最新原始未读替换旧红圈；
- 既有“全部”去重、原始未读合计、最后有效方向待回复、零值隐藏、1280×820／820×640 均通过；
- `realWhatsAppReads=0`、`realMessagesSent=0`。

`codesign --verify --deep --strict`、x64 Mach-O、版本资料和 `git diff --check` 通过。没有对真实 WhatsApp、客户、订单、ShopPlus 或 AI 作任何读取／写入。本轮只验收未读同步局部修复；历史手机底部 P1–P4、聊天工作台其它区域、库存／产品详情整页和退出流程未重验。

## 交付

- 固定 App：`dist/聊单助手.app`
- 版本：`2.0.12`
- 架构：Mac x64
- 不生成 ZIP；本次不是 GitHub 五版本递交节点。
