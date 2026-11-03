// The target every dummy figure assumes (user's answers, 2026-10-09):
// - the training dummy counts as a Boss, and so also as an Elite;
// - the player stands within 10 m of it;
// - each 5 s / 20 s window starts with the player's own buffs already built
//   (channel stacks, blessings), while the dummy itself starts clean
//   (no ailments, Affliction, curses or resistance reduction yet).
export const dummyTarget = Object.freeze({ boss: true, elite: true, withinMeters: 10 });

// Distance keywords (sourced: reference data keyword tooltips "Nearby" = "Within 6m", "Proximity" = "Within 4m", "Distant" = "6m
// away"; game keywords 102 / 160 / 150 carry the radius as {%s:1}; research/residual-batch-2026-10-12.md §4.1). Before
// 2026-10-12 the planner read Nearby and Proximity as the 10 m stand-in of the dummy profile (open question Q-G9).
export const KEYWORD_RADII_METERS = Object.freeze({ nearby: 6, proximity: 4, distant: 6 });

// Where the player stands (user decision 2026-10-12, best case): close to the dummy, so Nearby and Proximity hold and a line
// with an explicit radius ("within 3 m", "within 10 m") holds at point blank. "Distant" lines are the other alternative of
// the Distance exclusive group (src/planner.js), which stands 6 m away: Nearby / Proximity lines are off there (the 6 m
// boundary is read as exclusive: provisional) and an explicit radius holds only from 6 m up. Either way the player is
// within 10 m, so "within 10 m" rules (Torturer's Touch's Reap, Elite within 10 m) hold in both.
export const DISTANT_STANDING_METERS = KEYWORD_RADII_METERS.distant;

// Movement rate while the Movement group is Moving, for per-metre support lines (Hunting Tempo, 2026-10-15 patch update). It is
// the same unsourced 6 m/s placeholder as the Thunder Focus profile (src/attack-hit-profiles.js
// THUNDER_FOCUS_ASSUMED_METERS_PER_SECOND; a test pins the two equal). No game figure fixes it.
export const ASSUMED_MOVEMENT_METERS_PER_SECOND = 6;

/** Does a line with an explicit radius ("within N m") hold at the chosen distance (near: point blank; else 6 m)? */
export function explicitRadiusHolds(meters, nearTarget = true) {
  if (!Number.isFinite(Number(meters))) return nearTarget !== false;
  return nearTarget !== false ? true : Number(meters) >= DISTANT_STANDING_METERS;
}

// "against <word>" target words, mapped to the dummyTarget flag they need.
export const dummyTargetWords = Object.freeze({ Elite: "elite", Elites: "elite", Boss: "boss", Bosses: "boss" });

export function dummyTargetWord(word = "") {
  const key = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  return dummyTargetWords[key] || null;
}
