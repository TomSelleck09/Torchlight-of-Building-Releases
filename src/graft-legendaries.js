// Legendaries drawn on the red Vorax card (user request 2026-10-13): reference data marks these SS14 legendaries "Graft" (organ items,
// e.g. "Graft: Organ: Eternity"), and the game shows them on the Vorax-style red background. Only the card class changes; the
// item stays a Legendary for its label, sections and the calculator.
import { legendaryGearSs13 } from "./data/gear/legendary-gear-ss13.generated.js";

export const GRAFT_LEGENDARY_IDS = Object.freeze(["Lone_Walkers_Boots", "Pantheons_Elegy", "Eternity"]);
const graftNames = new Set(legendaryGearSs13.filter((entry) => GRAFT_LEGENDARY_IDS.includes(entry.id)).map((entry) => entry.name.toLowerCase()));

export function usesVoraxCard(item) {
  return graftNames.has(String(item?.name || "").replace(/ - Priceless$/i, "").trim().toLowerCase());
}

/**
 * The rarity class token(s) a card or preview uses after "rarity-": "vorax graft-legendary" for a Graft legendary (the red
 * Vorax background; "graft-legendary" keeps the portrait legendary icon out of the square Vorax-art icon rules in
 * src/styles.css), else the display rarity.
 */
export function itemCardRarity(rarity, item) {
  return rarity === "legendary" && usesVoraxCard(item) ? "vorax graft-legendary" : rarity;
}
