import { normalizePercentageText } from "./percentage-text.js";
import { ASSUMED_MOVEMENT_METERS_PER_SECOND } from "./dummy-target.js";

// Guard on a channeled skill grants Barrier. User-confirmed 2026-10-10: in the SS21 Selena build the
// Barrier from Guard is permanent, so it is treated as always available (no uptime factor). The planner
// lists it as an automatic condition in dummyRecount.assumptions (planner.js barrierAssumption).
export function guardBarrierSources(setups = []) {
  return setups.filter(setup => setup.enabled !== false && setup.tags?.includes("Channeled") && setup.supports?.some(support => support.name === "Guard" && support.enabled !== false)).map(setup => ({
    source: `Guard support · ${setup.name}`,
    trigger: "Every 5 uses of the supported skill",
    setupKey: setup.setupKey || setup.instanceId || setup.name,
    available: true
  }));
}

// Barrier (reference data Barrier help; game hyperlink 720): "Gains a Shield equal to 20% of the sum of Max Life and Max Energy Shield,
// absorbing 50% of the Hit Damage taken. Cannot gain another Barrier when a Barrier is present."
export const BARRIER_SHIELD_PERCENT = 20;
const stripName = (text) => text.replace(/^\[[^\]]+\]\s*/, "").replace(/^(?:[A-Z][\w' ]+: )+(?=[+-]?\d|Immune)/, (prefix) => /\bbase effect of\b/i.test(prefix) ? prefix : "");
const clean = (line) => stripName(normalizePercentageText(String(line?.text || "")).replace(/\s+/g, " ").trim());

/** "+X% Barrier Shield" / "+X% additional Barrier Shield" lines (game attrs 42200 Barrier Shield Bonus, 42201 Additional Bonus). */
export function barrierShieldBonus(modifierTexts = []) {
  let increased = 0, additional = 1;
  const sources = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const match = clean(line).match(/^([+-]\d+(?:\.\d+)?)% (additional )?Barrier Shield$/i);
    if (!match) continue;
    const value = Number(match[1]) * (Number.isFinite(line.multiplier) ? line.multiplier : 1);
    if (match[2]) additional *= 1 + value / 100; else increased += value;
    sources.push({ source: line.source, text: line.text });
  }
  return { increased, additional, sources };
}

/**
 * The full Barrier Shield: 20% × (Max Life + Max Energy Shield) × (1 + Barrier Shield %) × Π(1 + additional Barrier Shield).
 * Shared by the defence view (src/effective-hp.js) and Barrier Burst's damage (src/planner.js, item-granted Main Skill).
 * @returns {{ shield: number, base: number, bonus: { increased, additional, sources } }}
 */
export function barrierShieldValue({ maxLife = 0, maxEnergyShield = 0, modifierTexts = [], bonus = null } = {}) {
  const shieldBonus = bonus || barrierShieldBonus(modifierTexts);
  const base = BARRIER_SHIELD_PERCENT / 100 * (Math.max(0, Number(maxLife) || 0) + Math.max(0, Number(maxEnergyShield) || 0));
  return { shield: base * Math.max(0, 1 + shieldBonus.increased / 100) * shieldBonus.additional, base, bonus: shieldBonus };
}

/**
 * How often the build gains a Barrier, for Barrier Burst's cast rate (Necklace of Firebird: "When you have a Barrier, triggers the
 * Main Skill upon taking damage, then removes Barrier"; game affix 322245). Provisional (open question barrier-burst-rate): with
 * the being-hit best case each Barrier is spent by the next damage taken, so the casts follow the Barrier gains:
 *   - Guard on a channeled skill: one per 5 uses of that skill (`usesPerSecondFor(setupKey)`, the hit pass's rate);
 *   - "X% chance to gain a Barrier for every N m you move" while moving: X% × the planner's 6 m/s placeholder ÷ N;
 *   - "X% chance to gain a Barrier when taking damage. Interval: N s" while being hit: one per N s (damage taken often enough).
 * "on defeat" needs a kill (not on the dummy); "upon casting a Defensive Skill" is not read.
 * @returns {{ perSecond: number, sources: { source, text, perSecond, active, reason }[] }}
 */
export function barrierGainRate({ modifierTexts = [], guardSources = [], moving = true, hitRecently = true, usesPerSecondFor = () => null } = {}) {
  const sources = [];
  for (const guard of guardSources) {
    const uses = usesPerSecondFor(guard.setupKey);
    const perSecond = Number.isFinite(uses) && uses > 0 ? uses / 5 : 0;
    sources.push({ source: guard.source, text: guard.trigger, perSecond, active: perSecond > 0, reason: perSecond > 0 ? `${Math.round(uses * 1000) / 1000} uses/s ÷ 5` : "the supported skill's use rate is not modeled" });
  }
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const text = clean(line);
    let match = text.match(/^\+?(\d+(?:\.\d+)?)% chance to gain a Barrier for every ([\d.]+) ?m you move$/i);
    if (match) {
      const perSecond = moving ? Math.min(1, Number(match[1]) / 100) * ASSUMED_MOVEMENT_METERS_PER_SECOND / Number(match[2]) : 0;
      sources.push({ source: line.source, text: line.text, perSecond, active: perSecond > 0, reason: moving ? `moving at the planner's ${ASSUMED_MOVEMENT_METERS_PER_SECOND} m/s placeholder (unsourced): ${match[1]}% per ${match[2]} m` : "standing still (Movement group)" });
      continue;
    }
    match = text.match(/^\+?(\d+(?:\.\d+)?)% chance to gain a Barrier when taking damage\. Interval: ([\d.]+) ?s\.?$/i);
    if (match) {
      const perSecond = hitRecently && Number(match[1]) > 0 ? 1 / Number(match[2]) : 0;
      sources.push({ source: line.source, text: line.text, perSecond, active: perSecond > 0, reason: hitRecently ? `taking damage (being-hit best case): one per ${match[2]} s` : "not taking damage ('Hit or blocked recently' is off)" });
    }
  }
  return { perSecond: sources.reduce((sum, item) => sum + item.perSecond, 0), sources };
}
