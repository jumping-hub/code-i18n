/** 格式化工具（不应国际化） */

export function formatCurrency(amount: number): string {
  // 货币格式化：¥ 1,234.50（数字格式，跳过）
  return '¥ ' + amount.toFixed(2)
}

export function formatPercent(ratio: number): string {
  return (ratio * 100).toFixed(1) + '%'
}

export function formatDate(iso: string): string {
  // 日期格式，跳过
  return new Date(iso).toLocaleDateString('zh-CN')
}
