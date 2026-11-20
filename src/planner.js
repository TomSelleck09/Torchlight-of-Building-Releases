import { resolveRegain, selfDrainSources } from "./regain-model.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";
import { supportProgressionSs13 } from "./data/skills/support-progression-ss13.generated.js";
import { maxSpellBurstTotal } from "./max-spell-burst.js";
import { SPELL_BURST_USE_GAIN } from "./spell-burst-refill.js";
import { prophecyOfRevelationInLines } from "./prophecy-of-revelation.js";
import { calculateFiresAllure } from "./fires-allure.js";
import { requestedCombatConditions, withRemovedCombatDefaults } from "./combat-condition-mode.js";
import { calculateBlurEffects } from "./blur-effects.js";
import { EHP_DEFAULTS, resourcePool, baseMana, baseLife, baseEvasion, evadeChance, perAttributePoolLines, energyShieldPoolExtra } from "./effective-hp.js";
import { resourceConsumption, resourceUseFacts, RESOURCE_CONSUMED_LINE, attackLifeConsumeLines, skillUseLifeConsumeLines, currentLifeConsumeStreams } from "./resource-consumption.js";
import { settleLifeBalance, lifeBalanceRegainFromBuild, lifeLossStreams, notFullRegenerationPercent } from "./life-balance.js";
import { resolvePactLimits } from "./pact-limits.js";
import { calculateLowResourceDefenses } from "./low-resource-model.js";
import { calculateResistances } from "./resistance-model.js";
import { calculateCurseLimit, isCurseSkill, CURSE_TOGGLES, curseBarOrder, curseSlotSummary } from "./curse-limit.js";
import { curseEffects } from "./curse-model.js";
import { calculateBlessings, blessingBaseEffects } from "./blessing-model.js";
import { blessingDurationSeconds } from "./blessing-layers.js";
// Each Blessing's duration (its layers' timer, src/blessing-layers.js) from the build's "+X% [<Blessing>] Blessing Duration" lines.
const blessingDurations = (modifierTexts) => Object.fromEntries(["Tenacity", "Focus", "Agility"].map((name) => [name, blessingDurationSeconds(modifierTexts, name)]));
import { TRUE_FLAME_IMMOLATION, TFI_CONSUMED_BLESSINGS, trueFlameBlessingCycle } from "./true-flame-blessing-cycle.js";
import { skillGameTagsSs13 } from "./data/skills/support-eligibility-ss13.generated.js";
import { blessingRecoverySources } from "./blessing-gear-effects.js";
import { calculateAim } from "./aim-model.js";
import { trueDamageSettleScale } from "./true-damage.js";
import { damageToLifeTerm } from "./damage-to-life.js";
import { guardBarrierSources, barrierGainRate, barrierShieldValue, barrierBurstCastRate, selfDamageIntervalSeconds } from "./barrier-sources.js";
import { aegisOfFireAssumption, aegisOfFireState } from "./aegis-of-fire.js";
import { blockWithAegisOfFire } from "./block-model.js";
import { MAX_BLOCK_CHANCE_PERCENT } from "./game-attribute-defaults.js";
import { combatArmor } from "./combat-armor.js";
import { heldWeaponBuffLines } from "./held-weapon-buffs.js";
import { calculateBlock } from "./block-model.js";
import { collectBlurSources } from "./blur-sources.js";
import { resolveConsumption, blurHeldShare } from "./consumption-procs.js";
import { calculateCoreTalents } from "./core-talent-model.js";
import { calculateHeroMemories } from "./hero-memory-model.js";
import { artificialMoonGate } from "./hero-memory-rules.js";
import { prismTalentStatSources } from "./prism-talent-sources.js";
import { collectModifierTexts } from "./modifier-texts.js";
import { followerModifierTexts, followerSelection, followerBlessingLines, settleFollowerBuffs, settleFollowerReaps, followerBlurSources, followerReapSources, followerDamageSources, followerWindowDps, enemyArmourWithFollower, ILL_WILL, illWillResistance, illWillTimedParts } from "./follower-model.js";
import { plannerEngines } from "./line-coverage.js";
import { ailmentBaseSettle, calculateAilment, collectAilmentTypedSources, combineAilmentChance, hasAilmentBase } from "./ailment-model.js";
import { collectAilmentApplierCandidates, ailmentAppliersFor, igniteGlobalChanceSources, igniteNotIgnitedChanceSources, applierAttempts, othersIgniteHolds } from "./ailment-applications.js";
import { buildAilmentSharedLayers } from "./ailment-shared.js";
import { ailmentInputs, planAilmentRecipe, planTraumaRecipe, rewriteTraumaShared, traumaAilmentInputs, traumaPathMode, traumaPlanSummary, traumaReapingModifiers } from "./recipe-trauma-layers.js";
import { dotPathMode, dotPlanSummary, planReapingRecipe, planSkillDotRecipe, planWiltRecipe, reapPathMode, recipeReapingModifiers, recipeSharedOptions, wiltPathMode } from "./recipe-dot-layers.js";
import { applyIgnitePatch, computeIgnitePatch, ignitePatchSummary, ignitePathMode, planIgniteRecipe } from "./recipe-ignite-layers.js";
import { calculateMultiSourceReaping, collectAllReapingSources, collectReapingModifiers } from "./reaping-model.js";
import { approachingNightfall, nightfallSteadyCycle } from "./approaching-nightfall.js";
import { addLateDamageTakenLine, addLateMechanicsLine, collectBuildMechanics, collectFocusBuffs } from "./build-mechanics.js";
import { resolveSingWithTheTide } from "./selena-tide.js";
import { auraGainedEffects, auraCastSpeedLines, auraGainedEffectLines, auraAttackSpeedLines } from "./aura-gained-effects.js";
import { windStalkerState, resolveWindStalker, windStalkerMoonMark } from "./erika-wind-stalker.js";
import { terraSupportEffects } from "./terra-supports.js";
import { YOUGA_ULTIMATE_ONE, blockNonMainTangles, yougaTangleQuantityLines, yougaUltimateOneState, yougaPreEffects, resolveYougaUltimateOne, yougaPlainState, projectileMechanics } from "./youga-ultimate-one.js";
import { resolveHeroModules, resolveIllusionState } from "./hero-trait-modules.js";
import { settleIllusionStream } from "./youga-spacetime.js";
import { passiveSupportLines } from "./passive-support-lines.js";
import { GASH, GASH_GAIN_TEXT, gashDamageLine, resolveDanceOfTheDeep, danceBlocksSetup, withTerraCharges, terraChargeLine, terraChargesConsumed, terraChargesAtInterval, resolveTerraCharges, setupTerraChargeLines, resolveActivationMediumTerra, activationMediumTerraInterval, resolveCycleResist, windRhythmTerraTrigger, buildCooldownRecoveryLines } from "./selena-dance.js";
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
import { auraAllyMinionLines, auraDamageModifierTexts } from "./aura-damage.js";
import { collectSkillDamageSources, inferDamageProfile } from "./skill-damage-profiles.js";
import { MINION_PROFILES } from "./minion-profiles.js";
import { resolveModuleProtocols, savedModuleAffixes } from "./module-protocols.js";
import { calculateSkillDot, skillDotAfflictionPerSecond } from "./skill-dot-model.js";
import { permafrostTerraState, permafrostTrigger, permafrostTerraSetup, permafrostTerraProfile, permafrostTerraChargeLine, PERMAFROST_TERRA_LEVEL } from "./permafrost-terra.js";
import { cataclysmHitAilments, cataclysmEffectPercent } from "./cataclysm-hit-ailments.js";
import { afflictionFireHitState, afflictionFireHitLines } from "./affliction-fire-hits.js";
import { AFFLICTION_DAMAGE_PER_POINT } from "./game-attribute-defaults.js";
import { auraTagLines, calculateSkillHit, supportLayers } from "./skill-hit-model.js";
import { skillHitDotComponents, skillHitTiming } from "./skill-hit-profiles.js";
import { DOT_TICKS_PER_SECOND } from "./trigger-rows.js";
import { regainBlessingSpends, supportRecipeCrowdControl } from "./crowd-control-recipes.js";
import { resolveSupportEffects, SCORCHING_BEAM_DEDICATED_SUPPORTS, allElementalState } from "./support-effects.js";
import { calculateMinion, groupMinionSources, classifyMinionLine, minionCountOut } from "./minion-damage-model.js";
import { comboPointState } from "./combo-points.js";
import { namedAuraSealedManaCompensation } from "./aura-effects.js";
import { commanderGambitState, applySpiritMagiLimit, darkGateState, bondState, summonCastSpeed, commandState, COMMAND_FAMILIES, isomorphicArmsState, comradeshipState } from "./minion-cores.js";
import { overlyModifiedState, overlyModifiedLine } from "./sentry-cores.js";
import { heroTraitStatLines, heroTraitLevelBonus, characterStatTotals, conditionalMovementSpeed, heldConditionalPoolExtra } from "./character-stats.js";
import { playerMoveSpeed } from "./dummy-target.js";
import { energyShieldGate, pageSealedManaCompensation } from "./sealed-mana-compensation.js";
import { resolveLineEffects, resettleLineEffects } from "./line-effects.js";
import { conditionalAuraEffect } from "./conditional-aura-effect.js";
import { atFullLife, atFullMana, LOW_LIFE_BELOW_PERCENT, FULL_MANA_AT_LEAST_PERCENT, splitCondition } from "./line-conditions.js";
import { luckyCritChance, mirroredShadeTerraChargeLines, crowdControlChanceRatesNeeded, CROWD_CONTROL_COUNTER_TEXT, ownerFrostbiteField, damageTypeGroups } from "./combat-states.js";
import { minionFrostbiteNeeded, resolveMinionFrostbite } from "./minion-frostbite.js";
import { buildWideAilmentBlock } from "./ailment-blocks.js";
import { minionAilmentRatesNeeded, resolveMinionAilmentTypes } from "./minion-ailment-types.js";
import { luckyChanceOverStates } from "./crit-time-states.js";
import { CHANCE_TO_DAMAGE } from "./ailment-model.js";
import { calculateWeaponAttack, classifyWeaponAttackLine, weaponLocalLineKind } from "./weapon-damage-model.js";
import { calculateVendettaTriggers, hitCritChances } from "./vendetta-model.js";
import { felineFigureState, vendettaStingState, VENDETTAS_STING } from "./erika-traits.js";
import { motoIrisState, minionHeroTraits, mergingStreamOrigins, TROOP_FAMILIES } from "./moto-iris-traits.js";
import { theaBlessingInputs, theaState, INSIDE_REALM_CONDITION } from "./thea-traits.js";
import { GODS_BOON, GODS_BOON_SETUP_KEY, godsBoonProfile } from "./thea-gods-boon.js";
import { sageState } from "./sage-traits.js";
import { carinoState, heatAilmentScale, CARINO_HEROES, RETURNING_SWITCH, SPECIAL_AMMO_LEVEL } from "./carino-traits.js";
import { rehanState, withRehanHits, rehanPhaseLines, burstProfile, burstAdditionalLines, burstAilmentScale, BURST_SETUP_KEY } from "./rehan-traits.js";
import { COLD_PULSE, COLD_PULSE_SETUP_KEY, coldPulseProfile, fusionEnergyPerUse } from "./gemma-traits.js";
import { rosaState, mercuryBaptismSource, ROSA_PATTERNS, cleanRosa } from "./rosa-traits.js";
import { bingState, bombsReplaceMain, heldDefensiveBuffs, BLAST_NOVA as BING_BLAST_NOVA } from "./bing-traits.js";
import { crimsonShadeState, redShoesState, BARD_SONG_SWITCH } from "./selena-leftover-traits.js";
const B6_MODULE_KEYS = new Set(["overload", "chargeCalling", "irisGrowing", "irisVigilant"]);
import { selenaScorchingBeamObservedSnapshots as snapshots } from "./data/stats/selena-scorching-beam-observed-snapshots.js";
import { selenaScorchingBeamCombatValidation as combat } from "./data/stats/selena-scorching-beam-combat-validation.js";
import { compileScorchingBeamIgniteSources } from "./theoretical-sources.js";
import { maxAfflictionUptime } from "./max-affliction-resistance.js";
import { defaultConfigurableSupportConfig, specialSupportStarBonus, progressionSupportTierData, progressionSupportText, normalizeProgressionSupportConfig, isActivationMedium } from "./data/skills/special-support-tiers-ss13.js";
import { refdataSkillCatalogSs13, refdataSupportCatalogSs13 } from "./data/catalogs/refdata-ss13.js";
import { installedSupportRejected, skillTagsWithSupportChanges, supportAddedTagNames, supportRemovedTagNames } from "./support-compatibility.js";
import { isDerivedLevelLine, skillLevelBonus } from "./skill-level-bonuses.js";
import { supportEffectsAtLevel } from "./skill-effect-progression.js";
// Saved base levels stay within the selector's 1–40 range; "+N level" sources are added on top.
import { clampBaseLevel } from "./skill-level-input.js";
import { scorchingBeamHitModifiers } from "./scorching-beam-hit.js";
import { findScorchingBeamSetup, scorchingBeamSustainedHits } from "./scorching-beam-base-hit.js";
import { scorchingBeamCastRate } from "./scorching-beam-cast-rate.js";
import { activationMediumDotTrigger } from "./trigger-interval.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { pressRotation, collectPressInputs, mobilityNeeds, mobilityWindows, mobilityPressInterval, setupTrigger, PRESS_SWITCH } from "./press-schedule.js";
import { idleBuffReason } from "./skill-coverage.js";
import { scorchingBeamCritical, critLineReading } from "./scorching-beam-critical.js";
import { critRecipeAdjuster, scopedAttackSpeedAdjuster, speedRecipeAdjuster } from "./recipe-hit-aggregates.js";
import { hitPoolMode, poolConversionMode } from "./attribute-pool-hit.js";
import { buildAttributePool } from "./attribute-pool-build.js";
import { scorchingBeamAddedDamage, beamAddedTypedParts, beamFlatAdded } from "./scorching-beam-added-damage.js";
import { trinityState } from "./trinity.js";
import { combineBeamAndIgnite, estimateBardBeamDelivery, estimateFiveSecondOpening, estimateNeutralBeamDelivery, simulateFiveSecondVariation, sustainedBeamDps } from "./scorching-beam-delivery.js";
import { calibratedBeamTargetFactors, fireHitMitigation, level85DummyDefenses } from "./target-hit-mitigation.js";
import { ignitedFireResistance } from "./ignited-fire-resistance.js";
import { calculateDummyRecount } from "./dummy-recount.js";
import { collectDummyRecountInputs } from "./dummy-recount-inputs.js";
import { driveWithTickEngine } from "./tick-recount.js";
import { skillUptime as skillUptimeOf } from "./skill-uptime.js";
import { deriveAfflictionRating } from "./affliction-rating.js";
import { initialAfflictionLine, resolveInitialAffliction } from "./initial-affliction.js";
import { curseTakenEffect, curseTakenLine } from "./curse-effects.js";
import { grantedMainSkillSupports, grantedPreciseAuras, mainAttributeBonusRemoved, rotatingBuffRow } from "./gear-unique-modules.js";
import { parseItemTrigger, itemTriggerEvent, triggeredSkillLevel, triggeredLevelLabel, isFixedLevelTriggerLine } from "./item-triggered-skills.js";
import { doubleDamageForSkill } from "./double-damage.js";
import { radicalEvolutionAuraEffects, originEffectFactor, originGrants, summonOriginEffect } from "./origin-of-spirit-magus.js";
// Census batch 6 (Minion, Spirit Magus, module and Sentry mechanics): src/minion-sentry-batch6.js.
import { batch6BuildLines, batch6MinionContext, maniacalArmyCommandLines, troopHalvingSource } from "./minion-sentry-batch6.js";
import { normalizePercentageText as normalizeLineText } from "./percentage-text.js";
import { spellToAttackLines } from "./spell-to-attack.js";
import { WORLD_WITHIN_LINE, worldWithinChances } from "./world-within.js";
import { HIT_GAIN } from "./blessing-model.js";
import { resolveEmpowerEffects, EMPOWER_MODELED_SKILLS } from "./empower-effects.js";
import { EMPOWER_BUFF_SPECS, empowerTimedParts, parseChanceTriggerPair } from "./empower-buffs.js";
import { mainSkillRetriggers, isMainRetriggerLine, HUNTERS_HAND_LINE, isAttackHorizontalProjectile } from "./main-skill-retriggers.js";
import { collectEnemyAilments } from "./enemy-ailments.js";
import { BY_YOU, BY_YOU_OR_FOLLOWER, copyCombatHolds, enemyBuffSet, isAuraTaggedName, empowerOrDefensiveTaggedName, empowerTagShares, putCurses, createPlayerBuffSet, playerBuffSet, putBlessings, putAuras, putEmpowerBuffs, putArmorBuffs, putBlock, putBarrier, putBlur, putElixirBuffs, putDefensiveBuffs, putFocusBuffs, putFollowerBuffs, putTimedOwnBuffs, ownCombatHeld } from "./unit-buff-set.js";
import { resolveDefensiveBuffs } from "./defensive-buffs.js";
import { resolvePeriodicBurst } from "./periodic-burst.js";
import { resolveCritNumbedBuffs } from "./crit-numbed-buff.js";
import { resolveIllOmen, illOmenDps } from "./ill-omen.js";
import { resolveTangles, tangleLinesFor, dormantEntanglementLineEntries, tangleLineEntries, tangleHitEffects, isTangleMinionAttachLine, isTangleTroopLifeLine } from "./tangle-model.js";
import { minionMaxLife, isSyntheticTroopFamily } from "./minion-life.js";
import { elixirSetupText, miraculousGainState } from "./elixir-model.js";
import { iceCageRampText } from "./ice-cage-ramp.js";
import { resolveMark, settleMark } from "./mark-effect.js";
import { chunk8BuildLines, chunk8EnemyLines, weaponBaseDamage, CHUNK8_RATE_SUPPORTS } from "./support-chunk8.js";
import { resolvePureHeart } from "./pure-heart.js";
import { hitTypeShares, recountTimedEffects, scheduleLevelAt, sourceFactorAt, timedWindowFactor } from "./timed-effects.js";
import { applyTraitBoardGrants, emptyRowsFilledByGrants, traitBoardGrantLines } from "./trait-board-grants.js";
import { applyItemMainSkillReplacement, itemMainSkillGrants } from "./item-main-skill-replacement.js";
import { ITEM_GRANTED_SKILLS_SS14 } from "./data/skills/item-granted-skills-ss14.js";
import { skillBoardRows } from "./skill-board-slots.js";
import { applyMagusActiveSlotRule, magusTakesActiveSkillLevels, setupBoardTab } from "./magus-active-slot.js";
import { removesType } from "./damage-type-restriction.js";
import { weaponToSpellEntries } from "./towering-presence.js";
import { slateTalentLines } from "./nether-king-authority.js";
import { resolveSupportBuffs, phantomTraceBlurSources } from "./support-buff-effects.js";
import { BATCH4_RATE_SUPPORTS } from "./support-conditional-batch4.js";
import { BATCH5_RATE_SUPPORTS } from "./support-hit-count-batch5.js";
import { amEventFacts, solidRiverTriggers, GENIUS_BATTLEGEAR_LINE } from "./activation-medium-events.js";
import { buildMaxChanneledStacks } from "./channeled-stack-lines.js";

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
    // Caged Fury's distance gate (belt blend record 270393984, research/caged-fury-audit-2026-11-05.md; src/line-conditions.js movedUnder /
    // movedAtLeast): moved less than 12 m or 12 m or more in the last 1 s. Only while moving (standing still moves 0 m, so the damage half
    // holds); the groups run in order, so under "Standing still" the alternative is never tried. Provisional: whether walking reaches 12 m per
    // second depends on the character's speed in m/s (open question belt-caged-fury-movement).
    label: "Distance moved in the last 1 s",
    defaultLabel: "Less than 12 m (Caged Fury's damage half)",
    alternatives: [{
      label: "12 m or more (Caged Fury's speed half)",
      overrides: { movedFast: true },
      possible: (planner) => planner.conditions.moving !== false && planner.conditions.movedFast !== true && Boolean(planner.lineEffects?.groups?.has("movedDistance"))
    }]
  },
  {
    // Distance to the dummy (user rule 2026-10-09: best-case distance, flippable). Radii (reference data keyword tooltips, user
    // decision 2026-10-12): Nearby within 6 m, Proximity within 4 m, Distant 6 m away (src/dummy-target.js). The default
    // stands close, so Nearby / Proximity and explicit radii hold; the alternative stands 6 m away for "Distant" lines.
    // Support lines that scale with proximity (Flame Slash: Immediate Threat "up to +X% … within 3 m"; Mind Control:
    // Entice "-10% … in proximity").
    label: "Distance",
    defaultLabel: "Close to the dummy (Nearby and Proximity)",
    alternatives: [{
      label: "6 m away (Distant; within 10 m)",
      overrides: { nearTarget: false },
      possible: (planner) => planner.conditions.nearTarget !== false && (supportConditionClauses(planner).some((clause) => clause.condition === "nearTarget") || Boolean(planner.lineEffects?.groups?.has("distance")) || (planner.skillHits || []).some((hit) => hit?.profile?.fervorBonus?.distant))
    }]
  },
  {
    // Clockwork Core distance (Youga combat audit 2026-10-27, provisional; src/line-conditions.js coreProjectileTravel): when the Core fires
    // every Projectile hit of the build, the "distance traveled" lines (Rapid Shots) read the Core's distance to the dummy, which the
    // player's cast sets, apart from where the player stands. Default: the Core 6 m from the dummy; the alternative keeps it next to the
    // dummy (Proximity travel lines).
    label: "Clockwork Core distance",
    defaultLabel: "Clockwork Core 6 m from the dummy (Distant projectile travel)",
    alternatives: [{
      label: "Clockwork Core next to the dummy",
      overrides: { coreDistant: false },
      possible: (planner) => Boolean(planner.lineEffects?.groups?.has("coreDistance"))
    }]
  },
  {
    // Hit recently (user request 2026-11-19): "if you haven't been hit recently" lines (Preserver of Eternity's "+40% Movement Speed …",
    // records 611469 / 633564, gate node 611 Not on being hit, data type 1000037, over 4 s; Deflection's "Gains max stacks of Deflection
    // …", Adaptive Defense's Injury Buffer) cannot hold together with the "Hit or blocked recently" best case (user decision 2026-10-12,
    // condition blockedRecently). The default stays hit recently; Not hit recently is compared only when the build has a not-hit line,
    // and wins only on more 20 s damage (a tie keeps Hit). Every reader of the condition follows the choice: the hit / blocked / evaded
    // recently lines, Blessing gains on hit, Barrier on taking damage and Barrier Burst's cast gate, the Regain best case, Paralysis on
    // Blocking, Deflection. A stored "Hit or blocked recently" switch (combat.bestCaseOverrides.blockedRecently) pins the choice. Placed
    // before Life and Mana: the Regain and Life balance those groups read follow it.
    label: "Hit recently",
    defaultLabel: "Hit or blocked recently",
    present: (planner) => hasNotHitRecentlyLine(planner),
    alternatives: [{
      label: "Not hit recently",
      overrides: { blockedRecently: false },
      possible: (planner) => planner.conditions?.blockedRecently !== false && hasNotHitRecentlyLine(planner)
    }]
  },
  {
    // Life (talent batch chunk 2): "at Low Life" and "when not at Low Life" / Full Life lines cannot both hold. Sealed Life
    // sets Low Life (src/low-resource-model.js); otherwise the dummy never attacks, so Full Life is the default and Low
    // Life is compared only when a passive line depends on it. Choosing Low Life also turns the Full Life pact lines off.
    // Full Life needs at least 95% of Max Life unsealed (user-confirmed 2026-10-12), so with Life sealed between 5% and
    // 65% the default is "not at Low Life" without being Full Life.
    // A build whose consumes take a share of current Life settles its Life against its recovery (src/life-balance.js, 2026-11-11 build
    // audit G4): the balance is its Life state, so Low Life is not compared (a pinned Low Life still applies; the "Life balance" switch
    // off restores the comparison).
    label: "Life",
    defaultLabel: (planner) => planner.lineEffects?.state?.lifeBalance?.settled ? `Life balance (${planner.lineEffects.state.lifeBalance.useWeightedLifePercent}% current Life at your uses)` : atFullLife(planner.lineEffects?.state || {}) ? "Full Life" : "Not at Low Life (Life sealed: not Full Life)",
    alternatives: [{
      label: "Low Life",
      overrides: { lowLifeAssumed: true },
      possible: (planner) => !planner.lowResources?.lowLife && !planner.lineEffects?.state?.lifeBalance?.settled && (Boolean(planner.lineEffects?.groups?.has("life")) || supportConditionClauses(planner).some((clause) => clause.condition === "lifeLost"))
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

// A line read only while not hit recently ("… if you haven't been hit recently"; the "Hit recently" group above), by wording on the
// build's own lines (passive lines, Deflection gains, hero traits, cores).
const NOT_HIT_RECENTLY = /haven['’]t been hit recently/i;
function hasNotHitRecentlyLine(planner) {
  return (planner.modifierTexts || []).some((line) => line.origin !== "derived" && NOT_HIT_RECENTLY.test(String(line.text ?? "")));
}

// State the shared line-condition resolver reads (src/line-conditions.js; talent batch chunk 2, §7.1), built once per
// pass from models that already exist. Life and Mana: sealed resources set them (src/low-resource-model.js, Low = below
// 35% remaining after sealing); otherwise not Low, unless the Life / Mana group's best-case comparison chose Low
// (requested lowLifeAssumed / lowManaAssumed). Full Life additionally needs at least 95% of Max Life unsealed
// (user-confirmed 2026-10-12; Full Mana by analogy, provisional): src/line-conditions.js atFullLife / atFullMana. The early use rate for "the next Main Skill every X s" is an estimate
// from the cast-rate ledger (beam) or the weapon's attacks per second (attacks), before Blessings and Aim.
// The Cycle I Resist Reaps on a Main Terra recast (src/selena-dance.js resolveCycleResist): a Reaping source for the "on Reap"
// gain conditions (Focus Blessing when Reaping, Blur on Reap) while a Main Terra Skill is active.
// A hit skill's uses by use trigger (SS14 client, research/use-events-rea-2026-11-04.md §1; W10 step 3b closes the W2 gap): a triggered use raises
// 1000060 and never 1000074; a Multistrike repeat of your own use is a release, 1000074 (that each repeat runs the release step is inferred), and a
// repeat of a triggered use raises neither. So the 1000060 readers count rate.usesBySource.triggered (W2 counted the repeats there, uses − your
// uses), and the 1000074 readers that counted your presses add the repeats of your uses. Spell Burst's automatic casts stay as each reader had them.
export const ownMultistrikeRepeats = (hit) => (Number(hit?.rate?.playerUsesPerSecond) || 0) > 0 ? Number(hit.rate.usesBySource?.multistrikeRepeat) || 0 : 0;
export const triggeredUsesOf = (hit) => { const uses = hit?.rate?.usesPerSecond || 0; const player = Number.isFinite(hit?.rate?.playerUsesPerSecond) ? hit.rate.playerUsesPerSecond : uses; return hit?.rate?.usesBySource ? Number(hit.rate.usesBySource.triggered) || 0 : Math.max(0, uses - player); };
// Mobility Skills installed and enabled on the skill board (catalog Mobility tag), for "after using Mobility Skills" lines
// (user rule 2026-10-14: mobility skill use is constant when the build has one; src/line-conditions.js "mobility").
function mobilitySkillNames(setups) {
  return [...new Set((setups || []).filter((setup) => setup.enabled !== false && setup.role !== "support" && (setup.tags || []).includes("Mobility")).map((setup) => setup.name))];
}
// Support clauses that hold crowd control on the dummy (wiring audit W6a item 1, 2026-11-03; src/combat-states.js holdRows): every
// enabled support of an active setup whose clause carries a stone game id with a crowd control reading (src/crowd-control-recipes.js),
// with what that setup does on the dummy: its hits (a modeled skill hit, the beam), its damage over time, the Minions it summons, and the
// Terra Charges a use consumes (Tidewell: Undertow). `rates` are the hit pass's per-setup facts (ccEvents.bySetup; null before it).
function supportCrowdControlHolders({ setups = [], activeNames = new Set(), skillHitSources = [], damageSources = [], rates = null } = {}) {
  const holders = [];
  for (const setup of setups) {
    if (setup.enabled === false || !activeNames.has(setup.name)) continue;
    const clauses = (setup.supportEffects?.clauses || []).filter((clause) => clause.game?.id);
    if (!clauses.length) continue;
    const hitSource = skillHitSources.find((source) => source.setupKey === setup.setupKey) || null;
    const modeled = damageSources.filter((source) => source.status === "modeled" && source.setupKey === setup.setupKey);
    const hits = Boolean(hitSource) || setup.name === "Scorching Beam";
    const dot = modeled.some((source) => source.profile?.engine === "skill-dot") || Boolean(hitSource && skillHitDotComponents(hitSource.profile).length);
    const minions = modeled.some((source) => source.profile?.engine === "minion");
    for (const clause of clauses) {
      const reading = supportRecipeCrowdControl({ id: clause.game.id, text: clause.text });
      if (!reading) continue;
      holders.push({ setupKey: setup.setupKey, skill: setup.name, support: clause.support, gameId: clause.game.id, text: clause.text, reading, hits, dot, minions,
        // A Terra skill with the default charges (no Terra Charge line in the build: src/selena-dance.js withTerraCharges leaves the profile
        // as is) consumes its one charge per cast.
        terraChargesConsumed: Number.isFinite(hitSource?.profile?.terraChargesConsumed) ? hitSource.profile.terraChargesConsumed : hitSource?.profile?.terraCharge ? 1 : null, rates: rates?.[setup.setupKey] ?? null });
    }
  }
  return holders;
}

// Crowd control counters outside the modifier lines (2026-11-12): a support clause on an enabled setup that counts the target's crowd
// control (Mind Control: Befuddle, recipe 587389760) and a follower skill whose own text counts them (Origin Tartarus: Shackles of Malice's Ill
// Will, affix 1778245). Both read the dummy's one held set (GetBuffCfgIdCountByTag / GetBuffStackByTag on tag 5100101), like the lines
// src/combat-states.js counts as readers: they feed its reader count (holder badges) and the hit pass's rate measurement.
function crowdControlCounterSources({ setups = [], activeNames = new Set(), follower = null } = {}) {
  const counters = [];
  for (const setup of setups) {
    if (setup.enabled === false || !activeNames.has(setup.name)) continue;
    for (const clause of setup.supportEffects?.clauses || []) if (CROWD_CONTROL_COUNTER_TEXT.test(String(clause.text ?? ""))) counters.push({ source: `${setup.name}: ${clause.support ?? "support"}`, text: clause.text });
  }
  for (const entry of follower?.skills || []) for (const text of entry.skill?.lines || []) if (CROWD_CONTROL_COUNTER_TEXT.test(String(text))) counters.push({ source: `Follower: ${entry.skill.name}`, text });
  return counters;
}

// The board's Mobility uses per second: each pressed at its stone cooldown (the user's Mobility rule).
function boardMobilityUses(setups, conditions) {
  if (conditions?.mobilitySkillUsed === false) return 0;
  return mobilitySkillNames(setups).reduce((sum, name) => { const seconds = Number(skillTimingSs13[name]?.cooldown) || 0; return sum + (seconds > 0 ? 1 / seconds : 0); }, 0);
}

function cycleResistReaps(modifierTexts, resolvedMain, activeNames) {
  const mainIsTerra = Boolean(resolvedMain && activeNames.has(resolvedMain.name) && (resolvedMain.tags || []).includes("Terra"));
  return mainIsTerra && modifierTexts.some((line) => line.origin === "trait" && /previous Main Terra Skill hasn't ended, Reaps Damage Over Time/i.test(String(line.text)));
}

// The damage types one modeled hit really deals: the types of its parts with damage per use (after its conversion, the weapon's local and
// added Elemental damage, Trinity and "-100% … Physical Damage"), not its tags (2026-11-05, Rosa build audit gap 1: a Physical-tagged
// Attack with an all-Elemental weapon deals Fire, Cold and Lightning). Null when no part carries damage.
// `chain` true: the types a converted part also reads its scaling lines by (SS14 0x141fc3a80: the new record's mask is target | source;
// user-stated Q8), for the supports' typed lines; false (the dealt reading): the final type only, the typed map a trigger reads.
export function hitDealtTypes(hit, { chain = false } = {}) {
  const perType = new Map();
  for (const component of hit?.components || []) {
    const value = Number(component.perUse);
    if (!component.type || !Number.isFinite(value) || value <= 0) continue;
    const types = chain ? component.scopeTypes || (component.converted && component.originalType ? [component.originalType, component.type] : [component.type]) : [component.type];
    for (const type of types) perType.set(type, (perType.get(type) || 0) + value);
  }
  return perType.size ? [...perType.keys()] : null;
}

// The damage types a skill-hit source deals: the hit pass's reading (`dealtBySetup`, hitRateFacts.bySetup) when it has one, else its profile's.
function sourceDealtTypes(source, dealtBySetup = null) {
  return dealtBySetup?.get?.(source?.setupKey) || source?.profile?.dealtTypes || (source?.profile?.damageType ? [source.profile.damageType] : []);
}

// The press rotation lives in src/press-schedule.js (2026-11-05; re-exported here for its tests).
export { pressRotation } from "./press-schedule.js";
// Life lost for the "per 1% Life lost" readers (2026-11-05; research/rosa-build-followups-2026-11-05.md §1.6): 100 × (1 − current ÷ full Max
// Life). Current Life = the unsealed share (`lifeRemaining`, % of Max Life) less a self-drain's held dip: Ghost Slaughter's record 824274
// takes p0 ÷ 5 % of current Life every 0.2 s while Fervor is active (never below 1); Regain (src/regain-model.js) restores its amount × (Max
// Life − current) once per interval. Per Regain interval Δ the drain removes f = 1 − (1 − q)^(Δ ÷ 0.2 s) of current Life: when the Regain
// covers it Life saw-tooths below the unsealed level by f ÷ 2 on average, otherwise it settles where the two rates meet (post-Regain level
// r ÷ (f + r − r f), average × (1 − f ÷ 2)); with no Regain it runs down to about 0. The Life group's Low Life assumption caps current at 35%.
const roundLife = (value) => Math.round(value * 10000) / 10000;
function lifeLostState({ lifeRemaining = 100, lifeAssumed = false, modifierTexts = [], setups = [], activeNames = new Set(), statsByKey = {}, regainEvents = true, anyHit = false } = {}) {
  const unsealed = Math.max(0, Math.min(100, lifeRemaining)) / 100;
  const hasFervor = modifierTexts.some((line) => /^(?:Have|Has|Gains) Fervor(?: when there are enemies Nearby)?$|^(?:\[[^\]]+\] ?)?Has \d+ point\(s\) of fixed Fervor Rating$/i.test(String(line.text ?? "").trim()))
    || setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (allSkillEffectsSs13[setup.name] || []).some((text) => /Gains Fervor when this skill hits/i.test(String(text))));
  const castsAttack = setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Attack"));
  const drains = selfDrainSources({ modifierTexts, hasFervor, castsAttack }).filter((drain) => drain.active && drain.pools.includes("life") && /per second while Fervor is active/i.test(drain.text));
  let current = unsealed, drain = null;
  if (drains.length && unsealed > 0) {
    const q = Math.min(1, drains.reduce((sum, item) => sum + item.percent, 0) / 5 / 100);
    const regain = resolveRegain({ modifierTexts, stats: { lifeRegain: statsByKey.lifeRegain, energyShieldRegain: statsByKey.energyShieldRegain, lifeRegainInterval: statsByKey.lifeRegainInterval, energyShieldRegainInterval: statsByKey.energyShieldRegainInterval }, anyHit, hitRecently: true, enabled: regainEvents, hasFervor, castsAttack });
    const pool = regain?.pools?.life;
    const interval = pool?.active && pool.ratePerSecond > 0 ? 1 / pool.ratePerSecond : null;
    const r = pool?.active ? Math.min(30, Number(pool.amountPercent) || 0) / 100 : 0;
    if (interval && r > 0) {
      const f = 1 - (1 - q) ** (interval / 0.2);
      const covered = r * (1 - unsealed * (1 - f)) >= unsealed * f;
      const high = covered ? unsealed : Math.min(unsealed, r / (f + r - r * f));
      current = high * (1 - f / 2);
      drain = { sources: drains.map((item) => item.source), perTickPercent: roundLife(q * 100), regainIntervalSeconds: roundLife(interval), regainPercent: roundLife(r * 100), heldPercent: roundLife(current * 100), text: `${drains.map((item) => item.source).join(", ")} drains ${roundLife(q * 100)}% of current Life every 0.2 s; Life Regain ${roundLife(r * 100)}% of missing Life every ${roundLife(interval)} s ${covered ? "refills it" : "meets it"}: current Life ${roundLife(current * 100)}% of Max Life on average` };
    } else {
      current = 0;
      drain = { sources: drains.map((item) => item.source), perTickPercent: roundLife(q * 100), regainIntervalSeconds: null, regainPercent: 0, heldPercent: 0, text: `${drains.map((item) => item.source).join(", ")} drains ${roundLife(q * 100)}% of current Life every 0.2 s with no Life Regain to refill it: Life runs down toward 1` };
    }
  }
  if (lifeAssumed) current = Math.min(current, LOW_LIFE_BELOW_PERCENT / 100);
  const percent = roundLife(Math.max(0, Math.min(100, (1 - current) * 100)));
  const sealed = roundLife((1 - unsealed) * 100);
  const reason = [sealed > 0 ? `${sealed}% of Max Life sealed (sealed Life counts as Life lost: the client's missing-Life stat uses the full Max Life)` : null, drain?.text || null, lifeAssumed ? `Low Life chosen by the Life group (best case): Life at most ${LOW_LIFE_BELOW_PERCENT}% of Max Life` : null].filter(Boolean).join("; ") || "the dummy never attacks and nothing seals or drains Life";
  return { percent, reason: `${percent}% Life lost: ${reason}`, drain };
}

// The Life balance on the line state (2026-11-11 build audit G4; src/life-balance.js): current Life is the level the balance settles,
// read at your uses. Low Life (current Life at most 35% of Max Life, manual 1000010125) holds on its share of the uses; with Tide of the
// Styx's "Non-Full Life state will be considered as Low Life" (record 523545: gate Not(state 4000411 Full Life) → node 238 state 4000410
// Low Life) on every use below Full Life (95%, manual 1000010126). `life` is the majority state for the readers that take one; the Low
// Life, Full Life and Life lost line readers take the shares and the level (src/line-conditions.js). Life lost is the client's source 11
// at the uses, 100 × (1 − current ÷ full Max Life).
function applyLifeBalance(state, balance, { tide = [] } = {}) {
  const lowShare = tide.length ? balance.notFullShare : balance.lowLifeShare;
  state.lifeBalance = { ...balance, lowLifeShare: lowShare, lowLifeRawShare: balance.lowLifeShare, tideOfTheStyx: tide };
  const percent = (share) => Math.round(share * 10000) / 100;
  state.life = lowShare >= 0.5 ? "low" : "full";
  state.lifeReason = `Life balance: ${balance.text}; ${tide.length ? `${tide.join(", ")}: "Non-Full Life state will be considered as Low Life", so Low Life on the ${percent(lowShare)}% of uses below 95% (record 523545)` : `Low Life (at most 35%) on ${percent(lowShare)}% of uses`}`;
  state.lifeLostPercent = balance.missingLifePercent;
  state.lifeLostReason = `${balance.missingLifePercent}% Life lost at your uses (the Life balance: current Life ${balance.useWeightedLifePercent}% of the full Max Life; sealed Life counts as Life lost)`;
}

// The Seething Spirit's casts of an Attack Main Skill as your Attack uses (Rehan audit F3; proven 2026-11-09, research/attack-life-consume-2026-11-09.md
// §3: its AI casts are untriggered instances and ghost 10100's config_ghost bytes 6 / 7 forward their use events to you): its casts in
// Berserk × the Berserk uptime, with the Main Skill's skill instances per use (a Combo cycle's steps). 2026-11-08 build audit gap 4.
function seethingSpiritAttackUses(rehan, resource) {
  const spirit = rehan?.spirit;
  if (!spirit?.active || !(spirit.usesInBerserk > 0)) return null;
  const main = (resource?.attackUses || []).find((use) => use.setupKey === spirit.mainSetupKey);
  if (!main) return null;
  return { setupKey: `${main.setupKey}:spirit`, name: `Seething Spirit (${main.name})`, usesPerSecond: spirit.usesInBerserk * (Number(rehan.rage?.uptime) || 0), stepsPerUse: main.stepsPerUse, from: "Seething Spirit casts in Berserk × uptime" };
}
// Every Seething Spirit cast, an Attack Main Skill or not (each raises 1000074 with the ghost's tag 6001190), for Ancestral Hate's
// "Seething Spirit consumes X% of current Life when using skills" (record 11461973 row 6; 2026-11-11 build audit G1).
function seethingSpiritUses(rehan, resource) {
  const attack = seethingSpiritAttackUses(rehan, resource);
  if (attack) return attack;
  const spirit = rehan?.spirit;
  if (!spirit?.active || !(spirit.usesInBerserk > 0)) return null;
  return { setupKey: `${spirit.mainSetupKey ?? "main"}:spirit`, name: "Seething Spirit", usesPerSecond: spirit.usesInBerserk * (Number(rehan.rage?.uptime) || 0), stepsPerUse: 1, from: "Seething Spirit casts in Berserk × uptime" };
}

// The one Max Energy Shield pool, rebuilt after the line resolver (G3d): kept off the state object, which the planner result carries.
const ENERGY_SHIELD_POOL_REBUILD = new WeakMap();
function buildLineConditionState({ state, requestedConditions, conditions, lowResources, aura, block, mechanics, curseLimit, modifierTexts, equipment, activeNames, setups, resolvedMain, skillHitSources, talentSlate, pact, heroMemories, earlyBlessings = null, damageSources = [], debuffHitRates = null, yougaMainKey = null, yougaBlockedTangles = [], talentPanels = [], resistances = null, remainingEnergy = 0, nonExclusiveSupports = 0, tangles = null, dealtBySetup = null }) {
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
  const statTotals = characterStatTotals({ modifierTexts, state, heroMemories, equipment });
  const statsByKey = statTotals.byKey;
  // Max Mana / Max Life pools with the level base (src/effective-hp.js rule), for "per 100 Max Mana owned" lines (chunk 3).
  const characterLevelForPools = buildCharacterLevel(state).level;
  const stat = (key) => Number(statsByKey[key]?.value) || 0;
  // Max Energy Shield: one pool with the defence view (src/effective-hp.js energyShieldPoolExtra: the per-attribute lines and the active
  // Auras' Energy Shield buffs; 10 T claim audit G3b, 2026-11-09), for Barrier Burst's Shield and every combat reader below.
  const maxEnergyShieldPool = resourcePool(statTotals, "maxEnergyShield", 0, { defense: true, extra: energyShieldPoolExtra({ modifierTexts, totals: statTotals, auraEntries: aura?.entries || [] }) }).value;
  // Rebuilt once the line resolver has run (the held conditional lines, G3d): src/planner.js after conditionalMovementSpeed.
  const maxEnergyShieldPoolWith = (lineEffects) => resourcePool(statTotals, "maxEnergyShield", 0, { defense: true, extra: energyShieldPoolExtra({ modifierTexts, totals: statTotals, auraEntries: aura?.entries || [], lineEffects }) }).value;
  const lifeStructural = Boolean(lowResources.lowLife), manaStructural = Boolean(lowResources.lowMana);
  const lifeAssumed = !lifeStructural && requestedConditions.lowLifeAssumed === true;
  const manaAssumed = !manaStructural && requestedConditions.lowManaAssumed === true;
  const lifeRemaining = Math.max(0, aura.lifeRemainingPercent ?? 100);
  const manaRemaining = Math.max(0, aura.manaRemainingPercent ?? 100);
  // Your unit buff set (W9 step 2, 2026-11-03; src/unit-buff-set.js): the early Blessing pass, the active Auras, the Empower skills on the
  // board, the combat Armor and block buffs, Barrier and the own-side counts (Minions, Spirit Magi). The combat pass puts its held buffs
  // on it (src/line-effects.js); the readers of these states query it (TLI_BUFF_SET=off runs the old fields below).
  const playerBuffs = createPlayerBuffSet();
  putBlessings(playerBuffs, earlyBlessings);
  putAuras(playerBuffs, aura.entries || [], activeNames);
  const empowerSkillsOnBoard = setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Empower")).map((setup) => setup.name);
  putEmpowerBuffs(playerBuffs, { skills: empowerSkillsOnBoard });
  // The Focus buffs (src/build-mechanics.js collectFocusBuffs: the board Focus skills' own buffs and the granted Precise ones, game records
  // 10440–10481) with their level and Focus Buff Effect.
  { const focus = collectFocusBuffs({ setups, activeNames, modifierTexts }); putFocusBuffs(playerBuffs, [...focus.buffs].map(([name, entry]) => ({ name, level: entry.level, effectPercent: focus.effectPercent, granted: !entry.board, source: entry.board ? `${name}: Focus buff` : `${name} Buff (${entry.source})` }))); }
  const armorInCombat = combatArmor({ statTotals, auraEntries: aura?.entries || [], activeNames, setups, modifierTexts, state, requestedConditions, followerSelection: followerSelection(state), blessingStacks: Object.fromEntries((earlyBlessings?.entries || []).map((entry) => [entry.name, entry.stacks])), playerBuffs });
  putArmorBuffs(playerBuffs, armorInCombat);
  putBlock(playerBuffs, { attack: block.attackChance || 0, spell: block.spellChance || 0 });
  putBarrier(playerBuffs, Boolean(conditions.barrier));
  // The Minions out, and of them the Synthetic Troop Minions (the troop summons' and modules' Minions, game tag 6000320; Haze's "per
  // Synthetic Troop Minion you own", affix 549333 GetMinionCount on that tag).
  const { minionsOut, troopMinionsOut } = (() => { const levels = new Map(); for (const source of damageSources) { if (source.status !== "modeled" || source.profile?.engine !== "minion") continue; const level = setups.find((setup) => setup.setupKey === source.setupKey)?.effectiveLevel ?? 20; levels.set(source.profile.minionKey, Math.max(levels.get(source.profile.minionKey) || 0, level)); } let total = 0, troops = 0; for (const [key, level] of levels) { const count = minionCountOut(MINION_PROFILES[key], level, modifierTexts, { troopMaxMinions: (requestedConditions?.troopMaxMinions ?? requestedConditions?.moduleMaxMinions) !== false, halveTroops: Boolean(troopHalvingSource({ setups, activeNames })) }); total += count; if (TROOP_FAMILIES.includes(MINION_PROFILES[key]?.family)) troops += count; } return { minionsOut: total, troopMinionsOut: troops }; })();
  const magusSetups = setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && /^Summon \w+ Magus$/.test(setup.name));
  // G1 (2026-11-10): each summon's own Origin effect from its supports (Precise: Superpower, Friend of Spirit Magi; src/origin-of-spirit-magus.js).
  const magusTypes = new Set(magusSetups.map((setup) => setup.name)).size;
  const spiritMagusSummons = magusSetups.map((setup) => { const originEffect = summonOriginEffect(setup, { magusTypes }); return { name: setup.name, level: setup.effectiveLevel ?? setup.baseLevel ?? 20, ...(originEffect.sources.length ? { originEffect } : {}) }; });
  playerBuffs.setLevel("Minions", minionsOut).setLevel("Synthetic Troop Minions", troopMinionsOut).setLevel("Spirit Magi", spiritMagusSummons.length);
  const lifeLost = lifeLostState({ lifeRemaining, lifeAssumed, modifierTexts, setups, activeNames, statsByKey, regainEvents: requestedConditions.regainEvents !== false, anyHit: Boolean(beam) || skillHitSources.length > 0 });
  const lineState = {
    playerBuffs,
    // Selena (Dance of the Deep): The Paradise I Curse curses enemies inside an active Main Terra Skill (src/selena-dance.js).
    cursed: curseLimit.active.length > 0 || mechanics.curses.active.length > 0 || modifierTexts.some((line) => /Curse upon dealing damage|are cursed by/i.test(line.text)) || resolveDanceOfTheDeep({ state, modifierTexts, resolvedMain, activeNames }).cursed,
    // Curse skills on the dummy (active curse-role setups the curse limit keeps, plus gear-triggered curses), for lines keyed
    // to one curse ("Inflicts Cold Infiltration on enemies cursed by Biting Cold", Broken Dream; src/combat-states.js, 2026-10-18).
    curseSkillNames: [...setups.filter((setup) => isCurseSkill(setup) && setup.enabled !== false && activeNames.has(setup.name)).map((setup) => setup.name), ...(mechanics.curses.active || []).map((curse) => curse?.name ?? curse).filter((name) => typeof name === "string")],
    // Life sealed (aura reservations), for "for every N% Life sealed" lines (Drenched Hem; src/line-conditions.js perLifeSealed).
    lifeSealedPercent: Math.max(0, 100 - lifeRemaining),
    enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), enemyAilmentTypeCount: mechanics.enemyAilments.count,
    // The dummy's unit buff set (src/unit-buff-set.js, W8 step 1, 2026-11-03): the readers of the Ignited / Traumatized states and the
    // ailment counts query it. A copy, so the combat pass's adds (Frozen from a deemed Frostbite Rating) stay with this state, as its
    // push onto `enemyAilments` does.
    enemyBuffs: mechanics.enemyAilments.set.clone(),
    // The ailments you inflict yourself (wiring audit W2 gap 6, 2026-11-03): not the follower's or your Minions' (their events go to their
    // own rows), for the "inflicted recently" / "when inflicting" readers (1000150 / 1000160).
    ownAilments: mechanics.enemyAilments.types.filter((type) => !type.byMinions && !type.byFollower).map((type) => type.name),
    // The ailments you inflict yourself (the list above also holds those only your Minions keep on the dummy, src/minion-ailment-types.js),
    // for the "when inflicting" readers; and each Minion-held ailment's uptime share, for readers that settle a share.
    enemyAilmentsInflicted: mechanics.enemyAilments.types.filter((type) => !type.byMinions).map((type) => type.name),
    enemyAilmentUptime: Object.fromEntries(mechanics.enemyAilments.types.filter((type) => type.byMinions).map((type) => [type.name, type.uptime])),
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
    // Life lost ("for every 1% Life lost", Desperation, Recklessness): the client's missing-Life stat, source 11 at 0x141f623c0, is
    // 100 × (1 − current Life ÷ full Max Life), so sealed Life counts as Life lost (user decision 2026-11-05, superseding the 2026-10-15
    // rule; research/rosa-build-followups-2026-11-05.md §1). Current Life is the unsealed share less a self-drain's held dip (Ghost
    // Slaughter, refilled by Regain: lifeLostState); under the Life group's Low Life assumption it is at most the 35% threshold.
    lifeLostPercent: lifeLost.percent,
    lifeLostReason: lifeLost.reason,
    lifeLostDrain: lifeLost.drain,
    // Whether a "per 1% Life lost" line or support reads Life lost (the drain's badge: In calc only with one).
    lifeLostReaders: modifierTexts.some((line) => /\bLife lost\b/i.test(String(line.text ?? ""))) || setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.supports || []).some((support) => support.enabled !== false && /\bLife lost\b/i.test([...(support.effects || []), supportProgressionSs13[support.name]?.baseEffect || ""].join("\n")))),
    mana: manaStructural || manaAssumed ? "low" : "full",
    manaReason: manaStructural ? `${Math.round(Math.max(0, aura.manaRemainingPercent ?? 100) * 100) / 100}% Mana left after sealing` : manaAssumed ? "Low Mana chosen by the Mana group (best case)" : manaRemaining >= 95 ? "Full Mana" : `${Math.round(manaRemaining * 100) / 100}% Mana left after sealing`,
    canCrit: beam || skillHitSources.some((source) => !source.profile.weaponScaling || weapon.crit.chancePercent > 0),
    // A skill's built-in Reap is your Reap too (trigger 1000032; wiring audit W2 gap 4, 2026-11-03: Wilting Beam's Reap at max channeled
    // stacks for "if you have landed a Critical Strike or Reaped in the last 8s").
    hasReaping: collectAllReapingSources(modifierTexts).length > 0 || cycleResistReaps(modifierTexts, resolvedMain, activeNames) || damageSources.some((source) => source.status === "modeled" && source.profile?.builtInReaping && activeNames.has(source.name)) || (state.hero.selectedHeroId === "youga-spacetime-elapse" && modifierTexts.some((line) => /^When dealing damage to enemies in Twisted Spacetime, Reaps /i.test(String(line.text ?? "").trim()))),
    // Youga – Spacetime Illusion / Elapse (hero trait audit B4; src/hero-trait-modules.js): Cooldown Recovery Speed for Me and
    // Myself (the stat sheet's increased total; plain build-wide "additional" lines summed), the character's increased Cast Speed
    // on the stat sheet (Make it Quick before the hit pass), damage over time on the dummy (Twisted Spacetime's cast) and whether
    // the Main Skill can Spell Burst (Telepathy Expert). The hit pass's rates arrive as `yougaSpacetime` (hitRateFacts.youga).
    cooldownRecoverySpeedPercent: stat("cooldownRecoverySpeed"),
    skillEffectDurationPercent: stat("skillEffectDuration"),
    // Keyword 626: the Spacetime Illusion uses Spell Skills only, never Channeled or Summon Skills.
    illusionMainBlock: (() => { const tags = resolvedMain?.tags || []; return !resolvedMain ? null : !tags.includes("Spell") ? `${resolvedMain.name} is not a Spell Skill` : tags.includes("Channeled") ? `${resolvedMain.name} is a Channeled Skill` : tags.includes("Summon") ? `${resolvedMain.name} is a Summon Skill` : null; })(),
    additionalCooldownRecoverySpeedPercent: modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).reduce((sum, line) => { const match = normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(/^([+-]?\d+(?:\.\d+)?)% additional Cooldown Recovery Speed$/i); return sum + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0),
    castSpeedStatPercent: stat("castSpeed"),
    dealsDamageOverTime: (enemyBuffSet(mechanics.enemyAilments)?.holds("DotAilment", { by: BY_YOU }) ?? mechanics.enemyAilments.types.filter((type) => !type.byMinions && !type.byFollower).some((type) => ["Ignite", "Trauma", "Wilt"].includes(type.name))) || damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "skill-dot" && activeNames.has(source.name)) || skillHitSources.some((source) => skillHitDotComponents(source.profile).length > 0),
    // Physical Damage the player deals (Ferocity's "when dealing Physical Damage"; gear affix batch D): a modeled hit with a Physical part
    // after its own conversion, a Physical skill DoT, or Trauma on the dummy.
    dealsPhysicalDamage: skillHitSources.some((source) => sourceDealtTypes(source, dealtBySetup).includes("Physical")) || damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "skill-dot" && source.profile.damageType === "Physical" && activeNames.has(source.name)) || (enemyBuffSet(mechanics.enemyAilments)?.holds("Trauma", { by: BY_YOU_OR_FOLLOWER }) ?? mechanics.enemyAilments.types.filter((type) => !type.byMinions).some((type) => type.name === "Trauma")),
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
      // The Life balance (src/life-balance.js, 2026-11-11 build audit G4) also reads the Restoration Over Time share and Life Regeneration.
      balanceStats: { lifeRegain: statsByKey.lifeRegain, lifeRegainInterval: statsByKey.lifeRegainInterval, energyShieldRegainInterval: statsByKey.energyShieldRegainInterval, "game:regainToRestorationOverTime": statsByKey["game:regainToRestorationOverTime"],
        regenerationPercent: stat("game:lifeRegenerationPercent"), regenerationFlat: stat("game:lifeRegeneration"), regenerationSpeedPercent: stat("lifeRegenerationSpeed"), regenerationSpeedAdditional: Number(statsByKey.lifeRegenerationSpeed?.additional) || 1 },
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
    equippedSkillsByTag: Object.fromEntries(["Empower", "Curse", "Mobility", "Defensive", "Warcry", "Synthetic Troop"].map((tag) => [tag, [...new Set(setups.filter((setup) => setup.enabled !== false && setup.role !== "support" && !(setup.tags || []).includes("Passive") && (setup.tags || []).includes(tag)).map((setup) => setup.name))]])),
    // Ice Puppet's Ice Cage (src/combat-states.js): best case held; "icePrison" false leaves it out (pact badge audit 2026-10-13).
    icePrison: requestedConditions.icePrison !== false,
    // Every best-case assumption a timed pact / kismet effect reads (src/combat-states.js conditionOn; Config tab list).
    requestedConditions,
    mainUsesPerSecond,
    castsAttack: setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Attack")),
    hasHasten: modifierTexts.some((line) => /^Has Hasten$/i.test(String(line.text).trim())),
    // A support on an active skill that reads the hit's Skill Area bonuses (Berserking Blade: Rampage, Blazing Bullet: Ignition Point;
    // src/support-conditional-batch4.js): the combat-only Skill Area sources (Fervor's added base effect) then move damage (2026-11-05).
    skillAreaReaders: setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.supports || []).some((support) => support.enabled !== false && /bonus(?:es)? and additional bonus(?:es)? to Skill Area/i.test([...(support.effects || []), supportProgressionSs13[support.name]?.baseEffect || ""].join("\n")))),
    dealtTypes: new Set(mechanics.penetration?.dealtTypes || []),
    // Whether you deal damage yourself: a Minion's damage does not fire your trigger 1000030 (lines that count it name trigger 1000047).
    ownDamage: Boolean(beam) || skillHitSources.length > 0 || damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "skill-dot" && activeNames.has(source.name)),
    // Damage types the build really deals, for "if you have dealt <Type> Damage recently" (Translucent; core audit batch B2).
    // `dealtTypes` always carries Fire (the penetration ledger's beam / Ignite default), which switched Translucent's
    // "+25% additional Lightning Damage if you have dealt Fire Damage recently" on in builds that deal no Fire (Erika). Fire here
    // needs a Fire source: the beam, an active Fire-tagged skill or hit, added Fire to the build's attacks / spells, or a
    // conversion / gain to Fire (the other types keep the penetration ledger's reading: active skill tags and ailment bases).
    dealtDamageTypes: (() => {
      const types = new Set((mechanics.penetration?.dealtTypes || []).filter((type) => type !== "Fire"));
      const hits = beam || skillHitSources.length > 0;
      const fire = beam || setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && setup.role !== "aura" && setup.role !== "support" && (setup.tags || []).includes("Fire"))
        || skillHitSources.some((source) => sourceDealtTypes(source, dealtBySetup).includes("Fire"))
        || (hits && modifierTexts.some((line) => /^Adds [\d.]+ ?[-–] ?[\d.]+ Fire Damage to (?:your )?(?:Attacks and Spells|Spells|Attacks)$|\b(?:to|as(?: extra)?) Fire Damage\b/i.test(String(line.text).trim())));
      if (fire) types.add("Fire");
      for (const line of modifierTexts) { const added = String(line.text).trim().match(/^Adds [\d.]+ ?[-–] ?[\d.]+ (Physical|Cold|Lightning|Erosion) Damage to (?:your )?(?:Attacks and Spells|Spells|Attacks)$/i); if (added && hits) types.add(added[1][0].toUpperCase() + added[1].slice(1).toLowerCase()); }
      // The hit pass's dealt types (2026-11-05): the types a modeled hit really deals.
      if (dealtBySetup) for (const source of skillHitSources) for (const type of dealtBySetup.get(source.setupKey) || []) types.add(type);
      return types;
    })(),
    // Damage types the build's modeled hits deal (Scorching Beam: Fire; generic skill hits: their profile types), for "when
    // hitting an enemy with <Type> Damage" stacking lines (src/line-conditions.js hitsWithType; frost-terra audit 2026-10-13).
    sealedManaCompensationPercent: aura.entries.find((entry) => entry.reservation)?.reservation.globalCompensationPercent ?? 0,
    // The beam's added types are hit parts of their own (src/scorching-beam-added-damage.js), so its Spell lines count here (chunk 14's High Voltage gap).
    hitTypes: new Set([...(beam ? ["Fire", ...modifierTexts.flatMap((line) => String(line.text).trim().match(/^Adds [\d.]+ ?[-–] ?[\d.]+ (Physical|Cold|Lightning|Erosion) Damage to (?:your )?(?:Attacks and Spells|Spells)$/i)?.[1] ?? []).map((type) => type[0].toUpperCase() + type.slice(1).toLowerCase())] : []), ...skillHitSources.flatMap((source) => sourceDealtTypes(source, dealtBySetup))]),
    // Active modeled Projectile skill hits, for "for each (Spell) Projectile generated recently" stacks (On the Sublime;
    // src/line-conditions.js projectilesGenerated, 2026-10-18).
    projectileSkills: skillHitSources.filter((source) => source.setup?.enabled !== false && activeNames.has(source.setup?.name) && (source.setup?.tags || source.profile?.tags || []).includes("Projectile")).map((source) => ({ name: source.setup.name, spell: (source.setup?.tags || source.profile?.tags || []).includes("Spell") })),
    stats: { strength: stat("strength"), dexterity: stat("dexterity"), intelligence: stat("intelligence"), skillArea: stat("skillArea"), maxMana: resourcePool(statTotals, "maxMana", baseMana(characterLevelForPools)).value, maxLife: resourcePool(statTotals, "maxLife", baseLife(characterLevelForPools)).value, maxEnergyShield: maxEnergyShieldPool, evasion: resourcePool(statTotals, "evasion", baseEvasion(characterLevelForPools), { defense: true }).value, elementalAilmentAvoidance: stat("elementalAilmentAvoidance"),
      // Combat Armor (src/combat-armor.js), the one Armor every per-Armor reader takes: the attribute pool seeds it as the whole attribute 4001
      // (src/attribute-pool-build.js STAT_ATTRS) for the node 114 Armor conversions (Forlorn Crystal 879879104; 2026-11-09).
      armor: armorInCombat.value },
    // The Aura types the game counts (buff tag 5100305; a Focus skill in an Aura slot is not one: W9 step 4, src/unit-buff-set.js isAuraTaggedName).
    auraCount: new Set((aura.entries || []).filter((entry) => activeNames.has(entry.name) && isAuraTaggedName(entry.name)).map((entry) => entry.name)).size,
    // Hero trait audit B2 (2026-10-19): Endless Frenzy's Knockback distance total and Prophecy of Truth's allocated Legendary
    // Medium Talents (talent-panel nodes of type "legendary" with points, replaced nodes left out; slate talents not counted).
    knockbackDistancePercent: knockbackDistanceSources.reduce((sum, item) => sum + item.value, 0),
    knockbackDistanceSources,
    // World Within (src/world-within.js): the effective resistances and the Armor pool (stat sheet, no Aura buffs; provisional).
    // Uncapped resistance totals (above the max-resistance cap): Double Rainbow compares these (user-confirmed 2026-10-27).
    resistanceTotals: Object.fromEntries((resistances?.entries || []).map((entry) => [entry.element, entry.total])),
    // Combat Armor for the per-Armor readers (wiring fix W6b; src/combat-armor.js): the stat sheet's Armor + the active Auras' Armor
    // buffs, Iron Fortification while Aegis of Fire is up, the follower's Fortify Line, Prophecy of Shelter. The town sheet is unchanged.
    combatArmor: armorInCombat,
    // Whether a per-Armor reader is on the build: the follower's Fortify Line badges In calc then (src/follower-model.js).
    armorReaderLive: modifierTexts.some((line) => ["perArmor", "armorAtLeast"].includes(splitCondition(normalizeLineText(String(line.text ?? "")))?.condition.key)),
    blockReaderLive: modifierTexts.some((line) => ["perBlockChance", "blockChanceAbove"].includes(splitCondition(normalizeLineText(String(line.text ?? "")))?.condition.key)),
    worldWithinInputs: { resistances: Object.fromEntries((resistances?.entries || []).map((entry) => [entry.element, entry.effective])), totals: Object.fromEntries((resistances?.entries || []).map((entry) => [entry.element, entry.total])), armor: resourcePool(statTotals, "armor", 0, { defense: true }).value },
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
    // The player's movement speed in m/s (src/dummy-target.js playerMoveSpeed, user decision 2026-11-10): 6.5 m/s base × (1 + the stat
    // sheet's increased Movement Speed) × its additional factors; refined after the line resolver with the held conditional lines.
    movementSpeedAdditionalFactor: Number(statsByKey.movementSpeed?.additional) || 1,
    playerMoveSpeed: playerMoveSpeed({ increasedPercent: stat("movementSpeed"), additionalFactor: Number(statsByKey.movementSpeed?.additional) || 1 }),
    windStalker: windStalkerState({ heroId: state.hero.selectedHeroId, modifierTexts, hero: state.hero, moving: conditions.moving, prebuiltSelfBuffs: requestedConditions.prebuiltSelfBuffs !== false, movementSpeedPercent: stat("movementSpeed"), skillEffectDurationPercent: stat("skillEffectDuration"),
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
    // Each Blessing's layers (src/blessing-layers.js; blessing-layer-timers): a periodic-only Blessing's time shares for "at max" / "at least N" lines.
    blessingLayers: Object.fromEntries((earlyBlessings?.entries || []).filter((entry) => entry.layers).map((entry) => [entry.name, { reading: entry.layers.reading, maxStacks: entry.layers.maxStacks, peak: entry.layers.peak, shares: entry.layers.shares, own: entry.ownStacks || 0 }])),
    // Gear uniques round 2 (src/line-conditions.js): each Blessing's max stacks (Providential Grace) and the Max Spell Burst total,
    // read the way src/skill-hit-model.js reads it (Σ "+N Max Spell Burst"; Law of Greed).
    blessingMaxStacks: Object.fromEntries((earlyBlessings?.entries || []).map((entry) => [entry.name, entry.maxStacks])),
    maxSpellBurst: maxSpellBurstTotal(modifierTexts),
    beamActive: beam,
    // Grudge's Paralysis chance (src/support-effects.js family "paralysis") on each active, modeled skill hit, with that skill's
    // measured hit rate once the planner's first pass has it (calculatePlannerOnce debuffHitRates; src/combat-states.js).
    // Grudge's row (record 369609664) opens on trigger 1000030, your damage of the supported skill: its hits and its damage over time, one event
    // per server tick while the DoT ticks (wiring audit W2 gap 4; 8 T Thornfield audit G4, 2026-11-13), so a skill whose damage is only a DoT
    // (Path of Flames) holds it too; `dotTicksPerSecond` is that share of the event rate. Cripple's fissure stays on the fissure's hits.
    chanceParalysis: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (skillHitSources.some((source) => source.setupKey === setup.setupKey) || damageSources.some((source) => source.status === "modeled" && source.setupKey === setup.setupKey && source.profile?.engine === "skill-dot"))).flatMap((setup) => (setup.supportEffects?.paralysis || []).filter((clause) => !clause.fissure || skillHitSources.some((source) => source.setupKey === setup.setupKey)).map((clause) => ({
      setupKey: setup.setupKey, skill: setup.name, support: clause.support, source: clause.source, text: clause.text, level: clause.level, chancePercent: clause.chancePercent,
      // Cripple's fissure Paralysis needs no Curse and follows the fissure's own hit rate (Demolisher-gated).
      ...(clause.fissure ? { fissure: true, needsCurse: false } : {}),
      hitsPerSecond: debuffHitRates?.get(setup.setupKey)?.[clause.fissure ? "fissureHitsPerSecond" : "hitsPerSecond"] ?? null, firstHitSeconds: debuffHitRates?.get(setup.setupKey)?.firstHitSeconds ?? null,
      ...(clause.fissure ? {} : { dotTicksPerSecond: debuffHitRates?.get(setup.setupKey)?.dotTicksPerSecond ?? 0 })
    }))),
    // Tags of the active damage skills the build uses on the dummy (the beam and every modeled damage source), for "if you
    // have used a <Tag> Skill recently" (chunk 4).
    activeDamageTags: new Set([...(beam ? setups.find((setup) => setup.name === "Scorching Beam")?.tags || [] : []), ...damageSources.filter((source) => source.status === "modeled").flatMap((source) => setups.find((setup) => setup.setupKey === source.setupKey)?.tags || [])]),
    // Damage types dealt by Spell hits (the beam: Fire; spell skill hits: their dealt types), for "When a Spell hit inflicts
    // <Type> Damage" lines (gear-pact batch chunk 3).
    spellHitTypes: new Set([...(beam ? ["Fire"] : []), ...skillHitSources.filter((source) => (source.setup?.tags || []).includes("Spell")).flatMap((source) => sourceDealtTypes(source, dealtBySetup)).filter(Boolean)]),
    mainIsSpell: Boolean(resolvedMain && activeNames.has(resolvedMain.name) && (resolvedMain.tags || []).includes("Spell")),
    // The active Main Skill when it is an Attack (the revived Main Attack Skill family, src/line-conditions.js mainAttackCastsRecently).
    mainAttackSkill: resolvedMain && activeNames.has(resolvedMain.name) && (resolvedMain.tags || []).includes("Attack") ? { name: resolvedMain.name, sentry: (resolvedMain.tags || []).includes("Sentry"), channeled: (resolvedMain.tags || []).includes("Channeled") } : null,
    castsMelee: setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Melee")),
    // "when dealing Spell Damage" (trigger 1000030 with the Spell tag, game records 534745344 / 971831424): your own damage from a Spell skill,
    // its hits or its DoT; a Summon's Minions deal theirs (wiring audit W2 gap 7, 2026-11-03: a Spell-tagged summon held it before).
    // "when casting a Spell Skill" (1000069 with the Spell tag): a Spell you cast, a Spell summon included (it is cast, its Minions deal the damage).
    castsSpell: beam || skillHitSources.some((source) => (source.setup?.tags || []).includes("Spell")) || setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && setup.role === "main" && (setup.tags || []).includes("Spell")),
    dealsSpellDamage: beam || skillHitSources.some((source) => (source.setup?.tags || []).includes("Spell")) || damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "skill-dot" && activeNames.has(source.name) && (setups.find((setup) => setup.setupKey === source.setupKey)?.tags || []).includes("Spell")),
    elixirSkill: setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Elixir")),
    // Core audit B8: the active Elixir Skills (src/elixir-model.js) and Warcry Skills with their own cooldown clauses (Storm's
    // Command, src/storm-command.js).
    elixirSetups: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Elixir")).map((setup) => ({ name: setup.name, setupKey: setup.setupKey, level: setup.effectiveLevel, supportClauses: resolveSupportEffects(setup, { specialSupportConfigs: state.skills.specialSupportConfigs || {} }).clauses })),
    // Sage – Licorice Note (hero trait audit B8; src/sage-traits.js): Everlasting Nectar's Max Life / Mana bonuses (increased) and the
    // installed Empower / Curse Skills Pungent Stimulant Salt prepares.
    sageInputs: { maxLifeIncreasedPercent: Number(statsByKey.maxLife?.increased) || 0, maxManaIncreasedPercent: Number(statsByKey.maxMana?.increased) || 0, maxEnergyShield: maxEnergyShieldPool, skillEffectDurationPercent: stat("skillEffectDuration"),
      empowerSkills: empowerSkillsOnBoard,
      empowerModeled: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Empower") && EMPOWER_MODELED_SKILLS.has(setup.name)).map((setup) => setup.name),
      curseSkills: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Curse")).map((setup) => setup.name),
      // The bottles are Active slots 2 and 3 (node 2410; research/hero-sage-chunk1-2026-10-31.md).
      activeSlotElixirs: Object.fromEntries(skillBoardRows(setups.filter((setup) => setup.enabled !== false && setup.role !== "support"), state.skills.boardSlots, "skills").flatMap((row, index) => (row?.tags || []).includes("Elixir") ? [[index + 1, row.name]] : [])),
      // A saved non-Elixir skill in Active slot 2 or 3: the client's picker offers only Elixir Skills (tag 6000420) for the two Scent
      // Bottle slots (encrypted-scripts survey 2026-11-03, finding 5). It stays on the board as saved and is flagged, never a bottle Elixir.
      activeSlotNonElixirs: Object.fromEntries(skillBoardRows(setups.filter((setup) => setup.role !== "support"), state.skills.boardSlots, "skills").flatMap((row, index) => row?.name && (index === 1 || index === 2) && !(row.tags || []).includes("Elixir") ? [[index + 1, row.name]] : [])) },
    // Carino (hero trait audit B9; src/carino-traits.js): the active Projectile skills with a hit model, the increased Attack / Cast /
    // Projectile Speed (Reload Speed, Special Ammo reload chance), the supports on the skill panel (a Special Ammo support there is
    // not consumed) and every enabled skill's Noble supports (Royal Arsenal: expression case 0x58 counts them on all skills).
    carinoInputs: { projectileSetups: skillHitSources.filter((source) => (source.setup?.tags || []).includes("Projectile")).map((source) => ({ setupKey: source.setupKey, name: source.setup?.name || source.name })),
      attackSpeedIncreasedPercent: Number(statsByKey.attackSpeed?.increased) || 0, castSpeedIncreasedPercent: Number(statsByKey.castSpeed?.increased) || 0, projectileSpeedPercent: Number(statsByKey.projectileSpeed?.increased) || 0,
      installedSupportNames: setups.filter((setup) => !setup.traitReplaced).flatMap((setup) => (setup.supports || []).filter((support) => !support.granted).map((support) => support.name)),
      // Their levels: an ammo copy acts in place of a socketed one only above its level (src/carino-traits.js ammoOutlevels).
      installedSupports: setups.filter((setup) => !setup.traitReplaced).flatMap((setup) => (setup.supports || []).filter((support) => !support.granted).map((support) => ({ name: support.name, baseLevel: support.baseLevel, addedLevels: support.addedLevels || 0, effectiveLevel: support.effectiveLevel ?? support.level }))),
      activeNobleSupports: setups.filter((setup) => setup.enabled !== false && !setup.traitReplaced && !setup.itemReplaced).flatMap((setup) => (setup.supports || []).filter((support) => !support.granted && support.enabled !== false && refdataSupportCatalogSs13.find((entry) => entry.name === support.name)?.category === "noble").map((support) => support.name)) },
    // Rehan (hero trait audit B10; src/rehan-traits.js): the Main Skill (the Seething Spirit casts it), the character level ("per 1
    // levels"), Max Life / Energy Shield (Split Form, Hysteria), the Skill Area bonus (Uncontrolled Anger) and the weapon's Attack Speed
    // bonuses before the derived lines (Rampaging's share for the badges; the Burst source reads the final weapon model).
    rehanInputs: { main: resolvedMain && activeNames.has(resolvedMain.name) ? { setupKey: resolvedMain.setupKey, name: resolvedMain.name, tags: resolvedMain.tags || [] } : null, characterLevel: buildCharacterLevel(state),
      maxLife: resourcePool(statTotals, "maxLife", baseLife(characterLevelForPools)).value, maxEnergyShield: maxEnergyShieldPool, skillAreaPercent: stat("skillArea"), attackSpeed: weapon.attackSpeed || null },
    // Rosa – Unsullied Blade (hero trait audit B11; src/rosa-traits.js): Max Mana (Max Mercury Pts, Utmost Devotion's Mana consumed) and
    // the unsealed share of it (Mystic Mercury and Realm of Mercury read Unsealed Max Mana).
    rosaInputs: { maxMana: resourcePool(statTotals, "maxMana", baseMana(characterLevelForPools)).value, manaUnsealedPercent: manaRemaining },
    warcrySetups: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Warcry")).map((setup) => ({ name: setup.name, setupKey: setup.setupKey, cooldownClauses: (setup.supportEffects?.clauses || []).filter((clause) => clause.family === "cooldown" && Number.isFinite(clause.value)).map((clause) => ({ source: clause.source, text: clause.text, value: clause.value, additional: Boolean(clause.additional) })) })),
    minionsCrit: damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "minion"),
    // A modeled Minion whose skills carry the Spell tag (gear affix batch A: "Gains Spell Aggression when Minion Spells land a Critical Strike").
    minionSpellsCrit: damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "minion" && (MINION_PROFILES[source.profile.minionKey]?.skills || []).some((skill) => (skill.tags || []).includes("Spell"))),
    // Minions the build keeps out (gear affix batch A: "… when you have N Minion(s)"), per modeled Minion at its summon level.
    // Combo Points per Starter (gear affix batch B; the Combo condition lines read it): the build's lines plus a Combo skill's own
    // supports' "+N Combo Points gained from Combo Starters for the supported skill" (Recuperation; the same field 2012116), the largest
    // consumption of the enabled Combo skills (Combo Damage Enhancement 703848384 gates on field 2012104, the points the Finisher
    // consumed; 2026-11-08, research/build-7t-claim-audit-2026-11-08.md gap 1).
    comboPoints: skillHitSources.filter((source) => source.profile?.cycle && source.setup?.enabled !== false && activeNames.has(source.setup?.name))
      .map((source) => comboPointState(modifierTexts, (source.setup?.supportEffects?.combo || []).filter((line) => line.kind === "points")))
      .reduce((best, item) => item.consumed > best.consumed ? item : best, comboPointState(modifierTexts)),
    minionCount: minionsOut,
    troopMinionCount: troopMinionsOut,
    attackHits: skillHitSources.some((source) => source.profile.weaponScaling || (source.setup?.tags || []).includes("Attack")),
    anyHit: beam || skillHitSources.length > 0,
    // Active Spirit Magus summons and their levels, for Origin of Spirit Magus (src/origin-of-spirit-magus.js).
    // The buff kinds Dual Kismet: Three-Eyed Cat counts (chunk 13): an active Aura, a Focus (a Focus skill, or a kismet / memory that grants one), an Origin (a Magus summon, or a grant line).
    heldBuffKinds: {
      aura: setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Aura")),
      focus: setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Focus")) || modifierTexts.some((line) => /^(?:Gains|Has) Lv\. \d+ Precise: [\w ]+ Focus(?: Buff)?$/i.test(normalizeLineText(String(line.text ?? "")).trim())),
      origin: originGrants({ summons: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && /^Summon \w+ Magus$/.test(setup.name)), modifierTexts }).length > 0
    },
    spiritMagusSummons,
    twoHanded: Boolean(weapon.twoHanded),
    hitErosion: skillHitSources.some((source) => sourceDealtTypes(source, dealtBySetup).includes("Erosion")),
    // Active (activated) Tangles (src/tangle-model.js): attached to the dummy by the Tangle Skills, or every Tangle on the Clockwork
    // Core. Witch of the Night's "Gains 1 stack of Night Feather Entanglement for every 1 active Tangle" (kismet / pact audit 2026-10-21).
    activeTangles: tangles?.setups?.length ? (tangles.activated || 0) + tangles.setups.filter((setup) => setup.clockworkCore).reduce((sum, setup) => sum + (setup.activated || 0), 0) : 0,
    // Dormant Entanglement in the build (Malign Embrace's "for each activated Tangle" line is its added effect; F1 2026-10-27).
    dormantEntanglement: Boolean(tangles?.dormant?.present)
  };
  ENERGY_SHIELD_POOL_REBUILD.set(lineState, maxEnergyShieldPoolWith);
  return lineState;
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
    // Ill Omen on the Boss dummy (user decision 2026-11-13; src/ill-omen.js): once, its burst left out (no dummy Max Life).
    ...(planner.illOmen && !planner.illOmen.reapPurification?.active ? [{ id: "illOmen", value: "once (left out)", text: `${planner.illOmen.main.text} Ominous from ${planner.illOmen.ominousSource}; Cumulative Efficiency ${planner.illOmen.efficiency.percent}%${planner.illOmen.efficiency.capped ? " (capped at 100%)" : ""}.` }] : []),
    // Curse slots (user-confirmed 2026-10-19): skill bar curses in bar order, then gear, then pacts and other triggers.
    ...curseSlotAssumptions(planner),
    // Pressed skills sharing one action timeline (src/planner.js pressRotation, 2026-11-05).
    ...(planner.pressRotation?.assumptions || []),
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
    ...(planner.activationMediumTerra?.active ? [{ id: "dance:activationMediumTerra", value: planner.activationMediumTerra.additionalPercent, text: `Activation Medium: Terra (Silencing Severance): +${planner.activationMediumTerra.additionalPercent}% additional damage for the Main Terra Skill (hits and its own DoT); it triggers the skill when Terra Charge is at max with the dummy within ${planner.activationMediumTerra.triggerMeters} m (no use time); it seals ${planner.activationMediumTerra.sealPercent}% ${planner.activationMediumTerra.sealsLife ? "Life (Drenched Hem)" : "Mana"}, not reduced by Sealed Mana Compensation (user-confirmed 2026-10-13).` }] : []),
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
        const where = volley.override ? `set by you on the Config tab (best case ${volley.autoReached})` : volley.reach === "fan" ? (volley.nearTarget ? "a fan, standing close; the Distance condition flips it to one at range" : "a fan, standing at range (Distance condition)") : volley.reach === "half" ? "about half aim at the enemy" : "every one lands";
        const basis = component.basis === "observed" ? "observed: Chromatic Shot runs 2026-10-12" : "provisional";
        return { id: `shotgun:${hit.setupKey}:${component.key}`, value: volley.reached, text: `${hit.name} / ${component.label}: ${volley.reached} of ${volley.count} reach the dummy${volley.extraProjectiles ? ` (+${volley.extraProjectiles} projectiles from supports)` : ""} — ${where}. The first hits at 100% and each further one at ${Math.round(volley.factor * 100)}% (linear Shotgun Effect, ×${Math.round(volley.total * 1000) / 1000}; ${basis}).` };
      }),
      // The user's "Projectiles hitting the dummy" count (Config tab, 2026-11-12).
      hit.projectileLanding?.applied ? { id: `projectileHits:${hit.setupKey}`, value: hit.projectileLanding.landed, text: `${hit.name}: ${hit.projectileLanding.landed} of ${hit.projectileLanding.fired} projectiles hit the dummy (set by you; best case ${hit.projectileLanding.auto}).` } : null,
      hit.rate?.multistrike ? { id: `multistrike:${hit.setupKey}`, value: hit.rate.multistrike.expectedExtraAttacks, text: `${hit.name}: Multistrike ${hit.rate.multistrike.chancePercent}% → ${Math.round(hit.rate.multistrike.expectedExtraAttacks * 100) / 100} extra attacks per attack, +${hit.rate.multistrike.incrementPercent}% per Multistrike count (provisional).` } : null,
      hit.rate?.spellBurst ? { id: `spellBurst:${hit.setupKey}`, value: hit.rate.spellBurst.maxSpellBurst, text: `${hit.name}: Spell Burst ${hit.rate.spellBurst.maxSpellBurst} stack(s), fully charged in ${Math.round(hit.rate.spellBurst.fullChargeSeconds * 1000) / 1000} s ${hit.rate.spellBurst.chargeSpeed?.refill ? `on average (the regular charge ${hit.rate.spellBurst.chargeSpeed.refill.regularSeconds} s, 2 s ÷ (1 + Charge Speed) ÷ Π(1 + additional), game manual, refilled by ${hit.rate.spellBurst.chargeSpeed.refill.lines.map((line) => line.source).join(", ")} on ${Math.round(hit.rate.spellBurst.chargeSpeed.refill.usesPerSecond * 100) / 100} uses/s of yours: a 30 Hz walk of the charge, src/spell-burst-refill.js, provisional)` : "(2 s ÷ (1 + Charge Speed) ÷ Π(1 + additional), game manual)"}, activated every ${Math.round(100 / hit.rate.spellBurst.activationsPerSecond) / 100} s = max(charge time, use interval); each activation is the activating cast + ${hit.rate.spellBurst.automaticCastsPerActivation} automatic cast(s), all cast by Spell Burst (game manual). User-confirmed 2026-10-12: automatic casts neither take up nor add to manual cast time; the period is not rounded up to whole use intervals; additional Charge Speed shortens the charge time.` } : null
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
  // The resolved condition: the "Hit recently" group may have chosen Not hit recently (src/planner.js exclusiveConditionGroups).
  const on = planner.conditions?.blockedRecently ?? requestedCombatConditions(planner.state?.combat || {}).blockedRecently !== false;
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
  // Centralize (Ronin core) "Consumes half of current Fervor Rating when hit" (src/combat-states.js): best case not hit, its own
  // switch, separate from "Hit or blocked recently". Game recipe 570574 (user decision 2026-10-25): being hit halves the Rating; the
  // "-0.8% additional damage" is additional damage taken from hits (a defence), so the switch now only decides the Fervor halving.
  const centralize = planner.lineEffects?.combat?.centralize;
  if (centralize?.hasFervor) {
    const on = requested.centralizeNotHit !== false;
    const hitText = `${centralize.fixed ? `hit: the fixed ${centralize.heldRating} Fervor Rating refuses the halving (game code 0x14207caf0: no change while a fixed value is held), nothing consumed, ${centralize.rating} left for every Fervor reader` : `hit at ${centralize.heldRating} Fervor Rating: ${centralize.consumed} consumed, ${centralize.rating} left for every Fervor reader (provisional)`}; its "-${centralize.perPointPercent}% additional damage" line is damage taken from hits (game recipe 570574), a defence`;
    items.push({ id: "condition:centralizeNotHit", toggle: "centralizeNotHit", label: "Centralize: not hit (no Fervor consumed)", on, value: on, note: on ? "Best case: not hit, so no Fervor Rating is consumed" : `Off: ${hitText}`,
      text: `Centralize (${centralize.sources.join(", ")}): ${on ? "not hit (best-case assumption: being hit halves the Fervor Rating), no Fervor Rating consumed; its damage line is a defence (game recipe 570574: additional damage taken from hits)" : hitText}.` });
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
  // The Life balance (src/life-balance.js, 2026-11-11 build audit G4): listed when the build consumes a share of current Life.
  const consumption = planner.lineEffects?.state?.resourceConsumption;
  const balance = planner.lineEffects?.state?.lifeBalance;
  if (balance?.settled || consumption?.attackConsume || consumption?.skillConsume || consumption?.spiritConsume || (consumption?.skills || []).some((skill) => skill.currentLifePercent > 0)) {
    const on = requested.lifeBalance !== false;
    const pinnedLow = planner.lineEffects?.state?.lowLifeAssumed;
    items.push({ id: "condition:lifeBalance", toggle: "lifeBalance", label: "Current Life from the Life balance (consumes against Regain)", on, value: Boolean(balance?.settled),
      note: !on ? "Off: the Life group's Full Life / Low Life choice (every consume reads Max Life or 35%)" : balance?.settled ? `Settled: ${balance.useWeightedLifePercent}% current Life at your uses (consumes read ${balance.consumeWeightedLifePercent}%), Low Life on ${Math.round(balance.lowLifeShare * 10000) / 100}% of uses` : pinnedLow ? "Not applied: Low Life is pinned (the Life group)" : `Not applied: ${planner.lineEffects?.state?.lifeBalanceSkipped || "the uses are measured by the hit pass"}`,
      text: `Life balance: ${!on ? "switched off; the Life group decides current Life" : balance?.settled ? `${balance.text} (frame model from the SS14 client; the Restoration Over Time duration and the Regain gate's denominator are inferred: open questions life-balance-restoration-duration, life-balance-regain-gate)` : pinnedLow ? "Low Life is pinned on the Config tab, so every consume reads 35% of Max Life" : `not settled: ${planner.lineEffects?.state?.lifeBalanceSkipped || "no measured uses"}; the Life group decides current Life`}.` });
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
  // Ill Omen (user decision 2026-11-13: once on the Boss dummy, left out with no dummy Max Life; src/ill-omen.js): a best-case switch only for
  // Reap Purification's provisional continuous reading. Without it the recount assumptions state the once-only rule (withRecountConditionAssumptions).
  if (planner.illOmen?.reapPurification?.active) items.push({ id: "condition:illOmen", toggle: "illOmen", label: "Ill Omen with Reap Purification (every stack, a Boss included)", on: requested.illOmen !== false, value: planner.illOmen.main.applied, note: requested.illOmen === false ? off : `Best case: ${planner.illOmen.main.short || "Reap Purification"} (provisional)`, text: `${planner.illOmen.main.text} Ominous from ${planner.illOmen.ominousSource}; Cumulative Efficiency ${planner.illOmen.efficiency.percent}%${planner.illOmen.efficiency.capped ? " (capped at 100%)" : ""}.` });
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
    const held = `${command.perSecond} Command per second against a return of ${command.returnPerSecond} + 0.7 per point holds ${command.points} Command`;
    items.push({ id: "condition:fullCommand", toggle: "fullCommand", label: "Command held (Command per second)", on, value: on && command.value > 0, note: on ? `${held}, +${command.value}% additional damage for Synthetic Troop Minions (game attrs 3620, 3621)` : "Off: no Command held",
      text: `Command (${command.sources.map((item) => item.source ?? item).join(", ")}): ${on ? `${held} × 3% = +${command.value}% additional Synthetic Troop Minion damage (game attrs 3620, 3621, manual 1001011927; the per-point return is inferred from Circle of Life's record)` : "no Command held (condition off)"}.` });
  }
  // Storm's Command (core audit B8, src/storm-command.js): each Warcry on the board cast whenever its cooldown is ready.
  const warcry = planner.lineEffects?.combat?.warcry;
  if (warcry?.hasWarcries) {
    const on = requested.warcriesOnCooldown !== false;
    items.push({ id: "condition:warcriesOnCooldown", toggle: "warcriesOnCooldown", label: "Warcries cast on cooldown (Storm's Command)", on, value: Boolean(warcry.active), note: on ? (warcry.active ? `Best case: ${warcry.count} different Warcries cast in the last ${warcry.windowSeconds} s, +${warcry.value}% additional Attack Damage` : `Not applied: ${warcry.reason}`) : "Off: no Warcry cast, no Storm's Command bonus",
      text: `Storm's Command (${warcry.sources.join(", ")}): ${warcry.reason}. The Warcries' own casts are not taken from the main skill's time.` });
  }
  // Cruelty / Precise: Cruelty (skill-mechanics census batch 2; src/aura-effects.js auraOwnStackEffect): the Aura's own stacks.
  const crueltyAuras = (planner.aura?.entries || []).filter((entry) => entry.context !== "town" && /^(?:Precise: )?Cruelty$/.test(entry.name));
  if (crueltyAuras.length || (planner.aura?.entries || []).some((entry) => /^(?:Precise: )?Cruelty$/.test(entry.name))) {
    const on = requested.crueltyStacks !== false;
    const held = crueltyAuras.find((entry) => entry.ownStackEffect);
    items.push({ id: "condition:crueltyStacks", toggle: "crueltyStacks", label: "Cruelty stacks held at the cap", on, value: Boolean(held), note: on ? (held ? `Best case: ${held.ownStackEffect.stacks} stacks × ${held.ownStackEffect.perStackPercent}% = ×${Math.round(held.ownStackEffect.factor * 1e4) / 1e4} additional Aura Effect` : "Not applied") : "Off: no stacks (the Aura's base effect only)",
      text: `Cruelty stacks (game affix 50355540; provisional): ${on ? `${held ? held.ownStackEffect.stacks : 40} stacks held (${held ? held.ownStackEffect.chancePercent : 40}% chance for ${held ? held.ownStackEffect.stacksPerGain : 5} stacks per hit on an Elite; the dummy is a Boss), +${held ? held.ownStackEffect.perStackPercent : 2.5}% additional Aura Effect each, one term` : "none (condition off)"}.` });
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
      // A group whose lines the build does not carry is never compared (its pin, a stored switch, applies as before).
      if (group.present && !group.present(planner)) continue;
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
      // The winning candidate is the same pass as a recompute with chosenOverrides (same inputs); only its display-only tail (the 5 s
      // variation and the recount timeline), skipped in the comparison, still has to run (planner performance 2026-11-08).
      planner = best.planner === planner ? planner : withDisplayTail(best.planner);
      assumptions.push({ group: group.label, chosen: best.label, best: best.label, compared });
    }
  }
  // Follower buffs the build cannot use (no damage over time / Spell damage / Steep Strike hit) are listed as not applied.
  try { settleFollowerBuffs(planner, plannerEngines(planner)); } catch (error) { planner.warnings.push(`Follower buffs could not be settled (${error?.message || error}).`); }
  // The tick engine drives the recount timeline and the 5 s / 20 s windows (chunk 15, 2026-11-01; src/tick-recount.js): once, on the
  // final pass only. The comparison passes above keep the steady windows, so the exclusive-condition choice stays cheap.
  try { planner = driveWithTickEngine(planner); } catch (error) { planner.warnings.push(`Tick engine recount could not be run (${error?.message || error}); the planner's own recount timeline is shown.`); }
  let dummyRecount = null;
  try { dummyRecount = withRecountConditionAssumptions(planner.dummyRecount, assumptions, planner); } catch (error) { planner.warnings.push(`Dummy recount assumptions could not be listed (${error?.message || error}).`); }
  let bestCase = [];
  try { bestCase = bestCaseAssumptions(planner); } catch (error) { planner.warnings.push(`Best-case assumptions could not be listed (${error?.message || error}).`); }
  // Each skill's uptime for its hover tooltip (display only, src/skill-uptime.js; user request 2026-11-15): read from this result.
  let uptime = {};
  try { uptime = skillUptimeOf(planner); } catch (error) { planner.warnings.push(`Skill uptimes could not be listed (${error?.message || error}).`); }
  // With the "Hit recently" choice on the Config tab, the "Hit or blocked recently" switch would be a second control on the same key.
  if (assumptions.some((item) => item.group === "Hit recently")) bestCase = bestCase.filter((item) => item.toggle !== "blockedRecently");
  return { ...planner, assumptions, dummyRecount, bestCaseAssumptions: bestCase, skillUptime: uptime };
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
    // The Monte Carlo variation and the recount timeline are display-only, so the comparison skips them; the caller runs them on a
    // winning alternative only (withDisplayTail).
    const candidate = calculatePlannerOnce(state, { ...chosenOverrides, ...option.overrides }, { skipVariation: true, deferDisplayTail: true });
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

// A comparison pass's display-only tail, kept off the result (calculatePlannerOnce deferDisplayTail): planner → () => the planner as a
// full pass would have returned it.
const displayTails = new WeakMap();
function withDisplayTail(planner) {
  const run = displayTails.get(planner);
  if (!run) throw new Error("withDisplayTail: the pass carries no deferred display tail");
  displayTails.delete(planner);
  return run();
}

function calculatePlannerOnce(input, conditionOverrides = {}, { skipVariation = false, debuffHitRates = null, hitRateFacts = null, deferDisplayTail = false } = {}) {
  const requestedSkipVariation = skipVariation;
  // The damage types each modeled hit really deals, measured by the hit pass (null on the first pass: the profiles' types are read).
  // The press rotation the hit pass's rates set (pressRotation; null on the first pass).
  let pressRotationState = null;
  const dealtBySetup = hitRateFacts?.bySetup ? new Map([...hitRateFacts.bySetup].filter(([, facts]) => Array.isArray(facts?.dealtTypes) && facts.dealtTypes.length).map(([key, facts]) => [key, facts.dealtTypes])) : null;
  const validState = normalizePlannerState(input);
  // Removed Advanced fields (2026-11-12): a saved value no longer applies; the default is read (src/combat-condition-mode.js).
  const removedDefaultsCombat = withRemovedCombatDefaults(validState.combat);
  const normalizedState = removedDefaultsCombat === validState.combat ? validState : { ...validState, combat: removedDefaultsCombat };
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
  // Thea's Prophecy of Revelation (picked with its slot memory) replaces talents on the 4th activated panel (src/prophecy-of-revelation.js).
  // A trait level of 0 means no lines, and level lines never lift a slot from 0, so the trait lines at no bonus settle it.
  const prophecyOfRevelation = state.hero?.selectedHeroId === "thea-wisdom-of-the-gods" && prophecyOfRevelationInLines(heroTraitStatLines(state, heroMemories.baseTraitLevel, { all: 0, nonBase: 0 }, { artificialMoon: heroMemories.artificialMoon }));
  const talent = resolveTalentCandidate(talents, catalogue, state.talentRanks, state.talents, { prophecyOfRevelation });
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
  // Shielded (buff 353, held while a Shield is in the off-hand: "+15% Defense", "-5% additional Movement Speed"; src/held-weapon-buffs.js,
  // 2026-11-09): your own buff, town and combat (the 25 T panel's Armor Bonus hover lists it under Buff).
  modifierTexts.push(...heldWeaponBuffLines(equipment, state.disabledEquipmentSlots || []));
  // "When you have no Energy Shield" (Dual Kismet: Hatch Out, game affix 916287744, gate 217 Not): Max Energy Shield 0 from the stat lines
  // ("Your Max Energy Shield is fixed at 0" included; src/sealed-mana-compensation.js). Read once, only when a gated line asks.
  let energyShieldGateState = null;
  const noEnergyShieldGate = () => {
    if (energyShieldGateState) return energyShieldGateState;
    const totals = characterStatTotals({ modifierTexts, state, heroMemories, equipment });
    return (energyShieldGateState = energyShieldGate(resourcePool(totals, "maxEnergyShield", 0, { defense: true, extra: { flat: perAttributePoolLines(modifierTexts, totals).maxEnergyShield } })));
  };
  // Dual Kismet: Hatch Out's "-5 to Aura Skill Level" (game affix 916287744: field 2006400 = p0 on the Aura tag 6000160, behind the same gate
  // as its +30% Sealed Mana Compensation): a level source for Aura skills while the build has no Energy Shield (2026-11-05). Kismet lines are
  // not level sources otherwise (src/skill-level-bonuses.js reads gear, talents and slates).
  // Pact spirit lines are skill level sources too (G6, 2026-11-12; research/build-10t-iris2-erosion-magus-audit-2026-11-12.md): Scale of
  // Original Sin's "+2 Spirit Magus Skill Level" (record 557054: field 2006400 on the Spirit Magus tag 6000330) is the same write as the
  // talent's "+1 Spirit Magus Skill Level". Kismet lines stay out (Hatch Out's gated level below; "-3 to Defensive Skill Level" unread).
  levelSources.pacts = modifierTexts.filter((line) => line.origin === "pact");
  levelSources.gatedLevels = pageSealedManaCompensation(modifierTexts, { noEnergyShield: () => noEnergyShieldGate().none }).gated.filter((entry) => entry.active && entry.auraLevels).map((entry) => ({ name: entry.source, text: entry.text, levels: entry.auraLevels, tag: "Aura", note: "no Energy Shield (game affix 916287744, gate 217 Not)" }));
  // Recipe step 3 (2026-10-25, research/recipe-interpreter-step1-2026-10-25.md §15; src/recipe-hit-aggregates.js): the crit and cast-rate
  // ledgers read each line's game recipe where it places the line (TLI_CRIT_PATH / TLI_SPEED_PATH=text keep the text readers).
  const critAdjust = critRecipeAdjuster({ modifierTexts, heroMemories, critLineReading });
  const speedAdjust = speedRecipeAdjuster({ modifierTexts, heroMemories });
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
  // Item-granted Main Skills (True Flame Immolation, Barrier Burst; src/item-main-skill-replacement.js) join the lookup, so the
  // support filter reads their stone tags; they are not in the skill picker's catalog.
  const catalogSkillsByName = new Map([...refdataSkillCatalogSs13.map((entry) => [entry.name, entry]), ...Object.values(ITEM_GRANTED_SKILLS_SS14).map((entry) => [entry.name, entry])]);
  const catalogSupportsByName = new Map(refdataSupportCatalogSs13.map((entry) => [entry.name, entry]));
  // Supports item lines grant to the Main Skill (src/gear-unique-modules.js; gear-pact batch chunk 4): "The Main Skill is
  // supported by Lv. N X" and Lonesome's single-Ring grant. They join the first enabled main setup at their fixed level and
  // take no support slot. Cataclysm on Scorching Beam keeps its Ignite-ledger path (build-mechanics grantedSupports).
  const itemGrantedSupports = grantedMainSkillSupports(modifierTexts, equipment, state.disabledEquipmentSlots);
  // "Replaces the Main Skill with Lv. N <Skill>" (Immolating World, Necklace of Firebird; src/item-main-skill-replacement.js): the
  // granted skill holds Active slot 1, so the Main Skill support grants land on it (applied below) and on no user setup.
  const itemMainGrant = itemMainSkillGrants(modifierTexts).some((grant) => grant.known);
  const grantTargetKey = itemMainGrant ? null : (() => { const target = setupSources.find((item) => item.role === "main" && state.skills.setupEnabled?.[item.instanceId || item.name] !== false); return target ? target.instanceId || target.name : null; })();
  // Empty skill-board slots for "+N … Skill Level for each empty … Skill Slot" (Necklace of Inverse; src/skill-level-bonuses.js):
  // the board holds 5 skill slots and 4 Aura slots (src/skill-board-slots.js); the Aura slots stand for the Passive Skill slots.
  const boardEnabled = setupSources.filter((item) => state.skills.setupEnabled?.[item.instanceId || item.name] !== false);
  // The Aura-slot rows in board order (row 0 = the first Passive Skill slot), for row-scoped passive grants (Headless Crown).
  const passiveBoardRows = skillBoardRows(boardEnabled.map((item) => ({ ...item, setupKey: item.instanceId || item.name, enabled: true })), state.skills.boardSlots, "auras");
  // A trait skill (src/trait-board-grants.js: Youga's Stasis Vault, Supreme Descent, Selves of All Realms) fills its Active
  // Skill slot, so a slot the user left empty is no longer empty.
  const traitGrantLines = traitBoardGrantLines(modifierTexts);
  const userActiveRows = skillBoardRows(boardEnabled.map((item) => ({ ...item, setupKey: item.instanceId || item.name, enabled: true })), state.skills.boardSlots, "skills");
  const traitFilledRows = (traitGrantLines.slots.length ? emptyRowsFilledByGrants(traitGrantLines, userActiveRows) : 0) + (itemMainGrant && !userActiveRows[0] ? 1 : 0);
  levelSources.emptySkillSlots = { passive: Math.max(0, 4 - boardEnabled.filter((item) => setupBoardTab(item) === "auras").length), active: Math.max(0, 5 - boardEnabled.filter((item) => setupBoardTab(item) === "skills" && item.role !== "support").length - traitFilledRows) };
  // Levels a line derives from the resistances or the sealed Life (chunk 12, src/skill-level-bonuses.js): the first pass's figures.
  levelSources.levelFacts = hitRateFacts?.levelFacts || null;
  // A skill an item (or a support) triggers takes the build's skill level lines from its printed level (user decision 2026-11-16;
  // src/item-triggered-skills.js triggeredSkillLevel): All Skills, Active and its own tag levels, as an active skill that is not the Main
  // Skill. TOWER Sequence and hero trait lines keep the printed level. `line` is the triggering line (null: no line, e.g. a support's record).
  const itemSkillLevel = (name, level, line = null, tags = null) => triggeredSkillLevel({ level, fixed: isFixedLevelTriggerLine(line),
    bonus: skillLevelBonus({ name, role: "item-trigger", tags: tags || catalogSkillsByName.get(name)?.tags || [], isMainSkill: false }, levelSources) });
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
    const supports = [...ownSupports.filter((support) => !grants.some((grant) => grant.name === support.name)), ...grants.map((grant) => ({ name: grant.name, level: grant.level, granted: true, grantSource: grant.source, grantText: grant.text, ...(grant.fixedLevel ? { fixedLevel: true } : {}) }))].map((support) => {
      const key = `${setupKey}:${support.name}`;
      const defaultConfig = defaultConfigurableSupportConfig(support.name, support.effects);
      const savedConfig = normalizeProgressionSupportConfig(support.name, state.skills.specialSupportConfigs[key]);
      const specialConfig = defaultConfig ? { ...defaultConfig, ...(Number.isFinite(support.stars) ? { stars:support.stars } : {}), ...(savedConfig || {}) } : savedConfig;
      const baseLevel = support.granted ? support.level : clampBaseLevel(state.skills.supportLevels[key] ?? support.level ?? 1);
      // An item grant starts at its printed level and takes the build's support level lines like a socketed support (user decision
      // 2026-10-27, in-game panel: the neck's Lv. 10 Wind Projectiles shows its Lv20 value with the build's +10; replaces the
      // 2026-10-13 fixed-level rule). TOWER Sequence grants stay fixed (`fixedLevel`; user decision 2026-10-27, for now).
      const sourceBonus = support.fixedLevel ? { total: 0, contributions: [] } : skillLevelBonus({ ...support, role: "support", tags: ["Support", ...(catalogSupportsByName.get(support.name)?.tags || [])] }, levelSources);
      const leveled = { ...support, level: baseLevel, baseLevel, addedLevels: sourceBonus.total, effectiveLevel: baseLevel + sourceBonus.total };
      const effects = supportEffectsAtLevel(leveled, catalogSupportsByName.get(support.name));
      if (progressionSupportTierData(support.name) && specialConfig) effects.push(`Configured T${specialConfig.tier} affix: ${progressionSupportText(support.name,specialConfig)}`);
      return { ...leveled, effects, levelBonusSources: sourceBonus.contributions, enabled: support.granted ? true : state.skills.supportEnabled[key] ?? true,...(specialConfig ? { specialConfig, tier: specialConfig.tier, roll: specialConfig.roll, ...(Number.isFinite(specialConfig.stars) ? { stars: specialConfig.stars, starAdditionalDamagePercent: specialSupportStarBonus(specialConfig.stars) } : {}) } : {}) };
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
  // The Main Skill for the "Main Skill Level" lines (game records 101080104, 404339744, 183539: field 2006400 on Main Skill 6020000;
  // 2026-11-15): resolvedMain below, which is known only after the levels, picks the item-granted Main Skill, else the first enabled
  // main-role setup in setup order (every enabled setup is counted for Energy, 2026-10-21), else the first one. The same pick here; another setup takes none.
  const levelSetupOrder = state.skills.setupOrder || setupSources.map((item) => item.name);
  const levelOrderIndex = (item) => { const key = item.instanceId || item.name; const at = levelSetupOrder.indexOf(key); return at >= 0 ? at : levelSetupOrder.indexOf(item.name) < 0 ? 999 : levelSetupOrder.indexOf(item.name); };
  const levelMainKey = itemMainGrant ? null : (() => { const ordered = setupSources.map((item, index) => ({ item, index })).filter(({ item }) => (item.role || catalogSkillsByName.get(item.name)?.role) === "main").sort((a, b) => levelOrderIndex(a.item) - levelOrderIndex(b.item) || a.index - b.index).map(({ item }) => item); const target = ordered.find((item) => state.skills.setupEnabled?.[item.instanceId || item.name] !== false) || ordered[0]; return target ? target.instanceId || target.name : null; })();
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
    // Tags the enabled supports give the skill (game filter `adds`, src/support-compatibility.js supportAddedTagNames; 2026-11-02:
    // Chromatic Shot: Condensed Cold → Cold, so "Cold Skill" lines and "+N Cold Skill Level" reach it). Every later reader of
    // the setup's tags (levels, tag-scoped lines, the hit model) sees them; the support filter keeps reading the catalog skill.
    const supportAddedTags = catalogSkillsByName.has(setup.name) ? supportAddedTagNames({ ...catalogSkillsByName.get(setup.name), tags: setup.tags || [] }, supports) : [];
    // The tags they take away (game filter `removes`; Focused Slash: Behead removes Area; wiring audit gap 7, 2026-11-03).
    const supportRemovedTags = catalogSkillsByName.has(setup.name) ? supportRemovedTagNames({ ...catalogSkillsByName.get(setup.name), tags: setup.tags || [] }, supports) : [];
    const setupTags = supportAddedTags.length || supportRemovedTags.length ? [...(setup.tags || []), ...supportAddedTags].filter((tag) => !supportRemovedTags.includes(tag)) : setup.tags;
    const slots = occupiedSlots.filter(Boolean).length;
    const baseLevel = clampBaseLevel(levels.baseLevel ?? setup.baseLevel);
    // Minion / Synthetic Troop / Spirit Magus Skill Level (talent batch chunk 4; user decision 2026-10-22 for Minion: it raises every
    // Summon skill, src/skill-level-bonuses.js): the level of the skill that summons a modeled Minion of that family (modules count
    // as Synthetic Troops), via its tags.
    const summoned = inferDamageProfile(setup);
    const minionFamily = summoned?.engine === "minion" ? (MINION_PROFILES[summoned.minionKey]?.family || null) : null;
    const levelTags = minionFamily ? [...(setupTags || []), "Minion", ...(minionFamily === "module" ? ["Synthetic Troop"] : minionFamily === "spirit-magus" ? ["Spirit Magus"] : [])] : setupTags;
    // Iris 1 / 2: a Spirit Magus in an active skill slot also takes "+N Active Skill Level" lines (user-confirmed 2026-10-19;
    // src/magus-active-slot.js magusTakesActiveSkillLevels). An Aura-slot Magus does not; other heroes leave the setup inactive.
    const activeSlotMagus = magusTakesActiveSkillLevels(setup, state.hero?.selectedHeroId);
    const sourceBonus = skillLevelBonus({ ...setup, tags: levelTags, activeSlotMagus, isMainSkill: setupKey === levelMainKey }, levelSources);
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
    // Module affixes (Programs / Protocols; src/module-protocols.js, 2026-10-28): the setup's saved rows, read by the Minion model.
    const moduleAffixes = savedModuleAffixes(state.skills.moduleProtocols, setupKey, setup.name);
    return { ...setup, ...(supportAddedTags.length || supportRemovedTags.length ? { tags: setupTags, supportAddedTags, ...(supportRemovedTags.length ? { supportRemovedTags } : {}) } : {}), setupKey, baseLevel, addedLevels, ...(activeSlotMagus ? { activeSlotMagus } : {}), ...(moduleAffixes.length ? { moduleAffixes } : {}), levelBonusSources:sourceBonus.contributions, effectiveLevel: baseLevel + addedLevels, supports, enabled: state.skills.setupEnabled[setupKey] !== false, enabledSupportSlots: slots, occupiedSupportSlots: occupiedSlots, energyCost: energyCostForSupportPositions(setup.role, occupiedSlots, profile) };
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
  // Item Main Skill replacement (src/item-main-skill-replacement.js; 2026-10-26): the granted skill takes Active slot 1 at the item's
  // level + the build's skill level lines (2026-10-28, in-game panel); the user's row-0 setup stays saved and is marked `itemReplaced`. Its supports are the slot's (user-confirmed
  // 2026-10-26 (in game): the Main Skill slot's supports carry over; the replaced setup's
  // key; `item:<skill>` for an empty slot), filtered by the game tag filter on the granted stone; the Main Skill support grants
  // ("The Main Skill is supported by Lv. N X") join it at their fixed level.
  const itemReplacement = applyItemMainSkillReplacement({ setups, boardSlots: state.skills.boardSlots, modifierTexts, profile, resolveGrantedSupports: (granted, supportsKey, replaced) => {
    const saved = replaced ? setupSources.find((item) => (item.instanceId || item.name) === supportsKey) : null;
    const raw = saved ? { ...(catalogSkillsByName.get(saved.name) || {}), ...saved } : null;
    const ownSupports = [...(raw?.supports || []), ...(state.skills.customSupports[supportsKey] || [])];
    const grants = itemGrantedSupports.filter((grant) => !["passive", "tag"].includes(grant.target) && grant.active && catalogSupportsByName.has(grant.name) && !ownSupports.some((support) => support.name === grant.name && (support.level ?? 1) >= grant.level));
    return resolveSetupSupports(granted, supportsKey, ownSupports, grants, replaced?.enabledSupportSlots ?? null);
  }, resolveLevel: (granted) => skillLevelBonus({ ...granted, isMainSkill: true }, levelSources) });
  if (itemReplacement.summary?.grant) setups.splice(0, setups.length, ...itemReplacement.setups);
  const traitBoard = applyTraitBoardGrants({ setups, boardSlots: state.skills.boardSlots, supportOrder: state.skills.supportOrder, modifierTexts, catalogSkillsByName, profile, resolveGrantedSupports });
  if (traitBoard.summary) setups.splice(0, setups.length, ...traitBoard.setups);
  const energy = calculateAvailableEnergy(equipment.allItems, state.disabledEquipmentSlots, profile.nonEquipmentEnergy);
  // "+N Max Energy" (Effortless Command, server affix 10014 on row 1204411023; chunk 5, 2026-11-01).
  energy.available += modifierTexts.reduce((sum, line) => sum + Number(String(line.text).match(/^\+(\d+) Max Energy$/i)?.[1] ?? 0) * (line.multiplier ?? 1), 0);
  // Energy never switches a setup off (user decision 2026-10-21; src/engine.js allocateSkillEnergy): every enabled setup is
  // counted and a setup past the budget only carries the "insufficient Energy" warning. The Main Skill is walked first, so the
  // warnings fall on the other setups: the setup in Active slot 1 when it is a main-role skill, else the board's first main-role
  // skill, else the first enabled main-role setup. (2026-10-15 to 2026-10-21 only the Main Skill was kept on; before that a
  // game-log import with no gear Energy switched its Main Skill off.)
  const energyPriorityIndex = (() => {
    const eligible = (setup) => Boolean(setup) && setup.enabled !== false && setup.role === "main" && !setup.traitGranted;
    const main = setups.find((setup) => setup.itemGranted && eligible(setup)) || skillBoardRows(setups, state.skills.boardSlots, "skills").find(eligible) || setups.find(eligible);
    return main ? setups.indexOf(main) : null;
  })();
  const allocation = allocateSkillEnergy(setups, energy.available, { priorityIndex: energyPriorityIndex });
  // Lich's Dirge (Pantheon's Elegy; legendary audit batch 1, 2026-10-22): "+2% Aura Effect for each non-Exclusive Support Skill
  // equipped" counts the enabled supports on the enabled skill-board setups whose catalog entry is not Exclusive (exclusiveFor).
  const nonExclusiveSupports = setups.filter((setup) => setup.enabled !== false).flatMap((setup) => (setup.supports || []).filter((support) => support?.name && support.enabled !== false && !catalogSupportsByName.get(support.name)?.exclusiveFor)).length;
  const activeNames = new Set(allocation.allocations.filter((entry) => entry.counted).map((entry) => entry.name));
  // Tyrant's Smoldering Hold (chunk 12): node 243 on the Empower tag 6001230. The corroded "Unable to use Empower Skills" (327066880) sets bCannotCastOtherThanTrigger, so only an
  // Empower an Activation Medium triggers is cast; the uncorroded "Unable to trigger Empower Skills" (993987840) sets bCannotTrigger, so a triggered one is not, and a pressed one is.
  const empowerRule = (pattern) => modifierTexts.some((line) => pattern.test(String(line.text ?? "").trim()));
  const noManualEmpower = empowerRule(/^Unable to use Empower Skills$/i), noTriggeredEmpower = empowerRule(/^Unable to trigger Empower Skills$/i);
  if (noManualEmpower || noTriggeredEmpower) for (const setup of setups) {
    if (!(setup.tags || []).includes("Empower") || setup.role === "support") continue;
    const triggered = (setup.supports || []).some((support) => support?.enabled !== false && /^Activation Medium/.test(support?.name || ""));
    if (triggered ? noTriggeredEmpower : noManualEmpower) activeNames.delete(setup.name);
  }
  // A granted Aura is always active (user-confirmed 2026-10-13). The board's own copy of the same Aura, when it is active too,
  // is compared with the granted one in the Aura ledger below; otherwise (switched off on the board) the granted copy stands in.
  // activeNames carries the name either way; the board reads its own allocation, not this set.
  const boardActiveAuraNames = new Set(setups.filter((setup) => setup.role === "aura" && setup.enabled && activeNames.has(setup.name)).map((setup) => setup.name));
  for (const setup of grantedAuraSetups) activeNames.add(setup.name);
  const activation = { profile, setups, energy, allocation, activeNames, traitBoard: traitBoard.summary, itemMainSkill: itemReplacement.summary };
  // Damage sources: every enabled setup that deals damage, with its profile and modeling status
  // (src/skill-damage-profiles.js). Scorching Beam keeps its calibrated path below; skills whose own
  // damage is a DoT status (Wilting Beam) go through src/skill-dot-model.js; the rest are listed as
  // "damage not modeled". The enabled main-role setup is the build's main skill.
  // A trait skill (Supreme Descent has the catalog's "main" role) is never the build's Main Skill.
  const mainCandidates = setups.filter((setup) => !setup.traitGranted);
  // An item-granted Main Skill (src/item-main-skill-replacement.js) is the Main Skill whenever it is applied.
  const resolvedMain = mainCandidates.find((setup) => setup.itemGranted && setup.enabled) || mainCandidates.find((setup) => setup.role === "main" && setup.enabled && activeNames.has(setup.name)) || mainCandidates.find((setup) => setup.role === "main" && setup.enabled) || mainCandidates.find((setup) => setup.role === "main") || null;
  // Other active skills pressed on the dummy (src/press-schedule.js; Config switch castOtherSkills, default on): the first pass classifies
  // them (hitRateFacts.pressInputs); off, nothing shares the Main Skill's time (the Groundshaker rotation included).
  pressRotationState = pressRotation({ setups, mainKey: resolvedMain?.setupKey ?? null, bySetup: hitRateFacts?.bySetup ?? null, inputs: hitRateFacts?.pressInputs ?? null, main: hitRateFacts?.pressInputs?.main ?? null, enabled: requestedConditions[PRESS_SWITCH] !== false });
  // The Main Skill's share of the action time, for a channeled beam or DoT Main Skill (a skill-hit Main Skill reads its rotation entry).
  const mainPressShare = pressRotationState?.bySetup?.get(resolvedMain?.setupKey)?.share ?? 1;
  // Activation Medium: Terra (Silencing Severance; src/selena-dance.js resolveActivationMediumTerra, reference data 2026-10-13): on an
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
  const buildMaxSpellBurst = maxSpellBurstTotal(modifierTexts);
  // Icemirror's Mirrored Shade at max stacks (src/combat-states.js; best case, condition mirroredShade) adds Max Terra Charge on
  // the Main Terra Skill the player stands on.
  const mirroredShadeCharges = mirroredShadeTerraChargeLines(modifierTexts, { mainIsTerra: Boolean(resolvedMain && activeNames.has(resolvedMain.name) && (resolvedMain.tags || []).includes("Terra")), requestedConditions });
  const terraLinesFor = (setup) => setup ? [...setupTerraChargeLines({ supportEffects: resolveSupportEffects(setup) }), ...(setup.setupKey && setup.setupKey === resolvedMain?.setupKey ? mirroredShadeCharges : [])] : [];
  const danceOfTheDeep = resolveDanceOfTheDeep({ state, modifierTexts, resolvedMain, activeNames, extraChargeLines: terraLinesFor(resolvedMain), maxSpellBurst: maxSpellBurstTotal(modifierTexts) });
  const terraChargesFor = (setup) => setup?.setupKey && setup.setupKey === resolvedMain?.setupKey ? danceOfTheDeep.charges : resolveTerraCharges([...modifierTexts, ...terraLinesFor(setup)], { maxSpellBurst: buildMaxSpellBurst });
  const damageSources = collectSkillDamageSources({ setups, activeNames }).map((source) => source.status === "modeled" && danceBlocksSetup(danceOfTheDeep, setups.find((setup) => setup.setupKey === source.setupKey), resolvedMain)
    ? { ...source, status: "inactive", reason: "Dance of the Deep: Non-Main Terra Skill cannot deal damage" } : source);
  // Module affixes (src/module-protocols.js, 2026-10-28): while a module's Minion is modeled, its Protocols' ally buffs ("Minions
  // summoned by this skill grant … to you and allies", once per buff) join the build's lines, and Cold / Fire / Lightning Protocol
  // read as "When Minions deal damage, inflicts X Infiltration" when the Minions deal that type. The Minion parts are read by the
  // Minion model from setup.moduleAffixes.
  const moduleProtocols = resolveModuleProtocols({ setups, isActive: (setup) => damageSources.some((source) => source.setupKey === setup.setupKey && source.status === "modeled" && source.profile?.engine === "minion"), profileOf: (setup) => MINION_PROFILES[inferDamageProfile(setup)?.minionKey] || null, boardAuras: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name)).map((setup) => setup.name) });
  modifierTexts.push(...moduleProtocols.playerLines, ...moduleProtocols.infiltrationLines);
  // Bing – Blast Nova (hero trait audit B12; src/bing-traits.js): the bombs replace a Non-channeling, Non-Sentry Main Attack Projectile
  // Skill's casts (its hit model gives each bomb's damage, Q-H14). Firepower Coverage (Q-H15, recommended reading, provisional; the
  // user has not answered): "Cannot use Main Skills" is unconditional, so a Main Skill the bombs cannot replace deals no damage of its
  // own, with a warning naming the missing source. Best-case switch `bingFirepowerNoMain` (default on: the penalty applied; off: such a
  // Main Skill keeps its damage).
  const bingBombs = bombsReplaceMain(state.hero.selectedHeroId, modifierTexts, resolvedMain);
  // Node 243 (9521365): bCannotCastOtherThanTrigger, so a Main Skill an Activation Medium casts keeps casting.
  const bingMainTriggered = (resolvedMain?.supports || []).some((support) => support.enabled !== false && /^Activation Medium/i.test(support.name || ""));
  const firepowerCoverage = state.hero.selectedHeroId === BING_BLAST_NOVA && modifierTexts.some((line) => line.origin === "trait" && /^Cannot use Main Skills$/i.test(String(line.text ?? "").replace(/\s+/g, " ").trim()))
    ? { mainName: resolvedMain?.name || null, bombs: bingBombs, applied: requestedConditions.bingFirepowerNoMain !== false && Boolean(resolvedMain) && !bingBombs && !bingMainTriggered } : null;
  if (firepowerCoverage?.applied) for (const [index, source] of damageSources.entries()) {
    if (source.setupKey === resolvedMain.setupKey && source.status === "modeled") damageSources[index] = { ...source, status: "inactive", reason: "Firepower Coverage: Cannot use Main Skills (Q-H15, provisional); the bombs need a Non-channeling, Non-Sentry Main Attack Projectile Skill" };
  }
  // A setup's stone-filter tag changes (supportAddedTags / supportRemovedTags) are the skill's own tags for its DoT's tag-scoped lines and
  // recipe plan as for its hits (wiring audit W1 gap 1, 2026-11-03).
  const withSetupTags = (profile, setup) => setup?.supportAddedTags?.length || setup?.supportRemovedTags?.length ? { ...profile, tags: [...skillTagsWithSupportChanges(profile.tags, setup)] } : profile;
  const skillDotSources =damageSources.filter((source) => source.status === "modeled" && source.profile.engine === "skill-dot").map((source) => { const setup = setups.find((item) => item.setupKey === source.setupKey); return { ...source, setup, profile: withSetupTags(source.profile, setup) }; });
  // Ice Lances: Permafrost (Noble) (src/permafrost-terra.js; 2026-11-14): the setups whose hits trigger a Lv. 20 Frost Terra, and whether its DoT
  // reaches the dummy (Dance of the Deep stops a non-Main Terra; a board Frost Terra holds the same DoT buff). The DoT is computed with the hits.
  const permafrostTerra = permafrostTerraState({ setups, activeNames, blocksNonMainTerra: Boolean(danceOfTheDeep.blocksNonMainTerra) });
  const permafrostTerraDots = permafrostTerra.blocked ? 0 : permafrostTerra.carriers.length;
  // Damage-over-time skills an item casts (gear affix batch D, 2026-10-22: "Triggers Lv. 30 Black Hole when moving. Interval: 1.5 s";
  // src/item-triggered-skills.js): with no copy of the skill on the skill board, the item's skill at its level (+ the build's skill level lines, 2026-11-16) runs the skill's own
  // DoT profile while the event holds (the movement group), at most once per its cooldown (the Activation Medium rule: rate =
  // 1 / max(trigger interval, cooldown); provisional). The hit streams follow below (itemTriggerSources).
  const itemDotTriggers = [];
  modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).forEach((line) => {
    const trigger = parseItemTrigger(line.text);
    if (!trigger || trigger.unmodeled || trigger.notOnDummy || !(trigger.intervalSeconds > 0)) return;
    const setup = { ...(catalogSkillsByName.get(trigger.name) || {}), name: trigger.name, role: "item-trigger", ...itemSkillLevel(trigger.name, trigger.level, line), supports: [], setupKey: `item-trigger-dot:${trigger.name}`, instanceId: `item-trigger-dot:${trigger.name}`, enabled: true };
    const profile = inferDamageProfile(setup);
    if (profile?.engine !== "skill-dot" || !Number.isFinite(profile.refreshPerSecond)) return;
    const key = normalizeLineText(String(line.text)).trim();
    if (setups.some((item) => item.name === trigger.name && activeNames.has(item.name))) { itemDotTriggers.push({ key, note: `No DPS effect: ${trigger.name} is on the skill board and is recast at its cooldown already` }); return; }
    const event = itemTriggerEvent(trigger, { moving: requestedConditions.moving !== false, mobilityUsesPerSecond: boardMobilityUses(setups, requestedConditions) });
    if (!event.active) { itemDotTriggers.push({ key, note: `Inactive: ${event.reason}` }); return; }
    if (skillDotSources.some((source) => source.setupKey === setup.setupKey)) return;
    const perSecond = Math.min(1 / (event.intervalSeconds ?? trigger.intervalSeconds), profile.refreshPerSecond);
    skillDotSources.push({ setupKey: setup.setupKey, name: setup.name, role: setup.role, enabled: true, active: true, status: "modeled", reason: `item trigger (${line.source})`, setup, itemTrigger: { ...trigger, source: line.source, text: line.text, reason: event.reason }, profile: { ...profile, refreshPerSecond: perSecond, notes: [...(profile.notes || []), `${trigger.name} ${triggeredLevelLabel(setup)} cast by ${line.source}: every ${trigger.intervalSeconds} s while the event holds (${event.reason}), at most once per its cooldown: ${Math.round(1 / perSecond * 1000) / 1000} s (provisional).`] } });
    itemDotTriggers.push({ key, note: `Triggered skill: ${trigger.name} ${triggeredLevelLabel(setup)} every ${Math.round(1 / perSecond * 1000) / 1000} s (${event.reason}; the item's interval ${trigger.intervalSeconds} s capped by the cooldown; provisional)` });
  });
  // Generic spell hits (src/skill-hit-model.js, engine "skill-hit"): computed below once crit, cast speed and the target are resolved.
  // Activation Medium: Terra's "+30% additional damage for the supported skill" on the Main Terra Skill (hits and its own DoT).
  const activationMediumTerraLines = (setupKey) => activationMediumTerra.active && setupKey && setupKey === resolvedMain?.setupKey ? [{ source: "Activation Medium: Terra (Silencing Severance)", text: `+${activationMediumTerra.additionalPercent}% additional damage for the supported skill (reference data Activation_Medium_Terra)`, value: activationMediumTerra.additionalPercent, category: "Additional damage" }] : [];
  // Tangle Skills and Dormant Entanglement (src/tangle-model.js): "+40% additional Tangle Damage for each inactivated Tangle" on
  // the hits and own DoT of each Spell cast as a Tangle; joins the per-setup granted lines with Activation Medium: Terra's.
  // Core audit B8: "You can apply N additional Tangle(s) to enemies" (activated Tangles) and the cadence switch tangleTriggers.
  // Banishment: Tangle (2026-11-02): the modeled Minions the Tangles attach to (counts as `minionCount` in the line-condition state)
  // and each one's Max Life (src/minion-life.js) for the nearest Synthetic Troop's per-80-Life line. One entry per Minion type, at
  // the highest level among its summon setups.
  const tangleMinions = (() => {
    if (!modifierTexts.some((line) => isTangleMinionAttachLine(line.text) || isTangleTroopLifeLine(line.text))) return [];
    const byKey = new Map();
    for (const source of damageSources) {
      if (source.status !== "modeled" || source.profile?.engine !== "minion") continue;
      const setup = setups.find((item) => item.setupKey === source.setupKey);
      const level = setup?.effectiveLevel ?? 20, current = byKey.get(source.profile.minionKey);
      if (!current || level > current.level) byKey.set(source.profile.minionKey, { level, setup });
    }
    const halveTroops = Boolean(troopHalvingSource({ setups, activeNames }));
    return [...byKey].map(([key, { level, setup }]) => {
      const minionProfile = MINION_PROFILES[key];
      const life = minionMaxLife({ family: minionProfile?.family, level, supports: setup?.supports || [], modifierTexts });
      return { name: minionProfile?.minion || key, key, family: minionProfile?.family || null, troop: isSyntheticTroopFamily(minionProfile?.family), level,
        count: minionCountOut(minionProfile, level, modifierTexts, { troopMaxMinions: (requestedConditions?.troopMaxMinions ?? requestedConditions?.moduleMaxMinions) !== false, halveTroops }),
        maxLife: life?.value ?? null, lifeText: life?.text || "" };
    });
  })();
  const tangles = resolveTangles({ setups, activeNames, modifierTexts, coreSetupKey: yougaCoreKey, extraQuantity: yougaTangleQuantityLines(modifierTexts), conditions: { tangleTriggers: requestedConditions.tangleTriggers !== false }, minions: tangleMinions });
  // Night Feather Entanglement's "+3% Cooldown Recovery Speed per stack" (reference data beta values; F2 2026-10-27): a build line for every
  // later Cooldown Recovery Speed reader (skill cooldowns, Youga's Selves of All Realms chain).
  if (tangles.nightFeather?.cooldownLine) modifierTexts.push(tangles.nightFeather.cooldownLine);
  // Overly Modified (core audit B7, src/sentry-cores.js): +30% on a Sentry skill's own damage, −50% on a non-Sentry Active skill's.
  const overlyModified = overlyModifiedState(modifierTexts);
  const overlyLinesFor = (setupKey) => { const line = overlyModified ? overlyModifiedLine(overlyModified, setups.find((setup) => setup.setupKey === setupKey)) : null; return line ? [line] : []; };
  const grantedSetupLines = (setupKey) => [...activationMediumTerraLines(setupKey), ...tangleLinesFor(tangles, setupKey), ...overlyLinesFor(setupKey)];
  const skillHitSources = damageSources.filter((source) => source.status === "modeled" && source.profile.engine === "skill-hit").map((source) => { const profile = withTerraCharges(source.profile, terraChargesFor(setups.find((setup) => setup.setupKey === source.setupKey))); return { ...source, profile: { ...profile, grantedAdditional: [...grantedSetupLines(source.setupKey), ...(profile.gashLine ? [profile.gashLine] : [])] }, setup: setups.find((setup) => setup.setupKey === source.setupKey) }; });
  // Their ground-effect damage over time (Flame / Corrosion / Swamp Terra): skill-DoT profiles for src/skill-dot-model.js.
  const skillHitDotSources = skillHitSources.flatMap((source) => skillHitDotComponents(source.profile).map((profile) => ({ ...source, profile: withSetupTags(profile, setups.find((setup) => setup.setupKey === source.setupKey)) })));
  // Support clauses per resolved setup (src/support-effects.js: leveled values, stars, rolls, Activation Medium lines,
  // per-engine clause statuses). Engines read `setup.supportEffects`; it is resolved again once the blessing model
  // gives the Focus Blessing stack count (Overload).
  // Cataclysm on a hit skill whose ailments are its damage over time (src/cataclysm-hit-ailments.js): settled once the Ignite ledger
  // is compiled (below); the second support resolution reads it for the badge.
  let cataclysmAilments = { setups: [], afflictionPerSecond: 0, bySetupKey: new Map() };
  const supportEffectsContext = (setup, focusBlessingStacks) => {
    const profile = inferDamageProfile(setup);
    // Activation Medium: Energy Shield's threshold (src/support-effects.js): always met at Max Energy Shield 0, read only when a clause asks.
    return { noEnergyShield: () => noEnergyShieldGate().none, profile, engine: setup.name === "Scorching Beam" ? "scorching-beam" : profile?.engine ?? null, isMain: Boolean(resolvedMain) && setup.setupKey === resolvedMain.setupKey, hitDot: profile?.engine === "skill-hit" && skillHitDotComponents(profile).length > 0, hitAilment: cataclysmAilments.settled ? cataclysmAilments.bySetupKey.get(setup.setupKey)?.ailments || [] : null, speedType: profile?.engine === "skill-hit" ? skillHitTiming(profile)?.speedType || "cast-speed" : null, specialSupportConfigs: state.skills.specialSupportConfigs || {}, focusBlessingStacks };
  };
  for (const setup of setups) setup.supportEffects = resolveSupportEffects(setup, supportEffectsContext(setup));
  // Periodic Burst on a Mobility skill (src/periodic-burst.js; 2026-10-14, provisional): its time-averaged Attack and Cast Speed
  // joins the build's lines before the cast-rate ledger and the weapon Attack Speed model read them.
  const periodicBurst = resolvePeriodicBurst({ setups, activeNames, mobilitySkillUsed: requestedConditions.mobilitySkillUsed !== false, cooldownFor: (setup) => { const profile = inferDamageProfile(setup); return (profile ? skillHitTiming(profile)?.cooldownSeconds : null) ?? 0; } });
  modifierTexts.push(...periodicBurst.lines);
  // One Cataclysm per setup (its 1 s Effect Cooldown belongs to the support), however many DoT components the skill has.
  let skillDotAfflictionRate = [...new Map([...skillDotSources, ...skillHitDotSources].map((source) => [source.setupKey ?? source.name, source.setup])).values()].reduce((sum, setup) => sum + skillDotAfflictionPerSecond(setup), 0);
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
  // Kismet, pact and hero memory lines (game affix 101010133: the same attr 1304 mod 3 write as the talent and gear copies) and Dual Kismet:
  // Hatch Out's +30% when the build has no Energy Shield (src/sealed-mana-compensation.js; 2026-11-05: the pool left them out).
  const pageSealedCompensation = pageSealedManaCompensation(modifierTexts, { noEnergyShield: () => noEnergyShieldGate().none });
  const globalSealedManaCompensationPercent = talentSlate.sealedManaCompensationPercent + (equipment.candidate["sealedManaCompensationPercent:increased"] || 0) + traitSealedManaCompensationPercent + pageSealedCompensation.percent;
  // Fixed Support Mana Multiplier: Off The Beaten Track 95% (by name), and a gear line "Support Skill's Mana Multiplier is fixed at
  // N%" (Pantheon's Elegy: Lich's Dirge 88%; legendary audit batch 1). With both, the lower value is used (provisional, open
  // question legendary-fixed-support-multiplier).
  const fixedSupportManaMultiplier = (() => {
    const lines = modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).map((line) => ({ line, match: normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(/^Support Skill's Mana Multiplier is fixed at (\d+(?:\.\d+)?) ?%\.?$/i) })).filter((item) => item.match && Number(item.match[1]) !== 95);
    const values = [...(offTheBeatenTrack ? [95] : []), ...lines.map((item) => Number(item.match[1]))];
    return { percent: values.length ? Math.min(...values) : 100, lines: lines.map((item) => item.line) };
  })();
  const conditionalAura = conditionalAuraEffect(modifierTexts, { auraCount: new Set([...boardActiveAuraNames, ...grantedAuraSetups.map((setup) => setup.name)].filter(isAuraTaggedName)).size, auraEntryCount: new Set([...boardActiveAuraNames, ...grantedAuraSetups.map((setup) => setup.name)]).size, nearTarget: requestedConditions.nearTarget !== false, sealedManaCompensationPercent: globalSealedManaCompensationPercent, nonExclusiveSupports });
  // Precise: Safety in Numbers "+X% Aura Effect for each ally affected by the supported skill, stacking up to 7 time(s)" (record 637226432):
  // your Minions are allies (G13, user decision 2026-11-12; research/build-10t-iris2-erosion-magus-audit-2026-11-12.md), so with modeled
  // Minions the count is the Minions out (the profiles' counts, as the Minion counters read them: minionCountOut), all inside the Aura
  // (best case), up to the support's cap of 7; automatic, listed in the assumptions, the Config allies field shows it. Without Minions the
  // saved Config value as before (other allies are not modeled). Not counted: Elemental Duo's / Socialite's extra Spirit Magi (settled
  // later, with the Minion damage).
  const auraAllies = (() => {
    const levels = new Map();
    for (const source of damageSources) {
      if (source.status !== "modeled" || source.profile?.engine !== "minion") continue;
      const level = setups.find((setup) => setup.setupKey === source.setupKey)?.effectiveLevel ?? 20;
      levels.set(source.profile.minionKey, Math.max(levels.get(source.profile.minionKey) || 0, level));
    }
    const halveTroops = levels.size ? Boolean(troopHalvingSource({ setups, activeNames })) : false;
    const minionsOut = [...levels].reduce((total, [key, level]) => total + minionCountOut(MINION_PROFILES[key], level, modifierTexts, { troopMaxMinions: (requestedConditions?.troopMaxMinions ?? requestedConditions?.moduleMaxMinions) !== false, halveTroops }), 0);
    return minionsOut > 0 ? { derived: true, count: Math.min(7, minionsOut), minionsOut, saved: state.combat.auraAffectedAllies ?? 1 } : { derived: false, count: state.combat.auraAffectedAllies, minionsOut: 0 };
  })();
  const safetyInNumbersActive = setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.supports || []).some((support) => support.enabled !== false && support.name === "Precise: Safety in Numbers"));
  const auraOptions = {
    nearbyElite: requestedConditions.nearbyElite === true, affectedAllies: auraAllies.count,
    // Cruelty / Precise: Cruelty's own stacks held at the cap on the Elite dummy (best-case switch; src/aura-effects.js auraOwnStackEffect).
    crueltyStacks: requestedConditions.crueltyStacks !== false,
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
  // Activation Medium: Terra's seal (reference data "Seals 20% Mana"; Drenched Hem: Life instead) joins the reserved totals the Life / Mana
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
  const resistances = calculateResistances({ traitLines: modifierTexts.filter((line) => line.origin === "trait"), armorPool: () => resourcePool(characterStatTotals({ modifierTexts, state, heroMemories, equipment }), "armor", 0, { defense: true }).value, equipment, talents: levelSources.talents, slates: levelSources.slates, memories: heroMemories, pact, pactState: state.pacts, talentState: state.talents, aura });
  const plannedAura = calculateAuraLedger(auraSetups, auraOptions);
  aura.planned = { entries: plannedAura.entries, manaReservedPercent: plannedAura.manaReservedPercent, manaDemandPercent: plannedAura.manaDemandPercent, manaRemainingPercent: plannedAura.manaRemainingPercent, lifeReservedPercent: plannedAura.lifeReservedPercent, lifeDemandPercent: plannedAura.lifeDemandPercent, lifeRemainingPercent: plannedAura.lifeRemainingPercent };
  aura.prismTalentSources = prismTalentStats.lines;
  aura.pageSealedManaCompensation = { percent: pageSealedCompensation.percent, sources: pageSealedCompensation.sources, gated: pageSealedCompensation.gated, ...(energyShieldGateState ? { energyShield: energyShieldGateState } : {}) };
  aura.grantedChoices = grantedAuraChoices;
  aura.conditionalGrants = conditionalAuraGrants;
  // The active Auras' buffs on your Minions, allies in the area (G1, 2026-11-12; src/aura-damage.js auraAllyMinionLines, provisional
  // open question aura-ally-minion-scale): Minion damage lines for every modeled Minion (computeMinion below) and Minion Max Life lines
  // (Precise: Radical Order's +10%: the Hero Ranking panel's Minion Life 4,950 = 4,500 × 1.1 on the 10 T Iris build).
  aura.allyMinionLines = auraAllyMinionLines(aura.entries, { classify: classifyMinionLine });
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
  const block = calculateBlock({ equipment, talents: levelSources.talents, slates: levelSources.slates, memories: heroMemories, pact, pactState: state.pacts, talentState: state.talents, blockedRecently: requestedConditions.blockedRecently !== false, traitLines: modifierTexts.filter((line) => line.origin === "trait") });
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
  // The active Auras' ailment / Ignite chance (Ailment Amplification; Flame Focus's is its Focus buff's since W6c, src/focus-buffs.js): the enemy-ailment check reads it with the
  // text lines, as the Ignite ledger and the per-skill chance do.
  const activeAuraEntries = aura.entries.filter((entry) => activeNames.has(entry.name));
  const auraAilmentChance = { ailment: activeAuraEntries.reduce((sum, entry) => sum + (entry.effectiveEffects?.ailmentChancePercent || 0), 0), ignite: activeAuraEntries.reduce((sum, entry) => sum + (entry.effectiveEffects?.igniteChancePercent || 0), 0) };
  // Ailments your Minions keep on the dummy (src/minion-ailment-types.js, 2026-11-03; provisional): resolved below from the first
  // collect (the types you hold yourself) and the hit pass's Minion hits, then every collect holds them on the dummy.
  let minionAilmentHeld = [];
  // Fiery Oath's Scorch on gaining Tenacity Blessing (wiring audit W6a item 2; src/build-mechanics.js): the Blessing model's gain, set after
  // the early Blessing pass below (null before: the wording reading).
  let tenacityGainState = null;
  // Your own event sources for trigger rows (wiring audit W2 gap 3; src/trigger-rows.js): your hits, your DoT (a modeled skill DoT or a
  // skill hit's ground DoT; your ailments come from your hits), your Minions' damage.
  const ownEventSources = { hit: activeNames.has("Scorching Beam") || skillHitSources.length > 0, dot: damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "skill-dot" && activeNames.has(source.name)) || skillHitSources.some((source) => skillHitDotComponents(source.profile).length > 0), minion: damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "minion") };
  const collectMechanics = () => collectBuildMechanics({ dealtTypesBySetup: dealtBySetup, tenacityGain: tenacityGainState, eventSources: ownEventSources, minionAilmentTypes: minionAilmentHeld, main: resolvedMain || main, setups, activeNames, modifierTexts, specialSupportConfigs: state.skills.specialSupportConfigs || {}, curseLimitMaximum: curseLimit.maximum, skillCurses: curseLimit.active, heroMemories, targetLife: conditions.targetLife !== false, auraAilmentChance, minionsDealDamage: damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "minion"), twoHandedWeapon: Boolean(calculateWeaponAttack({ equipment, disabledSlots: state.disabledEquipmentSlots, modifierTexts }).twoHanded), grantedSupportLevelBonus: (name) => skillLevelBonus({ name, role: "support", tags: ["Support", ...(catalogSupportsByName.get(name)?.tags || [])] }, levelSources).total, triggeredSkillLevel: itemSkillLevel });
  let mechanics = collectMechanics();
  // Minion-inflicted ailments (src/minion-ailment-types.js, 2026-11-03; provisional): the Minions' hits per second from the hit pass.
  // The ailment state sits on the target whoever inflicted it, so they join the enemy-ailment model (src/enemy-ailments.js) once,
  // here: the per-type counters, every "enemy with <Ailment>" / "<Ailment>ed enemies" condition and state-dependent effects read them.
  const minionAilmentRates = minionAilmentRatesNeeded(modifierTexts);
  const minionAilmentTypes = minionAilmentRates ? resolveMinionAilmentTypes({ modifierTexts, playerTypes: mechanics.enemyAilments.types.map((type) => type.name), minionHits: hitRateFacts?.minionHits ?? null }) : null;
  if (minionAilmentTypes?.active) { minionAilmentHeld = minionAilmentTypes.types.filter((type) => type.uptime > 0); mechanics = collectMechanics(); }
  // Frostbite your Minions inflict (G5, 2026-11-14; src/minion-frostbite.js, provisional): the Frost Magus's Permafrost Cast and Ice Earthshaker
  // (game affix 4826069) Frostbite the dummy at the Magus's own field 2007015; measured on the hit pass (the Minion cycle's landings, Nourishment
  // stacks and rating), held on the dummy here at its share, built from zero in the windows (combat-states' timed part). A Frostbite of yours
  // keeps the dummy's (one per enemy; the priority between units is open). The ailment state joins the enemy-ailment model like the other
  // Minion types, so the Frostbitten / Frozen readers and the crowd control counters see it.
  const minionFrostbiteRates = minionFrostbiteNeeded(setups, activeNames);
  const minionFrostbite = minionFrostbiteRates ? resolveMinionFrostbite({ facts: hitRateFacts?.minionFrostbite ?? null, playerHolds: mechanics.enemyAilments.types.some((type) => type.name === "Frostbite" && !type.byMinions), blocked: buildWideAilmentBlock(modifierTexts, "Frostbite") }) : null;
  if (minionFrostbite?.applied) { minionAilmentHeld = [...minionAilmentHeld.filter((type) => !["Frostbite", "Frozen"].includes(type.name)), ...minionFrostbite.types]; mechanics = collectMechanics(); }
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
  // Witch of the Night (F2, 2026-10-27): Night Feather Entanglement is held at max stacks (= activated Tangles, game recipe 1447677)
  // while a Tangle is active; its "Gains 1 stack of <Blessing> every N s when Night Feather Entanglement reaches max stacks" line
  // (recipe 5583405) is a Blessing gain source (src/blessing-model.js).
  const nightFeatherGainLines = modifierTexts.filter((line) => /^Gains \d+ stacks? of \w+ Blessing every [\d.]+ ?s when Night Feather Entanglement reaches max stacks$/i.test(String(line.text || "").trim()));
  const nightFeatherMax = Boolean(tangles.nightFeather?.active);
  // True Flame Immolation's Blessing cycle (2026-10-28; src/true-flame-blessing-cycle.js): while the item-granted skill is the active
  // Main Skill, each cast consumes the Focus and Tenacity stacks and refills ⌊max × 2.5% × Cooldown Recovery Speed %⌋. The skill's
  // Cooldown Recovery Speed and casts per second come from the hit pass (hitRateFacts.trueFlame); before it, the stat sheet's
  // Cooldown Recovery Speed and no measured casts.
  const trueFlameSetup = setups.find((setup) => setup.itemGranted && setup.name === TRUE_FLAME_IMMOLATION && setup.enabled !== false && activeNames.has(setup.name)) || null;
  const trueFlameCycleInput = trueFlameSetup && !(hitRateFacts?.trueFlame && !(hitRateFacts.trueFlame.castsPerSecond > 0)) ? {
    names: [...TFI_CONSUMED_BLESSINGS], source: TRUE_FLAME_IMMOLATION,
    cooldownRecoveryPercent: hitRateFacts?.trueFlame?.cooldownRecoveryPercent ?? (Number(characterStatTotals({ modifierTexts, state, heroMemories, equipment }).byKey.cooldownRecoverySpeed?.value) || 0),
    castsPerSecond: hitRateFacts?.trueFlame?.castsPerSecond ?? null
  } : null;
  // Spell Burst activations per second, for "Gains N stack(s) of <Blessing> when consuming Spell Burst" (record 816003904, trigger 1000303: one
  // gain per activation as a whole, Ingenuity Overload's included; user-confirmed 2026-11-10): every setup's regular activations the hit pass
  // measured, + Bing's Overloads once its state is known (src/bing-traits.js). Null before the hit pass (the gain is held pending it).
  const spellBurstConsumptions = (bing = null) => {
    if (!hitRateFacts?.bySetup) return null;
    const regular = [...hitRateFacts.bySetup.values()].reduce((total, facts) => total + (Number(facts?.spellBurstActivationsPerSecond) || 0), 0);
    // (C1: an Overload empties the charge, so the Main Skill's regular activations are the Whimsy walk's, src/bing-traits.js.)
    const main = bing?.creative?.main, walked = bing?.creative?.cadence?.regularActivationsPerSecond;
    const lost = bing?.creative?.overload?.perSecond > 0 && main?.burstActivationsPerSecond > 0 && Number.isFinite(walked) ? Math.max(0, main.burstActivationsPerSecond - walked) : 0;
    return regular - lost + (Number(bing?.creative?.overload?.perSecond) || 0);
  };
  const earlyBlessings = calculateBlessings({ spellBurstConsumptionsPerSecond: spellBurstConsumptions(), durationSeconds: blessingDurations(modifierTexts), dealsDot: ownEventSources.dot, consumptionCycle: trueFlameCycleInput, nightFeatherMax, minionsDealDamage: damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "minion"), elixirCasts: setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Elixir")), extraLines: [...(theaInputs?.lines || []), ...nightFeatherGainLines, ...followerBlessingLines(followerSelection(state), requestedConditions)], capRules: theaInputs?.capRules || null, mobilityUsed, tangleCasts: tangles.setups.length > 0, hitRecently: requestedConditions.blockedRecently !== false, canUseNonMain: setups.some(setup => setup.role !== "main" && setup.role !== "aura" && activeNames.has(setup.name)), pactState: state.pacts, talentState: state.talents, equipment, talents: levelSources.talents, slates: levelSources.slates, barrierSources, hasReaping: collectAllReapingSources(modifierTexts).length > 0 || cycleResistReaps(modifierTexts, resolvedMain, activeNames), block, moving: conditions.moving, canHit: activeNames.has("Scorching Beam") || skillHitSources.length > 0, canCrit: activeNames.has("Scorching Beam") || skillHitSources.length > 0, enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), enemyBuffs: mechanics.enemyAilments.set, igniteOnTarget: enemyBuffSet(mechanics.enemyAilments)?.holds("Ignite") ?? mechanics.enemyAilments.types.some((type) => type.name === "Ignite") });
  // Fiery Oath (wiring audit W6a item 2, 2026-11-03): "Gaining Tenacity Blessing triggers Lv. N Scorch" reads whether the Blessing model gains
  // Tenacity stacks in the fight (an available gain source), then the curses are collected again; a gear Scorch it adds stands in for the skill.
  if (modifierTexts.some((line) => /^Gaining Tenacity Blessing triggers Lv\. \d+ Scorch/i.test(String(line.text ?? "").trim()))) {
    const tenacity = earlyBlessings.entries.find((entry) => entry.name === "Tenacity");
    const sources = (tenacity?.gainSources || []).filter((source) => source.available);
    tenacityGainState = { gains: sources.length > 0 && (tenacity?.stacks > 0 || Boolean(tenacity?.heldBeforeConsumption)), sources: sources.map((source) => source.source), reason: sources.length ? null : "no available Tenacity Blessing gain source (Blessing model)" };
    mechanics = collectMechanics();
    if (!activeNames.has("Scorch") && mechanics.curses.gearScorch && requestedConditions.scorch !== false) conditions.scorch = true;
  }
  const lineConditionState = buildLineConditionState({ state, requestedConditions, conditions, lowResources, aura, block, mechanics, curseLimit, modifierTexts, equipment, activeNames, setups, resolvedMain, skillHitSources, talentSlate, pact, heroMemories, earlyBlessings, damageSources, debuffHitRates, yougaMainKey, yougaBlockedTangles, talentPanels: levelSources.talents, resistances, tangles, remainingEnergy: allocation.remaining, nonExclusiveSupports, dealtBySetup });
  // The curses on the dummy join its unit buff set (W8 step 2; stage "curse"): the "cursed" readers query it.
  putCurses(lineConditionState.enemyBuffs, { names: lineConditionState.cursed ? lineConditionState.curseSkillNames : [], cursed: Boolean(lineConditionState.cursed) });
  // The curse cast the tick engine replays (W8 step 3, src/tick-layers.js curseLayer): the first curse the slot model keeps (curseLimit), else one "Curse".
  lineConditionState.enemyBuffs?.setSeries?.("Curse", { kind: "cast", skill: curseLimit?.active?.[0] || "Curse" });
  // The Minions' Frostbite on the dummy (src/minion-frostbite.js): src/combat-states.js reads its rating, Cold Damage taken and schedules.
  if (minionFrostbite) lineConditionState.minionFrostbite = minionFrostbite;
  // A chance debuff driven by a skill's hit rate (Grudge's Paralysis): this pass measures the rates (Paralysis held meanwhile,
  // so lines gated on it read alike) and a second pass applies the uptime. Damage taken does not change any hit rate.
  // Thunder Spike: Tremble (src/crit-numbed-buff.js; 2026-10-14, provisional): Numbed Effect while its crit buff is up, at the
  // uptime the supported skill's crit hits per second give (hitRateFacts, measured by the first pass; held before).
  const critNumbedBuffs = resolveCritNumbedBuffs({ setups, activeNames, enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), enemyBuffs: mechanics.enemyAilments.set, hitRateFacts: hitRateFacts?.bySetup || null,
    lightningHitters: new Map(skillHitSources.map((source) => [source.setupKey, hitRateFacts?.bySetup?.get(source.setupKey)?.dealsLightning ?? sourceDealtTypes(source, dealtBySetup).includes("Lightning")])) });
  // src/combat-states.js reads plain lines only, so the buff reaches its Numbed through the state (value already × uptime).
  lineConditionState.numbedEffectBuffs = critNumbedBuffs.lines.map((line) => ({ source: line.source, text: line.text, value: Number(line.text.match(/^\+([\d.]+)%/)?.[1]) || 0 }));
  // Thunder Manipulator's Numbed Effect on Lightning crits (src/combat-states.js numbedCritBuff): the build's Lightning crit hits/s.
  lineConditionState.lightningCritHitsPerSecond = hitRateFacts?.bySetup ? [...hitRateFacts.bySetup.values()].reduce((total, facts) => total + (facts?.dealsLightning && Number.isFinite(facts.critHitsPerSecond) ? facts.critHitsPerSecond : 0), 0) : null;
  // The revived Numbed family's own stacks (src/combat-states.js revivedNumbed, chunk 2 2026-11-01): the build's Lightning hits per second.
  lineConditionState.lightningHitsPerSecond = hitRateFacts?.bySetup ? [...hitRateFacts.bySetup.values()].reduce((total, facts) => total + (facts?.dealsLightning && Number.isFinite(facts.hitsPerSecond) ? facts.hitsPerSecond : 0), 0) : null;
  // Chunk 12 line keys (src/line-conditions.js): the board's Mobility uses (Elegy of Immortality), the held Blur from the first pass
  // (Chain behind the Curtain; Blur is resolved after the line effects) and the Focus skills by board tab (Imperious Verdict).
  lineConditionState.mobilityUsesPerSecond = boardMobilityUses(setups, requestedConditions);
  lineConditionState.blurHeld = hitRateFacts?.blurHeld || null;
  // The same held Blur (buff 220) on your unit buff set (W9 step 2).
  putBlur(lineConditionState.playerBuffs, lineConditionState.blurHeld ? { ...lineConditionState.blurHeld, active: true } : null);
  const focusOnBoard = (tab) => setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Focus") && setupBoardTab(setup) === tab).map((setup) => setup.name);
  lineConditionState.focusSkillsBySlot = { passive: focusOnBoard("auras"), active: focusOnBoard("skills") };
  // Empower and Warcry buffs (census 2026-10-26 #1 / #3 / #7; src/empower-buffs.js): resolved here for Thunderlight Bond's Numbed
  // Effect and Lucky Damage (read by the line effects below); their damage lines join the ledgers with the other Empower effects.
  const empowerBuffContext = { moving: requestedConditions.moving !== false, mobilityUsesPerSecond: boardMobilityUses(setups, requestedConditions), manaLeftPercent: lineConditionState.manaRemainingPercent ?? 100, mainChanneled: (resolvedMain?.tags || []).includes("Channeled"), focusBlessingStacks: (playerBuffSet(lineConditionState)?.staged("blessing") ? lineConditionState.playerBuffs.stacks("Focus", { stage: "blessing" }) : lineConditionState.blessingStacks?.Focus) || 0, minionCount: (playerBuffSet(lineConditionState)?.level("Minions") ?? lineConditionState.minionCount) || 0, spiritMagi: damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "minion" && source.profile?.family === "spirit-magus"), hitsPerSecond: hitRateFacts?.hitsPerSecond ?? null, anyHit: activeNames.has("Scorching Beam") || skillHitSources.length > 0 };
  const empowerEarly = resolveEmpowerEffects({ setups, activeNames, modifierTexts, enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), enemyBuffs: mechanics.enemyAilments.set, prebuiltSelfBuffs: requestedConditions.prebuiltSelfBuffs !== false, multistrikeEventsPerSecond: hitRateFacts?.multistrikeEventsPerSecond ?? null, context: empowerBuffContext, warcriesOnCooldown: requestedConditions.warcriesOnCooldown !== false, itemSkillLevel });
  lineConditionState.numbedEffectBuffs.push(...empowerEarly.numbedEffectBuffs);
  // The Empower model's steady uptimes and the Warcry buffs on your unit buff set (W9 step 2; the Empower skills counted as before).
  putEmpowerBuffs(lineConditionState.playerBuffs, { skills: lineConditionState.sageInputs?.empowerSkills || [], entries: empowerEarly.entries });
  // The Defensive Skills' own buffs at their steady uptime (src/defensive-buffs.js; user rule 2026-11-15): their trigger or the press
  // rotation's interval (the first pass's classification) against their Split duration and cooldown.
  const defensiveBuffs = resolveDefensiveBuffs({ setups, activeNames, modifierTexts, pressInputs: hitRateFacts?.pressInputs?.skills || [], amEvents: hitRateFacts?.amEvents ?? null, multistrikeEventsPerSecond: hitRateFacts?.multistrikeEventsPerSecond ?? null });
  putDefensiveBuffs(lineConditionState.playerBuffs, defensiveBuffs);
  { const buffLines = empowerEarly.lines.filter((line) => line.empowerBuff || line.warcryBuff); if (buffLines.length) { modifierTexts.push(...buffLines); mechanics = collectMechanics(); } }
  // Burst of Anger's Elite-hit refreshes and the item chance triggers read the hit pass's hits per second.
  const empowerRates = empowerEarly.entries.some((entry) => entry.skill === "Burst of Anger" || entry.item?.chancePercent != null);
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
    const earlyBlurSources = [...collectBlurSources({ equipment, talents: levelSources.talents, slates: levelSources.slates, setups, activeNames, hasReaping: hasReapingEarly, inflictsWilt: enemyBuffSet(mechanics.enemyAilments)?.holds("Wilt", { by: BY_YOU_OR_FOLLOWER }) ?? mechanics.enemyAilments.types.filter((type) => !type.byMinions).some((type) => type.name === "Wilt") }), ...followerBlurSources(followerSelection(state)),
      // Phantom Trace's Blur grant (census item #2; src/support-buff-effects.js).
      ...phantomTraceBlurSources({ setups, activeNames, damageSources, enemyAilments: enemyBuffSet(mechanics.enemyAilments)?.types("Ailment", { by: BY_YOU_OR_FOLLOWER }) ?? mechanics.enemyAilments.types.filter((type) => !type.byMinions).map((type) => type.name), ailmentShare: (name) => enemyBuffSet(mechanics.enemyAilments)?.share(name, { by: BY_YOU_OR_FOLLOWER }) ?? 1 })];
    lineConditionState.consumption = resolveConsumption({ texts: modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).map((line) => String(line.text ?? "").replace(/\s+/g, " ").trim()),
      agility: earlyBlessings.entries.find((entry) => entry.name === "Agility") || null, blurSources: earlyBlurSources, blurActive: requestedConditions.blur !== false && earlyBlurSources.some((source) => source.available),
      castsPerSecond: hitRateFacts?.consumption?.mainUsesPerSecond ?? lineConditionState.mainUsesPerSecond,
      // A Mobility Skill's Agility gain: used on cooldown (chunk 4): uses/s from the skill records' cooldowns; a skill with none is left out.
      facts: { ...(hitRateFacts?.consumption || {}), ...(hitRateFacts?.consumption ? {} : { pending: true }), mobilityUsesPerSecond: boardMobilityUses(setups, requestedConditions) },
      // Node 623 on a Regain row (W10 step 4a, src/consumption-procs.js regainAgilitySpend): the Regains that spend an Agility stack.
      regainSpends: regainBlessingSpends(modifierTexts) });
    if (lineConditionState.consumption.agilityHeld && lineConditionState.blessingStacks) lineConditionState.blessingStacks.Agility = Math.min(lineConditionState.blessingStacks.Agility ?? 0, lineConditionState.consumption.agilityHeld.stacks);
    // The same held average on your unit buff set (W9 step 2).
    if (lineConditionState.consumption.agilityHeld && lineConditionState.blessingStacks) lineConditionState.playerBuffs?.setStacks("Agility", lineConditionState.blessingStacks.Agility, { stage: "blessing" });
  }
  // (a core with no source or no Main Skill reads no rate: no measuring pass for it)
  const consumptionCores = [lineConditionState.consumption.agility, lineConditionState.consumption.blur, lineConditionState.consumption.waitingAttack, lineConditionState.consumption.regainSpend].some((item) => item && item.active !== false);
  // Rate-driven enemy debuffs (core audit batch B4, src/combat-states.js): Juggernaut's stacks follow the player's crit hits per
  // second and Open Wounds' value the Trauma stacks on the dummy; this pass measures both (held at their caps meanwhile).
  // Legendary audit batch 3: Laceration from Trauma (Ralph's Dreadcrest) and damage taken per Wilt stack (Chaos Abyss) read the same pass.
  const rateDebuffCores = modifierTexts.some((line) => line.origin !== "derived" && /a Fire Skill is cast, gains Ash for|Attack Speed for [\d.]+ ?s when Shadows hit enemies|Gains 1 stack of Laceration when inflicting Trauma|additional damage taken \(multiplies\) for enemies for each stack of Wilt they have|for enemies on Critical Strike for [\d.]+ ?s\. Stacks up to \d+ times$|additional Hit Physical Damage taken for every stack of Trauma the enemy has|^When triggering a Critical Strike, gains the following buff|Erosion Damage per stack of Wilt inflicted, stacking up to \d+ times/i.test(String(line.text ?? "")));
  lineConditionState.critHitsPerSecond = hitRateFacts?.critHitsPerSecond ?? null;
  // Your own Melee uses per second (rate.usesBySource.manual of the Melee-tagged hits): Fortitude gains (trigger 1000074; wiring fix W6b).
  lineConditionState.meleeManualUsesPerSecond = Number.isFinite(hitRateFacts?.meleeManualUsesPerSecond) ? hitRateFacts.meleeManualUsesPerSecond : null;
  // Uses by source (wiring audit W2 gap 5, 2026-11-03): the hit pass's tags of the skills you use yourself (1000074 "if you have used a
  // <tag> Skill recently") and the Main Skill's triggered uses (1000060 Feline Stimulant); null before the pass (the readers hold as before).
  lineConditionState.playerUseTags = Array.isArray(hitRateFacts?.playerUseTags) ? new Set(hitRateFacts.playerUseTags) : null;
  lineConditionState.mainTriggeredUsesPerSecond = Number.isFinite(hitRateFacts?.mainTriggeredUsesPerSecond) ? hitRateFacts.mainTriggeredUsesPerSecond : null;
  // Before the pass (the measuring pass itself), whether anything can trigger the Main Skill at all, from the build's structure: a trigger
  // clause on its supports (an Activation Medium; not a mere event source, an auto-use or a detail), a Main Skill retrigger line, a
  // trigger-main source (Vendetta) or a Clockwork Core. Feline Stimulant (1000060) reads it there, so a build whose Main Skill is never
  // triggered does not measure its rates with Attack Aggression held (badge movement probe 2026-11-15: Kitty Express on Erika read
  // Inactive while the first pass's Aggression moved the figures ×1.0016). The final pass reads the measured rate.
  if (!hitRateFacts && modifierTexts.some((line) => line.origin !== "derived" && /^Gains 1 stack of Feline Stimulant when triggering a Main Skill$/i.test(String(line.text ?? "").replace(/\s+/g, " ").trim()))) {
    const mainSetup = setups.find((setup) => setup.setupKey === resolvedMain?.setupKey);
    lineConditionState.mainTriggerPossible = Boolean(
      (mainSetup?.supports || []).some((support) => support?.enabled !== false && /Clockwork Core/i.test(String(support.name || "")))
      || (mainSetup?.supportEffects?.clauses || []).some((clause) => clause.family === "trigger" && !["eventSource", "eventDetail", "autoUse"].includes(clause.kind))
      || modifierTexts.some((line) => line.origin !== "derived" && isMainRetriggerLine(line.text))
      || damageSources.some((source) => source.status === "modeled" && source.profile?.engine === "trigger-main"));
  }
  // Burning Touch (record 648060544; 15 T audit G4): the hit pass's Main Skill uses per second, your own and triggered; null before the pass.
  lineConditionState.mainCastsPerSecond = Number.isFinite(hitRateFacts?.mainCastsPerSecond) ? hitRateFacts.mainCastsPerSecond : null;
  const mainCastRates = modifierTexts.some((line) => line.origin !== "derived" && /Spell Aggression Effect for every Main Spell Skill cast recently/i.test(String(line.text ?? "")));
  // A Blessing gained when consuming Spell Burst (record 816003904) reads the hit pass's Spell Burst activations.
  const spellBurstBlessingRates = modifierTexts.some((line) => line.origin !== "derived" && /Blessing when consuming Spell Burst/i.test(String(line.text ?? "")));
  const useSourceRates = modifierTexts.some((line) => line.origin !== "derived" && /if you have used an? (?:Fire|Cold|Lightning|Erosion|Physical|Spell|Attack|Melee|Projectile) Skill recently$|^Gains 1 stack of Feline Stimulant when triggering a Main Skill$|chance to gain a stack of Fortitude when using a Melee Skill$/i.test(String(line.text ?? "").replace(/\s+/g, " ").trim()))
    // Willpower's stacks answer your own uses (wiring fix W6b): the hit pass measures them.
    || setups.some((setup) => setup.enabled !== false && (setup.supports || []).some((support) => support.enabled !== false && (support.name === "Willpower" || (support.effects || []).some((text) => /supported by Lv\. \d+ Willpower/i.test(String(text))))));
  // Crowd control by chance (src/combat-states.js, 2026-11-03): your hits and triggered uses per second, measured by the hit pass.
  lineConditionState.ccEventRates = hitRateFacts?.ccEvents ?? null;
  // Crowd control on a skill cast (trigger 1000069 with a skill tag, src/crowd-control-recipes.js: Dazzling Bloom's Blind): each enabled
  // board skill's game stone tags and casts per second (a modeled hit's uses from the hit pass; an Empower cast on its cooldown from
  // src/empower-buffs.js; before the hit pass, not known).
  lineConditionState.ccSkillCasts = setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name)).map((setup) => {
    const empower = empowerEarly.entries.find((entry) => entry.skill === setup.name && !entry.item && !entry.superseded && entry.euphoria?.periodSeconds > 0);
    const uses = hitRateFacts?.ccEvents?.usesBySkill?.[setup.name];
    return { name: setup.name, tagIds: skillGameTagsSs13[setup.name]?.tags || [], perSecond: Number.isFinite(uses) && uses > 0 ? uses : empower ? 1 / empower.euphoria.periodSeconds : hitRateFacts?.ccEvents ? 0 : null, firstSeconds: empower?.euphoria?.firstUseSeconds ?? null };
  });
  // Crowd control from support clauses (wiring audit W6a item 1, 2026-11-03; src/crowd-control-recipes.js supportRecipeCrowdControl):
  // each enabled support clause on an active setup whose stone affix applies a crowd control buff, read by its game id on that setup's
  // own events (its hits, its damage events, the Minions it summons; rates from the hit pass's per-setup facts, null before it). The
  // summoner's Command and the Terra Charges a use consumes feed the two chances the recipe table drops (Defense Form, Undertow).
  lineConditionState.supportCrowdControl = supportCrowdControlHolders({ setups, activeNames, skillHitSources, damageSources, rates: hitRateFacts?.ccEvents?.bySetup ?? null });
  lineConditionState.frostTerraOnBoard = setups.some((setup) => setup.name === "Frost Terra" && setup.enabled !== false && activeNames.has(setup.name));
  lineConditionState.crowdControlCounters = crowdControlCounterSources({ setups, activeNames, follower: followerSelection(state) });
  const ccChanceRates = crowdControlChanceRatesNeeded(modifierTexts, lineConditionState.supportCrowdControl, lineConditionState.crowdControlCounters);
  // Gemma – Ice-Fire Fusion (B3): the Fire / Cold skills' casts per second the hit pass measured (Frostfire Rampage's 5 casts).
  lineConditionState.fireColdCastsPerSecond = hitRateFacts?.fireColdCastsPerSecond ?? null;
  const frostfireCasts = lineConditionState.heroId === "gemma-ice-fire-fusion" && modifierTexts.some((line) => line.origin === "trait" && /^Enters Frostfire Rampage after casting Fire or Cold Skills/i.test(String(line.text ?? "").trim()));
  lineConditionState.trauma = hitRateFacts?.trauma ?? null;
  lineConditionState.wilt = hitRateFacts?.wilt ?? null;
  // Condition-unread batch 3 (src/line-conditions.js doubleDamageRecently / skillHitsRecently): Double Damage hits and each skill's uses
  // per second the hit pass measured.
  lineConditionState.doubleDamageHitsPerSecond = hitRateFacts?.doubleDamageHitsPerSecond ?? null;
  lineConditionState.usesBySkill = hitRateFacts?.usesBySkill ?? null;
  // Chunk 6: "+X% additional <Type> Damage on Hit. Stacks up to N time(s). Lasts M s" (src/line-conditions.js stacksOnHit).
  lineConditionState.hitsPerSecond = hitRateFacts?.hitsPerSecond ?? null;
  const recentEventRates = modifierTexts.some((line) => line.origin !== "derived" && /when dealing Double Damage recently, up to|per recent hit with Thunder Focus$|Damage on Hit\. Stacks up to \d+ time\(s\)\. Lasts/i.test(String(line.text ?? "").replace(/\s+/g, " ").trim()));
  lineConditionState.fireCastsPerSecond = hitRateFacts?.fireCastsPerSecond ?? null;
  lineConditionState.shadowHitsPerSecond = hitRateFacts?.shadowHitsPerSecond ?? null;
  // Genius Battlegear (census item #8; src/activation-medium-events.js): the hit pass's Spell Burst activations and stacks consumed.
  lineConditionState.spellBurstEvents = hitRateFacts?.amEvents?.spellBurst ?? null;
  // Youga – Spacetime Illusion (hero trait audit B4): the Main Skill's own cast rate, every cast per second and the character's
  // increased Cast Speed the hit pass measured (Eeeendless Mana's rate, the moon's and I'm Out of Mana's stacks, Make it Quick).
  lineConditionState.yougaSpacetime = hitRateFacts?.youga ?? null;
  // The dummy's Numbed is Erika's own (Charging Tail's carrier and her other Numbed Effect lines reach it, research/hero-erika-lightning-shadow-
  // audit-2026-11-14.md): a source of hers holds it, or her Lightning hits refill it through the per-attacker store (client 0x141ef1180, the
  // planner's 10 held: src/combat-states.js), which they do unless the hit pass measured none.
  // Her hits deal Lightning Damage after conversion (the store's input, type 5108: client 0x141f54ad0), measured by the hit pass, else her damage types.
  const erikaLightningHits = (state) => Number.isFinite(state.lightningHitsPerSecond) ? state.lightningHitsPerSecond > 0 : Boolean(state.dealtDamageTypes?.has?.("Lightning"));
  const erikaOwnNumbed = (state) => Boolean(enemyBuffSet(state)?.holds("Numbed", { by: BY_YOU }) ?? (state.ownAilments || []).includes("Numbed")) || (Boolean(enemyBuffSet(state)?.holds("Numbed") ?? (state.enemyAilments || []).includes("Numbed")) && erikaLightningHits(state));
  // Erika – Lightning Shadow / Vendetta's Sting (hero trait audit B5; src/erika-traits.js): Feline Figure's Numbed state (Charging
  // Tail reads the Main Skill's crit chance the hit pass measured) and the Vendetta's Sting state (Incisive's uptime from the
  // measured Vendetta cycle; held at 1 before).
  lineConditionState.felineFigure = felineFigureState({ heroId: lineConditionState.heroId, modifierTexts, movementSpeedPercent: (lineConditionState.movementSpeedPercent || 0) + (hitRateFacts?.erika?.movementSpeedConditionalPercent || 0), otherNumbed: enemyBuffSet(lineConditionState)?.holds("Numbed") ?? (lineConditionState.enemyAilments || []).includes("Numbed"), otherNumbedOwn: erikaOwnNumbed(lineConditionState), storeKeeps: erikaLightningHits(lineConditionState), requestedConditions, mainUsesPerSecond: lineConditionState.mainUsesPerSecond, critChancePercent: hitRateFacts?.erika?.mainCritChancePercent ?? null });
  lineConditionState.erikaVendetta = vendettaStingState({ heroId: lineConditionState.heroId, modifierTexts, blessingStacks: playerBuffSet(lineConditionState)?.staged("blessing") ? lineConditionState.playerBuffs.blessingStacks() : lineConditionState.blessingStacks, requestedConditions, vendetta: hitRateFacts?.erika?.vendetta ?? null });
  lineConditionState.erikaActivationMediumBlocked = erikaActivationMediumBlocked;
  // Thea (hero trait audit B7; src/thea-traits.js): God's Boon's cadence and the Focus it consumes, the Divine Realm, the dummy deemed
  // at Low Life, Desecration. The Focus held drops to its God's Boon cycle average for the line conditions and the Blessing model.
  lineConditionState.thea = theaState({ heroId: lineConditionState.heroId, modifierTexts, requestedConditions, blessings: earlyBlessings,
    facts: { cooldownRecoverySpeedPercent: lineConditionState.cooldownRecoverySpeedPercent, additionalCooldownRecoverySpeedPercent: lineConditionState.additionalCooldownRecoverySpeedPercent, skillEffectDurationPercent: lineConditionState.skillEffectDurationPercent, realmCompared: state.combat?.conditionMode !== "manual" && typeof exclusiveChoicePins(state.combat)[INSIDE_REALM_CONDITION] !== "boolean", anyDamage: Boolean(lineConditionState.anyHit || lineConditionState.dealsDamageOverTime || damageSources.some((source) => source.status === "modeled")), dealsErosion: Boolean(lineConditionState.dealtDamageTypes?.has("Erosion") || lineConditionState.hitTypes?.has("Erosion") || (enemyBuffSet(lineConditionState)?.holds("Wilt") ?? (lineConditionState.enemyAilments || []).includes("Wilt"))), life: lineConditionState.life, enemyCrowdControl: (enemyBuffSet(lineConditionState)?.types() ?? lineConditionState.enemyAilments ?? []).filter((name) => ["Frostbite", "Freeze", "Frozen"].includes(name)) } });
  // Sage – Licorice Note (hero trait audit B8; src/sage-traits.js): the Basic Scent Bottle's Elixir joins the Elixir setups (its
  // Functional Ingredient reads the crit hits and Reaps the hit pass measured), with the Elixir Skill Effect lines Scent of Ambition
  // and Everlasting Nectar add; the Ingredients, prepared Empower / Curse and Elixir of Immortality settle in the module.
  lineConditionState.sage = sageState({ heroId: lineConditionState.heroId, hero: state.hero, modifierTexts, boardElixirs: lineConditionState.elixirSetups || [], bottleElixirLevel: (name) => setups.find((setup) => setup.name === name)?.effectiveLevel ?? (catalogSkillsByName.get(name)?.baseLevel ?? 20) + skillLevelBonus({ name, role: "elixir", tags: catalogSkillsByName.get(name)?.tags || [] }, levelSources).total, requestedConditions, moving: Boolean(lineConditionState.moving), moveSpeed: lineConditionState.playerMoveSpeed,
    facts: { anyHit: Boolean(lineConditionState.anyHit), minionsCrit: Boolean(lineConditionState.minionsCrit), critHitsPerSecond: hitRateFacts ? hitRateFacts.critHitsPerSecond ?? null : null, reapsPerSecond: hitRateFacts?.sage ? hitRateFacts.sage.reapsPerSecond : null, hasReaping: collectAllReapingSources(modifierTexts).length > 0 || cycleResistReaps(modifierTexts, resolvedMain, activeNames) },
    inputs: lineConditionState.sageInputs || {} });
  if (lineConditionState.sage?.elixirSetups?.length) { lineConditionState.elixirSetups = [...lineConditionState.sage.elixirSetups, ...(lineConditionState.elixirSetups || [])]; lineConditionState.elixirSkill = true; }
  const sageRates = Boolean(lineConditionState.sage?.needsRates);
  // Carino (hero trait audit B9; src/carino-traits.js): the ammo cadence (Q-H8), Special Ammo and Magic Shot, Heat Up, Deflection, Evil
  // Ouroboros. The use-rate factor and the Heat Up cycle read the Projectile casts per second the hit pass measured (before it, the
  // rate factor is 1 and Heat Up is held at max), so a Carino build with ammo runs the measuring pass.
  lineConditionState.carino = carinoState({ heroId: lineConditionState.heroId, hero: state.hero, modifierTexts, requestedConditions, moving: lineConditionState.moving !== false, moveSpeed: lineConditionState.playerMoveSpeed, facts: hitRateFacts?.carino ?? null,
    inputs: { ...(lineConditionState.carinoInputs || {}), skillEffectDurationPercent: lineConditionState.skillEffectDurationPercent, hasReaping: Boolean(lineConditionState.hasReaping), hitRecently: Boolean(lineConditionState.hitRecently) } });
  const carinoRates = Boolean(lineConditionState.carino?.needsRates);
  // Rehan (hero trait audit B10; src/rehan-traits.js): the Rage cycle (Q-H1), Burst, Tunnel Vision (Q-H15), the Seething Spirit and
  // Disarmed. The cycle reads the uses per second the hit pass measured (before it, Berserk is held), so a Rehan build runs the
  // measuring pass.
  // Hysteria's Rage from Life consumed (2026-11-08 build audit gap 5): the Attack Life consume copies as % of Max Life per Attack use at the
  // planner's current Life, and the skill costs paid in Life per second (src/resource-consumption.js, the same model as the readers below).
  // The current Life the "% of current Life" consumes read: the Life balance's level once settled (below), else the planner's Life state
  // (Full Life: the unsealed Max Life; Low Life: 35% of Max Life).
  const consumeCurrentLife = () => lineConditionState.lifeBalance?.settled ? lineConditionState.lifeBalance.currentLife
    : (lineConditionState.stats?.maxLife || 0) * (lineConditionState.life === "low" ? LOW_LIFE_BELOW_PERCENT : Math.max(0, Math.min(100, lineConditionState.lifeRemainingPercent ?? 100))) / 100;
  const rehanLifeConsumeAt = (currentLife) => lineConditionState.heroId && /^rehan/.test(lineConditionState.heroId) && hitRateFacts?.resource ? (() => {
    const maxLife = lineConditionState.stats?.maxLife || 0;
    if (!(maxLife > 0)) return null;
    // The skill-use copies (Blade-dancer's Fingers, record 539780864; 2026-11-11 build audit G2) fire on every use: on the Attack steps the
    // Rage model counts (yours and the Spirit's) like the Attack copies, and on your non-Attack uses as Life consumed per second.
    const skillPercent = skillUseLifeConsumeLines(modifierTexts).reduce((sum, line) => sum + line.percent, 0);
    const percent = attackLifeConsumeLines(modifierTexts).reduce((sum, line) => sum + line.percent, 0) + skillPercent;
    const nonAttackUses = (hitRateFacts.resource.skillUses || []).filter((use) => !use.attack).reduce((sum, use) => sum + use.usesPerSecond * (use.stepsPerUse || 1), 0);
    const costs = resourceConsumption({ setups, activeNames, modifierTexts, uses: { ...hitRateFacts.resource, attackUses: [], skillUses: [] }, maxLife, currentLife, fixedSupportMultiplierPercent: fixedSupportManaMultiplier.percent });
    // Ancestral Hate's 30% reads the balance's current Life once settled (G4); before, Max Life (the module's upper bound).
    return { percentOfMaxPerAttackUse: percent * currentLife / maxLife, otherPercentPerSecond: (costs.skills || []).reduce((sum, skill) => sum + (skill.lifePerSecond || 0), 0) / maxLife * 100 + nonAttackUses * skillPercent * currentLife / maxLife,
      ...(lineConditionState.lifeBalance?.settled ? { currentLifeShare: currentLife / maxLife } : {}) };
  })() : null;
  const settleRehan = () => { const rehanLifeConsume = rehanLifeConsumeAt(consumeCurrentLife()); lineConditionState.rehan = rehanState({ heroId: lineConditionState.heroId, modifierTexts, requestedConditions, facts: hitRateFacts?.rehan ?? null, inputs: { ...(lineConditionState.rehanInputs || {}), ...(rehanLifeConsume ? { lifeConsume: rehanLifeConsume } : {}) } }); };
  settleRehan();
  // The Life balance (2026-11-11 build audit G4; user decision "look at the regain stats"; src/life-balance.js): a build whose consumes take
  // a share of current Life settles its current Life against its Life recovery, frame by frame in the client's order, on the uses the hit
  // pass measured. Every consume, the Life lost readers and the Low Life / Full Life readers take the settled level. Switch `lifeBalance`
  // (default on; off: the Life group's Full Life / Low Life as before); a pinned Low Life (the Life group) keeps the 35% reading.
  if (requestedConditions.lifeBalance !== false && !lineConditionState.lowLifeAssumed && hitRateFacts?.resource && (lineConditionState.stats?.maxLife || 0) > 0) {
    const inputs = lineConditionState.regainInputs?.balanceStats || {};
    const maxLife = lineConditionState.stats.maxLife;
    const regain = requestedConditions.regainEvents !== false ? lifeBalanceRegainFromBuild({ modifierTexts, stats: inputs }) : null;
    // Life Regeneration (attributes 1003 flat + 1004 % of Max Life, × 1002 Life Regeneration Speed; panel "Life Restoration per second").
    const regenerationSpeed = Math.max(0, 1 + (Number(inputs.regenerationSpeedPercent) || 0) / 100) * (Number(inputs.regenerationSpeedAdditional) || 1);
    const regeneration = Math.max(0, ((Number(inputs.regenerationFlat) || 0) + maxLife * (Number(inputs.regenerationPercent) || 0) / 100) * regenerationSpeed);
    const notFullRegeneration = maxLife * notFullRegenerationPercent(modifierTexts) / 100 * regenerationSpeed;
    const hasFervor = modifierTexts.some((line) => /^(?:Have|Has|Gains) Fervor(?: when there are enemies Nearby)?$|^(?:\[[^\]]+\] ?)?Has \d+ point\(s\) of fixed Fervor Rating$/i.test(String(line.text ?? "").trim()));
    const losses = lifeLossStreams({ modifierTexts, ownAilments: lineConditionState.ownAilments || [], hasFervor });
    const tide = modifierTexts.filter((line) => line.origin !== "derived" && /^Non- ?Full Life state will be considered as Low Life$/i.test(String(line.text ?? "").replace(/\s+/g, " ").trim())).map((line) => line.source);
    // Without any Life recovery the consumes have no balance: they would run Life down toward 1 over the fight, at a pace the fight's
    // length decides. That build keeps the Life group's reading, with the reason on the Config tab.
    const recovers = Boolean(regain) || regeneration > 0 || notFullRegeneration > 0;
    if (!recovers) lineConditionState.lifeBalanceSkipped = requestedConditions.regainEvents === false ? "Regain events are off and the build has no Life Regeneration" : "the build has no Life Regain and no Life Regeneration, so its consumes would run Life down toward 1 over the fight";
    for (let round = 0; recovers && round < 4; round += 1) {
      const spiritUses = seethingSpiritUses(lineConditionState.rehan, hitRateFacts.resource);
      const consume = currentLifeConsumeStreams({ setups, activeNames, modifierTexts, uses: hitRateFacts.resource, fixedSupportMultiplierPercent: fixedSupportManaMultiplier.percent, spiritAttackUses: seethingSpiritAttackUses(lineConditionState.rehan, hitRateFacts.resource), spiritUses });
      if (!consume.streams.length) break;
      const balance = settleLifeBalance({ maxLife, unsealedPercent: lineConditionState.lifeRemainingPercent ?? 100, streams: [...consume.streams, ...losses], fixedLifePerSecond: consume.fixedLifePerSecond, regain, hitsPerSecond: Number(hitRateFacts.hitsPerSecond) || 0, regenerationPerSecond: regeneration, notFullRegenerationPerSecond: notFullRegeneration });
      if (!balance.settled) break;
      applyLifeBalance(lineConditionState, balance, { tide });
      const before = Number(spiritUses?.usesPerSecond) || 0;
      settleRehan();
      const after = Number(seethingSpiritUses(lineConditionState.rehan, hitRateFacts.resource)?.usesPerSecond) || 0;
      if (Math.abs(after - before) <= 1e-9 * Math.max(1, before)) break;
    }
  }
  const rehanRates = Boolean(lineConditionState.rehan?.needsRates);
  // Rosa (hero trait audit B11; src/rosa-traits.js): High Court Chariot's Holy Domain / Murderous Intent state and Unsullied Blade's
  // Mystic Mercury / Realm of Mercury cycle. The cycle reads the non-Channeled Attack uses per second and the Elemental hit damage the
  // hit pass measured (before it, Mystic Mercury is held and the Realm waits), so an Unsullied Blade build runs the measuring pass.
  // Mana / Life consumed (census #4, src/resource-consumption.js), before Rosa's cycle: Utmost Devotion's Mercury Pts read the Mana
  // consumed by other methods (2026-11-05 build audit gap 5). Current Mana for the "Consumes X% of current Mana when casting a Main Skill"
  // copies: the unsealed Max Mana at Full Mana, 35% of Max Mana under Low Mana (the planner's Mana state, best case).
  {
    const maxMana = lineConditionState.stats?.maxMana || 0;
    const unsullied = lineConditionState.heroId === "rosa-unsullied-blade";
    const hasRosaLine = (pattern) => modifierTexts.some((line) => line.origin === "trait" && pattern.test(cleanRosa(line.text)));
    // Label 3050610 (137394320, set only without Utmost Devotion's 694509760): Mana can only be consumed by Mystic Mercury.
    const consumeBlocked = unsullied && hasRosaLine(ROSA_PATTERNS.manaLock) && !hasRosaLine(ROSA_PATTERNS.devotionMana) ? "Rosa – Unsullied Blade: Mana can only be consumed by Mystic Mercury (no Utmost Devotion)" : null;
    lineConditionState.resourceConsumption = resourceConsumption({ setups, activeNames, modifierTexts, uses: hitRateFacts?.resource || null, maxMana, maxLife: lineConditionState.stats?.maxLife || 0,
      currentLife: consumeCurrentLife(),
      currentMana: maxMana * (lineConditionState.mana === "low" ? LOW_LIFE_BELOW_PERCENT : Math.max(0, Math.min(100, lineConditionState.manaRemainingPercent ?? 100))) / 100, consumeBlocked, fixedSupportMultiplierPercent: fixedSupportManaMultiplier.percent,
      spiritAttackUses: seethingSpiritAttackUses(lineConditionState.rehan, hitRateFacts?.resource), spiritUses: seethingSpiritUses(lineConditionState.rehan, hitRateFacts?.resource) });
  }
  lineConditionState.rosa = rosaState({ heroId: lineConditionState.heroId, modifierTexts, requestedConditions, facts: hitRateFacts?.rosa ?? null,
    inputs: { ...(lineConditionState.rosaInputs || {}), enemyAilments: enemyBuffSet(lineConditionState)?.types() ?? lineConditionState.enemyAilments ?? [],
      // Utmost Devotion's Mercury Pts read every Mana consumed (record 694509760: node 612 on data type 10000010): the skill costs and the
      // "Consumes X% of current Mana" copies the consumption model measured (2026-11-05 build audit gap 5).
      otherManaPerSecond: lineConditionState.resourceConsumption?.measured ? Number(lineConditionState.resourceConsumption.manaPerSecond) || 0 : 0 } });
  const rosaRates = Boolean(lineConditionState.rosa?.needsRates);
  // Combat Block Chance for the block readers (wiring fix W6b, 2026-11-03; research/wiring-audit-producers-2026-11-03.md item 8): the panel
  // block + Aegis of Fire's own buff while it is up (records 468337 / 965147 and the "… while Aegis of Fire is active" lines; best case,
  // src/aegis-of-fire.js) + Rosa's "For every N Murderous Intent …, +X% Attack and Spell Block Chance" (record 5623221: attr 4800 / 4801
  // from GetFemaleKnightEnergy ÷ p0 × p2, linear) at the Holy Domain's held Murderous Intent. The Effective HP view keeps its own reading.
  {
    const aegis = aegisOfFireState({ modifierTexts, activation: { setups, activeNames }, state });
    const combatBlock = blockWithAegisOfFire(block, aegis);
    const rosaBlock = Number(lineConditionState.rosa?.chariot?.moonBlockChance) || 0;
    if (lineConditionState.rosa?.chariot) lineConditionState.rosa.chariot.blockReaderLive = Boolean(lineConditionState.blockReaderLive);
    const cap = (value) => Math.max(0, Math.min(MAX_BLOCK_CHANCE_PERCENT, value));
    const attack = block.attackChance === 0 && (block.sources || []).some((item) => item.stat === "cannotAttack") ? 0 : cap((combatBlock.attackChance || 0) + rosaBlock);
    const spell = block.spellChance === 0 && (block.sources || []).some((item) => item.stat === "cannotSpell") ? 0 : cap((combatBlock.spellChance || 0) + rosaBlock);
    if (attack !== lineConditionState.blockChance.attack || spell !== lineConditionState.blockChance.spell) {
      lineConditionState.blockChance = { attack, spell, combat: { aegis: Boolean(aegis.active), rosaPercent: rosaBlock, panel: { attack: block.attackChance || 0, spell: block.spellChance || 0 } } };
      putBlock(lineConditionState.playerBuffs, { attack, spell, aegis: Boolean(aegis.active), rosaPercent: rosaBlock });
    }
  }
  // Bing – Blast Nova's Firepower Coverage (Q-H15): the badge and the switch read it (src/hero-trait-modules.js "bombs").
  lineConditionState.firepowerCoverage = firepowerCoverage;
  // Bing (hero trait audit B12; src/bing-traits.js): Blast Nova's bombs on the Main Skill (Q-H14) and Creative Genius's Whimsy /
  // Ingenuity engine. The bombs read the Main Skill's crit chance and Attack Speed bonus, Creative Genius the Main Skill's casts and
  // Spell Burst activations the hit pass measured (before it, the Overload waits), so a Bing build runs the measuring pass.
  {
    const bingTags = (setup) => new Set(setup?.tags || []);
    lineConditionState.bing = bingState({ heroId: lineConditionState.heroId, modifierTexts, requestedConditions, facts: hitRateFacts?.bing ?? null,
      inputs: { main: resolvedMain ? { name: resolvedMain.name, setupKey: resolvedMain.setupKey, tags: [...bingTags(resolvedMain)], channeled: /channel/.test(inferDamageProfile(resolvedMain)?.useModel?.kind || "") } : null,
        moving: Boolean(lineConditionState.moving), buildMaxSpellBurst, mainTriggered: bingMainTriggered, skillEffectDurationPercent: lineConditionState.skillEffectDurationPercent,
        // Recipe 117038480's trigger: tags Spell without Burst of Anger's 6101426, or 5200090 (attr tag "Moon Strike": Split 607995).
        dealsSpell: damageSources.some((source) => { if (source.status !== "modeled") return false; const setup = setups.find((item) => item.setupKey === source.setupKey); return setup?.name === "Moon Strike" || (setup?.name !== "Burst of Anger" && bingTags(setup).has("Spell")); }),
        // GetBuffCfgIdCountByTag([5100311]) + ([5100304]) (53529464): the board skills whose buff record carries the Empower or Defensive tag (W9 step 4).
        empowerDefensive: setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (bingTags(setup).has("Empower") || bingTags(setup).has("Defensive")) && empowerOrDefensiveTaggedName(setup.name)).map((setup) => setup.name),
        // Each one's share of the time held (census C5, 2026-11-15): an Empower Skill at its buff's steady uptime (src/empower-buffs.js,
        // through the unit buff set), a Defensive Skill at its own buff's uptime (src/defensive-buffs.js, stage "defensive").
        empowerDefensiveShares: empowerTagShares(lineConditionState.playerBuffs, { defensive: true }),
        // The Defensive buffs an item alternates (Dual Kismet: Twin Cities, "Every 4s, alternate between gaining Lv. 12 Delayed Pain and Frost
        // Shield for 5s"; buffs 10430 / 10140 carry tag 5100304): src/bing-traits.js heldDefensiveBuffs (10 T claim audit H1, provisional).
        heldDefensiveBuffs: heldDefensiveBuffs(modifierTexts) } });
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
  if (theaFocus !== null && lineConditionState.blessingStacks) { lineConditionState.blessingStacks.Focus = Math.min(lineConditionState.blessingStacks.Focus ?? 0, theaFocus); lineConditionState.playerBuffs?.setStacks("Focus", lineConditionState.blessingStacks.Focus, { stage: "blessing" }); }
  // Lightning Shadow: the hit pass measures her Lightning hits (the store that keeps Feline Figure's Numbed, src/erika-traits.js storeKept).
  const erikaRates = Boolean(lineConditionState.felineFigure?.tail || lineConditionState.felineFigure?.active || lineConditionState.erikaVendetta?.granted);
  const yougaIllusionRates = lineConditionState.heroId === "youga-spacetime-illusion" && modifierTexts.some((line) => line.origin === "trait" && /^The Spacetime Illusion uses your Main Skill once every/i.test(String(line.text ?? "").trim()));
  // Mana / Life consumed recently (census #4, src/resource-consumption.js): a line or an active setup's support reads it, so the hit
  // pass measures the player-cast uses; before that (and without such a line) the model is unmeasured and its lines stay off.
  // Hysteria's "Generate N Rage for every X% Max Life consumed" (record 698202) reads the consumption too (2026-11-08 build audit gap 5).
  const resourceRates = modifierTexts.some((line) => RESOURCE_CONSUMED_LINE.test(String(line.text ?? "")) || /Rage for every [\d.]+% Max Life consumed/i.test(String(line.text ?? ""))) || setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.supports || []).some((support) => support.enabled !== false && (support.effects || []).some((text) => RESOURCE_CONSUMED_LINE.test(String(text)))));
  lineConditionState.evadeChance = evadeChance(lineConditionState.stats?.evasion || 0, EHP_DEFAULTS.enemyLevel);
  // Census item #2 (src/support-effects.js, src/support-buff-effects.js): Electric Overload's crit-buff uptime and Psychic Surge's share
  // of Spell Burst activations read the hit pass's rates.
  const censusSupportRates = setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.supports || []).some((support) => support.enabled !== false && (["Electric Overload", "Psychic Surge", "Modularization: Calibrate"].includes(support.name) || BATCH4_RATE_SUPPORTS.has(support.name) || BATCH5_RATE_SUPPORTS.has(support.name) || CHUNK8_RATE_SUPPORTS.has(support.name))));
  // Census items #8 / #12 (src/activation-medium-events.js): Activation Medium event triggers / sources and Genius Battlegear read the
  // hit pass's event rates.
  const amEventRates = setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.supports || []).some((support) => support.enabled !== false && /^Activation Medium: (?:Spell Burst|Demolisher|Resonance|Track|Instruction)$/.test(support.name || "")))
    || modifierTexts.some((line) => GENIUS_BATTLEGEAR_LINE.test(String(line.text ?? "").replace(/\s+/g, " ").replace(/\s+%/g, "%").trim()));
  // Spell Burst Charge gained on your uses ("+X% chance to immediately gain N stack(s) of Spell Burst Charge when using a skill", record 32278;
  // src/spell-burst-refill.js, 15 T Chain Lightning audit G1): the hit pass measures the uses of yours that raise 1000074 and the refilled hits.
  const spellBurstRefillRates = modifierTexts.some((line) => SPELL_BURST_USE_GAIN.test(normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim()));
  // Machine's Joy (Moto – Order Calling): stacks from your own hits (src/moto-iris-traits.js joyAverageFactor).
  const motoRates = lineConditionState.heroId === "moto-order-calling" && modifierTexts.some((line) => line?.origin !== "derived" && /additional Overload Effect on hit/i.test(String(line?.text ?? "")));
  // The follower's Numbed alone holds 1 stack (src/combat-states.js followerNumbedOnly): it reads your Lightning hits per second.
  const revivedNumbedRates = modifierTexts.some((line) => line?.origin !== "derived" && /Lightning Damage is dealt, inflicts \d+ stack\(s\) of Numbed|^The Follower inflicts Numbed on the dummy$/i.test(String(line?.text ?? "")));
  const firstPassFacts = modifierTexts.some((line) => isDerivedLevelLine(line.text) || /Affliction Effect for every 1 Blur Rating$|Damage to Attacks and Spells while Blur is active$|^[+-][\d.]+% Crowd Control Effects? and \+[\d.]+% additional Ailment Damage while Blur is active$/i.test(String(line.text ?? "").trim()));
  // (Daze's Crowd Control Effect, src/combat-states.js crowdControlEffectBlur, reads the held Blur too: 2026-11-15.)
  // The hit pass also measures the damage types each modeled hit really deals (`dealtTypes`, read on the second pass by every
  // "deals <Type> Damage" reader: 2026-11-05), so any build with a modeled skill hit runs it.
  const dealtTypeRates = skillHitSources.length > 0;
  // Other active skills pressed on the dummy (src/press-schedule.js): the second pass reads their classification (hitRateFacts.pressInputs).
  const pressRates = requestedConditions[PRESS_SWITCH] !== false && setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && setup.setupKey !== resolvedMain?.setupKey && setup.role !== "support" && setupBoardTab(setup) === "skills");
  // Thornfield: Sacrifice (record 778012032 row 3): a stack chance on each Reap of yours, so its held stacks read the Reaps per second the
  // measuring pass found (src/support-conditional-batch4.js sacrificeStacks; 8 T Thornfield audit G2, 2026-11-13).
  const sacrificeRates = setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.supports || []).some((support) => support?.enabled !== false && support?.name === "Thornfield: Sacrifice (Magnificent)"));
  const probeDebuffHitRates = !debuffHitRates && (sacrificeRates || pressRates || dealtTypeRates || firstPassFacts || revivedNumbedRates ||motoRates || amEventRates || empowerRates || censusSupportRates || lineConditionState.chanceParalysis.length > 0 || critNumbedBuffs.entries.length > 0 || multistrikeTriggered || consumptionCores || rateDebuffCores || frostfireCasts || yougaIllusionRates || erikaRates || sageRates || carinoRates || rehanRates || rosaRates || bingRates || resourceRates || recentEventRates || ccChanceRates || minionAilmentRates || minionFrostbiteRates || useSourceRates || spellBurstBlessingRates || mainCastRates || spellBurstRefillRates || Boolean(trueFlameSetup));
  if (probeDebuffHitRates) skipVariation = true;
  // Census batch 6 (src/minion-sentry-batch6.js): Maniacal Army's Command gain (buff 10960, "+15 Command per second" while its Synthetic
  // Troop Minions deal damage) as a derived Command source line, before the first Command read (src/minion-cores.js commandState).
  modifierTexts.push(...maniacalArmyCommandLines({ setups, activeNames, troopSummon: (setup) => COMMAND_FAMILIES.includes(MINION_PROFILES[inferDamageProfile(setup)?.minionKey]?.family) }));
  // Moto / Iris (hero trait audit B6; src/moto-iris-traits.js): the loadout's trait state, before the line effects (its module
  // entries and best-case switches) and the Minions (their trait inputs); the badges settle after the Minion pass.
  lineConditionState.motoIris = motoIrisState({ heroId: lineConditionState.heroId, modifierTexts, requestedConditions, command: commandState(modifierTexts, { full: requestedConditions.fullCommand !== false, minionsCrit: Boolean(lineConditionState.minionsCrit) }),
    stats: { maxLife: lineConditionState.stats?.maxLife, maxEnergyShield: lineConditionState.stats?.maxEnergyShield, armor: lineConditionState.worldWithinInputs?.armor }, castSpeedPercent: lineConditionState.castSpeedStatPercent,
    minions: damageSources.filter((source) => source.status === "modeled" && source.profile?.engine === "minion").map((source) => ({ key: source.profile.minionKey, family: source.profile.family, minion: source.profile.minion })),
    traitSupports: state.hero?.heroTraitSupports || {}, playerHitsPerSecond: hitRateFacts?.hitsPerSecond ?? 0,
    facts: { cooldownRecoverySpeedPercent: lineConditionState.cooldownRecoverySpeedPercent, additionalCooldownRecoverySpeedPercent: lineConditionState.additionalCooldownRecoverySpeedPercent, skillEffectDurationPercent: lineConditionState.skillEffectDurationPercent } });
  // Focused Slash / Focused Shot: "Gains Fervor when this skill hits" makes an enabled copy a Fervor source for every Fervor reader (chunk 7).
  for (const setup of setups) if (activeNames.has(setup.name) && /^Focused (?:Slash|Shot)$/.test(setup.name)) modifierTexts.push({ text: "Gains Fervor", source: `${setup.name}: Gains Fervor when this skill hits`, origin: "skill", multiplier: 1 });
  modifierTexts.push(...chunk8BuildLines({ setups, activeNames }));
  // Defense Form's Weaken chance reads the summoner's Command (src/crowd-control-recipes.js DROPPED_LOCALS), after the Command source lines.
  if (lineConditionState.supportCrowdControl.some((holder) => holder.reading.rows.some((row) => row.chanceLocal?.kind === "command"))) lineConditionState.commandPoints = commandState(modifierTexts, { full: requestedConditions.fullCommand !== false, minionsCrit: Boolean(lineConditionState.minionsCrit) })?.points ?? null;
  // The summoner's Command (a resource) as a level on your unit buff set (W9 step 2), where the line state holds it.
  if (lineConditionState.commandPoints !== undefined) lineConditionState.playerBuffs?.setLevel("Command", lineConditionState.commandPoints);
  const lineEffects = resolveLineEffects(modifierTexts, lineConditionState);
  // Stab In The Back (game record 112064: trigger 1000069 on the Main tag, gate Blur (state 4000060), node 302 removes Blur, node 624 aFL
  // 57191 bOnlyNextLoopAction / bOnceToSkill; user decision 2026-11-13, 8 T Thornfield audit G7, a user-pasted AI answer agreeing with the
  // records, provisional: open question stab-in-the-back-terra-dot): the cast's "+X% additional damage" reaches that cast's whole skill
  // instance: the Main Skill's own hits, and a Terra's damage over time for that area's life (so the Reaps settling it). Only casts that find
  // Blur take it: share = min(1, Blur gain rate ÷ Main Skill casts per second) (Q5, src/consumption-procs.js settle); Blur's own lines hold
  // blurHeldShare below. One additional line on the Main Skill's own ledger (src/line-conditions.js consumeBlurPerCast: no build-wide line).
  const stabInTheBackLines = (setupKey) => !setupKey || setupKey !== resolvedMain?.setupKey ? [] : (lineEffects.lines || []).filter((entry) => entry.condition === "consumeBlurPerCast" && entry.active && entry.ownSkillOnly).flatMap((entry) => entry.bodies.map((item) => {
    const value = Number(String(item.derivedText || "").match(/^\+?([\d.]+)% additional damage$/i)?.[1]);
    return Number.isFinite(value) && value > 0 ? { source: /Stab In The Back/.test(entry.source) ? entry.source : `${entry.source}: Stab In The Back`, text: `${item.derivedText} for each Main Skill cast that finds Blur (${Math.round((entry.factor ?? 1) * 1000) / 10}% of casts; game record 112064 node 624: the cast's own hits and damage over time; provisional)`, value, category: "Additional damage" } : null;
  })).filter(Boolean);
  // Prophecy of Punishment (Thea – Wisdom of The Gods; src/thea-traits.js): Lucky Damage (label 3000090) for the share of time Focus
  // equals Agility: a part-time Lucky window, which the luck count reads (src/lucky-damage.js luckyRollFraction; a fractional roll count
  // no longer reaches it since the count replaced the rolls).
  const theaLuckyShare = lineConditionState.thea?.wisdom?.punishment?.share || 0;
  if (theaLuckyShare > 0 && lineEffects.combat?.lucky) lineEffects.combat.lucky.partial = [...(lineEffects.combat.lucky.partial || []), { share: theaLuckyShare, source: "Prophecy of Punishment (Focus equals Agility)" }];
  // Thunderlight Bond: "Damage triggers Lucky when buffs are persistent" (uptime 1; src/empower-buffs.js).
  if (empowerEarly.lucky && lineEffects.combat?.lucky) lineEffects.combat.lucky.damageRolls = Math.max(lineEffects.combat.lucky.damageRolls || 1, 2);
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
  // Held conditional Movement Speed (2026-11-09, user-approved; src/character-stats.js conditionalMovementSpeed): a line whose condition the
  // resolver holds ("+8% Attack Speed, Cast Speed, and Movement Speed when having Hasten", record 30030214) adds its Movement Speed body,
  // which no reader takes, and the derived conditional lines (combat states, the follower, hero modules) theirs, to the stat sheet's
  // figure for every reader from here on (the Mobility attacks' Movement Speed share, Chunk 8's conversions). The readers before the
  // line resolver (Wind Stalker, Red Shoes) keep the stat sheet's figure; Feline Figure (Wild Lightning) takes this pass's held figure on the
  // hit pass (hitRateFacts.erika.movementSpeedConditionalPercent; 2026-11-14).
  const heldMovement = conditionalMovementSpeed(lineEffects);
  lineConditionState.movementSpeedSheetPercent = lineConditionState.movementSpeedPercent || 0;
  lineConditionState.movementSpeedConditional = heldMovement;
  if (heldMovement.percent) lineConditionState.movementSpeedPercent = (lineConditionState.movementSpeedPercent || 0) + heldMovement.percent;
  // Haze's "+X% additional Damage per +Y% Movement Speed" (game affix 647724864: node 114 reads the increased Movement Speed at every read)
  // on the combat figure: settled again once the held conditional Movement Speed is in (src/line-effects.js resettleLineEffects).
  if (heldMovement.percent && resettleLineEffects(lineEffects, "perMovementSpeed", lineConditionState, modifierTexts)) mechanics = collectMechanics();
  // The player's movement speed from the combat Movement Speed (user decision 2026-11-10): the per-metre readers from here on (the ring's
  // movement Barrier, Hunting Tempo, Thunder Focus). Carino's Deflection and Sage's Tumbleweed Seed, read above, keep the stat sheet's speed.
  lineConditionState.playerMoveSpeed = playerMoveSpeed({ increasedPercent: lineConditionState.movementSpeedPercent || 0, additionalFactor: (lineConditionState.movementSpeedAdditionalFactor || 1) * (heldMovement.additionalFactor || 1) });
  // Held conditional Max Energy Shield (10 T claim audit G3d, 2026-11-09, user-approved best case): "+16% additional Max Energy Shield
  // while moving" (Long Night Sorcerer's Boots) holds under the Movement group's moving, no engine reads the body, so it joins the one
  // Max Energy Shield pool (src/effective-hp.js energyShieldPoolExtra) for the readers from here on (Barrier Burst's Shield).
  {
    const rebuild = ENERGY_SHIELD_POOL_REBUILD.get(lineConditionState);
    const held = heldConditionalPoolExtra(lineEffects, "maxEnergyShield");
    if (rebuild && lineConditionState.stats && (held.flat.length || held.increased.length || held.additional.length)) lineConditionState.stats.maxEnergyShield = rebuild(lineEffects);
  }
  // The Empower / Warcry buff lines settled again once the line effects' derived lines are in (2026-10-27): a trait-derived "+X%
  // Empower Skill Effect" (Sage's Pungent Stimulant Salt) joins only now, after the early pass resolved the buff lines. Changed
  // lines replace the early ones before any damage ledger reads them (tests/hero-traits-b8.test.js).
  {
    const isBuff = (line) => line.empowerBuff || line.warcryBuff;
    const earlyLines = new Set(empowerEarly.lines.filter(isBuff));
    const settled = resolveEmpowerEffects({ setups, activeNames, modifierTexts: modifierTexts.filter((line) => !earlyLines.has(line)), enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), enemyBuffs: mechanics.enemyAilments.set, prebuiltSelfBuffs: requestedConditions.prebuiltSelfBuffs !== false, multistrikeEventsPerSecond: hitRateFacts?.multistrikeEventsPerSecond ?? null, context: empowerBuffContext, warcriesOnCooldown: requestedConditions.warcriesOnCooldown !== false, itemSkillLevel });
    const lateLines = settled.lines.filter(isBuff), key = (line) => `${line.source}|${line.text}`;
    if ([...earlyLines].map(key).join("\n") !== lateLines.map(key).join("\n")) {
      for (let index = modifierTexts.length - 1; index >= 0; index--) if (earlyLines.has(modifierTexts[index])) modifierTexts.splice(index, 1);
      modifierTexts.push(...lateLines);
      mechanics = collectMechanics();
    }
  }
  modifierTexts.push(...mechanics.syntheticTexts);
  // Active auras' "+X% additional Physical/Erosion Damage" (e.g. Weapon Amplification, Erosion
  // Amplification) reach Trauma / Wilt when the build inflicts them (src/aura-damage.js).
  const auraAilmentDamageTypes = new Set([["trauma", "Physical"], ["wilt", "Erosion"]].filter(([key]) => hasAilmentBase(key, modifierTexts)).map(([, type]) => type));
  for (const source of skillDotSources) auraAilmentDamageTypes.add(source.profile.damageType);
  if (permafrostTerraDots) auraAilmentDamageTypes.add("Cold"); // Ice Lances: Permafrost's Frost Terra DoT (src/permafrost-terra.js)
  for (const source of skillHitSources) for (const type of sourceDealtTypes(source, dealtBySetup)) auraAilmentDamageTypes.add(type);
  modifierTexts.push(...auraDamageModifierTexts(aura.entries, auraAilmentDamageTypes));
  // "Bonus and additional bonus to Spell Damage … also apply to Attack Damage" (Rosa – Unsullied Blade; hero trait audit B2,
  // src/spell-to-attack.js): the Spell damage lines, resolved conditional bodies and Aura lines included, copied to Attack.
  const spellToAttack = spellToAttackLines(modifierTexts);
  if (spellToAttack.copies.length) modifierTexts.push(...spellToAttack.copies);
  for (const line of spellToAttack.sources) {
    const attackSkill = lineConditionState.activeTags?.has?.("Attack");
    // The active Auras' Spell Damage writes reach the Attack hits too (label 3000114 on the scale stage; src/skill-hit-model.js spellScaleStage).
    const spellAuras = aura.entries.filter((entry) => activeNames.has(entry.name) && entry.effectiveEffects?.additionalSpellDamagePercent).map((entry) => entry.name);
    const active = Boolean(attackSkill && (spellToAttack.copies.length || spellAuras.length));
    const reached = [...spellToAttack.copies.map((copy) => copy.text), ...spellAuras.map((name) => `${name}'s additional Spell Damage`)];
    lineEffects.lines.push({ source: line.source, origin: line.origin, text: normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim(), condition: "spellToAttack", params: {}, group: null, active,
      conditionText: !attackSkill ? "no active Attack skill" : !reached.length ? "no Spell Damage line in the build" : `${reached.length} Spell Damage line${reached.length === 1 ? "" : "s"} also reach Attack skills (${reached.join(", ")}; provisional)`,
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
    // at t = 0). It is an untyped derived "additional damage taken" line: the generic skill hits read it, and since 2026-11-12 a skill's own
    // DoT too (`allDamageTaken`; record 611820480 row 2: node 101 on the enemy, attr 5720 mod 4, no tag, so all damage; its Reaps settle the
    // DoT; research/build-20t-mind-control-audit-2026-11-12.md G6). The curse is read as staying on the dummy 2 s or more even where the
    // supported curse is cleared and re-inflicted at once (Shackles of Malice's explosion; inferred, open question deepened-curse-survival).
    // Since 2026-11-12 (user-approved) it joins the Ignite ledger's damage-taken bucket, Paralysis's (src/build-mechanics.js
    // addLateDamageTakenLine), so Ignite (the beam's and the generic one), Trauma, Wilt and a skill's own DoT read it there once, and their Reaps.
    // It read No DPS effect before 2026-10-18.
    for (const line of setup.supportEffects?.curseTaken || []) {
      if (!(line.value > 0)) continue;
      const source = `${setup.name}: ${line.support} (curse on the dummy for ${line.delaySeconds} s or more)`;
      const takenLine = { text: `+${line.value}% additional damage taken`, source, origin: "derived", multiplier: 1, allDamageTaken: true };
      modifierTexts.push(takenLine);
      addLateDamageTakenLine(mechanics, takenLine, activeNames);
      (lineEffects.combat.timedEffects ||= []).push({ id: `curseTaken:${setup.setupKey}:${line.support}`, label: source, source, text: line.text, target: "enemy", toggle: false, enabled: true, active: true, provisional: false,
        parts: [{ type: null, reach: "all", percent: line.value, schedule: { kind: "steps", points: [[0, 0], [line.delaySeconds, 1]], sustained: 1 } }] });
    }
    // Game mode (research §17): the curse's debuff record at the setup's level; text mode: the Lv.20 reference data value.
    const effect = curseTakenEffect(setup.name, setup.effects?.length ? setup.effects : undefined, setup.effectiveLevel ?? null);
    if (!effect) continue;
    // Sage's Pungent Stimulant Salt: additional effect on the prepared cast of a skill-bar Curse, never a gear-triggered one (src/sage-traits.js).
    const preparedCurse = lineConditionState.sage?.preparedCurseFactor ?? 1;
    const line = curseTakenLine(preparedCurse === 1 ? effect : { ...effect, value: effect.value * preparedCurse }, mechanics.curses.effectPercent);
    const source = `${setup.name} curse (${effect.levelSource ? `Lv.${effect.level} value ${effect.value}%` : "Lv.20 value"} × ${1 + mechanics.curses.effectPercent / 100} Curse Effect${preparedCurse === 1 ? "" : ` × ${preparedCurse} prepared cast`})`;
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
  // Focus skills: every Focus buff (board or item-granted, either form) is read whole from its game record in build-mechanics.js
  // (src/focus-buffs.js; W6c 2026-11-03). The hand-kept loop here (the reference data level table's additional damage of Thunder / Ice / Flame
  // Focus, not scaled by Focus Buff Effect, the Precise forms unread) is gone.
  // Pact lines conditional on Full Life (Firewing "+80% Affliction effect at Full Life", "10.5 Affliction inflicted
  // per second on Full Life"): the dummy never attacks and Energy Shield absorbs stray damage, so Full Life holds
  // (assumption; condition fullLife) unless Sealed Life leaves under 95% of Max Life unsealed: Full Life is unsealed,
  // filled Life at least 95% of Max Life (user-confirmed 2026-10-12), so such a build is never at Full Life and the
  // lines are off. They join the pact totals the ledger reads; the Pacts page totals are untouched.
  const fullLifeHolds = atFullLife(lineConditionState);
  const fullLife = { active: requestedConditions.fullLife !== false && fullLifeHolds, sealedOut: !fullLifeHolds && !lineConditionState.lowLifeAssumed && !lineConditionState.lifeBalance?.settled, lifeRemainingPercent: lineConditionState.lifeRemainingPercent, afflictionEffectPercent: 0, afflictionPerSecond: 0, lines: [] };
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
  // it from the reference data keyword: 0.8 s channel interval, 4 stacks, one use per bubble; src/selena-leftover-traits.js bardSongState, switch
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
  // Cooldown and trigger-interval snapping stays implemented (src/skill-hit-model.js, src/trigger-interval.js) behind the internal condition
  // frameSnapCooldowns, no control, off unless a stored state sets it (research and tests only). The Reap toggle (reapFrameSnap, 2026-10-23)
  // is gone since chunk 15 (2026-11-01): the tick engine runs every Reap on whole 1/30 s frames on the recount and the windows, so an old
  // saved key is ignored.
  const frameSnapTimers = requestedConditions.frameSnapCooldowns === true;
  const damageCombat = { ...state.combat, targetFireResistancePercent: fixedFireResistance ?? state.combat.targetFireResistancePercent, idyllStacks: conditions.idyll ? state.combat.idyllStacks : 0 };
  // The follower's Origin Tartarus: Shackles of Malice holds Ill Will on the dummy (src/follower-model.js followerIllWill, 2026-11-12): its
  // Erosion, Cold and Lightning Resistance here (illWillResistance: the flat stat, Elemental Resistance added up to the Max Resistance of 60,
  // before your penetration; the steady uptime), its Fire Resistance through ignitedFireResistance below. Every reader of these (your hits,
  // DoTs, ailments and the Reaps that settle them, your Minions, the follower's own damage) takes it.
  const illWill = lineEffects.follower?.illWill || null;
  const illWillBase = illWill ? { Erosion: damageCombat.targetErosionResistancePercent ?? level85DummyDefenses.erosionResistancePercent, Cold: damageCombat.targetColdResistancePercent ?? level85DummyDefenses.coldResistancePercent, Lightning: damageCombat.targetLightningResistancePercent ?? level85DummyDefenses.lightningResistancePercent } : null;
  if (illWill) for (const [type, base] of Object.entries(illWillBase)) damageCombat[`target${type}ResistancePercent`] = illWillResistance(illWill, type, base);
  // Talent nodes (captured or text, src/talent-text-effects.js) and slate copies of Warlord [5,2] inflict Fire Infiltration.
  if (!talent.setup.panels.some((panel) => panel.allocatedNodes.some((node) => node.rank > 0 && node.effects?.inflictsFireInfiltrationAgainstIgnited)) && !(talentSlate.candidateSlate?.inflictsFireInfiltrationAgainstIgnited > 0)) conditions.fireInfiltration = false;
  // Aim charges and uptime are derived from the build (aim-model.js); an explicit
  // aimCharges or a non-sentinel aimUptimePercent in the state is a manual override.
  // "Triggers Lv. 30 Aim while standing still. Interval: 1 s" (gear affix batch D, 2026-10-22; src/item-triggered-skills.js): with no
  // Aim on the skill board, the item casts a Lv. N Aim while standing still (the movement group), at most once per Aim's cooldown
  // (the Activation Medium rule: rate = 1 / max(trigger interval, cooldown); provisional). Its level is the item's + the build's skill level
  // lines (user decision 2026-11-16, itemSkillLevel: Illusory Chimera's Lv. 20 Aim reads Lv. 29 on the 30 T build, as its town panel's Buff
  // factor fits); Aim's buff takes its game level map at that level (src/aim-model.js).
  const boardAim = setups.find((setup) => setup.name === "Aim" && setup.enabled !== false && activeNames.has(setup.name));
  const gearAim = boardAim ? null : modifierTexts.filter((line) => line.origin !== "derived").map((line) => ({ line, trigger: parseItemTrigger(line.text) })).find((item) => item.trigger?.name === "Aim" && item.trigger.intervalSeconds > 0) || null;
  const gearAimEvent = gearAim ? itemTriggerEvent(gearAim.trigger, { moving: conditions.moving }) : null;
  const gearAimSetup = gearAimEvent?.active && requestedConditions.aim !== false ? { ...(catalogSkillsByName.get("Aim") || {}), name: "Aim", role: "item-trigger", ...itemSkillLevel("Aim", gearAim.trigger.level, gearAim.line), supports: [], enabled: true, setupKey: "item-trigger:Aim" } : null;
  if (gearAimSetup) conditions.aim = true;
  const aim = calculateAim(boardAim || gearAimSetup || setups.find((setup) => setup.name === "Aim"), { enabled: conditions.aim !== false, uptimePercent: state.combat.aimUptimePercent, charges: state.combat.aimCharges, battleStacks: state.combat.aimBattleStacks ?? 3, modifierTexts,
    itemTrigger: gearAimSetup ? { source: gearAim.line.source, everySeconds: gearAim.trigger.intervalSeconds, text: `${gearAim.line.source}: every ${gearAim.trigger.intervalSeconds} s while standing still` } : null });
  damageCombat.aimDamagePercent = aim.ailmentDamagePercent;
  damageCombat.aimUptimePercent = aim.uptimePercent;
  damageCombat.aimUptimeLabel = aim.uptimeLabel;
  const curses = curseEffects(setups, mechanics.curses.effectPercent);
  if (!activeNames.has("Scorch") && mechanics.curses.gearScorch) curses.scorchDamagePercent = mechanics.curses.gearScorch.percent;
  else if (activeNames.has("Scorch")) curses.scorchDamagePercent *= lineConditionState.sage?.preparedCurseFactor ?? 1;
  if (activeNames.has("Entangled Pain")) curses.entangledPainDamagePercent *= lineConditionState.sage?.preparedCurseFactor ?? 1;
  const memoryEquipment = { ...equipment, candidate: { ...equipment.candidate } };
  for (const [key, value] of Object.entries(heroMemories.totals)) memoryEquipment.candidate[key] = (memoryEquipment.candidate[key] || 0) + value;
  for (const line of block.ratingSources) memoryEquipment.candidate["spellCriticalStrikeRatingPercent:increased"] = (memoryEquipment.candidate["spellCriticalStrikeRatingPercent:increased"] || 0) + line.value;
  // A channeled Scorching Beam Main Skill loses the other pressed skills' use time from its channel (src/press-schedule.js, castOtherSkills).
  const pressedBeamRate = (rate) => mainPressShare < 1 && resolvedMain?.name === "Scorching Beam" ? { ...rate, castsPerSecond: rate.castsPerSecond * mainPressShare, pressShare: mainPressShare } : rate;
  let beamCastRate = pressedBeamRate(scorchingBeamCastRate({ speedAdjust, lineSpeed: lineEffects.castSpeed, ceaselessTide: heroMemories.ceaselessTide, main, talentSlate, equipment: memoryEquipment, pact, aimCastSpeedPercent: aim.averageCastSpeedPercent }));
  // "Adds -99% additional Base Ailment Damage" and "Gains X% - Y% of the added Flat Damage's value as Base Ignite Damage" on the beam's
  // Ignite (Evil Heart Armor, Confusion Elemental Belt): the generic ailments' reading (src/ailment-model.js ailmentBaseSettle) on the
  // beam's added flat damage. Set on mechanics.ignite before the first compile, so every compile, its Reaps and the recount read it.
  const igniteBaseTyped = activeNames.has("Scorching Beam") ? collectAilmentTypedSources("ignite", modifierTexts) : null;
  if (igniteBaseTyped && (igniteBaseTyped.baseAdditional.length || igniteBaseTyped.flatBase.length)) {
    const flatAdded = beamFlatAdded(scorchingBeamAddedDamage({ main, equipment, slates: slate.setup, equippedSlateIds: equipped, talents: talent.setup, pacts: state.pacts, stats: lineConditionState.stats }));
    mechanics.ignite.igniteBaseSettle = {
      baseScale: ailmentBaseSettle(igniteBaseTyped, flatAdded).baseScale,
      scaleLines: igniteBaseTyped.baseAdditional.slice(0, 1).map((line) => ({ source: line.source, text: igniteBaseTyped.baseAdditional.map((item) => item.text).join(" · ") })),
      flatLines: flatAdded ? igniteBaseTyped.flatBase.map((line) => ({ source: line.source, text: line.text, min: flatAdded.min * line.minPercent / 100, max: flatAdded.max * line.maxPercent / 100 })) : []
    };
  }
  let theoretical = compileScorchingBeamIgniteSources({ curses, extraSources: { ...mechanics.ignite, intelligence: mechanics.intelligence, fieryFantasy: coreNames.has("Fiery Fantasy"), chanceToDamage: modifierTexts.filter((line) => CHANCE_TO_DAMAGE.test(String(line.text).trim())) }, block, coreTalents, enemyOnTideDamageTakenPercent, tideEffectFactor, waveAriaPercent, idyllPerStackPercent, heroMemories, main, setups, activeNames, talentSlate, equipment, pact: ledgerPact, pactState: state.pacts, aura, igniteLimit, combat: damageCombat, conditions, heroId: state.hero.selectedHeroId, useEffectiveSupportLevels: state.talents.useCapturedRanks === false, reapingApplicationAttemptsPerSecond: beamCastRate.castsPerSecond });
  // Recipe interpreter step 2 for Ignite (user-approved 2026-10-25; src/recipe-ignite-layers.js): the text compile above gives the
  // ledger's lists; the patch places each line-derived entry from its game recipe (text readers for the rest) and every later compile
  // applies it. TLI_IGNITE_PATH=text (dev only) keeps the old ledger.
  const ignitePatch = ignitePathMode() === "recipe" ? computeIgnitePatch(planIgniteRecipe(modifierTexts), theoretical.recipeLists) : null;
  const igniteLedgerHook = ignitePatch ? (key, list) => applyIgnitePatch(ignitePatch, key, list) : null;
  if (igniteLedgerHook) theoretical = compileScorchingBeamIgniteSources({ curses, extraSources: { ...mechanics.ignite, intelligence: mechanics.intelligence, fieryFantasy: coreNames.has("Fiery Fantasy"), chanceToDamage: modifierTexts.filter((line) => CHANCE_TO_DAMAGE.test(String(line.text).trim())) }, block, coreTalents, enemyOnTideDamageTakenPercent, tideEffectFactor, waveAriaPercent, idyllPerStackPercent, heroMemories, main, setups, activeNames, talentSlate, equipment, pact: ledgerPact, pactState: state.pacts, aura, igniteLimit, combat: damageCombat, conditions, heroId: state.hero.selectedHeroId, useEffectiveSupportLevels: state.talents.useCapturedRanks === false, reapingApplicationAttemptsPerSecond: beamCastRate.castsPerSecond, ledgerHook: igniteLedgerHook });
  const canIgnite = activeNames.has("Scorching Beam") && theoretical.totals.baseIgniteDamage.max > 0 && theoretical.totals.applicationChancePercent > 0;
  if (!canIgnite) conditions.fireInfiltration = false;
  // The beam's own Ignite on the dummy's unit buff set (W8 step 2; stage "beam", a real entry beside the enemy-ailment model's): the
  // readers that took `canIgnite` as "the dummy is Ignited" ask it. Every reader of the set after this point sees it (the support state's
  // copy, the per-type count); identical figures on all 17 fixtures (the beam builds' model already lists Ignite).
  if (canIgnite) mechanics.enemyAilments.set.add({ name: "Ignite", source: "Scorching Beam", reason: "the beam's Ignite ledger (src/theoretical-sources.js)", stage: "beam" });
  const beamIgnites = enemyBuffSet(mechanics.enemyAilments)?.holds("Ignite", { stage: "beam" }) ?? canIgnite;
  // Other damaging ailments (Trauma, Wilt) can also carry Affliction.
  const otherAilmentBase = ["trauma", "wilt"].some((key) => hasAilmentBase(key, modifierTexts));
  // Cataclysm on a hit skill that inflicts Ignite / Trauma / Wilt (game recipe 599597: the supported skill's damage-over-time
  // process, which its ailments' ticks are; src/cataclysm-hit-ailments.js): 8 Affliction per 1 s cooldown while they tick, and those
  // ailments are DoT that Affliction reaches, so the build's own Affliction per second counts for them too. Scorching Beam and the
  // skills with their own DoT component keep their paths.
  cataclysmAilments = cataclysmHitAilments({
    hitSources: skillHitSources, excludedKeys: new Set([...skillHitDotSources.map((source) => source.setupKey), ...setups.filter((setup) => setup.name === "Scorching Beam").map((setup) => setup.setupKey)]),
    modifierTexts, igniteBaseMax: theoretical.totals.baseIgniteDamage.max, igniteGlobalSources: igniteGlobalChanceSources(theoretical), igniteNotIgnitedSources: activeNames.has("Scorching Beam") ? [] : igniteNotIgnitedChanceSources(theoretical),
    auraChancePercent: aura.entries.filter((entry) => activeNames.has(entry.name)).reduce((sum, entry) => sum + (entry.effectiveEffects?.ailmentChancePercent || 0), 0)
  });
  skillDotAfflictionRate += cataclysmAilments.afflictionPerSecond;
  // Cataclysm's 1 s Effect Cooldown is node 6 with calcIncress (recipe 599597): the client divides it by max(0.1, Cooldown Recovery Speed factor) at each check
  // (research/tick-engine-investigation-2026-10-30.md §7; chunk 8), so its 8 Affliction per second scales with general Cooldown Recovery Speed.
  skillDotAfflictionRate *= Math.max(0.1, Math.max(0, 1 + (lineConditionState.cooldownRecoverySpeedPercent || 0) / 100) * (1 + (lineConditionState.additionalCooldownRecoverySpeedPercent || 0) / 100));
  // Fire Explosion (condition-unread batch 3; game recipe 13523221: a 4 s buff of +P1 Affliction Per Second renewed each time the supported
  // skill deals damage, 1 s gate): held while the supported skill's own damage reaches the dummy (the beam, or a modeled damage source).
  const recentDamageAffliction = setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.name === "Scorching Beam" || damageSources.some((source) => source.status === "modeled" && source.setupKey === setup.setupKey)))
    .flatMap((setup) => (setup.supportEffects?.affliction || []).filter((line) => line.kind === "recentDamage").map((line) => ({ ...line, skill: setup.name })));
  skillDotAfflictionRate += recentDamageAffliction.reduce((sum, line) => sum + (Number(line.value) || 0), 0);
  // Batch 1 (2026-10-27): Affliction is a debuff on the dummy (+1% additional damage taken per point, attr 5724, by every DoT), so a hit
  // skill's Ignite / Trauma / Wilt takes the build's Affliction even without Cataclysm (before, only the beam, skill DoTs and
  // Cataclysm-supported hit skills opened the Affliction condition).
  const hitAilmentInflicters = cataclysmAilments.setups.length ? cataclysmAilments : cataclysmHitAilments({
    hitSources: skillHitSources, excludedKeys: new Set(setups.filter((setup) => setup.name === "Scorching Beam").map((setup) => setup.setupKey)),
    modifierTexts, igniteBaseMax: theoretical.totals.baseIgniteDamage.max, igniteGlobalSources: igniteGlobalChanceSources(theoretical), igniteNotIgnitedSources: activeNames.has("Scorching Beam") ? [] : igniteNotIgnitedChanceSources(theoretical), includeUnsupported: true,
    auraChancePercent: aura.entries.filter((entry) => activeNames.has(entry.name)).reduce((sum, entry) => sum + (entry.effectiveEffects?.ailmentChancePercent || 0), 0)
  });
  if (!(canIgnite || (activeNames.has("Scorching Beam") && otherAilmentBase) || skillDotSources.length || skillHitDotSources.length || permafrostTerraDots || hitAilmentInflicters.setups.length) || theoretical.townTooltip.passiveAfflictionPerSecond + skillDotAfflictionRate <= 0) conditions.affliction = false;
  // 10 T Barrier Burst triage L1 (2026-11-18): an Ignite whose only chance is "+X% Ignite Chance against enemies that haven't been Ignited" (record
  // 2214789) makes its skill an inflicter (the dummy starts clean), so the Affliction above opens. When it is your only DoT record and another unit
  // keeps the dummy Ignited for good (the follower's Additional Ignite, share 1 on the enemy-ailment model), the gate stays shut after your first
  // Ignite: you hold one record for one Ignite duration, and the rating gains only while you hold one (R1.3), so the steady rating is capped at the
  // rate × that duration (src/affliction-rating.js). Provisional: open question ignite-not-ignited-gate.
  const othersIgnite = othersIgniteHolds({ modifierTexts, minionUptime: mechanics.enemyAilments.types.find((type) => type.name === "Ignite" && type.byMinions)?.uptime ?? 0 });
  const othersIgniteShare = othersIgnite.share;
  const gatedIgniteOnly = !canIgnite && !(activeNames.has("Scorching Beam") && otherAilmentBase) && !skillDotSources.length && !skillHitDotSources.length && !permafrostTerraDots && hitAilmentInflicters.setups.length > 0
    && hitAilmentInflicters.setups.every((item) => item.igniteNotIgnitedOnly && item.ailments.length === 1 && item.ailments[0] === "ignite");
  const afflictionAccrualSeconds = gatedIgniteOnly && othersIgniteShare >= 1 ? theoretical.totals.igniteDurationSeconds ?? 4 : Infinity;
  // Automatic mode derives the dummy's Affliction rating from the build: Affliction per second,
  // capped at 100, reset by Reaps that remove Affliction (affliction-rating.js). Manual mode keeps
  // the configured average. Affliction per second and Reap recovery do not depend on the rating.
  // The follower's Pain Amplification clears come off your rating (one resource on the dummy, research/oq-r1-r2-rea-2026-11-04.md R1.9).
  const followerAfflictionClears = lineEffects.follower?.afflictionClears || [];
  const resolveAfflictionRating = (compiled) => {
    if (state.combat.conditionMode === "manual") return null;
    const derived = deriveAfflictionRating({ afflictionPerSecond: compiled.townTooltip.passiveAfflictionPerSecond + skillDotAfflictionRate, removers: compiled.combat.afflictionRemovers || [], clears: followerAfflictionClears, ...(Number.isFinite(afflictionAccrualSeconds) ? { accrualSeconds: afflictionAccrualSeconds, initialRating: initialAfflictionLine(modifierTexts)?.value ?? 0 } : {}) });
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
  const ignitedResistance = ignitedFireResistance({ modifierTexts, ignited: beamIgnites || (enemyBuffSet(mechanics.enemyAilments)?.holds("Ignite") ?? mechanics.enemyAilments.types.some((type) => type.name === "Ignite")),
    basePercent: state.combat.targetFireResistancePercent, reductionPercent: firesAllure.resistanceReductionPercent, fixed: fixedFireResistance ?? false,
    elementalRaise: illWill ? { percent: ILL_WILL.elementalPerLayer * illWill.layers, uptime: illWill.uptime } : null });
  damageCombat.targetFireResistancePercent = ignitedResistance.dotPercent;
  damageCombat.ignitedFireResistance = ignitedResistance;
  const hasReaping = Boolean(theoretical.combat.reaping?.sources.some(source => source.minimum.triggersPerSecond > 0))
    || (activeNames.has("Scorching Beam") && otherAilmentBase && collectAllReapingSources(modifierTexts).length > 0)
    || ((skillDotSources.length > 0 || skillHitDotSources.length > 0 || permafrostTerraDots > 0) && (collectAllReapingSources(modifierTexts).length > 0 || skillDotSources.some((source) => source.profile.builtInReaping) || skillHitSources.some((source) => source.profile.builtInReaping)))
    // The Cycle I Resist Reaps on every Main Terra recast (src/selena-dance.js), as the early Blessing model counts it.
    || cycleResistReaps(modifierTexts, resolvedMain, activeNames);
  const blurSources = collectBlurSources({ equipment, talents: levelSources.talents, slates: levelSources.slates, setups, activeNames, hasReaping, inflictsWilt: enemyBuffSet(mechanics.enemyAilments)?.holds("Wilt", { by: BY_YOU_OR_FOLLOWER }) ?? mechanics.enemyAilments.types.filter((type) => !type.byMinions).some((type) => type.name === "Wilt") });
  // The follower's Tartarus: Thunder Spike "Grants you Blur when the Shadows of this skill hit" (src/follower-model.js, 2026-10-17).
  blurSources.push(...followerBlurSources(followerSelection(state)));
  // Phantom Trace: "Gains Blur when the supported skill deals Damage Over Time" (census item #2; src/support-buff-effects.js).
  blurSources.push(...phantomTraceBlurSources({ setups, activeNames, damageSources, enemyAilments: enemyBuffSet(mechanics.enemyAilments)?.types("Ailment", { by: BY_YOU_OR_FOLLOWER }) ?? mechanics.enemyAilments.types.filter((type) => !type.byMinions).map((type) => type.name), ailmentShare: (name) => enemyBuffSet(mechanics.enemyAilments)?.share(name, { by: BY_YOU_OR_FOLLOWER }) ?? 1 }));
  conditions.blur = requestedConditions.blur !== false && blurSources.some(source => source.available);
  // Automatic mode resolves Blur active vs within 3 s after it ends (exclusiveConditionGroups); report the resolved pair.
  if (state.combat.conditionMode !== "manual" && conditions.blur) conditions.blurRecentlyEnded = false;
  const blurEffects = calculateBlurEffects({ equipment, talents: levelSources.talents, slates: levelSources.slates, active: conditions.blur, hasSource: blurSources.some(source => source.available), recentlyEnded: requestedConditions.blurRecentlyEnded === true });
  // Stab In The Back (chunk 4, src/consumption-procs.js blurHeldShare): each Main Skill cast ends Blur, so Blur's damage sources hold that
  // share of the time. A gain rate the planner cannot read keeps Blur held (open question core-consumption-gain-rate).
  const stabBlur = lineConditionState.consumption?.blur;
  const stabBlurShare = conditions.blur && stabBlur?.active && Number.isFinite(stabBlur.gainPerSecond) ? blurHeldShare(stabBlur.gainPerSecond, stabBlur.castsPerSecond) : 1;
  if (stabBlurShare < 1) {
    blurEffects.heldShare = stabBlurShare;
    blurEffects.damageSources = blurEffects.damageSources.map((source) => ({ ...source, value: source.value * stabBlurShare, source: `${source.source} (held ${Math.round(stabBlurShare * 1000) / 10}% of the time: Stab In The Back)` }));
  }
  // Subtle Impact as an equipped slate's core talent (Pedigree of Gods "<God>: Lv.N Core Talent: Subtle Impact — …"; 2026-10-17,
  // research/patch-ss14/new-build-gap-2026-10-17.md): the same core as the panel's, read the same way while Blur is active and
  // counted once. Before, only the panel's core was read and the slate's line stayed Not modeled. A "[Subtle Impact]" gear
  // grant reads the same way (core audit batch B1; grantedCores above).
  const subtleImpactGrant = talent.activeCores.has("Subtle Impact") ? null : grantedCores.get("Subtle Impact");
  if (conditions.blur && coreNames.has("Subtle Impact")) {
    const subtleImpactLines = calculateCoreTalents(new Set(["Subtle Impact"]), { blur: true }).lines.filter(line => line.source === "Subtle Impact").map((line) => (stabBlurShare < 1 ? { ...line, value: line.value * stabBlurShare } : line));
    coreTalents.lines.push(...(subtleImpactGrant ? subtleImpactLines.map((line) => ({ ...line, source: `Subtle Impact (${subtleImpactGrant})` })) : subtleImpactLines));
    theoretical = compileScorchingBeamIgniteSources({ curses, extraSources: { ...mechanics.ignite, intelligence: mechanics.intelligence, fieryFantasy: coreNames.has("Fiery Fantasy"), chanceToDamage: modifierTexts.filter((line) => CHANCE_TO_DAMAGE.test(String(line.text).trim())) }, block, coreTalents, enemyOnTideDamageTakenPercent, tideEffectFactor, waveAriaPercent, idyllPerStackPercent, heroMemories, main, setups, activeNames, talentSlate, equipment, pact: ledgerPact, pactState: state.pacts, aura, igniteLimit, combat: damageCombat, conditions, heroId: state.hero.selectedHeroId, useEffectiveSupportLevels: state.talents.useCapturedRanks === false, reapingApplicationAttemptsPerSecond: beamCastRate.castsPerSecond, ledgerHook: igniteLedgerHook });
  }
  // Loud Song (Selena with Ceaseless Tide, deemed Loud Song while Bard): "-20% additional Attack and Cast Speed". The cast part
  // is in the cast-rate ledger (src/scorching-beam-cast-rate.js); the attack part reaches the weapon's attack speed here.
  // An active Aura's added Attack Speed (Pantheon's Elegy on Precise: Swiftness; src/aura-gained-effects.js auraAttackSpeedLines, 2026-11-09)
  // joins these weapon-speed lines: the 25 T town panel's Attack Speed Bonus needs it.
  const weaponSpeedLines = [...(singWithTheTide.ceaselessTide ? [{ text: "-20% additional Attack Speed", source: "Selena: Loud Song (Ceaseless Tide)", origin: "derived", multiplier: 1 }] : []), ...auraAttackSpeedLines(aura.entries)];
  let weaponAttack = calculateWeaponAttack({ equipment, disabledSlots: state.disabledEquipmentSlots, modifierTexts: weaponSpeedLines.length ? [...modifierTexts, ...weaponSpeedLines] : modifierTexts });
  // Blessing "on hit" / "on Critical Strike" gains (talent batch T3): any modeled hitting source holds them, not only
  // Scorching Beam: the beam, every modeled spell or attack hit (src/skill-hit-model.js profiles). Crit from that
  // source's own crit chance (spell crit model with the setup's supports; attacks: the weapon model's rating).
  const hittingSetups = skillHitSources.map((source) => source.setup).filter(Boolean);
  const blessingCanHit = activeNames.has("Scorching Beam") || hittingSetups.length > 0;
  const blessingCanCrit = (activeNames.has("Scorching Beam") && scorchingBeamCritical({ critAdjust, main, talentSlate, equipment: memoryEquipment, pact }).criticalChancePercent > 0)
    || skillHitSources.some((source) => source.profile.weaponScaling ? weaponAttack.crit.chancePercent > 0 : scorchingBeamCritical({ critAdjust, main: source.setup, talentSlate, equipment: memoryEquipment, pact }).criticalChancePercent > 0);
  // Ethereal Prism core clauses reach the Blessing model like a panel core's text (core audit B7: Commander's Gambit's "-100% additional
  // Tenacity Blessing, Agility Blessing, and Focus Blessing Effect"; the panel cores arrive through levelSources.talents).
  const prismCoreBlessingLines = modifierTexts.filter((line) => line.origin === "core" && line.grantedCore && /\(Ethereal Prism\)/.test(String(line.source))).map((line) => ({ text: line.text, source: line.source }));
  // Miraculous Gain (Miraculous Touch; src/elixir-model.js miraculousGainState, user-supplied 2026-10-19): the Blessings maxed for a
  // share of the time and 10 Main Skill triggers per gain, averaged over the Elixir casts.
  const miraculousGain = miraculousGainState(lineEffects.combat?.elixir || null, modifierTexts);
  const blessings = calculateBlessings({ spellBurstConsumptionsPerSecond: spellBurstConsumptions(lineConditionState.bing), durationSeconds: blessingDurations(modifierTexts), dealsDot: Boolean(lineConditionState.dealsDamageOverTime), consumptionCycle: trueFlameCycleInput ? { ...trueFlameCycleInput, elixirCastsPerSecond: (lineConditionState.elixirSetups || []).reduce((sum, setup) => sum + (Number(setup.castsPerSecond) || 0), 0) || null } : null, nightFeatherMax, minionsDealDamage: Boolean(lineConditionState.minionsCrit), elixirCasts: Boolean(lineConditionState.elixirSkill), mobilityUsed, tangleCasts: tangles.setups.length > 0, fillShare: miraculousGain?.blessingShare || 0, fillSource: miraculousGain ? "Miraculous Gain (Miraculous Touch)" : null, extraLines: [...lineEffects.blessing, ...(lineEffects.follower?.blessingLines || []),...prismCoreBlessingLines, ...(theaInputs?.lines || []), ...nightFeatherGainLines], capRules: theaInputs?.capRules || null, stackOverrides: { ...(lineConditionState.consumption?.agilityHeld ? { Agility: lineConditionState.consumption.agilityHeld } : {}), ...(theaFocus !== null ? { Focus: { stacks: theaFocus, reason: "God's Boon consumes every Focus stack (Thea – Wisdom of The Gods: its cycle average, Q-H3)" } } : {}) }, stackUsers: new Set((lineEffects.lines || []).filter((line) => line.active && /^blessing/.test(line.condition || "")).map((line) => line.params?.name).filter(Boolean)), stackUserTexts: modifierTexts.map((line) => String(line.text)), hitRecently: requestedConditions.blockedRecently !== false, canUseNonMain: setups.some(setup => setup.role !== "main" && setup.role !== "aura" && activeNames.has(setup.name)), pactState: state.pacts, talentState: state.talents, equipment, talents: levelSources.talents, slates: levelSources.slates, barrierSources, hasReaping, block, moving: conditions.moving, canHit: blessingCanHit, canCrit: blessingCanCrit, enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), enemyBuffs: mechanics.enemyAilments.set, igniteOnTarget: beamIgnites, spellHitActive: activeNames.has("Scorching Beam") });
  // Your unit buff set for the support conditions and the planner result (W9 step 2, src/unit-buff-set.js): the line state's set (the
  // combat pass's held buffs, the Auras, the combat Armor and block, Barrier, the Empower skills, the counts) with the final Blessing pass,
  // Blur, the Elixir buffs, the follower's buffs on you, Aim and Periodic Burst with their series.
  const playerBuffs = lineConditionState.playerBuffs?.clone?.() ?? createPlayerBuffSet();
  putBlessings(playerBuffs, blessings);
  putBlur(playerBuffs, blurEffects);
  putElixirBuffs(playerBuffs, lineEffects.combat?.elixir || null);
  putFollowerBuffs(playerBuffs, lineEffects.follower || null);
  putTimedOwnBuffs(playerBuffs, { aim, periodicBurst });
  // Focus Blessing stacks from the blessing model: Overload's "for each stack of Focus Blessing" lines (B1) on every
  // setup, and the main skill's pending per-stack lines on the beam hit ledger and the Ignite ledger.
  const focusBlessingStacks = playerBuffSet({ playerBuffs })?.staged("blessing") ? playerBuffs.stacks("Focus", { stage: "blessing" }) : blessings.entries.find((entry) => entry.name === "Focus")?.stacks ?? 0;
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
  if (blessings.castSpeedPercent > 0) weaponAttack = calculateWeaponAttack({ equipment, disabledSlots: state.disabledEquipmentSlots, modifierTexts: [...modifierTexts, ...weaponSpeedLines, { text: `+${Math.round(blessings.castSpeedPercent * 10000) / 10000}% Attack and Cast Speed`, source: "Agility Blessing (blessing model)", origin: "derived", multiplier: 1 }] });
  // Towering Presence (src/towering-presence.js; core audit batch B5): the main-hand weapon's damage and crit rating for Spell skills,
  // as derived entries only the Spell-aware readers use (src/skill-hit-model.js added damage, src/scorching-beam-critical.js flat rating).
  const weaponToSpells = weaponToSpellEntries(modifierTexts, weaponAttack);
  modifierTexts.push(...weaponToSpells.lines);
  const targetCursed = curseLimit.active.length > 0 || mechanics.curses.active.length > 0 || modifierTexts.some((line) => /Curse upon dealing damage|are cursed by/i.test(line.text)) || danceOfTheDeep.cursed;
  // The state conditional support lines resolve against (src/support-effects.js resolveCondition): the dummy (one enemy, a
  // Boss within 10 m), its curses, the enemy-ailment model's types, the held weapons, movement and distance groups.
  const supportConditions = {
    // Vendetta's own crit has a reader (G2): Erika's Feline Fury (extra triggers or Excess) on the build.
    vendettaCritReader: Boolean(lineConditionState.erikaVendetta?.extraTrigger || lineConditionState.erikaVendetta?.excess),
    // anyCurse: Shackles of Malice: Defile's badge (src/support-chunk8.js curseEffectOnHit) reads a curse on the dummy (2026-11-13).
    cursed: targetCursed, anyCurse: targetCursed, enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), enemyAilmentTypeCount: mechanics.enemyAilments.count,
    // The board's Spirit Magus summons (Friend of Spirit Magi's gate; src/origin-of-spirit-magus.js).
    spiritMagusSummons: lineConditionState.spiritMagusSummons || [],
    // Your unit buff set (W9 step 2): the final Blessing pass, the combat pass's held buffs, Blur, the Empower skills, the counts.
    playerBuffs,
    // The dummy's unit buff set: the enemy-ailment model's entries (as `enemyAilments`, no combat-pass Frozen), with the combat pass's crowd
    // control view, held debuffs and levels from the line state's set, and the curses (W8 step 2).
    enemyBuffs: putCurses(copyCombatHolds(mechanics.enemyAilments.set.clone(), lineConditionState.enemyBuffs), { names: targetCursed ? lineConditionState.curseSkillNames || [] : [], cursed: targetCursed }),
    maxSpellBurst: maxSpellBurstTotal(modifierTexts),
    // Burst Activation's badge (src/support-effects.js): the uses of yours a Spell Burst refill line rolls on (only on a build with one).
    ...(hitRateFacts?.playerUseStreams ? { spellBurstRefill: { usesPerSecond: hitRateFacts.playerUseStreams.reduce((total, stream) => total + stream.usesPerSecond, 0), names: hitRateFacts.playerUseStreams.map((stream) => stream.name) } } : {}),
    singleEnemy: true, weaponTypes: [weaponAttack.mainHand?.weapon ? weaponAttack.mainHand.type : null, weaponAttack.offHand?.weapon ? weaponAttack.offHand.type : null].filter(Boolean),
    moving: conditions.moving, nearTarget: conditions.nearTarget,
    // Life lost (Recklessness's "for every 1% Life lost"): the Life state the passive lines read.
    life: lineConditionState.life, lifeLostPercent: lineConditionState.lifeLostPercent, lifeReason: lineConditionState.lifeReason, lifeLostReason: lineConditionState.lifeLostReason,
    // Big Stride's window and Periodic Burst's Mobility use follow these best-case switches (2026-10-14).
    movedRecently: requestedConditions.movedRecently !== false, mobilitySkillUsed: requestedConditions.mobilitySkillUsed !== false,
    // Gear affix batch C (2026-10-22): Empowered Insight's Empower count, Dual Onslaught's Dual Wielding and Attack Focus's Fervor Rating.
    empowerSkillCount: lineConditionState.sageInputs?.empowerSkills?.length || 0, dualWielding: Boolean(lineConditionState.weapon?.dualWielding),
    fervorRating: lineEffects.combat?.buffs?.fervorRating || 0,
    fervorEffectPercent: lineEffects.combat?.buffs?.fervorEffectPercent || 0,
    // Census item #2 supports (src/support-effects.js resolveCensusCondition): Hasten, Aggression, Blessing stacks, Max Mana, Blur, the
    // dummy's Frostbite Rating, the Mark switch and the hit pass's crit hits per setup.
    hasHasten: Boolean(lineEffects.combat?.buffs?.hasHasten), hasAggression: Boolean(lineEffects.combat?.buffs?.hasAttackAggression || lineEffects.combat?.buffs?.hasSpellAggression),
    blessingStacks: Object.fromEntries((blessings.entries || []).map((entry) => [entry.name, entry.stacks || 0])), maxMana: lineConditionState.stats?.maxMana || 0,
    blurActive: Boolean(blurEffects.active), blurRating: blurEffects.rating || 0, frostbiteRating: lineEffects.combat?.debuffs?.frostbiteRating || 0,
    targetMarked: requestedConditions.targetMarked !== false, critHitsBySetup: hitRateFacts?.bySetup || null,
    // Census items #8 / #12: Activation Medium event rates (src/activation-medium-events.js; null before the hit pass).
    // With no Activation Medium that listens to an event on the board (amEventRates false) nothing is measured: every event source
    // then reads No DPS effect (batch 7, 2026-10-28: Activation Medium: Critical Strike / Channel / Lock On claimed Provisional).
    amEvents: hitRateFacts?.amEvents || (amEventRates ? null : { sources: [], instructions: [], instructionsPerSecond: 0, listeners: {} }),
    // Vigor Restitution (src/support-effects.js lifeConsumed): the Mana / Life consumption model (src/resource-consumption.js).
    resourceConsumption: lineConditionState.resourceConsumption || null,
    // Condition-unread batch 3 (src/support-effects.js resolveCensusCondition): the crowd control types on the dummy (Befuddle), own buffs
    // pre-built (Rapid Sweep's Gale stacks), the summoner's Command (the Command supports) and the player's hits per second (Calibrate).
    enemyCrowdControl: lineEffects.combat?.crowdControl || [],
    // Wiring audit W6a item 1: the support clauses' crowd control readings (src/combat-states.js), for their badges.
    supportCrowdControl: lineEffects.combat?.supportCrowdControl || [], prebuiltSelfBuffs: requestedConditions.prebuiltSelfBuffs !== false,
    ...(() => { const command = commandState(modifierTexts, { full: requestedConditions.fullCommand !== false, minionsCrit: Boolean(lineConditionState.minionsCrit) }); playerBuffs.setLevel("Command", command?.points || 0); return { commandPoints: command?.points || 0, commandReason: !command ? "no Command source (\"+N Command per second\")" : !command.full ? "full Command is switched off (condition \"fullCommand\")" : null }; })(),
    playerHitsPerSecond: Number.isFinite(hitRateFacts?.hitsPerSecond) ? hitRateFacts.hitsPerSecond : null,
    // Skill-mechanics census batch 4 (src/support-conditional-batch4.js): a Frost Terra on the board, the stat sheet's Dexterity and Skill Area,
    // the Mana left unsealed, the build's Projectile Quantity and Max Channeled Stacks lines, and each skill's hits per second (hit pass).
    frostTerraOnBoard: setups.some((setup) => setup.name === "Frost Terra" && setup.enabled !== false && activeNames.has(setup.name)),
    // Ice Lances: Permafrost's triggered Frost Terra (src/permafrost-terra.js): its badge reads whether the DoT reaches the dummy.
    permafrostTerra: { blocked: permafrostTerra.blocked },
    dexterity: lineConditionState.stats?.dexterity || 0, skillAreaPercent: lineConditionState.stats?.skillArea || 0,
    // Groundshaker: Frequent Quake's lingering fissure (src/support-hit-count-batch5.js): its area lasts 1.5 s × (1 + Skill Effect Duration).
    skillEffectDurationPercent: lineConditionState.skillEffectDurationPercent || 0,
    // Combat-only increased Skill Area the stat sheet leaves out (2026-11-05, Rosa build audit gap 4; records in research/oq-rosa-build-2026-11-04.md §6):
    // Fervor's added base effect at the held Rating × Fervor Effect, and Baptism: Impassive (buff 81934, 6468653: +60%) while Mercury Purged holds it.
    combatSkillArea: [...(lineEffects.combat?.buffs?.fervorSkillArea || []).map((item) => ({ source: item.source, value: item.value, text: item.text })),
      ...(lineConditionState.rosa?.purged || []).filter((item) => item.active && /Skill Area/.test(item.body)).map((item) => ({ source: `Baptism: ${item.name} (Mercury Purged)`, value: (Number(String(item.body).match(/([\d.]+)%/)?.[1]) || 0) * (item.uptime ?? 1), text: `${item.body}${item.uptime != null && item.uptime < 1 ? ` × ${Math.round(item.uptime * 1000) / 1000} uptime` : ""} while held` }))],
    manaRemainingPercent: lineConditionState.manaRemainingPercent ?? 100,
    projectileQuantityBuild: passiveSupportLines(modifierTexts).quantity.reduce((total, line) => total + (Number(line.value) || 0), 0),
    // Every "+N Max Channeled Stacks" wording, the left / right ring's slot line from its slot (2026-11-12, 20 T Mind Control audit G3).
    maxChanneledStacksBuild: buildMaxChanneledStacks(modifierTexts),
    hitsBySkill: hitRateFacts?.hitsBySkill || null,
    // Each modeled hit skill's own presses per second (rate.usesBySource.manual; wiring fix W6b): Willpower's stack gain (record 905178944,
    // trigger 1000074) answers the player's own uses only.
    manualUsesBySetup: hitRateFacts?.manualUsesBySetup || null,
    // Census batch 6 (src/minion-sentry-batch6.js): the build's Minions kept out (Mind Control: Enthrall's links).
    minionsOwned: Number(lineConditionState.minionCount) || 0,
    // Dark Gate on the board and its cooldown (Focus Fire's damage buff, buff 11130; src/minion-cores.js darkGateState).
    darkGate: lineConditionState.darkGate || null,
    // Chunk 8 (src/support-chunk8.js): Tangle Surge's activated Tangles, Honed Edge's weapon, Snipe's Aim, the Movement Speed conversions.
    activeTangles: lineConditionState.activeTangles || 0, movementSpeedPercent: lineConditionState.movementSpeedPercent || 0, playerMoveSpeed: lineConditionState.playerMoveSpeed,
    twoHanded: Boolean(weaponAttack.twoHanded), weaponBaseDamage: weaponBaseDamage(weaponAttack.mainHand),
    aimOnBoard: setups.some((setup) => setup.name === "Aim" && setup.enabled !== false && activeNames.has(setup.name)),
    hasProfane: Boolean(lineEffects.combat?.buffs?.hasProfane), deteriorationActive: Boolean(lineEffects.combat?.deterioration),
    hasReapSource: modifierTexts.some((line) => /\bReaps? [\d.]+ ?s\b/i.test(String(line.text ?? ""))),
    // Your Reaps per second (the measuring pass; null before it): Thornfield: Sacrifice's Reap gain (src/support-conditional-batch4.js).
    reapsPerSecond: Number.isFinite(hitRateFacts?.reapsPerSecond) ? hitRateFacts.reapsPerSecond : null,
    splitQuantityBuild: modifierTexts.reduce((total, line) => { const match = String(line.text ?? "").replace(/\s+/g, " ").trim().match(/^\+(\d+(?:\.\d+)?) (?:to )?(?:Parabolic Projectile Splits? quantity|(?:Parabolic Projectile )?Split Quantity)$/i); return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0)
  };
  for (const setup of setups) setup.supportEffects = resolveSupportEffects(setup, { ...supportEffectsContext(setup, focusBlessingStacks), conditions: supportConditions });
  // Typed damage taken that a supported skill inflicts on the enemy (Wilting Beam: Dispirit, Flame Jet: Scorched Earth, Burning
  // Shot: Ignition): a derived enemy debuff line every typed "taken" reader uses (skill hits, skill DoTs, ailments), while an
  // active setup whose own damage is modeled carries it. Uptime 1 (provisional; the debuff refreshes while the skill hits).
  const damagingSetupKeys = new Set(damageSources.filter((source) => source.status === "modeled").map((source) => source.setupKey));
  const lateResistanceLines = [];
  for (const setup of setups.filter((item) => item.enabled !== false && activeNames.has(item.name) && damagingSetupKeys.has(item.setupKey))) {
    for (const line of setup.supportEffects?.targetTaken || []) modifierTexts.push({ text: `+${line.value}% additional ${line.typed} Damage taken`, source: `${setup.name}: ${line.support} (enemy debuff; uptime 1, provisional)`, origin: "derived", multiplier: 1 });
    // Chunk 8 (src/support-chunk8.js): Target Projection's Enhanced Mark and Corrosion Focus: Infection, debuffs the skill's hits hold on the dummy.
    const enemyLines = chunk8EnemyLines(setup, { modifierTexts, nearTarget: conditions.nearTarget !== false, usesPerSecond: hitRateFacts?.bySetup?.get?.(setup.setupKey)?.usesPerSecond ?? null, infiltrationTypes: enemyBuffSet(lineConditionState)?.types({ tag: 5200086 }, { stage: "debuff" }) ?? [...(lineEffects.combat?.debuffs?.infiltration || [])] });
    modifierTexts.push(...enemyLines);
    lateResistanceLines.push(...enemyLines.filter((line) => line.resistanceTypes));
    // An untagged enemy damage-taken debuff (Path of Flames: Spontaneous Combustion, buff 10155: attr 5720 mod 4, no tag; 8 T Thornfield audit G3,
    // 2026-11-13) lands after the last mechanics pass: the DoT / ailment damage-taken bucket and the beam's hits take it here, as Deepened Curse's.
    for (const line of enemyLines.filter((item) => item.allDamageTaken)) addLateDamageTakenLine(mechanics, line, activeNames);
  }
  // Thornfield: Sacrifice's stacks on the clean dummy (8 T Thornfield audit G2, 2026-11-13; src/support-conditional-batch4.js sacrificeStacks):
  // the self-damage stacks need no event on the dummy (your Terra's True Damage), so with own buffs built before engaging they are held at
  // engagement (as Thornfield: Retribution's stacks); the Reap stacks need a Reap of yours on the dummy, so they build from 0 at engagement (the
  // 2026-11-02 rule for a buff gained only from the dummy). Without pre-built own buffs both build from 0. A timed own-buff part on the skill's
  // DoT (fixed at each application, so the Reaps settle it): level (1 + p)^stacks(t) − 1 per frame, sustained the ledger's held stacks.
  for (const setup of setups.filter((item) => item.enabled !== false && activeNames.has(item.name))) {
    for (const clause of (setup.supportEffects?.clauses || []).filter((item) => item.condition === "sacrificeStacks" && item.active && item.sacrifice)) {
      const { lifeStacksPerSecond, reapStacksPerSecond, durationSeconds, cap, steadyStacks, perStackPercent } = clause.sacrifice;
      const prebuilt = requestedConditions.prebuiltSelfBuffs !== false;
      const stacksAt = (time) => Math.min(cap, lifeStacksPerSecond * (prebuilt ? durationSeconds : Math.min(time, durationSeconds)) + reapStacksPerSecond * Math.min(time, durationSeconds));
      const level = (stacks) => (1 + perStackPercent / 100) ** stacks - 1;
      const frames = Math.ceil(durationSeconds * 30 - 1e-9);
      const points = Array.from({ length: frames + 1 }, (_, index) => [index / 30, level(stacksAt(index < frames ? (index + 0.5) / 30 : durationSeconds))]);
      const source = `${setup.name}: ${clause.support}`;
      (lineEffects.combat.timedEffects ||= []).push({ id: `sacrifice:${setup.setupKey}`, label: `${source} stacks`, source, text: clause.text, target: "self", toggle: false, enabled: true, active: true, provisional: true,
        parts: [{ type: null, reach: "dot", keys: [`skill:${setup.setupKey}`], percent: 100, schedule: { kind: "steps", points, sustained: level(steadyStacks) } }] });
    }
  }
  // Empower Skill effects on the build's other damage (src/empower-effects.js; frost-terra audit 2026-10-13): Ice Bond's
  // Euphoria and a skill's hit debuff (Blizzard), scaled by Empower Effect. A hit debuff shared here leaves that skill's own
  // hit ledger (it reads the shared line like every other source).
  const empowerEffects = resolveEmpowerEffects({ setups, activeNames, damagingSetupKeys, hitProfiles: new Map(skillHitSources.map((source) => [source.setupKey, source.profile])), modifierTexts, enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), enemyBuffs: mechanics.enemyAilments.set, prebuiltSelfBuffs: requestedConditions.prebuiltSelfBuffs !== false, multistrikeEventsPerSecond: hitRateFacts?.multistrikeEventsPerSecond ?? null, context: empowerBuffContext, warcriesOnCooldown: requestedConditions.warcriesOnCooldown !== false, itemSkillLevel });
  // The Empower / Warcry buff lines (src/empower-buffs.js) joined the build before the line effects (empowerEarly, so the beam and DoT
  // ledgers read them, as a gear line); the other Empower effects (Ice Bond, hit debuffs) join here. Burst of Anger's Attack Aggression
  // adds nothing when the build already holds Attack Aggression (src/combat-states.js). Their Cast Speed joins the character's.
  modifierTexts.push(...empowerEffects.lines.filter((line) => !(line.empowerBuff || line.warcryBuff)));
  putEmpowerBuffs(playerBuffs, { skills: lineConditionState.sageInputs?.empowerSkills || [], entries: empowerEffects.entries });
  if ((ownCombatHeld(playerBuffs) ?? lineEffects.combat?.buffs)?.hasAttackAggression) for (let index = modifierTexts.length - 1; index >= 0; index--) if (modifierTexts[index].empowerBuff && /: Attack Aggression \(/.test(String(modifierTexts[index].source))) modifierTexts.splice(index, 1);
  for (const line of empowerEarly.lines.filter((item) => item.kind === "speed" && /^\+[\d.]+% Cast Speed$/.test(item.text))) { const value = Number(line.text.match(/^\+([\d.]+)%/)?.[1]) || 0; lineEffects.castSpeed.increasedPercent += value; lineEffects.castSpeed.sources.push({ source: line.source, text: line.text, value, origin: "derived" }); }
  for (const source of skillHitSources) if (empowerEffects.sharedDebuffSetupKeys.has(source.setupKey)) source.profile = { ...source.profile, selfDebuffTaken: [] };
  // The main skill's active conditional support lines on the beam hit ledger and the Ignite ledger (the main skill's
  // ailments), like its other "additional damage for the supported skill" lines (src/build-mechanics.js).
  // Census item #2 build-wide support buffs (src/support-buff-effects.js): Empowered Element, Gladiator's Roar, Psychic Surge.
  // Empowered Element's "while the supported skill lasts" (record 446081152 node 292) at that skill's uptime (census C11, 2026-11-15):
  // an Empower buff's steady uptime (the entries above), Aim's; a trait skill has none here (its module resolves after the hits: held).
  const supportSkillUptime = (setup) => {
    if (setup.name === "Aim" && aim) return { uptime: aim.active ? (Number(aim.uptimePercent) || 0) / 100 : 0, reason: aim.active ? `Aim up ${Math.round((Number(aim.uptimePercent) || 0) * 100) / 100}% of the time (src/aim-model.js)` : "Aim inactive" };
    const entry = (empowerEffects.entries || []).find((item) => item.setupKey === setup.setupKey && !item.superseded && !item.item && Number.isFinite(Number(item.uptime)) && item.kind !== "euphoria" && item.kind !== "debuff");
    return entry ? { uptime: Number(entry.uptime), reason: `${setup.name}'s buff up ${Math.round(Number(entry.uptime) * 10000) / 100}% of the time (src/empower-buffs.js)` } : null;
  };
  const supportBuffs = resolveSupportBuffs({ setups, activeNames, mobilitySkillUsed: requestedConditions.mobilitySkillUsed !== false, hitRateFacts: hitRateFacts?.bySetup || null, uptimeFor: supportSkillUptime, cooldownFor: (setup) => { const profile = inferDamageProfile(setup); return (profile ? skillHitTiming(profile)?.cooldownSeconds : null) ?? 0; } });
  modifierTexts.push(...supportBuffs.lines);
  // Their Attack Speed reaches the weapon model (Eye of the Gale, wiring fix W6b): the weapon pass above ran before these lines.
  if (supportBuffs.lines.some((line) => /Attack Speed$/.test(String(line.text)))) weaponAttack = calculateWeaponAttack({ equipment, disabledSlots: state.disabledEquipmentSlots, modifierTexts: [...modifierTexts, ...weaponSpeedLines, ...(blessings.castSpeedPercent > 0 ? [{ text: `+${Math.round(blessings.castSpeedPercent * 10000) / 10000}% Attack and Cast Speed`, source: "Agility Blessing (blessing model)", origin: "derived", multiplier: 1 }] : [])] });
  // Their Cast Speed (Eye of the Gale's additional Attack and Cast Speed, wiring fix W6b) joins the cast-rate ledger, as Periodic Burst's.
  for (const line of supportBuffs.lines) { const speed = String(line.text).match(/^\+([\d.]+)% (additional )?Cast Speed$/); if (!speed) continue; const value = Number(speed[1]); if (speed[2]) lineEffects.castSpeed.additionalPercents.push(value); else lineEffects.castSpeed.increasedPercent += value; lineEffects.castSpeed.sources.push({ source: line.source, text: line.text, value, additional: Boolean(speed[2]), origin: "derived" }); }
  // Census batch 6 (src/minion-sentry-batch6.js): Modularization: Cluster's Minion Damage per Minion, Sever's summoner damage and Plague
  // Source's Origin of Erosion as derived build lines; Wicked's Spirit Magus effects reach the Minion pass (batch6MinionContext).
  const batch6Build = batch6BuildLines({ setups, activeNames, originEffectFactor: originEffectFactor(modifierTexts).factor, minionCountFor: (setup) => { const key = inferDamageProfile(setup)?.minionKey; return key && MINION_PROFILES[key] ? minionCountOut(MINION_PROFILES[key], setup.effectiveLevel ?? 20, modifierTexts, { troopMaxMinions: (requestedConditions.troopMaxMinions ?? requestedConditions.moduleMaxMinions) !== false, halveTroops: Boolean(troopHalvingSource({ setups, activeNames })) }) : 0; } });
  modifierTexts.push(...batch6Build.lines);
  // These lines land after the last mechanics pass: the ledgers that read the collected object take them here.
  for (const line of [...lateResistanceLines, ...supportBuffs.lines, ...batch6Build.lines]) addLateMechanicsLine(mechanics, line);
  // Census item #2 typed bodies on the Scorching Beam main (Blazing Scorch's Fire part): its Fire hits and Ignite.
  for (const line of (resolvedMain?.name === "Scorching Beam" ? resolvedMain.supportEffects?.conditionalAdditional || [] : []).filter((item) => item.active && item.typedParts && ["In calc", "Provisional"].includes(item.status))) {
    for (const part of line.typedParts.filter((item) => item.typed === "Fire" && item.value)) {
      const text = `${part.value >= 0 ? "+" : ""}${part.value}% additional Fire Damage (${line.text}) — ${line.conditionText}`;
      mechanics.hit.push({ source: line.source, bucket: "additional", percent: part.value, text });
      mechanics.ignite.additional.push({ source: line.source, text, value: part.value, category: "Additional damage", condition: line.conditionText });
    }
  }
  for (const line of (resolvedMain?.supportEffects?.conditionalAdditional || []).filter((item) => item.active && item.appliedValue && !item.triggeredOnly)) {
    if (resolvedMain.name === "Scorching Beam" && SCORCHING_BEAM_DEDICATED_SUPPORTS.has(line.support)) continue;
    const text = `${line.text} — ${line.conditionText}`;
    mechanics.hit.push({ source: line.source, bucket: "additional", percent: line.appliedValue, text });
    // A hit-only line (Recklessness, game recipe 506943104) stays off the main skill's ailments.
    if (!line.hitOnly) mechanics.ignite.additional.push({ source: line.source, text, value: line.appliedValue, category: "Additional damage", condition: line.conditionText });
  }
  // Overly Modified on Scorching Beam (chunk 4, 2026-11-01): the beam is a non-Sentry Active skill, so game record 734641's −50% is on its
  // hits and on the Ignite it inflicts, as on any other skill's (src/ailment-applications.js); Reaps settle the scaled DoT.
  const beamOverly = overlyModified && activeNames.has("Scorching Beam") ? overlyModifiedLine(overlyModified, setups.find((setup) => setup.name === "Scorching Beam")) : null;
  if (beamOverly) {
    mechanics.hit.push({ source: beamOverly.source, bucket: "additional", percent: beamOverly.value, text: beamOverly.text });
    mechanics.ignite.additional.push({ source: beamOverly.source, text: beamOverly.text, value: beamOverly.value, category: "Additional damage", condition: "Overly Modified, on the cast" });
  }
  // Juggernaut (core audit B4, src/combat-states.js): the enemy's Armor drop. The beam's calibrated cycle already carries the
  // dummy's 30% non-Physical Armor (src/target-hit-mitigation.js), so its Fire hits take the ratio of the Armor factors.
  // The follower's Armor shreds (src/follower-model.js enemyArmourWithFollower, census item #10) join it: one Armor on every hit's target.
  const juggernaut = enemyArmourWithFollower(lineEffects.combat?.enemyDebuffCores?.juggernaut?.active ? lineEffects.combat.enemyDebuffCores.juggernaut : null, lineEffects.follower);
  if (juggernaut && activeNames.has("Scorching Beam") && juggernaut.nonPhysicalArmourPercent !== level85DummyDefenses.nonPhysicalArmourPercent) {
    const percent = ((1 - juggernaut.nonPhysicalArmourPercent / 100) / (1 - level85DummyDefenses.nonPhysicalArmourPercent / 100) - 1) * 100;
    mechanics.hit.push({ source: juggernaut.source || "Juggernaut (Ethereal Prism core)", bucket: "additional", percent, text: juggernaut.text || `Enemy Armor ×${juggernaut.armourScale} (${juggernaut.stacks} stacks): non-Physical Armor mitigation ${level85DummyDefenses.nonPhysicalArmourPercent}% → ${juggernaut.nonPhysicalArmourPercent}% (provisional)`, types: ["Fire", "Cold", "Lightning", "Erosion"] });
  }
  for (const line of mechanics.pendingPerStack || []) {
    const stacks = Math.min(line.cap ?? Infinity, focusBlessingStacks);
    if (!(stacks > 0)) continue;
    const value = Math.round(line.perStack * stacks * 10000) / 10000;
    const text = `${line.text} × ${stacks} Focus Blessing stacks (blessing model)`;
    mechanics.hit.push({ source: line.source, bucket: "additional", percent: value, text });
    mechanics.ignite.additional.push({ source: line.source, text, value, category: "Additional damage" });
  }
  beamCastRate = pressedBeamRate(scorchingBeamCastRate({ speedAdjust, lineSpeed: lineEffects.castSpeed, blessings, ceaselessTide: heroMemories.ceaselessTide, main, talentSlate, equipment: memoryEquipment, pact, aimCastSpeedPercent: aim.averageCastSpeedPercent }));
  // Other skills' Ignites folded into the beam's ledger (below): their own Cataclysm share (batch 1 2026-10-27), a combat-only entry.
  let igniteOwnAfflictionShare = [];
  const compileFinal = (attemptsPerSecond = beamCastRate.castsPerSecond) => compileScorchingBeamIgniteSources({ curses, extraSources: { ...mechanics.ignite, combatAdditional: [...(mechanics.ignite.combatAdditional || []), ...igniteOwnAfflictionShare], intelligence: mechanics.intelligence, fieryFantasy: coreNames.has("Fiery Fantasy"), chanceToDamage: modifierTexts.filter((line) => CHANCE_TO_DAMAGE.test(String(line.text).trim())) }, blurEffects, blessings, block, coreTalents, enemyOnTideDamageTakenPercent, tideEffectFactor, waveAriaPercent, idyllPerStackPercent, heroMemories, main, setups, activeNames, talentSlate, equipment, pact: ledgerPact, pactState: state.pacts, aura, igniteLimit, combat: damageCombat, conditions, heroId: state.hero.selectedHeroId, useEffectiveSupportLevels: state.talents.useCapturedRanks === false, reapingApplicationAttemptsPerSecond: attemptsPerSecond, ledgerHook: igniteLedgerHook });
  // The Ignite patch's state-settled writes (src/recipe-ignite-layers.js): recipe lines the text ledger never read whose gate the
  // planner settles as the Trauma / Wilt layers do (target Cursed; both Sealed Mana and Life), and the per-ailment-type power (the
  // dummy's ailment count, as src/ailment-model.js reads it). Set before the final compiles.
  if (ignitePatch) ignitePatch.state = {
    targetCursed,
    sealedLifeAndMana: aura.entries.some((entry) => entry.reservation?.resource === "life") && aura.entries.some((entry) => entry.reservation?.resource === "mana"),
    // The ailment types on the dummy (wiring audit gap 2, 2026-11-03): the one enemy-ailment list (src/enemy-ailments.js), your own types at 1 and
    // those only your Minions keep at their uptime, so a non-beam skill's own Ignite counts too (it was left out: only the beam's did).
    enemyAilmentTypes: Math.max(1, enemyBuffSet(mechanics.enemyAilments)?.count() ?? mechanics.enemyAilments.count)
  };
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
  // Magmaskull's "Changes the initially inflicted Affliction to N" (user decision 2026-11-04; src/initial-affliction.js): the first infliction puts
  // the dummy at N, once per fight, so max Affliction comes (100 − N) ÷ rate after engagement; the steady rating is unchanged.
  const initialAfflictionText = initialAfflictionLine(modifierTexts);
  const initialAfflictionAt = (rating) => resolveInitialAffliction(initialAfflictionText, { afflictionOn: conditions.affliction !== false, simulated: Boolean(rating), perSecond: rating?.afflictionPerSecond || 0 });
  const timedDotLayers = [];
  for (const line of modifierTexts) {
    const match = line.text.match(/^\+(\d+(?:\.\d+)?)% additional Damage Over Time against enemies with Max Affliction\. Lasts for (\d+(?:\.\d+)?) s\. Only takes effect once on each enemy$/i);
    if (!match || conditions.affliction === false) continue;
    const initial = initialAfflictionAt(afflictionRating);
    const startSeconds = afflictionRating ? (initial?.status === "In calc" ? initial.firstMaxSeconds : afflictionRating.firstFullSeconds) : (Number(damageCombat.afflictionAverage) >= 100 ? 0 : Infinity);
    if (!Number.isFinite(startSeconds)) continue;
    timedDotLayers.push({ source: line.source, text: line.text, value: Number(match[1]), factor: 1 + Number(match[1]) / 100, startSeconds, durationSeconds: Number(match[2]), category: "Additional damage (timed)" });
  }
  const timedDotWindowFactor = (seconds) => !(seconds > 0) ? 1 : timedDotLayers.reduce((factor, layer) => factor * (1 + (layer.factor - 1) * Math.max(0, Math.min(seconds, layer.startSeconds + layer.durationSeconds) - layer.startSeconds) / seconds), 1);
  const trueFlame = calculateCoreTalents(coreNames, { ignited: theoretical.totals.baseIgniteDamage.max > 0 && theoretical.totals.applicationChancePercent > 0, afflictionRating: conditions.affliction !== false ? damageCombat.afflictionAverage : 0, afflictionEffectPercent: theoretical.ledger.filter(line => line.category === "Affliction effect").reduce((sum, line) => sum + line.value, 0), additionalAfflictionEffectFactor: theoretical.ledger.filter(line => line.category === "Additional Affliction effect").reduce((factor, line) => factor * (1 + line.value / 100), 1) });
  coreTalents.lines.push(...trueFlame.lines.filter(line => line.source === "True Flame"));
  // Affliction-driven Fire hit damage on the generic skill hits (2026-10-28; src/affliction-fire-hits.js, game recipes 863429 / 16021013):
  // the True Flame core and Magmaskull's "Affliction gains an additional effect: +X% additional Hit Fire Damage taken". Per skill the own
  // Cataclysm's additional Affliction effect joins (the theoretical ledger's main-skill Cataclysm line is left out of the shared terms).
  const afflictionFireState = afflictionFireHitState({ modifierTexts, trueFlameCore: coreNames.has("True Flame"), ignited: enemyBuffSet(mechanics.enemyAilments)?.holds("Ignite") ?? mechanics.enemyAilments.types.some((type) => type.name === "Ignite"),
    afflictionRating: conditions.affliction !== false ? Number(damageCombat.afflictionAverage) || 0 : 0,
    afflictionEffectIncreasedPercent: theoretical.ledger.filter((line) => line.category === "Affliction effect").reduce((sum, line) => sum + line.value, 0),
    additionalAfflictionEffect: theoretical.ledger.filter((line) => line.category === "Additional Affliction effect" && !/Cataclysm/.test(String(line.source))).map((line) => ({ source: String(line.source), value: line.value })),
    ignitedBy: { followerSources: othersIgnite.followerSources, minionShare: othersIgnite.minionShare } });
  // The beam's added flat damage by type (batch 7 damage fixes 2026-10-28; src/scorching-beam-added-damage.js): Fire joins the beam's
  // packets; every other type (the Added Cold / Physical / Lightning / Erosion Damage supports at their stone values, and those types added
  // to Spells) is its own hit part after the conversions the generic skill hits apply (the beam's supports and the build's passive lines),
  // with its own ledger (src/scorching-beam-hit.js typed) and dummy mitigation below. Added damage reaches Ignite's base only through a node-381 line (igniteBaseSettle).
  const beamAddedDamage = scorchingBeamAddedDamage({ main, equipment, slates: slate.setup, equippedSlateIds: equipped, talents: talent.setup, pacts: state.pacts, stats: lineConditionState.stats });
  const beamTypedAdded = activeNames.has("Scorching Beam") ? beamAddedTypedParts(beamAddedDamage, { conversions: [...(main?.supportEffects?.conversion || []), ...passiveSupportLines(modifierTexts).conversion], noConversion: Boolean(trinityState(modifierTexts)?.noConversion) }) : [];
  const hitModifiers = scorchingBeamHitModifiers({ modifierTexts, beamActive: activeNames.has("Scorching Beam"), typedScopes: beamTypedAdded.map((part) => ({ key: part.key, types: part.chain })), recipeState: { targetCursed, sealedLifeAndMana: aura.entries.some((entry) => entry.reservation?.resource === "life") && aura.entries.some((entry) => entry.reservation?.resource === "mana") }, extraSources: mechanics.hit, intelligenceAdjustment: mechanics.intelligence, blurEffects, curses, blessings, aim, block, coreTalents, enemyOnTideDamageTakenPercent, tideEffectFactor, waveAriaPercent, idyllPerStackPercent, heroMemories, main, talentSlate, equipment, pact, aura, heroId: state.hero.selectedHeroId, conditions, idyllStacks: damageCombat.idyllStacks });
  const levelFactor = main.effectiveLevel >= 20 ? skillLevelDamageMultiplier(main.effectiveLevel) / skillLevelDamageMultiplier(20) : 1;
  const beamCritical = scorchingBeamCritical({ critAdjust, main, talentSlate, equipment: memoryEquipment, pact, modifierTexts, fireResistanceTotalPercent: resistances.entries.find((entry) => entry.element === "Fire")?.total || 0, castsPerSecond: beamCastRate.castsPerSecond, targetHasAilment: canIgnite || (enemyBuffSet(mechanics.enemyAilments)?.count() ?? mechanics.enemyAilments.count) > 0 });
  const hasSealedLife = aura.entries.some((entry) => entry.reservation?.resource === "life") && aura.entries.some((entry) => entry.reservation?.resource === "mana");
  const ailmentChanceFromAuras = aura.entries.filter((entry) => activeNames.has(entry.name)).reduce((sum, entry) => sum + (entry.effectiveEffects?.ailmentChancePercent || 0), 0);
  const ailmentDurationFromAuras = aura.entries.filter((entry) => activeNames.has(entry.name)).reduce((sum, entry) => sum + (entry.effectiveEffects?.ailmentDurationPercent || 0), 0);
  const ailmentTargets = { trauma: 0, wilt: damageCombat.targetErosionResistancePercent ?? 30 };
  const ailmentDraft = Object.fromEntries(Object.keys(ailmentTargets).map((key) => [key, hasAilmentBase(key, modifierTexts)]));
  const enemyAilmentTypes = Math.max(1, enemyBuffSet(mechanics.enemyAilments)?.count() ?? mechanics.enemyAilments.count);
  // Extra Beams (Scattershot Beam "+2 additional Beams", "+N Beams" lines): every Beam hits the dummy, after the first at
  // the skill's Shotgun falloff, each later Beam keeping 30% (the text's 70% is the share lost; src/scorching-beam-base-hit.js
  // scorchingBeamShotgunFactor; Iris Scattershot run B,
  // 2026-10-12). On Selena the Bard delivery scales its measured residual with the native cycle, so with it.
  const beamCount = 1 + (main.supportEffects?.quantity || []).filter((item) => item.kind === "beams").reduce((total, item) => total + item.value, 0)
    + modifierTexts.reduce((total, line) => { const match = String(line.text).match(/^\+(\d+) Beams?$/i); return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0);
  // Mark on the dummy (src/mark-effect.js; 2026-10-14): a build with a Mark source keeps the dummy Marked (best case, the
  // targetMarked switch); its "+10% additional Critical Strike Damage taken" × (1 + Mark Effect) joins every hit's crit share
  // (Scorching Beam's beam and explosion packets too: `beamCritOnlyFactor`; settled after the hits, the beam included).
  // Erika's Artificial Moon (src/erika-wind-stalker.js windStalkerMoonMark; 2026-10-14): a Mark source and +30% Mark Effect while Stalker is held.
  const markState = resolveMark({ modifierTexts, enabled: requestedConditions.targetMarked !== false, nearTarget: conditions.nearTarget !== false, ...(() => { const moon = windStalkerMoonMark(lineConditionState.windStalker) || {}; return empowerEffects.markSources.length ? { ...moon, extraSources: [...(moon.extraSources || []), ...empowerEffects.markSources] } : moon; })() });
  const beamCritOnlyFactor = (beamCritical.critOnlyFactor ?? 1) * (markState.critOnlyLine ? 1 + markState.critOnlyLine.value / 100 : 1);
  // The typed added parts' dummy mitigation relative to the Fire packets (the 49% packet coefficient is the dummy's 30% non-Physical Armor ×
  // 30% Fire Resistance; every consumer scales the cycle by the Fire Resistance's change from 30%): a Cold / Lightning / Erosion part's
  // resistance after its penetration (src/build-mechanics.js penetration.allTypes) over Fire's; Physical has no resistance and meets the
  // dummy's Physical Armor (50%, or Juggernaut's / the follower's lowered Armor). A part whose final type a "You can only deal X Damage"
  // core removes deals 0 (src/damage-type-restriction.js). Armor DMG Mitigation Penetration is not read on the beam (provisional).
  const beamFireResistanceFactor = Math.max(0, 1 - (ignitedResistance.hitPercent - (mechanics.penetration?.firePercent || 0)) / 100);
  const beamTypedParts = beamTypedAdded.map((part) => {
    const ledger = hitModifiers.typed?.[part.key];
    const penetrationPercent = mechanics.penetration?.allTypes?.[part.type]?.percent || 0;
    const resistancePercent = part.type === "Physical" ? 0 : part.type === "Fire" ? ignitedResistance.hitPercent : (damageCombat[`target${part.type}ResistancePercent`] ?? level85DummyDefenses[`${part.type.toLowerCase()}ResistancePercent`] ?? 30);
    const armourPercent = part.type === "Physical" ? Math.max(0, Math.min(80, juggernaut?.armourPercent ?? level85DummyDefenses.armourPercent)) : null;
    const actual = part.type === "Physical" ? 1 - armourPercent / 100 : Math.max(0, 1 - (resistancePercent - (part.type === "Fire" ? (mechanics.penetration?.firePercent || 0) : penetrationPercent)) / 100);
    const targetFactor = !(beamFireResistanceFactor > 0) ? 0 : part.type === "Physical" ? actual / ((1 - level85DummyDefenses.nonPhysicalArmourPercent / 100) * beamFireResistanceFactor) : actual / beamFireResistanceFactor;
    const restricted = Boolean(mechanics.typeRestriction && removesType(mechanics.typeRestriction, part.type));
    return { ...part, damageFactor: restricted ? 0 : ledger?.damageFactor ?? 1, increasedFactor: ledger?.increasedFactor ?? 1, additionalFactor: ledger?.additionalFactor ?? 1, maxDamageFactor: ledger?.maxDamageFactor ?? 1, minDamageFactor: ledger?.minDamageFactor ?? 1, targetFactor, resistancePercent, penetrationPercent: part.type === "Physical" ? 0 : part.type === "Fire" ? (mechanics.penetration?.firePercent || 0) : penetrationPercent, armourPercent, restricted };
  });
  // Levels 1–20 read the game rows (config_skill_damage 461 / 462); past 20 the level factor scales the Lv.20 packets.
  // Immolate (Noble): "No explosions will be generated at max channeled stacks" (bug B5: the cycle kept an explosion every Max Channeled Stacks uses).
  const beamImmolate = (main?.supports || []).some((item) => item.enabled !== false && item.name === "Scorching Beam: Immolate (Noble)");
  const nativeHitCycle = activeNames.has("Scorching Beam") && main?.effectiveLevel >= 1
    ? scorchingBeamSustainedHits({
      beams: beamCount,
      explodes: !beamImmolate,
      effectiveLevel: main.effectiveLevel,
      levelFactor,
      damageFactor: hitModifiers.damageFactor,
      maxDamageFactor: hitModifiers.maxDamageFactor,
      minDamageFactor: hitModifiers.minDamageFactor,
      addedFireDamage: beamAddedDamage.raw,
      typedParts: beamTypedParts,
      castsPerSecond: beamCastRate.castsPerSecond,
      criticalChancePercent: beamCritical.criticalChancePercent,
      // Crit-only support lines (Critical Strike Damage Increase) and the Mark weight the crit hits only (B1); never Ignite.
      criticalDamagePercent: (beamCritical.critNoExtraDamage ? 100 : beamCritical.criticalDamagePercent) * beamCritOnlyFactor
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
  // line's level + the build's skill level lines (user decision 2026-11-16, itemSkillLevel), one use per stated interval while the event holds (provisional). Their badges read the notes below.
  const itemTriggerSources = [], itemTriggerNotes = [];
  modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).forEach((line, index) => {
    const trigger = parseItemTrigger(line.text);
    if (!trigger) return;
    const key = normalizeLineText(String(line.text)).trim();
    // The item's Aim (gear affix batch D): read by the Aim model above, not as a hit stream.
    if (trigger.name === "Aim" && !trigger.unmodeled && !trigger.notOnDummy) {
      const aimTargets = activeNames.has("Scorching Beam") || [...skillHitSources, ...skillDotSources].some((source) => (source.setup?.tags || []).some((tag) => tag === "Projectile" || tag === "Beam"));
      itemTriggerNotes.push([key, boardAim ? "No DPS effect: Aim is on the skill board and is recast at its cooldown already" : !gearAimEvent?.active ? `Inactive: ${gearAimEvent?.reason || "the event does not hold"}` : !aimTargets ? "No DPS effect: no Projectile or Beam skill takes Aim's bonus" : `Triggered Aim ${triggeredLevelLabel(gearAimSetup || itemSkillLevel("Aim", trigger.level, line))}: ${aim.uptimeLabel} (src/aim-model.js; provisional)`]);
      return;
    }
    if (trigger.unmodeled) { itemTriggerNotes.push([key, `Not modeled: ${trigger.unmodeled}`]); return; }
    if (trigger.notOnDummy) { itemTriggerNotes.push([key, `Not on dummy: ${trigger.notOnDummy}`]); return; }
    const event = itemTriggerEvent(trigger, { mobilityUsesPerSecond: boardMobilityUses(setups, requestedConditions), moving: conditions.moving, anyHit: activeNames.has("Scorching Beam") || skillHitSources.length > 0, enemyAilments: mechanics.enemyAilments.types.map((type) => type.name), enemyBuffs: mechanics.enemyAilments.set.clone().copyFrom(lineConditionState.enemyBuffs, (entry) => entry.stage === "debuff"), paralysis: lineEffects.combat?.debuffs?.paralysis,
      // Paralysis on its own clock (2026-10-14): Grudge's / Cripple's chance Paralysis and Witch Antelope's turns also inflict it.
      scheduledParalysis: [...(lineEffects.combat?.chanceParalysis?.sources || []).filter((item) => item.active).map((item) => `${item.skill}: ${item.support}`), ...(lineEffects.combat?.timedEffects || []).filter((effect) => effect.id === "witchAntelope" && effect.active).map((effect) => effect.label)] });
    const setup = { ...(catalogSkillsByName.get(trigger.name) || {}), name: trigger.name, role: "item-trigger", ...itemSkillLevel(trigger.name, trigger.level, line), supports: [], setupKey: `item-trigger:${index}:${trigger.name}`, instanceId: `item-trigger:${index}:${trigger.name}`, enabled: true };
    const profile = inferDamageProfile(setup);
    // A Defensive-tagged skill (Stoneskin, Reform; reference data tags) deals no damage: No DPS effect (gear affix audit 2026-10-22).
    if ((!profile || profile.engine !== "skill-hit") && (setup.tags || []).includes("Defensive")) { itemTriggerNotes.push([key, `No DPS effect: ${trigger.name} is a Defensive skill (no damage)`]); return; }
    if (profile?.engine === "skill-dot" && itemDotTriggers.some((item) => item.key === key)) { itemTriggerNotes.push([key, itemDotTriggers.find((item) => item.key === key).note]); return; }
    // An Empower the line triggers on a stated interval is a buff, not a hit stream (src/empower-effects.js; chunk 12).
    if (!profile && EMPOWER_BUFF_SPECS[trigger.name]) { itemTriggerNotes.push([key, event.active ? `Triggered Empower: ${trigger.name} ${triggeredLevelLabel(setup)} every ${Math.round((event.intervalSeconds ?? trigger.intervalSeconds) * 1000) / 1000} s (${event.reason}; provisional)` : `Inactive: ${event.reason}`]); return; }
    if (!profile || profile.engine !== "skill-hit") { itemTriggerNotes.push([key, `Not modeled: ${trigger.name} has no hit model (a buff skill or an unmodeled skill)`]); return; }
    if (!event.active) { itemTriggerNotes.push([key, `Inactive: ${event.reason}`]); return; }
    const useInterval = event.intervalSeconds ?? trigger.intervalSeconds;
    itemTriggerSources.push({ setup, setupKey: setup.setupKey, itemTrigger: { ...trigger, intervalSeconds: useInterval, source: line.source, text: line.text, reason: event.reason }, profile: { ...profile, useModel: { kind: "rate", usesPerSecond: 1 / useInterval, firstUseSeconds: useInterval } } });
    itemTriggerNotes.push([key, `Triggered skill: ${trigger.name} ${triggeredLevelLabel(setup)} every ${Math.round(useInterval * 1000) / 1000} s (${event.reason}; provisional)`]);
  });
  // "+X% chance to trigger Lv. N Frost Shield and Delayed Pain on hit. Cooldown: 4 s" (census 2026-10-26 #2; src/empower-buffs.js
  // parseChanceTriggerPair): the pair's hit skill (Frost Shield) streams at the item's level + the build's skill level lines (2026-11-16), every cooldown + 1 ÷ (hits/s × chance) as
  // the recipe's probability-then-cooldown gate reads (the cooldown before the hit pass); Delayed Pain is Defensive (no damage). The
  // Empower half of such pairs (Bull's Rage and Burst of Anger) is a buff (src/empower-effects.js).
  modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).forEach((line, index) => {
    const pair = parseChanceTriggerPair(line.text);
    if (!pair || !(activeNames.has("Scorching Beam") || skillHitSources.length > 0)) return;
    for (const name of pair.names) {
      const setup = { ...(catalogSkillsByName.get(name) || {}), name, role: "item-trigger", ...itemSkillLevel(name, pair.level, line), supports: [], setupKey: `item-trigger-chance:${index}:${name}`, instanceId: `item-trigger-chance:${index}:${name}`, enabled: true };
      const profile = inferDamageProfile(setup);
      if (!profile || profile.engine !== "skill-hit") continue;
      const h = hitRateFacts?.hitsPerSecond, p = pair.chancePercent / 100;
      const interval = pair.cooldownSeconds + (h > 0 && p > 0 ? 1 / (h * p) : 0);
      itemTriggerSources.push({ setup, setupKey: setup.setupKey, itemTrigger: { name, level: pair.level, event: "hit", intervalSeconds: interval, chancePercent: pair.chancePercent, source: line.source, text: line.text, reason: `${pair.chancePercent}% chance on hit, cooldown ${pair.cooldownSeconds} s (game recipe 607440 shape; provisional)` }, profile: { ...profile, useModel: { kind: "rate", usesPerSecond: 1 / interval, firstUseSeconds: interval } } });
    }
  });
  for (const [key, note] of itemTriggerNotes) mechanics.recognized.set(key, note);
  // Gemma – Frostbitten Heart: Cold Pulse's own hit at the pulse rate (src/gemma-traits.js; game row 90013, stone 400000; chunk 1, 2026-10-31).
  const coldPulseCadence = lineEffects.hero?.gemma?.coldPulse;
  if (coldPulseCadence?.pulsesPerSecond > 0) {
    const setup = { name: "Cold Pulse", role: "item-trigger", tags: [...COLD_PULSE.tags], baseLevel: 1, addedLevels: 0, effectiveLevel: 1, supports: [], setupKey: COLD_PULSE_SETUP_KEY, instanceId: COLD_PULSE_SETUP_KEY, enabled: true };
    itemTriggerSources.push({ setup, setupKey: setup.setupKey, itemTrigger: { name: setup.name, level: 1, event: "hit", intervalSeconds: 1 / coldPulseCadence.pulsesPerSecond, source: "Hero trait: Frostbitten Heart", text: "When dealing Cold Damage, triggers Cold Pulse at the enemy's location", reason: `every ${coldPulseCadence.intervalSeconds} s${coldPulseCadence.blooming ? ", plus Blooming Frost Flower's" : ""} from the first Cold hit` }, profile: coldPulseProfile({ characterLevel: buildCharacterLevel(state).level, usesPerSecond: coldPulseCadence.pulsesPerSecond }) });
  }
  // Thea – Wisdom of The Gods: God's Boon's own hit with each cast (src/thea-gods-boon.js; game row 90020, stone 403001; chunk 1, 2026-11-01).
  const godsBoonCycle = lineConditionState.thea?.wisdom?.cycle;
  if (godsBoonCycle?.periodSeconds > 0) {
    const setup = { name: "God's Boon", role: "item-trigger", tags: [...GODS_BOON.tags], baseLevel: 1, addedLevels: 0, effectiveLevel: 1, supports: [], setupKey: GODS_BOON_SETUP_KEY, instanceId: GODS_BOON_SETUP_KEY, enabled: true };
    itemTriggerSources.push({ setup, setupKey: setup.setupKey, itemTrigger: { name: setup.name, level: 1, event: "use", intervalSeconds: godsBoonCycle.periodSeconds, source: "Hero trait: Wisdom of The Gods", text: "God's Boon: Consumes all Focus Blessings to grant self God's Boon", reason: `every ${godsBoonCycle.periodSeconds} s (the God's Boon cycle; game row ${GODS_BOON.gameRow})` }, profile: godsBoonProfile({ characterLevel: buildCharacterLevel(state).level, usesPerSecond: 1 / godsBoonCycle.periodSeconds, firstUseSeconds: godsBoonCycle.firstBoonSeconds }) });
  }
  // Rehan (hero trait audit B10; src/rehan-traits.js; provisional readings, src/open-questions.js):
  // - Anger's Burst: a triggered hit source (game row 90000; Burst Blast 90003) at its trigger rate in Berserk × the Berserk uptime,
  //   with its own additional damage lines, its level (+10% per tag-matching Skill Level line) and the Berserk-phase Rage lines in
  //   place of the time-averaged ones (it fires only while Berserk); Tunnel Vision's penalty does not reach it.
  // - Ritual of Offering's Disarm: the player's Attack Skills pause for that share of Berserk (a use-rate factor) and read the Rage
  //   lines of their attacking time; not in the measuring pass (it measures the undisarmed rates).
  const rehanSources = [];
  const rehanFinal = lineConditionState.rehan && !probeDebuffHitRates ? lineConditionState.rehan : null;
  const rehanWeaponFor = (texts) => calculateWeaponAttack({ equipment, disabledSlots: state.disabledEquipmentSlots, modifierTexts: [...texts, ...weaponSpeedLines, ...(blessings.castSpeedPercent > 0 ? [{ text: `+${Math.round(blessings.castSpeedPercent * 10000) / 10000}% Attack and Cast Speed`, source: "Agility Blessing (blessing model)", origin: "derived", multiplier: 1 }] : [])] });
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
  // A Mobility skill that is not the Main Skill is pressed for the buff windows it feeds, not nonstop (user decision 2026-11-08;
  // src/press-schedule.js mobilityWindows / mobilityPressInterval): its item triggers on Mobility use that hold, and on the first pass a
  // Mobility attack's press interval for its hit model, so the hit pass's facts (Mana consumed, hits and uses per second) already count its
  // presses at that cadence; the second pass reads the same interval from the rotation (pressRotation, `cadence`).
  const mobilityItemTriggers = modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).flatMap((line) => {
    const trigger = parseItemTrigger(line.text);
    if (!trigger || trigger.event !== "mobility" || !(trigger.intervalSeconds > 0)) return [];
    const event = itemTriggerEvent(trigger, { mobilityUsesPerSecond: boardMobilityUses(setups, requestedConditions) });
    return event.active ? [{ name: trigger.name, source: line.source, intervalSeconds: event.intervalSeconds ?? trigger.intervalSeconds }] : [];
  });
  const mobilityWindowInputs = { periodicBurst: periodicBurst?.entries || [], needs: mobilityNeeds(lineEffects.lines || [], blessings?.entries || [], { setups, activeNames }), pureHeart, itemTriggers: mobilityItemTriggers };
  const firstPassMobilityRotation = new Map();
  if (!hitRateFacts?.pressInputs && requestedConditions[PRESS_SWITCH] !== false) {
    const tangleKeys = new Set((tangles.setups || []).map((item) => item.setupKey));
    for (const setup of setups) {
      if (!setup || setup.enabled === false || !activeNames.has(setup.name) || setup.setupKey === resolvedMain?.setupKey || setup.role === "support" || setupBoardTab(setup) !== "skills") continue;
      if (!(setup.tags || []).includes("Mobility") || (setup.tags || []).includes("Empower") || setupTrigger(setup, tangleKeys)) continue;
      const profile = inferDamageProfile(setup);
      if (profile?.engine !== "skill-hit" || profile.demolisher) continue;
      const cadence = mobilityPressInterval(mobilityWindows(setup, mobilityWindowInputs), 0);
      if (cadence) firstPassMobilityRotation.set(setup.setupKey, { pressEverySeconds: cadence.intervalSeconds, cadence: true, text: `a Mobility skill pressed for its buffs, not nonstop (user decision 2026-11-08): ${cadence.text}; first pass, before its time from the Main Skill is counted` });
    }
  }
  // Carino's ammo cycle (hero trait audit B9, Q-H8; src/carino-traits.js): Projectile casts × the share of time they are available.
  const carinoAmmo = lineConditionState.carino;
  const carinoRateEffects = (setup) => carinoAmmo?.rate?.measured && Math.abs((carinoAmmo.rate.factor ?? 1) - 1) > 1e-12 && (setup?.tags || []).includes("Projectile")
    ? { rateFactor: carinoAmmo.rate.factor, rateNote: `Carino ammo: ${carinoAmmo.rate.mode === "heatCycle" ? `the Heat Up cycle (${carinoAmmo.ammo.magazine} ammo casts, ${carinoAmmo.heat?.phaseSeconds} s of Blank Firing, a ${carinoAmmo.ammo.reloadSeconds} s reload)` : `magazine ${carinoAmmo.ammo.magazine}, reload ${carinoAmmo.ammo.reloadSeconds} s, ${carinoAmmo.ammo.burst} cast(s) per reload`} at ${Math.round(carinoAmmo.rate.castsPerSecond * 1000) / 1000} Projectile casts/s: available ${Math.round(carinoAmmo.rate.factor * 10000) / 100}% of the time` } : null;
  // `extra` adds inputs a second pass settles (Erika's Multistrike states, src/erika-wind-stalker.js).
  // Item-granted Main Skills (src/item-main-skill-replacement.js; research/item-granted-main-skill-2026-10-26.md; orchestrator
  // decisions 2026-10-26, provisional readings in src/open-questions.js):
  // - True Flame Immolation: "This skill cannot be used", so its uses are the Main Skill triggers that cast it: Immolating World's
  //   (every 0.6 s / 0.5 s ÷ Cast Speed while the summed Max Blessing stacks are at least 20; src/main-skill-retriggers.js) plus the
  //   other Main Skill triggers and Miraculous Gain's; no cooldown. Per cast 233 × the Focus + Tenacity stacks consumed (SS14 text;
  //   the SS13 row reads all Blessings, open), Cold converted to Fire. Stacks consumed = (Max Focus + Max Tenacity) ×
  //   min(1, 2.5% × Cooldown Recovery Speed %): the refill after each cast (full at 40% or more; provisional below 40%). The
  //   Blessing-per-stack lines keep the Blessing model's held stacks.
  // - Barrier Burst: 75% × the full Barrier Shield (src/barrier-sources.js barrierShieldValue) per cast; cast by Necklace of
  //   Firebird on taking damage with a Barrier (being-hit best case 'Hit or blocked recently'), so one cast per Barrier gained
  //   (barrierGainRate), at most one per its 0.4 s cooldown. Without a Barrier source it is inactive. The other Main Skill
  //   triggers add no casts (tag 6000415 excluded; God of Machines's Dirge open). The replaced Main Skill's Guard Barrier is gone.
  // First use: one trigger interval in (gear-triggered skills, CLAUDE.md first-use rule).
  // Dual Kismet: Hunter's Hand (src/main-skill-retriggers.js): the player's uses of Attack Horizontal Projectile skills, measured by
  // the first hit pass below (null until then); the Main Skill is then computed again with them.
  let attackProjectileUses = null;
  const itemMainSkillProfile = (source, { castSpeedFactor = 1, miraculous = null, guardUses = null } = {}) => {
    const setup = source.setup, entry = ITEM_GRANTED_SKILLS_SS14[setup?.name];
    if (!entry) return null;
    const blessingEntries = blessings?.entries || [];
    const maxOf = (name) => Number(blessingEntries.find((item) => item.name === name)?.maxStacks) || 0;
    const totalMax = blessingEntries.reduce((sum, item) => sum + (Number(item.maxStacks) || 0), 0);
    const retrigger = mainSkillRetriggers(modifierTexts, { moving: conditions.moving, maxBlessingStacks: totalMax, castSpeedFactor, channeled: false, cooldownSeconds: 0, manualUsesPerSecond: 0, mainSkillName: setup.name, attackProjectileUses });
    const from = `${setup.itemGranted?.item || "an item"}: Lv. ${setup.effectiveLevel} ${setup.name} replaces the Main Skill`;
    if (setup.name === "True Flame Immolation") {
      const miraculousUses = miraculous?.usesPerSecond > 0 ? miraculous.usesPerSecond : 0;
      const usesPerSecond = retrigger.usesPerSecond + miraculousUses;
      const immolating = retrigger.sources.find((item) => /Max Blessing Stack/i.test(item.text));
      const hunterFirst = retrigger.components.length ? Math.min(...retrigger.components.map((item) => item.firstUseSeconds)) : null;
      const otherUses = usesPerSecond - retrigger.components.reduce((total, item) => total + item.usesPerSecond, 0);
      const firstUseSeconds = [immolating?.usesPerSecond > 0 ? 1 / immolating.usesPerSecond : otherUses > 1e-12 ? 1 / otherUses : null, hunterFirst].filter((value) => value !== null).reduce((least, value) => least === null ? value : Math.min(least, value), null);
      const focus = maxOf("Focus"), tenacity = maxOf("Tenacity");
      const triggers = [...retrigger.sources.map((item) => `${item.source}: ${item.reason}${item.usesPerSecond > 0 ? ` (${r4(item.usesPerSecond)}/s)` : ""}`), ...(miraculousUses ? [`${miraculous.label}: ${r4(miraculousUses)}/s`] : [])];
      const reason = usesPerSecond > 0 ? null : immolating ? `no casts: ${immolating.reason}` : "no casts: no Main Skill trigger casts it (it can only be triggered through Immolating World)";
      // The Blessing cycle (src/true-flame-blessing-cycle.js; 2026-10-28): the stacks found at each cast, from this skill's own
      // Cooldown Recovery Speed (the hit model's cooldown factor) and casts per second; a Blessing the build cannot gain (or one the
      // Blessing model converts away) is consumed at 0. Before the hit pass: the Blessing model's cycle (stat-sheet Cooldown Recovery).
      const cycleFor = (cdrPercent) => trueFlameBlessingCycle({
        blessings: TFI_CONSUMED_BLESSINGS.map((name) => { const item = blessingEntries.find((blessing) => blessing.name === name); return { name, maxStacks: item?.consumptionCycle ? Number(item.maxStacks) || 0 : 0, otherGains: (item?.gainSources || []).filter((gain) => gain.available && !gain.cycle).map((gain) => ({ source: gain.source, text: gain.text })) }; }),
        cooldownRecoveryPercent: cdrPercent, castsPerSecond: usesPerSecond, elixirCastsPerSecond: blessings?.consumptionCycle?.elixirCastsPerSecond ?? null });
      const build = (cdrPercent) => {
        const cycle = cycleFor(cdrPercent ?? blessings?.consumptionCycle?.cooldownRecoveryPercent ?? 0);
        const stacks = cycle.consumedPerCast;
        const summary = { kind: "trueFlameImmolation", item: setup.itemGranted?.item || null, level: setup.effectiveLevel, usesPerSecond, firstUseSeconds, maxFocus: focus, maxTenacity: tenacity, maxBlessingStacks: totalMax, refillShare: cycle.refillShare, cooldownRecoveryPercent: cdrPercent, stacksConsumed: stacks, basePerCast: entry.hit.perStack * stacks, cycle: cycle.entries, triggers, reason };
        const note = `${from}. Main Skill triggers (no manual casts: "This skill cannot be used"): ${triggers.join("; ") || "none"} = ${r4(usesPerSecond)} casts/s. Per cast ${entry.hit.perStack} Cold × ${r4(stacks)} Focus + Tenacity stacks consumed = ${r4(entry.hit.perStack * stacks)}, converted to Fire. ${cycle.text} (refill rounded down, other gains continuous: provisional).`;
        return { ...source.profile, runtimeBaseValues: { hit: entry.hit.perStack * stacks }, useModel: { kind: "rate", usesPerSecond, firstUseSeconds, note }, warnings: [...(source.profile.warnings || []), ...(reason ? [`True Flame Immolation: inactive — ${reason}.`] : [])], itemMainSkill: summary };
      };
      return { profile: build(null), refill: (cooldownFactor) => build((Math.max(0, Number(cooldownFactor) || 1) - 1) * 100), summary: (profile) => profile.itemMainSkill };
    }
    // Barrier Burst.
    const hitRecently = requestedConditions.blockedRecently !== false;
    const gain = barrierGainRate({ modifierTexts, guardSources: barrierSources || [], moving: conditions.moving !== false, hitRecently, usesPerSecondFor: (key) => guardUses?.get(key) ?? null, moveSpeed: lineConditionState.playerMoveSpeed });
    // One cast per Barrier, no new Barrier while one is held (10 T claim audit G4, 2026-11-09; src/barrier-sources.js barrierBurstCastRate):
    // a gain is lost while a Barrier waits for damage taken, the cooldown (0.4 s ÷ the skill's Cooldown Recovery Speed: the hit model's
    // cooldown factor, read on the second pass) or its removal 0.1 s after the cast. Damage taken: the build's "Takes N True Damage every
    // X s" (record 969115264), else every frame (the being-hit best case).
    const damageEverySeconds = selfDamageIntervalSeconds(modifierTexts) ?? 1 / 30;
    const buildBurst = (cooldownFactor) => {
      const cooldown = entry.timing.cooldown / Math.max(1e-9, Number(cooldownFactor) || 1);
      const castRate = hitRecently ? barrierBurstCastRate({ sources: gain.sources.filter((item) => item.active), cooldownSeconds: cooldown, damageEverySeconds }) : null;
      const usesPerSecond = hitRecently ? castRate.castsPerSecond : 0;
      const stats = lineConditionState.stats || {};
      const shield = barrierShieldValue({ maxLife: stats.maxLife, maxEnergyShield: stats.maxEnergyShield, modifierTexts });
      const perCast = entry.hit.barrierPercent / 100 * shield.shield;
      const reason = usesPerSecond > 0 ? null : !hitRecently ? "no casts: it is cast upon taking damage and 'Hit or blocked recently' is off" : gain.sources.length ? `no casts: no Barrier is gained (${gain.sources.map((item) => `${item.source}: ${item.reason}`).join("; ")})` : "no casts: the build has no Barrier source (Guard on a channeled skill, a movement or taking-damage Barrier line)";
      const excluded = retrigger.sources.map((item) => `${item.source}: ${item.reason}`);
      const summary = { kind: "barrierBurst", item: setup.itemGranted?.item || null, level: setup.effectiveLevel, usesPerSecond, firstUseSeconds: usesPerSecond > 0 ? 1 / usesPerSecond : null, barrierPerSecond: gain.perSecond, barrierSources: gain.sources, barrierGainsLostPerSecond: castRate?.lostPerSecond ?? 0, damageEverySeconds, cooldownSeconds: cooldown, shield: shield.shield, shieldBase: shield.base, shieldBonus: { increasedPercent: shield.bonus.increased, additionalFactor: shield.bonus.additional, sources: shield.bonus.sources }, maxLife: stats.maxLife || 0, maxEnergyShield: stats.maxEnergyShield || 0, basePerCast: perCast, otherTriggers: excluded, reason };
      const note = `${from}. Cast by Necklace of Firebird when taking damage with a Barrier (being-hit best case), one per Barrier gained: ${gain.sources.map((item) => `${item.source} ${r4(item.perSecond)}/s (${item.reason})`).join("; ") || "no Barrier source"}; no new Barrier while one is held (damage taken every ${r4(damageEverySeconds)} s, the ${r4(cooldown)} s cooldown, the removal 0.1 s after the cast: ${r4(castRate?.lostPerSecond ?? 0)} gains/s lost; G4, 30 Hz frames) = ${r4(usesPerSecond)} casts/s (provisional). Per cast ${entry.hit.barrierPercent}% × Barrier Shield ${r4(shield.shield)} (20% × (Max Life ${r4(stats.maxLife || 0)} + Max Energy Shield ${r4(stats.maxEnergyShield || 0)})${shield.bonus.increased ? ` × (1 + ${r4(shield.bonus.increased)}%)` : ""}${shield.bonus.additional !== 1 ? ` × ${r4(shield.bonus.additional)}` : ""}) = ${r4(perCast)} Fire.${excluded.length ? ` Other Main Skill triggers: ${excluded.join("; ")}.` : ""}`;
      // User-confirmed in game 2026-11-09 ("It can spell burst"; 10 T claim audit G1): Barrier Burst activates Spell Burst under the manual's
      // rules (src/skill-hit-model.js spellBurstUserConfirmed), against the records (label 3001604). Every cast, an automatic one too, deals
      // 75% of fight resource 23, which only Necklace of Firebird's row 4 writes, at each Barrier gained (the affix catalog has no other
      // writer); the removal 0.1 s after a cast leaves it, so the automatic casts read the last Barrier gained in full.
      return { ...source.profile, spellBurstUserConfirmed: true, runtimeBaseValues: { hit: perCast }, useModel: { kind: "rate", usesPerSecond, firstUseSeconds: summary.firstUseSeconds, note }, warnings: [...(source.profile.warnings || []), ...(reason ? [`Barrier Burst: inactive — ${reason}.`] : [])], itemMainSkill: summary };
    };
    return { profile: buildBurst(1), refill: (cooldownFactor) => buildBurst(cooldownFactor), summary: (item) => item.itemMainSkill };
  };
  const scopedAttackSpeedFor = scopedAttackSpeedAdjuster({ modifierTexts, weaponLineKind: classifyWeaponAttackLine });
  // W9 step 3 (src/attribute-pool-build.js): with TLI_POOL_HIT=pool the build's attribute pool (record writes, held buffs, stat totals,
  // conversion records) under every generic skill hit's pool; built once per pass, none on the ledger path.
  let attributePool;
  const attributePoolFor = () => (attributePool ??= hitPoolMode() === "pool" ? buildAttributePool({ modifierTexts, playerBuffs, stats: lineConditionState.stats, conversions: poolConversionMode(), movementSpeedPercent: lineConditionState.movementSpeedPercent }) : null);
  // The extra inputs each hit source was last computed with (the hero, Erika and Carino passes below), so the hit pass's Spell Burst refill
  // (15 T Chain Lightning audit G1) can compute a hit again with them.
  const lastHitExtra = new Map();
  const computeSkillHit = (source, extra = {}) => {
    lastHitExtra.set(source, extra);
    const setup = source.setup;
    // Rehan (hero trait audit B10): a source's own Rage-phase lines (Burst and the Seething Spirit: Berserk; a disarmed player: the
    // attacking time) in place of the time-averaged ones, with the weapon model they give.
    const sourceTexts = source.lineSwap ? [...modifierTexts.filter((line) => !source.lineSwap.drop(line)), ...source.lineSwap.add] : modifierTexts;
    const sourceWeapon = source.lineSwap && source.profile.weaponScaling ? rehanWeaponFor(sourceTexts) : weaponAttack;
    // Channel skills (src/skill-hit-profiles.js useModel "channel") keep the channel-only speed line.
    const noChannelTalent = source.profile.channeled ? talentSlate : { ...talentSlate, candidateTalent: { ...(talentSlate.candidateTalent || {}), channeledAttackAndCastSpeedPercent: 0 }, candidateSlate: { ...(talentSlate.candidateSlate || {}), channeledAttackAndCastSpeedPercent: 0 } };
    const speed = scorchingBeamCastRate({ speedAdjust, lineSpeed: lineEffects.castSpeed, blessings, ceaselessTide: heroMemories.ceaselessTide, main: setup, talentSlate: noChannelTalent, equipment: memoryEquipment, pact, aimCastSpeedPercent: aim.averageCastSpeedPercent });
    const speedFactor = speed.baseRate > 0 ? speed.castsPerSecond / speed.baseRate : 1;
    // increasedPercent / additionalFactor: the two Cast Speed layers, for Play Safe's Cast Speed → Spell Burst Charge Speed (src/skill-hit-model.js).
    const castSpeed = { factor: speedFactor, increasedPercent: speed.increasedPercent, additionalFactor: speedFactor / Math.max(1e-9, Math.max(0, 1 + speed.increasedPercent / 100)), sources: [{ source: "Cast Speed total (planner cast-rate ledger)", text: `+${Math.round(speed.increasedPercent * 100) / 100}% increased, +${Math.round(speed.additionalPercent * 100) / 100}% additional${speed.ceaselessTideSpeedFactor !== 1 ? ", ×0.8 Ceaseless Tide" : ""}`, value: Math.round((speedFactor - 1) * 10000) / 100 }] };
    // The character's Cast Speed without the setup's own support lines (Quick Decision), for Play Safe (user decision 2026-10-19).
    const characterSpeed = scorchingBeamCastRate({ speedAdjust, lineSpeed: lineEffects.castSpeed, blessings, ceaselessTide: heroMemories.ceaselessTide, main: { ...setup, supports: [] }, talentSlate: noChannelTalent, equipment: memoryEquipment, pact, aimCastSpeedPercent: aim.averageCastSpeedPercent });
    const characterSpeedFactor = characterSpeed.baseRate > 0 ? characterSpeed.castsPerSecond / characterSpeed.baseRate : 1;
    castSpeed.character = { increasedPercent: characterSpeed.increasedPercent, additionalFactor: characterSpeedFactor / Math.max(1e-9, Math.max(0, 1 + characterSpeed.increasedPercent / 100)) };
    const intelligenceLine = hitModifiers.ledger.find((entry) => /^Total Intelligence/.test(entry.source));
    // Selena (Sing with the Tide): the Tide Effect buff's All Damage writes and the Bard Channeled Skill penalty reach every
    // generic hit (src/selena-tide.js hitLines); Scorching Beam keeps its own hit ledger (src/scorching-beam-hit.js).
    const afflictionFire = afflictionFireHitLines(afflictionFireState, { ownAdditionalPercent: cataclysmEffectPercent(setup), label: setup.name });
    const hitOnlyLines = [...blessingHitLines, ...singWithTheTide.hitLines, ...(pureHeart?.hitLines || []), ...afflictionFire.lines];
    // A buff for the character's "other skills" (Ice Bond's Euphoria, src/empower-effects.js) skips the skill that grants it.
    const ownLines = sourceTexts.some((line) => line.exceptSetupKey === setup.setupKey) ? sourceTexts.filter((line) => line.exceptSetupKey !== setup.setupKey) : sourceTexts;
    const common = { rotation: pressRotationState?.bySetup?.get(source.setupKey) || firstPassMobilityRotation.get(source.setupKey) || null, spellTagOnAttack: spellToAttack.sources.length > 0, measuredDealtTypes: hitRateFacts?.bySetup?.get(source.setupKey)?.scopeTypes || null, setup, profile: stabInTheBackLines(source.setupKey).length ? { ...source.profile, grantedAdditional: [...(source.profile.grantedAdditional || []), ...stabInTheBackLines(source.setupKey)] } : source.profile, modifierTexts: hitOnlyLines.length ? [...ownLines, ...hitOnlyLines] : ownLines, castSpeed, burstChargeTrigger: resolvedMain?.setupKey && source.setupKey === resolvedMain.setupKey ? solidRiverTriggers(modifierTexts)[0] || null : null, takenConversion: lineEffects.hero?.takenConversion || null, movedRecently: requestedConditions.movedRecently !== false, multistrikeEventsPerSecond: hitRateFacts?.multistrikeEventsPerSecond ?? null,luckyDamageRolls: lineEffects.combat?.lucky?.damageRolls || 1, luckyState: lineEffects.combat?.lucky || null, deterioration: lineEffects.combat?.deterioration || null, auraEntries: aura.entries.filter((entry) => activeNames.has(entry.name)), aim, intelligenceAdditionalPercent: intelligenceLine?.percent || 0, mainStatPoints: mechanics.intelligence?.removed ? null : lineEffects.state?.stats || null, intelligenceSource: intelligenceLine?.source || null, target: { resistancePercent: { Fire: damageCombat.targetFireResistancePercent, Cold: damageCombat.targetColdResistancePercent ?? 30, Lightning: damageCombat.targetLightningResistancePercent ?? 30, Erosion: damageCombat.targetErosionResistancePercent ?? 30 }, ...(juggernaut ? { armourPercent: juggernaut.armourPercent, nonPhysicalArmourPercent: juggernaut.nonPhysicalArmourPercent } : {}), frostbiteRating: Number(enemyBuffSet(lineConditionState)?.level("Frostbite") ?? lineEffects.combat?.debuffs?.frostbiteRating) || 0 }, targetCursed,
      // Curses on the dummy (skill curses within the limit + gear-triggered curses) and the enemy-ailment model's types, for
      // components gated on a Cursed target (Shackles of Malice) and triggers gated on an ailment (Ice Focus: Frostbite).
      targetCurseCount: curseLimit.active.length + mechanics.curses.active.length, enemyAilments: mechanics.enemyAilments,
      // "+X% additional damage applied to Life" (talent and slate totals + the other origins' lines): one summed term (src/damage-to-life.js).
      damageToLife: damageToLifeTerm({ talentSlate, otherLines: mechanics.damageToLife || [], targetLife: conditions.targetLife !== false }) };
    const critFor = (castsPerSecond, strikeCritChancePercent = null) => scorchingBeamCritical({ critAdjust, main: setup, talentSlate, equipment: memoryEquipment, pact, modifierTexts: sourceTexts, fireResistanceTotalPercent: resistances.entries.find((entry) => entry.element === "Fire")?.total || 0, castsPerSecond, targetHasAilment: canIgnite || (enemyBuffSet(mechanics.enemyAilments)?.count() ?? mechanics.enemyAilments.count) > 0, strikeCritChancePercent });
    // Scorch (curse-model.js): cursed enemies take additional Fire damage; Entangled Pain is damage over time only.
    common.extraTaken = [...(conditions.scorch ? [{ source: "Scorch curse", text: `+${curses.scorchDamagePercent}% additional Fire Damage taken (Scorch on the dummy)`, value: curses.scorchDamagePercent, types: ["Fire"] }] : []), ...singWithTheTide.takenLines];
    // Distance (exclusive group "Distance"): a projectile fan lands every projectile standing close, one at range (src/shotgun-effect.js).
    common.nearTarget = conditions.nearTarget !== false;
    // "Projectiles hitting the dummy" (Config tab; user decision 2026-11-12): the user's landing count for this setup's projectile
    // volleys, absent = automatic (best case). It wins at either distance (src/skill-hit-model.js landedOverride).
    { const saved = state.combat.projectileHits?.[source.setupKey]; common.projectileHits = Number.isInteger(saved) && saved >= 1 ? saved : null; }
    // Fervor from your unit buff set (W9 step 2: the Rating a level, Fervor Effect on its entry), else the combat pass's `buffs`.
    { const held = ownCombatHeld(playerBuffs) ?? lineEffects.combat?.buffs; common.fervor = { rating: held?.fervorRating || 0, effectPercent: held?.fervorEffectPercent || 0 }; }
    // Recipe gates the state settles on generic skill hits (Lich (6,3) both-sealed +10%; F6 2026-10-27, as the beam ledger at recipeState).
    common.recipeState = { targetCursed, sealedLifeAndMana: aura.entries.some((entry) => entry.reservation?.resource === "life") && aura.entries.some((entry) => entry.reservation?.resource === "mana") };
    common.attributePool = attributePoolFor();
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
    // Gemma: Three-Chambered Heart's Advanced Elemental Impact on the Main Skill's hits (game record 5941629).
    if (lineEffects.hero?.gemma?.advancedElementalImpact && setup.setupKey && setup.setupKey === resolvedMain?.setupKey) common.heroEffects = { ...(common.heroEffects || {}), advancedElementalImpact: lineEffects.hero.gemma.advancedElementalImpact };
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
    common.frameSnap = frameSnapTimers;
    // Census batch 6: the skills on the board (Scorching Pulse's Flame Core retrigger; src/minion-sentry-batch6.js).
    common.boardSkillNames = new Set(setups.filter((item) => item.enabled !== false && activeNames.has(item.name)).map((item) => item.name));
    // Chunk 9: the stat sheet's increased Movement Speed (the Mobility attacks' own 75% share, recipe 811059904) and Archery Bond's held "Projectile Quantity is fixed at 1".
    common.movementSpeedPercent = lineConditionState.movementSpeedPercent || 0;
    common.moveSpeed = lineConditionState.playerMoveSpeed;
    common.projectileQuantityFixed = empowerEffects.entries.some((entry) => entry.projectileFixed && entry.active);
    common.tagSpeedLines = empowerEffects.entries.flatMap((entry) => (entry.active ? (entry.lines || []).filter((line) => line.kind === "tagSpeed").map((line) => ({ tags: line.tags, source: `${entry.skill}: Euphoria`, text: line.text, value: line.average })) : []));
    // Tangle casts are triggered (Hair-trigger; user-supplied 2026-10-19, Google AI Mode answer, not tested in game).
    common.tangleSkill = (tangles.setups || []).some((item) => item.setupKey === setup.setupKey);
    // The planner's Main Skill (Sweeping Fury's 1000033 row needs Main Skill 6020000; every custom board skill has the "main" role).
    common.isMainSkill = Boolean(resolvedMain?.setupKey) && setup.setupKey === resolvedMain.setupKey;
    // Spell Burst Charge gained on your uses (src/spell-burst-refill.js; 15 T Chain Lightning audit G1): the uses of yours that raise 1000074,
    // measured by the hit pass (hitRateFacts.playerUseStreams, present only on a build with a refill line).
    if (hitRateFacts?.playerUseStreams) common.spellBurstUseStreams = hitRateFacts.playerUseStreams;
    // Miraculous Gain's Main Skill triggers (user-supplied 2026-10-19): extra uses of the Main Skill.
    common.extraTriggeredUses = miraculousGain?.mainSkillUsesPerSecond > 0 && setup.setupKey === resolvedMain?.setupKey ? { usesPerSecond: miraculousGain.mainSkillUsesPerSecond, label: "Miraculous Gain triggers", note: miraculousGain.text } : null;
    // Main Skill triggers from legendary lines (src/main-skill-retriggers.js; legendary audit batch 2, provisional): extra full uses.
    // An item-granted Main Skill takes its uses from triggers only (itemMainSkillProfile below), so it is skipped here.
    if (setup.setupKey && setup.setupKey === resolvedMain?.setupKey && !setup.itemGranted) {
      const cooldownSeconds = skillHitTiming(source.profile)?.cooldownSeconds || 0;
      const retrigger = mainSkillRetriggers(modifierTexts, { moving: conditions.moving, maxBlessingStacks: (blessings?.entries || []).reduce((sum, entry) => sum + (Number(entry.maxStacks) || 0), 0), castSpeedFactor: common.castSpeed?.factor || 1, channeled: (setup.tags || []).includes("Channeled"), cooldownSeconds, manualUsesPerSecond: cooldownSeconds > 0 ? 1 / cooldownSeconds : 0, mainSkillName: setup.name, attackProjectileUses });
      if (retrigger.usesPerSecond > 0) {
        const label = retrigger.sources.filter((item) => item.active).map((item) => `${item.source}: ${item.text}`).join("; ");
        common.extraTriggeredUses = { components: [...(common.extraTriggeredUses?.components || []), ...retrigger.components], usesPerSecond: (common.extraTriggeredUses?.usesPerSecond || 0) + retrigger.usesPerSecond, label: [common.extraTriggeredUses?.label, `Main Skill triggers (${label}; provisional)`].filter(Boolean).join(" + "), note: [common.extraTriggeredUses?.note, retrigger.sources.filter((item) => item.active).map((item) => item.reason).join("; ")].filter(Boolean).join("; ") };
      }
    }
    // Item-granted Main Skill (src/item-main-skill-replacement.js; 2026-10-26): a rate model from its triggers and the runtime base.
    const itemMain = setup.itemGranted ? itemMainSkillProfile(source, { castSpeedFactor: common.castSpeed?.factor || 1, miraculous: common.extraTriggeredUses, guardUses: extra.itemMainGuardUses || null }) : null;
    if (itemMain) { common.profile = itemMain.profile; common.extraTriggeredUses = null; }
    const { itemMainGuardUses: _itemMainGuardUses, ...restExtra } = extra;
    extra = restExtra;
    Object.assign(common, extra);
    if (source.profile.weaponScaling) {
      common.weapon = sourceWeapon; common.attackSpeed = sourceWeapon.attackSpeed;
      // Tag-scoped Attack Speed (W6 follow-up, 2026-11-03; src/recipe-hit-aggregates.js scopedAttackSpeedAdjuster): the lines that write
      // Attack Speed on skill tags reach this attack by its tags with its supports' tag changes (Rapid Advance makes Split Shot Channeled,
      // so "+3% Attack and Cast Speed for Channeled Skills" speeds it up).
      const scopedSpeed = (sourceTexts === modifierTexts ? scopedAttackSpeedFor : scopedAttackSpeedAdjuster({ modifierTexts: sourceTexts, weaponLineKind: classifyWeaponAttackLine }))(skillTagsWithSupportChanges(source.profile.tags || setup.tags || [], setup));
      if (scopedSpeed.lines.length && sourceWeapon.attackSpeed) {
        const base = sourceWeapon.attackSpeed, increasedPercent = base.increasedPercent + scopedSpeed.increased, additionalFactor = base.additionalFactor * scopedSpeed.additional.reduce((factor, value) => factor * Math.max(0, 1 + value / 100), 1);
        common.attackSpeed = { ...base, increasedPercent, additionalFactor, sources: [...base.sources, ...scopedSpeed.lines], factor: (base.weaponAttacksPerSecond || 0) * Math.max(0, 1 + increasedPercent / 100) * additionalFactor };
      }
      // Spell-only crit damage ("+X% Spell Critical Strike Damage" talents/slates) does not reach attacks.
      // Alternate dual wielding (user-confirmed 2026-10-14): each hand's chance by the same rule (sourceWeapon.crit.hands).
      // Lucky per crit determination (research/lucky-crit-mechanics-2026-10-27.md, verdict A): a weapon crit with part-time terms
      // converts each time state on its own (src/crit-time-states.js), and a part-time Lucky grant holds its share of the time.
      const attackLucky = (states) => { const rolls = lineEffects.combat?.lucky?.critRolls || 1, luckyShare = lineEffects.combat?.lucky?.critPartialShare || 0; return (1 - luckyShare) * luckyChanceOverStates(states, rolls) + luckyShare * luckyChanceOverStates(states, Math.max(2, rolls)); };
      const attackChance = (spell, weaponCrit) => attackLucky(spell.lineCrit?.sentryRating ? [{ weight: 1, plainChancePercent: Math.min(100, weaponCrit.rating * (1 + (weaponCrit.increasedRatingPercent + spell.lineCrit.sentryRating) / 100) / Math.max(1e-9, 1 + weaponCrit.increasedRatingPercent / 100) / 100) }] : weaponCrit.states || [{ weight: 1, plainChancePercent: weaponCrit.chancePercent }]);
      // "per recent non-Critical Strike" stacks (2026-10-15) count the attack's own non-crit hits (its weapon crit chance).
      const attackCrit = (castsPerSecond) => { const spellFirst = critFor(castsPerSecond); const spell = spellFirst.conditionalSources.some((item) => item.nonCrit) ? critFor(castsPerSecond, attackChance(spellFirst, sourceWeapon.crit)) : spellFirst; const spellOnly = spell.spellOnlyCriticalDamagePercent || 0; return { ...spell, criticalDamagePercent: spellOnly ? Math.max(100, spell.criticalDamagePercent - spellOnly) : spell.criticalDamagePercent, combatCriticalDamagePercent: spellOnly ? spell.combatCriticalDamagePercent - spellOnly : spell.combatCriticalDamagePercent, criticalChancePercent: attackChance(spell, sourceWeapon.crit), hands: sourceWeapon.crit.hands ? sourceWeapon.crit.hands.map((hand) => ({ ...hand, criticalChancePercent: attackChance(spell, hand) })) : null, rating: sourceWeapon.crit.rating, attackCrit: sourceWeapon.crit }; };
      const first = calculateSkillHit({ ...common, crit: attackCrit(0) });
      // Recent-strike stacks count crit events: every landing hit event (SS14 client R-b, 2026-11-04; was the determinations, 2026-10-27).
      return calculateSkillHit({ ...common, crit: attackCrit(first.rate.critEventsPerSecond ?? first.rate.hitsPerSecond) });
    }
    const first = calculateSkillHit({ ...common, crit: critFor(0) });
    // True Flame Immolation's stacks consumed follow the skill's Cooldown Recovery Speed (the hit model's cooldown factor).
    if (itemMain?.refill) common.profile = itemMain.refill(first.rate.cooldownFactor);
    const settled = calculateSkillHit({ ...common, crit: critFor(first.rate.critEventsPerSecond ?? first.rate.hitsPerSecond) });
    return itemMain ? { ...settled, itemMainSkill: itemMain.summary(common.profile) } : settled;
  };
  let skillHits = allHitSources.map((source) => computeSkillHit(source));
  // Dual Kismet: Hunter's Hand: the player's uses of the enabled board skills tagged Attack + Horizontal (game tags 6001090 / 6001111;
  // gear / pact triggered skills and triggered uses do not count, provisional) set its trigger rate; the Main Skill is computed again.
  if (modifierTexts.some((line) => line.origin !== "derived" && !line.lineEffect && HUNTERS_HAND_LINE.test(normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim()))) {
    const qualifying = skillHits.map((hit, index) => ({ hit, setup: allHitSources[index]?.setup })).filter(({ hit, setup }) => setup && setup.role !== "item-trigger" && !setup.rehanBurst && isAttackHorizontalProjectile(setup.tags || []) && hit?.rate?.playerUsesPerSecond > 0);
    const firsts = qualifying.map(({ hit }) => hit.rate.firstUseSeconds).filter((value) => Number.isFinite(value) && value >= 0);
    attackProjectileUses = { usesPerSecond: qualifying.reduce((total, { hit }) => total + hit.rate.playerUsesPerSecond + ownMultistrikeRepeats(hit), 0), firstUseSeconds: firsts.length ? Math.min(...firsts) : null, skills: qualifying.map(({ setup }) => setup.name) };
    const mainIndex = allHitSources.findIndex((source) => source.setup?.setupKey && source.setup.setupKey === resolvedMain?.setupKey);
    if (mainIndex >= 0) {
      const mainSetup = allHitSources[mainIndex].setup;
      const recomputed = mainSetup.itemGranted && mainSetup.name === "Barrier Burst" ? skillHits[mainIndex] : computeSkillHit(allHitSources[mainIndex]);
      const hunter = mainSkillRetriggers(modifierTexts.filter((line) => HUNTERS_HAND_LINE.test(normalizeLineText(String(line.text ?? "")).replace(/\s+/g, " ").trim())), { mainSkillName: mainSetup.name, channeled: !mainSetup.itemGranted && (mainSetup.tags || []).includes("Channeled"), attackProjectileUses }).sources.filter((item) => !item.active);
      // Active, but the Main Skill's cooldown (or one-at-a-time ground effect) already sets its rate: triggers fill only the gap to 1 ÷ cooldown.
      if (!hunter.length && !(recomputed.notes || []).some((note) => /uses\/s by the player/.test(note))) hunter.push({ source: "Dual Kismet: Hunter's Hand", reason: "the Main Skill's cooldown already sets its use rate (triggers only fill the gap up to 1 ÷ cooldown)" });
      skillHits[mainIndex] = hunter.length ? { ...recomputed, notes: [...(recomputed.notes || []), ...hunter.map((item) => `${item.source}: Main Skill trigger inactive — ${item.reason}.`)] } : recomputed;
    }
  }
  // Barrier Burst (item-granted Main Skill): a Guard Barrier follows its channeled skill's uses (every 5), which the pass above measured.
  const barrierBurstIndex = allHitSources.findIndex((source) => source.setup?.itemGranted && source.setup.name === "Barrier Burst");
  if (barrierBurstIndex >= 0 && (barrierSources || []).length) skillHits[barrierBurstIndex] = computeSkillHit(allHitSources[barrierBurstIndex], { itemMainGuardUses: new Map(skillHits.map((hit) => [hit.setupKey, hit.rate?.usesPerSecond || 0])) });
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
  // The dummy's state the Alternate Spacetime readers settle against (skill-mechanics census batch 2): crowd control types, the Trauma
  // model's steady stacks (the probe pass's facts), Numbed stacks and the Curse limit.
  const dummyBuffs = enemyBuffSet(lineConditionState);
  const yougaTarget = { crowdControlTypes: dummyBuffs?.crowdControlTypes() ?? lineEffects.combat?.crowdControl ?? [],
    crowdControlCount: dummyBuffs ? dummyBuffs.crowdControlCount() : (lineEffects.combat?.crowdControl || []).reduce((total, type) => total + Number(lineEffects.combat?.crowdControlShares?.[type] ?? 1), 0), traumaStacks: hitRateFacts?.trauma?.steadyActiveStacks ?? 0, numbedStacks: (dummyBuffs ? dummyBuffs.level("Numbed") : lineEffects.combat?.debuffs?.numbedStacks) || 0, curseSlots: curseLimit?.maximum ?? 1,
    frostbite: { rating: (dummyBuffs ? dummyBuffs.level("Frostbite") : lineEffects.combat?.debuffs?.frostbiteRating) || 0, effectPercent: lineEffects.combat?.debuffs?.frostbiteEffectPercent || 0, effectFactor: lineEffects.combat?.debuffs?.frostbiteEffectFactor ?? 1 } };
  const yougaUltimateOne = lineConditionState.yougaUltimateOne ? resolveYougaUltimateOne({ state: lineConditionState.yougaUltimateOne, hits: skillHits, target: yougaTarget }) : null;
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
  // Stray Bird's Return (2026-10-28, provisional; open question first-aember-crafting lists it): "Normal Projectiles will return after
  // reaching their max range and will hit enemies on their path again". As Carino's Evil Ouroboros: on one dummy only a projectile
  // that passes through it reaches its max range, so a Horizontal Projectile skill with Penetration (≥ 1, or the item's Stray Bird
  // keyword "Attack Horizontal Projectiles always Penetrate" on an Attack) hits it once more on the way back as a full hit, with the
  // "+X% additional Returning Projectile Damage" lines (game recipe 775506, tag 6001114 Projectile return) on that hit only. Best case:
  // the dummy stands on the return path (the same switch as Carino's, carinoReturningHits). Carino's own model takes precedence.
  const strayClean = (line) => String(line?.text || "").replace(/\s+/g, " ").trim();
  const strayReturn = !probeDebuffHitRates && !lineConditionState.carino?.returning && requestedConditions.carinoReturningHits !== false
    && modifierTexts.some((line) => /^Normal Projectiles will return after reaching their max range and will hit enemies on their path again$/i.test(strayClean(line)));
  if (strayReturn) {
    const alwaysPenetrate = modifierTexts.some((line) => /^Attack Horizontal Projectiles always Penetrate$/i.test(strayClean(line)));
    skillHits.forEach((hit, index) => {
      const source = allHitSources[index], tags = new Set(source?.setup?.tags || []);
      if (!hit?.modeled || !tags.has("Projectile")) return;
      const mechanics = projectileMechanics(source.setup, modifierTexts);
      const attackHorizontal = tags.has("Attack") && tags.has("Horizontal");
      const penetrates = mechanics.penetration.total >= 1 || (alwaysPenetrate && attackHorizontal);
      const strike = hit.components.find((component) => !component.addedOnly);
      const strikeKey = strike ? strike.strikeKey ?? strike.key : null;
      if (mechanics.recallBlock || !penetrates || !strikeKey) return;
      const additional = modifierTexts.map((line) => ({ line, match: strayClean(line).match(/^\+(\d+(?:\.\d+)?)% additional Returning Projectile Damage( for Attack Horizontal Projectiles)?$/i) }))
        .filter(({ match }) => match && (!match[2] || attackHorizontal))
        .map(({ line, match }) => ({ source: line.source, text: strayClean(line), value: Number(match[1]) * (line.multiplier ?? 1) }));
      const recall = { recallsPerProjectile: 1, shareOfUses: 1, hitsFactor: 1, strikeKey, additional, note: `Stray Bird's Return (provisional): each projectile passes through the dummy (${mechanics.penetration.total >= 1 ? `${mechanics.penetration.total} Penetration` : "Stray Bird: Attack Horizontal Projectiles always Penetrate"}), returns from its max range and hits it once more` };
      const returned = computeSkillHit(source, { carinoRecall: recall });
      returned.strayBirdReturn = { active: true, returningAdditional: additional.map((line) => line.text) };
      skillHits[index] = returned;
    });
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
          // A slot that outlevels the socketed copy replaces it on that cast (client reload component; encrypted-scripts survey 2026-11-03).
          const replaced = new Set(grants.filter((grant) => special.eligible.some((slot) => slot.name === grant.name && slot.replaces)).map((grant) => grant.name));
          const variantSetup = grants.length ? { ...source.setup, supports: [...(source.setup.supports || []).filter((support) => support.granted || !replaced.has(support.name)), ...resolveSetupSupports(source.setup, source.setup.setupKey, [], grants).supports.map((support) => ({ ...support, specialAmmo: true }))] } : source.setup;
          if (grants.length) variantSetup.supportEffects = resolveSupportEffects(variantSetup, { ...supportEffectsContext(variantSetup, focusBlessingStacks), conditions: supportConditions });
          // A bullet whose support does not fit this skill is spent with no effect, and earns no "if a Special Ammo is consumed" line.
          const additional = grants.length ? variant.additional : variant.additional.filter((line) => !line.needsCounted);
          const hit = computeSkillHit({ ...source, setup: variantSetup }, { carinoAdditional: additional, ...(recallFor.has(index) ? { carinoRecall: recallFor.get(index) } : {}) });
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
    // Heat Up's writes on the ailments Projectile Skills inflict (src/carino-traits.js heatAilmentScale).
    const heatScale = heatAilmentScale(carinoFinal);
    if (heatScale.length) for (const index of projectileIndexes) skillHits[index].ownAilmentScale = [...(skillHits[index].ownAilmentScale || []), ...heatScale];
    // The badges read the settled returning state (src/hero-trait-modules.js "ouroboros").
    if (returning) {
      const settled = resolveHeroModules(modifierTexts.filter((line) => line.origin === "trait" && !line.lineEffect), lineConditionState).entries.filter((entry) => entry.module === "ouroboros");
      lineEffects.lines = [...lineEffects.lines.filter((entry) => entry.module !== "ouroboros"), ...settled];
    }
  }
  // Rehan (hero trait audit B10; src/rehan-traits.js; provisional): the Seething Spirit casts the Main Skill at the player's own use rate
  // for it (× Fury's Onslaught's -30%) while Berserk (Ritual of Offering: always; Fury's Onslaught: while the Main Skill is used within
  // every 2 s), each a full use with the Berserk lines, Ritual's +X% and Fury's offset (Starfall Wasteland: +1 Projectile Quantity and
  // Penetration, its returning projectiles); its uses join the Main Skill's hit, and its hits are applications of that skill's ailments
  // (they read your lines, as its damage does; inferred). Then the badges read the settled Burst / Spirit state.
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
        if (player.ailmentInputs) player.ailmentInputs = { ...player.ailmentInputs, hitsPerSecond: (player.ailmentInputs.hitsPerSecond || 0) + usesPerSecond * (hit.rate?.hitsPerUse || 0) };
        player.combat = { ...player.combat, perUse: totalUses > 0 ? dps / totalUses : player.combat.perUse, dps, dpsBeforeTarget: (player.combat?.dpsBeforeTarget || 0) + usesPerSecond * perUseBefore, fiveSecondAverageDps: (player.combat?.fiveSecondAverageDps || 0) + spiritHit.dps, twentySecondAverageDps: (player.combat?.twentySecondAverageDps || 0) + spiritHit.dps };
        player.modeled = true;
        player.notes = [...(player.notes || []), `Seething Spirit (hero trait audit B10, provisional): +${r4(usesPerSecond)} casts/s of ${player.name} (your use rate × ${spirit.speedFactor} × ${r4(spirit.presence * 100)}% presence × ${r4(rehan.rage.uptime * 100)}% Berserk uptime), ${r4(perUse)} per cast with the Berserk lines${spirit.additional.length ? ` and ${spirit.additional.map((line) => `${line.value}%`).join(", ")} additional` : ""} = ${r4(spiritHit.dps)} DPS; its hits count as applications of this skill's ailments.`];
      }
    }
    const burstHit = skillHits.find((hit) => hit.setupKey === BURST_SETUP_KEY) || null;
    if (burstHit) burstHit.ownAilmentScale = burstAilmentScale(rehan, { levels: rehanSources[0]?.setup?.addedLevels || 0 });
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
  // A follower Mark source (Forking Thunder's spear) is held by the follower's own hits (G10, 2026-11-12).
  const mark = settleMark(markState, [...skillHits, ...(nativeHitCycle ? [{ modeled: true, name: "Scorching Beam", crit: { chancePercent: beamCritical.criticalChancePercent } }] : [])], markState?.sources?.some((line) => line.origin === "follower") ? followerDamageSources(followerSelection(state)) : []);
  // The Mark on the dummy (buff 330, Marked 4010010) joins its unit buff set (W8 step 2; an entry only: its readers keep `mark`).
  if (mark?.active && lineConditionState.enemyBuffs?.add) lineConditionState.enemyBuffs.add({ name: "Mark", source: "Mark (src/mark-effect.js)", reason: mark.reason || null, stage: "debuff" });
  // A Combo skill's own Mark (Spectral Slash: Mark, buff 11340; src/skill-hit-model.js ownMark) joins the set as its own record: no Marked
  // state, no Mark tag, so the Mark readers never count it; its share is the time it is on the dummy.
  for (const hit of skillHits) if (hit.modeled && hit.ownMark && lineConditionState.enemyBuffs?.add) lineConditionState.enemyBuffs.add({ name: hit.ownMark.name, buff: hit.ownMark.buff, source: hit.name, reason: `+${hit.ownMark.percent}% additional damage taken from ${hit.name} (applied by its Combo Starter 1 hit, removed after the sequence's last Finisher)`, share: hit.ownMark.timeShare, stage: "debuff" });
  // The Mark's series for the tick engine (W8 step 3, src/tick-layers.js markLayer): its chance per crit from the crit source.
  { const critSource = mark?.sources?.find((item) => item.on === "crit"); if (critSource && lineConditionState.enemyBuffs?.setSeries) lineConditionState.enemyBuffs.setSeries("Mark", { kind: "chance", on: "crit", chancePercent: critSource.chancePercent, source: critSource.source ?? null }); }
  let illusion = lineEffects.hero?.illusion;
  const illusionHit = illusion ? skillHits.find((hit) => hit.modeled && hit.setupKey === resolvedMain?.setupKey) : null;
  // Hero trait audit B4 (src/youga-spacetime.js): the Illusion state settled with this pass's Main Skill cast rate and the
  // character's increased Cast Speed (Eeeendless Mana's rate, Make it Quick); the moon's and I'm Out of Mana's stacks keep the
  // measuring pass's rates (they are lines the hits already read).
  let yougaIllusionFacts = null;
  if (illusionHit) {
    const ownCastsPerSecond = Math.max(0, (illusionHit.rate.usesPerSecond || 0) - (illusionHit.rate.spellBurst?.extraUsesPerSecond || 0));
    const mainSetup = setups.find((setup) => setup.setupKey === illusionHit.setupKey);
    const characterSpeed = mainSetup ? scorchingBeamCastRate({ speedAdjust, lineSpeed: lineEffects.castSpeed, blessings, ceaselessTide: heroMemories.ceaselessTide, main: { ...mainSetup, supports: [] }, talentSlate, equipment: memoryEquipment, pact, aimCastSpeedPercent: aim.averageCastSpeedPercent }) : null;
    // A cooldown-bound skill's rate is no casting action (the Illusion's default limit, src/youga-spacetime.js illusionRate).
    yougaIllusionFacts = { playerCastsPerSecond: ownCastsPerSecond, castActionPerSecond: (illusionHit.rate.cooldownSeconds || 0) > 0 ? null : ownCastsPerSecond, castSpeedIncreasedPercent: characterSpeed?.increasedPercent ?? null, castsPerSecond: hitRateFacts?.youga?.castsPerSecond ?? null };
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
  // up to 8 stacks, lasts 3 s"). The recovery penalty is in the Terra Charge interval (src/selena-dance.js settleGash); the damage is
  // src/selena-dance.js gashDamageLine, on the Terra's hits and its own DoT (buff 35112 holds affix 145146720; user decision 2026-10-31).
  const mainGash = terraChargesFor(resolvedMain)?.gash;
  for (const line of modifierTexts.filter((item) => GASH_GAIN_TEXT.test(normalizeLineText(String(item.text)).trim()))) {
    const recovery = `Gash: ${GASH.recoveryPercent}% Terra Charge Recovery Speed per stack × ${mainGash?.stacks ?? 0} held (${GASH.durationSeconds} s each, up to ${GASH.maxStacks}) in the Terra Charge interval`;
    mechanics.recognized.set(normalizeLineText(String(line.text)).trim(), `${recovery}; its +${GASH.additionalPercent}% additional Terra Skill Damage per stack (multiplies) reaches Terra skills' hits and their own damage over time`);
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
  // Census batch 6 (src/minion-sentry-batch6.js): the summoner's stats and states the Minion support clauses and module lines read.
  const minionBatch6 = batch6MinionContext({ setups, activeNames, modifierTexts, stats: lineEffects.state?.stats || lineConditionState.stats || {}, blessings, darkGate: lineConditionState.darkGate,
    commandPoints: minionCommand?.points || 0, enemyAilments: enemyBuffSet(mechanics.enemyAilments)?.types() ?? mechanics.enemyAilments.types.map((type) => type.name), minionsOwned: Number(lineConditionState.minionCount) || 0,
    prebuilt: requestedConditions.prebuiltSelfBuffs !== false, wicked: batch6Build.wicked });
  // Indifference's Minion half (G4, 2026-11-12; research/build-10t-iris2-erosion-magus-audit-2026-11-12.md): record 759880384 writes attr 5719
  // mod 4 twice with the same clamp(0, (max - used Energy) ÷ 5, 50), the second on the Minion tag 5002060, so the Minions take "+1% additional
  // Minion Damage for every 5 remaining Energy, up to +50%" at the board's Energy left, the value the player half reads (src/core-talent-model.js;
  // no GetFloorInt: linear). Its raw line is then read, not "unread", in the Minion model.
  const indifferenceValue = coreTalents.lines.find((line) => line.source === "Indifference")?.value || 0;
  // Tidewell's Water Area (G9, 2026-11-12; research/build-10t-iris2-erosion-magus-audit-2026-11-12.md): "Spell Skills of the allies within the
  // Water Area have a +20% chance to deal Double Damage": your Minions are allies, so their Spell skills take the chance you hold (the
  // follower buff's time-averaged line), best case: the area sits on the dummy and the Minions stand in it (inferred position; open question
  // follower-tidewell-minion-allies).
  const tidewellMinionLines = modifierTexts.filter((line) => line.origin === "buff" && /Tidewell/.test(String(line.source || "")) && /^\+[\d.]+% chance for Spells to deal Double Damage$/i.test(String(line.text ?? "").trim()))
    .map((line) => ({ kind: "doubleDamage", skillTag: "Spell", value: Number(String(line.text).match(/[\d.]+/)[0]) * (line.multiplier ?? 1), source: line.source, text: `${String(line.text).trim()} (the Minions' Spell skills: allies inside the follower's Water Area, best case; provisional)` }));
  const indifferenceMinion = indifferenceValue ? { line: { kind: "additional", value: indifferenceValue, source: "Indifference core (its Minion half)", text: `+${indifferenceValue}% additional Minion Damage (+1% per 5 remaining Energy: ${Math.round(allocation.remaining * 100) / 100} left, up to +50%; game record 759880384, its write on the Minion tag)` }, texts: modifierTexts.filter((line) => /^(?:\[Indifference\]\s*)?\+1% additional damage and \+1% additional Minion Damage for every 5 remaining Energy/i.test(String(line.text ?? "").trim())).map((line) => line.text) } : null;
  // Your Frostbite Rating field, which Summon Frost Magus shares with its Magus (game affix 11905909; src/minion-frostbite.js): read only by a
  // Minion whose skills inflict Frostbite.
  const minionFrostbiteInput = minionFrostbiteRates ? { ownerField: ownerFrostbiteField(modifierTexts, { typeGroups: damageTypeGroups(lineConditionState.dealtDamageTypes || lineConditionState.dealtTypes) }) } : null;
  const computeMinion = ({ profile, sources }, { extraMinions = null, ...heroInput } = {}) => {
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
      // "Minions deal X% additional damage to Life" (one 1 + Σ term, research §16) needs damage reaching target Life, as the player's.
      targetLife: conditions.targetLife !== false,
      // The Marked dummy (src/mark-effect.js, settled above): its crit-damage-taken reaches the Minion hits' crit share (2026-10-14).
      extraCritOnly: [...(mark?.active && mark.critOnlyLine ? [mark.critOnlyLine] : []), ...(lineConditionState.sage?.ingredientRead?.["Razor Leaf"]?.active ? [{ source: "Razor Leaf (Basic Scent Bottle)", text: lineConditionState.sage.ingredientRead["Razor Leaf"].body, value: lineConditionState.sage.ingredientRead["Razor Leaf"].value }] : [])],
      // Conditional lines the shared resolver reads (src/line-effects.js) are not "unread" Minion lines (core audit B7).
      handledTexts: [...lineEffects.lines.map((line) => line.text), ...(indifferenceMinion?.texts || [])],
      extraLines: [...(aura.allyMinionLines?.damage || []), ...(indifferenceMinion ? [indifferenceMinion.line] : []), ...tidewellMinionLines, ...(commanderGambit?.lines || []), ...(blessings.minionLines || []), ...minionCritShareLines, ...(COMMAND_FAMILIES.includes(profile.family) ? minionCommand?.lines || [] : []), ...(isomorphicArms?.lines || []), ...(comradeship?.lines || [])], bond: minionBond, summonCastSpeed: minionSummonCast,
      // The resolved Scorch curse on the dummy (as for skill hits); derived debuff lines arrive through modifierTexts.
      // Selena: the enemy-on-Tide entry is a target attribute (5720), so Minion hits take it too (src/selena-tide.js takenLines).
      extraTaken: [...(conditions.scorch ? [{ source: "Scorch curse", text: `+${curses.scorchDamagePercent}% additional Fire Damage taken (Scorch on the dummy)`, value: curses.scorchDamagePercent, types: ["Fire"] }] : []), ...singWithTheTide.takenLines],
      heroTraits: minionHeroTraits(motoIris, { family: profile.family, setupKeys: minionSetups.map((setup) => setup.setupKey), mainSetupKey: resolvedMain?.setupKey ?? null, merging: mergingOrigins, ...heroInput }), batch6: minionBatch6, ...(extraMinions ? { extraMinions } : {}), ...(minionFrostbiteInput ? { frostbite: minionFrostbiteInput } : {}) });
  };
  const minionGroups = groupMinionSources(damageSources);
  const magusGroups = minionGroups.filter((group) => group.profile.family === "spirit-magus");
  const results = new Map();
  // Vigilant Breeze (Q-H13): without Happiest Reunion one Magus is Merged: the one whose merging gains the most (best case).
  const vigilantHeld = Boolean(motoIris?.vigilant?.held);
  const mergedOf = new Map();
  if (vigilantHeld && magusGroups.length > 1 && !motoIris.vigilant.allMerged) {
    const apart = magusGroups.map((group) => computeMinion(group, { merged: false, magiCount: magusGroups.length }));
    const together = magusGroups.map((group) => computeMinion(group, { merged: true, magiCount: magusGroups.length }));
    const gains = magusGroups.map((_, index) => (together[index]?.combat?.dps || 0) - (apart[index]?.combat?.dps || 0));
    const best = gains.indexOf(Math.max(...gains));
    magusGroups.forEach((group, index) => { mergedOf.set(group, index === best); results.set(group, index === best ? together[index] : apart[index]); });
  } else for (const group of magusGroups) { mergedOf.set(group, vigilantHeld); results.set(group, computeMinion(group, { merged: vigilantHeld, magiCount: magusGroups.length })); }
  // Extra Spirit Magi within the map cap (one per Magus skill + the "+N to Max Spirit Magi In Map" lines): Socialite's "+N Max Summonable
  // Spirit Magi" per Magus skill (B6, provisional) and a summon support's "+N to Max Summonable Minions for the supported skill"
  // (Elemental Duo, record 200000390: field 2006100 on the supported skill; G3 2026-11-12, the 10 T Iris panel's Max Summonable Minions
  // 2.0 and Max Omni Spirit Magus 3.0). The free map slots go to the Magi with the highest DPS per Magus; Happiest Reunion's "for every
  // Spirit Magus there is" then counts the Magi out, not the Magus skills.
  const socialite = motoIris?.growing;
  const socialiteWant = socialite?.summonable > 0 && socialite.mapCap > 0 ? socialite.summonable : 0;
  const mapSlots = (socialite?.mapCap || 0) + (motoIris?.vigilant?.mapCap || 0);
  const supportSummonable = (group) => {
    const found = group.sources.map((source) => setups.find((setup) => setup.setupKey === source.setupKey)).filter(Boolean).flatMap((setup) => (setup.supportEffects?.clauses || []).filter((clause) => clause.family === "minionCount" && clause.value > 0));
    return { count: found.length ? Math.max(...found.map((clause) => clause.value)) : 0, sources: [...new Set(found.map((clause) => clause.support))] };
  };
  const extraWants = magusGroups.map((group) => ({ group, socialite: socialiteWant, support: supportSummonable(group) })).filter((item) => item.socialite + item.support.count > 0);
  const magusExtras = new Map();
  if (mapSlots > 0 && extraWants.length) {
    let slots = Math.min(extraWants.reduce((total, item) => total + item.socialite + item.support.count, 0), mapSlots);
    const ranked = extraWants.filter((item) => results.get(item.group)?.modeled).sort((a, b) => (results.get(b.group).combat.perMinionDps || 0) - (results.get(a.group).combat.perMinionDps || 0));
    for (const item of ranked) {
      if (slots <= 0) break;
      const extra = Math.min(item.socialite + item.support.count, slots);
      slots -= extra;
      const fromSocialite = Math.min(item.socialite, extra);
      magusExtras.set(item.group, { socialite: fromSocialite, support: extra - fromSocialite, sources: item.support.sources });
    }
  }
  const magiOut = magusGroups.length + [...magusExtras.values()].reduce((total, item) => total + item.socialite + item.support, 0);
  for (const group of magusGroups) {
    const extra = magusExtras.get(group);
    if (!extra && (magiOut === magusGroups.length || !motoIris?.vigilant?.reunion)) continue;
    results.set(group, computeMinion(group, { merged: mergedOf.get(group), magiCount: magiOut, ...(extra?.socialite ? { extraCount: extra.socialite } : {}), ...(extra?.support ? { extraMinions: { count: extra.support, sources: extra.sources } } : {}) }));
  }
  const magiResults = magusGroups.map((group) => results.get(group)).filter((minion) => minion?.modeled && minion.magus);
  const magiFacts = magiResults.length ? { present: true, maxGrowth: Math.max(...magiResults.map((minion) => minion.magus.growth || 0)), maxEnhancedChance: Math.max(...magiResults.map((minion) => minion.magus.enhancedChancePercent || 0)) } : null;
  for (const group of minionGroups) if (!results.has(group)) results.set(group, computeMinion(group, { magi: magiFacts }));
  const minions = minionGroups.map((group) => results.get(group)).filter(Boolean);
  // Empower (Alchemist core; src/minion-cores.js): one Spirit Magus in the map, the strongest kept (best case).
  const spiritMagiLimit = applySpiritMagiLimit(minions, modifierTexts);
  // Moto / Iris (B6): the Minions' results settle the module badges (src/moto-iris-traits.js b6LineStatus).
  if (motoIris) {
    motoIris.minions = minions.map((minion) => ({ key: minion.minionKey, name: minion.name, family: minion.family, modeled: minion.modeled, dps: minion.combat?.dps || 0, count: minion.count, heroTraits: minion.heroTraits, magus: minion.magus, ...(minion.frostbite ? { frostbite: minion.frostbite } : {}) }));
    // The Minions' Frostbite on the dummy (src/minion-frostbite.js): Nature's Party's Frost badge reads whether it reached the dummy.
    if (minionFrostbite) motoIris.minionFrostbite = minionFrostbite;
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
    const uptime = maxAfflictionUptime({ afflictionPerSecond: Math.max(0, theoretical.townTooltip.passiveAfflictionPerSecond + skillDotAfflictionRate), removers: theoretical.combat.afflictionRemovers || [], clears: followerAfflictionClears });
    return { reductionPercent: all.reductionPercent, sources: all.sources, ...uptime };
  })();
  const maxAfflictionResistanceFor = (damageType) => {
    if (damageType === "Fire" && theoretical.combat?.maxAfflictionAllResistance?.fireResistanceFixed) return null;
    // Ill Will raises Fire / Cold / Lightning inside the capped sum, so a type at its cap keeps less (or none) of this flat reduction.
    if (!maxAfflictionResistanceInfo || !illWill || !["Fire", "Cold", "Lightning"].includes(damageType)) return maxAfflictionResistanceInfo;
    const reduction = maxAfflictionResistanceInfo.reductionPercent;
    const change = damageType === "Fire" ? ignitedResistance.dotFlatChange(reduction) : illWillResistance(illWill, damageType, illWillBase[damageType] + reduction) - illWillResistance(illWill, damageType, illWillBase[damageType]);
    return change === reduction ? maxAfflictionResistanceInfo : { ...maxAfflictionResistanceInfo, reductionPercent: change, illWill: true };
  };
  // Recipe interpreter step 2 (user-approved 2026-10-25; src/recipe-trauma-layers.js): the Trauma path places each modifier line from
  // its game recipe, the text readers only for the lines the recipe cannot place. TLI_TRAUMA_PATH=text (dev only) runs the old path.
  const traumaPlan = traumaPathMode() === "recipe" ? planTraumaRecipe(modifierTexts) : null;
  // The same for Wilt, skill DoTs and the damage-path Reaping (2026-10-25; src/recipe-dot-layers.js). TLI_WILT_PATH / TLI_DOT_PATH /
  // TLI_REAP_PATH=text (dev only) run the old readers.
  const wiltPlan = wiltPathMode() === "recipe" ? planWiltRecipe(modifierTexts) : null;
  const reapPlan = reapPathMode() === "recipe" ? planReapingRecipe(modifierTexts) : null;
  const sharedFor = (key, resistance) => buildAilmentSharedLayers({ theoretical, modifierTexts, conditions, combat: damageCombat, hasSealedLife, targetCursed, ailmentKey: key, targetResistancePercent: resistance, penetration: mechanics.penetration, maxAfflictionResistance: maxAfflictionResistanceFor(key === "ignite" ? "Fire" : key === "wilt" ? "Erosion" : "Physical"),
    ...(key === "wilt" && wiltPlan ? recipeSharedOptions(wiltPlan) : { rewriteLists: key === "trauma" && traumaPlan ? (lists) => rewriteTraumaShared(traumaPlan, lists) : null }) });
  // Cataclysm's "Affliction grants an additional X% effect to the supported skill" (game recipe 943784: attr 5724 additional on the
  // supported skill's tag) on that skill's own ailments (src/cataclysm-hit-ailments.js). Batch 1 (2026-10-27): the shared layers no longer
  // carry the main skill's Cataclysm (src/ailment-shared.js supportedAfflictionEffectFactor), so every applier takes its own: the beam's
  // generic Trauma / Wilt the ledger's (installed or item-granted), any other skill its own setup's (installed or granted).
  const withCataclysmEffect = (appliers, shared) => appliers.map((applier) => {
    if (applier.beam) {
      const factor = Number(shared?.supportedAfflictionEffectFactor) || 1;
      if (factor === 1) return applier;
      const line = shared.supportedAfflictionLines?.[0];
      return { ...applier, additionalAfflictionEffectFactor: factor, additionalAfflictionEffectSource: { source: line?.source || "Support: Cataclysm", text: `Affliction grants an additional ${Math.round((factor - 1) * 10000) / 100}% effect to the supported skill (its own ailments)`, value: (factor - 1) * 100 } };
    }
    const percent = cataclysmAilments.bySetupKey.get(applier.setupKey)?.additionalAfflictionEffectPercent || cataclysmEffectPercent(setups.find((setup) => setup.setupKey === applier.setupKey));
    if (!percent) return applier;
    return { ...applier, additionalAfflictionEffectFactor: 1 + percent / 100, additionalAfflictionEffectSource: { source: `Support: Cataclysm (${applier.name})`, text: `Affliction grants an additional ${percent}% effect to the supported skill (its own ailments)`, value: percent } };
  });
  const appliersFor = (key, shared) => withCataclysmEffect(ailmentAppliersFor({ ailmentKey: key, candidates: applierCandidates, modifierTexts, shared, overlyModified, channeledAilmentLine: singWithTheTide.channeledLine, mainSetupKey: resolvedMain?.setupKey ?? null, auraChancePercent: ailmentChanceFromAuras }), shared);
  // "Gains X% - Y% of the added Flat Damage's value as Base <Ailment> Damage" (game node 381; Evil Heart Armor, Confusion Elemental
  // Belt; legendary audit batch 6): the main skill's added flat damage per hit, after added damage effectiveness, summed over its
  // first strike's parts and the added-only parts riding on it (provisional reading of "the added Flat Damage's value"). The beam's
  // Ignite ledger reads the same lines (igniteBaseSettle above); a Scorching Beam Main Skill is its own hit, not the next skill's.
  const ailmentFlatAdded = (() => {
    if (resolvedMain?.name === "Scorching Beam" && activeNames.has("Scorching Beam")) return beamFlatAdded(beamAddedDamage);
    const hit =modeledSkillHits.find((item) => item.setupKey === resolvedMain?.setupKey) || modeledSkillHits[0];
    const parts = hit?.components || [];
    if (!parts.length) return null;
    const strike = parts[0].strikeKey;
    const own = parts.filter((part) => part.strikeKey === strike || String(part.key || "").startsWith("added:"));
    const range = own.reduce((total, part) => ({ min: total.min + (part.added?.min || 0), max: total.max + (part.added?.max || 0) }), { min: 0, max: 0 });
    return range.max > 0 ? range : null;
  })();
  // Dress Licker (Gemma – Flame of Pleasure, chunk 1, 2026-10-31): Physical Damage taken in Purgatory is taken as Fire, DoT ticks too: the
  // client's target-factor stage (0x141de6ca0) runs the taken conversion in every damage mode, the DoT tick's included. The share × the
  // Fire side (Fire Resistance after its penetration, its taken lines) replaces the Physical side, as src/skill-hit-model.js does on hits.
  const withTakenConversion = (shared) => {
    const conversion = lineEffects.hero?.takenConversion;
    if (!conversion || !(conversion.share > 0)) return shared;
    const fire = sharedFor("ignite", damageCombat.targetFireResistancePercent);
    const side = (layers) => (layers.additionalDamageTakenPercents || []).reduce((factor, value) => factor * (1 + value / 100), 1) * Math.max(0, 1 - ((layers.targetResistancePercent || 0) - (layers.penetrationPercent || 0)) / 100);
    const physical = side(shared);
    return physical > 0 ? { ...shared, takenConversionFactor: 1 - conversion.share + conversion.share * side(fire) / physical } : shared;
  };
  // "for each Critical Strike dealt recently" (Aeterna Martyr, src/ailment-model.js recentCritStacks) counts every crit event of yours: the
  // beam's (its casts × its chance) and each modeled skill's crit events (rate.critEventsPerSecond: every landing hit of a critting group
  // raises them, SS14 client R-b, research/oq-aeterna-stack-modes-2026-11-04.md; was the determinations before 2026-11-04). The beam's alone
  // left out Nether Grasp (bug B4, 2026-11-04; research/selena-trauma-gap-2026-11-04.md §7).
  const otherCritEventsPerSecond = modeledSkillHits.reduce((sum, hit) => sum + (hit.rate?.critEventsPerSecond ?? hit.rate?.hitsPerSecond ?? 0) * Math.max(0, Math.min(100, hit.crit?.chancePercent || 0)) / 100, 0);
  const ailmentCrit = otherCritEventsPerSecond > 0 ? { ...beamCritical, critsPerSecond: (beamCritical?.critsPerSecond || 0) + otherCritEventsPerSecond, beamCritsPerSecond: beamCritical?.critsPerSecond || 0, skillCritsPerSecond: otherCritEventsPerSecond } : beamCritical;
  const ailments = Object.fromEntries(Object.entries(ailmentTargets).map(([key, resistance]) => {
    const shared = key === "trauma" ? withTakenConversion(sharedFor(key, resistance)) : sharedFor(key, resistance);
    const recipePlan = key === "trauma" ? traumaPlan : key === "wilt" ? wiltPlan : null;
    const ailment = calculateAilment({
      ailmentKey: key, modifierTexts, shared, crit: ailmentCrit, appliers: appliersFor(key, shared), combat: damageCombat, flatAdded: ailmentFlatAdded,
      auraChancePercent: ailmentChanceFromAuras, auraDurationPercent: ailmentDurationFromAuras, enemyAilmentTypes, fieryFantasy: coreNames.has("Fiery Fantasy"),
      inputs: recipePlan ? traumaAilmentInputs(recipePlan) : null
    });
    return [key, recipePlan ? { ...ailment, recipe: traumaPlanSummary(recipePlan, shared.recipe) } : key === "trauma" || key === "wilt" ? { ...ailment, recipe: { mode: "text" } } : ailment];
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
  // "+X% Ignite Chance against enemies that haven't been Ignited" (record 2214789; 10 T Barrier Burst triage L1, 2026-11-18): off the beam path each
  // applier also carries its chance while the dummy is not Ignited (notActiveChancePercent); the beam keeps its ledger's own reading.
  const igniteAppliers = withCataclysmEffect(ailmentAppliersFor({ ailmentKey: "ignite", candidates: applierCandidates, modifierTexts, shared: igniteShared, overlyModified, channeledAilmentLine: singWithTheTide.channeledLine, mainSetupKey: resolvedMain?.setupKey ?? null, globalChanceSources: igniteGlobalChanceSources(theoretical), notActiveChanceSources: activeNames.has("Scorching Beam") ? [] : igniteNotIgnitedChanceSources(theoretical) }), igniteShared);
  const applies = (applier) => !applier.blocked && applier.applicationsPerSecond > 0 && (applier.chancePercent ?? 0) > 0;
  let igniteAttemptsPerSecond = beamCastRate.castsPerSecond;
  let igniteChanceForRecount = null;
  const extraIgniteAppliers = canIgnite ? igniteAppliers.filter((applier) => !applier.beam && applies(applier)) : [];
  if (extraIgniteAppliers.length) {
    const mainChance = theoretical.totals.applicationChancePercent;
    igniteAttemptsPerSecond += extraIgniteAppliers.reduce((sum, applier) => sum + applier.applicationsPerSecond * applier.chancePercent / mainChance, 0);
    // Each stream's own "Affliction grants an additional X% effect to the supported skill" (Cataclysm, game recipe 943784: the supported
    // skill only; batch 1 2026-10-27): the ledger carries the beam's; the other skills' shares of the attempts take their own instead,
    // as one combat factor Σ shareᵢ × Fᵢ ÷ F_beam with F(C) = 1 + rating × 1% × (1 + Affliction effect) × shared additional × C
    // (provisional: the shares are attempt shares at the beam's chance, as the fold itself).
    const supportedOnly = (line) => /^Support: Cataclysm\b/.test(line.source || "");
    const affliction = theoretical.ledger.filter((line) => line.category === "Additional Affliction effect");
    const sharedAdditional = affliction.filter((line) => !supportedOnly(line)).reduce((factor, line) => factor * (1 + line.value / 100), 1);
    const beamOwn = affliction.filter(supportedOnly).reduce((factor, line) => factor * (1 + line.value / 100), 1);
    const effectPercent = theoretical.ledger.filter((line) => line.category === "Affliction effect").reduce((sum, line) => sum + line.value, 0);
    const rating = conditions.affliction !== false ? Math.max(0, Math.min(100, Number(damageCombat.afflictionAverage) || 0)) : 0;
    const F = (own) => 1 + rating * AFFLICTION_DAMAGE_PER_POINT * (1 + effectPercent / 100) * sharedAdditional * own;
    const shares = [{ weight: beamCastRate.castsPerSecond, own: beamOwn }, ...extraIgniteAppliers.map((applier) => ({ weight: applier.applicationsPerSecond * applier.chancePercent / mainChance, own: Number(applier.additionalAfflictionEffectFactor) > 0 ? Number(applier.additionalAfflictionEffectFactor) : 1, name: applier.name }))];
    const total = shares.reduce((sum, item) => sum + item.weight, 0);
    const factor = total > 0 && rating > 0 ? shares.reduce((sum, item) => sum + item.weight * F(item.own), 0) / (total * F(beamOwn)) : 1;
    if (Math.abs(factor - 1) > 1e-12) igniteOwnAfflictionShare = [{ source: "Other skills' Ignite: own Cataclysm Affliction effect", text: `Other skills' shares of the Ignite Damage take their own Cataclysm additional Affliction effect, not the beam's (×${Math.round(factor * 1e6) / 1e6} at Affliction ${Math.round(rating * 100) / 100}; provisional)`, value: (factor - 1) * 100, condition: "Affliction on the dummy" }];
    // Bard's −20% sits in the ledger for the beam's Ignite; the shares of skills that are not Channeled do not take it (game affix 311410880).
    if (singWithTheTide.channeledLine) {
      const bard = 1 + singWithTheTide.channeledLine.value / 100;
      const channeledWeight = shares.reduce((sum, item) => sum + (!item.name || applierCandidates.some((candidate) => candidate.name === item.name && (candidate.tags || []).includes("Channeled")) ? item.weight : 0), 0);
      const bardFactor = total > 0 ? (channeledWeight * bard + (total - channeledWeight)) / (total * bard) : 1;
      if (Math.abs(bardFactor - 1) > 1e-12) igniteOwnAfflictionShare = [...igniteOwnAfflictionShare, { source: "Other skills' Ignite: no Bard penalty", text: `Other skills' shares of the Ignite Damage are not Channeled, so Bard's ${singWithTheTide.channeledLine.value}% leaves them (×${Math.round(bardFactor * 1e6) / 1e6})`, value: (bardFactor - 1) * 100, condition: "Bard state" }];
    }
    theoretical = compileFinal(igniteAttemptsPerSecond);
    if (afflictionRating) { afflictionRating = resolveAfflictionRating(theoretical); configured = configuredFor(); }
    igniteChanceForRecount = Math.min(100, mainChance * igniteAttemptsPerSecond / beamCastRate.castsPerSecond);
  }
  const igniteBaseLines = theoretical.ledger.filter((line) => line.category === "Base Ignite" && !line.beamSettle);
  const igniteBase = { min: igniteBaseLines.reduce((sum, line) => sum + (line.value || 0), 0), max: igniteBaseLines.reduce((sum, line) => sum + (line.max ?? line.value ?? 0), 0) };
  const igniteFlatBase = Boolean(ailmentFlatAdded) && collectAilmentTypedSources("ignite", modifierTexts).flatBase.length > 0;
  if (!canIgnite && (igniteBase.max > 0 || igniteFlatBase) && igniteAppliers.some((applier) => !applier.beam && applierAttempts(applier))) {
    ailments.ignite = { ...calculateAilment({
      ailmentKey: "ignite", modifierTexts, shared: igniteShared, crit: ailmentCrit, appliers: igniteAppliers.filter((applier) => !applier.beam), combat: damageCombat, flatAdded: ailmentFlatAdded,
      auraChancePercent: ailmentChanceFromAuras, auraDurationPercent: ailmentDurationFromAuras, enemyAilmentTypes, fieryFantasy: coreNames.has("Fiery Fantasy"),
      // The not-Ignited chance reaches the attempts that find the dummy Ignited by no one: in the steady figure, the share another unit (the
      // follower, your Minions) leaves it un-Ignited (`notActiveOthersShare`).
      overrides: { chance: combineAilmentChance(igniteGlobalChanceSources(theoretical)), base: igniteBase, durationSeconds: theoretical.totals.igniteDurationSeconds, stackLimit: igniteLimit, stacksPerApplication: 1 + theoretical.totals.additionalInflictedStacks, stacking: "strongest", skipTypedDamage: true, notActiveOthersShare: othersIgniteShare, notActiveMinionShare: othersIgnite.minionShare, notActiveFollowerSources: othersIgnite.followerSources },
      // The typed layers the Ignite ledger does not hold (crit-only, recent crits, crit-damage conversion, double damage, base from
      // flat) from the game recipes too (TLI_IGNITE_PATH; src/recipe-trauma-layers.js AILMENT_RECIPE.ignite).
      inputs: ignitePathMode() === "recipe" ? ailmentInputs(planAilmentRecipe(modifierTexts, "ignite")) : null
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
  // Each part carries its side (`target`: "enemy" a debuff on the dummy, "self" the attacker's own buff): the tick engine snapshots the attacker's
  // side at each DoT application (tick-ailment-snapshot, chunk 15 session 3) and reads the dummy's side every tick.
  const sided = (parts, target) => parts.map((part) => ({ ...part, target: part.target ?? target }));
  const timedParts = [...(lineEffects.combat?.timedEffects || []).filter((effect) => effect.active).flatMap((effect) => sided(effect.parts || [], effect.target ?? "enemy")), ...sided(windStalker?.timedParts || [], "self"), ...sided(yougaTimedParts, "self"), ...sided(empowerTimedParts(empowerEffects.entries, skillHits), "self")];
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
  const computeRecountVariation = () => guarded("Recount variation", () => simulateFiveSecondVariation({ delivery: beamDelivery, nativeCycle: nativeHitCycle, ignite: recountIgnite, reaping: theoretical.combat.reaping, criticalChancePercent: beamCritical.criticalChancePercent, criticalDamagePercent: beamCritical.criticalDamagePercent * beamCritOnlyFactor, seconds: recountWindowSeconds }));
  const recountVariation = skipVariation ? null : computeRecountVariation();
  // Damage paths for every modeled ailment plus independent Reaping sources.
  // The established Ignite path (with its own Reaping) is kept unchanged when no
  // other ailment is modeled.
  // Skill DoT sources (Wilting Beam): the skill's own damage over time, refreshed at the main-skill use rate.
  const targetResistanceFor = (type) => type === "Physical" ? 0 : type === "Fire" ? damageCombat.targetFireResistancePercent : type === "Erosion" ? (damageCombat.targetErosionResistancePercent ?? 30) : (damageCombat[`target${type}ResistancePercent`] ?? 30);
  // A DoT profile's recast cadence (below), shared with its Terra Charge line: a cast consumes the charges gained since the last
  // one, up to Max Terra Charge Stacks (src/selena-dance.js; 1 at the default max, so the line is unchanged then).
  // Activation Medium: Terra triggers the Main Terra Skill each time its charges refill to max (no use time; reference data).
  // Activation Medium: Wind Rhythm on a recast Terra DoT (Frost Terra): the Terra is recast at each trigger, every cooldown ÷
  // ((1 + CDR + share × Cast Speed) × additional Cast Speed) with the skill's own Cast Speed (src/selena-dance.js
  // windRhythmTerraTrigger; the creator's calc v0.3, user-provided 2026-10-13; provisional). Activation Medium: Terra switches it off.
  const dotCastRate = (source) => scorchingBeamCastRate({ speedAdjust, lineSpeed: lineEffects.castSpeed, blessings, ceaselessTide: heroMemories.ceaselessTide, main: source.setup, talentSlate, equipment: memoryEquipment, pact, aimCastSpeedPercent: aim.averageCastSpeedPercent });
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
      if (!windRhythmTerra.has(source.setupKey)) windRhythmTerra.set(source.setupKey, windRhythmTerraTrigger({ setup: source.setup, castRate: dotCastRate(source), modifierTexts, frameSnap: frameSnapTimers }));
      if (windRhythmTerra.get(source.setupKey)) return windRhythmTerra.get(source.setupKey);
    }
    if (!dotTriggers.has(source.setupKey)) {
      // A Terra's Split cooldown is its Terra Charge gain (no use cooldown); other DoT skills use their game Split cooldown.
      const cooldownSeconds = source.profile.recast ? 0 : Number(skillTimingSs13[source.setup?.name]?.cooldown) || 0;
      const trigger = activationMediumDotTrigger({ setup: source.setup, castRate: dotCastRate(source), cooldownLines: buildCooldownLines, cooldownSeconds, channeled: Boolean(source.profile.channeled), frameSnap: frameSnapTimers });
      dotTriggers.set(source.setupKey, trigger ? { ...trigger, text: `${source.setup.name}: triggered by ${trigger.medium} every ${Math.round(trigger.triggerIntervalSeconds * 10000) / 10000} s${trigger.castSpeedScaled ? " (Cast Speed share and Cooldown Recovery Speed applied; the creator's calc v0.3; provisional)" : ""}; uses per second = 1 / max(${Math.round(trigger.triggerIntervalSeconds * 10000) / 10000} s, cooldown ${Math.round(trigger.effectiveCooldownSeconds * 10000) / 10000} s) = ${Math.round(trigger.castsPerSecond * 10000) / 10000} (no use time; rate rule user-confirmed 2026-10-12 for Activation Medium: Boss; the trigger on a DoT skill is provisional). Triggered only, so the manual-use penalty does not apply.` } : null);
    }
    return dotTriggers.get(source.setupKey);
  };
  const dotCastsPerSecondOwn = (source) => activationMediumTerra.active && source.setupKey === resolvedMain?.setupKey && source.profile.recast ? 1 / activationMediumTerraInterval(terraChargesFor(source.setup)) : windRhythmFor(source) ? windRhythmFor(source).castsPerSecond : source.profile.refreshPerSecond ?? ((rate) => source.profile.recast ? source.profile.recast.perSecond(rate.baseRate > 0 ? rate.castsPerSecond / rate.baseRate : 1) : rate.castsPerSecond * 0.333 / (source.profile.castIntervalSeconds || 0.333))(dotCastRate(source));
  // A channeled DoT Main Skill (Wilting Beam) loses the other pressed skills' use time from its channel; a recast Terra Main Skill keeps its
  // recast while it fits the time left, else it is capped to that time (src/press-schedule.js, castOtherSkills; triggered recasts are free).
  const dotCastsPerSecond = (source) => {
    const own = dotCastsPerSecondOwn(source);
    if (!(mainPressShare < 1) || source.setupKey !== resolvedMain?.setupKey || source.profile.refreshPerSecond != null || windRhythmFor(source) || (activationMediumTerra.active && source.profile.recast)) return own;
    if (!source.profile.recast) return own * mainPressShare;
    const timing = skillTimingSs13[source.setup?.name] || skillTimingSs13[source.name];
    const rate = dotCastRate(source);
    const useTime = (Number(timing?.useTime) || 1) / (timing?.speedType === "cast-speed" && rate.baseRate > 0 ? rate.castsPerSecond / rate.baseRate : 1);
    return Math.min(own, mainPressShare / Math.max(1e-9, useTime));
  };
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
  // A skill DoT's shared layers, with its modifier lines placed from the game recipes (TLI_DOT_PATH; src/recipe-dot-layers.js).
  const skillDotPlans = new Map();
  const skillDotShared = (source) => {
    const plan = dotPathMode() === "recipe" ? planSkillDotRecipe(modifierTexts, source.profile) : null;
    const shared = buildAilmentSharedLayers({ theoretical, modifierTexts, conditions, combat: damageCombat, hasSealedLife, targetCursed, ailmentKey: "wilt", targetResistancePercent: targetResistanceFor(source.profile.damageType), damageType: source.profile.damageType, penetration: mechanics.penetration, maxAfflictionResistance: maxAfflictionResistanceFor(source.profile.damageType), ...recipeSharedOptions(plan) });
    skillDotPlans.set(source.setupKey, { plan, shared });
    return source.profile.damageType === "Physical" ? withTakenConversion(shared) : shared;
  };
  // Frost Terra: Cohesion / Winter's Bite (skill-mechanics census batch 2; src/terra-supports.js): settled on a recast Terra's DoT from
  // its recast interval and the Terra Charges a cast consumes.
  const terraSupportCache = new Map();
  const terraSupportsFor = (source) => {
    if (!source.profile?.recast) return { lines: [], dropsChargeLine: false, notes: [] };
    if (!terraSupportCache.has(source.setupKey)) {
      const interval = 1 / Math.max(1e-9, dotCastsPerSecond(source)), minimum = windRhythmFor(source) ? 0 : 1;
      const charges = terraChargesAtInterval(terraChargesFor(source.setup), interval, { minimum });
      terraSupportCache.set(source.setupKey, terraSupportEffects(source.setup, { intervalSeconds: interval, chargesConsumed: terraChargesConsumed(charges, interval, { minimum }), damageType: source.profile.damageType }));
    }
    return terraSupportCache.get(source.setupKey);
  };
  // Bard's −20% on a channeled skill's own DoT (game affix 311410880: attr 5719 on [Channeled, Bard]; src/selena-tide.js channeledLine, Sing with the Tide only).
  const bardDotLines = (source) => singWithTheTide.channeledLine && (source.profile?.tags || []).includes("Channeled") ? [singWithTheTide.channeledLine] : [];
  // Gash on a Terra's own DoT, at the stacks its recast cadence holds (src/selena-dance.js gashDamageLine).
  const gashDotLines = (source, interval, minimum = 1) => { if (!(source.profile?.tags || []).includes("Terra") || !(interval > 0)) return []; const line = gashDamageLine(terraChargesAtInterval(terraChargesFor(source.setup), interval, { minimum })); return line ? [line] : []; };
  // A DoT skill's own "+X% additional damage for this skill for every N Max Life, up to +C%" (Thornfield, game record 683267456, 2026-11-13;
  // src/skill-damage-profiles.js maxLifeAdditional): min(C, X × Max Life ÷ N), linear (node 119, no GetFloorInt), on the character's Max Life
  // (the stat sheet's pool, attribute 1001: the full pool, Sealed Life not taken off). One additional factor on the skill's damage.
  const maxLifeDotLines = (source) => {
    const rule = source.profile?.maxLifeAdditional;
    if (!rule) return [];
    const maxLife = Math.max(0, Number(lineConditionState.stats?.maxLife) || 0);
    const value = Math.min(rule.capPercent, rule.percent * maxLife / rule.perMaxLife);
    if (!(value > 0)) return [];
    const r4 = (number) => Math.round(number * 10000) / 10000;
    return [{ source: `${source.name}: Max Life`, text: `+${r4(value)}% additional damage for this skill (${rule.percent}% for every ${rule.perMaxLife} Max Life: ${r4(maxLife)} Max Life${value >= rule.capPercent ? `, capped at +${rule.capPercent}%` : ""}; game record ${rule.record}, node 119 on Max Life, linear)`, value, category: "Additional damage" }];
  };
  const skillDots = skillDotSources.map((source) => calculateSkillDot({
    setup: source.setup, profile: source.profile, modifierTexts,
    shared: skillDotShared(source),
    auraEntries: aura.entries.filter((entry) => activeNames.has(entry.name)),
    // A profile with its own cadence (a cooldown-bound area) uses it; a Terra recasts whenever a Terra Charge is available
    // (profile.recast, src/skill-damage-profiles.js; Cast Speed only for a cast-speed use time); a channel refreshes at
    // the channel rate. Channel profiles with a per-additional-max-stack line read the build's channel stacks
    // (src/build-mechanics.js follows the resolved main skill's supports, so other setups keep the base count).
    // The channel rate is the DoT setup's own (its Quick Decision), not the Scorching Beam setup's (B5).
    castsPerSecond: dotCastsPerSecond(source), firstApplicationSeconds: dotFirstApplication(source), crit: beamCritical, aim, triggered: Boolean(windRhythmFor(source)), lucky: lineEffects.combat?.lucky || null, dotTicksPerSecond: DOT_TICKS_PER_SECOND, skillEffectDurationPercent: lineConditionState.skillEffectDurationPercent || 0,
    extraAdditional: [...grantedSetupLines(source.setupKey).filter((line) => !line.increased), ...stabInTheBackLines(source.setupKey), ...bardDotLines(source), ...maxLifeDotLines(source), ...gashDotLines(source, 1 / Math.max(1e-9, dotCastsPerSecond(source)), windRhythmFor(source) ? 0 : 1), ...(windRhythmFor(source) || (tangles.setups || []).some((item) => item.setupKey === source.setupKey) ? (lineEffects.combat?.buffs?.triggeredSkillAdditional || []).filter((line) => !line.increased) : []), ...(source.profile.extraAdditional || []).map((line) => { if (!(source.profile.recast && /Terra Charge/.test(line.source || ""))) return line; if (terraSupportsFor(source).dropsChargeLine) return null; const interval = 1 / Math.max(1e-9, dotCastsPerSecond(source)), minimum = windRhythmFor(source) ? 0 : 1; const charges = terraChargesAtInterval(terraChargesFor(source.setup), interval, { minimum }); return terraChargeLine(line, charges, terraChargesConsumed(charges, interval, { minimum })); }).filter(Boolean), ...terraSupportsFor(source).lines, ...(source.profile.perAdditionalMaxStackAdditionalPercent && source.setupKey === resolvedMain?.setupKey && mechanics.channel.additionalMaxStacks > 0 ? [{ source: `${source.name}: additional Max Channeled Stacks`, text: `+${source.profile.perAdditionalMaxStackAdditionalPercent}% additional damage for every +1 additional Max Channeled Stack(s) (${mechanics.channel.additionalMaxStacks} additional; skill text)`, value: source.profile.perAdditionalMaxStackAdditionalPercent * mechanics.channel.additionalMaxStacks, category: "Additional damage" }] : [])]
  }));
  // Ground-effect DoTs of generic spell hits (src/skill-hit-profiles.js skillHitDotComponents): a status refreshed
  // while the dummy stands in the area (refresh rate from the profile), with the skill's Terra Charge line.
  skillDots.push(...skillHitDotSources.filter((source) => modeledSkillHits.some((hit) => hit.setupKey === source.setupKey)).map((source) => calculateSkillDot({
    setup: source.setup, profile: source.profile, modifierTexts,
    shared: skillDotShared(source),
    auraEntries: aura.entries.filter((entry) => activeNames.has(entry.name)),
    // A DoT laid by every use of a cast skill (Corrosive Shot's Corrosion Terra) is applied at the hit's own use rate.
    castsPerSecond: source.profile.refreshPerSecond ?? modeledSkillHits.find((hit) => hit.setupKey === source.setupKey)?.rate.usesPerSecond ?? 0, crit: beamCritical, aim, lucky: lineEffects.combat?.lucky || null, dotTicksPerSecond: DOT_TICKS_PER_SECOND, skillEffectDurationPercent: lineConditionState.skillEffectDurationPercent || 0, extraAdditional: [...grantedSetupLines(source.setupKey).filter((line) => !line.increased), ...stabInTheBackLines(source.setupKey), ...bardDotLines(source), ...gashDotLines(source, modeledSkillHits.find((hit) => hit.setupKey === source.setupKey)?.profile?.useModel?.durationSeconds || 6), ...(source.profile.extraAdditional || [])]
  })));
  // Ice Lances: Permafrost (Noble) (src/permafrost-terra.js; 2026-11-14, review §3 G3): the Lv. 20 Frost Terra its gate triggers on the
  // supported skill's hit, every 1.5 s at most (record 888393792), as a skill DoT of its own: stone 1551 (no support of the supported skill,
  // the build's lines by its tags), its 10 s area holding the 2 s status, +40% per Terra Charge consumed. A triggered cast: the Fervor line
  // "additional damage when the skill is triggered" and Overly Modified (an Active skill's cast) reach it, as on the triggered DoTs above.
  const permafrostBase = inferDamageProfile({ name: "Frost Terra" });
  // Its level: the record's Lv. 20 + the build's skill level lines for its tags (user decision 2026-11-16: a node-2320 cast, as an item's trigger).
  const permafrostLevels = permafrostTerra.carriers.length ? itemSkillLevel("Frost Terra", PERMAFROST_TERRA_LEVEL, null, permafrostBase?.tags || []) : null;
  if (!permafrostTerra.blocked && permafrostBase?.engine === "skill-dot") for (const carrier of permafrostTerra.carriers) {
    const trigger = permafrostTrigger(modeledSkillHits.find((hit) => hit.setupKey === carrier.setupKey), triggeredLevelLabel(permafrostLevels));
    if (!trigger) continue;
    const setup = permafrostTerraSetup(carrier, permafrostBase, permafrostLevels);
    const chargeLine = permafrostTerraChargeLine(terraChargesFor(setup), trigger.intervalSeconds);
    const source = { setupKey: setup.setupKey, name: setup.name, setup, profile: permafrostTerraProfile(permafrostBase, trigger, carrier, chargeLine) };
    const overly = overlyModified ? overlyModifiedLine(overlyModified, setup) : null;
    const dot = calculateSkillDot({
      setup, profile: source.profile, modifierTexts, shared: skillDotShared(source),
      auraEntries: aura.entries.filter((entry) => activeNames.has(entry.name)),
      castsPerSecond: trigger.castsPerSecond, firstApplicationSeconds: trigger.firstApplicationSeconds, crit: beamCritical, aim, triggered: true, lucky: lineEffects.combat?.lucky || null, dotTicksPerSecond: DOT_TICKS_PER_SECOND, skillEffectDurationPercent: lineConditionState.skillEffectDurationPercent || 0,
      extraAdditional: [...(chargeLine ? [chargeLine] : []), ...(overly ? [overly] : []), ...(lineEffects.combat?.buffs?.triggeredSkillAdditional || []).filter((line) => !line.increased)]
    });
    dot.triggeredBy = source.profile.triggeredBy;
    dot.notes?.push(trigger.text);
    skillDots.push(dot);
  }
  for (const dot of skillDots) { const wind = windRhythmTerra.get(dot.setupKey) || dotTriggers.get(dot.setupKey); if (wind) dot.notes?.push(wind.text); }
  for (const dot of skillDots) dot.notes?.push(...(terraSupportCache.get(dot.setupKey)?.notes || []));
  for (const dot of skillDots) { const item = skillDotPlans.get(dot.setupKey); dot.recipe = item?.plan ? dotPlanSummary(item.plan, item.shared) : { mode: "text" }; }
  for (const dot of skillDots) ailments[dot.key] = dot;
  // Ill Will on the loop (2026-11-12, user-approved): the windows and the recount start it at the follower's first Shackles of Malice hit,
  // each hit holding the crowd control types on the clean dummy then (the combat pass's schedules), for 4 s (src/follower-model.js
  // illWillTimedParts). Each part's percent comes from the sources' steady resistance factor by type and reach (DPS-weighted; the beam
  // and its Ignite read the Fire figures). The beam's steady-path openings above are taken before it (the engine's windows carry it).
  if (illWill) {
    const slots = {};
    const add = (type, reach, factor, weight) => { if (!type || !(factor > 0) || !(weight > 0)) return; const slot = ((slots[type] ||= {})[reach] ||= { sum: 0, weight: 0 }); slot.sum += 100 * factor * weight; slot.weight += weight; };
    for (const ailment of Object.values(ailments).filter((item) => item?.modeled)) add(ailment.damageType, "dot", ailment.steps?.resistanceFactor, ailment.combat?.steadyDps || 1);
    for (const hit of modeledSkillHits) for (const component of hit.components || []) add(component.type, "hit", component.resistanceFactor, (component.perUse || 0) * (hit.rate?.usesPerSecond || 1) || 1);
    if (activeNames.has("Scorching Beam")) add("Fire", "hit", beamFireResistanceFactor, 1);
    const nets = Object.fromEntries(Object.entries(slots).map(([type, reaches]) => [type, Object.fromEntries(Object.entries(reaches).map(([reach, slot]) => [reach, slot.sum / slot.weight]))]));
    if (canIgnite && !nets.Fire?.dot) (nets.Fire ||= {}).dot = 100 - (damageCombat.targetFireResistancePercent - (mechanics.penetration?.firePercent || 0));
    const schedules = Object.fromEntries(Object.entries(lineEffects.combat?.triggerHolds?.crowdControl || {}).map(([type, entry]) => [type, entry?.schedule || null]));
    const stats = { ...illWillBase, ...(fixedFireResistance == null ? { Fire: ignitedResistance.withoutRaise.dotPercent } : {}) };
    timedParts.push(...sided(illWillTimedParts(illWill, { stats, nets, schedules, levelAt: scheduleLevelAt }), "enemy"));
  }
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
  // Magmaskull's first infliction on the final Affliction state (src/initial-affliction.js): its badge, and the recount's opening when In calc.
  const initialAffliction = initialAfflictionAt(afflictionRating);
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
  const followerRecoveryExtra = blessingRecoverySources(equipment, blessings).map((line) => ({ source: line.source, text: line.text, value: line.value }));
  const followerReapingRecovery = (reapPlan ? recipeReapingModifiers(reapPlan, modifierTexts, followerRecoveryExtra) : collectReapingModifiers(modifierTexts, followerRecoveryExtra)).recovery.reduce((sum, line) => sum + line.value, 0);
  const followerReaps = followerReapSources(followerSelection(state), requestedConditions, { reapingRecoverySpeedPercent: followerReapingRecovery });
  builtInReaps.push(...followerReaps);
  // Follower Reaps that settle your DoT join the built-in Reaps (the same fact the damage paths use, hasReaping: gear, talent, pact and
  // other Reap lines, built-in Reaps, The Cycle I Resist).
  settleFollowerReaps(lineEffects.follower, followerReaps, followerReapingRecovery, lineEffects.combat?.timedEffects || []);
  const followerDamage = followerDamageSources(followerSelection(state), { resistanceFor: targetResistanceFor });
  if (lineEffects.follower) lineEffects.follower.damageSources = followerDamage;
  // The Cycle I Resist (Selena Dance of the Deep; src/selena-dance.js resolveCycleResist): a Reap on every Main Terra recast while
  // the previous Main Terra lasts. The recast interval is the Main Terra's own cadence: a DoT Terra's (Activation Medium: Terra's
  // trigger when granted), or a skill-hit Terra's use rate (recast on expiry, so nothing is left to Reap). The Terras last 6 s
  // (reference data, Frost Terra / Thornfield; a skill-hit Terra's useModel duration).
  const mainTerraDot = skillDots.find((dot) => dot.modeled && dot.setupKey === resolvedMain?.setupKey && (dot.profile?.tags || []).includes("Terra"));
  const mainTerraHit = modeledSkillHits.find((hit) => hit.setupKey === resolvedMain?.setupKey && (hit.profile?.tags || []).includes("Terra"));
  const mainTerraRate = mainTerraDot?.applicationsPerSecond || mainTerraHit?.rate?.usesPerSecond || 0;
  const terraDotKeys = skillDots.filter((dot) => dot.modeled && dot.setupKey === resolvedMain?.setupKey && (dot.profile?.tags || []).includes("Terra")).map((dot) => dot.key);
  const cycleResist = resolveCycleResist({ modifierTexts, mainIsTerra: Boolean(mainTerraDot || mainTerraHit), castIntervalSeconds: mainTerraRate > 0 ? 1 / mainTerraRate : 0, baseTerraSeconds: mainTerraHit?.profile?.useModel?.durationSeconds || 6, mainSupportClauses: resolvedMain?.supportEffects?.clauses || [], terraDotKeys });
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
  const triggerSkills = calculateVendettaTriggers({ sources: damageSources.filter((source) => source.status === "modeled" && source.profile.engine === "trigger-main"), setups, resolvedMain, skillHits: modeledSkillHits, weaponAttack, modifierTexts, erika: lineConditionState.erikaVendetta, hasHasten: Boolean((ownCombatHeld(playerBuffs) ?? lineEffects.combat?.buffs)?.hasHasten),
    // Bard Song (hero trait audit B13): the trigger skill's own cast becomes a Bard Song bubble in the Bard state.
    bardSong: singWithTheTide.bardSong?.heroEffects || null,
    // The trigger skill's own supports (9 T Double Thrusts audit G1 / G2): the hit model's support reader on the trigger setup (its
    // supports key, trait:Vendetta), as an attack-speed skill with the trigger profile's tags. Its use time also takes the Attack Speed lines
    // scoped to tags it carries (2026-11-13, the audit's follow-up): the Auras' Melee Attack Speed (Precise: Fearless, record 707968: attr 6001
    // mod 3 with no tag, so no restriction leaves Vendetta out) and the build's tag-scoped Attack Speed lines, as the Main Skill's hit reads them.
    setupSupports: (setup, spec) => {
      const tags = new Set(skillTagsWithSupportChanges(spec.tags, setup)), speedType = spec.timing?.speedType || "attack-speed";
      const own = supportLayers(setup, { dealtTypes: [], skillTags: tags, profile: spec, speedType });
      const auraSpeed = auraTagLines(aura.entries.filter((entry) => activeNames.has(entry.name)), tags, speedType).speed;
      const scoped = speedType === "attack-speed" ? scopedAttackSpeedFor(tags).lines.map((line) => ({ source: line.source, text: line.text, value: line.value, additional: line.additional })) : [];
      return { ...own, castSpeed: [...own.castSpeed, ...auraSpeed, ...scoped] };
    } });
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
  // The source key lets a timed part reach one skill's DoT only (`keys`: Thornfield: Sacrifice's stacks); parts without keys ignore it.
  const dotShare = (key) => ({ hit: false, types: ailments[key]?.damageType ? { [ailments[key].damageType]: 1 } : key === "ignite" ? { Fire: 1 } : {}, key });
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
  // Approaching Nightfall (src/approaching-nightfall.js) is run on the damage paths: an Ignite-only beam build carrying it takes them too, so its
  // Ignite and Reaps answer the affix as every other DoT does.
  const nightfallLine = approachingNightfall(modifierTexts);
  const damagePaths = (() => {
    if (!otherAilments.length && !modeledSkillHits.length && !modeledMinions.length && !modeledTriggers.length && !(nightfallLine && canIgnite)) return null;
    const igniteDps = (seconds) => seconds === 5 ? recountFiveSeconds?.igniteDps || 0 : seconds === 20 ? recountOpening?.igniteDps || 0 : theoretical.combat.expectedActiveIgnite?.expectedDps || 0;
    const ailmentDps = (ailment, seconds) => seconds === 5 ? ailment.combat.fiveSecondAverageDps : seconds === 20 ? ailment.combat.twentySecondAverageDps : ailment.combat.steadyDps;
    // What a Reap settles: the held stacks (no expiry-tick remainder, SS14 client 2026-11-03; src/ailment-model.js reapBasisDps).
    const reapBasisDps = (ailment, seconds) => ailment.combat.reapBasisDps?.[seconds === 5 || seconds === 20 ? seconds : 0] ?? ailmentDps(ailment, seconds);
    const typedReapPercent = (ailment) => ailment.sources.typed.reapingDuration.reduce((sum, line) => sum + line.value, 0);
    // Pooled over every inflicting skill (ailment-model.js combat.successesPerSecond).
    // A held store (one rank) counts the applications that land only: a strictly weaker one raises no success event (SS14 client, research/
    // oq-r1-r2-rea-2026-11-04.md R1.2; bug B1, 2026-11-04). combat.landedPerSecond / expectedActiveIgnite.landedPerSecond.
    const heldIgniteLanded = theoretical.combat.expectedActiveIgnite?.landedPerSecond;
    const igniteSuccessesPerSecond = !canIgnite ? 0 : Number.isFinite(heldIgniteLanded) ? heldIgniteLanded : theoretical.totals.applicationChancePercent / 100 * igniteAttemptsPerSecond;
    const landedOf = (ailment) => Number.isFinite(ailment?.combat?.landedPerSecond) ? ailment.combat.landedPerSecond : ailment?.combat?.successesPerSecond || 0;
    // "Reaps … when inflicting an Ailment" (trigger 1000150, event tag Ailment 5100001; wiring audit W2 gap 2, 2026-11-03): an ailment's
    // success only. A skill's own DoT is not one: its buff records carry DoT 5100309 and skill 5100310 but not 5100001, which Ignite 130,
    // Trauma 160 and Wilt 150 carry (config_char_buff; the link from the record's tags to the event is inferred, open question
    // reap-inflict-skill-dot).
    const successfulApplicationsPerSecond = Math.max(...otherAilments.filter((ailment) => !ailment.skillDot).map(landedOf), igniteSuccessesPerSecond);
    // "Inflicting Ignite" Reaps count Ignite successes only (a Trauma or Wilt success is not an Ignite); a generic Ignite
    // (another skill's, ailment-model.js) is one of otherAilments.
    const successesByAilment = { ignite: Math.max(igniteSuccessesPerSecond, ailments.ignite?.modeled && !canIgnite ? landedOf(ailments.ignite) : 0), trauma: ailments.trauma?.modeled ? landedOf(ailments.trauma) : 0, wilt: ailments.wilt?.modeled ? landedOf(ailments.wilt) : 0 };
    // Parity with the Ignite path (research/damage-path-switch-2026-10-12.md §6 stage 1):
    // (A) the per-Blessing-stack Reaping Recovery Speed (Feline Steps) the Ignite ledger counts;
    // (B) a full-Affliction Reap settles Ignite with the max-Affliction resistance reduction in full (every other DoT of a resisted
    //     type too, user decision 2026-10-21: its window figure ÷ the window's resistance scale × the full-reduction scale);
    // (C) Reaps settle the Ignite path's steady active Ignite (its basis in every window; the window-average basis is a
    //     separate, undecided change, §6 stage 3).
    const extraRecoverySources = blessingRecoverySources(equipment, blessings).map((line) => ({ source: line.source, text: line.text, value: line.value }));
    // "+X% Ignite Reaping Duration" (6008 with the Ignite tag) on the damage paths' Reaps of the beam's Ignite (the recipe reading; the
    // text path had none there).
    const igniteTypedReapPercent = reapPlan ? recipeReapingModifiers(reapPlan, modifierTexts).typedDuration.ignite.reduce((sum, line) => sum + line.value, 0) : 0;
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
    // Approaching Nightfall (revived memory affix, record 10140181; src/approaching-nightfall.js; 2026-11-12, 20 T Mind Control audit G5): every Reap
    // of yours settles its percent of what the DoTs still hold, then removes every DoT until its next application. A window's DoTs, Reaps and the
    // settlement are the steady cycle's (the tick engine runs the windows and the recount).
    const nightfall = nightfallLine;
    // Each DoT on the cycle: its applications and, per second, what one held application (a shared timer) or one stack (independent) deals. After a
    // removal a shared-timer ailment holds one fresh application, not the steady strongest one (×averageApplication over the steady held base); a
    // skill's DoT and the beam's Ignite keep their steady held figure.
    const nightfallDot = (dot) => {
      const steadyHeld = dot.reapDps ?? dot.dps;
      if (dot.key === "ignite" && canIgnite) return { applicationsPerSecond: igniteAttemptsPerSecond, chance: Math.min(100, theoretical.totals.applicationChancePercent ?? 100) / 100, notActiveChance: Math.min(100, theoretical.totals.notIgnitedApplicationChancePercent ?? theoretical.totals.applicationChancePercent ?? 100) / 100, durationSeconds: theoretical.totals.igniteDurationSeconds ?? 4, unitDps: steadyHeld };
      const ailment = ailments[dot.key];
      if (!ailment) return null;
      const timing = { applicationsPerSecond: ailment.applicationsPerSecond || 0, chance: ailment.skillDot ? 1 : Math.min(100, ailment.chancePercent ?? 100) / 100, durationSeconds: ailment.durationSeconds || 0 };
      if (ailment.skillDot) return { ...timing, unitDps: steadyHeld, skillDot: true, ...(ailment.profile?.linked ? { relink: true } : {}), ...(Number.isFinite(ailment.firstApplicationSeconds) ? { firstApplicationSeconds: ailment.firstApplicationSeconds } : {}) };
      const steadyBase = ailment.combat?.reapBasisDps?.[0] ?? ailment.combat?.steadyDps ?? 0, factor = ailment.combat?.factor ?? 0, average = ailment.combat?.averageApplication ?? 0;
      const limit = Math.max(1, Number(ailment.stackLimit) || 1), perApplication = Math.max(1, Number(ailment.stacksPerApplication) || 1);
      const independent = ailment.combat?.stacking === "independent";
      const one = average * factor * (independent ? 1 : Math.min(limit, perApplication));
      const unitDps = steadyBase > 0 && one > 0 ? steadyHeld * Math.min(1, one / steadyBase) : steadyHeld;
      return independent ? { ...timing, unitDps: steadyBase > 0 && one > 0 ? steadyHeld * one / steadyBase : steadyHeld / limit, independent: true, limit, stacksPerApplication: perApplication } : { ...timing, unitDps };
    };
    const withNightfall = (dots, reaping) => {
      // Nothing to answer without a Reap of yours, nothing to remove without a DoT.
      if (!reaping.sources.some((source) => !source.follower && source.reapsPerSecond > 0) || !dots.some((dot) => dot.dps > 0)) return { dots, reaping };
      const cycleDots = dots.filter((dot) => dot.dps > 0).map((dot) => ({ key: dot.key, reapDps: dot.reapDps ?? dot.dps, ...nightfallDot(dot) }));
      const cycle = nightfallSteadyCycle({ dots: cycleDots, sources: reaping.sources, percent: nightfall.percent, afflictionPerSecond: afflictionPerSecondTotal });
      // A DoT keeps its steady figure × what the cycle deals with the Reaps over what it deals without any, so the cycle's own DoT timing (one
      // timer or its stacks, whole frames) moves nothing on its own.
      const unreaped = nightfallSteadyCycle({ dots: cycleDots, sources: [], percent: 0, afflictionPerSecond: afflictionPerSecondTotal });
      const dealtRatio = (key) => unreaped.dots[key]?.dps > 0 ? cycle.dots[key].dps / unreaped.dots[key].dps : 1;
      const sources = reaping.sources.map((source, index) => ({ ...source, reapsPerSecond: cycle.sources[index].reapsPerSecond, reapingDps: cycle.sources[index].reapingDps, withoutNightfall: { reapsPerSecond: source.reapsPerSecond, reapingDps: source.reapingDps } }));
      const settle = { source: nightfall.source, text: nightfall.text, percent: nightfall.percent, dps: cycle.settleDps, removalsPerSecond: cycle.removalsPerSecond };
      return {
        dots: dots.map((dot) => cycle.dots[dot.key] ? { ...dot, dps: dot.dps * dealtRatio(dot.key), withoutNightfall: { dps: dot.dps }, heldShare: cycle.dots[dot.key].heldShare } : dot),
        reaping: { ...reaping, sources, nightfall: settle, reapingDps: sources.reduce((sum, source) => sum + source.reapingDps, 0) + settle.dps }
      };
    };
    const window = (seconds) => {
      // The channel ramp scales the beam and every DoT; a timed DoT layer (Windwalk) scales DoTs and their Reaps only,
      // never beam or skill hits. The recount window figures (beam, Ignite) already carry the channel ramp.
      const channelRamp = coldStartRamp(seconds);
      const dotRamp = channelRamp * timedDotWindowFactor(seconds);
      // Timed effects: the window's time average of each source's factor (1 when sustained or without one).
      const timedDot = (key) => timedWindowFactor(timedParts, dotShare(key), seconds);
      const igniteReapDps = steadyReapedIgnite * dotRamp * timedWindowFactor(timedParts, igniteShare, seconds);
      const baseDots = [...otherAilments.map((ailment) => ({ key: ailment.key, name: ailment.name, dps: ailmentDps(ailment, seconds) * dotRamp * timedDot(ailment.key), reapDps: reapBasisDps(ailment, seconds) * dotRamp * timedDot(ailment.key), fullAfflictionDps: reapBasisDps(ailment, seconds) * dotRamp * timedDot(ailment.key) * ailment.fullAfflictionScale * (ailment.fullAfflictionResistanceScale ?? 1) / (ailment.maxAfflictionWindowScale?.[seconds] || 1), typedDurationPercent: typedReapPercent(ailment) })),
        ...(canIgnite ? [{ key: "ignite", name: "Ignite", dps: igniteDps(seconds) * timedDotWindowFactor(seconds), reapDps: igniteReapDps, fullAfflictionDps: igniteReapDps * (theoretical.combat.fullAfflictionScale || 1) * (theoretical.combat.fullAfflictionResistanceScale || 1), typedDurationPercent: igniteTypedReapPercent }] : [])]
        .map((dot) => ({ ...dot, skillDot: Boolean(ailments[dot.key]?.skillDot), trueDamageScale: reapTrueDamage.scale }));
      // Scorching Pulse's stacks build from 0 on the clean start (src/follower-model.js scorchingPulseStacks): the 5 s / 20 s windows
      // read the window averages for your Reaping Duration line and the follower's own Reap; the sustained figure the steady count.
      const reapWindow = seconds === 5 || seconds === 20;
      const windowModifierTexts = reapWindow && modifierTexts.some((line) => line.followerReapWindow) ? modifierTexts.map((line) => line.followerReapWindow ? { ...line, text: `+${Math.round(line.followerReapWindow.percent[seconds] * 10000) / 10000}% Reaping Duration` } : line) : modifierTexts;
      const windowReaps = reapWindow ? builtInReaps.map((reap) => Number.isFinite(reap.ownDurationWindows?.[seconds]) ? { ...reap, ownDurationPercent: reap.ownDurationWindows[seconds] } : reap) : builtInReaps;
      // The Reaps' Reaping Duration / Recovery Speed lines and their line-granted sources come from the recipes (src/recipe-dot-layers.js;
      // TLI_REAP_PATH=text: a modeled Trauma's recipe lines only, as before).
      const recipeReaping = reapPlan ? recipeReapingModifiers(reapPlan, windowModifierTexts, extraRecoverySources) : traumaPlan && ailments.trauma?.modeled ? traumaReapingModifiers(traumaPlan, windowModifierTexts, extraRecoverySources) : null;
      const baseReaping = calculateMultiSourceReaping({ modifierTexts: windowModifierTexts, dots: baseDots, extraSources: windowReaps, extraRecoverySources, successfulApplicationsPerSecond, successesByAilment, afflictionPerSecond: afflictionPerSecondTotal, damagingAilmentTypes: baseDots.filter((dot) => dot.dps > 0 && !dot.skillDot).length, sourceDotScale: canIgnite ? applicationTiming(seconds) : null, modifiers: recipeReaping });
      // Approaching Nightfall (src/approaching-nightfall.js): each Reap of yours settles a share of the remaining DoT and removes every DoT until its
      // next application; the window's DoTs and Reaps are the steady cycle's.
      const { dots, reaping } = nightfall ? withNightfall(baseDots, baseReaping) : { dots: baseDots, reaping: baseReaping };
      // Sustained: the beam as delivered (src/scorching-beam-delivery.js sustainedBeamDps), as the windows and the recount deal it.
      const beamDps = seconds === 5 ? recountFiveSeconds?.beamDps || 0 : seconds === 20 ? recountOpening?.beamDps || 0 : sustainedBeamDps(beamDelivery, nativeHitCycle) * channelRamp;
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
  const computeDummyRecount = () => guarded("Dummy recount timeline", () => {
    const inputs = collectDummyRecountInputs({
      delivery: beamDelivery, nativeCycle: nativeHitCycle,
      // Other skills' Ignite successes fold into the beam's per-use chance (success-equivalent, ailment-applications.js).
      ignite: canIgnite ? pooledIgnite(theoretical.combat.expectedActiveIgnite) : null, igniteReaping: theoretical.combat.reaping,
      igniteFullAfflictionScale: theoretical.combat.fullAfflictionScale, igniteAfflictionRating: conditions.affliction ? damageCombat.afflictionAverage : 0, igniteAfflictionPerPoint: theoretical.combat.afflictionPerPoint,
      // Hit ailments need a hitting main skill (applications > 0); skill DoTs carry their own rate, and one that lands with its skill's hits
      // starts at that skill's first use.
      ailments: damagePaths ? otherAilments.filter((ailment) => ailment.applicationsPerSecond > 0).map((ailment) => { const hit = ailment.skillDot ? modeledSkillHits.find((item) => item.setupKey === ailment.setupKey && Math.abs(item.rate.usesPerSecond / ailment.applicationsPerSecond - 1) < 1e-9) : null; return hit ? { ...ailment, firstUseSeconds: hit.rate.firstUseSeconds } : ailment; }) : [], multiReaping: damagePaths ? damagePaths.twentySeconds.reaping : null, channel: mechanics.channel,
      castsPerSecond: mainUsesPerSecond, afflictionPerSecond: afflictionPerSecondTotal,
      // Magmaskull's first infliction (src/initial-affliction.js): the engine and the continuous recount start the rating at it.
      initialAffliction: initialAffliction?.status === "In calc" ? initialAffliction : null,
      // The follower's Affliction clears (Pain Amplification): the engine and the continuous recount take them off the rating.
      afflictionClears: followerAfflictionClears,
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
      // The tick engine (src/tick-recount.js, chunk 15) runs the Reaps on whole 1/30 s frames on the final pass; this timeline is continuous.
      options: { afflictionModel: afflictionRating ? "simulated" : "configured" }
    });
    if (!inputs) return null;
    if (illOmen?.main.factor > 0) inputs.illOmen = { factor: illOmen.main.factor, label: "Ill Omen" };
    // Approaching Nightfall (src/approaching-nightfall.js): the tick engine settles and removes the DoTs on each Reap of yours (src/tick-engine.js
    // nightfallOnReap). The continuous recount (src/dummy-recount.js) does not read it.
    if (damagePaths?.sustained?.reaping?.nightfall && nightfallLine) inputs.nightfall = { percent: nightfallLine.percent, label: "Approaching Nightfall", source: nightfallLine.source };
    if (spacetime?.turbulence && damagePaths) {
      inputs.turbulence = { label: "Spacetime Turbulence", intervalSeconds: spacetime.intervalSeconds, recordPercent: spacetime.recordPercent, bonusPercent: spacetime.bonusPercent, speedUpPercent: spacetime.speedUp?.perSecondPercent || 0, speedUpMaxStacks: spacetime.speedUp?.maxStacks || 0, turbulenceSeconds: spacetime.turbulenceSeconds };
      inputs.assumptions.push({ id: "spacetimeTurbulence", value: Math.round(spacetime.sustainedShare * 10000) / 10000, text: `Spacetime Turbulence (Youga – Spacetime Elapse; Q-H6, provisional): Twisted Spacetime is recast every ${spacetime.intervalSeconds} s while DoT ticks and never ends; each move re-deals ${Math.round(spacetime.sustainedShare * 10000) / 100}% (steady) of the DoT and Reaping damage dealt since the last move to the dummy, the only enemy within, at once.` });
    }
    if (afflictionRating && conditions.affliction) inputs.assumptions.push({ id: "afflictionRating", value: Math.round(afflictionRating.rating * 1000) / 1000, text: `Dummy Affliction (automatic): ${afflictionRating.text} Windows build it from 0 on a clean dummy.` });
    for (const item of pact.levelAssumptions || []) inputs.assumptions.push({ id: `pactLevel:${item.spirit}`, value: item.level, text: item.text });
    // Provisional line readings of talent batch chunk 1 (Q13): per-level lines and "additional damage for Weapons".
    inputs.assumptions.push(...provisionalLineReadings);
    for (const choice of grantedAuraChoices) inputs.assumptions.push({ id: `grantedAura:${choice.name}`, value: choice.kept, text: choice.text });
    if (auraAllies.derived && safetyInNumbersActive) inputs.assumptions.push({ id: "safetyInNumbersAllies", value: auraAllies.count, text: `Precise: Safety in Numbers counts your Minions as allies affected by the Aura: ${auraAllies.minionsOut} Minion${auraAllies.minionsOut === 1 ? "" : "s"} out, all inside the Aura (best case), ${auraAllies.count} counted (up to 7; user decision 2026-11-12). The Config allies value is not used while Minions are out.` });
    if (modeledSkillHits.some((hit) => hit.rate?.speedType === "attack-speed")) for (const line of weaponAttack.additional.filter((item) => item.provisional)) inputs.assumptions.push({ id: `weaponsDamage:${line.source}`, value: line.value, text: `${line.source}: "${line.text}" applied to every Weapon Attack Damage hit (provisional, talent batch Q13).` });
    for (const minion of modeledMinions) inputs.assumptions.push(...minion.assumptions);
    if (inputs.hits && nativeHitCycle?.beams > 1) inputs.assumptions.push({ id: "beams", value: nativeHitCycle.beams, text: `${nativeHitCycle.beams} Beams hit the dummy, beam ticks and explosions alike: the first at 100%, each further one keeping 30% (×${Math.round(nativeHitCycle.shotgunFactor * 1000) / 1000}; skill text "beams and explosions can hit the same enemy", "Shotgun Effect falloff coefficient 70%", the share lost by the client's repeat multiplier, user decision 2026-11-05).` });
    if (fullLife.active && fullLife.lines.length) inputs.assumptions.push({ id: "fullLife", value: true, text: `Full Life assumed on the dummy (it does not attack; Energy Shield absorbs stray damage): ${fullLife.lines.map((line) => `${line.source}: ${line.text}`).join("; ")}` });
    else if (fullLife.sealedOut && fullLife.lines.length) inputs.assumptions.push({ id: "fullLife", value: false, text: `Not at Full Life: Sealed Life leaves ${Math.round(fullLife.lifeRemainingPercent * 100) / 100}% of Max Life unsealed, under the 95% Full Life needs (user-confirmed 2026-10-12), so these lines are off: ${fullLife.lines.map((line) => `${line.source}: ${line.text}`).join("; ")}` });
    // `inputs` is read only, for src/tick-ledger.js: the tick engine compiles its ailments from the values resolved here. No figure reads it.
    return { ...calculateDummyRecount(inputs), inputs };
  });
  const dummyRecount = skipVariation ? null : computeDummyRecount();
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
  warnings.push("Support estimates use the reference data's multiplicative additional-damage rule and SS13 tooltip effects. Isolated town-sheet states for Guard, Refracted Prism, and some Ignite effects remain unresolved; see the support validation report.");
  warnings.push(...theoretical.warnings);
  warnings.push(...shadowWarnings);
  const shadowWarningsEnd = warnings.length;
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
    // Other active skills pressed on the dummy (src/press-schedule.js, castOtherSkills): each one classified from this pass's models, and
    // how the Main Skill uses your time (a beam or DoT channel, a cast skill, a cooldown- or Terra-bound one, or not cast by you). Computed first
    // (the Spell Burst refill below reads the pressed skills), set on the facts where it always was.
    const pressInputs = (() => {
      const mainKey = resolvedMain?.setupKey ?? null;
      const mainHit = skillHits.find((hit) => hit.modeled && hit.setupKey === mainKey);
      const mainDot = (skillDots || []).find((dot) => dot.setupKey === mainKey);
      const mainDotSource = skillDotSources.find((source) => source.setupKey === mainKey);
      const model = String(mainHit?.rate?.useModel || "");
      const main = !mainKey ? null
        : resolvedMain.name === "Scorching Beam" && activeNames.has("Scorching Beam") ? { kind: "beam", timeBound: true }
        // A Tangle Skill Main Skill (Spell Tangle, Banishment: Tangle) is cast by its Tangles at their casting interval, not by your presses.
        : (tangles.setups || []).some((item) => item.setupKey === mainKey) ? { kind: "free", reason: "cast by its Tangles" }
        : mainHit ? (mainHit.rate?.trigger || /^trigger rate/.test(model) || !(mainHit.rate?.fullManualUsesPerSecond > 0) ? { kind: "free", reason: mainHit.rate?.trigger ? `triggered by ${mainHit.rate.trigger.source}` : "its casts come from a trigger, not your presses" } : { kind: "hit", timeBound: !/^(terra|sentry)/.test(model) })
        : mainDot && mainDotSource ? (windRhythmFor(mainDotSource) || (activationMediumTerra.active && mainDotSource.profile.recast) ? { kind: "free", reason: "recast by its Activation Medium" } : { kind: "dot", timeBound: !mainDotSource.profile.recast })
        : { kind: "free", reason: "it has no modeled casts of yours" };
      return { main, ...collectPressInputs({ setups, activeNames, mainKey, skillHits, empowerEntries: empowerEffects?.entries || [], aim, elixirSetups: lineEffects.combat?.elixirs?.setups || [], periodicBurst: periodicBurst?.entries || [],
        mobilityNeeds: mobilityWindowInputs.needs, pureHeart, mobilityItemTriggers, tangleKeys: new Set((tangles.setups || []).map((item) => item.setupKey)), ownTimeKeys: new Set((triggerSkills || []).map((item) => item.setupKey ?? item.key).filter(Boolean)), skillDots: skillDots || [], inactiveReasons: new Map(damageSources.filter((source) => source.status === "inactive" && source.setupKey).map((source) => [source.setupKey, source.reason || "inactive"])),
        // A buff skill whose buff nothing reads (the skill badge's rule, src/skill-coverage.js idleBuffReason) is not pressed.
        idleBuff: (name) => idleBuffReason({ activation: { activeNames, setups }, skillHits, skillDots, minions, ailments, theoretical, mechanics, mark, aim, igniteAppliers, empowerEffects }, name), modifierTexts, castSpeedFactor: beamCastRate.baseRate > 0 ? beamCastRate.castsPerSecond / beamCastRate.baseRate / (beamCastRate.pressShare || 1) : 1 }) };
    })();
    // The skill DoTs a trigger casts (Wind Rhythm on a Terra, the Activation Medium triggers, Activation Medium: Terra, a support's triggered
    // Terra such as Ice Lances: Permafrost's): none is a use of yours.
    const triggeredDotKeys = () => new Set([...[...windRhythmTerra].filter(([, value]) => value).map(([key]) => key), ...[...dotTriggers].filter(([, value]) => value).map(([key]) => key), ...(activationMediumTerra.active && resolvedMain?.setupKey ? [resolvedMain.setupKey] : []), ...(skillDots || []).filter((dot) => dot.triggeredBy).map((dot) => dot.setupKey)]);
    // Every skill's uses of yours (trigger 1000074 with no tag: presses, Multistrike repeats, Spell Burst automatic casts, each Combo step, each
    // channel loop step): the modeled hits (a Focus skill's strikes are 1000060), the beam's casts, a DoT-only skill's applications unless a
    // trigger casts it (a channel's applications are its loop steps), and a pressed skill with no modeled hit (Thunder Spike under Extreme
    // Coldness) at its press interval (src/press-schedule.js). Triggered uses never raise it. Read by "Consumes X% of current Life on skill use"
    // (record 539780864; 2026-11-11 build audit G2) and the Spell Burst refill (record 32278; 15 T Chain Lightning audit G1).
    const playerSkillUses = (triggeredKeys, pressSkills) => {
      const skillUses = [];
      for (const hit of skillHits) {
        if (!hit.modeled || !hit.setupKey) continue;
        const tags = setups.find((setup) => setup.setupKey === hit.setupKey)?.tags || hit.profile?.tags || [];
        if (tags.includes("Focus")) continue;
        const source = hit.rate?.usesBySource;
        const usesPerSecond = source ? (Number(source.manual) || 0) + (Number(source.multistrikeRepeat) || 0) + (Number(source.spellBurstAuto) || 0) : Number(hit.rate?.pressedUsesPerSecond ?? hit.rate?.playerUsesPerSecond) || 0;
        const steps = hit.rate?.useModel === "combo cycle" ? Math.max(1, (hit.profile?.cycle?.steps?.length || 1) - 1 + (Number(hit.combo?.finishersPerCycle) || 1)) : 1;
        skillUses.push({ setupKey: hit.setupKey, name: hit.name, usesPerSecond, stepsPerUse: steps, attack: tags.includes("Attack"), from: steps > 1 ? `player uses × ${steps} Combo steps` : "player uses" });
      }
      const usedKeys = new Set(skillUses.map((use) => use.setupKey));
      const beamUseSetup = activeNames.has("Scorching Beam") ? setups.find((setup) => setup.name === "Scorching Beam") : null;
      if (beamUseSetup && !usedKeys.has(beamUseSetup.setupKey) && beamCastRate.castsPerSecond > 0) { skillUses.push({ setupKey: beamUseSetup.setupKey, name: beamUseSetup.name, usesPerSecond: beamCastRate.castsPerSecond, stepsPerUse: 1, attack: false, from: "beam casts" }); usedKeys.add(beamUseSetup.setupKey); }
      for (const dot of skillDots || []) if (dot.modeled && dot.setupKey && !usedKeys.has(dot.setupKey) && !triggeredKeys.has(dot.setupKey) && dot.applicationsPerSecond > 0) { skillUses.push({ setupKey: dot.setupKey, name: dot.name, usesPerSecond: dot.applicationsPerSecond, stepsPerUse: 1, attack: false, from: "DoT applications" }); usedKeys.add(dot.setupKey); }
      for (const item of pressSkills || []) if (item.kind === "pressed" && item.intervalSeconds > 0 && !usedKeys.has(item.key)) { const tags = setups.find((setup) => setup.setupKey === item.key)?.tags || []; skillUses.push({ setupKey: item.key, name: item.name, usesPerSecond: 1 / item.intervalSeconds, stepsPerUse: 1, attack: tags.includes("Attack"), from: `pressed every ${Math.round(item.intervalSeconds * 10000) / 10000} s` }); usedKeys.add(item.key); }
      return skillUses;
    };
    // Spell Burst Charge gained on your uses (src/spell-burst-refill.js; 15 T Chain Lightning audit G1, 2026-11-18): the uses above (each
    // Combo step a use) are the streams the refill lines roll on, and every Spell-Bursting hit is computed again with them (and the extra
    // inputs it was last computed with) before any fact reads the hits, so its Spell Burst activations (the Focus gain on consuming Spell
    // Burst, Activation Medium: Spell Burst), hits, crits and Lightning hits are the refilled ones; the second pass reads the same streams.
    let playerUseStreams = null;
    if (spellBurstRefillRates) {
      playerUseStreams = playerSkillUses(triggeredDotKeys(), pressInputs?.skills || []).filter((use) => use.usesPerSecond > 0).map((use) => ({ setupKey: use.setupKey, name: use.name, usesPerSecond: use.usesPerSecond * (use.stepsPerUse || 1), from: use.from }));
      skillHits = skillHits.map((hit, index) => hit?.modeled && hit.rate?.spellBurst && allHitSources[index] ? computeSkillHit(allHitSources[index], { ...(lastHitExtra.get(allHitSources[index]) || {}), spellBurstUseStreams: playerUseStreams }) : hit);
    }
    const rates = new Map(lineConditionState.chanceParalysis.map((item) => {
      const hit = skillHits.find((entry) => entry.setupKey === item.setupKey && entry.modeled);
      // Trigger 1000030 (Grudge): the setup's hits and its own DoT's damage events, one per server tick while it ticks (its uptime), from its first
      // application (8 T Thornfield audit G4, 2026-11-13).
      const dot = (skillDots || []).find((entry) => entry.setupKey === item.setupKey && entry.modeled && entry.applicationsPerSecond > 0);
      const dotTicksPerSecond = dot ? DOT_TICKS_PER_SECOND * Math.min(1, Number(dot.combat?.uptime ?? 1)) : 0;
      const dotFirst = dot ? dot.firstApplicationSeconds ?? 1 / dot.applicationsPerSecond : null;
      const hitFirst = hit ? hit.rate.firstUseSeconds ?? null : null;
      const firsts = [hitFirst, dotFirst].filter(Number.isFinite);
      // The fissure (Groundshaker) lands once per use that consumes a Demolisher Charge: uses/s × that share.
      return [item.setupKey, { hitsPerSecond: (hit ? hit.rate.hitsPerSecond || 0 : 0) + dotTicksPerSecond, dotTicksPerSecond, fissureHitsPerSecond: hit ? (hit.rate.usesPerSecond || 0) * (hit.rate.demolisherShare || 0) : 0, firstHitSeconds: firsts.length ? Math.min(...firsts) : null }];
    }));
    // Tremble's crit buff (crit hits per second, Lightning hits) and Activation Medium: Multistrike (the build's Max Multistrike
    // Count events per second over every modeled multistriking hit).
    const bySetup = new Map(skillHits.filter((hit) => hit.modeled).map((hit) => [hit.setupKey, {
      // Crit events: every landing hit event × the crit share (SS14 client R-b, 2026-11-04; determinations × chance before).
      critHitsPerSecond: (hit.rate.critEventsPerSecond ?? hit.rate.hitsPerSecond ?? 0) * Math.max(0, Math.min(100, hit.crit?.chancePercent || 0)) / 100,
      dealsLightning: (hitDealtTypes(hit) || (hit.components || []).map((component) => component.type)).includes("Lightning"),
      // The damage types the hit really deals (its parts with damage after conversion, weapon / added Elemental damage, Trinity and
      // "-100% … Physical Damage"), for every reader of "deals Hit <Type> Damage" on the second pass (2026-11-05; null: no part with damage).
      dealtTypes: hitDealtTypes(hit),
      scopeTypes: hitDealtTypes(hit, { chain: true }),
      // What the press rotation reads (pressRotation): the use model, the player's presses, the use time, the cooldown and the Charge cadence.
      press: { model: hit.rate?.useModel, triggered: Boolean(hit.rate?.trigger), manualUsesPerSecond: hit.rate?.fullManualUsesPerSecond ?? hit.rate?.usesBySource?.manual ?? 0, useTimeSeconds: hit.rate?.effectiveUseTimeSeconds ?? null, cooldownSeconds: hit.rate?.effectiveCooldownSeconds ?? 0, demolisherEverySeconds: hit.rate?.demolisherEverySeconds ?? null, dps: hit.combat?.dps ?? 0 },
      // Rumbling Thunder (census batch 2): the setup's uses per second (one True Body hit per use).
      usesPerSecond: hit.rate?.usesPerSecond || 0,
      // Census batch 4 (src/support-conditional-batch4.js): the setup's hits per second (Icebound Beam: Frostbitten's debuff stacks).
      hitsPerSecond: hit.rate?.hitsPerSecond || 0,
      // Psychic Surge (census item #2): the setup's Spell Burst activations per second.
      spellBurstActivationsPerSecond: hit.rate?.spellBurst?.activationsPerSecond || 0
    }]));
    // A skill that can never fire (src/skill-hit-model.js inactiveReason: a weapon restriction the held weapon fails, a trigger whose ailment
    // the build never inflicts) is measured: every rate 0, so a reader of its hits or crits (Tremble's Numbed Effect, the crit-hit buffs of
    // src/support-effects.js, src/support-buff-effects.js) reads 0 instead of holding it as "not measured yet" (15 T Chain Lightning audit G3,
    // 2026-11-18: Thunder Spike on a Wand). It deals nothing, so it deals no type.
    for (const hit of skillHits) {
      if (hit.modeled || !hit.inactiveReason || !hit.setupKey || bySetup.has(hit.setupKey)) continue;
      bySetup.set(hit.setupKey, { inactive: hit.inactiveReason, critHitsPerSecond: 0, dealsLightning: false, dealtTypes: null, scopeTypes: null,
        press: { model: hit.rate?.useModel, triggered: false, manualUsesPerSecond: 0, useTimeSeconds: null, cooldownSeconds: 0, demolisherEverySeconds: null, dps: 0 },
        usesPerSecond: 0, hitsPerSecond: 0, spellBurstActivationsPerSecond: 0 });
    }
    const facts = { bySetup, multistrikeEventsPerSecond: skillHits.filter((hit) => hit.modeled).reduce((sum, hit) => sum + (hit.rate?.multistrike?.maxCountEventsPerSecond || 0), 0) };
    facts.pressInputs = pressInputs;
    // The uses of yours the Spell Burst refill rolls on (src/spell-burst-refill.js), for the second pass (only on a build with a refill line).
    if (playerUseStreams) facts.playerUseStreams = playerUseStreams;
    // Census items #8 / #12 (src/activation-medium-events.js): each setup's Activation Medium event rates and Spell Burst activations.
    if (amEventRates) {
      const beamSetup = activeNames.has("Scorching Beam") ? setups.find((setup) => setup.name === "Scorching Beam") : null;
      facts.amEvents = amEventFacts({ setups, activeNames, skillHits, beam: beamSetup ? { setupKey: beamSetup.setupKey, castsPerSecond: beamCastRate.castsPerSecond || 0, critChancePercent: beamCritical?.criticalChancePercent || 0 } : null,
        cooldownFor: (setup) => { const profile = inferDamageProfile(setup); return (profile ? skillHitTiming(profile)?.cooldownSeconds : null) ?? 0; },
        maxSpellBurst: maxSpellBurstTotal(modifierTexts) });
    }
    // Juggernaut (B4): the player's crit hits per second (the beam's and every modeled skill hit's; Minion crits are not counted).
    // Open Wounds (B4): the Trauma model's steady stacks, stack rate, duration and limit.
    {
      const beamHits = activeNames.has("Scorching Beam") ? beamCastRate.castsPerSecond || 0 : 0;
      facts.critHitsPerSecond = beamHits * Math.max(0, Math.min(100, beamCritical?.criticalChancePercent || 0)) / 100 + [...bySetup.values()].reduce((sum, item) => sum + item.critHitsPerSecond, 0);
      // Empower buffs (src/empower-buffs.js): every hit per second on the dummy (Burst of Anger's Elite refreshes, item chance triggers).
      facts.hitsPerSecond = beamHits + skillHits.filter((hit) => hit.modeled).reduce((sum, hit) => sum + (hit.rate?.hitsPerSecond || 0), 0);
      // Crowd control by chance (src/combat-states.js, 2026-11-03): your hits per second (trigger 1000033) and the triggered uses
      // per second (trigger 1000060, inferred: a use not cast by you, and a Tangle Skill's casts not cast by Spell Burst).
      if (ccChanceRates) {
        const tangleKeys = new Set((tangles.setups || []).map((item) => item.setupKey));
        const modeled = skillHits.filter((hit) => hit.modeled);
        const firsts = modeled.map((hit) => hit.rate?.firstUseSeconds).filter(Number.isFinite);
        // Your DoT's damage events (trigger 1000030; wiring audit W2 gap 4, 2026-11-03): each of your ticking DoTs (a modeled skill DoT,
        // the beam's Ignite, an ailment you inflict) raises one per server tick (src/trigger-rows.js DOT_TICKS_PER_SECOND; provisional,
        // open question dot-damage-trigger-events). The first one lands with the DoT's first application.
        const ownDots = [...(skillDots || []).filter((dot) => dot.modeled && dot.applicationsPerSecond > 0).map((dot) => dot.firstApplicationSeconds ?? 1 / dot.applicationsPerSecond),
          ...(canIgnite ? [null] : []), ...Object.values(ailments || {}).filter((ailment) => ailment?.modeled && !ailment.skillDot && ailment.combat?.successesPerSecond > 0).map(() => null)];
        const dotFirsts = ownDots.filter(Number.isFinite);
        facts.ccEvents = { hitsPerSecond: facts.hitsPerSecond, firstHitSeconds: firsts.length ? Math.min(...firsts) : null,
          dotTicksPerSecond: ownDots.length * DOT_TICKS_PER_SECOND, firstDamageSeconds: [...firsts, ...dotFirsts].length ? Math.min(...firsts, ...dotFirsts) : null,
          // A cast of a tagged skill (1000069): every modeled hit's uses, the beam's casts and a DoT-only skill's casts, one per application
          // (wiring audit W2 gap 7, 2026-11-03: Wilting Beam's 3.0 casts/s were missing).
          usesBySkill: (() => {
            const out = modeled.reduce((map, hit) => { map[hit.name] = (map[hit.name] || 0) + (hit.rate?.usesPerSecond || 0); return map; }, {});
            const hitKeys = new Set(modeled.map((hit) => hit.setupKey));
            if (activeNames.has("Scorching Beam")) out["Scorching Beam"] = (out["Scorching Beam"] || 0) + (beamCastRate.castsPerSecond || 0);
            for (const dot of (skillDots || []).filter((item) => item.modeled && !hitKeys.has(item.setupKey) && item.applicationsPerSecond > 0)) { const name = setups.find((setup) => setup.setupKey === dot.setupKey)?.name || dot.name; out[name] = (out[name] || 0) + dot.applicationsPerSecond; }
            return out;
          })(),
          triggeredUsesPerSecond: modeled.reduce((sum, hit) => { const uses = hit.rate?.usesPerSecond || 0; return sum + (tangleKeys.has(hit.setupKey) ? uses * (1 - (hit.rate?.spellBurst?.share || 0)) : triggeredUsesOf(hit)); }, 0) };
      }
      // Minion hits per second (src/minion-ailment-types.js; crowd control on Minion damage, trigger 1000047): each Minion type's skills
      // in its cycle, × the Minions out; its Lightning hits (a Minion Numbed chance) apart.
      if (minionAilmentRates || ccChanceRates) facts.minionHits = (minions || []).filter((minion) => minion.modeled !== false).map((minion) => { const hits = (filter) => (minion.skills || []).filter((skill) => skill.inCycle !== false && filter(skill)).reduce((sum, skill) => sum + (Number(skill.steadyUsesPerSecond) || 0) * (Number(skill.hitsPerUse) || 0), 0) * (Number(minion.count) || 1); return { name: minion.name, hitsPerSecond: hits(() => true), lightningHitsPerSecond: hits((skill) => skill.type === "Lightning") }; });
      if (ccChanceRates && facts.ccEvents) facts.ccEvents.minionHitsPerSecond = (facts.minionHits || []).reduce((sum, item) => sum + item.hitsPerSecond, 0);
      // The Minions' Frostbite (src/minion-frostbite.js, G5): each inflicting Minion's landings, rating and hold over its cycle.
      if (minionFrostbiteRates) facts.minionFrostbite = (minions || []).filter((minion) => minion.modeled !== false && minion.frostbite).map((minion) => ({ key: minion.minionKey, name: minion.name, ...minion.frostbite }));
      // The Minions' first hit (1000047 crowd control starts there in the 5 s / 20 s windows; wiring audit W2 gap 7, 2026-11-03: read in
      // src/combat-states.js and never written, so it started at t = 0).
      if (ccChanceRates && facts.ccEvents) { const minionFirsts = (minions || []).filter((minion) => minion.modeled !== false).map((minion) => minion.cycle?.firstHitSeconds).filter(Number.isFinite); facts.ccEvents.minionFirstHitSeconds = minionFirsts.length ? Math.min(...minionFirsts) : null; }
      // Per setup (wiring audit W6a item 1, 2026-11-03): a support clause's "this skill" crowd control counts its own setup's events only:
      // the setup's hits (the beam's casts), its DoT's damage events (one per server tick while it ticks), its triggered uses and the
      // hits of the Minions it summons (src/combat-states.js holdRows).
      if (ccChanceRates && facts.ccEvents && lineConditionState.supportCrowdControl?.length) {
        const bySetup = {};
        const entry = (key) => (bySetup[key] ??= { hitsPerSecond: 0, firstHitSeconds: null, dotTicksPerSecond: 0, firstDamageSeconds: null, triggeredUsesPerSecond: 0, minionHitsPerSecond: 0, minionFirstHitSeconds: null });
        const earliest = (a, b) => (Number.isFinite(a) ? (Number.isFinite(b) ? Math.min(a, b) : a) : Number.isFinite(b) ? b : null);
        const tangleKeys = new Set((tangles.setups || []).map((item) => item.setupKey));
        for (const hit of skillHits.filter((item) => item.modeled && item.setupKey)) {
          const own = entry(hit.setupKey), uses = hit.rate?.usesPerSecond || 0;
          own.hitsPerSecond += hit.rate?.hitsPerSecond || 0;
          own.firstHitSeconds = earliest(own.firstHitSeconds, hit.rate?.firstUseSeconds);
          own.triggeredUsesPerSecond += tangleKeys.has(hit.setupKey) ? uses * (1 - (hit.rate?.spellBurst?.share || 0)) : triggeredUsesOf(hit);
        }
        if (activeNames.has("Scorching Beam")) for (const setup of setups.filter((item) => item.name === "Scorching Beam")) { const own = entry(setup.setupKey); own.hitsPerSecond += beamCastRate.castsPerSecond || 0; own.firstHitSeconds = earliest(own.firstHitSeconds, 0); }
        for (const dot of (skillDots || []).filter((item) => item.modeled && item.setupKey && item.applicationsPerSecond > 0)) { const own = entry(dot.setupKey); own.dotTicksPerSecond += DOT_TICKS_PER_SECOND; own.firstDamageSeconds = earliest(own.firstDamageSeconds, dot.firstApplicationSeconds ?? 1 / dot.applicationsPerSecond); }
        for (const minion of (minions || []).filter((item) => item.modeled !== false)) {
          const hits = (minion.skills || []).filter((skill) => skill.inCycle !== false).reduce((sum, skill) => sum + (Number(skill.steadyUsesPerSecond) || 0) * (Number(skill.hitsPerUse) || 0), 0) * (Number(minion.count) || 1);
          for (const key of minion.setupKeys || []) { const own = entry(key); own.minionHitsPerSecond += hits; own.minionFirstHitSeconds = earliest(own.minionFirstHitSeconds, minion.cycle?.firstHitSeconds); }
        }
        for (const own of Object.values(bySetup)) own.firstDamageSeconds = earliest(own.firstDamageSeconds, own.firstHitSeconds);
        facts.ccEvents.bySetup = bySetup;
      }
      // Condition-unread batch 3 (src/line-conditions.js): Double Damage hits per second (each modeled skill hit's hits × its Double
      // Damage chance) and each skill's uses per second (by name; "per recent hit with Thunder Focus").
      facts.doubleDamageHitsPerSecond = skillHits.filter((hit) => hit.modeled).reduce((sum, hit) => sum + (hit.rate?.hitsPerSecond || 0) * (hit.doubleDamageChancePercent || 0) / 100, 0);
      facts.usesBySkill = skillHits.filter((hit) => hit.modeled).reduce((map, hit) => { map[hit.name] = (map[hit.name] || 0) + (hit.rate?.usesPerSecond || 0); return map; }, {});
      // Uses by source (wiring audit W2 gap 5, 2026-11-03): the Main Skill's triggered uses (1000060 with the Main Skill tag: Activation
      // Medium, item and outside triggers, the hero's Main Skill triggers) and the tags of the skills you use yourself (1000074 "if you have
      // used a <tag> Skill recently": a skill with player uses, the beam, a DoT-only skill no trigger casts).
      {
        const mainHit = skillHits.find((hit) => hit.modeled && hit.setupKey === resolvedMain?.setupKey) || null;
        const mainTriggers = triggerSkills.filter((trigger) => trigger.modeled && trigger.main?.setupKey === resolvedMain?.setupKey).reduce((sum, trigger) => sum + (trigger.rate?.triggersPerSecond || 0), 0);
        facts.mainTriggeredUsesPerSecond = (mainHit?.rate?.usesBySource?.triggered || 0) + mainTriggers;
        // Every Main Skill use, your own and triggered (1000074 and 1000060 on the Main tag; Burning Touch, record 648060544): the hit's
        // measured uses (a Spacetime Illusion's casts raise both on you too: 0x142417e30, 15 T audit G4) and the triggers. A channel's 1000074
        // comes per paid loop step, not per use (src/trigger-bus.js), so a channelled Main Skill keeps the early rate (null).
        facts.mainCastsPerSecond = mainHit && !/^channel \(/.test(String(mainHit.rate?.useModel || "")) ? (mainHit.rate?.usesPerSecond || 0) + mainTriggers : null;
        const hitKeys = new Set(skillHits.filter((hit) => hit.modeled).map((hit) => hit.setupKey));
        const dotTriggered = new Set([...[...windRhythmTerra].filter(([, value]) => value).map(([key]) => key), ...[...dotTriggers].filter(([, value]) => value).map(([key]) => key), ...(activationMediumTerra.active && resolvedMain?.setupKey ? [resolvedMain.setupKey] : []), ...(skillDots || []).filter((dot) => dot.triggeredBy).map((dot) => dot.setupKey)]);
        const used = [...skillHits.filter((hit) => hit.modeled && (hit.rate?.playerUsesPerSecond || 0) > 0).map((hit) => hit.setupKey), ...(activeNames.has("Scorching Beam") ? setups.filter((setup) => setup.name === "Scorching Beam").map((setup) => setup.setupKey) : []),
          ...(skillDots || []).filter((dot) => dot.modeled && dot.applicationsPerSecond > 0 && !hitKeys.has(dot.setupKey) && !dotTriggered.has(dot.setupKey)).map((dot) => dot.setupKey)];
        facts.playerUseTags = [...new Set(used.flatMap((key) => setups.find((setup) => setup.setupKey === key)?.tags || []))];
      }
      // Census batch 4 (Shadow Swamp: Overlapping Waves, "hit by Shadow Shot recently"): each skill's hits per second, by name.
      facts.hitsBySkill = skillHits.filter((hit) => hit.modeled).reduce((map, hit) => { map[hit.name] = (map[hit.name] || 0) + (hit.rate?.hitsPerSecond || 0); return map; }, {});
      facts.meleeManualUsesPerSecond = skillHits.filter((hit) => hit.modeled && hit.rate?.usesBySource && (setups.find((setup) => setup.setupKey === hit.setupKey)?.tags || []).includes("Melee")).reduce((total, hit) => total + (hit.rate.usesBySource.manual || 0) + ownMultistrikeRepeats(hit), 0);
      facts.manualUsesBySetup = Object.fromEntries(skillHits.filter((hit) => hit.modeled && hit.setupKey && hit.rate?.usesBySource).map((hit) => [hit.setupKey, (hit.rate.usesBySource.manual || 0) + ownMultistrikeRepeats(hit)]));
      const trauma = ailments?.trauma;
      if (trauma?.modeled) facts.trauma = { steadyActiveStacks: trauma.combat?.steadyActiveStacks ?? 0, stackRate: (Number.isFinite(trauma.combat?.landedPerSecond) ? trauma.combat.landedPerSecond : trauma.combat?.successesPerSecond || 0) * (trauma.stacksPerApplication || 1), durationSeconds: trauma.durationSeconds, stackLimit: trauma.stackLimit };
      // Chaos Abyss (legendary audit batch 3): the Wilt model's steady stacks on the dummy.
      const wilt = ailments?.wilt;
      if (wilt?.modeled) facts.wilt = { steadyActiveStacks: wilt.combat?.steadyActiveStacks ?? null, stackLimit: wilt.stackLimit ?? null, stackRate: wilt.combat?.stackRate ?? null };
    }
    // Gemma – Ice-Fire Fusion: Fusion Energy per second from the active Fire / Cold skills (modeled skill hits' uses, the beam's casts,
    // modeled skill DoTs' applications): one per Fire or Cold tag on each use (688680704 rows 3 to 6, keyword 600: both tags add 2).
    if (frostfireCasts) {
      const fireCold = (setupKey) => fusionEnergyPerUse(setups.find((setup) => setup.setupKey === setupKey)?.tags);
      const hitKeys = new Set();
      let casts = activeNames.has("Scorching Beam") ? beamCastRate.castsPerSecond || 0 : 0;
      for (const hit of skillHits.filter((item) => item.modeled && fireCold(item.setupKey))) { hitKeys.add(hit.setupKey); casts += (hit.rate?.usesPerSecond || 0) * fireCold(hit.setupKey); }
      for (const dot of (skillDots || []).filter((item) => item.modeled && !hitKeys.has(item.setupKey) && fireCold(item.setupKey))) casts += (dot.applicationsPerSecond || 0) * fireCold(dot.setupKey);
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
      const mainCrit = mainHit ? hitCritChances(mainHit) : null;
      const vendetta = triggerSkills.find((trigger) => trigger.setupKey && /^trait:/.test(trigger.setupKey)) || triggerSkills[0] || null;
      // Feline Fury's rolls read Vendetta's own crit (G2; src/vendetta-model.js vendettaCritChances), the Main Skill's as before for the rest.
      const crit = vendetta?.modeled && vendetta.erika?.crit ? vendetta.erika.crit : mainCrit;
      facts.erika = {
        mainCritChancePercent: mainCrit ? mainCrit.effective : 0,
        // Wild Lightning (296792512: node 114 from attr 41 Σ increased, re-read at every read) on the combat Movement Speed: the held
        // conditional lines this pass added after the line resolver (conditionalMovementSpeed), which Feline Figure reads before it.
        ...(lineConditionState.felineFigure?.active ? { movementSpeedConditionalPercent: lineConditionState.movementSpeedConditional?.percent || 0 } : {}),
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
    // Thornfield: Sacrifice: every Reap of yours (trigger 1000032), the sources' Reaps per second.
    if (sacrificeRates) {
      const reapSources = damagePaths?.sustained?.reaping?.sources || theoretical.combat.reaping?.sources || [];
      facts.reapsPerSecond = reapSources.reduce((sum, source) => sum + (source.reapsPerSecond || 0), 0);
    }
    // Carino (hero trait audit B9): every modeled Projectile skill's uses per second (one ammo per cast, Q-H8), measured without the
    // ammo factor (this pass applies none).
    // Rehan (hero trait audit B10): the uses per second the Rage cycle reads (Melee Attack casts and channel stacks, every skill use
    // and hitting use, Ranged and Attack uses with their crits, the Main Skill's uses), Burst's crit chance and the Attack Speed bonus
    // they were measured at (the Rage share of it is corrected per phase).
    if (rehanRates) {
      const beamCasts = activeNames.has("Scorching Beam") ? beamCastRate.castsPerSecond || 0 : 0;
      const rehan = { meleeCasts: 0, channelStacks: 0, skillUses: beamCasts, rangedUses: 0, attackUses: 0, attackCritUses: 0, hitUses: beamCasts, mainUses: 0, attackSteps: 0, mainStepsPerUse: 1, mainIsAttack: false };
      for (const hit of skillHits.filter((item) => item.modeled && item.setupKey !== BURST_SETUP_KEY)) {
        const tags = new Set(setups.find((setup) => setup.setupKey === hit.setupKey)?.tags || hit.profile?.tags || []);
        const uses = hit.rate?.usesPerSecond || 0, kind = hit.profile?.useModel?.kind;
        rehan.skillUses += uses; rehan.hitUses += uses;
        // Each Combo step is its own skill instance (its own Split): a Combo cycle is (steps − 1 + Finishers) Melee casts and Attack uses
        // (2026-11-08 build audit gaps 4 and 5).
        const steps = hit.rate?.useModel === "combo cycle" ? Math.max(1, (hit.profile?.cycle?.steps?.length || 1) - 1 + (Number(hit.combo?.finishersPerCycle) || 1)) : 1;
        if (tags.has("Melee") && tags.has("Attack")) {
          if (kind === "channel") rehan.channelStacks += uses;
          else { rehan.meleeCasts += uses * steps; if (kind === "channel-release") rehan.channelStacks += uses * (hit.channel?.maxStacks || 0); }
        }
        if (tags.has("Attack") && !tags.has("Focus")) rehan.attackSteps += uses * steps;
        if (hit.setupKey === resolvedMain?.setupKey) { rehan.mainStepsPerUse = steps; rehan.mainIsAttack = tags.has("Attack"); }
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
    // Game records 408551264, 581621760: both open on trigger 1000074 alone, a player's use (triggered uses are 1000060; chunk 1 note).
    if (rosaRates) {
      const rosa = { attackUses: 0, elementalByType: { Fire: 0, Cold: 0, Lightning: 0 } };
      for (const hit of skillHits.filter((item) => item.modeled)) {
        const tags = new Set(setups.find((setup) => setup.setupKey === hit.setupKey)?.tags || hit.profile?.tags || []);
        const kind = hit.profile?.useModel?.kind;
        if (!tags.has("Attack") || tags.has("Channeled") || kind === "channel" || kind === "channel-release") continue;
        rosa.attackUses += Number.isFinite(hit.rate?.playerUsesPerSecond) ? hit.rate.playerUsesPerSecond : hit.rate?.usesPerSecond || 0;
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
        main: mainHit ? { name: mainHit.name, usesPerSecond: mainHit.rate?.usesPerSecond || 0, canSpellBurst: !mainHit.rate?.overloadBurstBlock && Boolean(mainHit.modeled), spellBurstBlock: mainHit.modeled ? mainHit.rate?.overloadBurstBlock || null : mainHit.inactiveReason || "it deals no modeled hit",
          burstActivationsPerSecond: mainHit.rate?.spellBurst?.activationsPerSecond || 0, burstStacks: mainHit.rate?.spellBurst?.maxSpellBurst || 0 } : null,
        // Mind Domain's Whimsy from 0 on the loop (census C3): your first Spell hit and the Spell hits' keys, which the Whimsy's timed part reaches.
        firstSpellHitSeconds: (() => { const firsts = skillHits.filter((hit) => hit.modeled && (hit.profile?.tags || []).includes("Spell")).map((hit) => hit.rate?.firstUseSeconds).filter(Number.isFinite); return firsts.length ? Math.min(...firsts) : null; })(),
        spellHitKeys: skillHits.filter((hit) => hit.modeled && (hit.profile?.tags || []).includes("Spell")).map((hit) => hit.key)
      };
    }
    if (carinoRates) facts.carino = { projectileUsesPerSecond: skillHits.filter((hit) => hit.modeled && (setups.find((setup) => setup.setupKey === hit.setupKey)?.tags || []).includes("Projectile")).reduce((sum, hit) => sum + (hit.rate?.usesPerSecond || 0), 0) };
    // Consumption cores (src/consumption-procs.js): the Main Skill's cast rate and the event rates their stack gains read.
    // True Flame Immolation (src/true-flame-blessing-cycle.js): its casts per second and its own Cooldown Recovery Speed, which set the
    // Blessing cycle the second pass holds.
    if (trueFlameSetup) {
      const flame = skillHits.find((hit) => hit.setupKey === trueFlameSetup.setupKey)?.itemMainSkill || null;
      facts.trueFlame = { castsPerSecond: flame?.usesPerSecond || 0, cooldownRecoveryPercent: flame?.cooldownRecoveryPercent ?? (hitRateFacts?.trueFlame?.cooldownRecoveryPercent ?? 0) };
    }
    if (consumptionCores) {
      const modeledHits = skillHits.filter((hit) => hit.modeled);
      const beamHits = activeNames.has("Scorching Beam") ? beamCastRate.castsPerSecond || 0 : 0;
      const reapSources = damagePaths?.sustained?.reaping?.sources || theoretical.combat.reaping?.sources || [];
      facts.consumption = {
        mainUsesPerSecond: mainUsesPerSecond || 0,
        hitsPerSecond: beamHits + modeledHits.reduce((sum, hit) => sum + (hit.rate.hitsPerSecond || 0), 0),
        critHitsPerSecond: beamHits * Math.max(0, Math.min(100, beamCritical?.criticalChancePercent || 0)) / 100 + [...bySetup.values()].reduce((sum, item) => sum + item.critHitsPerSecond, 0),
        reapsPerSecond: reapSources.reduce((sum, source) => sum + (source.reapsPerSecond || 0), 0),
        wiltSuccessesPerSecond: ailments.wilt?.modeled ? ailments.wilt.combat?.successesPerSecond || 0 : 0,
        // The Regain pools (src/regain-model.js) a Regain spend reads (W10 step 4a, src/consumption-procs.js regainAgilitySpend).
        // A Regain lands on a hit event: a cast's hits land together, a channel's one per step, an area's one per tick of each part ("N ticks
        // (every X s over Y s)", the parse of src/tick-plain-skills.js areaEffects), a Combo cycle's one per step (the tick engine's hit records);
        // the beam's casts included.
        ...(lineConditionState.consumption.regainSpend ? { regainPools: Object.fromEntries(Object.values(lineEffects.combat?.regain?.pools || {}).map((pool) => [pool.key, { active: Boolean(pool.active), ratePerSecond: Number(pool.ratePerSecond) || 0 }])),
          hitEventsPerSecond: beamHits + modeledHits.reduce((sum, hit) => {
            const uses = Number(hit.rate.usesPerSecond) || 0, model = String(hit.rate.useModel || "");
            const perUse = hit.rate.terraDurationSeconds > 0 ? (hit.components || []).reduce((total, component) => total + (Number(String(component.hitsDetail ?? "").match(/^([\d.]+) ticks \(every [\d.]+ s over [\d.]+ s\)/)?.[1]) || 1), 0)
              : /^channel \(/.test(model) ? Number(hit.rate.hitsPerUse) || 1 : model === "combo cycle" ? hit.profile?.cycle?.steps?.length || 1 : 1;
            return sum + uses * perUse;
          }, 0) } : {})
      };
    }
    // Mana / Life consumed recently (census #4, src/resource-consumption.js): each setup's player-cast uses per second; triggered
    // DoT casts (Wind Rhythm, Activation Mediums, Activation Medium: Terra) pay no cost (provisional).
    // Chunk 12: what the derived level lines and the Blur Rating lines read, resolved after them on this pass.
    if (firstPassFacts) {
      facts.levelFacts = { resistances: Object.fromEntries((resistances.entries || []).map((entry) => [entry.element, { total: entry.total, effective: entry.effective }])), lifeSealedPercent: Math.max(0, 100 - (aura.lifeRemainingPercent ?? 100)), fullMana: (aura.manaRemainingPercent ?? 100) >= FULL_MANA_AT_LEAST_PERCENT };
      facts.blurHeld = blurEffects.active ? { rating: blurEffects.rating * (blurEffects.heldShare ?? 1), effectPercent: blurEffects.effectPercent || 0, ...(blurEffects.heldShare != null ? { heldShare: blurEffects.heldShare } : {}) } : null;
    }
    if (resourceRates) {
      // A support's triggered skill DoT (Ice Lances: Permafrost's Frost Terra, src/permafrost-terra.js: node 2320, a triggered cast) is no use of yours.
      const triggeredKeys = triggeredDotKeys();
      // The Main Skill's every use (player and triggered; record 266457104's triggers 1000074 and 1000060), for the "Consumes X% of
      // current Mana when casting a Main Skill" copies (2026-11-05 build audit gap 1).
      const mainResourceHit = resolvedMain?.setupKey ? skillHits.find((hit) => hit.modeled && hit.setupKey === resolvedMain.setupKey) : null;
      const mainResourceDot = resolvedMain?.setupKey && !mainResourceHit ? (skillDots || []).find((dot) => dot.modeled && dot.setupKey === resolvedMain.setupKey) : null;
      const mainResourceUses = resolvedMain?.name === "Scorching Beam" ? beamCastRate.castsPerSecond || 0 : mainResourceHit ? Number(mainResourceHit.rate?.usesPerSecond) || 0 : Number(mainResourceDot?.applicationsPerSecond) || 0;
      // The Attack skills' player uses (trigger 1000074: presses, Multistrike repeats) and their skill instances per use (a Combo cycle:
      // each step its own instance, steps − 1 + Finishers), for "Consumes X% of current Life when you use Attack Skills" (record 200000005).
      // A Focus skill's strikes come from its Focus Pts, not a use of yours: node 2320 casts them through TriggerSkill (1000060, never
      // 1000074; proven, research/attack-life-consume-2026-11-09.md §4).
      const attackUses = skillHits.filter((hit) => { const tags = setups.find((setup) => setup.setupKey === hit.setupKey)?.tags || hit.profile?.tags || []; return hit.modeled && hit.setupKey && tags.includes("Attack") && !tags.includes("Focus"); }).map((hit) => {
        const source = hit.rate?.usesBySource;
        const usesPerSecond = source ? (Number(source.manual) || 0) + (Number(source.multistrikeRepeat) || 0) + (Number(source.spellBurstAuto) || 0) : Number(hit.rate?.pressedUsesPerSecond ?? hit.rate?.playerUsesPerSecond) || 0;
        const steps = hit.rate?.useModel === "combo cycle" ? Math.max(1, (hit.profile?.cycle?.steps?.length || 1) - 1 + (Number(hit.combo?.finishersPerCycle) || 1)) : 1;
        return { setupKey: hit.setupKey, name: hit.name, usesPerSecond, stepsPerUse: steps, from: steps > 1 ? `player uses × ${steps} Combo steps` : "player uses" };
      });
      // Every skill's player uses (trigger 1000074) for "Consumes X% of current Life on skill use" (record 539780864; playerSkillUses above).
      const skillUses = playerSkillUses(triggeredKeys, facts.pressInputs?.skills || []);
      facts.resource = resourceUseFacts({ skillHits, skillDots: skillDots || [], beamSetupKey: activeNames.has("Scorching Beam") ? setups.find((setup) => setup.name === "Scorching Beam")?.setupKey ?? null : null, beamCastsPerSecond: beamCastRate.castsPerSecond || 0, triggeredKeys,
        main: resolvedMain ? { setupKey: resolvedMain.setupKey ?? null, name: resolvedMain.name, usesPerSecond: mainResourceUses } : null, attackUses, skillUses });
    }
    return calculatePlannerOnce(input, conditionOverrides, { skipVariation: requestedSkipVariation, debuffHitRates: rates, hitRateFacts: facts, deferDisplayTail });
  }
  // Skills an item (or a support) triggers whose value the calculation reads at their level (user decision 2026-11-16, itemSkillLevel): the
  // level-line badges count them as users (src/line-coverage.js). Listed only when the build has one, so other results stay as they were.
  const itemTriggeredEntry = (kind, name, levels, trigger, fixedLevel) => ({ kind, name, tags: [...(catalogSkillsByName.get(name)?.tags || [])], baseLevel: levels.baseLevel ?? levels.level, addedLevels: levels.addedLevels ?? 0, effectiveLevel: levels.effectiveLevel ?? levels.level, fixedLevel: Boolean(fixedLevel), source: trigger?.source ?? null, text: trigger?.text ?? null });
  const itemTriggeredSkills = [
    ...itemTriggerSources.filter((source) => source.setup?.levelBonusSources && skillHits.some((hit) => hit.setupKey === source.setupKey && hit.modeled)).map((source) => itemTriggeredEntry("hit", source.setup.name, source.setup, source.itemTrigger, source.setup.fixedLevel)),
    ...skillDotSources.filter((source) => source.itemTrigger && (skillDots || []).some((dot) => dot.setupKey === source.setupKey)).map((source) => itemTriggeredEntry("dot", source.setup.name, source.setup, source.itemTrigger, source.setup.fixedLevel)),
    ...(gearAimSetup && aim.active ? [itemTriggeredEntry("aim", "Aim", gearAimSetup, { source: gearAim.line.source, text: gearAim.line.text }, gearAimSetup.fixedLevel)] : []),
    ...(permafrostLevels && (skillDots || []).some((dot) => String(dot.setupKey || "").startsWith("permafrost-terra:")) ? [{ ...itemTriggeredEntry("dot", "Frost Terra", permafrostLevels, { source: "Ice Lances: Permafrost (Noble)", text: null }, false), tags: [...(permafrostBase?.tags || [])] }] : []),
    ...(empowerEffects.entries || []).filter((entry) => entry.item && entry.active && !entry.superseded).map((entry) => itemTriggeredEntry(entry.kind === "warcry" ? "warcry" : "empower", entry.skill, entry, entry.item, isFixedLevelTriggerLine({ origin: "gear", text: entry.item.text }))),
    ...(mechanics.curses.active || []).filter((curse) => curse.cast && (curseTakenEffect(curse.name) || ["Entangled Pain", "Scorch"].includes(curse.name))).map((curse) => itemTriggeredEntry("curse", curse.name, curse, curse, isFixedLevelTriggerLine(curse)))
  ];
  const { effectivePacts: _effectivePacts, ...pactLimitsSummary } = pactLimits;
  const result = { pressRotation: pressRotationState ? { assumptions: pressRotationState.assumptions, bySetup: Object.fromEntries(pressRotationState.bySetup) } : null, state, playerBuffs, playerMoveSpeed: lineConditionState.playerMoveSpeed || null, prophecyOfRevelation, minionAilmentTypes, ...(minionFrostbite ? { minionFrostbite: (({ schedules, types, ...rest }) => rest)(minionFrostbite) } : {}), beamTypedTypes: [...new Set(beamTypedAdded.flatMap((part) => part.chain))], levelFacts: hitRateFacts?.levelFacts || null,pactLimits: pactLimitsSummary, moduleProtocols: moduleProtocols.modules, coreCopies: { active: Object.fromEntries([...coreCopies.active].map(([name, copy]) => [name, { kind: copy.kind, source: copy.source, label: copy.label }])), duplicates: coreCopies.duplicates.map(({ name, kind, source, activeFrom, affix, lines, slot, slateId }) => ({ name, kind, source, activeFrom, affix: affix ?? null, lines: lines ?? null, slot: slot ?? null, slateId: slateId ?? null })) }, damageTypeRestriction, enemyDebuffCores, weaponToSpells, critNumbedBuffs, periodicBurst, hitRateFacts, modifierTexts, lineEffects, follower: lineEffects.follower, mechanics: mechanicsSummary, supportEffects, afflictionRating, initialAffliction, cataclysmAilments: cataclysmAilments.setups, afflictionFireHits: { state: afflictionFireState, bySetup: Object.fromEntries(skillHits.filter((hit) => hit.setupKey).map((hit) => { const setup = setups.find((item) => item.setupKey === hit.setupKey); return [hit.setupKey, setup ? afflictionFireHitLines(afflictionFireState, { ownAdditionalPercent: cataclysmEffectPercent(setup), label: setup.name }).entries : []]; })) }, ailments, igniteAppliers, igniteAttemptsPerSecond, skillDots, skillHits, triggerSkills, minions, minionCores: { commanderGambit, spiritMagiLimit, darkGate: lineConditionState.darkGate, bond: { canObtain: minionBond.canObtain, maxStacks: minionBond.maxStacks, intervalSeconds: minionBond.intervalSeconds, prebuilt: minionBond.prebuilt, any: minionBond.any, lineCounts: Object.fromEntries(Object.entries(minionBond.sources).map(([key, list]) => [key, list.length])) }, summonCastSpeed: minionSummonCast, overlyModified, isomorphicArms: isomorphicArms ? { weapon: isomorphicArms.weapon, read: isomorphicArms.read || [], unread: isomorphicArms.unread, lines: isomorphicArms.lines.length, reason: isomorphicArms.reason } : null, comradeship: comradeship ? { belt: comradeship.belt, read: comradeship.read, unread: comradeship.unread, lines: comradeship.lines.length, reason: comradeship.reason } : null, command: minionCommand ? { perSecond: minionCommand.perSecond, full: minionCommand.full, points: minionCommand.points, value: minionCommand.value, sources: minionCommand.sources.map((item) => item.source), gated: minionCommand.gated || [] } : null }, weaponAttack, damageSources, mainSkill: resolvedMain, timedDotLayers, fullLife, damagePaths, dummyRecount, firesAllure, lowResources, resistances, curseLimit, resolvedSlates: slate.setup.slates, netherKingAuthority: slate.setup.netherKingAuthority || null, blessings, aim, block, barrierSources, blurSources, blurEffects, effectiveTargetFireResistancePercent: damageCombat.targetFireResistancePercent, coreTalents, murmursTideEffectPercent, seaFoamNocturne, tideEffectFactor, singWithTheTide, danceOfTheDeep, windStalker, yougaUltimateOne: yougaPlainState(yougaUltimateOne), mark, pureHeart, activationMediumTerra, cycleResist, illOmen, tangles, miraculousGain, igniteIllOmen, windRhythmTerra: Object.fromEntries([...windRhythmTerra].filter(([, value]) => value)), dotTriggers: Object.fromEntries([...dotTriggers].filter(([, value]) => value)), empowerEffects, defensiveBuffs, heroMemories, support, townSupportPrediction, talentSlate, equipment, pact, activation, aura, igniteLimit, igniteRecipe: ignitePatchSummary(ignitePatch), skillLevelFactor, sourceDamageMultiplier, theoretical, directHit, beamCastRate, beamCritical, beamAddedDamage, nativeHitCycle, bardDelivery, beamDelivery, combatProjection, recountFiveSeconds, recountOpening, recountVariation, configured, conditions, ...(auraAllies.derived && safetyInNumbersActive ? { auraAllies } : {}), ...(itemTriggeredSkills.length ? { itemTriggeredSkills } : {}), warnings: [...new Set(warnings)] };
  // A comparison pass (deferDisplayTail, final pass only): the display-only tail runs later, on the winner only, from this pass's own
  // values (nothing it reads is reassigned after this point), and gives the planner a full pass would have returned: the two tail
  // fields in their places, and a tail warning where the full pass lists it (after the other recount estimates' warnings).
  if (deferDisplayTail && skipVariation && !probeDebuffHitRates) displayTails.set(result, () => {
    const before = shadowWarnings.length;
    const tail = { recountVariation: computeRecountVariation(), dummyRecount: computeDummyRecount() };
    const extra = shadowWarnings.slice(before);
    return { ...result, ...tail, ...(extra.length ? { warnings: [...new Set([...warnings.slice(0, shadowWarningsEnd), ...extra, ...warnings.slice(shadowWarningsEnd)])] } : {}) };
  });
  return result;
}
