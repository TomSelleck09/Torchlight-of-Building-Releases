// Crit chance over time-shared states (2026-10-27; research/lucky-crit-mechanics-2026-10-27.md, verdict A).
//
// The game makes each Critical Strike determination against that event's own crit chance, and Lucky Critical Strike re-rolls each
// determination (game manual 1000020920 "Lucky & Unlucky": the result is rolled twice and the more favourable kept), so a Lucky hit
// stream's crit share is Σ wᵢ · (1 − (1 − pᵢ)^rolls) over the states it spends time in, never 1 − (1 − p̄)^rolls of an averaged rate.
// The 100% cap applies per state as well (manual 1000000421: chance = Final Rating / 100, at most 100%).
//
// A part-time crit term (a buff held some share of the time or of the uses: Ash's no-crit window, an Elixir's crit rating, a follower
// Warcry's crit rating, Cohesion's next-Main-Skill crit, a part-time conditional Lucky grant) arrives as a time-averaged line carrying
// `lineEffect.timeShare` = s; its full value is the line's value ÷ s. Terms are read as independent (their on / off states combine as
// products of their shares; provisional, open question crit-time-state-independence). With more than MAX_TIME_STATE_TERMS terms the
// rest are folded back into the average (the old reading) to bound the 2^n states.

import { luckyCritChance } from "./lucky-damage.js";

export const MAX_TIME_STATE_TERMS = 10;

/** A line's time share (0 < s < 1) or null. */
export function timeShareOf(line) {
  const share = Number(line?.lineEffect?.timeShare);
  return share > 0 && share < 1 ? share : null;
}

const rateOf = (layers, baseRating) => Math.max(0, (baseRating + layers.flat) * Math.max(0, 1 + layers.increased / 100) * layers.additionalFactor);

/**
 * @param {object} p
 * @param {number} p.baseRating the base rating (spell base, the weapon's rating)
 * @param {number} p.flat permanent flat rating
 * @param {number} p.increased permanent increased rating %
 * @param {number} p.additionalFactor permanent additional factor
 * @param {{ share: number, flat?: number, increased?: number, additionalFactor?: number, luckyRolls?: number, source?: string, text?: string }[]} p.terms
 *   part-time terms at their full (on-state) value
 * @param {number} p.luckyRolls the permanent crit roll count (1 none, 2 Lucky)
 * @returns {{ chancePercent, plainChancePercent, averagedRating, averagedChancePercent, states, terms, folded }}
 */
export function critChanceOverTime({ baseRating = 0, flat = 0, increased = 0, additionalFactor = 1, terms = [], luckyRolls = 1 } = {}) {
  const valid = terms.filter((term) => term && term.share > 0 && term.share < 1);
  const kept = valid.slice(0, MAX_TIME_STATE_TERMS), folded = valid.slice(MAX_TIME_STATE_TERMS);
  const base = { flat, increased, additionalFactor };
  // Folded terms enter at their time average (flat / increased × s; an additional factor 1 + s(f − 1)); a folded Lucky term is dropped.
  for (const term of folded) {
    base.flat += (term.flat || 0) * term.share;
    base.increased += (term.increased || 0) * term.share;
    base.additionalFactor *= 1 + term.share * ((term.additionalFactor ?? 1) - 1);
  }
  // The old reading: every term at its time average in one rating (shown as the rating; The Cycle I Resist reads increases, not this).
  const averaged = { ...base };
  for (const term of kept) {
    averaged.flat += (term.flat || 0) * term.share;
    averaged.increased += (term.increased || 0) * term.share;
    averaged.additionalFactor *= 1 + term.share * ((term.additionalFactor ?? 1) - 1);
  }
  const averagedRating = rateOf(averaged, baseRating);
  const states = [];
  let chance = 0, plain = 0;
  for (let mask = 0; mask < 2 ** kept.length; mask++) {
    let weight = 1;
    const layers = { ...base };
    let rolls = Math.max(1, luckyRolls);
    kept.forEach((term, index) => {
      const on = Boolean(mask & (1 << index));
      weight *= on ? term.share : 1 - term.share;
      if (!on) return;
      layers.flat += term.flat || 0;
      layers.increased += term.increased || 0;
      layers.additionalFactor *= term.additionalFactor ?? 1;
      rolls = Math.max(rolls, term.luckyRolls || 1);
    });
    if (!(weight > 0)) continue;
    const rating = rateOf(layers, baseRating);
    const plainChancePercent = Math.min(100, rating / 100);
    const chancePercent = rolls > 1 ? luckyCritChance(plainChancePercent, rolls) : plainChancePercent;
    chance += weight * chancePercent; plain += weight * plainChancePercent;
    states.push({ weight, rating, plainChancePercent, chancePercent, rolls, on: kept.filter((_, index) => mask & (1 << index)).map((term) => term.source || term.text || "") });
  }
  return { chancePercent: chance, plainChancePercent: plain, averagedRating, averagedChancePercent: luckyRolls > 1 ? luckyCritChance(Math.min(100, averagedRating / 100), luckyRolls) : Math.min(100, averagedRating / 100), states, terms: kept, folded };
}

/** The crit chance of a set of states ({ weight, plainChancePercent }) under `rolls` crit rolls, converted per state. */
export function luckyChanceOverStates(states = [], rolls = 1) {
  return states.reduce((total, state) => { const n = Math.max(rolls, state.rolls || 1); return total + state.weight * (n > 1 ? luckyCritChance(state.plainChancePercent, n) : state.plainChancePercent); }, 0);
}
