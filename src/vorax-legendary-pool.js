// The Legendary affixes a Vorax limb can take by Grafting (the Vorax crafter's "L" slot toggle and the game-log import).
//
// Game manual (system_help 45, "Graft"): "Use Core Organs and Sutures to add Legendary affixes to Vorax Gear … affix options
// will be provided based on the number of affixes on the corresponding Legendary gear … The Legendary affixes of a Vorax Gear
// must come from the same Legendary gear." An organ grafts "affixes related to [<Legendary>]" (item_base|description2 of each
// "Organ: <Legendary>" item), i.e. the lines of that legendary's config_item_gold slots, and a slot that rolls one of several
// groups offers each of them: the user's in-game Lv.89 Vorax Limb: Neck (2026-11-09) holds "Law of Greed: +72% damage per stack
// of Max Spell Burst, up to +320%" and "Law of Greed: +47% Projectile Speed per stack of Max Spell Burst, up to +200%", two
// groups (5152843, 5152845) of Law of Greed's one rolled slot (config_modifier 51528431 / 51528451, the normal tier; a Vorax
// item cannot be corroded, Func_S13_Equip_Forge_IllegalTips1).
//
// The donor lists (src/data/gear/vorax-crafting-ss13.generated.js) are reference data's Vorax pages, which print a rolled slot's first
// roll only and a "<Random …>" placeholder as text, so the crafter offered one roll of each such slot. Each slot now offers the
// rolls the legendary crafter offers (src/legendary-placeholder-pools.js: the game's rolled slots of config_item_gold, chunk 12,
// and the placeholder pools), the normal template of each. Ids: a line already offered keeps `${donor.id}-mod-${index}`, so
// saved items stay valid; another roll of the same slot is `${donor.id}-mod-${index}-${option.id}`.
import { voraxCraftingSs13 } from "./data/gear/vorax-crafting-ss13.generated.js";
import { legendaryGearSs13 } from "./data/gear/legendary-gear-ss13.generated.js";
import { placeholderPool } from "./legendary-placeholder-pools.js";

const RANGE = /\((-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\)/g;
const shape = (text) => String(text || "").replace(/&#0?39;/g, "'").replace(/\s+%/g, "%").replace(/\s+,/g, ",").replace(/\s+/g, " ").trim().toLowerCase().replace(RANGE, "#").replace(/-?\d+(?:\.\d+)?/g, "#");
const isPlaceholder = (text) => /^<[^>]+>$/.test(String(text || "").trim());

/** The crafter's "+#" label of a template (numbers and ranges blanked), as the craft families show. */
export function voraxModifierLabel(template) {
  return String(template).replace(/\((-?\d+(?:\.\d+)?)\s*–\s*(-?\d+(?:\.\d+)?)\)/g, (_, minimum, maximum) => Number(minimum) < 0 && Number(maximum) < 0 ? "-#" : "#").replace(/(-?)\d+(?:\.\d+)?/g, "$1#");
}

const legendaryByName = new Map(legendaryGearSs13.map((entry) => [entry.name.toLowerCase(), entry]));
const family = (donor, id, template, extra = {}) => ({ id, label: `[${donor.name}] ${voraxModifierLabel(template)}`, library: "Legendary", donor: donor.name, tiers: [{ tier: "L", level: donor.level || 1, template }], ...extra });

/** Every graftable donor line of one donor: its catalog lines, and each other roll of a rolled or placeholder slot. */
export function voraxDonorFamilies(donor) {
  const legendary = legendaryByName.get(String(donor?.name || "").toLowerCase());
  return (donor?.modifiers || []).flatMap((template, index) => {
    const own = family(donor, `${donor.id}-mod-${index}`, template, { slotIndex: index });
    const pool = legendary ? placeholderPool(legendary.id, index) : null;
    if (!pool) return [own];
    const ownShape = shape(template);
    const rolls = pool.options.filter((option) => option.template && (isPlaceholder(template) || shape(option.template) !== ownShape));
    return [own, ...rolls.map((option) => family(donor, `${donor.id}-mod-${index}-${option.id}`, option.template, { slotIndex: index, roll: option.id }))];
  });
}

const pools = new Map();
/** The Legendary affix families of a Vorax base (its reference data donors, every roll of each donor's rolled slots). */
export function voraxLegendaryAffixPool(baseName) {
  if (!pools.has(baseName)) pools.set(baseName, Object.freeze((voraxCraftingSs13.legendaryDonors[baseName] || []).flatMap(voraxDonorFamilies)));
  return pools.get(baseName);
}
