import { computePercentileRank } from './compute-percentiles.js';

export function computeValuationFactor(stocks) {
  const peRank = computePercentileRank(stocks, 'f9', false);
  const pbRank = computePercentileRank(stocks, 'f23', false);

  const score = new Map();
  const codes = new Set([...peRank.keys()]);
  for (const code of codes) {
    const pe = peRank.get(code);
    const pb = pbRank.get(code);
    if (pe == null || pb == null) continue;
    const stock = stocks.find(s => (s.f12 || s.code) === code);
    if (stock && (stock.f9 < 0 || stock.f23 < 0)) continue;
    score.set(code, pe * 0.6 + pb * 0.4);
  }
  return score;
}
