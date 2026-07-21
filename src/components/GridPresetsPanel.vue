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
  disabled?: boolean
  showPresets?: boolean
  showCustomGrid?: boolean
  showEdgeErase?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  showPresets: true,
  showCustomGrid: true,
  showEdgeErase: true,
})
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
    <div v-if="props.showPresets" class="grid-toolbar">
      <span class="field-label"><Icon :icon="props.icons.grid" class="inline-icon" aria-hidden="true" /> 网格</span>
    </div>
    <div v-if="props.showPresets" class="preset-grid" role="group" aria-label="网格预设">
      <button
        v-for="preset in props.visiblePresets"
        :key="preset.label"
        type="button"
        class="preset"
        :class="{ active: props.selectedPreset.cols === preset.cols && props.selectedPreset.rows === preset.rows }"
        :aria-pressed="props.selectedPreset.cols === preset.cols && props.selectedPreset.rows === preset.rows"
        :disabled="props.processing || props.disabled"
        @click="emit('select-preset', preset)"
      >
        <span class="preset-heading">
          <Icon :icon="props.icons.grid" class="btn-icon" aria-hidden="true" />
          <span class="preset-title">{{ preset.label }}</span>
        </span>
        <!-- <span class="preset-sub">{{ props.tr.format.presetSub(preset.cols, preset.rows) }}</span> -->
      </button>
    </div>
    <div v-if="props.showPresets && props.showPresetToggle" class="preset-toggle">
      <button class="ghost" type="button" :disabled="props.disabled" @click="emit('toggle-presets')">
        <Icon :icon="props.presetExpanded ? props.icons.chevronUp : props.icons.chevronDown" class="btn-icon" aria-hidden="true" />
        {{ props.presetExpanded ? props.tr.buttons.collapsePresets : props.tr.buttons.expandPresets }}
      </button>
    </div>
    <div v-if="props.showCustomGrid" class="custom-grid" aria-label="自定义网格">
      <div class="custom-fields">
        <label>
          {{ props.tr.grid.columns }}
          <input
            :value="props.customCols"
            type="number"
            min="1"
            inputmode="numeric"
            :disabled="props.processing || props.disabled"
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
            :disabled="props.processing || props.disabled"
            @input="emit('update:customRows', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>
      <div class="custom-actions">
        <span class="custom-title">自定义网格</span>
        <button type="button" class="ghost" :disabled="props.processing || props.disabled" @click="emit('apply-custom-grid')">
          <Icon :icon="props.icons.check" class="btn-icon" aria-hidden="true" />
          {{ props.tr.grid.apply }}
        </button>
      </div>
    </div>
    <div v-if="props.showEdgeErase" class="edge-row" :class="{ disabled: !props.edgeEraseEnabled || props.disabled }">
      <label class="edge-switch"><input type="checkbox" :checked="props.edgeEraseEnabled" :disabled="props.processing || props.disabled" @change="emit('update:edge-erase-enabled', ($event.target as HTMLInputElement).checked)" />边线擦除</label>
      <div class="edge-controls">
        <template v-if="props.edgeEraseUnit === 'percent'">
          <button v-for="value in [1, 2, 3, 5]" :key="value" type="button" class="ghost" :class="{ active: props.edgeEraseEnabled && props.edgeErasePadding === value }" :aria-pressed="props.edgeEraseEnabled && props.edgeErasePadding === value" :disabled="props.processing || props.disabled || !props.edgeEraseEnabled" @click="emit('update:edge-erase-padding', value)">{{ value }}%</button>
        </template>
        <input :value="props.edgeErasePadding" type="number" min="0" step="0.1" :disabled="props.processing || props.disabled || !props.edgeEraseEnabled" @input="emit('update:edge-erase-padding', Number(($event.target as HTMLInputElement).value))" />
        <button type="button" class="ghost" :disabled="props.processing || props.disabled || !props.edgeEraseEnabled" :aria-label="props.tr.buttons.toggleEdgeUnit" :title="props.tr.buttons.toggleEdgeUnit" @click="emit('update:edge-erase-unit', props.edgeEraseUnit === 'percent' ? 'px' : 'percent')">{{ props.edgeEraseUnit === 'percent' ? '%' : 'px' }}</button>
      </div>
      <label class="outer-toggle"><input type="checkbox" :checked="props.includeOuter" :disabled="props.processing || props.disabled || !props.edgeEraseEnabled" @change="emit('update:include-outer', ($event.target as HTMLInputElement).checked)" />包含外边缘</label>
    </div>
  </section>
</template>

<style scoped>
.grid-toolbar{display:flex;align-items:center;gap:6px;margin-bottom:6px}.field-label{display:inline-flex;align-items:center;gap:4px;margin:0}.preset-toggle{margin-top:6px}.grid-panel .custom-grid{display:flex;flex-direction:row!important;align-items:center;justify-content:space-between;min-width:0;gap:10px;margin-top:6px;white-space:nowrap}.grid-panel .custom-fields{display:flex;flex:0 1 auto;flex-wrap:nowrap!important;min-width:0;gap:12px}.grid-panel .custom-fields label{display:flex;align-items:center;min-width:0;gap:4px;font-size:12px;font-weight:700}.grid-panel .custom-fields input{flex:0 1 48px;min-width:24px;width:48px;height:28px;padding:3px 6px}.custom-actions{display:flex;align-items:center;justify-content:flex-end;min-width:0;gap:6px}.custom-title{display:flex;align-items:center;height:32px;color:#8fd7ca;font-size:12px;font-weight:700}.custom-actions .ghost{min-width:0;height:28px;padding:3px 7px;font-size:12px}.edge-row{display:grid;grid-template-columns:98px minmax(0,1fr);grid-template-rows:repeat(2,18px);align-items:center;gap:3px 6px;margin-top:8px;padding-top:8px;border-top:1px solid rgb(203 239 231 / .1)}.edge-controls,.edge-switch,.outer-toggle{display:flex;align-items:center;gap:6px}.edge-switch{grid-column:1;grid-row:1;font-size:11px;font-weight:700}.outer-toggle{grid-column:1;grid-row:2;font-size:11px}.edge-controls{grid-column:2;grid-row:1 / span 2;align-self:center;min-width:0;flex-wrap:nowrap;gap:3px}.edge-controls .ghost{min-width:0;height:26px;padding:2px 4px;font-size:11px}.edge-controls input{box-sizing:border-box;min-width:0;width:46px;height:26px;padding:2px 4px;font-size:11px}.edge-row.disabled .edge-controls,.edge-row.disabled .outer-toggle{opacity:.48}.edge-row .active{border-color:#47d7ba;background:rgb(71 215 186 / .14);color:#baffef}.edge-row .active:disabled{border-color:rgb(203 239 231 / .18);background:transparent;color:#a9c1be}@media(max-width:959px){.preset-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.preset{min-height:40px}}@media(max-width:640px){.grid-panel .custom-grid{gap:6px}.grid-panel .custom-fields{gap:6px}.grid-panel .custom-fields label{gap:3px;font-size:11px}.custom-title{font-size:11px}.custom-actions{gap:4px}.custom-actions .ghost{padding:3px 5px;font-size:11px}.edge-row{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto;gap:6px;margin-top:8px}.edge-switch,.outer-toggle,.edge-controls{grid-column:1}.edge-switch{grid-row:1}.outer-toggle{grid-row:2}.edge-controls{grid-row:3;flex-wrap:wrap;gap:5px}.edge-controls .ghost,.edge-controls input{height:40px;min-height:40px}.edge-controls .ghost{min-width:40px;padding:4px 7px}.edge-controls input{width:48px}.edge-row.disabled .edge-controls,.edge-row.disabled .outer-toggle{opacity:.6}}
</style>
