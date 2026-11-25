// Static ledger for the tick engine (src/tick-engine.js; research/tick-engine-investigation-2026-10-30.md §7.2): compiles the planner
// result into the engine's program. Read-only and pure: it never writes to the planner and re-derives no stat. Every value is the
// planner's own; a damage path keeps the ledger lines behind it so an event can show its working.
//
// Session 1 (Youga prototype): one action per Clockwork Core Tangle, firing Forking Thunder at the casting interval, at the planner's
// expected hit (crit, Lucky and Double Damage are in that figure).
// Session 2: on the Youga build the time-varying layers run live on the loop (src/tick-youga-layers.js; option `live`, default all, [] for
// the planner's average on every tick). A layer that is not live is listed in `averagedLayers`; what stays held on purpose in
// `heldLayers`, with why. Timeline sources the loop does not model yet (ailments and Reaps) are carried as `averaged` at their steady DPS.
// Session 3: a plain player-cast skill, Spell or attack, runs on the loop too (src/tick-plain-skills.js). The Youga fixture and the Iris
// Lv16 references are checked (tests/tick-engine-references.test.js); other builds compile but stay unchecked.
// Sessions 4 and 5: ailments, Affliction, Reaps and Scorching Beam run on the loop (src/tick-ailments.js), from planner.dummyRecount.inputs.
// Session 6: Minions run on the loop (src/tick-minions.js), from planner.minions.
// W10 steps 1 and 2a: with TLI_TRIGGER_BUS on "bus" the trigger bus (src/trigger-bus.js, compiled by the seam src/tick-recount.js and handed in as
// option `bus`) owns trigger 1000033's and 1000030's listeners: each hit path of yours carries its event, each DoT record of yours raises one on
// its ticks (the engine asks the bus whose it is), the engine dispatches them, and the layers yield the holds the bus owns (src/tick-layers.js
// triggerBusLayer, placeHitGains, paralysisLayer, frostbiteLayer; the timed corrections on the DoT, beam and Minion paths).
import { TICK_LAYERS, TICK_LAYER_KEYS, compileYougaProgram, yougaCoreHit } from "./tick-youga-layers.js";
import { GENERAL_LAYERS, GENERAL_ORDER, addTarget, createLayerContext, dotStateGates, finishTarget, generalHeldLayers, minionTypeModifiers } from "./tick-layers.js";
import { compilePlainProgram, ownPerUse, plainUseKind, repeatEffects, timerField } from "./tick-plain-skills.js";
import { usesPerPlacement } from "./tick-engine.js";
import { compileAilmentProgram } from "./tick-ailments.js";
import { compileMinionProgram } from "./tick-minions.js";
import { compileTriggerMains } from "./tick-trigger-main.js";

const FOLLOWER_REASON = "the follower's casts are not on the loop in this run; the planner's steady DPS, spread over the ticks";
const OTHER_REASON = "not on the tick loop yet; the planner's steady DPS, spread over the ticks";
const REAP_REASON = "a DoT this Reap settles is not on the tick loop: the planner's steady DPS, spread over the ticks, with no timer or trigger of its own";
const REAP_BUILT_REASON = "built on the DoT and Reap series and not derived on the loop yet: the planner's steady DPS, spread over the ticks";

// Ledger lines that change during a fight (§7.5 session 2). A line stays in its group's list while no live layer has claimed it.
const TIME_VARYING_LAYERS = Object.freeze([
  { key: "aim", label: "Aim", pattern: /^Aim\b/ },
  { key: "selves", label: "Selves of All Realms", pattern: /Selves of All Realms|I Need Not Lift a Finger/ },
  { key: "vault", label: "Stasis Vault and Recall", pattern: /Stasis Vault|Recalled/ },
  { key: "castsRecently", label: "Casts in the last 4 s", pattern: /each time it was cast recently/ },
  { key: "spellAggression", label: "Spell Aggression", pattern: /Spell Aggression/ },
  { key: "hasten", label: "Hasten", pattern: /Hasten/ },
  { key: "periodicBurst", label: "Periodic Burst", pattern: /Periodic Burst/ },
  { key: "tangleStacks", label: "Night Feather Entanglement", pattern: /Night Feather/ },
  { key: "blessings", label: "Blessing stacks", pattern: /\(blessing model\)|stack of Focus Blessing/ },
  { key: "follower", label: "Follower buffs and debuffs", pattern: /Follower:/ },
  { key: "dummyDebuffs", label: "Debuffs built on the dummy", pattern: /^(?:Frostbite|Numbed|Frail|Biting Cold)\b|against Frozen enemies|^Elder Sage Girdle .*additional Hit Damage$/ }
]);

const copyLines = (lines) => (lines || []).map((line) => ({ source: line.source, text: line.text, value: line.value }));

function compileParts(hit, { ownUse = false } = {}) {
  const parts = [], dropped = [];
  hit.components.forEach((component, index) => {
    const perUse = component.perHit * component.hitsPerUse;
    const increased = component.increasedFactor, additional = component.additionalFactor;
    const key = `${component.key}#${index}`;
    if (!(perUse > 0) || !(increased > 0) || !(additional > 0)) {
      dropped.push({ key, label: component.label, type: component.type, reason: "deals 0 in the planner's ledger" });
      return;
    }
    parts.push({
      key, label: component.label, type: component.type, hitsPerUse: component.hitsPerUse,
      roll: { ...component.roll }, increasedFactor: increased, additionalFactor: additional,
      // Expected roll × crit, before the build's layers (Lucky is in the roll, crit in the expectation).
      expectedBeforeLayers: component.perHitBeforeTarget / (increased * additional),
      targetFactor: component.perHitBeforeTarget > 0 ? component.perHit / component.perHitBeforeTarget : 1,
      base: perUse / (increased * additional), increasedPercent: (increased - 1) * 100, perHit: component.perHit, perUse,
      // Psionic Missile: Emission's pulse lands one frame after the cast's last explosion (user decision 2026-11-23; src/support-hit-count-batch5.js):
      // the part's damage that many frames later, at the value read at the hit (the hit's trigger-bus events stay on the cast's frame).
      ...(component.afterLastLanding > 0 ? { delayFrames: component.afterLastLanding } : {})
    });
  });
  // Per-use damage outside the components (Spell Ripple, Sweeping Fury) stays one static part. Deterioration is its own part, dealt when its
  // instance runs out (6 T Corrosive Throw D1, 2026-11-20; research/build-6t-corrosive-throw-deterioration-2026-11-20.md §2, proven but for two
  // inferred links: the duration lines shorten it, and the timer's end removes with reason 0): the first frame at or after the hit + its
  // whole-frame duration (src/combat-states.js heldSeconds), at the value read at the hit. Ruinous Star's ticking variant (no single expiry)
  // stays at the hit.
  const inParts = parts.reduce((sum, part) => sum + part.perUse, 0);
  const perUse = ownUse ? ownPerUse(hit) : hit.combat.perUse;
  let rest = perUse - inParts;
  const deterioration = hit.deterioration;
  if (deterioration?.perUse > 0 && deterioration.heldSeconds > 0 && !deterioration.ticking && Math.abs(rest) > 1e-9 * perUse) {
    const share = Math.min(deterioration.perUse, rest);
    parts.push({ key: "deterioration", label: "Deterioration (at its expiry)", type: null, hitsPerUse: 1, base: share, increasedPercent: 0, additionalFactor: 1, perUse: share, delayFrames: Math.max(1, Math.round(deterioration.heldSeconds * 30)) });
    rest -= share;
  }
  if (Math.abs(rest) > 1e-9 * perUse) parts.push({ key: "extras", label: "Other per-use damage in the planner's figure", type: null, hitsPerUse: 1, base: rest, increasedPercent: 0, additionalFactor: 1, perUse: rest });
  return { parts, dropped };
}

function layerLines(hit) {
  const ledger = hit.ledger || {};
  return [["increased", ledger.increased], ["additional", ledger.additional], ["additional", ledger.combatAdditional], ["taken", ledger.taken]]
    .flatMap(([layer, lines]) => (lines || []).map((line) => ({ layer, source: line.source, text: line.text, value: line.value })));
}

// The use time holds averaged parts of its own: Aim's Cast Speed, Periodic Burst, and the buffs the line effects hold (Hasten and Spell
// Aggression's +X% additional Cast Speed). They sit inside the planner's Cast Speed total, not in the damage ledger.
function rateLines(planner) {
  const percent = (text) => Number((String(text).match(/^([+-]?\d+(?:\.\d+)?)%/) || [])[1]);
  const aim = planner.aim?.active ? [{ source: "Aim", text: `${planner.aim.averageCastSpeedPercent}% Attack and Cast Speed at ${planner.aim.uptimePercent}% uptime`, value: planner.aim.averageCastSpeedPercent }] : [];
  const held = (planner.lineEffects?.lines || []).filter((line) => line.status === "In calc" && line.condition === "combatState")
    .flatMap((line) => (line.bodies || []).filter((body) => /Cast Speed$/.test(body.derivedText || "")).map((body) => ({ source: line.source, text: `${line.text}: ${body.derivedText}`, value: percent(body.derivedText) })));
  const burst = (planner.periodicBurst?.lines || []).map((line) => ({ source: line.source, text: line.text, value: percent(line.text) }));
  return [...aim, ...held, ...burst].map((line) => ({ layer: "rate", ...line }));
}

/** The time-varying layers behind one hit, each with the lines it still holds at the planner's average; the Cast Speed total comes last. */
function averagedLayersOf(planner, hit, program = null) {
  const lines = [...layerLines(hit), ...rateLines(planner)];
  const stillAveraged = (layer, line) => line.layer === "rate" ? !program?.rateGroups.has(layer.key) : !program?.claimedKeys.has(`${line.source}\u0000${line.text}`);
  const layers = TIME_VARYING_LAYERS.map((layer) => {
    const held = lines.filter((line) => layer.pattern.test(`${line.source} ${line.text}`) && stillAveraged(layer, line));
    return { key: layer.key, label: layer.label, path: hit.key, lines: held };
  }).filter((layer) => layer.lines.length);
  return [...layers, { key: "castSpeed", label: program ? "Static Cast Speed in the use time" : "Cast Speed total in the use time", path: hit.key, lines: (hit.rate.castSpeedSources || []).map((line) => ({ layer: "rate", source: line.source, text: line.text, value: line.value })) }];
}

function hitPath(hit, { ownUse = false } = {}) {
  const { parts, dropped } = compileParts(hit, { ownUse });
  const rate = hit.rate;
  return {
    key: hit.key, label: `${hit.name} hits`, kind: "hit",
    parts: parts.map(({ key, type, base, increasedPercent, additionalFactor, delayFrames }) => ({ key, type, base, increasedPercent, additionalFactor, ...(delayFrames ? { delayFrames } : {}) })),
    modifiers: [],
    perUse: hit.combat.perUse,
    working: {
      skill: hit.name, level: hit.level,
      use: { baseUseSeconds: rate.useTimeSeconds, speedFactor: rate.speedFactor, intervalSeconds: rate.intervalSeconds, usesPerSecond: rate.usesPerSecond, firstUseSeconds: rate.firstUseSeconds, source: rate.source },
      // In the planner's expected hit; the engine rolls no dice.
      expected: { critChancePercent: hit.crit?.chancePercent ?? 0, critFactor: hit.crit?.factor ?? 1, doubleDamageChancePercent: hit.doubleDamageChancePercent ?? 0, luckyDamageRolls: hit.luckyDamageRolls ?? 1 },
      parts, dropped,
      lines: { increased: copyLines(hit.ledger?.increased), additional: copyLines(hit.ledger?.additional), combatAdditional: copyLines(hit.ledger?.combatAdditional), taken: copyLines(hit.ledger?.taken), penetration: copyLines(hit.ledger?.penetration) },
      perUse: hit.combat.perUse
    }
  };
}

// One action per stream: a rate component of N per casting interval is N streams, each one use per N ÷ rate seconds. Forking Thunder
// with Clockwork Core: Max Tangle Quantity Tangles, each firing it at the casting interval, all in lockstep from the same first use
// (provisional: the Tangles' phase is not known; the planner's rate and its first use at one casting interval hold).
function hitActions(hit) {
  const rate = hit.rate;
  const components = rate.rateComponents?.length ? rate.rateComponents : [{ key: "use", label: `${hit.name} uses`, usesPerSecond: rate.usesPerSecond, perInterval: 1 }];
  // A plain stream starts at the planner's first use; a Tangle's first use stays one casting interval in.
  const first = !rate.rateComponents?.length && Number.isFinite(rate.firstUseSeconds) && rate.firstUseSeconds >= 0 ? { firstUseSeconds: rate.firstUseSeconds } : {};
  return components.filter((component) => component.usesPerSecond > 0).flatMap((component) => {
    const streams = Math.max(1, Math.round(component.perInterval || 1));
    // Faster than one use per frame: k uses per placed action, k × the interval apart (src/tick-engine.js usesPerPlacement).
    const every = streams / component.usesPerSecond, batch = usesPerPlacement(every), useSeconds = every * batch;
    const firstUse = batch > 1 && first.firstUseSeconds !== undefined ? { firstUseSeconds: first.firstUseSeconds + (batch - 1) * every } : first;
    return Array.from({ length: streams }, (_, index) => {
      const label = streams > 1 ? `${component.label} ${index + 1} of ${streams}` : component.label;
      return { key: `${hit.key}:${component.key}:${index + 1}`, label, useSeconds, ...firstUse, effects: repeatEffects([{ kind: "hit", path: hit.key }], batch) };
    });
  });
}

function averagedSources(planner, paths, onLoop) {
  const steady = planner.dummyRecount?.steady?.bySource || {};
  const labels = planner.dummyRecount?.timeline?.labels || {};
  const followers = new Map((planner.follower?.damageSources || []).map((source) => [source.key, source]));
  return Object.entries(steady).filter(([key]) => !paths[key] && !onLoop.has(key)).map(([key, dps]) => {
    const follower = followers.get(key);
    const reason = follower ? FOLLOWER_REASON : key.startsWith("reap:") ? REAP_REASON : key === "illOmen" || key === "turbulence" ? REAP_BUILT_REASON : OTHER_REASON;
    return { key, label: labels[key] || key, dps, fromSeconds: follower?.firstUseSeconds ?? 0, reason };
  });
}

/**
 * The engine program for a planner result.
 * @param {object} planner calculatePlanner(...)'s result (read only)
 * @param {object} [options]
 * @param {number} [options.seconds] the run length
 * @param {string[]} [options.live] the layers to run live (TICK_LAYER_KEYS, the default); [] holds every layer at the planner's average
 * @param {object} [options.readings] the open readings the probe compares: tangleTimer, tanglePhase, tangleStart, numbedStacks, followerOrder,
 *   on plain skills castOvershoot, areaTicks, demolisherOpening, with Affliction afflictionRemoval, afflictionAccrual, reapSettle ("lastDot",
 *   the default, or "atHundred", the planner's steady reading), reapBlessing ("held": a Blessing gained only from the dummy held from engagement,
 *   the recount's own reading), heldStrength ("dropped", the default: a limit-1 Ignite or Trauma is a held store, a weaker application does nothing; "refresh":
 *   the recount's chain, every success restarts the timer and the run's strongest is held), and on Minions minionCycle ("actor", the default, or
 *   "events", the planner's events on their ticks)
 * @param {object} [options.bus] the trigger bus (src/tick-recount.js tickTriggerBus: null or absent on the layers, the default)
 * @returns {object} spec for runTickEngine, plus program ("youga" | "plain" | null), averagedLayers: [{ key, label, path, lines }], and when
 *   a program runs liveLayers ([{ key, label, lines, events }]); on the Youga build heldLayers ([{ key, label, reason, lines }]); with Minions on the
 *   loop minions ([{ key, label, mode, ramp, count, block }])
 */
// The curse buff after every hit (its on-hit events, after the damage) and every DoT application (after the record is built) of the player's.
function withCurseOnDamage(items = [], curse) {
  const buff = { kind: "buff", buff: curse.buff, seconds: Infinity, once: true };
  const place = (effects) => effects?.flatMap((effect) => {
    if (effect.kind === "hit") return [{ ...effect, onHit: [...(effect.onHit || []), buff] }];
    if (effect.kind === "ailment" || effect.kind === "dot" || effect.kind === "area") return [effect, buff];
    if (effect.effects) return [{ ...effect, effects: place(effect.effects) }];
    return [effect];
  });
  return items.map((item) => (item.actor ?? "player") !== "player" ? item : { ...item, ...(item.effects ? { effects: place(item.effects) } : {}), ...(item.steps ? { steps: item.steps.map((step) => ({ ...step, effects: place(step.effects) })) } : {}) });
}

export function compileTickLedger(planner, { seconds = 54, live = TICK_LAYER_KEYS, readings = {}, bus: compiledBus = null } = {}) {
  const hits = (planner?.skillHits || []).filter((hit) => hit?.modeled && !hit.inactiveReason);
  // A Combo cycle on the loop with the Seething Spirit's casts merged into its rate: its parts take the player's own per-use (the Spirit's
  // casts are their own action; research/spectral-slash-cycle-rate-2026-11-14.md). Static streams keep the merged rate and per-use.
  const paths = Object.fromEntries(hits.map((hit) => [hit.key, hitPath(hit, { ownUse: live.length > 0 && hit.rehanSpirit?.modeled && plainUseKind(hit) === "cycle" })]));
  const core = live.length ? yougaCoreHit(planner, hits) : null;
  // Plain skills: the rest of the board, on the Youga build too. `live: []` keeps every skill a static stream.
  const plainHits = live.length ? hits.filter((hit) => hit !== core && plainUseKind(hit)) : [];
  // One layer context for the build (src/tick-layers.js): the Core's skill first (speed "cast"), then every plain skill. The general layers
  // run over all of them in one pass; the Core's own layers on the Core (src/tick-youga-layers.js).
  // The trigger bus (W10): null on the layers with nothing to own (the default is the bus since 2026-11-15), and with no layer context (`live: []` holds every layer at the planner's average).
  const bus = live.length ? compiledBus : null;
  const options = { ...readings, live, layers: core ? TICK_LAYERS : GENERAL_LAYERS, bus };
  const layerContext = live.length ? createLayerContext(planner, options) : null;
  // Every modeled hit is a target (chunk 15 session 3): the plain skills take the layers through their program, the static streams (triggered
  // skills, trigger rates such as True Flame Immolation) through their actions below.
  if (layerContext) {
    if (core) { layerContext.core = addTarget(layerContext, core, paths[core.key], { speedKey: "cast", core: true }); layerContext.youga = planner.yougaUltimateOne; }
    for (const hit of hits) if (hit !== core) addTarget(layerContext, hit, paths[hit.key]);
  }
  const program = core ? compileYougaProgram(layerContext, hitActions(core), options) : null;
  if (!program && layerContext) for (const build of GENERAL_ORDER) build(layerContext);
  if (program) paths[core.key] = { ...program.path, working: { ...program.path.working, timeVarying: program.path.modifiers.map(({ source, text, layer, percent }) => ({ source, text, layer, percent })) } };
  const layered = new Map((layerContext?.targets || []).filter((target) => !target.core).map((target) => { const finished = finishTarget(target); return [target.hit.key, { ...finished, path: { ...finished.path, working: { ...finished.path.working, timeVarying: finished.path.modifiers.map(({ source, text, layer, percent }) => ({ source, text, layer, percent })) } } }]; }));
  const general = layerContext ? { paths: layerContext.paths, actions: layerContext.actions, triggers: layerContext.triggers, periodics: layerContext.periodics, collectors: layerContext.collectors, initialBuffs: layerContext.initialBuffs, speeds: layerContext.speeds, liveLayers: program ? [] : [...layerContext.report.values()], heldLayers: program ? [] : generalHeldLayers(layerContext), queueOrder: readings.followerOrder === "slot" ? "list" : "ready" } : null;
  if (general) Object.assign(paths, general.paths);
  // Blessings gained only from the dummy (src/tick-layers.js onTargetBlessing) start at 0. Reading reapBlessing "held" is the recount's own
  // reading, for the checks that compare the engine with it: held from engagement, as before the on-target rule.
  const targetBlessings = readings.reapBlessing === "held" ? [] : layerContext?.targetBlessings ?? [];
  if (readings.reapBlessing === "held" && layerContext?.prebuilt) for (const item of layerContext.targetBlessings || []) layerContext.initialBuffs.push({ buff: item.buff, stacks: item.stacks, seconds: item.seconds, layered: true });
  // Aim's state on the loop (src/tick-layers.js aimLayer) enters a held Ignite or Trauma application's amount.
  const ailmentProgram = live.length ? compileAilmentProgram(planner, { ...readings, targetBlessings }, timerField(readings), { aimBuff: layerContext?.once.has("aim") ? "aim" : null, bus, othersIgnite: layerContext?.othersIgnite ?? null, penetrationStacks: layerContext?.penetrationStacks ?? [], stateGates: layerContext ? dotStateGates(layerContext) : [] }) : null;
  const plain = live.length ? compilePlainProgram(planner, plainHits, paths, readings, ailmentProgram, layered, bus) : null;
  if (plain) Object.assign(paths, plain.paths);
  // Main Skill triggers (Vendetta) as loop actions (src/tick-trigger-main.js; chunk 15 §10.4): the casts and the Main Skill's own uses on one
  // queue, each cast's triggered uses on the Main Skill's layered path.
  const triggerMain = plain && !program ? compileTriggerMains(planner, { hits: plainHits, paths, actions: plain.actions, layered, handsSplit: plain.handsSplit }) : null;
  if (triggerMain) { Object.assign(paths, triggerMain.paths); plain.actions = [...plain.actions.map((action) => triggerMain.replaced.has(action.key) ? triggerMain.replaced.get(action.key) : action).filter(Boolean), ...triggerMain.actions]; plain.layers.push(...triggerMain.layers); plain.assumptions.push(...triggerMain.assumptions); }
  if (ailmentProgram) Object.assign(paths, ailmentProgram.paths);
  // A layer's modifiers on the Minions' paths (W10 step 4a: the per-ailment-type Minion bodies, src/tick-layers.js minionTypeModifiers).
  const minionModifiers = layerContext?.ailmentTypeMinion?.length ? (minion, skill) => minionTypeModifiers(layerContext, minion, skill) : null;
  const minions = live.length ? compileMinionProgram(planner, { seconds, readings, timerFields: timerField(readings), bus, pathModifiers: minionModifiers }) : null;
  if (minions) Object.assign(paths, minions.paths);
  const layerOf = (hit) => hit === core ? program : layered.get(hit.key) || null;
  const averagedLayers = hits.flatMap((hit) => averagedLayersOf(planner, hit, layerOf(hit)));
  const assumptions = [
    ...hits.filter((hit) => (hit.rate.rateComponents || []).length).map((hit) => ({ id: `tick:streams:${hit.setupKey}`, value: hit.rate.rateComponents.map((component) => component.perInterval).join(" + "), text: `${hit.name}: ${hit.rate.rateComponents.map((component) => `${component.perInterval} ${component.label} per casting interval of ${Math.round(hit.rate.intervalSeconds * 10000) / 10000} s`).join(" + ")}, in lockstep (phase provisional). The player's own casts deal no hits.` })),
    ...averagedLayers.map((layer) => ({ id: `tick:averaged:${layer.key}`, value: layer.lines.length, text: `${layer.label}: the planner's average on every tick (${layer.lines.length} line${layer.lines.length === 1 ? "" : "s"}); session 2.` })),
    ...(program ? program.assumptions : (general?.liveLayers || []).map((layer) => ({ id: `tick:live:${layer.key}`, value: layer.lines.length, text: `${layer.label}: live. ${layer.events}.` }))),
    ...(plain?.assumptions || []),
    ...(minions?.assumptions || [])
  ];
  const placed = new Set(plainHits);
  // The Youga program's actions carry the follower's and the summon (its context's) with the Tangles; a plain build takes the context's own.
  const contextActions = program ? program.actions : general?.actions || [];
  // A static stream (a triggered skill, a trigger rate) takes its layers too: the layered path, its on-use and on-hit events, and what lands after
  // the hit (True Flame Immolation's consume and refill).
  const layeredStream = (hit) => {
    const live = layered.get(hit.key);
    if (!live) return hitActions(hit);
    paths[hit.key] = live.path;
    const strike = (effect) => ({ ...effect, ...(live.onHit.length ? { onHit: [...(effect.onHit || []), ...live.onHit] } : {}) });
    return hitActions(hit).map((action) => ({ ...action, effects: [...live.onUse, ...action.effects.map((effect) => effect.kind === "hit" ? strike(effect) : effect), ...live.after] }));
  };
  const allActions = [...hits.flatMap((hit) => hit === core ? contextActions : placed.has(hit) ? [] : layeredStream(hit)), ...(core ? [] : contextActions), ...(plain?.actions || []), ...(ailmentProgram?.actions || []), ...(minions?.actions || [])];
  const allPeriodics = [...(general?.periodics || []), ...(plain?.periodics || []), ...(ailmentProgram?.periodics || [])];
  const allTriggers = general?.triggers || [];
  // Every application lands on its skill's hits; an ailment with no stream on the loop stays averaged.
  const ailments = ailmentProgram?.attach({ hits, actions: allActions, triggers: allTriggers, periodics: allPeriodics, paths }) ?? null;
  if (ailments) Object.assign(paths, ailments.paths);
  // An on-target Blessing (src/tick-layers.js onTargetBlessing) gains a stack on every Reap on the loop when it is gained when Reaping; its hit gains
  // are on the hits already. With nothing on the loop that can build it, it stays held, the planner's reading.
  // With the trigger bus on 1000032 (W10 step 2b) the bus owns the Reap gain: it raises the gain from each Reap of yours on the loop (the same
  // expected stacks), so nothing goes on the Reaps here.
  for (const item of targetBlessings) {
    const busReap = Boolean(item.gains.reap && bus?.ownsReapBlessing(item.name));
    const onReaps = item.gains.reap && ailments?.reaps.length > 0 && (!busReap || bus.placesReapBlessing(item.name));
    if (onReaps && !busReap) for (const reap of ailments.reaps) reap.onFire = [...(reap.onFire || []), { kind: "buff", buff: item.buff, seconds: item.seconds, stacks: 1, maxStacks: item.stacks, layered: true }];
    if (!onReaps && !item.hitPlaced && general) general.initialBuffs.push({ buff: item.buff, stacks: item.stacks, seconds: Infinity, layered: true });
  }
  const placed0 = ailments ?? { actions: allActions, periodics: allPeriodics, triggers: allTriggers };
  // A gear curse cast by your damage (src/tick-layers.js curseLayer `curseOnDamage`): after each hit and DoT application of yours, so the run's first
  // one casts it (2026-11-22).
  const curse = layerContext?.curseOnDamage;
  const { actions, periodics, triggers } = curse ? Object.fromEntries(["actions", "periodics", "triggers"].map((name) => [name, withCurseOnDamage(placed0[name], curse)])) : placed0;
  const onLoop = ailments ? { ailments: ailments.ailments, reaps: ailments.reaps, derived: ailments.derived, ...(ailmentProgram.affliction ? { affliction: ailmentProgram.affliction } : {}), ...(ailments.nightfall ? { nightfall: ailments.nightfall } : {}) } : {};
  const averaged = averagedSources(planner, paths, new Set([...[...(ailments?.reaps || []), ...(ailments?.derived || []), ...(minions?.minions || [])].map((item) => item.key), ...(triggerMain?.seriesKeys || [])]));
  assumptions.push(...averaged.map((item) => ({ id: `tick:averagedSource:${item.key}`, value: item.dps, text: `${item.label}: ${item.reason}.` })), ...(ailments?.assumptions || []));
  // The bus's event on every hit path of yours (its strike hits, crit share, event tags), and its run state through the spec.
  if (bus) {
    Object.assign(paths, bus.withHitEvents(paths));
    const uses = bus.useIds?.length > 0;
    assumptions.push({ id: "tick:triggerBus", value: [...bus.ids].join(","), text: `Trigger bus (${[...bus.ids].join(", ")}): ${bus.listeners.length} listener${bus.listeners.length === 1 ? "" : "s"} on your hits${bus.ids.has(1000030) ? ", your DoT ticks" : ""}${bus.ids.has(1000030) || bus.ids.has(1000032) ? " and your Reaps" : ""}${uses ? ", and your skill uses by the planner's use sources" : ""}${bus.ids.has(1000047) ? ", your Minions' hits (1000047 on you, their own ids on them)" : ""}${bus.regainPools?.length ? ", your Regains" : ""}${bus.inflictIds?.length ? ", your ailment and DoT applications" : ""}; their buffs held on the loop as expected values${bus.owned.blur ? "; Blur from 0 on its gains" : ""}${bus.owned.reapStacks?.length ? `; Reaping Duration stacks from 0 on the Reaps (${bus.owned.reapStacks.join("; ")})` : ""}${bus.owned.useBlessings?.length ? `; ${bus.owned.useBlessings.join(", ")} Blessing pre-built and renewed by your uses` : ""}${bus.owned.profane ? "; Profane from 0 on your Wilt applications" : ""} (open questions trigger-bus-hit-events${bus.ids.has(1000030) || bus.ids.has(1000032) ? ", trigger-bus-dot-events" : ""}${bus.owned.blur ? ", trigger-bus-blur-from-reaps" : ""}${bus.owned.reapStacks?.length ? ", trigger-bus-reap-stacks" : ""}${uses ? ", trigger-bus-use-events" : ""}${bus.ids.has(1000047) || bus.regainPools?.length ? ", trigger-bus-minion-regain-events" : ""}${bus.owned.profane || Object.keys(bus.owned.inflictReaps || {}).length ? ", trigger-bus-inflict-events" : ""}).` });
  }
  const busSpec = bus ? { bus } : {};
  const dots = plain?.dots || [], ailmentLayers = ailments?.layers || [], plainProgram = Boolean(plain?.actions.length || plain?.dots.length || ailmentLayers.length || ailmentProgram?.actions.length || minions?.actions.length || general?.actions.length || general?.liveLayers.length);
  const held = [...(ailmentLayers.length ? ailmentProgram.held : []), ...(minions?.held || [])];
  const minionList = minions ? { minions: minions.minions } : {};
  const shared = general ? { speeds: general.speeds, triggers, collectors: general.collectors, initialBuffs: general.initialBuffs, queueOrder: general.queueOrder } : {};
  if (!program) {
    const generalLayers = general?.liveLayers || [], generalHeld = general && plainProgram ? general.heldLayers : [];
    return { seconds, program: plainProgram ? "plain" : null, paths, ...shared, ...busSpec, actions, periodics, dots, ...onLoop, ...minionList, ...(triggerMain ? { triggerMains: triggerMain.items } : {}), averaged, averagedLayers, ...(plainProgram ? { liveLayers: [...generalLayers, ...(plain?.layers || []), ...ailmentLayers, ...(minions?.layers || [])] } : {}), ...(held.length || generalHeld.length ? { heldLayers: [...generalHeld, ...held] } : {}), assumptions };
  }
  const { liveLayers, heldLayers, queueOrder } = program;
  return { seconds, program: "youga", ...shared, ...busSpec, queueOrder, paths, actions, periodics, dots, ...onLoop, ...minionList, averaged, averagedLayers, liveLayers: [...liveLayers, ...(plain?.layers || []), ...ailmentLayers, ...(minions?.layers || [])], heldLayers: [...heldLayers, ...held], assumptions };
}
