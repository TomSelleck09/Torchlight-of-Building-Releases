// Inverse Image's Effect Range on a reflected node, clause by clause (chunk 5, 2026-11-01, research/prisms-chunk5-2026-11-01.md).
//
// A node's record writes each value as GetEffectScale[]*X, GetRoundInt[GetEffectScale[]*X] or a plain number, and GetEffectScale[] is the points
// spent × (1 + the reflected Effect Range). At whole points the three agree, so only a reflection can tell them apart: 40 clauses round to a whole
// number ("+1 to All Skills' Levels" at +50% is +2, at +40% +1, at -60% 0), a plain number never scales. The number forms are the slate table's,
// one letter per number in text order (src/data/slates/slate-line-number-forms.generated.js: s scaled, w whole, c constant). A clause the table
// does not list scales every number. A clause with no number (a flag such as "Inflicts Frostbite when dealing Hit Cold Damage") keeps its effect
// at any roll, -100% included: the record has no value for the scale to reach (open question `inverse-image-flags`).
import { slateLineNumberForms } from "./data/slates/slate-line-number-forms.generated.js";
import { slateLineMask } from "./slate-judgment.js";

const NUMBER = /[+\-−]?\d+(?:\.\d+)?/g;
// GetRoundInt: to the nearest whole number, a half up (the same rounding as a Contamination projection, src/slate-judgment.js judgmentWholeValue).
const wholeValue = (value) => Math.sign(value) * Math.floor(Math.abs(value) + 0.5 + 1e-9);

/** A node's text for the readers that take (text, multiplier): whole for a plain node, one entry per clause for a reflected one. */
export function talentNodeClauses(node) {
  if (!node.reflectedFrom) return [{ text: node.description, multiplier: node.rank }];
  return String(node.description ?? "").split(/\n|\s\|\s/).map((part) => part.trim()).filter(Boolean).map((text) => ({ text, multiplier: reflectedClauseScale(text, node.rank, node.inverseEffectMultiplier ?? 1) }));
}

/** The line multiplier of one clause of a reflected node at `rank` points and Effect Range factor `effect` (1 + roll / 100). */
export function reflectedClauseScale(clause, rank, effect) {
  const scale = rank * effect;
  const forms = slateLineNumberForms[slateLineMask(clause)];
  const numbers = [...String(clause).matchAll(NUMBER)].map((match) => Math.abs(Number(match[0])));
  if (!forms || forms.length !== numbers.length) return scale;
  const whole = forms.indexOf("w");
  if (whole >= 0) return numbers[whole] ? wholeValue(numbers[whole] * scale) / numbers[whole] : scale;
  return forms.includes("s") ? scale : rank;
}
