const ISO_PATTERN = /\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
const DATE_FIRST_PATTERN = /\b\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
const TIME_FIRST_PATTERN = /\b\d{2}:\d{2}:\d{2}(?:[.,]\d{1,6})?[ T]\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}\b/g;
const TIME_ONLY_PATTERN = /\b\d{2}:\d{2}:\d{2}(?:[.,]\d{1,6})\b/g;
const EPOCH_MS_PATTERN = /\b\d{13}\b/g;
const EPOCH_S_PATTERN = /\b\d{10}\b/g;

function normalizeFractionalSeconds(value) {
  return value.replace(/,(\d+)/, ".$1").replace(/\.(\d{1,6})/, (_, fraction) => {
    const ms = fraction.slice(0, 3).padEnd(3, "0");
    return `.${ms}`;
  });
}

function parseDateFirstCandidate(candidate) {
  const normalized = normalizeFractionalSeconds(candidate);
  const [left, right] = normalized.split(/[ T]/, 2);
  const timePart = normalized.slice(left.length).trim();
  const parts = left.split(/[\/-]/).map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return Number.NaN;
  }

  let year;
  let month;
  let day;

  if (parts[0] > 31) {
    [year, month, day] = parts;
  } else if (parts[2] > 31) {
    year = parts[2];
    if (parts[0] > 12) {
      day = parts[0];
      month = parts[1];
    } else if (parts[1] > 12) {
      month = parts[0];
      day = parts[1];
    } else {
      // Ambiguous DD/MM vs MM/DD. Favor DD/MM to avoid US-specific bias.
      day = parts[0];
      month = parts[1];
    }
  } else {
    return Number.NaN;
  }

  const isoCandidate = `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${timePart}`;
  return Date.parse(isoCandidate);
}

function parseTimeFirstCandidate(candidate) {
  const normalized = normalizeFractionalSeconds(candidate);
  const [timePart, datePart] = normalized.split(/[ T]/, 2);
  const dateSegments = datePart.split(/[\/-]/).map((part) => Number(part));
  if (dateSegments.length !== 3 || dateSegments.some((part) => Number.isNaN(part))) {
    return Number.NaN;
  }

  let year;
  let month;
  let day;
  if (dateSegments[0] > 31) {
    [year, month, day] = dateSegments;
  } else if (dateSegments[2] > 31) {
    year = dateSegments[2];
    if (dateSegments[0] > 12) {
      day = dateSegments[0];
      month = dateSegments[1];
    } else if (dateSegments[1] > 12) {
      month = dateSegments[0];
      day = dateSegments[1];
    } else {
      day = dateSegments[0];
      month = dateSegments[1];
    }
  } else {
    return Number.NaN;
  }

  return Date.parse(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${timePart}`);
}

function parseTimeOnlyCandidate(candidate) {
  const normalized = normalizeFractionalSeconds(candidate);
  const [hms, fractional = ""] = normalized.split(".");
  const [hours, minutes, seconds] = hms.split(":").map((part) => Number(part));

  if ([hours, minutes, seconds].some((v) => Number.isNaN(v))) {
    return Number.NaN;
  }

  const millis = Number(fractional.padEnd(3, "0").slice(0, 3) || "0");
  return (((hours * 60) + minutes) * 60 + seconds) * 1000 + millis;
}

function firstValid(pattern, line, parser, kind) {
  pattern.lastIndex = 0;
  const matches = line.match(pattern);
  if (!matches) {
    return null;
  }

  for (const match of matches) {
    const millis = parser(match);
    if (Number.isFinite(millis)) {
      return {
        hasTimestamp: true,
        kind,
        matched: match,
        millis
      };
    }
  }

  return null;
}

export function extractTimestamp(line) {
  const iso = firstValid(ISO_PATTERN, line, (candidate) => Date.parse(normalizeFractionalSeconds(candidate)), "absolute");
  if (iso) {
    return iso;
  }

  const dateFirst = firstValid(DATE_FIRST_PATTERN, line, parseDateFirstCandidate, "absolute");
  if (dateFirst) {
    return dateFirst;
  }

  const timeFirst = firstValid(TIME_FIRST_PATTERN, line, parseTimeFirstCandidate, "absolute");
  if (timeFirst) {
    return timeFirst;
  }

  const epochMs = firstValid(EPOCH_MS_PATTERN, line, (candidate) => Number(candidate), "absolute");
  if (epochMs) {
    return epochMs;
  }

  const epochS = firstValid(EPOCH_S_PATTERN, line, (candidate) => Number(candidate) * 1000, "absolute");
  if (epochS) {
    return epochS;
  }

  const timeOnly = firstValid(TIME_ONLY_PATTERN, line, parseTimeOnlyCandidate, "time-only");
  if (timeOnly) {
    return timeOnly;
  }

  return {
    hasTimestamp: false,
    kind: "none",
    matched: "",
    millis: Number.NaN
  };
}
