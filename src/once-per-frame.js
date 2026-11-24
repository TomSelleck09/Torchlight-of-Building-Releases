// One success per frame on the dummy: chance procs whose trigger row carries bTriggerOnceWithSameSourceEntity (the recipe table's `tr.once`) on
// 1000030 / 1000033 (4 T Thea audit G2, 2026-11-23; research/build-4t-thea-psionic-audit-2026-11-23.md §4 G2, §9).
//
// Client (SS14, research/trigger-events-rea-2026-11-04.md §1-§2, proven):
// - 1000033 is raised once per hit damage event: each projectile, strike or area that lands on the dummy and passes its hit rule (a landing,
//   whatever its Shotgun falloff), and 1000030 once per such event too (and per DoT record per frame and per Reap, which a row needing the Hit
//   tag 5000003 never hears).
// - The flag allows at most one success per logic frame per target; the chance gate sits in the pre-check, so a failed roll leaves the frame
//   open: k events of a frame succeed with 1 − Π(1 − p_e), and the success is the first event that rolls it.
// - The repeat multiplier gives the first landing of a skill instance on the target 100% and each later sibling the hit rule's table share
//   (research/oq-shadows-seal-client-2026-11-05.md §1), so the first landing of a use is its full hit.
//
// So a proc that is worth something per success (Spell Ripple's Pulse, Sweeping Fury's ring) depends on how the qualifying events fall on the
// 30 Hz frames, not on events per second. The walk here is pure and exact in expectation: it places the skill's casts on frames from the planner's
// own schedule, each cast's landings on its frame in order, and sums each event's chance of being the frame's first success:
//   success_e = open × Π(earlier misses in the frame) × q_e, q_e = chance × the event's presence;
//   the value of a success is the event's own (Spell Ripple: 150% of that landing's hit, the first landing's full hit, a later one's falloff share).
// `open` is the row's cooldown gate when it is longer than a frame (node 206 on the nearest frame; a gate under one frame, Spell Ripple's
// 0.029 s, closes nothing beyond the frame itself), and a skill cooldown a trigger checks (Sweeping Fury's checkCD: the first frame at or after).
//
// The schedule (inferred, open question spell-ripple-frame-cap): the planner's use sources (rate.usesBySource), each on its own clock from 0:
// - your presses (manual), every 1 ÷ their rate;
// - Spell Burst: each activation (every Max Spell Burst automatic casts + a triggered activating cast, from the planner's spellBurstAuto rate)
//   casts the activating cast at 0 when a trigger casts it (Solid River, Banishment), then its automatic casts at j × the field 2006270 spacing
//   (j = 1 … Max Spell Burst; 30 T audit REA 2026-11-10: the Spell Burst step queues one record "count, spacing from field 2006270", cast by the
//   component's per-frame update when their time has come). REA 2026-11-23 (SS14 client, private notes): the record (0x141d9a900) keeps the
//   spacing and an elapsed time from 0; each frame the update (0x141f3f2e0) casts while the elapsed time has reached the spacing, taking one
//   spacing off per cast, then adds the frame's time, so the first automatic cast comes one spacing after the activation (5 frames at 0.15 s),
//   the next ones 4 or 5 frames apart (the comparator's direction is read from the loop's shape). A player's activating cast is one of the presses;
// - Multistrike repeats, triggered uses and anything left: their own even clocks.
// A cast lands all its landings on its own frame, in its component order: the engine's convention for a use's hits. Psionic Missile:
// Emission's pulse lands one frame after the cast's last explosion (user decision 2026-11-23: the support text "generates a pulse after all
// projectiles fired by the supported skill land"; the component's afterLastLanding, landingEvents' delayFrames;
// in its frame it rolls before the landings of a cast made in that frame: inferred). A channel or an area spreads its landings evenly instead.
// Spell Burst casts take the planner's Spell Burst bonus over its average
// (bonusFactor ÷ averageDamageFactor), the other uses the rest, so the per-use total is the planner's.
//
// Field 2006270 (法术迸发额外释放技能间隔时间, "Spell Burst extra cast interval"): config_char_field's default is 0.15 s (the f64 after the
// description, 2026-10-31 extraction: 0x3FC3333333333333; the same reading gives the defaults other evidence names: 99999 for Max Combo
// Points 2012115, 1 for the initial Multistrike Count 2006252, 0 for 2006253, 10 for the inflicter's Frostbite Rating 2007015).
// Proven by the table. The only writer in the 2026-10-31 catalog is Bing's Ingenuity Overload (140751360: 0.1 s when 3 < Max Spell Burst < 8,
// 0.05 s from 8, on its casts' tag 5008012 only), so every other Spell Burst spaces its automatic casts 0.15 s apart (the 4 T Thea audit's
// "0.1 s" read the Bing value).
import { fixedIntervalSeconds, framesFor } from "./frame-snapping.js";

export const FRAMES_PER_SECOND = 30;
export const SPELL_BURST_EXTRA_CAST_SPACING_SECONDS = 0.15;
export const OVERLOAD_CAST_TAG = 5008012;
// The walk's warm start and measured span (seconds): long enough that streams of unrelated periods meet in every phase.
export const ONCE_WALK = Object.freeze({ warmSeconds: 3, seconds: 300 });
const EPS = 1e-9;

/**
 * Field 2006270's value for a cast's tags: Bing's Ingenuity Overload casts (tag 5008012) read record 140751360's rows (0.1 s at 3 < Max Spell
 * Burst < 8, 0.05 s from 8; gate 300 operators 1 ">", 2 "<", 3 ">="), every other cast the table's default 0.15 s.
 */
export function spellBurstExtraCastSpacing({ tags = [], maxSpellBurst = 0 } = {}) {
  if (!(tags || []).includes(OVERLOAD_CAST_TAG)) return SPELL_BURST_EXTRA_CAST_SPACING_SECONDS;
  if (maxSpellBurst >= 8) return 0.05;
  if (maxSpellBurst > 3) return 0.1;
  return SPELL_BURST_EXTRA_CAST_SPACING_SECONDS;
}

/**
 * The landing events of one use, in order, from the hit's components (src/skill-hit-model.js perType): one group per strike (its typed parts
 * share a strikeKey), its landings (landingsPerUse: projectiles that reach the dummy, without falloff) and its value per use (every part's
 * perHit × hitsPerUse, added-only and split parts with the strike they belong to, else with the first strike). The first landing of a strike is
 * one full hit (value ÷ its falloff-weighted hits), the later ones share the rest evenly (a fan's falloff share); a fractional landing is an
 * event present that share of the time. Returns [{ value, presence, strike }] with Σ value × presence = the use's hit damage.
 * @param {object[]} components the hit's components ({ strikeKey, key, addedOnly, splitPart, hitsPerUse, perHit, landingsPerUse? })
 * @param {(component: object) => number} landingsOf landings per use of a counting part
 */
export function landingEvents(components = [], landingsOf = (component) => Number(component?.landingsPerUse) || Number(component?.hitsPerUse) || 0) {
  const strikes = new Map(), loose = [];
  for (const component of components) {
    if (!component) continue;
    const key = component.strikeKey ?? component.key ?? component.label;
    const value = (Number(component.perHit) || 0) * (Number(component.hitsPerUse) || 0);
    if (component.addedOnly || component.splitPart) { loose.push({ key, value }); continue; }
    const strike = strikes.get(key) || { key, value: 0, landings: 0, hits: 0, after: 0 };
    strike.value += value;
    strike.landings = Math.max(strike.landings, Number(landingsOf(component)) || 0);
    strike.hits = Math.max(strike.hits, Number(component.hitsPerUse) || 0);
    strike.after = Math.max(strike.after, Number(component.afterLastLanding) || 0);
    strikes.set(key, strike);
  }
  const list = [...strikes.values()].filter((strike) => strike.landings > EPS);
  if (!list.length) return [];
  for (const item of loose) (strikes.get(item.key) && strikes.get(item.key).landings > EPS ? strikes.get(item.key) : list[0]).value += item.value;
  const events = [];
  // A strike that lands N frames after the cast's last landing (Psionic Missile: Emission's pulse, afterLastLanding 1): every other strike
  // lands on the cast's own frame, so its delay is N frames.
  for (const strike of list) {
    const delay = strike.after > 0 ? { delayFrames: strike.after } : {};
    const whole = Math.floor(strike.landings + EPS), fraction = Math.max(0, strike.landings - whole);
    const presences = [...Array(whole).fill(1), ...(fraction > EPS ? [fraction] : [])];
    if (strike.landings >= 1 - EPS && strike.hits >= 1 - EPS) {
      const full = strike.value / strike.hits, rest = strike.landings > 1 + EPS ? (strike.value - full) / (strike.landings - 1) : 0;
      presences.forEach((presence, index) => events.push({ value: index === 0 ? full : rest, presence, strike: strike.key, ...delay }));
    } else {
      const each = strike.value / strike.landings;
      presences.forEach((presence) => events.push({ value: each, presence, strike: strike.key, ...delay }));
    }
  }
  return events;
}

/**
 * The casts of the planner's schedule (header): [{ key, periodSeconds, casts: [{ offsetSeconds, presence, scale }] }]. A clock places its casts at
 * n × period + offset from 0.
 * @param {object} rate the hit's rate (usesPerSecond, usesBySource, spellBurst, useModel, terraDurationSeconds)
 * @param {object} [options]
 * @param {number} [options.spacingSeconds] the automatic cast spacing (spellBurstExtraCastSpacing)
 */
export function useSchedule(rate, { spacingSeconds = SPELL_BURST_EXTRA_CAST_SPACING_SECONDS } = {}) {
  const uses = Number(rate?.usesPerSecond) || 0;
  if (!(uses > 0)) return [];
  const by = rate.usesBySource || { manual: uses };
  const burst = rate.spellBurst;
  const automatic = Number(burst?.automaticCastsPerActivation) || 0;
  const burstUses = burst && automatic > 0 ? Number(by.spellBurstAuto) || 0 : 0;
  const perActivation = automatic + (burst?.chargeTrigger ? 1 : 0);
  const activations = burstUses > 0 && perActivation > 0 ? burstUses / perActivation : 0;
  // Spell Burst casts at the bonus over the average, the rest at what keeps the planner's per-use total.
  const burstScale = activations > 0 && burst.averageDamageFactor > 0 && burst.bonusFactor > 0 ? burst.bonusFactor / burst.averageDamageFactor : 1;
  const otherUses = Math.max(0, uses - (activations > 0 ? burstUses : 0));
  const otherScale = activations > 0 && otherUses > EPS ? Math.max(0, (uses - burstScale * burstUses) / otherUses) : 1;
  const even = (key, perSecond, scale) => perSecond > EPS ? [{ key, periodSeconds: 1 / perSecond, casts: [{ offsetSeconds: 0, presence: 1, scale }] }] : [];
  const clocks = [];
  if (activations > 0) {
    const casts = burst.chargeTrigger ? [{ offsetSeconds: 0, presence: 1, scale: burstScale }] : [];
    const whole = Math.floor(automatic + EPS), fraction = Math.max(0, automatic - whole);
    for (let j = 1; j <= whole; j += 1) casts.push({ offsetSeconds: j * spacingSeconds, presence: 1, scale: burstScale });
    if (fraction > EPS) casts.push({ offsetSeconds: (whole + 1) * spacingSeconds, presence: fraction, scale: burstScale });
    clocks.push({ key: "spellBurst", periodSeconds: 1 / activations, casts });
  }
  const listed = ["manual", "multistrikeRepeat", "triggered"].reduce((sum, key) => sum + (Number(by[key]) || 0), 0);
  clocks.push(...even("manual", Number(by.manual) || 0, otherScale), ...even("multistrikeRepeat", Number(by.multistrikeRepeat) || 0, otherScale), ...even("triggered", Number(by.triggered) || 0, otherScale));
  // Uses no source names (Spell Burst casts without a Spell Burst schedule, a residue): their own clock.
  const rest = uses - listed - (activations > 0 ? burstUses : 0);
  if (rest > 1e-9 * uses) clocks.push(...even("other", rest, otherScale));
  return clocks;
}

const cache = new Map();
const CACHE_SIZE = 64;

/**
 * The walk (header): successes and their value per second on the dummy.
 * @param {object} p
 * @param {number} p.chance the gate-188 chance (0–1)
 * @param {object[]} p.clocks useSchedule's clocks
 * @param {{ value: number, presence: number, delayFrames?: number }[]} p.landings one use's landing events in order (landingEvents; a
 *   delayFrames puts a landing that many frames after its cast's frame: Emission's pulse, one frame)
 * @param {number} [p.gateFrames] frames a success closes the row for, the success's own included (1: the frame only)
 * @param {boolean} [p.spread] each landing its own event spread evenly over time (a channel, an area)
 * @returns {{ successShare, valueShare, successesPerSecond, valuePerSecond, eventsPerSecond, framesPerSecond, eventsPerBusyFrame, maxEventsPerFrame }}
 *   successShare: successes ÷ the chance's expected successes without the frame cap (Σ q); valueShare: the successes' value ÷ Σ q × value.
 */
export function oncePerFrameWalk({ chance, clocks, landings, gateFrames = 1, spread = false }) {
  const key = JSON.stringify([chance, clocks, landings, gateFrames, spread]);
  if (cache.has(key)) return cache.get(key);
  const { warmSeconds, seconds } = ONCE_WALK;
  const start = -warmSeconds, end = seconds;
  // Every cast time with its scale and presence; a spread rate becomes one clock per landing at the use rate × its presence.
  const casts = [];
  const sourceClocks = spread ? (() => {
    const perSecond = clocks.reduce((sum, clock) => sum + clock.casts.reduce((total, cast) => total + cast.presence, 0) / clock.periodSeconds, 0);
    const scale = perSecond > 0 ? clocks.reduce((sum, clock) => sum + clock.casts.reduce((total, cast) => total + cast.presence * cast.scale, 0) / clock.periodSeconds, 0) / perSecond : 1;
    const value = landings.reduce((sum, event) => sum + event.value * event.presence, 0);
    const count = landings.reduce((sum, event) => sum + event.presence, 0);
    return count > 0 && perSecond > 0 ? { clocks: [{ key: "spread", periodSeconds: 1 / (perSecond * count), casts: [{ offsetSeconds: 0, presence: 1, scale }] }], landings: [{ value: value / count, presence: 1 }] } : { clocks: [], landings: [] };
  })() : { clocks, landings };
  const frameOf = (t) => Math.ceil(t * FRAMES_PER_SECOND - EPS);
  for (const clock of sourceClocks.clocks) {
    const period = clock.periodSeconds;
    if (!(period > 0) || !Number.isFinite(period)) continue;
    for (const cast of clock.casts) {
      const first = Math.ceil((start - cast.offsetSeconds) / period - EPS);
      for (let n = first; n * period + cast.offsetSeconds < end; n += 1) casts.push({ t: n * period + cast.offsetSeconds, presence: cast.presence, scale: cast.scale });
    }
  }
  // Each landing on its cast's frame (+ its own delay in frames, an alternative reading), in time order, a cast's landings in their order.
  const events = [];
  for (const cast of casts) {
    const frame = frameOf(cast.t);
    sourceClocks.landings.forEach((event, order) => {
      const presence = cast.presence * event.presence;
      if (presence > 0) events.push({ frame: frame + (event.delayFrames || 0), t: cast.t, order, q: Math.min(1, chance * presence), presence, value: event.value * cast.scale });
    });
  }
  events.sort((a, b) => a.frame - b.frame || a.t - b.t || a.order - b.order);
  const firstFrame = 1, lastFrame = Math.round(end * FRAMES_PER_SECOND);
  // The successes of the last gateFrames − 1 frames (the row's gate: at most one success inside it).
  const recent = [];
  let recentSum = 0, successes = 0, value = 0, offered = 0, offeredValue = 0, count = 0, busy = 0, busyEvents = 0, maxEvents = 0;
  let index = 0;
  for (let frame = events.length ? events[0].frame : firstFrame; frame <= lastFrame; frame += 1) {
    let miss = 1, frameEvents = 0, frameValue = 0, frameOffered = 0, frameOfferedValue = 0;
    while (index < events.length && events[index].frame === frame) {
      const event = events[index];
      index += 1;
      frameValue += miss * event.q * event.value;
      miss *= 1 - event.q;
      frameEvents += event.presence;
      frameOffered += event.q;
      frameOfferedValue += event.q * event.value;
    }
    const open = gateFrames > 1 ? Math.max(0, 1 - recentSum) : 1;
    const frameSuccess = open * (1 - miss);
    if (gateFrames > 1) {
      recent.push(frameSuccess); recentSum += frameSuccess;
      if (recent.length > gateFrames - 1) recentSum -= recent.shift();
    }
    if (frame < firstFrame) continue;
    successes += frameSuccess;
    value += open * frameValue;
    offered += frameOffered;
    offeredValue += frameOfferedValue;
    count += frameEvents;
    if (frameEvents > 0) { busy += 1; busyEvents += frameEvents; maxEvents = Math.max(maxEvents, frameEvents); }
  }
  const span = (lastFrame - firstFrame + 1) / FRAMES_PER_SECOND;
  // The shares are what the planner reads: × its exact rates (chance × landings per second, chance × the hit damage per second), so a schedule
  // whose events never share a frame reads 1 exactly, whatever the span's partial periods.
  const result = Object.freeze({ successShare: offered > 0 ? successes / offered : 1, valueShare: offeredValue > 0 ? value / offeredValue : 1, successesPerSecond: successes / span, valuePerSecond: value / span, eventsPerSecond: count / span, framesPerSecond: busy / span, eventsPerBusyFrame: busy > 0 ? busyEvents / busy : 0, maxEventsPerFrame: maxEvents });
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
}

/** Frames a success closes a row for: its node 206 gate on the nearest frame and a skill cooldown the cast checks (the first frame at or after). */
export function onceGateFrames({ gateSeconds = 0, cooldownSeconds = 0 } = {}) {
  const gate = gateSeconds > 0 ? Math.round(fixedIntervalSeconds(gateSeconds) * FRAMES_PER_SECOND) : 1;
  const cooldown = cooldownSeconds > 0 && Number.isFinite(cooldownSeconds) ? framesFor(cooldownSeconds) : 1;
  return Math.max(1, gate, cooldown);
}
