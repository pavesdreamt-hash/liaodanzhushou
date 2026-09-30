# 2.6.0 来源一键同步与建议中心验收

范围：仅“商品库存 → 来源资料”的一键同步并核对入口、人工映射停止保护、建议中心显示规则，以及对应版本/文档。

验收要点：

- 登录未确认时“一键同步并核对”不可用；登录确认后可用。
- 一键流程只读同步来源资料。若映射仍有待确认/待选择项，流程在人工核对卡停止，不能同步网站目录、变化核对或写网站。
- 映射完整时，一键流程只读同步网站目录、生成变化核对与建议中心；不执行上下架、不改售价。
- 建议中心显示待执行、状态一致和暂不可建议的汇总，但逐条只显示可执行的上下架差异；勾选和二次确认仍是写网站的必经步骤。
- 成本与建议售价变化仍只作为变化核对资料；不生成实际网站售价的修改建议。

实施核验：`npm run check` 通过；`node --test --test-concurrency=1 test/plan.test.mjs test/mapping-candidate-occupancy.test.mjs test/real-evidence.test.mjs` 为 26/26；来源资料页 Electron 回归 1/1；以 `KDOCS_TEST_EXECUTABLE=dist/聊单助手.app/Contents/MacOS/聊单助手` 运行的固定 App 回归 1/1。固定 App 的包内版本为 2.6.0、架构 x64，`codesign --verify --deep --strict` 通过；可执行文件 SHA-256：`0b50f8785861954fc9c7866c702c7d8dd6663c74b194f61a9c479454497e0168`。
