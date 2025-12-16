<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import type { DataSourceItem } from 'photoswipe'
import pixelarticons from '@iconify-json/pixelarticons/icons.json'
import AppHeader from './components/AppHeader.vue'
import HeroSection from './components/HeroSection.vue'
import GridPresetsPanel from './components/GridPresetsPanel.vue'
import ExportSettings from './components/ExportSettings.vue'
import UploadPanel from './components/UploadPanel.vue'
import ResultsPanel from './components/ResultsPanel.vue'
import { useLocale } from './composables/useLocale'
import { useGridSettings } from './composables/useGridSettings'
import { useExportSettings } from './composables/useExportSettings'
import { useImageSlicer } from './composables/useImageSlicer'
import { gridPresets } from './utils/grid'
import type { GridPreset } from './utils/grid'
import type { ExportFormat } from './composables/useLocale'
import 'photoswipe/style.css'

const icons = {
  grid: pixelarticons.icons.grid,
  upload: pixelarticons.icons['cloud-upload'],
  download: pixelarticons.icons.download,
  image: pixelarticons.icons.image,
  flag: pixelarticons.icons.flag,
  info: pixelarticons.icons['info-box'],
  redo: pixelarticons.icons.redo,
  trash: pixelarticons.icons.trash,
  check: pixelarticons.icons.check,
  chevronDown: pixelarticons.icons['chevron-down'],
  chevronUp: pixelarticons.icons['chevron-up'],
  imagePlus: pixelarticons.icons['image-plus'],
  file: pixelarticons.icons.file,
}

const appVersion = __APP_VERSION__
const githubUrl = 'https://github.com/ccwq/image-grid-spliter'
const isMobile = ref(false)

const { locale, currentMessages, tr, supportedLocales, switchLocale, setDocumentLang } = useLocale()
const {
  exportFormat,
  jpgQualityPercent,
  isJpgFormat,
  jpgQuality,
  qualityLabel,
  persistPreferences,
  restorePreferences,
  clampQuality,
} = useExportSettings()

const {
  defaultPreset,
  selectedPreset,
  customRows,
  customCols,
  gridDescription,
  tileCount,
  visiblePresets,
  showPresetToggle,
  presetExpanded,
  applyCustomGrid,
  togglePresetExpanded,
} = useGridSettings({ isMobile, messages: currentMessages })

const {
  fileInput,
  images,
  totalTiles,
  autoDownload,
  firstImageSize,
  state,
  statusText,
  clearError,
  resetApp,
  triggerDownloads,
  processAll,
  onFileChange,
  onDrop,
  onDragOver,
  onDragLeave,
  handleGlobalDragOver,
  handleGlobalDrop,
  requestDownloadPermission,
  triggerFileSelect,
  setAutoDownload,
  downloadSingleImage,
} = useImageSlicer({ selectedPreset, exportFormat, jpgQuality, gridDescription, currentMessages })

const hasImage = computed(() => images.value.length > 0)
const imageSizeLabel = computed(() =>
  firstImageSize.value
    ? images.value.length > 1
      ? currentMessages.value.format.imageCountWithSize(images.value.length, firstImageSize.value.width, firstImageSize.value.height)
      : currentMessages.value.format.imageSize(firstImageSize.value.width, firstImageSize.value.height)
    : currentMessages.value.stats.notLoaded,
)
const tilesHeading = computed(() => currentMessages.value.format.tilesHeading(totalTiles.value))
const resultsSummary = computed(() =>
  currentMessages.value.format.resultsSummaryMulti(
    gridDescription.value,
    exportFormat.value.toUpperCase(),
    images.value.length,
    isJpgFormat.value,
    qualityLabel.value,
  ),
)
const firstBaseName = computed(() => images.value[0]?.baseName ?? 'tile')
const queueSummary = computed(() => (images.value.length ? currentMessages.value.upload.queuePrefix(images.value.length) : ''))
const triggerTileDownload = (src: string, name: string) => {
  const link = document.createElement('a')
  link.href = src
  link.download = name
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}
const destroyLightbox = () => {
  lightboxRef.value?.destroy()
  lightboxRef.value = null
  lightboxInitialized.value = false
}
const ensureLightbox = () => {
  if (!lightboxRef.value) {
    const lb = new PhotoSwipeLightbox({
      pswpModule: () => import('photoswipe'),
      wheelToZoom: true,
      paddingFn: (viewportSize) => {
        const width = (viewportSize as { x?: number; width?: number }).x ?? (viewportSize as { width?: number }).width ?? 0
        const isMobileView = width > 0 ? width <= 640 : isMobile.value
        return isMobileView
          ? { top: 16, bottom: 24, left: 12, right: 12 }
          : { top: 24, bottom: 32, left: 24, right: 24 }
      },
    })
    lb.on('uiRegister', () => {
      lb.pswp?.ui?.registerElement({
        name: 'download-button',
        order: 8,
        isButton: true,
        ariaLabel: currentMessages.value.buttons.previewDownload,
        title: currentMessages.value.buttons.previewDownload,
        html: '⬇',
        onClick: () => {
          const data = lb.pswp?.currSlide?.data as PreviewItem | undefined
          if (!data?.src) return
          triggerTileDownload(String(data.src), data.downloadName || 'tile')
        },
      })
    })
    lightboxRef.value = lb
  }
  lightboxRef.value.options.dataSource = previewItems.value
  if (!lightboxInitialized.value) {
    lightboxRef.value.init()
    lightboxInitialized.value = true
  }
  return lightboxRef.value
}
const openPreview = (tileId?: string) => {
  if (!previewItems.value.length) return
  const lb = ensureLightbox()
  const targetIndex = tileId ? previewIndexById.value.get(tileId) ?? 0 : 0
  lb.loadAndOpen(targetIndex)
}
type PreviewItem = DataSourceItem & { tileId: string; downloadName: string }
const previewItems = computed<PreviewItem[]>(() =>
  images.value.flatMap((image) =>
    image.tiles.map((tile) => ({
      src: tile.previewUrl,
      msrc: tile.previewUrl,
      width: tile.width,
      height: tile.height,
      alt: tile.name,
      tileId: tile.id,
      downloadName: tile.name,
    })),
  ),
)
const previewIndexById = computed(() => {
  const map = new Map<string, number>()
  previewItems.value.forEach((item, index) => map.set(item.tileId, index))
  return map
})
const lightboxRef = ref<PhotoSwipeLightbox | null>(null)
const lightboxInitialized = ref(false)

const errorText = computed(() => {
  if (state.errorKey === 'none') return ''
  const errors = currentMessages.value.errors
  if (state.errorKey === 'invalidFile') return errors.invalidFile
  if (state.errorKey === 'loadFailed') return errors.loadFailed
  if (state.errorKey === 'customGridInvalid') return errors.customGridInvalid
  if (state.errorDetail) return state.errorDetail
  return errors.processingFailed
})

const applyCustomGridWithValidation = () => {
  const result = applyCustomGrid()
  if (!result.ok) {
    state.errorKey = 'customGridInvalid'
  } else {
    clearError()
    if (images.value.length) {
      processAll(false)
    }
  }
}

const resetAll = () => {
  resetApp()
  selectedPreset.value = defaultPreset
  customRows.value = defaultPreset.rows
  customCols.value = defaultPreset.cols
}

const syncMobileFlag = () => {
  const mobile = window.innerWidth <= 640
  isMobile.value = mobile
  document.body.dataset.mobile = mobile ? 'true' : 'false'
}

const handleExportFormatChange = (format: ExportFormat) => {
  exportFormat.value = format
}

const handleJpgQualityChange = (quality: number) => {
  jpgQualityPercent.value = quality
}

const handleSelectPreset = (preset: GridPreset) => {
  selectedPreset.value = preset
}

const handleAutoDownloadToggle = (value: boolean) => {
  setAutoDownload(value)
  if (value && images.value.length) {
    processAll(true)
  }
}
const handlePreviewTile = (id?: string) => openPreview(id)
const handlePreviewAll = () => openPreview()

watch(selectedPreset, (preset) => {
  customRows.value = preset.rows
  customCols.value = preset.cols
  if (images.value.length) {
    processAll(false)
  }
})

watch(exportFormat, () => {
  persistPreferences()
  if (images.value.length) {
    processAll(false)
  }
})

watch(jpgQualityPercent, (quality) => {
  const clamped = clampQuality(quality)
  if (clamped !== quality) {
    jpgQualityPercent.value = clamped
    return
  }
  if (isJpgFormat.value && images.value.length) {
    persistPreferences()
    processAll(false)
  }
})

watch(locale, (lang) => {
  setDocumentLang(lang)
  destroyLightbox()
})
watch(
  previewItems,
  (list, prev) => {
    if (!list.length) {
      destroyLightbox()
      return
    }
    if (lightboxRef.value?.pswp) {
      lightboxRef.value.options.dataSource = list
      const listLengthChanged = prev?.length !== list.length
      if (listLengthChanged) {
        const currentId = (lightboxRef.value.pswp.currSlide?.data as PreviewItem | undefined)?.tileId
        const targetId = (currentId && list.some((item) => item.tileId === currentId)) ? currentId : list[0].tileId
        lightboxRef.value.pswp.close()
        lightboxInitialized.value = false
        lightboxRef.value = null
        requestAnimationFrame(() => openPreview(targetId))
      }
    }
  },
  { deep: true },
)

onMounted(() => {
  setDocumentLang(locale.value)
  restorePreferences()
  requestDownloadPermission()
  window.addEventListener('dragover', handleGlobalDragOver)
  window.addEventListener('drop', handleGlobalDrop)
  window.addEventListener('resize', syncMobileFlag)
  syncMobileFlag()
})

onBeforeUnmount(() => {
  window.removeEventListener('dragover', handleGlobalDragOver)
  window.removeEventListener('drop', handleGlobalDrop)
  window.removeEventListener('resize', syncMobileFlag)
  destroyLightbox()
})
</script>

<template>
  <main class="page">
    <AppHeader
      :tr="tr"
      :icons="icons"
      :locale="locale"
      :supported-locales="supportedLocales"
      :app-version="appVersion"
      :github-url="githubUrl"
      @locale-change="switchLocale"
    />

    <HeroSection
      :tr="tr"
      :icons="icons"
      :grid-description="gridDescription"
      :tile-count="tileCount"
      :image-size-label="imageSizeLabel"
      :export-format="exportFormat"
      :quality-label="qualityLabel"
      :is-jpg-format="isJpgFormat"
      :status-text="statusText"
      :processing="state.processing"
      :has-tiles="totalTiles > 0"
      :has-image="hasImage"
      :is-mobile="isMobile"
      @choose-file="triggerFileSelect"
      @trigger-downloads="triggerDownloads"
      @reset="resetAll"
    />

    <GridPresetsPanel
      :tr="tr"
      :icons="icons"
      :presets="gridPresets"
      :visible-presets="visiblePresets"
      :selected-preset="selectedPreset"
      :show-preset-toggle="showPresetToggle"
      :preset-expanded="presetExpanded"
      v-model:custom-rows="customRows"
      v-model:custom-cols="customCols"
      :processing="state.processing"
      :is-mobile="isMobile"
      @select-preset="handleSelectPreset"
      @toggle-presets="togglePresetExpanded"
      @apply-custom-grid="applyCustomGridWithValidation"
    />

    <ExportSettings
      :tr="tr"
      :icons="icons"
      :export-format="exportFormat"
      :is-jpg-format="isJpgFormat"
      :quality-label="qualityLabel"
      :jpg-quality-percent="jpgQualityPercent"
      :processing="state.processing"
      @update:export-format="handleExportFormatChange"
      @update:jpg-quality-percent="handleJpgQualityChange"
    />

    <UploadPanel
      :tr="tr"
      :icons="icons"
      :drag-over="state.dragOver"
      :has-image="hasImage"
      :first-base-name="firstBaseName"
      :first-image-size="firstImageSize"
      :queue-summary="queueSummary"
      :error-text="errorText"
      :is-mobile="isMobile"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @file-change="onFileChange"
      @pick="triggerFileSelect"
    >
      <template #file-input>
        <input ref="fileInput" class="file-input" type="file" accept="image/*" multiple @change="onFileChange" />
      </template>
    </UploadPanel>

    <ResultsPanel
      :tr="tr"
      :icons="icons"
      :images="images"
      :tiles-heading="tilesHeading"
      :results-summary="resultsSummary"
      :auto-download="autoDownload"
      :processing="state.processing"
      @toggle-auto-download="handleAutoDownloadToggle"
      @trigger-downloads="triggerDownloads"
      @download-image="downloadSingleImage"
      @preview-tile="handlePreviewTile"
      @preview-all="handlePreviewAll"
    />
  </main>
</template>

<style>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
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
  width: 38px;
  height: 38px;
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

.preset-heading {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 6px;
}

.preset-heading .btn-icon{
  position: relative;
  top: -2px;
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
  grid-template-columns: 240px 1fr;
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

.results-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.results-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.auto-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.auto-toggle input {
  accent-color: #4ade80;
}

.small {
  font-size: 12px;
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

.tiles-actions {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
}

.tiles-grid {
  margin-top: 10px;
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
}

.image-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.image-block {
  display: grid;
  grid-template-columns: minmax(240px, 0.95fr) 1.05fr;
  gap: 10px;
  align-items: start;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.02);
}

.image-block .preview-card,
.image-block .tiles-card {
  padding: 0;
}

.image-block .preview-box img {
  max-height: 200px;
}

.meta {
  margin: 6px 0 0;
}

.tile {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  display: grid;
  gap: 6px;
  cursor: pointer;
}

.tile img {
  width: 100%;
  border-radius: 8px;
  object-fit: contain;
  background: rgba(0, 0, 0, 0.1);
  aspect-ratio: 1 / 1;
}

.tile-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tile-name {
  font-size: 12px;
  color: #cbd5e1;
  word-break: break-all;
  margin: 0;
}

.link-btn {
  background: none;
  border: none;
  color: #93c5fd;
  font-size: 12px;
  padding: 0;
  cursor: pointer;
}

.link-btn:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}

@media (max-width: 960px) {
  .hero {
    grid-template-columns: 1fr;
  }

  .results-grid {
    grid-template-columns: 1fr;
  }

  .image-block {
    grid-template-columns: 1fr;
  }

  .results-actions {
    align-items: flex-start;
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

    display: flex;
    flex-direction: column;
  }

  .image-block {
    grid-template-columns: 1fr;
  }
}
</style>
