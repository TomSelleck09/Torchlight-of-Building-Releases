// Ice Puppet's Ice Cage on the dummy: its stacks over time (CLAUDE.md: in the 5 s / 20 s windows the dummy starts clean, so its
// debuffs build from zero).
//
// In-game tooltip at Ice Puppet Lv2 (user, 2026-10-13): "Focus energy to create an ice prison Near yourself and the Pact
// Holder, which debuffs Frostbitten enemies inside every second and makes them take +10% additional Cold Damage, up to 4
// stacks, for 6s. Cooldown: 10s".
//
// Game records (proven; research/remediation-cap-census-2026-11-21.md row 1, 2026-11-22): Split 552980 (stone 80030) stands 6 s and
// its timer pulses 6 times 1 s apart from 0 s, each pulse struct 428666 adding 1 layer of buff 100020 for 6 s, with no refresh field.
// Buff 100020 is subtype 2 (layers on one instance), cap 4, stack mode 1, and its own affix list holds only 101010502 (no node-626
// self-refresh). The SS14 client's layer add (0x141d02810) gives the new layer its own full duration and touches no other layer; at
// the cap, subtype 2 under mode 1 removes the oldest layer and adds the new one (0x141d01450; research/oq-aeterna-stack-modes-2026-11-04.md).
// So each stack is its own 6 s layer and a new stack never refreshes the others (replacing the 2026-10-13 / chunk 13 reading "a new
// stack refreshes the others, so 4 stacks hold"). Inferred: struct 428666 reaches the same add routine as node 301.
//
// One cast (t = 0, then every cooldown; the cast timing stays provisional, open question pact-spirit-skill-timing) gives 1, 2, 3, 4,
// 4, 4, 4, 4, 3, 2 stacks over its 10 s; from the second cast the previous cast's last layer is still up for 1 s, so 2, 2, 3, 4, 4,
// 4, 4, 4, 3, 2: 3.2 stacks on average, the sustained level the ledgers hold. The windows and the recount read the same layer walk
// (a "steps" schedule, src/timed-effects.js), as a factor relative to that sustained level (src/combat-states.js derives the line).
import { hitTypeShares, partFactorAt, scheduleLevelAt, sustainedLevel, timedBoundaries, timedWindowFactor, TIMED_EFFECT_HORIZON_SECONDS } from "./timed-effects.js";

export const ICE_CAGE_STACK_INTERVAL_SECONDS = 1;
// Split 552980: 6 pulses, 1 s apart from 0 s (the prison stands 6 s).
export const ICE_CAGE_PULSES = 6;
export const ICE_CAGE_LAYER_SECONDS = 6;
export const ICE_CAGE_COOLDOWN_SECONDS = 10;
const EPS = 1e-9;
const round9 = (value) => Math.round(value * 1e9) / 1e9;

const cageParams = (cage) => {
  const value = typeof cage === "number" ? { stacks: cage } : cage || {};
  const positive = (number, fallback) => (Number(number) > 0 ? Number(number) : fallback);
  return {
    maxStacks: Math.max(0, Math.floor(Number(value.stacks) || 0)),
    layerSeconds: positive(value.layerSeconds, ICE_CAGE_LAYER_SECONDS),
    pulses: Math.max(1, Math.floor(positive(value.pulses, ICE_CAGE_PULSES))),
    pulseIntervalSeconds: positive(value.pulseIntervalSeconds, ICE_CAGE_STACK_INTERVAL_SECONDS),
    cooldownSeconds: positive(value.cooldownSeconds, ICE_CAGE_COOLDOWN_SECONDS)
  };
};

/**
 * The prison's layers walked in time: a cast at t = 0 and every cooldown, each cast's pulses one layer each (own duration, half-open
 * [t, t + D): a layer ending on a pulse's tick is gone before that pulse adds), the oldest layer removed when a pulse finds the cap full.
 * Returns the level after every change, [[t, stacks], …] up to `horizon` + one cycle, and the long-run average over one cooldown.
 */
export function iceCageLayerWalk(cage, horizon = TIMED_EFFECT_HORIZON_SECONDS) {
  const { maxStacks, layerSeconds, pulses, pulseIntervalSeconds, cooldownSeconds } = cageParams(cage);
  if (!maxStacks) return { points: [], sustained: 0 };
  const end = horizon + cooldownSeconds + layerSeconds;
  const adds = [];
  for (let cast = 0; cast <= end + EPS; cast += cooldownSeconds) for (let pulse = 0; pulse < pulses; pulse += 1) adds.push(cast + pulse * pulseIntervalSeconds);
  adds.sort((a, b) => a - b);
  let layers = []; // end times, oldest first
  const points = [];
  const record = (time) => { const level = layers.length; if (points.length && Math.abs(points[points.length - 1][0] - time) < EPS) points[points.length - 1][1] = level; else if (!points.length || points[points.length - 1][1] !== level) points.push([round9(time), level]); };
  const expireUntil = (time) => {
    // Layers ending at or before `time`, one change point per end time.
    while (layers.length) {
      const next = layers.reduce((min, ends) => Math.min(min, ends), Infinity);
      if (!(next <= time + EPS)) return;
      layers = layers.filter((ends) => ends > next + EPS);
      record(next);
    }
  };
  for (const time of adds) {
    expireUntil(time);
    layers.push(time + layerSeconds);
    if (layers.length > maxStacks) layers.shift();
    record(time);
  }
  expireUntil(Infinity);
  // One point per change of level (a pulse landing on a layer's end leaves the level as it was).
  for (let index = points.length - 1; index > 0; index -= 1) if (points[index][1] === points[index - 1][1]) points.splice(index, 1);
  // The long-run level: the average over one cooldown cycle once every layer of an earlier cycle has gone (a cycle starting at least
  // one layer duration after the first cast).
  const start = Math.ceil((layerSeconds + pulses * pulseIntervalSeconds) / cooldownSeconds) * cooldownSeconds;
  const schedule = { kind: "steps", points, sustained: 0 };
  const edges = [start, ...points.map(([at]) => at).filter((at) => at > start + EPS && at < start + cooldownSeconds - EPS), start + cooldownSeconds];
  let total = 0;
  for (let index = 0; index + 1 < edges.length; index += 1) total += scheduleLevelAt(schedule, (edges[index] + edges[index + 1]) / 2) * (edges[index + 1] - edges[index]);
  return { points, sustained: Math.round(total / cooldownSeconds * 1e9) / 1e9 };
}


/** The Ice Cage's schedule: its own-layer walk as a "steps" schedule, `sustained` the long-run average (3.2 at 4 stacks of 6 s). */
export function iceCageSchedule(cage) {
  const { points, sustained } = iceCageLayerWalk(cage);
  return { kind: "steps", points, sustained };
}

/** Stacks on the dummy at `time` seconds from engagement (`cage` a cage summary, or its stack cap with the record's timing). */
export function iceCageStacksAt(time, cage) {
  if (!(time >= 0)) return 0;
  return scheduleLevelAt(iceCageSchedule(cage), time);
}

/** The long-run average stacks of one prison (the sustained level the ledgers hold). */
export const iceCageHeldStacks = (cage) => sustainedLevel(iceCageSchedule(cage));

const activeCages = (cages) => (cages || []).filter((cage) => cage && cage.active && cage.perStackPercent > 0 && cage.stacks > 0);

/** The active cages as timed-effect parts: one multiplier each on Cold damage, hits and DoTs. */
export const iceCageParts = (cages) => activeCages(cages).map((cage) => ({ type: "Cold", reach: "all", percent: cage.perStackPercent, schedule: iceCageSchedule(cage) }));

/** Cold damage factor at `time` relative to the sustained value: Π (1 + p·k(t)) / (1 + p·k̄). */
export function iceCageFactorAt(cages, time) {
  return iceCageParts(cages).reduce((factor, part) => factor * partFactorAt(part, time), 1);
}

/** Times inside (0, ∞) where the factor changes (stack gains and losses), sorted. */
export function iceCageBoundaries(cages) {
  return timedBoundaries(iceCageParts(cages));
}

/** Time average of the relative Cold factor over [0, seconds) (exact: piecewise constant). 1 for seconds ≤ 0 (sustained). */
export function iceCageWindowFactor(cages, seconds) {
  return timedWindowFactor(iceCageParts(cages), { hit: false, types: { Cold: 1 } }, seconds);
}

/** A source's factor when only `coldShare` of its damage is Cold. */
export const iceCageSourceFactor = (coldShare, coldFactor) => 1 + (Number(coldShare) || 0) * (coldFactor - 1);

/** Cold share of a generic skill hit's damage per use (its per-type components after target mitigation). */
export function coldShareOfHit(hit) {
  return hitTypeShares(hit).types.Cold || 0;
}

/** Assumption text for the recount and the Config tab. */
export function iceCageRampText(cages) {
  const active = activeCages(cages);
  if (!active.length) return "";
  const cage = active[0], { layerSeconds, pulses, cooldownSeconds } = cageParams(cage);
  const first = iceCageSchedule(cage).points.filter(([at]) => at < cooldownSeconds - EPS).map(([at, level]) => `${level} from ${at} s`).join(", ");
  return `the 5 s / 20 s windows and the recount walk its layers on the clean dummy: each of the ${pulses} pulses (1 s apart from the cast) adds a stack of its own ${layerSeconds} s, the oldest replaced at ${cage.stacks} (buff 100020 subtype 2, mode 1), a cast every ${cooldownSeconds} s from t = 0 (${first}; +${cage.perStackPercent}% per stack, added); sustained figures hold the long-run ${iceCageHeldStacks(cage)} stacks`;
}
