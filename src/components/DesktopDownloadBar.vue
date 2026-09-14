<script setup lang="ts">
// PC（>= 960px）专用浮动导出栏：常规内容恰好为队列数量、自动下载开关与视觉主“下载全部”按钮。
// 重试、报告等反馈不在此栏，全部位于常驻导出报告（ExportProgressOverlay）。
import { Icon } from '@iconify/vue'
import type { LocaleMessages } from '../composables/useLocale'

interface Props {
  tr: LocaleMessages
  icons: Record<string, unknown>
  queueCount: number
  autoDownload: boolean
  processing: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'toggle-auto-download', value: boolean): void
  (e: 'trigger-downloads'): void
}>()
</script>

<template>
  <aside class="desktop-download-bar" aria-label="导出操作">
    <!-- aligner 复刻 #app（max-width:1200px 居中）的水平几何，再以 padding 复刻 #app(20px)+.page(10px) 的内边距。 -->
    <div class="download-bar-aligner">
      <div class="download-bar-row">
        <p class="download-bar-queue">{{ props.tr.results.queueSummary(props.queueCount) }}</p>
        <label class="download-bar-auto">
          <input
            type="checkbox"
            :checked="props.autoDownload"
            :disabled="props.processing"
            :aria-label="props.tr.export.autoDownloadLabel"
            @change="emit('toggle-auto-download', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ props.tr.buttons.autoDownload }}</span>
        </label>
        <button class="download-bar-all" type="button" :disabled="props.processing" @click="emit('trigger-downloads')">
          <Icon :icon="props.icons.download" class="btn-icon" aria-hidden="true" />
          <span>{{ props.tr.buttons.downloadAll }}</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* 对齐推导（全部 border-box）：页面布局链为 #app(max-width:1200px, 左右 padding 20px, 居中) > .page(max-width:1400px, padding:10px) > .workspace(grid: minmax(410px,440px) + 8px gap + 1fr)。
   .content-rail 右缘距“aligner 盒”（复刻 #app 盒）右缘 20+10=30px，左缘（左列起点）距 aligner 盒左缘 20+10+440+8=478px。
   视口 < 1200px 时 #app 占满视口，两套推导的 30px/478px 完全一致，因此任意视口下与 .content-rail 精确重合，滚动条变化不偏移。
   若调整 .page / .workspace 的断点几何，需同步更新 30px / 478px / 1200px 三个常量。 */
.desktop-download-bar { position: fixed; inset: auto 0 0 0; z-index: 35; display: none; padding: 0; pointer-events: none; }
.download-bar-aligner { max-width: 1200px; margin: 0 auto; padding: 0 30px 14px 478px; }
.download-bar-row { display: flex; align-items: center; gap: 12px; padding: 9px 10px 9px 12px; border: 1px solid rgb(143 215 202 / .42); border-radius: 12px; background: #152129; box-shadow: 0 12px 28px rgb(0 0 0 / .3); pointer-events: auto; }
.download-bar-queue { flex: 1; min-width: 0; margin: 0; overflow: hidden; color: #a9c1be; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
.download-bar-auto { display: inline-flex; flex-shrink: 0; align-items: center; gap: 6px; color: #dff4ee; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.download-bar-auto input { width: 15px; height: 15px; margin: 0; }
.download-bar-all { min-height: 40px; padding: 8px 16px; border-color: #47d7ba; background: #47d7ba; color: #09201f; font-size: 13px; font-weight: 800; }
.download-bar-all:hover { border-color: #5fe3c9; background: #5fe3c9; color: #09201f; }
.download-bar-all:disabled { border-color: rgb(203 239 231 / .18); background: #25343a; color: #7e9693; }
/* 仅 PC 渲染：< 960px 一律隐藏，App.vue 侧另有 v-if=!isMobile 双重门控。 */
@media (min-width: 960px) { .desktop-download-bar { display: block; } }
</style>
