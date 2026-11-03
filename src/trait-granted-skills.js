// Skills only a hero trait puts on the skill board (user decision 2026-10-21): Youga's Stasis Vault / Supreme Descent / Selves of
// All Realms (Spacetime Dictator / Conqueror / Overlord) and Erika's Vendetta (Vendetta's Sting) / Endless Vendetta (Swift Stalk).
// The links come from the game's grant texts and the trait catalog (src/data/heroes/trait-granted-skills.generated.js,
// scripts/build-trait-granted-skills.mjs). These skills are never offered in the skill picker (src/minion-skill-owners.js
// boardSkillChoices); picking the trait grants them (src/trait-board-grants.js) and unpicking removes them. A saved board setup of
// one (picked by hand before 2026-10-21) is migrated on read (migrateTraitGrantedSetups).
import { traitGrantedSkills, traitSkillGrants, traitSkillSwaps } from "./data/heroes/trait-granted-skills.generated.js";
import { storedTreeRows } from "./hero-trait-tree.js";
import { dropSetups } from "./minion-skill-owners.js";

export const TRAIT_GRANTED_SKILL_NAMES = Object.freeze(traitGrantedSkills.map((skill) => skill.name));
const GRANTED = new Set(TRAIT_GRANTED_SKILL_NAMES);
export const isTraitGrantedSkill = (name) => GRANTED.has(name);

/** The grants that can put a skill on the board: its own grant, or a grant whose skill a swap turns into it (`swap` set). */
export function traitSkillGrantsFor(name) {
  const direct = traitSkillGrants.filter((grant) => grant.skill === name).map((grant) => ({ ...grant, swap: null }));
  const swapped = traitSkillSwaps.filter((swap) => swap.to === name).flatMap((swap) => traitSkillGrants
    .filter((grant) => grant.skill === swap.from && grant.heroId === swap.heroId).map((grant) => ({ ...grant, skill: name, swap })));
  return [...direct, ...swapped];
}

/** A granted skill with the skills swaps link it to (Vendetta ↔ Endless Vendetta): the game equips one of them. */
export function traitSkillFamily(name) {
  const family = new Set([name]);
  for (let grown = true; grown;) {
    grown = false;
    for (const swap of traitSkillSwaps) for (const [from, to] of [[swap.from, swap.to], [swap.to, swap.from]]) if (family.has(from) && !family.has(to)) { family.add(to); grown = true; }
  }
  return [...family];
}

/**
 * The setup key a granted skill's supports are stored under: `trait:<skill>` for the skill a trait grants, and the granted
 * skill's own key for a skill a swap turns it into (Endless Vendetta → trait:Vendetta). One key per granted slot, so the slot's
 * supports carry over when the swapping trait is picked or unpicked (user decision 2026-10-21). Supports the new skill cannot
 * take stay stored and read inactive through the normal support filter.
 */
export function traitSkillSupportsKey(name) {
  let root = name;
  for (const seen = new Set([name]); !traitSkillGrants.some((grant) => grant.skill === root);) {
    const swap = traitSkillSwaps.find((entry) => entry.to === root && !seen.has(entry.from));
    if (!swap) break;
    root = swap.from;
    seen.add(root);
  }
  return `trait:${root}`;
}

// The selected hero's trait names as stored (base trait plus its 45 / 60 / 75 picks; tree heroes' rows or the one-per-level picks).
function storedTraitNames(hero = {}) {
  const heroId = hero?.selectedHeroId;
  const levelPicks = [45, 60, 75].flatMap((level) => [hero?.selectedTraits?.[`${heroId}:level${level}`], hero?.selectedTraits?.[`level${level}`]]);
  return new Set([...storedTreeRows(hero, heroId), ...levelPicks].filter((name) => typeof name === "string" && name));
}

/** Whether the saved hero state picks a trait that grants this skill (the base trait counts as picked for its hero). */
export function heroPicksTraitGrant(hero, name) {
  const picks = storedTraitNames(hero);
  const has = (heroId, trait, level) => hero?.selectedHeroId === heroId && (level === 1 || picks.has(trait));
  return traitSkillGrantsFor(name).some((grant) => has(grant.heroId, grant.trait, grant.traitLevel) && (!grant.swap || has(grant.swap.heroId, grant.swap.trait, grant.swap.traitLevel)));
}

const SETUP_KEYED = ["setupEnabled", "skillLevels", "customSupports", "supportOrder", "supportEnabled", "supportLevels", "specialSupportConfigs"];

// Moves one setup key's state to another (customSupports / supportOrder by key; per-support entries "<key>:<support>").
function moveSetupKeyState(skills, from, to) {
  const next = { ...skills };
  for (const field of ["customSupports", "supportOrder", "setupEnabled", "skillLevels"]) if (skills[field] && Object.hasOwn(skills[field], from)) {
    const { [from]: value, ...rest } = skills[field];
    next[field] = { ...rest, [to]: value };
  }
  for (const field of ["supportEnabled", "supportLevels", "specialSupportConfigs"]) if (skills[field])
    next[field] = Object.fromEntries(Object.entries(skills[field]).map(([entryKey, value]) => [entryKey.startsWith(`${from}:`) ? `${to}${entryKey.slice(from.length)}` : entryKey, value]));
  return next;
}

/**
 * Supports saved under a swapped skill's own key (trait:Endless Vendetta, before 2026-10-21) move to the slot's key
 * (trait:Vendetta) when that key holds none; a non-empty slot key is never overwritten (the old key is then left as stored).
 */
export function mergeSwappedSupportKeys(skills) {
  let next = skills;
  const changes = [];
  for (const swap of traitSkillSwaps) {
    const from = `trait:${swap.to}`, to = traitSkillSupportsKey(swap.to);
    if (from === to || !(next?.customSupports?.[from] || []).length || (next.customSupports[to] || []).length) continue;
    next = moveSetupKeyState(next, from, to);
    changes.push({ kind: "merged", skill: swap.to, key: from, to });
  }
  return { skills: next, changes };
}

/**
 * Saved boards from before 2026-10-21 could hold a trait skill as an ordinary board skill. On read each such custom setup leaves
 * the board (its slot emptied, its setup-keyed state dropped). When the saved hero picks the granting trait, the setup's supports
 * and their per-support state (order, levels, enabled flags, configs) move first to the granted skill's own key
 * `trait:<skill>`, which the grant reads (src/planner.js resolveSetupSupports), unless that key already holds supports. Returns
 * the same object when nothing changes; `changes` lists what was done.
 * @param {object} skills normalized `state.skills`
 * @param {object} hero normalized `state.hero`
 */
export function migrateTraitGrantedSetups(skills, hero = {}) {
  const merged = mergeSwappedSupportKeys(skills);
  if (merged.changes.length) skills = merged.skills;
  const custom = Array.isArray(skills?.customSetups) ? skills.customSetups : [];
  if (!custom.some((setup) => isTraitGrantedSkill(setup?.name))) return { skills, changes: merged.changes };
  const removed = new Set(), changes = [];
  const next = Object.fromEntries(SETUP_KEYED.map((field) => [field, { ...(skills[field] || {}) }]));
  for (const setup of custom) {
    if (!isTraitGrantedSkill(setup?.name)) continue;
    const key = setup.instanceId || setup.name, target = traitSkillSupportsKey(setup.name);
    removed.add(key);
    const supports = [...(Array.isArray(setup.supports) ? setup.supports : []), ...(Array.isArray(skills.customSupports?.[key]) ? skills.customSupports[key] : [])];
    const picked = heroPicksTraitGrant(hero, setup.name);
    const targetTaken = (next.customSupports[target] || []).length > 0;
    if (!picked || targetTaken || !supports.length) {
      changes.push({ kind: "removed", skill: setup.name, key, reason: !picked ? "granting trait not picked" : targetTaken ? "granted skill already has supports" : "no supports" });
      continue;
    }
    next.customSupports[target] = supports.map((support) => ({ ...support }));
    for (const field of ["supportOrder"]) if (skills[field]?.[key] !== undefined) next[field][target] = structuredClone(skills[field][key]);
    for (const field of ["supportEnabled", "supportLevels", "specialSupportConfigs"]) for (const [entryKey, value] of Object.entries(skills[field] || {}))
      if (entryKey.startsWith(`${key}:`)) next[field][`${target}${entryKey.slice(key.length)}`] = structuredClone(value);
    changes.push({ kind: "moved", skill: setup.name, key, to: target, supports: supports.map((support) => support.name) });
  }
  const moved = { ...skills, ...next };
  return { skills: dropSetups(moved, custom.filter((setup) => !removed.has(setup.instanceId || setup.name)), removed), changes: [...merged.changes, ...changes] };
}
