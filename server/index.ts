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
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"])
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 8, fileSize: MAX_IMAGE_BYTES, fields: 0 },
  fileFilter: (_request, file, callback) => callback(null, ALLOWED_MIMES.has(file.mimetype)),
})

function isLocalOrigin(value?: string) {
  if (!value) return false
  try { const url = new URL(value); return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol) }
  catch { return false }
}

const extractionPrompt = `You extract bet365 bet history from user-confirmed screenshots for a private betting journal.
Return only the requested structured data. Identify either an individual receipt, a multi-row history list, mixed images, or unknown layout.
Extract each single bet separately and use sourceImageIndex starting at zero. Preserve visible bet IDs.
Never guess an unclear field: return null and list the field in missingFields. sourceEvidence must be a short description of visible evidence, not a transcript.
Dates must be ISO-8601 when visible. Currency values are AUD numbers. Odds are decimal.
Parlays, multis, bet builders, and unsupported settlement types must use status unsupported with unsupportedReason. Never convert them into single bets.
For cash-outs, returnAud must be the actual visible cash-out return or null and include returnAud in missingFields.
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

export function createApp(client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : undefined, requestTimeoutMs = 45_000): express.Express {
  const app = express()
  app.disable("x-powered-by")
  app.use(express.json({ limit: "32kb" }))
  const limiter = rateLimit({ windowMs: 60_000, limit: 6, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many extraction requests. Wait a minute and retry." } })

  app.post("/api/import/bet365/extract", limiter, (request: Request, response: Response, next) => {
    const origin = request.get("origin")
    const fetchSite = request.get("sec-fetch-site")
    if (!isLocalOrigin(origin) || (fetchSite && !["same-origin", "same-site"].includes(fetchSite))) return response.status(403).json({ error: "Only same-origin local requests are allowed." })
    if (request.get("x-bet2win-request") !== "screenshot-import") return response.status(403).json({ error: "Missing import request marker." })
    upload.array("images", 8)(request, response, next)
  }, async (request: Request, response: Response) => {
    const files = (request.files as Express.Multer.File[] | undefined) ?? []
    if (!files.length) return response.status(400).json({ error: "Choose at least one PNG, JPEG, or WebP image." })
    if (files.some((file) => !ALLOWED_MIMES.has(file.mimetype))) return response.status(415).json({ error: "Unsupported image type." })
    if (!client) return response.status(503).json({ error: "OPENAI_API_KEY is not configured on the local server." })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const imageContent = files.map((file) => ({ type: "input_image" as const, image_url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`, detail: "original" as const }))
      const completion = await client.responses.parse({
        model: "gpt-5.6-terra",
        reasoning: { effort: "low" },
        store: false,
        input: [{ role: "user", content: [{ type: "input_text", text: extractionPrompt }, ...imageContent] }],
        text: { format: zodTextFormat(extractionResponseSchema, "bet365_history") },
      }, { signal: controller.signal })
      if (!completion.output_parsed) return response.status(422).json({ error: "The screenshots could not be converted into reviewable records." })
      const validated = extractionResponseSchema.safeParse(completion.output_parsed)
      if (!validated.success) return response.status(422).json({ error: "The extraction response did not match the required structure." })
      return response.json(enforceExtractionSafety(validated.data))
    } catch (error) {
      if (controller.signal.aborted) return response.status(504).json({ error: "Extraction timed out. Your browser batch is still available to retry." })
      const status = error instanceof OpenAI.APIError && error.status && error.status >= 400 && error.status < 600 ? 502 : 500
      return response.status(status).json({ error: "Screenshot extraction failed. Retry or enter the bets manually." })
    } finally {
      clearTimeout(timeout)
      for (const file of files) file.buffer.fill(0)
    }
  })

  app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
    void _next
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return response.status(413).json({ error: "Each image must be 10 MB or smaller." })
    if (error instanceof multer.MulterError) return response.status(400).json({ error: "Invalid screenshot upload." })
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
