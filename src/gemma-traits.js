// Gemma's trait engines (hero trait audit batch B3, 2026-10-19; research/hero-traits-audit-2026-10-19.md §5 B3, §6 Q-H4).
// Pure helpers: src/hero-trait-modules.js reads the trait lines, calls these, derives the sustained lines and reports the timed
// parts the 5 s / 20 s windows and the recount follow (src/timed-effects.js).
//
// Frostfire Rampage (Ice-Fire Fusion; checked against the SS14 tables 2026-10-31, research/hero-gemma-chunk1-2026-10-31.md): game
// affix 688680704 adds 1 Fusion Energy per Fire or Cold tag on every use of a skill (rows 3 to 6, keyword 600: a skill with both tags
// adds 2), stored up to 5, so casts during the cooldown count. At full energy with the skill ready it casts stone 400002 (Split 186465):
// header cooldown 10 s, buff 81090 for 5 s (tags 5008003 and 5100310). At the buff's end the energy is removed (Split 186465
// reaction_removeenergy), so the next Rampage needs 5 more energy after the end: period P = max(cooldown, duration + 5 ÷ energy per
// second). With a cooldown at or under the duration the energy is still full when the skill is ready, so it is recast on its own
// buff and never ends (P = cooldown; inferred: a re-add refreshes the buff, no end event). Cooldown = 10 s ÷ max(0.1, (1 + Σ Cooldown
// Recovery Speed, the Frostfire-scoped and the general lines) × Π(1 + additional)): the client reads attr 6007 with the skill's tags.
// Duration = 5 s × (1 + Frostfire Rampage Duration + Skill Effect Duration). Uptime = min(1, duration ÷ P). Ice-Fire Radiance's end
// bonus fades linearly to 0 over 3 s after each end (901699904: a local counts down from 90 ticks), so a Rampage that never ends never
// fires it: its time average is peak × (m − m² ÷ 6) ÷ P, m = min(3, P).
//
// Cold Pulse (Frostbitten Heart; game affixes 315287 / 592944 / 12682557, stone 400000, Split 622525): energy fills 1 per tick to 30 ×
// interval (4 s, Dance of Frost −2 s) and a Cold Damage event casts the pulse at full energy; the cast empties it (Blooming's casts
// carry tag 6100062 and do not). Energy fills out of combat, so the first Cold hit casts one (t = 0). Blooming Frost Flower (479232):
// each inflicted Frostbite casts one more, 2 s per target, its own pulse's Frostbite included: every base pulse brings an extra one
// when 2 s have passed since the last extra; another Frostbite source on hit fires the extra pulse every 2 s from t = 0 (provisional).
// Cold Pulse deals damage: one hit per pulse (hit rule bHitOnce), damage row 90013 (Cold 3-3, 100% effectiveness) plus stone 400000's
// 511887 [0, 2]: +2 added Cold Damage per character level.
//
// Purgatory (Flame of Pleasure; Split 986761, stone 400011): auto-cast whenever the player is not in Purgatory and a charge is ready (the
// ≤ 1 s check delay ignored, as before: node 206 counts from the last cast, so it only delays a cast within 1 s of the last one). Duration
// = field 2501083 (5 s + Purgatory Duration lines) × attr 3402 on tags [5100310, 6210010]: Skill Effect Duration lines reach it. Cooldown =
// header 8 s ÷ the skill's Cooldown Recovery Speed. Charges ("+1 Max Purgatory Charges", Groaning Echo) recover one at a time on the
// cooldown (provisional), so the long-run uptime stays min(1, duration ÷ cooldown) and the extra charge recasts at once in the windows.
// Infernal Damnation (871334): a local adds the roll every 1 s while the Purgatory entity is active, and resets at a new cast or
// when it ends: ⌊seconds active⌋ stacks.

import { buildSkillHitProfile } from "./skill-hit-profiles.js";

export const HORIZON_SECONDS = 120;
const EPS = 1e-9;
const round = (value) => Math.round(value * 10000) / 10000;

/** Fusion Energy per use of a skill: one per Fire or Cold tag (688680704 rows 3 to 6, keyword 600). */
export const fusionEnergyPerUse = (tags = []) => tags.filter((tag) => tag === "Fire" || tag === "Cold").length;

/** A cooldown's speed factor: (1 + Σ increased) × Π(1 + additional), at least 0.1 (client: cd = base ÷ max(0.1, speed factor)). */
export const cooldownSpeedFactor = (increasedPercent = 0, additionalPercents = []) => Math.max(0.1, (1 + increasedPercent / 100) * additionalPercents.reduce((product, value) => product * (1 + value / 100), 1));

/**
 * Frostfire Rampage cycle: { durationSeconds, cooldownSeconds, periodSeconds, uptime, castsBound, ends, radianceShare }.
 * `castsPerSecond` is Fusion Energy per second (one per Fire or Cold tag on each use); `castSeconds` the refill after a Rampage ends.
 */
export function frostfireCycle({ baseDurationSeconds = 5, baseCooldownSeconds = 10, durationPercent = 0, cooldownRecoveryPercent = 0, cooldownRecoveryAdditional = [], castsNeeded = 5, castsPerSecond = null } = {}) {
  const durationSeconds = Math.max(0, baseDurationSeconds * (1 + durationPercent / 100));
  const cooldownSeconds = baseCooldownSeconds / cooldownSpeedFactor(cooldownRecoveryPercent, cooldownRecoveryAdditional);
  const castSeconds = castsPerSecond > 0 ? castsNeeded / castsPerSecond : castsPerSecond === 0 ? Infinity : 0;
  // The energy stays full until the buff ends: a cooldown at or under the duration recasts the Rampage before it ends (best case at equal
  // times: the same tick). Otherwise the next one waits for the refill after the end.
  const held = Number.isFinite(castSeconds) && cooldownSeconds <= durationSeconds + EPS;
  const refillSeconds = durationSeconds + castSeconds;
  const periodSeconds = held ? cooldownSeconds : Math.max(cooldownSeconds, refillSeconds);
  const uptime = Number.isFinite(periodSeconds) && periodSeconds > 0 ? Math.min(1, durationSeconds / periodSeconds) : 0;
  const ends = Number.isFinite(periodSeconds) && !held;
  const m = Math.min(3, periodSeconds);
  return {
    durationSeconds: round(durationSeconds), cooldownSeconds: round(cooldownSeconds), periodSeconds: Number.isFinite(periodSeconds) ? round(periodSeconds) : Infinity,
    castsBound: !held && refillSeconds > cooldownSeconds + EPS, castSeconds: Number.isFinite(castSeconds) ? round(castSeconds) : Infinity, uptime: round(uptime), ends,
    radianceShare: ends ? round((m - m * m / 6) / periodSeconds) : 0
  };
}

// Three-Chambered Heart (revived, Ice-Fire Fusion only), game record 5941629: rows 2 to 4, on the Main Skill dealing one Elemental type, write
// +12% additional damage on the other two for 4 s, on tag 6020000 (Main Skill). The value sits in the record ("value": 12).
export const ADVANCED_ELEMENTAL_IMPACT_PERCENT = 12;

// Cold Pulse's hit: stone 400000 (tags Area, Spell, Cold, Elemental, Hit, Pulse, Trait Skill, no main stat), damage row 90013 (one Lv. 1
// row: Cold 3-3, 100% effectiveness), stone affix 511887 [0, 2]: +2 Cold per character level. Split 622525's hit rule hits a target once.
export const COLD_PULSE_SETUP_KEY = "item-trigger:gemma-cold-pulse";
export const COLD_PULSE = Object.freeze({ gameRow: 90013, baseDamage: 3, perCharacterLevel: 2, effectiveness: 100, tags: Object.freeze(["Spell", "Cold", "Elemental", "Area", "Trait Skill"]) });
export const coldPulseBaseDamage = (characterLevel = 100) => COLD_PULSE.baseDamage + COLD_PULSE.perCharacterLevel * Math.max(1, Number(characterLevel) || 100);
export function coldPulseProfile({ characterLevel = 100, usesPerSecond = 0 } = {}) {
  const value = coldPulseBaseDamage(characterLevel);
  const levels = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [String(index + 1), { kind: "hit", effectiveness: COLD_PULSE.effectiveness, entries: [{ type: "Cold", min: value, max: value }] }]));
  const profile = buildSkillHitProfile({ name: "Cold Pulse", delivery: "spell-area",
    components: [{ key: "pulse", label: "Cold Pulse", groupId: COLD_PULSE.gameRow, group: { id: COLD_PULSE.gameRow, synthetic: `game row ${COLD_PULSE.gameRow}`, levels }, perUse: 1, basis: "text", note: "one hit per pulse at the dummy's location (Split 622525: hit once)" }],
    notes: [`Cold Pulse (chunk 1, 2026-10-31): game row ${COLD_PULSE.gameRow} ${COLD_PULSE.baseDamage} Cold + stone 400000's +${COLD_PULSE.perCharacterLevel} Cold per character level = ${value}, 100% effectiveness; one row, so its level adds nothing.`] });
  return Object.freeze({ ...profile, tags: [...COLD_PULSE.tags], spell: true, mainStats: [], useModel: { kind: "rate", usesPerSecond, firstUseSeconds: usesPerSecond > 0 ? 0 : null, note: "cast by the trait from the first Cold hit (src/gemma-traits.js)" }, spellBurstAllowed: false,
    sources: { gameData: `config_skill_damage group ${COLD_PULSE.gameRow}, config_skill_stone 400000, Split 622525 (gamedata-2026-10-31)`, timing: "cast by the trait, no use time" } });
}

/** Level of the Rampage (0 / 1) and of Radiance's fading end bonus (0–1) at time t, entries at start + n × period. */
export function frostfireLevels(cycle, startSeconds, time) {
  if (!Number.isFinite(cycle.periodSeconds) || time < startSeconds - EPS) return { rampage: 0, radiance: 0 };
  const n = Math.floor((time - startSeconds) / cycle.periodSeconds + EPS);
  const phase = time - startSeconds - n * cycle.periodSeconds;
  const rampage = !cycle.ends || phase < cycle.durationSeconds - EPS ? 1 : 0;
  let radiance = 0;
  if (cycle.ends) {
    // The latest end at or before t: this cycle's end if passed, else the previous cycle's.
    const end = phase >= cycle.durationSeconds - EPS ? startSeconds + n * cycle.periodSeconds + cycle.durationSeconds : n > 0 ? startSeconds + (n - 1) * cycle.periodSeconds + cycle.durationSeconds : null;
    if (end !== null && time - end < 3) radiance = Math.max(0, 1 - (time - end) / 3);
  }
  return { rampage, radiance };
}

/** Piecewise-constant steps for a level function (midpoint of each step), from 0 to the horizon. */
export function stepsOf(levelAt, edges, horizon = HORIZON_SECONDS, step = 0.25) {
  const times = new Set([0]);
  for (const edge of edges) if (edge > 0 && edge < horizon) times.add(round(edge));
  for (let t = step; t < horizon; t += step) times.add(round(t));
  const sorted = [...times].sort((a, b) => a - b);
  const points = [];
  for (let index = 0; index < sorted.length; index++) {
    const next = sorted[index + 1] ?? horizon;
    const level = round(levelAt((sorted[index] + next) / 2));
    if (!points.length || points[points.length - 1][1] !== level) points.push([sorted[index], level]);
  }
  return points;
}

/** Cold Pulse hit times from t = 0 (base pulses every interval; Blooming Frost Flower's extra pulses). */
export function coldPulseTimes({ intervalSeconds = 4, blooming = false, otherFrostbiteOnHit = false, horizon = HORIZON_SECONDS * 2 } = {}) {
  const times = [];
  let lastExtra = -Infinity;
  if (blooming && otherFrostbiteOnHit) for (let t = 0; t < horizon; t += 2) times.push(t);
  for (let t = 0; t < horizon; t += intervalSeconds) {
    times.push(t);
    if (blooming && !otherFrostbiteOnHit && t - lastExtra >= 2 - EPS) { times.push(t); lastExtra = t; }
  }
  return times.sort((a, b) => a - b);
}

/** Cold Pulse state: pulses per second, Dance of Frost stacks (hits within 8 s, up to 4) and a debuff's uptime (duration s after each hit). */
export function coldPulseState({ intervalSeconds = 4, blooming = false, otherFrostbiteOnHit = false, stackWindowSeconds = 8, maxStacks = 4, buffSeconds = 6 } = {}) {
  const times = coldPulseTimes({ intervalSeconds, blooming, otherFrostbiteOnHit });
  const horizon = HORIZON_SECONDS * 2;
  const stacksAt = (t) => Math.min(maxStacks, times.filter((at) => at <= t + EPS && at > t - stackWindowSeconds + EPS).length);
  const upAt = (seconds) => (t) => times.some((at) => at <= t + EPS && at > t - seconds + EPS) ? 1 : 0;
  // Long-run averages over the second half of the simulated span (the cycle is periodic by then).
  const average = (levelAt) => { let total = 0, count = 0; for (let t = horizon / 2; t < horizon - stackWindowSeconds; t += 0.05) { total += levelAt(t); count++; } return count ? total / count : 0; };
  const steady = times.filter((t) => t >= horizon / 2 && t < horizon - stackWindowSeconds);
  const pulsesPerSecond = steady.length / (horizon / 2 - stackWindowSeconds);
  const edges = [...new Set(times.flatMap((t) => [t, t + stackWindowSeconds, t + buffSeconds]))].filter((t) => t < HORIZON_SECONDS);
  return {
    intervalSeconds, blooming, otherFrostbiteOnHit, pulsesPerSecond: round(pulsesPerSecond),
    stacks: round(average(stacksAt)), stacksAt,
    buffUptime: (seconds) => round(average(upAt(seconds))), upAt,
    stackSteps: () => stepsOf(stacksAt, edges), upSteps: (seconds) => stepsOf(upAt(seconds), edges)
  };
}

/** Purgatory casts from t = 0: active intervals [[start, end]] with charges recovering one at a time on the cooldown. */
export function purgatoryIntervals({ durationSeconds = 5, cooldownSeconds = 8, charges = 1, horizon = HORIZON_SECONDS } = {}) {
  const intervals = [];
  let held = charges, recoverAt = Infinity, t = 0;
  for (let guard = 0; guard < 10000 && t < horizon; guard++) {
    // Charges that came back before t.
    while (recoverAt <= t + EPS) { held++; recoverAt = held < charges ? recoverAt + cooldownSeconds : Infinity; }
    if (held >= 1) {
      held--;
      if (recoverAt === Infinity) recoverAt = t + cooldownSeconds;
      intervals.push([t, t + durationSeconds]);
      t += durationSeconds;
    } else t = recoverAt;
  }
  return intervals;
}

/** Infernal Damnation's ⌊seconds active⌋ stacks averaged over a cycle of `periodSeconds` (the Purgatory lasts `durationSeconds`). */
export function infernalAverageStacks(durationSeconds, periodSeconds) {
  let integral = 0;
  for (let k = 1; k < durationSeconds - EPS; k++) integral += durationSeconds - k;
  return periodSeconds > 0 ? integral / periodSeconds : 0;
}
