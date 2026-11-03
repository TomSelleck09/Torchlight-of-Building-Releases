export const selenaScorchingBeamObservedSnapshots = [
  {
    id: "stats-capture-2026-09-01-0821",
    label: "Current unbuffed town baseline",
    level: 98,
    screenshots: [
      "Screenshot 2026-09-01 082101.png",
      "Screenshot 2026-09-01 082122.png",
      "Screenshot 2026-09-01 082141.png"
    ],
    damage: {
      spellDps: 59167,
      totalSpellDamage: [11500, 21300],
      fireSpellDamage: [11500, 21300],
      igniteDps: 71386575,
      damageBonusPercent: 139,
      additionalDamageBonusPercent: 3369,
      additionalFireDamageBonusPercent: 81,
      castsPerSecond: 2.45,
      castSpeedBonusPercent: 2,
      additionalCastSpeedBonusPercent: -20,
      spellCriticalStrikeChancePercent: 6.3,
      spellCriticalStrikeRatingPercent: 26,
      spellCriticalStrikeDamagePercent: 150
    },
    buffsAndMechanics: {
      auraEffectPercent: 34,
      blurEffectPercent: 57,
      additionalDamageAgainstLifePercent: 14,
      maxFrostbiteRating: 10,
      maxTangleQuantity: 2,
      additionalTangleAttachQuantity: 1,
      reapingCooldownRecoverySpeedPercent: 243,
      additionalReapingCooldownRecoverySpeedPercent: 25,
      reapingDurationBonusPercent: 230,
      baseIgniteDamage: 675,
      afflictionPerSecond: 736,
      igniteDamagePerAfflictionPercent: 4,
      traumaDamageIncreasePerAfflictionPercent: 4,
      wiltDamagePerAfflictionPercent: 4
    },
    state: "town-unbuffed",
    notes: [
      "Confirmed by the user as captured while standing in town with no combat buffs active.",
      "This is the primary baseline calibration target; the earlier Pro Builds capture is retained as an older or otherwise different snapshot."
    ]
  },
  {
    id: "stats-capture-2026-09-01-0841-no-torturers-touch",
    label: "Unbuffed town comparison without Torturer's Touch",
    level: 98,
    screenshots: ["Screenshot 2026-09-01 084100.png", "Screenshot 2026-09-01 084122.png", "Screenshot 2026-09-01 084139.png"],
    damage: {
      spellDps: 35330, totalSpellDamage: [6900, 12700], fireSpellDamage: [6900, 12700], igniteDps: 20213901,
      damageBonusPercent: 139, additionalDamageBonusPercent: 3281, additionalFireDamageBonusPercent: 11,
      castsPerSecond: 2.45, castSpeedBonusPercent: 2, additionalCastSpeedBonusPercent: -20,
      spellCriticalStrikeChancePercent: 6.3, spellCriticalStrikeRatingPercent: 26, spellCriticalStrikeDamagePercent: 150
    },
    buffsAndMechanics: {
      auraEffectPercent: 34, blurEffectPercent: 57, additionalDamageAgainstLifePercent: 14,
      maxFrostbiteRating: 10, maxTangleQuantity: 2, additionalTangleAttachQuantity: 1,
      reapingCooldownRecoverySpeedPercent: 243, additionalReapingCooldownRecoverySpeedPercent: 25,
      reapingDurationBonusPercent: 230, baseIgniteDamage: 675, afflictionPerSecond: 604,
      igniteDamagePerAfflictionPercent: 4, traumaDamageIncreasePerAfflictionPercent: 4, wiltDamagePerAfflictionPercent: 4
    },
    state: "town-unbuffed-no-torturers-touch",
    validForItemIsolation: false,
    confounder: "Removing gear reduced Energy and disabled some supports and auras.",
    notes: ["Retained as an observed low-Energy state, not a calibrated Torturer's Touch comparison."]
  },
  {
    id: "stats-capture-2026-09-01-0858-no-main-hand",
    label: "Unbuffed town comparison without main-hand Dark Gaze Scepter",
    level: 98,
    screenshots: ["Screenshot 2026-09-01 085756.png", "Screenshot 2026-09-01 085822.png", "Screenshot 2026-09-01 085838.png"],
    damage: {
      spellDps: 27035, totalSpellDamage: [5200, 9700], fireSpellDamage: [5200, 9700], igniteDps: 5636256,
      damageBonusPercent: 139, additionalDamageBonusPercent: 2487, additionalFireDamageBonusPercent: 11,
      castsPerSecond: 2.45, castSpeedBonusPercent: 2, additionalCastSpeedBonusPercent: -20,
      spellCriticalStrikeChancePercent: 6.3, spellCriticalStrikeRatingPercent: 26, spellCriticalStrikeDamagePercent: 150
    },
    buffsAndMechanics: {
      auraEffectPercent: 34, blurEffectPercent: 57, additionalDamageAgainstLifePercent: 14,
      maxFrostbiteRating: 10, maxTangleQuantity: 2, additionalTangleAttachQuantity: 1,
      reapingCooldownRecoverySpeedPercent: 101, additionalReapingCooldownRecoverySpeedPercent: 25,
      reapingDurationBonusPercent: 230, baseIgniteDamage: 355, afflictionPerSecond: 515,
      igniteDamagePerAfflictionPercent: 4, traumaDamageIncreasePerAfflictionPercent: 4, wiltDamagePerAfflictionPercent: 4
    },
    state: "town-unbuffed-no-main-hand-dark-gaze",
    validForItemIsolation: false,
    confounder: "Removing gear reduced Energy and disabled some supports and auras.",
    notes: ["Retained as an observed low-Energy state, not a calibrated main-hand comparison."]
  },
  {
    id: "stats-capture-2026-09-01-0904-no-secondary-hand",
    label: "Unbuffed town comparison without secondary-hand Dark Gaze Scepter",
    level: 98,
    screenshots: ["Screenshot 2026-09-01 090346.png", "Screenshot 2026-09-01 090405.png", "Screenshot 2026-09-01 090420.png"],
    damage: {
      spellDps: 21641, totalSpellDamage: [4200, 7800], fireSpellDamage: [4200, 7800], igniteDps: 4545820,
      damageBonusPercent: 139, additionalDamageBonusPercent: 1971, additionalFireDamageBonusPercent: 11,
      castsPerSecond: 2.45, castSpeedBonusPercent: 2, additionalCastSpeedBonusPercent: -20,
      spellCriticalStrikeChancePercent: 6.3, spellCriticalStrikeRatingPercent: 26, spellCriticalStrikeDamagePercent: 150
    },
    buffsAndMechanics: {
      auraEffectPercent: 34, blurEffectPercent: 57, additionalDamageAgainstLifePercent: 14,
      maxFrostbiteRating: 10, maxTangleQuantity: 2, additionalTangleAttachQuantity: 1,
      reapingCooldownRecoverySpeedPercent: 243, additionalReapingCooldownRecoverySpeedPercent: 25,
      reapingDurationBonusPercent: 150, baseIgniteDamage: 355, afflictionPerSecond: 337,
      igniteDamagePerAfflictionPercent: 4, traumaDamageIncreasePerAfflictionPercent: 4, wiltDamagePerAfflictionPercent: 4
    },
    state: "town-unbuffed-no-secondary-hand-dark-gaze",
    validForItemIsolation: false,
    confounder: "Removing gear reduced Energy and disabled some supports and auras.",
    notes: ["Retained as an observed low-Energy state, not a calibrated secondary-hand comparison."]
  },
  {
    id: "stats-capture-2026-09-01-0913-no-additional-ignite",
    label: "Unbuffed town comparison without Additional Ignite support",
    level: 98,
    screenshots: ["Screenshot 2026-09-01 091257.png", "Screenshot 2026-09-01 091319.png", "Screenshot 2026-09-01 091332.png"],
    damage: {
      spellDps: 61635, totalSpellDamage: [12000, 22200], fireSpellDamage: [12000, 22200], igniteDps: 60448603,
      damageBonusPercent: 139, additionalDamageBonusPercent: 3514, additionalFireDamageBonusPercent: 81,
      castsPerSecond: 2.45, castSpeedBonusPercent: 2, additionalCastSpeedBonusPercent: -20,
      spellCriticalStrikeChancePercent: 6.3, spellCriticalStrikeRatingPercent: 26, spellCriticalStrikeDamagePercent: 150
    },
    buffsAndMechanics: {
      auraEffectPercent: 34, blurEffectPercent: 57, additionalDamageAgainstLifePercent: 14,
      maxFrostbiteRating: 10, maxTangleQuantity: 2, additionalTangleAttachQuantity: 1,
      reapingCooldownRecoverySpeedPercent: 243, additionalReapingCooldownRecoverySpeedPercent: 25,
      reapingDurationBonusPercent: 230, baseIgniteDamage: 675, afflictionPerSecond: 736,
      igniteDamagePerAfflictionPercent: 4, traumaDamageIncreasePerAfflictionPercent: 4, wiltDamagePerAfflictionPercent: 4
    },
    state: "town-unbuffed-no-additional-ignite-support",
    validForSkillIsolation: true,
    removedSupport: "Additional Ignite",
    notes: ["Gear remained equipped and Energy-dependent Aura, Affliction, Base Ignite, and Reaping stats were unchanged."]
  },
  {
    id: "stats-capture-2026-09-01-0918-no-control-spell",
    label: "Unbuffed town comparison without Control Spell support",
    level: 98,
    screenshots: ["Screenshot 2026-09-01 091724.png", "Screenshot 2026-09-01 091741.png", "Screenshot 2026-09-01 091801.png"],
    damage: {
      spellDps: 44301, totalSpellDamage: [8400, 15600], fireSpellDamage: [8400, 15600], igniteDps: 38844040,
      damageBonusPercent: 139, additionalDamageBonusPercent: 2436, additionalFireDamageBonusPercent: 81,
      castsPerSecond: 2.45, castSpeedBonusPercent: 2, additionalCastSpeedBonusPercent: -20,
      spellCriticalStrikeChancePercent: 11.3, spellCriticalStrikeRatingPercent: null, spellCriticalStrikeDamagePercent: 150
    },
    buffsAndMechanics: {
      auraEffectPercent: 34, blurEffectPercent: 57, additionalDamageAgainstLifePercent: 14,
      maxFrostbiteRating: 10, maxTangleQuantity: 2, additionalTangleAttachQuantity: 1,
      reapingCooldownRecoverySpeedPercent: 243, additionalReapingCooldownRecoverySpeedPercent: 25,
      reapingDurationBonusPercent: 230, baseIgniteDamage: 675, afflictionPerSecond: 736,
      igniteDamagePerAfflictionPercent: 4, traumaDamageIncreasePerAfflictionPercent: 4, wiltDamagePerAfflictionPercent: 4
    },
    state: "town-unbuffed-no-control-spell-support",
    validForSkillIsolation: true,
    removedSupport: "Control Spell",
    notes: ["Gear and Energy-dependent stats remained unchanged. The Critical Strike Rating Percentage row was not visible in this capture and is intentionally null."]
  },
  {
    id: "stats-capture-2026-09-01-0923-no-guard",
    label: "Unbuffed town comparison without Guard support",
    level: 98,
    screenshots: ["Screenshot 2026-09-01 092226.png", "Screenshot 2026-09-01 092246.png", "Screenshot 2026-09-01 092301.png"],
    damage: {
      spellDps: 49059, totalSpellDamage: [9500, 17600], fireSpellDamage: [9500, 17600], igniteDps: 45574805,
      damageBonusPercent: 139, additionalDamageBonusPercent: 2777, additionalFireDamageBonusPercent: 81,
      castsPerSecond: 2.45, castSpeedBonusPercent: 2, additionalCastSpeedBonusPercent: -20,
      spellCriticalStrikeChancePercent: 6.3, spellCriticalStrikeRatingPercent: 26, spellCriticalStrikeDamagePercent: 150
    },
    buffsAndMechanics: {
      auraEffectPercent: 34, blurEffectPercent: 57, additionalDamageAgainstLifePercent: 14,
      maxFrostbiteRating: 10, maxTangleQuantity: 2, additionalTangleAttachQuantity: 1,
      reapingCooldownRecoverySpeedPercent: 243, additionalReapingCooldownRecoverySpeedPercent: 25,
      reapingDurationBonusPercent: 230, baseIgniteDamage: 675, afflictionPerSecond: 736,
      igniteDamagePerAfflictionPercent: 4, traumaDamageIncreasePerAfflictionPercent: 4, wiltDamagePerAfflictionPercent: 4
    },
    state: "town-unbuffed-no-guard-support",
    validForSkillIsolation: true,
    removedSupport: "Guard",
    notes: ["Gear and Energy-dependent stats remained unchanged."]
  },
  {
    id: "stats-capture-2026-09-01-0926-no-refracted-prism",
    label: "Unbuffed town comparison without Refracted Prism support",
    level: 98,
    screenshots: ["Screenshot 2026-09-01 092622.png", "Screenshot 2026-09-01 092638.png", "Screenshot 2026-09-01 092652.png"],
    damage: {
      spellDps: 49252, totalSpellDamage: [9600, 17700], fireSpellDamage: [9600, 17700], igniteDps: 38397280,
      damageBonusPercent: 139, additionalDamageBonusPercent: 2788, additionalFireDamageBonusPercent: 81,
      castsPerSecond: 2.45, castSpeedBonusPercent: 2, additionalCastSpeedBonusPercent: -20,
      spellCriticalStrikeChancePercent: 6.3, spellCriticalStrikeRatingPercent: 26, spellCriticalStrikeDamagePercent: 150
    },
    buffsAndMechanics: {
      auraEffectPercent: 34, blurEffectPercent: 57, additionalDamageAgainstLifePercent: 14,
      maxFrostbiteRating: 10, maxTangleQuantity: 2, additionalTangleAttachQuantity: 1,
      reapingCooldownRecoverySpeedPercent: 243, additionalReapingCooldownRecoverySpeedPercent: 25,
      reapingDurationBonusPercent: 230, baseIgniteDamage: 675, afflictionPerSecond: 736,
      igniteDamagePerAfflictionPercent: 4, traumaDamageIncreasePerAfflictionPercent: 4, wiltDamagePerAfflictionPercent: 4
    },
    state: "town-unbuffed-no-refracted-prism-support",
    validForSkillIsolation: true,
    removedSupport: "Refracted Prism",
    notes: ["Gear and Energy-dependent stats remained unchanged."]
  }
];
