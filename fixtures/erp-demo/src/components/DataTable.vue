<template>
  <div class="data-table">
    <div class="table-toolbar">
      <input class="search-input" :placeholder="t('src.components.DataTable.搜索订单.dab56c')" />
      <button class="btn-refresh" @click="reload">{{ t('src.components.DataTable.刷新.8b9fe2') }}</button>
      <button class="btn-export" @click="exportData">{{ t('src.components.DataTable.导出.343214') }}</button>
      <button class="btn-import" @click="importData">{{ t('src.components.DataTable.导入.d1330b') }}</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>{{ t('src.components.DataTable.选择.5fe370') }}</th>
          <th>{{ t('src.components.DataTable.序号.372771') }}</th>
          <th>{{ t('src.components.DataTable.订单编号.c2b953') }}</th>
          <th>{{ t('src.components.DataTable.客户名称.d907b2') }}</th>
          <th>{{ t('src.components.DataTable.金额.c85a63') }}</th>
          <th>{{ t('src.components.DataTable.状态.ae49e2') }}</th>
          <th>{{ t('src.components.DataTable.创建时间.512fc9') }}</th>
          <th>{{ t('src.components.DataTable.操作.12068c') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td><input type="checkbox" /></td>
          <td>{{ row.index }}</td>
          <td>{{ row.orderNo }}</td>
          <td>{{ row.customerName }}</td>
          <td>{{ row.amount }}</td>
          <td><StatusTag :status="row.status" /></td>
          <td>{{ row.createdAt }}</td>
          <td>
            <button class="btn-edit" @click="$emit('edit', row)">{{ t('src.components.DataTable.编辑.607348') }}</button>
            <button class="btn-delete" @click="$emit('delete', row)">{{ t('src.components.DataTable.删除.ea8d53') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="pagination">
      <span>{{ t('src.components.DataTable.共total.b764b9', { total: total }) }}</span>
      <button @click="page--">{{ t('src.components.DataTable.上一页.5249fe') }}</button>
      <span>{{ t('src.components.DataTable.第page页.c44457', { page: page }) }}</span>
      <button @click="page++">{{ t('src.components.DataTable.下一页.ff7f20') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
import StatusTag from './StatusTag.vue'

defineProps<{ rows: any[]; total: number }>()
const page = ref(1)

function reload() {
  console.log('reloading table data...')
}

function exportData() {
  // 下载文件名（不应提取）
  const fileName = 'orders_export_' + Date.now() + '.xlsx'
  console.log('exporting to ' + fileName)
}

function importData() {
  alert(t('src.components.DataTable.导入功能开发.30fa95'))
}
</script>
