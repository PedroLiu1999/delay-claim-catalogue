const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { launchBrowser, withTestContext } = require("./helpers/cdp");

describe("Tier 3: Cross-Feature Combinations (Pairwise Coverage)", () => {
  let browser;

  before(async () => {
    browser = await launchBrowser();
  });

  after(async () => {
    if (browser) await browser.close();
  });

  it("C1 Mode (train) + Region (UK & Europe) + Search ('Eurostar') yields 1 operator", async () => {
    await withTestContext(browser, async ({ page }) => {
      await page.click("#tab-train");
      await page.selectOption("#region-filter", "UK & Europe");
      await page.setInputValue("#search-input", "Eurostar");
      assert.equal(await page.count(".operator-card"), 1);
      assert.equal(await page.text(".operator-card h3"), "Eurostar");
      assert.equal(await page.text("#results-count"), "Showing 1 of 60 operators");
    });
  });

  it("C2 Mode (flight) + Delay (180m) + Flight Distance (long) + Eligible Only shows 30 eligible flights and £520 / €600", async () => {
    await withTestContext(browser, async ({ page }) => {
      await page.click("#tab-flight");
      await page.click('.preset-btn[data-minutes="180"]');
      await page.selectOption("#flight-distance-select", "long");
      await page.setCheckbox("#eligible-only-toggle", true);

      assert.equal(await page.count(".operator-card"), 30);
      assert.equal(await page.count(".operator-card.is-eligible"), 30);
      assert.ok((await page.text("#eligibility-summary")).includes("£520 / €600"));
    });
  });

  it("C3 Mode (bus) + Delay (30m vs 60m vs 120m) + Eligible Only -> 0 (#empty-state), 4, 10, then Reset restores 60", async () => {
    await withTestContext(browser, async ({ page }) => {
      await page.click("#tab-bus");
      await page.click('.preset-btn[data-minutes="30"]');
      await page.setCheckbox("#eligible-only-toggle", true);

      assert.equal(await page.count(".operator-card"), 0);
      assert.equal(await page.isHidden("#empty-state"), false);

      await page.click('.preset-btn[data-minutes="60"]');
      assert.equal(await page.isHidden("#empty-state"), true);
      assert.equal(await page.count(".operator-card"), 4);

      await page.click('.preset-btn[data-minutes="120"]');
      assert.equal(await page.count(".operator-card"), 10);

      await page.click('.preset-btn[data-minutes="30"]');
      assert.equal(await page.isHidden("#empty-state"), false);
      await page.click("#reset-filters-btn");
      assert.equal(await page.isHidden("#empty-state"), true);
      assert.equal(await page.count(".operator-card"), 60);
    });
  });

  it("C4 Region (Europe) + Sort (threshold) + View (table) + Delay (30m) renders 29 rows with lowest thresholds eligible first", async () => {
    await withTestContext(browser, async ({ page }) => {
      await page.selectOption("#region-filter", "Europe");
      await page.selectOption("#sort-select", "threshold");
      await page.click("#view-table-btn");
      await page.click('.preset-btn[data-minutes="30"]');

      assert.equal(await page.count("#operators-table-body tr"), 29);
      const firstRowEligible = await page.evaluate(
        'document.querySelector("#operators-table-body tr").classList.contains("is-eligible")'
      );
      assert.equal(firstRowEligible, true);
      assert.equal(await page.count("#operators-table-body tr.is-eligible"), 3);
    });
  });

  it("C5 Preset (60m) + Fare (80) + Custom Delay Input (125m) deactivates preset and updates payout", async () => {
    await withTestContext(browser, async ({ page }) => {
      await page.click('.preset-btn[data-minutes="60"]');
      await page.setInputValue("#ticket-fare-input", "80");
      assert.equal(await page.hasClass('.preset-btn[data-minutes="60"]', "active"), true);

      await page.setInputValue("#delay-minutes-input", "125");
      assert.equal(await page.hasClass('.preset-btn[data-minutes="60"]', "active"), false);
      assert.ok((await page.text("#eligibility-summary")).includes("EU rail 50%: 40 · UK rail 100%: 80"));
    });
  });

  it("C6 Table View + Search (no match) + Reset Filters preserves Table View with 60 rows", async () => {
    await withTestContext(browser, async ({ page }) => {
      await page.click("#view-table-btn");
      await page.setInputValue("#search-input", "nonexistent-operator-999");
      assert.equal(await page.isHidden("#empty-state"), false);
      assert.equal(await page.isHidden("#operators-table-wrap"), true);

      await page.click("#reset-filters-btn");
      assert.equal(await page.isHidden("#empty-state"), true);
      assert.equal(await page.isHidden("#operators-table-wrap"), false);
      assert.equal(await page.count("#operators-table-body tr"), 60);
    });
  });

  it("C7 Delay (15m) + Eligible Only (true) + Clear Delay unchecks toggle, hides summary, restores 60 cards", async () => {
    await withTestContext(browser, async ({ page }) => {
      await page.click('.preset-btn[data-minutes="15"]');
      await page.setCheckbox("#eligible-only-toggle", true);
      assert.equal(await page.count(".operator-card"), 9);

      await page.click("#clear-delay-btn");
      assert.equal(await page.evaluate('document.querySelector("#eligible-only-toggle").checked'), false);
      assert.equal(await page.isHidden("#eligibility-summary"), true);
      assert.equal(await page.count(".operator-card"), 60);
      assert.equal(await page.count(".operator-card.is-eligible"), 0);
    });
  });

  it("C8 Region (UK) + Mode (train) + Copy URL copies first UK train operator URL and shows matching toast", async () => {
    await withTestContext(
      browser,
      { pageOptions: { grantClipboard: true } },
      async ({ page }) => {
        await page.selectOption("#region-filter", "UK");
        await page.click("#tab-train");
        const count = await page.count(".operator-card");
        assert.ok(count > 0 && count < 20);

        const firstName = await page.text(".operator-card h3");
        await page.clickNth(".copy-link-btn", 0);
        await page.waitFor('document.querySelector("#toast").hidden === false');
        assert.equal(await page.text("#toast"), `Copied ${firstName} claim URL`);
      }
    );
  });
});
