import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ExportProgressOverlay from '../ExportProgressOverlay.vue'
import { useLocale } from '../../composables/useLocale'
import type { ExportProgress } from '../../composables/useImageSlicer'

const setupZhTr = () => {
  const { currentMessages, switchLocale } = useLocale()
  switchLocale('zh-CN')
  return currentMessages.value
}

const makeProgress = (overrides: Partial<ExportProgress> = {}): ExportProgress => ({
  phase: 'generating',
  current: 0,
  total: 0,
  report: null,
  ...overrides,
})

describe('ExportProgressOverlay', () => {
  /**
   * Given：导出处于生成阶段（phase=generating，2/4）
   * When：渲染常驻进度条
   * Then：显示生成文案与百分比进度，且呈现取消按钮
   * 防回归：取消按钮丢失会让用户无法中断长耗时裁切
   */
  it('生成阶段显示进度与取消按钮', () => {
    const tr = setupZhTr()
    const wrapper = mount(ExportProgressOverlay, {
      props: { progress: makeProgress({ phase: 'generating', current: 2, total: 4 }), tr, cancellable: true },
    })

    expect(wrapper.find('aside.export-progress').exists()).toBe(true)
    expect(wrapper.get('.progress-copy strong').text()).toBe(tr.progress.generating(2, 4))
    expect(wrapper.get('.progress-count').text()).toBe('50%')
    expect(wrapper.get('.progress-meter span').attributes('style')).toContain('width: 50%')
    expect(wrapper.get('button.progress-cancel').text()).toBe(tr.progress.cancel)
  })

  /**
   * Given：目录直写部分失败（phase=report，mode=directory，pending>0）
   * When：渲染导出报告
   * Then：显示目录报告文案，出现“传统下载重试”按钮，点击发出 retry-pending-downloads
   * 防回归：pending>0 却无重试入口，会让部分失败项永远无法补齐
   */
  it('目录报告 pending>0 时提供重试入口', async () => {
    const tr = setupZhTr()
    const wrapper = mount(ExportProgressOverlay, {
      props: {
        progress: makeProgress({ phase: 'report', current: 3, total: 4, report: { mode: 'directory', completed: 3, total: 4, renamed: 0, pending: 1 } }),
        tr,
      },
    })

    expect(wrapper.get('.progress-copy strong').text()).toBe(tr.progress.directoryReport(3, 4, 0, 1))
    expect(wrapper.find('.progress-retry-btn').exists()).toBe(true)

    await wrapper.get('button.progress-retry-btn').trigger('click')
    expect(wrapper.emitted('retry-pending-downloads')).toHaveLength(1)
  })

  /**
   * Given：目录导出全部成功（mode=directory，pending=0）
   * When：渲染导出报告
   * Then：不渲染重试入口
   * 防回归：全部成功时若仍显示重试按钮，会引导用户执行无意义的重复下载
   */
  it('目录报告 pending=0 时不显示重试', () => {
    const tr = setupZhTr()
    const wrapper = mount(ExportProgressOverlay, {
      props: {
        progress: makeProgress({ phase: 'report', current: 4, total: 4, report: { mode: 'directory', completed: 4, total: 4, renamed: 2, pending: 0 } }),
        tr,
      },
    })

    expect(wrapper.get('.progress-copy strong').text()).toBe(tr.progress.directoryReport(4, 4, 2, 0))
    expect(wrapper.find('.progress-retry-btn').exists()).toBe(false)
  })

  /**
   * Given：生成中断报告（mode=generation，pending>0）
   * When：渲染导出报告
   * Then：即使 pending>0 也不渲染重试入口（无传统待重试项，按钮无效）
   * 防回归：生成中断若误挂重试按钮，会触发空列表的无效导出
   */
  it('生成中断报告不显示重试', () => {
    const tr = setupZhTr()
    const wrapper = mount(ExportProgressOverlay, {
      props: {
        progress: makeProgress({ phase: 'report', current: 2, total: 4, report: { mode: 'generation', completed: 2, total: 4, renamed: 0, pending: 2 } }),
        tr,
      },
    })

    expect(wrapper.get('.progress-copy strong').text()).toBe(tr.progress.generationReport(2, 4, 2))
    expect(wrapper.find('.progress-retry-btn').exists()).toBe(false)
  })

  /**
   * Given：传统逐张下载报告（mode=traditional）
   * When：渲染导出报告
   * Then：显示传统报告文案且无重试入口
   * 防回归：报告分支文案错位会让用户误判导出结果
   */
  it('传统报告显示传统文案且无重试', () => {
    const tr = setupZhTr()
    const wrapper = mount(ExportProgressOverlay, {
      props: {
        progress: makeProgress({ phase: 'report', current: 5, total: 5, report: { mode: 'traditional', completed: 5, total: 5, renamed: 0, pending: 0 } }),
        tr,
      },
    })

    expect(wrapper.get('.progress-copy strong').text()).toBe(tr.progress.traditionalReport(5, 5))
    expect(wrapper.find('.progress-retry-btn').exists()).toBe(false)
  })

  /**
   * Given：常驻报告展示中
   * When：用户点击关闭按钮
   * Then：发出 dismiss 事件；报告阶段不渲染百分比与进度条，也不渲染取消按钮
   * 防回归：报告态残留进度条会误导用户以为仍在导出
   */
  it('报告态点击关闭发出 dismiss 且无进度元素', async () => {
    const tr = setupZhTr()
    const wrapper = mount(ExportProgressOverlay, {
      props: {
        progress: makeProgress({ phase: 'report', current: 4, total: 4, report: { mode: 'directory', completed: 4, total: 4, renamed: 0, pending: 0 } }),
        tr,
      },
    })

    expect(wrapper.find('.progress-count').exists()).toBe(false)
    expect(wrapper.find('.progress-meter').exists()).toBe(false)
    expect(wrapper.find('button.progress-cancel').exists()).toBe(false)

    await wrapper.get('button.progress-close').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  /**
   * Given：可取消的生成阶段展示中
   * When：用户点击取消按钮
   * Then：发出 cancel 事件
   * 防回归：取消事件转发缺失会让取消按钮形同虚设
   */
  it('点击取消发出 cancel', async () => {
    const tr = setupZhTr()
    const wrapper = mount(ExportProgressOverlay, {
      props: { progress: makeProgress({ phase: 'generating', current: 1, total: 4 }), tr, cancellable: true },
    })

    await wrapper.get('button.progress-cancel').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  /**
   * Given：导出已结束（phase=hidden）
   * When：渲染组件
   * Then：整个 aside 不渲染
   * 防回归：隐藏态若仍渲染，常驻报告会永远占据页面顶部
   */
  it('hidden 阶段不渲染任何内容', () => {
    const tr = setupZhTr()
    const wrapper = mount(ExportProgressOverlay, {
      props: { progress: makeProgress({ phase: 'hidden' }), tr },
    })

    expect(wrapper.find('aside.export-progress').exists()).toBe(false)
  })
})
