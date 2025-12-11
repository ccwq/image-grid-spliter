<script setup lang="ts">
import imageCompression from 'browser-image-compression'
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
const STORAGE_KEYS = {
  format: 'igs:export-format',
  quality: 'igs:jpg-quality',
}
const DEFAULT_EXPORT_FORMAT: ExportFormat = 'jpg'
const DEFAULT_JPG_QUALITY = 80

const defaultStatusText = '等待上传图片并选择网格'

const state = reactive({
  dragOver: false,
  processing: false,
  status: defaultStatusText,
  error: '',
})

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

const gridDescription = computed(() => `${selectedPreset.value.cols} 列 x ${selectedPreset.value.rows} 行`)
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

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '') || 'tile'
const clampQuality = (value: number) => Math.min(100, Math.max(1, Math.round(value)))

const resetTiles = () => {
  tiles.value.forEach((tile) => URL.revokeObjectURL(tile.previewUrl))
  tiles.value = []
}

const cleanupAll = () => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = null
  }
  resetTiles()
  if (originalObjectUrl.value) {
    URL.revokeObjectURL(originalObjectUrl.value)
    originalObjectUrl.value = null
  }
}

const syncMobileFlag = () => {
  const mobile = window.innerWidth <= 640
  isMobile.value = mobile
  document.body.dataset.mobile = mobile ? 'true' : 'false'
}

const togglePresetExpanded = () => {
  presetExpanded.value = !presetExpanded.value
}

const resetApp = () => {
  cleanupAll()
  originalImage.value = null
  imageSize.value = null
  baseName.value = 'tile'
  state.dragOver = false
  state.error = ''
  state.processing = false
  state.status = defaultStatusText
  selectedPreset.value = defaultPreset
  customRows.value = defaultPreset.rows
  customCols.value = defaultPreset.cols
}

const persistPreferences = () => {
  try {
    localStorage.setItem(STORAGE_KEYS.format, exportFormat.value)
    localStorage.setItem(STORAGE_KEYS.quality, String(clampQuality(jpgQualityPercent.value)))
  } catch {
    // 忽略持久化异常（如无痕模式）
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
    // 忽略读取异常
  }
}

const loadImage = (objectUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = objectUrl
  })

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('导出图片失败'))
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
        console.error('JPG 压缩失败，使用回退输出', err)
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
  state.status = '正在触发批量下载，请确认浏览器的多文件下载权限'
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
  state.status = `已触发 ${tiles.value.length} 个文件下载`
}

const processAndDownload = async (autoDownload = true) => {
  if (!originalImage.value || state.processing) return
  state.error = ''
  state.processing = true
  state.status = '正在裁切/压缩并生成输出...'
  resetTiles()
  try {
    const nextTiles = await splitImage(originalImage.value)
    tiles.value = nextTiles
    const finishedText = `裁切完成，共 ${nextTiles.length} 张（${gridDescription.value}）`
    state.status = finishedText
    if (autoDownload) {
      await triggerDownloads()
    } else {
      state.status = `${finishedText}，等待手动下载`
    }
  } catch (err) {
    state.error = err instanceof Error ? err.message : '裁切失败'
  } finally {
    state.processing = false
  }
}

const handleFile = async (file: File) => {
  if (!file.type.startsWith('image/')) {
    state.error = '请上传图片文件'
    return
  }

  cleanupAll()
  baseName.value = stripExtension(file.name)
  state.status = '图片加载中...'
  const objectUrl = URL.createObjectURL(file)
  originalObjectUrl.value = objectUrl

  try {
    const img = await loadImage(objectUrl)
    originalImage.value = img
    imageSize.value = { width: img.naturalWidth, height: img.naturalHeight }
    previewUrl.value = objectUrl
    await processAndDownload(true)
  } catch (err) {
    state.error = err instanceof Error ? err.message : '图片处理失败'
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
  // 部分浏览器支持 downloads 权限声明；查询失败时忽略。
  const permissions = (navigator as Partial<Navigator> & { permissions?: { query?: (init: unknown) => Promise<unknown> } }).permissions
  if (permissions?.query) {
    try {
      await permissions.query({ name: 'downloads' } as unknown)
    } catch {
      // 安静失败，继续采用用户手势触发下载
    }
  }
}

const triggerFileSelect = () => fileInput.value?.click()

const applyCustomGrid = () => {
  const rows = Number(customRows.value)
  const cols = Number(customCols.value)
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
    state.error = '自定义行列需为正整数'
    return
  }
  state.error = ''
  selectedPreset.value = { rows, cols, label: `${cols} x ${rows}（自定义）` }
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

onBeforeUnmount(() => {
  cleanupAll()
  window.removeEventListener('dragover', handleGlobalDragOver)
  window.removeEventListener('drop', handleGlobalDrop)
  window.removeEventListener('resize', syncMobileFlag)
})

onMounted(() => {
  restorePreferences()
  requestDownloadPermission()
  window.addEventListener('dragover', handleGlobalDragOver)
  window.addEventListener('drop', handleGlobalDrop)
  window.addEventListener('resize', syncMobileFlag)
  syncMobileFlag()
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
          <span class="brand-title">Image Grid Spliter</span>
          <span class="brand-version">v{{ appVersion }}</span>
        </div>
      </div>
      <a class="icon-button" :href="githubUrl" target="_blank" rel="noopener" aria-label="前往 GitHub 仓库">
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M8 0C3.58 0 0 3.64 0 8.13c0 3.6 2.29 6.65 5.47 7.73.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.55-2.01.37-2.53-.5-2.69-.96-.09-.23-.48-.96-.82-1.15-.28-.15-.68-.52-.01-.53.63-.01 1.08.6 1.23.85.72 1.23 1.87.88 2.33.66.07-.53.28-.88.51-1.09-1.78-.2-3.64-.92-3.64-4.09 0-.9.31-1.64.82-2.22-.08-.2-.36-1.02.08-2.11 0 0 .67-.22 2.2.85.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.08 2.2-.85 2.2-.85.44 1.09.16 1.91.08 2.11.51.58.82 1.32.82 2.22 0 3.18-1.87 3.89-3.65 4.09.29.26.54.76.54 1.54 0 1.11-.01 2-.01 2.27 0 .22.15.48.55.4A8.01 8.01 0 0 0 16 8.13C16 3.64 12.42 0 8 0"
          />
        </svg>
      </a>
    </header>

    <header class="hero">
      <div class="hero-text">
        <p class="eyebrow">PWA · 离线可用 · 移动端适配</p>
        <h1>图片网格裁切器</h1>
        <p class="subhead">上传/拖拽图片，选择预设网格，自动裁切并批量下载结果</p>
        <div class="actions">
          <button type="button" :disabled="state.processing" @click="triggerFileSelect">
            {{ state.processing ? '处理中...' : '选择图片' }}
          </button>
          <button class="ghost" type="button" :disabled="!tiles.length || state.processing" @click="triggerDownloads">
            重新触发下载
          </button>
          <button class="ghost danger" type="button" :disabled="!previewUrl && !tiles.length" @click.stop="resetApp">
            清除当前图片
          </button>
        </div>
        <p v-if="!isMobile" class="hint">
          支持：1x1（纯压缩）、2x2、3x3、4x4、2x3、2x4、3x2、4x2、5x2、2x5。请允许浏览器多文件下载。
        </p>
      </div>
      <div v-if="!isMobile" class="hero-card">
        <div class="stat-row">
          <span class="label">当前网格</span>
          <span class="value">{{ gridDescription }}</span>
        </div>
        <div class="stat-row">
          <span class="label">切片数量</span>
          <span class="value">{{ tileCount }}</span>
        </div>
        <div class="stat-row">
          <span class="label">图片尺寸</span>
          <span class="value">
            {{ imageSize ? `${imageSize.width} x ${imageSize.height}` : '未加载' }}
          </span>
        </div>
        <div class="stat-row">
          <span class="label">导出格式</span>
          <span class="value">
            {{ exportFormat.toUpperCase() }}<template v-if="isJpgFormat"> · 质量 {{ qualityLabel }}</template>
          </span>
        </div>
        <div class="stat-row">
          <span class="label">下载状态</span>
          <span class="value">{{ state.status }}</span>
        </div>
      </div>
    </header>

    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">网格预设</p>
          <h2>选择切割网格</h2>
          <p class="muted">更改网格后会重新裁切，需手动触发下载。</p>
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
          <span class="preset-sub">{{ preset.cols }} 列 · {{ preset.rows }} 行</span>
        </button>
      </div>
      <div v-if="showPresetToggle" class="preset-toggle">
        <button class="ghost" type="button" @click="togglePresetExpanded">
          {{ presetExpanded ? '收起预设' : '展开更多预设' }}
        </button>
      </div>
      <div v-if="!isMobile || presetExpanded" class="custom-grid">
        <div class="custom-fields">
          <label>
            列
            <input v-model.number="customCols" type="number" min="1" inputmode="numeric" />
          </label>
          <label>
            行
            <input v-model.number="customRows" type="number" min="1" inputmode="numeric" />
          </label>
        </div>
        <button type="button" class="ghost" :disabled="state.processing" @click="applyCustomGrid">使用自定义网格</button>
      </div>
    </section>

    <section class="panel export-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">导出设置</p>
          <h2>选择输出格式</h2>
          <p class="muted">切换格式或压缩强度会重新生成结果，需手动下载。</p>
        </div>
      </div>
      <div class="export-controls">
        <div class="export-field">
          <span class="field-label">输出格式</span>
          <div class="format-radios" role="radiogroup" aria-label="选择输出格式">
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
        <label class="export-field" :style="{opacity: state.processing || !isJpgFormat ? 0.3 : 1}">
          <span class="field-label">压缩强度</span>
          <div class="quality-control">
            <input
              v-model.number="jpgQualityPercent"
              type="range"
              min="40"
              max="100"
              step="5"
              :disabled="state.processing || !isJpgFormat"
              aria-label="JPG 压缩强度"
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
          <p class="drop-title">拖拽图片到此处，或点击选择</p>
          <p class="muted">将按当前网格裁切，可手动下载全部切片</p>
          <div v-if="hasImage" class="current-file">
            <span class="chip">当前：{{ baseName }}</span>
            <span v-if="imageSize" class="chip">尺寸：{{ imageSize.width }} x {{ imageSize.height }}</span>
          </div>
        </div>
      </div>
      <p v-if="!isMobile" class="muted">提示：若浏览器阻止多文件下载，请在地址栏允许该站点的批量下载。</p>
      <p v-if="state.error" class="error">{{ state.error }}</p>
    </section>

    <section v-if="previewUrl || tiles.length" class="panel results">
      <div class="results-grid">
        <div class="preview-card">
          <p class="eyebrow">原图</p>
          <div class="preview-box">
            <img v-if="previewUrl" :src="previewUrl" alt="原图预览" />
            <p v-else class="muted">请先上传图片</p>
          </div>
        </div>
        <div class="tiles-card">
          <div class="tiles-header">
            <div>
              <p class="eyebrow">裁切结果</p>
              <h3>{{ tiles.length ? `${tiles.length} 个切片` : '等待裁切' }}</h3>
              <p class="muted">
                网格：{{ gridDescription }}，文件名前缀：{{ baseName }}，格式：{{ exportFormat.toUpperCase() }}
                <template v-if="isJpgFormat">（质量 {{ qualityLabel }}）</template>
              </p>
            </div>
            <button class="ghost" type="button" :disabled="!tiles.length || state.processing" @click="triggerDownloads">
              再次下载
            </button>
          </div>
          <div v-if="tiles.length" class="tiles-grid">
            <div v-for="tile in tiles" :key="tile.name" class="tile">
              <img :src="tile.previewUrl" :alt="tile.name" loading="lazy" />
              <p class="tile-name">{{ tile.name }}</p>
            </div>
          </div>
          <p v-else class="muted">裁切完成后将在此展示切片预览</p>
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
