export const fateSlotChoices = [
  ...Array.from({ length: 5 }, (_, index) => ({ id: `${index + 1}m`, label: `${index + 1} Micro Fate Slot${index ? "s" : ""}`, micro: index + 1, medium: 0 })),
  ...Array.from({ length: 3 }, (_, index) => ({ id: `${index + 1}M`, label: `${index + 1} Medium Fate Slot${index ? "s" : ""}`, micro: 0, medium: index + 1 })),
  { id: "1M1m", label: "1 Medium & 1 Micro Fate Slot", micro: 1, medium: 1 },
  { id: "2M1m", label: "2 Medium & 1 Micro Fate Slot", micro: 1, medium: 2 },
  { id: "1M2m", label: "1 Medium & 2 Micro Fate Slot", micro: 2, medium: 1 }
];

export function fateSlotChoice(id) {
  return fateSlotChoices.find((choice) => choice.id === id) || null;
}

export function fateExtraSlots(spiritName, choiceId) {
  const choice = fateSlotChoice(choiceId);
  if (!choice) return [];
  return [
    ...Array.from({ length: choice.micro }, (_, index) => ({ key: `${spiritName}:extra:micro:${index}`, kind: "micro", index: index + 1 })),
    ...Array.from({ length: choice.medium }, (_, index) => ({ key: `${spiritName}:extra:medium:${index}`, kind: "medium", index: index + 1 }))
  ];
}

export function fateSlotBonuses(selectedSpirits = [], fateUnlocks = {}) {
  return selectedSpirits.filter(Boolean).reduce((total, name) => {
    const choice = fateSlotChoice(fateUnlocks[name]);
    total.micro += choice?.micro || 0;
    total.medium += choice?.medium || 0;
    return total;
  }, { micro: 0, medium: 0 });
}

// The Undetermined Fate item's own icon (game item icon UI_S9Pet_UndeterminedFate_128, exported read-only from the paks with
// the bundled Ue4Export: Art/UI/Textures/Common/Icon/Item/128, 256 px, converted to webp).
export const UNDETERMINED_FATE_ICON = "./src/assets/tli/catalog/UI_S9Pet_UndeterminedFate_128.webp";

// The icon a pact tree node shows: an equipped Kismet's, the Undetermined Fate's on a Destiny ("Undetermined Fate Slots") node
// with one installed, else the node's own graphic.
export function pactNodeIcon(node, { kismet = null, fateUnlockId = null } = {}) {
  if (kismet?.icon) return kismet.icon;
  if (node?.ring === "destiny" && fateSlotChoice(fateUnlockId)) return UNDETERMINED_FATE_ICON;
  return node?.icon || "";
}

// The rarity class that colours a pact tree node's ring (src/styles.css .pact-border-*): what sits in the node. A Legendary, Epic or
// Rare Kismet (inner / mid nodes and the extra Fate slots), an installed Undetermined Fate on the Destiny node, the spirit's main
// (outer) node, else normal. Epic is the Destiny item's quality 3 (config_item_base field 0; 2026-11-18).
export function pactNodeBorderClass(node, { kismet = null, fateInstalled = false } = {}) {
  if (kismet?.rarity === "Legendary") return "pact-border-legendary-kismet";
  if (kismet?.rarity === "Epic") return "pact-border-epic-kismet";
  if (kismet?.rarity === "Rare") return "pact-border-rare-kismet";
  if (node?.ring === "destiny" && fateInstalled) return "pact-border-fate";
  if (node?.ring === "outer") return "pact-border-main";
  return "pact-border-normal";
}
