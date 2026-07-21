## Context

图片预览由 PhotoSwipe 在 `App.vue` 注册自定义顶部按钮。裁切文件已在内存中有 Blob、文件名和预览 URL；目录导出 module 已管理目录授权及 Blob 写入。

## Goals / Non-Goals

- Goals：单张预览优先直写、显式传统下载与另存为、可见且不遮挡图片的反馈。
- Non-Goals：不增加 ZIP、不改变批量导出策略、不将文件上传到服务器。

## Decisions

- 保存只尝试已有的已授权目录，不主动弹出目录选择器；失败即传统下载，避免预览操作打断用户。
- 另存为独立使用 `showSaveFilePicker`，使用户可选择名称和位置。
- PhotoSwipe 按钮直接反映短暂状态；页面级 Toast 解释保存结果或下载降级。

## Risks / Trade-offs

- File System Access API 仅部分浏览器支持；保存和另存为都以传统下载或明确提示处理不支持状态。
- 文件写入是异步操作；同一预览动作执行期间禁用重复点击，防止重复文件。
