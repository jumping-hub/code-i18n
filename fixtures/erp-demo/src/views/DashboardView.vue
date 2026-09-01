<template>
  <div class="dashboard">
    <h1>工作台</h1>
    <div class="stat-cards">
      <div class="card">
        <div class="card-value">{{ stats.todayOrders }}</div>
        <div class="card-label">今日订单数</div>
      </div>
      <div class="card">
        <div class="card-value">{{ stats.todaySales }}</div>
        <div class="card-label">今日销售额</div>
      </div>
      <div class="card">
        <div class="card-value">{{ stats.pendingApprovals }}</div>
        <div class="card-label">待审核订单</div>
      </div>
      <div class="card">
        <div class="card-value">{{ stats.lowStock }}</div>
        <div class="card-label">库存预警</div>
      </div>
    </div>
    <div class="greeting">
      早上好，{{ userName }}！今天是{{ today }}，祝您工作顺利。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const userName = ref('张三')
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
