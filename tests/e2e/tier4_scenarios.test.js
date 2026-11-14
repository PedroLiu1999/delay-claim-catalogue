const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT_DIR, launchBrowser, withTestContext } = require("./helpers/cdp");

describe("Tier 4: Real-World Application Scenarios", () => {
  let browser;

  before(async () => {
    browser = await launchBrowser();
  });

  after(async () => {
    if (browser) await browser.close();
  });

  it("S1 UK Commuter with 45-Minute Train Delay & £64 Ticket", async () => {
    await withTestContext(
      browser,
      { pageOptions: { grantClipboard: true } },
      async ({ page }) => {
        await page.click("#tab-train");
        await page.selectOption("#region-filter", "UK");
        await page.setInputValue("#delay-minutes-input", "45");
        await page.setInputValue("#ticket-fare-input", "64");
        await page.setCheckbox("#eligible-only-toggle", true);

        const names = await page.texts(".operator-card h3");
        assert.ok(names.includes("LNER (London North Eastern Railway)"), "Expected LNER to be eligible at 45m");
        assert.ok(names.includes("Avanti West Coast"), "Expected Avanti West Coast to be eligible at 45m");
        assert.ok((await page.text("#eligibility-summary")).includes("UK Delay Repay 50% (single): 32"));

        await page.setInputValue("#search-input", "LNER");
        assert.equal(await page.count(".operator-card"), 1);
        await page.clickNth(".copy-link-btn", 0);
        await page.waitFor('document.querySelector("#toast").hidden === false');
        assert.equal(await page.text("#toast"), "Copied LNER (London North Eastern Railway) claim URL");
        assert.deepEqual(page.exceptions, []);
      }
    );
  });

  it("S2 Transatlantic Flyer with 4-Hour (240m) Delay", async () => {
    await withTestContext(browser, async ({ page }) => {
      await page.click("#tab-flight");
      await page.setInputValue("#delay-minutes-input", "240");
      await page.selectOption("#flight-distance-select", "long");
      await page.setInputValue("#search-input", "British Airways");

      assert.equal(await page.count(".operator-card"), 1);
      assert.equal(await page.hasClass(".operator-card", "is-eligible"), true);
      assert.ok((await page.text("#eligibility-summary")).includes("£520 / €600"));
      const href = await page.attr(".operator-card .card-actions a", "href");
      assert.ok(href && href.startsWith("https://"));
      assert.deepEqual(page.exceptions, []);
    });
  });

  it("S3 Cross-Border Bus/Coach Traveler Comparing Options in Table View", async () => {
    await withTestContext(browser, async ({ page }) => {
      await page.click("#view-table-btn");
      await page.click("#tab-bus");
      await page.selectOption("#sort-select", "threshold");
      await page.setInputValue("#delay-minutes-input", "120");

      assert.equal(await page.count("#operators-table-body tr"), 10);
      assert.equal(await page.count("#operators-table-body tr.is-eligible"), 10);
      const firstRowCells = await page.evaluate(
        'Array.from(document.querySelectorAll("#operators-table-body tr:first-child td")).map(td => td.textContent.trim())'
      );
      assert.equal(firstRowCells.length, 7);
      assert.ok(firstRowCells[6].includes("Claim"));
      assert.deepEqual(page.exceptions, []);
    });
  });

  it("S4 Short 10-Minute Delay (Ineligible) & Recovery", async () => {
    await withTestContext(browser, async ({ page }) => {
      await page.setInputValue("#delay-minutes-input", "10");
      await page.setCheckbox("#eligible-only-toggle", true);

      assert.equal(await page.isHidden("#empty-state"), false);
      assert.equal(await page.text("#results-count"), "Showing 0 of 48 operators");
      assert.ok((await page.text("#eligibility-summary")).includes("under 15 minutes"));

      await page.click("#reset-filters-btn");
      assert.equal(await page.isHidden("#empty-state"), true);
      assert.equal(await page.count(".operator-card"), 48);
      assert.equal(await page.isHidden("#eligibility-summary"), true);
      assert.deepEqual(page.exceptions, []);
    });
  });

  it("S5 Offline / Broken Dataset Graceful Degradation (HTTP 500)", async () => {
    await withTestContext(
      browser,
      {
        routes: {
          "/data/operators.json": {
            status: 500,
            headers: { "Content-Type": "text/plain" },
            body: "Internal Server Error",
          },
        },
      },
      async ({ page }) => {
        assert.equal(await page.text("#results-count"), "Failed to load operators dataset.");
        assert.ok((await page.text("#operators-grid")).includes("Could not load operator data"));
        assert.equal(await page.exists("#json-dataset-link"), true);
        assert.equal(await page.exists("footer.site-footer"), true);
        assert.deepEqual(page.exceptions, []);
      }
    );
  });

  it("S6 CI/CD/Release Pipeline & Static Site Staging Contract Check", (t) => {
    const pkgPath = path.join(ROOT_DIR, "package.json");
    if (!fs.existsSync(pkgPath)) {
      t.skip("Pending M1: package.json not yet created");
      return;
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    assert.ok(pkg.scripts?.test?.includes("node --test"));

    const workflows = ["ci.yml", "cd.yml", "release.yml"];
    const missing = workflows.filter((f) => !fs.existsSync(path.join(ROOT_DIR, ".github/workflows", f)));
    if (missing.length > 0) {
      t.skip(`Pending M2/M3: .github/workflows/${missing.join(", ")} not yet created`);
      return;
    }

    const cdYml = fs.readFileSync(path.join(ROOT_DIR, ".github/workflows/cd.yml"), "utf8");
    for (const staticFile of ["index.html", "styles.css", "app.js", "data"]) {
      assert.ok(cdYml.includes(staticFile), `cd.yml must stage ${staticFile}`);
    }
    assert.ok(!/cp\s+-r\s+\.\s+_site/.test(cdYml), "cd.yml must not copy entire repo root into _site");
    for (const excluded of ["package.json", ".github", "tests", ".agents"]) {
      assert.ok(
        !new RegExp(`cp\\s+(?:-[a-zA-Z]+\\s+)*[^\\n]*${excluded.replace(".", "\\.")}[^\\n]*_site`).test(cdYml),
        `cd.yml must not stage ${excluded} into _site`
      );
    }
  });
});
