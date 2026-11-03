// Minions on the tick loop (session 6 of research/tick-engine-investigation-2026-10-30.md §7.5; status and findings:
// research/tick-engine-prototype-2026-10-31.md). Read-only and pure, like src/tick-ledger.js, its only importer. Every value is the planner's
// (planner.minions, src/minion-damage-model.js): this module only places them on ticks.
//
// Two readings (`minionCycle`):
// - "events": each of the planner's events on its whole tick: the first tick at or after its landing, the rule a use's end follows. The end check.
// - "actor" (default): one Minion type is one actor. Each skill is an action in one queue: specials first, longest cooldown first, the Base /
//   Enhanced slot last, as the planner's cycle picks. Use phases, the carry rule and cooldowns (first tick with cd ≤ elapsed) are the engine's own.
//   The summon is a player cast, and the Minion's first use is pressed on the tick after it ends.
//
// What the actor keeps from the planner: the time of each use, and its damage. The k-th use of a skill reads the planner's k-th use, so what the
// planner computes per use (Nourishment stacks, Empower and next-use buffs, Bond, the hero ramps) stays the event's own value and is listed in
// `held`. A hit that takes no use time (a triggered special, Frequent Quake, Soft Storm) stays on its planner tick beside the actor. A Minion whose
// cycle the actor cannot replay stays on "events", with the reason in `held`.
//
// The Synthetic Troop ramp (own buffs not prebuilt) is live on the actor: each summon adds Minions, and a hit reads the share out on its tick.
import { buffStacks, framesAtOrAfter } from "./tick-engine.js";
import { timedShareFactor } from "./tick-ailments.js";

const EPS = 1e-9;
const FRAME_SECONDS = 1 / 30;
// The planner's steady window starts here (src/minion-damage-model.js). A list repeats from it, so the opening stays out of a long run.
const STEADY_FROM_SECONDS = 20;

export const MINION_CYCLE_READINGS = Object.freeze(["actor", "events"]);

/** The tick of a scheduled time: the first tick at or after it. The planner's times are sums of floats: a rounding error past a tick stays on it. */
export const minionEventFrame = (seconds) => Math.max(1, framesAtOrAfter(Math.max(0, seconds - EPS)));

// Why the actor cannot replay this cycle, or null.
function actorBlock(minion, skills) {
  const uses = minion.cycle?.uses;
  if (!uses?.length) return "its events are a rate, not uses (Charge Calling's explosion loop)";
  if (uses.some((use) => use.skills.some((name) => skills.get(name)?.role === "ultimate"))) return "its Ultimate's cooldown and windows belong to the planner's cycle";
  return null;
}

// A run past the planner's list: the steady part again, one window on each time.
function repeatedEvents(events, seconds) {
  const end = Math.ceil(events[events.length - 1]?.time ?? 0), period = end - STEADY_FROM_SECONDS;
  if (!(seconds > end) || !(period > 0)) return events;
  const steady = events.filter((event) => event.time >= STEADY_FROM_SECONDS), repeated = [...events];
  for (let shift = period; end + shift - period < seconds; shift += period) repeated.push(...steady.map((event) => ({ ...event, time: event.time + shift })));
  return repeated;
}

const timedModifier = (factorAt) => ({ source: "Timed effects", text: "Timed effects over time, as the recount reads them", liveKey: "timed", layer: "additional", steadyAmount: 0, amount: (world) => (factorAt(world.frame * FRAME_SECONDS) - 1) * 100 });

function compileMinion(minion, scheduled, timedEffects, { seconds, readings, timerFields }) {
  const { key, count, cycle, troopCount } = minion;
  const skills = new Map((minion.skills || []).map((skill) => [skill.name, skill]));
  const block = actorBlock(minion, skills), actor = !block && readings.minionCycle !== "events";
  // The ramp is live on the actor; on the events it stays in each event's value.
  const ramp = actor && troopCount?.rampIntervalSeconds > 0, outBuff = `${key}:out`;
  const label = `${minion.name} (Minion)`;
  const events = minion.events.map((event, index) => ({ ...event, timedShare: scheduled?.events?.[index]?.timedShare, value: ramp && event.minionsOut > 0 ? event.damage * count / event.minionsOut : event.damage }));
  const rampModifier = { source: `${minion.summon}: Minions out`, text: `the share of ${count} Minions out on this tick`, liveKey: "count", layer: "additional", steadyAmount: 0, amount: (world) => (buffStacks(world, outBuff) / count - 1) * 100 };

  const paths = {}, bases = new Map();
  for (const event of events) {
    if (bases.has(event.skill)) continue;
    const own = events.filter((item) => item.skill === event.skill), skill = skills.get(event.skill);
    const mean = own.reduce((sum, item) => sum + item.value, 0) / own.length, base = mean > 0 ? mean : 1;
    bases.set(event.skill, base);
    const factor = timedShareFactor(timedEffects, event.timedShare);
    paths[`${key}:${event.skill}`] = {
      label, source: key, kind: "hit",
      parts: [{ key: event.skill, type: event.type ?? null, base, increasedPercent: 0, additionalFactor: 1 }],
      modifiers: [...(ramp ? [rampModifier] : []), ...(factor ? [timedModifier(factor)] : [])],
      working: { skill: event.skill, role: skill?.role ?? null, meanPerUse: mean, hitsPerUse: skill?.hitsPerUse ?? null, perHitNoBuff: skill?.perHitNoBuff ?? null, perHitBuffed: skill?.perHitBuffed ?? null, useTimeSeconds: skill?.effectiveUseTimeSeconds ?? null, cooldownSeconds: skill?.cooldownSeconds ?? null, minions: count }
    };
  }
  const hitOf = (event) => ({ kind: "hit", path: `${key}:${event.skill}`, count: event.value / bases.get(event.skill), ...((event.weight ?? 1) !== 1 ? { weight: event.weight } : {}) });
  const timelineOf = (list) => {
    const frames = new Map();
    for (const event of repeatedEvents(list, seconds)) {
      const frame = minionEventFrame(event.time);
      frames.set(frame, [...(frames.get(frame) || []), hitOf(event)]);
    }
    return [...frames].map(([frame, effects]) => ({ frame, effects }));
  };
  const scheduleAction = (name, text, list) => list.length ? [{ key: `${key}:${name}`, label: `${minion.name}: ${text}`, actor: "minion", timeline: timelineOf(list) }] : [];

  const entry = { key, label, mode: actor ? "actor" : "events", ramp: Boolean(ramp), count, ...(block ? { block } : {}) };
  const base = { paths, entry, lockstep: count > 1, enhancedBlend: cycle.enhancedShare > 0 && cycle.enhancedShare < 1 };
  if (!actor) return { ...base, actions: scheduleAction("events", "planner's events", events) };

  const eventsOfUse = new Map();
  for (const event of events) if (Number.isInteger(event.use)) eventsOfUse.set(event.use, [...(eventsOfUse.get(event.use) || []), event]);
  // A use lands everything at its end, a persistent skill's later ticks after it. A blended slot's two parts land together: the blend is the time.
  const stepOf = (use, index) => ({ useSeconds: use.seconds, label: `${minion.name}: ${use.skills.join(" or ") || "no damage"}`, effects: (eventsOfUse.get(index) || []).map((event) => event.tick > 0 ? { kind: "delay", seconds: event.tick, effects: [hitOf(event)] } : hitOf(event)) });
  // The list ends with the last use that has a hit: one that lands past the planner's list has nothing to read.
  const uses = cycle.uses.slice(0, 1 + events.reduce((last, event) => Number.isInteger(event.use) ? Math.max(last, event.use) : last, -1));
  const stepsWhere = (test) => uses.flatMap((use, index) => test(use) ? [{ use, step: stepOf(use, index) }] : []);
  const loopOf = (list) => { const at = list.findIndex(({ use }) => use.start >= STEADY_FROM_SECONDS); return at > 0 ? { loopFrom: at } : {}; };
  const shared = { actor: "minion", queue: key, queueCarry: true, requiresBuff: outBuff, ...timerFields };
  const specials = (minion.skills || []).filter((skill) => uses.some((use) => !use.slot && use.skills[0] === skill.name)).sort((a, b) => b.cooldownSeconds - a.cooldownSeconds);
  const actions = specials.map((skill, priority) => {
    const list = stepsWhere((use) => !use.slot && use.skills[0] === skill.name);
    return { key: `${key}:${skill.name}`, label: `${minion.name}: ${skill.name}`, ...shared, priority, steps: list.map((item) => item.step), ...loopOf(list), ...(skill.timing?.cooldown > 0 ? { cooldown: { baseSeconds: skill.timing.cooldown, speedFactor: skill.cooldownRecoveryFactor ?? 1 } } : {}) };
  });
  const slot = stepsWhere((use) => use.slot);
  if (slot.length) actions.push({ key: `${key}:slot`, label: `${minion.name}: Base or Enhanced Skill`, ...shared, priority: specials.length, steps: slot.map((item) => item.step), ...loopOf(slot) });
  // The summon: a player's cast, one per max(cast, cooldown) while the ramp runs, each bringing its Minions (src/minion-damage-model.js outAt).
  const perSummon = ramp ? troopCount.perCast : count, interval = ramp ? troopCount.rampIntervalSeconds : 0;
  // The birth skill (chunk 10): the behaviour tree's Spawn subtree casts it before anything else, so a Minion is out that long after its summon ends.
  const arrival = cycle.summonCastSeconds + (cycle.spawnSeconds || 0);
  const summon = { key: `${key}:summon`, label: `${minion.summon} cast and birth`, actor: "player", useSeconds: arrival, maxUses: Math.ceil(count / perSummon), ...(interval > arrival + EPS ? { cooldown: { baseSeconds: interval } } : {}), ...timerFields, effects: [{ kind: "buff", buff: outBuff, seconds: Infinity, stacks: perSummon, maxStacks: count }] };
  return { ...base, actions: [summon, ...actions, ...scheduleAction("triggered", "hits with no use time", events.filter((event) => event.triggered))] };
}

/**
 * The Minions of a build on the loop, or null when it has none.
 * @param {object} planner calculatePlanner's result (read only)
 * @param {object} options
 * @param {number} options.seconds the run length
 * @param {object} [options.readings] minionCycle: MINION_CYCLE_READINGS
 * @param {object} [options.timerFields] the cast reading's fields, shared with the player's skills
 * @returns {{ paths, actions, layers, held, assumptions, minions: [{ key, label, mode, ramp, count, block }] } | null}
 */
export function compileMinionProgram(planner, { seconds, readings = {}, timerFields = {} }) {
  const modeled = (planner?.minions || []).filter((minion) => minion.modeled && minion.events?.length);
  if (!modeled.length) return null;
  const inputs = planner.dummyRecount?.inputs;
  const compiled = modeled.map((minion) => compileMinion(minion, inputs?.scheduledHits?.find((item) => item.key === minion.key), inputs?.timedEffects, { seconds, readings, timerFields }));
  const per = (minion, index) => compiled[index].entry;
  const eventsText = (item, minion) => item.mode === "actor"
    ? `one actor: ${minion.cycle.summonCastSeconds} s summon, then ${minion.cycle.rule}; each use the planner's value, on whole ticks`
    : `the planner's ${minion.events.length} events, each on the first tick at or after its landing`;
  const held = [
    ...modeled.map((minion, index) => ({ key: `${minion.key}:values`, label: `${minion.name}: per-use values`, reason: per(minion, index).mode === "actor" ? "the k-th use of a skill reads the planner's k-th use: Nourishment stacks, Empower and next-use buffs, Bond and the hero ramps stay the value the planner's cycle gave that use" : `every event at the planner's time and value: ${per(minion, index).block ?? "the events reading"}`, lines: [] })),
    ...modeled.flatMap((minion, index) => compiled[index].lockstep ? [{ key: `${minion.key}:lockstep`, label: `${minion.name}: ${minion.count} Minions in lockstep`, reason: "one actor, as the planner's count multiplies each hit: each Minion's own AI phase is not in the data (tick-minion-lockstep)", lines: [] }] : []),
    ...modeled.flatMap((minion, index) => compiled[index].enhancedBlend ? [{ key: `${minion.key}:enhancedBlend`, label: `${minion.name}: Enhanced Skill blend`, reason: "an expected-value blend of the Base and Enhanced Skill, as the planner's: one use of the blended time, both parts landing at its end", lines: [] }] : []),
    ...modeled.map((minion) => ({ key: `${minion.key}:summon`, label: `${minion.name}: summon cast`, reason: "beside the player's other skills from t = 0, as the planner reads it: the summon takes no time from them", lines: [] })),
    ...modeled.map((minion) => ({ key: `${minion.key}:lines`, label: `${minion.name}: part-time buffs from you`, reason: "player buffs that reach Minions (Dazzling Bloom, Empower, Warcries, Calibrate and the other rate-driven lines) stay the planner's averages in each value", lines: [] }))
  ];
  return {
    paths: Object.assign({}, ...compiled.map((item) => item.paths)),
    actions: compiled.flatMap((item) => item.actions),
    minions: compiled.map((item) => item.entry),
    layers: modeled.map((minion, index) => ({ key: minion.key, label: `${minion.name} (Minion)`, lines: [], events: eventsText(per(minion, index), minion) })),
    held,
    assumptions: modeled.map((minion, index) => ({ id: `tick:minion:${minion.key}`, value: per(minion, index).mode, text: `${minion.name}: ${eventsText(per(minion, index), minion)}.` }))
  };
}
