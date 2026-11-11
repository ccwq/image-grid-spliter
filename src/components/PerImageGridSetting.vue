<script setup lang="ts">
// 单图网格设置（T04）：PC（≥960px）popover 悬浮 / 移动端（<960px）全屏层。
// 内容与全局面板同构精简：网格预设卡片 + 自定义行列 + "使用全局网格"回退。
// 边线擦除不进入单图设置（T04 决议）；覆盖只含分割线，经 setGridOverride 归一化写入。
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import pixelarticons from '@iconify-json/pixelarticons/icons.json'
import { createEvenDividerLines, gridPresets, type GridPreset } from '../utils/grid'
import type { GridOverride } from '../composables/useImageSlicer'
import type { LocaleMessages } from '../composables/useLocale'

const icons = { grid: pixelarticons.icons.grid, check: pixelarticons.icons.check, close: pixelarticons.icons.close }

interface Props {
  tr: LocaleMessages
  /** 打开时传入目标图片 id；null 关闭。 */
  imageId: string | null
  /** 目标图片当前覆盖；null = 跟随全局。 */
  override: GridOverride | null
  /** 全局网格描述文案（显示当前回退目标）。 */
  globalGridLabel: string
  processing: boolean
  /** 移动端全屏层形态（App.vue 按 isMobile 传入）。 */
  isMobile: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', id: string, override: GridOverride): void
  (e: 'reset', id: string): void
}>()

/** 预设选择即生效：预设 → 等分分割线（归一化 0-1），与全局 selectPreset 同构。 */
const pickPreset = (preset: GridPreset) => {
  if (!props.imageId || props.processing) return
  emit('apply', props.imageId, {
    horizontalLines: createEvenDividerLines(preset.rows),
    verticalLines: createEvenDividerLines(preset.cols),
  })
  emit('close')
}

const customRows = ref(2)
const customCols = ref(2)
// 打开时以当前覆盖的行列数初始化自定义输入（无覆盖用 2x2 默认）。
watch(() => props.imageId, () => {
  if (props.override) {
    customRows.value = props.override.horizontalLines.length + 1
    customCols.value = props.override.verticalLines.length + 1
  }
})

const applyCustom = () => {
  const rows = Math.max(1, Math.floor(customRows.value) || 1)
  const cols = Math.max(1, Math.floor(customCols.value) || 1)
  if (!props.imageId || props.processing) return
  emit('apply', props.imageId, {
    horizontalLines: createEvenDividerLines(rows),
    verticalLines: createEvenDividerLines(cols),
  })
  emit('close')
}

const resetToGlobal = () => {
  if (!props.imageId || props.processing) return
  emit('reset', props.imageId)
  emit('close')
}

const hasOverride = computed(() => props.override !== null)
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩：两种形态共用，点击关闭。 -->
    <div v-if="props.imageId" class="pigs-mask" @click.self="emit('close')">
      <section class="pigs-panel" :class="{ mobile: props.isMobile }" role="dialog" :aria-label="props.tr.buttons.imageSettings">
        <div class="pigs-header">
          <span class="field-label"><Icon :icon="icons.grid" class="inline-icon" aria-hidden="true" /> {{ props.tr.buttons.imageSettings }}</span>
          <button class="ghost icon-only" type="button" :aria-label="props.tr.aria.closeDialog" :title="props.tr.aria.closeDialog" @click="emit('close')">
            <Icon :icon="icons.close" class="btn-icon" aria-hidden="true" />
          </button>
        </div>
        <p class="muted pigs-global-hint">{{ props.tr.grid.perImageFollowsGlobal }} · {{ props.globalGridLabel }}</p>
        <div class="preset-grid" role="group" :aria-label="props.tr.grid.eyebrow">
          <button
            v-for="preset in gridPresets"
            :key="preset.label"
            type="button"
            class="preset"
            :class="{ active: props.override && props.override.verticalLines.length + 1 === preset.cols && props.override.horizontalLines.length + 1 === preset.rows }"
            :aria-pressed="props.override && props.override.verticalLines.length + 1 === preset.cols && props.override.horizontalLines.length + 1 === preset.rows"
            :disabled="props.processing"
            @click="pickPreset(preset)"
          >
            <Icon :icon="icons.grid" class="btn-icon" aria-hidden="true" />
            {{ preset.label }}
          </button>
        </div>
        <div class="pigs-custom">
          <label>{{ props.tr.grid.columns }} <input v-model.number="customCols" type="number" min="1" inputmode="numeric" :disabled="props.processing" /></label>
          <label>{{ props.tr.grid.rows }} <input v-model.number="customRows" type="number" min="1" inputmode="numeric" :disabled="props.processing" /></label>
          <button class="ghost" type="button" :disabled="props.processing" @click="applyCustom">
            <Icon :icon="icons.check" class="btn-icon" aria-hidden="true" />
            {{ props.tr.grid.apply }}
          </button>
        </div>
        <!-- 回退全局（T04）：仅在有覆盖时可用。 -->
        <button class="ghost pigs-fallback" type="button" :disabled="props.processing || !hasOverride" @click="resetToGlobal">
          {{ props.tr.buttons.gridOverrideFallback }}
        </button>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 遮罩：PC 以锚点附近浮层呈现（简化为居中浮层），移动端全屏层。 */
.pigs-mask { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 16px; background: var(--color-shadow); }
.pigs-panel { display: grid; min-width: 0; width: min(360px, calc(100vw - 32px)); max-height: 80dvh; padding: 10px; overflow: auto; border: 1px solid var(--color-border-strong); border-radius: 12px; background: var(--color-surface); box-shadow: 0 12px 28px var(--color-shadow); gap: 8px; }
.pigs-panel.mobile { width: 100vw; max-height: none; min-height: 100dvh; border-radius: 0; border: none; align-content: start; padding: 12px; padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
.pigs-header { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.pigs-global-hint { margin: 0; font-size: 11px; }
.pigs-custom { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.pigs-custom label { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; }
.pigs-custom input { width: 44px; height: 28px; padding: 2px 5px; }
.pigs-fallback { justify-self: start; }
.preset { display: grid; min-height: 28px; place-items: center start; }
.preset.active { border-color: var(--color-accent-selected); background: var(--color-accent-selected); color: var(--color-accent-selected-text); }
/* 移动端触控目标。 */
@media (max-width: 959px) { .preset { min-height: 40px; } .pigs-custom input, .pigs-custom .ghost, .pigs-fallback, .pigs-header .icon-only { min-height: 40px; } }
</style>
