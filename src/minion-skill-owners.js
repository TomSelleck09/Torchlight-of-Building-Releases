// Minion skills belong to their summon (2026-10-21; user report for the Spirit Magi, then user decision for every Minion): in
// game only the summon skill is picked (Summon Fire Magus, Summon Machine Guard, Module: Goblin Priest, …) and its Minion casts
// the owned skills (Blazing Dance, Overpower, Firebird, …). Ownership comes from the game files, cross-checked against TLIDB:
// src/data/skills/minion-skill-owners-ss13.generated.js (scripts/build-minion-skill-owners.mjs). The owned skills stay in the
// catalog for the Minion model (src/minion-profiles.js) but are never offered as board skills, and a saved board setup of one
// becomes its summon on read (migrateMinionOwnedSetups).
import { minionSkillOwnersSs13 } from "./data/skills/minion-skill-owners-ss13.generated.js";
import { selenaCompleteSkillLoadoutSs13 } from "./data/skills/selena-complete-skill-loadout-ss13.js";
import { heroCanPlaceMagusInActiveSlot, isSpiritMagusSkill, setupBoardTab } from "./magus-active-slot.js";
import { traitGrantedSkills } from "./data/heroes/trait-granted-skills.generated.js";

export const MAGUS_SKILL_ROLE_LABELS = Object.freeze({ base: "Base Skill", empower: "Empower Skill", enhanced: "Enhanced Skill", ultimate: "Ultimate" });

const OWNED = new Map(minionSkillOwnersSs13.flatMap((owner) => owner.skills.map((skill) => [skill.name, Object.freeze({
  name: skill.name, role: skill.role, roleLabel: MAGUS_SKILL_ROLE_LABELS[skill.role] || null, owner: owner.owner, family: owner.family, minion: owner.minion,
  tags: Object.freeze([...(skill.tags || [])])
})])));
const BY_OWNER = new Map(minionSkillOwnersSs13.map((owner) => [owner.owner, Object.freeze(owner.skills.map((skill) => OWNED.get(skill.name)))]));
const OWNER_FAMILY = new Map(minionSkillOwnersSs13.map((owner) => [owner.owner, owner.family]));

/** The summon that owns a Minion skill ({ name, role, roleLabel, owner, family, minion, tags }), or null for a player skill. */
export const minionOwnedSkill = (name) => OWNED.get(name) || null;
export const isMinionOwnedSkill = (name) => OWNED.has(name);
/** A summon's own Minion skills (a Spirit Magus's in role order: Base, Empower, Enhanced, Ultimate); [] for any other skill. */
export const minionInherentSkills = (ownerName) => BY_OWNER.get(ownerName) || [];
/** "spirit-magus" | "synthetic-troop" | "module" for a summon that owns Minion skills, else null. */
export const minionOwnerFamily = (ownerName) => OWNER_FAMILY.get(ownerName) || null;

// Skills only a hero trait puts on the board (user decision 2026-10-21; src/trait-granted-skills.js): never offered.
const TRAIT_GRANTED = new Set(traitGrantedSkills.map((skill) => skill.name));

/**
 * The skill selector's choices for a board tab: Aura-role skills on the Aura tab; every other skill on the skills tab, plus the
 * Spirit Magus summons for Iris 1 / Iris 2 only (src/magus-active-slot.js). A Minion's own skills and the hero-trait-granted
 * skills (the trait puts them on the board) are never offered.
 */
export function boardSkillChoices(catalog, { tab = "skills", heroId = null } = {}) {
  return catalog.filter((entry) => !isMinionOwnedSkill(entry.name) && !TRAIT_GRANTED.has(entry.name) && (tab === "auras" ? entry.role === "aura" : entry.role !== "aura" || heroCanPlaceMagusInActiveSlot(heroId) && isSpiritMagusSkill(entry)));
}

// Drops custom setups by key with their setup-keyed state; their board slots (positional, src/skill-board-slots.js) are emptied.
// Also used by src/trait-granted-skills.js migrateTraitGrantedSetups.
export function dropSetups(skills, customSetups, removed) {
  if (!removed.size) return { ...skills, customSetups };
  const keep = (list) => Array.isArray(list) ? list.filter((key) => !removed.has(key)) : list;
  const emptySlot = (list) => list.map((key) => removed.has(key) ? "" : key);
  const withoutKeys = (map) => Object.fromEntries(Object.entries(map || {}).filter(([key]) => !removed.has(key) && ![...removed].some((setupKey) => key.startsWith(`${setupKey}:`))));
  return {
    ...skills, customSetups, setupOrder: keep(skills.setupOrder),
    boardSlots: { ...(skills.boardSlots || {}), skills: emptySlot(skills.boardSlots?.skills || []), auras: emptySlot(skills.boardSlots?.auras || []) },
    setupEnabled: withoutKeys(skills.setupEnabled), skillLevels: withoutKeys(skills.skillLevels), customSupports: withoutKeys(skills.customSupports),
    supportOrder: withoutKeys(skills.supportOrder), supportEnabled: withoutKeys(skills.supportEnabled), supportLevels: withoutKeys(skills.supportLevels),
    specialSupportConfigs: withoutKeys(skills.specialSupportConfigs)
  };
}

/**
 * User decision 2026-10-21: only Iris 1 / Iris 2 can hold a Spirit Magus summon in an active skill slot. For any other hero an
 * active-slot Magus (role "aura", boardTab "skills") is removed from the board, its slot left empty. Used on a hero switch
 * (src/app.js) and on read (src/planner-state.js). The skill board is build-wide, not per hero (src/hero-loadouts.js keeps traits
 * and memories only), so switching back to Iris does not bring the Magus back. Returns the same object when nothing changes.
 */
export function removeActiveSlotMagi(skills, heroId) {
  const custom = Array.isArray(skills?.customSetups) ? skills.customSetups : [];
  if (heroCanPlaceMagusInActiveSlot(heroId)) return { skills, removed: [] };
  const isActiveSlotMagus = (setup) => setup?.role === "aura" && setupBoardTab(setup) === "skills";
  const removedSetups = custom.filter(isActiveSlotMagus);
  if (!removedSetups.length) return { skills, removed: [] };
  return { skills: dropSetups(skills, custom.filter((setup) => !isActiveSlotMagus(setup)), new Set(removedSetups.map((setup) => setup.instanceId || setup.name))), removed: removedSetups.map((setup) => setup.name) };
}

/**
 * Saved boards from before 2026-10-21 could hold a Minion's own skill as a board skill. On read each such custom setup becomes its
 * summon in place (same instance id, level and supports) when the summon is not on the board yet; otherwise it is removed with
 * its setup-keyed state (its board slot emptied). Returns the same object when nothing changes; `changes` lists what was done.
 * - Synthetic Troop and module summons are active skills: they keep the slot.
 * - A Spirit Magus summon (an Aura-role skill) in an active slot: kept there for Iris 1 / Iris 2 (boardTab "skills"); for any
 *   other hero removed, the slot left empty (user decision 2026-10-21, as removeActiveSlotMagi). In an Aura slot it stays there.
 * @param {object} skills normalized `state.skills`
 * @param {{ heroId?: string, capturedSetups?: {name: string, role: string}[] }} [context]
 */
export function migrateMinionOwnedSetups(skills, { heroId = null, capturedSetups = selenaCompleteSkillLoadoutSs13.setups } = {}) {
  const custom = Array.isArray(skills?.customSetups) ? skills.customSetups : [];
  if (!custom.some((setup) => isMinionOwnedSkill(setup?.name))) return { skills, changes: [] };
  const captured = (capturedSetups || []).filter((setup) => skills.setupEnabled?.[setup.name] !== false);
  const onBoard = new Set([...captured.map((setup) => setup.name), ...custom.filter((setup) => !isMinionOwnedSkill(setup?.name)).map((setup) => setup.name)]);
  const removed = new Set(), changes = [], customSetups = [];
  for (const setup of custom) {
    const owned = minionOwnedSkill(setup?.name);
    if (!owned) { customSetups.push(setup); continue; }
    const key = setup.instanceId || setup.name;
    const inActiveSlot = setupBoardTab(setup) === "skills";
    if (onBoard.has(owned.owner)) { removed.add(key); changes.push({ kind: "removed", skill: setup.name, owner: owned.owner, key, reason: "duplicate" }); continue; }
    if (owned.family === "spirit-magus" && inActiveSlot && !heroCanPlaceMagusInActiveSlot(heroId)) { removed.add(key); changes.push({ kind: "removed", skill: setup.name, owner: owned.owner, key, reason: "active slot (not Iris)" }); continue; }
    onBoard.add(owned.owner);
    const { effects, tags, boardTab, ...rest } = setup;
    if (owned.family !== "spirit-magus") customSetups.push({ ...rest, name: owned.owner, role: "main" });
    else customSetups.push({ ...rest, name: owned.owner, role: "aura", ...(inActiveSlot ? { boardTab: "skills" } : {}) });
    changes.push({ kind: "replaced", skill: setup.name, owner: owned.owner, key });
  }
  return { skills: dropSetups(skills, customSetups, removed), changes };
}
