// "−X% All Resistance when the enemy has max Affliction" (talent affix 371197).
// Game data: an enemy-side row (node 111, targets 8) writing 5101/5102/5103/5401 (Fire, Cold,
// Lightning and Erosion Resistance) with operation 1 (flat points), gated on the enemy state
// tag 4000900 (max Affliction). It only holds while the dummy's Affliction rating is at 100.
//
// Uptime uses the planner's existing Affliction inputs, not a new simulation:
// - the dummy starts clean (0 Affliction) in the 5 s / 20 s windows and fills at the build's
//   Affliction per second, so max is first reached at t₀ = 100 / (Affliction per second);
// - a full-Affliction Reap that removes Affliction (e.g. Torturer's Touch) drops the rating
//   when it fires. Per Reap cycle the rating refills in fill = removed% / (Affliction per second)
//   and sits at max until the Reap's next trigger, interval = max(recovery, fill) — the same
//   interval calculateReaping uses (theoretical-damage.js). Fraction at max = (interval − fill) / interval.
//   Without such a Reap the rating stays at max once reached (fraction 1).
// - a window of W seconds is at max for max(0, W − t₀) / W of the time, times the cycle fraction.

export function maxAfflictionUptime({ afflictionPerSecond = 0, removers = [] } = {}) {
  if (!(afflictionPerSecond > 0)) return { firstMaxSeconds: Infinity, steadyFraction: 0, limitingRemover: null };
  const firstMaxSeconds = 100 / afflictionPerSecond;
  let steadyFraction = 1, limitingRemover = null;
  for (const remover of removers) {
    const removed = Math.max(0, Math.min(100, remover.afflictionRemovedPercent ?? 100));
    if (!(removed > 0) || !(remover.recoverySeconds >= 0)) continue;
    const fillSeconds = removed / afflictionPerSecond;
    const intervalSeconds = Math.max(remover.recoverySeconds, fillSeconds);
    const fraction = intervalSeconds > 0 ? (intervalSeconds - fillSeconds) / intervalSeconds : 0;
    // The remover that leaves the dummy at max for the least time limits the uptime.
    if (fraction < steadyFraction) { steadyFraction = fraction; limitingRemover = { source: remover.source, fillSeconds, intervalSeconds }; }
  }
  return { firstMaxSeconds, steadyFraction, limitingRemover };
}

// Share of a window (dummy starting clean) spent at max Affliction. seconds = 0 means steady state.
export function windowMaxAfflictionFraction(uptime, seconds) {
  if (!uptime || !(uptime.steadyFraction > 0)) return 0;
  if (!seconds) return uptime.steadyFraction;
  return Math.max(0, seconds - uptime.firstMaxSeconds) / seconds * uptime.steadyFraction;
}

// Target resistance factor after penetration (theoretical-damage.js: max(0, 1 − (resistance − penetration) / 100)).
const resistanceFactor = (resistancePercent, penetrationPercent) => Math.max(0, 1 - (resistancePercent - penetrationPercent) / 100);

// Expected resistance factor when the reduction holds for `fraction` of the time.
export function averagedResistanceFactor({ resistancePercent, penetrationPercent = 0, reductionPercent = 0, fraction = 0 }) {
  return (1 - fraction) * resistanceFactor(resistancePercent, penetrationPercent) + fraction * resistanceFactor(resistancePercent + reductionPercent, penetrationPercent);
}

// Ignite damage scale for a window relative to the steady-state figure the Ignite ledger uses.
export function maxAfflictionWindowScale(info, seconds) {
  if (!info || !info.reductionPercent) return 1;
  const at = (fraction) => averagedResistanceFactor({ resistancePercent: info.resistancePercent, penetrationPercent: info.penetrationPercent, reductionPercent: info.reductionPercent, fraction });
  const steady = at(info.steadyFraction);
  return steady > 0 ? at(windowMaxAfflictionFraction(info, seconds)) / steady : 1;
}

// The damage types "All Resistance" writes (affix 371197: 5101 / 5102 / 5103 / 5401 = Fire, Cold, Lightning and Erosion
// Resistance). Physical has no resistance (Trauma and Physical DoTs take no change).
export const ALL_RESISTANCE_TYPES = new Set(["Fire", "Cold", "Lightning", "Erosion"]);

/**
 * The max-Affliction reduction on a generic DoT (Wilt, a skill's own DoT, a non-beam Ignite; user decision 2026-10-21): the
 * same time-share treatment as the Ignite path. `info` = { reductionPercent, firstMaxSeconds, steadyFraction }. Data only (no
 * functions, so planner results stay comparable):
 * - steadyFactor: the resistance factor the DoT's steady figure uses (time share at max Affliction);
 * - windowScale: { 0, 5, 20 } the clean-dummy window's factor ÷ the steady one (maxAfflictionLayerWindowScale for other lengths);
 * - fullScale: the factor at max Affliction ÷ the steady one (a full-Affliction Reap settles the DoT at that moment);
 * - recount: the dummy recount's ratios (ratioAtNone / ratioAtFull relative to the steady factor).
 * Negative resistance is allowed, as on the Ignite path (theoretical-damage.js clamps only the factor at 0).
 */
export function maxAfflictionResistanceLayer({ resistancePercent = 0, penetrationPercent = 0, info = null } = {}) {
  const plain = resistanceFactor(resistancePercent, penetrationPercent);
  if (!info || !info.reductionPercent || !(info.steadyFraction > 0) || !Number.isFinite(info.firstMaxSeconds)) {
    return { active: false, steadyFactor: plain, windowScale: { 0: 1, 5: 1, 20: 1 }, fullScale: 1, recount: null, steadyFraction: 0 };
  }
  const layer = { active: true, resistancePercent, penetrationPercent, reductionPercent: info.reductionPercent, steadyFraction: info.steadyFraction, firstMaxSeconds: info.firstMaxSeconds };
  const at = (fraction) => averagedResistanceFactor({ resistancePercent, penetrationPercent, reductionPercent: info.reductionPercent, fraction });
  const steady = at(info.steadyFraction);
  return {
    ...layer,
    steadyFactor: steady,
    windowScale: Object.fromEntries([0, 5, 20].map((seconds) => [seconds, maxAfflictionLayerWindowScale(layer, seconds)])),
    fullScale: steady > 0 ? at(1) / steady : 1,
    recount: steady > 0 ? { firstMaxSeconds: info.firstMaxSeconds, steadyFraction: info.steadyFraction, ratioAtNone: at(0) / steady, ratioAtFull: at(1) / steady } : null
  };
}

/** A window of `seconds` (0 = steady) on the clean dummy: its resistance factor ÷ the steady one, for a maxAfflictionResistanceLayer. */
export function maxAfflictionLayerWindowScale(layer, seconds) {
  if (!layer?.active) return 1;
  const at = (fraction) => averagedResistanceFactor({ resistancePercent: layer.resistancePercent, penetrationPercent: layer.penetrationPercent, reductionPercent: layer.reductionPercent, fraction });
  const steady = at(layer.steadyFraction);
  return steady > 0 ? at(windowMaxAfflictionFraction(layer, seconds)) / steady : 1;
}
