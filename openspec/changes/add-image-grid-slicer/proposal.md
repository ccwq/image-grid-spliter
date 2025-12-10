# Change: 图片网格裁切 PWA 工具

## Why
- 需要一个纯前端工具，按预设网格（如 2x2、3x3、4x4 等）裁切用户上传/拖拽的图片，并批量下载。
- 需兼容移动端、支持 PWA 安装与离线私用，并可通过 GitHub Pages 发布、GitHub Actions 自动构建发布。
- 项目要求使用 Vite + Vue3 + TypeScript 与 pnpm，确保一致的技术栈与部署流程。

## What Changes
- 新增基于 Vite + Vue3 + TypeScript 的单页应用，提供拖拽/上传入口、网格预设选择、裁切预览与自动批量下载。
- 实现 Canvas 裁切与多文件下载流程，并处理浏览器多文件下载授权。
- 集成 PWA（manifest、Service Worker、缓存策略）以支持安装与离线可用。
- 配置 GitHub Actions：pnpm 安装、测试、构建并发布到 GitHub Pages。
- 适配移动端交互与响应式布局，确保小屏可用。

## Impact
- 影响前端构建与发布流程：需要新增 CI 工作流与 GH Pages 配置。
- 影响静态资源与 Service Worker：需新增 PWA 配置与缓存策略。
- 影响核心业务逻辑：引入裁切算法、网格预设管理、批量下载处理。
