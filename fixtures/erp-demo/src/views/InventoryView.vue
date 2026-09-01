<template>
  <div class="inventory">
    <h1>{{ t('src.App.库存管理.e75627') }}</h1>
    <div class="toolbar">
      <input :placeholder="t('src.views.InventoryView.输入物料编码.416be7')" />
      <button>{{ t('src.views.InventoryView.查询.999ddd') }}</button>
      <button>{{ t('src.views.InventoryView.盘点.589f59') }}</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>{{ t('src.views.InventoryView.物料编码.810839') }}</th>
          <th>{{ t('src.views.InventoryView.物料名称.24a46d') }}</th>
          <th>{{ t('src.views.InventoryView.仓库.2a415c') }}</th>
          <th>{{ t('src.views.InventoryView.当前库存.2ef9c7') }}</th>
          <th>{{ t('src.views.InventoryView.安全库存.4e6ee3') }}</th>
          <th>{{ t('src.views.InventoryView.库存数据加载.05ba26') }}</th>
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
            <span v-if="item.qty <= item.safeQty" class="low">{{ t('src.views.InventoryView.库存不足.7cdf33') }}</span>
            <span v-else class="ok">{{ t('src.views.InventoryView.库存正常.5ae697') }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="warning" class="warning">{{ warning }}</div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
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
    warning.value = t('src.views.InventoryView.库存数据加载.05ba26')
    ElMessage.error(t('src.views.InventoryView.网络异常请检.9ecc9a'))
  }
})

// 库存单位列表（不应提取）
const UNITS = ['PCS', 'BOX', 'KG', 'M']
</script>
