# Design: 缓存切片结果并持久化工作区偏好

## Context

`useImageSlicer`（src/composables/useImageSlicer.ts）当前在每次 `processAll` / `downloadSingleImage` 时对所有图片重新执行 `splitImage`（Canvas 裁切 + 可选 JPG 压缩）。`App.vue` 深度监听 `slicePlan` / `exportFormat` / `jpgQualityPercent` 触发重切；`watch(selectedPreset)` 只改分割线。已持久化的偏好仅有导出格式与 JPG 质量（`igs:export-format`、`igs:jpg-quality`）与自动下载开关（`igs:auto-download`）；网格预设/自定义行列、手动分割线、边线擦除配置（`edgeEraseEnabled`/`edgeErasePadding`/`paddingUnit`/`trimOuterEdges`）都在 `App.vue` 内存中，刷新即失。图片标识已有内容哈希 `fileSha256`（src/utils/fileUtils.ts），天然适合做缓存键的图片维度。

约束：纯前端、pnpm、不新增外部依赖、保留 PhotoSwipe 预览、目录导出、传统下载、本地化、PWA 与紧凑工作区行为；`refactor-compact-export-workspace` 正在改造同一批文件（进度与布局），本变更叠加其上但不回退其行为。

## Goals / Non-Goals

- Goals:
  - 参数变化与重复导出不再重复裁切：命中缓存直接物料化（生成 Object URL 与下载名）。
  - 会话级内存缓存，双重上限可控内存。
  - 处理配置刷新后完整恢复。
  - 深模块封装全部缓存复杂度，调用方保持简单。
- Non-Goals:
  - 不做 IndexedDB / Cache Storage 结果持久化，不做跨刷新结果恢复。
  - 不缓存原始图片（图片本身仍在 `images` 队列中）。
  - 不改变裁切算法输出内容（缓存键含算法版本，算法变更时自然整体失效）。
  - 不迁移或重命名既有 localStorage 键。

## Decisions

### Decision 1: 深模块 `src/modules/sliceResultCache.ts`

新增 `src/modules/` 目录，缓存作为深模块：内部管理键构造、LRU 顺序、字节账本、in-flight 合并、逐出与清空；对外仅暴露小接口：

```ts
export interface CachedTileMeta { row: number; col: number; width: number; height: number }
export interface CachedSliceEntry { tiles: Array<{ meta: CachedTileMeta; blob: Blob }> }
export interface SliceCacheKeyInput {
  algorithmVersion: string        // 显式算法版本，如 'v1'
  imageIdentity: string           // fileSha256 结果（或其回退标识）
  tileRects: TileRect[]           // 实际矩形经统一取整规则（见 Decision 2）后的稳定序列
  format: ExportFormat            // 'png' | 'jpg'
  jpgQuality?: number             // 仅 JPG 提供（0-100 整数百分比，Math.round 后参与键），PNG 必须省略
}
export const buildSliceCacheKey = (input: SliceCacheKeyInput): string
export const SLICE_CACHE_ALGORITHM_VERSION: string
export interface SliceResultCache {
  lookup(key: string): CachedSliceEntry | null        // 命中即提升为最近使用
  begin(key: string): { isLeader: boolean; token: symbol; promise: Promise<CachedSliceEntry | null> }
  settle(key: string, entry: CachedSliceEntry, token: symbol): boolean // 缓存复核 token 在册且未被 clear 才入账
  abandon(key: string, token: symbol): void           // 失败/取消/不完整/过期时由 leader 释放 in-flight 记录
  invalidate(imageIdentity: string): void             // 预留的定向清理（当前无单图移除路径，见 tasks 2.6）
  clear(): void
  stats(): { entries: number; blobBytes: number }
}
export const createSliceResultCache = (options?: {
  maxEntries?: number       // 默认 30
  maxBlobBytes?: number     // 默认 256 MiB
}): SliceResultCache
```

- 共享 Promise 以 `CachedSliceEntry | null` 收尾（`null` = 本轮完成但未入账）；生成失败以 rejection 传播给所有等待者，调用方必须 catch，避免 unhandledrejection。
- in-flight 记录不占 30 条 / 256 MiB 配额，只有 `settle` 入账的条目计入账本。

- 备选：把缓存塞进 `useImageSlicer` —— 拒绝，该组合函数已 551 行且持有大量 UI 状态；缓存是纯数据域，值得独立文件与独立测试。
- 备选：键中含 `baseName` —— 拒绝，见 Decision 3。

### Decision 2: 缓存条目与键的构成

一个条目 = 一张输入图片 + 一组生效生成参数 → 完整 tile 集合。键字段（按序规范化拼接后哈希，或直接结构化字符串拼接）：

1. `SLICE_CACHE_ALGORITHM_VERSION`：常量字符串，算法/参数语义变化时必须递增。
2. `imageIdentity`：`fileSha256` 内容哈希；WebCrypto 不可用时为其元信息回退标识（与现有行为一致）。"键不含文件名"的约束针对主路径（SHA-256 摘要）；回退标识显式豁免（其构成本身含 `file.name`，属既有降级行为）。
3. `tileRects`：由 `computeTileRectsFromLines(width, height, plan)` 过滤空矩形后的**实际**矩形序列，而非原始 `SlicePlan` —— padding 单位换算、外边缘开关等差异都最终体现在矩形上，键自动覆盖。**取整规则单一且唯一**：绘制前先对每个矩形执行 `Math.round`（x/y/width/height 各自独立取整），键与 Canvas 绘制使用**完全相同的取整后值**——禁止键取整用 round 而绘制走截断（Canvas `width/height` 赋值按 WebIDL unsigned long 截断浮点，两侧规则不一致会造成同键不同像素）。单元测试必须断言"键中矩形 === 实际绘制矩形"。
4. `format`：`png` 或 `jpg`。
5. `jpgQuality`：仅当 `format === 'jpg'` 时纳入；以整数百分比编码（`Math.round(quality * 100)`），禁止 0-1 浮点直接字符串化（避免浮点序列化歧义）。PNG 一律忽略质量，改质量不失效 PNG 缓存。

`baseName` 与任何随机 id 不参与键。图片尺寸隐含在 tileRects 中，无需单列。

### Decision 3: 缓存只存 Blob + 稳定元数据

条目内每个 tile 仅存 `{ row, col, width, height, blob }`。不存：Object URL（生命周期归 UI）、`TileResult.id` 与 `previewUrl`（随机/易失）、`HTMLImageElement`（引用原图，阻碍回收的是 Blob 本身，可接受）、文件名/baseName（物料化时用当前 `baseName` 重新拼 `name`：单 tile 为 `baseName.ext`，多 tile 为 `baseName-r{row}c{col}.ext`，与现行 splitImage 命名规则一致）。因此 Blob 字节可在改名后复用，下载名称始终正确。

### Decision 4: LRU 双重上限与超预算单条目

- 维护使用顺序（Map 插入序 + 命中时重插）；写入后先按 LRU 逐出直到 `entries <= 30` 且 `blobBytes <= 256 MiB`。
- 逐出只删最久未使用条目，且逐出条目若正被 in-flight 合并等待，需保留至 settle 后再逐出（以 settle 结果为准重新执行逐出）。
- 单条目 blob 总字节 > 256 MiB（或 tiles 数使条目数超 30？不——条目上限按条目数计，单条目只受字节约束）：`settle` 拒绝入账（返回 false），本次结果仍完整返回给当前预览/导出流程（含等待共享 promise 的跟随者）；`lookup` 对该键持续 miss，下次重新生成。
- 256 MiB 指缓存持有的 Blob 引用字节数（`blob.size` 之和），不是浏览器总内存（Canvas、解码位图、Object URL 背后的数据不计入此账本）。

### Decision 5: in-flight 合并与 latest-wins

- `begin(key)` 返回 `{ isLeader, token, promise }`：同键首个调用者为 leader 负责生成并持 token；后来者拿到共享 promise，完成后直接消费。共享 promise 以 `entry | null` 收尾（`null` = 未入账，调用方不得消费），rejection 一致传播且各调用方必须 catch。
- `settle(key, entry, token)` 的准入由缓存内部复核（单一把关方）：token 在册且未被 `clear()` 清除才入账。"未取消 / 未抛错 / tile 数量等于键中 rect 数量（完整）/ 参数快照未过期"由调用方（`ensureTiles`）先行判定，不满足时调用 `abandon(key, token)` 释放 in-flight 记录并跳过 settle；超预算单条目由 `settle` 拒绝入账（返回 false）。in-flight 记录不占配额。
- **重入协调（必须实现，否则旧轮吞掉新轮）**：`processAll` 现有 `state.processing` 守卫会将处理期间到达的新一轮请求**静默丢弃**，且 UI 侧参数控件在 `processing` 时全部 disabled——"生成期间改参数"当前仅可通过处理中拖拽追加图片（`addFiles → processAll` 被守卫吞掉）或程序化触发到达。因此：
  - `useImageSlicer` 新增 dirty/pending-rerun 标记：处理期间收到新的生成请求（参数变化或追加图片）时置位；本轮 finally 结束后若标记在位则自动补跑一轮 `processAll`，保证 latest-wins 的"新一轮"真实发生。该标记同时补上既有缺口（处理中追加图片后新图不生成）。
  - 旧一轮完成时参数快照与发起时不一致 → 结果标记 stale：完成当前正在生成的 tile 以免中断，但不入缓存、不替换已展示的完整结果；展示与缓存都以最新一轮为准。
- 取消（`cancelRequested`）、异常、部分完成：同样不 `settle`（走 `abandon`）。

### Decision 6: 统一 ensure → 物料化路径

`useImageSlicer` 内新增内部方法 `ensureTiles(item, snapshot)`：查缓存 → miss 则 begin/生成/settle → 命中或生成后将 CachedSliceEntry 物料化为 `TileResult[]`（创建 Object URL、按当前 baseName 生成 name/id）。以下入口全部走它：

- `addFiles`（上传/拖拽 → `processAll`）
- `processAll`（参数刷新、自动下载）
- `downloadSingleImage`
- `triggerDownloads`（下载全部）
- 预览保存/另存为消费已物料化的 `images[].tiles`，不直接触发生成。

**进度语义（保持既有分阶段反馈形态，明确命中时的行为）**：全量命中缓存的轮次不进入 `generating` 阶段（跳过 `beginExportProgress('generating', …)`，避免瞬时假进度闪现），直接进入后续 saving/downloading 或完成报告；部分命中时 `generating` 阶段总数按未命中 tile 数计数；导出阶段（saving/downloading）进度行为与现状完全一致。

**目录选择器/权限准备顺序不变**：`triggerDownloads` 中 `directoryExport.prepareManualExport()` 仍必须是用户点击路径的第一个 await（transient user activation 要求），缓存查找/物料化在其后。

### Decision 7: 重置语义与设置持久化

- `resetApp`：清 `images`（连带 revoke 全部 Object URL）、清 `pendingTraditionalDownloads`、`cache.clear()`；**不触碰**处理配置状态（预设、自定义行列、分割线、边线擦除、格式、质量）。`App.vue` 现有 `resetAll` 中"重置配置"的部分（`selectedPreset.value = defaultPreset` 等）按本变更调整为不重置配置，仅保留清空工作区语义；用户显式改配置仍即时生效并持久化。
  - 备选：保留 resetAll 重置配置 —— 拒绝，任务指令明确"Reset clears images… but preserves all processing configuration"。
- 持久化分两处深化：
  - `useGridSettings`：新增 persist/restore（键 `igs:grid-settings`），载荷 `{ presetIdentity: {cols, rows} | null, customRows, customCols, horizontalLines, verticalLines }`。恢复时：若 identity 匹配内置预设则选中该预设，否则走 `applyCustomGrid` 等价路径恢复自定义网格；手动分割线直接写入 `slicePlan`。校验失败（非有限数、越界、空）逐字段丢弃回默认。
  - **恢复顺序契约（防 watcher 竞争）**：`watch(selectedPreset)` 会无条件用等分线覆写 `slicePlan.horizontalLines/verticalLines` 与 `customRows/customCols`，恢复流程必须遵守固定顺序——先恢复 `selectedPreset`/`customRows/customCols`（含自定义网格身份），`await nextTick()` 等 watcher flush 完成，**再**写入手动分割线与边线擦除四项到 `slicePlan`/refs。禁止颠倒（否则恢复的非等分分割线被等分线抹掉）；不采用 flag 抑制 watcher 的方案（watcher 语义保持单一）。
  - **字段落点**：`padding`/`paddingUnit`/`trimOuterEdges` 只存在于 `slicePlan`（无独立 ref），恢复时必须**整体写入 `slicePlan`**（含分割线与三项擦除字段），禁止经由 `planForGrid`（其硬编码 `paddingUnit: 'percent'` / `trimOuterEdges: false`，会丢掉恢复值）；仅 `edgeEraseEnabled`/`edgeErasePadding` 是独立 ref，随载荷同步恢复。
  - `useExportSettings`：既有 `igs:export-format` / `igs:jpg-quality` 键与逻辑保持不变（兼容性红线），仅在需要时补防御性 try/catch（已具备）。
- 恢复动作在 `onMounted` 中先于任何生成发生（队列此时必为空，restore 不得触发 `processAll`）；不恢复 `images` 与结果缓存（内存缓存本来就随刷新消失）。
- 存储非法（JSON 解析失败、字段类型错误）或不可用（`localStorage` 抛异常，如隐私模式）时：逐项回退默认值，功能照常，不报错打断。`igs:auto-download` 属既有独立键，不在本变更载荷范围内，reset 与本变更均不触碰它。

### Decision 8: 物料化归属与原子换装

缓存模块绝不持有 URL；Object URL 的创建与 revoke 全部留在 `useImageSlicer`。**这是一项行为变更，须明确**：现有 `processAll` / `downloadSingleImage` 在生成开始前就 revoke 全部旧 tile URL 并清空 `item.tiles`（revoke-first），失败/取消时用户看到的结果已被清空，与"失败不得替换已展示的完整结果"矛盾。本变更将重切路径改为**成功后原子换装**：

- 生成期间旧 tiles（及其 URL）保持展示不动；全部 tile 的 ensure/物料化成功后，一次性以新 tiles 替换 `item.tiles`，随后才 revoke 旧 URL。
- 失败、取消、部分完成、stale 时：不替换 `item.tiles`，旧完整结果原样保留，旧 URL 不失效。
- 命中缓存同样走该换装：新 URL 物料化完成后再 revoke 旧 URL，避免 PhotoSwipe/结果面板持有失效 URL 的空窗。
- `cleanupItem` / `resetApp`（整体清理路径）的既有回收逻辑不变——它们销毁的是整个条目而非"替换中"。

## Risks / Trade-offs

- 大图多 tile 使单条目超 256 MiB → 该条目不缓存，行为退化为现状（每次重切），无正确性风险。
- 内存增长：上限 30 条 × 大 Blob 可能仍显著占用 → 256 MiB 字节账本先于条目数生效；逐出即时释放引用，Blob 回收交给 GC。
- 缓存键碰撞（拼接歧义）→ 各字段定界符拼接 + 矩形定长序列化，算法版本字段隔离历史格式。
- 与 `refactor-compact-export-workspace` 同文件冲突 → 本变更不改其进度/布局语义；实施时基于其最新工作区状态 diff 检查，且**实施顺序为先落地该 change 再实施本变更**。
- 既有死代码 `selectedPreset.value = selectedPreset.value`（`useImageSlicer.resetApp`）在接入缓存时顺带删除。
- PhotoSwipe 深度 watch 仅在 tile 数量变化时重建 lightbox，同数量重切时旧 URL 已被 revoke 存在预置缺陷；本变更的原子换装（Decision 8）缓解 URL 失效空窗，回归测试以本变更后的行为为准，不把该预置缺陷误判为新增回归。
- JPG 压缩走 browser-image-compression（web worker）+ canvas 兜底，非纯函数 → 生成路径不变，缓存只包裹其输入输出，键由调用方传入的参数快照决定。
- 持久化载荷写入频繁（拖动分割线每次 change）→ 仅在 `slicePlan` 稳定值变化时写入（watch 已有深度监听，复用其去抖/直接同步皆可；localStorage 写入为同步小载荷，成本可忽略）。

## Migration Plan

1. 新增 `src/modules/sliceResultCache.ts`（纯新增，零调用方改动）。
2. `useImageSlicer` 接入 ensure 路径（行为兼容：无缓存时逐代回退到现有 splitImage 流程）。
3. `useGridSettings` / `App.vue` 接线持久化与 reset 语义调整。
4. 回滚：删除模块与两处接线即可，localStorage 键残留无害（旧版本不读取新键）。

## Open Questions

- 无。冻结项：缓存仅内存（30 条 / 256 MiB，in-flight 不占配额）、键不含 baseName（回退标识豁免）、矩形取整统一 `Math.round` 且键/绘制同值、JPG 质量以整数百分比入键、restore 顺序为预设→nextTick→分割线/边线擦除、重切成功后原子换装、reset 保留配置、restore 在 mounted 同步执行。
