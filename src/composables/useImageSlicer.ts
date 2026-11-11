import imageCompression from 'browser-image-compression'
import { computed, reactive, ref } from 'vue'
import { computeTileRectsFromLines, normalizeDividerLines, type GridPreset, type SlicePlan, type TileRect } from '../utils/grid'
import type { LocaleMessages, ExportFormat } from './useLocale'
import { useDirectoryExport, type SaveAsResult } from './useDirectoryExport'
import { fileSha256 } from "../utils/fileUtils.ts";
import {
  SLICE_CACHE_ALGORITHM_VERSION,
  buildSliceCacheKey,
  createSliceResultCache,
  roundTileRect,
  type CachedSliceEntry,
  type SliceResultCache,
} from '../modules/sliceResultCache'

export interface TileResult {
  id: string
  name: string
  blob: Blob
  previewUrl: string
  row: number
  col: number
  width: number
  height: number
}

export interface ImageItem {
  id: string
  baseName: string
  objectUrl: string
  image: HTMLImageElement
  size: { width: number; height: number }
  tiles: TileResult[]
  /**
   * 当前 tiles 对应的缓存键（tilesKey === 当前键 ⇒ tiles 与 URL 可直接复用）。
   * 可选字段：保持既有构造方（组件测试、旧调用方）无需感知即可编译。
   */
  tilesKey?: string | null
  /** 原文件字节数（addFiles 时记录 file.size，供结果区大小角标显示） */
  fileSizeBytes?: number
  /**
   * 是否已将本图切片写出到用户设备：逐图下载成功触发、"下载全部"完整写完本图、
   * 预览保存成功后置位。覆盖上传以此判定是否需要替换确认；不持久化，随队列清空消失。
   */
  downloaded?: boolean
  /**
   * 每图网格覆盖：分割线（归一化 0-1 比例，与 SlicePlan 同构）。
   * 存在时本图按覆盖网格生成，null/undefined 回退全局 slicePlan；不持久化。
   */
  gridOverride?: GridOverride | null
}

/** 每图网格覆盖载荷：仅网格身份（分割线），不含边线擦除（仍为全局配置）。 */
export interface GridOverride {
  horizontalLines: number[]
  verticalLines: number[]
}

export type StatusKey =
  | 'waiting'
  | 'batchDownloading'
  | 'triggered'
  | 'processing'
  | 'finished'
  | 'manual'
  | 'loading'

export type ErrorKey = 'none' | 'invalidFile' | 'processingFailed' | 'loadFailed' | 'customGridInvalid'

export type ExportProgressPhase = 'hidden' | 'generating' | 'saving' | 'downloading' | 'report'

export interface ExportReport {
  mode: 'directory' | 'traditional' | 'generation'
  completed: number
  total: number
  renamed: number
  pending: number
}

export interface ExportProgress {
  phase: ExportProgressPhase
  current: number
  total: number
  report: ExportReport | null
}

/**
 * 一次生成的生效参数快照：发起时取一次、结束时各取一次，生成循环内部只读快照，
 * 绝不重读响应式设置（slicePlan/exportFormat/jpgQuality 仅在快照函数内触达一次）。
 */
export interface GenerationParams {
  /** 图片内容标识（fileSha256 摘要或元信息回退标识），即 item.id */
  imageIdentity: string
  /** 实际矩形序列：已过滤空矩形并经 roundTileRect 统一整数化（与 Canvas 绘制同值） */
  rects: TileRect[]
  /** 导出格式 */
  format: ExportFormat
  /** 仅 JPG 提供：0-1 小数质量 */
  jpgQuality?: number
  /** 由以上字段构造的缓存键（PNG 忽略质量；JPG 以整数百分比入键） */
  key: string
}

/**
 * 生成环境接缝：生产环境使用默认实现（Canvas 绘制/压缩、Object URL、图片加载），
 * 测试注入等价桩实现，避免依赖真实 Canvas、压缩 worker 与浏览器下载。
 */
export interface SliceEnvironment {
  /** 生效矩形计算（默认：computeTileRectsFromLines；过滤与 roundTileRect 整数化统一在快照层做）。
   *  overrideLines 为该图的每图网格覆盖（归一化分割线），缺省时按全局 slicePlan 计算。 */
  resolveRects(image: Pick<HTMLImageElement, 'naturalWidth' | 'naturalHeight'>, overrideLines?: GridOverride): TileRect[]
  /** 单矩形 → tile Blob（只允许消费 GenerationParams 快照；返回 null 表示无法产出，结果视为不完整） */
  produceTile(image: HTMLImageElement, rect: TileRect, params: GenerationParams): Promise<Blob | null>
  createObjectUrl(blob: Blob): string
  revokeObjectUrl(url: string): void
  /** objectUrl → 解码后图片元素（默认 new Image + onload；测试注入即时解析桩） */
  loadImage(objectUrl: string): Promise<HTMLImageElement>
}

interface ImageSlicerDeps {
  selectedPreset: { value: GridPreset }
  slicePlan: { value: SlicePlan }
  exportFormat: { value: ExportFormat }
  jpgQuality: { value: number }
  gridDescription: { value: string }
  currentMessages: { value: LocaleMessages }
  /** 测试接缝：注入切片结果缓存实例；缺省内部创建默认缓存（30 条 / 256 MiB） */
  cache?: SliceResultCache
  /** 测试接缝：覆写部分生成环境实现；缺省合并到默认实现上 */
  environment?: Partial<SliceEnvironment>
  /** 测试接缝：注入存储（内存实现或 null 禁用持久化）；缺省安全回退 window.localStorage */
  storage?: Storage | null
  /**
   * 覆盖上传确认回调（T03）：队列存在未下载图片且 replaceUpload 开启时，
   * onFileChange/onDrop 等内部上传路径经此请求用户确认；resolve(false) 取消本次上传。
   * 缺省直接同意（纯 composable 消费方无需 UI）；App.vue 注入 window.confirm 实现。
   */
  confirmReplacePrompt?: () => Promise<boolean>
}

export type PreviewSaveResult = 'saved' | 'fallback' | 'missing'

/** addFiles 可选项：覆盖上传的确认回调接缝（T03 决议），组件层实现 confirm UI。 */
export interface AddFilesOptions {
  /** 队列存在未下载图片时的确认回调；resolve(true) = 同意替换，false = 取消。缺省直接同意。 */
  confirmReplace?: () => Promise<boolean>
}

const AUTO_DOWNLOAD_KEY = 'igs:auto-download'
/** 下载全部遍历顺序开关（false = 正序）；独立键，不并入既有导出设置载荷 */
const DOWNLOAD_REVERSE_KEY = 'igs:download-reverse'
/** 覆盖上传开关（false = 追加）；独立键，与 T02 同风格持久化 */
const REPLACE_UPLOAD_KEY = 'igs:replace-upload'

/** ensure 钩子：进度计数与取消/失效判定（shouldCancel 同时承担"条目已脱离队列"的放弃判定）。 */
interface EnsureHooks {
  onTileGenerated?: () => void
  shouldCancel?: () => boolean
}

export function useImageSlicer({ selectedPreset, slicePlan, exportFormat, jpgQuality, gridDescription, currentMessages, cache: injectedCache, environment: environmentOverrides, storage: injectedStorage, confirmReplacePrompt: injectedConfirmReplacePrompt }: ImageSlicerDeps) {
  const fileInput = ref<HTMLInputElement | null>(null)
  const images = ref<ImageItem[]>([])
  const autoDownload = ref(false)
  const downloadReverse = ref(false)
  const replaceUpload = ref(false)
  // 注入存储优先；缺省安全读取 window.localStorage（隐私模式可能抛异常），不可用时静默降级内存态
  const storage: Storage | null = (() => {
    if (injectedStorage !== undefined) return injectedStorage
    try {
      return typeof window === 'undefined' ? null : window.localStorage
    } catch {
      return null
    }
  })()
  const directoryExport = useDirectoryExport()
  const pendingTraditionalDownloads = ref<TileResult[] | null>(null)
  const exportProgress = reactive<ExportProgress>({ phase: 'hidden', current: 0, total: 0, report: null })
  let progressDismissTimer: ReturnType<typeof setTimeout> | null = null
  // 记录正在入队的文件，防止并发/重复触发的拖拽导致重复添加
  const pendingIds = new Set<string>()
  // latest-wins 重入标记：处理期间到达的生成请求（含追加图片）置位，本轮结束后自动补跑
  let rerunRequested = false
  // 被阻塞请求的实参快照（后到覆盖）：补跑轮必须采用最后到达请求的意图，
  // 否则被阻塞调用的 autoDownload/trackProgress 会被静默丢弃
  let pendingArgs: { autoDownloadNow: boolean; trackProgress: boolean } | null = null
  const totalTiles = computed(() => images.value.reduce((sum, item) => sum + item.tiles.length, 0))
  const firstImageSize = computed(() => images.value[0]?.size ?? null)

  // 缓存深模块：可注入（测试）或内部创建（生产），URL 的创建/回收一律不在缓存内
  const cache = injectedCache ?? createSliceResultCache()

  const state = reactive({
    dragOver: false,
    processing: false,
    cancelRequested: false,
    errorKey: 'none' as ErrorKey,
    errorDetail: '',
  })

  const statusState = reactive<{ key: StatusKey; payload: Record<string, unknown> }>(
    {
      key: 'waiting',
      payload: {},
    },
  )

  const statusText = computed(() => {
    const status = currentMessages.value.status
    switch (statusState.key) {
      case 'batchDownloading':
        return status.batchDownloading
      case 'triggered':
        return status.triggered((statusState.payload.count as number) ?? 0)
      case 'processing':
        return status.processing
      case 'finished':
        return status.finished((statusState.payload.count as number) ?? 0, (statusState.payload.grid as string) ?? '')
      case 'manual':
        return status.manual((statusState.payload.count as number) ?? 0, (statusState.payload.grid as string) ?? '')
      case 'loading':
        return status.loading
      case 'waiting':
      default:
        return status.waiting
    }
  })

  const setStatus = (key: StatusKey, payload: Record<string, unknown> = {}) => {
    statusState.key = key
    statusState.payload = payload
  }

  const setError = (key: ErrorKey, detail = '') => {
    state.errorKey = key
    state.errorDetail = detail
  }

  const clearError = () => setError('none')

  const dismissExportProgress = () => {
    if (progressDismissTimer) clearTimeout(progressDismissTimer)
    progressDismissTimer = null
    exportProgress.phase = 'hidden'
    exportProgress.current = 0
    exportProgress.total = 0
    exportProgress.report = null
  }

  const beginExportProgress = (phase: Exclude<ExportProgressPhase, 'hidden' | 'report'>, total: number) => {
    if (progressDismissTimer) clearTimeout(progressDismissTimer)
    progressDismissTimer = null
    exportProgress.phase = phase
    exportProgress.current = 0
    exportProgress.total = total
    exportProgress.report = null
  }

  const updateExportProgress = (current: number, total: number) => {
    exportProgress.current = current
    exportProgress.total = total
  }

  const completeExportProgress = (report: ExportReport) => {
    if (progressDismissTimer) clearTimeout(progressDismissTimer)
    exportProgress.phase = 'report'
    exportProgress.current = report.completed
    exportProgress.total = report.total
    exportProgress.report = report
    if (!report.pending) progressDismissTimer = setTimeout(dismissExportProgress, 5000)
  }

  /** 读写 localStorage 的统一降级封装：存储不可用时静默忽略/回退默认值。 */
  const readFlag = (key: string): boolean => {
    try {
      return storage?.getItem(key) === '1'
    } catch {
      return false
    }
  }

  const writeFlag = (key: string, value: boolean) => {
    try {
      storage?.setItem(key, value ? '1' : '0')
    } catch {
      // ignore storage errors
    }
  }

  const persistAutoDownload = () => writeFlag(AUTO_DOWNLOAD_KEY, autoDownload.value)

  const restoreAutoDownload = () => {
    autoDownload.value = readFlag(AUTO_DOWNLOAD_KEY)
  }

  const setAutoDownload = (val: boolean) => {
    autoDownload.value = val
    persistAutoDownload()
  }

  /** 下载全部遍历顺序开关：写独立键，刷新后恢复上次选择 */
  const setDownloadReverse = (val: boolean) => {
    downloadReverse.value = val
    writeFlag(DOWNLOAD_REVERSE_KEY, val)
  }

  /** 覆盖上传开关：写独立键，刷新后恢复上次选择 */
  const setReplaceUpload = (val: boolean) => {
    replaceUpload.value = val
    writeFlag(REPLACE_UPLOAD_KEY, val)
  }

  const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '') || 'tile'
  const generateId = () => (crypto.randomUUID ? crypto.randomUUID() : `img-${Date.now()}-${Math.random().toString(16).slice(2)}`)

  // ---------- 生成环境：默认实现 + 可注入覆写 ----------

  const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b)
          else reject(new Error(currentMessages.value.errors.processingFailed))
        },
        type,
        quality,
      )
    })

  const defaultEnvironment: SliceEnvironment = {
    // 仅读取尺寸与生效网格（每图覆盖 ?? 全局 slicePlan）；实际过滤/取整在快照层统一执行。
    // 覆盖仅含分割线：边线擦除不进入单图设置，覆盖 plan 固定 padding=0、不裁外边缘
    resolveRects: (image, overrideLines) => {
      const plan: SlicePlan = overrideLines
        ? {
            horizontalLines: overrideLines.horizontalLines,
            verticalLines: overrideLines.verticalLines,
            padding: 0,
            paddingUnit: 'percent',
            trimOuterEdges: false,
          }
        : slicePlan.value
      return computeTileRectsFromLines(image.naturalWidth, image.naturalHeight, plan)
    },
    // 只消费快照参数：循环内绝不重读 exportFormat/jpgQuality 响应式值
    produceTile: async (image, rect, params) => {
      const canvas = document.createElement('canvas')
      canvas.width = rect.width
      canvas.height = rect.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
      const rawBlob = await canvasToBlob(canvas, 'image/png')
      if (params.format !== 'jpg') return rawBlob
      try {
        return await imageCompression(rawBlob, {
          fileType: 'image/jpeg',
          initialQuality: params.jpgQuality ?? 0.8,
          maxWidthOrHeight: Math.max(rect.width, rect.height),
          useWebWorker: true,
        })
      } catch (err) {
        console.error('JPG compression failed, fallback to canvas output', err)
        return canvasToBlob(canvas, 'image/jpeg', params.jpgQuality)
      }
    },
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    loadImage: (objectUrl) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(currentMessages.value.errors.loadFailed))
        img.src = objectUrl
      }),
  }
  const environment: SliceEnvironment = { ...defaultEnvironment, ...environmentOverrides }

  // ---------- 快照 / 物料化 / 原子换装 ----------

  /** 生效参数快照：响应式设置在此处只读一次；矩形经共享 roundTileRect 整数化（键与绘制同值）。
   *  生效网格 = item.gridOverride ?? 全局 slicePlan——缓存键已含实际矩形，覆盖图天然区别于全局图。 */
  const snapshotParams = (item: ImageItem): GenerationParams => {
    const format = exportFormat.value
    const rects = environment
      .resolveRects(item.image, item.gridOverride ?? undefined)
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map(roundTileRect)
    return {
      imageIdentity: item.id,
      rects,
      format,
      ...(format === 'jpg' ? { jpgQuality: jpgQuality.value } : {}),
      key: buildSliceCacheKey({
        algorithmVersion: SLICE_CACHE_ALGORITHM_VERSION,
        imageIdentity: item.id,
        tileRects: rects,
        format,
        ...(format === 'jpg' ? { jpgQuality: jpgQuality.value } : {}),
      }),
    }
  }

  /** 下载名拼接唯一规则：单 tile 为 baseName.ext，多 tile 为 baseName-r{row}c{col}.ext（与既有命名一致）。 */
  const tileName = (baseName: string, tileCount: number, row: number, col: number, format: ExportFormat) => {
    const fileExt = format === 'png' ? 'png' : 'jpg'
    return tileCount === 1 ? `${baseName}.${fileExt}` : `${baseName}-r${row}c${col}.${fileExt}`
  }

  /** 将缓存条目物料化为 TileResult[]：新建 URL、按当前 baseName 命名、全新 id——绝不复用易失字段。 */
  const materialize = (item: ImageItem, entry: CachedSliceEntry, params: GenerationParams): TileResult[] => {
    const isSingleTile = entry.tiles.length === 1
    return entry.tiles.map(({ meta, blob }) => ({
      id: `${item.baseName}-${meta.row}-${meta.col}-${generateId()}`,
      name: tileName(item.baseName, isSingleTile ? 1 : entry.tiles.length, meta.row, meta.col, params.format),
      blob,
      previewUrl: environment.createObjectUrl(blob),
      row: meta.row,
      col: meta.col,
      width: meta.width,
      height: meta.height,
    }))
  }

  /** 成功后原子换装：先替换 tiles（并记录物料化键），再回收旧 URL；复用路径（同数组）不做任何事。 */
  const swapTiles = (item: ImageItem, next: TileResult[], key: string) => {
    if (next === item.tiles) return
    const previous = item.tiles
    item.tilesKey = key
    item.tiles = next
    previous.forEach((tile) => environment.revokeObjectUrl(tile.previewUrl))
  }

  /** 生成一个完整缓存条目：取消或任何矩形产出失败返回 null（不完整，不入账不换装）。 */
  const generateEntry = async (image: HTMLImageElement, params: GenerationParams, hooks: EnsureHooks): Promise<CachedSliceEntry | null> => {
    const tiles: CachedSliceEntry['tiles'] = []
    for (const rect of params.rects) {
      if (hooks.shouldCancel?.()) return null
      const blob = await environment.produceTile(image, rect, params)
      if (!blob) return null
      tiles.push({ meta: { row: rect.row, col: rect.col, width: rect.width, height: rect.height }, blob })
      hooks.onTileGenerated?.()
    }
    return { tiles }
  }

  /** 按当前 baseName 重拼下载名（复用路径的改名兜底：URL/id 保持不变，仅更新 name）。 */
  const renameTile = (item: ImageItem) => (tile: TileResult, index: number) => {
    tile.name = tileName(item.baseName, item.tiles.length, tile.row, tile.col, tile.name.endsWith('.png') ? 'png' : 'jpg')
  }

  /**
   * 统一 ensure 路径：复用（同键已物料化）→ 缓存命中（重物料化）→ in-flight 合并（跟随者）
   * → 亲自生成（leader）。返回 null 表示本轮取消/不完整/失败前置/stale：调用方保留旧 tiles。
   * 生成失败以 rejection 传播（跟随者共享同一 rejection）。
   */
  const ensureTiles = async (
    item: ImageItem,
    hooks: EnsureHooks = {},
    params: GenerationParams = snapshotParams(item),
  ): Promise<TileResult[] | null> => {
    // 同键已物料化：tiles 与 URL 原样复用，不重切、不重开 URL；仅当名称已不匹配当前 baseName 时原位重拼
    if (item.tilesKey === params.key && item.tiles.length) {
      const fileExt = params.format === 'png' ? 'png' : 'jpg'
      const isSingle = item.tiles.length === 1
      const staleName = item.tiles.some((tile, index) =>
        tile.name !== tileName(item.baseName, isSingle ? 1 : item.tiles.length, tile.row, tile.col, fileExt))
      if (staleName) item.tiles.forEach(renameTile(item))
      return item.tiles
    }

    const cached = cache.lookup(params.key)
    if (cached) return materialize(item, cached, params)

    const run = cache.begin(params.key)
    // leader 自身经 generateEntry 直接拿到结果/异常，不 await 共享 promise；
    // 无跟随者时必须显式标记已处理，否则 rejection 会成为 unhandledrejection
    if (run.isLeader) run.promise.catch(() => {})
    let entry: CachedSliceEntry | null = null
    try {
      if (run.isLeader) {
        entry = await generateEntry(item.image, params, hooks)
        if (!entry) {
          cache.abandon(params.key, run.token)
          return null
        }
        // 结束快照复核：参数已变化（stale）→ 不入账、不换装（latest-wins 由补跑轮呈现新结果）
        if (snapshotParams(item).key !== params.key) {
          cache.abandon(params.key, run.token)
          return null
        }
        // 超预算单条目被拒绝入账时，结果仍照常供本次消费
        cache.settle(params.key, entry, run.token)
      } else {
        // 跟随者：共享 leader 的 promise；null = 未入账（取消/清空/不完整），rejection = 生成失败
        entry = await run.promise
        if (!entry) return null
        if (snapshotParams(item).key !== params.key) return null
      }
    } catch (err) {
      if (run.isLeader) cache.abandon(params.key, run.token, err)
      throw err
    }
    return materialize(item, entry, params)
  }

  // ---------- 清理路径 ----------

  const cleanupItem = (item: ImageItem) => {
    item.tiles.forEach((tile) => environment.revokeObjectUrl(tile.previewUrl))
    environment.revokeObjectUrl(item.objectUrl)
  }

  const cleanupAll = () => {
    images.value.forEach((item) => cleanupItem(item))
    images.value = []
    state.dragOver = false
    clearError()
    state.processing = false
    setStatus('waiting')
    dismissExportProgress()
  }

  /** 重置：清空图片/URL/待交付下载/结果缓存；不触碰任何处理配置（预设/行列/分割线/擦除/格式/质量）。 */
  const resetApp = () => {
    cleanupAll()
    pendingTraditionalDownloads.value = null
    cache.clear()
  }

  /** 卸载清理：请求在途生成放弃、回收全部 URL 与缓存（供 onBeforeUnmount 调用）。 */
  const dispose = () => {
    state.cancelRequested = true
    rerunRequested = false
    cleanupAll()
    pendingTraditionalDownloads.value = null
    pendingIds.clear()
    cache.clear()
  }

  const triggerFileSelect = () => fileInput.value?.click()

  // ---------- 队列操作：删除 / 排序（processing 守卫，与"下载此图片"一致） ----------

  /**
   * 从队列移除一张图片：回收该图 objectUrl 与其 tiles 的 previewUrl；
   * 切片缓存条目保留——同内容图片重新拖入时经内容 SHA-256 命中缓存（T01 决议）。
   * 返回 false 表示未执行（找不到该 id 或 processing 中）。
   */
  const removeImage = (id: string): boolean => {
    if (state.processing) return false
    const index = images.value.findIndex((item) => item.id === id)
    if (index === -1) return false
    const [item] = images.value.splice(index, 1)
    cleanupItem(item)
    // 队列因此变空时复位 waiting（与 resetApp 的空队列终态一致；此时必然不处于 processing）
    if (!images.value.length) setStatus('waiting')
    return true
  }

  /**
   * 交换图片与相邻位置的顺序（delta -1 = 上移 / +1 = 下移），仅改变遍历顺序，
   * 不触碰 tiles、URL 与缓存。返回 false 表示未执行（找不到 id、越界或 processing 中）。
   */
  const moveImage = (id: string, delta: -1 | 1): boolean => {
    if (state.processing) return false
    const index = images.value.findIndex((item) => item.id === id)
    if (index === -1) return false
    const target = index + delta
    if (target < 0 || target >= images.value.length) return false
    const next = [...images.value]
    ;[next[index], next[target]] = [next[target], next[index]]
    images.value = next
    return true
  }

  /**
   * 导出遍历顺序：按 downloadReverse 开关返回反转后的队列副本（队列本身不动，T02 决议）。
   * 逐图下载等单元素调用在调用方长度守卫下不受影响；目录直写失败重试仍按剩余项
   * 顺序消费 pending（不经过本函数），ADR-0001 语义不变。
   */
  const exportOrderedItems = (items: readonly ImageItem[]): ImageItem[] =>
    downloadReverse.value ? [...items].reverse() : [...items]

  /** 已下载标记（T03 覆盖确认判定依据）：切片写出到用户设备成功后置位；不持久化。 */
  const markDownloaded = (item: ImageItem) => {
    item.downloaded = true
  }

  // ---------- 下载/写入（消费已物料化 tiles，行为不变） ----------

  const downloadTiles = async (items: ImageItem[], trackProgress = false) => {
    // 遍历顺序副本：逆序开关仅影响触发顺序，队列本身不动（T02）；单元素调用不受影响
    const orderedItems = exportOrderedItems(items)
    const allTiles = orderedItems.flatMap((item) => item.tiles)
    if (!allTiles.length) return
    setStatus('batchDownloading')
    if (trackProgress) beginExportProgress('downloading', allTiles.length)
    // tile → 所属图映射：逐 tile 触发成功后按所属图置位已下载标记（含"下载全部"参与，T03）
    const ownerOfTile = new Map<TileResult, ImageItem>()
    orderedItems.forEach((item) => item.tiles.forEach((tile) => ownerOfTile.set(tile, item)))
    for (const [index, tile] of allTiles.entries()) {
      const link = document.createElement('a')
      link.href = tile.previewUrl
      link.download = tile.name
      link.rel = 'noopener'
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      link.remove()
      const owner = ownerOfTile.get(tile)
      if (owner) markDownloaded(owner)
      if (trackProgress) updateExportProgress(index + 1, allTiles.length)
      await new Promise((r) => setTimeout(r, 80))
    }
    setStatus('triggered', { count: allTiles.length })
    if (trackProgress) completeExportProgress({ mode: 'traditional', completed: allTiles.length, total: allTiles.length, renamed: 0, pending: 0 })
  }

  const writeTilesToDirectory = async (items: ImageItem[], trackProgress = false) => {
    // 遍历顺序副本：逆序开关仅影响写入顺序，队列本身不动（T02）；
    // 目录直写失败重试（retryPendingTraditionalDownloads）按剩余项顺序消费，不经过本开关
    const orderedItems = exportOrderedItems(items)
    const files = orderedItems.flatMap((item) => item.tiles).map((tile) => ({ name: tile.name, blob: tile.blob, tile }))
    if (!files.length) return
    setStatus('batchDownloading')
    if (trackProgress) beginExportProgress('saving', files.length)
    const result = await directoryExport.writeFiles(files, (current, total) => {
      if (trackProgress) updateExportProgress(current, total)
    })
    // 重置/清空竞态守卫：await 期间队列已被清空（resetApp 已置 waiting 并清空待交付下载），
    // 不回填 pendingTraditionalDownloads、不覆盖状态、不补发导出报告
    if (!images.value.length) return
    // tile → 所属图映射：目录直写成功后按"该图全部 tile 均已写出"置位已下载标记（T03）。
    // partial 时同样对已完整写出的图置位——失败的最后一项按剩余项顺序走传统重试。
    const ownerOfTile = new Map<TileResult, ImageItem>()
    orderedItems.forEach((item) => item.tiles.forEach((tile) => ownerOfTile.set(tile, item)))
    if (result.kind === 'partial') {
      result.written.forEach((file) => {
        const owner = ownerOfTile.get(file.tile)
        if (owner && owner.tiles.every((tile) => result.written.some((written) => written.tile === tile))) markDownloaded(owner)
      })
      pendingTraditionalDownloads.value = result.pending.map((file) => file.tile)
      setStatus('triggered', { count: result.written.length })
      if (trackProgress) completeExportProgress({ mode: 'directory', completed: result.written.length, total: files.length, renamed: result.renamed, pending: result.pending.length })
      return
    }
    orderedItems.forEach(markDownloaded)
    pendingTraditionalDownloads.value = null
    setStatus('triggered', { count: result.written.length })
    if (trackProgress) completeExportProgress({ mode: 'directory', completed: result.written.length, total: files.length, renamed: result.renamed, pending: 0 })
  }

  const cancelProcessing = () => { if (state.processing) state.cancelRequested = true }

  // ---------- 生成主链：全部入口统一走 ensureTiles ----------

  /** 单轮生成：快照 → 未命中 tile 计数决定 generating 阶段（全量命中直接跳过）→ 逐条 ensure + 原子换装。 */
  const runGenerationPass = async (autoDownloadNow: boolean, trackProgress: boolean) => {
    const batch = [...images.value]
    if (!batch.length) {
      setStatus('waiting')
      return
    }
    const plans = batch.map((item) => ({ item, params: snapshotParams(item) }))
    const isReused = (plan: { item: ImageItem; params: GenerationParams }) =>
      plan.item.tilesKey === plan.params.key && plan.item.tiles.length > 0
    // 部分命中按未命中 tile 计数；全量命中不进入 generating 阶段（避免瞬时假进度）
    const missTiles = plans
      .filter((plan) => !isReused(plan) && !cache.lookup(plan.params.key))
      .reduce((sum, plan) => sum + plan.params.rects.length, 0)
    const rectsTotal = plans.reduce((sum, plan) => sum + plan.params.rects.length, 0)
    let generatedCount = 0
    if (missTiles > 0) beginExportProgress('generating', missTiles)

    for (const plan of plans) {
      const { item, params } = plan
      // 条目已脱离队列（重置/清空竞态）即放弃：不生成不物料化，避免向已清空状态回填
      const isLive = () => images.value.includes(item)
      const fresh = await ensureTiles(item, {
        onTileGenerated: () => {
          generatedCount += 1
          updateExportProgress(generatedCount, missTiles)
        },
        shouldCancel: () => state.cancelRequested || !isLive(),
      }, params)
      if (fresh && isLive()) swapTiles(item, fresh, params.key)
      if (state.cancelRequested || !isLive()) break
    }

    // 重置/覆盖上传竞态：队列已空（resetApp/清除）或本轮批次已有条目脱离队列
    // （覆盖上传清空后同链路加入新图）时本轮作废——不基于新队列回填状态与报告，
    // 新队列由其自身的生成轮负责呈现
    if (!images.value.length || !batch.every((item) => images.value.includes(item))) {
      if (!images.value.length) setStatus('waiting')
      return
    }
    const shownTiles = images.value.reduce((sum, item) => sum + item.tiles.length, 0)
    if (state.cancelRequested) {
      setStatus('manual', { count: shownTiles, grid: gridDescription.value })
      completeExportProgress({ mode: 'generation', completed: shownTiles, total: rectsTotal, renamed: 0, pending: Math.max(0, rectsTotal - shownTiles) })
      return
    }
    setStatus(autoDownloadNow ? 'finished' : 'manual', { count: shownTiles, grid: gridDescription.value })
    if (autoDownloadNow) {
      if (await directoryExport.canAutoExport()) await writeTilesToDirectory(images.value, trackProgress)
      else await downloadTiles(images.value, trackProgress)
    } else {
      completeExportProgress({ mode: 'generation', completed: shownTiles, total: rectsTotal, renamed: 0, pending: 0 })
    }
  }

  const processAll = async (autoDownloadNow: boolean, trackProgress = true) => {
    if (!images.value.length) {
      setStatus('waiting')
      return
    }
    if (state.processing) {
      // latest-wins 重入：处理期间到达的新请求不丢弃，记录其意图并在本轮结束后自动补跑
      rerunRequested = true
      pendingArgs = { autoDownloadNow, trackProgress }
      return
    }
    clearError()
    state.processing = true
    state.cancelRequested = false
    setStatus('processing')
    try {
      while (images.value.length) {
        rerunRequested = false
        const passArgs = pendingArgs ?? { autoDownloadNow, trackProgress }
        pendingArgs = null
        await runGenerationPass(passArgs.autoDownloadNow, passArgs.trackProgress)
        if (state.cancelRequested) break
        if (rerunRequested) continue
        break
      }
    } catch (err) {
      setError('processingFailed', err instanceof Error ? err.message : '')
      if (trackProgress) completeExportProgress({ mode: 'generation', completed: exportProgress.current, total: exportProgress.total, renamed: 0, pending: Math.max(0, exportProgress.total - exportProgress.current) })
    } finally {
      state.processing = false
      state.cancelRequested = false
      rerunRequested = false
      pendingArgs = null
    }
  }

  /** 覆盖上传的清空语义：等效 resetApp 但保留缓存条目（T01/T03 决议——缓存不清）。 */
  const clearQueueKeepCache = () => {
    cleanupAll()
    pendingTraditionalDownloads.value = null
  }

  /**
   * 上传入口：默认追加；replaceUpload 开启且队列非空时按 T03 决议覆盖整个队列——
   * 全部已下载（或队列为空）直接替换；存在未下载图片先经 confirmReplace 确认，取消则本次上传作废。
   * 处理中到达按既有 latest-wins 补跑守卫处理（清空会在生成 pass 的 isLive 守卫中被识别）。
   */
  const addFiles = async (files: FileList | File[], options: AddFilesOptions = {}) => {
    const fileArray = Array.from(files)
    const imageFiles = fileArray.filter((file) => file.type.startsWith('image/'))

    if (imageFiles.length !== fileArray.length) {
      setError('invalidFile')
    }
    if (!imageFiles.length) {
      return
    }

    // 覆盖上传：先决断替换语义，再清空队列、后加入新图（确认取消则整体作废，不改动队列）
    if (replaceUpload.value && images.value.length) {
      const allDownloaded = images.value.every((item) => item.downloaded)
      const confirmed = allDownloaded || await (options.confirmReplace ?? injectedConfirmReplacePrompt ?? (async () => true))()
      if (!confirmed) return
      // 处理中上传复用既有重置竞态守卫路径：清空后 pass 的 isLive 守卫会放弃旧工作
      clearQueueKeepCache()
    }

    setStatus('loading')
    for (const file of imageFiles) {
      const objectUrl = environment.createObjectUrl(file)
      const shaId = await fileSha256(file)

      // 已在队列或正在处理中，直接跳过并回收临时 URL
      if (images.value.find((el) => el.id === shaId) || pendingIds.has(shaId)) {
        environment.revokeObjectUrl(objectUrl)
        continue
      }

      pendingIds.add(shaId)
      try {
        const img = await environment.loadImage(objectUrl)
        images.value.push({
          id: shaId,
          baseName: stripExtension(file.name),
          objectUrl,
          image: img,
          size: { width: img.naturalWidth, height: img.naturalHeight },
          // 原文件字节数：结果区原图大小角标的显示依据（T06）
          fileSizeBytes: file.size,
          tiles: [],
        })
      } catch (err) {
        environment.revokeObjectUrl(objectUrl)
        setError('loadFailed', err instanceof Error ? err.message : '')
      } finally {
        pendingIds.delete(shaId)
      }
    }

    // 处理期间追加：processAll 置补跑标记，追加图片不会丢失
    await processAll(autoDownload.value, autoDownload.value)
  }

  const triggerDownloads = async () => {
    if (!images.value.length) return
    pendingTraditionalDownloads.value = null
    // 目录选择必须在此用户点击路径开始时进行，不能等待异步裁切完成；缓存查找/生成 await 全部在其后。
    const writeToDirectory = await directoryExport.prepareManualExport()
    await processAll(false, true)
    if (writeToDirectory) await writeTilesToDirectory(images.value, true)
    else await downloadTiles(images.value, true)
  }

  const retryPendingTraditionalDownloads = async () => {
    if (!pendingTraditionalDownloads.value?.length) return
    const pending = pendingTraditionalDownloads.value
    pendingTraditionalDownloads.value = null
    // ADR-0001：重试按剩余项顺序逐张触发，不经过逆序开关
    await downloadTiles([{ tiles: pending } as ImageItem], true)
    // 伪条目不在队列中，downloadTiles 只能标记到它；此处按真实所属图补置已下载标记
    pending.forEach((tile) => {
      const owner = images.value.find((item) => item.tiles.includes(tile))
      if (owner) markDownloaded(owner)
    })
  }

  const changeExportDirectory = async () => {
    await directoryExport.chooseDirectory()
  }

  /** 预览保存只复用已授权目录，绝不在预览内主动请求目录权限。 */
  const savePreviewTile = async (id: string): Promise<PreviewSaveResult> => {
    const tile = images.value.flatMap((image) => image.tiles).find((item) => item.id === id)
    if (!tile) return 'missing'
    if (!await directoryExport.canAutoExport()) return 'fallback'
    const result = await directoryExport.writeFiles([{ name: tile.name, blob: tile.blob }])
    if (result.kind === 'complete' && result.written.length === 1) {
      // 预览保存成功同样置位已下载标记（T03：写出用户设备即视为已下载）
      const owner = images.value.find((image) => image.tiles.includes(tile))
      if (owner) markDownloaded(owner)
      return 'saved'
    }
    return 'fallback'
  }

  const savePreviewTileAs = async (id: string): Promise<SaveAsResult | 'missing'> => {
    const tile = images.value.flatMap((image) => image.tiles).find((item) => item.id === id)
    if (!tile) return 'missing'
    const result = await directoryExport.saveFileAs({ name: tile.name, blob: tile.blob })
    if (result === 'saved') {
      const owner = images.value.find((image) => image.tiles.includes(tile))
      if (owner) markDownloaded(owner)
    }
    return result
  }

  /**
   * 每图网格覆盖（T04）：override 为 null 回退全局网格；设置后该图按最新参数重算——
   * tilesKey 已不匹配当前生效键，processAll/ensureTiles 走既有 缓存命中/生成 路径。
   * 覆盖仅含分割线（归一化 0-1），经 normalizeDividerLines 清洗；边线擦除不进入单图设置。
   * processing 中拒绝（与删除/排序一致，不引入新的在途生成竞态路径），返回是否执行。
   */
  const setGridOverride = (id: string, override: GridOverride | null): boolean => {
    if (state.processing) return false
    const item = images.value.find((el) => el.id === id)
    if (!item) return false
    item.gridOverride = override
      ? {
          horizontalLines: normalizeDividerLines(override.horizontalLines),
          verticalLines: normalizeDividerLines(override.verticalLines),
        }
      : null
    return true
  }

  const downloadSingleImage = async (id: string) => {
    const target = images.value.find((img) => img.id === id)
    if (!target || state.processing) return
    clearError()
    state.processing = true
    setStatus('processing')
    const isLive = () => images.value.includes(target)
    try {
      const params = snapshotParams(target)
      const expectedTotal = params.rects.length
      // 全量命中（复用或缓存）不进入 generating 阶段
      const reuseSatisfied = target.tilesKey === params.key && target.tiles.length > 0
      const cacheSatisfied = !reuseSatisfied && cache.lookup(params.key) !== null
      let generatedCount = 0
      if (!reuseSatisfied && !cacheSatisfied && expectedTotal > 0) beginExportProgress('generating', expectedTotal)
      const fresh = await ensureTiles(target, {
        onTileGenerated: () => {
          generatedCount += 1
          updateExportProgress(generatedCount, expectedTotal)
        },
        shouldCancel: () => !isLive(),
      }, params)
      // 重置/清空竞态守卫（与 runGenerationPass 等价）：条目已脱离队列即放弃——
      // cleanupAll 已置 waiting，不再覆盖状态，也不对（可能已被回收 URL 的）tiles 触发下载
      if (!isLive()) return
      if (fresh) swapTiles(target, fresh, params.key)
      setStatus('manual', { count: target.tiles.length, grid: gridDescription.value })
      // 逐图下载成功触发后置位已下载标记（T03 覆盖确认判定依据）
      markDownloaded(target)
      await downloadTiles([target], true)
    } catch (err) {
      setError('processingFailed', err instanceof Error ? err.message : '')
      completeExportProgress({ mode: 'generation', completed: exportProgress.current, total: exportProgress.total, renamed: 0, pending: Math.max(0, exportProgress.total - exportProgress.current) })
    } finally {
      state.processing = false
    }
  }

  const onFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement
    const files = target.files
    if (files && files.length) await addFiles(files)
    target.value = ''
  }

  const onDrop = async (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    state.dragOver = false
    const files = event.dataTransfer?.files
    if (files && files.length) await addFiles(files)
  }

  const onDragOver = (event: DragEvent) => {
    event.preventDefault()
    state.dragOver = true
  }

  const onDragLeave = () => {
    state.dragOver = false
  }

  const handleGlobalDragOver = (event: DragEvent) => {
    event.preventDefault()
    state.dragOver = true
  }

  const handleGlobalDrop = async (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    state.dragOver = false
    const files = event.dataTransfer?.files
    if (files && files.length) await addFiles(files)
  }

  // 初始化持久化开关：自动下载 / 下载逆序 / 覆盖上传（存储不可用时保持默认值）
  restoreAutoDownload()
  downloadReverse.value = readFlag(DOWNLOAD_REVERSE_KEY)
  replaceUpload.value = readFlag(REPLACE_UPLOAD_KEY)
  void directoryExport.restore()

  return {
    fileInput,
    images,
    totalTiles,
    autoDownload,
    downloadReverse,
    replaceUpload,
    firstImageSize,
    state,
    statusText,
    statusState,
    setStatus,
    setAutoDownload,
    setDownloadReverse,
    setReplaceUpload,
    removeImage,
    moveImage,
    setGridOverride,
    setError,
    clearError,
    cleanupAll,
    resetApp,
    dispose,
    // 测试接缝：各入口共享的统一 ensure 路径（生产代码经 processAll 等入口间接消费）
    ensureTiles,
    triggerDownloads,
    downloadSingleImage,
    processAll,
    cancelProcessing,
    exportProgress,
    dismissExportProgress,
    directoryExportSupported: directoryExport.isSupported,
    directoryExportReady: directoryExport.hasWritableDirectory,
    pendingTraditionalDownloads,
    changeExportDirectory,
    savePreviewTile,
    savePreviewTileAs,
    retryPendingTraditionalDownloads,
    addFiles,
    onFileChange,
    onDrop,
    onDragOver,
    onDragLeave,
    handleGlobalDragOver,
    handleGlobalDrop,
    triggerFileSelect,
    clearQueueKeepCache,
  }
}
