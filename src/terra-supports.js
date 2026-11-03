// Frost Terra's Noble supports that change its Terra over the Terra's life (skill-mechanics census batch 2, 2026-10-27;
// research/skill-mechanics-census-2026-10-27.md B1). src/planner.js settles them on the Terra's damage over time where the recast
// interval and the Terra Charges consumed per cast are known (the skill-dot sources); src/support-effects.js resolves their clauses
// with appliedValue 0 (no double count) and points the badge here.
//
// - Frost Terra: Cohesion (Noble), game affix 596392704: field 2600241 (the Terra's additional damage per stack) = p0 and 2600242 (its
//   Skill Area) = p1, "every 0.5s. Stacks up to 3 times". The Terra gains a stack every 0.5 s of its life; a recast replaces it (max
//   base Terra quantity 1) and the new Terra starts at 0. The Terra's 2 s status keeps its strongest application (src/skill-damage-
//   profiles.js: strongest, refreshed), so the held status carries the stacks the Terra reached before it was replaced:
//   min(cap, ⌊min(recast interval, 6 s Terra life) ÷ 0.5 s⌋), one additional term of value × stacks (provisional: the stacks add in one
//   term, and a stack reached exactly at the recast counts; open question terra-cohesion-winters-bite). A Wind Rhythm recast every 0.094 s
//   never reaches the first stack. The −20% Skill Area per stack has no DPS effect (one dummy inside the Terra).
// - Frost Terra: Winter's Bite (Noble), game affix 118137152 (trigger 1001300 on this skill's cast: node 624 marks the next action with
//   label 3100212 = the debuff): enemies on the Terra take +13% additional Cold Damage; each Terra Charge the cast consumes adds +P1%
//   debuff effect (up to 4), and the charges no longer add the skill's own per-charge additional damage. Read as one additional Cold
//   Damage taken term 13% × (1 + P1% × min(4, charges consumed per cast)) on the Terra's own Cold damage over time, with the Terra Charge
//   line dropped (provisional: the debuff on the dummy also raises the build's other Cold damage, not counted here; open question
//   terra-cohesion-winters-bite).
const EPS = 1e-9;
const round = (value) => Math.round(value * 10000) / 10000;
export const TERRA_LIFE_SECONDS = 6;

/**
 * @param {object} setup a resolved setup (setup.supportEffects.clauses)
 * @param {object} p
 * @param {number} p.intervalSeconds the Terra's recast interval
 * @param {number} p.chargesConsumed Terra Charges a cast consumes
 * @param {string|null} p.damageType the Terra DoT's type
 * @returns {{ lines: object[], dropsChargeLine: boolean, notes: string[] }}
 */
export function terraSupportEffects(setup, { intervalSeconds = 0, chargesConsumed = 1, damageType = null } = {}) {
  const clauses = (setup?.supportEffects?.clauses || []).filter((clause) => clause.census && ["terraAgeStacks", "wintersBite"].includes(clause.condition));
  const lines = [], notes = [];
  let dropsChargeLine = false;
  for (const clause of clauses) {
    if (clause.condition === "terraAgeStacks") {
      const age = Math.min(TERRA_LIFE_SECONDS, Math.max(0, Number(intervalSeconds) || 0));
      const stacks = Math.min(clause.cap, Math.floor(age / clause.everySeconds + EPS));
      const value = round(clause.value * stacks);
      notes.push(`${clause.source}: the Terra lives ${round(age)} s before it is recast (replaced), reaching ${stacks} of ${clause.cap} stacks (one per ${clause.everySeconds} s); the held status keeps them: +${clause.value}% × ${stacks} = +${value}% (game affix 596392704; provisional)`);
      if (value > 0) lines.push({ source: clause.source, text: `+${value}% additional damage for the Terra (Cohesion: ${stacks} stacks × +${clause.value}%, one per ${clause.everySeconds} s of the Terra's ${round(age)} s life; provisional)`, value, category: "Additional damage" });
    } else if (clause.condition === "wintersBite") {
      dropsChargeLine = true;
      if (damageType && damageType !== "Cold") { notes.push(`${clause.source}: the Terra deals ${damageType} damage, so the Cold Damage taken debuff does not reach it`); continue; }
      const charges = Math.min(clause.cap, Math.max(0, Number(chargesConsumed) || 0));
      const value = round(clause.value * (1 + clause.perCharge * charges / 100));
      notes.push(`${clause.source}: +${clause.value}% additional Cold Damage taken × (1 + ${clause.perCharge}% × ${round(charges)} Terra Charges consumed per cast, up to ${clause.cap}) = +${value}%; the charges no longer add the skill's own per-charge damage (game affix 118137152; provisional)`);
      lines.push({ source: clause.source, text: `+${value}% additional Cold Damage taken by the dummy on the Terra (Winter's Bite debuff; provisional)`, value, category: "Additional damage" });
    }
  }
  return { lines, dropsChargeLine, notes };
}
