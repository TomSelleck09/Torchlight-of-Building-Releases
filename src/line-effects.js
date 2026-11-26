import { UnitBuffSet, putCombatHolds, putFollowerDebuffs, putOwnCombatHolds } from "./unit-buff-set.js";
import { classifyDoubleDamageLine } from "./double-damage.js";
import { classifyPassiveSupportLine } from "./passive-support-lines.js";
import { normalizePercentageText } from "./percentage-text.js";
import { classifyDamageLine } from "./damage-line-classifier.js";
import { classifyHitLine } from "./skill-hit-lines.js";
import { classifyWeaponAttackLine } from "./weapon-damage-model.js";
import { parseBlessingModifier } from "./blessing-model.js";
import { classifyMinionLine } from "./minion-damage-model.js";
import { splitCondition, resolveLineCondition } from "./line-conditions.js";
import { matchTalentTextClause } from "./talent-text-effects.js";
import { resolveCombatStates, readByCombatStates, deteriorationFrom, infiltrationEffectPercent, BUFF_VALUES } from "./combat-states.js";
import { resolveHeroModules, heroModuleFor, heroModuleRevivedLine } from "./hero-trait-modules.js";
import { resolveOrigins, readsOriginLine } from "./origin-of-spirit-magus.js";
import { resolveFollowerEffects } from "./follower-model.js";
import { classifyCritOnlyLine } from "./crit-only-lines.js";
import { classifyTaggedCritLine } from "./scorching-beam-critical.js";

// Conditional and per-stat passive lines from every source (research/talent-batch-2026-10-12.md §7.2, chunk 2):
// talent nodes, cores, gear, slates, prisms, pacts, kismets and hero memories (planner.modifierTexts). Each line with
// a condition the shared resolver knows (src/line-conditions.js) gets one reading:
//   - active: its body (the unconditional template, scaled by a per-stack count, expected share or uptime) becomes a
//     derived plain line in planner.modifierTexts, so every engine reads it the way it reads the same plain line
//     (beam hit and Ignite ledgers through build-mechanics, spell / attack hits, skill DoTs, the weapon model, Minions);
//     a speed body also reaches the cast-rate ledger (`castSpeed`), a Blessing cap body the Blessing model (`blessing`);
//   - inactive / not on dummy / unmodeled: nothing is applied and the line keeps the reason for its badge.
// Lines another path already reads are left to it (`handledElsewhere`): the calibrated paths keep their own ledgers
// (Elite / Boss / Cursed and "damage against <state> enemies" in build-mechanics and skill-hit-lines, handedness and
// Dual Wield in the weapon model, Blur lines in blur-effects, Blessing lines in the Blessing model, Full Life pact lines).

const NUMBER = /^([+-]?\d+(?:\.\d+)?)%/;
const SPEED = /^([+-]?\d+(?:\.\d+)?)% (additional )?(Attack and Cast Speed|Cast Speed|Attack Speed)$/i;
const MECHANICS_TARGET = /^\+(\d+(?:\.\d+)?)% (additional )?damage (?:against (?:(\w+) enemies|enemies affected by Ailments)|(?:against|to) (Elites|Bosses))$/i;
// Lich (4,3) "+10% Movement Speed while Blur is active" (record 101010157): the line resolver's (src/line-conditions.js key blurActive).
// The defence bodies gated on Blur the same way (records 101010221, 427747424, 884419904: Evasion and Defense; reach census follow-up 2026-11-25).
const BLUR_MOVEMENT_SPEED = /^[+-]?\d+(?:\.\d+)?% Movement Speed while Blur is active$|^(?:When Dexterity is greater than Strength, )?[+-]?\d+(?:\.\d+)? Evasion while Blur is active\.?$|^While Blur is active, [+-]?\d+(?:\.\d+)?% Defense$/i;

export function handledElsewhere(text) {
  // Focus / Combo Damage Enhancement: summed by resolveDamageEnhancement below.
  if (ENHANCEMENT.test(text)) return true;
  if (readsOriginLine(text)) return true;
  // Double Damage wordings src/double-damage.js reads whole ("… while channeling" carries its own Channeled scope).
  if (classifyDoubleDamageLine(text)) return true;
  // Buffs, debuffs, Lucky, Frostbite / Numbed and Deterioration lines: src/combat-states.js (talent batch chunk 3).
  if (readByCombatStates(text)) return true;
  if (classifyDamageLine(text) || classifyHitLine(text) || classifyWeaponAttackLine(text) || (parseBlessingModifier(text) && parseBlessingModifier(text).kind !== "lineEffect")) return true;
  if (MECHANICS_TARGET.test(text)) return true;
  // Keys of the shared talent / slate table (e.g. "+2% Fire Penetration against Ignited enemies") and damage-taken lines
  // (own defence: src/low-resource-model.js, src/effective-hp.js; enemy debuffs: curse and support models). The table's "Movement Speed while
  // Blur is active" key (talent display only, no reader) is the line resolver's (key blurActive, record 101010157; reach census 2026-11-25).
  if (!BLUR_MOVEMENT_SPEED.test(text) && (matchTalentTextClause(text, "talent") || matchTalentTextClause(text, "slate"))) return true;
  // (Impending's stacking enemy debuff is read by src/combat-states.js since the residual batch, checked above.)
  // (Haze's standing-still row ends on your own damage taken: its condition rule reads the damage part, src/line-conditions.js.)
  if (/damage taken/i.test(text) && !/^Every [\d.]+ s, .+ for enemies within \d+ m\.|^When Ignite is inflicted, Ignite spreads|Attack Horizontal Projectile Damage taken by nearby enemies$|^While standing still, .+ dealt by attacks\. [+-]?[\d.]+% additional damage taken$/i.test(text)) return true;
  // Blur lines belong to src/blur-effects.js, except Stab In The Back's Blur consumption (resolved here as not modeled), Chain behind
  // the Curtain's Affliction Effect (chunk 12, key blurRatingPoints) and a Movement Speed body gated on Blur (record 101010157, key blurActive).
  if (/\bBlur\b/i.test(text) && !BLUR_MOVEMENT_SPEED.test(text) && !/^While Blur is active, loses Blur after casting a Main Skill|Affliction Effect for every 1 Blur Rating$|^Adds [\d.]+ - [\d.]+ \w+ Damage to Attacks and Spells while Blur is active$/i.test(text)) return true;
  // (Only the pact "Affliction … at Full Life" lines belong to the planner's Full Life model; other "at Full Life" lines
  // resolve here with the fullLife key: gear-pact batch chunk 2.)
  // The crit model reads "For every 1% Fire Resistance, +X% Critical Strike Damage, up to +Y%" (src/scorching-beam-critical.js
  // perFireResistance); the other per-resistance lines resolve here (legendary audit batch 1, key perResistance).
  if (/^For every 1 ?% Fire Resistance, \+[\d.]+ ?% Critical Strike Damage, up to \+[\d.]+ ?%$/i.test(text)) return true;
  // The block model reads "+X% damage / Critical Strike Rating if you have Blocked recently" (src/block-model.js); other bodies
  // with that condition resolve here (legendary audit batch 1, 2026-10-22).
  if (/^\+[\d.]+\s*%\s+(?:damage|Critical Strike Rating) if you have Blocked recently$|Affliction.*(?:at|on) Full Life\.?$|with Max Affliction/i.test(text)) return true;
  return false;
}

// Which engines read a derived body (for the status and the badge).
export function bodyReaders(body) {
  body = normalizeBody(body);
  const readers = [];
  if (SPEED.test(body)) readers.push("speed");
  // Crit lines: the spell crit model (src/scorching-beam-critical.js) and the weapon model read derived crit lines.
  // "+X% additional Critical Strike Rating" (Cohesion; core audit batch B3) is its own multiplier on the rating in both models.
  if (/^[+-]?[\d.]+% (?:Spell |Attack )?Critical Strike (?:Rating|Damage)$/i.test(body) || /^[+-]?[\d.]+% additional (?:Spell |Attack )?Critical Strike Rating$/i.test(body)) readers.push("crit");
  // Flat rating bodies: "+N Critical Strike Rating" (both crit models; the revived Frostbitten Critical Strike Rating family) and
  // "+N (Attack and) Spell Critical Strike Rating" (the spell crit model).
  if (/^\+[\d.]+ (?:(?:Attack and )?Spell )?Critical Strike Rating$/i.test(body)) readers.push("crit");
  // Tag-scoped crit bodies ("+60% Melee Attack Critical Strike Damage" from "… against Elites", Kismet: Giant Bear; kismet / pact
  // audit 2026-10-21): the crit models read them by tag (src/scorching-beam-critical.js classifyTaggedCritLine).
  if (classifyTaggedCritLine(body)) readers.push("crit");
  if (classifyDamageLine(body)) readers.push("damage");
  if (classifyHitLine(body)) readers.push("hit");
  if (classifyWeaponAttackLine(body)) readers.push("weapon");
  if (classifyMinionLine(body)) readers.push("minion");
  if (classifyDoubleDamageLine(body)) readers.push("doubleDamage");
  // Crit-only additional damage (src/crit-only-lines.js; Feline Fury's dual-wield body, hero trait audit B2).
  if (classifyCritOnlyLine(body)) readers.push("critOnly");
  if (classifyPassiveSupportLine(body)) readers.push("passiveSupport");
  const blessing = parseBlessingModifier(body);
  if (blessing && blessing.kind === "cap") readers.push("blessing");
  if (ENHANCEMENT.test(body)) readers.push("enhancement");
  // A conditional global Aura Effect body is read by the Aura ledger through src/conditional-aura-effect.js (gear uniques round 2).
  if (/^[+-]?[\d.]+% Aura Effect$/i.test(body)) readers.push("aura");
  // "+X% Reaping Duration" (src/reaping-model.js collectReapingModifiers reads the derived line; Psychic's Dirge).
  if (/^\+[\d.]+% Reaping Duration$/i.test(body)) readers.push("reaping");
  // "+X% Projectile Speed" (Law of Greed's "+X% Projectile Speed per stack of Max Spell Burst, up to +Y%", record 125797304: node 114
  // from Max Spell Burst to attr 6005 increased): the derived line joins the plain Projectile Speed lines every Projectile Speed
  // reader takes (the Gale-type conversions in src/skill-hit-model.js projectileSpeedState, Youga's Projectile Speed bonus, the
  // Minion batch-6 summoner sum). Before 2026-11-09 the body had no reader and the line read Not modeled.
  if (/^[+-]?[\d.]+% Projectile Speed$/i.test(body)) readers.push("projectileSpeed");
  // "+X% Affliction Effect" (src/build-mechanics.js derivedAfflictionEffect → the shared Affliction effect ledger; the revived
  // "For every enemy within 20 m nearby" family).
  if (/^\+[\d.]+% Affliction Effect$/i.test(body)) readers.push("affliction");
  // Confusion Elemental Belt's gated node-381 lines ("When X is greater than Y, gains …"): src/ailment-model.js flatBase reads the derived
  // line. Before, only the ungated Evil Heart wording reached a reader, on every path, under an In calc badge.
  if (/^gains [\d.]+ ?% - [\d.]+ ?% of the added Flat Damage's (?:value as )?Base (?:Ignite|Trauma|Wilt|Ailment) Damage$/i.test(body)) readers.push("ailment");
  // Imperious Verdict's Focus Buff Effect (src/build-mechanics.js reads the derived line; chunk 12).
  if (/^\+[\d.]+% Focus Buff Effect$/i.test(body)) readers.push("focus");
  // Elegy of Immortality's ailment part (chunk 12; src/ailment-applications.js, the beam's Ignite in src/build-mechanics.js).
  if (/^\+[\d.]+% additional Ailment Damage dealt by Channeled Skills$/i.test(body)) readers.push("ailment");
  // Extra ailment stacks (src/ailment-model.js extraStacks; Strayed Healer's Waistguard, legendary audit batch 8).
  if (/^\+?[\d.]+% chance to inflict (?:an|\d+) additional stack(?:\(s\))? of (?:Trauma|Wilt)$/i.test(body)) readers.push("ailment");
  // An ailment's duration (src/ailment-model.js "duration" reads the derived line; "+X% Trauma Duration when inflicting Trauma on Trauma
  // enemies", wiring audit gap 4, 2026-11-03).
  if (/^[+-]?[\d.]+% (?:Trauma|Wilt) Duration$/i.test(body)) readers.push("ailment");
  // Spirit Magus initial Growth (src/minion-damage-model.js GROWTH_INITIAL; Friend Nemesis, legendary audit batch 7).
  if (/^\+?[\d.]+ initial Growth for Spirit Magi$/i.test(body)) readers.push("minion");
  // A share of the added flat damage as base ailment damage (src/ailment-model.js flatBase; Confusion Elemental Belt).
  if (/^gains [\d.]+% - [\d.]+% of the added Flat Damage's (?:value as )?Base (?:Ignite|Trauma|Wilt|Ailment) Damage$/i.test(body)) readers.push("ailment");
  return [...new Set(readers)];
}

// Bodies with no damage effect on the dummy (own recovery, movement, block). A held condition whose only bodies are neutral reads
// No DPS effect (batch 1 2026-10-27; before, Not modeled: "+20% Movement Speed when Focus Blessing reaches max stacks", "Regenerates
// 0.56% Mana per second while Focus Blessing is active").
// Physique (field 2010019) is the body's size, No DPS effect everywhere else (chunk 9 F19); Caged Fury's "+35% Physique" beside its +35%
// additional damage (research/caged-fury-audit-2026-11-05.md) read Partly modeled for it.
const NEUTRAL_REGEN = /^Regenerates [\d.]+ ?% (?:Mana|Life|Energy Shield) per second$/i;
const NEUTRAL_BODY = /^[+-]?[\d.]+ ?% (?:Life Regain(?: and Energy Shield Regain)?|Energy Shield Regain|Movement Speed|Physique|Block Ratio|(?:Attack |Spell |Attack and Spell )?Block Chance)$/i;

// Conditional bodies use "Attack Speed and Cast Speed" where the plain template says "Attack and Cast Speed".
const normalizeBody = (body) => String(body).replace(/Attack Speed and Cast Speed/i, "Attack and Cast Speed");

export const scaleBody = (body, factor, power, multiplier) => {
  body = normalizeBody(body);
  // Added flat damage scales both ends ("Adds 7 - 9 Fire Damage to Attacks and Spells" per Blessing stack; chunk 4).
  const added = body.match(/^Adds ([\d.]+) ?[-–] ?([\d.]+) (.+)$/i);
  if (added && power == null) {
    const scale = (factor ?? 1) * multiplier;
    const r = (value) => Math.round(Number(value) * scale * 10000) / 10000;
    return `Adds ${r(added[1])} - ${r(added[2])} ${added[3]}`;
  }
  const match = body.match(NUMBER);
  // A flat crit rating body scales like a percentage ("+70 Spell Critical Strike Rating per Ailment on enemies, up to +140", The
  // Bone worm's Daughter; kismet / pact audit 2026-10-21): the crit models read "+N (Spell) Critical Strike Rating" (bodyReaders).
  const flatRating = !match && power == null && factor != null && body.match(/^([+-]?\d+(?:\.\d+)?)( (?:(?:Attack and )?Spell )?Critical Strike Rating)$/i);
  if (flatRating) {
    const rounded = Math.round(Number(flatRating[1]) * multiplier * (factor ?? 1) * 10000) / 10000;
    return `${rounded >= 0 ? "+" : ""}${rounded}${flatRating[2]}`;
  }
  // A body without a percentage ("+1 to Max Focus Blessing Stacks") is taken as written when nothing scales it.
  if (!match) return factor == null && power == null && multiplier === 1 ? body : null;
  const base = Number(match[1]) * multiplier;
  const value = power != null ? ((1 + base / 100) ** power - 1) * 100 : base * (factor ?? 1);
  const rounded = Math.round(value * 10000) / 10000;
  return `${rounded >= 0 ? "+" : ""}${rounded}${body.slice(match[0].length - 1)}`;
};

// A body with no damage effect (Regain, Movement Speed, Block) leaves the line In calc (legendary
// audit 2026-10-22: Agony's Embrace read Partly modeled for its Regain half while its Penetration moved the figures).
const neutralBody = (item) => { const body = normalizePercentageText(item.body).replace(/\s+/g, " ").trim(); return NEUTRAL_BODY.test(body) || NEUTRAL_REGEN.test(body); };
// A line's badge from its resolved condition and bodies. A body-less condition (Hare's Agility's stack gain: its stacks are the next
// clause's factor) is In calc while it holds; a resolved `partial` (a part with no reading, named in the condition text) reads Partly modeled.
function entryStatus(resolved, bodies) {
  const unread = bodies.filter((item) => !item.readers.length && !neutralBody(item));
  return resolved.notOnDummy ? "Not on dummy" : resolved.unmodeled ? "Not modeled" : resolved.active === null ? "Not modeled" : !resolved.active ? "Inactive" : !bodies.length ? "In calc" : bodies.every((item) => !item.readers.length && neutralBody(item)) ? "No DPS effect" : bodies.every((item) => !item.readers.length) ? "Not modeled" : unread.length || resolved.partial ? "Partly modeled" : "In calc";
}
const derivedLineOf = (line, item, split, resolved, timeShare = null) => ({ text: item.derivedText, source: line.source, origin: line.origin, multiplier: 1, derivedFrom: line.text, lineEffect: { conditional: true, key: split.condition.key, conditionText: resolved.conditionText, provisional: Boolean(resolved.provisional), ...(timeShare ? { timeShare } : {}) } });

/**
 * Settle the lines of one condition `key` again on a later state, in place: the entries in `lineEffects.lines`, and their derived lines in
 * `lineEffects.derived` and `modifierTexts` (removed and re-added when the text changes). src/planner.js runs it for the per-Movement-Speed
 * lines once the held conditional Movement Speed has joined the stat sheet's figure (Haze's "+1% additional Damage per +5% Movement Speed",
 * node 114 reading the combat increased Movement Speed). Speed and Blessing bodies are not re-routed (no key it is used for has one).
 * @returns {boolean} whether a derived line changed
 */
export function resettleLineEffects(lineEffects, key, state, modifierTexts = []) {
  let changed = false;
  const squash = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
  for (const entry of lineEffects?.lines || []) {
    if (entry.condition !== key) continue;
    const line = modifierTexts.find((item) => item.source === entry.source && item.origin !== "derived" && !item.lineEffect && squash(item.text) === entry.text);
    if (!line) continue;
    const split = { condition: { key, params: entry.params, wording: entry.text } };
    const resolved = resolveLineCondition(split.condition, state);
    const multiplier = line.multiplier ?? 1;
    const bodies = entry.bodies.map((item, index) => ({ ...item, derivedText: resolved.active ? scaleBody(item.body, resolved.bodyFactors?.[index] !== undefined ? resolved.bodyFactors[index] : resolved.factor, resolved.power, multiplier) : null }));
    const old = (lineEffects.derived || []).filter((item) => item.lineEffect?.key === key && item.source === line.source && item.derivedFrom === line.text);
    const fresh = resolved.active && !resolved.ownSkillOnly ? bodies.filter((item) => item.derivedText && item.readers.length).map((item) => derivedLineOf(line, item, split, resolved)) : [];
    Object.assign(entry, { active: resolved.active === true, conditionText: resolved.conditionText, provisional: Boolean(resolved.provisional), factor: resolved.factor ?? null, bodies, status: entryStatus(resolved, bodies) });
    if (old.map((item) => item.text).join("\n") === fresh.map((item) => item.text).join("\n")) { for (const item of old) item.lineEffect = { ...item.lineEffect, conditionText: resolved.conditionText }; continue; }
    changed = true;
    for (const item of old) {
      const at = lineEffects.derived.indexOf(item);
      if (at >= 0) lineEffects.derived.splice(at, 1);
      const there = modifierTexts.indexOf(item);
      if (there >= 0) modifierTexts.splice(there, 1);
    }
    lineEffects.derived.push(...fresh);
    modifierTexts.push(...fresh);
  }
  return changed;
}

/**
 * @param {object[]} modifierTexts planner.modifierTexts (lines with { text, source, origin, multiplier })
 * @param {object} state src/planner.js lineConditionState
 * @returns {{ lines, derived, castSpeed: { increasedPercent, additionalPercents }, blessing, groups }}
 */
export function resolveLineEffects(modifierTexts = [], state = null) {
  const lines = [], derived = [], blessing = [];
  const castSpeed = { increasedPercent: 0, additionalPercents: [], sources: [] };
  // Buffs, debuffs and ailment effects first: their states (Fervor, Aggression, Hasten) are conditions of other lines.
  const combat = resolveCombatStates(modifierTexts, state || {});
  combat.deterioration = deteriorationFrom(modifierTexts, state || {}, combat.entries, { hasProfane: Boolean(combat.buffs?.hasProfane) });
  // The crowd control types on the dummy (Thea – Blasphemer's Mountain of Sins reads them; hero trait audit B7).
  // The dummy's debuffs (Frail, Infiltration types) for the follower's Frail / Infiltration Effect taken (src/follower-model.js AFFIX_EFFECTS).
  if (state) { state.buffs = combat.buffs; state.regain = combat.regain; state.enemyCrowdControl = combat.crowdControl || []; state.ownCrowdControl = combat.ownCrowdControl || null; state.enemyCrowdControlShares = combat.crowdControlShares || {}; state.crowdControlReaders = combat.crowdControlReaders || 0; state.ailmentReaders = combat.ailmentReaders || null; state.deteriorationActive = Boolean(combat.deterioration); state.enemyDebuffs = combat.debuffs || null; }
  // The same holds on the dummy's unit buff set (W8 step 2, src/unit-buff-set.js putCombatHolds): the crowd control view, the held
  // debuffs and the Numbed / Frostbite levels. A copy, so a badge probe's shallow state copy (src/line-coverage.js) leaves the planner's set alone.
  if (state?.enemyBuffs instanceof UnitBuffSet) state.enemyBuffs = putCombatHolds(state.enemyBuffs.clone(), combat);
  // Your held buffs (Aggression, Hasten, Profane, Fortitude, Fervor) on your unit buff set (W9 step 2), set where `state.buffs` is: a copy too.
  if (state?.playerBuffs instanceof UnitBuffSet) state.playerBuffs = putOwnCombatHolds(state.playerBuffs.clone(), combat);
  lines.push(...combat.entries);
  derived.push(...combat.derived);
  // Hero trait modules (talent batch chunk 4): ammo, Spacetime Illusion, Purgatory, Crimson Tide; Not modeled with a reason
  // for the hero cycles the text leaves undefined.
  const hero = resolveHeroModules(modifierTexts, state || {});
  // Clocked hero-module effects (Purgatory) join the combat states' timed effects (src/timed-effects.js).
  combat.timedEffects.push(...(hero.timedEffects || []));
  lines.push(...hero.entries);
  derived.push(...hero.derived);
  // Follower (2026-10-15; src/follower-model.js): the modeled Tartarus Skill buffs as derived lines, each behind its best-case
  // switch (listed with the timed effects in src/planner.js bestCaseAssumptions); `follower` keeps every line's reading.
  // Each held Infiltration's own value H, its caster's Effect in it (buff 3441 / 3451 / 3461's GetEffectScale: the caster's attr 3401): 13 × (1 + your
  // "+X% <Type> Infiltration Effect") for yours, 13 for one only the follower keeps, as src/combat-states.js derives the held line. Medium
  // Penetration lifts it (src/follower-model.js; reach census fourth follow-ups, 2026-11-25). On the beam path the beam's own Fire Infiltration
  // is not among the types.
  const heldTypes = (combat.debuffs?.infiltration || []).filter((type) => !(type === "Fire" && state?.beamActive)), followerOnly = new Set(combat.debuffs?.followerInfiltration || []);
  const infiltrationHeldPercent = heldTypes.length ? Object.fromEntries(heldTypes.map((type) => [type, BUFF_VALUES.infiltration * (1 + (followerOnly.has(type) ? 0 : infiltrationEffectPercent(modifierTexts, type, { heroId: state?.heroId ?? null })) / 100)])) : null;
  const follower = resolveFollowerEffects(state?.follower || null, state || {}, { infiltrationHeldPercent });
  combat.timedEffects.push(...follower.timedEffects);
  // The follower's debuffs on the dummy join its unit buff set (W8 step 2; entries only, their readers read the derived lines).
  if (state?.enemyBuffs instanceof UnitBuffSet) putFollowerDebuffs(state.enemyBuffs, follower.timedEffects);
  derived.push(...follower.derived);
  // Hare's Agility: the cap of the stacks gained when exiting Stand Still, for the per-stack clause (src/line-conditions.js).
  if (state) state.exitStandStillMaxStacks = modifierTexts.reduce((max, line) => {
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(/^When exiting Stand Still, gains 1 stack of buff that lasts for [\d.]+ ?s, up to (\d+) times$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  // "for each Spell Projectile generated recently" (On the Sublime): recipe 587878912 feeds one shared buff, 35117, with a stack cap of 10 (chunk 12), so two wands hold one buff: the larger roll.
  const sharedProjectileBuff = modifierTexts.reduce((best, line) => { const value = Number(normalizePercentageText(String(line.text ?? "")).trim().match(/^\+?(\d+(?:\.\d+)?)% .+ for each (?:Spell )?Projectile generated recently/i)?.[1]) * (line.multiplier ?? 1); return line.origin !== "derived" && !line.lineEffect && value > (best?.value ?? 0) ? { line, value } : best; }, null);
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    const text = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim();
    // Youga's hero-exclusive revived lines the Spacetime modules read (hero trait audit B4) are theirs too.
    if (!text || handledElsewhere(text) || (line.origin === "trait" && heroModuleFor(state?.heroId, text)) || (line.origin === "memory" && heroModuleRevivedLine(state?.heroId, text))) continue;
    const split = splitCondition(text);
    if (!split) continue;
    if (split.condition.key === "projectilesGenerated" && sharedProjectileBuff && line !== sharedProjectileBuff.line) {
      lines.push({ source: line.source, origin: line.origin, text, condition: split.condition.key, params: split.condition.params, group: null, active: false, conditionText: "one shared buff (35117, 10 stacks): the other copy holds it", status: "No DPS effect" });
      continue;
    }
    const resolved = resolveLineCondition(split.condition, state);
    const multiplier = line.multiplier ?? 1;
    // `bodyFactors` (optional): a per-body factor in place of `factor` (Hare's Agility: the Attack Speed holds out of the damage part's range).
    const bodies = split.bodies.map((body, index) => {
      const derivedText = resolved.active ? scaleBody(body, resolved.bodyFactors?.[index] !== undefined ? resolved.bodyFactors[index] : resolved.factor, resolved.power, multiplier) : null;
      return { body, derivedText, readers: bodyReaders(body) };
    });
    const status = entryStatus(resolved, bodies);
    const entry = { source: line.source, origin: line.origin, text, condition: split.condition.key, params: split.condition.params, group: resolved.group, active: resolved.active === true, conditionText: resolved.conditionText, provisional: Boolean(resolved.provisional), factor: resolved.factor ?? null, bodies, status };
    lines.push(entry);
    // A body the owning skill's own ledger reads (Stab In The Back: src/planner.js stabInTheBackLines): no build-wide derived line.
    if (resolved.ownSkillOnly) entry.ownSkillOnly = true;
    if (!resolved.active || resolved.ownSkillOnly) continue;
    for (const item of bodies) {
      if (!item.derivedText || !item.readers.length) continue;
      // `timeShare` (2026-10-27, research/lucky-crit-mechanics-2026-10-27.md): the body holds this share of the time / uses (its value is
      // the time average); the crit models split such crit terms into on / off states (src/crit-time-states.js).
      const timeShare = resolved.timeShare && resolved.factor > 0 && resolved.factor < 1 ? resolved.factor : null;
      const derivedLine = derivedLineOf(line, item, split, resolved, timeShare);
      derived.push(derivedLine);
      const speed = item.derivedText.match(SPEED);
      if (speed && /Cast Speed/i.test(speed[3])) {
        const value = Number(speed[1]);
        if (speed[2]) castSpeed.additionalPercents.push(value); else castSpeed.increasedPercent += value;
        castSpeed.sources.push({ source: line.source, text: `${item.derivedText} (${line.text})`, value, additional: Boolean(speed[2]) });
      }
      if (item.readers.includes("blessing")) blessing.push({ text: item.derivedText, source: `${line.source} (${resolved.conditionText})` });
    }
  }
  // Speed lines of the combat states join the cast-rate ledger like any derived line, and so do the follower's (a support
  // affix's "+X% Attack and Cast Speed", src/follower-model.js AFFIX_BUFFS, 2026-10-19) and the hero modules' (Thea's Might Flow,
  // Agile Godhood, Divine Realm Power, Tarnished Sage; hero trait audit B7).
  for (const line of [...combat.derived, ...follower.derived, ...hero.derived]) {
    const speed = line.text.match(SPEED);
    if (speed && /Cast Speed/i.test(speed[3])) { const value = Number(speed[1]); if (speed[2]) castSpeed.additionalPercents.push(value); else castSpeed.increasedPercent += value; castSpeed.sources.push({ source: line.source, text: line.text, value, additional: Boolean(speed[2]) }); }
  }
  const enhancement = resolveDamageEnhancement(modifierTexts, derived);
  lines.push(...enhancement.entries);
  derived.push(...enhancement.derived);
  // Origin of Spirit Magus (residual batch A2-origin): the summoner's lines from the active Magus summons and Origin grants.
  const origin = resolveOrigins({ summons: state?.spiritMagusSummons || [], modifierTexts });
  // Merging Stream (Iris – Vigilant Breeze, hero trait audit B6): "Iris is not affected by Origin of Spirit Magus Effects, and all
  // basic Origin of Spirit Magus Effects will be applied to all Spirit Magi": no summoner line; src/minion-damage-model.js applies
  // them to the Magi (src/moto-iris-traits.js mergingStreamOrigins).
  const originToMagi = Boolean(state?.motoIris?.vigilant?.merging && !state.motoIris.vigilant.merging.noOriginLine);
  if (!originToMagi) derived.push(...origin.derived);
  for (const line of originToMagi ? [] : origin.derived) {
    const speed = line.text.match(SPEED);
    if (speed && /Cast Speed/i.test(speed[3])) { const value = Number(speed[1]); if (speed[2]) castSpeed.additionalPercents.push(value); else castSpeed.increasedPercent += value; castSpeed.sources.push({ source: line.source, text: line.text, value, additional: Boolean(speed[2]) }); }
  }
  for (const line of modifierTexts.filter((item) => readsOriginLine(item.text))) {
    const text = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim();
    // Thunder / Fire reach the player's own hits only (the Magus is a Minion: manual rule 1001011821).
    const damage = origin.origins.some((item) => item.damage) && Boolean(originToMagi ? state?.motoIris?.hasMagus : state?.anyHit);
    lines.push({ source: line.source, origin: line.origin, text, condition: "origin", params: {}, group: null, active: damage, conditionText: `${originToMagi ? "Merging Stream: on the Spirit Magi instead of Iris. " : ""}${origin.origins.length ? `Origins: ${origin.origins.map((item) => `${item.magus} Lv.${item.level}${item.damage ? "" : " (defensive)"}`).join(", ")}` : "no Spirit Magus Origin in the build"}`, provisional: true, factor: null, bodies: [], status: damage ? "In calc" : origin.origins.length ? "No DPS effect" : "Inactive" });
  }
  const groups = new Set(lines.filter((entry) => entry.group).map((entry) => entry.group));
  return { lines, derived, castSpeed, blessing, groups, combat, hero, follower };
}

// Focus / Combo Damage Enhancement (game manual 1001012926 / 1001013030): "additionally increases the damage and Ailment
// Damage dealt by Focus (Combo) Skills, and the values of each Enhancement affix are stacked together" — the lines add up and
// act as one additional multiplier, read as "+Σ% additional Focus (Combo) Skill Damage" on the skills with that tag. The
// classifier scopes that line to hits; src/skill-dot-model.js applies it to a tagged skill's own damage over time; the
// Ailment Damage share of those skills is not scoped per inflicting skill yet.
// Terra Damage Enhancement (frost-terra audit 2026-10-13): game affix 6635189 "+P1% Terra Damage Enhancement" writes the same
// field 2006249 (damage enhancement, one internally stacked multiplier) as Focus (826715904) and Ailment (15289773) Damage
// Enhancement, tagged Terra (6000370), so it follows the same manual rule (no manual entry names Terra itself).
const ENHANCEMENT = /^\+(\d+(?:\.\d+)?)% (Focus|Combo|Terra) Damage Enhancement$/i;
function resolveDamageEnhancement(modifierTexts, derivedLines) {
  const sums = {}, entries = [], derived = [];
  for (const line of [...modifierTexts.filter((item) => item.origin !== "derived" && !item.lineEffect), ...derivedLines]) {
    const text = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim();
    const match = text.match(ENHANCEMENT);
    if (!match) continue;
    const kind = match[2][0].toUpperCase() + match[2].slice(1).toLowerCase();
    const value = Number(match[1]) * (line.multiplier ?? 1);
    (sums[kind] ??= []).push({ source: line.source, value });
    if (!line.lineEffect) entries.push({ source: line.source, origin: line.origin, text, condition: "enhancement", params: { kind }, group: null, active: true, conditionText: `${kind} Damage Enhancement: every Enhancement line adds up, then one additional multiplier on ${kind} Skills' damage (game manual${kind === "Terra" ? "; Terra through game field 2006249, the same field as Focus" : ""}): their hits and their own damage over time; the Ailment Damage share is not scoped per skill yet`, provisional: false, factor: null, bodies: [{ body: text, derivedText: `+${value}% additional ${kind} Skill Damage`, readers: ["damage"] }], status: "In calc" });
  }
  for (const [kind, list] of Object.entries(sums)) {
    const total = Math.round(list.reduce((sum, item) => sum + item.value, 0) * 10000) / 10000;
    if (!total) continue;
    derived.push({ text: `+${total}% additional ${kind} Skill Damage`, source: `${kind} Damage Enhancement (${list.map((item) => item.source).join(", ")})`, origin: "buff", multiplier: 1, derivedFrom: `${kind} Damage Enhancement`, lineEffect: { conditional: false, key: "enhancement", conditionText: `Σ ${list.length} ${kind} Damage Enhancement line${list.length === 1 ? "" : "s"}`, provisional: false } });
  }
  return { entries, derived };
}

/** The resolved entry for a tooltip clause (badges), or null. */
export function lineEffectFor(planner, text) {
  const clean = normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
  return planner?.lineEffects?.lines?.find((entry) => entry.text === clean) || null;
}
