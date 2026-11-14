const state = {
  operators: [],
  mode: "all",
  region: "all",
  search: "",
  sort: "name",
  view: "cards",
  delayMinutes: null,
  ticketFare: null,
  flightDistance: "short",
  eligibleOnly: false,
};

const MODE_LABELS = {
  train: "Train",
  flight: "Flight",
  bus: "Bus & Coach",
};

const FLIGHT_PAYOUTS = {
  short: "£220 / €250",
  medium: "£350 / €400",
  long: "£520 / €600",
};

const elements = {};

function refreshElements() {
  if (typeof document === "undefined") {
    return elements;
  }
  return Object.assign(elements, {
    headerStats: document.getElementById("header-stats"),
    grid: document.getElementById("operators-grid"),
    tableWrap: document.getElementById("operators-table-wrap"),
    tableBody: document.getElementById("operators-table-body"),
    emptyState: document.getElementById("empty-state"),
    resultsCount: document.getElementById("results-count"),
    searchInput: document.getElementById("search-input"),
    regionFilter: document.getElementById("region-filter"),
    sortSelect: document.getElementById("sort-select"),
    delayInput: document.getElementById("delay-minutes-input"),
    fareInput: document.getElementById("ticket-fare-input"),
    flightDistanceSelect: document.getElementById("flight-distance-select"),
    eligibleOnlyToggle: document.getElementById("eligible-only-toggle"),
    eligibilitySummary: document.getElementById("eligibility-summary"),
    clearDelayBtn: document.getElementById("clear-delay-btn"),
    resetFiltersBtn: document.getElementById("reset-filters-btn"),
    toast: document.getElementById("toast"),
    modeTabs: document.querySelectorAll(".mode-tab"),
    viewBtns: document.querySelectorAll(".view-btn"),
    presetBtns: document.querySelectorAll(".preset-btn[data-minutes]"),
    counts: {
      all: document.getElementById("count-all"),
      train: document.getElementById("count-train"),
      flight: document.getElementById("count-flight"),
      bus: document.getElementById("count-bus"),
    },
  });
}

refreshElements();

let toastTimer = null;

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 2400);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function sanitizeClaimUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.href;
    }
    return "#";
  } catch {
    return "#";
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isOperatorEligible(op) {
  if (state.delayMinutes === null || Number.isNaN(state.delayMinutes)) {
    return null;
  }
  return state.delayMinutes >= op.thresholdMinutes;
}

function updateCounts() {
  const counts = { all: state.operators.length, train: 0, flight: 0, bus: 0 };
  for (const op of state.operators) {
    if (counts[op.mode] !== undefined) {
      counts[op.mode] += 1;
    }
  }
  elements.counts.all.textContent = counts.all;
  elements.counts.train.textContent = counts.train;
  elements.counts.flight.textContent = counts.flight;
  elements.counts.bus.textContent = counts.bus;

  elements.headerStats.textContent = `${counts.all} verified operators · ${counts.train} train · ${counts.flight} flight · ${counts.bus} bus & coach`;
}

function formatMoney(amount) {
  if (!Number.isFinite(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function buildPayoutEstimate(mins) {
  const parts = [];
  const fare = state.ticketFare;

  if (fare !== null && Number.isFinite(fare) && fare > 0) {
    if (mins >= 120) {
      parts.push(`EU rail 50%: ${formatMoney(fare * 0.5)} · UK rail 100%: ${formatMoney(fare)}`);
    } else if (mins >= 60) {
      parts.push(`EU rail 25%: ${formatMoney(fare * 0.25)} · UK rail 100%: ${formatMoney(fare)}`);
    } else if (mins >= 30) {
      parts.push(`UK Delay Repay 50% (single): ${formatMoney(fare * 0.5)}`);
    } else if (mins >= 15) {
      parts.push(`UK Delay Repay 15 (25% single): ${formatMoney(fare * 0.25)}`);
    }
  }

  if (mins >= 180) {
    const payout = FLIGHT_PAYOUTS[state.flightDistance] || FLIGHT_PAYOUTS.short;
    parts.push(`UK261 / EU261 flight (${state.flightDistance}): ${payout}`);
  }

  return parts.length > 0 ? parts.join("  |  ") : "";
}

function updateEligibilitySummary(filteredOperators) {
  if (state.delayMinutes === null || Number.isNaN(state.delayMinutes)) {
    elements.eligibilitySummary.hidden = true;
    elements.eligibilitySummary.textContent = "";
    return;
  }

  const mins = state.delayMinutes;
  const eligibleCount = filteredOperators.filter((op) => mins >= op.thresholdMinutes).length;

  let ruleNote = "";
  if (mins < 15) {
    ruleNote =
      "Most UK & European operators do not pay statutory delay compensation under 15 minutes (cancellation refunds may still apply).";
  } else if (mins < 30) {
    ruleNote =
      "Qualifies for UK Delay Repay 15 rail operators (25% of single fare). Below 30m/60m thresholds for most EU rail, coaches, and flights.";
  } else if (mins < 60) {
    ruleNote =
      "Qualifies for UK Delay Repay 15 & 30 rail operators, SNCF G30, NS domestic, and Trenitalia Frecce. Below 60m EU rail and 3h flight thresholds.";
  } else if (mins < 120) {
    ruleNote =
      "Qualifies for most UK & European rail operators (25%–100% depending on operator). Coaches generally require 120+ mins departure delay; flights require 180+ mins.";
  } else if (mins < 180) {
    ruleNote =
      "Qualifies for UK & European rail (up to 50%–100%) and EU coach/bus departure delay rights (120+ mins). Flights require 180+ mins (3+ hours) arrival delay.";
  } else {
    ruleNote =
      "Qualifies across rail, coach/bus, and UK261/EU261 flight compensation (unless extraordinary circumstances apply).";
  }

  const payoutText = buildPayoutEstimate(mins);
  const payoutHtml = payoutText
    ? `<div class="payout-estimate">Estimated payout: ${escapeHtml(payoutText)}</div>`
    : "";

  elements.eligibilitySummary.hidden = false;
  elements.eligibilitySummary.innerHTML = `
    <div><strong>${mins} min delay:</strong> ${eligibleCount} of ${filteredOperators.length} shown operator(s) meet this threshold. ${escapeHtml(ruleNote)}</div>
    ${payoutHtml}
  `;
}

function getFilteredOperators() {
  const query = state.search.trim().toLowerCase();

  let list = state.operators.filter((op) => {
    if (state.mode !== "all" && op.mode !== state.mode) return false;

    if (state.region !== "all") {
      if (state.region === "UK" && !op.region.includes("UK")) return false;
      if (state.region === "Europe" && !op.region.includes("Europe")) return false;
      if (state.region === "UK & Europe" && op.region !== "UK & Europe") return false;
      if (state.region === "International" && op.region !== "International") return false;
    }

    if (query) {
      const haystack = `${op.name} ${op.country} ${op.region} ${op.scheme} ${op.compensationSummary}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (state.eligibleOnly && state.delayMinutes !== null && !Number.isNaN(state.delayMinutes)) {
      if (state.delayMinutes < op.thresholdMinutes) return false;
    }

    return true;
  });

  list = [...list].sort((a, b) => {
    if (state.sort === "threshold") {
      return a.thresholdMinutes - b.thresholdMinutes || a.name.localeCompare(b.name);
    }
    if (state.sort === "mode") {
      return a.mode.localeCompare(b.mode) || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });

  return list;
}

function renderCards(filtered) {
  elements.grid.innerHTML = filtered
    .map((op) => {
      const eligible = isOperatorEligible(op);
      const cardClass =
        eligible === true
          ? "operator-card is-eligible"
          : eligible === false
          ? "operator-card is-ineligible"
          : "operator-card";

      const eligibleBadge =
        eligible === true
          ? `<span class="eligible-badge">Threshold met</span>`
          : "";

      const domain = getHostname(op.claimUrl);
      const safeUrl = sanitizeClaimUrl(op.claimUrl);

      return `
        <article class="${cardClass}" data-id="${escapeAttr(op.id)}">
          <div class="card-header">
            <div class="badges-left">
              <span class="mode-badge mode-${escapeAttr(op.mode)}">${escapeHtml(MODE_LABELS[op.mode] || op.mode)}</span>
              <span class="country-tag">${escapeHtml(op.country)}</span>
            </div>
            ${eligibleBadge}
          </div>

          <div class="card-title-block">
            <h3>${escapeHtml(op.name)}</h3>
            <div class="scheme-row">
              <p class="scheme-text">${escapeHtml(op.scheme)}</p>
              <span class="domain-pill">${escapeHtml(domain)}</span>
            </div>
          </div>

          <dl class="card-facts">
            <div class="fact-row">
              <dt class="fact-label">Threshold</dt>
              <dd class="fact-value">${escapeHtml(op.thresholdLabel)}</dd>
            </div>
            <div class="fact-row">
              <dt class="fact-label">Compensation</dt>
              <dd class="fact-value">${escapeHtml(op.compensationSummary)}</dd>
            </div>
            <div class="fact-row">
              <dt class="fact-label">Deadline</dt>
              <dd class="fact-value">${escapeHtml(op.claimDeadline)}</dd>
            </div>
          </dl>

          <div class="card-actions">
            <a
              class="btn btn-primary"
              href="${escapeAttr(safeUrl)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Claim Page ↗
            </a>
            <button
              type="button"
              class="btn btn-ghost copy-link-btn"
              data-url="${escapeAttr(safeUrl)}"
              data-name="${escapeAttr(op.name)}"
              title="Copy official claim URL"
            >
              Copy URL
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTable(filtered) {
  elements.tableBody.innerHTML = filtered
    .map((op) => {
      const eligible = isOperatorEligible(op);
      const rowClass =
        eligible === true
          ? "is-eligible"
          : eligible === false
          ? "is-ineligible"
          : "";

      const safeUrl = sanitizeClaimUrl(op.claimUrl);

      return `
        <tr class="${rowClass}">
          <td>
            <div class="table-op-name">${escapeHtml(op.name)}</div>
            <div class="table-op-scheme">${escapeHtml(op.scheme)}</div>
          </td>
          <td><span class="mode-badge mode-${escapeAttr(op.mode)}">${escapeHtml(MODE_LABELS[op.mode] || op.mode)}</span></td>
          <td>${escapeHtml(op.country)}</td>
          <td>${escapeHtml(op.thresholdLabel)}</td>
          <td>${escapeHtml(op.compensationSummary)}</td>
          <td>${escapeHtml(op.claimDeadline)}</td>
          <td>
            <a
              class="btn btn-primary btn-sm"
              href="${escapeAttr(safeUrl)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Claim ↗
            </a>
          </td>
        </tr>
      `;
    })
    .join("");
}

function render() {
  const filtered = getFilteredOperators();
  updateEligibilitySummary(filtered);

  elements.resultsCount.textContent = `Showing ${filtered.length} of ${state.operators.length} operators`;

  if (filtered.length === 0) {
    elements.grid.hidden = true;
    elements.tableWrap.hidden = true;
    elements.grid.innerHTML = "";
    elements.tableBody.innerHTML = "";
    elements.emptyState.hidden = false;
    return;
  }

  elements.emptyState.hidden = true;

  if (state.view === "table") {
    elements.grid.hidden = true;
    elements.tableWrap.hidden = false;
    renderTable(filtered);
  } else {
    elements.tableWrap.hidden = true;
    elements.grid.hidden = false;
    renderCards(filtered);
  }
}

function syncPresetButtons() {
  elements.presetBtns.forEach((btn) => {
    const mins = Number(btn.dataset.minutes);
    const isActive = state.delayMinutes === mins;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });
}

function bindEvents() {
  const modeTabs = Array.from(elements.modeTabs);
  const activateModeTab = (tab) => {
    state.mode = tab.dataset.mode;
    modeTabs.forEach((t) => {
      const isActive = t === tab;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", String(isActive));
    });
    render();
  };

  modeTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      activateModeTab(tab);
    });

    tab.addEventListener("keydown", (e) => {
      let targetIndex = null;
      if (e.key === "ArrowRight") {
        targetIndex = (index + 1) % modeTabs.length;
      } else if (e.key === "ArrowLeft") {
        targetIndex = (index - 1 + modeTabs.length) % modeTabs.length;
      } else if (e.key === "Home") {
        targetIndex = 0;
      } else if (e.key === "End") {
        targetIndex = modeTabs.length - 1;
      }
      if (targetIndex !== null) {
        if (typeof e.preventDefault === "function") e.preventDefault();
        const targetTab = modeTabs[targetIndex];
        if (typeof targetTab.focus === "function") targetTab.focus();
        activateModeTab(targetTab);
      }
    });
  });

  elements.viewBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      elements.viewBtns.forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-pressed", String(isActive));
      });
      render();
    });
  });

  elements.searchInput.addEventListener("input", (e) => {
    state.search = e.target.value;
    render();
  });

  elements.regionFilter.addEventListener("change", (e) => {
    state.region = e.target.value;
    render();
  });

  elements.sortSelect.addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });

  elements.delayInput.addEventListener("input", (e) => {
    const raw = e.target.value.trim();
    if (raw === "") {
      state.delayMinutes = null;
    } else {
      const num = Number(raw);
      state.delayMinutes = Number.isFinite(num) ? Math.max(0, num) : null;
    }
    syncPresetButtons();
    render();
  });

  elements.fareInput.addEventListener("input", (e) => {
    const raw = e.target.value.trim();
    if (raw === "") {
      state.ticketFare = null;
    } else {
      const num = Number(raw);
      state.ticketFare = Number.isFinite(num) ? Math.max(0, num) : null;
    }
    render();
  });

  elements.flightDistanceSelect.addEventListener("change", (e) => {
    state.flightDistance = e.target.value;
    render();
  });

  elements.presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mins = Number(btn.dataset.minutes);
      state.delayMinutes = mins;
      elements.delayInput.value = String(mins);
      syncPresetButtons();
      render();
    });
  });

  elements.clearDelayBtn.addEventListener("click", () => {
    state.delayMinutes = null;
    state.ticketFare = null;
    state.eligibleOnly = false;
    elements.delayInput.value = "";
    elements.fareInput.value = "";
    elements.eligibleOnlyToggle.checked = false;
    syncPresetButtons();
    render();
  });

  elements.eligibleOnlyToggle.addEventListener("change", (e) => {
    state.eligibleOnly = e.target.checked;
    render();
  });

  elements.resetFiltersBtn.addEventListener("click", () => {
    state.mode = "all";
    state.region = "all";
    state.search = "";
    state.sort = "name";
    state.delayMinutes = null;
    state.ticketFare = null;
    state.eligibleOnly = false;

    elements.searchInput.value = "";
    elements.regionFilter.value = "all";
    elements.sortSelect.value = "name";
    elements.delayInput.value = "";
    elements.fareInput.value = "";
    elements.eligibleOnlyToggle.checked = false;
    syncPresetButtons();

    elements.modeTabs.forEach((t) => {
      const isActive = t.dataset.mode === "all";
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", String(isActive));
    });

    render();
  });

  elements.grid.addEventListener("click", async (e) => {
    const btn = e.target.closest(".copy-link-btn");
    if (!btn) return;
    const url = btn.dataset.url;
    const name = btn.dataset.name;
    try {
      await navigator.clipboard.writeText(url);
      showToast(`Copied ${name} claim URL`);
    } catch {
      showToast(`URL: ${url}`);
    }
  });
}

async function init() {
  refreshElements();
  bindEvents();
  try {
    const res = await fetch("data/operators.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Invalid operator catalogue payload");
    state.operators = data;
    updateCounts();
    render();
  } catch (err) {
    elements.grid.hidden = false;
    elements.tableWrap.hidden = true;
    elements.emptyState.hidden = true;
    elements.headerStats.textContent = "Unable to load verified operator directory.";
    elements.resultsCount.textContent = "Failed to load operators dataset.";
    elements.grid.innerHTML = `<div class="empty-state"><h3>Could not load operator data</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

if (
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  !globalThis.__DELAY_CLAIM_NO_AUTO_INIT__
) {
  init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    state,
    MODE_LABELS,
    FLIGHT_PAYOUTS,
    elements,
    refreshElements,
    showToast,
    escapeHtml,
    escapeAttr,
    sanitizeClaimUrl,
    getHostname,
    isOperatorEligible,
    updateCounts,
    formatMoney,
    buildPayoutEstimate,
    updateEligibilitySummary,
    getFilteredOperators,
    renderCards,
    renderTable,
    render,
    syncPresetButtons,
    bindEvents,
    init,
  };
}
