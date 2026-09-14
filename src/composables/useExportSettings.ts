import { computed, ref, watch } from 'vue'
import type { ExportFormat } from './useLocale'

/**
 * 导出格式与 JPG 质量偏好深模块（兼容红线见 openspec Decision 7）：
 * - localStorage 键保持 `igs:export-format` / `igs:jpg-quality` 原名与取值语义，不迁移不重命名；
 * - 工厂函数内同步水合一次（旧版页面写入的键在新版本直接生效）；
 * - 变更经 update 动作或直接 ref 赋值都会自动持久化——队列中无图片也照常写入；
 * - 读写全程 try/catch：存储不可用时以默认值继续运行，静默降级为内存态。
 */

const STORAGE_KEYS = {
  format: 'igs:export-format',
  quality: 'igs:jpg-quality',
} as const

const DEFAULT_EXPORT_FORMAT: ExportFormat = 'jpg'
const DEFAULT_JPG_QUALITY = 80

/** 将任意输入收敛为 1-100 的整数百分比；非法输入返回 null（由调用方决定保留现值）。 */
export const sanitizeQuality = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.min(100, Math.max(1, Math.round(numeric)))
}

export interface ExportSettingsOptions {
  /** 注入存储（测试可传内存实现）；传 null 禁用持久化；缺省回退 window.localStorage。 */
  storage?: Storage | null
  /** 创建时同步水合一次（默认 true），调用方随后注册的生成 watcher 看到的已是恢复值。 */
  autoRestore?: boolean
}

/** 解析注入存储：显式传入优先；缺省时安全读取 window.localStorage（隐私模式可能抛异常）。 */
const resolveStorage = (storage?: Storage | null): Storage | null => {
  if (storage !== undefined) return storage
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function useExportSettings({ storage: injectedStorage, autoRestore = true }: ExportSettingsOptions = {}) {
  const storage = resolveStorage(injectedStorage)

  const exportFormat = ref<ExportFormat>(DEFAULT_EXPORT_FORMAT)
  const jpgQualityPercent = ref(DEFAULT_JPG_QUALITY)

  const isJpgFormat = computed(() => exportFormat.value === 'jpg')
  const jpgQuality = computed(() => Math.min(100, Math.max(1, jpgQualityPercent.value)) / 100)
  const qualityLabel = computed(() => `${Math.round(Math.min(100, Math.max(1, jpgQualityPercent.value)))}%`)

  /** 写入双键；存储缺失或抛错时静默降级为内存态（返回 false 供测试断言）。 */
  const persistPreferences = (): boolean => {
    if (!storage) return false
    try {
      const quality = sanitizeQuality(jpgQualityPercent.value)
      if (quality === null) return false
      storage.setItem(STORAGE_KEYS.format, exportFormat.value)
      storage.setItem(STORAGE_KEYS.quality, String(quality))
      return true
    } catch {
      return false
    }
  }

  /** 从双键读取既有偏好；单键非法只丢弃该键，另一键照常恢复；任何异常保持当前值。 */
  const restorePreferences = (): boolean => {
    if (!storage) return false
    let restored = false
    try {
      const savedFormat = storage.getItem(STORAGE_KEYS.format)
      if (savedFormat === 'png' || savedFormat === 'jpg') {
        exportFormat.value = savedFormat
        restored = true
      }
    } catch {
      // 读取格式键失败：格式保持默认，继续尝试质量键
    }
    try {
      const savedQualityRaw = storage.getItem(STORAGE_KEYS.quality)
      if (savedQualityRaw !== null) {
        const savedQuality = sanitizeQuality(savedQualityRaw)
        if (savedQuality !== null) {
          jpgQualityPercent.value = savedQuality
          restored = true
        }
      }
    } catch {
      // 读取质量键失败：质量保持默认
    }
    return restored
  }

  if (autoRestore) restorePreferences()

  // 任何稳定值变化（含队列无图片时）都立即持久化，刷新后恢复最新值。
  watch([exportFormat, jpgQualityPercent], () => {
    persistPreferences()
  })

  /** 显式更新格式动作：非法值不改动状态，合法值同步持久化（不依赖 watcher 的异步 flush）。 */
  const updateExportFormat = (format: ExportFormat): boolean => {
    if (format !== 'png' && format !== 'jpg') return false
    exportFormat.value = format
    persistPreferences()
    return true
  }

  /** 显式更新质量动作：非法/超界输入被钳制或拒绝，合法值同步持久化。 */
  const updateJpgQuality = (value: number): boolean => {
    const sanitized = sanitizeQuality(value)
    if (sanitized === null) return false
    jpgQualityPercent.value = sanitized
    persistPreferences()
    return true
  }

  return {
    exportFormat,
    jpgQualityPercent,
    isJpgFormat,
    jpgQuality,
    qualityLabel,
    persistPreferences,
    restorePreferences,
    clampQuality: sanitizeQuality,
    updateExportFormat,
    updateJpgQuality,
  }
}
