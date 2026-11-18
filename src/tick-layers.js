// General time-varying layers for the tick engine (chunk 15 of research/master-validation-checklist-2026-10-31.md, 2026-11-01;
// research/timing-chunk15-2026-11-01.md). Read-only and pure, like src/tick-ledger.js: it rewrites nothing in the planner and re-derives
// no damage value. Sessions 2 and 3 wrote these layers for one build (src/tick-youga-layers.js); this module is the same take-out,
// modifier and steady-amount pattern over every hit on the loop, keyed on the planner's own models (planner.aim, planner.blessings,
// planner.periodicBurst, planner.follower, planner.mark, lineEffects' conditions and timed effects), not on one fixture's sources.
//
// The rule for every layer: a ledger line is taken out of the static product at the value the planner holds, and goes back as a modifier
// at its full value while its buff or window is on. So modifier.steadyAmount gives back the planner's exact hit and use time, and any
// difference in a run comes from time alone. A line the planner holds as a timed effect (src/timed-effects.js: the recount's own series)
// reaches a hit as one `timed` modifier, divided by the effects a live layer carries itself, so nothing is counted twice.
//
// Timers come from the game files where the note says so (recipes in src/data/game/affix-recipes.generated.js, config_char_buff, the
// manual); provisional readings are named in `assumptions` and in the open questions tick-*.
import { partFactorAt, sourceFactorAt } from "./timed-effects.js";
import { enemyBuffSet, playerBuffSet } from "./unit-buff-set.js";
import { plainUseKind } from "./tick-plain-skills.js";
import { blessingDurationSeconds } from "./blessing-layers.js";
import { incisiveLayer } from "./tick-trigger-main.js";
// Your buffs from your unit buff set (W9 step 2, planner.playerBuffs): the Blessings' entries in the Blessing model's shape (name "Focus",
// stacks, maxStacks, gainSources, consumptionCycle …), and Aim's and Periodic Burst's series (the planner's own model objects); the
// planner's fields with TLI_BUFF_SET=off.
const ownBlessingEntries = (planner) => { const own = playerBuffSet(planner); return own?.staged("blessing") ? own.blessings().map((entry) => ({ ...entry, name: entry.label })) : planner.blessings?.entries || []; };
const ownSeries = (planner, name, old) => { const own = playerBuffSet(planner); return own?.staged("timed") ? own.seriesOf(name) : old; };

export const TICKS_PER_SECOND = 30;
export const RECENT_SECONDS = 4; // game hyperlink 103; the client's 120-frame window
// Default durations (config_char_buff column holding the manual's 10 s for Blessings; recipes pass duration -2, "the record's default").
export const SPELL_AGGRESSION_SECONDS = 10, FRAIL_SECONDS = 10;
// A Blessing lasts 10 s (manual 1002010120 / 1002010220 / 1002010320, Tenacity / Agility / Focus). Each gain is a layer on its own timer: it adds
// one layer with its full duration and refreshes nothing, the oldest layer goes at the cap, and the Blessing ends with its newest layer (SS14
// client, the layer add 0x141d02810 and the layer timer pass 0x141d15bc0; user decision 2026-11-04, research/oq-blessing-refresh-2026-11-04.md;
// it replaces the manual's "every gain refreshes all stacks"; open question blessing-layer-timers). Every Blessing buff effect is `layered`.
export const BASE_BLESSING_SECONDS = 10;
// Ailments on the dummy: Frostbite's initial 1.5 s (manual), Numbed's default 2 s with each stack on its own timer (keyword 762),
// Ignite and Trauma 4 s (src/ailment-model.js). Frozen follows Frostbite (manual: "Freeze ends when Frostbite ends").
export const AILMENT_SECONDS = Object.freeze({ Frostbite: 1.5, Frozen: 1.5, Numbed: 2, Ignite: 4, Trauma: 4 });

/** The general layers, in report order; the Youga program adds its own (src/tick-youga-layers.js TICK_LAYERS). */
export const GENERAL_LAYERS = Object.freeze([
  { key: "aim", label: "Aim" },
  { key: "castsRecently", label: "Casts in the last 4 s" },
  { key: "spellAggression", label: "Spell Aggression" },
  { key: "periodicBurst", label: "Periodic Burst" },
  { key: "blessings", label: "Blessing stacks" },
  { key: "followerCasts", label: "Follower casts" },
  { key: "followerActor", label: "Follower as one actor" },
  { key: "tidewell", label: "Tidewell: Spell Double Damage" },
  { key: "paralysis", label: "Coercion's Paralysis" },
  { key: "frail", label: "Frail" },
  { key: "frostbite", label: "Frostbite and Frozen" },
  { key: "numbed", label: "Numbed" },
  { key: "curse", label: "Curse" },
  { key: "ailmentTypes", label: "Ailment types on the dummy" },
  { key: "mark", label: "Mark" },
  { key: "penetrationStacks", label: "Penetration stacks" },
  { key: "trueFlame", label: "True Flame Immolation's Blessing cycle" },
  { key: "incisive", label: "Incisive (Vendetta's casts)" },
  { key: "timed", label: "Timed effects (the recount's series)" }
]);

// Which session-1 group of averagedLayers a live layer empties of its Cast Speed lines.
const RATE_GROUPS = Object.freeze({ aim: "aim", spellAggression: "spellAggression", periodicBurst: "periodicBurst", blessings: "blessings" });
// The timed effects (src/combat-states.js ids) a live layer carries itself, so the recount's series drops them on that hit.
const TIMED_IDS = Object.freeze({ numbed: ["numbed"], paralysis: ["chanceParalysis"] });

const lineKey = (line) => `${line.source}\u0000${line.text}`;
const inList = (list, line) => (list || []).some((item) => item.source === line.source && item.text === line.text);
const sumValues = (lines) => lines.reduce((sum, line) => sum + line.value, 0);
const FRAME_SECONDS = 1 / TICKS_PER_SECOND;

// Every ledger line of one hit, tagged with its pool, in the order of src/tick-ledger.js layerLines.
function ledgerLines(hit) {
  const ledger = hit.ledger || {};
  return [["increased", ledger.increased], ["additional", ledger.additional], ["additional", ledger.combatAdditional], ["taken", ledger.taken]]
    .flatMap(([layer, lines]) => (lines || []).map((line) => ({ layer, source: line.source, text: line.text, value: line.value })));
}

export const prepareEvery = (planner, skill) => {
  const setup = (planner.activation?.setups || []).find((item) => item.name === skill && item.enabled !== false);
  const support = (setup?.supports || []).find((item) => item.enabled !== false && item.name === "Activation Medium: Preparation");
  const configured = (support?.effects || []).find((text) => /^Configured T\d affix:/.test(text)) || "";
  return Number((String(configured).match(/Prepares the supported skill every ([\d.]+) ?s/) || [])[1]) || null;
};

// Own entries in a 4 s window at the planner's rate, for a build whose stacks were built before engaging (oldest first, ticks ≤ 0).
export const seedWindow = (usesPerSecond) => {
  const count = Math.floor(usesPerSecond * RECENT_SECONDS), spacing = TICKS_PER_SECOND / usesPerSecond;
  return Array.from({ length: count }, (_, index) => ({ frame: -(count - 1 - index) * spacing, value: 1 }));
};

// A Spell hit: the profile's tags, else its speed type (attacks run on Attack Speed).
const isSpell = (hit) => Array.isArray(hit.profile?.tags) ? hit.profile.tags.includes("Spell") : hit.rate?.speedType !== "attack-speed";
const dealsType = (target, type) => target.parts.some((part) => part.type === type);

/**
 * The build-level context: every hit on the loop is a target, each with its own parts, crit, modifiers and events; the speeds, triggers,
 * periodics, collectors, initial buffs and follower actions are shared.
 * @param {object} planner calculatePlanner's result (read only)
 * @param {object} options { live: layer keys, layers: [{ key, label }] (the labels the report uses), numbedStacks, followerOrder }
 */
export function createLayerContext(planner, options) {
  const additionalPercents = planner.lineEffects?.castSpeed?.additionalPercents || [];
  const additional = additionalPercents.reduce((factor, value) => factor * (1 + value / 100), 1);
  const cooldownLines = planner.aim?.cooldownSources || [];
  const ctx = {
    planner, options, live: new Set(options.live || []), labels: new Map((options.layers || GENERAL_LAYERS).map((layer) => [layer.key, layer.label])),
    prebuilt: planner.conditions?.prebuiltSelfBuffs !== false,
    castAdditional: additional,
    targets: [],
    speeds: {
      // Cooldown Recovery Speed, build-wide: (1 + Σ increased) × Π additional, split so a live layer can be taken out of either side.
      cooldown: { increasedPercent: sumValues(cooldownLines.filter((line) => line.kind !== "additional")), additionalFactor: cooldownLines.filter((line) => line.kind === "additional").reduce((factor, line) => factor * (1 + line.value / 100), 1), modifiers: [] }
    },
    actions: [], triggers: [], periodics: [], collectors: [], initialBuffs: [], followerEvents: new Map(),
    paths: {}, report: new Map(), assumptions: [], once: new Set(),
    // The trigger bus (src/trigger-bus.js, W10): null on the layers. Its listeners replace the layers' event-driven holds they own.
    bus: options.bus ?? null
  };
  ctx.isLive = (key) => ctx.live.has(key);
  ctx.reported = (key) => {
    if (!ctx.report.has(key)) ctx.report.set(key, { key, label: ctx.labels.get(key) ?? key, lines: [], events: "" });
    return ctx.report.get(key);
  };
  ctx.first = (key) => { if (ctx.once.has(key)) return false; ctx.once.add(key); return true; };
  ctx.addSpeed = (speedKey, layerKey, line, modifier) => {
    const target = ctx.speeds[speedKey];
    if (!target) return;
    if (modifier.layer === "increased") target.increasedPercent -= modifier.steadyAmount;
    else target.additionalFactor /= 1 + modifier.steadyAmount / 100;
    target.modifiers.push({ source: line.source, text: line.text, ...modifier });
    ctx.reported(layerKey).lines.push({ layer: "rate", source: line.source, text: line.text, value: modifier.steadyAmount });
  };
  return ctx;
}

/**
 * One hit on the loop. `speedKey` names its live Cast Speed ("cast" on the Youga Core, else cast:<hit key>); attacks run on Attack Speed,
 * which no layer models yet, so they get no speed of their own (held, listed by generalHeldLayers).
 */
export function addTarget(ctx, hit, path, { speedKey = `cast:${hit.key}`, core = false } = {}) {
  const lines = ledgerLines(hit), claimed = new Map();
  const speedFactor = hit.rate.speedFactor;
  const attack = hit.rate.speedType === "attack-speed", castSpeed = !attack && speedFactor > 0;
  // An attack skill's live Attack Speed (chunk 15 session 3): the planner's attackSpeed sources split into the increased pool and the rest
  // (additional lines, the supports' factor, the skill's own line), so Aim, Periodic Burst and Agility Blessing can be taken out of either side.
  const attackSources = attack && speedFactor > 0 && Array.isArray(hit.rate.attackSpeed?.sources) ? hit.rate.attackSpeed.sources : null;
  const attackIncreased = attackSources ? attackSources.filter((line) => !line.additional).reduce((sum, line) => sum + (Number(line.value) || 0), 0) : 0;
  const attackKey = attack ? `attack:${hit.key}` : null;
  const target = {
    hit, path, core, speedKey: castSpeed ? speedKey : attackSources ? attackKey : null, speedKind: attackSources ? "attack" : castSpeed ? "cast" : null, attackSources, timedIds: new Set(),
    parts: path.parts.map((part) => ({ ...part })), crit: null, doubleDamage: null, modifiers: [], onUse: [], onHit: [], after: [], rateGroups: new Set()
  };
  if (castSpeed) ctx.speeds[speedKey] = { increasedPercent: (speedFactor / ctx.castAdditional - 1) * 100, additionalFactor: ctx.castAdditional, modifiers: [] };
  else if (attackSources) ctx.speeds[attackKey] = { increasedPercent: attackIncreased, additionalFactor: speedFactor / (1 + attackIncreased / 100), modifiers: [] };
  const componentOf = (part) => hit.components[Number(String(part.key).split("#")[1])];
  target.componentOf = componentOf;
  // Crit and Double Damage stay in the static product unless a layer needs them out. The crit factor must reproduce the planner's first.
  const crit = hit.crit;
  if (crit && !crit.critStates && Number.isFinite(crit.combatDamagePercent)) {
    const critFactor = 1 + (crit.chancePercent / 100) * (crit.combatDamagePercent / 100 * (crit.critOnlyFactor ?? 1) - 1);
    if (Math.abs(critFactor / crit.factor - 1) < 1e-9) {
      target.crit = { chancePercent: crit.chancePercent, damagePercent: crit.combatDamagePercent, onlyFactor: crit.critOnlyFactor ?? 1 };
      for (const part of target.parts) part.base /= crit.factor;
    }
  }
  // Take a line out of the static product, at the value the planner holds.
  target.takeOut = (line) => {
    const holders = [];
    for (const part of target.parts) {
      const component = componentOf(part);
      if (!component) continue;
      if (line.layer === "increased") { if (inList(component.increased, line)) { part.increasedPercent -= line.value; holders.push(part); } }
      else if (line.layer === "taken") { if (inList(component.taken, line)) { part.base /= 1 + line.value / 100; holders.push(part); } }
      else if (inList(component.additional, line) || inList(component.combatAdditional, line)) { part.additionalFactor /= 1 + line.value / 100; holders.push(part); }
    }
    return holders.length === target.parts.length ? undefined : [...new Set(holders.map((part) => part.type))];
  };
  // Claim the unclaimed lines that match, take them out and name them under the layer.
  target.claim = (key, test) => {
    const found = lines.filter((line) => !claimed.has(line) && test(line));
    for (const line of found) { claimed.set(line, key); ctx.reported(key).lines.push({ ...line }); }
    return found.map((line) => ({ ...line, types: target.takeOut(line), liveKey: key }));
  };
  target.claimPattern = (key, pattern) => target.claim(key, (line) => pattern.test(`${line.source} ${line.text}`));
  target.addModifier = (line, modifier) => target.modifiers.push({ source: line.source, text: line.text, layer: "additional", liveKey: line.liveKey, ...(line.types ? { types: line.types } : {}), ...modifier });
  target.addSpeed = (layerKey, line, modifier) => { if (target.speedKey) { ctx.addSpeed(target.speedKey, layerKey, line, modifier); target.rateGroups.add(RATE_GROUPS[layerKey] ?? layerKey); } };
  target.claimedKeys = () => new Set([...claimed.keys()].map(lineKey));
  ctx.targets.push(target);
  return target;
}

// ---------------------------------------------------------------------------------------------
// One builder per layer. Each takes its lines out of every target, and adds the events that switch them on, once.

export function aimLayer(ctx) {
  const aim = ownSeries(ctx.planner, "Aim", ctx.planner.aim);
  if (!ctx.isLive("aim") || !aim?.active) return;
  let any = false;
  for (const target of ctx.targets) {
    for (const line of target.claimPattern("aim", /^Aim\b/)) {
      // A while-active line is held at Aim's average: its full value is planner.aim.damagePercent.
      const full = /while active/.test(line.text) ? aim.damagePercent : line.value;
      target.addModifier(line, { buff: "aim", layer: line.layer === "increased" ? "increased" : "additional", percent: full, steadyAmount: line.value });
      any = true;
    }
    if (target.speedKey) { target.addSpeed("aim", { source: "Aim", text: `${aim.castSpeedPercent}% Attack and Cast Speed while active` }, { buff: "aim", layer: "increased", percent: aim.castSpeedPercent, steadyAmount: aim.averageCastSpeedPercent }); any = true; }
  }
  if (!any || !ctx.first("aim")) return;
  const speedDivisor = (1 + ctx.speeds.cooldown.increasedPercent / 100) * ctx.speeds.cooldown.additionalFactor;
  // Cooldown Recovery Speed is left in speeds.cooldown, so baseSeconds is Aim's own cooldown; one recharge timer for its Max Charges.
  ctx.triggers.push({
    key: "aim", actor: "player", label: `Aim (${aim.trigger?.text || "on cooldown"})`, intervalSeconds: aim.trigger?.everySeconds ?? FRAME_SECONDS,
    cooldown: { baseSeconds: aim.cooldownSeconds * speedDivisor, speedFactor: { speed: "cooldown" }, maxCharges: aim.maxCharges },
    effects: [{ kind: "buff", buff: "aim", seconds: aim.durationSeconds }]
  });
  ctx.reported("aim").events = `Preparation (node 253 + node 206): cast at the first check, then every ${aim.trigger?.everySeconds ?? "cooldown"} s when a charge is ready; ${aim.maxCharges} charges, one recharge timer, ${aim.durationSeconds} s buff`;
}

export function swiftBoltLayer(ctx) {
  if (!ctx.isLive("castsRecently")) return;
  for (const target of ctx.targets) {
    const line = target.claimPattern("castsRecently", /each time it was cast recently/)[0];
    if (!line) continue;
    const match = line.text.match(/^\+([\d.]+)% additional damage .*?up to (\d+) time/);
    if (!match) continue;
    const per = Number(match[1]), cap = per * Number(match[2]), collector = target.core ? "swiftBolt" : `castsRecently:${target.hit.key}`;
    target.addModifier(line, { collector, perStack: true, percent: per, capPercent: cap, steadyAmount: line.value });
    ctx.collectors.push({ key: collector, windowSeconds: RECENT_SECONDS, ...(ctx.prebuilt ? { seed: seedWindow(target.hit.rate.usesPerSecond) } : {}) });
    target.onUse.push({ kind: "collect", collector });
    ctx.reported("castsRecently").events = `one entry per use (game recipe 277886048; triggered casts counted, provisional), read for 120 ticks, up to ${match[2]}`;
  }
}

export function spellAggressionLayer(ctx) {
  if (!ctx.isLive("spellAggression")) return;
  const rate = (ctx.planner.lineEffects?.castSpeed?.sources || []).find((line) => /^Spell Aggression/.test(line.source));
  let any = false;
  for (const target of ctx.targets) {
    for (const line of target.claimPattern("spellAggression", /^Spell Aggression/)) { target.addModifier(line, { buff: "spellAggression", percent: line.value, steadyAmount: line.value }); any = true; }
    if (rate && target.speedKey && target.speedKind === "cast") { target.addSpeed("spellAggression", rate, { buff: "spellAggression", layer: "additional", percent: rate.value, steadyAmount: rate.value }); any = true; }
    // Game recipe 174779504: every Spell cast renews buff 3421.
    if (isSpell(target.hit)) target.onUse.push({ kind: "buff", buff: "spellAggression", seconds: SPELL_AGGRESSION_SECONDS });
  }
  if (!any) { for (const target of ctx.targets) target.onUse = target.onUse.filter((effect) => effect.buff !== "spellAggression"); return; }
  if (ctx.prebuilt && ctx.first("spellAggression")) ctx.initialBuffs.push({ buff: "spellAggression", seconds: SPELL_AGGRESSION_SECONDS });
  ctx.reported("spellAggression").events = `every Spell cast renews it (game recipe 174779504, buff 3421, ${SPELL_AGGRESSION_SECONDS} s)${ctx.prebuilt ? "; held at engagement (prebuilt)" : ""}`;
}

export function periodicBurstLayer(ctx) {
  const burst = ownSeries(ctx.planner, "Periodic Burst", ctx.planner.periodicBurst);
  const entry = burst?.entries?.find((item) => item.active), line = burst?.lines?.[0];
  if (!ctx.isLive("periodicBurst") || !entry || !line) return;
  const full = Number((String(line.source).match(/\+([\d.]+)% ×/) || [])[1]) || entry.value / entry.uptime;
  let any = false;
  for (const target of ctx.targets) if (target.speedKey) { target.addSpeed("periodicBurst", { source: line.source, text: line.text }, { buff: "periodicBurst", layer: "increased", percent: full, steadyAmount: entry.value }); any = true; }
  if (!any || !ctx.first("periodicBurst")) return;
  // The Mobility skill is used constantly (user rule 2026-10-14): a stack every max(6 s, its cooldown), from t = 0. Recipe 651295 is a Wait
  // node, not node 206; the planner's period holds (provisional, as the planner's).
  ctx.periodics.push({ key: "periodicBurst", actor: "player", label: entry.skill, intervalSeconds: entry.periodSeconds, effects: [{ kind: "buff", buff: "periodicBurst", seconds: entry.durationSeconds }] });
  ctx.reported("periodicBurst").events = `+${full}% for ${entry.durationSeconds} s every ${entry.periodSeconds} s from t = 0`;
}

export const blessingSeconds = (planner, name) => blessingDurationSeconds(planner.modifierTexts || [], name);

/**
 * A Blessing the build gains only from the dummy (user decisions 2026-11-02): when Reaping ("Gains 1 stack(s) of Focus Blessing when Reaping"), on
 * hit, on Critical Strike or on Non-Critical Strikes (Youga's Agility on crit, Grace Boots' Focus). The dummy starts clean, so `prebuiltSelfBuffs`
 * does not hold it: it starts at 0 at engagement and builds from those events. A gain that needs no target (a timer, a skill use, moving) keeps the
 * pre-built reading for the whole Blessing. Returns the gains ({ reap, hits: [{ when: "hit" | "crit" | "nonCrit", chance, stacks }] }), or null.
 */
export const onTargetBlessing = (entry) => {
  if (!entry || entry.consumptionCycle) return null;
  const gains = (entry.gainSources || []).filter((item) => item.available !== false);
  const kindOf = (text) => /\bwhen Reaping\b/i.test(text) ? "reap" : /\bNon-Critical Strikes?\b/i.test(text) ? "nonCrit" : /\bon Critical Strike\b/i.test(text) ? "crit" : /\bon hit\b/i.test(text) ? "hit" : DAMAGE_GAIN.test(text) ? "damage" : null;
  const read = gains.map((item) => ({ text: String(item.text || ""), kind: kindOf(String(item.text || "")) }));
  if (!read.length || read.some((item) => !item.kind)) return null;
  const hits = read.filter((item) => item.kind !== "reap").map(({ text, kind }) => {
    const states = targetStatesOf(text), interval = Number((text.match(/\bInterval: ?(\d+(?:\.\d+)?) ?s\b/i) || [])[1]);
    return { when: kind, chance: Math.min(1, (Number((text.match(/(\d+(?:\.\d+)?) ?% chance/i) || [])[1]) || 100) / 100), stacks: Number((text.match(/(\d+) stacks?(?:\(s\))? of/i) || [])[1]) || 1,
      ...(states ? { states } : {}), ...(interval > 0 ? { intervalSeconds: interval } : {}) };
  });
  return { reap: read.some((item) => item.kind === "reap"), hits };
};
// A gain on dealing damage to the dummy, or on hitting it (game records 424329 and 2793789: trigger 1000030, your hits and your DoT's damage; 2359509:
// trigger 1000033, your hits): it needs the dummy, so it builds from 0 like the "on hit" gains (user decision 2026-11-02). On the layers it lands
// on the loop's hits (src/blessing-model.js gainCondition reads the same wordings).
const DAMAGE_GAIN = /\b(?:upon|when) (?:dealing|inflicting) damage\b|\bwhen hitting an? enem/i;
// The dummy state a gain needs, from its record's trigger tags on the other unit ("others": 424329 on 4000112 Frostbitten, 2793789 on 4000130
// Ignited, 2359509 on 4000570 the Elemental Ailment group: Ignite, Frostbite, Freeze, Numbed, game keyword 101; 4000580 any Ailment adds Trauma
// and Wilt), read from the same wordings as src/blessing-model.js: the ailment types of which one must be held, or null.
const TARGET_STATE_WORD = /\b(?:to|against) (?:an? )?(Ignited|Frostbitten|Frozen|Numbed|Traumatized|Wilted|Withered|Shocked) enem(?:y|ies)\b/i;
const TARGET_STATE_GROUP = /\ban? enem(?:y|ies) (?:with|affected by) (Elemental )?Ailments?\b/i;
const TARGET_STATE_TYPES = Object.freeze({ ignited: "Ignite", frostbitten: "Frostbite", frozen: "Frozen", numbed: "Numbed", traumatized: "Trauma", wilted: "Wilt", withered: "Wilt", shocked: "Shock" });
const ELEMENTAL_STATE_TYPES = ["Ignite", "Frostbite", "Frozen", "Numbed"];
function targetStatesOf(text) {
  const word = String(text).match(TARGET_STATE_WORD);
  if (word) return [TARGET_STATE_TYPES[word[1].toLowerCase()]];
  const group = String(text).match(TARGET_STATE_GROUP);
  return group ? (group[1] ? ELEMENTAL_STATE_TYPES : [...ELEMENTAL_STATE_TYPES, "Trauma", "Wilt"]) : null;
}
/** The texts of onTargetBlessing's hit gains, in its order (the trigger bus matches a gain it owns by its text). */
const onTargetHitTexts = (entry) => (entry?.gainSources || []).filter((item) => item.available !== false).map((item) => String(item.text || "")).filter((text) => !/\bwhen Reaping\b/i.test(text));
/** The Reap case of onTargetBlessing (the 2026-11-02 Reap-only rule): a gain when Reaping, every other gain on the dummy too. */
export const reapOnlyBlessing = (entry) => Boolean(onTargetBlessing(entry)?.reap);

// An on-target Blessing's hit gains on every hit on the loop: one crit determination per hit group (game recipe 103010039 for Agility on crit, node
// 188 chance), at the gain's chance × the share of determinations that crit (or do not). Returns whether any gain landed on a hit. A gain the trigger
// bus owns (src/trigger-bus.js, its record on trigger 1000033) is the bus's: it fires there, from every hit of its event.
function placeHitGains(ctx, gains, buff, seconds, maxStacks, entry) {
  let placed = false;
  const texts = onTargetHitTexts(entry);
  const owned = (index) => Boolean(ctx.bus?.ownsBlessingGain(entry.name, texts[index]));
  if (gains.hits.some((gain, index) => owned(index)) && ctx.bus.placesBlessing(entry.name)) placed = true;
  // A gain gated on the dummy's state reads it on the loop (holdTargetStates), and its record's gate 206 (Interval) closes it after a gain.
  const gated = new Map(gains.hits.map((gain, index) => [index, gain.states && !owned(index) ? holdTargetStates(ctx, gain.states) : null]));
  for (const target of ctx.targets) {
    const crit = Math.max(0, Math.min(1, (target.hit.crit?.chancePercent ?? 0) / 100));
    gains.hits.forEach((gain, index) => {
      if (owned(index)) return;
      const share = gain.when === "crit" ? crit : gain.when === "nonCrit" ? 1 - crit : 1, state = gated.get(index);
      const probability = gain.chance * share * (state?.share ?? 1);
      if (!(probability > 0)) return;
      const key = gain.states || gain.intervalSeconds ? `${buff}Blessing:${gain.when}:${index}` : `${buff}Blessing:${gain.when}`;
      target.onHit.push({ kind: "chance", key, probability, ...(gain.intervalSeconds ? { gate: { fixedSeconds: gain.intervalSeconds } } : {}), ...(state?.keys?.length ? { requiresAny: state.keys } : {}), effects: [{ kind: "buff", buff, seconds, stacks: gain.stacks, maxStacks, layered: true }] });
      placed = true;
    });
  }
  // The states' own events after the gains: a hit's gain reads the state the earlier hits left (as a hit reads its own Frail only from the next).
  for (const state of gated.values()) for (const type of state?.inflict || []) addStateEvent(ctx, type);
  return placed;
}

// The dummy states a gated gain reads on the loop: each type the planner holds on the dummy, as the buff `ailment:<Type>` the per-type layer uses
// (ailmentTypeLayer), on each of its inflicting hits (the follower's casts when it inflicts it; addAilmentEvent). A type only your Minions keep is
// not on the loop: when only such types hold, the gain reads the planner's share of the largest instead of a gate. Returns { keys, inflict, share }
// (share null with a gate), or { keys: [], share: 0 } when the planner holds none of them (the Blessing model then leaves the gain unavailable).
function holdTargetStates(ctx, types) {
  const state = ctx.planner.lineEffects?.state || {}, buffs = enemyBuffSet(state);
  const held = types.filter((type) => buffs ? buffs.holds(type) : (state.enemyAilments || []).includes(type));
  const minionOnly = (type) => Boolean(ctx.bus?.ownsMinionAilment?.(type)) || (buffs ? buffs.heldOnlyBy(type, "minion", { stage: "model" }) : Object.prototype.hasOwnProperty.call(state.enemyAilmentUptime || {}, type));
  const onLoop = held.filter((type) => !minionOnly(type));
  if (onLoop.length) return { keys: onLoop.map((type) => `ailment:${type}`), inflict: onLoop, share: null };
  const shareOf = (type) => buffs ? buffs.share(type, { stage: "model" }) : Number(state.enemyAilmentUptime?.[type]) || 0;
  return { keys: [], inflict: [], share: held.length ? Math.max(...held.map(shareOf)) : 0 };
}
function addStateEvent(ctx, type) {
  ctx.targetStateEvents ??= new Set();
  if (ctx.targetStateEvents.has(type)) return;
  ctx.targetStateEvents.add(type);
  addAilmentEvent(ctx, type, { kind: "buff", buff: `ailment:${type}`, seconds: AILMENT_SECONDS[type] ?? 4 }, stateDealt(type));
}
const stateDealt = (type) => type === "Frostbite" || type === "Frozen" ? "Cold" : type === "Numbed" ? "Lightning" : null;

// A Blessing's own per-stack line (src/planner.js: "<Blessing> Blessing (blessing model)"). With Divine Grace (the base effect replaced by +4%
// additional damage per stack, src/blessing-model.js) the line is "<Blessing> Blessing (Divine Grace) (blessing model)": it reads the loop's stacks
// only when something on the loop keeps that Blessing up as in game (`kept`: a gain the layers place, its on-target gains building it, or the trigger
// bus renewing its use, Regain or Minion gains, W10 step 3c). Else it stays held at the planner's value: on the layers nothing renews a gain on a
// skill use, so claiming it there would show a lapse that does not happen in game (Erika's Focus and Agility, 10 s in).
const ownBlessingLine = (name, kept) => new RegExp(kept ? String.raw`^${name} Blessing (?:\(Divine Grace\) )?\(blessing model\)` : String.raw`^${name} Blessing \(blessing model\)`);
const busRenews = (ctx, name) => Boolean(ctx.bus?.owned?.useBlessings?.includes(name) || ctx.bus?.owned?.eventBlessings?.includes(name));
// A Blessing gained when using Mobility Skills (Bladerunner's "Gains a stack Agility Blessing when using Mobility Skills"): by the user rule of
// 2026-10-14 the gain is active whenever an enabled Mobility skill is on the board (the Blessing model makes it available only then), as the
// "after using Mobility Skills" lines are (held, nothing to time). So with the Blessing pre-built at engagement it stays held for the fight
// instead of lapsing after its duration with nothing on the layers renewing a use gain; the trigger bus renews it from the loop's uses instead.
const mobilityHeld = (ctx, entry, name) => (entry?.gainSources || []).some((item) => item.available !== false && /\bwhen using (?:a )?Mobility Skills?\b/i.test(String(item.text || ""))) && !busRenews(ctx, name);

export function blessingLayer(ctx) {
  if (!ctx.isLive("blessings")) return;
  const { planner } = ctx;
  const entries = ownBlessingEntries(planner);
  const focus = entries.find((entry) => entry.name === "Focus"), agility = entries.find((entry) => entry.name === "Agility");
  const perStackLines = (planner.lineEffects?.lines || []).filter((line) => line.status === "In calc" && ["blessingPerStack", "blessingActive"].includes(line.condition));
  const bodyOf = (line) => (line.bodies || []).map((body) => body.derivedText).filter(Boolean);
  let any = false;
  if (focus?.stacks > 0) {
    const seconds = blessingSeconds(planner, "Focus");
    const focusPeriodic = Number((String((focus.gainSources || []).find((item) => item.available !== false && /every ([\d.]+) ?s/.test(item.text))?.text).match(/every ([\d.]+) ?s/) || [])[1]) > 0;
    // A gain on each Spell Burst activation (record 816003904, trigger 1000303; src/blessing-model.js): it needs no target, so the Blessing is
    // pre-built at engagement and the loop renews it at the activations' rate (one gain per activation, Overload's included; user-confirmed
    // 2026-11-10), so the stacks do not lapse after the Blessing's duration.
    const burstGain = (focus.gainSources || []).find((item) => item.available !== false && Number(item.ratePerSecond) > 0 && /when consuming Spell Burst/i.test(String(item.text || "")));
    const focusKept = focusPeriodic || Boolean(burstGain) || Boolean(onTargetBlessing(focus)) || busRenews(ctx, "Focus");
    for (const target of ctx.targets) {
      for (const line of target.claimPattern("blessings", ownBlessingLine("Focus", focusKept))) { target.addModifier(line, { buff: "focus", perStack: true, percent: line.value / focus.stacks, steadyAmount: line.value }); any = true; }
      for (const source of perStackLines.filter((line) => /Focus Blessing/.test(line.text))) {
        for (const text of bodyOf(source)) {
          const lines = target.claim("blessings", (line) => line.source === source.source && line.text === text);
          for (const line of lines) { target.addModifier(line, source.condition === "blessingActive" ? { buff: "focus", layer: line.layer === "increased" ? "increased" : "additional", percent: line.value, steadyAmount: line.value } : { buff: "focus", perStack: true, layer: line.layer === "increased" ? "increased" : "additional", percent: line.value / focus.stacks, steadyAmount: line.value }); any = true; }
          // A Critical Strike Damage line sits in the crit sum, not the damage ledger.
          const crit = text.match(/^\+(\d+(?:\.\d+)?)% Critical Strike Damage$/);
          if (crit && !lines.length && target.crit) {
            const value = Number(crit[1]);
            target.crit.damagePercent -= value;
            target.modifiers.push({ source: source.source, text, buff: "focus", perStack: true, layer: "critDamage", liveKey: "blessings", percent: value / focus.stacks, steadyAmount: value });
            ctx.reported("blessings").lines.push({ layer: "crit", source: source.source, text, value });
            any = true;
          }
        }
      }
    }
    const gain = (focus.gainSources || []).find((item) => item.available !== false && /every ([\d.]+) ?s/.test(item.text));
    const every = Number((String(gain?.text).match(/every ([\d.]+) ?s/) || [])[1]);
    if (ctx.first("focusGain")) {
      // Game recipe 5583405 (Night Feather): while buff 12090 is up, 1 stack every P1 s (node 206, buff 380, its record's duration). A gain
      // tied to the Clockwork Core's Tangles waits for the Core; any other periodic gain runs from t = 0.
      const needsCore = ctx.targets.some((target) => target.core) && /Night Feather|Tangle|Clockwork/.test(`${gain?.source} ${gain?.text}`);
      if (burstGain) ctx.periodics.push({ key: "focusSpellBurstGain", actor: "player", label: burstGain.source, intervalSeconds: 1 / burstGain.ratePerSecond, effects: [{ kind: "buff", buff: "focus", seconds, stacks: Number((String(burstGain.text).match(/\b(\d+) stacks?(?:\(s\))?/i) || [])[1]) || 1, maxStacks: focus.maxStacks, layered: true }] });
      if (every > 0) ctx.periodics.push({ key: "focusGain", actor: "player", label: gain.source, intervalSeconds: every, ...(needsCore ? { requiresBuff: "coreActive" } : {}), effects: [{ kind: "buff", buff: "focus", seconds, stacks: 1, maxStacks: focus.maxStacks, layered: true }] });
      // A gain only from the dummy (onTargetBlessing) starts at 0: its hit gains go on the hits here, src/tick-ledger.js puts a Reap gain on the
      // Reaps on the loop, src/tick-ailments.js the stacks on the DoT paths.
      const gains = onTargetBlessing(focus);
      if (gains) { addTargetBlessing(ctx, { buff: "focus", name: "Focus", stacks: focus.stacks, seconds, gains, hitPlaced: placeHitGains(ctx, gains, "focus", seconds, focus.maxStacks, focus) }); any = true; }
      // A Blessing the trigger bus builds from its only gains, on Regains or your Minions' damage (W10 step 3c), starts at 0 as well.
      else if (ctx.prebuilt && !ctx.bus?.busBuildsBlessing?.("Focus")) ctx.initialBuffs.push(mobilityHeld(ctx, focus, "Focus") ? { buff: "focus", stacks: focus.stacks, seconds: Infinity, layered: true } : prebuiltBlessing("focus", focus, seconds, focus.layers?.reading === "periodic" ? every : 0));
    }
  }
  // Agility a Regain spends (node 623, W10 step 4a): the planner holds the cycle's average (src/consumption-procs.js regainAgilitySpend). The loop
  // runs the spend only when the trigger bus raises the Regains and holds the gate-184 row that spends it: then Agility runs from its own gains
  // (its stacks before the spend, which may average 0) and the bus's Regains take them. Otherwise nothing on the loop spends it: held at the planner's.
  const regainSpend = planner.lineEffects?.state?.consumption?.regainSpend;
  const spentOnRegain = Boolean(regainSpend?.active && agility);
  const busSpends = spentOnRegain && Boolean(ctx.bus?.spendsBlessing?.("agility"));
  if (spentOnRegain && !busSpends && ctx.first("agilityRegainSpend")) ctx.reported("blessings").lines.push({ layer: "held", source: "Agility Blessing (blessing model)", text: `held at the planner's ${agility.stacks} (Regains spend it; nothing on the loop spends it without the trigger bus's Regains)`, value: agility.stacks });
  if ((agility?.stacks > 0 && !spentOnRegain) || (busSpends && (agility.heldBeforeConsumption ?? agility.stacks) > 0)) {
    const seconds = blessingSeconds(planner, "Agility");
    const speedPer = agility.stacks > 0 ? agility.attackAndCastSpeedPercent / agility.stacks : 0;
    const gains = onTargetBlessing(agility);
    const gain = (agility.gainSources || []).find((item) => /(\d+(?:\.\d+)?)% chance to gain Agility Blessing on Critical Strike/i.test(item.text));
    const chance = Number((String(gain?.text).match(/(\d+(?:\.\d+)?)% chance/) || [])[1]) / 100;
    const agilityKept = Boolean(gains) || chance > 0 || busRenews(ctx, "Agility");
    for (const target of ctx.targets) {
      // (A Regain spend can leave the planner's average at 0: no per-stack value to read then, and the lines hold 0.)
      if (agility.stacks > 0) for (const line of target.claimPattern("blessings", ownBlessingLine("Agility", agilityKept))) { target.addModifier(line, { buff: "agility", perStack: true, percent: line.value / agility.stacks, steadyAmount: line.value }); any = true; }
      if (speedPer && target.speedKey) { target.addSpeed("blessings", { source: "Agility Blessing (blessing model)", text: `+${speedPer}% Attack and Cast Speed per stack` }, { buff: "agility", perStack: true, layer: "increased", percent: speedPer, steadyAmount: agility.attackAndCastSpeedPercent }); any = true; }
      // Game recipe 103010039: on a crit, node 188 chance, buff 320. One crit determination per hit group. (An on-target Agility places it below.)
      if (!gains && chance > 0 && target.hit.crit?.chancePercent > 0 && !ctx.bus?.ownsBlessingGain("Agility", gain.text)) target.onHit.push({ kind: "chance", key: "agilityBlessing", probability: chance * target.hit.crit.chancePercent / 100, effects: [{ kind: "buff", buff: "agility", seconds, stacks: 1, maxStacks: agility.maxStacks, layered: true }] });
    }
    if (ctx.first("agilityStart")) {
      if (gains) addTargetBlessing(ctx, { buff: "agility", name: "Agility", stacks: agility.stacks, seconds, gains, hitPlaced: placeHitGains(ctx, gains, "agility", seconds, agility.maxStacks, agility) });
      // Pre-built Agility a Regain spends on the loop starts at its stacks before the spend (the Regains take them from there).
      else if (ctx.prebuilt && !ctx.bus?.busBuildsBlessing?.("Agility")) ctx.initialBuffs.push({ buff: "agility", stacks: busSpends ? agility.heldBeforeConsumption ?? agility.stacks : agility.stacks, seconds: !busSpends && mobilityHeld(ctx, agility, "Agility") ? Infinity : seconds, layered: true });
      if (busSpends) any = true;
    }
  }
  const fromZero = (ctx.targetBlessings || []).map((item) => `${item.name} from 0, built on ${[item.gains.reap ? "the Reaps" : "", item.gains.hits.length ? "the hits" : ""].filter(Boolean).join(" and ")} (its only gains)`);
  const mobility = ctx.prebuilt ? [focus?.stacks > 0 && !onTargetBlessing(focus) && mobilityHeld(ctx, focus, "Focus") ? "Focus" : null, agility?.stacks > 0 && !spentOnRegain && !onTargetBlessing(agility) && mobilityHeld(ctx, agility, "Agility") ? "Agility" : null].filter(Boolean) : [];
  const held = mobility.length ? `${mobility.join(" and ")} held for the fight (gained when using Mobility Skills: active while a Mobility skill is on the board, user rule 2026-10-14); ` : "";
  if (any) ctx.reported("blessings").events = `Focus ${focus?.stacks ?? 0}, Agility ${agility?.stacks ?? 0}: ${fromZero.length ? `${fromZero.join("; ")}; ` : ""}${held}${ctx.prebuilt ? "the rest full at engagement (prebuilt), " : "from zero, "}each gain a layer on its own timer (the oldest out at the cap; SS14 client, blessing-layer-timers)`;
}

/**
 * A Blessing held at engagement (prebuiltSelfBuffs), layered: its stacks all ending at its duration, as built just before engaging; a periodic gain
 * (every T s) that cannot hold the max (T × max > duration) starts on the layers its gains leave at engagement instead, the steady pattern
 * (gains at −T, −2T, … still running), so the opening does not hold more than the gain can.
 */
export function prebuiltBlessing(buff, entry, seconds, everySeconds = 0) {
  const max = entry.maxStacks ?? entry.stacks;
  if (!(everySeconds > 0) || !(everySeconds * max > seconds) || !Number.isFinite(seconds)) return { buff, stacks: entry.stacks, seconds, layered: true };
  const layers = [];
  for (let k = 1; k * everySeconds < seconds - 1e-9 && layers.length < max; k += 1) layers.push({ seconds: seconds - k * everySeconds, stacks: 1 });
  return { buff, stacks: layers.length, seconds, layered: true, layers };
}

// An on-target Blessing (onTargetBlessing): src/tick-ledger.js puts its Reap gain on the loop's Reaps, or holds it when nothing can build it.
function addTargetBlessing(ctx, entry) {
  ctx.targetBlessings = [...(ctx.targetBlessings || []), entry];
}

/**
 * The trigger bus's readers (W10 steps 1 and 2a, src/trigger-bus.js): a crowd control counter (Wings of Light's Intimidated added effect, the "for
 * every type of crowd control" counter, Self-Delusion) whose types or Intimidated the bus holds reads the loop on every hit: its derived line comes
 * out at the planner's value and goes back at the count held on this tick. A counter the planner times (its timed effect) is dropped from the
 * recount's series on that hit. A timed part the bus holds (Paralysis's damage taken, when the bus drives both of your triggers) stays in the
 * recount's series and a correction puts the loop's level in its place on each hit the series reaches (the DoT, beam and Minion paths take the same
 * correction in src/tick-ailments.js and src/tick-minions.js). The bus's own events (crowd control, Paralysis, Intimidated, Blessing gains) need
 * nothing here: the engine raises them from each hit's path and each DoT record of yours.
 */
export function triggerBusLayer(ctx) {
  const bus = ctx.bus;
  if (!bus) return;
  ctx.labels.set("triggerBus", `Trigger bus (${[...bus.ids].join(", ")})`);
  const read = new Set();
  for (const counter of bus.counters) {
    for (const target of ctx.targets) {
      const lines = target.claim("triggerBus", (line) => line.source === counter.source && counter.bodies.includes(line.text));
      for (const line of lines) target.addModifier(line, { layer: "additional", steadyAmount: line.value, amount: (world) => bus.counterPercent(counter, world) });
      if (lines.length) { read.add(counter.source); if (counter.timedId) target.timedIds.add(counter.timedId); }
    }
  }
  const timed = ctx.planner.dummyRecount?.inputs?.timedEffects;
  if (bus.timedParts?.length && ctx.isLive("timed") && timed?.parts?.length) {
    for (const target of ctx.targets) {
      const correction = bus.timedCorrection(timed.shares?.[target.hit.key]);
      if (correction) { target.modifiers.push(correction); read.add(`${bus.timedParts.map((part) => part.name).join(", ")} on ${target.hit.name}`); }
    }
  }
  // Blur on the hits (W10 step 3a, src/trigger-bus.js blurCorrection): a hit part whose ledger holds a line read while Blur is active reads the
  // share of the tick the bus holds Blur (the DoT paths take theirs in src/tick-ailments.js).
  if (bus.owned.blur) for (const target of ctx.targets) {
    const corrections = bus.blurCorrection({ kind: "hit", key: target.hit.key, parts: target.parts });
    if (corrections.length) { target.modifiers.push(...corrections); read.add(`Blur on ${target.hit.name}`); }
  }
  // Profane on the hits (W10 step 4b, src/trigger-bus.js profaneCorrection): a hit part whose ledger holds Profane's line reads the share of the tick
  // the bus holds Profane, from your Wilt applications (the DoT paths take theirs in src/tick-ailments.js).
  if (bus.owned.profane) for (const target of ctx.targets) {
    const corrections = bus.profaneCorrection({ kind: "hit", key: target.hit.key, parts: target.parts });
    if (corrections.length) { target.modifiers.push(...corrections); read.add(`Profane on ${target.hit.name}`); }
  }
  // W10 step 3b: each use of a hit skill raises its use event (src/trigger-bus.js useEffect), with the share of one planner use the action is: a
  // Tangle's cast, a cast or an area 1, a channel's hit 1 ÷ its hits per use, a Combo step 1 ÷ the steps (src/tick-plain-skills.js), a static
  // stream's use 1 (src/tick-ledger.js). It lands with the use's other on-use events, before its hits.
  let uses = 0;
  if (bus.useIds?.length) for (const target of ctx.targets) {
    const kind = target.core ? null : plainUseKind(target.hit);
    const units = kind === "channel" ? 1 / (Number(target.hit.rate.hitsPerUse) || 1) : kind === "cycle" ? 1 / (target.hit.profile?.cycle?.steps?.length || 1) : 1;
    const effect = bus.useEffect(target.hit.key, units);
    if (effect) { target.onUse.push(effect); uses += 1; }
  }
  // Willpower's stacks (src/trigger-bus.js section 7) on its skill's hits: the clause's line at ((1 + X%)^stacks − 1), as a share of the planner's
  // ((1 + X%)^cap − 1), so at the cap it is the planner's value exactly.
  for (const holder of bus.willpower || []) for (const target of ctx.targets.filter((item) => item.hit.setupKey === holder.setupKey)) {
    const lines = target.claim("triggerBus", (line) => line.source === holder.source && String(line.text).startsWith(holder.text));
    const atCap = (1 + holder.perStackPercent / 100) ** holder.cap - 1;
    for (const line of lines) target.addModifier(line, { layer: line.layer === "increased" ? "increased" : "additional", steadyAmount: line.value, amount: (world) => line.value * ((1 + holder.perStackPercent / 100) ** world.bus.useStacks(holder.key) - 1) / atCap });
    if (lines.length) read.add(`Willpower on ${target.hit.name}`);
  }
  // The Fervor Rating (section 12, census C1): built from 0 on your hits; each reader linear in the Rating at the Rating held on this tick.
  if (bus.fervor) fervorReaders(ctx, bus.fervor, read);
  // An Aura's own stacks (section 13: Precise: Cruelty): the Aura's lines its Aura Effect scales, at (1 + 2.5% × the stacks held) over the
  // planner's held factor (40 stacks: ×2). Its buff on your Minions keeps the planner's held value (their paths are not read here).
  for (const spec of bus.auraStacks || []) for (const target of ctx.targets) {
    const lines = target.claim("triggerBus", (line) => line.layer !== "taken" && String(line.source).startsWith(`Aura: ${spec.aura} /`) && spec.scaled.some((value) => Math.abs(value - line.value) < 1e-6));
    const factor = (world) => (1 + spec.perStackPercent * Math.min(spec.maxStacks, world.buffs.get(spec.buffKey)?.stacks || 0) / 100) / spec.heldFactor;
    for (const line of lines) { withExtras(target, line); target.addModifier(line, { layer: line.layer === "increased" ? "increased" : "additional", steadyAmount: line.value, amount: (world) => line.value * factor(world) }); }
    if (lines.length) read.add(`${spec.aura}'s stacks on ${target.hit.name}`);
  }
  // The "used recently" windows (section 8) on every hit: each derived damage line at the share of the tick its window is held.
  for (const recent of bus.recentWindows || []) for (const target of ctx.targets) {
    const lines = target.claim("triggerBus", (line) => line.source === recent.source && line.layer !== "taken" && recent.bodies.includes(line.text));
    for (const line of lines) target.addModifier(line, { layer: line.layer === "increased" ? "increased" : "additional", steadyAmount: line.value, amount: (world) => world.bus.selfShare(recent.name) * line.value });
    if (lines.length) read.add(`${recent.name} on ${target.hit.name}`);
  }
  // W10 step 3c: the "Regained in the last N s" windows and stacks (src/trigger-bus.js section 10) on every hit's damage lines and on the Cast or
  // Attack Speed lines that carry them (each speed once): the planner's value × the loop's stacks over the planner's (a window: its value while a
  // Regain is held), from 0 at engagement.
  for (const counter of bus.regainCounters || []) {
    const ratio = (world) => { const held = world.bus.regainStacks(counter.key); return Number.isFinite(counter.cap) ? Math.min(counter.cap, held) / counter.plannerStacks : held > 0 ? 1 : 0; };
    const speeds = new Set();
    for (const target of ctx.targets) {
      const lines = target.claim("triggerBus", (line) => line.source === counter.source && line.layer !== "taken" && counter.bodies.includes(line.text));
      for (const line of lines) target.addModifier(line, { layer: line.layer === "increased" ? "increased" : "additional", steadyAmount: line.value, amount: (world) => line.value * ratio(world) });
      const speedSources = target.speedKind === "attack" ? target.attackSources : target.speedKind === "cast" ? ctx.planner.lineEffects?.castSpeed?.sources : null;
      const carried = target.speedKey && !speeds.has(target.speedKey) ? (speedSources || []).filter((item) => item.source === counter.source && counter.bodies.includes(item.text) && Number(item.value)) : [];
      for (const speed of carried) target.addSpeed("triggerBus", { source: speed.source, text: speed.text }, { layer: speed.additional ? "additional" : "increased", steadyAmount: Number(speed.value), amount: (world) => Number(speed.value) * ratio(world) });
      if (carried.length) speeds.add(target.speedKey);
      if (lines.length || carried.length) read.add(`${counter.text} on ${target.hit.name}`);
    }
  }
  const owned = [...bus.owned.crowdControl, ...(bus.owned.paralysis ? ["Paralysis"] : []), ...(bus.owned.intimidated ? ["Intimidated"] : []), ...(bus.owned.minionAilments || []).map((name) => `${name} (your Minions')`)];
  const report = ctx.reported("triggerBus");
  const raised = [bus.ids.has(1000033) || bus.ids.has(1000030) ? "each hit of yours that lands (one event per projectile or strike)" : "", bus.ids.has(1000030) ? "each tick a DoT record of yours deals damage" : "", bus.ids.has(1000032) || bus.ids.has(1000030) ? "each Reap" : "", uses ? `each use of your ${uses} hit skill${uses === 1 ? "" : "s"} (split by the planner's use sources)` : "", bus.inflictIds?.length ? "each ailment or DoT application of yours that lands (1000150 once, 1000160 per layer)" : ""].filter(Boolean);
  const useText = `${bus.owned.useBlessings?.length ? `; ${bus.owned.useBlessings.join(", ")} Blessing renewed by your uses (pre-built at engagement)` : ""}${bus.owned.willpower?.length ? "; Willpower's stacks from your own uses of its skill" : ""}${bus.owned.recentUse?.length ? `; ${bus.owned.recentUse.join(", ")} held from your uses` : ""}`;
  const blurText = bus.owned.blur ? `; Blur from 0, held while a gain of it is younger than its duration (its gains are all on the bus), read by ${bus.blur.dots.size + bus.blur.hits.size ? `${bus.blur.dots.size} DoT path${bus.blur.dots.size === 1 ? "" : "s"} and ${bus.blur.hits.size} hit${bus.blur.hits.size === 1 ? "" : "s"}` : "nothing on the loop"}` : bus.seen?.length ? `; ${bus.seen.join(", ")} seen, not owned${bus.seenReasons?.Blur ? ` (${bus.seenReasons.Blur})` : ""}` : "";
  // Step 4b: Profane from your Wilt applications, the Reaps on applying an ailment.
  const inflictReaps = Object.entries(bus.owned.inflictReaps || {});
  const inflictText = `${bus.owned.profane ? "; Profane from 0, held 10 s from each application of yours that fits its gain, read on its line's hit parts and DoTs" : bus.seenReasons?.Profane ? `; Profane seen, not owned (${bus.seenReasons.Profane})` : ""}${inflictReaps.length ? `; ${inflictReaps.map(([key, ailments]) => `${key} fired by ${ailments.join(", ")} applications`).join("; ")}` : ""}`;
  const stacksText = bus.owned.reapStacks?.length ? `; Reaping Duration stacks from 0 on the Reaps (${bus.owned.reapStacks.join("; ")}), each Reap's seconds at the stacks held on its tick` : "";
  // Step 3c: your Minions' hits and your Regains.
  const minionRegainText = `${bus.ids.has(1000047) ? "; your Minions' hits raise 1000047 (and their own 1000033 / 1000030 on them)" : ""}${bus.regainPools?.length ? `; your Regains (${bus.regainPools.map((pool) => `${pool.key === "life" ? "Life" : "Energy Shield"} every ${pool.intervalSeconds} s`).join(", ")}) on your hits` : ""}${bus.owned.eventBlessings?.length ? `; ${bus.owned.eventBlessings.join(", ")} Blessing renewed by Regains or your Minions' damage` : ""}${bus.owned.regainWindows?.length ? `; "Regained in the last N s" lines (${bus.owned.regainWindows.length}) from 0 on the Regains` : ""}`;
  report.events = `trigger ${[...bus.ids].join(", ")} raised by ${raised.join(", ")}; ${bus.listeners.length} listener${bus.listeners.length === 1 ? "" : "s"}: ${owned.length ? `${owned.join(", ")} held on the dummy while an event that could have put it there is younger than its duration (expected values)` : "no buff on the dummy"}${bus.owned.blessings.length ? `; ${bus.owned.blessings.join(", ")} Blessing gains through the chance accumulator` : ""}${bus.owned.reapBlessings?.length ? `; ${bus.owned.reapBlessings.join(", ")} Blessing gains on your Reaps` : ""}${blurText}${inflictText}${stacksText}${useText}${minionRegainText}${bus.owned.firstFlake ? "; First Flake of Strange Snow's deemed Frostbite Rating counts the types on the loop" : ""}${read.size ? `; read on the loop by ${[...read].join(", ")}` : ""}`;
}

// A hit's crit chance as a function of the Fervor Rating held (census C1): the Fervor crit rating line is an increased term, so each crit state's
// rating loses (base + flat) × its additional factor × the line's percent × (1 − R ÷ held), at most 100% per state, Lucky-converted per state
// (src/crit-time-states.js). Null when the crit is fixed (guaranteed, cannot crit) or the reconstruction does not give back the planner's chance.
// Lucky Critical Strike re-rolls a determination: 1 − (1 − p)^rolls (src/lucky-damage.js luckyCritChance; kept here, the engine modules import no planner module).
const luckyCritChance = (percent, rolls) => (1 - (1 - Math.max(0, Math.min(1, percent / 100))) ** rolls) * 100;
function fervorCritChance(hit, percent) {
  const crit = hit.crit;
  if (!crit || crit.guaranteedCrit || crit.cannotCritShare > 0 || !(percent > 0)) return null;
  const rolls = crit.luckyCritCombat ? 2 : 1;
  const attack = crit.attackCrit;
  let states, step;
  if (attack && Number.isFinite(attack.weaponRating)) {
    // A support's rating on the attack (Precise: Fearless's Melee rating) sits on top of the weapon's states.
    const extra = crit.supportRating?.rating > 0 ? crit.supportRating.rating - attack.rating : 0;
    states = (attack.states?.length ? attack.states : [{ weight: 1, rating: attack.rating }]).map((state) => ({ weight: state.weight, rating: state.rating + extra }));
    step = (attack.weaponRating + (attack.flatRating || 0)) * (attack.additionalRatingFactor ?? 1) * percent / 100;
  } else {
    const base = (Number(crit.baseRating) || 0) + (Number(crit.flatRating) || 0);
    if (!(base > 0) || !(crit.rating > 0)) return null;
    const additional = crit.rating / (base * (1 + (Number(crit.increasedRatingPercent) || 0) / 100));
    states = [{ weight: 1, rating: crit.rating }];
    step = base * additional * percent / 100;
  }
  const chanceAt = (lost) => states.reduce((sum, state) => { const plain = Math.max(0, Math.min(100, (state.rating - lost) / 100)); return sum + state.weight * (rolls > 1 ? luckyCritChance(plain, rolls) : plain); }, 0);
  const held = chanceAt(0);
  if (!(Math.abs(held - crit.chancePercent) < 1e-6)) return null;
  return (share) => chanceAt(step * (1 - share)) - held;
}

// The per-use damage outside the components (src/tick-ledger.js "extras": a Spacetime Illusion's damage factor on the whole use) scales with an
// additional line every component holds: a claimed line comes out of its base too, so the line's modifier reaches the whole use.
function withExtras(target, line) {
  const components = target.parts.filter((part) => target.componentOf(part)), extras = target.parts.filter((part) => !target.componentOf(part));
  if (line.layer !== "additional" || !components.length || !extras.length) return;
  if (!components.every((part) => { const component = target.componentOf(part); return inList(component.additional, line) || inList(component.combatAdditional, line); })) return;
  for (const part of extras) part.base /= 1 + line.value / 100;
  delete line.types;
}

function fervorReaders(ctx, fervor, read) {
  const share = (world) => world.bus.useStacks(fervor.key) / fervor.rating;
  const damage = fervor.readers.filter((reader) => reader.kind === "damage"), critDamage = fervor.readers.filter((reader) => reader.kind === "critDamage");
  const critRating = fervor.readers.filter((reader) => reader.kind === "critRating").reduce((sum, reader) => sum + reader.value, 0);
  const held = [];
  for (const target of ctx.targets) {
    let any = false;
    for (const line of target.claim("triggerBus", (item) => item.layer !== "taken" && damage.some((reader) => reader.source === item.source && reader.text === item.text))) {
      withExtras(target, line);
      target.addModifier(line, { layer: line.layer === "increased" ? "increased" : "additional", steadyAmount: line.value, amount: (world) => line.value * share(world) });
      any = true;
    }
    if (target.crit) {
      const sources = target.hit.crit?.increasedCriticalDamageSources || [];
      for (const reader of critDamage.filter((item) => sources.some((source) => source.source === item.source && source.value === item.value))) {
        target.crit.damagePercent -= reader.value;
        target.modifiers.push({ source: reader.source, text: reader.text, layer: "critDamage", liveKey: "triggerBus", steadyAmount: reader.value, amount: (world) => reader.value * share(world) });
        any = true;
      }
      const chance = critRating ? fervorCritChance(target.hit, critRating) : null;
      if (chance) { target.modifiers.push({ source: "Fervor (keyword 740)", text: `+${critRating}% Critical Strike Rating at the Fervor Rating held now`, layer: "critChance", liveKey: "triggerBus", steadyAmount: 0, amount: (world) => chance(share(world)) }); any = true; }
      else if (critRating) held.push(`${target.hit.name}'s crit chance`);
    } else if (critRating || critDamage.length) held.push(`${target.hit.name}'s crit`);
    if (any) read.add(`the Fervor Rating on ${target.hit.name}`);
  }
  if (held.length) ctx.assumptions.push(`Fervor Rating: ${[...new Set(held)].join(", ")} kept at the planner's held ${fervor.rating} (a time-shared or fixed crit the loop does not rebuild)`);
}

export function tidewellLayer(ctx) {
  const follower = ctx.planner.follower;
  const buff = (follower?.buffs || []).find((item) => item.id === "followerTidewell" && item.active);
  if (!ctx.isLive("tidewell") || !buff) return;
  const held = Number((String(buff.text).match(/^\+([\d.]+)%/) || [])[1]);
  const summary = String(buff.summary).match(/^\+([\d.]+)% chance .*inside the ([\d.]+) s Water Area/);
  if (!summary) return;
  for (const target of ctx.targets) {
    if (!isSpell(target.hit)) continue;
    const line = target.claimPattern("tidewell", /^Double Damage/)[0];
    const real = Number((String(line?.text).match(/^([\d.]+)% Double Damage chance/) || [])[1]);
    if (!line || !(real > 0)) continue;
    // The per-use damage outside the components (src/tick-ledger.js "extras": Spell Ripple, 150% of the average hit dealt, Double Damage
    // included) holds no ledger line for takeOut, but the path's Double Damage factor multiplies every part: take the planner's held
    // chance out of its base too (2026-11-02, Gemma Chromatic Shot fixture: Ripple read ×1.49 at the steady amounts).
    for (const part of target.parts) if (!target.componentOf(part)) part.base /= 1 + line.value / 100;
    target.doubleDamage = { chancePercent: real - held };
    target.modifiers.push({ source: buff.source, text: buff.summary, buff: "tidewell", layer: "doubleDamage", liveKey: "tidewell", percent: Number(summary[1]), steadyAmount: held });
    ctx.tidewell = { seconds: Number(summary[2]) };
  }
  if (ctx.tidewell) ctx.reported("tidewell").events = `+${summary[1]}% inside the ${summary[2]} s Water Area, read as a real chance at each hit (the planner floors the average)`;
}

// The follower skill a Paralysis source names (Coercion "when casting"), or null when a player hit inflicts it (then the recount's timed series keeps it).
function followerParalysisSkill(ctx, effect) {
  // A source on the player's own hits (a chance per hit, a fissure) is timed by the recount's series; only a follower cast is an event here.
  if (/chance per (?:fissure )?hit|on every fissure hit|hit rate not measured/i.test(String(effect.reason || ""))) return null;
  const skills = (ctx.planner.follower?.damageSources || []).map((source) => source.skill);
  const label = `${effect.source} ${effect.text}`;
  return skills.find((skill) => label.includes(skill)) ?? null;
}

export function paralysisLayer(ctx) {
  // The one Paralysis debuff's series from the dummy's unit buff set (W8 step 3: the combat pass's support-chance schedule), else the timed effect.
  const buffs = enemyBuffSet(ctx.planner.lineEffects?.state), series = buffs?.seriesOf("Paralysis");
  const effect = buffs ? (series ? { source: series.source, text: series.text, reason: series.reason, parts: [series.part] } : null) : (ctx.planner.lineEffects?.combat?.timedEffects || []).find((item) => item.id === "chanceParalysis" && item.active);
  // The trigger bus holds the whole Paralysis series when it drives both of your triggers (W10 step 2a): the follower's casts are one of its clocks.
  if (!ctx.isLive("paralysis") || !effect || ctx.bus?.owned.paralysis) return;
  const skill = followerParalysisSkill(ctx, effect);
  if (!skill) return;
  const part = effect.parts[0];
  let any = false;
  for (const target of ctx.targets) {
    for (const line of target.claimPattern("paralysis", /Paralysis/)) { target.addModifier(line, { buff: "paralysis", percent: part.percent, steadyAmount: line.value }); any = true; }
    if (any) for (const id of TIMED_IDS.paralysis) target.timedIds.add(id);
  }
  if (!any) return;
  ctx.paralysis = { seconds: part.schedule.durationSeconds, skill };
  ctx.reported("paralysis").events = `each follower cast of ${skill}, at its press (Coercion: "when casting"), ${part.schedule.durationSeconds} s; one debuff`;
}

// An ailment lands on the hit of whoever inflicts it: the follower skill the planner names, else the targets dealing that type, else every target.
// `ownEffect` (optional) replaces `effect` on your own hits (the follower's inflictions keep `effect`).
function addAilmentEvent(ctx, type, effect, dealt = null, ownEffect = effect) {
  // The first source of the enemy-ailment model's entry on the dummy's unit buff set (src/unit-buff-set.js, W8 step 1), else its source map.
  const buffs = enemyBuffSet(ctx.planner.lineEffects?.state);
  const skill = String((buffs ? buffs.primary(type, { stage: "model" })?.source : ctx.planner.lineEffects?.state?.enemyAilmentSources?.[type]) || "").match(/^Follower: (.+?) [IVX]+\b/)?.[1];
  if (skill) {
    if (!ctx.followerEvents.has(skill)) ctx.followerEvents.set(skill, []);
    ctx.followerEvents.get(skill).push(effect);
    return;
  }
  const dealing = dealt ? ctx.targets.filter((target) => dealsType(target, dealt)) : [];
  for (const target of dealing.length ? dealing : ctx.targets) target.onHit.push(ownEffect);
}

// "Inflicts N additional stack(s) of Numbed" (game record 173497728: node 343 on buff 170, layerNum p0, on the holder): each Numbed you inflict
// adds N more layers. The combat pass lists these lines (src/combat-states.js PATTERNS.numbedExtra); their N (decimals kept) summed.
const NUMBED_EXTRA = /^Inflicts (\d+(?:\.\d+)?) additional stack\(s\) of Numbed$/i;
function numbedExtraStacks(planner) {
  const entries = planner?.lineEffects?.combat?.entries || [];
  return entries.reduce((sum, entry) => sum + (Number(String(entry?.text ?? "").replace(/\s+/g, " ").trim().match(NUMBED_EXTRA)?.[1]) || 0), 0);
}

export function frailLayer(ctx) {
  if (!ctx.isLive("frail")) return;
  let any = false;
  for (const target of ctx.targets) for (const line of target.claimPattern("frail", /^Frail\b/)) { target.addModifier(line, { buff: "frail", percent: line.value, steadyAmount: line.value }); any = true; }
  if (!any) return;
  // Game recipe 534745344: on each Spell hit; the first hit does not read it.
  for (const target of ctx.targets) if (isSpell(target.hit)) target.onHit.push({ kind: "buff", buff: "frail", seconds: FRAIL_SECONDS });
  ctx.reported("frail").events = "on each Spell hit (game recipe 534745344); the first hit does not read it";
}

export function frostbiteLayer(ctx) {
  if (!ctx.isLive("frostbite")) return;
  // A Frostbite only your Minions keep (src/minion-frostbite.js) is no event of your hits: its level over time is the combat pass's timed part
  // (id "minionFrostbite"), and the lines that read it keep the planner's share.
  if (enemyBuffSet(ctx.planner.lineEffects?.state)?.heldOnlyBy("Frostbite", "minion", { stage: "model" })) return;
  let any = false;
  // First Flake of Strange Snow on the trigger bus (W10 step 2a): the Frostbite line's Cold Damage taken is linear in the rating, so it reads the
  // deemed rating on this tick ÷ the planner's (exactly 1 while the deemed bonus is the planner's), while Frostbite is held.
  const firstFlake = ctx.bus?.owned.firstFlake ? ctx.bus : null;
  for (const target of ctx.targets) for (const line of target.claim("frostbite", (line) => /^Frostbite\b/.test(line.source) || /against Frozen enemies/.test(line.text))) {
    if (firstFlake && /^Frostbite \(keyword 735/.test(line.source) && /Cold Damage taken$/.test(line.text)) target.addModifier(line, { requires: ["frostbite"], percent: line.value, amount: (world) => line.value * firstFlake.firstFlakeScale(world), steadyAmount: line.value });
    else target.addModifier(line, { buff: "frostbite", percent: line.value, steadyAmount: line.value });
    any = true;
  }
  if (!any) return;
  addAilmentEvent(ctx, "Frostbite", { kind: "buff", buff: "frostbite", seconds: AILMENT_SECONDS.Frostbite }, "Cold");
  ctx.reported("frostbite").events = "the first Cold hit inflicts the fixed rating (manual), so Frozen too at 100+; each hit renews it";
}

export function numbedLayer(ctx) {
  if (!ctx.isLive("numbed")) return;
  // Numbed's stack series from the dummy's unit buff set (W8 step 3), else the combat pass's timed effect.
  const buffs = enemyBuffSet(ctx.planner.lineEffects?.state);
  const part = buffs ? buffs.seriesOf("Numbed")?.part ?? undefined : (ctx.planner.lineEffects?.combat?.timedEffects || []).find((item) => item.id === "numbed")?.parts?.[0];
  const maxStacks = part?.schedule?.maxStacks ?? 10;
  const stacks = ctx.options.numbedStacks ?? maxStacks;
  // Numbed only your Minions keep, held by the trigger bus from their Lightning landings (W10 step 3c): its stacks the planner's (src/combat-states.js
  // minionNumbedStacks: stacks × the share) scaled by the bus's share on this tick over the planner's.
  const busShare = ctx.bus?.ownsMinionAilment?.("Numbed") ? ctx.bus.minionAilmentShare("Numbed") : null;
  let any = false;
  for (const target of ctx.targets) {
    const line = target.claimPattern("numbed", /^Numbed\b/)[0];
    if (!line) continue;
    const perStack = part?.percent ?? line.value / maxStacks;
    if (busShare > 0) target.addModifier(line, { percent: line.value, amount: (world) => line.value * world.bus.share("Numbed") / busShare, steadyAmount: line.value });
    else target.addModifier(line, { collector: "numbed", perStack: true, percent: perStack, capPercent: perStack * stacks, steadyAmount: line.value });
    for (const id of TIMED_IDS.numbed) target.timedIds.add(id);
    any = true;
  }
  if (!any) return;
  if (busShare > 0) { ctx.reported("numbed").events = "held by the trigger bus from your Minions' Lightning landings (2 s each), its stacks the planner's × the loop's share over the planner's"; return; }
  // Feline Figure's opening Numbed, kept by your Lightning hits' store (src/erika-traits.js storeKept): its stacks land at t = 0 (each on its own
  // 2 s; Electroplated Motif's 4 s is read as 2 s here), then your hits add theirs.
  const opening = part?.schedule?.opening;
  ctx.collectors.push({ key: "numbed", windowSeconds: AILMENT_SECONDS.Numbed, ...(opening?.stacks > 0 ? { seed: [{ frame: 0, value: opening.stacks }] } : {}) });
  // Your Numbing hits add 1 + the "Inflicts N additional stack(s) of Numbed" lines' N (record 173497728; 15 T Chain Lightning audit G4,
  // 2026-11-18: the sustained figure holds 10 stacks already); the follower's inflictions add 1.
  const extra = numbedExtraStacks(ctx.planner);
  addAilmentEvent(ctx, "Numbed", { kind: "collect", collector: "numbed" }, "Lightning", extra > 0 ? { kind: "collect", collector: "numbed", value: 1 + extra } : undefined);
  ctx.reported("numbed").events = `${extra > 0 ? `1 + ${extra} stacks per Numbing hit of yours ("Inflicts N additional stack(s) of Numbed", record 173497728), one per the follower's` : "one stack per Numbing hit"}, each on its own ${AILMENT_SECONDS.Numbed} s (keyword 762), up to ${stacks}; the per-damage threshold is not counted (open question tick-numbed-stacks)`;
}

export function curseLayer(ctx) {
  if (!ctx.isLive("curse")) return;
  let any = false;
  for (const target of ctx.targets) for (const line of target.claimPattern("curse", /curse \(Lv\./)) { target.addModifier(line, { buff: "curse", percent: line.value, steadyAmount: line.value }); any = true; }
  if (!any || !ctx.first("curse")) return;
  const buffs = enemyBuffSet(ctx.planner.lineEffects?.state);
  const skill = (buffs ? buffs.seriesOf("Curse")?.skill : ctx.planner.curseLimit?.active?.[0]) || "Curse";
  const interval = prepareEvery(ctx.planner, skill) ?? FRAME_SECONDS;
  // Terrain of Malice holds the curse on enemies in the area, so one cast keeps it (src/skill-coverage.js: curse uptime is continuous).
  ctx.triggers.push({ key: "curse", actor: "player", label: `${skill} (Preparation every ${interval} s)`, intervalSeconds: interval, effects: [{ kind: "buff", buff: "curse", seconds: Infinity }] });
  ctx.reported("curse").events = `Preparation's first check (node 206, inCdOnCreating false) casts it on tick 1; one cast holds it`;
}

// Per-ailment-type lines (W10 step 4a): every line that counts the dummy's ailment types, each body read the planner's way (src/line-conditions.js):
// "for every type of Ailment the enemy has" (condition ailmentTypes: Warlock (6,3), Dirty Tricks, Elder Sage Girdle) counts every type, "for each
// type of Elemental Ailment" (elementalAilmentTypes: Goddess of Knowledge's penetration) the Elemental ones (game keyword 101: Ignite, Frostbite,
// Freeze, Numbed). An increased, additional or penetration body is its per-type value × the types held now (the planner's factor, a sum; "per
// Ailment on enemies, up to" capped at its count), a "(multiplies)" body (1 + X%)^n (the planner's power). n counts each type on the dummy on this
// tick: a type your hits (or the follower's) keep, held from its own inflicting hit for the ailment's duration; a type only your Minions keep
// (src/minion-ailment-types.js), its share of the tick: the trigger bus's hold from their landings when it drives 1000047 (W10 step 3c), else the
// planner's uptime (nothing on the layers runs their ailments). The hit bodies come out of each hit's ledger (a penetration body out of the
// resistance step, as penetrationLayer does); the Minion bodies ("When Minions deal damage, …") reach the Minions' paths as their factor over the
// planner's (minionTypeModifiers, src/tick-minions.js: a Minion path carries the planner's per-use value). A DoT body keeps the planner's reading
// (trauma-build's "+X% additional Ailment Damage (multiplies)": the beam's types would need the loop's ailment runs, not hit events).
const TYPE_CONDITIONS = new Set(["ailmentTypes", "elementalAilmentTypes"]);
const ELEMENTAL_AILMENT_TYPES = new Set(["Ignite", "Frostbite", "Freeze", "Frozen", "Numbed"]);
// The types held on this tick from a count's entries (the engine's count rule, src/tick-engine.js modifierAmount).
const typesHeldAt = (world, entries) => entries.reduce((sum, entry) => sum + (entry.held ? 1 : entry.level ? entry.level(world) : (world.buffs.get(entry.buff)?.stacks || 0) > 0 ? 1 : 0), 0);
// A body's factor at n types: (1 + X%)^n multiplied, else 1 + X% × min(cap, n).
const typeFactorAt = (line, n) => line.multiplies ? (1 + line.perType / 100) ** n : 1 + line.perType * Math.min(line.capCount ?? Infinity, n) / 100;

export function ailmentTypeLayer(ctx) {
  if (!ctx.isLive("ailmentTypes")) return;
  const state = ctx.planner.lineEffects?.state || {};
  const sources = (ctx.planner.lineEffects?.lines || []).filter((line) => TYPE_CONDITIONS.has(line.condition) && line.status === "In calc" && line.active !== false && (line.bodies || []).some((body) => body.derivedText));
  if (!sources.length) return;
  const buffs = enemyBuffSet(state);
  const all = buffs?.types() ?? state.enemyAilments ?? [];
  const elemental = buffs ? buffs.types("ElementalAilment") : all.filter((type) => ELEMENTAL_AILMENT_TYPES.has(type));
  // A type only your Minions keep: held by the trigger bus from their landings (W10 step 3c), else at the planner's uptime.
  const fromBus = (type) => Boolean(ctx.bus?.ownsMinionAilment?.(type));
  // (With TLI_BUFF_SET=off: the planner's own map of the types only your Minions keep, with their uptime.)
  const minionUptime = state.enemyAilmentUptime || {};
  const minionOnly = (type) => buffs ? buffs.heldOnlyBy(type, "minion", { stage: "model" }) : Object.prototype.hasOwnProperty.call(minionUptime, type);
  const minionShare = (type) => buffs ? buffs.share(type, { stage: "model" }) : Number(minionUptime[type]) || 0;
  const entryOf = (type) => fromBus(type) ? { level: (world) => world.bus.share(type) } : minionOnly(type) ? { level: () => minionShare(type) } : { buff: `ailment:${type}` };
  const minions = (ctx.planner.minions || []).filter((minion) => minion?.modeled);
  const minionLists = (minion) => (minion.skills || []).flatMap((skill) => [...(skill.increased || []), ...(skill.additional || [])]);
  const report = ctx.reported("ailmentTypes"), described = [];
  let any = false;
  ctx.ailmentTypeMinion = [];
  for (const source of sources) {
    const types = source.condition === "elementalAilmentTypes" ? elemental : all;
    const count = types.map(entryOf), multiplies = Boolean(source.params?.multiplies);
    const capCount = Number(source.params?.capCount) > 0 ? Number(source.params.capCount) : undefined;
    for (const body of source.bodies || []) {
      const perType = Number(String(body.body ?? "").match(/^([+-]?[\d.]+)/)?.[1]);
      if (!body.derivedText || !Number.isFinite(perType) || !perType) continue;
      const read = { source: source.source, text: body.derivedText, perType, multiplies, capCount, count };
      const how = multiplies ? `(1 + ${perType}%)^n` : `${perType}% × n${capCount ? ` (n up to ${capCount})` : ""}`;
      let reached = false;
      for (const target of ctx.targets) {
        if (/Resistance Penetration$/.test(body.derivedText)) {
          // Through the resistance step: each part's static factor loses the planner's held penetration and the modifier puts back the loop's.
          const value = Number(body.derivedText.match(/^\+([\d.]+)%/)?.[1]);
          const holders = value > 0 ? target.parts.filter((part) => inList(target.componentOf(part)?.penetration, read)) : [];
          if (!holders.length) continue;
          for (const part of holders) {
            const component = target.componentOf(part), net = part.netResistancePercent ?? component.resistancePercent - component.penetrationPercent;
            part.base *= (100 - net - value) / (100 - net);
            part.netResistancePercent = net + value;
          }
          target.modifiers.push({ source: source.source, text: body.derivedText, layer: "penetration", liveKey: "ailmentTypes", count, linear: true, ...(capCount ? { capCount } : {}), percent: perType, parts: holders.map((part) => part.key), steadyAmount: value });
          if (!reached) report.lines.push({ layer: "penetration", source: source.source, text: body.derivedText, value });
          reached = true;
          continue;
        }
        for (const line of target.claim("ailmentTypes", (item) => item.source === source.source && item.text === body.derivedText)) {
          target.addModifier(line, { layer: line.layer === "increased" ? "increased" : "additional", count, percent: perType, ...(multiplies ? {} : { linear: true, ...(capCount ? { capCount } : {}) }), steadyAmount: line.value });
          reached = true;
        }
      }
      // A Minion body: kept for src/tick-minions.js when a modeled Minion's skill holds it.
      const onMinions = minions.some((minion) => minionLists(minion).some((item) => item.source === read.source && item.text === read.text));
      if (onMinions) { ctx.ailmentTypeMinion.push(read); report.lines.push({ layer: "minion", source: source.source, text: body.derivedText, value: Number(body.derivedText.match(/^\+([\d.]+)%/)?.[1]) || 0 }); }
      if (reached || onMinions) { any = true; described.push(`${source.source} ${how}${onMinions && !reached ? " (Minions)" : onMinions ? " (and its Minions)" : ""}`); }
    }
  }
  if (!any || !ctx.first("ailmentTypes")) return;
  const eventTypes = [...new Set([...all, ...elemental])].filter((type) => !fromBus(type) && !minionOnly(type));
  // (A type a gated Blessing gain already holds, placeHitGains, keeps that one event.)
  for (const type of eventTypes) if (!ctx.targetStateEvents?.has(type)) addAilmentEvent(ctx, type, { kind: "buff", buff: `ailment:${type}`, seconds: AILMENT_SECONDS[type] ?? 4 }, stateDealt(type));
  const minionTypes = [...new Set([...all, ...elemental])].filter((type) => fromBus(type) || minionOnly(type));
  report.events = `${described.join("; ")}, with n the ailment types held now: ${eventTypes.join(", ")}, each on its own inflicting hit${minionTypes.length ? `; ${minionTypes.join(", ")} only your Minions keep, at ${minionTypes.some(fromBus) ? "the trigger bus's share from their landings" : "the planner's uptime"}` : ""}`;
}

/**
 * The per-type Minion bodies on one Minion skill's path (W10 step 4a; src/tick-minions.js): the path's base holds the planner's per-use value, so
 * each body goes on as its factor at the types held now over the planner's: an additional one (1 + X%)^n ÷ its held factor, an increased one
 * (100 + I − held + X × n) ÷ (100 + I) on the skill's increased pool I. steadyAmount 0: at the planner's count the factor is 1.
 */
export function minionTypeModifiers(ctx, minion, skillName) {
  const lines = ctx?.ailmentTypeMinion || [];
  const skill = (minion?.skills || []).find((item) => item.name === skillName);
  if (!lines.length || !skill) return [];
  const out = [];
  for (const line of lines) {
    const additional = (skill.additional || []).find((item) => item.source === line.source && item.text === line.text);
    const increased = (skill.increased || []).find((item) => item.source === line.source && item.text === line.text);
    if (additional) {
      const held = 1 + (Number(additional.value) || 0) / 100;
      if (held > 0) out.push({ source: line.source, text: `${line.text} (Minions), at the ailment types held now`, liveKey: "ailmentTypes", layer: "additional", steadyAmount: 0, amount: (world) => (typeFactorAt(line, typesHeldAt(world, line.count)) / held - 1) * 100 });
    }
    if (increased) {
      const pool = 100 + (Number(skill.increasedSum) || 0), held = Number(increased.value) || 0;
      if (pool > 0) out.push({ source: line.source, text: `${line.text} (Minions), at the ailment types held now`, liveKey: "ailmentTypes", layer: "additional", steadyAmount: 0, amount: (world) => ((pool - held + (typeFactorAt(line, typesHeldAt(world, line.count)) - 1) * 100) / pool - 1) * 100 });
    }
  }
  return out;
}

export function markLayer(ctx) {
  // The Mark's chance per crit from the dummy's unit buff set (W8 step 3), else the planner's crit source.
  const buffs = enemyBuffSet(ctx.planner.lineEffects?.state);
  const { mark } = ctx.planner, line = mark?.critOnlyLine, source = buffs ? buffs.seriesOf("Mark") : mark?.sources?.find((item) => item.on === "crit");
  if (!ctx.isLive("mark") || !line || !source) return;
  let any = false;
  for (const target of ctx.targets) {
    if (!target.crit) continue;
    target.crit.onlyFactor /= 1 + line.value / 100;
    target.modifiers.push({ source: line.source, text: line.text, buff: "mark", layer: "critOnly", liveKey: "mark", percent: line.value, steadyAmount: line.value });
    // No published duration: held once a crit lands it, as the planner's best case.
    target.onHit.push({ kind: "chance", key: "mark", probability: source.chancePercent / 100 * target.hit.crit.chancePercent / 100, effects: [{ kind: "buff", buff: "mark", seconds: Infinity }] });
    any = true;
  }
  if (!any) return;
  ctx.reported("mark").lines.push({ layer: "crit", source: line.source, text: line.text, value: line.value });
  ctx.reported("mark").events = `${source.chancePercent}% per crit determination through the accumulator; held after that (no published duration)`;
}

// "+X% Elemental Resistance Penetration when hitting an enemy with Elemental Damage, stacking up to N times" (Dreamweaver): own stacks gained on
// hits (record 747307 row 2: 1000030 on [Elemental, Hit], once a frame, node 306 mode 3, 4 s each, up to 4), so gained only from the dummy: from 0 at
// engagement, built from the first hit on (census C9, user decision 2026-11-15; before, full at engagement with prebuiltSelfBuffs). They go through the resistance step (layer "penetration"):
// each part's static factor loses the stacks' share and takes it back per stack. The "recently" is read as 4 s; hits renew them every fraction of
// a second, so nothing depends on it.
export function penetrationLayer(ctx) {
  if (!ctx.isLive("penetrationStacks")) return;
  const stacking = (ctx.planner.lineEffects?.lines || []).filter((line) => line.condition === "hitsWithType" && line.status === "In calc");
  const taken = [];
  stacking.forEach((source, index) => {
    const body = (source.bodies || []).find((item) => /^\+[\d.]+% .*Resistance Penetration$/.test(item.derivedText || ""));
    const value = Number(String(body?.derivedText).match(/^\+([\d.]+)%/)?.[1]), stacks = source.params?.stacks;
    if (!(value > 0) || !(stacks > 0)) return;
    const buff = `penetration:${index}`;
    let any = false;
    for (const target of ctx.targets) {
      const holders = target.parts.filter((part) => inList(target.componentOf(part)?.penetration, { source: source.source, text: body?.derivedText }));
      if (!holders.length) continue;
      for (const part of holders) {
        const component = target.componentOf(part), net = part.netResistancePercent ?? component.resistancePercent - component.penetrationPercent;
        part.base *= (100 - net - value) / (100 - net);
        part.netResistancePercent = net + value;
      }
      target.modifiers.push({ source: source.source, text: body.derivedText, buff, perStack: true, layer: "penetration", liveKey: "penetrationStacks", percent: value / stacks, parts: holders.map((part) => part.key), steadyAmount: value });
      target.onHit.push({ kind: "buff", buff, seconds: RECENT_SECONDS, stacks: 1, maxStacks: stacks });
      any = true;
    }
    if (!any) return;
    ctx.reported("penetrationStacks").lines.push({ layer: "penetration", source: source.source, text: body.derivedText, value });
    taken.push(`+${value / stacks}% up to ${stacks}`);
  });
  if (taken.length) ctx.reported("penetrationStacks").events = `${taken.join(", ")}, through the resistance step; from 0 at engagement, from the first hit (gained only from the dummy)`;
}

// The recount's timed effects on a hit (src/timed-effects.js: pact and kismet effects on their own clocks, Empower and hero timed parts), as one
// modifier reading the series the recount reads, divided by the effects a live layer on this hit carries itself. steadyAmount 0: the series is a
// factor relative to the sustained level the ledger holds.
export function timedLayer(ctx) {
  if (!ctx.isLive("timed")) return;
  const inputs = ctx.planner.dummyRecount?.inputs, timed = inputs?.timedEffects;
  if (!timed?.parts?.length) return;
  const effects = (ctx.planner.lineEffects?.combat?.timedEffects || []).filter((effect) => effect.active && effect.parts?.length);
  const EPS = 1e-9;
  const factorOf = (part, time) => { let index = 0; while (index + 1 < part.edges.length && part.edges[index + 1] <= time + EPS) index += 1; return part.factors[index]; };
  const seriesFactor = (share) => {
    const reaching = timed.parts.filter((part) => (!part.keys || part.keys.includes(share.key)) && (part.reach === "hit" ? share.hit : part.reach === "dot" ? !share.hit : true));
    if (!reaching.length) return null;
    const types = Object.entries(share.types || {}).filter(([, value]) => value > 0), rest = Math.max(0, 1 - types.reduce((sum, [, value]) => sum + value, 0));
    const product = (type, time) => reaching.filter((part) => !part.type || part.type === type || (part.type === "Elemental" && ["Fire", "Cold", "Lightning"].includes(type))).reduce((factor, part) => factor * factorOf(part, time), 1);
    return (time) => types.reduce((sum, [type, value]) => sum + value * product(type, time), 0) + rest * product(null, time);
  };
  const reachesShare = (part, share) => (!part.keys || part.keys.includes(share.key)) && (part.reach === "hit" ? share.hit : part.reach === "dot" ? !share.hit : true);
  const names = [];
  for (const target of ctx.targets) {
    const share = timed.shares?.[target.hit.key];
    if (!share) continue;
    const series = seriesFactor(share);
    if (!series) continue;
    const own = effects.filter((effect) => target.timedIds.has(effect.id)).flatMap((effect) => effect.parts).filter((part) => Number(part.percent) && reachesShare({ ...part, reach: part.reach || "all" }, share));
    // The series is anonymous (src/timed-effects.js recountTimedEffects drops the ids): when the live layers' parts are all that reach this hit,
    // there is nothing left to time here.
    if (own.length && own.length >= timed.parts.filter((part) => reachesShare(part, share)).length) continue;
    const live = own.length ? (time) => sourceFactorAt(own, share, time, partFactorAt) : () => 1;
    target.modifiers.push({ source: "Timed effects", text: `the recount's timed series on ${target.hit.name}${own.length ? ", without the effects live on this hit" : ""}`, liveKey: "timed", layer: "additional", steadyAmount: 0, amount: (world) => (series(world.frame * FRAME_SECONDS) / live(world.frame * FRAME_SECONDS) - 1) * 100 });
    names.push(target.hit.name);
  }
  if (names.length) ctx.reported("timed").events = `each pact, kismet, Empower and hero timed part at its schedule's level on this tick (src/timed-effects.js), the recount's own series, on ${names.join(", ")}`;
}

// Follower casts: one action per damage source at the planner's cadence, first cast ended at its use time. Strikes spread over the area's
// life when the skill text gives them. In the actor order, after the player's. Without layer followerActor each cast is taken at the rate
// the planner gives it, all from t = 0. With it the follower is one actor (client AI_SelectMercenarySkill, chunk 14): one cast at a time, each skill at
// its Split's use time, ready again after its cooldown from the press, the first ready skill after the last one used going next, slot 1 first. An area
// is not a gate: a recast replaces it, so a skill pressed sooner than its area ends lands only that many strikes.
export function followerProgram(ctx) {
  const follower = ctx.planner.follower;
  const oneActor = ctx.isLive("followerActor");
  const needed = ctx.isLive("followerCasts") || ctx.tidewell || ctx.paralysis || ctx.followerEvents.size || oneActor;
  if (!needed || !follower?.damageSources?.length || !ctx.first("follower")) return;
  const sources = new Map(follower.damageSources.map((source) => [source.skill, source]));
  const ringSkills = (follower.cadence || []).filter((entry) => entry.castsPerSecond > 0);
  const inRing = ctx.options.followerOrder === undefined || ctx.options.followerOrder === "ring";
  const queued = (entry) => ({ queue: "follower", useSeconds: entry.castSeconds, ...(inRing ? { ring: ringSkills.indexOf(entry), ringSize: ringSkills.length } : {}), ...(entry.cooldownSeconds > entry.castSeconds ? { cooldown: { baseSeconds: entry.cooldownSeconds } } : {}) });
  const order = oneActor ? ringSkills : follower.damageSources.map((source) => ({ skill: source.skill }));
  for (const entry of order) {
    const source = sources.get(entry.skill);
    // A skill with no modeled damage still takes the follower's time.
    if (!source) { ctx.actions.push({ key: `follower:${entry.skill}`, actor: "follower", label: entry.skill, ...queued(entry), effects: [] }); continue; }
    const strikes = String(source.text).match(/(\d+) (?:strikes|Torrents) \(every ([\d.]+) s/);
    const printed = strikes ? Number(strikes[1]) : 1;
    // Flame Core's shockwaves run between casts at the source's own rate, not one per press.
    const shockwaves = oneActor && /shockwaves/.test(String(source.text)) && source.usesPerSecond > entry.castsPerSecond;
    const every = shockwaves ? 1 / source.usesPerSecond : strikes ? Number(strikes[2]) : 0;
    // A recast replaces the area, so a cast lands the strikes that fit before the next press of the same skill.
    const count = shockwaves ? Math.max(1, Math.round(entry.periodSeconds * source.usesPerSecond)) : strikes && oneActor && entry.periodSeconds > 0 ? Math.min(printed, Math.max(1, Math.round(entry.periodSeconds / every))) : printed;
    const onStrike = ctx.followerEvents.get(source.skill) || [];
    const live = ctx.isLive("followerCasts");
    if (live) ctx.paths[source.key] = { label: source.name, kind: "hit", parts: [{ key: "hit", type: source.type, base: source.perUse / printed, increasedPercent: 0, additionalFactor: 1 }], modifiers: [], working: { skill: source.skill, text: source.text, perUse: source.perUse, strikes: count } };
    const strike = live ? { kind: "hit", path: source.key, onHit: onStrike } : { kind: "event", effects: onStrike };
    const effects = [strike, ...Array.from({ length: count - 1 }, (_, index) => ({ kind: "delay", seconds: every * (index + 1), effects: [strike] }))];
    if (source.skill === "Tartarus: Tidewell" && ctx.tidewell) effects.push({ kind: "buff", buff: "tidewell", seconds: ctx.tidewell.seconds });
    const coercion = ctx.paralysis && source.skill === ctx.paralysis.skill;
    ctx.actions.push({
      key: source.key, actor: "follower", label: source.name, ...(oneActor ? queued(entry) : { useSeconds: 1 / source.usesPerSecond, firstUseSeconds: source.firstUseSeconds }),
      ...(coercion ? { pressEffects: [{ kind: "buff", buff: "paralysis", seconds: ctx.paralysis.seconds }] } : {}), effects
    });
  }
  if (ctx.isLive("followerCasts")) ctx.reported("followerCasts").events = `${oneActor ? "the printed cast times in one queue" : "the planner's cadence"} and per-cast damage, strikes spread over the skill's area`;
  if (oneActor) ctx.reported("followerActor").events = `one cast at a time, each ready again after its cooldown from the press; ${ctx.options.followerOrder === "slot" ? "the first ready in slot order goes next" : ctx.options.followerOrder === "ready" ? "the skill ready longest goes next" : "the first ready after the last one used goes next (client AI_SelectMercenarySkill)"}; from slot 1: ${order.map((entry) => entry.skill).join(", ")}`;
}

// True Flame Immolation's Blessing cycle as events (chunk 15 session 3; src/true-flame-blessing-cycle.js holds the planner's time average):
// each cast reads the Focus and Tenacity stacks held (the hit's base is 233 per stack, its per-stack lines read them), removes every stack and
// grants ⌊max × 2.5% × CDR%⌋ of each back; the build's other gains run between casts at their rate, or fill to max (the planner's convention).
// With CDR ≥ 40% the refill is full, so the events reproduce the planner's held stacks exactly; below it the stacks saw-tooth between casts.
export function trueFlameLayer(ctx) {
  const target = ctx.targets.find((item) => item.hit.name === "True Flame Immolation" && item.hit.rate?.usesPerSecond > 0);
  const entries = ownBlessingEntries(ctx.planner).filter((entry) => ["Focus", "Tenacity"].includes(entry.name) && entry.consumptionCycle?.source === "True Flame Immolation");
  if (!target || entries.length !== 2) return;
  const stacksOf = (world, key) => world.buffs.get(key)?.stacks || 0;
  const held = entries.reduce((sum, entry) => sum + (entry.consumptionCycle.held ?? entry.stacks), 0);
  if (!(held > 0)) return;
  // The base reads the stacks at the cast: 233 × (Focus + Tenacity) against the planner's held total.
  target.modifiers.push({ source: "True Flame Immolation", text: `233 per Focus and Tenacity stack consumed (${held} held in the planner's cycle)`, liveKey: "trueFlame", layer: "additional", steadyAmount: 0, amount: (world) => ((stacksOf(world, "focus") + stacksOf(world, "tenacity")) / held - 1) * 100 });
  const tenacity = entries.find((entry) => entry.name === "Tenacity"), focus = entries.find((entry) => entry.name === "Focus");
  // Tenacity's per-stack line (Focus's is the Blessing layer's); Overload counts Focus stacks up to its cap.
  for (const line of target.claimPattern("trueFlame", /^Tenacity Blessing \(blessing model\)/)) target.addModifier(line, { buff: "tenacity", perStack: true, percent: line.value / (tenacity.consumptionCycle.held || tenacity.stacks), steadyAmount: line.value });
  for (const line of target.claimPattern("trueFlame", /additional damage for the supported skill × \d+ Focus Blessing stacks/)) {
    const per = Number((line.text.match(/^\+([\d.]+)% additional/) || [])[1]);
    if (per > 0) target.addModifier(line, { buff: "focus", perStack: true, percent: per, capPercent: line.value, steadyAmount: line.value });
  }
  // The cast: the hit reads the stacks, then every stack goes and the refill lands (Split 382981: fire_get_bless → fire_attack → remove → add).
  for (const entry of entries) {
    const buff = entry.name.toLowerCase(), cycle = entry.consumptionCycle, max = cycle.maxStacks ?? entry.maxStacks;
    target.after.push({ kind: "consume", buff, stacks: 1e9 });
    const refill = cycle.fills ? max : cycle.refill ?? 0;
    if (refill > 0) target.after.push({ kind: "buff", buff, seconds: Infinity, stacks: refill, maxStacks: max, layered: true });
    // Other gains between casts at their rate (a timed line, an Elixir cast): one stack per 1 ÷ rate s.
    if (cycle.gainPerSecond > 0 && !cycle.fills && ctx.first(`trueFlameGain:${buff}`)) ctx.periodics.push({ key: `trueFlameGain:${buff}`, actor: "player", label: `${entry.name} Blessing gains between True Flame casts`, intervalSeconds: 1 / cycle.gainPerSecond, effects: [{ kind: "buff", buff, seconds: Infinity, stacks: 1, maxStacks: max, layered: true }] });
    if (ctx.prebuilt && buff === "tenacity" && ctx.first("tenacityStart")) ctx.initialBuffs.push({ buff, stacks: cycle.held ?? entry.stacks, seconds: Infinity, layered: true });
  }
  ctx.reported("trueFlame").events = `each cast reads Focus ${focus.consumptionCycle.held} and Tenacity ${tenacity.consumptionCycle.held} (the planner's held stacks), removes them all and grants ${focus.consumptionCycle.refill} / ${tenacity.consumptionCycle.refill} back (${Math.round(focus.consumptionCycle.cooldownRecoveryPercent * 100) / 100}% Cooldown Recovery Speed)`;
}

/** The general builders in their order; the Youga program interleaves its own among them (src/tick-youga-layers.js). */
export const GENERAL_ORDER = Object.freeze([aimLayer, swiftBoltLayer, spellAggressionLayer, periodicBurstLayer, blessingLayer, triggerBusLayer, trueFlameLayer, tidewellLayer, paralysisLayer, frailLayer, frostbiteLayer, numbedLayer, curseLayer, ailmentTypeLayer, markLayer, penetrationLayer, incisiveLayer, timedLayer, followerProgram]);

/** What stays held on purpose on any build, with why. */
export function generalHeldLayers(ctx) {
  const lines = ctx.planner.lineEffects?.lines || [];
  const named = (condition) => lines.filter((line) => line.condition === condition && line.status === "In calc").map((line) => ({ source: line.source, text: line.text }));
  const attacks = ctx.targets.filter((target) => !target.speedKey && target.hit.rate?.speedType === "attack-speed");
  return [
    { key: "hasten", label: "Hasten", reason: "\"Has Hasten\" is a permanent status with nothing to time, so its additional Cast Speed stays in the static speed", lines: lines.filter((line) => /^Has Hasten$/.test(line.text)).map((line) => ({ source: line.source, text: line.text })) },
    { key: "mobility", label: "After using Mobility Skills", reason: "user rule 2026-10-14: active whenever an enabled Mobility skill is on the board (best case), so nothing to time", lines: named("mobility") },
    { key: "aimEffect", label: "Aim effect stacks", reason: "Mass Effect and Well-Fought Battle stay at the planner's held stacks (own stacks): Aim is live, its size is not", lines: (ctx.planner.aim?.sources || []).map((line) => ({ source: line.source, text: line.category, value: line.value })) },
    ...(ctx.isLive("penetrationStacks") ? [] : [{ key: "penetration", label: "Penetration stacks", reason: "this run holds them at their full stacks; layer penetrationStacks puts them through the resistance step", lines: named("hitsWithType") }]),
    ...(attacks.length ? [{ key: "attackSpeed", label: "Attack Speed on attack skills", reason: "Aim, Periodic Burst and Agility Blessing also raise Attack Speed, but the weapon Attack Speed model has no live speed yet: these attack skills keep the planner's averaged use time", lines: attacks.map((target) => ({ source: target.hit.name, text: `${target.hit.rate.useModel}` })) }] : [])
  ];
}

/** The finished target: its path with the live parts and modifiers, and the events its uses and hits fire. */
export function finishTarget(target) {
  return {
    path: { ...target.path, parts: target.parts, modifiers: target.modifiers, ...(target.crit ? { crit: target.crit } : {}), ...(target.doubleDamage ? { doubleDamage: target.doubleDamage } : {}) },
    onUse: target.onUse, onHit: target.onHit, after: target.after, speedKey: target.speedKey, rateGroups: target.rateGroups, claimedKeys: target.claimedKeys()
  };
}
