// Erika (Wind Stalker): the trait state the damage engines read (Erika batch, 2026-10-14). The trait lines arrive as build
// lines (origin "trait", src/character-stats.js heroTraitStatLines at the planner's trait levels); the plain ones ("+X%
// additional damage", "+X% additional Attack Speed", "The Main Skill is supported by Lv. 10 Multistrike") already reach the
// engines. This module settles the Stalker and Multistrike clauses the plain readers cannot, and the hero-exclusive revived
// affix Cat's Night Safari (Hunting Instinct). src/skill-hit-model.js applies the result to every Attack hit that
// Multistrikes (multistrikeSequence); src/hero-trait-modules.js carries the badges.
//
// Sourced (reference data  and its keyword tooltips, captured 2026-10-14; game manual entries in
// config_multi_language_en, quoted in src/skill-hit-model.js multistrikeSequence):
// - Stalker (hyperlink 644): "+13% additional damage during Multistrike for every stack of Stalker. Initial max stacks: 3.
//   Lasts for 4s".
// - Base trait: "Gains 1 stack of Stalker for every 1 m of movement"; "Your Multistrike Count will not be interrupted during
//   Stalker" (manual 1001020121: moving or using other skills interrupts Multistrike).
// - Cat's Vision: "At Max Multistrike Count, +1 to Max Stalker Stacks, up to +3, until Stalker ends".
// - Cat's Punches: "At Max Multistrike Count, gains 1 stack of Stalker"; "+1 to the initial Multistrike Count for every 3
//   stack(s) of Stalker".
// - Cat's Scratch: "+X% additional Multistrike damage increment for 4 s when the Max Multistrike Count is reached" (manual
//   1001020126: the increment is multiplied by 1 + X%). Game affix 889828224 writes attr 63501 mod 4, and Thunder Slash's
//   Steep-chance increment (570299392) is a second mod 4 write, so the two multiply (2026-10-31; this replaces the 2026-10-14 AI
//   answer that they shared one pool).
// - Cat's Night Safari (Memory Revival, Hero Trait Exclusive: Cateye Erika | Wind Stalker): "Gains 1 stack of Interest upon
//   dealing damage to an Elite enemy. Interval: 1s. Gains Hunting Instinct when having 5 stack(s) of Interest"; Hunting
//   Instinct (reference data keyword): "+1 to Initial Multistrike Count and Max Multistrike Count. +15% additional Attack Damage to
//   attacks that reach max Multistrike Count. Lasts for 30s. Unable to gain Interest during Hunting Instinct". The training
//   dummy counts as a Boss, so an Elite (src/dummy-target.js).
//
// Provisional readings (listed in the recount assumptions; questions to the user):
// - Sequence: see multistrikeSequence. User-accepted 2026-10-14 (research/google-ai-mode-answers-2026-10-13.md §10): the
//   initial count shifts every count and the attack count follows the chance; "during Multistrike" = the repeated attacks
//   only, not the triggering first hit. Still provisional: the max-count attack = the last of a sequence; one Max Multistrike Count event per
//   sequence that multistrikes). Hunting Instinct's "+1 Max Multistrike Count" is the same shift under that reading.
// - Stalker stacks held = min(max stacks, gains per second × duration) (each stack on its own timer; a refresh-all reading
//   gives the same count whenever gains × duration ≥ max). The duration is 4 s × (1 + Skill Effect Duration): buff 82151 carries
//   tag 5100310 as Electrify's does (2026-10-31). Max stacks 3 + Cat's Vision's +3 once Max Multistrike Count events
//   keep Stalker up. Moving (the Movement group's Moving option) holds the max from movement alone.
// - Standing still with no Stalker gain at Max Multistrike Count: Stalker only from own buffs built before engaging (4 s),
//   then none.
// - Windows (5 s / 20 s, recount): Stalker gains at each Max Multistrike Count event from t = 0 (every multistriking hit's
//   events merged, the k-th of a hit at k ÷ its event rate); own buffs built before engaging (prebuiltSelfBuffs) start full,
//   Hunting Instinct included; otherwise Interest starts at the first hit.
//
// User-confirmed 2026-10-14 (Cat's Night Safari): "the 5 Interest stacks are not used up when Hunting Instinct starts; they
// are simply locked." So when Hunting Instinct ends after 30 s the stacks are still 5 and it restarts at once: one continuous
// window from the first moment 5 Interest is reached (1 Interest per 1 s of damage to an Elite, the first at the first hit)
// to the horizon, and 100% uptime in the sustained figure. Interest has no duration of its own while the dummy is hit.
// Conflict kept as the user said (research/hero-erika-chunk1-2026-10-31.md C-E1): game affix 5170941 removes Interest (buff 82193,
// node 302) when it grants Hunting Instinct, which would read 30 ÷ 34 s.

import { multistrikeSequence, multistrikeStatesDamage } from "./skill-hit-model.js";
import { revivedAffixCounts } from "./hero-exclusive-revivals.js";

export const WIND_STALKER = "erika-wind-stalker";
export const STALKER = Object.freeze({ perStackAdditionalPercent: 13, initialMaxStacks: 3, durationSeconds: 4, source: "Keyword Stalker (hyperlink 644)" });
export const HUNTING_INSTINCT = Object.freeze({ initialCountBonus: 1, maxCountBonus: 1, maxCountAttackAdditionalPercent: 15, durationSeconds: 30, interestStacks: 5, interestIntervalSeconds: 1, revivedAffix: "Cat's Night Safari", source: "Memory_Revival: Cat's Night Safari; keyword Hunting_Instinct" });
const HORIZON_SECONDS = 120;
const EPS = 1e-9;
const round = (value) => Math.round(value * 10000) / 10000;
const clean = (text) => String(text ?? "").replace(/\s+/g, " ").replace(/(\d) %/g, "$1%").replace(/ ,/g, ",").trim();

export const WIND_STALKER_PATTERNS = Object.freeze({
  movementGain: /^Gains (\d+) stacks? of Stalker for every ([\d.]+) m of movement$/i,
  noInterrupt: /^Your Multistrike Count will not be interrupted during Stalker$/i,
  maxStacks: /^At Max Multistrike Count, \+(\d+) to Max Stalker Stacks, up to \+(\d+), until Stalker ends$/i,
  maxCountGain: /^At Max Multistrike Count, gains (\d+) stacks? of Stalker$/i,
  initialPerStacks: /^\+(\d+) to the initial Multistrike Count for every (\d+) stack\(s\) of Stalker$/i,
  scratch: /^\+(\d+(?:\.\d+)?)% additional Multistrike damage increment for ([\d.]+) s when the Max Multistrike Count is reached$/i,
  moonMark: /^While Stalker is active, marks all enemies within \+?([\d.]+) ?m\.? ?(?:\+(\d+(?:\.\d+)?)% Mark Effect)?$/i,
  catDive: /^During Multistrike, there is a (\d+(?:\.\d+)?)% chance for this attack to deal damage equal to the Max Multistrike Count for every \+1% Movement Speed you have$/i,
  interest: /^(\d+(?:\.\d+)?)% of the increase\/decrease on Movement Speed is also applied to additional Attack Damage, up to \+(\d+(?:\.\d+)?)% additional Attack Damage$/i
});

// Movement Speed (2026-10-14): the build's total increase (src/character-stats.js movementSpeed: the sum of the % lines,
// including the base trait's +26%), counted in full by the user rule that movement is constant ("in the real game you are
// always moving", 2026-10-14). Conditional Movement Speed lines (line-effects) are not in that total.
// - Interest (Lv45 slot; reference data text): share × Movement Speed as additional Attack Damage, capped at the trait's "up to".
// - Cat Dive (Lv75 slot; user-supplied reading, confirmed 2026-10-14; provisional): chance = per-level value × Movement Speed %,
//   capped at 100%; settled per repeated attack in src/skill-hit-model.js multistrikeSequence (catDiveChancePercent).
// - Artificial Moon (base trait, gate src/hero-memory-rules.js artificialMoonGate; the line only arrives when it passes):
//   "While Stalker is active, marks all enemies within +8 m. +30% Mark Effect": a Mark source while Stalker is held (the player
//   stands within 8 m, best case) and +30% Mark Effect (src/mark-effect.js).
function movementReaders(lines, movementSpeedPercent) {
  const ms = Number(movementSpeedPercent) || 0;
  const interest = lines.interest ? (() => {
    const share = Number(lines.interest.match[1]), cap = Number(lines.interest.match[2]);
    const raw = share / 100 * ms;
    return { sharePercent: share, capPercent: cap, movementSpeedPercent: ms, rawPercent: raw, valuePercent: Math.min(cap, raw), capped: raw > cap, source: lines.interest.source };
  })() : null;
  const catDive = lines.catDive ? (() => {
    const per = Number(lines.catDive.match[1]);
    const raw = per * Math.max(0, ms);
    return { perPercent: per, movementSpeedPercent: ms, rawChancePercent: raw, chancePercent: Math.min(100, raw), source: lines.catDive.source };
  })() : null;
  return { interest, catDive };
}

/** The Wind Stalker clauses among the build's trait lines (origin "trait"). */
export function readWindStalkerLines(modifierTexts = []) {
  const found = {};
  for (const line of modifierTexts) {
    if (line.origin !== "trait") continue;
    const text = clean(line.text);
    for (const [key, pattern] of Object.entries(WIND_STALKER_PATTERNS)) {
      const match = text.match(pattern);
      if (match && !found[key]) found[key] = { source: line.source, text, match: [...match] };
    }
  }
  return found;
}

/** The equipped memory carrying Cat's Night Safari (Hero Trait Exclusive: Wind Stalker), or null. */
export function catsNightSafariMemory(hero = {}) {
  if (hero?.selectedHeroId !== WIND_STALKER) return null;
  const ids = new Set(Object.values(hero?.equippedMemoryIds || {}).filter(Boolean));
  // Only the counted revived memory reads (Q-H11, provisional; src/hero-exclusive-revivals.js).
  return (hero?.memoryInventory || []).find((memory) => ids.has(memory.id) && String(memory.revivedAffix || "").trim() === HUNTING_INSTINCT.revivedAffix && revivedAffixCounts(hero, memory)) || null;
}

/**
 * The build-level state (no hit rates yet): which clauses the build carries and whether any active Attack skill can
 * Multistrike. src/planner.js puts it on the line-condition state for the badges; resolveWindStalker adds the rates.
 * @param {object} p
 * @param {string} p.heroId
 * @param {object[]} p.modifierTexts
 * @param {object} p.hero planner state.hero
 * @param {boolean} p.moving the Movement group's choice
 * @param {boolean} p.prebuiltSelfBuffs
 * @param {boolean} p.multistrikes an active Attack skill (not Mobility, Channeled or Sentry) has Multistrike chance
 * @param {number} p.skillEffectDurationPercent Stalker's buff carries the Skill Effect Duration tag
 */
export function windStalkerState({ heroId, modifierTexts = [], hero = {}, moving = false, prebuiltSelfBuffs = true, multistrikes = false, movementSpeedPercent = 0, skillEffectDurationPercent = 0 } = {}) {
  if (heroId !== WIND_STALKER) return null;
  const lines = readWindStalkerLines(modifierTexts);
  const memory = catsNightSafariMemory(hero);
  const maxStackBonus = lines.maxStacks ? Number(lines.maxStacks.match[2]) : 0;
  const maxCountGain = lines.maxCountGain ? Number(lines.maxCountGain.match[1]) : 0;
  const initial = lines.initialPerStacks ? { count: Number(lines.initialPerStacks.match[1]), per: Number(lines.initialPerStacks.match[2]) } : null;
  const scratch = lines.scratch ? { percent: Number(lines.scratch.match[1]), seconds: Number(lines.scratch.match[2]) } : null;
  // Stalker is kept up by movement (Moving) or by Max Multistrike Count events (Cat's Punches); standing still without the
  // latter it lasts only the 4 s of own buffs built before engaging.
  const sustained = Boolean(lines.movementGain && moving) || Boolean(maxCountGain > 0 && multistrikes);
  const { interest, catDive } = movementReaders(lines, movementSpeedPercent);
  const moonMark = lines.moonMark ? { meters: Number(lines.moonMark.match[1]), effectPercent: lines.moonMark.match[2] != null ? Number(lines.moonMark.match[2]) : 0, active: sustained, source: lines.moonMark.source, text: lines.moonMark.text } : null;
  return {
    active: true, heroId, lines, moving: Boolean(moving), prebuiltSelfBuffs: prebuiltSelfBuffs !== false, multistrikes: Boolean(multistrikes),
    stalker: { gainsFromMovement: Boolean(lines.movementGain), maxCountGain, maxStackBonus, initial, sustained, perStackPercent: STALKER.perStackAdditionalPercent, initialMaxStacks: STALKER.initialMaxStacks, durationSeconds: STALKER.durationSeconds * Math.max(0, 1 + (Number(skillEffectDurationPercent) || 0) / 100) },
    movementSpeedPercent: Number(movementSpeedPercent) || 0, interest, catDive, moonMark,
    scratch,
    huntingInstinct: memory ? { memoryId: memory.id, memory: memory.name || memory.type, ...HUNTING_INSTINCT } : null
  };
}

/**
 * Artificial Moon's Mark for src/mark-effect.js resolveMark ({ extraSources, extraEffects }), or null when the line is absent
 * (gate shut). Game affix 16707301: the Mark needs Stalker (row 0, buff 82151), the +30% Mark Effect does not (row 1, no gate), so
 * another Mark source keeps it when Stalker is not held on the dummy.
 */
export function windStalkerMoonMark(state) {
  const moon = state?.moonMark;
  if (!moon) return null;
  const source = `${moon.source} (Artificial Moon)`;
  return {
    extraSources: moon.active ? [{ source, text: `While Stalker is active, marks all enemies within +${moon.meters} m (Stalker held; the player stands within ${moon.meters} m of the dummy, best case)`, origin: "trait", chancePercent: 100, on: "stalker" }] : [],
    extraEffects: moon.effectPercent ? [{ source, text: `+${moon.effectPercent}% Mark Effect (while Stalker is active)`, origin: "trait", value: moon.effectPercent, active: true }] : []
  };
}

// Merged Max Multistrike Count event times in (0, horizon): the k-th event of a hit at k ÷ its event rate (provisional).
function eventTimes(rates, limit, horizon = HORIZON_SECONDS) {
  const times = [];
  for (const rate of rates) if (rate > 0) for (let k = 1; k <= limit && k / rate < horizon; k++) times.push(k / rate);
  return times.sort((a, b) => a - b).slice(0, limit);
}

// Hunting Instinct windows from engagement: one [start, horizon) window. Interest is locked at 5, not used up, so Hunting
// Instinct restarts as soon as it ends (user-confirmed 2026-10-14): uptime 100% after the first activation.
function huntingInstinctWindows({ prebuilt, firstHitSeconds }, horizon = HORIZON_SECONDS) {
  const { interestStacks, interestIntervalSeconds: interval } = HUNTING_INSTINCT;
  const start = prebuilt ? 0 : Math.max(0, firstHitSeconds) + (interestStacks - 1) * interval;
  return { windows: start < horizon ? [[start, horizon]] : [], uptime: 1, firstActiveSeconds: start };
}

/**
 * Settle Stalker, Cat's Scratch and Hunting Instinct against the build's multistriking hits.
 * @param {object} p
 * @param {object} p.state windStalkerState(...)
 * @param {object[]} p.hits skill hits ({ key, name, rate: { multistrike, firstUseSeconds, usesPerSecond } }) of a first pass
 * @returns {object|null} { stalker, huntingInstinct, scratch, effectsFor(hit), timedParts(hits), assumptions, text }
 */
export function resolveWindStalker({ state, hits = [] } = {}) {
  if (!state?.active) return null;
  const multistriking = hits.filter((hit) => hit?.rate?.multistrike && hit.rate.usesPerSecond > 0);
  const eventsPerSecond = multistriking.reduce((sum, hit) => sum + (hit.rate.multistrike.maxCountEventsPerSecond || 0), 0);
  const events = eventsPerSecond > 0;
  const { stalker: base, scratch: scratchLine } = state;
  // Max stacks: 3, + Cat's Vision's +1 per Max Multistrike Count event (up to +3) while Stalker lasts.
  const maxStacks = base.initialMaxStacks + (base.maxStackBonus && events ? base.maxStackBonus : 0);
  const gainPerSecond = base.maxCountGain * eventsPerSecond;
  const fromMovement = base.gainsFromMovement && state.moving;
  const held = fromMovement ? maxStacks : gainPerSecond > 0 ? Math.min(maxStacks, Math.floor(gainPerSecond * base.durationSeconds + EPS)) : 0;
  const prebuilt = state.prebuiltSelfBuffs;
  const prebuiltStacks = prebuilt && (base.gainsFromMovement || base.maxCountGain > 0) ? maxStacks : 0;
  const initialBonus = (stacks) => base.initial ? Math.floor(stacks / base.initial.per + EPS) * base.initial.count : 0;
  // Cat's Scratch: held while Max Multistrike Count events come at least every 4 s (its duration).
  const scratchHeld = Boolean(scratchLine && events && 1 / eventsPerSecond <= scratchLine.seconds + EPS);
  const firstHitSeconds = Math.min(...hits.filter((hit) => hit?.rate?.usesPerSecond > 0).map((hit) => hit.rate.firstUseSeconds ?? 0), Infinity);
  const hi = state.huntingInstinct && Number.isFinite(firstHitSeconds) ? { ...state.huntingInstinct, ...huntingInstinctWindows({ prebuilt, firstHitSeconds }) } : null;
  // Cat Dive: constant Movement Speed (user rule), so the same chance at every time.
  const diveChance = state.catDive?.chancePercent || 0;
  const stateAt = ({ stacks, hiOn, scratchOn, dive = true }) => ({
    initialCountBonus: initialBonus(stacks) + (hiOn ? HUNTING_INSTINCT.initialCountBonus : 0),
    repeatAdditionalPercent: stacks * STALKER.perStackAdditionalPercent,
    maxCountAdditionalPercent: hiOn ? HUNTING_INSTINCT.maxCountAttackAdditionalPercent : 0,
    incrementAdditionalPercent: scratchOn ? scratchLine.percent : 0,
    catDiveChancePercent: dive ? diveChance : 0
  });
  // Sustained: Hunting Instinct up 100% once 5 Interest is reached (Interest locked, not used up; user-confirmed 2026-10-14).
  const sustainedStates = [{ weight: 1, ...stateAt({ stacks: held, hiOn: Boolean(hi), scratchOn: scratchHeld }) }];
  // Ledger steps (the working): Cat's Punches' initial count, Stalker's damage, Cat's Scratch, Cat Dive, then Hunting Instinct.
  const steps = [];
  const at = (stacks, scratchOn) => stateAt({ stacks, hiOn: false, scratchOn, dive: false });
  if (initialBonus(held) > 0) steps.push({ source: "Hero trait: Cat's Punches (Stalker stacks)", text: `+${initialBonus(held)} initial Multistrike Count (${held} Stalker stacks ÷ ${base.initial.per} × ${base.initial.count}): every count of the sequence shifts by ${initialBonus(held)} (user-accepted 2026-10-14: herowik / reference data Multistrike)`, states: [{ weight: 1, ...at(held, false), repeatAdditionalPercent: 0 }] });
  if (held > 0) steps.push({ source: "Erika: Stalker (Wind Stalker)", text: `${held} Stalker stack${held === 1 ? "" : "s"} × +${STALKER.perStackAdditionalPercent}% additional damage on the repeated attacks of each Multistrike (${fromMovement ? "held by movement" : `held: min(${maxStacks} max, ${round(gainPerSecond)} gains/s × ${base.durationSeconds} s)`}; provisional)`, states: [{ weight: 1, ...at(held, false) }] });
  if (scratchHeld) steps.push({ source: "Hero trait: Cat's Scratch", text: `+${scratchLine.percent}% additional Multistrike damage increment (Max Multistrike Count every ${round(1 / eventsPerSecond)} s ≤ ${scratchLine.seconds} s; its own factor on the increment: game affix 889828224, attr 63501 mod 4)`, states: [{ weight: 1, ...at(held, true) }] });
  if (diveChance > 0) {
    const dive = state.catDive;
    steps.push({ source: "Hero trait: Cat Dive", text: `${dive.perPercent}% per +1% Movement Speed × ${round(dive.movementSpeedPercent)}% = ${round(dive.chancePercent)}%${dive.rawChancePercent > 100 ? " (capped at 100%)" : ""} chance per repeated attack to deal the Max Multistrike Count attack's damage increment instead of its own (Movement Speed held in full: user rule 2026-10-14; reading user-confirmed 2026-10-14, provisional; a dive is not a Max Multistrike Count event)`, states: [{ weight: 1, ...stateAt({ stacks: held, hiOn: false, scratchOn: scratchHeld }) }] });
  }
  if (hi) steps.push({ source: `Hunting Instinct (${HUNTING_INSTINCT.revivedAffix}, ${hi.memory})`, text: `+${HUNTING_INSTINCT.initialCountBonus} initial and Max Multistrike Count, +${HUNTING_INSTINCT.maxCountAttackAdditionalPercent}% additional Attack Damage on the attack at the Max Multistrike Count; up 100% of the time (${HUNTING_INSTINCT.interestStacks} Interest locked, not used up, so it restarts as soon as its ${HUNTING_INSTINCT.durationSeconds} s end; user-confirmed 2026-10-14)`, states: sustainedStates });
  const effectsFor = (hit) => hit?.rate?.multistrike && steps.length ? { steps } : null;

  // Windows: the stack count and Hunting Instinct over time (own buffs built before engaging start full).
  const stalkerEvents = !prebuilt && !fromMovement && gainPerSecond > 0 ? eventTimes(multistriking.map((hit) => hit.rate.multistrike.maxCountEventsPerSecond * base.maxCountGain), held) : [];
  const stacksAt = (time) => {
    if (fromMovement || (prebuilt && held > 0)) return held;
    if (prebuilt && prebuiltStacks > 0 && held === 0) return time < base.durationSeconds - EPS ? prebuiltStacks : 0;
    return Math.min(held, stalkerEvents.filter((event) => event <= time + EPS).length);
  };
  const firstEvent = events ? Math.min(...multistriking.map((hit) => 1 / hit.rate.multistrike.maxCountEventsPerSecond)) : Infinity;
  const scratchAt = (time) => scratchHeld && (prebuilt || time >= firstEvent - EPS);
  const hiAt = (time) => Boolean(hi?.windows.some(([start, end]) => time >= start - EPS && time < end - EPS));
  const edges = new Set([0, ...stalkerEvents, ...(prebuilt && prebuiltStacks > 0 && held === 0 ? [base.durationSeconds] : []), ...(scratchHeld && !prebuilt && Number.isFinite(firstEvent) ? [firstEvent] : []), ...(hi ? hi.windows.flat() : [])]);
  const times = [...edges].filter((time) => time >= 0 && time < HORIZON_SECONDS).map((time) => Math.round(time * 1e9) / 1e9).sort((a, b) => a - b);
  const timedParts = multistriking.map((hit) => {
    const ms = hit.rate.multistrike, seq = { chancePercent: ms.chancePercent, incrementPercent: ms.incrementPercent, skillIncrementAdditionalPercent: ms.skillIncrementAdditionalPercent || 0 };
    const sustained = multistrikeStatesDamage(seq, sustainedStates);
    if (!(sustained > 0)) return null;
    const points = times.map((time) => [time, multistrikeSequence({ ...seq, ...stateAt({ stacks: stacksAt(time), hiOn: hiAt(time), scratchOn: scratchAt(time) }) }).damagePerCycle / sustained - 1]);
    if (points.every(([, level]) => Math.abs(level) < 1e-12)) return null;
    return { id: `windStalker:${hit.key}`, type: null, reach: "hit", keys: [hit.key], percent: 100, schedule: { kind: "steps", points, sustained: 0 } };
  }).filter(Boolean);

  const assumptions = [];
  assumptions.push({ id: "windStalker:stalker", value: held, text: held > 0
    ? `Erika (Wind Stalker): ${held} Stalker stack${held === 1 ? "" : "s"} held (max ${maxStacks}${base.maxStackBonus && events ? `: 3 + Cat's Vision's +${base.maxStackBonus}` : ""}) — ${fromMovement ? "moving (Movement group): gained from movement" : `${round(gainPerSecond)} gains/s from Max Multistrike Count events (Cat's Punches) × ${base.durationSeconds} s per stack`}; +${STALKER.perStackAdditionalPercent}% additional damage per stack on the repeated attacks of each Multistrike${base.initial ? `; +${initialBonus(held)} initial Multistrike Count (Cat's Punches)` : ""}. ${prebuilt ? "Own buffs built before engaging: full from t = 0." : stalkerEvents.length ? `Cold start: 1 stack per Max Multistrike Count event, full at ${round(stalkerEvents[stalkerEvents.length - 1])} s.` : ""} Provisional (keyword; sequence reading in src/skill-hit-model.js).`
    : `Erika (Wind Stalker): no Stalker on the dummy — ${!events ? "no Attack skill Multistrikes" : base.maxCountGain > 0 ? "no Stalker gain" : "standing still and no Stalker gain at Max Multistrike Count (Cat's Punches)"}${prebuiltStacks > 0 ? `; own buffs built before engaging hold ${prebuiltStacks} for the first ${base.durationSeconds} s` : ""}.` });
  if (hi) assumptions.push({ id: "windStalker:huntingInstinct", value: round(hi.uptime), text: `Hunting Instinct (${HUNTING_INSTINCT.revivedAffix} on ${hi.memory}; the dummy is an Elite): 1 Interest per 1 s of damage, 5 → Hunting Instinct for 30 s; the 5 Interest are locked, not used up, so it restarts as soon as it ends (uptime 100% after the first activation; user-confirmed 2026-10-14). ${prebuilt ? "Own buffs built before engaging: up from t = 0." : `First up at ${round(hi.firstActiveSeconds)} s (Interest from the first hit at ${round(firstHitSeconds)} s).`}` });
  if (state.catDive) assumptions.push({ id: "windStalker:catDive", value: round(diveChance), text: `Cat Dive (provisional): ${round(diveChance)}% chance per repeated attack of a Multistrike (${state.catDive.perPercent}% × ${round(state.catDive.movementSpeedPercent)}% Movement Speed, held in full because movement is constant; capped at 100%) to deal the Max Multistrike Count attack's damage increment instead of its own; the first attack never rolls and a dive is not a Max Multistrike Count event (reading user-confirmed 2026-10-14).${events ? "" : " No Attack skill Multistrikes, so it changes nothing."}` });
  if (state.interest) assumptions.push({ id: "windStalker:interest", value: round(state.interest.valuePercent), text: `Interest: ${state.interest.sharePercent}% of ${round(state.interest.movementSpeedPercent)}% Movement Speed = +${round(state.interest.rawPercent)}%${state.interest.capped ? `, capped at +${state.interest.capPercent}%` : ` (cap +${state.interest.capPercent}%)`} additional Attack Damage (Movement Speed held in full because movement is constant, user rule 2026-10-14).` });
  if (state.moonMark) assumptions.push({ id: "windStalker:moonMark", value: Boolean(state.moonMark.active), text: `Artificial Moon (Wind Stalker): ${state.moonMark.active ? `the dummy is Marked while Stalker is held (within ${state.moonMark.meters} m, best case) and +${state.moonMark.effectPercent}% Mark Effect` : "Stalker is not held on the dummy, so no Mark from it"} (src/mark-effect.js; provisional).` });
  if (scratchLine) assumptions.push({ id: "windStalker:scratch", value: scratchHeld, text: `Cat's Scratch: +${scratchLine.percent}% additional Multistrike damage increment ${scratchHeld ? `held (Max Multistrike Count every ${round(1 / eventsPerSecond)} s)` : "not held (no Max Multistrike Count events within 4 s)"}.` });
  return {
    ...state, eventsPerSecond, maxStacks, held, gainPerSecond, fromMovement, prebuiltStacks, scratchHeld,
    huntingInstinct: hi, sustainedStates, steps, effectsFor, timedParts, assumptions,
    hits: multistriking.map((hit) => ({ key: hit.key, name: hit.name, eventsPerSecond: hit.rate.multistrike.maxCountEventsPerSecond, chancePercent: hit.rate.multistrike.chancePercent, incrementPercent: hit.rate.multistrike.incrementPercent }))
  };
}

/** Badge status of the Cat's Night Safari revived affix on `memory` for the planner's build, or null when not this affix. */
export function catsNightSafariStatus(planner, memory) {
  if (String(memory?.revivedAffix || "").trim() !== HUNTING_INSTINCT.revivedAffix) return null;
  if (planner?.state?.hero?.selectedHeroId !== WIND_STALKER) return { status: "Inactive", reason: "Hero Trait Exclusive: Cateye Erika | Wind Stalker" };
  const hi = planner?.windStalker?.huntingInstinct;
  if (!hi || hi.memoryId !== memory.id) return { status: "Inactive", reason: "the memory is not equipped" };
  const applied = (planner.skillHits || []).some((hit) => hit.rate?.multistrike && hit.modeled);
  return applied ? { status: "In calc", reason: `Hunting Instinct on the dummy (an Elite): uptime 100% once 5 Interest are reached (Interest locked; user-confirmed 2026-10-14)` } : { status: "Inactive", reason: "no Attack skill Multistrikes" };
}
