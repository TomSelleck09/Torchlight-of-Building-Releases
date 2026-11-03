import { maxAfflictionLayerWindowScale } from "./max-affliction-resistance.js";
import { skillLevelDamageMultiplier } from "./engine.js";
import { supportEffectsFor } from "./support-effects.js";
import { expectedStrongestApplication, windowAverageStrongest } from "./ailment-model.js";
import { classifyDamageLine, routeDamageLine } from "./damage-line-classifier.js";
import { normalizePercentageText } from "./percentage-text.js";
import { AFFLICTION_DAMAGE_PER_POINT } from "./game-attribute-defaults.js";
import { damageTypeRestriction, restrictionLine } from "./damage-type-restriction.js";
import { luckyRollFraction, luckyRollsFor, randomRollNote } from "./lucky-damage.js";

// Damage over time dealt by a skill itself (profile kind "dot", engine "skill-dot"): Wilting Beam.
//
// The status is refreshed by every use of the skill, so it behaves like a 100%-chance,
// fixed-magnitude "strongest application" ailment with the skill's own duration. Its magnitude
// goes through the layers every damage over time shares (src/ailment-shared.js: the Ignite
// ledger's non-Fire increased / additional lines, enemy damage taken, Affliction, target
// resistance) plus the skill's own layers: <Type> Damage lines, the supports installed on the
// setup, the skill-level bonus past Lv.20, channeled lines, Spell Damage for a Spell skill, and
// Cataclysm's Affliction. User-confirmed 2026-10-11: Spell Damage boosts a Spell skill's own DoT
// (not ailments); Area Damage boosts no damage over time, so no Area line reaches this DoT.
// Lines that belong only to the Scorching Beam setup (its supports, its level) or only to
// ailments ("Ailment Damage", Fiery Fantasy) are removed from the shared layers. Ailment damage
// never crits and neither does this DoT (crit reaches it only through crit-scaling lines, none
// of which name a skill DoT).

const number = (value) => Number(String(value).replace("−", "-"));
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const product = (values) => values.reduce((factor, value) => factor * (1 + value / 100), 1);
const round = (value) => Math.round(value * 10000) / 10000;

// Shared-ledger entries that are scoped to another skill or to ailments only.
const otherSkillScoped = /^Support: |^Scorching Beam level |Disintegrate/i;
const ailmentOnly = /\bAilment\b|\bIgnite\b|Fiery Fantasy/i;
/** The text path's filter on the shared lists for a skill's own DoT (a recipe-placed entry passed the recipe's scope instead). */
export const keepForSkillDot = (line) => Boolean(line.recipe) || (!otherSkillScoped.test(line.source || "") && !ailmentOnly.test(line.source || "") && !ailmentOnly.test(line.text || ""));

const signedText = (value) => `${value >= 0 ? "+" : ""}${value}`;
const ELEMENTAL = ["Fire", "Cold", "Lightning"];
const suffix = (clause) => clause.origin === "leveled" ? ` (Lv.${clause.level})` : clause.origin === "roll" ? ` (T${clause.tier ?? "?"} roll)` : clause.origin === "fixed" ? " (fixed)" : "";

// Supports on the setup that change the DoT or the target, read from the shared resolver (src/support-effects.js).
// Returns ledger lines by layer, in support order. Reaches the DoT: generic "additional damage for the supported
// skill" (leveled, fixed, the Magnificent / Noble star bonus and roll as separate lines: B4), typed lines whose damage
// type matches the DoT (and Spell lines on a Spell skill: user-confirmed 2026-10-11), "additional Damage Over Time for
// the supported skill", Overload per Focus Blessing stack, increased lines, Passivation, Cataclysm. Never: crit-only
// lines (damage over time never crits; manual "Damage Over Time"; B1), Hit-only, Area (user-confirmed), Projectile /
// Melee / Attack scopes (provisional), added flat damage (manual: addition of damage does not affect DoT).
function supportLayers(setup, damageType, profile = null, { triggered = false } = {}) {
  const additional = [], increased = [], additionalAffliction = [], notes = [], afflictionPerSecond = [], maxAffliction = [];
  const tags = new Set(profile?.tags || setup?.tags || []);
  const effects = supportEffectsFor(setup, { profile, engine: "skill-dot", damageType, tags: [...tags] });
  const typedReaches = (typed) => typed === damageType || (typed === "Elemental" && ELEMENTAL.includes(damageType)) || (typed === "Spell" && tags.has("Spell"));
  for (const clause of effects.clauses) {
    const label = clause.source;
    if (clause.family === "additional") {
      if (!clause.value) continue;
      if (clause.origin === "star") { additional.push({ source: label, text: `+${clause.value}% additional damage (${clause.stars ?? "?"}★ star bonus)`, value: clause.value, category: "Additional damage" }); continue; }
      if (!clause.typed) { additional.push({ source: label, text: `${signedText(clause.value)}% additional damage for the supported skill${suffix(clause)}`, value: clause.value, category: "Additional damage" }); continue; }
      if (typedReaches(clause.typed)) additional.push({ source: label, text: `${signedText(clause.value)}% additional ${clause.typed} Damage for the supported skill${suffix(clause)}`, value: clause.value, category: "Additional damage" });
      continue;
    }
    // Conditional lines resolved from the planner's state (src/support-effects.js): damage dealt to a Cursed / Numbed target,
    // per ailment type, one enemy nearby, standing still or moving, distance. Unresolved (no state) adds nothing.
    // Lines for triggered uses only (Rhythm's movement bonus) apply when an Activation Medium triggers the skill (as on skill hits).
    // hitOnly (Recklessness, game recipe 506943104: Attack hits only) never reaches a DoT.
    // Census item #2 typed bodies (Elemental Conversion, Electric Overload, Blazing Scorch; src/support-effects.js typedParts): the
    // parts of the DoT's type.
    if (clause.family === "conditionalAdditional" && clause.typedParts) { if (clause.active && ["In calc", "Provisional"].includes(clause.status)) for (const part of clause.typedParts) if (part.value && typedReaches(part.typed)) additional.push({ source: label, text: `${signedText(part.value)}% additional ${part.typed} Damage (${clause.text}) — ${clause.conditionText}`, value: part.value, category: "Additional damage", condition: clause.conditionText }); continue; }
    if (clause.family === "conditionalAdditional") { if (clause.active && clause.appliedValue && !clause.hitOnly && (!clause.triggeredOnly || triggered)) additional.push({ source: label, text: `${clause.text}${suffix(clause)} — ${clause.conditionText}`, value: clause.appliedValue, category: "Additional damage", condition: clause.conditionText }); continue; }
    // Elemental Impact (2026-10-15 patch update): the skill's own Elemental DoT while the skill deals all three Elemental types
    // (src/support-effects.js; the planner settles `active` from the hit parts for hitting skills).
    if (clause.family === "allElementalAdditional") { if (clause.active && clause.value && typedReaches("Elemental")) additional.push({ source: label, text: `${signedText(clause.value)}% additional Elemental Damage for the supported skill${suffix(clause)} — the skill deals Fire, Cold and Lightning`, value: clause.value, category: "Additional damage", condition: "the skill deals all three Elemental types" }); continue; }
    if (clause.family === "dotAdditional" && clause.value) { additional.push({ source: label, text: `${signedText(clause.value)}% additional Damage Over Time for the supported skill${suffix(clause)}`, value: clause.value, category: "Additional damage" }); continue; }
    // Pain Amplification (reference data): "+X% additional Damage Over Time against enemies with Max Affliction for the supported skill".
    // Held while the dummy's Affliction rating is 100 (frost-terra audit 2026-10-13); the recount gates it on the simulated rating.
    if (clause.family === "maxAfflictionDot" && clause.value) { maxAffliction.push({ source: label, text: `${signedText(clause.value)}% additional Damage Over Time against enemies with Max Affliction for the supported skill${suffix(clause)}`, value: clause.value, category: "Additional damage", condition: "the dummy is at Max Affliction (rating 100)" }); continue; }
    if (clause.family === "perStack" && clause.stackSource === "focusBlessing" && clause.appliedValue) { additional.push({ source: label, text: `+${clause.value}% additional damage for the supported skill × ${clause.stacks} Focus Blessing stacks${suffix(clause)}`, value: clause.appliedValue, category: "Additional damage" }); continue; }
    if (clause.family === "increased" && clause.value && (!clause.typed || typedReaches(clause.typed))) { increased.push({ source: label, text: `${clause.text}${suffix(clause)}`, value: clause.value, category: "Increased damage" }); continue; }
    // Passivation: "deals more damage to enemies with more Life, up to +X% additional Erosion Damage".
    if (clause.family === "conditionalTyped" && clause.typed === damageType && clause.value) {
      const level = clause.level ?? "fixed";
      additional.push({ source: label, text: `up to +${clause.value}% additional ${damageType} Damage vs enemies with more Life (Lv.${level}; full value assumed)`, value: clause.value, category: "Additional damage", condition: "target at high Life (best case)" });
      notes.push(`${clause.support}: the "more Life" scaling is taken at its full +${clause.value}% (the dummy's Life share is not tracked).`);
      continue;
    }
    if (clause.family === "affliction" && clause.support === "Cataclysm") {
      // reference data: "inflicts 8 Affliction on the enemy. Effect Cooldown: 1 s" while the supported skill deals
      // damage over time, plus "Affliction grants an additional X% effect to the supported skill".
      if (clause.kind === "perSecond") afflictionPerSecond.push({ source: label, text: "8 Affliction per second while the skill deals damage over time (8 per 1 s effect cooldown)", value: 8 });
      else if (clause.value) additionalAffliction.push({ source: label, text: `Affliction grants an additional ${clause.value}% effect to the supported skill (Lv.${clause.level ?? "?"})`, value: clause.value, category: "Additional Affliction effect" });
    }
  }
  return { additional, increased, additionalAffliction, afflictionPerSecond, maxAffliction, notes };
}

// Affliction per second the setup's own supports add (Cataclysm), independent of the ledger.
export function skillDotAfflictionPerSecond(setup) {
  return supportLayers(setup, "").afflictionPerSecond.reduce((sum, line) => sum + line.value, 0);
}

function typedLines(damageType, modifierTexts, { spell = false } = {}) {
  // "Elemental Damage" writes the Fire, Cold and Lightning damage attributes (5107 + 5108 + 5109; src/damage-line-classifier.js),
  // so a Fire / Cold / Lightning DoT reads "+X% [additional] Elemental Damage" like its own type (pact badge audit 2026-10-13:
  // Dreamweaver's "+24% Elemental Damage" node read In calc but never reached Frost Terra's Cold DoT). The shared ledger drops
  // every Elemental line for skill DoTs (src/ailment-shared.js isFireOnlyLedgerLine), so nothing is counted twice.
  const T = ELEMENTAL.includes(damageType) ? `(?:${escape(damageType)}|Elemental)` : escape(damageType);
  const rules = [
    ["increased", new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% ${T} Damage(?: Over Time)?$`, "i")],
    ["additional", new RegExp(`^([+-]?\\d+(?:\\.\\d+)?)% additional ${T} Damage(?: Over Time)?$`, "i")],
    ["taken", new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% additional ${T} Damage taken$`, "i")],
    // Enemy "Spell Damage taken" debuffs (Frail, keyword 10000102; the follower's Lightning Beam) reach Spell HITS only, never
    // a Spell skill's own DoT, ailments or Reaps (2026-10-18 user-supplied: Spell Damage taken is hit-only). The player's
    // "+X% Spell Damage" still reaches a Spell skill's own DoT (user-confirmed 2026-10-11; spellLines below).
  ];
  const result = { increased: [], additional: [], taken: [] };
  for (const line of modifierTexts) {
    for (const [bucket, pattern] of rules) {
      const match = line.text.match(pattern);
      if (!match) continue;
      result[bucket].push({ source: line.source, text: line.text, value: number(match[1]) * (line.multiplier ?? 1), category: bucket === "increased" ? "Increased damage" : bucket === "additional" ? "Additional damage" : "Additional damage taken" });
      break;
    }
  }
  return result;
}

// Spell Damage on a Spell skill's own DoT (user-confirmed 2026-10-11): plain "+X% [additional] Spell Damage"
// templates and Spell-scoped variants ("+X% Erosion Spell Damage"), read through the shared classifier with
// Spell let through to the DoT side, plus aura "+X% additional Spell Damage". Ailments never get these (the
// shared DoT ledger keeps every skill-type tag out). Lines with other skill tags (Beam, Area) are not read here;
// conditional wordings stay with their own models.
// Channeled Skill damage (user decision 2026-10-25; game 101010617 / 101010620: all-damage with the Channeled skill tag) reaches a
// channeled skill's own DoT the same way, as the in-game DoT-tab Damage Bonus of the trauma fixture's channeled main skill holds them
// (attr 20213 = 735% = 549 + 186; research/game-log-comparison-2026-10-09.md row 1). Ailments never take them.
// Terra Skill damage (game affix 145146720 / 130009: attr 5719 on [Terra], user decision 2026-10-31) reaches a Terra's own DoT too, as the
// same write at −100% (15632749, "Non-Main Terra Skill cannot deal damage") has to.
const OWN_DOT_SKILL_TAGS = new Set(["Spell", "Channeled", "Terra"]);
function spellLines(profile, modifierTexts, auraEntries) {
  const tags = new Set(profile.tags || []);
  const result = { increased: [], additional: [] };
  const own = new Set([...OWN_DOT_SKILL_TAGS].filter((tag) => tags.has(tag)));
  if (own.size) for (const line of modifierTexts) {
    if (/ Damage Enhancement$/.test(String(line.derivedFrom || ""))) continue; // the Damage Enhancement sum has its own term (`enhancement` below)
    const parsed = classifyDamageLine(line.text);
    if (parsed?.kind !== "damage" || !parsed.skillTags?.size || ![...parsed.skillTags].some((tag) => own.has(tag))) continue;
    const route = routeDamageLine(parsed, { skillTags: tags, damageType: profile.damageType, dotAilment: null, hitActive: false, dotSkillTags: own });
    if (!route.dot) continue;
    result[route.dot].push({ source: line.source, text: line.text, value: parsed.value * (line.multiplier ?? 1), category: route.dot === "increased" ? "Increased damage" : "Additional damage", fromModifierText: true });
  }
  if (tags.has("Spell")) for (const entry of auraEntries) {
    const value = entry.effectiveEffects?.additionalSpellDamagePercent;
    if (value) result.additional.push({ source: `Aura: ${entry.name} / Spell Damage`, text: `+${round(value)}% additional Spell Damage`, value, category: "Additional damage" });
  }
  return result;
}

/**
 * What the text readers make of one modifier line for this skill's own DoT (typed <Type> / Elemental lines and the Spell /
 * Channeled skill-type lines), in the per-line reading shape the recipe plans compare with (src/recipe-trauma-layers.js planLinesWith;
 * src/recipe-dot-layers.js planSkillDotRecipe).
 */
export function textSkillDotReading(line, profile) {
  const typed = typedLines(profile.damageType, [line], { spell: (profile.tags || []).includes("Spell") });
  const spell = spellLines(profile, [line], []);
  return {
    typed: { increased: [...typed.increased, ...spell.increased], additional: [...typed.additional, ...spell.additional], taken: typed.taken },
    genericChance: [], genericDuration: [], chanceToDamage: [],
    reaping: { duration: [], recovery: [], additionalRecovery: [], recentReap: [], ailmentType: [], reapTwice: [] }
  };
}

/**
 * Model one skill's own damage over time.
 * @param {object} p
 * @param {object} p.setup the resolved setup (supports with effective levels)
 * @param {object} p.profile its damage profile (src/skill-damage-profiles.js, kind "dot")
 * @param {object[]} p.modifierTexts flattened modifier lines (src/modifier-texts.js)
 * @param {object} p.shared buildAilmentSharedLayers(...) for this DoT's damage type / resistance
 * @param {object[]} p.auraEntries active aura entries (effectiveEffects)
 * @param {number} p.castsPerSecond uses per second (each use refreshes the status)
 * @param {object} p.crit beam critical inputs (information only)
 * @param {number} [p.sustainedWindowSeconds]
 * @param {boolean} [p.triggered] an Activation Medium triggers the skill (src/trigger-interval.js): triggered-only lines apply
 * @param {object} [p.lucky] the build's Lucky state (src/lucky-damage.js readLuckyDamage, via src/combat-states.js)
 */
export function calculateSkillDot({ setup, profile, modifierTexts: allModifierTexts = [], shared, auraEntries = [], castsPerSecond = 0, firstApplicationSeconds = null, crit = {}, aim = null, sustainedWindowSeconds = 20, extraAdditional = [], triggered = false, lucky = null }) {
  // A buff for the character's "other skills" (Ice Bond's Euphoria, src/empower-effects.js) skips the skill that grants it.
  const ownKey = setup?.setupKey || setup?.instanceId;
  const modifierTexts = allModifierTexts.filter((line) => !line.exceptSetupKey || line.exceptSetupKey !== ownKey);
  const level = Math.max(1, Math.floor(setup?.effectiveLevel ?? profile.dot.referenceLevel));
  const perSecond = profile.dot.perSecondAtLevel(level);
  const base = { min: perSecond, max: perSecond };
  const damageType = profile.damageType;
  // Recipe path (2026-10-25, TLI_DOT_PATH; src/recipe-dot-layers.js): the shared lists arrive with every modifier line placed from its
  // game recipe (src/ailment-shared.js), and the typed / Spell / Channeled lines come from the same plan (`shared.recipe.inputs`:
  // recipe placements, the text readers for the lines the recipe cannot place).
  const recipeInputs = shared?.recipe?.inputs || null;
  const withCategory = (list, category) => (list || []).map((line) => line.category ? line : { ...line, category });
  const typed = recipeInputs ? { increased: withCategory(recipeInputs.typed.increased, "Increased damage"), additional: withCategory(recipeInputs.typed.additional, "Additional damage"), taken: withCategory(recipeInputs.typed.taken, "Additional damage taken") } : typedLines(damageType, modifierTexts, { spell: (profile.tags || []).includes("Spell") });
  const supports = supportLayers(setup, damageType, profile, { triggered });
  const ledger = shared?.ledger || {};
  // A recipe-placed entry already passed the recipe's scope (the DoT's damage types, DoT / skill tags; never ailment-only tags).
  const keep = keepForSkillDot;
  const sharedIncreased = (ledger.increased || []).filter(keep);
  const sharedAdditional = [...(ledger.additional || []), ...(ledger.extraTown || [])].filter(keep);
  const sharedCombat = [...(ledger.combatOutgoing || []), ...(ledger.extraCombat || [])].filter(keep);
  // Aim (reference data): "+35% additional damage for Projectile and Beam Skills" (Ranged before the 2026-10-15 data; game tag
  // 6001130 → 6001110) (and separately +35% additional Ailment
  // Damage, which this DoT does not get). Uptime-averaged like the Ailment line in the Ignite ledger.
  // User-confirmed 2026-10-10: Aim boosts Wilting Beam's DoT.
  if (aim?.active && aim.averageDamagePercent && (profile.tags || []).some((tag) => tag === "Beam" || tag === "Projectile")) sharedCombat.push({ source: `Aim: Projectile and Beam Skills additional damage (${aim.uptimeLabel || "uptime averaged"})`, text: `+${round(aim.damagePercent)}% while active`, value: aim.averageDamagePercent, category: "Additional damage" });
  const sharedTaken = (ledger.taken || []).filter(keep);
  // Auras: "+X% additional <Type> Damage" arrives as a derived modifier text (src/aura-damage.js) and is read
  // with the typed lines above; "+X% additional Spell Damage" with the Spell lines. "+X% additional Area Damage"
  // (Domain Expansion) is not read: Area Damage does not boost damage over time (user, 2026-10-11).
  const spell = spellLines(profile, recipeInputs ? [] : modifierTexts, auraEntries);
  // Typed aura stats on the skill's own DoT of that type (gear-pact batch chunk 2, G4): Charged Flames on a Fire DoT, Frigid
  // Domain on Cold, Electric Conversion on Lightning. Physical / Erosion arrive as derived texts (read with the typed lines);
  // an aura the shared ledger already carries is not added again.
  for (const entry of auraEntries) {
    const stat = `additional${damageType}DamagePercent`;
    const value = entry.effectiveEffects?.[stat];
    if (!value || modifierTexts.some((line) => line.aura === entry.name && line.stat === stat) || sharedAdditional.some((line) => String(line.source || "").startsWith(`Aura: ${entry.name}`))) continue;
    spell.additional.push({ source: `Aura: ${entry.name} / ${damageType} Damage`, text: `+${round(value)}% additional ${damageType} Damage`, value, category: "Additional damage" });
  }
  const levelLine = level > 20 ? [{ source: `${profile.name} level ${level}`, text: `+${round((skillLevelDamageMultiplier(level) - 1) * 100)}% additional damage (reference data Skill Level: +10%/level 21–30, +8%/level 31+)`, value: (skillLevelDamageMultiplier(level) - 1) * 100, category: "Additional damage" }] : [];

  const increased = [...sharedIncreased, ...typed.increased, ...spell.increased, ...supports.increased];
  // Damage Enhancement (game manual 1001012926 / 1001013030: "additionally increases the damage and Ailment Damage dealt by
  // Focus (Combo) Skills, and the values of each Enhancement affix are stacked together"). Game data: "+X% Terra Damage
  // Enhancement" (affix 6635189) writes the same field 2006249 as Focus (826715904) and Ailment (15289773) Damage
  // Enhancement, tagged with the skill type (6000370 / 6000290). src/line-effects.js sums the lines into one derived
  // "+Σ% additional <Kind> Skill Damage"; a skill with that tag takes it on its own DoT here, as one additional multiplier
  // (frost-terra audit 2026-10-13).
  const tags = new Set(profile.tags || []);
  const enhancement = modifierTexts.filter((line) => { const kind = String(line.derivedFrom || "").match(/^(\w+) Damage Enhancement$/)?.[1]; return kind && tags.has(kind); })
    .map((line) => ({ source: line.source, text: `${line.text} (Damage Enhancement: one additional multiplier on the skill's damage, its own damage over time included; game manual and field 2006249)`, value: Number(String(line.text).match(/^\+?(\d+(?:\.\d+)?)%/)?.[1]) || 0, category: "Additional damage" }));
  // extraAdditional: skill-specific lines the caller settles (e.g. a Terra skill's Terra Charge bonus, src/skill-hit-profiles.js).
  // "You can only deal Cold Damage" (Extreme Coldness; src/damage-type-restriction.js, user-confirmed 2026-10-18): a DoT of another
  // type deals 0 (a DoT's damage type is not converted: manual "Damage Over Time"), so its Reaps settle 0 too.
  const typeRestriction = restrictionLine(damageTypeRestriction(modifierTexts), damageType, "damage over time");
  // A random damage roll on the skill's own DoT (profile.randomRoll; Voltaic Ripple's Voltage "changes randomly between 50% and
  // 150%"): the listed value is the midpoint. SS14 client FUN_141d07730 (the typed roll, min / max + fields 2600691 / 2600692): the luck
  // count of the hit roll, n = (Lucky or the type's Lucky) + 2 × Very Lucky − (Unlucky 3000094 or the type's Unlucky), so Lucky and
  // Unlucky cancel here too (src/lucky-damage.js luckyRollFraction). A scoped Lucky line counts only when it names this damage (type,
  // Spell; a Hit scope never reaches a DoT).
  const randomRoll = profile.randomRoll ? (() => {
    const target = { damageType, tags: profile.tags || [], hit: false };
    const rolls = luckyRollsFor(lucky, target);
    const fraction = luckyRollFraction(lucky, target);
    // Voltaic Ripple: Turmoil (chunk 8; recipe 606635584: fields 2600691 / 2600692 on the Voltage tag): the support's range replaces the skill's.
    const replaced = (setup?.supportEffects?.dotRoll || [])[0] ?? null;
    const minPercent = replaced?.min ?? profile.randomRoll.minPercent, maxPercent = replaced?.max ?? profile.randomRoll.maxPercent;
    const note = randomRollNote(profile.randomRoll.label, minPercent, maxPercent, rolls, fraction);
    return { ...profile.randomRoll, minPercent, maxPercent, rolls, factor: note.factor, text: note.text };
  })() : null;
  const randomRollLine = randomRoll ? [{ source: `${profile.name}: ${profile.randomRoll.label}`, text: randomRoll.text, value: (randomRoll.factor - 1) * 100, category: "Additional damage" }] : [];
  const townAdditional = [...sharedAdditional, ...typed.additional, ...spell.additional, ...supports.additional, ...levelLine, ...enhancement, ...extraAdditional, ...randomRollLine, ...(typeRestriction ? [typeRestriction] : [])];
  const combatRating = shared?.combatAfflictionRating ?? 0;
  // Max Affliction lines (Pain Amplification) hold at a combat rating of 100 (the steady state of a build that fills Affliction).
  const atMaxAffliction = combatRating >= 100;
  const maxAfflictionLines = atMaxAffliction ? supports.maxAffliction : [];
  const combatAdditional = [...townAdditional, ...sharedCombat, ...maxAfflictionLines];
  const taken = [...sharedTaken, ...typed.taken];
  const increasedPercent = increased.reduce((sum, line) => sum + line.value, 0);
  const afflictionEffectPercent = shared?.afflictionEffectPercent || 0;
  const additionalAfflictionEffectFactor = (shared?.additionalAfflictionEffectFactor ?? 1) * product(supports.additionalAffliction.map((line) => line.value));
  // Damage per point of Affliction: config_attributes 5724 default 0.01 (2026-10-17 game attribute data).
  const afflictionFactor = (rating) => 1 + Math.max(0, Math.min(100, rating)) * AFFLICTION_DAMAGE_PER_POINT * (1 + afflictionEffectPercent / 100) * additionalAfflictionEffectFactor;
  // "−X% All Resistance when the enemy has max Affliction" (user decision 2026-10-21; src/ailment-shared.js): time share at max.
  const maxAfflictionResistance = shared?.maxAfflictionResistance?.active ? shared.maxAfflictionResistance : null;
  const resistanceFactor = maxAfflictionResistance ? maxAfflictionResistance.steadyFactor : Math.max(0, 1 - ((shared?.targetResistancePercent || 0) - (shared?.penetrationPercent || 0)) / 100);
  const windowResistance = (seconds) => maxAfflictionResistance ? maxAfflictionLayerWindowScale(maxAfflictionResistance, seconds) : 1;
  const takenFactor = product(taken.map((line) => line.value));
  const townFactor = (1 + increasedPercent / 100) * product(townAdditional.map((line) => line.value)) * afflictionFactor(shared?.townAfflictionRating ?? 0);
  const combatFactor = (1 + increasedPercent / 100) * product(combatAdditional.map((line) => line.value)) * afflictionFactor(combatRating) * takenFactor * resistanceFactor * (shared?.takenConversionFactor ?? 1);

  const roll = { min: base.min, max: base.max, chancePercent: 100, critChancePercent: 0, critFactor: 1 };
  const steadyStrongest = expectedStrongestApplication({ ...roll, attempts: castsPerSecond * sustainedWindowSeconds });
  const durationSeconds = profile.dot.durationSeconds;
  // Uptime: a status applied less often than it lasts (a cooldown-bound area; a skill-hit Terra's 2 s DoT once per 6 s
  // Terra) is active duration × applications/s of the time; a channeled beam refreshing every use, or a DoT Terra recast
  // whenever a Terra Charge is available (at least every 2 s), keeps it at 1.
  const uptime = Math.min(1, durationSeconds * castsPerSecond);
  // firstApplicationSeconds (src/planner.js dotFirstApplication; user decision 2026-10-22): a triggered recast ready at engagement
  // applies at that time and then at its rate; null keeps the first application one interval in.
  const window = (seconds) => windowAverageStrongest({ ...roll, seconds, applicationsPerSecond: castsPerSecond, firstApplicationSeconds }) * combatFactor * uptime * windowResistance(seconds);
  const key = `skill:${setup?.setupKey || setup?.instanceId || profile.name}`;
  return {
    key, name: profile.name, damageType, skillDot: true, setupKey: setup?.setupKey, profile, typeRestriction, randomRoll,
    level, base, chancePercent: 100, rawChancePercent: 100, durationSeconds, stackLimit: 1, applicationsPerSecond: castsPerSecond, firstApplicationSeconds: Number.isFinite(firstApplicationSeconds) && firstApplicationSeconds >= 0 ? firstApplicationSeconds : null,
    town: { perBaseFactor: townFactor, minimumDps: base.min * townFactor, maximumDps: base.max * townFactor },
    fullAfflictionScale: combatRating > 0 ? afflictionFactor(100) / afflictionFactor(combatRating) : 1,
    fullAfflictionResistanceScale: maxAfflictionResistance ? maxAfflictionResistance.fullScale : 1,
    maxAfflictionWindowScale: { 0: 1, 5: windowResistance(5), 20: windowResistance(20) },
    maxAfflictionResistance: maxAfflictionResistance ? { reductionPercent: maxAfflictionResistance.reductionPercent, steadyFraction: maxAfflictionResistance.steadyFraction, firstMaxSeconds: maxAfflictionResistance.firstMaxSeconds, recount: maxAfflictionResistance.recount, sources: shared.maxAfflictionResistanceSources || [] } : null,
    afflictionPerPoint: (afflictionFactor(100) - 1) / 100,
    afflictionPerSecond: supports.afflictionPerSecond.reduce((sum, line) => sum + line.value, 0),
    builtInReaping: profile.builtInReaping ? { ...profile.builtInReaping } : null,
    combat: { factor: combatFactor, steadyDps: steadyStrongest * combatFactor * uptime, uptime, steadyStrongestBase: steadyStrongest, stacking: "strongest", steadyActiveStacks: castsPerSecond > 0 ? 1 : 0, averageApplication: perSecond, successesPerSecond: castsPerSecond, fiveSecondAverageDps: window(5), twentySecondAverageDps: window(20), critOnlyFactor: 1, recentCritStacks: [] },
    steps: {
      increasedFactor: 1 + increasedPercent / 100,
      additionalFactor: product(combatAdditional.map((line) => line.value)),
      recentCritFactor: 1,
      afflictionFactor: afflictionFactor(combatRating),
      takenFactor, resistanceFactor,
      perAilmentTypeFactor: 1, enemyAilmentTypes: 0,
      afflictionRating: combatRating,
      targetResistancePercent: shared?.targetResistancePercent || 0,
      penetrationPercent: shared?.penetrationPercent || 0
    },
    crit, shared,
    ledger: { base: [{ source: `${profile.name} Lv.${level}`, text: `${perSecond} ${damageType} damage per second (${profile.sources?.gameData || "Reference data"}${level > 20 ? "; base frozen past Lv.20" : ""})`, value: perSecond, min: perSecond, max: perSecond, category: `Base ${profile.name} damage` }], increased, additional: townAdditional, combatAdditional: [...sharedCombat, ...maxAfflictionLines], taken, affliction: [...supports.additionalAffliction, ...supports.afflictionPerSecond.map((line) => ({ ...line, category: "Affliction per second" }))] },
    sources: {
      typed: { base: [{ source: `${profile.name} Lv.${level}`, text: `${perSecond} ${damageType} damage per second`, min: perSecond, max: perSecond }], chance: [], duration: [], increased: [...typed.increased, ...spell.increased, ...supports.increased], additional: [...typed.additional, ...spell.additional, ...supports.additional, ...levelLine], taken: typed.taken, critOnlyAdditional: [], perRecentCritAdditional: [], perCritDamageAdditional: [], stackLimit: [], reapingDuration: [] },
      chance: [{ source: profile.name, text: "Applied by every use of the skill", value: 100 }], duration: [{ source: profile.name, text: `Lasts ${durationSeconds} s, refreshed by each use`, value: 0 }],
      increasedPercent, townAdditional: townAdditional.map((line) => line.value), combatAdditional: combatAdditional.map((line) => line.value), perCritDamageTown: [], perCritDamageCombat: []
    },
    notes: randomRoll ? [...supports.notes, randomRoll.text] : supports.notes,
    // The Max Affliction share of the combat factor (Pain Amplification): the recount applies it once the simulated rating is 100.
    maxAfflictionAdditional: { factor: product(maxAfflictionLines.map((line) => line.value)), lines: maxAfflictionLines },
    // Modifier texts the Spell rule applied (normalized like build-mechanics' `recognized` keys), for the coverage badges.
    spellLineTexts: [...spell.increased, ...spell.additional, ...(recipeInputs ? [...typed.increased, ...typed.additional] : [])].filter((line) => line.fromModifierText || line.skillTags).map((line) => normalizePercentageText(line.text)),
    modeled: perSecond > 0 && castsPerSecond > 0
  };
}
