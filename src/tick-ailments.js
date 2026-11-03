// Ailments, Affliction, Reaps and Scorching Beam on the tick loop (sessions 4 and 5 of research/tick-engine-investigation-2026-10-30.md §7.5;
// status and findings: research/tick-engine-prototype-2026-10-31.md). Read-only and pure, like src/tick-ledger.js, its only importer. Every value
// comes from planner.dummyRecount.inputs (src/dummy-recount-inputs.js), the figures the recount itself reads, so nothing is re-derived: this
// module only places them on ticks.
//
// - A DoT's path is the recount's damagePerBase, with the Affliction factor taken out at the configured rating and put back as a live layer,
//   so at steady amounts the path gives back damagePerBase × the steady max-Affliction ratio. The dummy's rating is a scalar on the loop.
// - An application is an effect on the applying hit, one stream per inflicting skill, at that skill's own attempt rate and whole-percent
//   chance. Ignite and Trauma at a one-rank limit (user decision 2026-11-02, the client's mode 6): a held store (src/held-ailment-store.js), each
//   stream's application compared on its own amount (its roll and own layers, Aim's state when Aim is on the loop), a weaker one does nothing.
//   Any other shared timer (a limit holding several applications, a skill DoT, the "refresh" reading): the engine's survival state reads the
//   retained table at each success count; several streams read expectedStrongestStacks over each stream's own count (never a new roll).
//   Independent stacks: each attempt adds its expected stacks with the applying skill's own value.
// - Scorching Beam: one action, a cycle whose last use carries the explosion, the Bard residual as a stream every tick, and Scorch's scale
//   read from the chain's run (scorchFraction).
// - A Reap: one per source, on its own timer, base time and Reaping Recovery Speed from the inputs, so the engine's whole-tick rule replaces
//   the planner's continuous Reap timing on the recount (the Reap toggle is gone since chunk 15). Each DoT it settles at the seconds and settle scale the recount reads. A source with a DoT that is not on
//   the loop stays averaged, whole. Ill Omen is a series made from the DoT and Reap series when the run ends.
import { expectedStrongestStacks } from "./ailment-model.js";
import { heldAttempt, heldExpire, heldGroup, heldStoreLevels, newHeldState } from "./held-ailment-store.js";
import { wholePercentRoll } from "./whole-percent-roll.js";
import { turbulenceSeries } from "./youga-spacetime.js";

const EPS = 1e-9;
// The series Ill Omen and Spacetime Turbulence are built from: every DoT and every Reap (as the recount's builders).
const builderKeys = (inputs) => [...(inputs.ailments || []).filter((item) => !item.silent).map((item) => item.key), ...(inputs.reaping || []).map((source) => source.key)];
const FRAME_SECONDS = 1 / 30;
const ELEMENTAL_TYPES = new Set(["Fire", "Cold", "Lightning"]);
const AILMENT_TYPE = { ignite: "Fire", scorch: "Fire", trauma: "Physical", wilt: "Erosion" };
const wholeChance = (share) => wholePercentRoll(share * 100) / 100;

// The recount's timed effects (src/dummy-recount.js timedEffectsFn, which stays private there): a share's factor over time, or null.
export function timedShareFactor(timed, share) {
  if (!timed?.parts?.length || !share) return null;
  const reaching = timed.parts.filter((part) => (!part.keys || part.keys.includes(share.key)) && (part.reach === "hit" ? share.hit : part.reach === "dot" ? !share.hit : true));
  if (!reaching.length) return null;
  const factorOf = (part, time) => { let index = 0; while (index + 1 < part.edges.length && part.edges[index + 1] <= time + EPS) index += 1; return part.factors[index]; };
  const product = (type, time) => reaching.filter((part) => !part.type || part.type === type || (part.type === "Elemental" && ELEMENTAL_TYPES.has(type))).reduce((factor, part) => factor * factorOf(part, time), 1);
  const types = Object.entries(share.types || {}).filter(([, value]) => value > 0);
  const rest = Math.max(0, 1 - types.reduce((sum, [, value]) => sum + value, 0));
  return (time) => types.reduce((sum, [type, value]) => sum + value * product(type, time), 0) + rest * product(null, time);
}

// The opening channel with own buffs not prebuilt: Supercharge relative to the full channel, as src/dummy-recount.js channelFactorFn.
function channelFactorOf(channel, rate) {
  if (!channel || !(channel.perStackSupercharge > 0)) return null;
  const supercharge = (stacks) => 1 + (channel.superchargeFlat + channel.perStackSupercharge * stacks) / 100;
  const full = supercharge(channel.maxStacks);
  return (time) => supercharge(Math.min(channel.maxStacks, channel.minStacks + rate * time)) / full;
}

const timedFactorOf = (timed, key) => timedShareFactor(timed, timed?.shares?.[key]);

// The recount's timed series on a DoT, split by side (chunk 15 session 3, tick-ailment-snapshot): the dummy's debuffs (`target` "enemy") read
// the tick, the attacker's own buffs ("self": Empower, hero and pact buffs on the player) are snapshotted at each application (`attacker`).
function timeModifiers(inputs, key, { snapshot = false } = {}) {
  const asModifier = (liveKey, source, factorAt, attacker = false) => ({ source, text: `${source} over time, as the recount reads it${attacker ? ", fixed at each application" : ""}`, liveKey, layer: "additional", steadyAmount: 0, ...(attacker ? { attacker: true } : {}), amount: (world) => (factorAt(world.frame * FRAME_SECONDS) - 1) * 100 });
  const timed = inputs.timedEffects, share = timed?.shares?.[key];
  const sideOf = (side) => timed?.parts?.length && share ? timedShareFactor({ parts: timed.parts.filter((part) => (part.target === "self") === (side === "self")) }, share) : null;
  const channel = channelFactorOf(inputs.channel, inputs.rate);
  const parts = snapshot ? [["enemy", false], ["self", true]].flatMap(([side, attacker]) => { const factor = sideOf(side); return factor ? [asModifier("timed", side === "self" ? "Timed own buffs" : "Timed debuffs", factor, attacker)] : []; })
    : (() => { const factor = timedFactorOf(timed, key); return factor ? [asModifier("timed", "Timed effects", factor)] : []; })();
  return [...parts, ...(channel ? [asModifier("timed", "Channeled stacks", channel)] : [])];
}

// The share of a DoT's value a Blessing gained only from the dummy holds: the ledger line the planner counted at full stacks (src/tick-layers.js
// onTargetBlessing).
function targetBlessingPercent(planner, key, blessing) {
  if (!blessing) return 0;
  const source = `${blessing.name} Blessing`, dot = (planner.skillDots || []).find((item) => item.key === key);
  const lines = dot ? dot.ledger?.additional : planner.ailments?.[key]?.shared?.ledger?.additional ?? (key === "ignite" ? planner.theoretical?.recipeLists?.additional : null);
  return (lines || []).filter((line) => line.source === source || String(line.source).startsWith(`${source} (`)).reduce((sum, line) => sum + (line.value || 0), 0);
}

// A DoT's path: damagePerBase with Affliction live.
function dotPath(inputs, ailment, type, timedLayers, blessings = []) {
  const simulated = inputs.options?.afflictionModel === "simulated";
  const { configuredRating = 0, perPoint = 0 } = ailment.affliction || {};
  const live = simulated && perPoint > 0;
  const modifiers = live ? [{ source: "Affliction", text: `1 + rating × ${perPoint}`, affliction: true, layer: "affliction", perPoint, steadyAmount: configuredRating, liveKey: "affliction" }] : [];
  const max = ailment.maxAffliction;
  if (max) {
    const steadyRatio = max.ratioAtNone + (max.ratioAtFull - max.ratioAtNone) * max.steadyFraction;
    const common = { source: "Max Affliction", text: `resistance term at max Affliction: ×${max.ratioAtNone} below, ×${max.ratioAtFull} at it`, layer: "additional", steadyAmount: (steadyRatio - 1) * 100, liveKey: "maxAffliction" };
    modifiers.push(simulated ? { ...common, maxAffliction: { ratioAtNone: max.ratioAtNone, ratioAtFull: max.ratioAtFull } } : { ...common, amount: (world) => ((world.frame * FRAME_SECONDS >= max.firstMaxSeconds - EPS ? steadyRatio : max.ratioAtNone) - 1) * 100 });
  }
  // A timed DoT layer (Windwalk's 4 s own buff) is the attacker's: an application inside the window keeps it for its life (tick-ailment-snapshot).
  modifiers.push(...timedLayers.map((layer) => ({ source: "Timed DoT layer", text: `×${layer.factor} from ${layer.startSeconds} s for ${layer.durationSeconds} s, fixed at each application`, buff: layer.buff, layer: "additional", percent: (layer.factor - 1) * 100, steadyAmount: 0, liveKey: "timed", attacker: true })), ...timeModifiers(inputs, ailment.key, { snapshot: true }));
  // A Blessing gained only from the dummy is out of the planner's held value and back as its live stacks, the attacker's own buff, fixed at each
  // application.
  const liveBlessings = blessings.filter((blessing) => blessing.percent > 0);
  const heldBlessing = liveBlessings.reduce((factor, blessing) => factor * (1 + blessing.percent / 100), 1);
  for (const blessing of liveBlessings) {
    const from = [blessing.gains?.reap ? "the Reaps" : "", blessing.gains?.hits?.length ? "the hits" : ""].filter(Boolean).join(" and ") || "its gains";
    modifiers.push({ source: `${blessing.name} Blessing`, text: `+${blessing.percent / blessing.stacks}% additional per stack, from 0 on ${from}, fixed at each application`, buff: blessing.buff, perStack: true, layer: "additional", percent: blessing.percent / blessing.stacks, steadyAmount: blessing.percent, liveKey: "blessings", attacker: true });
  }
  return {
    label: ailment.name, kind: "dot",
    parts: [{ key: "dot", type, base: ailment.damagePerBase / (live ? 1 + configuredRating * perPoint : 1) / heldBlessing, increasedPercent: 0, additionalFactor: 1 }],
    modifiers,
    working: { damagePerBase: ailment.damagePerBase, duration: ailment.duration, stacking: ailment.stacking, chance: ailment.chance, notActiveChance: ailment.notActiveChance, affliction: ailment.affliction || null, maxAffliction: max || null }
  };
}

// The inflicting skills of an ailment, with the attempt rate and the whole-percent chance each has. The beam's Ignite keeps its own raw
// chances: the recount's are pooled into a per-use figure, and here each stream runs at its own rate.
function streamsOf(planner, ailment) {
  if (ailment.silent) return [{ key: "beam", name: "Scorching Beam", chance: wholeChance(ailment.chance), notActiveChance: wholeChance(ailment.notActiveChance) }];
  const own = planner.ailments?.[ailment.key];
  const live = (appliers) => (appliers || []).filter((applier) => !applier.blocked && applier.applicationsPerSecond > 0 && applier.chancePercent > 0);
  // Stacks per success: the ailment's own plus the skill's expected extra stacks (src/ailment-model.js stacksOf).
  if (own?.appliers?.length) return live(own.appliers).map((applier) => ({ key: applier.key, name: applier.name, applicationsPerSecond: applier.applicationsPerSecond, chance: wholePercentRoll(applier.chancePercent) / 100, applier, value: applier.averageApplication, stacks: (own.stacksPerApplication ?? 1) + (applier.extraStacks || 0) }));
  if (ailment.key !== "ignite") return [];
  const ignite = planner.theoretical?.combat?.expectedActiveIgnite;
  return live(planner.igniteAppliers).map((applier) => applier.key === "beam"
    ? { key: "beam", name: applier.name, applicationsPerSecond: applier.applicationsPerSecond, chance: wholePercentRoll(ignite?.applicationChancePercent ?? applier.chancePercent) / 100, notActiveChance: wholePercentRoll(ignite?.notIgnitedApplicationChancePercent ?? applier.chancePercent) / 100, applier }
    : { key: applier.key, name: applier.name, applicationsPerSecond: applier.applicationsPerSecond, chance: wholePercentRoll(applier.chancePercent) / 100, applier });
}

// Each stream's roll: the base range with its own scoped base and its own layers (src/ailment-model.js rollFor), its crit chance and Double chance.
function streamRolls(planner, ailment, streams) {
  const own = planner.ailments?.[ailment.key], ignite = own ? null : planner.theoretical?.combat?.expectedActiveIgnite;
  const main = streams.find((stream) => stream.applier?.main)?.applier ?? null;
  const range = own ? own.base : ignite.baseRange;
  // The beam's Ignite: its value (damagePerBase) is the beam ledger's, which already holds the beam's own layers (Overly Modified's −50% among them),
  // so each stream's scale is relative to the beam's. An ailment model's appliers carry their whole scale in the roll (src/ailment-model.js rollFor).
  const beamScale = own ? 1 : streams.find((stream) => stream.key === "beam")?.applier?.scale || 1;
  return streams.map(({ applier }) => {
    const extra = (item) => item?.baseExtra || { min: 0, max: 0 }, scale = (applier.scale ?? 1) / beamScale;
    return { min: (range.min - extra(main).min + extra(applier).min) * scale, max: (range.max - extra(main).max + extra(applier).max) * scale, chancePercent: 100, critChancePercent: own ? applier.critChancePercent : 0, critFactor: own?.combat?.critOnlyFactor ?? 1, doubleChancePercent: own?.combat?.doubleChancePercent ?? 0 };
  });
}

// Several streams on one shared timer: the run's strongest stacks over each stream's own count, from the ailment model (never a new roll). The
// engine splits a run's successes between the streams and rounds nothing: the counts round here, so the memo stays small. A count stops at the
// inputs table's length, as retainedBase[min(n, count)] does.
function retainedOverStreams(planner, ailment, streams) {
  const own = planner.ailments?.[ailment.key], ignite = own ? null : planner.theoretical?.combat?.expectedActiveIgnite;
  const rolls = streamRolls(planner, ailment, streams);
  const stackLimit = own ? own.stackLimit : ignite.maximumActiveStacks ?? 1, stacksPerApplication = own ? own.stacksPerApplication ?? 1 : ignite.stacksPerApplication ?? 1;
  const cap = ailment.retainedBase.length - 1, memo = new Map();
  return (counts) => {
    const held = streams.map((_, index) => Math.min(cap, Math.round(counts[index] || 0))), key = held.join(",");
    if (!memo.has(key)) memo.set(key, expectedStrongestStacks({ stackLimit, stacksPerApplication, streams: rolls.map((roll, index) => ({ ...roll, attempts: held[index] })) }));
    return memo.get(key);
  };
}

// Mode 6 (the client's stack mode of Ignite and Trauma; research/core-formulas-chunk0-2026-10-31.md §5) at a one-rank limit: the limit is 1, or
// every live stream's application fills it (Selena's 13 Ignite stacks against 8 to 10). Returns each stream's weight (the stacks one application
// holds), or null: a limit that holds several applications keeps the chain (how its stacks time out is not settled, open question
// ailment-held-strength).
const HELD_STORE_AILMENTS = new Set(["trauma", "ignite"]);
function heldWeights(planner, ailment, streams) {
  if (!HELD_STORE_AILMENTS.has(ailment.key) || ailment.silent || ailment.stacking === "independent" || !streams.length) return null;
  const own = planner.ailments?.[ailment.key];
  // No roll to discretise (a planner without the ailment's base range): the chain's table.
  if (!((own ? own.base : planner.theoretical?.combat?.expectedActiveIgnite?.baseRange)?.max > 0)) return null;
  if (own) {
    const limit = Math.max(1, Number(own.stackLimit) || 1);
    const weights = streams.map(({ applier }) => Math.max(1, Number(own.stacksPerApplication) || 1) + (applier?.extraStacks || 0));
    return weights.every((per) => per >= limit - 1e-9) ? weights.map((per) => Math.min(per, limit)) : null;
  }
  const ignite = ailment.key === "ignite" ? planner.theoretical?.combat?.expectedActiveIgnite : null;
  if (!ignite) return null;
  const limit = Math.max(1, Number(ignite.maximumActiveStacks) || 1), per = Math.max(1, Number(ignite.stacksPerApplication) || 1);
  return per >= limit ? streams.map(() => Math.min(per, limit)) : null;
}

// Aim's ailment line (attr 3604, game recipe 358287) is part of an application's own amount, so it enters the compare and stays with the winner. The
// planner holds it at its average in the DoT's value; with Aim on the loop each application reads Aim's state instead: ×(1 + full) ÷ (1 + average)
// while Aim is up, ÷ (1 + average) while it is not. Null when Aim is not on the loop or the DoT holds no Aim line.
function aimVariant(planner, ailment, aimBuff) {
  const aim = planner.aim;
  if (!aimBuff || !aim?.active || !(aim.ailmentDamagePercent > 0)) return null;
  const own = planner.ailments?.[ailment.key];
  const lists = own ? [own.shared?.ledger?.combatOutgoing, own.shared?.ledger?.additional] : [planner.theoretical?.combat?.ledger];
  const line = lists.flatMap((list) => list || []).find((item) => /^Aim Ailment Damage\b/.test(item.source || ""));
  if (!(line?.value > 0)) return null;
  const held = 1 + line.value / 100;
  return { buff: aimBuff, factors: [1 / held, (1 + aim.ailmentDamagePercent / 100) / held], averagePercent: line.value, fullPercent: aim.ailmentDamagePercent };
}

// The held store of one ailment (src/held-ailment-store.js): one kind per stream × Aim's state, the store's functions handed to the engine.
function heldStoreSpec(planner, ailment, streams, weights, aimBuff) {
  const rolls = streamRolls(planner, ailment, streams), variant = aimVariant(planner, ailment, aimBuff), factors = variant ? variant.factors : [1];
  const kinds = rolls.flatMap((roll, index) => factors.map((factor) => ({ min: roll.min, max: roll.max, critChance: roll.critChancePercent / 100, critFactor: roll.critFactor, doubleChance: roll.doubleChancePercent / 100, factor, weight: weights[index] })));
  const levels = heldStoreLevels(kinds);
  return {
    store: { create: () => newHeldState(levels), attempt: heldAttempt, group: heldGroup, expire: heldExpire, variantBuff: variant?.buff ?? null, variantCount: factors.length, levelCount: levels.values.length },
    variant
  };
}

function compileAilment(planner, ailment, type, timedLayers, inputs, targetBlessings = [], { heldStrength = "dropped", aimBuff = null } = {}) {
  const streams = streamsOf(planner, ailment), independent = ailment.stacking === "independent";
  // On the loop when its hit gains landed on a hit or Reaps can build it (with no Reap on the loop src/tick-ledger.js holds it full, the planner's value).
  const blessings = targetBlessings.filter((item) => item.hitPlaced || (item.gains?.reap && inputs.reaping?.length)).map((item) => ({ ...item, percent: targetBlessingPercent(planner, ailment.key, item) }));
  const shared = { key: ailment.key, seconds: ailment.duration, path: ailment.silent ? null : ailment.key };
  if (independent) return { spec: { ...shared, stacking: "independent", limit: ailment.limit, value: ailment.averageApplication }, streams, path: dotPath(inputs, ailment, type, timedLayers, blessings) };
  const path = ailment.silent ? null : dotPath(inputs, ailment, type, timedLayers, blessings);
  const weights = heldStrength === "refresh" ? null : heldWeights(planner, ailment, streams);
  if (weights) {
    const { store, variant } = heldStoreSpec(planner, ailment, streams, weights, aimBuff);
    return { spec: { ...shared, stacking: "shared", retainedBase: ailment.retainedBase, store, ...(ailment.scorchFraction ? { keepChain: true } : {}) }, streams, path, held: { variant } };
  }
  const several = streams.length > 1 ? { retainedOf: retainedOverStreams(planner, ailment, streams), topCount: Math.min(4096, (ailment.retainedBase.length - 1) * streams.length) } : {};
  return { spec: { ...shared, stacking: "shared", retainedBase: ailment.retainedBase, ...several }, streams, path };
}

const streamEffect = (ailment, stream, index) => ({
  kind: "ailment", ailment: ailment.key, key: `${ailment.key}:${stream.key}`, stream: index,
  chance: stream.chance, ...(stream.notActiveChance !== undefined ? { notActiveChance: stream.notActiveChance } : {}),
  ...(ailment.stacking === "independent" && stream.value !== undefined ? { value: stream.value, stacks: stream.stacks } : {})
});

// Which ailment's success fires an "inflicting" Reap: the one it names; otherwise the damaging ailment with the highest chance, as the recount
// and the planner's successfulApplicationsPerSecond read it (a skill DoT counts: planner behaviour, reported).
function successAilment(source, ailments) {
  const named = String(source.trigger).match(/^inflicting (Ignite|Trauma|Wilt)$/)?.[1]?.toLowerCase();
  if (named) return named;
  return ailments.reduce((best, item) => !item.silent && (!best || item.chance > best.chance) ? item : best, null)?.key ?? null;
}

// One Reap source for the loop. Its recovery is the base time and speed, not the resolved seconds, so whole ticks come from the engine's elapsed
// check (D1). A DoT's settle is what the recount multiplies on top of the DoT's rate: the True Damage scale, and for a full-Affliction source read
// at 100 (reapSettle "atHundred") what the path cannot reach by itself there. Read at the last DoT pass the path's own factors are the whole of it.
function reapSpec(source, ailments, simulated, atHundred) {
  const timing = source.timing || {}, label = source.triggerLabel ?? source.trigger, full = source.trigger === "full Affliction";
  const dots = {};
  for (const ailment of ailments) {
    const seconds = source.seconds?.[ailment.key];
    if (!(seconds > 0) || ailment.silent) continue;
    const settle = source.settle?.[ailment.key] || {}, live = simulated && ailment.affliction?.perPoint > 0, max = ailment.maxAffliction;
    const pathRatio = !max ? 1 : simulated ? max.ratioAtFull : max.ratioAtNone + (max.ratioAtFull - max.ratioAtNone) * max.steadyFraction;
    dots[ailment.key] = { seconds, scale: (settle.trueDamage ?? 1) * (full && atHundred ? (live ? 1 : settle.affliction ?? 1) * (settle.resistance ?? pathRatio) / pathRatio : 1) };
  }
  const spec = { key: source.key, label: `Reaping: ${source.source}`, source: source.source, baseSeconds: timing.baseSeconds ?? source.recoverySeconds ?? 0, speedFactor: timing.speedFactor ?? 1, dots };
  if (full) return { ...spec, trigger: "affliction", remover: source.key };
  if (/^inflicting /.test(source.trigger)) return { ...spec, trigger: "success", ailment: successAilment(source, ailments) };
  if (label === "max channeled stacks") return { ...spec, trigger: "uses", usesPerTrigger: timing.usesPerTrigger ?? 1 };
  // "skill use": no recovery of its own (the planner's base time is the use interval). The Cycle I Resist's first cast has no previous Terra.
  if (label === "skill use") return { ...spec, trigger: "uses", baseSeconds: 0, usesPerTrigger: 1, ...(timing.skipFirstUse ? { startUses: -1 } : {}) };
  return spec;
}

// Scorching Beam as the recount has it: uses at its rate, an explosion every cycleUses, the Bard residual as a constant stream, and a Scorch
// scale read from the chain. With no delivery calibration (a beam that deals no hits here) the uses still attempt the ailments.
function beamProgram(inputs, strikeEffects, timerFields) {
  const { hits, rate } = inputs, paths = {};
  const useSeconds = 1 / rate, first = Number.isFinite(inputs.firstUseSeconds) ? { firstUseSeconds: inputs.firstUseSeconds } : {};
  const base = { key: "beam:use", label: "Scorching Beam uses", actor: "player", useSeconds, ...first, ...timerFields };
  if (!hits) return { paths, actions: strikeEffects.length ? [{ ...base, effects: [{ kind: "event", effects: strikeEffects }] }] : [], periodics: [] };
  const scorch = hits.resistance?.kind === "scorch" ? hits.resistance : null;
  const chain = scorch ? inputs.ailments.find((item) => item.key === scorch.chainKey) : null;
  const scale = scorch ? scorch.baseScale : hits.resistance?.scale ?? 1;
  const percent = scorch ? (scorch.activeScale / scorch.baseScale - 1) * 100 : 0;
  const modifiers = [
    ...(scorch ? [{ source: "Scorch", text: `resistance scale ×${scorch.baseScale} to ×${scorch.activeScale} with the stacks on the ${chain?.name ?? scorch.chainKey} chain`, ailmentShare: { ailment: scorch.chainKey, fractions: chain?.scorchFraction || [0, 1] }, layer: "additional", percent, steadyAmount: percent, liveKey: "scorch" }] : []),
    ...timeModifiers(inputs, "beam")
  ];
  const path = (key, label, value, extra = {}) => { paths[key] = { label, kind: "hit", ...extra, parts: [{ key: "beam", type: "Fire", base: value * scale, increasedPercent: 0, additionalFactor: 1 }], modifiers }; };
  path("beam", "Beam hits", hits.perUse, { working: { perUse: hits.perUse, explosion: hits.explosion, cycleUses: hits.cycleUses, residualDps: hits.residualDps, resistance: hits.resistance } });
  const strike = { kind: "hit", path: "beam", onHit: strikeEffects };
  const explosion = hits.cycleUses > 0 && hits.explosion > 0;
  if (explosion) path("beam:explosion", "Beam explosion", hits.explosion, { source: "beam" });
  const steps = explosion ? Array.from({ length: hits.cycleUses }, (_, index) => ({ useSeconds, label: "Scorching Beam use", effects: index === hits.cycleUses - 1 ? [strike, { kind: "hit", path: "beam:explosion" }] : [strike] })) : null;
  const periodics = [];
  if (hits.residualDps > 0) {
    path("beam:residual", "Bard residual", hits.residualDps * FRAME_SECONDS, { source: "beam" });
    periodics.push({ key: "beam:residual", actor: "player", label: "Bard residual", intervalSeconds: FRAME_SECONDS, effects: [{ kind: "hit", path: "beam:residual" }] });
  }
  return { paths, actions: [steps ? { ...base, steps } : { ...base, effects: [strike] }], periodics };
}

// Walk a program's hit effects, wherever they are nested. `change` returns the effect to keep.
const mapEffects = (effects, change) => effects?.map((effect) => effect.kind === "hit" ? change(effect) : effect.effects ? { ...effect, effects: mapEffects(effect.effects, change) } : effect);
const mapItem = (item, change) => ({ ...item, ...(item.effects ? { effects: mapEffects(item.effects, change) } : {}), ...(item.steps ? { steps: item.steps.map((step) => ({ ...step, effects: mapEffects(step.effects, change) })) } : {}) });
function hitsIn(item, series) {
  let count = 0;
  mapItem(item, (effect) => { if (series(effect.path)) count += 1; return effect; });
  return count;
}

/**
 * The ailment program of a build, or null when the recount has none to compile.
 * @param {object} planner calculatePlanner's result (read only)
 * @param {object} [readings] afflictionRemoval: "beforeDot" (default) | "reap"; afflictionAccrual: "fromStart" (default) | "whileDot"; reapSettle:
 *   "lastDot" (default, a full-Affliction Reap reads the last DoT pass's rating, before that tick's hits) | "atHundred" (it reads 100 and the max-Affliction term in full, after the hits);
 *   heldStrength: "dropped" (default, user decision 2026-11-02: a limit-1 Ignite or Trauma is a held store, a weaker application does nothing) |
 *   "refresh" (the 2026-10-19 reading: every success restarts the shared timer and the run's strongest is held, the recount's own chain)
 * @param {object} [timerFields] the cast reading's fields for the beam's action
 * @param {object} [context] aimBuff: the buff Aim's state is on the loop under (src/tick-layers.js aimLayer), or null
 * @returns {{ paths, ailments, affliction, actions, periodics, dotEffect, attach, layers, assumptions, held }} `attach` puts each stream on its
 *   skill's hits and returns what lands on the loop, Reaps included; `dotEffect` is the application effect of a skill DoT
 */
export function compileAilmentProgram(planner, readings = {}, timerFields = {}, { aimBuff = null } = {}) {
  const inputs = planner?.dummyRecount?.inputs;
  if (!inputs) return null;
  const simulated = inputs.options?.afflictionModel === "simulated";
  const timedLayers = (inputs.timedDotLayers || []).map((layer, index) => ({ ...layer, buff: `timedDot:${index}` }));
  const compiled = new Map((inputs.ailments || []).map((ailment) => [ailment.key, { ailment, ...compileAilment(planner, ailment, planner.ailments?.[ailment.key]?.damageType ?? AILMENT_TYPE[ailment.key] ?? null, timedLayers, inputs, readings.targetBlessings || [], { heldStrength: readings.heldStrength, aimBuff }) }]));
  const removers = (inputs.reaping || []).filter((source) => source.trigger === "full Affliction").map((source) => ({ key: source.key, label: source.source, baseSeconds: source.timing?.baseSeconds ?? source.recoverySeconds ?? 0, speedFactor: source.timing?.speedFactor ?? 1, removedPercent: Math.max(0, Math.min(100, source.afflictionRemovedPercent ?? 100)), settle: readings.reapSettle ?? "lastDot" }));
  const affliction = inputs.afflictionPerSecond > 0 ? { perSecond: inputs.afflictionPerSecond, removers, removalStage: readings.afflictionRemoval ?? "beforeDot", accrual: readings.afflictionAccrual ?? "fromStart" } : null;
  const reapSpecs = (inputs.reaping || []).map((source) => ({ source, spec: reapSpec(source, inputs.ailments || [], simulated, readings.reapSettle === "atHundred") }));
  // A use-driven Reap counts its skill's uses: a skill DoT it belongs to, or one that lands at its rate (The Cycle I Resist, the Main Terra's recasts).
  const usesOf = ({ source, spec }) => spec.trigger !== "uses" ? null : (planner.skillDots || []).find((dot) => dot.modeled && (dot.builtInReaping?.source === source.source || (source.timing?.usesPerSecond > 0 && Math.abs(dot.applicationsPerSecond - source.timing.usesPerSecond) < 1e-9)))?.key ?? null;
  const reapsOnDot = new Map();
  for (const item of reapSpecs) { const dot = usesOf(item); if (dot) reapsOnDot.set(dot, [...(reapsOnDot.get(dot) || []), item.spec.key]); }
  const beamEffects = [...compiled.values()].flatMap(({ ailment, streams }) => streams.map((stream, index) => stream.key === "beam" ? streamEffect(ailment, stream, index) : null).filter(Boolean));
  const beam = (inputs.hits || beamEffects.length) ? beamProgram(inputs, beamEffects, timerFields) : { paths: {}, actions: [], periodics: [] };
  const placed = new Set(beamEffects.map((effect) => effect.ailment));
  const timedPeriodics = timedLayers.map((layer) => ({ key: layer.buff, actor: "player", label: "Timed DoT layer", startFrame: Math.max(1, Math.ceil(layer.startSeconds * 30 - EPS)), intervalSeconds: Infinity, effects: [{ kind: "buff", buff: layer.buff, seconds: layer.durationSeconds }] }));

  /** The application effect of a skill DoT: it restarts its own timer on every use. Null when the recount does not hold it. */
  const dotEffect = (dot) => {
    const item = compiled.get(dot.key);
    if (!item) return null;
    placed.add(dot.key);
    return { kind: "ailment", ailment: dot.key, key: `${dot.key}:use`, chance: 1, ...(reapsOnDot.has(dot.key) ? { reapUses: reapsOnDot.get(dot.key) } : {}) };
  };

  /** Each stream's effect on its skill's hits. Only what lands on the loop is kept: the rest stays averaged. */
  function attach({ hits, actions, triggers = [], periodics = [], paths }) {
    const lists = { actions, triggers, periodics }, hitReaps = new Set();
    for (const hit of hits) {
      const series = (key) => key === hit.key || paths[key]?.source === hit.key;
      const onHit = [...compiled.values()].flatMap(({ ailment, streams }) => streams.map((stream, index) => stream.key === hit.key ? { ailment, stream, index } : null).filter(Boolean));
      // A hit skill's own Reap (Scorching Pulse) counts its uses.
      const ownReaps = reapSpecs.filter(({ source, spec }) => spec.trigger === "uses" && hit.builtInReaping?.source === source.source && !usesOf({ source, spec })).map(({ spec }) => spec);
      if (!onHit.length && !ownReaps.length) continue;
      const events = hitsIn([...actions, ...triggers, ...periodics].find((item) => hitsIn(item, series) > 0) ?? {}, series);
      if (!events) continue;
      for (const spec of ownReaps) { spec.usesPerTrigger = events; hitReaps.add(spec.key); }
      const eventsPerSecond = (/^channel \(/.test(String(hit.rate.useModel || "")) ? hit.rate.hitsPerSecond : hit.rate.usesPerSecond * events);
      const effects = [...onHit.map(({ ailment, stream, index }) => { placed.add(ailment.key); return { ...streamEffect(ailment, stream, index), attempts: stream.applicationsPerSecond / eventsPerSecond }; }), ...ownReaps.map((spec) => ({ kind: "reapUse", reap: spec.key }))];
      const change = (effect) => series(effect.path) ? { ...effect, onHit: [...(effect.onHit || []), ...effects] } : effect;
      for (const name of Object.keys(lists)) lists[name] = lists[name].map((item) => mapItem(item, change));
    }
    const kept = [...compiled.values()].filter(({ ailment }) => placed.has(ailment.key));
    // A source stays averaged, whole, unless every DoT it settles is on the loop.
    const reaps = reapSpecs.filter(({ spec }) => Object.keys(spec.dots).length && Object.keys(spec.dots).every((key) => placed.has(key)) && (spec.trigger !== "success" || placed.has(spec.ailment)));
    // A use-driven Reap tied to no use on the loop (a follower's, a Minion's): its planner rate.
    for (const item of reaps) {
      if (item.spec.trigger !== "uses" || usesOf(item) || hitReaps.has(item.spec.key)) continue;
      const rate = item.source.timing?.usesPerSecond;
      if (rate > 0) lists.actions = [...lists.actions, { key: `${item.spec.key}:uses`, label: `${item.source.source} uses`, actor: "player", useSeconds: 1 / rate, effects: [{ kind: "reapUse", reap: item.spec.key }] }];
    }
    const reapEvents = ({ spec, source }) => spec.trigger === "affliction" ? `at full Affliction, behind a recovery of ${spec.baseSeconds} s ÷ ${Math.round(spec.speedFactor * 1e4) / 1e4}` : spec.trigger === "success" ? `on a success of ${spec.ailment}, the ready share of it, recovery ${spec.baseSeconds} s ÷ ${Math.round(spec.speedFactor * 1e4) / 1e4}` : spec.trigger === "uses" ? `every ${spec.usesPerTrigger} use${spec.usesPerTrigger === 1 ? "" : "s"} of its skill${spec.baseSeconds ? `, recovery ${spec.baseSeconds} s ÷ ${Math.round(spec.speedFactor * 1e4) / 1e4}` : ""}${spec.startUses ? ", the first use skipped" : ""} (${source.triggerLabel})` : `on each tick a DoT is dealt, recovery ${spec.baseSeconds} s ÷ ${Math.round(spec.speedFactor * 1e4) / 1e4}`;
    const assumptions = reaps.map((item) => ({ id: `tick:reap:${item.spec.key}`, value: item.spec.trigger ?? "dot", text: `${item.spec.label}: ${reapEvents(item)}.` }));
    const heldText = (ailment, held) => `one held stack: an application at least as strong on its own amount replaces it, a weaker one does nothing (no refresh), and it ends ${ailment.duration} s after its own application${held.variant ? `; Aim's +${Math.round(held.variant.fullPercent * 100) / 100}% enters each application's amount while Aim is up` : ""}`;
    assumptions.push(...kept.map(({ ailment, streams, held }) => ({ id: `tick:ailment:${ailment.key}`, value: held ? "held" : ailment.stacking, text: `${ailment.name}: ${ailment.stacking === "independent" ? `up to ${ailment.limit} stacks, each ${ailment.duration} s on its own timer` : held ? heldText(ailment, held) : `one shared ${ailment.duration} s timer, restarted by each success; the run's strongest applications are held`}${streams.length ? `, applied by ${streams.map((stream) => `${stream.name} (${Math.round(stream.chance * 100)}%)`).join(", ")}` : ""}.` })));
    return {
      ...lists,
      paths: Object.fromEntries(kept.filter(({ path }) => path).map(({ ailment, path }) => [ailment.key, path])),
      ailments: kept.map(({ spec }) => spec),
      reaps: reaps.map(({ spec }) => spec),
      derived: [
        ...(inputs.illOmen?.factor > 0 ? [{ key: "illOmen", label: inputs.illOmen.label || "Ill Omen", factor: inputs.illOmen.factor, builders: builderKeys(inputs), reason: "the factor × every DoT and Reap series, tick by tick" }] : []),
        // Spacetime Turbulence (Youga – Spacetime Elapse; src/youga-spacetime.js): at each move the recorded share of the DoT and Reap damage since
        // the last move, dealt over the Turbulence duration, from the engine's own series (chunk 15).
        ...(inputs.turbulence?.intervalSeconds > 0 ? [{ key: "turbulence", label: inputs.turbulence.label || "Spacetime Turbulence", factor: 0, builders: builderKeys(inputs), build: (bySource, bins, stepSeconds) => turbulenceSeries(bySource, { ...inputs.turbulence, builders: builderKeys(inputs) }, bins, stepSeconds), reason: "each move re-deals the recorded share of the DoT and Reap series since the last move, on the engine's ticks" }] : [])
      ],
      layers: [
        ...kept.map(({ ailment, streams, held }) => ({ key: `ailment:${ailment.key}`, label: ailment.name, lines: [], events: ailment.stacking === "independent" ? `each success a stack on its own ${ailment.duration} s timer, up to ${ailment.limit}` : held ? `the held amount and its application tick in expectation: replaced by an application at least as strong, a weaker one does nothing, each stack ends ${ailment.duration} s after its own application${streams.length > 1 ? `; ${streams.length} streams compared on their own amounts` : ""}${held.variant ? "; Aim's state read at each application" : ""}` : `a success restarts the ${ailment.duration} s timer; ${streams.length > 1 ? `${streams.length} streams on the model's strongest applications` : "n successes read the retained table"}` })),
        ...(affliction ? [{ key: "affliction", label: "Affliction", lines: [], events: `+${Math.round(affliction.perSecond / 30 * 1000) / 1000} per tick from engagement, 0 to 100, read by the next tick's DoT${removers.length ? `; ${removers.map((item) => item.label).join(", ")} removes ${removers[0].removedPercent} at 100, before that tick's DoT pass` : ""}` }] : []),
        ...reaps.map((item) => ({ key: item.spec.key, label: item.spec.label, lines: [], events: reapEvents(item) })),
        ...(inputs.hits ? [{ key: "beam", label: "Scorching Beam", lines: [], events: `${Math.round(inputs.rate * 1e4) / 1e4} uses/s${inputs.hits.cycleUses > 0 ? `, an explosion every ${inputs.hits.cycleUses}` : ""}, the Bard residual every tick${inputs.hits.resistance?.kind === "scorch" ? ", Scorch's scale from its chain" : ""}` }] : [])
      ],
      assumptions
    };
  }

  const aimLive = [...compiled.values()].some((item) => item.held?.variant);
  const held = (inputs.ailments || []).length || inputs.hits ? [{ key: "ailmentLayers", label: "The other DoT and beam multipliers", reason: `the planner's combat factor on every tick: ailment-type count, recent crit stacks, curses${aimLive ? "" : ", Aim"} and the other conditional buffs enter as its averages${aimLive ? " (Aim's state enters each held Ignite or Trauma application's amount)" : ""}. A held stack keeps the attacker's buffs of the application that set it: the recent crit stacks do not enter the compare, so their average is right in expectation, and the engine shows no single run's swing (open question ailment-held-strength)`, lines: [] }] : [];
  return { paths: beam.paths, actions: beam.actions, periodics: [...beam.periodics, ...timedPeriodics], affliction, dotEffect, attach, held };
}
