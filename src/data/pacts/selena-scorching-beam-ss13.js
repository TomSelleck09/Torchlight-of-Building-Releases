export const selenaScorchingBeamPactsSs13 = {
  season: "SS13",
  pactspirits: [
    {
      name: "Preserver of Eternity",
      rank: 4,
      category: "Survival Legendary",
      effectsAtRank: [
        "+30% Movement Speed if you haven't been hit recently",
        "+6% Movement Speed",
        "+10% Movement Speed",
        "-4% additional damage taken"
      ],
      selectedOuterNode: "Graceful Pace",
      unreplacedNativeNodes: [
        { name: "Elemental Resistance II", quantity: 1, effectsPerNode: { elementalResistancePercent: 5 } },
        { name: "Damage Avoidance I", quantity: 1, effectsPerNode: { damageAvoidanceChancePercent: 1.5 } }
      ],
      source: ""
    },
    {
      name: "Abyssal King Soul",
      rank: 3,
      category: "Persistent Legendary",
      effectsAtRank: [
        "35% chance for Damage Over Time to spread to targets in Proximity",
        "+25% additional Reaping Recovery Speed",
        "+10% Movement Speed if you have caused Reaping recently",
        "+2% additional damage"
      ],
      selectedOuterNode: "Unholy Throne",
      unreplacedNativeNodes: [
        { name: "Reaping Cooldown I", quantity: 2, effectsPerNode: { reapingRecoverySpeedPercent: 5 } },
        { name: "Damage Over Time I", quantity: 1, effectsPerNode: { damageOverTimePercent: 12 } },
        { name: "Damage Affliction I", quantity: 2, effectsPerNode: { afflictionEffectPercent: 10 } },
        { name: "Reaping Cooldown II", quantity: 1, effectsPerNode: { reapingRecoverySpeedPercent: 10 } },
        { name: "Damage Affliction II", quantity: 1, effectsPerNode: { afflictionEffectPercent: 20 } }
      ],
      source: ""
    },
    {
      name: "Knight of Pale Blue",
      rank: 6,
      category: "Survival Legendary",
      effectsAtRank: [
        "-55% additional Physical Damage taken when there is only 1 enemy Nearby",
        "-4% additional damage taken",
        "-8% additional damage taken",
        "-4% additional damage taken"
      ],
      selectedOuterNode: "Sound Body",
      unreplacedNativeNodes: [
        { name: "Elemental Resistance I", quantity: 1, effectsPerNode: { elementalResistancePercent: 2.5 } },
        { name: "Damage Mitigation I", quantity: 2, effectsPerNode: { additionalDamageTakenPercent: -1.5 } },
        { name: "Elemental Resistance II", quantity: 1, effectsPerNode: { elementalResistancePercent: 5 } },
        { name: "XP Bonus II", quantity: 1, effectsPerNode: { experienceEarnedPercent: 6 } }
      ],
      totalGeneralAdditionalDamageTakenPercent: -16,
      source: ""
    }
  ],
  kismets: [
    {
      name: "Kismet: Volcano",
      quantity: 4,
      effectsPerKismet: {
        chanceToIgniteTargetsPercentRange: [-25, -20],
        additionalIgniteDurationPercentRange: [-25, -20],
        igniteLimit: 1
      },
      rolls: [
        { chanceToIgniteTargetsPercent: -21, additionalIgniteDurationPercent: -21, igniteLimit: 1 },
        { chanceToIgniteTargetsPercent: -23, additionalIgniteDurationPercent: -23, igniteLimit: 1 },
        { chanceToIgniteTargetsPercent: -23, additionalIgniteDurationPercent: -23, igniteLimit: 1 },
        { chanceToIgniteTargetsPercent: -25, additionalIgniteDurationPercent: -25, igniteLimit: 1 }
      ],
      knownTotalEffects: {
        chanceToIgniteTargetsPercent: -92,
        additionalIgniteDurationPercent: -92,
        igniteLimit: 4
      },
      source: ""
    }
  ],
  microFates: [
    {
      name: "Micro Fate: Reaping Duration",
      quantity: 5,
      valuesPercent: null,
      totalPercent: 60,
      databaseRangePercent: [10, 13]
    },
    {
      name: "Micro Fate: Spell Block Chance",
      quantity: 1,
      valuesPercent: [6],
      totalPercent: 6,
      databaseRangePercent: [6, 8]
    },
    {
      name: "Micro Fate: Attack Block Chance",
      quantity: 2,
      valuesPercent: [6, 8],
      totalPercent: 14,
      databaseRangePercent: [6, 8]
    }
  ],
  knownFateTotals: {
    reapingDurationPercent: 60,
    spellBlockChancePercent: 6,
    attackBlockChancePercent: 14,
    igniteLimit: 4
  },
  unreplacedNativeNodeTotals: {
    elementalResistancePercent: 12.5,
    damageAvoidanceChancePercent: 1.5,
    reapingRecoverySpeedPercent: 20,
    damageOverTimePercent: 12,
    afflictionEffectPercent: 40,
    additionalDamageTakenPercent: -3,
    experienceEarnedPercent: 6
  },
  notes: [
    "The five individual Reaping Duration rolls were not supplied; their user-confirmed total is 60%.",
    "The four Volcano rolls are 21%, 23%, 23%, and 25%; each applies the same penalty to Ignite chance and additional Ignite Duration.",
    "Unreplaced native nodes were identified by matching their artwork in the full Pact screenshot to the reference data Pactspirit pages.",
    "Selected outer nodes are represented by each Pactspirit's rank-scaled effectsAtRank and are not added a second time."
  ]
};
