# Change: 增加可编辑分割线、边线擦除与裁切预设

## Why

现有工具只能等分网格，无法按图片中真实的格子边界调整裁切，也无法消除格子之间的 gap。用户还需要复用、分享和导入裁切方案。

## What Changes

- 在保留现有行列预设的基础上，增加可折叠的原图分割线编辑区：显示、拖动、增加和删除贯穿式横线/竖线。
- 按最终分割线裁切所有图片；支持百分比或 px 的 padding，默认擦除内部边线，并可选择同时裁除外边缘。
- 增加本地手动预设库；保存完整裁切方案（不保存图片），支持文件和剪贴板 JSON 的单个/全部导入导出。
- 导入同名预设时提供覆盖、自动重命名和跳过选择。
- 将原本按面板纵向堆叠的操作页改为 Canvas-first 工作台：移动端固定“调整 / 导出”双操作，调整与结果使用按需面板，预设库使用独立全屏层；PC 以画布为中心、按需显示检查器。

## Impact

- Affected code: `src/utils/grid.ts`, `src/composables/useImageSlicer.ts`, `src/App.vue`，新增编辑器、预设存储及测试。
- Affected capabilities: image-grid, image-batch, grid-controls.
