// A gear base's own stats (a weapon's "8 - 8 Physical Damage", "500 Critical Strike Rating", "1.5 Attack Speed"; an armour piece's
// "+168 Gear Armor"): the crafter and the importer store them with the base's implicit lines (implicitModifiers), but a corrosion
// base affix replaces the implicit affix only (legendary audit 2026-10-22, open question corrosion-keeps-base-stats): the corrosion
// pools carry local multipliers of exactly these stats ("+(15–25)% Gear Physical Damage", "+(5–8)% gear Attack Speed",
// "+(30–50)% Gear Armor"), and a corroded Lone Walker's Boots keeps its +1615 gear Evasion in the game log (src/legendary-base-lines.js;
// research/frost-terra-defense-compare-2026-10-13.md). Before, a corroded rare weapon lost its base damage, crit and speed
// (src/engine.js effectiveGearModifierTexts). Jewellery implicits (Max Life, attributes, resistances) are still replaced.
const GEAR_BASE_STAT_LINE = /^(?:[+-]?\d+(?:\.\d+)?\s*[-–]\s*[+-]?\d+(?:\.\d+)? (?:Physical|Fire|Cold|Lightning|Erosion) Damage|\d+(?:\.\d+)? (?:Critical Strike Rating|Attack Speed)|\+?\d+(?:\.\d+)? (?:Gear Armor|gear Evasion|gear Energy Shield))$/i;

/** Is `text` one of a gear base's own stats (kept when a corrosion base affix replaces the implicit)? */
export const isGearBaseStatLine = (text) => GEAR_BASE_STAT_LINE.test(String(text ?? "").replace(/\s+/g, " ").trim());
