<template>
  <div class="data-table">
    <div class="table-toolbar">
      <input class="search-input" placeholder="搜索订单..." />
      <button class="btn-refresh" @click="reload">刷新</button>
      <button class="btn-export" @click="exportData">导出</button>
      <button class="btn-import" @click="importData">导入</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>选择</th>
          <th>序号</th>
          <th>订单编号</th>
          <th>客户名称</th>
          <th>金额</th>
          <th>状态</th>
          <th>创建时间</th>
          <th>操作</th>
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
            <button class="btn-edit" @click="$emit('edit', row)">编辑</button>
            <button class="btn-delete" @click="$emit('delete', row)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="pagination">
      <span>共 {{ total }} 条记录</span>
      <button @click="page--">上一页</button>
      <span>第 {{ page }} 页</span>
      <button @click="page++">下一页</button>
    </div>
  </div>
</template>

<script setup lang="ts">
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
  alert('导入功能开发中，敬请期待')
}
</script>
