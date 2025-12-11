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
  <header class="hero">
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
        <button type="button" :disabled="props.processing" @click="emit('choose-file')">
          <Icon :icon="props.icons.imagePlus" class="btn-icon" aria-hidden="true" />
          {{ props.processing ? props.tr.buttons.processing : props.tr.buttons.chooseImage }}
        </button>
        <button class="ghost" type="button" :disabled="!props.hasTiles || props.processing" @click="emit('trigger-downloads')">
          <Icon :icon="props.icons.redo" class="btn-icon" aria-hidden="true" />
          {{ props.tr.buttons.reDownload }}
        </button>
        <button class="ghost danger" type="button" :disabled="!props.hasImage && !props.hasTiles" @click.stop="emit('reset')">
          <Icon :icon="props.icons.trash" class="btn-icon" aria-hidden="true" />
          {{ props.tr.buttons.clear }}
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
