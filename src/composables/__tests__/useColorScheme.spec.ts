/// <reference types="vitest/globals" />
import { useColorScheme, COLOR_SCHEME_STORAGE_KEY, THEME_COLOR_BY_SCHEME } from '../useColorScheme'

/** 构造内存 Storage（与既有 spec 的实现一致，便于逐调用断言）。 */
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

/** 构造可编程的 matchMedia 替身：可控制初始匹配值并手动派发 change 事件。 */
function createMediaQuery(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQuery = {
    get matches() { return matches },
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener)
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: () => true,
    /** 测试辅助：以给定匹配值派发一次系统外观变化。 */
    emit(nextMatches: boolean) {
      listeners.forEach((listener) => listener({ matches: nextMatches } as MediaQueryListEvent))
    },
  } as unknown as MediaQueryList & { emit: (nextMatches: boolean) => void }
  return mediaQuery
}

describe('useColorScheme', () => {
  beforeEach(() => {
    // 每个用例重置 jsdom 根元素，避免 DOM 断言被上一用例污染
    document.documentElement.removeAttribute('data-color-scheme')
    document.documentElement.style.colorScheme = ''
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove())
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('content', '#0f1a20')
    document.head.appendChild(meta)
  })

  /**
   * Given：存储为空（首次访问）且系统外观为深色
   * When：创建 useColorScheme 组合函数
   * Then：外观解析为 dark、userPreference 为 null（未选择）、存储中不写入任何键
   * 防回归：首访若写盘会永久固化首次系统外观，系统后续换季（白天/夜间切换）不再生效
   */
  it('首次访问跟随系统深色且不落盘', () => {
    const storage = createStorage()
    const mediaQuery = createMediaQuery(true)
    const scheme = useColorScheme({ storage, mediaQuery })
    expect(scheme.colorScheme.value).toBe('dark')
    expect(scheme.userPreference.value).toBeNull()
    expect(storage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBeNull()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  /**
   * Given：存储为空且系统外观为浅色
   * When：创建组合函数并检查 DOM
   * Then：外观解析为 light，根元素携带 data-color-scheme="light" 与 style.colorScheme="light"
   * 防回归：DOM 应用缺失会让首访浅色用户看到深色闪烁
   */
  it('首次访问跟随系统浅色并应用到根元素', () => {
    const mediaQuery = createMediaQuery(false)
    const scheme = useColorScheme({ storage: createStorage(), mediaQuery })
    expect(scheme.colorScheme.value).toBe('light')
    expect(document.documentElement.dataset.colorScheme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  /**
   * Given：环境中无 matchMedia（探测缺失）
   * When：创建组合函数
   * Then：回退到深色默认值且不抛错
   * 防回归：jsdom / 旧浏览器无 matchMedia 时组合函数曾可能直接崩溃
   */
  it('无 matchMedia 时回退深色默认', () => {
    const scheme = useColorScheme({ storage: createStorage(), mediaQuery: null })
    expect(scheme.colorScheme.value).toBe('dark')
  })

  /**
   * Given：存储中已有用户显式选择 'light'，而系统外观为深色
   * When：创建组合函数同步水合
   * Then：恢复 light 而非跟随系统，userPreference 记为已选择，且水合不触发再次写盘
   * 防回归：显式选择被系统外观覆盖会让用户刷新后主题漂移
   */
  it('已持久化的用户选择优先于系统外观', () => {
    const storage = createStorage()
    storage.setItem(COLOR_SCHEME_STORAGE_KEY, 'light')
    vi.mocked(storage.setItem).mockClear() // 清除种子写入的调用记录，只观察组合函数自身行为
    const mediaQuery = createMediaQuery(true)
    const scheme = useColorScheme({ storage, mediaQuery })
    expect(scheme.colorScheme.value).toBe('light')
    expect(scheme.userPreference.value).toBe('light')
    expect(mediaQuery.addEventListener).toHaveBeenCalled() // 已选择也挂监听，但内部短路不再跟随
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  /**
   * Given：存储中的值被外部改写为非法值（'blue'）
   * When：创建组合函数水合
   * Then：非法值被丢弃，回退解析系统外观，userPreference 保持 null
   * 防回归：未来若扩展三态外观，旧脏值不得被当作合法选择恢复
   */
  it('存储非法值丢弃并回退系统外观', () => {
    const storage = createStorage()
    storage.setItem(COLOR_SCHEME_STORAGE_KEY, 'blue')
    const mediaQuery = createMediaQuery(false)
    const scheme = useColorScheme({ storage, mediaQuery })
    expect(scheme.colorScheme.value).toBe('light')
    expect(scheme.userPreference.value).toBeNull()
  })

  /**
   * Given：用户尚未显式选择（首访，跟随系统）
   * When：系统外观由深变浅派发 change 事件
   * Then：外观跟随变为 light，且不写入存储
   * 防回归：跟随模式下落盘会破坏"未选择 = 始终跟随系统"的语义
   */
  it('未选择时跟随系统外观变化且不落盘', () => {
    const storage = createStorage()
    const mediaQuery = createMediaQuery(true)
    const scheme = useColorScheme({ storage, mediaQuery })
    expect(scheme.colorScheme.value).toBe('dark')
    mediaQuery.emit(false)
    expect(scheme.colorScheme.value).toBe('light')
    expect(storage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBeNull()
  })

  /**
   * Given：用户已显式选择 'light'
   * When：系统外观变化事件再次派发
   * Then：外观保持 light 不被系统覆盖
   * 防回归：显式选择后被系统事件翻转会直接违背用户意图
   */
  it('已选择后不再跟随系统变化', () => {
    const storage = createStorage()
    const mediaQuery = createMediaQuery(true)
    const scheme = useColorScheme({ storage, mediaQuery })
    scheme.setColorScheme('light')
    mediaQuery.emit(false)
    expect(scheme.colorScheme.value).toBe('light')
    expect(storage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('light')
  })

  /**
   * Given：用户切换外观（toggle）
   * When：在深色上调用 toggleColorScheme
   * Then：变为 light、同步写入存储键 igs:color-scheme=light、根元素 DOM 同步更新、theme-color 更新为浅色值
   * 防回归：持久化与 DOM 应用缺一都会分别造成刷新丢失或浏览器边栏颜色错乱
   */
  it('toggle 持久化并同步根元素与 theme-color', () => {
    const storage = createStorage()
    const mediaQuery = createMediaQuery(true)
    const scheme = useColorScheme({ storage, mediaQuery })
    const next = scheme.toggleColorScheme()
    expect(next).toBe('light')
    expect(scheme.colorScheme.value).toBe('light')
    expect(storage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement.dataset.colorScheme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      THEME_COLOR_BY_SCHEME.light,
    )
  })

  /**
   * Given：组合函数正常状态
   * When：setColorScheme 分别传入 'dark' 与非法值
   * Then：合法值生效并持久化；非法值返回 false 且状态、存储均不变
   * 防回归：非法值透传会写入脏键，下次水合行为不可预测
   */
  it('setColorScheme 拒绝非法值', () => {
    const storage = createStorage()
    const scheme = useColorScheme({ storage, mediaQuery: createMediaQuery(true) })
    expect(scheme.setColorScheme('dark')).toBe(true)
    expect(storage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('dark')
    expect(scheme.setColorScheme('blue' as never)).toBe(false)
    expect(scheme.colorScheme.value).toBe('dark')
    expect(storage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('dark')
  })

  /**
   * Given：注入的存储在读取时抛错（隐私模式探测、被禁用存储的常见表现）
   * When：创建组合函数水合
   * Then：按首次访问处理（回退系统外观），不抛错；写入失败同样静默降级为内存态
   * 防回归：存储异常未兜底会让整个应用白屏
   */
  it('存储读/写抛错时静默降级', () => {
    const storage = createStorage()
    storage.getItem = vi.fn(() => { throw new Error('SecurityError') })
    storage.setItem = vi.fn(() => { throw new Error('QuotaExceededError') })
    const scheme = useColorScheme({ storage, mediaQuery: createMediaQuery(true) })
    expect(scheme.colorScheme.value).toBe('dark')
    expect(scheme.toggleColorScheme()).toBe('light')
    expect(scheme.colorScheme.value).toBe('light') // 内存态生效
  })

  /**
   * Given：存储不可用（传 null 禁用持久化）
   * When：用户切换外观
   * Then：响应式状态与 DOM 正常更新，仅不落盘
   * 防回归：无存储环境误判为失败会破坏交互可用性
   */
  it('无存储时仍可切换（仅内存态）', () => {
    const scheme = useColorScheme({ storage: null, mediaQuery: createMediaQuery(true) })
    scheme.toggleColorScheme()
    expect(scheme.colorScheme.value).toBe('light')
    expect(document.documentElement.dataset.colorScheme).toBe('light')
    expect(scheme.persistColorScheme()).toBe(false)
  })

  /**
   * Given：DOM 不可用（document 缺失，如 SSR 环境）
   * When：创建组合函数并切换外观
   * Then：不抛错，仅维护响应式状态
   * 防回归：DOM 应用未兜底会在非浏览器环境炸掉渲染管线
   */
  it('DOM 缺失时静默跳过应用', () => {
    const originalDocument = globalThis.document
    // @ts-expect-error 测试模拟 SSR：临时抹除 document
    delete globalThis.document
    try {
      const scheme = useColorScheme({ storage: createStorage(), mediaQuery: createMediaQuery(false) })
      expect(scheme.setColorScheme('dark')).toBe(true)
      expect(scheme.colorScheme.value).toBe('dark')
    } finally {
      globalThis.document = originalDocument
    }
  })

  /**
   * Given：组合函数已注册系统外观监听
   * When：调用 dispose() 后再派发系统变化事件
   * Then：外观不再变化；重复 dispose 不抛错
   * 防回归：监听未清理会在热重载/多实例场景造成跨实例串扰与内存泄漏
   */
  it('dispose 移除系统外观监听', () => {
    const mediaQuery = createMediaQuery(true)
    const scheme = useColorScheme({ storage: createStorage(), mediaQuery })
    scheme.dispose()
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    mediaQuery.emit(false)
    expect(scheme.colorScheme.value).toBe('dark')
    expect(() => scheme.dispose()).not.toThrow()
  })
})
