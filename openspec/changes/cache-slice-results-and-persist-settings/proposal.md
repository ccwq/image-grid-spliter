# Change: 缓存切片结果并持久化工作区偏好

## Why

当前每次参数变化或导出动作都会对全部图片重新执行画布裁切（`useImageSlicer.processAll` / `downloadSingleImage`），重复生成浪费算力并拖慢交互；同时网格预设/自定义行列、手动分割线、边线擦除等处理配置在页面刷新后全部丢失，只有导出格式、JPG 质量与自动下载开关有持久化。需要引入会话内的切片结果缓存与完整处理配置持久化，且不得破坏任何既有能力。

## What Changes

- 新增当前会话内存切片缓存（深模块 `src/modules/sliceResultCache.ts`）：一个缓存条目对应"一张输入图片的内容标识 + 一组生效生成参数"产出的完整切片集合。
- LRU 双重上限：最多 30 个条目、最多 256 MiB 缓存 Blob 字节；超出时按最久未使用逐出；单条目自身超预算时结果仍可用于当前预览/导出但不入缓存。
- 缓存键 = 显式算法版本 + 图片内容标识 + 实际归一化切片矩形 + 导出格式；JPG 额外纳入 JPG 质量，PNG 忽略质量；`baseName` 不参与键，缓存 Blob 字节可跨文件名复用，下载名称在物料化时按当前 baseName 生成。
- 缓存只存 Blob 与稳定切片元数据（行列号、宽高），绝不存 Object URL、随机 id、图片元素或文件名。
- 相同缓存键的进行中生成合并为一次运行；失败、取消、部分完成、过期（生成期间参数已变）与重置后完成的工作不入缓存、不替换当前完整结果；处理期间到达的新生成请求经待重跑协调在本轮结束后自动补跑（latest-wins，同时修复处理中追加图片被吞掉的既有缺口）。
- 重切路径从"生成前先回收旧切片 URL"调整为"成功后原子换装"（生成期间保留旧结果展示，全部成功后一次性替换并回收旧 URL）——一项显式行为变更，失败/取消时用户不再面对已被清空的结果。
- 全量命中缓存的生成轮次跳过 generating 进度阶段（避免瞬时假进度），部分命中按未命中切片计数；导出阶段进度语义不变。
- 上传预览、追加图片、参数刷新、单图下载、下载全部与自动下载共享同一条 ensure→物料化路径；目录选择器/权限准备保持在显式用户点击路径的最开始。
- 重置清空图片、Object URL、待交付下载状态与内存缓存，但保留全部处理配置。
- 深化 `useGridSettings` 与 `useExportSettings`：完整处理配置（预设/自定义网格身份与行列、手动水平/垂直分割线、边线擦除启用/数值/单位/含外边缘、导出格式、JPG 质量）持久化到 localStorage 并在重开页面时恢复；恢复遵守固定顺序（先恢复预设/自定义身份，待预设监听器处理完毕后再写入手动分割线，防止等分线覆写）；不恢复图片与结果缓存。
- 既有导出格式/质量偏好键保持兼容；存储非法或不可用时安全降级。
- 不引入 IndexedDB，不做任何跨页面刷新的结果缓存。

## Impact

- Affected specs: `slice-result-cache`（新增）、`workspace-preferences`（新增）
- Affected code: `src/modules/sliceResultCache.ts`（新增）、`src/composables/useImageSlicer.ts`、`src/composables/useGridSettings.ts`、`src/composables/useExportSettings.ts`、`src/App.vue`
- Dependencies: 无新增外部依赖；复用 `src/utils/grid.ts`（矩形计算/归一化）与 `src/utils/fileUtils.ts`（`fileSha256` 内容标识）
- 潜在冲突: 无规范冲突。`refactor-compact-export-workspace` 与本变更共享 `useImageSlicer.ts` / `App.vue` 的生成路径（其改动聚焦进度与布局，本变更聚焦缓存与持久化，语义正交），实施顺序为先落地该 change 再实施本变更，在其最新工作区状态之上叠加并做 diff 检查，避免覆盖既有未提交改动。
