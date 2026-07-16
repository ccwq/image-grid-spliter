<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import type { DataSourceItem } from 'photoswipe'
import pixelarticons from '@iconify-json/pixelarticons/icons.json'
import AppHeader from './components/AppHeader.vue'
import ExportProgressOverlay from './components/ExportProgressOverlay.vue'
import ExportSettings from './components/ExportSettings.vue'
import GridPresetsPanel from './components/GridPresetsPanel.vue'
import HeroSection from './components/HeroSection.vue'
import MobileAdvancedDrawer from './components/MobileAdvancedDrawer.vue'
import ResultsPanel from './components/ResultsPanel.vue'
import SliceEditor from './components/SliceEditor.vue'
import UploadPanel from './components/UploadPanel.vue'
import { useExportSettings } from './composables/useExportSettings'
import { useGridSettings } from './composables/useGridSettings'
import { useImageSlicer } from './composables/useImageSlicer'
import { useLocale, type ExportFormat } from './composables/useLocale'
import { createEvenDividerLines, gridPresets, normalizeDividerLines, type GridPreset, type SlicePlan } from './utils/grid'
import 'photoswipe/style.css'

const icons = { grid: pixelarticons.icons.grid, upload: pixelarticons.icons['cloud-upload'], download: pixelarticons.icons.download, image: pixelarticons.icons.image, flag: pixelarticons.icons.flag, info: pixelarticons.icons['info-box'], redo: pixelarticons.icons.redo, trash: pixelarticons.icons.trash, check: pixelarticons.icons.check, chevronDown: pixelarticons.icons['chevron-down'], chevronUp: pixelarticons.icons['chevron-up'], imagePlus: pixelarticons.icons['image-plus'], file: pixelarticons.icons.file }
const appVersion = __APP_VERSION__
const githubUrl = 'https://github.com/ccwq/image-grid-spliter'
const isMobile = ref(false)
const editorExpanded = ref(false)
const resultsCollapsed = ref(false)
const edgeEraseEnabled = ref(false)
const edgeErasePadding = ref(1)
const advancedDrawerOpen = ref(false)

const planForGrid = (preset: GridPreset): SlicePlan => ({ horizontalLines: createEvenDividerLines(preset.rows), verticalLines: createEvenDividerLines(preset.cols), padding: edgeEraseEnabled.value ? edgeErasePadding.value : 0, paddingUnit: 'percent', trimOuterEdges: false })
const { locale, currentMessages, tr, supportedLocales, switchLocale, setDocumentLang } = useLocale()
const { exportFormat, jpgQualityPercent, isJpgFormat, jpgQuality, qualityLabel, persistPreferences, restorePreferences, clampQuality } = useExportSettings()
const { defaultPreset, selectedPreset, customRows, customCols, visiblePresets, showPresetToggle, presetExpanded, applyCustomGrid, togglePresetExpanded } = useGridSettings({ isMobile, messages: currentMessages })
const slicePlan = ref<SlicePlan>(planForGrid(selectedPreset.value))
const editableTileCount = computed(() => (slicePlan.value.horizontalLines.length + 1) * (slicePlan.value.verticalLines.length + 1))
const editableGridDescription = computed(() => currentMessages.value.format.gridDescription(slicePlan.value.verticalLines.length + 1, slicePlan.value.horizontalLines.length + 1))
const {
  fileInput, images, totalTiles, autoDownload, firstImageSize, state, statusText, clearError, resetApp, triggerDownloads, processAll,
  onFileChange, onDrop, onDragOver, onDragLeave, handleGlobalDragOver, handleGlobalDrop, triggerFileSelect,
  setAutoDownload, downloadSingleImage, directoryExportSupported, directoryExportReady, pendingTraditionalDownloads, changeExportDirectory, retryPendingTraditionalDownloads, exportProgress, dismissExportProgress, cancelProcessing,
} = useImageSlicer({ selectedPreset, slicePlan, exportFormat, jpgQuality, gridDescription: editableGridDescription, currentMessages })

const hasImage = computed(() => images.value.length > 0)
const imageSizeLabel = computed(() => firstImageSize.value ? images.value.length > 1 ? currentMessages.value.format.imageCountWithSize(images.value.length, firstImageSize.value.width, firstImageSize.value.height) : currentMessages.value.format.imageSize(firstImageSize.value.width, firstImageSize.value.height) : currentMessages.value.stats.notLoaded)
const tilesHeading = computed(() => currentMessages.value.format.tilesHeading(totalTiles.value))
const resultsSummary = computed(() => currentMessages.value.format.resultsSummaryMulti(editableGridDescription.value, exportFormat.value.toUpperCase(), images.value.length, isJpgFormat.value, qualityLabel.value))
const firstBaseName = computed(() => images.value[0]?.baseName ?? 'tile')
const queueSummary = computed(() => images.value.length ? currentMessages.value.upload.queuePrefix(images.value.length) : '')
const errorText = computed(() => state.errorKey === 'none' ? '' : state.errorDetail || currentMessages.value.errors.processingFailed)

const updateSlicePlan = (changes: Partial<SlicePlan>) => {
  slicePlan.value = { ...slicePlan.value, ...changes, horizontalLines: changes.horizontalLines ? normalizeDividerLines(changes.horizontalLines) : slicePlan.value.horizontalLines, verticalLines: changes.verticalLines ? normalizeDividerLines(changes.verticalLines) : slicePlan.value.verticalLines, padding: changes.padding === undefined ? slicePlan.value.padding : Math.max(0, changes.padding) }
}
const updateEdgeErasePadding = (value: number) => { edgeErasePadding.value = Math.max(0, value); updateSlicePlan({ padding: edgeEraseEnabled.value ? edgeErasePadding.value : 0 }) }
const updateEdgeEraseEnabled = (value: boolean) => { edgeEraseEnabled.value = value; updateSlicePlan({ padding: value ? edgeErasePadding.value : 0 }) }
const updateHorizontalLines = (lines: number[]) => updateSlicePlan({ horizontalLines: lines.map((line) => line / 100) })
const updateVerticalLines = (lines: number[]) => updateSlicePlan({ verticalLines: lines.map((line) => line / 100) })
const confirmEditorLines = (lines: { horizontal: number[]; vertical: number[] }) => {
  updateSlicePlan({ horizontalLines: lines.horizontal.map((line) => line / 100), verticalLines: lines.vertical.map((line) => line / 100) })
  advancedDrawerOpen.value = false
}

const applyCustomGridWithValidation = () => {
  const result = applyCustomGrid()
  if (!result.ok) state.errorKey = 'customGridInvalid'
  else clearError()
}
const resetAll = () => {
  resetApp()
  selectedPreset.value = defaultPreset
  edgeEraseEnabled.value = false
  edgeErasePadding.value = 1
  slicePlan.value = planForGrid(defaultPreset)
  editorExpanded.value = false
  resultsCollapsed.value = false
}
const handleSelectPreset = (preset: GridPreset) => { selectedPreset.value = preset }
const handleExportFormatChange = (format: ExportFormat) => { exportFormat.value = format }
const handleAutoDownloadToggle = (value: boolean) => { setAutoDownload(value); if (value && images.value.length) processAll(true, true) }

type PreviewItem = DataSourceItem & { tileId: string; downloadName: string }
const previewActive = ref(false)
const previewStatePushed = ref(false)
const closingFromPop = ref(false)
const lightboxRef = ref<PhotoSwipeLightbox | null>(null)
const lightboxInitialized = ref(false)
const previewItems = computed<PreviewItem[]>(() => images.value.flatMap((image) => image.tiles.map((tile) => ({ src: tile.previewUrl, msrc: tile.previewUrl, width: tile.width, height: tile.height, alt: tile.name, tileId: tile.id, downloadName: tile.name }))))
const previewIndexById = computed(() => new Map(previewItems.value.map((item, index) => [item.tileId, index])))
const triggerTileDownload = (src: string, name: string) => { const link = document.createElement('a'); link.href = src; link.download = name; link.rel = 'noopener'; link.style.display = 'none'; document.body.appendChild(link); link.click(); link.remove() }
const destroyLightbox = () => { lightboxRef.value?.destroy(); lightboxRef.value = null; lightboxInitialized.value = false; previewActive.value = false }
const ensureLightbox = () => {
  if (!lightboxRef.value) {
    const lightbox = new PhotoSwipeLightbox({ pswpModule: () => import('photoswipe'), wheelToZoom: true, paddingFn: (viewportSize) => ((viewportSize as { x?: number }).x ?? 0) <= 640 ? { top: 16, bottom: 24, left: 12, right: 12 } : { top: 24, bottom: 32, left: 24, right: 24 } })
    lightbox.on('uiRegister', () => lightbox.pswp?.ui?.registerElement({ name: 'download-button', order: 8, isButton: true, ariaLabel: currentMessages.value.buttons.previewDownload, title: currentMessages.value.buttons.previewDownload, html: '⬇', onClick: () => { const data = lightbox.pswp?.currSlide?.data as PreviewItem | undefined; if (data?.src) triggerTileDownload(String(data.src), data.downloadName || 'tile') } }))
    lightbox.on('close', () => { previewActive.value = false; if (previewStatePushed.value && !closingFromPop.value) { previewStatePushed.value = false; history.back() }; closingFromPop.value = false })
    lightboxRef.value = lightbox
  }
  lightboxRef.value.options.dataSource = previewItems.value
  if (!lightboxInitialized.value) { lightboxRef.value.init(); lightboxInitialized.value = true }
  return lightboxRef.value
}
const openPreview = (tileId?: string) => { if (!previewItems.value.length) return; const lightbox = ensureLightbox(); const index = tileId ? previewIndexById.value.get(tileId) ?? 0 : 0; if (!previewStatePushed.value) { history.pushState({ igsPreview: true, t: Date.now() }, '', window.location.href); previewStatePushed.value = true }; previewActive.value = true; lightbox.loadAndOpen(index) }
const handleBackNavigation = (event: PopStateEvent) => { if (previewActive.value) { closingFromPop.value = true; lightboxRef.value?.pswp?.close(); previewStatePushed.value = false; event.preventDefault?.() } }

const syncMobileFlag = () => { isMobile.value = window.innerWidth < 960; document.body.dataset.mobile = isMobile.value ? 'true' : 'false'; if (!isMobile.value) advancedDrawerOpen.value = false }
watch(selectedPreset, (preset) => {
  customRows.value = preset.rows
  customCols.value = preset.cols
  // 快捷网格仅替换行列分割线，边线擦除设置持续参与页面预览与导出结果。
  slicePlan.value = {
    ...slicePlan.value,
    horizontalLines: createEvenDividerLines(preset.rows),
    verticalLines: createEvenDividerLines(preset.cols),
  }
})
watch(slicePlan, () => { if (images.value.length) processAll(false) }, { deep: true })
watch(exportFormat, () => { persistPreferences(); if (images.value.length) processAll(false) })
watch(jpgQualityPercent, (quality) => { const clamped = clampQuality(quality); if (clamped !== quality) { jpgQualityPercent.value = clamped; return }; if (isJpgFormat.value && images.value.length) { persistPreferences(); processAll(false) } })
watch(previewItems, (list, previous) => { if (!list.length) { destroyLightbox(); previewStatePushed.value = false; closingFromPop.value = false; return }; if (lightboxRef.value?.pswp && previous?.length !== list.length) { const currentId = (lightboxRef.value.pswp.currSlide?.data as PreviewItem | undefined)?.tileId; const nextId = currentId && list.some((item) => item.tileId === currentId) ? currentId : list[0].tileId; lightboxRef.value.pswp.close(); lightboxInitialized.value = false; lightboxRef.value = null; requestAnimationFrame(() => openPreview(nextId)) } }, { deep: true })
onMounted(() => { setDocumentLang(locale.value); restorePreferences(); syncMobileFlag(); window.addEventListener('dragover', handleGlobalDragOver); window.addEventListener('drop', handleGlobalDrop); window.addEventListener('resize', syncMobileFlag); window.addEventListener('popstate', handleBackNavigation) })
onBeforeUnmount(() => { window.removeEventListener('dragover', handleGlobalDragOver); window.removeEventListener('drop', handleGlobalDrop); window.removeEventListener('resize', syncMobileFlag); window.removeEventListener('popstate', handleBackNavigation); destroyLightbox() })
</script>

<template>
  <ExportProgressOverlay :progress="exportProgress" :tr="tr" :cancellable="state.processing" @cancel="cancelProcessing" @dismiss="dismissExportProgress" />
  <main class="page">
    <AppHeader :tr="tr" :icons="icons" :locale="locale" :supported-locales="supportedLocales" :app-version="appVersion" :github-url="githubUrl" @locale-change="switchLocale" />
    <HeroSection :tr="tr" :icons="icons" :grid-description="editableGridDescription" :tile-count="editableTileCount" :image-size-label="imageSizeLabel" :export-format="exportFormat" :quality-label="qualityLabel" :is-jpg-format="isJpgFormat" :status-text="statusText" :processing="state.processing" :has-tiles="totalTiles > 0" :has-image="hasImage" :is-mobile="isMobile" @choose-file="triggerFileSelect" @trigger-downloads="triggerDownloads" @reset="resetAll" />
    <div class="workspace">
      <aside class="control-rail">
        <div v-if="!isMobile" class="control-stack">
          <GridPresetsPanel :tr="tr" :icons="icons" :presets="gridPresets" :visible-presets="visiblePresets" :selected-preset="selectedPreset" :show-preset-toggle="showPresetToggle" :preset-expanded="presetExpanded" v-model:custom-rows="customRows" v-model:custom-cols="customCols" :processing="state.processing" :is-mobile="isMobile" :edge-erase-enabled="edgeEraseEnabled" :edge-erase-padding="edgeErasePadding" :edge-erase-unit="slicePlan.paddingUnit" :include-outer="slicePlan.trimOuterEdges" @select-preset="handleSelectPreset" @toggle-presets="togglePresetExpanded" @apply-custom-grid="applyCustomGridWithValidation" @update:edge-erase-enabled="updateEdgeEraseEnabled" @update:edge-erase-padding="updateEdgeErasePadding" @update:edge-erase-unit="updateSlicePlan({ paddingUnit: $event })" @update:include-outer="updateSlicePlan({ trimOuterEdges: $event })" />
          <SliceEditor :image-src="images[0]?.objectUrl" :image-alt="images[0]?.baseName" :horizontal-lines="slicePlan.horizontalLines.map((line) => line * 100)" :vertical-lines="slicePlan.verticalLines.map((line) => line * 100)" :expanded="editorExpanded" :disabled="state.processing" @update:expanded="editorExpanded = $event" @update:horizontal-lines="updateHorizontalLines" @update:vertical-lines="updateVerticalLines" @confirm="confirmEditorLines" />
          <ExportSettings :tr="tr" :icons="icons" :export-format="exportFormat" :is-jpg-format="isJpgFormat" :quality-label="qualityLabel" :jpg-quality-percent="jpgQualityPercent" :processing="state.processing" :directory-supported="directoryExportSupported" :directory-ready="directoryExportReady" @update:export-format="handleExportFormatChange" @update:jpg-quality-percent="jpgQualityPercent = $event" @change-directory="changeExportDirectory" />
        </div>
        <GridPresetsPanel v-else :tr="tr" :icons="icons" :presets="gridPresets" :visible-presets="visiblePresets" :selected-preset="selectedPreset" :show-preset-toggle="showPresetToggle" :preset-expanded="presetExpanded" v-model:custom-rows="customRows" v-model:custom-cols="customCols" :processing="state.processing" :is-mobile="isMobile" :edge-erase-enabled="edgeEraseEnabled" :edge-erase-padding="edgeErasePadding" :edge-erase-unit="slicePlan.paddingUnit" :include-outer="slicePlan.trimOuterEdges" :show-custom-grid="false" @select-preset="handleSelectPreset" @toggle-presets="togglePresetExpanded" @apply-custom-grid="applyCustomGridWithValidation" @update:edge-erase-enabled="updateEdgeEraseEnabled" @update:edge-erase-padding="updateEdgeErasePadding" @update:edge-erase-unit="updateSlicePlan({ paddingUnit: $event })" @update:include-outer="updateSlicePlan({ trimOuterEdges: $event })" />
      </aside>
      <section class="content-rail">
        <!-- 不放在组件插槽中，保证 composable 可稳定取得 ref 并触发系统文件选择器。 -->
        <input ref="fileInput" class="file-input" type="file" accept="image/*" multiple @change="onFileChange" />
        <UploadPanel :tr="tr" :icons="icons" :drag-over="state.dragOver" :has-image="hasImage" :first-base-name="firstBaseName" :first-image-size="firstImageSize" :queue-summary="queueSummary" :error-text="errorText" :is-mobile="isMobile" @drop="onDrop" @dragover="onDragOver" @dragleave="onDragLeave" @file-change="onFileChange" @pick="triggerFileSelect" />
        <ResultsPanel :tr="tr" :icons="icons" :images="images" :tiles-heading="tilesHeading" :results-summary="resultsSummary" :auto-download="autoDownload" :processing="state.processing" :collapsed="resultsCollapsed" :pending-traditional-downloads="pendingTraditionalDownloads ? { written: totalTiles - pendingTraditionalDownloads.length, pending: pendingTraditionalDownloads.length } : null" @toggle-collapsed="resultsCollapsed = !resultsCollapsed" @toggle-auto-download="handleAutoDownloadToggle" @trigger-downloads="triggerDownloads" @retry-pending-downloads="retryPendingTraditionalDownloads" @download-image="downloadSingleImage" @preview-tile="openPreview" @preview-all="() => openPreview()" />
      </section>
    </div>
    <MobileAdvancedDrawer v-if="isMobile" v-model:open="advancedDrawerOpen" :has-image="hasImage" :download-disabled="state.processing || totalTiles === 0" @trigger-downloads="triggerDownloads">
      <GridPresetsPanel :tr="tr" :icons="icons" :presets="gridPresets" :visible-presets="visiblePresets" :selected-preset="selectedPreset" :show-preset-toggle="false" :preset-expanded="presetExpanded" v-model:custom-rows="customRows" v-model:custom-cols="customCols" :processing="state.processing" :is-mobile="isMobile" :edge-erase-enabled="edgeEraseEnabled" :edge-erase-padding="edgeErasePadding" :edge-erase-unit="slicePlan.paddingUnit" :include-outer="slicePlan.trimOuterEdges" :disabled="!hasImage" :show-presets="false" :show-edge-erase="false" @select-preset="handleSelectPreset" @toggle-presets="togglePresetExpanded" @apply-custom-grid="applyCustomGridWithValidation" @update:edge-erase-enabled="updateEdgeEraseEnabled" @update:edge-erase-padding="updateEdgeErasePadding" @update:edge-erase-unit="updateSlicePlan({ paddingUnit: $event })" @update:include-outer="updateSlicePlan({ trimOuterEdges: $event })" />
      <SliceEditor :image-src="images[0]?.objectUrl" :image-alt="images[0]?.baseName" :horizontal-lines="slicePlan.horizontalLines.map((line) => line * 100)" :vertical-lines="slicePlan.verticalLines.map((line) => line * 100)" :expanded="editorExpanded" :disabled="state.processing || !hasImage" @update:expanded="editorExpanded = $event" @update:horizontal-lines="updateHorizontalLines" @update:vertical-lines="updateVerticalLines" @confirm="confirmEditorLines" />
      <ExportSettings :tr="tr" :icons="icons" :export-format="exportFormat" :is-jpg-format="isJpgFormat" :quality-label="qualityLabel" :jpg-quality-percent="jpgQualityPercent" :processing="state.processing || !hasImage" :directory-supported="directoryExportSupported" :directory-ready="directoryExportReady" @update:export-format="handleExportFormatChange" @update:jpg-quality-percent="jpgQualityPercent = $event" @change-directory="changeExportDirectory" />
    </MobileAdvancedDrawer>
  </main>
</template>

<style>
:root { color-scheme: dark; }.page { display: flex; max-width: 1180px; min-height: 100dvh; margin: 0 auto; padding: 14px; flex-direction: column; gap: 10px; }.panel { border: 1px solid rgb(203 239 231 / .14); border-radius: 12px; padding: 11px; background: #152129; }.hero { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(280px, .75fr); gap: 10px; padding: 4px 0; }.hero h1 { margin: 2px 0; font-size: 27px; }.hero-card { align-self: stretch; padding: 10px; border: 1px solid rgb(203 239 231 / .14); border-radius: 12px; background: #152129; }.eyebrow { margin: 0; color: #8fd7ca; font-size: 11px; font-weight: 700; }.subhead,.muted,.hint { color: #a9c1be; }.actions,.results-actions,.tiles-actions,.custom-fields,.format-radios { display: flex; flex-wrap: wrap; gap: 6px; }.stat-row { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px solid rgb(203 239 231 / .09); }.stat-row:last-child { border: 0; }.label { color: #a9c1be; }.value { text-align: right; }.preset-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(88px,1fr)); gap: 6px; }.preset { justify-content: flex-start; min-height: 34px; }.preset.active,.button-row button.active { border-color: #47d7ba; background: rgb(71 215 186 / .14); color: #baffef; }.custom-grid { display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; }.export-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }.export-field { display: grid; gap: 6px; }.dropzone { padding: 20px 14px; border: 2px dashed rgb(143 215 202 / .4); border-radius: 12px; text-align: center; cursor: pointer; }.dropzone.over { border-color: #47d7ba; background: rgb(71 215 186 / .1); }.file-input { display: none; }.results { padding: 0; overflow: hidden; }.results-header { display: flex; justify-content: space-between; gap: 10px; padding: 11px; }.image-list { display: grid; gap: 8px; padding: 10px; }.image-block { display: grid; grid-template-columns: minmax(220px,.9fr) 1.1fr; gap: 10px; padding: 10px; border: 1px solid rgb(203 239 231 / .1); border-radius: 10px; }.preview-box { display: grid; min-height: 160px; place-items: center; border-radius: 8px; background: #0f1a20; }.preview-box img { max-width: 100%; max-height: 220px; object-fit: contain; }.tiles-header { display: flex; justify-content: space-between; gap: 8px; }.tiles-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(104px,1fr)); gap: 6px; margin-top: 8px; }.tile { padding: 6px; border: 1px solid rgb(203 239 231 / .1); border-radius: 8px; cursor: pointer; }.tile img { width: 100%; aspect-ratio: 1; object-fit: contain; }.tile-footer { display: flex; justify-content: space-between; gap: 5px; }.tile-name { overflow: hidden; margin: 3px 0 0; color: #a9c1be; font-size: 11px; text-overflow: ellipsis; }.link-btn,.ghost { border-color: rgb(203 239 231 / .18); background: transparent; color: #dff4ee; }.danger { color: #ffb7ac; }.inline-icon,.title-icon,.stat-icon,.btn-icon { width: 15px; height: 15px; }.error { color: #ffb7ac; }@media (max-width: 700px) { .page { padding: 8px; gap: 8px; }.hero,.export-controls,.image-block { grid-template-columns: 1fr; }.hero-card { display: none; }.results-header,.tiles-header { flex-direction: column; }.results-actions { align-items: flex-start; }.custom-grid { align-items: flex-start; flex-direction: column; }.tiles-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
.hero.compact { grid-template-columns: 1fr auto; align-items:center; padding:0; }.hero.compact .eyebrow,.hero.compact h1,.hero.compact .subhead,.hero.compact .hint { display:none; }.hero.compact .hero-text { display:flex; align-items:center; }.hero.compact .hero-card { display:flex; gap:10px; padding:0; border:0; background:transparent; }.hero.compact .stat-row { padding:0; border:0; gap:4px; }.hero.compact .stat-row:nth-child(5) { display:none; }
.page{max-width:1400px;padding:10px;gap:8px}.workspace{display:grid;grid-template-columns:minmax(410px,440px) minmax(0,1fr);align-items:start;gap:8px}.control-rail{position:sticky;top:8px;display:grid;gap:8px;min-width:0}.control-stack,.content-rail{display:grid;gap:8px;min-width:0}.control-stack>*,.content-rail>.upload-panel,.content-rail>.results{min-width:0}.image-title{margin:0;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.image-tile-count{margin:2px 0 0;font-size:12px}@media(max-width:959px){.page{padding:8px 8px calc(68px + env(safe-area-inset-bottom));gap:8px}.workspace{grid-template-columns:minmax(0,1fr);gap:8px}.control-rail{position:static;order:1}.content-rail{order:2}.hero{grid-template-columns:minmax(0,1fr)}.hero-card{display:none}.results-header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:8px;padding:10px}.results-header h3{margin:1px 0;font-size:17px}.results-overview>.muted{margin:3px 0;font-size:11px;line-height:1.35}.results-actions{align-items:flex-end;gap:4px}.auto-toggle{font-size:11px;white-space:nowrap}.auto-download-hint,.results-download{display:none}.results-header .link-btn{margin-top:2px;padding:2px 0;font-size:11px}.tiles-header{flex-direction:column}.results-actions{align-items:flex-start}}@media(min-width:960px){.content-rail>.upload-panel:not(.has-image){min-height:calc(100dvh - 270px)}}
</style>
