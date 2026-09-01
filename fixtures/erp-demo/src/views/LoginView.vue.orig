<template>
  <div class="login-page">
    <h1 class="login-title">银河 ERP 管理系统</h1>
    <form class="login-form" @submit.prevent="handleLogin">
      <label for="username">用户名</label>
      <input id="username" v-model="username" placeholder="请输入用户名" />
      <label for="password">密码</label>
      <input id="password" type="password" v-model="password" placeholder="请输入密码" />
      <div class="login-error" v-if="errorMsg">{{ errorMsg }}</div>
      <button type="submit" class="login-btn" :disabled="loading">
        {{ loading ? '登录中...' : '登 录' }}
      </button>
      <div class="login-footer">
        <span>© 2024 Galaxy ERP Inc. All rights reserved.</span>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  if (!username.value || !password.value) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  try {
    // 模拟登录
    await new Promise((resolve) => setTimeout(resolve, 800))
    if (username.value === 'admin') {
      router.push('/dashboard')
    } else {
      errorMsg.value = '用户名或密码错误，请重试'
    }
  } catch (e) {
    errorMsg.value = '登录请求失败，请检查网络'
  } finally {
    loading.value = false
  }
}

// 会话超时提示
const SESSION_TIMEOUT_HINT = '会话已超时，请重新登录'

// 登录表单字段名（不应提取）
const FIELD_USERNAME = 'username'
const FIELD_PASSWORD = 'password'
</script>
