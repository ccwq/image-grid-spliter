# 图片网格裁切器 (Image Grid Spliter)

[English README](README.md)

基于 Vite + Vue 3 + TypeScript 的纯前端图片网格裁切工具。支持上传/拖拽图片，按预设网格裁切并批量下载，已启用 PWA 便于离线与安装，使用 pnpm 管理依赖并兼容 GitHub Pages 部署。

## 功能
- 预设网格：1x1（纯压缩）、2x2、3x3、4x4、2x3、2x4、3x2、4x2、5x2、2x5。
- 浏览器内完成裁切与批量下载（需要允许多文件下载）。
- 响应式布局与移动端适配；PWA 可安装、离线可用。
- 多语言：中英双语，默认跟随浏览器语言，可在页面内切换。
- 像素风装饰图标：集成 `@iconify-json/pixelarticons` 与 `@iconify/vue`。

## 快速开始
```bash
pnpm install
pnpm dev
```

### 测试
```bash
pnpm test
```

### 构建
```bash
pnpm build
```
GitHub Pages 构建会设置 `GITHUB_PAGES=true` 以确保正确的 base 路径。

## 部署
- GitHub Actions 工作流：`.github/workflows/deploy.yml`。
- 产物路径：`dist/`，通过 `actions/deploy-pages` 发布到 GitHub Pages。
- 在线 Demo：`https://ccwq.github.io/image-grid-spliter/`

## 使用提示
- 首次裁切后浏览器可能询问是否允许多文件下载，请选择允许。
- 需要重新下载时，可在结果区域点击下载动作再次触发。
