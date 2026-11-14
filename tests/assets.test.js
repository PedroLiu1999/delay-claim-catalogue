const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const INDEX_PATH = path.join(ROOT_DIR, "index.html");
const STYLES_PATH = path.join(ROOT_DIR, "styles.css");

const html = fs.readFileSync(INDEX_PATH, "utf8");
const css = fs.readFileSync(STYLES_PATH, "utf8");

test("index.html exists and is valid HTML5 with lang='en'", () => {
  assert.ok(html.length > 0);
  assert.match(html, /^<!DOCTYPE html>/i);
  assert.match(html, /<html\s+lang="en">/i);
});

test("index.html references styles.css, classic script app.js, and data/operators.json", () => {
  assert.match(html, /<link\s+rel="stylesheet"\s+href="styles\.css"\s*\/?>/i);
  assert.match(html, /<script\s+src="app\.js"><\/script>/i);
  assert.doesNotMatch(html, /<script[^>]+type=["']module["'][^>]+src=["']app\.js["']/i);
  assert.match(html, /href="data\/operators\.json"/i);
});

test("index.html contains all 21 required DOM IDs", () => {
  const requiredIds = [
    "header-stats",
    "eligible-only-toggle",
    "delay-minutes-input",
    "ticket-fare-input",
    "flight-distance-select",
    "clear-delay-btn",
    "eligibility-summary",
    "count-all",
    "count-train",
    "count-flight",
    "count-bus",
    "search-input",
    "region-filter",
    "sort-select",
    "results-count",
    "operators-grid",
    "operators-table-wrap",
    "operators-table-body",
    "empty-state",
    "reset-filters-btn",
    "toast",
  ];

  for (const id of requiredIds) {
    const pattern = new RegExp(`id=["']${id}["']`);
    assert.match(html, pattern, `Missing required DOM id="${id}" in index.html`);
  }
});

test("index.html contains required roles and ARIA attributes", () => {
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /role="group"/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /aria-selected="false"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-live="polite"/);
});

test("index.html defines expected mode tabs, view buttons, preset buttons, and select options", () => {
  for (const mode of ["all", "train", "flight", "bus"]) {
    assert.match(html, new RegExp(`class="[^"]*\\bmode-tab\\b[^"]*"[^>]*data-mode="${mode}"`));
  }

  for (const view of ["cards", "table"]) {
    assert.match(html, new RegExp(`class="[^"]*\\bview-btn\\b[^"]*"[^>]*data-view="${view}"`));
  }

  for (const minutes of ["15", "30", "60", "120", "180"]) {
    assert.match(html, new RegExp(`class="[^"]*\\bpreset-btn\\b[^"]*"[^>]*data-minutes="${minutes}"`));
  }

  const regionSelectMatch = html.match(/<select\s+id="region-filter">([\s\S]*?)<\/select>/);
  assert.ok(regionSelectMatch, "Missing #region-filter select element");
  for (const opt of ["all", "UK", "Europe", "UK & Europe"]) {
    assert.match(regionSelectMatch[1], new RegExp(`<option\\s+value="${opt}">`));
  }

  const sortSelectMatch = html.match(/<select\s+id="sort-select">([\s\S]*?)<\/select>/);
  assert.ok(sortSelectMatch, "Missing #sort-select select element");
  for (const opt of ["name", "threshold", "mode"]) {
    assert.match(sortSelectMatch[1], new RegExp(`<option\\s+value="${opt}">`));
  }

  const distanceSelectMatch = html.match(/<select\s+id="flight-distance-select"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(distanceSelectMatch, "Missing #flight-distance-select select element");
  for (const opt of ["short", "medium", "long"]) {
    assert.match(distanceSelectMatch[1], new RegExp(`<option\\s+value="${opt}">`));
  }
});

test("styles.css exists, is non-empty, and defines key layout and component classes", () => {
  assert.ok(css.trim().length > 0, "styles.css must be non-empty");
  const requiredClasses = [
    ".operators-grid",
    ".operator-card",
    ".operators-table",
    ".toast",
    ".empty-state",
    ".mode-tab",
    ".view-btn",
    ".preset-btn",
  ];
  for (const cls of requiredClasses) {
    assert.ok(css.includes(cls), `styles.css is missing selector ${cls}`);
  }
});
