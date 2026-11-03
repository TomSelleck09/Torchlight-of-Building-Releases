// Hit side from the game recipes (recipe interpreter step 3, user goal 2026-10-25 "everything in the calc"; research/
// recipe-interpreter-step1-2026-10-25.md §15). The same method as the Trauma (§9), Ignite (§11) and DoT (§14) switches: each modifier
// line is resolved to its affix recipe (src/recipe-interpreter.js) and its writes are read by attribute id, bucket and tag id; the text
// readers stay as the fallback for the lines the recipe cannot place; model entries (supports, Auras, Blur, Tide, Aim, Blessings, the
// skill level's own damage, core talents …) stay as they are.
//
// What a hit reads from a recipe ("hit facts", one per write, merged across damage types):
//   damage            5719 / 5002 / 5107 / 5108 / 5109 / 5402 / 5727, mod 3 increased / mod 4 additional; the skill-type tags (Spell 6001100,
//                     Attack 6001090, Channeled 6000030 …) scope the hit; DoT 5100309, the DoT flow 5000004 and the ailment tags never reach a
//                     hit; hit 5000003 (and the Hit skill tag 6001060) makes it hit-only; mod 2 is added flat damage (by the Spell / Attack
//                     tags: "to Spells", "to Attacks").
//   max / min damage  5806 / 5801 / 5802 …, 5812 / 5807 … (mod 4).
//   taken             5720 / 5003 / 5120 … written on the enemy (node 111 → enemies); one written on yourself is your own defence.
//   penetration       5104 / 5105 / 5106 / 5414 (flat); armour penetration field 2006247.
//   crit              4802 rating (mod 1 flat, mod 3 increased, mod 4 additional), 4803 crit damage (mod 1: added to the 150% base).
//   speed             6001 Attack Speed, 6002 Cast Speed (mod 3 / mod 4), 6007 Cooldown Recovery Speed.
//   double damage     field 2006224; skill level field 2006400 (tags: the skills it raises; Active 6000200, Support 6000100, Main 6020000).
//   weapon-local      nodes 363 (gear-local), 364 (item base) and 321 (item-scoped): the weapon model reads them (src/weapon-damage-model.js).
// Whether a recipe gate holds (target Cursed, Frozen, Blur active, "if you have dealt a Critical Strike recently" …) is still the planner's
// condition state: a conditional write counts where the text path counted the line and is left out otherwise (the rule of §9). The dummy
// is a Boss and an Elite (src/dummy-target.js).
//
// Modes (dev-only switches back to the text readers): TLI_HIT_PATH=text (damage, taken, penetration, added, Min / Max, double damage,
// skill levels, the weapon's damage lines), TLI_CRIT_PATH=text (crit rating and damage, spell and attack), TLI_SPEED_PATH=text (Cast /
// Attack Speed, Cooldown Recovery Speed) in the environment, globalThis.TLI_HIT_PATH = "text" … in a browser console, or
// setHitPathMode("text") / setCritPathMode / setSpeedPathMode in a script or test.
//
// This module reads only the interpreter (no text reader is imported), so every hit model can import it without a cycle; the per-line
// text side of the aggregates (talent / slate / gear / pact totals) is src/recipe-hit-aggregates.js.
import { affixRecipesLoaded, interpretLine, lineGameIds, loadAffixRecipes, settleRowScaled } from "./recipe-interpreter.js";
import { normalizePercentageText } from "./percentage-text.js";

try { await loadAffixRecipes(); } catch { /* the text paths stay */ }

// ---------------------------------------------------------------------------------------------------------------------------
// Modes.
const overrides = { hit: null, crit: null, speed: null };
const FLAGS = { hit: "TLI_HIT_PATH", crit: "TLI_CRIT_PATH", speed: "TLI_SPEED_PATH" };
function pathMode(kind) {
  const flag = overrides[kind] ?? globalThis[FLAGS[kind]] ?? globalThis.process?.env?.[FLAGS[kind]] ?? null;
  if (flag === "text") return "text";
  return affixRecipesLoaded() ? "recipe" : "text";
}
const setter = (kind) => (mode) => { overrides[kind] = mode === "text" || mode === "recipe" ? mode : null; };
/** Dev-only: "text" runs the old text readers, "recipe" the recipe path, null the default. */
export const setHitPathMode = setter("hit");
export const setCritPathMode = setter("crit");
export const setSpeedPathMode = setter("speed");
export const hitPathMode = () => pathMode("hit");
export const critPathMode = () => pathMode("crit");
export const speedPathMode = () => pathMode("speed");
/** All three at once (scripts and tests). */
export function setAllHitModes(mode) { setHitPathMode(mode); setCritPathMode(mode); setSpeedPathMode(mode); }

// ---------------------------------------------------------------------------------------------------------------------------
// Tags. Game skill tags (the localization `skill_tag|des`, AFFIX_TAG_NAMES) -> the planner's skill tags (src/data skill catalogs).
export const SKILL_TAG_IDS = Object.freeze({
  Strength: 6000001, Dexterity: 6000002, Intelligence: 6000003, Mobility: 6000010, Channeled: 6000030, Warcry: 6000040, Trigger: 6000080, Support: 6000100, Area: 6000130,
  Persistent: 6000140, Curse: 6000150, Aura: 6000160, Summon: 6000180, Active: 6000200, Defensive: 6000210, Focus: 6000290, Restoration: 6000300, Minion: 6000340,
  Sentry: 6000360, Terra: 6000370, Beam: 6000380, Barrage: 6000390, Combo: 6000410, Elixir: 6000420, Cold: 6001010, Erosion: 6001020, Fire: 6001030,
  Lightning: 6001040, Physical: 6001050, Attack: 6001090, Spell: 6001100, Projectile: 6001110, Horizontal: 6001111, Melee: 6001120, Ranged: 6001130,
  "Damage Over Time": 6001170, Empower: 6001230, Demolisher: 6010010, Multistrike: 6010060, "Spell Burst": 6010090, "Main Skill": 6020000
});
const TAG_NAME = new Map(Object.entries(SKILL_TAG_IDS).filter(([name]) => name !== "Minions").map(([name, id]) => [id, name]));
const TAG = Object.freeze({ thisSkill: 5000002, hit: 5000003, dotFlow: 5000004, dot: 5100309, ailment: 5100001, elementalAilment: 5100002, ignite: 5100003, trauma: 5100006, wilt: 5100007, crit: 5001010, minion: 5002060, elite: 5001990, boss: 5002000, hitSkill: 6001060, anyMonster: 5001980 });
const DOT_TAGS = new Set([TAG.dot, TAG.dotFlow, TAG.ailment, TAG.elementalAilment, TAG.ignite, TAG.trauma, TAG.wilt]);
const DUMMY_STATES = new Set([TAG.elite, TAG.boss]); // the training dummy is a Boss, so also an Elite (src/dummy-target.js)
const STATE = (tag) => tag >= 4000000 && tag < 5000000;
const SKILL = (tag) => tag >= 6000000 && tag < 7000000;
const TYPE_NAME = { physical: "Physical", fire: "Fire", cold: "Cold", lightning: "Lightning", erosion: "Erosion" };
const ELEMENTAL = ["Fire", "Cold", "Lightning"];
const typesOf = (type) => (type === "all" || type == null ? null : type === "elemental" ? [...ELEMENTAL].sort() : TYPE_NAME[type] ? [TYPE_NAME[type]] : undefined);

const squash = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const tagList = (tags, side) => (tags && Array.isArray(tags[side]) ? tags[side] : []);

// ---------------------------------------------------------------------------------------------------------------------------
// One interpreter effect -> hit facts.
const HIT_CONCEPTS = new Set(["damage", "maxDamage", "minDamage", "damageTaken", "penetration", "armorPenetration", "critRating", "critDamage", "attackSpeed", "castSpeed", "cooldownRecoverySpeed", "doubleDamageChance", "skillLevel"]);
// Conditions that remain after the scope-like ones, the per-hit trigger and the dummy's Boss / Elite rank.
const remaining = (effect) => (effect.conditions || []).filter((c) => !c.scopeLike && c.kind !== "perHit" && !(c.kind === "state" && DUMMY_STATES.has(c.tag) && !c.negated));

/** @returns {{ facts: object[], relevant: boolean, none?: string, unplaceable?: string }} */
function classifyHitEffect(effect) {
  const concept = effect.concept;
  if (!HIT_CONCEPTS.has(concept)) return { facts: [], relevant: false };
  const none = (why) => ({ facts: [], relevant: true, none: why });
  const unplaceable = (why) => ({ facts: [], relevant: true, unplaceable: why });
  if (effect.target === "minion") return none("Minions only");
  if (effect.target === "ally") return none("written on allies");
  if (effect.target === "buffBearer") return unplaceable("written on an applied buff's bearer");
  if (["convert", "perStat", "perTargetStat", "share", "perEntity", "perAilmentType", "byDistance", "nextAction"].includes(effect.kind)) return unplaceable(`${effect.kind}: scaled by a runtime value`);
  if (effect.understood === false) return unplaceable(effect.reason || "not understood");
  if (effect.value === null || effect.value === undefined || effect.dynamic?.some((d) => d !== "scale")) return unplaceable(`runtime value (${(effect.dynamic || ["unevaluated"]).join(", ")})`);
  if (effect.layer === "derivedField" || effect.layer === "derivedLabel") return unplaceable("an encoded field / label write");
  if (effect.tagAlt) return unplaceable("alternative tag lists (any one of several tag sets)");
  const tags = effect.tagIds;
  if (tagList(tags, "notMine").length || tagList(tags, "notOthers").length) return unplaceable("negated tags");
  // A timed or event-triggered write (a buff after an event, a stack per hit) is an uptime / stack model's business; the damage
  // calculation (trigger 1000031) scopes the damage record and is read. It is not hit-only by itself: the tags below settle that.
  if (effect.node === "b" || (effect.triggerId && effect.triggerId !== 1000031)) return unplaceable("a timed / triggered write (stack or uptime model)");
  const mine = tagList(tags, "mine"), others = tagList(tags, "others");
  if (mine.includes(TAG.minion)) return none("Minions only");
  // Skill-type tags scope the write; the hit and DoT tags settle the flow; owner states are conditions (the interpreter lists them).
  const skillTags = [];
  let hitOnly = false;
  for (const tag of mine) {
    if (STATE(tag)) continue;
    if (tag === TAG.hit || tag === TAG.hitSkill) { hitOnly = true; continue; }
    if (DOT_TAGS.has(tag)) return none(tag === TAG.dot || tag === TAG.dotFlow ? "damage over time only" : "ailments only");
    if (tag === TAG.crit) return unplaceable("Critical Strikes only (the crit-only readers, src/crit-only-lines.js)");
    if (SKILL(tag) && TAG_NAME.has(tag)) { skillTags.push(TAG_NAME.get(tag)); continue; }
    return unplaceable(`tag ${tag} on the write`);
  }
  // Scope-like gates: a skill-tag gate (208, or 10 on a skill tag) narrows the write like a tag on it; the target checks (hostile, Life not
  // locked) and the effect-source check hold against the dummy; a weapon, slot, item, engram or hero gate is the build's own state, which
  // the text readers settle (src/weapon-damage-model.js handedness …), so such a write keeps the text reading.
  for (const c of effect.conditions || []) {
    if (!c.scopeLike || c.kind === "perHit" || ["repeat", "random", "background", "targetAttitude", "targetCheck", "unitAlive"].includes(c.kind)) continue;
    const gateTag = c.kind === "skillTag" ? c.tag : c.kind === "state" ? c.gateTag : undefined;
    if (gateTag !== undefined && !c.negated && SKILL(gateTag) && TAG_NAME.has(gateTag)) { skillTags.push(TAG_NAME.get(gateTag)); continue; }
    return unplaceable(`a build-settled gate (${c.text})`);
  }
  const conditions = remaining(effect);
  const targetStates = conditions.filter((c) => c.kind === "state" && c.on === "target" && !c.negated).map((c) => c.tag);
  // "others" tags on a dealt write: target states (conditions the interpreter lists), the dummy's rank, any monster; a skill tag there
  // names the incoming hit of a "damage taken" write.
  const otherSkill = [];
  for (const tag of others) {
    if (STATE(tag) || DUMMY_STATES.has(tag) || tag === TAG.anyMonster) continue;
    if (concept === "damageTaken" && (tag === TAG.hit || tag === TAG.hitSkill)) { hitOnly = true; continue; }
    if (concept === "damageTaken" && DOT_TAGS.has(tag)) return none("damage over time / ailment damage taken");
    if (concept === "damageTaken" && SKILL(tag) && TAG_NAME.has(tag)) { otherSkill.push(TAG_NAME.get(tag)); continue; }
    return unplaceable(`target tag ${tag}`);
  }
  const base = {
    value: effect.value, skillTags: skillTags.length ? skillTags.sort() : null, hitOnly,
    conditions: conditions.map((c) => c.text), conditional: conditions.length > 0, ...(targetStates.length ? { targetStates } : {}),
    affixId: effect.viaAffix ?? effect.id, ...(effect.local ? { local: effect.local } : {})
  };
  const bucket = effect.bucket;
  switch (concept) {
    case "damage": {
      const damageTypes = typesOf(effect.type);
      if (damageTypes === undefined) return unplaceable(`damage type ${effect.type}`);
      if (effect.target === "enemy") return none("written on enemies");
      if (bucket === "added") return { facts: [{ ...base, kind: "added", min: effect.value, max: effect.upper ?? effect.value, type: damageTypes?.length === 1 ? damageTypes[0] : null, damageTypes }], relevant: true };
      if (bucket === "increased" || bucket === "additional") return { facts: [{ ...base, kind: "damage", layer: bucket, damageTypes }], relevant: true };
      return unplaceable(`${bucket} damage`);
    }
    case "maxDamage": case "minDamage": {
      const damageTypes = typesOf(effect.type);
      if (damageTypes === undefined) return unplaceable(`damage type ${effect.type}`);
      return bucket === "additional" ? { facts: [{ ...base, kind: concept, damageTypes }], relevant: true } : unplaceable(`${bucket} ${concept}`);
    }
    case "damageTaken": {
      if (effect.target !== "enemy") return none("damage taken by you (defensive)");
      const damageTypes = typesOf(effect.type === "dot" ? "all" : effect.type);
      if (effect.type === "dot") return none("damage over time taken");
      if (damageTypes === undefined) return unplaceable(`damage type ${effect.type}`);
      if (bucket !== "additional" && bucket !== "increased") return unplaceable(`${bucket} damage taken`);
      return { facts: [{ ...base, kind: "taken", layer: bucket, damageTypes, skillTags: otherSkill.length ? otherSkill.sort() : base.skillTags }], relevant: true };
    }
    case "penetration": {
      if (effect.target !== "self") return unplaceable("penetration written on another unit");
      const damageTypes = typesOf(effect.type);
      if (!damageTypes) return unplaceable(`penetration of ${effect.type}`);
      return bucket === "flat" || bucket === "increased" ? { facts: [{ ...base, kind: "penetration", damageTypes }], relevant: true } : unplaceable(`${bucket} penetration`);
    }
    case "armorPenetration": return { facts: [{ ...base, kind: "armourPenetration" }], relevant: true };
    case "critRating": {
      if (!["flat", "increased", "additional"].includes(bucket)) return unplaceable(`${bucket} Critical Strike Rating`);
      return { facts: [{ ...base, kind: "critRating", layer: bucket }], relevant: true };
    }
    case "critDamage": return bucket === "flat" || bucket === "increased" ? { facts: [{ ...base, kind: "critDamage", layer: bucket }], relevant: true } : unplaceable(`${bucket} Critical Strike Damage`);
    case "attackSpeed": case "castSpeed": case "cooldownRecoverySpeed": {
      const kind = concept === "cooldownRecoverySpeed" ? "cooldownRecovery" : concept;
      if (bucket === "flat" && effect.local === "itemBase" && concept === "attackSpeed") return { facts: [{ ...base, kind, layer: "base" }], relevant: true };
      return bucket === "increased" || bucket === "additional" ? { facts: [{ ...base, kind, layer: bucket }], relevant: true } : unplaceable(`${bucket} ${concept}`);
    }
    case "doubleDamageChance": return { facts: [{ ...base, kind: "doubleDamage" }], relevant: true };
    case "skillLevel": return { facts: [{ ...base, kind: "skillLevel" }], relevant: true };
    default: return { facts: [], relevant: false };
  }
}

// One write per damage type ("+X% Elemental and Erosion Resistance Penetration": 5104 / 5105 / 5106 / 5414; "Adds X - Y Fire Damage to
// Attacks and Spells": one write per skill tag) is one fact.
const shapeKey = (fact) => JSON.stringify([fact.kind, fact.layer ?? null, fact.value, fact.min ?? null, fact.max ?? null, fact.hitOnly, fact.conditions, fact.local ?? null, fact.targetStates ?? null]);
function mergeFacts(facts) {
  const out = [];
  for (const fact of facts) {
    const same = out.find((other) => shapeKey(other) === shapeKey(fact));
    if (!same) { out.push({ ...fact }); continue; }
    if (fact.kind === "added" && JSON.stringify(same.damageTypes) === JSON.stringify(fact.damageTypes)) {
      // One write per skill tag: the line reaches each of them ("to Attacks and Spells").
      same.addedTo = [...new Set([...(same.addedTo || [same.skillTags?.join("+") ?? "any"]), fact.skillTags?.join("+") ?? "any"])];
      continue;
    }
    if (JSON.stringify(same.skillTags) === JSON.stringify(fact.skillTags) && same.damageTypes && fact.damageTypes) { same.damageTypes = [...new Set([...same.damageTypes, ...fact.damageTypes])].sort(); continue; }
    out.push({ ...fact });
  }
  for (const fact of out) if (fact.kind === "added" && !fact.addedTo) fact.addedTo = [fact.skillTags?.join("+") ?? "any"];
  return out;
}

const SYNTHETIC_ORIGINS = new Set(["derived", "follower", "buff"]);
// The text names a condition or a scaling the recipe rows do not show (code reads it): the text reading stays (the rule of §9).
const CONDITION_OR_SCALING = /\b(?:when|while|if|after|during|recently|against|for each|for every|per (?!second)|stacks? up to|stacking up to|in the last|within)\b/i;

/** interpretLine with the line's game record (§13), following the planner wording on a template mismatch (the rule of §14 / §15). */
function resolveHitLine(text, line) {
  const resolved = interpretLine(text, { multiplier: 1, origin: line.origin, line });
  return resolved?.templateMismatch ? resolved.templateMismatch.wording : resolved;
}

const cache = new Map();
/**
 * The recipe's hit facts of one modifier line (values per rank: the callers scale by `line.multiplier`, as they do the text readings).
 * @returns {{ status: "placed"|"none"|"fallback", reason: string|null, affixId: number|null, resolvedBy: string|null, facts: object[] }}
 */
export function recipeHitFacts(line) {
  const text = squash(line?.text);
  const game = lineGameIds(line);
  const key = `${line.origin}|${line.lineEffect ? "derived|" : ""}${text}|${game ? `${game.how}:${game.key}` : ""}`;
  if (cache.has(key)) return cache.get(key);
  const result = (() => {
    if (!affixRecipesLoaded()) return { status: "fallback", reason: "no recipe table", facts: [] };
    if (SYNTHETIC_ORIGINS.has(line.origin) || line.lineEffect) return { status: "fallback", reason: "planner-made line (no game affix)", facts: [] };
    // Hero trait lines: the trait models settle their condition and uptime in code (the rule of §14).
    if (line.origin === "trait") return { status: "fallback", reason: "hero trait line (the hero trait models apply its condition and uptime)", facts: [] };
    const resolved = resolveHitLine(text, line);
    if (!resolved) return { status: "fallback", reason: "no game template with this shape", facts: [] };
    // The line's game record settled the template ("exact" / "id", §13): its own affix decides; a text match ("single", "origin",
    // "majority") needs every same-text template to read the same.
    const recordIds = ["exact", "id"].includes(resolved.resolvedBy) || (resolved.gameIds?.exact && !resolved.gameIds.unbound && resolved.gameIds.ids?.includes(resolved.chosen.id)) ? new Set(resolved.gameIds?.ids ?? [resolved.chosen.id]) : null;
    const candidates = recordIds ? resolved.candidates.filter((candidate) => recordIds.has(candidate.id) || candidate === resolved.chosen) : resolved.candidates;
    const placements = candidates.map((candidate) => {
      const effects = candidate.result.effects.filter((e) => !e.conditions.some((c) => c.noDps || c.notOnDummy));
      const parts = effects.map((effect) => settleRowScaled(effect, classifyHitEffect(effect), "facts"));
      const relevant = parts.filter((part) => part.relevant);
      const facts = mergeFacts(relevant.flatMap((part) => part.facts));
      return { id: candidate.id, blocked: relevant.find((part) => part.unplaceable)?.unplaceable ?? null, facts, none: relevant.filter((part) => part.none).map((part) => part.none), notOnDummy: candidate.result.effects.some((e) => HIT_CONCEPTS.has(e.concept) && e.conditions.some((c) => c.notOnDummy)), signature: JSON.stringify(facts.map((f) => ({ ...f, affixId: undefined }))) };
    });
    const chosen = placements.find((placement) => placement.id === resolved.chosen.id) || placements[0];
    const base = { affixId: chosen.id, resolvedBy: resolved.resolvedBy };
    if (!resolved.chosen.result.effects.length) return { ...base, status: "fallback", reason: "the recipe has no effect rows for this line (code rule)", facts: [] };
    // A Dual Kismet line's record is a set bonus (node 133) whose own rows are not in the extracted table (census #5, 2026-10-27): the
    // text reading stays, as for a recipe with no rows.
    if (resolved.chosen.result.effects.every((effect) => effect.kind === "setBonus")) return { ...base, status: "fallback", reason: "Dual Kismet set bonus: the set's rows are not in the extracted table (text reading)", facts: [] };
    if (new Set(placements.map((p) => `${p.blocked ?? ""}|${p.signature}`)).size > 1) return { ...base, status: "fallback", reason: `same-text templates place it differently (${placements.map((p) => p.id).join(", ")})`, facts: [] };
    if (chosen.blocked) return { ...base, status: "fallback", reason: chosen.blocked, facts: [] };
    if (!chosen.facts.length) return { ...base, status: "none", reason: chosen.none.length ? [...new Set(chosen.none)].join("; ") : chosen.notOnDummy ? "not on the dummy (on defeat …)" : "no hit write", facts: [] };
    if (CONDITION_OR_SCALING.test(text) && !chosen.facts.some((fact) => fact.conditional)) return { ...base, status: "fallback", reason: "the text names a condition or scaling the recipe rows do not show (code)", facts: [] };
    return { ...base, status: "placed", reason: null, facts: chosen.facts };
  })();
  if (cache.size > 20000) cache.clear();
  cache.set(key, result);
  return result;
}

// ---------------------------------------------------------------------------------------------------------------------------
const PART_KIND = (text) => (/ Min /i.test(` ${text} `) ? "minDamage" : / Max /i.test(` ${text} `) ? "maxDamage" : null);
function compoundPart(facts, partText) {
  if (facts.status !== "placed") return facts;
  const kind = PART_KIND(partText);
  const own = facts.facts.filter((fact) => fact.kind === kind);
  return own.length === 1 ? { ...facts, facts: own, part: kind } : { ...facts, status: "fallback", reason: "one part of a compound line the recipe does not split", facts: [] };
}
/**
 * A per-line reader for a list of modifier lines: the recipe facts of each line, with the lines the planner resolved into a derived line
 * (`derivedFrom`, src/line-effects.js) kept on their text reading (the derived line carries them; the rule of §9).
 */
export function hitRecipeReader(modifierTexts = []) {
  const resolvedInto = new Set(modifierTexts.filter((line) => line?.derivedFrom).map((line) => `${line.source}|${squash(line.derivedFrom)}`));
  return (line) => {
    if (!line) return { status: "fallback", reason: "no line", facts: [] };
    // One part of a compound "Min …, and Max …" line (src/skill-hit-lines.js splitHitLineText): the whole line's recipe, its part's write.
    const facts = line.compoundText ? compoundPart(recipeHitFacts({ ...line, text: line.compoundText }), line.text) : recipeHitFacts(line);
    if (facts.status !== "fallback" && resolvedInto.has(`${line.source}|${squash(line.text)}`)) return { ...facts, status: "fallback", reason: "resolved into a derived line (src/line-effects.js)", facts: [] };
    return facts;
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Consumers. Each converts the facts into the shape its text reader returns, so the model code reads the two the same way.

// Recipe gates the planner's state settles for a line the text reader never read (also src/recipe-hit-aggregates.js settledCondition).
export function settledConditionOf(conditions = []) {
  if (conditions.length === 1 && conditions[0] === "target Cursed") return { need: "targetCursed", label: "target Cursed (curse on the dummy)" };
  if (conditions.length === 2 && conditions.some((text) => /GetStatReserve\(1001\)/.test(text)) && conditions.some((text) => /GetStatReserve\(1301\)/.test(text))) return { need: "sealedLifeAndMana", label: "both Sealed Mana and Life" };
  return null;
}
const HIT_LINE_KINDS = new Set(["damage", "maxDamage", "minDamage", "taken", "penetration", "armourPenetration", "added", "castSpeed", "cooldownRecovery"]);
const setOf = (list) => (list ? new Set(list) : null);
/**
 * The recipe reading of one line in src/skill-hit-lines.js classifyHitLine's shape (the generic skill hits), or `undefined` when the text
 * reading stays. `textParsed` is classifyHitLine's reading of the same line: a conditional write counts only where it counted.
 */
export function hitLineFromFacts(facts, textParsed, state = null) {
  if (facts.status === "fallback") return undefined;
  const relevant = facts.facts.filter((fact) => HIT_LINE_KINDS.has(fact.kind) && !fact.local);
  if (!relevant.length) return null;
  if (new Set(relevant.map((fact) => fact.kind)).size > 1 || relevant.length > 1) return undefined;
  const fact = relevant[0];
  // A conditional write the text reader never read counts only when its gate is one the planner's state settles (target Cursed,
  // both Sealed Mana and Life: the beam ledger's rule, src/recipe-hit-aggregates.js settledCondition; F6 2026-10-27).
  let settledLabel = null;
  if (fact.conditional && !textParsed) {
    const settled = state ? settledConditionOf(fact.conditions) : null;
    if (!settled || !state[settled.need]) return null;
    settledLabel = settled.label;
  }
  // "Active" scopes nothing for a hit model (factReaches).
  const ownTags = (fact.skillTags || []).filter((tag) => tag !== "Active");
  const scope = { damageTypes: setOf(fact.damageTypes), skillTags: ownTags.length ? new Set(ownTags) : null, hitOnly: fact.hitOnly };
  const recipe = { affixId: fact.affixId, ...(fact.conditions.length ? { conditions: fact.conditions } : {}) };
  switch (fact.kind) {
    case "damage": return { kind: "damage", layer: fact.layer, value: fact.value, scope, condition: textParsed?.condition ?? settledLabel ?? (fact.conditions.length ? fact.conditions.join(", ") : null), recipe };
    case "maxDamage": case "minDamage": return { kind: fact.kind, value: fact.value, scope, recipe };
    case "taken": return { kind: "taken", layer: fact.layer, value: fact.value, scope, enemy: true, recipe };
    case "penetration": return { kind: "penetration", value: fact.value, damageTypes: new Set(fact.damageTypes), recipe };
    case "armourPenetration": return { kind: "armourPenetration", value: fact.value, recipe };
    case "added": {
      const to = new Set(fact.addedTo);
      // An untagged write (Elementalist (5,3) "Adds 2 - 2 Cold Damage to Attacks and Spells", 101010630) adds to every hit of yours:
      // Spells and Attacks alike.
      const any = to.has("any"), spells = to.has("Spell") || any, attacks = to.has("Attack") || any;
      if (!spells && !attacks) return undefined;
      return { kind: "added", min: fact.min, max: fact.max, type: fact.type, to: spells ? "spells" : "other", alsoAttacks: attacks, recipe };
    }
    case "castSpeed": return ownTags.length ? undefined : { kind: "castSpeed", value: fact.value, additional: fact.layer === "additional", recipe };
    case "cooldownRecovery": return ownTags.length ? undefined : { kind: "cooldownRecovery", value: fact.value, additional: fact.layer === "additional", recipe };
    default: return undefined;
  }
}

/** Plain comparable form of a classifyHitLine-shaped reading (scripts, tests). */
export function hitLineSignature(parsed) {
  if (!parsed) return null;
  const list = (set) => (set ? [...set].sort() : null);
  const scope = parsed.scope ? { damageTypes: list(parsed.scope.damageTypes), skillTags: list(parsed.scope.skillTags), hitOnly: Boolean(parsed.scope.hitOnly) } : undefined;
  const out = { kind: parsed.kind, value: parsed.value ?? null };
  if (parsed.layer) out.layer = parsed.layer;
  if (scope) out.scope = scope;
  if (parsed.damageTypes) out.damageTypes = list(parsed.damageTypes);
  if (parsed.kind === "added") Object.assign(out, { min: parsed.min, max: parsed.max, type: parsed.type, to: parsed.to });
  if (parsed.additional !== undefined) out.additional = Boolean(parsed.additional);
  return JSON.stringify(out);
}

/** Does a fact's skill-tag scope reach a skill with `tags`? (Every listed tag required; src/skill-hit-lines.js scopeApplies.) */
// "Active" (6000200): every skill a hit model reads is an active skill (the text readers' "Active Skill" scope adds no restriction either;
// skill levels read it as a role, skillLevelFromFacts).
export const factReaches = (fact, tags) => !fact.skillTags || fact.skillTags.every((tag) => tag === "Active" || tags.has(tag));

/**
 * The recipe's crit contribution of one line to a skill with `tags` (a Set): flat / increased rating, the additional rating factors and
 * the crit damage (with its Spell-only share, which an attack path removes). null when the text reading stays; zeros when the recipe has
 * no crit write that reaches the skill. Weapon-local writes (the weapon's own rating) are the weapon model's.
 * `textCounted`: whether the text side counted any crit from the line (a conditional write counts only then).
 */
export function critFromFacts(facts, tags, { textCounted = false, attack = false } = {}) {
  if (facts.status === "fallback") return null;
  const out = { flat: 0, increased: 0, additional: [], damage: 0, spellOnlyDamage: 0 };
  for (const fact of facts.facts) {
    if ((fact.kind !== "critRating" && fact.kind !== "critDamage") || fact.local) continue;
    if (!factReaches(fact, tags)) continue;
    if (fact.conditional && !textCounted) continue;
    if (fact.kind === "critDamage") { out.damage += fact.value; if (fact.skillTags?.length === 1 && fact.skillTags[0] === "Spell" && !attack) out.spellOnlyDamage += fact.value; continue; }
    if (fact.layer === "flat") out.flat += fact.value;
    else if (fact.layer === "increased") out.increased += fact.value;
    else out.additional.push(fact.value);
  }
  return out;
}

/** The recipe's Cast / Attack Speed contribution of one line to a skill with `tags`: { increased, additional: [] } (null: text stays). */
export function speedFromFacts(facts, tags, kind = "castSpeed", { textCounted = false } = {}) {
  if (facts.status === "fallback") return null;
  const out = { increased: 0, additional: [] };
  for (const fact of facts.facts) {
    if (fact.kind !== kind || fact.local || fact.layer === "base") continue;
    if (!factReaches(fact, tags)) continue;
    if (fact.conditional && !textCounted) continue;
    if (fact.layer === "increased") out.increased += fact.value; else out.additional.push(fact.value);
  }
  return out;
}

/** The recipe's skill levels of one line for a skill ({ role, tags, activeSlotMagus }); null when the text reading stays. */
export function skillLevelFromFacts(facts, skill) {
  if (facts.status === "fallback") return null;
  const tags = new Set((skill.tags || []).map((tag) => String(tag)));
  const takesActive = skill.role !== "aura" && skill.role !== "support" || skill.activeSlotMagus === true;
  let total = 0, activeSlot = 0;
  for (const fact of facts.facts) {
    if (fact.kind !== "skillLevel") continue;
    if (fact.conditional) return null;
    const wanted = fact.skillTags || [];
    // Role tags: Active (active-role skills, and a Spirit Magus in an active slot), Main Skill (the main), Support (supports).
    const role = wanted.filter((tag) => tag === "Active" || tag === "Main Skill");
    const rest = wanted.filter((tag) => tag !== "Active" && tag !== "Main Skill");
    if (role.includes("Active") && !takesActive) continue;
    if (role.includes("Main Skill") && skill.role !== "main") continue;
    // "+N Minion Skill Level" raises Summon skills (user decision 2026-10-22).
    if (!rest.every((tag) => tags.has(tag) || (tag === "Minion" && tags.has("Summon")))) continue;
    total += fact.value;
    if (role.includes("Active") && !rest.length && skill.role === "aura") activeSlot += fact.value;
  }
  return { total, activeSlot };
}

/** The recipe's Double Damage chance of one line ({ value, tags }), null when the text reading stays, or { value: 0 } without one. */
export function doubleDamageFromFacts(facts) {
  if (facts.status === "fallback") return null;
  const writes = facts.facts.filter((fact) => fact.kind === "doubleDamage");
  if (!writes.length) return { value: 0, tags: [] };
  if (writes.length > 1 || writes[0].conditional) return null;
  return { value: writes[0].value, tags: writes[0].skillTags || [] };
}

/**
 * The recipe reading of one build-wide line for the weapon model (src/weapon-damage-model.js classifyWeaponAttackLine's shape), or
 * `undefined` when the text reading stays. Attack Speed (6001), the attack crit rating (4802 without a Spell-only scope) and added damage
 * to Attacks; handedness, fixed-value and per-hand lines keep the text.
 */
export function weaponLineFromFacts(facts, textParsed) {
  if (facts.status === "fallback") return undefined;
  const writes = facts.facts.filter((fact) => !fact.local && ["attackSpeed", "critRating", "added"].includes(fact.kind));
  // The text reader's kinds the recipe does not express (handedness, fixed values, Main-Hand only) keep the text.
  if (textParsed && !["attackSpeed", "attackSpeedDual", "critFlat", "critPercent", "critAdditional", "addedAttacks"].includes(textParsed.kind)) return undefined;
  if (!writes.length) return null;
  const speed = writes.filter((fact) => fact.kind === "attackSpeed");
  const crit = writes.filter((fact) => fact.kind === "critRating" && factReaches(fact, new Set(["Attack"])));
  const added = writes.filter((fact) => fact.kind === "added" && (fact.addedTo || []).some((to) => to === "Attack" || to === "any"));
  const used = [speed.length ? "speed" : null, crit.length ? "crit" : null, added.length ? "added" : null].filter(Boolean);
  if (used.length > 1) return undefined;
  const conditional = (list) => list.some((fact) => fact.conditional);
  if (speed.length) {
    if (speed.length > 1 || speed[0].skillTags) return undefined;
    if (conditional(speed) && !textParsed) return null;
    const dual = speed[0].conditions.some((text) => /Dual Wielding/i.test(text));
    return { kind: dual ? "attackSpeedDual" : "attackSpeed", value: speed[0].value, additional: speed[0].layer === "additional", recipe: { affixId: speed[0].affixId } };
  }
  if (crit.length) {
    if (crit.length > 1) return undefined;
    if (conditional(crit) && !textParsed) return null;
    const kind = { flat: "critFlat", increased: "critPercent", additional: "critAdditional" }[crit[0].layer];
    return { kind, value: crit[0].value, recipe: { affixId: crit[0].affixId } };
  }
  if (added.length) {
    if (added.length > 1 || conditional(added)) return added.length > 1 ? undefined : (textParsed ? undefined : null);
    return { kind: "addedAttacks", type: added[0].type, min: added[0].min, max: added[0].max, value: (added[0].min + added[0].max) / 2, recipe: { affixId: added[0].affixId } };
  }
  return null;
}

/**
 * The recipe reading of one weapon-local line (an item's own base or local affix: nodes 364 / 363) in the shape readWeapon accumulates:
 * { kind: "baseDamage" | "baseCrit" | "baseSpeed" | "localPhysical" | "localElemental" | "localAdded" | "localSpeed" | "localCrit" |
 * "localCritFlat", … }, null for a line with no weapon-local write, `undefined` when the text reading stays.
 */
export function weaponLocalFromFacts(facts) {
  if (facts.status === "fallback") return undefined;
  const local = facts.facts.filter((fact) => fact.local === "itemBase" || fact.local === "gear");
  if (!local.length) return null;
  if (local.some((fact) => fact.conditional)) return undefined;
  const one = (fact) => {
    if (fact.local === "itemBase") {
      if (fact.kind === "added" && fact.type) return { kind: "baseDamage", type: fact.type, min: fact.min, max: fact.max };
      if (fact.kind === "critRating" && fact.layer === "flat") return { kind: "baseCrit", value: fact.value };
      if (fact.kind === "attackSpeed" && fact.layer === "base") return { kind: "baseSpeed", value: fact.value };
      return undefined;
    }
    if (fact.kind === "damage" && fact.layer === "increased" && JSON.stringify(fact.damageTypes) === JSON.stringify(["Physical"])) return { kind: "localPhysical", value: fact.value };
    if (fact.kind === "damage" && fact.layer === "increased" && JSON.stringify([...(fact.damageTypes || [])].sort()) === JSON.stringify([...ELEMENTAL].sort())) return { kind: "localElemental", value: fact.value };
    if (fact.kind === "added") return { kind: "localAdded", types: fact.damageTypes, min: fact.min, max: fact.max };
    if (fact.kind === "attackSpeed" && fact.layer === "increased") return { kind: "localSpeed", value: fact.value };
    if (fact.kind === "critRating" && fact.layer === "increased") return { kind: "localCrit", value: fact.value };
    if (fact.kind === "critRating" && fact.layer === "flat") return { kind: "localCritFlat", value: fact.value };
    return undefined;
  };
  const readings = local.map(one);
  if (readings.some((reading) => reading === undefined)) return undefined;
  // "Adds X - Y Elemental Damage to the gear": one write per type, merged above into one fact with every type.
  return readings.length === 1 ? { ...readings[0], recipe: { affixId: local[0].affixId } } : undefined;
}

/**
 * The build's "±X% [additional] Cooldown Recovery Speed" lines ({ source, text, value, additional }) with the recipe's reading (6007,
 * mod 3 / mod 4) where it places the line (TLI_SPEED_PATH). `classify` is src/skill-hit-lines.js classifyHitLine (passed in: this
 * module imports no text reader).
 */
export function cooldownRecoveryLines(modifierTexts = [], classify) {
  const read = speedPathMode() === "recipe" ? hitRecipeReader(modifierTexts) : null;
  const out = [];
  for (const line of modifierTexts) {
    const textParsed = classify(line.text, { targetCursed: false });
    const recipeParsed = read ? hitLineFromFacts(read(line), textParsed?.kind === "cooldownRecovery" ? textParsed : null) : undefined;
    const parsed = recipeParsed === undefined || (recipeParsed && recipeParsed.kind !== "cooldownRecovery") ? textParsed : recipeParsed;
    if (parsed?.kind !== "cooldownRecovery") continue;
    out.push({ source: line.source, text: line.text, value: parsed.value * (line.multiplier ?? 1), additional: parsed.additional, ...(parsed.recipe ? { recipe: parsed.recipe } : {}) });
  }
  return out;
}

// Which switch governs a reading: Cast / Attack Speed and Cooldown Recovery Speed follow TLI_SPEED_PATH, crit TLI_CRIT_PATH, the rest
// TLI_HIT_PATH.
const MODE_GROUP = Object.freeze({ castSpeed: "speed", attackSpeed: "speed", attackSpeedDual: "speed", cooldownRecovery: "speed", baseSpeed: "speed", localSpeed: "speed", critFlat: "crit", critPercent: "crit", critAdditional: "crit", baseCrit: "crit", localCrit: "crit", localCritFlat: "crit" });
const modeOf = (kind) => { const group = MODE_GROUP[kind] ?? "hit"; return group === "speed" ? speedPathMode() : group === "crit" ? critPathMode() : hitPathMode(); };
/**
 * The reading a model uses for one line: the recipe's (`recipeParsed`; undefined = the text stays) where the switch that governs its
 * kind is on the recipe, the text reader's (`textParsed`) otherwise. A line whose two readings fall under different switches takes the
 * recipe only when both are on the recipe.
 */
export function pickHitReading(textParsed, recipeParsed) {
  if (recipeParsed === undefined) return textParsed;
  const kinds = [textParsed?.kind, recipeParsed?.kind].filter(Boolean);
  if (!kinds.length) return recipeParsed;
  return kinds.every((kind) => modeOf(kind) === "recipe") ? recipeParsed : textParsed;
}
/** Whether any of the three switches is on the recipe (a reader worth building). */
export const anyHitRecipeMode = () => hitPathMode() === "recipe" || critPathMode() === "recipe" || speedPathMode() === "recipe";

/** Diagnostics over a list of lines (kept under `unread`, which the badge walker skips). */
export function hitRecipeSummary(modifierTexts = []) {
  const read = hitRecipeReader(modifierTexts);
  const lines = modifierTexts.map((line) => ({ line, facts: read(line) }));
  const count = (status) => lines.filter((item) => item.facts.status === status).length;
  return {
    mode: { hit: hitPathMode(), crit: critPathMode(), speed: speedPathMode() }, lines: lines.length, placed: count("placed"), none: count("none"), fallback: count("fallback"),
    unread: { fallback: lines.filter((item) => item.facts.status === "fallback" && !SYNTHETIC_ORIGINS.has(item.line.origin) && !item.line.lineEffect && item.facts.reason !== "no game template with this shape").map((item) => ({ source: item.line.source, text: item.line.text, origin: item.line.origin, reason: item.facts.reason })) }
  };
}
