const support = (name, level, effects, manaCostMultiplierPercent = 100) => ({ name, level, manaCostMultiplierPercent, effects });

export const selenaCompleteSkillLoadoutSs13 = {
  season: "SS13",
  energyProfile: {
    observedUsed: 515, observedCapacity: 518, nonEquipmentEnergy: 102,
    activeSlotCosts: [0, 10, 15, 50, 100], passiveSlotCosts: [10, 10, 15, 50, 100],
    enabledSupportSlotsBySetup: [5, 3, 3, 4, 3, 3, 3, 4, 3],
    source: "Screenshot 2026-09-01 094109.png"
  },
  observedReservation: {
    mana: { maximum: 525, unsealed: 24, unsealedPercent: 4.57 },
    life: { maximum: 2150, unsealed: 0, unsealedPercent: 0.01 },
    source: "codex-clipboard-20847ff7-0fb1-47f4-8c30-110b1a8b9ee8.png"
  },
  setups: [
    {
      role: "main", name: "Scorching Beam", baseLevel: 20, addedLevels: 11, effectiveLevel: 31,
      observed: { manaCost: 12.88, castsPerSecond: 3, addedDamageEffectivenessPercent: 41, beamSpellFireDamage: [156, 289] },
      databaseLevel20: { manaCost: 8, castIntervalSeconds: 0.333, addedDamageEffectivenessPercent: 41, beamSpellFireDamage: [156, 289], explosionSpellFireDamage: [467, 867], maxChannelStacks: 5 },
      supports: [
        support("Refracted Prism", 30, ["+2 additional refractions", "+27% additional damage", "-10% additional Beam Length"], 110),
        support("Guard", 25, ["+27.5% additional damage", "Every 5 uses gains Barrier if none; 6 s interval"], 110),
        support("Control Spell", 30, ["-100% Critical Strike Rating", "+42.5% additional damage"], 110),
        support("Additional Ignite", 30, ["+1 Ignite stack", "+7.6% additional Ignite Damage per enemy Ignite stack, capped at +30.4%", "+15% Ignite chance"], 110),
        { name: "Scorching Beam: Disintegrate (Noble)", tier: 0, stars: 5, manaCostMultiplierPercent: 110, effects: ["+20% additional damage", "+26% additional Ignite Damage for each stack of Ignite additionally inflicted"], mechanics: { additionalIgniteDamagePerAdditionallyInflictedStackPercent: 26 }, source: "" }
      ],
      source: ""
    },
    {
      role: "empower", name: "Aim", baseLevel: 20, addedLevels: 6, effectiveLevel: 26, levelIsInferred: false,
      databaseLevel20: { manaCost: 15, castTimeSeconds: 1, cooldownSeconds: 10, durationSeconds: 6, rangedAndBeamAdditionalDamagePercent: 35, rangedAndBeamAdditionalAilmentDamagePercent: 35, attackAndCastSpeedPercent: -16 },
      supports: [
        support("Activation Medium: Preparation", 25, ["Prepares every 6 s", "+19% additional Duration"]),
        support("Mass Effect", 25, ["+1 Max Charges", "+22.5% effect per +1 Charge, up to +67.5%"], 110),
        support("Extended Duration", 25, ["+25% Duration"], 110),
        support("Well-Fought Battle", 25, ["+11.25% Effect per cast, stacking up to 3 times"], 110)
      ],
      source: ""
    },
    {
      role: "elixir", name: "Swiftness Dew", baseLevel: 20, addedLevels: 1, effectiveLevel: 21,
      observed: { movementSpeedPercent: 32.5, durationSeconds: 3, cooldownSeconds: 0.5 },
      databaseLevel20: { movementSpeedPercent: 32, durationSeconds: 3, cooldownSeconds: 0.5, chargingProgressRequired: 15 },
      supports: [
        support("Activation Medium: Preparation", 25, ["Prepares every 6 s", "+23% additional Duration"]),
        support("Extended Duration", 25, ["+25% Duration"], 110),
        support("Hyper Metabolism", 25, ["Gains 1.1 Charging Progress every second"], 110)
      ],
      source: ""
    },
    {
      role: "curse", name: "Entangled Pain", baseLevel: 20, addedLevels: 6, effectiveLevel: 26,
      observed: { manaCost: 18.14, castTimeSeconds: 1, cooldownSeconds: 0.5, cursedEnemyAdditionalDamageOverTimeTakenPercent: 42.5 },
      databaseLevel20: { manaCost: 15, castTimeSeconds: 1, cooldownSeconds: 8, cursedEnemyAdditionalDamageOverTimeTakenPercent: 39, durationSeconds: 5 },
      supports: [
        support("Activation Medium: Preparation", 25, ["Prepares every 6 s", "+22% additional Duration"]),
        support("Extended Duration", 25, ["+25% Duration"], 110),
        support("Terrain of Malice", 25, ["Becomes instant cast", "Curse persists in an area centered on the caster"], 110)
      ],
      source: ""
    },
    {
      role: "curse", name: "Scorch", baseLevel: 20, addedLevels: 11, effectiveLevel: 31,
      observed: { manaCost: 18.14, castTimeSeconds: 1, cooldownSeconds: 0.5, cursedEnemyAdditionalFireDamageTakenPercent: 45, chanceToBeIgnitedWhenHitByCursedEnemyPercent: 10 },
      databaseLevel20: { manaCost: 15, castTimeSeconds: 1, cooldownSeconds: 8, cursedEnemyAdditionalFireDamageTakenPercent: 39, chanceToBeIgnitedWhenHitByCursedEnemyPercent: 10, durationSeconds: 5 },
      supports: [
        support("Activation Medium: Preparation", 25, ["Prepares every 7 s", "+22% additional Duration"]),
        support("Extended Duration", 25, ["+25% Duration"], 110),
        support("Terrain of Malice", 25, ["Becomes instant cast", "Curse persists in an area centered on the caster"], 110)
      ],
      source: ""
    },
    {
      role: "aura", name: "Precise: Ailment Amplification", baseLevel: 20, addedLevels: 1, effectiveLevel: 21,
      observed: { sealedManaPercent: 55, additionalAilmentDamagePercent: 25.5, ailmentChancePercent: 17, ailmentDurationPercent: 10 },
      supports: [support("Increased Area",25,["+20% Skill Area", "+20.8% additional damage"],110),support("Aura Amplification",25,["+11.25% Aura Effect", "+100% Skill Area"]),support("Restrain",25,["+12.5% Sealed Mana Compensation"])],
      source: ""
    },
    {
      role: "aura", name: "Precise: Charged Flames", baseLevel: 20, addedLevels: 6, effectiveLevel: 26,
      observed: { sealedManaPercent: 55, additionalFireDamagePercent: 43.5 },
      databaseLevel20: { sealedManaPercent: 50, additionalFireDamagePercent: 40 },
      supports: [support("Increased Area",25,["+20% Skill Area", "+20.8% additional damage"],110),support("Aura Amplification",25,["+11.25% Aura Effect", "+100% Skill Area"]),support("Restrain",25,["+12.5% Sealed Mana Compensation"])],
      source: ""
    },
    {
      role: "aura", name: "Precise: Deep Pain", baseLevel: 20, addedLevels: 1, effectiveLevel: 21,
      observed: { sealedManaPercent: 55, additionalDamageOverTimePercent: 41, afflictionPerSecond: 30 },
      databaseLevel20: { sealedManaPercent: 50, additionalDamageOverTimePercent: 40, afflictionPerSecond: 30 },
      supports: [support("Seal Conversion",25,["Replaces Sealed Mana with Sealed Life", "-62% additional Sealed Mana Compensation"]),support("Increased Area",25,["+20% Skill Area", "+20.8% additional damage"],110),support("Aura Amplification",25,["+11.25% Aura Effect", "+100% Skill Area"]),support("Restrain",25,["+12.5% Sealed Mana Compensation"])],
      source: ""
    },
    {
      role: "aura", name: "Precise: Domain Expansion", baseLevel: 20, addedLevels: 1, effectiveLevel: 21,
      observed: { sealedManaPercent: 55, additionalAreaDamagePercent: 34, additionalAreaAilmentDamagePercent: 34, conditionalSkillAreaPercent: 20, conditionalAdditionalAreaDamagePercent: 4 },
      databaseLevel20: { sealedManaPercent: 50, additionalAreaDamagePercent: 33, additionalAreaAilmentDamagePercent: 33, conditionalEnemyCount: 5, conditionalRadiusMeters: 10, conditionalSkillAreaPercent: 20, conditionalAdditionalAreaDamagePercent: 4 },
      supports: [support("Increased Area",25,["+20% Skill Area", "+20.8% additional damage"],110),support("Aura Amplification",25,["+11.25% Aura Effect", "+100% Skill Area"]),support("Restrain",25,["+12.5% Sealed Mana Compensation"])],
      source: ""
    }
  ],
  notes: [
    "Observed values are transcribed from the user's in-game effective-level tooltips; databaseLevel20 values are the SS13 reference data Details values.",
    "Aim is confirmed by its in-game tooltip at level 20+6 (effective level 26), granting +38.5% additional damage to Ranged and Beam Skills while Euphoria is active.",
    "Activation Medium: Preparation is itemized per setup because the captured roll and preparation interval differ between copies."
    ,"Scorching Beam: Disintegrate (Noble) is the captured fifth-slot Tier 0 support; its +26% roll scales with additionally inflicted stacks, including stacks above the active Ignite limit."
  ]
};
