import type { AppSettings, BankrollTransaction, Bet, BetDraft } from "./types"

export function getReturnCents(bet: Pick<Bet, "status" | "stakeCents" | "decimalOdds" | "returnCents">) {
  if (bet.status === "pending") return undefined
  if (bet.returnCents !== undefined) return bet.returnCents
  if (bet.status === "won") return Math.round(bet.stakeCents * bet.decimalOdds)
  if (bet.status === "void") return bet.stakeCents
  if (bet.status === "lost") return 0
  return undefined
}

export function getProfitCents(bet: Pick<Bet, "status" | "stakeCents" | "decimalOdds" | "returnCents">) {
  const returned = getReturnCents(bet)
  return returned === undefined ? 0 : returned - bet.stakeCents
}

export function getCurrentBankrollCents(bets: Bet[], transactions: BankrollTransaction[]) {
  const ledger = transactions.reduce((sum, item) => sum + item.amountCents, 0)
  return ledger + bets.reduce((sum, bet) => sum + getProfitCents(bet), 0)
}

export function getAvailableBankrollCents(bets: Bet[], transactions: BankrollTransaction[]) {
  const pendingExposure = bets
    .filter((bet) => bet.status === "pending")
    .reduce((sum, bet) => sum + bet.stakeCents, 0)
  return getCurrentBankrollCents(bets, transactions) - pendingExposure
}

export function calculateMetrics(bets: Bet[], transactions: BankrollTransaction[]) {
  const settled = bets.filter((bet) => bet.status !== "pending")
  const decisive = settled.filter((bet) => bet.status === "won" || bet.status === "lost")
  const totalStakeCents = settled.reduce((sum, bet) => sum + bet.stakeCents, 0)
  const netProfitCents = settled.reduce((sum, bet) => sum + getProfitCents(bet), 0)
  const wins = decisive.filter((bet) => bet.status === "won").length
  return {
    currentBankrollCents: getCurrentBankrollCents(bets, transactions),
    availableBankrollCents: getAvailableBankrollCents(bets, transactions),
    pendingExposureCents: bets.filter((bet) => bet.status === "pending").reduce((sum, bet) => sum + bet.stakeCents, 0),
    netProfitCents,
    totalStakeCents,
    roi: totalStakeCents ? (netProfitCents / totalStakeCents) * 100 : 0,
    winRate: decisive.length ? (wins / decisive.length) * 100 : 0,
    averageOdds: settled.length ? settled.reduce((sum, bet) => sum + bet.decimalOdds, 0) / settled.length : 0,
    maxDrawdownPct: calculateMaxDrawdownPct(bets, transactions),
  }
}

export function calculateMaxDrawdownPct(bets: Bet[], transactions: BankrollTransaction[]) {
  const opening = transactions.reduce((sum, transaction) => sum + transaction.amountCents, 0)
  let balance = opening
  let peak = opening
  let maxDrawdown = 0
  const settled = bets
    .filter((bet) => bet.status !== "pending")
    .sort((a, b) => (a.settledAt ?? a.placedAt).localeCompare(b.settledAt ?? b.placedAt))
  for (const bet of settled) {
    balance += getProfitCents(bet)
    peak = Math.max(peak, balance)
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - balance) / peak) * 100)
  }
  return maxDrawdown
}

export function buildBankrollSeries(bets: Bet[], transactions: BankrollTransaction[]) {
  const opening = transactions.reduce((sum, transaction) => sum + transaction.amountCents, 0)
  let balance = opening
  const points = [{ date: transactions[0]?.effectiveAt ?? "", bankroll: opening / 100 }]
  for (const bet of bets
    .filter((item) => item.status !== "pending")
    .sort((a, b) => (a.settledAt ?? a.placedAt).localeCompare(b.settledAt ?? b.placedAt))) {
    balance += getProfitCents(bet)
    points.push({ date: bet.settledAt ?? bet.placedAt, bankroll: balance / 100 })
  }
  return points
}

export function getSportAllocation(bets: Bet[]) {
  const totals = new Map<string, number>()
  for (const bet of bets) totals.set(bet.sport, (totals.get(bet.sport) ?? 0) + bet.stakeCents)
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0)
  return [...totals.entries()]
    .map(([sport, cents]) => ({ sport, cents, percent: total ? (cents / total) * 100 : 0 }))
    .sort((a, b) => b.cents - a.cents)
}

export interface GuardrailWarning {
  code: "stake" | "daily" | "sport" | "drawdown"
  title: string
  detail: string
  ratio: number
}

export function evaluateCandidate(
  candidate: Pick<BetDraft, "placedAt" | "sport" | "stakeCents">,
  bets: Bet[],
  transactions: BankrollTransaction[],
  settings: AppSettings,
) {
  const current = getCurrentBankrollCents(bets, transactions)
  if (current <= 0) return []
  const warnings: GuardrailWarning[] = []
  const stakePct = (candidate.stakeCents / current) * 100
  if (stakePct > settings.guardrails.maxStakePct) {
    warnings.push({
      code: "stake",
      title: "Stake is above plan",
      detail: `${stakePct.toFixed(1)}% of bankroll versus your ${settings.guardrails.maxStakePct}% limit.`,
      ratio: stakePct / settings.guardrails.maxStakePct,
    })
  }
  const day = candidate.placedAt.slice(0, 10)
  const pendingForDay = bets.filter((bet) => bet.status === "pending" && bet.placedAt.slice(0, 10) === day)
  const dayExposure = pendingForDay.reduce((sum, bet) => sum + bet.stakeCents, 0) + candidate.stakeCents
  const dayPct = (dayExposure / current) * 100
  if (dayPct > settings.guardrails.maxDailyExposurePct) {
    warnings.push({
      code: "daily",
      title: "Daily exposure is above plan",
      detail: `${dayPct.toFixed(1)}% of bankroll would be committed today.`,
      ratio: dayPct / settings.guardrails.maxDailyExposurePct,
    })
  }
  const allPending = [...pendingForDay, { ...candidate, status: "pending" as const }]
  const totalPending = allPending.reduce((sum, bet) => sum + bet.stakeCents, 0)
  const sportPending = allPending.filter((bet) => bet.sport === candidate.sport).reduce((sum, bet) => sum + bet.stakeCents, 0)
  const sportPct = totalPending ? (sportPending / totalPending) * 100 : 0
  if (sportPct > settings.guardrails.maxSportExposurePct) {
    warnings.push({
      code: "sport",
      title: "Stake concentration is above plan",
      detail: `${candidate.sport} would represent ${sportPct.toFixed(0)}% of today's pending exposure.`,
      ratio: sportPct / settings.guardrails.maxSportExposurePct,
    })
  }
  const drawdown = calculateMaxDrawdownPct(bets, transactions)
  if (drawdown > settings.guardrails.drawdownWarningPct) {
    warnings.push({
      code: "drawdown",
      title: "Drawdown guardrail reached",
      detail: `Current maximum drawdown is ${drawdown.toFixed(1)}%.`,
      ratio: drawdown / settings.guardrails.drawdownWarningPct,
    })
  }
  return warnings.sort((a, b) => b.ratio - a.ratio)
}

export function duplicateFingerprint(bet: Pick<BetDraft, "placedAt" | "event" | "market" | "selection" | "decimalOdds" | "stakeCents" | "bookmaker">) {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ")
  return [
    bet.placedAt.slice(0, 16),
    normalize(bet.event),
    normalize(bet.market),
    normalize(bet.selection),
    bet.decimalOdds.toFixed(3),
    bet.stakeCents,
    normalize(bet.bookmaker),
  ].join("|")
}

export function filterBetsByDate(bets: Bet[], start?: string, end?: string) {
  const startMs = start ? Date.parse(start) : Number.NEGATIVE_INFINITY
  const endMs = end ? Date.parse(end) : Number.POSITIVE_INFINITY
  return bets.filter((bet) => {
    const placed = Date.parse(bet.placedAt)
    return placed >= startMs && placed <= endMs
  })
}
