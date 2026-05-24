export function computePercentileRank(stocks, field, ascending = true) {
  const valid = [];
  for (const s of stocks) {
    if (s[field] != null && !isNaN(s[field])) {
      valid.push({ code: s.f12 || s.code, value: s[field] });
    }
  }
  if (!valid.length) return new Map();

  valid.sort((a, b) => ascending ? a.value - b.value : b.value - a.value);
  const n = valid.length;
  const rank = new Map();
  for (let i = 0; i < n; i++) {
    rank.set(valid[i].code, i / (n - 1));
  }
  return rank;
}

export function combineScores(...entries) {
  const result = new Map();
  if (!entries.length) return result;

  let codes = null;
  for (const e of entries) {
    if (!e || !e.map) continue;
    const keys = new Set(e.map.keys());
    if (!codes) {
      codes = keys;
    } else {
      codes = new Set([...codes].filter(c => keys.has(c)));
    }
  }
  if (!codes) return result;

  const totalWeight = entries.reduce((s, e) => s + (e.weight || 0), 0);
  if (totalWeight === 0) return result;

  for (const code of codes) {
    let score = 0;
    let valid = true;
    for (const e of entries) {
      if (!e || !e.map) continue;
      const v = e.map.get(code);
      if (v == null) { valid = false; break; }
      score += v * (e.weight || 0);
    }
    if (valid) {
      result.set(code, score / totalWeight);
    }
  }
  return result;
}
