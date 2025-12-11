# Change: 多语言支持与文档/视觉完善

## Why
当前应用仅提供单一语言，无法依据浏览器语言自动切换；仓库 README 仅有一份，缺少中英双语与互链；界面视觉较为单调，缺少装饰性图标提升引导和辨识度。

## What Changes
- 引入 i18n 支持中英文，默认语言根据浏览器首选语言设置，并提供切换入口。
- 将根目录 README.md 作为英文默认文档，新增 README.zh-cn.md，二者在显著位置互相跳转。
- 集成 `@iconify-json/pixelarticons` 装饰性图标，为核心模块增添像素风格图标以丰富视觉。

## Impact
- Affected specs: localization, documentation, ui-decoration
- Affected code: i18n 文案与切换控件、根目录文档结构、UI 图标与样式引入
