// Plain player-cast skills on the tick loop (session 3 of research/tick-engine-investigation-2026-10-30.md §7.5; status and the reference
// runs: research/tick-engine-prototype-2026-10-31.md). Read-only and pure, like src/tick-ledger.js, its only importer. Rates, per-use
// damage and counts are the planner's; this module only places them on ticks, so with every reading at its default a skill's whole-run
// damage is the planner's, and a difference comes from time.
//
// Use models, read from hit.rate (src/skill-hit-model.js):
// - cast (Spells and attacks alike): one use per interval through the same phases; attack speed is in the effective use time. A cooldown
//   or an area longer than the use time waits from the press (user decision 2026-10-22: 1 s use, 3 s cooldown: uses at 1 s and 4 s).
// - area (Terra, Sentry): the use lands the area; its ticks fall every N s over its life, read from the component's hitsDetail. The
//   planner's count is fractional (Flame Jet: 8.5714 ticks), so the whole ticks deal their real value and the part of a tick left over
//   lands as the area ends (reading `areaTicks`, default "planner"; "whole" drops it, "fromCast" starts the ticks at the cast). A part
//   that deals one hit lands at the use, or at the area's end when its note says so (Flame Jet's eruption).
// - channel: one event per hit at hit.rate.hitsPerSecond, because the blades of Ring of Blades do not follow Cast Speed (run 2026-10-11).
// - combo cycle: one step per attack with its own attack time, each step dealing its own components (the profile's cycle.steps; a support
//   that changes one step's time is not exposed by the hit, so the steps scale together: provisional).
// Demolisher Charge runs live on a cast skill: a charge every N s, held to the next hit, which reads the skill's bonus in full and spends
// it. The ledger's average line is taken out, as a Youga layer does. The opening charge follows prebuiltSelfBuffs (provisional).
//
// Skill DoTs with one strongest application go on the loop too, through the ailment program (src/tick-ailments.js): the recount's own values,
// Affliction live. A DoT's Reap is a series of its own there.

const TICK_DETAIL = /^([\d.]+) ticks \(every ([\d.]+) s over ([\d.]+) s\)/;
const ENDS_THE_AREA = /\bwhen the .* ends\b/i;
const SHARE_OF_USES = /× [\d.]+ share of (?:cycles|uses)/;

export const AREA_TICK_READINGS = Object.freeze(["planner", "whole", "fromCast"]);

/** The use model a hit runs on the loop, or null when it stays a static stream (triggers, bombs, release cycles, rate models). */
export function plainUseKind(hit) {
  const rate = hit?.rate;
  if (!(rate?.usesPerSecond > 0) || rate.rateComponents?.length || rate.trigger || rate.bombs) return null;
  if (rate.terraDurationSeconds > 0) return "area";
  const model = String(rate.useModel || "");
  if (model === "cast") return "cast";
  if (model === "combo cycle") return hit.profile?.cycle?.steps?.length ? "cycle" : null;
  return /^channel \(/.test(model) ? "channel" : null;
}

const firstUseField = (rate) => Number.isFinite(rate.firstUseSeconds) && rate.firstUseSeconds >= 0 ? { firstUseSeconds: rate.firstUseSeconds } : {};
export const timerField = (readings) => readings.castOvershoot && readings.castOvershoot !== "carry" ? { timer: readings.castOvershoot } : {};

// One use per planner interval: the use time, and a wait from the press when the interval is longer. With a live Cast Speed (src/tick-layers.js:
// Aim, Spell Aggression, Periodic Burst, Agility Blessing) the use time is read at each press: base × the planner's static factor ÷ the speed now,
// which at the steady amounts is the planner's own use time; a cooldown wait keeps the planner's period.
function useTiming(hit, speedKey = null) {
  const { rate } = hit, period = 1 / rate.usesPerSecond, use = rate.effectiveUseTimeSeconds;
  const waits = use > 0 && period > use * (1 + 1e-9);
  const seconds = waits ? use : period;
  const useSeconds = speedKey ? { baseSeconds: seconds * rate.speedFactor, speed: speedKey } : seconds;
  return { useSeconds, ...(waits ? { cooldown: { baseSeconds: period } } : {}), ...firstUseField(rate) };
}

const componentOf = (hit, part) => hit.components[Number(String(part.key).split("#")[1])] ?? null;
const baseKey = (key) => String(key).split(/[+>]/)[0];

// A path over some of a skill's parts: the same series, its own events.
const subPath = (path, key, parts) => ({ ...path, key, source: path.key, parts, modifiers: (path.modifiers || []).filter((modifier) => !modifier.parts || modifier.parts.some((name) => parts.some((part) => part.key === name))) });

const later = (seconds, effect) => seconds > 0 ? { kind: "delay", seconds, effects: [effect] } : effect;
// The layers' on-hit events on an area's hits, wherever the delay puts them.
const withOnHit = (effect, onHit) => effect.kind === "hit" ? { ...effect, onHit: [...(effect.onHit || []), ...onHit] } : effect.effects ? { ...effect, effects: effect.effects.map((inner) => withOnHit(inner, onHit)) } : effect;

// Tick times of one component of an area, each with its share of the planner's per-use count.
function tickTimes(detail, reading) {
  const every = Number(detail[2]), over = Number(detail[3]), total = over / every;
  if (reading === "fromCast") return Array.from({ length: Math.ceil(total - 1e-9) }, (_, index) => ({ seconds: index * every, share: 1 / total }));
  const whole = Math.floor(total + 1e-9), rest = total - whole;
  const ticks = Array.from({ length: whole }, (_, index) => ({ seconds: (index + 1) * every, share: 1 / total }));
  return reading === "planner" && rest > 1e-9 ? [...ticks, { seconds: over, share: rest / total }] : ticks;
}

function areaEffects(hit, path, reading, paths) {
  const effects = [], counts = [];
  path.parts.forEach((part, index) => {
    const component = componentOf(hit, part);
    const detail = String(component?.hitsDetail ?? "").match(TICK_DETAIL);
    const key = `${hit.key}:part${index}`;
    paths[key] = subPath(path, key, [part]);
    if (detail) {
      const ticks = tickTimes(detail, reading);
      for (const tick of ticks) effects.push(later(tick.seconds, { kind: "hit", path: key, count: tick.share }));
      counts.push(`${component.label}: ${ticks.length} events, every ${detail[2]} s over ${detail[3]} s`);
    } else effects.push(later(ENDS_THE_AREA.test(component?.note ?? "") ? hit.rate.terraDurationSeconds : 0, { kind: "hit", path: key }));
  });
  return { effects, text: counts.join("; ") };
}

function cycleSteps(hit, path, paths) {
  const { rate } = hit, scale = rate.intervalSeconds / rate.useTimeSeconds;
  const mapped = new Set();
  const steps = hit.profile.cycle.steps.map((step, index) => {
    const parts = path.parts.filter((part) => { const component = componentOf(hit, part); return component && step.keys.includes(baseKey(component.key)); });
    parts.forEach((part) => mapped.add(part));
    return { index, step, parts };
  });
  return steps.map(({ index, step, parts }) => {
    // A part no step names (added flat damage) lands with the last step.
    const list = index === steps.length - 1 ? [...parts, ...path.parts.filter((part) => !mapped.has(part))] : parts;
    const key = `${hit.key}:step${index + 1}`;
    paths[key] = subPath(path, key, list);
    return { useSeconds: step.seconds * scale, label: `${hit.name} step ${index + 1}`, effects: [{ kind: "hit", path: key, ...(step.share !== undefined ? { count: step.share } : {}) }] };
  });
}

// Demolisher Charge: a line "… × 0.2222 share of cycles" comes out of the static product and goes back in full while a charge is held.
function demolisherLayer(planner, hit, path, reading) {
  const every = hit.profile?.demolisher?.everySeconds, share = hit.rate.demolisherShare;
  if (!(every > 0) || !(share > 0) || hit.components.some((component) => component.demolisher?.gated)) return null;
  const parts = path.parts.map((part) => ({ ...part })), modifiers = [], lines = [];
  for (const part of parts) {
    const component = componentOf(hit, part);
    for (const line of [...(component?.additional || []), ...(component?.combatAdditional || [])]) {
      if (!SHARE_OF_USES.test(line.text)) continue;
      part.additionalFactor /= 1 + line.value / 100;
      modifiers.push({ source: line.source, text: line.text, buff: "demolisher", layer: "additional", parts: [part.key], percent: line.value / share, steadyAmount: line.value });
      lines.push({ layer: "additional", source: line.source, text: line.text, value: line.value });
    }
  }
  if (!modifiers.length) return null;
  const opening = reading ?? (planner.conditions?.prebuiltSelfBuffs !== false ? "banked" : "empty");
  return {
    path: { ...path, parts, modifiers: [...(path.modifiers || []), ...modifiers] },
    periodic: { key: `demolisher:${hit.setupKey ?? hit.key}`, actor: "player", label: `${hit.name}: Demolisher Charge`, intervalSeconds: every, ...(opening === "banked" ? {} : { startFrame: Math.round(every * 30) + 1 }), effects: [{ kind: "buff", buff: "demolisher", seconds: Infinity, stacks: 1, maxStacks: 1 }] },
    onHit: [{ kind: "consume", buff: "demolisher" }],
    report: { key: "demolisher", label: "Demolisher Charge", lines, events: `one charge every ${every} s${opening === "banked" ? ", the first banked at engagement" : ", none banked"}, held to the next hit, which reads the bonus in full and spends it` }
  };
}

function dotProgram(dot) {
  const { steadyDps, uptime } = dot.combat;
  return {
    path: { label: dot.name, kind: "dot", parts: [{ key: "dot", type: dot.damageType, base: steadyDps / uptime, increasedPercent: 0, additionalFactor: 1 }], modifiers: [], working: { skill: dot.name, level: dot.level, activeDps: steadyDps / uptime, durationSeconds: dot.durationSeconds, stacking: dot.combat.stacking } },
    spec: { key: dot.key, path: dot.key },
    effect: { kind: "dot", dot: dot.key, seconds: dot.durationSeconds }
  };
}

// A strongest-application skill DoT: the loop can carry it. Its Affliction is live and its Reap is a series of its own (session 4).
export function plainDot(planner, dot) {
  const combat = dot?.combat;
  return Boolean(dot?.modeled && combat?.stacking === "strongest" && combat.uptime > 0 && dot.applicationsPerSecond > 0);
}

/**
 * The tick program of the build's plain skills. Writes nothing: `paths` is a copy the caller merges.
 * @param {object} planner calculatePlanner's result (read only)
 * @param {object[]} hits the modeled hits to place, each with a plainUseKind
 * @param {Record<string, object>} staticPaths the static path of each hit (src/tick-ledger.js hitPath)
 * @param {object} [readings] castOvershoot: "carry" | "drop"; areaTicks: AREA_TICK_READINGS; demolisherOpening: "banked" | "empty"
 * @param {object} [ailmentProgram] src/tick-ailments.js: a skill DoT it holds lands through its dotEffect
 * @returns {{ paths, actions, periodics, dots, layers, assumptions }}
 */
export function compilePlainProgram(planner, hits, staticPaths, readings = {}, ailmentProgram = null, layered = new Map()) {
  const paths = {}, actions = [], periodics = [], dots = [], layers = [], assumptions = [];
  const skillDots = (planner.skillDots || []).filter((dot) => plainDot(planner, dot));
  const dotFor = (setupKey) => skillDots.filter((dot) => dot.setupKey === setupKey);
  const placedDots = new Set();
  const placeDot = (dot) => {
    placedDots.add(dot);
    const effect = ailmentProgram?.dotEffect(dot);
    if (effect) return effect;
    const compiled = dotProgram(dot);
    paths[dot.key] = compiled.path;
    dots.push(compiled.spec);
    return compiled.effect;
  };
  for (const hit of hits) {
    const kind = plainUseKind(hit), { rate } = hit;
    // The general layers' path (src/tick-layers.js): its parts and modifiers, and the events its uses and hits fire.
    const live = layered.get(hit.key) || null;
    let path = live?.path || staticPaths[hit.key];
    const demolisher = kind === "cast" ? demolisherLayer(planner, hit, path, readings.demolisherOpening) : null;
    if (demolisher) { path = demolisher.path; periodics.push(demolisher.periodic); layers.push(demolisher.report); }
    paths[hit.key] = path;
    const onHit = [...(demolisher?.onHit || []), ...(live?.onHit || [])], onUse = live?.onUse || [], after = live?.after || [];
    const strike = { kind: "hit", path: hit.key, ...(onHit.length ? { onHit } : {}) };
    const dotEffects = dotFor(hit.setupKey).filter((dot) => Math.abs(dot.applicationsPerSecond / rate.usesPerSecond - 1) < 1e-9).map(placeDot);
    const base = { key: `${hit.key}:use`, label: `${hit.name} uses`, actor: "player", ...timerField(readings) };
    const speedKey = live?.speedKey || null;
    if (kind === "cycle") {
      const steps = cycleSteps(hit, path, paths).map((step) => ({ ...step, ...(speedKey ? { useSeconds: { baseSeconds: step.useSeconds * rate.speedFactor, speed: speedKey } } : {}), effects: [...onUse, ...step.effects.map((effect) => effect.kind === "hit" && onHit.length ? { ...effect, onHit } : effect), ...after] }));
      actions.push({ ...base, steps });
      assumptions.push({ id: `tick:plain:${hit.setupKey}`, value: kind, text: `${hit.name}: a cycle of ${steps.length} attacks, each landing its own components at its end (the steps scale together with the planner's interval: provisional).` });
    } else if (kind === "channel") {
      const count = 1 / rate.hitsPerUse;
      actions.push({ ...base, useSeconds: 1 / rate.hitsPerSecond, ...firstUseField(rate), effects: [...onUse, { ...strike, ...(count !== 1 ? { count } : {}) }, ...after, ...dotEffects] });
      assumptions.push({ id: `tick:plain:${hit.setupKey}`, value: kind, text: `${hit.name}: ${rate.hitsPerSecond} hits/s, one event per hit; full channeled stacks from engagement (a cold start is not on the loop).` });
    } else if (kind === "area") {
      const area = areaEffects(hit, path, readings.areaTicks ?? "planner", paths);
      actions.push({ ...base, ...useTiming(hit, speedKey), effects: [...onUse, ...(onHit.length ? area.effects.map((effect) => withOnHit(effect, onHit)) : area.effects), ...after, ...dotEffects] });
      assumptions.push({ id: `tick:plain:${hit.setupKey}`, value: readings.areaTicks ?? "planner", text: `${hit.name}: the use lands a ${rate.terraDurationSeconds} s area. ${area.text} (open question tick-area-ticks).` });
    } else {
      actions.push({ ...base, ...useTiming(hit, speedKey), effects: [...onUse, strike, ...after, ...dotEffects] });
      assumptions.push({ id: `tick:plain:${hit.setupKey}`, value: kind, text: `${hit.name}: one use per ${Math.round(1e4 / rate.usesPerSecond) / 1e4} s, the hit landing as the use ends${speedKey ? ", its use time read at the press from the live Cast Speed" : ""}.` });
    }
  }
  // A skill that only applies a DoT (Frost Terra): its casts, at the planner's rate.
  for (const dot of skillDots) {
    if (placedDots.has(dot) || hits.some((hit) => hit.setupKey === dot.setupKey) || staticPaths[`hit:${dot.setupKey}`]) continue;
    const effect = placeDot(dot);
    actions.push({ key: `${dot.key}:use`, label: `${dot.name} casts`, actor: "player", useSeconds: 1 / dot.applicationsPerSecond, ...(Number.isFinite(dot.firstApplicationSeconds) ? { firstUseSeconds: dot.firstApplicationSeconds } : {}), ...timerField(readings), effects: [effect] });
  }
  for (const dot of placedDots) assumptions.push({ id: `tick:plain:${dot.key}`, value: dot.durationSeconds, text: `${dot.name}: ${Math.round(dot.combat.steadyDps / dot.combat.uptime * 100) / 100} DPS while active, ${dot.durationSeconds} s from each application, first settling on the next tick.` });
  return { paths, actions, periodics, dots, layers, assumptions };
}
