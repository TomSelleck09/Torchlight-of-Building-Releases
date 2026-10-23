// Nether King Ultimate talent nodes. SS14 data since 2026-10-22 (src/data/nether-king-nodes-ss14.generated.js, from
// https://tlidb.com/en/Nether_King, checked against the game's talent types). SS14 patch notes: the SS13 Legendary Medium nodes
// are Ultimate now ("+100 Attack and Spell Critical Strike Rating · -99% additional Elemental and Erosion Damage" → "+80 Attack
// and Spell Critical Strike Rating"); new "When Judgment is active, +5% Effect Increase Multiplier for Divinity Slate along the
// connecting line"; the Ultimate Craft Affixes for A Corner of Divinity / Fallen Starlight and Non-Legendary slates on the link
// +25% / +20% → +10%. The patch notes' new Contamination "+7% Projection effect" (game id 90000216) is not on TLIDB yet.
import { netherKingNodesSs14 } from "./nether-king-nodes-ss14.generated.js";

export const netherKingUltimateAffixesSs13 = netherKingNodesSs14
  .filter((node) => node.name === "Ultimate Nether King Talent Node")
  .map(({ id, name, effect, maxDivinityEffect }) => ({ id, name, effect, ...(maxDivinityEffect ? { maxDivinityEffect } : {}) }));
