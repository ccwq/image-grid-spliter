<!-- <psm-store version="1" next_id="0009" group_dimension="" /> -->
<!-- <psm id="0001" type="fact" status="active" positive="0" negative="0" created_at="2026-09-14T16:16:08Z" last_scored_at="" /> -->
图片剪裁结果缓存采用当前页面会话内的独立 deep module：一个条目是一张输入图片与一套有效参数的完整切片集合，使用 30 条与 256 MiB Blob 字节双上限 LRU；缓存键由算法版本、内容身份、实际整数裁切矩形、格式及仅 JPG 生效的质量组成，不含文件名或 Object URL。重置清空图片、URL 与结果缓存，但完整网格、手动分割线、边线擦除、导出格式和 JPG 质量通过 localStorage 保留并在重开页面时恢复。

<!-- <psm id="0002" type="decision" status="active" positive="0" negative="0" created_at="2026-11-11T06:27:14Z" last_scored_at="" /> -->
批量导出不提供 ZIP。目录直写不可用或无权限时，使用传统逐张下载。自动下载没有目录写入权限时，不弹出目录选择器。

<!-- <psm id="0003" type="constraint" status="active" positive="0" negative="0" created_at="2026-11-11T06:27:14Z" last_scored_at="" /> -->
手动批量导出必须在用户点击路径中先准备目录选择或授权，再等待缓存查询与剪裁。

<!-- <psm id="0004" type="decision" status="active" positive="0" negative="0" created_at="2026-11-11T06:27:14Z" last_scored_at="" /> -->
目录导出遇到同名文件时不覆盖，扩展名前追加递增后缀。中途写入失败时立即停止；仅在用户明确选择后，以传统下载重试剩余文件。

<!-- <psm id="0005" type="constraint" status="active" positive="0" negative="0" created_at="2026-11-11T06:27:15Z" last_scored_at="" /> -->
切片缓存只保存 Blob 与 row、col、width、height 等稳定元数据。Object URL、随机 tile id 和文件名由物料化层管理；淘汰缓存不得回收当前界面使用的 URL。

<!-- <psm id="0006" type="constraint" status="active" positive="0" negative="0" created_at="2026-11-11T06:27:15Z" last_scored_at="" /> -->
切片缓存键使用与 Canvas 绘制一致的整数化矩形。padding、paddingUnit 和 trimOuterEdges 通过实际矩形影响缓存键；切片算法或键语义变化时必须递增缓存算法版本。

<!-- <psm id="0007" type="constraint" status="active" positive="0" negative="0" created_at="2026-11-11T06:27:31Z" last_scored_at="" /> -->
切片生成前快照生效参数，避免一次生成混入不同设置。新结果全部生成成功后才替换旧结果并回收旧 URL；处理期间的新请求在本轮结束后按 latest-wins 补跑。

<!-- <psm id="0008" type="decision" status="active" positive="0" negative="0" created_at="2026-11-11T06:27:31Z" last_scored_at="" /> -->
导出反馈使用同一个固定在顶部的 ExportProgressOverlay，覆盖生成、目录保存、传统下载触发和最终报告。

