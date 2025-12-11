<script setup lang="ts">
import imageCompression from 'browser-image-compression'
import { Icon } from '@iconify/vue'
import pixelarticons from '@iconify-json/pixelarticons/icons.json'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import type { GridPreset } from './utils/grid'
import { computeTileRects, gridPresets } from './utils/grid'

interface TileResult {
  name: string
  blob: Blob
  previewUrl: string
  row: number
  col: number
}

type ExportFormat = 'png' | 'jpg'
type Locale = 'en' | 'zh-CN'
type StatusKey = 'waiting' | 'batchDownloading' | 'triggered' | 'processing' | 'finished' | 'manual' | 'loading'
type ErrorKey = 'none' | 'invalidFile' | 'processingFailed' | 'loadFailed' | 'customGridInvalid'

const LOCALE_STORAGE_KEY = 'igs:locale'
const STORAGE_KEYS = {
  format: 'igs:export-format',
  quality: 'igs:jpg-quality',
}
const DEFAULT_EXPORT_FORMAT: ExportFormat = 'jpg'
const DEFAULT_JPG_QUALITY = 80

const icons = {
  grid: pixelarticons.icons.grid,
  upload: pixelarticons.icons['cloud-upload'],
  download: pixelarticons.icons.download,
  image: pixelarticons.icons.image,
  flag: pixelarticons.icons.flag,
  info: pixelarticons.icons['info-box'],
}

const translations: Record<
  Locale,
  {
    meta: { eyebrow: string; title: string; description: string; hint: string }
    buttons: {
      chooseImage: string
      reDownload: string
      clear: string
      expandPresets: string
      collapsePresets: string
      useCustom: string
      downloadAgain: string
      processing: string
    }
    stats: { currentGrid: string; tileCount: string; imageSize: string; exportFormat: string; downloadStatus: string; notLoaded: string }
    grid: { eyebrow: string; title: string; subtitle: string; columns: string; rows: string; apply: string }
    export: { eyebrow: string; title: string; subtitle: string; formatLabel: string; qualityLabel: string; qualityAria: string }
    upload: { title: string; subtitle: string; tip: string; currentPrefix: string; sizePrefix: string }
    results: { original: string; emptyUpload: string; result: string; waiting: string; previewPlaceholder: string }
    status: {
      waiting: string
      batchDownloading: string
      triggered: (count: number) => string
      processing: string
      finished: (count: number, grid: string) => string
      manual: (count: number, grid: string) => string
      loading: string
    }
    errors: {
      invalidFile: string
      processingFailed: string
      loadFailed: string
      customGridInvalid: string
    }
    format: {
      gridDescription: (cols: number, rows: number) => string
      presetSub: (cols: number, rows: number) => string
      imageSize: (width: number, height: number) => string
      tilesHeading: (count: number) => string
      resultsSummary: (grid: string, base: string, fmt: string, quality: string, isJpg: boolean) => string
    }
    aria: { github: string; language: string }
  }
> = {
  'zh-CN': {
    meta: {
      eyebrow: 'PWA · 离线可用 · 移动端适配',
      title: '图片网格裁切器',
      description: '上传/拖拽图片，选择预设网格，自动裁切并批量下载结果',
      hint: '支持：1x1（纯压缩）、2x2、3x3、4x4、2x3、2x4、3x2、4x2、5x2、2x5。请允许浏览器多文件下载。',
    },
    buttons: {
      chooseImage: '选择图片',
      reDownload: '重新触发下载',
      clear: '清除当前图片',
      expandPresets: '展开更多预设',
      collapsePresets: '收起预设',
      useCustom: '使用自定义网格',
      downloadAgain: '再次下载',
      processing: '处理中...',
    },
    stats: {
      currentGrid: '当前网格',
      tileCount: '切片数量',
      imageSize: '图片尺寸',
      exportFormat: '导出格式',
      downloadStatus: '下载状态',
      notLoaded: '未加载',
    },
    grid: {
      eyebrow: '网格预设',
      title: '选择切割网格',
      subtitle: '更改网格后会重新裁切，需手动触发下载。',
      columns: '列',
      rows: '行',
      apply: '使用自定义网格',
    },
    export: {
      eyebrow: '导出设置',
      title: '选择输出格式',
      subtitle: '切换格式或压缩强度会重新生成结果，需手动下载。',
      formatLabel: '输出格式',
      qualityLabel: '压缩强度',
      qualityAria: 'JPG 压缩强度',
    },
    upload: {
      title: '拖拽图片到此处，或点击选择',
      subtitle: '将按当前网格裁切，可手动下载全部切片',
      tip: '提示：若浏览器阻止多文件下载，请在地址栏允许该站点的批量下载。',
      currentPrefix: '当前：',
      sizePrefix: '尺寸：',
    },
    results: {
      original: '原图',
      emptyUpload: '请先上传图片',
      result: '裁切结果',
      waiting: '等待裁切',
      previewPlaceholder: '裁切完成后将在此展示切片预览',
    },
    status: {
      waiting: '等待上传图片并选择网格',
      batchDownloading: '正在触发批量下载，请确认浏览器的多文件下载权限',
      triggered: (count: number) => `已触发 ${count} 个文件下载`,
      processing: '正在裁切/压缩并生成输出...',
      finished: (count: number, grid: string) => `裁切完成，共 ${count} 张（${grid}）`,
      manual: (count: number, grid: string) => `裁切完成，共 ${count} 张（${grid}），等待手动下载`,
      loading: '图片加载中...',
    },
    errors: {
      invalidFile: '请上传图片文件',
      processingFailed: '裁切失败',
      loadFailed: '图片处理失败',
      customGridInvalid: '自定义行列需为正整数',
    },
    format: {
      gridDescription: (cols: number, rows: number) => `${cols} 列 x ${rows} 行`,
      presetSub: (cols: number, rows: number) => `${cols} 列 · ${rows} 行`,
      imageSize: (width: number, height: number) => `${width} x ${height}`,
      tilesHeading: (count: number) => (count ? `${count} 个切片` : '等待裁切'),
      resultsSummary: (grid: string, base: string, fmt: string, quality: string, isJpg: boolean) => {
        const qualityText = isJpg ? `（质量 ${quality}）` : ''
        return `网格：${grid}，文件名前缀：${base}，格式：${fmt}${qualityText}`
      },
    },
    aria: {
      github: '前往 GitHub 仓库',
      language: '切换语言',
    },
  },
  en: {
    meta: {
      eyebrow: 'PWA · Offline ready · Mobile friendly',
      title: 'Image Grid Spliter',
      description: 'Upload or drag an image, choose a preset grid, auto slice and batch download',
      hint: 'Supports: 1x1 (compress only), 2x2, 3x3, 4x4, 2x3, 2x4, 3x2, 4x2, 5x2, 2x5. Please allow multi-file downloads.',
    },
    buttons: {
      chooseImage: 'Choose image',
      reDownload: 'Trigger downloads',
      clear: 'Clear image',
      expandPresets: 'Show more presets',
      collapsePresets: 'Hide presets',
      useCustom: 'Apply custom grid',
      downloadAgain: 'Download again',
      processing: 'Processing...',
    },
    stats: {
      currentGrid: 'Current grid',
      tileCount: 'Tiles',
      imageSize: 'Image size',
      exportFormat: 'Export format',
      downloadStatus: 'Download status',
      notLoaded: 'Not loaded',
    },
    grid: {
      eyebrow: 'Grid presets',
      title: 'Choose a slicing grid',
      subtitle: 'Switching presets re-slices the image; manual download is required.',
      columns: 'Cols',
      rows: 'Rows',
      apply: 'Apply custom grid',
    },
    export: {
      eyebrow: 'Export settings',
      title: 'Choose output format',
      subtitle: 'Changing format or quality regenerates results; download manually afterward.',
      formatLabel: 'Output format',
      qualityLabel: 'Quality',
      qualityAria: 'JPG quality',
    },
    upload: {
      title: 'Drop image here or click to select',
      subtitle: 'Slices by current grid and lets you download all tiles',
      tip: 'Tip: if the browser blocks multi-file downloads, allow batch downloads for this site.',
      currentPrefix: 'Current:',
      sizePrefix: 'Size:',
    },
    results: {
      original: 'Original',
      emptyUpload: 'Upload an image to preview',
      result: 'Sliced results',
      waiting: 'Waiting to slice',
      previewPlaceholder: 'Tile previews will appear here after slicing',
    },
    status: {
      waiting: 'Waiting for image upload and grid selection',
      batchDownloading: 'Triggering downloads, please allow multiple files',
      triggered: (count: number) => `Triggered ${count} file downloads`,
      processing: 'Slicing/compressing and generating output...',
      finished: (count: number, grid: string) => `Slicing done, ${count} tiles (${grid})`,
      manual: (count: number, grid: string) => `Slicing done, ${count} tiles (${grid}), waiting for manual download`,
      loading: 'Loading image...',
    },
    errors: {
      invalidFile: 'Please upload an image file',
      processingFailed: 'Slicing failed',
      loadFailed: 'Image processing failed',
      customGridInvalid: 'Rows/columns must be positive integers',
    },
    format: {
      gridDescription: (cols: number, rows: number) => `${cols} cols x ${rows} rows`,
      presetSub: (cols: number, rows: number) => `${cols} cols · ${rows} rows`,
      imageSize: (width: number, height: number) => `${width} x ${height}`,
      tilesHeading: (count: number) => (count ? `${count} tiles` : 'Waiting to slice'),
      resultsSummary: (grid: string, base: string, fmt: string, quality: string, isJpg: boolean) => {
        const qualityText = isJpg ? ` (quality ${quality})` : ''
        return `Grid: ${grid}, prefix: ${base}, format: ${fmt}${qualityText}`
      },
    },
    aria: {
      github: 'Open GitHub repo',
      language: 'Switch language',
    },
  },
}

const supportedLocales: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
]

const detectLocale = (): Locale => {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored === 'en' || stored === 'zh-CN') return stored
  } catch {
    // ignore storage errors
  }
  const lang = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en'
  return lang.startsWith('zh') ? 'zh-CN' : 'en'
}

const locale = ref<Locale>(detectLocale())
const currentMessages = computed(() => translations[locale.value])
const tr = currentMessages

const setDocumentLang = (lang: Locale) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'zh-CN' ? 'zh-CN' : 'en'
  }
}

const switchLocale = (next: Locale) => {
  locale.value = next
  setDocumentLang(next)
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next)
  } catch {
    // ignore storage errors
  }
}

const defaultPreset =
  gridPresets.find((preset) => preset.cols === 2 && preset.rows === 2) ??
  gridPresets[0] ??
  ({ cols: 2, rows: 2, label: '2 x 2' } as GridPreset)
const selectedPreset = ref<GridPreset>(defaultPreset)
const fileInput = ref<HTMLInputElement | null>(null)
const previewUrl = ref<string | null>(null)
const tiles = ref<TileResult[]>([])
const originalImage = shallowRef<HTMLImageElement | null>(null)
const originalObjectUrl = ref<string | null>(null)
const baseName = ref('tile')
const imageSize = ref<{ width: number; height: number } | null>(null)
const customRows = ref(defaultPreset.rows)
const customCols = ref(defaultPreset.cols)
const exportFormat = ref<ExportFormat>(DEFAULT_EXPORT_FORMAT)
const jpgQualityPercent = ref(DEFAULT_JPG_QUALITY)
const gridDescription = computed(() =>
  currentMessages.value.format.gridDescription(selectedPreset.value.cols, selectedPreset.value.rows),
)
const tileCount = computed(() => selectedPreset.value.cols * selectedPreset.value.rows)
const isJpgFormat = computed(() => exportFormat.value === 'jpg')
const jpgQuality = computed(() => Math.min(100, Math.max(1, jpgQualityPercent.value)) / 100)
const qualityLabel = computed(() => `${Math.round(Math.min(100, Math.max(1, jpgQualityPercent.value)))}%`)
const hasImage = computed(() => Boolean(originalImage.value))
const appVersion = __APP_VERSION__
const githubUrl = 'https://github.com/ccwq/image-grid-spliter'
const isMobile = ref(false)
const presetExpanded = ref(true)

const visiblePresets = computed(() =>
  isMobile.value && !presetExpanded.value ? gridPresets.slice(0, 4) : gridPresets,
)
const showPresetToggle = computed(() => isMobile.value && gridPresets.length > 4)

const presetSubtitle = (cols: number, rows: number) => currentMessages.value.format.presetSub(cols, rows)
const imageSizeLabel = computed(() =>
  imageSize.value
    ? currentMessages.value.format.imageSize(imageSize.value.width, imageSize.value.height)
    : currentMessages.value.stats.notLoaded,
)
const tilesHeading = computed(() => currentMessages.value.format.tilesHeading(tiles.value.length))
const resultsSummary = computed(() =>
  currentMessages.value.format.resultsSummary(
    gridDescription.value,
    baseName.value,
    exportFormat.value.toUpperCase(),
    qualityLabel.value,
    isJpgFormat.value,
  ),
)

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '') || 'tile'
const clampQuality = (value: number) => Math.min(100, Math.max(1, Math.round(value)))

const state = reactive({
  dragOver: false,
  processing: false,
  errorKey: 'none' as ErrorKey,
  errorDetail: '',
})

const statusState = reactive<{ key: StatusKey; payload: Record<string, unknown> }>({
  key: 'waiting',
  payload: {},
})

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
      return status.finished(
        (statusState.payload.count as number) ?? 0,
        (statusState.payload.grid as string) ?? '',
      )
    case 'manual':
      return status.manual(
        (statusState.payload.count as number) ?? 0,
        (statusState.payload.grid as string) ?? '',
      )
    case 'loading':
      return status.loading
    case 'waiting':
    default:
      return status.waiting
  }
})

const errorText = computed(() => {
  if (state.errorKey === 'none') return ''
  const errors = currentMessages.value.errors
  if (state.errorKey === 'invalidFile') return errors.invalidFile
  if (state.errorKey === 'loadFailed') return errors.loadFailed
  if (state.errorKey === 'customGridInvalid') return errors.customGridInvalid
  if (state.errorDetail) return state.errorDetail
  return errors.processingFailed
})
const setStatus = (key: StatusKey, payload: Record<string, unknown> = {}) => {
  statusState.key = key
  statusState.payload = payload
}

const setError = (key: ErrorKey, detail = '') => {
  state.errorKey = key
  state.errorDetail = detail
}

const clearError = () => {
  setError('none')
}

const syncMobileFlag = () => {
  const mobile = window.innerWidth <= 640
  isMobile.value = mobile
  document.body.dataset.mobile = mobile ? 'true' : 'false'
}

const togglePresetExpanded = () => {
  presetExpanded.value = !presetExpanded.value
}

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
  selectedPreset.value = defaultPreset
  customRows.value = defaultPreset.rows
  customCols.value = defaultPreset.cols
}

const persistPreferences = () => {
  try {
    localStorage.setItem(STORAGE_KEYS.format, exportFormat.value)
    localStorage.setItem(STORAGE_KEYS.quality, String(clampQuality(jpgQualityPercent.value)))
  } catch {
    // ignore storage errors
  }
}

const restorePreferences = () => {
  try {
    const savedFormat = localStorage.getItem(STORAGE_KEYS.format)
    if (savedFormat === 'png' || savedFormat === 'jpg') {
      exportFormat.value = savedFormat
    }
    const savedQualityRaw = localStorage.getItem(STORAGE_KEYS.quality)
    const savedQuality = savedQualityRaw ? Number(savedQualityRaw) : NaN
    if (Number.isFinite(savedQuality)) {
      jpgQualityPercent.value = clampQuality(savedQuality)
    }
  } catch {
    // ignore read errors
  }
}
const loadImage = (objectUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(currentMessages.value.errors.loadFailed))
    img.src = objectUrl
  })

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

const applyCustomGrid = () => {
  const rows = Number(customRows.value)
  const cols = Number(customCols.value)
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
    setError('customGridInvalid')
    return
  }
  clearError()
  selectedPreset.value = { rows, cols, label: `${cols} x ${rows} (custom)` }
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

const onLocaleChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  const next = target.value as Locale
  if (next === 'en' || next === 'zh-CN') {
    switchLocale(next)
  }
}
watch(selectedPreset, (preset) => {
  customRows.value = preset.rows
  customCols.value = preset.cols
  if (originalImage.value) {
    processAndDownload(false)
  }
})

watch(exportFormat, () => {
  persistPreferences()
  if (originalImage.value) {
    processAndDownload(false)
  }
})

watch(jpgQualityPercent, (quality) => {
  const clamped = clampQuality(quality)
  if (clamped !== quality) {
    jpgQualityPercent.value = clamped
    return
  }
  if (isJpgFormat.value) {
    persistPreferences()
    if (originalImage.value) {
      processAndDownload(false)
    }
  }
})

watch(locale, (lang) => setDocumentLang(lang))

onBeforeUnmount(() => {
  cleanupAll()
  window.removeEventListener('dragover', handleGlobalDragOver)
  window.removeEventListener('drop', handleGlobalDrop)
  window.removeEventListener('resize', syncMobileFlag)
})

onMounted(() => {
  setDocumentLang(locale.value)
  restorePreferences()
  requestDownloadPermission()
  window.addEventListener('dragover', handleGlobalDragOver)
  window.addEventListener('drop', handleGlobalDrop)
  window.addEventListener('resize', syncMobileFlag)
  syncMobileFlag()
  setStatus('waiting')
})

watch(isMobile, (mobile) => {
  presetExpanded.value = !mobile
})
</script>
<template>
  <main class="page">
    <header class="app-header">
      <div class="brand">
        <div class="logo-mark">
          <img src="/igs.svg" alt="Image Grid Spliter logo" />
        </div>
        <div class="brand-text">
          <span class="brand-title">{{ tr.meta.title }}</span>
          <span class="brand-version">v{{ appVersion }}</span>
        </div>
      </div>
      <div class="header-actions">
        <div class="lang-switcher">
          <Icon :icon="icons.flag" class="lang-icon" aria-hidden="true" />
          <select :aria-label="tr.aria.language" :value="locale" @change="onLocaleChange">
            <option v-for="option in supportedLocales" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
        <a class="icon-button" :href="githubUrl" target="_blank" rel="noopener" :aria-label="tr.aria.github">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.64 0 8.13c0 3.6 2.29 6.65 5.47 7.73.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.55-2.01.37-2.53-.5-2.69-.96-.09-.23-.48-.96-.82-1.15-.28-.15-.68-.52-.01-.53.63-.01 1.08.6 1.23.85.72 1.23 1.87.88 2.33.66.07-.53.28-.88.51-1.09-1.78-.2-3.64-.92-3.64-4.09 0-.9.31-1.64.82-2.22-.08-.2-.36-1.02.08-2.11 0 0 .67-.22 2.2.85.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.08 2.2-.85 2.2-.85.44 1.09.16 1.91.08 2.11.51.58.82 1.32.82 2.22 0 3.18-1.87 3.89-3.65 4.09.29.26.54.76.54 1.54 0 1.11-.01 2-.01 2.27 0 .22.15.48.55.4A8.01 8.01 0 0 0 16 8.13C16 3.64 12.42 0 8 0"
            />
          </svg>
        </a>
      </div>
    </header>

    <header class="hero">
      <div class="hero-text">
        <p class="eyebrow">
          <Icon :icon="icons.grid" class="inline-icon" aria-hidden="true" />
          {{ tr.meta.eyebrow }}
        </p>
        <h1>
          <Icon :icon="icons.info" class="title-icon" aria-hidden="true" />
          {{ tr.meta.title }}
        </h1>
        <p class="subhead">{{ tr.meta.description }}</p>
        <div class="actions">
          <button type="button" :disabled="state.processing" @click="triggerFileSelect">
            {{ state.processing ? tr.buttons.processing : tr.buttons.chooseImage }}
          </button>
          <button class="ghost" type="button" :disabled="!tiles.length || state.processing" @click="triggerDownloads">
            {{ tr.buttons.reDownload }}
          </button>
          <button class="ghost danger" type="button" :disabled="!previewUrl && !tiles.length" @click.stop="resetApp">
            {{ tr.buttons.clear }}
          </button>
        </div>
        <p v-if="!isMobile" class="hint">
          <Icon :icon="icons.download" class="inline-icon" aria-hidden="true" />
          {{ tr.meta.hint }}
        </p>
      </div>
      <div v-if="!isMobile" class="hero-card">
        <div class="stat-row">
          <span class="label">
            <Icon :icon="icons.grid" class="stat-icon" aria-hidden="true" />
            {{ tr.stats.currentGrid }}
          </span>
          <span class="value">{{ gridDescription }}</span>
        </div>
        <div class="stat-row">
          <span class="label">
            <Icon :icon="icons.download" class="stat-icon" aria-hidden="true" />
            {{ tr.stats.tileCount }}
          </span>
          <span class="value">{{ tileCount }}</span>
        </div>
        <div class="stat-row">
          <span class="label">
            <Icon :icon="icons.image" class="stat-icon" aria-hidden="true" />
            {{ tr.stats.imageSize }}
          </span>
          <span class="value">
            {{ imageSizeLabel }}
          </span>
        </div>
        <div class="stat-row">
          <span class="label">{{ tr.stats.exportFormat }}</span>
          <span class="value">
            {{ exportFormat.toUpperCase() }}<template v-if="isJpgFormat"> · {{ qualityLabel }}</template>
          </span>
        </div>
        <div class="stat-row">
          <span class="label">{{ tr.stats.downloadStatus }}</span>
          <span class="value">{{ statusText }}</span>
        </div>
      </div>
    </header>

    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">
            <Icon :icon="icons.grid" class="inline-icon" aria-hidden="true" />
            {{ tr.grid.eyebrow }}
          </p>
          <h2>{{ tr.grid.title }}</h2>
          <p class="muted">{{ tr.grid.subtitle }}</p>
        </div>
      </div>
      <div class="preset-grid">
        <button
          v-for="preset in visiblePresets"
          :key="preset.label"
          type="button"
          class="preset"
          :class="{ active: selectedPreset.cols === preset.cols && selectedPreset.rows === preset.rows }"
          :disabled="state.processing"
          @click="selectedPreset = preset"
        >
          <span class="preset-title">{{ preset.label }}</span>
          <span class="preset-sub">{{ presetSubtitle(preset.cols, preset.rows) }}</span>
        </button>
      </div>
      <div v-if="showPresetToggle" class="preset-toggle">
        <button class="ghost" type="button" @click="togglePresetExpanded">
          {{ presetExpanded ? tr.buttons.collapsePresets : tr.buttons.expandPresets }}
        </button>
      </div>
      <div v-if="!isMobile || presetExpanded" class="custom-grid">
        <div class="custom-fields">
          <label>
            {{ tr.grid.columns }}
            <input v-model.number="customCols" type="number" min="1" inputmode="numeric" />
          </label>
          <label>
            {{ tr.grid.rows }}
            <input v-model.number="customRows" type="number" min="1" inputmode="numeric" />
          </label>
        </div>
        <button type="button" class="ghost" :disabled="state.processing" @click="applyCustomGrid">
          {{ tr.grid.apply }}
        </button>
      </div>
    </section>

    <section class="panel export-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">
            <Icon :icon="icons.download" class="inline-icon" aria-hidden="true" />
            {{ tr.export.eyebrow }}
          </p>
          <h2>{{ tr.export.title }}</h2>
          <p class="muted">{{ tr.export.subtitle }}</p>
        </div>
      </div>
      <div class="export-controls">
        <div class="export-field">
          <span class="field-label">{{ tr.export.formatLabel }}</span>
          <div class="format-radios" role="radiogroup" :aria-label="tr.export.formatLabel">
            <label class="radio-pill">
              <input v-model="exportFormat" type="radio" value="jpg" :disabled="state.processing" />
              <span>JPG</span>
            </label>
            <label class="radio-pill">
              <input v-model="exportFormat" type="radio" value="png" :disabled="state.processing" />
              <span>PNG</span>
            </label>
          </div>
        </div>
        <label class="export-field" :style="{ opacity: state.processing || !isJpgFormat ? 0.3 : 1 }">
          <span class="field-label">{{ tr.export.qualityLabel }}</span>
          <div class="quality-control">
            <input
              v-model.number="jpgQualityPercent"
              type="range"
              min="40"
              max="100"
              step="5"
              :disabled="state.processing || !isJpgFormat"
              :aria-label="tr.export.qualityAria"
            />
            <span class="quality-text" :class="{ disabled: !isJpgFormat }">{{ qualityLabel }}</span>
          </div>
        </label>
      </div>
    </section>

    <section class="panel upload-panel">
      <div
        class="dropzone"
        :class="{ over: state.dragOver }"
        @click="triggerFileSelect"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <input ref="fileInput" class="file-input" type="file" accept="image/*" @change="onFileChange" />
        <div class="drop-content">
          <Icon :icon="icons.upload" class="drop-icon" aria-hidden="true" />
          <p class="drop-title">{{ tr.upload.title }}</p>
          <p class="muted">{{ tr.upload.subtitle }}</p>
          <div v-if="hasImage" class="current-file">
            <span class="chip">{{ tr.upload.currentPrefix }}{{ baseName }}</span>
            <span v-if="imageSize" class="chip">{{ tr.upload.sizePrefix }}{{ imageSize.width }} x {{ imageSize.height }}</span>
          </div>
        </div>
      </div>
      <p v-if="!isMobile" class="muted">{{ tr.upload.tip }}</p>
      <p v-if="errorText" class="error">{{ errorText }}</p>
    </section>

    <section v-if="previewUrl || tiles.length" class="panel results">
      <div class="results-grid">
        <div class="preview-card">
          <p class="eyebrow">
            <Icon :icon="icons.image" class="inline-icon" aria-hidden="true" />
            {{ tr.results.original }}
          </p>
          <div class="preview-box">
            <img v-if="previewUrl" :src="previewUrl" :alt="tr.results.original" />
            <p v-else class="muted">{{ tr.results.emptyUpload }}</p>
          </div>
        </div>
        <div class="tiles-card">
          <div class="tiles-header">
            <div>
              <p class="eyebrow">{{ tr.results.result }}</p>
              <h3>{{ tilesHeading }}</h3>
              <p class="muted">
                {{ resultsSummary }}
              </p>
            </div>
            <button class="ghost" type="button" :disabled="!tiles.length || state.processing" @click="triggerDownloads">
              {{ tr.buttons.downloadAgain }}
            </button>
          </div>
          <div v-if="tiles.length" class="tiles-grid">
            <div v-for="tile in tiles" :key="tile.name" class="tile">
              <img :src="tile.previewUrl" :alt="tile.name" loading="lazy" />
              <p class="tile-name">{{ tile.name }}</p>
            </div>
          </div>
          <p v-else class="muted">{{ tr.results.previewPlaceholder }}</p>
        </div>
      </div>
    </section>
  </main>
</template>
<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.32);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lang-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
}

.lang-switcher select {
  background: transparent;
  border: none;
  color: #e2e8f0;
  font-size: 12px;
  outline: none;
}

.lang-icon {
  width: 16px;
  height: 16px;
  color: #a5b4fc;
}

.logo-mark {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: radial-gradient(circle at 20% 20%, rgba(79, 70, 229, 0.4), rgba(56, 189, 248, 0.4));
  display: grid;
  place-items: center;
  overflow: hidden;
}

.logo-mark img {
  width: 26px;
  height: 26px;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.brand-title {
  font-weight: 700;
  letter-spacing: 0.2px;
}

.brand-version {
  font-size: 12px;
  color: #cbd5e1;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  width: fit-content;
}

.icon-button {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  display: grid;
  place-items: center;
  color: #e2e8f0;
  transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease;
}

.icon-button:hover {
  transform: translateY(-1px);
  border-color: rgba(56, 189, 248, 0.7);
  background: rgba(56, 189, 248, 0.12);
}

.icon-button svg {
  width: 18px;
  height: 18px;
}

.page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hero {
  display: grid;
  gap: 12px;
  grid-template-columns: 1.1fr 0.9fr;
  align-items: stretch;
}

.hero-text h1 {
  margin: 6px 0;
  font-size: 26px;
  letter-spacing: 0.2px;
}

.subhead {
  color: #cbd5e1;
  margin: 2px 0 8px;
  font-size: 14px;
}

.hero-card {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 12px 14px;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.1), rgba(14, 165, 233, 0.1));
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.32);
}

.inline-icon,
.title-icon,
.stat-icon,
.drop-icon {
  color: #a5b4fc;
}

.inline-icon {
  width: 14px;
  height: 14px;
  margin-right: 5px;
}

.title-icon {
  width: 18px;
  height: 18px;
  margin-right: 6px;
}

.stat-icon {
  width: 14px;
  height: 14px;
  margin-right: 6px;
}

.drop-icon {
  width: 30px;
  height: 30px;
  margin: 0 auto 6px;
  display: block;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.stat-row:last-child {
  border-bottom: none;
}

.label {
  color: #cbd5e1;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
}

.value {
  font-weight: 700;
  color: #e2e8f0;
  font-size: 14px;
}

.eyebrow {
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #a5b4fc;
  margin: 0;
}

.hint {
  color: #cbd5e1;
  font-size: 13px;
  margin: 6px 0 0;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 10px 0 2px;
}

.ghost {
  background: transparent;
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: none;
}

.ghost.danger {
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.4);
}

.ghost.danger:hover {
  border-color: rgba(248, 113, 113, 0.7);
}

.panel {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(6px);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.32);
}

.panel-header h2 {
  margin: 4px 0;
  font-size: 18px;
}

.panel-header .muted {
  margin-top: 2px;
  font-size: 13px;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 6px;
  margin-top: 8px;
}

.preset-toggle {
  margin-top: 6px;
  display: flex;
  justify-content: center;
}

.preset {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 9px 8px;
  background: rgba(255, 255, 255, 0.04);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow: none;
  transition: border-color 0.12s ease, transform 0.12s ease;
  min-height: 50px;
}

.preset:hover {
  border-color: rgba(56, 189, 248, 0.6);
}

.preset.active {
  border-color: rgba(79, 70, 229, 0.9);
  background: linear-gradient(120deg, rgba(79, 70, 229, 0.16), rgba(56, 189, 248, 0.14));
}

.preset-title {
  font-weight: 700;
  font-size: 13px;
}

.preset-sub {
  color: #cbd5e1;
  font-size: 11px;
}

.custom-grid {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.custom-fields {
  display: flex;
  gap: 8px;
}

.custom-fields label {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #cbd5e1;
  font-size: 12px;
}

.custom-fields input {
  width: 66px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
}

.export-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.export-controls {
  display: grid;
  grid-template-columns: 188px 1fr;
  gap: 12px;
  align-items: stretch;
}

.export-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 100%;
}

.field-label {
  color: #cbd5e1;
  font-size: 12px;
}

.format-radios {
  display: flex;
  gap: 10px;
}

.radio-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.24);
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease, transform 0.12s ease;
}

.radio-pill input {
  accent-color: #4ade80;
}

.radio-pill:hover {
  border-color: rgba(74, 222, 128, 0.8);
  background: rgba(74, 222, 128, 0.12);
  transform: translateY(-1px);
}

.radio-pill input:disabled + span,
.radio-pill input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.quality-control {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.24);
  height: 100%;
}

.quality-control input[type='range'] {
  flex: 1;
}

.quality-text {
  min-width: 42px;
  text-align: right;
  color: #e2e8f0;
  font-weight: 700;
}

.quality-text.disabled {
  opacity: 0.6;
}

.upload-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dropzone {
  border: 2px dashed rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  padding: 18px 14px;
  background: rgba(255, 255, 255, 0.03);
  text-align: center;
  transition: border-color 0.12s ease, background 0.12s ease;
  cursor: pointer;
}

.dropzone.over {
  border-color: rgba(56, 189, 248, 0.9);
  background: rgba(56, 189, 248, 0.08);
}

.drop-title {
  font-size: 16px;
  margin: 0 0 4px;
}

.muted {
  color: #cbd5e1;
  margin: 4px 0;
  font-size: 13px;
}

.file-input {
  display: none;
}

.current-file {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
}

.chip {
  background: rgba(255, 255, 255, 0.08);
  padding: 5px 9px;
  border-radius: 999px;
  font-size: 12px;
}

.error {
  color: #fca5a5;
  font-weight: 600;
  margin: 0;
  font-size: 13px;
}

.results {
  padding: 0;
}

.results-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 1.2fr;
  gap: 8px;
}

.preview-card,
.tiles-card {
  padding: 12px;
}

.preview-box {
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  min-height: 200px;
  display: grid;
  place-items: center;
}

.preview-box img {
  max-width: 100%;
  max-height: 240px;
  border-radius: 10px;
  object-fit: contain;
}

.tiles-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tiles-grid {
  margin-top: 10px;
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
}

.tile {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  display: grid;
  gap: 6px;
}

.tile img {
  width: 100%;
  border-radius: 8px;
  object-fit: contain;
  background: rgba(0, 0, 0, 0.1);
  aspect-ratio: 1 / 1;
}

.tile-name {
  font-size: 12px;
  color: #cbd5e1;
  word-break: break-all;
  margin: 0;
}

@media (max-width: 960px) {
  .hero {
    grid-template-columns: 1fr;
  }

  .results-grid {
    grid-template-columns: 1fr;
  }

  .actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .page {
    gap: 10px;
  }

  .app-header {
    padding: 9px 10px;
  }

  .brand-title {
    font-size: 14px;
  }

  .brand-version {
    font-size: 11px;
  }

  .hero {
    gap: 8px;
  }

  .panel {
    padding: 10px;
    border-radius: 14px;
  }

  .panel-header h2 {
    font-size: 16px;
  }

  .panel-header .muted {
    font-size: 12px;
  }

  .preset-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }

  .preset-toggle button {
    width: 100%;
    justify-content: center;
  }

  .preset {
    min-height: 46px;
    padding: 7px;
  }

  .dropzone {
    padding: 14px 10px;
  }

  .drop-title {
    font-size: 15px;
  }

  .hint,
  .muted,
  .label,
  .value {
    font-size: 12px;
  }

  .hero-text h1 {
    font-size: 22px;
  }

  .subhead {
    font-size: 12px;
  }

  .preview-box {
    min-height: 160px;
  }

  .preview-box img {
    max-height: 200px;
  }

  .tiles-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .tile {
    padding: 6px;
  }

  .tiles-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .export-controls {
    grid-template-columns: 170px 1fr;
  }
}
</style>
