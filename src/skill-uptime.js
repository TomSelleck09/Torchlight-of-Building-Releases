// Skill uptime for the hover tooltips (user request 2026-11-15: "show skills in their hover tooltip what their uptime is"). Display
// only: this module reads figures the planner has already computed and never feeds a calculation. One entry per board setup the
// planner can say something about:
//   { sustained (0–1, or null for a triggered skill: it takes none of your time), window5?, window20?, window60? (0–1: the first 5 s, 20 s and
//     60 s of the fight, where a schedule the planner holds or the tick engine's loop (planner.buffUptime, engineBuffUptime below) gives one),
//     stacks? (an Aura's own stacks on the loop: { label, max, sustained, window5, window20, window60 } as shares of max), kind ("always" | "buff" | "debuff" | "pressed" | "triggered" | "channel"), cadence, reason }
// Sources: Auras and Focus skills (held while on the board), Empower / Warcry buffs and hit debuffs (src/empower-effects.js,
// src/empower-buffs.js: uptime and the periodic schedule the windows read), Aim (src/aim-model.js), Elixirs (src/elixir-model.js active
// share), curses on the dummy (src/curse-limit.js), the press rotation (src/press-schedule.js: a pressed skill's share of your time and
// its interval), Periodic Burst (src/periodic-burst.js, on the Mobility skill it supports), triggered skills' uses per second and
// channels. Also (2026-11-15, "like Delayed Pain"): summons (kind "summon": the Minions out from planner.minions, count and ramp),
// Sentries (kind "sentry": deployed share from the Sentry use model, the skill hit's Sentry duration × uses per second), Defensive
// skills (their buff's modeled uptime, planner.defensiveBuffs from src/defensive-buffs.js; Aegis of Fire adds the Effective HP
// best case of src/aegis-of-fire.js), Elixirs in Sage's Scent Bottles, the trait-granted skills (Vendetta / Endless Vendetta from the
// Vendetta model's casts, planner.triggerSkills; Youga's Stasis Vault, Selves of All Realms and Supreme Descent from
// planner.yougaUltimateOne) and, last, the press rotation's own word for any other board skill (not pressed, or triggered).
//
// This module is pure: it never mutates the planner.

import { scheduleEdges, scheduleLevelAt } from "./timed-effects.js";
import { aegisOfFireState, AEGIS_OF_FIRE } from "./aegis-of-fire.js";

const finite = (value) => Number.isFinite(value);
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;
const seconds = (value) => `${Math.round(value * 100) / 100} s`;
const percentText = (share) => `${Math.round(share * 1000) / 10}%`;

// Time average of a schedule's level over [0, horizon) (piecewise constant: each segment read at its midpoint).
function windowLevel(schedule, horizon) {
  if (!schedule || !(horizon > 0)) return null;
  const edges = [0, ...scheduleEdges(schedule, horizon), horizon];
  let total = 0;
  for (let index = 1; index < edges.length; index++) {
    const from = edges[index - 1], to = edges[index];
    if (to > from) total += (to - from) * Math.min(1, scheduleLevelAt(schedule, (from + to) / 2));
  }
  return round(clamp01(total / horizon));
}

// The opening windows of one schedule: the 5 s and 20 s windows and the 60 s recount timeline (the tick engine's length).
const scheduleWindows = (schedule) => ({ window5: windowLevel(schedule, 5), window20: windowLevel(schedule, 20), window60: windowLevel(schedule, 60) });

function windowsOf(entry) {
  const periodic = (entry?.timed || []).map((part) => part?.schedule).find((schedule) => schedule?.kind === "periodic");
  if (!periodic) return {};
  return scheduleWindows(periodic);
}

const ENGINE_LABELS = { aim: "Aim", periodicBurst: "Periodic Burst", focus: "Focus Blessing", agility: "Agility Blessing", tenacity: "Tenacity Blessing", curse: "Curse",
  spellAggression: "Spell Aggression", tidewell: "Tidewell", paralysis: "Paralysis", frail: "Frail", frostbite: "Frostbite", mark: "Mark", trueFlame: "True Flame Immolation" };

/**
 * The tick engine's buffs over the opening windows (display only, 2026-11-15; the skill tooltips' build-up): run.buffs (the whole run) and
 * run.buffWindows (the first 5 s and 20 s, src/tick-engine.js) → { [buffKey]: { label, measure ("uptime" | "stacks"), max, setupKey, window5,
 * window20, window60 } }. A value is the share of ticks the buff was held, or for stacks the average stacks ÷ max (Cruelty's Aura stacks, the
 * Minions a summon keeps out). setupKey names the board skill the buff belongs to (Aim, the Mobility skill Periodic Burst supports, the Aura
 * whose own stacks these are, the summon, the curse Preparation casts), else null. Read-only on both.
 */
export function engineBuffUptime(planner, run) {
  const out = {};
  const whole = run?.buffs || {}, windows = run?.buffWindows || {};
  const seconds = Number(run?.seconds) || 60;
  const setups = planner?.activation?.setups || [];
  const setupNamed = (name) => setups.find((setup) => setup?.name === name && setup.enabled !== false)?.setupKey ?? null;
  const auras = new Map((planner?.aura?.entries || []).filter((entry) => entry?.ownStackEffect?.maxStacks > 0).map((entry) => [`auraStacks:${entry.name}`, entry]));
  const minions = new Map((planner?.minions || []).filter((minion) => minion?.key).map((minion) => [`${minion.key}:out`, minion]));
  const burst = (planner?.periodicBurst?.entries || []).find((entry) => entry?.active && entry.setupKey);
  const curseSkill = planner?.curseLimit?.active?.[0] ?? null;
  for (const [key, held] of Object.entries(whole)) {
    const aura = auras.get(key), minion = minions.get(key);
    const measure = aura || minion ? "stacks" : "uptime";
    const max = aura ? Number(aura.ownStackEffect.maxStacks) : minion ? Number(minion.count) || 1 : 1;
    const read = (item) => item ? round(clamp01(measure === "stacks" ? (Number(item.averageStacks) || 0) / max : Number(item.uptime) || 0)) : null;
    const setupKey = aura ? setupNamed(aura.name) : minion ? (minion.setupKeys || [])[0] ?? null : key === "aim" ? setupNamed("Aim") : key === "periodicBurst" ? burst?.setupKey ?? null : key === "curse" && curseSkill ? setupNamed(curseSkill) : null;
    out[key] = { label: aura ? `${aura.name} stacks` : minion ? `${minion.name} out` : ENGINE_LABELS[key] || key, measure, max, setupKey,
      window5: read(windows[5]?.[key] ?? (windows[5] ? { uptime: 0, averageStacks: 0 } : null)), window20: read(windows[20]?.[key] ?? (windows[20] ? { uptime: 0, averageStacks: 0 } : null)), window60: seconds >= 60 ? read(held) : null };
  }
  return out;
}

function shortTrigger(cadence) {
  const text = String(cadence || "");
  const match = text.match(/^(triggered by [^,(]+?) every\b/i);
  if (match) return match[1];
  if (/cooldown/i.test(text)) return "cast on cooldown";
  return null;
}

function empowerEntry(entry) {
  const timing = entry.euphoria || {};
  const uptime = finite(entry.uptime) ? clamp01(entry.uptime) : entry.active ? 1 : 0;
  const kind = entry.kind === "debuff" ? "debuff" : "buff";
  if (!entry.active) return { sustained: 0, kind, cadence: "not active", reason: String(entry.reason || entry.text || "inactive").split(";")[0] };
  const duration = Number(timing.durationSeconds), period = Number(timing.periodSeconds);
  const label = entry.kind === "debuff" ? "debuff on the dummy" : entry.kind === "warcry" ? "Warcry buff" : "buff";
  const cadence = duration > 0 && period > 0 ? `${seconds(duration)} ${label}, recast every ${seconds(period)}` : uptime >= 1 - 1e-9 ? "held" : label;
  const how = shortTrigger(timing.cadence) || (entry.item?.source ? `triggered by ${entry.item.source}` : null);
  const reason = duration > 0 && period > 0
    ? `uptime min(1, ${seconds(duration)} ÷ ${seconds(period)})${how ? `; ${how}` : ""} (Empower model, provisional)`
    : entry.kind === "debuff" ? "hit debuff on the dummy (Empower model, provisional)" : "held for the fight (Empower model, provisional)";
  return { sustained: round(uptime), ...windowsOf(entry), kind, cadence, reason };
}

const plural = (count, word) => `${round(count, 2)} ${word}${Math.abs(count - 1) < 1e-9 ? "" : "s"}`;

// The Minions a summon setup keeps out (planner.minions: count, troop max and ramp, summon cast, first hit).
function summonEntry(minions) {
  const count = minions.reduce((sum, minion) => sum + (Number(minion.count) || 0), 0);
  const troop = minions.find((minion) => minion.troopCount)?.troopCount || null;
  const max = troop ? minions.reduce((sum, minion) => sum + (Number(minion.troopCount?.max) || Number(minion.count) || 0), 0) : count;
  const names = minions.map((minion) => minion.name).filter(Boolean).join(", ");
  const parts = [];
  if (troop?.off) parts.push(`one Minion per summon (the Synthetic Troop max switch is off)`);
  else if (troop && Number(troop.fullAtSeconds) > 0) parts.push(`one ${names} every ${seconds(Number(troop.rampIntervalSeconds) || 0)}, all ${max} out at ${seconds(Number(troop.fullAtSeconds))} (own buffs not pre-built); the sustained figure holds the max`);
  else if (troop) parts.push(`own buffs pre-built: ${plural(count, "Minion")} out once the summon cast ends, held after that`);
  else parts.push(`${names} stays out while the summon is on the board`);
  const first = minions.map((minion) => minion.cycle).find((cycle) => Number(cycle?.firstHitSeconds) > 0);
  if (first) parts.push(`first hit at ${seconds(first.firstHitSeconds)}${Number(first.summonCastSeconds) > 0 ? `, after the ${seconds(first.summonCastSeconds)} summon cast` : ""}`);
  if (!minions.some((minion) => minion.modeled)) parts.push("no modeled damage");
  return { sustained: 1, kind: "summon", cadence: `${plural(count, "Minion")} out${max > count + 1e-9 ? ` (max ${round(max, 2)})` : ""}`, reason: `${parts.join("; ")} (Minion model)` };
}

// Youga – The Ultimate One's trait skills (planner.yougaUltimateOne: the solved Vault / Selves / Descent timings).
function yougaTraitEntry(youga, key) {
  const skills = youga?.traitSkills || {};
  const which = ["vault", "selves", "descent"].find((name) => skills[name]?.setupKey === key);
  if (!which) return null;
  const own = skills[which];
  const pressed = skills.pressed !== false;
  if (!own.active) return { sustained: 0, kind: which === "descent" ? "pressed" : "buff", cadence: "not active", reason: "the skill is not active on the board" };
  if (!pressed) return { sustained: 0, kind: which === "descent" ? "pressed" : "buff", cadence: "never pressed", reason: "the Trait Skill switch is off (never pressed)" };
  if (which === "descent") {
    const cooldown = Number(youga.descent?.cooldown);
    return { sustained: null, kind: "pressed", cadence: cooldown > 0 ? `pressed every ${seconds(cooldown)}` : "pressed on cooldown", reason: "Trait Skill pressed on cooldown (Youga – The Ultimate One model, provisional)" };
  }
  const state = which === "vault" ? youga.vault : youga.selves;
  if (!state) return { sustained: 0, kind: "buff", cadence: "not active", reason: "not solved (no Clockwork Core skill)" };
  const uptime = clamp01(Number(state.uptime) || 0), cooldown = Number(state.cooldown), duration = Number(state.duration);
  if (state.permanent) return { sustained: 1, kind: "buff", cadence: "held", reason: `its extensions (${round(Number(state.extensionRate) || 0, 3)} s per s) outlast the ${seconds(cooldown)} cooldown (Youga – The Ultimate One model, provisional)` };
  return { sustained: round(uptime), kind: "buff", cadence: duration > 0 && cooldown > 0 ? `${seconds(duration)} buff, recast every ${seconds(cooldown)}` : "buff",
    reason: `uptime min(1, ${seconds(duration)} ÷ ${seconds(cooldown)}); Trait Skill pressed on cooldown${Number(state.baseCooldown) > cooldown + 1e-9 ? ` (base ${seconds(Number(state.baseCooldown))}, shortened by the Clockwork Core's crits)` : ""} (Youga – The Ultimate One model, provisional)` };
}

// Vendetta / Endless Vendetta (src/vendetta-model.js via planner.triggerSkills): cast back to back, each cast triggering the Main Skill.
function vendettaEntry(trigger) {
  if (!trigger.modeled || !trigger.rate) return { sustained: 0, kind: "pressed", cadence: "not active", reason: String(trigger.inactiveReason || "no Main Skill hit to trigger") };
  const cycle = Number(trigger.rate.cycleSeconds), busy = Number(trigger.rate.sequenceSeconds) || Number(trigger.rate.effectiveUseTimeSeconds) || 0;
  const share = cycle > 0 ? clamp01(busy / cycle) : 1;
  const main = trigger.main?.name || "the Main Skill";
  return { sustained: round(share), kind: "pressed", cadence: cycle > 0 ? `cast every ${seconds(cycle)}` : "cast nonstop",
    reason: `${round(Number(trigger.rate.triggersPerSecond) || 0, 3)} triggers of ${main}/s (${trigger.rate.repeats || 1} per cast)${Number(trigger.rate.effectiveCooldownSeconds) > 0 ? `; ${seconds(Number(trigger.rate.effectiveCooldownSeconds))} cooldown` : ""}; its casts take the time ${main} would attack (Vendetta model, provisional)` };
}

// A Defensive skill (Delayed Pain, Defensive Buffer, Frost Shield, …): its buff's modeled uptime (src/defensive-buffs.js, planner.defensiveBuffs:
// Split duration against its trigger or press interval and cooldown; 2026-11-15); with no model entry, held while on the board.
function defensiveModelEntry(model) {
  if (model.held) return { sustained: 1, kind: "buff", cadence: model.cadence || "held (best case)", reason: model.reason };
  // Its windows: the buff from its first use at engagement (skills start ready), then every period (no damage figure reads it, so it is not on the loop).
  const duration = Number(model.durationSeconds), period = Number(model.periodSeconds);
  const windows = duration > 0 && period > 0 ? scheduleWindows({ kind: "periodic", durationSeconds: duration, periodSeconds: period, startSeconds: 0 }) : {};
  return { sustained: round(clamp01(Number(model.uptime) || 0)), ...windows, kind: "buff", cadence: model.cadence, reason: `${model.reason} (Defensive buff model, provisional)` };
}
function defensiveEntry(setup, input) {
  const trigger = input?.kind === "triggered" ? input.reason : null;
  const ready = (setup.supportEffects?.clauses || []).find((clause) => clause.family === "trigger" && /^triggered whenever ready/.test(String(clause.reason || "")));
  const how = ready ? `triggered by ${ready.support} ${String(ready.reason).split(": ")[0].replace(/^triggered /, "")}: takes none of your time` : trigger;
  return { sustained: 1, kind: "buff", cadence: "held (best case)", reason: `a Defensive skill: no damage figure reads its buff, so it is held while it is on the board (best case, no uptime model)${how ? `; ${how}` : ""}` };
}

// Aegis of Fire (src/aegis-of-fire.js, the Effective HP and block readers' state): duration ÷ recast, read as up when a hit lands.
function aegisEntry(aegis) {
  if (!aegis.requested) return { sustained: 0, kind: "buff", cadence: "switched off", reason: "the \"Aegis of Fire active (Effective HP)\" condition is off: Effective HP and the block readers leave it out" };
  const duration = Number(aegis.durationSeconds), recast = Number(aegis.recastSeconds);
  return { sustained: round(clamp01((Number(aegis.uptimePercent) || 0) / 100)), kind: "buff", cadence: duration > 0 && recast > 0 ? `${seconds(duration)} buff, recast every ${seconds(recast)}` : "buff",
    reason: `${aegis.summary}; Effective HP and the block readers take it as up when a hit lands (best case, listed in the assumptions)` };
}

// A Sentry (the skill hit's Sentry use model: recast on expiry, or triggered): the share of the fight it stands deployed.
function sentryEntry(hit) {
  const rate = hit.rate || {};
  const duration = Number(rate.terraDurationSeconds) || 0, uses = Number(rate.usesPerSecond) || 0, count = Number(rate.sentryQuantity?.count) || 1;
  const deployed = duration > 0 && uses > 0 ? clamp01(duration * uses) : 0;
  const triggered = rate.trigger ? `triggered by ${String(rate.trigger.source || "").replace(/^Support: /, "")}` : null;
  return { sustained: round(deployed), kind: "sentry", cadence: `${plural(count, "Sentry").replace(/Sentrys$/, "Sentries")} deployed${uses > 0 ? `, ${triggered ? "recast" : "cast"} every ${seconds(1 / uses)}` : ""}`,
    reason: `a Sentry lasts ${seconds(duration)}; deployed min(1, ${seconds(duration)} × ${round(uses, 3)} uses/s)${triggered ? `; ${triggered}` : "; recast when it expires"} (Sentry use model, provisional)` };
}

const hasTag = (setup, tag) => (setup?.tags || []).includes(tag);
const isActiveName = (planner, name) => { const names = planner?.activation?.activeNames; return names?.has ? names.has(name) : Array.isArray(names) ? names.includes(name) : true; };

/**
 * planner → { [setupKey]: entry } (see the header). Read-only.
 */
export function skillUptime(planner) {
  const out = {};
  const setups = planner?.activation?.setups || [];
  const allocations = planner?.activation?.allocation?.allocations || [];
  const allocationOf = (setup, index) => allocations.find((item) => item.index === index && item.name === setup.name) || null;
  const empowerBySetup = new Map();
  for (const entry of planner?.empowerEffects?.entries || []) {
    if (!entry?.setupKey || entry.superseded) continue;
    const held = empowerBySetup.get(entry.setupKey);
    // One entry per setup: the active one, a buff before a hit debuff.
    if (!held || (entry.active && !held.active) || (entry.active === held.active && held.kind === "debuff" && entry.kind !== "debuff")) empowerBySetup.set(entry.setupKey, entry);
  }
  const elixirBySetup = new Map((planner?.lineEffects?.combat?.elixir?.setups || []).filter((item) => item?.setupKey).map((item) => [item.setupKey, item]));
  // Sage: an Elixir in a Scent Bottle (Active slot 2 / 3) is the bottle's entry ("sage:basicScentBottle", "sage:specialScentBottle").
  const bottleElixirs = (planner?.lineEffects?.combat?.elixir?.setups || []).filter((item) => /^sage:/.test(String(item?.setupKey || "")));
  const minionsBySetup = new Map();
  for (const minion of planner?.minions || []) for (const key of minion?.setupKeys || []) minionsBySetup.set(key, [...(minionsBySetup.get(key) || []), minion]);
  const triggerBySetup = new Map((planner?.triggerSkills || []).filter((item) => item?.setupKey).map((item) => [item.setupKey, item]));
  let aegis = null;
  const aegisState = () => { if (!aegis) { try { aegis = aegisOfFireState(planner); } catch { aegis = { onBoard: false }; } } return aegis; };
  const pressBySetup = planner?.pressRotation?.bySetup || {};
  const pressInputs = new Map((planner?.hitRateFacts?.pressInputs?.skills || []).filter((item) => item?.key).map((item) => [item.key, item]));
  const periodicBySetup = new Map((planner?.periodicBurst?.entries || []).filter((item) => item?.setupKey && item.active).map((item) => [item.setupKey, item]));
  const hitBySetup = new Map((planner?.skillHits || []).filter((hit) => hit?.modeled && hit.setupKey).map((hit) => [hit.setupKey, hit]));
  const curses = planner?.curseLimit || {};
  const defensiveBySetup = new Map((planner?.defensiveBuffs || []).filter((item) => item?.setupKey).map((item) => [item.setupKey, item]));
  const aim = planner?.aim || null;
  const mainKey = planner?.mainSkill?.setupKey ?? null;
  const engine = planner?.buffUptime || {};

  setups.forEach((setup, index) => {
    const key = setup?.setupKey;
    if (!key || out[key]) return;
    const role = setup.role || allocationOf(setup, index)?.role || null;
    const isAura = role === "aura" || hasTag(setup, "Aura");
    const allocation = allocationOf(setup, index);
    if (setup.enabled === false) {
      const summon = hasTag(setup, "Summon");
      if (isAura || summon || hasTag(setup, "Empower") || hasTag(setup, "Warcry") || hasTag(setup, "Curse") || hasTag(setup, "Elixir") || hasTag(setup, "Defensive")) out[key] = { sustained: 0, kind: summon ? "summon" : isAura ? "always" : hasTag(setup, "Curse") ? "debuff" : "buff", cadence: "switched off", reason: "switched off on the skill board: not counted" };
      return;
    }
    const energyNote = allocation?.status === "insufficient-energy" ? "; past the Energy budget: counted anyway (a warning only)" : "";
    // Summons (a Spirit Magus in an Aura slot too): the Minions out, before the Aura rule.
    const minions = minionsBySetup.get(key);
    if (minions?.length) { const entry = summonEntry(minions); entry.reason += energyNote; out[key] = entry; return; }
    // Trait-granted skills (setup keys "trait:<skill>"): Vendetta's casts, Youga's trait skills.
    const trigger = triggerBySetup.get(key);
    if (trigger && /^trait:/.test(key)) { const entry = vendettaEntry(trigger); entry.reason += energyNote; out[key] = entry; return; }
    const youga = yougaTraitEntry(planner?.yougaUltimateOne, key);
    if (youga) { out[key] = youga; return; }
    // Auras and Focus skills in an Aura slot: held while on the board.
    if (isAura) {
      out[key] = { sustained: 1, kind: "always", cadence: "always active", reason: `${hasTag(setup, "Focus") ? "its Focus buff is held" : "an Aura is held"} while it is on the board${energyNote}` };
      return;
    }
    const empower = empowerBySetup.get(key);
    if (empower) { const entry = empowerEntry(empower); if (energyNote) entry.reason += energyNote; out[key] = entry; return; }
    if (setup.name === "Aim" && aim) {
      const uptime = aim.active ? clamp01((Number(aim.uptimePercent) || 0) / 100) : 0;
      const duration = Number(aim.durationSeconds), recast = Number(aim.recastSeconds ?? aim.cooldownSeconds);
      out[key] = { sustained: round(uptime), kind: "buff", cadence: !aim.active ? "not active" : duration > 0 && recast > 0 ? `${seconds(duration)} buff, recast every ${seconds(recast)}` : "held",
        reason: String(aim.uptimeLabel || (aim.active ? "Aim model" : "Aim inactive")) };
      return;
    }
    const ownElixir = elixirBySetup.get(key);
    const bottled = !ownElixir && hasTag(setup, "Elixir") ? bottleElixirs.find((item) => item.name === setup.name) : null;
    const elixir = ownElixir || bottled;
    if (elixir) {
      const share = clamp01(Number(elixir.activeShare ?? elixir.uptime) || 0), casts = Number(elixir.castsPerSecond) || 0, duration = Number(elixir.durationSeconds) || 0;
      const bottle = bottled ? `in the ${/special/i.test(bottled.setupKey) ? "Special" : "Basic"} Scent Bottle; ` : "";
      out[key] = { sustained: round(share), kind: "buff", cadence: casts > 0 && duration > 0 ? `${seconds(duration)} buff, cast every ${seconds(1 / casts)}` : share >= 1 - 1e-9 ? "held" : "buff",
        reason: `${bottle}${casts > 0 ? `${round(casts, 3)} casts/s from its charges (${round(Number(elixir.progressPerSecond) || 0, 3)} Charging Progress/s); Elixir model` : "Elixir model"}` };
      return;
    }
    if (hasTag(setup, "Curse")) {
      const active = (curses.active || []).includes(setup.name), over = (curses.overLimit || []).includes(setup.name);
      if (active || over) out[key] = { sustained: 1, kind: "debuff", cadence: "held on the dummy", reason: `a curse stays on the dummy once cast${over ? "; over the curse limit: counted anyway" : ""}` };
      return;
    }
    // Defensive skills: Aegis of Fire from its Effective HP state, the others held while on the board (best case).
    const defensiveModel = defensiveBySetup.get(key);
    if (setup.name === AEGIS_OF_FIRE && aegisState().onBoard && aegisState().setupKey === key) {
      const ehp = aegisEntry(aegisState());
      const entry = defensiveModel ? { ...defensiveModelEntry(defensiveModel), reason: `${defensiveModelEntry(defensiveModel).reason}; ${aegisState().requested ? "Effective HP and the block readers take it as up when a hit lands (best case, listed in the assumptions)" : ehp.reason}` } : ehp;
      entry.reason += energyNote; out[key] = entry; return;
    }
    if (hasTag(setup, "Defensive") && !hitBySetup.has(key)) { const entry = defensiveModel ? defensiveModelEntry(defensiveModel) : defensiveEntry(setup, pressInputs.get(key)); entry.reason += energyNote; out[key] = entry; return; }
    // Scorching Beam: the channel's share of your time (the beam cast rate's press share, src/scorching-beam-cast-rate.js).
    if (setup.name === "Scorching Beam" && isActiveName(planner, setup.name) && Number(planner?.beamCastRate?.castsPerSecond) > 0) {
      const share = clamp01(Number(planner.beamCastRate.pressShare) || 1);
      out[key] = { sustained: round(share), kind: "channel", cadence: share >= 1 - 1e-9 ? "channeled nonstop" : `channeled ${percentText(share)} of your time`, reason: `${round(Number(planner.beamCastRate.castsPerSecond), 3)} beam casts/s${share < 1 - 1e-9 ? "; the other pressed skills take the rest (rotation estimate, provisional)" : ""}` };
      return;
    }
    const hit = hitBySetup.get(key);
    const press = pressBySetup[key], input = pressInputs.get(key), burst = periodicBySetup.get(key);
    const burstLoop = burst ? engine.periodicBurst : null;
    const burstWindows = burstLoop?.setupKey === key ? [["5 s", burstLoop.window5], ["20 s", burstLoop.window20], ["60 s", burstLoop.window60]].filter(([, value]) => finite(value)) : [];
    const burstNote = burst ? `; Periodic Burst ${percentText(clamp01(Number(burst.uptime) || 0))} (${seconds(Number(burst.durationSeconds) || 0)} every ${seconds(Number(burst.periodSeconds) || 0)}${burstWindows.length ? `; on the loop ${burstWindows.map(([label, value]) => `${label} ${percentText(value)}`).join(" · ")}` : ""})` : "";
    const useModel = String(hit?.rate?.useModel || "");
    if (hit?.rate?.sentryQuantity && Number(hit.rate.terraDurationSeconds) > 0) {
      const entry = sentryEntry(hit);
      const share = press?.pressEverySeconds > 0 ? clamp01((Number(press.pressSeconds) || 0) / Number(press.pressEverySeconds)) : finite(press?.share) ? clamp01(press.share) : null;
      if (share != null) entry.reason += `; casting it takes ${percentText(share)} of your time (rotation estimate, provisional)`;
      entry.reason += burstNote + energyNote;
      out[key] = entry;
      return;
    }
    if (press?.pressEverySeconds > 0) {
      const every = Number(press.pressEverySeconds), each = Number(press.pressSeconds) || 0;
      const why = input?.cadence || /pressed for its buffs/.test(input?.reason || "") ? "a Mobility skill pressed for its buffs" : input?.reason || "pressed when needed";
      out[key] = { sustained: round(clamp01(each / every)), kind: "pressed", cadence: `pressed every ${seconds(every)}`, reason: `${seconds(each)} a press, its share of your time; ${why}${burstNote} (rotation estimate, provisional)` };
      return;
    }
    if (/^channel/.test(useModel)) {
      const share = finite(press?.share) ? clamp01(press.share) : 1;
      out[key] = { sustained: round(share), kind: "channel", cadence: share >= 1 - 1e-9 ? "channeled nonstop" : `channeled ${percentText(share)} of your time`, reason: share >= 1 - 1e-9 ? "channeled for the whole fight" : "the other pressed skills take the rest (rotation estimate, provisional)" };
      return;
    }
    const bySource = hit?.rate?.usesBySource;
    const uses = Number(hit?.rate?.usesPerSecond) || 0;
    const triggered = hit && ((bySource && !(bySource.manual > 0) && bySource.triggered > 0) || /^triggered|^trigger rate/.test(useModel));
    if (triggered && uses > 0) {
      out[key] = { sustained: null, kind: "triggered", cadence: `triggered every ${seconds(1 / uses)}`, reason: `${round(uses, 3)} uses/s; takes none of your time${burstNote}` };
      return;
    }
    if (finite(press?.share)) {
      out[key] = { sustained: round(clamp01(press.share)), kind: "pressed", cadence: `${percentText(clamp01(press.share))} of your time`, reason: `the other pressed skills take the rest${burstNote} (rotation estimate, provisional)` };
      return;
    }
    if (input?.kind === "pressed" && input.intervalSeconds > 0) {
      const each = Number(input.pressSeconds) || 0;
      out[key] = { sustained: round(clamp01(each / input.intervalSeconds)), kind: "pressed", cadence: `pressed every ${seconds(input.intervalSeconds)}`, reason: `${seconds(each)} a press; ${input.reason || "pressed when needed"}${burstNote} (rotation estimate, provisional)` };
      return;
    }
    if (hit && uses > 0 && (key === mainKey || (bySource?.manual || 0) > 0)) {
      out[key] = { sustained: 1, kind: "pressed", cadence: "cast nonstop", reason: `${round(uses, 3)} uses/s; it takes all of your time${burstNote}` };
      return;
    }
    // A skill that deals only damage over time: a channel (Mind Control), a triggered recast, or the Main Skill cast nonstop.
    const dot = hit ? null : (planner?.skillDots || []).find((item) => item?.modeled && item.setupKey === key && Number(item.applicationsPerSecond) > 0);
    if (dot) {
      const applications = Number(dot.applicationsPerSecond);
      if (hasTag(setup, "Channeled")) out[key] = { sustained: 1, kind: "channel", cadence: "channeled nonstop", reason: `${round(applications, 3)} applications/s of its damage over time` };
      else if (dot.triggeredBy || planner?.windRhythmTerra?.[key] || planner?.dotTriggers?.[key] || (key === mainKey && planner?.activationMediumTerra?.active)) out[key] = { sustained: null, kind: "triggered", cadence: `triggered every ${seconds(1 / applications)}`, reason: `${round(applications, 3)} recasts/s; takes none of your time` };
      else if (key === mainKey) out[key] = { sustained: 1, kind: "pressed", cadence: "cast nonstop", reason: `${round(applications, 3)} casts/s; it takes all of your time` };
      if (out[key]) return;
    }
    // Any other board skill: the press rotation's own classification (not pressed on the dummy, or triggered with no modeled hit).
    if (input?.kind === "notNeeded") out[key] = { sustained: 0, kind: "pressed", cadence: "not pressed on the dummy", reason: `${input.reason || "nothing on the dummy needs it"} (rotation estimate)` };
    else if (input?.kind === "triggered") out[key] = { sustained: null, kind: "triggered", cadence: String(input.reason || "triggered").replace(/: takes none of your time$/, ""), reason: `${input.reason || "triggered"}; no modeled hit, so no use rate` };
  });
  // The tick engine's opening windows (planner.buffUptime, src/tick-recount.js): a buff of the skill's own that the loop runs replaces the
  // schedule's windows (Aim, a curse, a summon's Minions out); an Aura's own stacks (Cruelty) are their own line.
  for (const [buffKey, item] of Object.entries(engine)) {
    const entry = item?.setupKey ? out[item.setupKey] : null;
    if (!entry || buffKey === "periodicBurst") continue;
    const windows = { window5: item.window5, window20: item.window20, window60: item.window60 };
    if (item.measure === "stacks" && entry.kind !== "summon") entry.stacks = { label: item.label, max: item.max, sustained: 1, ...windows, reason: "the sustained figure holds them at their cap; on the 60 s loop they start at 0 and build from your hits (tick engine)" };
    else if (entry.kind === "buff" || entry.kind === "debuff" || entry.kind === "summon") Object.assign(entry, windows, { windowsFrom: "tick engine" });
  }
  return out;
}

/**
 * The tooltip's "Uptime" section for one entry (empty for none): the sustained percent and cadence, the 5 s / 20 s windows where one
 * differs from the sustained value by 0.5 points or more, and the reason in the muted text.
 */
export function skillUptimeHtml(entry, escapeHtml = (value) => String(value)) {
  if (!entry) return "";
  const lead = entry.kind === "always" && entry.sustained >= 1 - 1e-9 ? "Always active"
    : finite(entry.sustained) ? `<b>${percentText(entry.sustained)}</b> · ${escapeHtml(entry.cadence)}`
    : escapeHtml(entry.cadence.charAt(0).toUpperCase() + entry.cadence.slice(1));
  const differs = (value, sustained = entry.sustained) => finite(value) && finite(sustained) && Math.abs(value - sustained) * 100 >= 0.5;
  const windowsOf = (item) => [["5 s window", item.window5], ["20 s window", item.window20], ["60 s", item.window60]].filter(([, value]) => finite(value));
  const all = windowsOf(entry);
  const windowLine = all.some(([, value]) => differs(value)) ? all : [];
  // An Aura's own stacks (Cruelty): average stacks over each window, of the cap.
  const stacks = entry.stacks, stackWindows = stacks ? windowsOf(stacks) : [];
  const stackLine = stacks && stackWindows.some(([, value]) => differs(value, stacks.sustained))
    ? `<p>${escapeHtml(stacks.label)}: ${round(stacks.sustained * stacks.max, 1)} of ${stacks.max} sustained · ${stackWindows.map(([label, value]) => `${label} ${round(value * stacks.max, 1)}`).join(" · ")}</p>` : "";
  return `<div class="skill-tooltip-effect-list skill-tooltip-uptime"><h4>Uptime</h4><p>${lead}</p>${windowLine.length ? `<p>${windowLine.map(([label, value]) => `${label} ${percentText(value)}`).join(" · ")}</p>` : ""}${stackLine}${entry.reason ? `<p class="skill-tooltip-uptime-reason">${escapeHtml(entry.reason)}</p>` : ""}</div>`;
}
