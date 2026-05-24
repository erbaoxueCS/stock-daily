export function computeCapitalFactor(stocks) {
  const score = new Map();

  for (const s of stocks) {
    const code = s.f12 || s.code;
    const change = s.f3;
    const volumeRatio = s.f10;
    if (change == null || isNaN(change)) continue;

    let baseScore = 0.5;

    if (change > 0) {
      if (volumeRatio != null && volumeRatio > 1.5) {
        baseScore = 0.6 + Math.min(0.3, change / 30);
      } else if (volumeRatio != null && volumeRatio > 1.0) {
        baseScore = 0.5 + Math.min(0.2, change / 40);
      } else {
        baseScore = 0.4;
      }
    } else if (change < 0) {
      if (volumeRatio != null && volumeRatio > 2.0) {
        baseScore = 0.2;
      } else if (volumeRatio != null && volumeRatio > 1.0) {
        baseScore = 0.3;
      } else {
        baseScore = 0.45;
      }
    }

    score.set(code, Math.min(1, Math.max(0, baseScore)));
  }

  const values = [...score.values()];
  if (!values.length) return score;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  for (const [code, v] of score) {
    score.set(code, (v - min) / range);
  }
  return score;
}
