import imageCompression from 'browser-image-compression'
import { computed, reactive, ref } from 'vue'
import { computeTileRectsFromLines, type GridPreset, type SlicePlan } from '../utils/grid'
import type { LocaleMessages, ExportFormat } from './useLocale'
import { useDirectoryExport } from './useDirectoryExport'
import {fileSha256} from "../utils/fileUtils.ts";

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

interface ImageSlicerDeps {
  selectedPreset: { value: GridPreset }
  slicePlan: { value: SlicePlan }
  exportFormat: { value: ExportFormat }
  jpgQuality: { value: number }
  gridDescription: { value: string }
  currentMessages: { value: LocaleMessages }
}

const AUTO_DOWNLOAD_KEY = 'igs:auto-download'

export function useImageSlicer({ selectedPreset, slicePlan, exportFormat, jpgQuality, gridDescription, currentMessages }: ImageSlicerDeps) {
  const fileInput = ref<HTMLInputElement | null>(null)
  const images = ref<ImageItem[]>([])
  const autoDownload = ref(false)
  const directoryExport = useDirectoryExport()
  const pendingTraditionalDownloads = ref<TileResult[] | null>(null)
  const exportProgress = reactive<ExportProgress>({ phase: 'hidden', current: 0, total: 0, report: null })
  let progressDismissTimer: ReturnType<typeof setTimeout> | null = null
  // 记录正在入队的文件，防止并发/重复触发的拖拽导致重复添加
  const pendingIds = new Set<string>()
  const totalTiles = computed(() => images.value.reduce((sum, item) => sum + item.tiles.length, 0))
  const firstImageSize = computed(() => images.value[0]?.size ?? null)

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
    dismissExportProgress()
  }

  const resetApp = () => {
    cleanupAll()
    selectedPreset.value = selectedPreset.value
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

  const splitImage = async (img: HTMLImageElement, baseName: string, onTileGenerated?: () => void, shouldCancel?: () => boolean) => {
    const rects = computeTileRectsFromLines(img.naturalWidth, img.naturalHeight, slicePlan.value)
      .filter((rect) => rect.width > 0 && rect.height > 0)
    const result: TileResult[] = []
    const isSingleTile = rects.length === 1
    const fileExt = exportFormat.value === 'png' ? 'png' : 'jpg'

    for (const rect of rects) {
      if (shouldCancel?.()) break
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
        id: `${baseName}-${rect.row}-${rect.col}-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
        name: `${nameBase}.${fileExt}`,
        blob: finalBlob,
        previewUrl: url,
        row: rect.row,
        col: rect.col,
        width: rect.width,
        height: rect.height,
      })
      onTileGenerated?.()
    }

    return result
  }

  const downloadTiles = async (items: ImageItem[], trackProgress = false) => {
    const allTiles = items.flatMap((item) => item.tiles)
    if (!allTiles.length) return
    setStatus('batchDownloading')
    if (trackProgress) beginExportProgress('downloading', allTiles.length)
    for (const [index, tile] of allTiles.entries()) {
      const link = document.createElement('a')
      link.href = tile.previewUrl
      link.download = tile.name
      link.rel = 'noopener'
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      link.remove()
      if (trackProgress) updateExportProgress(index + 1, allTiles.length)
      await new Promise((r) => setTimeout(r, 80))
    }
    setStatus('triggered', { count: allTiles.length })
    if (trackProgress) completeExportProgress({ mode: 'traditional', completed: allTiles.length, total: allTiles.length, renamed: 0, pending: 0 })
  }

  const writeTilesToDirectory = async (items: ImageItem[], trackProgress = false) => {
    const files = items.flatMap((item) => item.tiles).map((tile) => ({ name: tile.name, blob: tile.blob, tile }))
    if (!files.length) return
    setStatus('batchDownloading')
    if (trackProgress) beginExportProgress('saving', files.length)
    const result = await directoryExport.writeFiles(files, (current, total) => {
      if (trackProgress) updateExportProgress(current, total)
    })
    if (result.kind === 'partial') {
      pendingTraditionalDownloads.value = result.pending.map((file) => file.tile)
      setStatus('triggered', { count: result.written.length })
      if (trackProgress) completeExportProgress({ mode: 'directory', completed: result.written.length, total: files.length, renamed: result.renamed, pending: result.pending.length })
      return
    }
    pendingTraditionalDownloads.value = null
    setStatus('triggered', { count: result.written.length })
    if (trackProgress) completeExportProgress({ mode: 'directory', completed: result.written.length, total: files.length, renamed: result.renamed, pending: 0 })
  }

  const cancelProcessing = () => { if (state.processing) state.cancelRequested = true }

  const processAll = async (autoDownloadNow: boolean, trackProgress = true) => {
    if (!images.value.length || state.processing) {
      if (!images.value.length) setStatus('waiting')
      return
    }
    clearError()
    state.processing = true
    state.cancelRequested = false
    setStatus('processing')
    images.value.forEach((item) => { item.tiles.forEach((tile) => URL.revokeObjectURL(tile.previewUrl)); item.tiles = [] })

    try {
      const expectedTotal = images.value.reduce((sum, item) => sum + computeTileRectsFromLines(item.image.naturalWidth, item.image.naturalHeight, slicePlan.value).filter((rect) => rect.width > 0 && rect.height > 0).length, 0)
      let generatedCount = 0
      beginExportProgress('generating', expectedTotal)
      let totalCount = 0
      for (const item of images.value) {
        item.tiles = await splitImage(item.image, item.baseName, () => {
          generatedCount += 1
          updateExportProgress(generatedCount, expectedTotal)
        }, () => state.cancelRequested)
        totalCount += item.tiles.length
        if (state.cancelRequested) break
      }
      if (state.cancelRequested) {
        setStatus('manual', { count: totalCount, grid: gridDescription.value })
        completeExportProgress({ mode: 'generation', completed: generatedCount, total: expectedTotal, renamed: 0, pending: Math.max(0, expectedTotal - generatedCount) })
        return
      }
      const payload = { count: totalCount, grid: gridDescription.value }
      setStatus(autoDownloadNow ? 'finished' : 'manual', payload)
      if (autoDownloadNow) {
        if (await directoryExport.canAutoExport()) await writeTilesToDirectory(images.value, trackProgress)
        else await downloadTiles(images.value, trackProgress)
      } else completeExportProgress({ mode: 'generation', completed: totalCount, total: expectedTotal, renamed: 0, pending: 0 })
    } catch (err) {
      setError('processingFailed', err instanceof Error ? err.message : '')
      if (trackProgress) completeExportProgress({ mode: 'generation', completed: exportProgress.current, total: exportProgress.total, renamed: 0, pending: Math.max(0, exportProgress.total - exportProgress.current) })
    } finally {
      state.processing = false
      state.cancelRequested = false
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
    const  imageFiles = fileArray.filter((file) => file.type.startsWith('image/'))
    const getFileId = (file: File):string => {
      return [file.name, file.lastModified, file.size].join('-');
    }

    if (imageFiles.length !== fileArray.length) {
      setError('invalidFile')
    }
    if (!imageFiles.length) {
      return
    }

    setStatus('loading')
    for (const file of imageFiles) {
      const objectUrl = URL.createObjectURL(file)
      const shaId = await fileSha256(file)

      // 已在队列或正在处理中，直接跳过并回收临时 URL
      if (images.value.find((el) => el.id === shaId) || pendingIds.has(shaId)) {
        URL.revokeObjectURL(objectUrl)
        continue
      }

      pendingIds.add(shaId)
      try {
        const img = await loadImage(objectUrl)
        images.value.push({
          id: shaId,
          baseName: stripExtension(file.name),
          objectUrl,
          image: img,
          size: { width: img.naturalWidth, height: img.naturalHeight },
          tiles: [],
        })
      } catch (err) {
        URL.revokeObjectURL(objectUrl)
        setError('loadFailed', err instanceof Error ? err.message : '')
      } finally {
        pendingIds.delete(shaId)
      }
    }

    await processAll(autoDownload.value, autoDownload.value)
  }

  const triggerDownloads = async () => {
    if (!images.value.length) return
    pendingTraditionalDownloads.value = null
    // 目录选择必须在此用户点击路径开始时进行，不能等待异步裁切完成。
    const writeToDirectory = await directoryExport.prepareManualExport()
    await processAll(false, true)
    if (writeToDirectory) await writeTilesToDirectory(images.value, true)
    else await downloadTiles(images.value, true)
  }

  const retryPendingTraditionalDownloads = async () => {
    if (!pendingTraditionalDownloads.value?.length) return
    const pending = pendingTraditionalDownloads.value
    pendingTraditionalDownloads.value = null
    await downloadTiles([{ tiles: pending } as ImageItem], true)
  }

  const changeExportDirectory = async () => {
    await directoryExport.chooseDirectory()
  }

  const downloadSingleImage = async (id: string) => {
    const target = images.value.find((img) => img.id === id)
    if (!target || state.processing) return
    clearError()
    state.processing = true
    setStatus('processing')
    target.tiles.forEach((tile) => URL.revokeObjectURL(tile.previewUrl))
    try {
      const expectedTotal = computeTileRectsFromLines(target.image.naturalWidth, target.image.naturalHeight, slicePlan.value).filter((rect) => rect.width > 0 && rect.height > 0).length
      let generatedCount = 0
      beginExportProgress('generating', expectedTotal)
      target.tiles = await splitImage(target.image, target.baseName, () => {
        generatedCount += 1
        updateExportProgress(generatedCount, expectedTotal)
      })
      setStatus('manual', { count: target.tiles.length, grid: gridDescription.value })
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

  // 初始化持久化的自动下载开关
  restoreAutoDownload()
  void directoryExport.restore()

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
    cancelProcessing,
    exportProgress,
    dismissExportProgress,
    directoryExportSupported: directoryExport.isSupported,
    directoryExportReady: directoryExport.hasWritableDirectory,
    pendingTraditionalDownloads,
    changeExportDirectory,
    retryPendingTraditionalDownloads,
    addFiles,
    onFileChange,
    onDrop,
    onDragOver,
    onDragLeave,
    handleGlobalDragOver,
    handleGlobalDrop,
    triggerFileSelect,
  }
}
