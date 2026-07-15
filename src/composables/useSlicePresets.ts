import { computed, ref, type Ref } from 'vue'
import type { SlicePlan } from '../utils/grid'

/** 可迁移的裁切方案；由 grid 模块定义，预设层只负责保存和校验。 */
export type { SlicePlan } from '../utils/grid'

export interface StoredPreset {
  id: string
  name: string
  plan: SlicePlan
  createdAt: string
  updatedAt: string
}

export type PresetConflictAction = 'overwrite' | 'rename' | 'skip'

export interface PresetConflict {
  incoming: StoredPreset
  existing: StoredPreset
}

export interface ImportResult {
  ok: boolean
  imported: StoredPreset[]
  overwritten: StoredPreset[]
  renamed: StoredPreset[]
  skipped: StoredPreset[]
  conflicts: PresetConflict[]
  error?: string
}

export interface SlicePresetDocument {
  format: 'image-grid-spliter/slice-presets'
  version: 1
  presets: StoredPreset[]
}

export interface UseSlicePresetsOptions {
  storage?: Storage | null
  storageKey?: string
  now?: () => Date
  idFactory?: () => string
}

const DEFAULT_STORAGE_KEY = 'image-grid-spliter.slice-presets.v1'
const DOCUMENT_FORMAT = 'image-grid-spliter/slice-presets' as const
const DOCUMENT_VERSION = 1 as const

function clonePlan(plan: SlicePlan): SlicePlan {
  return {
    ...plan,
    horizontalLines: [...plan.horizontalLines],
    verticalLines: [...plan.verticalLines],
  }
}

function clonePreset(preset: StoredPreset): StoredPreset {
  return { ...preset, plan: clonePlan(preset.plan) }
}

function getSafeStorage(storage: Storage | null | undefined): Storage | null {
  if (storage !== undefined) return storage
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function makeId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`
  } catch {
    return `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function isNormalizedLines(lines: unknown): lines is number[] {
  return Array.isArray(lines) && lines.every((line, index) =>
    typeof line === 'number' && Number.isFinite(line) && line > 0 && line < 1 && (index === 0 || line > lines[index - 1]),
  )
}

/** 将不可信 JSON 限制为当前版本可安全执行的裁切方案。 */
export function isSlicePlan(value: unknown): value is SlicePlan {
  if (!value || typeof value !== 'object') return false
  const plan = value as Partial<SlicePlan>
  return isNormalizedLines(plan.horizontalLines)
    && isNormalizedLines(plan.verticalLines)
    && typeof plan.padding === 'number'
    && Number.isFinite(plan.padding)
    && plan.padding >= 0
    && (plan.paddingUnit === 'percent' || plan.paddingUnit === 'px')
    && typeof plan.trimOuterEdges === 'boolean'
}

export function isStoredPreset(value: unknown): value is StoredPreset {
  if (!value || typeof value !== 'object') return false
  const preset = value as Partial<StoredPreset>
  return typeof preset.id === 'string' && preset.id.length > 0
    && typeof preset.name === 'string' && preset.name.trim().length > 0
    && typeof preset.createdAt === 'string' && !Number.isNaN(Date.parse(preset.createdAt))
    && typeof preset.updatedAt === 'string' && !Number.isNaN(Date.parse(preset.updatedAt))
    && isSlicePlan(preset.plan)
}

/** 解析单个/全部导出共用的版本化文档，不会修改预设库。 */
export function parseSlicePresetDocument(source: string | unknown): SlicePresetDocument | null {
  let value: unknown = source
  if (typeof source === 'string') {
    try {
      value = JSON.parse(source)
    } catch {
      return null
    }
  }

  if (!value || typeof value !== 'object') return null
  const document = value as Partial<SlicePresetDocument>
  if (document.format !== DOCUMENT_FORMAT || document.version !== DOCUMENT_VERSION || !Array.isArray(document.presets)) {
    return null
  }
  if (!document.presets.every(isStoredPreset)) return null
  return {
    format: DOCUMENT_FORMAT,
    version: DOCUMENT_VERSION,
    presets: document.presets.map(clonePreset),
  }
}

export function createSlicePresetDocument(presets: StoredPreset[]): SlicePresetDocument {
  return { format: DOCUMENT_FORMAT, version: DOCUMENT_VERSION, presets: presets.map(clonePreset) }
}

function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase()
}

function uniqueName(baseName: string, existing: StoredPreset[]): string {
  const usedNames = new Set(existing.map((preset) => nameKey(preset.name)))
  if (!usedNames.has(nameKey(baseName))) return baseName
  let suffix = 2
  while (usedNames.has(nameKey(`${baseName} (${suffix})`))) suffix += 1
  return `${baseName} (${suffix})`
}

function emptyImportResult(error?: string): ImportResult {
  return { ok: !error, imported: [], overwritten: [], renamed: [], skipped: [], conflicts: [], error }
}

/**
 * 预设库：只在用户显式保存/导入时写入 localStorage；storage 不可用时保留内存态。
 */
export function useSlicePresets(options: UseSlicePresetsOptions = {}) {
  const storage = getSafeStorage(options.storage)
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY
  const now = options.now ?? (() => new Date())
  const idFactory = options.idFactory ?? makeId
  const lastError = ref<string | null>(null)

  const readInitialPresets = (): StoredPreset[] => {
    if (!storage) return []
    try {
      const raw = storage.getItem(storageKey)
      if (!raw) return []
      const document = parseSlicePresetDocument(raw)
      if (!document) {
        lastError.value = '本地预设数据无效，已忽略。'
        return []
      }
      return document.presets
    } catch {
      lastError.value = '无法读取本地预设，当前会话将使用内存保存。'
      return []
    }
  }

  const presets = ref<StoredPreset[]>(readInitialPresets()) as Ref<StoredPreset[]>
  const hasStorage = computed(() => storage !== null)

  const persist = (): boolean => {
    if (!storage) return false
    try {
      storage.setItem(storageKey, JSON.stringify(createSlicePresetDocument(presets.value)))
      lastError.value = null
      return true
    } catch {
      lastError.value = '无法写入本地预设，当前更改仅在本次会话有效。'
      return false
    }
  }

  const savePreset = (name: string, plan: SlicePlan) => {
    const normalizedName = name.trim()
    if (!normalizedName) return { ok: false as const, reason: 'invalid-name' as const }
    if (!isSlicePlan(plan)) return { ok: false as const, reason: 'invalid-plan' as const }
    if (presets.value.some((preset) => nameKey(preset.name) === nameKey(normalizedName))) {
      return { ok: false as const, reason: 'duplicate-name' as const }
    }
    const timestamp = now().toISOString()
    const preset: StoredPreset = {
      id: idFactory(), name: normalizedName, plan: clonePlan(plan), createdAt: timestamp, updatedAt: timestamp,
    }
    presets.value = [...presets.value, preset]
    persist()
    return { ok: true as const, preset: clonePreset(preset) }
  }

  const updatePreset = (id: string, changes: Pick<StoredPreset, 'name' | 'plan'>) => {
    const index = presets.value.findIndex((preset) => preset.id === id)
    if (index < 0) return { ok: false as const, reason: 'not-found' as const }
    const name = changes.name.trim()
    if (!name) return { ok: false as const, reason: 'invalid-name' as const }
    if (!isSlicePlan(changes.plan)) return { ok: false as const, reason: 'invalid-plan' as const }
    if (presets.value.some((preset, presetIndex) => presetIndex !== index && nameKey(preset.name) === nameKey(name))) {
      return { ok: false as const, reason: 'duplicate-name' as const }
    }
    const updated: StoredPreset = {
      ...presets.value[index], name, plan: clonePlan(changes.plan), updatedAt: now().toISOString(),
    }
    presets.value = presets.value.map((preset, presetIndex) => presetIndex === index ? updated : preset)
    persist()
    return { ok: true as const, preset: clonePreset(updated) }
  }

  const removePreset = (id: string): boolean => {
    const next = presets.value.filter((preset) => preset.id !== id)
    if (next.length === presets.value.length) return false
    presets.value = next
    persist()
    return true
  }

  const exportPreset = (id: string): string | null => {
    const preset = presets.value.find((item) => item.id === id)
    return preset ? JSON.stringify(createSlicePresetDocument([preset]), null, 2) : null
  }
  const exportAllPresets = (): string => JSON.stringify(createSlicePresetDocument(presets.value), null, 2)

  /**
   * 导入已通过解析的预设。resolver 由 UI 对每个同名项询问用户后提供策略。
   * 任何 JSON 解析失败均不会写入或改动现有预设。
   */
  const importPresets = (
    source: string | unknown,
    resolver: (conflict: PresetConflict) => PresetConflictAction = () => 'skip',
  ): ImportResult => {
    const document = parseSlicePresetDocument(source)
    if (!document) return emptyImportResult('导入文件不是受支持的预设 JSON。')

    const result = emptyImportResult()
    const next = presets.value.map(clonePreset)
    for (const rawPreset of document.presets) {
      const incoming = clonePreset(rawPreset)
      const conflictIndex = next.findIndex((preset) => nameKey(preset.name) === nameKey(incoming.name))
      if (conflictIndex < 0) {
        if (next.some((preset) => preset.id === incoming.id)) incoming.id = idFactory()
        next.push(incoming)
        result.imported.push(clonePreset(incoming))
        continue
      }

      const conflict = { incoming: clonePreset(incoming), existing: clonePreset(next[conflictIndex]) }
      result.conflicts.push(conflict)
      const action = resolver(conflict)
      if (action === 'overwrite') {
        // 保留本地 id，避免 UI 当前选中的预设引用失效。
        const replaced = { ...incoming, id: next[conflictIndex].id, createdAt: next[conflictIndex].createdAt }
        next[conflictIndex] = replaced
        result.overwritten.push(clonePreset(replaced))
      } else if (action === 'rename') {
        incoming.name = uniqueName(incoming.name, next)
        if (next.some((preset) => preset.id === incoming.id)) incoming.id = idFactory()
        next.push(incoming)
        result.renamed.push(clonePreset(incoming))
      } else {
        result.skipped.push(clonePreset(incoming))
      }
    }
    presets.value = next
    persist()
    return result
  }

  return {
    presets,
    hasStorage,
    lastError,
    savePreset,
    updatePreset,
    removePreset,
    exportPreset,
    exportAllPresets,
    importPresets,
  }
}
