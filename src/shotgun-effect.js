// Shotgun Effect: several effects of one skill hitting the same enemy (keyword 642: "The first effect hit deals 100% damage,
// and subsequent effects hit deal less damage").
//
// Falloff (sourced): linear. The first hit on the target deals 100%, and every repeat hit by the same skill deals the skill's
// coefficient c, so the total is 1 + c × (hits − 1).
// - In-game tooltip (Chromatic Shot Lv16, user 2026-10-12): "This skill's Shotgun Effect falloff coefficient is 70%".
// - Game data: every skill's hit rule (SkillEditor component 104998) carries `repeatDmgDecPercent` as one flat (1, X) row,
//   with X = 100 − the tooltip coefficient (Chromatic Shot, Scorching Beam and Hammer of Ash 30; Ice Lances 36; Split Shot
//   23; Whirlwind Blade 25). That is one rate for every repeat hit, not a compounding c^i.
// - Observed: Chromatic Shot Lv16 on the Lv.85 dummy (research/residual-batch-2026-10-12.md §5.3). Close, 3 projectiles:
//   1.70 hit-equivalents per cast (1 + 0.7). Close, 5 projectiles: 2.49 (≈ 1 + 0.7 × 2). About 10 m: 1.03 (one projectile).
//   Scorching Beam + Scattershot (src/scorching-beam-base-hit.js) already used this form.
// Before 2026-10-12 the projectile profiles summed c^i (Σ 0.7^i: 2.19 for 3 hits instead of 2.4).

/** Total damage of `hits` effects of one skill on one target, relative to one hit. */
export function shotgunTotal(hits, coefficient = 0.7) {
  const count = Math.max(0, Number(hits) || 0);
  return count > 0 ? 1 + (Number(coefficient) || 0) * (count - 1) : 0;
}

// How many of `count` simultaneous effects reach the one dummy:
// - "fan": a Horizontal projectile volley. Additional projectiles share the origin and fly "at intervals at a certain
//   angle" (manual 1001011021). Standing close, about half reach the dummy, ceil(n / 2). This is observed for Chromatic
//   Shot (2 of 3 and 3 of 5 within 6 m) and provisional for every other fan. At range only the centre one hits (observed at
//   about 10 m: 1 of 3), which is the Distance condition's other alternative (conditions.nearTarget false).
// - "half": projectiles that fall on an area where only part of them aim at enemies (Rain of Arrows: its Tracking support
//   makes them "guaranteed to aim at enemies"; the fallen-projectile component's default aim share is 50%). ceil(n / 2)
//   at any distance (provisional).
// - "all": every effect lands. This covers volleys whose game data aims every projectile at the enemy (aimEmemyPercent
//   100: Fallen Star, Inexhaustible Barrage, Marked Rain of Arrows), volleys with no spread angle (Icebound Beam's Icy
//   Blades), and effects that are not projectiles (Clones, Torrents).
export const SHOTGUN_REACH = Object.freeze({
  fan: "a projectile fan: about half reach the dummy standing close, ceil(n / 2) (Chromatic Shot runs 2026-10-12), one at range",
  half: "about half of the projectiles aim at the enemy, ceil(n / 2) (provisional)",
  all: "every one reaches the dummy"
});

/** Effects of a volley of `count` that reach the dummy. */
export function shotgunReach(count, reach = "all", { nearTarget = true } = {}) {
  const total = Math.max(1, Math.trunc(Number(count) || 1));
  if (reach === "fan") return nearTarget === false ? 1 : Math.ceil(total / 2);
  if (reach === "half") return Math.ceil(total / 2);
  return total;
}

/**
 * One volley on the dummy: { count, reached, factor, reach, total } with total = 1 + factor × (reached − 1).
 * @param {{ count: number, factor?: number, reach?: "fan"|"half"|"all" }} falloff
 */
export function shotgunVolley(falloff, { nearTarget = true } = {}) {
  if (!falloff) return null;
  const count = Math.max(1, Math.trunc(Number(falloff.count) || 1));
  const reach = SHOTGUN_REACH[falloff.reach] ? falloff.reach : "all";
  const factor = falloff.factor ?? 1;
  const reached = shotgunReach(count, reach, { nearTarget });
  return { count, reached, factor, reach, nearTarget: nearTarget !== false, total: shotgunTotal(reached, factor) };
}

/** Hit-profile note for a volley of `count` at coefficient `factor` (best case: standing close). */
export function shotgunProfileNote(count, factor, reach = "all") {
  const volley = shotgunVolley({ count, factor, reach });
  const percent = Math.round(factor * 100);
  const landed = volley.reach === "fan" ? `a projectile fan: ${volley.reached} of ${volley.count} reach the dummy standing close (ceil(n / 2); one at range)` : volley.reach === "half" ? `about half aim at the enemy: ${volley.reached} of ${volley.count} reach the dummy` : `all ${volley.count} reach the dummy`;
  return `${volley.count} effects can hit the same enemy at a ${percent}% Shotgun Effect coefficient; ${landed}; the first at 100% and each further one at ${percent}%: 1 + ${factor} × ${volley.reached - 1} = ×${Math.round(volley.total * 10000) / 10000} (linear: game hit rule repeatDmgDecPercent; src/shotgun-effect.js)`;
}

/** Short text for a volley: "2 of 3 reach the dummy, ×1.7 (1 + 0.7 × 1, linear Shotgun falloff)". */
export function shotgunVolleyText(volley) {
  if (!volley) return "";
  return `${volley.reached} of ${volley.count} reach the dummy, ×${Math.round(volley.total * 10000) / 10000} (1 + ${volley.factor} × ${volley.reached - 1}, linear Shotgun falloff)`;
}
