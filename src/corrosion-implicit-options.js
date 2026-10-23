// Corrosion base affix ("Corrosion Implicit") choices for an item: its base type's pool (src/data/gear/corrosion-implicits-ss13.js)
// and which pool entry, at which roll, a saved line is.
//
// The pools are TLIDB's Corrosion Base tables. Checked 2026-10-20 against the game's config_modifier rows 6006 BB NN (gamedata
// 2026-10-13 and 2026-10-18): the rows with a non-zero weight are exactly the 352 TLIDB lines of the 38 base types (plus three
// blocks for bases the planner does not have); the zero-weight rows (a Necklace's "Sealed Mana Compensation for Deep Pain",
// a Belt's "Charged Flames Aura", …) cannot roll. Vorax gear has no corrosion base table.
import { corrosionImplicitPoolsSs13, defaultBaseForItem } from "./data/gear/corrosion-implicits-ss13.js";

const RANGE = /\((-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\)/g;
const squash = (text) => String(text || "").replace(/(\d)\s+%/g, "$1%").replace(/\s+/g, " ").trim();
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The corrosion base pool of an item's base type ([] for Vorax gear). */
export function corrosionPoolForItem(item) {
  if (!item || item.rarity === "vorax" || item.base === "Vorax Gear") return [];
  return corrosionImplicitPoolsSs13[defaultBaseForItem(item)] || [];
}

/** The [min, max] ranges of a pool entry's label, in order. */
export function corrosionEntryRanges(entry) {
  return [...String(entry?.label || "").matchAll(RANGE)].map((match) => ({ min: Number(match[1]), max: Number(match[2]) }));
}

/** The rolled values of `text` read as `entry` (one per range), or null when the text is not that line. */
export function corrosionEntryValues(entry, text) {
  const label = squash(entry?.label);
  if (!label) return null;
  let source = "", last = 0;
  for (const match of label.matchAll(RANGE)) {
    source += escapeRegExp(label.slice(last, match.index)) + "([+-]?\\d+(?:\\.\\d+)?)";
    last = match.index + match[0].length;
  }
  source += escapeRegExp(label.slice(last));
  const found = squash(text).match(new RegExp(`^${source}$`, "i"));
  return found ? found.slice(1).map(Number) : null;
}

/** The pool entry a saved corrosion line is ({ index, values }), or null. */
export function matchCorrosionEntry(pool, text) {
  for (let index = 0; index < (pool || []).length; index += 1) {
    const values = corrosionEntryValues(pool[index], text);
    if (values) return { index, values };
  }
  return null;
}

/** A roll's position in its first range, 0-100 (100 for a fixed line). */
export function corrosionRollPercent(entry, values) {
  const [range] = corrosionEntryRanges(entry);
  if (!range || range.max === range.min || !Number.isFinite(values?.[0])) return 100;
  return Math.max(0, Math.min(100, Math.round(((values[0] - range.min) / (range.max - range.min)) * 100)));
}

/**
 * The editor's starting choice for an item's saved corrosion lines: "" (none), "pool:<index>" (one line of the pool, with its
 * roll as a 0-100 percent) or "current" (lines the pool does not hold, kept as they are).
 */
export function corrosionEditorChoice(pool, lines = []) {
  const saved = (lines || []).filter(Boolean);
  if (!saved.length) return { value: "", index: -1, percent: 100 };
  const match = saved.length === 1 ? matchCorrosionEntry(pool, saved[0]) : null;
  if (!match) return { value: "current", index: -1, percent: 100 };
  return { value: `pool:${match.index}`, index: match.index, percent: corrosionRollPercent(pool[match.index], match.values) };
}
