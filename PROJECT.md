# Project: delay-claim-catalogue

## Architecture
- **Application**: Zero-build static web application (`index.html`, `styles.css`, `app.js`, `data/operators.json`) hosted on GitHub Pages (`https://pedroliu1999.github.io/delay-claim-catalogue/`).
- **Testing Architecture**:
  - **Unit, Data & Integration Tests (`tests/`)**: Node.js v24 built-in test runner (`node --test`) with zero external npm dependencies for core unit/data/DOM-logic tests, plus headless Chromium verification.
  - **E2E Testing Track (`tests/e2e/`)**: Opaque-box requirement-driven 4-tier test suite (Tiers 1–4) exercising the served static site and workflows.
- **Automation Architecture (`.github/workflows/`)**:
  - `ci.yml`: Runs test suite on `push` (`main`), `pull_request` (`main`), and `workflow_dispatch`.
  - `cd.yml`: Runs tests then stages static site files (`index.html`, `styles.css`, `app.js`, `data/`) into `_site/` and deploys to GitHub Pages (`build_type: workflow`).
  - `release.yml`: Triggered on `v*` tags; extracts the annotated tag message and creates a GitHub Release with those release notes.

## Feature Inventory
Every feature from the Survey phase is assigned to a milestone below:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Repository Hygiene (`.gitignore`) | Ignore `.agents/`, `node_modules/`, `coverage/`, `test-results/`, `_site/`, `dist/`, OS/editor files | M1 | Survey 3 |
| 2 | Test Runner Setup (`package.json`) | Define `npm test` (`node --test`) and `npm run test:e2e` scripts with Node.js >=20 | M1 | Survey 2 |
| 3 | Data & Schema Validation Tests | Validate `data/operators.json` (48 operators, 11 required fields, enums, unique `id`/`name`/`claimUrl`, `https://` URLs, positive int `thresholdMinutes`) | M1 | Survey 2 |
| 4 | Frontend Unit & DOM Logic Tests | Test `app.js` functions (filtering, `UK & Europe` substring matching, sorting, eligibility, payout estimation, rendering, event handlers, error states) | M1 | Survey 1 |
| 5 | HTML/CSS & Static Asset Tests | Verify `index.html` DOM IDs/attributes required by `app.js` and `styles.css` integrity | M1 | Survey 1 |
| 6 | CI Workflow (`.github/workflows/ci.yml`) | Run tests on `push` to `main`, `pull_request` to `main`, and `workflow_dispatch` | M2 | Survey 3 |
| 7 | CD GitHub Pages Workflow (`.github/workflows/cd.yml`) | Gate on tests, stage only static site assets into `_site/`, deploy via `actions/deploy-pages@v4` with `pages: write` & `id-token: write` | M2 | Survey 3 |
| 8 | GitHub Pages Workflow Mode | Configure `PedroLiu1999/delay-claim-catalogue` Pages `build_type` to `"workflow"` | M2 | Survey 3 |
| 9 | Release Workflow (`.github/workflows/release.yml`) | Trigger on `v*` tags, `fetch-depth: 0`, extract tag annotation via `git cat-file -t` & `git for-each-ref`, create GitHub Release via `gh release create` with `contents: write` | M3 | Survey 3 |
| 10 | E2E Test Suite (Tiers 1–4) | Requirement-driven opaque-box E2E tests covering all features, boundaries, interactions, and scenarios | E2E Track | Survey 1-3 |
| 11 | Final E2E Pass & Tier 5 Hardening | Pass 100% of Tier 1–4 E2E tests and run Tier 5 adversarial coverage hardening | M4 | Project Pattern |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Test Suite & Repo Hygiene | `.gitignore`, `package.json`, `app.js` browser-safe export/init guard (if needed), `tests/` (data, assets, unit/DOM tests) | none | DONE (`25/25` tests pass) |
| M2 | CI & CD GitHub Actions Workflows | `.github/workflows/ci.yml`, `.github/workflows/cd.yml`, GitHub Pages `build_type=workflow` configuration | M1 | DONE (`ci.yml`, `cd.yml`, Pages `workflow` active) |
| M3 | Release GitHub Actions Workflow | `.github/workflows/release.yml` for `v*` tags using tag annotation as release notes | M1 | DONE (`release.yml` verified) |
| M4 | Final Milestone: E2E Pass & Tier 5 Hardening | Pass 100% of E2E tests (`TEST_READY.md`) and complete Tier 5 adversarial hardening | M1, M2, M3, E2E Track | DONE (`31/31` unit + `100/100` E2E pass) |

## Interface Contracts
### `package.json` ↔ CI / CD Workflows
- `npm test` runs `node --test tests/*.test.js` (or `tests/unit/**/*.test.js`) and exits `0` on pass, non-zero on failure, requiring zero external network access.
- `app.js` MUST remain 100% compatible with `<script src="app.js"></script>` in browsers (no ES module `import`/`export` syntax that breaks classic script tags). If CommonJS exports are added, guard with `if (typeof module !== "undefined" && module.exports)` and guard auto-init with `if (typeof window !== "undefined" && typeof document !== "undefined" && !globalThis.__DELAY_CLAIM_NO_AUTO_INIT__)`.

### Static Site ↔ CD Workflow (`cd.yml`)
- Only static runtime files (`index.html`, `styles.css`, `app.js`, `data/operators.json`) are copied to `_site/` for `actions/upload-pages-artifact@v3`.
- Test files (`tests/`), `package.json`, `.github/`, and `.agents/` MUST NOT be included in `_site/`.

### Git Tag ↔ Release Workflow (`release.yml`)
- Trigger: `push.tags: ['v*']`.
- Annotated tags (`git tag -a vX.Y.Z -m "..."`): `git for-each-ref --format='%(contents)' "refs/tags/${TAG_NAME}"` extracts the exact annotation body.
- Lightweight tags: falls back to commit message (`git log -1 --pretty=%B`), with `"Release ${TAG_NAME}"` fallback if empty.
- Prerelease tags (containing `-`, e.g. `v1.0.0-rc.1`): passed `--prerelease` to `gh release create`.

## Code Layout
- `/home/antigravity/delay-claim-catalogue/`
  - `index.html`, `styles.css`, `app.js`, `README.md`, `data/operators.json` (existing app)
  - `.gitignore` (M1)
  - `package.json` (M1)
  - `tests/` (M1 unit/data/asset tests; `tests/e2e/` for E2E Testing Track)
  - `.github/workflows/`
    - `ci.yml` (M2)
    - `cd.yml` (M2)
    - `release.yml` (M3)
