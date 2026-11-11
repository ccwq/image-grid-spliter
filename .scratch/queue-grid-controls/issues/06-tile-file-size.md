# T06 切片与原图大小显示

Type: grilling
Status: resolved
Blocked by:

## Question

在图片上以小字显示每个切片的大小与原图大小。需决策：

1. "大小"的口径：文件字节数（KB/MB，切片取 `blob.size`，原图取 `File.size`）还是像素尺寸（尺寸已在 meta 行显示）？原图需在 `ImageItem` 增加文件字节数字段（`addFiles` 时记录 `file.size`）。
2. 呈现位置：原图预览图与每个切片缩略图上的角标小字覆盖（叠加在图片上），还是缩略图下方 meta 行追加？常显还是悬停显示？

预算：2 轮讨论。

## Answer

（2026-11-11 用户直接给定口径，无需展开讨论）

1. **口径**：文件字节数，KB/MB 格式化显示；原图取 `File.size`（`addFiles` 时在 `ImageItem` 增加文件字节数字段），切片取 `blob.size`。
2. **呈现**：叠加在图片上的角标小字，常显（非悬停）；原图预览图与每个切片缩略图都显示。

