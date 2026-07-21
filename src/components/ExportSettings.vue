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
  directorySupported: boolean
  directoryReady: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:exportFormat', value: string): void
  (e: 'update:jpgQualityPercent', value: number): void
  (e: 'change-directory'): void
}>()
</script>

<template>
  <section class="panel export-panel">
    <div class="export-controls" aria-label="导出设置">
      <span class="export-summary">导出：{{ props.exportFormat.toUpperCase() }}</span>
      <div class="export-field export-format-field">
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
      <label class="export-field export-quality-field" :style="{ opacity: props.processing || !props.isJpgFormat ? 0.3 : 1 }">
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
      <div class="directory-export" :class="{ ready: props.directoryReady }">
        <template v-if="props.directorySupported">
          <span class="directory-hint">{{ props.directoryReady ? props.tr.export.directoryReady : props.tr.export.directoryAvailable }}</span>
          <button class="ghost directory-button" type="button" :disabled="props.processing" :aria-label="props.tr.export.changeDirectory" :title="props.tr.export.changeDirectory" @click="emit('change-directory')"><Icon :icon="props.icons.folder" class="btn-icon" aria-hidden="true" /><span>{{ props.tr.export.changeDirectory }}</span></button>
        </template>
        <span v-else class="directory-hint">{{ props.tr.export.directoryFallback }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.export-controls{display:flex;align-items:center;flex-wrap:wrap;min-width:0;gap:6px}.export-summary{flex:0 0 auto;color:#dff4ee;font-size:12px;font-weight:700}.export-field{display:flex;align-items:center;min-width:0;gap:5px}.export-format-field{flex:0 0 auto}.format-radios{display:flex;flex-wrap:nowrap;gap:5px}.radio-pill{display:flex;min-height:30px;align-items:center;gap:3px;padding:3px 6px;border:1px solid rgb(203 239 231 / .18);border-radius:8px;color:#a9c1be;font-size:12px;cursor:pointer}.radio-pill:has(input:checked){border-color:#47d7ba;background:rgb(71 215 186 / .14);color:#baffef}.radio-pill:has(input:disabled){opacity:.55;cursor:not-allowed}.radio-pill .btn-icon{width:13px;height:13px}.export-quality-field{flex:1 1 150px}.export-quality-field .field-label{font-size:12px}.quality-control{display:flex;align-items:center;flex:1 1 0;min-width:0;gap:4px}.quality-control input{flex:1 1 0;min-width:46px}.quality-text{font-size:12px;font-weight:700}.directory-export{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0}.directory-hint{color:#a9c1be;font-size:11px;line-height:1.3}.directory-export.ready .directory-hint{color:#8fd7ca}.directory-button{flex:0 0 auto;font-size:11px;white-space:nowrap}@media(max-width:640px){.export-controls{gap:4px}.export-summary,.radio-pill,.export-quality-field .field-label,.quality-text{font-size:11px}.radio-pill .btn-icon{display:none}.format-radios{gap:3px}.export-quality-field{gap:3px}.quality-control{gap:3px}.directory-export{align-items:center;flex-direction:row;gap:6px}.directory-button{width:40px;min-width:40px;min-height:40px;padding:5px}.directory-button span{display:none}}
</style>
