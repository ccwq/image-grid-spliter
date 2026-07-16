# 子课题：传统下载、浏览器权限与 ZIP 降级

## 结论

用户预期“第一次选目录，后续批量导出自动写入同一目录”**不能靠传统的 `a[download]` / Blob 下载稳定实现**；但在支持 File System Access API 的 Chromium 浏览器中，可以由网页在首次用户点击时选择目录、拿到目录句柄，并直接连续写入多个文件。PWA 安装形态本身不会突破传统下载或文件系统权限模型；它仍是同一 Web API 的 secure-context、用户激活和浏览器兼容性约束。

跨浏览器的可靠降级是将多个产物打成一个 ZIP，再触发一次普通下载。这样只发生一次浏览器下载（是否弹出一次保存窗口仍由用户的浏览器下载设置决定），代价是等待打包、内存/CPU 消耗和用户需要解压。

## 1. `a[download]` / Blob 的能力边界

- `HTMLAnchorElement.download` 仅表示链接资源“意图被下载”，可提供默认文件名。MDN 明确说明：`"This value might not be used for download. This value cannot be used to determine whether the download will occur."`
- 因此网页只能触发一次次下载请求、建议文件名；不能通过该属性指定本地绝对路径、目录，也不能要求浏览器复用某次“另存为”所选目录。
- Chrome 官方帮助说明，普通下载默认保存到浏览器的 `default download location`；“每个下载询问保存位置”是用户在 Chrome 的 **Settings > Downloads** 中打开的设置，网页没有标准 API 可以改写它。原文：`"To change the default download location, click Change"`，以及 `"turn on Ask where to save each file before downloading"`。
- 同一次用户操作连续触发许多普通下载还可能受浏览器的自动/多文件下载防护与用户站点权限影响；应用不能假定每个浏览器都会无提示地放行。这属于浏览器安全策略，不应作为产品实现的可靠前提。

## 2. PWA 是否会改变此限制

- 不会。PWA 是 Web 的安装/分发形态，并不赋予网页任意本地目录写权限，也没有标准 API 能控制普通下载保存对话框或全局下载目录。
- 有效的区别在于 PWA 与普通网页同样可使用受支持浏览器提供的 File System Access API；这是“直接写文件”的另一条路径，不是增强版 `download`。
- `showDirectoryPicker()` 是实验性、兼容性有限的 API，且必须在 HTTPS/安全上下文与用户手势中调用。MDN 写明其会展示目录选择器；若不是通过按钮点击等用户交互调用会抛出 `SecurityError`，并明确要求 `Transient user activation`。

## 3. 首选路径：目录句柄批量写入（Chromium 增强模式）

可行流程：

1. 用户点击“选择导出目录”或首次“批量下载”。应用在这个点击处理函数内调用 `window.showDirectoryPicker({ mode: 'readwrite' })`；用户只会在此处选择一次目录。
2. 使用返回的 `FileSystemDirectoryHandle` 逐个 `getFileHandle(name, { create: true })`、`createWritable()`、`write(blob)`、`close()`。这直接写入用户授权的目录，不走每个文件的浏览器下载保存窗口。
3. 可将句柄存入 IndexedDB，后续启动先 `queryPermission({ mode: 'readwrite' })`。若仍为 `granted`，可以复用；若为 `prompt`/`denied`，必须在新的用户手势中调用 `requestPermission()` 或重新选择目录。不能承诺跨会话、跨浏览器升级或用户撤销权限后仍然无提示。

权限状态依据：MDN 的 `queryPermission()` 定义返回 `granted`、`denied` 或 `prompt`，并特别指出从 IndexedDB 取回的句柄“also likely to resolve with `prompt`”；`requestPermission()` 也要求 transient user activation。

适用范围：Chromium 系（如 Chrome、Edge）优先；功能检测应以 `typeof window.showDirectoryPicker === 'function'` 为准，不能仅以“已安装 PWA”判断。

## 4. ZIP 单文件作为跨浏览器替代

- 将本次所有图片/结果组装为一个 `.zip` Blob，再以一个 `a[download]` 或由服务端以 `Content-Disposition: attachment` 提供下载。
- 浏览器只处理一个下载任务，因而不会出现“每个文件一次保存确认”的交互；若用户开启“下载前询问保存位置”，仍会出现**一次**浏览器对话框，这是浏览器设置，网页不能消除。
- 这条路径与 PWA、普通网页一致，兼容面最广；应在不支持 `showDirectoryPicker`、权限未授予、写入中途失败、文件数量/大小适合打包时使用。
- 注意：纯前端 ZIP 会同时占有源 Blob、压缩工作区和最终 ZIP，超大批量图片应显示进度、可取消，并设置合理的内存阈值；若后端可用，服务端流式打包更稳健。

## 推荐产品取舍

| 浏览器/权限情况 | 导出方式 | 用户交互 |
| --- | --- | --- |
| Chromium 且用户授予目录读写权限 | File System Access API 逐文件写入 | 首次选目录；权限仍有效时后续无逐文件对话框 |
| Chromium 但权限为 `prompt`/`denied` | 再请求权限或重新选择目录；失败则 ZIP | 可能一次权限/目录确认 |
| Firefox/Safari 等无此 API | 单个 ZIP 普通下载 | 0 或 1 次保存对话框，取决于浏览器设置 |

## 来源

1. MDN, `HTMLAnchorElement.download`：https://developer.mozilla.org/en-US/docs/Web/API/HTMLAnchorElement/download
   - 原文：`This value might not be used for download. This value cannot be used to determine whether the download will occur.`
2. Google Chrome Help, `Download a file`：https://support.google.com/chrome/answer/95759?hl=en
   - 说明下载默认位置及由用户在 Downloads 设置中选择默认目录/启用逐文件询问。
3. MDN, `Window.showDirectoryPicker()`：https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
   - 目录选择、`readwrite` 模式、`SecurityError` 和 transient user activation 要求。
4. MDN, `FileSystemHandle.queryPermission()`：https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/queryPermission
   - 句柄权限状态与 IndexedDB 恢复后可能重新为 `prompt` 的限制。
5. MDN, `FileSystemHandle.requestPermission()`：https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission
   - 请求读写权限和必须由用户手势触发的要求。
6. Chrome for Developers, `The File System Access API`：https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
   - Chromium 的 File System Access API 总览与实现参考。
