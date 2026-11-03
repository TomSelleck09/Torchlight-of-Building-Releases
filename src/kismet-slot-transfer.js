export function transferKismetSlot(slots, fromKey, toKey, { duplicate = false } = {}) {
  const source = slots?.[fromKey];
  if (!fromKey || !toKey || !source) return { error: "Kismet source is empty" };
  if (fromKey === toKey) return { action: "unchanged", slots };
  const destination = slots[toKey];
  if (duplicate && destination) return { error: "Duplicate onto an empty Kismet slot" };

  const next = { ...slots, [toKey]: structuredClone(source) };
  if (!duplicate) {
    if (destination) next[fromKey] = structuredClone(destination);
    else delete next[fromKey];
  }
  return { action: duplicate ? "duplicated" : destination ? "swapped" : "moved", slots: next };
}
