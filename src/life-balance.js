// Current Life of a self-consuming build (2026-11-11, 10 T Frost Spike audit G4; user decision: "look at the regain stats").
//
// A build whose consumes take a share of current Life ("Consumes X% of current Life when you use Attack Skills", "… on skill use",
// Ancestral Hate's "Seething Spirit consumes X% of current Life when using skills", Recklessness's "N% of current Life will be consumed
// when the supported skill is cast") cannot hold Full Life, and the dummy never attacks, so a fixed Low Life level is not what it reads
// either: its current Life is the balance of those consumes against its Life recovery. This module plays that balance frame by frame
// (30 Hz) and returns the level the readers take. Pure: no planner state, no closure kept on the result.
//
// The frame, from the SS14 client (research/build-10t-frost-spike-audit-2026-11-11.md §8; static reads of the private exe copy):
//   - Every consume of a frame reads the same current Life (node 500, nothing pending subtracted) and adds to the pending Life loss
//     (node 122 type 1, unit comp + 0x210). Proven (research/attack-life-consume-2026-11-09.md §5).
//   - The resource update (0x141f36ea0) first counts down each unit's Regain timers (+0x38 Life, +0x40 Energy Shield) by the frame and,
//     for a unit with label 3010233 ("Life Regain no longer requires a hit to activate"), calls the Regain routine 0x142061f10 through
//     0x141df80e0 when the timer is out; without the label the Regain runs on a hit (0x141f01330 → 0x141e080f0). Proven.
//   - Regain (0x142061f10): only while Life is missing against the max after the seal (R[0] ? R+0x28 : R+0x08); amount = min(cap,
//     field 2010220 Life Regain) × 0.01 × (full Max Life − current Life), × 2 under label 3010231 ("Double Life Regain", after the cap).
//     The share in field 2010240 ("Converts X% of Life Regain … to Restoration Over Time", capped at 100%) becomes a restoration entry
//     (0x141de8320) and the rest goes to the pending Life gain (0x141debfb0, [0x13]). Then the timer is set to attribute 1320 (Life
//     Regain Interval), so a Regain comes every ceil(interval ÷ frame) frames. A Regain whose amount is 0 (field 2010220 set to 0) does
//     not reset the timer. Proven.
//   - "Life Regain is only effective when Life is lower than P1%" (Life Path, record 992278): node 336 sets field 2010220 to 0 while gate
//     218 type 1 holds (Life at least p0 / 100). Record proven; that the gate reads current ÷ full Max Life and is settled before the
//     frame's Regain is inferred (life-balance-regain-gate).
//   - A restoration entry restores its amount linearly over its duration (0x141f21030: total × frame ÷ (end − start), capped by what is
//     left), and is removed when Life is full (manual 1001012522). Its duration is a client constant (world config + 0x148) that the
//     tables here do not settle: RESTORATION_SECONDS, inferred (life-balance-restoration-duration); the level moves under 1% from 0.5 s
//     to 8 s on the 10 T build.
//   - Life Regeneration (attributes 1003 flat, 1004 % of Max Life, 1002 speed) is a per-frame gain of the same update.
//   - Losses (node 104: "Loses X% current Life … Interval: Y s") add to the same pending loss but are not Life consumed.
//   - The pending loss is cut so that 1 Life stays, then gains and losses are netted together: current = min(max after the seal,
//     current − loss + gains). The next frame's consumes read the result. Proven (0x141f36ea0, research/attack-life-consume-2026-11-09.md).
// Events are placed frame by frame with one deterministic accumulator per stream (as the tick engine places uses), so a frame holds the
// whole uses that land in it (a Seething Spirit cast takes its 49% at once). Readers take the level at the uses (the consume and the
// hit read the frame's current Life), weighted by the events.
//
// Thresholds: Low Life at most 35% of Max Life (manual 1000010125), Full Life at least 95% (manual 1000010126; the user-confirmed rule:
// sealed Life counts against it).

import { lifeRegainIntervalSeconds } from "./regain-model.js";
import { fixedIntervalSeconds } from "./frame-snapping.js";

export const LIFE_BALANCE_FRAME_SECONDS = 1 / 30;
export const LIFE_REGAIN_CAP_PERCENT = 30;
export const LOW_LIFE_AT_MOST_PERCENT = 35;
export const FULL_LIFE_AT_LEAST_PERCENT = 95;
// The restoration entries' duration (world config + 0x148): not settled by the tables (inferred, life-balance-restoration-duration).
export const RESTORATION_SECONDS = 2;

const EPS = 1e-12;
const round = (value, digits = 4) => { const scale = 10 ** digits; return Math.round(value * scale) / scale; };

/**
 * One Regain pool for the balance (Life): { amountFraction, intervalFrames, noHit, gateBelowFraction, toRestorationShare,
 * restorationFrames } from the build's stats; null when the build has no Life Regain.
 * @param {object} p
 * @param {number} p.regainPercent the Life Regain total (field 2010220), before the cap
 * @param {boolean} p.doubled label 3010231 ("Double Life Regain")
 * @param {number} p.intervalSeconds the Life Regain Interval (attribute 1320)
 * @param {boolean} p.noHit label 3010233 ("Life Regain no longer requires a hit to activate")
 * @param {number|null} p.gateBelowPercent "Life Regain is only effective when Life is lower than P1%" (smallest copy), or null
 * @param {number} p.toRestorationPercent field 2010240 ("Converts X% of Life Regain … to Restoration Over Time")
 */
export function lifeBalanceRegain({ regainPercent = 0, doubled = false, intervalSeconds = 0.5, noHit = false, gateBelowPercent = null, toRestorationPercent = 0, restorationSeconds = RESTORATION_SECONDS, capPercent = LIFE_REGAIN_CAP_PERCENT } = {}) {
  const regain = Math.max(0, Number(regainPercent) || 0);
  if (!(regain > 0)) return null;
  const amountFraction = Math.min(capPercent, regain) / 100 * (doubled ? 2 : 1);
  const interval = Math.max(0, Number(intervalSeconds) || 0);
  // The timer is set to the interval and counted down a frame at a time before the check: ready after ceil(interval ÷ frame) frames.
  const intervalFrames = Math.max(1, Math.ceil(interval / LIFE_BALANCE_FRAME_SECONDS - 1e-9));
  return {
    regainPercent: round(regain), cappedPercent: round(Math.min(capPercent, regain)), doubled: Boolean(doubled), amountFraction: round(amountFraction, 6),
    intervalSeconds: round(interval, 6), intervalFrames, noHit: Boolean(noHit),
    gateBelowFraction: Number.isFinite(Number(gateBelowPercent)) && gateBelowPercent !== null ? Number(gateBelowPercent) / 100 : null,
    toRestorationShare: Math.max(0, Math.min(1, (Number(toRestorationPercent) || 0) / 100)),
    restorationFrames: Math.max(1, Math.round(Math.max(0, Number(restorationSeconds) || 0) / LIFE_BALANCE_FRAME_SECONDS))
  };
}

// The Regain lines the balance reads by their records: label 3010231 (101070132 "Double Life Regain"; Life Path's hyperlink "Life Regain
// doubles"), label 3010233 (867183424, Split Form), record 992278 (Life Path's gate).
const DOUBLE_LIFE_REGAIN = /^(?:Double Life Regain|Life Regain doubles)$/i;
const NO_HIT_LIFE_REGAIN = /^Life Regain no longer requires a hit to activate$/i;
const LIFE_REGAIN_GATE = /^Life Regain is only effective when Life is lower than (\d+(?:\.\d+)?) ?%$/i;
const lineTexts = (modifierTexts) => modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).flatMap((line) => String(line.text ?? "").split(/\r?\n/).map((text) => ({ source: line.source, text: text.replace(/\s+/g, " ").trim().replace(/^\[[^\]]+\]\s*/, "") })));

/**
 * The build's Life Regain for the balance from the character-stat totals (`stats`: lifeRegain, lifeRegainInterval,
 * energyShieldRegainInterval, game:regainToRestorationOverTime) and its label lines; null without Life Regain. `sources` names the lines.
 */
export function lifeBalanceRegainFromBuild({ modifierTexts = [], stats = {}, restorationSeconds = RESTORATION_SECONDS } = {}) {
  const texts = lineTexts(modifierTexts);
  const find = (pattern) => texts.filter((item) => pattern.test(item.text));
  const doubled = find(DOUBLE_LIFE_REGAIN), noHit = find(NO_HIT_LIFE_REGAIN), gates = find(LIFE_REGAIN_GATE);
  const interval = lifeRegainIntervalSeconds({ lifeIntervalStat: stats.lifeRegainInterval, shieldIntervalStat: stats.energyShieldRegainInterval, modifierTexts });
  const gateBelowPercent = gates.length ? Math.min(...gates.map((item) => Number(item.text.match(LIFE_REGAIN_GATE)[1]))) : null;
  const regain = lifeBalanceRegain({ regainPercent: Number(stats.lifeRegain?.value) || 0, doubled: doubled.length > 0, intervalSeconds: interval.seconds, noHit: noHit.length > 0, gateBelowPercent,
    toRestorationPercent: Number(stats["game:regainToRestorationOverTime"]?.value) || 0, restorationSeconds });
  if (!regain) return null;
  return { ...regain, sources: { doubled: doubled.map((item) => item.source), noHit: noHit.map((item) => item.source), gate: gates.map((item) => item.source), shieldInterval: interval.shield } };
}

// Losses of current Life the balance takes beside the consumes (each a loss stream, not a use):
//   - "Loses X% current Life and Energy Shield when inflicting <Ailment>. Interval: Y s" (Chaos Abyss, record 5238533: trigger 1000150 on the
//     ailment's tag, gate 206 at Y s, node 104 type 1 × −X / 100): a node 104 loss, not Life consumed. Read once per interval (the nearest
//     frame) while you keep the ailment on the dummy yourself: that you inflict it at least that often is inferred.
//   - "Consumes X% of current Life and Energy Shield per second while Fervor is active" (Ghost Slaughter, record 824274: gate 206 0.2 s,
//     node 500 current Life × X / 5, node 122): its own held-dip model stays in src/planner.js lifeLostState; inside a balance it is one
//     more loss every 0.2 s (counted as Life lost, not as Life consumed, as the consumption model has it).
const AILMENT_LOSS = /^Loses (\d+(?:\.\d+)?)% current Life(?: and Energy Shield)? when inflicting (\w+) ?\. Interval: (\d+(?:\.\d+)?) ?s$/i;
const FERVOR_DRAIN = /^Consumes (\d+(?:\.\d+)?) ?% of current Life(?: and Energy Shield)? per second while Fervor is active$/i;
// "Regenerates X% Life per second when Life is not full" (Eternal Sun, record 1033360269: attribute 1004 behind Not gate 218 type 1 at 1, i.e.
// Life below 100%): a conditional line the stat totals leave out. Read while current Life is under the full Max Life (that gate 218 divides
// by the full Max Life, so a sealed build is never full, is inferred: life-balance-regain-gate).
const NOT_FULL_REGENERATION = /^Regenerates (\d+(?:\.\d+)?)% Life per second when Life is not full$/i;
export function notFullRegenerationPercent(modifierTexts = []) {
  return lineTexts(modifierTexts).reduce((sum, item) => { const match = item.text.match(NOT_FULL_REGENERATION); return sum + (match ? Number(match[1]) : 0); }, 0);
}

export function lifeLossStreams({ modifierTexts = [], ownAilments = [], hasFervor = false } = {}) {
  const streams = [];
  for (const item of lineTexts(modifierTexts)) {
    let match = item.text.match(AILMENT_LOSS);
    if (match && ownAilments.includes(match[2])) { streams.push({ source: item.source, text: item.text, percentOfCurrent: Number(match[1]), eventsPerSecond: 1 / fixedIntervalSeconds(Number(match[3])), consumed: false, use: false }); continue; }
    match = item.text.match(FERVOR_DRAIN);
    if (match && hasFervor) streams.push({ source: item.source, text: item.text, percentOfCurrent: Number(match[1]) / 5, eventsPerSecond: 5, consumed: false, use: false });
  }
  return streams;
}

/**
 * Settle current Life against its consumes.
 * @param {object} p
 * @param {number} p.maxLife full Max Life (the denominator of every % here)
 * @param {number} p.unsealedPercent the max after the seal, % of Max Life (current Life never goes above it)
 * @param {object[]} p.streams [{ source, percentOfCurrent, eventsPerSecond, consumed = true, use = true }]: each event takes
 *   percentOfCurrent % of the frame's current Life (all of one event at once); `consumed` false: a loss (node 104), not Life consumed;
 *   `use` false: an event that is not a skill use (it does not weight the readers' level).
 * @param {number} p.fixedLifePerSecond Life paid as fixed skill costs per second (consumed; spread evenly)
 * @param {object|null} p.regain lifeBalanceRegain(...)
 * @param {number} p.hitsPerSecond the build's hits per second (a Regain without label 3010233 waits for a frame with a hit)
 * @param {number} p.regenerationPerSecond Life Regeneration per second (absolute Life)
 */
export function settleLifeBalance({ maxLife = 0, unsealedPercent = 100, streams = [], fixedLifePerSecond = 0, regain = null, hitsPerSecond = 0, regenerationPerSecond = 0, notFullRegenerationPerSecond = 0, seconds = 60, warmupSeconds = 4, lowLifePercent = LOW_LIFE_AT_MOST_PERCENT, fullLifePercent = FULL_LIFE_AT_LEAST_PERCENT } = {}) {
  const max = Math.max(0, Number(maxLife) || 0);
  const live = streams.filter((stream) => stream.percentOfCurrent > 0 && stream.eventsPerSecond > 0);
  if (!(max > 0) || !live.length) return { settled: false, reason: !(max > 0) ? "no Max Life" : "no consume of current Life" };
  const dt = LIFE_BALANCE_FRAME_SECONDS;
  const cap = Math.max(0, Math.min(1, (Number(unsealedPercent) || 0) / 100));
  const minimum = Math.min(cap, 1 / max);
  // The warm-up covers the approach from full Life: about five time constants of the slowest side (the consumes' share of current Life
  // a second, the Regain's share of missing Life a second, Regeneration), at least `warmupSeconds`, at most five minutes.
  const consumeRate = live.reduce((sum, stream) => sum + stream.percentOfCurrent / 100 * stream.eventsPerSecond, 0);
  const regainRate = regain ? regain.amountFraction / (regain.intervalFrames * dt) : 0;
  const settleSeconds = Math.min(300, Math.max(Number(warmupSeconds) || 0, 5 / Math.max(1e-3, consumeRate + regainRate)));
  const warm = Math.round(settleSeconds / dt), frames = warm + Math.round(Math.max(0, seconds - warmupSeconds) / dt);
  const accumulators = live.map(() => 0.5);
  const hitStream = { rate: Math.max(0, Number(hitsPerSecond) || 0), acc: 0.5 };
  const regen = Math.max(0, Number(regenerationPerSecond) || 0) / max * dt;
  const regenNotFull = Math.max(0, Number(notFullRegenerationPerSecond) || 0) / max * dt;
  const fixed = Math.max(0, Number(fixedLifePerSecond) || 0) / max * dt;
  let life = cap, timer = 0;
  let restorations = [];
  const stats = { frames: 0, timeLife: 0, uses: 0, useLife: 0, low: 0, notFull: 0, below50: 0, consumedLife: 0, consumedPercentRate: 0, lossLife: 0, regains: 0, regained: 0, restored: 0, regenerated: 0, min: Infinity, max: -Infinity };
  for (let frame = 0; frame < frames; frame += 1) {
    const counting = frame >= warm;
    // The frame's events, each on its own accumulator.
    let consumeShare = 0, lossShare = 0, uses = 0, nominal = 0;
    live.forEach((stream, index) => {
      accumulators[index] += stream.eventsPerSecond * dt;
      const count = Math.floor(accumulators[index] + 1e-9);
      accumulators[index] -= count;
      if (!count) return;
      if (stream.consumed === false) lossShare += count * stream.percentOfCurrent / 100;
      else { consumeShare += count * stream.percentOfCurrent / 100; nominal += count * stream.percentOfCurrent / 100; }
      if (stream.use !== false) uses += count;
    });
    hitStream.acc += hitStream.rate * dt;
    const hits = Math.floor(hitStream.acc + 1e-9);
    hitStream.acc -= hits;
    // Regain (the resource update, before the net): the timer counts down a frame; out, missing against the cap, field not zeroed.
    let gain = 0;
    timer -= 1;
    if (regain && timer <= 0 && (regain.noHit || hits > 0) && life < cap - EPS && (regain.gateBelowFraction === null || life < regain.gateBelowFraction - EPS)) {
      const amount = regain.amountFraction * (1 - life);
      const later = amount * regain.toRestorationShare;
      gain += amount - later;
      if (later > 0) restorations.push({ perFrame: later / regain.restorationFrames, left: later });
      timer = regain.intervalFrames;
      if (counting) { stats.regains += 1; stats.regained += amount - later; }
    }
    for (const entry of restorations) { const part = Math.min(entry.left, entry.perFrame); entry.left -= part; gain += part; if (counting) stats.restored += part; }
    restorations = restorations.filter((entry) => entry.left > EPS);
    const regenerated = regen + (life < 1 - EPS ? regenNotFull : 0);
    gain += regenerated;
    if (counting) stats.regenerated += regenerated;
    // Consumes and losses read the frame's current Life; the pending loss leaves 1 Life.
    const wanted = (consumeShare + lossShare) * life + fixed;
    const loss = Math.max(0, Math.min(wanted, life - minimum));
    const consumedPart = wanted > 0 ? loss * (consumeShare * life + fixed) / wanted : 0;
    if (counting) {
      stats.frames += 1; stats.timeLife += life; stats.uses += uses; stats.useLife += uses * life;
      if (life * 100 <= lowLifePercent + EPS) stats.low += uses;
      if (life * 100 < fullLifePercent - EPS) stats.notFull += uses;
      if (life < 0.5 - EPS) stats.below50 += uses;
      stats.consumedLife += consumedPart; stats.consumedPercentRate += nominal; stats.lossLife += loss - consumedPart;
      stats.min = Math.min(stats.min, life); stats.max = Math.max(stats.max, life);
    }
    life = Math.min(cap, life - loss + gain);
    // Fully restored: the active restorations end (manual 1001012522).
    if (life >= cap - EPS) restorations = [];
  }
  const time = stats.frames * dt;
  const useWeighted = stats.uses > 0 ? stats.useLife / stats.uses : stats.timeLife / Math.max(1, stats.frames);
  // The level that reproduces the consumed Life through percent × current Life × rate: consumed (less the fixed costs) over the
  // nominal share consumed per second.
  const fixedConsumed = fixed * stats.frames;
  const consumeWeighted = stats.consumedPercentRate > 0 ? Math.max(0, stats.consumedLife - fixedConsumed) / stats.consumedPercentRate : useWeighted;
  const share = (count) => stats.uses > 0 ? count / stats.uses : 0;
  const result = {
    settled: true,
    maxLife: round(max), unsealedPercent: round(cap * 100),
    currentLife: round(consumeWeighted * max), consumeWeightedLifePercent: round(consumeWeighted * 100), useWeightedLifePercent: round(useWeighted * 100),
    meanLifePercent: round(stats.timeLife / Math.max(1, stats.frames) * 100), minLifePercent: round(stats.min * 100), maxLifePercent: round(stats.max * 100),
    missingLifePercent: round((1 - useWeighted) * 100),
    lowLifeShare: round(share(stats.low), 6), notFullShare: round(share(stats.notFull), 6), fullLifeShare: round(1 - share(stats.notFull), 6), belowHalfShare: round(share(stats.below50), 6),
    consumedPerSecond: round(stats.consumedLife * max / time), lossPerSecond: round(stats.lossLife * max / time),
    regainsPerSecond: round(stats.regains / time), regainedPerSecond: round(stats.regained * max / time), restoredPerSecond: round(stats.restored * max / time), regeneratedPerSecond: round(stats.regenerated * max / time),
    usesPerSecond: round(stats.uses / time),
    streams: live.map((stream) => ({ source: stream.source, percentOfCurrent: round(stream.percentOfCurrent), eventsPerSecond: round(stream.eventsPerSecond), consumed: stream.consumed !== false })),
    fixedLifePerSecond: round(Math.max(0, Number(fixedLifePerSecond) || 0)), regain, hitsPerSecond: round(hitStream.rate), regenerationPerSecond: round(Math.max(0, Number(regenerationPerSecond) || 0) + Math.max(0, Number(notFullRegenerationPerSecond) || 0)),
    seconds: round(frames * dt), warmupSeconds: round(warm * dt), frameSeconds: dt
  };
  result.text = lifeBalanceText(result);
  return result;
}

/** One line for the reasons and the Config tab. */
export function lifeBalanceText(balance) {
  if (!balance?.settled) return balance?.reason || "not settled";
  const regain = balance.regain;
  const regainText = !regain ? "no Life Regain" : `Life Regain ${regain.cappedPercent}%${regain.doubled ? " × 2" : ""} of missing Life every ${regain.intervalFrames} frame(s) (${regain.intervalSeconds} s)${regain.noHit ? " without a hit" : " on a hit"}${regain.gateBelowFraction !== null ? ` while Life is under ${round(regain.gateBelowFraction * 100)}%` : ""}${regain.toRestorationShare ? `, ${round(regain.toRestorationShare * 100)}% of it as Restoration Over Time` : ""}`;
  const consumes = balance.streams.filter((stream) => stream.consumed).map((stream) => `${stream.source} ${stream.percentOfCurrent}% × ${stream.eventsPerSecond}/s`).join(", ");
  const losses = balance.streams.filter((stream) => !stream.consumed).map((stream) => `${stream.source} ${stream.percentOfCurrent}% × ${stream.eventsPerSecond}/s`).join(", ");
  return `current Life settles at ${balance.useWeightedLifePercent}% of Max Life at your uses (${balance.meanLifePercent}% on average, ${balance.minLifePercent}–${balance.maxLifePercent}%; the consumes read ${balance.consumeWeightedLifePercent}%): consumes of current Life ${consumes}${losses ? `; losses ${losses}` : ""}${balance.fixedLifePerSecond ? `; ${balance.fixedLifePerSecond} Life/s of Life costs` : ""}; against ${regainText}${balance.regenerationPerSecond ? ` and ${balance.regenerationPerSecond} Life/s of Regeneration` : ""} (30 Hz frames, SS14 client order)`;
}
