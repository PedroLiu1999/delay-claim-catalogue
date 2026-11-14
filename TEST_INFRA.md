# E2E Test Infrastructure (`tests/e2e/`)

## Overview
The E2E test suite exercises the served static web application (`index.html`, `styles.css`, `app.js`, `data/operators.json`) in a real headless Chromium browser (`/usr/bin/chromium`) using **zero external npm dependencies**.

## Stack & Requirements
- **Runtime**: Node.js `v24+` (`node:test`, `node:assert/strict`, `node:http`, native `WebSocket`, native `fetch`)
- **Browser**: `/usr/bin/chromium` (headless via Chrome DevTools Protocol)
- **Harness**: [`tests/e2e/helpers/cdp.js`](file:///home/antigravity/delay-claim-catalogue/tests/e2e/helpers/cdp.js)
  - Spawns a per-test local `node:http` static server bound to `127.0.0.1:0` with optional per-route status/delay/body overrides (for testing 404/500/malformed JSON/slow responses).
  - Launches headless Chromium (`--headless --no-sandbox --disable-gpu --remote-debugging-port=0 --user-data-dir=<tmp>`) with `detached: true` for process-group isolation.
  - Creates an isolated `BrowserContext` per test (`Target.createBrowserContext`), tracks `Runtime.exceptionThrown`, `Runtime.consoleAPICalled`, and local-origin `Network.responseReceived`/`Network.loadingFailed` errors (ignoring external `fonts.googleapis.com`/`fonts.gstatic.com` and `/favicon.ico`).
  - Cleans up deterministically in `finally` (`Browser.close`, WebSocket close, process-group `SIGKILL`, `fs.rmSync` with retries).

## How to Run
```bash
node --test tests/e2e/*.test.js
```

## Suite Structure (4-Tier Methodology)
1. **Tier 1 — Feature Coverage** (`tests/e2e/tier1_features.test.js`, 41 tests across F1–F8, >=5 per feature)
2. **Tier 2 — Boundary & Corner Cases** (`tests/e2e/tier2_boundaries.test.js`, 40 tests across F1–F8, 5 per feature)
3. **Tier 3 — Cross-Feature Combinations** (`tests/e2e/tier3_combinations.test.js`, 8 pairwise tests C1–C8)
4. **Tier 4 — Real-World Application Scenarios** (`tests/e2e/tier4_scenarios.test.js`, 6 end-to-end scenarios S1–S6)
