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

/**
 * 计算切片矩形，保证最后一行/列吸收舍入误差以覆盖完整图片。
 */
export function computeTileRects(width: number, height: number, rows: number, cols: number): TileRect[] {
  if (rows <= 0 || cols <= 0) {
    throw new Error('网格行/列必须大于 0')
  }
  const rects: TileRect[] = []
  const tileWidth = width / cols
  const tileHeight = height / rows

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = Math.round(c * tileWidth)
      const y = Math.round(r * tileHeight)
      const nextX = c === cols - 1 ? width : Math.round((c + 1) * tileWidth)
      const nextY = r === rows - 1 ? height : Math.round((r + 1) * tileHeight)

      rects.push({
        x,
        y,
        width: Math.max(0, nextX - x),
        height: Math.max(0, nextY - y),
        row: r + 1,
        col: c + 1,
      })
    }
  }

  return rects
}

export const gridPresets: GridPreset[] = [
  { cols: 2, rows: 2, label: '2 x 2' },
  { cols: 3, rows: 3, label: '3 x 3' },
  { cols: 4, rows: 4, label: '4 x 4' },
  { cols: 2, rows: 3, label: '2 x 3' },
  { cols: 2, rows: 4, label: '2 x 4' },
  { cols: 3, rows: 2, label: '3 x 2' },
  { cols: 4, rows: 2, label: '4 x 2' },
  { cols: 5, rows: 2, label: '5 x 2' },
  { cols: 2, rows: 5, label: '2 x 5' },
]

export const formatGridLabel = (preset: GridPreset) => `${preset.cols} x ${preset.rows}`
