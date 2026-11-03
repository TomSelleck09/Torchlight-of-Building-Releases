// Read-time migrations for saved items (src/planner-state.js normalizePlannerState). Storage is not rewritten
// eagerly: a build carries the migrated item only when it is next saved. User-approved 2026-10-15
// (research/patch-ss14/CHANGE-REPORT.md decision 1 and the id-change list; "the old builds should change if objects they were
// using are changed").
//
// - TOWER Sequence: 19 ids kept their game id and roll a new affix (src/data/changed-item-ids.js towerSequenceSs13Texts).
//   A saved item with that towerSequenceId has its copy of the SS13 text replaced by the current entry's SS14 text.
// - Legendary "Truth" → "I Am Truth" (rename; same modifiers): name, icon and source follow.
// - Rare items on a legacy duplicate base (Lv66 Imperishable Black Robe, Lv61 Respected Tutor's Robe, Lv61 Divine
//   Arbiter's Defense) move to the regular base of that name (src/legacy-rare-base-migration.js).
// - Item names (user request 2026-10-26: items cannot be named): every item stores its game name, the rare base's, the
//   legendary's or the Vorax base's; custom names and " Copy" suffixes go (src/item-base-name.js).
import { towerSequencesSs13 } from "./data/gear/tower-sequences-ss13.generated.js";
import { legendaryRenames, towerSequenceSs13Texts } from "./data/changed-item-ids.js";
import { migrateLegacyRareBase } from "./legacy-rare-base-migration.js";
import { withItemBaseName } from "./item-base-name.js";

function migrateTowerSequence(item) {
  const old = towerSequenceSs13Texts[item.towerSequenceId];
  if (!old || !Array.isArray(item.modifiers)) return item;
  const current = towerSequencesSs13.find((entry) => entry.id === item.towerSequenceId)?.modifier;
  // The sequence line is appended after the item's own lines (src/app.js craft / legendary save, src/game-log-import.js).
  const index = item.modifiers.lastIndexOf(old);
  if (!current || current === old || index < 0) return item;
  const modifiers = [...item.modifiers]; modifiers[index] = current;
  return { ...item, modifiers };
}

function migrateLegendaryRename(item) {
  if (!["legendary", "captured"].includes(item.rarity)) return item;
  const [, name, priceless = ""] = String(item.name || "").match(/^(.*?)( - Priceless)?$/);
  const rename = legendaryRenames.find(({ from }) => from.name === name);
  if (!rename) return item;
  const { from, to } = rename;
  return { ...item, name: `${to.name}${priceless}`, ...(item.icon === from.icon ? { icon: to.icon } : {}), ...(item.source === from.source ? { source: to.source } : {}) };
}

/** One saved equipment item with the SS14 migrations applied (the same object when nothing changes). */
export function migrateChangedItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  return withItemBaseName(migrateLegacyRareBase(migrateLegendaryRename(migrateTowerSequence(item))));
}

/** equipmentOverrides ({ slot: item }) and equipmentInventory ([item]) migrated (same containers when unchanged). */
export function migrateChangedEquipment(overrides, inventory) {
  let overridesOut = overrides, inventoryOut = inventory;
  if (overrides && typeof overrides === "object") {
    const entries = Object.entries(overrides).map(([slot, item]) => [slot, migrateChangedItem(item)]);
    if (entries.some(([slot, item]) => item !== overrides[slot])) overridesOut = Object.fromEntries(entries);
  }
  if (Array.isArray(inventory)) {
    const items = inventory.map(migrateChangedItem);
    if (items.some((item, index) => item !== inventory[index])) inventoryOut = items;
  }
  return { overrides: overridesOut, inventory: inventoryOut };
}
