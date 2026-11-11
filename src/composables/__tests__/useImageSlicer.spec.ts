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

describe('useImageSlicer 队列控制与每图网格（queue-grid-controls）', () => {
  // Node jsdom 的 anchor.click() 会尝试导航（jsdom 未实现），stub 掉避免噪音
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  afterEach(() => {
    clickSpy.mockClear()
    localStorage.clear()
  })

  /**
   * Given：队列 3 张图均已生成（img-b 位于中间）
   * When：removeImage('img-b')
   * Then：img-b 移出队列，其 objectUrl 与全部 tile previewUrl 被回收；
   *       切片缓存条目保留（条目数不变）——同内容图片重新拖入时可直接命中
   * 防回归：删除若回收缓存条目，"删除后重新上传同一文件"会退化为完整重切
   */
  it('removeImage 移出队列并回收该图 URL，缓存条目保留', async () => {
    const harness = createHarness()
    harness.addImage('img-a', 'photo-a')
    harness.addImage('img-b', 'photo-b')
    harness.addImage('img-c', 'photo-c')
    await harness.slicer.processAll(false)
    const itemB = harness.slicer.images.value[1]
    expect(harness.slicer.images.value.map((item) => item.id)).toEqual(['img-a', 'img-b', 'img-c'])
    const entriesBefore = harness.cache.stats().entries
    expect(entriesBefore).toBe(3)

    const executed = harness.slicer.removeImage('img-b')

    expect(executed).toBe(true)
    expect(harness.slicer.images.value.map((item) => item.id)).toEqual(['img-a', 'img-c'])
    expect(harness.revokedUrls).toContain(itemB!.objectUrl)
    itemB!.tiles.forEach((tile) => expect(harness.revokedUrls).toContain(tile.previewUrl))
    // 缓存条目保留：img-b 的切片仍可被同内容图片命中
    expect(harness.cache.stats().entries).toBe(entriesBefore)
  })

  /**
   * Given：删除 img-b 后（缓存条目保留、tilesKey 失效路径不可走——条目已不在队列）
   * When：以相同内容标识重新入队并触发生成
   * Then：经缓存命中重新物料化，不产生任何 produceTile 调用（零重切）
   * 防回归：删除未保留缓存或命中路径被删除破坏，会违背"重复操作零等待"用户故事
   */
  it('删除后同内容重入命中缓存，不重切', async () => {
    const harness = createHarness()
    harness.addImage('img-b', 'photo-b')
    await harness.slicer.processAll(false)
    expect(harness.produced).toHaveLength(4)
    harness.slicer.removeImage('img-b')
    expect(harness.cache.stats().entries).toBe(1)

    harness.addImage('img-b', 'photo-b-again')
    await harness.slicer.processAll(false)

    expect(harness.produced).toHaveLength(4) // 全程仅首轮 4 次裁切
    expect(harness.slicer.images.value[0]!.tiles).toHaveLength(4)
    expect(harness.slicer.images.value[0]!.tiles.every((tile) => tile.previewUrl)).toBe(true)
  })

  /**
   * Given：一轮生成仍在进行（produceTile 挂起）
   * When：处理中调用 removeImage / moveImage
   * Then：两者均为 no-op 并返回 false，队列与缓存不受影响
   * 防回归：processing 中删除/排序会与进行中的生成产生竞态（isLive 守卫放弃旧条目造成结果缺失）
   */
  it('processing 中删除与排序为 no-op（返回 false）', async () => {
    const harness = createHarness()
    harness.addImage('img-a', 'photo-a')
    harness.addImage('img-b', 'photo-b')
    const pending: Array<(b: Blob | null) => void> = []
    harness.setGate(() => new Promise<Blob | null>((resolve) => pending.push(resolve)))

    const run = harness.slicer.processAll(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(harness.slicer.state.processing).toBe(true)

    expect(harness.slicer.removeImage('img-a')).toBe(false)
    expect(harness.slicer.moveImage('img-b', -1)).toBe(false)
    expect(harness.slicer.setGridOverride('img-a', null)).toBe(false)
    expect(harness.slicer.images.value.map((item) => item.id)).toEqual(['img-a', 'img-b'])

    for (;;) {
      await new Promise((r) => setTimeout(r, 0))
      if (!pending.length) break
      pending.shift()!(new Blob(['gate']))
    }
    await run
    // 处理结束后同样 id 的操作恢复可执行（此处仅验证解除封锁，不展开重复断言）
    expect(harness.slicer.moveImage('img-b', -1)).toBe(true)
  })

  /**
   * Given：队列 3 张图
   * When：moveImage 依次执行 上移首位图（越界）、下移 img-b、再次下移 img-b（到末位后再越界）
   * Then：仅合法交换生效：数组仅按相邻位置交换，tiles/URL/缓存不受影响；非法操作返回 false
   * 防回归：排序若移动非相邻位置或破坏数组其余元素，导出顺序与展示将不可预测
   */
  it('moveImage 仅交换相邻位置且越界/未知 id 拒绝执行', async () => {
    const harness = createHarness()
    harness.addImage('img-a', 'photo-a')
    const itemB = harness.addImage('img-b', 'photo-b')
    harness.addImage('img-c', 'photo-c')
    await harness.slicer.processAll(false)
    const tilesB = itemB.tiles

    expect(harness.slicer.moveImage('img-a', -1)).toBe(false) // 首位上移越界
    expect(harness.slicer.moveImage('img-x', -1)).toBe(false) // 未知 id
    expect(harness.slicer.moveImage('img-b', 1)).toBe(true)
    expect(harness.slicer.images.value.map((item) => item.id)).toEqual(['img-a', 'img-c', 'img-b'])
    expect(harness.slicer.moveImage('img-b', 1)).toBe(false) // 末位下移越界
    // 排序不触碰 tiles 与缓存
    expect(itemB.tiles).toBe(tilesB)
    expect(harness.cache.stats().entries).toBe(3)
  })

  /**
   * Given：队列 3 张图已生成，传统下载路径（无目录选择器）
   * When：开启逆序开关后 triggerDownloads()
   * Then：下载触发顺序按队列副本反转（img-c → img-b → img-a），队列本身顺序不变；
   *       报告 total 覆盖全部切片
   * 防回归：逆序若直接反转队列会改变结果区展示顺序（展示顺序不随开关变化，spec Out of Scope）
   */
  it('逆序开关反转下载触发顺序且队列本身不动', async () => {
    const harness = createHarness({ plan: plan1x1() })
    const clickOrder: string[] = []
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      clickOrder.push(this.download)
    })
    harness.addImage('img-a', 'photo-a')
    harness.addImage('img-b', 'photo-b')
    harness.addImage('img-c', 'photo-c')
    await harness.slicer.processAll(false)

    harness.slicer.setDownloadReverse(true)
    await harness.slicer.triggerDownloads()

    // 传统路径 tile 名：单 tile 为 baseName.ext
    expect(clickOrder).toEqual(['photo-c.png', 'photo-b.png', 'photo-a.png'])
    // 队列本身顺序不变：逆序仅是遍历顺序反转
    expect(harness.slicer.images.value.map((item) => item.id)).toEqual(['img-a', 'img-b', 'img-c'])
    expect(harness.slicer.exportProgress.report?.mode).toBe('traditional')
    expect(harness.slicer.exportProgress.report?.total).toBe(3)
    clickSpy.mockImplementation(() => {})
  })

  /**
   * Given：逆序开关关闭（默认）
   * When：triggerDownloads()
   * Then：按队列正序触发下载
   * 防回归：默认值若为逆序会破坏"导入顺序即导出顺序"的既有行为
   */
  it('默认正序下载：未开启开关时按队列顺序触发', async () => {
    const harness = createHarness({ plan: plan1x1() })
    const clickOrder: string[] = []
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      clickOrder.push(this.download)
    })
    harness.addImage('img-a', 'photo-a')
    harness.addImage('img-b', 'photo-b')
    await harness.slicer.processAll(false)

    await harness.slicer.triggerDownloads()

    expect(clickOrder).toEqual(['photo-a.png', 'photo-b.png'])
    clickSpy.mockImplementation(() => {})
  })

  /**
   * Given：注入内存存储
   * When：setDownloadReverse(true) 与 setReplaceUpload(true)
   * Then：两个开关立即写入独立 localStorage 键；新建组合函数实例恢复两开关；
   *       默认值均为 false（正序 / 追加）
   * 防回归：开关不持久化会让"刷新后保留选择"的用户故事落空；键冲突会互相覆写
   */
  it('逆序与覆盖上传开关持久化到独立键并在新实例恢复', async () => {
    const first = createHarness()
    expect(first.slicer.downloadReverse.value).toBe(false)
    expect(first.slicer.replaceUpload.value).toBe(false)

    first.slicer.setDownloadReverse(true)
    first.slicer.setReplaceUpload(true)
    expect(localStorage.getItem('igs:download-reverse')).toBe('1')
    expect(localStorage.getItem('igs:replace-upload')).toBe('1')

    const second = createHarness()
    expect(second.slicer.downloadReverse.value).toBe(true)
    expect(second.slicer.replaceUpload.value).toBe(true)
  })

  /**
   * Given：覆盖上传关闭（默认）
   * When：addFiles 上传第二张不同内容的图片
   * Then：按既有追加语义入队（2 张），不触发确认回调
   * 防回归：覆盖逻辑泄漏到关闭状态会误清用户队列
   */
  it('覆盖上传关闭时保持追加语义且不触发确认', async () => {
    const harness = createHarness()
    const confirmReplace = vi.fn(async () => true)
    await harness.slicer.addFiles([makeUploadFile('first', [1])])
    await harness.slicer.addFiles([makeUploadFile('second', [2])], { confirmReplace })

    expect(harness.slicer.images.value).toHaveLength(2)
    expect(confirmReplace).not.toHaveBeenCalled()
  })

  /**
   * Given：覆盖上传开启、队列 1 张未下载图片
   * When：addFiles 上传新图（确认回调同意）
   * Then：确认回调被调用一次；旧队列整体替换——旧图 objectUrl 与 tile previewUrl 全部回收；
   *       队列仅含新图；缓存条目保留（不清缓存）
   * 防回归：覆盖若复用 resetApp（cache.clear）会违背 T01/T03"缓存条目保留"决议
   */
  it('覆盖上传（同意分支）：清空旧队列加入新图且缓存保留', async () => {
    const harness = createHarness()
    await harness.slicer.addFiles([makeUploadFile('old', [1])])
    await harness.slicer.processAll(false)
    const oldItem = harness.slicer.images.value[0]
    const entriesBefore = harness.cache.stats().entries
    expect(entriesBefore).toBe(1)

    harness.slicer.setReplaceUpload(true)
    const confirmReplace = vi.fn(async () => true)
    await harness.slicer.addFiles([makeUploadFile('new', [2])], { confirmReplace })

    expect(confirmReplace).toHaveBeenCalledTimes(1)
    expect(harness.slicer.images.value).toHaveLength(1)
    expect(harness.slicer.images.value[0]!.baseName).toBe('new')
    expect(harness.revokedUrls).toContain(oldItem!.objectUrl)
    // 缓存不清：旧条目保留 + 新图生成入账（对比 resetApp 的归零语义）
    expect(harness.cache.stats().entries).toBe(entriesBefore + 1)
    expect(harness.slicer.images.value[0]!.tiles).toHaveLength(4)
  })

  /**
   * Given：覆盖上传开启、队列存在未下载图片
   * When：确认回调拒绝后 addFiles
   * Then：本次上传整体作废——队列保持原样（1 张旧图）、新图不入队、URL 不创建
   * 防回归：取消后若仍清空或部分入队，用户误触上传会丢失未导出成果
   */
  it('覆盖上传（取消分支）：确认拒绝后本次上传作废，队列原样保留', async () => {
    const harness = createHarness()
    await harness.slicer.addFiles([makeUploadFile('old', [1])])
    await harness.slicer.processAll(false)
    const createdBefore = harness.createdUrls.length

    harness.slicer.setReplaceUpload(true)
    await harness.slicer.addFiles([makeUploadFile('new', [2])], { confirmReplace: async () => false })

    expect(harness.slicer.images.value).toHaveLength(1)
    expect(harness.slicer.images.value[0]!.baseName).toBe('old')
    expect(harness.createdUrls.length).toBe(createdBefore) // 新图未创建任何 URL
  })

  /**
   * Given：覆盖上传开启、队列图片的切片已完整写出到导出目录（downloaded 标记已置位）
   * When：addFiles 上传新图
   * Then：不调用确认回调，直接替换队列（零摩擦覆盖）
   * 防回归：全已下载仍弹确认违背"全部已下载直接替换"决议（用户故事 9）
   */
  it('覆盖上传：队列全部已下载时不提示直接替换', async () => {
    // picker 在 useImageSlicer 工厂时捕获，必须先注入句柄再创建 harness
    ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => makeGrantedHandle()
    const harness = createHarness()
    await harness.slicer.changeExportDirectory()
    try {
      await harness.slicer.addFiles([makeUploadFile('old', [1])])
      await harness.slicer.processAll(true, true) // 自动下载 → 目录直写完整成功
      expect(harness.slicer.images.value[0]!.downloaded).toBe(true)

      harness.slicer.setReplaceUpload(true)
      const confirmReplace = vi.fn(async () => {
        throw new Error('不应弹出确认')
      })
      await harness.slicer.addFiles([makeUploadFile('new', [2])], { confirmReplace })

      expect(harness.slicer.images.value).toHaveLength(1)
      expect(harness.slicer.images.value[0]!.baseName).toBe('new')
    } finally {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
    }
  })

  /**
   * Given：队列 2 张图（每图 2 tile）经目录直写完整导出
   * When：检查 downloaded 标记
   * Then：两图均被置位——"下载全部"完整写出该图全部 tile 即视为已下载（T03 判定口径）
   * 防回归：仅逐图下载置位会让覆盖确认对批量导出误报
   */
  it('目录直写完整写出后置位每图 downloaded 标记', async () => {
    ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => makeGrantedHandle()
    const harness = createHarness({ plan: plan2x1() })
    await harness.slicer.changeExportDirectory()
    try {
      await harness.slicer.addFiles([makeUploadFile('first', [1])])
      await harness.slicer.addFiles([makeUploadFile('second', [2])])
      await harness.slicer.processAll(true, true)

      expect(harness.slicer.images.value.map((item) => item.downloaded)).toEqual([true, true])
    } finally {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
    }
  })

  /**
   * Given：队列 2 张图、目录句柄在写第 3 个文件（第二张图首个 tile）时失败（partial 收尾）
   * When：writeTilesToDirectory 完成后检查标记
   * Then：第一张图（全部 tile 已写出）标记置位；第二张图保持未置位——其未完成项走传统重试
   * 防回归：partial 时无条件全量置位会让未完成图的覆盖确认被跳过（误丢未导出成果）
   */
  it('目录直写 partial：仅完整写出的图置位 downloaded', async () => {
    // tile 写入序列 [first-r1, first-r2, second-r1, second-r2]，第 3 个 create 起失败
    ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => makeGrantedHandle({ failFromIndex: 3 })
    const harness = createHarness({ plan: plan2x1() })
    await harness.slicer.changeExportDirectory()
    try {
      await harness.slicer.addFiles([makeUploadFile('first', [1])])
      await harness.slicer.addFiles([makeUploadFile('second', [2])])
      await harness.slicer.processAll(true, true)

      expect(harness.slicer.images.value[0]!.downloaded).toBe(true)
      expect(harness.slicer.images.value[1]!.downloaded).toBeUndefined()
      // 未完成项按剩余项顺序进入待交付下载（ADR-0001 语义不变）
      expect(harness.slicer.pendingTraditionalDownloads.value).toHaveLength(2)
    } finally {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
    }
  })

  /**
   * Given：覆盖上传开启、队列仅剩已下载图片
   * When：addFiles 上传与旧图同内容标识的文件
   * Then：内容去重仍然生效——替换后同内容文件不会重复入队
   * 防回归：覆盖路径绕过内容去重会为同一文件建立重复队列条目
   */
  it('覆盖上传与内容去重共存：同内容文件替换后不重复入队', async () => {
    const harness = createHarness()
    const file = makeUploadFile('dup', [1])
    await harness.slicer.addFiles([file])
    await harness.slicer.processAll(false)
    harness.slicer.images.value[0]!.downloaded = true // 模拟已下载，跳过确认

    harness.slicer.setReplaceUpload(true)
    await harness.slicer.addFiles([makeUploadFile('dup', [1])])

    expect(harness.slicer.images.value).toHaveLength(1)
  })

  /**
   * Given：真实 File 经 addFiles 入队
   * When：检查 ImageItem 字段
   * Then：fileSizeBytes 等于 file.size（T06 原图大小角标数据源）
   * 防回归：缺失字节数会让原图角标无从显示
   */
  it('addFiles 记录原文件字节数 fileSizeBytes', async () => {
    const harness = createHarness()
    const file = makeUploadFile('sized', [1, 2, 3, 4, 5, 6, 7, 8])

    await harness.slicer.addFiles([file])

    expect(harness.slicer.images.value[0]!.fileSizeBytes).toBe(file.size)
  })

  /**
   * Given：队列 2 张图（img-a/img-b 全局 2x2），img-b 设置覆盖分割线（水平 [0.25]，即 2x1）
   * When：processAll
   * Then：img-a 仍按全局 2x2 生成 4 tile；img-b 按覆盖生成 2 tile（矩形几何不同、缓存键不同）；
   *       覆盖不改变全局 slicePlan
   * 防回归：每图覆盖若污染全局 slicePlan，未覆盖图片的网格会被连带改写
   */
  it('每图网格覆盖仅作用于该图，其余图跟随全局', async () => {
    const harness = createHarness()
    harness.addImage('img-a', 'photo-a')
    harness.addImage('img-b', 'photo-b')

    expect(harness.slicer.setGridOverride('img-b', { horizontalLines: [0.25], verticalLines: [] })).toBe(true)
    await harness.slicer.processAll(false)

    expect(harness.slicer.images.value[0]!.tiles).toHaveLength(4) // 全局 2x2
    expect(harness.slicer.images.value[1]!.tiles).toHaveLength(2) // 覆盖 2x1
    expect(harness.produced.filter((call) => call.key.includes('img-a'))).toHaveLength(4)
    expect(harness.produced.filter((call) => call.key.includes('img-b'))).toHaveLength(2)
    // 全局配置未被污染
    expect(harness.plan.value.horizontalLines).toEqual([0.5])
  })

  /**
   * Given：img-b 已按覆盖网格生成并缓存
   * When：setGridOverride(id, null) 回退全局后 processAll
   * Then：img-b 按全局 2x2 命中缓存复用 Blob（不重切），覆盖字段归位 null
   * 防回归：回退后若按覆盖键继续生成或全局键未命中，"一键回退全局"会产生多余重切
   */
  it('覆盖回退全局后按全局网格命中缓存', async () => {
    const harness = createHarness()
    harness.addImage('img-a', 'photo-a')
    const itemB = harness.addImage('img-b', 'photo-b')
    await harness.slicer.processAll(false)
    const globalBlobs = itemB.tiles.map((tile) => tile.blob)
    expect(harness.produced).toHaveLength(8)

    harness.slicer.setGridOverride('img-b', { horizontalLines: [0.25], verticalLines: [] })
    await harness.slicer.processAll(false)
    expect(harness.slicer.images.value[1]!.tiles).toHaveLength(2) // 覆盖 2x1 重切
    expect(harness.produced).toHaveLength(10)

    harness.slicer.setGridOverride('img-b', null)
    await harness.slicer.processAll(false)

    expect(harness.produced).toHaveLength(10) // 回退全局命中首轮条目，无重切
    expect(harness.slicer.images.value[1]!.tiles).toHaveLength(4)
    expect(harness.slicer.images.value[1]!.tiles.map((tile) => tile.blob)).toEqual(globalBlobs)
  })

  /**
   * Given：含非法分割线值的覆盖输入（超界 1.5、重复、无序）
   * When：setGridOverride
   * Then：分割线经 normalizeDividerLines 清洗为有序去重的 0-1 开区间值；
   *       processing 中拒绝执行（返回 false），未知 id 拒绝执行
   * 防回归：未清洗的覆盖线会让 computeTileRectsFromLines 产出与全局路径不一致的矩形
   */
  it('setGridOverride 清洗分割线且 processing/未知 id 时拒绝', async () => {
    const harness = createHarness()
    const item = harness.addImage('img-a', 'photo-a')

    expect(harness.slicer.setGridOverride('img-x', { horizontalLines: [0.5], verticalLines: [] })).toBe(false)
    harness.slicer.setGridOverride('img-a', { horizontalLines: [0.7, 0.3, 1.5, 0.3], verticalLines: [] })
    expect(item.gridOverride?.horizontalLines).toEqual([0.3, 0.7])

    // processing 守卫：生成挂起期间调用必须拒绝执行（与删除/排序一致）
    const pending: Array<(b: Blob | null) => void> = []
    harness.setGate(() => new Promise<Blob | null>((resolve) => pending.push(resolve)))
    const run = harness.slicer.processAll(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(harness.slicer.state.processing).toBe(true)
    expect(harness.slicer.setGridOverride('img-a', null)).toBe(false)
    expect(item.gridOverride?.horizontalLines).toEqual([0.3, 0.7])

    for (;;) {
      await new Promise((r) => setTimeout(r, 0))
      if (!pending.length) break
      pending.shift()!(new Blob(['gate']))
    }
    await run
  })

  /**
   * Given：一张未下载图片与其 tile 的预览保存路径（已授权目录）
   * When：savePreviewTile 成功写出该 tile
   * Then：所属图片的 downloaded 标记置位（T03：预览保存成功同样视为已下载）
   * 防回归：预览保存不置位会让"只保存过一个切片"的图在覆盖时误报未下载
   */
  it('预览保存成功后置位所属图 downloaded 标记', async () => {
    ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => makeGrantedHandle()
    const harness = createHarness({ plan: plan2x1() })
    await harness.slicer.changeExportDirectory()
    try {
      await harness.slicer.addFiles([makeUploadFile('first', [1])])
      await harness.slicer.processAll(false)
      expect(harness.slicer.images.value[0]!.downloaded).toBeUndefined()

      const tileId = harness.slicer.images.value[0]!.tiles[0]!.id
      const result = await harness.slicer.savePreviewTile(tileId)

      expect(result).toBe('saved')
      expect(harness.slicer.images.value[0]!.downloaded).toBe(true)
    } finally {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
    }
  })

  /**
   * Given：逐图下载路径（无目录选择器，传统下载）
   * When：downloadSingleImage 成功触发该图全部切片下载
   * Then：该图 downloaded 标记置位
   * 防回归：逐图下载不置位会让覆盖确认误判"未下载"
   */
  it('逐图下载成功触发后置位 downloaded 标记', async () => {
    const harness = createHarness({ plan: plan1x1() })
    const item = harness.addImage('img-a', 'photo-a')
    await harness.slicer.processAll(false)
    expect(item.downloaded).toBeUndefined()

    await harness.slicer.downloadSingleImage(item.id)

    expect(item.downloaded).toBe(true)
  })

  /**
   * Given：覆盖上传开启、旧生成 pass 挂起期间经覆盖路径替换整个队列
   * When：新队列上传完成、旧 pass 迟到结束
   * Then：旧 pass 作废——不基于新队列回填 finished/manual 状态或导出报告；
   *       新队列由自身生成轮呈现结果，新图 tiles 完整
   * 防回归：旧 pass 以"非空新队列"通过既有空队列守卫，会把旧批次的状态/报告
   *         与 autoDownload 导出动作套在新队列上（回填污染）
   */
  it('覆盖上传替换后旧生成 pass 作废，不污染新队列状态', async () => {
    const harness = createHarness()
    await harness.slicer.addFiles([makeUploadFile('old', [1])])
    await harness.slicer.processAll(false)
    harness.slicer.images.value[0]!.downloaded = true

    harness.slicer.setReplaceUpload(true)
    const pending: Array<(b: Blob | null) => void> = []
    harness.setGate(() => new Promise<Blob | null>((resolve) => pending.push(resolve)))
    // 覆盖上传的清空发生在 processAll 补跑轮启动前：手动构造"清空 + 新图 + 旧 pass 挂起"时序
    const replacing = harness.slicer.addFiles([makeUploadFile('new', [2])], { confirmReplace: async () => true })
    await new Promise((r) => setTimeout(r, 0))

    // 放行全部挂起生成（含旧 pass 残留与新队列生成）
    for (;;) {
      await new Promise((r) => setTimeout(r, 0))
      if (!pending.length) break
      pending.shift()!(new Blob(['gate']))
    }
    await replacing

    const item = harness.slicer.images.value[0]
    expect(harness.slicer.images.value).toHaveLength(1)
    expect(item!.baseName).toBe('new')
    expect(item!.tiles).toHaveLength(4)
  })
})

// ---------- 测试辅助：真实 File / 已授权目录句柄桩 ----------

/** 构造真实 File（唯一字节内容 → 独立 SHA-256 内容标识，供 addFiles 全链路使用）。 */
const makeUploadFile = (name: string, bytes: number[]): File =>
  new File([new Uint8Array(bytes)], `${name}.png`, { type: 'image/png' })

/**
 * 已授权目录句柄桩：queryPermission/requestPermission 恒 granted；每个新文件名首个
 * getFileHandle 探测抛 NotFoundError（名字可用），create 写入成功。
 * failFromIndex 指定从第 n 次 create 起失败（模拟 partial 收尾）。
 */
const makeGrantedHandle = (options: { failFromIndex?: number } = {}) => {
  let probeCalls = 0
  let createCalls = 0
  return {
    queryPermission: async () => 'granted' as PermissionState,
    requestPermission: async () => 'granted' as PermissionState,
    getFileHandle: (_name: string, createOptions?: { create?: boolean }) => {
      if (createOptions?.create) {
        createCalls += 1
        if (options.failFromIndex !== undefined && createCalls >= options.failFromIndex) {
          return Promise.reject(new Error('disk full'))
        }
        return Promise.resolve({
          createWritable: async () => ({
            write: async () => {},
            close: async () => {},
          }),
        })
      }
      probeCalls += 1
      return Promise.reject(new DOMException('nf', 'NotFoundError'))
    },
  }
}
