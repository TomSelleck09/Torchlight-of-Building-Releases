import { normalizePercentageText } from "./percentage-text.js";

// "+X% additional damage on Critical Strike" (tower sequences, slates; residual batch A-2): additional damage that only the
// critical hits get, the build-wide form of the supports' crit-only family (research/support-batch-2026-10-12.md B1). It
// multiplies the crit share of a hit: E = (1 - c) + c × critDamage × Π(1 + X%). Hits only: ailments and DoTs never crit
// (user-confirmed 2026-10-09). A skill-type word ("Projectile", "Spell", "Attack", "Melee") scopes it to skills with that tag.
// Hero trait audit B2 (2026-10-19): Feline Fury's "+20% additional attack damage for Critical Strikes" (game affix 12176885: attr
// 5719 additional on crit hits) is the same rule with the tag word before "damage".
// Census #15 (2026-10-27): Flower Whisperer's "+21% additional Projectile Skill Critical Strike Damage" (its "against Distant enemies"
// condition resolved by src/line-conditions.js key distant; game affix 72482: attr 5719 additional with the Projectile and Critical
// Strike tags) is the same crit-only rule.
const CRIT_ONLY = /^\+(\d+(?:\.\d+)?)% additional (?:damage on (?:(Projectile|Spell|Attack|Melee|Ranged) )?Critical Strikes?|(?:(Projectile|Spell|Attack|Melee|Ranged) )?damage for Critical Strikes|(Projectile|Spell|Attack|Melee|Ranged) Skill Critical Strike Damage)$/i;

/** The rule a line follows ({ value, tag }) or null. */
export function classifyCritOnlyLine(text) {
  const match = normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim().match(CRIT_ONLY);
  const tag = match?.[2] || match?.[3] || match?.[4];
  return match ? { value: Number(match[1]), tag: tag ? tag[0].toUpperCase() + tag.slice(1).toLowerCase() : null } : null;
}

/** Crit-only additional lines that reach a hit of a skill with `tags`: [{ source, text, value }]. */
export function critOnlyLinesFor(modifierTexts = [], tags = []) {
  const tagSet = new Set(tags);
  const out = [];
  for (const line of modifierTexts) {
    const rule = classifyCritOnlyLine(line.text);
    if (!rule || (rule.tag && !tagSet.has(rule.tag))) continue;
    const value = rule.value * (line.multiplier ?? 1);
    if (value) out.push({ source: line.source, text: `${line.text} (crit hits only)`, value });
  }
  return out;
}

// "+X% additional <Type> Damage on Critical Strike" (Nether King Ultimate "+14% additional Cold Damage on Critical Strike", game affix
// 549300288; census #15, 2026-10-27): the same crit-only rule on the crit share of that damage type's part of a hit only
// (src/skill-hit-model.js per component). Hits only, like the untyped form.
const TYPED_CRIT_ONLY = /^\+(\d+(?:\.\d+)?)% additional (Physical|Fire|Cold|Lightning|Erosion) Damage on Critical Strikes?$/i;
const title = (word) => word[0].toUpperCase() + word.slice(1).toLowerCase();

/** The typed rule a line follows ({ value, type }) or null. */
export function classifyTypedCritOnlyLine(text) {
  const match = normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim().match(TYPED_CRIT_ONLY);
  return match ? { value: Number(match[1]), type: title(match[2]) } : null;
}

/** Typed crit-only additional lines: [{ source, text, value, type }] (the hit model keeps those of each component's type). */
export function typedCritOnlyLinesFor(modifierTexts = []) {
  const out = [];
  for (const line of modifierTexts) {
    const rule = classifyTypedCritOnlyLine(line.text);
    const value = rule ? rule.value * (line.multiplier ?? 1) : 0;
    if (value) out.push({ source: line.source, text: `${line.text} (${rule.type} part of crit hits only)`, value, type: rule.type });
  }
  return out;
}
