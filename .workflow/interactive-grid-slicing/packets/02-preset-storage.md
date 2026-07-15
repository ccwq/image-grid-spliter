# Packet 02: Preset storage

Objective: 实现预设库 localStorage 与版本化 JSON/剪贴板导入导出逻辑。

Ownership: `src/composables/useSlicePresets.ts`, `src/composables/__tests__/useSlicePresets.spec.ts`。

Do: 预设 CRUD、JSON 校验、导入冲突计算和存储容错。

Do not: 修改 grid 算法、App 或 UI 组件。

Verification: 新增测试均有中文 GWT 注释并可独立通过。
