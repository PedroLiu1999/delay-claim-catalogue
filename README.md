# UK & Europe Delay Claim Catalogue

A searchable, filterable directory of official delay compensation portals for **48 UK and European train, flight, and bus/coach operators**, with a built-in delay eligibility and payout estimator.

## Features

- **Direct Official Links**: Links straight to each operator's official compensation or Delay Repay portal (avoiding third-party claim fees).
- **Delay Eligibility & Payout Helper**: Enter your delay duration (or use presets `15m`, `30m`, `60m`, `120m`, `180m+`), optional ticket fare, and flight distance to highlight eligible operators and estimate compensation.
- **Search, Filter & Sort**: Filter by transport mode (`Train`, `Flight`, `Bus & Coach`), region (`UK`, `Europe`, `UK & Europe`), or keyword, and sort by name, lowest threshold, or mode.
- **Cards & Table Views**: Switch between card layout and a compact directory table.
- **Structured JSON Dataset**: Powered by [`data/operators.json`](data/operators.json).

## Local Preview

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.
