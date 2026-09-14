/// <reference types="vitest/globals" />
import { useExportSettings } from '../useExportSettings'

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

describe('useExportSettings', () => {
  /**
   * Given：localStorage 为空且无既有键
   * When：创建 useExportSettings 组合函数
   * Then：格式默认 jpg、质量默认 80%，派生值（isJpgFormat/qualityLabel）与默认一致
   * 防回归：默认值漂移会让旧用户升级后导出参数悄悄变化
   */
  it('无既有键时以默认值初始化', () => {
    const settings = useExportSettings({ storage: createStorage() })
    expect(settings.exportFormat.value).toBe('jpg')
    expect(settings.jpgQualityPercent.value).toBe(80)
    expect(settings.isJpgFormat.value).toBe(true)
    expect(settings.qualityLabel.value).toBe('80%')
    expect(settings.jpgQuality.value).toBeCloseTo(0.8)
  })

  /**
   * Given：用户切换格式为 png 并把质量改为 85（无图片队列）
   * When：变更写入后用同一存储新建组合函数水合
   * Then：格式与质量完整往返，且写入发生在变更时而非图片存在时
   * 防回归：队列无图片时偏好必须照常持久化，否则首次上传前刷新丢失设置
   */
  it('变更即时持久化：无图片也写入且完整往返', () => {
    const storage = createStorage()
    const first = useExportSettings({ storage })
    first.updateExportFormat('png')
    first.updateJpgQuality(85)
    expect(storage.getItem('igs:export-format')).toBe('png')
    expect(storage.getItem('igs:jpg-quality')).toBe('85')

    const second = useExportSettings({ storage })
    expect(second.exportFormat.value).toBe('png')
    expect(second.jpgQualityPercent.value).toBe(85)
  })

  /**
   * Given：旧版本页面已按原键写入 `igs:export-format=png`、`igs:jpg-quality=72`
   * When：新版本组合函数创建并同步水合
   * Then：原键原名原语义直接恢复，无需任何迁移
   * 防回归：兼容红线——键名、取值语义不得迁移或重命名
   */
  it('既有原键直接水合（兼容红线）', () => {
    const storage = createStorage()
    storage.setItem('igs:export-format', 'png')
    storage.setItem('igs:jpg-quality', '72')
    const settings = useExportSettings({ storage })
    expect(settings.exportFormat.value).toBe('png')
    expect(settings.jpgQualityPercent.value).toBe(72)
  })

  /**
   * Given：质量键被外部改写为越界或非数值（"500"、"abc"）
   * When：新建组合函数水合
   * Then：非法值被钳制或丢弃（500→100、abc→默认 80），合法格式键不受影响
   * 防回归：越界质量曾直接写入 canvas toBlob 导致导出异常
   */
  it('质量越界钳制、非法丢弃且逐键独立处理', () => {
    const storage = createStorage()
    storage.setItem('igs:export-format', 'jpg')
    storage.setItem('igs:jpg-quality', '500')
    const clamped = useExportSettings({ storage })
    expect(clamped.jpgQualityPercent.value).toBe(100)

    storage.setItem('igs:jpg-quality', 'abc')
    const discarded = useExportSettings({ storage })
    expect(discarded.jpgQualityPercent.value).toBe(80)
    expect(discarded.exportFormat.value).toBe('jpg')
  })

  /**
   * Given：localStorage 读写均抛异常（隐私模式）
   * When：创建组合函数并更新格式与质量
   * Then：以默认值运行、内存态更新成功、持久化静默失败不抛错
   * 防回归：存储异常绝不能打断上传/生成/导出主流程
   */
  it('存储不可用时以默认值运行且静默降级', () => {
    const storage = createStorage()
    storage.getItem = vi.fn(() => { throw new Error('blocked') })
    storage.setItem = vi.fn(() => { throw new Error('blocked') })
    const settings = useExportSettings({ storage })
    expect(settings.exportFormat.value).toBe('jpg')
    expect(settings.jpgQualityPercent.value).toBe(80)
    expect(settings.updateExportFormat('png')).toBe(true)
    expect(settings.exportFormat.value).toBe('png')
    expect(settings.updateJpgQuality(60)).toBe(true)
    expect(settings.jpgQualityPercent.value).toBe(60)
    expect(settings.persistPreferences()).toBe(false)
  })

  /**
   * Given：调用方直接对 ref 赋值（而非经 update 动作），模拟 App.vue 中 `jpgQualityPercent = $event` 的既有用法
   * When：赋值 95 后检查存储，再赋非法 NaN
   * Then：直接赋值同样自动持久化；NaN 不写入存储且运行时不抛错
   * 防回归：App.vue 的 v-model 直赋路径依赖 watch 自动持久化，不能要求调用方记得手动 persist
   */
  it('ref 直赋路径自动持久化且 NaN 不落盘', async () => {
    const { nextTick } = await import('vue')
    const storage = createStorage()
    const settings = useExportSettings({ storage })
    settings.exportFormat.value = 'png'
    settings.jpgQualityPercent.value = 95
    await nextTick()
    expect(storage.getItem('igs:export-format')).toBe('png')
    expect(storage.getItem('igs:jpg-quality')).toBe('95')

    settings.jpgQualityPercent.value = Number.NaN
    await nextTick()
    expect(storage.getItem('igs:jpg-quality')).toBe('95')
  })

  /**
   * Given：用户把质量拖到 1 与 100 两个边界值
   * When：update 动作处理边界输入
   * Then：边界值原样生效并持久化，不被误钳制出界
   * 防回归：clamp 上界曾经排他导致 100 无法选中
   */
  it('质量边界值 1 与 100 原样生效', () => {
    const storage = createStorage()
    const settings = useExportSettings({ storage })
    expect(settings.updateJpgQuality(1)).toBe(true)
    expect(settings.jpgQualityPercent.value).toBe(1)
    expect(settings.updateJpgQuality(100)).toBe(true)
    expect(settings.jpgQualityPercent.value).toBe(100)
    expect(settings.jpgQuality.value).toBe(1)
    expect(settings.updateJpgQuality(100.4)).toBe(true)
    expect(settings.jpgQualityPercent.value).toBe(100)
  })

  /**
   * Given：格式参数传入非法值（类型断言绕过的 'webp'）
   * When：调用 updateExportFormat
   * Then：返回 false 且当前格式不变
   * 防回归：非法格式一旦落盘，水合会静默回退并造成格式显示与实际导出不一致
   */
  it('非法格式被拒绝且状态不变', () => {
    const storage = createStorage()
    const settings = useExportSettings({ storage })
    const invalid = 'webp' as unknown as 'png' | 'jpg'
    expect(settings.updateExportFormat(invalid)).toBe(false)
    expect(settings.exportFormat.value).toBe('jpg')
  })

  /**
   * Given：同一存储先后被两个组合函数实例使用（模拟 App 重建）
   * When：第二实例水合并确认 restorePreferences 幂等可重入
   * Then：重复调用 restorePreferences 结果一致，不产生副作用
   * 防回归：restore 被 App.vue onMounted 重复调用时不得叠加或重置用户输入
   */
  it('restorePreferences 幂等可重入', () => {
    const storage = createStorage()
    storage.setItem('igs:jpg-quality', '63')
    const settings = useExportSettings({ storage, autoRestore: false })
    expect(settings.restorePreferences()).toBe(true)
    expect(settings.jpgQualityPercent.value).toBe(63)
    expect(settings.restorePreferences()).toBe(true)
    expect(settings.jpgQualityPercent.value).toBe(63)
  })
})
