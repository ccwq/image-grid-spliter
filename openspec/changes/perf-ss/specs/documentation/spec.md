## ADDED Requirements
### Requirement: 双语 README 与互链
仓库根目录 MUST 以英文 README.md 作为默认文档，并提供 README.zh-cn.md 中文版，二者需在首屏显著位置互相跳转。

#### Scenario: 英文默认与中文链接
- **WHEN** 查看根目录 README.md
- **THEN** 文档以英文撰写并在顶部或前言位置包含指向 README.zh-cn.md 的跳转链接

#### Scenario: 中文版互链
- **WHEN** 查看 README.zh-cn.md
- **THEN** 文档以中文撰写并包含返回 README.md 的跳转链接
