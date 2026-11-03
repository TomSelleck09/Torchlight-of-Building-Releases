// The held stack of a limit-1 Ignite or Trauma, in expectation (user decision 2026-11-02, following the client; research/core-formulas-chunk0-
// 2026-10-31.md §5, open question ailment-held-strength). Mode 6 compares an application at the limit with the held one on the application's own
// amount: an application at least as strong replaces it (an equal one too), a strictly weaker one does nothing, so it neither replaces nor refreshes
// it, and the held stack expires its duration after its own application; then the next application, of any strength, takes the slot. The user's
// in-game check (2026-11-02): with the beam stopped and Nether Grasp still hitting, the Trauma number falls to Nether Grasp's level, which a weaker
// hit refreshing the strong stack cannot give.
//
// Pure, no imports: src/tick-engine.js runs it through the spec (it stays import-free), src/ailment-model.js and src/theoretical-sources.js run it
// on a regular schedule for the steady figures, so the loop and the steady path read one rule.
//
// The method is exact in expectation for the discretised rolls: the probability of each (application tick, amount level) the held stack can be in,
// carried over the attempts. An attempt at chance c from a stream whose amount X has P(X ≥ x_k) = S_k keeps 1 − c × S_k of the mass at level k
// (the rest is replaced), moves that mass and c0 × the absent mass (c0 the chance when nothing is held) to this tick's group at the new amount, and
// the groups expire on their own timers. Two applications on one level of a roll range count as a continuous tie, half replaces; an exact amount
// (a roll with no range) replaces an equal held one in full, as the client's equal compare does.
// Each roll range is split into `bins` equal-probability levels at their midpoints: 32 levels already land within 0.01% of 256 on the Selena Trauma
// build (scratch check, 2026-11-02).

export const HELD_STORE_BINS = 48;
// A cell below this probability is dropped (a held probability is at most 1, so the loss stays below 1e-15 a tick).
const TINY = 1e-18;
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/**
 * The amount levels of a store: one sorted grid of every kind's discretised values, and per kind its probabilities and P(X ≥ level) with the tie
 * share. A kind is one stream's application (its roll × its own scale × crit and double mixtures × a variant factor such as Aim's state × the stacks
 * one application holds).
 * @param {{ min: number, max: number, critChance?: number, critFactor?: number, doubleChance?: number, factor?: number, weight?: number }[]} kinds
 *   chances as fractions; `factor` a variant multiplier; `weight` the stacks an application holds (one rank: min(stacks per application, limit))
 * @param {{ bins?: number }} [options]
 * @returns {{ values: Float64Array, tie: Float64Array, kinds: { pmf: Float64Array, survival: Float64Array, low: number, high: number, mean: number }[] }}
 */
export function heldStoreLevels(kinds, { bins = HELD_STORE_BINS } = {}) {
  // Each point: [amount, probability, exact (an amount with no range around it)].
  const points = kinds.map((kind) => {
    const crit = clamp01(kind.critChance), critFactor = Math.max(1, Number(kind.critFactor) || 1), double = clamp01(kind.doubleChance);
    const scale = (kind.factor ?? 1) * (kind.weight ?? 1), min = Math.max(0, Number(kind.min) || 0), max = Math.max(min, Number(kind.max) || 0);
    const parts = critFactor === 1 ? [[1 - double, 1], [double, 2]] : [[(1 - crit) * (1 - double), 1], [crit * (1 - double), critFactor], [(1 - crit) * double, 2], [crit * double, 2 * critFactor]];
    const list = [];
    for (const [probability, factor] of parts) {
      if (!(probability > 0)) continue;
      if (max === min) { list.push([min * factor * scale, probability, true]); continue; }
      for (let bin = 0; bin < bins; bin += 1) list.push([(min + (max - min) * (bin + 0.5) / bins) * factor * scale, probability / bins, false]);
    }
    return list;
  });
  const sorted = [...new Set(points.flat().map(([value]) => value))].sort((a, b) => a - b);
  // Equal values from float noise are one level.
  const values = [];
  for (const value of sorted) if (!values.length || value - values[values.length - 1] > 1e-12 * Math.max(1, value)) values.push(value);
  const grid = Float64Array.from(values), at = (value) => { let low = 0, high = grid.length - 1; while (low < high) { const middle = (low + high) >> 1; if (grid[middle] < value - 1e-12 * Math.max(1, value)) low = middle + 1; else high = middle; } return low; };
  // The share of a tie on a level that replaces: 1 where every amount on it is exact, else ½.
  const tie = new Float64Array(grid.length).fill(1);
  for (const list of points) for (const [value, , exact] of list) if (!exact) tie[at(value)] = 0.5;
  return {
    values: grid, tie,
    kinds: points.map((list) => {
      const pmf = new Float64Array(grid.length);
      for (const [value, probability] of list) pmf[at(value)] += probability;
      const survival = new Float64Array(grid.length);
      let above = 0, low = grid.length, high = -1, mean = 0;
      for (let level = grid.length - 1; level >= 0; level -= 1) {
        survival[level] = above + pmf[level] * tie[level];
        above += pmf[level];
        if (pmf[level] > 0) { low = level; if (high < 0) high = level; mean += pmf[level] * grid[level]; }
      }
      return { pmf, survival, low, high, mean };
    })
  };
}

/**
 * A store with nothing held. Its fields read as a shared-timer chain's where src/tick-engine.js settles a DoT: `held` (the probability a stack is
 * held), `base` (its expected amount), `groups` (by application tick, each with `base`, `scale` 1 and the attacker snapshot `snap`), and the
 * fresh mass of this tick (`freshFrame`, `freshHeld`, `freshBase`), which settles from the next tick.
 * @param {ReturnType<typeof heldStoreLevels>} levels
 */
export function newHeldState(levels) {
  const size = levels.values.length;
  return { kind: "held", chain: true, values: levels.values, tie: levels.tie, kinds: levels.kinds, byLevel: new Float64Array(size), added: new Float64Array(size), groups: [], spare: [], held: 0, base: 0, freshFrame: 0, freshHeld: 0, freshBase: 0, successBase: 0, by: null };
}

/** This tick's group (a held stack applied on this tick), created on the first attempt of the tick. */
export function heldGroup(state, frame, expiryFrame, snap = null) {
  const last = state.groups[state.groups.length - 1];
  if (last?.frame === frame) return last;
  const group = { frame, expiryFrame, cells: state.spare.pop() ?? new Float64Array(state.values.length), low: state.values.length, high: -1, mass: 0, base: 0, scale: 1, snap };
  state.groups.push(group);
  return group;
}

const totals = (state) => { let held = 0, base = 0; for (const group of state.groups) { held += group.mass; base += group.base; } state.held = held; state.base = base; };

/**
 * One attempt. `group` is this tick's (heldGroup). Returns the probability of a success; state.successBase is the held amount those successes leave
 * (a weaker success keeps the held amount: it counts as an application, and the store does nothing with it).
 * @param {object} state newHeldState
 * @param {number} kindIndex the kind of this application (stream × variant)
 * @param {number} chance the chance when a stack is held
 * @param {number} notActiveChance the chance when none is
 * @param {object} group this tick's group
 * @param {number} frame this tick (the fresh mass settles from the next one)
 */
export function heldAttempt(state, kindIndex, chance, notActiveChance, group, frame) {
  const { values, tie, byLevel: held, added, groups } = state, kind = state.kinds[kindIndex], { pmf, survival } = kind;
  const fresh = Math.max(0, 1 - state.held) * notActiveChance;
  state.successBase = 0;
  if (!(fresh > 0) && !(chance > 0 && state.held > 0)) {
    // Nothing can land: this tick's group, if this attempt opened it, goes again.
    if (!(group.mass > 0) && group.high < group.low && groups[groups.length - 1] === group) { groups.pop(); state.spare.push(group.cells); }
    return 0;
  }
  const before = state.held;
  // The new amounts: an application at level j replaces every held stack below it, the tie share of those on it, and takes an empty slot.
  let below = 0;
  for (let level = 0; level < kind.low; level += 1) below += held[level];
  let addedMass = 0, addedBase = 0;
  for (let level = kind.low; level <= kind.high; level += 1) {
    const mass = pmf[level] > 0 ? pmf[level] * (chance * (below + held[level] * tie[level]) + fresh) : 0;
    added[level] = mass;
    addedMass += mass;
    addedBase += mass * values[level];
    below += held[level];
  }
  // What stays: 1 − c × S_k of each held level; a weaker success keeps its amount.
  let weakerBase = 0;
  if (chance > 0) {
    held.fill(0);
    for (const item of groups) {
      let mass = 0, base = 0;
      for (let level = item.low; level <= item.high; level += 1) {
        const cell = item.cells[level];
        if (!(cell > 0)) continue;
        weakerBase += cell * chance * (1 - survival[level]) * values[level];
        const kept = cell * (1 - chance * survival[level]);
        if (kept > TINY) { item.cells[level] = kept; held[level] += kept; mass += kept; base += kept * values[level]; } else item.cells[level] = 0;
      }
      while (item.low <= item.high && !(item.cells[item.low] > 0)) item.low += 1;
      while (item.high >= item.low && !(item.cells[item.high] > 0)) item.high -= 1;
      item.mass = mass;
      item.base = base;
    }
  }
  for (let level = kind.low; level <= kind.high; level += 1) {
    const mass = added[level];
    added[level] = 0;
    if (!(mass > 0)) continue;
    group.cells[level] += mass;
    held[level] += mass;
    if (level < group.low) group.low = level;
    if (level > group.high) group.high = level;
  }
  group.mass += addedMass;
  group.base += addedBase;
  totals(state);
  if (state.freshFrame !== frame) { state.freshFrame = frame; state.freshHeld = 0; state.freshBase = 0; }
  state.freshHeld += fresh;
  state.freshBase += fresh * kind.mean;
  state.successBase = addedBase + weakerBase;
  return chance * before + fresh;
}

/** The groups whose timer ends on this tick go: returns the mass that ended. */
export function heldExpire(state, frame) {
  const { groups, byLevel: held } = state;
  let ended = 0;
  while (groups.length && frame >= groups[0].expiryFrame) {
    const group = groups.shift();
    for (let level = group.low; level <= group.high; level += 1) { held[level] = Math.max(0, held[level] - group.cells[level]); group.cells[level] = 0; }
    ended += group.mass;
    state.spare.push(group.cells);
  }
  if (!groups.length) { held.fill(0); state.held = 0; state.base = 0; }
  else if (ended > 0) totals(state);
  return ended;
}

/**
 * The store on a regular schedule, on whole 1/30 s ticks as the engine runs it: each stream attempts at first + (k − 1) ÷ rate (default first
 * 1 ÷ rate), on the first tick at or after; a tick settles what is held before its attempts, and a stack lasts ceil(30 × duration) ticks. The
 * steady path's figures (src/ailment-model.js, src/theoretical-sources.js): its conditional buffs stay averages, so a stream has one kind here.
 * @param {ReturnType<typeof heldStoreLevels>} levels
 * @param {object} options
 * @param {{ kind: number, rate: number, chance: number, notActiveChance?: number, firstSeconds?: number }[]} options.streams chances as fractions
 * @param {number} options.durationSeconds
 * @param {number[]} [options.windows] window lengths from engagement, in seconds
 * @param {number} [options.fps]
 * @returns {{ steadyBase: number, steadyHeld: number, windows: Record<number, number>, steadyFromSeconds: number, seconds: number }} expected held
 *   amount (lapses included) and held probability, over the steady span and over each window from a clean dummy
 */
export function heldStoreRun(levels, { streams, durationSeconds, windows = [5, 20], fps = 30 }) {
  const live = streams.filter((stream) => stream.rate > 0 && ((stream.chance ?? 0) > 0 || (stream.notActiveChance ?? stream.chance ?? 0) > 0));
  const empty = { steadyBase: 0, steadyHeld: 0, windows: Object.fromEntries(windows.map((seconds) => [seconds, 0])), steadyFromSeconds: 0, seconds: 0 };
  if (!live.length || !(durationSeconds > 0)) return empty;
  const slowest = Math.max(...live.map((stream) => 1 / stream.rate));
  const steadyFromSeconds = Math.max(20, 4 * durationSeconds + slowest), seconds = steadyFromSeconds + Math.max(30, 6 * durationSeconds, 4 * slowest);
  const frames = Math.round(seconds * fps), steadyFrom = Math.round(steadyFromSeconds * fps);
  const atOrAfter = (time) => { let frame = Math.ceil(time * fps - 1e-9); while (frame / fps < time - 1e-12) frame += 1; return Math.max(1, frame); };
  const life = Math.max(1, atOrAfter(durationSeconds));
  const state = newHeldState(levels);
  const next = live.map((stream) => ({ stream, count: 0, frame: atOrAfter(stream.firstSeconds ?? 1 / stream.rate) }));
  const sums = new Float64Array(frames + 1), heldSums = new Float64Array(frames + 1);
  for (let frame = 1; frame <= frames; frame += 1) {
    sums[frame] = sums[frame - 1] + state.base;
    heldSums[frame] = heldSums[frame - 1] + state.held;
    heldExpire(state, frame);
    for (const item of next) {
      while (item.frame === frame) {
        const { stream } = item;
        heldAttempt(state, stream.kind, stream.chance ?? 0, stream.notActiveChance ?? stream.chance ?? 0, heldGroup(state, frame, frame + life), frame);
        item.count += 1;
        item.frame = atOrAfter((stream.firstSeconds ?? 1 / stream.rate) + item.count / stream.rate);
      }
    }
  }
  const span = frames - steadyFrom;
  return {
    steadyBase: (sums[frames] - sums[steadyFrom]) / span,
    steadyHeld: (heldSums[frames] - heldSums[steadyFrom]) / span,
    windows: Object.fromEntries(windows.map((window) => { const end = Math.min(frames, Math.round(window * fps)); return [window, end > 0 ? sums[end] / end : 0]; })),
    steadyFromSeconds, seconds
  };
}
