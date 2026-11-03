// Parity budget for the tick engine (sessions 3 to 6 of research/tick-engine-investigation-2026-10-30.md §7.5; findings:
// research/tick-engine-prototype-2026-10-31.md). Takes one damage series of a traced run apart against the planner's hit, or a DoT or Reap series
// against the recount's. Pure, read-only, used by scripts/tick-engine-probe.mjs and the tests; nothing in the planner imports it.
//
// Every hit of a run has a known value: path(amounts it read). At each modifier's steadyAmount the path gives back the planner's per-use
// damage. So a run differs from the planner's hit in two ways only, and the budget is an identity, with no term left over:
//
//   engine damage ÷ (planner damage over the same time) = hit count factor × mean over the hits of value ÷ steady value
//   mean(value ÷ steady) = Π per layer mean(layer's value ÷ steady) × covariance
//
// A layer's factor reads its own modifiers at each hit's amounts, the rest at steady. The covariance is what is left when two layers move
// together. It is measured, not assumed, and it has two parts: the opening, where several debuffs are missing from the same few hits, so
// their losses overlap, and the rest of the run (`settledCovariance`, hits after `settledFrame`), where layers on their own clocks sample
// each other (Numbed's saw-tooth under Periodic Burst's faster volleys).
import { pathValueAt } from "./tick-engine.js";

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/**
 * @param {object} run runTickEngine(spec, { trace: true })
 * @param {object} path the series' path in the spec (with its modifiers, each with steadyAmount and liveKey)
 * @param {object} planner { damage: the planner's damage for this series over the run, perUse: the planner's value of one hit event }
 * @param {object} [options]
 * @param {number} [options.settledFrame] the tick after which the opening is over; default 60 (2 s: the follower's first casts have landed)
 * @returns {{ hits, expectedHits, countFactor, valueFactor, layers: [{ key, factor }], covariance, openingOverlap, settledCovariance, total, steady }}
 */
export function hitBudget(run, path, { damage, perUse }, { settledFrame = 60 } = {}) {
  const events = run.trace.filter((entry) => entry.event === "damage" && entry.kind === "hit" && entry.path === path.key);
  const modifiers = path.modifiers || [], steadyAmounts = modifiers.map((modifier) => modifier.steadyAmount ?? 0);
  const steady = pathValueAt(path, steadyAmounts);
  const keys = [...new Set(modifiers.map((modifier) => modifier.liveKey ?? "other"))];
  const layerValue = (key, amounts) => pathValueAt(path, modifiers.map((modifier, index) => (modifier.liveKey ?? "other") === key ? amounts[index] : steadyAmounts[index]));
  const layers = keys.map((key) => ({ key, factor: mean(events.map((event) => layerValue(key, event.amounts) / steady)) }));
  const valueFactor = mean(events.map((event) => event.amount / steady));
  const product = layers.reduce((total, layer) => total * layer.factor, 1);
  const expectedHits = damage / perUse;
  const countFactor = events.length / expectedHits;
  const covariance = valueFactor / product;
  const settled = events.filter((event) => event.frame > settledFrame);
  const settledCovariance = mean(settled.map((event) => event.amount / steady)) / keys.reduce((total, key) => total * mean(settled.map((event) => layerValue(key, event.amounts) / steady)), 1);
  return { hits: events.length, expectedHits, countFactor, valueFactor, layers, covariance, openingOverlap: covariance / settledCovariance, settledCovariance, total: countFactor * valueFactor, steady };
}

const seriesSum = (series, from = 0) => { let sum = 0; if (series) for (let bin = from; bin < series.length; bin += 1) sum += series[bin]; return sum; };

// The recount with its time layers switched off one at a time. It is a pure function of its inputs, so each layer is measured, not assumed.
function recountRuns(inputs, simulate, seconds) {
  const neutral = (ailment) => ({ ...ailment, maxAffliction: null, affliction: { configuredRating: 0, perPoint: 0 } });
  const quiet = { ...inputs, reaping: [], timedDotLayers: [], timedEffects: undefined, channel: null, illOmen: undefined, turbulence: undefined, ailments: inputs.ailments.map(neutral) };
  const run = (changes) => simulate({ ...quiet, ...changes }, { seconds });
  return { full: simulate(inputs, { seconds }), quiet, run, held: run({}) };
}

/**
 * One DoT series against the recount's, an identity with no term left over:
 *
 *   engine damage ÷ recount damage = coverage × retained × Π per layer (engine ÷ recount) × covariance
 *
 * - coverage: the time the DoT is on the dummy (mean stacks, for independent stacks), in expectation on both sides: the engine's survival state
 *   lapses as the recount's chain does, so this term holds only ticks;
 * - retained: the mean base held while it is, on the same terms;
 * - a layer (Affliction, the max-Affliction term, timed effects): its base-weighted mean ÷ steady, on each side. The recount's is measured by
 *   running it with that layer alone (`simulate`, src/dummy-recount.js simulateDummyTimeline, handed in so this module stays import-free);
 * - covariance: what is left when two layers move together, on each side.
 * @param {object} run runTickEngine(spec, { trace: true })
 * @param {object} path the DoT's path in the spec
 * @param {string} key the DoT's series key
 * @param {{ inputs, simulate, seconds, ailment }} recount `inputs` is planner.dummyRecount.inputs
 * @returns {{ key, engineDamage, recountDamage, ratio, coverage, retained, layers: [{ key, engine, recount, factor }], covariance, total, engineHeld, recountHeld, engineBase, recountBase }}
 */
export function dotBudget(run, path, key, { inputs, simulate, seconds }) {
  const ailment = inputs.ailments.find((item) => item.key === key);
  const events = run.trace.filter((entry) => entry.event === "damage" && entry.kind === "dot" && entry.dot === key);
  const modifiers = path.modifiers || [], steadyAmounts = modifiers.map((modifier) => modifier.steadyAmount ?? 0);
  const steady = pathValueAt(path, steadyAmounts), keys = [...new Set(modifiers.map((modifier) => modifier.liveKey ?? "other"))];
  const layerValue = (name, amounts) => pathValueAt(path, modifiers.map((modifier, index) => (modifier.liveKey ?? "other") === name ? amounts[index] : steadyAmounts[index]));
  const totalBase = events.reduce((sum, event) => sum + event.base, 0);
  const engineDamage = events.reduce((sum, event) => sum + event.amount, 0);
  const engineLayers = Object.fromEntries(keys.map((name) => [name, events.reduce((sum, event) => sum + event.base * layerValue(name, event.amounts), 0) / (steady * totalBase)]));
  const engineHeld = events.reduce((sum, event) => sum + event.held, 0) / 30 / seconds;
  const engineBase = totalBase / 30 / seconds;

  const { full, quiet, run: recountRun, held } = recountRuns(inputs, simulate, seconds);
  const recountDamage = seriesSum(full.bySource[key]), heldDamage = seriesSum(held.bySource[key]);
  const steadyRatio = steady / ailment.damagePerBase;
  const only = (changes) => seriesSum(recountRun(changes).bySource[key]);
  const withAilment = (change) => quiet.ailments.map((item, index) => item.key === key ? change(inputs.ailments[index], item) : item);
  const recountLayers = {
    affliction: () => only({ reaping: inputs.reaping, ailments: withAilment((source, item) => ({ ...item, affliction: source.affliction })) }) / heldDamage,
    maxAffliction: () => only({ reaping: inputs.reaping, ailments: withAilment((source, item) => ({ ...item, maxAffliction: source.maxAffliction })) }) / (heldDamage * steadyRatio),
    timed: () => only({ timedDotLayers: inputs.timedDotLayers, timedEffects: inputs.timedEffects, channel: inputs.channel }) / heldDamage
  };
  const layers = keys.map((name) => { const engine = engineLayers[name], recount = recountLayers[name]?.() ?? 1; return { key: name, engine, recount, factor: engine / recount }; });
  // The held base over the run: the recount with every base 1 is the DoT's time on the dummy (a shared timer) or its mean stacks.
  const unit = (item) => item.key !== key ? item : item.stacking === "independent" ? { ...item, damagePerBase: 1, averageApplication: 1 } : { ...item, damagePerBase: 1, retainedBase: item.retainedBase.map((_, n) => n ? 1 : 0), retainedLimit: 1 };
  const recountHeld = seriesSum(recountRun({ ailments: quiet.ailments.map(unit) }).bySource[key]) / seconds;
  const recountBase = heldDamage / ailment.damagePerBase / seconds;
  const coverage = engineHeld / recountHeld, retained = (engineBase / engineHeld) / (recountBase / recountHeld);
  const engineLeft = engineDamage / (engineBase * seconds * steady) / keys.reduce((product, name) => product * engineLayers[name], 1);
  const recountLeft = recountDamage / (heldDamage * steadyRatio) / layers.reduce((product, layer) => product * layer.recount, 1);
  const covariance = engineLeft / recountLeft;
  return { key, engineDamage, recountDamage, ratio: engineDamage / recountDamage, coverage, retained, layers, covariance, total: coverage * retained * layers.reduce((product, layer) => product * layer.factor, 1) * covariance, engineHeld, recountHeld, engineBase: engineBase / engineHeld, recountBase: recountBase / recountHeld };
}

/**
 * The recount as the end check reads it: Reap triggers wait for the next 1/30 s tick (reapTiming "tick"). A copy; the planner's inputs stay.
 * @param {object} inputs planner.dummyRecount.inputs
 */
export const recountOnTicks = (inputs) => ({ ...inputs, options: { ...inputs.options, reapTiming: "tick" } });

/**
 * One Reap series against the recount's, an identity with no term left over. Per DoT d it settles:
 *
 *   engine ÷ recount = fires × base held at a fire × Π per layer (engine ÷ recount) × covariance
 *
 * and the series is the DoTs' sum, so its ratio is their ratios weighted by the recount's damage.
 * - fires: expected fires that dealt damage, on each side. The recount's are its bins with damage (one a bin at tick timing), or, for a Reap on a
 *   success of a chain below 100%, the fired mass, measured with every base at 1;
 * - base: the expected base the DoT holds at a fire: the recount run with no time layer, each base as it is, seconds 1, no settle scale;
 * - a layer (Affliction, the max-Affliction term, timed effects): its base-weighted mean ÷ steady over the fires, on each side, the recount's measured
 *   by running it with that layer alone;
 * - covariance: what is left when two layers move together, on each side. It also holds a seconds or scale difference, which the compile should not
 *   make, so a covariance away from 1 on a Reap with one layer is a bug.
 * @param {object} run runTickEngine(spec, { trace: true })
 * @param {object} spec the compiled spec
 * @param {string} key the Reap's series key
 * @param {{ inputs, simulate, seconds, fromSeconds }} recount `inputs` is the recount's own (recountOnTicks for the end check); `fromSeconds` limits the
 *   budget to the end of the run (the last 5 s: 49)
 * @returns {{ key, engineDamage, recountDamage, ratio, fires: { engine, recount, factor }, dots: [{ key, engineDamage, recountDamage, ratio, base: { engine, recount, factor }, layers: [{ key, engine, recount, factor }], covariance, total }], total }}
 */
export function reapBudget(run, spec, key, { inputs, simulate, seconds, fromSeconds = 0 }) {
  const source = inputs.reaping.find((item) => item.key === key), reap = spec.reaps.find((item) => item.key === key), fromBin = Math.round(fromSeconds * 30);
  const events = run.trace.filter((entry) => entry.event === "damage" && entry.kind === "reap" && entry.source === key && entry.amount > 0 && entry.frame > fromBin);
  const { full, quiet, run: recountRun } = recountRuns(inputs, simulate, seconds);
  const series = (result) => seriesSum(result.bySource[key], fromBin);
  const recountSeries = full.bySource[key].slice(fromBin), recountDamage = seriesSum(recountSeries), engineDamage = events.reduce((sum, event) => sum + event.amount, 0);
  const engineFires = events.reduce((sum, event) => sum + event.mass, 0);
  const others = inputs.reaping.filter((item) => item.key !== key).map((item) => ({ ...item, seconds: {} }));
  const neutralSettle = (dot) => Object.fromEntries(Object.keys(source.seconds).map((name) => [name, { affliction: 1, resistance: 1, trueDamage: 1 }]));
  // One DoT of this source, with the rest of the build as it is: the other Reaps still fire, so Affliction's removal holds, and deal nothing here.
  const reapOf = (dot, settle) => ({ ...source, seconds: Object.fromEntries(Object.keys(source.seconds).map((name) => [name, name === dot ? source.seconds[dot] : 0])), settle });
  const trigger = reap.trigger === "success" ? inputs.ailments.find((item) => item.key === reap.ailment) : null;
  let recountFires = recountSeries.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0);
  if (trigger && trigger.stacking !== "independent" && (trigger.chance < 1 || trigger.notActiveChance < 1)) {
    const unit = quiet.ailments.map((item) => item.key === trigger.key ? { ...item, damagePerBase: 1, retainedBase: item.retainedBase.map((_, n) => n ? 1 : 0), retainedLimit: 1 } : { ...item, damagePerBase: 0 });
    recountFires = series(recountRun({ ailments: unit, reaping: [...others, { ...source, seconds: { [trigger.key]: 1 }, settle: neutralSettle() }] }));
  }
  const dots = Object.keys(reap.dots).map((dot) => {
    const path = spec.paths[dot], modifiers = path.modifiers || [], steadyAmounts = modifiers.map((modifier) => modifier.steadyAmount ?? 0);
    const steady = pathValueAt(path, steadyAmounts), names = [...new Set(modifiers.map((modifier) => modifier.liveKey ?? "other"))];
    const parts = events.flatMap((event) => event.parts.filter((part) => part.dot === dot));
    const layerValue = (name, amounts) => pathValueAt(path, modifiers.map((modifier, index) => (modifier.liveKey ?? "other") === name ? amounts[index] : steadyAmounts[index]));
    const totalBase = parts.reduce((sum, part) => sum + part.base, 0), dotDamage = parts.reduce((sum, part) => sum + part.value, 0);
    const engineLayers = Object.fromEntries(names.map((name) => [name, parts.reduce((sum, part) => sum + part.base * layerValue(name, part.amounts), 0) / (steady * totalBase)]));
    const unitSeconds = (settle) => ({ ...source, seconds: { [dot]: 1 }, settle: { [dot]: settle } });
    const ailment = inputs.ailments.find((item) => item.key === dot), withAilment = (change) => quiet.ailments.map((item, index) => item.key === dot ? change(inputs.ailments[index], item) : item);
    const baseDamage = series(recountRun({ ailments: quiet.ailments.map((item) => item.key === dot ? { ...item, damagePerBase: 1 } : item), reaping: [...others, unitSeconds({ affliction: 1, resistance: 1, trueDamage: 1 })] }));
    const dotRecount = series(recountRun({ reaping: [...others, reapOf(dot, source.settle)], ailments: inputs.ailments, timedDotLayers: inputs.timedDotLayers, timedEffects: inputs.timedEffects, channel: inputs.channel }));
    const settle = source.settle?.[dot] || {}, isFull = source.trigger === "full Affliction";
    const plain = { affliction: 1, resistance: 1, trueDamage: 1 };
    const held = series(recountRun({ reaping: [...others, reapOf(dot, { [dot]: plain })] }));
    const steadyRatio = steady / ailment.damagePerBase;
    const only = (changes, settleChange = {}) => series(recountRun({ reaping: [...others, reapOf(dot, { [dot]: { ...plain, ...settleChange } })], ...changes }));
    const recountLayers = {
      affliction: () => (isFull ? only({}, { affliction: settle.affliction ?? 1 }) : only({ ailments: withAilment((item, base) => ({ ...base, affliction: item.affliction })) })) / held,
      maxAffliction: () => (isFull ? only({}, { resistance: settle.resistance ?? null }) : only({ ailments: withAilment((item, base) => ({ ...base, maxAffliction: item.maxAffliction })) })) / (held * steadyRatio),
      timed: () => only({ timedDotLayers: inputs.timedDotLayers, timedEffects: inputs.timedEffects, channel: inputs.channel }) / held
    };
    const layers = names.map((name) => { const engine = engineLayers[name], recount = recountLayers[name]?.() ?? 1; return { key: name, engine, recount, factor: engine / recount }; });
    const engineBase = totalBase / engineFires, recountBase = baseDamage / recountFires;
    const ratio = dotDamage / dotRecount, firesFactor = engineFires / recountFires, baseFactor = engineBase / recountBase;
    const layerProduct = layers.reduce((product, layer) => product * layer.factor, 1), covariance = ratio / (firesFactor * baseFactor * layerProduct);
    return { key: dot, engineDamage: dotDamage, recountDamage: dotRecount, ratio, base: { engine: engineBase, recount: recountBase, factor: baseFactor }, layers, covariance, total: firesFactor * baseFactor * layerProduct * covariance };
  });
  const total = dots.reduce((sum, dot) => sum + dot.engineDamage, 0) / dots.reduce((sum, dot) => sum + dot.recountDamage, 0);
  return { key, label: reap.label, trigger: reap.trigger ?? "dot", engineDamage, recountDamage, ratio: engineDamage / recountDamage, fires: { engine: engineFires, recount: recountFires, factor: engineFires / recountFires }, dots, total };
}

/**
 * The beam's series against the recount's: engine ÷ recount = uses × Scorch (and timed) layer, with nothing left over. Uses compares the two runs
 * at Scorch's full scale, the layer what each reads of it.
 * @param {object} run runTickEngine(spec, { trace: true })
 * @param {object} spec the compiled spec
 * @param {{ inputs, simulate, seconds }} recount
 * @returns {{ engineDamage, recountDamage, ratio, uses, layer, engineLayer, recountLayer, total }}
 */
export function beamBudget(run, spec, { inputs, simulate, seconds }) {
  const events = run.trace.filter((entry) => entry.event === "damage" && entry.kind === "hit" && (spec.paths[entry.path]?.source ?? entry.path) === "beam");
  const steadyOf = (path) => pathValueAt(path, (path.modifiers || []).map((modifier) => modifier.steadyAmount ?? 0));
  const engineDamage = events.reduce((sum, event) => sum + event.amount, 0);
  const engineFull = events.reduce((sum, event) => sum + steadyOf(spec.paths[event.path]), 0);
  const { full, run: recountRun } = recountRuns(inputs, simulate, seconds);
  const resistance = inputs.hits.resistance?.kind === "scorch" ? { kind: "fixed", scale: inputs.hits.resistance.activeScale } : inputs.hits.resistance;
  const recountFull = seriesSum(recountRun({ hits: { ...inputs.hits, resistance } }).bySource.beam), recountDamage = seriesSum(full.bySource.beam);
  const engineLayer = engineDamage / engineFull, recountLayer = recountDamage / recountFull, uses = engineFull / recountFull;
  return { engineDamage, recountDamage, ratio: engineDamage / recountDamage, uses, engineLayer, recountLayer, layer: engineLayer / recountLayer, total: uses * engineLayer / recountLayer };
}

/**
 * One Minion source against the recount's, an identity with no term left over:
 *
 *   engine ÷ recount = uses × value × Π per layer (engine ÷ recount) × covariance
 *
 * - uses: the skill uses that landed in the run, each hit at its use share (a blended slot's two parts are one use);
 * - value: the mean planner value of a use, with no ramp and no timed effect, on each side. The k-th use reads the planner's k-th value, so this moves
 *   only when the engine lands another mix of uses;
 * - a layer (`count`, the Minions out; `timed`, the timed effects): its value-weighted mean on each side. The recount's ramp is each event's own share,
 *   its timed factor measured by running it with the effects off. On the "events" reading the ramp is in the value and the layer holds 1;
 * - covariance: what is left when two layers move together.
 * @param {object} run runTickEngine(spec, { trace: true })
 * @param {object} spec the compiled spec
 * @param {string} key the Minion's series key
 * @param {{ inputs, simulate, seconds, minion }} recount `inputs` is planner.dummyRecount.inputs, `minion` the planner's Minion
 * @returns {{ key, label, mode, engineDamage, recountDamage, ratio, uses: { engine, recount, factor }, value: { engine, recount, factor }, layers: [{ key, engine, recount, factor }], covariance, total, skills: [{ name, engineUses, recountUses }] }}
 */
export function minionBudget(run, spec, key, { inputs, simulate, seconds, minion }) {
  const entry = spec.minions.find((item) => item.key === key);
  const hits = run.trace.filter((event) => event.event === "damage" && event.kind === "hit" && spec.paths[event.path]?.source === key);
  const steadyOf = (path) => pathValueAt(path, (path.modifiers || []).map((modifier) => modifier.steadyAmount ?? 0));
  const names = [...new Set(hits.flatMap((event) => (spec.paths[event.path].modifiers || []).map((modifier) => modifier.liveKey ?? "other")))];
  let engineUses = 0, engineValue = 0, engineDamage = 0;
  const engineLayer = Object.fromEntries(names.map((name) => [name, 0])), skillUses = new Map();
  for (const event of hits) {
    const path = spec.paths[event.path], modifiers = path.modifiers || [], steadyAmounts = modifiers.map((modifier) => modifier.steadyAmount ?? 0), steady = steadyOf(path);
    const value = steady * event.count;
    engineUses += event.weight;
    engineValue += value;
    engineDamage += event.amount;
    const skill = spec.paths[event.path].working.skill;
    skillUses.set(skill, (skillUses.get(skill) || 0) + event.weight);
    for (const name of names) engineLayer[name] += value * pathValueAt(path, modifiers.map((modifier, index) => (modifier.liveKey ?? "other") === name ? event.amounts[index] : steadyAmounts[index])) / steady;
  }
  const inRun = minion.events.filter((event) => event.time < seconds - 1e-9);
  const liveRamp = entry.ramp, recountValueOf = (event) => event.damage * (liveRamp && event.minionsOut > 0 ? minion.count / event.minionsOut : 1);
  const recountUses = inRun.reduce((sum, event) => sum + (event.weight ?? 1), 0), recountValue = inRun.reduce((sum, event) => sum + recountValueOf(event), 0), plainDamage = inRun.reduce((sum, event) => sum + event.damage, 0);
  const { full, held } = recountRuns(inputs, simulate, seconds);
  const recountDamage = seriesSum(full.bySource[key]), heldDamage = seriesSum(held.bySource[key]);
  const recountLayer = { count: () => plainDamage / recountValue, timed: () => recountDamage / heldDamage };
  const layers = names.map((name) => { const engine = engineLayer[name] / engineValue, recount = recountLayer[name]?.() ?? 1; return { key: name, engine, recount, factor: engine / recount }; });
  const ratio = engineDamage / recountDamage, usesFactor = engineUses / recountUses, valueFactor = (engineValue / engineUses) / (recountValue / recountUses);
  const layerProduct = layers.reduce((product, layer) => product * layer.factor, 1), covariance = ratio / (usesFactor * valueFactor * layerProduct);
  const skills = [...new Set([...skillUses.keys(), ...inRun.map((event) => event.skill)])].map((name) => ({ name, engineUses: skillUses.get(name) || 0, recountUses: inRun.filter((event) => event.skill === name).reduce((sum, event) => sum + (event.weight ?? 1), 0) }));
  return { key, label: entry.label, mode: entry.mode, engineDamage, recountDamage, ratio, uses: { engine: engineUses, recount: recountUses, factor: usesFactor }, value: { engine: engineValue / engineUses, recount: recountValue / recountUses, factor: valueFactor }, layers, covariance, total: usesFactor * valueFactor * layerProduct * covariance, skills };
}
