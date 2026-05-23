import { computePercentileRank } from './compute-percentiles.js';

export function computeVolatilityFactor(stocks) {
  const ampRank = computePercentileRank(stocks, 'f115', false);
  const score = new Map();
  for (const [code, rank] of ampRank) {
    score.set(code, rank);
  }
  return score;
}
