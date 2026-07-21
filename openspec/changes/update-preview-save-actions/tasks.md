## 1. 导出能力

- [x] 1.1 扩展目录导出 module，支持单文件直写的结构化结果与 `showSaveFilePicker` 另存为。

## 2. 预览交互

- [x] 2.1 在 PhotoSwipe 顶部注册保存、下载和另存为动作。
- [x] 2.2 实现目录直写优先、传统下载回退以及操作反馈。
- [x] 2.3 补齐中英文可见文案和无障碍标签。

## 3. 验证

- [x] 3.1 为新增的目录与另存为分支补充单元测试，所有新增用例含中文 GWT 注释。
- [ ] 3.2 为预览动作补充组件测试。
- [ ] 3.3 执行 `pnpm test`、`pnpm exec vue-tsc --noEmit`、`pnpm build`、`git diff --check` 与 OpenSpec 严格校验。
- [ ] 3.4 在 Chrome CDP 中验证桌面与移动端预览操作和视觉反馈。
