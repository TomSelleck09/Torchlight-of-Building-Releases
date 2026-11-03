export const equipmentSlots = [
  ["helmet", "Helmet"], ["chest", "Chest Armor"], ["necklace", "Necklace"], ["gloves", "Gloves"], ["belt", "Belt"],
  ["boots", "Boots"], ["leftRing", "Ring 1"], ["rightRing", "Ring 2"], ["mainHand", "Weapon 1"], ["secondaryHand", "Weapon 2"]
];

export const craftItemTypes = [
  ["STR Helmet","helmet"],["DEX Helmet","helmet"],["INT Helmet","helmet"],
  ["STR Chest Armor","chest"],["DEX Chest Armor","chest"],["INT Chest Armor","chest"],
  ["STR Gloves","gloves"],["DEX Gloves","gloves"],["INT Gloves","gloves"],
  ["STR Boots","boots"],["DEX Boots","boots"],["INT Boots","boots"],
  ["Necklace","necklace"],["Ring","leftRing"],["Belt","belt"],["Spirit Ring","leftRing"],
  ...["Claw","Dagger","One-Handed Sword","One-Handed Hammer","One-Handed Axe","Wand","Rod","Scepter","Cane","Pistol","Two-Handed Sword","Two-Handed Hammer","Two-Handed Axe","Tin Staff","Cudgel","Bow","Crossbow","Musket","Fire Cannon"].map((name)=>[name,"mainHand"]),
  ...["STR Shield","DEX Shield","INT Shield"].map((name)=>[name,"secondaryHand"])
];

export const voraxItemTypes = [
  ["Vorax Limb: Head","helmet"],["Vorax Limb: Chest","chest"],["Vorax Limb: Hands","gloves"],["Vorax Limb: Legs","boots"],
  ["Vorax Aberrant Limb: Legs","boots"],["Vorax Limb: Neck","necklace"],["Vorax Limb: Digits","leftRing"],
  ["Vorax Aberrant Limb: Digits","leftRing"],["Vorax Limb: Waist","belt"],["Vorax Aberrant Limb: Waist","belt"]
];

export const commonCraftAffixes = [
  "+60 Equipment Energy", "+3 Fire Skill Level", "+3 Spell Skill Level", "+40% Damage Over Time", "+60% Ailment Damage Enhancement",
  "+150 Affliction inflicted per second", "+1 Ignite limit", "+8% Aura Effect", "+300 Max Energy Shield", "+20% Elemental Resistance",
  "+40% Movement Speed", "+20% Cast Speed", "+100% Critical Strike Rating", "Adds 320–590 Base Ignite Damage", "+80% Reaping Recovery Speed"
];
