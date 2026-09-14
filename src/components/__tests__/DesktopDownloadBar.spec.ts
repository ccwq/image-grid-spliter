import pixelarticons from '@iconify-json/pixelarticons/icons.json'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DesktopDownloadBar from '../DesktopDownloadBar.vue'
import { useLocale } from '../../composables/useLocale'

// 与 App.vue 一致的真实 pixelarticons 图标数据（内嵌数据，jsdom 中可离线同步渲染，不触发网络请求）
const icons = { download: pixelarticons.icons.download }

// 固定使用 zh-CN 真实文案，断言直接复用 useLocale 的消息对象，避免测试内私有文案与实现漂移
const setupZhTr = () => {
  const { currentMessages, switchLocale } = useLocale()
  switchLocale('zh-CN')
  return currentMessages.value
}

describe('DesktopDownloadBar', () => {
  /**
   * Given：PC 端队列中有 3 张图片、自动下载已开启、未处于处理中
   * When：浮动导出栏完成渲染
   * Then：队列摘要、自动下载开关（含 aria-label 与勾选态）与主“下载全部”按钮（button.download-bar-all，type=button）齐备且可交互
   * 防回归：主按钮语义或队列摘要丢失，会让 PC 用户失去唯一的一键导出入口
   */
  it('渲染队列摘要与可用的主“下载全部”按钮', () => {
    const tr = setupZhTr()
    const wrapper = mount(DesktopDownloadBar, {
      props: { tr, icons, queueCount: 3, autoDownload: true, processing: false },
    })

    expect(wrapper.find('aside.desktop-download-bar').attributes('aria-label')).toBe('导出操作')
    expect(wrapper.get('.download-bar-queue').text()).toBe(tr.results.queueSummary(3))

    const checkbox = wrapper.get('input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    expect(checkbox.attributes('aria-label')).toBe(tr.export.autoDownloadLabel)
    expect(checkbox.attributes('disabled')).toBeUndefined()

    const primary = wrapper.get('button.download-bar-all')
    expect(primary.attributes('type')).toBe('button')
    expect(primary.text()).toContain(tr.buttons.downloadAll)
    expect(primary.attributes('disabled')).toBeUndefined()
  })

  /**
   * Given：未处于处理中，浮动导出栏上的控件均可交互
   * When：用户取消自动下载开关，再点击“下载全部”
   * Then：组件以新的勾选值发出 toggle-auto-download，并发出 trigger-downloads
   * 防回归：开关值或下载触发事件丢失，会静默改变导出行为且无任何反馈
   */
  it('向父级转发自动下载开关与下载全部动作', async () => {
    const tr = setupZhTr()
    const wrapper = mount(DesktopDownloadBar, {
      props: { tr, icons, queueCount: 2, autoDownload: true, processing: false },
    })

    await wrapper.get('input[type="checkbox"]').setValue(false)
    expect(wrapper.emitted('toggle-auto-download')?.[0]).toEqual([false])

    await wrapper.get('button.download-bar-all').trigger('click')
    expect(wrapper.emitted('trigger-downloads')).toHaveLength(1)
  })

  /**
   * Given：导出正在进行（processing=true）
   * When：渲染浮动导出栏并尝试操作开关与主按钮
   * Then：两个控件均为 disabled，主按钮点击不再发出任何事件
   * 防回归：处理中若仍可触发下载，会与进行中的导出相互干扰或产生重复队列
   */
  it('处理中禁用自动下载开关与主按钮', async () => {
    const tr = setupZhTr()
    const wrapper = mount(DesktopDownloadBar, {
      props: { tr, icons, queueCount: 2, autoDownload: false, processing: true },
    })

    const checkbox = wrapper.get('input[type="checkbox"]')
    const primary = wrapper.get('button.download-bar-all')
    expect(checkbox.element.disabled).toBe(true)
    expect(primary.element.disabled).toBe(true)

    await primary.trigger('click')
    expect(wrapper.emitted('trigger-downloads')).toBeUndefined()
    expect(wrapper.emitted('toggle-auto-download')).toBeUndefined()
  })
})
