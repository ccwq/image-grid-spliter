# Packet 01: Slicing model

Objective: 实现归一化分割线、padding 的安全矩形计算并覆盖单元测试。

Ownership: `src/utils/grid.ts`, `src/utils/__tests__/grid.spec.ts`。

Do: 提供方案类型、行列默认线、增删拖动后的 rect 计算、百分比/px padding、外边缘开关。

Do not: 修改 Vue 组件、存储逻辑或 `useImageSlicer.ts`。

Verification: `pnpm test -- grid`。
