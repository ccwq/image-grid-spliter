<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { LocaleMessages, Locale } from '../composables/useLocale'

interface Props {
  tr: LocaleMessages
  icons: Record<string, unknown>
  locale: Locale
  supportedLocales: { value: Locale; label: string }[]
  appVersion: string
  githubUrl: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'localeChange', locale: Locale): void }>()

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
    <div class="header-actions">
      <div class="lang-switcher">
        <Icon :icon="props.icons.flag" class="lang-icon" aria-hidden="true" />
        <select :aria-label="props.tr.aria.language" :value="props.locale" @change="onLocaleChange">
          <option v-for="option in props.supportedLocales" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
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
.app-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 64px; padding: 10px 12px; border: 1px solid rgb(203 239 231 / .15); border-radius: 14px; background: #152129; }
.brand, .header-actions, .lang-switcher { display: flex; align-items: center; }
.brand { min-width: 0; gap: 10px; }.header-actions { gap: 8px; }.lang-switcher { gap: 6px; padding: 5px 8px; border: 1px solid rgb(203 239 231 / .15); border-radius: 10px; background: #1b2a32; }
.logo-mark { display: grid; width: 36px; height: 36px; flex: 0 0 auto; place-items: center; overflow: hidden; border-radius: 10px; }.logo-mark img { width: 28px; height: 28px; }.brand-text { display: grid; min-width: 0; gap: 2px; }.brand-title { overflow: hidden; font-size: 14px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }.brand-version { color: #9eb7b4; font-size: 11px; }.lang-icon { width: 15px; height: 15px; color: #8fd7ca; }.lang-switcher select { max-width: 92px; padding: 3px; border: 0; background: transparent; color: #eaf4f1; }.icon-button { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid rgb(203 239 231 / .15); border-radius: 10px; color: #baffef; }.icon-button svg { width: 17px; height: 17px; }
@media (max-width: 520px) { .app-header { min-height:54px; padding:7px 8px; }.logo-mark { width:30px; height:30px; }.logo-mark img { width:25px; height:25px; }.brand-text { display:none; }.lang-switcher { padding:4px 6px; }.lang-switcher select { max-width:70px; font-size:12px; }.icon-button { width:32px; height:32px; } }
</style>
