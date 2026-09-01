<template>
  <span class="status-tag" :class="'status-' + status">{{ statusText }}</span>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'

const props = defineProps<{ status: string }>()

// 状态文案映射（应全部提取为 key）
const statusMap: Record<string, string> = {
  pending: t('src.components.StatusTag.待审核.2453a3'),
  approved: t('src.components.StatusTag.已审核.1b2386'),
  shipped: t('src.components.StatusTag.已发货.7d1f48'),
  done: t('src.components.StatusTag.已完成.00206a'),
  cancelled: t('src.components.StatusTag.已取消.b17dfa'),
}

const statusText = computed(() => statusMap[props.status] || t('src.components.StatusTag.未知状态.31a2c8'))
</script>
