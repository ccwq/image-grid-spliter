<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { LocaleMessages } from '../composables/useLocale'

interface Props {
  tr: LocaleMessages
  icons: Record<string, unknown>
  gridDescription: string
  tileCount: number
  imageSizeLabel: string
  exportFormat: string
  qualityLabel: string
  isJpgFormat: boolean
  statusText: string
  processing: boolean
  hasTiles: boolean
  hasImage: boolean
  isMobile: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'choose-file'): void
  (e: 'trigger-downloads'): void
  (e: 'reset'): void
}>()
</script>

<template>
  <header class="hero" :class="{ compact: props.hasImage }">
    <div class="hero-text">
      <p class="eyebrow">
        <Icon :icon="props.icons.grid" class="inline-icon" aria-hidden="true" />
        {{ props.tr.meta.eyebrow }}
      </p>
      <h1>
        <Icon :icon="props.icons.info" class="title-icon" aria-hidden="true" />
        {{ props.tr.meta.title }}
      </h1>
      <p class="subhead">{{ props.tr.meta.description }}</p>
      <div class="actions">
        <button class="choose-image" type="button" :disabled="props.processing" @click="emit('choose-file')">
          <Icon :icon="props.icons.imagePlus" class="btn-icon" aria-hidden="true" />
          <span>{{ props.processing ? props.tr.buttons.processing : props.tr.buttons.chooseImage }}</span>
        </button>
        <button v-if="props.hasTiles" class="ghost hero-icon-action" type="button" :disabled="props.processing" :aria-label="props.tr.buttons.reDownload" :title="props.tr.buttons.reDownload" @click="emit('trigger-downloads')">
          <Icon :icon="props.icons.redo" class="btn-icon" aria-hidden="true" />
          <span>{{ props.tr.buttons.reDownload }}</span>
        </button>
        <button v-if="props.hasImage || props.hasTiles" class="ghost danger hero-icon-action" type="button" :aria-label="props.tr.buttons.clear" :title="props.tr.buttons.clear" @click.stop="emit('reset')">
          <Icon :icon="props.icons.trash" class="btn-icon" aria-hidden="true" />
          <span>{{ props.tr.buttons.clear }}</span>
        </button>
      </div>
      <p v-if="!props.isMobile" class="hint">
        <Icon :icon="props.icons.download" class="inline-icon" aria-hidden="true" />
        {{ props.tr.meta.hint }}
      </p>
    </div>
    <div v-if="!props.isMobile" class="hero-card">
      <div class="stat-row">
        <span class="label">
          <Icon :icon="props.icons.grid" class="stat-icon" aria-hidden="true" />
          {{ props.tr.stats.currentGrid }}
        </span>
        <span class="value">{{ props.gridDescription }}</span>
      </div>
      <div class="stat-row">
        <span class="label">
          <Icon :icon="props.icons.download" class="stat-icon" aria-hidden="true" />
          {{ props.tr.stats.tileCount }}
        </span>
        <span class="value">{{ props.tileCount }}</span>
      </div>
      <div class="stat-row">
        <span class="label">
          <Icon :icon="props.icons.image" class="stat-icon" aria-hidden="true" />
          {{ props.tr.stats.imageSize }}
        </span>
        <span class="value">{{ props.imageSizeLabel }}</span>
      </div>
      <div class="stat-row">
        <span class="label">{{ props.tr.stats.exportFormat }}</span>
        <span class="value">
          {{ props.exportFormat.toUpperCase() }}<template v-if="props.isJpgFormat"> · {{ props.qualityLabel }}</template>
        </span>
      </div>
      <div class="stat-row">
        <span class="label">{{ props.tr.stats.downloadStatus }}</span>
        <span class="value">{{ props.statusText }}</span>
      </div>
    </div>
  </header>
</template>

<style scoped>
@media (max-width: 959px) {
  .hero.compact .hero-icon-action { width:32px; min-width:32px; padding:5px; }
  .hero.compact .hero-icon-action span { display:none; }
}
</style>
