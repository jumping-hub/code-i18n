<template>
  <div class="inventory">
    <h1>库存管理</h1>
    <div class="toolbar">
      <input placeholder="输入物料编码或名称" />
      <button>查询</button>
      <button>盘点</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>物料编码</th>
          <th>物料名称</th>
          <th>仓库</th>
          <th>当前库存</th>
          <th>安全库存</th>
          <th>库存状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.code">
          <td>{{ item.code }}</td>
          <td>{{ item.name }}</td>
          <td>{{ item.warehouse }}</td>
          <td>{{ item.qty }}</td>
          <td>{{ item.safeQty }}</td>
          <td>
            <span v-if="item.qty <= item.safeQty" class="low">库存不足</span>
            <span v-else class="ok">库存正常</span>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="warning" class="warning">{{ warning }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const items = ref<any[]>([])
const warning = ref('')

onMounted(async () => {
  try {
    const resp = await fetch('/api/v1/inventory')
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    items.value = await resp.json()
  } catch (e) {
    warning.value = '库存数据加载失败，请稍后重试'
    ElMessage.error('网络异常，请检查服务是否可用')
  }
})

// 库存单位列表（不应提取）
const UNITS = ['PCS', 'BOX', 'KG', 'M']
</script>
