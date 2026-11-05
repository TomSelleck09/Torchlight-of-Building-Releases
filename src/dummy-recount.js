// Training-dummy recount timeline (spec: research/dummy-recount-spec-2026-10-09.md, §B).
//
// One deterministic, expected-value simulation that every damage path feeds: beam hits,
// shared-timer and independent-stack ailments, and every Reaping source. The in-game recount
// shows "Average DPS in a span of time", "Highest DPS in 5s" and "Average DPS in 5s". The in-game
// recount caps at 5 T; the planner does not apply or show that cap (user, 2026-10-13).
//
// Algorithm. The simulation is event driven: beam uses (k / rate), ailment state-group
// expiries, output bin edges, Affliction reaching 100, Reap readiness, the channel ramp
// reaching full stacks and the first max-Affliction time. Every rate is constant (or linear,
// integrated at the midpoint) between consecutive events, so the integration is exact; the
// 1/30 s grid is only the output binning and the optional Reap trigger quantum
// (options.reapTiming = "tick"). A fixed-step scheme would add up to one tick of phase error
// per event, which is why quantization stays an option.
//
// Expected-value state. A shared-timer ailment (Ignite, Trauma) is a Markov chain on
// (k = uses since the last success, n = successes in the current uninterrupted run), with
// mass at n >= NCAP merged into NCAP. retainedBase[n] is the expected base the run keeps
// after n successes (precomputed by the adapter). Independent stacks (Wilt) are mean-field.
// The first application-triggered Reap source whose trigger is a shared-timer ailment is
// tracked jointly with that chain (an extra "uses until ready" dimension), matching
// estimateApplicationReapingOpening exactly; further application sources use a mean-field
// ready mass.
//
// An ailment with its own `uses` ({ rate, firstUseSeconds? }: a secondary skill's DoT) is attempted
// on that schedule, and everything that counts its uses reads that rate; the rest on the main one.
//
// This module is pure: it imports only the pure Spacetime Turbulence helpers (src/youga-spacetime.js) and never mutates its
// inputs.

/** Output bin width: the ~30 Hz server tick (equals REAP_TICK_SECONDS in reaping-model.js). */
import { turbulenceSeries, twistedSpacetime } from "./youga-spacetime.js";

export const RECOUNT_STEP_SECONDS = 1 / 30;

const EPS = 1e-9;

/**
 * Largest shared-timer chain state (K × R × (N + 1) cells, two Float64Arrays each; every beam use
 * touches every cell). 250,000 cells is 2 MB per array and stays well under a second over the 60 s
 * timeline at realistic use rates. Above it, joint Reap readiness falls back to the mean-field ready
 * share; a chain that is still too large is rejected (the planner then leaves the recount blank).
 */
export const MAX_CHAIN_CELLS = 250000;

// Rates and durations must be finite: an infinite rate or duration has no finite timeline.
function assertFiniteInputs(inputs) {
  if (!inputs || !(inputs.rate > 0) || !Number.isFinite(inputs.rate)) throw new RangeError("dummy recount inputs need a positive, finite use rate");
  for (const ailment of inputs.ailments || []) {
    if (!Number.isFinite(ailment.duration) || ailment.duration < 0) throw new RangeError(`dummy recount ailment ${ailment.key} needs a finite, non-negative duration`);
    if (ailment.uses && (!(ailment.uses.rate > 0) || !Number.isFinite(ailment.uses.rate))) throw new RangeError(`dummy recount ailment ${ailment.key} needs a positive, finite use rate`);
  }
}
// The rate of an ailment's attempts: its own, or the main skill's.
const attemptRate = (ailment, rate) => ailment.uses?.rate ?? rate;
const usesAt = (rate, first) => first != null ? (u) => first + (u - 1) / rate : (u) => u / rate;
const lastUseIn = (rate, first, seconds) => first != null ? (first <= seconds + EPS ? Math.floor((seconds - first) * rate + EPS) + 1 : 0) : Math.floor(rate * seconds + EPS);
const sharedChainCells = (ailment, rate, R) => (Math.max(1, Math.ceil(ailment.duration * rate + EPS)) + 1) * R * (Math.max(1, ailment.retainedBase.length - 1) + 1);

/** Option defaults reproduce today's figures (parity); the alternatives are §E open questions. */
export const DEFAULT_RECOUNT_OPTIONS = Object.freeze({
  afflictionModel: "configured",   // "configured": the configured Affliction rating holds from t = 0; "simulated": A(t) from 0
  afflictionAccrual: "whileDot", // "whileDot": only while a DoT is active (SS14 client, research/oq-r1-r2-rea-2026-11-04.md R1.3); "windowStart": from engagement
  reapTiming: "continuous",        // "continuous": Reaps fire as soon as ready; "tick": triggers wait for the next 1/30 s tick
  retention: "strongest",          // "strongest": the run keeps its strongest rolls; "newest": the newest rolls replace older ones
  recountStart: "engage"           // "engage": the meter starts at engagement; "firstDamage": at the first hit
});

const OPTION_VALUES = Object.freeze({
  afflictionModel: ["configured", "simulated"],
  afflictionAccrual: ["windowStart", "whileDot"],
  reapTiming: ["continuous", "tick"],
  retention: ["strongest", "newest"],
  recountStart: ["engage", "firstDamage"]
});

export function normalizeRecountOptions(options = {}) {
  const normalized = { ...DEFAULT_RECOUNT_OPTIONS };
  for (const [key, allowed] of Object.entries(OPTION_VALUES)) {
    const value = options?.[key];
    if (value === undefined) continue;
    if (!allowed.includes(value)) throw new RangeError(`dummy recount option ${key} must be one of ${allowed.join(", ")}`);
    normalized[key] = value;
  }
  return normalized;
}

const OPTION_TEXT = {
  afflictionModel: {
    configured: "Affliction: the configured rating applies to DoTs from t = 0 (afflictionModel = configured).",
    simulated: "Affliction: the dummy's rating builds from 0 at the build's Affliction per second and DoTs scale with it (afflictionModel = simulated)."
  },
  afflictionAccrual: {
    windowStart: "Affliction for full-Affliction Reaps accrues from engagement (afflictionAccrual = windowStart).",
    whileDot: "Affliction accrues only while a DoT is active (afflictionAccrual = whileDot)."
  },
  reapTiming: {
    continuous: "Reaps fire as soon as they are ready (reapTiming = continuous).",
    tick: "Reap triggers wait for the next 1/30 s server tick (reapTiming = tick)."
  },
  retention: {
    strongest: "A run of refreshed ailment applications keeps its strongest rolls for the whole run (retention = strongest).",
    newest: "Newer ailment rolls replace older ones at the stack limit (retention = newest)."
  },
  recountStart: {
    engage: "The recount starts at engagement (recountStart = engage).",
    firstDamage: "The recount starts at the first hit (recountStart = firstDamage)."
  }
};

/** The option values in use, as { id, value, text } entries. */
export function recountOptionAssumptions(options) {
  const normalized = normalizeRecountOptions(options);
  return Object.keys(OPTION_VALUES).map((id) => ({ id, value: normalized[id], text: OPTION_TEXT[id][normalized[id]] }));
}

const snapToTick = (time) => Math.ceil(time / RECOUNT_STEP_SECONDS - 1e-6) * RECOUNT_STEP_SECONDS;
const APPLICATION_TRIGGERS = new Set(["inflicting an ailment", "inflicting Ignite"]);

// ---------------------------------------------------------------------------------------------
// Ailment state

// Shared-timer ailment: one expiration time for all stacks, refreshed by every success.
// States are stored after use `u` (time u / rate): k = u − (index of the last success),
// r = further uses before the jointly tracked Reap source is ready (0 = ready), n = successes
// in the current run (capped at N). `inactive[r]` holds the mass with no active ailment.
class SharedTimerChain {
  constructor(ailment, rate, readyUses, useAt = (u) => u / rate) {
    this.useAt = useAt; // time of use u (u / rate, or first + (u − 1) / rate with inputs.firstUseSeconds)
    this.ailment = ailment;
    this.rate = rate;
    this.retained = ailment.retainedBase;
    this.N = Math.max(1, this.retained.length - 1);
    this.scorch = ailment.scorchFraction || null;
    this.K = Math.max(1, Math.ceil(ailment.duration * rate + EPS)) + 1;
    this.readyUses = readyUses; // null, or (u) => uses until the joint source is ready again after firing at use u
    this.R = readyUses ? Math.max(1, readyUses.maxUses) : 1;
    const size = this.K * this.R * (this.N + 1);
    if (!(size <= MAX_CHAIN_CELLS)) throw new RangeError(`dummy recount chain for ${ailment.key} needs ${size} cells (cap ${MAX_CHAIN_CELLS})`);
    this.current = new Float64Array(size);
    this.next = new Float64Array(size);
    this.inactive = new Float64Array(this.R);
    this.inactiveNext = new Float64Array(this.R);
    this.inactive[0] = 1;
    this.u = 0;
    this.groupBase = new Float64Array(this.K);
    this.groupActive = new Float64Array(this.K);
    this.groupScorch = new Float64Array(this.K);
    this.groupEnd = new Float64Array(this.K).fill(-Infinity);
  }

  index(k, r, n) { return (k * this.R + r) * (this.N + 1) + n; }

  // Expected retained base, P(active) and Scorch stack fraction at time `time` (between uses).
  stats(time) {
    let base = 0, active = 0, scorch = 0;
    for (let k = 0; k < this.K; k++) {
      if (!(time < this.groupEnd[k] - EPS)) continue;
      base += this.groupBase[k]; active += this.groupActive[k]; scorch += this.groupScorch[k];
    }
    return { base, active, scorch };
  }

  nextExpiryAfter(time) {
    let best = Infinity;
    for (let k = 0; k < this.K; k++) {
      const end = this.groupEnd[k];
      if (this.groupActive[k] > 0 && end > time + EPS && end < best) best = end;
    }
    return best;
  }

  // Application attempt at use u (time u / rate). Returns the success mass and expected base after
  // success, plus the jointly tracked Reap's firing mass and base (r = 0 states that succeed).
  use(u) {
    const { rate, N, R, retained } = this;
    const time = this.useAt(u);
    const chanceActive = this.ailment.chance, chanceInactive = this.ailment.notActiveChance;
    const fireR = this.readyUses ? Math.max(0, this.readyUses(u) - 1) : 0;
    const next = this.next, inactiveNext = this.inactiveNext;
    next.fill(0); inactiveNext.fill(0);
    let successProb = 0, successBase = 0, fireProb = 0, fireBase = 0;
    const joint = Boolean(this.readyUses);
    for (let r = 0; r < R; r++) {
      const mass = this.inactive[r];
      if (!(mass > 0)) continue;
      const decremented = r > 0 ? r - 1 : 0;
      const ready = joint && r === 0;
      inactiveNext[decremented] += mass * (1 - chanceInactive);
      const succeeded = mass * chanceInactive;
      next[this.index(0, ready ? fireR : decremented, 1)] += succeeded;
      successProb += succeeded; successBase += succeeded * retained[1];
      if (ready) { fireProb += succeeded; fireBase += succeeded * retained[1]; }
    }
    const maxN = Math.min(N, this.u);
    for (let k = 0; k < this.K; k++) {
      if (!(this.groupActive[k] > 0)) continue;
      const end = this.useAt(this.u - k) + this.ailment.duration;
      const still = time < end - EPS;
      const chance = still ? chanceActive : chanceInactive;
      for (let r = 0; r < R; r++) {
        const decremented = r > 0 ? r - 1 : 0;
        const ready = joint && r === 0;
        const successR = ready ? fireR : decremented;
        const rowStart = this.index(k, r, 0);
        for (let n = 1; n <= maxN; n++) {
          const mass = this.current[rowStart + n];
          if (!(mass > 0)) continue;
          if (still) next[this.index(k + 1, decremented, n)] += mass * (1 - chance);
          else inactiveNext[decremented] += mass * (1 - chance);
          const after = still ? Math.min(N, n + 1) : 1;
          const succeeded = mass * chance;
          next[this.index(0, successR, after)] += succeeded;
          successProb += succeeded; successBase += succeeded * retained[after];
          if (ready) { fireProb += succeeded; fireBase += succeeded * retained[after]; }
        }
      }
    }
    [this.current, this.next] = [next, this.current];
    [this.inactive, this.inactiveNext] = [inactiveNext, this.inactive];
    this.u = u;
    this.regroup();
    return { successProb, successBase, fireProb, fireBase };
  }

  regroup() {
    const { N, R, retained, scorch } = this;
    const maxN = Math.min(N, this.u);
    for (let k = 0; k < this.K; k++) {
      let base = 0, active = 0, frac = 0;
      for (let r = 0; r < R; r++) {
        const rowStart = this.index(k, r, 0);
        for (let n = 1; n <= maxN; n++) {
          const mass = this.current[rowStart + n];
          if (!(mass > 0)) continue;
          base += mass * retained[n]; active += mass;
          if (scorch) frac += mass * scorch[n];
        }
      }
      this.groupBase[k] = base; this.groupActive[k] = active; this.groupScorch[k] = frac;
      this.groupEnd[k] = active > 0 ? this.useAt(this.u - k) + this.ailment.duration : -Infinity;
    }
  }
}

// Independent stacks (Wilt): every success adds a stack with its own timer, up to the limit.
// Mean-field, as in ailment-model.js, but on discrete uses: stacks = min(limit, chance × active uses).
class IndependentStacks {
  constructor(ailment, rate, useAt = (u) => u / rate) {
    this.ailment = ailment;
    this.rate = rate;
    this.useAt = useAt;
    this.u = 0;
    this.oldest = 1; // oldest use whose stack may still be active
  }
  activeUses(time) {
    let count = 0;
    for (let i = Math.max(1, this.oldest); i <= this.u; i++) if (time < this.useAt(i) + this.ailment.duration - EPS) count++;
    return count;
  }
  stats(time) {
    const count = this.activeUses(time);
    const chance = this.ailment.chance;
    const stacks = Math.min(this.ailment.limit, chance * count);
    return { base: stacks * this.ailment.averageApplication, active: count ? 1 - (1 - chance) ** count : 0, scorch: 0 };
  }
  nextExpiryAfter(time) {
    for (let i = Math.max(1, this.oldest); i <= this.u; i++) {
      const end = this.useAt(i) + this.ailment.duration;
      if (end > time + EPS) return end;
    }
    return Infinity;
  }
  use(u) {
    this.u = u;
    const time = this.useAt(u);
    while (this.oldest < u && !(time < this.useAt(this.oldest) + this.ailment.duration - EPS)) this.oldest++;
    const after = this.stats(time).base;
    return { successProb: this.ailment.chance, successBase: this.ailment.chance * after, fireProb: 0, fireBase: 0 };
  }
}

// Which ailment's success triggers an application Reap: "inflicting Ignite" → Ignite; otherwise the
// damaging ailment with the highest chance (the planner's successfulApplicationsPerSecond takes the max). A skill's own DoT is no
// ailment (wiring audit W2 gap 2, 2026-11-03: its buff record has no Ailment tag 5100001; inferred link).
function triggerAilmentIndex(source, ailments) {
  if (source.triggerKey) return ailments.findIndex((ailment) => ailment.key === source.triggerKey);
  if (source.trigger === "inflicting Ignite") return ailments.findIndex((ailment) => ailment.key === "ignite");
  let best = -1;
  ailments.forEach((ailment, index) => { if (!ailment.silent && !ailment.skillDot && (best < 0 || ailment.chance > ailments[best].chance)) best = index; });
  return best;
}

// ---------------------------------------------------------------------------------------------
// Time factors shared by the timeline and the steady-state figure

function channelFactorFn(channel, rate) {
  if (!channel || !(channel.perStackSupercharge > 0)) return { at: () => 1, fullAt: 0 };
  const supercharge = (stacks) => 1 + (channel.superchargeFlat + channel.perStackSupercharge * stacks) / 100;
  const full = supercharge(channel.maxStacks);
  const fullAt = Math.max(0, (channel.maxStacks - channel.minStacks) / rate);
  return { at: (time) => supercharge(Math.min(channel.maxStacks, channel.minStacks + rate * time)) / full, fullAt };
}

// Timed and stacking effects on the clean dummy or the player (inputs.timedEffects = { parts, shares }, built by
// src/timed-effects.js recountTimedEffects; evaluated here so this module stays import-free): Ice Puppet's Ice Cage (1 stack
// per second from t = 0), Melting Flames, Witch Antelope's Paralysis, Bitter Thunder, … Each part is a piecewise-constant
// factor relative to the sustained value the ledgers hold (`edges[i]` starts segment i, `factors[i]` its factor); a source
// (its share: { hit, types }) takes Σ over its types of share × Π the parts that reach that type. The steady state is 1.
const ELEMENTAL_TYPES = new Set(["Fire", "Cold", "Lightning"]);
function timedEffectsFn(timed) {
  const parts = (timed?.parts || []).filter((part) => Array.isArray(part.edges) && part.edges.length && part.edges.length === part.factors?.length);
  const shares = timed?.shares || {};
  if (!parts.length) return { at: () => 1, shareAt: () => 1, boundaries: [] };
  const factorOf = (part, time) => {
    let index = 0;
    while (index + 1 < part.edges.length && part.edges[index + 1] <= time + EPS) index++;
    return part.factors[index];
  };
  const shareAt = (share, time) => {
    // A part with `keys` reaches only the sources whose share carries one of them (one skill's hits; src/timed-effects.js).
    const reaching = parts.filter((part) => (!part.keys || part.keys.includes(share?.key)) && (part.reach === "hit" ? share?.hit : part.reach === "dot" ? !share?.hit : true));
    if (!reaching.length) return 1;
    const types = Object.entries(share?.types || {}).filter(([, value]) => Number.isFinite(value) && value > 0);
    const product = (type) => reaching.filter((part) => !part.type || part.type === type || (part.type === "Elemental" && ELEMENTAL_TYPES.has(type))).reduce((factor, part) => factor * factorOf(part, time), 1);
    return types.reduce((sum, [type, value]) => sum + value * product(type), 0) + Math.max(0, 1 - types.reduce((sum, [, value]) => sum + value, 0)) * product(null);
  };
  const boundaries = [...new Set(parts.flatMap((part) => part.edges.filter((edge) => edge > EPS)))].sort((a, b) => a - b);
  return { at: (key, time) => shares[key] ? shareAt(shares[key], time) : 1, shareAt, boundaries };
}

// Ratio of the ailment's resistance factor to the steady-state factor its damagePerBase uses.
function maxAfflictionRatio(maxAffliction, fraction) {
  if (!maxAffliction) return 1;
  return maxAffliction.ratioAtNone + (maxAffliction.ratioAtFull - maxAffliction.ratioAtNone) * fraction;
}

// Affliction damage-taken factor relative to the configured rating.
function afflictionRelative(affliction, rating) {
  if (!affliction || !(affliction.perPoint > 0)) return 1;
  return (1 + rating * affliction.perPoint) / (1 + affliction.configuredRating * affliction.perPoint);
}

// ---------------------------------------------------------------------------------------------
// Timeline

/**
 * Simulate the dummy for `seconds` from engagement (clean dummy, own buffs as configured).
 * @returns {{ stepSeconds, seconds, total: Float64Array, bySource: Record<string, Float64Array>,
 *   firstDamageSeconds: number, options, assumptions: object[] }}
 */
export function simulateDummyTimeline(inputs, { seconds = 60, stepSeconds = RECOUNT_STEP_SECONDS } = {}) {
  assertFiniteInputs(inputs);
  if (!(seconds > 0) || !(stepSeconds > 0) || !Number.isFinite(seconds) || !Number.isFinite(stepSeconds)) throw new RangeError("dummy recount seconds and step must be positive and finite");
  const options = normalizeRecountOptions(inputs.options);
  const tick = options.reapTiming === "tick";
  const simulatedAffliction = options.afflictionModel === "simulated";
  const { rate, hits = null } = inputs;
  // Use schedule: u / rate by default; with inputs.firstUseSeconds (a skill whose opening cast completes before a
  // whole interval has passed, e.g. a Terra skill recast every 6 s) uses fall at first + (u − 1) / rate. The ailment
  // chains take the same schedule for their expiry times.
  const firstUse = Number.isFinite(inputs.firstUseSeconds) && inputs.firstUseSeconds >= 0 ? inputs.firstUseSeconds : null;
  const useAt = usesAt(rate, firstUse);
  const ailments = inputs.ailments || [];
  // An ailment on its own schedule (a secondary skill's DoT); null on the main one.
  const ownUses = ailments.map((ailment) => {
    if (!ailment.uses) return null;
    const first = Number.isFinite(ailment.uses.firstUseSeconds) && ailment.uses.firstUseSeconds >= 0 ? ailment.uses.firstUseSeconds : null;
    return { rate: ailment.uses.rate, useAt: usesAt(ailment.uses.rate, first), lastUse: lastUseIn(ailment.uses.rate, first, seconds), nextUse: 1 };
  });
  const chainRate = (index) => ownUses[index]?.rate ?? rate;
  const chainUseAt = (index) => ownUses[index]?.useAt ?? useAt;
  const reaping = (inputs.reaping || []).filter((source) => APPLICATION_TRIGGERS.has(source.trigger) || source.trigger === "full Affliction" || source.trigger === "dealing damage over time");
  const afflictionPerSecond = Math.max(0, inputs.afflictionPerSecond || 0);
  const bins = Math.max(1, Math.ceil(seconds / stepSeconds - EPS));
  const binAt = (time) => Math.min(bins - 1, Math.max(0, Math.floor(time / stepSeconds + EPS)));

  const bySource = {};
  if (hits) bySource.beam = new Float64Array(bins);
  // Generic spell hits (src/skill-hit-model.js): expected damage per use × own rate, as a continuous rate from the first use on.
  const skillHits = (inputs.skillHits || []).filter((hit) => hit.rate > 0);
  for (const hit of skillHits) bySource[hit.key] = new Float64Array(bins);
  for (const ailment of ailments) if (!ailment.silent) bySource[ailment.key] = new Float64Array(bins);
  for (const source of reaping) bySource[source.key] = new Float64Array(bins);

  // Joint readiness for the first application source triggered by a shared-timer ailment.
  const recoveryOf = (source) => Math.max(source.recoverySeconds || 0, source.floorSeconds || 0, 1e-6);
  const triggers = reaping.map((source) => APPLICATION_TRIGGERS.has(source.trigger) ? triggerAilmentIndex(source, ailments) : -1);
  let jointIndex = reaping.findIndex((source, index) => triggers[index] >= 0 && ailments[triggers[index]].stacking !== "independent");
  const readyUsesFor = (source, useRate) => {
    const recovery = recoveryOf(source);
    // Continuous: estimateApplicationReapingOpening's ceil(recovery × rate). Tick: the ready time waits for a tick.
    const fn = tick
      ? (u) => Math.max(1, Math.ceil(useRate * snapToTick(u / useRate + recovery) - EPS) - u)
      : () => Math.max(1, Math.ceil(recovery * useRate - EPS));
    fn.maxUses = Math.max(1, Math.ceil((recovery + (tick ? RECOUNT_STEP_SECONDS : 0)) * useRate - EPS) + (tick ? 1 : 0));
    return fn;
  };
  // Joint tracking multiplies the chain by the Reap's recovery in uses; past the cell cap it uses the mean-field share.
  let jointDropped = null;
  if (jointIndex >= 0 && !(sharedChainCells(ailments[triggers[jointIndex]], chainRate(triggers[jointIndex]), readyUsesFor(reaping[jointIndex], chainRate(triggers[jointIndex])).maxUses) <= MAX_CHAIN_CELLS)) {
    jointDropped = reaping[jointIndex].source;
    jointIndex = -1;
  }
  const chains = ailments.map((ailment, index) => ailment.stacking === "independent"
    ? new IndependentStacks(ailment, chainRate(index), chainUseAt(index))
    : new SharedTimerChain(ailment, chainRate(index), jointIndex >= 0 && triggers[jointIndex] === index ? readyUsesFor(reaping[jointIndex], chainRate(index)) : null, chainUseAt(index)));
  const scorchChainIndex = hits?.resistance?.kind === "scorch" ? ailments.findIndex((ailment) => ailment.key === hits.resistance.chainKey) : -1;

  const channel = channelFactorFn(inputs.channel, rate);
  const firstMaxSeconds = Math.min(...ailments.map((ailment) => ailment.maxAffliction?.firstMaxSeconds ?? Infinity));
  let affliction = 0;
  // Magmaskull (src/initial-affliction.js): the first infliction puts the simulated rating at N, once per fight, as the tick engine does.
  let initialAffliction = simulatedAffliction && Number.isFinite(inputs.initialAffliction?.value) ? Math.max(0, Math.min(100, inputs.initialAffliction.value)) : null;
  const maxFraction = (ailment, time, rating) => !ailment.maxAffliction ? 0
    : simulatedAffliction ? (rating >= 100 - EPS ? 1 : 0)
      : (time >= ailment.maxAffliction.firstMaxSeconds - EPS ? ailment.maxAffliction.steadyFraction : 0);
  // Time-limited DoT multipliers from the inputs (e.g. Windwalk's 4 s window): apply to every DoT and to the Reaps that copy it.
  const timedLayers = (inputs.timedDotLayers || []).filter((layer) => Number.isFinite(layer.startSeconds) && layer.durationSeconds > 0 && layer.factor > 0);
  const timedAt = (time) => timedLayers.reduce((factor, layer) => factor * (time >= layer.startSeconds - EPS && time < layer.startSeconds + layer.durationSeconds - EPS ? layer.factor : 1), 1);
  const timed = timedEffectsFn(inputs.timedEffects);
  const dotFactor = (ailment, time, rating) => ailment.damagePerBase * channel.at(time) * timedAt(time) * timed.at(ailment.key, time)
    * maxAfflictionRatio(ailment.maxAffliction, maxFraction(ailment, time, rating))
    * (simulatedAffliction ? afflictionRelative(ailment.affliction, rating) : 1);
  const hitResistance = (time) => {
    const resistance = hits.resistance || { kind: "fixed", scale: 1 };
    if (resistance.kind !== "scorch") return resistance.scale ?? 1;
    const fraction = scorchChainIndex >= 0 ? chains[scorchChainIndex].stats(time).scorch : 0;
    return resistance.baseScale + (resistance.activeScale - resistance.baseScale) * fraction;
  };
  const anyDotActive = (time) => chains.some((chain, index) => !ailments[index].silent && chain.stats(time).active > 1e-12);
  // Damage one Reap deals for each unit of expected base, per ailment, at `time`.
  const reapPerBase = (source, ailment, time, rating) => {
    const seconds = source.seconds?.[ailment.key];
    if (!(seconds > 0) || ailment.silent) return 0;
    const settle = source.settle?.[ailment.key] || {};
    const full = source.trigger === "full Affliction";
    const resistance = settle.resistance ?? maxAfflictionRatio(ailment.maxAffliction, maxFraction(ailment, time, full ? 100 : rating));
    const afflictionScale = full ? (settle.affliction ?? 1) : (simulatedAffliction ? afflictionRelative(ailment.affliction, rating) : 1);
    return seconds * ailment.damagePerBase * channel.at(time) * timedAt(time) * timed.at(ailment.key, time) * resistance * afflictionScale * (settle.trueDamage ?? 1);
  };

  // Reap state.
  // A source can be held until a start-up time (a max-channeled-stacks Reap waits for the opening channel).
  const readyAt = reaping.map((source) => Math.max(0, source.firstReadySeconds || 0));
  const meanField = reaping.map(() => ({ readyMass: 1, pending: [] }));
  // tick-reap-any-source-removal (proven, research/oq-r1-r2-rea-2026-11-04.md R1.6): a full-Affliction remover's removal answers every Reap of
  // yours, so another source's Reap takes its percentage off the rating too, in the share that fired (the follower's Reaps are its own unit's).
  const removalsOnReap = reaping.filter((source) => source.trigger === "full Affliction").map((source) => Math.max(0, Math.min(100, source.afflictionRemovedPercent ?? 100)));
  const removeOnReap = (source, mass) => {
    if (source.trigger === "full Affliction" || source.holder === "follower" || !removalsOnReap.length || !(mass > 0)) return;
    for (const removed of removalsOnReap) affliction = Math.max(0, affliction - Math.min(affliction, removed) * Math.min(1, mass));
  };
  // follower-affix-pain-amplification (research/oq-r1-r2-rea-2026-11-04.md R1.9): the follower skill's damage events clear their amount off the one
  // rating on the dummy, at most once per gate, while it is at least the minimum (as src/tick-engine.js clearAffliction).
  const clears = simulatedAffliction ? (inputs.afflictionClears || []).filter((item) => item.amount > 0 && item.eventSeconds > 0).map((item) => ({ item, next: item.firstSeconds || 0, gateUntil: -Infinity })) : [];
  const runClears = (time) => {
    for (const clear of clears) {
      while (clear.next <= time + EPS) {
        if (clear.next >= clear.gateUntil - EPS && affliction >= (clear.item.minRating ?? clear.item.amount) - EPS) { affliction = Math.max(0, affliction - clear.item.amount); clear.gateUntil = clear.next + (clear.item.gateSeconds || 0); }
        clear.next += clear.item.eventSeconds;
      }
    }
  };
  const accruing = (time) => afflictionPerSecond > 0 && (options.afflictionAccrual === "windowStart" || anyDotActive(time));
  const timedDue = (index, time) => {
    const source = reaping[index];
    let due;
    if (source.trigger === "full Affliction") {
      if (!(afflictionPerSecond > 0)) return Infinity;
      const reachAt = affliction >= 100 - EPS ? time : accruing(time) ? time + (100 - affliction) / afflictionPerSecond : Infinity;
      due = Math.max(readyAt[index], reachAt);
    } else if (source.trigger === "dealing damage over time") {
      due = anyDotActive(time) ? Math.max(readyAt[index], time) : Infinity;
    } else return Infinity;
    return tick && Number.isFinite(due) ? snapToTick(due) : due;
  };

  const lastUse = lastUseIn(rate, firstUse, seconds);
  let nextUse = 1;
  let time = 0;
  let firstDamageSeconds = hits ? useAt(1) : Infinity;
  let guard = 0;
  const guardLimit = 50 * (bins + (lastUse + ownUses.reduce((sum, own) => sum + (own?.lastUse ?? 0), 0)) * 8 + 1000);
  // What a use's applications set off: `results` by ailment, null for those it did not attempt.
  const afterApplications = (time, bin, results) => {
    if (!hits && !Number.isFinite(firstDamageSeconds) && results.some((result, index) => result && !ailments[index].silent && result.successProb > 0)) firstDamageSeconds = time;
    reaping.forEach((source, index) => {
      const triggerIndex = triggers[index];
      if (triggerIndex < 0) return;
      const result = results[triggerIndex];
      if (!result) return;
      const others = ailments.reduce((sum, ailment, j) => j === triggerIndex ? sum : sum + chains[j].stats(time).base * reapPerBase(source, ailment, time, affliction), 0);
      const triggerPerBase = reapPerBase(source, ailments[triggerIndex], time, affliction);
      if (index === jointIndex) {
        if (result.fireProb > 0) { bySource[source.key][bin] += result.fireBase * triggerPerBase + result.fireProb * others; removeOnReap(source, result.fireProb); }
        return;
      }
      const state = meanField[index];
      state.pending = state.pending.filter((entry) => { if (entry.at <= time + EPS) { state.readyMass += entry.mass; return false; } return true; });
      if (!(result.successProb > 0) || !(state.readyMass > 0)) return;
      const fired = state.readyMass * result.successProb;
      bySource[source.key][bin] += fired * (result.successBase / result.successProb * triggerPerBase + others);
      state.readyMass -= fired;
      removeOnReap(source, fired);
      const recovery = recoveryOf(source);
      state.pending.push({ at: tick ? snapToTick(time + recovery) : time + recovery, mass: fired });
    });
  };
  for (;;) {
    if (++guard > guardLimit) throw new Error("dummy recount event loop did not terminate");
    // 1. Events at `time`: a beam use (hit, applications, application Reaps), then due timed Reaps.
    if (nextUse <= lastUse && Math.abs(useAt(nextUse) - time) <= EPS) {
      const u = nextUse++;
      const bin = binAt(time);
      if (hits) {
        const damage = (hits.perUse + (hits.cycleUses > 0 && u % hits.cycleUses === 0 ? hits.explosion : 0)) * hitResistance(time) * channel.at(time) * timed.at("beam", time);
        bySource.beam[bin] += damage;
      }
      afterApplications(time, bin, chains.map((chain, index) => ownUses[index] ? null : chain.use(u)));
    }
    ownUses.forEach((own, index) => {
      if (!own || own.nextUse > own.lastUse || Math.abs(own.useAt(own.nextUse) - time) > EPS) return;
      const u = own.nextUse++;
      afterApplications(time, binAt(time), chains.map((chain, j) => j === index ? chain.use(u) : null));
    });
    // A timed Reap due exactly at the end belongs to the next window (the timeline is [0, seconds)).
    for (let index = 0; time < seconds - EPS && index < reaping.length; index++) {
      const source = reaping[index];
      if (APPLICATION_TRIGGERS.has(source.trigger)) continue;
      if (!(timedDue(index, time) <= time + EPS)) continue;
      const bin = binAt(time);
      bySource[source.key][bin] += ailments.reduce((sum, ailment, j) => sum + chains[j].stats(time).base * reapPerBase(source, ailment, time, affliction), 0);
      readyAt[index] = time + recoveryOf(source);
      if (source.trigger === "full Affliction") affliction = Math.max(0, affliction - Math.max(0, Math.min(100, source.afflictionRemovedPercent ?? 100)));
      else removeOnReap(source, 1);
    }
    runClears(time);
    if (time >= seconds - EPS) break;

    // 2. Next event.
    let nextTime = seconds;
    const consider = (candidate) => { if (candidate > time + EPS && candidate < nextTime) nextTime = candidate; };
    if (nextUse <= lastUse) consider(useAt(nextUse));
    for (const own of ownUses) if (own && own.nextUse <= own.lastUse) consider(own.useAt(own.nextUse));
    for (const clear of clears) consider(clear.next);
    consider((Math.floor(time / stepSeconds + EPS) + 1) * stepSeconds);
    for (const chain of chains) consider(chain.nextExpiryAfter(time));
    const isAccruing = accruing(time);
    if (isAccruing && initialAffliction !== null) { affliction = Math.min(100, affliction + initialAffliction); initialAffliction = null; }
    if (isAccruing && affliction < 100 - EPS) consider(time + (100 - affliction) / afflictionPerSecond);
    consider(channel.fullAt);
    for (const edge of timed.boundaries) consider(edge);
    if (!simulatedAffliction) consider(firstMaxSeconds);
    for (let index = 0; index < reaping.length; index++) consider(timedDue(index, time));

    // 3. Integrate continuous damage over [time, nextTime]: rates are constant (or linear) here.
    const dt = nextTime - time;
    const mid = time + dt / 2;
    const bin = binAt(mid);
    const ratingMid = isAccruing ? Math.min(100, affliction + afflictionPerSecond * dt / 2) : affliction;
    if (hits && hits.residualDps) bySource.beam[bin] += hits.residualDps * dt * hitResistance(mid) * channel.at(mid) * timed.at("beam", mid);
    for (const hit of skillHits) { const from = Math.max(time, Number.isFinite(hit.firstUseSeconds) ? hit.firstUseSeconds : 1 / hit.rate); if (nextTime > from) bySource[hit.key][bin] += hit.perUse * hit.rate * (nextTime - from) * timed.at(hit.key, (from + nextTime) / 2); }
    ailments.forEach((ailment, index) => {
      if (ailment.silent) return;
      const base = chains[index].stats(mid).base;
      if (base > 0) bySource[ailment.key][bin] += base * dotFactor(ailment, mid, ratingMid) * dt;
    });
    if (isAccruing) affliction = Math.min(100, affliction + afflictionPerSecond * dt);
    time = nextTime;
  }

  // Scheduled hits (Minions): explicit events binned at their landing time.
  for (const source of inputs.scheduledHits || []) {
    const series = bySource[source.key] = new Float64Array(bins);
    for (const event of source.events || []) if (event.time >= 0 && event.time < bins * stepSeconds - EPS) series[binAt(event.time)] += event.damage * (event.timedShare ? timed.shareAt(event.timedShare, event.time) : timed.at(source.key, event.time));
  }
  // Ill Omen (src/ill-omen.js, best-case condition): True Damage = factor × the damage that builds stacks in each bin
  // (every damage over time and every Reap; hits do not).
  const illOmenFactor = inputs.illOmen?.factor > 0 ? inputs.illOmen.factor : 0;
  let illOmenBuilders = [];
  if (illOmenFactor) {
    const builders = illOmenBuilders = [...ailments.filter((ailment) => !ailment.silent).map((ailment) => ailment.key), ...reaping.map((source) => source.key)];
    const series = bySource.illOmen = new Float64Array(bins);
    for (const key of builders) for (let b = 0; b < bins; b++) series[b] += bySource[key][b] * illOmenFactor;
  }
  // Spacetime Turbulence (Youga – Spacetime Elapse, hero trait audit B4, Q-H6; src/youga-spacetime.js): at each move the recorded
  // share of every DoT and Reap series since the previous move lands at once.
  const turbulence = inputs.turbulence?.intervalSeconds > 0 ? { ...inputs.turbulence, builders: [...ailments.filter((ailment) => !ailment.silent).map((ailment) => ailment.key), ...reaping.map((source) => source.key)] } : null;
  if (turbulence) bySource.turbulence = turbulenceSeries(bySource, turbulence, bins, stepSeconds);
  const total = new Float64Array(bins);
  for (const series of Object.values(bySource)) for (let b = 0; b < bins; b++) total[b] += series[b];
  if (!Number.isFinite(firstDamageSeconds)) {
    const first = total.findIndex((value) => value > 0);
    firstDamageSeconds = first >= 0 ? first * stepSeconds : Infinity;
  }
  return {
    stepSeconds, seconds: bins * stepSeconds, total, bySource, firstDamageSeconds, options,
    // Ill Omen's factor and the series it is built from (metadata for excludeRecountSources; no figure reads it).
    ...(illOmenFactor ? { illOmen: { factor: illOmenFactor, builders: illOmenBuilders } } : {}),
    ...(turbulence ? { turbulence } : {}),
    labels: Object.fromEntries([...(hits ? [["beam", "Beam hits"]] : []), ...skillHits.map((hit) => [hit.key, hit.label || hit.key]), ...(inputs.scheduledHits || []).map((source) => [source.key, source.label || source.key]), ...ailments.filter((a) => !a.silent).map((a) => [a.key, a.name || a.key]), ...reaping.map((s) => [s.key, `Reaping: ${s.source}`]), ...(illOmenFactor ? [["illOmen", inputs.illOmen.label || "Ill Omen"]] : []), ...(turbulence ? [["turbulence", turbulence.label || "Spacetime Turbulence"]] : [])]),
    assumptions: [...recountOptionAssumptions(options), ...(inputs.assumptions || []), ...(jointDropped ? [{ id: "applicationReapReadiness", value: "mean-field", text: `${jointDropped}: readiness uses a mean-field ready share (joint tracking would exceed ${MAX_CHAIN_CELLS} chain cells).` }] : []), ...(jointIndex >= 0 ? [{ id: "applicationReapReadiness", value: "joint", text: `${reaping[jointIndex].source}: readiness tracked jointly with ${ailments[triggers[jointIndex]].name || ailments[triggers[jointIndex]].key}; further application Reaps use a mean-field ready share.` }] : [])]
  };
}

// ---------------------------------------------------------------------------------------------
// Windows and recount fields

/** Damage and DPS over [start, start + seconds) of a timeline, in total and by source. */
export function windowTotals(timeline, seconds, { start = 0 } = {}) {
  const step = timeline.stepSeconds;
  const first = Math.max(0, Math.round(start / step));
  const last = Math.min(timeline.total.length, first + Math.round(seconds / step));
  const sum = (series) => { let total = 0; for (let b = first; b < last; b++) total += series[b]; return total; };
  const totalDamage = sum(timeline.total);
  const span = (last - first) * step;
  const bySource = Object.fromEntries(Object.entries(timeline.bySource).map(([key, series]) => {
    const damage = sum(series);
    return [key, { totalDamage: damage, dps: span > 0 ? damage / span : 0 }];
  }));
  return { start: first * step, seconds: span, totalDamage, dps: span > 0 ? totalDamage / span : 0, bySource };
}

/**
 * View-only what-if: the timeline without the `excluded` source keys (the recount card's click-to-exclude).
 * The other series are kept as they are and the total is re-summed from them. Ill Omen is factor × the
 * damage that builds its stacks, so it is rebuilt from the included builder series (excluding a DoT or a
 * Reap removes its Ill Omen part too); excluding "illOmen" removes only Ill Omen. Returns the timeline
 * itself when nothing present is excluded.
 */
export function excludeRecountSources(timeline, excluded = []) {
  if (!timeline?.bySource) return timeline;
  const skip = new Set([...excluded].filter((key) => key in timeline.bySource));
  if (!skip.size) return timeline;
  const bins = timeline.total.length;
  const bySource = {};
  for (const [key, series] of Object.entries(timeline.bySource)) {
    if (skip.has(key)) continue;
    const ill = timeline.illOmen;
    if (key === "illOmen" && ill?.factor > 0 && Array.isArray(ill.builders)) {
      const rebuilt = new Float64Array(bins);
      for (const builder of ill.builders) {
        const source = skip.has(builder) ? null : timeline.bySource[builder];
        if (source) for (let b = 0; b < bins; b++) rebuilt[b] += source[b] * ill.factor;
      }
      bySource[key] = rebuilt;
    } else if (key === "turbulence" && timeline.turbulence) {
      // Spacetime Turbulence re-deals the included builders' record (hero trait audit B4).
      bySource[key] = turbulenceSeries(Object.fromEntries(Object.entries(timeline.bySource).filter(([name]) => !skip.has(name))), timeline.turbulence, bins, timeline.stepSeconds);
    } else bySource[key] = series;
  }
  const total = new Float64Array(bins);
  for (const series of Object.values(bySource)) for (let b = 0; b < bins; b++) total[b] += series[b];
  return { ...timeline, total, bySource, excluded: [...skip] };
}

/**
 * DPS that `excluded` takes away from a per-source sum, Ill Omen's share of an excluded builder included;
 * 0 when nothing present is excluded. The recount card subtracts it from Total modeled DPS.
 * `parts` is that sum by recount source key; a `reaping` entry is the total of every "reap:*" source and is
 * split over them by their steady-state DPS. Without `parts`, the steady state (recount.steady.bySource).
 */
export function excludedSteadyDps(recount, excluded = [], { parts } = {}) {
  const steady = recount?.steady?.bySource || {};
  let byKey = parts ? { ...parts } : steady;
  if (parts && "reaping" in parts) {
    delete byKey.reaping;
    const reapKeys = Object.keys(recount?.timeline?.bySource || steady).filter((key) => key.startsWith("reap:"));
    const weight = reapKeys.reduce((sum, key) => sum + (steady[key] || 0), 0);
    for (const key of reapKeys) byKey[key] = (byKey[key] || 0) + parts.reaping * (weight > 0 ? (steady[key] || 0) / weight : 1 / reapKeys.length);
  }
  const skip = new Set([...excluded].filter((key) => key in byKey));
  if (!skip.size) return 0;
  const ill = recount?.timeline?.illOmen;
  let removed = 0;
  for (const key of skip) removed += byKey[key] || 0;
  if ("illOmen" in byKey && !skip.has("illOmen") && ill?.factor > 0 && Array.isArray(ill.builders)) {
    for (const builder of ill.builders) if (skip.has(builder)) removed += (byKey[builder] || 0) * ill.factor;
  }
  return removed;
}

/**
 * The recount's fields for a span (seconds from the recount start).
 * - averageDps: "Average DPS in a span of time".
 * - highest5sDps: "Highest DPS in 5s", rolling windows ending every `sampleSeconds`;
 *   highest5sDpsContinuous checks a window ending at every bin.
 * - last5sDps: "Average DPS in 5s". Settled in-game (user, 2026-10-09): the field updates continuously
 *   and always covers the last 5 s. first5sDps and meanRolling5sDps are diagnostics only.
 */
export function summarizeRecount(timeline, { span, windowSeconds = 5, sampleSeconds = 1, start } = {}) {
  const step = timeline.stepSeconds;
  const recountStart = start ?? timeline.options?.recountStart ?? DEFAULT_RECOUNT_OPTIONS.recountStart;
  if (!OPTION_VALUES.recountStart.includes(recountStart)) throw new RangeError(`recount start must be one of ${OPTION_VALUES.recountStart.join(", ")}`);
  const startBin = recountStart === "firstDamage" && Number.isFinite(timeline.firstDamageSeconds)
    ? Math.min(timeline.total.length - 1, Math.floor(timeline.firstDamageSeconds / step + EPS)) : 0;
  const available = timeline.total.length - startBin;
  const requested = span === undefined ? available : Math.round(span / step);
  if (!(requested > 0)) throw new RangeError("recount span must be positive");
  const bins = Math.min(requested, available);
  const prefix = new Float64Array(bins + 1);
  for (let b = 0; b < bins; b++) prefix[b + 1] = prefix[b] + timeline.total[startBin + b];
  // A span shorter than the window uses the span itself as the window.
  const window = Math.max(1, Math.min(bins, Math.round(windowSeconds / step)));
  const windowLength = window * step;
  const rolling = (end) => (prefix[end] - prefix[end - window]) / windowLength;
  let highestContinuous = 0, highestSampled = 0, rollingSum = 0, rollingCount = 0;
  for (let end = window; end <= bins; end++) {
    const value = rolling(end);
    if (value > highestContinuous) highestContinuous = value;
    rollingSum += value; rollingCount++;
  }
  const sampleBins = Math.max(1, Math.round(sampleSeconds / step));
  for (let end = window; end <= bins; end += sampleBins) highestSampled = Math.max(highestSampled, rolling(end));
  const spanSeconds = bins * step;
  const fields = {
    averageDps: prefix[bins] / spanSeconds,
    highest5sDps: highestSampled,
    last5sDps: rolling(bins)
  };
  return {
    span: spanSeconds,
    truncated: requested > available,
    start: recountStart,
    startSeconds: startBin * step,
    windowSeconds: windowLength,
    totalDamage: prefix[bins],
    ...fields,
    highest5sDpsContinuous: highestContinuous,
    first5sDps: rolling(window),
    meanRolling5sDps: rollingCount ? rollingSum / rollingCount : 0
  };
}

// ---------------------------------------------------------------------------------------------
// Steady state: the stationary expectation of the same model (long-run DPS)

// Stationary statistics of a shared-timer chain. After a success, the j-th later use still finds the
// ailment active when j / rate < duration (J such uses); the run breaks with q = (1 − c)^J. The number
// of successes in the current run is geometric with parameter q, independent of the gap that follows.
function stationaryChain(ailment, rate) {
  const c = ailment.chance, c0 = ailment.notActiveChance, duration = ailment.duration;
  // J = the largest j with j / rate < duration − EPS: closed form, then a bounded float correction.
  let J = Math.max(0, Math.ceil((duration - EPS) * rate) - 1);
  while (J > 0 && !(J / rate < duration - EPS)) J--;
  while ((J + 1) / rate < duration - EPS) J++;
  let survive = 1, activeTime = 0, uses = 0;
  // Terms are zero once survive (or c) is zero, so stopping there leaves the sums unchanged.
  for (let j = 1; j <= J && c > 0 && survive !== 0; j++) {
    activeTime += survive * c * j / rate;
    uses += survive * c * j;
    survive *= 1 - c;
  }
  const q = survive;
  activeTime += q * duration;
  uses += q > 0 ? q * (J + (c0 > 0 ? 1 / c0 : Infinity)) : 0;
  const perUseSuccess = Number.isFinite(uses) && uses > 0 ? 1 / uses : 0;
  const atSuccess = (values, limit) => {
    const N = values.length - 1;
    let total = 0, weight = q;
    for (let n = 1; n < N; n++) { total += weight * values[n]; weight *= 1 - q; }
    return total + (1 - q) ** (N - 1) * (limit ?? values[N]);
  };
  // Time average: successes per second × value retained after a success × active time per success.
  const timeAverage = (values, limit) => rate * perUseSuccess * activeTime * atSuccess(values, limit);
  return { perUseSuccess, atSuccess, timeAverage };
}

function stationaryIndependent(ailment, rate) {
  const usesInDuration = ailment.duration * rate;
  const whole = Math.floor(usesInDuration + EPS);
  const fraction = Math.max(0, usesInDuration - whole);
  const stacks = (count) => Math.min(ailment.limit, ailment.chance * count);
  const base = ((1 - fraction) * stacks(whole) + fraction * stacks(whole + 1)) * ailment.averageApplication;
  return { perUseSuccess: ailment.chance, timeBase: base, successBase: base };
}

/** Long-run DPS of the model by source (configured Affliction; see `approximate`). */
export function steadyState(inputs) {
  assertFiniteInputs(inputs);
  const options = normalizeRecountOptions(inputs.options);
  const { rate, hits = null } = inputs;
  const ailments = inputs.ailments || [];
  const tick = options.reapTiming === "tick";
  const stats = ailments.map((ailment) => {
    if (ailment.stacking === "independent") return stationaryIndependent(ailment, attemptRate(ailment, rate));
    const chain = stationaryChain(ailment, attemptRate(ailment, rate));
    return {
      perUseSuccess: chain.perUseSuccess,
      timeBase: chain.timeAverage(ailment.retainedBase, ailment.retainedLimit),
      successBase: chain.atSuccess(ailment.retainedBase, ailment.retainedLimit),
      scorch: ailment.scorchFraction ? chain.timeAverage(ailment.scorchFraction) : 0
    };
  });
  const steadyRatio = (ailment) => ailment.maxAffliction ? maxAfflictionRatio(ailment.maxAffliction, ailment.maxAffliction.steadyFraction) : 1;
  const bySource = {};
  if (hits) {
    const resistance = hits.resistance || { kind: "fixed", scale: 1 };
    const scorchIndex = resistance.kind === "scorch" ? ailments.findIndex((ailment) => ailment.key === resistance.chainKey) : -1;
    const scale = resistance.kind !== "scorch" ? resistance.scale ?? 1
      : resistance.baseScale + (resistance.activeScale - resistance.baseScale) * (scorchIndex >= 0 ? stats[scorchIndex].scorch : 0);
    bySource.beam = (rate * (hits.perUse + (hits.cycleUses > 0 ? hits.explosion / hits.cycleUses : 0)) + (hits.residualDps || 0)) * scale;
  }
  for (const hit of (inputs.skillHits || []).filter((item) => item.rate > 0)) bySource[hit.key] = hit.perUse * hit.rate;
  for (const source of inputs.scheduledHits || []) bySource[source.key] = source.steadyDps || 0;
  ailments.forEach((ailment, index) => { if (!ailment.silent) bySource[ailment.key] = stats[index].timeBase * ailment.damagePerBase * steadyRatio(ailment); });
  const afflictionPerSecond = Math.max(0, inputs.afflictionPerSecond || 0);
  const quantize = (interval) => tick ? Math.max(RECOUNT_STEP_SECONDS, Math.ceil(interval / RECOUNT_STEP_SECONDS - 1e-6) * RECOUNT_STEP_SECONDS) : interval;
  for (const source of inputs.reaping || []) {
    const recovery = Math.max(source.recoverySeconds || 0, source.floorSeconds || 0, 1e-6);
    const perBase = (ailment) => {
      const seconds = source.seconds?.[ailment.key];
      if (!(seconds > 0) || ailment.silent) return 0;
      const settle = source.settle?.[ailment.key] || {};
      const full = source.trigger === "full Affliction";
      return seconds * ailment.damagePerBase * (settle.resistance ?? steadyRatio(ailment)) * (full ? settle.affliction ?? 1 : 1) * (settle.trueDamage ?? 1);
    };
    const timeValue = ailments.reduce((sum, ailment, index) => sum + stats[index].timeBase * perBase(ailment), 0);
    let interval = Infinity, value = timeValue;
    if (source.trigger === "full Affliction") {
      if (afflictionPerSecond > 0) interval = quantize(Math.max(recovery, Math.max(0, Math.min(100, source.afflictionRemovedPercent ?? 100)) / afflictionPerSecond));
    } else if (source.trigger === "dealing damage over time") {
      if (timeValue > 0) interval = quantize(recovery);
    } else if (APPLICATION_TRIGGERS.has(source.trigger)) {
      const triggerIndex = triggerAilmentIndex(source, ailments);
      const p = triggerIndex >= 0 ? stats[triggerIndex].perUseSuccess : 0;
      if (p > 0) {
        const useRate = attemptRate(ailments[triggerIndex], rate);
        const readyUses = Math.max(1, Math.ceil(recovery * useRate - EPS));
        interval = (readyUses - 1 + 1 / p) / useRate;
        value = ailments.reduce((sum, ailment, index) => sum + (index === triggerIndex ? stats[index].successBase : stats[index].timeBase) * perBase(ailment), 0);
      }
    }
    bySource[source.key] = Number.isFinite(interval) && interval > 0 ? value / interval : 0;
  }
  if (inputs.illOmen?.factor > 0) {
    const builders = [...ailments.filter((ailment) => !ailment.silent).map((ailment) => ailment.key), ...(inputs.reaping || []).map((source) => source.key)];
    bySource.illOmen = builders.reduce((sum, key) => sum + (bySource[key] || 0), 0) * inputs.illOmen.factor;
  }
  if (inputs.turbulence?.intervalSeconds > 0) {
    const builders = [...ailments.filter((ailment) => !ailment.silent).map((ailment) => ailment.key), ...(inputs.reaping || []).map((source) => source.key)];
    bySource.turbulence = builders.reduce((sum, key) => sum + (bySource[key] || 0), 0) * twistedSpacetime(inputs.turbulence).sustainedShare;
  }
  const dps = Object.values(bySource).reduce((sum, value) => sum + value, 0);
  // Simulated Affliction is not reduced to a stationary figure here; the configured rating is used.
  return { dps, bySource, approximate: options.afflictionModel === "simulated" };
}

// ---------------------------------------------------------------------------------------------

/** Timeline plus the 5 s and 20 s windows, the steady figure and a 20 s recount. */
export function calculateDummyRecount(inputs, { seconds = 60 } = {}) {
  const timeline = simulateDummyTimeline(inputs, { seconds });
  return {
    timeline,
    fiveSeconds: windowTotals(timeline, 5),
    twentySeconds: windowTotals(timeline, 20),
    steady: steadyState(inputs),
    recount20: summarizeRecount(timeline, { span: 20 }),
    options: timeline.options,
    assumptions: timeline.assumptions
  };
}
