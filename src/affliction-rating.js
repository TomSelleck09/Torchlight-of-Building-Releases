// The dummy's Affliction rating, derived from the build (automatic combat-condition mode).
//
// The rating rises at the build's Affliction per second and caps at 100 (max Affliction; the
// whole planner treats 100 as the cap: theoretical-damage.js, ailment-model.js, dummy-recount.js).
// Nothing else lowers it except a full-Affliction Reap that removes Affliction (Torturer's Touch:
// "Reaping removes X% Affliction from enemies"). Such a Reap fires at 100, drops the rating by
// the removed points, and fires again after max(recovery, refill) — the same interval
// calculateReaping (theoretical-damage.js) and maxAfflictionUptime (max-affliction-resistance.js) use.
//
// Steady value = time average over one Reap cycle:
//   refill r / a seconds rising linearly from 100 − r to 100 (average 100 − r / 2),
//   then 100 for the rest of the interval while the Reap waits on its recovery.
// Without a remover the rating stays at 100 once reached (first after 100 / a seconds).
// With several removers the one that leaves the lowest average limits the rating.
// Damage over time scales linearly with the rating, so the time average is the right input.

import { frameSnap as snapToFrames } from "./frame-snapping.js";

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

// Periodic clears by another unit (the follower's Pain Amplification, src/follower-model.js afflictionClear: "Clears 10 Affliction when this skill
// deals damage. Interval: 2s"). The rating is one resource on the dummy (SS14 client, research/oq-r1-r2-rea-2026-11-04.md R1.9, proven), so the
// clear comes off your rating. A clear lands on the skill's damage events (every `eventSeconds` from `firstSeconds`), at most once per
// `gateSeconds` (the gate restarts when it clears), only while the rating is at least `minRating`. A cycle has no closed form beside the
// gain's clamp, so it is run on whole 1/30 s frames (the gain, then the clear: the follower's hit lands in the Damage stage before it) over a
// 20 s warm-up and a 60 s measure. Returns the average rating and the share of frames at 100, or null without a clear.
const CLEAR_FRAMES_PER_SECOND = 30;
export function afflictionClearCycle({ afflictionPerSecond = 0, clears = [] } = {}) {
  const rate = Math.max(0, Number(afflictionPerSecond) || 0);
  const list = (clears || []).filter((item) => item?.amount > 0 && item.eventSeconds > 0 && Number.isFinite(item.eventSeconds));
  if (!(rate > 0) || !list.length) return null;
  const warm = 20 * CLEAR_FRAMES_PER_SECOND, measure = 60 * CLEAR_FRAMES_PER_SECOND;
  const states = list.map((item) => ({ item, next: item.firstSeconds || 0, gateUntil: -Infinity }));
  let rating = 0, sum = 0, atMax = 0, cleared = 0;
  for (let frame = 0; frame < warm + measure; frame += 1) {
    const time = frame / CLEAR_FRAMES_PER_SECOND;
    rating = Math.min(100, rating + rate / CLEAR_FRAMES_PER_SECOND);
    for (const state of states) {
      while (state.next <= time + 1e-9) {
        if (state.next >= state.gateUntil - 1e-9 && rating >= (state.item.minRating ?? state.item.amount) - 1e-9) {
          rating = Math.max(0, rating - state.item.amount);
          state.gateUntil = state.next + (state.item.gateSeconds || 0);
          if (frame >= warm) cleared += state.item.amount;
        }
        state.next += state.item.eventSeconds;
      }
    }
    if (frame >= warm) { sum += rating; if (rating >= 100 - 1e-9) atMax += 1; }
  }
  return { average: sum / measure, atMaxFraction: atMax / measure, clearedPerSecond: cleared / (measure / CLEAR_FRAMES_PER_SECOND), sources: list.map((item) => item.source).filter(Boolean) };
}

// `accrualSeconds` (10 T Barrier Burst triage L1, 2026-11-18): the rating gains only while one of your DoT records is on the dummy (SS14 client
// 0x141d4cd50, research/oq-r1-r2-rea-2026-11-04.md R1.3, proven; the tick engine's rule). When your only DoT record is an Ignite applied while the
// dummy is not Ignited and another unit keeps it Ignited for good (the follower's Additional Ignite), you hold a record for one Ignite duration
// only, so the steady rating is at most the rate × that duration; nothing lowers it after (buff 400 stays up while any DoT record ticks).
// `initialRating`: Magmaskull's first infliction (src/initial-affliction.js), the least that one held record gives.
export function deriveAfflictionRating({ afflictionPerSecond = 0, removers = [], clears = [], accrualSeconds = Infinity, initialRating = 0 } = {}) {
  const rate = Math.max(0, Number(afflictionPerSecond) || 0);
  if (!(rate > 0)) return { rating: 0, afflictionPerSecond: 0, firstFullSeconds: Infinity, limitingRemover: null, text: "Affliction 0 (the build inflicts no Affliction per second)." };
  const result = deriveUncapped(rate, removers, clears);
  const cap = Number.isFinite(accrualSeconds) && accrualSeconds >= 0 ? Math.min(100, Math.max(rate * accrualSeconds, Number(initialRating) || 0)) : Infinity;
  if (!(cap < result.rating)) return Number.isFinite(accrualSeconds) ? { ...result, accrualSeconds } : result;
  return { ...result, rating: cap, accrualSeconds, text: `Affliction ${round(cap, 3)} (${round(rate, 3)}/s for the ${round(accrualSeconds, 3)} s your one Ignite is held; the rating gains only while one of your DoT records is on the dummy, and another unit's Ignite then keeps it from being renewed).` };
}

function deriveUncapped(rate, removers, clears) {
  const cleared = withClears(rate, clears);
  const firstFullSeconds = 100 / rate;
  let best = null;
  for (const remover of removers) {
    const removed = Math.max(0, Math.min(100, remover.afflictionRemovedPercent ?? 100));
    if (!(removed > 0)) continue;
    const fillSeconds = removed / rate;
    // A frame-snapped remover (src/frame-snapping.js, internal frameSnap only: the Reap toggle is gone, the tick engine (src/tick-recount.js, chunk 15) runs the Reaps on whole 1/30 s frames on the recount and the windows; the Reap toggle of 2026-10-23 is gone) fires on a whole 1/30 s frame.
    const intervalSeconds = snapToFrames(Math.max(Math.max(0, remover.recoverySeconds || 0), fillSeconds), remover.frameSnap === true);
    const average = ((100 - removed / 2) * fillSeconds + 100 * (intervalSeconds - fillSeconds)) / intervalSeconds;
    if (!best || average < best.average) best = { source: remover.source, removedPercent: removed, fillSeconds, intervalSeconds, recoverySeconds: remover.recoverySeconds || 0, average };
  }
  const perSecond = round(rate, 3);
  if (!best) return cleared({ rating: 100, afflictionPerSecond: rate, firstFullSeconds, limitingRemover: null,
    text: `Affliction 100 (${perSecond}/s, nothing removes it; full after ${round(firstFullSeconds, 3)} s).` });
  const waits = best.intervalSeconds > best.fillSeconds + 1e-12;
  return cleared({ rating: best.average, afflictionPerSecond: rate, firstFullSeconds, limitingRemover: best,
    text: `Affliction avg ${round(best.average, 1)} (fills ${round(100 - best.removedPercent, 1)}→100 in ${round(best.fillSeconds, 3)} s at ${perSecond}/s, ${best.removedPercent}% removed on each ${best.source} Reap${waits ? `; waits ${round(best.intervalSeconds - best.fillSeconds, 3)} s at 100 for the ${round(best.recoverySeconds, 3)} s recovery` : ""}).` });
}

// The follower's clears on top of the reading above: the rating loses the cycle's deficit from 100 (with a full-Affliction remover as well the
// two deficits add, an approximation: no fixture has both).
function withClears(rate, clears) {
  const cycle = afflictionClearCycle({ afflictionPerSecond: rate, clears });
  return (result) => {
    if (!cycle) return result;
    const rating = Math.max(0, result.rating - (100 - cycle.average));
    return { ...result, rating, clears: cycle, text: `${result.text.replace(/.$/, "")}; ${cycle.sources.join(", ") || "a follower skill"} clears ${round(cycle.clearedPerSecond, 2)} Affliction a second: avg ${round(rating, 2)}.` };
  };
}
