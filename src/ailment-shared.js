// Generic damage layers shared by every damaging ailment, derived from the Ignite
// ledger (which already assembles talents, gear, pacts, auras, supports, Blur,
// Tide, and Aim) with Fire-only entries removed, plus generic lines that ledger
// does not read yet.

// Decide by what a ledger line does, not by who grants it: a profession name such as
// "Elementalist talent (0,0)" says nothing about the damage type. Elemental and Fire
// scaling never reaches Physical Trauma or Erosion Wilt.
// 1. A stat key, when the ledger carries one, is authoritative.
const fireOnlyStats = new Set(["firedamage", "fireDamagePercent", "fireDamageOverTimePercent", "elementalDamagePercent", "igniteDamagePercent"]);
// 2. Otherwise the line's tooltip text (gear, talent, support, and derived lines).
// ("damage against Ignited enemies" is not listed: it applies to all damage while the
// target is Ignited, and build-mechanics only adds it when the target is.)
const fireOnlyText = /\b(?:fire|elemental|ignite|elemental ailment)\s+damage\b|\badditional\s+(?:fire|elemental|ignite)\b/i;
// 3. Otherwise the ledger's fixed source label (entries built from a dedicated Fire/Ignite model).
const fireOnlySource = /\bfire damage\b|\belemental damage\b|\badditional fire\b|\badditional ignite\b|\bignite damage\b|\bdisintegrate\b|\bflame focus\b|^fire infiltration$|^scorch$|\bvs ignited\b/i;

import { ALL_RESISTANCE_TYPES, maxAfflictionResistanceLayer } from "./max-affliction-resistance.js";

export function isFireOnlyLedgerLine(line) {
  if (line.stat) return fireOnlyStats.has(line.stat);
  if (line.text) return fireOnlyText.test(line.text);
  return fireOnlySource.test(line.source || "");
}

// "+X% additional Damage Over Time" (gear, slates, prisms, …) now arrives through the shared DoT
// ledger (build-mechanics.js → theoretical-sources.js, read by the shared classifier), so it is
// not read here a second time.
const sealedManaAndLife = /^\+(\d+(?:\.\d+)?)% additional damage when having both Sealed Mana and Life$/i;
const versusCursed = /^\+(\d+(?:\.\d+)?)% additional damage against Cursed enemies$/i;
const ailmentWhileBlur = /\+(\d+(?:\.\d+)?)% additional Ailment Damage while Blur is active$/i;
const perEnemyAilmentType = /^Upon inflicting damage, \+(\d+(?:\.\d+)?)% additional Ailment Damage \(multiplies\) for every type of Ailment the enemy has$/i;

// Lines scoped to the inflicting skill's tags ("Ailment Damage dealt by Area Skills", `requiresSkillTag`) are
// gated in the Ignite ledger on Scorching Beam, which also inflicts Trauma and Wilt in this planner (they apply
// at its use rate), so the gate carries over unchanged (src/theoretical-sources.js `inactiveSources`).
// Penetration (`penetration`: build-mechanics' `penetration`, lines by damage type) lowers the target
// resistance of this DoT's damage type: Erosion penetration reaches Wilt and Erosion skill DoTs
// (research/penetration-target-trace-2026-10-07.md: the Erosion routine reads Erosion Penetration 0x1526).
// Physical has no resistance; the dummy has no armour against damage over time, so Trauma gets none.
const AILMENT_DAMAGE_TYPE = { ignite: "Fire", trauma: "Physical", wilt: "Erosion" };

// Lines the Ignite ledger carries for the main skill only: its supports ("Support: …", build-mechanics.js and
// theoretical-sources.js) and its level bonus past Lv.20. Other inflicting skills replace them with their own
// (src/ailment-applications.js `scale`).
export const MAIN_SKILL_SCOPED_SOURCE = /^Support: |^Scorching Beam level \d+$/;

// "−X% All Resistance when the enemy has max Affliction" (user decision 2026-10-21): every DoT of a type "All Resistance" writes
// (Fire, Cold, Lightning, Erosion; src/max-affliction-resistance.js) takes it for the time the dummy sits at max Affliction, like
// the Ignite path. `maxAfflictionResistance` = { reductionPercent, firstMaxSeconds, steadyFraction, sources } (src/planner.js), or
// null without the line or Affliction.

// `rewriteLists` (the recipe-driven Trauma, Wilt and skill-DoT paths, src/recipe-trauma-layers.js rewriteTraumaShared; src/recipe-dot-
// layers.js): receives the ledger lists this function reads ({ increased, additional, extraTown, extraCombat, combatOutgoing, taken,
// afflictionEffect, additionalAfflictionEffect, perEnemyAilmentType, penetration }) and returns { lists } with the line-derived entries
// placed from the game recipes; every figure below is then derived from the returned lists. Without it the lists are used as read.
// `recipeInputs` (optional): the same plan's per-line typed inputs (src/recipe-trauma-layers.js ailmentInputs), passed through as
// `recipe.inputs` for the model that reads them (calculateAilment `inputs`, calculateSkillDot).
export function buildAilmentSharedLayers({ theoretical, modifierTexts = [], conditions = {}, combat = {}, hasSealedLife = false, targetCursed = false, ailmentKey = "trauma", targetResistancePercent = 0, damageType = AILMENT_DAMAGE_TYPE[ailmentKey], penetration = null, maxAfflictionResistance = null, rewriteLists = null, recipeInputs = null }) {
  const ledger = theoretical?.ledger || [];
  const penetrationLines = damageType && damageType !== "Physical" ? (penetration?.byType?.[damageType] || []).filter((line) => line.value) : [];
  // Ignite (generic path, when a skill other than Scorching Beam inflicts it) keeps the ledger's Fire lines.
  const keep = ailmentKey === "ignite" ? () => true : (line) => !isFireOnlyLedgerLine(line);
  const increased = ledger.filter((line) => line.category === "Increased damage" && keep(line));
  // Daze ("+25% additional Ailment Damage while Blur is active") counts once, whatever carries it (slate, Warlock core,
  // gear): the Blur model (src/blur-effects.js) puts one "Daze · Blur active" line in the Ignite ledger, and the
  // modifier-text route below is used only when that line is absent. It is a combat (Blur) layer here, as before.
  // Once-only across a slate and the core: cores never stack (user rule 2026-10-21; talent batch Q7).
  const isDazeLine = (line) => /^Daze · Blur active$/.test(line.source || "");
  const dazeLedgerLine = ledger.find((line) => line.category === "Additional damage" && isDazeLine(line));
  // Generic Ignite also takes the ledger's build-wide "Additional Ignite damage" lines ("+50% additional Ignite Damage", game recipe
  // 726707; batch 1 2026-10-27: before, only the beam's Ignite read them). Left out: the beam's own Disintegrate stack line, the beam's Bard line (src/ailment-applications.js applies Bard per
  // Channeled skill) and the ledger's Fiery Fantasy line (the generic model computes Fiery Fantasy from its own chance); "Support: …" lines are main-scoped below.
  const igniteOnlyAdditional = (line) => ailmentKey === "ignite" && line.category === "Additional Ignite damage" && !/^Disintegrate \(Noble\): additionally inflicted stacks$|^Core talent: Fiery Fantasy$|^Selena: Bard state \(Channeled Ignite\)$/.test(line.source || "");
  const additional = ledger.filter((line) => (["Additional damage", "Additional main-stat damage", "Additional ailment damage"].includes(line.category) || igniteOnlyAdditional(line)) && keep(line) && !isDazeLine(line));
  const mainScoped = additional.filter((line) => MAIN_SKILL_SCOPED_SOURCE.test(line.source || ""));
  // "… dealt by Area Skills" lines: active ones carry `requiresSkillTag` (the main skill has the tag); the
  // ledger lists the ones the main skill lacks in `inactiveSources`. Both are re-gated per inflicting skill.
  const tagGated = additional.filter((line) => line.requiresSkillTag).map((line) => ({ source: line.source, value: line.value, requiresSkillTag: line.requiresSkillTag }));
  const inactiveTagLines = (theoretical?.inactiveSources || []).filter((line) => line.requiresSkillTag && keep(line)).map((line) => ({ source: line.source, value: line.value, requiresSkillTag: line.requiresSkillTag }));
  const extraTown = [], extraCombat = [], notes = [];
  let dazeCounted = false;
  if (dazeLedgerLine && conditions.blur !== false) { extraCombat.push({ source: dazeLedgerLine.source, text: "+25% additional Ailment Damage while Blur is active", value: dazeLedgerLine.value }); dazeCounted = true; }
  // The recipe-driven Ignite ledger (src/recipe-ignite-layers.js, 2026-10-25) carries these lines itself once the planner settles
  // their gate (target Cursed, both Sealed Mana and Life); a line already in the ledger is counted from there, not again here.
  const combatLedgerLines = theoretical?.combat?.ledger || [];
  const inLedger = new Set([...ledger, ...combatLedgerLines].filter((line) => line.text).map((line) => `${line.source}|${line.text}`));
  for (const line of modifierTexts) {
    let match = line.text.match(sealedManaAndLife);
    if (match && inLedger.has(`${line.source}|${line.text}`)) continue;
    if (match && hasSealedLife) { extraTown.push({ source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1) }); continue; }
    match = line.text.match(versusCursed);
    if (match && inLedger.has(`${line.source}|${line.text}`)) continue;
    if (match && targetCursed) { extraCombat.push({ source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1) }); continue; }
    match = line.text.match(ailmentWhileBlur);
    if (match) { if (conditions.blur !== false && !dazeCounted && !dazeLedgerLine) { extraCombat.push({ source: line.source, text: line.text, value: Number(match[1]) }); dazeCounted = true; } continue; }
  }
  const combatLedger = theoretical?.combat?.ledger || [];
  const read = {
    increased, additional, extraTown, extraCombat,
    perEnemyAilmentType: modifierTexts.map((line) => { const match = line.text.match(perEnemyAilmentType); return match ? { source: line.source, text: line.text, value: Number(match[1]) } : null; }).filter(Boolean),
    // The per-ailment-type line is the power below (perEnemyAilmentType), not a flat combat entry (the recipe-driven Ignite ledger
    // carries it as one for the beam's Ignite).
    combatOutgoing: combatLedger.filter((line) => line.category === "Additional damage" && keep(line) && !perEnemyAilmentType.test(String(line.text || ""))),
    taken: combatLedger.filter((line) => line.category === "Additional damage taken" && keep(line) && line.value),
    afflictionEffect: ledger.filter((line) => line.category === "Affliction effect"),
    additionalAfflictionEffect: ledger.filter((line) => line.category === "Additional Affliction effect"),
    // Penetration of this DoT's damage type (Erosion for Wilt, Cold for Frost Terra …); Physical has none.
    penetration: penetrationLines
  };
  const recipe = rewriteLists ? rewriteLists(read) : null;
  const lists = recipe ? { ...read, ...recipe.lists } : read;
  const { combatOutgoing, taken } = lists;
  const appliedPenetration = damageType && damageType !== "Physical" ? (lists.penetration || []).filter((line) => line.value) : [];
  const penetrationPercent = appliedPenetration.reduce((sum, line) => sum + line.value, 0);
  const perEnemyAilmentTypeSources = lists.perEnemyAilmentType;
  const perEnemyAilmentTypePercents = perEnemyAilmentTypeSources.map((line) => line.value);
  const afflictionEffectPercent = lists.afflictionEffect.reduce((sum, line) => sum + line.value, 0);
  // The main skill's Cataclysm "Affliction grants an additional X% effect to the supported skill" (game recipe 943784: mine tag 5000002,
  // the supported skill only; installed or item-granted, src/theoretical-sources.js) is not a shared layer (batch 1 2026-10-27: it
  // reached every other skill's DoT and ailments). It is returned apart (`supportedAfflictionEffectFactor`) for the main skill's own
  // ailment streams; other skills apply their own Cataclysm (src/planner.js withCataclysmEffect, src/skill-dot-model.js).
  const supportedOnly = (line) => /^Support: Cataclysm\b/.test(line.source || "");
  const additionalAfflictionEffectFactor = lists.additionalAfflictionEffect.filter((line) => !supportedOnly(line)).reduce((factor, line) => factor * (1 + line.value / 100), 1);
  const supportedAfflictionLines = lists.additionalAfflictionEffect.filter(supportedOnly);
  const supportedAfflictionEffectFactor = supportedAfflictionLines.reduce((factor, line) => factor * (1 + line.value / 100), 1);
  const townAdditional = [...lists.additional, ...lists.extraTown];
  return {
    increasedPercents: lists.increased.map((line) => line.value),
    townAdditionalPercents: townAdditional.map((line) => line.value),
    combatAdditionalPercents: [...townAdditional, ...combatOutgoing, ...lists.extraCombat].map((line) => line.value),
    additionalDamageTakenPercents: taken.map((line) => line.value),
    perEnemyAilmentTypePercents,
    afflictionEffectPercent, additionalAfflictionEffectFactor, supportedAfflictionEffectFactor, supportedAfflictionLines,
    townAfflictionRating: theoretical?.townTooltip?.projectedAfflictionRating ?? 0,
    combatAfflictionRating: conditions.affliction === false ? 0 : Number(combat.afflictionAverage) || 0,
    targetResistancePercent,
    damageType,
    penetrationPercent,
    maxAfflictionResistance: maxAfflictionResistance && ALL_RESISTANCE_TYPES.has(damageType) ? maxAfflictionResistanceLayer({ resistancePercent: targetResistancePercent, penetrationPercent, info: maxAfflictionResistance }) : null,
    maxAfflictionResistanceSources: maxAfflictionResistance && ALL_RESISTANCE_TYPES.has(damageType) ? maxAfflictionResistance.sources || [] : [],
    // The pooled Intelligence main-stat line inside `additional` (gear-pact batch chunk 4: a skill's Strength / Dexterity
    // main-stat share is added to it before the final bonus, manual keyword text).
    intelligencePercent: additional.filter((line) => /^Total Intelligence/.test(line.source || "")).reduce((sum, line) => sum + line.value, 0),
    // Main-skill-only layers inside `additional` (as a product) and the skill-tag-gated lines, for per-skill scaling.
    mainScopedFactor: mainScoped.reduce((factor, line) => factor * (1 + line.value / 100), 1),
    mainScopedLines: mainScoped,
    tagGated, inactiveTagLines,
    ledger: { increased: lists.increased, additional: lists.additional, extraTown: lists.extraTown, extraCombat: lists.extraCombat, combatOutgoing, taken, perEnemyAilmentType: perEnemyAilmentTypeSources, penetration: appliedPenetration,
      ...(recipe ? { afflictionEffect: lists.afflictionEffect, additionalAfflictionEffect: lists.additionalAfflictionEffect } : {}) },
    ...(recipe ? { recipe: { residuals: recipe.residuals, added: recipe.added, leftOut: recipe.leftOut, ...(recipeInputs ? { inputs: recipeInputs } : {}) } } : {}),
    notes
  };
}
