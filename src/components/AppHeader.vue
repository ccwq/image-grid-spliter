<script setup lang="ts">
import { Icon, type IconifyIcon } from '@iconify/vue'
import type { LocaleMessages, Locale } from '../composables/useLocale'
import type { ColorScheme } from '../composables/useColorScheme'

interface Props {
  tr: LocaleMessages
  icons: Record<string, IconifyIcon | undefined>
  locale: Locale
  supportedLocales: { value: Locale; label: string }[]
  appVersion: string
  githubUrl: string
  /** 当前外观（亮/暗）：决定主题切换按钮展示“切到亮色”还是“切到暗色”的图标。 */
  colorScheme: ColorScheme
  /** 状态条：当前网格描述（如 “3 列 x 5 行”）。 */
  gridDescription: string
  /** 状态条：按当前网格可生成的切片数量。 */
  tileCount: number
  /** 状态条：图片/队列信息（张数 + 首张尺寸，或“未加载”）。 */
  imageInfo: string
  /** 状态条：导出格式（png | jpg）；压缩质量仅 JPG 时展示。 */
  exportFormat: string
  qualityLabel: string
  isJpgFormat: boolean
  /** 状态条：实时状态文案（等待/生成中/完成/下载触发等）。 */
  statusText: string
  hasTiles: boolean
  hasImage: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'localeChange', locale: Locale): void
  (e: 'toggleColorScheme'): void
  (e: 'trigger-downloads'): void
  (e: 'reset'): void
}>()

const onLocaleChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  const next = target.value as Locale
  if (next === 'en' || next === 'zh-CN') {
    emit('localeChange', next)
  }
}
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <div class="logo-mark">
        <img src="/igs.svg" alt="Image Grid Spliter logo" />
      </div>
      <div class="brand-text">
        <span class="brand-title">{{ props.tr.meta.title }}</span>
        <span class="brand-version">v{{ props.appVersion }}</span>
      </div>
    </div>
    <p class="status-summary" :aria-label="`${props.tr.stats.currentGrid} ${props.gridDescription}，${props.tr.stats.tileCount} ${props.tileCount}，${props.tr.stats.imageSize} ${props.imageInfo}，${props.tr.stats.exportFormat} ${props.exportFormat.toUpperCase()}，${props.tr.stats.downloadStatus} ${props.statusText}`">
      <span class="summary-item" :title="`${props.tr.stats.currentGrid} ${props.gridDescription}`">{{ props.gridDescription }}</span>
      <span class="summary-sep" aria-hidden="true">·</span>
      <span class="summary-item" :title="`${props.tr.stats.tileCount} ${props.tileCount}`">{{ props.tileCount }} {{ props.tr.stats.tileCount === '切片数量' ? '片' : 'tiles' }}</span>
      <span class="summary-sep" aria-hidden="true">·</span>
      <span class="summary-item summary-item-image" :title="`${props.tr.stats.imageSize} ${props.imageInfo}`">{{ props.imageInfo }}</span>
      <span class="summary-sep" aria-hidden="true">·</span>
      <span class="summary-item" :title="`${props.tr.stats.exportFormat} ${props.exportFormat.toUpperCase()}${props.isJpgFormat ? ` · ${props.qualityLabel}` : ''}`">{{ props.exportFormat.toUpperCase() }}<template v-if="props.isJpgFormat"> · {{ props.qualityLabel }}</template></span>
      <span class="summary-sep" aria-hidden="true">·</span>
      <!-- 仅瞬时状态文案对外可感知更新：静态信息对读屏用户属于噪音。 -->
      <span class="summary-item summary-item-status" aria-live="polite" :title="`${props.tr.stats.downloadStatus} ${props.statusText}`">{{ props.statusText }}</span>
    </p>
    <div class="header-actions">
      <button v-if="props.hasTiles" class="ghost header-action" type="button" :aria-label="props.tr.buttons.reDownload" :title="props.tr.buttons.reDownload" @click="emit('trigger-downloads')">
        <Icon :icon="props.icons.redo ?? ''" class="btn-icon" aria-hidden="true" />
        <span>{{ props.tr.buttons.reDownload }}</span>
      </button>
      <button v-if="props.hasImage || props.hasTiles" class="ghost danger header-action" type="button" :aria-label="props.tr.buttons.clear" :title="props.tr.buttons.clear" @click.stop="emit('reset')">
        <Icon :icon="props.icons.trash ?? ''" class="btn-icon" aria-hidden="true" />
        <span>{{ props.tr.buttons.clear }}</span>
      </button>
      <div class="lang-switcher">
        <Icon :icon="props.icons.flag ?? ''" class="lang-icon" aria-hidden="true" />
        <select :aria-label="props.tr.aria.language" :value="props.locale" @change="onLocaleChange">
          <option v-for="option in props.supportedLocales" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
      <!-- 主题切换：深色时展示 sun（点击切到亮色），浅色时展示 moon，动作语义而非状态开关。 -->
      <button class="icon-button theme-toggle" type="button" :aria-label="props.tr.aria.themeToggle" :title="props.tr.aria.themeToggle" @click="emit('toggleColorScheme')">
        <Icon :icon="(props.colorScheme === 'dark' ? props.icons.sun : props.icons.moon) ?? ''" class="theme-icon" aria-hidden="true" />
      </button>
      <a class="icon-button" :href="props.githubUrl" target="_blank" rel="noopener" :aria-label="props.tr.aria.github">
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M8 0C3.58 0 0 3.64 0 8.13c0 3.6 2.29 6.65 5.47 7.73.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.55-2.01.37-2.53-.5-2.69-.96-.09-.23-.48-.96-.82-1.15-.28-.15-.68-.52-.01-.53.63-.01 1.08.6 1.23.85.72 1.23 1.87.88 2.33.66.07-.53.28-.88.51-1.09-1.78-.2-3.64-.92-3.64-4.09 0-.9.31-1.64.82-2.22-.08-.2-.36-1.02.08-2.11 0 0 .67-.22 2.2.85.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.08 2.2-.85 2.2-.85.44 1.09.16 1.91.08 2.11.51.58.82 1.32.82 2.22 0 3.18-1.87 3.89-3.65 4.09.29.26.54.76.54 1.54 0 1.11-.01 2-.01 2.27 0 .22.15.48.55.4A8.01 8.01 0 0 0 16 8.13C16 3.64 12.42 0 8 0"
          />
        </svg>
      </a>
    </div>
  </header>
</template>

<style scoped>
/* 单行紧凑头部：品牌 | 短状态摘要 | 操作始终保持在同一行。 */
/* 单行紧凑头部：品牌、状态摘要与操作始终保持同一行。 */
.app-header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 6px 10px; min-width: 0; min-height: 44px; padding: 5px 10px; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-surface); }
.brand, .header-actions, .lang-switcher { display: flex; align-items: center; }
.brand { min-width: 0; gap: 8px; }
.header-actions { justify-self: end; gap: 6px; }
.header-actions > * { align-self: center; flex: 0 0 auto; }
.lang-switcher { gap: 4px; height: 28px; padding: 0 6px; border-radius: 7px; }
.logo-mark { display: grid; flex: 0 0 28px; width: 28px; height: 28px; place-items: center; border-radius: 7px; line-height: 0; }
.logo-mark img { display: block; width: 22px; height: 22px; }
.brand { gap: 7px; }
.brand-title { font-size: 12px; }
.brand-version { font-size: 9px; }
.lang-icon { width: 13px; height: 13px; }
.lang-switcher select { display: block; height: 28px; min-height: 28px; max-width: 84px; margin: 0; padding: 1px; line-height: 18px; }
.icon-button { display: grid; width: 28px; height: 28px; min-height: 28px; padding: 0; place-items: center; border-radius: 7px; line-height: 0; }
.icon-button svg, .theme-icon { display: block; width: 14px; height: 14px; }
.theme-icon { width: 16px; height: 16px; }
/* 状态摘要只保留核心值，完整标签通过 aria-label/title 提供，避免中间文本撑高头部。 */
.status-summary { display: flex; min-width: 0; justify-self: stretch; overflow: hidden; align-items: center; gap: 2px 5px; margin: 0; color: var(--color-text-muted); font-size: 10px; line-height: 1.2; white-space: nowrap; }
.summary-item { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.summary-item-image { max-width: 16ch; }
.summary-item-status { color: var(--color-text-strong); font-weight: 650; }
.summary-sep { color: var(--color-text-subtle); }
/* 移动端将状态摘要独占第二行，第一行只承载品牌和工具栏，避免控件被裁切。 */
@media (max-width: 959px) {
  .app-header { grid-template-columns: minmax(0, 1fr) auto; gap: 5px 8px; padding: 6px 8px; }
  .status-summary { grid-column: 1 / -1; grid-row: 2; min-height: 16px; }
  .header-actions { gap: 5px; }
  .header-action { width: 32px; min-width: 32px; min-height: 32px; padding: 5px; }
  .header-action span { display: none; }
}
@media (max-width: 520px) {
  .app-header { padding: 5px 7px; gap: 5px 6px; }
  .brand-text { display: none; }
  .logo-mark { width: 28px; height: 28px; }
  .logo-mark img { width: 23px; height: 23px; }
  .lang-switcher { padding: 3px 5px; }
  .lang-switcher select { max-width: 70px; font-size: 11px; }
  .icon-button { width: 30px; height: 30px; }
  .status-summary { gap: 2px 4px; font-size: 10px; }
  .summary-item-image { max-width: 10ch; }
}
/* 极窄屏隐藏重复下载入口，状态仍独占完整一行，保留语言、主题、GitHub 与清空操作。 */
@media (max-width: 380px) {
  .header-action:not(.danger) { display: none; }
  .app-header { gap: 4px; }
  .lang-switcher { gap: 2px; padding: 3px 4px; }
  .lang-switcher select { max-width: 58px; font-size: 10px; }
  .header-actions { gap: 4px; }
}
</style>
