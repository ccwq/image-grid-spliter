# File System Access API：已选目录的批量写入可行性

## 结论

**可行，但仅适合作为 Chromium（Chrome/Edge）优先能力，且不能承诺刷新或重启浏览器后仍然免确认。**

在用户点击「批量下载」这一直接交互内，页面可调用 `showDirectoryPicker({ mode: 'readwrite' })` 让用户**选择一次目录**。拿到 `FileSystemDirectoryHandle` 后，逐个执行 `getFileHandle(name, { create: true })`、`createWritable()`、`write()`、`close()`，文件会直接写入该目录；这不是浏览器传统下载流程，所以每个文件不会出现「另存为」对话框。

## 与预期逐项对照

| 预期 | 结果 | 说明 |
| --- | --- | --- |
| 首次只选一次目录 | 可以 | `showDirectoryPicker()` 返回目录 handle；一次批处理复用同一 handle 写多个文件。 |
| 同一批次的后续文件自动写同目录 | 可以 | 每个文件是对同一 `FileSystemDirectoryHandle` 创建/取得子文件 handle 后直接写入。 |
| 刷新后继续使用已选目录 | 尽力可做，不能保证免确认 | 将 handle 存进 IndexedDB；恢复后先 `queryPermission({ mode: 'readwrite' })`。MDN 明确说明，从 IndexedDB 取回的 handle「也很可能」得到 `prompt`。 |
| 重启浏览器后仍完全无交互 | 不能保证 | 当权限是 `prompt` 时，需要在新的用户点击中调用 `requestPermission()`；用户可随时撤销或拒绝。产品文案不应承诺永久授权。 |
| Chrome / Edge 支持 | 可以 | MDN BCD：Chrome 86+ 支持 `showDirectoryPicker`，Edge 跟随 Chrome；但该 API 是 Limited availability / Experimental。 |
| Firefox / Safari 支持 | 不可以 | MDN BCD 对 Firefox、Safari 标为 `version_added: false`，必须保留 ZIP 或传统多文件下载降级。 |

## 权限与安全边界

1. 仅在 **HTTPS 安全上下文** 可用；本地开发通常可用 `localhost`，线上必须部署 HTTPS。
2. `showDirectoryPicker()` 和 `requestPermission()` 都需要 transient user activation，必须直接由按钮点击触发；不能在定时器、自动任务或 Worker 中静默弹出授权。
3. `requestPermission()` 在跨域 iframe 中会抛 `SecurityError`；目录选择也可能因用户取消或目录过于敏感/危险而抛 `AbortError`。
4. `queryPermission()` 的结果为 `granted`、`denied` 或 `prompt`。`prompt` 时不能直接写入，需由按钮点击继续调用 `requestPermission({ mode: 'readwrite' })`；`denied` 则改走降级路径。
5. `showDirectoryPicker` 的 `id` 可让**浏览器记住下次打开 picker 时的位置**，但这只影响对话框初始目录，不能替代页面持有目录写权限。

## 推荐产品/实现形态（供后续方案采用）

- 首次点击：若支持 API，显示「选择导出目录」系统对话框，然后直接批量写入；页面保存目录 handle 至 IndexedDB。
- 后续点击：从 IndexedDB 取 handle，查询 `readwrite` 权限。`granted` 直接批量写入；`prompt` 时在这一次点击中请求权限；`denied` / 失败则提示重新选择目录或导出 ZIP。
- 不支持浏览器：优先导出一个 ZIP（一次下载对话框/浏览器下载动作），不要尝试逐个 `<a download>`，后者仍受浏览器下载设置、多文件下载拦截和保存提示控制。
- UI 要明确标注「Chrome / Edge 推荐」「重新打开浏览器后可能需要再次授权」，并允许用户随时「更换目录」。

## 关键引文与来源

1. MDN `showDirectoryPicker()`："displays a directory picker which allows the user to select a directory"；`mode` 可设为 `readwrite`；并注明它是 "Secure context"、"Experimental"、"Limited availability"。该页还说明相同 `id` 的 picker 会打开同一目录。
   - https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
2. MDN `showDirectoryPicker()` 安全说明："Transient user activation is required. The user has to interact with the page or a UI element"；并说明用户取消、敏感目录或未获指定模式权限时会产生 `AbortError`。
   - https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
3. MDN `FileSystemHandle.queryPermission()`：返回 `granted`、`denied` 或 `prompt`；若为 `prompt`，网站必须先调用 `requestPermission()`；并明确写道："a handle retrieved from IndexedDB is also likely to resolves with `prompt`"。
   - https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/queryPermission
4. MDN `FileSystemHandle.requestPermission()`：请求 file handle 的 `read` 或 `readwrite` 权限；跨域 iframe、没有 transient user activation、或 Worker 等无法消费 user activation 的环境会抛 `SecurityError`。
   - https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission
5. MDN Browser Compatibility Data（`Window.showDirectoryPicker`）：Chrome `86` 起支持、Edge `mirror` Chrome；Firefox 与 Safari 为 `false`。
   - https://github.com/mdn/browser-compat-data/blob/main/api/Window.json

> 调研时间：2026-07-15。Chrome 官方指南页面在本次访问中触发 Google automated-traffic 限制，故浏览器支持数字以 MDN BCD 为准；以上 API 行为均以 MDN Web API 文档交叉确认。
