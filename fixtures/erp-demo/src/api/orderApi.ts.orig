/**
 * 订单 API：包含大量不应国际化的内容（路径、日志、错误码）
 */

const API_BASE = '/api/v1'
const DEFAULT_TIMEOUT_MS = 30000

export interface Order {
  id: string
  orderNo: string
  customerName: string
  amount: number
  status: 'pending' | 'approved' | 'shipped' | 'done' | 'cancelled'
  createdAt: string
}

export async function fetchOrders(params: { page: number; size: number }): Promise<{ list: Order[]; total: number }> {
  console.log('fetchOrders called with params', JSON.stringify(params))
  const resp = await fetch(`${API_BASE}/orders?page=${params.page}&size=${params.size}`)
  if (!resp.ok) {
    // 用户可见错误（应保留）
    throw new Error('订单列表加载失败，请稍后重试')
  }
  const data = await resp.json()
  return data
}

export async function submitOrder(order: Omit<Order, 'id' | 'createdAt' | 'status'>): Promise<void> {
  const body = JSON.stringify({
    orderNo: order.orderNo,
    customerName: order.customerName,
    amount: order.amount,
  })
  try {
    await fetch(`${API_BASE}/orders`, { method: 'POST', body })
  } catch (e) {
    console.error('submitOrder failed:', e)
    throw new Error('订单提交失败，请检查网络连接')
  }
}

export function buildOrderNo(prefix: string, seq: number): string {
  // 拼接订单号：SO-2024-000123（不应提取）
  const date = new Date().toISOString().slice(0, 10)
  return `${prefix}-${date}-${String(seq).padStart(6, '0')}`
}
