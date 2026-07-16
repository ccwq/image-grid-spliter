<script setup lang="ts">
import type { ExportProgress } from '../composables/useImageSlicer'
import type { LocaleMessages } from '../composables/useLocale'

const props = defineProps<{ progress: ExportProgress; tr: LocaleMessages; cancellable?: boolean }>()
const emit = defineEmits<{ (e: 'dismiss'): void; (e: 'cancel'): void }>()

const labelFor = () => {
  const { phase, current, total, report } = props.progress
  if (phase === 'generating') return props.tr.progress.generating(current, total)
  if (phase === 'saving') return props.tr.progress.saving(current, total)
  if (phase === 'downloading') return props.tr.progress.downloading(current, total)
  if (!report) return ''
  if (report.mode === 'directory') return props.tr.progress.directoryReport(report.completed, report.total, report.renamed, report.pending)
  if (report.mode === 'traditional') return props.tr.progress.traditionalReport(report.completed, report.total)
  return props.tr.progress.generationReport(report.completed, report.total, report.pending)
}

const percent = () => props.progress.total ? Math.min(100, Math.round((props.progress.current / props.progress.total) * 100)) : 0
</script>

<template>
  <aside v-if="props.progress.phase !== 'hidden'" class="export-progress" :class="{ report: props.progress.phase === 'report', attention: props.progress.report?.pending }" role="status" aria-live="polite">
    <div class="progress-copy">
      <strong>{{ labelFor() }}</strong>
      <span v-if="props.progress.phase !== 'report'" class="progress-count">{{ percent() }}%</span>
    </div>
    <div v-if="props.progress.phase !== 'report'" class="progress-meter" aria-hidden="true">
      <span :style="{ width: `${percent()}%` }" />
    </div>
    <div class="progress-actions"><button v-if="props.cancellable && props.progress.phase === 'generating'" class="progress-cancel" type="button" @click="emit('cancel')">{{ props.tr.progress.cancel }}</button><button class="progress-close" type="button" :aria-label="props.tr.progress.close" @click="emit('dismiss')">×</button></div>
  </aside>
</template>

<style scoped>
.export-progress{position:fixed;top:10px;left:50%;z-index:30;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 12px;width:min(560px,calc(100vw - 24px));padding:9px 10px 8px 12px;border:1px solid rgb(143 215 202 / .42);border-radius:10px;background:#11242b;color:#e7fbf6;box-shadow:0 10px 28px rgb(0 0 0 / .28);transform:translateX(-50%)}.progress-copy{display:flex;min-width:0;align-items:center;gap:8px;font-size:12px}.progress-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.progress-count{margin-left:auto;color:#8fd7ca;font-variant-numeric:tabular-nums}.progress-meter{grid-column:1/-1;height:3px;overflow:hidden;border-radius:999px;background:rgb(203 239 231 / .15)}.progress-meter span{display:block;height:100%;border-radius:inherit;background:#47d7ba;transition:width .16s ease}.progress-actions{grid-column:2;grid-row:1;display:flex;gap:4px}.progress-close,.progress-cancel{height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:#a9c1be;cursor:pointer}.progress-close{width:22px;font-size:18px;line-height:1}.progress-cancel{padding:0 6px;font-size:11px}.progress-close:hover,.progress-close:focus-visible,.progress-cancel:hover,.progress-cancel:focus-visible{background:rgb(143 215 202 / .13);color:#e7fbf6}.export-progress.report{border-color:rgb(143 215 202 / .28)}.export-progress.attention{border-color:rgb(255 183 172 / .58)}.export-progress.attention .progress-copy strong{color:#ffd1ca}@media(prefers-reduced-motion:reduce){.progress-meter span{transition:none}}@media(max-width:640px){.export-progress{top:6px;width:calc(100vw - 16px);padding:8px 8px 7px 10px}.progress-copy{font-size:11px}}
</style>
