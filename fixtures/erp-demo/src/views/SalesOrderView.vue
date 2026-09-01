<template>
  <div class="sales-order">
    <h1>{{ t('src.App.销售订单.4fe4a9') }}</h1>
    <DataTable :rows="orders" :total="total" @edit="openEdit" @delete="removeOrder" />
    <div v-if="tip" class="tip">{{ tip }}</div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
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
      tip.value = t('src.views.SalesOrderView.暂无订单数据.546abe')
    }
  } catch (e) {
    ElMessage.error(t('src.views.SalesOrderView.订单列表加载.9d80bb'))
  }
}

function openEdit(row: any) {
  // 编辑弹窗
  ElMessageBox.confirm(t('src.views.SalesOrderView.确定要编辑订.fb9645', { orderNo: row.orderNo }), t('src.views.SalesOrderView.编辑确认.9d46c6'), {
    confirmButtonText: t('src.views.SalesOrderView.确定.621a82'),
    cancelButtonText: t('src.views.SalesOrderView.取消.949856'),
    type: 'warning',
  }).then(() => {
    ElMessage.success(t('src.views.SalesOrderView.订单orde.06b34c', { orderNo: row.orderNo }))
  }).catch(() => {})
}

async function removeOrder(row: any) {
  const result = await ElMessageBox.confirm(t('src.views.SalesOrderView.确定要删除订.8db49e', { orderNo: row.orderNo }), t('src.views.SalesOrderView.删除确认.a973f6'), {
    confirmButtonText: t('src.components.DataTable.删除.ea8d53'),
    cancelButtonText: t('src.views.SalesOrderView.取消.949856'),
    type: 'error',
  }).catch(() => null)
  if (result === null) return
  try {
    await submitOrder({ orderNo: row.orderNo, customerName: row.customerName, amount: row.amount })
    ElMessage.success(t('src.views.SalesOrderView.订单删除成功.8724e7'))
    await loadOrders()
  } catch (e) {
    ElMessage.error(t('src.views.SalesOrderView.订单删除失败.702ca9'))
  }
}

async function createOrder() {
  const newOrder = await ElMessageBox.prompt(t('src.views.SalesOrderView.请输入订单号.b9ae3e'), t('src.views.SalesOrderView.新增订单.093310'), {
    confirmButtonText: t('src.views.SalesOrderView.保存.ad5b82'),
    cancelButtonText: t('src.views.SalesOrderView.取消.949856'),
    inputPlaceholder: t('src.views.SalesOrderView.例如SO20.408092'),
  }).catch(() => null)
  if (!newOrder) return
  try {
    await submitOrder({ orderNo: newOrder.value, customerName: t('src.views.SalesOrderView.新客户.432642'), amount: 0 })
    ElMessage.success(t('src.views.SalesOrderView.订单创建成功.57d55c'))
    await loadOrders()
  } catch (e) {
    ElMessage.error(t('src.views.SalesOrderView.订单创建失败.083f6a'))
  }
}

onMounted(loadOrders)

// 报表导出文件名（不应提取）
function exportReport() {
  const fileName = 'sales_order_report_' + new Date().toISOString().slice(0, 10) + '.pdf'
  console.log('exporting report: ' + fileName)
}
</script>
