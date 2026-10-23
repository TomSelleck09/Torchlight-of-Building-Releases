import { normalizePercentageText } from "./percentage-text.js";

// Double Damage (gear-pact batch chunk 3, Q-G2). Sources:
//   - manual keyword text (config_multi_language_en): "There is a chance to deal Double Damage on hit according to the Double
//     Damage chance. All Double Damage chances that apply to the damage are stacked before the final determination.";
//   - executable trace (research/damage-mask-trace-2026-10-06.md): per hit, the generic chance is added to each damage
//     type's chance, a roll of 1–100 at or below it sets that type's bit, and the typed hit damage is multiplied by exactly 2.
// So the expected hit factor is 1 + min(100, Σ chance) / 100. Hits only: the trace sits on the hit-damage event and the
// manual says "on hit"; whether ailments inherit it is not established, so DoTs and ailments do not read it (provisional).
// Chance above 100% does nothing without a "Quadruple Damage" line: Thea's Farewell Prophecy ("For every 1% overflown Double
// Damage Chance, there is a 1% chance to deal Quadruple Damage instead"; hero trait audit B7) turns the overflow q = min(100%,
// chance − 100%) into Quadruple Damage, so the expected factor is 2 × (1 − q) + 4 × q (provisional; the chance is the time-averaged
// sum, so a God's Boon window's overflow is averaged first).
const N = "(\\d+(?:\\.\\d+)?)";
const QUADRUPLE = /^For every 1% overflown Double Damage Chance, there is a 1% chance to deal Quadruple Damage instead$/i;
const RULES = [
  { pattern: new RegExp(`^\\+${N}% chance to deal Double Damage$`, "i"), tags: [] },
  { pattern: new RegExp(`^\\+${N}% chance for Spells to deal Double Damage$`, "i"), tags: ["Spell"] },
  { pattern: new RegExp(`^(?:Attack Skills: a \\+${N}% chance to deal Double Damage|\\+${N}% chance for Attack Skills to deal Double Damage)$`, "i"), tags: ["Attack"] },
  // "while channeling": a channeled skill holds its channel on the dummy (own buffs pre-built).
  { pattern: new RegExp(`^\\+${N}% chance to deal Double Damage while channeling$`, "i"), tags: ["Channeled"] },
  // Ring-slot wording (residual batch): only from that ring slot (the gear line keeps its slot, src/modifier-texts.js).
  { pattern: new RegExp(`^\\+${N}% chance to deal Double Damage while channeling when equipped in the (left|right) Ring slot$`, "i"), tags: ["Channeled"], ringSlot: true },
  // "+1% chance to deal Double Damage per 10 Strength, up to +30%": stat-sheet Strength, rounded down (provisional).
  { pattern: new RegExp(`^\\+${N}% chance to deal Double Damage per (\\d+) (Strength|Dexterity|Intelligence), up to \\+${N}%$`, "i"), tags: [], perStat: true },
  // The revived Main Attack Skill family at max stacks (game affix 6038069; src/line-conditions.js mainAttackCastsRecently derives
  // this body): 1 in every N casts of the Main Attack Skill deals guaranteed Double Damage, read as +100% Double Damage chance on that
  // cast (revived affix census 2026-10-21; provisional, open question revived-main-attack-double-damage). Main Skill Attacks only,
  // not Sentry or Channeled Skills.
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
export function doubleDamageForSkill(modifierTexts = [], { tags = [], stats = {}, main = false } = {}) {
  const tagSet = new Set(tags);
  const sources = [];
  let guaranteed = null;
  for (const line of modifierTexts) {
    const rule = classifyDoubleDamageLine(line.text);
    if (!rule || !rule.tags.every((tag) => tagSet.has(tag)) || (rule.slot && line.slot !== rule.slot)) continue;
    if (rule.guaranteedEvery) {
      // Main Skill only, never a Sentry or Channeled Skill; one cadence (the shortest when several lines name one).
      if (main && !rule.excludedTags.some((tag) => tagSet.has(tag)) && rule.every >= 1 && (!guaranteed || rule.every < guaranteed.every)) guaranteed = { every: rule.every, source: line.source, text: line.text };
      continue;
    }
    const scale = line.multiplier ?? 1;
    const value = rule.perStat ? Math.min(rule.cap, Math.floor(Math.max(0, Number(stats[rule.stat]) || 0) / rule.per) * rule.value) * scale : rule.value * scale;
    if (value) sources.push({ source: line.source, text: line.text, value });
  }
  const chancePercent = sources.reduce((total, line) => total + line.value, 0);
  const quadruple = modifierTexts.some((line) => QUADRUPLE.test(normalizePercentageText(String(line?.text ?? "")).replace(/\s+/g, " ").replace(/(\d) %/g, "$1%").trim()));
  const overflowAt = (chance) => quadruple ? Math.max(0, Math.min(100, chance - 100)) / 100 : 0;
  const factorAt = (chance) => 1 + Math.max(0, Math.min(100, chance)) / 100 + 2 * overflowAt(chance);
  const overflow = overflowAt(chancePercent);
  // A guaranteed cast every N casts: that cast rolls with +100% chance, the others with the plain chance (expected per cast).
  const factor = guaranteed ? ((guaranteed.every - 1) * factorAt(chancePercent) + factorAt(chancePercent + 100)) / guaranteed.every : factorAt(chancePercent);
  return { chancePercent, factor, sources, quadrupleChancePercent: overflow * 100, guaranteed };
}
