import pixelarticons from '@iconify-json/pixelarticons/icons.json'
import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ResultsPanel from '../ResultsPanel.vue'
import { useLocale } from '../../composables/useLocale'
import type { ImageItem } from '../../composables/useImageSlicer'

// 与 App.vue 一致的真实 pixelarticons 图标数据（内嵌数据，jsdom 中可离线同步渲染，不触发网络请求）
const icons = {
  download: pixelarticons.icons.download,
  image: pixelarticons.icons.image,
  chevronDown: pixelarticons.icons['chevron-down'],
  chevronUp: pixelarticons.icons['chevron-up'],
}

const setupZhTr = () => {
  const { currentMessages, switchLocale } = useLocale()
  switchLocale('zh-CN')
  return currentMessages.value
}

// 构造一条不依赖真实图像解码的结果记录：仅字段齐全即可支撑列表与下载动作断言
const makeImage = (id: string, tileCount: number): ImageItem => ({
  id,
  baseName: `photo-${id}`,
  objectUrl: `blob:object-${id}`,
  image: new window.Image(),
  size: { width: 800, height: 600 },
  tiles: Array.from({ length: tileCount }, (_, index) => ({
    id: `${id}-tile-${index}`,
    name: `photo-${id}-${index}.png`,
    blob: new Blob(['tile'], { type: 'image/png' }),
    previewUrl: `blob:preview-${id}-${index}`,
    row: 0,
    col: index,
    width: 400,
    height: 300,
  })),
})

interface MountOptions {
  processing?: boolean
  collapsed?: boolean
  showInlineDownloadControls?: boolean
  pendingTraditionalDownloads?: { written: number; pending: number } | null
  images?: ImageItem[]
}

const mountPanel = (tr: ReturnType<typeof setupZhTr>, overrides: MountOptions = {}) =>
  mount(ResultsPanel, {
    props: {
      tr,
      icons,
      images: overrides.images ?? [makeImage('a', 2), makeImage('b', 1)],
      tilesHeading: '4 个切片',
      resultsSummary: '网格：2x2',
      autoDownload: false,
      processing: overrides.processing ?? false,
      collapsed: overrides.collapsed ?? false,
      pendingTraditionalDownloads: overrides.pendingTraditionalDownloads ?? null,
      showInlineDownloadControls: overrides.showInlineDownloadControls ?? true,
    },
  })

// 收起态下 image-list 不渲染，因此仅断言头部区域的内联控件集合
const expectHeaderControls = (wrapper: VueWrapper, present: boolean) => {
  expect(wrapper.find('.results-actions').exists()).toBe(present)
  expect(wrapper.find('.auto-toggle input[type="checkbox"]').exists()).toBe(present)
  expect(wrapper.find('button.results-download').exists()).toBe(present)
}

describe('ResultsPanel', () => {
  /**
   * Given：队列中有图片且未传 showInlineDownloadControls（默认内联模式）
   * When：结果面板完成渲染
   * Then：头部包含自动下载开关、“下载全部”按钮与部分失败重试入口
   * 防回归：默认必须是内联模式，遗漏该默认值会让移动端丢失全部导出控件
   */
  it('默认内联模式渲染完整导出控件', () => {
    const tr = setupZhTr()
    const wrapper = mount(ResultsPanel, {
      props: {
        tr, icons,
        images: [makeImage('a', 2)],
        tilesHeading: '2 个切片', resultsSummary: '网格：1x2',
        autoDownload: true, processing: false, collapsed: false,
        pendingTraditionalDownloads: null,
      },
    })
    expectHeaderControls(wrapper, true)
    expect((wrapper.get('.auto-toggle input').element as HTMLInputElement).checked).toBe(true)
  })

  /**
   * Given：移动端模式（showInlineDownloadControls=true）
   * When：用户依次操作自动下载开关、“下载全部”、重试与逐图下载
   * Then：各控件按交互分别发出 toggle-auto-download、trigger-downloads、retry-pending-downloads 与 download-image
   * 防回归：移动端是内联控件的唯一宿主，任一事件转发缺失都会让移动端导出链路断裂
   */
  it('内联模式转发全部导出事件', async () => {
    const tr = setupZhTr()
    const wrapper = mountPanel(tr, { showInlineDownloadControls: true, pendingTraditionalDownloads: { written: 3, pending: 1 } })

    await wrapper.get('.auto-toggle input').setValue(true)
    expect(wrapper.emitted('toggle-auto-download')?.[0]).toEqual([true])

    await wrapper.get('button.results-download').trigger('click')
    expect(wrapper.emitted('trigger-downloads')).toHaveLength(1)

    expect(wrapper.get('.export-retry p').text()).toBe(tr.results.partialExport(3, 1))
    await wrapper.get('.export-retry button').trigger('click')
    expect(wrapper.emitted('retry-pending-downloads')).toHaveLength(1)

    await wrapper.get('.compact-result-action').trigger('click')
    expect(wrapper.emitted('download-image')?.[0]).toEqual(['a'])
  })

  /**
   * Given：PC 端模式（showInlineDownloadControls=false）且存在待重试项
   * When：渲染结果面板头部
   * Then：内联的自动下载开关、“下载全部”与重试区块全部隐藏，但头部其余信息与收起按钮保留
   * 防回归：PC 端导出动作已迁移到浮动导出栏与常驻报告，内联控件回归会出现双份导出入口
   */
  it('桌面模式隐藏内联导出控件但保留头部', () => {
    const tr = setupZhTr()
    const wrapper = mountPanel(tr, { showInlineDownloadControls: false, pendingTraditionalDownloads: { written: 3, pending: 1 } })

    expectHeaderControls(wrapper, false)
    expect(wrapper.find('.export-retry').exists()).toBe(false)
    // PC 头部仅保留结果摘要与收起按钮；队列信息由浮动工具条统一呈现
    expect(wrapper.find('button.result-collapse').exists()).toBe(true)
    expect(wrapper.find('.results-overview').text()).not.toContain(tr.results.queueSummary(2))
  })

  /**
   * Given：处理中（processing=true）且内联控件可见
   * When：尝试点击“下载全部”、逐图下载与重试按钮
   * Then：三个按钮均为 disabled 且不发出任何事件
   * 防回归：处理中若能再次触发下载，会与进行中的导出相互干扰
   */
  it('处理中禁用全部内联下载按钮', async () => {
    const tr = setupZhTr()
    const wrapper = mountPanel(tr, { processing: true, pendingTraditionalDownloads: { written: 3, pending: 1 } })

    const downloadAll = wrapper.get('button.results-download')
    const perImage = wrapper.get('.compact-result-action')
    const retry = wrapper.get('.export-retry button')
    expect(downloadAll.element.disabled).toBe(true)
    expect(perImage.element.disabled).toBe(true)
    expect(retry.element.disabled).toBe(true)

    await downloadAll.trigger('click')
    await perImage.trigger('click')
    await retry.trigger('click')
    expect(wrapper.emitted('trigger-downloads')).toBeUndefined()
    expect(wrapper.emitted('download-image')).toBeUndefined()
    expect(wrapper.emitted('retry-pending-downloads')).toBeUndefined()
  })

  /**
   * Given：结果列表处于展开态
   * When：用户点击收起按钮后将其置回展开
   * Then：收起时发出 toggle-collapsed 且 image-list 消失，恢复后列表与切片网格重新出现
   * 防回归：收起状态若不渲染头部或丢失展开能力，用户将无法找回结果
   */
  it('收起时隐藏列表并在展开后恢复', async () => {
    const tr = setupZhTr()
    const wrapper = mountPanel(tr, { collapsed: false })

    expect(wrapper.find('.image-list').exists()).toBe(true)
    await wrapper.get('button.result-collapse').trigger('click')
    expect(wrapper.emitted('toggle-collapsed')).toHaveLength(1)

    await wrapper.setProps({ collapsed: true })
    expect(wrapper.find('.image-list').exists()).toBe(false)
    // 收起仅隐藏列表，头部与收起按钮本身仍可操作
    expectHeaderControls(wrapper, true)
    expect(wrapper.find('button.result-collapse').exists()).toBe(true)

    await wrapper.setProps({ collapsed: false })
    expect(wrapper.findAll('.image-block')).toHaveLength(2)
    expect(wrapper.findAll('.tiles-grid .tile')).toHaveLength(3)
  })

  /**
   * Given：某张图片尚无切片结果
   * When：渲染该图片的结果块并点击其切片
   * Then：无切片时显示占位文案；有切片时点击切片发出携带切片 id 的 preview-tile
   * 防回归：占位分支与预览事件是切片预览入口，回归会让用户无法查看放大切片
   */
  it('无切片显示占位，点击切片发出 preview-tile', async () => {
    const tr = setupZhTr()
    const wrapper = mountPanel(tr, { images: [makeImage('a', 0), makeImage('b', 2)] })

    const blocks = wrapper.findAll('.image-block')
    // 无切片的第一块：网格不渲染、占位文案可见
    expect(blocks[0].find('.tiles-grid').exists()).toBe(false)
    expect(blocks[0].get('.tiles-card > p.muted').text()).toBe(tr.results.previewPlaceholder)
    // 有切片的第二块：网格渲染且数量正确
    expect(blocks[1].findAll('.tiles-grid .tile')).toHaveLength(2)

    const tiles = blocks[1].findAll('.tiles-grid .tile')
    await tiles[1].trigger('click')
    expect(wrapper.emitted('preview-tile')?.[0]).toEqual(['b-tile-1'])
  })

  /**
   * Given：队列为空（images.length === 0）
   * When：渲染结果面板
   * Then：整个 section 不渲染
   * 防回归：空队列时若仍渲染面板，会与上传引导区域叠加产生误导性空白
   */
  it('空队列不渲染结果面板', () => {
    const tr = setupZhTr()
    const wrapper = mountPanel(tr, { images: [] })
    expect(wrapper.find('section.panel.results').exists()).toBe(false)
  })
})
