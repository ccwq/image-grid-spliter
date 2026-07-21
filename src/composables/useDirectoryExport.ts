import { ref } from 'vue'

export interface DirectoryExportFile {
  name: string
  blob: Blob
}

export interface FileHandleLike {
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>
}

export interface DirectoryHandleLike {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>
}

export interface DirectoryStorage {
  load(): Promise<DirectoryHandleLike | null>
  save(handle: DirectoryHandleLike): Promise<void>
}

export interface DirectoryExportOptions {
  showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<DirectoryHandleLike>
  showSaveFilePicker?: (options: FileSavePickerOptions) => Promise<FileHandleLike>
  storage?: DirectoryStorage
}

export interface FileSavePickerOptions {
  suggestedName: string
  types: Array<{ description: string; accept: Record<string, string[]> }>
}

export type DirectoryExportResult<T extends DirectoryExportFile = DirectoryExportFile> =
  | { kind: 'complete'; written: T[]; pending: T[]; renamed: number }
  | { kind: 'partial'; written: T[]; pending: T[]; renamed: number }

export type SaveAsResult = 'saved' | 'unsupported' | 'cancelled' | 'failed'

const DATABASE_NAME = 'image-grid-spliter'
const STORE_NAME = 'directory-export'
const HANDLE_KEY = 'selected-directory'

const getPicker = () => (window as Window & { showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<DirectoryHandleLike> }).showDirectoryPicker
const getSavePicker = () => (window as Window & { showSaveFilePicker?: (options: FileSavePickerOptions) => Promise<FileHandleLike> }).showSaveFilePicker

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, 1)
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

const browserStorage: DirectoryStorage = {
  async load() {
    if (typeof indexedDB === 'undefined') return null
    try {
      const db = await openDatabase()
      return await new Promise<DirectoryHandleLike | null>((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(HANDLE_KEY)
        request.onsuccess = () => resolve((request.result as DirectoryHandleLike | undefined) ?? null)
        request.onerror = () => reject(request.error)
      })
    } catch {
      return null
    }
  },
  async save(handle) {
    if (typeof indexedDB === 'undefined') return
    try {
      const db = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(handle, HANDLE_KEY)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch {
      // 浏览器可能禁止持久化句柄；当前会话仍可使用内存中的句柄。
    }
  },
}

const isMissingFileError = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError'

const withSuffix = (name: string, suffix: number) => {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  return `${base}-${suffix}${extension}`
}

/**
 * 将浏览器目录能力收敛在一个 module 中；调用方只处理准备结果和写入结果。
 */
export function useDirectoryExport(options: DirectoryExportOptions = {}) {
  const picker = options.showDirectoryPicker ?? (typeof window === 'undefined' ? undefined : getPicker())
  const savePicker = options.showSaveFilePicker ?? (typeof window === 'undefined' ? undefined : getSavePicker())
  const storage = options.storage ?? browserStorage
  const isSupported = ref(Boolean(picker))
  const hasWritableDirectory = ref(false)
  let directory: DirectoryHandleLike | null = null

  const setDirectory = async (handle: DirectoryHandleLike) => {
    directory = handle
    hasWritableDirectory.value = true
    await storage.save(handle)
  }

  const permissionState = async () => directory ? directory.queryPermission({ mode: 'readwrite' }) : 'denied'

  const restore = async () => {
    directory = await storage.load()
    if (!directory) return false
    hasWritableDirectory.value = await permissionState() === 'granted'
    return hasWritableDirectory.value
  }

  const chooseDirectory = async () => {
    if (!picker) return false
    try {
      await setDirectory(await picker({ mode: 'readwrite' }))
      return true
    } catch {
      return false
    }
  }

  /** 必须从直接的用户点击中调用，才能消费浏览器的 transient user activation。 */
  const prepareManualExport = async () => {
    if (!picker) return false
    if (!directory) return chooseDirectory()

    const current = await permissionState()
    if (current === 'granted') {
      hasWritableDirectory.value = true
      return true
    }
    if (current !== 'prompt') {
      hasWritableDirectory.value = false
      return false
    }

    try {
      hasWritableDirectory.value = await directory.requestPermission({ mode: 'readwrite' }) === 'granted'
      return hasWritableDirectory.value
    } catch {
      hasWritableDirectory.value = false
      return false
    }
  }

  const canAutoExport = async () => {
    hasWritableDirectory.value = await permissionState() === 'granted'
    return hasWritableDirectory.value
  }

  const findAvailableName = async (name: string) => {
    if (!directory) throw new Error('No export directory selected')
    for (let suffix = 0; suffix < 10000; suffix += 1) {
      const candidate = suffix === 0 ? name : withSuffix(name, suffix)
      try {
        await directory.getFileHandle(candidate)
      } catch (error) {
        if (isMissingFileError(error)) return candidate
        throw error
      }
    }
    throw new Error('Too many files with the same name')
  }

  const writeFiles = async <T extends DirectoryExportFile>(files: T[], onProgress?: (current: number, total: number) => void): Promise<DirectoryExportResult<T>> => {
    if (!directory) return { kind: 'partial', written: [], pending: files, renamed: 0 }
    const written: DirectoryExportFile[] = []
    let renamed = 0
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      try {
        const name = await findAvailableName(file.name)
        const handle = await directory.getFileHandle(name, { create: true })
        const writer = await handle.createWritable()
        await writer.write(file.blob)
        await writer.close()
        written.push(file)
        if (name !== file.name) renamed += 1
        onProgress?.(written.length, files.length)
      } catch {
        return { kind: 'partial', written, pending: files.slice(index), renamed }
      }
    }
    return { kind: 'complete', written, pending: [], renamed }
  }

  /** 另存为保持为显式用户动作，不会回退为浏览器下载。 */
  const saveFileAs = async (file: DirectoryExportFile): Promise<SaveAsResult> => {
    if (!savePicker) return 'unsupported'
    const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
    try {
      const handle = await savePicker({
        suggestedName: file.name,
        types: [{ description: 'Image file', accept: { [file.blob.type || 'application/octet-stream']: extension ? [extension] : [] } }],
      })
      const writer = await handle.createWritable()
      await writer.write(file.blob)
      await writer.close()
      return 'saved'
    } catch (error) {
      return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed'
    }
  }

  return {
    isSupported,
    hasWritableDirectory,
    restore,
    chooseDirectory,
    prepareManualExport,
    canAutoExport,
    writeFiles,
    saveFileAs,
  }
}
