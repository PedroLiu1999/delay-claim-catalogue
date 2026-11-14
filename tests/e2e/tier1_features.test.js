const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT_DIR, startServer, launchBrowser, withTestContext } = require("./helpers/cdp");

describe("Tier 1: Feature Coverage (F1–F8)", () => {
  let browser;

  before(async () => {
    browser = await launchBrowser();
  });

  after(async () => {
    if (browser) await browser.close();
  });

  describe("F1: Static Site Serving & Initial Load", () => {
    it("F1.1 serves index.html, styles.css, app.js, and data/operators.json with HTTP 200 and expected MIME types", async () => {
      const server = await startServer();
      try {
        const checks = [
          { path: "/", mime: "text/html" },
          { path: "/styles.css", mime: "text/css" },
          { path: "/app.js", mime: "application/javascript" },
          { path: "/data/operators.json", mime: "application/json" },
        ];
        for (const item of checks) {
          const res = await fetch(`${server.baseUrl}${item.path}`);
          assert.equal(res.status, 200, `Expected 200 for ${item.path}`);
          const ct = res.headers.get("content-type") || "";
          assert.ok(ct.includes(item.mime), `Expected ${item.mime} for ${item.path}, got ${ct}`);
        }
      } finally {
        await server.close();
      }
    });

    it("F1.2 renders 60 operator cards on initial load with zero local network or JS errors", async () => {
      await withTestContext(browser, async ({ page }) => {
        assert.equal(await page.count(".operator-card"), 60);
        assert.equal(await page.text("#results-count"), "Showing 60 of 60 operators");
        assert.deepEqual(page.exceptions, []);
        assert.deepEqual(page.consoleErrors, []);
        assert.deepEqual(page.localNetworkErrors, []);
      });
    });

    it("F1.3 populates transport mode tab counts accurately (60 all, 20 train, 30 flight, 10 bus)", async () => {
      await withTestContext(browser, async ({ page }) => {
        assert.equal(await page.text("#count-all"), "60");
        assert.equal(await page.text("#count-train"), "20");
        assert.equal(await page.text("#count-flight"), "30");
        assert.equal(await page.text("#count-bus"), "10");
      });
    });

    it("F1.4 renders accurate #header-stats summary", async () => {
      await withTestContext(browser, async ({ page }) => {
        assert.equal(
          await page.text("#header-stats"),
          "60 verified operators · 20 train · 30 flight · 10 bus & coach"
        );
      });
    });

    it("F1.5 defaults to Cards view, alphabetical Name sort, and hidden summary/empty-state", async () => {
      await withTestContext(browser, async ({ page }) => {
        assert.equal(await page.isHidden("#operators-grid"), false);
        assert.equal(await page.isHidden("#operators-table-wrap"), true);
        assert.equal(await page.attr("#view-cards-btn", "aria-pressed"), "true");
        assert.equal(await page.attr("#view-table-btn", "aria-pressed"), "false");
        assert.equal(await page.evaluate('document.querySelector("#sort-select").value'), "name");
        assert.equal(await page.isHidden("#eligibility-summary"), true);
        assert.equal(await page.isHidden("#empty-state"), true);

        const names = await page.texts(".operator-card h3");
        const sorted = [...names].sort((a, b) => a.localeCompare(b));
        assert.deepEqual(names, sorted);
      });
    });
  });

  describe("F2: Transport Mode Tabs", () => {
    it("F2.1 clicking #tab-train filters to 20 train cards and updates aria-selected and .active", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click("#tab-train");
        assert.equal(await page.count(".operator-card"), 20);
        assert.equal(await page.text("#results-count"), "Showing 20 of 60 operators");
        assert.equal(await page.attr("#tab-train", "aria-selected"), "true");
        assert.equal(await page.hasClass("#tab-train", "active"), true);
        assert.equal(await page.attr("#tab-all", "aria-selected"), "false");
        assert.equal(await page.hasClass("#tab-all", "active"), false);
        const badges = await page.texts(".operator-card .mode-badge");
        assert.ok(badges.every((b) => b === "Train"));
      });
    });

    it("F2.2 clicking #tab-flight filters to 30 flight cards", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click("#tab-flight");
        assert.equal(await page.count(".operator-card"), 30);
        assert.equal(await page.text("#results-count"), "Showing 30 of 60 operators");
        const badges = await page.texts(".operator-card .mode-badge");
        assert.ok(badges.every((b) => b === "Flight"));
      });
    });

    it("F2.3 clicking #tab-bus filters to 10 bus cards labeled Bus & Coach", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click("#tab-bus");
        assert.equal(await page.count(".operator-card"), 10);
        assert.equal(await page.text("#results-count"), "Showing 10 of 60 operators");
        const badges = await page.texts(".operator-card .mode-bus");
        assert.equal(badges.length, 10);
        assert.ok(badges.every((b) => b === "Bus & Coach"));
      });
    });

    it("F2.4 clicking #tab-all restores all 60 operators after filtering", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click("#tab-bus");
        assert.equal(await page.count(".operator-card"), 10);
        await page.click("#tab-all");
        assert.equal(await page.count(".operator-card"), 60);
        assert.equal(await page.text("#results-count"), "Showing 60 of 60 operators");
      });
    });

    it("F2.5 switching mode tabs in Table view updates #operators-table-body row counts", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click("#view-table-btn");
        assert.equal(await page.count("#operators-table-body tr"), 60);

        await page.click("#tab-train");
        assert.equal(await page.count("#operators-table-body tr"), 20);

        await page.click("#tab-flight");
        assert.equal(await page.count("#operators-table-body tr"), 30);

        await page.click("#tab-bus");
        assert.equal(await page.count("#operators-table-body tr"), 10);

        await page.click("#tab-all");
        assert.equal(await page.count("#operators-table-body tr"), 60);
      });
    });
  });

  describe("F3: Region Filter & Search", () => {
    it("F3.1 region filter 'UK' shows 26 operators (UK + UK & Europe)", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.selectOption("#region-filter", "UK");
        assert.equal(await page.count(".operator-card"), 26);
        assert.equal(await page.text("#results-count"), "Showing 26 of 60 operators");
      });
    });

    it("F3.2 region filter 'Europe' shows 29 operators (Europe + UK & Europe)", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.selectOption("#region-filter", "Europe");
        assert.equal(await page.count(".operator-card"), 29);
        assert.equal(await page.text("#results-count"), "Showing 29 of 60 operators");
      });
    });

    it("F3.3 region filter 'UK & Europe' shows 7 cross-border operators", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.selectOption("#region-filter", "UK & Europe");
        assert.equal(await page.count(".operator-card"), 7);
        assert.equal(await page.text("#results-count"), "Showing 7 of 60 operators");
      });
    });

    it("F3.4 search matches across name, country, scheme, and compensationSummary case-insensitively", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.setInputValue("#search-input", "lner");
        assert.equal(await page.count(".operator-card"), 1);
        assert.equal(await page.text(".operator-card h3"), "LNER (London North Eastern Railway)");

        await page.setInputValue("#search-input", "Germany");
        const germanyCount = await page.count(".operator-card");
        assert.ok(germanyCount >= 2, `Expected >=2 operators matching Germany, got ${germanyCount}`);

        await page.setInputValue("#search-input", "eu261");
        const eu261Count = await page.count(".operator-card");
        assert.ok(eu261Count >= 10, `Expected >=10 operators matching eu261, got ${eu261Count}`);

        await page.setInputValue("#search-input", "voucher");
        const voucherCount = await page.count(".operator-card");
        assert.ok(voucherCount >= 1, "Expected compensationSummary match for 'voucher'");
      });
    });

    it("F3.5 non-matching search shows #empty-state and hides grid/table", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.setInputValue("#search-input", "zzzz-no-such-operator-xyz");
        assert.equal(await page.count(".operator-card"), 0);
        assert.equal(await page.isHidden("#operators-grid"), true);
        assert.equal(await page.isHidden("#operators-table-wrap"), true);
        assert.equal(await page.isHidden("#empty-state"), false);
        assert.equal(await page.text("#results-count"), "Showing 0 of 60 operators");
      });
    });
  });

  describe("F4: Sort & View Toggle", () => {
    it("F4.1 sort 'name' orders cards alphabetically A–Z", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.selectOption("#sort-select", "threshold");
        await page.selectOption("#sort-select", "name");
        const names = await page.texts(".operator-card h3");
        const sorted = [...names].sort((a, b) => a.localeCompare(b));
        assert.deepEqual(names, sorted);
      });
    });

    it("F4.2 sort 'threshold' orders ascending by thresholdMinutes with alphabetical tie-breaking", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.selectOption("#sort-select", "threshold");
        const firstThresholds = await page.evaluate(
          'Array.from(document.querySelectorAll(".operator-card .fact-value")).filter((_, i) => i % 3 === 0).map(e => e.textContent.trim())'
        );
        assert.ok(firstThresholds[0].startsWith("15+ min"), `Expected 15+ min first, got ${firstThresholds[0]}`);
        assert.ok(
          firstThresholds[firstThresholds.length - 1].includes("3+ hours"),
          `Expected 3+ hours last, got ${firstThresholds[firstThresholds.length - 1]}`
        );
      });
    });

    it("F4.3 sort 'mode' groups by bus, then flight, then train with alphabetical tie-breaking", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.selectOption("#sort-select", "mode");
        const modes = await page.texts(".operator-card .mode-badge");
        assert.equal(modes[0], "Bus & Coach");
        assert.equal(modes[9], "Bus & Coach");
        assert.equal(modes[10], "Flight");
        assert.equal(modes[39], "Flight");
        assert.equal(modes[40], "Train");
        assert.equal(modes[59], "Train");
      });
    });

    it("F4.4 clicking #view-table-btn switches to Table view with 7 expected columns", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click("#view-table-btn");
        assert.equal(await page.isHidden("#operators-grid"), true);
        assert.equal(await page.isHidden("#operators-table-wrap"), false);
        assert.equal(await page.attr("#view-table-btn", "aria-pressed"), "true");
        assert.equal(await page.attr("#view-cards-btn", "aria-pressed"), "false");

        const headers = await page.texts(".operators-table thead th");
        assert.deepEqual(headers, [
          "Operator",
          "Mode",
          "Country / Region",
          "Threshold",
          "Compensation",
          "Deadline",
          "Claim Portal",
        ]);
        assert.equal(await page.count("#operators-table-body tr"), 60);
      });
    });

    it("F4.5 clicking #view-cards-btn returns to Cards view while preserving active filters and sort", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click("#tab-train");
        await page.selectOption("#region-filter", "UK");
        await page.selectOption("#sort-select", "threshold");
        await page.click("#view-table-btn");
        const tableNames = await page.texts("#operators-table-body .table-op-name");

        await page.click("#view-cards-btn");
        assert.equal(await page.isHidden("#operators-grid"), false);
        assert.equal(await page.isHidden("#operators-table-wrap"), true);
        const cardNames = await page.texts(".operator-card h3");
        assert.deepEqual(cardNames, tableNames);
      });
    });
  });

  describe("F5: Delay Eligibility Calculator & Payout Estimator", () => {
    it("F5.1 delay < 15 mins shows 0 eligible operators and < 15m statutory note", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.setInputValue("#delay-minutes-input", "10");
        assert.equal(await page.isHidden("#eligibility-summary"), false);
        const summary = await page.text("#eligibility-summary");
        assert.ok(summary.includes("10 min delay: 0 of 60 shown operator(s)"));
        assert.ok(summary.includes("under 15 minutes"));
        assert.equal(await page.count(".operator-card.is-eligible"), 0);
        assert.equal(await page.count(".operator-card.is-ineligible"), 60);
      });
    });

    it("F5.2 preset buttons 15, 30, 60, 120, 180 update input, active class, and card eligibility badges", async () => {
      await withTestContext(browser, async ({ page }) => {
        const expectedEligible = [
          { mins: "15", count: 9 },
          { mins: "30", count: 15 },
          { mins: "60", count: 24 },
          { mins: "120", count: 30 },
          { mins: "180", count: 60 },
        ];
        for (const step of expectedEligible) {
          await page.click(`.preset-btn[data-minutes="${step.mins}"]`);
          assert.equal(
            await page.evaluate('document.querySelector("#delay-minutes-input").value'),
            step.mins
          );
          assert.equal(
            await page.hasClass(`.preset-btn[data-minutes="${step.mins}"]`, "active"),
            true
          );
          assert.equal(await page.count(".operator-card.is-eligible"), step.count);
          assert.equal(await page.count(".operator-card .eligible-badge"), step.count);
        }
      });
    });

    it("F5.3 ticket fare input calculates accurate rail payout estimates across 15m, 30m, 60m, 120m brackets", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.setInputValue("#ticket-fare-input", "60");

        await page.click('.preset-btn[data-minutes="15"]');
        assert.ok((await page.text("#eligibility-summary")).includes("UK Delay Repay 15 (25% single): 15"));

        await page.click('.preset-btn[data-minutes="30"]');
        assert.ok((await page.text("#eligibility-summary")).includes("UK Delay Repay 50% (single): 30"));

        await page.click('.preset-btn[data-minutes="60"]');
        assert.ok((await page.text("#eligibility-summary")).includes("EU rail 25%: 15 · UK rail 100%: 60"));

        await page.click('.preset-btn[data-minutes="120"]');
        assert.ok((await page.text("#eligibility-summary")).includes("EU rail 50%: 30 · UK rail 100%: 60"));
      });
    });

    it("F5.4 flight distance selector updates UK261/EU261 payout at 180m+", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click('.preset-btn[data-minutes="180"]');

        await page.selectOption("#flight-distance-select", "short");
        assert.ok((await page.text("#eligibility-summary")).includes("£220 / €250"));

        await page.selectOption("#flight-distance-select", "medium");
        assert.ok((await page.text("#eligibility-summary")).includes("£350 / €400"));

        await page.selectOption("#flight-distance-select", "long");
        assert.ok((await page.text("#eligibility-summary")).includes("£520 / €600"));
      });
    });

    it("F5.5 toggling #eligible-only-toggle filters rendered cards to eligible operators only", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click('.preset-btn[data-minutes="30"]');
        await page.setCheckbox("#eligible-only-toggle", true);
        assert.equal(await page.count(".operator-card"), 15);
        assert.equal(await page.count(".operator-card.is-ineligible"), 0);
        assert.equal(await page.text("#results-count"), "Showing 15 of 60 operators");
      });
    });

    it("F5.6 clicking #clear-delay-btn clears delay, fare, eligible-only, summary, and card classes", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click('.preset-btn[data-minutes="60"]');
        await page.setInputValue("#ticket-fare-input", "50");
        await page.setCheckbox("#eligible-only-toggle", true);

        await page.click("#clear-delay-btn");
        assert.equal(await page.evaluate('document.querySelector("#delay-minutes-input").value'), "");
        assert.equal(await page.evaluate('document.querySelector("#ticket-fare-input").value'), "");
        assert.equal(await page.evaluate('document.querySelector("#eligible-only-toggle").checked'), false);
        assert.equal(await page.isHidden("#eligibility-summary"), true);
        assert.equal(await page.count(".operator-card"), 60);
        assert.equal(await page.count(".operator-card.is-eligible"), 0);
        assert.equal(await page.count(".operator-card.is-ineligible"), 0);
      });
    });
  });

  describe("F6: Card Actions, Reset & Error Handling", () => {
    it("F6.1 all card and table claim links use https://, target='_blank', and rel='noopener noreferrer'", async () => {
      await withTestContext(browser, async ({ page }) => {
        const cardInvalid = await page.evaluate(`
          Array.from(document.querySelectorAll(".operator-card .card-actions a")).filter(a => {
            const href = a.getAttribute("href") || "";
            return !href.startsWith("https://") || a.getAttribute("target") !== "_blank" || a.getAttribute("rel") !== "noopener noreferrer";
          }).length
        `);
        assert.equal(cardInvalid, 0);

        await page.click("#view-table-btn");
        const tableInvalid = await page.evaluate(`
          Array.from(document.querySelectorAll("#operators-table-body a")).filter(a => {
            const href = a.getAttribute("href") || "";
            return !href.startsWith("https://") || a.getAttribute("target") !== "_blank" || a.getAttribute("rel") !== "noopener noreferrer";
          }).length
        `);
        assert.equal(tableInvalid, 0);
      });
    });

    it("F6.2 clicking .copy-link-btn with clipboard permission copies URL and shows auto-hiding #toast", async () => {
      await withTestContext(
        browser,
        { pageOptions: { grantClipboard: true } },
        async ({ page }) => {
          const firstName = await page.text(".operator-card h3");
          await page.clickNth(".copy-link-btn", 0);
          await page.waitFor('document.querySelector("#toast").hidden === false');
          assert.equal(await page.text("#toast"), `Copied ${firstName} claim URL`);
          await page.waitFor('document.querySelector("#toast").hidden === true', 3500);
        }
      );
    });

    it("F6.3 clicking .copy-link-btn when clipboard write rejects shows fallback 'URL: <claimUrl>' toast", async () => {
      await withTestContext(
        browser,
        {
          pageOptions: {
            initScript: `
              Object.defineProperty(navigator, "clipboard", {
                value: { writeText: () => Promise.reject(new Error("Denied")) },
                configurable: true
              });
            `,
          },
        },
        async ({ page }) => {
          const expectedUrl = await page.attr(".copy-link-btn", "data-url");
          await page.clickNth(".copy-link-btn", 0);
          await page.waitFor('document.querySelector("#toast").hidden === false');
          assert.equal(await page.text("#toast"), `URL: ${expectedUrl}`);
        }
      );
    });

    it("F6.4 clicking #reset-filters-btn from #empty-state restores all 60 operators and resets filters", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click("#tab-bus");
        await page.selectOption("#region-filter", "UK");
        await page.setInputValue("#search-input", "nonexistent-operator");
        assert.equal(await page.isHidden("#empty-state"), false);

        await page.click("#reset-filters-btn");
        assert.equal(await page.isHidden("#empty-state"), true);
        assert.equal(await page.count(".operator-card"), 60);
        assert.equal(await page.hasClass("#tab-all", "active"), true);
        assert.equal(await page.evaluate('document.querySelector("#region-filter").value'), "all");
        assert.equal(await page.evaluate('document.querySelector("#search-input").value'), "");
      });
    });

    it("F6.5 mocked HTTP 404 and 500 on /data/operators.json render graceful error state", async () => {
      for (const status of [404, 500]) {
        await withTestContext(
          browser,
          {
            routes: {
              "/data/operators.json": {
                status,
                headers: { "Content-Type": "text/plain" },
                body: `Error ${status}`,
              },
            },
          },
          async ({ page }) => {
            assert.equal(await page.text("#results-count"), "Failed to load operators dataset.");
            const gridText = await page.text("#operators-grid");
            assert.ok(gridText.includes("Could not load operator data"));
            assert.ok(gridText.includes(`HTTP ${status}`));
            assert.deepEqual(page.exceptions, []);
          }
        );
      }
    });
  });

  describe("F7: Dataset & Static Asset Integrity (E2E)", () => {
    it("F7.1 live-served data/operators.json returns HTTP 200 valid JSON array of 60 operators", async () => {
      const server = await startServer();
      try {
        const res = await fetch(`${server.baseUrl}/data/operators.json`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data));
        assert.equal(data.length, 60);
      } finally {
        await server.close();
      }
    });

    it("F7.2 every operator in live dataset has all 11 required fields", async () => {
      const server = await startServer();
      try {
        const res = await fetch(`${server.baseUrl}/data/operators.json`);
        const data = await res.json();
        const required = [
          "id",
          "name",
          "mode",
          "country",
          "region",
          "scheme",
          "thresholdMinutes",
          "thresholdLabel",
          "compensationSummary",
          "claimDeadline",
          "claimUrl",
        ];
        for (const op of data) {
          for (const key of required) {
            assert.ok(Object.prototype.hasOwnProperty.call(op, key), `Missing ${key} on ${op.id}`);
          }
        }
      } finally {
        await server.close();
      }
    });

    it("F7.3 all operator ids, names, and claimUrls are unique and use https://", async () => {
      const server = await startServer();
      try {
        const res = await fetch(`${server.baseUrl}/data/operators.json`);
        const data = await res.json();
        assert.equal(new Set(data.map((o) => o.id)).size, 60);
        assert.equal(new Set(data.map((o) => o.name)).size, 60);
        assert.equal(new Set(data.map((o) => o.claimUrl)).size, 60);
        assert.ok(data.every((o) => typeof o.claimUrl === "string" && o.claimUrl.startsWith("https://")));
      } finally {
        await server.close();
      }
    });

    it("F7.4 header #json-dataset-link and #json-download-link resolve to HTTP 200 data/operators.json", async () => {
      await withTestContext(browser, async ({ page, baseUrl }) => {
        const viewHref = await page.attr("#json-dataset-link", "href");
        const dlHref = await page.attr("#json-download-link", "href");
        assert.equal(viewHref, "data/operators.json");
        assert.equal(dlHref, "data/operators.json");
        assert.equal(await page.attr("#json-download-link", "download"), "operators.json");

        const res = await fetch(`${baseUrl}/${viewHref}`);
        assert.equal(res.status, 200);
      });
    });

    it("F7.5 rendered .domain-pill matches normalized hostname without www.", async () => {
      await withTestContext(browser, async ({ page }) => {
        const mismatches = await page.evaluate(`
          Array.from(document.querySelectorAll(".operator-card")).filter(card => {
            const href = card.querySelector(".card-actions a").getAttribute("href");
            const pill = card.querySelector(".domain-pill").textContent.trim();
            const expected = new URL(href).hostname.replace(/^www\\./, "");
            return pill !== expected;
          }).length
        `);
        assert.equal(mismatches, 0);
      });
    });
  });

  describe("F8: CI/CD/Release Workflow & Package Contract Validation", () => {
    it("F8.1 package.json defines valid test scripts using node --test", (t) => {
      const pkgPath = path.join(ROOT_DIR, "package.json");
      if (!fs.existsSync(pkgPath)) {
        t.skip("Pending M1: package.json not yet created");
        return;
      }
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      assert.ok(pkg.scripts && typeof pkg.scripts.test === "string", "Missing scripts.test");
      assert.ok(pkg.scripts.test.includes("node --test"), "scripts.test should use node --test");
      if (!pkg.scripts["test:e2e"]) {
        t.skip("Pending M1/M2: package.json scripts.test:e2e not yet added");
        return;
      }
      assert.ok(pkg.scripts["test:e2e"].includes("node --test"), "scripts['test:e2e'] should use node --test");
    });

    it("F8.2 .github/workflows/ci.yml triggers on push/PR to main + workflow_dispatch and runs npm test", (t) => {
      const ciPath = path.join(ROOT_DIR, ".github/workflows/ci.yml");
      if (!fs.existsSync(ciPath)) {
        t.skip("Pending M2: .github/workflows/ci.yml not yet created");
        return;
      }
      const yml = fs.readFileSync(ciPath, "utf8");
      assert.ok(/push:\s*\n[\s\S]*branches:\s*\[?\s*["']?main["']?/.test(yml), "ci.yml must trigger on push to main");
      assert.ok(/pull_request:\s*\n[\s\S]*branches:\s*\[?\s*["']?main["']?/.test(yml), "ci.yml must trigger on pull_request to main");
      assert.ok(yml.includes("workflow_dispatch"), "ci.yml must include workflow_dispatch");
      assert.ok(yml.includes("npm test"), "ci.yml must run npm test");
    });

    it("F8.3 .github/workflows/cd.yml gates on tests, stages static files into _site, and deploys Pages", (t) => {
      const cdPath = path.join(ROOT_DIR, ".github/workflows/cd.yml");
      if (!fs.existsSync(cdPath)) {
        t.skip("Pending M2: .github/workflows/cd.yml not yet created");
        return;
      }
      const yml = fs.readFileSync(cdPath, "utf8");
      assert.ok(yml.includes("pages: write"), "cd.yml needs pages: write permission");
      assert.ok(yml.includes("id-token: write"), "cd.yml needs id-token: write permission");
      assert.ok(yml.includes("upload-pages-artifact"), "cd.yml must use actions/upload-pages-artifact");
      assert.ok(yml.includes("deploy-pages"), "cd.yml must use actions/deploy-pages");
      assert.ok(yml.includes("_site"), "cd.yml must stage into _site");
      assert.ok(yml.includes("npm test"), "cd.yml must run tests before deploying");
    });

    it("F8.4 .github/workflows/release.yml triggers on v* tags, uses fetch-depth: 0, extracts annotation, and creates release", (t) => {
      const relPath = path.join(ROOT_DIR, ".github/workflows/release.yml");
      if (!fs.existsSync(relPath)) {
        t.skip("Pending M3: .github/workflows/release.yml not yet created");
        return;
      }
      const yml = fs.readFileSync(relPath, "utf8");
      assert.ok(/tags:\s*\n\s*-\s*["']?v\*["']?|tags:\s*\[?\s*["']v\*["']/.test(yml), "release.yml must trigger on v* tags");
      assert.ok(yml.includes("fetch-depth: 0"), "release.yml must checkout with fetch-depth: 0");
      assert.ok(yml.includes("contents: write"), "release.yml needs contents: write permission");
      assert.ok(
        yml.includes("git for-each-ref") || yml.includes("git cat-file"),
        "release.yml must extract annotated tag message"
      );
      assert.ok(yml.includes("gh release create"), "release.yml must create GitHub Release via gh release create");
    });

    it("F8.5 existing workflow YAML files have valid basic structure (no tabs, on/jobs/steps present)", (t) => {
      const wfDir = path.join(ROOT_DIR, ".github/workflows");
      if (!fs.existsSync(wfDir)) {
        t.skip("Pending M2/M3: .github/workflows directory not yet created");
        return;
      }
      const files = fs.readdirSync(wfDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
      assert.ok(files.length > 0, "Expected at least one workflow file");
      for (const file of files) {
        const content = fs.readFileSync(path.join(wfDir, file), "utf8");
        assert.ok(!content.includes("\t"), `${file} must not contain tab indentation`);
        assert.ok(/^on:/m.test(content), `${file} must define 'on:' trigger`);
        assert.ok(/^jobs:/m.test(content), `${file} must define 'jobs:'`);
        assert.ok(/steps:/m.test(content), `${file} must define 'steps:'`);
      }
    });
  });
});
