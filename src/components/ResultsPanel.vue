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
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'trigger-downloads'): void
  (e: 'toggle-auto-download', value: boolean): void
  (e: 'download-image', id: string): void
}>()
</script>

<template>
  <section v-if="props.images.length" class="panel results">
    <div class="results-header">
      <div>
        <p class="eyebrow">{{ props.tr.results.result }}</p>
        <h3>{{ props.tilesHeading }}</h3>
        <p class="muted">{{ props.resultsSummary }}</p>
        <p class="muted">{{ props.tr.results.queueSummary(props.images.length) }}</p>
      </div>
      <div class="results-actions">
        <label class="auto-toggle">
          <input
            type="checkbox"
            :checked="props.autoDownload"
            :disabled="props.processing"
            @change="emit('toggle-auto-download', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ props.tr.buttons.autoDownload }}</span>
        </label>
        <p class="muted small">{{ props.tr.export.autoDownloadHint }}</p>
        <button class="ghost" type="button" :disabled="props.processing" @click="emit('trigger-downloads')">
          <Icon :icon="props.icons.download" class="btn-icon" aria-hidden="true" />
          {{ props.tr.buttons.downloadAll }}
        </button>
      </div>
    </div>
    <div class="image-list">
      <div v-for="image in props.images" :key="image.id" class="image-block">
        <div class="preview-card">
          <p class="eyebrow">
            <Icon :icon="props.icons.image" class="inline-icon" aria-hidden="true" />
            {{ props.tr.results.original }}
          </p>
          <div class="preview-box">
            <img :src="image.objectUrl" :alt="image.baseName" />
          </div>
          <p class="muted meta">{{ image.baseName }} · {{ image.size.width }} x {{ image.size.height }}</p>
        </div>
        <div class="tiles-card">
          <div class="tiles-header">
            <div>
              <p class="eyebrow">{{ props.tr.results.result }}</p>
              <h3>{{ props.tr.format.tilesHeading(image.tiles.length) }}</h3>
            </div>
            <button class="ghost" type="button" :disabled="props.processing" @click="emit('download-image', image.id)">
              <Icon :icon="props.icons.download" class="btn-icon" aria-hidden="true" />
              {{ props.tr.buttons.downloadImage }}
            </button>
          </div>
          <div v-if="image.tiles.length" class="tiles-grid">
            <div v-for="tile in image.tiles" :key="tile.name" class="tile">
              <img :src="tile.previewUrl" :alt="tile.name" loading="lazy" />
              <p class="tile-name">{{ tile.name }}</p>
            </div>
          </div>
          <p v-else class="muted">{{ props.tr.results.previewPlaceholder }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
