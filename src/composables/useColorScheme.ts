import { ref, watch } from 'vue'

/**
 * 二元外观（亮/暗）深模块：
 * - localStorage 键 `igs:color-scheme` 只持久化用户显式选择的 'light' | 'dark'；
 *   首次访问不写入任何值，跟随系统外观（matchMedia）；
 * - 工厂函数内同步水合一次，先于任何 watcher 注册，恢复值不会触发持久化 watcher；
 * - 未做显式选择时监听系统外观变化并跟随；一旦显式选择（setColorScheme/toggle）即固化，
 *   不再跟随系统；
 * - 每次外观变化同步应用到根元素：data-color-scheme 属性 + style.colorScheme 内联样式，
 *   并更新 meta[name=theme-color]（移动端浏览器地址栏 / PWA 标题栏用色）；
 * - 存储与 DOM 全程 try/catch：隐私模式、禁用存储、SSR/jsdom 缺失环境均静默降级为纯状态；
 * - dispose() 移除系统外观监听，供组件卸载与测试清理。
 *
 * ⚠ 兼容红线：index.html 的预启动引导脚本必须与本模块使用完全相同的键名、取值、
 * 解析规则与 theme-color 色值，否则会出现相反主题的首帧闪烁（FOUC）。
 */

export type ColorScheme = 'light' | 'dark'

export const COLOR_SCHEME_STORAGE_KEY = 'igs:color-scheme'

/** 系统外观探测查询；与 index.html 预启动脚本一致（matches = 系统深色）。 */
export const COLOR_SCHEME_MEDIA_QUERY = '(prefers-color-scheme: dark)'

/** 无法探测系统外观（无 matchMedia / 探测抛错）时的回退值：沿用应用既有深色默认。 */
export const DEFAULT_COLOR_SCHEME: ColorScheme = 'dark'

/** 各外观对应的 meta[name=theme-color] 色值；与 index.html 预启动脚本一致。 */
export const THEME_COLOR_BY_SCHEME = {
  light: '#f3f7f6',
  dark: '#0f1a20',
} as const

export interface ColorSchemeOptions {
  /** 注入存储（测试可传内存实现）；传 null 禁用持久化；缺省回退 window.localStorage。 */
  storage?: Storage | null
  /** 注入 matchMedia 结果（jsdom/旧环境可能缺失）；缺省时安全调用 window.matchMedia。 */
  mediaQuery?: MediaQueryList | null
  /** 创建时同步水合一次（默认 true），保证调用方随后注册的 watcher 看到的已是恢复值。 */
  autoRestore?: boolean
  /** 是否注册系统外观变化监听（默认 true）。 */
  followSystem?: boolean
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

/** 解析系统外观查询对象：显式传入优先；缺省时安全调用 window.matchMedia，缺失/抛错返回 null。 */
const resolveMediaQuery = (mediaQuery?: MediaQueryList | null): MediaQueryList | null => {
  if (mediaQuery !== undefined) return mediaQuery
  try {
    return typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? null
      : window.matchMedia(COLOR_SCHEME_MEDIA_QUERY)
  } catch {
    return null
  }
}

/** 收敛任意输入为合法外观取值；'light' | 'dark' 之外一律拒绝。 */
const isColorScheme = (value: unknown): value is ColorScheme => value === 'light' || value === 'dark'

/** 旧版 Safari 的 MediaQueryList 事件 API（addListener/removeListener）兜底。 */
type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void
}

export function useColorScheme({
  storage: injectedStorage,
  mediaQuery: injectedMediaQuery,
  autoRestore = true,
  followSystem = true,
}: ColorSchemeOptions = {}) {
  const storage = resolveStorage(injectedStorage)
  const mediaQuery = resolveMediaQuery(injectedMediaQuery)

  /** 解析后的当前外观（响应式）：显式选择或系统外观的最终结果。 */
  const colorScheme = ref<ColorScheme>(DEFAULT_COLOR_SCHEME)
  /** 用户显式选择：null = 尚未选择（跟随系统且不落盘）；'light'/'dark' = 已选择并持久化。 */
  const userPreference = ref<ColorScheme | null>(null)

  /** 无法探测系统外观（无 matchMedia / 探测抛错）时回退深色默认；与 index.html 预启动脚本保持一致。 */
  const resolveSystemScheme = (): ColorScheme => {
    if (!mediaQuery) return DEFAULT_COLOR_SCHEME
    try {
      return mediaQuery.matches ? 'dark' : 'light'
    } catch {
      return DEFAULT_COLOR_SCHEME
    }
  }

  /** 将外观同步到 DOM：根元素 data-color-scheme 属性 + style.colorScheme + theme-color；任何异常静默跳过。 */
  const applyToDocument = (scheme: ColorScheme): void => {
    try {
      if (typeof document === 'undefined') return
      const root = document.documentElement
      root.dataset.colorScheme = scheme
      root.style.colorScheme = scheme
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', THEME_COLOR_BY_SCHEME[scheme])
    } catch {
      // DOM 不可用（SSR / 环境差异）：仅维护响应式状态
    }
  }

  /** 持久化用户显式选择；未选择 / 无存储 / 写入抛错时降级为内存态（返回 false）。 */
  const persistColorScheme = (): boolean => {
    if (!storage || userPreference.value === null) return false
    try {
      storage.setItem(COLOR_SCHEME_STORAGE_KEY, userPreference.value)
      return true
    } catch {
      return false
    }
  }

  /**
   * 同步水合：存储中的有效值优先（视为用户显式选择），否则解析系统外观。
   * 无论来源如何都会应用一次 DOM；仅当确有存储值时返回 true。
   */
  const restoreColorScheme = (): boolean => {
    let saved: string | null = null
    try {
      saved = storage ? storage.getItem(COLOR_SCHEME_STORAGE_KEY) : null
    } catch {
      saved = null // 存储不可用：按首次访问处理
    }
    if (isColorScheme(saved)) {
      userPreference.value = saved
      colorScheme.value = saved
    } else {
      userPreference.value = null
      colorScheme.value = resolveSystemScheme()
    }
    applyToDocument(colorScheme.value)
    return isColorScheme(saved)
  }

  /** 系统外观变化：仅在用户未显式选择时跟随，且绝不写入存储。 */
  const handleSystemChange = (event: MediaQueryListEvent): void => {
    if (userPreference.value !== null) return
    const next: ColorScheme = event.matches ? 'dark' : 'light'
    colorScheme.value = next
    applyToDocument(next)
  }

  /** 监听挂载方式标记：null = 未挂载；dispose 依此对称移除。 */
  let listenerAttached: 'modern' | 'legacy' | null = null

  const attachSystemListener = (): void => {
    if (!followSystem || !mediaQuery || listenerAttached) return
    const legacy = mediaQuery as LegacyMediaQueryList
    try {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleSystemChange)
        listenerAttached = 'modern'
      } else if (typeof legacy.addListener === 'function') {
        legacy.addListener(handleSystemChange)
        listenerAttached = 'legacy'
      }
    } catch {
      listenerAttached = null // 监听不可用：保留首屏解析结果，不再跟随变化
    }
  }

  /** 移除系统外观监听（组件卸载 / 测试清理）；重复调用安全。 */
  const dispose = (): void => {
    if (!mediaQuery || !listenerAttached) return
    const legacy = mediaQuery as LegacyMediaQueryList
    try {
      if (listenerAttached === 'modern') mediaQuery.removeEventListener('change', handleSystemChange)
      else legacy.removeListener?.(handleSystemChange)
    } catch {
      // 移除失败也视为已清理，避免重复移除抛错
    }
    listenerAttached = null
  }

  // 同步水合先于 watcher 注册：恢复值 / 首访的系统解析值都不会触发持久化 watcher。
  if (autoRestore) restoreColorScheme()

  attachSystemListener()

  // 安全网：任何来源的外观变化都同步 DOM；只有用户显式选择过的值才落盘（未选择时 persist 内部拒绝）。
  watch(colorScheme, (scheme) => {
    applyToDocument(scheme)
    persistColorScheme()
  })

  /** 显式设置外观：非法值不改动状态；合法值同步 DOM 并立即持久化（不依赖 watcher 异步 flush）。 */
  const setColorScheme = (scheme: ColorScheme): boolean => {
    if (!isColorScheme(scheme)) return false
    userPreference.value = scheme
    colorScheme.value = scheme
    applyToDocument(scheme)
    persistColorScheme()
    return true
  }

  /** 用户切换动作：在当前外观上取反，等价一次显式选择（持久化）。 */
  const toggleColorScheme = (): ColorScheme => {
    const next: ColorScheme = colorScheme.value === 'dark' ? 'light' : 'dark'
    setColorScheme(next)
    return next
  }

  return {
    colorScheme,
    userPreference,
    setColorScheme,
    toggleColorScheme,
    persistColorScheme,
    restoreColorScheme,
    dispose,
  }
}
