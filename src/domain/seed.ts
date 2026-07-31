import type { AppState, Bet, BetStatus } from "./types"

const now = "2026-07-31T12:00:00.000Z"

function bet(
  id: string,
  placedAt: string,
  sport: string,
  event: string,
  market: string,
  selection: string,
  decimalOdds: number,
  stakeCents: number,
  status: BetStatus,
  returnCents?: number,
): Bet {
  return {
    id,
    placedAt,
    sport,
    event,
    market,
    selection,
    decimalOdds,
    stakeCents,
    bookmaker: "Sportsbook",
    status,
    returnCents,
    settledAt: status === "pending" ? undefined : placedAt,
    source: "manual",
    createdAt: now,
    updatedAt: now,
  }
}

export const seedState: AppState = {
  schemaVersion: 1,
  transactions: [
    {
      id: "txn-opening",
      effectiveAt: "2026-05-01T09:00:00.000Z",
      type: "opening",
      amountCents: 1_153_350,
      memo: "Opening bankroll",
      createdAt: now,
    },
  ],
  settings: {
    currency: "AUD",
    oddsFormat: "decimal",
    guardrails: {
      maxStakePct: 2,
      maxDailyExposurePct: 10,
      maxSportExposurePct: 42,
      drawdownWarningPct: 10,
    },
  },
  bets: [
    bet("b1", "2026-05-04T09:00:00.000Z", "Soccer", "Arsenal vs Brighton", "Match result", "Arsenal", 1.4, 200_000, "won"),
    bet("b2", "2026-05-10T09:00:00.000Z", "Basketball", "Boston vs New York", "Moneyline", "Boston", 1.8, 100_000, "lost"),
    bet("b3", "2026-05-17T09:00:00.000Z", "Baseball", "New York vs Seattle", "Moneyline", "New York", 1.4, 220_000, "won"),
    bet("b4", "2026-05-24T09:00:00.000Z", "Hockey", "Edmonton vs Dallas", "Moneyline", "Edmonton", 1.95, 100_000, "lost"),
    bet("b5", "2026-06-02T09:00:00.000Z", "Soccer", "Spain vs France", "Match result", "Spain", 1.4, 250_000, "won"),
    bet("b6", "2026-06-10T09:00:00.000Z", "Basketball", "Dallas vs Minnesota", "Spread", "Dallas -3.5", 1.9, 100_000, "lost"),
    bet("b7", "2026-06-18T09:00:00.000Z", "Soccer", "Inter Milan vs Atalanta", "Match result", "Inter Milan", 1.64, 202_400, "won", 332_660),
    bet("b8", "2026-07-21T09:00:00.000Z", "Soccer", "Inter Milan vs Atalanta", "Match result", "Inter Milan", 2.1, 10_000, "won"),
    bet("b9", "2026-07-23T09:00:00.000Z", "Hockey", "Colorado vs Edmonton", "Over 5.5 goals", "Over 5.5", 1.95, 16_000, "lost"),
    bet("b10", "2026-07-24T09:00:00.000Z", "Baseball", "Yankees vs Red Sox", "Moneyline", "Yankees", 1.72, 12_000, "won"),
    bet("b11", "2026-07-26T09:00:00.000Z", "Basketball", "Dallas vs Minnesota", "Spread", "Dallas -2.5", 1.9, 20_000, "lost"),
    bet("b12", "2026-07-27T09:00:00.000Z", "Soccer", "Manchester City vs Tottenham", "Over 2.5 goals", "Over 2.5", 1.85, 15_000, "won"),
    bet("b13", "2026-07-31T08:00:00.000Z", "Soccer", "Arsenal vs Chelsea", "Match result", "Arsenal", 1.85, 15_000, "pending"),
    bet("b14", "2026-07-31T10:00:00.000Z", "Basketball", "Melbourne vs Sydney", "Spread", "Melbourne -4.5", 1.91, 10_000, "pending"),
  ],
}
