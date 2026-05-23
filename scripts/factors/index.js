import { computePercentileRank, combineScores } from './compute-percentiles.js';
import { computeValuationFactor } from './valuation.js';
import { computeMomentumFactor } from './momentum.js';
import { computeVolatilityFactor } from './volatility.js';
import { computeVolumeFactor } from './volume.js';
import { computeCapitalFactor } from './capital.js';

const FACTOR_REGISTRY = [
  { name: 'valuation',  compute: computeValuationFactor,  weight: 0.25 },
  { name: 'momentum',   compute: computeMomentumFactor,   weight: 0.20 },
  { name: 'volatility', compute: computeVolatilityFactor, weight: 0.15 },
  { name: 'volume',     compute: computeVolumeFactor,     weight: 0.20 },
  { name: 'capital',    compute: computeCapitalFactor,    weight: 0.20 },
];

export function computeAllFactors(stocks) {
  console.log(`[FactorEngine] Computing ${FACTOR_REGISTRY.length} factors for ${stocks.length} stocks...`);

  const factorMaps = {};
  for (const entry of FACTOR_REGISTRY) {
    const map = entry.compute(stocks);
    factorMaps[entry.name] = map;
    console.log(`  [FactorEngine] ${entry.name}: ${map.size} stocks scored`);
  }

  const scoreEntries = FACTOR_REGISTRY.map(e => ({
    map: factorMaps[e.name],
    weight: e.weight,
  }));
  const composite = combineScores(...scoreEntries);
  console.log(`  [FactorEngine] composite: ${composite.size} stocks with full factor coverage`);

  const result = new Map();
  for (const s of stocks) {
    const code = s.f12 || s.code;
    const factors = {};
    let hasAll = true;
    for (const entry of FACTOR_REGISTRY) {
      const v = factorMaps[entry.name].get(code);
      if (v == null) { hasAll = false; break; }
      factors[entry.name] = Math.round(v * 10000) / 10000;
    }
    const comp = composite.get(code);
    if (comp != null) {
      factors.composite = Math.round(comp * 10000) / 10000;
    }
    if (hasAll || Object.keys(factors).length) {
      result.set(code, factors);
    }
  }

  console.log(`[FactorEngine] Done. ${result.size} stocks with factor data.`);
  return result;
}

export { FACTOR_REGISTRY };
