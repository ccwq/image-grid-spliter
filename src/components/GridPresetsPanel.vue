<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { GridPreset } from '../utils/grid'
import type { LocaleMessages } from '../composables/useLocale'

interface Props {
  tr: LocaleMessages
  presets: GridPreset[]
  visiblePresets: GridPreset[]
  selectedPreset: GridPreset
  showPresetToggle: boolean
  presetExpanded: boolean
  customRows: number
  customCols: number
  processing: boolean
  isMobile: boolean
  icons: Record<string, unknown>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'select-preset', preset: GridPreset): void
  (e: 'toggle-presets'): void
  (e: 'apply-custom-grid'): void
  (e: 'update:customRows', value: number): void
  (e: 'update:customCols', value: number): void
}>()
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <p class="eyebrow">
          <Icon :icon="props.icons.grid" class="inline-icon" aria-hidden="true" />
          {{ props.tr.grid.eyebrow }}
        </p>
        <h2>{{ props.tr.grid.title }}</h2>
        <p class="muted">{{ props.tr.grid.subtitle }}</p>
      </div>
    </div>
    <div class="preset-grid">
      <button
        v-for="preset in props.visiblePresets"
        :key="preset.label"
        type="button"
        class="preset"
        :class="{ active: props.selectedPreset.cols === preset.cols && props.selectedPreset.rows === preset.rows }"
        :disabled="props.processing"
        @click="emit('select-preset', preset)"
      >
        <span class="preset-heading">
          <Icon :icon="props.icons.grid" class="btn-icon" aria-hidden="true" />
          <span class="preset-title">{{ preset.label }}</span>
        </span>
        <!-- <span class="preset-sub">{{ props.tr.format.presetSub(preset.cols, preset.rows) }}</span> -->
      </button>
    </div>
    <div v-if="props.showPresetToggle" class="preset-toggle">
      <button class="ghost" type="button" @click="emit('toggle-presets')">
        <Icon :icon="props.presetExpanded ? props.icons.chevronUp : props.icons.chevronDown" class="btn-icon" aria-hidden="true" />
        {{ props.presetExpanded ? props.tr.buttons.collapsePresets : props.tr.buttons.expandPresets }}
      </button>
    </div>
    <div v-if="!props.isMobile || props.presetExpanded" class="custom-grid">
      <div class="custom-fields">
        <label>
          {{ props.tr.grid.columns }}
          <input
            :value="props.customCols"
            type="number"
            min="1"
            inputmode="numeric"
            @input="emit('update:customCols', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <label>
          {{ props.tr.grid.rows }}
          <input
            :value="props.customRows"
            type="number"
            min="1"
            inputmode="numeric"
            @input="emit('update:customRows', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>
      <button type="button" class="ghost" :disabled="props.processing" @click="emit('apply-custom-grid')">
        <Icon :icon="props.icons.check" class="btn-icon" aria-hidden="true" />
        {{ props.tr.grid.apply }}
      </button>
    </div>
  </section>
</template>
