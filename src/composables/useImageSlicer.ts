import imageCompression from 'browser-image-compression'
import { computed, reactive, ref, shallowRef } from 'vue'
import { computeTileRects, type GridPreset } from '../utils/grid'
import type { LocaleMessages } from './useLocale'
import type { ExportFormat } from './useLocale'

export interface TileResult {
  name: string
  blob: Blob
  previewUrl: string
  row: number
  col: number
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

export function useImageSlicer({ selectedPreset, exportFormat, jpgQuality, gridDescription, currentMessages }: ImageSlicerDeps) {
  const fileInput = ref<HTMLInputElement | null>(null)
  const previewUrl = ref<string | null>(null)
  const tiles = ref<TileResult[]>([])
  const originalImage = shallowRef<HTMLImageElement | null>(null)
  const originalObjectUrl = ref<string | null>(null)
  const baseName = ref('tile')
  const imageSize = ref<{ width: number; height: number } | null>(null)

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

  const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '') || 'tile'

  const cleanupAll = () => {
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value)
      previewUrl.value = null
    }
    tiles.value.forEach((tile) => URL.revokeObjectURL(tile.previewUrl))
    tiles.value = []
    if (originalObjectUrl.value) {
      URL.revokeObjectURL(originalObjectUrl.value)
      originalObjectUrl.value = null
    }
  }

  const resetApp = () => {
    cleanupAll()
    originalImage.value = null
    imageSize.value = null
    baseName.value = 'tile'
    state.dragOver = false
    clearError()
    state.processing = false
    setStatus('waiting')
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

  const splitImage = async (img: HTMLImageElement) => {
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
      const nameBase = isSingleTile ? baseName.value : `${baseName.value}-r${rect.row}c${rect.col}`
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

  const triggerDownloads = async () => {
    if (!tiles.value.length) return
    setStatus('batchDownloading')
    for (const tile of tiles.value) {
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
    setStatus('triggered', { count: tiles.value.length })
  }

  const processAndDownload = async (autoDownload = true) => {
    if (!originalImage.value || state.processing) return
    clearError()
    state.processing = true
    setStatus('processing')
    tiles.value.forEach((tile) => URL.revokeObjectURL(tile.previewUrl))
    tiles.value = []
    try {
      const nextTiles = await splitImage(originalImage.value)
      tiles.value = nextTiles
      const payload = { count: nextTiles.length, grid: gridDescription.value }
      setStatus(autoDownload ? 'finished' : 'manual', payload)
      if (autoDownload) {
        await triggerDownloads()
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

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('invalidFile')
      return
    }

    cleanupAll()
    baseName.value = stripExtension(file.name)
    setStatus('loading')
    const objectUrl = URL.createObjectURL(file)
    originalObjectUrl.value = objectUrl

    try {
      const img = await loadImage(objectUrl)
      originalImage.value = img
      imageSize.value = { width: img.naturalWidth, height: img.naturalHeight }
      previewUrl.value = objectUrl
      await processAndDownload(true)
    } catch (err) {
      setError('loadFailed', err instanceof Error ? err.message : '')
    }
  }

  const onFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (file) await handleFile(file)
    target.value = ''
  }

  const onDrop = async (event: DragEvent) => {
    event.preventDefault()
    state.dragOver = false
    const file = event.dataTransfer?.files?.[0]
    if (file) await handleFile(file)
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
    const file = event.dataTransfer?.files?.[0]
    if (file) await handleFile(file)
  }

  return {
    fileInput,
    previewUrl,
    tiles,
    originalImage,
    baseName,
    imageSize,
    state,
    statusText,
    statusState,
    setStatus,
    setError,
    clearError,
    cleanupAll,
    resetApp,
    triggerDownloads,
    processAndDownload,
    handleFile,
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
