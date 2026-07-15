/// <reference types="vitest/globals" />
import {
  computeTileRects,
  computeTileRectsFromLines,
  createEvenDividerLines,
  gridPresets,
  normalizeDividerLines,
  type SlicePlan,
} from '../grid'

describe('computeTileRects', () => {
  /**
   * Given：图片使用 2 x 3 的标准等分网格
   * When：计算旧版切片矩形
   * Then：每行覆盖完整原图宽度，每列覆盖完整原图高度
   * 防回归：可编辑分割线功能不能改变既有网格裁切覆盖范围
   */
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

  /**
   * Given：图片尺寸不能被行列数整除
   * When：计算旧版切片矩形
   * Then：末行末列仍覆盖到原图右下边界
   * 防回归：改用分割线模型后不得丢失末尾像素
   */
  it('末行末列吸收舍入误差', () => {
    const rects = computeTileRects(997, 503, 3, 2)
    const maxX = Math.max(...rects.map((r) => r.x + r.width))
    const maxY = Math.max(...rects.map((r) => r.y + r.height))
    expect(maxX).toBe(997)
    expect(maxY).toBe(503)
  })

  /**
   * Given：行数或列数为零
   * When：尝试计算切片
   * Then：抛出非法网格错误
   * 防回归：无效网格不能生成无意义的裁切数据
   */
  it('非法网格抛错', () => {
    expect(() => computeTileRects(100, 100, 0, 2)).toThrow()
    expect(() => computeTileRects(100, 100, 2, 0)).toThrow()
  })
})

describe('可编辑分割线裁切', () => {
  /**
   * Given：包含边界、重复项、乱序项和无效数值的分割线
   * When：归一化分割线
   * Then：仅保留有序且唯一的内部归一化位置
   * 防回归：预览拖动与导入配置不能产生重复或图片外的切片
   */
  it('清理并排序归一化分割线', () => {
    expect(normalizeDividerLines([1, 0.75, 0, 0.25, 0.75, -0.1, 1.1, Number.NaN]))
      .toEqual([0.25, 0.75])
  })

  /**
   * Given：用户选择 3 行与 4 列
   * When：由行列数生成内部等分线
   * Then：分割线不包含图片边缘且位置正确
   * 防回归：选择既有网格预设时应重建可编辑分割线
   */
  it('由行列数生成内部等分线', () => {
    expect(createEvenDividerLines(3)).toEqual([1 / 3, 2 / 3])
    expect(createEvenDividerLines(4)).toEqual([0.25, 0.5, 0.75])
  })

  /**
   * Given：一条不居中的横线与竖线
   * When：根据最终分割线计算裁切矩形
   * Then：生成与分割线位置完全对应的四个矩形
   * 防回归：手动拖线后不得退回等分裁切
   */
  it('按最终横竖分割线生成矩形', () => {
    const plan: SlicePlan = {
      horizontalLines: [0.25],
      verticalLines: [0.4],
      padding: 0,
      paddingUnit: 'px',
      trimOuterEdges: false,
    }

    expect(computeTileRectsFromLines(1000, 800, plan)).toEqual([
      { x: 0, y: 0, width: 400, height: 200, row: 1, col: 1 },
      { x: 400, y: 0, width: 600, height: 200, row: 1, col: 2 },
      { x: 0, y: 200, width: 400, height: 600, row: 2, col: 1 },
      { x: 400, y: 200, width: 600, height: 600, row: 2, col: 2 },
    ])
  })

  /**
   * Given：两列图片和 10px 的内部边线擦除
   * When：未开启外边缘裁除时计算矩形
   * Then：共享分割线两侧各擦除 5px，图片外框保持不变
   * 防回归：padding 不能只从一侧裁切或误裁图片外边缘
   */
  it('px padding 在内部线两侧各裁一半', () => {
    const rects = computeTileRectsFromLines(100, 60, {
      horizontalLines: [],
      verticalLines: [0.5],
      padding: 10,
      paddingUnit: 'px',
      trimOuterEdges: false,
    })

    expect(rects).toEqual([
      { x: 0, y: 0, width: 45, height: 60, row: 1, col: 1 },
      { x: 55, y: 0, width: 45, height: 60, row: 1, col: 2 },
    ])
  })

  /**
   * Given：100px 宽图片、10% padding 与开启的外边缘裁除
   * When：计算单列裁切矩形
   * Then：左右外边缘分别裁除 5px
   * 防回归：百分比单位必须按对应原图轴向尺寸换算
   */
  it('百分比 padding 可裁除外边缘', () => {
    const rects = computeTileRectsFromLines(100, 80, {
      horizontalLines: [],
      verticalLines: [],
      padding: 10,
      paddingUnit: 'percent',
      trimOuterEdges: true,
    })

    expect(rects).toEqual([
      { x: 5, y: 4, width: 90, height: 72, row: 1, col: 1 },
    ])
  })

  /**
   * Given：单块宽度小于其左右 padding 总和
   * When：计算裁切矩形
   * Then：不返回零尺寸或反向尺寸的无效切片
   * 防回归：极端 padding 不得导致 Canvas 使用非法源矩形
   */
  it('忽略被过大 padding 完全擦除的切片', () => {
    expect(computeTileRectsFromLines(100, 60, {
      horizontalLines: [],
      verticalLines: [0.5],
      padding: 100,
      paddingUnit: 'px',
      trimOuterEdges: false,
    })).toEqual([])
  })
})

describe('快捷网格选项', () => {
  /**
   * Given：产品仅保留约定的快捷网格组合
   * When：读取快捷网格选项
   * Then：包含 1 x 2 与 2 x 1，不包含 5 系列、2 x 3 或 3 x 2
   * 防回归：快捷网格按钮不能回退为已移除的组合
   */
  it('提供约定的八个快捷网格', () => {
    expect(gridPresets.map(({ label }) => label)).toEqual([
      '1 x 1', '1 x 2', '2 x 1', '2 x 2',
      '3 x 3', '4 x 4', '2 x 4', '4 x 2',
    ])
  })
})
