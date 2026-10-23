// Adapter: planner internals → plain, serialisable dummy-recount inputs (src/dummy-recount.js).
// Spec: research/dummy-recount-spec-2026-10-09.md §B. Phase 1 (shadow mode) reads the same values
// today's 5 s / 20 s figures use, so the option defaults reproduce them:
// - beam: the native hit cycle's average use and explosion (with crit), the Bard residual as a
//   constant rate, and Scorch resistance linked to the Ignite chain;
// - Ignite: the planner's expectedActiveIgnite (base range, chance, not-Ignited chance, duration,
//   stacks, damage per base, max-Affliction resistance);
// - other ailments (damage-path builds): calculateAilment's chance, duration, stack limit and
//   combat factor;
// - Reaping: the Ignite ledger's sources (Ignite-only builds) or calculateMultiSourceReaping's
//   20 s sources (damage-path builds), with their recovery, settled seconds and settle scales.
import { retainedAilmentBaseSumForSuccesses } from "./theoretical-damage.js";
import { expectedStrongestStacks } from "./ailment-model.js";
import { averagedResistanceFactor } from "./max-affliction-resistance.js";
import { normalizeRecountOptions, RECOUNT_STEP_SECONDS } from "./dummy-recount.js";

const MAX_RETAINED_SUCCESSES = 512;
const fireFactor = (resistancePercent) => Math.max(0, 1 - resistancePercent / 100);
const clampChance = (percent) => Math.max(0, Math.min(1, (Number(percent) || 0) / 100));

// Affliction damage taken is 1 + rating × perPoint, so the simulated-Affliction option can rescale
// DoTs over time. perPoint comes from the ledger when given (needed at a configured rating of 100,
// where the full-Affliction scale is 1); otherwise it is recovered from the full-Affliction scale
// S = (1 + 100 p) / (1 + rating p). A rating of 0 means Affliction is off: no rescaling.
function afflictionLayer(configuredRating, fullAfflictionScale, explicitPerPoint) {
  const rating = Math.max(0, Number(configuredRating) || 0);
  const scale = Number(fullAfflictionScale) || 1;
  const denominator = 100 - scale * rating;
  const recovered = scale > 1 && denominator > 0 ? (scale - 1) / denominator : 0;
  const perPoint = !(rating > 0) ? 0 : Number.isFinite(explicitPerPoint) && explicitPerPoint >= 0 ? explicitPerPoint : recovered;
  return { configuredRating: rating, perPoint };
}

// Expected strongest of n successful applications, every n at once: same midpoint rule as
// ailment-model.js expectedStrongestApplication (chance 100%, crit mixture), cdf^n built by product.
// A doubled application ("+X% chance to deal double <Ailment> Damage"; gear affix batch D) is ×2 with that chance.
function strongestOfSuccesses({ min, max, critChancePercent = 0, critFactor = 1, doubleChancePercent = 0, count, steps = 400 }) {
  const values = new Array(count + 1).fill(0);
  if (!(max > 0)) return values;
  const crit = clampChance(critChancePercent);
  const factor = Math.max(1, critFactor);
  const span = Math.max(0, max - min);
  const uniformCdf = (value) => span === 0 ? (value >= min ? 1 : 0) : Math.max(0, Math.min(1, (value - min) / span));
  const double = clampChance(doubleChancePercent);
  const top = max * factor * (double > 0 ? 2 : 1);
  const single = (value) => (1 - crit) * uniformCdf(value) + crit * uniformCdf(value / factor);
  const cdf = Array.from({ length: steps }, (_, index) => {
    const value = top * (index + 0.5) / steps;
    return (1 - double) * single(value) + double * single(value / 2);
  });
  const power = new Array(steps).fill(1);
  for (let n = 1; n <= count; n++) {
    let total = 0;
    for (let index = 0; index < steps; index++) { power[index] *= cdf[index]; total += 1 - power[index]; }
    values[n] = total * top / steps;
  }
  return values;
}

function maxAfflictionRatios(info) {
  if (!info || !info.reductionPercent) return null;
  const at = (fraction) => averagedResistanceFactor({ resistancePercent: info.resistancePercent, penetrationPercent: info.penetrationPercent, reductionPercent: info.reductionPercent, fraction });
  const steady = at(info.steadyFraction);
  if (!(steady > 0)) return null;
  return { firstMaxSeconds: info.firstMaxSeconds, steadyFraction: info.steadyFraction, ratioAtNone: at(0) / steady, ratioAtFull: at(1) / steady };
}

function igniteAilment({ ignite, retention, count, fullAfflictionScale, afflictionRating, afflictionPerPoint, scorch }) {
  const multi = ignite.mode === "multi-stack";
  const { min, max } = ignite.baseRange;
  const limit = ignite.maximumActiveStacks ?? 1;
  const stacks = ignite.stacksPerApplication ?? 1;
  const average = (min + max) / 2;
  const retained = Array.from({ length: count + 1 }, (_, n) => {
    if (!n) return 0;
    if (retention === "newest") return multi ? Math.min(limit, n * stacks) * average : average;
    return multi ? retainedAilmentBaseSumForSuccesses({ min, max, successes: n, stacksPerApplication: stacks, maximumActiveStacks: limit }) : min + (max - min) * n / (n + 1);
  });
  const retainedLimit = retention === "newest" ? (multi ? limit * average : average) : (multi ? limit * max : max);
  const scorchLimit = scorch ? Math.max(1, scorch.activeStacks || 1) : 0;
  const scorchStacks = scorch ? Math.max(1, scorch.stacksPerApplication || 1) : 0;
  return {
    key: "ignite", name: "Ignite", stacking: "shared-timer",
    chance: clampChance(ignite.applicationChancePercent),
    notActiveChance: clampChance(ignite.notIgnitedApplicationChancePercent ?? ignite.applicationChancePercent),
    duration: ignite.durationSeconds ?? 4,
    retainedBase: retained, retainedLimit,
    damagePerBase: multi ? ignite.damagePerBase : ignite.expectedBaseDamage > 0 ? ignite.expectedDps / ignite.expectedBaseDamage : 0,
    fullAfflictionScale: fullAfflictionScale || 1,
    affliction: afflictionLayer(afflictionRating, fullAfflictionScale, afflictionPerPoint),
    maxAffliction: maxAfflictionRatios(ignite.maxAffliction),
    ...(scorch ? { scorchFraction: retained.map((_, n) => Math.min(scorchLimit, n * scorchStacks) / scorchLimit) } : {})
  };
}

// Several inflicting skills (ailment-model.js `appliers`): the timeline attempts at the main-skill rate, so
// their pooled successes per second become a success-equivalent chance per main use (capped at 100%, so a
// faster secondary stream saturates). A single applier at the main rate keeps its chance as is.
function pooledChancePercent(ailment, rate) {
  const active = (ailment.appliers || []).filter((applier) => !applier.blocked && applier.applicationsPerSecond > 0);
  if (!ailment.appliers || !active.length || (active.length === 1 && Math.abs(active[0].applicationsPerSecond - rate) < 1e-9)) return ailment.chancePercent;
  return rate > 0 ? 100 * (ailment.combat?.successesPerSecond || 0) / rate : 0;
}

// A skill DoT's Max Affliction lines (Pain Amplification, src/skill-dot-model.js maxAfflictionAdditional) are in its steady
// combat factor; before the dummy first reaches 100 Affliction the DoT runs at 1 / factor of it (same ratio form as the
// max-Affliction resistance reduction above; frost-terra audit 2026-10-13). Nothing removes Affliction for a skill DoT here.
function maxAfflictionAdditionalRatios(ailment, afflictionPerSecond) {
  const factor = ailment.maxAfflictionAdditional?.factor ?? 1;
  const additional = factor > 1 ? { firstMaxSeconds: afflictionPerSecond > 0 ? 100 / afflictionPerSecond : Infinity, steadyFraction: 1, ratioAtNone: 1 / factor, ratioAtFull: 1 } : null;
  // "−X% All Resistance when the enemy has max Affliction" on this DoT (user decision 2026-10-21; src/ailment-shared.js): its ratios
  // to the steady time share, as the Ignite chain's (maxAfflictionRatios). With Pain Amplification as well the two multiply; the
  // reduction's uptime (first max, removers' steady share) is used.
  const resistance = ailment.maxAfflictionResistance?.recount || null;
  if (!resistance) return additional;
  if (!additional) return { ...resistance };
  return { firstMaxSeconds: resistance.firstMaxSeconds, steadyFraction: resistance.steadyFraction, ratioAtNone: resistance.ratioAtNone * additional.ratioAtNone, ratioAtFull: resistance.ratioAtFull * additional.ratioAtFull };
}

function otherAilment({ ailment, retention, count, critChancePercent, rate = 0, afflictionPerSecond = 0 }) {
  const chancePercent = pooledChancePercent(ailment, rate);
  const common = {
    key: ailment.key, name: ailment.name,
    chance: clampChance(chancePercent), notActiveChance: clampChance(chancePercent),
    duration: ailment.durationSeconds,
    damagePerBase: ailment.combat.factor,
    fullAfflictionScale: ailment.fullAfflictionScale || 1,
    affliction: afflictionLayer(ailment.steps?.afflictionRating, ailment.fullAfflictionScale, ailment.afflictionPerPoint),
    maxAffliction: maxAfflictionAdditionalRatios(ailment, afflictionPerSecond)
  };
  if (ailment.combat.stacking === "independent") {
    // Pooled successes above one per main use cannot raise the chance past 100%; the extra stacks are carried
    // in the average stack instead (the stack limit then applies to main-use stacks only).
    return { ...common, stacking: "independent", limit: ailment.stackLimit, averageApplication: ailment.combat.averageApplication * Math.max(1, chancePercent / 100) };
  }
  const critFactor = ailment.combat.critOnlyFactor ?? 1;
  const crit = clampChance(critChancePercent);
  const averageApplication = ailment.combat.averageApplication ?? (ailment.base.min + ailment.base.max) / 2 * (1 + crit * (critFactor - 1));
  // A limit above 1 (Trauma with Open Wounds, generic Ignite): the run keeps its strongest stacks, as the beam's Ignite chain does
  // (user-confirmed 2026-10-19: a weaker application refreshes them without overwriting them; src/ailment-model.js expectedStrongestStacks).
  const limit = Math.max(1, Number(ailment.stackLimit) || 1);
  const stacks = Math.max(1, Number(ailment.stacksPerApplication) || 1);
  const multi = limit > 1;
  const doubleChancePercent = ailment.combat.doubleChancePercent || 0;
  const roll = { min: ailment.base.min, max: ailment.base.max, critChancePercent, critFactor, doubleChancePercent, chancePercent: 100 };
  const retainedBase = retention === "newest"
    ? Array.from({ length: count + 1 }, (_, n) => n ? averageApplication * (multi ? Math.min(limit, n * stacks) : 1) : 0)
    : multi ? Array.from({ length: count + 1 }, (_, n) => n ? expectedStrongestStacks({ streams: [{ ...roll, attempts: n }], stackLimit: limit, stacksPerApplication: stacks }) : 0)
    : strongestOfSuccesses({ min: ailment.base.min, max: ailment.base.max, critChancePercent, critFactor, doubleChancePercent, count });
  const retainedLimit = (retention === "newest" ? averageApplication : ailment.base.max * (crit > 0 ? Math.max(1, critFactor) : 1) * (doubleChancePercent > 0 ? 2 : 1)) * (multi ? limit : 1);
  return { ...common, stacking: "shared-timer", retainedBase, retainedLimit };
}

/**
 * Collect the recount inputs. Returns null when the main skill makes no uses.
 * @param {object} p
 * @param {object|null} p.delivery bardDelivery (beam residual, resistance scale, Scorch)
 * @param {object|null} p.nativeCycle nativeHitCycle (average use, explosion, cycle uses)
 * @param {object|null} p.ignite theoretical.combat.expectedActiveIgnite
 * @param {object|null} p.igniteReaping theoretical.combat.reaping (used when multiReaping is null)
 * @param {number} [p.igniteFullAfflictionScale] theoretical.combat.fullAfflictionScale
 * @param {number} [p.igniteAfflictionRating] configured Affliction rating behind the Ignite ledger
 * @param {number} [p.igniteAfflictionPerPoint] theoretical.combat.afflictionPerPoint (damage taken per rating point)
 * @param {object[]} [p.ailments] modeled non-Ignite ailments (damage-path builds only)
 * @param {object|null} p.multiReaping damagePaths.twentySeconds.reaping (damage-path builds)
 * @param {object|null} p.channel mechanics.channel; ramps only when prebuiltSelfBuffs is false
 * @param {number} p.castsPerSecond main-skill uses (application attempts) per second
 * @param {number} p.afflictionPerSecond the build's passive Affliction per second
 * @param {number} p.critChancePercent beam critical strike chance (ailment crit mixture)
 * @param {boolean} p.prebuiltSelfBuffs own buffs built before engaging
 * @param {object} [p.options] recount options (dummy-recount.js DEFAULT_RECOUNT_OPTIONS)
 * @param {number} [p.seconds] timeline length the retained tables are sized for
 * @param {object|null} [p.timedEffects] timed and stacking effects (Ice Cage ramp, periodic pact debuffs and buffs): { parts,
 *   shares } from src/timed-effects.js recountTimedEffects; `shares` maps a source key to { hit, types } (DoTs and the Reaps
 *   settling them, skill hits, the beam); scheduled-hit events carry their own `timedShare`
 */
export function collectDummyRecountInputs({
  delivery = null, nativeCycle = null, ignite = null, igniteReaping = null, igniteFullAfflictionScale = 1, igniteAfflictionRating = 0, igniteAfflictionPerPoint,
  ailments = [], multiReaping = null, channel = null, castsPerSecond = 0, afflictionPerSecond = 0, critChancePercent = 0,
  prebuiltSelfBuffs = true, options = {}, seconds = 60, timedDotLayers = [], skillHits = [], scheduledHits = [], firstUseSeconds = null, timedEffects = null
} = {}) {
  const rate = Number(castsPerSecond) || 0;
  if (!(rate > 0)) return null;
  const normalized = normalizeRecountOptions(options);
  const count = Math.max(1, Math.min(MAX_RETAINED_SUCCESSES, Math.floor(rate * seconds + 1e-9) + 1));
  const assumptions = [];

  const scorch = delivery?.scorch?.active ? delivery.scorch : null;
  const recountAilments = [];
  const canIgnite = Boolean(ignite && ignite.baseRange?.max > 0 && ignite.applicationChancePercent > 0);
  if (canIgnite) recountAilments.push(igniteAilment({ ignite, retention: normalized.retention, count, fullAfflictionScale: igniteFullAfflictionScale, afflictionRating: igniteAfflictionRating, afflictionPerPoint: igniteAfflictionPerPoint, scorch }));
  else if (scorch) {
    // Scorch without a modeled Ignite: a damage-free chain carries its uptime.
    recountAilments.push({
      key: "scorch", name: "Scorch", stacking: "shared-timer", silent: true,
      chance: clampChance(scorch.applicationChancePercent), notActiveChance: clampChance(scorch.applicationChancePercent),
      duration: scorch.durationSeconds, retainedBase: new Array(count + 1).fill(0), retainedLimit: 0, damagePerBase: 0,
      scorchFraction: Array.from({ length: count + 1 }, (_, n) => Math.min(Math.max(1, scorch.activeStacks || 1), n * Math.max(1, scorch.stacksPerApplication || 1)) / Math.max(1, scorch.activeStacks || 1))
    });
  }
  for (const ailment of ailments || []) if (ailment?.modeled) recountAilments.push(otherAilment({ ailment, retention: normalized.retention, count, critChancePercent, rate, afflictionPerSecond: Number(afflictionPerSecond) || 0 }));
  for (const ailment of (ailments || []).filter((item) => item?.modeled && (item.appliers || []).filter((applier) => !applier.blocked && applier.applicationsPerSecond > 0).length > 1)) {
    assumptions.push({ id: `ailmentAppliers:${ailment.key}`, value: ailment.appliers.filter((applier) => applier.successesPerSecond > 0).map((applier) => applier.name).join(", "), text: `${ailment.name} is applied by ${ailment.appliers.filter((applier) => applier.successesPerSecond > 0).map((applier) => `${applier.name} (${Math.round(applier.share * 1000) / 10}%)`).join(", ")}; the timeline attempts at the main-skill rate with their pooled success rate (${Math.round(pooledChancePercent(ailment, rate) * 100) / 100}% per use) and the base roll of the main skill's applications.` });
  }

  let hits = null;
  if (delivery?.applicable && nativeCycle && nativeCycle.castsPerSecond > 0) {
    hits = {
      perUse: (nativeCycle.beam.min + nativeCycle.beam.max) / 2 * nativeCycle.criticalFactor,
      explosion: (nativeCycle.explosion.min + nativeCycle.explosion.max) / 2 * nativeCycle.criticalFactor,
      cycleUses: nativeCycle.cycleUses,
      residualDps: delivery.bardSourceDps ?? delivery.bardRelatedDps ?? 0,
      // Same calibration as scorching-beam-delivery.js: hit damage is scaled from the 30% Fire Resistance dummy.
      resistance: scorch
        ? { kind: "scorch", chainKey: canIgnite ? "ignite" : "scorch", baseScale: fireFactor(scorch.baseResistancePercent) / fireFactor(30), activeScale: fireFactor(scorch.activeResistancePercent) / fireFactor(30) }
        : { kind: "fixed", scale: delivery.targetResistanceScale ?? 1 }
    };
  } else if (nativeCycle) {
    assumptions.push({ id: "beamHits", value: "none", text: "Beam hits are left out: the dummy delivery calibration only covers Selena's Scorching Beam (same as today's 5 s / 20 s figures)." });
  }

  const reaping = [];
  if (multiReaping) {
    const settleAffliction = Object.fromEntries(recountAilments.map((ailment) => [ailment.key, ailment.fullAfflictionScale ?? 1]));
    // A full-Affliction Reap settles Ignite with the max-Affliction resistance reduction in full, as on the Ignite-only
    // path (theoretical-sources.js fullAfflictionResistanceScale; research/damage-path-switch-2026-10-12.md fix B).
    const igniteFullResistance = canIgnite ? igniteReaping?.sources?.find((source) => source.trigger === "full Affliction")?.settledResistanceScale ?? null : null;
    multiReaping.sources.forEach((source, index) => {
      const full = source.trigger === "full Affliction";
      // A max-channeled-stacks Reap (skill built-in) fires while the DoT is active at its steady interval
      // (max of cooldown and uses-to-max ÷ rate), like a DoT-triggered source with that recovery.
      const maxStacks = source.trigger === "max channeled stacks" || source.trigger === "skill use";
      reaping.push({
        key: `reap:${index}`, source: source.source, trigger: maxStacks ? "dealing damage over time" : source.trigger, triggerLabel: source.trigger,
        recoverySeconds: maxStacks && Number.isFinite(source.intervalSeconds) ? source.intervalSeconds : source.recoverySeconds, floorSeconds: RECOUNT_STEP_SECONDS,
        // Start-up: uses fall at u / rate (u ≥ 1); the opening channel reaches max stacks firstTriggerUses uses after the first.
        ...(maxStacks && source.usesPerSecond > 0 && Number.isFinite(source.firstTriggerUses) ? { firstReadySeconds: (1 + source.firstTriggerUses) / source.usesPerSecond } : {}),
        // Parity with reaping-model.js: a full-Affliction source waits for a full 100-point refill.
        afflictionRemovedPercent: 100,
        seconds: Object.fromEntries(source.perDot.map((dot) => [dot.key, dot.seconds])),
        // A Reap is True Damage: `trueDamage` takes the DoT's "damage applied to Life" lines out (src/true-damage.js).
        settle: Object.fromEntries(source.perDot.map((dot) => [dot.key, { affliction: full ? settleAffliction[dot.key] ?? 1 : null, resistance: full && dot.key === "ignite" ? igniteFullResistance : null, trueDamage: dot.trueDamageScale ?? 1 }]))
      });
    });
    if (multiReaping.sources.some((source) => source.trigger === "full Affliction")) assumptions.push({ id: "fullAfflictionRefill", value: 100, text: "Multi-source full-Affliction Reaps wait for a full 100-point refill; the source's Affliction removal % is not used (parity with reaping-model.js)." });
  } else if (igniteReaping && canIgnite) {
    igniteReaping.sources.forEach((source, index) => {
      const full = source.trigger === "full Affliction";
      reaping.push({
        key: `reap:${index}`, source: source.source, trigger: source.trigger,
        recoverySeconds: source.minimum.recoverySeconds, floorSeconds: 0,
        afflictionRemovedPercent: source.afflictionRemovedPercent ?? 100,
        seconds: { ignite: source.minimum.effectiveDurationSeconds },
        // A full-Affliction Reap settles at 100 rating and with the max-Affliction resistance reduction in full.
        settle: { ignite: full ? { affliction: source.settledAfflictionScale ?? 1, resistance: source.settledResistanceScale ?? 1, trueDamage: source.trueDamageScale ?? 1 } : { affliction: null, resistance: null, trueDamage: source.trueDamageScale ?? 1 } }
      });
    });
    if (igniteReaping.sources.length) assumptions.push({ id: "reapTickFloor", value: "multi-source only", text: "The 1/30 s Reap floor applies to multi-source Reaping only (parity with today's Ignite Reaping)." });
  }

  const ramp = channel && prebuiltSelfBuffs === false && channel.perStackSupercharge > 0;
  assumptions.push(ramp
    ? { id: "channel", value: "ramp", text: `Channeled stacks ramp from ${channel.minStacks} at one stack per use (prebuilt self-buffs off).` }
    : { id: "channel", value: "full", text: "Channeled stacks (Supercharge) are full from engagement." });

  // Time-limited DoT multipliers (e.g. Windwalk: ×1.6 on damage over time for 4 s once Affliction is full).
  const timed = (timedDotLayers || []).filter((layer) => Number.isFinite(layer.startSeconds) && layer.durationSeconds > 0 && layer.factor > 0);
  for (const layer of timed) assumptions.push({ id: `timedDot:${layer.source}`, value: layer.factor, text: `${layer.source}: ×${Math.round(layer.factor * 1000) / 1000} on damage over time (and its Reaps) from ${Math.round(layer.startSeconds * 100) / 100} s for ${layer.durationSeconds} s (${layer.text}).` });
  // Generic spell hits (src/skill-hit-model.js): expected damage per use at each skill's own use rate, dealt
  // from its first use (1 / rate) on; no ailment chain is attached to them yet (hit ailments are a follow-up).
  const hitSources = (skillHits || []).filter((hit) => hit && hit.rate > 0 && Number.isFinite(hit.perUse)).map((hit) => ({ key: hit.key, label: hit.label || hit.key, perUse: Number(hit.perUse) || 0, rate: hit.rate, ...(Number.isFinite(hit.firstUseSeconds) ? { firstUseSeconds: hit.firstUseSeconds } : {}) }));
  for (const hit of (skillHits || []).filter((hit) => hit?.provisional)) assumptions.push({ id: `skillHit:${hit.key}`, value: "best case", text: `${hit.label}: ${hit.provisional}.` });
  // Scheduled hits (Minions, src/minion-damage-model.js): explicit damage events on the timeline, no ailment chain.
  const scheduled = (scheduledHits || []).filter((source) => source && Array.isArray(source.events) && source.events.length).map((source) => ({ key: source.key, label: source.label || source.key, steadyDps: Number(source.steadyDps) || 0, events: source.events.filter((event) => Number.isFinite(event.time) && Number.isFinite(event.damage) && event.time >= 0).map((event) => ({ time: event.time, damage: event.damage, ...(event.timedShare ? { timedShare: event.timedShare } : {}) })) }));
  // Timed effects (src/timed-effects.js): each part's factor series relative to the sustained value; the listed shares follow it.
  const timedParts = (timedEffects?.parts || []).filter((part) => Array.isArray(part?.edges) && part.edges.length && part.edges.length === part.factors?.length && part.factors.every(Number.isFinite));
  // A share keeps its source key and a part its `keys`, so a part keyed to one skill's hits reaches that skill only.
  const timedShares = Object.fromEntries(Object.entries(timedEffects?.shares || {}).filter(([, share]) => share && typeof share === "object").map(([key, share]) => [key, { hit: Boolean(share.hit), types: Object.fromEntries(Object.entries(share.types || {}).filter(([, value]) => Number.isFinite(value) && value > 0)), ...(typeof share.key === "string" ? { key: share.key } : {}) }]));
  return {
    rate,
    // Opening cast of the use schedule (src/skill-hit-model.js rate.firstUseSeconds); null keeps uses at u / rate.
    ...(Number.isFinite(firstUseSeconds) && firstUseSeconds >= 0 ? { firstUseSeconds } : {}),
    hits,
    skillHits: hitSources,
    scheduledHits: scheduled,
    timedDotLayers: timed.map((layer) => ({ startSeconds: layer.startSeconds, durationSeconds: layer.durationSeconds, factor: layer.factor })),
    ...(timedParts.length ? { timedEffects: { parts: timedParts.map((part) => ({ type: part.type || null, reach: part.reach || "all", ...(Array.isArray(part.keys) ? { keys: [...part.keys] } : {}), edges: [...part.edges], factors: [...part.factors] })), shares: timedShares } } : {}),
    channel: ramp ? { minStacks: channel.minStacks, maxStacks: channel.maxStacks, perStackSupercharge: channel.perStackSupercharge, superchargeFlat: channel.superchargeFlat } : null,
    ailments: recountAilments,
    afflictionPerSecond: Math.max(0, Number(afflictionPerSecond) || 0),
    reaping,
    options: normalized,
    assumptions
  };
}
