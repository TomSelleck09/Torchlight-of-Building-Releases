export const selenaScorchingBeamCombatValidation = {
  season: "SS13",
  captureDate: "2026-09-01",
  target: { name: "Invincible No.2", level: 85 },
  recount: {
    displayCapDps: 5_000_000_000_000,
    averageDpsIsLowerBound: true,
    highestFiveSecondDpsIsLowerBound: true,
    capturedDurationsSeconds: [11, 80, 121],
    screenshots: ["Screenshot 2026-09-01 105409.png", "Screenshot 2026-09-01 105518.png", "Screenshot 2026-09-01 105559.png"]
  },
  resourcesDuringCombat: { life: [1, 2150], energyShield: [7376, 7376], mana: [24, 525], sealedLife: 2150, sealedMana: 501 },
  playerStatusRow: [
    { id: "tideEffect", label: "Tide Effect", active: true },
    { id: "channelStacks", label: "Scorching Beam channeled stacks", active: true, sampledValue: 3, maximum: 5 },
    { id: "blur", label: "Blur Rating", active: true, value: 100 },
    { id: "fortitude", label: "Fortitude", active: true },
    { id: "focusBlessing", label: "Focus Blessing", active: true, value: 6 },
    { id: "tenacityBlessing", label: "Tenacity Blessing", active: true, value: 7 },
    { id: "barrier", label: "Barrier", active: true },
    { id: "swiftnessDew", label: "Swiftness Dew", active: true },
    { id: "aim", label: "Aim", active: true, uptime: "near-continuous; less than one second downtime" },
    { id: "dualWielding", label: "Dual Wielding", active: true, effects: { attackBlockChancePercent: 30, additionalAttackSpeedPercent: 10 } },
    { id: "preciseAuras", label: "Four Precise auras", active: true, count: 4, names: ["Precise: Ailment Amplification", "Precise: Charged Flames", "Precise: Deep Pain", "Precise: Domain Expansion"] }
  ],
  igniteMechanics: {
    maximumActiveLimit: {
      total: 10,
      sources: [
        { source: "Intrinsic Ignite limit", value: 1 },
        { source: "Sun's Embrace", value: 2 },
        { source: "Elder Sage Girdle", value: 1 },
        { source: "Vorax Limb: Digits", value: 1 },
        { source: "Starfire", value: 1 },
        { source: "4 × Kismet: Volcano", value: 4 }
      ]
    },
    stacksInflictedPerApplication: {
      total: 16,
      sources: [
        { source: "Intrinsic application", value: 1 },
        { source: "Sun's Embrace", value: 2 },
        { source: "Warlord Legendary Medium Talent", value: 1 },
        { source: "Additional Ignite support", value: 1 },
        { source: "Divinity Slates and copied talents", value: 11 }
      ]
    },
    behavior: "Each application attempts 16 Ignite stacks; the target retains at most 10 active stacks."
    ,disintegrateNoble: {
      additionallyInflictedStacks: 15,
      additionalIgniteDamagePerStackPercent: 26,
      totalAdditionalIgniteDamagePercent: 390,
      countsStacksAboveActiveLimit: true,
      explanation: "The intrinsic first Ignite is not an additionally inflicted stack; all 15 additional stacks scale Disintegrate even though only 10 Ignites remain active."
    }
  },
  characterSheet: {
    spellDps: 59167,
    totalSpellDamage: [11500, 21300],
    igniteDps: 11538549,
    damageBonusPercent: 139,
    additionalDamageBonusPercent: 3369,
    additionalFireDamageBonusPercent: 81,
    castsPerSecond: 2.45,
    spellCriticalStrikeChancePercent: 6.3,
    auraEffectPercent: 34,
    blurEffectPercent: 57,
    reapingCooldownRecoverySpeedPercent: 243,
    additionalReapingCooldownRecoverySpeedPercent: 25,
    reapingDurationBonusPercent: 230,
    baseIgniteDamage: 675,
    afflictionPerSecond: 736,
    igniteDamagePerAfflictionPercent: 4
  },
  confirmedConditions: [
    { id: "level85Dummy", label: "Level 85 Invincible dummy", enabled: true },
    { id: "sustainedBeam", label: "Sustained Scorching Beam", enabled: true },
    { id: "aurasActive", label: "Auras active", enabled: true },
    { id: "lowMana", label: "Low Mana (24/525)", enabled: true },
    { id: "lowLife", label: "Low Life (1/2150)", enabled: true }
  ],
  identifiedIndicators: [
    { id: "aimEuphoria", label: "Aim / Euphoria near-continuous", location: "player status row", confidence: "user-confirmed", enabled: true, uptime: { exact: null, downtimeSecondsUpperBound: 1, description: "Active with less than one second of downtime per cycle" } },
    { id: "onTheTide", label: "Enemy is On the Tide", location: "target blue status icon", confidence: "user-confirmed", enabled: true, heroTrait: "Sing with the Tide" },
    { id: "entangledPain", label: "Entangled Pain applied", location: "target status row", confidence: "icon-match", enabled: true },
    { id: "fireInfiltration", label: "Fire Infiltration applied", location: "target kneeling-character icon", confidence: "user-confirmed", enabled: true },
    { id: "scorchCurse", label: "Scorch curse applied", location: "target yellow/orange icon", confidence: "user-confirmed", enabled: true },
    { id: "igniteStacks", label: "10 active Ignite stacks", location: "target flame counter", confidence: "mechanic-and-icon-match", value: 10, enabled: true }
  ],
  cyclicIndicators: [
    { id: "affliction", label: "Affliction cycle", location: "target status row", confidence: "user-confirmed", sampledValue: 73, minimum: 0, maximum: 100, resetAtMaximum: true, resetCause: "Torturer's Touch Reaping removes enemy Affliction" },
    { id: "channelStacks", label: "Scorching Beam channeled stacks", location: "player status row", confidence: "user-confirmed", sampledValues: [2, 3, 4], maximum: 5, resetAtMaximum: false, resetCause: "Channel state changes during combat" }
  ],
  unresolvedIndicators: [
    "Exact Aim uptime percentage; observed downtime is less than one second"
  ],
  notes: [
    "The recount UI is saturated; 5T is a lower bound rather than an exact DPS result.",
    "The post-combat character sheet differs from the earlier 71,386,575 town Ignite DPS capture despite matching the other visible inputs, so both observations are retained."
  ]
};
