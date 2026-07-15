# Change: 修复移动端拖拽上传重复入队导致结果重复的问题

## Why
- 移动端拖放上传时，同一文件会在结果列表中出现两次，说明当前拖拽事件/文件入队流程存在重复处理，现有 SHA 去重未覆盖该场景。
- 重复入队会导致重复切片与下载，浪费资源并混淆用户命名与进度反馈。

## What Changes
- 调整拖拽与全局 drop 事件的处理顺序与阻断策略，避免同一次拖拽被多次调用文件入队逻辑，尤其是移动端触摸拖拽。
- 在文件入队链路新增“处理中”级别的去重标记，防止并发的 addFiles 调用将同一文件推入队列。
- 补充移动端拖拽场景的状态恢复/错误提示，确保 dragOver/loading 状态能正确清理。

## Impact
- Affected specs: image-batch
- Affected code: src/composables/useImageSlicer.ts, src/App.vue（拖拽监听与事件传播），可能涉及 UploadPanel 交互提示
