<!-- <psm-store version="1" next_id="0002" group_dimension="" /> -->
<!-- <psm id="0001" type="fact" status="active" positive="0" negative="0" created_at="2026-09-14T16:16:08Z" last_scored_at="" /> -->
图片剪裁结果缓存采用当前页面会话内的独立 deep module：一个条目是一张输入图片与一套有效参数的完整切片集合，使用 30 条与 256 MiB Blob 字节双上限 LRU；缓存键由算法版本、内容身份、实际整数裁切矩形、格式及仅 JPG 生效的质量组成，不含文件名或 Object URL。重置清空图片、URL 与结果缓存，但完整网格、手动分割线、边线擦除、导出格式和 JPG 质量通过 localStorage 保留并在重开页面时恢复。

