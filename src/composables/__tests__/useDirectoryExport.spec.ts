import { describe, expect, it, vi } from 'vitest'
import { useDirectoryExport, type DirectoryHandleLike, type DirectoryStorage } from '../useDirectoryExport'

const memoryStorage = (initial: DirectoryHandleLike | null = null): DirectoryStorage & { saved: DirectoryHandleLike | null } => ({
  saved: initial,
  async load() { return this.saved },
  async save(handle) { this.saved = handle },
})

const createDirectory = (options: { existing?: string[]; permission?: PermissionState; failOnWrite?: string } = {}) => {
  const names = new Set(options.existing)
  let permission = options.permission ?? 'granted'
  const writes: string[] = []
  const directory: DirectoryHandleLike = {
    async queryPermission() { return permission },
    async requestPermission() { permission = 'granted'; return permission },
    async getFileHandle(name, createOptions) {
      if (!createOptions?.create) {
        if (!names.has(name)) throw new DOMException('missing', 'NotFoundError')
        return { async createWritable() { return { async write() {}, async close() {} } } }
      }
      names.add(name)
      return {
        async createWritable() {
          return {
            async write() {
              if (name === options.failOnWrite) throw new Error('write failed')
              writes.push(name)
            },
            async close() {},
          }
        },
      }
    },
  }
  return { directory, writes }
}

describe('useDirectoryExport', () => {
  /**
   * Given：浏览器没有提供 showDirectoryPicker
   * When：用户触发手动导出准备
   * Then：module 明确返回不可用且不尝试选择目录
   * 防回归：不支持 File System Access API 的浏览器必须保留传统下载路径
   */
  it('在不支持目录选择器时返回传统下载所需的不可用结果', async () => {
    const exporter = useDirectoryExport({ storage: memoryStorage() })

    expect(exporter.isSupported.value).toBe(false)
    await expect(exporter.prepareManualExport()).resolves.toBe(false)
  })

  /**
   * Given：用户选定的目录已含有同名文件
   * When：写入同名切片
   * Then：module 使用 -1 后缀写入，并持久化目录句柄
   * 防回归：目录直写绝不能覆盖用户此前的切片
   */
  it('为重名文件生成 -1 后缀并持久化目录句柄', async () => {
    const { directory, writes } = createDirectory({ existing: ['photo.png'] })
    const storage = memoryStorage()
    const picker = vi.fn(async () => directory)
    const exporter = useDirectoryExport({ showDirectoryPicker: picker, storage })

    await expect(exporter.prepareManualExport()).resolves.toBe(true)
    const result = await exporter.writeFiles([{ name: 'photo.png', blob: new Blob(['tile']) }])

    expect(result.kind).toBe('complete')
    expect(writes).toEqual(['photo-1.png'])
    expect(storage.saved).toBe(directory)
    expect(picker).toHaveBeenCalledOnce()
  })

  /**
   * Given：IndexedDB 恢复的目录句柄权限为 prompt
   * When：用户点击下载全部并准备手动导出
   * Then：module 请求一次写入授权后复用原目录
   * 防回归：刷新页面后不能因句柄恢复而绕过浏览器授权模型
   */
  it('在恢复句柄需要授权时通过用户点击重新请求权限', async () => {
    const { directory } = createDirectory({ permission: 'prompt' })
    const requestPermission = vi.spyOn(directory, 'requestPermission')
    const exporter = useDirectoryExport({ showDirectoryPicker: vi.fn(), storage: memoryStorage(directory) })

    await expect(exporter.restore()).resolves.toBe(false)
    await expect(exporter.prepareManualExport()).resolves.toBe(true)

    expect(requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
    expect(exporter.hasWritableDirectory.value).toBe(true)
  })

  /**
   * Given：自动下载开启但应用尚未保存任何目录句柄
   * When：自动流程检查是否可以目录直写
   * Then：检查返回 false，且绝不主动打开目录选择器
   * 防回归：非用户点击上下文不得触发受 transient user activation 限制的系统对话框
   */
  it('自动导出没有已授权目录时不打开目录选择器', async () => {
    const picker = vi.fn()
    const exporter = useDirectoryExport({ showDirectoryPicker: picker, storage: memoryStorage() })

    await expect(exporter.canAutoExport()).resolves.toBe(false)

    expect(picker).not.toHaveBeenCalled()
  })

  /**
   * Given：目录写入第二个文件时发生异常
   * When：module 按顺序写入多个切片
   * Then：已写入文件被保留，失败文件及其后续文件作为待重试结果返回
   * 防回归：部分失败不能静默改为浏览器默认目录下载
   */
  it('在中途写入失败时返回未完成文件而不继续写入', async () => {
    const { directory, writes } = createDirectory({ failOnWrite: 'second.png' })
    const exporter = useDirectoryExport({ showDirectoryPicker: async () => directory, storage: memoryStorage() })
    await exporter.prepareManualExport()
    const files = ['first.png', 'second.png', 'third.png'].map((name) => ({ name, blob: new Blob([name]) }))

    const result = await exporter.writeFiles(files)

    expect(result.kind).toBe('partial')
    expect(result.written.map((file) => file.name)).toEqual(['first.png'])
    expect(result.pending.map((file) => file.name)).toEqual(['second.png', 'third.png'])
    expect(writes).toEqual(['first.png'])
  })
})
