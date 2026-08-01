import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.clear()); await page.goto("/") })

test("adds and settles a bet, updating the journal", async ({ page, isMobile }) => {
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible()
  await page.getByRole("button", { name: "Add bet" }).click()
  await page.getByLabel("Event").fill("Australia vs Japan")
  await page.getByLabel("Market").fill("Match result")
  await page.getByLabel("Selection").fill("Australia")
  await page.getByLabel("Decimal odds").fill("1.80")
  await page.getByLabel("Stake (AUD)").fill("20")
  await page.getByRole("button", { name: "Save bet" }).click()
  await expect(page.getByText("Bet saved to your journal")).toBeVisible()
  if (isMobile) await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await page.getByRole("link", { name: "Bets" }).click()
  await expect(page.getByText("Australia vs Japan")).toBeVisible()
})

test("navigates all desktop routes and opens screenshot import", async ({ page, isMobile }) => {
  test.skip(isMobile)
  for (const route of ["Bets", "Insights", "Bankroll", "Import", "Settings"]) {
    await page.getByRole("link", { name: route }).click()
    await expect(page.getByRole("heading", { name: route === "Import" ? "Import bet history" : route })).toBeVisible()
  }
})

test("mobile navigation exposes every route", async ({ page, isMobile }) => {
  test.skip(!isMobile)
  await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await page.getByRole("link", { name: "Import" }).click()
  await expect(page.getByRole("heading", { name: "Import bet history" })).toBeVisible()
})

test("selects a PDF statement for review without uploading it", async ({ page, isMobile }) => {
  if (isMobile) await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await page.getByRole("link", { name: "Import" }).click()
  await page.getByRole("tab", { name: "PDF statement" }).click()
  await page.locator('input[type="file"][accept=".pdf,application/pdf"]').setInputFiles({ name: "june.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 sample") })
  await expect(page.getByText("june.pdf")).toBeVisible()
  await expect(page.getByText("Nothing is sent until you explicitly confirm", { exact: false })).toBeVisible()
})

test("preselects a ready extracted bet when only an optional field is missing", async ({ page, isMobile }) => {
  await page.route("**/api/import/bet365/extract", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        layout: "statement",
        warnings: [],
        bets: [{
          externalBetId: null,
          placedAt: "2026-06-23T12:57:00.000Z",
          sport: "Soccer",
          event: "Jordan v Algeria",
          market: "Both Teams to Score",
          selection: "Yes",
          decimalOdds: 2.75,
          stakeAud: 100,
          bookmaker: "bet365",
          status: "won",
          returnAud: 275,
          settledAt: "2026-06-23T14:31:00.000Z",
          notes: null,
          sourceImageIndex: 18,
          sourceEvidence: "Page 19: $100 stake and $275 return.",
          missingFields: ["externalBetId"],
          unsupportedReason: null,
        }],
      }),
    })
  })
  if (isMobile) await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await page.getByRole("link", { name: "Import" }).click()
  await page.getByRole("tab", { name: "PDF statement" }).click()
  await page.locator('input[type="file"][accept=".pdf,application/pdf"]').setInputFiles({ name: "june.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 sample") })
  await page.getByRole("button", { name: "Review with AI" }).click()
  await page.getByRole("button", { name: "Confirm and extract" }).click()
  await expect(page.getByText("1 selected of 1")).toBeVisible()
  await expect(page.getByRole("button", { name: "Clear selection" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Import selected bets" })).toBeEnabled()
})

test("resolves an unmatched statement stake as a lost bet", async ({ page, isMobile }) => {
  await page.route("**/api/import/bet365/extract", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        layout: "statement",
        warnings: [],
        bets: [{
          externalBetId: null,
          placedAt: "2026-06-28T03:09:55.000Z",
          sport: "MMA",
          event: "Asu Almabayev v Charles Johnson",
          market: "Line",
          selection: "Charles Johnson +3.5",
          decimalOdds: 1.95,
          stakeAud: 50,
          bookmaker: "bet365",
          status: "unsupported",
          returnAud: null,
          settledAt: null,
          notes: null,
          sourceImageIndex: 6,
          sourceEvidence: "Page 7: unmatched $50 cash stake.",
          missingFields: ["status"],
          unsupportedReason: "Negative stake row has no explicit settlement or payout; it could be a loss or unsettled bet.",
        }],
      }),
    })
  })
  if (isMobile) await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await page.getByRole("link", { name: "Import" }).click()
  await page.getByRole("tab", { name: "PDF statement" }).click()
  await page.locator('input[type="file"][accept=".pdf,application/pdf"]').setInputFiles({ name: "june.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 sample") })
  await page.getByRole("button", { name: "Review with AI" }).click()
  await page.getByRole("button", { name: "Confirm and extract" }).click()
  await expect(page.getByText("0 selected of 1")).toBeVisible()
  await page.getByRole("button", { name: "Mark as lost" }).click()
  await expect(page.getByText("1 selected of 1")).toBeVisible()
  await expect(page.getByText("Ready", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Import selected bets" })).toBeEnabled()
})

test("selects and clears all importable candidates", async ({ page, isMobile }) => {
  if (isMobile) await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await page.getByRole("link", { name: "Import" }).click()
  await page.getByRole("tab", { name: "CSV file" }).click()
  const csv = [
    "placed_at,sport,event,market,selection,decimal_odds,stake_aud,bookmaker,status,return_aud,settled_at,external_bet_id,notes",
    "2026-07-31T10:00:00Z,Soccer,Australia vs Japan,Match result,Australia,1.80,20.00,bet365,pending,,,,",
    "2026-07-31T11:00:00Z,Tennis,Player A vs Player B,Match winner,Player A,2.10,15.00,bet365,pending,,,,",
  ].join("\n")
  await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles({ name: "bets.csv", mimeType: "text/csv", buffer: Buffer.from(csv) })
  await expect(page.getByText("2 selected of 2")).toBeVisible()
  await page.getByLabel("Select candidate 1").uncheck()
  await expect(page.getByText("1 selected of 2")).toBeVisible()
  await page.getByRole("button", { name: "Select all new records" }).click()
  await expect(page.getByText("2 selected of 2")).toBeVisible()
  await page.getByRole("button", { name: "Clear selection" }).click()
  await expect(page.getByText("0 selected of 2")).toBeVisible()
})
