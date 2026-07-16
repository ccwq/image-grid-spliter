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
  edgeEraseEnabled: boolean
  edgeErasePadding: number
  edgeEraseUnit: 'percent' | 'px'
  includeOuter: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'select-preset', preset: GridPreset): void
  (e: 'toggle-presets'): void
  (e: 'apply-custom-grid'): void
  (e: 'update:customRows', value: number): void
  (e: 'update:customCols', value: number): void
  (e: 'update:edge-erase-enabled', value: boolean): void
  (e: 'update:edge-erase-padding', value: number): void
  (e: 'update:edge-erase-unit', value: 'percent' | 'px'): void
  (e: 'update:include-outer', value: boolean): void
}>()
</script>

<template>
  <section class="panel grid-panel">
    <div class="grid-toolbar">
      <span class="field-label"><Icon :icon="props.icons.grid" class="inline-icon" aria-hidden="true" /> 网格</span>
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
    <div class="custom-grid" aria-label="自定义网格">
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
      <div class="custom-actions">
        <span class="custom-title">自定义网格</span>
        <button type="button" class="ghost" :disabled="props.processing" @click="emit('apply-custom-grid')">
          <Icon :icon="props.icons.check" class="btn-icon" aria-hidden="true" />
          {{ props.tr.grid.apply }}
        </button>
      </div>
    </div>
    <div class="edge-row" :class="{ disabled: !props.edgeEraseEnabled }">
      <label class="edge-switch"><input type="checkbox" :checked="props.edgeEraseEnabled" @change="emit('update:edge-erase-enabled', ($event.target as HTMLInputElement).checked)" />边线擦除</label>
      <div class="edge-controls">
        <template v-if="props.edgeEraseUnit === 'percent'">
          <button v-for="value in [1, 2, 3, 5]" :key="value" type="button" class="ghost" :class="{ active: props.edgeErasePadding === value }" :disabled="!props.edgeEraseEnabled" @click="emit('update:edge-erase-padding', value)">{{ value }}%</button>
        </template>
        <input :value="props.edgeErasePadding" type="number" min="0" step="0.1" :disabled="!props.edgeEraseEnabled" @input="emit('update:edge-erase-padding', Number(($event.target as HTMLInputElement).value))" />
        <button type="button" class="ghost" :disabled="!props.edgeEraseEnabled" @click="emit('update:edge-erase-unit', props.edgeEraseUnit === 'percent' ? 'px' : 'percent')">{{ props.edgeEraseUnit === 'percent' ? '%' : 'px' }}</button>
      </div>
      <label class="outer-toggle"><input type="checkbox" :checked="props.includeOuter" :disabled="!props.edgeEraseEnabled" @change="emit('update:include-outer', ($event.target as HTMLInputElement).checked)" />包含外边缘</label>
    </div>
  </section>
</template>

<style scoped>
.grid-toolbar{display:flex;align-items:center;gap:6px;margin-bottom:6px}.field-label{display:inline-flex;align-items:center;gap:4px;margin:0}.preset-toggle{margin-top:6px}.grid-panel .custom-grid{display:flex;flex-direction:row!important;align-items:center;justify-content:space-between;min-width:0;gap:10px;margin-top:6px;white-space:nowrap}.grid-panel .custom-fields{display:flex;flex:0 1 auto;flex-wrap:nowrap!important;min-width:0;gap:12px}.grid-panel .custom-fields label{display:flex;align-items:center;min-width:0;gap:4px;font-size:12px;font-weight:700}.grid-panel .custom-fields input{flex:0 1 48px;min-width:24px;width:48px;height:28px;padding:3px 6px}.custom-actions{display:flex;align-items:center;justify-content:flex-end;min-width:0;gap:6px}.custom-title{display:flex;align-items:center;height:32px;color:#8fd7ca;font-size:12px;font-weight:700}.custom-actions .ghost{min-width:0;height:28px;padding:3px 7px;font-size:12px}.edge-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid rgb(203 239 231 / .1)}.edge-controls,.edge-switch,.outer-toggle{display:flex;align-items:center;gap:6px}.edge-switch{font-size:13px;font-weight:700}.edge-row.disabled{opacity:.48}.edge-row .active{border-color:#47d7ba;background:rgb(71 215 186 / .14);color:#baffef}@media(max-width:640px){.grid-panel .custom-grid{gap:6px}.grid-panel .custom-fields{gap:6px}.grid-panel .custom-fields label{gap:3px;font-size:11px}.custom-title{font-size:11px}.custom-actions{gap:4px}.custom-actions .ghost{padding:3px 5px;font-size:11px}.edge-row{display:grid;grid-template-columns:98px minmax(0,1fr);grid-template-rows:repeat(2,28px);align-items:center;gap:3px 6px}.edge-switch{grid-column:1;grid-row:1;font-size:11px}.outer-toggle{grid-column:1;grid-row:2;font-size:11px}.edge-controls{grid-column:2;grid-row:1 / span 2;align-self:center;min-width:0;flex-wrap:nowrap;gap:3px}.edge-controls .ghost{min-width:0;height:26px;padding:2px 4px;font-size:11px}.edge-controls input{box-sizing:border-box;min-width:0;width:46px;height:26px;padding:2px 4px;font-size:11px}}
</style>
