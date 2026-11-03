export const selenaScorchingBeamGearSs13 = {
  season: "SS13",
  captureDate: "2026-08-31",
  items: [
    {
      slot: "helmet", name: "Sun's Embrace", level: 89, base: "STR Helmet", energy: 61,
      corrupted: true, defenses: { armor: 4783 },
      modifiers: ["+3168 Gear Armor", "+30% chance to Ignite targets", "+2 Ignite limit\nInflicts 2 additional stacks of Ignite", "Additionally increases Ignited enemies' Fire Resistance by 100%"],
      legendaryModifiers: ["+3168 Gear Armor", "+30% chance to Ignite targets", "+2 Ignite limit\nInflicts 2 additional stacks of Ignite", "Additionally increases Ignited enemies' Fire Resistance by 100%"],
      corrodedModifierIndices: [2]
    },
    {
      slot: "chest", name: "Long Night Sorcerer's Robe - Priceless", level: 100, base: "INT Chest Armor", energy: 116,
      defenses: { maxEnergyShield: 853 },
      modifiers: ["+8% Aura Effect", "-40% additional Damage Over Time taken when you have at least 8000 Max Energy Shield", "+54% Gear Energy Shield", "+384 Gear Energy Shield", "+18% Aura Effect", "+19% Lightning Resistance", "+24% Fire Resistance"]
    },
    {
      slot: "necklace", name: "Coldness Tracer's Tear", level: 90, base: "Necklace", corrupted: true,
      modifiers: ["+30% chance to inflict Damaging Ailments", "+11% Elemental Resistance", "+41% Ailment Damage Enhancement", "Immune to Frostbite"],
      implicitModifiers: ["+8 Dexterity"],
      legendaryModifiers: ["+30% chance to inflict Damaging Ailments", "+11% Elemental Resistance", "+41% Ailment Damage Enhancement", "Immune to Frostbite"],
      corrosionModifiers: ["You can cast 1 additional Curses"]
    },
    {
      slot: "gloves", name: "Torturer's Touch", level: 89, base: "DEX Gloves", energy: 59, corrupted: true,
      defenses: { evasion: 3304, gearEnergyShield: 331 },
      modifiers: ["+1527 Gear Evasion", "+12% Injury Buffer", "+1 Affliction per Second for every +4% Affliction Effect", "Reaps 1.3 s of Damage Over Time from Nearby enemies within 10 m that have full Affliction; 1 s recovery against the same target", "Reaping removes enemy's Affliction"]
    },
    {
      slot: "belt", name: "Elder Sage Girdle - Priceless", level: 100, base: "Belt",
      defenses: { maxEnergyShield: 140 },
      beltBlendModifiers: ["+8% Aura Effect", "Poisoned Relief"],
      prefixModifiers: ["-15% additional damage taken at Low Mana", "+1 Ignite limit", "+308 Max Energy Shield"],
      suffixModifiers: ["+50% Affliction Effect", "+9% Elemental Resistance", "+14% chance to avoid Elemental Ailments", "+18% Erosion Resistance"],
      modifiers: ["+8% Aura Effect", "Poisoned Relief", "-15% additional damage taken at Low Mana", "+1 Ignite limit", "+308 Max Energy Shield", "+50% Affliction Effect", "+9% Elemental Resistance", "+14% chance to avoid Elemental Ailments", "+18% Erosion Resistance"]
    },
    {
      slot: "boots", name: "Valerie's Night Stroll", level: 90, base: "DEX Boots", energy: 60, corrupted: true,
      defenses: { evasion: 5472 },
      modifiers: ["+3552 Gear Evasion", "Blur gains an additional effect: +0.75% additional Damage Over Time for each Blur Rating", "Refreshes Blur upon gaining Blur; interval 1 s", "Stealth Stab", "+40% Movement Speed"]
    },
    {
      slot: "leftRing", name: "Vorax Limb: Digits", level: 90, base: "Vorax Gear",
      modifiers: ["+2 Spell Skill Level", "+58% damage", "+251 Max Energy Shield", "+1 Ignite limit", "+5% additional Ignite Damage", "+126% Critical Strike Rating", "Feline Steps: +22% Reaping Recovery Speed for every stack of any Blessing; stacks up to 12 times", "Feline Steps: +39% Movement Speed"]
    },
    {
      slot: "rightRing", name: "Folklore of Locking Fingers", level: 89, base: "Ring", corrupted: true,
      modifiers: ["+6% Erosion Resistance", "+10% Max Life and Max Energy Shield", "+20% Blur Effect", "Grants 9 Blur Rating per second when equipped in the right Ring slot", "Blur gains an additional effect: +2.5% Damage Over Time for every 1 Blur Rating"]
    },
    {
      slot: "mainHand", name: "Dark Gaze Scepter - Priceless", level: 100, base: "Scepter", energy: 61,
      modifiers: ["+39% Damage Over Time", "+1 to Max Tenacity Blessing Stacks", "+120% Deep Pain Aura", "-20% additional Deep Pain Sealed Mana Compensation", "+523 Max Energy Shield", "+141 Affliction inflicted per second", "+3 Fire Skill Level", "+64% Ailment Damage Enhancement", "+142% Reaping Recovery Speed", "Adds 320–590 Base Ignite Damage"]
    },
    {
      slot: "secondaryHand", name: "Dark Gaze Scepter - Priceless", level: 100, base: "Scepter", energy: 59,
      modifiers: ["+39% Damage Over Time", "+16 Intelligence", "+160 Affliction inflicted per second", "+2 Fire Skill Level", "+3 Spell Skill Level", "+159 Affliction inflicted per second", "+48% Ailment Damage Enhancement", "Adds 320–590 Base Ignite Damage", "+80% Reaping Duration"]
    }
  ],
  notes: [
    "Modifier text is transcribed from the user's screenshots and retained verbatim where its calculation semantics are not yet modeled.",
    "The helmet's Ignited-enemy Fire Resistance modifier is intentionally not normalized until its exact game behavior is verified."
  ]
};
