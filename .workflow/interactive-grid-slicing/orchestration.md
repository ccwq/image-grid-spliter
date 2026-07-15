# Orchestration: Interactive grid slicing and presets

## Execution Rules

- Keep the original objective intact.
- Ask for approval before risky, expensive, external, or destructive actions.
- Keep immediate blocking work local.
- Delegate only bounded, disjoint, materially useful packets.
- Integrate packet results before final verification.

## Goal and Success Contract

交付一个在原图预览中可编辑横竖分割线的网格裁切器。方案必须按自然图片尺寸裁切，支持 internal/outer padding，并允许用户保存、迁移和应用命名预设。所有既有网格和多图下载流程必须保留。

## Branching Rules

- 分割线用 0..1 归一化坐标保存；当 px padding 被选中时，仍仅将 padding 在每张图的自然尺寸下解析。
- 用户新建/删除线后，同步行列显示值并重新生成输出。
- 导入 JSON 不合法时不修改预设库；同名时由 UI 让用户选择覆盖、重命名或跳过。
- 发生 storage/clipboard 权限异常时保留当前配置并显示可操作的错误信息。

## Packet Prompts

详见 `packets/` 目录。工作包可直接编辑其唯一拥有的文件，禁止回退其他工作包的改动。

## Completion Audit
