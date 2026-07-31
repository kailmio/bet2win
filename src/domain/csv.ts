import Papa from "papaparse"
import { centsFromAud } from "./format"
import { duplicateFingerprint } from "./calculations"
import type { Bet, BetDraft, BetSource, BetStatus, ImportCandidate } from "./types"

export const CANONICAL_HEADERS = [
  "placed_at",
  "sport",
  "event",
  "market",
  "selection",
  "decimal_odds",
  "stake_aud",
  "bookmaker",
  "status",
  "return_aud",
  "settled_at",
  "external_bet_id",
  "notes",
] as const

const aliases: Record<string, string[]> = {
  placed_at: ["placed_at", "placed date", "bet date", "date", "placed"],
  sport: ["sport", "category"],
  event: ["event", "event name", "fixture"],
  market: ["market", "bet type"],
  selection: ["selection", "pick"],
  decimal_odds: ["decimal_odds", "odds", "price"],
  stake_aud: ["stake_aud", "stake", "bet amount"],
  bookmaker: ["bookmaker", "sportsbook"],
  status: ["status", "result", "outcome"],
  return_aud: ["return_aud", "return", "payout", "returns"],
  settled_at: ["settled_at", "settled date"],
  external_bet_id: ["external_bet_id", "bet id", "bet number", "reference"],
  notes: ["notes", "note"],
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
}

function findHeader(headers: string[], canonical: string) {
  const options = aliases[canonical].map(normalizeHeader)
  return headers.find((header) => options.includes(normalizeHeader(header)))
}

function parseStatus(value: string): BetStatus | undefined {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ")
  if (["pending", "open", "unsettled"].includes(normalized)) return "pending"
  if (["won", "win", "winner"].includes(normalized)) return "won"
  if (["lost", "loss", "lose"].includes(normalized)) return "lost"
  if (["void", "cancelled", "canceled", "push", "returned"].includes(normalized)) return "void"
  if (["cashed out", "cash out", "cashout"].includes(normalized)) return "cashed_out"
  return undefined
}

function toIso(value: string) {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString()
}

export function parseBetCsv(text: string, existing: Bet[]) {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (value) => value.trim() })
  const headers = parsed.meta.fields ?? []
  const required = ["placed_at", "sport", "event", "market", "selection", "decimal_odds", "stake_aud", "status"]
  const map = Object.fromEntries(CANONICAL_HEADERS.map((header) => [header, findHeader(headers, header)]))
  const missing = required.filter((field) => !map[field])
  if (missing.length) {
    return { candidates: [] as ImportCandidate[], errors: [`Unknown CSV layout. Missing: ${missing.join(", ")}. Use the Bet2Win template.`] }
  }
  const source: BetSource = headers.some((header) => /bet id|bet number|returns/i.test(header)) ? "bet365_csv" : "bet2win_csv"
  const existingById = new Map(existing.filter((bet) => bet.externalBetId).map((bet) => [bet.externalBetId!, bet.id]))
  const existingByFingerprint = new Map(existing.map((bet) => [duplicateFingerprint(bet), bet.id]))
  const candidates = parsed.data.map((row, index): ImportCandidate => {
    const get = (key: keyof typeof map) => (map[key] ? row[map[key]!] ?? "" : "")
    const status = parseStatus(get("status"))
    const placedAt = toIso(get("placed_at"))
    const decimalOdds = Number(get("decimal_odds").replace(",", "."))
    const stakeCents = centsFromAud(get("stake_aud"))
    const returnValue = get("return_aud")
    const draft: Partial<BetDraft> = {
      placedAt,
      sport: get("sport").trim(),
      event: get("event").trim(),
      market: get("market").trim(),
      selection: get("selection").trim(),
      decimalOdds,
      stakeCents,
      bookmaker: get("bookmaker").trim() || (source === "bet365_csv" ? "bet365" : "Sportsbook"),
      status,
      returnCents: returnValue ? centsFromAud(returnValue) : undefined,
      settledAt: get("settled_at") ? toIso(get("settled_at")) : undefined,
      externalBetId: get("external_bet_id").trim() || undefined,
      notes: get("notes").trim() || undefined,
      source,
    }
    const issues: string[] = []
    if (!placedAt) issues.push("Needs a valid placed date")
    if (!draft.sport) issues.push("Needs sport")
    if (!draft.event) issues.push("Needs event")
    if (!draft.market) issues.push("Needs market")
    if (!draft.selection) issues.push("Needs selection")
    if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) issues.push("Odds must be above 1.00")
    if (stakeCents <= 0) issues.push("Stake must be above $0")
    if (!status) issues.push("Unsupported status")
    if (status === "cashed_out" && draft.returnCents === undefined) issues.push("Cash-out requires actual return")
    const duplicateBetIds: string[] = []
    if (draft.externalBetId && existingById.has(draft.externalBetId)) duplicateBetIds.push(existingById.get(draft.externalBetId)!)
    if (placedAt && draft.event && draft.market && draft.selection && Number.isFinite(decimalOdds) && stakeCents > 0) {
      const fingerprint = duplicateFingerprint(draft as BetDraft)
      const match = existingByFingerprint.get(fingerprint)
      if (match && !duplicateBetIds.includes(match)) duplicateBetIds.push(match)
    }
    return {
      tempId: `csv-${index}-${crypto.randomUUID()}`,
      draft,
      issues,
      duplicateBetIds,
      duplicateDecision: duplicateBetIds.length ? "review" : "import_anyway",
      selected: issues.length === 0 && duplicateBetIds.length === 0,
    }
  })
  const errors = parsed.errors.map((error) => `Row ${error.row ?? "?"}: ${error.message}`)
  return { candidates, errors }
}

export function exportBetsCsv(bets: Bet[]) {
  return Papa.unparse(
    bets.map((bet) => ({
      placed_at: bet.placedAt,
      sport: bet.sport,
      event: bet.event,
      market: bet.market,
      selection: bet.selection,
      decimal_odds: bet.decimalOdds,
      stake_aud: (bet.stakeCents / 100).toFixed(2),
      bookmaker: bet.bookmaker,
      status: bet.status,
      return_aud: bet.returnCents === undefined ? "" : (bet.returnCents / 100).toFixed(2),
      settled_at: bet.settledAt ?? "",
      external_bet_id: bet.externalBetId ?? "",
      notes: bet.notes ?? "",
    })),
    { columns: [...CANONICAL_HEADERS] },
  )
}
