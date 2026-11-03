// Timed and stacking effects on the dummy or on the player (pact scripted-effects batch 2026-10-13): Ice Puppet's Ice Cage,
// Melting Flames, Witch Antelope of Lust, Bitter Thunder and the other pact-spirit and kismet effects that run on their own
// clock. One model serves the 5 s / 20 s windows (src/planner.js damagePaths), the dummy recount timeline
// (src/dummy-recount.js, through recountTimedEffects) and the sustained figures.
//
// An effect has one or more parts. A part is one multiplier in the damage ledgers, (1 + percent × L(t) / 100), where L(t) is
// its schedule's level t seconds after engagement: stacks for a ramp, 1 or 0 for a periodic effect, a count for a sum. The
// ledgers carry the sustained level L̄ (src/combat-states.js derives "+percent × L̄ %" lines), so the windows and the recount
// scale each source by (1 + p·L(t)) / (1 + p·L̄), which is 1 for the sustained figure.
//
// User decisions (2026-10-13): a cooldown buff or debuff starts with a cast at t = 0 in the 5 s / 20 s windows (best case)
// and the sustained figure uses its long-run uptime; debuffs on the dummy build from zero (the dummy starts clean); own buffs
// built before engaging start full (prebuiltSelfBuffs). Ice Cage: 1 stack per second from t = 0 (in-game tooltip, Ice Puppet
// Lv2, user 2026-10-13).
//
// Schedules:
//   { kind: "ramp", maxStacks, intervalSeconds, startStacks = 1 }      k(t) = min(max, startStacks + ⌊t / interval⌋)
//   { kind: "periodic", durationSeconds, periodSeconds, startSeconds = 0 }  1 during [start + n·period, start + n·period + duration)
//   { kind: "full", level = 1 }                                          constant
//   { kind: "sum", schedules: [...] }                                    Σ levels (crowd control types on the dummy)
//   { kind: "chance", chancePercent, hitsPerSecond, durationSeconds, firstHitSeconds = 1 / hitsPerSecond }
//       a debuff each hit inflicts with a chance (Grudge's Paralysis): hits at first + k / rate on the clean dummy, and the
//       expected uptime 1 − (1 − p)^min(hits so far, rate × duration); the cap is the sustained exponent (Tendonslicer rule).
//   { kind: "union", schedules: [...] }                                  1 − Π(1 − level): one debuff (max 1 stack) from
//       several independent sources (Paralysis from Grudge and Witch Antelope)
//   { kind: "steps", points: [[t, level], …], sustained }                a piecewise-constant level a module computes itself
//       (Erika's Stalker / Hunting Instinct multistrike states, src/erika-wind-stalker.js): the level of the last point at or
//       before t (0 before the first); `sustained` is the long-run level the ledgers hold
// Reach of a part: `type` (null: all damage; "Elemental": Fire, Cold and Lightning; else one damage type), `reach`
// ("all", "hit" or "dot") and optionally `keys` (only the sources whose share carries one of these keys, e.g. one skill's
// hits). A damage source's share: { hit: boolean, types: { Cold: 0.75, … }, key? } (its damage per type; the rest is untyped
// and only untyped parts reach it).
//
// This module is pure: it imports nothing and never mutates its inputs.

export const TIMED_EFFECT_HORIZON_SECONDS = 120;
const EPS = 1e-9;
const ELEMENTAL = new Set(["Fire", "Cold", "Lightning"]);

/** Level of a schedule at `time` seconds from engagement (0 before t = 0). */
export function scheduleLevelAt(schedule, time) {
  if (!schedule || !(time >= -EPS)) return 0;
  const t = Math.max(0, time);
  if (schedule.kind === "ramp") {
    const max = Math.max(0, Number(schedule.maxStacks) || 0);
    if (!max) return 0;
    const start = Math.max(0, Math.min(max, schedule.startStacks ?? 1));
    const interval = Number(schedule.intervalSeconds) > 0 ? Number(schedule.intervalSeconds) : Infinity;
    return Math.min(max, start + (Number.isFinite(interval) ? Math.floor(t / interval + EPS) : 0));
  }
  if (schedule.kind === "periodic") {
    const duration = Math.max(0, Number(schedule.durationSeconds) || 0), period = Number(schedule.periodSeconds) || 0;
    const start = Math.max(0, Number(schedule.startSeconds) || 0);
    if (!(duration > 0) || t < start - EPS) return 0;
    if (!(period > 0) || duration >= period - EPS) return 1;
    const phase = (t - start) - Math.floor((t - start) / period + EPS) * period;
    return phase < duration - EPS ? 1 : 0;
  }
  if (schedule.kind === "full") return Number.isFinite(schedule.level) ? schedule.level : 1;
  if (schedule.kind === "sum") return (schedule.schedules || []).reduce((sum, item) => sum + scheduleLevelAt(item, time), 0);
  if (schedule.kind === "chance") {
    const { p, rate, cap, first } = chanceParameters(schedule);
    if (!(p > 0) || !(rate > 0) || t < first - EPS) return 0;
    return 1 - (1 - p) ** Math.min(cap, Math.floor((t - first) * rate + EPS) + 1);
  }
  if (schedule.kind === "union") return 1 - (schedule.schedules || []).reduce((rest, item) => rest * (1 - Math.min(1, scheduleLevelAt(item, time))), 1);
  if (schedule.kind === "steps") {
    let level = 0;
    for (const [at, value] of schedule.points || []) { if (at <= t + EPS) level = Number(value) || 0; else break; }
    return level;
  }
  return 0;
}

function chanceParameters(schedule) {
  const p = Math.max(0, Math.min(1, (Number(schedule.chancePercent) || 0) / 100));
  const rate = Math.max(0, Number(schedule.hitsPerSecond) || 0), duration = Math.max(0, Number(schedule.durationSeconds) || 0);
  const first = Number.isFinite(schedule.firstHitSeconds) ? Math.max(0, schedule.firstHitSeconds) : rate > 0 ? 1 / rate : Infinity;
  return { p, rate, cap: rate * duration, first };
}

/** Long-run level the ledgers carry: full stacks, duration ÷ period, or the constant. */
export function sustainedLevel(schedule) {
  if (!schedule) return 0;
  if (schedule.kind === "ramp") return Math.max(0, Number(schedule.maxStacks) || 0);
  if (schedule.kind === "periodic") {
    const duration = Math.max(0, Number(schedule.durationSeconds) || 0), period = Number(schedule.periodSeconds) || 0;
    if (!(duration > 0)) return 0;
    return period > 0 ? Math.min(1, duration / period) : 1;
  }
  if (schedule.kind === "full") return Number.isFinite(schedule.level) ? schedule.level : 1;
  if (schedule.kind === "sum") return (schedule.schedules || []).reduce((sum, item) => sum + sustainedLevel(item), 0);
  if (schedule.kind === "chance") { const { p, cap } = chanceParameters(schedule); return p > 0 ? 1 - (1 - p) ** cap : 0; }
  if (schedule.kind === "union") return 1 - (schedule.schedules || []).reduce((rest, item) => rest * (1 - Math.min(1, sustainedLevel(item))), 1);
  if (schedule.kind === "steps") return Number(schedule.sustained) || 0;
  return 0;
}

/** Times in (0, horizon) where the level changes, sorted. */
export function scheduleEdges(schedule, horizon = TIMED_EFFECT_HORIZON_SECONDS) {
  const edges = new Set();
  const push = (time) => { if (time > EPS && time < horizon - EPS) edges.add(Math.round(time * 1e9) / 1e9); };
  if (schedule?.kind === "ramp") {
    const max = Math.max(0, Number(schedule.maxStacks) || 0), start = Math.max(0, Math.min(max, schedule.startStacks ?? 1));
    const interval = Number(schedule.intervalSeconds) > 0 ? Number(schedule.intervalSeconds) : Infinity;
    if (Number.isFinite(interval)) for (let index = 1; index <= max - start; index++) push(index * interval);
  } else if (schedule?.kind === "periodic") {
    const duration = Math.max(0, Number(schedule.durationSeconds) || 0), period = Number(schedule.periodSeconds) || 0;
    const start = Math.max(0, Number(schedule.startSeconds) || 0);
    if (duration > 0) {
      push(start);
      if (period > 0 && duration < period - EPS) for (let cast = start; cast < horizon; cast += period) { push(cast); push(cast + duration); }
    }
  } else if (schedule?.kind === "steps") {
    for (const [at] of schedule.points || []) push(Number(at));
  } else if (schedule?.kind === "sum" || schedule?.kind === "union") {
    for (const item of schedule.schedules || []) for (const edge of scheduleEdges(item, horizon)) edges.add(edge);
  } else if (schedule?.kind === "chance") {
    // One edge per hit until the hit count reaches the sustained exponent; the level is constant after that.
    const { p, rate, cap, first } = chanceParameters(schedule);
    if (p > 0 && rate > 0) for (let index = 0; index < Math.ceil(cap - EPS) + 1 && first + index / rate < horizon; index++) push(first + index / rate);
  }
  return [...edges].sort((a, b) => a - b);
}

/** A part's factor at `time` relative to the sustained value the ledgers hold: (1 + p·L(t)) / (1 + p·L̄). */
export function partFactorAt(part, time) {
  const percent = Number(part?.percent) || 0;
  if (!percent) return 1;
  const sustained = 1 + percent * sustainedLevel(part.schedule) / 100;
  if (!(sustained > 0)) return 1;
  return (1 + percent * scheduleLevelAt(part.schedule, time) / 100) / sustained;
}

const reachesSource = (part, share) => (!part.keys || part.keys.includes(share?.key)) && (part.reach === "hit" ? Boolean(share?.hit) : part.reach === "dot" ? !share?.hit : true);
const reachesType = (part, type) => !part.type || part.type === type || (part.type === "Elemental" && ELEMENTAL.has(type));

/** Factor of a damage source (its share) at `time`: Σ over its types of share × Π the parts that reach that type. */
export function sourceFactorAt(parts, share, time, partFactor = partFactorAt) {
  const active = (parts || []).filter((part) => part && Number(part.percent) && reachesSource(part, share));
  if (!active.length) return 1;
  const types = Object.entries(share?.types || {}).filter(([, value]) => Number.isFinite(value) && value > 0);
  const typed = types.reduce((sum, [, value]) => sum + value, 0);
  const product = (type) => active.filter((part) => reachesType(part, type)).reduce((factor, part) => factor * partFactor(part, time), 1);
  return types.reduce((sum, [type, value]) => sum + value * product(type), 0) + Math.max(0, 1 - typed) * product(null);
}

/** Every level change of the parts in (0, horizon), sorted. */
export function timedBoundaries(parts, horizon = TIMED_EFFECT_HORIZON_SECONDS) {
  const edges = new Set();
  for (const part of parts || []) for (const edge of scheduleEdges(part?.schedule, horizon)) edges.add(edge);
  return [...edges].sort((a, b) => a - b);
}

/** Time average of a source's factor over [0, seconds) (exact: piecewise constant). 1 for seconds ≤ 0 (sustained). */
export function timedWindowFactor(parts, share, seconds) {
  if (!(seconds > 0) || !(parts || []).some((part) => part && Number(part.percent))) return 1;
  const edges = [0, ...timedBoundaries(parts, seconds), seconds];
  let total = 0;
  // Each segment is read at its midpoint (2026-10-27): an edge rounded to 1e-9 s can sit a hair below the exact k × interval, where
  // the ramp's ⌊t ÷ interval⌋ still reads the previous stack, so a left-edge reading held a ramp one stack short for the rest of
  // the window (Erika's Numbed ramp: its 20 s window read 0.899 instead of 0.971).
  for (let index = 0; index + 1 < edges.length; index++) total += sourceFactorAt(parts, share, (edges[index] + edges[index + 1]) / 2) * (edges[index + 1] - edges[index]);
  return total / seconds;
}

/** A source's share of each damage type from its per-type components (generic skill hits), else its damage type. */
export function hitTypeShares(hit) {
  const components = hit?.components || [];
  const total = components.reduce((sum, component) => sum + (Number(component.perUse) || 0), 0);
  // The source key lets a part reach one skill's hits only (`keys`); parts without keys ignore it.
  const key = hit?.key ? { key: hit.key } : {};
  if (!(total > 0)) return { hit: true, types: hit?.damageType ? { [hit.damageType]: 1 } : {}, ...key };
  const types = {};
  for (const component of components) if (component.type && Number(component.perUse) > 0) types[component.type] = (types[component.type] || 0) + Number(component.perUse) / total;
  return { hit: true, types, ...key };
}

/**
 * Recount input (src/dummy-recount.js imports nothing): each part as a piecewise-constant factor series over [0, horizon),
 * `edges[i]` the start of segment i (edges[0] = 0) and `factors[i]` its factor, plus the sources' shares by recount key.
 */
export function recountTimedEffects(parts, shares = {}, horizon = TIMED_EFFECT_HORIZON_SECONDS) {
  const series = (parts || []).filter((part) => part && Number(part.percent)).map((part) => {
    const edges = [0, ...scheduleEdges(part.schedule, horizon)];
    // Each segment's factor is read at its midpoint, as in timedWindowFactor (2026-10-27: a left edge rounded to 1e-9 s held a ramp
    // one stack short).
    return { type: part.type || null, reach: part.reach || "all", ...(part.target ? { target: part.target } : {}), ...(part.keys ? { keys: [...part.keys] } : {}), edges, factors: edges.map((edge, index) => partFactorAt(part, (edge + (index + 1 < edges.length ? edges[index + 1] : horizon)) / 2)) };
  });
  return series.length ? { parts: series, shares } : null;
}
