import { isTwoHandedItem } from "./weapon-damage-model.js";

// `mainHandItem` (optional): the enabled Weapon 1 item. A two-handed weapon never goes in Weapon 2, and Weapon 2 takes nothing while
// Weapon 1 holds a two-hander (user request 2026-11-22: in game the second slot is unusable).
export function canDropGearInSlot(item, slot, { mainHandItem = null } = {}) {
  if (!item || !slot) return false;
  if (item.slot === "leftRing" || item.slot === "rightRing") return slot === "leftRing" || slot === "rightRing";
  if (item.slot === "mainHand") {
    if (slot === "mainHand") return true;
    if (slot !== "secondaryHand" || isTwoHandedItem(item)) return false;
    return !isTwoHandedItem(mainHandItem);
  }
  if (slot === "secondaryHand" && isTwoHandedItem(mainHandItem)) return false;
  return item.slot === slot;
}
