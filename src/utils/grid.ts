export interface GridPreset {
  cols: number
  rows: number
  label?: string
}

export interface TileRect {
  x: number
  y: number
  width: number
  height: number
  row: number
  col: number
}

/** 分割线位置以原图宽/高的 0 到 1 比例保存。 */
export interface SlicePlan {
  horizontalLines: number[]
  verticalLines: number[]
  padding: number
  paddingUnit: 'percent' | 'px'
  trimOuterEdges: boolean
}

/** SlicePlan 的兼容别名，便于配置型调用方表达其用途。 */
export type GridSliceConfig = SlicePlan

/**
 * 将可编辑分割线清理为有序、去重且位于图片内部的归一化位置。
 * 0 和 1 是图片边界，不作为可编辑分割线保存。
 */
export function normalizeDividerLines(lines: number[]): number[] {
  return [...new Set(
    lines
      .filter((line) => Number.isFinite(line) && line > 0 && line < 1),
  )].sort((a, b) => a - b)
}

/** 根据行数或列数生成等分的内部归一化分割线。 */
export function createEvenDividerLines(count: number): number[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('网格行/列必须为大于 0 的整数')
  }

  return Array.from({ length: count - 1 }, (_, index) => (index + 1) / count)
}

function toPixels(value: number, unit: SlicePlan['paddingUnit'], dimension: number): number {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0
  return unit === 'percent' ? (safeValue / 100) * dimension : safeValue
}

/**
 * 根据最终分割线计算裁切矩形。
 * padding 是一条边线的总擦除宽度：内部线的相邻两侧各擦除一半；
 * 开启 trimOuterEdges 时，图片外边缘同样各擦除一半。
 */
export function computeTileRectsFromLines(width: number, height: number, plan: SlicePlan): TileRect[] {
  if (width <= 0 || height <= 0) {
    throw new Error('图片宽高必须大于 0')
  }

  const horizontalLines = normalizeDividerLines(plan.horizontalLines)
  const verticalLines = normalizeDividerLines(plan.verticalLines)
  const yBoundaries = [0, ...horizontalLines, 1]
  const xBoundaries = [0, ...verticalLines, 1]
  const halfHorizontalPadding = toPixels(plan.padding, plan.paddingUnit, height) / 2
  const halfVerticalPadding = toPixels(plan.padding, plan.paddingUnit, width) / 2
  const rects: TileRect[] = []

  for (let row = 0; row < yBoundaries.length - 1; row += 1) {
    const sourceTop = yBoundaries[row] * height
    const sourceBottom = yBoundaries[row + 1] * height
    const topInset = row === 0 && !plan.trimOuterEdges ? 0 : halfHorizontalPadding
    const bottomInset = row === yBoundaries.length - 2 && !plan.trimOuterEdges ? 0 : halfHorizontalPadding
    const y = Math.min(sourceBottom, sourceTop + topInset)
    const bottom = Math.max(y, sourceBottom - bottomInset)

    for (let col = 0; col < xBoundaries.length - 1; col += 1) {
      const sourceLeft = xBoundaries[col] * width
      const sourceRight = xBoundaries[col + 1] * width
      const leftInset = col === 0 && !plan.trimOuterEdges ? 0 : halfVerticalPadding
      const rightInset = col === xBoundaries.length - 2 && !plan.trimOuterEdges ? 0 : halfVerticalPadding
      const x = Math.min(sourceRight, sourceLeft + leftInset)
      const right = Math.max(x, sourceRight - rightInset)

      const rect = {
        x,
        y,
        width: right - x,
        height: bottom - y,
        row: row + 1,
        col: col + 1,
      }

      // 过大的 padding 不会产生反向矩形；无可用像素的切片直接忽略。
      if (rect.width > 0 && rect.height > 0) {
        rects.push(rect)
      }
    }
  }

  return rects
}

/**
 * 计算切片矩形，保证最后一行/列吸收舍入误差以覆盖完整图片。
 */
export function computeTileRects(width: number, height: number, rows: number, cols: number): TileRect[] {
  if (rows <= 0 || cols <= 0) {
    throw new Error('网格行/列必须大于 0')
  }
  // 保持旧 API 的整数边界和末行/末列吸收舍入误差行为。
  const plan: SlicePlan = {
    horizontalLines: createEvenDividerLines(rows),
    verticalLines: createEvenDividerLines(cols),
    padding: 0,
    paddingUnit: 'px',
    trimOuterEdges: false,
  }

  return computeTileRectsFromLines(width, height, plan).map((rect) => {
    const x = Math.round(rect.x)
    const y = Math.round(rect.y)
    const nextX = Math.round(rect.x + rect.width)
    const nextY = Math.round(rect.y + rect.height)
    return {
      ...rect,
      x,
      y,
      width: Math.max(0, nextX - x),
      height: Math.max(0, nextY - y),
    }
  })
}

export const gridPresets: GridPreset[] = [
  { cols: 1, rows: 1, label: '1 x 1' },
  { cols: 1, rows: 2, label: '1 x 2' },
  { cols: 2, rows: 1, label: '2 x 1' },
  { cols: 2, rows: 2, label: '2 x 2' },
  { cols: 3, rows: 3, label: '3 x 3' },
  { cols: 4, rows: 4, label: '4 x 4' },
  { cols: 2, rows: 4, label: '2 x 4' },
  { cols: 4, rows: 2, label: '4 x 2' },
]

export const formatGridLabel = (preset: GridPreset) => `${preset.cols} x ${preset.rows}`
