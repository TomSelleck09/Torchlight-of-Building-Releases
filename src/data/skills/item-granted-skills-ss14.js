// Skills a legendary puts in the Main Skill slot: "Replaces the Main Skill with Lv. N <Skill>" (Immolating World, Necklace of
// Firebird). Hand-written from research/item-granted-main-skill-2026-10-26.md (§1, §6); the game files were only read.
//
// Sourced (game files, SS14 unless marked):
//   - grant rows: config_modifier 51528711 / 51528710 (Immolating World, server affixes 10056 / 10057, params stone 403007, level
//     20 / 23) and 51521541 / 51521540 (Necklace of Firebird, server affixes 10011 / 10027, params stone 1750, level 20 / 25);
//   - stone tags: config_skill_stone 403007 (True Flame Immolation) and 1750 (Barrier Burst), the u32 tag list; names from
//     skill_tag|des (6100202 "yuenvjiefang" and 6000415 "pingzhangbaolie" have no English name);
//   - timing: SkillEditor Split 382981 (True Flame Immolation: cast-speed type, use time 1 s, cooldown 0) and 841792 (Barrier
//     Burst: fixed speed type, use time 1 s, cooldown 0.4 s); no Mana cost on either stone;
//   - damage rows (SS13 config_skill_damage; no SS14 copy is extracted): group 1191, Cold, mode 3 (attribute 7040 "all Blessing
//     stack count", 23300 = 233 per stack), levels 1–20 identical; group 481, Fire, mode 7 (fight resource 23, 75%), levels
//     1–20 identical; +0x08 = 100 on both;
//   - tooltips: skill_des|des_config|4030070 and 17500 / 17501.
// Inferred (research §1): 233 per Focus + Tenacity stack consumed (the SS14 text; the SS13 row reads all Blessings, open);
// fight resource 23 = the full Barrier Shield at the moment the Barrier is gained, so 75% × the Barrier Shield per cast; added
// damage effectiveness 100%; past Lv. 20 the generic +10% / +8% per level (src/engine.js skillLevelDamageMultiplier).
export const ITEM_GRANTED_SKILLS_SS14 = Object.freeze({
  "True Flame Immolation": Object.freeze({
    name: "True Flame Immolation", item: 7352, stone: 403007, split: 382981, damageGroup: 1191,
    // Stone 403007's icon UI_Skill_juxingzhuiyi_zhenhuozhifen_Icon_128 (config_skill_stone), exported from the game paks
    // (Art/UI/Textures/Common/Icon/Skill/CommonSkill/128); reference data's page shows no skill icon.
    icon: "./src/assets/tli/catalog/UI_Skill_juxingzhuiyi_zhenhuozhifen_Icon_128.webp",
    grants: [
      { legendary: "Immolating World", modifierRow: 51528711, serverAffix: 10056, level: 20 },
      { legendary: "Immolating World", corroded: true, modifierRow: 51528710, serverAffix: 10057, level: 23 }
    ],
    role: "main",
    tags: ["Spell", "Area", "Fire", "Cold", "Elemental", "Hit", "Strength", "Intelligence", "Active"],
    // Spell, Area, Fire, Cold, Elemental, Hit, Strength, Intelligence, Active, 6100202 (Immolating World's trigger filter),
    // Triggerable, Cannot be supported by Activation Medium.
    gameTagIds: [6001100, 6000130, 6001030, 6001010, 6001180, 6001060, 6000001, 6000003, 6000200, 6100202, 6000081, 6000091],
    triggeredOnly: true,
    timing: { useTime: 1, speedType: "cast-speed", cooldown: 0, cdTimes: 0, source: "SkillEditor Split 382981 (use time 1 s, cast-speed type, cooldown 0; research/item-granted-main-skill-2026-10-26.md §1.2)" },
    hit: { perStack: 233, type: "Cold", stacks: ["Focus", "Tenacity"] },
    conversion: [{ from: "Cold", to: "Fire", percent: 100, source: "True Flame Immolation: Converts 100% of this skill's Cold Damage to Fire Damage (stone 403007 tooltip)" }],
    blessingRefill: { perCooldownRecoveryPercent: 2.5, blessings: ["Focus", "Tenacity"] },
    effects: [
      "Consumes all Focus Blessing and Tenacity Blessing stacks to deal Spell Cold Damage. Deals 233-233 Damage and +5% Skill Area for each stack of Focus Blessing or Tenacity Blessing consumed",
      "For every 1% Cooldown Recovery Speed, grants Focus Blessing and Tenacity Blessing equal to 2.5% of their Max Stacks after this skill is cast",
      "Converts 100% of this skill's Cold Damage to Fire Damage",
      "This skill cannot be supported by Activation Medium Skills",
      "This skill cannot be used",
      "This skill can only be triggered through Immolating World"
    ],
    source: "game files (research/item-granted-main-skill-2026-10-26.md)"
  }),
  "Barrier Burst": Object.freeze({
    name: "Barrier Burst", item: 7085, stone: 1750, split: 841792, damageGroup: 481,
    // Stone 1750's icon UI_Skill_BarrierDetonate_128 (config_skill_stone), exported from the game paks (same folder).
    icon: "./src/assets/tli/catalog/UI_Skill_BarrierDetonate_128.webp",
    grants: [
      { legendary: "Necklace of Firebird", modifierRow: 51521541, serverAffix: 10011, level: 20 },
      { legendary: "Necklace of Firebird", corroded: true, modifierRow: 51521540, serverAffix: 10027, level: 25 }
    ],
    role: "main",
    tags: ["Spell", "Area", "Fire", "Elemental", "Hit", "Strength", "Intelligence", "Active"],
    // Spell, Area, Fire, Elemental, Hit, Strength, Intelligence, Active, Triggerable, 6000415 (excluded by the other Main Skill
    // triggers), Cannot be supported by Activation Medium.
    gameTagIds: [6001100, 6000130, 6001030, 6001180, 6001060, 6000001, 6000003, 6000200, 6000081, 6000415, 6000091],
    triggeredOnly: true,
    timing: { useTime: 1, speedType: "fixed", cooldown: 0.4, cdTimes: 0, source: "SkillEditor Split 841792 (use time 1 s, fixed speed type, cooldown 0.4 s; research/item-granted-main-skill-2026-10-26.md §1.3)" },
    hit: { barrierPercent: 75, type: "Fire" },
    conversion: [],
    // Necklace of Firebird's own trigger (game affix 322245): on taking damage while a Barrier is up, cast the slot-1 skill
    // (filter tag 6000415), then remove the Barrier.
    trigger: { text: "When you have a Barrier, triggers the Main Skill upon taking damage, then removes Barrier", affix: 322245 },
    effects: [
      "Deals Spell Fire Damage equal to 75% of Barrier Rating to nearby enemies",
      "This skill can only be triggered through Necklace of Firebird"
    ],
    source: "game files (research/item-granted-main-skill-2026-10-26.md)"
  })
});

export const ITEM_GRANTED_SKILL_NAMES = Object.freeze(Object.keys(ITEM_GRANTED_SKILLS_SS14));
