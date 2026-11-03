// Stat defaults, caps and floors taken from the game's attribute data (2026-10-17 game attribute data).
//   config_attributes (src/data/game/attribute-definitions.generated.js): each attribute's default value and limit.
//   config_attributes_show (src/data/game/attribute-formulas.generated.js): the panel formulas, for caps they apply.
// The values are copied here so the browser does not load the generated tables at startup; tests/game-attribute-defaults.test.js
// checks every one against the generated data, so a regenerated table that moves a value fails the suite.

/** Max Fire / Lightning / Cold / Erosion Resistance default (config_attributes 5127 / 5128 / 5129 / 5409). */
export const MAX_RESISTANCE_DEFAULT_PERCENT = 60;
export const MAX_RESISTANCE_ATTRIBUTES = Object.freeze({ Fire: 5127, Lightning: 5128, Cold: 5129, Erosion: 5409 });

/** Max Resistance hard cap: panel rows 30500 / 30600 / 30700 / 30800, "([A5127]>90) and 90 or [A5127]". */
export const MAX_RESISTANCE_HARD_CAP_PERCENT = 90;
export const MAX_RESISTANCE_CAP_ROWS = Object.freeze({ Fire: 30500, Cold: 30600, Lightning: 30700, Erosion: 30800 });

/**
 * "Additional (type) damage taken" attributes (default factor 1) and their limit: the % value never goes below −90, so the
 * factor of one attribute is at least 0.1. Additional Erosion Damage taken (5408) carries no limit in the data.
 */
export const DAMAGE_TAKEN_FLOOR_PERCENT = -90;
export const DAMAGE_TAKEN_ATTRIBUTES = Object.freeze({
  All: 5720, Physical: 5003, Fire: 5120, Cold: 5121, Lightning: 5122, Elemental: 5123, Erosion: 5408,
});
export const DAMAGE_TAKEN_LIMITED_ATTRIBUTES = Object.freeze([5003, 5120, 5121, 5122, 5123, 5720, 5813, 5814, 5815, 5816, 5817, 5818, 5819]);
/** One attribute's additional-damage-taken factor with its limit applied (attributes without a limit pass through). */
export function limitDamageTakenFactor(factor, attribute = DAMAGE_TAKEN_ATTRIBUTES.All) {
  if (!DAMAGE_TAKEN_LIMITED_ATTRIBUTES.includes(attribute)) return factor;
  return Math.max((100 + DAMAGE_TAKEN_FLOOR_PERCENT) / 100, factor);
}

/** Damage increase per point of Affliction: config_attributes 5724 default 0.01 (1% per point). */
export const AFFLICTION_DAMAGE_PER_POINT = 0.01;

/** Life / Shield Regain Interval: config_attributes 1320 / 1610 default 0.5 s. */
export const LIFE_REGAIN_INTERVAL_SECONDS = 0.5;
export const SHIELD_REGAIN_INTERVAL_SECONDS = 0.5;

/** Critical Strike Damage default: config_attributes 4803 default 150 (%). */
export const BASE_CRITICAL_DAMAGE_PERCENT = 150;

/** Max Block Chance: config_attributes 4804 default 100 (%). */
export const MAX_BLOCK_CHANCE_PERCENT = 100;

/** Barrier absorption ratio of each damage type: config_attributes 6226–6230 default 50 (%). */
export const BARRIER_ABSORPTION_PERCENT = 50;
