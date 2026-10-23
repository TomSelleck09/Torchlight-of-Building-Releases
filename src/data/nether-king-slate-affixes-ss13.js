// Nether King talent nodes: Micro, Medium and Legendary Medium (the Nether King's Divinity's base affixes and Brand options).
// SS14 data since 2026-10-22 (src/data/nether-king-nodes-ss14.generated.js, from https://tlidb.com/en/Nether_King, checked
// against the game's talent types). The SS14 patch notes moved every tier up one step: the SS13 Legendary Medium nodes are now
// Ultimate (src/data/nether-king-ultimate-affixes-ss13.js), SS13 Medium → Legendary Medium (values raised; +1 <Element> Skill
// Level and "Adds 10 - 10 Base Ailment Damage" added, the three "Adds 5 - 5 Base <Ailment> Damage" removed), SS13 Micro →
// Medium, and new Micro nodes at half the Medium values. Saved slates keep the text they were made with.
import { netherKingNodesSs14 } from "./nether-king-nodes-ss14.generated.js";

export const netherKingFixedAffixesSs13 = netherKingNodesSs14
  .filter((node) => node.name !== "Ultimate Nether King Talent Node")
  .map(({ id, name, effect, maxDivinityEffect }) => ({ id, name, effect, ...(maxDivinityEffect ? { maxDivinityEffect } : {}) }));
