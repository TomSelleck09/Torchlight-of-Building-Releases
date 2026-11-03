// Slates carry the game's own name (user decision 2026-10-26: slates follow the gear naming rule, src/item-base-name.js).
// A legendary slate is named after its template, a god's crafted slate after its god, a Nether King slate
// "Nether King's Divinity: <type>" (its type is stored only in the name, so a custom name with no type keeps its name).
// Copies take the same name (no " Copy" suffix). Game-log imports already use these names (src/game-log-import.js).
const NETHER = /^Nether King's (?:Broken )?Divinity: \S/;
const stripCopySuffix = (name) => {
  let out = String(name || "").trim(), previous;
  do { previous = out; out = out.replace(/\s*\((?:copy\s*)?\d+\)$/i, "").replace(/\s+copy(?:\s+\d+)?$/i, "").trim(); } while (out !== previous);
  return out;
};

/** The game name a slate displays and stores, or its current name when it cannot be told. */
export function slateBaseName(slate) {
  if (!slate || typeof slate !== "object") return "";
  const current = String(slate.name || "");
  if (slate.template) return String(slate.template);
  const bare = stripCopySuffix(current);
  if (slate.god === "Nether King" || NETHER.test(bare)) return NETHER.test(bare) ? bare : current;
  if (slate.rarity === "magic" && slate.god) return String(slate.god);
  return bare || current;
}

/** The slate with its stored name set to the game name (the same object when it already has it). */
export function withSlateBaseName(slate) {
  if (!slate || typeof slate !== "object" || Array.isArray(slate)) return slate;
  const name = slateBaseName(slate);
  return name && name !== slate.name ? { ...slate, name } : slate;
}

/** A saved slate inventory with game names (the same array when nothing changes). */
export function migrateSlateNames(inventory) {
  if (!Array.isArray(inventory)) return inventory;
  const out = inventory.map(withSlateBaseName);
  return out.some((slate, index) => slate !== inventory[index]) ? out : inventory;
}
