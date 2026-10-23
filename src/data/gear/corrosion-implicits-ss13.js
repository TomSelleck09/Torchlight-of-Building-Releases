// Generated from the Corrosion Base tables on the individual TLIDB equipment pages.
// Run: node scripts/build-corrosion-bases.mjs
import { legendaryBasesSs14 } from "./legendary-bases-ss14.generated.js";
const rawPools={
  "Belt": [
    "+(3–5)% Max Elemental Resistance",
    "Restoration Skills: +(30–40)% Restoration Effect",
    "Restoration Skills: (-20–-15)% Restoration Duration",
    "+(20–30)% Deep Pain Aura",
    "+(20–30)% Spell Amplification Aura",
    "Immune to crowd control effects",
    "+(20–30)% Cruelty Aura Effect",
    "+(20–30)% Radical Order Aura Effect",
    "(-50–-40)% additional Damage Over Time taken when an Elixir Skill is active",
    "Owns 1 additional stack(s) of Fortitude"
  ],
  "Bow": [
    "+(6–12)% chance to gain 1 stack of Agility Blessing on defeat",
    "Damage Penetrates (8–12)% Elemental Resistance",
    "Adds (7–10) - (14–17) Physical Damage to the gear",
    "+(15–25)% Gear Physical Damage",
    "+(5–8)% gear Attack Speed",
    "+(3–6)% Attack Critical Strike Rating for this gear",
    "+(40–45)% Elemental Damage",
    "+(1–2) Projectile Skill Level",
    "+(15–20)% Projectile Speed"
  ],
  "Cane": [
    "+(5–8)% chance to trigger the Main Spell Skill 1 additional time when using it",
    "+(4–8)% chance to gain 1 stack of Focus Blessing on defeat",
    "Damage Penetrates (5–8)% Elemental Resistance",
    "+(10–16)% Cast Speed",
    "+(20–30)% Spell Damage",
    "+(30–40)% Spell Critical Strike Rating",
    "+(25–32)% Critical Strike Damage",
    "+(6–10)% Cooldown Recovery Speed",
    "Adds (5–8)% of Elemental Damage as Erosion Damage"
  ],
  "Claw": [
    "+(4–8)% chance to gain 1 stack of Agility Blessing on defeat",
    "Damage Penetrates (5–8)% Elemental Resistance",
    "Adds (2–4) - (8–10) Physical Damage to the gear",
    "+(15–25)% Gear Physical Damage",
    "+(5–8)% gear Attack Speed",
    "+(3–6)% Attack Critical Strike Rating for this gear",
    "+(5–8)% Movement Speed",
    "+(10–15)% Skill Area",
    "+(25–30)% Elemental Damage"
  ],
  "Crossbow": [
    "Enemies have a 30% chance to explode when defeated, dealing True Damage equal to (50–100)% of their Max Life to enemies within a 6 m radius",
    "+(6–12)% chance to gain 1 stack of Tenacity Blessing on defeat",
    "Adds (7–10) - (14–17) Physical Damage to the gear",
    "+(15–25)% Gear Physical Damage",
    "+(5–8)% gear Attack Speed",
    "+(3–6)% Attack Critical Strike Rating for this gear",
    "Eliminates enemies under (5–8)% Life upon inflicting damage",
    "+(40–45)% Elemental Damage",
    "+(8–12)% chance to deal double Trauma Damage"
  ],
  "Cudgel": [
    "+(6–12)% chance to gain 1 stack of Focus Blessing on defeat",
    "Damage Penetrates (8–12)% Elemental Resistance",
    "+(18–24)% Cast Speed",
    "+(35–45)% Spell Damage",
    "+(50–60)% Spell Critical Strike Rating",
    "+(40–48)% Critical Strike Damage",
    "+(8–15)% Cooldown Recovery Speed",
    "Adds (7–12)% of Elemental Damage as Erosion Damage",
    "+(1–2) Support Skill Level"
  ],
  "Dagger": [
    "+(4–8)% chance to gain 1 stack of Focus Blessing on defeat",
    "+(5–10) Affliction inflicted per second",
    "Adds (2–4) - (8–10) Physical Damage to the gear",
    "+(15–25)% Gear Physical Damage",
    "+(5–8)% gear Attack Speed",
    "+(3–6)% Attack Critical Strike Rating for this gear",
    "(5–8)% chance to inflict 1 additional stack(s) of Wilt",
    "+(25–30)% Elemental Damage"
  ],
  "DEX Boots": [
    "+(15–20)% Movement Speed",
    "+1 to Max Agility Blessing Stacks",
    "+(30–40)% Cooldown Recovery Speed for Mobility Skills",
    "+(15–20)% Max Energy Shield",
    "+(15–20)% Max Life",
    "+(30–50)% gear Evasion",
    "+(50–70)% damage",
    "+(15–20)% Cooldown Recovery Speed",
    "Triggers Lv. 20 Stoneskin when moving. Interval: 2 s",
    "Has Hasten"
  ],
  "DEX Chest Armor": [
    "+2 Active Skill Level",
    "+(3–5)% Max Elemental Resistance",
    "+(50–70)% damage",
    "+(15–20)% Max Energy Shield",
    "+(15–20)% Max Life",
    "Immune to Elemental Ailments",
    "+(8–10)% Elemental and Erosion Resistance",
    "+(30–50)% gear Evasion"
  ],
  "DEX Gloves": [
    "+1 to Max Tenacity Blessing Stacks",
    "+(12–15)% Attack Speed",
    "+(12–15)% Cast Speed",
    "+(15–20)% chance to Blind the target on hit",
    "+(15–20)% chance to Mark the target on hit",
    "+(15–20)% chance to inflict Paralysis on hit",
    "Eliminates enemies under 15% Life upon inflicting damage",
    "Lucky Critical Strike\n(-150–-120) Critical Strike Rating",
    "+(30–50)% gear Evasion",
    "+(50–70)% damage",
    "Gains a stack of Fortitude when using a Melee Skill",
    "Inflicts Frail when dealing Spell Damage",
    "Gains a stack of Torment when Reaping"
  ],
  "DEX Helmet": [
    "+1 to Max Focus Blessing Stacks",
    "+(10–15)% Sealed Mana Compensation",
    "Triggers Lv. (15–20) Timid Curse upon dealing damage to enemies. Cooldown: 0.3 s",
    "Nearby enemies within 15 m are cursed by Lv. 20 Ominous",
    "Immune to Blinding\nImmune to Paralysis",
    "+(15–20)% Max Energy Shield",
    "+(15–20)% Max Life",
    "+(30–50)% gear Evasion",
    "+(50–70)% damage"
  ],
  "DEX Shield": [
    "+(1–2)% Max Fire Resistance",
    "+(1–2)% Max Cold Resistance",
    "+(1–2)% Max Lightning Resistance",
    "Has a (5–10)% chance to avoid Blocked damage",
    "+(5–8)% Block Ratio",
    "+(8–12)% Attack Block Chance",
    "+(12–15)% Spell Block Chance",
    "+(3–5)% Max Energy Shield",
    "+(3–5)% Max Life"
  ],
  "Fire Cannon": [
    "+(1–2) to Parabolic Projectile Splits quantity",
    "+(6–12)% chance to gain 1 stack of Tenacity Blessing on defeat",
    "Adds (7–10) - (14–17) Physical Damage to the gear",
    "+(15–25)% Gear Physical Damage",
    "+(5–8)% gear Attack Speed",
    "+(3–6)% Attack Critical Strike Rating for this gear",
    "+(10–15)% Skill Area",
    "+(40–45)% Elemental Damage",
    "-30% additional Damage Over Time taken while standing still"
  ],
  "INT Boots": [
    "+(15–20)% Movement Speed",
    "+1 to Max Agility Blessing Stacks",
    "+(30–40)% Cooldown Recovery Speed for Mobility Skills",
    "+(15–20)% Max Energy Shield",
    "+(15–20)% Max Life",
    "+(30–50)% gear Energy Shield",
    "+(50–70)% damage",
    "+(15–20)% Cooldown Recovery Speed",
    "Triggers Lv. 20 Stoneskin when moving. Interval: 2 s",
    "Has Hasten"
  ],
  "INT Chest Armor": [
    "+2 Active Skill Level",
    "+(3–5)% Max Elemental Resistance",
    "+(50–70)% damage",
    "+(15–20)% Max Energy Shield",
    "+(15–20)% Max Life",
    "Immune to Elemental Ailments",
    "+(8–10)% Elemental and Erosion Resistance",
    "+(30–50)% gear Energy Shield"
  ],
  "INT Gloves": [
    "+1 to Max Tenacity Blessing Stacks",
    "+(12–15)% Attack Speed",
    "+(12–15)% Cast Speed",
    "+(15–20)% chance to Blind the target on hit",
    "+(15–20)% chance to Mark the target on hit",
    "+(15–20)% chance to inflict Paralysis on hit",
    "Eliminates enemies under 15% Life upon inflicting damage",
    "Lucky Critical Strike\n(-150–-120) Critical Strike Rating",
    "+(30–50)% gear Energy Shield",
    "+(50–70)% damage",
    "Gains a stack of Fortitude when using a Melee Skill",
    "Inflicts Frail when dealing Spell Damage",
    "Gains a stack of Torment when Reaping"
  ],
  "INT Helmet": [
    "+1 to Max Focus Blessing Stacks",
    "+(10–15)% Sealed Mana Compensation",
    "Triggers Lv. (15–20) Timid Curse upon dealing damage to enemies. Cooldown: 0.3 s",
    "Nearby enemies within 15 m are cursed by Lv. 20 Ominous",
    "Immune to Blinding\nImmune to Paralysis",
    "+(15–20)% Max Energy Shield",
    "+(15–20)% Max Life",
    "+(30–50)% gear Energy Shield",
    "+(50–70)% damage"
  ],
  "INT Shield": [
    "+(1–2)% Max Fire Resistance",
    "+(1–2)% Max Cold Resistance",
    "+(1–2)% Max Lightning Resistance",
    "Has a (5–10)% chance to avoid Blocked damage",
    "+(5–8)% Block Ratio",
    "+(8–12)% Attack Block Chance",
    "+(12–15)% Spell Block Chance",
    "+(3–5)% Max Energy Shield",
    "+(3–5)% Max Life"
  ],
  "Musket": [
    "+(6–12)% chance to gain 1 stack of Agility Blessing on defeat",
    "Damage Penetrates (8–12)% Elemental Resistance",
    "Adds (7–10) - (14–17) Physical Damage to the gear",
    "+(15–25)% Gear Physical Damage",
    "+(5–8)% gear Attack Speed",
    "+(3–6)% Attack Critical Strike Rating for this gear",
    "+(40–45)% Elemental Damage",
    "Adds (7–12)% of Elemental Damage as Erosion Damage",
    "+(12–15)% chance for Attacks to inflict Damaging Ailments"
  ],
  "Necklace": [
    "You can cast 1 additional Curses",
    "Immune to Elemental Ailments",
    "+(60–80) Attack and Spell Critical Strike Rating",
    "+(50–70)% damage",
    "+(8–10)% Elemental Resistance",
    "+(30–40)% Skill Area",
    "+(15–20)% Skill Effect Duration"
  ],
  "One-Handed Axe": [
    "Enemies have a 30% chance to explode when defeated, dealing True Damage equal to (50–100)% of their Max Life to enemies within a 6 m radius",
    "+(4–8)% chance to gain 1 stack of Tenacity Blessing on defeat",
    "Adds (2–4) - (8–10) Physical Damage to the gear",
    "+(15–25)% Gear Physical Damage",
    "+(5–8)% gear Attack Speed",
    "+(3–6)% Attack Critical Strike Rating for this gear",
    "Eliminates enemies under (5–8)% Life upon inflicting damage",
    "+(10–15)% Skill Area",
    "+(25–30)% Elemental Damage"
  ],
  "One-Handed Hammer": [
    "Damage Penetrates (5–8)% Elemental Resistance",
    "+(4–8)% chance to gain 1 stack of Tenacity Blessing on defeat",
    "Adds (2–4) - (8–10) Physical Damage to the gear",
    "+(15–25)% Gear Physical Damage",
    "+(5–8)% gear Attack Speed",
    "+(3–6)% Attack Critical Strike Rating for this gear",
    "+(10–15)% Skill Area",
    "+1 Main Skill Level",
    "+(25–30)% Elemental Damage"
  ],
  "One-Handed Sword": [
    "+(5–10)% chance to gain 1 stack of Agility Blessing on defeat",
    "+(4–8)% chance to gain 1 stack of Tenacity Blessing on defeat",
    "Adds (2–4) - (8–10) Physical Damage to the gear",
    "+(15–25)% Gear Physical Damage",
    "+(5–8)% gear Attack Speed",
    "+(3–6)% Attack Critical Strike Rating for this gear",
    "+1 Melee Skill Level",
    "+(10–15)% Skill Area",
    "Damage Penetrates (5–8)% Elemental Resistance"
  ],
  "Pistol": [
    "+(4–8)% chance to gain 1 stack of Agility Blessing on defeat",
    "Damage Penetrates (5–8)% Elemental Resistance",
    "Adds (2–4) - (8–10) Physical Damage to the gear",
    "+(15–25)% Gear Physical Damage",
    "+(5–8)% gear Attack Speed",
    "+(3–6)% Attack Critical Strike Rating for this gear",
    "+(25–30)% Elemental Damage",
    "+(1–2) Projectile Skill Level",
    "+(25–30)% Projectile Speed"
  ],
  "Ring": [
    "+5% XP earned",
    "+5% Movement Speed",
    "Immune to Trauma\nImmune to Wilt",
    "+(8–10)% Strength",
    "+(8–10)% Dexterity",
    "+(8–10)% Intelligence",
    "+(50–70)% damage",
    "+(15–25)% Max Life",
    "+(15–25)% Max Energy Shield"
  ],
  "Rod": [
    "+(5–8)% chance to trigger the Main Spell Skill 1 additional time when using it",
    "+(4–8)% chance to gain 1 stack of Focus Blessing on defeat",
    "+(5–8)% Elemental and Erosion Resistance Penetration for Minions",
    "+(10–16)% Cast Speed",
    "+(20–30)% Minion Damage",
    "+(30–40)% Minion Critical Strike Rating",
    "+(25–32)% Minion Critical Strike Damage",
    "+(6–10)% Cooldown Recovery Speed",
    "Adds (5–8)% of Elemental Damage as Erosion Damage"
  ],
  "Scepter": [
    "+(5–8)% chance to trigger the Main Spell Skill 1 additional time when using it",
    "+(4–8)% chance to gain 1 stack of Focus Blessing on defeat",
    "Damage Penetrates (5–8)% Elemental Resistance",
    "+(10–16)% Cast Speed",
    "+(20–30)% Spell Damage",
    "+(30–40)% Spell Critical Strike Rating",
    "+(25–32)% Critical Strike Damage",
    "+(6–10)% Cooldown Recovery Speed",
    "Adds (5–8)% of Elemental Damage as Erosion Damage"
  ],
  "Spirit Ring": [
    "+5% XP earned",
    "+5% Movement Speed",
    "Immune to Trauma\nImmune to Wilt",
    "+(8–10)% Strength",
    "+(8–10)% Dexterity",
    "+(8–10)% Intelligence",
    "+(50–70)% damage",
    "+(15–25)% Max Life",
    "+(15–25)% Max Energy Shield"
  ],
  "STR Boots": [
    "+(15–20)% Movement Speed",
    "+1 to Max Agility Blessing Stacks",
    "+(30–40)% Cooldown Recovery Speed for Mobility Skills",
    "+(15–20)% Max Energy Shield",
    "+(15–20)% Max Life",
    "+(30–50)% Gear Armor",
    "+(50–70)% damage",
    "+(15–20)% Cooldown Recovery Speed",
    "Triggers Lv. 20 Stoneskin when moving. Interval: 2 s",
    "Has Hasten"
  ],
  "STR Chest Armor": [
    "+2 Active Skill Level",
    "+(3–5)% Max Elemental Resistance",
    "+(50–70)% damage",
    "+(15–20)% Max Energy Shield",
    "+(15–20)% Max Life",
    "Immune to Elemental Ailments",
    "+(8–10)% Elemental and Erosion Resistance",
    "+(30–50)% Gear Armor"
  ],
  "STR Gloves": [
    "+1 to Max Tenacity Blessing Stacks",
    "+(12–15)% Attack Speed",
    "+(12–15)% Cast Speed",
    "+(15–20)% chance to Blind the target on hit",
    "+(15–20)% chance to Mark the target on hit",
    "+(15–20)% chance to inflict Paralysis on hit",
    "Eliminates enemies under 15% Life upon inflicting damage",
    "Lucky Critical Strike\n(-150–-120) Critical Strike Rating",
    "+(30–50)% Gear Armor",
    "+(50–70)% damage",
    "Gains a stack of Fortitude when using a Melee Skill",
    "Inflicts Frail when dealing Spell Damage",
    "Gains a stack of Torment when Reaping"
  ],
  "STR Helmet": [
    "+1 to Max Focus Blessing Stacks",
    "+(10–15)% Sealed Mana Compensation",
    "Triggers Lv. (15–20) Timid Curse upon dealing damage to enemies. Cooldown: 0.3 s",
    "Nearby enemies within 15 m are cursed by Lv. 20 Ominous",
    "Immune to Blinding\nImmune to Paralysis",
    "+(15–20)% Max Energy Shield",
    "+(15–20)% Max Life",
    "+(30–50)% Gear Armor",
    "+(50–70)% damage"
  ],
  "STR Shield": [
    "+(1–2)% Max Fire Resistance",
    "+(1–2)% Max Cold Resistance",
    "+(1–2)% Max Lightning Resistance",
    "Has a (5–10)% chance to avoid Blocked damage",
    "+(5–8)% Block Ratio",
    "+(8–12)% Attack Block Chance",
    "+(12–15)% Spell Block Chance",
    "+(3–5)% Max Energy Shield",
    "+(3–5)% Max Life"
  ],
  "Tin Staff": [
    "+(6–12)% chance to gain 1 stack of Focus Blessing on defeat",
    "Damage Penetrates (8–12)% Elemental Resistance",
    "+(18–24)% Cast Speed",
    "+(35–45)% Spell Damage",
    "+(50–60)% Spell Critical Strike Rating",
    "+(40–48)% Critical Strike Damage",
    "+(8–15)% Cooldown Recovery Speed",
    "Adds (7–12)% of Elemental Damage as Erosion Damage",
    "+(1–2) Support Skill Level"
  ],
  "Two-Handed Axe": [
    "Enemies have a 30% chance to explode when defeated, dealing True Damage equal to (50–100)% of their Max Life to enemies within a 6 m radius",
    "+(6–12)% chance to gain 1 stack of Tenacity Blessing on defeat",
    "Adds (7–10) - (14–17) Physical Damage to the gear",
    "+(15–25)% Gear Physical Damage",
    "+(5–8)% gear Attack Speed",
    "+(3–6)% Attack Critical Strike Rating for this gear",
    "Eliminates enemies under (5–8)% Life upon inflicting damage",
    "+(10–15)% Skill Area",
    "+(40–45)% Elemental Damage"
  ],
  "Two-Handed Hammer": [
    "Damage Penetrates (8–12)% Elemental Resistance",
    "+(6–12)% chance to gain 1 stack of Tenacity Blessing on defeat",
    "Adds (7–10) - (14–17) Physical Damage to the gear",
    "+(15–25)% Gear Physical Damage",
    "+(5–8)% gear Attack Speed",
    "+(3–6)% Attack Critical Strike Rating for this gear",
    "+(1–2) Main Skill Level",
    "+(40–45)% Elemental Damage",
    "+(10–15)% Skill Area"
  ],
  "Two-Handed Sword": [
    "+1 Melee Skill Level",
    "+(6–12)% chance to gain 1 stack of Tenacity Blessing on defeat",
    "Adds (7–10) - (14–17) Physical Damage to the gear",
    "+(15–25)% Gear Physical Damage",
    "+(5–8)% gear Attack Speed",
    "+(3–6)% Attack Critical Strike Rating for this gear",
    "+(40–45)% Elemental Damage",
    "Damage Penetrates (8–12)% Elemental Resistance",
    "+(10–15)% Skill Area"
  ],
  "Wand": [
    "+(5–8)% chance to trigger the Main Spell Skill 1 additional time when using it",
    "+(4–8)% chance to gain 1 stack of Focus Blessing on defeat",
    "Damage Penetrates (5–8)% Elemental Resistance",
    "+(10–16)% Cast Speed",
    "+(20–30)% Spell Damage",
    "+(30–40)% Spell Critical Strike Rating",
    "+(25–32)% Critical Strike Damage",
    "+(6–10)% Cooldown Recovery Speed",
    "Adds (5–8)% of Elemental Damage as Erosion Damage"
  ]
};
function ranged(label){const ranges=[...label.matchAll(/\((-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\)/g)];if(!ranges.length)return {label,min:label,max:label};let low=label,high=label;for(const match of ranges){low=low.replace(match[0],match[1]);high=high.replace(match[0],match[2]);}return {label,min:low,max:high};}
export const corrosionImplicitPoolsSs13=Object.fromEntries(Object.entries(rawPools).map(([base,entries])=>[base,entries.map(ranged)]));
export const equipmentBaseTypesBySlotSs13={helmet:["STR Helmet","DEX Helmet","INT Helmet"],chest:["STR Chest Armor","DEX Chest Armor","INT Chest Armor"],gloves:["STR Gloves","DEX Gloves","INT Gloves"],boots:["STR Boots","DEX Boots","INT Boots"],necklace:["Necklace"],belt:["Belt"],leftRing:["Ring","Spirit Ring"],rightRing:["Ring","Spirit Ring"],mainHand:["Claw","Cane","One-Handed Hammer","One-Handed Sword","One-Handed Axe","Dagger","Pistol","Wand","Rod","Scepter","Bow","Two-Handed Sword","Two-Handed Hammer","Tin Staff","Two-Handed Axe","Cudgel","Musket","Fire Cannon","Crossbow","STR Shield","DEX Shield","INT Shield"],secondaryHand:["Claw","Cane","One-Handed Hammer","One-Handed Sword","One-Handed Axe","Dagger","Pistol","Wand","Rod","Scepter","STR Shield","DEX Shield","INT Shield"]};
// A legendary's base type from the game's own record (src/data/gear/legendary-bases-ss14.generated.js, legendary audit 2026-10-22);
// the icon tokens stay for items without one (the 1HMace / 2HMace / crossbow / Shotgun icons are hammers, crossbows and muskets).
function legendaryBaseType(item){if(item.rarity&&!["legendary","captured"].includes(item.rarity))return null;const type=legendaryBasesSs14[String(item.name||"").replace(/ - Priceless$/i,"")]?.type;return type&&corrosionImplicitPoolsSs13[type]?type:null;}
const tokens=[["1HMace","One-Handed Hammer"],["2HMace","Two-Handed Hammer"],["crossbow","Crossbow"],["Shotgun","Musket"],["2HSword","Two-Handed Sword"],["2HHammer","Two-Handed Hammer"],["2HAxe","Two-Handed Axe"],["Staff","Tin Staff"],["1HSword","One-Handed Sword"],["1HHammer","One-Handed Hammer"],["1HAxe","One-Handed Axe"],["FireCannon","Fire Cannon"],["Crossbow","Crossbow"],["Musket","Musket"],["Pistol","Pistol"],["Scepter","Scepter"],["Dagger","Dagger"],["Claw","Claw"],["Wand","Wand"],["Cane","Cane"],["Cudgel","Cudgel"],["Bow","Bow"],["Rod","Rod"],["Shield","STR Shield"]];
export function baseTypesForSlot(slot){return equipmentBaseTypesBySlotSs13[slot]||[];}
export function defaultBaseForItem(item){if(item.base&&corrosionImplicitPoolsSs13[item.base])return item.base;const game=legendaryBaseType(item);if(game)return game;if(item.id==="Suns_Embrace")return "STR Helmet";const icon=item.remoteIcon||"";return tokens.find(([token])=>icon.includes(token))?.[1]||baseTypesForSlot(item.slot)[0]||"";}
export function corrosionImplicitsForBase(base){return corrosionImplicitPoolsSs13[base]||[];}
export function corrosionImplicitsForItem(item){return corrosionImplicitsForBase(defaultBaseForItem(item));}
