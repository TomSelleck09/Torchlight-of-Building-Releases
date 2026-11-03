// "% of Base Damage" skills (research/base-damage-skills-2026-10-11.md).
//
// Every catalog skill whose damage reads "equal to N% of Base Damage" is a Minion skill: a Spirit Magus skill, a
// Synthetic Troop skill, or a Modularization skill ("Synthetic Troop summoning skills that can simulate certain
// monster abilities", game manual rule 1001013110). "Base Damage" is the Minion's own Base Damage stat. The game
// tooltip labels it under "Minion Base Stats" (localization Func_SkillTips_ServantTitle_2 / Func_SkillTips_ServantDPS),
// and reference data publishes it per summon-skill level as the "damage" column of the summon's Minion table.
//
// Sourced:
// - The Base Damage curve below: reference data Minion tables for Summon Machine Guard (Lv1-60, every row), Summon Fire Magus
//   and Summon Frost Magus (Lv1/2/3/5/10/15/19/20/21/25/30/40/60) are identical; it is frozen from Lv.20 on.
// - Past Lv.20 the Minion's Base Damage stops changing and "this skill and its Minions" gain the per-level
//   additional damage (manual rule 1001000822), so the player skill-level multiplier applies unchanged.
// - The percentage: config_skill_damage rows store it as a typed "mode 4" entry (type key + percent). Hit rows add a
//   "mode 2" entry with the same percent (read here as the effectiveness of added flat damage, which reference data shows as
//   "Effectiveness of added damage" with the same value); Persistent (row kind 2) rows have no mode-2 entry.
// - Minions are independent of the player: "Only effects that explicitly increase Minion stats will be applied to
//   Minions" (manual rule 1001011821). These figures are therefore unmodified Minion damage. Player Spell / Fire /
//   Area lines must never be applied to them, so they do not go through the player skill-hit engine.
//
// Not sourced (flagged per skill in `assumptions`): Minion use rates (AI, cooldowns, Spirit Magus Stage/Growth) and
// Command. The Modularization Base Damage table was confirmed in game at Lv.1 (10) and Lv.20 (300) on 2026-10-11.
// The Minion damage path that consumes this table is src/minion-damage-model.js (profiles in src/minion-profiles.js,
// per-level rows for all 54 skills in src/data/skills/minion-skill-damage-ss13.generated.js); the four components
// below remain as the first reference and are pinned against the generated rows.
import { skillLevelDamageMultiplier } from "./engine.js";

export const MINION_BASE_DAMAGE_FROZEN_LEVEL = 20;

// reference data summon-skill Minion table, "damage" column, Lv.1-20 (index = level - 1).
export const MINION_BASE_DAMAGE_BY_LEVEL = Object.freeze([
  10, 12, 16, 20, 24, 28, 34, 40, 48, 58,
  66, 74, 84, 96, 108, 124, 150, 180, 220, 300,
]);

export function minionBaseDamage(level) {
  if (!Number.isInteger(level) || level < 1) throw new RangeError("skill level must be a whole number of at least 1");
  return MINION_BASE_DAMAGE_BY_LEVEL[Math.min(level, MINION_BASE_DAMAGE_FROZEN_LEVEL) - 1];
}

const UNMODIFIED = "Unmodified Minion damage: no Minion Damage lines, crit, penetration, Command or Spirit Magus Stage/Growth bonuses; player damage lines never apply to Minions (manual rule 1001011821)";
// In-game checks (user, 2026-10-11): God of Swords and Huge Ember Automaton Lv.20 show Base Damage 300 (Life 1500),
// and Goblin Priest Lv.1 shows Base Damage 10 (Life 50); crit rating 500 / crit damage 150 at both levels. So the
// modules use the shared curve at both ends; levels 2–19 follow the same reference data table.
const SHARED_CURVE_ASSUMED = "Modularization Minion uses the shared Minion Base Damage curve (confirmed in game at Lv.1 = 10 and Lv.20 = 300)";
const PERSISTENT = "Persistent damage per second (config_skill_damage row kind 2); duration, area overlap and use rate not modeled";

// Per-level percentages are the config_skill_damage typed entries (gamedata-2026-10-10), Lv.1-20 (index = level - 1).
// Group links: the Spirit Magus and Modularization families are numbered per Minion (68x Fire Magus, 69x Frost Magus,
// 109x Chief Machinist), which resolves the two ambiguous value links in research/skill-inventory-2026-10-11.json.
export const BASE_DAMAGE_SKILL_COMPONENTS = Object.freeze({
  "Blazing Spin": Object.freeze({
    minion: "Fire Magus", minionType: "Spirit Magus", summonSkill: "Summon Fire Magus", minionSkillType: "Empower",
    gameGroup: 682, delivery: "persistent", damageType: "Fire", addedDamage: false,
    // Lv.19 is 137 and Lv.20 is 136 in the game rows; reference data Lv.20 shows 136%.
    percentByLevel: Object.freeze([90, 93, 96, 98, 101, 103, 106, 109, 111, 114, 116, 119, 121, 124, 127, 129, 132, 134, 137, 136]),
    assumptions: Object.freeze([UNMODIFIED, PERSISTENT]),
  }),
  "Frost Release": Object.freeze({
    minion: "Frost Magus", minionType: "Spirit Magus", summonSkill: "Summon Frost Magus", minionSkillType: "Empower",
    gameGroup: 692, delivery: "hit", damageType: "Cold", addedDamage: true,
    percentByLevel: Object.freeze([48, 49, 51, 52, 53, 55, 56, 57, 59, 60, 61, 63, 64, 66, 67, 68, 70, 71, 72, 72]),
    assumptions: Object.freeze([UNMODIFIED]),
  }),
  Firebomb: Object.freeze({
    minion: "Chief Machinist", minionType: "Synthetic Troop (Modularization)", summonSkill: "Module: Chief Machinist", minionSkillType: "Modularization",
    gameGroup: 1091, delivery: "hit", damageType: "Fire", addedDamage: true,
    percentByLevel: Object.freeze(Array(20).fill(73)),
    assumptions: Object.freeze([UNMODIFIED, SHARED_CURVE_ASSUMED, "Number of bomb areas per cast not sourced"]),
  }),
  Pyromania: Object.freeze({
    minion: "Chief Machinist", minionType: "Synthetic Troop (Modularization)", summonSkill: "Module: Chief Machinist", minionSkillType: "Modularization",
    gameGroup: 1092, delivery: "persistent", damageType: "Fire", addedDamage: false,
    percentByLevel: Object.freeze([45, 47, 48, 49, 50, 52, 53, 54, 56, 57, 58, 59, 61, 62, 63, 65, 66, 67, 68, 68]),
    assumptions: Object.freeze([UNMODIFIED, SHARED_CURVE_ASSUMED, PERSISTENT]),
  }),
});

// Unmodified damage of one hit (delivery "hit") or one second (delivery "persistent") of a "% of Base Damage" skill
// at the given summon-skill level. `addedFlatDamage` is flat damage added to the Minion's hits (none is modeled yet).
export function baseDamageSkillDamage(name, level, { addedFlatDamage = 0 } = {}) {
  const component = BASE_DAMAGE_SKILL_COMPONENTS[name];
  if (!component) return null;
  const baseDamage = minionBaseDamage(level);
  const percent = component.percentByLevel[Math.min(level, MINION_BASE_DAMAGE_FROZEN_LEVEL) - 1];
  const added = component.addedDamage ? Math.max(0, Number(addedFlatDamage) || 0) : 0;
  const levelMultiplier = skillLevelDamageMultiplier(level);
  return {
    skill: name,
    level,
    minion: component.minion,
    minionType: component.minionType,
    gameGroup: component.gameGroup,
    delivery: component.delivery,
    damageType: component.damageType,
    baseDamage,
    percent,
    addedFlatDamage: added,
    levelMultiplier,
    amount: ((baseDamage + added) * percent / 100) * levelMultiplier,
    unit: component.delivery === "persistent" ? "per second" : "per hit",
    assumptions: component.assumptions,
  };
}
