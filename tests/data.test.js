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
const VALID_REGIONS = ["UK", "Europe", "UK & Europe"];

const operators = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

test("operators.json is an array of 48 operators", () => {
  assert.ok(Array.isArray(operators), "operators.json must export a JSON array");
  assert.equal(operators.length, 48);
});

test("mode counts match expected totals (train: 20, flight: 18, bus: 10)", () => {
  const modeCounts = { train: 0, flight: 0, bus: 0 };
  for (const op of operators) {
    assert.ok(VALID_MODES.includes(op.mode), `Invalid mode "${op.mode}" for ${op.id}`);
    modeCounts[op.mode] += 1;
  }
  assert.deepEqual(modeCounts, { train: 20, flight: 18, bus: 10 });
});

test("region counts match expected totals (UK: 19, Europe: 22, UK & Europe: 7)", () => {
  const regionCounts = { UK: 0, Europe: 0, "UK & Europe": 0 };
  for (const op of operators) {
    assert.ok(VALID_REGIONS.includes(op.region), `Invalid region "${op.region}" for ${op.id}`);
    regionCounts[op.region] += 1;
  }
  assert.deepEqual(regionCounts, { UK: 19, Europe: 22, "UK & Europe": 7 });
});

test("every operator has exact 11 required keys with no missing or extra keys", () => {
  const expected = [...REQUIRED_KEYS].sort();
  for (const op of operators) {
    assert.equal(typeof op, "object");
    assert.notEqual(op, null);
    assert.ok(!Array.isArray(op));
    const actual = Object.keys(op).sort();
    assert.deepEqual(actual, expected, `Key mismatch for operator "${op.id || op.name}"`);
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

test("id, name, and claimUrl are each unique across all 48 operators", () => {
  const ids = new Set(operators.map((op) => op.id));
  const names = new Set(operators.map((op) => op.name));
  const urls = new Set(operators.map((op) => op.claimUrl));

  assert.equal(ids.size, 48, "Duplicate operator id detected");
  assert.equal(names.size, 48, "Duplicate operator name detected");
  assert.equal(urls.size, 48, "Duplicate operator claimUrl detected");
});

test("every claimUrl is a valid https:// URL with a non-empty hostname", () => {
  for (const op of operators) {
    let parsed;
    assert.doesNotThrow(() => {
      parsed = new URL(op.claimUrl);
    }, `Invalid URL for ${op.id}: ${op.claimUrl}`);
    assert.equal(parsed.protocol, "https:", `${op.id}.claimUrl must use https:`);
    assert.ok(parsed.hostname.length > 0, `${op.id}.claimUrl must have a non-empty hostname`);
  }
});
