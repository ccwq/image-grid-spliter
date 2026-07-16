<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { LocaleMessages } from '../composables/useLocale'

interface Props {
  tr: LocaleMessages
  icons: Record<string, unknown>
  dragOver: boolean
  hasImage: boolean
  firstBaseName: string
  firstImageSize: { width: number; height: number } | null
  queueSummary: string
  errorText: string
  isMobile: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'drop', event: DragEvent): void
  (e: 'dragover', event: DragEvent): void
  (e: 'dragleave'): void
  (e: 'file-change', event: Event): void
  (e: 'pick'): void
}>()
</script>

<template>
  <section class="panel upload-panel" :class="{ 'has-image': props.hasImage }">
    <div
      class="dropzone"
      :class="{ over: props.dragOver }"
      @click="emit('pick')"
      @dragover.prevent="emit('dragover', $event)"
      @dragleave="emit('dragleave')"
      @drop.prevent="emit('drop', $event)"
    >
      <slot name="file-input" />
      <div class="drop-content" :class="{ 'drop-content--compact': props.hasImage }">
        <Icon :icon="props.icons.upload" class="drop-icon" aria-hidden="true" />
        <div class="drop-copy">
          <p class="drop-title">{{ props.tr.upload.title }}</p>
          <p v-if="!props.hasImage" class="muted">{{ props.tr.upload.subtitle }}</p>
        </div>
        <div v-if="props.hasImage" class="current-file">
          <span class="chip">{{ props.queueSummary }}</span>
          <span class="chip">{{ props.tr.upload.currentPrefix }}{{ props.firstBaseName }}</span>
          <span v-if="props.firstImageSize" class="chip">
            {{ props.tr.upload.sizePrefix }}{{ props.firstImageSize.width }} x {{ props.firstImageSize.height }}
          </span>
        </div>
      </div>
    </div>
    <p v-if="!props.isMobile" class="muted">{{ props.tr.upload.tip }}</p>
    <p v-if="props.errorText" class="error">{{ props.errorText }}</p>
  </section>
</template>

<style scoped>
.drop-content { display: grid; justify-items: center; gap: 6px; }
.drop-icon { width: 22px; height: 22px; color: #baffef; }
.drop-title,.drop-copy .muted { margin: 0; }
.drop-title { font-weight: 700; }
.current-file { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; }
.chip { display: inline-flex; max-width: min(100%, 360px); align-items: center; min-height: 25px; overflow: hidden; padding: 3px 7px; border: 1px solid rgb(143 215 202 / .22); border-radius: 999px; background: rgb(143 215 202 / .08); color: #cbe2dc; font-size: 12px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }

.has-image .dropzone { padding: 8px 10px; border-style: dashed; }
.drop-content--compact { grid-template-columns: auto minmax(0, 1fr) minmax(0, auto); align-items: center; justify-items: stretch; gap: 9px; text-align: left; }
.drop-content--compact .drop-icon { width: 18px; height: 18px; align-self: center; }
.drop-content--compact .drop-copy { min-width: 0; }
.drop-content--compact .drop-title { font-size: 13px; }
.drop-content--compact .current-file { justify-content: flex-end; min-width: 0; }

@media (max-width: 620px) {
  .drop-content--compact { grid-template-columns: auto minmax(0, 1fr); }
  .drop-content--compact .current-file { grid-column: 1 / -1; justify-content: flex-start; }
}
</style>
