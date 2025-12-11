<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { LocaleMessages } from '../composables/useLocale'

interface Props {
  tr: LocaleMessages
  icons: Record<string, unknown>
  exportFormat: string
  isJpgFormat: boolean
  qualityLabel: string
  jpgQualityPercent: number
  processing: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:exportFormat', value: string): void
  (e: 'update:jpgQualityPercent', value: number): void
}>()
</script>

<template>
  <section class="panel export-panel">
    <div class="panel-header">
      <div>
        <p class="eyebrow">{{ props.tr.export.eyebrow }}</p>
        <h2>{{ props.tr.export.title }}</h2>
        <p class="muted">{{ props.tr.export.subtitle }}</p>
      </div>
    </div>
    <div class="export-controls">
      <div class="export-field">
        <span class="field-label">{{ props.tr.export.formatLabel }}</span>
        <div class="format-radios" role="radiogroup" :aria-label="props.tr.export.formatLabel">
          <label class="radio-pill">
            <Icon :icon="props.icons.file" class="btn-icon" aria-hidden="true" />
            <input
              type="radio"
              value="jpg"
              :checked="props.exportFormat === 'jpg'"
              :disabled="props.processing"
              @change="emit('update:exportFormat', 'jpg')"
            />
            <span>JPG</span>
          </label>
          <label class="radio-pill">
            <Icon :icon="props.icons.image" class="btn-icon" aria-hidden="true" />
            <input
              type="radio"
              value="png"
              :checked="props.exportFormat === 'png'"
              :disabled="props.processing"
              @change="emit('update:exportFormat', 'png')"
            />
            <span>PNG</span>
          </label>
        </div>
      </div>
      <label class="export-field" :style="{ opacity: props.processing || !props.isJpgFormat ? 0.3 : 1 }">
        <span class="field-label">{{ props.tr.export.qualityLabel }}</span>
        <div class="quality-control">
          <input
            :value="props.jpgQualityPercent"
            type="range"
            min="40"
            max="100"
            step="5"
            :disabled="props.processing || !props.isJpgFormat"
            :aria-label="props.tr.export.qualityAria"
            @input="emit('update:jpgQualityPercent', Number(($event.target as HTMLInputElement).value))"
          />
          <span class="quality-text" :class="{ disabled: !props.isJpgFormat }">{{ props.qualityLabel }}</span>
        </div>
      </label>
    </div>
  </section>
</template>
