import pixelarticons from '@iconify-json/pixelarticons/icons.json'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UploadPanel from '../UploadPanel.vue'
import { useLocale } from '../../composables/useLocale'

const icons = {
  upload: pixelarticons.icons['cloud-upload'],
  image: pixelarticons.icons.image,
  imagePlus: pixelarticons.icons['image-plus'],
}

const setupZhTr = () => {
  const { currentMessages, switchLocale } = useLocale()
  switchLocale('zh-CN')
  return currentMessages.value
}

const mountPanel = (hasImage = false) => {
  const tr = setupZhTr()
  const wrapper = mount(UploadPanel, {
    props: {
      tr,
      icons,
      dragOver: false,
      hasImage,
      firstBaseName: 'photo.png',
      firstImageSize: { width: 1200, height: 800 },
      queueSummary: tr.upload.queuePrefix(1),
      errorText: '',
      isMobile: false,
    },
  })
  return { wrapper, tr }
}

describe('UploadPanel', () => {
  /**
   * Given：工作区没有图片，上传面板处于空状态
   * When：渲染并点击明确的“选择图片”按钮
   * Then：按钮显示既有本地化文案与图标，点击只发出一次 pick 事件
   * 防回归：按钮冒泡到整个 dropzone 会导致一次点击触发两次文件选择器
   */
  it('空状态显示选择图片按钮且点击只触发一次 pick', async () => {
    const { wrapper, tr } = mountPanel()

    const choose = wrapper.get('button.choose-image')
    expect(choose.text()).toContain(tr.buttons.chooseImage)
    expect(choose.find('.btn-icon').exists()).toBe(true)

    await choose.trigger('click')
    expect(wrapper.emitted('pick')).toHaveLength(1)
  })

  /**
   * Given：工作区没有图片，dropzone 支持点击选择文件
   * When：用户点击空状态按钮之外的 dropzone 区域
   * Then：仍发出一次 pick 事件
   * 防回归：新增可见按钮不应破坏原有整块空状态点击能力
   */
  it('空状态点击整个 dropzone 仍触发 pick', async () => {
    const { wrapper } = mountPanel()

    await wrapper.get('.dropzone').trigger('click')
    expect(wrapper.emitted('pick')).toHaveLength(1)
  })

  /**
   * Given：工作区已有图片
   * When：渲染紧凑上传状态并点击添加图片控件
   * Then：保留原有 add-images 控件并只发出一次 pick 事件
   * 防回归：紧凑工作区的增量添加入口不能被空状态按钮改动误伤
   */
  it('有图片时保留紧凑添加控件', async () => {
    const { wrapper, tr } = mountPanel(true)

    expect(wrapper.find('button.choose-image').exists()).toBe(false)
    const add = wrapper.get('button.upload-add')
    expect(add.attributes('aria-label')).toBe(tr.buttons.addImages)

    await add.trigger('click')
    expect(wrapper.emitted('pick')).toHaveLength(1)
  })
})
