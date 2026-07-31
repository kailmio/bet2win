import { describe, expect, it } from "vitest"
import { calculateMetrics, duplicateFingerprint, evaluateCandidate, filterBetsByDate, getAvailableBankrollCents, getProfitCents, getReturnCents } from "./calculations"
import { seedState } from "./seed"
import type { Bet } from "./types"

describe("bankroll calculations", () => {
  it("matches the approved dashboard values", () => {
    const metrics = calculateMetrics(seedState.bets, seedState.transactions)
    expect(metrics.currentBankrollCents).toBe(1_248_000)
    expect(metrics.availableBankrollCents).toBe(1_223_000)
    expect(metrics.netProfitCents).toBe(94_650)
    expect(metrics.roi).toBeCloseTo(7.6, 1)
    expect(metrics.winRate).toBeCloseTo(58.3, 1)
  })

  it("uses settlement defaults and actual cash-out returns", () => {
    expect(getReturnCents({ status: "won", stakeCents: 1000, decimalOdds: 2.25 })).toBe(2250)
    expect(getReturnCents({ status: "lost", stakeCents: 1000, decimalOdds: 2.25 })).toBe(0)
    expect(getReturnCents({ status: "void", stakeCents: 1000, decimalOdds: 2.25 })).toBe(1000)
    expect(getProfitCents({ status: "cashed_out", stakeCents: 1000, decimalOdds: 2.25, returnCents: 700 })).toBe(-300)
  })

  it("subtracts pending exposure from available balance", () => {
    expect(getAvailableBankrollCents(seedState.bets, seedState.transactions)).toBe(1_223_000)
  })

  it("returns guardrail warnings without blocking the candidate", () => {
    const warnings = evaluateCandidate({ placedAt: "2026-07-31T12:00:00Z", sport: "Soccer", stakeCents: 50_000 }, seedState.bets, seedState.transactions, seedState.settings)
    expect(warnings.map((warning) => warning.code)).toContain("stake")
    expect(warnings[0].ratio).toBeGreaterThan(1)
  })

  it("normalizes duplicate fingerprints", () => {
    const base = seedState.bets[0]
    const changed = { ...base, event: "  ARSENAL   vs Brighton ", bookmaker: " sportsbook " }
    expect(duplicateFingerprint(base)).toBe(duplicateFingerprint(changed))
  })

  it("filters placement dates inclusively", () => {
    const bets = seedState.bets as Bet[]
    const filtered = filterBetsByDate(bets, "2026-07-23T00:00:00Z", "2026-07-24T23:59:59Z")
    expect(filtered.map((bet) => bet.id)).toEqual(["b9", "b10"])
  })
})
