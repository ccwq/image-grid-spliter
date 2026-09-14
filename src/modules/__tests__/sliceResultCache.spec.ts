import { describe, expect, it } from 'vitest'
import {
  SLICE_CACHE_ALGORITHM_VERSION,
  buildSliceCacheKey,
  createSliceResultCache,
  roundTileRect,
  type CachedSliceEntry,
  type SliceCacheKeyInput,
  type TileRect,
} from '../sliceResultCache'

// 构造规则矩形：默认值覆盖 row/col 与四个几何字段，测试按需覆写
const makeRect = (overrides: Partial<TileRect> = {}): TileRect => ({
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  row: 1,
  col: 1,
  ...overrides,
})

// 构造缓存条目：tileCount 个切片、每个 Blob 恰为 blobBytes 字节，支撑字节账本断言
const makeEntry = (tileCount = 2, blobBytes = 10): CachedSliceEntry => ({
  tiles: Array.from({ length: tileCount }, (_, index) => ({
    meta: { row: 1, col: index + 1, width: 100, height: 50 },
    blob: new Blob([new Uint8Array(blobBytes)], { type: 'image/png' }),
  })),
})

// 键入参基线：PNG 不带质量字段（贴近实际生成快照），测试按需覆写 format/jpgQuality
const keyInput = (overrides: Partial<SliceCacheKeyInput> = {}): SliceCacheKeyInput => ({
  algorithmVersion: SLICE_CACHE_ALGORITHM_VERSION,
  imageIdentity: 'sha256-abc123',
  tileRects: [makeRect()],
  format: 'png',
  ...overrides,
})

describe('buildSliceCacheKey', () => {
  /**
   * Given：导出格式为 PNG，其余参数完全相同
   * When：分别以不传质量、传不同质量值构造缓存键
   * Then：三次构造得到完全相同的键，PNG 一律忽略质量
   * 防回归：PNG 下调质量不应触发全量重切（PNG 输出与质量无关）
   */
  it('PNG 键忽略 JPG 质量（传与不传、值不同均同键）', () => {
    const withoutQuality = buildSliceCacheKey(keyInput())
    const withQuality = buildSliceCacheKey(keyInput({ jpgQuality: 0.8 }))
    const otherQuality = buildSliceCacheKey(keyInput({ jpgQuality: 0.95 }))
    expect(withQuality).toBe(withoutQuality)
    expect(otherQuality).toBe(withoutQuality)
  })

  /**
   * Given：导出格式为 JPG，质量以 0-1 小数提供（与 useImageSlicer 的 jpgQuality 一致）
   * When：以相同质量与近似归一到同一整数百分比的质量分别构造键
   * Then：相同整数百分比同键、不同整数百分比异键，且键中是整数百分比而非 0-1 浮点字符串
   * 防回归：0-1 浮点直接字符串化存在序列化歧义，会造成同质量不同键的假未命中
   */
  it('JPG 键纳入质量并以整数百分比编码', () => {
    const quality80 = buildSliceCacheKey(keyInput({ format: 'jpg', jpgQuality: 0.8 }))
    const quality80b = buildSliceCacheKey(keyInput({ format: 'jpg', jpgQuality: 0.80004 }))
    const quality81 = buildSliceCacheKey(keyInput({ format: 'jpg', jpgQuality: 0.81 }))
    expect(quality80b).toBe(quality80)
    expect(quality81).not.toBe(quality80)
    // 整数百分比编码：段尾为 '80'，绝不出现 '0.8' 浮点形式；PNG 键不含质量段
    expect(quality80.endsWith('|80')).toBe(true)
    expect(quality80).not.toContain('0.8')
    expect(quality80.split('|')).toHaveLength(5)
    expect(buildSliceCacheKey(keyInput()).split('|')).toHaveLength(4)
  })

  /**
   * Given：两张文件名不同但内容标识相同的图片（baseName 不在键入参中）
   * When：重复构造缓存键
   * Then：键完全一致且不含任何文件名痕迹，Blob 字节可跨文件名复用
   * 防回归：键混入 baseName 会让改名后的同内容图片全部假未命中
   */
  it('键不含 baseName 且无随机成分（重复构造同键）', () => {
    const first = buildSliceCacheKey(keyInput({ imageIdentity: 'sha256-same-content' }))
    const second = buildSliceCacheKey(keyInput({ imageIdentity: 'sha256-same-content' }))
    expect(first).toBe(second)
    expect(first).not.toContain('photo.png')
  })

  /**
   * Given：除切片矩形外其余键字段相同
   * When：改变单个矩形的几何值，或增减矩形数量后构造键
   * Then：三种输入得到互不相同的键
   * 防回归：移动分割线/调整边线擦除后必须换键，否则展示旧矩形的结果
   */
  it('切片矩形不同则键不同', () => {
    const base = buildSliceCacheKey(keyInput({ tileRects: [makeRect({ x: 0, width: 100 })] }))
    const shifted = buildSliceCacheKey(keyInput({ tileRects: [makeRect({ x: 0, width: 101 })] }))
    const moreTiles = buildSliceCacheKey(keyInput({
      tileRects: [makeRect({ x: 0, width: 100 }), makeRect({ x: 100, col: 2 })],
    }))
    expect(shifted).not.toBe(base)
    expect(moreTiles).not.toBe(base)
  })

  /**
   * Given：除算法版本外其余键字段相同
   * When：分别以 'v1' 与 'v2' 构造键
   * Then：两键不同，旧版本条目在新版本下自然失效
   * 防回归：算法或键语义变化时必须能整体作废历史缓存
   */
  it('算法版本参与键以隔离历史条目', () => {
    const v1 = buildSliceCacheKey(keyInput({ algorithmVersion: 'v1' }))
    const v2 = buildSliceCacheKey(keyInput({ algorithmVersion: 'v2' }))
    expect(v1).not.toBe(v2)
  })

  /**
   * Given：除图片内容标识外其余键字段相同
   * When：以不同 imageIdentity 构造键
   * Then：两键不同，不同图片互不命中
   * 防回归：图片维度缺失会让 A 图命中 B 图的切片
   */
  it('图片内容标识不同则键不同', () => {
    const imageA = buildSliceCacheKey(keyInput({ imageIdentity: 'sha256-a' }))
    const imageB = buildSliceCacheKey(keyInput({ imageIdentity: 'sha256-b' }))
    expect(imageA).not.toBe(imageB)
  })

  /**
   * Given：computeTileRectsFromLines 产出的含小数矩形（含 .5 边界值）
   * When：对原始矩形与经 roundTileRect 整数化后的矩形分别构造键
   * Then：两键完全一致，且取整结果与 Canvas 绘制将使用的 Math.round 值逐字段相同
   * 防回归：Canvas width/height 赋值按 WebIDL 截断浮点，键与绘制取整规则不一致会造成同键不同像素
   */
  it('键中矩形与绘制矩形取整同值（统一 Math.round，含 .5 边界）', () => {
    const raw = [
      makeRect({ x: 10.4, y: 3.6, width: 99.5, height: 47.2, row: 1, col: 1 }),
      makeRect({ x: 110.5, y: 51.1, width: 89.5, height: 48.9, row: 1, col: 2 }),
    ]
    const rounded = raw.map(roundTileRect)
    expect(rounded[0]).toEqual({ x: 10, y: 4, width: 100, height: 47, row: 1, col: 1 })
    expect(rounded[1]).toEqual({ x: 111, y: 51, width: 90, height: 49, row: 1, col: 2 })
    expect(buildSliceCacheKey(keyInput({ tileRects: raw })))
      .toBe(buildSliceCacheKey(keyInput({ tileRects: rounded })))
  })
})

describe('createSliceResultCache', () => {
  /**
   * Given：leader 完成生成并以有效 token settle
   * When：随后以同键 lookup
   * Then：返回同一 entry 对象、共享 promise 以该 entry 收尾、统计计入条目与字节
   * 防回归：settle 后必须可查，否则命中路径永不生效
   */
  it('settle 后 lookup 命中同一对象并计入统计', async () => {
    const cache = createSliceResultCache()
    const key = buildSliceCacheKey(keyInput())
    const leader = cache.begin(key)
    expect(leader.isLeader).toBe(true)
    const entry = makeEntry(2, 10)
    expect(cache.settle(key, entry, leader.token)).toBe(true)
    expect(await leader.promise).toBe(entry)
    expect(cache.lookup(key)).toBe(entry)
    expect(cache.stats()).toEqual({ entries: 1, blobBytes: 20 })
  })

  /**
   * Given：空缓存
   * When：lookup 任意键并读取统计
   * Then：返回 null 且统计为零
   * 防回归：空缓存误报命中会让首次生成跳过
   */
  it('未命中返回 null 且统计为零', () => {
    const cache = createSliceResultCache()
    expect(cache.lookup(buildSliceCacheKey(keyInput()))).toBeNull()
    expect(cache.stats()).toEqual({ entries: 0, blobBytes: 0 })
  })

  /**
   * Given：上限 2 条的缓存中已有 A、B 两个条目，A 刚被 lookup 命中
   * When：写入第三个条目 C
   * Then：最久未使用的 B 被逐出，被提升过的 A 保留
   * 防回归：命中不提升 LRU 会让正在预览的条目被误逐出
   */
  it('命中提升最近使用，超条目上限时逐出最久未使用者', () => {
    const cache = createSliceResultCache({ maxEntries: 2 })
    const keyA = buildSliceCacheKey(keyInput({ imageIdentity: 'img-a' }))
    const keyB = buildSliceCacheKey(keyInput({ imageIdentity: 'img-b' }))
    const keyC = buildSliceCacheKey(keyInput({ imageIdentity: 'img-c' }))
    const entryA = makeEntry(1, 10)
    const entryB = makeEntry(1, 10)
    const entryC = makeEntry(1, 10)
    const genA = cache.begin(keyA)
    const genB = cache.begin(keyB)
    cache.settle(keyA, entryA, genA.token)
    cache.settle(keyB, entryB, genB.token)
    // 命中 A：A 提升为最近使用，B 成为最久未使用
    expect(cache.lookup(keyA)).toBe(entryA)
    const genC = cache.begin(keyC)
    cache.settle(keyC, entryC, genC.token)
    expect(cache.lookup(keyA)).toBe(entryA)
    expect(cache.lookup(keyB)).toBeNull()
    expect(cache.lookup(keyC)).toBe(entryC)
    // A 与 C 各 10 字节，B（10 字节）已被逐出
    expect(cache.stats()).toEqual({ entries: 2, blobBytes: 20 })
  })

  /**
   * Given：字节上限 30、每条目 20 字节
   * When：写入第二个条目使总量达到 40 字节
   * Then：从最久未使用开始逐出，直到条目数与字节总量同时回到上限内
   * 防回归：字节账本缺失会让大图缓存无限膨胀内存
   */
  it('超字节上限时从最久未使用逐出至双限满足', () => {
    const cache = createSliceResultCache({ maxBlobBytes: 30 })
    const keyA = buildSliceCacheKey(keyInput({ imageIdentity: 'img-a' }))
    const keyB = buildSliceCacheKey(keyInput({ imageIdentity: 'img-b' }))
    const genA = cache.begin(keyA)
    const genB = cache.begin(keyB)
    cache.settle(keyA, makeEntry(1, 20), genA.token)
    cache.settle(keyB, makeEntry(1, 20), genB.token)
    expect(cache.lookup(keyA)).toBeNull()
    expect(cache.stats().blobBytes).toBe(20)
    expect(cache.stats().entries).toBe(1)
  })

  /**
   * Given：三个键的生成均处于 in-flight 状态、尚未 settle
   * When：读取统计
   * Then：条目数与字节数均为零，in-flight 记录不占任何配额
   * 防回归：进行中的生成计入配额会提前逐出已完成的可用条目
   */
  it('in-flight 记录不占条目与字节配额', () => {
    const cache = createSliceResultCache()
    for (const identity of ['img-a', 'img-b', 'img-c']) {
      cache.begin(buildSliceCacheKey(keyInput({ imageIdentity: identity })))
    }
    expect(cache.stats()).toEqual({ entries: 0, blobBytes: 0 })
  })

  /**
   * Given：同键首次 begin 为 leader，生成仍在进行
   * When：第二个调用者对同键 begin
   * Then：其为跟随者并与 leader 共享同一 promise；settle 后两者拿到同一结果
   * 防回归：并发同键各自生成会重复裁切并互相覆盖
   */
  it('同键并发 begin 合并为一次运行并共享结果', async () => {
    const cache = createSliceResultCache()
    const key = buildSliceCacheKey(keyInput())
    const leader = cache.begin(key)
    const follower = cache.begin(key)
    expect(leader.isLeader).toBe(true)
    expect(follower.isLeader).toBe(false)
    expect(follower.promise).toBe(leader.promise)
    const entry = makeEntry()
    expect(cache.settle(key, entry, leader.token)).toBe(true)
    expect(await leader.promise).toBe(entry)
    expect(await follower.promise).toBe(entry)
  })

  /**
   * Given：单条目 Blob 总字节超过注入的字节上限
   * When：leader settle 该条目
   * Then：settle 返回 false、缓存保持未命中，但共享 promise 仍以完整 entry 收尾供本次预览/导出消费
   * 防回归：超预算条目入缓存会突破字节账本；直接丢弃结果则破坏当前导出流程
   */
  it('单条目超字节预算拒绝入账但结果照常返回', async () => {
    const cache = createSliceResultCache({ maxBlobBytes: 16 })
    const key = buildSliceCacheKey(keyInput())
    const { token, promise } = cache.begin(key)
    const oversized = makeEntry(2, 100)
    expect(cache.settle(key, oversized, token)).toBe(false)
    expect(await promise).toBe(oversized)
    expect(cache.lookup(key)).toBeNull()
    expect(cache.stats()).toEqual({ entries: 0, blobBytes: 0 })
  })

  /**
   * Given：leader 与跟随者共享一次生成，生成过程抛出错误
   * When：leader 以 abandon(key, token, error) 释放记录
   * Then：所有等待者以同一 rejection 收尾、缓存保持未命中，记录释放后新 begin 重新成为 leader
   * 防回归：失败不传播会让跟随者永久挂起等待；不释放记录会让该键永远无法重新生成
   */
  it('生成失败经 abandon(key, token, error) 以 rejection 传播给所有等待者', async () => {
    const cache = createSliceResultCache()
    const key = buildSliceCacheKey(keyInput())
    const leader = cache.begin(key)
    const follower = cache.begin(key)
    const failure = new Error('generation failed')
    cache.abandon(key, leader.token, failure)
    await expect(leader.promise).rejects.toBe(failure)
    await expect(follower.promise).rejects.toBe(failure)
    expect(cache.lookup(key)).toBeNull()
    expect(cache.begin(key).isLeader).toBe(true)
  })

  /**
   * Given：leader 判定本轮取消/不完整/参数已过期（调用方先行判定）
   * When：leader 以不带 error 的 abandon 释放记录
   * Then：共享 promise 以 null 收尾（本轮完成但未入账），缓存保持未命中且统计为零
   * 防回归：取消/过期结果入缓存会展示已被放弃的旧参数产物
   */
  it('取消/不完整/过期经 abandon 以 null 收尾且不入缓存', async () => {
    const cache = createSliceResultCache()
    const key = buildSliceCacheKey(keyInput())
    const { token, promise } = cache.begin(key)
    cache.abandon(key, token)
    expect(await promise).toBeNull()
    expect(cache.lookup(key)).toBeNull()
    expect(cache.stats()).toEqual({ entries: 0, blobBytes: 0 })
  })

  /**
   * Given：key 上存在 leader 记录，另一键的 token 被用于本键 settle
   * When：以错误 token settle
   * Then：settle 返回 false、在册记录与共享 promise 不受影响，正确 token 仍可入账
   * 防回归：token 复核缺失会让任何调用方冒领他人生成结果
   */
  it('token 不匹配的 settle 被拒绝且不破坏在册记录', async () => {
    const cache = createSliceResultCache()
    const key = buildSliceCacheKey(keyInput())
    const leader = cache.begin(key)
    const other = cache.begin(buildSliceCacheKey(keyInput({ imageIdentity: 'img-other' })))
    const entry = makeEntry()
    expect(cache.settle(key, entry, other.token)).toBe(false)
    // 错误 token 不入账也不销毁记录；正确 token 随后仍可收尾
    expect(cache.lookup(key)).toBeNull()
    expect(cache.settle(key, entry, leader.token)).toBe(true)
    expect(await leader.promise).toBe(entry)
  })

  /**
   * Given：某键已成功 settle 入账
   * When：同一 token 再次 settle
   * Then：第二次返回 false，条目数与字节不重复累计
   * 防回归：重复入账会虚增字节账本导致过早逐出
   */
  it('同一 token 二次 settle 拒绝，防止重复入账', () => {
    const cache = createSliceResultCache()
    const key = buildSliceCacheKey(keyInput())
    const { token } = cache.begin(key)
    const entry = makeEntry(1, 10)
    expect(cache.settle(key, entry, token)).toBe(true)
    expect(cache.settle(key, entry, token)).toBe(false)
    expect(cache.stats()).toEqual({ entries: 1, blobBytes: 10 })
  })

  /**
   * Given：生成进行中用户执行重置触发 clear()
   * When：等待者观察 promise，随后迟到的 leader settle 到达
   * Then：等待者已被 clear 以 null 即时收尾，迟到 settle 被拒绝，缓存保持为空
   * 防回归：clear 后完成的工作入账会把已重置工作区之外的旧结果写回缓存
   */
  it('clear 后等待者立即以 null 收尾，迟到的 settle 被拒绝', async () => {
    const cache = createSliceResultCache()
    const key = buildSliceCacheKey(keyInput())
    const { token, promise } = cache.begin(key)
    cache.clear()
    expect(await promise).toBeNull()
    expect(cache.settle(key, makeEntry(), token)).toBe(false)
    expect(cache.lookup(key)).toBeNull()
    expect(cache.stats()).toEqual({ entries: 0, blobBytes: 0 })
  })

  /**
   * Given：clear 之后同一键发起新一轮生成
   * When：新一轮 leader settle
   * Then：新一轮正常入账并命中，旧轮 token 不影响新轮
   * 防回归：clear 纪元混淆会让重置后的首次生成永远无法入缓存
   */
  it('clear 后同键重新 begin 可独立完成并入账', async () => {
    const cache = createSliceResultCache()
    const key = buildSliceCacheKey(keyInput())
    const stale = cache.begin(key)
    cache.clear()
    const next = cache.begin(key)
    expect(next.isLeader).toBe(true)
    const entry = makeEntry()
    expect(cache.settle(key, entry, next.token)).toBe(true)
    expect(await next.promise).toBe(entry)
    expect(cache.lookup(key)).toBe(entry)
    // 旧轮 token 在新纪元下不再有效
    expect(cache.settle(key, entry, stale.token)).toBe(false)
  })

  /**
   * Given：缓存已有两个条目
   * When：执行 clear
   * Then：全部条目清空、字节账本归零
   * 防回归：reset 后缓存残留会让重置语义失效
   */
  it('clear 清空已有条目与统计', () => {
    const cache = createSliceResultCache()
    const keyA = buildSliceCacheKey(keyInput({ imageIdentity: 'img-a' }))
    const keyB = buildSliceCacheKey(keyInput({ imageIdentity: 'img-b' }))
    const genA = cache.begin(keyA)
    const genB = cache.begin(keyB)
    cache.settle(keyA, makeEntry(2, 10), genA.token)
    cache.settle(keyB, makeEntry(1, 10), genB.token)
    cache.clear()
    expect(cache.lookup(keyA)).toBeNull()
    expect(cache.lookup(keyB)).toBeNull()
    expect(cache.stats()).toEqual({ entries: 0, blobBytes: 0 })
  })

  /**
   * Given：两个不同图片内容标识的条目均在缓存中
   * When：invalidate 其中一个标识
   * Then：仅该标识的条目被清理，另一图片条目不受影响；未知标识为空操作
   * 防回归：定向清理误伤其他图片会制造不必要的重切
   */
  it('invalidate 定向清理指定图片标识的条目', () => {
    const cache = createSliceResultCache()
    const keyA = buildSliceCacheKey(keyInput({ imageIdentity: 'img-a' }))
    const keyB = buildSliceCacheKey(keyInput({ imageIdentity: 'img-b' }))
    const genA = cache.begin(keyA)
    const genB = cache.begin(keyB)
    cache.settle(keyA, makeEntry(), genA.token)
    cache.settle(keyB, makeEntry(), genB.token)
    cache.invalidate('img-a')
    expect(cache.lookup(keyA)).toBeNull()
    expect(cache.lookup(keyB)).not.toBeNull()
    expect(cache.stats()).toEqual({ entries: 1, blobBytes: 20 })
    cache.invalidate('img-unknown')
    expect(cache.lookup(keyB)).not.toBeNull()
  })

  /**
   * Given：条目上限为 1，已缓存条目 X 的键又存在进行中生成（防御场景）
   * When：写入条目 Y 触发逐出，随后 X 键的 in-flight 记录被 abandon 释放
   * Then：Y 写入时 X 因被等待而延迟逐出（允许暂时超限），释放后重算逐出将 X 清出
   * 防回归：逐出无视 in-flight 等待会让跟随者在 settle 前失去被合并的结果语境
   */
  it('被 in-flight 等待的条目延迟逐出，释放后重算', () => {
    const cache = createSliceResultCache({ maxEntries: 1, maxBlobBytes: 1024 })
    const keyX = buildSliceCacheKey(keyInput({ imageIdentity: 'img-x' }))
    const keyY = buildSliceCacheKey(keyInput({ imageIdentity: 'img-y' }))
    const firstGenX = cache.begin(keyX)
    cache.settle(keyX, makeEntry(1, 10), firstGenX.token)
    // 防御场景：已缓存条目的键再次进入 in-flight
    const secondGenX = cache.begin(keyX)
    expect(secondGenX.isLeader).toBe(true)
    const genY = cache.begin(keyY)
    cache.settle(keyY, makeEntry(1, 10), genY.token)
    // 最旧的 X 正被等待：延迟逐出，暂时超限（此处不得 lookup X，命中会提升其 LRU 位次改变逐出顺序）
    expect(cache.stats()).toEqual({ entries: 2, blobBytes: 20 })
    // 等待释放后重算逐出：X 被清出，Y 保留
    cache.abandon(keyX, secondGenX.token)
    expect(cache.stats()).toEqual({ entries: 1, blobBytes: 10 })
    expect(cache.lookup(keyX)).toBeNull()
    expect(cache.lookup(keyY)).not.toBeNull()
  })

  /**
   * Given：条目已入缓存并被 lookup 取回
   * When：检查条目与元数据的字段集合
   * Then：tile 仅含 blob 与 meta，meta 仅含 row/col/width/height——绝无 Object URL、随机 id 或文件名
   * 防回归：缓存混入易失字段会导致跨命名复用失效或 URL 失效引用
   */
  it('缓存条目仅含 Blob 与稳定元数据，无 URL/id/文件名', () => {
    const cache = createSliceResultCache()
    const key = buildSliceCacheKey(keyInput())
    const { token } = cache.begin(key)
    cache.settle(key, makeEntry(2, 10), token)
    const hit = cache.lookup(key)
    expect(hit).not.toBeNull()
    for (const tile of hit!.tiles) {
      expect(Object.keys(tile).sort()).toEqual(['blob', 'meta'])
      expect(Object.keys(tile.meta).sort()).toEqual(['col', 'height', 'row', 'width'])
    }
  })
})
