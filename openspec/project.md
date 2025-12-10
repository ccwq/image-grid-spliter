# Project Context

## Purpose
- 构建一个纯前端的图片网格裁切工具，支持用户上传或拖拽图片，按预设网格切割后自动批量下载。
- 提供移动端友好的体验，并支持 PWA 安装与离线使用，便于在无网络时仍可私用。

## Tech Stack
- Vite + Vue 3 + TypeScript（SFC，优先使用组合式 API 与 `script setup`）。
- 依赖 pnpm 进行包管理与锁定。
- 浏览器 Canvas API 与 File/Drag&Drop/Download API 用于客户端裁切与多文件下载。
- 计划使用 Vite PWA 插件实现 Service Worker、manifest 与缓存策略。
- GitHub Actions 负责 CI/CD，产物部署到 GitHub Pages 静态托管。

## Project Conventions

### Code Style
- TypeScript 开启严格模式，组件命名使用 PascalCase，文件/路径使用 kebab-case。
- Vue 3 SFC 优先 `script setup`，样式作用域采用 `<style scoped>` 或 CSS Modules。
- 建议使用 ESLint + Prettier 默认规则（后续可在 `eslint`/`prettier` 配置中收敛）。

### Architecture Patterns
- 单页应用，所有功能在客户端完成，无后端依赖，确保可离线与 GitHub Pages 可托管。
- 模块划分：上传/拖拽输入、网格预设选择器、裁切处理（基于 Canvas）、结果下载器、多文件下载授权、PWA 离线与安装支持。
- 组件与工具函数保持可测试性，裁切逻辑与下载逻辑独立封装，UI 组件关注交互与展示。

### Testing Strategy
- 单元测试/组件测试：使用 Vitest + @vue/test-utils 验证裁切算法、网格计算与核心组件交互。
- E2E/手动回归：验证多文件下载、PWA 离线缓存、生效的 GitHub Pages 构建路径。
- 构建验证：CI 中执行 `pnpm install`, `pnpm test`, `pnpm build`，确保产物可发布。

### Git Workflow
- 主分支（main）对应 GitHub Pages 发布产物；功能开发使用 feature 分支，完成后发起 PR。
- 推荐遵循 Conventional Commits（feat/fix/chore/docs/test/build 等），便于自动化与变更记录。
- CI 由 GitHub Actions 触发：安装依赖（pnpm）、执行测试、构建并推送到 `gh-pages`。

## Domain Context
- 支持的网格预设：2x2、3x3、4x4、2x3、2x4、3x2、4x2、5x2、2x5。
- 上传或拖拽图片后按照选定网格等比例裁切，自动触发批量下载；需要浏览器多文件下载授权。
- 需兼容移动端交互（触摸、屏幕尺寸适配）与离线可用。

## Important Constraints
- 必须使用 pnpm 进行依赖管理与锁定。
- 前端纯静态实现，需满足 GitHub Pages 部署路径与静态托管限制。
- 必须支持 PWA（安装入口、manifest、Service Worker 缓存）并可在离线环境运行。
- 需要处理多文件批量下载权限与浏览器限制（如用户触发下载、避免被拦截）。
- UI 需响应式设计，适配移动端。

## External Dependencies
- GitHub Pages：静态托管产物；GitHub Actions：CI/CD 构建与发布。
- 浏览器内建 API：Canvas、File/Drag&Drop、download 属性、Service Worker、Cache Storage。
- 计划类库：Vite PWA 插件（如 `@vite-pwa/plugin`）用于 PWA 支持；其他依赖待选型时再补充。
