import { createColorResolver } from "./src/color-scale.js";
import { profileLogLines } from "./src/profiler.js";
import { createVirtualList } from "./src/virtual-list.js";

const elements = {
  analyzeBtn: document.querySelector("#analyzeBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  contextAfter: document.querySelector("#contextAfter"),
  contextBefore: document.querySelector("#contextBefore"),
  filterCritical: document.querySelector("#filterCritical"),
  filterHot: document.querySelector("#filterHot"),
  filterWarm: document.querySelector("#filterWarm"),
  jumpHotBtn: document.querySelector("#jumpHotBtn"),
  lineCountText: document.querySelector("#lineCountText"),
  logInput: document.querySelector("#logInput"),
  modeInputs: document.querySelectorAll('input[name="mode"]'),
  resultsViewport: document.querySelector("#resultsViewport"),
  searchInput: document.querySelector("#searchInput"),
  statusText: document.querySelector("#statusText"),
  summaryGrid: document.querySelector("#summaryGrid"),
  thresholdWarm: document.querySelector("#thresholdWarm"),
  thresholdHot: document.querySelector("#thresholdHot"),
  thresholdCritical: document.querySelector("#thresholdCritical")
};

const state = {
  contextAfter: 2,
  contextBefore: 2,
  filterBands: {
    critical: false,
    hot: false,
    warm: false
  },
  mode: "relative",
  profile: null,
  renderedRows: [],
  searchTerm: "",
  thresholds: {
    warm: 50,
    hot: 200,
    critical: 1000
  }
};

const vlist = createVirtualList(elements.resultsViewport, {
  rowHeight: 24,
  overscan: 16,
  renderRow: (item) => {
    const row = document.createElement("div");
    row.className = "vlist-row";
    row.style.top = `${item.top}px`;
    row.style.background = item.background;

    if (!item.hasTimestamp) {
      row.classList.add("missing-ts");
    }

    if (item.filteredOut) {
      row.classList.add("filtered-out");
    }

    const lineNo = document.createElement("span");
    lineNo.className = "line-no";
    lineNo.textContent = `#${item.lineNumber}`;

    const latency = document.createElement("span");
    latency.className = "latency";
    latency.textContent = item.durationLabel;

    const text = document.createElement("span");
    text.className = "text";
    text.textContent = item.raw;

    row.append(lineNo, latency, text);
    return row;
  }
});

function getThresholds() {
  const warm = Number(elements.thresholdWarm.value);
  const hot = Number(elements.thresholdHot.value);
  const critical = Number(elements.thresholdCritical.value);
  if (!Number.isFinite(warm) || !Number.isFinite(hot) || !Number.isFinite(critical)) {
    return state.thresholds;
  }

  const sorted = [Math.max(0, warm), Math.max(0, hot), Math.max(0, critical)].sort((a, b) => a - b);
  return {
    warm: sorted[0],
    hot: sorted[1],
    critical: sorted[2]
  };
}

function activeMode() {
  for (const input of elements.modeInputs) {
    if (input.checked) {
      return input.value;
    }
  }
  return "relative";
}

function formatMs(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}s`;
  }
  return `${Math.round(value)}ms`;
}

function computeBandCounts(lines, thresholds) {
  const counts = {
    warm: 0,
    hot: 0,
    critical: 0
  };

  for (const line of lines) {
    if (!Number.isFinite(line.durationMs)) {
      continue;
    }
    if (line.durationMs >= thresholds.warm) {
      counts.warm += 1;
    }
    if (line.durationMs >= thresholds.hot) {
      counts.hot += 1;
    }
    if (line.durationMs >= thresholds.critical) {
      counts.critical += 1;
    }
  }

  return counts;
}

function classifyBand(durationMs, thresholds) {
  if (!Number.isFinite(durationMs)) {
    return "none";
  }
  if (durationMs >= thresholds.critical) {
    return "critical";
  }
  if (durationMs >= thresholds.hot) {
    return "hot";
  }
  if (durationMs >= thresholds.warm) {
    return "warm";
  }
  return "cool";
}

function hasBandFilterEnabled(filterBands) {
  return filterBands.warm || filterBands.hot || filterBands.critical;
}

function toContextValue(inputValue, fallback) {
  const parsed = Number(inputValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.floor(parsed));
}

function syncBandFiltersFromInputs() {
  state.filterBands = {
    warm: Boolean(elements.filterWarm.checked),
    hot: Boolean(elements.filterHot.checked),
    critical: Boolean(elements.filterCritical.checked)
  };
}

function syncContextWindowFromInputs() {
  state.contextBefore = toContextValue(elements.contextBefore.value, state.contextBefore);
  state.contextAfter = toContextValue(elements.contextAfter.value, state.contextAfter);
}

function buildVisibleIndexes(lines, thresholds, filterBands, contextBefore, contextAfter) {
  if (!hasBandFilterEnabled(filterBands)) {
    return lines.map((_, index) => index);
  }

  const anchors = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const band = classifyBand(line.durationMs, thresholds);
    if (filterBands[band]) {
      anchors.push(index);
    }
  }

  if (anchors.length === 0) {
    return [];
  }

  const included = new Array(lines.length).fill(false);
  for (const anchor of anchors) {
    const start = Math.max(0, anchor - contextBefore);
    const end = Math.min(lines.length - 1, anchor + contextAfter);
    for (let index = start; index <= end; index += 1) {
      included[index] = true;
    }
  }

  const indexes = [];
  for (let index = 0; index < included.length; index += 1) {
    if (included[index]) {
      indexes.push(index);
    }
  }
  return indexes;
}

function renderSummary(summary, lines, thresholds) {
  const dynamicBandCounts = computeBandCounts(lines, thresholds);
  const metrics = [
    ["Lines", String(summary.totalLines)],
    ["Parsed", `${summary.parsedLines} (${summary.parseRate}%)`],
    ["Missing ts", String(summary.missingLines)],
    ["Min", formatMs(summary.minMs)],
    ["P50", formatMs(summary.p50Ms)],
    ["P95", formatMs(summary.p95Ms)],
    ["Max", formatMs(summary.maxMs)],
    ["Warm+", String(dynamicBandCounts.warm)],
    ["Hot+", String(dynamicBandCounts.hot)],
    ["Critical", String(dynamicBandCounts.critical)]
  ];

  elements.summaryGrid.replaceChildren();
  for (const [label, value] of metrics) {
    const card = document.createElement("article");
    card.className = "metric";

    const title = document.createElement("div");
    title.className = "label";
    title.textContent = label;

    const val = document.createElement("div");
    val.className = "value";
    val.textContent = value;

    card.append(title, val);
    elements.summaryGrid.append(card);
  }
}

function toRenderableRows(profile, mode, thresholds, searchTerm, filterBands, contextBefore, contextAfter) {
  const resolver = createColorResolver({ mode, thresholds, distribution: profile.distribution });
  const lowerSearch = searchTerm.trim().toLowerCase();
  let visibleIndexes = buildVisibleIndexes(
    profile.lines,
    thresholds,
    filterBands,
    contextBefore,
    contextAfter
  );

  if (lowerSearch) {
    visibleIndexes = visibleIndexes.filter((index) =>
      profile.lines[index].raw.toLowerCase().includes(lowerSearch)
    );
  }

  return visibleIndexes.map((lineIndex, index) => {
    const line = profile.lines[lineIndex];
    const style = resolver(line.durationMs, line.relativeScore);

    return {
      top: index * 24,
      durationMs: line.durationMs,
      lineNumber: line.lineNumber,
      raw: line.raw,
      hasTimestamp: line.hasTimestamp,
      durationLabel: formatMs(line.durationMs),
      background: style.background
    };
  });
}

function renderProfile() {
  if (!state.profile) {
    vlist.setItems([]);
    state.renderedRows = [];
    elements.lineCountText.textContent = "0 lines";
    elements.summaryGrid.replaceChildren();
    return;
  }

  const rows = toRenderableRows(
    state.profile,
    state.mode,
    state.thresholds,
    state.searchTerm,
    state.filterBands,
    state.contextBefore,
    state.contextAfter
  );
  state.renderedRows = rows;
  vlist.setItems(rows);
  renderSummary(state.profile.summary, state.profile.lines, state.thresholds);
  elements.lineCountText.textContent = rows.length === state.profile.summary.totalLines
    ? `${state.profile.summary.totalLines} lines`
    : `${rows.length} / ${state.profile.summary.totalLines} lines`;
}

function analyzeLog() {
  const raw = elements.logInput.value;
  if (!raw.trim()) {
    elements.statusText.textContent = "Paste a log to begin profiling.";
    state.profile = null;
    renderProfile();
    return;
  }

  elements.statusText.textContent = "Profiling log...";

  const startedAt = performance.now();
  state.thresholds = getThresholds();
  state.mode = activeMode();
  state.profile = profileLogLines(raw, state.thresholds);
  renderProfile();

  const duration = (performance.now() - startedAt).toFixed(1);
  elements.statusText.textContent = `Profile ready in ${duration}ms.`;
}

function clearAll() {
  elements.logInput.value = "";
  elements.searchInput.value = "";
  state.profile = null;
  state.renderedRows = [];
  state.searchTerm = "";
  renderProfile();
  elements.statusText.textContent = "Cleared.";
}

function jumpToHottestLine() {
  if (!state.profile || state.renderedRows.length === 0) {
    return;
  }

  let maxIndex = -1;
  let maxDuration = -Infinity;
  for (let index = 0; index < state.renderedRows.length; index += 1) {
    const line = state.renderedRows[index];
    if (!Number.isFinite(line.durationMs)) {
      continue;
    }
    if (line.durationMs > maxDuration) {
      maxDuration = line.durationMs;
      maxIndex = index;
    }
  }

  if (maxIndex >= 0) {
    vlist.scrollToIndex(maxIndex);
    elements.statusText.textContent = `Jumped to line #${state.renderedRows[maxIndex].lineNumber}.`;
  }
}

elements.analyzeBtn.addEventListener("click", analyzeLog);
elements.clearBtn.addEventListener("click", clearAll);
elements.jumpHotBtn.addEventListener("click", jumpToHottestLine);

for (const input of elements.modeInputs) {
  input.addEventListener("change", () => {
    state.mode = activeMode();
    renderProfile();
  });
}

for (const key of ["thresholdWarm", "thresholdHot", "thresholdCritical"]) {
  elements[key].addEventListener("change", () => {
    state.thresholds = getThresholds();
    renderProfile();
  });
}

for (const key of ["filterWarm", "filterHot", "filterCritical"]) {
  elements[key].addEventListener("change", () => {
    syncBandFiltersFromInputs();
    renderProfile();
  });
}

for (const key of ["contextBefore", "contextAfter"]) {
  elements[key].addEventListener("change", () => {
    syncContextWindowFromInputs();
    renderProfile();
  });
}

elements.searchInput.addEventListener("input", () => {
  state.searchTerm = elements.searchInput.value;
  renderProfile();
});

elements.logInput.addEventListener("paste", () => {
  requestAnimationFrame(analyzeLog);
});

syncBandFiltersFromInputs();
syncContextWindowFromInputs();
renderProfile();
