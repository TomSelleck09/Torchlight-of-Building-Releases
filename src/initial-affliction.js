// Magmaskull's "Changes the initially inflicted Affliction to N" (user decision 2026-11-04: modelled; research/remaining-triggers-2026-11-04.md §2).
//
// Game record 16012669: one row on trigger 1000022 ("on inflicting Affliction for the first time"), node 627 resourceType 6 (Affliction),
// changeMode 2, numValue p0, sourceIsAffixRunningEntity. The SS14 client raises 1000022 in 0x141d4cd50 (called by the Damage stage
// 0x141f07060): when an attacker's entry on the target's Affliction list is new (its "raised" flag unset, a source count above 0), the
// routine adds the Affliction buff (config buff 400) if the target has none, then raises the event on that attacker and sets the flag. The
// list is cleared only when the target holds no source and no buff 400 any more, so on a dummy kept under damage over time it fires once
// per fight (inferred: the fields read as the source count and the list were not named; open question magmaskull-initial-affliction).
// Node 627's handler (0x142189520 → 0x141e31100 → 0x141e8de30, SS13 trace research/reap-affliction-ordering-2026-10-07.md) adds
// numValue to the rating for change modes 1 and 2 and clamps it to 0–100; at the first infliction the rating is 0 and the gain that
// call applies is the previous sum (0), so the first infliction leaves the rating at N, as the text says.
//
// SS14 client (research/oq-r1-r2-rea-2026-11-04.md R1.3, proven): the routine runs after the Damage loop's DoT, hit and apply passes and raises
// the event on an attacker entry with at least one active DoT record, so the first infliction is the first tick one of your DoT records exists,
// not engagement; a removal changes the rating only, so it never re-fires (the buff 400 refresh that keeps the list is inferred).
//
// The planner holds the steady rating (src/affliction-rating.js): a once-per-fight event leaves it unchanged (a full-Affliction Reap's
// removal changes the rating, not the attacker's flag). Only the opening moves: the tick engine (src/tick-engine.js) and the continuous
// recount (src/dummy-recount.js) put the rating at N on the first tick one of your DoT records is on the dummy, after that tick's DoT pass,
// instead of that tick's gain. Pure module.

/** The line as the catalog and the joined-line split write it (src/legendary-joined-lines.js). */
export const INITIAL_AFFLICTION_LINE = /^Changes the initially inflicted Affliction to (\d+(?:\.\d+)?)$/i;

const clampRating = (value) => Math.max(0, Math.min(100, value));

/**
 * The build's initial Affliction, or null without the line: the largest value among its copies (one event, one set).
 * @param {{ text: string, source?: string }[]} modifierTexts planner.modifierTexts
 * @returns {{ value: number, source: string, text: string } | null}
 */
export function initialAfflictionLine(modifierTexts = []) {
  let best = null;
  for (const line of modifierTexts || []) {
    const match = String(line?.text ?? "").replace(/\s+/g, " ").trim().match(INITIAL_AFFLICTION_LINE);
    if (!match) continue;
    const value = clampRating(Number(match[1]));
    if (!best || value > best.value) best = { value, source: line.source || "Magmaskull", text: match[0] };
  }
  return best;
}

/**
 * The line's status for its badge and the recount, from the planner's Affliction state.
 * @param {object|null} line initialAfflictionLine's result
 * @param {{ afflictionOn: boolean, simulated: boolean, perSecond: number }} state the Affliction condition (the build inflicts
 *   Affliction with a DoT that reads it), whether the rating is derived and builds from 0 (automatic mode), the Affliction per second
 * @returns {{ value, source, text, status, reason, firstMaxSeconds } | null} status "In calc" (the opening starts at the value),
 *   "Inactive" (the build inflicts no Affliction), "No DPS effect" (a configured rating holds from the start)
 */
export function resolveInitialAffliction(line, { afflictionOn = false, simulated = false, perSecond = 0 } = {}) {
  if (!line) return null;
  if (!afflictionOn) return { ...line, status: "Inactive", reason: "the build inflicts no Affliction on the dummy", firstMaxSeconds: Infinity };
  if (!simulated) return { ...line, status: "No DPS effect", reason: "the configured Affliction rating holds from the start of the fight (manual mode)", firstMaxSeconds: 0 };
  if (!(perSecond > 0)) return { ...line, status: "Inactive", reason: "the build inflicts no Affliction on the dummy", firstMaxSeconds: Infinity };
  return { ...line, status: "In calc", reason: `the first infliction puts the dummy at ${line.value} Affliction; the steady rating is unchanged (once per fight)`, firstMaxSeconds: Math.max(0, 100 - line.value) / perSecond };
}
