# Repository Guidelines

## 项目结构与模块组织

本项目是 Vue 3 + TypeScript + Vite PWA，用于按网格裁切图片。应用编排位于 `src/App.vue`；可复用界面放在 `src/components/`；浏览器状态和业务流程放在 `src/composables/`，例如 `useImageSlicer.ts`；纯网格、文件工具位于 `src/utils/`。

测试与所属层级相邻，统一位于 `__tests__/`。PWA 静态资源在 `public/`，文档和截图在 `docs/`。功能级变更开始前，先阅读 `openspec/AGENTS.md` 和相关 `openspec/changes/`。

## 构建、测试与本地开发

- `pnpm dev`：启动 Vite 开发服务器。
- `pnpm test`：在 jsdom 中运行一次 Vitest。
- `pnpm test:watch`：以监听模式运行测试。
- `pnpm exec vue-tsc --noEmit`：执行 Vue 与 TypeScript 类型检查。
- `pnpm build`：构建生产 PWA。

提交 UI 或业务流程改动前，运行 `pnpm test`、`pnpm exec vue-tsc --noEmit`、`pnpm build` 和 `git diff --check`。

## 编码风格与命名

组件使用 `<script setup lang="ts">`。Vue 组件采用 PascalCase，例如 `ExportProgressOverlay.vue`；composable 使用 camelCase 且以 `use` 开头，例如 `useDirectoryExport.ts`。优先编写职责单一的 composable，并为 props、emits 和事件载荷定义明确类型。

保持深色、紧凑的既有界面风格。用户可见文案默认中文；新增文案时同步更新 `useLocale.ts` 的英文版本。

## 测试规范

使用 Vitest 与 `@vue/test-utils`，测试文件命名为 `*.spec.ts`，断言可观察行为而非内部实现。新增或修改的每个用例前必须有中文 Given/When/Then/防回归注释。交互状态写组件测试；确定性算法写 utility 或 composable 测试。

## 提交与 Pull Request

沿用 Conventional Commit，可带 emoji：`fix(slice-editor): 修复草稿确认`、`feat(export): 支持目录导出`、`docs(workflow): 记录验证`。一次提交只处理一个清晰范围。

PR 说明应包含用户可见变化、已执行的验证命令、关联 issue/spec（如有）；布局改动附桌面与移动端截图。不要提交 `dist/` 产物或浏览器本地数据。
