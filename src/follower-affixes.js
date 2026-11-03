import { tartarusAffixes, tartarusSkillAffixPools } from "./data/followers/tartarus-skill-affixes.generated.js";

// Tartarus Skill support affixes (2026-10-19; research/followers/tartarus-skill-affixes-2026-10-19.md). A Tartarus or Origin
// Tartarus Skill is an item of tier I, II or III (game item ids …0 / …1 / …2). Its tier sets its support affix slots (reference data,
// tartarusSkills[].tiers; the game's skill_stone_modifier texts): tier I none, tier II one "<Random Support Skill>", tier III
// two plus one "<Empty Support Skill Slot or Random Support Skill>". The random slots roll from the skill's Drop pool; the
// third slot drops empty or with a Drop affix, and Tempering ("20% chance to succeed and gain a Support Skill in the empty
// slot", game text) fills an empty one from the skill's Forge pool, so it takes either pool (provisional reading). Pools
// per skill come from reference data (src/data/followers/tartarus-skill-affixes.generated.js); every game value is fixed (no roll).
// One affix of a name per skill (provisional: the game's "same type of affix already exists" rule, as for gear).

export { tartarusAffixes, tartarusSkillAffixPools };
export const TARTARUS_SKILL_TIERS = Object.freeze(["I", "II", "III"]);

const affixIndex = new Map(tartarusAffixes.map((affix) => [affix.id, affix]));
export const tartarusAffixById = (id) => affixIndex.get(Number(id)) || null;

/** The skill's support affix slots at `tier`: { random, optional, total } (random: Drop pool; optional: Drop or Forge). */
export function tartarusAffixSlots(skill, tier) {
  const slots = skill?.tiers?.[tier];
  const random = Number(slots?.randomSupports) || 0, optional = Number(slots?.optionalSupports) || 0;
  return { random, optional, total: random + optional };
}

/** The pool a slot draws from: "drop" for the random slots, "any" (Drop or Forge) for the optional third slot. */
export const tartarusAffixSlotPool = (skill, tier, index) => index < tartarusAffixSlots(skill, tier).random ? "drop" : "any";

/** The affixes slot `index` of `skill` at `tier` can hold, Drop pool first (reference data order), then the Forge pool. */
export function tartarusAffixChoices(skill, tier, index) {
  const { total } = tartarusAffixSlots(skill, tier);
  if (!skill || index < 0 || index >= total) return [];
  const pools = tartarusSkillAffixPools[skill.name] || { drop: [], forge: [] };
  const ids = tartarusAffixSlotPool(skill, tier, index) === "drop" ? pools.drop : [...pools.drop, ...pools.forge];
  return ids.map(tartarusAffixById).filter(Boolean);
}

/** The roll ranges of an affix's values ({ index, min, max } for each parameter whose min and max differ; none on 2026-10-19). */
export const tartarusAffixRanges = (affix) => (affix?.values || []).map(([min, max], index) => ({ index, min, max })).filter((range) => range.min !== range.max);

/** The affix's text with its rolled values (a range's top when no roll is stored; all affixes are fixed on 2026-10-19). */
export function tartarusAffixLines(affix, rolls = []) {
  const ranges = tartarusAffixRanges(affix);
  if (!ranges.length) return [...(affix?.lines || [])];
  // A ranged value is written "(min–max)" in no current affix; a future one would need its template: keep reference data's text.
  return [...affix.lines].map((line) => ranges.reduce((text, range, k) => text.replace(String(range.max), String(rolls[k] ?? range.max)), line));
}

/**
 * The stored affixes of one skill slot, cleaned for `skill` at `tier`: one entry per affix slot, each { id, rolls? } or null.
 * Unknown ids, ids outside the slot's pool and a second affix of the same name are dropped; rolls are clamped to the range
 * (the top of the range when missing). `limit`: at most that many affix slots (a letter's initial skill has a fixed support
 * count, its first slots: src/follower-model.js).
 */
export function normalizeTartarusAffixes(skill, tier, stored, limit = Infinity) {
  const total = Math.max(0, Math.min(tartarusAffixSlots(skill, tier).total, limit));
  const list = Array.isArray(stored) ? stored : [];
  const names = new Set();
  return Array.from({ length: total }, (_, index) => {
    const value = list[index];
    const id = Number(value && typeof value === "object" ? value.id : value);
    if (!Number.isFinite(id)) return null;
    const affix = tartarusAffixChoices(skill, tier, index).find((item) => item.id === id);
    if (!affix || names.has(affix.name)) return null;
    names.add(affix.name);
    const ranges = tartarusAffixRanges(affix);
    if (!ranges.length) return { id };
    const rolls = ranges.map((range, k) => { const roll = Number(value?.rolls?.[k]); return Number.isFinite(roll) ? Math.min(range.max, Math.max(range.min, roll)) : range.max; });
    return { id, rolls };
  });
}
