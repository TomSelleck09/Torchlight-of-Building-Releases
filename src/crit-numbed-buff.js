// Thunder Spike: Tremble (Noble; reference data 2026-10-14, tiers T2 58–65 / T1 66–71 / T0 72–83; "+20% additional damage for the
// supported skill" base, "+0% additional damage" star line at 1★): "The supported skill gains a buff on Critical Strike: +X%
// Numbed Effect for 2 s".
//
// Reading (2026-10-14, provisional):
// - Uptime: the buff refreshes on every Critical Strike of the supported skill, so it is up all the time when its crit hits
//   come at least once per buff duration (crit hits per second × duration ≥ 1), else that share: min(1, crit hits/s × 2 s).
//   The crit hit rate comes from the planner's hit pass (src/planner.js hitRateFacts); before it is measured the buff is held.
// - While up, Numbed inflicted by the supported skill has +X% Numbed Effect. Numbed (keyword 762) is one debuff on the dummy
//   (src/enemy-ailments.js, src/combat-states.js: +5% Lightning Damage taken per stack, max 10, or a changed base effect); the
//   build's other Numbed sources carry only the build-wide Numbed Effect, so the stronger one is the supported skill's, and the
//   dummy keeps it: the time-averaged +X% × uptime joins the Numbed Effect lines as one derived line.
// - The supported skill must inflict Numbed: the dummy is Numbed (enemy-ailment model) and the skill deals Lightning hits
//   ("Inflicts Numbed when dealing Hit Lightning Damage" and the like). With no Numbed the buff has nothing to raise (Inactive).

const round = (value) => Math.round(value * 10000) / 10000;

/**
 * @param {object} p
 * @param {object[]} p.setups resolved setups (with supportEffects)
 * @param {Set<string>} p.activeNames active skill names
 * @param {string[]} p.enemyAilments the enemy-ailment model's state names
 * @param {Map<string, object>} p.lightningHitters setupKey → true when the setup's modeled hits deal Lightning
 * @param {Map<string, object>|null} p.hitRateFacts setupKey → { critHitsPerSecond } from the planner's hit pass (null before it)
 * @returns {{ lines: object[], entries: object[], setupKeys: string[] }}
 */
export function resolveCritNumbedBuffs({ setups = [], activeNames = new Set(), enemyAilments = [], enemyBuffs = null, lightningHitters = new Map(), hitRateFacts = null } = {}) {
  const entries = [];
  // Numbed on the dummy from its unit buff set (W8 step 2; `enemyBuffs`), else the names list.
  const numbed = enemyBuffSet(enemyBuffs)?.holds("Numbed") ?? enemyAilments.includes("Numbed");
  for (const setup of setups) {
    if (setup.enabled === false || !activeNames.has(setup.name)) continue;
    for (const clause of (setup.supportEffects?.clauses || []).filter((item) => item.family === "critBuff" && item.kind === "numbedEffect")) {
      const lightning = Boolean(lightningHitters.get(setup.setupKey));
      const facts = hitRateFacts?.get?.(setup.setupKey) || null;
      const critHitsPerSecond = facts && Number.isFinite(facts.critHitsPerSecond) ? facts.critHitsPerSecond : null;
      const uptime = !numbed || !lightning ? 0 : critHitsPerSecond == null ? 1 : Math.min(1, critHitsPerSecond * clause.seconds);
      const value = round(clause.value * uptime);
      const reason = !numbed ? "the build inflicts no Numbed (enemy-ailment model)"
        : !lightning ? `${setup.name} deals no modeled Lightning hits, so it inflicts no Numbed`
        : critHitsPerSecond == null ? "crit hit rate not measured yet (held for this pass)"
        : `${round(critHitsPerSecond)} crit hits/s × ${clause.seconds} s = ${round(critHitsPerSecond * clause.seconds)} → uptime ${round(uptime)}`;
      entries.push({ setupKey: setup.setupKey, skill: setup.name, support: clause.support, base: clause.value, seconds: clause.seconds, critHitsPerSecond, uptime: round(uptime), value, active: value > 0, reason });
    }
  }
  // The dummy keeps the stronger Numbed: the largest supported skill's buff (other sources carry only the build-wide effect).
  const strongest = entries.filter((entry) => entry.active).sort((a, b) => b.value - a.value)[0] || null;
  const lines = strongest ? [{ text: `+${strongest.value}% Numbed Effect`, source: `${strongest.skill}: ${strongest.support} (+${strongest.base}% Numbed Effect for ${strongest.seconds} s on Critical Strike × ${strongest.uptime} uptime; the stronger Numbed the dummy keeps)`, origin: "derived", multiplier: 1, critNumbedBuff: true }] : [];
  return { lines, entries, setupKeys: entries.map((entry) => entry.setupKey) };
}import { enemyBuffSet } from "./unit-buff-set.js";

