export const BET_STATUSES = ["pending", "won", "lost", "void", "cashed_out"] as const
export type BetStatus = (typeof BET_STATUSES)[number]

export type BetSource = "manual" | "bet2win_csv" | "bet365_csv" | "bet365_screenshot" | "bet365_pdf"

export interface Bet {
  id: string
  placedAt: string
  sport: string
  event: string
  market: string
  selection: string
  decimalOdds: number
  stakeCents: number
  bookmaker: string
  status: BetStatus
  returnCents?: number
  settledAt?: string
  notes?: string
  source: BetSource
  externalBetId?: string
  createdAt: string
  updatedAt: string
}

export type BetDraft = Omit<Bet, "id" | "createdAt" | "updatedAt" | "source"> & {
  source?: BetSource
}

export type TransactionType = "opening" | "deposit" | "withdrawal" | "adjustment"

export interface BankrollTransaction {
  id: string
  effectiveAt: string
  type: TransactionType
  amountCents: number
  memo?: string
  createdAt: string
}

export interface GuardrailSettings {
  maxStakePct: number
  maxDailyExposurePct: number
  maxSportExposurePct: number
  drawdownWarningPct: number
}

export interface AppSettings {
  currency: "AUD"
  oddsFormat: "decimal"
  guardrails: GuardrailSettings
}

export interface AppState {
  schemaVersion: 1
  bets: Bet[]
  transactions: BankrollTransaction[]
  settings: AppSettings
}

export type DuplicateDecision = "review" | "skip" | "import_anyway"

export interface ImportCandidate {
  tempId: string
  draft: Partial<BetDraft>
  sourceImageIndex?: number
  sourceEvidence?: string
  issues: string[]
  duplicateBetIds: string[]
  duplicateDecision: DuplicateDecision
  selected: boolean
  unsupportedReason?: string
}

export interface ImportSummary {
  imported: number
  skipped: number
  invalid: number
  duplicates: number
}
