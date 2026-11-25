import { normalizePercentageText } from "./percentage-text.js";
import { wholePercentRoll } from "./whole-percent-roll.js";
import { hitPathMode, hitRecipeReader, doubleDamageFromFacts } from "./recipe-hit-layers.js";

// Double Damage (gear-pact batch chunk 3, Q-G2). Sources:
//   - manual keyword text (config_multi_language_en): "There is a chance to deal Double Damage on hit according to the Double
//     Damage chance. All Double Damage chances that apply to the damage are stacked before the final determination.";
//   - executable trace (research/damage-mask-trace-2026-10-06.md): per hit, the generic chance is added to each damage
//     type's chance, a roll of 1–100 at or below it sets that type's bit, and the typed hit damage is multiplied by exactly 2.
// Game code (2026-10-31; SS13 executable trace 0x141e10cf0, research/tick-engine-investigation-2026-10-30.md D4): the roll is 1-100 at or
// below the whole percent of generic + typed chance, so 12.9% acts as 12% (src/whole-percent-roll.js). Kismet: Giant below is a node 188
// roll, not this routine: its fractions stay (that roll was not traced). `chancePercent` stays the real sum.
// So the expected hit factor is 1 + floor(min(100, Σ chance)) / 100. Hits only: the trace sits on the hit-damage event and the
// manual says "on hit"; whether ailments inherit it is not established, so DoTs and ailments do not read it (provisional).
// Chance above 100% does nothing without a "Quadruple Damage" line: Thea's Farewell Prophecy ("For every 1% overflown Double
// Damage Chance, there is a 1% chance to deal Quadruple Damage instead"; hero trait audit B7) turns the overflow q = min(100%,
// chance − 100%) into Quadruple Damage, so the expected factor is 2 × (1 − q) + 4 × q (provisional; the chance is the time-averaged
// sum, so a God's Boon window's overflow is averaged first).
const N = "(\\d+(?:\\.\\d+)?)";
// Kismet: Giant (census #14, 2026-10-27; game affix 819483072): "+X% chance to deal Triple Damage for Attack Skills when holding a
// Two-Handed Weapon": on casting an Attack skill (trigger 1000069, Attack 6001090), an X% roll (node 188) gives the next action of that
// skill (node 624, bOnlyNextLoopAction) +200% additional on the 57191 damage layer (the record's lowerValue, mod 4), tags Attack + Two-Handed Weapon 5000792: ×3, an additional
// factor apart from Double Damage (the recipe writes a damage layer, not the Double Damage field 2006224): expected ×(1 + 2 × min(100%, Σ chance)) per use. Provisional: the
// whole use, where the record says the next loop action (open question kismet-giant-triple-damage).
const TRIPLE = new RegExp(`^\\+${N}% chance to deal Triple Damage for Attack Skills when holding a Two-Handed Weapon$`, "i");
const QUADRUPLE = /^For every 1% overflown Double Damage Chance, there is a 1% chance to deal Quadruple Damage instead$/i;
const RULES = [
  { pattern: new RegExp(`^\\+${N}% chance to deal Double Damage$`, "i"), tags: [] },
  { pattern: new RegExp(`^\\+${N}% chance for Spells to deal Double Damage$`, "i"), tags: ["Spell"] },
  { pattern: new RegExp(`^(?:Attack Skills: a \\+${N}% chance to deal Double Damage|\\+${N}% chance for Attack Skills to deal Double Damage)$`, "i"), tags: ["Attack"] },
  // "while channeling": a channeled skill holds its channel on the dummy (own buffs pre-built).
  { pattern: new RegExp(`^\\+${N}% chance to deal Double Damage while channeling$`, "i"), tags: ["Channeled"] },
  // Ring-slot wording (residual batch): only from that ring slot (the gear line keeps its slot, src/modifier-texts.js).
  { pattern: new RegExp(`^\\+${N}% chance to deal Double Damage while channeling when equipped in the (left|right) Ring slot$`, "i"), tags: ["Channeled"], ringSlot: true },
  // "+1% chance to deal Double Damage per 10 Strength, up to +30%": stat-sheet Strength, linear (record 101140082: node 114 from
  // attr 11 with no GetFloorInt; MIA sheet check P4, 2026-11-24). The whole-percent roll floors the total chance (D4) only.
  { pattern: new RegExp(`^\\+${N}% chance to deal Double Damage per (\\d+) (Strength|Dexterity|Intelligence), up to \\+${N}%$`, "i"), tags: [], perStat: true },
  // The revived Main Attack Skill family at max stacks (game affix 6038069; src/line-conditions.js mainAttackCastsRecently derives
  // this body): 1 in every N casts of the Main Attack Skill deals guaranteed Double Damage, read as +100% Double Damage chance on that
  // cast (revived affix census 2026-10-21; game row 4, chunk 2 2026-11-01: local l1 counts casts at max stacks, at P3 it arms field
  // 2006224 at +100 for the next action and resets to 0, so the period is N). Main Skill Attacks only, not Sentry or Channeled Skills.
  { pattern: /^Guaranteed Double Damage every (\d+) casts of the Main Attack Skill$/i, tags: ["Attack"], guaranteedEvery: true }
];

/** The Double Damage rule a line follows, or null. */
export function classifyDoubleDamageLine(text) {
  const clean = normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
  for (const rule of RULES) {
    const match = clean.match(rule.pattern);
    if (!match) continue;
    const values = match.slice(1).filter((value) => value !== undefined);
    if (rule.perStat) return { value: Number(values[0]), per: Number(values[1]), stat: values[2].toLowerCase(), cap: Number(values[3]), tags: rule.tags, perStat: true };
    if (rule.ringSlot) return { value: Number(values[0]), tags: rule.tags, slot: `${values[1].toLowerCase()}Ring` };
    if (rule.guaranteedEvery) return { value: 0, every: Number(values[0]), tags: rule.tags, guaranteedEvery: true, mainOnly: true, excludedTags: ["Sentry", "Channeled"] };
    return { value: Number(values[0]), tags: rule.tags };
  }
  return null;
}

/**
 * Σ Double Damage chance that reaches a hit of a skill with `tags`, and the expected factor.
 * @returns {{ chancePercent, factor, sources: object[] }}
 */
export function doubleDamageForSkill(modifierTexts = [], { tags = [], stats = {}, main = false, twoHanded = false } = {}) {
  const tagSet = new Set(tags);
  const sources = [], tripleSources = [];
  let guaranteed = null;
  // Recipe step 3 (research/recipe-interpreter-step1-2026-10-25.md §15): field 2006224 by skill tag where the game recipe places the line;
  // the per-stat, ring-slot and guaranteed-every rules keep the text reader (TLI_HIT_PATH=text restores it everywhere).
  const read = hitPathMode() === "recipe" ? hitRecipeReader(modifierTexts) : null;
  for (const line of modifierTexts) {
    const triple = normalizePercentageText(String(line?.text ?? "")).replace(/\s+/g, " ").trim().match(TRIPLE);
    if (triple) { if (twoHanded && tagSet.has("Attack")) tripleSources.push({ source: line.source, text: line.text, value: Number(triple[1]) * (line.multiplier ?? 1) }); continue; }
    const textRule = classifyDoubleDamageLine(line.text);
    const recipe = read && !(textRule && (textRule.perStat || textRule.slot || textRule.guaranteedEvery)) ? doubleDamageFromFacts(read(line)) : null;
    const rule = recipe ? (recipe.value ? { value: recipe.value, tags: recipe.tags } : null) : textRule;
    if (!rule || !rule.tags.every((tag) => tagSet.has(tag)) || (rule.slot && line.slot !== rule.slot)) continue;
    if (rule.guaranteedEvery) {
      // Main Skill only, never a Sentry or Channeled Skill; one cadence (the shortest when several lines name one).
      if (main && !rule.excludedTags.some((tag) => tagSet.has(tag)) && rule.every >= 1 && (!guaranteed || rule.every < guaranteed.every)) guaranteed = { every: rule.every, source: line.source, text: line.text };
      continue;
    }
    const scale = line.multiplier ?? 1;
    const value = rule.perStat ? Math.min(rule.cap, Math.max(0, Number(stats[rule.stat]) || 0) / rule.per * rule.value) * scale : rule.value * scale;
    if (value) sources.push({ source: line.source, text: line.text, value });
  }
  const chancePercent = sources.reduce((total, line) => total + line.value, 0);
  const quadruple = modifierTexts.some((line) => QUADRUPLE.test(normalizePercentageText(String(line?.text ?? "")).replace(/\s+/g, " ").replace(/(\d) %/g, "$1%").trim()));
  const overflowAt = (chance) => quadruple ? Math.max(0, Math.min(100, chance - 100)) / 100 : 0;
  const factorAt = (chance) => 1 + wholePercentRoll(chance) / 100 + 2 * overflowAt(chance);
  const overflow = overflowAt(chancePercent);
  // A guaranteed cast every N casts: that cast rolls with +100% chance, the others with the plain chance (expected per cast).
  const doubleFactor = guaranteed ? ((guaranteed.every - 1) * factorAt(chancePercent) + factorAt(chancePercent + 100)) / guaranteed.every : factorAt(chancePercent);
  const tripleChancePercent = tripleSources.reduce((total, line) => total + line.value, 0);
  const tripleFactor = 1 + 2 * Math.max(0, Math.min(100, tripleChancePercent)) / 100;
  return { chancePercent, factor: doubleFactor * tripleFactor, doubleFactor, sources, quadrupleChancePercent: overflow * 100, guaranteed, tripleChancePercent, tripleFactor, tripleSources };
}
