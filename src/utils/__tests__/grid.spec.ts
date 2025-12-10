/// <reference types="vitest/globals" />
import { computeTileRects } from '../grid'

describe('computeTileRects', () => {
  it('生成正确的切片数量与覆盖范围', () => {
    const rects = computeTileRects(1000, 800, 2, 3)
    expect(rects).toHaveLength(6)

    const firstRowWidth = rects.filter((r) => r.row === 1).reduce((sum, r) => sum + r.width, 0)
    const secondRowWidth = rects.filter((r) => r.row === 2).reduce((sum, r) => sum + r.width, 0)
    expect(firstRowWidth).toBe(1000)
    expect(secondRowWidth).toBe(1000)

    const colHeights = [1, 2, 3].map((col) =>
      rects.filter((r) => r.col === col).reduce((sum, r) => sum + r.height, 0),
    )
    colHeights.forEach((h) => expect(h).toBe(800))
  })

  it('末行末列吸收舍入误差', () => {
    const rects = computeTileRects(997, 503, 3, 2)
    const maxX = Math.max(...rects.map((r) => r.x + r.width))
    const maxY = Math.max(...rects.map((r) => r.y + r.height))
    expect(maxX).toBe(997)
    expect(maxY).toBe(503)
  })

  it('非法网格抛错', () => {
    expect(() => computeTileRects(100, 100, 0, 2)).toThrow()
    expect(() => computeTileRects(100, 100, 2, 0)).toThrow()
  })
})
