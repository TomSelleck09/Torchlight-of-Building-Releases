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

export function deriveAfflictionRating({ afflictionPerSecond = 0, removers = [] } = {}) {
  const rate = Math.max(0, Number(afflictionPerSecond) || 0);
  if (!(rate > 0)) return { rating: 0, afflictionPerSecond: 0, firstFullSeconds: Infinity, limitingRemover: null, text: "Affliction 0 (the build inflicts no Affliction per second)." };
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
  if (!best) return { rating: 100, afflictionPerSecond: rate, firstFullSeconds, limitingRemover: null,
    text: `Affliction 100 (${perSecond}/s, nothing removes it; full after ${round(firstFullSeconds, 3)} s).` };
  const waits = best.intervalSeconds > best.fillSeconds + 1e-12;
  return { rating: best.average, afflictionPerSecond: rate, firstFullSeconds, limitingRemover: best,
    text: `Affliction avg ${round(best.average, 1)} (fills ${round(100 - best.removedPercent, 1)}→100 in ${round(best.fillSeconds, 3)} s at ${perSecond}/s, ${best.removedPercent}% removed on each ${best.source} Reap${waits ? `; waits ${round(best.intervalSeconds - best.fillSeconds, 3)} s at 100 for the ${round(best.recoverySeconds, 3)} s recovery` : ""}).` };
}
