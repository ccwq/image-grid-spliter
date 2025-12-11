import { computed, ref } from 'vue'
import type { ExportFormat } from './useLocale'

const STORAGE_KEYS = {
  format: 'igs:export-format',
  quality: 'igs:jpg-quality',
}

const DEFAULT_EXPORT_FORMAT: ExportFormat = 'jpg'
const DEFAULT_JPG_QUALITY = 80

const clampQuality = (value: number) => Math.min(100, Math.max(1, Math.round(value)))

export function useExportSettings() {
  const exportFormat = ref<ExportFormat>(DEFAULT_EXPORT_FORMAT)
  const jpgQualityPercent = ref(DEFAULT_JPG_QUALITY)

  const isJpgFormat = computed(() => exportFormat.value === 'jpg')
  const jpgQuality = computed(() => Math.min(100, Math.max(1, jpgQualityPercent.value)) / 100)
  const qualityLabel = computed(() => `${Math.round(Math.min(100, Math.max(1, jpgQualityPercent.value)))}%`)

  const persistPreferences = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.format, exportFormat.value)
      localStorage.setItem(STORAGE_KEYS.quality, String(clampQuality(jpgQualityPercent.value)))
    } catch {
      // ignore storage errors
    }
  }

  const restorePreferences = () => {
    try {
      const savedFormat = localStorage.getItem(STORAGE_KEYS.format)
      if (savedFormat === 'png' || savedFormat === 'jpg') {
        exportFormat.value = savedFormat
      }
      const savedQualityRaw = localStorage.getItem(STORAGE_KEYS.quality)
      const savedQuality = savedQualityRaw ? Number(savedQualityRaw) : NaN
      if (Number.isFinite(savedQuality)) {
        jpgQualityPercent.value = clampQuality(savedQuality)
      }
    } catch {
      // ignore read errors
    }
  }

  return {
    exportFormat,
    jpgQualityPercent,
    isJpgFormat,
    jpgQuality,
    qualityLabel,
    persistPreferences,
    restorePreferences,
    clampQuality,
  }
}
