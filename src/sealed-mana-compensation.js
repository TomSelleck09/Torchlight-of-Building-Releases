// Sealed Mana Compensation lines the Aura reservations read beside the talent / slate / prism, gear and hero trait totals (2026-11-05;
// research/build-15t-claim-audit-2026-11-05.md §8). Game records:
//   "+X% Sealed Mana Compensation" on a kismet, pact node or hero memory is game affix 101010133 / 973235264 (categories g h k m p s t: the
//     same attr 1304 mod 3 write as the talent and gear copies), so it joins the global pool. Before 2026-11-05 the pool left these out
//     (Micro / Medium Fate: Seal Compensation, Dual Kismet: Three-Eyed Cat's −5%).
//   Dual Kismet: Hatch Out (game affix 916287744): gate 217 Not ("Energy Shield is above 0"), then attr 1304 mod 3 = p1 (+30% Sealed Mana
//     Compensation) and field 2006400 (skill level) = p0 on the Aura tag 6000160 (−5 to Aura Skill Level). The dummy never attacks, so a
//     build with any Max Energy Shield keeps it above 0: the gate holds only at Max Energy Shield 0 (No Loose Ends' "Your Max Energy Shield
//     is fixed at 0", game affix 103360004, or no Energy Shield at all).
// Attribute 1304 (config_attributes "Mana Reservation Efficiency", default 1): "Final Sealed Amount = Base Sealed Amount × (1 + Sealed Mana
// Reduction %) ÷ (1 + Mana Reservation Efficiency %)", read by src/engine.js calculateAuraReservation.
import { normalizePercentageText } from "./percentage-text.js";

const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
export const PLAIN_SEALED_MANA_COMPENSATION = /^([+-]?\d+(?:\.\d+)?) ?% Sealed Mana Compensation$/i;
export const NO_ENERGY_SHIELD_COMPENSATION = /^([+-]\d+) to Aura Skill Level and \+?(\d+(?:\.\d+)?) ?% Sealed Mana Compensation when you have no Energy Shield$/i;
const PAGE_ORIGINS = new Set(["kismet", "pact", "memory"]);

/**
 * Does the build have no Energy Shield (Hatch Out's gate)? The planner's Max Energy Shield pool from the stat lines and the per-attribute
 * conversions (src/effective-hp.js resourcePool: a fixed value of 0 included). Aura-granted Energy Shield (Energy Fortress) is not seen:
 * the Aura ledger reads the Sealed Mana Compensation this gate opens, so it runs before it (provisional; no catalog build has both).
 * @param {{ value: number, fixed?: number }} pool the Max Energy Shield pool
 * @returns {{ none: boolean, maxEnergyShield: number, fixed: number|null }}
 */
export function energyShieldGate(pool) {
  const value = Math.max(0, Number(pool?.value) || 0);
  return { none: value <= 0, maxEnergyShield: value, fixed: Number.isFinite(pool?.fixed) ? pool.fixed : null };
}

/**
 * The kismet, pact and hero memory Sealed Mana Compensation lines (plain, and Hatch Out's when the build has no Energy Shield). A Dual
 * Kismet's effect counts once, as on the stat sheet.
 * @param {object[]} modifierTexts the planner's lines
 * @param {{ noEnergyShield?: boolean|(() => boolean) }} options the gate (a function is called only when a gated line is present)
 * @returns {{ percent: number, sources: object[], gated: object[] }}
 */
export function pageSealedManaCompensation(modifierTexts = [], { noEnergyShield = false } = {}) {
  const sources = [], gated = [], seen = new Set();
  let gate = null;
  const gateHolds = () => (gate ??= Boolean(typeof noEnergyShield === "function" ? noEnergyShield() : noEnergyShield));
  for (const line of modifierTexts) {
    if (!PAGE_ORIGINS.has(line.origin) || line.lineEffect) continue;
    const text = clean(line.text);
    const dual = line.origin === "kismet" && String(line.source).match(/Dual Kismet: (.+)$/)?.[1];
    if (dual) { const key = `${dual}|${text}`; if (seen.has(key)) continue; seen.add(key); }
    const multiplier = Number.isFinite(line.multiplier) ? line.multiplier : 1;
    const plain = text.match(PLAIN_SEALED_MANA_COMPENSATION);
    if (plain) { sources.push({ source: line.source, origin: line.origin, text: line.text, percent: Number(plain[1]) * multiplier }); continue; }
    const hatch = text.match(NO_ENERGY_SHIELD_COMPENSATION);
    if (!hatch) continue;
    const active = gateHolds();
    const entry = { source: line.source, origin: line.origin, text: line.text, percent: active ? Number(hatch[2]) * multiplier : 0, auraLevels: Number(hatch[1]), active, reason: active ? "no Energy Shield" : "the build has Energy Shield (kept full: the dummy never attacks)" };
    gated.push(entry);
    if (active) sources.push(entry);
  }
  return { percent: sources.reduce((sum, item) => sum + item.percent, 0), sources, gated };
}
