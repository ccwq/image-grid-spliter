<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { LocaleMessages } from '../composables/useLocale'
import type { ImageItem } from '../composables/useImageSlicer'

interface Props {
  tr: LocaleMessages
  images: ImageItem[]
  tilesHeading: string
  resultsSummary: string
  autoDownload: boolean
  processing: boolean
  icons: Record<string, unknown>
  collapsed: boolean
  pendingTraditionalDownloads: { written: number; pending: number } | null
  /** PC 端传 false：导出动作与重试移至浮动导出栏和常驻导出报告，头部保持纯结果呈现。移动端默认 true，保持既有内联行为。 */
  showInlineDownloadControls?: boolean
}

const props = withDefaults(defineProps<Props>(), { showInlineDownloadControls: true })
const emit = defineEmits<{
  (e: 'trigger-downloads'): void
  (e: 'toggle-auto-download', value: boolean): void
  (e: 'download-image', id: string): void
  (e: 'preview-tile', id: string): void
  (e: 'toggle-collapsed'): void
  (e: 'retry-pending-downloads'): void
  (e: 'remove-image', id: string): void
  (e: 'move-image', id: string, delta: -1 | 1): void
  (e: 'set-grid-override', id: string, override: { horizontalLines: number[]; verticalLines: number[] } | null): void
  (e: 'open-image-settings', id: string): void
  (e: 'trigger-clear-all'): void
}>()

/** 网格覆盖描述：有覆盖的图显示覆盖行列描述，无覆盖显示"跟随全局网格"。 */
const gridLabelFor = (image: ImageItem) => {
  const override = image.gridOverride
  if (!override) return props.tr.grid.perImageFollowsGlobal
  return props.tr.format.gridDescription(override.verticalLines.length + 1, override.horizontalLines.length + 1)
}
/** 文件大小角标文本：无字节数据（旧构造方）不渲染。 */
const sizeLabel = (bytes?: number) => typeof bytes === 'number' ? props.tr.format.fileSize(bytes) : ''
const firstIndex = (image: ImageItem) => props.images.findIndex((el) => el.id === image.id) === 0
const lastIndex = (image: ImageItem) => props.images.findIndex((el) => el.id === image.id) === props.images.length - 1
</script>

<template>
  <section v-if="props.images.length" class="panel results">
    <div class="results-header">
      <div class="results-overview">
        <p class="eyebrow">{{ props.tr.results.result }}</p>
        <h3>{{ props.tilesHeading }}</h3>
        <p class="muted">{{ props.resultsSummary }}</p>
        <p v-if="props.showInlineDownloadControls" class="muted">{{ props.tr.results.queueSummary(props.images.length) }}</p>
        <button class="link-btn result-collapse" type="button" :aria-label="props.collapsed ? props.tr.buttons.expandResults : props.tr.buttons.collapseResults" :title="props.collapsed ? props.tr.buttons.expandResults : props.tr.buttons.collapseResults" @click="emit('toggle-collapsed')"><Icon :icon="props.collapsed ? props.icons.chevronDown : props.icons.chevronUp" class="btn-icon" aria-hidden="true" /><span>{{ props.collapsed ? props.tr.buttons.expandResults : props.tr.buttons.collapseResults }}</span></button>
      </div>
      <div v-if="props.showInlineDownloadControls" class="results-actions">
        <label class="auto-toggle">
          <input
            type="checkbox"
            :checked="props.autoDownload"
            :disabled="props.processing"
            @change="emit('toggle-auto-download', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ props.tr.buttons.autoDownload }}</span>
        </label>
        <p class="muted small auto-download-hint">{{ props.tr.export.autoDownloadHint }}</p>
        <button class="ghost results-download" type="button" :disabled="props.processing" @click="emit('trigger-downloads')">
          <Icon :icon="props.icons.download" class="btn-icon" aria-hidden="true" />
          {{ props.tr.buttons.downloadAll }}
        </button>
        <!-- 清除所有第二入口（T05）：移动端摘要旁，confirm 由 App.vue 承担 -->
        <button class="ghost compact-result-action clear-all-action" type="button" :disabled="props.processing" @click="emit('trigger-clear-all')">
          <span>{{ props.tr.buttons.clearAll }}</span>
        </button>
        <div v-if="props.pendingTraditionalDownloads" class="export-retry">
          <p class="muted small">{{ props.tr.results.partialExport(props.pendingTraditionalDownloads.written, props.pendingTraditionalDownloads.pending) }}</p>
          <button class="ghost" type="button" :disabled="props.processing" @click="emit('retry-pending-downloads')">{{ props.tr.results.retryTraditionalDownload }}</button>
        </div>
      </div>
    </div>
    <div v-if="!props.collapsed" class="image-list">
      <div v-for="image in props.images" :key="image.id" class="image-block">
        <div class="preview-card">
          <p class="eyebrow">
            <Icon :icon="props.icons.image" class="inline-icon" aria-hidden="true" />
            {{ props.tr.results.original }}
          </p>
          <div class="preview-box">
            <!-- 原图文件大小角标：常显小字（T06），无字节数据时不渲染 -->
            <img :src="image.objectUrl" :alt="image.baseName" />
            <span v-if="sizeLabel(image.fileSizeBytes)" class="size-badge">{{ sizeLabel(image.fileSizeBytes) }}</span>
          </div>
          <p class="muted meta">{{ image.baseName }} · {{ image.size.width }} x {{ image.size.height }}</p>
          <!-- 每图网格描述（T04）：覆盖图显示覆盖行列，未覆盖显示跟随全局 -->
          <p class="muted meta">{{ gridLabelFor(image) }}</p>
        </div>
        <div class="tiles-card">
          <div class="tiles-header">
            <div>
              <p class="muted image-tile-count">{{ props.tr.format.tilesHeading(image.tiles.length) }}</p>
            </div>
            <div class="tiles-actions">
              <button class="ghost compact-result-action" type="button" :disabled="props.processing" :aria-label="props.tr.buttons.imageSettings" :title="props.tr.buttons.imageSettings" @click="emit('open-image-settings', image.id)">
                <Icon :icon="props.icons.sliders ?? ''" class="btn-icon" aria-hidden="true" />
                <span>{{ props.tr.buttons.imageSettings }}</span>
              </button>
              <button class="ghost compact-result-action" type="button" :disabled="props.processing" :aria-label="props.tr.buttons.downloadImage" :title="props.tr.buttons.downloadImage" @click="emit('download-image', image.id)">
                <Icon :icon="props.icons.download" class="btn-icon" aria-hidden="true" />
                <span>{{ props.tr.buttons.downloadImage }}</span>
              </button>
            </div>
          </div>
          <div class="queue-actions">
            <button class="ghost icon-only" type="button" :disabled="props.processing || firstIndex(image)" :aria-label="props.tr.buttons.moveImageUp" :title="props.tr.buttons.moveImageUp" @click="emit('move-image', image.id, -1)">
              <Icon :icon="props.icons.arrowUp ?? ''" class="btn-icon" aria-hidden="true" />
            </button>
            <button class="ghost icon-only" type="button" :disabled="props.processing || lastIndex(image)" :aria-label="props.tr.buttons.moveImageDown" :title="props.tr.buttons.moveImageDown" @click="emit('move-image', image.id, 1)">
              <Icon :icon="props.icons.arrowDown ?? ''" class="btn-icon" aria-hidden="true" />
            </button>
            <button class="ghost icon-only danger-action" type="button" :disabled="props.processing" :aria-label="props.tr.buttons.removeImage" :title="props.tr.buttons.removeImage" @click="emit('remove-image', image.id)">
              <Icon :icon="props.icons.trash ?? ''" class="btn-icon" aria-hidden="true" />
            </button>
          </div>
          <div v-if="image.tiles.length" class="tiles-grid">
            <div v-for="tile in image.tiles" :key="tile.id" class="tile" @click="emit('preview-tile', tile.id)">
              <!-- 切片文件大小角标：blob.size 实时反映格式/质量（T06） -->
              <img :src="tile.previewUrl" :alt="tile.name" loading="lazy" />
              <span class="size-badge">{{ props.tr.format.fileSize(tile.blob.size) }}</span>
            </div>
          </div>
          <p v-else class="muted">{{ props.tr.results.previewPlaceholder }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 原图/切片大小角标（T06）：叠加左下角、常显小字，紧凑风格。 */
.preview-box, .tile { position: relative; }
.size-badge { position: absolute; left: 6px; bottom: 6px; padding: 1px 6px; border-radius: 6px; background: var(--color-surface); border: 1px solid var(--color-border-subtle); color: var(--color-text-muted); font-size: 10px; font-variant-numeric: tabular-nums; pointer-events: none; }
/* 队列操作行：上移/下移/删除集中在卡片右上区域下方，间距紧凑。 */
.queue-actions { display: flex; gap: 4px; margin-top: 6px; }
.danger-action:hover { border-color: var(--color-danger); color: var(--color-danger); }
.clear-all-action:hover { border-color: var(--color-danger); color: var(--color-danger); }
/* 移动端保持 40px 触控目标。 */
@media(max-width:959px){ .queue-actions .icon-only { width: 40px; min-width: 40px; min-height: 40px; } }
</style>
