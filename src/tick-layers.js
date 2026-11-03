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

export const TICKS_PER_SECOND = 30;
export const RECENT_SECONDS = 4; // game hyperlink 103; the client's 120-frame window
// Default durations (config_char_buff column holding the manual's 10 s for Blessings; recipes pass duration -2, "the record's default").
export const SPELL_AGGRESSION_SECONDS = 10, FRAIL_SECONDS = 10;
export const BASE_BLESSING_SECONDS = 10; // manual: "The base duration of Agility Blessing is 10s", all stacks refreshed on gain, all lost at the end
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
    paths: {}, report: new Map(), assumptions: [], once: new Set()
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
  const { aim } = ctx.planner;
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
  const burst = ctx.planner.periodicBurst;
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

export const blessingSeconds = (planner, name) => {
  const pattern = new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% (?:${name} )?Blessing Duration$`, "i");
  const bonus = (planner.modifierTexts || []).reduce((sum, line) => { const match = String(line.text).match(pattern); return match ? sum + Number(match[1]) * (line.multiplier ?? 1) : sum; }, 0);
  return BASE_BLESSING_SECONDS * (1 + bonus / 100);
};

/**
 * A Blessing the build gains only from the dummy (user decisions 2026-11-02): when Reaping ("Gains 1 stack(s) of Focus Blessing when Reaping"), on
 * hit, on Critical Strike or on Non-Critical Strikes (Youga's Agility on crit, Grace Boots' Focus). The dummy starts clean, so `prebuiltSelfBuffs`
 * does not hold it: it starts at 0 at engagement and builds from those events. A gain that needs no target (a timer, a skill use, moving) keeps the
 * pre-built reading for the whole Blessing. Returns the gains ({ reap, hits: [{ when: "hit" | "crit" | "nonCrit", chance, stacks }] }), or null.
 */
export const onTargetBlessing = (entry) => {
  if (!entry || entry.consumptionCycle) return null;
  const gains = (entry.gainSources || []).filter((item) => item.available !== false);
  const kindOf = (text) => /\bwhen Reaping\b/i.test(text) ? "reap" : /\bNon-Critical Strikes?\b/i.test(text) ? "nonCrit" : /\bon Critical Strike\b/i.test(text) ? "crit" : /\bon hit\b/i.test(text) ? "hit" : null;
  const read = gains.map((item) => ({ text: String(item.text || ""), kind: kindOf(String(item.text || "")) }));
  if (!read.length || read.some((item) => !item.kind)) return null;
  const hits = read.filter((item) => item.kind !== "reap").map(({ text, kind }) => ({ when: kind, chance: Math.min(1, (Number((text.match(/(\d+(?:\.\d+)?) ?% chance/i) || [])[1]) || 100) / 100), stacks: Number((text.match(/(\d+) stacks?(?:\(s\))? of/i) || [])[1]) || 1 }));
  return { reap: read.some((item) => item.kind === "reap"), hits };
};
/** The Reap case of onTargetBlessing (the 2026-11-02 Reap-only rule): a gain when Reaping, every other gain on the dummy too. */
export const reapOnlyBlessing = (entry) => Boolean(onTargetBlessing(entry)?.reap);

// An on-target Blessing's hit gains on every hit on the loop: one crit determination per hit group (game recipe 103010039 for Agility on crit, node
// 188 chance), at the gain's chance × the share of determinations that crit (or do not). Returns whether any gain landed on a hit.
function placeHitGains(ctx, gains, buff, seconds, maxStacks) {
  let placed = false;
  for (const target of ctx.targets) {
    const crit = Math.max(0, Math.min(1, (target.hit.crit?.chancePercent ?? 0) / 100));
    for (const gain of gains.hits) {
      const share = gain.when === "crit" ? crit : gain.when === "nonCrit" ? 1 - crit : 1;
      if (!(gain.chance * share > 0)) continue;
      target.onHit.push({ kind: "chance", key: `${buff}Blessing:${gain.when}`, probability: gain.chance * share, effects: [{ kind: "buff", buff, seconds, stacks: gain.stacks, maxStacks }] });
      placed = true;
    }
  }
  return placed;
}

export function blessingLayer(ctx) {
  if (!ctx.isLive("blessings")) return;
  const { planner } = ctx;
  const entries = planner.blessings?.entries || [];
  const focus = entries.find((entry) => entry.name === "Focus"), agility = entries.find((entry) => entry.name === "Agility");
  const perStackLines = (planner.lineEffects?.lines || []).filter((line) => line.status === "In calc" && ["blessingPerStack", "blessingActive"].includes(line.condition));
  const bodyOf = (line) => (line.bodies || []).map((body) => body.derivedText).filter(Boolean);
  let any = false;
  if (focus?.stacks > 0) {
    const seconds = blessingSeconds(planner, "Focus");
    for (const target of ctx.targets) {
      for (const line of target.claimPattern("blessings", /^Focus Blessing \(blessing model\)/)) { target.addModifier(line, { buff: "focus", perStack: true, percent: line.value / focus.stacks, steadyAmount: line.value }); any = true; }
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
      if (every > 0) ctx.periodics.push({ key: "focusGain", actor: "player", label: gain.source, intervalSeconds: every, ...(needsCore ? { requiresBuff: "coreActive" } : {}), effects: [{ kind: "buff", buff: "focus", seconds, stacks: 1, maxStacks: focus.maxStacks }] });
      // A gain only from the dummy (onTargetBlessing) starts at 0: its hit gains go on the hits here, src/tick-ledger.js puts a Reap gain on the
      // Reaps on the loop, src/tick-ailments.js the stacks on the DoT paths.
      const gains = onTargetBlessing(focus);
      if (gains) { addTargetBlessing(ctx, { buff: "focus", name: "Focus", stacks: focus.stacks, seconds, gains, hitPlaced: placeHitGains(ctx, gains, "focus", seconds, focus.maxStacks) }); any = true; }
      else if (ctx.prebuilt) ctx.initialBuffs.push({ buff: "focus", stacks: focus.stacks, seconds });
    }
  }
  if (agility?.stacks > 0) {
    const seconds = blessingSeconds(planner, "Agility");
    const speedPer = agility.attackAndCastSpeedPercent / agility.stacks;
    const gains = onTargetBlessing(agility);
    const gain = (agility.gainSources || []).find((item) => /(\d+(?:\.\d+)?)% chance to gain Agility Blessing on Critical Strike/i.test(item.text));
    const chance = Number((String(gain?.text).match(/(\d+(?:\.\d+)?)% chance/) || [])[1]) / 100;
    for (const target of ctx.targets) {
      for (const line of target.claimPattern("blessings", /^Agility Blessing \(blessing model\)/)) { target.addModifier(line, { buff: "agility", perStack: true, percent: line.value / agility.stacks, steadyAmount: line.value }); any = true; }
      if (speedPer && target.speedKey) { target.addSpeed("blessings", { source: "Agility Blessing (blessing model)", text: `+${speedPer}% Attack and Cast Speed per stack` }, { buff: "agility", perStack: true, layer: "increased", percent: speedPer, steadyAmount: agility.attackAndCastSpeedPercent }); any = true; }
      // Game recipe 103010039: on a crit, node 188 chance, buff 320. One crit determination per hit group. (An on-target Agility places it below.)
      if (!gains && chance > 0 && target.hit.crit?.chancePercent > 0) target.onHit.push({ kind: "chance", key: "agilityBlessing", probability: chance * target.hit.crit.chancePercent / 100, effects: [{ kind: "buff", buff: "agility", seconds, stacks: 1, maxStacks: agility.maxStacks }] });
    }
    if (ctx.first("agilityStart")) {
      if (gains) addTargetBlessing(ctx, { buff: "agility", name: "Agility", stacks: agility.stacks, seconds, gains, hitPlaced: placeHitGains(ctx, gains, "agility", seconds, agility.maxStacks) });
      else if (ctx.prebuilt) ctx.initialBuffs.push({ buff: "agility", stacks: agility.stacks, seconds });
    }
  }
  const fromZero = (ctx.targetBlessings || []).map((item) => `${item.name} from 0, built on ${[item.gains.reap ? "the Reaps" : "", item.gains.hits.length ? "the hits" : ""].filter(Boolean).join(" and ")} (its only gains)`);
  if (any) ctx.reported("blessings").events = `Focus ${focus?.stacks ?? 0}, Agility ${agility?.stacks ?? 0}: ${fromZero.length ? `${fromZero.join("; ")}; ` : ""}${ctx.prebuilt ? "the rest full at engagement (prebuilt), " : "from zero, "}renewed by their gains (every gain refreshes all stacks; manual)`;
}

// An on-target Blessing (onTargetBlessing): src/tick-ledger.js puts its Reap gain on the loop's Reaps, or holds it when nothing can build it.
function addTargetBlessing(ctx, entry) {
  ctx.targetBlessings = [...(ctx.targetBlessings || []), entry];
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
  const effect = (ctx.planner.lineEffects?.combat?.timedEffects || []).find((item) => item.id === "chanceParalysis" && item.active);
  if (!ctx.isLive("paralysis") || !effect) return;
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
function addAilmentEvent(ctx, type, effect, dealt = null) {
  const skill = String(ctx.planner.lineEffects?.state?.enemyAilmentSources?.[type] || "").match(/^Follower: (.+?) [IVX]+\b/)?.[1];
  if (skill) {
    if (!ctx.followerEvents.has(skill)) ctx.followerEvents.set(skill, []);
    ctx.followerEvents.get(skill).push(effect);
    return;
  }
  const dealing = dealt ? ctx.targets.filter((target) => dealsType(target, dealt)) : [];
  for (const target of dealing.length ? dealing : ctx.targets) target.onHit.push(effect);
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
  let any = false;
  for (const target of ctx.targets) for (const line of target.claim("frostbite", (line) => /^Frostbite\b/.test(line.source) || /against Frozen enemies/.test(line.text))) { target.addModifier(line, { buff: "frostbite", percent: line.value, steadyAmount: line.value }); any = true; }
  if (!any) return;
  addAilmentEvent(ctx, "Frostbite", { kind: "buff", buff: "frostbite", seconds: AILMENT_SECONDS.Frostbite }, "Cold");
  ctx.reported("frostbite").events = "the first Cold hit inflicts the fixed rating (manual), so Frozen too at 100+; each hit renews it";
}

export function numbedLayer(ctx) {
  if (!ctx.isLive("numbed")) return;
  const effect = (ctx.planner.lineEffects?.combat?.timedEffects || []).find((item) => item.id === "numbed");
  const part = effect?.parts?.[0];
  const maxStacks = part?.schedule?.maxStacks ?? 10;
  const stacks = ctx.options.numbedStacks ?? maxStacks;
  let any = false;
  for (const target of ctx.targets) {
    const line = target.claimPattern("numbed", /^Numbed\b/)[0];
    if (!line) continue;
    const perStack = part?.percent ?? line.value / maxStacks;
    target.addModifier(line, { collector: "numbed", perStack: true, percent: perStack, capPercent: perStack * stacks, steadyAmount: line.value });
    for (const id of TIMED_IDS.numbed) target.timedIds.add(id);
    any = true;
  }
  if (!any) return;
  ctx.collectors.push({ key: "numbed", windowSeconds: AILMENT_SECONDS.Numbed });
  addAilmentEvent(ctx, "Numbed", { kind: "collect", collector: "numbed" }, "Lightning");
  ctx.reported("numbed").events = `one stack per Numbing hit, each on its own ${AILMENT_SECONDS.Numbed} s (keyword 762), up to ${stacks}; the per-damage threshold is not counted (open question tick-numbed-stacks)`;
}

export function curseLayer(ctx) {
  if (!ctx.isLive("curse")) return;
  let any = false;
  for (const target of ctx.targets) for (const line of target.claimPattern("curse", /curse \(Lv\./)) { target.addModifier(line, { buff: "curse", percent: line.value, steadyAmount: line.value }); any = true; }
  if (!any || !ctx.first("curse")) return;
  const skill = ctx.planner.curseLimit?.active?.[0] || "Curse";
  const interval = prepareEvery(ctx.planner, skill) ?? FRAME_SECONDS;
  // Terrain of Malice holds the curse on enemies in the area, so one cast keeps it (src/skill-coverage.js: curse uptime is continuous).
  ctx.triggers.push({ key: "curse", actor: "player", label: `${skill} (Preparation every ${interval} s)`, intervalSeconds: interval, effects: [{ kind: "buff", buff: "curse", seconds: Infinity }] });
  ctx.reported("curse").events = `Preparation's first check (node 206, inCdOnCreating false) casts it on tick 1; one cast holds it`;
}

export function ailmentTypeLayer(ctx) {
  if (!ctx.isLive("ailmentTypes")) return;
  const source = (ctx.planner.lineEffects?.lines || []).find((line) => line.condition === "ailmentTypes" && !/Minion/.test(line.text));
  const percent = Number((String(source?.text).match(/\+([\d.]+)% additional Hit Damage \(multiplies\)/) || [])[1]);
  const state = ctx.planner.lineEffects?.state || {};
  if (!source || !(percent > 0)) return;
  const types = state.enemyAilments || [];
  let any = false;
  for (const target of ctx.targets) {
    const line = target.claim("ailmentTypes", (item) => item.source === source.source && /additional Hit Damage$/.test(item.text))[0];
    if (!line) continue;
    target.addModifier(line, { count: types.map((type) => ({ buff: `ailment:${type}` })), percent, steadyAmount: line.value });
    any = true;
  }
  if (!any || !ctx.first("ailmentTypes")) return;
  for (const type of types) addAilmentEvent(ctx, type, { kind: "buff", buff: `ailment:${type}`, seconds: AILMENT_SECONDS[type] ?? 4 }, type === "Frostbite" || type === "Frozen" ? "Cold" : type === "Numbed" ? "Lightning" : null);
  ctx.reported("ailmentTypes").events = `(1 + ${percent}%)^n with n the ailment types held now: ${types.join(", ")}, each on its own inflicting hit`;
}

export function markLayer(ctx) {
  const { mark } = ctx.planner, line = mark?.critOnlyLine, source = mark?.sources?.find((item) => item.on === "crit");
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
// hits, so full at engagement with prebuiltSelfBuffs, else from the first hit on. They go through the resistance step (layer "penetration"):
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
    if (ctx.prebuilt) ctx.initialBuffs.push({ buff, stacks, seconds: RECENT_SECONDS });
    taken.push(`+${value / stacks}% up to ${stacks}`);
  });
  if (taken.length) ctx.reported("penetrationStacks").events = `${taken.join(", ")}, through the resistance step${ctx.prebuilt ? "; full at engagement (prebuilt)" : "; from the first hit"}`;
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
  const entries = (ctx.planner.blessings?.entries || []).filter((entry) => ["Focus", "Tenacity"].includes(entry.name) && entry.consumptionCycle?.source === "True Flame Immolation");
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
    if (refill > 0) target.after.push({ kind: "buff", buff, seconds: Infinity, stacks: refill, maxStacks: max });
    // Other gains between casts at their rate (a timed line, an Elixir cast): one stack per 1 ÷ rate s.
    if (cycle.gainPerSecond > 0 && !cycle.fills && ctx.first(`trueFlameGain:${buff}`)) ctx.periodics.push({ key: `trueFlameGain:${buff}`, actor: "player", label: `${entry.name} Blessing gains between True Flame casts`, intervalSeconds: 1 / cycle.gainPerSecond, effects: [{ kind: "buff", buff, seconds: Infinity, stacks: 1, maxStacks: max }] });
    if (ctx.prebuilt && buff === "tenacity" && ctx.first("tenacityStart")) ctx.initialBuffs.push({ buff, stacks: cycle.held ?? entry.stacks, seconds: Infinity });
  }
  ctx.reported("trueFlame").events = `each cast reads Focus ${focus.consumptionCycle.held} and Tenacity ${tenacity.consumptionCycle.held} (the planner's held stacks), removes them all and grants ${focus.consumptionCycle.refill} / ${tenacity.consumptionCycle.refill} back (${Math.round(focus.consumptionCycle.cooldownRecoveryPercent * 100) / 100}% Cooldown Recovery Speed)`;
}

/** The general builders in their order; the Youga program interleaves its own among them (src/tick-youga-layers.js). */
export const GENERAL_ORDER = Object.freeze([aimLayer, swiftBoltLayer, spellAggressionLayer, periodicBurstLayer, blessingLayer, trueFlameLayer, tidewellLayer, paralysisLayer, frailLayer, frostbiteLayer, numbedLayer, curseLayer, ailmentTypeLayer, markLayer, penetrationLayer, timedLayer, followerProgram]);

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
