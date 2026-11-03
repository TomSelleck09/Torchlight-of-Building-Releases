// User-confirmed level-85 training dummy defenses (2026-09-28).
// Armour affects hits; Ignite damage over time uses no armour reduction.
export const level85DummyDefenses = Object.freeze({
  armourPercent: 50,
  nonPhysicalArmourPercent: 30,
  damageOverTimeArmourPercent: 0,
  fireResistancePercent: 30,
  coldResistancePercent: 30,
  lightningResistancePercent: 30,
  erosionResistancePercent: 30
});

// Armour mitigation of one hit after "+X% Armor DMG Mitigation Penetration" (game affix 492264 → char field 2006247 =
// 0x1e9ce7 `E_hujia_chuantou`; research/penetration-target-trace-2026-10-07.md and tools/bin/reverse-engineering/reports/fire-target-mitigation.txt).
// Sourced (static trace of the hit routine 0x141e12200 and its helpers): the target's armour reduction is scaled by the
// damage type's armour-efficiency field (Physical 100%; non-Physical 60%: reference data Armor page, the dummy's 50% / 30%), capped
// (80%), then the penetration is subtracted in percentage points, and the factor is 1 − remainder / 100. The same layer runs
// for Physical, Fire / Cold / Lightning and Erosion hits; the DoT branch has no armour layer, so penetration does nothing there.
// Provisional: no clamp after the subtraction was seen in the trace, so penetration above the mitigation is not floored at
// 0 here (the same reading as resistance penetration, user-confirmed 2026-10-13 for resistances; open for armour).
export function armourMitigationPercent({ physical = false, armourPercent = level85DummyDefenses.armourPercent, nonPhysicalArmourPercent = level85DummyDefenses.nonPhysicalArmourPercent, penetrationPercent = 0 } = {}) {
  const before = Math.max(0, Math.min(80, Number(physical ? armourPercent : nonPhysicalArmourPercent) || 0));
  const after = before - (Number(penetrationPercent) || 0);
  return { before, after, penetrationPercent, factor: 1 - after / 100 };
}

export function fireHitMitigation({ nonPhysicalArmourPercent = level85DummyDefenses.nonPhysicalArmourPercent, fireResistancePercent = level85DummyDefenses.fireResistancePercent } = {}) {
  const armourFactor = 1 - Math.max(0, Math.min(80, Number(nonPhysicalArmourPercent) || 0)) / 100;
  const resistanceFactor = Math.max(0, 1 - (Number(fireResistancePercent) || 0) / 100);
  return { armourFactor, resistanceFactor, combinedFactor: armourFactor * resistanceFactor };
}

// Scorching Beam's native cycle already carries the 49% packet coefficient, which equals the level-85 dummy's 30%
// non-physical armour × 30% Fire Resistance (0.7 × 0.7): the stripped Iris dummy runs take it once (Lv.20 542 vs 536.8
// modeled; Lv.16 176 vs 182.2). On top of it only the Fire Resistance's change from that 30% applies, as the beam
// delivery and the recount do (src/scorching-beam-delivery.js targetResistanceScale).
export function calibratedBeamTargetFactors({ fireResistancePercent = level85DummyDefenses.fireResistancePercent } = {}) {
  const resistanceFactor = Math.max(0, 1 - (Number(fireResistancePercent) || 0) / 100) / (1 - level85DummyDefenses.fireResistancePercent / 100);
  return { armourFactor: 1, resistanceFactor, combinedFactor: resistanceFactor, calibratedResistancePercent: level85DummyDefenses.fireResistancePercent };
}

export function calibratedBeamTargetCycle(cycle, target = {}) {
  if (!cycle) return null;
  const factors = calibratedBeamTargetFactors(target);
  const window = cycle.fiveSecond;
  return {
    ...factors,
    seconds: window.seconds,
    beamDamage: window.beamDamage * factors.combinedFactor,
    explosionDamage: window.explosionDamage * factors.combinedFactor,
    totalDamage: window.totalDamage * factors.combinedFactor,
    averageDps: window.totalDamage * factors.combinedFactor / window.seconds
  };
}

export function mitigateScorchingBeamCycle(cycle, target = {}) {
  if (!cycle) return null;
  const factors = fireHitMitigation(target);
  const window = cycle.fiveSecond;
  return {
    ...factors,
    seconds: window.seconds,
    beamDamage: window.beamDamage * factors.combinedFactor,
    explosionDamage: window.explosionDamage * factors.combinedFactor,
    totalDamage: window.totalDamage * factors.combinedFactor,
    averageDps: window.totalDamage * factors.combinedFactor / window.seconds
  };
}
