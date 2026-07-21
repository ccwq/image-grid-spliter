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
      :title="props.hasImage ? props.tr.buttons.addImages : props.tr.upload.title"
      @click="emit('pick')"
      @dragover.prevent="emit('dragover', $event)"
      @dragleave="emit('dragleave')"
      @drop.prevent="emit('drop', $event)"
    >
      <slot name="file-input" />
      <div v-if="!props.hasImage" class="drop-content">
        <Icon :icon="props.icons.upload" class="drop-icon" aria-hidden="true" />
        <div class="drop-copy">
          <p class="drop-title">{{ props.tr.upload.title }}</p>
          <p class="muted">{{ props.tr.upload.subtitle }}</p>
        </div>
      </div>
      <div v-else class="upload-status">
        <Icon :icon="props.icons.image" class="drop-icon" aria-hidden="true" />
        <div class="upload-status-copy">
          <strong :title="props.firstBaseName">{{ props.firstBaseName }}</strong>
          <span v-if="props.firstImageSize">{{ props.firstImageSize.width }} × {{ props.firstImageSize.height }} · {{ props.queueSummary }}</span>
        </div>
        <button class="icon-only upload-add" type="button" :aria-label="props.tr.buttons.addImages" :title="props.tr.buttons.addImages" @click.stop="emit('pick')">
          <Icon :icon="props.icons.imagePlus" class="btn-icon" aria-hidden="true" />
        </button>
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
.has-image .dropzone { padding: 8px 10px; border-style: dashed; }
.upload-status { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:8px; min-width:0; }
.upload-status .drop-icon { width:18px; height:18px; }.upload-status-copy { display:grid; min-width:0; gap:1px; }.upload-status-copy strong,.upload-status-copy span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.upload-status-copy strong { font-size:13px; }.upload-status-copy span { color:#a9c1be; font-size:11px; }.upload-add { flex:0 0 auto; }

@media (max-width: 620px) {
  .upload-status-copy span { font-size:10px; }
}
</style>
