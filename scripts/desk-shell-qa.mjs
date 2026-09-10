import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.VELA_QA_URL || "http://127.0.0.1:8080/";
const artifacts = ".hermes/artifacts/workspace-refinement";
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const checks = [],
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(url, { waitUntil: "networkidle" });
  const toggle = page.getByRole("button", { name: "Thiết lập thực thi", exact: true });
  assert.equal(
    await toggle.count(),
    1,
    "Execution settings must have an accessible disclosure button",
  );
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  await toggle.focus();
  await page.keyboard.press("Enter");
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  const region = page.locator(`#${await toggle.getAttribute("aria-controls")}`);
  assert.ok(await region.isVisible());
  const risk = region.getByRole("combobox", { name: "Risk", exact: true });
  await risk.selectOption("0.01");
  await toggle.click();
  assert.ok(!(await region.isVisible()));
  await toggle.focus();
  await page.keyboard.press("Space");
  assert.equal(await risk.inputValue(), "0.01");
  checks.push(
    "Keyboard disclosure, aria state, hidden content, and config retained across close/open",
  );
  for (const label of [
    "Symbol",
    "LTF",
    "HTF",
    "Chiến lược",
    "Thị trường",
    "Chiều",
    "Risk",
    "Đòn bẩy",
  ]) {
    const select = page
      .locator(".desk-controls")
      .getByRole("combobox", { name: label, exact: true });
    assert.equal(await select.count(), 1, `${label} is uniquely labelled`);
    const previous = await select.inputValue();
    const alternative = await select
      .locator("option")
      .evaluateAll((options, value) => options.find((o) => o.value !== value)?.value, previous);
    await select.selectOption(alternative);
    assert.equal(await select.inputValue(), alternative);
    await select.selectOption(previous);
  }
  const volatility = region.getByLabel("ATR cực đoan", { exact: true });
  const checked = await volatility.isChecked();
  await volatility.setChecked(!checked);
  assert.equal(await volatility.isChecked(), !checked);
  await volatility.setChecked(checked);
  await page.getByRole("button", { name: "Mô phỏng", exact: true }).click();
  assert.ok(await page.getByRole("button", { name: "Tải nến", exact: true }).isEnabled());
  checks.push(
    "All original labelled config controls update; simulation and live actions remain available",
  );
  const deskNav = page.getByRole("navigation", { name: "Mục desk" });
  await deskNav.getByRole("button", { name: "Tester", exact: true }).click();
  const testerHeading = page.locator("main").getByRole("heading").first();
  await testerHeading.evaluate((node) => {
    node.dataset.shellRetentionProbe = "retained";
  });
  await deskNav.getByRole("button", { name: "Replay", exact: true }).click();
  assert.ok(
    !(await page.locator("[data-shell-retention-probe]").isVisible()),
    "Tester must be hidden while replay is active",
  );
  await deskNav.getByRole("button", { name: "Tester", exact: true }).click();
  assert.equal(
    await page.locator('[data-shell-retention-probe="retained"]').count(),
    1,
    "Tester must retain its mounted research context",
  );
  checks.push(
    "Tester mounts lazily and survives a Replay round trip hidden from accessibility while inactive",
  );
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const expanded of [true, false]) {
      if (((await toggle.getAttribute("aria-expanded")) === "true") !== expanded)
        await toggle.click();
      const metrics = await page
        .locator('.desk-controls, nav[aria-label="Mục desk"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => ({ width: node.clientWidth, scroll: node.scrollWidth })),
        );
      assert.ok(
        metrics.every((m) => m.scroll <= m.width + 1),
        `Shell overflow at ${width}, expanded=${expanded}`,
      );
      const small = await page
        .locator(
          '.desk-controls button:visible, .desk-controls select:visible, .desk-volatility:visible, nav[aria-label="Mục desk"] button',
        )
        .evaluateAll((nodes) =>
          nodes
            .filter((n) => {
              const r = n.getBoundingClientRect();
              return r.height < 44 || r.width < 44;
            })
            .map((n) => n.textContent),
        );
      assert.deepEqual(small, [], `44px targets at ${width}`);
      await page.screenshot({
        path: `${artifacts}/desk-shell-${width}-${expanded ? "expanded" : "collapsed"}.png`,
        fullPage: true,
      });
    }
    const nav = page.getByRole("navigation", { name: "Mục desk" });
    for (const name of ["Playbook Lab", "Phân tích", "Chiến lược", "Tester", "Replay", "Python"]) {
      const tab = nav.getByRole("button", { name, exact: true });
      await tab.click();
      await page.waitForFunction(name => [...document.querySelectorAll('nav[aria-label="Mục desk"] button')].some(button => button.textContent.trim() === name && button.getAttribute('aria-current') === 'page'), name);
      assert.equal(await tab.getAttribute("aria-current"), "page");
      const bounds = await tab.boundingBox();
      assert.ok(
        bounds.x >= 0 && bounds.x + bounds.width <= width + 1,
        `${name} visible at ${width}`,
      );
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `Page overflow: ${name} at ${width}`,
      );
    }
    checks.push(
      `${width}px: expanded/collapsed geometry, 44px targets, six active tabs and page overflow`,
    );
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    `${artifacts}/desk-shell-qa.json`,
    JSON.stringify({ url, checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ url, checks, errors }, null, 2));
} finally {
  await browser.close();
}
