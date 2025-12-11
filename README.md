# Image Grid Spliter

[中文 README](README.zh-cn.md)

Purely frontend image grid slicer built with Vite + Vue 3 + TypeScript. Upload or drag an image, pick a grid preset, and it slices plus batches the downloads. Ships with PWA offline support and GitHub Pages–friendly build. Dependency management: pnpm.

## Features
- Presets: 1x1 (compress-only), 2x2, 3x3, 4x4, 2x3, 2x4, 3x2, 4x2, 5x2, 2x5.
- Browser-based slicing and batch download (requests multi-file permission).
- Mobile-friendly responsive layout; PWA installable and offline-ready.
- Localization: English/Chinese with browser-language default and in-app switcher.
- Decorative pixel icons via `@iconify-json/pixelarticons` + `@iconify/vue`.

## Quick Start
```bash
pnpm install
pnpm dev
```

### Tests
```bash
pnpm test
```

### Build
```bash
pnpm build
```
GitHub Pages builds set `GITHUB_PAGES=true` to ensure the correct base path.

## Deploy
- GitHub Actions workflow: `.github/workflows/deploy.yml`.
- Output: `dist/`, published via `actions/deploy-pages` to GitHub Pages.
- Live demo: https://ccwq.github.io/image-grid-spliter/

## Usage Notes
- Allow your browser to download multiple files after slicing.
- To retrigger downloads, click the download action in the results area.
