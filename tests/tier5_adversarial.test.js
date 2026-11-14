const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");

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
    this.focused = false;
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

  focus() {
    this.focused = true;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  async dispatchEvent(event = {}) {
    const handlers = this.listeners.get(event.type) || [];
    let defaultPrevented = false;
    const evt = {
      target: this,
      currentTarget: this,
      preventDefault() {
        defaultPrevented = true;
      },
      ...event,
    };
    for (const handler of handlers) {
      await handler(evt);
    }
    return defaultPrevented;
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

  register("header-stats", "p", { textContent: "Loading verified operator directory..." });
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
      attributes: { role: "tab", "aria-selected": String(idx === 0) },
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
      attributes: { "aria-pressed": "false" },
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

  return { documentMock, byId, modeTabs, viewBtns, presetBtns };
}

let env = createDomEnvironment();
globalThis.__DELAY_CLAIM_NO_AUTO_INIT__ = true;
globalThis.window = {};
globalThis.document = env.documentMock;
const app = require("../app.js");

function resetApp(operators = []) {
  env = createDomEnvironment();
  globalThis.document = env.documentMock;
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

test("escapeAttr escapes &, <, >, \", and ' and sanitizeClaimUrl blocks non-http(s) URLs", () => {
  assert.equal(
    app.escapeAttr(`a & b < c > d " e ' f`),
    "a &amp; b &lt; c &gt; d &quot; e &#39; f"
  );

  assert.equal(app.sanitizeClaimUrl("https://example.com/claim?a=1"), "https://example.com/claim?a=1");
  assert.equal(app.sanitizeClaimUrl("http://example.com/claim"), "http://example.com/claim");
  assert.equal(app.sanitizeClaimUrl("javascript:window.__xss=2"), "#");
  assert.equal(app.sanitizeClaimUrl("data:text/html,<script>alert(1)</script>"), "#");
  assert.equal(app.sanitizeClaimUrl("vbscript:msgbox(1)"), "#");
  assert.equal(app.sanitizeClaimUrl("not-a-url"), "#");
  assert.equal(app.sanitizeClaimUrl(""), "#");
});

test("renderCards and renderTable neutralize attribute-breakout XSS payloads and unsafe claimUrls", () => {
  resetApp();
  const payload = '" autofocus onfocus="window.__xss=1';
  const maliciousOps = [
    {
      id: `bad${payload}`,
      name: `Malicious ${payload}`,
      mode: `train${payload}`,
      country: "UK",
      region: "UK",
      scheme: "Delay Repay",
      thresholdMinutes: 15,
      thresholdLabel: "15 mins",
      compensationSummary: "25% single",
      claimDeadline: "28 days",
      claimUrl: "javascript:window.__xss=2",
    },
    {
      id: "data-url-op",
      name: "Data URL 'Operator'",
      mode: "flight",
      country: "EU",
      region: "Europe",
      scheme: "EU261",
      thresholdMinutes: 180,
      thresholdLabel: "180 mins",
      compensationSummary: "€250",
      claimDeadline: "2 years",
      claimUrl: "data:text/html,<script>window.__xss=3</script>",
    },
  ];

  app.renderCards(maliciousOps);
  const cardsHtml = app.elements.grid.innerHTML;
  assert.ok(
    !/<[a-zA-Z0-9-]+\b[^>]*\sonfocus="/.test(cardsHtml),
    "Unescaped onfocus attribute in cards"
  );
  assert.ok(cardsHtml.includes('data-id="bad&quot; autofocus onfocus=&quot;window.__xss=1"'));
  assert.ok(cardsHtml.includes('data-name="Malicious &quot; autofocus onfocus=&quot;window.__xss=1"'));
  assert.ok(!cardsHtml.includes("javascript:window.__xss=2"), "javascript: URL must not appear in cards");
  assert.ok(!cardsHtml.includes("data:text/html"), "data: URL must not appear in cards");
  assert.ok(cardsHtml.includes('href="#"'));
  assert.ok(cardsHtml.includes('data-url="#"'));

  app.renderTable(maliciousOps);
  const tableHtml = app.elements.tableBody.innerHTML;
  assert.ok(
    !/<[a-zA-Z0-9-]+\b[^>]*\sonfocus="/.test(tableHtml),
    "Unescaped onfocus attribute in table"
  );
  assert.ok(!tableHtml.includes("javascript:window.__xss=2"), "javascript: URL must not appear in table");
  assert.ok(!tableHtml.includes("data:text/html"), "data: URL must not appear in table");
  assert.ok(tableHtml.includes('href="#"'));
});

test("init() handles non-array JSON payloads and empty array gracefully with correct DOM visibility", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const badPayload of [{}, null, "bad", 123]) {
      resetApp();
      app.elements.grid.hidden = true;
      app.elements.tableWrap.hidden = false;
      app.elements.emptyState.hidden = false;

      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => badPayload,
      });

      await app.init();
      assert.equal(app.elements.grid.hidden, false);
      assert.equal(app.elements.tableWrap.hidden, true);
      assert.equal(app.elements.emptyState.hidden, true);
      assert.notEqual(
        app.elements.headerStats.textContent,
        "Loading verified operator directory..."
      );
      assert.equal(app.elements.resultsCount.textContent, "Failed to load operators dataset.");
      assert.ok(app.elements.grid.innerHTML.includes("Invalid operator catalogue payload"));
    }

    // Empty array [] should succeed and show empty state
    resetApp();
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    });
    await app.init();
    assert.equal(app.state.operators.length, 0);
    assert.equal(app.elements.resultsCount.textContent, "Showing 0 of 0 operators");
    assert.equal(app.elements.emptyState.hidden, false);
    assert.equal(app.elements.grid.hidden, true);
    assert.equal(app.elements.tableWrap.hidden, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("numeric input hardening handles 1e309, Infinity, abc, negative, 0, decimals, and unknown flightDistance", async () => {
  resetApp([]);
  app.bindEvents();

  for (const [raw, expected] of [
    ["1e309", null],
    ["Infinity", null],
    ["abc", null],
    ["-10", 0],
    ["0", 0],
    ["15.5", 15.5],
  ]) {
    await app.elements.delayInput.dispatchEvent({ type: "input", target: { value: raw } });
    assert.equal(app.state.delayMinutes, expected, `delayInput(${raw})`);

    await app.elements.fareInput.dispatchEvent({ type: "input", target: { value: raw } });
    assert.equal(app.state.ticketFare, expected, `fareInput(${raw})`);
  }

  assert.equal(app.formatMoney(Infinity), "0");
  assert.equal(app.formatMoney(Number.NaN), "0");

  app.state.ticketFare = null;
  app.state.flightDistance = "ultra-unknown";
  const payout = app.buildPayoutEstimate(180);
  assert.ok(payout.includes(app.FLIGHT_PAYOUTS.short));
});

test("syncPresetButtons updates aria-pressed and modeTabs supports ArrowRight/ArrowLeft/Home/End keyboard navigation", async () => {
  resetApp([]);
  app.bindEvents();

  // Preset buttons aria-pressed
  app.state.delayMinutes = 60;
  app.syncPresetButtons();
  assert.equal(env.presetBtns[2].getAttribute("aria-pressed"), "true");
  assert.equal(env.presetBtns[0].getAttribute("aria-pressed"), "false");

  // Keyboard navigation on modeTabs
  await env.modeTabs[0].dispatchEvent({ type: "keydown", key: "ArrowRight" });
  assert.equal(app.state.mode, "train");
  assert.equal(env.modeTabs[1].focused, true);
  assert.equal(env.modeTabs[1].getAttribute("aria-selected"), "true");
  assert.equal(env.modeTabs[0].getAttribute("aria-selected"), "false");

  await env.modeTabs[1].dispatchEvent({ type: "keydown", key: "End" });
  assert.equal(app.state.mode, "bus");
  assert.equal(env.modeTabs[3].focused, true);

  // Wrap around from last tab on ArrowRight
  await env.modeTabs[3].dispatchEvent({ type: "keydown", key: "ArrowRight" });
  assert.equal(app.state.mode, "all");
  assert.equal(env.modeTabs[0].focused, true);

  // Wrap around from first tab on ArrowLeft
  await env.modeTabs[0].dispatchEvent({ type: "keydown", key: "ArrowLeft" });
  assert.equal(app.state.mode, "bus");
  assert.equal(env.modeTabs[3].focused, true);

  await env.modeTabs[3].dispatchEvent({ type: "keydown", key: "Home" });
  assert.equal(app.state.mode, "all");
  assert.equal(env.modeTabs[0].focused, true);
});

test("release.yml tag extraction and prerelease logic handles annotated multiline, lightweight, rc, and +metadata tags, and workflows avoid unsafe interpolation", () => {
  const workflowDir = path.join(ROOT_DIR, ".github/workflows");
  for (const file of fs.readdirSync(workflowDir)) {
    const content = fs.readFileSync(path.join(workflowDir, file), "utf8");
    const runBlocks = content.match(/run:\s*\|?[\s\S]*?(?=\n\s*(?:- name:|uses:|env:|if:|with:|jobs:|needs:|$))/g) || [];
    for (const block of runBlocks) {
      assert.ok(
        !/\$\{\{\s*github\./.test(block),
        `${file} must not interpolate \${{ github.* }} directly inside run:`
      );
    }
  }

  // Test release.yml bash logic against a temporary git repository
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "dcc-release-test-"));
  try {
    const git = (args) =>
      execFileSync("git", args, { cwd: tmpRepo, encoding: "utf8" }).trim();

    git(["init"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(tmpRepo, "README.md"), "hello\n");
    git(["add", "README.md"]);
    git(["commit", "-m", "feat: initial commit\n\nCommit body line"]);

    git(["tag", "-a", "v1.0.0", "-m", "Release 1.0.0\n\n- Added feature A\n- Fixed bug B"]);
    git(["tag", "v1.0.1"]); // lightweight
    git(["tag", "-a", "v1.1.0-rc.1", "-m", "RC 1"]);
    git(["tag", "-a", "v1.0.0+2026-11", "-m", "Build metadata release"]);

    const runReleaseLogic = (tagName) => {
      const script = `
        set -euo pipefail
        TAG_NAME="$1"
        OBJ_TYPE="$(git cat-file -t "refs/tags/\${TAG_NAME}")"
        if [ "$OBJ_TYPE" = "tag" ]; then
          NOTES="$(git for-each-ref --format='%(contents)' "refs/tags/\${TAG_NAME}")"
        else
          NOTES="$(git log -1 --pretty=%B "refs/tags/\${TAG_NAME}")"
        fi
        if [ -z "$(printf '%s' "$NOTES" | tr -d '[:space:]')" ]; then
          NOTES="Release \${TAG_NAME}"
        fi
        IS_PRERELEASE=false
        if [[ "\${TAG_NAME%%+*}" == *-* ]]; then
          IS_PRERELEASE=true
        fi
        printf '%s\n__PRERELEASE__=%s\n' "$NOTES" "$IS_PRERELEASE"
      `;
      return execFileSync("bash", ["-c", script, "--", tagName], {
        cwd: tmpRepo,
        encoding: "utf8",
      });
    };

    const annotatedOut = runReleaseLogic("v1.0.0");
    assert.ok(annotatedOut.includes("Release 1.0.0"));
    assert.ok(annotatedOut.includes("- Added feature A"));
    assert.ok(annotatedOut.includes("- Fixed bug B"));
    assert.ok(annotatedOut.includes("__PRERELEASE__=false"));

    const lightweightOut = runReleaseLogic("v1.0.1");
    assert.ok(lightweightOut.includes("feat: initial commit"));
    assert.ok(lightweightOut.includes("Commit body line"));
    assert.ok(lightweightOut.includes("__PRERELEASE__=false"));

    const rcOut = runReleaseLogic("v1.1.0-rc.1");
    assert.ok(rcOut.includes("RC 1"));
    assert.ok(rcOut.includes("__PRERELEASE__=true"));

    const buildMetaOut = runReleaseLogic("v1.0.0+2026-11");
    assert.ok(buildMetaOut.includes("Build metadata release"));
    assert.ok(buildMetaOut.includes("__PRERELEASE__=false"));
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});
