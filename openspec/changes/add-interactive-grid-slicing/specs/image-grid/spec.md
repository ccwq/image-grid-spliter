## ADDED Requirements

### Requirement: 可编辑分割线裁切

系统 SHALL 在不改变既有行列预设入口的情况下，让用户在原图预览上调整、添加和删除贯穿式横线与竖线，并以最终线条形成的矩形网格输出切片。

#### Scenario: 调整预设生成的分割线

- **WHEN** 用户选择 3 x 3 网格并拖动任一预览分割线
- **THEN** 系统 SHALL 使用新位置重新生成所有图片的切片

### Requirement: Padding 边线擦除

系统 SHALL 支持百分比和 px padding；默认仅擦除内部边线，用户开启外边缘开关时 SHALL 同时裁除图片四周。

#### Scenario: 使用内部 padding 消除格子 gap

- **WHEN** 用户设置非零 padding 且外边缘开关关闭
- **THEN** 相邻切片 SHALL 在共享边线两侧各裁除 padding 的一半，而图片外框保持不变

### Requirement: 手动裁切预设

系统 SHALL 在本地保存命名预设，并支持版本化 JSON 的文件及剪贴板单个/全部导入导出。

#### Scenario: 导入同名预设

- **WHEN** 导入数据包含与本地同名的预设
- **THEN** 系统 SHALL 让用户选择覆盖、重命名或跳过该预设
