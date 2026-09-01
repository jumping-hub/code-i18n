<template>
  <div class="app-shell">
    <aside class="sidebar">
      <h2 class="app-title">{{ t('src.App.银河ERP系.3fa8bc') }}</h2>
      <nav>
        <router-link to="/dashboard">{{ t('src.App.工作台.7e87d1') }}</router-link>
        <router-link to="/sales-order">{{ t('src.App.销售订单.4fe4a9') }}</router-link>
        <router-link to="/inventory">{{ t('src.App.库存管理.e75627') }}</router-link>
        <router-link to="/customer">{{ t('src.App.客户管理.d38721') }}</router-link>
        <a href="https://docs.example.com/erp" target="_blank">{{ t('src.App.帮助文档.e2ae7b') }}</a>
      </nav>
    </aside>
    <main class="content">
      <header class="topbar">
        <span class="topbar-title">{{ t('src.App.欢迎使用银河.ad039d') }}</span>
        <div class="user-area">
          <span class="username">{{ t('src.App.管理员.071a1b') }}</span>
          <button class="logout-btn">{{ t('src.App.退出登录.8ab988') }}</button>
        </div>
      </header>
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
// 侧边栏菜单配置（不应被提取为 UI 文本）
const menuKeys = ['dashboard', 'sales-order', 'inventory', 'customer']

// 日志（跳过）
console.log('App shell mounted, locale: ' + navigator.language)
</script>

<style scoped>
.sidebar { width: 220px; background: #2c3e50; }
</style>
