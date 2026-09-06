#!/usr/bin/env node
/**
 * Interactive QA for the Strategy Tester desk tab. Dev server on :8080:
 *
 *   node scripts/qa-tester.mjs
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

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForTimeout(3500); // synthetic seed + first backtest

// Open the Tester tab
await page.getByRole("button", { name: "Tester", exact: true }).click();
await page.waitForTimeout(800);
out.checks.testerHeader = (await page.getByText("Strategy Tester").count()) > 0;
out.checks.heroCards = (await page.getByText("Net profit", { exact: true }).count()) > 0;

// Trades sub-tab
await page.getByRole("button", { name: "Danh sách lệnh" }).click();
await page.waitForTimeout(500);
out.checks.tradeRows = await page.locator("table tbody tr").count();

// Optimizer sub-tab: run a small grid
await page.getByRole("button", { name: "Tối ưu", exact: true }).click();
await page.waitForTimeout(400);
// Synthetic sample is small — relax the min-trades guard for the QA sweep.
await page.locator('input[type="number"]').first().fill("1");
await page.getByRole("button", { name: "Chạy tối ưu" }).click();
await page.waitForTimeout(6000);
out.checks.gridCombos = await page.locator("table tbody tr").count();
out.checks.applyBestVisible = (await page.getByRole("button", { name: "Áp dụng combo tốt nhất" }).count()) > 0;
await page.screenshot({ path: "screenshots/qa-tester-optimize.png" });

// Monte Carlo sub-tab
await page.getByRole("button", { name: "Monte Carlo", exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Chạy 500 đường vốn" }).click();
await page.waitForTimeout(4000);
out.checks.mcCards = (await page.getByText("Max DD — p95 (xấu)").count()) > 0;
await page.screenshot({ path: "screenshots/qa-tester-mc.png" });

// Inputs dialog: change TP1 (R) then apply → backtest reruns
await page.getByRole("button", { name: "Inputs", exact: true }).click();
await page.waitForTimeout(400);
out.checks.inputsDialog = (await page.getByText("Inputs — tham số chiến lược").count()) > 0;
const tp1 = page.locator('input[type="number"]').first();
await tp1.fill("2.5");
await page.getByRole("button", { name: "Áp dụng & chạy lại" }).click();
await page.waitForTimeout(3000);
out.checks.rerunOk = (await page.getByText("Strategy Tester").count()) > 0 && consoleErrors.length === 0;
await page.screenshot({ path: "screenshots/qa-tester-overview.png" });

await browser.close();
out.ok =
  out.checks.testerHeader &&
  out.checks.heroCards &&
  out.checks.tradeRows > 0 &&
  out.checks.gridCombos > 0 &&
  out.checks.applyBestVisible &&
  out.checks.mcCards &&
  out.checks.inputsDialog &&
  out.checks.rerunOk &&
  consoleErrors.length === 0;
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
