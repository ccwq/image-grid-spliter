/// <reference types="vitest/globals" />
import { computed, nextTick, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { LocaleMessages } from '../useLocale'
import {
  GRID_SETTINGS_STORAGE_KEY,
  useGridSettings,
  type GridSettingsOptions,
} from '../useGridSettings'

/** 组合函数只需要 format.gridDescription / presetSub 两个文案项，测试桩最小化。 */
const messages = computed(() => ({
  format: {
    gridDescription: (cols: number, rows: number) => `${cols} 列 x ${rows} 行`,
    presetSub: (cols: number, rows: number) => `${cols} x ${rows}`,
  },
})) as unknown as ComputedRef<LocaleMessages>

const isMobile = computed(() => false)

function createStorage() {
  const data = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    removeItem: vi.fn((key: string) => data.delete(key)),
    clear: vi.fn(() => data.clear()),
    key: vi.fn(() => null),
    get length() { return data.size },
  } as Storage
}

function createSettings(overrides: Partial<GridSettingsOptions> = {}) {
  return useGridSettings({
    isMobile,
    messages,
    storage: createStorage(),
    ...overrides,
  })
}

describe('useGridSettings', () => {
  /**
   * Given：localStorage 为空且无持久化载荷
   * When：创建 useGridSettings 组合函数
   * Then：网格身份为内置 2 x 2 预设，分割线为等分线，边线擦除关闭且 padding 归零
   * 防回归：默认状态必须与重构前 App.vue 的初始 planForGrid 行为一致
   */
  it('无存储载荷时以默认配置初始化', () => {
    const settings = createSettings()
    expect(settings.selectedPreset.value.cols).toBe(2)
    expect(settings.selectedPreset.value.rows).toBe(2)
    expect(settings.isCustomGrid.value).toBe(false)
    expect(settings.slicePlan.value.horizontalLines).toEqual([0.5])
    expect(settings.slicePlan.value.verticalLines).toEqual([0.5])
    expect(settings.slicePlan.value.padding).toBe(0)
    expect(settings.slicePlan.value.paddingUnit).toBe('percent')
    expect(settings.slicePlan.value.trimOuterEdges).toBe(false)
    expect(settings.edgeEraseEnabled.value).toBe(false)
    expect(settings.edgeErasePadding.value).toBe(1)
    expect(settings.customRows.value).toBe(2)
    expect(settings.customCols.value).toBe(2)
  })

  /**
   * Given：用户设置自定义 3 x 5 网格、非等分手动分割线并开启边线擦除（2 px、含外边缘）
   * When：执行 persistGridSettings 后用同一存储新建组合函数水合
   * Then：网格身份（custom 3 x 5）、行列、非等分分割线、边线擦除四项完整往返
   * 防回归：刷新恢复后非等分割线不得被等分线覆写（任务 5.1.1 恢复顺序回归点）
   */
  it('完整往返：自定义 3 x 5 与非等分线恢复一致', () => {
    const storage = createStorage()
    const first = createSettings({ storage })
    first.customRows.value = 3
    first.customCols.value = 5
    first.applyCustomGrid()
    first.setHorizontalLines([0.25, 0.6])
    first.setVerticalLines([0.2, 0.4, 0.9])
    first.setEdgeEraseEnabled(true)
    first.setEdgeErasePadding(2)
    first.setEdgeEraseUnit('px')
    first.setEdgeEraseIncludeOuter(true)

    expect(first.persistGridSettings()).toBe(true)
    const second = createSettings({ storage })
    expect(second.isCustomGrid.value).toBe(true)
    expect(second.selectedPreset.value).toMatchObject({ rows: 3, cols: 5 })
    expect(second.customRows.value).toBe(3)
    expect(second.customCols.value).toBe(5)
    expect(second.slicePlan.value.horizontalLines).toEqual([0.25, 0.6])
    expect(second.slicePlan.value.verticalLines).toEqual([0.2, 0.4, 0.9])
    expect(second.edgeEraseEnabled.value).toBe(true)
    expect(second.edgeErasePadding.value).toBe(2)
    expect(second.slicePlan.value.paddingUnit).toBe('px')
    expect(second.slicePlan.value.trimOuterEdges).toBe(true)
    expect(second.slicePlan.value.padding).toBe(2)
  })

  /**
   * Given：持久化载荷中 grid.source 指向内置预设 4 x 2
   * When：新建组合函数水合
   * Then：恢复为预设身份而非自定义网格，分割线仍来自载荷中的手动值
   * 防回归：预设身份丢失会退化成 custom 标签，UI 高亮错位
   */
  it('预设身份水合后仍为内置预设', () => {
    const storage = createStorage()
    storage.setItem(GRID_SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      grid: { source: 'preset', cols: 4, rows: 2 },
      customRows: 2,
      customCols: 4,
      horizontalLines: [0.5],
      verticalLines: [0.25, 0.5, 0.75],
      edgeErase: { enabled: true, padding: 3, unit: 'percent', includeOuter: false },
    }))
    const settings = createSettings({ storage })
    expect(settings.isCustomGrid.value).toBe(false)
    expect(settings.selectedPreset.value).toMatchObject({ rows: 2, cols: 4 })
    // 手动分割线在水合时直接生效，内部无 selectedPreset watcher 可覆写它
    expect(settings.slicePlan.value.horizontalLines).toEqual([0.5])
    expect(settings.slicePlan.value.verticalLines).toEqual([0.25, 0.5, 0.75])
    expect(settings.slicePlan.value.padding).toBe(3)
  })

  /**
   * Given：载荷被外部改写为含多种非法字段（行列 0、分割线越界/非数、padding 负数、unit 未知值、includeOuter 非布尔）
   * When：新建组合函数水合
   * Then：非法字段逐个回退默认，同一载荷中的合法字段（水平线 0.3、enabled true）仍正常恢复
   * 防回归：单字段损坏不得整体丢弃载荷或抛错中断
   */
  it('非法载荷逐字段回退且合法字段照常恢复', () => {
    const storage = createStorage()
    storage.setItem(GRID_SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      grid: { source: 'custom', cols: 0, rows: 2 },
      customRows: 'x',
      customCols: 5,
      horizontalLines: [0.3, 2, -1, Number.NaN, 'bad'],
      verticalLines: 'not-an-array',
      edgeErase: { enabled: true, padding: -5, unit: 'em', includeOuter: 'yes' },
    }))
    const settings = createSettings({ storage })
    // 身份：grid.rows 合法但 cols 为 0 → 身份字段损坏，回退 customCols=5 与默认行的兜底链中 rows 无合法值 → 默认 2 x 2
    expect(settings.customRows.value).toBe(2)
    expect(settings.customCols.value).toBe(2)
    // 水平线 0.3 合法保留；越界/非数条目被逐条丢弃
    expect(settings.slicePlan.value.horizontalLines).toEqual([0.3])
    // 垂直线整字段非法 → 回退等分线
    expect(settings.slicePlan.value.verticalLines).toEqual([0.5])
    // 边线擦除逐字段：enabled 合法保留，其余回退默认
    expect(settings.edgeEraseEnabled.value).toBe(true)
    expect(settings.edgeErasePadding.value).toBe(1)
    expect(settings.slicePlan.value.paddingUnit).toBe('percent')
    expect(settings.slicePlan.value.trimOuterEdges).toBe(false)
  })

  /**
   * Given：localStorage 读取抛异常（隐私模式等存储不可用场景）
   * When：创建组合函数并触发一次持久化
   * Then：以默认配置继续运行，写入返回 false 但不抛错
   * 防回归：存储异常绝不能打断上传/生成/导出主流程
   */
  it('存储读取抛异常时以默认配置运行且写入静默降级', () => {
    const storage = createStorage()
    storage.getItem = vi.fn(() => { throw new Error('blocked') })
    storage.setItem = vi.fn(() => { throw new Error('blocked') })
    const settings = createSettings({ storage })
    expect(settings.selectedPreset.value).toMatchObject({ rows: 2, cols: 2 })
    expect(settings.slicePlan.value.horizontalLines).toEqual([0.5])
    expect(() => settings.setHorizontalLines([0.4])).not.toThrow()
    expect(settings.persistGridSettings()).toBe(false)
    // 状态本身仍更新成功（内存态继续可用）
    expect(settings.slicePlan.value.horizontalLines).toEqual([0.4])
  })

  /**
   * Given：载荷 JSON 非法或版本号不匹配
   * When：新建组合函数水合
   * Then：整体按默认处理，后续写入以新载荷覆盖旧内容
   * 防回归：旧版本残留载荷不得让新版本崩溃或半水合
   */
  it('JSON 非法与版本不符整体回退默认', () => {
    const storage = createStorage()
    storage.setItem(GRID_SETTINGS_STORAGE_KEY, '{broken json')
    const broken = createSettings({ storage })
    expect(broken.selectedPreset.value).toMatchObject({ rows: 2, cols: 2 })

    storage.setItem(GRID_SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 99,
      grid: { source: 'custom', cols: 7, rows: 9 },
      horizontalLines: [0.5],
      verticalLines: [0.5],
      edgeErase: { enabled: true, padding: 5, unit: 'percent', includeOuter: true },
    }))
    const stale = createSettings({ storage })
    expect(stale.selectedPreset.value).toMatchObject({ rows: 2, cols: 2 })
    expect(stale.slicePlan.value.horizontalLines).toEqual([0.5])
    expect(stale.slicePlan.value.padding).toBe(0)
  })

  /**
   * Given：用户在水合出的非等分分割线状态下点击另一预设卡片
   * When：调用 selectPreset（显式用户动作）
   * Then：等分线被有意重建、自定义输入同步为预设行列，且立即持久化
   * 防回归：等分线重建只允许发生在显式选择，禁止由 watcher 隐式触发抹掉手动线
   */
  it('显式选择预设重建等分线并同步持久化', async () => {
    const storage = createStorage()
    const settings = createSettings({ storage })
    settings.setHorizontalLines([0.33, 0.66])
    settings.selectPreset({ cols: 3, rows: 3, label: '3 x 3' })
    expect(settings.isCustomGrid.value).toBe(false)
    expect(settings.slicePlan.value.horizontalLines).toEqual([1 / 3, 2 / 3])
    expect(settings.slicePlan.value.verticalLines).toEqual([1 / 3, 2 / 3])
    expect(settings.customRows.value).toBe(3)
    expect(settings.customCols.value).toBe(3)

    // 持久化即时反映新选择（无图片也写入）
    const payload = JSON.parse(storage.getItem(GRID_SETTINGS_STORAGE_KEY)!)
    expect(payload.grid).toEqual({ source: 'preset', cols: 3, rows: 3 })
    // 非 3 整除的等分线原样持久化（稳定值，不做二次取整）
    expect(payload.horizontalLines).toEqual([1 / 3, 2 / 3])
    await Promise.resolve()
  })

  /**
   * Given：用户在输入框修改自定义行列后 await nextTick（自定义输入 watch 持久化）
   * When：未点击应用按钮（未调用 applyCustomGrid）
   * Then：输入值已写入载荷的 customRows/customCols，但网格身份与 slicePlan 保持不变
   * 防回归：输入中间态（非整数/非法值）不得污染载荷，也不得提前切换网格身份
   */
  it('自定义输入变化经 watch 持久化但不切换身份', async () => {
    const { nextTick } = await import('vue')
    const storage = createStorage()
    const settings = createSettings({ storage })
    settings.customRows.value = 6
    settings.customCols.value = 8
    await nextTick()
    const payload = JSON.parse(storage.getItem(GRID_SETTINGS_STORAGE_KEY)!)
    expect(payload.customRows).toBe(6)
    expect(payload.customCols).toBe(8)
    // 身份与生效 plan 未变：仍是初始 2 x 2 等分
    expect(settings.isCustomGrid.value).toBe(false)
    expect(settings.selectedPreset.value).toMatchObject({ rows: 2, cols: 2 })
    expect(settings.slicePlan.value.horizontalLines).toEqual([0.5])

    // 输入非法中间态（清空为 NaN）不得写入
    settings.customRows.value = Number.NaN
    await nextTick()
    expect(JSON.parse(storage.getItem(GRID_SETTINGS_STORAGE_KEY)!).customRows).toBe(6)
  })

  /**
   * Given：一轮会话内多次修改配置（改线 → 改边线擦除 → 再改线）
   * When：每次显式动作后检查存储载荷
   * Then：载荷始终反映最新稳定值；重置工作区不触碰本组合函数的任何状态
   * 防回归：持久化必须与 reset 解耦——resetApp 只清图片与缓存，配置保留到下次刷新
   */
  it('持久化契约独立于重置：稳定值即时覆盖写入', () => {
    const storage = createStorage()
    const settings = createSettings({ storage })
    settings.setHorizontalLines([0.2])
    expect(JSON.parse(storage.getItem(GRID_SETTINGS_STORAGE_KEY)!).horizontalLines).toEqual([0.2])
    settings.setEdgeEraseEnabled(true)
    settings.setEdgeErasePadding(4)
    let payload = JSON.parse(storage.getItem(GRID_SETTINGS_STORAGE_KEY)!)
    expect(payload.edgeErase).toMatchObject({ enabled: true, padding: 4 })
    expect(payload.horizontalLines).toEqual([0.2])
    settings.setHorizontalLines([0.8])
    payload = JSON.parse(storage.getItem(GRID_SETTINGS_STORAGE_KEY)!)
    expect(payload.horizontalLines).toEqual([0.8])
    // 组合函数不提供任何配置重置入口：与 App.resetAll 的"仅清空工作区"语义解耦
    expect(Object.keys(settings)).not.toContain('reset')
  })

  /**
   * Given：水合出的载荷包含非等分分割线与 3 x 5 自定义网格
   * When：调用方在水合之后才注册 selectedPreset/slicePlan 生成 watcher（真实 App 时序）
   * Then：水合阶段不触发任何 watcher，非等分线原样保留
   * 防回归：水合必须同步完成于工厂函数内，晚注册的 watcher 不产生覆写或多余生成
   */
  it('同步水合先于调用方 watcher：非等分线不被覆写', () => {
    const storage = createStorage()
    storage.setItem(GRID_SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      grid: { source: 'custom', cols: 3, rows: 5 },
      customRows: 3,
      customCols: 5,
      horizontalLines: [0.15, 0.5, 0.85, 0.95],
      verticalLines: [0.4],
      edgeErase: { enabled: false, padding: 1, unit: 'percent', includeOuter: false },
    }))
    const settings = createSettings({ storage })
    // 调用方在此之后才注册 watcher（与 App.vue watch(selectedPreset) 的真实顺序一致）
    const watched: unknown[] = []
    watch(() => settings.selectedPreset.value, () => watched.push('preset'))
    void nextTick()
    expect(watched).toEqual([])
    expect(settings.slicePlan.value.horizontalLines).toEqual([0.15, 0.5, 0.85, 0.95])
    expect(settings.slicePlan.value.verticalLines).toEqual([0.4])
  })
})
