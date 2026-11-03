export const selenaScorchingBeamTalentSetupSs13 = {
  season: "SS13",
  panels: [
    {
      name: "Goddess of Deception",
      pointsSpent: 26,
      coreTalents: [
        {
          name: "Affliction",
          unlockPoints: 12,
          effects: { afflictionPerSecond: 30, additionalAfflictionEffectPercent: 30 }
        },
        {
          name: "Subtle Impact",
          unlockPoints: 24,
          effects: { additionalDamageOverTimePercentWhileBlurActive: 30 }
        }
      ],
      allocatedNodes: [
        { coordinate: [4, 0], rank: 3, effectsPerRank: { afflictionPerSecond: 6, damageOverTimePercent: 9 } },
        { coordinate: [5, 0], rank: 3, effectsPerRank: { afflictionPerSecond: 12, damageOverTimePercent: 18 } },
        { coordinate: [1, 1], rank: 3, effectsPerRank: { movementSpeedPercent: 2, skillAreaPercent: 6 } },
        { coordinate: [2, 1], rank: 3, effectsPerRank: { movementSpeedPercent: 4, skillAreaPercent: 12 } },
        { coordinate: [3, 1], rank: 3, effectsPerRank: { damageOverTimePercent: 9 } },
        { coordinate: [4, 1], rank: 3, effectsPerRank: { damageOverTimePercent: 9, skillEffectDurationPercent: 2 } },
        { coordinate: [0, 2], rank: 3, effectsPerRank: { damagePercent: 9 } },
        { coordinate: [4, 2], rank: 3, effectsPerRank: { maxEnergyShieldPercent: 3 } },
        { coordinate: [5, 2], rank: 2, effectsPerRank: { maxEnergyShieldPercent: 4, energyShieldChargeSpeedPercent: 4 } }
      ],
      source: ""
    },
    {
      name: "Psychic",
      pointsSpent: 35,
      coreTalentReplacement: "Ethereal Prism: Fire's Allure",
      allocatedNodes: [
        { coordinate: [2, 0], rank: 2, effectsPerRank: { damageOverTimePercent: 9 } },
        { coordinate: [4, 0], rank: 3, effectsPerRank: { reapingRecoverySpeedPercent: 6 } },
        { coordinate: [5, 0], rank: 3, effectsPerRank: { reapingRecoverySpeedPercent: 12 } },
        { coordinate: [6, 0], rank: 1, effects: { focusBlessingStacksOnReap: 1 } },
        { coordinate: [3, 1], rank: 3, effectsPerRank: { afflictionPerSecond: 6, afflictionEffectPercent: 6 } },
        { coordinate: [4, 1], rank: 1, effects: { afflictionPerSecond: 18, enemyAllResistanceAtMaxAfflictionPercent: -8 } },
        { coordinate: [5, 1], rank: 3, effectsPerRank: { reapingDurationPercent: 12 } },
        { coordinate: [6, 1], rank: 1, effects: { startsEnergyShieldChargeOnReap: true, intervalSeconds: 2 } },
        { coordinate: [0, 2], rank: 3, effectsPerRank: { maxEnergyShieldPercent: 3 } },
        { coordinate: [1, 2], rank: 3, effectsPerRank: { maxEnergyShieldPercent: 6 } },
        { coordinate: [5, 2], rank: 1, replacedBy: "Ethereal Prism: Fire's Allure" },
        { coordinate: [3, 3], rank: 3, effectsPerRank: { reapingDurationPercent: 6 } },
        { coordinate: [4, 3], rank: 3, effectsPerRank: { reapingDurationPercent: 12 } },
        { coordinate: [5, 3], rank: 1, effects: { chanceToGainBlurOnReapPercent: 50 } },
        { coordinate: [2, 4], rank: 3, effectsPerRank: { afflictionEffectPercent: 6 } },
        { coordinate: [3, 4], rank: 1, effectsPerRank: { afflictionEffectPercent: 12 } }
      ],
      source: ""
    },
    {
      name: "Warlord",
      pointsSpent: 24,
      coreTalents: [
        {
          name: "Starfire",
          unlockPoints: 24,
          effects: { additionalIgniteLimit: 1, igniteSpreadsWithinMeters: 10, spreadIntervalSeconds: 0.3 }
        }
      ],
      allocatedNodes: [
        { coordinate: [0, 2], rank: 3, effectsPerRank: { maxLifePercent: 3, maxEnergyShieldPercent: 3 } },
        { coordinate: [1, 2], rank: 3, effectsPerRank: { maxLifePercent: 6, maxEnergyShieldPercent: 6 } },
        { coordinate: [4, 2], rank: 3, effectsPerRank: { firePenetrationAgainstIgnitedPercent: 2 } },
        { coordinate: [5, 2], rank: 1, effects: { inflictsFireInfiltrationAgainstIgnited: true } },
        { coordinate: [6, 3], rank: 1, effects: { igniteChanceAgainstNotIgnitedPercent: 40 } },
        { coordinate: [2, 4], rank: 3, effectsPerRank: { igniteChancePercent: 3 } },
        { coordinate: [3, 4], rank: 3, effectsPerRank: { igniteChancePercent: 6 } },
        { coordinate: [4, 4], rank: 3, effectsPerRank: { fireDamageOverTimePercent: 9, baseIgniteDamage: 10 } },
        { coordinate: [5, 4], rank: 3, effectsPerRank: { afflictionEffectPercent: 15, afflictionPerSecond: 8 } },
        { coordinate: [6, 4], rank: 1, effects: { additionalIgniteStacks: 1 } }
      ],
      source: ""
    },
    {
      name: "Lich",
      pointsSpent: 28,
      coreTalents: [
        {
          name: "Off The Beaten Track",
          unlockPoints: 24,
          effects: { supportSkillLevel: 4, fixedSupportSkillManaMultiplierPercent: 95 }
        }
      ],
      allocatedNodes: [
        { coordinate: [4, 0], rank: 3, effectsPerRank: { damagePercent: 9 } },
        { coordinate: [5, 0], rank: 3, effectsPerRank: { attackAndCastSpeedPercent: 6 } },
        { coordinate: [6, 0], rank: 1, effects: { allSkillLevels: 1 } },
        { coordinate: [0, 2], rank: 3, effectsPerRank: { maxLifePercent: 3, maxEnergyShieldPercent: 3 } },
        { coordinate: [1, 2], rank: 3, effectsPerRank: { maxLifePercent: 6, maxEnergyShieldPercent: 6 } },
        { coordinate: [2, 2], rank: 3, effectsPerRank: { maxEnergyShieldPercent: 3, energyShieldChargeSpeedPercent: 3 } },
        { coordinate: [3, 2], rank: 1, effects: { maxEnergyShieldPercent: 10, gainsBlurWhenEnergyShieldStartsCharging: true } },
        { coordinate: [3, 3], rank: 3, effectsPerRank: { blurEffectPercent: 1.5 } },
        { coordinate: [4, 3], rank: 1, effects: { movementSpeedWhileBlurPercent: 10, movementSpeedCannotFallBelowBaseWhileBlur: true } },
        { coordinate: [4, 4], rank: 3, effectsPerRank: { sealedManaCompensationPercent: 1.5 } },
        { coordinate: [5, 4], rank: 3, effectsPerRank: { sealedManaCompensationPercent: 3 } },
        { coordinate: [6, 4], rank: 1, effects: { sealedManaCompensationPercent: 8 } }
      ],
      source: ""
    }
  ],
  prism: {
    name: "Ethereal Prism: Fire's Allure",
    itemLevel: 89,
    plasticity: 3,
    installedPanel: "Psychic",
    replacesCoreTalentWith: "Fire's Allure",
    fireAllure: {
      inflictsScorchInsteadOfIgnite: true,
      nearbyRadiusMeters: 10,
      enemyFireResistancePerScorchStackPercent: -10
    },
    effectArea: { width: 3, height: 3 },
    activeAreaEffects: {
      legendaryMediumTalentCount: 4,
      blockRatioPercentPerTalent: 5,
      totalBlockRatioPercent: 20
    },
    randomAffixes: [
      { effect: "legendaryMediumTalentsInAreaGainBlockRatioPercent", value: 5 },
      {
        prerequisite: "twoLegendaryMediumTalentsActivatedInArea",
        effects: { gainsFortitudeOnMeleeSkillUse: 1, additionalMaximumFortitudeStacks: 1 }
      }
    ],
    source: ""
  },
  notes: [
    "Coordinates use zero-based [column, row] positions from each reference data Profession Tree SVG.",
    "effectsPerRank values are multiplied by the allocated rank; effects values apply once.",
    "The Fortitude-on-use prism affix does not trigger from Scorching Beam because it requires a Melee Skill.",
    "Fire's Allure currently affects four active Legendary Medium Talents in its 3x3 area, granting 20% Block Ratio in total.",
    "The observed 12.88 mana cost does not match a simple application of Off The Beaten Track's fixed 95% support multipliers; this remains unresolved."
  ]
};
