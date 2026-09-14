import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocaleMessages, ExportFormat } from '../useLocale'
import { useImageSlicer, type GenerationParams, type ImageItem, type SliceEnvironment } from '../useImageSlicer'
import { createSliceResultCache, type SliceResultCache } from '../../modules/sliceResultCache'
import type { GridPreset, SlicePlan, TileRect } from '../../utils/grid'

/** 组合函数只需要 status 与 errors 文案，测试桩最小化。 */
const messages = computed(() => ({
  status: {
    waiting: 'waiting',
    batchDownloading: 'batch',
    triggered: (count: number) => `triggered:${count}`,
    processing: 'processing',
    finished: (count: number, grid: string) => `finished:${count}:${grid}`,
    manual: (count: number, grid: string) => `manual:${count}:${grid}`,
    loading: 'loading',
  },
  errors: {
    invalidFile: 'invalidFile',
    processingFailed: 'processingFailed',
    loadFailed: 'loadFailed',
    customGridInvalid: 'customGridInvalid',
  },
})) as unknown as ComputedRef<LocaleMessages>

const plan2x2 = (): SlicePlan => ({ horizontalLines: [0.5], verticalLines: [0.5], padding: 0, paddingUnit: 'percent', trimOuterEdges: false })
const plan1x1 = (): SlicePlan => ({ horizontalLines: [], verticalLines: [], padding: 0, paddingUnit: 'percent', trimOuterEdges: false })
const plan2x1 = (): SlicePlan => ({ horizontalLines: [0.5], verticalLines: [], padding: 0, paddingUnit: 'percent', trimOuterEdges: false })

/** 生成环境的测试桩产出：内容可区分 plan/format，供命中复用断言比对 Blob 身份。 */
const makeTileBlob = (rect: TileRect, format: ExportFormat) =>
  new Blob([`${rect.row}-${rect.col}-${Math.round(rect.width)}x${Math.round(rect.height)}-${format}`], {
    type: format === 'jpg' ? 'image/jpeg' : 'image/png',
  })

interface ProducedCall {
  key: string
  row: number
  col: number
  width: number
  height: number
  format: ExportFormat
  quality?: number
}

interface Harness {
  slicer: ReturnType<typeof useImageSlicer>
  cache: SliceResultCache
  produced: ProducedCall[]
  createdUrls: string[]
  revokedUrls: string[]
  plan: Ref<SlicePlan>
  format: Ref<ExportFormat>
  quality: Ref<number>
  loadImageCalls: number[]
  /** produceGate 在位时每次 produceTile 等待手动放行（用于 in-flight/取消/竞态编排） */
  setGate: (gate: ((callIndex: number) => Promise<Blob | null>) | null) => void
  addImage: (identity: string, baseName: string, width?: number, height?: number) => ImageItem
}

interface HarnessOptions {
  plan?: SlicePlan
  format?: ExportFormat
  quality?: number
  cache?: SliceResultCache
  selectedPreset?: { value: GridPreset }
}

function createHarness(options: HarnessOptions = {}): Harness {
  const plan = ref(options.plan ?? plan2x2())
  const format = ref<ExportFormat>(options.format ?? 'png')
  const quality = ref(options.quality ?? 0.8)
  const selectedPreset = options.selectedPreset ?? ref<GridPreset>({ cols: 2, rows: 2 })
  const cache = options.cache ?? createSliceResultCache()

  const produced: ProducedCall[] = []
  const createdUrls: string[] = []
  const revokedUrls: string[] = []
  const loadImageCalls: number[] = []
  let urlCounter = 0
  let gate: ((callIndex: number) => Promise<Blob | null>) | null = null

  const environment: Partial<SliceEnvironment> = {
    produceTile: async (image, rect, params) => {
      produced.push({ key: params.key, row: rect.row, col: rect.col, width: rect.width, height: rect.height, format: params.format, quality: params.jpgQuality })
      if (gate) return gate(produced.length)
      return makeTileBlob(rect, params.format)
    },
    createObjectUrl: (blob) => {
      urlCounter += 1
      const url = `blob:tile-${urlCounter}`
      createdUrls.push(url)
      return url
    },
    revokeObjectUrl: (url) => revokedUrls.push(url),
    loadImage: async () => {
      loadImageCalls.push(1)
      return { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement
    },
  }

  const slicer = useImageSlicer({
    selectedPreset,
    slicePlan: plan,
    exportFormat: format,
    jpgQuality: quality,
    gridDescription: ref('2 x 2'),
    currentMessages: messages,
    cache,
    environment,
  })

  /** 绕过文件上传直插入队（fileSha256 身份由测试显式给定，保持确定性）。 */
  const addImage = (identity: string, baseName: string, width = 400, height = 200): ImageItem => {
    const item: ImageItem = {
      id: identity,
      baseName,
      objectUrl: `blob:original-${identity}`,
      image: { naturalWidth: width, naturalHeight: height } as HTMLImageElement,
      size: { width, height },
      tiles: [],
    }
    slicer.images.value.push(item)
    return item
  }

  return {
    slicer,
    cache,
    produced,
    createdUrls,
    revokedUrls,
    plan,
    format,
    quality,
    loadImageCalls,
    setGate: (next) => { gate = next },
    addImage,
  }
}

/** 同步记录进度对象每次变化的快照（flush: 'sync'），供"跳过 generating 阶段"断言。 */
function recordProgress(slicer: ReturnType<typeof useImageSlicer>) {
  const phases: Array<{ phase: string; current: number; total: number }> = []
  watch(slicer.exportProgress, (snap) => phases.push({ phase: snap.phase, current: snap.current, total: snap.total }), { flush: 'sync' })
  return phases
}

describe('useImageSlicer 缓存接入', () => {
  // Node jsdom 的 anchor.click() 会尝试导航（jsdom 未实现），stub 掉避免噪音
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  afterEach(() => clickSpy.mockClear())

  /**
   * Given：空队列中上传一张图片（默认 2 x 2 网格、PNG）
   * When：首次 processAll 后使展示结果失效（模拟物料层独立回收），再次 processAll
   * Then：第二次命中缓存不重切——produceTile 调用数不变，缓存条目重新物料化为全新 URL/新 id，Blob 为同一对象
   * 防回归：命中路径若复用旧 URL/旧 id 会产生跨轮次失效引用；若重复裁切则缓存形同虚设
   */
  it('首次生成入缓存，二次请求命中且重新物料化（新 URL 新 id，同 Blob）', async () => {
    const harness = createHarness()
    const item = harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    expect(harness.produced).toHaveLength(4)
    const firstPass = item.tiles.map((tile) => ({ blob: tile.blob, url: tile.previewUrl, id: tile.id }))
    expect(harness.cache.stats().entries).toBe(1)

    // 使 tilesKey 失效：强制下一次走"缓存命中 → 重新物料化"路径（而非同键复用路径）
    item.tilesKey = null
    await harness.slicer.processAll(false)

    expect(harness.produced).toHaveLength(4) // 不重切
    expect(item.tiles).toHaveLength(4)
    // 同一 Blob 字节复用（缓存条目原样返回）
    expect(item.tiles.map((tile) => tile.blob)).toEqual(firstPass.map((tile) => tile.blob))
    item.tiles.forEach((tile, index) => {
      expect(tile.blob).toBe(firstPass[index]!.blob)
      // 全新 URL 与全新 id：物料化不复用易失字段
      expect(tile.previewUrl).not.toBe(firstPass[index]!.url)
      expect(tile.id).not.toBe(firstPass[index]!.id)
      expect(harness.revokedUrls).toContain(firstPass[index]!.url)
    })
  })

  /**
   * Given：同键 tiles 已物料化在展示中
   * When：再次以相同参数触发生成
   * Then：直接复用现有 tiles 与 URL——数组引用不变、不新建也不回收任何 URL
   * 防回归：同键重复请求若重开 URL 会让预览中已渲染的 img 失效
   */
  it('同键重复请求直接复用 tiles 与 URL，不产生新 Object URL', async () => {
    const harness = createHarness()
    const item = harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    const urlsBefore = item.tiles.map((tile) => tile.previewUrl)
    const createdBefore = harness.createdUrls.length
    const revokedBefore = harness.revokedUrls.length
    const tilesRef = item.tiles

    await harness.slicer.processAll(false)

    expect(item.tiles).toBe(tilesRef)
    expect(item.tiles.map((tile) => tile.previewUrl)).toEqual(urlsBefore)
    expect(harness.createdUrls.length).toBe(createdBefore)
    expect(harness.revokedUrls.length).toBe(revokedBefore)
    expect(harness.produced).toHaveLength(4)
  })

  /**
   * Given：同一内容标识的图片已按原名生成并缓存
   * When：修改 baseName（模拟改名上传的绕过去重验证路径）后触发生成
   * Then：命中同一缓存条目复用 Blob，下载名按当前 baseName 重新拼接
   * 防回归：缓存混入文件名会导致改名后全部假未命中或下载名错误
   */
  it('改名后命中缓存且下载名基于当前 baseName 正确拼接', async () => {
    const harness = createHarness()
    const item = harness.addImage('img-a', 'vacation')
    await harness.slicer.processAll(false)
    expect(item.tiles[0]!.name).toBe('vacation-r1c1.png')

    item.baseName = 'sunset'
    await harness.slicer.processAll(false)

    expect(harness.produced).toHaveLength(4) // 命中，不重切
    expect(item.tiles.map((tile) => tile.name)).toEqual([
      'sunset-r1c1.png', 'sunset-r1c2.png', 'sunset-r2c1.png', 'sunset-r2c2.png',
    ])
  })

  /**
   * Given：单 tile 网格（1 x 1）与多 tile 网格（2 x 2）分别生成
   * When：检查物料化名称规则
   * Then：单 tile 为 baseName.ext，多 tile 为 baseName-r{row}c{col}.ext，与既有命名规则一致
   * 防回归：命名规则变化会破坏用户既有导出习惯与重名后缀逻辑
   */
  it('单 tile 与多 tile 的命名规则与既有行为一致', async () => {
    const single = createHarness({ plan: plan1x1() })
    const singleItem = single.addImage('img-s', 'shot')
    await single.slicer.processAll(false)
    expect(singleItem.tiles.map((tile) => tile.name)).toEqual(['shot.png'])

    const multi = createHarness()
    const multiItem = multi.addImage('img-m', 'photo')
    await multi.slicer.processAll(false)
    expect(multiItem.tiles[0]!.name).toBe('photo-r1c1.png')
  })

  /**
   * Given：PNG 格式已按质量 0.8 生成并缓存
   * When：质量调整为 0.5 后触发生成，随后切换为 JPG 再触发生成
   * Then：PNG 下调质量不重切（键忽略质量）；切 JPG 生成新键并重切，质量快照传入生成环境
   * 防回归：PNG 调质量触发全量重切是浪费；JPG 键漏质量会展示错误压缩产物
   */
  it('PNG 质量等价不重切，格式切 JPG 后换键重切并携带质量快照', async () => {
    const harness = createHarness({ format: 'png', quality: 0.8 })
    harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    expect(harness.produced).toHaveLength(4)

    harness.quality.value = 0.5
    await harness.slicer.processAll(false)
    expect(harness.produced).toHaveLength(4) // PNG 忽略质量

    harness.format.value = 'jpg'
    await harness.slicer.processAll(false)
    expect(harness.produced).toHaveLength(8) // 新键重切
    expect(harness.produced.slice(4).every((call) => call.format === 'jpg' && call.quality === 0.5)).toBe(true)
  })

  /**
   * Given：JPG 格式已按质量 0.8 生成并缓存
   * When：质量改为 0.5 生成，再改回 0.8 生成
   * Then：质量变化换键重切；回到 0.8 命中原条目不重切
   * 防回归：JPG 质量以浮点直接入键会有序列化歧义，导致同质量假未命中
   */
  it('JPG 质量变化换键重切，恢复原质量命中缓存', async () => {
    const harness = createHarness({ format: 'jpg', quality: 0.8 })
    harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    expect(harness.produced).toHaveLength(4)

    harness.quality.value = 0.5
    await harness.slicer.processAll(false)
    expect(harness.produced).toHaveLength(8)
    expect(harness.produced.slice(4).every((call) => call.quality === 0.5)).toBe(true)

    harness.quality.value = 0.8
    await harness.slicer.processAll(false)
    expect(harness.produced).toHaveLength(8) // A-B-A：原键命中
  })

  /**
   * Given：2 x 2 参数已生成并缓存
   * When：分割线改为 2 x 1 触发重切，再恢复 2 x 2 触发生成（A-B-A）
   * Then：B 键重切 2 tile；回到 A 键命中缓存复用首轮的同一 Blob 字节
   * 防回归：参数来回调整是最高频操作，键或矩形取整不一致会造成假未命中反复重切
   */
  it('A-B-A 参数往返：B 键重切，回到 A 键命中并复用首轮 Blob', async () => {
    const harness = createHarness()
    const item = harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    const aBlobs = item.tiles.map((tile) => tile.blob)
    expect(harness.produced).toHaveLength(4)

    harness.plan.value = plan2x1()
    await harness.slicer.processAll(false)
    expect(harness.produced).toHaveLength(6)
    expect(item.tiles).toHaveLength(2)
    const bBlobs = item.tiles.map((tile) => tile.blob)

    harness.plan.value = plan2x2()
    await harness.slicer.processAll(false)
    expect(harness.produced).toHaveLength(6) // A 键命中
    expect(item.tiles).toHaveLength(4)
    item.tiles.forEach((tile, index) => expect(tile.blob).toBe(aBlobs[index]))
    // B 条目仍独立保留在缓存中（未被 A 命中破坏）
    expect(bBlobs).toHaveLength(2)
  })

  /**
   * Given：一次生成仍在进行（produceTile 挂起）
   * When：同一图片第二个 ensureTiles 并发到达
   * Then：两请求共享同一次生成——produceTile 每矩形只执行一次，两者物料化结果 Blob 一致
   * 防回归：并发同键各自生成会重复裁切并互相覆盖展示
   */
  it('in-flight 合并：并发同键生成只执行一次且结果共享', async () => {
    const harness = createHarness()
    const item = harness.addImage('img-a', 'photo')
    const pending: Array<(b: Blob | null) => void> = []
    harness.setGate(() => new Promise<Blob | null>((resolve) => pending.push(resolve)))

    const first = harness.slicer.ensureTiles(item)
    const second = harness.slicer.ensureTiles(item)
    await new Promise((r) => setTimeout(r, 0))
    expect(pending.length).toBeGreaterThan(0)

    for (;;) {
      await new Promise((r) => setTimeout(r, 0))
      if (!pending.length) break
      pending.shift()!(new Blob(['gate']))
    }
    const tilesA = await first
    const tilesB = await second

    expect(tilesA).toHaveLength(4)
    expect(tilesB).toHaveLength(4)
    // 总数恰为 leader 一轮的 4 个矩形：跟随者若重新生成会额外产出 4 个（共 8），此断言即防回归
    expect(harness.produced).toHaveLength(4)
    expect(new Set(harness.produced.map((call) => call.key)).size).toBe(1) // 同一键
    tilesA!.forEach((tile, index) => expect(tile.blob).toBe(tilesB![index]!.blob))
    expect(tilesA![0]!.previewUrl).not.toBe(tilesB![0]!.previewUrl) // 各自物料化独立 URL
  })

  /**
   * Given：旧参数（2 x 2）结果已展示，分割线已改为 2 x 1
   * When：新键生成途中第二个矩形产出失败（produceTile 抛错）
   * Then：错误上抛为 processingFailed，旧 tiles 与旧 URL 原样保留，新键不入缓存
   * 防回归：revoke-first 旧逻辑会在失败时清空用户已看到的结果
   */
  it('生成失败：保留旧结果与旧 URL，不入缓存并报 processingFailed', async () => {
    const harness = createHarness()
    const item = harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    const oldUrls = item.tiles.map((tile) => tile.previewUrl)
    const oldTiles = item.tiles

    harness.plan.value = plan2x1()
    harness.setGate(async (callIndex) => {
      if (callIndex > 4 && callIndex <= 5) throw new Error('compress exploded')
      return new Blob(['late'])
    })
    await harness.slicer.processAll(false)

    expect(harness.slicer.state.errorKey).toBe('processingFailed')
    expect(item.tiles).toBe(oldTiles) // 旧结果原样保留
    expect(item.tiles.map((tile) => tile.previewUrl)).toEqual(oldUrls)
    expect(harness.revokedUrls).not.toContain(oldUrls[0])
    expect(harness.cache.stats().entries).toBe(1) // 仅旧键在缓存
    expect(harness.slicer.state.processing).toBe(false)
  })

  /**
   * Given：生成进行中用户点击取消（cancelProcessing）
   * When：当前 tile 完成后循环检测到取消
   * Then：不完整结果被放弃——不物料化、不换装、不入缓存，状态回到 manual 且 processing 复位
   * 防回归：取消的部分结果入缓存或换装会展示残缺切片
   */
  it('取消：不完整结果不入缓存不换装，processing 正确复位', async () => {
    const harness = createHarness()
    const item = harness.addImage('img-a', 'photo')
    harness.setGate(async () => {
      harness.slicer.cancelProcessing()
      return new Blob(['partial'])
    })
    await harness.slicer.processAll(false)

    expect(harness.produced).toHaveLength(1) // 第一个 tile 产出后即取消
    expect(item.tiles).toHaveLength(0) // 未换装
    expect(harness.cache.stats()).toEqual({ entries: 0, blobBytes: 0 })
    expect(harness.slicer.state.processing).toBe(false)
    expect(harness.slicer.state.cancelRequested).toBe(false)
  })

  /**
   * Given：ensureTiles 生成进行中
   * When：生效参数在生成结束前被修改（slicePlan 变更 → 结束快照与发起快照不一致）
   * Then：stale 结果被放弃——返回 null、不入缓存、不换装，已完成的生成工作自然终止后丢弃
   * 防回归：过期结果入缓存或换装会让展示与缓存停留在已被取代的旧参数上
   */
  it('stale：生成结束前参数变化则结果被放弃（null、不入缓存、不换装）', async () => {
    const harness = createHarness()
    const item = harness.addImage('img-a', 'photo')
    const pending: Array<(b: Blob | null) => void> = []
    harness.setGate(() => new Promise<Blob | null>((resolve) => pending.push(resolve)))

    const run = harness.slicer.ensureTiles(item)
    await new Promise((r) => setTimeout(r, 0))
    // 生成途中参数变化：结束快照与发起快照不再一致
    harness.plan.value = plan2x1()
    for (;;) {
      await new Promise((r) => setTimeout(r, 0))
      if (!pending.length) break
      pending.shift()!(new Blob(['stale-work']))
    }
    const result = await run

    expect(result).toBeNull()
    expect(item.tiles).toHaveLength(0)
    expect(harness.cache.stats()).toEqual({ entries: 0, blobBytes: 0 })
    expect(harness.produced).toHaveLength(4) // 旧参数的生成工作已完成但被丢弃
  })

  /**
   * Given：一轮生成仍在进行
   * When：处理期间再次调用 processAll（latest-wins 新请求）
   * Then：请求不被静默丢弃而是置补跑标记；首轮结束后自动补跑一轮并命中缓存收敛，无重复生成
   * 防回归：旧 state.processing 守卫会把处理期间到达的新一轮请求静默吞掉
   */
  it('latest-wins：处理中的新 processAll 请求触发补跑且补跑命中不重切', async () => {
    const harness = createHarness()
    harness.addImage('img-a', 'photo')
    const pending: Array<(b: Blob | null) => void> = []
    harness.setGate(() => new Promise<Blob | null>((resolve) => pending.push(resolve)))

    const first = harness.slicer.processAll(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(harness.slicer.state.processing).toBe(true)

    const second = harness.slicer.processAll(false) // 处理中到达：置补跑标记
    expect(harness.slicer.state.processing).toBe(true)

    for (;;) {
      await new Promise((r) => setTimeout(r, 0))
      if (!pending.length) break
      pending.shift()!(new Blob(['gate']))
    }
    await Promise.all([first, second])

    expect(harness.slicer.state.processing).toBe(false)
    expect(harness.produced).toHaveLength(4) // 补跑轮全量命中，无重复生成
    expect(harness.slicer.images.value[0]!.tiles).toHaveLength(4)
  })

  /**
   * Given：处理进行中拖拽追加了新图片（程序化触发新一轮请求）
   * When：追加图片后调用 processAll
   * Then：追加的图片不丢失——补跑轮为新增图片生成切片，已有图片直接复用
   * 防回归：处理中追加图片曾被 processing 守卫静默吞掉，新图永远不生成
   */
  it('处理中追加图片经补跑标记真实生成，不丢失', async () => {
    const harness = createHarness()
    harness.addImage('img-a', 'photo')
    const pending: Array<(b: Blob | null) => void> = []
    harness.setGate(() => new Promise<Blob | null>((resolve) => pending.push(resolve)))

    const first = harness.slicer.processAll(false)
    await new Promise((r) => setTimeout(r, 0))
    harness.addImage('img-b', 'other')
    const rerun = harness.slicer.processAll(false) // 处理中到达：置补跑标记

    for (;;) {
      await new Promise((r) => setTimeout(r, 0))
      if (!pending.length) break
      pending.shift()!(new Blob(['gate']))
    }
    await Promise.all([first, rerun])

    expect(harness.slicer.images.value).toHaveLength(2)
    expect(harness.slicer.images.value[0]!.tiles).toHaveLength(4)
    expect(harness.slicer.images.value[1]!.tiles).toHaveLength(4)
    expect(harness.produced).toHaveLength(8) // img-a 4 个 + img-b 4 个，img-a 无重复
  })

  /**
   * Given：单图下载的全新生成进行中（produceTile 挂起、HeroSection 重置按钮在 processing 中不禁用）
   * When：用户点击重置（resetApp 清空队列并 revoke 全部 tile URL）后，迟到的生成完成
   * Then：downloadSingleImage 检测到条目脱离队列立即放弃——不覆盖 waiting 状态、
   *       不对（可能已被回收 URL 的）tiles 触发下载、不上报 traditional 成功报告
   * 防回归：旧实现无条件 setStatus('manual') + downloadTiles([target])，对已回收 URL 的
   *         下载全部静默失败却上报 triggered:N 与成功报告，覆盖重置后的 waiting 状态
   */
  it('单图下载重置竞态：条目脱离队列后不触发下载也不覆盖状态', async () => {
    const harness = createHarness({ plan: plan1x1() })
    const item = harness.addImage('img-a', 'photo')
    const pending: Array<(b: Blob | null) => void> = []
    harness.setGate(() => new Promise<Blob | null>((resolve) => pending.push(resolve)))

    const run = harness.slicer.downloadSingleImage(item.id)
    await new Promise((r) => setTimeout(r, 0))
    expect(harness.slicer.state.processing).toBe(true)

    // 生成挂起期间重置：队列清空、缓存清空、状态复位 waiting
    harness.slicer.resetApp()
    expect(harness.slicer.images.value).toHaveLength(0)

    pending.shift()!(new Blob(['late']))
    await run

    // 状态保持 resetApp 设置的 waiting；无 traditional 下载报告；未误报 triggered
    expect(harness.slicer.statusText.value).toBe('waiting')
    expect(harness.slicer.exportProgress.report).toBeNull()
    expect(harness.slicer.statusState.key).toBe('waiting')
  })

  /**
   * Given：目录导出已授权（window.showDirectoryPicker 桩返回可控句柄）且 tiles 已生成
   * When：writeFiles 写入挂起期间用户重置（resetApp 清空队列并置 waiting），随后写入以 partial 收尾
   * Then：writeTilesToDirectory 检测到空队列立即返回——不回填 pendingTraditionalDownloads、
   *       不覆盖 waiting 状态、不补发导出报告
   * 防回归：无条件走 partial/complete 分支会让重置后的空工作区凭空出现
   *         "部分失败待重试"与导出报告，违背"重置清空待交付下载状态"的要求
   */
  it('目录导出期间重置：writeFiles 返回后不回填待交付下载与报告', async () => {
    // 可控目录句柄：首个 getFileHandle 探测调用挂起（模拟写入耗时窗口），
    // 释放后返回 NotFoundError（名字可用）→ create 调用失败 → writeFiles 以 partial 收尾
    let releaseWrite: (() => void) | null = null
    let probeCalls = 0
    const handle = {
      queryPermission: async () => 'granted' as PermissionState,
      requestPermission: async () => 'granted' as PermissionState,
      getFileHandle: (_name: string, options?: { create?: boolean }) => {
        probeCalls += 1
        if (probeCalls === 1) {
          return new Promise<never>((_, reject) => { releaseWrite = () => reject(new DOMException('nf', 'NotFoundError')) })
        }
        if (options?.create) return Promise.reject(new Error('disk full'))
        return Promise.reject(new DOMException('nf', 'NotFoundError'))
      },
    }
    ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => handle

    try {
      const harness = createHarness({ plan: plan1x1() })
      const item = harness.addImage('img-a', 'photo')
      await harness.slicer.processAll(false)
      expect(item.tiles).toHaveLength(1)

      const run = harness.slicer.triggerDownloads()
      // 等待写入真正挂起（getFileHandle 探测调用已阻塞）
      await vi.waitFor(() => { expect(releaseWrite).not.toBeNull() })
      // 写入挂起期间重置：队列清空、待交付下载清空、状态复位 waiting
      harness.slicer.resetApp()

      releaseWrite!()
      await run

      expect(harness.slicer.images.value).toHaveLength(0)
      expect(harness.slicer.pendingTraditionalDownloads.value).toBeNull()
      expect(harness.slicer.exportProgress.report).toBeNull()
      expect(harness.slicer.statusState.key).toBe('waiting')
    } finally {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
    }
  })

  /**
   * Given：autoDownload 已开启，处理中的旧请求 autoDownloadNow=false（拖动分割线的 watcher 调用）
   * When：处理期间到达带 autoDownloadNow=true 的新 processAll 请求（addFiles 上传轮）
   * Then：补跑轮采用被阻塞请求的实参——生成完成后进入目录/传统下载，导出意图不被丢弃
   * 防回归：补跑轮沿用首轮实参会让阻塞调用的导出意图静默丢失（latest-wins 只兑现生成一半）
   */
  it('latest-wins 补跑采用被阻塞请求的实参', async () => {
    const harness = createHarness()
    harness.addImage('img-a', 'photo')
    const pending: Array<(b: Blob | null) => void> = []
    harness.setGate(() => new Promise<Blob | null>((resolve) => pending.push(resolve)))

    // 首轮：autoDownloadNow=false（模拟分割线 watcher 的 processAll(false)）
    const first = harness.slicer.processAll(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(harness.slicer.state.processing).toBe(true)

    // 处理中到达的新请求：autoDownloadNow=true（模拟 addFiles 的 processAll(true, true)）
    const second = harness.slicer.processAll(true, true)

    for (;;) {
      await new Promise((r) => setTimeout(r, 0))
      if (!pending.length) break
      pending.shift()!(new Blob(['gate']))
    }
    await Promise.all([first, second])

    // 补跑轮以 autoDownloadNow=true 执行：生成后进入下载路径并触发 traditional 报告
    expect(harness.slicer.exportProgress.report?.mode).toBe('traditional')
    expect(harness.slicer.statusState.key).toBe('triggered')
  })

  /**
   * Given：trackProgress=false 的生成轮（如 autoDownload 关闭时的 addFiles 上传轮）且旧结果已展示
   * When：新一轮生成失败（produceTile 抛错）
   * Then：仅上报 processingFailed 错误，不弹出 generation 失败报告（phase 不进入 report），旧结果保留
   * 防回归：缺少 trackProgress 检查会让无进度请求也弹报告，且 pending>0 使报告常驻需手动关闭
   */
  it('trackProgress=false 的失败不弹出导出报告', async () => {
    const harness = createHarness({ plan: plan2x1() })
    const item = harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    expect(item.tiles).toHaveLength(2)

    // 换键触发新一轮真实生成，生成环境直接抛错
    harness.plan.value = { ...harness.plan.value, horizontalLines: [0.25] }
    harness.setGate(async () => { throw new Error('boom') })

    await harness.slicer.processAll(false, false)

    expect(harness.slicer.state.errorKey).toBe('processingFailed')
    expect(harness.slicer.exportProgress.report).toBeNull()
    expect(harness.slicer.exportProgress.phase).not.toBe('report')
    expect(item.tiles).toHaveLength(2) // 旧结果保留
  })

  /**
   * Given：一轮生成仍在进行
   * When：处理期间用户执行重置（清空队列与缓存），迟到的生成工作随后完成
   * Then：不向已重置的空工作区回填任何 tiles，缓存保持为空，processing 正确复位
   * 防回归：stale 完成回填重置状态会让"已清空"的工作区凭空出现旧结果
   */
  it('重置竞态：迟到完成不回填空工作区也不入缓存', async () => {
    const harness = createHarness()
    harness.addImage('img-a', 'photo')
    const pending: Array<(b: Blob | null) => void> = []
    harness.setGate(() => new Promise<Blob | null>((resolve) => pending.push(resolve)))

    const run = harness.slicer.processAll(false)
    await new Promise((r) => setTimeout(r, 0))
    harness.slicer.resetApp()
    expect(harness.slicer.images.value).toHaveLength(0)
    expect(harness.cache.stats()).toEqual({ entries: 0, blobBytes: 0 })

    pending.shift()!(new Blob(['late']))
    for (;;) {
      await new Promise((r) => setTimeout(r, 0))
      if (!pending.length) break
      pending.shift()!(new Blob(['late']))
    }
    await run

    expect(harness.slicer.images.value).toHaveLength(0)
    expect(harness.cache.stats()).toEqual({ entries: 0, blobBytes: 0 })
    expect(harness.slicer.state.processing).toBe(false)
    expect(harness.slicer.statusText.value).toBe('waiting')
  })

  /**
   * Given：首轮生成已完成并展示（2 x 2，4 tile）
   * When：把网格改为 2 x 1 并在新键生成挂起期间观察 tiles 与 URL，随后放行生成
   * Then：挂起期间旧 tiles/URL 原样展示；成功后一次性换装并才回收旧 URL（原子换装）
   * 防回归：revoke-first 旧逻辑存在 URL 失效空窗，失败时用户结果被清空
   */
  it('原子换装：生成期间保留旧展示，成功后先替换再回收旧 URL', async () => {
    const harness = createHarness()
    const item = harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    const oldUrls = item.tiles.map((tile) => tile.previewUrl)

    harness.plan.value = plan2x1()
    const pending: Array<(b: Blob | null) => void> = []
    harness.setGate(() => new Promise<Blob | null>((resolve) => pending.push(resolve)))
    const run = harness.slicer.processAll(false)
    await new Promise((r) => setTimeout(r, 0))

    // 挂起期间：旧结果原样展示，旧 URL 未被回收
    expect(item.tiles.map((tile) => tile.previewUrl)).toEqual(oldUrls)
    expect(harness.revokedUrls).not.toContain(oldUrls[0])
    expect(item.tiles).toHaveLength(4)

    for (;;) {
      await new Promise((r) => setTimeout(r, 0))
      if (!pending.length) break
      pending.shift()!(new Blob(['gate']))
    }
    await run

    expect(item.tiles).toHaveLength(2)
    expect(item.tiles.every((tile) => !oldUrls.includes(tile.previewUrl))).toBe(true)
    oldUrls.forEach((url) => expect(harness.revokedUrls).toContain(url)) // 成功后才回收
    expect(harness.slicer.state.errorKey).toBe('none')
  })

  /**
   * Given：全部切片均已命中缓存（tilesKey 同键复用）
   * When：再次 processAll
   * Then：进度阶段从不进入 generating，直接以 generation 报告收尾
   * 防回归：全量命中仍闪现假生成进度会误导用户等待
   */
  it('全量命中跳过 generating 阶段', async () => {
    const harness = createHarness()
    harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    const phases = recordProgress(harness.slicer)

    await harness.slicer.processAll(false)

    expect(phases.some((snap) => snap.phase === 'generating')).toBe(false)
    expect(phases.some((snap) => snap.phase === 'report')).toBe(true)
  })

  /**
   * Given：第一张图已生成，追加第二张未生成图后触发生成
   * When：processAll 部分命中运行
   * Then：generating 阶段总数只按未命中 tile 数计（4 而非 8），报告 completed/total 覆盖全部切片
   * 防回归：部分命中按全量计数会让进度条倒退或虚高
   */
  it('部分命中按未命中 tile 计数，报告覆盖全部切片', async () => {
    const harness = createHarness()
    harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    harness.addImage('img-b', 'other')
    const phases = recordProgress(harness.slicer)

    await harness.slicer.processAll(false)

    const generatingTotals = [...new Set(phases.filter((snap) => snap.phase === 'generating').map((snap) => snap.total))]
    expect(generatingTotals).toEqual([4]) // 只有 img-b 的 4 个未命中
    const report = harness.slicer.exportProgress.report
    expect(report?.mode).toBe('generation')
    expect(report?.completed).toBe(8)
    expect(report?.total).toBe(8)
  })

  /**
   * Given：已生成并缓存的队列（1 x 1，避免逐张下载延时拖慢用例）
   * When：点击"下载全部"（无目录选择器环境 → 传统下载路径）
   * Then：缓存全量命中不重复生成，切片经既有传统下载路径触发，报告为 traditional
   * 防回归：下载全部若绕过 ensure 会重复裁切已缓存内容
   */
  it('下载全部：全量命中不重复生成且走传统下载', async () => {
    const harness = createHarness({ plan: plan1x1() })
    harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    expect(harness.produced).toHaveLength(1)

    await harness.slicer.triggerDownloads()

    expect(harness.produced).toHaveLength(1) // 无重复生成
    expect(harness.slicer.exportProgress.report?.mode).toBe('traditional')
    expect(harness.slicer.statusText.value).toBe('triggered:1')
  })

  /**
   * Given：已生成并缓存的队列
   * When：单图下载（downloadSingleImage）
   * Then：复用现有 tiles 不重切（无 generating 阶段），切片经传统下载触发
   * 防回归：单图下载曾 revoke 旧 URL 后整体重切，与缓存语义冲突
   */
  it('单图下载：复用已物料化 tiles 不重切且无 generating 阶段', async () => {
    const harness = createHarness({ plan: plan1x1() })
    const item = harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    const phases = recordProgress(harness.slicer)
    const tilesRef = item.tiles

    await harness.slicer.downloadSingleImage(item.id)

    expect(harness.produced).toHaveLength(1) // 不重切
    expect(item.tiles).toBe(tilesRef)
    expect(phases.some((snap) => snap.phase === 'generating')).toBe(false)
    expect(harness.slicer.exportProgress.report?.mode).toBe('traditional')
  })

  /**
   * Given：真实 File 上传（fileSha256 内容标识 + loadImage 桩）
   * When：addFiles 两次上传同一内容的文件
   * Then：首次生成 4 tile 并入缓存；再次上传被内容去重跳过且不触发重复生成
   * 防回归：上传链路若绕过 ensure 或去重，会产生重复条目与重复裁切
   */
  it('addFiles 上传生成入缓存，重复上传同内容文件被去重', async () => {
    const harness = createHarness()
    const file = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'vacation.png', { type: 'image/png' })

    await harness.slicer.addFiles([file])
    expect(harness.slicer.images.value).toHaveLength(1)
    expect(harness.slicer.images.value[0]!.baseName).toBe('vacation')
    expect(harness.slicer.images.value[0]!.tiles).toHaveLength(4)
    expect(harness.cache.stats().entries).toBe(1)
    const producedFirst = harness.produced.length
    expect(producedFirst).toBe(4)

    await harness.slicer.addFiles([file])
    expect(harness.slicer.images.value).toHaveLength(1) // 内容标识去重
    expect(harness.produced).toHaveLength(producedFirst) // 无重复生成
  })

  /**
   * Given：注入 selectedPreset 为带写审计的依赖（捕获任何 value 赋值）
   * When：执行 resetApp
   * Then：图片、URL、待交付下载与缓存全部清空，而 selectedPreset 零写入（死代码已删）、
   *       分割线/格式/质量等配置依赖原样保留
   * 防回归：selectedPreset.value = selectedPreset.value 死代码会触发无意义的响应式写入
   */
  it('resetApp 清空工作区与缓存但保留全部处理配置，selectedPreset 零写入', async () => {
    let presetWrites = 0
    let presetValue: GridPreset = { cols: 3, rows: 3 }
    const auditedPreset = {
      get value() { return presetValue },
      set value(next: GridPreset) { presetWrites += 1; presetValue = next },
    } as { value: GridPreset }
    const harness = createHarness({ selectedPreset: auditedPreset })
    harness.plan.value = { ...plan2x2(), horizontalLines: [0.25] }
    harness.format.value = 'jpg'
    harness.quality.value = 0.7
    const item = harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    harness.slicer.pendingTraditionalDownloads.value = item.tiles.slice(0, 1)
    const tileUrl = item.tiles[0]!.previewUrl

    harness.slicer.resetApp()

    expect(harness.slicer.images.value).toHaveLength(0)
    expect(harness.revokedUrls).toContain(tileUrl)
    expect(harness.slicer.pendingTraditionalDownloads.value).toBeNull()
    expect(harness.cache.stats()).toEqual({ entries: 0, blobBytes: 0 })
    // 处理配置全部保留
    expect(presetWrites).toBe(0) // 死代码自赋值已删除
    expect(presetValue).toEqual({ cols: 3, rows: 3 })
    expect(harness.plan.value.horizontalLines).toEqual([0.25])
    expect(harness.format.value).toBe('jpg')
    expect(harness.quality.value).toBe(0.7)
  })

  /**
   * Given：已生成并缓存的队列
   * When：resetApp 后以相同参数重新生成
   * Then：缓存未命中（已清空）触发完整重切
   * 防回归：重置后缓存残留会让"重置"语义失效
   */
  it('重置后重新生成必然重切（缓存确已清空）', async () => {
    const harness = createHarness({ plan: plan1x1() })
    harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    expect(harness.produced).toHaveLength(1)

    harness.slicer.resetApp()
    harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)
    expect(harness.produced).toHaveLength(2) // 重置后重切
  })

  /**
   * Given：组合函数持有已物料的队列与缓存
   * When：卸载时调用 dispose()
   * Then：全部 URL 回收、缓存清空、队列清空，可安全释放组件持有的资源
   * 防回归：卸载不清理会泄漏 Object URL 与缓存 Blob 引用
   */
  it('dispose 回收全部 URL 并清空缓存与队列', async () => {
    const harness = createHarness()
    const item = harness.addImage('img-a', 'photo')
    await harness.slicer.processAll(false)

    harness.slicer.dispose()

    expect(harness.slicer.images.value).toHaveLength(0)
    expect(harness.cache.stats()).toEqual({ entries: 0, blobBytes: 0 })
    item.tiles.forEach((tile) => expect(harness.revokedUrls).toContain(tile.previewUrl))
    expect(harness.revokedUrls).toContain(item.objectUrl)
  })
})
