## Context

应用是纯前端 PWA，现有 `useImageSlicer` 将每个 `TileResult.previewUrl` 赋给 `<a download>` 并逐张点击。该流程无法影响浏览器目录或保存对话框。File System Access API 可直接向用户授权的 `FileSystemDirectoryHandle` 写入 Blob，但只在 Chromium 中可用，并要求首次目录选择和重新授权发生在用户点击中。

## Goals / Non-Goals

- Goals：在 Chromium 中一次选择目录后直接写入多张切片；跨刷新尝试复用目录；不覆盖已有文件；保留现有兼容路径。
- Non-Goals：不提供 ZIP、不修改全局浏览器下载设置、不保证重启后的永久授权、不提供 Firefox/Safari 的目录写入模拟。

## Decisions

### 深 module 与 seam

新增 `useDirectoryExport` module，作为 `useImageSlicer` 与浏览器 File System Access API 之间的 seam。它的 Interface 仅暴露“可用性、选择/更换目录、导出文件、恢复权限状态”和结构化结果；其 Implementation 隐藏 IndexedDB、权限状态、重名探测、逐文件写入与异常归类。这样可将浏览器细节集中在一个 module，提高测试 Locality，同时让裁切 module 继续只负责生成 `TileResult`。

### 首次手势与导出时序

“下载全部”的点击处理器先同步进入目录 export module，使它能选择目录或请求权限；只有目录准备完成后才允许继续异步裁切/写入。不能沿用“先 `await processAll()` 后选目录”的顺序，否则会丢失 transient user activation。

### IndexedDB 和权限

目录句柄保存到 IndexedDB。恢复时先 `queryPermission({ mode: 'readwrite' })`：`granted` 直接使用；`prompt` 仅在明确导出点击中 `requestPermission()`；`denied` 或异常时提供重新选择目录。用户可随时使用“更换导出目录”。

### 兼容与自动下载

功能检测 `typeof window.showDirectoryPicker === 'function'`，不以 PWA 安装状态或 UA 判断。无支持/无授权/拒绝时下载全部回退原有 `a[download]` 循环。自动下载不会首次打开目录选择器：若已有有效句柄则目录直写，否则保持传统逐张下载。

### 文件冲突与部分失败

每个目标名通过 `getFileHandle(name, { create: false })` 探测；发生冲突则在扩展名前尝试 `-1`、`-2`，直到不存在。单个写入失败立即停止；返回已写入和未写入列表。UI 只有在用户明确确认后，才用传统下载处理未写入项。

## Risks / Trade-offs

- 目录权限可能在重启或用户撤销后变为 `prompt`，因此文案不得承诺永久免确认。
- 对含大量同名文件的目录，线性探测后缀会增加 I/O；预期切片数量较小，先采用简单确定性算法。
- 目录写入涉及真实用户文件；默认不覆盖，且中途失败不自动混用保存位置。

## Migration Plan

1. 先引入 module 和测试，不改现有传统下载 helper。
2. 将“下载全部”接入智能选择，传统 helper 作为明确 fallback。
3. 接入导出设置、状态文案和部分失败重试入口。
4. 在 Chrome/Edge 手工验证目录选择、重启后重新授权、重名和中途失败；Firefox/Safari 验证传统下载显示和行为。

## Open Questions

无。产品决策已在 ADR-0001 中确认。
