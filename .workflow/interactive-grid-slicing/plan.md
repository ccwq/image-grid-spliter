# Interactive grid slicing and presets

## Goal

实现可编辑网格分割线、padding 擦边与可移植的手动预设库，同时保持已有行列网格与批量裁切能力。

## Success Criteria

- 原图预览可显示、添加、删除和拖动贯穿式横线、竖线。
- 以最终分割线和 padding 真实裁切所有上传图片。
- padding 支持百分比与 px，默认只擦除内部边线，可选包含外边缘。
- 可手动保存、应用、删除预设；支持 JSON 文件及剪贴板导入/导出，并处理同名冲突。
- 单元测试、类型检查、生产构建和浏览器 smoke test 均通过。

## Current Context

现有实现以 `computeTileRects(width, height, rows, cols)` 均分图片；`useImageSlicer` 通过 Canvas 输出。现有应用支持多图，所有图应共享同一裁切方案。

## Constraints

- Vue 3 + TypeScript + Canvas API；不增加后端或外部服务。
- 预设仅保存配置，不保存原图，也不自动恢复上次未保存状态。
- 新增/修改测试必须使用中文 GWT 注释。

## Risks

- 拖动坐标必须以百分比持久化、以自然尺寸裁切，避免预览缩放导致导出偏差。
- padding 可能产生零尺寸切片，算法必须过滤或给出安全边界。
- localStorage 和 Clipboard API 都可能不可用，必须降级为错误提示而非破坏裁切。

## Approval Required

无额外高风险动作。用户已在对话中确认需求并要求开始实施。

## Work Packets

- 01：裁切模型、padding 算法及单元测试。
- 02：预设库持久化、JSON/剪贴板契约及单元测试。
- 03：预览编辑器与控制面板 UI。
- 04：父代理集成、OpenSpec、浏览器验收。

## Integration Policy

父代理只集成已通过各自验证的非重叠文件；接口冲突以 `src/utils/grid.ts` 的类型定义为准。

## Verification

`pnpm test`、`pnpm exec vue-tsc --noEmit`、`pnpm build`、CDP 浏览器交互 smoke test。

## Reusable Artifacts

保留本次 workflow 计划、工作包和最终报告，供后续同类 Canvas 编辑功能复用。
