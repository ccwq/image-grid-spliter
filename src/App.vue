<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import type { DataSourceItem } from 'photoswipe'
import pixelarticons from '@iconify-json/pixelarticons/icons.json'
import AppHeader from './components/AppHeader.vue'
import DesktopDownloadBar from './components/DesktopDownloadBar.vue'
import ExportProgressOverlay from './components/ExportProgressOverlay.vue'
import ExportSettings from './components/ExportSettings.vue'
import GridPresetsPanel from './components/GridPresetsPanel.vue'
import MobileAdvancedDrawer from './components/MobileAdvancedDrawer.vue'
import ResultsPanel from './components/ResultsPanel.vue'
import SliceEditor from './components/SliceEditor.vue'
import UploadPanel from './components/UploadPanel.vue'
import { useExportSettings } from './composables/useExportSettings'
import { useColorScheme } from './composables/useColorScheme'
import { useGridSettings } from './composables/useGridSettings'
import { useImageSlicer } from './composables/useImageSlicer'
import { useLocale, type ExportFormat } from './composables/useLocale'
import { gridPresets } from './utils/grid'
import 'photoswipe/style.css'

const icons = { grid: pixelarticons.icons.grid, upload: pixelarticons.icons['cloud-upload'], download: pixelarticons.icons.download, image: pixelarticons.icons.image, flag: pixelarticons.icons.flag, info: pixelarticons.icons['info-box'], redo: pixelarticons.icons.redo, trash: pixelarticons.icons.trash, check: pixelarticons.icons.check, chevronDown: pixelarticons.icons['chevron-down'], chevronUp: pixelarticons.icons['chevron-up'], imagePlus: pixelarticons.icons['image-plus'], file: pixelarticons.icons.file, folder: pixelarticons.icons.folder, sun: pixelarticons.icons.sun, moon: pixelarticons.icons.moon }
const appVersion = __APP_VERSION__
const githubUrl = 'https://github.com/ccwq/image-grid-spliter'
const isMobile = ref(false)
const editorExpanded = ref(false)
const resultsCollapsed = ref(false)
const advancedDrawerOpen = ref(false)

const { locale, currentMessages, tr, supportedLocales, switchLocale, setDocumentLang } = useLocale()

// 亮暗外观：工厂内同步水合 localStorage 并应用到根元素（含 meta theme-color），
// 先于其他模块注册，保证首帧后 DOM 与持久化状态即一致；卸载时移除系统外观监听。
const { colorScheme, toggleColorScheme: toggleTheme, dispose: disposeColorScheme } = useColorScheme()

/** 网格卡片/恢复载荷的最小结构（useGridSettings.selectPreset 只读 rows/cols/label）。 */
type GridPresetLike = { rows: number; cols: number; label: string }

// 设置模块在工厂函数内同步水合 localStorage（网格/自定义行列/手动分割线/边线擦除 + 格式/质量）。
// 这一步必须先于 useImageSlicer 与下方生成 watcher：watcher 注册时看到的已是恢复值，
// 恢复的 3 x 5 自定义网格与非等分分割线不会被任何等分线 watcher 覆写（模块内部不存在该 watcher）。
const { exportFormat, jpgQualityPercent, isJpgFormat, jpgQuality, qualityLabel, clampQuality, updateExportFormat } = useExportSettings()
const {
  selectedPreset, customRows, customCols, visiblePresets, showPresetToggle, presetExpanded,
  slicePlan, edgeEraseEnabled, edgeErasePadding,
  selectPreset, applyCustomGrid, togglePresetExpanded,
  setHorizontalLines, setVerticalLines, setEdgeEraseEnabled, setEdgeErasePadding, setEdgeEraseUnit, setEdgeEraseIncludeOuter,
} = useGridSettings({ isMobile, messages: currentMessages })
const editableTileCount = computed(() => (slicePlan.value.horizontalLines.length + 1) * (slicePlan.value.verticalLines.length + 1))
const editableGridDescription = computed(() => currentMessages.value.format.gridDescription(slicePlan.value.verticalLines.length + 1, slicePlan.value.horizontalLines.length + 1))
const {
  fileInput, images, totalTiles, autoDownload, firstImageSize, state, statusText, clearError, resetApp, dispose, triggerDownloads, processAll,
  onFileChange, onDrop, onDragOver, onDragLeave, handleGlobalDragOver, handleGlobalDrop, triggerFileSelect,
  setAutoDownload, downloadSingleImage, directoryExportSupported, directoryExportReady, pendingTraditionalDownloads, changeExportDirectory, savePreviewTile, savePreviewTileAs, retryPendingTraditionalDownloads, exportProgress, dismissExportProgress, cancelProcessing,
} = useImageSlicer({ selectedPreset, slicePlan, exportFormat, jpgQuality, gridDescription: editableGridDescription, currentMessages })

const hasImage = computed(() => images.value.length > 0)
const imageSizeLabel = computed(() => firstImageSize.value ? images.value.length > 1 ? currentMessages.value.format.imageCountWithSize(images.value.length, firstImageSize.value.width, firstImageSize.value.height) : currentMessages.value.format.imageSize(firstImageSize.value.width, firstImageSize.value.height) : currentMessages.value.stats.notLoaded)
const tilesHeading = computed(() => currentMessages.value.format.tilesHeading(totalTiles.value))
const resultsSummary = computed(() => currentMessages.value.format.resultsSummaryMulti(editableGridDescription.value, exportFormat.value.toUpperCase(), images.value.length, isJpgFormat.value, qualityLabel.value))
const firstBaseName = computed(() => images.value[0]?.baseName ?? 'tile')
const queueSummary = computed(() => images.value.length ? currentMessages.value.upload.queuePrefix(images.value.length) : '')
const errorText = computed(() => state.errorKey === 'none' ? '' : state.errorDetail || currentMessages.value.errors.processingFailed)

// 网格/边线擦除全部经设置模块的显式动作写入：动作内部负责归一化、原子替换与持久化。
const updateEdgeErasePadding = (value: number) => setEdgeErasePadding(value)
const updateEdgeEraseEnabled = (value: boolean) => setEdgeEraseEnabled(value)
const updateHorizontalLines = (lines: number[]) => setHorizontalLines(lines.map((line) => line / 100))
const updateVerticalLines = (lines: number[]) => setVerticalLines(lines.map((line) => line / 100))
const confirmEditorLines = (lines: { horizontal: number[]; vertical: number[] }) => {
  setHorizontalLines(lines.horizontal.map((line) => line / 100))
  setVerticalLines(lines.vertical.map((line) => line / 100))
  advancedDrawerOpen.value = false
}

const applyCustomGridWithValidation = () => {
  const result = applyCustomGrid()
  if (!result.ok) state.errorKey = 'customGridInvalid'
  else clearError()
}
// 重置仅清空工作区（图片/结果/缓存/待交付下载与瞬时 UI），处理配置与 localStorage 全部保留。
const resetAll = () => {
  resetApp()
  editorExpanded.value = false
  resultsCollapsed.value = false
}
const handleSelectPreset = (preset: GridPresetLike) => { selectPreset(preset) }
const handleExportFormatChange = (format: ExportFormat) => { updateExportFormat(format) }
const handleAutoDownloadToggle = (value: boolean) => { setAutoDownload(value); if (value && images.value.length) processAll(true, true) }

type PreviewItem = DataSourceItem & { tileId: string; downloadName: string }
const previewActive = ref(false)
const previewStatePushed = ref(false)
const closingFromPop = ref(false)
/** 数据源换装期间暂存的原位重开目标：由旧实例的 destroy 回调消费，显式销毁时清空。 */
let pendingReopenTileId: string | null = null
const lightboxRef = ref<PhotoSwipeLightbox | null>(null)
const lightboxInitialized = ref(false)
let previewToastTimer: ReturnType<typeof setTimeout> | null = null
let previewToastElement: HTMLElement | null = null
/**
 * 预览数据源：携带 tileId 作为身份标识。缓存命中会以全新 id + 新 URL 重新物料化同数量 tiles，
 * PhotoSwipe 的 dataSource 必须同步换成新数组引用，否则打开时会读到已被 revoke 的旧 URL。
 */
const previewItems = computed<PreviewItem[]>(() => images.value.flatMap((image) => image.tiles.map((tile) => ({ src: tile.previewUrl, msrc: tile.previewUrl, width: tile.width, height: tile.height, alt: tile.name, tileId: tile.id, downloadName: tile.name }))))
const previewIndexById = computed(() => new Map(previewItems.value.map((item, index) => [item.tileId, index])))
/** 数据源身份签名：tile 数量 + tileId 序列。tileId 含随机 id，同数量重物料化必然改变签名。 */
const previewItemsSignature = computed(() => previewItems.value.map((item) => item.tileId).join('|'))
const triggerTileDownload = (src: string, name: string) => { const link = document.createElement('a'); link.href = src; link.download = name; link.rel = 'noopener'; link.style.display = 'none'; document.body.appendChild(link); link.click(); link.remove() }
const showPreviewToast = (message: string, tone: 'success' | 'notice' | 'error' = 'notice') => {
  if (!previewToastElement) return
  previewToastElement.textContent = message
  previewToastElement.dataset.tone = tone
  previewToastElement.dataset.visible = 'true'
  if (previewToastTimer) clearTimeout(previewToastTimer)
  previewToastTimer = setTimeout(() => { if (previewToastElement) previewToastElement.dataset.visible = 'false' }, 2600)
}
const setPreviewButton = (element: HTMLElement, label: string, busy = false, success = false) => {
  element.textContent = label
  element.setAttribute('aria-label', label)
  element.setAttribute('title', label)
  element.toggleAttribute('disabled', busy)
  element.classList.toggle('is-busy', busy)
  element.classList.toggle('is-success', success)
}
const restorePreviewButton = (element: HTMLElement, label: string) => setTimeout(() => setPreviewButton(element, label), 1500)
const currentPreviewItem = (pswp: { currSlide?: { data?: unknown } }) => pswp.currSlide?.data as PreviewItem | undefined
const destroyLightbox = () => { if (previewToastTimer) clearTimeout(previewToastTimer); previewToastElement = null; pendingReopenTileId = null; lightboxRef.value?.destroy(); lightboxRef.value = null; lightboxInitialized.value = false; previewActive.value = false }
const ensureLightbox = () => {
  if (!lightboxRef.value) {
    const lightbox = new PhotoSwipeLightbox({ pswpModule: () => import('photoswipe'), wheelToZoom: true, paddingFn: (viewportSize) => ((viewportSize as { x?: number }).x ?? 0) <= 640 ? { top: 16, bottom: 24, left: 12, right: 12 } : { top: 24, bottom: 32, left: 24, right: 24 } })
    lightbox.on('uiRegister', () => {
      const ui = lightbox.pswp?.ui
      ui?.registerElement({ name: 'preview-feedback', className: 'pswp__preview-feedback', order: 1, appendTo: 'root', html: '', onInit: (element) => { previewToastElement = element; element.dataset.visible = 'false' } })
      ui?.registerElement({ name: 'save-button', className: 'pswp__button--save-button', order: 7, isButton: true, ariaLabel: currentMessages.value.buttons.previewSave, title: currentMessages.value.buttons.previewSave, html: currentMessages.value.buttons.previewSave, onClick: (_event, element, pswp) => { void (async () => { const data = currentPreviewItem(pswp); if (!data) return; setPreviewButton(element, currentMessages.value.buttons.previewSaving, true); const result = await savePreviewTile(data.tileId); if (result === 'saved') { setPreviewButton(element, '✓', false, true); showPreviewToast(currentMessages.value.buttons.previewSaved, 'success') } else if (result === 'fallback' && data.src) { triggerTileDownload(String(data.src), data.downloadName || 'tile'); setPreviewButton(element, '↓', false, true); showPreviewToast(currentMessages.value.buttons.previewDownloadFallback, 'notice') } else { setPreviewButton(element, '!', false); showPreviewToast(currentMessages.value.buttons.previewSaveFailed, 'error') }; restorePreviewButton(element, currentMessages.value.buttons.previewSave) })() } })
      ui?.registerElement({ name: 'download-button', className: 'pswp__button--download-button', order: 8, isButton: true, ariaLabel: currentMessages.value.buttons.previewDownload, title: currentMessages.value.buttons.previewDownload, html: '↓', onClick: (_event, element, pswp) => { const data = currentPreviewItem(pswp); if (!data?.src) return; triggerTileDownload(String(data.src), data.downloadName || 'tile'); setPreviewButton(element, '✓', false, true); showPreviewToast(currentMessages.value.buttons.previewDownloaded, 'notice'); restorePreviewButton(element, '↓') } })
      ui?.registerElement({ name: 'save-as-button', className: 'pswp__button--save-as-button', order: 9, isButton: true, ariaLabel: currentMessages.value.buttons.previewSaveAs, title: currentMessages.value.buttons.previewSaveAs, html: '⋮', onClick: (_event, element, pswp) => { void (async () => { const data = currentPreviewItem(pswp); if (!data) return; setPreviewButton(element, '…', true); const result = await savePreviewTileAs(data.tileId); if (result === 'saved') { setPreviewButton(element, '✓', false, true); showPreviewToast(currentMessages.value.buttons.previewSaved, 'success') } else if (result === 'unsupported') { setPreviewButton(element, '!', false); showPreviewToast(currentMessages.value.buttons.previewSaveAsUnavailable, 'error') } else if (result === 'cancelled') { setPreviewButton(element, '⋮'); showPreviewToast(currentMessages.value.buttons.previewSaveAsCancelled, 'notice') } else { setPreviewButton(element, '!', false); showPreviewToast(result === 'missing' ? currentMessages.value.buttons.previewSaveFailed : currentMessages.value.buttons.previewSaveAsFailed, 'error') }; restorePreviewButton(element, '⋮') })() } })
    })
    lightbox.on('close', () => { previewActive.value = false; if (previewStatePushed.value && !closingFromPop.value) { previewStatePushed.value = false; history.back() }; closingFromPop.value = false })
    lightboxRef.value = lightbox
  }
  // 数据源以最新数组整体替换：tileId 变了 ⇒ 旧 URL 已被 revoke，必须让 PhotoSwipe 读新 src。
  lightboxRef.value.options.dataSource = previewItems.value
  if (!lightboxInitialized.value) { lightboxRef.value.init(); lightboxInitialized.value = true }
  return lightboxRef.value
}
const openPreview = (tileId?: string) => { if (!previewItems.value.length) return; const lightbox = ensureLightbox(); const index = tileId ? previewIndexById.value.get(tileId) ?? 0 : 0; if (!previewStatePushed.value) { history.pushState({ igsPreview: true, t: Date.now() }, '', window.location.href); previewStatePushed.value = true }; previewActive.value = true; lightbox.loadAndOpen(index) }
const handleBackNavigation = (event: PopStateEvent) => { if (previewActive.value) { closingFromPop.value = true; lightboxRef.value?.pswp?.close(); previewStatePushed.value = false; event.preventDefault?.() } }

const syncMobileFlag = () => { isMobile.value = window.innerWidth < 960; document.body.dataset.mobile = isMobile.value ? 'true' : 'false'; if (!isMobile.value) advancedDrawerOpen.value = false }
// 生成 watcher 只观察生效生成参数（分割线/擦除 → slicePlan；格式；JPG 质量百分比）。
// 选择预设/自定义行列本身不直接触发生成：它们经 selectPreset/applyCustomGrid 重建等分线后由 slicePlan watcher 接力。
// JPG 质量持久化已由 useExportSettings 内部 watcher 承担，此处仅 PNG 免重生成、JPG 才补一轮生成。
watch(slicePlan, () => { if (images.value.length) processAll(false) }, { deep: true })
watch(exportFormat, () => { if (images.value.length) processAll(false) })
watch(jpgQualityPercent, (quality) => {
  const clamped = clampQuality(quality)
  if (clamped !== quality) { jpgQualityPercent.value = clamped; return }
  if (isJpgFormat.value && images.value.length) processAll(false)
})
// 数据源身份签名变化 ⇒ 旧 tile URL 已全部失效：关闭旧实例，待其 destroy 完成（window.pswp 被清除、
// loadAndOpen 的占用守卫解除）后再以新数据源原位重开（保持历史占位不回退）。
// 注意不能仅隔一帧重开：window.pswp 要到关闭动画（约 300ms）结束后的 destroy 事件才被清除，
// 过早调用 loadAndOpen 会被 `if (window.pswp) return false` 静默拒绝。
watch(previewItemsSignature, (signature, previous) => {
  if (!signature) { pendingReopenTileId = null; destroyLightbox(); previewStatePushed.value = false; closingFromPop.value = false; return }
  if (lightboxRef.value?.pswp && previous !== undefined && previous !== signature) {
    const currentId = (lightboxRef.value.pswp.currSlide?.data as PreviewItem | undefined)?.tileId
    const nextId = currentId && previewIndexById.value.has(currentId) ? currentId : previewItems.value[0].tileId
    pendingReopenTileId = nextId
    // 旧实例 destroy 时（lightbox 的 pswp 引用与 window.pswp 同步清除）在下一微任务原位重开
    lightboxRef.value.pswp.on('destroy', () => {
      if (pendingReopenTileId !== nextId) return // 已有更新的重开意图或已被显式销毁：由 destroyLightbox/新回调负责
      pendingReopenTileId = null
      void Promise.resolve().then(() => openPreview(nextId))
    })
    lightboxRef.value.pswp.close()
    lightboxInitialized.value = false
    lightboxRef.value = null
  }
})
onMounted(() => { setDocumentLang(locale.value); syncMobileFlag(); window.addEventListener('dragover', handleGlobalDragOver); window.addEventListener('drop', handleGlobalDrop); window.addEventListener('resize', syncMobileFlag); window.addEventListener('popstate', handleBackNavigation) })
// 卸载顺序：先安全销毁 PhotoSwipe（预览不再持有即将失效的 URL），再 dispose slicer（放弃在途生成、revoke 全部 URL、清缓存）。
onBeforeUnmount(() => {
  window.removeEventListener('dragover', handleGlobalDragOver)
  window.removeEventListener('drop', handleGlobalDrop)
  window.removeEventListener('resize', syncMobileFlag)
  window.removeEventListener('popstate', handleBackNavigation)
  destroyLightbox()
  dispose()
  disposeColorScheme()
})
</script>

<template>
  <ExportProgressOverlay :progress="exportProgress" :tr="tr" :cancellable="state.processing" @cancel="cancelProcessing" @dismiss="dismissExportProgress" @retry-pending-downloads="retryPendingTraditionalDownloads" />
  <!-- PC 端浮动导出栏：队列非空 + v-if=!isMobile 门控 + 组件内部 min-width:960 媒体查询，移动端与空队列均不渲染。 -->
  <DesktopDownloadBar v-if="!isMobile && images.length" :tr="tr" :icons="icons" :queue-count="images.length" :auto-download="autoDownload" :processing="state.processing" @toggle-auto-download="handleAutoDownloadToggle" @trigger-downloads="triggerDownloads" />
  <main class="page">
    <!-- 紧凑头部：品牌 + 内联状态条（网格/切片/图片/格式/实时状态）+ 条件动作与外观/语言/GitHub 控制。 -->
    <AppHeader :tr="tr" :icons="icons" :locale="locale" :supported-locales="supportedLocales" :app-version="appVersion" :github-url="githubUrl" :color-scheme="colorScheme" :grid-description="editableGridDescription" :tile-count="editableTileCount" :image-info="imageSizeLabel" :export-format="exportFormat" :quality-label="qualityLabel" :is-jpg-format="isJpgFormat" :status-text="statusText" :has-tiles="totalTiles > 0" :has-image="hasImage" @locale-change="switchLocale" @toggle-color-scheme="toggleTheme" @trigger-downloads="triggerDownloads" @reset="resetAll" />
    <div class="workspace">
      <aside class="control-rail">
        <div v-if="!isMobile" class="control-stack">
          <GridPresetsPanel :tr="tr" :icons="icons" :presets="gridPresets" :visible-presets="visiblePresets" :selected-preset="selectedPreset" :show-preset-toggle="showPresetToggle" :preset-expanded="presetExpanded" v-model:custom-rows="customRows" v-model:custom-cols="customCols" :processing="state.processing" :is-mobile="isMobile" :edge-erase-enabled="edgeEraseEnabled" :edge-erase-padding="edgeErasePadding" :edge-erase-unit="slicePlan.paddingUnit" :include-outer="slicePlan.trimOuterEdges" @select-preset="handleSelectPreset" @toggle-presets="togglePresetExpanded" @apply-custom-grid="applyCustomGridWithValidation" @update:edge-erase-enabled="updateEdgeEraseEnabled" @update:edge-erase-padding="updateEdgeErasePadding" @update:edge-erase-unit="setEdgeEraseUnit" @update:include-outer="setEdgeEraseIncludeOuter" />
          <SliceEditor :image-src="images[0]?.objectUrl" :image-alt="images[0]?.baseName" :horizontal-lines="slicePlan.horizontalLines.map((line) => line * 100)" :vertical-lines="slicePlan.verticalLines.map((line) => line * 100)" :expanded="editorExpanded" :disabled="state.processing" @update:expanded="editorExpanded = $event" @update:horizontal-lines="updateHorizontalLines" @update:vertical-lines="updateVerticalLines" @confirm="confirmEditorLines" />
          <ExportSettings :tr="tr" :icons="icons" :export-format="exportFormat" :is-jpg-format="isJpgFormat" :quality-label="qualityLabel" :jpg-quality-percent="jpgQualityPercent" :processing="state.processing" :directory-supported="directoryExportSupported" :directory-ready="directoryExportReady" @update:export-format="handleExportFormatChange" @update:jpg-quality-percent="jpgQualityPercent = $event" @change-directory="changeExportDirectory" />
        </div>
        <GridPresetsPanel v-else :tr="tr" :icons="icons" :presets="gridPresets" :visible-presets="visiblePresets" :selected-preset="selectedPreset" :show-preset-toggle="showPresetToggle" :preset-expanded="presetExpanded" v-model:custom-rows="customRows" v-model:custom-cols="customCols" :processing="state.processing" :is-mobile="isMobile" :edge-erase-enabled="edgeEraseEnabled" :edge-erase-padding="edgeErasePadding" :edge-erase-unit="slicePlan.paddingUnit" :include-outer="slicePlan.trimOuterEdges" :show-custom-grid="false" @select-preset="handleSelectPreset" @toggle-presets="togglePresetExpanded" @apply-custom-grid="applyCustomGridWithValidation" @update:edge-erase-enabled="updateEdgeEraseEnabled" @update:edge-erase-padding="updateEdgeErasePadding" @update:edge-erase-unit="setEdgeEraseUnit" @update:include-outer="setEdgeEraseIncludeOuter" />
      </aside>
      <section class="content-rail">
        <!-- 不放在组件插槽中，保证 composable 可稳定取得 ref 并触发系统文件选择器。 -->
        <input ref="fileInput" class="file-input" type="file" accept="image/*" multiple @change="onFileChange" />
        <UploadPanel :tr="tr" :icons="icons" :drag-over="state.dragOver" :has-image="hasImage" :first-base-name="firstBaseName" :first-image-size="firstImageSize" :queue-summary="queueSummary" :error-text="errorText" :is-mobile="isMobile" @drop="onDrop" @dragover="onDragOver" @dragleave="onDragLeave" @file-change="onFileChange" @pick="triggerFileSelect" />
        <ResultsPanel :tr="tr" :icons="icons" :images="images" :tiles-heading="tilesHeading" :results-summary="resultsSummary" :auto-download="autoDownload" :processing="state.processing" :collapsed="resultsCollapsed" :show-inline-download-controls="isMobile" :pending-traditional-downloads="pendingTraditionalDownloads ? { written: totalTiles - pendingTraditionalDownloads.length, pending: pendingTraditionalDownloads.length } : null" @toggle-collapsed="resultsCollapsed = !resultsCollapsed" @toggle-auto-download="handleAutoDownloadToggle" @trigger-downloads="triggerDownloads" @retry-pending-downloads="retryPendingTraditionalDownloads" @download-image="downloadSingleImage" @preview-tile="openPreview" />
      </section>
    </div>
    <MobileAdvancedDrawer v-if="isMobile" v-model:open="advancedDrawerOpen" :has-image="hasImage" :download-disabled="state.processing || totalTiles === 0" @trigger-downloads="triggerDownloads">
      <GridPresetsPanel :tr="tr" :icons="icons" :presets="gridPresets" :visible-presets="visiblePresets" :selected-preset="selectedPreset" :show-preset-toggle="false" :preset-expanded="presetExpanded" v-model:custom-rows="customRows" v-model:custom-cols="customCols" :processing="state.processing" :is-mobile="isMobile" :edge-erase-enabled="edgeEraseEnabled" :edge-erase-padding="edgeErasePadding" :edge-erase-unit="slicePlan.paddingUnit" :include-outer="slicePlan.trimOuterEdges" :disabled="!hasImage" :show-presets="false" :show-edge-erase="false" @select-preset="handleSelectPreset" @toggle-presets="togglePresetExpanded" @apply-custom-grid="applyCustomGridWithValidation" @update:edge-erase-enabled="updateEdgeEraseEnabled" @update:edge-erase-padding="updateEdgeErasePadding" @update:edge-erase-unit="setEdgeEraseUnit" @update:include-outer="setEdgeEraseIncludeOuter" />
      <SliceEditor :image-src="images[0]?.objectUrl" :image-alt="images[0]?.baseName" :horizontal-lines="slicePlan.horizontalLines.map((line) => line * 100)" :vertical-lines="slicePlan.verticalLines.map((line) => line * 100)" :expanded="editorExpanded" :disabled="state.processing || !hasImage" @update:expanded="editorExpanded = $event" @update:horizontal-lines="updateHorizontalLines" @update:vertical-lines="updateVerticalLines" @confirm="confirmEditorLines" />
      <ExportSettings :tr="tr" :icons="icons" :export-format="exportFormat" :is-jpg-format="isJpgFormat" :quality-label="qualityLabel" :jpg-quality-percent="jpgQualityPercent" :processing="state.processing || !hasImage" :directory-supported="directoryExportSupported" :directory-ready="directoryExportReady" @update:export-format="handleExportFormatChange" @update:jpg-quality-percent="jpgQualityPercent = $event" @change-directory="changeExportDirectory" />
    </MobileAdvancedDrawer>
  </main>
</template>

<style>
.page { display: flex; max-width: 1180px; min-height: 100dvh; margin: 0 auto; padding: 14px; flex-direction: column; gap: 10px; }.panel { border: 1px solid var(--color-border); border-radius: 12px; padding: 11px; background: var(--color-surface); }.eyebrow { margin: 0; color: var(--color-accent); font-size: 11px; font-weight: 700; }.subhead,.muted,.hint { color: var(--color-text-muted); }.actions,.results-actions,.tiles-actions,.custom-fields,.format-radios { display: flex; flex-wrap: wrap; gap: 6px; }.label { color: var(--color-text-muted); }.value { text-align: right; }.preset-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(88px,1fr)); gap: 6px; }.preset { justify-content: flex-start; min-height: 34px; }.preset.active,.button-row button.active { border-color: var(--color-accent-selected); background: var(--color-accent-selected); color: var(--color-accent-selected-text); }.preset.active:hover,.button-row button.active:hover { border-color: var(--color-accent-selected-hover); background: var(--color-accent-selected-hover); }.custom-grid { display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; }.export-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }.export-field { display: grid; gap: 6px; }.dropzone { padding: 20px 14px; border: 2px dashed var(--color-border-strong); border-radius: 12px; text-align: center; cursor: pointer; }.dropzone.over { border-color: var(--color-accent); background: var(--color-accent-soft); }.file-input { display: none; }.results { padding: 0; overflow: hidden; }.results-header { display: flex; justify-content: space-between; gap: 10px; padding: 11px; }.image-list { display: grid; gap: 8px; padding: 10px; }.image-block { display: grid; grid-template-columns: minmax(220px,.9fr) 1.1fr; gap: 10px; padding: 10px; border: 1px solid var(--color-border-subtle); border-radius: 10px; }.preview-box { display: grid; min-height: 160px; place-items: center; border-radius: 8px; background: var(--color-preview); }.preview-box img { max-width: 100%; max-height: 220px; object-fit: contain; }.tiles-header { display: flex; justify-content: space-between; gap: 8px; }.tiles-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(104px,1fr)); gap: 6px; margin-top: 8px; }.tile { padding: 6px; border: 1px solid var(--color-border-subtle); border-radius: 8px; cursor: pointer; }.tile img { width: 100%; aspect-ratio: 1; object-fit: contain; }.link-btn,.ghost { border-color: var(--color-border-strong); background: transparent; color: var(--color-text-strong); }.results-download { align-self:flex-start; min-height:32px; }.danger { color: var(--color-danger); }.inline-icon,.btn-icon { width: 15px; height: 15px; }.error { color: var(--color-danger); }@media (max-width: 700px) { .page { padding: 8px; gap: 8px; }.export-controls,.image-block { grid-template-columns: 1fr; }.results-header,.tiles-header { flex-direction: column; }.results-actions { align-items: flex-start; }.custom-grid { align-items: flex-start; flex-direction: column; }.tiles-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
.page{max-width:1400px;padding:10px;gap:8px}.workspace{display:grid;grid-template-columns:minmax(410px,440px) minmax(0,1fr);align-items:start;gap:8px}.control-rail{position:sticky;top:8px;display:grid;gap:8px;min-width:0}.control-stack,.content-rail{display:grid;gap:8px;min-width:0}.control-stack>*,.content-rail>.upload-panel,.content-rail>.results{min-width:0}.image-title{margin:0;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.image-tile-count{margin:2px 0 0;font-size:12px}.icon-only{width:40px;min-width:40px;min-height:40px;padding:5px}.compact-result-action{white-space:nowrap}@media(max-width:959px){.page{padding:8px 8px calc(82px + env(safe-area-inset-bottom));gap:8px}.workspace{grid-template-columns:minmax(0,1fr);gap:8px}.control-rail{position:static;order:1}.content-rail{order:2}.results-header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:8px;padding:10px}.results-header h3{margin:1px 0;font-size:17px}.results-overview>.muted{margin:3px 0;font-size:11px;line-height:1.35}.results-actions{align-items:flex-end;gap:4px}.auto-toggle{font-size:11px;white-space:nowrap}.auto-download-hint,.results-download{display:none}.result-collapse,.compact-result-action{width:40px;min-width:40px;min-height:40px;padding:5px}.result-collapse span,.compact-result-action span{display:none}.results-header .link-btn{margin-top:2px}.tiles-header{flex-direction:row;align-items:center}.results-actions{align-items:flex-start}.image-list{padding-bottom:76px}}@media(min-width:960px) and (max-width:1199px){.image-block{grid-template-columns:minmax(0,1fr)}.tiles-header{align-items:center}.tiles-actions{flex-wrap:wrap;justify-content:flex-end}}@media(min-width:960px){.content-rail>.upload-panel:not(.has-image){min-height:calc(100dvh - 270px)}
/* PC 端为浮动导出栏预留底部净空，滚动到底时最后一行内容不被遮挡。 */
.content-rail{padding-bottom:72px}}
</style>
