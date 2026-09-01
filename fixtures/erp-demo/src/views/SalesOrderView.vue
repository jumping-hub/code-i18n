<template>
  <div class="sales-order">
    <h1>销售订单</h1>
    <DataTable :rows="orders" :total="total" @edit="openEdit" @delete="removeOrder" />
    <div v-if="tip" class="tip">{{ tip }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DataTable from '../components/DataTable.vue'
import { fetchOrders, submitOrder } from '../api/orderApi'

const orders = ref<any[]>([])
const total = ref(0)
const tip = ref('')

async function loadOrders() {
  try {
    const data = await fetchOrders({ page: 1, size: 20 })
    orders.value = data.list
    total.value = data.total
    if (data.list.length === 0) {
      tip.value = '暂无订单数据，点击右上角新增订单'
    }
  } catch (e) {
    ElMessage.error('订单列表加载失败')
  }
}

function openEdit(row: any) {
  // 编辑弹窗
  ElMessageBox.confirm(`确定要编辑订单 ${row.orderNo} 吗？`, '编辑确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    ElMessage.success(`订单 ${row.orderNo} 编辑成功`)
  }).catch(() => {})
}

async function removeOrder(row: any) {
  const result = await ElMessageBox.confirm(`确定要删除订单 ${row.orderNo} 吗？删除后不可恢复。`, '删除确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'error',
  }).catch(() => null)
  if (result === null) return
  try {
    await submitOrder({ orderNo: row.orderNo, customerName: row.customerName, amount: row.amount })
    ElMessage.success('订单删除成功')
    await loadOrders()
  } catch (e) {
    ElMessage.error('订单删除失败，请稍后重试')
  }
}

async function createOrder() {
  const newOrder = await ElMessageBox.prompt('请输入订单号', '新增订单', {
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    inputPlaceholder: '例如：SO-2024-0001',
  }).catch(() => null)
  if (!newOrder) return
  try {
    await submitOrder({ orderNo: newOrder.value, customerName: '新客户', amount: 0 })
    ElMessage.success('订单创建成功')
    await loadOrders()
  } catch (e) {
    ElMessage.error('订单创建失败')
  }
}

onMounted(loadOrders)

// 报表导出文件名（不应提取）
function exportReport() {
  const fileName = 'sales_order_report_' + new Date().toISOString().slice(0, 10) + '.pdf'
  console.log('exporting report: ' + fileName)
}
</script>
