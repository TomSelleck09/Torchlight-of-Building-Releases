// 
const regularFamilies = [
  ["All Stats", [
    "-20% All Stats\n+(98–100) to All Stats",
    "-15% All Stats\n+(72–75) to All Stats",
    "-10% All Stats\n+(47–50) to All Stats",
  ]],
  ["Minion Damage", [
    "Loses 50 Life and 80 Energy Shield every second\n+(24–25)% additional Minion Damage when Life or Energy Shield is 50% or higher",
    "Loses 30 Life and 50 Energy Shield every second\n+(18–20)% additional Minion Damage when Life or Energy Shield is 50% or higher",
    "Loses 15 Life and 30 Energy Shield every second\n+(13–15)% additional Minion Damage when Life or Energy Shield is 50% or higher",
  ]],
  ["Main Attack Skill", [
    "+2% Attack Speed for every Main Attack Skill cast recently. Stacks up to 6 time(s). At max stacks, this skill is guaranteed to deal Double Damage after every 4 cast(s) of the Main Attack Skill (except Sentry and Channeled Skills)",
    "+2% Attack Speed for every Main Attack Skill cast recently. Stacks up to 6 time(s). At max stacks, this skill is guaranteed to deal Double Damage after every 6 cast(s) of the Main Attack Skill (except Sentry and Channeled Skills)",
    "+1% Attack Speed for every Main Attack Skill cast recently. Stacks up to 6 time(s). At max stacks, this skill is guaranteed to deal Double Damage after every 6 cast(s) of the Main Attack Skill (except Sentry and Channeled Skills)",
  ]],
  ["Torment", [
    "Torment gains an additional effect: +4% additional Reaping Recovery Speed\nRestores (6–7)% of Missing Life and Energy Shield when gaining Torment. Interval: 0.3 s",
    "Torment gains an additional effect: +3% additional Reaping Recovery Speed\nRestores (4–5)% of Missing Life and Energy Shield when gaining Torment. Interval: 0.3 s",
    "Torment gains an additional effect: +2% additional Reaping Recovery Speed\nRestores (2–3)% of Missing Life and Energy Shield when gaining Torment. Interval: 0.5 s",
  ]],
  ["Spell Critical Strike Rating", [
    "1.4% Spell Critical Strike Rating for every 1 Intelligence. Up to +(205–210)%",
    "+1% Spell Critical Strike Rating for every 1 Intelligence. Up to +(148–160)%",
    "+1% Spell Critical Strike Rating for every 1 Intelligence. Up to +(96–110)%",
  ]],
  ["Numbed", [
    "Every 10 time(s) Lightning Damage is dealt, inflicts 5 stack(s) of Numbed on enemies within 10 m nearby. Interval: 0.5 s\n+5% Numbed Effect",
    "Every 10 time(s) Lightning Damage is dealt, inflicts 1 stack(s) of Numbed on enemies within 10 m nearby. Interval: 0.5 s\n+(4–5)% Numbed Effect",
    "Every 10 time(s) Lightning Damage is dealt, inflicts 1 stack(s) of Numbed on enemies within 10 m nearby. Interval: 0.5 s\n-10% Numbed Effect",
  ]],
  ["Frostbitten Critical Strike Rating", [
    "+(144–150) Critical Strike Rating against Frostbitten enemies",
    "+(104–110) Critical Strike Rating against Frostbitten enemies",
    "+(68–75) Critical Strike Rating against Frostbitten enemies",
  ]],
  ["Affliction Effect", [
    "For every enemy within 20 m nearby, +(18–20)% Affliction Effect, up to +120%",
    "For every enemy within 20 m nearby, +(13–15)% Affliction Effect, up to +90%",
    "For every enemy within 20 m nearby, +(8–10)% Affliction Effect, up to +60%",
  ]],
  ["Traumatized Armor Penetration", [
    "+(18–20)% Armor DMG Mitigation Penetration against Traumatized enemies",
    "+(13–15)% Armor DMG Mitigation Penetration against Traumatized enemies",
    "+(8–10)% Armor DMG Mitigation Penetration against Traumatized enemies",
  ]],
  ["Erosion to Deterioration", [
    "20% of the bonus to Erosion Damage also applied to Deterioration Damage, up to +40%",
    "15% of the bonus to Erosion Damage also applied to Deterioration Damage, up to +(27–30)%",
    "10% of the bonus to Erosion Damage also applied to Deterioration Damage, up to +(18–20)%",
  ]],
  ...["Origin", "Progress", "Discipline"].map((type) => [`${type} Base Trait Slot`, [
    `Base Traits now have Base Trait slots that can be installed with a Epic or lower ${type} Memory. Base Stats and the value of Random Affixes of the Memory installed in this slot: (-60–-55)%`,
    `Base Traits now have Base Trait slots that can be installed with a Rare or lower ${type} Memory. Base Stats and the value of Random Affixes of the Memory installed in this slot: (-35–-30)%`,
  ]]),
];

export const regularRevivedAffixesSs13 = regularFamilies.flatMap(([name, effects]) =>
  effects.map((effect, index) => ({ name, tier:index + 1, effect }))
);
export const regularRevivedAffixNamesSs13 = regularFamilies.map(([name]) => name);
export const revivedAffixTiers = (name) => regularRevivedAffixesSs13.filter((entry) => entry.name === name);
export function revivedAffixRollRange(effect) {
  const match = effect?.match(/\((-?\d+)[–-](-?\d+)\)/);
  return match ? { min:Number(match[1]), max:Number(match[2]) } : null;
}

export const lunarPhaseRevivedAffixesSs13 = [
  "Hero's Resourcefulness", "Furious Roar", "Ancestral Hate", "Starfall Wasteland",
  "Between the Holy Land and Hell", "Mercury Purged", "Telepathy Expert", "Fifth Cosmic Velocity",
  "To Myself in Another Spacetime", "Private Universe", "Artificial Moon: Origin",
  "Artificial Moon: Discipline", "Artificial Moon: Progress", "Discord of the Second Will",
  "Omni-Elixir Side Effect", "Basic Pharmacology Manuscript", "Soft Storm", "Blowing Breeze",
  "Nourishing Spring Rain", "Nature's Party", "Machine's Joy", "Peril of Synthetic Troops",
  "Three-Chambered Heart", "First Flake of Strange Snow", "Sweet Pain", "Royal Arsenal",
  "Into the Night", "Self-Imposed Shackles", "Cat's Night Safari", "Charging Tail",
  "Vengeful Night Wraith", "The Place of Oracle", "Crossing the Divine Threshold",
  "Inverted Shrine", "Bing's Big Bang Pack", "Genius Idea Generator", "Ceaseless Tide",
  "Radical Evolution Theory: Cruelty", "Radical Evolution Theory: Spell Amplification",
  "Radical Evolution Theory: Radical Order", "Radical Evolution Theory: Deep Pain",
  "Reactive Rainbow", "Approaching Nightfall", "Red Shoes of Cruelty",
  // SS14 (2026-10-15; reference data Memory_Revival lists it as a Special Random Affix): Youga – The Ultimate One's extra tree pick
  // (src/hero-trait-tree.js).
  "+1 Max Youga Count in the Universe",
  // reference data Memory_Revival (research/refdata-ss14/fetch-cache/en_Memory_Revival.html, 2026-10-15): Oracle Thea – Wisdom of The
  // Gods now has three Place of Oracle affixes, one per Blessing. "The Place of Oracle" above (the SS13 affix, no longer on
  // the page) stays so saved memories keep it.
  "The Place of Oracle: Agility", "The Place of Oracle: Focus", "The Place of Oracle: Tenacity",
];

export function normalizeRevivedAffix(effect) {
  return regularRevivedAffixesSs13.find((entry) => entry.effect === effect)?.name || effect;
}

export function baseTraitMemoryReductionRange(rarity) {
  if (rarity?.toLowerCase() === "ultimate") return { min:-60, max:-60 };
  return rarity?.toLowerCase() === "legendary" ? { min:-60, max:-55 } : { min:-35, max:-30 };
}

// The slot's reduction is the opening memory's own revived roll (its text reads "Base Stats and the additional value of Random Affixes
// of the Memory installed in this slot: -57%"), clamped to the tier's range, the range's max when the roll is missing (user report
// 2026-11-13: a separate hero.baseTraitMemoryRoll had been set to the max on equip and read instead). Artificial Moon is fixed at -60.
function withSlotReduction(slot) {
  const range = slot.reductionRange, roll = slot.source?.revivedRoll;
  const value = roll === null || roll === undefined || roll === "" || !Number.isFinite(Number(roll)) ? range.max : Number(roll);
  return { ...slot, reduction: Math.max(range.min, Math.min(range.max, value)) };
}
const memoryRarityOrder = ["normal", "magic", "epic", "legendary", "ultimate"];
export function baseTraitSlotFromMemory(memory) {
  if (!memory) return null;
  const name = normalizeRevivedAffix(memory.revivedAffix || "");
  const moon = name === "Artificial Moon" ? memory.type?.replace(/^Memory of /, "") : name.match(/^Artificial Moon: (Origin|Progress|Discipline)$/)?.[1];
  if (moon) return withSlotReduction({ source:memory, memoryType:`Memory of ${moon}`, maxRarity:"ultimate", reductionRange:baseTraitMemoryReductionRange("ultimate") });
  const regular = name.match(/^(Origin|Progress|Discipline) Base Trait Slot$/);
  if (!regular) return null;
  const tier = Number(memory.revivedTier) === 2 ? 2 : 1;
  // The caps are the game's quality numbers (rows 500101600 "10035{P1:4…}", 500101601 "10045{P1:3…}"; Artificial Moon P1:5): 4 is the
  // game's Epic, stored "legendary", and 3 the game's Rare, stored "epic" (src/affix-tier-eligibility.js MEMORY_RARITIES). Chunk 2,
  // 2026-11-01: they read one rarity too low since the stored keys kept their older names.
  return withSlotReduction({ source:memory, memoryType:`Memory of ${regular[1]}`, maxRarity:tier === 1 ? "legendary" : "epic", reductionRange:tier === 1 ? {min:-60,max:-55} : {min:-35,max:-30} });
}
export function equippedBaseTraitSlot(hero = {}) {
  const ids = new Set(Object.values(hero.equippedMemoryIds || {}));
  return (hero.memoryInventory || []).filter((memory) => ids.has(memory.id)).map(baseTraitSlotFromMemory).find(Boolean) || null;
}
// The slot comes from a revived memory and the game installs one revived memory (manual 2003030133, Func_AwakenS14_Text09), so the slot's
// memory is not revived at all: no revived affix, no Wax and Wane, no Rising Moon (chunk 2, 2026-11-01; before, only the affix was checked).
const revivedInAnyWay = (memory) => Boolean(memory.revivedAffix || memory.waxAndWane || memory.risingMoon);
export function memoryFitsBaseTraitSlot(memory, slot, equippedIds = []) {
  return Boolean(memory && slot && memory.type === slot.memoryType && memory.id !== slot.source.id &&
    memoryRarityOrder.indexOf(String(memory.rarity || "normal").toLowerCase()) >= 0 &&
    memoryRarityOrder.indexOf(String(memory.rarity || "normal").toLowerCase()) <= memoryRarityOrder.indexOf(slot.maxRarity) &&
    !revivedInAnyWay(memory) && !equippedIds.includes(memory.id));
}

export function revivedAffixForMemoryType(effect, memoryType, tier, roll) {
  const name = normalizeRevivedAffix(effect);
  const entries = revivedAffixTiers(name);
  if (entries.length) {
    const selected = entries.find((entry) => entry.tier === tier)
      || entries.find((entry) => entry.effect === effect)
      || entries[0];
    const range = revivedAffixRollRange(selected.effect);
    return range && Number.isFinite(roll)
      ? selected.effect.replace(/\(-?\d+[–-]-?\d+\)/, String(Math.max(range.min, Math.min(range.max, roll))))
      : selected.effect;
  }
  return effect;
}
