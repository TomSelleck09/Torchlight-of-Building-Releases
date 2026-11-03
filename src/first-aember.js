// First Aember crafting (2026-10-28; research/first-aember-2026-10-28.md, user-supplied answers 2026-10-28, provisional:
// open question `first-aember-crafting`).
//
// First Aember (legendary 112358, STR Gloves) is the only gear that can be corroded again. Its Mutation adds Aember Base
// Affixes (the game's Corrosion Base Affixes, config_modifier 6006 40 NN = the planner's "STR Gloves" corrosion pool) and
// keeps the ones already there, up to 4; its Desecration replaces it with one of the Matchless Legendary Gloves
// (config_item_gold rarity level 2) and "Retains Aember Base Affixes" (corrosion_effect 20 / 21).
//
// User answers (2026-10-28, provisional): the Aember lines come from First Aember's own STR Gloves pool (13 lines), up to 4, no
// line twice; the transform offers the 18 other Matchless gloves (exclusive drops included, First Aember itself not); the new
// glove takes its own legendary base and base defence, keeps First Aember's item level (and Energy), is Corroded and keeps the
// Aember lines exactly as rolled (a "+X% Gear Armor" line stays Armor on an INT glove); its own lines use the normal legendary
// roll editor. The item stores the Aember lines in `corrosionModifiers` and `aemberSource: "First_Aember"`.
import { corrosionImplicitPoolsSs13, defaultBaseForItem } from "./data/gear/corrosion-implicits-ss13.js";
import { legendaryBasesSs14 } from "./data/gear/legendary-bases-ss14.generated.js";
import { rareBaseItemsSs13 } from "./data/gear/rare-base-items-ss13.generated.js";
import { matchCorrosionEntry } from "./corrosion-implicit-options.js";

export const FIRST_AEMBER_ID = "First_Aember";
export const AEMBER_SOURCE = "First_Aember";
export const AEMBER_MAX_LINES = 4;
export const AEMBER_POOL_BASE = "STR Gloves";

/** The 19 Matchless Legendary Gloves (config_item_gold rarity level 2; reference data "Matchless Legendary gear"), First Aember included. */
export const MATCHLESS_GLOVE_IDS = Object.freeze([
  "Aeterna_Martyr", "Archmages_Hands", "Israfels_Laws", "Miniature_Void_Sea", "Tyrants_Iron_Fist",
  "Blade-dancers_Fingers", "Clenched_Spring", "Deaths_Touch", "Demons_Touch", "First_Aember", "Ghost_Slaughter",
  "Magnus_Laws", "Quantum_Convergence", "Chaos_Abyss", "Ralphs_Laws", "Stray_Birds_Return", "Thunder_Manipulator",
  "Torturers_Touch", "Wings_of_Light"
]);

const plainName = (item) => String(item?.name || "").replace(/ - Priceless$/i, "").trim().toLowerCase();

/** Is the item a First Aember (untransformed)? */
export const isFirstAember = (item) => plainName(item) === "first aember" && (!item?.rarity || item.rarity === "legendary");

/** Does the item take Aember base affixes (a First Aember, or a glove it was transformed into)? */
export const isAemberItem = (item) => Boolean(item) && (isFirstAember(item) || item.aemberSource === AEMBER_SOURCE);

/** Is the item a glove transformed from First Aember? */
export const isTransformedAember = (item) => Boolean(item) && item.aemberSource === AEMBER_SOURCE && !isFirstAember(item);

/** The Aember base affix pool: First Aember's STR Gloves corrosion base pool (13 lines). */
export const aemberPool = () => corrosionImplicitPoolsSs13[AEMBER_POOL_BASE] || [];

/** The pool index of a saved Aember line (-1 when the pool does not hold it). */
export const aemberLineIndex = (text) => matchCorrosionEntry(aemberPool(), text)?.index ?? -1;

/** The item's Aember lines (its corrosion lines). */
export const aemberLines = (item) => (item?.corrosionModifiers || []).filter(Boolean);

/** Pool indexes already on the item (duplicates are blocked). */
export const usedAemberIndexes = (lines) => new Set((lines || []).map(aemberLineIndex).filter((index) => index >= 0));

/** Can pool line `index` be added to `lines`? (below 4 lines, not already there) */
export function canAddAemberLine(lines, index) {
  const entry = aemberPool()[index];
  if (!entry) return false;
  if ((lines || []).filter(Boolean).length >= AEMBER_MAX_LINES) return false;
  return !usedAemberIndexes(lines).has(Number(index));
}

/** The catalog entries the Desecration can give: the 18 Matchless gloves other than First Aember, in catalog order. */
export function aemberTransformTargets(catalog) {
  const allowed = new Set(MATCHLESS_GLOVE_IDS.filter((id) => id !== FIRST_AEMBER_ID));
  return (catalog || []).filter((entry) => allowed.has(entry.id));
}

/** A legendary's own game base: { base (item name), type ("INT Gloves"), baseId, line (its base defence) }. */
export function legendaryGameBase(entry) {
  const record = legendaryBasesSs14[entry?.name];
  const type = record?.type || defaultBaseForItem(entry || {});
  const rare = record ? rareBaseItemsSs13.find((base) => base.name === record.base && base.type === record.type) : null;
  return { base: record?.base || "", type, baseId: record?.baseId, line: rare?.modifiers?.[0] || "" };
}

/**
 * The glove First Aember's Desecration turns `item` into: `target` (a catalog entry) with its own base and base defence line,
 * `legendaryModifiers` (the target's lines, rolled by the caller), no upgraded lines, the item's Aember lines, item level and
 * Energy, and the provenance marker. The item id is kept so an equipped copy stays linked.
 */
export function transformFirstAember(item, target, legendaryModifiers) {
  const base = legendaryGameBase(target);
  const lines = [...(legendaryModifiers || target.modifiers)];
  const implicitModifiers = base.line ? [base.line] : [];
  const out = {
    ...(item?.id ? { id: item.id } : {}),
    name: target.name, slot: target.slot || "gloves", icon: target.icon, source: target.source, rarity: "legendary",
    base: base.type, level: item?.level ?? target.level,
    ...(item?.itemLevel != null ? { itemLevel: item.itemLevel } : {}),
    energy: item?.energy ?? 0,
    legendaryModifiers: lines, implicitModifiers, modifiers: [...lines, ...implicitModifiers],
    corrodedModifierIndices: [], corrosionModifiers: aemberLines(item).slice(0, AEMBER_MAX_LINES),
    affixCount: lines.length, aemberSource: AEMBER_SOURCE
  };
  return out;
}

/** Revert a transformed glove to First Aember (`firstAember` is the catalog entry; `legendaryModifiers` its rolled lines). */
export function revertToFirstAember(item, firstAember, legendaryModifiers) {
  const out = transformFirstAember(item, firstAember, legendaryModifiers);
  // First Aember keeps its base affixes on Mutation, so its base defence stays (Old King's Rerebraces, +1777 Gear Armor).
  return out;
}

/**
 * The glove the Craft Legendary dialog creates after a Desecration (2026-10-28: the First Aember editor lives only in that
 * dialog): the crafted First Aember (`firstAember` catalog entry: its level; item level, Energy and Aember `lines` from the
 * dialog) transformed into `target`, with the dialog's rolled `legendaryModifiers` and Corroded line picks. The same item a
 * transform of that crafted First Aember gives.
 */
export function craftTransformedAember(firstAember, target, { lines = [], energy = 0, itemLevel = 100, legendaryModifiers, corrodedModifierIndices = [] } = {}) {
  const crafted = { level: firstAember?.level, itemLevel, energy, corrosionModifiers: (lines || []).filter(Boolean) };
  return { ...transformFirstAember(crafted, target, legendaryModifiers), corrodedModifierIndices: [...corrodedModifierIndices] };
}

/** Normalize a saved item's marker: only "First_Aember" is kept. */
export function normalizeAemberItem(item) {
  if (item && "aemberSource" in item && item.aemberSource !== AEMBER_SOURCE) delete item.aemberSource;
  return item;
}
