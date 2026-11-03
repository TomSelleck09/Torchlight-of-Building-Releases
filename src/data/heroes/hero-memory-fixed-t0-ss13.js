import { heroMemoryTierAffixesSs13 } from "./hero-memory-tiers-ss13.js";

// Hero Memory fixed affixes, T0 (ids ending in 00). The same effects occur for all three memory types. The
// additional-damage line belongs to the T0 variant. Values: game config_modifier, 2026-10-15
// (research/patch-ss14/game-diff.md "Hero Memory T0 fixed affixes"). Chunk 2, 2026-11-01: the "+2 to Hero Trait Level" and Ignite rows'
// additional damage, which that read could not reach and which kept +3%, are +6% as well (rows 402151200, 402153100, 402155000:
// value block after the hyperlink; 402176500, 402176800, 402177100: d2 of affix 101010117).
const originT0Effects = [
  "+2 to Hero Trait Level · +6% additional damage",
  "+(31–36)% Movement Speed",
  "+(5–6)% Max Fire Resistance",
  "+(5–6)% Max Cold Resistance",
  "+(5–6)% Max Lightning Resistance",
  "+(5–6)% Max Erosion Resistance",
  "+52% Skill Area",
  "+(60–68)% Critical Strike Damage",
  "+48% Projectile Speed",
  "+128% Critical Strike Rating",
  "+26% Attack Speed",
  "+26% Cast Speed",
  "+(32–48)% Affliction Effect",
  "+(42–52)% Reaping Recovery Speed",
  "+(70–84)% damage",
  "+(20–22)% Max Life",
  "+(20–22)% Max Energy Shield",
  "+(44–52)% Armor",
  "+(44–52)% Evasion",
  "+(44–49)% Minion Critical Strike Damage",
  "+128% Minion Critical Strike Rating",
  "+26% Minion Attack Speed",
  "+26% Minion Cast Speed",
  "+(70–84)% Minion Damage",
  "+(30–33)% Attack Block Chance",
  "+(30–33)% Spell Block Chance",
  "+(42–48)% chance to avoid Elemental Ailments",
  "Immune to Slow · +6% additional damage",
  "Immune to Blinding · +6% additional damage",
  "Immune to Weaken · +6% additional damage",
  "Immune to Paralysis · +6% additional damage",
  "(-96–-64)% Curse effect against you",
  "+16% Cooldown Recovery Speed",
  "Immune to Ignite Damage · -100% Ignite Effect received · +6% additional damage",
  "Immune to Wilt Damage · +6% additional damage",
  "Immune to Trauma Damage · +6% additional damage",
  // 402177700 / 402177800 / 402177900. Its T1 row "+10% Skill Effect Duration" (402177701 / 801 / 901, item level 86, weight
  // 103; reference data SS14 fixed table) joined src/data/heroes/hero-memory-tiers-ss13.js in the 2026-10-26 affix tier audit, so the
  // T0 is no longer its own base effect.
  "+16% Skill Effect Duration",
];
const T0_ONLY = new Set();

const affixKey = (effect) => effect.replace(/ · \+\d+% additional damage$/, "").replace(/[-+%()–\d.]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const originT1 = heroMemoryTierAffixesSs13.filter((entry) => entry.type === "Memory of Origin" && entry.kind === "Fixed Affix" && entry.tier === 1);

export const heroMemoryFixedT0AffixesSs13 = ["Memory of Origin", "Memory of Discipline", "Memory of Progress"].flatMap((type) =>
  originT0Effects.map((effect) => {
    const baseEffect = T0_ONLY.has(effect) ? effect : originT1.find((entry) => affixKey(entry.effect) === affixKey(effect))?.effect;
    if (!baseEffect) throw new Error(`Missing T1 Hero Memory fixed affix for ${effect}`);
    return { type, kind: "Fixed Affix", tier: 0, baseEffect, effect };
  }),
);
