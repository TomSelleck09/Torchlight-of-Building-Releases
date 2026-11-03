// Youga – Spacetime Illusion and Spacetime Elapse (hero trait audit batch B4, 2026-10-19; research/hero-traits-audit-2026-10-19.md
// §5 B4, §8 B4, §6 Q-H5 / Q-H6; checked against the SS14 tables 2026-10-31, research/hero-youga-chunk1-2026-10-31.md). Pure helpers:
// src/hero-trait-modules.js reads the trait lines into a state, src/planner.js applies the Illusion stream to the Main Skill's hit
// and Spacetime Turbulence to the damage paths, src/dummy-recount.js times the Turbulence releases. Readings the files do not settle
// stay provisional (src/open-questions.js lists them for Youga).
//
// Game records (SS14, rank 5; the audit's readable tables):
//   Spacetime Illusion  1300001: 14091253 [1.5, 8, 10] (on cast 1000069: +1.5% Cooldown Recovery Speed, 8 s, 10 stacks; the moon)
//   Me and Myself       1300011: 103010050 [5, 2.5, 13] convert 60071 (Cooldown Recovery Speed) → 24030002 (Illusion Cast Frequency)
//   Make it Quick       1300021: 101140027 [70] convert 60021 (Cast Speed) → 57191 (additional Illusion Damage), cap 300%
//   Eeeendless Mana     1300022: 314310 [25] Mana sealed; 257393 [4, 1.6] convert 24030002 → 57191
//   I'm Out of Mana     1300032: 103010051 [10, 10] on 1001280 (Illusion Mana consumption), buff 81520 for 4 s, 10 stacks
//   Spacetime Elapse    1310001: 960936 [2, 6] (cast on DoT 1000030, interval 2 s, 6 s); 728324 [50] records; 374187424 [25]
//   Spacetime Speed-up  1310011: 98606 [1, 11, 5]; Spacetime Pause 1310031: 364421504 [100] to recorded damage
//   Spacetime Upheaval  1310012: 415967 [58] attr 5719 add while buff 81601 (Twisted Spacetime) is up

export const ILLUSION_RECENT_SECONDS = 4;
// Buff 81602 (Spacetime Turbulence): base duration 2 s in its config_char_buff record, keyword 631 "for 2s".
export const TURBULENCE_BASE_SECONDS = 2;
const EPS = 1e-9;
const round = (value) => Math.round(value * 10000) / 10000;

/**
 * Me and Myself (game affix 103010050): node 114 from increased Cooldown Recovery Speed per +5% (a linear conversion, no step: panel
 * proof on affix 898342, research/frost-terra-panel-compare-2026-10-13.md) plus a field write of additional Cooldown Recovery Speed
 * ÷ 2.5 × p (no floor in the expression). Fractional "steps".
 */
export function meAndMyselfFrequency({ increasedPercent = 0, additionalPercent = 0, perStepPercent = 0 } = {}) {
  const fromIncreased = Math.max(0, increasedPercent) / 5;
  const fromAdditional = Math.max(0, additionalPercent) / 2.5;
  const steps = fromIncreased + fromAdditional;
  return { steps, fromIncreased, fromAdditional, percent: steps * perStepPercent };
}

/** Stacks held from a steady event rate: min(max, rate × seconds) (expected events in the window; provisional). */
export function stacksHeld(eventsPerSecond, seconds, maxStacks) {
  if (!(eventsPerSecond > 0) || !(seconds > 0)) return 0;
  return Math.min(maxStacks, eventsPerSecond * seconds);
}

/**
 * I'm Out of Mana (game affix 103010051): each gain adds a stack (node 374) and renews every stack (node 626, the node of "Refreshes
 * Trauma Duration on hit"), so the stacks climb to the cap whenever the gaps are shorter than the duration. With longer gaps one
 * stack is up for that share of the time.
 */
export function refreshedStacks(eventsPerSecond, seconds, maxStacks) {
  if (!(eventsPerSecond > 0) || !(seconds > 0)) return 0;
  const inWindow = eventsPerSecond * seconds;
  return inWindow >= 1 ? maxStacks : inWindow;
}

/**
 * The Illusion's use rate. Two limits (Make it Quick, game affix 923490112: "no longer has casting actions and is only limited by
 * cast frequency"; Eeeendless Mana, 314310: "no longer has Cast Frequency limitations"):
 *   - default: both: min(count × (1 + Cast Frequency) ÷ interval, count × its casting action);
 *   - Make it Quick: only the Cast Frequency rate;
 *   - Eeeendless Mana: only its casting action.
 * The casting action is read at the player's Main Skill cast rate (Q-H5, provisional: the Illusion's own Cast Speed is not in the
 * files); `actionPerSecond` is that rate for the default case, null for a cooldown-bound skill (a cooldown is no casting action).
 * The two traits share the Lv60 row, so they never meet in game; `open` only guards a hand-made state.
 * `playerCastsPerSecond` null (the first pass, before the hits): the frequency rate stands in.
 */
export function illusionRate({ intervalSeconds = 1.5, count = 1, castFrequencyPercent = 0, endlessMana = false, makeItQuick = false, playerCastsPerSecond = null, actionPerSecond = null } = {}) {
  const frequencyRate = count * (1 + castFrequencyPercent / 100) / intervalSeconds;
  if (!endlessMana) {
    const actionRate = Number.isFinite(actionPerSecond) && actionPerSecond > 0 ? count * actionPerSecond : null;
    if (makeItQuick || actionRate === null || frequencyRate <= actionRate) return { usesPerSecond: frequencyRate, basis: "frequency", frequencyRate, actionRate, open: false };
    return { usesPerSecond: actionRate, basis: "casting action", frequencyRate, actionRate, open: false };
  }
  const measured = Number.isFinite(playerCastsPerSecond) && playerCastsPerSecond > 0;
  return { usesPerSecond: measured ? count * playerCastsPerSecond : frequencyRate, basis: measured ? "casting action" : "frequency (no cast rate measured yet)", frequencyRate, open: Boolean(makeItQuick) };
}

/** Eeeendless Mana (game affix 257393, node 114, linear): +X% additional Illusion Damage for every +4% Cast Frequency. */
export const endlessManaDamage = (castFrequencyPercent, perStepPercent, stepPercent = 4) => Math.max(0, castFrequencyPercent) / stepPercent * perStepPercent;
/** Make it Quick: share% of the Cast Speed bonuses (increased) as additional Illusion Damage, up to the cap. */
export const makeItQuickDamage = (castSpeedIncreasedPercent, sharePercent, capPercent = 300) => Math.min(capPercent, Math.max(0, castSpeedIncreasedPercent) * sharePercent / 100);

/**
 * The Main Skill's hit with the Illusion stream (src/planner.js). Spell Burst (game manual; src/skill-hit-model.js): the Illusion's
 * castings are considered your castings, so a Spell Main Skill that can Spell Burst does so on the Illusion's casts too, with its
 * own charge (same Max Spell Burst and charge time as yours; provisional). Telepathy Expert (revived): each Illusion Spell Burst
 * also attempts yours, so your activations come from your casts and the Illusion's consumptions.
 * Returns the settled rates and per-use damage, or null without an Illusion.
 */
export function settleIllusionStream({ hit, illusion, telepathy = false }) {
  if (!hit || !illusion) return null;
  const sb = hit.rate?.spellBurst || null;
  const perUse = hit.combat.perUse;
  const base = sb ? perUse / (sb.averageDamageFactor || 1) : perUse;
  const B = sb ? sb.bonusFactor || 1 : 1;
  const N = sb ? sb.maxSpellBurst || 0 : 0;
  const charge = sb ? sb.fullChargeSeconds : Infinity;
  const ownManual = illusion.playerCasts ? Math.max(0, (hit.rate.usesPerSecond || 0) - (sb?.extraUsesPerSecond || 0)) : 0;
  const uI = illusion.usesPerSecond;
  const D = illusion.damageFactor;
  let usesP, burstP, usesI, burstI, aI = 0, aP = 0;
  if (sb) {
    aI = uI > 0 ? 1 / Math.max(charge, 1 / uI) : 0;
    const attempts = ownManual + (telepathy ? aI : 0);
    aP = attempts > 0 ? 1 / Math.max(charge, 1 / attempts) : 0;
    const fromOwn = attempts > 0 ? ownManual / attempts : 0;
    usesP = ownManual + N * aP; burstP = N * aP + aP * fromOwn;
    usesI = uI + N * aI; burstI = (1 + N) * aI;
  } else {
    usesP = illusion.playerCasts ? hit.rate.usesPerSecond || 0 : 0; burstP = 0;
    usesI = uI; burstI = 0;
  }
  const playerDps = base * (usesP + (B - 1) * burstP);
  const illusionDps = base * D * (usesI + (B - 1) * burstI);
  const totalRate = usesP + usesI;
  const dps = playerDps + illusionDps;
  return {
    playerUsesPerSecond: usesP, illusionUsesPerSecond: usesI, totalRate, dps, perUse: totalRate > 0 ? dps / totalRate : 0, playerDps, illusionDps,
    spellBurst: sb ? { maxSpellBurst: N, fullChargeSeconds: charge, bonusFactor: B, illusionActivationsPerSecond: aI, playerActivationsPerSecond: aP, telepathy: Boolean(telepathy), playerBurstCastsPerSecond: burstP, illusionBurstCastsPerSecond: burstI } : null,
    note: sb ? `Spell Burst on the Illusion's casts: ${round(aI)} activations/s (its own charge, ${N} stack(s), ${round(charge)} s)${telepathy ? `; Telepathy Expert: each also attempts yours, ${round(aP)} activations/s of yours` : ""} (provisional)` : ""
  };
}

/**
 * Twisted Spacetime (Spacetime Elapse; Q-H6, checked 2026-10-31). With damage over time on the dummy it is cast at once and recast
 * every casting interval (the trait's 2 s; To Myself in Another Spacetime: 1 s); each recast while it is active moves it and extends
 * it by 2 s, so it never ends (uptime 1).
 * Game files: the record share is one field, 2501053: the trait's p0 (728324), Spacetime Pause (364421504) and Speed-up's stacks
 * (98606, whole stacks of buff 81603) all add into it, and node 1112 records damage × that field. So share = (record + bonuses)%.
 * Keyword 631: "Deals True Damage equal to the shared damage every second for 2s"; buff 81602: "Removes Life equal to the shared
 * damage per second". So each move's record is dealt once per second for the Turbulence duration (instances of the buff coexist,
 * client routine 0x141a760e0 walks them): share × record × duration in all, evenly over the duration. The tick itself was not found
 * in the client; provisional, open question youga-twisted-spacetime-turbulence. The dummy, a Boss, is the only enemy, so it takes
 * the whole record. "Additional Damage" (also recorded) has no separate model and is not counted.
 */
export function twistedSpacetime({ intervalSeconds = 2, recordPercent = 0, bonusPercent = 0, speedUpPercent = 0, speedUpMaxStacks = 0, turbulenceSeconds = TURBULENCE_BASE_SECONDS } = {}) {
  const shareAt = (lastedSeconds) => (recordPercent + bonusPercent + speedUpPercent * Math.min(speedUpMaxStacks, Math.floor(Math.max(0, lastedSeconds) + EPS))) / 100;
  const sustainedRecordShare = (recordPercent + bonusPercent + speedUpPercent * speedUpMaxStacks) / 100;
  const sustainedShare = sustainedRecordShare * turbulenceSeconds;
  // Turbulence inside a window, per unit of the window's DoT and Reaping: each release at k × interval < W holds one interval's
  // record and deals it per second for the part of its duration inside the window.
  const windowFactor = (seconds) => {
    if (!(seconds > 0)) return sustainedShare;
    let total = 0;
    for (let k = 1; k * intervalSeconds < seconds - EPS; k++) total += shareAt(k * intervalSeconds) * intervalSeconds * Math.min(turbulenceSeconds, seconds - k * intervalSeconds);
    return total / seconds;
  };
  return { intervalSeconds, recordPercent, bonusPercent, speedUpPercent, speedUpMaxStacks, turbulenceSeconds, sustainedRecordShare, sustainedShare, shareAt, windowFactor };
}

/**
 * The Turbulence series of a recount timeline: at each move (k × interval) the share of the builders' damage (every DoT and
 * Reap series) dealt since the previous move is dealt per second for the Turbulence duration, from that bin on. `meta`: { builders,
 * intervalSeconds, recordPercent, bonusPercent, speedUpPercent, speedUpMaxStacks, turbulenceSeconds }.
 */
export function turbulenceSeries(bySource, meta, bins, stepSeconds) {
  const series = new Float64Array(bins);
  if (!meta || !(meta.intervalSeconds > 0)) return series;
  const spacetime = twistedSpacetime(meta);
  const builders = (meta.builders || []).map((key) => bySource[key]).filter(Boolean);
  let from = 0;
  for (let k = 1; ; k++) {
    const release = k * meta.intervalSeconds;
    const bin = Math.round(release / stepSeconds);
    if (bin >= bins) break;
    let recorded = 0;
    for (const source of builders) for (let b = from; b < bin; b++) recorded += source[b];
    const seconds = spacetime.turbulenceSeconds, ticks = Math.max(1, Math.round(seconds / stepSeconds));
    const perBin = recorded * spacetime.shareAt(release) * seconds / ticks;
    for (let b = bin; b < Math.min(bins, bin + ticks); b++) series[b] += perBin;
    from = bin;
  }
  return series;
}
