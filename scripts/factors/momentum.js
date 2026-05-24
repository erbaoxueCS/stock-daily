export function computeMomentumFactor(stocks) {
  const score = new Map();
  const mean = 2.0;
  const sigma = 3.0;

  for (const s of stocks) {
    const code = s.f12 || s.code;
    const change = s.f3;
    if (change == null || isNaN(change)) continue;
    const z = (change - mean) / sigma;
    const gaussian = Math.exp(-0.5 * z * z);
    const positive = change > 0 ? 1.0 : 0.3;
    score.set(code, gaussian * positive);
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
