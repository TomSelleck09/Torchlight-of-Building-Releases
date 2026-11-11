// Keep signs, values and line breaks intact; also handle copied non-breaking spaces.
// Memo (planner performance 2026-11-08): a pure function of the string, called millions of times per calculation.
const cache = new Map();
export function normalizePercentageText(value) {
  const text = String(value ?? "");
  let out = cache.get(text);
  if (out === undefined) {
    out = text.replace(/(\d|\))[ \t\u00a0\u202f]+%/g, "$1%");
    if (cache.size > 200000) cache.clear();
    cache.set(text, out);
  }
  return out;
}
