## ADDED Requirements
### Requirement: 装饰性图标与像素风格资源
界面 SHALL 集成 `@iconify-json/pixelarticons` 图标资源，为主要模块提供装饰性/引导性图标，确保与现有主题配色与尺寸一致且不阻碍操作。

#### Scenario: 图标集成与降级
- **WHEN** 页面在头部、控制面板或空状态展示装饰性图标
- **THEN** 图标来源于 pixelarticons 集合并与布局/配色保持一致
- **AND** 若图标加载失败，文本与布局仍可正常展示与操作
