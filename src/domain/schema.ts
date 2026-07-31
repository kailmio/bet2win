import { z } from "zod"

export const betStatusSchema = z.enum(["pending", "won", "lost", "void", "cashed_out"])

export const betSchema = z.object({
  id: z.string().min(1),
  placedAt: z.string().min(1),
  sport: z.string().min(1),
  event: z.string().min(1),
  market: z.string().min(1),
  selection: z.string().min(1),
  decimalOdds: z.number().gt(1),
  stakeCents: z.number().int().positive(),
  bookmaker: z.string().min(1),
  status: betStatusSchema,
  returnCents: z.number().int().nonnegative().optional(),
  settledAt: z.string().optional(),
  notes: z.string().optional(),
  source: z.enum(["manual", "bet2win_csv", "bet365_csv", "bet365_screenshot"]),
  externalBetId: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

export const transactionSchema = z.object({
  id: z.string().min(1),
  effectiveAt: z.string().min(1),
  type: z.enum(["opening", "deposit", "withdrawal", "adjustment"]),
  amountCents: z.number().int(),
  memo: z.string().optional(),
  createdAt: z.string().min(1),
})

export const settingsSchema = z.object({
  currency: z.literal("AUD"),
  oddsFormat: z.literal("decimal"),
  guardrails: z.object({
    maxStakePct: z.number().positive().max(100),
    maxDailyExposurePct: z.number().positive().max(100),
    maxSportExposurePct: z.number().positive().max(100),
    drawdownWarningPct: z.number().positive().max(100),
  }),
})

export const appStateSchema = z.object({
  schemaVersion: z.literal(1),
  bets: z.array(betSchema),
  transactions: z.array(transactionSchema),
  settings: settingsSchema,
})

export const extractionBetSchema = z.object({
  externalBetId: z.string().nullable(),
  placedAt: z.string().nullable(),
  sport: z.string().nullable(),
  event: z.string().nullable(),
  market: z.string().nullable(),
  selection: z.string().nullable(),
  decimalOdds: z.number().nullable(),
  stakeAud: z.number().nullable(),
  bookmaker: z.literal("bet365"),
  status: z.enum(["pending", "won", "lost", "void", "cashed_out", "unsupported"]),
  returnAud: z.number().nullable(),
  settledAt: z.string().nullable(),
  notes: z.string().nullable(),
  sourceImageIndex: z.number().int().nonnegative(),
  sourceEvidence: z.string(),
  missingFields: z.array(z.string()),
  unsupportedReason: z.string().nullable(),
})

export const extractionResponseSchema = z.object({
  layout: z.enum(["receipt", "history_list", "mixed", "unknown"]),
  bets: z.array(extractionBetSchema),
  warnings: z.array(z.string()),
})

export type ExtractionResponse = z.infer<typeof extractionResponseSchema>
