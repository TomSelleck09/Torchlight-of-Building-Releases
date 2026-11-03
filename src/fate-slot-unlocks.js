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
