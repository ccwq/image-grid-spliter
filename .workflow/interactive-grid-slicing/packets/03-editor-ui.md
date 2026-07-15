# Packet 03: Editor UI

Objective: 创建原图分割线编辑器与可折叠控制面板。

Ownership: `src/components/SliceEditor.vue`, `src/components/SlicePresetPanel.vue`。

Do: 响应式预览、指针拖拽、添加/删除线、padding 控件、预设面板必要事件契约。

Do not: 修改 `App.vue`、工具函数或 composables。

Verification: `pnpm exec vue-tsc --noEmit`。
