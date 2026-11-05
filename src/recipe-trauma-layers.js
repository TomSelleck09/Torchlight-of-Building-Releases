// Trauma damage path from the game recipes (recipe interpreter step 2, user-approved 2026-10-25;
// research/recipe-interpreter-step1-2026-10-25.md §9). Each modifier line is resolved to its affix recipe (src/recipe-interpreter.js,
// src/data/game/affix-recipes.generated.js) and its writes are placed in the Trauma layers by attribute, bucket and tag id, the
// panel's Trauma DPS rule (sourced, calc-data-review §2.2): X / E of attributes 5002 (Physical) and 5719 (all damage) whose tags are
// among DoT 5100309, Ailment 5100001 and Trauma 5100006 (or none); 3604 at application; 5821 the base; field 2006510 the chance;
// 3601 duration; 3440 the limit; node 343 extra stacks; 5003 / 5720 / 5813 on the enemy the damage taken; 5724 Affliction effect;
// 6008 / 6009 Reaping Duration / Recovery Speed; the Instant Smash crit-damage conversion (from 4803) and the chance conversion
// (from field 2006510); the recent-crit timed buff (trigger on a crit, node 306 count and duration).
//
// The text readers stay as the fallback for lines the interpreter cannot place: no game template (planner-made support texts,
// granted-core brackets), synthetic lines (derived, follower, buff), same-text templates whose Trauma writes differ, writes scaled
// by a runtime value (Blur Rating, channeled stacks, target Life …) and lines a model owns (core talents, the "damage applied to
// Life" field sum). Model entries of the shared ledger (Auras, supports, Blur, Tide, Aim, Blessings, Intelligence, skill level,
// curses …) are not lines and stay as they are.
//
// Whether a recipe gate holds (target Cursed, Blur active, Full Life …) is still the planner's condition state: a conditional write
// counts when the text path counted the line (its condition held there) and is left out otherwise. The dummy counts as a Boss and
// an Elite (src/dummy-target.js), so those state tags hold.
//
// Mode: "recipe" (default once the table is loaded) or "text" (the old path). Dev-only switches: TLI_TRAUMA_PATH=text in the
// environment, globalThis.TLI_TRAUMA_PATH = "text" in a browser console, or setTraumaPathMode("text") in a script or test.
//
// The classifier is shared (2026-10-25, research/recipe-interpreter-step1-2026-10-25.md §14): AILMENT_RECIPE.ignite (§11), .wilt
// and the skill-DoT / Reaping configs of src/recipe-dot-layers.js go through classifyLineWith; planAilmentRecipe / planLinesWith,
// ailmentInputs and rewriteTraumaShared serve every ailment and skill DoT.
import { affixRecipesLoaded, interpretLine, lineGameIds, loadAffixRecipes, settleRowScaled } from "./recipe-interpreter.js";
import { collectAilmentDuration, collectAilmentTypedSources, collectDamagingAilmentChance, CHANCE_TO_DAMAGE } from "./ailment-model.js";
import { collectReapingModifiers } from "./reaping-model.js";
import { normalizePercentageText } from "./percentage-text.js";
import { collectNormalizedGearModifiers, aggregateSlateEffects } from "./engine.js";
import { parseTalentEffects } from "./candidate-sources.js";
import { parseKismetEffect } from "./kismet-effects.js";
import { nativePactspiritNodeEffect, pactDestinyValue } from "./pactspirit-levels.js";
import { modeledCoreTalents } from "./core-talent-model.js";

let modeOverride = null;
/** Dev-only: "text" runs the old text-reader Trauma path, "recipe" the recipe path, null the default. */
export function setTraumaPathMode(mode) { modeOverride = mode === "text" || mode === "recipe" ? mode : null; }
export function traumaPathMode() {
  const flag = modeOverride ?? globalThis.TLI_TRAUMA_PATH ?? globalThis.process?.env?.TLI_TRAUMA_PATH ?? null;
  if (flag === "text") return "text";
  return affixRecipesLoaded() ? "recipe" : "text";
}

// Load the table before first use (about 1.2 MB; the module that reads it is imported by src/planner.js). Without it the text
// path runs.
try { await loadAffixRecipes(); } catch { /* the text path stays */ }

const TAG = Object.freeze({ thisSkill: 5000002, hit: 5000003, dotFlow: 5000004, dot: 5100309, ailment: 5100001, elementalAilment: 5100002, ignite: 5100003, trauma: 5100006, wilt: 5100007, crit: 5001010, minion: 5002060, elite: 5001990, boss: 5002000 });
// Per ailment: the tags a damage write may carry to reach it (the panel rows' tag filter: DoT / Ailment / the ailment's state, plus
// Elemental Ailment for Ignite, and "this skill", the inflicting skill), the other ailments' tags, the damage-type attributes of its
// pool (Trauma DPS 160000: 5002 + 5719; Ignite DPS: 5107 + 5719 + 5727, calc-data-review §2.2) and the types of enemy damage taken.
// Wilt (2026-10-25, recipe step 2 for Wilt; research/recipe-interpreter-step1-2026-10-25.md §14): the panel's Wilt DPS row 160003,
// `[A5402X#5100309|5100001|5100007] + [A5719X#…] − 1`, × `[A5402E#…] × [A5719E#…]`, × Erosion penetration (5414) (sourced, calc-data-
// review §2.2). `resistType`: the damage type whose enemy resistance and penetration the ailment meets (none for Trauma).
export const AILMENT_RECIPE = Object.freeze({
  trauma: Object.freeze({ key: "trauma", name: "Trauma", tag: TAG.trauma, reach: new Set([TAG.dot, TAG.ailment, TAG.trauma, TAG.thisSkill]), others: new Set([TAG.ignite, TAG.wilt, TAG.elementalAilment]), damageTypes: new Set(["all", "physical"]), typedTypes: new Set(["physical"]), takenTypes: new Set(["physical", "all", "dot"]), resisted: false, resistType: null }),
  ignite: Object.freeze({ key: "ignite", name: "Ignite", tag: TAG.ignite, reach: new Set([TAG.dot, TAG.ailment, TAG.elementalAilment, TAG.ignite, TAG.thisSkill]), others: new Set([TAG.trauma, TAG.wilt]), damageTypes: new Set(["all", "fire", "elemental"]), typedTypes: new Set(["fire", "elemental"]), takenTypes: new Set(["fire", "elemental", "all", "dot"]), resisted: true, resistType: "fire" }),
  wilt: Object.freeze({ key: "wilt", name: "Wilt", tag: TAG.wilt, reach: new Set([TAG.dot, TAG.ailment, TAG.wilt, TAG.thisSkill]), others: new Set([TAG.ignite, TAG.trauma, TAG.elementalAilment]), damageTypes: new Set(["all", "erosion"]), typedTypes: new Set(["erosion"]), takenTypes: new Set(["erosion", "all", "dot"]), resisted: true, resistType: "erosion" })
});
// Concepts and effect kinds that only an ailment has (a skill's own DoT has no base, chance, duration, limit or extra stacks here).
const AILMENT_ONLY_CONCEPTS = new Set(["baseAilment", "ailmentChance", "ailmentDuration", "activeStackLimit", "extraIgniteLayers", "baseAilmentFromFlat", "extraAilmentStacks"]);
const IGNITED = 4000130, MAX_AFFLICTION = 4000900;
const DUMMY_STATES = new Set([TAG.elite, TAG.boss]); // the training dummy is a Boss, so also an Elite (src/dummy-target.js)
const SKILL_TAG = (tag) => tag >= 6000000 && tag < 7000000;
const RELEVANT_CONCEPTS = new Set(["damage", "ailmentDamageAtApplication", "damageTaken", "baseAilment", "afflictionEffect", "reapingDuration", "reapingRecoverySpeed", "ailmentDuration", "activeStackLimit", "ailmentChance", "damageEnhancement", "extraAilmentStacks", "baseAilmentFromFlat", "damageToLife", "extraIgniteLayers", "penetration", "resistance"]);

const squash = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const tagList = (tags, side) => (tags && Array.isArray(tags[side]) ? tags[side] : []);

// ---------------------------------------------------------------------------------------------------------------------------
// Recipe side: one interpreter effect -> ailment layer entries.

// Conditions that remain after the scope-like ones, the dummy's Boss / Elite state and the parts a recognised pattern consumes.
function remainingConditions(effect, consumed = () => false) {
  return (effect.conditions || []).filter((c) => !c.scopeLike && c.kind !== "perHit" && !consumed(c)
    && !(c.kind === "state" && DUMMY_STATES.has(c.tag) && !c.negated));
}
const probabilityOf = (effect) => { const gate = (effect.conditions || []).find((c) => c.kind === "probability"); const m = gate?.text?.match(/^([\d.]+)% chance$/); return m ? Number(m[1]) : null; };

// Where a damage write lands (5719 / 5002 / 5107 / 5727 / 3604): { reach: false, why } or { reach: true, typed, mainSkill, crit, skillTags }.
function damageReach(effect, tags, cfg, { atApplication = false } = {}) {
  if (effect.tagAlt) return { unplaceable: "alternative tag lists (any one of several tag sets)" };
  if (tagList(tags, "notMine").length || tagList(tags, "notOthers").length) return { unplaceable: "negated tags" };
  if (effect.target === "minion") return { reach: false, why: "Minions only" };
  if (effect.target === "ally") return { reach: false, why: "written on allies" };
  if (effect.target === "enemy") return { reach: false, why: "written on enemies" };
  const mine = tagList(tags, "mine");
  const skillTags = [];
  const ownSkillTags = [];
  let crit = false;
  for (const tag of mine) {
    if (cfg.reach.has(tag)) continue;
    if (atApplication && tag === TAG.crit) { crit = true; continue; }
    if (atApplication && SKILL_TAG(tag)) { skillTags.push(tag); continue; }
    if (cfg.others.has(tag)) return { reach: false, why: cfg.skillDot ? "ailments only" : "another ailment only" };
    if (tag === TAG.hit) return { reach: false, why: "hit damage only" };
    if (tag === TAG.minion) return { reach: false, why: "Minions only" };
    if (tag === TAG.crit) return { reach: false, why: `Critical Strikes only (${cfg.name} never crits)` };
    // A skill's own DoT (src/recipe-dot-layers.js skillDotRecipeConfig): a skill-type tag the DoT takes (Spell, Channeled, Terra: user-confirmed
    // 2026-10-11 / user decisions 2026-10-25, 2026-10-31) reaches it when the skill has it. Which skill tags a DoT event carries is code (the
    // recipe writes Area and Spell the same way), so the user-confirmed rules decide: Area never reaches it.
    if (cfg.skillDot && SKILL_TAG(tag)) {
      if (cfg.ownSkillTags.has(tag)) { ownSkillTags.push(tag); continue; }
      return { reach: false, why: cfg.skillTags.has(tag) ? `skill-type tag ${tag}: the skill's hits only (no user-confirmed rule lets it reach the skill's own damage over time; Area never does)` : `skill-type tag ${tag}: the skill does not have it` };
    }
    // A skill-type tag on a 5719 / 5002 write scopes the hit event: when the game wants such a bonus on ailments too it adds a separate
    // 3604 write with the skill tag and the ailment (144600752 "Channeled Skill Damage and Ailment Damage dealt by Channeled Skills",
    // 9590149 / 988982784 "Attack Damage and Ailment Damage dealt by attacks", 280099 / 921994 Spirit Magus), as the user-confirmed
    // Spell and Area rules (2026-10-11), Bard's 311410880 row 2 and the Channeled decision (2026-10-25) read.
    if (SKILL_TAG(tag)) return { reach: false, why: "skill-type tag on the damage write: the skill's own damage only (the game adds a separate 3604 write when such a bonus reaches ailments)" };
    return { unplaceable: `tag ${tag} on the write` };
  }
  // "others" tags on a dealt-damage write are target states (Cursed, Traumatized; conditions the interpreter lists), the dummy's
  // Boss / Elite rank, or 5001980 (any monster). Anything else narrows the target in a way this reader does not decide.
  const otherTag = tagList(tags, "others").find((tag) => !(tag >= 4000000 && tag < 5000000) && !DUMMY_STATES.has(tag) && tag !== 5001980);
  if (otherTag) return { unplaceable: `target tag ${otherTag}` };
  return { reach: true, typed: cfg.typedTypes.has(effect.type) || (cfg.tag != null && mine.includes(cfg.tag)) || ownSkillTags.length > 0, mainSkill: mine.includes(TAG.thisSkill), crit, skillTags, ownSkillTags };
}

/**
 * Ailment layer entries for one interpreter effect (`cfg`: AILMENT_RECIPE.trauma / .ignite).
 * @returns {{ entries: object[], relevant: boolean, unplaceable?: string, none?: string }}
 */
function classifyEffect(effect, all, cfg = AILMENT_RECIPE.trauma) {
  const concept = effect.concept;
  const out = (layer, extra = {}, consumed) => {
    const conditions = remainingConditions(effect, consumed);
    const states = conditions.filter((c) => c.kind === "state" && c.on === "target" && !c.negated).map((c) => c.tag);
    return { entries: [{ layer, value: effect.value, conditions: conditions.map((c) => c.text), conditional: conditions.length > 0, ...(states.length && states.length === conditions.length ? { targetStates: states } : {}), affixId: effect.viaAffix ?? effect.id, ...extra }], relevant: true };
  };
  const none = (why) => ({ entries: [], relevant: true, none: why });
  const unplaceable = (why) => ({ entries: [], relevant: true, unplaceable: why });
  // A skill's own DoT has no ailment base, chance, duration, limit or extra stacks.
  if (cfg.skillDot && (AILMENT_ONLY_CONCEPTS.has(concept) || ["extraStacks", "flatToBaseAilment"].includes(effect.kind))) return { entries: [], relevant: false };
  // The Reaping plan (src/recipe-dot-layers.js reapingRecipeConfig) reads Reaping Duration / Recovery Speed writes only.
  if (cfg.reapingOnly && concept !== "reapingDuration" && concept !== "reapingRecoverySpeed") return { entries: [], relevant: false };
  if (effect.target === "minion" && (RELEVANT_CONCEPTS.has(concept) || ["extraStacks", "flatToBaseAilment"].includes(effect.kind))) return none("Minions only");
  // Recognised runtime-scaled patterns first.
  if (effect.kind === "convert") {
    const from = effect.fromMeaning || {};
    const to = { concept: effect.concept, tags: effect.toTagIds };
    if (to.concept !== "damage" || effect.target !== "self") return RELEVANT_CONCEPTS.has(to.concept) ? unplaceable(`conversion from ${from.concept ?? effect.from}`) : { entries: [], relevant: false };
    const mine = tagList(to.tags, "mine");
    if (mine.some((tag) => cfg.others.has(tag) && tag !== TAG.elementalAilment)) return none("another ailment only");
    // Instant Smash (11688709): per +P1% Critical Strike Damage (total, 48031) +P2% additional Trauma Damage; its companion row
    // writes −150 Trauma-tagged crit damage, so only crit damage above the 150% base counts.
    if (from.concept === "critDamage" && effect.bucket === "additional" && mine.includes(cfg.tag)) {
      const offset = all.find((other) => other.kind === "attr" && other.concept === "critDamage" && tagList(other.tagIds, "mine").includes(cfg.tag));
      return out("perCritDamageAdditional", { per: effect.per, critDamageBase: offset ? -offset.value : 0 }, (c) => c.kind === "per");
    }
    // "For every +X% Ignite, Wilt, and Trauma Chance, +Y% … Damage respectively" (14855981): from the ailment's own chance field
    // (2006480 Ignite, 2006510 Trauma).
    if (from.concept === "ailmentChance" && from.type === cfg.key && effect.bucket === "increased" && mine.includes(cfg.tag)) return out("chanceToDamage", { per: effect.per }, (c) => c.kind === "per");
    return unplaceable(`damage scaled by a runtime value (${effect.fromConcept ?? effect.from})`);
  }
  if (effect.kind === "perStat" || effect.kind === "perTargetStat" || effect.kind === "share" || effect.kind === "perEntity" || effect.kind === "perAilmentType" || effect.kind === "byDistance" || effect.kind === "nextAction") {
    return RELEVANT_CONCEPTS.has(concept) ? unplaceable(`${effect.kind}: scaled by a runtime value`) : { entries: [], relevant: false };
  }
  if (effect.kind === "extraStacks") {
    if (effect.type !== cfg.key) return { entries: [], relevant: false };
    const chance = effect.probability ?? 100;
    return out("extraStacks", { value: (chance / 100) * (effect.value ?? 1), chancePercent: chance, stacks: effect.value ?? 1 }, (c) => c.kind === "probability");
  }
  if (effect.kind === "flatToBaseAilment") return effect.type === cfg.key ? out("flatBase", { minPercent: effect.value, maxPercent: effect.upper }) : /^ailment /.test(effect.type) ? unplaceable(`node 381 ailment type ${effect.type}`) : { entries: [], relevant: false };
  if (!RELEVANT_CONCEPTS.has(concept)) return { entries: [], relevant: false };
  // A write routed to Minions (node 111 / filter 3) never reaches the player's ailment; one on a buff's bearer is the buff model's.
  if (effect.target === "minion") return none("Minions only");
  if (effect.target === "ally") return none("written on allies");
  if (effect.target === "buffBearer") return unplaceable("written on an applied buff's bearer");
  if (effect.target === "enemy" && concept !== "damageTaken" && concept !== "resistance") return none("written on enemies");
  if (effect.understood === false) return unplaceable(effect.reason || "not understood");
  if (effect.value === null || effect.value === undefined || effect.dynamic?.some((d) => d !== "scale")) return unplaceable(`runtime value (${(effect.dynamic || ["unevaluated"]).join(", ")})`);
  if (effect.layer === "derivedField" || effect.layer === "derivedLabel") return unplaceable("an encoded field / label write");
  const tags = effect.tagIds;
  const bucket = effect.bucket;
  // A timed or event-triggered write outside the recognised patterns (damage and Reaping handle theirs below) is a stack / uptime
  // model's business.
  if ((effect.node === "b" || (effect.triggerId && effect.triggerId !== 1000031)) && !["damage", "reapingDuration", "reapingRecoverySpeed"].includes(concept)) return unplaceable("a timed / triggered write (stack or uptime model)");
  switch (concept) {
    case "damage": {
      if (!cfg.damageTypes.has(effect.type)) return none(`${effect.type} damage`);
      const reach = damageReach(effect, tags, cfg);
      if (reach.unplaceable) return unplaceable(reach.unplaceable);
      if (!reach.reach) return none(reach.why);
      // "+X% chance to deal double Trauma Damage" (971068): per-hit, with chance P1, +100% additional Trauma damage on that hit's
      // application.
      if (effect.triggerId === 1000031 && bucket === "additional" && reach.typed && effect.value === 100 && probabilityOf(effect) !== null) {
        return out("doubleChance", { value: probabilityOf(effect) }, (c) => c.kind === "probability");
      }
      // "+X% additional Trauma Damage (multiplies) for each Critical Strike dealt recently. Stacks up to N time(s)" (928891904): on
      // dealing a crit, a timed buff (node 306: count = the stack cap, duration = "recently").
      if (effect.node === "b" && effect.carrier && effect.triggerId === 1000030 && tagList(effect.triggerTags, "mine").includes(TAG.crit) && bucket === "additional" && reach.typed) {
        return out("perRecentCritAdditional", { cap: effect.carrier.count, windowSeconds: effect.carrier.duration }, (c) => c.kind === "trigger" || c.kind === "timedBuff");
      }
      if (effect.node === "b" || effect.triggerId) return unplaceable("a timed / triggered damage write (stack or uptime model)");
      if (bucket !== "increased" && bucket !== "additional") return none(`${bucket} damage (hit damage)`);
      const layer = reach.typed ? (bucket === "increased" ? "typedIncreased" : "typedAdditional") : (bucket === "increased" ? "increased" : "additional");
      return out(layer, { mainSkill: reach.mainSkill, damageType: effect.type, ...(reach.ownSkillTags?.length ? { skillTags: reach.ownSkillTags } : {}) });
    }
    case "ailmentDamageAtApplication": {
      if (cfg.skillDot) return none("ailment damage at application (ailments only)");
      const mine = tagList(tags, "mine");
      if (!mine.some((tag) => tag === cfg.tag || tag === TAG.ailment || (cfg.key === "ignite" && tag === TAG.elementalAilment)) && mine.some((tag) => cfg.others.has(tag) || tag === TAG.ignite || tag === TAG.trauma || tag === TAG.wilt)) return none("another ailment only");
      const reach = damageReach(effect, tags, cfg, { atApplication: true });
      if (reach.unplaceable) return unplaceable(reach.unplaceable);
      if (!reach.reach) return none(reach.why);
      if (reach.skillTags.length) return unplaceable("needs the inflicting skill's tag (per-applier gate in src/ailment-applications.js)");
      if (reach.crit) return bucket === "additional" ? out("critOnlyAdditional") : unplaceable("crit-only increased ailment damage");
      if (bucket !== "increased" && bucket !== "additional") return unplaceable(`${bucket} ailment damage at application`);
      const layer = reach.typed ? (bucket === "increased" ? "typedIncreased" : "typedAdditional") : (bucket === "increased" ? "increased" : "additional");
      return out(layer, { mainSkill: reach.mainSkill, atApplication: true });
    }
    case "damageTaken": {
      if (effect.target !== "enemy") return none("damage taken by you (defensive)");
      if (!cfg.takenTypes.has(effect.type)) return none(`${effect.type} damage taken`);
      const flow = [...tagList(tags, "mine"), ...tagList(tags, "others")];
      if (flow.some((tag) => tag === TAG.hit)) return none("hit damage taken only");
      // "Ailment Damage taken" never reaches a skill's own DoT.
      if (cfg.skillDot && flow.some((tag) => tag === TAG.ailment || cfg.others.has(tag))) return none("ailment damage taken only");
      if (flow.some((tag) => ![TAG.dot, TAG.dotFlow, ...(cfg.skillDot ? [] : [TAG.ailment, cfg.tag]), ...(cfg.key === "ignite" ? [TAG.elementalAilment] : [])].includes(tag) && !(tag >= 4000000 && tag < 5000000))) return unplaceable("damage taken with other tags");
      if (bucket !== "additional") return unplaceable(`${bucket} damage taken`);
      return out(cfg.typedTypes.has(effect.type) || (cfg.tag != null && flow.includes(cfg.tag)) ? "typedTaken" : "taken");
    }
    case "baseAilment": {
      if (effect.type !== cfg.key) return none(`base ${effect.type} damage`);
      // "Adds X - Y Base Ailment Damage to Minions" (817560): the write sits on you, tagged Minion, and reaches your Minions' ailments only.
      if (tagList(tags, "mine").includes(TAG.minion)) return none("base ailment damage of your Minions");
      if (bucket === "added") return out("base", { min: effect.value, max: effect.upper ?? effect.value });
      if (bucket === "flat") return out("base", { min: effect.value, max: effect.value });
      if (bucket === "additional") return out("baseAdditional");
      return unplaceable(`${bucket} base ${cfg.key} damage`);
    }
    case "ailmentChance": {
      if (effect.type !== cfg.key) return none(`${effect.type} chance`);
      // A chance write scoped to some applications is not build-wide (2026-10-27): the Attack tag 6001090 (101080109 / 200000027 "+X%
      // chance for Attacks to inflict Damaging Ailments") joins each Attack Skill's own chance in src/ailment-applications.js
      // (attackAilmentChanceLines), never the build-wide chance a Spell's ailments read; the crit tag 5001010 (101080205) joins each
      // skill's own chance × its crit chance there too (critAilmentChanceLines, wiring audit gap 3, 2026-11-03).
      const scope = tagList(tags, "mine").find((tag) => SKILL_TAG(tag) || tag === TAG.crit);
      if (scope) return unplaceable(SKILL_TAG(scope) ? "needs the inflicting skill's tag (per-applier gate in src/ailment-applications.js)" : "chance on Critical Strikes only (no per-crit chance reader)");
      // "+X% Ignite Chance against enemies that haven't been Ignited" (2214789): the chance field gated on the target NOT being Ignited.
      if (cfg.key === "ignite" && (effect.conditions || []).some((c) => c.kind === "state" && c.tag === IGNITED && c.negated)) return out("notIgnitedChance", {}, (c) => c.kind === "state" && c.tag === IGNITED && c.negated);
      // Every "chance to inflict Damaging Ailments" affix writes the three damaging-ailment chance fields; an ailment-only line writes
      // its own field alone. The two are listed apart, as the text readers list them (typed chance first).
      const generic = all.some((other) => other.concept === "ailmentChance" && other.type !== cfg.key && ["ignite", "trauma", "wilt"].includes(other.type));
      return out(generic ? "ailmentChance" : `${cfg.key}Chance`);
    }
    case "extraIgniteLayers": return cfg.key === "ignite" && bucket === "field" ? out("extraStacks", { stacks: effect.value, chancePercent: 100 }) : { entries: [], relevant: false };
    case "ailmentDuration": {
      const mine = tagList(tags, "mine");
      if (mine.some((tag) => cfg.others.has(tag) && tag !== TAG.elementalAilment) && !mine.includes(cfg.tag) && !mine.includes(TAG.ailment)) return none("another ailment's duration");
      if (cfg.key !== "ignite" && mine.includes(TAG.elementalAilment) && !mine.includes(TAG.ailment)) return none("another ailment's duration");
      if (bucket === "increased") return out(mine.includes(cfg.tag) ? `${cfg.key}Duration` : "ailmentDuration");
      if (bucket === "additional") return out("additionalDuration");
      return unplaceable(`${bucket} ailment duration`);
    }
    case "activeStackLimit": return tagList(tags, "mine").includes(cfg.tag) && bucket === "flat" ? out("stackLimit") : { entries: [], relevant: false };
    // Field 2006249 (node 108): every copy adds into the one field, so all copies are one multiplier, 1 + Σ (the gear total the
    // text path reads is that sum too).
    case "damageEnhancement": return tagList(tags, "mine").includes(TAG.ailment) ? (cfg.skillDot ? none("Ailment Damage Enhancement (ailments only)") : out("ailmentEnhancement", { fieldSum: effect.field })) : unplaceable("damage enhancement without the Ailment tag");
    case "afflictionEffect": {
      if (effect.target !== "self") return none("Affliction effect on another unit");
      if (tagList(tags, "mine").length) return unplaceable("Affliction effect scoped to a skill (support model)");
      return bucket === "increased" ? out("afflictionEffect") : bucket === "additional" ? out("additionalAfflictionEffect") : unplaceable(`${bucket} Affliction effect`);
    }
    case "penetration": {
      if (!cfg.resisted) return none("no resistance against this ailment's damage type");
      if (effect.type !== cfg.resistType) return none(`${effect.type} penetration`);
      if (effect.target !== "self") return unplaceable("penetration written on another unit");
      // Ignite keeps its ledger's list name; Wilt and skill DoTs read the penetration of their own type (Erosion 5414, Cold 5106 …).
      return bucket === "flat" || bucket === "increased" ? out(cfg.key === "ignite" ? "firePenetration" : "penetration") : unplaceable(`${bucket} penetration`);
    }
    case "resistance": {
      // "-X% All Resistance when the enemy has max Affliction" (371197): enemy resistance of the DoT's type (5101 Fire, 5401 Erosion …,
      // flat) while it is at max Affliction.
      if (!cfg.resisted || effect.target !== "enemy") return effect.target === "enemy" ? none("no resistance against this ailment's damage type") : { entries: [], relevant: false };
      if (effect.type !== cfg.resistType) return none(`enemy ${effect.type} resistance`);
      if (bucket !== "flat") return unplaceable(`${bucket} enemy resistance`);
      const atMax = (effect.conditions || []).some((c) => c.kind === "state" && c.tag === MAX_AFFLICTION && !c.negated);
      return atMax ? out("maxAfflictionResistance", {}, (c) => c.kind === "state" && c.tag === MAX_AFFLICTION) : out("enemyResistance");
    }
    case "reapingDuration": {
      if (effect.node === "b" && effect.carrier && effect.triggerId === 1000032 && bucket === "increased") {
        return out("recentReapDuration", { cap: effect.carrier.count }, (c) => c.kind === "trigger" || c.kind === "timedBuff");
      }
      if (effect.node === "b" || effect.triggerId) return unplaceable("a timed Reaping Duration write");
      // "When Reaping, +X% additional Reaping Duration for each type of Damaging Ailment the enemy has" (8931637): one additional
      // (mod 4) write per damaging-ailment state on the target (Ignited, Wilted, Traumatized), grouped below into one per-type power.
      // (The Reaping plan places it; the ailment plans leave the line to their text reading, as before.)
      if (cfg.reapingOnly && bucket === "additional" && !tagList(tags, "mine").length) {
        const states = (effect.conditions || []).filter((c) => c.kind === "state" && c.on === "target" && !c.negated && AILMENT_STATES.has(c.tag));
        if (states.length === 1) { const placed = out("additionalReapingDuration", {}, (c) => c === states[0]); placed.entries[0].targetStates = [states[0].tag]; return placed; }
      }
      if (bucket !== "increased") return unplaceable(`${bucket} Reaping Duration`);
      const mine = tagList(tags, "mine");
      // The Reaping plan keeps an ailment's own Reaping Duration apart (it extends only that ailment's share of each Reap).
      if (cfg.reapingOnly) { const own = [TAG.ignite, TAG.trauma, TAG.wilt].filter((tag) => mine.includes(tag)); if (own.length === 1) return out("typedReapingDuration", { ailment: { [TAG.ignite]: "ignite", [TAG.trauma]: "trauma", [TAG.wilt]: "wilt" }[own[0]] }); if (own.length > 1) return unplaceable("Reaping Duration of several ailments"); }
      if (mine.some((tag) => tag === TAG.ignite || tag === TAG.trauma || tag === TAG.wilt) && !mine.includes(cfg.tag)) return none("another ailment's Reaping Duration");
      return out(cfg.tag != null && mine.includes(cfg.tag) ? `${cfg.key}ReapingDuration` : "reapingDuration");
    }
    case "reapingRecoverySpeed": {
      if (effect.node === "b" || effect.triggerId) return unplaceable("a timed Reaping Recovery Speed write");
      return bucket === "increased" ? out("reapingRecovery") : bucket === "additional" ? out("additionalReapingRecovery") : unplaceable(`${bucket} Reaping Recovery Speed`);
    }
    // One game field summed over every copy (src/damage-to-life.js owns it).
    case "damageToLife": return unplaceable("summed field 2010024 (src/damage-to-life.js)");
    default: return { entries: [], relevant: false };
  }
}

// "Upon inflicting damage, +X% additional Ailment Damage (multiplies) for every type of Ailment the enemy has" (379437): one write
// per ailment state on the target (Frozen, Shocked, Frostbitten, Ignited, Wilted, Traumatized, Numbed), each gated on that state, so
// the factor is (1 + X%) ^ (ailment types on the enemy). Read as one per-type entry; the type count stays the planner's
// (src/enemy-ailments.js, the same seven ailments).
const AILMENT_STATES = new Set([4000110, 4000112, 4000120, 4000121, 4000130, 4000150, 4000160]);
function perAilmentTypeEntries(entries) {
  // The same shape on Reaping Duration (8931637, Vile): one additional write per damaging-ailment state -> one per-type power.
  const layer = entries[0]?.layer === "additionalReapingDuration" ? "additionalReapingDuration" : "additional";
  const gated = entries.filter((entry) => entry.layer === layer && entry.targetStates?.length === 1 && AILMENT_STATES.has(entry.targetStates[0]));
  if (gated.length < 2 || gated.length !== entries.length || new Set(gated.map((entry) => entry.value)).size !== 1) return entries;
  return [{ layer: layer === "additional" ? "perEnemyAilmentType" : "perAilmentTypeReapingDuration", value: gated[0].value, conditions: [], conditional: false, affixId: gated[0].affixId, states: gated.map((entry) => entry.targetStates[0]) }];
}

const SYNTHETIC_ORIGINS = new Set(["derived", "follower", "buff"]);
const CONDITION_OR_SCALING = /\b(?:when|while|if|after|during|recently|against|for each|for every|per (?!second)|stacks? up to|stacking up to|in the last|within)\b/i;
// Layers whose recipe pattern carries the scaling / condition itself.
const SCALING_LAYERS = new Set(["perRecentCritAdditional", "perCritDamageAdditional", "chanceToDamage", "recentReapDuration", "perEnemyAilmentType", "extraStacks", "doubleChance", "notIgnitedChance", "maxAfflictionResistance", "perAilmentTypeReapingDuration"]);
// Lines a model owns: the core talent model reads these cores' clauses (src/core-talent-model.js); its ledger entries carry the
// core's name, not the line.
const coreName = (line) => String(line.source || "").match(/core: (.+)$/)?.[1] ?? line.grantedCore ?? null;
// Hero trait lines (origin "trait") feed the trait models (Tide, Wave Aria, Idyll …), which put their own entries in the ledger.
const modelOwned = (line) => line.origin === "core" && modeledCoreTalents.includes(coreName(line)) ? `core talent model (${coreName(line)})`
  : line.origin === "trait" ? "hero trait model" : null;

const recipeCache = new Map();
/**
 * Recipe classification of one modifier line for an ailment path ("trauma" or "ignite").
 * @returns {{ status: "placed" | "none" | "fallback", reason: string|null, affixId: number|null, resolvedBy: string|null, entries: object[], conditional: boolean }}
 */
export function classifyAilmentLine(line, ailmentKey = "trauma") {
  return classifyLineWith(line, AILMENT_RECIPE[ailmentKey]);
}
/**
 * The same classification for any DoT config: an AILMENT_RECIPE entry, or a skill's own DoT (src/recipe-dot-layers.js
 * skillDotRecipeConfig; `cfg.key` names it uniquely for the cache).
 */
export function classifyLineWith(line, cfg) {
  const ailmentKey = cfg.key;
  const text = squash(line.text);
  // The line's own game record (talent / core / trait / kismet ids, memory / prism / slate pools; §13) settles same-text templates.
  const game = lineGameIds(line);
  const key = `${ailmentKey}|${line.origin}|${line.lineEffect ? "derived|" : ""}${text}|${line.multiplier ?? 1}|${game ? `${game.how}:${game.key}` : ""}`;
  if (recipeCache.has(key)) return recipeCache.get(key);
  const result = (() => {
    if (SYNTHETIC_ORIGINS.has(line.origin) || line.lineEffect) return { status: "fallback", reason: "planner-made line (no game affix)", entries: [] };
    // Hero trait lines: the hero trait models settle their condition and uptime in code (src/hero-trait-modules.js "heroModule"
    // lines, Tide, Wave Aria …), and the recipe row often shows no gate (Dress Licker 565386 "+30% additional Fire Damage for enemies
    // within the range of Purgatory" is a plain write), so the text reading stays (2026-10-25, recipe step for DoTs, §14).
    if (line.origin === "trait") return { status: "fallback", reason: "hero trait line (the hero trait models apply its condition and uptime)", entries: [] };
    const resolved = resolveLine(text, line);
    if (!resolved) return { status: "fallback", reason: "no game template with this shape", entries: [] };
    // Every candidate template must give the same placement; otherwise the text reading stays.
    const placements = resolved.candidates.map((candidate) => {
      const effects = candidate.result.effects.filter((e) => !e.conditions.some((c) => c.noDps || c.notOnDummy));
      const parts = effects.map((effect) => settleRowScaled(effect, classifyEffect(effect, effects, cfg), "entries"));
      const relevant = parts.filter((part) => part.relevant);
      const entries = perAilmentTypeEntries(relevant.flatMap((part) => part.entries));
      // An additional Reaping Duration write outside the one-write-per-ailment-state pattern stays with the text reader.
      const blocked = relevant.find((part) => part.unplaceable) ?? (entries.some((entry) => entry.layer === "additionalReapingDuration") ? { unplaceable: "additional Reaping Duration outside the per-ailment-type pattern" } : null);
      return { id: candidate.id, blocked: blocked?.unplaceable ?? null, entries, none: relevant.filter((part) => part.none).map((part) => part.none), signature: JSON.stringify(entries.map((e) => [e.layer, e.value, e.min, e.max, e.per, e.cap, e.conditional])) };
    });
    const chosen = placements.find((placement) => placement.id === resolved.chosen.id) || placements[0];
    const base = { affixId: chosen.id, resolvedBy: resolved.resolvedBy };
    if (!resolved.chosen.result.effects.length) return { ...base, status: "fallback", reason: "the recipe has no effect rows for this line (code rule)", entries: [] };
    if (new Set(placements.map((p) => `${p.blocked ?? ""}|${p.signature}`)).size > 1) return { ...base, status: "fallback", reason: `same-text templates place it differently (${placements.map((p) => p.id).join(", ")})`, entries: [] };
    if (chosen.blocked) return { ...base, status: "fallback", reason: chosen.blocked, entries: [] };
    if (!chosen.entries.length) return { ...base, status: "none", reason: chosen.none.length ? [...new Set(chosen.none)].join("; ") : `no ${ailmentKey} write`, entries: [] };
    // The text names a condition or a scaling ("for each stack of Wilt", "while …", "Stacks up to N") that the recipe rows do not
    // show (code reads it; Chaos Abyss's per-Wilt-stack damage taken is a plain write in its recipe): the text reading stays.
    if (CONDITION_OR_SCALING.test(text) && !chosen.entries.some((entry) => entry.conditional || SCALING_LAYERS.has(entry.layer))) return { ...base, status: "fallback", reason: "the text names a condition or scaling the recipe rows do not show (code)", entries: [] };
    return { ...base, status: "placed", reason: null, entries: chosen.entries };
  })();
  const owned = result.status === "placed" && result.entries.some((entry) => SHARED_LIST[entry.layer]) ? modelOwned(line) : null;
  const final = { affixId: null, resolvedBy: null, ...result, ...(owned ? { modelOwned: owned } : {}), conditional: (result.entries || []).some((entry) => entry.conditional) };
  if (recipeCache.size > 20000) recipeCache.clear();
  recipeCache.set(key, final);
  return final;
}
/**
 * interpretLine with the line's game record (§13): the record's ids settle same-text templates. A line bound to its record although its
 * own wording matches other templates (interpretLine's `templateMismatch`: the planner text and the record disagree, e.g. a probe that
 * rewrites a node's text) keeps the reading of its wording, as the planner's other readers do (one interpretLine call; §15).
 */
export function resolveLine(text, line, { multiplier = line.multiplier ?? 1 } = {}) {
  const resolved = interpretLine(text, { multiplier, origin: line.origin, line });
  return resolved?.templateMismatch ? resolved.templateMismatch.wording : resolved;
}
/** Recipe classification of one modifier line for the Trauma path. */
export const classifyTraumaLine = (line) => classifyAilmentLine(line, "trauma");

// ---------------------------------------------------------------------------------------------------------------------------
// Text side, one line at a time: what the old readers make of the line (the same functions on a one-line list).
const TYPED_BUCKETS = ["base", "flatBase", "baseAdditional", "chance", "duration", "additionalDuration", "doubleChance", "increased", "additional", "taken", "critOnlyAdditional", "perRecentCritAdditional", "perCritDamageAdditional", "stackLimit", "reapingDuration", "extraStacks"];
const readingCache = new Map();
/** What the text readers make of one line for an ailment ("trauma", "wilt", "ignite"). */
export function textAilmentReading(line, ailmentKey = "trauma") {
  const cacheKey = `${ailmentKey}|${line.origin}|${line.source}|${line.text}|${line.multiplier ?? 1}`;
  if (readingCache.has(cacheKey)) return readingCache.get(cacheKey);
  if (readingCache.size > 20000) readingCache.clear();
  const reading = readTextAilment(line, ailmentKey);
  readingCache.set(cacheKey, reading);
  return reading;
}
export const textTraumaReading = (line) => textAilmentReading(line, "trauma");
function readTextAilment(line, ailmentKey) {
  const typed = collectAilmentTypedSources(ailmentKey, [line]);
  const chanceToDamage = String(line.text).trim().match(CHANCE_TO_DAMAGE) ? [{ source: line.source, text: line.text, per: Number(String(line.text).trim().match(CHANCE_TO_DAMAGE)[1]), value: Number(String(line.text).trim().match(CHANCE_TO_DAMAGE)[2]) * (line.multiplier ?? 1) }] : [];
  return {
    typed: Object.fromEntries(TYPED_BUCKETS.map((bucket) => [bucket, typed[bucket] || []])),
    genericChance: collectDamagingAilmentChance([line]),
    genericDuration: collectAilmentDuration([line]),
    chanceToDamage,
    reaping: collectReapingModifiers([line])
  };
}

// Per-line share of the shared ledger's aggregate entries (src/theoretical-sources.js), with the parsers that build those totals.
const gearStat = (stat, type) => (line) => line.origin === "gear" ? collectNormalizedGearModifiers([{ name: line.source, slot: "probe", modifiers: [squash(line.text)] }]).filter((item) => item.stat === stat && item.type === type).reduce((sum, item) => sum + item.value, 0) : 0;
const talentKey = (key) => (line) => line.origin === "talent" ? (Number(parseTalentEffects(squash(line.text)).effects[key]) || 0) * (line.multiplier ?? 1) : 0;
const slateKey = (key) => (line) => line.origin === "slate" ? Number(aggregateSlateEffects({ slates: [{ id: "probe", fixed: [squash(line.text)] }] })[key]) || 0 : 0;
const pactStat = (stat) => (line) => {
  if (line.origin === "kismet") { const parsed = parseKismetEffect(squash(line.text)); return parsed?.stat === stat ? parsed.value : 0; }
  if (line.origin === "pact" && line.pactDestiny) return pactDestinyValue(line, stat);
  if (line.origin === "pact" && / node$/.test(String(line.source))) { const parsed = nativePactspiritNodeEffect({ effect: squash(line.text) }); return parsed?.stat === stat ? parsed.value : 0; }
  return 0;
};
const pactLevelAdditional = (line) => line.origin === "pact" && !/ node$/.test(String(line.source)) ? Number(squash(line.text).match(/^\+([0-9.]+)% additional damage$/i)?.[1]) || 0 : 0;
const aggregateCache = new Map();
const aggregateValue = (label, read, line) => {
  const cacheKey = `${label}|${line.origin}|${line.source}|${line.text}|${line.multiplier ?? 1}`;
  if (!aggregateCache.has(cacheKey)) { if (aggregateCache.size > 50000) aggregateCache.clear(); aggregateCache.set(cacheKey, read(line)); }
  return aggregateCache.get(cacheKey);
};
const AGGREGATES = Object.freeze({
  "Talent: damage": talentKey("damagePercent"),
  "Talent: damage over time": talentKey("damageOverTimePercent"),
  "Equipment: damage": gearStat("damagePercent", "increased"),
  "Equipment: damage over time": gearStat("damageOverTimePercent", "increased"),
  "Pacts: damage": pactStat("damagePercent"),
  "Pacts: damage over time": pactStat("damageOverTimePercent"),
  "Equipment: Ailment Damage Enhancement": gearStat("ailmentDamageEnhancementPercent", "increased"),
  "Pacts: additional damage": pactLevelAdditional,
  "Kismets: additional Damage Over Time": pactStat("additionalDamageOverTimePercent")
});
const AFFLICTION_AGGREGATES = Object.freeze({
  Talents: talentKey("afflictionEffectPercent"),
  Slates: slateKey("afflictionEffectPercent"),
  Equipment: gearStat("afflictionEffectPercent", "increased"),
  Pacts: pactStat("afflictionEffectPercent")
});

// Recipe layer -> where an ailment path keeps it (calculateAilment's typed buckets); the chance, duration and Reaping Duration layers
// carry the ailment's key ("traumaChance", "wiltDuration" …).
const typedLayerMap = (key) => Object.freeze({ base: "base", flatBase: "flatBase", baseAdditional: "baseAdditional", [`${key}Chance`]: "chance", [`${key}Duration`]: "duration", additionalDuration: "additionalDuration", doubleChance: "doubleChance", typedIncreased: "increased", typedAdditional: "additional", typedTaken: "taken", critOnlyAdditional: "critOnlyAdditional", perRecentCritAdditional: "perRecentCritAdditional", perCritDamageAdditional: "perCritDamageAdditional", stackLimit: "stackLimit", [`${key}ReapingDuration`]: "reapingDuration", extraStacks: "extraStacks" });
const TYPED_LAYERS = new Map(["trauma", "wilt", "ignite", "skillDot"].map((key) => [key, typedLayerMap(key)]));
const typedLayerFor = (key) => TYPED_LAYERS.get(key) ?? typedLayerMap(key);
// "penetration": Wilt's and the skill DoTs' penetration of their own damage type (src/ailment-shared.js penetration list).
const SHARED_LIST = { increased: "increased", additional: "additional", ailmentEnhancement: "additional", taken: "taken", afflictionEffect: "afflictionEffect", additionalAfflictionEffect: "additionalAfflictionEffect", perEnemyAilmentType: "perEnemyAilmentType", penetration: "penetration" };
const REAPING_LAYER = { reapingDuration: "duration", reapingRecovery: "recovery", additionalReapingRecovery: "additionalRecovery", recentReapDuration: "recentReap" };
const SHARED_CATEGORY = { increased: "Increased damage", additional: "Additional damage", taken: "Additional damage taken", afflictionEffect: "Affliction effect", additionalAfflictionEffect: "Additional Affliction effect", perEnemyAilmentType: "Additional ailment damage per ailment type", penetration: "Penetration" };

// A recipe entry in the shape the Trauma path's lists carry (the line names the source; `recipe` keeps the affix id and conditions).
function recipeEntry(line, entry) {
  const recipe = { affixId: entry.affixId, layer: entry.layer, ...(entry.conditions.length ? { conditions: entry.conditions } : {}) };
  const scaledPercent = { source: line.source, text: line.text, recipe, ...(entry.fieldSum ? { fieldSum: entry.fieldSum } : {}), ...(entry.skillTags ? { skillTags: entry.skillTags } : {}) };
  switch (entry.layer) {
    case "base": return { ...scaledPercent, min: entry.min, max: entry.max };
    case "flatBase": return { ...scaledPercent, minPercent: entry.minPercent, maxPercent: entry.maxPercent };
    case "perCritDamageAdditional": return { ...scaledPercent, value: entry.value, per: entry.per, ...(entry.critDamageBase ? { critDamageBase: entry.critDamageBase } : {}) };
    case "perRecentCritAdditional": return { ...scaledPercent, value: entry.value, cap: entry.cap, windowSeconds: entry.windowSeconds };
    case "recentReapDuration": return { ...scaledPercent, value: entry.value, cap: entry.cap };
    case "extraStacks": return { ...scaledPercent, value: entry.value, chancePercent: entry.chancePercent, stacks: entry.stacks };
    case "chanceToDamage": return { ...scaledPercent, value: entry.value, per: entry.per };
    default: return { ...scaledPercent, value: entry.value };
  }
}

/**
 * The per-line plan: for every modifier line, its recipe classification, what the text readers make of it, and which side the
 * Trauma path uses.
 */
export function planTraumaRecipe(modifierTexts = []) {
  return planAilmentRecipe(modifierTexts, "trauma");
}
/** The same plan for any ailment of AILMENT_RECIPE ("trauma", "wilt", "ignite"). */
export function planAilmentRecipe(modifierTexts = [], ailmentKey = "trauma") {
  return planLinesWith(modifierTexts, { key: ailmentKey, classify: (line) => classifyAilmentLine(line, ailmentKey), read: (line) => textAilmentReading(line, ailmentKey) });
}
/**
 * The plan from a line classifier and a per-line text reader (src/recipe-dot-layers.js uses it for a skill's own DoT).
 * @param {{ key: string, classify: (line) => object, read: (line) => object }} p
 */
export function planLinesWith(modifierTexts = [], { key, classify, read }) {
  // A line the planner resolved into a derived line (`derivedFrom`: src/line-effects.js per-count / conditional lines, combat
  // states) is read through that derived line; the original keeps its text reading so the two are never both counted.
  const resolved = new Set(modifierTexts.filter((line) => line.derivedFrom).map((line) => `${line.source}|${squash(line.derivedFrom)}`));
  const lines = modifierTexts.map((line, index) => {
    const classified = classify(line);
    const recipe = classified.status !== "fallback" && resolved.has(`${line.source}|${squash(line.text)}`) ? { ...classified, status: "fallback", reason: "resolved into a derived line (src/line-effects.js)", entries: [] } : classified;
    const text = read(line);
    const use = recipe.status === "fallback" ? "text" : "recipe";
    return { index, line, recipe, text, use };
  });
  return { mode: "recipe", key, lines };
}

const emptyTyped = () => Object.fromEntries([...TYPED_BUCKETS, "unrecognized"].map((bucket) => [bucket, []]));
const textHasTyped = (reading) => Object.values(reading.typed).some((list) => list.length) || reading.genericChance.length || reading.genericDuration.length || reading.chanceToDamage.length;

/**
 * calculateAilment's per-line inputs (src/ailment-model.js `inputs`) from the plan: recipe entries for the lines it places, the text
 * readers' entries for the rest. A conditional recipe entry counts when the text path counted the line.
 */
export function traumaAilmentInputs(plan) {
  return ailmentInputs(plan);
}
/** The same inputs for any plan (planAilmentRecipe / planLinesWith); the typed layer names follow `plan.key`. */
export function ailmentInputs(plan) {
  const TYPED_LAYER = typedLayerFor(plan.key ?? "trauma");
  const typed = emptyTyped(), genericChance = [], genericDuration = [], chanceToDamage = [];
  for (const item of plan.lines) {
    // A model-owned line (a core the core-talent model reads) keeps the model only for its shared-ledger entries, which carry the
    // core name instead of the line; its per-line typed / chance / duration readings are replaced like any other line.
    if (item.use === "text") {
      for (const bucket of TYPED_BUCKETS) typed[bucket].push(...(item.text.typed[bucket] || []));
      genericChance.push(...item.text.genericChance); genericDuration.push(...item.text.genericDuration); chanceToDamage.push(...item.text.chanceToDamage);
      continue;
    }
    const counted = textHasTyped(item.text);
    for (const entry of item.recipe.entries) {
      if (entry.conditional && !counted) continue;
      if (TYPED_LAYER[entry.layer]) typed[TYPED_LAYER[entry.layer]].push(recipeEntry(item.line, entry));
      else if (entry.layer === "ailmentChance") genericChance.push(recipeEntry(item.line, entry));
      else if (entry.layer === "ailmentDuration") genericDuration.push(recipeEntry(item.line, entry));
      else if (entry.layer === "chanceToDamage") chanceToDamage.push(recipeEntry(item.line, entry));
    }
  }
  // The typed chance / duration lists lead (as ailmentChanceLines and calculateAilment's duration list order them).
  return { typed, genericChance, genericDuration, chanceToDamage };
}

/**
 * The shared ledger lists (src/ailment-shared.js) with every line-derived entry replaced: a per-line entry (it carries the line's
 * text) by the line's recipe entry, an aggregate ("Talent: damage", "Equipment: damage over time", "Pacts", …) by one entry per
 * line (recipe or text), and what an aggregate holds beyond its listed lines (a pact destiny node) kept as a residual entry. Model
 * entries stay. Unconditional recipe writes the text path missed are added; conditional ones count only where the text path
 * counted the line.
 * @param {object} plan planTraumaRecipe(...)
 * @param {{ increased, additional, extraTown, extraCombat, combatOutgoing, taken, afflictionEffect, additionalAfflictionEffect }} lists
 * @param {{ keepLabels?: boolean }} [options] keepLabels: a per-line entry keeps its own fields (label, category, text …) and takes the
 *   recipe's value and affix id, as the recipe-driven Ignite ledger keeps them (the Wilt and skill-DoT paths, src/recipe-dot-layers.js).
 */
export function rewriteTraumaShared(plan, rawLists, { keepLabels = false } = {}) {
  // A summed field folded upstream (the recipe-driven Ignite ledger's "Ailment Damage Enhancement (one term)") is matched line by line
  // through its parts and folded again below.
  const lists = Object.fromEntries(Object.entries(rawLists).map(([key, list]) => [key, (list || []).flatMap((entry) => entry.fieldSum && Array.isArray(entry.parts) ? entry.parts.map((part) => ({ ...entry, ...part, parts: undefined, fieldSum: entry.fieldSum })) : [entry])]));
  const claimed = new Set(); // plan line indices matched by a per-line entry
  const used = new Set(); // plan line indices whose old shared entries were found
  const emitted = new Set(); // plan line indices whose recipe entries are placed
  const residuals = [];
  const byText = new Map(), bySourceText = new Map();
  for (const item of plan.lines) {
    const key = squash(item.line.text);
    byText.set(key, [...(byText.get(key) || []), item]);
    // Entries named "<source>: <text>" without a text field (the hero memories' Affliction effect rows).
    const named = `${item.line.source}: ${key}`;
    bySourceText.set(named, [...(bySourceText.get(named) || []), item]);
  }
  const lineFor = (entry) => {
    const source = String(entry.source || "");
    if (!entry.text) {
      const match = (bySourceText.get(squash(source)) || []).find((item) => !claimed.has(item.index));
      if (match) claimed.add(match.index);
      return match || null;
    }
    const candidates = byText.get(squash(entry.text)) || [];
    const match = candidates.find((item) => !claimed.has(item.index) && (source === item.line.source || source.startsWith(`${item.line.source}: `) || source.startsWith(`${item.line.source} `) || source.includes(item.line.source)))
      ?? candidates.find((item) => !claimed.has(item.index) && candidates.length === 1);
    if (match) claimed.add(match.index);
    return match || null;
  };
  const takesRecipe = (item) => item.use === "recipe" && !item.recipe.modelOwned;
  const out = Object.fromEntries([...new Set([...Object.keys(lists), ...Object.values(KIND_LIST)])].map((key) => [key, []]));
  const deferred = [];
  // Every shared recipe entry of a line, once: those of the list being rewritten go where its old entry stood, the others to the
  // end of their own list.
  const emit = (item, listKey, next, template = null) => {
    if (emitted.has(item.index)) return;
    emitted.add(item.index);
    for (const entry of item.recipe.entries) {
      const kind = SHARED_LIST[entry.layer];
      if (!kind) continue;
      const fresh = recipeEntry(item.line, entry);
      const placed = keepLabels && template?.text && kind === SHARED_LIST_KIND[listKey]
        ? { ...template, value: fresh.value, recipe: fresh.recipe, ...(fresh.fieldSum ? { fieldSum: fresh.fieldSum } : {}), ...(fresh.skillTags ? { skillTags: fresh.skillTags } : {}) }
        : { ...fresh, category: template && kind === SHARED_LIST_KIND[listKey] ? template.category : SHARED_CATEGORY[kind], ...(template?.condition ? { condition: template.condition } : {}) };
      if (kind === SHARED_LIST_KIND[listKey]) next.push(placed); else deferred.push([kind, placed]);
    }
  };
  const rewrite = (listKey, aggregateTable) => {
    const next = out[listKey];
    for (const entry of lists[listKey] || []) {
      const aggregate = aggregateTable?.[entry.source];
      if (aggregate && !entry.text) {
        // One entry per contributing line; the aggregate's remainder stays named as the aggregate.
        let attributed = 0;
        for (const item of plan.lines) {
          // A resolved line (`lineEffect`: a per-stat or conditional line the planner rewrote) is never in an aggregate total.
          if (item.line.lineEffect) continue;
          const value = aggregateValue(entry.source, aggregate, item.line);
          if (!value) continue;
          attributed += value;
          used.add(item.index);
          const fieldSum = FIELD_SUM_AGGREGATES[entry.source] ? { fieldSum: FIELD_SUM_AGGREGATES[entry.source] } : {};
          if (takesRecipe(item)) emit(item, listKey, next, entry);
          else next.push({ source: item.line.source, text: item.line.text, value, category: entry.category, ...(entry.stat ? { stat: entry.stat } : {}), ...fieldSum });
        }
        const residual = (entry.value || 0) - attributed;
        if (Math.abs(residual) > 1e-6) { next.push({ ...entry, value: residual, source: `${entry.source} (not from a listed line)`, ...(FIELD_SUM_AGGREGATES[entry.source] ? { fieldSum: FIELD_SUM_AGGREGATES[entry.source] } : {}) }); residuals.push({ list: listKey, source: entry.source, total: entry.value, attributed, residual }); }
        continue;
      }
      const item = lineFor(entry);
      if (!item) { next.push(entry); continue; }
      used.add(item.index);
      if (!takesRecipe(item) || entry.requiresSkillTag) { next.push(entry); continue; }
      emit(item, listKey, next, entry);
    }
  };
  rewrite("increased", AGGREGATES);
  rewrite("additional", AGGREGATES);
  rewrite("extraTown", null);
  rewrite("extraCombat", null);
  rewrite("combatOutgoing", null);
  rewrite("taken", null);
  rewrite("afflictionEffect", AFFLICTION_AGGREGATES);
  rewrite("additionalAfflictionEffect", null);
  rewrite("perEnemyAilmentType", null);
  rewrite("penetration", null);
  for (const [kind, placed] of deferred) out[KIND_LIST[kind]].push(placed);
  // Recipe writes on lines the text path did not count in any shared list: unconditional ones are added (town lists; damage taken
  // is combat-only, as the text path keeps it); conditional ones are left out (the planner's condition state never counted them).
  const added = [], leftOut = [];
  for (const item of plan.lines) {
    if (used.has(item.index) || !takesRecipe(item)) continue;
    for (const entry of item.recipe.entries) {
      const kind = SHARED_LIST[entry.layer];
      if (!kind) continue;
      if (entry.conditional) { leftOut.push({ source: item.line.source, text: item.line.text, layer: entry.layer, conditions: entry.conditions, reason: "conditional recipe write the text path did not count" }); continue; }
      out[KIND_LIST[kind]].push({ ...recipeEntry(item.line, entry), category: SHARED_CATEGORY[kind] });
      added.push({ source: item.line.source, text: item.line.text, layer: entry.layer, value: entry.value });
    }
  }
  for (const key of Object.keys(out)) out[key] = mergeFieldSums(out[key]);
  return { lists: out, residuals, added, leftOut };
}
// Aggregates whose game write is one summed field (node 108): their per-line entries fold back into one term.
const FIELD_SUM_AGGREGATES = Object.freeze({ "Equipment: Ailment Damage Enhancement": 2006249 });
const FIELD_SUM_NAMES = Object.freeze({ 2006249: "Ailment Damage Enhancement" });
const round4 = (value) => Math.round(value * 10000) / 10000;
// Every entry of one summed field becomes a single entry (at the first copy's place) whose value is the sum and whose `parts` name
// each line, as src/damage-to-life.js folds field 2010024.
function mergeFieldSums(list) {
  const groups = new Map();
  for (const entry of list) if (entry.fieldSum) groups.set(entry.fieldSum, [...(groups.get(entry.fieldSum) || []), entry]);
  if (![...groups.values()].some((copies) => copies.length > 1)) return list;
  const merged = new Map([...groups].filter(([, copies]) => copies.length > 1).map(([field, copies]) => {
    const total = copies.reduce((sum, entry) => sum + (entry.value || 0), 0);
    const parts = copies.map((entry) => ({ source: entry.source, text: entry.text, value: entry.value, ...(entry.recipe ? { recipe: entry.recipe } : {}) }));
    const name = FIELD_SUM_NAMES[field] || `field ${field}`;
    return [field, { ...copies[0], source: `${name} (one term)`, text: `+${round4(total)}% ${name}: ${parts.map((part) => `${part.source} ${round4(part.value)}%`).join(" + ")} (one game field, ${field}: every copy adds)`, value: total, parts }];
  }));
  const out = [];
  for (const entry of list) {
    if (!entry.fieldSum || !merged.has(entry.fieldSum)) out.push(entry);
    else if (groups.get(entry.fieldSum)[0] === entry) out.push(merged.get(entry.fieldSum));
  }
  return out;
}
// Shared list -> the recipe kind it holds, and kind -> the list new entries join.
const SHARED_LIST_KIND = { increased: "increased", additional: "additional", extraTown: "additional", extraCombat: "additional", combatOutgoing: "additional", taken: "taken", afflictionEffect: "afflictionEffect", additionalAfflictionEffect: "additionalAfflictionEffect", perEnemyAilmentType: "perEnemyAilmentType", penetration: "penetration" };
const KIND_LIST = { increased: "increased", additional: "additional", taken: "taken", afflictionEffect: "afflictionEffect", additionalAfflictionEffect: "additionalAfflictionEffect", perEnemyAilmentType: "perEnemyAilmentType", penetration: "penetration" };

/** Reaping modifiers (src/reaping-model.js collectReapingModifiers shape) from the plan for the given lines. */
export function traumaReapingModifiers(plan, modifierTexts = [], extraRecoverySources = []) {
  const byLine = new Map(plan.lines.map((item) => [item.line, item]));
  const result = { duration: [], recovery: [...extraRecoverySources], additionalRecovery: [], recentReap: [], ailmentType: [], reapTwice: [] };
  for (const line of modifierTexts) {
    // A window-rewritten copy of a line (the follower's Reaping Duration) is read by the text reader.
    const item = byLine.get(line);
    const text = item && squash(item.line.text) === squash(line.text) ? item : null;
    if (!text || text.use === "text") {
      const reading = collectReapingModifiers([line]);
      for (const key of Object.keys(result)) result[key].push(...reading[key]);
      continue;
    }
    // The text reader's other Reaping lists for this line (per-ailment-type, Reap twice) have no recipe layer: they stay.
    const reading = text.text.reaping;
    result.ailmentType.push(...reading.ailmentType); result.reapTwice.push(...reading.reapTwice);
    const counted = reading.duration.length + reading.recovery.length + reading.additionalRecovery.length + reading.recentReap.length > 0;
    for (const entry of text.recipe.entries) {
      const key = REAPING_LAYER[entry.layer];
      if (!key || (entry.conditional && !counted)) continue;
      result[key].push(recipeEntry(line, entry));
    }
  }
  return result;
}

/** Diagnostics for the planner output and the comparison script (kept under `unread`, which the badge walker skips). */
export function traumaPlanSummary(plan, shared = null) {
  const count = (status) => plan.lines.filter((item) => item.recipe.status === status).length;
  const relevant = (item) => item.recipe.entries.length > 0 || textHasTyped(item.text) || Object.values(item.text.reaping).some((list) => list.length);
  return {
    mode: plan.mode,
    lines: plan.lines.length, placed: count("placed"), none: count("none"), fallback: count("fallback"),
    unread: {
      fallback: plan.lines.filter((item) => item.recipe.status === "fallback" && relevant(item)).map((item) => ({ source: item.line.source, text: item.line.text, origin: item.line.origin, reason: item.recipe.reason })),
      modelOwned: plan.lines.filter((item) => item.recipe.modelOwned).map((item) => ({ source: item.line.source, text: item.line.text, reason: item.recipe.modelOwned })),
      ...(shared ? { residuals: shared.residuals, added: shared.added, leftOut: shared.leftOut } : {})
    }
  };
}
