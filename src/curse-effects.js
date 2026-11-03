import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";
import { normalizePercentageText } from "./percentage-text.js";
import { buffDataMode, skillBuff, gameLevelValue } from "./game-skill-data.js";

// One table for the curses whose effect on the dummy is "+X% additional <Type> Damage taken by Cursed enemies"
// (gear-pact batch G3 / G5, research/gear-pact-batch-2026-10-12.md §7.2). Read from each curse skill's reference data Lv.20 text
// (src/data/skills/all-skill-effects-ss13.generated.js), in either published wording:
//   Timid        — "+39% additional Hit Damage taken by Cursed enemies"
//   Electrocute  — "+39% additional Lightning Damage taken by Cursed enemies"
//   Vulnerability — "+39% additional Physical Damage taken by Cursed enemies" (game data 2026-10-10: char_buff 16060,
//                   affix 200000309 attr 5003 mod 4, GetLevel {1: 20, 21: 40, 41: 50} × GetEffectScale)
//   Biting Cold  — "Cursed enemies +39% additional Cold Damage taken."
//   Corruption   — "Cursed enemies +39% additional Erosion Damage taken."
// The value is scaled by (1 + Curse Effect), as the Vulnerability game record shows (GetEffectScale). Level (game mode, research/
// recipe-interpreter-step1-2026-10-25.md §17): every curse's debuff (config_char_buff 16050-16110, named after the curse) holds
// the same level map {1: 20, 21: 40, 41: 50} on its taken affix, so a curse at its level reads curseGameValue; the Lv.20 value is
// the reference data text's 39 as before. TLI_BUFF_PATH=text: the Lv.20 text at every level, with a note.
// Scorch (Fire, with its Ignite chance on you) and Entangled Pain (Damage Over Time) keep their dedicated models;
// Ominous (Ill Omen needs enemy Max Life) has no effect on the dummy.
const TAKEN_PATTERNS = [
  /^\+(\d+(?:\.\d+)?)% additional (Hit|Physical|Fire|Cold|Lightning|Erosion) Damage taken by Cursed enemies\.?$/i,
  /^Cursed enemies \+(\d+(?:\.\d+)?)% additional (Hit|Physical|Fire|Cold|Lightning|Erosion) Damage taken\.?$/i
];
export const DEDICATED_CURSE_MODELS = new Set(["Scorch", "Entangled Pain"]);
export const NO_DUMMY_EFFECT_CURSES = { Ominous: "Ill Omen needs enemy Max Life; the dummy has none (the curse still uses a curse slot)" };

/**
 * A curse's value at a level from its debuff record (config_char_buff named after the curse: the first affix with a level map,
 * Vulnerability 200000309, Scorch 200000312, Entangled Pain 101010425 …), or null (text mode, no record, no level).
 */
export function curseGameValue(name, level) {
  if (buffDataMode() !== "game" || level == null || !Number.isFinite(Number(level))) return null;
  const entry = skillBuff(name)?.rows?.[0]?.find(([, args]) => Array.isArray(args[0]));
  const value = entry ? gameLevelValue(entry[1][0], Math.max(1, Number(level))) : null;
  return Number.isFinite(value) ? value : null;
}

/** The "+X% additional <Type> Damage taken" a curse applies: the reference data Lv.20 text's type and value, or the value at `level` from the
 * curse's debuff record when a level is given (game mode); null for a curse without such a line. */
export function curseTakenEffect(name, effects = allSkillEffectsSs13[name] || [], level = null) {
  if (DEDICATED_CURSE_MODELS.has(name)) return null;
  for (const line of effects.join("\n").split(/\r?\n/)) {
    const text = normalizePercentageText(line).trim();
    for (const pattern of TAKEN_PATTERNS) {
      const match = text.match(pattern);
      if (!match) continue;
      const game = curseGameValue(name, level);
      return { name, value: game ?? Number(match[1]), type: match[2][0].toUpperCase() + match[2].slice(1).toLowerCase(), sourceText: text, ...(game != null ? { level: Number(level), levelSource: "config_char_buff" } : {}) };
    }
  }
  return null;
}

/** The derived enemy-side line for a curse at a Curse Effect, e.g. "+41.34% additional Erosion Damage taken". */
export function curseTakenLine(effect, curseEffectPercent = 0) {
  const value = Math.round(effect.value * (1 + curseEffectPercent / 100) * 100) / 100;
  return { value, text: `+${value}% additional ${effect.type} Damage taken` };
}
