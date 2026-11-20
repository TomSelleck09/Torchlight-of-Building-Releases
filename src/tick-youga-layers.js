// Youga – The Ultimate One on the tick loop (sessions 2 and 3 of research/tick-engine-investigation-2026-10-30.md §7.5; status and the
// evidence for each timer: research/tick-engine-prototype-2026-10-31.md). Read-only and pure, like src/tick-ledger.js, its only importer.
// It rewrites nothing in the planner and re-derives no damage value.
//
// Since chunk 15 (2026-11-01) the general layers live in src/tick-layers.js and run on every hit of any build; this module keeps what only the
// Clockwork Core has: the summon, Selves of All Realms, the Alternate Spacetime spears, Night Feather Entanglement, the Core's crit cooldown
// events, the spear's travel and the Tangle actions. The order of the builders is the one sessions 2 and 3 fixed, so the figures and the report
// stay as pinned.
import {
  GENERAL_LAYERS, RECENT_SECONDS, SPELL_AGGRESSION_SECONDS, TICKS_PER_SECOND, aimLayer, ailmentTypeLayer, blessingLayer, curseLayer, finishTarget,
  followerProgram, frailLayer, frostbiteLayer, generalHeldLayers, markLayer, numbedLayer, paralysisLayer, penetrationLayer, periodicBurstLayer,
  prepareEvery, seedWindow, spellAggressionLayer, swiftBoltLayer, tidewellLayer, timedLayer, triggerBusLayer
} from "./tick-layers.js";

// Forking Thunder's spear (SS14 Split 957208, shot struct 930564): 3000 units/s (forks 2600), bModifySpeedByShotSpeedAttribute on, no speed
// limit. 100 units are 1 m (Supreme Descent: searchRadius 2000 is "within 20 m"). The Core sits 6 m from the dummy (condition coreDistant).
export const SPEAR_FLIGHT = Object.freeze({ unitsPerSecond: 3000, unitsPerMeter: 100, coreDistanceMeters: 6, source: "SS14 Split 957208 struct 930564" });
export const CORE_CRIT = Object.freeze({ seconds: 0.1, intervalSeconds: 0.2, source: "game affix 10224581 (Core-fired crit, node 206 Interval, node 320 -X s for all skills)" });

const general = (key) => GENERAL_LAYERS.find((layer) => layer.key === key);

/** Every layer a program can run live, in report order: the Core's own among the general ones. */
export const TICK_LAYERS = Object.freeze([
  { key: "coreSummon", label: "Clockwork Core summon (first trigger)" },
  general("aim"),
  { key: "selves", label: "Selves of All Realms" },
  { key: "spears", label: "Alternate Spacetime spears" },
  { key: "castsRecently", label: "Swift Bolt casts in the last 4 s" },
  general("spellAggression"),
  general("periodicBurst"),
  { key: "tangleStacks", label: "Night Feather Entanglement" },
  general("blessings"),
  { key: "coreCooldown", label: "Clockwork Core cooldown events" },
  general("followerCasts"),
  general("followerActor"),
  general("tidewell"),
  general("paralysis"),
  general("frail"),
  general("frostbite"),
  general("numbed"),
  { key: "curse", label: "Biting Cold" },
  { key: "ailmentTypes", label: "Ailment types (Elder Sage Girdle)" },
  general("mark"),
  { key: "spearTravel", label: "Spear travel from the Core" },
  { key: "penetrationStacks", label: "Dreamweaver penetration stacks" },
  general("othersIgnite"),
  general("afflictionFire"),
  general("timed")
]);
export const TICK_LAYER_KEYS = Object.freeze(TICK_LAYERS.map((layer) => layer.key));

/** The Clockwork Core's skill among the planner's hits, or null: only that build runs the Core's own layers. */
export function yougaCoreHit(planner, hits) {
  const youga = planner?.yougaUltimateOne;
  return youga?.core?.applied ? hits.find((hit) => hit.key === youga.mainHitKey) || null : null;
}

// ---------------------------------------------------------------------------------------------
// The Core's own layers, on the core target.

function coreSummon(ctx) {
  const { hit } = ctx.core;
  const nightFeather = ctx.isLive("tangleStacks") ? [{ kind: "buff", buff: "nightFeather", seconds: Infinity }] : [];
  const core = [{ kind: "buff", buff: "coreActive", seconds: Infinity }, ...nightFeather];
  // Own buffs built before engaging (user rule 2026-10-09, prebuiltSelfBuffs): the Core was summoned before the fight and is up at engagement,
  // its Tangles charged at t = 0 (SS14 client: they fire on their first tick) (chunk 15 session 2: the summon cast ran cold against that rule,
  // ×0.904 on the 5 s window). Off: no Core until a cast of the supported skill makes one (R1: research/youga-recall-mechanics-2026-10-18.md);
  // it stays up after that (the player recasts within the 8 s, best case). The Tangles fire on their first tick with the Core (SS14 client).
  if (!ctx.isLive("coreSummon") || ctx.prebuilt) {
    ctx.initialBuffs.push({ buff: "coreActive", seconds: Infinity }, ...(nightFeather.length ? [{ buff: "nightFeather", seconds: Infinity }] : []));
    if (ctx.isLive("coreSummon")) ctx.reported("coreSummon").events = "the Core is up at engagement (own buffs pre-built, user rule 2026-10-09); its Tangles start charged and fire on the first tick (SS14 client)";
    return;
  }
  ctx.actions.push({
    key: "core:summon", actor: "player", label: "Player cast: summons the Clockwork Core", maxUses: 1,
    useSeconds: { baseSeconds: hit.rate.useTimeSeconds / (hit.rate.supportSpeedFactor || 1), speed: ctx.core.speedKey },
    effects: [...core, ...(ctx.isLive("spellAggression") ? [{ kind: "buff", buff: "spellAggression", seconds: SPELL_AGGRESSION_SECONDS }] : [])]
  });
  ctx.reported("coreSummon").events = "one player cast summons the Core; its Tangles fire on their first tick after it (SS14 client)";
}

function selvesLayer(ctx) {
  const { youga } = ctx, target = ctx.core;
  if (!ctx.isLive("selves") || !youga.selves) return;
  const lift = youga.lift;
  for (const line of target.claimPattern("selves", /Selves of All Realms: Empowered Element|I Need Not Lift a Finger/)) {
    if (line.layer === "increased") target.addModifier(line, { buff: "selves", layer: "increased", percent: line.value, steadyAmount: line.value });
    else target.addModifier(line, { buff: "selvesAfter", percent: lift?.percent ?? line.value, steadyAmount: line.value });
  }
  const interval = prepareEvery(ctx.planner, "Selves of All Realms") ?? 1 / TICKS_PER_SECOND;
  // Live Core events: the extended base cooldown, shortened by the events. Else the planner's cooldown, which holds them as a factor.
  const baseSeconds = ctx.isLive("coreCooldown") ? youga.selves.baseCooldown : youga.selves.cooldown;
  ctx.triggers.push({
    key: "selves", actor: "player", label: `Selves of All Realms (Preparation every ${interval} s)`, intervalSeconds: interval,
    cooldown: { baseSeconds },
    effects: [{ kind: "buff", buff: "selves", seconds: youga.selves.duration }, { kind: "buff", buff: "selvesAfter", seconds: youga.selves.duration + (lift?.afterSeconds ?? 0) }]
  });
  ctx.reported("selves").events = `Preparation every ${interval} s behind a ${baseSeconds} s cooldown (Cooldown Recovery extends it: I Am the Measure of All Time), ${youga.selves.duration} s buff, +${lift?.afterSeconds ?? 0} s for the +${lift?.percent ?? 0}%`;
}

function spearLayer(ctx) {
  const target = ctx.core;
  const lines = ctx.isLive("spears") || ctx.isLive("selves") ? target.claimPattern(ctx.isLive("spears") ? "spears" : "selves", /Alternate Spacetime/) : [];
  const line = lines[0];
  if (!line) return;
  const recent = (ctx.youga.alternate?.lines || []).find((item) => item.recentProjectiles)?.recentProjectiles;
  if (!ctx.isLive("spears") || !recent) { target.addModifier(line, { buff: "selves", percent: line.value, steadyAmount: line.value }); return; }
  // Game recipe 12342453: min(l0 × P1, P2) × (1 + Measure effect) while buff 81614 is up; l0 = Projectiles generated in the last 4 s.
  target.addModifier(line, { collector: "spears", perStack: true, percent: recent.per, capPercent: recent.cap, ...(ctx.isLive("selves") ? { requires: ["selves"] } : {}), steadyAmount: line.value });
  ctx.collectors.push({ key: "spears", windowSeconds: RECENT_SECONDS, ...(ctx.prebuilt ? { seed: seedWindow(target.hit.rate.usesPerSecond) } : {}) });
  target.onUse.push({ kind: "collect", collector: "spears" });
  ctx.reported("spears").events = `one spear per Tangle use, read for 120 ticks; +${Math.round(recent.per * 100) / 100}% each, up to +${recent.cap}%${ctx.prebuilt ? "; full at engagement (prebuilt)" : ""}`;
}

function nightFeatherLayer(ctx) {
  if (!ctx.isLive("tangleStacks")) return;
  const target = ctx.core;
  const held = (ctx.planner.lineEffects?.lines || []).filter((line) => line.condition === "nightFeather").flatMap((line) => (line.bodies || []).map((body) => ({ source: line.source, text: body.derivedText })));
  const inList = (list, line) => list.some((item) => item.source === line.source && item.text === line.text);
  const lines = target.claim("tangleStacks", (line) => /Night Feather/.test(`${line.source} ${line.text}`) || inList(held, line));
  for (const line of lines) target.addModifier(line, { buff: "nightFeather", percent: line.value, steadyAmount: line.value });
  const recovery = (ctx.planner.aim?.cooldownSources || []).find((line) => /Night Feather/.test(line.source));
  if (recovery) ctx.addSpeed("cooldown", "tangleStacks", { source: recovery.source, text: `+${recovery.value}% Cooldown Recovery Speed` }, { buff: "nightFeather", layer: "increased", percent: recovery.value, steadyAmount: recovery.value });
  ctx.reported("tangleStacks").events = "held once the Core's Tangles exist (game recipe 1447677: stacks follow the activated Tangles); its Cooldown Recovery Speed reaches Aim's recharge";
}

function coreCooldownLayer(ctx) {
  if (!ctx.isLive("coreCooldown")) return;
  ctx.core.onHit.push({ kind: "chance", key: "coreCooldown", probability: ctx.core.hit.crit.chancePercent / 100, gate: { fixedSeconds: CORE_CRIT.intervalSeconds }, effects: [{ kind: "reduceCooldowns", seconds: CORE_CRIT.seconds }] });
  ctx.reported("coreCooldown").events = `-${CORE_CRIT.seconds} s for all skills on a Core-fired crit behind a ${CORE_CRIT.intervalSeconds} s fixed gate (${CORE_CRIT.source})`;
}

// The spear flies from the Core to the dummy: a constant offset on every hit, read on landing. The speed is the file's, times the planner's
// increased Projectile Speed and Swift Bolt's additional line at its cap; the small variation with the stacks is left out.
function spearTravelLayer(ctx) {
  const { hit } = ctx.core, { planner } = ctx;
  if (!ctx.isLive("spearTravel") || hit.name !== "Forking Thunder" || planner.conditions?.coreDistant === false) return;
  const line = (hit.ledger?.additional || []).find((item) => /additional Projectile Speed for the supported skill for each time it was cast recently, up to (\d+) time/.test(item.text));
  const match = line?.text.match(/\+([\d.]+)% additional Projectile Speed for the supported skill for each time it was cast recently, up to (\d+) time/);
  const additional = match ? 1 + Number(match[1]) * Number(match[2]) / 100 : 1;
  const unitsPerSecond = SPEAR_FLIGHT.unitsPerSecond * (1 + (hit.projectileSpeed?.increasedPercent ?? 0) / 100) * additional;
  ctx.travelSeconds = SPEAR_FLIGHT.coreDistanceMeters * SPEAR_FLIGHT.unitsPerMeter / unitsPerSecond;
  ctx.reported("spearTravel").events = `${SPEAR_FLIGHT.coreDistanceMeters} m at ${Math.round(unitsPerSecond)} units/s = ${Math.round(ctx.travelSeconds * 10000) / 10000} s, whole ticks on landing (${SPEAR_FLIGHT.source}, the planner's Projectile Speed)`;
}

// What stays held on purpose on this build, with why (the general ones first, in the order the tests pin).
function heldLayers(ctx) {
  const lines = ctx.planner.lineEffects?.lines || [];
  const named = (condition) => lines.filter((line) => line.condition === condition && line.status === "In calc").map((line) => ({ source: line.source, text: line.text }));
  const general = generalHeldLayers(ctx);
  const [hasten, mobility, aimEffect, ...rest] = general;
  return [
    { ...hasten, reason: "\"Has Hasten\" on the Vorax neck is a permanent status with nothing to time, so its +8% additional Cast Speed stays in the static speed" },
    mobility, aimEffect,
    ...rest.map((layer) => layer.key === "penetration" ? { ...layer, label: "Dreamweaver penetration stacks", reason: "this run holds them at 4 stacks; layer penetrationStacks puts them through the resistance step" } : layer),
    { key: "tangleCount", label: "Lines per activated Tangle", reason: "the Core holds 4 Tangles from its summon, before the first hit, so these never vary", lines: [...named("activatedTangles"), ...named("tangleEnhancement")] },
    { key: "coreHeld", label: "Clockwork Core presence", reason: "after the first summon the Core stays up: the player recasts within its 8 s (best case, as the planner reads it)", lines: [] }
  ];
}

// The builders in the order sessions 2 and 3 fixed; the general ones run over every target, the Core's own on the core target.
const ORDER = [coreSummon, aimLayer, selvesLayer, spearLayer, swiftBoltLayer, spellAggressionLayer, periodicBurstLayer, nightFeatherLayer, blessingLayer, triggerBusLayer, coreCooldownLayer, tidewellLayer, paralysisLayer, frailLayer, frostbiteLayer, numbedLayer, curseLayer, ailmentTypeLayer, markLayer, spearTravelLayer, penetrationLayer, timedLayer, followerProgram];

/**
 * The live program for the Clockwork Core's hit, on a layer context (src/tick-layers.js createLayerContext) whose first target is the Core's
 * skill (speed "cast"); the other targets, the build's plain skills, take the general layers in the same pass.
 * @param {object} ctx the layer context, with ctx.core the Core's target and ctx.youga the planner's yougaUltimateOne
 * @param {object[]} tangleActions one action per Tangle stream
 * @param {object} options { live: layer keys, tangleTimer: "carry" | "drop" | "nearest", tanglePhase: "lockstep" | "staggered",
 *   tangleStart: "atSummon" (default, SS14 client) | "afterSummon", numbedStacks, followerOrder: "ready" | "slot" } the last five run the open readings for the
 *   probe's effect range
 */
export function compileYougaProgram(ctx, tangleActions, options) {
  const target = ctx.core, { hit } = target;
  for (const build of ORDER) build(ctx);
  const interval = tangleActions[0]?.useSeconds, streams = tangleActions.length;
  const timer = options.tangleTimer && options.tangleTimer !== "carry" ? { timer: options.tangleTimer } : {};
  const strike = { kind: "hit", path: hit.key, ...(target.onHit.length ? { onHit: target.onHit } : {}) };
  const tangles = tangleActions.map((action, index) => ({
    ...action, actor: "player", requiresBuff: "coreActive", ...timer,
    useSeconds: { baseSeconds: action.useSeconds * hit.rate.speedFactor, speed: target.speedKey },
    // First trigger (SS14 client, research/oq-r3-r4-rea-2026-11-04.md tick-tangle-phase): a new Core Tangle starts with its elapsed
    // time at the full interval, so it fires on its first tick with a target, all of one summon together (lockstep); the frame the
    // Core's Tangles first get their target is inferred (the tick after the summon). "afterSummon" keeps the pre-2026-11-04 reading
    // (one casting interval after the summon).
    ...(options.tanglePhase === "staggered" ? { firstUseSeconds: interval * (1 + index / streams) } : options.tangleStart !== "afterSummon" ? { firstUseSeconds: 1 / TICKS_PER_SECOND } : {}),
    effects: [...target.onUse, ctx.travelSeconds ? { kind: "delay", seconds: ctx.travelSeconds, effects: [strike] } : strike]
  }));
  const liveLayers = [...ctx.report.values()];
  const assumptions = liveLayers.map((layer) => ({ id: `tick:live:${layer.key}`, value: layer.lines.length, text: `${layer.label}: live. ${layer.events}.` }));
  assumptions.push(
    { id: "tick-tangle-timer-class", value: options.tangleTimer || "carry", text: "A Tangle's trigger is read as a per-Tangle cast timer at the Spell's casting interval, overshoot carried, capped at one frame (SS14 client: research/oq-r3-r4-rea-2026-11-04.md tick-tangle-timer-class)." },
    { id: "tick-tangle-phase", value: options.tanglePhase || "lockstep", text: options.tangleStart === "afterSummon" ? "All Tangles start together, one casting interval after the summon cast ends (the pre-2026-11-04 reading)." : "All Tangles start charged and fire together on their first tick with the Core as their target (SS14 client: a new Tangle's elapsed time starts at the full interval); later casts do not reset them." },
    { id: "tick-follower-actor", value: ctx.isLive("followerActor") ? options.followerOrder || "ring" : "parallel", text: ctx.isLive("followerActor") ? "The follower is one actor: one cast at a time, each skill ready again after its cooldown from the press, the first ready after the last one used going next (client AI_SelectMercenarySkill)." : "The follower's skills run in parallel at the planner's rates, all from t = 0." },
    { id: "tickProjectileTravel", value: ctx.travelSeconds ?? 0, text: ctx.travelSeconds ? `Spear travel: a constant ${Math.round(ctx.travelSeconds * 10000) / 10000} s from the Core to the dummy; hits read buffs on landing (whether the client snapshots them at the launch was not traced).` : "No projectile travel in this run: a spear lands on the tick its use ends." }
  );
  const finished = finishTarget(target);
  return {
    path: finished.path, actions: [...ctx.actions, ...tangles], triggers: ctx.triggers,
    liveLayers, heldLayers: heldLayers(ctx), assumptions, claimedKeys: finished.claimedKeys, rateGroups: finished.rateGroups, queueOrder: options.followerOrder === "slot" ? "list" : "ready"
  };
}
