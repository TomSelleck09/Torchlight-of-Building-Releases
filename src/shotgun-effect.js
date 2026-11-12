// Shotgun Effect: several effects of one skill hitting the same enemy (keyword 642: "The first effect hit deals 100% damage,
// and subsequent effects hit deal less damage").
//
// Falloff (client, user decision 2026-11-05; research/oq-shadows-seal-client-2026-11-05.md): one repeat multiplier serves every
// hit rule (SS14 0x1423e3d40, SS13 0x1421fa710). The first hit on the target deals 100%; each later hit of a sibling of the same
// skill instance and the same brother group deals (table value + field 2006262) × 0.01, where the table is the hit rule's
// `repeatDmgDecPercent` (SkillEditor component 104998; every table in the SS14 Splits is one flat (1, X) row) and field 2006262
// is "+X% base damage coefficient for subsequent Projectiles / effects of Shotgun Effect". So the table value is the share each
// repeat hit KEEPS, and the total is 1 + k × (hits − 1). A skill text's "Shotgun Effect falloff coefficient is X%" is the share
// lost, 100 − the table (Split Shot "77%" ↔ table 23; Chromatic Shot SS13 "70%" ↔ 30, SS14 table 20; keyword 642's own text
// "Most skills' subsequent on hit damage is 36%" names a kept share). Siblings (2026-11-08, SS14): a hit state's runtime group is
// one id per skill instance for its rule's brother group and repeat / loop sub-key (0x1423de780 → 0x1424140b0; a new state starts
// at −1, 0x1423d02e0); the count is the earlier hits of the other states in that group on this target, plus the state's own only
// with bCalcPercentOnSameEntity. So no falloff (multiplier 1.0) on any hit of a rule with an empty table (early return), nor of a
// rule in brother group −1 without bCalcPercentOnSameEntity (count 0, under the first key 1), and a group −1 state is never
// counted by another. 30 of the 149 SS14 rules with a table sit in group −1 (Icebound Beam's blades, Blazing Bullet's and Burning
// Shot's projectiles, Sparkle, Ice Shot, Focused Shot, …); Self-Destruct's [(0, 10)] is the one whose key 0 still applies.
// - Shadows (same multiplier, hit rule [(1, 30)]): the user's Thunder Spike ± Haunt test 2026-11-05 read ×2.234 against the
//   client's ×2.30 and the old 70%-kept reading's ×2.70.
// - Chromatic Shot Lv16 runs (research/residual-batch-2026-10-12.md §5.3, SS13, table 30): by the client every projectile lands
//   close at 30% each after the first: 3 → 1.6 × 189 (run C, one projectile at about 10 m) = 302 against 311 observed, 5 → 2.2 ×
//   1.15 × 189 = 478 against 524.
// Superseded: the 2026-10-12 reading (user-confirmed then) took the tooltip's 70% as the share kept, and ceil(n / 2) of a fan.

/** Share each repeat hit keeps when a skill gives no hit rule table: 30, the table of 82 of the 151 SS14 hit rules with one. */
export const DEFAULT_SHOTGUN_KEPT = 0.3;

/** Share kept from a skill text's "Shotgun Effect falloff coefficient is X%" (the share lost): 1 − X / 100. */
export function keptShareFromCoefficient(percent) {
  const value = Number(percent);
  return Number.isFinite(value) ? Math.max(0, Math.round((1 - value / 100) * 10000) / 10000) : null;
}

/** Total damage of `hits` effects of one skill on one target, relative to one hit. */
export function shotgunTotal(hits, coefficient = DEFAULT_SHOTGUN_KEPT) {
  const count = Math.max(0, Number(hits) || 0);
  return count > 0 ? 1 + (Number(coefficient) || 0) * (count - 1) : 0;
}

// How many of `count` simultaneous effects reach the one dummy:
// - "fan": a Horizontal projectile volley. Standing close every projectile reaches the dummy: the hit rules of the fans the
//   planner models (Chromatic Shot 466048, Arrow Einherjar 661940, Electrifying Shot: Close-Range 410757, Spikeburst 960088)
//   have bHitBrother 1 in brother group 1, so each sibling may hit the victim another sibling hit; Split Shot's own rules
//   (303830, 555177) have bHitBrother 0 and its Volley support grants the Shotgun Effect label (3050340) instead (client sibling rule; user decision 2026-11-05, replacing the
//   ceil(n / 2) read from the 2026-10-12 Chromatic runs). At range only the centre one hits (observed at about 10 m: 1 of 3),
//   the Distance condition's other alternative (conditions.nearTarget false; the client does not settle the spread angle).
// - "half": projectiles that fall on an area where only part of them aim at enemies (Rain of Arrows: its Tracking support
//   makes them "guaranteed to aim at enemies"; the fallen-projectile component's default aim share is 50%). ceil(n / 2)
//   at any distance (provisional).
// - "all": every effect lands. This covers volleys whose game data aims every projectile at the enemy (aimEmemyPercent
//   100: Fallen Star, Inexhaustible Barrage, Marked Rain of Arrows), volleys with no spread angle (Icebound Beam's Icy
//   Blades), and effects that are not projectiles (Clones, Torrents).
export const SHOTGUN_REACH = Object.freeze({
  fan: "a projectile fan: every projectile reaches the dummy standing close (hit rule bHitBrother 1), one at range",
  half: "about half of the projectiles aim at the enemy, ceil(n / 2) (provisional)",
  all: "every one reaches the dummy"
});

/** Effects of a volley of `count` that reach the dummy. */
export function shotgunReach(count, reach = "all", { nearTarget = true } = {}) {
  const total = Math.max(1, Math.trunc(Number(count) || 1));
  if (reach === "fan") return nearTarget === false ? 1 : total;
  if (reach === "half") return Math.ceil(total / 2);
  return total;
}

/**
 * One volley on the dummy: { count, reached, factor, reach, total } with total = 1 + factor × (reached − 1).
 * @param {{ count: number, factor?: number, reach?: "fan"|"half"|"all" }} falloff
 */
export function shotgunVolley(falloff, { nearTarget = true, landed = null } = {}) {
  if (!falloff) return null;
  const count = Math.max(1, Math.trunc(Number(falloff.count) || 1));
  const reach = SHOTGUN_REACH[falloff.reach] ? falloff.reach : "all";
  const factor = falloff.factor ?? 1;
  const autoReached = shotgunReach(count, reach, { nearTarget });
  // `landed`: the user's "Projectiles hitting the dummy" count (Config tab, combat.projectileHits; 2026-11-12), clamped to 1..fired.
  // It replaces the reach rule at either distance.
  const override = Number.isFinite(landed) && landed >= 1;
  const reached = override ? Math.min(count, Math.max(1, Math.trunc(landed))) : autoReached;
  // `lead`: full-damage hits outside the volley's brother group (a hit rule in group −1 is never counted by a sibling, client
  // 0x1423e3d40), landing before it: Spectral Slash's Finisher slash ahead of its Clones (Split 626480; research/spectral-slash-clones-2026-11-09.md).
  const lead = Math.max(0, Number(falloff.lead) || 0);
  return { count, reached, factor, reach, nearTarget: nearTarget !== false, ...(lead ? { lead } : {}), ...(override ? { override: true, autoReached } : {}), total: lead + shotgunTotal(reached, factor) };
}

/** Hit-profile note for a volley of `count` at coefficient `factor` (best case: standing close). */
export function shotgunProfileNote(count, factor, reach = "all") {
  const volley = shotgunVolley({ count, factor, reach });
  const percent = Math.round(factor * 100);
  const landed = volley.reach === "fan" ? `a projectile fan: all ${volley.count} reach the dummy standing close (one at range)` : volley.reach === "half" ? `about half aim at the enemy: ${volley.reached} of ${volley.count} reach the dummy` : `all ${volley.count} reach the dummy`;
  return `${volley.count} effects can hit the same enemy with each repeat hit keeping ${percent}% (hit rule repeatDmgDecPercent ${percent}); ${landed}; the first at 100% and each further one at ${percent}%: 1 + ${factor} × ${volley.reached - 1} = ×${Math.round(volley.total * 10000) / 10000} (client repeat multiplier: the table value is the share kept; src/shotgun-effect.js)`;
}

/** Short text for a volley: "3 of 3 reach the dummy, ×1.6 (1 + 0.3 × 2, linear Shotgun falloff)". */
export function shotgunVolleyText(volley) {
  if (!volley) return "";
  return `${volley.lead ? `${volley.lead} full hit(s) outside the group + ` : ""}${volley.reached} of ${volley.count} reach the dummy, ×${Math.round(volley.total * 10000) / 10000} (${volley.lead ? `${volley.lead} + ` : ""}1 + ${volley.factor} × ${volley.reached - 1}, linear Shotgun falloff)`;
}
