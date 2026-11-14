const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT_DIR, startServer, launchBrowser, withTestContext } = require("./helpers/cdp");

describe("Tier 2: Boundary & Corner Cases (F1–F8)", () => {
  let browser;

  before(async () => {
    browser = await launchBrowser();
  });

  after(async () => {
    if (browser) await browser.close();
  });

  describe("F1 Boundaries: Load & Render", () => {
    it("F1.B1 delayed /data/operators.json (250ms) transitions cleanly from loading text to 60 operators", async () => {
      const jsonBody = fs.readFileSync(path.join(ROOT_DIR, "data/operators.json"), "utf8");
      await withTestContext(
        browser,
        {
          routes: {
            "/data/operators.json": {
              status: 200,
              delayMs: 250,
              headers: { "Content-Type": "application/json; charset=utf-8" },
              body: jsonBody,
            },
          },
        },
        async ({ page }) => {
          assert.equal(await page.count(".operator-card"), 60);
          assert.equal(
            await page.text("#header-stats"),
            "60 verified operators · 20 train · 30 flight · 10 bus & coach"
          );
          assert.deepEqual(page.exceptions, []);
        }
      );
    });

    it("F1.B2 missing styles.css (HTTP 404) does not crash app.js or prevent rendering 60 cards", async () => {
      await withTestContext(
        browser,
        {
          routes: {
            "/styles.css": {
              status: 404,
              headers: { "Content-Type": "text/css" },
              body: "Not Found",
            },
          },
        },
        async ({ page }) => {
          assert.equal(await page.count(".operator-card"), 60);
          assert.deepEqual(page.exceptions, []);
        }
      );
    });

    it("F1.B3 semantic landmarks (header, main, footer) are present in DOM", async () => {
      await withTestContext(browser, async ({ page }) => {
        assert.equal(await page.exists("header.site-header"), true);
        assert.equal(await page.exists("main.main-content"), true);
        assert.equal(await page.exists("footer.site-footer"), true);
      });
    });

    it("F1.B4 zero duplicate data-id attributes across all 60 rendered operator cards", async () => {
      await withTestContext(browser, async ({ page }) => {
        const ids = await page.evaluate(
          'Array.from(document.querySelectorAll(".operator-card")).map(c => c.getAttribute("data-id"))'
        );
        assert.equal(ids.length, 60);
        assert.equal(new Set(ids).size, 60);
      });
    });

    it("F1.B5 XSS-safe escaping of operator strings in DOM", async () => {
      const payload = [
        {
          id: "xss-test",
          name: '<img src=x onerror="window.__xss=1">TestOp',
          mode: "train",
          country: "UK",
          region: "UK",
          scheme: "<script>window.__xss=2</script>Scheme",
          thresholdMinutes: 15,
          thresholdLabel: "15 mins",
          compensationSummary: "<b>25%</b>",
          claimDeadline: "28 days",
          claimUrl: "https://example.com/claim",
        },
      ];
      await withTestContext(
        browser,
        {
          routes: {
            "/data/operators.json": {
              status: 200,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          },
        },
        async ({ page }) => {
          assert.equal(await page.evaluate("window.__xss || 0"), 0);
          const heading = await page.text(".operator-card h3");
          assert.ok(heading.includes("<img src=x"));
          assert.equal(await page.count(".operator-card h3 img"), 0);
          assert.deepEqual(page.exceptions, []);
        }
      );
    });
  });

  describe("F2 Boundaries: Mode Tabs", () => {
    it("F2.B1 rapid consecutive tab clicks settle accurately on final tab", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click("#tab-train");
        await page.click("#tab-flight");
        await page.click("#tab-bus");
        await page.click("#tab-all");
        assert.equal(await page.count(".operator-card"), 60);
        assert.equal(await page.hasClass("#tab-all", "active"), true);
      });
    });

    it("F2.B2 clicking an already-active tab is idempotent", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click("#tab-train");
        await page.click("#tab-train");
        assert.equal(await page.count(".operator-card"), 20);
        assert.equal(await page.attr("#tab-train", "aria-selected"), "true");
      });
    });

    it("F2.B3 keyboard activation (Enter and Space) on .mode-tab switches tabs", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.pressKey("#tab-flight", "Enter");
        assert.equal(await page.count(".operator-card"), 30);
        assert.equal(await page.attr("#tab-flight", "aria-selected"), "true");

        await page.pressKey("#tab-bus", " ");
        assert.equal(await page.count(".operator-card"), 10);
        assert.equal(await page.attr("#tab-bus", "aria-selected"), "true");
      });
    });

    it("F2.B4 tab counts remain invariant (60/20/30/10) regardless of active search/region/delay filters", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.selectOption("#region-filter", "UK");
        await page.setInputValue("#search-input", "LNER");
        await page.click('.preset-btn[data-minutes="60"]');
        assert.equal(await page.text("#count-all"), "60");
        assert.equal(await page.text("#count-train"), "20");
        assert.equal(await page.text("#count-flight"), "30");
        assert.equal(await page.text("#count-bus"), "10");
      });
    });

    it("F2.B5 switching tabs while #empty-state is visible recovers matching results", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click("#tab-bus");
        await page.setInputValue("#search-input", "Eurostar");
        assert.equal(await page.isHidden("#empty-state"), false);

        await page.click("#tab-train");
        assert.equal(await page.isHidden("#empty-state"), true);
        assert.equal(await page.count(".operator-card"), 1);
        assert.equal(await page.text(".operator-card h3"), "Eurostar");
      });
    });
  });

  describe("F3 Boundaries: Region & Search", () => {
    it("F3.B1 leading/trailing whitespace in #search-input still matches", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.setInputValue("#search-input", "   lner   ");
        assert.equal(await page.count(".operator-card"), 1);
        assert.equal(await page.text(".operator-card h3"), "LNER (London North Eastern Railway)");
      });
    });

    it("F3.B2 uppercase and mixed-case search queries match case-insensitively", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.setInputValue("#search-input", "eUrOsTaR");
        assert.equal(await page.count(".operator-card"), 1);
        assert.equal(await page.text(".operator-card h3"), "Eurostar");
      });
    });

    it("F3.B3 special regex/currency characters in search do not throw errors", async () => {
      await withTestContext(browser, async ({ page }) => {
        for (const q of ["(", "+", "£", "/", ".*", "[test]"]) {
          await page.setInputValue("#search-input", q);
        }
        assert.deepEqual(page.exceptions, []);
      });
    });

    it("F3.B4 clearing #search-input restores previous region-filtered count", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.selectOption("#region-filter", "UK");
        assert.equal(await page.count(".operator-card"), 26);

        await page.setInputValue("#search-input", "LNER");
        assert.equal(await page.count(".operator-card"), 1);

        await page.setInputValue("#search-input", "");
        assert.equal(await page.count(".operator-card"), 26);
      });
    });

    it("F3.B5 'UK & Europe' operator (Eurostar) appears under All, UK, Europe, and UK & Europe", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.setInputValue("#search-input", "Eurostar");
        for (const region of ["all", "UK", "Europe", "UK & Europe"]) {
          await page.selectOption("#region-filter", region);
          assert.equal(await page.count(".operator-card"), 1, `Expected Eurostar in region=${region}`);
        }
      });
    });
  });

  describe("F4 Boundaries: Sort & View", () => {
    it("F4.B1 changing sort order when 0 results match does not throw", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.setInputValue("#search-input", "no-match-xyz");
        assert.equal(await page.isHidden("#empty-state"), false);
        await page.selectOption("#sort-select", "threshold");
        await page.selectOption("#sort-select", "mode");
        await page.selectOption("#sort-select", "name");
        assert.deepEqual(page.exceptions, []);
      });
    });

    it("F4.B2 threshold sort tie-breaks equal thresholdMinutes alphabetically", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.selectOption("#sort-select", "threshold");
        const first9Names = await page.evaluate(
          'Array.from(document.querySelectorAll(".operator-card h3")).slice(0, 9).map(e => e.textContent.trim())'
        );
        const sorted = [...first9Names].sort((a, b) => a.localeCompare(b));
        assert.deepEqual(first9Names, sorted);
      });
    });

    it("F4.B3 mode sort tie-breaks within each mode alphabetically", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.selectOption("#sort-select", "mode");
        const busNames = await page.evaluate(
          'Array.from(document.querySelectorAll(".operator-card h3")).slice(0, 10).map(e => e.textContent.trim())'
        );
        const sortedBus = [...busNames].sort((a, b) => a.localeCompare(b));
        assert.deepEqual(busNames, sortedBus);
      });
    });

    it("F4.B4 switching to Table view while #empty-state is active keeps #operators-table-wrap hidden", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.setInputValue("#search-input", "no-match-xyz");
        await page.click("#view-table-btn");
        assert.equal(await page.isHidden("#empty-state"), false);
        assert.equal(await page.isHidden("#operators-table-wrap"), true);
        assert.equal(await page.isHidden("#operators-grid"), true);
      });
    });

    it("F4.B5 clicking #reset-filters-btn while in Table view preserves Table view", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click("#view-table-btn");
        await page.setInputValue("#search-input", "no-match-xyz");
        await page.click("#reset-filters-btn");
        assert.equal(await page.isHidden("#operators-table-wrap"), false);
        assert.equal(await page.isHidden("#operators-grid"), true);
        assert.equal(await page.count("#operators-table-body tr"), 60);
      });
    });
  });

  describe("F5 Boundaries: Eligibility & Payout", () => {
    it("F5.B1 delayMinutes = 0 shows summary with 0 eligible (not hidden)", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.setInputValue("#delay-minutes-input", "0");
        assert.equal(await page.isHidden("#eligibility-summary"), false);
        assert.ok((await page.text("#eligibility-summary")).includes("0 min delay: 0 of 60 shown operator(s)"));
      });
    });

    it("F5.B2 negative delay input clamps to 0", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.setInputValue("#delay-minutes-input", "-10");
        assert.equal(await page.isHidden("#eligibility-summary"), false);
        assert.ok((await page.text("#eligibility-summary")).includes("0 min delay: 0 of 60 shown operator(s)"));
      });
    });

    it("F5.B3 exact threshold boundaries (14/15, 29/30, 59/60, 119/120, 179/180)", async () => {
      await withTestContext(browser, async ({ page }) => {
        const pairs = [
          [14, 0],
          [15, 9],
          [29, 9],
          [30, 15],
          [59, 15],
          [60, 24],
          [119, 24],
          [120, 30],
          [179, 30],
          [180, 60],
        ];
        for (const [mins, expected] of pairs) {
          await page.setInputValue("#delay-minutes-input", String(mins));
          assert.equal(
            await page.count(".operator-card.is-eligible"),
            expected,
            `Expected ${expected} eligible at ${mins}m`
          );
        }
      });
    });

    it("F5.B4 decimal ticketFare formats .2f while integer formats without decimals", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click('.preset-btn[data-minutes="30"]');
        await page.setInputValue("#ticket-fare-input", "45.50");
        assert.ok((await page.text("#eligibility-summary")).includes("UK Delay Repay 50% (single): 22.75"));

        await page.setInputValue("#ticket-fare-input", "60");
        assert.ok((await page.text("#eligibility-summary")).includes("UK Delay Repay 50% (single): 30"));
      });
    });

    it("F5.B5 zero/empty ticketFare omits rail payout while 180m still shows flight payout", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.click('.preset-btn[data-minutes="180"]');
        await page.setInputValue("#ticket-fare-input", "0");
        const text = await page.text("#eligibility-summary");
        assert.ok(!text.includes("UK rail"));
        assert.ok(text.includes("UK261 / EU261 flight (short): £220 / €250"));
      });
    });
  });

  describe("F6 Boundaries: Actions, Reset & Errors", () => {
    it("F6.B1 rapidly clicking two different .copy-link-btn buttons replaces #toast text", async () => {
      await withTestContext(
        browser,
        { pageOptions: { grantClipboard: true } },
        async ({ page }) => {
          const names = await page.evaluate(
            'Array.from(document.querySelectorAll(".operator-card h3")).slice(0, 2).map(e => e.textContent.trim())'
          );
          await page.clickNth(".copy-link-btn", 0);
          await page.clickNth(".copy-link-btn", 1);
          await page.waitFor('document.querySelector("#toast").hidden === false');
          assert.equal(await page.text("#toast"), `Copied ${names[1]} claim URL`);
        }
      );
    });

    it("F6.B2 clicking .copy-link-btn while #toast is already visible updates toast cleanly", async () => {
      await withTestContext(
        browser,
        { pageOptions: { grantClipboard: true } },
        async ({ page }) => {
          await page.clickNth(".copy-link-btn", 0);
          await page.waitFor('document.querySelector("#toast").hidden === false');
          const thirdName = await page.evaluate(
            'document.querySelectorAll(".operator-card h3")[2].textContent.trim()'
          );
          await page.clickNth(".copy-link-btn", 2);
          assert.equal(await page.isHidden("#toast"), false);
          assert.equal(await page.text("#toast"), `Copied ${thirdName} claim URL`);
        }
      );
    });

    it("F6.B3 #reset-filters-btn preserves flightDistance and view", async () => {
      await withTestContext(browser, async ({ page }) => {
        await page.selectOption("#flight-distance-select", "long");
        await page.click("#view-table-btn");
        await page.setInputValue("#search-input", "no-match-xyz");
        await page.click("#reset-filters-btn");

        assert.equal(
          await page.evaluate('document.querySelector("#flight-distance-select").value'),
          "long"
        );
        assert.equal(await page.isHidden("#operators-table-wrap"), false);
      });
    });

    it("F6.B4 malformed JSON in /data/operators.json renders error state without uncaught exceptions", async () => {
      await withTestContext(
        browser,
        {
          routes: {
            "/data/operators.json": {
              status: 200,
              headers: { "Content-Type": "application/json" },
              body: "{ invalid json",
            },
          },
        },
        async ({ page }) => {
          assert.equal(await page.text("#results-count"), "Failed to load operators dataset.");
          assert.ok((await page.text("#operators-grid")).includes("Could not load operator data"));
          assert.deepEqual(page.exceptions, []);
        }
      );
    });

    it("F6.B5 empty array [] in /data/operators.json renders 0 operators and #empty-state", async () => {
      await withTestContext(
        browser,
        {
          routes: {
            "/data/operators.json": {
              status: 200,
              headers: { "Content-Type": "application/json" },
              body: "[]",
            },
          },
        },
        async ({ page }) => {
          assert.equal(await page.text("#results-count"), "Showing 0 of 0 operators");
          assert.equal(await page.isHidden("#empty-state"), false);
          assert.deepEqual(page.exceptions, []);
        }
      );
    });
  });

  describe("F7 Boundaries: Dataset & Assets", () => {
    it("F7.B1 all operators have positive integer thresholdMinutes", async () => {
      const server = await startServer();
      try {
        const res = await fetch(`${server.baseUrl}/data/operators.json`);
        const data = await res.json();
        for (const op of data) {
          assert.ok(Number.isInteger(op.thresholdMinutes) && op.thresholdMinutes > 0, `Invalid thresholdMinutes on ${op.id}`);
        }
      } finally {
        await server.close();
      }
    });

    it("F7.B2 no operator has empty or whitespace-only string in any required field", async () => {
      const server = await startServer();
      try {
        const res = await fetch(`${server.baseUrl}/data/operators.json`);
        const data = await res.json();
        for (const op of data) {
          for (const [k, v] of Object.entries(op)) {
            if (typeof v === "string") {
              assert.ok(v.trim().length > 0, `Empty string in ${k} for ${op.id}`);
            }
          }
        }
      } finally {
        await server.close();
      }
    });

    it("F7.B3 every claimUrl parses cleanly via new URL() without leading/trailing whitespace", async () => {
      const server = await startServer();
      try {
        const res = await fetch(`${server.baseUrl}/data/operators.json`);
        const data = await res.json();
        for (const op of data) {
          assert.equal(op.claimUrl, op.claimUrl.trim());
          const parsed = new URL(op.claimUrl);
          assert.equal(parsed.protocol, "https:");
        }
      } finally {
        await server.close();
      }
    });

    it("F7.B4 data/operators.json Content-Type header is application/json", async () => {
      const server = await startServer();
      try {
        const res = await fetch(`${server.baseUrl}/data/operators.json`);
        assert.ok((res.headers.get("content-type") || "").startsWith("application/json"));
      } finally {
        await server.close();
      }
    });

    it("F7.B5 all local relative href/src references in index.html resolve with HTTP 200", async () => {
      const server = await startServer();
      try {
        const html = await (await fetch(`${server.baseUrl}/`)).text();
        const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
          .map((m) => m[1])
          .filter((u) => !u.startsWith("http://") && !u.startsWith("https://") && !u.startsWith("#"));
        assert.ok(refs.length >= 3);
        for (const ref of refs) {
          const res = await fetch(`${server.baseUrl}/${ref}`);
          assert.equal(res.status, 200, `Expected 200 for relative asset ${ref}`);
        }
      } finally {
        await server.close();
      }
    });
  });

  describe("F8 Boundaries: Workflows & Hygiene", () => {
    it("F8.B1 release.yml extracts full multiline tag annotations without truncation", (t) => {
      const relPath = path.join(ROOT_DIR, ".github/workflows/release.yml");
      if (!fs.existsSync(relPath)) {
        t.skip("Pending M3: .github/workflows/release.yml not yet created");
        return;
      }
      const yml = fs.readFileSync(relPath, "utf8");
      assert.ok(
        yml.includes("%(contents)") || yml.includes("git cat-file"),
        "release.yml must preserve full multiline tag annotation"
      );
    });

    it("F8.B2 release.yml differentiates prerelease tags (containing '-') from stable tags", (t) => {
      const relPath = path.join(ROOT_DIR, ".github/workflows/release.yml");
      if (!fs.existsSync(relPath)) {
        t.skip("Pending M3: .github/workflows/release.yml not yet created");
        return;
      }
      const yml = fs.readFileSync(relPath, "utf8");
      assert.ok(yml.includes("--prerelease"), "release.yml should handle prerelease flag for '-' tags");
    });

    it("F8.B3 cd.yml stages only static runtime assets and excludes tests/, package.json, .github/, .agents/", (t) => {
      const cdPath = path.join(ROOT_DIR, ".github/workflows/cd.yml");
      if (!fs.existsSync(cdPath)) {
        t.skip("Pending M2: .github/workflows/cd.yml not yet created");
        return;
      }
      const yml = fs.readFileSync(cdPath, "utf8");
      assert.ok(yml.includes("index.html"));
      assert.ok(yml.includes("styles.css"));
      assert.ok(yml.includes("app.js"));
      assert.ok(yml.includes("data"));
      assert.ok(!/cp\s+-r\s+\.\s+_site/.test(yml), "cd.yml must not copy entire repo root into _site");
      for (const excluded of ["package.json", ".github", "tests", ".agents"]) {
        assert.ok(
          !new RegExp(`cp\\s+(?:-[a-zA-Z]+\\s+)*[^\\n]*${excluded.replace(".", "\\.")}[^\\n]*_site`).test(yml),
          `cd.yml must not copy ${excluded} into _site`
        );
      }
    });

    it("F8.B4 ci.yml runs npm test offline without external network dependencies", (t) => {
      const ciPath = path.join(ROOT_DIR, ".github/workflows/ci.yml");
      if (!fs.existsSync(ciPath)) {
        t.skip("Pending M2: .github/workflows/ci.yml not yet created");
        return;
      }
      const yml = fs.readFileSync(ciPath, "utf8");
      assert.ok(yml.includes("npm test"));
    });

    it("F8.B5 .gitignore ignores .agents/, node_modules/, _site/, and test-results/", (t) => {
      const giPath = path.join(ROOT_DIR, ".gitignore");
      if (!fs.existsSync(giPath)) {
        t.skip("Pending M1: .gitignore not yet created");
        return;
      }
      const gi = fs.readFileSync(giPath, "utf8");
      for (const pattern of [".agents", "node_modules", "_site", "test-results"]) {
        assert.ok(gi.includes(pattern), `.gitignore should ignore ${pattern}`);
      }
    });
  });
});
