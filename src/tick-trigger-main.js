// Main Skill triggers on the tick loop (research/timing-chunk15-2026-11-01.md §10.4; done 2026-11-13 for the 9 T Double Thrusts audit G6,
// research/build-9t-double-thrusts-audit-2026-11-12.md). Read-only and pure, like src/tick-ledger.js, its importer (src/tick-layers.js takes the
// Incisive layer from here). A trigger-main skill (Vendetta, Endless Vendetta; src/vendetta-model.js) was one static net lump per cycle on the
// loop, so in the 5 s / 20 s windows and the 60 s recount it kept its steady value while the Main Skill's own hits ramped on the clean dummy. Here
// it is a loop action:
// - the player's hands are one actor (an engine `queue`): the trigger skill goes first whenever it is ready (priority 0), the Main Skill's own
//   uses fill the rest (priority 1), so a no-cooldown Vendetta (Leisurely Stroll with Hasten) leaves no manual use, and a cooldown one leaves
//   the planner's manual time between casts (a ready cast waits for the Main Skill use under way: provisional, tick-trigger-main-queue);
// - each cast's use time is the planner's (its attack-speed use, its supports, Leisurely Stroll's speed), read at the press from the Main
//   Skill's live Attack Speed (the same weapon Attack Speed pool; a live layer moves both alike);
// - at the end of each cast (each repeat of Endless Vendetta) the triggered Main Skill uses land on the Main Skill's own layered path, scaled to
//   the planner's damage per triggered use (combat.perTrigger: +30%, the Main Skill's triggered line, Vendetta's Sting's factors and Excess),
//   so every time-varying layer reaches them, with the Main Skill's on-use and on-hit events (Blessing gains, Mark, ailment attempts): one use
//   group for the base trigger and one for the expected extra triggers (Feline Fury's rows and the Phantom's casts, value-weighted, as one
//   fractional count; their events fire once per group: provisional);
// - Incisive (buff 82169, 3 s × Incisive Duration) is gained at each cast end, before its triggered hits; its damage lines on the Main Skill's
//   ledger (the planner's uptime average) go live, and Leisurely Stroll's −X% reaches the manual uses while it is up (game affix 6958220),
//   where the planner took it off the net gain.
// The damage of a triggered use is split between two series by the planner's own accounting, so each window row stays comparable with its
// sustained row: the Main Skill's row takes lostPerCycle ÷ triggered per cycle (the attacks the casts replace and the manual penalty), the
// trigger's "net" row the rest. Both shares read the same layers on the same tick; the split moves no total. The sustained figure is the planner's
// closed form (unchanged).

import { pathValueAt, usesPerPlacement } from "./tick-engine.js";
import { plainUseKind, repeatEffects } from "./tick-plain-skills.js";
import { VENDETTA_PATTERNS } from "./erika-traits.js";

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;
const steadyOf = (path) => pathValueAt(path, (path.modifiers || []).map((modifier) => modifier.steadyAmount ?? 0));
export const triggerMainQueue = (mainKey) => `hands:${mainKey}`;

/**
 * The modeled trigger-main skills whose Main Skill runs on the loop as a plain use (src/tick-plain-skills.js plainUseKind), each with that hit.
 * @param {object} planner calculatePlanner's result (read only)
 * @param {object[]} hits the hits the loop places as plain uses
 */
export function loopTriggers(planner, hits) {
  return (planner?.triggerSkills || []).filter((trigger) => trigger?.modeled && trigger.main?.setupKey && trigger.rate && trigger.combat).map((trigger) => {
    const main = (hits || []).find((hit) => hit.setupKey === trigger.main.setupKey) || null;
    return main && plainUseKind(main) && trigger.combat.perTrigger > 0 ? { trigger, main } : null;
  }).filter(Boolean);
}

// Erika – Vendetta's Sting's Incisive lines (src/hero-trait-modules.js erikaVendettaEntry): the gain line's derived damage body, Mortal Gambit's
// level-1 body, each held at the planner's uptime, and Leisurely Stroll's manual penalty.
function incisiveState(planner) {
  const incisive = planner.lineEffects?.state?.erikaVendetta?.incisive;
  if (!incisive) return null;
  const lines = (planner.lineEffects?.lines || []).filter((line) => line.module === "vendettaSting" && line.status === "In calc");
  const bodies = lines.flatMap((line) => {
    const full = VENDETTA_PATTERNS.incisiveGain.test(line.text) ? incisive.damagePercent : VENDETTA_PATTERNS.mortalTaken.test(line.text) ? incisive.mortalAttackPercent : null;
    return full > 0 ? (line.bodies || []).map((body) => ({ source: line.source, text: body.derivedText, full })) : [];
  });
  const penalty = lines.find((line) => VENDETTA_PATTERNS.manualPenalty.test(line.text)) || null;
  const percent = Number(planner.lineEffects.state.erikaVendetta.manualPenaltyPercent) || 0;
  return { durationSeconds: incisive.durationSeconds, bodies, penalty: penalty && percent > 0 ? { source: penalty.source, text: penalty.text, percent } : null };
}

/**
 * The Incisive layer (src/tick-layers.js GENERAL_ORDER): on the Main Skill of a trigger on the loop, Incisive's damage lines come out of the static
 * product (the planner's uptime average) and go back at their full value while the buff `incisive` is held; the trigger's casts grant it.
 */
export function incisiveLayer(ctx) {
  const pairs = loopTriggers(ctx.planner, ctx.targets.map((target) => target.hit));
  const state = pairs.length ? incisiveState(ctx.planner) : null;
  if (!state?.bodies.length) return;
  let any = false;
  for (const { main } of pairs) {
    const target = ctx.targets.find((item) => item.hit === main);
    if (!target) continue;
    for (const body of state.bodies) for (const line of target.claim("incisive", (item) => item.source === body.source && item.text === body.text)) {
      target.addModifier(line, { buff: "incisive", percent: body.full, steadyAmount: line.value });
      any = true;
    }
  }
  if (any) ctx.reported("incisive").events = `held ${state.durationSeconds} s from the end of each Vendetta cast (the trigger's loop action, src/tick-trigger-main.js), before that cast's triggered hits; from 0 at engagement`;
}

// The first hit effect of the Main Skill's own action (its step 1 for a Combo cycle: a trigger is read as one Combo Starter 1 hit).
function mainStrike(action, mainKey, paths) {
  const effects = action?.steps ? action.steps[0]?.effects : action?.effects;
  return (effects || []).find((effect) => effect.kind === "hit" && (effect.path === mainKey || paths[effect.path]?.source === mainKey)) || null;
}

const scaled = (path, key, fields, factor) => ({ ...path, key, ...fields, parts: path.parts.map((part) => ({ ...part, base: part.base * factor })) });

/**
 * The loop actions of the build's trigger-main skills. Writes nothing: the caller merges `paths` and replaces the Main Skill's action.
 * @param {object} planner calculatePlanner's result (read only)
 * @param {object} p
 * @param {object[]} p.hits the plain hits on the loop
 * @param {Record<string, object>} p.paths every path so far (the Main Skill's final path and its step sub-paths included)
 * @param {object[]} p.actions the plain program's actions (the Main Skill's own one is queued behind the trigger)
 * @param {Map} p.layered the general layers' path and events of each hit (src/tick-layers.js finishTarget)
 * @param {Map} [p.handsSplit] src/tick-plain-skills.js compilePlainProgram's hands split of each cast skill's action
 * @returns {{ paths, actions, replaced: Map<string, object | null> (null: the action leaves the loop), seriesKeys: string[], items: [{ key, mainKey, mainPath, netPath, usesPerCast, mainShare }],
 *   layers, assumptions } | null}
 */
export function compileTriggerMains(planner, { hits, paths, actions, layered, handsSplit = new Map() }) {
  const pairs = loopTriggers(planner, hits);
  if (!pairs.length) return null;
  const out = { paths: {}, actions: [], replaced: new Map(), seriesKeys: [], items: [], layers: [], assumptions: [] };
  const incisive = incisiveState(planner);
  for (const { trigger, main } of pairs) {
    const mainAction = actions.find((action) => action.key === `${main.key}:use`);
    const strike = mainStrike(mainAction, main.key, paths);
    if (!mainAction || !strike) continue;
    const basePath = paths[strike.path];
    const steady = steadyOf(basePath);
    const { combat, rate, erika } = trigger;
    const usesPerCast = erika?.usesPerCast ?? 1;
    const triggeredPerCycle = rate.repeats * combat.perTrigger * usesPerCast;
    if (!(steady > 0) || !(triggeredPerCycle > 0)) continue;
    // The accounting split: the Main Skill's row takes the attacks the casts replace (and the manual penalty), the trigger's net row the rest.
    const mainShare = combat.lostPerCycle / triggeredPerCycle;
    const scale = combat.perTrigger / steady;
    const mainKey = `${trigger.key}:main`, netKey = `${trigger.key}:net`;
    const label = `${trigger.name} (triggers ${main.name}; net)`;
    out.paths[mainKey] = scaled(basePath, mainKey, { source: main.key, label: basePath.label }, scale * mainShare);
    out.paths[netKey] = scaled(basePath, netKey, { source: trigger.key, label, working: { ...(basePath.working || {}), trigger: trigger.name, perTrigger: combat.perTrigger, usesPerCast, mainShare } }, scale * (1 - mainShare));
    out.seriesKeys.push(trigger.key);
    out.items.push({ key: trigger.key, mainKey: main.key, mainPath: mainKey, netPath: netKey, usesPerCast, mainShare });
    // The Main Skill's own on-use events (not the trigger bus's use event: its variants are the Main Skill's manual press), on-hit events and
    // after-hit events, on every triggered use group.
    const live = layered.get(main.key) || null;
    const onUse = (live?.onUse || []).filter((effect) => effect.kind !== "use"), after = live?.after || [];
    const onHit = strike.onHit || [];
    const group = (count) => [...onUse, { kind: "hit", path: mainKey, ...(count !== 1 ? { count } : {}), ...(onHit.length ? { onHit } : {}) }, { kind: "hit", path: netKey, ...(count !== 1 ? { count } : {}) }, ...after];
    const extra = usesPerCast - 1;
    const gain = incisive ? [{ kind: "buff", buff: "incisive", seconds: incisive.durationSeconds }] : [];
    const castEnd = [...gain, ...group(1), ...(extra > 1e-12 ? group(extra) : [])];
    // The sequence as one press (Endless Vendetta's repeats as delays from the press, at their steady times: provisional); the cooldown from the press.
    const cumulative = rate.repeatTimes.reduce((list, value) => [...list, (list[list.length - 1] || 0) + value], []);
    const cooldown = rate.effectiveCooldownSeconds > 0 ? rate.effectiveCooldownSeconds : 0;
    const batch = rate.repeats === 1 && !(cooldown > rate.sequenceSeconds) ? usesPerPlacement(rate.cycleSeconds) : 1;
    const speedKey = live?.speedKey && /^attack:/.test(live.speedKey) ? live.speedKey : null;
    const seconds = rate.sequenceSeconds * batch;
    out.actions.push({
      key: `${trigger.key}:use`, label: `${trigger.name} casts (triggers ${main.name})`, actor: "player", queue: triggerMainQueue(main.key), priority: 0,
      useSeconds: speedKey ? { baseSeconds: seconds * main.rate.speedFactor, speed: speedKey } : seconds,
      ...(cooldown > 0 ? { cooldown: { baseSeconds: cooldown * batch } } : {}),
      ...(cumulative.length > 1 ? { pressEffects: cumulative.slice(0, -1).map((at) => ({ kind: "delay", seconds: at, effects: castEnd })) } : {}),
      effects: repeatEffects(castEnd, batch)
    });
    // Only the uses that take your hands queue behind the casts (2026-11-24; src/vendetta-model.js handsDps): the Main Skill's uses that need
    // no player time (rate.handsFree: outside triggers on their own clocks) run as their own actions (src/tick-plain-skills.js hands split),
    // and Banishment's Steep Strike casts keep the share its free casts launch plus the presses' share of the time the casts leave them
    // (the presses run only in the manual time: (cycle − sequence) ÷ cycle). Without a hands split the whole action queues, as before.
    const split = handsSplit.get(mainAction.key) || null;
    out.replaced.set(mainAction.key, { ...(split?.hands ?? mainAction), queue: triggerMainQueue(main.key), priority: 1 });
    const handsNotes = [];
    if (split) {
      Object.assign(out.paths, split.paths);
      out.actions.push(...split.free);
      if (split.free.length) handsNotes.push(`${split.free.length} stream${split.free.length > 1 ? "s" : ""} of ${main.name} uses that need no player time as their own action${split.free.length > 1 ? "s" : ""} (${split.free.map((action) => action.label).join("; ")})`);
      if (split.steep) {
        const manualShare = rate.cycleSeconds > 0 ? Math.max(0, rate.cycleSeconds - rate.sequenceSeconds) / rate.cycleSeconds : 0;
        const scale = split.steep.freeShare + (1 - split.steep.freeShare) * manualShare;
        if (scale < 1 - 1e-12) {
          out.replaced.set(split.steep.key, scale > 1e-12 ? split.steep.at(scale) : null);
          handsNotes.push(`Banishment's Steep Strike casts at ${round(scale * 100)}% of their rate (${round(split.steep.freeShare * 100)}% launched by the free casts, the rest ride the presses, which keep ${round(manualShare * 100)}% of the time)`);
        }
      }
    }
    // Leisurely Stroll: the manual uses read −X% while Incisive is up (the planner's lostPerCycle holds it as the manual time's Incisive share).
    if (incisive?.penalty) for (const [key, path] of Object.entries(paths)) {
      if ((key !== main.key && path?.source !== main.key) || path?.handsFree) continue;
      out.paths[key] = { ...path, modifiers: [...(path.modifiers || []), { source: incisive.penalty.source, text: incisive.penalty.text, buff: "incisive", layer: "additional", liveKey: "incisive", percent: -incisive.penalty.percent, steadyAmount: 0 }] };
    }
    const manual = rate.cycleSeconds - rate.sequenceSeconds;
    out.layers.push({ key: `triggerMain:${trigger.setupKey ?? trigger.key}`, label: `${trigger.name} triggers ${main.name}`, lines: [], events: `${rate.repeats > 1 ? `${rate.repeats} casts a sequence (the repeats at their steady times from the press)` : "one cast"} of ${round(rate.sequenceSeconds)} s at the Main Skill's live Attack Speed${cooldown > 0 ? `, ${round(cooldown)} s cooldown from the press` : ", no cooldown"}, ahead of ${main.name}'s own uses on one queue (the player's hands)${manual > 1e-9 ? `, which fill the ${round(manual)} s left of each cycle` : ", which never run"}; each cast end lands ${round(usesPerCast)} triggered ${main.name} uses on its layered path at ${round(combat.perTrigger / main.combat.perUse)} × its per-use damage${incisive ? ", after Incisive's gain" : ""}; ${round(mainShare * 100)}% of each to ${main.name}'s row, the rest to the net row (the planner's accounting)${handsNotes.length ? `; ${handsNotes.join("; ")}` : ""}` });
    out.assumptions.push({ id: `tick:triggerMain:${trigger.setupKey ?? trigger.key}`, value: round(usesPerCast), text: `${trigger.name}: a loop action on the player's hands, ahead of ${main.name}'s own uses; each cast lands its triggered ${main.name} uses (${round(usesPerCast)} expected) on the Main Skill's layered path, so the clean dummy's ramp reaches them (open question tick-trigger-main-queue).` });
  }
  return out.actions.length ? out : null;
}
