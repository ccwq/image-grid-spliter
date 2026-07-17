<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

interface Props {
  open: boolean
  hasImage: boolean
  downloadDisabled: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'trigger-downloads'): void
}>()

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('update:open', false)
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', handleKeydown)
    else window.removeEventListener('keydown', handleKeydown)
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="mobile-advanced-drawer">
    <Transition name="drawer-backdrop">
      <button v-if="props.open" class="drawer-backdrop" type="button" aria-label="关闭高级设置" @click="emit('update:open', false)" />
    </Transition>
    <Transition name="drawer-sheet">
      <section v-if="props.open" class="drawer-sheet" role="dialog" aria-modal="true" aria-label="高级设置">
        <header class="drawer-header">
          <div><p class="eyebrow">高级设置</p><strong>自定义裁切与导出</strong></div>
          <button class="ghost" type="button" @click="emit('update:open', false)">关闭</button>
        </header>
        <p v-if="!props.hasImage" class="drawer-empty">请先上传图片；高级设置已暂时禁用。</p>
        <div class="drawer-content" :class="{ disabled: !props.hasImage }">
          <slot />
        </div>
      </section>
    </Transition>
    <div class="mobile-action-dock" aria-label="移动端快捷操作">
      <button class="drawer-trigger" type="button" :aria-expanded="props.open" @click="emit('update:open', !props.open)">
        {{ props.open ? '收起高级设置' : '高级设置' }}
      </button>
      <button class="mobile-download-trigger" type="button" :disabled="props.downloadDisabled" @click="emit('trigger-downloads')">下载全部</button>
    </div>
  </div>
</template>

<style scoped>
.mobile-advanced-drawer { display: none; }
@media (max-width: 959px) {
  .mobile-advanced-drawer { display: block; }
  .mobile-action-dock { position:fixed; z-index:40; right:12px; bottom:max(12px, env(safe-area-inset-bottom)); display:flex; gap:6px; filter:drop-shadow(0 8px 16px rgb(0 0 0 / .24)); }
  .drawer-trigger,.mobile-download-trigger { min-height:38px; white-space:nowrap; }
  .drawer-trigger { border-color:#47d7ba; background:#17343a; color:#d8fff5; }
  .mobile-download-trigger { border-color:#47d7ba; background:#47d7ba; color:#09201f; font-weight:800; }
  .mobile-download-trigger:disabled { border-color:rgb(203 239 231 / .18); background:#25343a; color:#7e9693; }
  .drawer-backdrop { position: fixed; z-index: 45; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 0; background: rgb(3 10 13 / .64); }
  .drawer-sheet { position: fixed; z-index: 46; right: 0; bottom: 0; left: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); height: min(86dvh, 760px); overflow: hidden; border: 1px solid rgb(143 215 202 / .25); border-radius: 16px 16px 0 0; background: #152129; box-shadow: 0 -12px 36px rgb(0 0 0 / .35); }
  .drawer-header { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; border-bottom:1px solid rgb(203 239 231 / .12); }
  .drawer-header .eyebrow { margin:0 0 1px; }.drawer-header strong { font-size:14px; }.drawer-header .ghost { min-height:30px; font-size:12px; }
  .drawer-empty { margin:10px 12px 0; padding:8px; border:1px dashed rgb(203 239 231 / .2); border-radius:8px; color:#a9c1be; font-size:12px; }
  .drawer-content { display:grid; min-height:0; gap:8px; overflow-y:auto; overscroll-behavior:contain; padding:10px 12px calc(14px + env(safe-area-inset-bottom)); }
  .drawer-content.disabled { opacity:.5; pointer-events:none; }
  .drawer-content :deep(.panel) { padding:9px; }
  .drawer-backdrop-enter-active,.drawer-backdrop-leave-active { transition: opacity .16s ease; }.drawer-backdrop-enter-from,.drawer-backdrop-leave-to { opacity:0; }
  .drawer-sheet-enter-active,.drawer-sheet-leave-active { transition: transform .2s ease, opacity .2s ease; }.drawer-sheet-enter-from,.drawer-sheet-leave-to { transform:translateY(100%); opacity:0; }
}
</style>
