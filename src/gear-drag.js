export function canDropGearInSlot(item, slot) {
  if (!item || !slot) return false;
  if (item.slot === "leftRing" || item.slot === "rightRing") return slot === "leftRing" || slot === "rightRing";
  if (item.slot === "mainHand") return slot === "mainHand" || slot === "secondaryHand";
  return item.slot === slot;
}
