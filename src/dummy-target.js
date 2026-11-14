// The target every dummy figure assumes (user's answers, 2026-10-09):
// - the training dummy counts as a Boss, and so also as an Elite;
// - the player stands within 10 m of it;
// - each 5 s / 20 s window starts with the player's own buffs already built
//   (channel stacks, blessings), while the dummy itself starts clean
//   (no ailments, Affliction, curses or resistance reduction yet).
export const dummyTarget = Object.freeze({ boss: true, elite: true, withinMeters: 10 });

// The game's Enemy Count rule: "each Boss counts as 5 monsters" (the Enemy Count hyperlink text). A record whose node 700 (count of enemies)
// or count gate carries `calcCountByRarity` counts the Boss dummy as 5 enemies (Spectral Slash: Legion, record 506057920, applied
// 2026-11-08; the other readers 2026-11-13: src/boss-enemy-count.js). Per-enemy records without the flag (14773965, 137974192) keep 1.
export const BOSS_ENEMY_COUNT = 5;

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

// The player's walking speed while the Movement group is Moving (user decision 2026-11-10; research/ring-barrier-movement-2026-11-10.md),
// for every per-metre reader (the ring's movement Barrier, Hunting Tempo, Thunder Focus, Carino's movement Deflection, Sage's Tumbleweed
// Seed). It replaces the unsourced 6 m/s placeholder of 2026-10-12. 100 game units are 1 m (proven: record 308512 counts P1 × 100 for
// "every P1 m"). The base 650 units/s is inferred (records 271919904 / 350901824 compare GetAttr(4) against "P1% of the base value" as
// p0 × 13/2; the player's own base write was not found, probably server-side: open question player-base-move-speed). Speed = base ×
// (1 + Σ increased Movement Speed %) × Π(1 + additional Movement Speed %) (panel rows 60100 / 60101; the GetAttr rule), moving 100% of
// the time (the Movement group's best case).
export const UNITS_PER_METER = 100;
export const PLAYER_BASE_MOVE_UNITS_PER_SECOND = 650;
export const PLAYER_BASE_MOVE_METERS_PER_SECOND = PLAYER_BASE_MOVE_UNITS_PER_SECOND / UNITS_PER_METER;

const roundSpeed = (value) => Math.round(value * 1000) / 1000;

/**
 * The player's movement speed in m/s from the combat Movement Speed (src/planner.js lineConditionState: the stat sheet's increased
 * Movement Speed plus the held conditional lines, and the additional Movement Speed factor).
 * @param {{ increasedPercent?: number, additionalFactor?: number }} p
 * @returns {{ metersPerSecond: number, increasedPercent: number, additionalFactor: number, text: string }}
 */
export function playerMoveSpeed({ increasedPercent = 0, additionalFactor = 1 } = {}) {
  const increased = Number(increasedPercent) || 0;
  const additional = Number.isFinite(Number(additionalFactor)) ? Number(additionalFactor) : 1;
  const metersPerSecond = Math.max(0, PLAYER_BASE_MOVE_METERS_PER_SECOND * (1 + increased / 100) * additional);
  const text = `${roundSpeed(metersPerSecond)} m/s: ${PLAYER_BASE_MOVE_METERS_PER_SECOND} m/s base × (1 + ${roundSpeed(increased)}%)${additional !== 1 ? ` × ${roundSpeed(additional)} additional` : ""}`;
  return { metersPerSecond, increasedPercent: increased, additionalFactor: additional, text };
}

/** The base speed (no Movement Speed lines), for a reader called without the planner's state. */
export const BASE_PLAYER_MOVE_SPEED = Object.freeze(playerMoveSpeed());

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
