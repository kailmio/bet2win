import "dotenv/config"
import path from "node:path"
import { fileURLToPath } from "node:url"
import express, { type Request, type Response } from "express"
import rateLimit from "express-rate-limit"
import multer from "multer"
import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import { extractionResponseSchema } from "../src/domain/schema.ts"
import type { ExtractionResponse } from "../src/domain/schema.ts"

const PORT = Number(process.env.PORT ?? 8787)
const HOST = "127.0.0.1"
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_PDF_BYTES = 20 * 1024 * 1024
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"])
const PDF_MIME = "application/pdf"
const ALLOWED_MIMES = new Set([...IMAGE_MIMES, PDF_MIME])
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 8, fileSize: MAX_PDF_BYTES, fields: 0 },
  fileFilter: (_request, file, callback) => callback(null, ALLOWED_MIMES.has(file.mimetype)),
})

function isLocalOrigin(value?: string) {
  if (!value) return false
  try { const url = new URL(value); return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol) }
  catch { return false }
}

const extractionPrompt = `You extract bet365 bet history from user-confirmed screenshots or monthly activity statement PDFs for a private betting journal.
Return only the requested structured data. Identify either an individual receipt, a multi-row history list, a statement, mixed images, or unknown layout.
Extract each supported single bet separately. For screenshots, sourceImageIndex is the zero-based image index. For PDFs, it is the zero-based source page index and sourceEvidence must include the human-readable page number. Preserve visible bet IDs.
Never guess an unclear field: return null and list the field in missingFields. sourceEvidence must be a short description of visible evidence, not a transcript.
Dates must be ISO-8601 when visible. Currency values are AUD numbers. Odds are decimal.
Parlays, multis, bet builders, and unsupported settlement types must use status unsupported with unsupportedReason. Never convert them into single bets.
For cash-outs, returnAud must be the actual visible cash-out return or null and include returnAud in missingFields.
For monthly statements, ignore summary pages, deposits, withdrawals, adjustments, balances, safer-gambling pages, and payout-only rows without a stake. Treat each transaction-table row as one wager: a row containing multiple Stake descriptions is a multi and must remain unsupported. Convert clearly printed fractional odds to decimal odds by adding one (for example 4/5 becomes 1.80 and 10/1 becomes 11.00). Use the absolute Stake amount as stakeAud and Pay Out as returnAud. Bet Credit Stake rows are unsupported because promotional stakes have different bankroll economics. Match Return rows to Stake rows using event, market, selection, odds, amount, and chronology; statement tables may be reverse chronological. For a single cash Stake row with no matching Return, Pay Out, void, cash-out, reversal, or refund anywhere in the statement, classify it as lost with returnAud 0 when later statement activity or settled wagers from the same event prove the wager had time to settle. settledAt may be null when the exact settlement time is not printed. Keep it pending only when the statement explicitly shows it is open or the event clearly occurs after the statement period. If neither loss nor pending is supported by the full statement chronology, use unsupported with an ambiguity reason.
Bookmaker is always bet365. Do not include account names, balances, addresses, or unrelated personal information.`

export function enforceExtractionSafety(result: ExtractionResponse): ExtractionResponse {
  const warnings = [...result.warnings]
  const bets = result.bets.map((bet) => {
    if (bet.status === "cashed_out" && bet.returnAud === null && !bet.missingFields.includes("returnAud")) {
      if (!warnings.includes("At least one cash-out is missing its actual return.")) warnings.push("At least one cash-out is missing its actual return.")
      return { ...bet, missingFields: [...bet.missingFields, "returnAud"] }
    }
    return bet
  })
  return { ...result, bets, warnings }
}

export function createApp(client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : undefined, requestTimeoutMs = 120_000): express.Express {
  const app = express()
  app.disable("x-powered-by")
  app.use(express.json({ limit: "32kb" }))
  const limiter = rateLimit({ windowMs: 60_000, limit: 6, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many extraction requests. Wait a minute and retry." } })

  app.post("/api/import/bet365/extract", limiter, (request: Request, response: Response, next) => {
    const origin = request.get("origin")
    const fetchSite = request.get("sec-fetch-site")
    if (!isLocalOrigin(origin) || (fetchSite && !["same-origin", "same-site"].includes(fetchSite))) return response.status(403).json({ error: "Only same-origin local requests are allowed." })
    if (!["screenshot-import", "pdf-import"].includes(request.get("x-bet2win-request") ?? "")) return response.status(403).json({ error: "Missing import request marker." })
    upload.fields([{ name: "images", maxCount: 8 }, { name: "document", maxCount: 1 }])(request, response, next)
  }, async (request: Request, response: Response) => {
    const fields = request.files && !Array.isArray(request.files) ? request.files : {}
    const images = fields.images ?? []
    const documents = fields.document ?? []
    const files = [...images, ...documents]
    const rejectUpload = (status: number, error: string) => {
      for (const file of files) file.buffer.fill(0)
      return response.status(status).json({ error })
    }
    if (!files.length) return response.status(400).json({ error: "Choose at least one PNG, JPEG, or WebP image, or one PDF statement." })
    if (images.length && documents.length) return rejectUpload(400, "Upload screenshots or a PDF statement, not both in one request.")
    if (images.some((file) => !IMAGE_MIMES.has(file.mimetype))) return rejectUpload(415, "Unsupported image type.")
    if (images.some((file) => file.size > MAX_IMAGE_BYTES)) return rejectUpload(413, "Each image must be 10 MB or smaller.")
    if (documents.some((file) => file.mimetype !== PDF_MIME)) return rejectUpload(415, "Only PDF statements are supported.")
    const document = documents[0]
    if (!client) return rejectUpload(503, "OPENAI_API_KEY is not configured on the local server.")
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const sourceContent = document
        ? [{ type: "input_file" as const, filename: "bet365-statement.pdf", file_data: `data:${PDF_MIME};base64,${document.buffer.toString("base64")}`, detail: "low" as const }]
        : images.map((file) => ({ type: "input_image" as const, image_url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`, detail: "original" as const }))
      const completion = await client.responses.parse({
        model: "gpt-5.6-terra",
        reasoning: { effort: "low" },
        store: false,
        input: [{ role: "user", content: [{ type: "input_text", text: extractionPrompt }, ...sourceContent] }],
        text: { format: zodTextFormat(extractionResponseSchema, "bet365_history") },
      }, { signal: controller.signal })
      if (!completion.output_parsed) return response.status(422).json({ error: "The uploaded history could not be converted into reviewable records." })
      const validated = extractionResponseSchema.safeParse(completion.output_parsed)
      if (!validated.success) return response.status(422).json({ error: "The extraction response did not match the required structure." })
      return response.json(enforceExtractionSafety(validated.data))
    } catch (error) {
      if (controller.signal.aborted) return response.status(504).json({ error: "Extraction timed out. Your browser batch is still available to retry." })
      const status = error instanceof OpenAI.APIError && error.status && error.status >= 400 && error.status < 600 ? 502 : 500
      return response.status(status).json({ error: "History extraction failed. Retry or enter the bets manually." })
    } finally {
      clearTimeout(timeout)
      for (const file of files) file.buffer.fill(0)
    }
  })

  app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
    void _next
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return response.status(413).json({ error: "PDF statements must be 20 MB or smaller." })
    if (error instanceof multer.MulterError) return response.status(400).json({ error: "Invalid history upload." })
    return response.status(500).json({ error: "The local service could not process this request." })
  })

  if (process.env.NODE_ENV === "production") {
    const dist = path.resolve(__dirname, "../dist")
    app.use(express.static(dist))
    app.get("*path", (_request, response) => response.sendFile(path.join(dist, "index.html")))
  }
  return app
}

const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false
if (isDirectRun) createApp().listen(PORT, HOST)
