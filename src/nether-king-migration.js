// Saved Nether King slate lines from before SS14 (user decision 2026-10-22; research/slates-nether-king-audit-2026-10-22.md §11.2).
// SS14 moved every Nether King node up a tier (patch notes: Small → Medium, Medium → Legendary, Legendary → Ultimate; new Small
// nodes at half the Medium values; "+100 Attack and Spell Critical Strike Rating and -99% additional Elemental and Erosion Damage →
// +80 Critical Strike Rating"; the three "Adds 5-5 base <Ailment> damage" removed). On load (src/planner-state.js
// normalizePlannerState) a saved SS13 line becomes the SS14 node with the same wording: the same text with its numbers masked
// (after the stale-wording fixes of src/talent-text-migrations.js), in the tier the patch notes moved it to, else in any tier with
// that wording. A Nether King node has one value, no roll range, so it takes the SS14 node's value. Saved slates store no game
// ids (Import from game writes text), so the match is by wording. A line with no SS14 match stays as written; the slate tooltip
// flags it ("SS13 line, no SS14 match").
import { netherKingNodesSs14, netherKingNodesSs13 } from "./data/nether-king-nodes-ss14.generated.js";
import { migrateSlateTalentText } from "./talent-text-migrations.js";

const PREFIX = /^Nether King:\s*((?:Micro|Medium|Legendary Medium|Ultimate) Nether King Talent Node):\s*(.+)$/s;
const TIER_MOVE = {
  "Micro Nether King Talent Node": "Medium Nether King Talent Node",
  "Medium Nether King Talent Node": "Legendary Medium Nether King Talent Node",
  "Legendary Medium Nether King Talent Node": "Ultimate Nether King Talent Node",
  "Ultimate Nether King Talent Node": "Ultimate Nether King Talent Node"
};
// Patch-note renames whose wording changed beyond the numbers.
const RENAMED = new Map([["+100 Attack and Spell Critical Strike Rating · -99% additional Elemental and Erosion Damage", "+80 Attack and Spell Critical Strike Rating"]]);

const clean = (text) => String(text || "").replace(/\s*·\s*/g, " · ").replace(/\s+/g, " ").trim();
const wording = (text) => clean(migrateSlateTalentText(clean(text)))
  .replace(/\s*\((?:Max (?:Active )?Divinity(?: Effect)?): 1\)\s*/g, " ").replace(/\s*\[Autocracy\]\s*/g, " ")
  .replace(/\s*\(multiplies\)/g, "").replace(/\bLasts for\b/g, "Lasts").replace(/^Both you/, "You").replace(/^\+(?=0\.)/, "")
  .replace(/\(\s*-?\d+(?:\.\d+)?\s*[–-]\s*-?\d+(?:\.\d+)?\s*\)/g, "#").replace(/[+-]?\d+(?:\.\d+)?/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
const key = (name, effect) => `${name}\u0000${clean(effect)}`;
const SS14 = new Set(netherKingNodesSs14.map((node) => key(node.name, node.effect)));
const SS13 = new Set(netherKingNodesSs13.map((node) => key(node.name, node.effect)));

/**
 * One saved slate line read for SS14: { text, status } with status "ss14" (an SS14 node as is), "migrated" (an SS13 line now the SS14
 * node `text`, `from` the saved one), "unmatched" (a Nether King line with no SS14 node: kept as written) or null (not a Nether King
 * node line).
 */
export function migrateNetherKingLine(affix) {
  const match = String(affix || "").match(PREFIX);
  if (!match) return { text: affix, status: null };
  const [, name, effect] = match;
  if (SS14.has(key(name, effect))) return { text: affix, status: "ss14" };
  const renamed = RENAMED.get(clean(effect));
  const target = wording(renamed || effect);
  const candidates = netherKingNodesSs14.filter((node) => wording(node.effect) === target);
  const node = candidates.find((entry) => entry.name === TIER_MOVE[name]) || candidates.find((entry) => entry.name === name) || (candidates.length === 1 ? candidates[0] : null);
  if (!node || !SS13.has(key(name, effect)) && !renamed && node.name !== TIER_MOVE[name]) return { text: affix, status: "unmatched" };
  return { text: `Nether King: ${node.name}: ${node.effect}`, status: "migrated", from: affix };
}

/** The badge note for a Nether King line the migration could not match ("" for any other line). */
export const netherKingLineNote = (affix) => (migrateNetherKingLine(affix).status === "unmatched" ? "SS13 line, no SS14 match" : "");

const isNetherKingSlate = (slate) => /^Nether King's (?:Broken )?Divinity/.test(String(slate?.template || slate?.name || ""));
const migrateList = (list) => (Array.isArray(list) ? list.map((affix) => (affix ? migrateNetherKingLine(affix).text : affix)) : list);

/** A saved slate inventory with every Nether King's Divinity's SS13 lines read as SS14 nodes (the same array when nothing changes). */
export function migrateNetherKingSlates(inventory) {
  if (!Array.isArray(inventory)) return inventory;
  let changed = false;
  const next = inventory.map((slate) => {
    if (!isNetherKingSlate(slate)) return slate;
    const affixes = migrateList(slate.affixes);
    const groups = slate.affixGroups ? Object.fromEntries(Object.entries(slate.affixGroups).map(([group, list]) => [group, migrateList(list)])) : slate.affixGroups;
    if (JSON.stringify(affixes) === JSON.stringify(slate.affixes) && JSON.stringify(groups) === JSON.stringify(slate.affixGroups)) return slate;
    changed = true;
    return { ...slate, affixes, ...(groups ? { affixGroups: groups } : {}) };
  });
  return changed ? next : inventory;
}
