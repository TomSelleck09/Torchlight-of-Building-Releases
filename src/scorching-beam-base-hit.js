import { refdataSkillCatalogSs13 } from "./data/catalogs/refdata-ss13.js";
import { scorchingBeamSs13 } from "./data/skills/scorching-beam-ss13.js";
import { selenaScorchingBeamStrippedValidations } from "./data/stats/selena-scorching-beam-stripped-baseline.js";

const skill = refdataSkillCatalogSs13.find((entry) => entry.name === "Scorching Beam");

function parsePacket(label) {
  const effect = skill?.effects?.find((text) => text.startsWith(`${label}: Deals `));
  const match = effect?.match(/Deals\s+(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s+Spell Fire Damage/i);
  return match ? { min: Number(match[1]), max: Number(match[2]) } : null;
}

// The Scorching Beam setup the calibrated beam path reads: the first enabled one, else the first by name. A build can
// keep the captured (disabled) Selena setup beside a custom enabled one (e.g. the no-gear Iris dummy-reference states);
// the first-by-name pick read the captured setup's level and supports there.
export function findScorchingBeamSetup(setups = []) {
  return setups.find((setup) => setup.name === "Scorching Beam" && setup.enabled !== false) || setups.find((setup) => setup.name === "Scorching Beam") || null;
}

// Levels 1–20 read the game rows (config_skill_damage 461 / 462); level 20 and above keep the reference data level-20 packets
// scaled by the post-20 skill-level factor (levelFactor).
const levelRow = (key, level) => {
  const row = scorchingBeamSs13.levelRows?.[key]?.[level];
  return row ? { min: row[0], max: row[1] } : null;
};

export function scorchingBeamBaseHits({ effectiveLevel = 20, levelFactor = 1 } = {}) {
  const beam = parsePacket("Fire Beam");
  const explosion = parsePacket("Fire Explosion");
  if (!beam || !explosion) return null;
  const maxChannelStacks = Number(skill.effects.find((text) => /Maximum \d+ channeled stacks/i.test(text))?.match(/Maximum (\d+)/i)?.[1] || 5);
  const rowLevel = Math.trunc(Number(effectiveLevel));
  if (rowLevel >= 1 && rowLevel < 20 && levelRow("beam", rowLevel) && levelRow("explosion", rowLevel)) {
    return { beam: levelRow("beam", rowLevel), explosion: levelRow("explosion", rowLevel), effectiveLevel, referenceLevel: rowLevel, modeledLevel: true, levelSource: scorchingBeamSs13.levelRows.source, maxChannelStacks };
  }
  const modeledLevel = effectiveLevel >= 20;
  const factor = modeledLevel && Number.isFinite(levelFactor) && levelFactor > 0 ? levelFactor : 1;
  const scale = (range) => ({ min: range.min * factor, max: range.max * factor });
  return {
    beam: scale(beam),
    explosion: scale(explosion),
    effectiveLevel,
    referenceLevel: 20,
    modeledLevel,
    maxChannelStacks
  };
}

// Extra Beams on one target (Scattershot Beam "+2 additional Beams", "+N Beams" lines). Game manual 1001011621: additional
// Beams share the original Beam's origin and spread at an angle. Skill text 16204: the beams fired and the explosions
// caused by the skill can hit the same enemy, Shotgun Effect falloff coefficient 70%. Shotgun Effect (hyperlink 642): the
// first effect hit deals 100%, "Most skills' subsequent on hit damage is 70%", read as every hit after the first at
// ×0.7 (1 + 0.7 × extra), for the beam ticks and for the explosions alike (each Beam explodes at its end). The in-game
// Scattershot run (2026-10-12) shows all three Beams reaching the dummy.
export function scorchingBeamShotgunFactor(beams = 1, coefficientPercent = scorchingBeamSs13.rules.shotgunFalloffCoefficientPercent) {
  const extra = Math.max(0, Math.trunc(Number(beams) || 1) - 1);
  return 1 + extra * (Number(coefficientPercent) || 0) / 100;
}

// The stripped Guard level-20 panel reports 76.44–141.61 Fire Spell Damage.
// Guard adds 25%, so its source range divides by 1.25. The bare Iris panel
// independently has that same 76.44–141.61 range. Both bounds yield 49% of
// the SS13 156–289 tooltip packet. This is an observed town-panel ratio, NOT
// the skill's 70% Shotgun Effect falloff: shotgun only reduces later overlaps.
const guardControl = selenaScorchingBeamStrippedValidations.find((entry) => entry.id === "guard-level-20");
const panelRange = guardControl.damage.fireSpellDamage;
const tooltipBeam = parsePacket("Fire Beam");
export const strippedBeamHitCoefficient = panelRange[0] / tooltipBeam.min;
export const strippedBeamHitCoefficientEvidence = Object.freeze({
  source: guardControl.source,
  observedPanelRange: panelRange,
  tooltipBeam,
  minimumRatio: strippedBeamHitCoefficient,
  maximumRatio: panelRange[1] / tooltipBeam.max,
  status: "observed town-panel ratio; underlying game rule unresolved"
});

// `typedParts` (batch 7 damage fixes 2026-10-28): added flat damage of a type other than Fire (src/scorching-beam-added-damage.js `typed`,
// converted by src/planner.js), each its own hit part on both packets: raw × 41% effectiveness × the 49% packet coefficient × the Shotgun
// sum × that part's own ledger factor (src/scorching-beam-hit.js `typed`) × `targetFactor`, the part's dummy mitigation relative to the
// Fire packets' (the consumers apply the Fire resistance change to the whole cycle; src/planner.js). Its Min / Max factors are its own.
// `explodes` false (Scorching Beam: Immolate (Noble), "No explosions will be generated at max channeled stacks"): the channel is held at full
// stacks, so the cycle has no explosion packet and no explosion rate (bug B5, 2026-11-04; research/selena-trauma-gap-2026-11-04.md §7).
export function scorchingBeamSustainedHits({ effectiveLevel = 20, levelFactor = 1, damageFactor = 1, maxDamageFactor = 1, minDamageFactor = 1, addedFireDamage = { min: 0, max: 0 }, typedParts = [], castsPerSecond = 3.003003, criticalChancePercent = 5, criticalDamagePercent = 150, beams = 1, explodes = true } = {}) {
  const packets = scorchingBeamBaseHits({ effectiveLevel, levelFactor });
  if (!packets) return null;
  const cycleUses = packets.maxChannelStacks;
  // Every Beam hits the target: the beam tick and the explosion packets carry the Shotgun sum (1 with one Beam).
  const beamCount = Math.max(1, Math.trunc(Number(beams) || 1));
  const shotgunFactor = scorchingBeamShotgunFactor(beamCount);
  const packetFactor = strippedBeamHitCoefficient * Math.max(0, damageFactor) * shotgunFactor;
  // Additional Min / Max Damage scale the lower / upper roll of each packet before averaging (2026-10-14 for Min).
  const minOf = (factor) => factor === 1 ? 1 : Math.max(0, factor);
  const typed = (typedParts || []).filter((part) => part && (part.added?.min > 0 || part.added?.max > 0)).map((part) => {
    const factor = strippedBeamHitCoefficient * Math.max(0, part.damageFactor ?? 1) * shotgunFactor * Math.max(0, part.targetFactor ?? 1);
    return { ...part, packetFactor: factor, perPacket: { min: part.added.min * 0.41 * factor * minOf(part.minDamageFactor ?? 1), max: part.added.max * 0.41 * factor * Math.max(0, part.maxDamageFactor ?? 1) } };
  });
  const typedSum = typed.reduce((total, part) => ({ min: total.min + part.perPacket.min, max: total.max + part.perPacket.max }), { min: 0, max: 0 });
  const scale = (range) => ({ min: (range.min + addedFireDamage.min * 0.41) * packetFactor * minOf(minDamageFactor) + typedSum.min, max: (range.max + addedFireDamage.max * 0.41) * packetFactor * Math.max(0, maxDamageFactor) + typedSum.max });
  const beam = scale(packets.beam);
  const explosion = explodes ? scale(packets.explosion) : { min: 0, max: 0 };
  const perUse = {
    min: beam.min + explosion.min / cycleUses,
    max: beam.max + explosion.max / cycleUses
  };
  const criticalFactor = 1 + Math.max(0, Math.min(100, criticalChancePercent)) / 100 * (criticalDamagePercent / 100 - 1);
  const safeRate = Math.max(0, castsPerSecond);
  const averagePerUse = (perUse.min + perUse.max) / 2;
  const windowSeconds = 5;
  const beamUsesInWindow = safeRate * windowSeconds;
  const explosionsInWindow = explodes ? beamUsesInWindow / cycleUses : 0;
  const averageBeamDamage = (beam.min + beam.max) / 2;
  const averageExplosionDamage = (explosion.min + explosion.max) / 2;
  return {
    packets,
    addedFireDamage,
    typedParts: typed,
    maxDamageFactor,
    minDamageFactor,
    beams: beamCount,
    shotgunFactor,
    addedDamageEffectiveness: 0.41,
    beam,
    explosion,
    cycleUses,
    explodes,
    explosionRate: explodes ? safeRate / cycleUses : 0,
    castsPerSecond: safeRate,
    criticalFactor,
    perUse,
    averagePerUse,
    expectedDps: averagePerUse * safeRate * criticalFactor,
    fiveSecond: {
      seconds: windowSeconds,
      beamUses: beamUsesInWindow,
      explosions: explosionsInWindow,
      beamDamage: beamUsesInWindow * averageBeamDamage * criticalFactor,
      explosionDamage: explosionsInWindow * averageExplosionDamage * criticalFactor,
      totalDamage: windowSeconds * averagePerUse * safeRate * criticalFactor
    },
    packetFactor
  };
}
