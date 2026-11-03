// A gear base's own stats (a weapon's "8 - 8 Physical Damage", "500 Critical Strike Rating", "1.5 Attack Speed"; an armour piece's
// "+168 Gear Armor"): the crafter and the importer store them with the base's other Base Stats lines (implicitModifiers).
//
// What Corrosion replaces (chunk 11, 2026-11-01; research/gear-chunk11-2026-11-01.md §4): gear has Base Stats,
// Base Affixes, Random Affixes and Legendary Affixes (manual 2002000233). Base Stats "are determined by the gear's item name and can't be changed"
// (2002000234: config_modifier type 7, every line of a base item's record, jewellery's and spell weapons' included). Mutation "Removes all Base
// affixes from the gear, then adds 1 Aember Base affix" (corrosion_effect 1 and 8, manual 2002040124). The game log agrees: a corroded Ripple Pendant
// keeps FixedBaseAffix 640002 "+8 Dexterity" beside its corrosion row 60062001 in BaseAffix, and a corroded Lone Walker's Boots its +1615 gear Evasion.
// So a corrosion line takes the rolled Base Affixes and no Base Stats line. First Aember's Mutation (16, 17) "Does not remove Base Affixes".
const GEAR_BASE_STAT_LINE = /^(?:[+-]?\d+(?:\.\d+)?\s*[-–]\s*[+-]?\d+(?:\.\d+)? (?:Physical|Fire|Cold|Lightning|Erosion) Damage|\d+(?:\.\d+)? (?:Critical Strike Rating|Attack Speed)|\+?\d+(?:\.\d+)? (?:Gear Armor|gear Evasion|gear Energy Shield))$/i;

/** Is `text` one of a gear base's own defence or weapon stats? */
export const isGearBaseStatLine = (text) => GEAR_BASE_STAT_LINE.test(String(text ?? "").replace(/\s+/g, " ").trim());

/** Did this item's corrosion line take its rolled Base Affixes? */
export const corrosionRemovesBaseAffixes = (item) => (item?.corrosionModifiers || []).length > 0 && !item?.aemberSource;

const lineKey = (text) => String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * The item's base stat lines held in implicitModifiers but not in modifiers. Saved items can be like this: the load-time legendary
 * reconcile used to drop an implicit that shares its wording with a catalog line (a glove transformed from First Aember: "+120 gear
 * Energy Shield" against Israfel's Laws' "+(340–408) gear Energy Shield"; a game-log import of the same shape), and shared codes
 * carry the loss. src/engine.js effectiveGearModifierTexts counts them, so no saved item has to be re-crafted.
 */
export function missingBaseStatImplicits(item) {
  const implicits = (item?.implicitModifiers || []).filter(isGearBaseStatLine);
  if (!implicits.length) return [];
  const carried = (item.modifiers || []).map(lineKey);
  return implicits.filter((text) => {
    const at = carried.indexOf(lineKey(text));
    if (at < 0) return true;
    carried.splice(at, 1);
    return false;
  });
}
