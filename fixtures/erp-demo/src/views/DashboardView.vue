<template>
  <div class="dashboard">
    <h1>{{ t('src.App.工作台.7e87d1') }}</h1>
    <div class="stat-cards">
      <div class="card">
        <div class="card-value">{{ stats.todayOrders }}</div>
        <div class="card-label">{{ t('src.views.DashboardView.今日订单数.169d56') }}</div>
      </div>
      <div class="card">
        <div class="card-value">{{ stats.todaySales }}</div>
        <div class="card-label">{{ t('src.views.DashboardView.今日销售额.c8f893') }}</div>
      </div>
      <div class="card">
        <div class="card-value">{{ stats.pendingApprovals }}</div>
        <div class="card-label">{{ t('src.views.DashboardView.待审核订单.3dc86a') }}</div>
      </div>
      <div class="card">
        <div class="card-value">{{ stats.lowStock }}</div>
        <div class="card-label">{{ t('src.views.DashboardView.库存预警.4d1e95') }}</div>
      </div>
    </div>
    <div class="greeting">
      {{ t('src.views.DashboardView.早上好use.f53cd1', { userName: userName, today: today }) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'

const userName = ref(t('src.views.DashboardView.张三.23fc39'))
const today = new Date().toLocaleDateString('zh-CN')

const stats = ref({
  todayOrders: 128,
  todaySales: 356000,
  pendingApprovals: 12,
  lowStock: 5,
})

// 统计卡片配置 key（不应提取）
const cardKeys = ['todayOrders', 'todaySales', 'pendingApprovals', 'lowStock']
</script>
