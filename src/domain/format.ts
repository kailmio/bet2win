const currencyFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
})

export function formatCurrency(cents: number, sign = false) {
  const value = cents / 100
  const formatted = currencyFormatter.format(Math.abs(value))
  if (!sign || value === 0) return value < 0 ? `-${formatted}` : formatted
  return `${value > 0 ? "+" : "-"}${formatted}`
}

export function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`
}

export function formatDate(value: string, includeTime = false) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date)
}

export function centsFromAud(value: number | string) {
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}
