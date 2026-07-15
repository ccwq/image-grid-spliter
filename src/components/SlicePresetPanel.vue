<script setup lang="ts">
import { ref } from 'vue'
import type { PaddingUnit } from './SliceEditor.vue'

export interface SlicePresetConfig {
  horizontalLines: number[]
  verticalLines: number[]
  padding: number
  paddingUnit: PaddingUnit
  includeOuter: boolean
}

export interface SlicePreset extends SlicePresetConfig {
  id: string
  name: string
  version: 1
  updatedAt: string
}

interface Props {
  presets: SlicePreset[]
  selectedPresetId?: string | null
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  selectedPresetId: null,
  disabled: false,
})

const emit = defineEmits<{
  (e: 'save', name: string): void
  (e: 'apply', preset: SlicePreset): void
  (e: 'delete', preset: SlicePreset): void
  (e: 'export-one', preset: SlicePreset): void
  (e: 'export-all'): void
  (e: 'copy-one', preset: SlicePreset): void
  (e: 'copy-all'): void
  (e: 'import-file', file: File): void
  (e: 'import-clipboard', text: string): void
}>()

const name = ref('')
const clipboardText = ref('')

function save() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  emit('save', trimmed)
  name.value = ''
}

function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('import-file', file)
  ;(event.target as HTMLInputElement).value = ''
}

function importClipboard() {
  const text = clipboardText.value.trim()
  if (text) emit('import-clipboard', text)
}
</script>

<template>
  <section class="preset-panel panel" aria-labelledby="preset-manager-title">
    <div class="panel-header">
      <div>
        <p class="eyebrow">方案管理</p>
        <h2 id="preset-manager-title">裁切预设</h2>
        <p class="muted">预设只保存在本机浏览器，不含原始图片。</p>
      </div>
    </div>

    <form class="save-form" @submit.prevent="save">
      <label for="slice-preset-name">保存当前方案</label>
      <div class="form-row">
        <input id="slice-preset-name" v-model="name" :disabled="props.disabled" maxlength="80" placeholder="例如：Instagram 九宫格" required />
        <button type="submit" :disabled="props.disabled || !name.trim()">保存预设</button>
      </div>
    </form>

    <ul v-if="props.presets.length" class="preset-list" aria-label="已保存的裁切预设">
      <li v-for="preset in props.presets" :key="preset.id" :class="{ selected: preset.id === props.selectedPresetId }">
        <div>
          <strong>{{ preset.name }}</strong>
          <small>{{ preset.horizontalLines.length + 1 }} 行 × {{ preset.verticalLines.length + 1 }} 列 · {{ preset.padding }}{{ preset.paddingUnit === 'percent' ? '%' : 'px' }}</small>
        </div>
        <div class="preset-actions">
          <button type="button" class="ghost" :disabled="props.disabled" @click="emit('apply', preset)">应用</button>
          <button type="button" class="ghost" :disabled="props.disabled" @click="emit('export-one', preset)">导出</button>
          <button type="button" class="ghost" :disabled="props.disabled" @click="emit('copy-one', preset)">复制</button>
          <button type="button" class="ghost danger" :disabled="props.disabled" @click="emit('delete', preset)">删除</button>
        </div>
      </li>
    </ul>
    <p v-else class="empty">还没有保存预设。</p>

    <div class="transfer-tools">
      <button type="button" class="ghost" :disabled="props.disabled || !props.presets.length" @click="emit('export-all')">导出全部 JSON</button>
      <button type="button" class="ghost" :disabled="props.disabled || !props.presets.length" @click="emit('copy-all')">复制全部 JSON</button>
      <label class="file-input ghost" :class="{ disabled: props.disabled }">
        导入 JSON 文件
        <input type="file" accept="application/json,.json" :disabled="props.disabled" @change="importFile" />
      </label>
    </div>
    <div class="clipboard-import">
      <label for="preset-clipboard">从剪贴板导入 JSON</label>
      <textarea id="preset-clipboard" v-model="clipboardText" :disabled="props.disabled" rows="3" placeholder="粘贴导出的 JSON 文本" />
      <button type="button" class="ghost" :disabled="props.disabled || !clipboardText.trim()" @click="importClipboard">导入剪贴板内容</button>
    </div>
  </section>
</template>

<style scoped>
.save-form, .clipboard-import { display: grid; gap: .5rem; margin-top: 1rem; } .form-row, .transfer-tools, .preset-actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
.form-row input { flex: 1 1 13rem; } .preset-list { list-style: none; margin: 1rem 0; padding: 0; display: grid; gap: .65rem; }
.preset-list li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; padding: .75rem; border: 1px solid var(--border-color, #d0d5dd); border-radius: .65rem; }
.preset-list li.selected { border-color: #2563eb; box-shadow: 0 0 0 1px #2563eb; } small { display: block; margin-top: .25rem; color: #667085; }
.empty { color: #667085; } .file-input { display: inline-flex; align-items: center; cursor: pointer; } .file-input input { position: absolute; inline-size: 1px; block-size: 1px; opacity: 0; }
.file-input.disabled { opacity: .5; cursor: not-allowed; } .danger { color: #b42318; } textarea { width: 100%; resize: vertical; }
@media (max-width: 540px) { .preset-actions { width: 100%; } .preset-actions > button { flex: 1 1 28%; } }
</style>
