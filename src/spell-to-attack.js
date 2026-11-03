import { normalizePercentageText } from "./percentage-text.js";
import { classifyDamageLine } from "./damage-line-classifier.js";

// "Bonus and additional bonus to Spell Damage and also apply to Attack Damage" (Rosa – Unsullied Blade base trait; game affix
// 101070122, label 3000114; hero trait audit B2, 2026-10-19). Read generically: while the build carries the line, every
// Spell-scoped damage line ("+X% Spell Damage", "+X% additional Spell Damage", "… for Spell Skills", conditional bodies once
// resolved, the Aura ledger's Spell lines) also reaches Attack skills, as the same line with "Attack" for "Spell". A damage type
// is kept ("Spell Fire Damage" → "Attack Fire Damage"); lines scoped to Spell and another skill tag, Spell crit, Spell speed,
// ailment and Minion lines are not copied. Client (SS13 read, the same site in SS14; research/hero-rosa-chunk1-2026-11-01.md, open question
// rosa-unsullied-blade-spell-to-attack): label 3000114 adds the Spell tag to an Attack hit for the hit's scale stage only, once, so a skill
// with both tags takes a line once; crit, speed and an Attack's ailments are read outside that stage.

export const SPELL_TO_ATTACK_LINE = /^Bonus and additional bonus to Spell Damage (?:and )?also apply to Attack Damage$/i;
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();

/** { sources: the build's carrying lines, copies: derived Attack lines } from planner.modifierTexts. */
export function spellToAttackLines(modifierTexts = []) {
  const sources = modifierTexts.filter((line) => SPELL_TO_ATTACK_LINE.test(clean(line.text)));
  if (!sources.length) return { sources, copies: [] };
  const copies = [];
  for (const line of modifierTexts) {
    if (line.spellToAttack) continue;
    const text = clean(line.text);
    const parsed = classifyDamageLine(text);
    if (!parsed || parsed.kind !== "damage" || parsed.minion || parsed.ailments || !parsed.skillTags || parsed.skillTags.size !== 1 || !parsed.skillTags.has("Spell")) continue;
    const copy = text.replace(/\bSpell\b/, "Attack");
    const check = classifyDamageLine(copy);
    if (!check || !check.skillTags?.has("Attack")) continue;
    copies.push({ text: copy, source: `${line.source} → Attack Damage (${sources[0].source})`, origin: line.origin, multiplier: line.multiplier ?? 1, derivedFrom: line.text, spellToAttack: true,
      lineEffect: { conditional: false, key: "spellToAttack", conditionText: "Spell Damage bonuses also apply to Attack Damage", provisional: true } });
  }
  return { sources, copies };
}
