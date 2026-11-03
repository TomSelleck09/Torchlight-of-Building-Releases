const profileFields = [
  "selectedTraits", "memories", "memoryTraitLevels", "equippedMemoryIds",
  "baseTraitMemoryId", "baseTraitMemoryRoll", "sageScent",
  "carinoSpecialAmmoSupports", "heroTraitSupports", "heroTraitSupportLevels",
  "heroTraitSupportConfigs"
];
// Trait-tree picks (hero.treeTraits) are keyed by hero id, so they stay put across hero switches (src/hero-trait-tree.js).

const copy = (value) => structuredClone(value);

export function captureHeroLoadout(hero) {
  return Object.fromEntries(profileFields.map((field) => [field, copy(hero[field])]));
}

export function emptyHeroLoadout() {
  return {
    selectedTraits: {}, memories: {}, memoryTraitLevels: {}, equippedMemoryIds: {},
    baseTraitMemoryId: "", baseTraitMemoryRoll: null,
    sageScent: { elixir: "", damage: "", defense: "", functional: "" },
    carinoSpecialAmmoSupports: ["", "", ""], heroTraitSupports: {},
    heroTraitSupportLevels: {}, heroTraitSupportConfigs: {}
  };
}

export function switchHeroLoadout(hero, nextHeroId) {
  if (hero.selectedHeroId === nextHeroId) return hero;
  const loadouts = { ...(hero.heroLoadouts || {}) };
  if (hero.selectedHeroId) loadouts[hero.selectedHeroId] = captureHeroLoadout(hero);
  const legacyTraits = Object.fromEntries(Object.entries(hero.selectedTraits || {}).filter(([key]) => key.startsWith(`${nextHeroId}:`)));
  const next = copy(loadouts[nextHeroId] || { ...emptyHeroLoadout(), selectedTraits: legacyTraits });
  const inventoryIds = new Set((hero.memoryInventory || []).map((memory) => memory.id));
  for (const [tier, id] of Object.entries(next.equippedMemoryIds || {})) {
    if (inventoryIds.has(id)) continue;
    delete next.equippedMemoryIds[tier];
    delete next.memories[tier];
    delete next.memoryTraitLevels[tier];
  }
  if (next.baseTraitMemoryId && !inventoryIds.has(next.baseTraitMemoryId)) {
    next.baseTraitMemoryId = "";
    next.baseTraitMemoryRoll = null;
  }
  return { ...hero, ...next, selectedHeroId: nextHeroId, heroLoadouts: loadouts };
}
