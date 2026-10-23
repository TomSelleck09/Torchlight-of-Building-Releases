// Game-patch changes (2026-10-14) to objects saved builds can carry, for the read-time migrations in src/changed-item-migrations.js.
// Sources: research/patch-ss14/CHANGE-REPORT.md (decision 1 and the id-change list, user-approved 2026-10-15),
// research/patch-ss14/game-diff.md "TOWER Sequence: the 19 replaced ids" and research/patch-ss14/tlidb-diff.md "Id changes".
// The SS13 texts below are copied from the pre-SS14 snapshot (research/patch-ss14/before/src-data).
//
// Removed content (craft families suffix-1404024 / 1404124 / 1404224, Vorax donors vorax-head-donor-44 / vorax-neck-donor-44)
// has no migration: per the user (2026-10-15) saved builds are handled as the planner already handles unknown entries (a craft
// family id with no catalog family keeps its saved line text). "Dual Kismet: Ribbon" was listed here too, but it was never
// removed: TLIDB's SS14 Destiny page printed its icon only as alt2 and the importer skipped it. It is in the SS14 game tables
// (item 350760, config_modifier 100350760) and back in the catalog with its SS13 name and text (kismet / pact audit 2026-10-21).

// TOWER Sequence ids that kept their game id but roll a new affix in SS14 (config_modifier: same id, group, tier and type; new
// affix class). The current entry (src/data/gear/tower-sequences-ss13.generated.js, same id) carries the SS14 text; a saved
// item's copy of the SS13 text is replaced by it on read.
const DETERIORATION_1 = "+15% additional Deterioration Damage\n10% chance to inflict 1 additional stack(s) of Deterioration";
const DETERIORATION_2 = "+30% additional Deterioration Damage\n10% chance to inflict 2 additional stack(s) of Deterioration";
export const towerSequenceSs13Texts = {
  "tower-sequence-160508001": DETERIORATION_1, // Claw
  "tower-sequence-160508004": DETERIORATION_1, // One-Handed Hammer
  "tower-sequence-160508006": DETERIORATION_1, // One-Handed Sword
  "tower-sequence-160508007": DETERIORATION_1, // One-Handed Axe
  "tower-sequence-160508008": DETERIORATION_1, // Dagger
  "tower-sequence-160528003": DETERIORATION_1, // Cane
  "tower-sequence-160528026": DETERIORATION_1, // Pistol
  "tower-sequence-160518010": DETERIORATION_2, // Two-Handed Sword
  "tower-sequence-160518011": DETERIORATION_2, // Two-Handed Hammer
  "tower-sequence-160518013": DETERIORATION_2, // Two-Handed Axe
  "tower-sequence-160518014": DETERIORATION_2, // Cudgel
  "tower-sequence-160538009": DETERIORATION_2, // Bow
  "tower-sequence-160538027": DETERIORATION_2, // Musket
  "tower-sequence-160538028": DETERIORATION_2, // Fire Cannon
  "tower-sequence-160538029": DETERIORATION_2, // Crossbow
  "tower-sequence-160547032": DETERIORATION_1, // Wand
  "tower-sequence-160557012": DETERIORATION_2, // Tin Staff
  "tower-sequence-160567034": "+160 Affliction inflicted per second", // Scepter (both Selena fixtures)
  "tower-sequence-160577033": "Triggers Lv. 20 Dark Gate when moving. Interval: 4 s" // Rod
};

// Legendary renamed in SS14 (game id 113208; same modifiers, new icon). Saved items are matched by name.
export const legendaryRenames = [
  { from: { id: "Truth", name: "Truth", icon: "./src/assets/tli/gear/Truth.webp", source: "https://tlidb.com/en/Truth" },
    to: { id: "I_Am_Truth", name: "I Am Truth", icon: "./src/assets/tli/gear/I_Am_Truth.webp", source: "https://tlidb.com/en/I_Am_Truth" } }
];
