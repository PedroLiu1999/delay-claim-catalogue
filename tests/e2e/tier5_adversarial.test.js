const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { launchBrowser, withTestContext } = require("./helpers/cdp");

describe("Tier 5: Adversarial E2E Security, Resilience & Accessibility", () => {
  let browser;

  before(async () => {
    browser = await launchBrowser();
  });

  after(async () => {
    if (browser) await browser.close();
  });

  it("A1 Neutralizes attribute-breakout XSS and javascript: claimUrl in Cards and Table views", async () => {
    const payload = '" autofocus onfocus="window.__xss=1';
    const xssOperators = [
      {
        id: `xss-${payload}`,
        name: `XSS Operator ${payload}`,
        mode: "train",
        country: "UK",
        region: "UK",
        scheme: `Scheme ${payload}`,
        thresholdMinutes: 15,
        thresholdLabel: "15 mins",
        compensationSummary: "25% single",
        claimDeadline: "28 days",
        claimUrl: "javascript:window.__xss=2",
      },
      {
        id: "data-op",
        name: "Data URL Operator",
        mode: "flight",
        country: "France",
        region: "Europe",
        scheme: "EU261",
        thresholdMinutes: 180,
        thresholdLabel: "180 mins",
        compensationSummary: "€250",
        claimDeadline: "2 years",
        claimUrl: "data:text/html,<script>window.__xss=3</script>",
      },
    ];

    await withTestContext(
      browser,
      {
        routes: {
          "/data/operators.json": {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify(xssOperators),
          },
        },
      },
      async ({ page }) => {
        assert.equal(await page.count(".operator-card"), 2);
        assert.equal(await page.evaluate("window.__xss"), undefined);

        const cardHrefs = await page.evaluate(
          'Array.from(document.querySelectorAll(".operator-card .card-actions a")).map(a => a.getAttribute("href"))'
        );
        for (const href of cardHrefs) {
          assert.ok(!href.toLowerCase().startsWith("javascript:"), `Unsafe href: ${href}`);
          assert.ok(!href.toLowerCase().startsWith("data:"), `Unsafe href: ${href}`);
          assert.equal(href, "#");
        }

        // Also check Table view
        await page.click("#view-table-btn");
        assert.equal(await page.count("#operators-table-body tr"), 2);
        assert.equal(await page.evaluate("window.__xss"), undefined);

        const tableHrefs = await page.evaluate(
          'Array.from(document.querySelectorAll("#operators-table-body a")).map(a => a.getAttribute("href"))'
        );
        for (const href of tableHrefs) {
          assert.ok(!href.toLowerCase().startsWith("javascript:"));
          assert.equal(href, "#");
        }

        assert.deepEqual(page.exceptions, []);
      }
    );
  });

  it("A2 Handles 503, malformed JSON, non-array {}, and empty [] payloads gracefully", async () => {
    // 503 Service Unavailable
    await withTestContext(
      browser,
      {
        routes: {
          "/data/operators.json": {
            status: 503,
            headers: { "Content-Type": "text/plain" },
            body: "Service Unavailable",
          },
        },
      },
      async ({ page }) => {
        assert.equal(await page.text("#results-count"), "Failed to load operators dataset.");
        assert.equal(await page.isHidden("#operators-grid"), false);
        assert.notEqual(
          await page.text("#header-stats"),
          "Loading verified operator directory..."
        );
        assert.deepEqual(page.exceptions, []);
      }
    );

    // Malformed JSON
    await withTestContext(
      browser,
      {
        routes: {
          "/data/operators.json": {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: "{bad json",
          },
        },
      },
      async ({ page }) => {
        assert.equal(await page.text("#results-count"), "Failed to load operators dataset.");
        assert.equal(await page.isHidden("#operators-grid"), false);
        assert.deepEqual(page.exceptions, []);
      }
    );

    // Non-array JSON {}
    await withTestContext(
      browser,
      {
        routes: {
          "/data/operators.json": {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: "{}",
          },
        },
      },
      async ({ page }) => {
        assert.equal(await page.text("#results-count"), "Failed to load operators dataset.");
        assert.ok((await page.text("#operators-grid")).includes("Invalid operator catalogue payload"));
        assert.equal(await page.isHidden("#operators-grid"), false);
        assert.deepEqual(page.exceptions, []);
      }
    );

    // Empty array []
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

  it("A3 Falls back to URL toast when navigator.clipboard is missing", async () => {
    await withTestContext(
      browser,
      {
        pageOptions: {
          initScript: 'Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });',
        },
      },
      async ({ page }) => {
        await page.clickNth(".copy-link-btn", 0);
        await page.waitFor('document.querySelector("#toast").hidden === false');
        const toastText = await page.text("#toast");
        assert.ok(toastText.startsWith("URL: https://"), `Expected fallback URL toast, got: ${toastText}`);
        assert.deepEqual(page.exceptions, []);
      }
    );
  });

  it("A4 Prevents horizontal overflow on 375x812 mobile viewport in Cards, Table, and Toast states", async () => {
    const longString = "superlongunbrokenstringwithoutanyspacesorhyphens".repeat(3);
    const longOperators = [
      {
        id: "long-op",
        name: `LongOperator_${longString}`,
        mode: "train",
        country: "UK",
        region: "UK",
        scheme: `Scheme_${longString}`,
        thresholdMinutes: 15,
        thresholdLabel: "15 mins",
        compensationSummary: `Compensation_${longString}`,
        claimDeadline: "28 days",
        claimUrl: `https://example.com/${longString}`,
      },
    ];

    await withTestContext(
      browser,
      {
        routes: {
          "/data/operators.json": {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(longOperators),
          },
        },
        pageOptions: {
          initScript: 'Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });',
        },
      },
      async ({ page }) => {
        await browser.send(
          "Emulation.setDeviceMetricsOverride",
          { width: 375, height: 812, deviceScaleFactor: 1, mobile: true },
          page.sessionId
        );

        // Cards view overflow check
        const cardsOverflow = await page.evaluate(
          "document.documentElement.scrollWidth <= window.innerWidth"
        );
        assert.equal(cardsOverflow, true, "Cards view overflowed 375px mobile viewport");

        // Trigger long fallback URL toast and check overflow
        await page.clickNth(".copy-link-btn", 0);
        await page.waitFor('document.querySelector("#toast").hidden === false');
        const toastOverflow = await page.evaluate(
          "document.documentElement.scrollWidth <= window.innerWidth"
        );
        assert.equal(toastOverflow, true, "Toast overflowed 375px mobile viewport");

        // Table view overflow check (table-wrap scrolls internally, page itself should not overflow)
        await page.click("#view-table-btn");
        const tableOverflow = await page.evaluate(
          "document.documentElement.scrollWidth <= window.innerWidth"
        );
        assert.equal(tableOverflow, true, "Table view overflowed 375px mobile viewport");
        assert.deepEqual(page.exceptions, []);
      }
    );
  });

  it("A5 Supports keyboard-only ArrowRight/ArrowLeft/Home/End navigation on mode tablist", async () => {
    const KEY_CODES = { End: 35, Home: 36, ArrowLeft: 37, ArrowRight: 39 };
    const pressNavKey = async (page, selector, key) => {
      const focused = await page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.focus();
        return document.activeElement === el;
      })()`);
      assert.equal(focused, true, `Failed to focus ${selector}`);
      const keyCode = KEY_CODES[key];
      await browser.send(
        "Input.dispatchKeyEvent",
        {
          type: "rawKeyDown",
          key,
          code: key,
          windowsVirtualKeyCode: keyCode,
          nativeVirtualKeyCode: keyCode,
        },
        page.sessionId
      );
      await browser.send(
        "Input.dispatchKeyEvent",
        {
          type: "keyUp",
          key,
          code: key,
          windowsVirtualKeyCode: keyCode,
          nativeVirtualKeyCode: keyCode,
        },
        page.sessionId
      );
    };

    await withTestContext(browser, async ({ page }) => {
      await pressNavKey(page, "#tab-all", "ArrowRight");
      assert.equal(await page.evaluate("document.activeElement?.id"), "tab-train");
      assert.equal(await page.attr("#tab-train", "aria-selected"), "true");
      assert.equal(await page.count(".operator-card"), 20);

      await pressNavKey(page, "#tab-train", "End");
      assert.equal(await page.evaluate("document.activeElement?.id"), "tab-bus");
      assert.equal(await page.attr("#tab-bus", "aria-selected"), "true");
      assert.equal(await page.count(".operator-card"), 10);

      await pressNavKey(page, "#tab-bus", "ArrowLeft");
      assert.equal(await page.evaluate("document.activeElement?.id"), "tab-flight");
      assert.equal(await page.attr("#tab-flight", "aria-selected"), "true");
      assert.equal(await page.count(".operator-card"), 30);

      await pressNavKey(page, "#tab-flight", "Home");
      assert.equal(await page.evaluate("document.activeElement?.id"), "tab-all");
      assert.equal(await page.attr("#tab-all", "aria-selected"), "true");
      assert.equal(await page.count(".operator-card"), 60);

      assert.deepEqual(page.exceptions, []);
    });
  });
});
