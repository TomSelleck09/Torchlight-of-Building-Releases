import { normalizePercentageText } from "./percentage-text.js";
import { nativePactspiritNodeEffect } from "./pactspirit-levels.js";
import { combineStatuses, coverageContext, refineCoverage } from "./line-coverage.js";
import { activeKismetSlotKeys, dualKismetCopies, GREAT_LIBRARY, isDualKismet, kismetAffixParts, kismetSlotTexts, microFateEffectScale, parseKismetEffect } from "./kismet-effects.js";
import { parseBlockModifier } from "./block-model.js";

const STAR_TRAIL = /^\+?[\d.]+% for the effects of Micro Fates in the same Pact Branch$/i;
const DUAL_HEADER = /^Activates the following effects when there are \d+ of this Kismet/i;

/**
 * A kismet affix's badge on the pact board (`key`: the kismet's slot). Kismet: Star Trail follows the Micro Fates it boosts in
 * its pact spirit (src/kismet-effects.js microFateEffectScale; whole spirit, user-stated 2026-10-13): In calc when one of them is
 * in the calculation, their neutral status when none changes damage, Inactive when its spirit holds no allocated Micro Fate. Before (pact badge audit 2026-10-13) it read
 * "No DPS effect" whatever it boosted.
 */
export function kismetAffixCoverage(affix, { key = null, planner = coverageContext() } = {}) {
  const text = normalizePercentageText(String(affix ?? "")).replace(/\s+/g, " ").trim();
  // A Dual Kismet with one copy on the pact page adds nothing (src/kismet-effects.js dualKismetCopies; game manual: it activates
  // with 2 copies, once per type). Its effect lines read Inactive; the "Activates the following effects …" line stays Planner only.
  // A kismet (or its node) past the game's pact limits is not counted (src/pact-limits.js; planner.pactLimits).
  if (key && (planner?.pactLimits?.excludedKismets?.includes(key) || planner?.pactLimits?.excludedNodes?.includes(key))) return "Inactive";
  const pacts = planner?.state?.pacts;
  const dualName = pacts?.kismetSlotMode ? pacts.kismetSlots?.[key]?.name : null;
  if (isDualKismet(dualName) && !DUAL_HEADER.test(text) && !dualKismetCopies(pacts).get(dualName)?.active) return "Inactive";
  // Great Library reads as "+X% additional damage" (src/kismet-effects.js GREAT_LIBRARY; provisional count); a joined stat line
  // (Hot Ice) reads as its two halves (kismetAffixParts).
  if (GREAT_LIBRARY.test(text)) return "In calc";
  const parts = kismetAffixParts(text);
  if (parts.length > 1) return combineStatuses(parts.map((part) => kismetAffixCoverage(part, { key, planner })));
  if (STAR_TRAIL.test(text) && planner?.state?.pacts) return starTrailCoverage(key, planner);
  return refineCoverage(parseKismetEffect(affix) || parseBlockModifier(affix) ? "In calc" : "Not modeled", affix, planner);
}

function starTrailCoverage(key, planner) {
  const pacts = planner.state.pacts;
  const spirit = String(key ?? "").replace(/:extra:(?:micro|medium):\d+$/, "").replace(/:\d+$/, "");
  const keys = activeKismetSlotKeys(pacts, spirit);
  if (!keys.includes(key)) return "Inactive";
  const boosted = keys.filter((other) => microFateEffectScale(pacts, other).sources.some((source) => source.key === key));
  if (!boosted.length) return "Inactive";
  return combineStatuses(boosted.flatMap((other) => kismetSlotTexts(pacts, other).map((affix) => kismetAffixCoverage(affix, { key: other, planner }))));
}

// A level effect that joins two stats with "; " ("+7% additional damage; +7% additional Minion Damage": Cloudgatherer - Violet,
// Awooawoo - Violet and every other "Enhanced Attack" outer node; game affix 332988 writes attr 5719 mod 4 twice, the second
// Minion-tagged) is judged clause by clause, the way src/modifier-texts.js and src/engine.js read it. Before (pact badge fix
// 2026-10-13) the joined line was judged whole and read "No DPS effect" although its first clause is in the calculation.
const splitJoinedClauses = (text) => String(text ?? "").replace(/;\s*(?=[+-]?\d)/g, "\n");
// The destiny node "Undetermined Fate Slots" ("+6 * 1% damage +6 * 1% Minion Damage"; game affix 10214: attr 5719 mod 3, the
// second Minion-tagged): src/engine.js calculatePactCandidate adds its +6% damage to the pact totals while the node is allocated
// and no Fate slot is unlocked. It read "No DPS effect" before.
const DESTINY_SLOTS = /^\+\d+ \* \d+(?:\.\d+)?% damage \+\d+ \* \d+(?:\.\d+)?% Minion Damage$/i;

export function pactEffectCoverage(text) {
  if (DESTINY_SLOTS.test(normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim())) return "In calc";
  const clauses = splitJoinedClauses(text);
  return refineCoverage(basePactEffectCoverage(clauses), clauses, undefined, basePactEffectCoverage);
}

function basePactEffectCoverage(text) {
  text = normalizePercentageText(text);
  if (text === "+6% Damage · +6% Minion Damage") return "In calc";
  if (text.startsWith("Undetermined Fate installed")) return "Planner only";
  if (/^\+[\d.]+% additional (?:damage|Reaping Recovery Speed)$/i.test(text)) return "In calc";
  if (/^[+-]?[\d.]+% additional Physical Damage taken when there (?:is|are) only 1 enem(?:y|ies) Nearby$/i.test(text)) return "In calc";
  const parsed = nativePactspiritNodeEffect({ effect: text });
  if (parsed && !["experienceEarnedPercent", "experienceLossPercent"].includes(parsed.stat)) return "In calc";
  return "Not modeled";
}
