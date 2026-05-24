import { computePercentileRank } from './compute-percentiles.js';

export function computeVolumeFactor(stocks) {
  const turnoverRank = computePercentileRank(stocks, 'f8', true);
  const score = new Map();

  for (const [code, tr] of turnoverRank) {
    const stock = stocks.find(s => (s.f12 || s.code) === code);
    if (!stock) continue;

    const turnover = stock.f8;
    const volumeRatio = stock.f10;
    const change = stock.f3;

    let turnoverScore = tr;
    if (turnover >= 3 && turnover <= 10) {
      turnoverScore = Math.min(1, turnoverScore + 0.15);
    } else if (turnover > 15 || turnover < 0.5) {
      turnoverScore *= 0.6;
    }

    let volRatioScore = 0.5;
    if (volumeRatio != null && !isNaN(volumeRatio)) {
      if (volumeRatio >= 1.5 && volumeRatio <= 3.0) {
        volRatioScore = 0.8;
      } else if (volumeRatio > 0.8 && volumeRatio < 5.0) {
        volRatioScore = 0.5;
      } else {
        volRatioScore = 0.3;
      }
    }

    let coordBonus = 0;
    if (change != null && volumeRatio != null && change > 0 && volumeRatio > 1) {
      coordBonus = 0.1;
    }

    score.set(code, Math.min(1, Math.max(0, turnoverScore * 0.6 + volRatioScore * 0.3 + coordBonus)));
  }
  return score;
}
