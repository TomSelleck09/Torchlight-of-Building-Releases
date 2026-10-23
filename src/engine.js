import { normalizePercentageText } from "./percentage-text.js"; import { stripGrantedCore, carryNameReadBracket, withoutSlateCoreName, isInactiveCoreLine, slateCoreName } from "./granted-core-lines.js"; import { averageRotatingBuffs, expandScriptedItemLine } from "./gear-unique-modules.js";
import { matchTalentTextClause } from "./talent-text-effects.js";
import { activeKismetEffects, parseKismetEffect } from "./kismet-effects.js";
import { auraBaseEffects, auraSupportEffects, auraSupportSealedManaCompensation } from "./aura-effects.js";
import { auraScalingSs13, auraStatUsesEffectScale } from "./data/skills/aura-scaling-ss13.js";
import { additionalIgniteMultiplier, supportEffect } from "./support-model.js";
import { nativePactspiritNodeEffect, orderedPactspiritNodes, pactspiritEffectsAtLevel, pactspiritLevel } from "./pactspirit-levels.js";
import { pactspiritTreesSs13 } from "./data/pacts/pactspirit-trees-ss13.js";
import { pactspiritLevelsSs13 } from "./data/pacts/pactspirit-levels-ss13.js";
import { kismetCatalogSs13 } from "./data/pacts/kismet-catalog-ss13.js";
import { isGearBaseStatLine } from "./gear-base-stats.js";
import { splitJoinedLegendaryLines } from "./legendary-joined-lines.js";
import { slateTalentLines } from "./nether-king-authority.js";
const round = (value, places = 2) => Number(value.toFixed(places));

export function calculateActionRate({ baseInterval, increasedPercent = 0, additionalPercent = 0 }) {
  if (!Number.isFinite(baseInterval) || baseInterval <= 0) {
    throw new RangeError("baseInterval must be greater than zero");
  }
  return round((1 / baseInterval) * (1 + increasedPercent / 100) * (1 + additionalPercent / 100));
}

export function calculateManaCost(baseCost, multiplierPercents = []) {
  if (!Number.isFinite(baseCost) || baseCost < 0) throw new RangeError("baseCost cannot be negative");
  return round(multiplierPercents.reduce((total, percent) => total * (percent / 100), baseCost));
}

// https://tlidb.com/en/Skill_Level
// Past Lv.20 Base Damage is frozen and each level adds additional damage (multiplies):
// +10% per level for 21–30 and +8% per level from 31 on. Effective levels above 40
// (base level plus "+N skill level" sources) continue at +8% per level.
export function skillLevelDamageMultiplier(level) {
  if (!Number.isInteger(level) || level < 1) throw new RangeError("skill level must be a whole number of at least 1");
  if (level <= 20) return 1;
  const levels21To30 = Math.min(level, 30) - 20;
  const levels31Plus = Math.max(0, level - 30);
  return 1.1 ** levels21To30 * 1.08 ** levels31Plus;
}

export function isModifierActive(modifier, conditions = {}) {
  return !modifier.condition || conditions[modifier.condition]?.enabled === true;
}

export function modifiersFor(build, stat) {
  return build.modifiers.filter(
    (modifier) => modifier.stat === stat && isModifierActive(modifier, build.conditions)
  );
}

function sumByType(modifiers, type) {
  return modifiers
    .filter((modifier) => modifier.type === type)
    .reduce((total, modifier) => total + modifier.value, 0);
}

function moreMultiplier(modifiers) {
  return modifiers
    .filter((modifier) => modifier.type === "more")
    .reduce((total, modifier) => total * (1 + modifier.value / 100), 1);
}

export function calculateStat(build, stat, intrinsicBase = 0) {
  const modifiers = modifiersFor(build, stat);
  const base = intrinsicBase + sumByType(modifiers, "base") + sumByType(modifiers, "flat");
  const increased = sumByType(modifiers, "increased");
  const multiplier = moreMultiplier(modifiers);
  return round(base * (1 + increased / 100) * multiplier);
}

export function calculateBuild(build) {
  const damageModifiers = modifiersFor(build, "damage");
  const baseAverage = (build.skill.baseDamage.min + build.skill.baseDamage.max) / 2;
  const addedDamage = sumByType(damageModifiers, "flat");
  const increasedDamage = sumByType(damageModifiers, "increased");
  const damageMoreMultiplier = moreMultiplier(damageModifiers);
  const nonCritHit = (baseAverage + addedDamage) * (1 + increasedDamage / 100) * damageMoreMultiplier;

  const attackRate = calculateStat(build, "attackRate", build.skill.baseAttackRate);
  const critChance = Math.min(100, calculateStat(build, "critChance", build.skill.baseCritChance));
  const critMultiplier = calculateStat(build, "critMultiplier", build.skill.baseCritMultiplier);
  const critFactor = 1 + (critChance / 100) * (critMultiplier / 100 - 1);
  const averageHit = nonCritHit * critFactor;
  const dps = averageHit * attackRate;

  return {
    offense: {
      baseAverage: round(baseAverage), addedDamage: round(addedDamage), increasedDamage: round(increasedDamage),
      moreMultiplier: round(damageMoreMultiplier, 4), nonCritHit: round(nonCritHit), critChance: round(critChance),
      critMultiplier: round(critMultiplier), critFactor: round(critFactor, 4), averageHit: round(averageHit),
      attackRate: round(attackRate), dps: round(dps)
    },
    defense: { life: calculateStat(build, "life"), armor: calculateStat(build, "armor") },
    trace: [
      { label: "Average base damage", formula: `(${build.skill.baseDamage.min} + ${build.skill.baseDamage.max}) ÷ 2`, value: baseAverage },
      { label: "After added damage", formula: `${round(baseAverage)} + ${round(addedDamage)}`, value: baseAverage + addedDamage },
      { label: "After increased damage", formula: `× (1 + ${round(increasedDamage)}%)`, value: (baseAverage + addedDamage) * (1 + increasedDamage / 100) },
      { label: "After more multipliers", formula: `× ${round(damageMoreMultiplier, 4)}`, value: nonCritHit },
      { label: "Average hit with crits", formula: `× ${round(critFactor, 4)} crit factor`, value: averageHit },
      { label: "Full DPS", formula: `× ${round(attackRate)} attacks per second`, value: dps }
    ].map((step) => ({ ...step, value: round(step.value) }))
  };
}

export function calculateSelenaTownBaseline(snapshot, noTorturersTouchSnapshot, calibration) {
  const damage = snapshot.damage;
  const mechanics = snapshot.buffsAndMechanics;
  const averageSpellDamage = (damage.totalSpellDamage[0] + damage.totalSpellDamage[1]) / 2;
  const castThroughput = averageSpellDamage * damage.castsPerSecond;
  const critFactor = 1 + (damage.spellCriticalStrikeChancePercent / 100) * (damage.spellCriticalStrikeDamagePercent / 100 - 1);
  const critAdjustedSpellDps = castThroughput * critFactor;
  const beamAverageAtLevel20 = (156 + 289) / 2;
  const explosionAverageAtLevel20 = (467 + 867) / 2;
  const explosionContributionFactor = 1 + (explosionAverageAtLevel20 / beamAverageAtLevel20) * 0.7 / 5;
  const modeledSpellDps = critAdjustedSpellDps * explosionContributionFactor;
  const spellDisplayRoundingFactor = calibration?.spellFactor ?? damage.spellDps / modeledSpellDps;
  const increasedDamageFactor = 1 + damage.damageBonusPercent / 100;
  const additionalDamageFactor = 1 + damage.additionalDamageBonusPercent / 100;
  const additionalFireFactor = 1 + damage.additionalFireDamageBonusPercent / 100;
  const igniteLimit = 1 + 1 + 2 + 1 + 1 + 4;
  const igniteDpsPerStack = mechanics.baseIgniteDamage * increasedDamageFactor * additionalDamageFactor * additionalFireFactor;
  const intrinsicIgniteAfflictionEffectFactor = 1.3;
  const afflictionDamageFactor = 1 + mechanics.afflictionPerSecond * mechanics.igniteDamagePerAfflictionPercent / 100 * intrinsicIgniteAfflictionEffectFactor;
  const characterSheetRoundingFactor = 1;
  const beforeTorturersTouchReap = igniteDpsPerStack * igniteLimit * afflictionDamageFactor * characterSheetRoundingFactor;
  // The captured baseline's Lv30 Additional Ignite, from the support's progression table (per stack and cap).
  const { perStack: additionalIgniteDamagePerActiveStackPercent, cap: additionalIgniteCapPercent } = supportEffect("Additional Ignite", 30);
  const additionalIgniteSupportFactor = additionalIgniteMultiplier(30, igniteLimit);
  const afterAdditionalIgniteSupport = beforeTorturersTouchReap * additionalIgniteSupportFactor;
  const remainingDisplayAndOrderResidual = calibration?.igniteResidual ?? damage.igniteDps / afterAdditionalIgniteSupport;
  const unresolvedAilmentAndSupportFactor = additionalIgniteSupportFactor * remainingDisplayAndOrderResidual;
  const modeledIgniteSubtotal = afterAdditionalIgniteSupport * remainingDisplayAndOrderResidual;
  const r4 = (value) => round(value, 4);
  return {
    mode: calibration ? "prediction" : "calibration",
    calibration: { spellFactor: spellDisplayRoundingFactor, igniteResidual: remainingDisplayAndOrderResidual },
    spell: { targetDps: damage.spellDps, averageSpellDamage: round(averageSpellDamage), castThroughput: round(castThroughput), critFactor: r4(critFactor), critAdjustedDps: round(critAdjustedSpellDps), explosionContributionFactor: r4(explosionContributionFactor), modeledDps: round(modeledSpellDps), displayRoundingFactor: r4(spellDisplayRoundingFactor), calculatedDps: round(modeledSpellDps * spellDisplayRoundingFactor) },
    ignite: { targetDps: damage.igniteDps, baseIgniteDamage: mechanics.baseIgniteDamage, increasedDamageFactor: r4(increasedDamageFactor), additionalDamageFactor: r4(additionalDamageFactor), additionalFireFactor: r4(additionalFireFactor), igniteDpsPerStack: round(igniteDpsPerStack), igniteLimit, intrinsicIgniteAfflictionEffectFactor, afflictionDamageFactor: r4(afflictionDamageFactor), beforeUnresolvedFactor: round(beforeTorturersTouchReap), additionalIgniteDamagePerActiveStackPercent, additionalIgniteSupportFactor: r4(additionalIgniteSupportFactor), additionalIgnitePerStackPercent: additionalIgniteDamagePerActiveStackPercent, additionalIgniteCapPercent, remainingDisplayAndOrderResidual: r4(remainingDisplayAndOrderResidual), unresolvedAilmentAndSupportFactor: r4(unresolvedAilmentAndSupportFactor), modeledSubtotal: round(modeledIgniteSubtotal), calculatedDps: round(modeledIgniteSubtotal) },
    trace: [
      { label: "Displayed spell average", formula: `(${damage.totalSpellDamage[0]} + ${damage.totalSpellDamage[1]}) ÷ 2`, value: averageSpellDamage, confidence: "observed" },
      { label: "Spell cast throughput", formula: `× ${damage.castsPerSecond} casts/s`, value: castThroughput, confidence: "observed" },
      { label: "Expected critical factor", formula: `${damage.spellCriticalStrikeChancePercent}% chance · ${damage.spellCriticalStrikeDamagePercent}% damage`, value: critAdjustedSpellDps, confidence: "modeled" },
      { label: "Max-stack explosion", formula: `3× damage · 70% coefficient · once per 5 uses = ×${r4(explosionContributionFactor)}`, value: modeledSpellDps, confidence: "modeled" },
      { label: "Displayed-range rounding", formula: `× ${r4(spellDisplayRoundingFactor)} from rounded 11.5K–21.3K range`, value: damage.spellDps, confidence: "rounding" },
      { label: "Base Ignite Damage", formula: "captured character stat", value: mechanics.baseIgniteDamage, confidence: "observed" },
      { label: "Ignite damage per stack", formula: `× ${r4(increasedDamageFactor)} × ${r4(additionalDamageFactor)} × ${r4(additionalFireFactor)}`, value: igniteDpsPerStack, confidence: "modeled" },
      { label: "Maximum active Ignites", formula: `base 1 + Starfire 1 + gear 4 + Volcano 4 = ${igniteLimit}`, value: igniteDpsPerStack * igniteLimit, confidence: "modeled" },
      { label: "Affliction-derived Ignite", formula: `1 + ${mechanics.afflictionPerSecond} × ${mechanics.igniteDamagePerAfflictionPercent}% × 1.30 = ×${r4(afflictionDamageFactor)}`, value: igniteDpsPerStack * igniteLimit * afflictionDamageFactor, confidence: "modeled" },
      { label: "Additional Ignite support", formula: `${igniteLimit} active Ignites × ${additionalIgniteDamagePerActiveStackPercent}% (capped at ${additionalIgniteCapPercent}%) = ×${r4(additionalIgniteSupportFactor)}`, value: afterAdditionalIgniteSupport, confidence: "known" },
      { label: "Remaining display/order residual", formula: `× ${r4(remainingDisplayAndOrderResidual)} · rounding and game operation order`, value: modeledIgniteSubtotal, confidence: "calibration" }
    ].map((step) => ({ ...step, value: round(step.value) }))
  };
}

// Freeze correction factors from a reference capture before evaluating another state.
export function predictSelenaTownDamage(snapshot, calibration) {
  if (!calibration || !Number.isFinite(calibration.spellFactor) || !Number.isFinite(calibration.igniteResidual)) throw new TypeError("A fixed reference calibration is required");
  return calculateSelenaTownBaseline(snapshot, undefined, calibration);
}

export function calculateConfiguredCombatDamage(combat, configuration = {}) {
  const sourceDamageMultiplier = configuration.sourceDamageMultiplier ?? 1;
  const baseDps = combat.characterSheet.igniteDps * sourceDamageMultiplier;
  const enabled = (id) => configuration.conditions?.[id] !== false;
  const idyllStacks = Math.max(0, Math.min(15, configuration.idyllStacks ?? 15));
  const tideEffectFactor = configuration.tideEffectFactor ?? 1;
  const afflictionAverage = Math.max(0, Math.min(100, configuration.afflictionAverage ?? 50));
  const afflictionPeak = Math.max(0, Math.min(100, configuration.afflictionPeak ?? 100));
  // The planner passes the build-derived Aim uptime (aim-model.js); 100% is the best case.
  const aimUptimePercent = Math.max(0, Math.min(100, configuration.aimUptimePercent ?? 100));
  const multiply = (entries) => entries.reduce((value, entry) => value * entry.factor, baseDps);
  const allFixed = [
    { id: "tideContact", label: "Tide effect (15% × Tide Effect)", factor: 1 + 15 * tideEffectFactor / 100, confidence: "database" },
    { id: "onTheTide", label: "Sing with the Tide: enemy damage taken at selected level", factor: 1 + (configuration.enemyOnTideDamageTakenPercent ?? 20) / 100, confidence: "database" },
    { id: "waveAria", label: `Wave Aria: damage against enemies on Tide`, factor: 1 + (configuration.waveAriaPercent ?? 16) * tideEffectFactor / 100, confidence: "database" },
    { id: "idyll", label: `Idyll of the Tide at ${idyllStacks} movement stacks`, factor: 1 + idyllStacks * (configuration.idyllPerStackPercent ?? 1.6) * tideEffectFactor / 100, confidence: "conditional" },
    { id: "fireInfiltration", label: "Fire Infiltration", factor: 1.13, confidence: "database" },
    { id: "entangledPain", label: "Entangled Pain (captured effective value)", factor: 1 + (configuration.entangledPainDamagePercent ?? 42.5) / 100, confidence: "captured" },
    { id: "scorch", label: "Scorch (captured effective value)", factor: 1 + (configuration.scorchDamagePercent ?? 45) / 100, confidence: "captured" }
  ];
  const fixed = allFixed.filter((entry) => enabled(entry.id)
    && (entry.id !== "waveAria" || (enabled("tideContact") && enabled("onTheTide")))
    && (entry.id !== "idyll" || enabled("tideContact")));
  const afflictionFactor = (points) => 1 + points * combat.characterSheet.igniteDamagePerAfflictionPercent / 100;
  const aimActiveFactor = 1 + (configuration.aimDamagePercent ?? 38.5) / 100;
  const aimAverageFactor = enabled("aim") ? 1 + (aimActiveFactor - 1) * aimUptimePercent / 100 : 1;
  const sustained = multiply([...fixed, { factor: afflictionFactor(enabled("affliction") ? afflictionAverage : 0) }, { factor: aimAverageFactor }]);
  const peak = multiply([...fixed, { factor: afflictionFactor(enabled("affliction") ? afflictionPeak : 0) }, { factor: enabled("aim") ? aimActiveFactor : 1 }]);
  const trace = [
    { label: "Captured combat-sheet Ignite DPS", factor: 1, value: combat.characterSheet.igniteDps, confidence: "observed" },
    ...(sourceDamageMultiplier === 1 ? [] : [{ id: "candidateSources", label: "Candidate talent and slate sources", factor: round(sourceDamageMultiplier, 6), value: baseDps, confidence: "configured" }]),
    ...fixed.map((entry) => ({ ...entry, value: null })),
    { id: "affliction", label: `Affliction sustained average (${enabled("affliction") ? afflictionAverage : 0})`, factor: afflictionFactor(enabled("affliction") ? afflictionAverage : 0), value: null, confidence: "modeled" },
    { id: "aim", label: `Aim sustained uptime (${enabled("aim") ? aimUptimePercent : 0}%)`, factor: round(aimAverageFactor, 4), value: null, confidence: "configured" }
  ];
  return {
    baseDps,
    sustained: { dps: round(sustained), low: round(sustained), high: round(sustained), afflictionAverage: enabled("affliction") ? afflictionAverage : 0, aimUptimePercent: enabled("aim") ? aimUptimePercent : 0 },
    peak: { dps: round(peak), affliction: enabled("affliction") ? afflictionPeak : 0, aimActive: enabled("aim"), idyllStacks },
    fixedMultiplier: round(fixed.reduce((value, entry) => value * entry.factor, 1), 4),
    trace,
    alreadyIncluded: ["10 active Ignites", "Disintegrate Noble +390%", "four Precise auras", "Blur 100", "Focus Blessing 6", "Tenacity Blessing 7", "five channel stacks in the selected skill model"],
    warning: "Configured estimate is anchored to the captured combat sheet. The recount's 5T ceiling is only a lower bound and cannot calibrate this result."
  };
}

export function compareObservedDamageStates(baseline, candidate) {
  const compare = (baselineValue, candidateValue) => ({
    baseline: baselineValue,
    candidate: candidateValue,
    delta: round(candidateValue - baselineValue),
    percent: round((candidateValue / baselineValue - 1) * 100)
  });
  return {
    spellDps: compare(baseline.damage.spellDps, candidate.damage.spellDps),
    igniteDps: compare(baseline.damage.igniteDps, candidate.damage.igniteDps),
    afflictionPerSecond: compare(baseline.buffsAndMechanics.afflictionPerSecond, candidate.buffsAndMechanics.afflictionPerSecond),
    additionalDamageBonusPercent: compare(baseline.damage.additionalDamageBonusPercent, candidate.damage.additionalDamageBonusPercent),
    additionalFireDamageBonusPercent: compare(baseline.damage.additionalFireDamageBonusPercent, candidate.damage.additionalFireDamageBonusPercent)
  };
}

export function calculateAvailableEnergy(items, disabledSlots = [], nonEquipmentEnergy = 0) {
  const disabled = new Set(disabledSlots);
  const nonEnergySlots = new Set(["necklace", "belt", "leftRing", "rightRing"]);
  const sources = items.filter((item) => !nonEnergySlots.has(item.slot) && Number.isFinite(item.energy)).map((item) => ({ slot: item.slot, name: item.name, value: item.energy, enabled: !disabled.has(item.slot) }));
  const equipmentEnergy = sources.filter((source) => source.enabled).reduce((sum, source) => sum + source.value, 0);
  const maximumEquipmentEnergy = sources.reduce((sum, source) => sum + source.value, 0);
  return { available: equipmentEnergy + nonEquipmentEnergy, equipmentEnergy, nonEquipmentEnergy, capturedMaximum: maximumEquipmentEnergy + nonEquipmentEnergy, sources };
}

export function energyCostForSupportSlots(role, enabledSupportSlots, profile) {
  const costs = role === "aura" ? profile.passiveSlotCosts : profile.activeSlotCosts;
  if (!Number.isInteger(enabledSupportSlots) || enabledSupportSlots < 0 || enabledSupportSlots > costs.length) throw new RangeError("enabledSupportSlots is outside the captured Energy table");
  if (enabledSupportSlots === 0) return 0;
  return costs.slice(0, enabledSupportSlots).reduce((sum, value) => sum + value, 0);
}

export function applyCapturedEnergyCosts(setups, profile) {
  return setups.map((setup, index) => ({ ...setup, enabledSupportSlots: profile.enabledSupportSlotsBySetup[index], energyCost: energyCostForSupportSlots(setup.role, profile.enabledSupportSlotsBySetup[index], profile) }));
}

export function calculateAuraReservation({ baseSealedPercent, installedSupportCount, fixedSupportMultiplierPercent = 100, globalCompensationPercent = 0, localCompensationPercent = 0, additionalCompensationPercents = [], convertedToLife = false }) {
  const supportMultiplier = (fixedSupportMultiplierPercent / 100) ** installedSupportCount;
  const initialAfterSupports = baseSealedPercent * supportMultiplier;
  const totalCompensationPercent = globalCompensationPercent + localCompensationPercent;
  const denominator = 1 + totalCompensationPercent / 100;
  if (denominator <= 0) throw new RangeError("total Sealed Mana Compensation must remain above -100%");
  const additionalCompensationMultiplier = additionalCompensationPercents.reduce((total, percent) => total * (1 + percent / 100), 1);
  if (additionalCompensationMultiplier <= 0) throw new RangeError("additional Sealed Mana Compensation produced a non-positive multiplier");
  const uncappedReservedPercent = initialAfterSupports / denominator / additionalCompensationMultiplier;
  return { resource: convertedToLife ? "life" : "mana", baseSealedPercent, installedSupportCount, fixedSupportMultiplierPercent, supportMultiplier: round(supportMultiplier, 6), initialAfterSupports: round(initialAfterSupports, 4), globalCompensationPercent, localCompensationPercent, totalCompensationPercent, additionalCompensationPercents, additionalCompensationMultiplier: round(additionalCompensationMultiplier, 6), uncappedReservedPercent: round(uncappedReservedPercent, 4), reservedPercent: round(Math.min(99.99, uncappedReservedPercent), 4) };
}

export function energyCostForSupportPositions(role, occupiedSlots, profile) {
  const costs = role === "aura" ? profile.passiveSlotCosts : profile.activeSlotCosts;
  if (!Array.isArray(occupiedSlots) || occupiedSlots.length > costs.length) throw new RangeError("occupiedSlots is outside the captured Energy table");
  return occupiedSlots.reduce((sum, occupied, index) => sum + (occupied ? costs[index] : 0), 0);
}

/**
 * One Aura's own Sealed Mana Compensation, read once and shared by its reservation and its Aura Effect (Lone Walker's per-SMC
 * conversion): the global pool, the Aura's supports' local lines (Restrain, Precise Restrain, Malleable −15, Selfishness −12, ...)
 * and their additional lines (Seal Conversion: the TLIDB progression table at the support's effective level, Lv36 −53.75%), read
 * by src/aura-effects.js auraSupportSealedManaCompensation, plus the "X% additional Deep Pain Sealed Mana Compensation" gear
 * lines on Precise: Deep Pain (game affix 439527584, attr 1304 mod 4). Support Skill Level bonuses raise the leveled lines.
 * ownPercent is the SMC attribute the Aura's scope holds: (global + local) × Π(1 + additional).
 */
export function auraSealedManaCompensation(setup, enabledSupports, options = {}) {
  const support = auraSupportSealedManaCompensation(enabledSupports);
  // Named-Aura lines (src/aura-effects.js namedAuraSealedManaCompensation; gear affix batch D): the Aura family's own tag.
  const named = options.namedCompensation?.[String(setup.name || "").replace(/^Precise: /, "")] || null;
  const additionalPercents = [...support.additionalPercents, ...(setup.name === "Precise: Deep Pain" ? (options.deepPainCompensationPercents ?? [options.deepPainCompensationPercent]).filter(Number.isFinite) : []), ...(named?.additional || []).map((item) => item.percent)];
  const globalPercent = Number(options.globalCompensationPercent) || 0;
  const additionalMultiplier = additionalPercents.reduce((factor, percent) => factor * (1 + percent / 100), 1);
  // "+X% Sealed Mana Compensation for <Tag> Skills" (core audit B7: Knowledgeable's Focus Skills, game affix 787774 attr 1304 mod 3 on
  // the Focus tag 6000290; the Spirit Magus wording): the same SMC attribute, for the Auras that carry the tag (src/planner.js).
  const tagged = (options.taggedCompensation || []).filter((item) => (setup.tags || []).includes(item.tag));
  const taggedPercent = tagged.reduce((sum, item) => sum + item.percent, 0);
  const namedLocal = (named?.local || []).reduce((sum, item) => sum + item.percent, 0);
  const localPercent = support.localPercent + taggedPercent + namedLocal;
  const namedSources = [...(named?.local || []), ...(named?.additional || []).map((item) => ({ ...item, additional: true }))];
  return { globalPercent, localPercent, additionalPercents, additionalMultiplier, ownPercent: (globalPercent + localPercent) * additionalMultiplier, sources: [...support.sources, ...tagged.map((item) => ({ source: item.source, text: item.text, percent: item.percent, tag: item.tag })), ...namedSources], tagged, named: namedSources };
}

export function calculateAuraLedger(setups, options) {
  const entries = setups.filter((setup) => setup.role === "aura").map((setup) => {
    const enabledSupports = setup.supports.filter((support) => support.enabled !== false);
    // Seal Conversion (or Precise: Seal Conversion) moves the Aura's seal from Mana to Life.
    const convertedToLife = enabledSupports.some((support) => support.name === "Seal Conversion" || support.name === "Precise: Seal Conversion");
    // The same per-Aura Sealed Mana Compensation as the Aura Effect below (one reading: auraSealedManaCompensation). Before
    // 2026-10-14 the reservation read only Restrain as local SMC (no Malleable −15, Selfishness −12, ...) and Seal Conversion as
    // −70 + 0.25 × (level − 1) (Lv36 −61.25 against the table's −53.75); research/frost-terra-panel-compare-2026-10-13.md Q7.
    // Sealed = initial ÷ (1 + compensation) (TLIDB Sealed_Mana_Compensation), the additional lines multiplying the whole
    // (1 + global + local) divisor (calculateAuraReservation). That divisor, not 1 + the Aura's SMC attribute, is what the game's
    // sealed Life supports: Selena's Deep Pain (Seal Conversion −62, Deep Pain −20) leaves about 0.04 Life unsealed
    // (UE_game.log "Max HP After Reservation"), and Frost Terra v2's Life is fully sealed (panel Total Life [2] = 0) with Frigid
    // Domain its only Life seal; 1 + the attribute would leave about 60% / 48% of Life unsealed.
    const compensation = auraSealedManaCompensation(setup, enabledSupports, options);
    // Base Sealed Mana per Aura: the catalog entry's sealedManaPercent (merged into the setup by src/planner.js), TLIDB's skill
    // header "Sealed Mana" for each of the 55 Auras (research/tlidb-aura-sealed-mana-2026-10-14.json): 50% for most, 20% for the
    // Focus Auras, the Magus summons and Precise: Rejuvenation, 10% for Swiftness, Rejuvenation and Magical Source (and their
    // Precise forms except Precise: Rejuvenation). Before 2026-10-14 only the two Flame Focus entries carried it and every
    // other Aura fell back to options.baseSealedPercent (50); Precise: Swiftness read 50 against the in-game tooltip's 10.
    const baseSealedPercent = setup.sealedManaPercent ?? options.baseSealedPercent;
    const ownReservation = calculateAuraReservation({ baseSealedPercent, installedSupportCount: enabledSupports.length, fixedSupportMultiplierPercent: options.fixedSupportMultiplierPercent, globalCompensationPercent: compensation.globalPercent, localCompensationPercent: compensation.localPercent, additionalCompensationPercents: compensation.additionalPercents, convertedToLife });
    // An item-granted Aura (src/planner.js, Lone Walker's Boots) seals no Mana or Life (user-confirmed 2026-10-13).
    const reservation = setup.granted ? { ...ownReservation, granted: true, uncappedReservedPercent: 0, reservedPercent: 0 } : ownReservation;
    const baseEffects = auraBaseEffects(setup);
    if (setup.name === "Flame Focus" && !Number.isFinite(baseEffects.igniteChancePercent)) baseEffects.igniteChancePercent = 10;
    if (setup.name === "Precise: Flame Focus" && !Number.isFinite(baseEffects.igniteChancePercent)) baseEffects.igniteChancePercent = 15;
    // "<Aura> gains an additional effect: <modifiers>" (Pantheon's Elegy; src/aura-gained-effects.js): part of the Aura's buff,
    // scaled by its Aura Effect like the base values below (provisional). Clauses with an Aura stat key join baseEffects here; the
    // other clauses become derived lines in the planner (auraGainedEffectLines) scaled by the same factor.
    const gainedEffects = options.auraGainedEffects?.[setup.name] || null;
    if (gainedEffects) for (const key of ["castSpeedPercent", "attackSpeedPercent"]) if (gainedEffects[key]) baseEffects[key] = (baseEffects[key] || 0) + gainedEffects[key];
    if (gainedEffects?.stats) for (const [key, value] of Object.entries(gainedEffects.stats)) baseEffects[key] = (baseEffects[key] || 0) + value;
    const auraAmplification = setup.supports.find((support) => support.name === "Aura Amplification" && support.enabled !== false);
    const auraAmplificationPercent = auraAmplification ? 5 + 0.25 * Math.min(40, auraAmplification.effectiveLevel ?? auraAmplification.level) : 0;
    // "+X% Deep Pain Aura" gear lines (game affix 530992: attr 3401 Aura Effect, mod 3, tags Aura 5100305 + Deep Pain 5100412)
    // reach the Deep Pain family: Precise: Deep Pain (in-game panel 2026-09-08) and the plain Deep Pain.
    const deepPainAuraEffectPercent = /^(?:Precise: )?Deep Pain$/.test(setup.name) ? Number(options.deepPainAuraEffectPercent) || 0 : 0;
    // "+X% <this aura> Aura (Effect)" lines (planner: namedAuraEffectPercents), e.g. Decaying Blessing's Erosion Amplification or a
    // Belt corrosion's "+25% Spell Amplification Aura". The game tags each with the Aura and the aura family (Cruelty 5100419, …),
    // which the Precise: version shares, as Deep Pain's does: the line raises both.
    const familyName = setup.name.replace(/^Precise: /, "");
    const namedAuraEffectPercent = (Number(options.namedAuraEffectPercents?.[setup.name]) || 0) + (familyName !== setup.name ? Number(options.namedAuraEffectPercents?.[familyName]) || 0 : 0);
    // Deep Pain receives the global Aura Effect pool like every other aura (user,
    // 2026-10-09; the panel's Affliction per second 735.575 = 725.375 + 30 × 0.34
    // on tests/fixtures/selena-dummy-54s-build.txt). An earlier rule dropped it.
    const globalAuraEffectPercent = options.globalAuraEffectPercent;
    const town = options.context === "town";
    const supportEffects = auraSupportEffects(enabledSupports, { auraCount: setups.filter(item => auraScalingSs13[item.name]).length, nearbyElite: options.nearbyElite, affectedAllies: options.affectedAllies, context: town ? "town" : "dummy" });
    // "+2% Aura Effect per +3% Sealed Mana Compensation" (Lone Walker's Boots, game affix 898342: a linear conversion of the
    // Sealed Mana Compensation attribute) reads each Aura's own SMC: the global pool plus its supports' local lines, times their
    // additional ones, (global + local) × Π(1 + additional). The in-game panel (UE_game.log 2026-10-13, Frost Terra v2) reads
    // Precise: Deep Pain at 8 (no supports; exact), Precise: Swiftness at 8 + Restrain 18 − Malleable 15 = 11 (exact) and
    // Precise: Frigid Domain at (8 − 15) × (1 − 53.75%) = −3.2375 (Seal Conversion Lv36; 2e-5). The global pool's conversion is
    // already inside globalAuraEffectPercent (the panel's Aura Effect field), so each Aura swaps it for its own.
    const perSmc = Number(options.auraEffectPerSealedManaCompensation) || 0;
    const globalCompensation = compensation.globalPercent;
    const ownCompensationPercent = compensation.ownPercent;
    const sealedManaCompensation = { globalPercent: globalCompensation, localPercent: compensation.localPercent, additionalPercents: compensation.additionalPercents, ownPercent: round(ownCompensationPercent, 6), auraEffectPerPercent: perSmc, auraEffectPercent: round(perSmc * ownCompensationPercent, 6), globalAuraEffectPercent: round(perSmc * globalCompensation, 6), sources: compensation.sources, named: compensation.named || [] };
    // The town context (the in-game panel: no target, no Elite): conditional Aura Effect does not reach the Aura's own values.
    // Observed: Lone Walker's "+30% Aura effect when affected by 4 or more Auras" is in the panel's Aura Effect field (130.98333)
    // but in none of Deep Pain, Swiftness or Frigid Domain; Malleable is in neither branch (auraSupportEffects). The dummy
    // context keeps the texts: the +30% with 4 or more Auras and Malleable's Elite branch (the dummy is a Boss within 10 m).
    const excludedConditionalPercent = town ? Number(options.conditionalAuraEffectPercent) || 0 : 0;
    const auraEffectPercent = globalAuraEffectPercent - perSmc * globalCompensation + perSmc * ownCompensationPercent - excludedConditionalPercent + supportEffects.increased + deepPainAuraEffectPercent + namedAuraEffectPercent;
    const effectiveEffects = Object.fromEntries(Object.entries(baseEffects).map(([key, value]) =>
      [key, auraStatUsesEffectScale(setup.name, key)
        ? round(value * (1 + auraEffectPercent / 100) * supportEffects.additionalFactor, 4)
        : value]));
    return { name: setup.name, context: town ? "town" : "dummy", effectiveLevel: setup.effectiveLevel ?? setup.baseLevel ?? 20, reservation, supportEffectSources: supportEffects.sources, unsupportedSupportEffects: supportEffects.unsupported, excludedSupportEffects: supportEffects.excluded, excludedConditionalAuraEffectPercent: excludedConditionalPercent, sealedManaCompensation, additionalAuraEffectFactor: supportEffects.additionalFactor, auraEffectPercent, globalAuraEffectPercent, deepPainAuraEffectPercent, namedAuraEffectPercent, auraAmplificationPercent, baseEffects, effectiveEffects, gainedEffects };
  });
  const manaReservedPercent = round(entries.filter((entry) => entry.reservation.resource === "mana").reduce((sum, entry) => sum + entry.reservation.reservedPercent, 0), 4);
  const lifeReservedPercent = round(entries.filter((entry) => entry.reservation.resource === "life").reduce((sum, entry) => sum + entry.reservation.reservedPercent, 0), 4);
  const manaDemandPercent = round(entries.filter((entry) => entry.reservation.resource === "mana").reduce((sum, entry) => sum + entry.reservation.uncappedReservedPercent, 0), 4);
  const lifeDemandPercent = round(entries.filter((entry) => entry.reservation.resource === "life").reduce((sum, entry) => sum + entry.reservation.uncappedReservedPercent, 0), 4);
  return { entries, manaReservedPercent, manaDemandPercent, manaRemainingPercent: round(100 - manaReservedPercent, 4), lifeReservedPercent, lifeDemandPercent, lifeRemainingPercent: round(100 - lifeReservedPercent, 4) };
}

/**
 * The build's Energy against its setups' costs; `allocations` keeps the setups' order (entry.index = the setup's index).
 * Resource limits never stop anything in the calculation (user decision 2026-10-21): every enabled setup is `counted` (the
 * planner's activeNames read it), and Energy only drives the warnings. The fit walk in list order, `priorityIndex` (the planner's
 * Main Skill: src/planner.js energyPriorityIndex) first, marks a setup the budget left at its turn cannot pay
 * `insufficient-energy` with `overBudget` and its `shortfall` (a warning: still counted); a setup whose cost is unknown is
 * `uncaptured` (counted too). knownAllocated is every counted setup's known cost (it can exceed the budget), remaining what the
 * budget keeps after all of them (0 when over) and shortfall the total over the budget. Before 2026-10-21 a setup past the
 * budget was switched off (the Main Skill alone was kept on from 2026-10-15).
 */
export function allocateSkillEnergy(setups, availableEnergy, { priorityIndex = null } = {}) {
  let left = availableEnergy;
  let demand = 0;
  let hasUnknownCosts = false;
  const priority = Number.isInteger(priorityIndex) && priorityIndex >= 0 && priorityIndex < setups.length ? priorityIndex : null;
  const allocate = (setup, index) => {
    const entry = { index, name: setup.name, role: setup.role, ...(index === priority ? { priority: true } : {}) };
    if (setup.enabled === false) return { ...entry, cost: 0, status: "disabled", counted: false };
    if (!Number.isFinite(setup.energyCost)) { hasUnknownCosts = true; return { ...entry, cost: null, status: "uncaptured", counted: true }; }
    demand += setup.energyCost;
    if (setup.energyCost <= left) { left -= setup.energyCost; return { ...entry, cost: setup.energyCost, status: "active", counted: true }; }
    const short = setup.energyCost - left;
    if (index === priority) left = 0;
    return { ...entry, cost: setup.energyCost, status: "insufficient-energy", counted: true, overBudget: true, shortfall: short };
  };
  const allocations = new Array(setups.length);
  if (priority !== null) allocations[priority] = allocate(setups[priority], priority);
  setups.forEach((setup, index) => { if (index !== priority) allocations[index] = allocate(setup, index); });
  return { availableEnergy, knownAllocated: demand, remaining: Math.max(0, availableEnergy - demand), shortfall: Math.max(0, demand - availableEnergy), priorityIndex: priority, hasUnknownCosts, allocations };
}

const modifierPatterns = [
  ["weaponCriticalStrikeRating", "base", /^(\d+(?:\.\d+)?) Critical Strike Rating$/i],
  ["weaponAttackSpeed", "base", /^(\d+(?:\.\d+)?) Attack Speed$/i],
  ["gearEvasion", "flat", /^\+([\d.]+) Gear Evasion$/i],
  ["gearEnergyShield", "flat", /^\+([\d.]+) Gear Energy Shield$/i],
  ["injuryBufferPercent", "increased", /^\+([\d.]+)% Injury Buffer$/i],
  ["elementalAilmentAvoidancePercent", "increased", /^\+([\d.]+)% chance to avoid Elemental Ailments$/i],
  ["dexterity", "flat", /^\+([\d.]+) Dexterity$/i],
  ["afflictionPerSecondPerAfflictionEffectPercent", "ratio", /^([+-]\d+(?:\.\d+)?) Affliction per Second for every \+(\d+(?:\.\d+)?)% Affliction Effect$/i],
  ["intelligence", "flat", /^\+(\d+(?:\.\d+)?) Intelligence$/i], ["intelligence", "flat", /^\+(\d+(?:\.\d+)?) to All Stats$/i], // All Stats includes Intelligence (gear-pact batch G7)
  ["spellCriticalStrikeRating", "flat", /^\+(\d+(?:\.\d+)?) (?:Spell |Attack and Spell )?Critical Strike Rating$/i],
  ["spellCriticalStrikeRatingPercent", "increased", /^([+-]\d+(?:\.\d+)?)% (?:Spell |Attack and Spell )?Critical Strike Rating$/i],
  ["criticalStrikeDamagePercent", "increased", /^([+-]\d+(?:\.\d+)?)% Critical Strike Damage$/i],
  ["castSpeedPercent", "increased", /^([+-]\d+(?:\.\d+)?)% (?:Attack and )?Cast Speed$/i],
  ["castSpeedPercent", "more", /^([+-]\d+(?:\.\d+)?)% additional (?:Attack and )?Cast Speed$/i],
  ["auraEffectPercent", "increased", /^\+(\d+(?:\.\d+)?)% Aura Effect$/i],
  ["deepPainAuraEffectPercent", "increased", /^\+(\d+(?:\.\d+)?)% Deep Pain Aura(?: Effect)?$/i],
  // Game affix 439527584: attr 1304 (Sealed Mana Compensation) mod 4 (additional) tagged Deep Pain (6101412).
  ["deepPainSealedManaCompensationPercent", "more", /^([+-]\d+(?:\.\d+)?)% additional Deep Pain Sealed Mana Compensation$/i],
  ["sealedManaCompensationPercent", "increased", /^([+-]\d+(?:\.\d+)?)% Sealed Mana Compensation$/i],
  ["gearArmor", "flat", /^\+([\d.]+) Gear Armou?r$/i],
  ["igniteLimit", "flat", /^\+(\d+) Ignite limit$/i],
  ["igniteDurationPercent", "increased", /^([+-]\d+(?:\.\d+)?)\s*% Ignite Duration$/i],
  ["ailmentDurationPercent", "increased", /^([+-]\d+(?:\.\d+)?)\s*% Ailment Duration$/i],
  ["igniteChancePercent", "increased", /^\+(\d+(?:\.\d+)?)\s*% chance to Ignite targets$/i],
  ["damagingAilmentChancePercent", "increased", /^\+(\d+(?:\.\d+)?)\s*% chance to inflict Damaging Ailments$/i],
  ["ailmentChancePercent", "increased", /^\+(\d+(?:\.\d+)?)\s*% chance to inflict Ailments$/i],
  ["afflictionPerSecond", "flat", /^\+(\d+) Affliction (?:inflicted )?per second$/i],
  ["reapingDurationPercent", "increased", /^\+(\d+(?:\.\d+)?)% Reaping Duration$/i],
  ["reapingRecoverySpeedPercent", "increased", /^\+(\d+(?:\.\d+)?)% Reaping Recovery Speed$/i],
  ["fireSkillLevel", "flat", /^\+(\d+) Fire Skill Level$/i],
  ["spellSkillLevel", "flat", /^\+(\d+) Spell Skill Level$/i],
  ["damageOverTimePercent", "increased", /^\+(\d+(?:\.\d+)?)\s*% Damage Over Time$/i],
  ["additionalFireDamagePercent", "more", /^([+-]\d+(?:\.\d+)?)\s*%\s+additional Fire Damage$/i],
  ["elementalDamagePercent", "increased", /^\+(\d+(?:\.\d+)?)% Elemental Damage$/i],
  ["ailmentDamageEnhancementPercent", "increased", /^\+(\d+(?:\.\d+)?)% Ailment Damage Enhancement$/i],
  ["afflictionEffectPercent", "increased", /^\+(\d+(?:\.\d+)?)% Affliction Effect$/i],
  ["blurEffectPercent", "increased", /^\+(\d+(?:\.\d+)?)% Blur Effect$/i]
  ,["damagePercent", "increased", /^\+(\d+(?:\.\d+)?)% damage$/i]
  ,["additionalIgniteDamagePercent", "more", /^\+(\d+(?:\.\d+)?)% additional Ignite Damage$/i]
  ,["baseIgniteDamage", "flat", /^Adds\s+(\d+(?:\.\d+)?)\s*[–-]\s*\d+(?:\.\d+)?\s+Base (?:Ignite|Ailment) Damage$/i]
  ,["additionalIgniteStacks", "flat", /^Inflicts (\d+) additional stack(?:\(s\)|s)? of Ignite$/i]
  ,["maxEnergyShield", "flat", /^\+(\d+(?:\.\d+)?) Max Energy Shield$/i]
  ,["elementalResistancePercent", "increased", /^\+(\d+(?:\.\d+)?)% Elemental Resistance$/i]
  ,["coldResistancePercent", "increased", /^\+([\d.]+)% Cold Resistance$/i]
  ,["fireResistancePercent", "increased", /^\+(\d+(?:\.\d+)?)% Fire Resistance$/i]
  ,["lightningResistancePercent", "increased", /^\+(\d+(?:\.\d+)?)% Lightning Resistance$/i]
  ,["erosionResistancePercent", "increased", /^\+(\d+(?:\.\d+)?)% Erosion Resistance$/i]
];

// Two stats in one line as two sentences ("+74% Gear Attack Speed. -10% additional Attack Damage", "+90% additional Attack Damage
// after standing still for 0.1s. -20% additional Attack Speed", "+18% Max Mana. +140 Skill Cost": T0+ craft affixes; gear affix
// audit 2026-10-22). The readers get each sentence as its own line, without its full stop, from the joined-clause split
// (src/gear-unique-modules.js splitJoinedClauses; before, it kept "+74% Gear Attack Speed." with its stop, which no reader
// matched, so only the penalty was read). This helper gives the same sentences to the gear badge (src/calculation-coverage.js).
// A split happens only where every sentence starts with a signed number ("Lv. 20", "Interval: 1 s" and "0.3s" never split).
const STAT_SENTENCE_BREAK = /\.\s+(?=[+-]\d)/;
export function splitStatSentences(line) {
  const parts = String(line).split(STAT_SENTENCE_BREAK).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 && parts.every((part) => /^[+-]\d/.test(part)) ? parts : [line];
}

export function effectiveGearModifierTexts(item) {
  const modifiers=[...(item.modifiers||[])];
  if((item.corrosionModifiers||[]).length) for(const implicit of item.implicitModifiers||[]){ if(isGearBaseStatLine(implicit))continue; const index=modifiers.indexOf(implicit); if(index>=0)modifiers.splice(index,1); }
  const lines=[...modifiers,...(item.corrosionModifiers||[])].flatMap((text) => carryNameReadBracket(averageRotatingBuffs(splitJoinedLegendaryLines(text)).split(/\r?\n/).map((line) => line.trim()).filter(Boolean))).flatMap((line) => expandScriptedItemLine(item.name, line));
  // A duplicate copy of a core talent (another source already grants it; src/granted-core-lines.js resolveCoreCopies, user rule
  // 2026-10-21: cores never stack) reaches no reader.
  return item.inactiveCoreLines?.length ? lines.filter((line) => !isInactiveCoreLine(item, line)) : lines; // two-line rows of scripted uniques (gear-pact batch chunk 4)
}

export function collectNormalizedGearModifiers(items, disabledSlots = []) {
  const disabled = new Set(disabledSlots);
  return items.flatMap((item) => effectiveGearModifierTexts(item).flatMap((text) => {
    const normalizedText = stripGrantedCore(normalizePercentageText(text).replace(/\s+/g, " ").trim()); // "[Core] body" reads as its body (gear-pact batch G2)
    const combinedResources = normalizedText.match(/^\+([\d.]+)% Max Life and Max Energy Shield$/i);
    if (combinedResources) return ["maxLifePercent", "maxEnergyShieldPercent"].map(stat => ({ source: item.name, slot: item.slot, text, stat, type: "increased", value: Number(combinedResources[1]), enabled: !disabled.has(item.slot), confidence: "documented" }));
    const combinedDefense = normalizedText.match(/^\+([\d.]+) Gear Evasion\s+\+([\d.]+) Gear Energy Shield$/i);
    if (combinedDefense) return ["gearEvasion", "gearEnergyShield"].map((stat, index) => ({ source: item.name, slot: item.slot, text, stat, type: "flat", value: Number(combinedDefense[index + 1]), enabled: !disabled.has(item.slot), confidence: "documented" }));
    if (/^Immune to Frostbite$/i.test(text)) return [{ source: item.name, slot: item.slot, text, stat: "frostbiteImmunity", type: "flag", value: 1, enabled: !disabled.has(item.slot), confidence: "documented" }];
    for (const [stat, type, pattern] of modifierPatterns) {
      const match = normalizedText.match(pattern);
      if (match) return [{ source: item.name, slot: item.slot, text, stat, type, value: type === "ratio" ? Number(match[1]) / Number(match[2]) : Number(match[1]), enabled: !disabled.has(item.slot), confidence: "captured" }];
    }
    return [];
  }));
}

export function aggregateNormalizedModifiers(modifiers) {
  return modifiers.filter((modifier) => modifier.enabled && modifier.type !== "base").reduce((totals, modifier) => {
    const key = `${modifier.stat}:${modifier.type}`;
    totals[key] = (totals[key] || 0) + modifier.value;
    return totals;
  }, {});
}

export function applyEquipmentOverrides(items, overrides = {}) {
  return items.map((item) => {
    const override = overrides[item.slot];
    if (!override) return structuredClone(item);
    // Inventory equipment replaces the old item. Hand-entered overrides remain
    // partial patches for older saved builds and the calculation controls.
    if (!override.sourceInventoryId) return { ...structuredClone(item), ...override, slot:item.slot,
      defenses:{ ...(item.defenses || {}), ...(override.defenses || {}) },
      modifiers:Array.isArray(override.modifiers) ? [...override.modifiers] : item.modifiers,
      corrosionModifiers:Array.isArray(override.corrosionModifiers) ? [...override.corrosionModifiers] : [] };
    return { ...structuredClone(override), slot: item.slot, base: override.base ?? item.base,
      level: override.level ?? item.level, icon: override.icon ?? item.icon,
      energy: override.energy ?? 0, defenses: structuredClone(override.defenses || {}),
      modifiers: Array.isArray(override.modifiers) ? [...override.modifiers] : [],
      corrosionModifiers: Array.isArray(override.corrosionModifiers) ? [...override.corrosionModifiers] : [] };
  });
}

// `inactiveCoreLines` (optional): Map item slot → Set of lines that are duplicate core copies (src/granted-core-lines.js
// resolveCoreCopies); the candidate items carry them, so effectiveGearModifierTexts drops them for every reader.
export function calculateEquipmentCandidate(baselineItems, overrides, snapshot, disabledSlots = [], inactiveCoreLines = null) {
  const allItems = applyEquipmentOverrides(baselineItems, overrides).map((item) => inactiveCoreLines?.get(item.slot)?.size ? { ...item, inactiveCoreLines: [...inactiveCoreLines.get(item.slot)] } : item);
  const candidateItems = allItems.filter((item) => !disabledSlots.includes(item.slot));
  const baselineModifiers = collectNormalizedGearModifiers(baselineItems);
  const candidateModifiers = collectNormalizedGearModifiers(candidateItems);
  const baseline = aggregateNormalizedModifiers(baselineModifiers);
  const candidate = aggregateNormalizedModifiers(candidateModifiers);
  const keys = [...new Set([...Object.keys(baseline), ...Object.keys(candidate)])];
  const delta = Object.fromEntries(keys.map((key) => [key, round((candidate[key] || 0) - (baseline[key] || 0), 4)]));
  const value = (ledger, stat, type) => ledger[`${stat}:${type}`] || 0;
  const increasedDelta = value(delta, "damagePercent", "increased") + value(delta, "damageOverTimePercent", "increased") + value(delta, "elementalDamagePercent", "increased");
  const increasedDamageFactor = (100 + snapshot.damage.damageBonusPercent + increasedDelta) / (100 + snapshot.damage.damageBonusPercent);
  const baseIgniteDelta = value(delta, "baseIgniteDamage", "flat");
  const baseIgniteFactor = (snapshot.buffsAndMechanics.baseIgniteDamage + baseIgniteDelta) / snapshot.buffsAndMechanics.baseIgniteDamage;
  const additionalIgniteDelta = value(delta, "additionalIgniteDamagePercent", "more");
  const additionalIgniteFactor = (100 + snapshot.damage.additionalDamageBonusPercent + additionalIgniteDelta) / (100 + snapshot.damage.additionalDamageBonusPercent);
  const candidateGearIgniteLimit = value(candidate, "igniteLimit", "flat");
  const baselineGearIgniteLimit = value(baseline, "igniteLimit", "flat");
  const additionalIgniteStacksDelta = value(delta, "additionalIgniteStacks", "flat");
  const defenses = candidateItems.reduce((totals, item) => { for (const [key, amount] of Object.entries(item.defenses || {})) if (typeof amount === "number") totals[key] = round((totals[key] || 0) + amount, 4); return totals; }, {});
  for (const item of candidateItems) {
    const itemTotals = aggregateNormalizedModifiers(collectNormalizedGearModifiers([item]));
    for (const [stat, defense] of [["gearEvasion", "evasion"], ["gearEnergyShield", "gearEnergyShield"]]) {
      const current = value(itemTotals, stat, "flat");
      if (!Number.isFinite(item.defenses?.[defense])) defenses[defense] = (defenses[defense] || 0) + current;
      else if (overrides?.[item.slot] && !overrides[item.slot].sourceInventoryId && !Number.isFinite(overrides[item.slot].defenses?.[defense])) {
        const original = baselineItems.find(entry => entry.slot === item.slot);
        const originalValue = original ? value(aggregateNormalizedModifiers(collectNormalizedGearModifiers([original])), stat, "flat") : 0;
        defenses[defense] = (defenses[defense] || 0) + current - originalValue;
      }
    }
    const currentArmor = value(aggregateNormalizedModifiers(collectNormalizedGearModifiers([item])), "gearArmor", "flat");
    if (!Number.isFinite(item.defenses?.armor)) defenses.armor = (defenses.armor || 0) + currentArmor;
    else if (overrides?.[item.slot] && !overrides[item.slot].sourceInventoryId && !Number.isFinite(overrides[item.slot].defenses?.armor)) {
      const original = baselineItems.find(entry => entry.slot === item.slot);
      const originalArmor = original ? value(aggregateNormalizedModifiers(collectNormalizedGearModifiers([original])), "gearArmor", "flat") : 0;
      defenses.armor = (defenses.armor || 0) + currentArmor - originalArmor;
    }
  }
  const nonEnergySlots = new Set(["necklace", "belt", "leftRing", "rightRing"]);
  const energy = candidateItems.reduce((sum, item) => sum + (!nonEnergySlots.has(item.slot) ? Number(item.energy) || 0 : 0), 0);
  const recognizedTexts = new Set(candidateModifiers.map((modifier) => `${modifier.slot}:${modifier.text}`));
  const unrecognized = candidateItems.flatMap((item) => effectiveGearModifierTexts(item).filter((text) => !recognizedTexts.has(`${item.slot}:${text}`)).map((text) => ({ slot: item.slot, source: item.name, text })));
  const nonLimitDamageMultiplier = increasedDamageFactor * baseIgniteFactor * additionalIgniteFactor;
  return { allItems, candidateItems, baseline, candidate, delta, defenses, equipmentEnergy: energy, baselineGearIgniteLimit, candidateGearIgniteLimit, additionalIgniteStacksDelta, factors: { increasedDamageFactor: round(increasedDamageFactor, 6), baseIgniteFactor: round(baseIgniteFactor, 6), additionalIgniteFactor: round(additionalIgniteFactor, 6), nonLimitDamageMultiplier: round(nonLimitDamageMultiplier, 6) }, recognizedCount: candidateModifiers.length, unrecognized };
}

export function aggregateTalentEffects(talentSetup, ranks = {}) {
  const totals = {};
  const add = (key, value) => { if (typeof value === "number") { totals[key] = round((totals[key] || 0) + value, 4); if (key === "additionalDamageTakenPercent") defenseSources.push({ type: "all", value }); } };
  for (const panel of talentSetup.panels) {
    for (const node of panel.allocatedNodes) {
      const key = `${panel.name}:${node.coordinate}`;
      const rank = ranks[key] ?? node.rank;
      if (node.replacedBy || rank <= 0) continue;
      for (const [stat, value] of Object.entries(node.effectsPerRank || {})) add(stat, value * rank);
      if (rank > 0) for (const [stat, value] of Object.entries(node.effects || {})) add(stat, value);
    }
  }
  return totals;
}

// `additionalFireLines` (optional) receives each "+X% additional Fire Damage" line on its own:
// the in-game panel multiplies them separately (81.2515% = 1.6318375 × 1.068 × 1.04).
function slateNumericEffects(slate, additionalFireLines = null) {
  const totals = { baseIgniteDamage: 0, additionalIgniteStacks: 0, igniteChancePercent: 0, damagingAilmentChancePercent: 0, ailmentChancePercent: 0, igniteDurationPercent: 0, ailmentDurationPercent: 0, igniteLimit: 0, additionalFireDamagePercent: 0, additionalMaxDamagePercent: 0, blockRatioPercent: 0, maxFocusBlessingStacks: 0, maxTenacityBlessingStacks: 0, reapingRecoverySpeedPercent: 0, igniteChanceAgainstNotIgnitedPercent: 0, enemyAllResistanceAtMaxAfflictionPercent: 0 };
  // One text→key table with talents (src/talent-text-effects.js, talent batch T1/T2/T6): the slate keys plus the
  // talent lines a slate copies (Cast Speed, Spell crit, Affliction wording and effect, channeled speed, Fire
  // Penetration / Infiltration vs Ignited). Read by scorching-beam-critical.js (crit, e.g. "Warrior: Micro Talent: +15%
  // Critical Strike Rating", Judgment-scaled; Nether King "+15% Critical Strike Damage"), scorching-beam-cast-rate.js
  // and theoretical-sources.js. Daze is a state, so it is set, not summed.
  // User rule 2026-10-21 (cores never stack; a core from a slate works exactly as the panel copy): a slate's core talent ("Class: Lv.N
  // Core Talent: Name — …") stays out of these summed totals altogether. Its clauses reach the readers as the panel core's do
  // (src/modifier-texts.js gives them origin "core"; the Blessing, Block, Blur, curse, low-resource and resistance models read the
  // slate text as they read the panel core's), so Dirt and Impermanence are their own multipliers, not a share of the "Slates" sum.
  for (const raw of slateTalentLines(slate)) for (const clause of withoutSlateCoreName(raw).split(/\s+\|\s+|\s+·\s+/)) {
    if (slateCoreName(raw)) continue;
    const separator = clause.lastIndexOf(": ");
    const text = normalizePercentageText(separator < 0 ? clause : clause.slice(separator + 2));
    const matched = matchTalentTextClause(text, "slate");
    if (!matched) continue;
    for (const [key, raw] of matched.values) {
      const amount = typeof raw === "number" ? raw : raw ? 1 : 0;
      if (/^daze/.test(key)) { totals[key] = amount; continue; }
      totals[key] = (totals[key] || 0) + amount;
      if (key === "additionalFireDamagePercent") additionalFireLines?.push(amount);
    }
  }
  for (const [key, value] of Object.entries(slate.copiedTalents?.length ? {} : slate.resolvedCopiedTotals || {})) if (key in totals && typeof value === "number") {
    totals[key] += value;
    if (key === "additionalFireDamagePercent" && value) additionalFireLines?.push(value);
  }
  return totals;
}

export function aggregateSlateEffects(slateSetup, equippedIds = slateSetup.slates.map((slate) => slate.id)) {
  const enabled = new Set(equippedIds);
  return slateSetup.slates.filter((slate) => enabled.has(slate.id)).reduce((totals, slate) => {
    for (const [key, value] of Object.entries(slateNumericEffects(slate))) totals[key] = round((totals[key] || 0) + value, 4);
    return totals;
  }, {});
}

// Each equipped slate's "+X% additional Fire Damage" line as its own percentage (they multiply).
export function slateAdditionalFirePercents(slateSetup, equippedIds = slateSetup.slates.map((slate) => slate.id)) {
  const enabled = new Set(equippedIds);
  return slateSetup.slates.filter((slate) => enabled.has(slate.id)).flatMap((slate) => {
    const lines = [];
    slateNumericEffects(slate, lines);
    return lines;
  });
}

export function calculateTalentSlateCandidate({ talentSetup, talentRanks, slateSetup, equippedSlateIds, snapshot, candidateTalentSetup = talentSetup, candidateSlateSetup = slateSetup }) {
  const baselineTalent = aggregateTalentEffects(talentSetup);
  const candidateTalent = aggregateTalentEffects(candidateTalentSetup, talentRanks);
  const baselineSlate = aggregateSlateEffects(slateSetup);
  const candidateSlate = aggregateSlateEffects(candidateSlateSetup, equippedSlateIds);
  const talentDelta = Object.fromEntries([...new Set([...Object.keys(baselineTalent), ...Object.keys(candidateTalent)])].map((key) => [key, round((candidateTalent[key] || 0) - (baselineTalent[key] || 0), 4)]));
  const slateDelta = Object.fromEntries([...new Set([...Object.keys(baselineSlate), ...Object.keys(candidateSlate)])].map((key) => [key, round((candidateSlate[key] || 0) - (baselineSlate[key] || 0), 4)]));
  const increasedDamageDelta = (talentDelta.damagePercent || 0) + (talentDelta.damageOverTimePercent || 0) + (talentDelta.fireDamageOverTimePercent || 0);
  const increasedDamageFactor = (100 + snapshot.damage.damageBonusPercent + increasedDamageDelta) / (100 + snapshot.damage.damageBonusPercent);
  const baselineBaseIgnite = snapshot.buffsAndMechanics.baseIgniteDamage;
  const baseIgniteFactor = (baselineBaseIgnite + (talentDelta.baseIgniteDamage || 0) + (slateDelta.baseIgniteDamage || 0)) / baselineBaseIgnite;
  const additionalFireFactor = (100 + snapshot.damage.additionalFireDamageBonusPercent + (slateDelta.additionalFireDamagePercent || 0)) / (100 + snapshot.damage.additionalFireDamageBonusPercent);
  const baselineAdditionalStacks = 15;
  const candidateAdditionalStacks = Math.max(0, baselineAdditionalStacks + (talentDelta.additionalIgniteStacks || 0) + (slateDelta.additionalIgniteStacks || 0));
  const disintegrateFactor = (1 + candidateAdditionalStacks * 0.26) / (1 + baselineAdditionalStacks * 0.26);
  const damageMultiplier = increasedDamageFactor * baseIgniteFactor * additionalFireFactor * disintegrateFactor;
  return {
    baselineTalent, candidateTalent, talentDelta, baselineSlate, candidateSlate, slateDelta,
    candidateSlateAdditionalFirePercents: slateAdditionalFirePercents(candidateSlateSetup, equippedSlateIds),
    factors: { increasedDamageFactor: round(increasedDamageFactor, 6), baseIgniteFactor: round(baseIgniteFactor, 6), additionalFireFactor: round(additionalFireFactor, 6), disintegrateFactor: round(disintegrateFactor, 6), damageMultiplier: round(damageMultiplier, 6) },
    disintegrate: { baselineAdditionalStacks, candidateAdditionalStacks, additionalIgniteDamagePercent: round(candidateAdditionalStacks * 26) },
    sealedManaCompensationPercent: round(21.5 + (talentDelta.sealedManaCompensationPercent || 0) + (slateDelta.sealedManaCompensationPercent || 0), 4)
  };
}

export function calculatePactCandidate(pactSetup, state = {}, snapshot) {
  const defenseSources = [];
  const activeSpirits = state.activeSpirits || {};
  const nativeQuantities = state.nativeNodeQuantities || {};
  const totals = { elementalResistancePercent: 0, damageAvoidanceChancePercent: 0, reapingRecoverySpeedPercent: 0, damageOverTimePercent: 0, afflictionEffectPercent: 0, additionalDamageTakenPercent: 0, experienceEarnedPercent: 0, outgoingAdditionalDamagePercent: 0 };
  const add = (key, value) => {
    if (typeof value === "number") {
      totals[key] = round((totals[key] || 0) + value, 4);
      if (key === "additionalDamageTakenPercent") defenseSources.push({ type: "all", value });
    }
  };
  // Kismet-slot builds may select any pact spirit, not only the captured ones: uncaptured spirits
  // are read from the full catalog (level effects and node trees), the same way as captured ones.
  const capturedNames = new Set(pactSetup.pactspirits.map((spirit) => spirit.name));
  const uncapturedSpirits = state.kismetSlotMode && Array.isArray(state.selectedSpirits)
    ? [...new Set(state.selectedSpirits.filter((name) => name && !capturedNames.has(name) && (pactspiritTreesSs13[name] || pactspiritLevelsSs13[name])))]
      .map((name) => ({ name, rank: 1, effectsAtRank: [], unreplacedNativeNodes: [], uncaptured: true }))
    : [];
  // A selected spirit without a saved level is calculated at Lv1; report it so the assumption is visible.
  const levelAssumptions = [];
  // Each "+X% additional damage" pact / kismet line on its own (game: attr 5719 operation 4; the generic collector keeps every
  // operation-4 entry as a separate multiplier, research/equipped-damage-source-map-2026-10-07.md). The ledgers multiply them
  // (pact badge audit 2026-10-13; before, the DoT and beam ledgers summed them into one "Pacts: additional damage" factor).
  const additionalDamageLines = [];
  for (const spirit of [...pactSetup.pactspirits, ...uncapturedSpirits]) {
    if (activeSpirits[spirit.name] === false) continue;
    if (state.kismetSlotMode && Array.isArray(state.selectedSpirits) && !state.selectedSpirits.includes(spirit.name)) continue;
    const level=pactspiritLevel(spirit.name,state.spiritLevels,state.kismetSlotMode ? 1 : spirit.rank);
    const savedLevel = Number(state.spiritLevels?.[spirit.name]);
    if (state.kismetSlotMode && !(Number.isInteger(savedLevel) && savedLevel >= 1)) levelAssumptions.push({ spirit: spirit.name, level, text: `${spirit.name}: pact spirit level not set, assumed Lv${level}.` });
    const levelEffects=pactspiritEffectsAtLevel(spirit.name,level);
    const nodeSequence=state.kismetSlotMode ? orderedPactspiritNodes(pactspiritTreesSs13[spirit.name]) : [];
    const destinyIndex = nodeSequence.findIndex(node => node.ring === "destiny");
    if (destinyIndex >= 0 && nativeQuantities[`${spirit.name}:${destinyIndex}`] === 1 && !state.fateUnlocks?.[spirit.name]) {
      const match = nodeSequence[destinyIndex].effect?.match(/^\+(\d+) \* (\d+(?:\.\d+)?)% damage\b/i);
      if (match) { add("damagePercent", 6); add("minionDamagePercent", 6); }
    }
    const outerIndex=nodeSequence.findIndex((node)=>node.ring==="outer");
    const outerAllocated=!state.kismetSlotMode||outerIndex>=0&&nativeQuantities[`${spirit.name}:${outerIndex}`]===1;
    // A level effect that joins two stats with "; " ("+7% additional damage; +7% additional Minion Damage", Cloudgatherer - Violet)
    // is read as two effects (frost-terra audit 2026-10-13; before, the joined text matched no pattern).
    for (const effect of (outerAllocated ? levelEffects.length?levelEffects:spirit.effectsAtRank : []).flatMap((text) => String(text).split(/;\s*(?=[+-]\d)/))) {
      const physical = normalizePercentageText(effect).match(/^([+-]?[\d.]+)% additional Physical Damage taken when there (?:is|are) only 1 enem(?:y|ies) Nearby$/i);
      if (physical) defenseSources.push({ type: "physicalSingleEnemy", value: Number(physical[1]) });
      let match = normalizePercentageText(effect).match(/^([+-]?\d+(?:\.\d+)?)% additional damage taken$/i); if (match) add("additionalDamageTakenPercent", Number(match[1]));
      match = normalizePercentageText(effect).match(/^\+([0-9.]+)% additional damage$/i); if (match) { add("outgoingAdditionalDamagePercent", Number(match[1])); additionalDamageLines.push({ source: spirit.name, text: normalizePercentageText(effect).trim(), value: Number(match[1]) }); }
      match = normalizePercentageText(effect).match(/^\+([0-9.]+)% additional Reaping Recovery Speed$/i); if (match) add("additionalReapingRecoverySpeedPercent", Number(match[1]));
    }
    if (state.kismetSlotMode) {
      nodeSequence.forEach((node, index) => {
        if (!node || !["inner", "mid"].includes(node.ring) || nativeQuantities[`${spirit.name}:${index}`] !== 1 || state.kismetSlots?.[`${spirit.name}:${index}`]) return;
        const effect = nativePactspiritNodeEffect(node);
        if (effect) add(effect.stat, effect.value);
      });
    } else {
      for (const node of spirit.unreplacedNativeNodes) {
        const key = `${spirit.name}:${node.name}`;
        const quantity = Math.max(0, Math.min(node.quantity, nativeQuantities[key] ?? node.quantity));
        for (const [stat, value] of Object.entries(node.effectsPerNode)) add(stat, value * quantity);
      }
    }
  }
  const volcano = pactSetup.kismets[0];
  const volcanoEnabled = Array.isArray(state.volcanoEnabled) ? state.volcanoEnabled : volcano.rolls.map(() => true);
  const kismetLines = state.kismetSlotMode ? activeKismetEffects(state) : [];
  let enabledVolcanoRolls = [];
  let additionalIgniteDurationRolls = [];
  if (state.kismetSlotMode) {
    for (const line of kismetLines) {
      const effect = parseKismetEffect(line.text);
      if (!effect) continue;
      add(effect.stat, effect.value);
      if (effect.stat === "outgoingAdditionalDamagePercent") additionalDamageLines.push({ source: line.source, text: line.text, value: effect.value });
      if (effect.stat === "additionalIgniteDurationPercent")
        additionalIgniteDurationRolls.push({ source: line.name, key: line.key, value: effect.value });
    }
    enabledVolcanoRolls = [...new Set(kismetLines.filter(line => line.name === "Kismet: Volcano").map(line => line.key))];
  } else {
    enabledVolcanoRolls = volcano.rolls.filter((_, index) => volcanoEnabled[index] !== false);
    additionalIgniteDurationRolls = volcano.rolls.flatMap((roll, index) => volcanoEnabled[index] !== false
      ? [{ source: "Kismet: Volcano", key: `captured:${index}`, value: roll.additionalIgniteDurationPercent }]
      : []);
    totals.igniteLimit = enabledVolcanoRolls.reduce((sum, roll) => sum + roll.igniteLimit, 0);
    totals.chanceToIgniteTargetsPercent = enabledVolcanoRolls.reduce((sum, roll) => sum + roll.chanceToIgniteTargetsPercent, 0);
    totals.additionalIgniteDurationPercent = enabledVolcanoRolls.reduce((sum, roll) => sum + roll.additionalIgniteDurationPercent, 0);
    const reapingQuantity = Math.max(0, Math.min(5, state.reapingDurationQuantity ?? 5));
    totals.reapingDurationPercent = reapingQuantity * 12;
    const spellEnabled = Array.isArray(state.spellBlockEnabled) ? state.spellBlockEnabled : [true];
    totals.spellBlockChancePercent = [6].reduce((sum, value, index) => sum + (spellEnabled[index] === false ? 0 : value), 0);
    const attackEnabled = Array.isArray(state.attackBlockEnabled) ? state.attackBlockEnabled : [true, true];
    totals.attackBlockChancePercent = [6, 8].reduce((sum, value, index) => sum + (attackEnabled[index] === false ? 0 : value), 0);
  }
  totals.igniteLimit ??= 0;
  totals.reapingDurationPercent ??= 0;
  const baselineIgniteLimit = 10;
  const candidateIgniteLimit = 6 + totals.igniteLimit;
  const activeIgniteFactor = candidateIgniteLimit / baselineIgniteLimit;
  const additionalIgniteSupportFactor = additionalIgniteMultiplier(30, candidateIgniteLimit) / additionalIgniteMultiplier(30, baselineIgniteLimit);
  const baselineIncreasedPool = 100 + snapshot.damage.damageBonusPercent;
  const increasedDamageFactor = (baselineIncreasedPool + totals.damageOverTimePercent - pactSetup.unreplacedNativeNodeTotals.damageOverTimePercent) / baselineIncreasedPool;
  const outgoingAdditionalFactor = (1 + totals.outgoingAdditionalDamagePercent / 100) / 1.02;
  const nonLimitDamageMultiplier = increasedDamageFactor * outgoingAdditionalFactor;
  const damageMultiplier = activeIgniteFactor * additionalIgniteSupportFactor * nonLimitDamageMultiplier;
  return { totals, levelAssumptions, uncapturedSpirits: uncapturedSpirits.map((spirit) => spirit.name), additionalIgniteDurationRolls, outgoingAdditionalDamageLines: additionalDamageLines, defenseSources, generalDamageTakenFactor: defenseSources.filter(line => line.type === "all").reduce((factor, line) => factor * (1 + line.value / 100), 1), singleEnemyPhysicalDamageTakenFactor: defenseSources.reduce((factor, line) => factor * (1 + line.value / 100), 1), factors: { activeIgniteFactor: round(activeIgniteFactor, 6), additionalIgniteSupportFactor: round(additionalIgniteSupportFactor, 6), increasedDamageFactor: round(increasedDamageFactor, 6), outgoingAdditionalFactor: round(outgoingAdditionalFactor, 6), nonLimitDamageMultiplier: round(nonLimitDamageMultiplier, 6), damageMultiplier: round(damageMultiplier, 6) }, candidateIgniteLimit, enabledVolcanoCount: enabledVolcanoRolls.length, reapingDurationPerFatePercent: 12 };
}
