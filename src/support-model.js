import { supportProgressionSs13 } from "./data/skills/support-progression-ss13.generated.js";
import { supportDataMode, supportGameLine } from "./game-skill-data.js";

// Stacking rule: 
// Values come from the support's skill stone in the game tables at the support's level (src/game-skill-data.js; research/
// recipe-interpreter-step1-2026-10-25.md §17), matched to the reference data progression column they replace; with TLI_SUPPORT_PATH=text
// from the reference data support progression tables (src/data/skills/support-progression-ss13.generated.js) at the support's level:
//  Both agree at every level 1-40 for
// these five (scripts/compare-support-game-values.mjs).
// Model parameters come from tooltips, never from held-out removal DPS.
export const modeledSupportNames = ["Additional Ignite", "Control Spell", "Guard", "Refracted Prism"];

// One progression cell → its numbers ("a/b" fractions, "a,b" pairs).
const cellNumbers = (raw) => String(raw ?? "").split(",").map((part) => {
  const [top, bottom] = part.trim().replace(/−/g, "-").split("/").map(Number);
  return bottom ? top / bottom : top;
});
function columnValues(name, heading, level) {
  const column = (supportProgressionSs13[name]?.columns || []).find((item) => item.heading !== "Descript" && heading.test(item.heading));
  // The reference data table stops at Lv40; past it the text fallback holds the Lv40 cell, and game mode reads the stone at the real level
  // (gameLevelValue holds the curve's last point; uncapped support levels since 2026-10-27, as src/support-effects.js).
  const values = column ? cellNumbers(column.values?.[String(Math.min(40, level))]) : [];
  if (!values.length || !values.every(Number.isFinite)) throw new Error(`${name}: no progression value at Lv.${level}`);
  // Game mode: the stone affix behind the column's heading (the Lv.1 line), at the level; the column's numberIndexes pick its numbers.
  if (supportDataMode() === "game") {
    const game = supportGameLine(name, column.heading, { level });
    const indexes = Array.isArray(column.numberIndexes) && column.numberIndexes.length === values.length ? column.numberIndexes : values.map((_, index) => index);
    const gameValues = game ? indexes.map((index) => game.values[index]) : [];
    if (gameValues.length && gameValues.every(Number.isFinite)) return { values: gameValues, heading: column.heading, game: game.id };
  }
  return { values, heading: column.heading };
}
const baseLineNumber = (name, pattern) => {
  const line = String(supportProgressionSs13[name]?.baseEffect || "").split(/\r?\n/).map((text) => text.trim()).find((text) => pattern.test(text));
  const match = line?.match(pattern);
  if (!match) return null;
  // Game mode: the stone's value for that line (the number the pattern captures is the line's first number).
  const game = supportDataMode() === "game" ? supportGameLine(name, line, { level: 20 }) : null;
  if (game && Number.isFinite(game.values[0])) return game.values[0];
  return Number(match[1].replace("−", "-").replace(/^\+/, ""));
};

export function supportEffect(name, level) {
  if (!Number.isInteger(level) || level < 1) throw new RangeError("Support level must be a whole number of at least 1");
  if (name === "Additional Ignite") {
    // "For each stack of Ignite an enemy has, the supported skill deals X% additional Ignite Damage to the enemy, up to Y%".
    const [perStack, cap] = columnValues(name, /^For each stack of Ignite an enemy has/i, level).values;
    // An Ignite chance line on the support's text (none today).
    const igniteChancePercent = baseLineNumber(name, /^\+?(\d+(?:\.\d+)?)% Ignite chance for the supported skill$/i) || 0;
    return { perStack, cap, igniteChancePercent };
  }
  if (name === "Cataclysm") {
    return {
      afflictionPerSecond: baseLineNumber(name, /inflicts (\d+(?:\.\d+)?) Affliction on the enemy/i) ?? 0,
      additionalAfflictionEffectPercent: columnValues(name, /^Affliction grants an additional/i, level).values[0]
    };
  }
  if (name === "Control Spell") {
    // "-50% Critical Strike Rating for the supported skill"; "X% additional Hit Damage for the supported skill" (hits only).
    const { values, heading } = columnValues(name, /additional (?:Hit )?Damage for the supported skill$/i, level);
    const criticalStrikeRatingPercent = baseLineNumber(name, /^([+\-−]?\d+(?:\.\d+)?)% Critical Strike Rating for the supported skill$/i) ?? 0;
    return { more: values[0], hitOnly: /additional Hit Damage/i.test(heading), criticalStrikeRatingPercent };
  }
  if (name === "Guard" || name === "Refracted Prism") {
    const { values, heading } = columnValues(name, /additional (?:Hit )?Damage for the supported skill$/i, level);
    return { more: values[0], hitOnly: /additional Hit Damage/i.test(heading) };
  }
  return null;
}
/** Control Spell's "±X% Critical Strike Rating for the supported skill" (0 when the text has none). */
export function controlSpellCriticalRatingPercent() {
  return supportEffect("Control Spell", 20).criticalStrikeRatingPercent;
}
export function additionalIgniteMultiplier(level = 30, stacks = 10) {
  const { perStack, cap } = supportEffect("Additional Ignite", level);
  return 1 + Math.min(Math.max(0, stacks) * perStack, cap) / 100;
}
// The captured baseline's spell crit: 500 rating × (1 + 126% increased + Control Spell's rating line) (5% base chance).
const capturedBaselineCritChance = () => 5 * (1 + (126 + controlSpellCriticalRatingPercent()) / 100);
export function calculateSupportCandidate(supports, baselineSupports, { igniteLimit = 10, additionalStacks = 15, critChance = capturedBaselineCritChance(), critDamage = 150, useEffectiveLevels = false } = {}) {
  const get = (name) => supports.find((s) => !s.custom && s.name === name);
  const active = (name) => get(name)?.enabled !== false && !!get(name);
  const level = (support) => useEffectiveLevels ? Math.min(40, support.effectiveLevel ?? support.level) : support.level;
  // Hit-only lines (Control Spell) scale the spell hits, never Ignite.
  let generalFactor = 1, hitFactor = 1;
  for (const name of modeledSupportNames.filter((n) => n !== "Additional Ignite")) {
    const baseline = baselineSupports.find((s) => s.name === name);
    const baselineEffect = supportEffect(name, baseline.level);
    const factor = (active(name) ? 1 + supportEffect(name, level(get(name))).more / 100 : 1) / (1 + baselineEffect.more / 100);
    hitFactor *= factor;
    if (!baselineEffect.hitOnly) generalFactor *= factor;
  }
  const additional = active("Additional Ignite");
  const additionalFactor = (additional ? additionalIgniteMultiplier(level(get("Additional Ignite")), igniteLimit) : 1) / additionalIgniteMultiplier(30, 10);
  const candidateAdditionalStacks = Math.max(0, additionalStacks - (additional ? 0 : 1));
  const disintegrateEnabled = active("Scorching Beam: Disintegrate (Noble)");
  const disintegrate = get("Scorching Beam: Disintegrate (Noble)");
  const disintegrateRoll = (disintegrate?.roll ?? 26) / 100;
  const disintegrateStarFactor = 1 + (disintegrate?.starAdditionalDamagePercent ?? 20) / 100;
  const disintegrateFactor = (disintegrateEnabled ? (1 + candidateAdditionalStacks * disintegrateRoll) * disintegrateStarFactor : 1) / ((1 + additionalStacks * 0.26) * 1.2);
  // Captured base spell crit chance is 5% (500 rating); Control Spell changes the increased rating by its text's value.
  const criticalChancePercent = Math.min(100, critChance + (active("Control Spell") ? 0 : -5 * controlSpellCriticalRatingPercent() / 100));
  const critFactor = (1 + criticalChancePercent / 100 * (critDamage / 100 - 1)) / (1 + critChance / 100 * (critDamage / 100 - 1));
  return { generalFactor, hitFactor, additionalFactor, disintegrateFactor, candidateAdditionalStacks, criticalChancePercent,
    spellFactor: hitFactor * critFactor * (disintegrateEnabled ? disintegrateStarFactor : 1) / 1.2,
    // The town sheet has no enemy Ignite stacks, but it does count the extra
    // inflicted stack through Disintegrate (Noble). Combat uses both effects.
    townIgniteFactor: generalFactor * disintegrateFactor,
    igniteFactor: generalFactor * additionalFactor * disintegrateFactor };
}
