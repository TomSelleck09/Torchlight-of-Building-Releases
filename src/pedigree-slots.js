import { divinitySlateAffixesSs13 } from "./data/divinity-slate-affixes-ss13.js";
import { pedigreeCoreAffixesSs13 } from "./data/pedigree-core-affixes-ss13.js";

// Pedigree of Gods (reference data Divinity Slate, base 1010) has four talent slots, each rolled when the
// slate drops and never crafted:
//   1–2: <Micro Talent or Medium Talent>   3: <Medium Talent or Lv.1 Core Talent>   4: <Lv.2 Core Talent>
// The nodes come from any profession talent tree, at the tree's own values. "Medium Talent"
// includes Legendary Medium Talents: an in-game Pedigree (2026-10-10 screenshot) rolled the
// Warrior Legendary Medium "Gains a stack of Fortitude when using a Melee Skill" in slot 1 and
// the Machinist Medium "+12% Minion Damage while having Bond | +20% Bond Gaining Speed" in slot 2.
export const PEDIGREE_OF_GODS = "Pedigree of Gods";
export const pedigreeSlotTypes = [
  ["Micro Talent", "Medium Talent", "Legendary Medium Talent"],
  ["Micro Talent", "Medium Talent", "Legendary Medium Talent"],
  ["Medium Talent", "Legendary Medium Talent", "Lv.1 Core Talent"],
  ["Lv.2 Core Talent"],
];

const talentNodes = Object.entries(divinitySlateAffixesSs13).flatMap(([god, affixes]) => affixes.map((affix) => ({ ...affix, god })));
export const pedigreeAffixPool = [...talentNodes, ...pedigreeCoreAffixesSs13];

// Same value the slate editor stores for a legendary-template option.
export const pedigreeAffixValue = ({ tree, name, effect, talentName }) => `${tree}: ${name}: ${talentName ? `${talentName} — ` : ""}${effect}`;

const validValues = pedigreeSlotTypes.map((types) => new Set(pedigreeAffixPool.filter((affix) => types.includes(affix.name)).map(pedigreeAffixValue)));
export const isPedigreeSlate = (slate) => (slate?.template || slate?.name) === PEDIGREE_OF_GODS && Array.isArray(slate?.affixes);
export const isValidPedigreeAffix = (index, value) => !value || Boolean(validValues[index]?.has(value));

// Saved values that are not a Pedigree talent node for their slot (an older pool, an import) are
// cleared in the computed state; the saved build itself is left untouched.
export function normalizePedigreeAffixes(affixes = []) {
  const cleared = [];
  const normalized = pedigreeSlotTypes.map((_, index) => {
    const value = affixes[index] || "";
    if (isValidPedigreeAffix(index, value)) return value;
    cleared.push({ slot: index + 1, value });
    return "";
  });
  return { affixes: normalized, cleared };
}
