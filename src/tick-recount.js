// The seam between the planner and the tick engine (chunk 15 of research/master-validation-checklist-2026-10-31.md, 2026-11-01;
// research/timing-chunk15-2026-11-01.md). The only planner module that imports the engine. `driveWithTickEngine` runs once, on the
// final planner result of calculatePlanner (never inside the exclusive-condition comparison passes, which keep the steady windows): it
// compiles the result (src/tick-ledger.js), runs the 30 Hz loop (src/tick-engine.js) for the recount's 60 s, and puts the engine's
// timeline where the planner's recount timeline was:
// - planner.dummyRecount: the timeline, the 5 s and 20 s window totals, the 20 s recount fields, the options and assumptions. `steady`
//   stays the planner's stationary figure (the sustained path is not the engine's).
// - planner.damagePaths.fiveSeconds / twentySeconds: each source's window DPS from the engine's series (a source the engine does not
//   run keeps its steady-window figure, listed in dummyRecount.engine.averaged); the totals are the engine's.
// - planner.recountFiveSeconds / recountOpening (Ignite-only builds): the beam, Ignite and Reap window DPS from the same series.
// Nothing here is a user-facing choice: TICK_ENGINE_DRIVES is the one internal seam, and a compile or run failure leaves the planner's own
// figures with a warning.
import { compileTickLedger } from "./tick-ledger.js";
import { blessingSeconds } from "./tick-layers.js";
import { compileTriggerBus } from "./trigger-bus.js";
import { runTickEngine } from "./tick-engine.js";
import { calculateDummyRecount, summarizeRecount, windowTotals } from "./dummy-recount.js";
import { engineBuffUptime } from "./skill-uptime.js";

/**
 * The one internal seam: the engine drives the windows and the recount of every build (on since chunk 15 session 2, 2026-11-01; the moved
 * figures and their causes are in research/timing-chunk15-2026-11-01.md §2). No user-facing control: this constant is the whole seam; a test
 * that needs the planner's own continuous recount reads `steadyRecount`.
 */
export const TICK_ENGINE_DRIVES = true;

/** The planner's own continuous recount from the same inputs (the pre-engine timeline, the end check's base), never shown in the UI. */
export const steadyRecount = (planner, { seconds = TICK_RECOUNT_SECONDS } = {}) => calculateDummyRecount(planner.dummyRecount.inputs, { seconds });
/**
 * The trigger bus for a planner result (W10, src/trigger-bus.js): null on the layers with nothing to own (TLI_TRIGGER_BUS "layers"; the default is "bus" since 2026-11-15), else the
 * compiled listeners, with the Blessing durations the layers use (src/tick-layers.js blessingSeconds). `mode` overrides the flag (a test).
 */
export const tickTriggerBus = (planner, { mode = undefined } = {}) => compileTriggerBus(planner, { mode, blessingSeconds: (name) => blessingSeconds(planner, name) });
/** The recount timeline's length, the planner's 60 s (src/stats-sidebar.js reads the first 60 s). */
export const TICK_RECOUNT_SECONDS = 60;

const sum = (window, keys) => keys.reduce((total, key) => total + (window.bySource[key]?.dps || 0), 0);
const reapKeys = (window) => Object.keys(window.bySource).filter((key) => key.startsWith("reap:"));

// The damage-path window with each source's DPS read from the engine's window totals, the sub-detail (a Reap's share per DoT, the
// full-Affliction basis) kept from the steady window where the engine has no series by that name.
function overlayPathWindow(window, totals) {
  if (!window) return window;
  const read = (key, fallback) => totals.bySource[key] ? totals.bySource[key].dps : fallback;
  const hits = (window.hits || []).map((hit) => ({ ...hit, dps: read(hit.key, hit.dps) }));
  const dots = (window.dots || []).map((dot) => ({ ...dot, dps: read(dot.key, dot.dps) }));
  const reaping = window.reaping ? { ...window.reaping, sources: (window.reaping.sources || []).map((source, index) => totals.bySource[`reap:${index}`] ? { ...source, reapingDps: totals.bySource[`reap:${index}`].dps } : source), reapingDps: reapKeys(totals).length ? sum(totals, reapKeys(totals)) : window.reaping.reapingDps } : window.reaping;
  // Ill Omen and Turbulence are built from the DoT and Reap series, so their basis is the overlaid sum (the series keeps the factor exact).
  const basisDps = dots.reduce((sum, dot) => sum + dot.dps, 0) + (reaping?.reapingDps || 0);
  const illOmen = window.illOmen ? { ...window.illOmen, basisDps, dps: read("illOmen", window.illOmen.dps) } : window.illOmen;
  const turbulence = window.turbulence ? { ...window.turbulence, basisDps, dps: read("turbulence", window.turbulence.dps) } : window.turbulence;
  const beamDps = read("beam", window.beamDps || 0);
  return { ...window, beamDps, hits, dots, reaping, illOmen, turbulence, totalDps: totals.dps, totalDamage: totals.totalDamage, engine: true };
}

// The Ignite-only opening (src/scorching-beam-delivery.js estimateFiveSecondOpening) with the engine's window figures.
function overlayOpening(opening, totals) {
  if (!opening) return opening;
  const reaps = reapKeys(totals);
  const reapingBySource = (opening.reapingBySource || []).map((item, index) => totals.bySource[`reap:${index}`] ? { ...item, dps: totals.bySource[`reap:${index}`].dps } : item);
  const beamDps = totals.bySource.beam ? totals.bySource.beam.dps : opening.beamDps, igniteDps = totals.bySource.ignite ? totals.bySource.ignite.dps : opening.igniteDps;
  const reapingDps = reaps.length ? sum(totals, reaps) : opening.reapingDps;
  return { ...opening, beamDps, igniteDps, reapingDps, reapingBySource, totalDpsApproximation: beamDps + igniteDps + reapingDps, engine: true };
}

/**
 * The planner result with the engine's recount in place of the planner's (read-only on its input: every replaced field is a copy).
 * @param {object} planner calculatePlanner's final pass, with dummyRecount from calculateDummyRecount
 * @param {object} [options] seconds (default TICK_RECOUNT_SECONDS)
 * @returns {object} the planner with dummyRecount, damagePaths, recountFiveSeconds, recountOpening and igniteIllOmen replaced; or the
 *   planner itself when it has no recount
 */
export function driveWithTickEngine(planner, { seconds = TICK_RECOUNT_SECONDS, force = false } = {}) {
  const recount = planner?.dummyRecount;
  if ((!TICK_ENGINE_DRIVES && !force) || !recount?.timeline || !recount.inputs) return planner;
  const spec = compileTickLedger(planner, { seconds, bus: tickTriggerBus(planner) });
  const run = runTickEngine(spec, { seconds });
  const old = recount.timeline;
  // The metadata the recount card's click-to-exclude reads (src/dummy-recount.js excludeRecountSources): Ill Omen's and Turbulence's builders.
  // Tick n sits in bin n − 1 (the engine's convention: an event at exactly 5 s counts in the first 5 s), while the recount's firstDamageSeconds is
  // the start of the first bin with damage, which `recountStart: "firstDamage"` floors to a bin: so the timeline carries the bin's start, one frame
  // before the first hit's tick end (src/tick-engine.js firstHitTimeline); the tick's end stays in engine.firstHitSeconds.
  const firstDamageSeconds = Number.isFinite(run.firstDamageSeconds) ? run.firstDamageSeconds - run.stepSeconds : run.firstDamageSeconds;
  const timeline = { ...run, firstDamageSeconds, labels: { ...(old.labels || {}), ...run.labels }, ...(old.illOmen ? { illOmen: old.illOmen } : {}), ...(old.turbulence ? { turbulence: old.turbulence } : {}) };
  const fiveSeconds = windowTotals(timeline, 5), twentySeconds = windowTotals(timeline, 20);
  const engine = {
    program: spec.program, seconds: run.seconds, frames: run.frames, firstHitSeconds: run.firstDamageSeconds,
    liveLayers: (spec.liveLayers || []).map(({ key, label, events }) => ({ key, label, events })),
    heldLayers: (spec.heldLayers || []).map(({ key, label, reason }) => ({ key, label, reason })),
    averaged: (spec.averaged || []).map(({ key, label, dps, reason }) => ({ key, label, dps, reason })),
    agilityBlessingUptime: run.buffs?.agility?.uptime ?? null, // read by the Blessing Duration badges (src/line-coverage.js)
    agilityBlessingLapses: run.buffs?.agility?.expiries ?? null, // how often Agility ran out (one built from 0 that never runs out has an uptime below 1)
    agilityBlessingPeak: run.buffs?.agility?.peakStacks ?? null, // the most Agility stacks held: below the planner's, longer stacks would add
    // The trigger bus (W10, src/trigger-bus.js): its listeners, events and average holds, when TLI_TRIGGER_BUS gives it a trigger.
    ...(run.bus ? { bus: run.bus } : {}),
    assumptions: run.assumptions
  };
  // The recount's own options stay readable (afflictionModel, recountStart); the Reaps now run on whole ticks, the engine's rule.
  const options = { ...(recount.options || {}), ...run.options, reapTiming: "tick" };
  const dummyRecount = {
    ...recount, timeline: { ...timeline, options }, fiveSeconds, twentySeconds, recount20: summarizeRecount(timeline, { span: 20 }), options,
    assumptions: [
      ...(recount.assumptions || []).map((item) => item?.id === "reapTiming" ? { id: "reapTiming", value: "tick", text: "Reap recovery: each Reap's timer is its base time ÷ Reaping Recovery Speed and fires on the first 1/30 s tick at or after it (the tick engine; chunk 0 D1)." } : item),
      ...run.assumptions.filter((item) => !/^tick:averaged:/.test(item.id))
    ],
    engine
  };
  const damagePaths = planner.damagePaths ? { ...planner.damagePaths, fiveSeconds: overlayPathWindow(planner.damagePaths.fiveSeconds, fiveSeconds), twentySeconds: overlayPathWindow(planner.damagePaths.twentySeconds, twentySeconds), engine: true } : planner.damagePaths;
  const recountFiveSeconds = overlayOpening(planner.recountFiveSeconds, fiveSeconds), recountOpening = overlayOpening(planner.recountOpening, twentySeconds);
  const igniteIllOmen = planner.igniteIllOmen ? {
    ...planner.igniteIllOmen,
    // Ill Omen is factor × (Ignite + the Ignite Reaps) on the engine's series too, so the window's basis is the overlaid opening's sum.
    fiveSeconds: planner.igniteIllOmen.fiveSeconds && fiveSeconds.bySource.illOmen ? { ...planner.igniteIllOmen.fiveSeconds, igniteDps: recountFiveSeconds?.igniteDps ?? planner.igniteIllOmen.fiveSeconds.igniteDps, reapingDps: recountFiveSeconds?.reapingDps ?? planner.igniteIllOmen.fiveSeconds.reapingDps, basisDps: (recountFiveSeconds?.igniteDps ?? 0) + (recountFiveSeconds?.reapingDps ?? 0), dps: fiveSeconds.bySource.illOmen.dps } : planner.igniteIllOmen.fiveSeconds,
    twentySeconds: planner.igniteIllOmen.twentySeconds && twentySeconds.bySource.illOmen ? { ...planner.igniteIllOmen.twentySeconds, igniteDps: recountOpening?.igniteDps ?? planner.igniteIllOmen.twentySeconds.igniteDps, reapingDps: recountOpening?.reapingDps ?? planner.igniteIllOmen.twentySeconds.reapingDps, basisDps: (recountOpening?.igniteDps ?? 0) + (recountOpening?.reapingDps ?? 0), dps: twentySeconds.bySource.illOmen.dps } : planner.igniteIllOmen.twentySeconds
  } : planner.igniteIllOmen;
  // The planner's own steady-path windows, kept for the tests that pin a model unit of that path (a timed layer's exact factor, the cold-start
  // ramp, a Reap's share per DoT); no figure or view reads them.
  const steadyWindows = { damagePaths: planner.damagePaths ? { fiveSeconds: planner.damagePaths.fiveSeconds, twentySeconds: planner.damagePaths.twentySeconds } : null, recountFiveSeconds: planner.recountFiveSeconds ?? null, recountOpening: planner.recountOpening ?? null, igniteIllOmen: planner.igniteIllOmen ?? null, dummyRecount: { fiveSeconds: recount.fiveSeconds, twentySeconds: recount.twentySeconds, recount20: recount.recount20 } };
  // Each buff the loop ran over the 5 s / 20 s windows and the 60 s timeline, for the skill tooltips (display only, src/skill-uptime.js; 2026-11-15).
  let buffUptime = {};
  try { buffUptime = engineBuffUptime(planner, run); } catch { buffUptime = {}; }
  return { ...planner, dummyRecount, damagePaths, recountFiveSeconds, recountOpening, igniteIllOmen, steadyWindows, buffUptime };
}
