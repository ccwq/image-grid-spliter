import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import SliceEditor from '../SliceEditor.vue'

describe('SliceEditor', () => {
  /**
   * Given：用户已确认一条位于 50% 的纵向分割线
   * When：用户拖动该线后先点击恢复，再次拖动并确认
   * Then：恢复不向父级提交改动，确认才提交新的完整分割线方案
   * 防回归：拖动分割线不能在用户确认前触发重新裁切
   */
  it('将拖拽保留在草稿中，只有确认时才提交', async () => {
    const wrapper = mount(SliceEditor, {
      props: { imageSrc: 'preview.png', horizontalLines: [], verticalLines: [50], expanded: true },
    })
    const preview = wrapper.find('.parameter-preview')
    Object.assign(preview.element, { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) })

    const pointer = async (target: Element, type: string, x = 50) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 50 })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      target.dispatchEvent(event)
      await nextTick()
    }

    await pointer(wrapper.find('button.line.vertical').element, 'pointerdown')
    await pointer(preview.element, 'pointermove', 60)
    await pointer(preview.element, 'pointerup')
    expect(wrapper.emitted('confirm')).toBeUndefined()

    await wrapper.get('[data-testid="restore-line-draft"]').trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()

    await pointer(wrapper.find('button.line.vertical').element, 'pointerdown')
    await pointer(preview.element, 'pointermove', 60)
    await pointer(preview.element, 'pointerup')
    await wrapper.get('[data-testid="confirm-line-draft"]').trigger('click')

    expect(wrapper.emitted('confirm')?.[0]).toEqual([{ horizontal: [], vertical: [60] }])
  })

  /**
   * Given：用户已有一条纵向分割线且尚未开始编辑草稿
   * When：用户新增横线
   * Then：预览草稿立即新增且自动选中，但只有确认后才向父级提交完整方案
   * 防回归：新增分割线不能被未确认草稿遮蔽或绕过确认裁切
   */
  it('将新增分割线加入草稿并在确认后统一提交', async () => {
    const wrapper = mount(SliceEditor, {
      props: { imageSrc: 'preview.png', horizontalLines: [], verticalLines: [50], expanded: true },
    })

    await wrapper.get('.button-row button').trigger('click')

    expect(wrapper.findAll('button.line.horizontal')).toHaveLength(1)
    expect(wrapper.find('button.line.horizontal').classes()).toContain('selected')
    expect(wrapper.emitted('confirm')).toBeUndefined()

    await wrapper.get('[data-testid="confirm-line-draft"]').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([{ horizontal: [50], vertical: [50] }])
  })
})
