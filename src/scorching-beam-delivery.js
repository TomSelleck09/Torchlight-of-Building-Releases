import { retainedAilmentBaseSumForSuccesses } from "./theoretical-damage.js";
import { maxAfflictionWindowScale } from "./max-affliction-resistance.js";

// Level-85 dummy measurements from the stripped September 2026 controls.
// The neutral delivery includes all ordinary Scorching Beam packets, including
// any native explosion. The residual is Bard-related, not a proven bubble hit.
export const beamDeliveryMeasurements = Object.freeze({
  irisSheetDps: 479.41065448226,
  irisDummyDps: 542,
  selenaSheetDps: 383.52852358581,
  selenaDummyDps: 699,
  gearedSelenaSheetDps: 599.07155384103,
  gearedSelenaDummyDps: 1084.5,
  bardDamageFactor: 0.8,
  bardChannelIntervalSeconds: 0.8,
  bardMaxStacks: 4
});

const fireFactor = (resistancePercent) => Math.max(0, 1 - resistancePercent / 100);

// The calibration target has 30% Fire Resistance. Scorch can lower that
// resistance, but only after a successful application and while it persists.
function openingResistanceScale(delivery, rate, seconds) {
  const scorch = delivery.scorch;
  if (!scorch?.active || !(rate > 0)) return delivery.targetResistanceScale ?? 1;
  const base = fireFactor(scorch.baseResistancePercent);
  const active = fireFactor(scorch.activeResistancePercent);
  const chance = Math.max(0, Math.min(1, scorch.applicationChancePercent / 100));
  const duration = Math.max(0, scorch.durationSeconds);
  const stackFraction = (attempts) => {
    const limit = Math.max(1, scorch.activeStacks || 1);
    const perSuccess = Math.max(1, scorch.stacksPerApplication || 1);
    if (perSuccess >= limit) return 1 - Math.pow(1 - chance, attempts);
    let distribution = [1];
    const whole = Math.floor(attempts);
    for (let use = 0; use < whole; use++) {
      const next = Array(limit + 1).fill(0);
      distribution.forEach((probability, stacks) => {
        next[stacks] += probability * (1 - chance);
        next[Math.min(limit, stacks + perSuccess)] += probability * chance;
      });
      distribution = next;
    }
    const expected = distribution.reduce((sum, probability, stacks) => sum + probability * stacks, 0);
    const nextExpected = distribution.reduce((sum, probability, stacks) => sum + probability * (stacks * (1 - chance) + Math.min(limit, stacks + perSuccess) * chance), 0);
    return (expected + (attempts - whole) * (nextExpected - expected)) / limit;
  };
  const slices = Math.ceil(seconds * 100);
  let factor = 0;
  for (let index = 0; index < slices; index++) {
    const time = seconds * (index + 0.5) / slices;
    const attempts = Math.min(time, duration) * rate;
    factor += base + (active - base) * stackFraction(attempts);
  }
  return factor / slices / fireFactor(30);
}

export function estimateBardBeamDelivery({ heroId, beamActive, sourceScale = 1, nativeCycle = null, targetFireResistancePercent = 30, conditions = {}, scorch = null }) {
  if (heroId !== "selena-sing-with-the-tide" || !beamActive) return null;
  const measured = beamDeliveryMeasurements;
  const strippedNativeDps = nativeCycle && sourceScale > 0
    ? nativeCycle.expectedDps / sourceScale : measured.irisDummyDps * measured.bardDamageFactor;
  const residualDps = measured.selenaDummyDps - strippedNativeDps;
  const cycleSeconds = measured.bardChannelIntervalSeconds * measured.bardMaxStacks;
  const applicable = Number.isFinite(targetFireResistancePercent);
  const targetResistanceScale = fireFactor(targetFireResistancePercent) / fireFactor(30);
  const extrapolatedConditions = Object.values(conditions).some(Boolean);
  const scale = Number.isFinite(sourceScale) && sourceScale > 0 ? sourceScale : 0;
  const bubbleUseDamage = nativeCycle
    ? (nativeCycle.beam.min + nativeCycle.beam.max) / 2 * nativeCycle.criticalFactor : null;
  const fullChannelDamage = nativeCycle && nativeCycle.castsPerSecond > 0
    ? nativeCycle.expectedDps * nativeCycle.cycleUses / nativeCycle.castsPerSecond : null;
  const bubbleScenarios = nativeCycle ? {
    oneBeamDps: bubbleUseDamage / cycleSeconds,
    fullChannelDps: fullChannelDamage / cycleSeconds
  } : null;
  return {
    applicable,
    extrapolatedConditions: extrapolatedConditions || targetFireResistancePercent !== 30,
    reason: targetFireResistancePercent !== 30 ? "Fire Resistance is scaled from the level-85 dummy calibration at 30%; Scorch uptime is estimated from chance and duration." : "",
    targetResistanceScale,
    scorch,
    sourceScale: scale,
    neutralSourceDps: strippedNativeDps * scale,
    bardSourceDps: residualDps * scale,
    neutralDps: strippedNativeDps * scale * targetResistanceScale,
    bardRelatedDps: residualDps * scale * targetResistanceScale,
    totalDps: measured.selenaDummyDps * scale * targetResistanceScale,
    candidateBubbleCycleSeconds: cycleSeconds,
    candidateDamagePerCycle: residualDps * cycleSeconds * scale,
    bubbleScenarios,
    validation: {
      predictedGearedDps: measured.selenaDummyDps * measured.gearedSelenaSheetDps / measured.selenaSheetDps,
      observedGearedDps: measured.gearedSelenaDummyDps
    }
  };
}

// Scorching Beam on any hero but Selena: the native cycle as delivered to the level-85 dummy, with no Bard residual.
// The cycle's packets carry the 49% coefficient, which reproduces the stripped Iris dummy run at the 30% Fire Resistance
// target (536.8 modeled vs 542 observed, Lv.20; research/selena-1-scorching-beam/volcano-dummy-validation-2026-09-22.md),
// so another resistance scales from 30% exactly as the Bard delivery does. Same shape as estimateBardBeamDelivery.
export function estimateNeutralBeamDelivery({ heroId, beamActive, nativeCycle = null, targetFireResistancePercent = 30, conditions = {}, scorch = null }) {
  if (heroId === "selena-sing-with-the-tide" || !beamActive || !nativeCycle) return null;
  const applicable = Number.isFinite(targetFireResistancePercent);
  const targetResistanceScale = fireFactor(targetFireResistancePercent) / fireFactor(30);
  const neutralSourceDps = nativeCycle.expectedDps;
  return {
    applicable,
    neutral: true,
    extrapolatedConditions: Object.values(conditions).some(Boolean) || targetFireResistancePercent !== 30,
    reason: targetFireResistancePercent !== 30 ? "Fire Resistance is scaled from the level-85 dummy calibration at 30%; Scorch uptime is estimated from chance and duration." : "",
    targetResistanceScale,
    scorch,
    sourceScale: 1,
    neutralSourceDps,
    bardSourceDps: 0,
    neutralDps: neutralSourceDps * targetResistanceScale,
    bardRelatedDps: 0,
    totalDps: neutralSourceDps * targetResistanceScale
  };
}

export function combineBeamAndIgnite(delivery, strongestOneStack, reaping = null) {
  if (!delivery?.applicable || !strongestOneStack) return null;
  const beamDps = delivery.totalDps;
  const igniteDps = strongestOneStack.expectedDps;
  const reapingDps = reaping ? (reaping.minimum.reapingDps + reaping.maximum.reapingDps) / 2 : 0;
  return { beamDps, igniteDps, reapingDps, extrapolatedConditions: delivery.extrapolatedConditions || false, igniteMode: strongestOneStack.mode || "one-stack", expectedActiveStacks: strongestOneStack.expectedActiveStacks ?? 1, totalDps: beamDps + igniteDps + reapingDps };
}

// All Ignite applications on a target share one expiration time. A success
// refreshes that time and keeps the stacks from earlier successes in the same
// uninterrupted run. States track the last success and the number of rolls
// retained under the existing strongest-roll approximation.
// The window starts on a clean dummy. Attempts made while the dummy has no active
// Ignite (state "0:0", or after the shared timer expired) use notIgnitedChancePercent:
// "+X% Ignite Chance against enemies that haven't been Ignited" (affix 2214789) is the
// Ignite chance field gated on the target not being Ignited. This shortens the expected
// time to the first Ignite from 1/(rate × p) to 1/(rate × p'), with p' = min(1, p + X%).
function expectedSharedTimerIgniteBaseIntegral({ baseRange, chancePercent, notIgnitedChancePercent = chancePercent, castsPerSecond, durationSeconds, maximumActiveStacks, mode, seconds, stacksPerApplication }) {
  if (!(durationSeconds > 0) || !(castsPerSecond > 0) || !(Math.max(chancePercent, notIgnitedChancePercent) > 0)) return 0;
  const uses = Math.floor(castsPerSecond * seconds + 1e-9);
  const ignitedChance = Math.max(0, Math.min(1, chancePercent / 100));
  const notIgnitedChance = Math.max(0, Math.min(1, notIgnitedChancePercent / 100));
  const expectedBase = Array.from({ length: uses + 1 }, (_, successes) => {
    if (!successes) return 0;
    return mode === "multi-stack"
      ? retainedAilmentBaseSumForSuccesses({ min: baseRange.min, max: baseRange.max, successes, stacksPerApplication, maximumActiveStacks })
      : baseRange.min + (baseRange.max - baseRange.min) * successes / (successes + 1);
  });
  let states = new Map([["0:0", 1]]);
  let previousTime = 0;
  let integral = 0;
  for (let use = 1; use <= uses + 1; use++) {
    const time = use <= uses ? use / castsPerSecond : seconds;
    const next = new Map();
    for (const [key, probability] of states) {
      const [lastSuccess, successes] = key.split(":").map(Number);
      if (lastSuccess) {
        const expiration = lastSuccess / castsPerSecond + durationSeconds;
        integral += probability * expectedBase[successes] * Math.max(0, Math.min(time, expiration) - previousTime);
      }
      if (use > uses) continue;
      const stillActive = lastSuccess && time < lastSuccess / castsPerSecond + durationSeconds - 1e-9;
      const chance = stillActive ? ignitedChance : notIgnitedChance;
      const failedKey = stillActive ? key : "0:0";
      next.set(failedKey, (next.get(failedKey) || 0) + probability * (1 - chance));
      const succeededKey = `${use}:${stillActive ? successes + 1 : 1}`;
      next.set(succeededKey, (next.get(succeededKey) || 0) + probability * chance);
    }
    states = next;
    previousTime = time;
  }
  return integral;
}

export function estimateApplicationReapingOpening({ source, strongestOneStack, castsPerSecond, seconds = 5 }) {
  if (!["inflicting Ignite", "inflicting an ailment"].includes(source?.trigger) || !(castsPerSecond > 0) || !(seconds > 0)) return null;
  const uses = Math.floor(castsPerSecond * seconds + 1e-9);
  // Keep this exact state calculation bounded for unusually fast builds.
  if (uses > 18 || !strongestOneStack?.expectedDps || !strongestOneStack.baseRange) return null;
  const ignitedChance = Math.max(0, Math.min(1, strongestOneStack.applicationChancePercent / 100));
  // Attempts while the dummy is not Ignited use the not-Ignited chance (affix 2214789).
  const notIgnitedChance = Math.max(0, Math.min(1, (strongestOneStack.notIgnitedApplicationChancePercent ?? strongestOneStack.applicationChancePercent) / 100));
  const duration = strongestOneStack.durationSeconds ?? 4;
  const recoverySeconds = source.minimum.recoverySeconds;
  const reapedSeconds = source.minimum.effectiveDurationSeconds;
  const damagePerBase = strongestOneStack.mode === "multi-stack" ? 0 : strongestOneStack.expectedDps / strongestOneStack.expectedBaseDamage;
  const { min, max } = strongestOneStack.baseRange;
  let states = new Map([["0:0:0", 1]]);
  let expectedDamage = 0;
  for (let index = 0; index < uses; index++) {
    const next = new Map();
    for (const [key, probability] of states) {
      const [lastSuccess, successes, ready] = key.split(":").map(Number);
      const time = (index + 1) / castsPerSecond;
      const stillActive = lastSuccess && time < lastSuccess / castsPerSecond + duration - 1e-9;
      const chance = stillActive ? ignitedChance : notIgnitedChance;
      const failedKey = stillActive ? key : `0:0:${ready}`;
      next.set(failedKey, (next.get(failedKey) || 0) + probability * (1 - chance));
      const canReap = index >= ready;
      const nextReady = canReap ? index + Math.ceil(recoverySeconds * castsPerSecond - 1e-9) : ready;
      const activeApplications = stillActive ? successes + 1 : 1;
      const succeededKey = `${index + 1}:${activeApplications}:${nextReady}`;
      next.set(succeededKey, (next.get(succeededKey) || 0) + probability * chance);
      if (canReap) {
        const activeDotDps = duration <= 0 ? 0 : strongestOneStack.mode === "multi-stack"
          ? retainedAilmentBaseSumForSuccesses({ min, max, successes: activeApplications, stacksPerApplication: strongestOneStack.stacksPerApplication, maximumActiveStacks: strongestOneStack.maximumActiveStacks }) * strongestOneStack.damagePerBase
          : (min + (max - min) * activeApplications / (activeApplications + 1)) * damagePerBase;
        // A Reap is True Damage: without the Ignite's "damage applied to Life" lines (src/true-damage.js).
        expectedDamage += probability * chance * activeDotDps * reapedSeconds * (source.trueDamageScale ?? 1);
      }
    }
    states = next;
  }
  return { expectedDamage, expectedDps: expectedDamage / seconds, uses };
}

export function estimateFiveSecondOpening({ delivery, nativeCycle, strongestOneStack, reaping = null, seconds = 5 }) {
  if (!delivery?.applicable || !nativeCycle || !strongestOneStack || !(seconds > 0)) return null;
  const rate = nativeCycle.castsPerSecond;
  if (!(rate > 0)) return null;
  const uses = Math.floor(rate * seconds + 1e-9);
  const explosions = Math.floor(uses / nativeCycle.cycleUses);
  const averageBeam = (nativeCycle.beam.min + nativeCycle.beam.max) / 2 * nativeCycle.criticalFactor;
  const averageExplosion = (nativeCycle.explosion.min + nativeCycle.explosion.max) / 2 * nativeCycle.criticalFactor;
  const neutralDamage = uses * averageBeam + explosions * averageExplosion;
  const resistanceScale = openingResistanceScale(delivery, rate, seconds);
  const bardSourceDps = delivery.bardSourceDps ?? delivery.bardRelatedDps ?? 0;
  const beamDamage = (neutralDamage + bardSourceDps * seconds) * resistanceScale;
  const duration = strongestOneStack.durationSeconds ?? strongestOneStack.applicationAttempts / rate;
  const baseRange = strongestOneStack.baseRange;
  // Integrate expected active rolls between casts and possible shared-timer
  // expirations. The game's discrete ticks still vary with phase and rolls.
  const damagePerBase = strongestOneStack.mode === "multi-stack" ? strongestOneStack.damagePerBase
    : strongestOneStack.expectedBaseDamage > 0 ? strongestOneStack.expectedDps / strongestOneStack.expectedBaseDamage : 0;
  // "−X% All Resistance when the enemy has max Affliction": the steady-state Ignite figure uses the
  // steady share of time at max; this window (clean dummy) uses its own share (max-affliction-resistance.js).
  const maxAfflictionScale = maxAfflictionWindowScale(strongestOneStack.maxAffliction, seconds);
  const igniteDamage = expectedSharedTimerIgniteBaseIntegral({
    baseRange, chancePercent: strongestOneStack.applicationChancePercent, notIgnitedChancePercent: strongestOneStack.notIgnitedApplicationChancePercent ?? strongestOneStack.applicationChancePercent, castsPerSecond: rate,
    durationSeconds: duration, maximumActiveStacks: strongestOneStack.maximumActiveStacks,
    mode: strongestOneStack.mode, seconds, stacksPerApplication: strongestOneStack.stacksPerApplication
  }) * damagePerBase * maxAfflictionScale;
  let reapingDps = 0;
  let reapingTiming = "none";
  // Per source (same order as reaping.sources): the window figure, the steady figure and whether it is application-timed.
  let reapingBySource = [];
  if (reaping) {
    const results = reaping.sources.map((source) => estimateApplicationReapingOpening({ source, strongestOneStack, castsPerSecond: rate, seconds }));
    reapingBySource = results.map((result, index) => {
      const steadyDps = (reaping.sources[index].minimum?.reapingDps + reaping.sources[index].maximum?.reapingDps) / 2;
      return { source: reaping.sources[index].source, trigger: reaping.sources[index].trigger, baseDurationSeconds: reaping.sources[index].baseDurationSeconds, baseRecoverySeconds: reaping.sources[index].baseRecoverySeconds, timed: Boolean(result), steadyDps, dps: result ? result.expectedDps * maxAfflictionScale : steadyDps };
    });
    reapingDps = reapingBySource.reduce((sum, item) => sum + item.dps, 0);
    reapingTiming = results.every(Boolean) ? "application-timed expectation" : results.some(Boolean) ? "mixed expectation and steady-rate approximation" : "steady-rate approximation";
  }
  return {
    seconds, uses, explosions,
    igniteMode: strongestOneStack.mode || "one-stack",
    beamDps: beamDamage / seconds,
    resistanceScale,
    igniteDps: igniteDamage / seconds,
    reapingDps,
    reapingBySource,
    reapingTiming,
    totalDpsApproximation: beamDamage / seconds + igniteDamage / seconds + reapingDps
  };
}

export function simulateFiveSecondVariation({ delivery, nativeCycle, ignite, reaping = null, criticalChancePercent = 0, criticalDamagePercent = 150, seconds = 5, sampleCount = 1024 }) {
  if (!delivery?.applicable || !nativeCycle || !ignite || !(seconds > 0) || !(nativeCycle.castsPerSecond > 0)) return null;
  let seed = 0x9e3779b9;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const roll = ({ min, max }) => min + (max - min) * random();
  const chance = Math.max(0, Math.min(1, ignite.applicationChancePercent / 100));
  const notIgnitedChance = Math.max(0, Math.min(1, (ignite.notIgnitedApplicationChancePercent ?? ignite.applicationChancePercent) / 100));
  const critChance = Math.max(0, Math.min(1, criticalChancePercent / 100));
  const critMultiplier = Math.max(1, criticalDamagePercent / 100);
  const limit = ignite.maximumActiveStacks ?? 1;
  const stacksPerApplication = ignite.stacksPerApplication ?? 1;
  const duration = ignite.durationSeconds ?? 4;
  const damagePerBase = (ignite.mode === "multi-stack" ? ignite.damagePerBase : ignite.expectedBaseDamage > 0 ? ignite.expectedDps / ignite.expectedBaseDamage : 0) * maxAfflictionWindowScale(ignite.maxAffliction, seconds);
  const sources = reaping?.sources || [];
  const timedSources = sources.filter((source) => ["inflicting Ignite", "inflicting an ailment"].includes(source.trigger));
  const steadyReapingDamage = sources.filter((source) => !timedSources.includes(source)).reduce((sum, source) => sum + (source.minimum.reapingDps + source.maximum.reapingDps) / 2 * seconds, 0);
  const resistanceScale = openingResistanceScale(delivery, nativeCycle.castsPerSecond, seconds);
  const uses = Math.floor(nativeCycle.castsPerSecond * seconds + 1e-9);
  // Only the strongest rolls can count: each application adds `copies` stacks and at
  // most `limitCount` stacks deal damage, so keeping the top ceil(limit / copies)
  // rolls (sorted, highest first) gives the same sum as sorting every roll.
  const copies = Math.max(0, Math.trunc(stacksPerApplication));
  const limitCount = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : Infinity;
  const keptRolls = copies > 0 ? Math.ceil(limitCount / copies) : 0;
  const samples = [];
  for (let run = 0; run < sampleCount; run++) {
    const active = [];
    const keep = (base) => {
      if (active.length >= keptRolls && !(base > active[active.length - 1])) return;
      let index = active.length;
      while (index > 0 && active[index - 1] < base) index--;
      active.splice(index, 0, base);
      if (active.length > keptRolls) active.length = keptRolls;
    };
    let igniteExpiresAt = 0;
    const ready = timedSources.map(() => 0);
    let damage = (delivery.bardSourceDps ?? delivery.bardRelatedDps ?? 0) * seconds * resistanceScale + steadyReapingDamage;
    const phase = random();
    let nextTick = phase;
    const activeDot = (time) => {
      if (time >= igniteExpiresAt - 1e-9) active.length = 0;
      let sum = 0, counted = 0;
      for (const base of active) for (let copy = 0; copy < copies && counted < limitCount; copy++, counted++) sum += base;
      return sum * damagePerBase;
    };
    for (let use = 1; use <= uses; use++) {
      const time = use / nativeCycle.castsPerSecond;
      while (nextTick <= time + 1e-9 && nextTick <= seconds) { damage += activeDot(nextTick); nextTick += 1; }
      damage += roll(nativeCycle.beam) * (random() < critChance ? critMultiplier : 1) * resistanceScale;
      if (use % nativeCycle.cycleUses === 0) damage += roll(nativeCycle.explosion) * (random() < critChance ? critMultiplier : 1) * resistanceScale;
      if (random() < (time >= igniteExpiresAt - 1e-9 ? notIgnitedChance : chance)) {
        if (time >= igniteExpiresAt - 1e-9) active.length = 0;
        keep(roll(ignite.baseRange));
        igniteExpiresAt = time + duration;
        for (let index = 0; index < timedSources.length; index++) if (time + 1e-9 >= ready[index]) {
          const source = timedSources[index];
          damage += activeDot(time) * source.minimum.effectiveDurationSeconds * (source.trueDamageScale ?? 1);
          ready[index] = time + source.minimum.recoverySeconds;
        }
      }
    }
    while (nextTick <= seconds) { damage += activeDot(nextTick); nextTick += 1; }
    samples.push(damage / seconds);
  }
  samples.sort((a, b) => a - b);
  const percentile = (fraction) => {
    const position = fraction * (samples.length - 1);
    const lower = Math.floor(position);
    return samples[lower] + (samples[Math.ceil(position)] - samples[lower]) * (position - lower);
  };
  return { lowDps: percentile(0.1), highDps: percentile(0.9), meanDps: samples.reduce((sum, value) => sum + value, 0) / samples.length, sampleCount, seconds, percentileRange: "10th–90th", assumptions: "uniform hit rolls and one retained ailment roll per application; independent critical strikes; shared Ignite expiration; one-second Ignite ticks with random phase; fixed Bard residual; expected Scorch resistance uptime" };
}
