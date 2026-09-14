import type { TileRect } from '../utils/grid'

/**
 * 切片结果缓存深模块（会话内存缓存，见 openspec/changes/cache-slice-results-and-persist-settings）。
 *
 * 职责边界：
 * - 只存 Blob 与稳定切片元数据（row/col/width/height），绝不存 Object URL、随机 id、图片元素或文件名；
 *   Object URL 的创建与回收全部留在 useImageSlicer（物料化层）。
 * - LRU 双重上限：条目数与 Blob 字节账本同时受约束；in-flight 记录不占配额。
 * - 相同键的进行中生成合并为一次运行（leader/follower 共享同一 Promise）。
 * - 失败、取消、不完整、过期与 clear 后完成的工作不入账；准入由 settle 内部单一把关。
 */

/** 显式算法版本：切片算法或键语义变化时必须递增，使旧条目自然失效。 */
export const SLICE_CACHE_ALGORITHM_VERSION = 'v1'

/** 缓存内每个切片的稳定元数据：仅行列号与宽高，无任何易失字段。 */
export interface CachedTileMeta {
  row: number
  col: number
  width: number
  height: number
}

/** 一个缓存条目：一张输入图片 + 一组生效生成参数产出的完整 tile 集合。 */
export interface CachedSliceEntry {
  tiles: Array<{ meta: CachedTileMeta; blob: Blob }>
}

/** 缓存键入参：字段与顺序即键的构成契约。 */
export interface SliceCacheKeyInput {
  /** 显式算法版本，如 'v1' */
  algorithmVersion: string
  /** fileSha256 内容摘要（或其元信息回退标识，回退标识显式豁免"不含文件名"约束） */
  imageIdentity: string
  /** 实际切片矩形序列：必须先经 roundTileRect 整数化，与 Canvas 绘制取整规则完全一致 */
  tileRects: TileRect[]
  /** 导出格式 */
  format: 'png' | 'jpg'
  /** 仅 JPG 提供：0-1 小数，内部以整数百分比（Math.round(quality * 100)）参与键；PNG 必须省略 */
  jpgQuality?: number
}

/** 生成条目的默认双重上限：30 条 / 256 MiB（测试可注入更小值）。 */
const DEFAULT_MAX_ENTRIES = 30
const DEFAULT_MAX_BLOB_BYTES = 256 * 1024 * 1024

/**
 * 统一矩形取整规则（键与绘制的唯一取整口径）。
 * Canvas 的 width/height 赋值按 WebIDL unsigned long 截断浮点，因此绘制前必须先对每个矩形
 * Math.round（x/y/width/height 各自独立取整），缓存键使用同一取整后值——禁止两侧规则不一致。
 * 纯函数、返回新对象，可被 useImageSlicer 在 drawImage 前复用。
 */
export const roundTileRect = (rect: TileRect): TileRect => ({
  x: Math.round(rect.x),
  y: Math.round(rect.y),
  width: Math.round(rect.width),
  height: Math.round(rect.height),
  row: rect.row,
  col: rect.col,
})

/**
 * 将单个矩形序列化为定界符无关的稳定片段（不含 '|' 与 ';'，避免与字段/矩形分隔符冲突）。
 * row/col 与几何值一并入键：行列号变化而几何巧合相同时仍应视为不同键。
 */
const serializeRect = (rect: TileRect): string =>
  `r${rect.row}c${rect.col}x${rect.x}y${rect.y}w${rect.width}h${rect.height}`

/**
 * 构造缓存键：算法版本 + 图片内容标识 + 取整后矩形序列 + 格式（JPG 追加整数百分比质量）拼接。
 * - PNG 一律忽略质量：改质量不失效 PNG 缓存；
 * - JPG 质量以整数百分比编码，禁止 0-1 浮点直接字符串化（浮点序列化歧义）；
 * - baseName 与任何随机 id 不参与键，Blob 字节可跨文件名复用。
 */
export const buildSliceCacheKey = (input: SliceCacheKeyInput): string => {
  const roundedRects = input.tileRects.map(roundTileRect)
  const fields = [
    input.algorithmVersion,
    input.imageIdentity,
    roundedRects.map(serializeRect).join(';'),
    input.format,
  ]
  if (input.format === 'jpg') {
    // 整数百分比编码：Math.round 消除 0-1 浮点的序列化歧义
    fields.push(String(Math.round((input.jpgQuality ?? 0) * 100)))
  }
  return fields.join('|')
}

/** 缓存内部记录：条目本体 + 字节小计。 */
interface CacheRecord {
  entry: CachedSliceEntry
  blobBytes: number
}

/** 进行中生成记录：共享同一 Promise 的合并单元。 */
interface InFlightRecord {
  /** 仅 leader 的 token 在册；跟随者拿到各自未注册的 token，无法冒领 settle/abandon */
  leaderToken: symbol
  resolve: (entry: CachedSliceEntry | null) => void
  reject: (reason?: unknown) => void
  promise: Promise<CachedSliceEntry | null>
}

export interface SliceResultCache {
  /** 命中即提升为最近使用；未命中返回 null */
  lookup(key: string): CachedSliceEntry | null
  /** 同键首个调用者为 leader；后来者共享同一 promise（entry | null 收尾，失败以 rejection 传播） */
  begin(key: string): { isLeader: boolean; token: symbol; promise: Promise<CachedSliceEntry | null> }
  /** 单一把关方：token 在册且未被 clear 清除才入账；超预算单条目拒绝入账但结果照常返回。返回是否入账 */
  settle(key: string, entry: CachedSliceEntry, token: symbol): boolean
  /** leader 释放 in-flight 记录：带 error 时所有等待者以 rejection 收尾，否则以 null 收尾（未入账） */
  abandon(key: string, token: symbol, error?: unknown): void
  /** 预留的定向清理：移除指定图片内容标识的全部条目 */
  invalidate(imageIdentity: string): void
  /** 清空全部条目与 in-flight 记录（等待者立即以 null 收尾，迟到 settle 被拒绝） */
  clear(): void
  stats(): { entries: number; blobBytes: number }
}

export const createSliceResultCache = (options?: {
  maxEntries?: number
  maxBlobBytes?: number
}): SliceResultCache => {
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES
  const maxBlobBytes = options?.maxBlobBytes ?? DEFAULT_MAX_BLOB_BYTES

  /** 键 → 缓存记录；Map 插入序即 LRU 序（命中时重插提升最近使用） */
  const cached = new Map<string, CacheRecord>()
  /** 键 → 进行中生成记录；不占条目/字节配额 */
  const inFlight = new Map<string, InFlightRecord>()

  const entryBlobBytes = (entry: CachedSliceEntry): number =>
    entry.tiles.reduce((sum, tile) => sum + tile.blob.size, 0)

  /**
   * 缓存键以 '|' 分隔字段，第二个字段即图片内容标识（第一个为算法版本）。
   * invalidate 需要按标识定向清理，而缓存记录只持有键，因此从键中反解该字段。
   * 主路径 imageIdentity 为 fileSha256 的 hex 摘要，必不含 '|'；元信息回退标识仅在
   * 文件名本身含 '|' 的极端情况下可能反解失配（该条目随后由 LRU/bytes 逐出兜底，可接受）。
   */
  const imageIdentityOfKey = (key: string): string => {
    const start = key.indexOf('|')
    if (start === -1) return ''
    const end = key.indexOf('|', start + 1)
    return end === -1 ? key.slice(start + 1) : key.slice(start + 1, end)
  }

  /**
   * LRU 逐出：从最久未使用开始删除，直到条目数与字节总量同时回到上限内。
   * 若最久未使用条目正被 in-flight 合并等待，则保留并暂停本轮逐出（暂时超限），
   * 待该记录 settle/abandon 释放后再次触发 evictToLimits 重算。
   */
  const evictToLimits = () => {
    for (;;) {
      if (cached.size <= maxEntries) {
        let blobBytes = 0
        for (const record of cached.values()) blobBytes += record.blobBytes
        if (blobBytes <= maxBlobBytes) return
      }
      const lruKey = cached.keys().next().value as string | undefined
      if (lruKey === undefined) return
      // 逐出条目正被等待：保留至其收尾后重算，不越过的候选取近者
      if (inFlight.has(lruKey)) return
      cached.delete(lruKey)
    }
  }

  const lookup = (key: string): CachedSliceEntry | null => {
    const record = cached.get(key)
    if (!record) return null
    // 命中重插：提升为最近使用
    cached.delete(key)
    cached.set(key, record)
    return record.entry
  }

  const begin = (key: string) => {
    const existing = inFlight.get(key)
    if (existing) {
      // 跟随者：共享同一 promise；token 未注册，无法 settle/abandon
      return { isLeader: false, token: Symbol('slice-cache-follower'), promise: existing.promise }
    }
    const leaderToken = Symbol('slice-cache-leader')
    let resolve!: (entry: CachedSliceEntry | null) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<CachedSliceEntry | null>((res, rej) => {
      resolve = res
      reject = rej
    })
    inFlight.set(key, { leaderToken, resolve, reject, promise })
    return { isLeader: true, token: leaderToken, promise }
  }

  const settle = (key: string, entry: CachedSliceEntry, token: symbol): boolean => {
    const record = inFlight.get(key)
    // 单一把关方：token 不在册（含被 clear 清除）一律拒绝
    if (!record || record.leaderToken !== token) return false
    inFlight.delete(key)

    const blobBytes = entryBlobBytes(entry)
    if (blobBytes > maxBlobBytes) {
      // 超预算单条目：拒绝入账，但结果照常返回给本次预览/导出（含等待共享 promise 的跟随者）
      record.resolve(entry)
      return false
    }

    cached.set(key, { entry, blobBytes })
    record.resolve(entry)
    evictToLimits()
    return true
  }

  const abandon = (key: string, token: symbol, error?: unknown) => {
    const record = inFlight.get(key)
    if (!record || record.leaderToken !== token) return
    inFlight.delete(key)
    if (error !== undefined) {
      record.reject(error)
    } else {
      // 本轮完成但未入账（取消/不完整/过期/调用方判定不收）
      record.resolve(null)
    }
    // 记录释放后可能解除对逐出的阻塞，重算一次
    evictToLimits()
  }

  const invalidate = (imageIdentity: string) => {
    let removed = false
    for (const key of cached.keys()) {
      if (imageIdentityOfKey(key) === imageIdentity) {
        cached.delete(key)
        removed = true
      }
    }
    if (removed) evictToLimits()
  }

  const clear = () => {
    // 纪元竞态安全：清空即解除全部在册记录，等待者立即以 null 收尾；
    // 此后迟到的 settle 因 token 不在册被拒绝
    for (const record of inFlight.values()) record.resolve(null)
    inFlight.clear()
    cached.clear()
  }

  const stats = () => {
    let blobBytes = 0
    for (const record of cached.values()) blobBytes += record.blobBytes
    return { entries: cached.size, blobBytes }
  }

  return { lookup, begin, settle, abandon, invalidate, clear, stats }
}
