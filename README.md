# UK & Europe Delay Claim Catalogue

[![Live Demo — GitHub Pages](https://img.shields.io/badge/Live_Site-GitHub_Pages-2563eb?style=flat-square&logo=github)](https://pedroliu1999.github.io/delay-claim-catalogue/)

A zero-build, searchable directory of official delay compensation portals for **60 train, flight, and bus/coach operators** across the UK, Europe, and international routes (`20` train · `30` flight · `10` bus & coach), complete with an interactive delay eligibility and payout estimator.

**Live Application:** [https://pedroliu1999.github.io/delay-claim-catalogue/](https://pedroliu1999.github.io/delay-claim-catalogue/)

---

## Features

- **Direct Official Claim Portals**: Verified `https://` links straight to each operator's official compensation or Delay Repay form—helping passengers claim directly and avoid third-party commission fees.
- **Delay Eligibility & Payout Helper**:
  - Enter a delay duration (`0–2880` mins) or pick quick presets (`15m`, `30m`, `60m`, `120m`, `180m+`).
  - Toggle **Show eligible only** to filter down to operators whose minimum delay threshold is met.
  - Enter an optional **ticket fare** (`£/€`) to estimate UK Delay Repay (`25%` / `50%` / `100%`) and EU Rail (`25%` / `50%`) payouts.
  - Select **flight distance** (`short` ≤1,500 km, `medium` 1,500–3,500 km, `long` >3,500 km) to view statutory UK261 / EU261 compensation (`£220 / €250`, `£350 / €400`, `£520 / €600` at `180m+`).
- **Search, Filter & Sort**:
  - Filter by transport mode (`All`, `Train`, `Flight`, `Bus & Coach`) with live count badges and keyboard navigation (`ArrowLeft`, `ArrowRight`, `Home`, `End`).
  - Filter by region (`All Regions`, `UK`, `Europe`, `UK & Europe`, `International`).
  - Instant keyword search across operator name, country, region, scheme, and compensation summary.
  - Sort by **Name (A–Z)**, **Lowest Threshold**, or **Transport Mode**.
- **Cards & Table Views**: Switch between a rich card grid (with operator logos, threshold badges, and one-click **Copy URL**) and a compact comparison table.
- **Regulations & Official Guidance**: Curated reference links to statutory passenger rights and regulators, including National Rail, ORR, UK CAA (`UK261`), Your Europe, and EUR-Lex (`Regulation (EU) 2021/782`, `EC 261/2004`, and `EU 181/2011`).
- **Open JSON Dataset**: View or download the underlying dataset directly from [`data/operators.json`](data/operators.json).

---

## Dataset Schema (`data/operators.json`)

Each entry in [`data/operators.json`](data/operators.json) follows a validated schema:

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique slug identifier (e.g. `"lner"`, `"british-airways"`) |
| `name` | `string` | Official operator display name |
| `mode` | `"train" \| "flight" \| "bus"` | Transport mode category |
| `country` | `string` | Primary country or operating jurisdiction |
| `region` | `"UK" \| "Europe" \| "UK & Europe" \| "International"` | Geographic region used by the region filter |
| `claimUrl` | `string` | Official `https://` delay compensation / claim portal URL |
| `thresholdMinutes` | `number` | Minimum delay in minutes required to qualify |
| `thresholdLabel` | `string` | Human-readable threshold summary (e.g. `"15+ mins"`, `"180+ mins (3+ hours arrival)"`) |
| `compensationSummary` | `string` | Summary of statutory or charter payout tiers |
| `claimDeadline` | `string` | Typical window or limitation period to submit a claim |
| `scheme` | `string` | Applicable scheme or regulation (e.g. `"Delay Repay 15"`, `"UK261 / EU261"`) |
| `logoUrl` | `string` | Operator icon/favicon URL (`https://`) with automatic fallback handling |

---

## Local Development & Preview

No build step or external runtime dependencies are required. Serve the repository root with any static HTTP server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

---

## Testing

The project uses Node.js's built-in test runner (`node --test`) for unit, schema, DOM logic, and end-to-end headless browser tests:

```bash
# Run unit, data schema, and static asset tests
npm test

# Run end-to-end (E2E) test suite
npm run test:e2e
```

---

## Project Structure

```text
.
├── index.html                 # Main application markup & statutory guidance section
├── styles.css                 # Responsive stylesheet & layout themes
├── app.js                     # Filtering, eligibility/payout calculator, and DOM rendering
├── data/
│   └── operators.json         # Verified catalogue of 60 train, flight, and bus operators
├── tests/                     # Unit, schema validation, and E2E test suites
└── .github/workflows/
    ├── ci.yml                 # Continuous integration (unit + E2E tests on push/PR)
    ├── cd.yml                 # Automated deployment to GitHub Pages
    └── release.yml            # Automated GitHub Releases on v* tags
```

