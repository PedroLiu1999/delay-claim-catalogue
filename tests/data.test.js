const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DATA_PATH = path.resolve(__dirname, "..", "data", "operators.json");

const REQUIRED_KEYS = [
  "id",
  "name",
  "mode",
  "country",
  "region",
  "claimUrl",
  "thresholdMinutes",
  "thresholdLabel",
  "compensationSummary",
  "claimDeadline",
  "scheme",
];

const STRING_KEYS = [
  "id",
  "name",
  "mode",
  "country",
  "region",
  "claimUrl",
  "thresholdLabel",
  "compensationSummary",
  "claimDeadline",
  "scheme",
];

const VALID_MODES = ["train", "flight", "bus"];
const VALID_REGIONS = ["UK", "Europe", "UK & Europe", "International"];

const operators = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

test("operators.json is an array of 60 operators", () => {
  assert.ok(Array.isArray(operators), "operators.json must export a JSON array");
  assert.equal(operators.length, 60);
});

test("mode counts match expected totals (train: 20, flight: 30, bus: 10)", () => {
  const modeCounts = { train: 0, flight: 0, bus: 0 };
  for (const op of operators) {
    assert.ok(VALID_MODES.includes(op.mode), `Invalid mode "${op.mode}" for ${op.id}`);
    modeCounts[op.mode] += 1;
  }
  assert.deepEqual(modeCounts, { train: 20, flight: 30, bus: 10 });
});

test("region counts match expected totals (UK: 19, Europe: 22, UK & Europe: 7, International: 12)", () => {
  const regionCounts = { UK: 0, Europe: 0, "UK & Europe": 0, International: 0 };
  for (const op of operators) {
    assert.ok(VALID_REGIONS.includes(op.region), `Invalid region "${op.region}" for ${op.id}`);
    regionCounts[op.region] += 1;
  }
  assert.deepEqual(regionCounts, { UK: 19, Europe: 22, "UK & Europe": 7, International: 12 });
});

const OPTIONAL_KEYS = ["logoUrl"];

test("every operator has all 11 required keys and only allowed optional keys", () => {
  const allowed = new Set([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
  for (const op of operators) {
    assert.equal(typeof op, "object");
    assert.notEqual(op, null);
    assert.ok(!Array.isArray(op));
    for (const key of REQUIRED_KEYS) {
      assert.ok(Object.prototype.hasOwnProperty.call(op, key), `Missing ${key} on "${op.id || op.name}"`);
    }
    for (const key of Object.keys(op)) {
      assert.ok(allowed.has(key), `Unexpected extra key "${key}" on "${op.id || op.name}"`);
    }
  }
});

test("all string fields are non-empty trimmed strings, id matches /^[a-z0-9-]+$/, and thresholdMinutes is a positive integer", () => {
  for (const op of operators) {
    for (const key of STRING_KEYS) {
      assert.equal(typeof op[key], "string", `${op.id}.${key} must be a string`);
      assert.ok(op[key].length > 0, `${op.id}.${key} must be non-empty`);
      assert.equal(op[key].trim(), op[key], `${op.id}.${key} must have no leading/trailing whitespace`);
    }

    assert.match(op.id, /^[a-z0-9-]+$/, `Invalid id format: ${op.id}`);
    assert.ok(
      Number.isInteger(op.thresholdMinutes) && op.thresholdMinutes > 0,
      `${op.id}.thresholdMinutes must be a positive integer, got ${op.thresholdMinutes}`
    );
  }
});

test("id, name, and claimUrl are each unique across all 60 operators", () => {
  const ids = new Set(operators.map((op) => op.id));
  const names = new Set(operators.map((op) => op.name));
  const urls = new Set(operators.map((op) => op.claimUrl));

  assert.equal(ids.size, 60, "Duplicate operator id detected");
  assert.equal(names.size, 60, "Duplicate operator name detected");
  assert.equal(urls.size, 60, "Duplicate operator claimUrl detected");
});

test("every claimUrl and optional logoUrl is a valid https:// URL with a non-empty hostname", () => {
  for (const op of operators) {
    let parsed;
    assert.doesNotThrow(() => {
      parsed = new URL(op.claimUrl);
    }, `Invalid URL for ${op.id}: ${op.claimUrl}`);
    assert.equal(parsed.protocol, "https:", `${op.id}.claimUrl must use https:`);
    assert.ok(parsed.hostname.length > 0, `${op.id}.claimUrl must have a non-empty hostname`);

    if (op.logoUrl !== undefined) {
      assert.equal(typeof op.logoUrl, "string", `${op.id}.logoUrl must be a string`);
      assert.equal(op.logoUrl.trim(), op.logoUrl, `${op.id}.logoUrl must have no leading/trailing whitespace`);
      let parsedLogo;
      assert.doesNotThrow(() => {
        parsedLogo = new URL(op.logoUrl);
      }, `Invalid logoUrl for ${op.id}: ${op.logoUrl}`);
      assert.equal(parsedLogo.protocol, "https:", `${op.id}.logoUrl must use https:`);
      assert.ok(parsedLogo.hostname.length > 0, `${op.id}.logoUrl must have a non-empty hostname`);
    }
  }
});
