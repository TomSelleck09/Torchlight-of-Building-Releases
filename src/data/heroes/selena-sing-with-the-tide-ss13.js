export const selenaSingWithTheTideSs13 = {
  hero: "Tide Whisper Selena",
  trait: "Sing with the Tide",
  season: "SS13",
  baseTrait: {
    level: 5,
    canSwitchBetweenBardAndLoudSong: true,
    bubbleBaseTideDurationSeconds: 6,
    additionalDamageTakenByEnemiesOnTidePercentByLevel: [0, 5, 10, 15, 20],
    artificialMoonAtMaximumLevel: {
      skillAreaPercentWhileOnTide: 10,
      skillEffectDurationPercentWhileOnTide: 15
    }
  },
  baseStates: {
    bard: {
      cannotUseAttackChanneledSkills: true,
      cannotUseAttackMobilitySkills: true,
      canMoveWhileChannelingSpells: true,
      autoChannelsMainSkillWhileMoving: true,
      additionalChanneledSkillDamagePercent: -20,
      nonInstantNonMobilitySkillsChannelBardSong: true
    },
    loudSong: {
      additionalAttackAndCastSpeedPercent: -20,
      additionalMovementSpeedPercent: -20,
      additionalTideEffectPercent: 80
    },
    tide: {
      additionalDamagePercent: 15,
      ignoresEnemyPhysicalCollision: true,
      maximumPlacedTides: 3,
      baseEffectDurationSeconds: 4
    }
  },
  choices: {
    level45: [
      { name: "Undersea Ballad", valuesByTraitLevel: { tideEffectFromSkillAreaCapPercent: [90, 100, 110, 120, 130] } },
      { name: "Wave Aria", valuesByTraitLevel: { additionalDamageAgainstEnemiesOnTidePercent: [10, 13, 16, 19, 22] } }
    ],
    level60: [
      { name: "Sea Foam Nocturne", valuesByTraitLevel: { tideEffectPerChannelStackPercent: [16, 18, 20, 22, 24] } },
      { name: "Idyll of the Tide", valuesByTraitLevel: { additionalDamagePerMeterPercent: [1, 1.3, 1.6, 1.9, 2.2] }, maximumStacks: 15 }
    ],
    level75: [
      { name: "Chantey of Sinking", valuesByTraitLevel: { tideAreaAndEffectPerSecondPercent: [35, 45, 55, 65, 75] }, maximumStacks: 2 },
      { name: "Murmurs of the Distant Tide", valuesByTraitLevel: { bardTideDurationPercent: [-50, -50, -50, -50, -40], additionalTideEffectPercent: [60, 70, 80, 90, 100] } }
    ]
  },
  selected: [
    { name: "Wave Aria", traitLevel: 3 },
    { name: "Idyll of the Tide", traitLevel: 3 },
    { name: "Murmurs of the Distant Tide", traitLevel: 3 }
  ],
  source: ""
};

export const ceaselessTideSs13 = {
  name: "Ceaseless Tide",
  type: "revivedHeroMemoryAffix",
  exclusiveTo: "Tide Whisper Selena | Sing with the Tide",
  rules: {
    deemedLoudSongWhileBard: true,
    loudSongMovementSpeedPenaltyRemoved: true,
    loudSongAttackAndCastSpeedPenaltyRemoved: false
  },
  source: ""
};
