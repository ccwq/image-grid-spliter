import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MobileAdvancedDrawer from '../MobileAdvancedDrawer.vue'

describe('MobileAdvancedDrawer', () => {
  /**
   * Given：移动端高级设置抽屉已打开
   * When：用户按下 Escape，随后抽屉更新为关闭状态
   * Then：抽屉请求关闭，关闭后不再响应 Escape
   * 防回归：键盘关闭不能留下全局监听或使 aria-expanded 与真实状态脱节
   */
  it('打开时响应 Escape，并在关闭后清理键盘监听', async () => {
    const wrapper = mount(MobileAdvancedDrawer, { props: { open: true, hasImage: true, downloadDisabled: false } })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])

    await wrapper.setProps({ open: false })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('update:open')).toHaveLength(1)
  })
})
