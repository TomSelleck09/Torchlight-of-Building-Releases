import { supportEffect } from "./support-model.js";
import { supportDataMode, supportGameLine } from "./game-skill-data.js";
import { slateAdditionalFireLines } from "./theoretical-sources.js";
import { mergeDamageToLifeLines, isDamageToLifeEntry } from "./damage-to-life.js";
import { mergeRotationTurns } from "./rotating-buffs.js";
import { hitPathMode } from "./recipe-hit-layers.js";
import { patchBeamHitLedger } from "./recipe-hit-aggregates.js";

const value = (ledger, stat, type) => ledger?.[`${stat}:${type}`] || 0;
// Damage types a ledger entry reaches (batch 7 damage fixes 2026-10-28): untagged entries reach every type of hit damage; Fire- or
// Elemental-scoped model entries carry `types`. The beam's own packets are Fire; added flat damage of another type is its own part.
const FIRE = Object.freeze(["Fire"]);
const ELEMENTAL = Object.freeze(["Fire", "Cold", "Lightning"]);
const HIT_TYPES = Object.freeze(["Physical", "Fire", "Cold", "Lightning", "Erosion"]);
const reachesTypes = (entry, types) => !entry.types || entry.types.some((type) => types.includes(type));
// A line-derived entry the recipe did not place (text reading): the types its wording names ("+X% Fire Damage", "Elemental Damage"),
// or null when it names none (applies to every type).
const TYPED_WORDING = /\b(Physical|Fire|Cold|Lightning|Erosion|Elemental)(?:,? (?:and|or) (Physical|Fire|Cold|Lightning|Erosion))? Damage\b/gi;
export function textDamageTypes(text) {
  const types = new Set();
  for (const match of String(text ?? "").matchAll(TYPED_WORDING)) for (const word of [match[1], match[2]].filter(Boolean)) {
    const type = word[0].toUpperCase() + word.slice(1).toLowerCase();
    for (const item of type === "Elemental" ? ELEMENTAL : [type]) types.add(item);
  }
  return types.size ? [...types] : null;
}

// Source-side hit modifiers. This ledger is independent of any recorded town
// spell-DPS value; unrecognized affixes stay outside the estimate.
export function scorchingBeamHitModifiers({ modifierTexts = null, beamActive = true, recipeState = {}, typedScopes = [], blurEffects, blessings = { damageSources: [] }, aim, curses = { scorchDamagePercent: 45 }, block = { damageSources: [] }, coreTalents = { lines: [] }, enemyOnTideDamageTakenPercent = 20, tideEffectFactor = 1, waveAriaPercent = 16, idyllPerStackPercent = 1.6, heroMemories = { lines: [] }, main, talentSlate, equipment, pact, aura, heroId, conditions = {}, idyllStacks = 15, extraSources = [], intelligenceAdjustment = { extraFlat: 0, percent: 0 }, fireInfiltrationPercent = 13 } = {}) {
  const talent = talentSlate?.candidateTalent || {};
  const slate = talentSlate?.candidateSlate || {};
  const gear = equipment?.candidate || {};
  const spirits = pact?.totals || {};
  const ledger = [];
  const add = (source, bucket, percent, types = null) => { if (Number.isFinite(percent) && percent !== 0) ledger.push({ source, bucket, percent, ...(types ? { types } : {}) }); };
  for (const line of heroMemories.lines) {
    if (["damagePercent", "elementalDamagePercent", "firedamage", "spelldamage"].includes(line.stat)) add(line.source + ": " + line.text, "increased", line.value, line.stat === "firedamage" ? FIRE : line.stat === "elementalDamagePercent" ? ELEMENTAL : null);
  }
  const memoryIntelligence = heroMemories.totals?.["intelligence:flat"]
    ?? heroMemories.lines.filter((line) => line.stat === "intelligence").reduce((sum, line) => sum + line.value, 0);
  const totalIntelligence = (memoryIntelligence + value(equipment?.candidate, "intelligence", "flat") + intelligenceAdjustment.extraFlat) * (1 + intelligenceAdjustment.percent / 100) * (intelligenceAdjustment.additionalFactor ?? 1);
  add("Total Intelligence (0.5% per point)", "additional", totalIntelligence * 0.5);
  for (const line of coreTalents.lines) if (["additionalDamagePercent", "additionalFireHitDamagePercent"].includes(line.stat)) add("Core talent: " + line.source, "additional", line.value, line.stat === "additionalFireHitDamagePercent" ? FIRE : null);
  for (const line of blurEffects?.damageSources || []) if (line.hit) add(line.source, "additional", line.value);
  for (const line of blessings.damageSources) add(line.source, "additional", line.value);
  for (const line of blessings.increasedSources || []) add(line.source, "increased", line.value);
  for (const line of block.damageSources) add(line.source + ": Blocked recently", "increased", line.value);
  if (conditions.targetLife !== false) {
    add("Talents: additional damage applied to Life", "additional", talent.additionalDamageToLifePercent);
    add("Slates: additional damage applied to Life", "additional", slate.additionalDamageToLifePercent);
  }
  add("Talents: Damage", "increased", talent.damagePercent);
  add("Slates: Damage", "increased", slate.damagePercent);
  if (main?.tags?.includes("Area")) {
    add("Talents: Area Damage", "increased", talent.areaDamagePercent);
    add("Slates: Area Damage", "increased", slate.areaDamagePercent);
  }
  add("Gear: Damage", "increased", value(gear, "damagePercent", "increased"));
  add("Gear: Elemental Damage", "increased", value(gear, "elementalDamagePercent", "increased"), ELEMENTAL);
  add("Gear: additional Fire Damage", "additional", value(gear, "additionalFireDamagePercent", "more"), FIRE);
  for (const support of main?.supports || []) {
    if (support.enabled === false) continue;
    if (["Control Spell", "Guard", "Refracted Prism"].includes(support.name)) {
      add(`${support.name} support`, "additional", supportEffect(support.name, Math.min(40, support.effectiveLevel || support.level || 20)).more);
    } else if (support.name === "Fire Explosion") {
      const level = Math.max(1, Math.min(40, support.effectiveLevel || support.level || 20));
      // Stone 200000363 {1: 15.5, 21: 25.5, 41: 35.5} (game mode, research §17) = the earlier 15.5 + 0.5 × (level − 1).
      const game = supportDataMode() === "game" ? supportGameLine("Fire Explosion", "15.5% additional Fire Damage for the supported skill", { level })?.values?.[0] : null;
      add("Fire Explosion support", "additional", Number.isFinite(game) ? game : 15.5 + (level - 1) * 0.5, FIRE);
    } else if (support.name === "Scorching Beam: Disintegrate (Noble)") {
      // "+X% additional damage for the supported skill" (star bonus, +20% at the default rating):
      // covers the beam's hits as well as its Ignite (panel Skill category ×7.76 needs it).
      add("Disintegrate (Noble) support: stars", "additional", support.starAdditionalDamagePercent ?? 20);
    }
  }
  const slateFireLines = slateAdditionalFireLines(talentSlate, slate.additionalFireDamagePercent || 0);
  for (const percent of slateFireLines) add(slateFireLines.length > 1 ? `Slates: additional Fire Damage (+${percent}% line)` : "Slates: additional Fire Damage", "additional", percent, FIRE);
  add("Slates: additional Max Damage", "max", slate.additionalMaxDamagePercent);
  for (const entry of aura?.entries || []) {
    add(entry.name + " aura: Fire Damage", "additional", entry.effectiveEffects?.additionalFireDamagePercent, FIRE);
    if (main?.tags?.includes("Spell")) add(entry.name + " aura: Spell Damage", "additional", entry.effectiveEffects?.additionalSpellDamagePercent);
    if (main?.tags?.includes("Area")) add(entry.name + " aura: Area Damage", "additional", entry.effectiveEffects?.additionalAreaDamagePercent);
    // Precise: Domain Expansion's "at least 5 enemies within 10 m" write (record 263618880; the Boss dummy counts as 5): its own factor.
    if (main?.tags?.includes("Area")) add(entry.name + " aura: Area Damage (at least 5 enemies)", "additional", entry.effectiveEffects?.additionalAreaDamageCrowdPercent);
  }
  add("Pacts: Damage", "increased", spirits.damagePercent);
  add("Pacts: Spell Damage", "increased", spirits.spellDamagePercent);
  add("Pacts: Elemental Damage", "increased", spirits.elementalDamagePercent, ELEMENTAL);
  add("Pacts: Fire Damage", "increased", spirits.fireDamagePercent, FIRE);
  // Each pact / kismet "+X% additional damage" line multiplies on its own (game: attr 5719 operation 4; src/engine.js
  // outgoingAdditionalDamageLines; pact badge audit 2026-10-13). One line keeps the aggregate label.
  const pactAdditionalLines = (pact?.outgoingAdditionalDamageLines || []).filter((line) => line.value);
  if (pactAdditionalLines.length > 1) for (const line of pactAdditionalLines) { if (Number.isFinite(line.value) && line.value !== 0) ledger.push({ source: `Pacts: additional Damage (${line.source})`, bucket: "additional", percent: line.value, text: line.text }); }
  else add("Pacts: additional Damage", "additional", spirits.outgoingAdditionalDamagePercent);
  if (heroId === "selena-sing-with-the-tide") add("Selena level 10: Bard state", "additional", -20);
  if (heroId === "selena-sing-with-the-tide") {
    if (conditions.tideContact) add("Tide Contact", "additional", 15 * tideEffectFactor);
    if (conditions.onTheTide) add("On the Tide", "additional", enemyOnTideDamageTakenPercent);
    // Buff 82304 owns all three source modifiers; Wave Aria also checks the target Tide state.
    if (conditions.tideContact && conditions.onTheTide && conditions.waveAria) add("Wave Aria", "additional", waveAriaPercent * tideEffectFactor);
    if (conditions.tideContact && conditions.idyll) add("Idyll of the Tide", "additional", Math.max(0, Math.min(15, idyllStacks)) * idyllPerStackPercent * tideEffectFactor);
  }
  if (conditions.aim && aim?.active) add("Aim with linked supports", "additional", aim.averageDamagePercent);
  if (conditions.scorch) add("Scorch", "additional", curses.scorchDamagePercent, FIRE);
  // Fire Infiltration (buff 3441: 101010552 [13] × GetEffectScale): the caster's Fire Infiltration Effect in `fireInfiltrationPercent` (src/planner.js).
  if (conditions.fireInfiltration) add("Fire Infiltration", "additional", fireInfiltrationPercent, FIRE);
  // Min / Max Damage lines keep the line they came from (`lineText`; the coverage badges match it).
  for (const line of extraSources) { const types = line.types ? { types: line.types } : {};
    if (line.lineText && Number.isFinite(line.percent) && line.percent !== 0) ledger.push({ source: line.source, bucket: line.bucket, percent: line.percent, lineText: line.lineText, ...types });
    // A "damage applied to Life" copy keeps its text so the summed term below finds it.
    else if (isDamageToLifeEntry(line) && Number.isFinite(line.percent) && line.percent !== 0) ledger.push({ source: line.source, bucket: line.bucket, percent: line.percent, text: line.text, condition: "Target Life", ...types });
    // A line-derived entry keeps its line as `matchText` (not `text`, which the panel compare reads to place an entry), so the recipe
    // placement (src/recipe-hit-aggregates.js) finds its line.
    else if (line.text && Number.isFinite(line.percent) && line.percent !== 0) ledger.push({ source: line.source, bucket: line.bucket, percent: line.percent, matchText: line.text, ...types });
    else add(line.source, line.bucket, line.percent, line.types || null); }
  // Recipe step 3 (2026-10-25, research/recipe-interpreter-step1-2026-10-25.md §15; src/recipe-hit-aggregates.js): the line-derived entries
  // (the talent / slate / gear / pact totals split into their lines, the per-line entries) take the game recipe's placement; model entries
  // stay. TLI_HIT_PATH=text keeps the text ledger.
  // `damageTypes`: the part's type chain. The beam's packets are Fire; an added-damage part of another type (typedScopes) takes the entries
  // that reach its chain (batch 7 damage fixes 2026-10-28): the recipe places each line for that chain, model entries follow their `types`,
  // and a text-read line follows the types its wording names (each entry once, however many of the chain's types it names).
  const finish = (damageTypes) => {
    const fire = damageTypes.length === 1 && damageTypes[0] === "Fire";
    const own = ledger.filter((entry) => reachesTypes(entry, damageTypes));
    let recipe = { mode: "text" };
    if (modifierTexts && beamActive && hitPathMode() === "recipe") {
      const patched = patchBeamHitLedger(own, { modifierTexts, beamTags: new Set([...(main?.tags || []), "Channeled"]), state: recipeState, damageTypes });
      own.splice(0, own.length, ...patched.ledger);
      recipe = { mode: "recipe", unread: { differences: patched.differences, residuals: patched.residuals, added: patched.added, leftOut: patched.leftOut } };
    }
    if (!fire) own.splice(0, own.length, ...own.filter((entry) => {
      if (entry.recipe || entry.types) return true;
      const named = textDamageTypes(entry.lineText ?? entry.text ?? entry.matchText);
      return !named || named.some((type) => damageTypes.includes(type));
    }));
    // Every "damage applied to Life" copy is one game field: one summed additional term (src/damage-to-life.js; user decision 2026-10-25).
    own.splice(0, own.length, ...mergeDamageToLifeLines(own, { valueKey: "percent" }));
    // A rotating buff set's lines this chain reads (one buff up at a time): one additional term, the average over the turns (src/rotating-buffs.js).
    own.splice(0, own.length, ...mergeRotationTurns(own, { valueKey: "percent", eligible: (entry) => entry.bucket === "additional" }));
    const increasedPercent = own.filter((entry) => entry.bucket === "increased").reduce((sum, entry) => sum + entry.percent, 0);
    const additionalFactor = own.filter((entry) => entry.bucket === "additional").reduce((factor, entry) => factor * (1 + entry.percent / 100), 1);
    const maxDamageFactor = own.filter((entry) => entry.bucket === "max").reduce((factor, entry) => factor * (1 + entry.percent / 100), 1);
    // "+/-X% additional Min Damage" (2026-10-14): the packets' lower roll; a negative total floors at 0 (as src/skill-hit-model.js).
    const minDamageFactor = Math.max(0, own.filter((entry) => entry.bucket === "min").reduce((factor, entry) => factor * (1 + entry.percent / 100), 1));
    return { recipe, ledger: own, increasedPercent, increasedFactor: Math.max(0, 1 + increasedPercent / 100), additionalFactor, maxDamageFactor, minDamageFactor, damageFactor: Math.max(0, 1 + increasedPercent / 100) * additionalFactor };
  };
  const result = finish(FIRE);
  // Added flat damage of another type (src/scorching-beam-added-damage.js; src/planner.js beam typed parts): one ledger per type chain.
  const typed = {};
  for (const scope of typedScopes) {
    const types = (scope.types || []).filter((type) => HIT_TYPES.includes(type));
    if (types.length && !typed[scope.key]) typed[scope.key] = { ...finish(types), types };
  }
  return { ...result, typed };
}
