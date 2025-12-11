import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { GridPreset } from '../utils/grid'
import { gridPresets } from '../utils/grid'
import type { LocaleMessages } from './useLocale'

interface GridSettingsOptions {
  isMobile: Ref<boolean>
  messages: ComputedRef<LocaleMessages>
}

export function useGridSettings({ isMobile, messages }: GridSettingsOptions) {
  const defaultPreset =
    gridPresets.find((preset) => preset.cols === 2 && preset.rows === 2) ??
    gridPresets[0] ??
    ({ cols: 2, rows: 2, label: '2 x 2' } as GridPreset)

  const selectedPreset = ref<GridPreset>(defaultPreset)
  const customRows = ref(defaultPreset.rows)
  const customCols = ref(defaultPreset.cols)
  const presetExpanded = ref(true)

  const gridDescription = computed(() =>
    messages.value.format.gridDescription(selectedPreset.value.cols, selectedPreset.value.rows),
  )
  const tileCount = computed(() => selectedPreset.value.cols * selectedPreset.value.rows)
  const presetSubtitle = (cols: number, rows: number) => messages.value.format.presetSub(cols, rows)

  const visiblePresets = computed(() =>
    isMobile.value && !presetExpanded.value ? gridPresets.slice(0, 4) : gridPresets,
  )
  const showPresetToggle = computed(() => isMobile.value && gridPresets.length > 4)

  const applyCustomGrid = () => {
    const rows = Number(customRows.value)
    const cols = Number(customCols.value)
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
      return { ok: false }
    }
    selectedPreset.value = { rows, cols, label: `${cols} x ${rows} (custom)` }
    return { ok: true }
  }

  const togglePresetExpanded = () => {
    presetExpanded.value = !presetExpanded.value
  }

  return {
    defaultPreset,
    selectedPreset,
    customRows,
    customCols,
    gridDescription,
    tileCount,
    visiblePresets,
    showPresetToggle,
    presetExpanded,
    presetSubtitle,
    applyCustomGrid,
    togglePresetExpanded,
  }
}
