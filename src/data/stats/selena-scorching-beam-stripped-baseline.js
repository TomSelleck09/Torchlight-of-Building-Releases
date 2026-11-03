// Post-zone-reset game panel captured with all removable build systems stripped.
// Selena retains her built-in hero state; Scorching Beam is equipped with no supports.
export const selenaScorchingBeamStrippedBaseline = {
  capturedAt: "2026-09-15T12:47:07",
  level: 98,
  skill: { name: "Scorching Beam", supports: [] },
  damage: {
    spellDps: 383.52852358581,
    totalSpellDamage: [61.152, 113.288],
    fireSpellDamage: [61.152, 113.288],
    castsPerSecond: 3.003003,
    spellCriticalStrikeChancePercent: 5,
    spellCriticalStrikeDamagePercent: 150,
    damageBonusPercent: 0,
    additionalDamageBonusPercent: -20,
    additionalFireDamageBonusPercent: 0
  },
  ignite: {
    dps: 0,
    baseDamage: 0,
    afflictionPerSecond: 0,
    afflictionEffectPercent: 0,
    firePenetrationPercent: 0
  },
  source: "UE_game.log RoleAttrMgr panel after zone reset"
};

export const selenaScorchingBeamStrippedValidations = [
  {
    id: "judgment-and-dark-gaze-single-weapon-2026-09-22",
    slate: { name: "Nether King's Divinity: Judgment", baseIgniteDamage: 5 },
    weapon: { name: "Dark Gaze Scepter", modifiers: ["+39% Damage Over Time", "+25% Elemental Damage", "Adds 125 - 230 Base Ignite Damage"] },
    damage: { displayedSpellDps: 479, displayedFireSpellDamage: [76, 142], displayedIgniteDps: 49 },
    source: "in-game character panel and weapon tooltip, 2026-09-22"
  },
  {
    id: "guard-level-20",
    capturedAt: "2026-09-15T12:55:33",
    supports: [{ name: "Guard", level: 20, additionalDamagePercent: 25 }],
    damage: { spellDps: 479.41065448226, fireSpellDamage: [76.44, 141.61], igniteDps: 0 },
    expectedFactor: 1.25,
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "guard-and-refracted-prism-level-20",
    capturedAt: "2026-09-15T13:00:00",
    supports: [
      { name: "Guard", level: 20, additionalDamagePercent: 25 },
      { name: "Refracted Prism", level: 20, additionalDamagePercent: 22 }
    ],
    damage: { spellDps: 584.88099846836, fireSpellDamage: [93.2568, 172.7642], igniteDps: 0 },
    expectedFactor: 1.25 * 1.22,
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "judgment-and-additional-ignite-level-20",
    capturedAt: "2026-09-15T13:02:35",
    supports: [
      { name: "Guard", level: 20, additionalDamagePercent: 25 },
      { name: "Refracted Prism", level: 20, additionalDamagePercent: 22 },
      { name: "Additional Ignite", level: 20, igniteChancePercent: 15, additionalStacks: 1 }
    ],
    slate: { name: "Nether King's Divinity: Judgment", baseIgniteDamage: 5, blurEffectPercent: 16 },
    damage: { spellDps: 584.88099846836, fireSpellDamage: [93.2568, 172.7642], igniteDps: 1.7507 },
    inferredTownIgniteChancePercent: 35,
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "judgment-and-additional-ignite-without-general-supports",
    capturedAt: "2026-09-15T13:06:23",
    supports: [{ name: "Additional Ignite", level: 20, igniteChancePercent: 15, additionalStacks: 1 }],
    slate: { name: "Nether King's Divinity: Judgment", baseIgniteDamage: 5, blurEffectPercent: 16 },
    damage: { spellDps: 383.52852358581, fireSpellDamage: [61.152, 113.288], igniteDps: 1.148 },
    theoreticalIgniteInputs: { baseIgniteDamage: 5, addedDamageEffectivenessPercent: 41, shotgunCoefficientPercent: 70, bardAdditionalDamagePercent: -20 },
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "one-warlord-fire-dot-rank",
    capturedAt: "2026-09-15T13:13:10",
    supports: [{ name: "Additional Ignite", level: 20 }],
    slate: { name: "Nether King's Divinity: Judgment", baseIgniteDamage: 5 },
    talents: [{ tree: "Warlord", description: "+9% Fire Damage Over Time", rank: 1 }],
    damage: { spellDps: 383.52852358581, fireSpellDamage: [61.152, 113.288], igniteDps: 1.25132 },
    expectedIgniteFactorFromPrevious: 1.09,
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "legal-warlord-path-through-base-ignite",
    capturedAt: "2026-09-15T13:18:17",
    supports: [{ name: "Additional Ignite", level: 20 }],
    slate: { name: "Nether King's Divinity: Judgment", baseIgniteDamage: 5 },
    talents: {
      fireDamageOverTimePercent: 90,
      baseIgniteDamage: 10,
      igniteChancePercent: 27,
      allocatedPoints: 13
    },
    damage: { spellDps: 383.52852358581, fireSpellDamage: [61.152, 113.288], baseIgniteDamage: 15, igniteDps: 6.5436 },
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "precise-deep-pain-level-20",
    capturedAt: "2026-09-15T15:29:22",
    aura: { name: "Precise: Deep Pain", level: 20, additionalDamageOverTimePercent: 40, afflictionPerSecond: 30 },
    damage: { spellDps: 383.52852358581, igniteDps: 17.94037 },
    characterStats: { afflictionPerSecond: 30, afflictionEffectPercent: 0, igniteDamagePerAfflictionPercent: 1 },
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "deep-pain-level-16",
    capturedAt: "2026-09-15",
    aura: { name: "Deep Pain", level: 16, additionalDamageOverTimePercent: 31, afflictionPerSecond: 0 },
    damage: { spellDps: 383.52852358581, igniteDps: 8.572116 },
    expectedFactor: 1.31,
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "precise-deep-pain-20-aura-amplification-20",
    capturedAt: "2026-09-15T19:41:47",
    aura: { name: "Precise: Deep Pain", level: 20, baseAdditionalDamageOverTimePercent: 40, baseAfflictionPerSecond: 30 },
    support: { name: "Aura Amplification", level: 20, auraEffectPercent: 10 },
    effective: { additionalDamageOverTimePercent: 44, afflictionPerSecond: 33 },
    damage: { spellDps: 383.52852358581, igniteDps: 18.488644363636 },
    characterStats: { afflictionEffectPercent: 0, igniteDamagePerAfflictionPercent: 1 },
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "precise-deep-pain-20-long-night-global-aura-effect",
    capturedAt: "2026-09-15",
    aura: { name: "Precise: Deep Pain", level: 20, baseAdditionalDamageOverTimePercent: 40, baseAfflictionPerSecond: 30 },
    equipment: { name: "Long Night Sorcerer's Robe - Priceless", auraEffectPercent: 26 },
    effective: { additionalDamageOverTimePercent: 50.4, afflictionPerSecond: 37.8 },
    damage: { spellDps: 383.52852358581, igniteDps: 19.357699911111 },
    characterStats: { afflictionEffectPercent: 0, igniteDamagePerAfflictionPercent: 1 },
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "precise-deep-pain-20-combined-aura-effect",
    capturedAt: "2026-09-15",
    aura: { name: "Precise: Deep Pain", level: 20, baseAdditionalDamageOverTimePercent: 40, baseAfflictionPerSecond: 30 },
    support: { name: "Aura Amplification", level: 20, auraEffectPercent: 10 },
    equipment: { name: "Long Night Sorcerer's Robe - Priceless", auraEffectPercent: 26 },
    effective: { auraEffectPercent: 36, additionalDamageOverTimePercent: 54.4, afflictionPerSecond: 40.8 },
    damage: { spellDps: 383.52852358581, igniteDps: 19.897098858824 },
    characterStats: { afflictionEffectPercent: 0, igniteDamagePerAfflictionPercent: 1 },
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "deep-pain-16-combined-aura-effect",
    capturedAt: "2026-09-15",
    aura: { name: "Deep Pain", level: 16, baseAdditionalDamageOverTimePercent: 31, baseAfflictionPerSecond: 0 },
    support: { name: "Aura Amplification", level: 20, auraEffectPercent: 10 },
    equipment: { name: "Long Night Sorcerer's Robe - Priceless", auraEffectPercent: 26 },
    effective: { auraEffectPercent: 36, additionalDamageOverTimePercent: 42.16, afflictionPerSecond: 0 },
    damage: { spellDps: 383.52852358581, igniteDps: 9.30238176 },
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "cataclysm-level-19-no-aura",
    capturedAt: "2026-09-15",
    support: { name: "Cataclysm", level: 19, afflictionPerSecondOnDamage: 8, additionalAfflictionEffectPercent: 35.5 },
    damage: { spellDps: 383.52852358581, igniteDps: 6.5436 },
    characterStats: { afflictionPerSecond: 0, afflictionEffectPercent: 0, additionalAfflictionEffectPercent: 35.5, igniteDamagePerAfflictionPercent: 1.355 },
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "precise-deep-pain-20-long-night-cataclysm-19",
    capturedAt: "2026-09-15",
    aura: { name: "Precise: Deep Pain", level: 20, effectiveAdditionalDamageOverTimePercent: 50.4, afflictionPerSecond: 37.8 },
    support: { name: "Cataclysm", level: 19, afflictionPerSecondOnDamage: 8, additionalAfflictionEffectPercent: 35.5 },
    equipment: { name: "Long Night Sorcerer's Robe - Priceless", auraEffectPercent: 26 },
    damage: { spellDps: 383.52852358581, igniteDps: 22.735924467556 },
    characterStats: { afflictionPerSecond: 37.8, afflictionEffectPercent: 0, additionalAfflictionEffectPercent: 35.5, igniteDamagePerAfflictionPercent: 1.355 },
    projectedAfflictionRating: 96.6931216931217,
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "secondary-dark-gaze-integrated-affliction",
    capturedAt: "2026-09-15",
    equipment: { name: "Dark Gaze Scepter - Priceless", slot: "secondaryHand", baseIgniteDamage: [320, 590], damageOverTimePercent: 39, ailmentDamageEnhancementPercent: 48, fireSkillLevels: 2, spellSkillLevels: 3, afflictionPerSecond: 319 },
    aura: { name: "Precise: Deep Pain", level: 20, effectiveAdditionalDamageOverTimePercent: 50.4, afflictionPerSecond: 37.8 },
    support: { name: "Cataclysm", level: 19, additionalAfflictionEffectPercent: 35.5 },
    damage: { spellDps: 667.09064432179, fireSpellDamage: [106.3647801216, 197.0475734304], baseIgniteDamageMinimum: 335, igniteDps: 1602.7416065117 },
    characterStats: { afflictionPerSecond: 356.8, additionalAfflictionEffectPercent: 35.5, igniteDamagePerAfflictionPercent: 1.355 },
    projectedAfflictionRating: 99.64966367713005,
    observedSkillAndWeaponFactor: 1.7393508,
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "secondary-dark-gaze-level-16-scorching-beam",
    capturedAt: "2026-09-15",
    skill: { name: "Scorching Beam", baseLevel: 16, addedLevels: 5, effectiveLevel: 21 },
    equipment: { name: "Dark Gaze Scepter - Priceless", slot: "secondaryHand", sharedDamagePercent: 8 },
    damage: { spellDps: 455.63188601994, fireSpellDamage: [72.648576, 134.586144], baseIgniteDamageMinimum: 335, igniteDps: 1094.6940827209 },
    characterStats: { afflictionPerSecond: 356.8, additionalAfflictionEffectPercent: 35.5, igniteDamagePerAfflictionPercent: 1.355 },
    observedSkillAndWeaponFactor: 1.188,
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "main-hand-dark-gaze-level-16-scorching-beam",
    capturedAt: "2026-09-15",
    skill: { name: "Scorching Beam", baseLevel: 16, addedLevels: 3, effectiveLevel: 19 },
    equipment: { name: "Dark Gaze Scepter - Priceless", slot: "mainHand", baseIgniteDamage: [320, 590], damageOverTimePercent: 39, deepPainAuraEffectPercent: 120, ailmentDamageEnhancementPercent: 64, afflictionPerSecond: 141 },
    aura: { name: "Precise: Deep Pain", level: 20, auraEffectPercent: 146, effectiveAdditionalDamageOverTimePercent: 98.4, afflictionPerSecond: 73.8 },
    support: { name: "Cataclysm", level: 19, additionalAfflictionEffectPercent: 35.5 },
    damage: { spellDps: 319.75074662997, fireSpellDamage: [50.96, 94.472], baseIgniteDamageMinimum: 335, igniteDps: 1345.1540177277 },
    characterStats: { afflictionPerSecond: 214.8, additionalAfflictionEffectPercent: 35.5, igniteDamagePerAfflictionPercent: 1.355 },
    projectedAfflictionRating: 99.41806331471136,
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "main-hand-dark-gaze-level-20-scorching-beam",
    capturedAt: "2026-09-15",
    skill: { name: "Scorching Beam", baseLevel: 20, addedLevels: 3, effectiveLevel: 23, additionalDamageFactor: 1.331 },
    equipment: { name: "Dark Gaze Scepter - Priceless", slot: "mainHand" },
    damage: { spellDps: 510.47646489271, fireSpellDamage: [81.393312, 150.786328], baseIgniteDamageMinimum: 335, igniteDps: 1790.3999975956 },
    characterStats: { afflictionPerSecond: 214.8, additionalAfflictionEffectPercent: 35.5, igniteDamagePerAfflictionPercent: 1.355 },
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "dual-dark-gaze-integrated-affliction",
    capturedAt: "2026-09-15",
    skill: { name: "Scorching Beam", baseLevel: 20, addedLevels: 8, effectiveLevel: 28, additionalDamageFactor: 2.14358881 },
    equipment: { baseIgniteDamageMinimum: 640, damageOverTimePercent: 78, ailmentDamageEnhancementPercent: 112, intelligence: 16, afflictionPerSecond: 460, deepPainAuraEffectPercent: 120 },
    aura: { name: "Precise: Deep Pain", level: 20, auraEffectPercent: 146, effectiveAdditionalDamageOverTimePercent: 98.4, afflictionPerSecond: 73.8 },
    support: { name: "Cataclysm", level: 19, additionalAfflictionEffectPercent: 35.5 },
    damage: { spellDps: 887.89764759231, fireSpellDamage: [141.57152234185, 262.27032023586], baseIgniteDamageMinimum: 655, igniteDps: 9229.8812667824 },
    characterStats: { afflictionPerSecond: 533.8, additionalAfflictionEffectPercent: 35.5, igniteDamagePerAfflictionPercent: 1.355 },
    projectedAfflictionRating: 99.76582989883852,
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "dual-dark-gaze-three-source-deep-pain-aura-effect",
    capturedAt: "2026-09-15",
    skill: { name: "Scorching Beam", baseLevel: 20, addedLevels: 8, effectiveLevel: 28 },
    aura: { name: "Precise: Deep Pain", level: 20, globalAuraEffectPercent: 26, localAuraEffectPercent: 120, supportAuraEffectPercent: 10, observedAppliedAuraEffectPercent: 130, effectiveAdditionalDamageOverTimePercent: 92, afflictionPerSecond: 69 },
    support: { name: "Cataclysm", level: 19, additionalAfflictionEffectPercent: 35.5 },
    damage: { spellDps: 887.89764759231, fireSpellDamage: [141.57152234185, 262.27032023586], baseIgniteDamageMinimum: 655, igniteDps: 8932.0338144688 },
    characterStats: { auraEffectPercent: 26, afflictionPerSecond: 529, additionalAfflictionEffectPercent: 35.5, igniteDamagePerAfflictionPercent: 1.355 },
    projectedAfflictionRating: 99.76370510396976,
    status: "confirmed by Aura Amplification removal reversal",
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "dual-dark-gaze-increased-and-additional-affliction-effect",
    capturedAt: "2026-09-15",
    equipment: { belt: "Elder Sage Girdle - Priceless", auraEffectPercent: 34, afflictionEffectPercent: 50 },
    aura: { name: "Precise: Deep Pain", totalAuraEffectPercent: 154, effectiveAdditionalDamageOverTimePercent: 101.6, afflictionPerSecond: 76.2 },
    support: { name: "Cataclysm", level: 19, additionalAfflictionEffectPercent: 35.5 },
    damage: { spellDps: 887.89764759231, fireSpellDamage: [141.57152234185, 262.27032023586], baseIgniteDamageMinimum: 655, igniteDps: 12074.281811573 },
    characterStats: { afflictionPerSecond: 536.2, afflictionEffectPercent: 50, additionalAfflictionEffectPercent: 35.5, igniteDamagePerAfflictionPercent: 2.0325 },
    projectedAfflictionRating: 99.7668780305856,
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "dual-dark-gaze-increased-affliction-effect-only",
    capturedAt: "2026-09-15",
    equipment: { belt: "Elder Sage Girdle - Priceless", auraEffectPercent: 34, afflictionEffectPercent: 50 },
    aura: { name: "Precise: Deep Pain", totalAuraEffectPercent: 154, effectiveAdditionalDamageOverTimePercent: 101.6, afflictionPerSecond: 76.2 },
    damage: { spellDps: 887.89764759231, fireSpellDamage: [141.57152234185, 262.27032023586], baseIgniteDamageMinimum: 655, igniteDps: 9955.6982533136 },
    characterStats: { afflictionPerSecond: 536.2, afflictionEffectPercent: 50, additionalAfflictionEffectPercent: 0, igniteDamagePerAfflictionPercent: 1.5 },
    projectedAfflictionRating: 99.7668780305856,
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  },
  {
    id: "torturers-touch-affliction-effect-conversion",
    capturedAt: "2026-09-15",
    equipment: { gloves: "Torturer's Touch", afflictionPerSecondPerAfflictionEffectPercent: 0.25, beltAfflictionEffectPercent: 50 },
    damage: { spellDps: 887.89764759231, fireSpellDamage: [141.57152234185, 262.27032023586], baseIgniteDamageMinimum: 655, igniteDps: 9956.0159327609 },
    characterStats: { afflictionPerSecond: 548.7, afflictionEffectPercent: 50, additionalAfflictionEffectPercent: 0, igniteDamagePerAfflictionPercent: 1.5 },
    projectedAfflictionRating: 99.77218880991434,
    source: "UE_game.log RoleAttrMgr panel after zone reset"
  }
];
