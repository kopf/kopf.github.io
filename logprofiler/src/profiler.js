import { extractTimestamp } from "./timestamp-parser.js";

function percentile(sorted, p) {
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) {
    return sorted[lo];
  }
  const factor = index - lo;
  return sorted[lo] + ((sorted[hi] - sorted[lo]) * factor);
}

function normalizeDelta(current, next, mode) {
  if (!Number.isFinite(current) || !Number.isFinite(next)) {
    return Number.NaN;
  }

  let delta = next - current;
  if (delta < 0 && mode === "time-only") {
    // Time-only lines can cross midnight; compensate with one day window.
    delta += 86_400_000;
  }

  if (delta < 0) {
    return Number.NaN;
  }

  // Ignore implausibly huge gaps to avoid distortion from broken parsing.
  if (delta > 172_800_000) {
    return Number.NaN;
  }

  return delta;
}

function rankDurations(lines, validDurations) {
  if (validDurations.length === 0) {
    return lines.map((line) => ({ ...line, relativeScore: Number.NaN }));
  }

  const sorted = [...validDurations].sort((a, b) => a - b);
  return lines.map((line) => {
    if (!Number.isFinite(line.durationMs)) {
      return { ...line, relativeScore: Number.NaN };
    }

    let lo = 0;
    let hi = sorted.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (sorted[mid] <= line.durationMs) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    const rank = Math.max(0, lo - 1);
    const score = sorted.length === 1 ? 1 : rank / (sorted.length - 1);
    return { ...line, relativeScore: score };
  });
}

export function profileLogLines(rawLog) {
  const rawLines = rawLog.split(/\r?\n/).filter((line) => line.trim() !== "");
  const totalLines = rawLines.length;
  const parsed = rawLines.map((raw, index) => {
    const timestamp = extractTimestamp(raw);
    return {
      lineNumber: index + 1,
      raw,
      hasTimestamp: timestamp.hasTimestamp,
      timestampKind: timestamp.kind,
      timestampMs: timestamp.millis,
      matchedTimestamp: timestamp.matched,
      durationMs: Number.NaN,
      relativeScore: Number.NaN,
      band: "none"
    };
  });

  let nextValidTimestamp = Number.NaN;
  let nextValidKind = "none";
  for (let index = parsed.length - 1; index >= 0; index -= 1) {
    const line = parsed[index];
    if (line.hasTimestamp && Number.isFinite(nextValidTimestamp)) {
      line.durationMs = normalizeDelta(line.timestampMs, nextValidTimestamp, line.timestampKind || nextValidKind);
    }

    if (line.hasTimestamp && Number.isFinite(line.timestampMs)) {
      nextValidTimestamp = line.timestampMs;
      nextValidKind = line.timestampKind;
    }
  }

  const validDurations = parsed
    .map((line) => line.durationMs)
    .filter((value) => Number.isFinite(value));

  const ranked = rankDurations(parsed, validDurations);

  const sortedDurations = [...validDurations].sort((a, b) => a - b);
  const parsedCount = parsed.filter((line) => line.hasTimestamp).length;
  const missingCount = parsed.filter((line) => !line.hasTimestamp).length;
  const summary = {
    totalLines,
    parsedLines: parsedCount,
    missingLines: missingCount,
    parseRate: totalLines === 0 ? 0 : Math.round((parsedCount / totalLines) * 100),
    minMs: sortedDurations[0] ?? Number.NaN,
    p50Ms: percentile(sortedDurations, 0.5),
    p95Ms: percentile(sortedDurations, 0.95),
    maxMs: sortedDurations[sortedDurations.length - 1] ?? Number.NaN
  };

  const distribution = {
    min: summary.minMs,
    p50: summary.p50Ms,
    p95: summary.p95Ms,
    max: summary.maxMs
  };

  return {
    lines: ranked,
    summary,
    distribution
  };
}
