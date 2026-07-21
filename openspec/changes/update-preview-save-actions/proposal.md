# Change: 优化图片预览的保存与下载动作

## Why

预览顶部当前只有传统下载按钮，不能复用用户已授权的导出目录，也未明确区分保存、下载和另存为动作。

## What Changes

- 在 PhotoSwipe 预览顶部并列提供“保存”和“下载”按钮，并新增“另存为”入口。
- “保存”优先写入已授权的目录；目录不可用、未授权或写入失败时自动改用传统下载。
- “另存为”使用浏览器文件保存对话框；不支持或用户取消时给出可见反馈。
- 为三个预览动作提供加载、成功或降级状态，包含按钮内反馈和 Toast。

## Impact

- Affected specs: `preview-save-actions`（新增）
- Affected code: `src/App.vue`、`src/composables/useDirectoryExport.ts`、`src/composables/useLocale.ts`
- Affected tests: `src/composables/__tests__/useDirectoryExport.spec.ts`、新增预览动作组件测试
