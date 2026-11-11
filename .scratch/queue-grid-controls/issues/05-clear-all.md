# T05 队列摘要旁的清除所有

Type: grilling
Status: resolved
Blocked by:

## Question

队列摘要（"队列中有 n 张图片"）后面增加"清除所有"按钮。需决策：

1. 与 header 既有"清除当前图片"（`resetAll`：清空图片/结果/缓存/待交付下载，保留配置）的关系：是复用同一动作只换位置，还是新语义（如仅清空图片保留结果区）？若完全相同，为何需要第二入口（可达性：PC 浮动栏、移动端摘要处）？
2. 放置位置：PC 在 `DesktopDownloadBar` 队列摘要旁，移动端在 `ResultsPanel` results-header 的 queueSummary 旁——两处都加还是仅一处？
3. 确认交互：清空不可逆，是否需要确认步骤（二次点击、confirm、还是直接清除）？处理中是否禁用？

预算：2 轮讨论。

## Answer

（2026-11-11 讨论确定）

1. **语义**：复用既有 `resetAll`（清空图片/结果/缓存/待交付下载，保留全部处理配置），不引入第二套清空语义；队列旁按钮只是新增第二个可达入口。
2. **位置**：两处队列摘要旁都加——PC 在 `DesktopDownloadBar` 队列文字旁，移动端在 `ResultsPanel` results-header 的 queueSummary 旁。
3. **确认与禁用**：点击弹浏览器 confirm 确认后执行；processing 时禁用。

