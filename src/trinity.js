// Trinity's Law of Trinity / Edict of Trinity. Game records 474135584 / 293710144 and the client (chunk 12, 2026-11-01; research/legendaries-chunk12-2026-11-01.md §5):
//   label 3001218, no tags: "Damage types cannot be converted", every skill.
//   labels 3001150, 3001190, no tags: "This effect only deals Elemental Damage": Physical and Erosion deal nothing, for every skill (src/damage-type-restriction.js).
//   label 3001219, tag Attack: one element is picked per hit and the other two are blocked.
//   attr 5727 mod 4 +400 / +500, tags Attack + Hit: the hover's 5x / 6x is an Attack hit's. So a Spell hit takes neither the pick nor the multiple.
// The pick (client 0x141e14330 → 0x141e1ae10 → 0x141dde5f0): after the gain pass, s = (min + max) ÷ 2 of each of Lightning, Cold and Fire ÷ their sum, and each of the
// three elements gets a weight: 0 at s = 1, 1 at s = 0, else 1 ÷ (1 + s)⁴. An element the hit does not deal still takes its weight (s = 0, weight 1), and picking it blocks the
// other two, so that hit deals nothing. A single-element hit never picks its own element and deals 0. With no Elemental flat at all each element has a third.
// The expected hit is Σ_T p_T × N × D_T, which the hit engine applies as a factor N × p_T on each part of element T. Shares here are the skill's flat damage per use, added flat
// included, a part's own share over its hits per use. Minions, the follower and damage over time are not hits of the player: unchanged.
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
/** The client's weight of one element's share of the flat damage. */
export const trinityWeight = (share) => (share >= 1 ? 0 : share <= 0 ? 1 : 1 / (1 + share) ** 4);

/**
 * Per-element factor of one Attack skill's parts: { factors: Map<type, factor>, shares: { type: share }, weights: { type: p } } or null when the skill deals no Elemental
 * damage, or is not an Attack (`attack`). `components` are the hit engine's final parts (type, min / max, added, hitsPerUse).
 */
export function trinityFactors(components = [], state, { attack = false } = {}) {
  if (!state || !attack) return null;
  const flat = {};
  for (const component of components) {
    if (!ELEMENTS.includes(component.type)) continue;
    const value = flatAverage(component) * (Number(component.hitsPerUse) > 0 ? Number(component.hitsPerUse) : 1);
    if (value > 0) flat[component.type] = (flat[component.type] || 0) + value;
  }
  const types = Object.keys(flat);
  if (!types.length) return null;
  const total = types.reduce((sum, type) => sum + flat[type], 0);
  const shares = Object.fromEntries(ELEMENTS.map((type) => [type, (flat[type] || 0) / total]));
  const raw = ELEMENTS.map((type) => trinityWeight(shares[type]));
  const sum = raw.reduce((a, b) => a + b, 0);
  const weights = Object.fromEntries(ELEMENTS.map((type, index) => [type, raw[index] / sum]));
  return { factors: new Map(types.map((type) => [type, state.multiple * weights[type]])), shares, weights };
}

/** The additional-damage line a part of `type` takes (null for Physical / Erosion or no Trinity). */
export function trinityLine(state, factors, type) {
  if (!state || !factors?.factors.has(type)) return null;
  const factor = factors.factors.get(type), weight = factors.weights[type];
  return {
    source: state.source ? `${state.source}: Trinity` : "Trinity",
    text: `${state.text}: ${type} chosen with chance ${Math.round(weight * 10000) / 100}% (share ${Math.round(factors.shares[type] * 10000) / 100}%, client weights 1 ÷ (1 + share)⁴ over all three elements) × ${state.multiple} = ×${Math.round(factor * 10000) / 10000}`,
    value: (factor - 1) * 100,
    category: "Additional damage",
    origin: "derived",
    trinity: true
  };
}
