# 图片网格裁切器 (Vite + Vue3 + TS)

基于 Vite + Vue3 + TypeScript 的纯前端工具，支持上传/拖拽图片，按预设网格裁切并自动批量下载。已集成 PWA（可离线与安装），支持 GitHub Pages 部署，使用 pnpm 管理依赖。  
English summary: Split images into grids for processing and export.

## 功能
- 预设网格：2x2、3x3、4x4、2x3、2x4、3x2、4x2、5x2、2x5。
- 上传或拖拽图片后自动裁切，触发多文件批量下载。
- 移动端适配，响应式布局。
- PWA：可安装、离线可用，Service Worker 缓存。
- GitHub Actions：构建、测试并发布到 GitHub Pages。

## 本地开发
```bash
pnpm install
pnpm dev
```

## 测试
```bash
pnpm test
```

## 构建
```bash
pnpm build
```
GitHub Pages 构建时会设置 `GITHUB_PAGES=true` 以启用正确的 base 路径。

## 部署
- GitHub Actions 工作流：`.github/workflows/deploy.yml`。
- 产物路径：`dist/`，通过 `actions/deploy-pages` 发布到 GitHub Pages。

## 使用提示
- 上传后浏览器可能提示允许多文件下载，请选择“允许”。
- 如需重新触发下载，可在结果区域点击“再次下载”。
