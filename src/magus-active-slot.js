// Spirit Magi in Active Skill slots (user rule 2026-10-19): Iris 1 (Growing Breeze) and Iris 2 (Vigilant Breeze) may place the
// Spirit Magus summon skills (catalog tag "Spirit Magus") in the active skill slots as well as the Aura slots. In an active slot
// the Magus stays the same Aura-role skill: it reserves Mana with its own sealedManaPercent, Sealed Mana Compensation and
// Restrain like an Aura-slot Magus (the same Aura ledger), takes Aura-slot supports and the Aura-slot (passive) Energy costs, and
// feeds every Magus reader (minion model, Nourishment, Empower, Source, Circle of Life, Max Spirit Magi limits) unchanged.
// Only its board tab differs: the saved setup carries `boardTab: "skills"`. User decision 2026-10-21: for every other hero an
// active-slot Magus is removed from the board, its slot left empty: on a hero switch (src/app.js), on read (src/planner-state.js)
// and in the saved-build migration of a Magus's own skills (src/minion-skill-owners.js removeActiveSlotMagi /
// migrateMinionOwnedSetups); the planner ignores one still in a state it is handed (applyMagusActiveSlotRule). The skill picker
// offers the Magus summons on the active-skill tab only to Iris 1 / 2.

export const IRIS_MAGUS_ACTIVE_SLOT_HEROES = new Set(["iris-growing-breeze", "iris-vigilant-breeze"]);
export const MAGUS_DUPLICATE_REASON = "This Spirit Magus is already on the board; one copy is counted";

export const isSpiritMagusSkill = (entry) => Array.isArray(entry?.tags) && entry.tags.includes("Spirit Magus");
export const heroCanPlaceMagusInActiveSlot = (heroId) => IRIS_MAGUS_ACTIVE_SLOT_HEROES.has(heroId);

/** The board tab a setup sits on: "auras" for Aura-role setups unless saved in an active slot (`boardTab: "skills"`). */
export function setupBoardTab(setup) {
  if (setup?.role === "aura" && setup.boardTab === "skills") return "skills";
  return setup?.role === "aura" ? "auras" : "skills";
}

/**
 * User-confirmed 2026-10-19: on Iris 1 / Iris 2 a Spirit Magus in an active skill slot also takes "+N Active Skill Level" lines
 * (and "+N <tag> Active Skill Level" variants matching its tags), on top of the level lines it already takes (Summon, Spirit
 * Magus, Persistent, All Skills, Passive …). A Magus in an Aura slot does not; other heroes have no active-slot Magus.
 */
export function magusTakesActiveSkillLevels(setup, heroId) {
  return heroCanPlaceMagusInActiveSlot(heroId) && setup?.role === "aura" && setupBoardTab(setup) === "skills";
}
export const ACTIVE_SLOT_MAGUS_LEVEL_NOTE = "Spirit Magus in an active skill slot (Iris; user-confirmed 2026-10-19)";

/**
 * Leaves out an active-slot Magus the hero cannot field (not Iris 1 / 2: removed, as the stored board drops it on read and on a
 * hero switch), and marks active-slot copies of a Magus already in an Aura slot (or an earlier active slot) inactive:
 * `enabled: false` (no Energy, no reservation, no damage) with `slotInactive` holding the reason. The stored state is never
 * changed here.
 */
export function applyMagusActiveSlotRule(setups, heroId) {
  const allowed = heroCanPlaceMagusInActiveSlot(heroId);
  const onAuraBoard = new Set(setups.filter((setup) => setup.enabled !== false && setupBoardTab(setup) === "auras").map((setup) => setup.name));
  const seen = new Set();
  return setups.filter((setup) => allowed || !(setup.role === "aura" && setupBoardTab(setup) === "skills")).map((setup) => {
    if (setupBoardTab(setup) !== "skills" || setup.role !== "aura" || setup.enabled === false) return setup;
    const reason = onAuraBoard.has(setup.name) || seen.has(setup.name) ? MAGUS_DUPLICATE_REASON : null;
    seen.add(setup.name);
    return reason ? { ...setup, enabled: false, slotInactive: reason } : setup;
  });
}
