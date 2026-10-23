import { calculateFiresAllure } from "./fires-allure.js";
import { requestedCombatConditions } from "./combat-condition-mode.js";
import { calculateBlurEffects } from "./blur-effects.js";
import { EHP_DEFAULTS, resourcePool, baseMana, baseLife, baseEvasion } from "./effective-hp.js";
import { resolvePactLimits } from "./pact-limits.js";
import { calculateLowResourceDefenses } from "./low-resource-model.js";
import { calculateResistances } from "./resistance-model.js";
import { calculateCurseLimit, isCurseSkill, CURSE_TOGGLES, curseBarOrder, curseSlotSummary } from "./curse-limit.js";
import { curseEffects } from "./curse-model.js";
import { calculateBlessings, blessingBaseEffects } from "./blessing-model.js";
import { skillGameTagsSs13 } from "./data/skills/support-eligibility-ss13.generated.js";
import { blessingRecoverySources } from "./blessing-gear-effects.js";
import { calculateAim } from "./aim-model.js";
import { trueDamageSettleScale } from "./true-damage.js";
import { guardBarrierSources } from "./barrier-sources.js";
import { aegisOfFireAssumption } from "./aegis-of-fire.js";
import { calculateBlock } from "./block-model.js";
import { collectBlurSources } from "./blur-sources.js";
import { resolveConsumption } from "./consumption-procs.js";
import { calculateCoreTalents } from "./core-talent-model.js";
import { calculateHeroMemories } from "./hero-memory-model.js";
import { artificialMoonGate } from "./hero-memory-rules.js";
import { prismTalentStatSources } from "./prism-talent-sources.js";
import { collectModifierTexts } from "./modifier-texts.js";
import { followerModifierTexts, followerSelection, settleFollowerBuffs, settleFollowerReaps, followerBlurSources, followerReapSources, followerDamageSources, followerWindowDps } from "./follower-model.js";
import { plannerEngines } from "./line-coverage.js";
import { calculateAilment, collectAilmentTypedSources, combineAilmentChance, hasAilmentBase } from "./ailment-model.js";
import { collectAilmentApplierCandidates, ailmentAppliersFor, igniteGlobalChanceSources } from "./ailment-applications.js";
import { buildAilmentSharedLayers } from "./ailment-shared.js";
import { calculateMultiSourceReaping, collectAllReapingSources, collectReapingModifiers } from "./reaping-model.js";
import { collectBuildMechanics } from "./build-mechanics.js";
import { resolveSingWithTheTide } from "./selena-tide.js";
import { auraGainedEffects, auraCastSpeedLines, auraGainedEffectLines } from "./aura-gained-effects.js";
import { windStalkerState, resolveWindStalker, windStalkerMoonMark } from "./erika-wind-stalker.js";
import { YOUGA_ULTIMATE_ONE, blockNonMainTangles, yougaTangleQuantityLines, yougaUltimateOneState, yougaPreEffects, resolveYougaUltimateOne, yougaPlainState, projectileMechanics } from "./youga-ultimate-one.js";
import { resolveHeroModules, resolveIllusionState } from "./hero-trait-modules.js";
import { settleIllusionStream } from "./youga-spacetime.js";
import { passiveSupportLines } from "./passive-support-lines.js";
import { GASH, GASH_GAIN_TEXT, resolveDanceOfTheDeep, danceBlocksSetup, withTerraCharges, terraChargeLine, terraChargesConsumed, terraChargesAtInterval, resolveTerraCharges, setupTerraChargeLines, resolveActivationMediumTerra, activationMediumTerraInterval, resolveCycleResist, windRhythmTerraTrigger, buildCooldownRecoveryLines } from "./selena-dance.js";
import { calculateSupportCandidate, modeledSupportNames } from "./support-model.js";
import { collectNormalizedGearModifiers, calculateConfiguredCombatDamage, calculateTalentSlateCandidate, calculatePactCandidate, calculateEquipmentCandidate, calculateAuraLedger, calculateAvailableEnergy, allocateSkillEnergy, energyCostForSupportPositions, skillLevelDamageMultiplier, effectiveGearModifierTexts } from "./engine.js";
import { normalizePlannerState } from "./planner-state.js";
import { resolveTalentCandidate, resolveSlateCandidate } from "./candidate-sources.js";
import { grantedCoreNames, resolveCoreCopies, withoutInactiveSlateCores, withExpandedBareSlateCores } from "./granted-core-lines.js";
import { selenaScorchingBeamTalentSetupSs13 as talents } from "./data/talents/selena-scorching-beam-ss13.js";
import { allProfessionTalentCatalogueSs13 as catalogue } from "./data/talents/all-profession-trees-ss13.generated.js";
import { selenaScorchingBeamGearSs13 as gear } from "./data/gear/selena-scorching-beam-ss13.js";
import { selenaScorchingBeamPactsSs13 as pacts } from "./data/pacts/selena-scorching-beam-ss13.js";
import { selenaScorchingBeamSlatesSs13 as slates } from "./data/slates/selena-scorching-beam-ss13.js";
import { supportValidationBaseline } from "./data/stats/support-validation-2026-09-08.js";
import { selenaCompleteSkillLoadoutSs13 as skills } from "./data/skills/selena-complete-skill-loadout-ss13.js";
import { auraScalingSs13 } from "./data/skills/aura-scaling-ss13.js";
import { auraDamageModifierTexts } from "./aura-damage.js";
import { collectSkillDamageSources, inferDamageProfile } from "./skill-damage-profiles.js";
import { MINION_PROFILES } from "./minion-profiles.js";
import { skillProgressionSs13 } from "./data/skills/skill-progression-ss13.generated.js";
import { calculateSkillDot, skillDotAfflictionPerSecond } from "./skill-dot-model.js";
import { calculateSkillHit } from "./skill-hit-model.js";
import { skillHitDotComponents, skillHitTiming } from "./skill-hit-profiles.js";
import { resolveSupportEffects, SCORCHING_BEAM_DEDICATED_SUPPORTS, allElementalState } from "./support-effects.js";
import { calculateMinion, groupMinionSources, classifyMinionLine, minionCountOut } from "./minion-damage-model.js";
import { comboPointState } from "./combo-points.js";
import { namedAuraSealedManaCompensation } from "./aura-effects.js";
import { commanderGambitState, applySpiritMagiLimit, darkGateState, bondState, summonCastSpeed, commandState, COMMAND_FAMILIES, isomorphicArmsState, comradeshipState } from "./minion-cores.js";
import { overlyModifiedState, overlyModifiedLine } from "./sentry-cores.js";
import { heroTraitStatLines, heroTraitLevelBonus, characterStatTotals } from "./character-stats.js";
import { resolveLineEffects } from "./line-effects.js";
import { conditionalAuraEffect } from "./conditional-aura-effect.js";
import { atFullLife, atFullMana, LOW_LIFE_BELOW_PERCENT, FULL_MANA_AT_LEAST_PERCENT } from "./line-conditions.js";
import { luckyCritChance, mirroredShadeTerraChargeLines } from "./combat-states.js";
import { CHANCE_TO_DAMAGE } from "./ailment-model.js";
import { calculateWeaponAttack, weaponLocalLineKind } from "./weapon-damage-model.js";
import { calculateVendettaTriggers, hitCritChances } from "./vendetta-model.js";
import { felineFigureState, vendettaStingState, VENDETTAS_STING } from "./erika-traits.js";
import { motoIrisState, minionHeroTraits, mergingStreamOrigins } from "./moto-iris-traits.js";
import { theaBlessingInputs, theaState, INSIDE_REALM_CONDITION } from "./thea-traits.js";
import { sageState } from "./sage-traits.js";
import { carinoState, CARINO_HEROES, RETURNING_SWITCH, SPECIAL_AMMO_LEVEL } from "./carino-traits.js";
import { rehanState, withRehanHits, rehanPhaseLines, burstProfile, burstAdditionalLines, BURST_SETUP_KEY } from "./rehan-traits.js";
import { rosaState, mercuryBaptismSource } from "./rosa-traits.js";
import { bingState, bombsReplaceMain, BLAST_NOVA as BING_BLAST_NOVA } from "./bing-traits.js";
import { crimsonShadeState, redShoesState, BARD_SONG_SWITCH } from "./selena-leftover-traits.js";
const B6_MODULE_KEYS = new Set(["overload", "chargeCalling", "irisGrowing", "irisVigilant"]);
import { selenaScorchingBeamObservedSnapshots as snapshots } from "./data/stats/selena-scorching-beam-observed-snapshots.js";
import { selenaScorchingBeamCombatValidation as combat } from "./data/stats/selena-scorching-beam-combat-validation.js";
import { compileScorchingBeamIgniteSources } from "./theoretical-sources.js";
import { maxAfflictionUptime } from "./max-affliction-resistance.js";
import { defaultConfigurableSupportConfig, specialSupportStarBonus, progressionSupportTierData, progressionSupportText, normalizeProgressionSupportConfig, isActivationMedium } from "./data/skills/special-support-tiers-ss13.js";
import { tlidbSkillCatalogSs13, tlidbSupportCatalogSs13 } from "./data/catalogs/tlidb-ss13.js";
import { installedSupportRejected } from "./support-compatibility.js";
import { skillLevelBonus } from "./skill-level-bonuses.js";
import { supportEffectsAtLevel } from "./skill-effect-progression.js";
// Saved base levels stay within the selector's 1–40 range; "+N level" sources are added on top.
import { clampBaseLevel } from "./skill-level-input.js";
import { scorchingBeamHitModifiers } from "./scorching-beam-hit.js";
import { findScorchingBeamSetup, scorchingBeamSustainedHits } from "./scorching-beam-base-hit.js";
import { scorchingBeamCastRate } from "./scorching-beam-cast-rate.js";
import { activationMediumDotTrigger } from "./trigger-interval.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { scorchingBeamCritical } from "./scorching-beam-critical.js";
import { scorchingBeamAddedDamage } from "./scorching-beam-added-damage.js";
import { combineBeamAndIgnite, estimateBardBeamDelivery, estimateFiveSecondOpening, estimateNeutralBeamDelivery, simulateFiveSecondVariation } from "./scorching-beam-delivery.js";
import { calibratedBeamTargetFactors, fireHitMitigation, level85DummyDefenses } from "./target-hit-mitigation.js";
import { ignitedFireResistance } from "./ignited-fire-resistance.js";
import { calculateDummyRecount } from "./dummy-recount.js";
import { collectDummyRecountInputs } from "./dummy-recount-inputs.js";
import { deriveAfflictionRating } from "./affliction-rating.js";
import { curseTakenEffect, curseTakenLine } from "./curse-effects.js";
import { grantedMainSkillSupports, grantedPreciseAuras, mainAttributeBonusRemoved, rotatingBuffRow } from "./gear-unique-modules.js";
import { parseItemTrigger, itemTriggerEvent } from "./item-triggered-skills.js";
import { doubleDamageForSkill } from "./double-damage.js";
import { radicalEvolutionAuraEffects } from "./origin-of-spirit-magus.js";
import { normalizePercentageText as normalizeLineText } from "./percentage-text.js";
import { spellToAttackLines } from "./spell-to-attack.js";
import { WORLD_WITHIN_LINE, worldWithinChances } from "./world-within.js";
import { HIT_GAIN } from "./blessing-model.js";
import { resolveEmpowerEffects, EMPOWER_MODELED_SKILLS } from "./empower-effects.js";
import { mainSkillRetriggers, isMainRetriggerLine } from "./main-skill-retriggers.js";
import { collectEnemyAilments } from "./enemy-ailments.js";
import { resolvePeriodicBurst } from "./periodic-burst.js";
import { resolveCritNumbedBuffs } from "./crit-numbed-buff.js";
import { resolveIllOmen, illOmenDps } from "./ill-omen.js";
import { resolveTangles, tangleLinesFor, dormantEntanglementLineEntries, tangleLineEntries, tangleHitEffects } from "./tangle-model.js";
import { elixirSetupText, miraculousGainState } from "./elixir-model.js";
import { iceCageRampText } from "./ice-cage-ramp.js";
import { resolveMark, settleMark } from "./mark-effect.js";
import { resolvePureHeart } from "./pure-heart.js";
import { hitTypeShares, recountTimedEffects, sourceFactorAt, timedWindowFactor } from "./timed-effects.js";
import { applyTraitBoardGrants, emptyRowsFilledByGrants, traitBoardGrantLines } from "./trait-board-grants.js";
import { skillBoardRows } from "./skill-board-slots.js";
import { applyMagusActiveSlotRule, magusTakesActiveSkillLevels, setupBoardTab } from "./magus-active-slot.js";
import { removesType } from "./damage-type-restriction.js";
import { weaponToSpellEntries } from "./towering-presence.js";
import { slateTalentLines } from "./nether-king-authority.js";

// Best-case rule (user, 2026-10-09): in automatic mode, when two conditions
// cannot both hold, keep whichever gives the dummy more damage and report the
// choice. Each group lists the alternatives to the default reading.
const exclusiveConditionGroups = [
  {
    label: "Blur",
    defaultLabel: "Blur active",
    alternatives: [{
      label: "Within 3 s after Blur ends",
      overrides: { blur: false, blurRecentlyEnded: true },
      possible: (planner) => planner.blurSources.some((source) => source.available) && planner.blurEffects.stealth === true
    }]
  },
  {
    // User rule (2026-10-10): moving is constant in this game, so movement-driven Blessing stacks
    // (Kismet: Civet) are full; standing still is compared only when such a source exists.
    label: "Movement",
    defaultLabel: "Moving",
    alternatives: [{
      label: "Standing still",
      overrides: { moving: false },
      // Also when a support line depends on it (Willpower while standing still; Gale Slash: Onslaught moving).
      // Passive lines too: "while standing still", "when moving", Hasten per metre (src/line-effects.js). "If you have recently
      // moved" lines are no longer in the group: they hold in both choices (movedRecently; user rule 2026-10-14).
      // Item-trigger lines on the movement events ("Triggers Lv. 30 Aim while standing still", "… Black Hole when moving"; gear affix
      // batch D 2026-10-22, src/item-triggered-skills.js) too: before, a standing-still trigger was never compared.
      possible: (planner) => planner.conditions.moving !== false && (Boolean(planner.blessings?.movementStacks) || supportConditionClauses(planner).some((clause) => ["standingStill", "moving"].includes(clause.condition)) || Boolean(planner.lineEffects?.groups?.has("movement"))
        || (planner.modifierTexts || []).some((line) => line.origin !== "derived" && ["standingStill", "moving"].includes(parseItemTrigger(line.text)?.event)))
    }]
  },
  {
    // Distance to the dummy (user rule 2026-10-09: best-case distance, flippable). Radii (TLIDB keyword tooltips, user
    // decision 2026-10-12): Nearby within 6 m, Proximity within 4 m, Distant 6 m away (src/dummy-target.js). The default
    // stands close, so Nearby / Proximity and explicit radii hold; the alternative stands 6 m away for "Distant" lines.
    // Support lines that scale with proximity (Flame Slash: Immediate Threat "up to +X% … within 3 m"; Mind Control:
    // Entice "-10% … in proximity").
    label: "Distance",
    defaultLabel: "Close to the dummy (Nearby and Proximity)",
    alternatives: [{
      label: "6 m away (Distant; within 10 m)",
      overrides: { nearTarget: false },
      possible: (planner) => planner.conditions.nearTarget !== false && (supportConditionClauses(planner).some((clause) => clause.condition === "nearTarget") || Boolean(planner.lineEffects?.groups?.has("distance")))
    }]
  },
  {
    // Life (talent batch chunk 2): "at Low Life" and "when not at Low Life" / Full Life lines cannot both hold. Sealed Life
    // sets Low Life (src/low-resource-model.js); otherwise the dummy never attacks, so Full Life is the default and Low
    // Life is compared only when a passive line depends on it. Choosing Low Life also turns the Full Life pact lines off.
    // Full Life needs at least 95% of Max Life unsealed (user-confirmed 2026-10-12), so with Life sealed between 5% and
    // 65% the default is "not at Low Life" without being Full Life.
    label: "Life",
    defaultLabel: (planner) => atFullLife(planner.lineEffects?.state || {}) ? "Full Life" : "Not at Low Life (Life sealed: not Full Life)",
    alternatives: [{
      label: "Low Life",
      overrides: { lowLifeAssumed: true },
      possible: (planner) => !planner.lowResources?.lowLife && (Boolean(planner.lineEffects?.groups?.has("life")) || supportConditionClauses(planner).some((clause) => clause.condition === "lifeLost"))
    }]
  },
  {
    // Thea – Incarnation of the Gods (hero trait audit B7, src/thea-traits.js): standing inside or outside the Divine Realm (cast on
    // the dummy) cannot both hold. Outside by default (Tenacity converts to Agility; Might Flow, Divine Realm Power's speed,
    // Crossing the Divine Threshold, Divine Spirit); inside is compared while the Realm is active (Agility converts to Tenacity;
    // Divine Realm Power's damage). Provisional.
    label: "Divine Realm position",
    defaultLabel: "Outside the Divine Realm",
    alternatives: [{
      label: "Inside the Divine Realm",
      overrides: { [INSIDE_REALM_CONDITION]: true },
      possible: (planner) => Boolean(planner.lineEffects?.state?.thea?.incarnation?.realm?.active) && planner.lineEffects.state.thea.incarnation.realm.inside === false
    }]
  },
  {
    // Mana (talent batch chunk 2): "at Full Mana" vs "at Low Mana" lines. Sealed Mana sets Low Mana; otherwise Full Mana by
    // default, and Low Mana is compared when a passive line depends on it.
    label: "Mana",
    defaultLabel: (planner) => atFullMana(planner.lineEffects?.state || {}) ? "Full Mana" : "Not at Low Mana (Mana sealed: not Full Mana; provisional)",
    alternatives: [{
      label: "Low Mana",
      overrides: { lowManaAssumed: true },
      possible: (planner) => !planner.lowResources?.lowMana && Boolean(planner.lineEffects?.groups?.has("mana"))
    }]
  }
];

// State the shared line-condition resolver reads (src/line-conditions.js; talent batch chunk 2, §7.1), built once per
// pass from models that already exist. Life and Mana: sealed resources set them (src/low-resource-model.js, Low = below
// 35% remaining after sealing); otherwise not Low, unless the Life / Mana group's best-case comparison chose Low
// (requested lowLifeAssumed / lowManaAssumed). Full Life additionally needs at least 95% of Max Life unsealed
// (user-confirmed 2026-10-12; Full Mana by analogy, provisional): src/line-conditions.js atFullLife / atFullMana. The early use rate for "the next Main Skill every X s" is an estimate
// from the cast-rate ledger (beam) or the weapon's attacks per second (attacks), before Blessings and Aim.
// The Cycle I Resist Reaps on a Main Terra recast (src/selena-dance.js resolveCycleResist): a Reaping source for the "on Reap"
// gain conditions (Focus Blessing when Reaping, Blur on Reap) while a Main Terra Skill is active.
// Mobility Skills installed and enabled on the skill board (catalog Mobility tag), for "after using Mobility Skills" lines
// (user rule 2026-10-14: mobility skill use is constant when the build has one; src/line-conditions.js "mobility").
function mobilitySkillNames(setups) {
  return [...new Set((setups || []).filter((setup) => setup.enabled !== false && setup.role !== "support" && (setup.tags || []).includes("Mobility")).map((setup) => setup.name))];
}

function cycleResistReaps(modifierTexts, resolvedMain, activeNames) {
  const mainIsTerra = Boolean(resolvedMain && activeNames.has(resolvedMain.name) && (resolvedMain.tags || []).includes("Terra"));
  return mainIsTerra && modifierTexts.some((line) => line.origin === "trait" && /previous Main Terra Skill hasn't ended, Reaps Damage Over Time/i.test(String(line.text)));
}

function buildLineConditionState({ state, requestedConditions, conditions, lowResources, aura, block, mechanics, curseLimit, modifierTexts, equipment, activeNames, setups, resolvedMain, skillHitSources, talentSlate, pact, heroMemories, earlyBlessings = null, damageSources = [], debuffHitRates = null, yougaMainKey = null, yougaBlockedTangles = [], talentPanels = [], resistances = null, remainingEnergy = 0, nonExclusiveSupports = 0, tangles = null }) {
  // Hero trait audit B2 (2026-10-19): the build-wide "+X% Knockback distance" lines (Endless Frenzy's per-1% count; lines scoped
  // "for the supported skill" or to a skill are not counted: provisional).
  const knockbackDistanceSources = modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).map((line) => ({ line, match: normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(/^([+-]?\d+(?:\.\d+)?)% Knockback distance$/i) })).filter((item) => item.match).map(({ line, match }) => ({ source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1) }));
  const weapon = calculateWeaponAttack({ equipment, disabledSlots: state.disabledEquipmentSlots, modifierTexts });
  const held = [weapon.mainHand?.type, weapon.offHand?.type].filter(Boolean);
  const beam = activeNames.has("Scorching Beam");
  const attackMain = skillHitSources.find((source) => source.setupKey === resolvedMain?.setupKey && source.profile.weaponScaling);
  const speedFactor = (() => { const rate = scorchingBeamCastRate({ talentSlate, equipment, pact }); return rate.baseRate > 0 ? rate.castsPerSecond / rate.baseRate : 1; })();
  const mainUsesPerSecond = beam ? scorchingBeamCastRate({ talentSlate, equipment, pact }).castsPerSecond
    : attackMain ? weapon.attackSpeed?.factor || 0
    : resolvedMain && activeNames.has(resolvedMain.name) ? speedFactor : 0;
  const statTotals = characterStatTotals({ modifierTexts, state, heroMemories });
  const statsByKey = statTotals.byKey;
  // Max Mana / Max Life pools with the level base (src/effective-hp.js rule), for "per 100 Max Mana owned" lines (chunk 3).
  const characterLevelForPools = buildCharacterLevel(state).level;
  const stat = (key) => Number(statsByKey[key]?.value) || 0;
  const lifeStructural = Boolean(lowResources.lowLife), manaStructural = Boolean(lowResources.lowMana);
  const lifeAssumed = !lifeStructural && requestedConditions.lowLifeAssumed === true;
  const manaAssumed = !manaStructural && requestedConditions.lowManaAssumed === true;
  const lifeRemaining = Math.max(0, aura.lifeRemainingPercent ?? 100);
  const manaRemaining = Math.max(0, aura.manaRemainingPercent ?? 100);
  return {
    // Selena (Dance of the Deep): The Paradise I Curse curses enemies inside an active Main Terra Skill (src/selena-dance.js).
    cursed: curseLimit.active.length > 0 || mechanics.curses.active.length > 0 || modifierTexts.some((line) => /Curse upon dealing damage|are cursed by/i.test(line.text)) || resolveDanceOfTheDeep({ state, modifierTexts, resolvedMain, activeNames }).cursed,
    // Curse skills on the dummy (active curse-role setups the curse limit keeps, plus gear-triggered curses), for lines keyed
    // to one curse ("Inflicts Cold Infiltration on enemies cursed by Biting Cold", Broken Dream; src/combat-states.js, 2026-10-18).
    curseSkillNames: [...setups.filter((setup) => isCurseSkill(setup) && setup.enabled !== false && activeNames.has(setup.name)).map((setup) => setup.name), ...(mechanics.curses.active || []).map((curse) => curse?.name ?? curse).filter((name) => typeof name === "string")],
    // Life sealed (aura reservations), for "for every N% Life sealed" lines (Drenched Hem; src/line-conditions.js perLifeSealed).
    lifeSealedPercent: Math.max(0, 100 - lifeRemaining),
    enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), enemyAilmentTypeCount: mechanics.enemyAilments.count,
    // The source that keeps each ailment on the dummy (the first one the enemy-ailment model found), for source lines' badges.
    enemyAilmentSources: Object.fromEntries(mechanics.enemyAilments.types.map((type) => [type.name, type.source])),
    // Gemma (hero trait audit B3; src/hero-trait-modules.js): which source keeps the dummy Frostbitten (Blooming Frost Flower's
    // extra pulses: another source on hit fires them every 2 s) and the build's Curse Effect (Banquet of Bliss's Scorch).
    frostbiteSource: mechanics.enemyAilments.types.find((type) => type.name === "Frostbite")?.source || null,
    curseEffectPercent: mechanics.curses?.effectPercent || 0,
    singleEnemy: true,
    weaponTypes: held,
    weapon: { dualWielding: weapon.dualWielding, twoHanded: weapon.twoHanded, shield: weapon.offHand?.hands === "shield", uniqueTypes: weapon.dualWielding ? new Set(held).size : 0, unarmed: Boolean(weapon.unarmed), offHandEmpty: !weapon.offHand, types: held },
    lifeRemainingPercent: lifeRemaining, manaRemainingPercent: manaRemaining,
    moving: conditions.moving, nearTarget: conditions.nearTarget,
    life: lifeStructural || lifeAssumed ? "low" : "full", lowLifeAssumed: lifeAssumed,
    lifeReason: lifeStructural ? `${Math.round(lifeRemaining * 100) / 100}% Life left after sealing` : lifeAssumed ? "Low Life chosen by the Life group (best case)" : lifeRemaining >= 95 ? "Full Life: the dummy does not attack" : `${Math.round(lifeRemaining * 100) / 100}% Life left after sealing`,
    // Life lost ("for every 1% Life lost", Recklessness): missing Life as a share of unsealed Max Life. Sealed Life is not Life
    // lost (user-confirmed 2026-10-15). The dummy never attacks, so Life is missing only under the Life group's Low Life
    // assumption (best case): current Life at the Low Life threshold (35%), 65% lost. Self-drains (Ghost Slaughter,
    // Recklessness's own cost) are not held as a missing-Life level: no Life pool is simulated.
    lifeLostPercent: lifeAssumed ? 100 - LOW_LIFE_BELOW_PERCENT : 0,
    lifeLostReason: lifeAssumed ? `Low Life chosen by the Life group (best case): Life at ${LOW_LIFE_BELOW_PERCENT}% of unsealed Max Life, ${100 - LOW_LIFE_BELOW_PERCENT}% lost` : lifeStructural ? "sealed Life is not Life lost, and the dummy never attacks" : "the dummy never attacks",
    mana: manaStructural || manaAssumed ? "low" : "full",
    manaReason: manaStructural ? `${Math.round(Math.max(0, aura.manaRemainingPercent ?? 100) * 100) / 100}% Mana left after sealing` : manaAssumed ? "Low Mana chosen by the Mana group (best case)" : manaRemaining >= 95 ? "Full Mana" : `${Math.round(manaRemaining * 100) / 100}% Mana left after sealing`,
    canCrit: beam || skillHitSources.some((source) => !source.profile.weaponScaling || weapon.crit.chancePercent > 0),
    hasReaping: collectAllReapingSources(modifierTexts).length > 0 || cycleResistReaps(modifierTexts, resolvedMain, activeNames) || (state.hero.selectedHeroId === "youga-spacetime-elapse" && modifierTexts.some((line) => /^When dealing damage to enemies in Twisted Spacetime, Reaps /i.test(String(line.text ?? "").trim()))),
    // Youga – Spacetime Illusion / Elapse (hero trait audit B4; src/hero-trait-modules.js): Cooldown Recovery Speed for Me and
    // Myself (the stat sheet's increased total; plain build-wide "additional" lines summed), the character's increased Cast Speed
    // on the stat sheet (Make it Quick before the hit pass), damage over time on the dummy (Twisted Spacetime's cast) and whether
    // the Main Skill can Spell Burst (Telepathy Expert). The hit pass's rates arrive as `yougaSpacetime` (hitRateFacts.youga).
    cooldownRecoverySpeedPercent: stat("cooldownRecoverySpeed"),
    additionalCooldownRecoverySpeedPercent: modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).reduce((sum, line) => { const match = normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(/^([+-]?\d+(?:\.\d+)?)% additional Cooldown Recovery Speed$/i); return sum + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0),
    castSpeedStatPercent: stat("castSpeed"),
    dealsDamageOverTime: mechanics.enemyAilments.types.some((type) => ["Ignite", "Trauma", "Wilt"].includes(type.name)) || damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "skill-dot" && activeNames.has(source.name)) || skillHitSources.some((source) => skillHitDotComponents(source.profile).length > 0),
    // Physical Damage the player deals (Ferocity's "when dealing Physical Damage"; gear affix batch D): a modeled hit with a Physical part
    // after its own conversion, a Physical skill DoT, or Trauma on the dummy.
    dealsPhysicalDamage: skillHitSources.some((source) => (source.profile?.dealtTypes || []).includes("Physical")) || damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "skill-dot" && source.profile.damageType === "Physical" && activeNames.has(source.name)) || mechanics.enemyAilments.types.some((type) => type.name === "Trauma"),
    cooldownSkillActive: skillHitSources.some((source) => (skillHitTiming(source.profile)?.cooldownSeconds || 0) > 0),
    mainCanSpellBurst: Boolean(resolvedMain && activeNames.has(resolvedMain.name) && (resolvedMain.tags || []).includes("Spell")) && modifierTexts.some((line) => /^\+\d+ Max Spell Burst$/i.test(String(line.text ?? "").trim())),
    channeledMain: beam || Boolean(resolvedMain?.tags?.includes("Channeled") && activeNames.has(resolvedMain.name)),
    prebuiltSelfBuffs: requestedConditions.prebuiltSelfBuffs !== false,
    // Hit by an enemy recently: best case by the user's decision (2026-10-12), switched with Blocked recently.
    hitRecently: requestedConditions.blockedRecently !== false,
    // Regain events (src/regain-model.js, 2026-10-14; settled in src/combat-states.js): the Regain stat totals and the
    // self-drain texts of the enabled supports on active skills (Recklessness).
    regainInputs: {
      stats: { lifeRegain: statsByKey.lifeRegain, energyShieldRegain: statsByKey.energyShieldRegain, lifeRegainInterval: statsByKey.lifeRegainInterval, energyShieldRegainInterval: statsByKey.energyShieldRegainInterval },
      supportDrains: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name)).flatMap((setup) => (setup.supports || []).filter((support) => support.enabled !== false).flatMap((support) => (support.effects || []).filter((text) => /of current (?:Life|Energy Shield)(?: and (?:Life|Energy Shield))? will be consumed/i.test(String(text))).map((text) => ({ source: `${support.name} (${setup.name})`, skill: setup.name, text: String(text) }))))
    },
    // Recently moved (Rushed) and after using a Mobility Skill: best-case assumptions held in both movement choices (user rule
    // 2026-10-14), switched by the movedRecently / mobilitySkillUsed conditions; Mobility needs one on the skill board.
    movedRecently: requestedConditions.movedRecently !== false,
    mobilitySkillUsed: requestedConditions.mobilitySkillUsed !== false,
    hasMobilitySkill: mobilitySkillNames(setups).length > 0,
    mobilitySkillNames: mobilitySkillNames(setups),
    // Equipped active skills by tag, for "For every Active <Type> Skill equipped" (Keen Intellect; game node 208 counts the equipped
    // skills with the tag; core audit batch B2): enabled skill-board setups, supports and passive skills left out.
    equippedSkillsByTag: Object.fromEntries(["Empower", "Curse", "Mobility", "Defensive", "Warcry"].map((tag) => [tag, [...new Set(setups.filter((setup) => setup.enabled !== false && setup.role !== "support" && !(setup.tags || []).includes("Passive") && (setup.tags || []).includes(tag)).map((setup) => setup.name))]])),
    // Ice Puppet's Ice Cage (src/combat-states.js): best case held; "icePrison" false leaves it out (pact badge audit 2026-10-13).
    icePrison: requestedConditions.icePrison !== false,
    // Every best-case assumption a timed pact / kismet effect reads (src/combat-states.js conditionOn; Config tab list).
    requestedConditions,
    mainUsesPerSecond,
    castsAttack: setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Attack")),
    hasHasten: modifierTexts.some((line) => /^Has Hasten$/i.test(String(line.text).trim())),
    dealtTypes: new Set(mechanics.penetration?.dealtTypes || []),
    // Damage types the build really deals, for "if you have dealt <Type> Damage recently" (Translucent; core audit batch B2).
    // `dealtTypes` always carries Fire (the penetration ledger's beam / Ignite default), which switched Translucent's
    // "+25% additional Lightning Damage if you have dealt Fire Damage recently" on in builds that deal no Fire (Erika). Fire here
    // needs a Fire source: the beam, an active Fire-tagged skill or hit, added Fire to the build's attacks / spells, or a
    // conversion / gain to Fire (the other types keep the penetration ledger's reading: active skill tags and ailment bases).
    dealtDamageTypes: (() => {
      const types = new Set((mechanics.penetration?.dealtTypes || []).filter((type) => type !== "Fire"));
      const hits = beam || skillHitSources.length > 0;
      const fire = beam || setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && setup.role !== "aura" && setup.role !== "support" && (setup.tags || []).includes("Fire"))
        || skillHitSources.some((source) => (source.profile?.dealtTypes || [source.profile?.damageType]).includes("Fire"))
        || (hits && modifierTexts.some((line) => /^Adds [\d.]+ ?[-–] ?[\d.]+ Fire Damage to (?:your )?(?:Attacks and Spells|Spells|Attacks)$|\b(?:to|as(?: extra)?) Fire Damage\b/i.test(String(line.text).trim())));
      if (fire) types.add("Fire");
      for (const line of modifierTexts) { const added = String(line.text).trim().match(/^Adds [\d.]+ ?[-–] ?[\d.]+ (Physical|Cold|Lightning|Erosion) Damage to (?:your )?(?:Attacks and Spells|Spells|Attacks)$/i); if (added && hits) types.add(added[1][0].toUpperCase() + added[1].slice(1).toLowerCase()); }
      return types;
    })(),
    // Damage types the build's modeled hits deal (Scorching Beam: Fire; generic skill hits: their profile types), for "when
    // hitting an enemy with <Type> Damage" stacking lines (src/line-conditions.js hitsWithType; frost-terra audit 2026-10-13).
    sealedManaCompensationPercent: aura.entries.find((entry) => entry.reservation)?.reservation.globalCompensationPercent ?? 0,
    hitTypes: new Set([...(beam ? ["Fire"] : []), ...skillHitSources.flatMap((source) => source.profile?.dealtTypes || (source.profile?.damageType ? [source.profile.damageType] : []))]),
    // Active modeled Projectile skill hits, for "for each (Spell) Projectile generated recently" stacks (On the Sublime;
    // src/line-conditions.js projectilesGenerated, 2026-10-18).
    projectileSkills: skillHitSources.filter((source) => source.setup?.enabled !== false && activeNames.has(source.setup?.name) && (source.setup?.tags || source.profile?.tags || []).includes("Projectile")).map((source) => ({ name: source.setup.name, spell: (source.setup?.tags || source.profile?.tags || []).includes("Spell") })),
    stats: { strength: stat("strength"), dexterity: stat("dexterity"), intelligence: stat("intelligence"), maxMana: resourcePool(statTotals, "maxMana", baseMana(characterLevelForPools)).value, maxLife: resourcePool(statTotals, "maxLife", baseLife(characterLevelForPools)).value, maxEnergyShield: resourcePool(statTotals, "maxEnergyShield", 0, { defense: true }).value, evasion: resourcePool(statTotals, "evasion", baseEvasion(characterLevelForPools), { defense: true }).value },
    auraCount: new Set((aura.entries || []).filter((entry) => activeNames.has(entry.name)).map((entry) => entry.name)).size,
    // Hero trait audit B2 (2026-10-19): Endless Frenzy's Knockback distance total and Prophecy of Truth's allocated Legendary
    // Medium Talents (talent-panel nodes of type "legendary" with points, replaced nodes left out; slate talents not counted).
    knockbackDistancePercent: knockbackDistanceSources.reduce((sum, item) => sum + item.value, 0),
    knockbackDistanceSources,
    // World Within (src/world-within.js): the effective resistances and the Armor pool (stat sheet, no Aura buffs; provisional).
    worldWithinInputs: { resistances: Object.fromEntries((resistances?.entries || []).map((entry) => [entry.element, entry.effective])), armor: resourcePool(statTotals, "armor", 0, { defense: true }).value },
    legendaryMediumTalentsAllocated: (talentPanels || []).reduce((sum, panel) => sum + (panel.allocatedNodes || []).filter((node) => node.rank > 0 && !node.replacedBy && node.type === "legendary").length, 0),
    // Dark Gate on the board (Dark Advance's "if a Dark Gate has been cast recently"; core audit B7, src/minion-cores.js).
    darkGate: darkGateState({ setups, activeNames, modifierTexts }),
    // Modeled Sentry skills on the board (Heat Up's "if Sentry Skill has been cast recently"; core audit B7).
    sentrySkills: skillHitSources.filter((source) => source.profile?.sentry && source.setup?.enabled !== false && activeNames.has(source.setup?.name)).map((source) => source.setup.name),
    blockChance: { attack: block.attackChance || 0, spell: block.spellChance || 0 },
    // Legendary audit batch 1 (2026-10-22): "… if you have Blocked recently" bodies the block model does not read, and "… while
    // Barrier is active" (Guard keeps Barrier up; src/barrier-sources.js).
    blockRecentlyActive: Boolean(conditions.blockRecentlyActive), barrier: Boolean(conditions.barrier),
    // Lich's Dirge (legendary audit batch 1): the skill board's leftover Energy and its non-Exclusive Support Skills.
    remainingEnergy, nonExclusiveSupports,
    // Enamor's skill-slot rolls (legendary audit batch 2): the active skill board's rows (row 0 = slot 1, the Main Skill's).
    boardSkillRows: skillBoardRows(setups.filter((setup) => setup.enabled !== false && setup.role !== "support"), state.skills.boardSlots, "skills").map((row) => (row ? { name: row.name, tags: row.tags || [] } : null)),
    // Legless Bird's Lament (legendary audit batch 4): "… when equipped with Boots" reads the enabled equipment slots.
    equippedSlots: new Set((equipment?.candidateItems || []).filter((item) => item?.name && !(state.disabledEquipmentSlots || []).includes(item.slot)).map((item) => item.slot)),
    // Chunk 4 (src/hero-trait-modules.js): hero and active skill tags.
    heroId: state.hero.selectedHeroId,
    // The build's follower and its equipped Tartarus Skills (src/follower-model.js, read by src/line-effects.js).
    follower: followerSelection(state),
    activeTags: new Set(setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && setup.role !== "aura" && setup.role !== "support").flatMap((setup) => setup.tags || [])),
    mainIsTerra: Boolean(resolvedMain && activeNames.has(resolvedMain.name) && (resolvedMain.tags || []).includes("Terra")),
    // Activation Medium: Terra (Silencing Severance) for the hero-module badges (src/hero-trait-modules.js).
    activationMediumTerra: resolveActivationMediumTerra({ modifierTexts, mainIsTerra: Boolean(resolvedMain && activeNames.has(resolvedMain.name) && (resolvedMain.tags || []).includes("Terra")) }),
    // Erika (Wind Stalker; src/erika-wind-stalker.js): the build's Stalker clauses and whether an active Attack skill can
    // Multistrike (support or passive Multistrike chance; Mobility, Channeled and Sentry skills cannot). The planner replaces it
    // with the settled state once the hits are computed (resolveWindStalker).
    // Erika – Lightning Shadow (hero trait audit B5; src/erika-traits.js): the character's Movement Speed total (Wild Lightning).
    movementSpeedPercent: stat("movementSpeed"),
    windStalker: windStalkerState({ heroId: state.hero.selectedHeroId, modifierTexts, hero: state.hero, moving: conditions.moving, prebuiltSelfBuffs: requestedConditions.prebuiltSelfBuffs !== false, movementSpeedPercent: stat("movementSpeed"),
      multistrikes: (() => {
        const passiveChance = passiveSupportLines(modifierTexts).multistrike.filter((line) => line.kind === "chance").reduce((sum, line) => sum + line.value, 0);
        return skillHitSources.some((source) => { const setup = source.setup || {}; const tags = new Set(setup.tags || source.profile?.tags || []); return activeNames.has(setup.name) && tags.has("Attack") && !tags.has("Mobility") && !tags.has("Channeled") && !source.profile?.sentry && passiveChance + (setup.supportEffects?.multistrike || []).filter((line) => line.kind === "chance").reduce((sum, line) => sum + line.value, 0) > 0; });
      })() }),
    // Youga – The Ultimate One (src/youga-ultimate-one.js): the build-level Clockwork Core / trait-skill state (no hit rates yet);
    // the planner replaces it with the settled state once the hits are computed (resolveYougaUltimateOne).
    yougaUltimateOne: yougaUltimateOneState({ heroId: state.hero.selectedHeroId, modifierTexts, setups, activeNames, mainSetupKey: yougaMainKey, blockedTangles: yougaBlockedTangles,
      stats: { cooldownRecoverySpeed: stat("cooldownRecoverySpeed"), skillEffectDuration: stat("skillEffectDuration"), skillArea: stat("skillArea"), strength: stat("strength"), dexterity: stat("dexterity"), intelligence: stat("intelligence"),
        afflictionEffectPercent: modifierTexts.reduce((sum, line) => { const match = String(line.text).replace(/\s+/g, " ").trim().match(/^\+(\d+(?:\.\d+)?) ?% Affliction Effect$/i); return sum + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0) },
      conditions: requestedConditions }),
    // Increased Affliction Effect on the character ("+X% Affliction Effect" lines), for "for every +1% Affliction effect" lines
    // (Psychic's Dirge; src/line-conditions.js perAfflictionEffect).
    afflictionEffectPercent: modifierTexts.reduce((sum, line) => { const match = String(line.text).replace(/\s+/g, " ").trim().match(/^\+(\d+(?:\.\d+)?) ?% Affliction Effect$/i); return sum + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0),
    // Chunk 3 (src/combat-states.js): buff, debuff and Blessing facts.
    blessingStacks: Object.fromEntries((earlyBlessings?.entries || []).map((entry) => [entry.name, entry.stacks])),
    // Gear uniques round 2 (src/line-conditions.js): each Blessing's max stacks (Providential Grace) and the Max Spell Burst total,
    // read the way src/skill-hit-model.js reads it (Σ "+N Max Spell Burst"; Law of Greed).
    blessingMaxStacks: Object.fromEntries((earlyBlessings?.entries || []).map((entry) => [entry.name, entry.maxStacks])),
    maxSpellBurst: modifierTexts.reduce((total, line) => { const match = String(line.text).match(/^\+(\d+) Max Spell Burst$/i); return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0),
    beamActive: beam,
    // Grudge's Paralysis chance (src/support-effects.js family "paralysis") on each active, modeled skill hit, with that skill's
    // measured hit rate once the planner's first pass has it (calculatePlannerOnce debuffHitRates; src/combat-states.js).
    chanceParalysis: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && skillHitSources.some((source) => source.setupKey === setup.setupKey)).flatMap((setup) => (setup.supportEffects?.paralysis || []).map((clause) => ({
      setupKey: setup.setupKey, skill: setup.name, support: clause.support, source: clause.source, text: clause.text, level: clause.level, chancePercent: clause.chancePercent,
      // Cripple's fissure Paralysis needs no Curse and follows the fissure's own hit rate (Demolisher-gated).
      ...(clause.fissure ? { fissure: true, needsCurse: false } : {}),
      hitsPerSecond: debuffHitRates?.get(setup.setupKey)?.[clause.fissure ? "fissureHitsPerSecond" : "hitsPerSecond"] ?? null, firstHitSeconds: debuffHitRates?.get(setup.setupKey)?.firstHitSeconds ?? null
    }))),
    // Tags of the active damage skills the build uses on the dummy (the beam and every modeled damage source), for "if you
    // have used a <Tag> Skill recently" (chunk 4).
    activeDamageTags: new Set([...(beam ? setups.find((setup) => setup.name === "Scorching Beam")?.tags || [] : []), ...damageSources.filter((source) => source.status === "modeled").flatMap((source) => setups.find((setup) => setup.setupKey === source.setupKey)?.tags || [])]),
    // Damage types dealt by Spell hits (the beam: Fire; spell skill hits: their dealt types), for "When a Spell hit inflicts
    // <Type> Damage" lines (gear-pact batch chunk 3).
    spellHitTypes: new Set([...(beam ? ["Fire"] : []), ...skillHitSources.filter((source) => (source.setup?.tags || []).includes("Spell")).flatMap((source) => source.profile.dealtTypes || [source.profile.damageType]).filter(Boolean)]),
    mainIsSpell: Boolean(resolvedMain && activeNames.has(resolvedMain.name) && (resolvedMain.tags || []).includes("Spell")),
    // The active Main Skill when it is an Attack (the revived Main Attack Skill family, src/line-conditions.js mainAttackCastsRecently).
    mainAttackSkill: resolvedMain && activeNames.has(resolvedMain.name) && (resolvedMain.tags || []).includes("Attack") ? { name: resolvedMain.name, sentry: (resolvedMain.tags || []).includes("Sentry"), channeled: (resolvedMain.tags || []).includes("Channeled") } : null,
    castsMelee: setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Melee")),
    dealsSpellDamage: beam || skillHitSources.some((source) => (source.setup?.tags || []).includes("Spell")) || setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && setup.role === "main" && (setup.tags || []).includes("Spell")),
    elixirSkill: setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Elixir")),
    // Core audit B8: the active Elixir Skills (src/elixir-model.js) and Warcry Skills with their own cooldown clauses (Storm's
    // Command, src/storm-command.js).
    elixirSetups: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Elixir")).map((setup) => ({ name: setup.name, setupKey: setup.setupKey })),
    // Sage – Licorice Note (hero trait audit B8; src/sage-traits.js): Everlasting Nectar's Max Life / Mana bonuses (increased) and the
    // installed Empower / Curse Skills Pungent Stimulant Salt prepares.
    sageInputs: { maxLifeIncreasedPercent: Number(statsByKey.maxLife?.increased) || 0, maxManaIncreasedPercent: Number(statsByKey.maxMana?.increased) || 0,
      empowerSkills: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Empower")).map((setup) => setup.name),
      empowerModeled: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Empower") && EMPOWER_MODELED_SKILLS.has(setup.name)).map((setup) => setup.name),
      curseSkills: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Curse")).map((setup) => setup.name) },
    // Carino (hero trait audit B9; src/carino-traits.js): the active Projectile skills with a hit model, the increased Attack / Cast /
    // Projectile Speed (Reload Speed, Special Ammo reload chance), the supports on the skill panel (a Special Ammo support there is
    // not consumed) and the Main Skill's enabled Noble supports (Royal Arsenal).
    carinoInputs: { projectileSetups: skillHitSources.filter((source) => (source.setup?.tags || []).includes("Projectile")).map((source) => ({ setupKey: source.setupKey, name: source.setup?.name || source.name })),
      attackSpeedIncreasedPercent: Number(statsByKey.attackSpeed?.increased) || 0, castSpeedIncreasedPercent: Number(statsByKey.castSpeed?.increased) || 0, projectileSpeedPercent: Number(statsByKey.projectileSpeed?.increased) || 0,
      installedSupportNames: setups.filter((setup) => !setup.traitReplaced).flatMap((setup) => (setup.supports || []).filter((support) => !support.granted).map((support) => support.name)),
      mainNobleSupports: resolvedMain && activeNames.has(resolvedMain.name) ? (resolvedMain.supports || []).filter((support) => support.enabled !== false && tlidbSupportCatalogSs13.find((entry) => entry.name === support.name)?.category === "noble").map((support) => support.name) : [] },
    // Rehan (hero trait audit B10; src/rehan-traits.js): the Main Skill (the Seething Spirit casts it), the character level ("per 1
    // levels"), Max Life / Energy Shield (Split Form, Hysteria), the Skill Area bonus (Uncontrolled Anger) and the weapon's Attack Speed
    // bonuses before the derived lines (Rampaging's share for the badges; the Burst source reads the final weapon model).
    rehanInputs: { main: resolvedMain && activeNames.has(resolvedMain.name) ? { setupKey: resolvedMain.setupKey, name: resolvedMain.name, tags: resolvedMain.tags || [] } : null, characterLevel: buildCharacterLevel(state),
      maxLife: resourcePool(statTotals, "maxLife", baseLife(characterLevelForPools)).value, maxEnergyShield: resourcePool(statTotals, "maxEnergyShield", 0, { defense: true }).value, skillAreaPercent: stat("skillArea"), attackSpeed: weapon.attackSpeed || null },
    // Rosa – Unsullied Blade (hero trait audit B11; src/rosa-traits.js): Max Mana (Max Mercury Pts, Utmost Devotion's Mana consumed) and
    // the unsealed share of it (Mystic Mercury and Realm of Mercury read Unsealed Max Mana).
    rosaInputs: { maxMana: resourcePool(statTotals, "maxMana", baseMana(characterLevelForPools)).value, manaUnsealedPercent: manaRemaining },
    warcrySetups: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Warcry")).map((setup) => ({ name: setup.name, setupKey: setup.setupKey, cooldownClauses: (setup.supportEffects?.clauses || []).filter((clause) => clause.family === "cooldown" && Number.isFinite(clause.value)).map((clause) => ({ source: clause.source, text: clause.text, value: clause.value, additional: Boolean(clause.additional) })) })),
    minionsCrit: damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "minion"),
    // A modeled Minion whose skills carry the Spell tag (gear affix batch A: "Gains Spell Aggression when Minion Spells land a Critical Strike").
    minionSpellsCrit: damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "minion" && (MINION_PROFILES[source.profile.minionKey]?.skills || []).some((skill) => (skill.tags || []).includes("Spell"))),
    // Minions the build keeps out (gear affix batch A: "… when you have N Minion(s)"), per modeled Minion at its summon level.
    // Build-wide Combo Points per Starter (gear affix batch B; the Combo condition lines read it).
    comboPoints: comboPointState(modifierTexts),
    minionCount: (() => { const levels = new Map(); for (const source of damageSources) { if (source.status !== "modeled" || source.profile?.engine !== "minion") continue; const level = setups.find((setup) => setup.setupKey === source.setupKey)?.effectiveLevel ?? 20; levels.set(source.profile.minionKey, Math.max(levels.get(source.profile.minionKey) || 0, level)); } let total = 0; for (const [key, level] of levels) total += minionCountOut(MINION_PROFILES[key], level, modifierTexts, { troopMaxMinions: (requestedConditions?.troopMaxMinions ?? requestedConditions?.moduleMaxMinions) !== false }); return total; })(),
    attackHits: skillHitSources.some((source) => source.profile.weaponScaling || (source.setup?.tags || []).includes("Attack")),
    anyHit: beam || skillHitSources.length > 0,
    // Active Spirit Magus summons and their levels, for Origin of Spirit Magus (src/origin-of-spirit-magus.js).
    spiritMagusSummons: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && /^Summon \w+ Magus$/.test(setup.name)).map((setup) => ({ name: setup.name, level: setup.effectiveLevel ?? setup.baseLevel ?? 20 })),
    twoHanded: Boolean(weapon.twoHanded),
    hitErosion: skillHitSources.some((source) => (source.profile.dealtTypes || [source.profile.damageType]).includes("Erosion")),
    // Active (activated) Tangles (src/tangle-model.js): attached to the dummy by the Tangle Skills, or every Tangle on the Clockwork
    // Core. Witch of the Night's "Gains 1 stack of Night Feather Entanglement for every 1 active Tangle" (kismet / pact audit 2026-10-21).
    activeTangles: tangles?.setups?.length ? (tangles.activated || 0) + tangles.setups.filter((setup) => setup.clockworkCore).reduce((sum, setup) => sum + (setup.activated || 0), 0) : 0
  };
}

// The character level a build stores (`hero.characterLevel`, 1–100), else the EHP default (100), flagged as assumed.
export function buildCharacterLevel(state) {
  const stored = Number(state?.hero?.characterLevel);
  return Number.isInteger(stored) && stored >= 1 && stored <= 100 ? { level: stored, stored: true } : { level: EHP_DEFAULTS.characterLevel, stored: false };
}

// Conditional support clauses of the active setups (src/support-effects.js), for the exclusive groups and the assumptions.
function supportConditionClauses(planner) {
  const active = planner.activation?.activeNames || new Set();
  return (planner.activation?.setups || []).filter((setup) => setup.enabled !== false && active.has(setup.name))
    .flatMap((setup) => (planner.supportEffects?.[setup.setupKey]?.clauses || []).filter((clause) => clause.family === "conditionalAdditional").map((clause) => ({ ...clause, skill: setup.name, setupKey: setup.setupKey })));
}

// Core audit batch B4: the enemy-debuff cores' states (src/combat-states.js enemyDebuffCores) and Blunt's Injury Buffer, with the
// recount assumptions they add.
const r4 = (value) => Math.round(value * 10000) / 10000;
function enemyDebuffCoreSummary(cores, modifierTexts) {
  const assumptions = [];
  const { selfDelusion = null, juggernaut = null, openWounds = null, escalatingAffliction = null } = cores;
  if (selfDelusion) assumptions.push({ id: "core:selfDelusion", value: selfDelusion.ccCount, text: selfDelusion.active ? `Self-Delusion: ${selfDelusion.ccCount} crowd control type${selfDelusion.ccCount === 1 ? "" : "s"} on the dummy (${selfDelusion.ccTypes.join(", ")}): +${selfDelusion.value}% additional ${selfDelusion.type} Damage (the crowd control the planner applies; user-confirmed 2026-10-18, provisional until an in-game test).` : "Self-Delusion: no crowd control effect on the dummy, so no bonus." });
  if (juggernaut) assumptions.push({ id: "core:juggernaut", value: juggernaut.stacks, text: `Juggernaut: ${juggernaut.reason}. The 5 s / 20 s windows hold the steady stacks from the first hit (provisional).` });
  if (openWounds) assumptions.push({ id: "core:openWounds", value: openWounds.stacks, text: `Open Wounds: ${openWounds.reason}.` });
  if (escalatingAffliction?.perPointPercent != null) assumptions.push({ id: "core:escalatingAffliction", value: escalatingAffliction.perPointPercent, text: `Escalating Affliction: ${escalatingAffliction.perPointPercent}% additional Damage Over Time taken per Affliction point (expected roll${escalatingAffliction.luckyRolls > 1 ? `, Lucky: best of ${escalatingAffliction.luckyRolls}` : ""}; provisional)${escalatingAffliction.maxDamage?.length ? `; Max Damage bonuses on DoT: ${escalatingAffliction.maxDamage.join("; ")}` : ""}.` });
  const injuryBuffer = (modifierTexts || []).filter((line) => line.origin !== "derived" && /^Enemies \+[\d.]+% Injury Buffer$/i.test(String(line.text ?? "").trim()));
  const blunt = injuryBuffer.length ? { percent: r4(injuryBuffer.reduce((sum, line) => sum + Number(String(line.text).match(/\+([\d.]+)%/)[1]) * (line.multiplier ?? 1), 0)), sources: injuryBuffer.map((line) => line.source) } : null;
  if (blunt) assumptions.push({ id: "core:injuryBuffer", value: blunt.percent, text: `Enemies +${blunt.percent}% Injury Buffer (${blunt.sources.join(", ")}): the dummy takes part of each hit later, so the total and the sustained figures are unchanged (No DPS effect); the 5 s window may read a little less in game (not modeled; audit Q8).` });
  return { selfDelusion, juggernaut, openWounds, escalatingAffliction, blunt, assumptions };
}

// The stat sheet's headline dummy figure: the 20-second average.
const dummyTwentySecondDps = (planner) => planner.damagePaths ? planner.damagePaths.twentySeconds.totalDps : planner.recountOpening?.totalDpsApproximation || 0;
// The dummy recount records which resolved combat conditions it ran with, so the Config tab's
// existing condition controls can flip them. It does not choose conditions itself.
function curseSlotAssumptions(planner) {
  const slots = curseSlotSummary(planner);
  if (!slots || (!slots.applied.length && !slots.duplicates.length)) return [];
  const label = (curse) => curse.kind === "skill" ? `${curse.name} (skill bar)` : `${curse.name} (${curse.source})`;
  // Every curse applies; the ones past the limit are listed as a warning (user decision 2026-10-21).
  return [{ id: "curseSlots", value: slots.applied.map((curse) => curse.name).join(", "), text: `Curse slots (${slots.applied.length}/${slots.maximum}, skill bar order, then gear, then pacts; user-confirmed 2026-10-19): ${slots.applied.map((curse, index) => `${index + 1}. ${label(curse)}`).join("; ") || "none"}${slots.overLimit.length ? `. ${slots.warning}: ${slots.overLimit.map(label).join(", ")} past the limit, applied in the calculation (user decision 2026-10-21)` : ""}${slots.duplicates.length ? `. Not applied, no slot taken: ${slots.duplicates.map((curse) => `${label(curse)}, duplicate of ${curse.name} (${curse.duplicateOf})`).join("; ")}` : ""}.` }];
}

function withRecountConditionAssumptions(recount, groups, planner) {
  if (!recount) return recount;
  const conditions = planner.conditions || {};
  const combat = planner.state.combat || {};
  const flag = (id, label, detail = "") => ({ id: `condition:${id}`, value: Boolean(conditions[id]), text: `${label}: ${conditions[id] ? "active" : "inactive"}${detail}.` });
  return { ...recount, assumptions: [...recount.assumptions,
    { id: "conditionMode", value: combat.conditionMode === "manual" ? "manual" : "automatic", text: `Combat conditions: ${combat.conditionMode === "manual" ? "manual" : "automatic"} mode.` },
    ...groups.map((group) => ({ id: `exclusive:${group.group}`, value: group.chosen, text: `${group.group}: ${group.chosen} (${group.pinned ? `chosen on the Config tab; best case: ${group.best}` : "best case on the 20 s dummy figure"}).` })),
    // "Within 3 s after Blur ends" cannot hold while Blur is active (blur-effects.js ignores it then).
    flag("blur", "Blur"), { ...flag("blurRecentlyEnded", "Within 3 s after Blur ends"), ...(conditions.blur && conditions.blurRecentlyEnded ? { value: false, text: "Within 3 s after Blur ends: inactive (Blur is active)." } : {}) },
    flag("aim", "Aim", conditions.aim && planner.aim?.active ? ` (${planner.aim.uptimeLabel})` : ""),
    flag("idyll", "Idyll", conditions.idyll ? ` (${combat.idyllStacks} stacks)` : ""),
    // Curse slots (user-confirmed 2026-10-19): skill bar curses in bar order, then gear, then pacts and other triggers.
    ...curseSlotAssumptions(planner),
    // Selena hero traits (Selena traits batch 2026-10-13): the states and provisional readings each trait model ran with.
    ...(planner.singWithTheTide?.assumptions || []), ...(planner.danceOfTheDeep?.assumptions || []),
    // Erika (Wind Stalker) Stalker / Hunting Instinct states (src/erika-wind-stalker.js; provisional readings).
    ...(planner.windStalker?.assumptions || []),
    // Youga – The Ultimate One: Clockwork Core, the trait skills, Recall, Governance and Centralization (src/youga-ultimate-one.js;
    // provisional readings).
    ...(planner.yougaUltimateOne?.assumptions || []),
    // Enemy-debuff cores (core audit batch B4): Self-Delusion's crowd control count, Juggernaut's and Open Wounds' stacks, Escalating
    // Affliction's per-point value and Blunt's Injury Buffer.
    ...(planner.enemyDebuffCores?.assumptions || []),
    // Activation Medium: Terra and The Cycle I Resist (Selena Dance traits, user answers 2026-10-13; src/selena-dance.js).
    ...(planner.activationMediumTerra?.active ? [{ id: "dance:activationMediumTerra", value: planner.activationMediumTerra.additionalPercent, text: `Activation Medium: Terra (Silencing Severance; TLIDB): +${planner.activationMediumTerra.additionalPercent}% additional damage for the Main Terra Skill (hits and its own DoT); it triggers the skill when Terra Charge is at max with the dummy within ${planner.activationMediumTerra.triggerMeters} m (no use time); it seals ${planner.activationMediumTerra.sealPercent}% ${planner.activationMediumTerra.sealsLife ? "Life (Drenched Hem)" : "Mana"}, not reduced by Sealed Mana Compensation (user-confirmed 2026-10-13).` }] : []),
    // Activation Medium: Wind Rhythm recasting a Terra DoT (src/selena-dance.js windRhythmTerraTrigger; provisional).
    ...Object.entries(planner.windRhythmTerra || {}).map(([setupKey, wind]) => ({ id: `windRhythmTerra:${setupKey}`, value: wind.intervalSeconds, text: wind.text })),
    // Activation Medium triggers on other DoT skills (src/trigger-interval.js activationMediumDotTrigger; provisional).
    ...Object.entries(planner.dotTriggers || {}).map(([setupKey, trigger]) => ({ id: `dotTrigger:${setupKey}`, value: trigger.intervalSeconds, text: trigger.text })),
    ...(planner.cycleResist ? [{ id: "dance:cycleResist", value: planner.cycleResist.active ? planner.cycleResist.baseReapSeconds : 0, text: planner.cycleResist.active ? `${planner.cycleResist.text}; Reaping Duration applies (game affix 591569216); it settles every DoT on the dummy (user-confirmed 2026-10-13). Every Critical Strike Rating increase / decrease that reaches the Main Terra counts toward Terra Skill Duration (user-confirmed 2026-10-13).` : "The Cycle I Resist: no Reap (no active Main Terra Skill, or the previous Terra has ended at the recast)." }] : []),
    // Sage – Licorice Note (hero trait audit B8; src/sage-traits.js): the Basic Scent Bottle, Scent of Ambition, Everlasting Nectar.
    ...(planner.lineEffects?.state?.sage?.assumptions || []),
    // Carino (hero trait audit B9; src/carino-traits.js): the ammo cadence, Special Ammo / Magic Shot, Heat Up, Deflection, Evil Ouroboros.
    ...(planner.lineEffects?.state?.carino?.assumptions || []),
    // Rehan (hero trait audit B10; src/rehan-traits.js): the Rage cycle, Burst, Tunnel Vision, the Seething Spirit, Disarmed.
    ...(planner.lineEffects?.state?.rehan?.assumptions || []),
    // Rosa (hero trait audit B11; src/rosa-traits.js): the Holy Domain / Murderous Intent state, the Mercury cycle, Mercury Baptism.
    ...(planner.lineEffects?.state?.rosa?.assumptions || []),
    // Bing (hero trait audit B12; src/bing-traits.js): Blast Nova's bombs (Q-H14), Creative Genius's Whimsy / Ingenuity engine.
    ...(planner.lineEffects?.state?.bing?.assumptions || []),
    // Empower Skill effects on other damage (src/empower-effects.js; frost-terra audit 2026-10-13).
    ...(planner.empowerEffects?.entries || []).map((entry) => ({ id: `empower:${entry.kind}:${entry.setupKey}`, value: entry.value, text: entry.text })),
    // Elixir Effects up on the dummy (core audit B8, src/elixir-model.js): uptime from Charging Progress per second only.
    ...(planner.lineEffects?.combat?.elixir?.setups || []).filter((setup) => setup.uptime > 0).map((setup) => ({ id: `elixir:${setup.setupKey}`, value: setup.uptime, text: elixirSetupText(setup, planner.lineEffects.combat.elixir) })),
    { id: "prebuiltSelfBuffs", value: conditions.prebuiltSelfBuffs !== false, text: `Own buffs pre-built before engaging: ${conditions.prebuiltSelfBuffs !== false ? "yes" : "no"}.` },
    barrierAssumption(planner),
    // Flippable best-case assumptions (bestCaseAssumptions below; the Config tab's "Best-case assumptions" list): Hit or blocked
    // recently, the Ice Cage and the other timed pact / kismet effects, Ill Omen beyond the dummy, the Trait Skill on cooldown.
    ...bestCaseAssumptions(planner),
    // Chunk 4 mechanics on modeled skill hits (provisional readings, listed so they can be checked in game).
    ...(planner.skillHits || []).flatMap((hit) => [
      // Shotgun volleys (src/shotgun-effect.js): how many of each volley land on the dummy and the linear falloff total.
      // One entry per strike (2026-10-15 hit-count fix): the typed parts of one strike share its volley (strikeKey).
      ...(hit.components || []).filter((component, index, all) => component.shotgun?.count > 1 && !component.addedOnly && !component.splitPart && all.findIndex((other) => !other.addedOnly && !other.splitPart && (other.strikeKey ?? other.key) === (component.strikeKey ?? component.key)) === index).map((component) => {
        const volley = component.shotgun;
        const where = volley.reach === "fan" ? (volley.nearTarget ? "a fan, standing close; the Distance condition flips it to one at range" : "a fan, standing at range (Distance condition)") : volley.reach === "half" ? "about half aim at the enemy" : "every one lands";
        const basis = component.basis === "observed" ? "observed: Chromatic Shot runs 2026-10-12" : "provisional";
        return { id: `shotgun:${hit.setupKey}:${component.key}`, value: volley.reached, text: `${hit.name} / ${component.label}: ${volley.reached} of ${volley.count} reach the dummy${volley.extraProjectiles ? ` (+${volley.extraProjectiles} projectiles from supports)` : ""} — ${where}. The first hits at 100% and each further one at ${Math.round(volley.factor * 100)}% (linear Shotgun Effect, ×${Math.round(volley.total * 1000) / 1000}; ${basis}).` };
      }),
      hit.rate?.multistrike ? { id: `multistrike:${hit.setupKey}`, value: hit.rate.multistrike.expectedExtraAttacks, text: `${hit.name}: Multistrike ${hit.rate.multistrike.chancePercent}% → ${Math.round(hit.rate.multistrike.expectedExtraAttacks * 100) / 100} extra attacks per attack, +${hit.rate.multistrike.incrementPercent}% per Multistrike count (provisional).` } : null,
      hit.rate?.spellBurst ? { id: `spellBurst:${hit.setupKey}`, value: hit.rate.spellBurst.maxSpellBurst, text: `${hit.name}: Spell Burst ${hit.rate.spellBurst.maxSpellBurst} stack(s), fully charged in ${Math.round(hit.rate.spellBurst.fullChargeSeconds * 1000) / 1000} s (2 s ÷ (1 + Charge Speed) ÷ Π(1 + additional), game manual), activated every ${Math.round(100 / hit.rate.spellBurst.activationsPerSecond) / 100} s = max(charge time, use interval); each activation is the activating cast + ${hit.rate.spellBurst.automaticCastsPerActivation} automatic cast(s), all cast by Spell Burst (game manual). User-confirmed 2026-10-12: automatic casts neither take up nor add to manual cast time; the period is not rounded up to whole use intervals; additional Charge Speed shortens the charge time.` } : null
    ].filter(Boolean)),
    // Activation Medium triggers (src/skill-hit-model.js). Rate 1 / max(trigger interval, effective cooldown): user-confirmed
    // 2026-10-12 (Q2: Frost Shield with Activation Medium: Boss fires every 6 s, its cooldown; a Cooldown Recovery roll on the
    // medium lowers the cooldown). First use at the first trigger stays provisional.
    ...(planner.skillHits || []).filter((hit) => hit.rate?.trigger).map((hit) => ({ id: `trigger:${hit.setupKey}`, value: Math.round(hit.rate.trigger.intervalSeconds * 1000) / 1000, text: `${hit.name}: triggered by ${hit.rate.trigger.source.replace(/^Support: /, "")} every ${Math.round(hit.rate.trigger.intervalSeconds * 1000) / 1000} s, ${Math.round(hit.rate.usesPerSecond * 1000) / 1000} uses/s = 1 / max(interval, cooldown${hit.rate.terraDurationSeconds ? ", Terra duration" : ""}); no use time, triggered uses only (no manual-use penalty). Rate user-confirmed 2026-10-12 (Q2: Frost Shield + Boss every 6 s, its cooldown); first use at the first trigger is provisional.` })),
    // Conditional support lines and the state each one was resolved against (src/support-effects.js).
    ...supportConditionClauses(planner).map((clause) => ({ id: `supportCondition:${clause.setupKey}:${clause.support}:${clause.condition}`, value: clause.active === true, text: `${clause.skill} / ${clause.support}: "${clause.text}" — ${clause.active ? "active" : "inactive"} (${clause.conditionText}).` })),
    // Conditional and per-stat passive lines and the state each one was resolved against (src/line-effects.js, chunk 2).
    ...(planner.lineEffects?.lines || []).filter((line) => !line.listedAs).map((line) => ({ id: `lineCondition:${line.source}:${line.text}`, value: line.active, text: `${line.source}: "${line.text}" — ${line.active ? "active" : line.status === "Not on dummy" ? "not on the dummy" : line.status === "Not modeled" ? "not modeled" : "inactive"} (${line.conditionText})${line.active && line.bodies.some((body) => body.derivedText) ? `; applied as ${line.bodies.map((body) => body.derivedText).filter(Boolean).join(", ")}` : ""}${line.provisional ? "; provisional" : ""}.` })),
    // User-confirmed 2026-10-09: Idyll of the Tide stacks persist while the Tide is up.
    movementAssumption(planner)
  ] };
}

// Barrier is automatic: it holds whenever a Guard-supported channeled skill is in the build
// (barrier-sources.js). User-confirmed 2026-10-10: the Barrier from Guard is permanent in the
// SS21 Selena build, so "when having Barrier" lines (A Corner of Divinity's Tenacity Blessing
// gain) count as active for the whole window. Listed here so the assumption is visible.
function barrierAssumption(planner) {
  const sources = (planner.barrierSources || []).filter((source) => source.available).map((source) => source.source);
  const dependents = (planner.blessings?.entries || []).flatMap((blessing) => blessing.gainSources.filter((source) => /Barrier/i.test(source.text)).map((source) => `${blessing.name} Blessing from ${source.source}`));
  const uses = dependents.length ? `; lines that need Barrier: ${dependents.join(", ")}` : "";
  if (!sources.length) return { id: "condition:barrier", value: false, text: `Barrier: inactive (no Guard-supported channeled skill)${uses}.` };
  return { id: "condition:barrier", value: true, text: `Barrier: active (automatic, ${sources.join(", ")}; Guard's Barrier is permanent, user-confirmed 2026-10-10)${uses}.` };
}

// Blocked / hit recently (user decision 2026-10-12): the training dummy never attacks, but blocking and being hit are common
// while mapping and against bosses, so lines that need them are best-case assumptions, switched together by the Blocked
// recently condition. Listed only when a modeled line depends on them.
function hitOrBlockAssumption(planner) {
  const on = requestedCombatConditions(planner.state?.combat || {}).blockedRecently !== false;
  const uses = [
    ...[...(planner.block?.damageSources || []), ...(planner.block?.ratingSources || [])].map((line) => `${line.source}: ${line.text}`),
    ...(planner.lineEffects?.lines || []).filter((line) => line.condition === "hitByEnemy").map((line) => `${line.source}: ${line.text}`),
    ...(planner.blessings?.entries || []).flatMap((blessing) => (blessing.gainSources || []).filter((source) => HIT_GAIN.test(source.text || "")).map((source) => `${blessing.name} Blessing from ${source.source}`))
  ];
  if (!uses.length) return null;
  return { id: "condition:blockedRecently", value: on, text: `Hit or blocked recently: ${on ? "active (best-case assumption, user decision 2026-10-12: blocking and being hit are common while mapping and against bosses; the training dummy itself never attacks)" : "inactive (condition off)"}; lines: ${[...new Set(uses)].join("; ")}.` };
}

// Best-case assumptions the user can switch off (coordinator design 2026-10-13: one data-driven list with stable ids instead of
// a Config row per effect). Each item carries `toggle` (its condition id; src/combat-condition-mode.js applies the stored
// `combat.bestCaseOverrides`), `label`, `on` (the switch) and `value` (whether it applied). Only the ones that apply to the
// build are listed; the dummy recount assumptions carry the same items.
export function bestCaseAssumptions(planner) {
  const requested = requestedCombatConditions(planner.state?.combat || {});
  const items = [];
  const hit = hitOrBlockAssumption(planner);
  const off = "Off: left out of the dummy figures";
  // Recently moved / after using a Mobility Skill (user rule 2026-10-14): held in both movement choices.
  for (const item of movementBestCase(planner, requested)) items.push(item);
  // Mark on the dummy (src/mark-effect.js; 2026-10-14): always Marked when the build has a Mark source (duration unsourced).
  const mark = planner.mark;
  if (mark?.sources?.length) {
    const on = requested.targetMarked !== false;
    items.push({ id: "condition:targetMarked", toggle: "targetMarked", label: "Dummy always Marked", on, value: Boolean(mark.active), note: !on ? off : mark.active ? `Best case: +${Math.round(mark.critDamageTakenPercent * 100) / 100}% additional Critical Strike Damage taken (Mark, ×(1 + ${Math.round(mark.effectPercent * 100) / 100}% Mark Effect))` : `Not applied: ${mark.reason}`,
      text: `Mark on the dummy: ${!on ? "inactive (condition off)" : mark.active ? `${mark.reason}; ${mark.critOnlyLine?.text || ""}` : `not applied: ${mark.reason}`}.` });
  }
  if (hit) items.push({ ...hit, toggle: "blockedRecently", label: "Hit or blocked recently", on: requested.blockedRecently !== false, note: requested.blockedRecently === false ? off : planner.block?.recentlyActive ? "Best case: hit and blocked recently (common in maps and against bosses)" : "Best case: hit recently · no Block chance, so Blocked recently lines stay off" });
  // Centralize (Ronin core) "Consumes half of current Fervor Rating when hit" (user-confirmed 2026-10-14; src/combat-states.js):
  // best case not hit; its own switch, separate from "Hit or blocked recently".
  const centralize = planner.lineEffects?.combat?.centralize;
  if (centralize?.hasFervor) {
    const on = requested.centralizeNotHit !== false;
    const hitText = `hit at ${centralize.heldRating} Fervor Rating: ${centralize.consumed} consumed, ${centralize.rating} left for every Fervor reader, -${centralize.penaltyPercent}% additional damage (${centralize.perPointPercent}% per point)${centralize.fixed ? "; whether a fixed Rating can be consumed is unknown, assumed yes (provisional)" : " (provisional)"}`;
    items.push({ id: "condition:centralizeNotHit", toggle: "centralizeNotHit", label: "Centralize: not hit (no Fervor consumed)", on, value: on, note: on ? "Best case: not hit, so no Fervor Rating is consumed and no penalty applies" : `Off: ${hitText}`,
      text: `Centralize (${centralize.sources.join(", ")}): ${on ? "not hit (best-case assumption, user-confirmed 2026-10-14: being hit only costs damage), no Fervor Rating consumed, no penalty" : hitText}.` });
  }
  // Synthetic Troop Minions (modules and Synthetic Troop summons; user-supplied / user decision 2026-10-21, src/minion-damage-model.js):
  // up to each summon's max out, best case. The switch was "moduleMaxMinions" first; a saved value of it still counts.
  const troops = (planner.minions || []).filter((minion) => minion?.modeled && minion.troopCount);
  if (troops.length) {
    const on = (requested.troopMaxMinions ?? requested.moduleMaxMinions) !== false;
    const counts = troops.map((minion) => `${minion.summon}: ${minion.count}`).join(", ");
    items.push({ id: "condition:troopMaxMinions", toggle: "troopMaxMinions", label: "Synthetic Troop Minions at their max", on, value: on,
      note: on ? `Best case: ${counts} out (each summon's max, all out before engaging; modules up to 4: user-supplied 2026-10-21, not tested in game)` : `Off: one Minion per summon (${counts})`,
      text: `Synthetic Troop Minions out: ${counts}${on ? " (each summon's max, all summoned before engaging when own buffs are pre-built; modules up to 4 by default: user-supplied 2026-10-21, Google AI Mode answer)" : " (switched off: one per summon)"}.` });
  }
  // Regain events (src/regain-model.js, 2026-10-14): listed when a line reads them ("if you have Regained …", "When Regaining …").
  const regain = planner.lineEffects?.combat?.regain;
  const regainLines = (planner.lineEffects?.lines || []).filter((line) => line.condition === "regained" || /^When Regaining\b/i.test(line.text || "")).map((line) => `${line.source}: ${line.text}`);
  if (regain && regainLines.length) {
    const on = requested.regainEvents !== false;
    const because = regain.missingFrom === "self-drain" ? `missing Life / Energy Shield from self-drain (${regain.drains.filter((drain) => drain.active).map((drain) => drain.source).join(", ")})` : regain.missingFrom === "attack crits" ? `triggered on attack Critical Strike (${regain.drivenBy.join(", ")}; user-stated 2026-10-14)` : "missing Life / Energy Shield from hit recently (best case)";
    items.push({ id: "condition:regainEvents", toggle: "regainEvents", label: "Regain events", on, value: regain.active, note: !on ? off : regain.active ? `Best case: Regains every interval (${regain.ratePerSecond}/s) on hit; ${because}` : `Not applied: ${regain.reason}`,
      text: `Regain events: ${!on ? "inactive (condition off)" : regain.active ? `active (best-case assumption: ${regain.reason})` : `not applied: ${regain.reason}`}; lines: ${[...new Set(regainLines)].join("; ")}.` });
  }
  const ice = iceCageAssumption(planner);
  if (ice) items.push(ice);
  // Aegis of Fire up when a hit lands (defence audit 2026-10-13; src/aegis-of-fire.js): Effective HP only, no damage figure.
  const aegis = aegisOfFireAssumption(planner);
  if (aegis) items.push(aegis);
  // Bard Song (Sing with the Tide; hero trait audit B13, src/selena-leftover-traits.js): the bubble cadence on the non-channeled skills,
  // listed when Selena – Sing with the Tide has such a skill. On: applied (the provisional reading); off: they keep their own casts.
  const bard = planner.singWithTheTide?.bardSong;
  if (bard?.selected && (bard.skills || []).length) {
    const on = requested[BARD_SONG_SWITCH] !== false;
    const names = (planner.skillHits || []).filter((hit) => hit.rate?.bardSong?.bound === "bubble").map((hit) => `${hit.name} (a bubble every ${hit.rate.bardSong.bubbleSeconds} s)`);
    items.push({ id: `condition:${BARD_SONG_SWITCH}`, toggle: BARD_SONG_SWITCH, label: "Bard Song cadence (Sing with the Tide)", on, value: on && names.length > 0,
      note: !on ? "Off: the non-channeled skills keep their own casts" : names.length ? `Reading: ${names.join(", ")}; ${bard.detail} (provisional)` : "Not applied: no skill here casts manually (channeled, Mobility, triggered, rate-driven, Combo, Sentry and Terra-bound skills keep their cadence)",
      text: `Bard Song (hero trait audit B13, provisional): ${!on ? "switched off; the non-channeled skills keep their own casts" : names.length ? `${names.join(", ")}; ${bard.detail}` : "no skill takes the bubble cadence in this build"}.` });
  }
  for (const effect of (planner.lineEffects?.combat?.timedEffects || []).filter((item) => item.toggle && item.id !== "icePrison")) {
    if (items.some((item) => item.toggle === effect.id)) continue;
    const on = requested[effect.id] !== false;
    const same = (planner.lineEffects.combat.timedEffects || []).filter((item) => item.id === effect.id);
    const active = same.some((item) => item.active);
    items.push({ id: `condition:${effect.id}`, toggle: effect.id, label: `${effect.label}${effect.source && effect.source !== effect.label ? ` (${effect.source})` : ""}`, on, value: active, note: !on ? off : active ? `Best case: ${effect.summary}` : `Not applied: ${effect.reason}`,
      text: `${effect.label} (${effect.source}): ${!on ? "inactive (condition off)" : active ? `best case, ${effect.summary || "applied"}` : `not applied: ${effect.reason}`}${on && active ? `; ${effect.reason}` : ""}.` });
  }
  if (planner.illOmen) items.push({ id: "condition:illOmen", toggle: "illOmen", label: "Ill Omen beyond the dummy (Elite loop)", on: requested.illOmen !== false, value: planner.illOmen.main.applied, note: requested.illOmen === false ? off : `Best case: ${planner.illOmen.main.short || "Elite loop"} (the dummy never triggers it)`, text: `${planner.illOmen.main.text} Ominous from ${planner.illOmen.ominousSource}; Cumulative Efficiency ${planner.illOmen.efficiency.percent}%${planner.illOmen.efficiency.capped ? " (capped at 100%)" : ""}.` });
  // Iris Nourishment (src/minion-damage-model.js): the Trait Skill pressed on cooldown; a trait that auto-triggers it forces it on.
  const nourishment = (planner.minions || []).map((minion) => minion.magus?.nourishment).find(Boolean);
  if (nourishment && !nourishment.autoTrait) items.push({ id: "condition:traitSkillOnCooldown", toggle: "traitSkillOnCooldown", label: "Trait Skill pressed on cooldown (Nourishment)", on: requested.traitSkillOnCooldown !== false, value: requested.traitSkillOnCooldown !== false, note: requested.traitSkillOnCooldown === false ? "Off: never cast, no Nourishment" : `Best case: cast every ${nourishment.traitCooldownSeconds ?? 5} s for Nourishment stacks`, text: `Trait Skill: ${requested.traitSkillOnCooldown !== false ? `best case, cast every ${nourishment.traitCooldownSeconds ?? 5} s for Nourishment stacks` : "never cast (condition off)"}.` });
  // Youga – The Ultimate One (src/youga-ultimate-one.js; provisional readings): the trait skills pressed on cooldown (the same
  // switch as Iris' Trait Skill), Recalled projectiles hitting the dummy, and Clockwork Core's every-Tangle-triggers reading.
  const youga = planner.yougaUltimateOne;
  if (youga?.active) {
    const traitNames = ["vault", "descent", "selves"].map((key) => youga.traitSkills?.[key] ? { vault: "Stasis Vault", descent: "Supreme Descent", selves: "Selves of All Realms" }[key] : null).filter(Boolean);
    if (traitNames.length && !items.some((item) => item.toggle === "traitSkillOnCooldown")) {
      const on = requested.traitSkillOnCooldown !== false;
      items.push({ id: "condition:traitSkillOnCooldown", toggle: "traitSkillOnCooldown", label: `Trait Skills pressed on cooldown (${traitNames.join(", ")})`, on, value: on, note: on ? `Best case: each cast at t = 0 and whenever off cooldown${youga.vault ? `; Stasis Vault up ${Math.round(youga.vault.uptime * 1000) / 10}%` : ""}${youga.selves ? `; Selves of All Realms up ${Math.round(youga.selves.uptime * 1000) / 10}%` : ""}` : "Off: never pressed (no Vault, Recall, Chains or Selves)",
        text: `Youga trait skills (${traitNames.join(", ")}): ${on ? "best case, pressed whenever off cooldown (cast at t = 0)" : "never pressed (condition off)"}.` });
    }
    if (youga.core?.applied && youga.traitSkills?.vault && youga.projectile?.canRecall) {
      const on = requested.yougaRecall !== false;
      items.push({ id: "condition:yougaRecall", toggle: "yougaRecall", label: "Recalled projectiles hit the dummy", on, value: on && (youga.solved?.recallHitsPerUse || 0) > 0, note: !on ? "Off: Recalls give Centralization but no extra hit" : `Best case: each Recall is one more full-damage hit (${Math.round((youga.solved?.recallHitsPerUse || 0) * 1000) / 1000} per use; Max Recall Count ${youga.projectile.maxRecall}, base 1 once per trajectory: user-supplied 2026-10-18)`,
        text: `Recall (user-supplied 2026-10-18; the return path crossing the dummy is a best case): ${on ? `a projectile the Core fires inside the Stasis Vault (the player's casts fire nothing: user-decided 2026-10-18) that passes through the dummy, touches the vault and is Recalled hits it again at full damage, once per Recall (${Math.round((youga.solved?.recallHitsPerUse || 0) * 1000) / 1000} extra hits per use)` : "Recalled projectiles are not counted as hitting the dummy (condition off)"}.` });
    }
    if (youga.core?.applied) {
      const on = requested.clockworkTangles !== false;
      items.push({ id: "condition:clockworkTangles", toggle: "clockworkTangles", label: "Clockwork Core: every Tangle triggers the skill", on, value: on, note: on ? `Reading: ${youga.tangles.max} Tangles on the Core, each casting ${youga.main.name} at its casting interval (Core triggers, no Spell Burst; user-supplied 2026-10-18); only the Core triggers hit: the player's casts only summon or move the Core (user-decided 2026-10-18 from game-code evidence)` : "Off: one use per casting interval (the ordinary Tangle reading)",
        text: `Clockwork Core (user-supplied 2026-10-18): ${on ? `${youga.tangles.max} Tangles attached to the Core each trigger ${youga.main.name} at its casting interval; only these Core triggers hit, the player's casts only summon or move the Core (user-decided 2026-10-18 from game-code evidence); Tangle casts cannot activate Spell Burst` : "one use per casting interval (condition off)"}.` });
    }
  }
  // Tangle cadence (core audit B8, src/tangle-model.js): listed when the build activates 2+ Tangles on the dummy ("You can apply N
  // additional Tangle(s) to enemies", Peculiar Vibe); each activated Tangle triggers the Spell at its casting interval.
  const tangles = planner.tangles;
  if (tangles && tangles.activated > 1 && (tangles.setups || []).some((setup) => !setup.clockworkCore)) {
    const on = requested.tangleTriggers !== false;
    items.push({ id: "condition:tangleTriggers", toggle: "tangleTriggers", label: "Every activated Tangle triggers its Spell", on, value: Boolean(tangles.triggers?.applied), note: on ? `Reading: ${tangles.activated} Tangles attached to the dummy, each casting the Spell at its casting interval (uses × ${tangles.activated}; manual rule 1001020420, provisional)` : "Off: one use per casting interval",
      text: `Tangle cadence (core audit B8; provisional): ${tangles.triggers?.text || ""}.` });
  }
  // Command (Mighty Guard; src/minion-cores.js commandState): listed when a Command gain line and a Synthetic Troop Minion are present.
  const command = planner.minionCores?.command;
  if (command && (planner.minions || []).some((minion) => minion.modeled && COMMAND_FAMILIES.includes(minion.family))) {
    const on = requested.fullCommand !== false;
    items.push({ id: "condition:fullCommand", toggle: "fullCommand", label: "Full Command (Mighty Guard)", on, value: on && command.value > 0, note: on ? `Best case: Command at its cap of 100 (+${command.perSecond} per second builds to the cap; user-supplied 2026-10-19), +${command.value}% additional damage for Synthetic Troop Minions` : "Off: no Command held",
      text: `Command (${command.sources.join(", ")}): ${on ? `full Command (${command.points} points × 3% = +${command.value}% additional Synthetic Troop Minion damage; user-supplied 2026-10-19, Google AI Mode answer, not tested in game)` : "no Command held (condition off)"}.` });
  }
  // Storm's Command (core audit B8, src/storm-command.js): each Warcry on the board cast whenever its cooldown is ready.
  const warcry = planner.lineEffects?.combat?.warcry;
  if (warcry?.hasWarcries) {
    const on = requested.warcriesOnCooldown !== false;
    items.push({ id: "condition:warcriesOnCooldown", toggle: "warcriesOnCooldown", label: "Warcries cast on cooldown (Storm's Command)", on, value: Boolean(warcry.active), note: on ? (warcry.active ? `Best case: ${warcry.count} different Warcries cast in the last ${warcry.windowSeconds} s, +${warcry.value}% additional Attack Damage` : `Not applied: ${warcry.reason}`) : "Off: no Warcry cast, no Storm's Command bonus",
      text: `Storm's Command (${warcry.sources.join(", ")}): ${warcry.reason}. The Warcries' own casts are not taken from the main skill's time.` });
  }
  return items;
}

// User rules 2026-10-14: "count those even with standing still because in the real game you are always moving" (recently
// moved lines such as Rushed) and "damage is always active since mobility skills usage is constant with most builds as long as
// they have a mobility skill in their skills somewhere" (after using Mobility Skills lines, Blessing gains). Listed only when a
// modeled line depends on them; each is switched off through combat.bestCaseOverrides.
function movementBestCase(planner, requested) {
  const off = "Off: left out of the dummy figures";
  const lines = (key) => (planner.lineEffects?.lines || []).filter((line) => line.condition === key).map((line) => `${line.source}: ${line.text}`);
  const items = [];
  const moved = lines("movedRecently");
  if (moved.length) {
    const on = requested.movedRecently !== false;
    items.push({ id: "condition:movedRecently", toggle: "movedRecently", label: "Moved recently", on, value: on, note: on ? "Best case: you reposition between attacks, even when standing still is chosen" : off, text: `Moved recently: ${on ? "active (best-case assumption, user rule 2026-10-14: you are always moving in the real game; held even while standing still)" : "inactive (condition off)"}; lines: ${[...new Set(moved)].join("; ")}.` });
  }
  const mobility = [...lines("mobility"), ...(planner.blessings?.entries || []).flatMap((blessing) => (blessing.gainSources || []).filter((source) => /Mobility Skill/i.test(source.text || "")).map((source) => `${blessing.name} Blessing from ${source.source}`)),
    // Pure Heart (src/pure-heart.js): gained on Attack Mobility Skill use, held at max stacks.
    ...(planner.pureHeart?.gainSources || []).map((source) => `${source.source}: ${source.text} (${planner.pureHeart.active ? `Pure Heart held at ${planner.pureHeart.stacks} stacks${planner.pureHeart.damageApplies ? `, ×${Math.round(planner.pureHeart.factor * 1e6) / 1e6} additional Attack Damage on attack hits` : `; ${planner.pureHeart.damageReason}`}` : `Pure Heart inactive: ${planner.pureHeart.reason}`})`)];
  if (mobility.length) {
    const on = requested.mobilitySkillUsed !== false;
    const names = planner.lineEffects?.state?.mobilitySkillNames || [];
    const value = on && names.length > 0;
    items.push({ id: "condition:mobilitySkillUsed", toggle: "mobilitySkillUsed", label: "Mobility Skill used recently", on, value, note: !on ? off : names.length ? `Best case: ${names.join(", ")} used constantly` : "Not applied: no Mobility Skill on the skill board", text: `Mobility Skill used recently: ${!on ? "inactive (condition off)" : names.length ? `active (best-case assumption, user rule 2026-10-14: mobility skill use is constant; ${names.join(", ")} on the skill board)` : "not applied: no Mobility Skill on the skill board"}; lines: ${[...new Set(mobility)].join("; ")}.` });
  }
  return items;
}

// Ice Puppet's Ice Cage (pact badge audit 2026-10-13): listed whenever the build has the pact line, switched by the icePrison
// condition (the Config tab's best-case list). Exported for tests.
export function iceCageAssumption(planner) {
  const cages = planner.lineEffects?.combat?.iceCage || [];
  if (!cages.length) return null;
  const on = requestedCombatConditions(planner.state?.combat || {}).icePrison !== false;
  const active = cages.some((cage) => cage.active);
  const detail = cages.map((cage) => `${cage.source}: ${cage.stacks} × +${cage.perStackPercent}% additional Cold Damage taken${cage.active ? ` (+${cage.valuePercent}% applied)` : ` (not applied: ${cage.reason})`}`).join("; ");
  const ramp = active ? iceCageRampText(cages) : "";
  const note = !on ? "Off: the Ice Cage Cold Damage taken is left out" : active ? `Best case: ${cages[0].stacks} × +${cages[0].perStackPercent}% Cold Damage taken, 1 stack per second from t = 0 in the 5 s / 20 s windows, ${cages[0].stacks} held in sustained figures` : `Not applied: ${cages[0].reason}`;
  return { id: "condition:icePrison", toggle: "icePrison", label: "Ice Cage (Ice Puppet)", on, value: active, note, text: `Ice Cage (Ice Puppet): ${on ? `best case, ${cages[0].stacks} stacks held on a Frostbitten dummy (provisional)` : "inactive (condition off)"}; ${detail}${ramp ? `; ${ramp}` : ""}.` };
}

function movementAssumption(planner) {
  const idyll = "Idyll of the Tide stacks persist while the Tide is up, so standing still does not reduce them";
  const sources = [...(planner.blessings?.entries || []).flatMap((blessing) => blessing.gainSources.filter((source) => source.movement).map((source) => `${blessing.name} Blessing from ${source.source}`)),
    ...supportConditionClauses(planner).filter((clause) => ["standingStill", "moving"].includes(clause.condition)).map((clause) => `${clause.skill} / ${clause.support} (${clause.condition === "moving" ? "while moving" : "while standing still"})`),
    // Passive lines in the Movement group (Static while standing still, Hare's Agility's stacks on leaving Stand Still; core
    // audit batch B2; Q10, user-confirmed 2026-10-18).
    ...[...new Set((planner.lineEffects?.lines || []).filter((line) => line.group === "movement").map((line) => `${line.source} ("${line.text}", ${line.active ? "active" : "inactive"})`))]];
  if (!sources.length) return { id: "movement", value: "no effect", text: `Moving vs standing still: ${idyll}; no other modeled condition depends on movement, so the recount is the same either way.` };
  const moving = planner.conditions?.moving !== false;
  return { id: "condition:moving", value: moving, text: `Moving vs standing still: ${moving ? "moving" : "standing still"}. Movement-dependent sources: ${sources.join(", ")} (movement buffs at max while moving; standing-still buffs only while standing still); ${idyll}.` };
}

export function calculatePlanner(input) {
  const state = normalizePlannerState(input);
  let planner = calculatePlannerOnce(state);
  const assumptions = [];
  if (state.combat.conditionMode !== "manual") {
    let chosenOverrides = {};
    const pins = exclusiveChoicePins(state.combat);
    for (const group of exclusiveConditionGroups) {
      // A choice pinned on the Config tab ("Choices that can't both hold"): the pinned option applies (the state already
      // carries it), and the comparison runs without the pin only to mark which option is the best case.
      const keys = [...new Set(group.alternatives.flatMap((option) => Object.keys(option.overrides)))];
      const pinnedKeys = keys.filter((key) => typeof pins[key] === "boolean");
      if (pinnedKeys.length) {
        const unpinned = withoutExclusiveChoicePins(state, pinnedKeys);
        const base = calculatePlannerOnce(unpinned, chosenOverrides, { skipVariation: true });
        const result = compareExclusiveGroup(group, base, unpinned, chosenOverrides);
        if (!result) continue;
        const pinnedAlternative = result.compared.slice(1).find((option) => Object.entries(option.overrides).every(([key, value]) => pins[key] === value));
        assumptions.push({ group: group.label, chosen: (pinnedAlternative || result.compared[0]).label, best: result.best.label, pinned: true, compared: result.compared });
        continue;
      }
      const result = compareExclusiveGroup(group, planner, state, chosenOverrides);
      if (!result) continue;
      const { best, compared } = result;
      chosenOverrides = { ...chosenOverrides, ...best.overrides };
      planner = best.planner === planner ? planner : calculatePlannerOnce(state, chosenOverrides);
      assumptions.push({ group: group.label, chosen: best.label, best: best.label, compared });
    }
  }
  // Follower buffs the build cannot use (no damage over time / Spell damage / Steep Strike hit) are listed as not applied.
  try { settleFollowerBuffs(planner, plannerEngines(planner)); } catch (error) { planner.warnings.push(`Follower buffs could not be settled (${error?.message || error}).`); }
  let dummyRecount = null;
  try { dummyRecount = withRecountConditionAssumptions(planner.dummyRecount, assumptions, planner); } catch (error) { planner.warnings.push(`Dummy recount assumptions could not be listed (${error?.message || error}).`); }
  let bestCase = [];
  try { bestCase = bestCaseAssumptions(planner); } catch (error) { planner.warnings.push(`Best-case assumptions could not be listed (${error?.message || error}).`); }
  return { ...planner, assumptions, dummyRecount, bestCaseAssumptions: bestCase };
}

// One exclusive group compared on the 20 s dummy figure from `planner` (computed from `state` with `chosenOverrides`).
// Each compared entry carries the condition overrides that select it (the default's are the alternatives' keys negated), so
// the Config tab can pin an option by storing them in combat.bestCaseOverrides.
function compareExclusiveGroup(group, planner, state, chosenOverrides) {
  const alternatives = group.alternatives.filter((option) => option.possible(planner));
  if (!alternatives.length) return null;
  const defaultLabel = typeof group.defaultLabel === "function" ? group.defaultLabel(planner) : group.defaultLabel;
  const defaultOverrides = Object.fromEntries(alternatives.flatMap((option) => Object.entries(option.overrides)).map(([key, value]) => [key, !value]));
  let best = { label: defaultLabel, planner, figure: dummyTwentySecondDps(planner), overrides: {} };
  const compared = [{ label: defaultLabel, twentySecondDps: best.figure, overrides: defaultOverrides }];
  for (const option of alternatives) {
    // The Monte Carlo variation is display-only and most of a pass's cost, so the
    // comparison skips it; a winning alternative is recomputed in full by the caller.
    const candidate = calculatePlannerOnce(state, { ...chosenOverrides, ...option.overrides }, { skipVariation: true });
    const figure = dummyTwentySecondDps(candidate);
    compared.push({ label: option.label, twentySecondDps: figure, overrides: option.overrides });
    if (figure > best.figure) best = { label: option.label, planner: candidate, figure, overrides: option.overrides };
  }
  return { best, compared };
}

// Pinned exclusive choices in automatic mode: the Config tab stores them in combat.bestCaseOverrides ("Reset to best case"
// clears them); a saved nearTarget false in the conditions applies in automatic mode too (Chromatic Shot run C).
function exclusiveChoicePins(combat = {}) {
  const pins = {};
  if (combat.conditions?.nearTarget === false) pins.nearTarget = false;
  for (const [key, value] of Object.entries(combat.bestCaseOverrides || {})) if (typeof value === "boolean") pins[key] = value;
  return pins;
}

function withoutExclusiveChoicePins(state, keys) {
  const strip = (map = {}) => Object.fromEntries(Object.entries(map).filter(([key]) => !keys.includes(key)));
  return { ...state, combat: { ...state.combat, conditions: strip(state.combat.conditions), bestCaseOverrides: strip(state.combat.bestCaseOverrides) } };
}

function calculatePlannerOnce(input, conditionOverrides = {}, { skipVariation = false, debuffHitRates = null, hitRateFacts = null } = {}) {
  const requestedSkipVariation = skipVariation;
  const normalizedState = normalizePlannerState(input);
  // Pact page limits (src/pact-limits.js; user decision 2026-10-21, a hard game rule): a saved or imported page past the Pact Point
  // budget or the 9 Micro / 4 Medium Destiny install limits keeps everything stored, and the calculation leaves the extra nodes and
  // kismets out (outermost first). The character level is the build's, else 100 (buildCharacterLevel).
  const pactLimits = resolvePactLimits(normalizedState.pacts, buildCharacterLevel(normalizedState));
  const state = pactLimits.effectivePacts === normalizedState.pacts ? normalizedState : { ...normalizedState, pacts: pactLimits.effectivePacts };
  // The Life and Mana group choices are manual-mode switches (Config tab); automatic mode resolves them by damage. A saved
  // nearTarget false still applies in automatic mode (Chromatic Shot run C, tests/chromatic-shot-dummy-reference.test.js).
  const requestedBase = requestedCombatConditions(state.combat);
  // A Life / Mana choice pinned on the Config tab (combat.bestCaseOverrides) stays.
  if (state.combat.conditionMode !== "manual") for (const key of ["lowLifeAssumed", "lowManaAssumed"]) if (typeof state.combat.bestCaseOverrides?.[key] !== "boolean") delete requestedBase[key];
  const requestedConditions = { ...requestedBase, ...conditionOverrides };
  const heroMemories = calculateHeroMemories(state.hero);
  const equipped = state.equippedSlateIds ?? slates.slates.map((slate) => slate.id);
  const talent = resolveTalentCandidate(talents, catalogue, state.talentRanks, state.talents);
  // A bare core-name affix ("Daze" on the captured Pedigree of Gods) is that core: written out in the slate core form, it is applied
  // and deduplicated like any slate core (user request 2026-10-21).
  const resolvedSlate = ((candidate) => ({ ...candidate, setup: { ...candidate.setup, slates: withExpandedBareSlateCores(candidate.setup.slates) } }))(resolveSlateCandidate(slates, equipped, state.slates));
  // Core talents never stack (user rule 2026-10-21; src/granted-core-lines.js resolveCoreCopies): one copy per core name, the talent
  // panel's first, then the placed slates', then belt blends', then other items'. The other copies leave the slates and the item
  // lines every reader sees (their badges read Inactive "core already active from …").
  let equipment = calculateEquipmentCandidate(gear.items, state.equipmentOverrides, snapshots[0], state.disabledEquipmentSlots);
  const coreSlatePlacements = state.slates.placements || slates.capturedPlacements;
  const coreCopies = resolveCoreCopies({
    panelCores: [...talent.activeCores],
    slates: resolvedSlate.setup.slates.filter((item) => equipped.includes(item.id) && coreSlatePlacements?.[item.id]),
    items: equipment.candidateItems.map((item) => ({ item, lines: effectiveGearModifierTexts(item) }))
  });
  const slate = coreCopies.slateAffixes.size ? { ...resolvedSlate, setup: { ...resolvedSlate.setup, slates: withoutInactiveSlateCores(resolvedSlate.setup.slates, coreCopies.slateAffixes) } } : resolvedSlate;
  if (coreCopies.gearLines.size) equipment = calculateEquipmentCandidate(gear.items, state.equipmentOverrides, snapshots[0], state.disabledEquipmentSlots, coreCopies.gearLines);
  const talentSlate = calculateTalentSlateCandidate({ talentSetup: talents, talentRanks: state.talentRanks, slateSetup: slates, equippedSlateIds: equipped, snapshot: snapshots[0], candidateTalentSetup: talent.setup, candidateSlateSetup: slate.setup });
  const offTheBeatenTrackTalent = talent.activeCores.has("Off The Beaten Track");
  // An equipped slate counts only once placed on the board, like every other slate line (levelSources.slates; core audit batch
  // B1, F7: before, an equipped but unplaced Pedigree core still fixed the Support Mana Multiplier).
  const offTheBeatenTrackSlate = slate.setup.slates.some((item) => equipped.includes(item.id) && (state.slates.placements || slates.capturedPlacements)?.[item.id] && slateTalentLines(item).some((effect) => /off the beaten track/i.test(effect)));
  const levelSources = {
    gear: equipment.allItems.filter((item) => !state.disabledEquipmentSlots.includes(item.slot)),
    talents: talent.setup.panels.map((panel) => {
      const source = catalogue[panel.name];
      const allocatedNodes = panel.allocatedNodes.map((node) => {
        const original = source?.nodes.find((entry) => String(entry.coordinate) === String(node.reflectedFrom || node.coordinate));
        return { ...original, ...node, description: node.description || original?.description || "" };
      });
      const points = allocatedNodes.reduce((sum, node) => sum + node.rank, 0);
      // talent.activeCores (src/candidate-sources.js) already drops a core that an Ethereal Prism on this panel replaces (or a
      // captured core replacement); without that check the replaced core's text still reached the text readers (core audit
      // 2026-10-18, research/core-talents-audit-2026-10-18.md).
      const activeCores = (source?.coreTalents || []).filter((core) => points >= core.unlockPoints && state.talents.coreSelections[`${panel.name}:${core.unlockPoints}`] === core.name && talent.activeCores.has(core.name));
      return { ...panel, allocatedNodes, activeCores };
    }),
    slates: slate.setup.slates.filter((item) => equipped.includes(item.id) && (state.slates.placements || slates.capturedPlacements)?.[item.id])
  };
  const pact = calculatePactCandidate(pacts, state.pacts, snapshots[0]);
  const modifierTexts = collectModifierTexts({ equipment, disabledSlots: state.disabledEquipmentSlots, talents: levelSources.talents, slates: levelSources.slates, talentState: state.talents, pactState: state.pacts, heroMemories });
  // Cores granted outside the panel (core audit batch B1, research/core-talents-audit-2026-10-18.md; Q4, user-confirmed
  // 2026-10-18): a Pedigree of Gods slate core or a "[Core]" gear grant of a core the planner reads by name (Affliction,
  // Subtle Impact, Indifference, True Flame, Fueling, Starfire) joins the panel's core names, once per name.
  const grantedCores = grantedCoreNames(modifierTexts);
  // A core kept from a slate is applied as the panel copy (user rule 2026-10-21), so it joins the core names the models read by name.
  const coreNames = new Set([...talent.activeCores, ...grantedCores.keys(), ...[...coreCopies.active].filter(([, copy]) => copy.kind === "slate").map(([name]) => name)]);
  const offTheBeatenTrackGear = !offTheBeatenTrackTalent && !offTheBeatenTrackSlate && grantedCores.has("Off The Beaten Track");
  const offTheBeatenTrack = offTheBeatenTrackTalent || offTheBeatenTrackSlate || offTheBeatenTrackGear;
  // Follower (2026-10-15; src/follower-model.js): its plain player lines (a named follower's "The Follower and allies have Spell
  // Aggression") join the build's lines as origin "follower", read like the same gear line; its modeled Tartarus Skill buffs are
  // resolved with the other line effects (src/line-effects.js) behind their best-case switches.
  modifierTexts.push(...followerModifierTexts(state));
  // Hero traits (talent batch chunk 4, §6.2): the selected traits' lines join the build's lines (origin "trait"), so plain
  // clauses ("+38% additional damage", Carino: Zealot of War) reach every engine and the hero modules
  // (src/hero-trait-modules.js) read theirs. Selena: Sing with the Tide keeps its dedicated model (src/planner.js Tide
  // conditions, src/scorching-beam-hit.js, src/sea-foam-nocturne.js): none of its lines join, so nothing is counted twice.
  // Non-memory "+N to [Non-Base] Hero Trait Level" lines (src/character-stats.js heroTraitLevelBonus) raise the 45/60/75
  // trait levels, max 5; a memory's own line raises only its slot's trait (user-observed 2026-10-13).
  const traitLevelBonus = heroTraitLevelBonus(modifierTexts);
  // Artificial Moon (src/hero-memory-rules.js artificialMoonGate): the base trait's level is 0 + the base-slot memory's bonus
  // + that memory's own "+N to Hero Trait Level" (user-confirmed 2026-10-13).
  heroMemories.artificialMoonGate = artificialMoonGate(state.hero);
  heroMemories.artificialMoon = heroMemories.artificialMoonGate.active;
  if (state.hero.selectedHeroId !== "selena-sing-with-the-tide") modifierTexts.push(...heroTraitStatLines(state, heroMemories.baseTraitLevel, traitLevelBonus, { artificialMoon: heroMemories.artificialMoon }));
  // Per-level lines ("-1% additional Elemental Damage for every 3 level(s)", Brutality core; talent batch T5): resolved
  // into a plain line every engine reads, with `derivedFrom` naming the original clause (badges). Provisional (Q13):
  // "level" read as character level: the build's `hero.characterLevel` when the state has one, else the EHP default
  // (100), listed as an assumption.
  const provisionalLineReadings = [];
  const characterLevel = buildCharacterLevel(state);
  for (const line of [...modifierTexts]) {
    // "+3 Strength per 4 level(s)" (False God's Skin stat buff rolls): a flat stat per character-level step.
    const statMatch = String(line.text).match(/^([+-]?\d+(?:\.\d+)?) (Strength|Dexterity|Intelligence) per (\d+) level\(s\)\.?$/i);
    if (statMatch) {
      const steps = Math.floor(characterLevel.level / Number(statMatch[3]));
      const value = Math.round(Number(statMatch[1]) * steps * (line.multiplier ?? 1) * 10000) / 10000;
      const text = `${value >= 0 ? "+" : ""}${value} ${statMatch[2]}`;
      modifierTexts.push({ ...line, text, multiplier: 1, derivedFrom: line.text, lineEffect: { kind: "perLevel" } });
      provisionalLineReadings.push({ id: `perLevel:${line.source}:${statMatch[2]}`, value, text: `${line.source}: "${line.text}" read as ${text} (character level ${characterLevel.level}${characterLevel.stored ? " from the build" : " assumed: the build stores no character level"}).` });
      continue;
    }
    const match = String(line.text).match(/^([+-]?\d+(?:\.\d+)?)% (additional )?(.*?)Damage for every (\d+) level\(s\)\.?$/i);
    if (!match) continue;
    const steps = Math.floor(characterLevel.level / Number(match[4]));
    const value = Math.round(Number(match[1]) * steps * (line.multiplier ?? 1) * 10000) / 10000;
    const text = `${value >= 0 ? "+" : ""}${value}% ${match[2] || ""}${match[3]}Damage`;
    modifierTexts.push({ ...line, text, multiplier: 1, derivedFrom: line.text, lineEffect: { kind: "perLevel" } });
    provisionalLineReadings.push({ id: `perLevel:${line.source}`, value, text: `${line.source}: "${line.text}" read as ${text} (character level ${characterLevel.level}${characterLevel.stored ? " from the build" : " assumed: the build stores no character level"}; "level" read as character level, provisional, talent batch Q13).` });
  }
  // Rotating buffs (Kaleidoscope): each "+X% additional … Damage" is read at its time average X / k by the gear intake
  // (src/gear-unique-modules.js averageRotatingBuffs). Provisional (survey Q5: best case in the 5 s window is open).
  for (const item of equipment.candidateItems || []) {
    if ((state.disabledEquipmentSlots || []).includes(item.slot)) continue;
    for (const row of [...(item.modifiers || []), ...(item.corrosionModifiers || [])]) {
      const rotation = rotatingBuffRow(row);
      if (rotation) provisionalLineReadings.push({ id: `rotatingBuffs:${item.name}`, value: rotation.uptime, text: `${item.name}: the ${rotation.buffs.length} buffs it gains by turns (${rotation.seconds} s each) are read at their time average, 1/${rotation.buffs.length} uptime each: ${rotation.averaged.join("; ")} (provisional; the best case would hold one buff for the whole 5 s window).` });
    }
  }
  const profile = skills.energyProfile;
  const setupSources = [...skills.setups, ...(state.skills.customSetups || [])];
  const catalogSkillsByName = new Map(tlidbSkillCatalogSs13.map((entry) => [entry.name, entry]));
  const catalogSupportsByName = new Map(tlidbSupportCatalogSs13.map((entry) => [entry.name, entry]));
  // Supports item lines grant to the Main Skill (src/gear-unique-modules.js; gear-pact batch chunk 4): "The Main Skill is
  // supported by Lv. N X" and Lonesome's single-Ring grant. They join the first enabled main setup at their fixed level and
  // take no support slot. Cataclysm on Scorching Beam keeps its Ignite-ledger path (build-mechanics grantedSupports).
  const itemGrantedSupports = grantedMainSkillSupports(modifierTexts, equipment, state.disabledEquipmentSlots);
  const grantTargetKey = (() => { const target = setupSources.find((item) => item.role === "main" && state.skills.setupEnabled?.[item.instanceId || item.name] !== false); return target ? target.instanceId || target.name : null; })();
  // Empty skill-board slots for "+N … Skill Level for each empty … Skill Slot" (Necklace of Inverse; src/skill-level-bonuses.js):
  // the board holds 5 skill slots and 4 Aura slots (src/skill-board-slots.js); the Aura slots stand for the Passive Skill slots.
  const boardEnabled = setupSources.filter((item) => state.skills.setupEnabled?.[item.instanceId || item.name] !== false);
  // The Aura-slot rows in board order (row 0 = the first Passive Skill slot), for row-scoped passive grants (Headless Crown).
  const passiveBoardRows = skillBoardRows(boardEnabled.map((item) => ({ ...item, setupKey: item.instanceId || item.name, enabled: true })), state.skills.boardSlots, "auras");
  // A trait skill (src/trait-board-grants.js: Youga's Stasis Vault, Supreme Descent, Selves of All Realms) fills its Active
  // Skill slot, so a slot the user left empty is no longer empty.
  const traitGrantLines = traitBoardGrantLines(modifierTexts);
  const traitFilledRows = traitGrantLines.slots.length ? emptyRowsFilledByGrants(traitGrantLines, skillBoardRows(boardEnabled.map((item) => ({ ...item, setupKey: item.instanceId || item.name, enabled: true })), state.skills.boardSlots, "skills")) : 0;
  levelSources.emptySkillSlots = { passive: Math.max(0, 4 - boardEnabled.filter((item) => setupBoardTab(item) === "auras").length), active: Math.max(0, 5 - boardEnabled.filter((item) => setupBoardTab(item) === "skills" && item.role !== "support").length - traitFilledRows) };
  // Auras item lines grant ("You have a Lv. 20 Precise Cruelty.", Lone Walker's Boots' chosen roll; src/gear-unique-modules.js
  // grantedPreciseAuras). User-confirmed 2026-10-13: while the item is equipped the Aura is always active, needs no energy and
  // seals no Mana or Life; it is not a skill-board setup (kept off the board and the setup count). It joins the Aura ledger
  // below (grantedAuraSetups), at the item's fixed level with no supports.
  const allItemGrantedAuras = grantedPreciseAuras(modifierTexts).filter((grant) => catalogSkillsByName.get(grant.name)?.tags?.includes("Aura"));
  // A grant with a Full Mana condition ("… when at Full Mana" / "when not at Full Mana"; legendary audit batch 2) is settled against the
  // Aura ledger's Mana below (conditionalAuraGrants); the unconditional ones are always active.
  const itemGrantedAuras = allItemGrantedAuras.filter((grant) => !grant.condition);
  const grantedSetupFor = (grant) => ({ ...catalogSkillsByName.get(grant.name), name: grant.name, setupKey: `granted:${grant.name}`, role: "aura", granted: true, grantSource: grant.source, grantText: grant.text, grantCondition: grant.condition || null, baseLevel: grant.level, addedLevels: 0, effectiveLevel: grant.level, levelBonusSources: [], supports: [], enabled: true, energyCost: 0 });
  const conditionalGrantedAuras = allItemGrantedAuras.filter((grant) => grant.condition && !itemGrantedAuras.some((item) => item.name === grant.name));
  const grantedAuraSetups = itemGrantedAuras.filter((grant, index, list) => list.findIndex((item) => item.name === grant.name) === index).map((grant) => ({ ...catalogSkillsByName.get(grant.name), name: grant.name, setupKey: `granted:${grant.name}`, role: "aura", granted: true, grantSource: grant.source, grantText: grant.text, baseLevel: grant.level, addedLevels: 0, effectiveLevel: grant.level, levelBonusSources: [], supports: [], enabled: true, energyCost: 0 }));
  // A setup's supports from the stored state (saved setup supports, customSupports, supportOrder, levels, configs, enabled flags
  // under the setup's key) with the occupied support sockets. Shared by the board setups and the trait-granted skills
  // (src/trait-board-grants.js: Youga's trait skills take supports under their own key `trait:<skill>`, 2026-10-15 user answer).
  function resolveSetupSupports(setup, setupKey, ownSupports, grants = [], capturedSlotFallback = null) {
    const supports = [...ownSupports.filter((support) => !grants.some((grant) => grant.name === support.name)), ...grants.map((grant) => ({ name: grant.name, level: grant.level, granted: true, grantSource: grant.source, grantText: grant.text }))].map((support) => {
      const key = `${setupKey}:${support.name}`;
      const defaultConfig = defaultConfigurableSupportConfig(support.name, support.effects);
      const savedConfig = normalizeProgressionSupportConfig(support.name, state.skills.specialSupportConfigs[key]);
      const specialConfig = defaultConfig ? { ...defaultConfig, ...(Number.isFinite(support.stars) ? { stars:support.stars } : {}), ...(savedConfig || {}) } : savedConfig;
      const baseLevel = support.granted ? support.level : clampBaseLevel(state.skills.supportLevels[key] ?? support.level ?? 1);
      // An item grant's level is fixed (user-confirmed for Cataclysm 2026-10-10: Support Skill Level does not raise it).
      const sourceBonus = support.granted ? { total: 0, contributions: [] } : skillLevelBonus({ ...support, role: "support", tags: ["Support", ...(catalogSupportsByName.get(support.name)?.tags || [])] }, levelSources);
      const leveled = { ...support, level: baseLevel, baseLevel, addedLevels: sourceBonus.total, effectiveLevel: baseLevel + sourceBonus.total };
      const effects = supportEffectsAtLevel(leveled, catalogSupportsByName.get(support.name));
      if (progressionSupportTierData(support.name) && specialConfig) effects.push(`Configured T${specialConfig.tier} affix: ${progressionSupportText(support.name,specialConfig)}`);
      return { ...leveled, effects, levelBonusSources: sourceBonus.contributions, enabled: support.granted ? true : state.skills.supportEnabled[key] ?? !state.disabledSupportNames.includes(support.name), ...(specialConfig ? { specialConfig, tier: specialConfig.tier, roll: specialConfig.roll, ...(Number.isFinite(specialConfig.stars) ? { stars: specialConfig.stars, starAdditionalDamagePercent: specialSupportStarBonus(specialConfig.stars) } : {}) } : {}) };
    });
    // A support the game does not allow on this skill (src/support-compatibility.js installedSupportRejected: the support
    // stone's include / exclude tag groups, src/data/skills/support-eligibility-ss13.generated.js) stays saved in state but
    // feeds nothing: `enabled` is derived false here only (state.skills.supportEnabled is never written), `savedEnabled`
    // keeps the user's flag for the support card, and `incompatible` drives the coverage badge.
    const catalogSkill = catalogSkillsByName.get(setup.name);
    supports.forEach((support, supportIndex) => {
      if (support.granted || !catalogSkill || !installedSupportRejected(catalogSupportsByName.get(support.name), catalogSkill, supports)) return;
      supports[supportIndex] = { ...support, enabled: false, incompatible: true, savedEnabled: support.enabled };
    });
    const hasExplicitSupportOrder = Object.hasOwn(state.skills.supportOrder, setupKey);
    const supportOrder = state.skills.supportOrder[setupKey] || [];
    supports.sort((a, b) => {
      const ai = supportOrder.indexOf(a.name), bi = supportOrder.indexOf(b.name);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
    const enabledSupports = supports.filter((support) => support.enabled && !support.granted);
    const occupiedSlots = Array.from({ length: 5 }, () => false);
    if (hasExplicitSupportOrder) {
      const enabledNames = new Set(enabledSupports.map((support) => support.name));
      supportOrder.slice(0, 5).forEach((name, slot) => { if (enabledNames.delete(name)) occupiedSlots[slot] = true; });
    } else {
      const capturedSlots = Math.max(0, Math.min(5, capturedSlotFallback ?? setup.enabledSupportSlots ?? enabledSupports.length));
      occupiedSlots.fill(true, 0, capturedSlots);
    }
    return { supports, occupiedSlots };
  }
  const setups = setupSources.map((savedSetup, index) => {
    const setup = { ...(catalogSkillsByName.get(savedSetup.name) || {}), ...savedSetup };
    const setupKey = setup.instanceId || setup.name;
    const levels = state.skills.skillLevels[setupKey] || {};
    const ownSupports = [...setup.supports, ...(state.skills.customSupports[setupKey] || [])];
    // Main-skill grants on the main setup; "All Passive Skill slots are supported by …" grants (gear affix batch C) on every Aura-slot setup.
    const grantFits = (grant) => grant.active && catalogSupportsByName.has(grant.name) && !(grant.name === "Cataclysm" && setup.name === "Scorching Beam") && !ownSupports.some((support) => support.name === grant.name && (support.level ?? 1) >= grant.level);
    // Headless Crown's "The first / last N Passive Skill slots …" (legendary audit batch 2): the setup's row among the 4 Aura-slot rows.
    const passiveRow = passiveBoardRows.findIndex((row) => row && (row.instanceId || row.name) === setupKey);
    const rowFits = (grant) => !grant.rows || (grant.rows.first != null ? passiveRow >= 0 && passiveRow < grant.rows.first : grant.rows.last != null ? passiveRow >= 4 - grant.rows.last : true);
    const grants = [...(setupKey === grantTargetKey ? itemGrantedSupports.filter((grant) => !["passive", "tag"].includes(grant.target) && grantFits(grant)) : []), ...(setupBoardTab(setup) === "auras" ? itemGrantedSupports.filter((grant) => grant.target === "passive" && grantFits(grant) && rowFits(grant)) : []),
      ...(setupBoardTab(setup) !== "auras" ? itemGrantedSupports.filter((grant) => grant.target === "tag" && (setup.tags || []).includes(grant.tag) && grantFits(grant)) : [])];
    const { supports, occupiedSlots } = resolveSetupSupports(setup, setupKey, ownSupports, grants, profile.enabledSupportSlotsBySetup[index]);
    const slots = occupiedSlots.filter(Boolean).length;
    const baseLevel = clampBaseLevel(levels.baseLevel ?? setup.baseLevel);
    // Minion / Synthetic Troop / Spirit Magus Skill Level (talent batch chunk 4; user decision 2026-10-22 for Minion: it raises every
    // Summon skill, src/skill-level-bonuses.js): the level of the skill that summons a modeled Minion of that family (modules count
    // as Synthetic Troops), via its tags.
    const summoned = inferDamageProfile(setup);
    const minionFamily = summoned?.engine === "minion" ? (MINION_PROFILES[summoned.minionKey]?.family || null) : null;
    const levelTags = minionFamily ? [...(setup.tags || []), "Minion", ...(minionFamily === "module" ? ["Synthetic Troop"] : minionFamily === "spirit-magus" ? ["Spirit Magus"] : [])] : setup.tags;
    // Iris 1 / 2: a Spirit Magus in an active skill slot also takes "+N Active Skill Level" lines (user-confirmed 2026-10-19;
    // src/magus-active-slot.js magusTakesActiveSkillLevels). An Aura-slot Magus does not; other heroes leave the setup inactive.
    const activeSlotMagus = magusTakesActiveSkillLevels(setup, state.hero?.selectedHeroId);
    const sourceBonus = skillLevelBonus({ ...setup, tags: levelTags, activeSlotMagus }, levelSources);
    // Core audit B7 (Q11, settled from the game data): "+N Minion / Synthetic Troop / Spirit Magus Skill Level" (game affixes
    // 101080039 / 126530 / 557054) write the skill level field 2006400 on skills with the Minions (6000340) / Synthetic Troop
    // (6000320) / Spirit Magus (6000330) tag, which every Synthetic Troop and Spirit Magus summon stone carries (game stone tags,
    // src/data/skills/support-eligibility-ss13.generated.js): sourced there. A Module's setup is one of its Minion skills (the Module
    // stone is not in the catalog), so it stays provisional (Q9).
    const levelTagIds = { minion: 6000340, "synthetic troop": 6000320, "spirit magus": 6000330 };
    const stoneTags = new Set(skillGameTagsSs13[setup.name]?.tags || []);
    if (minionFamily) for (const entry of sourceBonus.contributions) {
      const kind = String(entry.text).match(/(Minion|Synthetic Troop|Spirit Magus) Skill Level/i)?.[1]?.toLowerCase();
      if (!kind) continue;
      if (stoneTags.has(levelTagIds[kind])) entry.sourced = `game data: the level line writes field 2006400 on skills tagged ${kind === "minion" ? "Minions" : kind === "synthetic troop" ? "Synthetic Troop" : "Spirit Magus"} (${levelTagIds[kind]}), which ${setup.name} carries`;
      else entry.sourced = "user decision 2026-10-22: Minion Skill Level raises Summon skills (Spirit Magus, Synthetic Troop, module and other summons)";
    }
    const addedLevels = levels.addedLevels === 0 && !levels.manualAddedLevels ? sourceBonus.total : levels.addedLevels ?? sourceBonus.total;
    return { ...setup, setupKey, baseLevel, addedLevels, ...(activeSlotMagus ? { activeSlotMagus } : {}), levelBonusSources:sourceBonus.contributions, effectiveLevel: baseLevel + addedLevels, supports, enabled: state.skills.setupEnabled[setupKey] !== false, enabledSupportSlots: slots, occupiedSupportSlots: occupiedSlots, energyCost: energyCostForSupportPositions(setup.role, occupiedSlots, profile) };
  });
  // Spirit Magi in active skill slots (user rule 2026-10-19; src/magus-active-slot.js): Iris 1 / 2 only. For other heroes, and for
  // a second copy of a Magus already on the board, the active-slot setup stays on the board but inactive (no Energy, no seal).
  setups.splice(0, setups.length, ...applyMagusActiveSlotRule(setups, state.hero?.selectedHeroId));
  const order = state.skills.setupOrder || setups.map((setup) => setup.name);
  setups.sort((a, b) => (order.indexOf(a.setupKey) < 0 ? order.indexOf(a.name) < 0 ? 999 : order.indexOf(a.name) : order.indexOf(a.setupKey)) - (order.indexOf(b.setupKey) < 0 ? order.indexOf(b.name) < 0 ? 999 : order.indexOf(b.name) : order.indexOf(b.setupKey)));
  // Hero trait board grants (src/trait-board-grants.js; Youga – The Ultimate One): Clockwork Core replaces the second support of
  // a Tanglable skill in Active slot 1; Spacetime Dictator / Conqueror / Overlord put Stasis Vault / Supreme Descent / Selves of
  // All Realms (Lv. 20; the skill takes no energy) in Active slots 2 / 3 / 4. The user's replaced skill or support stays in the
  // list, disabled and marked `traitReplaced`; the stored board is never changed. The trait skills take supports like other
  // skills, stored under their own key `trait:<skill>` (resolveSetupSupports), and those supports cost energy as usual;
  // Clockwork Core's socket costs energy like any support (2026-10-15 user answers).
  const resolveGrantedSupports = (setup) => resolveSetupSupports(setup, setup.setupKey, [...(state.skills.customSupports[setup.setupKey] || [])]);
  const traitBoard = applyTraitBoardGrants({ setups, boardSlots: state.skills.boardSlots, supportOrder: state.skills.supportOrder, modifierTexts, catalogSkillsByName, profile, resolveGrantedSupports });
  if (traitBoard.summary) setups.splice(0, setups.length, ...traitBoard.setups);
  const energy = calculateAvailableEnergy(equipment.allItems, state.disabledEquipmentSlots, profile.nonEquipmentEnergy);
  // Energy never switches a setup off (user decision 2026-10-21; src/engine.js allocateSkillEnergy): every enabled setup is
  // counted and a setup past the budget only carries the "insufficient Energy" warning. The Main Skill is walked first, so the
  // warnings fall on the other setups: the setup in Active slot 1 when it is a main-role skill, else the board's first main-role
  // skill, else the first enabled main-role setup. (2026-10-15 to 2026-10-21 only the Main Skill was kept on; before that a
  // game-log import with no gear Energy switched its Main Skill off.)
  const energyPriorityIndex = (() => {
    const eligible = (setup) => Boolean(setup) && setup.enabled !== false && setup.role === "main" && !setup.traitGranted;
    const main = skillBoardRows(setups, state.skills.boardSlots, "skills").find(eligible) || setups.find(eligible);
    return main ? setups.indexOf(main) : null;
  })();
  const allocation = allocateSkillEnergy(setups, energy.available, { priorityIndex: energyPriorityIndex });
  // Lich's Dirge (Pantheon's Elegy; legendary audit batch 1, 2026-10-22): "+2% Aura Effect for each non-Exclusive Support Skill
  // equipped" counts the enabled supports on the enabled skill-board setups whose catalog entry is not Exclusive (exclusiveFor).
  const nonExclusiveSupports = setups.filter((setup) => setup.enabled !== false).flatMap((setup) => (setup.supports || []).filter((support) => support?.name && support.enabled !== false && !catalogSupportsByName.get(support.name)?.exclusiveFor)).length;
  const activeNames = new Set(allocation.allocations.filter((entry) => entry.counted).map((entry) => entry.name));
  // "Unable to use Empower Skills" (Tyrant's Smoldering Hold, corroded; legendary audit batch 1, 2026-10-22): the board's Empower Skills
  // are not cast, so none of their effects apply. The uncorroded "Unable to trigger Empower Skills" may leave manual casts possible:
  // not read (open question legendary-empower-trigger-block).
  const empowerBlocked = modifierTexts.some((line) => /^Unable to use Empower Skills$/i.test(String(line.text ?? "").trim()));
  if (empowerBlocked) for (const setup of setups) if ((setup.tags || []).includes("Empower") && setup.role !== "support") activeNames.delete(setup.name);
  // A granted Aura is always active (user-confirmed 2026-10-13). The board's own copy of the same Aura, when it is active too,
  // is compared with the granted one in the Aura ledger below; otherwise (switched off on the board) the granted copy stands in.
  // activeNames carries the name either way; the board reads its own allocation, not this set.
  const boardActiveAuraNames = new Set(setups.filter((setup) => setup.role === "aura" && setup.enabled && activeNames.has(setup.name)).map((setup) => setup.name));
  for (const setup of grantedAuraSetups) activeNames.add(setup.name);
  const activation = { profile, setups, energy, allocation, activeNames, traitBoard: traitBoard.summary };
  // Damage sources: every enabled setup that deals damage, with its profile and modeling status
  // (src/skill-damage-profiles.js). Scorching Beam keeps its calibrated path below; skills whose own
  // damage is a DoT status (Wilting Beam) go through src/skill-dot-model.js; the rest are listed as
  // "damage not modeled". The enabled main-role setup is the build's main skill.
  // A trait skill (Supreme Descent has the catalog's "main" role) is never the build's Main Skill.
  const mainCandidates = setups.filter((setup) => !setup.traitGranted);
  const resolvedMain = mainCandidates.find((setup) => setup.role === "main" && setup.enabled && activeNames.has(setup.name)) || mainCandidates.find((setup) => setup.role === "main" && setup.enabled) || mainCandidates.find((setup) => setup.role === "main") || null;
  // Activation Medium: Terra (Silencing Severance; src/selena-dance.js resolveActivationMediumTerra, TLIDB 2026-10-13): on an
  // active Main Terra Skill it adds +30% additional damage, triggers the skill at max Terra Charge and seals 20% Mana (Life with
  // Drenched Hem). "Main Skills cannot be supported by other Activation Mediums": the Main Skill's other Activation Medium
  // supports are switched off for this pass.
  const activationMediumTerra = resolveActivationMediumTerra({ modifierTexts, mainIsTerra: Boolean(resolvedMain && activeNames.has(resolvedMain.name) && (resolvedMain.tags || []).includes("Terra")) });
  // Erika – Vendetta's Sting (hero trait audit B5): Leisurely Stroll's "Main Skills cannot be supported by Activation Medium"
  // switches the Main Skill's Activation Medium supports off (the line comes only with the trait picked and its memory installed).
  const erikaActivationMediumBlocked = [];
  if (state.hero.selectedHeroId === VENDETTAS_STING && resolvedMain && modifierTexts.some((line) => line.origin === "trait" && /^Main Skills cannot be supported by Activation Medium$/i.test(String(line.text ?? "").replace(/\s+/g, " ").trim()))) {
    resolvedMain.supports = (resolvedMain.supports || []).map((support) => {
      if (support.enabled === false || !isActivationMedium(support.name)) return support;
      erikaActivationMediumBlocked.push(support.name);
      return { ...support, enabled: false, disabledReason: "Leisurely Stroll: Main Skills cannot be supported by Activation Medium" };
    });
  }
  if (activationMediumTerra.active && resolvedMain) resolvedMain.supports = (resolvedMain.supports || []).map((support) => support.enabled !== false && isActivationMedium(support.name) ? { ...support, enabled: false, disabledReason: "Silencing Severance: Main Skills cannot be supported by other Activation Mediums" } : support);
  // Youga – The Ultimate One (src/youga-ultimate-one.js): "Non-Main Skills cannot be tangled" switches the Tangle supports off on
  // every skill but the Main Skill (Active slot 1, user-stated 2026-10-15; provisional reading: the support has no effect).
  // Clockwork Core's skill is a Tangle Skill whose Tangles all sit on the Core (src/tangle-model.js coreSetupKey).
  const yougaMainKey = state.hero.selectedHeroId === YOUGA_ULTIMATE_ONE ? traitBoard.summary?.clockworkCore?.setupKey ?? skillBoardRows(setups, state.skills.boardSlots, "skills")[0]?.setupKey ?? null : null;
  const yougaBlockedTangles = state.hero.selectedHeroId === YOUGA_ULTIMATE_ONE ? blockNonMainTangles({ modifierTexts, setups, mainSetupKey: yougaMainKey }) : [];
  const yougaCoreKey = traitBoard.summary?.clockworkCore?.applied ? traitBoard.summary.clockworkCore.setupKey : null;
  // Selena (Dance of the Deep; src/selena-dance.js): "Non-Main Terra Skill cannot deal damage" takes other Terra skills off
  // the dummy, and the Terra Charge state (Max Terra Charge Stacks, Artificial Moon's 32% per charge) sets the Terra skills'
  // Terra Charge line. Without these lines the state is the default (1 charge at 26%) and nothing changes.
  // A Terra skill's own support clauses on Terra Charge (Ground Divide: +1 Max Terra Charge, Restoration Speed; frost-terra audit
  // 2026-10-13) join that skill's Terra Charge state only (src/selena-dance.js terraChargesForSetup).
  const buildMaxSpellBurst = modifierTexts.reduce((total, line) => { const match = String(line.text).match(/^\+(\d+) Max Spell Burst$/i); return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0);
  // Icemirror's Mirrored Shade at max stacks (src/combat-states.js; best case, condition mirroredShade) adds Max Terra Charge on
  // the Main Terra Skill the player stands on.
  const mirroredShadeCharges = mirroredShadeTerraChargeLines(modifierTexts, { mainIsTerra: Boolean(resolvedMain && activeNames.has(resolvedMain.name) && (resolvedMain.tags || []).includes("Terra")), requestedConditions });
  const terraLinesFor = (setup) => setup ? [...setupTerraChargeLines({ supportEffects: resolveSupportEffects(setup) }), ...(setup.setupKey && setup.setupKey === resolvedMain?.setupKey ? mirroredShadeCharges : [])] : [];
  const danceOfTheDeep = resolveDanceOfTheDeep({ state, modifierTexts, resolvedMain, activeNames, extraChargeLines: terraLinesFor(resolvedMain), maxSpellBurst: modifierTexts.reduce((total, line) => { const match = String(line.text).match(/^\+(\d+) Max Spell Burst$/i); return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0) });
  const terraChargesFor = (setup) => setup?.setupKey && setup.setupKey === resolvedMain?.setupKey ? danceOfTheDeep.charges : resolveTerraCharges([...modifierTexts, ...terraLinesFor(setup)], { maxSpellBurst: buildMaxSpellBurst });
  const damageSources = collectSkillDamageSources({ setups, activeNames }).map((source) => source.status === "modeled" && danceBlocksSetup(danceOfTheDeep, setups.find((setup) => setup.setupKey === source.setupKey), resolvedMain)
    ? { ...source, status: "inactive", reason: "Dance of the Deep: Non-Main Terra Skill cannot deal damage" } : source);
  // Bing – Blast Nova (hero trait audit B12; src/bing-traits.js): the bombs replace a Non-channeling, Non-Sentry Main Attack Projectile
  // Skill's casts (its hit model gives each bomb's damage, Q-H14). Firepower Coverage (Q-H15, recommended reading, provisional; the
  // user has not answered): "Cannot use Main Skills" is unconditional, so a Main Skill the bombs cannot replace deals no damage of its
  // own, with a warning naming the missing source. Best-case switch `bingFirepowerNoMain` (default on: the penalty applied; off: such a
  // Main Skill keeps its damage).
  const bingBombs = bombsReplaceMain(state.hero.selectedHeroId, modifierTexts, resolvedMain);
  const firepowerCoverage = state.hero.selectedHeroId === BING_BLAST_NOVA && modifierTexts.some((line) => line.origin === "trait" && /^Cannot use Main Skills$/i.test(String(line.text ?? "").replace(/\s+/g, " ").trim()))
    ? { mainName: resolvedMain?.name || null, bombs: bingBombs, applied: requestedConditions.bingFirepowerNoMain !== false && Boolean(resolvedMain) && !bingBombs } : null;
  if (firepowerCoverage?.applied) for (const [index, source] of damageSources.entries()) {
    if (source.setupKey === resolvedMain.setupKey && source.status === "modeled") damageSources[index] = { ...source, status: "inactive", reason: "Firepower Coverage: Cannot use Main Skills (Q-H15, provisional); the bombs need a Non-channeling, Non-Sentry Main Attack Projectile Skill" };
  }
  const skillDotSources =damageSources.filter((source) => source.status === "modeled" && source.profile.engine === "skill-dot").map((source) => ({ ...source, setup: setups.find((setup) => setup.setupKey === source.setupKey) }));
  // Damage-over-time skills an item casts (gear affix batch D, 2026-10-22: "Triggers Lv. 30 Black Hole when moving. Interval: 1.5 s";
  // src/item-triggered-skills.js): with no copy of the skill on the skill board, the item's skill at its level runs the skill's own
  // DoT profile while the event holds (the movement group), at most once per its cooldown (the Activation Medium rule: rate =
  // 1 / max(trigger interval, cooldown); provisional). The hit streams follow below (itemTriggerSources).
  const itemDotTriggers = [];
  modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).forEach((line) => {
    const trigger = parseItemTrigger(line.text);
    if (!trigger || trigger.unmodeled || trigger.notOnDummy || !(trigger.intervalSeconds > 0)) return;
    const setup = { ...(catalogSkillsByName.get(trigger.name) || {}), name: trigger.name, role: "item-trigger", baseLevel: trigger.level, addedLevels: 0, effectiveLevel: trigger.level, supports: [], setupKey: `item-trigger-dot:${trigger.name}`, instanceId: `item-trigger-dot:${trigger.name}`, enabled: true };
    const profile = inferDamageProfile(setup);
    if (profile?.engine !== "skill-dot" || !Number.isFinite(profile.refreshPerSecond)) return;
    const key = normalizeLineText(String(line.text)).trim();
    if (setups.some((item) => item.name === trigger.name && activeNames.has(item.name))) { itemDotTriggers.push({ key, note: `No DPS effect: ${trigger.name} is on the skill board and is recast at its cooldown already` }); return; }
    const event = itemTriggerEvent(trigger, { moving: requestedConditions.moving !== false });
    if (!event.active) { itemDotTriggers.push({ key, note: `Inactive: ${event.reason}` }); return; }
    if (skillDotSources.some((source) => source.setupKey === setup.setupKey)) return;
    const perSecond = Math.min(1 / trigger.intervalSeconds, profile.refreshPerSecond);
    skillDotSources.push({ setupKey: setup.setupKey, name: setup.name, role: setup.role, enabled: true, active: true, status: "modeled", reason: `item trigger (${line.source})`, setup, itemTrigger: { ...trigger, source: line.source, text: line.text, reason: event.reason }, profile: { ...profile, refreshPerSecond: perSecond, notes: [...(profile.notes || []), `${trigger.name} Lv.${trigger.level} cast by ${line.source}: every ${trigger.intervalSeconds} s while the event holds (${event.reason}), at most once per its cooldown: ${Math.round(1 / perSecond * 1000) / 1000} s (provisional).`] } });
    itemDotTriggers.push({ key, note: `Triggered skill: ${trigger.name} Lv.${trigger.level} every ${Math.round(1 / perSecond * 1000) / 1000} s (${event.reason}; the item's interval ${trigger.intervalSeconds} s capped by the cooldown; provisional)` });
  });
  // Generic spell hits (src/skill-hit-model.js, engine "skill-hit"): computed below once crit, cast speed and the target are resolved.
  // Activation Medium: Terra's "+30% additional damage for the supported skill" on the Main Terra Skill (hits and its own DoT).
  const activationMediumTerraLines = (setupKey) => activationMediumTerra.active && setupKey && setupKey === resolvedMain?.setupKey ? [{ source: "Activation Medium: Terra (Silencing Severance)", text: `+${activationMediumTerra.additionalPercent}% additional damage for the supported skill (TLIDB Activation_Medium_Terra)`, value: activationMediumTerra.additionalPercent, category: "Additional damage" }] : [];
  // Tangle Skills and Dormant Entanglement (src/tangle-model.js): "+40% additional Tangle Damage for each inactivated Tangle" on
  // the hits and own DoT of each Spell cast as a Tangle; joins the per-setup granted lines with Activation Medium: Terra's.
  // Core audit B8: "You can apply N additional Tangle(s) to enemies" (activated Tangles) and the cadence switch tangleTriggers.
  const tangles = resolveTangles({ setups, activeNames, modifierTexts, coreSetupKey: yougaCoreKey, extraQuantity: yougaTangleQuantityLines(modifierTexts), conditions: { tangleTriggers: requestedConditions.tangleTriggers !== false } });
  // Overly Modified (core audit B7, src/sentry-cores.js): +30% on a Sentry skill's own damage, −50% on a non-Sentry Active skill's.
  const overlyModified = overlyModifiedState(modifierTexts);
  const overlyLinesFor = (setupKey) => { const line = overlyModified ? overlyModifiedLine(overlyModified, setups.find((setup) => setup.setupKey === setupKey)) : null; return line ? [line] : []; };
  const grantedSetupLines = (setupKey) => [...activationMediumTerraLines(setupKey), ...tangleLinesFor(tangles, setupKey), ...overlyLinesFor(setupKey)];
  const skillHitSources = damageSources.filter((source) => source.status === "modeled" && source.profile.engine === "skill-hit").map((source) => ({ ...source, profile: { ...withTerraCharges(source.profile, terraChargesFor(setups.find((setup) => setup.setupKey === source.setupKey))), grantedAdditional: grantedSetupLines(source.setupKey) }, setup: setups.find((setup) => setup.setupKey === source.setupKey) }));
  // Their ground-effect damage over time (Flame / Corrosion / Swamp Terra): skill-DoT profiles for src/skill-dot-model.js.
  const skillHitDotSources = skillHitSources.flatMap((source) => skillHitDotComponents(source.profile).map((profile) => ({ ...source, profile })));
  // Support clauses per resolved setup (src/support-effects.js: leveled values, stars, rolls, Activation Medium lines,
  // per-engine clause statuses). Engines read `setup.supportEffects`; it is resolved again once the blessing model
  // gives the Focus Blessing stack count (Overload).
  const supportEffectsContext = (setup, focusBlessingStacks) => {
    const profile = inferDamageProfile(setup);
    return { profile, engine: setup.name === "Scorching Beam" ? "scorching-beam" : profile?.engine ?? null, isMain: Boolean(resolvedMain) && setup.setupKey === resolvedMain.setupKey, speedType: profile?.engine === "skill-hit" ? skillHitTiming(profile)?.speedType || "cast-speed" : null, specialSupportConfigs: state.skills.specialSupportConfigs || {}, focusBlessingStacks };
  };
  for (const setup of setups) setup.supportEffects = resolveSupportEffects(setup, supportEffectsContext(setup));
  // Periodic Burst on a Mobility skill (src/periodic-burst.js; 2026-10-14, provisional): its time-averaged Attack and Cast Speed
  // joins the build's lines before the cast-rate ledger and the weapon Attack Speed model read them.
  const periodicBurst = resolvePeriodicBurst({ setups, activeNames, mobilitySkillUsed: requestedConditions.mobilitySkillUsed !== false, cooldownFor: (setup) => { const profile = inferDamageProfile(setup); return (profile ? skillHitTiming(profile)?.cooldownSeconds : null) ?? 0; } });
  modifierTexts.push(...periodicBurst.lines);
  const skillDotAfflictionRate = [...skillDotSources, ...skillHitDotSources].reduce((sum, source) => sum + skillDotAfflictionPerSecond(source.setup), 0);
  // "+X% <Aura name> Aura (Effect)" lines (e.g. Decaying Blessing: +140% Erosion Amplification Aura Effect; a Belt corrosion's
  // "+25% Spell Amplification Aura") raise that aura and its Precise: version only (src/engine.js calculateAuraLedger). Gear Deep
  // Pain lines are read through the gear stat (deepPainAuraEffectPercent), so only other sources' Deep Pain lines come here.
  const namedAuraEffectPercents = {};
  for (const line of modifierTexts) {
    const match = line.text.match(/^\+(\d+(?:\.\d+)?)% (.+?) Aura(?: Effect)?$/i);
    if (!match || /\bAura\b/i.test(match[2]) || (line.origin === "gear" && /^Deep Pain$/i.test(match[2]))) continue;
    namedAuraEffectPercents[match[2]] = (namedAuraEffectPercents[match[2]] || 0) + Number(match[1]) * (line.multiplier ?? 1);
  }
  // Radical Evolution Theory (revived memory; src/origin-of-spirit-magus.js): a share of the Origin of Spirit Magus Effect bonus as
  // that Aura's own Aura Effect.
  for (const item of radicalEvolutionAuraEffects(modifierTexts)) if (item.percent) namedAuraEffectPercents[item.aura] = (namedAuraEffectPercents[item.aura] || 0) + item.percent;
  const prismTalentStats = prismTalentStatSources({ talents: levelSources.talents, talentState: state.talents });
  // Prism "also gain" Sealed Mana Compensation belongs to the talent total shown on the Talents page.
  talentSlate.prismSealedManaCompensationPercent = prismTalentStats.totals.sealedManaCompensationPercent;
  talentSlate.sealedManaCompensationPercent = Math.round((talentSlate.sealedManaCompensationPercent + prismTalentStats.totals.sealedManaCompensationPercent) * 10000) / 10000;
  // Conditional global Aura Effect lines (gear uniques round 2: Hanging Two-Tone Mask, Lone Walker's Boots): resolved before the
  // Aura ledger with the active Aura types and the Distance group (src/conditional-aura-effect.js).
  // Sealed Mana Compensation from hero traits (Silencing Severance "+20% Sealed Mana Compensation"): a character stat like the
  // talent / slate / gear lines, so it joins the global pool the Aura reservations read (frost-terra audit 2026-10-13; before, it
  // was counted on the stat sheet only).
  const traitSealedManaCompensationPercent = modifierTexts.filter((line) => line.origin === "trait").reduce((sum, line) => { const match = normalizeLineText(String(line.text)).replace(/\s+/g, " ").trim().match(/^\+?(\d+(?:\.\d+)?) ?% Sealed Mana Compensation$/i); return sum + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0);
  const globalSealedManaCompensationPercent = talentSlate.sealedManaCompensationPercent + (equipment.candidate["sealedManaCompensationPercent:increased"] || 0) + traitSealedManaCompensationPercent;
  // Fixed Support Mana Multiplier: Off The Beaten Track 95% (by name), and a gear line "Support Skill's Mana Multiplier is fixed at
  // N%" (Pantheon's Elegy: Lich's Dirge 88%; legendary audit batch 1). With both, the lower value is used (provisional, open
  // question legendary-fixed-support-multiplier).
  const fixedSupportManaMultiplier = (() => {
    const lines = modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).map((line) => ({ line, match: normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(/^Support Skill's Mana Multiplier is fixed at (\d+(?:\.\d+)?) ?%\.?$/i) })).filter((item) => item.match && Number(item.match[1]) !== 95);
    const values = [...(offTheBeatenTrack ? [95] : []), ...lines.map((item) => Number(item.match[1]))];
    return { percent: values.length ? Math.min(...values) : 100, lines: lines.map((item) => item.line) };
  })();
  const conditionalAura = conditionalAuraEffect(modifierTexts, { auraCount: new Set([...boardActiveAuraNames, ...grantedAuraSetups.map((setup) => setup.name)]).size, nearTarget: requestedConditions.nearTarget !== false, sealedManaCompensationPercent: globalSealedManaCompensationPercent, nonExclusiveSupports });
  const auraOptions = {
    nearbyElite: requestedConditions.nearbyElite === true, affectedAllies: state.combat.auraAffectedAllies,
    baseSealedPercent: 50, fixedSupportMultiplierPercent: fixedSupportManaMultiplier.percent,
    globalCompensationPercent: globalSealedManaCompensationPercent,
    // "+X% Sealed Mana Compensation for Focus / Spirit Magus Skills" (core audit B7): per Aura carrying the tag (src/engine.js).
    taggedCompensation: modifierTexts.flatMap((line) => { const match = normalizeLineText(String(line.text)).replace(/\s+/g, " ").trim().replace(/^\[[^\]]+\]\s*/, "").match(/^\+?([+-]?\d+(?:\.\d+)?) ?% Sealed Mana Compensation for (Focus|Spirit Magus) Skills$/i); return match ? [{ tag: match[2].replace(/\b\w/g, (letter) => letter.toUpperCase()), percent: Number(match[1]) * (line.multiplier ?? 1), source: line.source, text: line.text }] : []; }),
    globalAuraEffectPercent: (equipment.candidate["auraEffectPercent:increased"] || 0) + (talentSlate.candidateTalent.auraEffectPercent || 0) + (talentSlate.candidateSlate.auraEffectPercent || 0) + (pact.totals.auraEffectPercent || 0) + prismTalentStats.totals.auraEffectPercent + conditionalAura.percent,
    // Per-Aura Sealed Mana Compensation (Lone Walker's conversion) and the conditional part the town context leaves out
    // (src/engine.js calculateAuraLedger; research/frost-terra-panel-compare-2026-10-13.md).
    auraEffectPerSealedManaCompensation: conditionalAura.perSealedManaCompensation,
    conditionalAuraEffectPercent: conditionalAura.conditionalPercent,
    // "-20% additional Deep Pain Sealed Mana Compensation" (e.g. the Scepter TOWER Sequence) comes from the
    // equipped gear, one multiplier per line (game affix 439527584, attr 1304 mod 4); it was a fixed -20 before.
    namedAuraEffectPercents,
    // "+X% Sealed Mana Compensation for <Aura>" / "+X% additional <Aura> Sealed Mana Compensation" (gear affix batch D; src/engine.js).
    namedCompensation: namedAuraSealedManaCompensation(modifierTexts),
    auraGainedEffects: auraGainedEffects(modifierTexts),
    deepPainCompensationPercents: collectNormalizedGearModifiers(equipment.candidateItems).filter((modifier) => modifier.enabled && modifier.stat === "deepPainSealedManaCompensationPercent").map((modifier) => modifier.value),
    deepPainAuraEffectPercent: equipment.candidate["deepPainAuraEffectPercent:increased"] || 0
  };
  const boardAuraSetups = setups.filter((setup) => setup.enabled && setup.role === "aura").map((setup) => ({ ...setup, supports: setup.supports.filter((s) => s.enabled) }));
  // Item-granted Auras (above): one copy per Aura, never two. A board copy that is not active (switched off) gives way to the
  // granted one; when both are active, the copy with the larger effect stays (sum of the ledger's effective values: the board's
  // level and supports against the item's level) and the choice is listed in the assumptions (user, 2026-10-13).
  const grantedAuraChoices = [];
  let auraSetups = boardAuraSetups;
  // Full Mana grants (legendary audit batch 2; Phantom's pool, Compensatory Life): a granted Aura seals no Mana, so the board's
  // ledger (with the unconditional grants) decides Full Mana: at least 95% of Mana unsealed (src/line-conditions.js FULL_MANA_AT_LEAST_PERCENT;
  // the Full Life rule by analogy, provisional). Activation Medium: Terra's 20% Mana seal counts.
  const conditionalAuraGrants = [];
  if (conditionalGrantedAuras.length) {
    const preAura = calculateAuraLedger([...boardAuraSetups.filter((setup) => !grantedAuraSetups.some((granted) => granted.name === setup.name)), ...grantedAuraSetups].filter((setup) => activeNames.has(setup.name)), auraOptions);
    const manaRemaining = Math.max(0, (preAura.manaRemainingPercent ?? 100) - (activationMediumTerra.active && !activationMediumTerra.sealsLife ? activationMediumTerra.sealPercent : 0));
    const fullMana = manaRemaining >= FULL_MANA_AT_LEAST_PERCENT;
    for (const grant of conditionalGrantedAuras.filter((item, index, list) => list.findIndex((other) => other.name === item.name) === index)) {
      const active = grant.condition === "fullMana" ? fullMana : !fullMana;
      const reason = `${Math.round(manaRemaining * 100) / 100}% Mana unsealed: ${fullMana ? "at" : "not at"} Full Mana (at least ${FULL_MANA_AT_LEAST_PERCENT}% unsealed; provisional)`;
      conditionalAuraGrants.push({ name: grant.name, condition: grant.condition, active, reason, source: grant.source, text: grant.text });
      if (active) { grantedAuraSetups.push(grantedSetupFor(grant)); activeNames.add(grant.name); }
    }
  }
  for (const granted of grantedAuraSetups) {
    const board = auraSetups.find((setup) => setup.name === granted.name && !setup.granted);
    if (!board || !boardActiveAuraNames.has(granted.name)) {
      auraSetups = [...auraSetups.filter((setup) => setup.name !== granted.name), granted];
      grantedAuraChoices.push({ name: granted.name, kept: "granted", text: `${granted.name} Lv.${granted.effectiveLevel} from ${granted.grantSource || "an item"} is active (item grant: always on, no energy, no Mana or Life sealed)${board ? "; the board copy is not active" : ""}.` });
      continue;
    }
    const score = (setup) => Object.values(calculateAuraLedger([setup], auraOptions).entries[0]?.effectiveEffects || {}).reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0);
    const grantedWins = score(granted) > score(board);
    if (grantedWins) auraSetups = [...auraSetups.filter((setup) => setup.name !== granted.name), granted];
    grantedAuraChoices.push({ name: granted.name, kept: grantedWins ? "granted" : "board", text: `${granted.name}: the board copy (Lv.${board.effectiveLevel}) and the item grant (Lv.${granted.effectiveLevel}, ${granted.grantSource || "an item"}) do not stack; the ${grantedWins ? "item grant" : "board copy"} has the larger effect and is the one counted.` });
  }
  const aura = calculateAuraLedger(auraSetups.filter((setup) => activeNames.has(setup.name)), auraOptions);
  // The same Auras as the in-game skill panel shows them (town: no target, no Elite, no combat state): each Aura's own Sealed
  // Mana Compensation, without the conditional Aura Effect lines. For the panel comparison only; damage reads `aura.entries`
  // (the dummy context: Boss within 10 m).
  aura.town = { context: "town", entries: calculateAuraLedger(auraSetups.filter((setup) => activeNames.has(setup.name)), { ...auraOptions, context: "town" }).entries };
  // Activation Medium: Terra's seal (TLIDB "Seals 20% Mana"; Drenched Hem: Life instead) joins the reserved totals the Life / Mana
  // states and "for every N% Life sealed" lines read. A flat 20%: Sealed Mana Compensation does not reduce it (user-confirmed
  // 2026-10-13).
  if (activationMediumTerra.active) {
    const resource = activationMediumTerra.sealsLife ? "life" : "mana";
    const reserved = Math.min(99.99, aura[`${resource}ReservedPercent`] + activationMediumTerra.sealPercent);
    aura.activationMediumTerraSeal = { resource, percent: activationMediumTerra.sealPercent, source: activationMediumTerra.sealsLife ? activationMediumTerra.sealSource : activationMediumTerra.grantSource };
    aura[`${resource}ReservedPercent`] = Math.round(reserved * 10000) / 10000;
    aura[`${resource}DemandPercent`] = Math.round((aura[`${resource}DemandPercent`] + activationMediumTerra.sealPercent) * 10000) / 10000;
    aura[`${resource}RemainingPercent`] = Math.round((100 - reserved) * 10000) / 10000;
  }
  // Eeeendless Mana (Youga – Spacetime Illusion; hero trait audit B4): "Seals 25% Max Mana" joins the reserved Mana the Mana
  // states read, as Activation Medium: Terra's seal does (a flat seal; Sealed Mana Compensation not applied: provisional).
  {
    const endless = state.hero.selectedHeroId === "youga-spacetime-illusion" ? modifierTexts.find((line) => line.origin === "trait" && /^Seals \d+(?:\.\d+)? ?% Max Mana\. Spacetime Illusion no longer has Cast Frequency limitations$/i.test(normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim())) : null;
    const percent = endless ? Number(normalizeLineText(String(endless.text)).match(/Seals (\d+(?:\.\d+)?)/i)[1]) : 0;
    if (percent > 0) {
      const reserved = Math.min(99.99, aura.manaReservedPercent + percent);
      aura.endlessManaSeal = { resource: "mana", percent, source: endless.source };
      aura.manaReservedPercent = Math.round(reserved * 10000) / 10000;
      aura.manaDemandPercent = Math.round((aura.manaDemandPercent + percent) * 10000) / 10000;
      aura.manaRemainingPercent = Math.round((100 - reserved) * 10000) / 10000;
    }
  }
  const lowResources = calculateLowResourceDefenses({ aura, equipment, talents: levelSources.talents, slates: levelSources.slates, memories: heroMemories });
  const resistances = calculateResistances({ equipment, talents: levelSources.talents, slates: levelSources.slates, memories: heroMemories, pact, pactState: state.pacts, talentState: state.talents, aura });
  const plannedAura = calculateAuraLedger(auraSetups, auraOptions);
  aura.planned = { entries: plannedAura.entries, manaReservedPercent: plannedAura.manaReservedPercent, manaDemandPercent: plannedAura.manaDemandPercent, manaRemainingPercent: plannedAura.manaRemainingPercent, lifeReservedPercent: plannedAura.lifeReservedPercent, lifeDemandPercent: plannedAura.lifeDemandPercent, lifeRemainingPercent: plannedAura.lifeRemainingPercent };
  aura.prismTalentSources = prismTalentStats.lines;
  aura.grantedChoices = grantedAuraChoices;
  aura.conditionalGrants = conditionalAuraGrants;
  aura.offTheBeatenTrack = { active: offTheBeatenTrack, source: offTheBeatenTrackTalent ? "Lich talent" : offTheBeatenTrackSlate ? "Divinity Slate / Pedigree" : offTheBeatenTrackGear ? grantedCores.get("Off The Beaten Track") : null, supportSkillLevels: offTheBeatenTrack ? 4 : 0, fixedManaMultiplierPercent: offTheBeatenTrack ? 95 : null };
  // "+1 Ignite limit for Numbed enemies" (Everburn Thunderfire, Illusory Chimera; legendary audit batch 2): while the build keeps the
  // dummy Numbed (the enemy-ailment model's own reading, run here ahead of the build mechanics).
  const numbedIgniteLimitLines = modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).map((line) => normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(/^\+(\d+) Ignite limit for Numbed enemies$/i)).filter(Boolean);
  const numbedIgniteLimit = numbedIgniteLimitLines.length && collectEnemyAilments({ setups, activeNames, modifierTexts, mainName: resolvedMain?.name || main?.name }).types.some((type) => type.name === "Numbed") ? numbedIgniteLimitLines.reduce((sum, match) => sum + Number(match[1]), 0) : 0;
  const igniteLimit = 1 + (coreNames.has("Starfire") ? 1 : 0) + pact.totals.igniteLimit + equipment.candidateGearIgniteLimit + (talentSlate.candidateTalent.igniteLimit || 0) + (talentSlate.candidateSlate.igniteLimit || 0) + numbedIgniteLimit;
  // The calibrated Scorching Beam path reads its own setup (disabled or absent builds get an inert stub);
  // build-wide mechanics (supports, channeled stacks) follow the resolved main skill. The enabled setup wins over a
  // disabled captured one (a custom Scorching Beam beside the Selena capture).
  const scorchingBeam = findScorchingBeamSetup(setups) || { name: "Scorching Beam", role: "main", enabled: false, supports: [], baseLevel: 20, addedLevels: 0, effectiveLevel: 20, tags: [] };
  const main = scorchingBeam;
  const sourceStacks = talentSlate.disintegrate.candidateAdditionalStacks;
  const equipmentDisintegrateFactor = (1 + Math.max(0, sourceStacks + equipment.additionalIgniteStacksDelta) * 0.26) / (1 + sourceStacks * 0.26);
  const support = calculateSupportCandidate(main.supports, skills.setups[0].supports, { igniteLimit, additionalStacks: Math.max(0, sourceStacks + equipment.additionalIgniteStacksDelta), useEffectiveLevels: state.talents.useCapturedRanks === false });
  const supportFactor = support.igniteFactor;
  const baselineMainLevel = skills.setups[0].effectiveLevel;
  const skillLevelFactor = main.effectiveLevel >= 20 ? skillLevelDamageMultiplier(main.effectiveLevel) / skillLevelDamageMultiplier(baselineMainLevel) : 1;
  const townSupportPrediction = { spellDps: supportValidationBaseline.spellDps * support.spellFactor, igniteDps: supportValidationBaseline.igniteDps * support.townIgniteFactor };
  const capturedAuraFactor = 1.255 * 1.435 * 1.41 * 1.34 * 1.04;
  const currentAuraFactor = aura.entries.reduce((factor, auraEntry) => {
    const effects = auraEntry.baseEffects;
    const damageStats = ["additionalAilmentDamagePercent", "additionalFireDamagePercent", "additionalDamageOverTimePercent", "additionalAreaAilmentDamagePercent"];
    const scaled = damageStats.reduce((result, stat) => result * (1 + (effects[stat] || 0) / 100), 1);
    return factor * scaled * (auraEntry.name === "Precise: Domain Expansion" ? 1.04 : 1);
  }, 1);
  const configuredAuraFactor = currentAuraFactor / capturedAuraFactor;
  const sourceDamageMultiplier = (activeNames.has("Scorching Beam") ? 1 : 0) * talentSlate.factors.damageMultiplier * pact.factors.nonLimitDamageMultiplier * equipment.factors.nonLimitDamageMultiplier * equipmentDisintegrateFactor * igniteLimit / 10 * supportFactor * configuredAuraFactor * skillLevelFactor;
  const block = calculateBlock({ equipment, talents: levelSources.talents, slates: levelSources.slates, memories: heroMemories, pact, pactState: state.pacts, talentState: state.talents, blockedRecently: requestedConditions.blockedRecently !== false });
  const barrierSources = guardBarrierSources(setups);
  const conditions = { ...requestedConditions, lowLife: lowResources.lowLife, lowMana: lowResources.lowMana, barrier: barrierSources.some(source => source.available) };
  // "Hit or blocked recently" (user decision 2026-10-12): the condition holds as requested, so hit-recently lines apply
  // without Block chance; Blocked recently lines still need Block chance (block.recentlyActive, kept separately).
  conditions.blockedRecently = requestedConditions.blockedRecently !== false;
  conditions.blockRecentlyActive = block.recentlyActive;
  // Moving vs standing still (exclusiveConditionGroups): movement-driven Blessing gains hold while moving.
  conditions.moving = requestedConditions.moving !== false;
  // Within 3 m of the dummy (distance group; best case by default).
  conditions.nearTarget = requestedConditions.nearTarget !== false;
  if (state.hero.selectedHeroId !== "selena-sing-with-the-tide") {
    for (const condition of ["tideContact", "onTheTide", "waveAria", "idyll"]) conditions[condition] = false;
  }
  for (const [condition, name] of Object.entries({ aim: "Aim", entangledPain: "Entangled Pain", scorch: "Scorch" })) if (!activeNames.has(name)) conditions[condition] = false;
  // Curse slots go in skill bar order (user-confirmed 2026-10-19): the board rows as displayed, then any other setup.
  const curseLimit = calculateCurseLimit({ equipment, talents: levelSources.talents, slates: levelSources.slates, talentState: state.talents, pactState: state.pacts, setups: curseBarOrder(setups, skillBoardRows(setups, state.skills.boardSlots, "skills", { traitGrants: true })).filter(setup => activeNames.has(setup.name)), conditions });
  // The active Auras' ailment / Ignite chance (Ailment Amplification, Flame Focus): the enemy-ailment check reads it with the
  // text lines, as the Ignite ledger and the per-skill chance do.
  const activeAuraEntries = aura.entries.filter((entry) => activeNames.has(entry.name));
  const auraAilmentChance = { ailment: activeAuraEntries.reduce((sum, entry) => sum + (entry.effectiveEffects?.ailmentChancePercent || 0), 0), ignite: activeAuraEntries.reduce((sum, entry) => sum + (entry.effectiveEffects?.igniteChancePercent || 0), 0) };
  const collectMechanics = () => collectBuildMechanics({ main: resolvedMain || main, setups, activeNames, modifierTexts, specialSupportConfigs: state.skills.specialSupportConfigs || {}, curseLimitMaximum: curseLimit.maximum, skillCurses: curseLimit.active, heroMemories, targetLife: conditions.targetLife !== false, auraAilmentChance, minionsDealDamage: damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "minion"), twoHandedWeapon: Boolean(calculateWeaponAttack({ equipment, disabledSlots: state.disabledEquipmentSlots, modifierTexts }).twoHanded) });
  let mechanics = collectMechanics();
  // A gear-triggered Scorch (src/build-mechanics.js curses.gearScorch; gear affix batch D) stands in for the Scorch skill: the Scorch
  // model reads conditions.scorch and curses.scorchDamagePercent (its Lv.20 value × Curse Effect, below).
  if (!activeNames.has("Scorch") && mechanics.curses.gearScorch && requestedConditions.scorch !== false) conditions.scorch = true;
  // Conditional and per-stat passive lines (talent batch chunk 2; src/line-conditions.js, src/line-effects.js): resolved
  // against this pass's state; active ones join modifierTexts as plain derived lines and build-mechanics re-reads them.
  // Blessing stacks for "while <Blessing> is active" and Hasten-at-max-Agility conditions (talent batch chunk 3): the
  // Blessing model on this pass's early facts (any modeled hit holds on-hit gains; Reaping from the build's Reaping
  // lines). The final Blessing model below stays the one the damage ledgers read.
  const mobilityUsed = mobilitySkillNames(setups).length > 0 && requestedConditions.mobilitySkillUsed !== false;
  // Thea (hero trait audit B7; src/thea-traits.js): the Divine Blessing cycle as a Blessing gain source, the revived Max Blessing
  // Stacks lines and the max-stack rules (Predicted Justice, the Divine Realm's conversion, Blasphemer's inversion), in both
  // Blessing passes.
  const theaInputs = theaBlessingInputs({ heroId: state.hero.selectedHeroId, modifierTexts, requestedConditions });
  const earlyBlessings = calculateBlessings({ minionsDealDamage: damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "minion"), elixirCasts: setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Elixir")), extraLines: theaInputs?.lines || [], capRules: theaInputs?.capRules || null, mobilityUsed, tangleCasts: tangles.setups.length > 0, hitRecently: requestedConditions.blockedRecently !== false, canUseNonMain: setups.some(setup => setup.role !== "main" && setup.role !== "aura" && activeNames.has(setup.name)), pactState: state.pacts, talentState: state.talents, equipment, talents: levelSources.talents, slates: levelSources.slates, barrierSources, hasReaping: collectAllReapingSources(modifierTexts).length > 0 || cycleResistReaps(modifierTexts, resolvedMain, activeNames), block, moving: conditions.moving, canHit: activeNames.has("Scorching Beam") || skillHitSources.length > 0, canCrit: activeNames.has("Scorching Beam") || skillHitSources.length > 0, enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), igniteOnTarget: mechanics.enemyAilments.types.some((type) => type.name === "Ignite") });
  const lineConditionState = buildLineConditionState({ state, requestedConditions, conditions, lowResources, aura, block, mechanics, curseLimit, modifierTexts, equipment, activeNames, setups, resolvedMain, skillHitSources, talentSlate, pact, heroMemories, earlyBlessings, damageSources, debuffHitRates, yougaMainKey, yougaBlockedTangles, talentPanels: levelSources.talents, resistances, tangles, remainingEnergy: allocation.remaining, nonExclusiveSupports });
  // A chance debuff driven by a skill's hit rate (Grudge's Paralysis): this pass measures the rates (Paralysis held meanwhile,
  // so lines gated on it read alike) and a second pass applies the uptime. Damage taken does not change any hit rate.
  // Thunder Spike: Tremble (src/crit-numbed-buff.js; 2026-10-14, provisional): Numbed Effect while its crit buff is up, at the
  // uptime the supported skill's crit hits per second give (hitRateFacts, measured by the first pass; held before).
  const critNumbedBuffs = resolveCritNumbedBuffs({ setups, activeNames, enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), hitRateFacts: hitRateFacts?.bySetup || null,
    lightningHitters: new Map(skillHitSources.map((source) => [source.setupKey, hitRateFacts?.bySetup?.get(source.setupKey)?.dealsLightning ?? (source.profile?.dealtTypes || [source.profile?.damageType]).includes("Lightning")])) });
  // src/combat-states.js reads plain lines only, so the buff reaches its Numbed through the state (value already × uptime).
  lineConditionState.numbedEffectBuffs = critNumbedBuffs.lines.map((line) => ({ source: line.source, text: line.text, value: Number(line.text.match(/^\+([\d.]+)%/)?.[1]) || 0 }));
  // Activation Medium: Multistrike (Empower buffs and triggered skill hits) reads the build's Max Multistrike Count event rate.
  const multistrikeTriggered = setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.supportEffects?.clauses || []).some((clause) => clause.family === "trigger" && clause.kind === "maxMultistrike"));
  // A rate-driven effect (Grudge's Paralysis chance, Tremble's crit buff, the Max Multistrike Count trigger): this pass measures
  // the rates (the effect held meanwhile, so lines gated on it read alike) and a second pass applies the uptime. Damage taken
  // and damage buffs do not change any hit rate.
  // Consumption cores (core audit batch B3, src/consumption-procs.js): Thunderclap / Waiting Attack (Agility) and Stab In The Back
  // (Blur) settle the share of Main Skill casts that find a stack = min(1, gain rate ÷ cast rate) (Q5, user-confirmed 2026-10-18)
  // from the early Blessing model, the Blur sources and the hit pass's measured rates; Agility's held stacks drop with them (Q14).
  {
    const hasReapingEarly = collectAllReapingSources(modifierTexts).length > 0 || cycleResistReaps(modifierTexts, resolvedMain, activeNames);
    const earlyBlurSources = [...collectBlurSources({ equipment, talents: levelSources.talents, slates: levelSources.slates, setups, activeNames, hasReaping: hasReapingEarly, inflictsWilt: mechanics.enemyAilments.types.some((type) => type.name === "Wilt") }), ...followerBlurSources(followerSelection(state))];
    lineConditionState.consumption = resolveConsumption({ texts: modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).map((line) => String(line.text ?? "").replace(/\s+/g, " ").trim()),
      agility: earlyBlessings.entries.find((entry) => entry.name === "Agility") || null, blurSources: earlyBlurSources, blurActive: requestedConditions.blur !== false && earlyBlurSources.some((source) => source.available),
      castsPerSecond: hitRateFacts?.consumption?.mainUsesPerSecond ?? lineConditionState.mainUsesPerSecond, facts: hitRateFacts?.consumption || null });
    if (lineConditionState.consumption.agilityHeld && lineConditionState.blessingStacks) lineConditionState.blessingStacks.Agility = Math.min(lineConditionState.blessingStacks.Agility ?? 0, lineConditionState.consumption.agilityHeld.stacks);
  }
  // (a core with no source or no Main Skill reads no rate: no measuring pass for it)
  const consumptionCores = [lineConditionState.consumption.agility, lineConditionState.consumption.blur, lineConditionState.consumption.waitingAttack].some((item) => item && item.active !== false);
  // Rate-driven enemy debuffs (core audit batch B4, src/combat-states.js): Juggernaut's stacks follow the player's crit hits per
  // second and Open Wounds' value the Trauma stacks on the dummy; this pass measures both (held at their caps meanwhile).
  // Legendary audit batch 3: Laceration from Trauma (Ralph's Dreadcrest) and damage taken per Wilt stack (Chaos Abyss) read the same pass.
  const rateDebuffCores = modifierTexts.some((line) => line.origin !== "derived" && /a Fire Skill is cast, gains Ash for|Attack Speed for [\d.]+ ?s when Shadows hit enemies|Gains 1 stack of Laceration when inflicting Trauma|additional damage taken \(multiplies\) for enemies for each stack of Wilt they have|for enemies on Critical Strike for [\d.]+ ?s\. Stacks up to \d+ times$|additional Hit Physical Damage taken for every stack of Trauma the enemy has/i.test(String(line.text ?? "")));
  lineConditionState.critHitsPerSecond = hitRateFacts?.critHitsPerSecond ?? null;
  // Gemma – Ice-Fire Fusion (B3): the Fire / Cold skills' casts per second the hit pass measured (Frostfire Rampage's 5 casts).
  lineConditionState.fireColdCastsPerSecond = hitRateFacts?.fireColdCastsPerSecond ?? null;
  const frostfireCasts = lineConditionState.heroId === "gemma-ice-fire-fusion" && modifierTexts.some((line) => line.origin === "trait" && /^Enters Frostfire Rampage after casting Fire or Cold Skills/i.test(String(line.text ?? "").trim()));
  lineConditionState.trauma = hitRateFacts?.trauma ?? null;
  lineConditionState.wilt = hitRateFacts?.wilt ?? null;
  lineConditionState.fireCastsPerSecond = hitRateFacts?.fireCastsPerSecond ?? null;
  lineConditionState.shadowHitsPerSecond = hitRateFacts?.shadowHitsPerSecond ?? null;
  // Youga – Spacetime Illusion (hero trait audit B4): the Main Skill's own cast rate, every cast per second and the character's
  // increased Cast Speed the hit pass measured (Eeeendless Mana's rate, the moon's and I'm Out of Mana's stacks, Make it Quick).
  lineConditionState.yougaSpacetime = hitRateFacts?.youga ?? null;
  // Erika – Lightning Shadow / Vendetta's Sting (hero trait audit B5; src/erika-traits.js): Feline Figure's Numbed state (Charging
  // Tail reads the Main Skill's crit chance the hit pass measured) and the Vendetta's Sting state (Incisive's uptime from the
  // measured Vendetta cycle; held at 1 before).
  lineConditionState.felineFigure = felineFigureState({ heroId: lineConditionState.heroId, modifierTexts, movementSpeedPercent: lineConditionState.movementSpeedPercent, otherNumbed: (lineConditionState.enemyAilments || []).includes("Numbed"), mainUsesPerSecond: lineConditionState.mainUsesPerSecond, critChancePercent: hitRateFacts?.erika?.mainCritChancePercent ?? null });
  lineConditionState.erikaVendetta = vendettaStingState({ heroId: lineConditionState.heroId, modifierTexts, blessingStacks: lineConditionState.blessingStacks, requestedConditions, vendetta: hitRateFacts?.erika?.vendetta ?? null });
  lineConditionState.erikaActivationMediumBlocked = erikaActivationMediumBlocked;
  // Thea (hero trait audit B7; src/thea-traits.js): God's Boon's cadence and the Focus it consumes, the Divine Realm, the dummy deemed
  // at Low Life, Desecration. The Focus held drops to its God's Boon cycle average for the line conditions and the Blessing model.
  lineConditionState.thea = theaState({ heroId: lineConditionState.heroId, modifierTexts, requestedConditions, blessings: earlyBlessings,
    facts: { anyDamage: Boolean(lineConditionState.anyHit || lineConditionState.dealsDamageOverTime || damageSources.some((source) => source.status === "modeled")), dealsErosion: Boolean(lineConditionState.dealtDamageTypes?.has("Erosion") || lineConditionState.hitTypes?.has("Erosion") || (lineConditionState.enemyAilments || []).includes("Wilt")), life: lineConditionState.life, enemyCrowdControl: (lineConditionState.enemyAilments || []).filter((name) => ["Frostbite", "Freeze", "Frozen"].includes(name)) } });
  // Sage – Licorice Note (hero trait audit B8; src/sage-traits.js): the Basic Scent Bottle's Elixir joins the Elixir setups (its
  // Functional Ingredient reads the crit hits and Reaps the hit pass measured), with the Elixir Skill Effect lines Scent of Ambition
  // and Everlasting Nectar add; the Ingredients, prepared Empower / Curse and Elixir of Immortality settle in the module.
  lineConditionState.sage = sageState({ heroId: lineConditionState.heroId, hero: state.hero, modifierTexts, boardElixirs: lineConditionState.elixirSetups || [], requestedConditions, moving: Boolean(lineConditionState.moving),
    facts: { anyHit: Boolean(lineConditionState.anyHit), minionsCrit: Boolean(lineConditionState.minionsCrit), critHitsPerSecond: hitRateFacts ? hitRateFacts.critHitsPerSecond ?? null : null, reapsPerSecond: hitRateFacts?.sage ? hitRateFacts.sage.reapsPerSecond : null, hasReaping: collectAllReapingSources(modifierTexts).length > 0 || cycleResistReaps(modifierTexts, resolvedMain, activeNames) },
    inputs: lineConditionState.sageInputs || {} });
  if (lineConditionState.sage?.elixirSetups?.length) { lineConditionState.elixirSetups = [...lineConditionState.sage.elixirSetups, ...(lineConditionState.elixirSetups || [])]; lineConditionState.elixirSkill = true; }
  const sageRates = Boolean(lineConditionState.sage?.needsRates);
  // Carino (hero trait audit B9; src/carino-traits.js): the ammo cadence (Q-H8), Special Ammo and Magic Shot, Heat Up, Deflection, Evil
  // Ouroboros. The use-rate factor and the Heat Up cycle read the Projectile casts per second the hit pass measured (before it, the
  // rate factor is 1 and Heat Up is held at max), so a Carino build with ammo runs the measuring pass.
  lineConditionState.carino = carinoState({ heroId: lineConditionState.heroId, hero: state.hero, modifierTexts, requestedConditions, moving: lineConditionState.moving !== false, facts: hitRateFacts?.carino ?? null,
    inputs: { ...(lineConditionState.carinoInputs || {}), hasReaping: Boolean(lineConditionState.hasReaping), hitRecently: Boolean(lineConditionState.hitRecently) } });
  const carinoRates = Boolean(lineConditionState.carino?.needsRates);
  // Rehan (hero trait audit B10; src/rehan-traits.js): the Rage cycle (Q-H1), Burst, Tunnel Vision (Q-H15), the Seething Spirit and
  // Disarmed. The cycle reads the uses per second the hit pass measured (before it, Berserk is held), so a Rehan build runs the
  // measuring pass.
  lineConditionState.rehan = rehanState({ heroId: lineConditionState.heroId, modifierTexts, requestedConditions, facts: hitRateFacts?.rehan ?? null, inputs: lineConditionState.rehanInputs || {} });
  const rehanRates = Boolean(lineConditionState.rehan?.needsRates);
  // Rosa (hero trait audit B11; src/rosa-traits.js): High Court Chariot's Holy Domain / Murderous Intent state and Unsullied Blade's
  // Mystic Mercury / Realm of Mercury cycle. The cycle reads the non-Channeled Attack uses per second and the Elemental hit damage the
  // hit pass measured (before it, Mystic Mercury is held and the Realm waits), so an Unsullied Blade build runs the measuring pass.
  lineConditionState.rosa = rosaState({ heroId: lineConditionState.heroId, modifierTexts, requestedConditions, facts: hitRateFacts?.rosa ?? null,
    inputs: { ...(lineConditionState.rosaInputs || {}), enemyAilments: lineConditionState.enemyAilments || [] } });
  const rosaRates = Boolean(lineConditionState.rosa?.needsRates);
  // Bing – Blast Nova's Firepower Coverage (Q-H15): the badge and the switch read it (src/hero-trait-modules.js "bombs").
  lineConditionState.firepowerCoverage = firepowerCoverage;
  // Bing (hero trait audit B12; src/bing-traits.js): Blast Nova's bombs on the Main Skill (Q-H14) and Creative Genius's Whimsy /
  // Ingenuity engine. The bombs read the Main Skill's crit chance and Attack Speed bonus, Creative Genius the Main Skill's casts and
  // Spell Burst activations the hit pass measured (before it, the Overload waits), so a Bing build runs the measuring pass.
  {
    const bingTags = (setup) => new Set(setup?.tags || []);
    lineConditionState.bing = bingState({ heroId: lineConditionState.heroId, modifierTexts, requestedConditions, facts: hitRateFacts?.bing ?? null,
      inputs: { main: resolvedMain ? { name: resolvedMain.name, setupKey: resolvedMain.setupKey, tags: [...bingTags(resolvedMain)], channeled: /channel/.test(inferDamageProfile(resolvedMain)?.useModel?.kind || "") } : null,
        moving: Boolean(lineConditionState.moving), buildMaxSpellBurst,
        dealsSpell: damageSources.some((source) => source.status === "modeled" && bingTags(setups.find((setup) => setup.setupKey === source.setupKey)).has("Spell")),
        empowerDefensive: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (bingTags(setup).has("Empower") || bingTags(setup).has("Defensive"))).map((setup) => setup.name) } });
    if (lineConditionState.bing) lineConditionState.bing.facts = hitRateFacts?.bing ?? null;
  }
  const bingRates = Boolean(lineConditionState.bing?.needsRates);
  // Selena leftovers (hero trait audit B13; src/selena-leftover-traits.js, provisional): Lonely Ensemble's Crimson Shades on the Main
  // Terra's hits (switch crimsonShadeHits) and Red Shoes of Cruelty's damage taken from the Movement Speed bonus; the hero modules
  // (src/hero-trait-modules.js "crimsonShade" / "redShoes") carry the badges and the derived damage-taken line.
  lineConditionState.crimsonShade = crimsonShadeState({ heroId: lineConditionState.heroId, modifierTexts, maxSpellBurst: buildMaxSpellBurst, mainIsTerra: danceOfTheDeep.mainIsTerra, requestedConditions });
  lineConditionState.redShoes = redShoesState({ heroId: lineConditionState.heroId, modifierTexts, mainIsTerra: danceOfTheDeep.mainIsTerra, movementSpeedPercent: lineConditionState.movementSpeedPercent,
    activationMediumTerra, amIntervalSeconds: activationMediumTerra.active ? activationMediumTerraInterval(danceOfTheDeep.charges) : 0 });
  const theaFocus = lineConditionState.thea?.wisdom?.cycle ? lineConditionState.thea.wisdom.cycle.averageFocus : null;
  if (theaFocus !== null && lineConditionState.blessingStacks) lineConditionState.blessingStacks.Focus = Math.min(lineConditionState.blessingStacks.Focus ?? 0, theaFocus);
  const erikaRates = Boolean(lineConditionState.felineFigure?.tail || lineConditionState.erikaVendetta?.granted);
  const yougaIllusionRates = lineConditionState.heroId === "youga-spacetime-illusion" && modifierTexts.some((line) => line.origin === "trait" && /^The Spacetime Illusion uses your Main Skill once every/i.test(String(line.text ?? "").trim()));
  const probeDebuffHitRates = !debuffHitRates && (lineConditionState.chanceParalysis.length > 0 || critNumbedBuffs.entries.length > 0 || multistrikeTriggered || consumptionCores || rateDebuffCores || frostfireCasts || yougaIllusionRates || erikaRates || sageRates || carinoRates || rehanRates || rosaRates || bingRates);
  if (probeDebuffHitRates) skipVariation = true;
  // Moto / Iris (hero trait audit B6; src/moto-iris-traits.js): the loadout's trait state, before the line effects (its module
  // entries and best-case switches) and the Minions (their trait inputs); the badges settle after the Minion pass.
  lineConditionState.motoIris = motoIrisState({ heroId: lineConditionState.heroId, modifierTexts, requestedConditions, command: commandState(modifierTexts, { full: requestedConditions.fullCommand !== false, minionsCrit: Boolean(lineConditionState.minionsCrit) }),
    stats: { maxLife: lineConditionState.stats?.maxLife, maxEnergyShield: lineConditionState.stats?.maxEnergyShield, armor: lineConditionState.worldWithinInputs?.armor }, castSpeedPercent: lineConditionState.castSpeedStatPercent,
    minions: damageSources.filter((source) => source.status === "modeled" && source.profile?.engine === "minion").map((source) => ({ key: source.profile.minionKey, family: source.profile.family, minion: source.profile.minion })),
    traitSupports: state.hero?.heroTraitSupports || {} });
  const lineEffects = resolveLineEffects(modifierTexts, lineConditionState);
  // Prophecy of Punishment (Thea – Wisdom of The Gods; src/thea-traits.js): Lucky Damage for the share of time Focus equals Agility,
  // as the fractional roll count with the same expected roll (provisional); a Lucky line of the build keeps its own count.
  const theaLuckyRolls = lineConditionState.thea?.wisdom?.punishment?.share > 0 ? lineConditionState.thea.wisdom.punishment.luckyRolls : 1;
  if (theaLuckyRolls > 1 && lineEffects.combat?.lucky) lineEffects.combat.lucky.damageRolls = Math.max(lineEffects.combat.lucky.damageRolls || 1, theaLuckyRolls);
  lineEffects.lines.push(...dormantEntanglementLineEntries(tangles, modifierTexts), ...tangleLineEntries(tangles, modifierTexts));
  lineEffects.state = lineConditionState;
  // Aura-added Cast Speed (src/aura-gained-effects.js; Pantheon's Elegy on Precise: Swiftness): the active Aura's added effect,
  // scaled by its Aura Effect (provisional), joins the cast-rate ledger every Cast Speed reader uses.
  for (const line of auraCastSpeedLines(aura.entries)) { lineEffects.castSpeed.increasedPercent += line.value; lineEffects.castSpeed.sources.push(line); }
  // Periodic Burst's time-averaged Attack and Cast Speed (src/periodic-burst.js): a derived line, which the line resolver leaves
  // out, so its Cast Speed half joins the cast-rate ledger here (the weapon Attack Speed model reads the line itself).
  for (const line of periodicBurst.lines) { const value = Number(line.text.match(/^\+([\d.]+)%/)?.[1]) || 0; lineEffects.castSpeed.increasedPercent += value; lineEffects.castSpeed.sources.push({ source: line.source, text: line.text, value, origin: "derived" }); }
  // The Aura's other added-effect clauses without an Aura stat key (src/aura-gained-effects.js): derived plain lines scaled by its
  // Aura Effect (provisional), read by every engine like a resolved conditional body.
  lineEffects.auraGained = auraGainedEffectLines(aura.entries);
  lineEffects.derived.push(...lineEffects.auraGained);
  if (lineEffects.derived.length) { modifierTexts.push(...lineEffects.derived); mechanics = collectMechanics(); }
  modifierTexts.push(...mechanics.syntheticTexts);
  // Active auras' "+X% additional Physical/Erosion Damage" (e.g. Weapon Amplification, Erosion
  // Amplification) reach Trauma / Wilt when the build inflicts them (src/aura-damage.js).
  const auraAilmentDamageTypes = new Set([["trauma", "Physical"], ["wilt", "Erosion"]].filter(([key]) => hasAilmentBase(key, modifierTexts)).map(([, type]) => type));
  for (const source of skillDotSources) auraAilmentDamageTypes.add(source.profile.damageType);
  for (const source of skillHitSources) for (const type of source.profile.dealtTypes || []) auraAilmentDamageTypes.add(type);
  modifierTexts.push(...auraDamageModifierTexts(aura.entries, auraAilmentDamageTypes));
  // "Bonus and additional bonus to Spell Damage … also apply to Attack Damage" (Rosa – Unsullied Blade; hero trait audit B2,
  // src/spell-to-attack.js): the Spell damage lines, resolved conditional bodies and Aura lines included, copied to Attack.
  const spellToAttack = spellToAttackLines(modifierTexts);
  if (spellToAttack.copies.length) modifierTexts.push(...spellToAttack.copies);
  for (const line of spellToAttack.sources) {
    const attackSkill = lineConditionState.activeTags?.has?.("Attack");
    const active = Boolean(attackSkill && spellToAttack.copies.length);
    lineEffects.lines.push({ source: line.source, origin: line.origin, text: normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim(), condition: "spellToAttack", params: {}, group: null, active,
      conditionText: !attackSkill ? "no active Attack skill" : !spellToAttack.copies.length ? "no Spell Damage line in the build" : `${spellToAttack.copies.length} Spell Damage line${spellToAttack.copies.length === 1 ? "" : "s"} also reach Attack skills (${spellToAttack.copies.map((copy) => copy.text).join(", ")}; provisional)`,
      provisional: true, factor: null, bodies: spellToAttack.copies.map((copy) => ({ body: copy.derivedFrom, derivedText: copy.text, readers: ["hit"] })), status: active ? "In calc" : "Inactive" });
  }
  // Curse skills whose Lv.20 text is "Cursed enemies +X% additional <Type> Damage taken" (e.g. Corruption:
  // Erosion) become a typed damage-taken line scaled by Curse Effect; Scorch and Entangled Pain keep their
  // dedicated models. The level-20 value is used (no level table is published for these curses).
  // Both published wordings are read (src/curse-effects.js; gear-pact batch G3): "+X% additional <Type> Damage taken by
  // Cursed enemies" (Timid: Hit, Electrocute: Lightning, Vulnerability: Physical) read nothing before 2026-10-12.
  // Timid's "Hit Damage taken" reaches every hit (skill hits; the beam hit ledger below), never a DoT or ailment.
  for (const setup of setups) {
    if (!isCurseSkill(setup) || !activeNames.has(setup.name)) continue;
    // Deepened Curse ("Enemies take X% additional damage if affected by curses inflicted by the supported skill for at least
    // N s"; src/support-effects.js family curseTaken; 2026-10-18): the curse stays on the dummy (curse uptime is continuous), so
    // the debuff holds in sustained figures; the windows start it N s after engagement (the dummy starts clean, the curse lands
    // at t = 0). It is an untyped derived "additional damage taken" line: the generic skill hits read it; the skill-DoT and ailment
    // ledgers read typed taken lines only, so they do not take it yet (open; no DoT in the build that raised it). It read No DPS effect before.
    for (const line of setup.supportEffects?.curseTaken || []) {
      if (!(line.value > 0)) continue;
      const source = `${setup.name}: ${line.support} (curse on the dummy for ${line.delaySeconds} s or more)`;
      modifierTexts.push({ text: `+${line.value}% additional damage taken`, source, origin: "derived", multiplier: 1 });
      (lineEffects.combat.timedEffects ||= []).push({ id: `curseTaken:${setup.setupKey}:${line.support}`, label: source, source, text: line.text, target: "enemy", toggle: false, enabled: true, active: true, provisional: false,
        parts: [{ type: null, reach: "all", percent: line.value, schedule: { kind: "steps", points: [[0, 0], [line.delaySeconds, 1]], sustained: 1 } }] });
    }
    const effect = curseTakenEffect(setup.name, setup.effects?.length ? setup.effects : undefined);
    if (!effect) continue;
    const line = curseTakenLine(effect, mechanics.curses.effectPercent);
    const source = `${setup.name} curse (Lv.20 value × ${1 + mechanics.curses.effectPercent / 100} Curse Effect)`;
    modifierTexts.push({ text: line.text, source, origin: "derived", multiplier: 1 });
    if (effect.type === "Hit" && activeNames.has("Scorching Beam")) mechanics.hit.push({ source, bucket: "additional", percent: line.value, text: line.text });
  }
  // Item-granted supports (src/gear-unique-modules.js): their tooltip lines read through the build-mechanics notes.
  for (const grant of itemGrantedSupports) {
    if (grant.name === "Cataclysm" && activeNames.has("Scorching Beam")) continue;
    const note = !grant.active ? `Inactive: ${grant.reason}` : !catalogSupportsByName.has(grant.name) ? `Not modeled: ${grant.name} is not a known support` : grant.target === "tag" ? `Granted support: ${grant.name} Lv.${grant.level} on every ${grant.tag} Skill (provisional)` : grant.target === "passive" ? `Granted support: ${grant.name} Lv.${grant.level} on ${grant.rows ? `the ${grant.rows.first != null ? `first ${grant.rows.first}` : `last ${grant.rows.last}`} Passive Skill slots` : "every Passive Skill slot"} (provisional)` : `Granted support: ${grant.name} Lv.${grant.level} on the Main Skill (provisional)`;
    mechanics.recognized.set(normalizeLineText(grant.text), note);
  }
  // Per-stat Double Damage on the beam ("+1% chance to deal Double Damage per 10 Strength, up to +30%"; gear-pact batch
  // chunk 4): build-mechanics reads the flat chances; the stat-sheet total is known here. The beam's Double Damage is one
  // chance pool (manual: chances stack before the roll), so the flat and per-stat parts are recombined into one factor.
  if (activeNames.has("Scorching Beam")) {
    const beamTags = [...(setups.find((setup) => setup.name === "Scorching Beam")?.tags || []), "Channeled"];
    const all = doubleDamageForSkill(modifierTexts, { tags: beamTags, stats: lineConditionState.stats });
    const flat = doubleDamageForSkill(modifierTexts.filter((line) => !/ per \d+ (?:Strength|Dexterity|Intelligence)/i.test(line.text)), { tags: beamTags });
    if (all.factor !== flat.factor) {
      mechanics.hit.push({ source: `Double Damage per stat (${all.sources.filter((line) => / per \d+ /.test(line.text)).map((line) => line.source).join(", ")})`, bucket: "additional", percent: (all.factor / flat.factor - 1) * 100, text: `${Math.round(all.chancePercent * 100) / 100}% total Double Damage chance → ×${Math.round(all.factor * 10000) / 10000} expected (the per-stat part on top of ×${Math.round(flat.factor * 10000) / 10000})` });
      for (const line of all.sources.filter((item) => / per \d+ /.test(item.text))) mechanics.recognized.set(normalizeLineText(line.text), "Double Damage chance per stat (hits)");
    }
  }
  // Focus skills (e.g. Corrosion Focus): the activated Focus buff's "X% additional <Type> Damage" (TLIDB level
  // table) holds while the skill is active (it is reserved like an aura). Precise: Acuteness arrives through the
  // Kismet Focus Buff path in build-mechanics.js. The orb hits, Grudge and Focus Acceleration stay unmodeled.
  for (const setup of setups) {
    if (!activeNames.has(setup.name) || !(setup.tags || []).includes("Focus") || /^Precise: /.test(setup.name)) continue;
    const level = Math.max(1, Math.min(40, Math.round(setup.effectiveLevel || 20)));
    const tableLine = skillProgressionSs13[setup.name]?.levels?.[String(level)]?.changes?.map(([, text]) => String(text)).find((text) => /^[\d.]+% additional \w+ Damage$/i.test(text));
    const referenceLine = (setup.effects || []).join("\n").split(/\r?\n/).map((text) => text.trim()).find((text) => /^[\d.]+% additional \w+ Damage$/i.test(text));
    const match = (tableLine || referenceLine || "").match(/^([\d.]+)% additional (\w+) Damage$/i);
    if (match) modifierTexts.push({ text: `+${match[1]}% additional ${match[2]} Damage`, source: `${setup.name}: Focus buff (Lv.${level}, ${tableLine ? "TLIDB level table" : "TLIDB Lv.20 text"})`, origin: "derived", multiplier: 1 });
  }
  // Pact lines conditional on Full Life (Firewing "+80% Affliction effect at Full Life", "10.5 Affliction inflicted
  // per second on Full Life"): the dummy never attacks and Energy Shield absorbs stray damage, so Full Life holds
  // (assumption; condition fullLife) unless Sealed Life leaves under 95% of Max Life unsealed: Full Life is unsealed,
  // filled Life at least 95% of Max Life (user-confirmed 2026-10-12), so such a build is never at Full Life and the
  // lines are off. They join the pact totals the ledger reads; the Pacts page totals are untouched.
  const fullLifeHolds = atFullLife(lineConditionState);
  const fullLife = { active: requestedConditions.fullLife !== false && fullLifeHolds, sealedOut: !fullLifeHolds && !lineConditionState.lowLifeAssumed, lifeRemainingPercent: lineConditionState.lifeRemainingPercent, afflictionEffectPercent: 0, afflictionPerSecond: 0, lines: [] };
  for (const line of modifierTexts) {
    let match = line.text.match(/^\+(\d+(?:\.\d+)?)% Affliction effect (?:at|on) Full Life\.?$/i);
    if (match) { fullLife.lines.push({ source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1), category: "Affliction effect" }); fullLife.afflictionEffectPercent += Number(match[1]) * (line.multiplier ?? 1); continue; }
    match = line.text.match(/^\+?(\d+(?:\.\d+)?) Affliction inflicted per second (?:at|on) Full Life\.?$/i);
    if (match) { fullLife.lines.push({ source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1), category: "Affliction per second" }); fullLife.afflictionPerSecond += Number(match[1]) * (line.multiplier ?? 1); }
  }
  conditions.fullLife = fullLife.active;
  const ledgerPact = fullLife.active && fullLife.lines.length ? { ...pact, totals: { ...pact.totals, afflictionEffectPercent: (pact.totals.afflictionEffectPercent || 0) + fullLife.afflictionEffectPercent, afflictionPerSecond: (pact.totals.afflictionPerSecond || 0) + fullLife.afflictionPerSecond } } : pact;
  if (state.hero.selectedTraits.level45 !== "Wave Aria" || !conditions.tideContact) conditions.waveAria = false;
  conditions.idyll = state.hero.selectedHeroId === "selena-sing-with-the-tide" && state.hero.selectedTraits.level60 === "Idyll of the Tide" && conditions.tideContact !== false && requestedConditions.idyll !== false;
  // Selena (Sing with the Tide) trait state (src/selena-tide.js; Selena traits batch 2026-10-13): trait levels, the Tide Effect
  // scale (Murmurs, Loud Song via Ceaseless Tide, Sea Foam, Undersea Ballad, Chantey of Sinking), the enemy-on-Tide entry, the
  // lines the generic skill hits read and the Artificial Moon lines (base trait Lv5 with an Artificial Moon memory).
  // Bard Song (user-stated 2026-10-13, uncertain: in Bard it turns non-channeled skills into channeled ones; hero trait audit B13 models
  // it from the TLIDB keyword: 0.8 s channel interval, 4 stacks, one use per bubble; src/selena-leftover-traits.js bardSongState, switch
  // bardSongChannel). The record lists the build's modeled damage skills without a Channeled or Mobility tag; the hit model applies
  // the bubble cadence to those it casts manually (instant skills cannot be told apart in the data).
  const bardSongSkills = damageSources.filter((source) => source.status === "modeled").map((source) => setups.find((setup) => setup.setupKey === source.setupKey)).filter((setup) => setup && !(setup.tags || []).some((tag) => tag === "Channeled" || tag === "Mobility")).map((setup) => setup.name);
  const singWithTheTide = resolveSingWithTheTide({ state, conditions, heroMemories, traitLevelBonus, modifierTexts, channel: mechanics.channel, idyllStacks: state.combat.idyllStacks, bardSongSkills: [...new Set(bardSongSkills)], requestedConditions });
  const { enemyOnTideDamageTakenPercent, waveAriaPercent, idyllPerStackPercent, murmursTideEffectPercent, seaFoamNocturne, tideEffectFactor } = singWithTheTide;
  if (singWithTheTide.artificialMoon.lines.length) modifierTexts.push(...singWithTheTide.artificialMoon.lines);
  const coreTalents = calculateCoreTalents(coreNames, { remainingEnergy: allocation.remaining, blur: false });
  // "The Fire Resistance of Frostbitten enemies is fixed at X%" (Ice to Blaze; hero trait audit B2, src/line-conditions.js key
  // fixedFireResistanceFrostbitten): while the dummy is Frostbitten its Fire Resistance is X, as Fueling fixes it at 0 (no Scorch,
  // Fire's Allure or max-Affliction reduction changes it; penetration still applies). Fueling wins; several lines: the lowest.
  const frostbittenFixedFire = (lineEffects.lines || []).filter((entry) => entry.condition === "fixedFireResistanceFrostbitten" && entry.active).map((entry) => entry.params.value);
  if (!coreTalents.fixesFireResistance && frostbittenFixedFire.length) coreTalents.fixedFireResistancePercent = Math.min(...frostbittenFixedFire);
  const fixedFireResistance = coreTalents.fixesFireResistance ? 0 : coreTalents.fixedFireResistancePercent ?? null;
  const damageCombat = { ...state.combat, targetFireResistancePercent: fixedFireResistance ?? state.combat.targetFireResistancePercent, idyllStacks: conditions.idyll ? state.combat.idyllStacks : 0 };
  // Talent nodes (captured or text, src/talent-text-effects.js) and slate copies of Warlord [5,2] inflict Fire Infiltration.
  if (!talent.setup.panels.some((panel) => panel.allocatedNodes.some((node) => node.rank > 0 && node.effects?.inflictsFireInfiltrationAgainstIgnited)) && !(talentSlate.candidateSlate?.inflictsFireInfiltrationAgainstIgnited > 0)) conditions.fireInfiltration = false;
  // Aim charges and uptime are derived from the build (aim-model.js); an explicit
  // aimCharges or a non-sentinel aimUptimePercent in the state is a manual override.
  // "Triggers Lv. 30 Aim while standing still. Interval: 1 s" (gear affix batch D, 2026-10-22; src/item-triggered-skills.js): with no
  // Aim on the skill board, the item casts a Lv. N Aim while standing still (the movement group), at most once per Aim's cooldown
  // (the Activation Medium rule: rate = 1 / max(trigger interval, cooldown); provisional). Aim's 35% is its Lv.20 value at any other
  // level (src/aim-model.js; no level table is published).
  const boardAim = setups.find((setup) => setup.name === "Aim" && setup.enabled !== false && activeNames.has(setup.name));
  const gearAim = boardAim ? null : modifierTexts.filter((line) => line.origin !== "derived").map((line) => ({ line, trigger: parseItemTrigger(line.text) })).find((item) => item.trigger?.name === "Aim" && item.trigger.intervalSeconds > 0) || null;
  const gearAimEvent = gearAim ? itemTriggerEvent(gearAim.trigger, { moving: conditions.moving }) : null;
  const gearAimSetup = gearAimEvent?.active && requestedConditions.aim !== false ? { ...(catalogSkillsByName.get("Aim") || {}), name: "Aim", role: "item-trigger", baseLevel: gearAim.trigger.level, addedLevels: 0, effectiveLevel: gearAim.trigger.level, supports: [], enabled: true, setupKey: "item-trigger:Aim" } : null;
  if (gearAimSetup) conditions.aim = true;
  const aim = calculateAim(boardAim || gearAimSetup || setups.find((setup) => setup.name === "Aim"), { enabled: conditions.aim !== false, uptimePercent: state.combat.aimUptimePercent, charges: state.combat.aimCharges, battleStacks: state.combat.aimBattleStacks ?? 3, modifierTexts,
    itemTrigger: gearAimSetup ? { source: gearAim.line.source, everySeconds: gearAim.trigger.intervalSeconds, text: `${gearAim.line.source}: every ${gearAim.trigger.intervalSeconds} s while standing still` } : null });
  damageCombat.aimDamagePercent = aim.ailmentDamagePercent;
  damageCombat.aimUptimePercent = aim.uptimePercent;
  damageCombat.aimUptimeLabel = aim.uptimeLabel;
  const curses = curseEffects(setups);
  if (!activeNames.has("Scorch") && mechanics.curses.gearScorch) curses.scorchDamagePercent = mechanics.curses.gearScorch.percent;
  const memoryEquipment = { ...equipment, candidate: { ...equipment.candidate } };
  for (const [key, value] of Object.entries(heroMemories.totals)) memoryEquipment.candidate[key] = (memoryEquipment.candidate[key] || 0) + value;
  for (const line of block.ratingSources) memoryEquipment.candidate["spellCriticalStrikeRatingPercent:increased"] = (memoryEquipment.candidate["spellCriticalStrikeRatingPercent:increased"] || 0) + line.value;
  let beamCastRate = scorchingBeamCastRate({ lineSpeed: lineEffects.castSpeed, ceaselessTide: heroMemories.ceaselessTide, main, talentSlate, equipment: memoryEquipment, pact, aimCastSpeedPercent: aim.averageCastSpeedPercent });
  let theoretical = compileScorchingBeamIgniteSources({ extraSources: { ...mechanics.ignite, intelligence: mechanics.intelligence, fieryFantasy: coreNames.has("Fiery Fantasy"), chanceToDamage: modifierTexts.filter((line) => CHANCE_TO_DAMAGE.test(String(line.text).trim())) }, block, coreTalents, enemyOnTideDamageTakenPercent, tideEffectFactor, waveAriaPercent, idyllPerStackPercent, heroMemories, main, setups, activeNames, talentSlate, equipment, pact: ledgerPact, pactState: state.pacts, aura, igniteLimit, combat: damageCombat, conditions, heroId: state.hero.selectedHeroId, useEffectiveSupportLevels: state.talents.useCapturedRanks === false, reapingApplicationAttemptsPerSecond: beamCastRate.castsPerSecond });
  const canIgnite = activeNames.has("Scorching Beam") && theoretical.totals.baseIgniteDamage.max > 0 && theoretical.totals.applicationChancePercent > 0;
  if (!canIgnite) conditions.fireInfiltration = false;
  // Other damaging ailments (Trauma, Wilt) can also carry Affliction.
  const otherAilmentBase = ["trauma", "wilt"].some((key) => hasAilmentBase(key, modifierTexts));
  if (!(canIgnite || (activeNames.has("Scorching Beam") && otherAilmentBase) || skillDotSources.length || skillHitDotSources.length) || theoretical.townTooltip.passiveAfflictionPerSecond + skillDotAfflictionRate <= 0) conditions.affliction = false;
  // Automatic mode derives the dummy's Affliction rating from the build: Affliction per second,
  // capped at 100, reset by Reaps that remove Affliction (affliction-rating.js). Manual mode keeps
  // the configured average. Affliction per second and Reap recovery do not depend on the rating.
  const resolveAfflictionRating = (compiled) => {
    if (state.combat.conditionMode === "manual") return null;
    const derived = deriveAfflictionRating({ afflictionPerSecond: compiled.townTooltip.passiveAfflictionPerSecond + skillDotAfflictionRate, removers: compiled.combat.afflictionRemovers || [] });
    damageCombat.afflictionAverage = derived.rating;
    damageCombat.afflictionDerivation = derived.text;
    return derived;
  };
  let afflictionRating = resolveAfflictionRating(theoretical);
  const configuredFor = () => calculateConfiguredCombatDamage(combat, { ...state.combat, afflictionAverage: damageCombat.afflictionAverage, conditions, ...curses, sourceDamageMultiplier, enemyOnTideDamageTakenPercent, tideEffectFactor, waveAriaPercent, idyllPerStackPercent, aimDamagePercent: aim.ailmentDamagePercent, aimUptimePercent: aim.uptimePercent });
  let configured = configuredFor();
  const firesAllure = calculateFiresAllure({ active: coreTalents.firesAllure, limit: igniteLimit,
    canApply: canIgnite,
    nearby: conditions.firesAllureNearby !== false, stacks: state.combat.firesAllureScorchStacks,
    baseResistance: state.combat.targetFireResistancePercent, fixedResistance: fixedFireResistance ?? false });
  damageCombat.targetFireResistancePercent = firesAllure.effectiveResistancePercent;
  // Sun's Embrace "Additionally increases Ignited enemies' Fire Resistance by X%" (src/ignited-fire-resistance.js): while the
  // build keeps the dummy Ignited (Ignite, or Scorch, which carries the Ignited state), the flat Fire Resistance sum above
  // (the dummy's 30% less Scorch and Fire's Allure) is multiplied, before the cap and before penetration (sourced order).
  const ignitedResistance = ignitedFireResistance({ modifierTexts, ignited: canIgnite || mechanics.enemyAilments.types.some((type) => type.name === "Ignite"),
    basePercent: state.combat.targetFireResistancePercent, reductionPercent: firesAllure.resistanceReductionPercent, fixed: fixedFireResistance ?? false });
  damageCombat.targetFireResistancePercent = ignitedResistance.dotPercent;
  damageCombat.ignitedFireResistance = ignitedResistance;
  const hasReaping = Boolean(theoretical.combat.reaping?.sources.some(source => source.minimum.triggersPerSecond > 0))
    || (activeNames.has("Scorching Beam") && otherAilmentBase && collectAllReapingSources(modifierTexts).length > 0)
    || ((skillDotSources.length > 0 || skillHitDotSources.length > 0) && (collectAllReapingSources(modifierTexts).length > 0 || skillDotSources.some((source) => source.profile.builtInReaping) || skillHitSources.some((source) => source.profile.builtInReaping)))
    // The Cycle I Resist Reaps on every Main Terra recast (src/selena-dance.js), as the early Blessing model counts it.
    || cycleResistReaps(modifierTexts, resolvedMain, activeNames);
  const blurSources = collectBlurSources({ equipment, talents: levelSources.talents, slates: levelSources.slates, setups, activeNames, hasReaping, inflictsWilt: mechanics.enemyAilments.types.some((type) => type.name === "Wilt") });
  // The follower's Tartarus: Thunder Spike "Grants you Blur when the Shadows of this skill hit" (src/follower-model.js, 2026-10-17).
  blurSources.push(...followerBlurSources(followerSelection(state)));
  conditions.blur = requestedConditions.blur !== false && blurSources.some(source => source.available);
  // Automatic mode resolves Blur active vs within 3 s after it ends (exclusiveConditionGroups); report the resolved pair.
  if (state.combat.conditionMode !== "manual" && conditions.blur) conditions.blurRecentlyEnded = false;
  const blurEffects = calculateBlurEffects({ equipment, talents: levelSources.talents, slates: levelSources.slates, active: conditions.blur, hasSource: blurSources.some(source => source.available), recentlyEnded: requestedConditions.blurRecentlyEnded === true });
  // Subtle Impact as an equipped slate's core talent (Pedigree of Gods "<God>: Lv.N Core Talent: Subtle Impact — …"; 2026-10-17,
  // research/patch-ss14/new-build-gap-2026-10-17.md): the same core as the panel's, read the same way while Blur is active and
  // counted once. Before, only the panel's core was read and the slate's line stayed Not modeled. A "[Subtle Impact]" gear
  // grant reads the same way (core audit batch B1; grantedCores above).
  const subtleImpactGrant = talent.activeCores.has("Subtle Impact") ? null : grantedCores.get("Subtle Impact");
  if (conditions.blur && coreNames.has("Subtle Impact")) {
    const subtleImpactLines = calculateCoreTalents(new Set(["Subtle Impact"]), { blur: true }).lines.filter(line => line.source === "Subtle Impact");
    coreTalents.lines.push(...(subtleImpactGrant ? subtleImpactLines.map((line) => ({ ...line, source: `Subtle Impact (${subtleImpactGrant})` })) : subtleImpactLines));
    theoretical = compileScorchingBeamIgniteSources({ extraSources: { ...mechanics.ignite, intelligence: mechanics.intelligence, fieryFantasy: coreNames.has("Fiery Fantasy"), chanceToDamage: modifierTexts.filter((line) => CHANCE_TO_DAMAGE.test(String(line.text).trim())) }, block, coreTalents, enemyOnTideDamageTakenPercent, tideEffectFactor, waveAriaPercent, idyllPerStackPercent, heroMemories, main, setups, activeNames, talentSlate, equipment, pact: ledgerPact, pactState: state.pacts, aura, igniteLimit, combat: damageCombat, conditions, heroId: state.hero.selectedHeroId, useEffectiveSupportLevels: state.talents.useCapturedRanks === false, reapingApplicationAttemptsPerSecond: beamCastRate.castsPerSecond });
  }
  // Loud Song (Selena with Ceaseless Tide, deemed Loud Song while Bard): "-20% additional Attack and Cast Speed". The cast part
  // is in the cast-rate ledger (src/scorching-beam-cast-rate.js); the attack part reaches the weapon's attack speed here.
  const loudSongSpeedLines = singWithTheTide.ceaselessTide ? [{ text: "-20% additional Attack Speed", source: "Selena: Loud Song (Ceaseless Tide)", origin: "derived", multiplier: 1 }] : [];
  let weaponAttack = calculateWeaponAttack({ equipment, disabledSlots: state.disabledEquipmentSlots, modifierTexts: loudSongSpeedLines.length ? [...modifierTexts, ...loudSongSpeedLines] : modifierTexts });
  // Blessing "on hit" / "on Critical Strike" gains (talent batch T3): any modeled hitting source holds them, not only
  // Scorching Beam: the beam, every modeled spell or attack hit (src/skill-hit-model.js profiles). Crit from that
  // source's own crit chance (spell crit model with the setup's supports; attacks: the weapon model's rating).
  const hittingSetups = skillHitSources.map((source) => source.setup).filter(Boolean);
  const blessingCanHit = activeNames.has("Scorching Beam") || hittingSetups.length > 0;
  const blessingCanCrit = (activeNames.has("Scorching Beam") && scorchingBeamCritical({ main, talentSlate, equipment: memoryEquipment, pact }).criticalChancePercent > 0)
    || skillHitSources.some((source) => source.profile.weaponScaling ? weaponAttack.crit.chancePercent > 0 : scorchingBeamCritical({ main: source.setup, talentSlate, equipment: memoryEquipment, pact }).criticalChancePercent > 0);
  // Ethereal Prism core clauses reach the Blessing model like a panel core's text (core audit B7: Commander's Gambit's "-100% additional
  // Tenacity Blessing, Agility Blessing, and Focus Blessing Effect"; the panel cores arrive through levelSources.talents).
  const prismCoreBlessingLines = modifierTexts.filter((line) => line.origin === "core" && line.grantedCore && /\(Ethereal Prism\)/.test(String(line.source))).map((line) => ({ text: line.text, source: line.source }));
  // Miraculous Gain (Miraculous Touch; src/elixir-model.js miraculousGainState, user-supplied 2026-10-19): the Blessings maxed for a
  // share of the time and 10 Main Skill triggers per gain, averaged over the Elixir casts.
  const miraculousGain = miraculousGainState(lineEffects.combat?.elixir || null, modifierTexts);
  const blessings = calculateBlessings({ minionsDealDamage: Boolean(lineConditionState.minionsCrit), elixirCasts: Boolean(lineConditionState.elixirSkill), mobilityUsed, tangleCasts: tangles.setups.length > 0, fillShare: miraculousGain?.blessingShare || 0, fillSource: miraculousGain ? "Miraculous Gain (Miraculous Touch)" : null, extraLines: [...lineEffects.blessing, ...prismCoreBlessingLines, ...(theaInputs?.lines || [])], capRules: theaInputs?.capRules || null, stackOverrides: { ...(lineConditionState.consumption?.agilityHeld ? { Agility: lineConditionState.consumption.agilityHeld } : {}), ...(theaFocus !== null ? { Focus: { stacks: theaFocus, reason: "God's Boon consumes every Focus stack (Thea – Wisdom of The Gods: its cycle average, Q-H3)" } } : {}) }, stackUsers: new Set((lineEffects.lines || []).filter((line) => line.active && /^blessing/.test(line.condition || "")).map((line) => line.params?.name).filter(Boolean)), stackUserTexts: modifierTexts.map((line) => String(line.text)), hitRecently: requestedConditions.blockedRecently !== false, canUseNonMain: setups.some(setup => setup.role !== "main" && setup.role !== "aura" && activeNames.has(setup.name)), pactState: state.pacts, talentState: state.talents, equipment, talents: levelSources.talents, slates: levelSources.slates, barrierSources, hasReaping, block, moving: conditions.moving, canHit: blessingCanHit, canCrit: blessingCanCrit, enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), igniteOnTarget: canIgnite, spellHitActive: activeNames.has("Scorching Beam") });
  // Focus Blessing stacks from the blessing model: Overload's "for each stack of Focus Blessing" lines (B1) on every
  // setup, and the main skill's pending per-stack lines on the beam hit ledger and the Ignite ledger.
  const focusBlessingStacks = blessings.entries.find((entry) => entry.name === "Focus")?.stacks ?? 0;
  // Blessings on the generic hit engines (talent batch T3): the stacks a modeled hit source now gains also act on those
  // hits, as they do on the beam: per-stack additional damage as hit-only lines (Spell-scoped ones for Spells only), and
  // Agility's Attack and Cast Speed on the weapon model's attack speed (spells read it from the cast-rate ledger).
  // DoTs and ailments already take the Blessing lines through the Ignite ledger.
  const blessingHitLines = [
    ...blessings.damageSources.map((line) => ({ text: `${line.value >= 0 ? "+" : ""}${Math.round(line.value * 10000) / 10000}% additional ${line.skillTags ? `${line.skillTags.join(" ")} ` : ""}Hit Damage`, source: `${line.source} (blessing model)`, origin: "derived", multiplier: 1 })),
    ...(blessings.increasedSources || []).map((line) => ({ text: `${line.value >= 0 ? "+" : ""}${Math.round(line.value * 10000) / 10000}% Hit Damage`, source: `${line.source} (blessing model)`, origin: "derived", multiplier: 1 })),
    // A changed base effect "Adds Physical Damage equal to X% of Max Mana to Attacks and Spells" per stack (residual batch):
    // added flat on skill hits and attacks (the beam's added-damage reader takes Fire / Cold / Lightning only).
    ...(blessings.entries || []).filter((entry) => entry.addedPhysicalPercentOfMaxMana > 0).map((entry) => { const value = Math.round(entry.addedPhysicalPercentOfMaxMana / 100 * (lineConditionState.stats?.maxMana || 0) * 10000) / 10000; return { text: `Adds ${value} - ${value} Physical Damage to Attacks and Spells`, source: `${entry.name} Blessing changed base effect (${entry.stacks} stacks × ${entry.baseChange.addedPhysicalPercentOfMaxMana}% of ${Math.round(lineConditionState.stats?.maxMana || 0)} Max Mana)`, origin: "derived", multiplier: 1 }; })
  ];
  if (blessings.castSpeedPercent > 0) weaponAttack = calculateWeaponAttack({ equipment, disabledSlots: state.disabledEquipmentSlots, modifierTexts: [...modifierTexts, ...loudSongSpeedLines, { text: `+${Math.round(blessings.castSpeedPercent * 10000) / 10000}% Attack and Cast Speed`, source: "Agility Blessing (blessing model)", origin: "derived", multiplier: 1 }] });
  // Towering Presence (src/towering-presence.js; core audit batch B5): the main-hand weapon's damage and crit rating for Spell skills,
  // as derived entries only the Spell-aware readers use (src/skill-hit-model.js added damage, src/scorching-beam-critical.js flat rating).
  const weaponToSpells = weaponToSpellEntries(modifierTexts, weaponAttack);
  modifierTexts.push(...weaponToSpells.lines);
  const targetCursed = curseLimit.active.length > 0 || mechanics.curses.active.length > 0 || modifierTexts.some((line) => /Curse upon dealing damage|are cursed by/i.test(line.text)) || danceOfTheDeep.cursed;
  // The state conditional support lines resolve against (src/support-effects.js resolveCondition): the dummy (one enemy, a
  // Boss within 10 m), its curses, the enemy-ailment model's types, the held weapons, movement and distance groups.
  const supportConditions = {
    cursed: targetCursed, enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), enemyAilmentTypeCount: mechanics.enemyAilments.count,
    maxSpellBurst: modifierTexts.reduce((total, line) => { const match = String(line.text).match(/^\+(\d+) Max Spell Burst$/i); return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0),
    singleEnemy: true, weaponTypes: [weaponAttack.mainHand?.weapon ? weaponAttack.mainHand.type : null, weaponAttack.offHand?.weapon ? weaponAttack.offHand.type : null].filter(Boolean),
    moving: conditions.moving, nearTarget: conditions.nearTarget,
    // Life lost (Recklessness's "for every 1% Life lost"): the Life state the passive lines read.
    life: lineConditionState.life, lifeLostPercent: lineConditionState.lifeLostPercent, lifeReason: lineConditionState.lifeReason, lifeLostReason: lineConditionState.lifeLostReason,
    // Big Stride's window and Periodic Burst's Mobility use follow these best-case switches (2026-10-14).
    movedRecently: requestedConditions.movedRecently !== false, mobilitySkillUsed: requestedConditions.mobilitySkillUsed !== false,
    // Gear affix batch C (2026-10-22): Empowered Insight's Empower count, Dual Onslaught's Dual Wielding and Attack Focus's Fervor Rating.
    empowerSkillCount: lineConditionState.sageInputs?.empowerSkills?.length || 0, dualWielding: Boolean(lineConditionState.weapon?.dualWielding),
    fervorRating: lineEffects.combat?.buffs?.fervorRating || 0
  };
  for (const setup of setups) setup.supportEffects = resolveSupportEffects(setup, { ...supportEffectsContext(setup, focusBlessingStacks), conditions: supportConditions });
  // Typed damage taken that a supported skill inflicts on the enemy (Wilting Beam: Dispirit, Flame Jet: Scorched Earth, Burning
  // Shot: Ignition): a derived enemy debuff line every typed "taken" reader uses (skill hits, skill DoTs, ailments), while an
  // active setup whose own damage is modeled carries it. Uptime 1 (provisional; the debuff refreshes while the skill hits).
  const damagingSetupKeys = new Set(damageSources.filter((source) => source.status === "modeled").map((source) => source.setupKey));
  for (const setup of setups.filter((item) => item.enabled !== false && activeNames.has(item.name) && damagingSetupKeys.has(item.setupKey))) {
    for (const line of setup.supportEffects?.targetTaken || []) modifierTexts.push({ text: `+${line.value}% additional ${line.typed} Damage taken`, source: `${setup.name}: ${line.support} (enemy debuff; uptime 1, provisional)`, origin: "derived", multiplier: 1 });
  }
  // Empower Skill effects on the build's other damage (src/empower-effects.js; frost-terra audit 2026-10-13): Ice Bond's
  // Euphoria and a skill's hit debuff (Blizzard), scaled by Empower Effect. A hit debuff shared here leaves that skill's own
  // hit ledger (it reads the shared line like every other source).
  const empowerEffects = resolveEmpowerEffects({ setups, activeNames, damagingSetupKeys, hitProfiles: new Map(skillHitSources.map((source) => [source.setupKey, source.profile])), modifierTexts, enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), prebuiltSelfBuffs: requestedConditions.prebuiltSelfBuffs !== false, multistrikeEventsPerSecond: hitRateFacts?.multistrikeEventsPerSecond ?? null });
  modifierTexts.push(...empowerEffects.lines);
  for (const source of skillHitSources) if (empowerEffects.sharedDebuffSetupKeys.has(source.setupKey)) source.profile = { ...source.profile, selfDebuffTaken: [] };
  // The main skill's active conditional support lines on the beam hit ledger and the Ignite ledger (the main skill's
  // ailments), like its other "additional damage for the supported skill" lines (src/build-mechanics.js).
  for (const line of (resolvedMain?.supportEffects?.conditionalAdditional || []).filter((item) => item.active && item.appliedValue && !item.triggeredOnly)) {
    if (resolvedMain.name === "Scorching Beam" && SCORCHING_BEAM_DEDICATED_SUPPORTS.has(line.support)) continue;
    const text = `${line.text} — ${line.conditionText}`;
    mechanics.hit.push({ source: line.source, bucket: "additional", percent: line.appliedValue, text });
    mechanics.ignite.additional.push({ source: line.source, text, value: line.appliedValue, category: "Additional damage", condition: line.conditionText });
  }
  // Juggernaut (core audit B4, src/combat-states.js): the enemy's Armor drop. The beam's calibrated cycle already carries the
  // dummy's 30% non-Physical Armor (src/target-hit-mitigation.js), so its Fire hits take the ratio of the Armor factors.
  const juggernaut = lineEffects.combat?.enemyDebuffCores?.juggernaut?.active ? lineEffects.combat.enemyDebuffCores.juggernaut : null;
  if (juggernaut && activeNames.has("Scorching Beam") && juggernaut.nonPhysicalArmourPercent !== level85DummyDefenses.nonPhysicalArmourPercent) {
    const percent = ((1 - juggernaut.nonPhysicalArmourPercent / 100) / (1 - level85DummyDefenses.nonPhysicalArmourPercent / 100) - 1) * 100;
    mechanics.hit.push({ source: "Juggernaut (Ethereal Prism core)", bucket: "additional", percent, text: `Enemy Armor ×${juggernaut.armourScale} (${juggernaut.stacks} stacks): non-Physical Armor mitigation ${level85DummyDefenses.nonPhysicalArmourPercent}% → ${juggernaut.nonPhysicalArmourPercent}% (provisional)` });
  }
  for (const line of mechanics.pendingPerStack || []) {
    const stacks = Math.min(line.cap ?? Infinity, focusBlessingStacks);
    if (!(stacks > 0)) continue;
    const value = Math.round(line.perStack * stacks * 10000) / 10000;
    const text = `${line.text} × ${stacks} Focus Blessing stacks (blessing model)`;
    mechanics.hit.push({ source: line.source, bucket: "additional", percent: value, text });
    mechanics.ignite.additional.push({ source: line.source, text, value, category: "Additional damage" });
  }
  beamCastRate = scorchingBeamCastRate({ lineSpeed: lineEffects.castSpeed, blessings, ceaselessTide: heroMemories.ceaselessTide, main, talentSlate, equipment: memoryEquipment, pact, aimCastSpeedPercent: aim.averageCastSpeedPercent });
  const compileFinal = (attemptsPerSecond = beamCastRate.castsPerSecond) => compileScorchingBeamIgniteSources({ extraSources: { ...mechanics.ignite, intelligence: mechanics.intelligence, fieryFantasy: coreNames.has("Fiery Fantasy"), chanceToDamage: modifierTexts.filter((line) => CHANCE_TO_DAMAGE.test(String(line.text).trim())) }, blurEffects, blessings, block, coreTalents, enemyOnTideDamageTakenPercent, tideEffectFactor, waveAriaPercent, idyllPerStackPercent, heroMemories, main, setups, activeNames, talentSlate, equipment, pact: ledgerPact, pactState: state.pacts, aura, igniteLimit, combat: damageCombat, conditions, heroId: state.hero.selectedHeroId, useEffectiveSupportLevels: state.talents.useCapturedRanks === false, reapingApplicationAttemptsPerSecond: attemptsPerSecond });
  theoretical = compileFinal();
  // Blessings and Blur can change Affliction per second or Reap recovery: re-derive once with the final ledger.
  if (afflictionRating) {
    const settled = resolveAfflictionRating(theoretical);
    if (Math.abs(settled.rating - afflictionRating.rating) > 1e-9) { theoretical = compileFinal(); configured = configuredFor(); }
    afflictionRating = settled;
  }
  // Windwalk (Psychic core): "+60% additional Damage Over Time against enemies with Max Affliction. Lasts for 4 s.
  // Only takes effect once on each enemy": a one-shot window on every DoT (and the Reaps that copy it) from the
  // moment the dummy's Affliction is full (automatic mode: the derived first-full time; manual mode: at once when
  // the configured rating is 100). Window averages and the recount apply it; the sustained figure does not.
  const timedDotLayers = [];
  for (const line of modifierTexts) {
    const match = line.text.match(/^\+(\d+(?:\.\d+)?)% additional Damage Over Time against enemies with Max Affliction\. Lasts for (\d+(?:\.\d+)?) s\. Only takes effect once on each enemy$/i);
    if (!match || conditions.affliction === false) continue;
    const startSeconds = afflictionRating ? afflictionRating.firstFullSeconds : (Number(damageCombat.afflictionAverage) >= 100 ? 0 : Infinity);
    if (!Number.isFinite(startSeconds)) continue;
    timedDotLayers.push({ source: line.source, text: line.text, value: Number(match[1]), factor: 1 + Number(match[1]) / 100, startSeconds, durationSeconds: Number(match[2]), category: "Additional damage (timed)" });
  }
  const timedDotWindowFactor = (seconds) => !(seconds > 0) ? 1 : timedDotLayers.reduce((factor, layer) => factor * (1 + (layer.factor - 1) * Math.max(0, Math.min(seconds, layer.startSeconds + layer.durationSeconds) - layer.startSeconds) / seconds), 1);
  const trueFlame = calculateCoreTalents(coreNames, { ignited: theoretical.totals.baseIgniteDamage.max > 0 && theoretical.totals.applicationChancePercent > 0, afflictionRating: conditions.affliction !== false ? damageCombat.afflictionAverage : 0, afflictionEffectPercent: theoretical.ledger.filter(line => line.category === "Affliction effect").reduce((sum, line) => sum + line.value, 0), additionalAfflictionEffectFactor: theoretical.ledger.filter(line => line.category === "Additional Affliction effect").reduce((factor, line) => factor * (1 + line.value / 100), 1) });
  coreTalents.lines.push(...trueFlame.lines.filter(line => line.source === "True Flame"));
  const hitModifiers = scorchingBeamHitModifiers({ extraSources: mechanics.hit, intelligenceAdjustment: mechanics.intelligence, blurEffects, curses, blessings, aim, block, coreTalents, enemyOnTideDamageTakenPercent, tideEffectFactor, waveAriaPercent, idyllPerStackPercent, heroMemories, main, talentSlate, equipment, pact, aura, heroId: state.hero.selectedHeroId, conditions, idyllStacks: damageCombat.idyllStacks });
  const levelFactor = main.effectiveLevel >= 20 ? skillLevelDamageMultiplier(main.effectiveLevel) / skillLevelDamageMultiplier(20) : 1;
  const beamCritical = scorchingBeamCritical({ main, talentSlate, equipment: memoryEquipment, pact, modifierTexts, fireResistanceTotalPercent: resistances.entries.find((entry) => entry.element === "Fire")?.total || 0, castsPerSecond: beamCastRate.castsPerSecond, targetHasAilment: true });
  const hasSealedLife = aura.entries.some((entry) => entry.reservation?.resource === "life") && aura.entries.some((entry) => entry.reservation?.resource === "mana");
  const ailmentChanceFromAuras = aura.entries.filter((entry) => activeNames.has(entry.name)).reduce((sum, entry) => sum + (entry.effectiveEffects?.ailmentChancePercent || 0), 0);
  const ailmentDurationFromAuras = aura.entries.filter((entry) => activeNames.has(entry.name)).reduce((sum, entry) => sum + (entry.effectiveEffects?.ailmentDurationPercent || 0), 0);
  const ailmentTargets = { trauma: 0, wilt: damageCombat.targetErosionResistancePercent ?? 30 };
  const ailmentDraft = Object.fromEntries(Object.keys(ailmentTargets).map((key) => [key, hasAilmentBase(key, modifierTexts)]));
  const enemyAilmentTypes = Math.max(1, Object.values(ailmentDraft).filter(Boolean).length + (canIgnite ? 1 : 0) + mechanics.enemyAilments.types.filter((type) => !type.damaging).length);
  const beamAddedDamage = scorchingBeamAddedDamage({ main, equipment, slates: slate.setup, equippedSlateIds: equipped, talents: talent.setup, pacts: state.pacts });
  // Extra Beams (Scattershot Beam "+2 additional Beams", "+N Beams" lines): every Beam hits the dummy, after the first at
  // the skill's 70% Shotgun falloff (src/scorching-beam-base-hit.js scorchingBeamShotgunFactor; Iris Scattershot run B,
  // 2026-10-12). On Selena the Bard delivery scales its measured residual with the native cycle, so with it.
  const beamCount = 1 + (main.supportEffects?.quantity || []).filter((item) => item.kind === "beams").reduce((total, item) => total + item.value, 0)
    + modifierTexts.reduce((total, line) => { const match = String(line.text).match(/^\+(\d+) Beams?$/i); return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0);
  // Mark on the dummy (src/mark-effect.js; 2026-10-14): a build with a Mark source keeps the dummy Marked (best case, the
  // targetMarked switch); its "+10% additional Critical Strike Damage taken" × (1 + Mark Effect) joins every hit's crit share
  // (Scorching Beam's beam and explosion packets too: `beamCritOnlyFactor`; settled after the hits, the beam included).
  // Erika's Artificial Moon (src/erika-wind-stalker.js windStalkerMoonMark; 2026-10-14): a Mark source and +30% Mark Effect while Stalker is held.
  const markState = resolveMark({ modifierTexts, enabled: requestedConditions.targetMarked !== false, nearTarget: conditions.nearTarget !== false, ...(windStalkerMoonMark(lineConditionState.windStalker) || {}) });
  const beamCritOnlyFactor = (beamCritical.critOnlyFactor ?? 1) * (markState.critOnlyLine ? 1 + markState.critOnlyLine.value / 100 : 1);
  // Levels 1–20 read the game rows (config_skill_damage 461 / 462); past 20 the level factor scales the Lv.20 packets.
  const nativeHitCycle = activeNames.has("Scorching Beam") && main?.effectiveLevel >= 1
    ? scorchingBeamSustainedHits({
      beams: beamCount,
      effectiveLevel: main.effectiveLevel,
      levelFactor,
      damageFactor: hitModifiers.damageFactor,
      maxDamageFactor: hitModifiers.maxDamageFactor,
      minDamageFactor: hitModifiers.minDamageFactor,
      addedFireDamage: beamAddedDamage.raw,
      castsPerSecond: beamCastRate.castsPerSecond,
      criticalChancePercent: beamCritical.criticalChancePercent,
      // Crit-only support lines (Critical Strike Damage Increase) and the Mark weight the crit hits only (B1); never Ignite.
      criticalDamagePercent: beamCritical.critNoExtraDamage ? 100 : beamCritical.criticalDamagePercent * beamCritOnlyFactor
    }) : null;
  // Fire penetration ("+X% Fire Penetration", "+X% Elemental and Erosion Resistance Penetration"; build-mechanics.js)
  // lowers the resistance the beam's hits meet; the Ignite ledger applies the same lines through its penetration layer.
  const hitPenetrationPercent = mechanics.penetration?.firePercent || 0;
  const hitTargetFireResistancePercent = ignitedResistance.hitPercent - hitPenetrationPercent;
  // `mitigation` lists the dummy's armour and resistance factors; toTarget applies only the resistance's change from the
  // 30% that the cycle's 49% coefficient already carries (src/target-hit-mitigation.js calibratedBeamTargetFactors).
  const targetMitigation = fireHitMitigation({ fireResistancePercent: hitTargetFireResistancePercent });
  const directHit = { ...hitModifiers, levelFactor, penetrationPercent: hitPenetrationPercent, penetrationSources: mechanics.penetration?.sources || [], beforeResistance: nativeHitCycle?.expectedDps || 0, toTarget: (nativeHitCycle?.expectedDps || 0) * calibratedBeamTargetFactors({ fireResistancePercent: hitTargetFireResistancePercent }).combinedFactor, mitigation: targetMitigation, combatFactor: hitModifiers.ledger.filter((entry) => ["Tide Contact", "On the Tide", "Wave Aria", "Idyll of the Tide", "Entangled Pain", "Scorch", "Fire Infiltration"].includes(entry.source)).reduce((factor, entry) => factor * (1 + entry.percent / 100), 1) };
  directHit.nativeCycle = nativeHitCycle;
  // Generic spell hits (src/skill-hit-model.js): every active setup with a "skill-hit" profile. Cast speed reuses
  // the Scorching Beam cast-rate total without its channel-only line (these skills are not channeled); crit reuses
  // the spell crit totals with the setup's own supports (two passes: the crit rate needs the hit rate); the
  // main-stat line is the hit ledger's Intelligence entry; target resistances follow the dummy settings.
  // Weapon Attack Damage skills (src/attack-hit-profiles.js): the equipped weapon(s), attack speed and attack crit from
  // src/weapon-damage-model.js; crit damage reuses the spell crit model's generic Critical Strike Damage total.
  // Skills gear and pact lines trigger (src/item-triggered-skills.js; gear-pact batch chunk 4): a skill-hit stream at the
  // line's level, one use per stated interval while the event holds (provisional). Their badges read the notes below.
  const itemTriggerSources = [], itemTriggerNotes = [];
  modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).forEach((line, index) => {
    const trigger = parseItemTrigger(line.text);
    if (!trigger) return;
    const key = normalizeLineText(String(line.text)).trim();
    // The item's Aim (gear affix batch D): read by the Aim model above, not as a hit stream.
    if (trigger.name === "Aim" && !trigger.unmodeled && !trigger.notOnDummy) {
      const aimTargets = activeNames.has("Scorching Beam") || [...skillHitSources, ...skillDotSources].some((source) => (source.setup?.tags || []).some((tag) => tag === "Projectile" || tag === "Beam"));
      itemTriggerNotes.push([key, boardAim ? "No DPS effect: Aim is on the skill board and is recast at its cooldown already" : !gearAimEvent?.active ? `Inactive: ${gearAimEvent?.reason || "the event does not hold"}` : !aimTargets ? "No DPS effect: no Projectile or Beam skill takes Aim's bonus" : `Triggered Aim Lv.${trigger.level}: ${aim.uptimeLabel} (src/aim-model.js; provisional)`]);
      return;
    }
    if (trigger.unmodeled) { itemTriggerNotes.push([key, `Not modeled: ${trigger.unmodeled}`]); return; }
    if (trigger.notOnDummy) { itemTriggerNotes.push([key, `Not on dummy: ${trigger.notOnDummy}`]); return; }
    const event = itemTriggerEvent(trigger, { moving: conditions.moving, anyHit: activeNames.has("Scorching Beam") || skillHitSources.length > 0, enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), paralysis: lineEffects.combat?.debuffs?.paralysis,
      // Paralysis on its own clock (2026-10-14): Grudge's / Cripple's chance Paralysis and Witch Antelope's turns also inflict it.
      scheduledParalysis: [...(lineEffects.combat?.chanceParalysis?.sources || []).filter((item) => item.active).map((item) => `${item.skill}: ${item.support}`), ...(lineEffects.combat?.timedEffects || []).filter((effect) => effect.id === "witchAntelope" && effect.active).map((effect) => effect.label)] });
    const setup = { ...(catalogSkillsByName.get(trigger.name) || {}), name: trigger.name, role: "item-trigger", baseLevel: trigger.level, addedLevels: 0, effectiveLevel: trigger.level, supports: [], setupKey: `item-trigger:${index}:${trigger.name}`, instanceId: `item-trigger:${index}:${trigger.name}`, enabled: true };
    const profile = inferDamageProfile(setup);
    // A Defensive-tagged skill (Stoneskin, Reform; TLIDB tags) deals no damage: No DPS effect (gear affix audit 2026-10-22).
    if ((!profile || profile.engine !== "skill-hit") && (setup.tags || []).includes("Defensive")) { itemTriggerNotes.push([key, `No DPS effect: ${trigger.name} is a Defensive skill (no damage)`]); return; }
    if (profile?.engine === "skill-dot" && itemDotTriggers.some((item) => item.key === key)) { itemTriggerNotes.push([key, itemDotTriggers.find((item) => item.key === key).note]); return; }
    if (!profile || profile.engine !== "skill-hit") { itemTriggerNotes.push([key, `Not modeled: ${trigger.name} has no hit model (a buff skill or an unmodeled skill)`]); return; }
    if (!event.active) { itemTriggerNotes.push([key, `Inactive: ${event.reason}`]); return; }
    itemTriggerSources.push({ setup, setupKey: setup.setupKey, itemTrigger: { ...trigger, source: line.source, text: line.text, reason: event.reason }, profile: { ...profile, useModel: { kind: "rate", usesPerSecond: 1 / trigger.intervalSeconds, firstUseSeconds: trigger.intervalSeconds } } });
    itemTriggerNotes.push([key, `Triggered skill: ${trigger.name} Lv.${trigger.level} every ${trigger.intervalSeconds} s (${event.reason}; provisional)`]);
  });
  for (const [key, note] of itemTriggerNotes) mechanics.recognized.set(key, note);
  // Rehan (hero trait audit B10; src/rehan-traits.js; provisional readings, src/open-questions.js):
  // - Anger's Burst: a triggered hit source (game row 90000; Burst Blast 90003) at its trigger rate in Berserk × the Berserk uptime,
  //   with its own additional damage lines, its level (+10% per tag-matching Skill Level line) and the Berserk-phase Rage lines in
  //   place of the time-averaged ones (it fires only while Berserk); Tunnel Vision's penalty does not reach it.
  // - Ritual of Offering's Disarm: the player's Attack Skills pause for that share of Berserk (a use-rate factor) and read the Rage
  //   lines of their attacking time; not in the measuring pass (it measures the undisarmed rates).
  const rehanSources = [];
  const rehanFinal = lineConditionState.rehan && !probeDebuffHitRates ? lineConditionState.rehan : null;
  const rehanWeaponFor = (texts) => calculateWeaponAttack({ equipment, disabledSlots: state.disabledEquipmentSlots, modifierTexts: [...texts, ...loudSongSpeedLines, ...(blessings.castSpeedPercent > 0 ? [{ text: `+${Math.round(blessings.castSpeedPercent * 10000) / 10000}% Attack and Cast Speed`, source: "Agility Blessing (blessing model)", origin: "derived", multiplier: 1 }] : [])] });
  if (lineConditionState.rehan?.burst) {
    const rehan = lineConditionState.rehan = withRehanHits(lineConditionState.rehan, { attackSpeed: weaponAttack.attackSpeed });
    const burstBase = burstProfile({ blast: rehan.burst.blast });
    const burstLevels = skillLevelBonus({ name: burstBase.name, role: "support", tags: burstBase.tags }, levelSources);
    const burstSetup = { name: burstBase.name, role: "item-trigger", tags: burstBase.tags, baseLevel: 1, addedLevels: burstLevels.total, effectiveLevel: 1, levelBonusSources: burstLevels.contributions, supports: [], setupKey: BURST_SETUP_KEY, instanceId: BURST_SETUP_KEY, enabled: true, rehanBurst: true };
    rehanSources.push({ setup: burstSetup, setupKey: BURST_SETUP_KEY, profile: { ...burstBase, useModel: { ...burstBase.useModel, usesPerSecond: rehan.cadence.usesPerSecond, firstUseSeconds: rehan.cadence.inBerserk > 0 ? 1 / rehan.cadence.inBerserk : null, note: `triggered by Anger while Berserk: ${r4(rehan.cadence.inBerserk)}/s in Berserk × ${r4(rehan.rage.uptime * 100)}% uptime = ${r4(rehan.cadence.usesPerSecond)}/s (hero trait audit B10, provisional)` } },
      rehanAdditional: burstAdditionalLines(rehan, { levels: burstLevels.total }), lineSwap: { drop: (line) => Boolean(line.rehanPhase || line.rehanNonBurst), add: rehanPhaseLines(rehan, "berserk") } });
  }
  const rehanPlayer = rehanFinal && rehanFinal.rage.disarmShare > 0 ? { factor: Math.max(1e-9, 1 - rehanFinal.rage.uptime * rehanFinal.rage.disarmShare), add: rehanPhaseLines(rehanFinal, "player") } : null;
  const allHitSources = [...skillHitSources.map((source) => rehanPlayer && (source.setup?.tags || []).includes("Attack") ? { ...source, lineSwap: { drop: (line) => Boolean(line.rehanPhase), add: rehanPlayer.add }, rehanRateFactor: rehanPlayer.factor } : source), ...itemTriggerSources, ...rehanSources];
  // Pure Heart (Azure Gunslinger; src/pure-heart.js): held at max stacks with an Attack Mobility Skill on the board (mobilitySkillUsed
  // switch); ×1.05 per stack additional Attack Damage on the hits against the Nearby dummy (not ailments).
  const pureHeart = resolvePureHeart({ modifierTexts, setups, mobilityUsed: requestedConditions.mobilitySkillUsed !== false, nearTarget: conditions.nearTarget !== false });
  // Carino's ammo cycle (hero trait audit B9, Q-H8; src/carino-traits.js): Projectile casts × the share of time they are available.
  const carinoAmmo = lineConditionState.carino;
  const carinoRateEffects = (setup) => carinoAmmo?.rate?.measured && Math.abs((carinoAmmo.rate.factor ?? 1) - 1) > 1e-12 && (setup?.tags || []).includes("Projectile")
    ? { rateFactor: carinoAmmo.rate.factor, rateNote: `Carino ammo (Q-H8, provisional): ${carinoAmmo.rate.mode === "heatCycle" ? `the Heat Up cycle (${carinoAmmo.ammo.magazine} ammo casts, ${carinoAmmo.heat?.phaseSeconds} s of Blank Firing, a ${carinoAmmo.ammo.reloadSeconds} s reload)` : `magazine ${carinoAmmo.ammo.magazine}, reload ${carinoAmmo.ammo.reloadSeconds} s, Projectile Skills unavailable while reloading`} at ${Math.round(carinoAmmo.rate.castsPerSecond * 1000) / 1000} Projectile casts/s: available ${Math.round(carinoAmmo.rate.factor * 10000) / 100}% of the time` } : null;
  // `extra` adds inputs a second pass settles (Erika's Multistrike states, src/erika-wind-stalker.js).
  const computeSkillHit = (source, extra = {}) => {
    const setup = source.setup;
    // Rehan (hero trait audit B10): a source's own Rage-phase lines (Burst and the Seething Spirit: Berserk; a disarmed player: the
    // attacking time) in place of the time-averaged ones, with the weapon model they give.
    const sourceTexts = source.lineSwap ? [...modifierTexts.filter((line) => !source.lineSwap.drop(line)), ...source.lineSwap.add] : modifierTexts;
    const sourceWeapon = source.lineSwap && source.profile.weaponScaling ? rehanWeaponFor(sourceTexts) : weaponAttack;
    // Channel skills (src/skill-hit-profiles.js useModel "channel") keep the channel-only speed line.
    const noChannelTalent = source.profile.channeled ? talentSlate : { ...talentSlate, candidateTalent: { ...(talentSlate.candidateTalent || {}), channeledAttackAndCastSpeedPercent: 0 }, candidateSlate: { ...(talentSlate.candidateSlate || {}), channeledAttackAndCastSpeedPercent: 0 } };
    const speed = scorchingBeamCastRate({ lineSpeed: lineEffects.castSpeed, blessings, ceaselessTide: heroMemories.ceaselessTide, main: setup, talentSlate: noChannelTalent, equipment: memoryEquipment, pact, aimCastSpeedPercent: aim.averageCastSpeedPercent });
    const speedFactor = speed.baseRate > 0 ? speed.castsPerSecond / speed.baseRate : 1;
    // increasedPercent / additionalFactor: the two Cast Speed layers, for Play Safe's Cast Speed → Spell Burst Charge Speed (src/skill-hit-model.js).
    const castSpeed = { factor: speedFactor, increasedPercent: speed.increasedPercent, additionalFactor: speedFactor / Math.max(1e-9, Math.max(0, 1 + speed.increasedPercent / 100)), sources: [{ source: "Cast Speed total (planner cast-rate ledger)", text: `+${Math.round(speed.increasedPercent * 100) / 100}% increased, +${Math.round(speed.additionalPercent * 100) / 100}% additional${speed.ceaselessTideSpeedFactor !== 1 ? ", ×0.8 Ceaseless Tide" : ""}`, value: Math.round((speedFactor - 1) * 10000) / 100 }] };
    // The character's Cast Speed without the setup's own support lines (Quick Decision), for Play Safe (user decision 2026-10-19).
    const characterSpeed = scorchingBeamCastRate({ lineSpeed: lineEffects.castSpeed, blessings, ceaselessTide: heroMemories.ceaselessTide, main: { ...setup, supports: [] }, talentSlate: noChannelTalent, equipment: memoryEquipment, pact, aimCastSpeedPercent: aim.averageCastSpeedPercent });
    const characterSpeedFactor = characterSpeed.baseRate > 0 ? characterSpeed.castsPerSecond / characterSpeed.baseRate : 1;
    castSpeed.character = { increasedPercent: characterSpeed.increasedPercent, additionalFactor: characterSpeedFactor / Math.max(1e-9, Math.max(0, 1 + characterSpeed.increasedPercent / 100)) };
    const intelligenceLine = hitModifiers.ledger.find((entry) => /^Total Intelligence/.test(entry.source));
    // Selena (Sing with the Tide): the Tide Effect buff's All Damage writes and the Bard Channeled Skill penalty reach every
    // generic hit (src/selena-tide.js hitLines); Scorching Beam keeps its own hit ledger (src/scorching-beam-hit.js).
    const hitOnlyLines = [...blessingHitLines, ...singWithTheTide.hitLines, ...(pureHeart?.hitLines || [])];
    // A buff for the character's "other skills" (Ice Bond's Euphoria, src/empower-effects.js) skips the skill that grants it.
    const ownLines = sourceTexts.some((line) => line.exceptSetupKey === setup.setupKey) ? sourceTexts.filter((line) => line.exceptSetupKey !== setup.setupKey) : sourceTexts;
    const common = { setup, profile: source.profile, modifierTexts: hitOnlyLines.length ? [...ownLines, ...hitOnlyLines] : ownLines, castSpeed, takenConversion: lineEffects.hero?.takenConversion || null, movedRecently: requestedConditions.movedRecently !== false, multistrikeEventsPerSecond: hitRateFacts?.multistrikeEventsPerSecond ?? null,luckyDamageRolls: lineEffects.combat?.lucky?.damageRolls || 1, deterioration: lineEffects.combat?.deterioration || null, auraEntries: aura.entries.filter((entry) => activeNames.has(entry.name)), aim, intelligenceAdditionalPercent: intelligenceLine?.percent || 0, mainStatPoints: mechanics.intelligence?.removed ? null : lineEffects.state?.stats || null, intelligenceSource: intelligenceLine?.source || null, target: { resistancePercent: { Fire: damageCombat.targetFireResistancePercent, Cold: damageCombat.targetColdResistancePercent ?? 30, Lightning: damageCombat.targetLightningResistancePercent ?? 30, Erosion: damageCombat.targetErosionResistancePercent ?? 30 }, ...(juggernaut ? { armourPercent: juggernaut.armourPercent, nonPhysicalArmourPercent: juggernaut.nonPhysicalArmourPercent } : {}) }, targetCursed,
      // Curses on the dummy (skill curses within the limit + gear-triggered curses) and the enemy-ailment model's types, for
      // components gated on a Cursed target (Shackles of Malice) and triggers gated on an ailment (Ice Focus: Frostbite).
      targetCurseCount: curseLimit.active.length + mechanics.curses.active.length, enemyAilments: mechanics.enemyAilments };
    const critFor = (castsPerSecond, strikeCritChancePercent = null) => scorchingBeamCritical({ main: setup, talentSlate, equipment: memoryEquipment, pact, modifierTexts: sourceTexts, fireResistanceTotalPercent: resistances.entries.find((entry) => entry.element === "Fire")?.total || 0, castsPerSecond, targetHasAilment: false, strikeCritChancePercent });
    // Scorch (curse-model.js): cursed enemies take additional Fire damage; Entangled Pain is damage over time only.
    common.extraTaken = [...(conditions.scorch ? [{ source: "Scorch curse", text: `+${curses.scorchDamagePercent}% additional Fire Damage taken (Scorch on the dummy)`, value: curses.scorchDamagePercent, types: ["Fire"] }] : []), ...singWithTheTide.takenLines];
    // Distance (exclusive group "Distance"): a projectile fan lands ceil(n / 2) standing close, one at range (src/shotgun-effect.js).
    common.nearTarget = conditions.nearTarget !== false;
    common.extraCritOnly = markState.critOnlyLine ? [markState.critOnlyLine] : [];
    // Youga – The Ultimate One's first-pass effects (src/youga-ultimate-one.js yougaPreEffects: the Spell Burst rules and the
    // Clockwork Core lines that need no hit rate); the settled effects arrive through `extra` (resolveYougaUltimateOne).
    // Core audit B8: an ordinary Tangle Skill with 2+ activated Tangles uses × activated (src/tangle-model.js tangleHitEffects).
    const yougaPre = yougaPreEffects(lineConditionState.yougaUltimateOne, setup.setupKey), tangleCadence = tangleHitEffects(tangles, setup.setupKey);
    common.heroEffects = yougaPre && tangleCadence ? { ...yougaPre, ...tangleCadence } : yougaPre || tangleCadence;
    // Carino (hero trait audit B9; src/carino-traits.js): the ammo cycle's use-rate factor on Projectile skills (Q-H8), once the
    // measuring pass has the cast rate; Evil Ouroboros's returning hits and a Special Ammo cast's bonus lines arrive through `extra`.
    const carinoFactor = carinoRateEffects(setup);
    if (carinoFactor) common.heroEffects = common.heroEffects ? { ...common.heroEffects, rateFactor: (common.heroEffects.rateFactor || 1) * carinoFactor.rateFactor, rateNote: [common.heroEffects.rateNote, carinoFactor.rateNote].filter(Boolean).join("; ") } : carinoFactor;
    if (extra.carinoRecall || extra.carinoAdditional?.length) {
      common.heroEffects = { ...(common.heroEffects || {}), ...(extra.carinoRecall ? { recall: extra.carinoRecall } : {}), ...(extra.carinoAdditional?.length ? { additional: [...(common.heroEffects?.additional || []), ...extra.carinoAdditional] } : {}) };
    }
    const { carinoRecall: _carinoRecall, carinoAdditional: _carinoAdditional, ...plainExtra } = extra;
    extra = plainExtra;
    // Rehan (hero trait audit B10): Burst's own additional damage lines; Disarmed's use-rate factor on the player's Attack Skills.
    if (source.rehanAdditional?.length) common.heroEffects = { ...(common.heroEffects || {}), additional: [...(common.heroEffects?.additional || []), ...source.rehanAdditional] };
    if (Number.isFinite(source.rehanRateFactor) && source.rehanRateFactor !== 1) common.heroEffects = { ...(common.heroEffects || {}), rateFactor: (common.heroEffects?.rateFactor || 1) * source.rehanRateFactor, rateNote: [common.heroEffects?.rateNote, `Rehan – Disarmed (Ritual of Offering): the player's Attack Skills pause for ${r4((1 - source.rehanRateFactor) * 100)}% of the time (provisional)`].filter(Boolean).join("; ") };
    // Bing (hero trait audit B12; src/bing-traits.js): Blast Nova's bombs, Creative Genius's Ingenuity Overload casts and Contingency
    // Inspiration Machines, on the Main Skill only.
    const bingEffects = lineConditionState.bing?.heroEffects && setup.setupKey && setup.setupKey === lineConditionState.bing.mainSetupKey ? lineConditionState.bing.heroEffects : null;
    if (bingEffects) common.heroEffects = { ...(common.heroEffects || {}), ...bingEffects };
    // Selena (hero trait audit B13; src/selena-leftover-traits.js): Bard Song on the player's non-channeled, non-Mobility skills (the hit
    // model keeps triggered, rate-driven and Sentry skills on their own use model); Lonely Ensemble's Crimson Shades on the Main Terra.
    const bardEffects = singWithTheTide.bardSong?.heroEffects && setup.role !== "item-trigger" && !setup.rehanBurst && !(setup.tags || []).some((tag) => tag === "Channeled" || tag === "Mobility") ? singWithTheTide.bardSong.heroEffects : null;
    if (bardEffects) common.heroEffects = { ...(common.heroEffects || {}), bardSong: bardEffects };
    const shadeEffects = lineConditionState.crimsonShade?.heroEffects && setup.setupKey && setup.setupKey === resolvedMain?.setupKey ? lineConditionState.crimsonShade.heroEffects : null;
    if (shadeEffects) common.heroEffects = { ...(common.heroEffects || {}), crimsonShade: shadeEffects };
    // Lines for triggered skills (Hair-trigger, src/combat-states.js; core audit batch B3): applied by the hit model to triggered uses.
    common.triggeredSkillAdditional = lineEffects.combat?.buffs?.triggeredSkillAdditional || [];
    // Own buffs built before engaging (condition prebuiltSelfBuffs, default on): Focus points ready at 0 s, the windows' steady rate
    // for rate-model, Terra and channel skills (src/skill-hit-model.js; user decision 2026-10-22).
    common.prebuiltSelfBuffs = requestedConditions.prebuiltSelfBuffs !== false;
    // Tangle casts are triggered (Hair-trigger; user-supplied 2026-10-19, Google AI Mode answer, not tested in game).
    common.tangleSkill = (tangles.setups || []).some((item) => item.setupKey === setup.setupKey);
    // Miraculous Gain's Main Skill triggers (user-supplied 2026-10-19): extra uses of the Main Skill.
    common.extraTriggeredUses = miraculousGain?.mainSkillUsesPerSecond > 0 && setup.setupKey === resolvedMain?.setupKey ? { usesPerSecond: miraculousGain.mainSkillUsesPerSecond, label: "Miraculous Gain triggers", note: miraculousGain.text } : null;
    // Main Skill triggers from legendary lines (src/main-skill-retriggers.js; legendary audit batch 2, provisional): extra full uses.
    if (setup.setupKey && setup.setupKey === resolvedMain?.setupKey) {
      const cooldownSeconds = skillHitTiming(source.profile)?.cooldownSeconds || 0;
      const retrigger = mainSkillRetriggers(modifierTexts, { moving: conditions.moving, maxBlessingStacks: (blessings?.entries || []).reduce((sum, entry) => sum + (Number(entry.maxStacks) || 0), 0), castSpeedFactor: common.castSpeed?.factor || 1, channeled: (setup.tags || []).includes("Channeled"), cooldownSeconds, manualUsesPerSecond: cooldownSeconds > 0 ? 1 / cooldownSeconds : 0 });
      if (retrigger.usesPerSecond > 0) {
        const label = retrigger.sources.filter((item) => item.active).map((item) => `${item.source}: ${item.text}`).join("; ");
        common.extraTriggeredUses = { usesPerSecond: (common.extraTriggeredUses?.usesPerSecond || 0) + retrigger.usesPerSecond, label: [common.extraTriggeredUses?.label, `Main Skill triggers (${label}; provisional)`].filter(Boolean).join(" + "), note: [common.extraTriggeredUses?.note, retrigger.sources.filter((item) => item.active).map((item) => item.reason).join("; ")].filter(Boolean).join("; ") };
      }
    }
    Object.assign(common, extra);
    if (source.profile.weaponScaling) {
      common.weapon = sourceWeapon; common.attackSpeed = sourceWeapon.attackSpeed;
      // Spell-only crit damage ("+X% Spell Critical Strike Damage" talents/slates) does not reach attacks.
      // Alternate dual wielding (user-confirmed 2026-10-14): each hand's chance by the same rule (sourceWeapon.crit.hands).
      const attackChance = (spell, weaponCrit) => luckyCritChance(spell.lineCrit?.sentryRating ? Math.min(100, weaponCrit.rating * (1 + (weaponCrit.increasedRatingPercent + spell.lineCrit.sentryRating) / 100) / Math.max(1e-9, 1 + weaponCrit.increasedRatingPercent / 100) / 100) : weaponCrit.chancePercent, lineEffects.combat?.lucky?.critRolls || 1);
      // "per recent non-Critical Strike" stacks (2026-10-15) count the attack's own non-crit hits (its weapon crit chance).
      const attackCrit = (castsPerSecond) => { const spellFirst = critFor(castsPerSecond); const spell = spellFirst.conditionalSources.some((item) => item.nonCrit) ? critFor(castsPerSecond, attackChance(spellFirst, sourceWeapon.crit)) : spellFirst; const spellOnly = spell.spellOnlyCriticalDamagePercent || 0; return { ...spell, criticalDamagePercent: spellOnly ? Math.max(100, spell.criticalDamagePercent - spellOnly) : spell.criticalDamagePercent, combatCriticalDamagePercent: spellOnly ? spell.combatCriticalDamagePercent - spellOnly : spell.combatCriticalDamagePercent, criticalChancePercent: attackChance(spell, sourceWeapon.crit), hands: sourceWeapon.crit.hands ? sourceWeapon.crit.hands.map((hand) => ({ ...hand, criticalChancePercent: attackChance(spell, hand) })) : null, rating: sourceWeapon.crit.rating, attackCrit: sourceWeapon.crit }; };
      const first = calculateSkillHit({ ...common, crit: attackCrit(0) });
      return calculateSkillHit({ ...common, crit: attackCrit(first.rate.hitsPerSecond) });
    }
    const first = calculateSkillHit({ ...common, crit: critFor(0) });
    return calculateSkillHit({ ...common, crit: critFor(first.rate.hitsPerSecond) });
  };
  let skillHits = allHitSources.map((source) => computeSkillHit(source));
  // Erika (Wind Stalker; src/erika-wind-stalker.js): Stalker, Cat's Punches' initial Multistrike Count, Cat's Scratch and Hunting
  // Instinct (Cat's Night Safari) act on the Multistrike sequences. Their stacks follow the hits' Max Multistrike Count events, so
  // the multistriking hits are computed again with the settled states (the sequence timing does not depend on them).
  const windStalker = lineConditionState.windStalker ? resolveWindStalker({ state: lineConditionState.windStalker, hits: skillHits }) : null;
  if (windStalker) {
    skillHits = skillHits.map((hit, index) => { const effects = windStalker.effectsFor(hit); return effects ? computeSkillHit(allHitSources[index], { multistrikeEffects: effects }) : hit; });
    // The badges and the line-effect entries read the settled state (src/hero-trait-modules.js).
    lineConditionState.windStalker = windStalker;
    const settled = resolveHeroModules(modifierTexts.filter((line) => line.origin === "trait"), lineConditionState).entries.filter((entry) => entry.module === "stalker");
    lineEffects.lines = [...lineEffects.lines.filter((entry) => entry.module !== "stalker"), ...settled];
  }
  // Youga – The Ultimate One (src/youga-ultimate-one.js): the trait skills' uptimes, Recall, Centralization and Governance follow
  // the supported skill's hit and crit rates, so that skill (and any cooldown-bound skill, for the crit cooldown reduction) is
  // computed again with the settled effects. The 5 s / 20 s windows follow the trait skills' cast schedule (t = 0, then on
  // cooldown): the supported skill's damage in each state relative to the sustained one, as a steps part.
  const yougaUltimateOne = lineConditionState.yougaUltimateOne ? resolveYougaUltimateOne({ state: lineConditionState.yougaUltimateOne, hits: skillHits }) : null;
  const yougaTimedParts = [];
  if (yougaUltimateOne) {
    skillHits = skillHits.map((hit, index) => { const effects = yougaUltimateOne.effectsFor(hit); return effects ? computeSkillHit(allHitSources[index], { heroEffects: effects }) : hit; });
    const mainIndex = skillHits.findIndex((hit) => hit.key === yougaUltimateOne.mainHitKey);
    const sustainedDps = mainIndex >= 0 ? skillHits[mainIndex].combat.dps : 0;
    if (yougaUltimateOne.windowStates.length && sustainedDps > 0) {
      const cache = new Map();
      const dpsAt = (at) => { const key = JSON.stringify(at); if (!cache.has(key)) cache.set(key, computeSkillHit(allHitSources[mainIndex], { heroEffects: yougaUltimateOne.effectsAt(at) }).combat.dps); return cache.get(key); };
      const points = yougaUltimateOne.windowStates.map(({ time, at }) => [time, dpsAt(at) / sustainedDps - 1]);
      if (points.some(([, level]) => Math.abs(level) > 1e-12)) yougaTimedParts.push({ id: `youga:${yougaUltimateOne.mainHitKey}`, type: null, reach: "hit", keys: [yougaUltimateOne.mainHitKey], percent: 100, schedule: { kind: "steps", points, sustained: 0 } });
    }
    // The badges and the line-effect entries read the settled state (src/hero-trait-modules.js).
    lineConditionState.yougaUltimateOne = yougaPlainState(yougaUltimateOne);
    const settled = resolveHeroModules(modifierTexts.filter((line) => line.origin === "trait"), lineConditionState).entries.filter((entry) => /^youga/.test(entry.module || ""));
    lineEffects.lines = [...lineEffects.lines.filter((entry) => !/^youga/.test(entry.module || "")), ...settled];
  }
  // Carino (hero trait audit B9; src/carino-traits.js; provisional readings, src/open-questions.js):
  // - Evil Ouroboros: a Horizontal Projectile skill with at least 1 Penetration passes through the dummy, reaches its max range and
  //   returns, hitting it once more (the hit model's returning-hit component, as Youga's Recall; best-case switch carinoReturningHits).
  // - Special Ammo: a share of the Projectile casts consume one (or, under Magic Shot, several) Special Ammo and gain the slot
  //   supports' hit effects with the "if a Special Ammo is consumed" lines: each support set is a variant hit (the support at Lv. 20
  //   added to the setup), and the hit's per-use damage is the cast-weighted mix. Their ailment / DoT effects are not modeled.
  const carinoFinal = lineConditionState.carino && !probeDebuffHitRates ? lineConditionState.carino : null;
  if (carinoFinal) {
    const projectileIndexes = skillHits.map((hit, index) => hit.modeled && (allHitSources[index].setup?.tags || []).includes("Projectile") ? index : -1).filter((index) => index >= 0);
    const returning = carinoFinal.returning;
    const recallFor = new Map();
    if (returning) {
      returning.setups = [];
      for (const index of projectileIndexes) {
        const hit = skillHits[index], source = allHitSources[index];
        const mechanics = projectileMechanics(source.setup, modifierTexts);
        const strike = hit.components.find((component) => !component.addedOnly);
        const strikeKey = strike ? strike.strikeKey ?? strike.key : null;
        const reason = !returning.on ? "the returning-projectiles switch is off" : mechanics.recallBlock ? `cannot return: ${mechanics.recallBlock}` : !(mechanics.penetration.total >= 1) ? "its projectiles stop at the dummy (no Penetration), so they never reach their max range" : !strikeKey ? "no projectile hit group" : "";
        returning.setups.push({ setupKey: hit.setupKey, name: hit.name, active: !reason, penetration: mechanics.penetration.total, reason: reason || `${mechanics.penetration.total} Penetration: each projectile passes through the dummy, returns over ${returning.percent}% of its range and hits it again as a full hit` });
        if (reason) continue;
        const recall = { recallsPerProjectile: 1, shareOfUses: 1, hitsFactor: 1, strikeKey, additional: [], note: `Evil Ouroboros (hero trait audit B9, provisional): each projectile passes through the dummy (${mechanics.penetration.total} Penetration), returns over ${returning.percent}% of its range and hits it once more as a full hit (best case: the dummy on the return path)` };
        recallFor.set(index, recall);
        skillHits[index] = computeSkillHit(source, { carinoRecall: recall });
      }
    }
    const special = carinoFinal.special;
    if (special?.variants?.length) {
      const catalogSkill = (name) => catalogSkillsByName.get(name);
      for (const index of projectileIndexes) {
        const base = skillHits[index], source = allHitSources[index];
        if (!(base.combat?.perUse > 0)) continue;
        let perUse = 0, perUseBefore = 0, weightSum = 0;
        const parts = [], skipped = new Set();
        for (const variant of special.variants) {
          const grants = variant.names.filter((name) => {
            const rejected = installedSupportRejected(catalogSupportsByName.get(name), catalogSkill(source.setup.name), source.setup.supports || []);
            if (rejected) skipped.add(name);
            return !rejected;
          }).map((name) => ({ name, level: SPECIAL_AMMO_LEVEL, source: "Carino: Special Ammo", text: `Special Ammo: ${name} (Lv. ${SPECIAL_AMMO_LEVEL})`, active: true }));
          const variantSetup = grants.length ? { ...source.setup, supports: [...(source.setup.supports || []), ...resolveSetupSupports(source.setup, source.setup.setupKey, [], grants).supports.map((support) => ({ ...support, specialAmmo: true }))] } : source.setup;
          if (grants.length) variantSetup.supportEffects = resolveSupportEffects(variantSetup, { ...supportEffectsContext(variantSetup, focusBlessingStacks), conditions: supportConditions });
          const hit = computeSkillHit({ ...source, setup: variantSetup }, { carinoAdditional: variant.additional, ...(recallFor.has(index) ? { carinoRecall: recallFor.get(index) } : {}) });
          perUse += variant.weight * (hit.combat?.perUse || 0);
          perUseBefore += variant.weight * (hit.combat?.perUseBeforeTarget || 0);
          weightSum += variant.weight;
          parts.push({ names: variant.names, applied: grants.map((grant) => grant.name), weight: variant.weight, perUse: hit.combat?.perUse || 0 });
        }
        perUse += (1 - weightSum) * base.combat.perUse;
        perUseBefore += (1 - weightSum) * (base.combat.perUseBeforeTarget || 0);
        const factor = perUse / base.combat.perUse;
        const factorBefore = base.combat.perUseBeforeTarget > 0 ? perUseBefore / base.combat.perUseBeforeTarget : factor;
        base.combat = { ...base.combat, perUse, perUseBeforeTarget: perUseBefore, dps: base.combat.dps * factor, dpsBeforeTarget: (base.combat.dpsBeforeTarget || 0) * factorBefore, fiveSecondAverageDps: base.combat.fiveSecondAverageDps * factor, twentySecondAverageDps: base.combat.twentySecondAverageDps * factor };
        base.carinoSpecialAmmo = { factor, share: weightSum, parts, skipped: [...skipped] };
        base.notes = [...(base.notes || []), `${base.name}: Special Ammo (hero trait audit B9, provisional): ${Math.round(weightSum * 10000) / 100}% of the casts consume Special Ammo (${parts.map((part) => `${part.names.join(" + ")} ${Math.round(part.weight * 10000) / 100}%`).join(", ")}) and gain the supports' hit effects at Lv. ${SPECIAL_AMMO_LEVEL} with the "if a Special Ammo is consumed" lines: per-use damage ×${Math.round(factor * 10000) / 10000}${skipped.size ? `; ${[...skipped].join(", ")} cannot support ${base.name} (not applied)` : ""}; their ailment / DoT effects are not modeled.`];
      }
    }
    // The badges read the settled returning state (src/hero-trait-modules.js "ouroboros").
    if (returning) {
      const settled = resolveHeroModules(modifierTexts.filter((line) => line.origin === "trait" && !line.lineEffect), lineConditionState).entries.filter((entry) => entry.module === "ouroboros");
      lineEffects.lines = [...lineEffects.lines.filter((entry) => entry.module !== "ouroboros"), ...settled];
    }
  }
  // Rehan (hero trait audit B10; src/rehan-traits.js; provisional): the Seething Spirit casts the Main Skill at the player's own use rate
  // for it (× Fury's Onslaught's -30%) while Berserk (Ritual of Offering: always; Fury's Onslaught: while the Main Skill is used within
  // every 2 s), each a full use with the Berserk lines, Ritual's +X% and Fury's offset (Starfall Wasteland: +1 Projectile Quantity and
  // Penetration, its returning projectiles); its uses join the Main Skill's hit (its ailments are not counted). Then the badges read
  // the settled Burst / Spirit state.
  if (lineConditionState.rehan) {
    const rehan = lineConditionState.rehan, spirit = rehan.spirit;
    let spiritHit = null, spiritReturning = null;
    const mainIndex = spirit ? skillHits.findIndex((hit) => hit.setupKey === spirit.mainSetupKey) : -1;
    if (rehanFinal && spirit?.active && mainIndex >= 0) {
      const source = { ...allHitSources[mainIndex], lineSwap: { drop: (line) => Boolean(line.rehanPhase), add: rehanPhaseLines(rehan, "berserk") }, rehanRateFactor: null };
      const effects = { additional: spirit.additional, extraModifierTexts: spirit.extraLines };
      let hit = computeSkillHit(source, { heroEffects: effects });
      if (spirit.returning) {
        const projectiles = projectileMechanics(source.setup, [...modifierTexts, ...spirit.extraLines]);
        const strike = (hit.components || []).find((component) => !component.addedOnly);
        const strikeKey = strike ? strike.strikeKey ?? strike.key : null;
        const reason = !spirit.returning.on ? "switched off" : projectiles.recallBlock ? `cannot return: ${projectiles.recallBlock}` : !(source.setup?.tags || []).includes("Horizontal") ? "not a Horizontal Projectile skill" : !(projectiles.penetration.total >= 1) ? "its projectiles stop at the dummy (no Penetration)" : !strikeKey ? "no projectile hit group" : "";
        spiritReturning = { active: !reason, reason, penetration: projectiles.penetration.total };
        if (!reason) hit = computeSkillHit(source, { heroEffects: { ...effects, recall: { recallsPerProjectile: spirit.returning.percent / 100, shareOfUses: 1, hitsFactor: spirit.returning.percent / 100, strikeKey, additional: [], note: `Starfall Wasteland (hero trait audit B10, provisional): ${spirit.returning.percent}% of the Spirit's projectiles pass through the dummy (${projectiles.penetration.total} Penetration), return and hit it again` } } });
      }
      const usesPerSecond = (hit.rate?.usesPerSecond || 0) * spirit.speedFactor * spirit.presence * rehan.rage.uptime;
      const perUse = hit.combat?.perUse || 0, perUseBefore = hit.combat?.perUseBeforeTarget || 0;
      spiritHit = { modeled: Boolean(hit.modeled) && usesPerSecond > 0, inactiveReason: hit.inactiveReason || null, usesPerSecond, perUse, dps: usesPerSecond * perUse };
      const player = skillHits[mainIndex];
      if (spiritHit.modeled) {
        const playerUses = player.rate?.usesPerSecond || 0, totalUses = playerUses + usesPerSecond, dps = (player.combat?.dps || 0) + spiritHit.dps;
        player.rehanSpirit = { ...spiritHit, playerUsesPerSecond: playerUses, hitsPerUse: hit.rate?.hitsPerUse || 0 };
        player.rate = { ...player.rate, usesPerSecond: totalUses, hitsPerSecond: (player.rate?.hitsPerSecond || 0) + usesPerSecond * (hit.rate?.hitsPerUse || 0) };
        player.combat = { ...player.combat, perUse: totalUses > 0 ? dps / totalUses : player.combat.perUse, dps, dpsBeforeTarget: (player.combat?.dpsBeforeTarget || 0) + usesPerSecond * perUseBefore, fiveSecondAverageDps: (player.combat?.fiveSecondAverageDps || 0) + spiritHit.dps, twentySecondAverageDps: (player.combat?.twentySecondAverageDps || 0) + spiritHit.dps };
        player.modeled = true;
        player.notes = [...(player.notes || []), `Seething Spirit (hero trait audit B10, provisional): +${r4(usesPerSecond)} casts/s of ${player.name} (your use rate × ${spirit.speedFactor} × ${r4(spirit.presence * 100)}% presence × ${r4(rehan.rage.uptime * 100)}% Berserk uptime), ${r4(perUse)} per cast with the Berserk lines${spirit.additional.length ? ` and ${spirit.additional.map((line) => `${line.value}%`).join(", ")} additional` : ""} = ${r4(spiritHit.dps)} DPS; its ailments are not counted.`];
      }
    }
    const burstHit = skillHits.find((hit) => hit.setupKey === BURST_SETUP_KEY) || null;
    lineConditionState.rehan = withRehanHits(rehan, { burstHit: burstHit ? { modeled: Boolean(burstHit.modeled), inactiveReason: burstHit.inactiveReason || null, usesPerSecond: burstHit.rate?.usesPerSecond || 0, dps: burstHit.combat?.dps || 0 } : null, spiritHit, spiritReturning });
    const rehanModules = new Set(["rage", "burst", "spirit"]);
    const settled = resolveHeroModules(modifierTexts.filter((line) => (line.origin === "trait" || line.origin === "memory") && !line.lineEffect), lineConditionState).entries.filter((entry) => rehanModules.has(entry.module));
    lineEffects.lines = [...lineEffects.lines.filter((entry) => !rehanModules.has(entry.module)), ...settled];
  }
  // Elemental Impact (2026-10-15 patch update): its condition (Fire, Cold and Lightning dealt) follows the hit model's final parts
  // (own types, conversions, added flat damage), so the badge, the skill's own DoT and its ailments read what the hits dealt.
  for (const hit of skillHits.filter((item) => item.modeled)) {
    const clauses = (setups.find((setup) => setup.setupKey === hit.setupKey)?.supportEffects?.clauses || []).filter((clause) => clause.family === "allElementalAdditional");
    if (!clauses.length) continue;
    const dealt = (hit.components || []).filter((component) => (component.roll?.min || 0) + (component.roll?.max || 0) > 0).map((component) => component.type);
    const { active, missing } = allElementalState(dealt);
    for (const clause of clauses) Object.assign(clause, { active, status: active ? "In calc" : "Inactive", reason: active ? `the hits deal Fire, Cold and Lightning (own types, conversions, added flat damage); applies to the Elemental hit parts and the skill's own Elemental damage over time; "recently" is held while the skill is used continuously` : `the supported skill doesn't deal all three Elemental types (missing: ${missing.join(", ")})`, consumers: active ? ["skill-hit"] : [] });
  }
  // Spacetime Illusion (src/hero-trait-modules.js; provisional): extra Main Skill uses at the Illusion's rate, each a full
  // use of the Main Skill ("considered your castings"); "Unable to cast the Main Skill" removes the player's own uses.
  // An item-triggered skill that computes no damage here (weapon restriction, no weapon damage): its line reads Inactive.
  for (const source of itemTriggerSources) {
    const hit = skillHits.find((item) => item.setupKey === source.setupKey);
    if (!hit?.modeled) mechanics.recognized.set(normalizeLineText(String(source.itemTrigger.text)).trim(), `Inactive: ${source.setup.name} deals no damage here${hit?.inactiveReason ? ` (${hit.inactiveReason})` : " (no weapon damage or no hits)"}`);
  }
  // Scorching Beam's hits apply and take the Mark like the generic hits (2026-10-14); Minion hits take it once settled.
  const mark = settleMark(markState, [...skillHits, ...(nativeHitCycle ? [{ modeled: true, name: "Scorching Beam", crit: { chancePercent: beamCritical.criticalChancePercent } }] : [])]);
  let illusion = lineEffects.hero?.illusion;
  const illusionHit = illusion ? skillHits.find((hit) => hit.modeled && hit.setupKey === resolvedMain?.setupKey) : null;
  // Hero trait audit B4 (src/youga-spacetime.js): the Illusion state settled with this pass's Main Skill cast rate and the
  // character's increased Cast Speed (Eeeendless Mana's rate, Make it Quick); the moon's and I'm Out of Mana's stacks keep the
  // measuring pass's rates (they are lines the hits already read).
  let yougaIllusionFacts = null;
  if (illusionHit) {
    const ownCastsPerSecond = Math.max(0, (illusionHit.rate.usesPerSecond || 0) - (illusionHit.rate.spellBurst?.extraUsesPerSecond || 0));
    const mainSetup = setups.find((setup) => setup.setupKey === illusionHit.setupKey);
    const characterSpeed = mainSetup ? scorchingBeamCastRate({ lineSpeed: lineEffects.castSpeed, blessings, ceaselessTide: heroMemories.ceaselessTide, main: { ...mainSetup, supports: [] }, talentSlate, equipment: memoryEquipment, pact, aimCastSpeedPercent: aim.averageCastSpeedPercent }) : null;
    yougaIllusionFacts = { playerCastsPerSecond: ownCastsPerSecond, castSpeedIncreasedPercent: characterSpeed?.increasedPercent ?? null, castsPerSecond: hitRateFacts?.youga?.castsPerSecond ?? null };
    illusion = resolveIllusionState(modifierTexts.filter((line) => (line.origin === "trait" || line.origin === "memory") && !line.lineEffect), { ...lineConditionState, yougaSpacetime: yougaIllusionFacts }) || illusion;
    const stream = settleIllusionStream({ hit: illusionHit, illusion, telepathy: illusion.telepathy });
    const totalRate = stream.totalRate;
    illusionHit.illusion = { ...illusion, playerUsesPerSecond: stream.playerUsesPerSecond, ownCastsPerSecond, illusionUsesPerSecond: stream.illusionUsesPerSecond, perUseBefore: illusionHit.combat.perUse, spellBurst: stream.spellBurst };
    illusionHit.rate = { ...illusionHit.rate, usesPerSecond: totalRate, hitsPerSecond: totalRate * (illusionHit.rate.hitsPerUse || 0) };
    illusionHit.combat = { ...illusionHit.combat, perUse: stream.perUse, dps: stream.dps, fiveSecondAverageDps: stream.dps, twentySecondAverageDps: stream.dps };
    illusionHit.notes = [...(illusionHit.notes || []), `Spacetime Illusion: +${Math.round(illusion.usesPerSecond * 1000) / 1000} Main Skill uses/s (provisional; windows use the steady rate)${stream.note ? `; ${stream.note}` : ""}`];
    // The badges read the settled Illusion state (src/hero-trait-modules.js).
    const settled = resolveHeroModules(modifierTexts.filter((line) => (line.origin === "trait" || line.origin === "memory") && !line.lineEffect), { ...lineConditionState, yougaSpacetime: { ...yougaIllusionFacts, castsPerSecond: yougaIllusionFacts.castsPerSecond } }).entries.filter((entry) => entry.module === "illusion");
    lineEffects.lines = [...lineEffects.lines.filter((entry) => entry.module !== "illusion"), ...settled];
  }
  const modeledSkillHits = skillHits.filter((hit) => hit.modeled);
  // Crimson Gash's Gash (official patch notes: "+12% additional Terra Skill Damage (multiplies), −40% Terra Charge Recovery Speed,
  // up to 8 stacks, lasts 3 s"). The recovery penalty is in the Terra Charge interval (src/selena-dance.js settleGash).
  // "additional Terra Skill Damage" reaches Terra skills' hits only, not their own DoT (user-confirmed 2026-10-13 for the Dance
  // base trait's line; the same wording here), so a DoT-only Main Terra gains no damage; on Terra hits it is not modeled.
  const mainTerraHasHits = modeledSkillHits.some((hit) => hit.setupKey === resolvedMain?.setupKey && (hit.profile?.tags || []).includes("Terra"));
  const mainGash = terraChargesFor(resolvedMain)?.gash;
  for (const line of modifierTexts.filter((item) => GASH_GAIN_TEXT.test(normalizeLineText(String(item.text)).trim()))) {
    const recovery = `Gash: ${GASH.recoveryPercent}% Terra Charge Recovery Speed per stack × ${mainGash?.stacks ?? 0} held (${GASH.durationSeconds} s each, up to ${GASH.maxStacks}) in the Terra Charge interval`;
    mechanics.recognized.set(normalizeLineText(String(line.text)).trim(), mainTerraHasHits
      ? `Not modeled: Gash's +${GASH.additionalPercent}% additional Terra Skill Damage (multiplies) per stack on the Main Terra Skill's hits. ${recovery}`
      : `${recovery}; its +${GASH.additionalPercent}% additional Terra Skill Damage per stack reaches Terra skills' hits only, not their own damage over time (user-confirmed 2026-10-13), and the Main Terra Skill deals no hits`);
  }
  // Minions (src/minion-damage-model.js): one calculation per Minion type whose skills are active (a setup of any of
  // the Minion's skills activates it). Minion-named lines only (build lines and the hero's traits); the player's
  // damage layers never apply (manual rule 1001011821). The summon level is the highest of its active setups.
  const minionTarget = { resistancePercent: { Fire: damageCombat.targetFireResistancePercent, Cold: damageCombat.targetColdResistancePercent ?? 30, Lightning: damageCombat.targetLightningResistancePercent ?? 30, Erosion: damageCombat.targetErosionResistancePercent ?? 30 }, ...(juggernaut ? { armourPercent: juggernaut.armourPercent, nonPhysicalArmourPercent: juggernaut.nonPhysicalArmourPercent } : {}) };
  const traitLines = heroTraitStatLines(state, heroMemories.baseTraitLevel, traitLevelBonus, { artificialMoon: heroMemories.artificialMoon });
  // Commander's Gambit (core audit B7, src/minion-cores.js): your held Blessings on the Minions at three times your max stacks.
  const commanderGambit = commanderGambitState(modifierTexts, blessings);
  // Bond (Boss / Burning Aggression; src/minion-cores.js bondState) and Orders' Summon Skill Cast Speed (summonCastSpeed).
  const minionBond = bondState(modifierTexts, { prebuilt: requestedConditions.prebuiltSelfBuffs !== false });
  const minionSummonCast = summonCastSpeed(modifierTexts);
  // Warden's Breastpin (legendary audit batch 8): "75% of Critical Strike Rating and Critical Strike Damage are also applied to
  // Minions": that share of the player's plain "+X% Critical Strike Rating / Damage" lines (conditional ones the resolver made active
  // included; flat rating and skill- or tag-scoped lines left out: provisional) as the Minions' own increased crit lines.
  const critShare = modifierTexts.reduce((share, line) => { const match = String(line.text ?? "").replace(/\s+/g, " ").trim().match(/^(\d+(?:\.\d+)?) ?% of Critical Strike Rating and Critical Strike Damage are also applied to Minions$/i); return Math.max(share, match ? Number(match[1]) : 0); }, 0);
  const minionCritShareLines = critShare > 0 ? ["Rating", "Damage"].flatMap((kind) => {
    const total = modifierTexts.reduce((sum, line) => { if (line.origin === "derived" && !line.lineEffect) return sum; const match = normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(new RegExp(`^([+-]\\d+(?:\\.\\d+)?)% Critical Strike ${kind}$`, "i")); return sum + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0);
    return total ? [{ kind: kind === "Rating" ? "critRating" : "critDamage", value: total * critShare / 100, additional: false, source: "Warden's Breastpin", text: `${critShare}% of your +${Math.round(total * 100) / 100}% Critical Strike ${kind} applied to Minions (provisional)` }] : [];
  }) : [];
  // Command (Mighty Guard; src/minion-cores.js commandState): full Command on Synthetic Troop Minions (best case, switch fullCommand).
  const minionCommand = commandState(modifierTexts, { full: requestedConditions.fullCommand !== false, minionsCrit: Boolean(lineConditionState.minionsCrit) });
  // Isomorphic Arms (src/minion-cores.js isomorphicArmsState; user-supplied 2026-10-19): the main-hand weapon's damage and affixes on
  // the Minions (not its base attack speed or base crit rating).
  const mainHandItem = (equipment?.candidateItems || []).find((item) => item.slot === "mainHand" && !(state.disabledEquipmentSlots || []).includes(item.slot)) || null;
  const isomorphicArms = isomorphicArmsState(modifierTexts, { weaponAttack, itemTexts: mainHandItem ? effectiveGearModifierTexts(mainHandItem) : [], classify: classifyMinionLine, localKind: weaponLocalLineKind });
  // Comradeship (Aromatic belt blend; src/minion-cores.js comradeshipState, belt blend audit 2026-10-21, provisional): the belt's affixes on
  // the Minions, read like Isomorphic Arms' weapon affixes.
  const beltItem = (equipment?.candidateItems || []).find((item) => item.slot === "belt" && !(state.disabledEquipmentSlots || []).includes(item.slot)) || null;
  const comradeship = comradeshipState(modifierTexts, { beltName: beltItem?.name || null, itemTexts: beltItem ? effectiveGearModifierTexts(beltItem) : [], classify: classifyMinionLine });
  // Moto / Iris (hero trait audit B6; src/moto-iris-traits.js): each Minion's trait inputs (Overload, Charge Calling, Nourishment's
  // extras, the Vigilant state, Merging Stream's Origins), the Spirit Magi first (Nourishing Spring Rain's troops read them).
  const motoIris = lineConditionState.motoIris || null;
  const mergingOrigins = motoIris?.vigilant?.merging && !motoIris.vigilant.merging.noOriginLine ? mergingStreamOrigins({ summons: lineConditionState.spiritMagusSummons || [], modifierTexts }) : null;
  const computeMinion = ({ profile, sources }, heroInput = {}) => {
    const minionSetups = sources.map((source) => setups.find((setup) => setup.setupKey === source.setupKey)).filter(Boolean);
    // Main stats of the summoning skill (manual keyword text: "+0.5% additional Skill Damage and Minion Damage" per point;
    // "This includes … the damage of Minions summoned by the skill"; several main stats add). Stat-sheet totals (provisional:
    // the beam's pooled Intelligence ledger is not used for Minions).
    const summonStats = [...new Set(minionSetups.flatMap((setup) => (setup.tags || []).filter((tag) => ["Strength", "Dexterity", "Intelligence"].includes(tag))))];
    const summonStatPercent = mechanics.intelligence?.removed ? 0 : summonStats.reduce((sum, stat) => sum + 0.5 * (Number(lineEffects.state?.stats?.[stat.toLowerCase()]) || 0), 0);
    const mainStatLine = summonStatPercent ? [{ text: `+${Math.round(summonStatPercent * 10000) / 10000}% additional Minion Damage`, source: `Main stats of the summoning skill (${summonStats.join(" + ")}; 0.5% per point)`, origin: "derived", multiplier: 1 }] : [];
    // Trait lines reach the Minions as `traitLines` (raw); a trait's resolved conditional Minion body (Radiation Field's "for
    // every Aura affecting you and your Minions"; hero trait audit B2) is a derived line the raw text does not carry, so it joins.
    // World Within (Iris; hero trait audit B2, src/world-within.js): this Magus's Enhanced-skill chance from its element's resistance
    // (Rock Magus: Armor) joins its trait lines; the raw line is read here, so it leaves the Minion model's unread list.
    const worldWithin = (lineEffects.lines || []).find((entry) => entry.condition === "worldWithin");
    const worldChance = worldWithin?.active ? worldWithinChances(worldWithin.params, lineConditionState.worldWithinInputs)[profile.minion] : null;
    const profileTraitLines = worldWithin ? [...traitLines.filter((line) => !WORLD_WITHIN_LINE.test(normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim())),
      ...(worldChance?.chance > 0 ? [{ text: `+${worldChance.chance}% chance for Spirit Magi to use an Enhanced Skill`, source: `${worldWithin.source} (World Within: ${worldChance.stat === "Armor" ? `${worldChance.value} Armor` : `${worldChance.value}% ${worldChance.stat} Resistance`})`, origin: "trait", multiplier: 1 }] : [])] : traitLines;
    return calculateMinion({ profile, level: Math.max(1, ...minionSetups.map((setup) => setup.effectiveLevel ?? 20)), modifierTexts: [...modifierTexts.filter((line) => line.origin !== "trait" || (line.lineEffect?.conditional && classifyMinionLine(line.text))), ...mainStatLine], traitLines: profileTraitLines, target: minionTarget, timelineSeconds: 60, setups: minionSetups,
      // Iris Nourishment: the Trait Skill is pressed whenever off cooldown (best case, default on); the combat condition
      // "traitSkillOnCooldown" set to false never presses it (user run A, 2026-10-12).
      traitSkill: requestedConditions.traitSkillOnCooldown === false ? "none" : "cooldown",
      // Synthetic Troop Minions (modules and summons, 2026-10-21): all summoned before engaging when own buffs are pre-built (default),
      // else one summon at a time; "troopMaxMinions" off (or a saved "moduleMaxMinions" off) reads one Minion per summon.
      prebuilt: requestedConditions.prebuiltSelfBuffs !== false, troopMaxMinions: (requestedConditions.troopMaxMinions ?? requestedConditions.moduleMaxMinions) !== false,
      // The Marked dummy (src/mark-effect.js, settled above): its crit-damage-taken reaches the Minion hits' crit share (2026-10-14).
      extraCritOnly: mark?.active && mark.critOnlyLine ? [mark.critOnlyLine] : [],
      // Conditional lines the shared resolver reads (src/line-effects.js) are not "unread" Minion lines (core audit B7).
      handledTexts: lineEffects.lines.map((line) => line.text),
      extraLines: [...(commanderGambit?.lines || []), ...(blessings.minionLines || []), ...minionCritShareLines, ...(COMMAND_FAMILIES.includes(profile.family) ? minionCommand?.lines || [] : []), ...(isomorphicArms?.lines || []), ...(comradeship?.lines || [])], bond: minionBond, summonCastSpeed: minionSummonCast,
      // The resolved Scorch curse on the dummy (as for skill hits); derived debuff lines arrive through modifierTexts.
      // Selena: the enemy-on-Tide entry is a target attribute (5720), so Minion hits take it too (src/selena-tide.js takenLines).
      extraTaken: [...(conditions.scorch ? [{ source: "Scorch curse", text: `+${curses.scorchDamagePercent}% additional Fire Damage taken (Scorch on the dummy)`, value: curses.scorchDamagePercent, types: ["Fire"] }] : []), ...singWithTheTide.takenLines],
      heroTraits: minionHeroTraits(motoIris, { family: profile.family, setupKeys: minionSetups.map((setup) => setup.setupKey), mainSetupKey: resolvedMain?.setupKey ?? null, merging: mergingOrigins, ...heroInput }) });
  };
  const minionGroups = groupMinionSources(damageSources);
  const magusGroups = minionGroups.filter((group) => group.profile.family === "spirit-magus");
  const results = new Map();
  // Vigilant Breeze (Q-H13): without Happiest Reunion one Magus is Merged: the one whose merging gains the most (best case).
  const vigilantHeld = Boolean(motoIris?.vigilant?.held);
  if (vigilantHeld && magusGroups.length > 1 && !motoIris.vigilant.allMerged) {
    const apart = magusGroups.map((group) => computeMinion(group, { merged: false, magiCount: magusGroups.length }));
    const together = magusGroups.map((group) => computeMinion(group, { merged: true, magiCount: magusGroups.length }));
    const gains = magusGroups.map((_, index) => (together[index]?.combat?.dps || 0) - (apart[index]?.combat?.dps || 0));
    const best = gains.indexOf(Math.max(...gains));
    magusGroups.forEach((group, index) => results.set(group, index === best ? together[index] : apart[index]));
  } else for (const group of magusGroups) results.set(group, computeMinion(group, { merged: vigilantHeld, magiCount: magusGroups.length }));
  // Socialite (B6, provisional): +N Max Summonable Spirit Magi per Magus skill, within the map cap (one per Magus skill + the "Max
  // Spirit Magi In Map" lines): the extra Magi go to the Magi with the highest DPS per Magus.
  const socialite = motoIris?.growing;
  if (socialite?.summonable > 0 && socialite.mapCap > 0 && magusGroups.length) {
    let slots = Math.min(magusGroups.length * socialite.summonable, socialite.mapCap);
    const ranked = magusGroups.filter((group) => results.get(group)?.modeled).sort((a, b) => (results.get(b).combat.perMinionDps || 0) - (results.get(a).combat.perMinionDps || 0));
    for (const group of ranked) {
      if (slots <= 0) break;
      const extra = Math.min(socialite.summonable, slots);
      slots -= extra;
      results.set(group, computeMinion(group, { merged: vigilantHeld, magiCount: magusGroups.length, extraCount: extra }));
    }
  }
  const magiResults = magusGroups.map((group) => results.get(group)).filter((minion) => minion?.modeled && minion.magus);
  const magiFacts = magiResults.length ? { present: true, maxGrowth: Math.max(...magiResults.map((minion) => minion.magus.growth || 0)), maxEnhancedChance: Math.max(...magiResults.map((minion) => minion.magus.enhancedChancePercent || 0)) } : null;
  for (const group of minionGroups) if (!results.has(group)) results.set(group, computeMinion(group, { magi: magiFacts }));
  const minions = minionGroups.map((group) => results.get(group)).filter(Boolean);
  // Empower (Alchemist core; src/minion-cores.js): one Spirit Magus in the map, the strongest kept (best case).
  const spiritMagiLimit = applySpiritMagiLimit(minions, modifierTexts);
  // Moto / Iris (B6): the Minions' results settle the module badges (src/moto-iris-traits.js b6LineStatus).
  if (motoIris) {
    motoIris.minions = minions.map((minion) => ({ key: minion.minionKey, name: minion.name, family: minion.family, modeled: minion.modeled, dps: minion.combat?.dps || 0, count: minion.count, heroTraits: minion.heroTraits, magus: minion.magus }));
    const settled = resolveHeroModules(modifierTexts.filter((line) => (line.origin === "trait" || line.origin === "memory") && !line.lineEffect), lineConditionState).entries.filter((entry) => B6_MODULE_KEYS.has(entry.module));
    lineEffects.lines = [...lineEffects.lines.filter((entry) => !B6_MODULE_KEYS.has(entry.module)), ...settled];
  }
  const modeledMinions = minions.filter((minion) => minion.modeled);
  // The Main Skill's Minion, else the first modeled Minion: a board whose damage is only Spirit Magi has no Main Skill (the
  // summons keep the Aura role), and its Minion then drives the schedule below like a Minion main skill (2026-10-21: a new Iris
  // build with one Erosion Magus had no recount). It sets the schedule only when no hit, DoT or beam of the player's does.
  const mainMinion = modeledMinions.find((minion) => minion.setupKeys.includes(resolvedMain?.setupKey)) || modeledMinions[0] || null;
  // Per-skill ailment application (src/ailment-applications.js): Scorching Beam at its cast rate and every modeled
  // spell hit at its hit rate, each with its own chance, "cannot inflict" block and scoped layers; src/ailment-model.js
  // pools the streams per ailment on the target (strongest applications for Trauma, independent stacks for Wilt).
  const applierCandidates = collectAilmentApplierCandidates({
    beam: activeNames.has("Scorching Beam") ? { setup: main, castsPerSecond: beamCastRate.castsPerSecond, critChancePercent: beamCritical.criticalChancePercent } : null,
    skillHits: modeledSkillHits.map((hit) => ({ hit, setup: allHitSources.find((source) => source.setupKey === hit.setupKey)?.setup }))
  });
  // "−X% All Resistance when the enemy has max Affliction" on every DoT of a resisted type (user decision 2026-10-21): the Ignite
  // path's sources (any origin) and its uptime rule (src/max-affliction-resistance.js), with the build's whole Affliction per second
  // (skill DoTs' own included, as the derived rating) and the same full-Affliction removers. A Fire DoT takes none while a core fixes
  // the Fire Resistance (Fueling).
  const maxAfflictionResistanceInfo = (() => {
    const all = theoretical.combat?.maxAfflictionAllResistance;
    if (!conditions.affliction || !all?.reductionPercent) return null;
    const uptime = maxAfflictionUptime({ afflictionPerSecond: Math.max(0, theoretical.townTooltip.passiveAfflictionPerSecond + skillDotAfflictionRate), removers: theoretical.combat.afflictionRemovers || [] });
    return { reductionPercent: all.reductionPercent, sources: all.sources, ...uptime };
  })();
  const maxAfflictionResistanceFor = (damageType) => damageType === "Fire" && theoretical.combat?.maxAfflictionAllResistance?.fireResistanceFixed ? null : maxAfflictionResistanceInfo;
  const sharedFor = (key, resistance) => buildAilmentSharedLayers({ theoretical, modifierTexts, conditions, combat: damageCombat, hasSealedLife, targetCursed, ailmentKey: key, targetResistancePercent: resistance, penetration: mechanics.penetration, maxAfflictionResistance: maxAfflictionResistanceFor(key === "ignite" ? "Fire" : key === "wilt" ? "Erosion" : "Physical") });
  const appliersFor = (key, shared) => ailmentAppliersFor({ ailmentKey: key, candidates: applierCandidates, modifierTexts, shared, overlyModified, mainSetupKey: resolvedMain?.setupKey ?? null, auraChancePercent: ailmentChanceFromAuras });
  // "Gains X% - Y% of the added Flat Damage's value as Base <Ailment> Damage" (game node 381; Evil Heart Armor, Confusion Elemental
  // Belt; legendary audit batch 6): the main skill's added flat damage per hit, after added damage effectiveness, summed over its
  // first strike's parts and the added-only parts riding on it (provisional reading of "the added Flat Damage's value"). The beam's
  // Ignite ledger does not read it (Not modeled there).
  const ailmentFlatAdded = (() => {
    const hit = modeledSkillHits.find((item) => item.setupKey === resolvedMain?.setupKey) || modeledSkillHits[0];
    const parts = hit?.components || [];
    if (!parts.length) return null;
    const strike = parts[0].strikeKey;
    const own = parts.filter((part) => part.strikeKey === strike || String(part.key || "").startsWith("added:"));
    const range = own.reduce((total, part) => ({ min: total.min + (part.added?.min || 0), max: total.max + (part.added?.max || 0) }), { min: 0, max: 0 });
    return range.max > 0 ? range : null;
  })();
  const ailments = Object.fromEntries(Object.entries(ailmentTargets).map(([key, resistance]) => {
    const shared = sharedFor(key, resistance);
    return [key, calculateAilment({
      ailmentKey: key, modifierTexts, shared, crit: beamCritical, appliers: appliersFor(key, shared), combat: damageCombat, flatAdded: ailmentFlatAdded,
      auraChancePercent: ailmentChanceFromAuras, auraDurationPercent: ailmentDurationFromAuras, enemyAilmentTypes, fieryFantasy: coreNames.has("Fiery Fantasy")
    })];
  }));
  // Ignite from other skills. With Scorching Beam igniting, their successes join the calibrated Ignite ledger as
  // success-equivalent attempts at the beam's chance (their Ignites are given the beam's layers: provisional).
  // Without it, Ignite goes through the generic ailment model with the ledger's base, duration, stack limit and
  // stacks per application; several active stacks are the run's strongest applications (shared timer, user-confirmed 2026-10-19).
  const igniteShared = sharedFor("ignite", damageCombat.targetFireResistancePercent);
  // One Ignite-chance computation for every inflicting skill (src/ailment-applications.js skillAilmentChance):
  // the ledger's build-wide entries (Volcano Kismets, gear, talents, slates, pacts, auras) plus the skill's own
  // scoped lines. For Scorching Beam this reproduces theoretical.totals.applicationChancePercent exactly
  // (tests/ignite-chance-paths.test.js).
  // User-confirmed in game (2026-10-11): Flame Jet and Fire Burst apply Ignite when the build has Ignite
  // chance and some base Ignite, so non-beam hitting skills are Ignite appliers like the beam.
  const igniteAppliers = ailmentAppliersFor({ ailmentKey: "ignite", candidates: applierCandidates, modifierTexts, shared: igniteShared, overlyModified, mainSetupKey: resolvedMain?.setupKey ?? null, globalChanceSources: igniteGlobalChanceSources(theoretical) });
  const applies = (applier) => !applier.blocked && applier.applicationsPerSecond > 0 && (applier.chancePercent ?? 0) > 0;
  let igniteAttemptsPerSecond = beamCastRate.castsPerSecond;
  let igniteChanceForRecount = null;
  const extraIgniteAppliers = canIgnite ? igniteAppliers.filter((applier) => !applier.beam && applies(applier)) : [];
  if (extraIgniteAppliers.length) {
    const mainChance = theoretical.totals.applicationChancePercent;
    igniteAttemptsPerSecond += extraIgniteAppliers.reduce((sum, applier) => sum + applier.applicationsPerSecond * applier.chancePercent / mainChance, 0);
    theoretical = compileFinal(igniteAttemptsPerSecond);
    if (afflictionRating) { afflictionRating = resolveAfflictionRating(theoretical); configured = configuredFor(); }
    igniteChanceForRecount = Math.min(100, mainChance * igniteAttemptsPerSecond / beamCastRate.castsPerSecond);
  }
  const igniteBaseLines = theoretical.ledger.filter((line) => line.category === "Base Ignite");
  const igniteBase = { min: igniteBaseLines.reduce((sum, line) => sum + (line.value || 0), 0), max: igniteBaseLines.reduce((sum, line) => sum + (line.max ?? line.value ?? 0), 0) };
  const igniteFlatBase = Boolean(ailmentFlatAdded) && collectAilmentTypedSources("ignite", modifierTexts).flatBase.length > 0;
  if (!canIgnite && (igniteBase.max > 0 || igniteFlatBase) && igniteAppliers.some((applier) => !applier.beam && applies(applier))) {
    ailments.ignite = { ...calculateAilment({
      ailmentKey: "ignite", modifierTexts, shared: igniteShared, crit: beamCritical, appliers: igniteAppliers.filter((applier) => !applier.beam), combat: damageCombat, flatAdded: ailmentFlatAdded,
      auraChancePercent: ailmentChanceFromAuras, auraDurationPercent: ailmentDurationFromAuras, enemyAilmentTypes,
      overrides: { chance: combineAilmentChance(igniteGlobalChanceSources(theoretical)), base: igniteBase, durationSeconds: theoretical.totals.igniteDurationSeconds, stackLimit: igniteLimit, stacksPerApplication: 1 + theoretical.totals.additionalInflictedStacks, stacking: "strongest", skipTypedDamage: true }
    }), genericIgnite: true, notes: ["Ignite from a skill other than Scorching Beam: generic ailment model with the Ignite ledger's base, duration, stack limit and layers (provisional; no in-game run yet)."] };
  }
  // The dummy starts clean: its hits meet the 30% setting until the first success, then the Scorch / Ignited resistance
  // (Sun's Embrace alone: the Ignited state is one stack's worth; with Fire's Allure the change follows the Scorch stacks).
  const ignitedHitChange = canIgnite && ignitedResistance.applies && ignitedResistance.hitPercent !== ignitedResistance.unmultipliedPercent;
  const beamScorch = (firesAllure.active && firesAllure.resistanceReductionPercent > 0) || ignitedHitChange ? {
    active: true,
    baseResistancePercent: state.combat.targetFireResistancePercent - hitPenetrationPercent,
    activeResistancePercent: ignitedResistance.hitPercent - hitPenetrationPercent,
    applicationChancePercent: theoretical.totals.applicationChancePercent,
    durationSeconds: theoretical.totals.igniteDurationSeconds,
    activeStacks: firesAllure.activeStacks || 1,
    stacksPerApplication: 1 + theoretical.totals.additionalInflictedStacks
  } : null;
  const bardDelivery = estimateBardBeamDelivery({
    heroId: state.hero.selectedHeroId,
    beamActive: activeNames.has("Scorching Beam"),
    sourceScale: nativeHitCycle ? nativeHitCycle.expectedDps / (scorchingBeamSustainedHits({ damageFactor: 0.8 }).expectedDps) : 0,
    nativeCycle: nativeHitCycle,
    targetFireResistancePercent: hitTargetFireResistancePercent,
    conditions,
    scorch: beamScorch
  });
  // The beam's dummy delivery on every hero: Selena's calibrated Bard delivery, else the native cycle as delivered
  // (no Bard residual; src/scorching-beam-delivery.js estimateNeutralBeamDelivery). Recount, windows and projection read it.
  const beamDelivery = bardDelivery || estimateNeutralBeamDelivery({ heroId: state.hero.selectedHeroId, beamActive: activeNames.has("Scorching Beam"), nativeCycle: nativeHitCycle, targetFireResistancePercent: hitTargetFireResistancePercent, conditions, scorch: beamScorch });
  const combatProjection = combineBeamAndIgnite(beamDelivery, theoretical.combat.expectedActiveIgnite, theoretical.combat.reaping);
  const recountWindowSeconds = 20;
  // Other skills' Ignite successes fold into the beam's per-use chance (success-equivalent; src/ailment-applications.js).
  const pooledIgnite = (ignite) => igniteChanceForRecount == null || !ignite ? ignite : { ...ignite, applicationChancePercent: igniteChanceForRecount, notIgnitedApplicationChancePercent: Math.min(100, (ignite.notIgnitedApplicationChancePercent ?? ignite.applicationChancePercent) * igniteAttemptsPerSecond / beamCastRate.castsPerSecond) };
  const recountIgnite = pooledIgnite(theoretical.combat.expectedActiveIgnite) || { mode: "one-stack", baseRange: { min: 0, max: 0 }, expectedBaseDamage: 0, expectedDps: 0, applicationChancePercent: 0, durationSeconds: 4, maximumActiveStacks: 1 };
  const recountInputs = { delivery: beamDelivery, nativeCycle: nativeHitCycle, strongestOneStack: recountIgnite, reaping: theoretical.combat.reaping };
  // Display-only and shadow passes must not stop the planner: a failure becomes a warning and a null figure.
  const shadowWarnings = [];
  const guarded = (label, compute) => {
    try { return compute(); } catch (error) { shadowWarnings.push(`${label} could not be calculated (${error?.message || error}); it is left blank.`); return null; }
  };
  // Cold start (prebuiltSelfBuffs off; CLAUDE.md): channeled stacks ramp from the minimum over the window, on every path.
  // The ramp multiplies the beam, the DoTs and the Reaps that settle them (1 when stacks are pre-built or without Supercharge).
  const coldStartRamp = (seconds) => requestedConditions.prebuiltSelfBuffs !== false ? 1 : mechanics.channelRamp(seconds, beamCastRate.castsPerSecond);
  // Timed and stacking effects (src/timed-effects.js; pact scripted-effects batch 2026-10-13): Ice Cage, Melting Flames, Witch
  // Antelope's Paralysis, Bitter Thunder, Numbed, … Every ledger holds their sustained value; the 5 s / 20 s windows and the
  // recount scale each source by the time average of its factor (a cast at t = 0; debuffs from zero on the clean dummy). On a
  // DoT the factor multiplies the window average (the DoT's own build-up and the effect's clock are taken as independent;
  // provisional). The beam is a Fire hit, Ignite a Fire DoT.
  // Erika's Multistrike states over time (Stalker's build-up, Hunting Instinct's cycle) reach each multistriking hit (keyed parts).
  const timedParts = [...(lineEffects.combat?.timedEffects || []).filter((effect) => effect.active).flatMap((effect) => effect.parts || []), ...(windStalker?.timedParts || []), ...yougaTimedParts];
  const beamShare = { hit: true, types: { Fire: 1 } }, igniteShare = { hit: false, types: { Fire: 1 } };
  const withTimedEffects = (opening) => {
    if (!opening || !timedParts.length) return opening;
    const beam = opening.beamDps * timedWindowFactor(timedParts, beamShare, opening.seconds), ignite = opening.igniteDps * timedWindowFactor(timedParts, igniteShare, opening.seconds), reap = opening.reapingDps * timedWindowFactor(timedParts, igniteShare, opening.seconds);
    return { ...opening, beamDps: beam, igniteDps: ignite, reapingDps: reap, totalDpsApproximation: opening.totalDpsApproximation + (beam - opening.beamDps) + (ignite - opening.igniteDps) + (reap - opening.reapingDps) };
  };
  const withColdStartRamp = (opening) => {
    const factor = opening ? coldStartRamp(opening.seconds) : 1;
    if (!opening || factor === 1) return opening;
    return { ...opening, beamDps: opening.beamDps * factor, igniteDps: opening.igniteDps * factor, reapingDps: opening.reapingDps * factor, totalDpsApproximation: opening.totalDpsApproximation * factor, channelRamp: factor };
  };
  const recountFiveSeconds = withTimedEffects(withColdStartRamp(guarded("5-second recount estimate", () => estimateFiveSecondOpening({ ...recountInputs, seconds: 5 }))));
  const recountOpening = withTimedEffects(withColdStartRamp(guarded("20-second recount estimate", () => estimateFiveSecondOpening({ ...recountInputs, seconds: recountWindowSeconds }))));
  const recountVariation = skipVariation ? null : guarded("Recount variation", () => simulateFiveSecondVariation({ delivery: beamDelivery, nativeCycle: nativeHitCycle, ignite: recountIgnite, reaping: theoretical.combat.reaping, criticalChancePercent: beamCritical.criticalChancePercent, criticalDamagePercent: beamCritical.criticalDamagePercent * beamCritOnlyFactor, seconds: recountWindowSeconds }));
  // Damage paths for every modeled ailment plus independent Reaping sources.
  // The established Ignite path (with its own Reaping) is kept unchanged when no
  // other ailment is modeled.
  // Skill DoT sources (Wilting Beam): the skill's own damage over time, refreshed at the main-skill use rate.
  const targetResistanceFor = (type) => type === "Physical" ? 0 : type === "Fire" ? damageCombat.targetFireResistancePercent : type === "Erosion" ? (damageCombat.targetErosionResistancePercent ?? 30) : (damageCombat[`target${type}ResistancePercent`] ?? 30);
  // A DoT profile's recast cadence (below), shared with its Terra Charge line: a cast consumes the charges gained since the last
  // one, up to Max Terra Charge Stacks (src/selena-dance.js; 1 at the default max, so the line is unchanged then).
  // Activation Medium: Terra triggers the Main Terra Skill each time its charges refill to max (no use time; TLIDB).
  // Activation Medium: Wind Rhythm on a recast Terra DoT (Frost Terra): the Terra is recast at each trigger, every cooldown ÷
  // ((1 + CDR + share × Cast Speed) × additional Cast Speed) with the skill's own Cast Speed (src/selena-dance.js
  // windRhythmTerraTrigger; the creator's calc v0.3, user-provided 2026-10-13; provisional). Activation Medium: Terra switches it off.
  const dotCastRate = (source) => scorchingBeamCastRate({ lineSpeed: lineEffects.castSpeed, blessings, ceaselessTide: heroMemories.ceaselessTide, main: source.setup, talentSlate, equipment: memoryEquipment, pact, aimCastSpeedPercent: aim.averageCastSpeedPercent });
  // Generalized 2026-10-13 (src/trigger-interval.js activationMediumDotTrigger): any skill-DoT skill an Activation Medium triggers
  // (interval, cooldown or Boss / Elite wording) takes its use rate from the trigger, 1 / max(trigger interval, the skill's own
  // cooldown after Cooldown Recovery Speed); channeled DoTs are never triggered. Wind Rhythm on a recast Terra keeps its own entry
  // (windRhythmTerra, figures unchanged); the others are listed as dotTriggers.
  const windRhythmTerra = new Map();
  const dotTriggers = new Map();
  const buildCooldownLines = buildCooldownRecoveryLines(modifierTexts);
  const windRhythmFor = (source) => {
    if (activationMediumTerra.active && source.setupKey === resolvedMain?.setupKey) return null;
    if (source.profile.recast) {
      if (!windRhythmTerra.has(source.setupKey)) windRhythmTerra.set(source.setupKey, windRhythmTerraTrigger({ setup: source.setup, castRate: dotCastRate(source), modifierTexts }));
      if (windRhythmTerra.get(source.setupKey)) return windRhythmTerra.get(source.setupKey);
    }
    if (!dotTriggers.has(source.setupKey)) {
      // A Terra's Split cooldown is its Terra Charge gain (no use cooldown); other DoT skills use their game Split cooldown.
      const cooldownSeconds = source.profile.recast ? 0 : Number(skillTimingSs13[source.setup?.name]?.cooldown) || 0;
      const trigger = activationMediumDotTrigger({ setup: source.setup, castRate: dotCastRate(source), cooldownLines: buildCooldownLines, cooldownSeconds, channeled: Boolean(source.profile.channeled) });
      dotTriggers.set(source.setupKey, trigger ? { ...trigger, text: `${source.setup.name}: triggered by ${trigger.medium} every ${Math.round(trigger.triggerIntervalSeconds * 10000) / 10000} s${trigger.castSpeedScaled ? " (Cast Speed share and Cooldown Recovery Speed applied; the creator's calc v0.3; provisional)" : ""}; uses per second = 1 / max(${Math.round(trigger.triggerIntervalSeconds * 10000) / 10000} s, cooldown ${Math.round(trigger.effectiveCooldownSeconds * 10000) / 10000} s) = ${Math.round(trigger.castsPerSecond * 10000) / 10000} (no use time; rate rule user-confirmed 2026-10-12 for Activation Medium: Boss; the trigger on a DoT skill is provisional). Triggered only, so the manual-use penalty does not apply.` } : null);
    }
    return dotTriggers.get(source.setupKey);
  };
  const dotCastsPerSecond = (source) => activationMediumTerra.active && source.setupKey === resolvedMain?.setupKey && source.profile.recast ? 1 / activationMediumTerraInterval(terraChargesFor(source.setup)) : windRhythmFor(source) ? windRhythmFor(source).castsPerSecond : source.profile.refreshPerSecond ?? ((rate) => source.profile.recast ? source.profile.recast.perSecond(rate.baseRate > 0 ? rate.castsPerSecond / rate.baseRate : 1) : rate.castsPerSecond * 0.333 / (source.profile.castIntervalSeconds || 0.333))(dotCastRate(source));
  // First application of the Main Skill's triggered DoT (user decision 2026-10-22): Activation Medium: Terra fires at max Terra
  // Charge, full at engagement with own buffs built before the fight (prebuiltSelfBuffs), else after one full charge; an "Always
  // attempts to trigger" medium (Wind Rhythm, Boss / Elite, Perpetual Motion) fires at engagement. null keeps the first application
  // one interval in (a manual cast at its use time, an "every X s" medium X s in). The windows (src/skill-dot-model.js) and the
  // recount's use schedule (below) start there; other DoTs keep one interval in (the recount schedules only the Main Skill).
  const dotFirstApplication = (source) => {
    if (!resolvedMain || source.setupKey !== resolvedMain.setupKey) return null;
    if (activationMediumTerra.active && source.profile.recast) return requestedConditions.prebuiltSelfBuffs !== false ? 0 : null;
    return windRhythmFor(source)?.startsReady ? 0 : null;
  };
  const skillDots = skillDotSources.map((source) => calculateSkillDot({
    setup: source.setup, profile: source.profile, modifierTexts,
    shared: buildAilmentSharedLayers({ theoretical, modifierTexts, conditions, combat: damageCombat, hasSealedLife, targetCursed, ailmentKey: "wilt", targetResistancePercent: targetResistanceFor(source.profile.damageType), damageType: source.profile.damageType, penetration: mechanics.penetration, maxAfflictionResistance: maxAfflictionResistanceFor(source.profile.damageType) }),
    auraEntries: aura.entries.filter((entry) => activeNames.has(entry.name)),
    // A profile with its own cadence (a cooldown-bound area) uses it; a Terra recasts whenever a Terra Charge is available
    // (profile.recast, src/skill-damage-profiles.js; Cast Speed only for a cast-speed use time); a channel refreshes at
    // the channel rate. Channel profiles with a per-additional-max-stack line read the build's channel stacks
    // (src/build-mechanics.js follows the resolved main skill's supports, so other setups keep the base count).
    // The channel rate is the DoT setup's own (its Quick Decision), not the Scorching Beam setup's (B5).
    castsPerSecond: dotCastsPerSecond(source), firstApplicationSeconds: dotFirstApplication(source), crit: beamCritical, aim, triggered: Boolean(windRhythmFor(source)), lucky: lineEffects.combat?.lucky || null,
    extraAdditional: [...grantedSetupLines(source.setupKey), ...(windRhythmFor(source) || (tangles.setups || []).some((item) => item.setupKey === source.setupKey) ? lineEffects.combat?.buffs?.triggeredSkillAdditional || [] : []), ...(source.profile.extraAdditional || []).map((line) => { if (!(source.profile.recast && /Terra Charge/.test(line.source || ""))) return line; const interval = 1 / Math.max(1e-9, dotCastsPerSecond(source)), minimum = windRhythmFor(source) ? 0 : 1; const charges = terraChargesAtInterval(terraChargesFor(source.setup), interval, { minimum }); return terraChargeLine(line, charges, terraChargesConsumed(charges, interval, { minimum })); }), ...(source.profile.perAdditionalMaxStackAdditionalPercent && source.setupKey === resolvedMain?.setupKey && mechanics.channel.additionalMaxStacks > 0 ? [{ source: `${source.name}: additional Max Channeled Stacks`, text: `+${source.profile.perAdditionalMaxStackAdditionalPercent}% additional damage for every +1 additional Max Channeled Stack(s) (${mechanics.channel.additionalMaxStacks} additional; TLIDB skill text)`, value: source.profile.perAdditionalMaxStackAdditionalPercent * mechanics.channel.additionalMaxStacks, category: "Additional damage" }] : [])]
  }));
  // Ground-effect DoTs of generic spell hits (src/skill-hit-profiles.js skillHitDotComponents): a status refreshed
  // while the dummy stands in the area (refresh rate from the profile), with the skill's Terra Charge line.
  skillDots.push(...skillHitDotSources.filter((source) => modeledSkillHits.some((hit) => hit.setupKey === source.setupKey)).map((source) => calculateSkillDot({
    setup: source.setup, profile: source.profile, modifierTexts,
    shared: buildAilmentSharedLayers({ theoretical, modifierTexts, conditions, combat: damageCombat, hasSealedLife, targetCursed, ailmentKey: "wilt", targetResistancePercent: targetResistanceFor(source.profile.damageType), damageType: source.profile.damageType, penetration: mechanics.penetration, maxAfflictionResistance: maxAfflictionResistanceFor(source.profile.damageType) }),
    auraEntries: aura.entries.filter((entry) => activeNames.has(entry.name)),
    // A DoT laid by every use of a cast skill (Corrosive Shot's Corrosion Terra) is applied at the hit's own use rate.
    castsPerSecond: source.profile.refreshPerSecond ?? modeledSkillHits.find((hit) => hit.setupKey === source.setupKey)?.rate.usesPerSecond ?? 0, crit: beamCritical, aim, lucky: lineEffects.combat?.lucky || null, extraAdditional: [...grantedSetupLines(source.setupKey), ...(source.profile.extraAdditional || [])]
  })));
  for (const dot of skillDots) { const wind = windRhythmTerra.get(dot.setupKey) || dotTriggers.get(dot.setupKey); if (wind) dot.notes?.push(wind.text); }
  for (const dot of skillDots) ailments[dot.key] = dot;
  // Hair-trigger (core audit batch B3): In calc where a modeled skill is triggered (an Activation Medium, a gear / pact trigger, a
  // Wind Rhythm Terra recast, a Tangle Skill's Tangle casts; not Spell Burst casts: user-supplied 2026-10-19, Google AI Mode
  // answer, not tested in game); otherwise nothing takes it.
  for (const entry of (lineEffects.lines || []).filter((line) => line.condition === "hairTrigger" && line.active)) {
    const tangleKeys = new Set((tangles.setups || []).map((item) => item.setupKey));
    const triggeredNames = [...modeledSkillHits.filter((hit) => hit.rate?.trigger || String(hit.setupKey || "").startsWith("item-trigger:") || hit.setupKey === BURST_SETUP_KEY || tangleKeys.has(hit.setupKey)).map((hit) => hit.name || hit.setupKey), ...skillDotSources.filter((source) => windRhythmFor(source) || tangleKeys.has(source.setupKey)).map((source) => source.name)];
    if (triggeredNames.length) entry.conditionText = `${entry.conditionText}; triggered: ${[...new Set(triggeredNames)].join(", ")}`;
    else { entry.active = false; entry.status = "Inactive"; entry.conditionText = `${entry.conditionText}; no triggered skill in the build (an Activation Medium, a gear / pact trigger, Wind Rhythm or a Tangle Skill; Spell Burst casts are not triggered)`; }
  }
  // Spell lines a Spell skill's own DoT applied (src/skill-dot-model.js) read as in calc in the coverage badges.
  for (const dot of skillDots.filter((item) => item.modeled)) for (const text of new Set(dot.spellLineTexts || [])) mechanics.recognized.set(text, [mechanics.recognized.get(text), `Spell Damage (${dot.name} damage over time)`].filter(Boolean).join("; "));
  const afflictionPerSecondTotal = theoretical.townTooltip.passiveAfflictionPerSecond + skillDotAfflictionRate;
  // Built-in Reaps on max channeled stacks, at the skill's use rate. The channel starts at startStacks (base 1 +
  // Min Channeled Stacks; user-observed 2026-10-10: 1, and 3 with Channel Preparation Lv16) and gains one stack
  // per use; after the max-stack Reap it restarts at startStacks (provisional: the restart convention the planner
  // used from 0 before, now from the observed start). One Reap per (max − start + 1) uses, never faster than its
  // cooldown; the first one waits for the opening channel to reach max ((max − start) uses after the first).
  // research/wilting-beam-test-2026-10-10.md compares this with the in-game runs and the other readings.
  const builtInReaps = skillDots.filter((dot) => dot.modeled && dot.builtInReaping).map((dot) => {
    const { maxStacks, startStacks = 1 } = mechanics.channel;
    const usesPerTrigger = Math.max(1, maxStacks - startStacks + 1);
    return { ...dot.builtInReaping, usesPerTrigger, usesPerSecond: dot.applicationsPerSecond, startStacks, maxStacks, firstTriggerUses: usesPerTrigger - 1 };
  });
  // Built-in Reaps of generic spell hits (Scorching Pulse: one Reap per use at the skill's interval; reaping-model "skill use").
  builtInReaps.push(...modeledSkillHits.filter((hit) => hit.builtInReaping).map((hit) => hit.builtInReaping));
  // The follower (src/follower-model.js, 2026-10-17; provisional): Origin Tartarus: Scorching Pulse's Reap of every DoT on the
  // dummy (its own Reaping Duration, not yours), and the follower's own damage as its own source in the windows and the recount.
  // Breakthrough: Rising Heat reads your Reaping Recovery Speed (the increased total the Reaping model uses, Feline Steps' per-
  // Blessing share included); the follower's Reap line and Rising Heat's badge then show the settled figures.
  const followerReapingRecovery = collectReapingModifiers(modifierTexts, blessingRecoverySources(equipment, blessings).map((line) => ({ source: line.source, text: line.text, value: line.value }))).recovery.reduce((sum, line) => sum + line.value, 0);
  const followerReaps = followerReapSources(followerSelection(state), requestedConditions, { reapingRecoverySpeedPercent: followerReapingRecovery });
  builtInReaps.push(...followerReaps);
  settleFollowerReaps(lineEffects.follower, followerReaps, followerReapingRecovery, lineEffects.combat?.timedEffects || []);
  const followerDamage = followerDamageSources(followerSelection(state), { resistanceFor: targetResistanceFor });
  if (lineEffects.follower) lineEffects.follower.damageSources = followerDamage;
  // The Cycle I Resist (Selena Dance of the Deep; src/selena-dance.js resolveCycleResist): a Reap on every Main Terra recast while
  // the previous Main Terra lasts. The recast interval is the Main Terra's own cadence: a DoT Terra's (Activation Medium: Terra's
  // trigger when granted), or a skill-hit Terra's use rate (recast on expiry, so nothing is left to Reap). The Terras last 6 s
  // (TLIDB, Frost Terra / Thornfield; a skill-hit Terra's useModel duration).
  const mainTerraDot = skillDots.find((dot) => dot.modeled && dot.setupKey === resolvedMain?.setupKey && (dot.profile?.tags || []).includes("Terra"));
  const mainTerraHit = modeledSkillHits.find((hit) => hit.setupKey === resolvedMain?.setupKey && (hit.profile?.tags || []).includes("Terra"));
  const mainTerraRate = mainTerraDot?.applicationsPerSecond || mainTerraHit?.rate?.usesPerSecond || 0;
  const cycleResist = resolveCycleResist({ modifierTexts, mainIsTerra: Boolean(mainTerraDot || mainTerraHit), castIntervalSeconds: mainTerraRate > 0 ? 1 / mainTerraRate : 0, baseTerraSeconds: mainTerraHit?.profile?.useModel?.durationSeconds || 6, mainTags: resolvedMain?.tags || [], mainSupportClauses: resolvedMain?.supportEffects?.clauses || [] });
  if (cycleResist?.reap) builtInReaps.push(cycleResist.reap);
  // Youga – Spacetime Elapse (hero trait audit B4; src/hero-trait-modules.js resolveSpacetimeState): To Myself in Another
  // Spacetime's Reap of every DoT, once per its interval while the dummy is in Twisted Spacetime (always, with DoT on it).
  const spacetime = lineEffects.hero?.spacetime || null;
  if (spacetime?.toMyselfReap) builtInReaps.push(spacetime.toMyselfReap);
  // Support Reaps (chunk 4): Double Thrusts: Cutthroat "Reaps X s of Damage Over Time when the supported skill hits. Only Reaps
  // <Ailment> Damage dealt by the supported skill": one Reap per hit of that skill, of its share of the ailment (provisional).
  for (const hit of modeledSkillHits) {
    const setup = setups.find((item) => item.setupKey === hit.setupKey);
    for (const line of (setup?.supportEffects?.reaping || []).filter((item) => item.kind === "onHit" && item.value > 0)) {
      const hitsPerSecond = hit.rate.hitsPerSecond || 0;
      if (!(hitsPerSecond > 0)) continue;
      const share = ailments[line.ailment]?.appliers?.find((applier) => applier.setupKey === hit.setupKey)?.share ?? 0;
      builtInReaps.push({ source: `${hit.name}: ${line.support}`, trigger: "skill use", baseDurationSeconds: line.value, baseRecoverySeconds: 1 / hitsPerSecond, usesPerSecond: hitsPerSecond, dotKeys: [line.ailment], dotShares: { [line.ailment]: share }, supportReap: true, note: `${line.text}: one Reap per hit (${Math.round(hitsPerSecond * 100) / 100}/s) of this skill's ${Math.round(share * 1000) / 10}% share of ${line.ailment} (provisional)` });
    }
  }
  // Wilting Beam: Rapid Completion "For every +1 Beam the supported skill has, +X% additional Reaping Recovery Speed for Reaping
  // triggered when this skill reaches max channeled stacks": Beams added by its supports and "+N Beams" lines (provisional sum).
  for (const reap of builtInReaps.filter((item) => item.trigger === "max channeled stacks")) {
    const dot = skillDots.find((item) => item.builtInReaping && item.builtInReaping.source === reap.source);
    const setup = dot ? setups.find((item) => item.setupKey === dot.setupKey) : null;
    const perBeam = (setup?.supportEffects?.reaping || []).filter((item) => item.kind === "recoveryPerBeam").reduce((total, item) => total + item.value, 0);
    if (!perBeam) continue;
    const beams = (setup.supportEffects.quantity || []).filter((item) => item.kind === "beams").reduce((total, item) => total + item.value, 0) + modifierTexts.reduce((total, line) => { const match = String(line.text).match(/^\+(\d+) Beams?$/i); return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0);
    reap.additionalRecoveryFactor = 1 + perBeam * beams / 100;
    reap.note = `${reap.note || ""} Rapid Completion: +${perBeam}% additional Reaping Recovery Speed × ${beams} added Beams (provisional).`.trim();
  }
  // The recount's use schedule follows the resolved main skill (its hit or its own DoT), not whichever secondary
  // skill's hits happen to be modeled first (2026-10-11: Speed Phantom / Corrosion Focus hits beside a Wilting Beam main).
  const mainHit = modeledSkillHits.find((hit) => hit.setupKey === resolvedMain?.setupKey) || null;
  const mainDot = skillDots.find((dot) => dot.modeled && dot.setupKey === resolvedMain?.setupKey) || null;
  const scheduleHit = mainHit || (mainDot ? null : modeledSkillHits[0] || null);
  // Vendetta / Endless Vendetta (src/vendetta-model.js): triggers of the Main Skill's modeled hit, reported as the net gain over
  // plain attacking (the Main Skill's own rate is already counted above).
  const triggerSkills = calculateVendettaTriggers({ sources: damageSources.filter((source) => source.status === "modeled" && source.profile.engine === "trigger-main"), setups, resolvedMain, skillHits: modeledSkillHits, weaponAttack, modifierTexts, erika: lineConditionState.erikaVendetta, hasHasten: Boolean(lineEffects.combat?.buffs?.hasHasten),
    // Bard Song (hero trait audit B13): the trigger skill's own cast becomes a Bard Song bubble in the Bard state.
    bardSong: singWithTheTide.bardSong?.heroEffects || null });
  const modeledTriggers = triggerSkills.filter((trigger) => trigger.modeled);
  // A Minion main skill (e.g. a Module's Overstrike): the player casts nothing on the dummy, so the schedule runs at the
  // Minion's basic-skill rate and starts at its first hit; the Minion's own hits arrive as scheduled events.
  const minionBasicRate = mainMinion ? mainMinion.skills.find((item) => item.role === "basic")?.steadyUsesPerSecond || 1 : 0;
  const mainUsesPerSecond = activeNames.has("Scorching Beam") ? beamCastRate.castsPerSecond : scheduleHit?.rate.usesPerSecond || mainDot?.applicationsPerSecond || skillDots.find((dot) => dot.modeled)?.applicationsPerSecond || minionBasicRate || 0;
  const otherAilments = Object.values(ailments).filter((ailment) => ailment.modeled);
  // Ill Omen (src/ill-omen.js; user 2026-10-13 "add Ill Omen to the main DPS stat"): with Ominous on the enemy, a best-case
  // combat condition adds True Damage = (DoT + Reaping) × the Elite-loop factor to every window and the recount. The
  // training dummy itself never triggers it; the condition is listed in the recount assumptions and can be switched off.
  const illOmen = resolveIllOmen({ modifierTexts, activeNames, dance: danceOfTheDeep, conditions, enabled: requestedConditions.illOmen !== false });
  conditions.illOmen = Boolean(illOmen?.main.applied);
  // Timed effects on the other sources (timedParts above): a DoT by its damage type, a skill hit by its per-type components, a
  // Minion's hit by its skill's type. Ice Cage: 1 stack per second from t = 0 (tooltip at Ice Puppet Lv2, user 2026-10-13).
  const dotShare = (key) => ({ hit: false, types: ailments[key]?.damageType ? { [ailments[key].damageType]: 1 } : key === "ignite" ? { Fire: 1 } : {} });
  const minionEventShare = (minion) => { const types = new Map((minion.skills || []).map((item) => [item.name, item.type])); return (event) => ({ hit: true, types: types.get(event.skill) ? { [types.get(event.skill)]: 1 } : {} }); };
  const minionWindowDps = (minion, seconds) => {
    if (!timedParts.length) return seconds === 5 ? minion.combat.fiveSecondAverageDps : minion.combat.twentySecondAverageDps;
    const share = minionEventShare(minion);
    // Exact over the Minion's own events (the timed factor at each landing time).
    return (minion.events || []).filter((event) => event.time < seconds).reduce((total, event) => total + event.damage * sourceFactorAt(timedParts, share(event), event.time), 0) / seconds;
  };
  // Rosa – Unsullied Blade (hero trait audit B11; src/rosa-traits.js, provisional): Mercury Baptism re-deals its record share of the
  // non-Channeled Attack Elemental hit damage as True Damage while the Realm exists; each window reads its own hit figures.
  const rosaBaptism = (seconds) => lineConditionState.rosa?.mercury?.baptism ? mercuryBaptismSource(lineConditionState.rosa, modeledSkillHits.map((hit) => ({ dps: seconds === 5 ? hit.combat.fiveSecondAverageDps : seconds === 20 ? hit.combat.twentySecondAverageDps : hit.combat.dps,
    components: hit.components, setupTags: setups.find((setup) => setup.setupKey === hit.setupKey)?.tags || hit.profile?.tags || [], kind: hit.profile?.useModel?.kind }))) : null;
  const damagePaths = (() => {
    if (!otherAilments.length && !modeledSkillHits.length && !modeledMinions.length && !modeledTriggers.length) return null;
    const igniteDps = (seconds) => seconds === 5 ? recountFiveSeconds?.igniteDps || 0 : seconds === 20 ? recountOpening?.igniteDps || 0 : theoretical.combat.expectedActiveIgnite?.expectedDps || 0;
    const ailmentDps = (ailment, seconds) => seconds === 5 ? ailment.combat.fiveSecondAverageDps : seconds === 20 ? ailment.combat.twentySecondAverageDps : ailment.combat.steadyDps;
    const typedReapPercent = (ailment) => ailment.sources.typed.reapingDuration.reduce((sum, line) => sum + line.value, 0);
    // Pooled over every inflicting skill (ailment-model.js combat.successesPerSecond).
    const igniteSuccessesPerSecond = canIgnite ? theoretical.totals.applicationChancePercent / 100 * igniteAttemptsPerSecond : 0;
    const successfulApplicationsPerSecond = Math.max(...otherAilments.map((ailment) => ailment.combat.successesPerSecond), igniteSuccessesPerSecond);
    // "Inflicting Ignite" Reaps count Ignite successes only (a Trauma or Wilt success is not an Ignite); a generic Ignite
    // (another skill's, ailment-model.js) is one of otherAilments.
    const successesByAilment = { ignite: Math.max(igniteSuccessesPerSecond, ailments.ignite?.modeled && !canIgnite ? ailments.ignite.combat.successesPerSecond : 0), trauma: ailments.trauma?.modeled ? ailments.trauma.combat?.successesPerSecond || 0 : 0, wilt: ailments.wilt?.modeled ? ailments.wilt.combat?.successesPerSecond || 0 : 0 };
    // Parity with the Ignite path (research/damage-path-switch-2026-10-12.md §6 stage 1):
    // (A) the per-Blessing-stack Reaping Recovery Speed (Feline Steps) the Ignite ledger counts;
    // (B) a full-Affliction Reap settles Ignite with the max-Affliction resistance reduction in full (every other DoT of a resisted
    //     type too, user decision 2026-10-21: its window figure ÷ the window's resistance scale × the full-reduction scale);
    // (C) Reaps settle the Ignite path's steady active Ignite (its basis in every window; the window-average basis is a
    //     separate, undecided change, §6 stage 3).
    const extraRecoverySources = blessingRecoverySources(equipment, blessings).map((line) => ({ source: line.source, text: line.text, value: line.value }));
    const igniteReaping = theoretical.combat.reaping;
    // A Reap is True Damage: every DoT it settles drops the build's "damage applied to Life" lines (patch notes 2026-10-15;
    // src/true-damage.js). Each DoT ledger takes those lines from the Ignite ledger, so one scale serves them all.
    const reapTrueDamage = trueDamageSettleScale(theoretical.ledger || []);
    const steadyReapedIgnite =igniteReaping?.activeDotDps ? (igniteReaping.activeDotDps.min + igniteReaping.activeDotDps.max) / 2 : (theoretical.combat.expectedActiveIgnite?.expectedDps || 0);
    // (5) An application-triggered source the Ignite path times over the window (estimateApplicationReapingOpening) keeps
    // that timing on its Ignite share: factor = timed ÷ steady of the same Ignite-path source (matched by trigger and base
    // duration / recovery: the two parsers name a pact source differently, e.g. "Fire Swordsman" vs "Fire Swordsman: …").
    const applicationTiming = (seconds) => {
      const opening = seconds === 5 ? recountFiveSeconds : seconds === 20 ? recountOpening : null;
      const factors = new Map();
      for (const item of opening?.reapingBySource || []) if (item.timed && item.steadyDps > 0) factors.set(`${item.trigger}|${item.baseDurationSeconds}|${item.baseRecoverySeconds}`, item.dps / item.steadyDps);
      return factors.size ? (source, dot) => dot.key === "ignite" ? factors.get(`${source.trigger}|${source.baseDurationSeconds}|${source.baseRecoverySeconds}`) ?? 1 : 1 : null;
    };
    // Own buffs pre-built (user, 2026-10-09): channel stacks are already full when
    // the window starts; the dummy still starts clean, so DoTs build from zero.
    const prebuiltSelfBuffs = requestedConditions.prebuiltSelfBuffs !== false;
    const window = (seconds) => {
      // The channel ramp scales the beam and every DoT; a timed DoT layer (Windwalk) scales DoTs and their Reaps only,
      // never beam or skill hits. The recount window figures (beam, Ignite) already carry the channel ramp.
      const channelRamp = coldStartRamp(seconds);
      const dotRamp = channelRamp * timedDotWindowFactor(seconds);
      // Timed effects: the window's time average of each source's factor (1 when sustained or without one).
      const timedDot = (key) => timedWindowFactor(timedParts, dotShare(key), seconds);
      const igniteReapDps = steadyReapedIgnite * dotRamp * timedWindowFactor(timedParts, igniteShare, seconds);
      const dots = [...otherAilments.map((ailment) => ({ key: ailment.key, name: ailment.name, dps: ailmentDps(ailment, seconds) * dotRamp * timedDot(ailment.key), fullAfflictionDps: ailmentDps(ailment, seconds) * dotRamp * timedDot(ailment.key) * ailment.fullAfflictionScale * (ailment.fullAfflictionResistanceScale ?? 1) / (ailment.maxAfflictionWindowScale?.[seconds] || 1), typedDurationPercent: typedReapPercent(ailment) })),
        ...(canIgnite ? [{ key: "ignite", name: "Ignite", dps: igniteDps(seconds) * timedDotWindowFactor(seconds), reapDps: igniteReapDps, fullAfflictionDps: igniteReapDps * (theoretical.combat.fullAfflictionScale || 1) * (theoretical.combat.fullAfflictionResistanceScale || 1), typedDurationPercent: 0 }] : [])]
        .map((dot) => ({ ...dot, skillDot: Boolean(ailments[dot.key]?.skillDot), trueDamageScale: reapTrueDamage.scale }));
      // Scorching Pulse's stacks build from 0 on the clean start (src/follower-model.js scorchingPulseStacks): the 5 s / 20 s windows
      // read the window averages for your Reaping Duration line and the follower's own Reap; the sustained figure the steady count.
      const reapWindow = seconds === 5 || seconds === 20;
      const windowModifierTexts = reapWindow && modifierTexts.some((line) => line.followerReapWindow) ? modifierTexts.map((line) => line.followerReapWindow ? { ...line, text: `+${Math.round(line.followerReapWindow.percent[seconds] * 10000) / 10000}% Reaping Duration` } : line) : modifierTexts;
      const windowReaps = reapWindow ? builtInReaps.map((reap) => Number.isFinite(reap.ownDurationWindows?.[seconds]) ? { ...reap, ownDurationPercent: reap.ownDurationWindows[seconds] } : reap) : builtInReaps;
      const reaping = calculateMultiSourceReaping({ modifierTexts: windowModifierTexts, dots, extraSources: windowReaps, extraRecoverySources, successfulApplicationsPerSecond, successesByAilment, afflictionPerSecond: afflictionPerSecondTotal, damagingAilmentTypes: dots.filter((dot) => dot.dps > 0 && !dot.skillDot).length, sourceDotScale: canIgnite ? applicationTiming(seconds) : null });
      const beamDps = seconds === 5 ? recountFiveSeconds?.beamDps || 0 : seconds === 20 ? recountOpening?.beamDps || 0 : (nativeHitCycle?.expectedDps || 0) * channelRamp;
      // Generic spell hits (src/skill-hit-model.js): no channel ramp; a cooldown-bound skill's window counts whole uses.
      const hits = [
        ...modeledSkillHits.map((hit) => ({ key: hit.key, name: `${hit.name} hits`, skillHit: true, dps: (seconds === 5 ? hit.combat.fiveSecondAverageDps : seconds === 20 ? hit.combat.twentySecondAverageDps : hit.combat.dps) * timedWindowFactor(timedParts, hitTypeShares(hit), seconds) })),
        // Minions (src/minion-damage-model.js): their cycle's hits from the summon cast on; windows follow the scheduled events.
        ...modeledMinions.map((minion) => ({ key: minion.key, name: `${minion.name} (Minion)`, minion: true, dps: seconds === 5 || seconds === 20 ? minionWindowDps(minion, seconds) : minion.combat.dps })),
        // Main Skill triggers (src/vendetta-model.js): the net gain of the triggered uses over the attacks their casts replace.
        ...modeledTriggers.map((trigger) => ({ key: trigger.key, name: `${trigger.name} (triggers ${trigger.main.name}; net)`, trigger: true, dps: seconds === 5 ? trigger.combat.fiveSecondAverageDps : seconds === 20 ? trigger.combat.twentySecondAverageDps : trigger.combat.dps })),
        // The follower's own damage (src/follower-model.js followerDamageSources): from its first cast on.
        ...followerDamage.map((source) => ({ key: source.key, name: source.name, follower: true, dps: followerWindowDps(source, seconds) })),
        // Mercury Baptism (Rosa – Unsullied Blade, hero trait audit B11): True Damage from the recorded hits.
        ...(() => { const baptism = rosaBaptism(seconds); return baptism ? [{ key: baptism.key, name: baptism.name, trueDamage: true, dps: baptism.dps }] : []; })()
      ];
      // Ill Omen True Damage from the damage that builds stacks (DoT and Reaping; hits do not).
      const stackBuildingDps = dots.reduce((sum, dot) => sum + dot.dps, 0) + reaping.reapingDps;
      const illOmenWindowDps = illOmenDps(illOmen, stackBuildingDps);
      // Spacetime Turbulence (Youga – Spacetime Elapse, hero trait audit B4, Q-H6; src/youga-spacetime.js): each move re-deals the
      // recorded share of the DoT and Reaping damage; a window releases the moves inside it (the recount times them exactly).
      const turbulenceFactor = spacetime?.turbulence ? spacetime.spacetime.windowFactor(seconds) : 0;
      const turbulence = turbulenceFactor > 0 ? { dps: stackBuildingDps * turbulenceFactor, basisDps: stackBuildingDps, factor: turbulenceFactor, intervalSeconds: spacetime.intervalSeconds, sustainedShare: spacetime.sustainedShare } : null;
      const totalDps = beamDps + hits.reduce((sum, hit) => sum + hit.dps, 0) + dots.reduce((sum, dot) => sum + dot.dps, 0) + reaping.reapingDps + illOmenWindowDps + (turbulence?.dps || 0);
      return { seconds, beamDps, hits, dots, reaping, illOmen: illOmen ? { dps: illOmenWindowDps, basisDps: stackBuildingDps, factor: illOmen.main.factor } : null, turbulence, totalDps, totalDamage: seconds ? totalDps * seconds : null };
    };
    return { sustained: window(0), fiveSeconds: window(5), twentySeconds: window(20), channel: mechanics.channel, prebuiltSelfBuffs };
  })();
  // Ignite-only builds (no damagePaths): the same Ill Omen definition, factor × (DoT + Reaping), on the Ignite path's 5 s / 20 s
  // windows, with Ignite as the DoT and the Ignite Reaps as the Reaping (src/ill-omen.js). The recount already adds it.
  const igniteIllOmen = !damagePaths && illOmen?.main.factor > 0 ? (() => {
    const window = (opening) => {
      if (!opening) return null;
      const basisDps = (opening.igniteDps || 0) + (opening.reapingDps || 0);
      return { seconds: opening.seconds, basisDps, igniteDps: opening.igniteDps || 0, reapingDps: opening.reapingDps || 0, dps: illOmenDps(illOmen, basisDps) };
    };
    return { factor: illOmen.main.factor, fiveSeconds: window(recountFiveSeconds), twentySeconds: window(recountOpening) };
  })() : null;
  // Dummy recount timeline, shadow mode (research/dummy-recount-spec-2026-10-09.md, phase 1): computed
  // beside today's figures from the same resolved conditions and read by none of them yet. The
  // exclusive-condition comparison passes skip it. The channel is passed on every path; the recount
  // ramps it only when own buffs are not pre-built (as the 5 s / 20 s windows do).
  const dummyRecount = skipVariation ? null : guarded("Dummy recount timeline", () => {
    const inputs = collectDummyRecountInputs({
      delivery: beamDelivery, nativeCycle: nativeHitCycle,
      // Other skills' Ignite successes fold into the beam's per-use chance (success-equivalent, ailment-applications.js).
      ignite: canIgnite ? pooledIgnite(theoretical.combat.expectedActiveIgnite) : null, igniteReaping: theoretical.combat.reaping,
      igniteFullAfflictionScale: theoretical.combat.fullAfflictionScale, igniteAfflictionRating: conditions.affliction ? damageCombat.afflictionAverage : 0, igniteAfflictionPerPoint: theoretical.combat.afflictionPerPoint,
      // Hit ailments need a hitting main skill (applications > 0); skill DoTs carry their own rate.
      ailments: damagePaths ? otherAilments.filter((ailment) => ailment.applicationsPerSecond > 0) : [], multiReaping: damagePaths ? damagePaths.twentySeconds.reaping : null, channel: mechanics.channel,
      castsPerSecond: mainUsesPerSecond, afflictionPerSecond: afflictionPerSecondTotal,
      // Generic spell hits: constant expected damage per use at the skill's own rate (src/skill-hit-model.js).
      skillHits: [
        ...modeledSkillHits.map((hit) => ({ key: hit.key, label: `${hit.name} hits`, perUse: hit.combat.perUse, rate: hit.rate.usesPerSecond, firstUseSeconds: hit.rate.firstUseSeconds, provisional: hit.rate.hitsPerUseBasis === "provisional" ? hit.rate.hitsPerUseNote : null })),
        // Main Skill triggers: one net lump per cycle at the end of its sequence (provisional shape; src/vendetta-model.js).
        ...modeledTriggers.map((trigger) => ({ key: trigger.key, label: `${trigger.name} (triggers ${trigger.main.name}; net)`, perUse: trigger.combat.netPerCycle, rate: 1 / trigger.combat.cycleSeconds, firstUseSeconds: trigger.rate.lastTriggerSeconds, provisional: `net gain of ${trigger.rate.repeats} triggered ${trigger.main.name} use${trigger.rate.repeats > 1 ? "s" : ""} over the attacks the cast replaces, placed at the end of each ${Math.round(trigger.combat.cycleSeconds * 100) / 100} s cycle` })),
        // The follower's own damage (src/follower-model.js): a steady source from its first cast on.
        ...followerDamage.map((source) => ({ key: source.key, label: source.name, perUse: source.perUse, rate: source.usesPerSecond, firstUseSeconds: source.firstUseSeconds, provisional: source.text })),
        // Mercury Baptism (Rosa – Unsullied Blade, hero trait audit B11): its average rate (Realm share ÷ 0.5 s) and record per Baptism.
        ...(() => { const baptism = rosaBaptism(0); return baptism ? [{ key: baptism.key, label: baptism.name, perUse: baptism.perUse, rate: baptism.usesPerSecond, firstUseSeconds: baptism.usesPerSecond > 0 ? 1 / baptism.usesPerSecond : null, provisional: baptism.text }] : []; })()
      ],
      // Minions (src/minion-damage-model.js): explicit hit events of the Minion cycle (specials on cooldown, basic filler).
      scheduledHits: modeledMinions.map((minion) => { const share = minionEventShare(minion); return { key: minion.key, label: `${minion.name} (Minion)`, events: timedParts.length ? minion.events.map((event) => ({ ...event, timedShare: share(event) })) : minion.events, steadyDps: minion.combat.dps }; }),
      // Timed effects (src/timed-effects.js): each part's clock, and the share of each DoT (and the Reaps settling it), skill
      // hit, the beam and its Ignite.
      timedEffects: recountTimedEffects(timedParts, Object.fromEntries([...otherAilments.map((ailment) => [ailment.key, dotShare(ailment.key)]), ...modeledSkillHits.map((hit) => [hit.key, hitTypeShares(hit)]), ["beam", beamShare], ["ignite", igniteShare]])),
      // A hit skill drives the use schedule: its opening cast completes after its use time (Flame Jet run 2026-10-11).
      // A triggered Main Skill DoT ready at engagement (dotFirstApplication above: Activation Medium: Terra with pre-built Terra
      // Charge, Wind Rhythm) starts its schedule at that first application (user decision 2026-10-22).
      firstUseSeconds: !activeNames.has("Scorching Beam") && scheduleHit && mainUsesPerSecond === scheduleHit.rate.usesPerSecond ? scheduleHit.rate.firstUseSeconds : !activeNames.has("Scorching Beam") && !scheduleHit && mainDot && mainUsesPerSecond === mainDot.applicationsPerSecond && Number.isFinite(mainDot.firstApplicationSeconds) ? mainDot.firstApplicationSeconds : !activeNames.has("Scorching Beam") && !scheduleHit && mainMinion && mainUsesPerSecond === minionBasicRate ? mainMinion.cycle.firstHitSeconds : null,
      critChancePercent: beamCritical.criticalChancePercent, prebuiltSelfBuffs: requestedConditions.prebuiltSelfBuffs !== false, timedDotLayers,
      // Automatic mode: the clean dummy's Affliction builds from 0 (and drops on removing Reaps) over the timeline.
      options: { afflictionModel: afflictionRating ? "simulated" : "configured" }
    });
    if (!inputs) return null;
    if (illOmen?.main.factor > 0) inputs.illOmen = { factor: illOmen.main.factor, label: "Ill Omen" };
    if (spacetime?.turbulence && damagePaths) {
      inputs.turbulence = { label: "Spacetime Turbulence", intervalSeconds: spacetime.intervalSeconds, recordPercent: spacetime.recordPercent, bonusPercent: spacetime.bonusPercent, speedUpPercent: spacetime.speedUp?.perSecondPercent || 0, speedUpMaxStacks: spacetime.speedUp?.maxStacks || 0 };
      inputs.assumptions.push({ id: "spacetimeTurbulence", value: Math.round(spacetime.sustainedShare * 10000) / 10000, text: `Spacetime Turbulence (Youga – Spacetime Elapse; Q-H6, provisional): Twisted Spacetime is recast every ${spacetime.intervalSeconds} s while DoT ticks and never ends; each move re-deals ${Math.round(spacetime.sustainedShare * 10000) / 100}% (steady) of the DoT and Reaping damage dealt since the last move to the dummy, the only enemy within, at once.` });
    }
    if (afflictionRating && conditions.affliction) inputs.assumptions.push({ id: "afflictionRating", value: Math.round(afflictionRating.rating * 1000) / 1000, text: `Dummy Affliction (automatic): ${afflictionRating.text} Windows build it from 0 on a clean dummy.` });
    for (const item of pact.levelAssumptions || []) inputs.assumptions.push({ id: `pactLevel:${item.spirit}`, value: item.level, text: item.text });
    // Provisional line readings of talent batch chunk 1 (Q13): per-level lines and "additional damage for Weapons".
    inputs.assumptions.push(...provisionalLineReadings);
    for (const choice of grantedAuraChoices) inputs.assumptions.push({ id: `grantedAura:${choice.name}`, value: choice.kept, text: choice.text });
    if (modeledSkillHits.some((hit) => hit.rate?.speedType === "attack-speed")) for (const line of weaponAttack.additional.filter((item) => item.provisional)) inputs.assumptions.push({ id: `weaponsDamage:${line.source}`, value: line.value, text: `${line.source}: "${line.text}" applied to every Weapon Attack Damage hit (provisional, talent batch Q13).` });
    for (const minion of modeledMinions) inputs.assumptions.push(...minion.assumptions);
    if (inputs.hits && nativeHitCycle?.beams > 1) inputs.assumptions.push({ id: "beams", value: nativeHitCycle.beams, text: `${nativeHitCycle.beams} Beams hit the dummy, beam ticks and explosions alike: the first at 100%, each further one at the 70% Shotgun falloff (×${Math.round(nativeHitCycle.shotgunFactor * 1000) / 1000}; skill text "beams and explosions can hit the same enemy", Shotgun Effect "subsequent on hit damage is 70%"; linear reading, provisional).` });
    if (fullLife.active && fullLife.lines.length) inputs.assumptions.push({ id: "fullLife", value: true, text: `Full Life assumed on the dummy (it does not attack; Energy Shield absorbs stray damage): ${fullLife.lines.map((line) => `${line.source}: ${line.text}`).join("; ")}` });
    else if (fullLife.sealedOut && fullLife.lines.length) inputs.assumptions.push({ id: "fullLife", value: false, text: `Not at Full Life: Sealed Life leaves ${Math.round(fullLife.lifeRemainingPercent * 100) / 100}% of Max Life unsealed, under the 95% Full Life needs (user-confirmed 2026-10-12), so these lines are off: ${fullLife.lines.map((line) => `${line.source}: ${line.text}`).join("; ")}` });
    return calculateDummyRecount(inputs);
  });
  const warnings = [...aura.entries.flatMap(entry => entry.unsupportedSupportEffects.map(line => `${entry.name} / ${line.source}: ${line.text} — not modeled.`)), ...talent.warnings, ...slate.warnings, ...heroMemories.unsupported.filter(line => /^Revived mechanic:/.test(line.text)).map(line => `${line.source}: ${line.text} — not modeled.`)];
  if (main.effectiveLevel < 1 || Object.keys(state.skills.skillLevels).map((key) => state.skills.customSetups.find((setup) => setup.instanceId === key)?.name || key).some((name) => name !== "Scorching Beam" && !auraScalingSs13[name]) || Object.keys(state.skills.supportLevels).some((key) => !modeledSupportNames.some((name) => key === `Scorching Beam:${name}`))) warnings.push("Some level changes are saved but lack full damage progression data. Scorching Beam levels 1–40, the documented supports, and all Aura-tag skill levels are modeled.");
  if (!["selena-sing-with-the-tide", "iris-growing-breeze"].includes(state.hero.selectedHeroId)) warnings.push("Scorching Beam hit packets can be calculated for this hero, but hero-specific damage traits are not modeled yet.");
  if (Object.values(state.skills.customSupports).some((entries) => entries.length)) warnings.push("Custom support effects are audit text; only their Energy allocation is modeled.");
  // Bing – Blast Nova's Firepower Coverage (Q-H15, provisional): the penalty applies to a Main Skill the bombs cannot replace.
  // Rehan – Tunnel Vision (Q-H15, provisional): the penalty applies to every skill but Burst; a build whose Burst deals nothing reads
  // only the penalty.
  const rehanWarning = lineConditionState.rehan;
  if (rehanWarning?.tunnel?.on && !rehanWarning.burstHit?.modeled) warnings.push(`Tunnel Vision (Rehan – Anger): "-${rehanWarning.tunnel.percent}% additional damage for non-Burst skills" is applied (Q-H15, provisional), and Burst, the damage source it favours, deals no damage here (${rehanWarning.burstHit?.inactiveReason || "no Attack Skill hits the dummy while Berserk, or no weapon damage"}), so this build's dummy figures leave out its main damage source. Switch it off under the best-case assumptions to compare.`);
  if (firepowerCoverage?.applied) warnings.push(`Firepower Coverage (Bing – Blast Nova): "Cannot use Main Skills" is applied (Q-H15, provisional), so ${firepowerCoverage.mainName || "the Main Skill"} deals no damage of its own, and the bombs that replace it need a Non-channeling, Non-Sentry Main Attack Projectile Skill (hero trait audit B12), so this build's dummy figures leave out its main damage source. Switch it off under the best-case assumptions to compare.`);
  if (state.skills.customSetups.some((setup) => (setup.role !== "aura" || !auraScalingSs13[setup.name]) && !damageSources.some((source) => source.name === setup.name && source.status === "modeled"))) warnings.push("Some catalog skill setups are saved and allocated Energy, but their damage formulas are not modeled yet.");
  for (const source of damageSources.filter((item) => item.status === "not modeled")) warnings.push(`${source.name}: its own damage is not modeled (${source.reason}).`);
  for (const dot of skillDots) for (const note of dot.notes || []) warnings.push(note);
  for (const hit of skillHits) warnings.push(...(hit.warnings || []), ...(hit.notes || []));
  for (const trigger of triggerSkills) warnings.push(...(trigger.warnings || []), ...(trigger.notes || []));
  for (const minion of minions) warnings.push(...(minion.warnings || []), ...(minion.notes || []));
  // Alias setups of a Minion (its summon skill, a Spirit Magus's Empower skill) say which Minion they activate.
  for (const source of damageSources) if (source.status === "modeled" && source.profile?.alias && source.profile.note) warnings.push(source.profile.note);
  if (state.disabledEquipmentSlots.length || Object.keys(state.equipmentOverrides).length) warnings.push("Equipment estimate includes recognized modifiers and Energy changes; unique mechanics and level changes are not fully modeled.");
  warnings.push("Support estimates use TLIDB's multiplicative additional-damage rule and SS13 tooltip effects. Isolated town-sheet states for Guard, Refracted Prism, and some Ignite effects remain unresolved; see the support validation report.");
  warnings.push(...theoretical.warnings);
  warnings.push(...shadowWarnings);
  warnings.push(...(pact.levelAssumptions || []).map((item) => item.text));
  if (pactLimits.excludedNodes.length || pactLimits.excludedKismets.length) warnings.push(`Pact page over the game's limits (Pact Points ${pactLimits.points.allocated}/${pactLimits.points.budget} at ${pactLimits.points.levelText}; Micro Fates ${pactLimits.micro.installed}/${pactLimits.micro.limit}; Medium Destinies ${pactLimits.medium.installed}/${pactLimits.medium.limit}): ${pactLimits.excludedNodes.length} node${pactLimits.excludedNodes.length === 1 ? "" : "s"} and ${pactLimits.excludedKismets.length} kismet${pactLimits.excludedKismets.length === 1 ? "" : "s"} not counted (outermost first).`);
  for (const item of beamAddedDamage.unmodeled) warnings.push(`${item.source}: ${item.text} — added Fire Damage is not included in the Scorching Beam estimate.`);
  const { channelRamp: _channelRamp, ...mechanicsSummary } = mechanics;
  // "You can only deal Cold Damage" (Extreme Coldness; src/damage-type-restriction.js): what the restriction removed, for the badge
  // and the working. Each engine applies its own −100% line; this only lists them.
  const typeRestriction = mechanics.typeRestriction || null;
  const damageTypeRestriction = typeRestriction ? {
    type: typeRestriction.type, label: typeRestriction.label, sources: typeRestriction.sources,
    removed: [
      ...(activeNames.has("Scorching Beam") && removesType(typeRestriction, "Fire") ? [{ kind: "beam", name: "Scorching Beam hits", type: "Fire" }] : []),
      ...(theoretical?.totals?.baseIgniteDamage?.max > 0 && (igniteAppliers || []).some((applier) => applier.chancePercent > 0) && removesType(typeRestriction, "Fire") ? [{ kind: "ailment", name: "Ignite", type: "Fire" }] : []),
      ...skillHits.filter((hit) => hit.typeRestriction?.removedTypes?.length && hit.rate?.usesPerSecond > 0).flatMap((hit) => hit.typeRestriction.removedTypes.map((type) => ({ kind: "hit", name: hit.name, type, keptTypes: hit.typeRestriction.keptTypes }))),
      ...skillDots.filter((dot) => dot.typeRestriction && dot.applicationsPerSecond > 0).map((dot) => ({ kind: "dot", name: dot.name, type: dot.damageType })),
      ...Object.values(ailments || {}).filter((ailment) => ailment?.typeRestriction && ailment.key !== "ignite" && ailment.base?.max > 0).map((ailment) => ({ kind: "ailment", name: ailment.name, type: ailment.damageType }))
    ]
  } : null;
  const supportEffects = Object.fromEntries(setups.map((setup) => [setup.setupKey, setup.supportEffects]));
  // Core audit batch B4 (src/combat-states.js): the enemy-debuff cores' readings for the working and the recount assumptions.
  const enemyDebuffCores = enemyDebuffCoreSummary(lineEffects.combat?.enemyDebuffCores || {}, modifierTexts);
  if (probeDebuffHitRates) {
    const rates = new Map(lineConditionState.chanceParalysis.map((item) => {
      const hit = skillHits.find((entry) => entry.setupKey === item.setupKey && entry.modeled);
      // The fissure (Groundshaker) lands once per use that consumes a Demolisher Charge: uses/s × that share.
      return [item.setupKey, { hitsPerSecond: hit ? hit.rate.hitsPerSecond || 0 : 0, fissureHitsPerSecond: hit ? (hit.rate.usesPerSecond || 0) * (hit.rate.demolisherShare || 0) : 0, firstHitSeconds: hit ? hit.rate.firstUseSeconds ?? null : null }];
    }));
    // Tremble's crit buff (crit hits per second, Lightning hits) and Activation Medium: Multistrike (the build's Max Multistrike
    // Count events per second over every modeled multistriking hit).
    const bySetup = new Map(skillHits.filter((hit) => hit.modeled).map((hit) => [hit.setupKey, {
      critHitsPerSecond: (hit.rate.hitsPerSecond || 0) * Math.max(0, Math.min(100, hit.crit?.chancePercent || 0)) / 100,
      dealsLightning: (hit.components || []).some((component) => component.type === "Lightning")
    }]));
    const facts = { bySetup, multistrikeEventsPerSecond: skillHits.filter((hit) => hit.modeled).reduce((sum, hit) => sum + (hit.rate?.multistrike?.maxCountEventsPerSecond || 0), 0) };
    // Juggernaut (B4): the player's crit hits per second (the beam's and every modeled skill hit's; Minion crits are not counted).
    // Open Wounds (B4): the Trauma model's steady stacks, stack rate, duration and limit.
    {
      const beamHits = activeNames.has("Scorching Beam") ? beamCastRate.castsPerSecond || 0 : 0;
      facts.critHitsPerSecond = beamHits * Math.max(0, Math.min(100, beamCritical?.criticalChancePercent || 0)) / 100 + [...bySetup.values()].reduce((sum, item) => sum + item.critHitsPerSecond, 0);
      const trauma = ailments?.trauma;
      if (trauma?.modeled) facts.trauma = { steadyActiveStacks: trauma.combat?.steadyActiveStacks ?? 0, stackRate: (trauma.combat?.successesPerSecond || 0) * (trauma.stacksPerApplication || 1), durationSeconds: trauma.durationSeconds, stackLimit: trauma.stackLimit };
      // Chaos Abyss (legendary audit batch 3): the Wilt model's steady stacks on the dummy.
      const wilt = ailments?.wilt;
      if (wilt?.modeled) facts.wilt = { steadyActiveStacks: wilt.combat?.steadyActiveStacks ?? null, stackLimit: wilt.stackLimit ?? null };
    }
    // Gemma – Ice-Fire Fusion (B3): casts per second of the active Fire / Cold skills (modeled skill hits' uses, the beam's casts,
    // modeled skill DoTs' applications), for Frostfire Rampage's "after casting Fire or Cold Skills 5 time(s)".
    if (frostfireCasts) {
      const fireCold = (setupKey) => (setups.find((setup) => setup.setupKey === setupKey)?.tags || []).some((tag) => tag === "Fire" || tag === "Cold");
      const hitKeys = new Set();
      let casts = activeNames.has("Scorching Beam") ? beamCastRate.castsPerSecond || 0 : 0;
      for (const hit of skillHits.filter((item) => item.modeled && fireCold(item.setupKey))) { hitKeys.add(hit.setupKey); casts += hit.rate?.usesPerSecond || 0; }
      for (const dot of (skillDots || []).filter((item) => item.modeled && !hitKeys.has(item.setupKey) && fireCold(item.setupKey))) casts += dot.applicationsPerSecond || 0;
      facts.fireColdCastsPerSecond = casts;
    }
    // Ash (legendary audit batch 7: "Every N time(s) a Fire Skill is cast, gains Ash"): the active Fire skills' casts per second.
    {
      const fire = (setupKey) => (setups.find((setup) => setup.setupKey === setupKey)?.tags || []).includes("Fire");
      const hitKeys = new Set();
      let casts = activeNames.has("Scorching Beam") ? beamCastRate.castsPerSecond || 0 : 0;
      for (const hit of skillHits.filter((item) => item.modeled && fire(item.setupKey))) { hitKeys.add(hit.setupKey); casts += hit.rate?.usesPerSecond || 0; }
      for (const dot of (skillDots || []).filter((item) => item.modeled && !hitKeys.has(item.setupKey) && fire(item.setupKey))) casts += dot.applicationsPerSecond || 0;
      facts.fireCastsPerSecond = casts;
    }
    // Frantic Shadow (legendary audit batch 7: "N% chance to gain +X% Attack Speed for T s when Shadows hit enemies"): the Shadows'
    // hits per second (each Shadow Strike use's Shadow weight × uses per second).
    facts.shadowHitsPerSecond = skillHits.filter((hit) => hit.modeled && hit.shadows?.weight > 0).reduce((sum, hit) => sum + hit.shadows.weight * (hit.rate?.usesPerSecond || 0), 0);
    // Youga – Spacetime Illusion (hero trait audit B4): the Main Skill's own cast rate, every cast per second (your skills' uses
    // with the Illusion's and Spell Burst's, the beam's casts, modeled skill DoTs' applications) and the increased Cast Speed.
    // Erika (hero trait audit B5): the Main Skill's crit chance (Charging Tail, Feline Fury) and the Vendetta cycle (Incisive).
    if (erikaRates) {
      const mainHit = skillHits.find((hit) => hit.modeled && hit.setupKey === resolvedMain?.setupKey) || null;
      const crit = mainHit ? hitCritChances(mainHit) : null;
      const vendetta = triggerSkills.find((trigger) => trigger.setupKey && /^trait:/.test(trigger.setupKey)) || triggerSkills[0] || null;
      facts.erika = {
        mainCritChancePercent: crit ? crit.effective : 0,
        vendetta: vendetta ? (vendetta.modeled ? { modeled: true, cycleSeconds: vendetta.rate.cycleSeconds, sequenceSeconds: vendetta.rate.sequenceSeconds, repeatTimes: vendetta.rate.repeatTimes, critEffectivePercent: crit?.effective ?? 0, critRawPercent: crit?.raw ?? 0 } : { modeled: false, reason: vendetta.inactiveReason || null }) : null
      };
    }
    if (yougaIllusionRates && yougaIllusionFacts) {
      const hitKeys = new Set();
      let casts = activeNames.has("Scorching Beam") ? beamCastRate.castsPerSecond || 0 : 0;
      for (const hit of skillHits.filter((item) => item.modeled)) { hitKeys.add(hit.setupKey); casts += hit.rate?.usesPerSecond || 0; }
      for (const dot of (skillDots || []).filter((item) => item.modeled && !hitKeys.has(item.setupKey))) casts += dot.applicationsPerSecond || 0;
      facts.youga = { ...yougaIllusionFacts, castsPerSecond: casts };
    }
    // Sage (hero trait audit B8): the Reaps per second Sword Lily Leaf reads (Husk reads facts.critHitsPerSecond).
    if (sageRates) {
      const reapSources = damagePaths?.sustained?.reaping?.sources || theoretical.combat.reaping?.sources || [];
      facts.sage = { reapsPerSecond: reapSources.reduce((sum, source) => sum + (source.reapsPerSecond || 0), 0) };
    }
    // Carino (hero trait audit B9): every modeled Projectile skill's uses per second (one ammo per cast, Q-H8), measured without the
    // ammo factor (this pass applies none).
    // Rehan (hero trait audit B10): the uses per second the Rage cycle reads (Melee Attack casts and channel stacks, every skill use
    // and hitting use, Ranged and Attack uses with their crits, the Main Skill's uses), Burst's crit chance and the Attack Speed bonus
    // they were measured at (the Rage share of it is corrected per phase).
    if (rehanRates) {
      const beamCasts = activeNames.has("Scorching Beam") ? beamCastRate.castsPerSecond || 0 : 0;
      const rehan = { meleeCasts: 0, channelStacks: 0, skillUses: beamCasts, rangedUses: 0, attackUses: 0, attackCritUses: 0, hitUses: beamCasts, mainUses: 0 };
      for (const hit of skillHits.filter((item) => item.modeled && item.setupKey !== BURST_SETUP_KEY)) {
        const tags = new Set(setups.find((setup) => setup.setupKey === hit.setupKey)?.tags || hit.profile?.tags || []);
        const uses = hit.rate?.usesPerSecond || 0, kind = hit.profile?.useModel?.kind;
        rehan.skillUses += uses; rehan.hitUses += uses;
        if (tags.has("Melee") && tags.has("Attack")) {
          if (kind === "channel") rehan.channelStacks += uses;
          else { rehan.meleeCasts += uses; if (kind === "channel-release") rehan.channelStacks += uses * (hit.channel?.maxStacks || 0); }
        }
        if (tags.has("Ranged")) rehan.rangedUses += uses;
        if (tags.has("Attack")) { rehan.attackUses += uses; rehan.attackCritUses += uses * Math.max(0, Math.min(100, hit.crit?.chancePercent || 0)) / 100; }
        if (hit.setupKey === resolvedMain?.setupKey) rehan.mainUses += uses;
      }
      for (const dot of (skillDots || []).filter((item) => item.modeled && !skillHits.some((hit) => hit.modeled && hit.setupKey === item.setupKey))) rehan.skillUses += dot.applicationsPerSecond || 0;
      const burstHit = skillHits.find((hit) => hit.setupKey === BURST_SETUP_KEY);
      facts.rehan = { ...rehan, burstCritChance: burstHit ? Math.max(0, Math.min(100, burstHit.crit?.chancePercent || 0)) / 100 : 0, attackIncreasedPercent: weaponAttack.attackSpeed?.increasedPercent || 0,
        rageAttackSpeedPercent: (lineConditionState.rehan?.averageBodies || []).find((item) => item.key === "attackSpeedPerRage")?.value || 0 };
    }
    // Rosa – Unsullied Blade (hero trait audit B11): the non-Channeled Attack uses per second (Mystic Mercury's Pts, the Realm's Mana)
    // and their Elemental hit damage per second by type (Mercury Baptism's record and its Infiltration), measured without the Realm.
    if (rosaRates) {
      const rosa = { attackUses: 0, elementalByType: { Fire: 0, Cold: 0, Lightning: 0 } };
      for (const hit of skillHits.filter((item) => item.modeled)) {
        const tags = new Set(setups.find((setup) => setup.setupKey === hit.setupKey)?.tags || hit.profile?.tags || []);
        const kind = hit.profile?.useModel?.kind;
        if (!tags.has("Attack") || tags.has("Channeled") || kind === "channel" || kind === "channel-release") continue;
        rosa.attackUses += hit.rate?.usesPerSecond || 0;
        const total = (hit.components || []).reduce((sum, component) => sum + (Number(component.perUse) || 0), 0);
        for (const component of hit.components || []) if (component.type in rosa.elementalByType && total > 0) rosa.elementalByType[component.type] += (hit.combat?.dps || 0) * (Number(component.perUse) || 0) / total;
      }
      facts.rosa = rosa;
    }
    // Bing (hero trait audit B12): the Main Skill's crit chance (Big Bang Pack's Spare Bombs) and Attack Speed bonus (the badge), its
    // uses per second (Flash of Brilliance) and Spell Burst activations (Inspiration Overflow), and whether it can activate Spell Burst
    // (Ingenuity Overload), measured without the Overload casts (this pass applies none).
    if (bingRates) {
      const mainHit = skillHits.find((hit) => hit.setupKey && hit.setupKey === resolvedMain?.setupKey) || null;
      facts.bing = {
        bombCritChance: mainHit ? Math.max(0, Math.min(100, mainHit.crit?.chancePercent || 0)) / 100 : null, bombBonusFactor: mainHit?.rate?.bombs?.bonusFactor ?? null,
        main: mainHit ? { name: mainHit.name, usesPerSecond: mainHit.rate?.usesPerSecond || 0, canSpellBurst: !mainHit.rate?.spellBurstBlock && Boolean(mainHit.modeled), spellBurstBlock: mainHit.modeled ? mainHit.rate?.spellBurstBlock || null : mainHit.inactiveReason || "it deals no modeled hit",
          burstActivationsPerSecond: mainHit.rate?.spellBurst?.activationsPerSecond || 0, burstStacks: mainHit.rate?.spellBurst?.maxSpellBurst || 0 } : null
      };
    }
    if (carinoRates) facts.carino = { projectileUsesPerSecond: skillHits.filter((hit) => hit.modeled && (setups.find((setup) => setup.setupKey === hit.setupKey)?.tags || []).includes("Projectile")).reduce((sum, hit) => sum + (hit.rate?.usesPerSecond || 0), 0) };
    // Consumption cores (src/consumption-procs.js): the Main Skill's cast rate and the event rates their stack gains read.
    if (consumptionCores) {
      const modeledHits = skillHits.filter((hit) => hit.modeled);
      const beamHits = activeNames.has("Scorching Beam") ? beamCastRate.castsPerSecond || 0 : 0;
      const reapSources = damagePaths?.sustained?.reaping?.sources || theoretical.combat.reaping?.sources || [];
      facts.consumption = {
        mainUsesPerSecond: mainUsesPerSecond || 0,
        hitsPerSecond: beamHits + modeledHits.reduce((sum, hit) => sum + (hit.rate.hitsPerSecond || 0), 0),
        critHitsPerSecond: beamHits * Math.max(0, Math.min(100, beamCritical?.criticalChancePercent || 0)) / 100 + [...bySetup.values()].reduce((sum, item) => sum + item.critHitsPerSecond, 0),
        reapsPerSecond: reapSources.reduce((sum, source) => sum + (source.reapsPerSecond || 0), 0),
        wiltSuccessesPerSecond: ailments.wilt?.modeled ? ailments.wilt.combat?.successesPerSecond || 0 : 0
      };
    }
    return calculatePlannerOnce(input, conditionOverrides, { skipVariation: requestedSkipVariation, debuffHitRates: rates, hitRateFacts: facts });
  }
  const { effectivePacts: _effectivePacts, ...pactLimitsSummary } = pactLimits;
  return { state, pactLimits: pactLimitsSummary, coreCopies: { active: Object.fromEntries([...coreCopies.active].map(([name, copy]) => [name, { kind: copy.kind, source: copy.source, label: copy.label }])), duplicates: coreCopies.duplicates.map(({ name, kind, source, activeFrom, affix, lines, slot, slateId }) => ({ name, kind, source, activeFrom, affix: affix ?? null, lines: lines ?? null, slot: slot ?? null, slateId: slateId ?? null })) }, damageTypeRestriction, enemyDebuffCores, weaponToSpells, critNumbedBuffs, periodicBurst, hitRateFacts, modifierTexts, lineEffects, follower: lineEffects.follower, mechanics: mechanicsSummary, supportEffects, afflictionRating, ailments, igniteAppliers, igniteAttemptsPerSecond, skillDots, skillHits, triggerSkills, minions, minionCores: { commanderGambit, spiritMagiLimit, darkGate: lineConditionState.darkGate, bond: { canObtain: minionBond.canObtain, maxStacks: minionBond.maxStacks, intervalSeconds: minionBond.intervalSeconds, prebuilt: minionBond.prebuilt, any: minionBond.any, lineCounts: Object.fromEntries(Object.entries(minionBond.sources).map(([key, list]) => [key, list.length])) }, summonCastSpeed: minionSummonCast, overlyModified, isomorphicArms: isomorphicArms ? { weapon: isomorphicArms.weapon, read: isomorphicArms.read || [], unread: isomorphicArms.unread, lines: isomorphicArms.lines.length, reason: isomorphicArms.reason } : null, comradeship: comradeship ? { belt: comradeship.belt, read: comradeship.read, unread: comradeship.unread, lines: comradeship.lines.length, reason: comradeship.reason } : null, command: minionCommand ? { perSecond: minionCommand.perSecond, full: minionCommand.full, points: minionCommand.points, value: minionCommand.value, sources: minionCommand.sources.map((item) => item.source), gated: minionCommand.gated || [] } : null }, weaponAttack, damageSources, mainSkill: resolvedMain, timedDotLayers, fullLife, damagePaths, dummyRecount, firesAllure, lowResources, resistances, curseLimit, resolvedSlates: slate.setup.slates, netherKingAuthority: slate.setup.netherKingAuthority || null, blessings, aim, block, barrierSources, blurSources, blurEffects, effectiveTargetFireResistancePercent: damageCombat.targetFireResistancePercent, coreTalents, murmursTideEffectPercent, seaFoamNocturne, tideEffectFactor, singWithTheTide, danceOfTheDeep, windStalker, yougaUltimateOne: yougaPlainState(yougaUltimateOne), mark, pureHeart, activationMediumTerra, cycleResist, illOmen, tangles, miraculousGain, igniteIllOmen, windRhythmTerra: Object.fromEntries([...windRhythmTerra].filter(([, value]) => value)), dotTriggers: Object.fromEntries([...dotTriggers].filter(([, value]) => value)), empowerEffects, heroMemories, support, townSupportPrediction, talentSlate, equipment, pact, activation, aura, igniteLimit, skillLevelFactor, sourceDamageMultiplier, theoretical, directHit, beamCastRate, beamCritical, beamAddedDamage, nativeHitCycle, bardDelivery, beamDelivery, combatProjection, recountFiveSeconds, recountOpening, recountVariation, configured, conditions, warnings: [...new Set(warnings)] };
}
