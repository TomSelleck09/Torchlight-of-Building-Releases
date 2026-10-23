// Talent slot types of the legendary Divinity Slates, from the game's own slot texts (SS14 localization 2026-10-18,
// item_talent_block_gold talent_description1–4; TLIDB's Legendary Gear list shows the same): Fallen Starlight (1003)
// ‹Micro Talent›, ‹Micro Talent›, ‹Micro Talent or Medium Talent›, ‹Medium Talent›; A Corner of Divinity (1005) ‹Legendary Medium
// Talent› × 2; Pedigree of Gods (1010) ‹Micro Talent or Medium Talent› × 2, ‹Medium Talent or Lv.1 Core Talent›, ‹Lv.2 Core Talent›.
// A game "Medium Talent" slot also takes Legendary Medium Talents: an in-game Pedigree rolled a Warrior Legendary Medium node in a
// ‹Micro Talent or Medium Talent› slot (src/pedigree-slots.js), and the captured Fallen Starlights hold Legendary Medium nodes in
// their third and fourth slots (src/data/slates/selena-scorching-beam-ss13.js). Slates audit 2026-10-22, user-approved crafter pools.
import { pedigreeSlotTypes } from "../../pedigree-slots.js";

const MICRO = "Micro Talent", MEDIUM = "Medium Talent", LEGENDARY_MEDIUM = "Legendary Medium Talent";
export const legendarySlateSlotTypesSs14 = {
  "Fallen Starlight": [[MICRO], [MICRO], [MICRO, MEDIUM, LEGENDARY_MEDIUM], [MEDIUM, LEGENDARY_MEDIUM]],
  "A Corner of Divinity": [[LEGENDARY_MEDIUM], [LEGENDARY_MEDIUM]],
  "Pedigree of Gods": pedigreeSlotTypes
};
