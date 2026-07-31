import { describe, expect, it } from "vitest"
import { exportBetsCsv, parseBetCsv } from "./csv"
import { seedState } from "./seed"

const header = "placed_at,sport,event,market,selection,decimal_odds,stake_aud,bookmaker,status,return_aud,settled_at,external_bet_id,notes"

describe("CSV import and export", () => {
  it("parses quoted canonical rows", () => {
    const csv = `${header}\n2026-07-20,Soccer,"City, FC vs United",Moneyline,City FC,1.91,25.50,bet365,won,48.71,2026-07-20,B365-1,"Value, not certainty"`
    const result = parseBetCsv(csv, [])
    expect(result.errors).toEqual([])
    expect(result.candidates[0].draft.event).toBe("City, FC vs United")
    expect(result.candidates[0].draft.stakeCents).toBe(2550)
  })

  it("accepts known bet365 aliases", () => {
    const csv = "Placed Date,Category,Event Name,Bet Type,Pick,Price,Bet Amount,Result,Returns,Bet Number\n2026-07-20,Soccer,A v B,Moneyline,A,1.90,10,Won,19,B123"
    const result = parseBetCsv(csv, [])
    expect(result.errors).toEqual([])
    expect(result.candidates[0].draft.bookmaker).toBe("bet365")
    expect(result.candidates[0].draft.externalBetId).toBe("B123")
  })

  it("fails safely on unknown headers", () => {
    const result = parseBetCsv("foo,bar\n1,2", [])
    expect(result.candidates).toEqual([])
    expect(result.errors[0]).toContain("Unknown CSV layout")
  })

  it("keeps valid and invalid rows for review", () => {
    const csv = `${header}\n2026-07-20,Soccer,A v B,Moneyline,A,1.90,10,bet365,pending,,,,\nbad-date,,C v D,,C,1.00,0,bet365,unknown,,,,`
    const result = parseBetCsv(csv, [])
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0].issues).toHaveLength(0)
    expect(result.candidates[1].issues.length).toBeGreaterThan(3)
  })

  it("requires a decision for fingerprint duplicates", () => {
    const existing = seedState.bets[0]
    const csv = `${header}\n${existing.placedAt},${existing.sport},${existing.event},${existing.market},${existing.selection},${existing.decimalOdds},${existing.stakeCents / 100},${existing.bookmaker},${existing.status},,,,`
    const result = parseBetCsv(csv, [existing])
    expect(result.candidates[0].duplicateBetIds).toEqual([existing.id])
    expect(result.candidates[0].duplicateDecision).toBe("review")
    expect(result.candidates[0].selected).toBe(false)
  })

  it("round-trips exported data", () => {
    const csv = exportBetsCsv(seedState.bets.slice(0, 2))
    const result = parseBetCsv(csv, [])
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0].draft.selection).toBe(seedState.bets[0].selection)
  })
})
