// Minion lines from the game recipes (recipe interpreter step 4, user goal 2026-10-25 "everything in the calc"; research/
// recipe-interpreter-step1-2026-10-25.md §16). The same method as the Trauma (§9), Ignite (§11), DoT (§14) and hit (§15) switches: each
// modifier line is resolved to its affix recipe (src/recipe-interpreter.js) and its Minion writes are read by attribute id, bucket and
// tag id; the text reader (src/minion-damage-model.js classifyMinionLine) stays as the fallback for the lines the recipe cannot place;
// planner-made layers (Commander's Gambit, Bond, Command, Isomorphic Arms, the main-stat line …), support clauses and hero trait lines
// keep their models.
//
// Which writes are the Minions' (sourced: 357249664 "Minion Spell Damage" = attr 5719 tagged {Minion, Spell}; 9096861 routes its write to
// the Minions, node 111 targets 3):
//   - a write routed to the Minions (node 111 / an effect's own targets 3; the interpreter's target "minion"): the Minion is its bearer,
//     its tags are the Minion skill's (6000401 Enhanced Skill …), and a filter on the routing (condition 10 tag 6000330 Spirit Magus,
//     6000320 Synthetic Troop) narrows which Minions;
//   - a write on you tagged Minion (5002060): damage dealt by your Minions (the other tags narrow it: Spell, Attack …).
// What the Minion model reads from them ("Minion facts", in classifyMinionLine's shape):
//   damage 5719 / 5002 / 5107 / 5108 / 5109 / 5402 / 5727 (mod 3 increased, mod 4 additional, mod 2 added flat); Max / Min damage (mod 4);
//   crit rating 4802 (mod 1 flat, mod 3 increased, mod 4 additional) and damage 4803; Attack / Cast Speed 6001 / 6002; penetration
//   5104–5106 / 5414; armour penetration field 2006247; Multistrike chance field 2006240 and increment attr 6350 (mod 1 / mod 4); Double
//   Damage field 2006224; damage applied to Life field 2010024 (one summed field: one 1 + Σ term on Minion damage, the player's rule of
//   src/damage-to-life.js; user decision by the recipe rule, 2026-10-25).
//   Minion ailments, Affliction, Life, movement and area writes are no damage the model counts; Growth, Enhanced-skill chance, Empower
//   Skill Effect, cooldown recovery and quantities have no reader in the Minion hit model (spiritMagusState, the troop count and the
//   profiles read their own lines) and are listed, not applied. Conversions read since chunk 3 (2026-11-01).
// Whether a recipe gate holds is still the planner's condition state (the rule of §9): a conditional write counts where the text path
// counted the line, and is left out otherwise.
//
// Modes (dev-only switches back to the text readers): TLI_MINION_PATH=text (the Minion line readers, the enemy damage taken on Minion hits
// and the minion-core line values) in the environment, globalThis.TLI_MINION_PATH = "text" in a browser console, or
// setMinionPathMode("text") in a script or test.
import { affixRecipesLoaded, interpretLine, lineGameIds, loadAffixRecipes, settleRowScaled } from "./recipe-interpreter.js";
import { normalizePercentageText } from "./percentage-text.js";
import { isNamedGearAffixHeader } from "./named-gear-affixes.js";

try { await loadAffixRecipes(); } catch { /* the text paths stay */ }

// ---------------------------------------------------------------------------------------------------------------------------
// Mode.
let override = null;
export function minionPathMode() {
  const flag = override ?? globalThis.TLI_MINION_PATH ?? globalThis.process?.env?.TLI_MINION_PATH ?? null;
  if (flag === "text") return "text";
  return affixRecipesLoaded() ? "recipe" : "text";
}
/** Dev-only: "text" runs the old text readers, "recipe" the recipe path, null the default. */
export function setMinionPathMode(mode) { override = mode === "text" || mode === "recipe" ? mode : null; }

// ---------------------------------------------------------------------------------------------------------------------------
// Tags (game skill tags, AFFIX_TAG_NAMES).
const TAG = Object.freeze({ minion: 5002060, thisSkill: 5000002, hit: 5000003, dotFlow: 5000004, dot: 5100309, ailment: 5100001, elementalAilment: 5100002, ignite: 5100003, trauma: 5100006, wilt: 5100007, crit: 5001010, hitSkill: 6001060, elite: 5001990, boss: 5002000, anyMonster: 5001980, minionSkill: 6000340 });
const DOT_TAGS = new Set([TAG.dot, TAG.dotFlow, TAG.ailment, TAG.elementalAilment, TAG.ignite, TAG.trauma, TAG.wilt]);
const DUMMY_STATES = new Set([TAG.elite, TAG.boss]);
// The Minion model's skill-tag scope (src/minion-damage-model.js: "+X% additional <Tag> Damage for Minions"; reference data skill tags in
// src/minion-profiles.js).
const SKILL_SCOPE = Object.freeze({ 6001100: "Spell", 6001090: "Attack", 6000130: "Area", 6001120: "Melee", 6001110: "Projectile", 6001130: "Ranged" });
// Minion families: Spirit Magus (6000330 the summon tag, 6000342 its skills), Synthetic Troop (6000320, 6000341 its skills).
const FAMILY_SCOPE = Object.freeze({ 6000330: "spiritMagus", 6000342: "spiritMagus", 6000320: "troop", 6000341: "troop" });
// Spirit Magus skill roles: Base Skill 6000400, Enhanced Skill 6000401, Ultimate 6000403.
const ROLE_SCOPE = Object.freeze({ 6000400: "basic", 6000401: "enhanced", 6000403: "ultimate" });
const STATE = (tag) => tag >= 4000000 && tag < 5000000;
const TYPE_NAME = { physical: "Physical", fire: "Fire", cold: "Cold", lightning: "Lightning", erosion: "Erosion", elemental: "Elemental" };

const squash = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const tagList = (tags, side) => (tags && Array.isArray(tags[side]) ? tags[side] : []);
// Conditions that remain after the scope-like ones, the per-hit trigger and the dummy's Boss / Elite rank.
const remaining = (effect) => (effect.conditions || []).filter((c) => !c.scopeLike && c.kind !== "perHit" && !(c.kind === "state" && DUMMY_STATES.has(c.tag) && !c.negated));

// Concepts with a reader in the Minion hit model, and the Minion writes no damage figure takes.
const NO_DAMAGE = new Set(["movementSpeed", "maxLife", "maxEnergyShield", "armor", "evasion", "skillArea", "physique", "lifeRegenerationSpeed", "lifeRegeneration", "lifeRegenerationPercent", "damageAvoidance", "resistance", "maxResistance", "projectileSpeed", "trackingArea", "noDps", "damageLink", "restore"]);
const AILMENT_ONLY = new Set(["ailmentChance", "afflictionEffect", "afflictionPerSecond", "ailmentDamageAtApplication", "baseAilment", "ailmentDuration", "extraAilmentStacks", "deteriorationChance"]);
// Read by another Minion reader by wording (spiritMagusState: Growth, Enhanced-skill chance, Empower Skill Effect; the troop count:
// quantities; Bond: its stacks), which takes the recipe's number (recipeLineValue): not a Minion hit layer.
const OTHER_READER = new Set(["growthGain", "field:moling_qianghuajineng_shiyongjilv", "statusEffect", "maxMinions", "maxBuffStacks", "field:summon_zhixie_extra_num_per_skill"]);
const NO_READER = new Set(["addedAs", "initialMultistrikeCount", "projectileQuantity", "castMode"]);
const LUCKY_CRIT_LABEL = 3000101;

/** One interpreter effect -> { facts, relevant, none?, unplaceable?, noReader? }. */
function classifyMinionEffect(effect) {
  const concept = effect.concept;
  const tags = effect.tagIds;
  const mine = tagList(tags, "mine");
  const minionWrite = effect.target === "minion" || (effect.target === "self" && mine.includes(TAG.minion));
  if (!minionWrite) return { facts: [], relevant: false };
  const none = (why) => ({ facts: [], relevant: true, none: why });
  const unplaceable = (why) => ({ facts: [], relevant: true, unplaceable: why });
  const noReader = (why) => ({ facts: [], relevant: true, noReader: why });
  if (NO_DAMAGE.has(concept) || effect.kind === "selfDrain" || effect.kind === "copyItemToMinion") return none(`${concept}: no damage figure of the Minion model takes it`);
  if (AILMENT_ONLY.has(concept)) return none(`${concept}: Minion ailments and Affliction are not modeled`);
  if (["convert", "perStat", "perTargetStat", "share", "perEntity", "perAilmentType", "byDistance", "nextAction", "perCount"].includes(effect.kind)) return unplaceable(`${effect.kind}: scaled by a runtime value`);
  if (OTHER_READER.has(concept)) return none(`${concept}: read by its own Minion reader (Spirit Magus state, troop count, Bond), which takes the recipe's number`);
  if (effect.kind === "label" && /mian_yi/.test(String(concept))) return none(`${concept}: a Minion immunity (defence)`);
  // Label 3000101 (config_char_label bao_ji_xing_yun, "Lucky Critical Strike"; affix 311045's label) routed to the Minions: "Minions gain
  // Lucky upon a Critical Strike" (101070019: node 107 on targets [3], no trigger, no tag). The Minion model reads it as its "lucky" line,
  // the crit check rolled twice (src/minion-damage-model.js luckyCrit; chunk 11, 2026-11-01), as the text reader does. A tagged or gated
  // copy is not read here (no such record in the table).
  if (effect.kind === "label" && effect.label === LUCKY_CRIT_LABEL) {
    if (tagList(tags, "mine").some((tag) => tag !== TAG.minion) || tagList(tags, "others").length || (effect.conditions || []).length) return unplaceable("a tagged or conditional Lucky Critical Strike label");
    return { facts: [{ value: 1, conditions: [], conditional: false, affixId: effect.viaAffix ?? effect.id, kind: "lucky" }], relevant: true };
  }
  if (NO_READER.has(concept) || String(concept || "").startsWith("field:") || String(concept || "").startsWith("buff:") || effect.kind === "label" || effect.kind === "rule") return noReader(`${concept}: no reader in the Minion hit model`);
  if (effect.understood === false) return unplaceable(effect.reason || "not understood");
  if (effect.value === null || effect.value === undefined || effect.dynamic?.some((d) => d !== "scale")) return unplaceable(`runtime value (${(effect.dynamic || ["unevaluated"]).join(", ")})`);
  if (effect.layer === "derivedField" || effect.layer === "derivedLabel") return unplaceable("an encoded field / label write");
  if (effect.tagAlt) return unplaceable("alternative tag lists (any one of several tag sets)");
  if (tagList(tags, "notMine").length || tagList(tags, "notOthers").length) return unplaceable("negated tags");
  if (effect.node === "b" || (effect.triggerId && effect.triggerId !== 1000031)) return unplaceable("a timed / triggered write (stack or uptime model)");
  // Scope: the write's own tags (a Minion-routed write's tags are the Minion skill's), then the scope-like gates (condition 10 / 208 on
  // a skill tag: a family or a skill type).
  const scope = { skillTag: null, family: null, role: null };
  const take = (tag, from) => {
    if (tag === TAG.minion || tag === TAG.minionSkill || STATE(tag)) return null;
    if (tag === TAG.hit || tag === TAG.hitSkill) return null;
    if (DOT_TAGS.has(tag)) return "dot";
    if (tag === TAG.crit) return `Critical Strikes only (tag ${tag})`;
    if (tag === TAG.thisSkill) return "the supported skill's own Minions (a support's line: the support model reads it)";
    if (SKILL_SCOPE[tag]) { if (scope.skillTag && scope.skillTag !== SKILL_SCOPE[tag]) return "two skill-type tags"; scope.skillTag = SKILL_SCOPE[tag]; return null; }
    if (FAMILY_SCOPE[tag]) { scope.family = FAMILY_SCOPE[tag]; return null; }
    if (ROLE_SCOPE[tag]) { scope.role = ROLE_SCOPE[tag]; return null; }
    return `${from} tag ${tag}`;
  };
  for (const tag of mine) {
    const why = take(tag, "skill");
    if (why === "dot") return none("Minion damage over time / ailments are not modeled");
    if (why) return unplaceable(why);
  }
  for (const c of effect.conditions || []) {
    if (!c.scopeLike || c.kind === "perHit" || ["repeat", "random", "background", "targetAttitude", "targetCheck", "unitAlive"].includes(c.kind)) continue;
    const gateTag = c.kind === "skillTag" ? c.tag : c.kind === "state" ? c.gateTag : undefined;
    if (gateTag !== undefined && !c.negated) {
      const why = take(gateTag, "gate");
      if (why === "dot") return none("Minion damage over time / ailments are not modeled");
      if (why) return unplaceable(why);
      continue;
    }
    return unplaceable(`a build-settled gate (${c.text})`);
  }
  for (const tag of tagList(tags, "others")) {
    if (STATE(tag) || DUMMY_STATES.has(tag) || tag === TAG.anyMonster) continue;
    return unplaceable(`target tag ${tag}`);
  }
  const conditions = remaining(effect);
  const base = { value: effect.value, conditions: conditions.map((c) => c.text), conditional: conditions.length > 0, affixId: effect.viaAffix ?? effect.id,
    ...(scope.skillTag ? { skillTag: scope.skillTag } : {}), ...(scope.family === "spiritMagus" ? { spiritMagus: true } : scope.family === "troop" ? { troop: true } : {}), ...(scope.role ? { skillRole: scope.role } : {}) };
  // Only damage takes a skill-type or skill-role scope in the Minion model; a scoped crit, speed or other stat would reach every Minion
  // skill there.
  const scoped = Boolean(scope.skillTag || scope.role);
  const bucket = effect.bucket;
  const typeName = (type) => (type === "all" || type == null ? undefined : TYPE_NAME[type] ?? null);
  switch (concept) {
    case "damage": {
      const type = typeName(effect.type);
      if (type === null) return unplaceable(`damage type ${effect.type}`);
      if (bucket === "added") {
        if (!type || type === "Elemental" || scoped) return unplaceable("added damage without one damage type, or skill-scoped");
        return { facts: [{ ...base, kind: "added", min: effect.value, max: effect.upper ?? effect.value, type }], relevant: true };
      }
      if (bucket === "increased" || bucket === "additional") return { facts: [{ ...base, kind: bucket, ...(type ? { type } : {}) }], relevant: true };
      return unplaceable(`${bucket} damage`);
    }
    case "maxDamage": case "minDamage": {
      const type = typeName(effect.type);
      if (type === null || scoped) return unplaceable(`damage type ${effect.type} / skill-scoped`);
      return bucket === "additional" ? { facts: [{ ...base, kind: concept, ...(type ? { type } : {}) }], relevant: true } : unplaceable(`${bucket} ${concept}`);
    }
    case "critRating": {
      if (scoped) return unplaceable("a skill-scoped crit rating");
      if (bucket === "flat") return { facts: [{ ...base, kind: "critRating", flat: true, additional: false }], relevant: true };
      if (bucket === "increased" || bucket === "additional") return { facts: [{ ...base, kind: "critRating", flat: false, additional: bucket === "additional" }], relevant: true };
      return unplaceable(`${bucket} crit rating`);
    }
    case "critDamage": {
      if (scoped) return unplaceable("a skill-scoped crit damage");
      // Mod 1 adds to the 150% base (the player's rule, src/recipe-hit-layers.js), as does mod 3; mod 4 multiplies.
      if (bucket === "flat" || bucket === "increased") return { facts: [{ ...base, kind: "critDamage", additional: false }], relevant: true };
      if (bucket === "additional") return { facts: [{ ...base, kind: "critDamage", additional: true }], relevant: true };
      return unplaceable(`${bucket} crit damage`);
    }
    case "attackSpeed": case "castSpeed": {
      if (scoped) return unplaceable("a skill-scoped speed");
      if (bucket !== "increased" && bucket !== "additional") return unplaceable(`${bucket} ${concept}`);
      return { facts: [{ ...base, kind: "speed", additional: bucket === "additional", attack: concept === "attackSpeed", cast: concept === "castSpeed" }], relevant: true };
    }
    case "penetration": {
      const type = typeName(effect.type);
      if (!type || scoped) return unplaceable(`penetration of ${effect.type} / skill-scoped`);
      if (bucket !== "flat" && bucket !== "increased") return unplaceable(`${bucket} penetration`);
      return { facts: [{ ...base, kind: "penetration", types: type === "Elemental" ? ["Cold", "Fire", "Lightning"] : [type] }], relevant: true };
    }
    case "armorPenetration": return scoped ? unplaceable("skill-scoped") : { facts: [{ ...base, kind: "armourPenetration" }], relevant: true };
    case "multistrikeChance": return scoped ? unplaceable("skill-scoped") : { facts: [{ ...base, kind: "multistrikeChance" }], relevant: true };
    case "multistrikeIncrement": {
      if (scoped) return unplaceable("skill-scoped");
      if (bucket === "flat") return { facts: [{ ...base, kind: "multistrikeIncrement" }], relevant: true };
      if (bucket === "additional") return { facts: [{ ...base, kind: "multistrikeIncrementAdditional" }], relevant: true };
      return unplaceable(`${bucket} Multistrike increment`);
    }
    case "doubleDamageChance": return scoped ? unplaceable("skill-scoped") : { facts: [{ ...base, kind: "doubleDamage" }], relevant: true };
    case "damageToLife": return scoped ? unplaceable("skill-scoped") : { facts: [{ ...base, kind: "damageToLife" }], relevant: true };
    // "Converts X% of Minion Physical Damage to Fire Damage" (7573, 222541, 179998, 683248384: attrs 5113, 5112, 5111, 5403 flat, routed to the
    // Minions): the conversion attrs the hit routine reads, so the player's conversion pass on the Minion's hit (chunk 3, 2026-11-01).
    case "conversion": {
      const [from, to] = String(effect.type ?? "").split(">").map((type) => TYPE_NAME[type]);
      if (effect.kind !== "attr" || !from || !to || scoped) return noReader(`${concept}: a scoped or other conversion write`);
      return { facts: [{ ...base, kind: "conversion", from, to }], relevant: true };
    }
    // "Spirit Magi +X% Cooldown Recovery Speed" (92258: 6007 mod 3 routed to the Spirit Magi), "+X% Spirit Magus Ultimate Cooldown Recovery
    // Speed" (on the Ultimate tag): their skills' cooldowns shorten. A skill-role scope is read; a skill-type scope is not.
    case "cooldownRecoverySpeed": {
      if (scope.skillTag) return unplaceable("a skill-type-scoped cooldown recovery");
      if (bucket !== "increased" && bucket !== "additional") return unplaceable(`${bucket} cooldown recovery`);
      return { facts: [{ ...base, kind: "cooldownRecovery", additional: bucket === "additional" }], relevant: true };
    }
    default: return noReader(`${concept}: no reader in the Minion hit model`);
  }
}

// One write per type ("+X% Elemental and Erosion Resistance Penetration for Minions") or per speed ("Attack and Cast Speed") is one fact.
const shapeKey = (fact) => JSON.stringify([fact.kind, fact.value, fact.additional ?? null, fact.flat ?? null, fact.conditions, fact.skillTag ?? null, fact.spiritMagus ?? null, fact.troop ?? null, fact.skillRole ?? null]);
function mergeFacts(facts) {
  const out = [];
  for (const fact of facts) {
    const same = out.find((other) => shapeKey(other) === shapeKey(fact));
    if (same && fact.kind === "penetration") { same.types = [...new Set([...same.types, ...fact.types])].sort(); continue; }
    if (same && fact.kind === "speed") { same.attack ||= fact.attack; same.cast ||= fact.cast; continue; }
    if (same && (fact.kind === "increased" || fact.kind === "additional") && same.type && fact.type && same.type !== fact.type) {
      const types = new Set([...(same.types || [same.type]), fact.type]);
      same.types = [...types].sort();
      if (["Cold", "Fire", "Lightning"].every((type) => types.has(type)) && types.size === 3) { same.type = "Elemental"; delete same.types; }
      continue;
    }
    out.push(fact.kind === "penetration" ? { ...fact, types: [...fact.types].sort() } : { ...fact });
  }
  // Two or more types of one damage line that are not Elemental stay a compound the model reads as one type: the text reading stays.
  return out;
}

const SYNTHETIC_ORIGINS = new Set(["derived", "follower", "buff"]);
// The text names a condition or a scaling the recipe rows do not show (code reads it): the text reading stays (the rule of §9).
const CONDITION_OR_SCALING = /\b(?:when|while|if|after|during|recently|against|for each|for every|per (?!second)|stacks? up to|stacking up to|in the last|within)\b/i;

function resolveMinionLine(text, line) {
  const resolved = interpretLine(text, { multiplier: 1, origin: line.origin, line });
  return resolved?.templateMismatch ? resolved.templateMismatch.wording : resolved;
}

const cache = new Map();
/**
 * The recipe's Minion facts of one modifier line (values per rank: callers scale by `line.multiplier`, as they do the text readings).
 * @returns {{ status: "placed"|"none"|"fallback", reason: string|null, affixId: number|null, resolvedBy: string|null, facts: object[], noReader: string[] }}
 */
export function recipeMinionFacts(line) {
  const text = squash(line?.text);
  const game = lineGameIds(line);
  const key = `${line.origin}|${line.lineEffect ? "derived|" : ""}${text}|${game ? `${game.how}:${game.key}` : ""}`;
  if (cache.has(key)) return cache.get(key);
  const result = (() => {
    const fallback = (reason, extra = {}) => ({ status: "fallback", reason, facts: [], noReader: [], ...extra });
    if (!affixRecipesLoaded()) return fallback("no recipe table");
    if (SYNTHETIC_ORIGINS.has(line.origin) || line.lineEffect) return fallback("planner-made line (no game affix)");
    if (line.origin === "trait") return fallback("hero trait line (the hero trait models apply its condition and uptime)");
    if (line.origin === "support") return fallback("support clause (the support model reads it)");
    const resolved = resolveMinionLine(text, line);
    if (!resolved) return fallback("no game template with this shape");
    const recordIds = ["exact", "id"].includes(resolved.resolvedBy) || (resolved.gameIds?.exact && !resolved.gameIds.unbound && resolved.gameIds.ids?.includes(resolved.chosen.id)) ? new Set(resolved.gameIds?.ids ?? [resolved.chosen.id]) : null;
    const candidates = recordIds ? resolved.candidates.filter((candidate) => recordIds.has(candidate.id) || candidate === resolved.chosen) : resolved.candidates;
    const placements = candidates.map((candidate) => {
      const effects = candidate.result.effects.filter((e) => !e.conditions.some((c) => c.noDps || c.notOnDummy));
      const parts = effects.map((effect) => settleRowScaled(effect, classifyMinionEffect(effect), "facts"));
      const relevant = parts.filter((part) => part.relevant);
      const facts = mergeFacts(relevant.flatMap((part) => part.facts));
      const signature = JSON.stringify(facts.map((f) => ({ ...f, affixId: undefined })));
      return { id: candidate.id, blocked: relevant.find((part) => part.unplaceable)?.unplaceable ?? null, facts, none: relevant.filter((part) => part.none).map((part) => part.none), noReader: relevant.filter((part) => part.noReader).map((part) => part.noReader), minionWrites: relevant.length, signature };
    });
    const chosen = placements.find((placement) => placement.id === resolved.chosen.id) || placements[0];
    const base = { affixId: chosen.id, resolvedBy: resolved.resolvedBy, noReader: [...new Set(chosen.noReader)] };
    if (!resolved.chosen.result.effects.length) return fallback("the recipe has no effect rows for this line (code rule)", base);
    if (new Set(placements.map((p) => `${p.blocked ?? ""}|${p.signature}`)).size > 1) return fallback(`same-text templates place it differently (${placements.map((p) => p.id).join(", ")})`, base);
    if (chosen.blocked) return fallback(chosen.blocked, base);
    if (chosen.facts.some((fact) => fact.types && fact.kind !== "penetration")) return fallback("a damage line of several types (not Elemental) the Minion model reads as one type", base);
    if (!chosen.facts.length) return { ...base, status: "none", reason: !chosen.minionWrites ? "no Minion write (your own line)" : [...new Set([...chosen.none, ...chosen.noReader])].join("; "), facts: [] };
    if (CONDITION_OR_SCALING.test(text) && !chosen.facts.some((fact) => fact.conditional)) return fallback("the text names a condition or scaling the recipe rows do not show (code)", base);
    return { ...base, status: "placed", reason: null, facts: chosen.facts };
  })();
  if (cache.size > 20000) cache.clear();
  cache.set(key, result);
  return result;
}

// ---------------------------------------------------------------------------------------------------------------------------
/** A comparable signature of one Minion reading (text or recipe; scripts and tests). */
export function minionSignature(parsed) {
  if (!parsed) return null;
  const out = { kind: parsed.kind };
  if (parsed.kind === "added") Object.assign(out, { min: parsed.min, max: parsed.max, type: parsed.type });
  else out.value = parsed.value;
  if (parsed.type && parsed.kind !== "added") out.type = parsed.type;
  if (parsed.types) out.types = [...parsed.types].sort();
  for (const key of ["skillTag", "skillRole"]) if (parsed[key]) out[key] = parsed[key];
  for (const key of ["spiritMagus", "troop"]) if (parsed[key]) out[key] = true;
  if (parsed.kind === "critRating") { out.flat = Boolean(parsed.flat); out.additional = Boolean(parsed.additional); }
  if (parsed.kind === "critDamage") out.additional = Boolean(parsed.additional);
  if (parsed.kind === "speed") Object.assign(out, { additional: Boolean(parsed.additional), attack: Boolean(parsed.attack), cast: Boolean(parsed.cast) });
  if (parsed.kind === "cooldownRecovery") out.additional = Boolean(parsed.additional);
  if (parsed.kind === "conversion") Object.assign(out, { from: parsed.from, to: parsed.to });
  return JSON.stringify(out);
}

/** The lines the planner resolved into a derived line (`derivedFrom`, src/line-effects.js), for minionLineReading's `resolvedInto`. */
export const resolvedIntoSet = (modifierTexts = []) => new Set(modifierTexts.filter((line) => line?.derivedFrom).map((line) => `${line.source}|${squash(line.derivedFrom)}`));

/**
 * The Minion model's reading of one build line: the recipe's facts (TLI_MINION_PATH, where placed) or the text reader's one reading.
 * `textParsed` is classifyMinionLine's reading of the same line (null or one object); `resolvedInto` the lines the planner resolved into
 * a derived line (their text reading stays, the derived line carries them).
 * @returns {{ parsed: object[], from: "recipe"|"text", facts: object, agree: boolean|null }}
 */
export function minionLineReading(line, textParsed, { resolvedInto = null } = {}) {
  const textList = textParsed ? [textParsed] : [];
  if (minionPathMode() !== "recipe") return { parsed: textList, from: "text", facts: null, agree: null };
  const facts = recipeMinionFacts(line);
  if (facts.status === "fallback") return { parsed: textList, from: "text", facts, agree: null };
  if (resolvedInto?.has(`${line.source}|${squash(line.text)}`)) return { parsed: textList, from: "text", facts: { ...facts, status: "fallback", reason: "resolved into a derived line (src/line-effects.js)" }, agree: null };
  // A conditional write counts only where the text reading counted the line.
  const parsed = facts.status === "placed" ? facts.facts.filter((fact) => !fact.conditional || textParsed).map(({ conditions, conditional, affixId, ...rest }) => ({ ...rest, recipe: { affixId, ...(conditions.length ? { conditions } : {}) } })) : [];
  const recipeSig = parsed.map(minionSignature).sort().join("; ");
  const textSig = textList.map(minionSignature).sort().join("; ");
  return { parsed, from: "recipe", facts, agree: recipeSig === textSig, textSignature: textSig, recipeSignature: recipeSig };
}

/** Diagnostics over a list of lines (kept under `unread`, which the badge walker skips): placed / none / fallback and the differences. */
export function minionRecipeSummary(modifierTexts = [], classify = () => null) {
  const rows = [];
  for (const line of modifierTexts) {
    const textParsed = classify(line.text);
    const facts = recipeMinionFacts(line);
    if (facts.status === "none" && !textParsed && /no Minion write/.test(facts.reason || "")) continue;
    if (facts.status === "fallback" && !textParsed && !/\bMinions?\b|Spirit Mag|Synthetic Troop/i.test(String(line.text))) continue;
    const reading = minionLineReading(line, textParsed);
    rows.push({ source: line.source, origin: line.origin, text: line.text, status: facts.status, reason: facts.reason, affixId: facts.affixId ?? null, from: reading.from, agree: reading.agree, text_: reading.textSignature ?? null, recipe: reading.recipeSignature ?? null, noReader: facts.noReader || [] });
  }
  const count = (filter) => rows.filter(filter).length;
  return { mode: minionPathMode(), lines: rows.length, placed: count((row) => row.status === "placed"), none: count((row) => row.status === "none"), fallback: count((row) => row.status === "fallback"), agree: count((row) => row.agree === true), differ: count((row) => row.agree === false),
    unread: { differences: rows.filter((row) => row.agree === false), fallback: rows.filter((row) => row.status === "fallback" && !SYNTHETIC_ORIGINS.has(row.origin) && row.reason !== "no game template with this shape"), noReader: rows.filter((row) => row.noReader.length) } };
}

/**
 * An item's line on the Minions (Isomorphic Arms' main-hand weapon, game node 358 "Minions gain the bonuses of the item in slot N";
 * Comradeship's belt by analogy): the line's own writes on you become the Minions' (the Minion is the bearer); its local item stats
 * (nodes 363 / 364: the weapon damage the core passes on separately, base speed and crit it does not pass on) and its Minion writes
 * stay out. Same result shape as recipeMinionFacts; `fallback` when the recipe cannot place it.
 */
export function recipeMinionFactsAsBearer(text) {
  if (minionPathMode() !== "recipe" || !affixRecipesLoaded()) return { status: "fallback", reason: "text mode", facts: [], noReader: [] };
  const key = `bearer|${squash(text)}`;
  if (cache.has(key)) return cache.get(key);
  const result = (() => {
    const fallback = (reason) => ({ status: "fallback", reason, facts: [], noReader: [] });
    // A named gear affix header ("Law of Trinity") is a name on the item as on you (src/named-gear-affixes.js; the rule interpretLine
    // applies to planner lines, research/affix-recipe-rebuild-2026-11-20.md): its record is not read here either.
    if (isNamedGearAffixHeader(squash(text))) return fallback("a named gear affix header: its effect lines carry its record");
    const resolved = interpretLine(squash(text), { multiplier: 1, origin: "gear" });
    if (!resolved) return fallback("no game template with this shape");
    if (resolved.ambiguous) return fallback("same-text templates write differently");
    const effects = resolved.chosen.result.effects.filter((e) => !e.local && !e.conditions.some((c) => c.noDps || c.notOnDummy) && e.target === "self" && !tagList(e.tagIds, "mine").includes(TAG.minion)).map((e) => ({ ...e, target: "minion" }));
    if (!resolved.chosen.result.effects.length) return fallback("the recipe has no effect rows for this line (code rule)");
    const parts = effects.map(classifyMinionEffect).filter((part) => part.relevant);
    const blocked = parts.find((part) => part.unplaceable)?.unplaceable;
    if (blocked) return fallback(blocked);
    const facts = mergeFacts(parts.flatMap((part) => part.facts)).filter((fact) => !fact.conditional);
    if (facts.some((fact) => fact.types && fact.kind !== "penetration")) return fallback("a damage line of several types (not Elemental)");
    if (CONDITION_OR_SCALING.test(text) && !parts.some((part) => part.facts.some((fact) => fact.conditional))) return fallback("the text names a condition or scaling the recipe rows do not show (code)");
    return { status: facts.length ? "placed" : "none", reason: facts.length ? null : "no write the Minion model reads", affixId: resolved.chosen.id, facts, noReader: parts.filter((part) => part.noReader).map((part) => part.noReader) };
  })();
  cache.set(key, result);
  return result;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Line values for the minion-core readers (src/minion-cores.js) and the Spirit Magus state (src/minion-damage-model.js
// spiritMagusState): a reader that knows a line's meaning by its wording takes the number from the recipe's write when the recipe
// places one write of the expected concept (and bucket); otherwise the text's number stays.
/**
 * @param {object} line { origin, source, text }
 * @param {number} textValue the number the text reader read (per rank)
 * @param {{ concept: string, bucket?: string, target?: "minion"|"self"|"any" }} expect `bucket`: the bucket the text's wording names
 *   ("additional" / "increased" / "flat"): the recipe's own bucket is returned, and `bucketDiffers` flags a mismatch.
 * @returns {{ value: number, from: "recipe"|"text", bucket?: string, affixId?: number, differs?: boolean, bucketDiffers?: boolean, reason?: string }}
 */
export function recipeLineValue(line, textValue, expect) {
  const text = { value: textValue, from: "text", ...(expect.bucket ? { bucket: expect.bucket } : {}) };
  if (minionPathMode() !== "recipe" || !affixRecipesLoaded() || !line || SYNTHETIC_ORIGINS.has(line.origin) || line.lineEffect || line.origin === "trait") return text;
  const resolved = resolveMinionLine(squash(line.text), line);
  if (!resolved || resolved.ambiguous) return { ...text, reason: resolved ? "same-text templates write differently" : "no game template" };
  const writes = resolved.chosen.result.effects.filter((e) => e.concept === expect.concept && !e.conditions.some((c) => c.notOnDummy) && (!expect.target || expect.target === "any" || e.target === expect.target || (expect.target === "minion" && tagList(e.tagIds, "mine").includes(TAG.minion))));
  const shapes = [...new Set(writes.map((e) => `${e.value}|${e.bucket}`))];
  if (shapes.length !== 1 || writes[0].value === null || writes[0].value === undefined || writes.some((e) => e.dynamic?.some((d) => d !== "scale"))) return { ...text, reason: writes.length ? "runtime or several values" : `no ${expect.concept} write` };
  const { value, bucket } = writes[0];
  return { value, from: "recipe", bucket, affixId: resolved.chosen.id, differs: Math.abs(value - textValue) > 1e-9, ...(expect.bucket ? { bucketDiffers: bucket !== expect.bucket } : {}) };
}
