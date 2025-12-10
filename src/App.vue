<script setup lang="ts">
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

const state = reactive({
  dragOver: false,
  processing: false,
  status: '等待上传图片并选择网格',
  error: '',
})

const selectedPreset = ref<GridPreset>(gridPresets[0])
const fileInput = ref<HTMLInputElement | null>(null)
const previewUrl = ref<string | null>(null)
const tiles = ref<TileResult[]>([])
const originalImage = shallowRef<HTMLImageElement | null>(null)
const originalObjectUrl = ref<string | null>(null)
const baseName = ref('tile')
const imageSize = ref<{ width: number; height: number } | null>(null)

const gridDescription = computed(() => `${selectedPreset.value.cols} 列 x ${selectedPreset.value.rows} 行`)
const tileCount = computed(() => selectedPreset.value.cols * selectedPreset.value.rows)
const hasImage = computed(() => Boolean(originalImage.value))

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '') || 'tile'

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

const loadImage = (objectUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = objectUrl
  })

const splitImage = async (img: HTMLImageElement) => {
  const rects = computeTileRects(img.naturalWidth, img.naturalHeight, selectedPreset.value.rows, selectedPreset.value.cols)
  const result: TileResult[] = []

  for (const rect of rects) {
    const canvas = document.createElement('canvas')
    canvas.width = rect.width
    canvas.height = rect.height
    const ctx = canvas.getContext('2d')
    if (!ctx) continue

    ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b)
        else reject(new Error('导出图片失败'))
      }, 'image/png')
    })

    const url = URL.createObjectURL(blob)
    result.push({
      name: `${baseName.value}-r${rect.row}c${rect.col}.png`,
      blob,
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
  state.status = '正在裁切并生成切片...'
  resetTiles()
  try {
    const nextTiles = await splitImage(originalImage.value)
    tiles.value = nextTiles
    state.status = `裁切完成，共 ${nextTiles.length} 张（${gridDescription.value}）`
    if (autoDownload) {
      await triggerDownloads()
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
  // 部分浏览器支持 downloads 权限声明，类型未内置，需忽略校验。
  // @ts-expect-error 浏览器实验性权限名
  if (navigator.permissions?.query) {
    try {
      // @ts-expect-error 浏览器实验性权限名
      await navigator.permissions.query({ name: 'downloads' })
    } catch {
      // 安静失败，继续采用用户手势触发下载
    }
  }
}

const triggerFileSelect = () => fileInput.value?.click()

watch(selectedPreset, () => {
  if (originalImage.value) {
    processAndDownload(true)
  }
})

onBeforeUnmount(() => {
  cleanupAll()
})

onMounted(() => {
  requestDownloadPermission()
})
</script>

<template>
  <main class="page">
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
        </div>
        <p class="hint">支持：2x2、3x3、4x4、2x3、2x4、3x2、4x2、5x2、2x5。请允许浏览器多文件下载。</p>
      </div>
      <div class="hero-card">
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
          <p class="muted">更改网格后会自动重新裁切并批量下载。</p>
        </div>
      </div>
      <div class="preset-grid">
        <button
          v-for="preset in gridPresets"
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
          <p class="muted">将自动按当前网格裁切并下载全部切片</p>
          <div v-if="hasImage" class="current-file">
            <span class="chip">当前：{{ baseName }}</span>
            <span v-if="imageSize" class="chip">尺寸：{{ imageSize.width }} x {{ imageSize.height }}</span>
          </div>
        </div>
      </div>
      <p class="muted">提示：若浏览器阻止多文件下载，请在地址栏允许该站点的批量下载。</p>
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
              <p class="muted">网格：{{ gridDescription }}，文件名前缀：{{ baseName }}</p>
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
.page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.hero {
  display: grid;
  gap: 16px;
  grid-template-columns: 1.2fr 0.9fr;
  align-items: stretch;
}

.hero-text h1 {
  margin: 8px 0;
  font-size: 32px;
  letter-spacing: 0.4px;
}

.subhead {
  color: #cbd5e1;
  margin: 4px 0 12px;
}

.hero-card {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 18px;
  padding: 16px 18px;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.12), rgba(14, 165, 233, 0.12));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.stat-row:last-child {
  border-bottom: none;
}

.label {
  color: #cbd5e1;
  font-size: 14px;
}

.value {
  font-weight: 700;
  color: #e2e8f0;
}

.eyebrow {
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #a5b4fc;
  margin: 0;
}

.hint {
  color: #cbd5e1;
  font-size: 14px;
  margin: 8px 0 0;
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 12px 0 4px;
}

.ghost {
  background: transparent;
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: none;
}

.panel {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(6px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.panel-header h2 {
  margin: 6px 0;
  font-size: 22px;
}

.panel-header .muted {
  margin-top: 4px;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.preset {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow: none;
  transition: border-color 0.12s ease, transform 0.12s ease;
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
}

.preset-sub {
  color: #cbd5e1;
  font-size: 13px;
}

.upload-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dropzone {
  border: 2px dashed rgba(255, 255, 255, 0.14);
  border-radius: 18px;
  padding: 28px 18px;
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
  font-size: 18px;
  margin: 0 0 6px;
}

.muted {
  color: #cbd5e1;
  margin: 4px 0;
}

.file-input {
  display: none;
}

.current-file {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.chip {
  background: rgba(255, 255, 255, 0.08);
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 13px;
}

.error {
  color: #fca5a5;
  font-weight: 600;
  margin: 0;
}

.results {
  padding: 0;
}

.results-grid {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) 1.4fr;
  gap: 10px;
}

.preview-card,
.tiles-card {
  padding: 16px;
}

.preview-box {
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  min-height: 260px;
  display: grid;
  place-items: center;
}

.preview-box img {
  max-width: 100%;
  max-height: 320px;
  border-radius: 10px;
  object-fit: contain;
}

.tiles-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tiles-grid {
  margin-top: 12px;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}

.tile {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.03);
  display: grid;
  gap: 8px;
}

.tile img {
  width: 100%;
  border-radius: 8px;
  object-fit: contain;
  background: rgba(0, 0, 0, 0.1);
  aspect-ratio: 1 / 1;
}

.tile-name {
  font-size: 13px;
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
  .preset-grid {
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  }

  .tiles-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
