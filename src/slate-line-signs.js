// Saved slates store their lines as text. Before 2026-11-01 the talent catalog carried reference data's wording, which drops the "+" on a
// non-whole value ("1.25% Energy Shield Regain"; game template "+$P1$%", research/talents-chunk3-2026-11-01.md F1). The catalog has
// its "+" back, so on load (src/planner-state.js normalizePlannerState) a saved line takes it too: the readers that want "+X" read
// the line, the slate editor finds its option, and the Max Active Divinity key matches. Only a clause the catalog signs changes;
// the value stays as saved, so a rolled line keeps its roll.
import { allProfessionTalentCatalogueSs13 } from "./data/talents/all-profession-trees-ss13.generated.js";

const mask = (text) => text.replace(/\d+(?:\.\d+)?/g, "#");
const SIGNED = new Set(Object.values(allProfessionTalentCatalogueSs13).flatMap((tree) => tree.nodes || [])
  .flatMap((node) => String(node.description || "").split(" | "))
  .filter((clause) => clause.startsWith("+"))
  .map((clause) => mask(clause.slice(1))));

const LINE = /^(.*?(?:Micro|Medium|Legendary Medium) Talent: )(.+)$/s;
const signedClause = (clause) => (/^\d/.test(clause) && SIGNED.has(mask(clause)) ? `+${clause}` : clause);

/** One saved slate line with the catalog's "+" on each clause (the same string when nothing changes). */
export function signSlateLine(affix) {
  const match = typeof affix === "string" ? affix.match(LINE) : null;
  return match ? `${match[1]}${match[2].split(" · ").map(signedClause).join(" · ")}` : affix;
}

const signList = (list) => (Array.isArray(list) ? list.map(signSlateLine) : list);

/** A saved slate inventory with every talent line signed as the catalog signs it (the same array when nothing changes). */
export function signSavedSlateLines(inventory) {
  if (!Array.isArray(inventory)) return inventory;
  let changed = false;
  const next = inventory.map((slate) => {
    const affixes = signList(slate?.affixes);
    const groups = slate?.affixGroups ? Object.fromEntries(Object.entries(slate.affixGroups).map(([group, list]) => [group, signList(list)])) : slate?.affixGroups;
    if (JSON.stringify(affixes) === JSON.stringify(slate?.affixes) && JSON.stringify(groups) === JSON.stringify(slate?.affixGroups)) return slate;
    changed = true;
    return { ...slate, affixes, ...(groups ? { affixGroups: groups } : {}) };
  });
  return changed ? next : inventory;
}
