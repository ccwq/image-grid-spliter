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
      <span class="field-label"><Icon :icon="props.icons.grid" class="inline-icon" aria-hidden="true" /> {{ props.tr.grid.eyebrow }}</span>
    </div>
    <div v-if="props.showPresets" class="preset-grid" role="group" :aria-label="props.tr.grid.eyebrow">
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
    <div v-if="props.showCustomGrid" class="custom-grid" :aria-label="props.tr.buttons.useCustom">
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
        <span class="custom-title">{{ props.tr.buttons.useCustom }}</span>
        <button type="button" class="ghost" :disabled="props.processing || props.disabled" @click="emit('apply-custom-grid')">
          <Icon :icon="props.icons.check" class="btn-icon" aria-hidden="true" />
          {{ props.tr.grid.apply }}
        </button>
      </div>
    </div>
    <div v-if="props.showEdgeErase" class="edge-row" :class="{ disabled: !props.edgeEraseEnabled || props.disabled }">
      <label class="edge-switch"><input type="checkbox" :checked="props.edgeEraseEnabled" :disabled="props.processing || props.disabled" @change="emit('update:edge-erase-enabled', ($event.target as HTMLInputElement).checked)" />{{ props.tr.grid.edgeErase }}</label>
      <div class="edge-controls">
        <template v-if="props.edgeEraseUnit === 'percent'">
          <button v-for="value in [1, 2, 3, 5]" :key="value" type="button" class="ghost" :class="{ active: props.edgeEraseEnabled && props.edgeErasePadding === value }" :aria-pressed="props.edgeEraseEnabled && props.edgeErasePadding === value" :disabled="props.processing || props.disabled || !props.edgeEraseEnabled" @click="emit('update:edge-erase-padding', value)">{{ value }}%</button>
        </template>
        <input :value="props.edgeErasePadding" type="number" min="0" step="0.1" :disabled="props.processing || props.disabled || !props.edgeEraseEnabled" @input="emit('update:edge-erase-padding', Number(($event.target as HTMLInputElement).value))" />
        <button type="button" class="ghost" :disabled="props.processing || props.disabled || !props.edgeEraseEnabled" :aria-label="props.tr.buttons.toggleEdgeUnit" :title="props.tr.buttons.toggleEdgeUnit" @click="emit('update:edge-erase-unit', props.edgeEraseUnit === 'percent' ? 'px' : 'percent')">{{ props.edgeEraseUnit === 'percent' ? '%' : 'px' }}</button>
      </div>
      <label class="outer-toggle"><input type="checkbox" :checked="props.includeOuter" :disabled="props.processing || props.disabled || !props.edgeEraseEnabled" @change="emit('update:include-outer', ($event.target as HTMLInputElement).checked)" />{{ props.tr.grid.includeOuter }}</label>
    </div>
  </section>
</template>

<style scoped>
.preset-heading { display: grid; grid-template-columns: 14px auto; align-items: center; column-gap: 4px; min-width: 0; height: 16px; line-height: 16px; }
.preset-heading .btn-icon { display: block; width: 14px; height: 14px; }
.preset-title { display: block; line-height: 16px; }
.grid-toolbar{display:flex;align-items:center;gap:5px;margin-bottom:4px}.field-label{display:inline-flex;align-items:center;gap:4px;margin:0}.preset-toggle{margin-top:4px}.grid-panel .custom-grid{display:flex;flex-direction:row!important;align-items:center;justify-content:space-between;min-width:0;gap:8px;margin-top:4px;white-space:nowrap}.grid-panel .custom-fields{display:flex;flex:0 1 auto;flex-wrap:nowrap!important;min-width:0;gap:8px}.grid-panel .custom-fields label{display:flex;align-items:center;min-width:0;gap:3px;font-size:11px;font-weight:700}.grid-panel .custom-fields input{flex:0 1 44px;min-width:24px;width:44px;height:26px;padding:2px 5px}.custom-actions{display:flex;align-items:center;justify-content:flex-end;min-width:0;gap:5px}.custom-title{display:flex;align-items:center;height:28px;color:var(--color-accent);font-size:11px;font-weight:700}.custom-actions .ghost{min-width:0;height:26px;padding:2px 6px;font-size:11px}.edge-row{display:grid;grid-template-columns:92px minmax(0,1fr);grid-template-rows:repeat(2,17px);align-items:center;gap:2px 5px;margin-top:6px;padding-top:6px;border-top:1px solid var(--color-border-subtle)}.edge-controls,.edge-switch,.outer-toggle{display:flex;align-items:center;gap:5px}.edge-switch{grid-column:1;grid-row:1;font-size:10px;font-weight:700}.outer-toggle{grid-column:1;grid-row:2;font-size:10px}.edge-controls{grid-column:2;grid-row:1 / span 2;align-self:center;min-width:0;flex-wrap:nowrap;gap:2px}.edge-controls .ghost{min-width:0;height:24px;padding:1px 4px;font-size:10px}.edge-controls input{box-sizing:border-box;min-width:0;width:42px;height:24px;padding:1px 4px;font-size:10px}.edge-row.disabled .edge-controls,.edge-row.disabled .outer-toggle{opacity:.48}.edge-row .active{border-color:var(--color-accent-selected);background:var(--color-accent-selected);color:var(--color-accent-selected-text)}.edge-row .active:hover{border-color:var(--color-accent-selected-hover);background:var(--color-accent-selected-hover)}.edge-row .active:disabled{border-color:var(--color-border-strong);background:transparent;color:var(--color-text-muted)}@media(max-width:959px){.preset-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.preset{min-height:30px}}@media(max-width:640px){.grid-panel .custom-grid{gap:5px}.grid-panel .custom-fields{gap:5px}.grid-panel .custom-fields label{gap:2px;font-size:10px}.custom-title{font-size:10px}.custom-actions{gap:3px}.custom-actions .ghost{padding:2px 4px;font-size:10px}.edge-row{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto;gap:4px;margin-top:6px}.edge-switch,.outer-toggle,.edge-controls{grid-column:1}.edge-switch{grid-row:1}.outer-toggle{grid-row:2}.edge-controls{grid-row:3;flex-wrap:wrap;gap:3px}.edge-controls .ghost,.edge-controls input{height:28px;min-height:28px}.edge-controls .ghost{min-width:28px;padding:2px 5px}.edge-controls input{width:44px}.edge-row.disabled .edge-controls,.edge-row.disabled .outer-toggle{opacity:.6}}
@media(max-width:959px){.preset{min-height:40px}.grid-panel .custom-fields input,.custom-actions .ghost{min-height:40px;height:40px}.custom-title{height:40px}.edge-switch,.outer-toggle{min-height:40px}.edge-controls .ghost,.edge-controls input{min-height:40px;height:40px}}
</style>
