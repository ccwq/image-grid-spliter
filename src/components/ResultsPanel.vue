<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { LocaleMessages } from '../composables/useLocale'
import type { TileResult } from '../composables/useImageSlicer'

interface Props {
  tr: LocaleMessages
  tiles: TileResult[]
  previewUrl: string | null
  tilesHeading: string
  resultsSummary: string
  processing: boolean
  icons: Record<string, unknown>
}

const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'trigger-downloads'): void }>()
</script>

<template>
  <section v-if="props.previewUrl || props.tiles.length" class="panel results">
    <div class="results-grid">
      <div class="preview-card">
        <p class="eyebrow">
          <Icon :icon="props.icons.image" class="inline-icon" aria-hidden="true" />
          {{ props.tr.results.original }}
        </p>
        <div class="preview-box">
          <img v-if="props.previewUrl" :src="props.previewUrl" :alt="props.tr.results.original" />
          <p v-else class="muted">{{ props.tr.results.emptyUpload }}</p>
        </div>
      </div>
      <div class="tiles-card">
        <div class="tiles-header">
          <div>
            <p class="eyebrow">{{ props.tr.results.result }}</p>
            <h3>{{ props.tilesHeading }}</h3>
            <p class="muted">{{ props.resultsSummary }}</p>
          </div>
          <button class="ghost" type="button" :disabled="!props.tiles.length || props.processing" @click="emit('trigger-downloads')">
            <Icon :icon="props.icons.download" class="btn-icon" aria-hidden="true" />
            {{ props.tr.buttons.downloadAgain }}
          </button>
        </div>
        <div v-if="props.tiles.length" class="tiles-grid">
          <div v-for="tile in props.tiles" :key="tile.name" class="tile">
            <img :src="tile.previewUrl" :alt="tile.name" loading="lazy" />
            <p class="tile-name">{{ tile.name }}</p>
          </div>
        </div>
        <p v-else class="muted">{{ props.tr.results.previewPlaceholder }}</p>
      </div>
    </div>
  </section>
</template>
