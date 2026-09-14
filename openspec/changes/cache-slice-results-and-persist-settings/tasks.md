# Tasks: 缓存切片结果并持久化工作区偏好

## 1. 切片结果缓存深模块

- [x] 1.1 新建 `src/modules/sliceResultCache.ts`：定义 `SLICE_CACHE_ALGORITHM_VERSION`（初始 `'v1'`）、`CachedTileMeta`、`CachedSliceEntry`、`SliceCacheKeyInput`、`buildSliceCacheKey` 与 `createSliceResultCache`（接口见 design.md Decision 1）；键字段定界符拼接并包含算法版本、图片内容标识、矩形序列、格式，JPG 追加质量、PNG 省略质量，绝不含 baseName；矩形取整采用与绘制完全一致的统一规则——绘制前对每个矩形 `Math.round`（x/y/width/height），键使用同一取整后值（Canvas 赋值会截断浮点，两侧规则必须相同，禁止键 round 而绘制截断）；JPG 质量以整数百分比（`Math.round(quality * 100)`）参与键，禁止 0-1 浮点直接字符串化；WebCrypto 回退标识豁免"不含文件名"约束（主路径 SHA-256 摘要不含）
- [x] 1.2 实现 LRU 双重上限：命中重插提升最近使用；写入后按 LRU 逐出直到条目数 ≤ 30 且 Blob 字节和 ≤ 256 MiB（默认值可注入）；in-flight 记录不占两项配额；`stats()` 暴露 `{ entries, blobBytes }` 供测试与调试
- [x] 1.3 实现 in-flight 合并：`begin(key)` 返回 `{ isLeader, token, promise }`，leader 持 token、跟随者共享 Promise（以 `entry | null` 收尾，rejection 一致传播且调用方必须 catch）；`settle(key, entry, token)` 由缓存内部复核 token 在册且未被 `clear()` 清除才入账（单一把关方），"未取消/未失败/完整/未过期"由调用方先行判定，不满足时走 `abandon(key, token)` 释放记录；被合并等待的条目逐出时保留至 settle 后重算
- [x] 1.4 实现超预算单条目规则：单条目 Blob 字节和 > 256 MiB 时 `settle` 拒绝入账但结果照常返回给调用方；实现 `invalidate(imageIdentity)` 与 `clear()`
- [x] 1.5 新建 `src/modules/__tests__/sliceResultCache.spec.ts`（每个用例前附中文 GWT 注释模板）：覆盖键构成（PNG 忽略质量、JPG 含质量、baseName 不参与、矩形变化换键、算法版本隔离）、键矩形与绘制矩形同值断言（Math.round 后一致）、命中提升、双限逐出、in-flight 不占配额、单条目超预算、in-flight 合并（共享 promise null/rejection 语义）、失败/取消/不完整/过期/clear 后完成不入缓存、abandon、invalidate、clear 与 stats

## 2. useImageSlicer 接入统一 ensure 物料化路径

- [x] 2.1 在 `useImageSlicer` 内注入缓存实例并新增内部 `ensureTiles(item, paramsSnapshot)`：先 `lookup`，未命中则 `begin` → 执行现有 `splitImage` 生成 → 校验完整性/未取消/未过期后 `settle`（不满足则 `abandon`）；命中或生成完成后将 `CachedSliceEntry` 物料化为 `TileResult[]`（新建 Object URL、按当前 baseName 生成 name、新 id）。**重切改为成功后原子换装（行为变更）**：生成期间保留旧 tiles 与其 URL 展示，全部成功后一次性替换 `item.tiles` 再 revoke 旧 URL；失败/取消/部分完成/stale 不替换、不 revoke 旧 URL（`cleanupItem`/`resetApp` 整体清理路径不变）
- [x] 2.2 为生成参数建立生效快照（算法版本、imageIdentity、实际矩形序列、format、JPG 条件质量），生成开始与结束各取一次；不一致即判定 stale，结果不 `settle` 且不替换已展示结果（latest-wins）。**新增重入协调**：处理期间收到新的生成请求（含处理中拖拽追加图片——该场景现被 `state.processing` 守卫静默吞掉）时置 dirty/pending-rerun 标记，本轮结束后自动补跑一轮，保证 latest-wins 的"新一轮"真实发生（UI 参数控件在 processing 时 disabled，标记主要服务追加图片与程序化触发）
- [x] 2.3 将 `addFiles`（上传/追加）、`processAll`（参数刷新/自动下载）、`downloadSingleImage`、`triggerDownloads` 全部迁移到 `ensureTiles`；预览保存/另存为继续消费已物料化 tiles，不触发生成；全量命中时不进入 `generating` 进度阶段（跳过 `beginExportProgress('generating', …)`），部分命中按未命中 tile 计数，saving/downloading 阶段进度行为不变
- [x] 2.4 保持 `triggerDownloads` 的 `directoryExport.prepareManualExport()` 为点击路径最前的 await，缓存查找与生成 await 全部在其后；取消、异常与部分完成路径行为与现状一致
- [x] 2.5 调整 `resetApp`：清空 `images`（revoke 全部 Object URL）、`pendingTraditionalDownloads` 与 `cache.clear()`；不触碰任何处理配置（预设/行列/分割线/边线擦除/格式/质量）；`App.vue` 的 `resetAll` 同步收敛为仅清空工作区、保留配置；顺带删除 `resetApp` 中 `selectedPreset.value = selectedPreset.value` 死代码
- [x] 2.6 `invalidate(imageIdentity)` 作为预留接口实现并测试，不在 `resetApp` 场景调用（当前代码无单图移除/替换路径，队列仅支持整体清空 → `cache.clear()` 已覆盖；不得为它虚构调用点）

## 3. 设置持久化深化

- [x] 3.1 深化 `useGridSettings`：新增 `persistGridSettings` / `restoreGridSettings`（键 `igs:grid-settings`），载荷含预设/自定义网格身份与行列（`{cols, rows}`）、自定义输入行/列、手动水平/垂直分割线、边线擦除 `{enabled, padding, unit, includeOuter}`；全部读写包裹 try/catch，恢复时逐字段校验（有限数、0<line<1、正整数行列）非法回退默认、合法字段照常恢复
- [x] 3.2 `App.vue` 在 `onMounted` 中于任何生成发生前调用 restore，并遵守恢复顺序契约（防 `watch(selectedPreset)` 竞争）：先恢复预设身份（匹配内置预设则选中，否则按自定义网格恢复 `customRows`/`customCols`）→ `await nextTick()` 等 watcher flush → 再将分割线与 `padding`/`paddingUnit`/`trimOuterEdges` **整体写入 `slicePlan`**（禁止经由 `planForGrid`——其硬编码 `'percent'`/`false` 会丢恢复值），同步 `edgeEraseEnabled`/`edgeErasePadding` 两个 ref；不恢复 `images` 与结果缓存，restore 不触发 `processAll`
- [x] 3.3 `useExportSettings` 保持 `igs:export-format` / `igs:jpg-quality` 原键与语义不变（兼容红线），仅为持久化入口补齐缺失的防御性校验；`App.vue` 将边线擦除与分割线的稳定值变化写入持久化载荷
- [x] 3.4 新建/扩展 `src/composables/__tests__/useGridSettings.spec.ts`（每用例附中文 GWT 注释）：覆盖保存-恢复往返、自定义网格身份恢复、非法载荷逐字段回退、localStorage 抛异常时以默认值继续、既有格式/质量键兼容

## 4. App.vue 接线与回归保护

- [x] 4.1 `App.vue` 移除 `resetAll` 中的配置重置逻辑（保留清空工作区），确认 restore 按 3.2 的顺序契约执行后 `watch(selectedPreset)` 不抹掉恢复的非等分分割线，且边线擦除/分割线/预设的 watcher 不触发多余生成（队列空时 `watch(slicePlan)` 自然不触发）
- [x] 4.2 确认 PhotoSwipe 预览（保存/下载/另存为）、目录导出重试、传统下载、本地化切换、PWA、紧凑工作区与分阶段进度全部行为不变；原子换装后 PhotoSwipe 同数量重切的 URL 有效性以新行为为准；如发现回归点在此修复或记录

## 5. 测试与验证

- [x] 5.1 单元测试：为 `useImageSlicer` 缓存接入补测试（每用例前附中文 GWT 注释模板：Given/When/Then/防回归）——命中不重切、改名命中且名称正确、参数变化生成新键、in-flight 合并、取消/失败/过期不入缓存且**不替换旧展示结果（旧 URL 仍有效）**、原子换装（成功后才 revoke 旧 URL）、全量命中跳过 generating 进度、处理中追加图片经 dirty 标记补跑、重置清缓存保配置
- [x] 5.1.1 恢复顺序回归测试（`App.vue` 层或 `useGridSettings` 测试）：Given 持久化载荷含非等分分割线与 3 x 5 自定义网格，When 执行 restore，Then 分割线仍为非等分值、网格为 3 x 5（不被 `watch(selectedPreset)` 的等分线覆写）
- [x] 5.2 类型检查：`pnpm exec vue-tsc --noEmit` 通过
- [x] 5.3 全量测试：`pnpm test` 通过（含既有全部用例无回归）
- [x] 5.4 构建：`pnpm build` 成功
- [x] 5.5 严格校验变更：`openspec validate cache-slice-results-and-persist-settings --strict` 通过
- [x] 5.6 diff 检查：对照 `git status` / `git diff` 确认未改动本变更目录以外的既有 openspec change、且与 `refactor-compact-export-workspace` 的未提交工作区改动无覆盖冲突（实施顺序为先落地该 change 再实施本变更，在其状态之上叠加）
- [ ] 5.7 浏览器 QA（agent-browser --cdp 9696，截图存至 `%temp%\agent-browser-captures\**`）：上传图片生成 → 调整分割线触发重生成 → 恢复原参数确认秒出（命中缓存）→ 改名上传同名内容图确认名称正确 → 刷新页面确认网格/分割线/边线擦除/格式/质量恢复且队列为空 → 重置确认配置保留 → PC 端点击“下载全部”确认目录授权先于生成 → 预览保存/下载/另存为正常
