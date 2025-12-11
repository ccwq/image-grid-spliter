<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { LocaleMessages } from '../composables/useLocale'

interface Props {
  tr: LocaleMessages
  icons: Record<string, unknown>
  dragOver: boolean
  hasImage: boolean
  baseName: string
  imageSize: { width: number; height: number } | null
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
  <section class="panel upload-panel">
    <div
      class="dropzone"
      :class="{ over: props.dragOver }"
      @click="emit('pick')"
      @dragover.prevent="emit('dragover', $event)"
      @dragleave="emit('dragleave')"
      @drop.prevent="emit('drop', $event)"
    >
      <slot name="file-input" />
      <div class="drop-content">
        <Icon :icon="props.icons.upload" class="drop-icon" aria-hidden="true" />
        <p class="drop-title">{{ props.tr.upload.title }}</p>
        <p class="muted">{{ props.tr.upload.subtitle }}</p>
        <div v-if="props.hasImage" class="current-file">
          <span class="chip">{{ props.tr.upload.currentPrefix }}{{ props.baseName }}</span>
          <span v-if="props.imageSize" class="chip">
            {{ props.tr.upload.sizePrefix }}{{ props.imageSize.width }} x {{ props.imageSize.height }}
          </span>
        </div>
      </div>
    </div>
    <p v-if="!props.isMobile" class="muted">{{ props.tr.upload.tip }}</p>
    <p v-if="props.errorText" class="error">{{ props.errorText }}</p>
  </section>
</template>
