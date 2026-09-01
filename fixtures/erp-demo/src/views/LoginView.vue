<template>
  <div class="login-page">
    <h1 class="login-title">{{ t('src.views.LoginView.银河ERP管.60a623') }}</h1>
    <form class="login-form" @submit.prevent="handleLogin">
      <label for="username">{{ t('src.views.LoginView.用户名.6d13ec') }}</label>
      <input id="username" v-model="username" :placeholder="t('src.views.LoginView.请输入用户名.5d6074')" />
      <label for="password">{{ t('src.views.LoginView.密码.a8566b') }}</label>
      <input id="password" type="password" v-model="password" :placeholder="t('src.views.LoginView.请输入密码.367b48')" />
      <div class="login-error" v-if="errorMsg">{{ errorMsg }}</div>
      <button type="submit" class="login-btn" :disabled="loading">
        {{ loading ? t('src.views.LoginView.登录中.13efcb') : t('src.views.LoginView.登录.69eeba') }}
      </button>
      <div class="login-footer">
        <span>{{ t('src.views.LoginView.2024_galaxy.b1acf4') }}</span>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  if (!username.value || !password.value) {
    errorMsg.value = t('src.views.LoginView.请输入用户名.037f04')
    return
  }
  loading.value = true
  try {
    // 模拟登录
    await new Promise((resolve) => setTimeout(resolve, 800))
    if (username.value === 'admin') {
      router.push('/dashboard')
    } else {
      errorMsg.value = t('src.views.LoginView.用户名或密码.04ef64')
    }
  } catch (e) {
    errorMsg.value = t('src.views.LoginView.登录请求失败.d7c6fd')
  } finally {
    loading.value = false
  }
}

// 会话超时提示
const SESSION_TIMEOUT_HINT = t('src.views.LoginView.会话已超时请.e5c511')

// 登录表单字段名（不应提取）
const FIELD_USERNAME = 'username'
const FIELD_PASSWORD = 'password'
</script>
