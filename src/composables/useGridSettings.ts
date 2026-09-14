import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { GridPreset, SlicePlan } from '../utils/grid'
import { createEvenDividerLines, gridPresets, normalizeDividerLines } from '../utils/grid'
import type { LocaleMessages } from './useLocale'

/**
 * 网格配置深模块（见 openspec/changes/cache-slice-results-and-persist-settings Decision 7）。
 *
 * 职责边界：
 * - 拥有网格身份（预设/自定义）、自定义输入行列、手动水平/垂直分割线、边线擦除四项
 *   （enabled/padding/unit/includeOuter）与生效 SlicePlan 的全部状态；
 * - 版本化 localStorage 载荷（键 `igs:grid-settings`）的读写与逐字段校验；
 * - 在工厂函数内同步水合，先于调用方注册任何生成 watcher，因此恢复的非等分割线
 *   不会被 selectedPreset 的等分线覆写（内部不存在该 watcher，重建等分线只发生在
 *   selectPreset / applyCustomGrid 两个显式用户动作中）。
 */

export const GRID_SETTINGS_STORAGE_KEY = 'igs:grid-settings'

/** 载荷版本：结构变化时递增；版本不匹配的旧载荷整体按默认处理。 */
const GRID_SETTINGS_VERSION = 1

export type PaddingUnit = 'percent' | 'px'

/** 网格身份：preset = 内置预设卡片；custom = 用户自定义行列。 */
export interface GridIdentity {
  source: 'preset' | 'custom'
  cols: number
  rows: number
}

/** 边线擦除子载荷：enabled/value/unit/includeOuter 四项独立校验。 */
export interface StoredEdgeErase {
  enabled: boolean
  padding: number
  unit: PaddingUnit
  includeOuter: boolean
}

/** localStorage 载荷结构：所有字段都可能缺失或非法，恢复时逐字段回退默认。 */
export interface StoredGridSettings {
  version: number
  grid: GridIdentity | null
  customRows: number
  customCols: number
  horizontalLines: number[]
  verticalLines: number[]
  edgeErase: StoredEdgeErase
}

export interface GridSettingsOptions {
  isMobile: Ref<boolean>
  messages: ComputedRef<LocaleMessages>
  /** 注入存储（测试可传内存实现）；传 null 禁用持久化；缺省回退 window.localStorage。 */
  storage?: Storage | null
  storageKey?: string
  /** 创建时同步水合一次（默认 true），保证调用方随后注册的 watcher 看到的已是恢复值。 */
  autoRestore?: boolean
}

/** 解析注入存储：显式传入优先；缺省时安全读取 window.localStorage（隐私模式可能抛异常）。 */
const resolveStorage = (storage?: Storage | null): Storage | null => {
  if (storage !== undefined) return storage
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

/**
 * 分割线字段清洗：非数组或清洗后为空 → null（整字段回退等分线，覆盖设计中的"空"回退；
 * 合法的 1 行/1 列网格等分线本身即为空数组，回退结果与之相同，无行为分叉）；
 * 数组则逐条丢弃非有限数与不在 (0,1) 开区间的条目，剩余去重排序（复用 grid 模块规则）。
 */
const sanitizeLines = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null
  const lines = normalizeDividerLines(value.filter((line): line is number => typeof line === 'number'))
  return lines.length > 0 ? lines : null
}

/** 边线擦除子载荷解析：每个字段独立校验，非法即回退该字段默认值。 */
const parseEdgeErase = (value: unknown): StoredEdgeErase => {
  const source = (value && typeof value === 'object' ? value : {}) as Partial<StoredEdgeErase>
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : false,
    padding: typeof source.padding === 'number' && Number.isFinite(source.padding) && source.padding >= 0
      ? source.padding
      : 1,
    unit: source.unit === 'px' ? 'px' : 'percent',
    includeOuter: typeof source.includeOuter === 'boolean' ? source.includeOuter : false,
  }
}

export function useGridSettings({
  isMobile,
  messages,
  storage: injectedStorage,
  storageKey = GRID_SETTINGS_STORAGE_KEY,
  autoRestore = true,
}: GridSettingsOptions) {
  const storage = resolveStorage(injectedStorage)

  const defaultPreset =
    gridPresets.find((preset) => preset.cols === 2 && preset.rows === 2) ??
    gridPresets[0] ??
    ({ cols: 2, rows: 2, label: '2 x 2' } as GridPreset)

  const selectedPreset = ref<GridPreset>(defaultPreset)
  const customRows = ref(defaultPreset.rows)
  const customCols = ref(defaultPreset.cols)
  const presetExpanded = ref(false)
  /** 网格身份来源：applyCustomGrid 置 custom，selectPreset 置 preset；持久化时写入载荷。 */
  const isCustomGrid = ref(false)
  const edgeEraseEnabled = ref(false)
  const edgeErasePadding = ref(1)

  /** 有效擦除 padding：与 App 既有语义一致，关闭擦除时 plan 内 padding 归零。 */
  const effectivePadding = () => (edgeEraseEnabled.value ? edgeErasePadding.value : 0)

  /** 以等分线为初始分割线构造 plan（仅用于默认状态；恢复/显式选择后会被覆写）。 */
  const buildEvenPlan = (rows: number, cols: number): SlicePlan => ({
    horizontalLines: createEvenDividerLines(rows),
    verticalLines: createEvenDividerLines(cols),
    padding: effectivePadding(),
    paddingUnit: 'percent',
    trimOuterEdges: false,
  })

  const slicePlan = ref<SlicePlan>(buildEvenPlan(defaultPreset.rows, defaultPreset.cols))

  const gridDescription = computed(() =>
    messages.value.format.gridDescription(selectedPreset.value.cols, selectedPreset.value.rows),
  )
  const tileCount = computed(() => selectedPreset.value.cols * selectedPreset.value.rows)
  const presetSubtitle = (cols: number, rows: number) => messages.value.format.presetSub(cols, rows)

  const visiblePresets = computed(() =>
    isMobile.value && !presetExpanded.value ? gridPresets.slice(0, 4) : gridPresets,
  )
  const showPresetToggle = computed(() => isMobile.value && gridPresets.length > 4)

  /**
   * 将持久化载荷同步水合进状态（无存储/解析失败/版本不符时保持默认，返回 false）。
   * 顺序固定：先恢复网格身份与行列（等价一次显式选择），再用手动分割线与边线擦除
   * 四项整体覆写 slicePlan。本函数在工厂内、任何 watcher 注册之前执行，且组合函数
   * 内部不存在 selectedPreset watcher，恢复的非等分线不会被等分线抹掉。
   */
  const restoreGridSettings = (): boolean => {
    let raw: string | null = null
    try {
      raw = storage ? storage.getItem(storageKey) : null
    } catch {
      return false // 存储不可用（隐私模式等）：按默认配置继续
    }
    if (!raw) return false

    let payload: Partial<StoredGridSettings> | null = null
    try {
      payload = JSON.parse(raw) as Partial<StoredGridSettings>
    } catch {
      return false // JSON 非法：整体回退默认
    }
    if (!payload || typeof payload !== 'object' || payload.version !== GRID_SETTINGS_VERSION) {
      return false
    }

    // 1) 网格身份：grid.{source,cols,rows} 是唯一事实来源；预设身份优先匹配内置卡片，
    //    匹配不到（如版本间预设列表变化）或本就是自定义身份时，按自定义网格恢复（applyCustomGrid 等价路径）。
    //    身份字段整体损坏时才以 customRows/customCols 兜底——单字段损坏不降级整个网格。
    const grid = (payload.grid && typeof payload.grid === 'object' ? payload.grid : null) as Partial<GridIdentity> | null
    const identityCols = isPositiveInt(grid?.cols) ? grid!.cols : null
    const identityRows = isPositiveInt(grid?.rows) ? grid!.rows : null
    const fallbackRows = isPositiveInt(payload.customRows) ? payload.customRows : null
    const fallbackCols = isPositiveInt(payload.customCols) ? payload.customCols : null

    const builtin = grid?.source === 'preset' && identityCols !== null && identityRows !== null
      ? (gridPresets.find((preset) => preset.cols === identityCols && preset.rows === identityRows) ?? null)
      : null

    let rows = defaultPreset.rows
    let cols = defaultPreset.cols
    const restoreAsCustom = (customRowsValue: number, customColsValue: number) => {
      isCustomGrid.value = true
      selectedPreset.value = { rows: customRowsValue, cols: customColsValue, label: `${customColsValue} x ${customRowsValue} (custom)` }
      customRows.value = customRowsValue
      customCols.value = customColsValue
      rows = customRowsValue
      cols = customColsValue
    }

    if (builtin) {
      isCustomGrid.value = false
      selectedPreset.value = builtin
      customRows.value = builtin.rows
      customCols.value = builtin.cols
      rows = builtin.rows
      cols = builtin.cols
    } else if (identityRows !== null && identityCols !== null) {
      restoreAsCustom(identityRows, identityCols)
    } else if (fallbackRows !== null && fallbackCols !== null) {
      restoreAsCustom(fallbackRows, fallbackCols)
    }

    // 2) 手动分割线：整字段非法回退该网格的等分线；合法字段逐条清洗后照常恢复。
    const horizontal = sanitizeLines(payload.horizontalLines) ?? createEvenDividerLines(rows)
    const vertical = sanitizeLines(payload.verticalLines) ?? createEvenDividerLines(cols)

    // 3) 边线擦除四项与分割线一起整体写入 slicePlan（禁止经由会硬编码 unit/includeOuter 的构造器）。
    const edge = parseEdgeErase(payload.edgeErase)
    edgeEraseEnabled.value = edge.enabled
    edgeErasePadding.value = edge.padding
    slicePlan.value = {
      horizontalLines: horizontal,
      verticalLines: vertical,
      padding: edge.enabled ? edge.padding : 0,
      paddingUnit: edge.unit,
      trimOuterEdges: edge.includeOuter,
    }
    return true
  }

  /** 将当前稳定值写入版本化载荷；存储缺失或写入抛错时降级为内存态（返回 false）。 */
  const persistGridSettings = (): boolean => {
    if (!storage) return false
    const payload: StoredGridSettings = {
      version: GRID_SETTINGS_VERSION,
      grid: {
        source: isCustomGrid.value ? 'custom' : 'preset',
        cols: selectedPreset.value.cols,
        rows: selectedPreset.value.rows,
      },
      customRows: customRows.value,
      customCols: customCols.value,
      horizontalLines: [...slicePlan.value.horizontalLines],
      verticalLines: [...slicePlan.value.verticalLines],
      edgeErase: {
        enabled: edgeEraseEnabled.value,
        padding: edgeErasePadding.value,
        unit: slicePlan.value.paddingUnit,
        includeOuter: slicePlan.value.trimOuterEdges,
      },
    }
    try {
      storage.setItem(storageKey, JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }

  /**
   * 用户显式选择预设卡片：重建等分线并同步自定义输入，随后立即持久化。
   * 这是水合之外唯一会重建等分线的入口，保证"选预设 = 重新等分"的直觉语义。
   */
  const selectPreset = (preset: GridPreset): { ok: boolean } => {
    if (!isPositiveInt(preset.rows) || !isPositiveInt(preset.cols)) return { ok: false }
    isCustomGrid.value = false
    selectedPreset.value = preset
    customRows.value = preset.rows
    customCols.value = preset.cols
    slicePlan.value = {
      ...slicePlan.value,
      horizontalLines: createEvenDividerLines(preset.rows),
      verticalLines: createEvenDividerLines(preset.cols),
    }
    persistGridSettings()
    return { ok: true }
  }

  /** 应用自定义行列：合法时切换自定义身份并重建等分线；非法输入不改动任何状态。 */
  const applyCustomGrid = (): { ok: boolean } => {
    const rows = Number(customRows.value)
    const cols = Number(customCols.value)
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
      return { ok: false }
    }
    isCustomGrid.value = true
    selectedPreset.value = { rows, cols, label: `${cols} x ${rows} (custom)` }
    customRows.value = rows
    customCols.value = cols
    slicePlan.value = {
      ...slicePlan.value,
      horizontalLines: createEvenDividerLines(rows),
      verticalLines: createEvenDividerLines(cols),
    }
    persistGridSettings()
    return { ok: true }
  }

  /** 手动水平分割线：归一化（有限数、0-1 开区间、去重升序）后写入并持久化稳定值。 */
  const setHorizontalLines = (lines: number[]) => {
    slicePlan.value = { ...slicePlan.value, horizontalLines: normalizeDividerLines(lines) }
    persistGridSettings()
  }

  const setVerticalLines = (lines: number[]) => {
    slicePlan.value = { ...slicePlan.value, verticalLines: normalizeDividerLines(lines) }
    persistGridSettings()
  }

  const setEdgeEraseEnabled = (value: boolean) => {
    edgeEraseEnabled.value = value
    slicePlan.value = { ...slicePlan.value, padding: effectivePadding() }
    persistGridSettings()
  }

  const setEdgeErasePadding = (value: number) => {
    edgeErasePadding.value = Number.isFinite(value) ? Math.max(0, value) : 0
    slicePlan.value = { ...slicePlan.value, padding: effectivePadding() }
    persistGridSettings()
  }

  const setEdgeEraseUnit = (unit: PaddingUnit) => {
    slicePlan.value = { ...slicePlan.value, paddingUnit: unit === 'px' ? 'px' : 'percent' }
    persistGridSettings()
  }

  const setEdgeEraseIncludeOuter = (value: boolean) => {
    slicePlan.value = { ...slicePlan.value, trimOuterEdges: value }
    persistGridSettings()
  }

  const togglePresetExpanded = () => {
    presetExpanded.value = !presetExpanded.value
  }

  // 同步水合先于 watcher 注册：恢复值不会触发下面的持久化 watcher，也不会触发调用方的生成 watcher。
  if (autoRestore) restoreGridSettings()

  // 自定义输入值单独持久化：仅两侧均为合法正整数时写入，避免输入中间态（空/负数）污染载荷。
  watch([customRows, customCols], ([rows, cols]) => {
    if (isPositiveInt(rows) && isPositiveInt(cols)) persistGridSettings()
  })

  return {
    defaultPreset,
    selectedPreset,
    customRows,
    customCols,
    gridDescription,
    tileCount,
    visiblePresets,
    showPresetToggle,
    presetExpanded,
    presetSubtitle,
    // 新增：状态所有权
    slicePlan,
    isCustomGrid,
    edgeEraseEnabled,
    edgeErasePadding,
    // 新增：显式用户动作
    selectPreset,
    setHorizontalLines,
    setVerticalLines,
    setEdgeEraseEnabled,
    setEdgeErasePadding,
    setEdgeEraseUnit,
    setEdgeEraseIncludeOuter,
    // 新增：持久化入口
    persistGridSettings,
    restoreGridSettings,
    // 既有动作（行为增强：成功时重建等分线并持久化）
    applyCustomGrid,
    togglePresetExpanded,
  }
}
