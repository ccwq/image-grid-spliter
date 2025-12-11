## ADDED Requirements
### Requirement: 导出格式选择与持久化
系统 SHALL 通过下拉控件提供 PNG/JPG 导出格式选择，默认值为 JPG；用户选择的格式与相关导出偏好 SHALL 持久化并在后续会话自动恢复。

#### Scenario: 首次使用默认 JPG
- **WHEN** 用户首次打开工具且未保存偏好
- **THEN** 导出格式默认显示为 JPG，质量取默认值，且可以直接触发导出

#### Scenario: 切换格式并恢复偏好
- **WHEN** 用户将导出格式切换为 PNG 后关闭并重新打开工具
- **THEN** 格式下拉显示为 PNG，且后续导出按 PNG 处理，无需再次选择

### Requirement: JPG 压缩强度控制
系统 SHALL 在导出格式为 JPG 时提供可调节的压缩强度（质量）控制；该设置 SHALL 持久化，且变更后立即作用于后续导出。

#### Scenario: 调整质量立即生效并记忆
- **WHEN** 用户将 JPG 质量从默认值调整为较低数值
- **THEN** 之后的 JPG 导出文件尺寸减小、清晰度相应下降，且刷新页面后质量仍为用户设置的数值

### Requirement: 浏览器端压缩算法集成
系统 SHALL 使用 `browser-image-compression` 处理 JPG 导出，确保在裁切或纯压缩流程中按选定质量生成输出；压缩异常时 SHALL 回退至原始输出以避免阻塞下载。

#### Scenario: 调用压缩库并回退
- **WHEN** 用户选择 JPG 并触发导出
- **THEN** 系统调用 `browser-image-compression` 按当前质量生成文件；若压缩失败，系统回退生成未压缩的 JPG 以完成下载

### Requirement: 1x1 宫格用于纯压缩
系统 SHALL 在网格预设列表中提供 1x1 选项（排列在 2x2 之前），默认选中仍为 2x2；当选择 1x1 时，系统执行不分割的压缩/导出流程。

#### Scenario: 选择 1x1 触发纯压缩
- **WHEN** 用户选择 1x1 预设并导出 JPG 或 PNG
- **THEN** 系统不拆分图片，仅按选定格式与质量处理后生成单个文件并下载
