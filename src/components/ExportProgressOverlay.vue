<script setup lang="ts">
import type { ExportProgress } from '../composables/useImageSlicer'
import type { LocaleMessages } from '../composables/useLocale'

const props = defineProps<{ progress: ExportProgress; tr: LocaleMessages; cancellable?: boolean }>()
const emit = defineEmits<{ (e: 'dismiss'): void; (e: 'cancel'): void; (e: 'retry-pending-downloads'): void }>()

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
// PC 端部分失败重试入口常驻于报告内。仅目录直写部分失败（pending > 0）时显示：
// 该条件与 pendingTraditionalDownloads 非空严格对应，生成中断报告（mode=generation）无待重试项，避免无效按钮。
const canRetryPending = () => props.progress.phase === 'report' && props.progress.report?.mode === 'directory' && props.progress.report.pending > 0
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
    <div v-if="canRetryPending()" class="progress-retry">
      <button class="progress-retry-btn" type="button" @click="emit('retry-pending-downloads')">{{ props.tr.results.retryTraditionalDownload }}</button>
    </div>
  </aside>
</template>

<style scoped>
.export-progress{position:fixed;top:10px;left:50%;z-index:30;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 12px;width:min(560px,calc(100vw - 24px));padding:9px 10px 8px 12px;border:1px solid var(--color-border-strong);border-radius:10px;background:var(--color-surface);color:var(--color-text-strong);box-shadow:0 10px 28px var(--color-shadow);transform:translateX(-50%)}.progress-copy{display:flex;min-width:0;align-items:center;gap:8px;font-size:12px}.progress-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.progress-count{margin-left:auto;color:var(--color-accent);font-variant-numeric:tabular-nums}.progress-meter{grid-column:1/-1;height:3px;overflow:hidden;border-radius:999px;background:var(--color-border)}.progress-meter span{display:block;height:100%;border-radius:inherit;background:var(--color-accent);transition:width .16s ease}.progress-actions{grid-column:2;grid-row:1;display:flex;gap:4px}.progress-close,.progress-cancel{height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--color-text-muted);cursor:pointer}.progress-close{width:22px;font-size:18px;line-height:1}.progress-cancel{padding:0 6px;font-size:11px}.progress-close:hover,.progress-close:focus-visible,.progress-cancel:hover,.progress-cancel:focus-visible{background:var(--color-accent-soft);color:var(--color-text-strong)}.export-progress.report{border-color:var(--color-border)}.export-progress.attention{border-color:var(--color-danger-border)}.export-progress.attention .progress-copy strong{color:var(--color-danger-strong)}.progress-retry{grid-column:1/-1;display:flex;justify-content:flex-start;padding-top:2px;border-top:1px solid var(--color-border-subtle)}.progress-retry-btn{min-height:26px;border-color:var(--color-accent);background:transparent;color:var(--color-accent);font-size:11px;font-weight:700}.progress-retry-btn:hover,.progress-retry-btn:focus-visible{background:var(--color-accent-soft);color:var(--color-text-strong)}@media(prefers-reduced-motion:reduce){.progress-meter span{transition:none}}@media(max-width:640px){.export-progress{top:6px;width:calc(100vw - 16px);padding:8px 8px 7px 10px}.progress-copy{font-size:11px}}
</style>
