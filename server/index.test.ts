// @vitest-environment node
import request from "supertest"
import { describe, expect, it, vi } from "vitest"
import { createApp, enforceExtractionSafety } from "./index.ts"

const validResult = { layout: "receipt" as const, warnings: [], bets: [{ externalBetId: "B1", placedAt: "2026-07-20T10:00:00Z", sport: "Soccer", event: "A v B", market: "Moneyline", selection: "A", decimalOdds: 1.9, stakeAud: 10, bookmaker: "bet365" as const, status: "won" as const, returnAud: 19, settledAt: "2026-07-20T12:00:00Z", notes: null, sourceImageIndex: 0, sourceEvidence: "Receipt fields visible", missingFields: [], unsupportedReason: null }] }
const headers = { Origin: "http://127.0.0.1:5173", "Sec-Fetch-Site": "same-origin", "X-Bet2Win-Request": "screenshot-import" }

describe("screenshot extraction endpoint", () => {
  it("returns validated mocked OpenAI output", async () => {
    const client = { responses: { parse: vi.fn().mockResolvedValue({ output_parsed: validResult }) } }
    const response = await request(createApp(client as never)).post("/api/import/bet365/extract").set(headers).attach("images", Buffer.from("image"), { filename: "receipt.png", contentType: "image/png" })
    expect(response.status).toBe(200)
    expect(response.body.bets[0].externalBetId).toBe("B1")
  })

  it("rejects malformed structured output", async () => {
    const client = { responses: { parse: vi.fn().mockResolvedValue({ output_parsed: { layout: "receipt", bets: "bad", warnings: [] } }) } }
    const response = await request(createApp(client as never)).post("/api/import/bet365/extract").set(headers).attach("images", Buffer.from("image"), { filename: "receipt.png", contentType: "image/png" })
    expect(response.status).toBe(422)
  })

  it("returns a safe timeout response", async () => {
    const client = { responses: { parse: vi.fn().mockImplementation((_input, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted"))))) } }
    const response = await request(createApp(client as never, 5)).post("/api/import/bet365/extract").set(headers).attach("images", Buffer.from("image"), { filename: "receipt.png", contentType: "image/png" })
    expect(response.status).toBe(504)
    expect(response.body.error).toContain("timed out")
  })

  it("rejects cross-origin and invalid uploads", async () => {
    const app = createApp({ responses: { parse: vi.fn() } } as never)
    expect((await request(app).post("/api/import/bet365/extract").set({ ...headers, Origin: "https://example.com" })).status).toBe(403)
    expect((await request(app).post("/api/import/bet365/extract").set(headers).attach("images", Buffer.from("text"), { filename: "receipt.txt", contentType: "text/plain" })).status).toBe(400)
  })

  it("rate-limits repeated requests", async () => {
    const app = createApp({ responses: { parse: vi.fn() } } as never)
    for (let index = 0; index < 6; index++) await request(app).post("/api/import/bet365/extract").set(headers)
    const response = await request(app).post("/api/import/bet365/extract").set(headers)
    expect(response.status).toBe(429)
  })

  it("flags missing cash-out returns and keeps unsupported bets unsupported", () => {
    const result = enforceExtractionSafety({ ...validResult, bets: [{ ...validResult.bets[0], status: "cashed_out", returnAud: null, missingFields: [] }, { ...validResult.bets[0], status: "unsupported", unsupportedReason: "Multi bet" }] })
    expect(result.bets[0].missingFields).toContain("returnAud")
    expect(result.bets[1].status).toBe("unsupported")
  })
})
