# 进度日志

## 2026-07-15

- 已用 CDP 完成当前移动端审计并与用户确认工作台式重设计决策。
- 当前阶段：重构 App 信息架构与交互容器。
- 已确认无需新依赖：现有 Vue、Iconify 与 CSS 可满足交互需求。
- 已将 App 改为 Canvas-first 工作台，并把 SliceEditor 收敛为画布叠线与触控编辑组件。
- 下一步：类型检查，修复模板或响应式问题，再通过 CDP 回归 PC/移动端。
- 移动端初验通过：上传、进入调整、36dvh 调整面板、36px 分割线触控热区均可用。
- 移动端流程验收通过：增加横线会更新输出数量；导出先打开确认抽屉。
- 服务重启：尝试通过统一执行会话发送 Ctrl+C 被后端拒绝（`process interrupt is not supported by this process backend`）。下一步按端口核实 Vite 进程后，使用新端口启动，不复用旧服务。
- 首次 `pnpm dev -- --host ... --port ...` 将分隔符传给 Vite，服务落在 5174 而非请求的 5188。改用 `pnpm exec vite --host 0.0.0.0 --port 5188`。
- 已启动独立服务 `http://image-sli.localhost:5188/` 并完成移动端和 PC CDP 回归。
- 修复 AppHeader 依赖已删除全局 CSS 的回归，以及上传后 file input 被卸载导致不能继续添加图片的回归。
- 当前阶段：运行完整测试、构建与 OpenSpec 更新后收尾。
- 最终验证通过：`pnpm test`（14 tests）、`pnpm exec vue-tsc --noEmit`、`pnpm build`、`openspec validate add-interactive-grid-slicing --strict`。
- 用户纠正交互边界：工作台替换原预览逻辑不可接受。开始恢复原 `ResultsPanel + PhotoSwipe` 主流程，仅保留参数调整与结果宫格折叠增量。
- CDP 发现插槽内 file input ref 不具备 owner context，已迁移为 App 根部常驻 input，避免“选择图片”按钮失效。
- 快捷网格规则已确认：切换 `N x N` 按钮只替换横竖分割线，保留边线擦除数值、单位及外边缘开关；实际结果预览和导出均应用擦除。
- 快捷按钮集收敛为 `1x1、1x2、2x1、2x2、3x3、4x4、2x4、4x2`。
- 紧凑视觉规范：按钮统一为 32px 小尺寸，控件间距收敛为 6-10px；数字输入和下拉使用深色表面、边框及可见 focus ring，保留分割线 36px 触控热区。
- 拖线跳动根因：分割线节点使用位置值作为 Vue key，位置变动时节点被重建并丢失 pointer capture。修复为稳定的轴向索引 key，并在组件本地维护拖动草稿，松手后才提交结果重算；靠近常用比例时弱吸附。

## 2026-07-16

- 完成目录直写批量导出的可行性调查和逐项需求拷问。
- 已写入 ADR-0001 与术语表；不引入 ZIP，回退为既有传统逐张下载。
- OpenSpec 提案首次写入因 `findings.md` 上下文不匹配被拒绝；已重新读取文件并改用分批补丁。
- 已创建并校验 `add-directory-batch-export`：`openspec validate add-directory-batch-export --strict` 通过，`git diff --check` 无错误。
- 已实现 `useDirectoryExport` 深 module、IndexedDB 句柄复用、`readwrite` 目录选择、`-1` 重名与部分失败显式重试；传统逐张下载保留为唯一降级。
- 已完成 Chromium CDP UI 回归：支持目录时显示首次选择目录说明与“更换导出目录”，浏览器控制台无错误；截图在 `%TEMP%\\agent-browser-captures\\directory-export-settings.png`。
- `agent-browser skills get core --full` 在已安装 v0.24.0 中不存在；改以 `--help` 获取等价命令后完成 CDP 回归。
- 最终自动化验证通过：`pnpm test`（20 tests）、`pnpm exec vue-tsc --noEmit`、`pnpm build`、`openspec validate add-directory-batch-export --strict`、`git diff --check`。真实 Windows 目录确认和文件落盘需由用户在系统选择器中手动完成。
- 完成紧凑工作区审计和实施：桌面为控制侧栏与上传/结果主区，移动端上传优先并以可折叠控制栏承载全部设置。
- 新增 fixed `ExportProgressOverlay`，实际 CDP 截图验证“正在生成 1 / 4”进度和关闭按钮；目录直写/传统下载完成后会按各自语义显示报告。
- CDP 首次以未加引号的 `@e7` 元素引用点击失败，原因是 PowerShell 将 `@` 当作特殊标记；改为 `click '@e7'` 后成功展开移动控制栏。
- 本轮验证通过：`pnpm test`（20 tests）、`pnpm exec vue-tsc --noEmit`、`pnpm build`、`openspec validate refactor-compact-export-workspace --strict` 和 `git diff --check`。桌面、移动、上传后的结果入口及控制台无错误均已 CDP 验证。
- 修复有图态上传区仍占满右侧主区的问题：仅空态保留桌面最小高度；有图时 `UploadPanel` 收缩为继续添加、队列、文件名和尺寸的紧凑栏。
- 修改后 CDP：1264px 桌面上传栏高 149.6px，结果区从 y=337.6 开始；390px 移动上传栏高 156px，结果从 y=326 开始。复审 agent ACCEPT，确认无横向溢出、长文件名截断且主要上传/下载/预览入口保持可用。
- 删除 `SliceEditor` 内重复的边线擦除、单位和外边缘控制，仅保留分割线编辑；`GridPresetsPanel` 成为唯一边线擦除入口，并在 PC 与移动端统一使用两列两行紧凑布局。CDP 指定 tab 复查通过，`pnpm build` 与 OpenSpec 严格校验通过。
