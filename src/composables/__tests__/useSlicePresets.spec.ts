/// <reference types="vitest/globals" />
import { nextTick } from 'vue'
import {
  createSlicePresetDocument,
  parseSlicePresetDocument,
  useSlicePresets,
  type SlicePlan,
} from '../useSlicePresets'

const plan: SlicePlan = {
  horizontalLines: [0.5],
  verticalLines: [0.5],
  padding: 2,
  paddingUnit: 'percent',
  trimOuterEdges: false,
}

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

describe('useSlicePresets', () => {
  /**
   * Given：存在可写 localStorage 和有效的裁切方案
   * When：用户手动保存、更新再删除预设
   * Then：内存库与版本化 storage 文档同步更新
   * 防回归：刷新后不应丢失用户明确保存的预设
   */
  it('支持命名预设 CRUD 并持久化', async () => {
    const storage = createStorage()
    const presets = useSlicePresets({ storage, now: () => new Date('2026-07-15T00:00:00.000Z'), idFactory: () => 'preset-1' })
    const saved = presets.savePreset('  社媒九宫格  ', plan)
    expect(saved).toMatchObject({ ok: true, preset: { id: 'preset-1', name: '社媒九宫格' } })
    expect(presets.presets.value).toHaveLength(1)

    const updated = presets.updatePreset('preset-1', { name: '社媒九宫格 v2', plan: { ...plan, padding: 4 } })
    expect(updated).toMatchObject({ ok: true, preset: { name: '社媒九宫格 v2', plan: { padding: 4 } } })
    expect(JSON.parse(storage.getItem('image-grid-spliter.slice-presets.v1')!).presets[0].name).toBe('社媒九宫格 v2')

    expect(presets.removePreset('preset-1')).toBe(true)
    await nextTick()
    expect(presets.presets.value).toEqual([])
  })

  /**
   * Given：浏览器禁用 localStorage 或 storage 写入抛错
   * When：用户保存预设
   * Then：预设仍保留在当前内存会话且暴露可显示的错误信息
   * 防回归：隐私模式不应导致裁切器崩溃
   */
  it('在 storage 不可用时安全降级到内存', () => {
    const storage = createStorage()
    storage.setItem = vi.fn(() => { throw new Error('blocked') })
    const presets = useSlicePresets({ storage, idFactory: () => 'memory-only' })

    expect(presets.savePreset('临时方案', plan)).toMatchObject({ ok: true })
    expect(presets.presets.value).toHaveLength(1)
    expect(presets.lastError.value).toContain('无法写入')
  })

  /**
   * Given：用户选择单个预设或完整预设库
   * When：导出并重新解析版本化 JSON
   * Then：两种导出都包含格式、版本和完整裁切方案
   * 防回归：文件与剪贴板共用的 JSON 契约不能漂移
   */
  it('支持单个和全部预设的版本化 JSON 导出', () => {
    const presets = useSlicePresets({ storage: null, idFactory: () => 'one' })
    presets.savePreset('方案一', plan)
    const one = parseSlicePresetDocument(presets.exportPreset('one')!)
    const all = parseSlicePresetDocument(presets.exportAllPresets())

    expect(one?.presets).toHaveLength(1)
    expect(all).toEqual(createSlicePresetDocument(presets.presets.value))
  })

  /**
   * Given：导入文本不是当前版本的有效预设 JSON
   * When：调用导入
   * Then：返回错误且不修改已有预设库
   * 防回归：损坏剪贴板内容不能清空用户的预设
   */
  it('拒绝无效 JSON 并保持原预设不变', () => {
    const presets = useSlicePresets({ storage: null, idFactory: () => 'one' })
    presets.savePreset('已有方案', plan)

    const result = presets.importPresets('{bad json')
    expect(result).toMatchObject({ ok: false, imported: [], error: expect.any(String) })
    expect(presets.presets.value.map((preset) => preset.name)).toEqual(['已有方案'])
  })

  /**
   * Given：导入项与本地预设同名
   * When：UI resolver 分别选择覆盖、自动重命名和跳过
   * Then：导入逻辑遵守每项决策并保留可用于提示的冲突信息
   * 防回归：同名导入不能静默覆盖用户配置
   */
  it('按 UI 提供的冲突策略覆盖、重命名或跳过', () => {
    const ids = ['local', 'overwritten', 'renamed']
    const presets = useSlicePresets({ storage: null, idFactory: () => ids.shift()! })
    presets.savePreset('同名', plan)
    const incoming = JSON.stringify(createSlicePresetDocument([
      { id: 'from-file-1', name: '同名', plan: { ...plan, padding: 3 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'from-file-2', name: '同名', plan: { ...plan, padding: 4 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'from-file-3', name: '同名', plan: { ...plan, padding: 5 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]))
    const actions: Array<'overwrite' | 'rename' | 'skip'> = ['overwrite', 'rename', 'skip']
    const result = presets.importPresets(incoming, () => actions.shift()!)

    expect(result.conflicts).toHaveLength(3)
    expect(result.overwritten[0]).toMatchObject({ id: 'local', plan: { padding: 3 } })
    expect(result.renamed[0].name).toBe('同名 (2)')
    expect(result.skipped).toHaveLength(1)
    expect(presets.presets.value.map((preset) => preset.name)).toEqual(['同名', '同名 (2)'])
  })
})
