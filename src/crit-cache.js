// Crit determinations per use (2026-10-27; research/lucky-crit-mechanics-2026-10-27.md §4 / §7).
//
// Sourced: game manual 1000000420 "If a skill can deal damage more than once (such as Spiral Strike), the Critical Strike
// determination is usually only carried out once"; the SkillEditor damage component's `closeDamageCritCache` flag switches the cache
// off per damage index (src/data/game/skill-crit-cache.generated.js, scripts/build-skill-crit-cache.mjs: 21 of 3,798 components —
// persistent, channelled and repeating area skills, Scorching Beam's beam among them). Average damage is the same either way; the
// count of crit EVENTS is not, and crit-triggered effects read that count (Tremble's Numbed buff, Electric Overload, Juggernaut stacks,
// Nether King's per-recent-non-crit stacks, Instructions on crit, Husk).
//
// Reading (provisional, open question crit-cache-events):
// - A skill with a cache-off damage index rolls per hit: crit events = hit events (strikeHitsPerUse), as before 2026-10-27. The
//   planner's components are not mapped to damage indexes, so a mixed skill (Flame Jet [0, 1, 1, 0], Charged Pummel [0, 1]) counts
//   every hit (its repeating part is the cache-off one).
// - Any other skill makes one determination per hit group (strike key) per use: min(1, the group's hits per use ÷ the hits one launch
//   makes) — repeated hits and projectiles of one volley share their launch's determination; a fractional count (a Steep Strike on
//   39% of uses, a Finisher on a third of the cycle) is that share of uses. Multistrike repeats are separate uses (separate attacks),
//   each Sentry, each extra Combo Finisher and each of Blade Cluster's generated Steep Strikes its own (the user-supplied 2026-10-15
//   reading: the generated Steep Strikes count in the skill's crit hits/s).
// - Cache scope (per cast, per damage entity or per damage index) is not settled by the data (research §6 point 3).

import { SKILL_CRIT_CACHE_OFF } from "./data/game/skill-crit-cache.generated.js";

/** The crit cache state of a skill by name: { cached, reason, rows }. */
export function critCacheFor(name) {
  const rows = SKILL_CRIT_CACHE_OFF[name] || null;
  return rows
    ? { cached: false, rows, reason: `${name}: damage crit cache off (SkillEditor closeDamageCritCache ${rows.map((row) => `[${row.closeDamageCritCache.join(", ")}]`).join(" / ")}): every hit rolls its own Critical Strike determination` }
    : { cached: true, rows: null, reason: `${name || "skill"}: crit cache on (game manual 1000000420): one Critical Strike determination per hit group per use, shared by its repeated hits (provisional)` };
}

/**
 * Crit determinations per use of a cached skill: per strike group min(1, hits ÷ (critRepeat × critEntities)) × critEntities.
 * Components carry `critEntities` (separate determinations per launch: Sentries, extra Combo Finishers, Blade Cluster's generated Steep
 * Strikes) and optionally `critRepeat` (hits per determination beyond the per-use count); added-only and split parts never count, as in
 * strikeHitsPerUse.
 */
export function cachedCritChecksPerUse(components = []) {
  const groups = new Map();
  for (const component of components) {
    if (!component || component.addedOnly || component.splitPart) continue;
    const key = component.strikeKey ?? component.componentKey ?? component.key ?? component.label;
    const entities = Math.max(1, Number(component.critEntities) || 1), repeat = Math.max(1, Number(component.critRepeat) || 1);
    const hits = Number(component.hitsPerUse) || 0;
    const checks = Math.min(1, hits / (repeat * entities)) * entities;
    groups.set(key, Math.max(groups.get(key) ?? 0, checks));
  }
  return [...groups.values()].reduce((total, checks) => total + checks, 0);
}
