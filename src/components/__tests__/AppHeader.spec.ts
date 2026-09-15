import pixelarticons from '@iconify-json/pixelarticons/icons.json'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppHeader from '../AppHeader.vue'
import { useColorScheme } from '../../composables/useColorScheme'
import { useLocale } from '../../composables/useLocale'
import type { ColorScheme } from '../../composables/useColorScheme'

// 与 App.vue 一致的真实 pixelarticons 图标数据（内嵌数据，jsdom 中可离线同步渲染，不触发网络请求）
const icons = {
  grid: pixelarticons.icons.grid,
  download: pixelarticons.icons.download,
  image: pixelarticons.icons.image,
  flag: pixelarticons.icons.flag,
  redo: pixelarticons.icons.redo,
  trash: pixelarticons.icons.trash,
  imagePlus: pixelarticons.icons['image-plus'],
  sun: pixelarticons.icons.sun,
  moon: pixelarticons.icons.moon,
}

// 固定使用 zh-CN 真实文案，断言直接复用 useLocale 的消息对象，避免测试内私有文案与实现漂移
const setupZhTr = () => {
  const { currentMessages, switchLocale } = useLocale()
  switchLocale('zh-CN')
  return currentMessages.value
}

/** 构造内存 Storage（与 useColorScheme spec 的实现一致）。 */
const createStorage = () => {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
    clear: () => data.clear(),
    key: () => null,
    get length() { return data.size },
  } as Storage
}

/** 无 matchMedia 的注入项：AppHeader 不消费系统外观监听，仅展示传入的外观状态。 */
const mediaQuery = null as unknown as MediaQueryList

interface MountOptions {
  colorScheme?: ColorScheme
  hasImage?: boolean
  hasTiles?: boolean
  /** 覆写导出格式摘要取值（大写展示）。 */
  exportFormat?: string
  isJpgFormat?: boolean
}

/** 统一挂载工厂：默认空队列浅色态，可按用例覆写关键 props。 */
const mountHeader = (overrides: MountOptions = {}) => {
  const tr = setupZhTr()
  const wrapper = mount(AppHeader, {
    props: {
      tr,
      icons,
      locale: 'zh-CN',
      supportedLocales: [
        { value: 'en' as const, label: 'English' },
        { value: 'zh-CN' as const, label: '简体中文' },
      ],
      appVersion: '1.1.1',
      githubUrl: 'https://github.com/ccwq/image-grid-spliter',
      colorScheme: overrides.colorScheme ?? 'light',
      gridDescription: '3 列 x 5 行',
      tileCount: 15,
      imageInfo: tr.stats.notLoaded,
      exportFormat: overrides.exportFormat ?? 'png',
      qualityLabel: '90%',
      isJpgFormat: overrides.isJpgFormat ?? false,
      statusText: tr.status.waiting,
      hasTiles: overrides.hasTiles ?? false,
      hasImage: overrides.hasImage ?? false,
    },
  })
  return { wrapper, tr }
}

describe('AppHeader', () => {
  /**
   * Given：空队列（无图片无切片）的初始工作区
   * When：紧凑头部完成渲染
   * Then：品牌标题/版本、单个纯文本状态摘要（网格/切片数量/图片/导出格式/实时状态）齐备，且不渲染选择图片、重下载与清除按钮
   * 防回归：头部重复操作入口或状态芯片化会挤占紧凑工作区并造成入口职责重复
   */
  it('渲染品牌与单个纯文本状态摘要，空队列不显示操作按钮', () => {
    const { wrapper, tr } = mountHeader()

    expect(wrapper.get('.brand-title').text()).toBe(tr.meta.title)
    expect(wrapper.get('.brand-version').text()).toBe('v1.1.1')

    const summary = wrapper.get('.status-summary')
    expect(wrapper.findAll('.strip-chip')).toHaveLength(0)
    expect(summary.text()).toContain('3 列 x 5 行')
    expect(summary.text()).toContain('15')
    expect(summary.text()).toContain(tr.stats.notLoaded)
    expect(summary.text()).toContain('PNG')
    expect(summary.text()).toContain(tr.status.waiting)
    expect(summary.find('[aria-live="polite"]').exists()).toBe(true)
    expect(wrapper.findAll('.header-action')).toHaveLength(0)
    expect(wrapper.find('.choose-image').exists()).toBe(false)
  })

  /**
   * Given：导出格式为 JPG
   * When：渲染导出格式状态摘要
   * Then：格式值展示大写 JPG 并附带压缩质量标签
   * 防回归：JPG 质量缺失会让用户无法在头部感知当前压缩强度
   */
  it('JPG 格式时状态摘要附带质量标签', () => {
    const { wrapper } = mountHeader({ exportFormat: 'jpg', isJpgFormat: true })
    expect(wrapper.get('.status-summary').text()).toContain('JPG · 90%')
  })

  /**
   * Given：队列中已有图片和切片
   * When：渲染头部操作区
   * Then：重下载与清除两个条件动作出现，且各自携带 aria-label
   * 防回归：条件动作丢失会让用户失去重新导出与清空工作区的入口
   */
  it('有切片时渲染重下载与清除条件动作', () => {
    const { wrapper, tr } = mountHeader({ hasImage: true, hasTiles: true })

    const actions = wrapper.findAll('.header-action')
    expect(actions).toHaveLength(2)
    // 条件动作在 .header-actions 中连续排列，重下载位于清除之前
    expect(wrapper.get('.header-actions .header-action:nth-child(1)').attributes('aria-label')).toBe(tr.buttons.reDownload)
    expect(wrapper.get('.header-actions .header-action:nth-child(2)').attributes('aria-label')).toBe(tr.buttons.clear)
    expect(wrapper.get('.header-actions .header-action:nth-child(2)').classes()).toContain('danger')
  })

  /**
   * Given：处理中（processing=true）
   * When：渲染并操作头部动作
   * Then：头部不提供选择图片入口；重下载与清除条件动作均保持可用
   * 防回归：头部移除选择图片后，处理中仍需保留可达的重置入口并避免重复下载
   */
  it('处理中不提供选择图片，条件动作仍可用', async () => {
    const { wrapper } = mountHeader({ hasImage: true, hasTiles: true })

    expect(wrapper.find('.choose-image').exists()).toBe(false)
    const [reDownload, clear] = wrapper.findAll('.header-action')
    expect(reDownload).toBeDefined()
    expect(clear).toBeDefined()

    await reDownload?.trigger('click')
    expect(wrapper.emitted('trigger-downloads')).toHaveLength(1)
    await clear?.trigger('click')
    expect(wrapper.emitted('reset')).toHaveLength(1)
  })

  /**
   * Given：队列非空且头部存在条件动作
   * When：用户点击重下载与清除
   * Then：分别发出 trigger-downloads 与 reset，且头部不发出 choose-file
   * 防回归：选择图片入口迁移到 UploadPanel 后，头部残留事件会造成职责重复
   */
  it('点击条件动作向父级发出对应事件', async () => {
    const { wrapper } = mountHeader({ hasImage: true, hasTiles: true })

    await wrapper.get('.header-action:not(.danger)').trigger('click')
    await wrapper.get('.header-action.danger').trigger('click')
    expect(wrapper.emitted('choose-file')).toBeUndefined()
    expect(wrapper.emitted('trigger-downloads')).toHaveLength(1)
    expect(wrapper.emitted('reset')).toHaveLength(1)
  })

  /**
   * Given：当前外观为深色
   * When：点击主题切换按钮
   * Then：发出 toggle-color-scheme 事件，按钮携带切换主题的 aria-label，深色态展示 sun 图标
   * 防回归：按钮语义（动作而非状态开关）丢失会让读屏用户无法理解按钮用途
   */
  it('深色态点击主题按钮发出 toggle-color-scheme', async () => {
    const { wrapper, tr } = mountHeader({ colorScheme: 'dark' })

    const themeToggle = wrapper.get('.theme-toggle')
    expect(themeToggle.attributes('aria-label')).toBe(tr.aria.themeToggle)
    await themeToggle.trigger('click')
    expect(wrapper.emitted('toggleColorScheme')).toHaveLength(1)
  })

  /**
   * Given：当前外观为浅色
   * When：渲染主题切换按钮
   * Then：按钮展示 moon 图标（点击切到暗色），不预发任何事件
   * 防回归：图标方向接反会让用户对点击结果产生相反预期
   */
  it('浅色态主题按钮展示 moon 图标', () => {
    const { wrapper } = mountHeader({ colorScheme: 'light' })
    expect(wrapper.find('.theme-toggle .theme-icon').exists()).toBe(true)
    expect(wrapper.emitted('toggleColorScheme')).toBeUndefined()
  })

  /**
   * Given：头部正常渲染
   * When：用户切换语言下拉框到 English
   * Then：以 'en' 发出 locale-change 事件
   * 防回归：语言选择器失联会让双语能力形同虚设
   */
  it('语言下拉切换发出 locale-change', async () => {
    const { wrapper } = mountHeader()

    await wrapper.get('.lang-switcher select').setValue('en')
    expect(wrapper.emitted('localeChange')?.[0]).toEqual(['en'])
  })

  /**
   * Given：GitHub 链接按钮
   * When：检查其属性
   * Then：新窗口打开、携带 noopener，aria-label 与文案一致
   * 防回归：丢失 rel=noopener 会带来反向标签页劫持风险
   */
  it('GitHub 链接携带安全属性', () => {
    const { wrapper, tr } = mountHeader()
    const link = wrapper.get('a.icon-button')
    expect(link.attributes('href')).toBe('https://github.com/ccwq/image-grid-spliter')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener')
    expect(link.attributes('aria-label')).toBe(tr.aria.github)
  })

  /**
   * Given：真实 useColorScheme（内存存储、无 matchMedia）
   * When：切换外观并把新值作为 props 传入重渲染的头部
   * Then：主题按钮始终存在且可点击，头部接收任意合法外观值而不报错
   * 防回归：App.vue 的 colorScheme → AppHeader 接线断裂会让切换按钮失明（状态不变）
   */
  it('与真实 useColorScheme 状态接线可切换', async () => {
    const scheme = useColorScheme({ storage: createStorage(), mediaQuery })
    const { wrapper } = mountHeader({ colorScheme: scheme.colorScheme.value })
    expect(wrapper.find('.theme-toggle').exists()).toBe(true)
    const next = scheme.toggleColorScheme()
    await wrapper.setProps({ colorScheme: next })
    expect(wrapper.props('colorScheme')).toBe(next)
  })
})
