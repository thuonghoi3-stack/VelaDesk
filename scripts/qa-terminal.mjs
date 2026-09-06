#!/usr/bin/env node
/**
 * Interactive QA for the terminal pages (/chart, /screener). Run with the dev
 * server up on 127.0.0.1:8080:
 *
 *   node scripts/qa-terminal.mjs
 *
 * Prints a JSON verdict and saves screenshots under screenshots/qa-*.png.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:8080";
mkdirSync("screenshots", { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error" && !/grok\.com/.test(m.location()?.url ?? "")) consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e?.message ?? e)));

const out = { checks: {}, consoleErrors };

// --- /chart ---
await page.goto(`${BASE}/chart`, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.locator("canvas").first().waitFor({ state: "attached", timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(4000); // data load + chart build
out.checks.chartCanvases = await page.locator("canvas").count();
out.checks.watchlistRows = await page.locator("aside ul li button").count();
out.checks.legendShowsOHLC = (await page.getByText(/O \d/).count()) > 0;

// Toggle MACD pane on (default off)
const before = await page.locator("canvas").count();
await page.getByRole("button", { name: "MACD", exact: true }).click();
await page.waitForTimeout(1200);
out.checks.macdPaneAddsCanvases = (await page.locator("canvas").count()) > before;

// Create an alert by clicking the chart in alert mode
await page.getByRole("button", { name: "Alert", exact: true }).click();
await page.waitForTimeout(300);
const canvasBox = await page.locator("canvas").first().boundingBox();
if (canvasBox) {
  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height * 0.35);
  await page.waitForTimeout(600);
}
out.checks.alertCreated = (await page.locator("aside", { hasText: "Alerts" }).getByText(/· đã chạm|· nh/).count()) > 0
  || (await page.locator("text=/Alert BTC\\/USDT [≥≤]/").count()) > 0
  || (await page.getByText(/nhập tay|vẽ từ chart/).count()) > 0;
await page.screenshot({ path: "screenshots/qa-chart.png" });

// --- /screener ---
await page.goto(`${BASE}/screener`, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForTimeout(9000); // scan of 14 symbols
out.checks.screenerRows = await page.locator("tbody tr").count();
out.checks.screenerHasLinks = (await page.locator('tbody a[href*="/chart"]').count()) > 0;
await page.screenshot({ path: "screenshots/qa-screener.png" });

await browser.close();
out.ok =
  out.checks.chartCanvases > 0 &&
  out.checks.watchlistRows >= 10 &&
  out.checks.legendShowsOHLC &&
  out.checks.macdPaneAddsCanvases &&
  out.checks.alertCreated &&
  out.checks.screenerRows > 0 &&
  out.checks.screenerHasLinks &&
  consoleErrors.length === 0;
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
