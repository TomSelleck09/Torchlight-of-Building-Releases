import { AFFLICTION_DAMAGE_PER_POINT } from "./game-attribute-defaults.js";
import { frameSnap as snapToFrames } from "./frame-snapping.js";
const finite = (value, label) => {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
  return value;
};

const sum = (values, label) => (values || []).reduce((total, value) => total + finite(value, label), 0);
const product = (values, label) => (values || []).reduce((total, value) => total * (1 + finite(value, label) / 100), 1);
const round = (value, places = 4) => Number(value.toFixed(places));

export function calculateAverageAfflictionRating(afflictionPerSecond, durationSeconds) {
  const rate = finite(afflictionPerSecond, "Affliction per second");
  const duration = finite(durationSeconds, "Affliction duration");
  if (rate < 0) throw new RangeError("Affliction per second cannot be negative");
  if (duration < 0) throw new RangeError("Affliction duration cannot be negative");
  if (rate === 0 || duration === 0) return 0;
  const timeToCap = 100 / rate;
  return duration <= timeToCap ? rate * duration / 2 : 100 - 5000 / (rate * duration);
}

// Controlled panel captures reveal that the character tooltip averages linear
// Affliction buildup over a 40-second projection window.
export function projectTooltipAfflictionRating(afflictionPerSecond) {
  return calculateAverageAfflictionRating(afflictionPerSecond, 40);
}

// Expected highest uniformly rolled base damage among independent successful
// applications still inside a one-stack ailment's duration window.
export function expectedStrongestAilmentBase({ min, max, chancePercent, attempts }) {
  finite(min, "ailment base minimum");
  finite(max, "ailment base maximum");
  const chance = finite(chancePercent, "ailment chance") / 100;
  const opportunities = finite(attempts, "ailment attempts");
  if (min < 0 || max < min || chance < 0 || chance > 1 || opportunities < 0) throw new RangeError("strongest ailment inputs are invalid");
  const expectedForCount = (count) => {
    if (count === 0 || chance === 0) return 0;
    const active = 1 - (1 - chance) ** count;
    const normalizedMaximum = 1 - (1 - (1 - chance) ** (count + 1)) / (chance * (count + 1));
    return min * active + (max - min) * normalizedMaximum;
  };
  const whole = Math.floor(opportunities);
  const fraction = opportunities - whole;
  return expectedForCount(whole) * (1 - fraction) + expectedForCount(whole + 1) * fraction;
}

// Expected sum of the strongest active stack rolls. A successful application
// contributes `stacksPerApplication` stacks sharing its one base roll.
export function retainedAilmentBaseSumForSuccesses({ min, max, successes, stacksPerApplication = 1, maximumActiveStacks = 1 }) {
  if (!successes || !stacksPerApplication || !maximumActiveStacks) return 0;
  const occupied = Math.min(maximumActiveStacks, successes * stacksPerApplication);
  let remaining = occupied;
  let rankSum = 0;
  for (let rank = 1; rank <= successes && remaining; rank++) {
    const selected = Math.min(stacksPerApplication, remaining);
    rankSum += selected * (successes - rank + 1);
    remaining -= selected;
  }
  return min * occupied + (max - min) * rankSum / (successes + 1);
}

export function expectedRetainedAilmentBaseSum({ min, max, chancePercent, attempts, stacksPerApplication = 1, maximumActiveStacks = 1 }) {
  finite(min, "ailment base minimum"); finite(max, "ailment base maximum");
  const chance = finite(chancePercent, "ailment chance") / 100;
  const opportunities = finite(attempts, "ailment attempts");
  const stacks = finite(stacksPerApplication, "stacks per application");
  const limit = finite(maximumActiveStacks, "maximum active stacks");
  if (min < 0 || max < min || chance < 0 || chance > 1 || opportunities < 0 || !Number.isInteger(stacks) || stacks < 0 || !Number.isInteger(limit) || limit < 0) throw new RangeError("retained ailment inputs are invalid");
  const forCount = (count) => {
    let probabilities = [1];
    for (let i = 0; i < count; i++) {
      const next = Array(probabilities.length + 1).fill(0);
      probabilities.forEach((weight, successes) => {
        next[successes] += weight * (1 - chance);
        next[successes + 1] += weight * chance;
      });
      probabilities = next;
    }
    return probabilities.reduce((expected, probability, successes) => expected + probability * retainedAilmentBaseSumForSuccesses({ min, max, successes, stacksPerApplication: stacks, maximumActiveStacks: limit }), 0);
  };
  const whole = Math.floor(opportunities);
  const fraction = opportunities - whole;
  return forCount(whole) * (1 - fraction) + forCount(whole + 1) * fraction;
}

// Reaping settles active DoT as True Damage. Affliction can refill while the
// per-target recovery timer runs, so the slower timer controls recurrence.
// input.frameSnap (optional, off; the Reap toggle is gone: the tick engine (src/tick-recount.js, chunk 15) runs the Reaps on whole 1/30 s frames on the recount and the windows; the Reap toggle of 2026-10-23 is gone): the Recovery Time
// is rounded up to whole 1/30 s frames and a full-Affliction trigger fires on a frame (its max(recovery, refill) rounded up too);
// the snapped times are returned unrounded so the dummy recount's tick grid reads the same frame count.
export function calculateReaping(input) {
  const dotDps = finite(input.damageOverTimeDps, "damage over time DPS");
  const baseDuration = finite(input.baseReapingDurationSeconds, "base Reaping duration");
  const durationBonus = finite(input.reapingDurationPercent ?? 0, "Reaping duration bonus");
  const baseRecovery = finite(input.baseRecoverySeconds ?? 1, "base Reaping recovery");
  const recoverySpeed = finite(input.reapingRecoverySpeedPercent ?? 0, "Reaping recovery speed");
  // "+X% additional Reaping Recovery Speed" (game mod 4, e.g. affix 4110) multiplies the summed speed.
  const additionalRecoveryFactor = product(input.additionalRecoverySpeedPercents, "additional Reaping recovery speed");
  const afflictionPerSecond = finite(input.afflictionPerSecond, "Affliction per second");
  const successfulApplicationsPerSecond = finite(input.successfulApplicationsPerSecond ?? 0, "successful applications per second");
  const trigger = input.trigger || "full Affliction";
  if ([dotDps, baseDuration, baseRecovery, afflictionPerSecond, successfulApplicationsPerSecond].some((value) => value < 0)) throw new RangeError("Reaping inputs cannot be negative");
  const effectiveDuration = baseDuration * (1 + durationBonus / 100);
  const frameSnap = Boolean(input.frameSnap);
  const recoverySeconds = snapToFrames(baseRecovery / ((1 + recoverySpeed / 100) * additionalRecoveryFactor), frameSnap);
  const roundTime = (value) => frameSnap ? value : round(value);
  const afflictionRemovedPercent = Math.max(0, Math.min(100, input.afflictionRemovedPercent ?? 100));
  const afflictionFillSeconds = afflictionRemovedPercent / afflictionPerSecond;
  const requiresAffliction = trigger === "full Affliction";
  const continuousDot = trigger === "dealing damage over time";
  const onApplication = trigger === "inflicting Ignite" || trigger === "inflicting an ailment";
  if ((requiresAffliction && afflictionPerSecond === 0) || (onApplication && successfulApplicationsPerSecond === 0) || baseDuration === 0 || dotDps === 0 || (!requiresAffliction && !continuousDot && !onApplication)) return { effectiveDurationSeconds: round(effectiveDuration), recoverySeconds: roundTime(recoverySeconds), afflictionFillSeconds: requiresAffliction && afflictionPerSecond > 0 ? round(afflictionFillSeconds) : null, damagePerReap: 0, triggerIntervalSeconds: Infinity, triggersPerSecond: 0, reapingDps: 0 };
  // After recovery, the next successful application is the next trigger opportunity.
  const triggerIntervalSeconds = requiresAffliction ? snapToFrames(Math.max(recoverySeconds, afflictionFillSeconds), frameSnap)
    : onApplication ? recoverySeconds + 1 / successfulApplicationsPerSecond : recoverySeconds;
  const damagePerReap = dotDps * effectiveDuration;
  return { effectiveDurationSeconds: round(effectiveDuration), recoverySeconds: roundTime(recoverySeconds), afflictionFillSeconds: requiresAffliction ? round(afflictionFillSeconds) : null, damagePerReap: round(damagePerReap), triggerIntervalSeconds: roundTime(triggerIntervalSeconds), triggersPerSecond: round(1 / triggerIntervalSeconds), reapingDps: round(damagePerReap / triggerIntervalSeconds) };
}

// Attempts are evenly spaced. Each success adds stacks and refreshes the one
// shared expiry timer. Consecutive successes belong to the same stack run
// when their gap is shorter than the duration; a longer gap starts over.
function expectedSharedTimerIgniteStacks(durationSeconds, applicationsPerSecond, chance, stacksPerApplication, maximumActiveStacks) {
  if (!durationSeconds || !applicationsPerSecond || !chance || !stacksPerApplication || !maximumActiveStacks) return 0;
  const durationInIntervals = durationSeconds * applicationsPerSecond;
  if (!Number.isFinite(durationInIntervals)) return maximumActiveStacks;

  // At an attempt, a previous success can still be refreshed only if its
  // attempt gap is at most this many intervals. Equality with the duration
  // means the old timer expired immediately before the new application.
  const linkedGapLimit = Math.max(0, Math.ceil(durationInIntervals) - 1);
  const logFailureChance = chance === 1 ? -Infinity : Math.log1p(-chance);
  const noLinkedSuccess = linkedGapLimit === 0 ? 1 : Math.exp(linkedGapLimit * logFailureChance);
  const linkedSuccessChance = linkedGapLimit === 0 ? 0 : -Math.expm1(linkedGapLimit * logFailureChance);
  const intervalRemainder = durationInIntervals - linkedGapLimit;

  // A randomly sampled point within an attempt interval has an active timer
  // after a success in the last linkedGapLimit slots, or after one in the
  // oldest slot for the remaining fraction of its duration.
  const uptime = linkedSuccessChance + chance * noLinkedSuccess * intervalRemainder;

  // Looking backward from the latest success, each earlier success links to
  // the run with probability linkedSuccessChance. Thus the run length is
  // geometric. Sum its capped stack count in closed form.
  const fullyFilledGroups = Math.ceil(maximumActiveStacks / stacksPerApplication) - 1;
  if (fullyFilledGroups <= 0 || noLinkedSuccess === 0) return uptime * maximumActiveStacks;
  if (!Number.isFinite(fullyFilledGroups)) return uptime * Math.min(maximumActiveStacks, stacksPerApplication / noLinkedSuccess);
  const logLinkedSuccess = noLinkedSuccess > 0.5 ? Math.log(linkedSuccessChance) : Math.log1p(-noLinkedSuccess);
  const linkedPower = Math.exp(fullyFilledGroups * logLinkedSuccess);
  const geometricSum = -Math.expm1(fullyFilledGroups * logLinkedSuccess) / noLinkedSuccess;
  const finalGroupStacks = maximumActiveStacks - fullyFilledGroups * stacksPerApplication;
  const occupiedWhileActive = stacksPerApplication * geometricSum + finalGroupStacks * linkedPower;
  return uptime * Math.min(maximumActiveStacks, occupiedWhileActive);
}

// reference data rule references:
// 
// 
// 
// 
export function calculateTheoreticalIgnite(input) {
  const base = input.baseIgniteDamage || {};
  const baseMin = finite(base.min, "base Ignite minimum");
  const baseMax = finite(base.max, "base Ignite maximum");
  if (baseMin < 0 || baseMax < baseMin) throw new RangeError("base Ignite range is invalid");

  const increasedPercent = sum(input.increasedDamagePercents, "increased damage");
  const addedDamageEffectivenessPercent = finite(input.addedDamageEffectivenessPercent ?? 100, "added damage effectiveness");
  const sourceCoefficientFactor = product(input.sourceCoefficientPercents, "source coefficient");
  const additionalDamageFactor = product(input.additionalDamagePercents, "additional damage");
  const additionalTakenFactor = product(input.additionalDamageTakenPercents, "additional damage taken");
  const afflictionRating = Math.min(100, Math.max(0, finite(input.afflictionRating ?? 0, "Affliction rating")));
  const afflictionEffectPercent = sum(input.afflictionEffectPercents, "Affliction effect");
  const additionalAfflictionEffectFactor = product(input.additionalAfflictionEffectPercents, "additional Affliction effect");
  // Damage per point of Affliction: config_attributes 5724 default 0.01 (2026-10-17 game attribute data).
  const afflictionTakenFactor = 1 + afflictionRating * AFFLICTION_DAMAGE_PER_POINT * (1 + afflictionEffectPercent / 100) * additionalAfflictionEffectFactor;

  const targetResistancePercent = finite(input.targetResistancePercent ?? 0, "target resistance");
  const penetrationPercent = sum(input.penetrationPercents, "resistance penetration");
  const effectiveResistancePercent = targetResistancePercent - penetrationPercent;
  const resistanceFactor = Math.max(0, 1 - effectiveResistancePercent / 100);

  const durationSeconds = finite(input.durationSeconds ?? 4, "Ignite duration");
  const applicationsPerSecond = finite(input.applicationsPerSecond ?? 1, "applications per second");
  const stacksPerApplication = finite(input.stacksPerApplication ?? 1, "stacks per application");
  const maximumActiveStacks = finite(input.maximumActiveStacks ?? 1, "maximum active stacks");
  const applicationChancePercent = finite(input.applicationChancePercent ?? 100, "Ignite application chance");
  if (durationSeconds < 0 || applicationsPerSecond < 0 || stacksPerApplication < 0 || maximumActiveStacks < 0 || applicationChancePercent < 0) throw new RangeError("Ignite stack inputs cannot be negative");
  const chance = Math.min(1, applicationChancePercent / 100);
  const sustainedStacks = expectedSharedTimerIgniteStacks(durationSeconds, applicationsPerSecond, chance, stacksPerApplication, maximumActiveStacks);

  const commonFactor = (addedDamageEffectivenessPercent / 100) * sourceCoefficientFactor * (1 + increasedPercent / 100) * additionalDamageFactor * additionalTakenFactor * afflictionTakenFactor * resistanceFactor;
  const perStack = { min: baseMin * commonFactor, max: baseMax * commonFactor };
  const stacksOnApplication = Math.min(maximumActiveStacks, stacksPerApplication);
  const successfulApplication = { min: perStack.min * stacksOnApplication, max: perStack.max * stacksOnApplication };
  const sustained = { min: perStack.min * sustainedStacks, max: perStack.max * sustainedStacks };
  const totalPerStack = { min: perStack.min * durationSeconds, max: perStack.max * durationSeconds };

  return {
    perStackDps: { min: round(perStack.min), max: round(perStack.max) },
    successfulApplicationDps: { min: round(successfulApplication.min), max: round(successfulApplication.max) },
    stacksOnApplication: round(stacksOnApplication),
    sustainedDps: { min: round(sustained.min), max: round(sustained.max) },
    totalDamagePerStack: { min: round(totalPerStack.min), max: round(totalPerStack.max) },
    sustainedStacks: round(sustainedStacks),
    applicationChancePercent: round(applicationChancePercent),
    factors: {
      addedDamageEffectiveness: round(addedDamageEffectivenessPercent / 100), sourceCoefficient: round(sourceCoefficientFactor),
      increasedDamagePercent: round(increasedPercent), additionalDamage: round(additionalDamageFactor),
      additionalDamageTaken: round(additionalTakenFactor), afflictionTaken: round(afflictionTakenFactor), additionalAfflictionEffect: round(additionalAfflictionEffectFactor),
      effectiveResistancePercent: round(effectiveResistancePercent), resistance: round(resistanceFactor)
    },
    trace: [
      { id: "base", label: "Base Ignite Damage", formula: `${baseMin}–${baseMax}`, factor: null },
      { id: "effectiveness", label: "Effectiveness of added damage", formula: `${round(addedDamageEffectivenessPercent)}%`, factor: round(addedDamageEffectivenessPercent / 100) },
      { id: "sourceCoefficient", label: "Skill source coefficients", formula: "Skill-specific multipliers", factor: round(sourceCoefficientFactor) },
      { id: "increased", label: "Summed increased damage", formula: `1 + ${round(increasedPercent)}%`, factor: round(1 + increasedPercent / 100) },
      { id: "additional", label: "Additional damage multipliers", formula: "Each additional modifier multiplies", factor: round(additionalDamageFactor) },
      { id: "affliction", label: "Affliction damage taken", formula: `${round(afflictionRating)} rating with ${round(afflictionEffectPercent)}% increased and ×${round(additionalAfflictionEffectFactor)} additional effect`, factor: round(afflictionTakenFactor) },
      { id: "target", label: "Target resistance", formula: `${round(targetResistancePercent)}% − ${round(penetrationPercent)}% penetration`, factor: round(resistanceFactor) },
      { id: "stacks", label: "Expected active Ignites", formula: `${round(applicationChancePercent)}% chance per application; ${durationSeconds}s shared timer, refreshed by each success; ${applicationsPerSecond}/s × ${stacksPerApplication} stacks, capped at ${maximumActiveStacks}`, factor: round(sustainedStacks) }
    ]
  };
}
