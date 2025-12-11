import imageCompression from 'browser-image-compression'
import { computed, reactive, ref } from 'vue'
import { computeTileRects, type GridPreset } from '../utils/grid'
import type { LocaleMessages, ExportFormat } from './useLocale'

export interface TileResult {
  name: string
  blob: Blob
  previewUrl: string
  row: number
  col: number
}

export interface ImageItem {
  id: string
  baseName: string
  objectUrl: string
  image: HTMLImageElement
  size: { width: number; height: number }
  tiles: TileResult[]
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

interface ImageSlicerDeps {
  selectedPreset: { value: GridPreset }
  exportFormat: { value: ExportFormat }
  jpgQuality: { value: number }
  gridDescription: { value: string }
  currentMessages: { value: LocaleMessages }
}

const AUTO_DOWNLOAD_KEY = 'igs:auto-download'

export function useImageSlicer({ selectedPreset, exportFormat, jpgQuality, gridDescription, currentMessages }: ImageSlicerDeps) {
  const fileInput = ref<HTMLInputElement | null>(null)
  const images = ref<ImageItem[]>([])
  const autoDownload = ref(false)
  const totalTiles = computed(() => images.value.reduce((sum, item) => sum + item.tiles.length, 0))
  const firstImageSize = computed(() => images.value[0]?.size ?? null)

  const state = reactive({
    dragOver: false,
    processing: false,
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

  const persistAutoDownload = () => {
    try {
      localStorage.setItem(AUTO_DOWNLOAD_KEY, autoDownload.value ? '1' : '0')
    } catch {
      // ignore storage errors
    }
  }

  const restoreAutoDownload = () => {
    try {
      autoDownload.value = localStorage.getItem(AUTO_DOWNLOAD_KEY) === '1'
    } catch {
      autoDownload.value = false
    }
  }

  const setAutoDownload = (val: boolean) => {
    autoDownload.value = val
    persistAutoDownload()
  }

  const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '') || 'tile'
  const generateId = () => (crypto.randomUUID ? crypto.randomUUID() : `img-${Date.now()}-${Math.random().toString(16).slice(2)}`)

  const cleanupItem = (item: ImageItem) => {
    item.tiles.forEach((tile) => URL.revokeObjectURL(tile.previewUrl))
    URL.revokeObjectURL(item.objectUrl)
  }

  const cleanupAll = () => {
    images.value.forEach((item) => cleanupItem(item))
    images.value = []
    state.dragOver = false
    clearError()
    state.processing = false
    setStatus('waiting')
  }

  const resetApp = () => {
    cleanupAll()
    selectedPreset.value = selectedPreset.value
  }

  const requestDownloadPermission = async () => {
    const permissions = (navigator as Partial<Navigator> & { permissions?: { query?: (init: unknown) => Promise<unknown> } }).permissions
    if (permissions?.query) {
      try {
        await permissions.query({ name: 'downloads' } as unknown)
      } catch {
        // ignore
      }
    }
  }

  const triggerFileSelect = () => fileInput.value?.click()

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

  const splitImage = async (img: HTMLImageElement, baseName: string) => {
    const rects = computeTileRects(img.naturalWidth, img.naturalHeight, selectedPreset.value.rows, selectedPreset.value.cols)
    const result: TileResult[] = []
    const isSingleTile = rects.length === 1
    const fileExt = exportFormat.value === 'png' ? 'png' : 'jpg'

    for (const rect of rects) {
      const canvas = document.createElement('canvas')
      canvas.width = rect.width
      canvas.height = rect.height
      const ctx = canvas.getContext('2d')
      if (!ctx) continue

      ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)

      const rawBlob = await canvasToBlob(canvas, 'image/png')
      let finalBlob: Blob = rawBlob

      if (exportFormat.value === 'jpg') {
        try {
          finalBlob = await imageCompression(rawBlob, {
            fileType: 'image/jpeg',
            initialQuality: jpgQuality.value,
            maxWidthOrHeight: Math.max(rect.width, rect.height),
            useWebWorker: true,
          })
        } catch (err) {
          console.error('JPG compression failed, fallback to canvas output', err)
          finalBlob = await canvasToBlob(canvas, 'image/jpeg', jpgQuality.value)
        }
      }

      const url = URL.createObjectURL(finalBlob)
      const nameBase = isSingleTile ? baseName : `${baseName}-r${rect.row}c${rect.col}`
      result.push({
        name: `${nameBase}.${fileExt}`,
        blob: finalBlob,
        previewUrl: url,
        row: rect.row,
        col: rect.col,
      })
    }

    return result
  }

  const downloadTiles = async (items: ImageItem[]) => {
    const allTiles = items.flatMap((item) => item.tiles)
    if (!allTiles.length) return
    setStatus('batchDownloading')
    for (const tile of allTiles) {
      const link = document.createElement('a')
      link.href = tile.previewUrl
      link.download = tile.name
      link.rel = 'noopener'
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      link.remove()
      await new Promise((r) => setTimeout(r, 80))
    }
    setStatus('triggered', { count: allTiles.length })
  }

  const processAll = async (autoDownloadNow: boolean) => {
    if (!images.value.length || state.processing) {
      if (!images.value.length) setStatus('waiting')
      return
    }
    clearError()
    state.processing = true
    setStatus('processing')
    images.value.forEach((item) => item.tiles.forEach((tile) => URL.revokeObjectURL(tile.previewUrl)))

    try {
      let totalCount = 0
      for (const item of images.value) {
        item.tiles = await splitImage(item.image, item.baseName)
        totalCount += item.tiles.length
      }
      const payload = { count: totalCount, grid: gridDescription.value }
      setStatus(autoDownloadNow ? 'finished' : 'manual', payload)
      if (autoDownloadNow) {
        await downloadTiles(images.value)
      }
    } catch (err) {
      setError('processingFailed', err instanceof Error ? err.message : '')
    } finally {
      state.processing = false
    }
  }

  const loadImage = (objectUrl: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(currentMessages.value.errors.loadFailed))
      img.src = objectUrl
    })

  const addFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const imageFiles = fileArray.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length !== fileArray.length) {
      setError('invalidFile')
    }
    if (!imageFiles.length) {
      return
    }

    setStatus('loading')
    for (const file of imageFiles) {
      const objectUrl = URL.createObjectURL(file)
      try {
        const img = await loadImage(objectUrl)
        images.value.push({
          id: generateId(),
          baseName: stripExtension(file.name),
          objectUrl,
          image: img,
          size: { width: img.naturalWidth, height: img.naturalHeight },
          tiles: [],
        })
      } catch (err) {
        URL.revokeObjectURL(objectUrl)
        setError('loadFailed', err instanceof Error ? err.message : '')
      }
    }

    await processAll(autoDownload.value)
  }

  const triggerDownloads = async () => {
    if (!images.value.length) return
    await processAll(false)
    await downloadTiles(images.value)
  }

  const downloadSingleImage = async (id: string) => {
    const target = images.value.find((img) => img.id === id)
    if (!target || state.processing) return
    clearError()
    state.processing = true
    setStatus('processing')
    target.tiles.forEach((tile) => URL.revokeObjectURL(tile.previewUrl))
    try {
      target.tiles = await splitImage(target.image, target.baseName)
      setStatus('manual', { count: target.tiles.length, grid: gridDescription.value })
      await downloadTiles([target])
    } catch (err) {
      setError('processingFailed', err instanceof Error ? err.message : '')
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
    state.dragOver = false
    const files = event.dataTransfer?.files
    if (files && files.length) await addFiles(files)
  }

  // 初始化持久化的自动下载开关
  restoreAutoDownload()

  return {
    fileInput,
    images,
    totalTiles,
    autoDownload,
    firstImageSize,
    state,
    statusText,
    statusState,
    setStatus,
    setAutoDownload,
    setError,
    clearError,
    cleanupAll,
    resetApp,
    triggerDownloads,
    downloadSingleImage,
    processAll,
    addFiles,
    onFileChange,
    onDrop,
    onDragOver,
    onDragLeave,
    handleGlobalDragOver,
    handleGlobalDrop,
    requestDownloadPermission,
    triggerFileSelect,
  }
}
