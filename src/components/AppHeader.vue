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
