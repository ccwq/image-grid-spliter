import { computed, ref } from 'vue'

type ExportFormat = 'png' | 'jpg'
type Locale = 'en' | 'zh-CN'

type Translations = Record<
  Locale,
  {
    meta: { eyebrow: string; title: string; description: string; hint: string }
    buttons: {
      chooseImage: string
      reDownload: string
      downloadAll: string
      downloadImage: string
      clear: string
      expandPresets: string
      collapsePresets: string
      useCustom: string
      downloadAgain: string
      processing: string
      autoDownload: string
    }
    stats: { currentGrid: string; tileCount: string; imageSize: string; exportFormat: string; downloadStatus: string; notLoaded: string }
    grid: { eyebrow: string; title: string; subtitle: string; columns: string; rows: string; apply: string }
    export: { eyebrow: string; title: string; subtitle: string; formatLabel: string; qualityLabel: string; qualityAria: string; autoDownloadLabel: string; autoDownloadHint: string }
    upload: { title: string; subtitle: string; tip: string; currentPrefix: string; sizePrefix: string; queuePrefix: (count: number) => string }
    results: { original: string; emptyUpload: string; result: string; waiting: string; previewPlaceholder: string; queueSummary: (count: number) => string }
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
      imageCount: (count: number) => string
      imageCountWithSize: (count: number, width: number, height: number) => string
      tilesHeading: (count: number) => string
      resultsSummary: (grid: string, base: string, fmt: string, quality: string, isJpg: boolean) => string
      resultsSummaryMulti: (grid: string, fmt: string, count: number, isJpg: boolean, quality: string) => string
    }
    aria: { github: string; language: string }
  }
>

const LOCALE_STORAGE_KEY = 'igs:locale'

const translations: Translations = {
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
      downloadAll: '下载全部',
      downloadImage: '下载此图片',
      clear: '清除当前图片',
      expandPresets: '展开更多预设',
      collapsePresets: '收起预设',
      useCustom: '使用自定义网格',
      downloadAgain: '再次下载',
      processing: '处理中...',
      autoDownload: '自动下载',
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
      autoDownloadLabel: '自动下载切片',
      autoDownloadHint: '默认关闭；开启后裁切完成即触发下载，未开启则需手动点击“下载全部”或逐图下载。',
    },
    upload: {
      title: '拖拽图片到此处，或点击选择',
      subtitle: '将按当前网格裁切，可手动下载全部切片',
      tip: '提示：若浏览器阻止多文件下载，请在地址栏允许该站点的批量下载。',
      currentPrefix: '当前：',
      sizePrefix: '尺寸：',
      queuePrefix: (count: number) => `已添加 ${count} 张图片`,
    },
    results: {
      original: '原图',
      emptyUpload: '请先上传图片',
      result: '裁切结果',
      waiting: '等待裁切',
      previewPlaceholder: '裁切完成后将在此展示切片预览',
      queueSummary: (count: number) => `队列中有 ${count} 张图片`,
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
      imageCount: (count: number) => `${count} 张图片`,
      imageCountWithSize: (count: number, width: number, height: number) => `${count} 张图片 · 首张 ${width} x ${height}`,
      tilesHeading: (count: number) => (count ? `${count} 个切片` : '等待裁切'),
      resultsSummary: (grid: string, base: string, fmt: string, quality: string, isJpg: boolean) => {
        const qualityText = isJpg ? `（质量 ${quality}）` : ''
        return `网格：${grid}，文件名前缀：${base}，格式：${fmt}${qualityText}`
      },
      resultsSummaryMulti: (grid: string, fmt: string, count: number, isJpg: boolean, quality: string) => {
        const qualityText = isJpg ? `（质量 ${quality}）` : ''
        return `网格：${grid}，图片数：${count}，格式：${fmt}${qualityText}`
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
      downloadAll: 'Download all',
      downloadImage: 'Download this image',
      clear: 'Clear image',
      expandPresets: 'Show more presets',
      collapsePresets: 'Hide presets',
      useCustom: 'Apply custom grid',
      downloadAgain: 'Download again',
      processing: 'Processing...',
      autoDownload: 'Auto download',
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
      autoDownloadLabel: 'Auto download tiles',
      autoDownloadHint: 'Off by default. When enabled, slicing completion triggers downloads; otherwise click “Download all” or per-image download.',
    },
    upload: {
      title: 'Drop image here or click to select',
      subtitle: 'Slices by current grid and lets you download all tiles',
      tip: 'Tip: if the browser blocks multi-file downloads, allow batch downloads for this site.',
      currentPrefix: 'Current:',
      sizePrefix: 'Size:',
      queuePrefix: (count: number) => `${count} images added`,
    },
    results: {
      original: 'Original',
      emptyUpload: 'Upload an image to preview',
      result: 'Sliced results',
      waiting: 'Waiting to slice',
      previewPlaceholder: 'Tile previews will appear here after slicing',
      queueSummary: (count: number) => `${count} image(s) in queue`,
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
      imageCount: (count: number) => `${count} images`,
      imageCountWithSize: (count: number, width: number, height: number) => `${count} images · first ${width} x ${height}`,
      tilesHeading: (count: number) => (count ? `${count} tiles` : 'Waiting to slice'),
      resultsSummary: (grid: string, base: string, fmt: string, quality: string, isJpg: boolean) => {
        const qualityText = isJpg ? ` (quality ${quality})` : ''
        return `Grid: ${grid}, prefix: ${base}, format: ${fmt}${qualityText}`
      },
      resultsSummaryMulti: (grid: string, fmt: string, count: number, isJpg: boolean, quality: string) => {
        const qualityText = isJpg ? ` (quality ${quality})` : ''
        return `Grid: ${grid}, images: ${count}, format: ${fmt}${qualityText}`
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

const setDocumentLang = (lang: Locale) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'zh-CN' ? 'zh-CN' : 'en'
  }
}

export function useLocale() {
  const locale = ref<Locale>(detectLocale())
  const currentMessages = computed(() => translations[locale.value])

  const switchLocale = (next: Locale) => {
    locale.value = next
    setDocumentLang(next)
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next)
    } catch {
      // ignore storage errors
    }
  }

  return {
    locale,
    currentMessages,
    tr: currentMessages,
    supportedLocales,
    switchLocale,
    setDocumentLang,
  }
}

export type LocaleMessages = (typeof translations)[Locale]
export type { Locale, ExportFormat }
