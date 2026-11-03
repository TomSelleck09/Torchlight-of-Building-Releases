// Frame-snapped intervals (prototype, 2026-10-23; research/frame-snapping-2026-10-23.md; open question `frame-snapped-intervals`).
//
// Reading under test: the game server steps its combat in whole frames of 1/30 s, so a timer (a Reap's Recovery Time after
// Reaping Recovery Speed, a skill cooldown after Cooldown Recovery Speed, an Activation Medium trigger interval) only ends on a
// frame: its effective length is the next whole number of frames at or above the computed time. Under that reading a speed bonus
// shortens the interval only when it crosses the next frame breakpoint (frames F = ceil(30 × base ÷ (1 + speed)), so the speed
// needed for F frames is 30 × base ÷ F − 1).
//
// Sources: none in the readable game tables or the game manual (cooldown condition nodes 254 / 206 and Reap node 631 carry no
// rounding field; the manual's Reaping and Cooldown texts give the continuous formula). Community readings only: the MIT-licensed
// Tli-Utils (nextkaki, Korean cooldown calculator, "frame view" of the Reap cooldown, 2024-10/11) and a tuning sheet credited to
// Theuberelite + miakitten (quoted in Tyrayla/TLIBuilder docs/verification/torturers-touch-reaping.md, marked unverified). The
// community guide Reaping article (updated 2026-06-03) says "~30 Hz" but names 700–800%+ Reaping Recovery Speed as the cap
// region, which for a 1 s Reap is a floor near 0.11–0.125 s, not 1/30 s: the sources disagree.
// Nothing here is confirmed in game. The Config toggle "Snap Reap recovery to 1/30 s frames" (2026-10-23) was removed in chunk 15
// (2026-11-01): the tick engine (src/tick-recount.js, chunk 15) runs the Reaps on whole 1/30 s frames on the recount and the windows; the Reap toggle of 2026-10-23 is gone. The optional frameSnap
// parameters of the Reap models stay for the internal condition frameSnapCooldowns (no control, off) and for research.

/** One server frame (the ~30 Hz tick; equals REAP_TICK_SECONDS in src/reaping-model.js). */
export const SERVER_FRAME_SECONDS = 1 / 30;
// Float slack so an exact frame count (1 s ÷ 3 = 10 frames) is not pushed to the next frame by rounding error.
const SLACK = 1e-6;

/** Whole frames a timer of `seconds` lasts under the snapped reading (at least 1). */
export function framesFor(seconds) {
  if (!(seconds > 0) || !Number.isFinite(seconds)) return seconds;
  return Math.max(1, Math.ceil(seconds / SERVER_FRAME_SECONDS - SLACK));
}

/**
 * Fixed intervals (condition node 206, periodic affix nodes, the 4 s collectors): the client rounds T × 30 to the NEAREST frame, ties
 * away from zero (research/tick-engine-investigation-2026-10-30.md §3.2, proven; D2). Under one frame the gate reads 0, so the node
 * fires on every tick (1 frame). Speed-scaled cooldowns (nodes 251 / 6 / 252 / 254) are the other class: they end on the first tick
 * at or after the time (`framesFor`).
 */
export function fixedIntervalSeconds(seconds) {
  if (!(seconds > 0) || !Number.isFinite(seconds)) return seconds;
  return Math.max(1, Math.round(seconds * 30)) / 30;
}

/** `seconds` rounded up to whole 1/30 s frames when `enabled`; otherwise unchanged (0, Infinity and non-numbers pass through). */
export function frameSnap(seconds, enabled = true) {
  if (!enabled || !(seconds > 0) || !Number.isFinite(seconds)) return seconds;
  return framesFor(seconds) * SERVER_FRAME_SECONDS;
}

/**
 * The speed breakpoints around a timer: its frames now, and the total speed bonus (percent, the one that divides the base as
 * base ÷ (1 + speed)) needed to drop one more frame. `base` is the timer before any speed; `factor` the whole divisor applied now.
 * @returns {null|{ seconds, snappedSeconds, frames, nextFrames, speedForNextPercent, speedForCurrentPercent }}
 */
export function frameBreakpoints(baseSeconds, factor = 1) {
  if (!(baseSeconds > 0) || !(factor > 0)) return null;
  const seconds = baseSeconds / factor;
  const frames = framesFor(seconds);
  const speedFor = (count) => count > 0 ? (baseSeconds / (count * SERVER_FRAME_SECONDS) - 1) * 100 : Infinity;
  return { seconds, snappedSeconds: frames * SERVER_FRAME_SECONDS, frames, nextFrames: Math.max(1, frames - 1), speedForNextPercent: frames > 1 ? speedFor(frames - 1) : null, speedForCurrentPercent: speedFor(frames) };
}
