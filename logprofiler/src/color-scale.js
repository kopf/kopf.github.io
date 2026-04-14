const ABSOLUTE_COLORS = {
  none: "linear-gradient(90deg, rgba(180, 180, 180, 0.05), rgba(180, 180, 180, 0.02))",
  cool: "linear-gradient(90deg, rgba(103, 152, 126, 0.22), rgba(103, 152, 126, 0.03))",
  warm: "linear-gradient(90deg, rgba(214, 161, 70, 0.28), rgba(214, 161, 70, 0.05))",
  hot: "linear-gradient(90deg, rgba(225, 117, 57, 0.32), rgba(225, 117, 57, 0.05))",
  critical: "linear-gradient(90deg, rgba(183, 44, 28, 0.45), rgba(183, 44, 28, 0.08))"
};

function clamp(value, lo, hi) {
  return Math.min(Math.max(value, lo), hi);
}

function relativeGradient(score) {
  if (!Number.isFinite(score)) {
    return ABSOLUTE_COLORS.none;
  }

  const normalized = clamp(score, 0, 1);
  const hue = 170 - (normalized * 160);
  const alphaStrong = 0.18 + (normalized * 0.42);
  const alphaWeak = 0.03 + (normalized * 0.09);

  return `linear-gradient(90deg, hsla(${hue}, 72%, 50%, ${alphaStrong}), hsla(${hue}, 72%, 50%, ${alphaWeak}))`;
}

function classifyAbsolute(durationMs, thresholds) {
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

export function createColorResolver(config) {
  const { mode, thresholds } = config;

  return (durationMs, relativeScore) => {
    if (mode === "absolute") {
      const band = classifyAbsolute(durationMs, thresholds);
      return {
        background: ABSOLUTE_COLORS[band]
      };
    }

    return {
      background: relativeGradient(relativeScore)
    };
  };
}
