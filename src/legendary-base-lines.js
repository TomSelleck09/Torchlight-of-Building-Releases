// A Legendary item's base-item lines (user decision 2026-10-30: every legendary whose game base has a base stat carries it). The
// planner's Legendary catalog (src/data/gear/legendary-gear-ss13.generated.js) is reference data's list page, which leaves these lines out,
// so saved items may hold only their affixes. The base comes from the game (legendary-bases-ss14.generated.js, config_item_gold
// base id) and its lines from the rare base with that game id (rare-base-game-ids + rare-base-items), so nothing here is hand-kept
// except the one game-only base below.
//
// The value is fixed by the base, not scaled by item level: config_item_base gives each base one base affix id (All Magic Grip
// 600010 = 120 on every item), and the game log's legendary implicits equal the table at any item level (tests/legendary-base-lines.test.js).
// A legendary's own same-worded affix is a separate game record (Sun's Embrace: +1615 implicit and +3168 legendary Gear Armor, both count).
//
// Read-time, non-destructive: new crafts store the lines in implicitModifiers (src/app.js); a saved or shared item without stored
// implicits gets them here (withLegendaryBaseLines on the equipped items in src/engine.js calculateEquipmentCandidate, a transient
// field effectiveGearModifierTexts reads, never saved; readers probing one line of an item do not get them), so saved state and codes stay byte-identical. An item
// that stores implicits (a game-log import, a new craft, a First Aember transform) is left alone: the log is the better source.
//
// Evidence (research/frost-terra-defense-compare-2026-10-13.md, UE_game.log ViewPlayer snapshot of the Frost Terra v2 character):
// Total Life 2202.334 = (1337 + 110 Pantheon's Elegy) × 1.522, Total Evasion 2356.9 = (198 + 1615 Lone Walker's Boots) × 1.3, and
// Total Energy Shield needs Crimson Gash's +3 Intelligence. Corrosion changes none of these lines: they are Base Stats (src/gear-base-stats.js;
// a corroded Lone Walker's Boots keeps its +1615, a corroded Ripple Pendant its +8 Dexterity).
import { legendaryBasesSs14 } from "./data/gear/legendary-bases-ss14.generated.js";
import { rareBaseGameIds } from "./data/gear/rare-base-game-ids.generated.js";
import { rareBaseItemsSs13 } from "./data/gear/rare-base-items-ss13.generated.js";
import { isGearBaseStatLine } from "./gear-base-stats.js";
import { legendaryModifierSignature } from "./legendary-modifier-signature.js";
import { normalizePercentageText } from "./percentage-text.js";

// Divine Body (#3299, Omniscient Prototype's base) is not in the rare base catalog: config_item_base gives it base affix 570000,
// the affix of base #3200 ("+10 gear Energy Shield").
const GAME_ONLY_BASE_LINES = Object.freeze({ 3299: ["+10 gear Energy Shield"] });
// The three Unholy Prayer records share a name on three Ring bases. config_item_gold (chunk 12): key 113134 Agility on base 4633 (Lightning), 113135 Focus on 4627 (Cold),
// 113136 Tenacity on 4621 (Fire): each record's slots name its Blessing's rows.
const UNHOLY_PRAYER_BASES = Object.freeze({ agility: 4633, focus: 4627, tenacity: 4621 });

const rareByGameId = new Map(Object.entries(rareBaseGameIds).map(([id, record]) => [record.gameId, id]));
const rareById = new Map(rareBaseItemsSs13.map((base) => [base.id, base]));
const plainName = (item) => String(item?.name || "").replace(/ - Priceless$/i, "").trim();
const lineKey = (text) => normalizePercentageText(String(text ?? "").replace(/\s+/g, " ").trim()).toLowerCase();

function gameBaseOf(item) {
  const record = legendaryBasesSs14[plainName(item)];
  if (!record) return null;
  let { baseId, base } = record;
  if (record.bases?.length > 1) {
    const texts = [...(item.legendaryModifiers || []), ...(item.modifiers || [])].join(" ");
    const blessing = /Max (Agility|Tenacity|Focus) Blessing/i.exec(texts)?.[1]?.toLowerCase();
    const variant = record.bases.find((entry) => entry.id === UNHOLY_PRAYER_BASES[blessing]);
    if (variant) ({ id: baseId, name: base } = variant);
  }
  return { base, baseId };
}

/** Every line of the legendary's game base as { base, baseId, lines } (null: not a legendary with a known base). */
export function legendaryGameBaseLines(item) {
  const found = gameBaseOf(item);
  if (!found) return null;
  const lines = GAME_ONLY_BASE_LINES[found.baseId] || rareById.get(rareByGameId.get(found.baseId))?.modifiers || [];
  return { ...found, lines: lines.map(normalizePercentageText) };
}

const isLegendaryItem = (item) => Boolean(item) && (!item.rarity || ["legendary", "captured"].includes(item.rarity));

/** The base lines stored nowhere on the item, which the calculation adds: `{ base, line }` per line. */
export function missingLegendaryBaseLines(item) {
  if (!isLegendaryItem(item) || item.implicitModifiers?.length) return [];
  const game = legendaryGameBaseLines(item);
  if (!game?.lines.length) return [];
  // The item's lines beside its legendary lines (each copy matched once: a rolled "+140 gear Energy Shield" on Undying Faith is not the base's).
  const structured = Array.isArray(item.legendaryModifiers);
  const own = (item.legendaryModifiers || []).map(lineKey);
  const extras = (item.modifiers || []).map(lineKey).filter((key) => {
    const at = own.indexOf(key);
    if (at >= 0) { own.splice(at, 1); return false; }
    return true;
  });
  const extraSignatures = new Set(extras.map(legendaryModifierSignature));
  return game.lines.filter((line) => {
    if (extras.includes(lineKey(line))) return false;
    return !(structured && isGearBaseStatLine(line) && extraSignatures.has(legendaryModifierSignature(lineKey(line))));
  }).map((line) => ({ base: game.base, line }));
}

/** The equipped item with its missing base lines in the transient `legendaryBaseLines`, which effectiveGearModifierTexts reads. */
export function withLegendaryBaseLines(item) {
  const lines = missingLegendaryBaseLines(item).map((entry) => entry.line);
  if (!lines.length) return item;
  // Not enumerable: a copy of the item saved into a build never carries it.
  return Object.defineProperty({ ...item }, "legendaryBaseLines", { value: lines, enumerable: false });
}

/** The item's first missing base line ({ base, line }) or null. */
export const legendaryBaseLine = (item) => missingLegendaryBaseLines(item)[0] || null;
