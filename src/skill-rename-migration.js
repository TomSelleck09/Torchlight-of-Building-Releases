// Read-time migration for skills the game renamed (src/planner-state.js normalizePlannerState), like
// src/changed-item-migrations.js. SS14 renamed Splitting Lightning Bolt to Forking Thunder (in-game tooltip, user
// 2026-10-27), with its exclusive supports ("Splitting Lightning Bolt: Swift Bolt (Magnificent)" →
// "Forking Thunder: Swift Bolt (Magnificent)", "…: Disintegration (Noble)"). Saved builds name the skill in setup names,
// support names and texts, and in keys such as "<setup>:<support>" (supportEnabled, specialSupportConfigs, supportLevels),
// so every string and key in the saved state is rewritten. Idempotent; nothing is deleted: when a renamed key already
// exists under its new name, the new-name entry is kept and the old one stays as saved. Storage is not rewritten eagerly.

export const RENAMED_SKILLS = Object.freeze({ "Splitting Lightning Bolt": "Forking Thunder" });

const renames = Object.entries(RENAMED_SKILLS);
const renameText = (text) => renames.reduce((value, [from, to]) => value.includes(from) ? value.split(from).join(to) : value, text);

function migrate(value) {
  if (typeof value === "string") return renameText(value);
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => { const migrated = migrate(item); if (migrated !== item) changed = true; return migrated; });
    return changed ? next : value;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return value;
  let changed = false;
  const entries = Object.entries(value).map(([key, item]) => {
    const migrated = migrate(item);
    let newKey = renameText(key);
    if (newKey !== key && Object.hasOwn(value, newKey)) newKey = key; // keep both: the new-name entry wins on its own key
    if (migrated !== item || newKey !== key) changed = true;
    return [newKey, migrated];
  });
  return changed ? Object.fromEntries(entries) : value;
}

/** The saved planner state with renamed skills and their supports under their current names (same object when unchanged). */
export function migrateRenamedSkills(state) {
  return migrate(state);
}
