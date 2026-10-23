// Trinity's Law of Trinity / Edict of Trinity (TLIDB keyword hovers 10159 / 10160, src/named-gear-affixes.js; legendary audit batch 5,
// research/legendary-items-audit-2026-10-22.md §5.5):
//   "Any hit dealing Elemental Damage is guaranteed to deal 5x (6x) Elemental Damage"
//   "Randomly selects a type of Elemental Damage on hit, and only Elemental Damage of this type can be dealt. Other elements cannot
//    deal damage. The lower the Flat Damage percentage of an Elemental Damage, the higher the chance of it being chosen"
//   "This effect only deals Elemental Damage"
//   "Damage types cannot be converted"
// Reading (provisional, open question legendary-trinity-law): on each player hit with Elemental parts one element T is chosen with
// chance p_T, its parts deal N× and the other elements' parts deal 0; Physical and Erosion parts are untouched. The expected hit is
// then Σ_T p_T × N × D_T, which the hit engine applies as a factor N × p_T on each part of element T. The weights are not published:
// p_T ∝ 1 ÷ s_T, where s_T is element T's share of the skill's flat damage (base + added flat, per use) — the inverse of the "Flat
// Damage percentage", so a lower share is likelier. A single-element hit is exact whatever the weights (×N). Support and skill
// conversion is switched off ("Damage types cannot be converted"); "Adds X% of A as B" is an extra part, not a conversion, and stays.
// Minions, the follower and damage over time are not hits of the player: unchanged.
import { normalizePercentageText } from "./percentage-text.js";

export const TRINITY_MULTIPLE_LINE = /^Any hit dealing Elemental Damage is guaranteed to deal (\d+(?:\.\d+)?)x Elemental Damage$/i;
export const TRINITY_NO_CONVERSION_LINE = /^Damage types cannot be converted$/i;
export const TRINITY_RANDOM_LINE = /^Randomly selects a type of Elemental Damage on hit, and only Elemental Damage of this type can be dealt\./i;
export const TRINITY_ONLY_ELEMENTAL_LINE = /^This effect only deals Elemental Damage$/i;
const ELEMENTS = ["Fire", "Cold", "Lightning"];
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();

/** The build's Trinity state, or null: { multiple, source, text, noConversion }. Law and Edict do not stack: the larger multiple. */
export function trinityState(modifierTexts = []) {
  let best = null, noConversion = false;
  for (const line of modifierTexts) {
    if (line?.origin === "derived") continue;
    const text = clean(line?.text);
    const match = text.match(TRINITY_MULTIPLE_LINE);
    if (match && (!best || Number(match[1]) > best.multiple)) best = { multiple: Number(match[1]), source: line.source || "", text };
    if (TRINITY_NO_CONVERSION_LINE.test(text)) noConversion = true;
  }
  return best ? { ...best, noConversion } : null;
}

const flatAverage = (component) => ((component.min || 0) + (component.max || 0)) / 2 + ((component.added?.min || 0) + (component.added?.max || 0)) / 2;

/**
 * Per-element factor of one skill's parts: { factors: Map<type, factor>, shares: { type: share }, weights: { type: p } } or null when
 * the skill deals no Elemental damage. `components` are the hit engine's final parts (type, min / max, added, hitsPerUse).
 */
export function trinityFactors(components = [], state) {
  if (!state) return null;
  const flat = {};
  for (const component of components) {
    if (!ELEMENTS.includes(component.type)) continue;
    const value = flatAverage(component) * (Number(component.hitsPerUse) > 0 ? Number(component.hitsPerUse) : 1);
    if (value > 0) flat[component.type] = (flat[component.type] || 0) + value;
  }
  const types = Object.keys(flat);
  if (!types.length) return null;
  const total = types.reduce((sum, type) => sum + flat[type], 0);
  const shares = Object.fromEntries(types.map((type) => [type, flat[type] / total]));
  const inverse = types.reduce((sum, type) => sum + 1 / shares[type], 0);
  const weights = Object.fromEntries(types.map((type) => [type, (1 / shares[type]) / inverse]));
  return { factors: new Map(types.map((type) => [type, state.multiple * weights[type]])), shares, weights };
}

/** The additional-damage line a part of `type` takes (null for Physical / Erosion or no Trinity). */
export function trinityLine(state, factors, type) {
  if (!state || !factors?.factors.has(type)) return null;
  const factor = factors.factors.get(type), weight = factors.weights[type];
  const single = factors.factors.size === 1;
  return {
    source: state.source ? `${state.source}: Trinity` : "Trinity",
    text: `${state.text}: ${type} chosen ${single ? "on every hit (the only element)" : `with chance ${Math.round(weight * 10000) / 100}% (weights ∝ 1 ÷ flat share, provisional)`} × ${state.multiple} = ×${Math.round(factor * 10000) / 10000}`,
    value: (factor - 1) * 100,
    category: "Additional damage",
    origin: "derived",
    trinity: true
  };
}
