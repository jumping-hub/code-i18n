// ERP 演示项目入口
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import App from './App.vue'

// 演示：此处不应被提取（import 路径、变量名）
const app = createApp(App)

const i18n = createI18n({
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {},
})

app.use(i18n)
app.mount('#app')

// 日志（应被分类器跳过）
console.log('ERP demo application started, version: 1.0.0')
console.error('unexpected state in boot sequence')
