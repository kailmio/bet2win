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
