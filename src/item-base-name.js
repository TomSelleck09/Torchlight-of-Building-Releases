// Items carry the game's own name (user request 2026-10-26: items can no longer be named). A rare / magic / normal item is
// named after its rare base (by baseId, else a base named by its base or its name), a legendary after the legendary, a
// Vorax item after its Vorax base. A " - Priceless" marker stays (it is part of the game name and src/app.js
// isPricelessItem reads it). Copies take the same name (no " Copy" suffix). An item whose base cannot be found keeps its
// name. Game-log imports already use these names (src/game-log-import.js: base.name / source.name).
import { legendaryGearSs13 } from "./data/gear/legendary-gear-ss13.generated.js";
import { voraxCraftingSs13 } from "./data/gear/vorax-crafting-ss13.generated.js";
import { rareBaseForItem } from "./rare-base-lookup.js";

const PRICELESS = / - Priceless$/i;
// Names the planner or the user added: " Copy" / " copy" (repeated) and " (2)"-style counters.
const stripCopySuffix = (name) => {
  let out = String(name || "").trim(), previous;
  do { previous = out; out = out.replace(/\s*\((?:copy\s*)?\d+\)$/i, "").replace(/\s+copy(?:\s+\d+)?$/i, "").trim(); } while (out !== previous);
  return out;
};
const legendaryByName = new Map(legendaryGearSs13.map((entry) => [entry.name.toLowerCase(), entry.name]));
const voraxByName = new Map(voraxCraftingSs13.bases.map((entry) => [entry.name.toLowerCase(), entry.name]));

/** The game name an item displays and stores, or its current name when no base is known. */
export function itemBaseName(item) {
  if (!item || typeof item !== "object") return "";
  const current = String(item.name || "");
  const priceless = PRICELESS.test(current) ? current.match(PRICELESS)[0] : "";
  const bare = stripCopySuffix(current.replace(PRICELESS, ""));
  const named = (name) => (name ? `${name}${priceless}` : current);
  // A rare base id wins (a crafted or imported rare / magic / normal item), then a legendary of that name (crafted
  // legendaries carry no rarity field), then the Vorax base, then a rare base named by the item's base or name.
  const own = item.baseId ? rareBaseForItem({ baseId: item.baseId }) : null;
  if (own) return named(own.name);
  const legendary = legendaryByName.get(bare.toLowerCase());
  if (legendary) return named(legendary);
  if (item.rarity === "vorax") return named(voraxByName.get(String(item.base || "").toLowerCase()) || voraxByName.get(bare.toLowerCase()) || bare);
  if (!["legendary", "captured"].includes(item.rarity)) { const base = rareBaseForItem(item, [item.base, bare]); if (base) return named(base.name); }
  return named(bare);
}

/** The item with its stored name set to the game name (the same object when it already has it). */
export function withItemBaseName(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const name = itemBaseName(item);
  return name && name !== item.name ? { ...item, name } : item;
}
