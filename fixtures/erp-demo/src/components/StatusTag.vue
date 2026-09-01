<template>
  <span class="status-tag" :class="'status-' + status">{{ statusText }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ status: string }>()

// 状态文案映射（应全部提取为 key）
const statusMap: Record<string, string> = {
  pending: '待审核',
  approved: '已审核',
  shipped: '已发货',
  done: '已完成',
  cancelled: '已取消',
}

const statusText = computed(() => statusMap[props.status] || '未知状态')
</script>
