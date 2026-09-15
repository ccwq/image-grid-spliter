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
    <p class="status-summary">
      <span class="summary-item">{{ props.tr.stats.currentGrid }} {{ props.gridDescription }}</span>
      <span class="summary-sep" aria-hidden="true">·</span>
      <span class="summary-item">{{ props.tr.stats.tileCount }} {{ props.tileCount }}</span>
      <span class="summary-sep" aria-hidden="true">·</span>
      <span class="summary-item">{{ props.tr.stats.imageSize }} {{ props.imageInfo }}</span>
      <span class="summary-sep" aria-hidden="true">·</span>
      <span class="summary-item">{{ props.tr.stats.exportFormat }} {{ props.exportFormat.toUpperCase() }}<template v-if="props.isJpgFormat"> · {{ props.qualityLabel }}</template></span>
      <span class="summary-sep" aria-hidden="true">·</span>
      <!-- 仅瞬时状态文案对外可感知更新：静态信息对读屏用户属于噪音。 -->
      <span class="summary-item" aria-live="polite">{{ props.tr.stats.downloadStatus }} {{ props.statusText }}</span>
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
/* 单行紧凑头部：桌面端 品牌 | 状态摘要 | 操作 三段一行；<960px 状态摘要独占第二行。 */
.app-header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px 12px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-surface); }
.brand, .header-actions, .lang-switcher { display: flex; align-items: center; }
.brand { min-width: 0; gap: 10px; }
.header-actions { justify-self: end; gap: 8px; }
.lang-switcher { gap: 6px; padding: 5px 8px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-surface-raised); }
.logo-mark { display: grid; width: 36px; height: 36px; flex: 0 0 auto; place-items: center; overflow: hidden; border-radius: 10px; }
.logo-mark img { width: 28px; height: 28px; }
.brand-text { display: grid; min-width: 0; gap: 2px; }
.brand-title { overflow: hidden; font-size: 14px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
.brand-version { color: var(--color-text-subtle); font-size: 11px; }
.lang-icon { width: 15px; height: 15px; color: var(--color-accent); }
.lang-switcher select { max-width: 92px; padding: 3px; border: 0; background: transparent; color: var(--color-text-strong); }
.icon-button { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid var(--color-border); border-radius: 10px; color: var(--color-text-strong); }
.icon-button svg { width: 17px; height: 17px; }
.theme-icon { width: 17px; height: 17px; }
/* 纯文本状态摘要：标签和值保持可读间距，可在窄屏自然换行。 */
.status-summary { display: flex; min-width: 0; justify-self: stretch; flex-wrap: wrap; align-items: center; gap: 2px 6px; margin: 0; color: var(--color-text-muted); font-size: 12px; line-height: 1.35; }
.summary-item { min-width: 0; }
.summary-item:last-child { color: var(--color-text-strong); font-weight: 650; }
.summary-sep { color: var(--color-text-subtle); }
/* <960px：状态摘要换行到品牌/操作行下方，独占一行；条件动作折叠为图标按钮。 */
@media (max-width: 959px) {
  .status-summary { grid-column: 1 / -1; grid-row: 2; }
  .header-action { width: 32px; min-width: 32px; min-height: 32px; padding: 5px; }
  .header-action span { display: none; }
}
@media (max-width: 520px) { .app-header { min-height: 54px; padding: 7px 8px; gap: 6px 8px; }.logo-mark { width: 30px; height: 30px; }.logo-mark img { width: 25px; height: 25px; }.brand-text { display: none; }.lang-switcher { padding: 4px 6px; }.lang-switcher select { max-width: 70px; font-size: 12px; }.icon-button { width: 32px; height: 32px; }.status-summary { font-size: 11px; } }
</style>
