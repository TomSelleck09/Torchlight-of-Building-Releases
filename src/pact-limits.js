import { orderedPactspiritNodes } from "./pactspirit-levels.js";
import { pactspiritTreesSs13 } from "./data/pacts/pactspirit-trees-ss13.js";
import { pactspiritCatalogSs13 } from "./data/pacts/pactspirit-catalog-ss13.js";
import { kismetCatalogSs13 } from "./data/pacts/kismet-catalog-ss13.js";
import { fateExtraSlots } from "./fate-slot-unlocks.js";

// The game's pact page limits (user decision 2026-10-21: a hard game rule; research/kismets-pacts-audit-2026-10-21.md §10).
//
// Pact Points (game text Func_Pet_ContractPointTips1, language table 2026-10-18): "You earn 1 point at Lv. 8. Then, you earn 1
// point for every 4 levels you gain, until Lv. 56. Starting at Lv. 56, you earn 1 point for every 2 levels, up to 30 points at
// Lv. 90. The upper limit increases to 33 points after completing the quest." Every Battle pact node costs 1 point: a combat
// section is 11 points in one chain (config_contractPoint: 6 inner, 3 mid, the outer node and the Undetermined Fate Slots node),
// so 33 fill all three sections. Drop pact spirits need no allocation ("all their Talent Node effects are activated upon
// installation", Pactspirit help), so their nodes cost nothing here.
//   Provisional (open question pact-point-budget): the quest's +3 is taken as done from Lv. 90 (where the 30 cap is reached), and
//   "Legendary and Rare Pactspirits can provide additional Pact Points" (manual 3005010122) is read from the game's servant table
//   (config_servant: 0 for Magic, 1 for Rare, 2 for Legendary Battle pact spirits) as extra points, up to the 33 cap.
//
// Destiny install limits (game manual 2005030222 / 2005030224): "Up to 9 can be installed in Micro Destiny Slots" (Micro Fates),
// "Up to 4 … Medium" (Medium Fates, Kismets and Dual Kismets: manual 2005030121 / 2005030226 / 2005030228). An Undetermined Fate
// (Destiny item 350900, installed on a section's Undetermined Fate Slots node, replacing its +6% damage) adds Micro / Medium Destiny
// Slots that "do not use Destiny Install Qualifications" (manual 2005030311 / 2005030324): its slots hold kismets on top of the
// 9 / 4 (src/fate-slot-unlocks.js; up to 5 per Undetermined Fate, item text). The install qualifications are quest unlocks; the
// planner takes them as complete (9 / 4).
//
// A saved or imported page past a limit keeps everything stored. The calculation leaves the extra items out, deterministically:
// the outermost first (highest chain position; then the later section), first the nodes past the Pact Point budget, then the
// kismets past 9 / 4 among the nodes still counted. A node whose kismet is left out keeps its own node effect, as an allocated
// node without a Destiny does in the game.
export const MICRO_DESTINY_LIMIT = 9;
export const MEDIUM_DESTINY_LIMIT = 4;
export const PACT_POINT_LEVEL_CAP = 30;
export const PACT_POINT_QUEST_BONUS = 3;
export const PACT_POINT_QUEST_LEVEL = 90;
export const PACT_POINT_MAX = 33;
export const PACT_RARITY_EXTRA_POINTS = Object.freeze({ Magic: 0, Rare: 1, Legendary: 2 });

/** Pact Points from character level alone (before the quest and the pact spirits' extra points). */
export function pactPointsForLevel(level) {
  const value = Math.floor(Number(level) || 0);
  if (value < 8) return 0;
  if (value <= 56) return 1 + Math.floor((value - 8) / 4);
  return Math.min(PACT_POINT_LEVEL_CAP, 13 + Math.floor((value - 56) / 2));
}

const spiritEntry = (name) => pactspiritCatalogSs13.find((entry) => entry.name === name) || null;
const isBattleSpirit = (name) => spiritEntry(name)?.category !== "Drop";
const kismetEntry = (name) => kismetCatalogSs13.find((entry) => entry.name === name) || null;

/** The Pact Point budget of a page at a character level: { level, levelStored, base, quest, extra, sources, budget }. */
export function pactPointBudget(pacts = {}, { level = 100, levelStored = false } = {}) {
  const base = pactPointsForLevel(level);
  const quest = level >= PACT_POINT_QUEST_LEVEL ? PACT_POINT_QUEST_BONUS : 0;
  const sources = (pacts.selectedSpirits || []).filter((name) => name && isBattleSpirit(name)).map((name) => ({ spirit: name, rarity: spiritEntry(name)?.rarity || "", points: PACT_RARITY_EXTRA_POINTS[spiritEntry(name)?.rarity] || 0 })).filter((item) => item.points);
  const extra = sources.reduce((sum, item) => sum + item.points, 0);
  // "Up to 30 points at Lv. 90. The upper limit increases to 33 points after completing the quest."
  const cap = quest ? PACT_POINT_MAX : PACT_POINT_LEVEL_CAP;
  return { level, levelStored, base, quest, extra, sources, cap, budget: Math.min(cap, base + quest + extra) };
}

/**
 * The page's limits and what a saved / imported page past them leaves out of the calculation.
 * @param pacts the stored pact state (kismet-slot mode; the captured-pact mode has no limits here)
 * @param character { level, stored } (src/planner.js buildCharacterLevel; `levelStored` is read too)
 * @returns {{ applies, points: { used, budget, ... }, micro: { used, limit, fateSlots, inFateSlots }, medium: {…}, excludedNodes: string[],
 *   excludedKismets: string[], reasons: Record<string, string>, effectivePacts }}
 */
export function resolvePactLimits(pacts = {}, character = {}) {
  const empty = { applies: false, excludedNodes: [], excludedKismets: [], reasons: {}, effectivePacts: pacts };
  if (!pacts?.kismetSlotMode) return empty;
  const level = Number.isFinite(character.level) ? character.level : 100;
  const budget = pactPointBudget(pacts, { level, levelStored: Boolean(character.levelStored ?? character.stored) });
  const allocated = [];
  (pacts.selectedSpirits || []).forEach((spirit, section) => {
    if (!spirit) return;
    orderedPactspiritNodes(pactspiritTreesSs13[spirit] || []).forEach((node, index) => {
      const key = `${spirit}:${index}`;
      if (pacts.nativeNodeQuantities?.[key] === 1) allocated.push({ key, spirit, section, index, ring: node.ring, costs: isBattleSpirit(spirit) });
    });
  });
  const outermostFirst = (a, b) => b.index - a.index || b.section - a.section;
  const reasons = {};
  const costing = allocated.filter((node) => node.costs);
  const levelText = `Lv. ${level}${budget.levelStored ? "" : " assumed"}`;
  const excludedNodes = costing.length > budget.budget ? [...costing].sort(outermostFirst).slice(0, costing.length - budget.budget) : [];
  for (const node of excludedNodes) reasons[node.key] = `Pact Points ${costing.length}/${budget.budget} at ${levelText}: past the budget (outermost first)`;
  const excludedNodeKeys = new Set(excludedNodes.map((node) => node.key));
  const counted = allocated.filter((node) => !excludedNodeKeys.has(node.key));
  const kismetsOf = (kind) => counted.filter((node) => ["inner", "mid"].includes(node.ring) && kismetEntry(pacts.kismetSlots?.[node.key]?.name)?.kind === kind);
  const fateSlots = counted.filter((node) => node.ring === "destiny").flatMap((node) => fateExtraSlots(node.spirit, pacts.fateUnlocks?.[node.spirit]));
  const excludedKismets = [];
  const limitFor = (kind, limit, label) => {
    const native = kismetsOf(kind);
    const over = native.length > limit ? [...native].sort(outermostFirst).slice(0, native.length - limit) : [];
    for (const node of over) { excludedKismets.push(node.key); reasons[node.key] = `${label} limit ${limit}/${limit} reached (${native.length} installed): past the limit (outermost first)`; }
    const slots = fateSlots.filter((slot) => slot.kind === kind);
    const inFateSlots = slots.filter((slot) => kismetEntry(pacts.kismetSlots?.[slot.key]?.name)?.kind === kind).length;
    return { used: native.length - over.length, installed: native.length, limit, fateSlots: slots.length, inFateSlots };
  };
  const micro = limitFor("micro", MICRO_DESTINY_LIMIT, "Micro Fate");
  const medium = limitFor("medium", MEDIUM_DESTINY_LIMIT, "Medium Destiny");
  let effectivePacts = pacts;
  if (excludedNodes.length || excludedKismets.length) {
    const nativeNodeQuantities = { ...(pacts.nativeNodeQuantities || {}) };
    for (const key of excludedNodeKeys) delete nativeNodeQuantities[key];
    const kismetSlots = { ...(pacts.kismetSlots || {}) };
    for (const key of excludedKismets) delete kismetSlots[key];
    effectivePacts = { ...pacts, nativeNodeQuantities, kismetSlots };
  }
  return {
    applies: true,
    points: { used: costing.length - excludedNodes.length, allocated: costing.length, ...budget, levelText },
    micro, medium,
    excludedNodes: excludedNodes.map((node) => node.key), excludedKismets, reasons, effectivePacts
  };
}

/** Why allocating `nodeIndex` (and the chain before it) of `spirit` is blocked, or null. */
export function pactNodeAllocationBlock(pacts = {}, spirit, nodeIndex, character = {}) {
  if (!pacts?.kismetSlotMode || !spirit || !isBattleSpirit(spirit)) return null;
  const limits = resolvePactLimits(pacts, character);
  const cost = Array.from({ length: nodeIndex + 1 }, (_, index) => `${spirit}:${index}`).filter((key) => pacts.nativeNodeQuantities?.[key] !== 1).length;
  if (!cost) return null;
  const free = limits.points.budget - limits.points.allocated;
  return cost > free ? `Pact Points ${limits.points.allocated}/${limits.points.budget} at ${limits.points.levelText} — needs ${cost}, ${Math.max(0, free)} left` : null;
}

/** Why installing a kismet of `kind` in the slot `key` is blocked, or null (Fate slots and replacing a kismet of the same kind never are). */
export function kismetInstallBlock(pacts = {}, key, kind, character = {}) {
  if (!pacts?.kismetSlotMode || String(key).includes(":extra:")) return null;
  if (kismetEntry(pacts.kismetSlots?.[key]?.name)?.kind === kind) return null;
  const limits = resolvePactLimits(pacts, character);
  const group = kind === "micro" ? limits.micro : limits.medium;
  if (group.installed < group.limit) return null;
  return kind === "micro"
    ? `Micro Fate limit ${group.installed}/${group.limit} — add an Undetermined Fate to raise it`
    : `Medium Destiny limit ${group.installed}/${group.limit} (Medium Fates, Kismets, Dual Kismets) — add an Undetermined Fate to raise it`;
}
