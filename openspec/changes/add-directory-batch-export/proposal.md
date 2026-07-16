# Change: 增加同目录批量导出

## Why

当前批量导出逐张触发浏览器下载；当浏览器设置为每次询问保存位置时，用户必须为每个切片重复确认。Chromium 已提供由用户授权目录后直接写入文件的能力，可显著简化这一流程。

## What Changes

- 为 Chrome/Edge 增加基于 File System Access API 的目录直写导出。
- “下载全部”升级为智能入口：首次选择目录，后续复用 IndexedDB 中的目录句柄并按需重新授权。
- 增加“更换导出目录”控制；不支持的浏览器隐藏该控制并说明会使用传统逐张下载。
- 重名文件不覆盖，使用 `-1`、`-2` 递增后缀。
- 目录直写中途失败时报告成功/未完成数，由用户决定是否将未完成文件以传统下载重试。
- **不增加 ZIP 导出**。无 API、无权限或被用户拒绝时，保留现有逐张 `<a download>` 下载行为。

## Impact

- Affected specs: `directory-batch-export`（新增）
- Affected code: `src/composables/useImageSlicer.ts`、新增目录导出 module、`src/components/ExportSettings.vue`、`src/App.vue`、`src/composables/useLocale.ts` 及相应单元测试
- Affected docs: `docs/adr/0001-batch-export-directory-strategy.md`、`docs/glossary.md`
