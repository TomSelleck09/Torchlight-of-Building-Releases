// Rare base lookups that respect the game's item_base ids (src/data/gear/rare-base-game-ids.generated.js).
// Three names have two bases: a regular one and a legacy record that reference data also lists, with its own icon and no implicit
// (Imperishable Black Robe Lv70 #3209 / Lv66 #3214, Respected Tutor's Robe Lv62 #3207 / Lv61 #3212, Divine Arbiter's
// Defense Lv62 #3007 / Lv61 #3012). The legacy record (game flag 0) is not obtainable, so it is hidden from the base
// pickers and saved items on it are moved to the regular base on read (src/changed-item-migrations.js). A lookup by
// name never takes the legacy record: an item's own base id wins, then the game id, then the regular base of that name.
import { rareBaseItemsSs13 } from "./data/gear/rare-base-items-ss13.generated.js";
import { rareBaseGameIds } from "./data/gear/rare-base-game-ids.generated.js";

const byId = new Map(rareBaseItemsSs13.map((entry) => [entry.id, entry]));
const byGameId = new Map(Object.entries(rareBaseGameIds).map(([id, value]) => [String(value.gameId), byId.get(id)]).filter(([, entry]) => entry));
const isRegular = (entry) => rareBaseGameIds[entry.id]?.active !== false;
const sameBase = (a, b) => a !== b && a.name === b.name && a.type === b.type && a.slot === b.slot;

export function rareBaseById(id) { return id ? byId.get(id) || null : null; }
export function rareBaseByGameId(gameId) { return gameId == null || gameId === "" ? null : byGameId.get(String(Number(gameId))) || null; }

/** The regular base that replaces a legacy duplicate (same name, type and slot), or null when `entry` is not one. */
export function activeRareBaseFor(entry) {
  if (!entry || isRegular(entry)) return null;
  return rareBaseItemsSs13.find((other) => sameBase(other, entry) && isRegular(other)) || null;
}
/** A legacy record that shares its name with a regular base (hidden from the base pickers). */
export function isLegacyRareBase(entry) { return Boolean(activeRareBaseFor(entry)); }

/** The rare base named `name` (case-insensitive; optional `type`), preferring the regular base over a legacy duplicate. */
export function rareBaseByName(name, type = null) {
  const wanted = String(name || "").trim().toLowerCase();
  if (!wanted) return null;
  const matches = rareBaseItemsSs13.filter((entry) => entry.name.toLowerCase() === wanted && (!type || entry.type === type));
  return matches.find(isRegular) || matches[0] || null;
}

/** A saved item's rare base: its own base id first, then the first of `names` that names a base (regular base preferred). */
export function rareBaseForItem(item, names = []) {
  const own = rareBaseById(item?.baseId);
  if (own) return own;
  for (const name of names) { const entry = rareBaseByName(name); if (entry) return entry; }
  return null;
}
