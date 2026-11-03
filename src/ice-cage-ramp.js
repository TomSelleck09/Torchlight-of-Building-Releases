// Ice Puppet's Ice Cage build-up on a clean dummy (CLAUDE.md: in the 5 s / 20 s windows the dummy starts clean, so its
// debuffs build from zero).
//
// In-game tooltip at Ice Puppet Lv2 (user, 2026-10-13): "Focus energy to create an ice prison Near yourself and the Pact
// Holder, which debuffs Frostbitten enemies inside every second and makes them take +10% additional Cold Damage, up to 4
// stacks, for 6s. Cooldown: 10s". So 1 stack per second from t = 0: 1 stack during 0–1 s, 2 during 1–2 s, 3 during 2–3 s,
// 4 from 3 s on. Each stack lasts 6 s and is refreshed while the prison stands; with the 10 s cooldown the 4 stacks hold
// if the prison stands at least 4 s. Split 552980 (chunk 13): it stands 6 s and pulses 6 times, so 4 stacks are held after the ramp. It holds a second area on the spirit
// (open question pact-spirit-skill-timing). The stacks add into one multiplier (+10% per stack; provisional).
//
// Sustained / steady figures keep the full stacks; the 5 s / 20 s windows and the dummy recount timeline use the ramp,
// as a factor relative to the full-stack value already in every Cold ledger (src/combat-states.js derives the line).
// The math is the shared timed-effect model (src/timed-effects.js): a "ramp" schedule of one stack per second from t = 0.
import { hitTypeShares, partFactorAt, scheduleLevelAt, timedBoundaries, timedWindowFactor } from "./timed-effects.js";

export const ICE_CAGE_STACK_INTERVAL_SECONDS = 1;

/** The Ice Cage's ramp schedule: 1 stack at t = 0, +1 per second, held at `maxStacks`. */
export const iceCageSchedule = (maxStacks) => ({ kind: "ramp", maxStacks, intervalSeconds: ICE_CAGE_STACK_INTERVAL_SECONDS, startStacks: 1 });

/** Stacks on the dummy at `time` seconds from engagement (one per second from t = 0, held at the cap). */
export function iceCageStacksAt(time, maxStacks) {
  if (!(time >= 0) || !(maxStacks > 0)) return 0;
  return scheduleLevelAt(iceCageSchedule(maxStacks), time);
}

const activeCages = (cages) => (cages || []).filter((cage) => cage && cage.active && cage.perStackPercent > 0 && cage.stacks > 0);

/** The active cages as timed-effect parts: one multiplier each on Cold damage, hits and DoTs. */
export const iceCageParts = (cages) => activeCages(cages).map((cage) => ({ type: "Cold", reach: "all", percent: cage.perStackPercent, schedule: iceCageSchedule(cage.stacks) }));

/** Cold damage factor at `time` relative to the full-stack value: Π (1 + p·k(t)) / (1 + p·N). 1 once every cage is full. */
export function iceCageFactorAt(cages, time) {
  return iceCageParts(cages).reduce((factor, part) => factor * partFactorAt(part, time), 1);
}

/** Times inside (0, ∞) where the factor changes (stack gains), sorted. */
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
  const cage = active[0];
  const steps = Array.from({ length: cage.stacks }, (_, index) => `${index + 1} stack${index ? "s" : ""}${index + 1 < cage.stacks ? ` during ${index}–${index + 1} s` : ` from ${index} s on`}`).join(", ");
  return `the 5 s / 20 s windows and the recount build it on the clean dummy at 1 stack per second (${steps}; +${cage.perStackPercent}% per stack, added); prison duration ≥ ${cage.stacks} s assumed so the ${cage.stacks} stacks hold after the ramp (the duration is not in the tooltip); sustained figures hold ${cage.stacks} stacks`;
}
