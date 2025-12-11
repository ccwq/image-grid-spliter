## ADDED Requirements
### Requirement: 应用头部品牌与版本信息
应用头部 MUST 呈现品牌标识、当前版本号，并提供指向 GitHub 项目的入口。

#### Scenario: 头部展示与跳转
- **WHEN** 用户打开应用
- **THEN** 头部左侧（或合适位置）展示 logo 与当前版本号
- **AND** 头部右上角展示 GitHub 图标按钮
- **AND** 点击 GitHub 图标在新标签页打开项目仓库
