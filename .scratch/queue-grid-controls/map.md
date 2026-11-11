# Map: queue-grid-controls（队列控制与每图网格）

Label: wayfinder:map

Status: resolved（全部决策票已收敛，规格已发布：[spec.md](spec.md)）

## Destination

七项队列/网格控制功能的交互决策全部锁定：逐图删除与排序、下载全部正逆序开关、header 覆盖上传、每图网格覆盖（含回退全局）与清除所有、切片/原图大小显示。各 ticket 答案合并即形成可直接实施的规格；实施在本图收尾后按常规流程进行（pnpm test / vue-tsc --noEmit / build 验证）。

## Notes

- 领域词汇遵循 `GLOSSARY.md`（下载全部、传统逐张下载、重名后缀等）；相关决策：`docs/adr/0001-batch-export-directory-strategy.md`（目录直写、不提供 ZIP、失败重试语义）。
- 已核验技术事实：队列状态在 `useImageSlicer.ts` 的 `images`（`ImageItem[]`，id 为内容 SHA-256，`addFiles` 追加）；下载顺序即队列遍历顺序（`triggerDownloads` → 目录直写或传统逐张）；网格全局状态在 `useGridSettings.ts`（持久化键 `igs:grid-settings`）；切片缓存键已含每图实际整数矩形（`sliceResultCache.buildSliceCacheKey`），每图不同网格天然不冲突；队列摘要 UI 位于 `DesktopDownloadBar.vue`（PC）与 `ResultsPanel.vue` results-header（移动端）；header 已有"清除当前图片"（`resetAll`，仅清空工作区、保留配置）。
- 讨论预算（用户设定）：简单功能 2 轮，复杂功能最多 4 轮；提问用 AskUserQuestion 并标注"第 n/total 问"。
- 测试规范：新用例必须带中文 GWT + 防回归注释；新增文案默认中文并同步 `useLocale.ts` 英文版。
- `AGENTS.md` 要求功能变更前阅读 `openspec/`，但该目录在当前工作树中显示未提交删除；实施前需确认规格落点（openspec 恢复或改用 `.scratch` 规格）。

## Decisions so far

<!-- 每解决一个 ticket 追加一行：[ticket 名](相对链接): 一句话结论 -->

- [T01 逐图删除与队列排序](issues/01-remove-reorder.md): 上移/下移按钮排序；删除仅移出队列（回收 URL，缓存条目保留供重入命中）；processing 时禁用。
- [T02 下载全部正逆序开关](issues/02-download-order.md): checkbox 仅影响下载全部遍历顺序；命名与重名后缀不变；持久化 localStorage，默认正序。
- [T03 header 覆盖上传开关](issues/03-replace-upload.md): 勾选后新图替换整队；存在未下载图片先确认再替换，否则直接替换；开关持久化默认关；处理中等效 resetApp 再 addFiles。
- [T04 每图网格覆盖与单图设置入口](issues/04-per-image-grid.md): 可选覆盖未设随全局；popover 仅预设+自定义行列，一键回退全局；PC popover/移动全屏层；不持久化随队列清空；摘要改为每图各自描述。
- [T05 队列摘要旁的清除所有](issues/05-clear-all.md): 复用 resetAll 语义；PC 浮动栏与移动端结果区头部两处入口；confirm 确认，processing 禁用。
- [T06 切片与原图大小显示](issues/06-tile-file-size.md): 文件字节数 KB/MB；原图 File.size、切片 blob.size；图片角标小字常显。

## Not yet specified

- 跨功能交互矩阵：覆盖上传发生在 processing 中时的行为（已由 T03 答案覆盖：等效 resetApp 再 addFiles）；"已下载"标记（T03 需要逐图下载状态，T01 删除时不区分）在 `ImageItem` 上的具体字段与置位时机（逐图下载、下载全部、预览保存各自是否置位）——实施前需一段简短规格确认，可在实施票中处理。
- 逆序导出（T02）与逐图重排（T01）的组合已无歧义：逆序是下载全部遍历时反转队列副本，不移动队列本身。

## Out of scope

<!-- 被裁定出界的改动；当前为空 -->
