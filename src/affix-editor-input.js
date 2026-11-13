// Shared input helpers for the affix editors (user request 2026-11-12): the tier a typed roll belongs to, and the affix search
// matcher. Pure functions, no DOM; src/app.js wires them into the gear, legendary, memory and support affix editors and the
// searchable select popover (slate affixes, memory affixes, revived affixes).

// A roll range contains the value whatever the sign order of its ends (negative-range affixes print "(-10–-5)" or "(-5–-10)").
export function rangeContains(range, value) {
  if (!range || !Number.isFinite(value)) return false;
  const low = Math.min(Number(range.min), Number(range.max)), high = Math.max(Number(range.min), Number(range.max));
  return value >= low && value <= high;
}

// The tier a typed value belongs to. `tiers` is the editor's tier list in its display order: { key, ranges: [{min,max}], eligible }.
// The current tier wins when it contains the value; otherwise the eligible tier closest to the current one in that order (ties:
// the earlier one), then an ineligible one (a tier kept as saved but not allowed at this item level / rarity) by the same rule.
// null when no tier contains the value (the editor keeps its own clamp / validation).
export function chooseTierForValue({ tiers = [], currentKey = null, value, rangeIndex = 0 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || !tiers.length) return null;
  const fits = (tier) => rangeContains(tier.ranges?.[rangeIndex], number);
  const current = tiers.findIndex((tier) => String(tier.key) === String(currentKey));
  if (current >= 0 && fits(tiers[current])) return tiers[current].key;
  const origin = current >= 0 ? current : 0;
  const pick = (eligible) => {
    let best = null, bestDistance = Infinity;
    tiers.forEach((tier, index) => {
      if (index === current || (tier.eligible !== false) !== eligible || !fits(tier)) return;
      const distance = Math.abs(index - origin);
      if (distance < bestDistance) { best = tier; bestDistance = distance; }
    });
    return best;
  };
  return (pick(true) || pick(false))?.key ?? null;
}

// Affix search (user request 2026-11-12): "%" and "+" are ignored on both sides, whitespace collapsed, case-insensitive; every
// query token must match; a numeric token matches a whole number of the text ("9" matches "+9% damage", not "19", "90" or "9.5";
// "9.5" matches "9.5"), any other token is a substring.
export function normalizeAffixSearchText(text) {
  return String(text ?? "").replace(/[%+]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
export function affixSearchTokens(query) {
  const normalized = normalizeAffixSearchText(query);
  return normalized ? normalized.split(" ") : [];
}
const NUMERIC_TOKEN = /^\d+(?:\.\d+)?$/;
function textNumbers(normalized) { return normalized.match(/\d+(?:\.\d+)?/g) || []; }
export function affixSearchMatches(query, text) {
  const tokens = Array.isArray(query) ? query : affixSearchTokens(query);
  if (!tokens.length) return true;
  const normalized = normalizeAffixSearchText(text);
  let numbers = null;
  return tokens.every((token) => {
    if (!NUMERIC_TOKEN.test(token)) return normalized.includes(token);
    numbers ??= textNumbers(normalized);
    return numbers.includes(token);
  });
}
