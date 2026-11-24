// Static held conditional stat bodies (indirect-stat remediation F1, 2026-11-22; research/remediation-indirect-stats-2026-11-21.md).
//
// A conditional line whose condition holds from the build alone (a per-stat line, a weapon held: "+1% Armor for every 24 Strength",
// record 101140061; "+1% Evasion per 24 Dexterity", 101140063; "+4% Skill Area per 10 Strength, up to +120%", 6355405; "+1% Skill Area
// per 18 of the lowest stat", 558763; "+4% / +15% Defense when holding a Shield", 599444; "+4% Attack Block Chance when holding a Shield",
// 101010561 / 200000302; Ronin's Tradeoff): node 114 conversions from the stat total (fromMod 5, linear, the Skill Area one capped) and
// node 101 writes behind the held weapon (tag 5000611). The line resolver (src/line-effects.js) holds such a line and its body has no
// damage reader, so before this it reached only the town sheet (src/character-stats.js heldConditionalStatLines), never the combat
// inputs the readers take (stats, combat Armor, Evasion, Skill Area, block). Here they are resolved once, before the planner's stat pools,
// and join them: every reader of the line state's stats, the pre-resolver ones (the Life balance, resource consumption, Evade) included.
//
// Left to their existing paths: Movement Speed bodies (src/character-stats.js conditionalMovementSpeed, after the resolver: Ralph's
// Journey), main-stat bodies (a stat from a stat: chained conversions are not ordered here), and conditions that need the combat state
// (standing still is a Movement-group choice; a "Has <Buff>" holder is read by the combat states).
import { normalizePercentageText } from "./percentage-text.js";
import { splitCondition, resolveLineCondition } from "./line-conditions.js";
import { bodyReaders, handledElsewhere, scaleBody } from "./line-effects.js";
import { parseCharacterStatClause } from "./character-stats.js";

export const STATIC_HELD_KEYS = new Set(["perStat", "perAllStats", "highestStat", "lowestStat", "shield", "dualWielding"]);
const LEFT_OUT = new Set(["movementSpeed", "strength", "dexterity", "intelligence"]);
const BLOCK = { attackBlockChance: "attack", spellBlockChance: "spell" };

/**
 * @param {object[]} modifierTexts planner modifier lines
 * @param {{ stats: { strength, dexterity, intelligence }, weapon: object }} state the condition inputs (the stat sheet's main stats, the weapons)
 * @returns {{ lines: object[], block: { attack: number, spell: number, sources: object[] } }} `lines`: stat lines with their contributions
 *   (characterStatTotals extraLines), `block`: the Block Chance bodies for the combat block
 */
export function staticHeldStatLines(modifierTexts = [], state = {}) {
  const lines = [], block = { attack: 0, spell: 0, sources: [] };
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    const text = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim();
    if (!text || handledElsewhere(text)) continue;
    const split = splitCondition(text);
    if (!split || !STATIC_HELD_KEYS.has(split.condition.key)) continue;
    const resolved = resolveLineCondition(split.condition, state);
    if (resolved.active !== true || resolved.ownSkillOnly) continue;
    const multiplier = Number.isFinite(line.multiplier) ? line.multiplier : 1;
    split.bodies.forEach((body, index) => {
      if (bodyReaders(body).length) return;
      const derivedText = scaleBody(body, resolved.bodyFactors?.[index] !== undefined ? resolved.bodyFactors[index] : resolved.factor, resolved.power, multiplier);
      if (!derivedText) return;
      const contributions = parseCharacterStatClause(derivedText).filter((item) => Number.isFinite(item.value) && item.value && !LEFT_OUT.has(item.stat));
      const stats = contributions.filter((item) => !BLOCK[item.stat]);
      for (const item of contributions.filter((entry) => BLOCK[entry.stat])) {
        block[BLOCK[item.stat]] += item.value;
        block.sources.push({ source: line.source, text: `${derivedText} (${text}: ${resolved.conditionText})`, kind: BLOCK[item.stat], value: item.value });
      }
      if (stats.length) lines.push({ text: derivedText, source: `${line.source} (${text}: ${resolved.conditionText})`, origin: line.origin, multiplier: 1, contributions: stats, heldCondition: split.condition.key, staticHeld: true });
    });
  }
  return { lines, block };
}
