// Saved legendary texts normalized on read (src/planner-state.js normalizePlannerState). Storage is not rewritten eagerly: a
// save carries the corrected text only when the build is next saved.
//
// Goddess of Hunting's Dirge (Pantheon's Elegy) is read as printed: "+120% Attack and Cast Speed" (official patch notes and the
// TLIDB hover text). The earlier rewrite of +120% to +150% is gone.
//
// Unsigned positive rolls (research/unique-item-coverage-2026-10-13.md §4.5): a clause-leading roll range that spans zero
// ("(-1–1) Main Skill Level", "(0–10) % additional Attack and Cast Speed") carries no sign in the template, and the editor
// used to save a positive roll without "+" ("1 Main Skill Level"), which the "+"-anchored readers skip. The editor now
// writes the sign (src/app.js resolveModifierRolls); saved lines that match such a template are given their "+" on read.
import { legendaryPlaceholderPoolsSs13 } from "./data/gear/legendary-placeholder-pools-ss13.generated.js";
import { legendaryGearSs13 } from "./data/gear/legendary-gear-ss13.generated.js";
import { legendaryCorrodedModifiersSs13 } from "./data/gear/legendary-corroded-modifiers-ss13.generated.js";
import { legendaryBasesSs14 } from "./data/gear/legendary-bases-ss14.generated.js";
import { equipmentBaseTypesBySlotSs13 } from "./data/gear/corrosion-implicits-ss13.js";

// Legendary base types (legendary audit 2026-10-22): the crafter used to save the base guessed from the icon, every armour piece as
// its STR type and the hammer / crossbow / musket icons as Claw. The game's own record gives the real base type
// (src/data/gear/legendary-bases-ss14.generated.js). A saved legendary whose base is exactly that old guess, and differs from the
// game's type, is moved to the game's type on read; a base the player picked otherwise stays.
const LEGACY_ICON_TOKENS = [["2HSword", "Two-Handed Sword"], ["2HHammer", "Two-Handed Hammer"], ["2HAxe", "Two-Handed Axe"], ["Staff", "Tin Staff"], ["1HSword", "One-Handed Sword"], ["1HHammer", "One-Handed Hammer"], ["1HAxe", "One-Handed Axe"], ["FireCannon", "Fire Cannon"], ["Crossbow", "Crossbow"], ["Musket", "Musket"], ["Pistol", "Pistol"], ["Scepter", "Scepter"], ["Dagger", "Dagger"], ["Claw", "Claw"], ["Wand", "Wand"], ["Cane", "Cane"], ["Cudgel", "Cudgel"], ["Bow", "Bow"], ["Rod", "Rod"], ["Shield", "STR Shield"]];
const catalogByName = new Map(legendaryGearSs13.map((entry) => [entry.name, entry]));
function legacyGuessedBase(entry) {
  if (entry.id === "Suns_Embrace") return "STR Helmet";
  return LEGACY_ICON_TOKENS.find(([token]) => entry.remoteIcon.includes(token))?.[1] || equipmentBaseTypesBySlotSs13[entry.slot]?.[0] || "";
}
/** The game's base type for a saved legendary still on the crafter's old icon guess, else null. */
export function migratedLegendaryBase(item) {
  if (!item?.base || (item.rarity && !["legendary", "captured"].includes(item.rarity))) return null;
  const name = String(item.name || "").replace(/ - Priceless$/i, "");
  const entry = catalogByName.get(name), game = legendaryBasesSs14[name]?.type;
  if (!entry || !game || item.base === game) return null;
  return item.base === legacyGuessedBase(entry) ? game : null;
}

const RANGE = /\((-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\)/;
// Vorax / craft affix templates outside the legendary catalogs (craft-affixes-ss13.generated.js is not loaded here).
const EXTRA_SPANNING_TEMPLATES = ["(-1–1)% additional Hit Damage for skills cast by Spell Burst"];
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let unsignedPatterns = null;

function spanningTemplateRests() {
  const lines = new Set(EXTRA_SPANNING_TEMPLATES);
  const add = (text) => { if (typeof text === "string") for (const line of text.split("\n")) lines.add(line.trim()); };
  for (const item of legendaryGearSs13) (item.modifiers || []).forEach(add);
  for (const modifiers of Object.values(legendaryCorrodedModifiersSs13)) (modifiers || []).forEach(add);
  for (const legendary of Object.values(legendaryPlaceholderPoolsSs13)) for (const pool of legendary.pools || []) for (const option of pool.options || []) (option?.effect || []).forEach(add);
  const rests = new Set();
  for (const line of lines) {
    const match = line.match(new RegExp(`^${RANGE.source}`));
    if (match && Number(match[1]) <= 0 && Number(match[2]) > 0) rests.add(line.slice(match[0].length));
  }
  return rests;
}

function unsignedRollPatterns() {
  if (unsignedPatterns) return unsignedPatterns;
  unsignedPatterns = [...spanningTemplateRests()].map((rest) => {
    // The saved text resolves every later range to a number and joins "N %" into "N%" (resolveModifierRolls).
    const pieces = rest.split(new RegExp(RANGE.source, "g")).filter((_, index) => index % 3 === 0).map((piece) => escapeRegExp(piece).replace(/\\?\s+%/g, "\\s*%").replace(/ /g, "\\s*"));
    return new RegExp(`^(\\d+(?:\\.\\d+)?)${pieces.join("-?\\d+(?:\\.\\d+)?")}$`);
  });
  return unsignedPatterns;
}

/** One saved line with an unsigned positive roll of a zero-spanning template written as "+N" (the same text otherwise). */
export function signUnsignedRoll(line) {
  if (typeof line !== "string" || !/^\d/.test(line) || /^0+(?:\.0+)?\D/.test(line)) return line;
  return unsignedRollPatterns().some((pattern) => pattern.test(line)) ? `+${line}` : line;
}

/** One saved modifier text with its unsigned positive rolls signed (the same string when nothing changes). */
export function migrateLegendaryText(text) {
  if (typeof text !== "string") return text;
  return /(^|\n)\d/.test(text) ? text.split("\n").map(signUnsignedRoll).join("\n") : text;
}

/** An equipment item with its string-array fields migrated (the same object when nothing changes). */
export function migrateLegendaryItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  let changed = null;
  const base = migratedLegendaryBase(item);
  if (base) changed = { base };
  for (const [key, value] of Object.entries(item)) {
    if (!Array.isArray(value) || !value.some((entry) => typeof entry === "string")) continue;
    const migrated = value.map(migrateLegendaryText);
    if (migrated.some((entry, index) => entry !== value[index])) (changed ??= {})[key] = migrated;
  }
  return changed ? { ...item, ...changed } : item;
}

/** equipmentOverrides ({ slot: item }) and equipmentInventory ([item]) with migrated items (same containers when unchanged). */
export function migrateLegendaryEquipment(overrides, inventory) {
  let overridesOut = overrides, inventoryOut = inventory;
  if (overrides && typeof overrides === "object") {
    const entries = Object.entries(overrides).map(([slot, item]) => [slot, migrateLegendaryItem(item)]);
    if (entries.some(([slot, item]) => item !== overrides[slot])) overridesOut = Object.fromEntries(entries);
  }
  if (Array.isArray(inventory)) {
    const items = inventory.map(migrateLegendaryItem);
    if (items.some((item, index) => item !== inventory[index])) inventoryOut = items;
  }
  return { overrides: overridesOut, inventory: inventoryOut };
}
