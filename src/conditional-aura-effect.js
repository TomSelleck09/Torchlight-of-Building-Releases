import { normalizePercentageText } from "./percentage-text.js";
import { splitCondition, resolveLineCondition } from "./line-conditions.js";

// Conditional global Aura Effect lines (gear uniques round 2, src/gear-unique-modules.js): "+35% Aura Effect when there are at
// least 1 enemies Nearby" (Hanging Two-Tone Mask) and "+30% Aura effect when affected by 5 or more Auras" (Lone Walker's Boots).
// The Aura ledger (src/engine.js calculateAuraLedger) runs before the shared line resolver (src/line-effects.js), so these lines
// are resolved here first, with the facts known at that point: the active Aura setups and the Distance group. The resolver later
// reads the same lines for their badges (bodyReaders "aura"), and its derived copy feeds no other Aura reader.
const AURA_BODY = /^([+-]?\d+(?:\.\d+)?)% Aura Effect$/i;
const round4 = (value) => Math.round(value * 10000) / 10000;

/**
 * @param {object[]} modifierTexts planner.modifierTexts
 * @param {{ auraCount: number, nearTarget: boolean, sealedManaCompensationPercent?: number }} state the active Aura types, the
 *   Distance group's choice and the character's (global) Sealed Mana Compensation
 * @returns {{ percent: number, conditionalPercent: number, perSealedManaCompensation: number, lines: object[] }}
 *   percent: the character's summed increased Aura Effect from these lines (the panel's Aura Effect field, attr 21503);
 *   conditionalPercent: its part from state conditions (Auras affecting you, enemies nearby), without the SMC conversion;
 *   perSealedManaCompensation: Aura Effect per 1% Sealed Mana Compensation ("+2% per +3%": 2 / 3), which each Aura applies to
 *   its own Sealed Mana Compensation (src/engine.js calculateAuraLedger).
 */
export function conditionalAuraEffect(modifierTexts = [], state = {}) {
  const lines = [];
  let percent = 0, conditionalPercent = 0, perSealedManaCompensation = 0;
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    const text = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim();
    const split = splitCondition(text);
    if (!split || !split.bodies.length || !split.bodies.every((body) => AURA_BODY.test(body))) continue;
    const resolved = resolveLineCondition(split.condition, state);
    const bodyValue = split.bodies.reduce((sum, body) => sum + Number(body.match(AURA_BODY)[1]), 0) * (line.multiplier ?? 1);
    const value = bodyValue * (resolved.factor ?? 1);
    const active = resolved.active === true && state.auraCount > 0;
    const perSmc = split.condition.key === "perSealedManaCompensation";
    // Game affix 898342 is a linear attribute conversion (node 114, Sealed Mana Compensation → Aura Effect): the rate holds even
    // when the global SMC is 0, since an Aura's own supports (Restrain) give it SMC of its own.
    if (perSmc && state.auraCount > 0) perSealedManaCompensation += bodyValue / split.condition.params.every;
    if (active) { percent += value; if (!perSmc) conditionalPercent += value; }
    lines.push({ text, source: line.source, value, active, key: split.condition.key, conditionText: state.auraCount > 0 ? resolved.conditionText : "no active Aura", provisional: Boolean(resolved.provisional) });
  }
  return { percent: round4(percent), conditionalPercent: round4(conditionalPercent), perSealedManaCompensation, lines };
}
