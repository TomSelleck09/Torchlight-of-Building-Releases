export const selenaScorchingBeamSlatesSs13 = {
  season: "SS13",
  statue: "Statue of The New God",
  capturedLayout: "Screenshot 2026-09-01 075244.png",
  slates: [
    {
      id: "judgment", position: [2, 2], size: [4, 4], shape: [[0,0],[3,0],[3,3]], overlay: true, icon: "./src/assets/tli/slates/game-captures/nether-king-judgment.png", name: "Nether King's Divinity: Judgment", level: 90, rarity: "legendary", direction: "Clockwise",
      fixed: ["Adds 5–5 Base Ignite Damage"],
      brands: ["+1.2% Erosion Damage per stack of Wilt inflicted, up to 60 stacks", "+20% chance to gain Blur when inflicting crowd control effects", "+16% Blur Effect"],
      authority: "Judgment Activated",
      authorityEffect: "Divinity Slates on links between Divinities have 70% increased affix effect",
      tooltipScreenshots: ["Screenshot 2026-09-14 211101.png", "Screenshot 2026-09-14 211117.png"]
    },
    { id: "pedigree", position: [2, 4], size: [3, 3], shape: [[0,0],[1,0],[0,1],[1,1],[2,1],[1,2],[2,2]], icon: "./src/assets/tli/slates/pedigree-captured.webp", capturedRotation: 0, name: "Pedigree of Gods", level: 85, rarity: "legendary", fixed: ["+8 Dexterity", "+6% Attack Speed", "−4 Skill Cost", "Barrier of Radiance", "Daze"] },
    { id: "fallen-native", position: [5, 1], size: [1, 2], icon: "./src/assets/tli/slates/fallen-native-captured.webp", capturedRotation: 0, name: "Fallen Starlight", level: 86, rarity: "legendary", fixed: ["+6% Minion Damage", "+15% Bond Gaining Speed", "+9% Area Damage", "Gain 1 Tenacity Blessing stack every 1 second while having Barrier", "Inflicts 1 additional stack of Ignite"] },
    { id: "corner-life", position: [5, 3], size: [2, 2], shape: [[0,0],[0,1],[1,1]], initialRotation: 270, capturedRotation: 270, icon: "./src/assets/tli/slates/corner-life-captured.webp", name: "A Corner of Divinity", level: 81, rarity: "legendary", fixed: ["13.6% additional damage applied to Life", "Minions deal 13.6% additional damage to Life", "Inflicts 2 additional stacks of Ignite"], amplifiedPercent: 70 },
    {
      id: "moth-fire", position: [3, 3], size: [1, 1], icon: "./src/assets/tli/slates/moth-fire-captured.webp", capturedRotation: 0, name: "Sparks of Moth Fire", level: 82, rarity: "legendary",
      copyRule: "Copies the last Talent on the adjacent slate below; cannot copy Core Talents",
      copyStatus: "resolved-from-talents-affected-popup",
      copiedTalents: ["Inflicts 1 additional stack of Ignite"],
      resolvedCopiedTotals: { additionalIgniteStacks: 1 }
    },
    { id: "fallen-focus", position: [4, 4], size: [1, 2], initialRotation: 90, capturedRotation: 0, icon: "./src/assets/tli/slates/fallen-focus-captured.webp", name: "Fallen Starlight", level: 86, rarity: "legendary", fixed: ["+2.55% chance to avoid damage", "+15.3% Minion Damage", "+2 Max Focus Blessing Stacks", "Inflicts 2 additional stacks of Ignite"], amplifiedPercent: 70 },
    { id: "corner-tenacity", position: [1, 5], size: [2, 2], shape: [[0,0],[0,1],[1,1]], initialRotation: 180, capturedRotation: 180, icon: "./src/assets/tli/slates/corner-tenacity-captured.webp", name: "A Corner of Divinity", level: 86, rarity: "legendary", fixed: ["+2 Max Tenacity Blessing Stacks", "Inflicts 2 additional stacks of Ignite"], amplifiedPercent: 70 },
    { id: "fallen-block", position: [3, 5], size: [1, 2], initialRotation: 90, capturedRotation: 90, icon: "./src/assets/tli/slates/fallen-block-captured.webp", name: "Fallen Starlight", level: 86, rarity: "legendary", fixed: ["+2.125% Energy Shield Regain", "+3.4% additional Max Damage", "+3.4% additional Max Damage for Minions", "+8.5% Block Ratio · Restores 1.7% Missing Life and Energy Shield when Blocking"], amplifiedPercent: 70 },
    {
      id: "prairie-ablaze", position: [6, 4], size: [1, 1], icon: "./src/assets/tli/slates/prairie-ablaze-captured.webp", capturedRotation: 0, name: "When Sparks Set the Prairie Ablaze", level: 85, rarity: "legendary",
      copyRule: "Copies the last Talent on all adjacent slates; cannot copy Core Talents",
      copyStatus: "resolved-from-talents-affected-popup",
      copiedTalents: [
        "Inflicts 1 additional stack of Ignite",
        "Inflicts 1 additional stack of Ignite",
        "+4% additional Fire Damage",
        "+8% chance to Ignite targets",
        "Inflicts 1 additional stack of Ignite"
      ],
      resolvedCopiedTotals: { additionalIgniteStacks: 3, additionalFireDamagePercent: 4, chanceToIgniteTargetsPercent: 8 }
    }
  ],
  capturedPlacements: {
    judgment: { column: 2, row: 2, rotation: 0 },
    pedigree: { column: 2, row: 4, rotation: 0 },
    "fallen-native": { column: 1, row: 3, rotation: 0 },
    "corner-life": { column: 2, row: 2, rotation: 270 },
    "moth-fire": { column: 3, row: 1, rotation: 0 },
    "fallen-focus": { column: 4, row: 1, rotation: 0 },
    "corner-tenacity": { column: 5, row: 3, rotation: 180 },
    "fallen-block": { column: 4, row: 4, rotation: 90 },
    "prairie-ablaze": { column: 4, row: 3, rotation: 0 }
  },
  notes: [
    "The list preserves the values displayed by the equipped tooltips, including effects marked Effect:(+70%).",
    "Both copy-slate bonuses were resolved from the user's in-game Talents Affected popups."
  ]
};
