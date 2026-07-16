# Change: 重构紧凑导出工作区与进度反馈

## Why

当前页面在所有视口按多个面板纵向堆叠。下载进度仅显示在 Hero 统计项，不能展示当前文件和总文件数，也没有完成报告。需要在不移除任何现有能力的前提下，重新组织布局和导出反馈。

## What Changes

- 桌面端改为左侧紧凑控制栏与右侧上传/结果主区域。
- 移动端保持单页单栏，控制项折叠，上传和结果优先。
- 所有视口使用一致的紧凑密度、深色主题和青绿色强调色。
- 增加固定顶部的分阶段进度条：生成、目录保存或传统下载触发。
- 增加完成报告：目录写入显示保存、重命名与失败数；传统下载明确显示已触发数。
- 以既有功能清单作为回归门槛，不删除上传、编辑、预览、下载、目录导出或本地化能力。

## Impact

- Affected specs: `compact-export-workspace`（新增）
- Affected code: `App.vue`、现有页面组件、`useImageSlicer.ts`、`useDirectoryExport.ts`、本地化和新进度组件
- Dependencies: `add-directory-batch-export` 中的目录导出 module
