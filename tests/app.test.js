const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DATA_PATH = path.resolve(__dirname, "..", "data", "operators.json");
const REAL_OPERATORS = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

class MockClassList {
  constructor(initial = []) {
    this.classes = new Set(initial);
  }

  add(...tokens) {
    for (const token of tokens) this.classes.add(token);
  }

  remove(...tokens) {
    for (const token of tokens) this.classes.delete(token);
  }

  contains(token) {
    return this.classes.has(token);
  }

  toggle(token, force) {
    if (force === undefined) {
      if (this.classes.has(token)) {
        this.classes.delete(token);
        return false;
      }
      this.classes.add(token);
      return true;
    }
    if (force) {
      this.classes.add(token);
      return true;
    }
    this.classes.delete(token);
    return false;
  }
}

class MockElement {
  constructor(tagName = "div", opts = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = opts.id || "";
    this.value = opts.value ?? "";
    this.checked = opts.checked ?? false;
    this.hidden = opts.hidden ?? false;
    this.dataset = { ...(opts.dataset || {}) };
    this.attributes = { ...(opts.attributes || {}) };
    this.classList = new MockClassList(opts.classes || []);
    this.listeners = new Map();
    this._textContent = opts.textContent ?? "";
    this._innerHTML = opts.innerHTML ?? "";
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    const str = val === null || val === undefined ? "" : String(val);
    this._textContent = str;
    this._innerHTML = str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = val === null || val === undefined ? "" : String(val);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  async dispatchEvent(event = {}) {
    const handlers = this.listeners.get(event.type) || [];
    const evt = {
      target: this,
      currentTarget: this,
      ...event,
    };
    for (const handler of handlers) {
      await handler(evt);
    }
  }

  closest(selector) {
    const cls = selector.startsWith(".") ? selector.slice(1) : null;
    if (cls && this.classList.contains(cls)) {
      return this;
    }
    return null;
  }
}

function createDomEnvironment() {
  const byId = new Map();
  const register = (id, tag = "div", opts = {}) => {
    const el = new MockElement(tag, { id, ...opts });
    byId.set(id, el);
    return el;
  };

  register("header-stats", "p");
  register("operators-grid", "section");
  register("operators-table-wrap", "section", { hidden: true });
  register("operators-table-body", "tbody");
  register("empty-state", "div", { hidden: true });
  register("results-count", "p");
  register("search-input", "input");
  register("region-filter", "select", { value: "all" });
  register("sort-select", "select", { value: "name" });
  register("delay-minutes-input", "input");
  register("ticket-fare-input", "input");
  register("flight-distance-select", "select", { value: "short" });
  register("eligible-only-toggle", "input", { checked: false });
  register("eligibility-summary", "div", { hidden: true });
  register("clear-delay-btn", "button");
  register("reset-filters-btn", "button");
  register("toast", "div", { hidden: true });
  register("count-all", "span");
  register("count-train", "span");
  register("count-flight", "span");
  register("count-bus", "span");

  const modeTabs = ["all", "train", "flight", "bus"].map((mode, idx) =>
    new MockElement("button", {
      id: `tab-${mode}`,
      classes: idx === 0 ? ["mode-tab", "active"] : ["mode-tab"],
      dataset: { mode },
      attributes: { "aria-selected": String(idx === 0) },
    })
  );

  const viewBtns = ["cards", "table"].map((view, idx) =>
    new MockElement("button", {
      id: `view-${view}-btn`,
      classes: idx === 0 ? ["view-btn", "active"] : ["view-btn"],
      dataset: { view },
      attributes: { "aria-pressed": String(idx === 0) },
    })
  );

  const presetBtns = ["15", "30", "60", "120", "180"].map((minutes) =>
    new MockElement("button", {
      classes: ["preset-btn"],
      dataset: { minutes },
    })
  );

  const documentMock = {
    getElementById(id) {
      return byId.get(id) || null;
    },
    querySelectorAll(selector) {
      if (selector === ".mode-tab") return modeTabs;
      if (selector === ".view-btn") return viewBtns;
      if (selector === ".preset-btn[data-minutes]") return presetBtns;
      return [];
    },
    createElement(tag) {
      return new MockElement(tag);
    },
  };

  return {
    documentMock,
    byId,
    modeTabs,
    viewBtns,
    presetBtns,
  };
}

let env = createDomEnvironment();
globalThis.__DELAY_CLAIM_NO_AUTO_INIT__ = true;
globalThis.window = {};
globalThis.document = env.documentMock;
const mockClipboard = {
  writeText: async () => {},
};
if (typeof globalThis.navigator === "undefined") {
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: mockClipboard },
    configurable: true,
    writable: true,
  });
} else {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: mockClipboard,
    configurable: true,
    writable: true,
  });
}

const app = require("../app.js");

function resetApp(operators = REAL_OPERATORS) {
  env = createDomEnvironment();
  globalThis.document = env.documentMock;
  mockClipboard.writeText = async () => {};
  app.refreshElements();

  Object.assign(app.state, {
    operators: [...operators],
    mode: "all",
    region: "all",
    search: "",
    sort: "name",
    view: "cards",
    delayMinutes: null,
    ticketFare: null,
    flightDistance: "short",
    eligibleOnly: false,
  });
}

test("formatMoney formats integers without decimals and rounds floats to 2 decimal places", () => {
  assert.equal(app.formatMoney(60), "60");
  assert.equal(app.formatMoney(0), "0");
  assert.equal(app.formatMoney(15.5), "15.50");
  assert.equal(app.formatMoney(12.345), "12.35");
  assert.equal(app.formatMoney(10.004), "10.00");
});

test("getHostname strips www. prefix and returns empty string for invalid URLs", () => {
  assert.equal(app.getHostname("https://www.lner.co.uk/support/delay-repay/"), "lner.co.uk");
  assert.equal(app.getHostname("https://delayrepay.gwr.com/"), "delayrepay.gwr.com");
  assert.equal(app.getHostname("not-a-valid-url"), "");
  assert.equal(app.getHostname(""), "");
});

test("escapeHtml escapes <, >, and & characters", () => {
  assert.equal(
    app.escapeHtml('<script>alert("a & b")</script>'),
    '&lt;script&gt;alert("a &amp; b")&lt;/script&gt;'
  );
  assert.equal(app.escapeHtml("Plain text 123"), "Plain text 123");
});

test("isOperatorEligible handles null, NaN, below-threshold, exact boundary, and above-threshold", () => {
  resetApp([]);
  const op = { thresholdMinutes: 30 };

  app.state.delayMinutes = null;
  assert.equal(app.isOperatorEligible(op), null);

  app.state.delayMinutes = Number.NaN;
  assert.equal(app.isOperatorEligible(op), null);

  app.state.delayMinutes = 29;
  assert.equal(app.isOperatorEligible(op), false);

  app.state.delayMinutes = 30;
  assert.equal(app.isOperatorEligible(op), true);

  app.state.delayMinutes = 60;
  assert.equal(app.isOperatorEligible(op), true);
});

test("buildPayoutEstimate covers all delay brackets, fare presence, and flight distances", () => {
  resetApp([]);

  // With ticketFare > 0
  app.state.ticketFare = 60;
  assert.equal(app.buildPayoutEstimate(14), "");
  assert.equal(app.buildPayoutEstimate(15), "UK Delay Repay 15 (25% single): 15");
  assert.equal(app.buildPayoutEstimate(29), "UK Delay Repay 15 (25% single): 15");
  assert.equal(app.buildPayoutEstimate(30), "UK Delay Repay 50% (single): 30");
  assert.equal(app.buildPayoutEstimate(59), "UK Delay Repay 50% (single): 30");
  assert.equal(app.buildPayoutEstimate(60), "EU rail 25%: 15 · UK rail 100%: 60");
  assert.equal(app.buildPayoutEstimate(119), "EU rail 25%: 15 · UK rail 100%: 60");
  assert.equal(app.buildPayoutEstimate(120), "EU rail 50%: 30 · UK rail 100%: 60");
  assert.equal(app.buildPayoutEstimate(179), "EU rail 50%: 30 · UK rail 100%: 60");

  app.state.flightDistance = "short";
  assert.equal(
    app.buildPayoutEstimate(180),
    "EU rail 50%: 30 · UK rail 100%: 60  |  UK261 / EU261 flight (short): £220 / €250"
  );

  // Without ticketFare
  app.state.ticketFare = null;
  assert.equal(app.buildPayoutEstimate(60), "");
  app.state.flightDistance = "medium";
  assert.equal(app.buildPayoutEstimate(180), "UK261 / EU261 flight (medium): £350 / €400");
  app.state.flightDistance = "long";
  assert.equal(app.buildPayoutEstimate(240), "UK261 / EU261 flight (long): £520 / €600");
});

test("getFilteredOperators filters by mode, region (including UK & Europe substring), search, eligibleOnly, and sorts correctly", () => {
  resetApp();

  // Mode filtering
  app.state.mode = "all";
  assert.equal(app.getFilteredOperators().length, 48);
  app.state.mode = "train";
  assert.equal(app.getFilteredOperators().length, 20);
  app.state.mode = "flight";
  assert.equal(app.getFilteredOperators().length, 18);
  app.state.mode = "bus";
  assert.equal(app.getFilteredOperators().length, 10);

  // Region filtering (substring matching for UK and Europe, exact for UK & Europe)
  app.state.mode = "all";
  app.state.region = "UK";
  assert.equal(app.getFilteredOperators().length, 26); // 19 UK + 7 UK & Europe
  app.state.region = "Europe";
  assert.equal(app.getFilteredOperators().length, 29); // 22 Europe + 7 UK & Europe
  app.state.region = "UK & Europe";
  assert.equal(app.getFilteredOperators().length, 7);

  // Search filtering across name, country, region, scheme, compensationSummary
  app.state.region = "all";
  app.state.search = "  lner ";
  assert.equal(app.getFilteredOperators().length, 1);
  assert.equal(app.getFilteredOperators()[0].id, "lner");

  app.state.search = "EU261";
  assert.ok(app.getFilteredOperators().length > 0);
  assert.ok(app.getFilteredOperators().every((op) => op.mode === "flight" || op.scheme.includes("EU261")));

  // eligibleOnly filtering
  app.state.search = "";
  app.state.eligibleOnly = true;
  app.state.delayMinutes = null;
  assert.equal(app.getFilteredOperators().length, 48);

  app.state.delayMinutes = 15;
  const eligible15 = app.getFilteredOperators();
  assert.ok(eligible15.length > 0 && eligible15.length < 48);
  assert.ok(eligible15.every((op) => op.thresholdMinutes <= 15));

  // Sorting: threshold ascending with name tie-break
  app.state.eligibleOnly = false;
  app.state.delayMinutes = null;
  app.state.sort = "threshold";
  const byThreshold = app.getFilteredOperators();
  for (let i = 1; i < byThreshold.length; i++) {
    const prev = byThreshold[i - 1];
    const curr = byThreshold[i];
    if (prev.thresholdMinutes === curr.thresholdMinutes) {
      assert.ok(prev.name.localeCompare(curr.name) <= 0);
    } else {
      assert.ok(prev.thresholdMinutes < curr.thresholdMinutes);
    }
  }

  // Sorting: mode alphabetical with name tie-break
  app.state.sort = "mode";
  const byMode = app.getFilteredOperators();
  for (let i = 1; i < byMode.length; i++) {
    const prev = byMode[i - 1];
    const curr = byMode[i];
    if (prev.mode === curr.mode) {
      assert.ok(prev.name.localeCompare(curr.name) <= 0);
    } else {
      assert.ok(prev.mode.localeCompare(curr.mode) < 0);
    }
  }

  // Sorting: name alphabetical
  app.state.sort = "name";
  const byName = app.getFilteredOperators();
  for (let i = 1; i < byName.length; i++) {
    assert.ok(byName[i - 1].name.localeCompare(byName[i].name) <= 0);
  }
});

test("updateCounts populates mode counts and header stats", () => {
  resetApp();
  app.updateCounts();

  assert.equal(app.elements.counts.all.textContent, "48");
  assert.equal(app.elements.counts.train.textContent, "20");
  assert.equal(app.elements.counts.flight.textContent, "18");
  assert.equal(app.elements.counts.bus.textContent, "10");
  assert.equal(
    app.elements.headerStats.textContent,
    "48 verified operators · 20 train · 18 flight · 10 bus & coach"
  );
});

test("updateEligibilitySummary handles null/NaN and all 6 delay brackets with optional payout", () => {
  resetApp();
  const filtered = app.state.operators;

  app.state.delayMinutes = null;
  app.updateEligibilitySummary(filtered);
  assert.equal(app.elements.eligibilitySummary.hidden, true);
  assert.equal(app.elements.eligibilitySummary.textContent, "");

  app.state.delayMinutes = Number.NaN;
  app.updateEligibilitySummary(filtered);
  assert.equal(app.elements.eligibilitySummary.hidden, true);

  const bracketExpectations = [
    [10, "under 15 minutes"],
    [20, "UK Delay Repay 15 rail operators"],
    [45, "SNCF G30"],
    [90, "most UK &amp; European rail operators"],
    [150, "EU coach/bus departure delay rights"],
    [200, "UK261/EU261 flight compensation"],
  ];

  for (const [mins, expectedSnippet] of bracketExpectations) {
    app.state.delayMinutes = mins;
    app.updateEligibilitySummary(filtered);
    assert.equal(app.elements.eligibilitySummary.hidden, false);
    assert.ok(
      app.elements.eligibilitySummary.innerHTML.includes(`${mins} min delay:`),
      `Expected delay label for ${mins}m`
    );
    assert.ok(
      app.elements.eligibilitySummary.innerHTML.includes(expectedSnippet),
      `Expected ruleNote snippet "${expectedSnippet}" for ${mins}m`
    );
  }

  app.state.delayMinutes = 180;
  app.state.ticketFare = 100;
  app.updateEligibilitySummary(filtered);
  assert.ok(app.elements.eligibilitySummary.innerHTML.includes('class="payout-estimate"'));
  assert.ok(app.elements.eligibilitySummary.innerHTML.includes("Estimated payout:"));
});

test("renderCards, renderTable, and render output expected markup and toggle view/empty states", () => {
  resetApp();

  // Cards view without delay
  app.render();
  assert.equal(app.elements.resultsCount.textContent, "Showing 48 of 48 operators");
  assert.equal(app.elements.emptyState.hidden, true);
  assert.equal(app.elements.grid.hidden, false);
  assert.equal(app.elements.tableWrap.hidden, true);
  assert.ok(app.elements.grid.innerHTML.includes('class="operator-card"'));
  assert.ok(app.elements.grid.innerHTML.includes('class="domain-pill"'));
  assert.ok(app.elements.grid.innerHTML.includes("copy-link-btn"));
  assert.ok(!app.elements.grid.innerHTML.includes("eligible-badge"));

  // Cards view with delay = 30 (mix of eligible and ineligible)
  app.state.delayMinutes = 30;
  app.render();
  assert.ok(app.elements.grid.innerHTML.includes("operator-card is-eligible"));
  assert.ok(app.elements.grid.innerHTML.includes("operator-card is-ineligible"));
  assert.ok(app.elements.grid.innerHTML.includes('<span class="eligible-badge">Threshold met</span>'));

  // Table view
  app.state.view = "table";
  app.render();
  assert.equal(app.elements.grid.hidden, true);
  assert.equal(app.elements.tableWrap.hidden, false);
  assert.ok(app.elements.tableBody.innerHTML.includes('<tr class="is-eligible">'));
  assert.ok(app.elements.tableBody.innerHTML.includes('<tr class="is-ineligible">'));
  const firstRowMatch = app.elements.tableBody.innerHTML.match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
  assert.ok(firstRowMatch);
  const tdCount = (firstRowMatch[1].match(/<td>/g) || []).length;
  assert.equal(tdCount, 7);

  // Empty state
  app.state.search = "nonexistent-operator-xyz";
  app.render();
  assert.equal(app.elements.resultsCount.textContent, "Showing 0 of 48 operators");
  assert.equal(app.elements.emptyState.hidden, false);
  assert.equal(app.elements.grid.hidden, true);
  assert.equal(app.elements.tableWrap.hidden, true);
  assert.equal(app.elements.grid.innerHTML, "");
  assert.equal(app.elements.tableBody.innerHTML, "");
});

test("showToast displays message and auto-hides after 2400ms", (t) => {
  resetApp();
  t.mock.timers.enable({ apis: ["setTimeout"] });

  app.showToast("Copied LNER claim URL");
  assert.equal(app.elements.toast.textContent, "Copied LNER claim URL");
  assert.equal(app.elements.toast.hidden, false);

  t.mock.timers.tick(2399);
  assert.equal(app.elements.toast.hidden, false);

  t.mock.timers.tick(1);
  assert.equal(app.elements.toast.hidden, true);
});

test("bindEvents handles all user interactions and reset preserves view and flightDistance", async () => {
  resetApp();
  app.bindEvents();
  app.render();

  // Mode tab click -> train
  await env.modeTabs[1].dispatchEvent({ type: "click" });
  assert.equal(app.state.mode, "train");
  assert.equal(env.modeTabs[1].classList.contains("active"), true);
  assert.equal(env.modeTabs[1].getAttribute("aria-selected"), "true");
  assert.equal(env.modeTabs[0].classList.contains("active"), false);
  assert.equal(env.modeTabs[0].getAttribute("aria-selected"), "false");
  assert.equal(app.elements.resultsCount.textContent, "Showing 20 of 48 operators");

  // View toggle -> table
  await env.viewBtns[1].dispatchEvent({ type: "click" });
  assert.equal(app.state.view, "table");
  assert.equal(env.viewBtns[1].classList.contains("active"), true);
  assert.equal(env.viewBtns[1].getAttribute("aria-pressed"), "true");
  assert.equal(app.elements.tableWrap.hidden, false);

  // Search input
  await app.elements.searchInput.dispatchEvent({ type: "input", target: { value: "Eurostar" } });
  assert.equal(app.state.search, "Eurostar");

  // Region filter
  await app.elements.regionFilter.dispatchEvent({ type: "change", target: { value: "UK & Europe" } });
  assert.equal(app.state.region, "UK & Europe");

  // Sort select
  await app.elements.sortSelect.dispatchEvent({ type: "change", target: { value: "threshold" } });
  assert.equal(app.state.sort, "threshold");

  // Flight distance select
  await app.elements.flightDistanceSelect.dispatchEvent({ type: "change", target: { value: "long" } });
  assert.equal(app.state.flightDistance, "long");

  // Delay input & preset sync
  await app.elements.delayInput.dispatchEvent({ type: "input", target: { value: "60" } });
  assert.equal(app.state.delayMinutes, 60);
  assert.equal(env.presetBtns[2].classList.contains("active"), true);

  await app.elements.delayInput.dispatchEvent({ type: "input", target: { value: "" } });
  assert.equal(app.state.delayMinutes, null);
  assert.equal(env.presetBtns[2].classList.contains("active"), false);

  // Preset button click -> 180
  await env.presetBtns[4].dispatchEvent({ type: "click" });
  assert.equal(app.state.delayMinutes, 180);
  assert.equal(app.elements.delayInput.value, "180");
  assert.equal(env.presetBtns[4].classList.contains("active"), true);

  // Fare input
  await app.elements.fareInput.dispatchEvent({ type: "input", target: { value: "80" } });
  assert.equal(app.state.ticketFare, 80);

  // Eligible only toggle
  await app.elements.eligibleOnlyToggle.dispatchEvent({ type: "change", target: { checked: true } });
  assert.equal(app.state.eligibleOnly, true);

  // Clear delay button
  await app.elements.clearDelayBtn.dispatchEvent({ type: "click" });
  assert.equal(app.state.delayMinutes, null);
  assert.equal(app.state.ticketFare, null);
  assert.equal(app.state.eligibleOnly, false);
  assert.equal(app.elements.delayInput.value, "");
  assert.equal(app.elements.fareInput.value, "");
  assert.equal(app.elements.eligibleOnlyToggle.checked, false);

  // Set filters again and test resetFiltersBtn
  app.state.mode = "flight";
  app.state.region = "Europe";
  app.state.search = "air";
  app.state.sort = "mode";
  app.state.delayMinutes = 180;
  app.state.ticketFare = 50;
  app.state.eligibleOnly = true;

  await app.elements.resetFiltersBtn.dispatchEvent({ type: "click" });
  assert.equal(app.state.mode, "all");
  assert.equal(app.state.region, "all");
  assert.equal(app.state.search, "");
  assert.equal(app.state.sort, "name");
  assert.equal(app.state.delayMinutes, null);
  assert.equal(app.state.ticketFare, null);
  assert.equal(app.state.eligibleOnly, false);
  // Preserved settings
  assert.equal(app.state.view, "table");
  assert.equal(app.state.flightDistance, "long");
  assert.equal(env.modeTabs[0].classList.contains("active"), true);
  assert.equal(env.modeTabs[0].getAttribute("aria-selected"), "true");

  // Copy link button (clipboard success and failure fallback)
  let copiedUrl = "";
  mockClipboard.writeText = async (url) => {
    copiedUrl = url;
  };
  const copyBtn = new MockElement("button", {
    classes: ["copy-link-btn"],
    dataset: { url: "https://www.lner.co.uk/support/delay-repay/", name: "LNER" },
  });
  await app.elements.grid.dispatchEvent({ type: "click", target: copyBtn });
  assert.equal(copiedUrl, "https://www.lner.co.uk/support/delay-repay/");
  assert.equal(app.elements.toast.textContent, "Copied LNER claim URL");

  mockClipboard.writeText = async () => {
    throw new Error("Clipboard denied");
  };
  await app.elements.grid.dispatchEvent({ type: "click", target: copyBtn });
  assert.equal(
    app.elements.toast.textContent,
    "URL: https://www.lner.co.uk/support/delay-repay/"
  );
});

test("init() loads operators on success and displays error state on HTTP or network failure", async () => {
  const originalFetch = globalThis.fetch;

  try {
    // Success path
    resetApp([]);
    globalThis.fetch = async (url) => {
      assert.equal(url, "data/operators.json");
      return {
        ok: true,
        status: 200,
        json: async () => REAL_OPERATORS,
      };
    };
    await app.init();
    assert.equal(app.state.operators.length, 48);
    assert.equal(app.elements.counts.all.textContent, "48");
    assert.equal(app.elements.resultsCount.textContent, "Showing 48 of 48 operators");

    // HTTP non-OK error path
    resetApp([]);
    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
    });
    await app.init();
    assert.equal(app.elements.resultsCount.textContent, "Failed to load operators dataset.");
    assert.ok(app.elements.grid.innerHTML.includes("Could not load operator data"));
    assert.ok(app.elements.grid.innerHTML.includes("HTTP 503"));

    // Network rejection path
    resetApp([]);
    globalThis.fetch = async () => {
      throw new Error("Network offline");
    };
    await app.init();
    assert.equal(app.elements.resultsCount.textContent, "Failed to load operators dataset.");
    assert.ok(app.elements.grid.innerHTML.includes("Network offline"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
