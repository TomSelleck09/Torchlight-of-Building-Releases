// Tick-by-tick training-dummy engine (prototype, sessions 1 to 6 of research/tick-engine-investigation-2026-10-30.md §7.5; status and
// next steps: research/tick-engine-prototype-2026-10-31.md). It runs beside the planner: src/planner.js, src/app.js and
// src/dummy-recount.js do not import it, so no planner figure, UI or recount moves yet (tests/tick-engine-core.test.js checks this).
//
// The 30 Hz grid is a built-in engine limit (user decision 2026-10-30): whole integer ticks, no toggle. Pure module: no DOM, no
// imports, no dice (hits are expected values), so the same spec gives the same timeline.
//
// One tick follows the client's fixed system order, reduced to what touches damage on a dummy (§2.1, §7.1): see SYSTEM_ORDER.
//
// Timer classes (§3.2; addresses are the 2026-09-15 executable), one helper each:
// - Fixed interval: node 206, periodic affix nodes, collectors 610 / 611 / 612. F = nearest(T × 30), ties away from zero, one-frame
//   floor, fires every F frames, never scaled by speed: fixedIntervalFrames, fixedGateReady. A value that reads an attribute
//   (Immolating World's p1 / GetAttr(Cast Speed)) is re-evaluated on each check, then rounded: immolatingWorldFrames.
// - Speed-scaled: nodes 251, 6 (with calcIncress), 252, 254, the built-in Reap, skill cooldowns. cd = base ÷ max(0.1, speed factor),
//   not snapped; it ends on the first tick with cd ≤ elapsed, which acts as ceil(30 × cd): scaledSeconds, scaledTimerReady,
//   scaledTimerFrames, scaledGateReady. The speed is read at each check. Elapsed is frames ÷ 30 exactly (the client accumulates
//   soft doubles, so exact breakpoints can differ by float noise; §3.3).
// - Buff duration: seconds against world time, so the first tick at or after the end: buffExpiryFrame (no snap found; inferred).
// - DoT: settles every tick, scaled by dt (Buff_Damage); type-1 records resolve in a first pass before hits (§4.1).
// - "Recently": 4 s windows, 4 × FPS = 120 frames: RECENT_WINDOW_FRAMES, createCollector.
// - Use time: seconds through phase timers, CAST_OVERSHOOT_RULE below (§3.4, open). A use reads its speed at the press.
// - Charges: one recharge timer per skill, speed-scaled as a cooldown; a flat "-X s Cooldown" (reduceCooldowns) counts as elapsed time.
// - Chance-gated events: one deterministic accumulator per event source (decision 2026-10-31): each eligible event adds its probability
//   and it fires when the sum reaches 1, so a run stays repeatable and keeps the long-run rate. A gate is checked first: an event inside
//   a closed gate is not eligible. Crit-gated effects count one event per crit determination (one per hit group per use, as
//   rate.critChecksPerSecond does). Ailment applications do not use it: an accumulator cannot lapse, and a shared timer can.
// - Inside a tick the actors run in ACTOR_ORDER: player, Minions, follower (provisional, open question tick-actor-order). Actions that
//   share a `queue` are one actor: one use at a time, the action that has been ready longest goes next, list order breaking ties
//   (spec.queueOrder "list": the first ready action in the list). A `priority` on the queue's actions overrides that: the lowest ready one goes
//   next (a Minion's specials before its filler), and `queueCarry` carries a use's overshoot into the actor's next use, whichever skill it is.
//   An action with a `timeline` is a list of whole ticks, not a use: its effects fire in its actor's place in the Skill stage.
// - Ailments (spec.ailments, effect "ailment"): expected values at the whole percent, no dice (orchestrator decision 2026-10-31). Shared timer
//   (Ignite, Trauma): the survival state of the chain, newChain: a success restarts the timer, expiry clears all, and the mass that survives
//   reads the retained table at its own success count. A held store (spec.store; Ignite and Trauma at a one-rank limit, user decision 2026-11-02
//   following the client's mode 6) replaces the chain: the probability of each (application tick, amount level), an application at least as
//   strong replaces the held stack, a weaker one does nothing, and each stack expires its duration after its own application. Independent stacks
//   (Wilt): each attempt adds an expected stack (the chance) on its own timer, the DPS the sum, at the limit the shortest remaining goes.
//   Fractional attempts on one hit are one attempt at that share of the chance.
// - Affliction: a scalar on the dummy. A DoT reads the rating at the start of the tick. A full-Affliction Reap is a continuous affix node, so it
//   fires in the Affix stage, and its removal runs inside the Reap's dispatcher, before that tick's DoT pass (removalStage "beforeDot", open
//   question tick-affliction-removal). The Reap's damage lands in the Damage stage. In the Damage loop the DoT pass, the hits, the Reaps, then the
//   gain of rate ÷ 30, clamped to 0-100 (the per-target loop FUN_141d5c3f0 calls the gain 0x141c07a90 after them).
// - Reaps (spec.reaps): one timer each (independent, user-confirmed). A Reap settles every DoT it reaches at that DoT's rate on the tick × its
//   seconds × its settle scale, the expected base included, with no crit and no second resistance step: the path is past resistance already.
//   Triggers: dealing damage over time, a success (a ready share, as the mean-field share of src/dummy-recount.js), full Affliction, or use events.

/** Ticks per second: the client's default frame time (proven default, §3.1). */
export const TICKS_PER_SECOND = 30;
export const FRAME_SECONDS = 1 / TICKS_PER_SECOND;
/** "Recently" (game hyperlink 103). The client hard-codes 4 × FPS at 0x141c16e20 and 0x141d4ba70. */
export const RECENT_WINDOW_SECONDS = 4;
export const RECENT_WINDOW_FRAMES = 120;
/** FUN_141dac340 floors the speed factor at 0.1: a cooldown never grows past ×10 (it is not a 0.1 s floor on the time). */
export const MIN_SPEED_FACTOR = 0.1;

/**
 * Does a use's overshoot carry into the next use? OPEN (§3.4, open question `tick-cast-overshoot`). FUN_14220e070 carries overshoot
 * between phases inside one use; whether the next action starts on the same tick with the leftover was not traced.
 * - "carry": a repeated use averages its exact use time on whole frames (k-th use at ceil(k × 30 × use time)), so the long-run rate
 *   stays continuous and matches the planner's current figures. Default.
 * - "drop": every use takes ceil(30 × use time) frames, so Cast Speed works in steps (0.408 s: 13 frames, 2.31 casts/s vs 2.45).
 * An internal engine constant, not a user setting: in-game test 1 (§7.6) settles it and this line changes once.
 */
export const CAST_OVERSHOOT_RULE = "carry";
const CAST_OVERSHOOT_RULES = Object.freeze(["carry", "drop"]);

/** Actor order inside a stage (provisional, not traced in the client; open question tick-actor-order). */
export const ACTOR_ORDER = Object.freeze(["player", "minion", "follower"]);

/** The stages of one tick, in the client's order (§7.1); Damage resolves type-1 DoT, then hits, then the Reap flush. */
export const SYSTEM_ORDER = Object.freeze(["begin", "timerEvent", "command", "triggerAffix", "skill", "buff", "attack", "damage", "state", "end"]);

// Float slack on phase timers (in frames), so an exact frame count (0.4 s = 12 frames) is not pushed one frame on by rounding error.
const PHASE_EPS = 1e-9;

const assertTime = (seconds, label) => { if (!(seconds >= 0)) throw new RangeError(`tick engine: ${label} must be a non-negative time (got ${seconds})`); };

// ---------------------------------------------------------------------------------------------
// Timer classes

/** Whole frames of `seconds` by the client's nearest rule (soft-float mode 4: ties away from zero). No floor: 0 under half a frame. */
export function nearestFrames(seconds) {
  const frames = seconds * TICKS_PER_SECOND;
  return frames < 0 ? -Math.round(-frames) : Math.round(frames);
}

/** Fixed-interval class (node 206, periodic nodes, collectors): frames between fires, at least one. */
export function fixedIntervalFrames(seconds) {
  if (seconds === Infinity) return Infinity;
  assertTime(seconds, "fixed interval");
  return Math.max(1, nearestFrames(seconds));
}

/** Immolating World's rule: the interval re-evaluated with the current Cast Speed, then the nearest frame (§3.2, D2). */
export function immolatingWorldFrames(baseSeconds, castSpeedFactor) {
  return fixedIntervalFrames(baseSeconds / castSpeedFactor);
}

/** The smallest whole frame count n with n ÷ 30 ≥ seconds, compared as doubles (the "first tick at or after" of the elapsed check). */
export function framesAtOrAfter(seconds) {
  if (seconds === Infinity) return Infinity;
  assertTime(seconds, "time");
  let frames = Math.ceil(seconds * TICKS_PER_SECOND);
  while (frames > 0 && (frames - 1) / TICKS_PER_SECOND >= seconds) frames -= 1;
  while (frames / TICKS_PER_SECOND < seconds) frames += 1;
  return frames;
}

/** Speed-scaled class: the running length of a timer (FUN_141dac340). */
export function scaledSeconds(baseSeconds, speedFactor) {
  assertTime(baseSeconds, "base time");
  return baseSeconds / Math.max(MIN_SPEED_FACTOR, speedFactor);
}

/** The elapsed check itself: ready on the first tick with cd ≤ elapsed. */
export function scaledTimerReady(baseSeconds, speedFactor, elapsedFrames) {
  return scaledSeconds(baseSeconds, speedFactor) <= elapsedFrames / TICKS_PER_SECOND;
}

/** Frames a speed-scaled timer lasts at a constant speed: ceil(30 × cd), at least one. */
export function scaledTimerFrames(baseSeconds, speedFactor) {
  return Math.max(1, framesAtOrAfter(scaledSeconds(baseSeconds, speedFactor)));
}

/** The tick a buff or DoT applied on `startFrame` ends: the first tick at or after start + duration. */
export function buffExpiryFrame(startFrame, durationSeconds) {
  return startFrame + framesAtOrAfter(durationSeconds);
}

/** A cooldown record: when the timer last started. A new gate is ready. */
export const newGate = () => ({ lastFrame: null });

/** Fixed-interval gate: re-reads the interval on each check (the rpn evaluator's dynamic flag, §3.2). */
export function fixedGateReady(gate, frame, intervalSeconds) {
  return gate.lastFrame === null || frame - gate.lastFrame >= fixedIntervalFrames(intervalSeconds);
}

/** Speed-scaled gate: re-reads the speed on each check; one-frame floor. */
export function scaledGateReady(gate, frame, baseSeconds, speedFactor) {
  return gate.lastFrame === null || (frame > gate.lastFrame && scaledTimerReady(baseSeconds, speedFactor, frame - gate.lastFrame));
}

/** A Collector window: entries are read for `frames` ticks after the tick that added them, then pruned at that tick's Collector stage. */
export function createCollector(windowSeconds = RECENT_WINDOW_SECONDS) {
  return { frames: fixedIntervalFrames(windowSeconds), entries: [], head: 0, total: 0 };
}
export function collectorAdd(collector, frame, value = 1) {
  collector.entries.push({ frame, value });
  collector.total += value;
}
export function collectorPrune(collector, frame) {
  const { entries, frames } = collector;
  while (collector.head < entries.length && frame - entries[collector.head].frame >= frames) collector.total -= entries[collector.head++].value;
  if (collector.head > 512) { entries.splice(0, collector.head); collector.head = 0; }
  // Whole-window sums stay exact when the window empties.
  if (collector.head === entries.length) collector.total = 0;
}

/**
 * One SkillAction, reduced to one phase: the use time. The header gives the use time only, not how the client's phases 0 / 1 / 4 / 5 /
 * 6 split it, and the planner's rule (user decision 2026-10-22) puts the first use at the use time, so the event fires at the phase's
 * end. One-frame floor: at most one use per tick per action. `carriedFrames` is the previous use's overshoot.
 */
export function startCastPhase(useSeconds, carriedFrames = 0) {
  assertTime(useSeconds, "use time");
  return { remaining: Math.max(1, useSeconds * TICKS_PER_SECOND) - carriedFrames };
}

/** Advance a phase by one tick. Null while it runs; at its end the overshoot in frames that the next use starts with. */
export function tickCastPhase(phase, rule = CAST_OVERSHOOT_RULE) {
  if (!CAST_OVERSHOOT_RULES.includes(rule)) throw new RangeError(`tick engine: unknown cast overshoot rule ${rule}`);
  phase.remaining -= 1;
  if (phase.remaining > PHASE_EPS) return null;
  return rule === "carry" ? Math.max(0, -phase.remaining) : 0;
}

/** The ticks on which a skill pressed on tick 1 and used back to back ends its uses, up to `frames`. */
export function castUseFrames(useSeconds, frames, rule = CAST_OVERSHOOT_RULE) {
  const uses = [];
  let phase = startCastPhase(useSeconds);
  for (let frame = 1; frame <= frames; frame += 1) {
    const overshoot = tickCastPhase(phase, rule);
    if (overshoot === null) continue;
    uses.push(frame);
    phase = startCastPhase(useSeconds, overshoot);
  }
  return uses;
}

// ---------------------------------------------------------------------------------------------
// Damage paths (§7.2): a static { increased Σ, additional Π } per part, compiled from the planner, plus time-varying modifiers keyed
// by a buff or a Collector window. The product is recomputed only when the active set changes. A speed is the same thing with one
// part of base 1, so Cast Speed reads (1 + Σ increased) × Π additional the way the planner's ledger does.

const AFFLICTION_MAX = 100;
const atMaxAffliction = (rating) => rating >= AFFLICTION_MAX - 1e-9;
// The rating a path reads: the dummy's, or the one a settling Reap fixes (a full-Affliction Reap reads 100 whatever the removal has done).
const ratingRead = (world) => world.affliction.settleRating ?? world.affliction.rating;
// The share of a chain's probability on a table of fractions: Scorch's stacks by successes held.
function chainShare(chain, fractions) {
  if (!chain) return 0;
  const last = fractions.length - 1;
  let share = 0;
  for (let n = chain.low; n <= chain.high; n += 1) share += chain.byCount[n] * fractions[Math.min(n, last)];
  return share;
}

const modifierAmount = (world, modifier) => {
  if (modifier.requires && !modifier.requires.every((key) => buffStacks(world, key) > 0)) return 0;
  // A value the program computes from the world (a factor over time the recount also reads).
  if (modifier.amount) return modifier.amount(world);
  if (modifier.affliction) return ratingRead(world);
  // A term that holds at max Affliction, read at the rating on this tick, as a ratio to the path's value.
  if (modifier.maxAffliction) return ((atMaxAffliction(ratingRead(world)) ? modifier.maxAffliction.ratioAtFull : modifier.maxAffliction.ratioAtNone) - 1) * 100;
  // A state the run of an ailment carries (Scorch's stacks on the Ignite chain): a share of the percent by successes held, in expectation.
  if (modifier.ailmentShare) return modifier.percent * chainShare(world.ailmentRuns.get(modifier.ailmentShare.ailment).chain, modifier.ailmentShare.fractions);
  // A (multiplies) line for every state held: (1 + X%)^n, as one amount.
  if (modifier.count) {
    const held = modifier.count.reduce((sum, entry) => sum + (entry.held ? 1 : buffStacks(world, entry.buff) > 0 ? 1 : 0), 0);
    return held > 0 ? ((1 + modifier.percent / 100) ** held - 1) * 100 : 0;
  }
  const count = modifier.buff ? buffStacks(world, modifier.buff) : modifier.collector ? world.collectors.get(modifier.collector).total : 0;
  if (!(count > 0)) return 0;
  const percent = modifier.perStack ? modifier.percent * count : modifier.percent;
  return modifier.capPercent === undefined ? percent : Math.min(modifier.capPercent, percent);
};

// Expected crit factor of a hit, as the planner's: 1 + chance × (crit damage × crit-only factor − 1).
const critFactorAt = ({ chancePercent, damagePercent, onlyFactor = 1 }) => 1 + (chancePercent / 100) * (damagePercent / 100 * onlyFactor - 1);
// Expected Double Damage factor: the roll compares with the whole percent of the chance (D4), so it is floored at this tick's chance.
const doubleDamageFactorAt = (chancePercent) => 1 + Math.floor(Math.max(0, Math.min(100, chancePercent)) + 1e-9) / 100;

/**
 * A path's value at the given modifier amounts: Σ parts of base × (1 + (increased + active)%) × additional × Π(1 + active%), times the
 * expected crit and Double Damage factors when the path carries them. Modifier layers: "increased", "additional" (default),
 * "critDamage" (+% to the Critical Strike Damage sum), "critOnly" (a crit-only multiplier), "doubleDamage" (+% chance), "penetration"
 * (+% penetration through the resistance step: a part's base carries (100 − netResistancePercent)% and it goes to (100 − net + amount)%,
 * `netResistancePercent` being the resistance after the static penetration), "affliction" (the amount is the dummy's rating and the
 * modifier carries `perPoint`: ×(1 + rating × perPoint)). A modifier with `types` reaches only the parts of those damage types, one
 * with `parts` only the parts with those keys.
 */
export function pathValueAt(path, amounts = []) {
  const modifiers = path.modifiers || [];
  let total = 0, critDamage = path.crit?.damagePercent, critOnly = path.crit?.onlyFactor ?? 1, doubleChance = path.doubleDamage?.chancePercent;
  modifiers.forEach((modifier, index) => {
    const amount = amounts[index] || 0;
    if (!amount) return;
    if (modifier.layer === "critDamage") critDamage += amount;
    else if (modifier.layer === "critOnly") critOnly *= 1 + amount / 100;
    else if (modifier.layer === "doubleDamage") doubleChance += amount;
  });
  for (const part of path.parts) {
    let increased = part.increasedPercent ?? 0, additional = part.additionalFactor ?? 1, penetration = 0;
    modifiers.forEach((modifier, index) => {
      const amount = amounts[index] || 0;
      if (!amount || (modifier.types && !modifier.types.includes(part.type)) || (modifier.parts && !modifier.parts.includes(part.key))) return;
      if (modifier.layer === "increased") increased += amount;
      else if (modifier.layer === undefined || modifier.layer === "additional") additional *= 1 + amount / 100;
      else if (modifier.layer === "penetration") penetration += amount;
      else if (modifier.layer === "affliction") additional *= 1 + amount * modifier.perPoint;
    });
    if (penetration) additional *= (100 - part.netResistancePercent + penetration) / (100 - part.netResistancePercent);
    total += part.base * (1 + increased / 100) * additional;
  }
  if (path.crit) total *= critFactorAt({ ...path.crit, damagePercent: critDamage, onlyFactor: critOnly });
  if (path.doubleDamage) total *= doubleDamageFactorAt(doubleChance);
  return total;
}

function currentPathValue(world, path) {
  const modifiers = path.modifiers || [];
  const amounts = modifiers.map((modifier) => modifierAmount(world, modifier));
  const signature = amounts.join(",");
  const cached = world.pathCache.get(path.key);
  if (cached && cached.signature === signature) return cached.value;
  const value = pathValueAt(path, amounts);
  world.pathCache.set(path.key, { signature, value });
  return value;
}

// ---------------------------------------------------------------------------------------------
// World

/** Stacks of a buff on this tick (0 when it is not active). */
export const buffStacks = (world, key) => world.buffs.get(key)?.stacks || 0;

const resolve = (value, world) => typeof value === "function" ? value(world) : value;
const seriesKey = (path) => path.source ?? path.key;
const actorRank = (item) => { const rank = ACTOR_ORDER.indexOf(item.actor ?? "player"); return rank < 0 ? ACTOR_ORDER.length : rank; };
const byActor = (items = []) => items.map((item, index) => ({ item, index })).sort((a, b) => actorRank(a.item) - actorRank(b.item) || a.index - b.index).map(({ item }) => item);

// A named speed on this tick (spec.speeds), the attribute's final value.
function speedOf(world, key) {
  const speed = world.speeds.get(key);
  if (!speed) throw new RangeError(`tick engine: unknown speed ${key}`);
  return currentPathValue(world, speed);
}
// A time in seconds: a number, a function of the world, or { baseSeconds, speed } read now.
function secondsOf(value, world) {
  const time = resolve(value, world);
  return time !== null && typeof time === "object" ? time.baseSeconds / speedOf(world, time.speed) : time;
}
// A speed factor: a number, a function of the world, or { speed } read now.
function speedFactorOf(value, world) {
  const factor = resolve(value ?? 1, world);
  return factor !== null && typeof factor === "object" ? speedOf(world, factor.speed) : factor;
}

// A skill's cooldown with its charges: one recharge timer, restarted while charges are missing. Without Max Charges it is the plain
// cooldown from the press. creditSeconds is the flat cooldown reduction since this timer started.
const newCooldown = (cooldown) => {
  const maxCharges = Math.max(1, cooldown.maxCharges ?? 1);
  return { spec: cooldown, maxCharges, charges: Math.min(maxCharges, cooldown.startCharges ?? maxCharges), startFrame: null, creditSeconds: 0 };
};
function settleCooldown(world, cooldown) {
  if (cooldown.startFrame === null) return;
  const elapsed = world.frame - cooldown.startFrame;
  if (!(elapsed > 0) || !(scaledSeconds(cooldown.spec.baseSeconds, speedFactorOf(cooldown.spec.speedFactor, world)) <= elapsed / TICKS_PER_SECOND + cooldown.creditSeconds)) return;
  cooldown.charges += 1;
  cooldown.creditSeconds = 0;
  cooldown.startFrame = cooldown.charges < cooldown.maxCharges ? world.frame : null;
}
const cooldownReady = (world, cooldown) => { settleCooldown(world, cooldown); return cooldown.charges > 0; };
function spendCharge(world, cooldown) {
  cooldown.charges -= 1;
  if (cooldown.startFrame === null) { cooldown.startFrame = world.frame; cooldown.creditSeconds = 0; }
}

// The survival state of a shared-timer ailment: expected values, no dice (orchestrator decision 2026-10-31; an accumulator cannot lapse, so it
// overstated low chances: ×1.09 at 48%, ×1.16 at 8%). byCount[n] is the probability that a run of n successes holds the ailment now, capped at
// the table's top as the recount's chain is. groups holds the same mass by the tick of its last success, because that tick sets the expiry. An
// attempt moves the same share out of every n, so a group's shape never changes after its tick, only its scale, and byCount alone says what
// moves: an attempt costs O(counts held + groups), a tick O(1). The rule is the recount's chain, on ticks: a success restarts the shared timer,
// expiry clears the run, a held state attempts at the chance and an absent one at the not-active chance.
function newChain(spec) {
  const top = Math.max(1, spec.topCount ?? spec.retainedBase.length - 1);
  return { chain: true, top, byCount: new Float64Array(top + 1), moved: new Float64Array(top + 1), low: top + 1, high: 0, groups: [], spare: [], held: 0, base: 0, freshFrame: 0, freshHeld: 0, freshBase: 0, successBase: 0, by: null, table: spec.retainedOf ? new Float64Array(top + 1).fill(NaN) : spec.retainedBase, shares: null, streams: spec.retainedOf ? [] : null };
}
// A held store (spec.store: mode 6 at a one-rank limit, src/held-ailment-store.js handed in through the spec) holds the DoT; a chain beside it
// only when a modifier reads its success counts (Scorch's share of the Ignite run, keepChain).
const newAilmentRun = (spec) => ({ chain: spec.stacking === "independent" || (spec.store && !spec.keepChain) ? null : newChain(spec), store: spec.store ? spec.store.create() : null, total: 0, lapses: 0, ended: 0 });
const newAffliction = ({ perSecond = 0, removers = [], removalStage = "beforeDot", accrual = "fromStart" } = {}) => ({ rating: 0, perTick: perSecond / TICKS_PER_SECOND, removalStage, accrual, removers: removers.map((item) => ({ spec: item, gate: newGate(), fires: 0, firedFrame: 0 })), settleRating: undefined, lastRead: 0, readSum: 0, ticksAtMax: 0 });
const newReap = (item) => ({ spec: item, gate: newGate(), fires: 0, ready: 1, recovering: [], head: 0, pendingMass: 0, pendingBase: 0, uses: item.startUses ?? 0 });

// A list of whole ticks: { frame, effects }, those of one tick together.
function timelineByFrame(items) {
  const byFrame = new Map();
  for (const { frame, effects } of items) byFrame.set(frame, [...(byFrame.get(frame) || []), ...effects]);
  return byFrame;
}

// A cycle's next step. Past the list it repeats from loopFrom, so a list with an opening stays out of the repeat.
const stepIndex = ({ steps, loopFrom = 0 }, presses) => presses < steps.length ? presses : loopFrom + (presses - loopFrom) % (steps.length - loopFrom);

function createCollectorFor({ windowSeconds, seed = [] }) {
  const collector = createCollector(windowSeconds);
  // Own stacks built before engaging (prebuiltSelfBuffs): entries at ticks ≤ 0, oldest first.
  for (const entry of seed) collectorAdd(collector, entry.frame, entry.value ?? 1);
  return collector;
}

function createWorld(spec, frames, trace) {
  const paths = new Map(Object.entries(spec.paths || {}).map(([key, path]) => [key, { ...path, key }]));
  const bySource = {}, labels = {}, stats = {};
  const addSeries = (key, label, kind, extra = {}) => {
    if (bySource[key]) return;
    bySource[key] = new Float64Array(frames);
    labels[key] = label || key;
    stats[key] = { label: labels[key], kind, events: 0, damage: 0, ...extra };
  };
  for (const path of paths.values()) addSeries(seriesKey(path), path.label, path.kind || "hit", path.working ? { working: path.working } : {});
  for (const reap of spec.reaps || []) addSeries(reap.key, reap.label, "reap");
  for (const item of spec.averaged || []) addSeries(item.key, item.label, "averaged", { averaged: true, reason: item.reason || "" });
  for (const item of spec.derived || []) addSeries(item.key, item.label, "derived", { reason: item.reason || "" });
  const reaps = (spec.reaps || []).map(newReap);
  return {
    frames, frame: 0, time: 0, stage: "begin",
    paths, bySource, labels, stats, firstDamageFrame: null, trace: trace ? [] : null,
    pathCache: new Map(), snapIndexes: new Map(),
    speeds: new Map(Object.entries(spec.speeds || {}).map(([key, speed]) => [key, { ...speed, key: `speed:${key}`, parts: speed.parts ?? [{ base: 1, increasedPercent: speed.increasedPercent ?? 0, additionalFactor: speed.additionalFactor ?? 1 }] }])),
    delayed: new Map(), dots: new Map(),
    ailmentSpecs: new Map((spec.ailments || []).map((item) => [item.key, item])),
    ailmentRuns: new Map((spec.ailments || []).map((item) => [item.key, newAilmentRun(item)])),
    ailmentTicks: new Map((spec.ailments || []).map((item) => [item.key, { activeTicks: 0, baseTicks: 0 }])),
    affliction: newAffliction(spec.affliction),
    buffs: new Map((spec.initialBuffs || []).map((item) => [item.buff, { stacks: item.stacks ?? 1, startFrame: 0, expiryFrame: buffExpiryFrame(0, item.seconds) }])),
    collectors: new Map((spec.collectors || []).map((item) => [item.key, createCollectorFor(item)])),
    actions: byActor(spec.actions).map((item) => ({ spec: item, phase: null, carried: 0, endFrame: null, step: null, readySince: null, cooldown: item.cooldown ? newCooldown(item.cooldown) : null, presses: 0, uses: 0, timeline: item.timeline ? timelineByFrame(item.timeline) : null })),
    queues: new Set(), queueOrder: spec.queueOrder ?? "ready", queueEnds: new Map(), queueLast: new Map(),
    periodics: byActor(spec.periodics).map((item) => ({ spec: item, gate: newGate(), fires: 0 })),
    triggers: byActor(spec.triggers).map((item) => ({ spec: item, gate: newGate(), cooldown: item.cooldown ? newCooldown(item.cooldown) : null, fires: 0 })),
    accumulators: new Map(), buffTicks: new Map(), buffExpiries: new Map(),
    dotSpecs: new Map([...(spec.dots || []), ...(spec.ailments || [])].map((item) => [item.key, item])),
    reaps, reapByKey: new Map(reaps.map((reap) => [reap.spec.key, reap])),
    reapWatchers: new Map([...new Set(reaps.map((reap) => reap.spec.ailment).filter(Boolean))].map((key) => [key, reaps.filter((reap) => reap.spec.trigger === "success" && reap.spec.ailment === key)])),
    averaged: (spec.averaged || []).map((item) => ({ ...item, startFrame: Math.max(1, framesAtOrAfter(item.fromSeconds ?? 0)) })),
    attacks: [], hits: [], dotRecords: []
  };
}

const note = (world, event, fields = {}) => { if (world.trace) world.trace.push({ frame: world.frame, stage: world.stage, event, ...fields }); };

function deal(world, key, amount, fields) {
  world.bySource[key][world.frame - 1] += amount;
  const stat = world.stats[key];
  stat.events += 1;
  stat.damage += amount;
  if (amount > 0 && world.firstDamageFrame === null) world.firstDamageFrame = world.frame;
  note(world, "damage", { source: key, amount, ...fields });
}

// The one rule for chance-gated events (decision 2026-10-31): an eligible event adds its probability and the effect fires when the sum
// reaches 1. A closed gate makes the event ineligible, so it adds nothing, as a real roll behind that gate would not happen.
function rollAccumulator(world, effect, origin) {
  let state = world.accumulators.get(effect.key);
  if (!state) { state = { sum: 0, gate: newGate(), fires: 0 }; world.accumulators.set(effect.key, state); }
  if (effect.gate && !fixedGateReady(state.gate, world.frame, effect.gate.fixedSeconds)) return;
  state.sum += effect.probability;
  if (state.sum < 1 - 1e-9) return;
  state.sum -= 1;
  state.gate.lastFrame = world.frame;
  state.fires += 1;
  note(world, "chance", { key: effect.key, by: origin });
  fireEffects(world, effect.effects, origin);
}

// Several streams on one timer: a run's n successes split between them as the fight's successes have so far, so with every chance at 100% each
// stream's count is exact. The table of n → base stays until a share moves by more than a count in 1024: a table read costs one array read.
function refreshStreamTable(chain, stream, expected) {
  const { streams, shares } = chain;
  while (streams.length <= stream) streams.push(0);
  streams[stream] += expected;
  let total = 0;
  for (let index = 0; index < streams.length; index += 1) total += streams[index];
  let same = shares?.length === streams.length;
  for (let index = 0; same && index < streams.length; index += 1) same = Math.abs(streams[index] / total - shares[index]) < 1 / 1024;
  if (same) return;
  chain.shares = streams.map((value) => value / total);
  chain.table.fill(NaN);
}
const streamValue = (spec, chain, n) => {
  const value = chain.table[n];
  return value === value ? value : (chain.table[n] = spec.retainedOf(chain.shares.map((share) => n * share)));
};

// One attempt on a chain, at this share of the chance. Returns the probability of a success; chain.successBase is the base those successes hold.
function attemptChain(world, spec, run, chance, notActive, stream = 0) {
  const chain = run.chain, { byCount, moved, top, groups } = chain, keep = 1 - chance;
  const fresh = Math.max(0, 1 - chain.held) * notActive;
  chain.successBase = 0;
  if (!(fresh > 0) && !(chance > 0 && chain.held > 0)) return 0;
  if (chain.streams) refreshStreamTable(chain, stream, fresh + chain.held * chance);
  const valueAt = chain.streams ? (n) => streamValue(spec, chain, n) : (n) => chain.table[n];
  // Each held run: a success moves it to n + 1 on this tick's group, what fails stays where it is.
  if (chance > 0) {
    for (let n = chain.high; n >= chain.low; n -= 1) {
      const mass = byCount[n];
      if (!(mass > 0)) continue;
      moved[Math.min(top, n + 1)] += mass * chance;
      byCount[n] = keep > 0 ? mass * keep : 0;
    }
    if (keep > 0) { for (const group of groups) group.scale *= keep; chain.base *= keep; }
    else { for (const group of groups) releaseGroup(chain, group); groups.length = 0; chain.base = 0; }
  }
  moved[1] += fresh;
  chain.held += fresh;
  if (chain.freshFrame !== world.frame) { chain.freshFrame = world.frame; chain.freshHeld = 0; chain.freshBase = 0; }
  chain.freshHeld += fresh;
  chain.freshBase += fresh * valueAt(1);
  const back = Math.min(run.ended, fresh);
  run.ended -= back;
  run.lapses += back;
  const from = fresh > 0 ? 1 : Math.min(top, chain.low + 1), to = Math.max(from, Math.min(top, chain.high + 1));
  let group = groups[groups.length - 1];
  if (group?.frame !== world.frame) {
    group = { frame: world.frame, expiryFrame: buffExpiryFrame(world.frame, spec.seconds), cells: chain.spare.pop() ?? new Float64Array(top + 1), scale: 1, mass: 0, base: 0, low: top + 1, high: 0, snap: snapshotAt(world, spec.path) };
    groups.push(group);
  }
  let success = 0, successBase = 0;
  for (let n = from; n <= to; n += 1) {
    const mass = moved[n];
    if (!(mass > 0)) continue;
    moved[n] = 0;
    byCount[n] += mass;
    group.cells[n] += mass / group.scale;
    if (n < group.low) group.low = n;
    if (n > group.high) group.high = n;
    if (n < chain.low) chain.low = n;
    if (n > chain.high) chain.high = n;
    success += mass;
    successBase += mass * valueAt(n);
  }
  group.mass += success / group.scale;
  group.base += successBase / group.scale;
  chain.base += successBase;
  while (chain.low <= chain.high && !(byCount[chain.low] > 0)) chain.low += 1;
  chain.successBase = successBase;
  return success;
}

function releaseGroup(chain, group) {
  group.cells.fill(0, group.low, group.high + 1);
  chain.spare.push(group.cells);
}

// A group's timer ends: its mass goes back to the absent state, and with no group left the run is over, exactly. A chain kept beside a held store
// (`ownsDot` false) counts successes only: the store's run carries the lapses and the DoT record.
function expireChain(world, key, chain, run, ownsDot = true) {
  const { groups, byCount } = chain;
  while (groups.length && world.frame >= groups[0].expiryFrame) {
    const group = groups.shift(), mass = group.mass * group.scale;
    for (let n = group.low; n <= group.high; n += 1) byCount[n] = Math.max(0, byCount[n] - group.cells[n] * group.scale);
    chain.held -= mass;
    chain.base -= group.base * group.scale;
    if (ownsDot) run.ended += mass;
    releaseGroup(chain, group);
  }
  if (groups.length) { while (chain.low <= chain.high && !(byCount[chain.low] > 0)) chain.low += 1; return; }
  byCount.fill(0);
  chain.low = chain.top + 1;
  chain.high = 0;
  chain.held = 0;
  chain.base = 0;
  if (ownsDot) world.dots.delete(key);
}

// A held store's stacks whose timer ends on this tick (a stack lasts its duration from its own application: nothing weaker refreshes it).
function expireHeld(world, key, state, run) {
  run.ended += world.ailmentSpecs.get(key).store.expire(state, world.frame);
  if (!state.groups.length) world.dots.delete(key);
}

// Independent stacks: each attempt adds its expected stacks on its own timer, with the applying skill's value, so a low chance spreads over the
// attempts and nothing waits for a first whole success. At the limit the shortest remaining stack goes (buff record mode 7): the oldest here,
// because all share one duration.
function addStacks(world, spec, effect, chance, origin) {
  let record = world.dots.get(spec.key);
  if (!record) { record = { stacks: [], head: 0, weight: 0, base: 0, firstSettleFrame: world.frame + 1, by: origin }; world.dots.set(spec.key, record); }
  const weight = chance * (effect.stacks ?? 1), value = effect.value ?? spec.value;
  record.stacks.push({ expiryFrame: buffExpiryFrame(world.frame, spec.seconds), value, weight, snap: snapshotAt(world, spec.path) });
  record.weight += weight;
  record.base += weight * value;
  for (let over = record.weight - spec.limit; over > 1e-12 && record.head < record.stacks.length;) {
    const stack = record.stacks[record.head], cut = Math.min(stack.weight, over);
    stack.weight -= cut;
    record.weight -= cut;
    record.base -= cut * stack.value;
    over -= cut;
    if (!(stack.weight > 1e-15)) record.head += 1;
  }
}

function expireStacks(world, key, record) {
  const { stacks } = record;
  while (record.head < stacks.length && world.frame >= stacks[record.head].expiryFrame) {
    const stack = stacks[record.head];
    record.weight -= stack.weight;
    record.base -= stack.weight * stack.value;
    record.head += 1;
  }
  if (record.head === stacks.length) { world.dots.delete(key); return; }
  if (record.head > 512) { stacks.splice(0, record.head); record.head = 0; }
}

// A success of an ailment reaches the Reaps that wait for one: the ready share fires, at the base those successes hold.
function reapRecovered(world, reap) {
  const { recovering, spec } = reap, speed = speedFactorOf(spec.speedFactor, world);
  while (reap.head < recovering.length) {
    const entry = recovering[reap.head], elapsed = world.frame - entry.frame;
    if (!(elapsed > 0) || !scaledTimerReady(spec.baseSeconds, speed, elapsed)) break;
    reap.ready += entry.mass;
    reap.head += 1;
  }
}
function successReaches(world, ailment, success, successBase) {
  for (const reap of world.reapWatchers.get(ailment) || []) {
    reapRecovered(world, reap);
    const fired = reap.ready * success;
    if (!(fired > 0)) continue;
    reap.ready -= fired;
    reap.pendingMass += fired;
    reap.pendingBase += fired * successBase / success;
    reap.recovering.push({ frame: world.frame, mass: fired });
  }
}

// A use counts toward its Reap. A Reap that stayed averaged is not on the loop, so its use counts for nothing.
function countReapUse(world, key) {
  const reap = world.reapByKey.get(key);
  if (reap) reap.uses += 1;
}

// An application: the attempts of one event, each at the whole percent, its own when the ailment is absent. A fractional attempt is one attempt
// at that share of the chance, so the expected count holds.
function applyAilment(world, effect, origin) {
  const spec = world.ailmentSpecs.get(effect.ailment);
  if (!spec) throw new RangeError(`tick engine: unknown ailment ${effect.ailment}`);
  const key = effect.key ?? effect.ailment, run = world.ailmentRuns.get(spec.key);
  let state = world.accumulators.get(key);
  if (!state) { state = { sum: 0, gate: newGate(), fires: 0 }; world.accumulators.set(key, state); }
  const attempts = effect.attempts ?? 1, whole = Math.floor(attempts + 1e-12), part = Math.max(0, attempts - whole);
  for (let index = 0; index <= whole; index += 1) {
    const share = index < whole ? 1 : part;
    if (!(share > 0)) continue;
    let success, successBase;
    if (run.store) {
      // Mode 6 at a one-rank limit (spec.store): compared on the application's own amount, a weaker one does nothing. The variant is the
      // application's own state that enters its amount (Aim's ailment line while Aim is up), read at the attempt.
      const { store } = spec, state = run.store, fresh = Math.max(0, 1 - state.held) * (effect.notActiveChance ?? effect.chance) * share;
      const variant = store.variantBuff && buffStacks(world, store.variantBuff) > 0 ? 1 : 0;
      const group = store.group(state, world.frame, buffExpiryFrame(world.frame, spec.seconds), snapshotAt(world, spec.path));
      success = store.attempt(state, (effect.stream ?? 0) * (store.variantCount ?? 1) + Math.min(variant, (store.variantCount ?? 1) - 1), effect.chance * share, (effect.notActiveChance ?? effect.chance) * share, group, world.frame);
      successBase = state.successBase;
      const back = Math.min(run.ended, fresh);
      run.ended -= back;
      run.lapses += back;
      if (state.held > 0) { state.by = origin; world.dots.set(spec.key, state); }
      // Scorch's share reads the run's success count on a chain kept beside the store; its own lapse count stays out of the run's.
      if (run.chain) attemptChain(world, spec, { chain: run.chain, ended: 0, lapses: 0 }, effect.chance * share, (effect.notActiveChance ?? effect.chance) * share, effect.stream);
    } else if (run.chain) {
      success = attemptChain(world, spec, run, effect.chance * share, (effect.notActiveChance ?? effect.chance) * share, effect.stream);
      successBase = run.chain.successBase;
      if (run.chain.held > 0) { run.chain.by = origin; world.dots.set(spec.key, run.chain); }
    } else {
      success = effect.chance * share;
      if (success > 0) addStacks(world, spec, effect, success, origin);
      successBase = success * (world.dots.get(spec.key)?.base ?? 0);
    }
    if (!(success > 0)) continue;
    run.total += success;
    state.fires += success;
    successReaches(world, spec.key, success, successBase);
  }
  note(world, "ailment", { ailment: spec.key, successes: run.total, by: origin });
  for (const key of effect.reapUses || []) countReapUse(world, key);
}

// The stacks of a DoT record on this tick: expected, for a chain and for stacks; a plain DoT holds one.
const dotBase = (record) => record.base ?? 1;

// tick-ailment-snapshot: the indexes of a DoT path's `attacker` modifiers (the attacker's time-varying layers), their amounts at an application,
// and a tick's DoT amount read per snapshot: a chain's success groups, a stack record's stacks or a single DoT each carry what their application saw.
function snapshotIndexes(world, path) {
  let indexes = world.snapIndexes.get(path.key);
  if (!indexes) { indexes = (path.modifiers || []).map((modifier, index) => modifier.attacker ? index : -1).filter((index) => index >= 0); world.snapIndexes.set(path.key, indexes); }
  return indexes;
}
function snapshotAt(world, pathKey) {
  const path = pathKey ? world.paths.get(pathKey) : null;
  if (!path) return null;
  const indexes = snapshotIndexes(world, path);
  return indexes.length ? indexes.map((index) => modifierAmount(world, path.modifiers[index])) : null;
}
function snapshotDotAmount(world, path, dot, fresh) {
  const indexes = snapshotIndexes(world, path), modifiers = path.modifiers || [];
  const current = modifiers.map((modifier) => modifierAmount(world, modifier));
  const valueAt = new Map();
  const valueOf = (snap) => {
    const key = snap ? snap.join(",") : "";
    let value = valueAt.get(key);
    if (value === undefined) {
      const amounts = current.slice();
      if (snap) indexes.forEach((index, at) => { amounts[index] = snap[at]; });
      value = pathValueAt(path, amounts);
      valueAt.set(key, value);
    }
    return value;
  };
  let total = 0;
  // The group of this tick holds the moved successes (settling now) and the fresh runs (settling from the next tick): only the fresh base waits.
  if (dot.chain) { for (const group of dot.groups) total += (group.base * group.scale - (fresh && group.frame === world.frame ? dot.freshBase : 0)) * valueOf(group.snap ?? null); }
  else if (dot.stacks) { for (let at = dot.head; at < dot.stacks.length; at += 1) { const stack = dot.stacks[at]; total += stack.weight * stack.value * valueOf(stack.snap ?? null); } }
  else total = dotBase(dot) * valueOf(dot.snap ?? null);
  return total * FRAME_SECONDS;
}

// Who fires at full Affliction, and the rating left. A full-Affliction Reap's recovery gates its removal.
function fireRemovers(world) {
  const state = world.affliction;
  let { rating } = state;
  for (const remover of state.removers) {
    const { spec } = remover;
    if (!atMaxAffliction(rating) || !scaledGateReady(remover.gate, world.frame, spec.baseSeconds ?? spec.recoverySeconds, speedFactorOf(spec.speedFactor, world))) continue;
    remover.gate.lastFrame = world.frame;
    remover.fires += 1;
    remover.firedFrame = world.frame;
    rating = Math.max(0, rating - spec.removedPercent);
    note(world, "afflictionRemoved", { remover: spec.key, rating });
    // tick-reap-settle: the dispatcher reads the ratio the last DoT pass wrote, and the state now, before this tick's DoT pass and hits.
    const reap = world.reapByKey.get(spec.key);
    if (reap && spec.settle === "lastDot") settleReap(world, reap, 1, null, state.lastRead);
  }
  return rating;
}

// One Reap: every DoT it reaches, at that DoT's rate on this tick × its seconds × its settle scale. `mass` is the share of a Reap that fired, and
// `triggerBase` what that share holds of the ailment that fired it. The path is past resistance, so no second resistance step and no crit.
function settleReap(world, reap, mass = 1, triggerBase = null, rating = undefined) {
  const { spec } = reap, parts = world.trace ? [] : null;
  world.affliction.settleRating = rating;
  let total = 0;
  for (const [key, dot] of world.dots) {
    const dotSpec = world.dotSpecs.get(key), settle = spec.dots?.[key], seconds = settle?.seconds ?? spec.reapSeconds ?? 0;
    if (!dotSpec.path || !(seconds > 0)) continue;
    const path = world.paths.get(dotSpec.path), base = key === spec.ailment && triggerBase !== null ? triggerBase : mass * dotBase(dot);
    const value = base * currentPathValue(world, path) * seconds * (settle?.scale ?? spec.scale ?? 1);
    total += value;
    if (parts) parts.push({ dot: key, base, seconds, value, amounts: (path.modifiers || []).map((modifier) => modifierAmount(world, modifier)) });
  }
  world.affliction.settleRating = undefined;
  reap.fires += mass;
  deal(world, spec.key, total, { kind: "reap", mass, ...(parts ? { parts } : {}) });
  // What a Reap grants (a Blessing gained when Reaping): the share of a Reap that fired, in expectation.
  if (spec.onFire) fireEffects(world, spec.onFire.map((effect) => ({ ...effect, stacks: (effect.stacks ?? 1) * mass })), spec.label || spec.key);
}

// The Reap flush, after the hits. A Reap's timer, speed-scaled, ends on the first tick with cd ≤ elapsed. Uses arm a Reap: it fires on the tick the
// count is reached, or the first tick after that its recovery allows, and the count restarts.
function flushReaps(world, dotDealt) {
  for (const reap of world.reaps) {
    const { spec } = reap;
    if (spec.trigger === "success") {
      if (reap.pendingMass > 0) settleReap(world, reap, reap.pendingMass, reap.pendingBase);
      reap.pendingMass = 0;
      reap.pendingBase = 0;
      continue;
    }
    if (spec.trigger === "affliction") {
      const remover = world.affliction.removers.find((item) => item.spec.key === spec.remover);
      if (remover?.firedFrame === world.frame && remover.spec.settle !== "lastDot") settleReap(world, reap, 1, null, AFFLICTION_MAX);
      continue;
    }
    const uses = spec.trigger === "uses";
    if (!world.dots.size || (uses ? reap.uses < (spec.usesPerTrigger ?? 1) : !dotDealt)) continue;
    if (!scaledGateReady(reap.gate, world.frame, spec.baseSeconds ?? 0, speedFactorOf(spec.speedFactor, world))) continue;
    reap.gate.lastFrame = world.frame;
    reap.uses = 0;
    settleReap(world, reap);
  }
}

function fireEffects(world, effects = [], origin) {
  for (const effect of effects) {
    switch (effect.kind) {
      case "hit":
        if (!world.paths.has(effect.path)) throw new RangeError(`tick engine: unknown damage path ${effect.path}`);
        world.attacks.push({ effect, origin });
        break;
      case "buff": {
        const buff = world.buffs.get(effect.buff);
        const stacks = Math.min(effect.maxStacks ?? 1, (buff?.stacks || 0) + (effect.stacks ?? 1));
        world.buffs.set(effect.buff, { stacks, startFrame: world.frame, expiryFrame: buffExpiryFrame(world.frame, effect.seconds) });
        note(world, "buff", { buff: effect.buff, stacks, by: origin });
        break;
      }
      case "consume": {
        // A charge spent: the stacks go down at once, the timers of the rest stay.
        const buff = world.buffs.get(effect.buff);
        if (!buff) break;
        buff.stacks -= effect.stacks ?? 1;
        if (buff.stacks <= 0) world.buffs.delete(effect.buff);
        note(world, "buffConsumed", { buff: effect.buff, by: origin });
        break;
      }
      case "dot":
        if (!world.dotSpecs.has(effect.dot)) throw new RangeError(`tick engine: unknown DoT ${effect.dot}`);
        // Shared timer: a new application restarts it (user-established for Ignite and Trauma). A new DoT first settles on the next
        // tick, wherever in the tick it was applied, so a DoT lasting D s settles exactly D × 30 ticks.
        world.dots.set(effect.dot, { expiryFrame: buffExpiryFrame(world.frame, effect.seconds), firstSettleFrame: world.dots.get(effect.dot)?.firstSettleFrame ?? world.frame + 1, by: origin, snap: snapshotAt(world, world.dotSpecs.get(effect.dot).path) });
        note(world, "dot", { dot: effect.dot, by: origin });
        break;
      case "ailment":
        applyAilment(world, effect, origin);
        break;
      case "reapUse":
        countReapUse(world, effect.reap);
        break;
      case "collect":
        collectorAdd(world.collectors.get(effect.collector), world.frame, effect.value ?? 1);
        break;
      case "event":
        // No damage of its own, but the same place in the tick as a hit (a follower strike whose damage is carried as averaged).
        world.attacks.push({ effect, origin });
        break;
      case "chance":
        rollAccumulator(world, effect, origin);
        break;
      case "reduceCooldowns":
        // All of the player's skills: the follower is another unit.
        for (const holder of [...world.actions, ...world.triggers]) if (holder.cooldown && holder.cooldown.startFrame !== null && (holder.spec.actor ?? "player") === "player") holder.cooldown.creditSeconds += effect.seconds;
        note(world, "cooldownReduced", { seconds: effect.seconds, by: origin });
        break;
      case "delay": {
        // One-frame minimum on waits (§3.2): a delayed event lands on a later tick, in the Timer stage.
        const due = world.frame + Math.max(1, framesAtOrAfter(effect.seconds));
        if (!world.delayed.has(due)) world.delayed.set(due, []);
        world.delayed.get(due).push({ effects: effect.effects, origin });
        break;
      }
      default:
        throw new RangeError(`tick engine: unknown effect ${effect.kind}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The stages of a tick

const STAGES = {
  // 1. Begin: frame + 1, time += 1/30 (the frame counter is the clock; time is derived so it never accumulates float noise).
  begin(world) {
    world.time = world.frame / TICKS_PER_SECOND;
  },
  // 2. Timer, Event: delayed events.
  timerEvent(world) {
    const due = world.delayed.get(world.frame);
    if (!due) return;
    world.delayed.delete(world.frame);
    for (const item of due) fireEffects(world, item.effects, item.origin);
  },
  // 3. Command: best-case input, press whenever ready. Skills start ready when the fight begins (user decision 2026-10-22): the press
  // is on tick 1 and the phase runs on the same tick, so a 1 s skill ends on tick 30, at 1 s. A cooldown runs from the press.
  command(world) {
    const canPress = (action) => {
      const { spec } = action;
      if (action.phase || action.timeline) return false;
      if (spec.maxUses !== undefined && action.presses >= spec.maxUses) return false;
      if (spec.requiresBuff && !(buffStacks(world, spec.requiresBuff) > 0)) return false;
      return !action.cooldown || cooldownReady(world, action.cooldown);
    };
    // One actor: only one action of a queue starts, the one ready longest. The clocks run while the queue is busy. A `ring` position (the follower's
    // AI_SelectMercenarySkill, chunk 14) takes the first ready action after the last one used, in ring order.
    const chosen = new Map();
    const ringRank = (spec) => { const last = world.queueLast.get(spec.queue) ?? -1, n = spec.ringSize; return ((spec.ring - last - 1) % n + n) % n; };
    for (const action of world.actions) {
      const { queue } = action.spec;
      if (!queue || !canPress(action)) continue;
      action.readySince ??= world.frame;
      const best = chosen.get(queue);
      const ahead = !best || (action.spec.ring !== undefined && best.spec.ring !== undefined ? ringRank(action.spec) < ringRank(best.spec) : action.spec.priority !== undefined && best.spec.priority !== undefined ? action.spec.priority < best.spec.priority : world.queueOrder === "ready" && action.readySince < best.readySince);
      if (ahead) chosen.set(queue, action);
    }
    for (const action of world.actions) {
      const { spec } = action;
      if (spec.queue ? world.queues.has(spec.queue) || chosen.get(spec.queue) !== action : !canPress(action)) continue;
      // A use reads its speed at the press (decision 2026-10-31). The overshoot carries only into a use that starts straight after the last one.
      // A cycle (a Combo skill): each use is the next step, with its own use time and effects.
      action.step = spec.steps ? spec.steps[stepIndex(spec, action.presses)] : null;
      const seconds = action.presses === 0 && spec.firstUseSeconds !== undefined ? spec.firstUseSeconds : secondsOf(action.step ? action.step.useSeconds : spec.useSeconds, world);
      const last = spec.queueCarry ? world.queueEnds.get(spec.queue) : action;
      const carried = last?.endFrame === world.frame - 1 ? last.carried : 0;
      // "nearest": the open reading that a Tangle's timer is a fixed-interval node (open question tick-tangle-timer-class).
      action.phase = spec.timer === "nearest" ? { remaining: fixedIntervalFrames(seconds) } : startCastPhase(seconds, carried);
      action.presses += 1;
      action.readySince = null;
      if (spec.queue) { world.queues.add(spec.queue); if (spec.ring !== undefined) world.queueLast.set(spec.queue, spec.ring); }
      if (action.cooldown) spendCharge(world, action.cooldown);
      note(world, "press", { action: spec.key });
      fireEffects(world, spec.pressEffects, spec.label || spec.key);
    }
  },
  // 4. Trigger, Affix: periodic nodes and event triggers. A trigger with a skill (Preparation, game recipe 80629904: node 253 "skill
  // ready" and node 206, inCdOnCreating false) fires on the first tick both hold, so it starts at once and waits out a cooldown.
  triggerAffix(world) {
    for (const trigger of world.triggers) {
      if (trigger.cooldown && !cooldownReady(world, trigger.cooldown)) continue;
      if (!fixedGateReady(trigger.gate, world.frame, resolve(trigger.spec.intervalSeconds, world))) continue;
      trigger.gate.lastFrame = world.frame;
      trigger.fires += 1;
      if (trigger.cooldown) spendCharge(world, trigger.cooldown);
      note(world, "trigger", { trigger: trigger.spec.key });
      fireEffects(world, trigger.spec.effects, trigger.spec.label || trigger.spec.key);
    }
    for (const periodic of world.periodics) {
      if (world.frame < (periodic.spec.startFrame ?? 1)) continue;
      if (periodic.spec.requiresBuff && !(buffStacks(world, periodic.spec.requiresBuff) > 0)) continue;
      if (!fixedGateReady(periodic.gate, world.frame, resolve(periodic.spec.intervalSeconds, world))) continue;
      periodic.gate.lastFrame = world.frame;
      periodic.fires += 1;
      note(world, "periodic", { periodic: periodic.spec.key });
      fireEffects(world, periodic.spec.effects, periodic.spec.label || periodic.spec.key);
    }
  },
  // 5. Skill: advance phases, fire events.
  skill(world) {
    for (const action of world.actions) {
      const due = action.timeline?.get(world.frame);
      if (due) {
        action.uses += 1;
        note(world, "use", { action: action.spec.key });
        fireEffects(world, due, action.spec.label || action.spec.key);
      }
      if (!action.phase) continue;
      const overshoot = tickCastPhase(action.phase, action.spec.timer === "nearest" ? "drop" : action.spec.timer ?? CAST_OVERSHOOT_RULE);
      if (overshoot === null) continue;
      action.phase = null;
      action.carried = overshoot;
      action.endFrame = world.frame;
      action.uses += 1;
      if (action.spec.queue) world.queues.delete(action.spec.queue);
      if (action.spec.queueCarry) world.queueEnds.set(action.spec.queue, { endFrame: world.frame, carried: overshoot });
      note(world, "use", { action: action.spec.key });
      fireEffects(world, action.step ? action.step.effects : action.spec.effects, action.step?.label || action.spec.label || action.spec.key);
    }
  },
  // 6. Buff: expiries, then DoT settlement. A DoT settles on its own last tick (provisional: the client's order inside the buff update
  // was not traced), so one lasting D s deals exactly DPS × D, as the planner's continuous figure does.
  buff(world) {
    for (const [key, buff] of world.buffs) {
      if (world.frame < buff.expiryFrame) continue;
      world.buffs.delete(key);
      world.buffExpiries.set(key, (world.buffExpiries.get(key) || 0) + 1);
      note(world, "buffExpired", { buff: key });
    }
    const affliction = world.affliction;
    // The game's Affix stage runs before this one: a full-Affliction Reap's removal lands before the DoT pass (open question tick-affliction-removal).
    if (affliction.removalStage === "beforeDot") affliction.rating = fireRemovers(world);
    affliction.lastRead = affliction.rating;
    affliction.readSum += affliction.rating;
    if (atMaxAffliction(affliction.rating)) affliction.ticksAtMax += 1;
    for (const [key, dot] of world.dots) {
      if (world.frame < dot.firstSettleFrame) continue;
      const spec = world.dotSpecs.get(key), fresh = dot.freshFrame === world.frame;
      // What landed on this tick first settles on the next, wherever in the tick it landed, so a DoT lasting D s settles exactly D × 30 ticks.
      const base = dotBase(dot) - (fresh ? dot.freshBase : 0), heldNow = dot.chain ? dot.held - (fresh ? dot.freshHeld : 0) : dot.stacks ? dot.weight : 1;
      if (spec.path && base > 0) {
        const path = world.paths.get(spec.path);
        // tick-ailment-snapshot (chunk 0 finding, live since chunk 15 session 3): the attacker's time-varying multipliers are fixed at each
        // application, so a modifier flagged `attacker` reads the amounts its application snapshotted (per success group, per stack, per
        // record); the target-side ones (Affliction, the dummy's debuffs) read the tick.
        const amount = snapshotIndexes(world, path).length ? snapshotDotAmount(world, path, dot, fresh) : base * currentPathValue(world, path) * FRAME_SECONDS;
        const record = { source: seriesKey(path), amount, dot: key, by: dot.by };
        // With a trace each settlement keeps what it read, so a DoT series can be taken apart (src/tick-parity.js dotBudget).
        if (world.trace) { record.base = base; record.held = heldNow; record.amounts = (path.modifiers || []).map((modifier) => modifierAmount(world, modifier)); }
        world.dotRecords.push(record);
      }
      const held = world.ailmentTicks.get(key);
      if (held) { held.activeTicks += heldNow; held.baseTicks += base; }
      if (dot.kind === "held") expireHeld(world, key, dot, world.ailmentRuns.get(key));
      else if (dot.chain) expireChain(world, key, dot, world.ailmentRuns.get(key));
      else if (dot.stacks) expireStacks(world, key, dot);
      else if (world.frame >= dot.expiryFrame) world.dots.delete(key);
    }
    // A chain kept beside a held store (Scorch's share of the run) runs out on its own timers.
    for (const [key, run] of world.ailmentRuns) if (run.store && run.chain?.groups.length) expireChain(world, key, run.chain, run, false);
  },
  // 7. Attack: hit records, read after this tick's expiries.
  attack(world) {
    for (const { effect, origin } of world.attacks) {
      if (effect.kind === "event") { world.hits.push({ source: null, by: origin, onHit: effect.effects }); continue; }
      const path = world.paths.get(effect.path);
      const hit = { source: seriesKey(path), amount: currentPathValue(world, path) * (effect.count ?? 1), path: path.key, by: origin, onHit: effect.onHit };
      // With a trace each hit keeps the amounts it read, so a run can be taken apart layer by layer (src/tick-parity.js).
      if (world.trace) { hit.amounts = (path.modifiers || []).map((modifier) => modifierAmount(world, modifier)); hit.count = effect.count ?? 1; hit.weight = effect.weight ?? 1; }
      world.hits.push(hit);
    }
    world.attacks.length = 0;
  },
  // 8. Damage: type-1 DoT first, then hits, then the Reap flush (a Reap's event is resolved in FUN_141d4b1c0, after the DoT pass). Reaps settle the
  // DoTs active now and do not consume them.
  damage(world) {
    const dotDealt = world.dotRecords.length > 0;
    for (const record of world.dotRecords) deal(world, record.source, record.amount, { kind: "dot", dot: record.dot, by: record.by, ...(record.amounts ? { amounts: record.amounts, base: record.base, held: record.held } : {}) });
    world.dotRecords.length = 0;
    for (const hit of world.hits) {
      if (hit.source !== null) deal(world, hit.source, hit.amount, { kind: "hit", path: hit.path, by: hit.by, ...(hit.amounts ? { amounts: hit.amounts, count: hit.count, weight: hit.weight } : {}) });
      fireEffects(world, hit.onHit, hit.by);
    }
    world.hits.length = 0;
    // The open reading of tick-affliction-removal: the removal after the Reap's damage. Either way the gain comes last (§3.2, §4.1).
    const left = world.affliction.removalStage === "reap" ? fireRemovers(world) : null;
    flushReaps(world, dotDealt);
    if (left !== null) world.affliction.rating = left;
    if (world.affliction.accrual === "fromStart" || world.dots.size) world.affliction.rating = Math.max(0, Math.min(AFFLICTION_MAX, world.affliction.rating + world.affliction.perTick));
    // Sources the loop does not model yet: the planner's average, spread over the ticks (named in the result as averaged).
    for (const item of world.averaged) {
      if (world.frame < item.startFrame) continue;
      world.bySource[item.key][world.frame - 1] += item.dps * FRAME_SECONDS;
      world.stats[item.key].damage += item.dps * FRAME_SECONDS;
      if (item.dps > 0 && world.firstDamageFrame === null) world.firstDamageFrame = world.frame;
    }
  },
  // 9. FightResource, State, Collector: prune the windows.
  state(world) {
    for (const collector of world.collectors.values()) collectorPrune(collector, world.frame);
    for (const [key, buff] of world.buffs) {
      const held = world.buffTicks.get(key) || { ticks: 0, stackTicks: 0, peak: 0 };
      held.ticks += 1;
      held.stackTicks += buff.stacks;
      if (buff.stacks > held.peak) held.peak = buff.stacks;
      world.buffTicks.set(key, held);
    }
  },
  // 10. CastEvent, End: damage is already binned by tick; the bin of tick n is n − 1, so a 54 s run is exactly bins 0–1619.
  end() {}
};

const STAGE_LIST = SYSTEM_ORDER.map((name) => [name, STAGES[name]]);

/** What the loop takes as given, for the result's assumptions list. */
function engineAssumptions() {
  return [
    { id: "tickGrid", value: TICKS_PER_SECOND, text: `Whole ticks at ${TICKS_PER_SECOND} Hz, in the client's system order: a built-in engine limit, no toggle.` },
    { id: "tick-cast-overshoot", value: CAST_OVERSHOOT_RULE, text: `Cast overshoot across uses: ${CAST_OVERSHOOT_RULE} (open, research/tick-engine-investigation-2026-10-30.md §3.4).` },
    { id: "singlePhase", value: "use time", text: "One SkillAction phase per use; the hit fires at its end, on the tick the use ends, unless the program adds a delay for travel." },
    { id: "expectedValues", value: true, text: "Hits are expected values (crit, Lucky, Double Damage in the planner's figures); no dice." },
    { id: "chanceAccumulator", value: "accumulator", text: "A chance-gated event (Blessing gains, Mark, a crit-gated cooldown) is one deterministic accumulator: each eligible event adds its probability, and it fires when the sum reaches 1 (long-run rate kept, behind any gate). Ailment applications are not on it." },
    { id: "ailmentSurvival", value: "expected", text: "An ailment application is expected values at the whole percent: a shared timer carries the probability it is held and of each success count, a success restarts it and expiry clears the run; a limit-1 Ignite or Trauma carries the probability of each held amount and application tick, replaced only by an application at least as strong (a weaker one does nothing) and expiring its duration after its own application; independent stacks each carry their chance." },
    { id: "tick-actor-order", value: ACTOR_ORDER.join(" > "), text: `Actors act in the order ${ACTOR_ORDER.join(", ")} inside a tick (provisional, not traced in the client).` }
  ];
}

/**
 * The run with the recount's clock on the first damage (the meter's start is open: research/dummy-recount-spec-2026-10-09.md). Tick n sits
 * in bin n − 1, while firstDamageSeconds is the tick's end, so summarizeRecount needs the bin's start.
 */
export const firstHitTimeline = (run) => ({ ...run, firstDamageSeconds: Number.isFinite(run.firstDamageSeconds) ? run.firstDamageSeconds - FRAME_SECONDS : run.firstDamageSeconds, options: { ...run.options, recountStart: "firstDamage" } });

/**
 * Run the dummy tick by tick.
 * @param {object} spec the compiled program (src/tick-ledger.js, or hand-made in the tests); never mutated
 * @param {Record<string, {label, kind, source, parts: {base, increasedPercent, additionalFactor, type}[], modifiers, working}>} spec.paths
 * @param {object[]} [spec.actions] repeated skill uses: { key, label, actor, useSeconds (number, world => number or { baseSeconds, speed },
 *   read at each press), firstUseSeconds, timer ("carry" | "drop" | "nearest"; default CAST_OVERSHOOT_RULE), maxUses, requiresBuff,
 *   cooldown: { baseSeconds, speedFactor (number, function or { speed }), maxCharges, startCharges }, pressEffects, effects,
 *   steps: [{ useSeconds, effects, label }] (a cycle, one step per use, in place of useSeconds and effects), loopFrom (the step the cycle repeats
 *   from past its end; default 0), queue (actions of one queue are one actor: one use at a time), priority (the lowest ready action of a queue
 *   goes next), ring and ringSize (the first ready action after the last one used, in ring order), queueCarry (the overshoot carries into the
 *   queue's next use, whichever action it is),
 *   timeline: [{ frame, effects }] (whole ticks in place of uses: a schedule, in its actor's place in the Skill stage) }
 * @param {string} [spec.queueOrder] who goes next in a queue: "ready" (longest ready, the default) or "list" (the first ready in the list)
 * @param {object[]} [spec.triggers] a skill fired by a fixed node when it is ready: { key, label, actor, intervalSeconds, cooldown, effects }
 * @param {object[]} [spec.periodics] fixed-interval nodes: { key, label, actor, intervalSeconds (number or world => number), startFrame,
 *   requiresBuff, effects }
 * @param {object[]} [spec.dots] { key, path } (the path's value is its DPS)
 * @param {object[]} [spec.ailments] { key, path (null: no damage of its own, a chain another path reads), stacking ("shared" | "independent"),
 *   seconds; shared: retainedBase (n successes → the run's base), or retainedOf(counts per stream) with topCount, or store (a held store:
 *   { create, attempt, group, expire } from src/held-ailment-store.js, variantBuff, variantCount; an attempt's kind is stream × variantCount +
 *   variant) with keepChain (a chain beside it for ailmentShare); independent: limit, value } (DPS = base × path)
 * @param {object} [spec.affliction] { perSecond, removers: [{ key, baseSeconds, speedFactor (or recoverySeconds), removedPercent, settle ("lastDot" reads
 *   the last DoT pass's rating) }], removalStage ("beforeDot" | "reap"), accrual ("fromStart" | "whileDot") }
 * @param {object[]} [spec.reaps] { key, label, baseSeconds, speedFactor, trigger, reapSeconds, scale, onFire (effects a Reap grants), dots: { [dot]: { seconds, scale } } }. trigger: none, a DoT
 *   was dealt this tick; "success", a success of `ailment`; "affliction", `remover` fired; "uses", `usesPerTrigger` uses counted by `reapUses` on an
 *   ailment effect or the effect "reapUse", from `startUses`
 * @param {object[]} [spec.derived] a series made from others when the run ends: { key, label, factor, builders: [series key], reason }
 * @param {object[]} [spec.collectors] { key, windowSeconds, seed: [{ frame, value }] (ticks ≤ 0, oldest first) }
 * @param {object[]} [spec.initialBuffs] buffs held at engagement: { buff, stacks, seconds }
 * @param {Record<string, {increasedPercent, additionalFactor, modifiers}>} [spec.speeds] named speeds, built like a path of base 1
 * @param {object[]} [spec.averaged] { key, label, dps, fromSeconds, reason }
 * Effects: { kind: "hit", path, count, weight (a use's share, for the trace), onHit } | { kind: "event", effects } | { kind: "buff", buff, seconds, stacks, maxStacks } |
 * { kind: "dot", dot, seconds } | { kind: "collect", collector, value } | { kind: "delay", seconds, effects } |
 * { kind: "chance", key, probability, gate: { fixedSeconds }, effects } | { kind: "reduceCooldowns", seconds } |
 * { kind: "consume", buff, stacks } | { kind: "ailment", ailment, key, chance, notActiveChance, attempts, stream, stacks, value, reapUses: [reap key] } |
 * { kind: "reapUse", reap }.
 * Modifiers (on a path or a speed): { buff | collector | count: [{ buff } | { held: true }] | affliction: true | maxAffliction: { ratioAtNone,
 *   ratioAtFull } | ailmentShare: { ailment, fractions } | amount: world => percent, requires: [buff], layer, percent, perStack, capPercent, perPoint,
 *   types, parts }.
 * @param {object} [options]
 * @param {number} [options.seconds] run length; default spec.seconds, else 54
 * @param {boolean} [options.trace] keep every stage and event, each naming its source
 * @returns a timeline for src/dummy-recount.js windowTotals / summarizeRecount: { stepSeconds, seconds, total, bySource, labels,
 *   firstDamageSeconds, options, assumptions }, plus { frames, sources (per source: label, kind, events, damage, working), trace }
 */
export function runTickEngine(spec, { seconds = spec?.seconds ?? 54, trace = false } = {}) {
  const frames = Math.round(seconds * TICKS_PER_SECOND);
  if (!(frames > 0) || !Number.isFinite(frames)) throw new RangeError("tick engine: seconds must be positive and finite");
  const world = createWorld(spec, frames, trace);
  for (let frame = 1; frame <= frames; frame += 1) {
    world.frame = frame;
    for (const [name, run] of STAGE_LIST) {
      world.stage = name;
      note(world, "stage");
      run(world);
    }
  }
  for (const item of spec.derived || []) {
    const series = world.bySource[item.key];
    // A series built by the program's own rule from the builders' series (Spacetime Turbulence), else factor × each builder.
    if (item.build) { const built = item.build(world.bySource, frames, FRAME_SECONDS); for (let bin = 0; bin < frames; bin += 1) series[bin] += built[bin]; }
    else for (const key of item.builders) { const from = world.bySource[key]; if (from) for (let bin = 0; bin < frames; bin += 1) series[bin] += from[bin] * item.factor; }
    world.stats[item.key].damage = series.reduce((sum, value) => sum + value, 0);
  }
  const total = new Float64Array(frames);
  for (const series of Object.values(world.bySource)) for (let bin = 0; bin < frames; bin += 1) total[bin] += series[bin];
  return {
    stepSeconds: FRAME_SECONDS, seconds: frames / TICKS_PER_SECOND, frames, total, bySource: world.bySource, labels: world.labels,
    firstDamageSeconds: world.firstDamageFrame === null ? Infinity : world.firstDamageFrame / TICKS_PER_SECOND,
    options: { recountStart: "engage", engine: "tick", ticksPerSecond: TICKS_PER_SECOND, castOvershoot: CAST_OVERSHOOT_RULE },
    assumptions: [...engineAssumptions(), ...(spec.assumptions || [])],
    sources: world.stats,
    uses: Object.fromEntries(world.actions.map((action) => [action.spec.key, action.uses])),
    triggers: Object.fromEntries([...world.triggers.map((item) => [item.spec.key, item.fires]), ...world.periodics.map((item) => [item.spec.key, item.fires])]),
    chances: Object.fromEntries([...world.accumulators].map(([key, state]) => [key, state.fires])),
    // Per buff: the share of ticks it was held, the average stacks over the run, how often it ran out and the most stacks it held (a buff built from 0
    // that never runs out reads an uptime below 1 from its opening alone).
    buffs: Object.fromEntries([...world.buffTicks].map(([key, held]) => [key, { uptime: held.ticks / frames, averageStacks: held.stackTicks / frames, expiries: world.buffExpiries.get(key) || 0, peakStacks: held.peak }])),
    // The rating the DoT pass read, over the run.
    affliction: { averageRating: world.affliction.readSum / frames, ticksAtMax: world.affliction.ticksAtMax, removals: world.affliction.removers.reduce((sum, item) => sum + item.fires, 0), finalRating: world.affliction.rating },
    // Expected successes, lapses and ticks held; the mean base while it was held.
    ailments: Object.fromEntries([...world.ailmentRuns].map(([key, item]) => { const held = world.ailmentTicks.get(key); return [key, { successes: item.total, lapses: item.lapses, activeTicks: held.activeTicks, meanBase: held.activeTicks ? held.baseTicks / held.activeTicks : 0 }]; })),
    // Expected fires per Reap.
    reaps: Object.fromEntries(world.reaps.map((reap) => [reap.spec.key, reap.fires])),
    trace: world.trace
  };
}
