<template>
  <div class="app-shell">
    <aside class="sidebar">
      <h2 class="app-title">银河 ERP 系统</h2>
      <nav>
        <router-link to="/dashboard">工作台</router-link>
        <router-link to="/sales-order">销售订单</router-link>
        <router-link to="/inventory">库存管理</router-link>
        <router-link to="/customer">客户管理</router-link>
        <a href="https://docs.example.com/erp" target="_blank">帮助文档</a>
      </nav>
    </aside>
    <main class="content">
      <header class="topbar">
        <span class="topbar-title">欢迎使用银河 ERP</span>
        <div class="user-area">
          <span class="username">管理员</span>
          <button class="logout-btn">退出登录</button>
        </div>
      </header>
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
// 侧边栏菜单配置（不应被提取为 UI 文本）
const menuKeys = ['dashboard', 'sales-order', 'inventory', 'customer']

// 日志（跳过）
console.log('App shell mounted, locale: ' + navigator.language)
</script>

<style scoped>
.sidebar { width: 220px; background: #2c3e50; }
</style>
