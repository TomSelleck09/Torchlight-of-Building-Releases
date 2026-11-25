import { auraLevelRecordsSs13 } from "./aura-level-records-ss13.generated.js";
import { SKILL_BUFFS } from "../game/skill-game-values.generated.js";
import { buffDataMode } from "../../game-skill-data.js";
import { BOSS_ENEMY_COUNT, recordCountsBossAsFive } from "../../boss-enemy-count.js";

// Buff affix IDs from the installed SS13 tables. A line index refers to the
// skill's first displayed effect, after its introductory "Activates" line.
export const AURA_AFFIX_STATS = {
  538865344: { stat: "meleeCriticalStrikeRatingPercent", line: 1, digits: 1 },
  902035584: { stat: "additionalMeleeSkillDamagePercent", line: 2, digits: 1 },
  707968: { stat: "meleeAttackSpeedPercent", line: 3, digits: 1 },
  200000399: { stat: "additionalPhysicalDamagePercent", line: 1, digits: 1 },
  101010489: { stat: "lifeRegenerationPerSecond", line: 1, digits: 0 },
  32061338: { stat: "lifeRegenerationPercentPerSecond", line: 1, digits: 1 },
  919705: { stat: "additionalLightningDamagePercent", line: 1, digits: 1 },
  869686: { stat: "additionalColdDamagePercent", line: 1, digits: 1 },
  183600: { stat: "evasion", line: 1, digits: 0 },
  101010327: { stat: "additionalEvasionPercent", line: 2, digits: 1 },
  10091901: { stat: "additionalSpellDamagePercent", line: 1, digits: 1 },
  13978: { stat: "maxEnergyShield", line: 1, digits: 1 },
  101010379: { stat: "additionalMaxEnergyShieldPercent", line: 2, digits: 2 },
  101010397: { stat: "manaRegenerationPerSecond", line: 1, digits: 0 },
  101010174: { stat: "manaRegenerationSpeedPercent", line: 2, digits: 1 },
  200000401: { stat: "additionalProjectileDamagePercent", line: 1, digits: 1 },
  101010524: { stat: "additionalProjectileAilmentDamagePercent", line: 2, digits: 1 },
  382580: { stat: "projectileSpeedPercent", line: 3, digits: 1 },
  5830: { stat: "elementalResistancePercent", line: 1, digits: 1 },
  6800890: { stat: "additionalElementalDamageTakenPercent", line: 2, digits: 1 },
  579241344: { stat: "elementalAilmentAvoidancePercent", line: 3, digits: 1 },
  200000402: { stat: "movementSpeedPercent", line: 1, digits: 1 },
  200000403: { stat: "additionalDamageOverTimePercent", line: 1, digits: 1 },
  8665442: { stat: "afflictionPerSecond", line: 2, digits: 0 },
  319376192: { stat: "additionalErosionDamagePercent", line: 1, digits: 1 },
  6779909: { stat: "additionalFireDamagePercent", line: 1, digits: 1 },
  101010015: { stat: "armor", line: 1, digits: 0 },
  101010326: { stat: "additionalArmorPercent", line: 2, digits: 1 },
  749046: { stat: "additionalMinionDamagePercent", line: 1, digits: 1 },
  929288640: { stat: "minionAggressivenessPercent", line: 2, digits: 1 },
  247322000: { stat: "additionalMinionMaxLifePercent", line: 3, digits: 1 },
  101010078: { stat: "additionalAttackDamagePercent", line: 1, digits: 1 },
  871242: { stat: "additionalAreaDamagePercent", line: 1, digits: 1 },
  183965584: { stat: "additionalAreaAilmentDamagePercent", line: 2, digits: 1 },
  // Precise: Domain Expansion's two gated affixes (records 263618880 / 687124224: gate 4 "at least P2 enemies within P1 m" with
  // calcCountByRarity, value P3 × GetEffectScale): the Boss dummy counts as 5 enemies (src/boss-enemy-count.js), so they hold in combat;
  // each is its own additional write. The town panel has no target (combatOnly). Parameters [radius, enemies, value] (2026-11-13, G1b).
  263618880: { stat: "additionalAreaDamageCrowdPercent", line: -1, digits: 1, param: 2, enemiesParam: 1, combatOnly: true },
  687124224: { stat: "additionalAreaAilmentDamageCrowdPercent", line: -1, digits: 1, param: 2, enemiesParam: 1, combatOnly: true },
  // Its "+P3% Skill Area when there are at least P2 enemies within P1 m" (495834240, attr 6201 mod 3 × GetEffectScale, the same gate): the
  // Precise form's [10, 5, 20] holds on the Boss dummy, the plain Domain Expansion's [10, 8, 20] does not; read by the hit's Skill Area readers
  // (src/planner.js combatSkillArea; line sweep 2026-11-24).
  495834240: { stat: "skillAreaCrowdPercent", line: -1, digits: 1, param: 2, enemiesParam: 1, combatOnly: true },
  363414400: { stat: "additionalAilmentDamagePercent", line: 1, digits: 1 },
  101080017: { stat: "ailmentChancePercent", line: 2, digits: 1 },
  101010359: { stat: "ailmentDurationPercent", line: 3, digits: 1 }
};

/** Aura stats with a combat-only gate (an enemy count): left out of the town context (src/engine.js). */
export const AURA_COMBAT_ONLY_STATS = new Set(Object.values(AURA_AFFIX_STATS).filter((item) => item.combatOnly).map((item) => item.stat));

export const auraScalingSs13 = auraLevelRecordsSs13;

// The same 40 Aura buffs from the SS14 tables (scripts/build-skill-game-values.mjs, config_char_buff 2026-10-15; research/
// recipe-interpreter-step1-2026-10-25.md §17): every affix and value equals the SS13 record (70 / 70 affixes), so the switch moves
// nothing; it keeps the Aura values on the current game data. usesGetEffectScale is the affix recipe's (the same affix ids). The SS13
// records stay the fallback (TLI_BUFF_PATH=text, or an Aura missing from the SS14 table).
const SS14_AURA_RECORDS = Object.fromEntries(Object.entries(auraLevelRecordsSs13).flatMap(([name, record]) => {
  const buff = SKILL_BUFFS[name];
  if (!buff || buff.id !== record.buffId || !buff.rows?.[0]) return [];
  return [[name, { buffId: record.buffId, source: "SS14 config_char_buff", affixes: buff.rows[0].map(([affixId, args]) => {
    const usesGetEffectScale = record.affixes.find((affix) => affix.affixId === affixId)?.usesGetEffectScale ?? true;
    return Array.isArray(args[0]) ? { affixId, usesGetEffectScale, levelMap: Object.fromEntries(args[0]) } : { affixId, usesGetEffectScale, fixedParameters: args };
  }) }]];
}));
/** The Aura record the planner reads: SS14 (game mode, default) or the SS13 record. */
export function auraRecord(name) {
  return (buffDataMode() === "game" && SS14_AURA_RECORDS[name]) || auraLevelRecordsSs13[name] || null;
}

function affixValueAtLevel(affix, level) {
  if (affix.fixedParameters) {
    const metadata = AURA_AFFIX_STATS[affix.affixId];
    // An enemy-count gate ("at least P2 enemies"): the Boss dummy counts as BOSS_ENEMY_COUNT enemies when the record carries
    // calcCountByRarity, else 1; a gate that does not hold gives no value.
    if (metadata?.enemiesParam != null && (recordCountsBossAsFive(affix.affixId) ? BOSS_ENEMY_COUNT : 1) < Number(affix.fixedParameters[metadata.enemiesParam])) return null;
    return Number(affix.fixedParameters[metadata?.param ?? 0]);
  }
  const anchors = Object.entries(affix.levelMap || {}).map(([at, value]) => [Number(at), Number(value)]).sort((a, b) => a[0] - b[0]);
  if (!anchors.length || !Number.isFinite(level)) return null;
  const selected = Math.max(1, level);
  if (selected <= anchors[0][0]) return anchors[0][1];
  for (let index = 1; index < anchors.length; index++) {
    const [nextLevel, nextValue] = anchors[index];
    if (selected <= nextLevel) {
      const [previousLevel, previousValue] = anchors[index - 1];
      const interpolated = previousValue + (selected - previousLevel) * (nextValue - previousValue) / (nextLevel - previousLevel);
      return Math.round(interpolated * 1e6) / 1e6;
    }
  }
  return anchors.at(-1)[1];
}

export function auraValueAtLevel(name, stat, level) {
  const affix = auraRecord(name)?.affixes.find((item) => AURA_AFFIX_STATS[item.affixId]?.stat === stat);
  return affix ? affixValueAtLevel(affix, level) : null;
}

export function auraValuesAtLevel(name, level) {
  const record = auraRecord(name);
  if (!record) return null;
  return Object.fromEntries(record.affixes.flatMap((affix) => {
    const stat = AURA_AFFIX_STATS[affix.affixId]?.stat;
    const value = affixValueAtLevel(affix, level);
    return stat && Number.isFinite(value) ? [[stat, value]] : [];
  }));
}

export function auraStatUsesEffectScale(name, stat) {
  const affix = auraRecord(name)?.affixes.find((item) => AURA_AFFIX_STATS[item.affixId]?.stat === stat);
  return affix?.usesGetEffectScale !== false;
}

function displayedValue(value, digits) {
  return String(Number((value + Number.EPSILON).toFixed(digits)));
}

export function scaledAuraEffects(name, level, effects) {
  const record = auraRecord(name);
  if (!record || !Number.isFinite(level) || level < 1 || level > 40 || !effects?.length) return null;
  const lines = effects[0].split("\n");
  let changed = false;
  for (const affix of record.affixes) {
    const metadata = AURA_AFFIX_STATS[affix.affixId];
    if (!metadata || !affix.levelMap || !lines[metadata.line]) continue;
    const value = affixValueAtLevel(affix, level);
    const replacement = displayedValue(value, metadata.digits);
    const updated = lines[metadata.line].replace(/([+-]?)(\d+(?:\.\d+)?)/, (_match, sign) => sign + replacement);
    if (updated !== lines[metadata.line]) changed = true;
    lines[metadata.line] = updated;
  }
  return { effects: [lines.join("\n"), ...effects.slice(1)], exact: true, changed };
}
