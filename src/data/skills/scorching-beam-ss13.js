// Database snapshot: SS13. Sourced values are kept separate from user-specific observations.
export const scorchingBeamSs13 = {
  id: 7072,
  name: "Scorching Beam",
  season: "SS13",
  tags: ["spell", "fire", "channeled", "area", "beam", "intelligence"],
  baseLevel: 20,
  baseManaCost: 8,
  baseCastIntervalSeconds: 0.333,
  addedDamageEffectivenessPercent: 41,
  baseMaxChanneledStacks: 5,
  hits: {
    beam: { fireDamage: { min: 156, max: 289 }, everyChannelUse: true },
    explosion: { fireDamage: { min: 467, max: 867 }, atMaxStacks: true }
  },
  // Game text skill_des 16204: "The beams fired and explosions caused by the skill can hit the same enemy. The skill's
  // Shotgun Effect falloff coefficient is {%s:1}%." (70% per reference data).
  rules: { beamAndExplosionCanHitSameEnemy: true, shotgunFalloffCoefficientPercent: 70 },
  // Base Fire hit damage per level from the game's config_skill_damage: group 461 (Fire Beam) and 462 (Fire Explosion),
  // levels 1–20 (tools/inspect-tli-skill-damage.mjs; research/skill-damage-config-2026-10-07.md). Level 20 equals the reference data
  // packets above; past Lv.20 the base is frozen and the generic per-level multiplier applies (src/engine.js).
  levelRows: {
    beam: { 1: [2, 4], 2: [2, 4], 3: [3, 5], 4: [4, 7], 5: [5, 10], 6: [6, 12], 7: [7, 13], 8: [9, 17], 9: [12, 22], 10: [14, 27], 11: [19, 35], 12: [22, 41], 13: [27, 50], 14: [32, 59], 15: [38, 70], 16: [53, 98], 17: [63, 116], 18: [87, 161], 19: [130, 241], 20: [156, 289] },
    explosion: { 1: [6, 11], 2: [7, 12], 3: [9, 16], 4: [12, 22], 5: [16, 29], 6: [19, 35], 7: [22, 40], 8: [27, 51], 9: [36, 66], 10: [43, 81], 11: [56, 104], 12: [66, 123], 13: [80, 149], 14: [95, 176], 15: [113, 209], 16: [159, 295], 17: [188, 349], 18: [260, 483], 19: [390, 724], 20: [467, 867] },
    source: "config_skill_damage groups 461 / 462"
  },
  source: ""
};

export const scorchingBeamSelectedSupportsSs13 = [
  {
    id: 7489, name: "Refracted Prism", manaCostMultiplierPercent: 110,
    rules: ["+2 additional beam refractions", "-10% additional beam length"],
    additionalDamageAtLevel: (level) => 12 + level * 0.5,
    source: ""
  },
  {
    id: 7454, name: "Guard", manaCostMultiplierPercent: 110,
    rules: ["Every 5 uses, gain Barrier if there is no Barrier; 6 s interval"],
    additionalDamageAtLevel: (level) => 15 + level * 0.5,
    source: ""
  },
  {
    id: 7434, name: "Control Spell", manaCostMultiplierPercent: 110,
    rules: ["-100% critical strike rating for the supported skill"],
    additionalDamageAtLevel: (level) => 27.5 + level * 0.5,
    source: ""
  },
  {
    id: 7413, name: "Additional Ignite", manaCostMultiplierPercent: 110,
    rules: ["Inflicts 1 additional Ignite stack", "+15% Ignite chance"],
    igniteDamagePerStackAtLevel: (level) => Number((level <= 21 ? 2.5 + level * 0.2 : 4.6 + level * 0.1).toFixed(1)),
    maximumIgniteDamageAtLevel: (level) => Number((level <= 21 ? 10 + level * 0.8 : 18.4 + level * 0.4).toFixed(1)),
    source: ""
  },
  {
    name: "Scorching Beam: Disintegrate (Noble)", observedRank: 5,
    manaCostMultiplierPercent: 110, additionalDamagePercent: 20,
    additionalIgniteDamagePerExtraStackPercentRange: { min: 21, max: 22 },
    source: ""
  }
];
