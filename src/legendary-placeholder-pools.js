// Legendary "<Random …>" placeholder lines (Pantheon's Elegy's Dirges, Lone Walker's Boots' Precise aura, …): the rolls each
// can take, from src/data/gear/legendary-placeholder-pools-ss13.generated.js (TLIDB pool cards). The crafter and the
// inventory editor offer a dropdown per placeholder; the chosen roll replaces the placeholder text in item.modifiers, so the
// calculator and the badges read it like any other line. An unchosen placeholder stays as its "<…>" text and adds nothing.
import { legendaryPlaceholderPoolsSs13 } from "./data/gear/legendary-placeholder-pools-ss13.generated.js";
import { namedGearAffixLines } from "./named-gear-affixes.js";
import { beltBlendsSs13 } from "./data/gear/belt-blends-ss13.generated.js";
import { inlineKeywordParts } from "./inline-keywords.js";
import { coreTalentDescriptionLines } from "./core-talent-keywords.js";

// Belt blends whose text starts with their bracketed name: normalized text -> name.
const normalizeLines = (text) => String(text || "").split("\n").map((line) => line.replace(/(\d)\s+%/g, "$1%").replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
const beltBlendKeywords = new Map(beltBlendsSs13.map((blend) => [blend.modifier.match(/^\[([^\]]+)\]\s/)?.[1], blend]).filter(([name]) => name).map(([name, blend]) => [normalizeLines(blend.modifier), name]));

const RANGE = /\((-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\)/g;
const NUMBER = /-?\d+(?:\.\d+)?/g;
const normalize = (text) => String(text || "").replace(/\s+%/g, "%").replace(/\s+/g, " ").trim().toLowerCase();
const shape = (text) => normalize(text).replace(RANGE, "#").replace(NUMBER, "#");

/** The pool for catalog line `index` of legendary `sourceId`, or null when that line is not a resolved placeholder. */
export function placeholderPool(sourceId, index) {
  const entry = legendaryPlaceholderPoolsSs13[sourceId];
  const poolIndex = entry?.slots?.[index];
  return Number.isInteger(poolIndex) ? entry.pools[poolIndex] : null;
}

export function placeholderOption(sourceId, index, optionId) {
  return placeholderPool(sourceId, index)?.options.find((option) => option.id === optionId) || null;
}

/** The template a chosen roll stands for: its corroded form when the line is corroded and TLIDB lists one. */
export function placeholderOptionTemplate(option, corroded = false) {
  return corroded ? option.corrodedTemplate || option.template : option.template;
}

/** Every template the line can carry (normal and corroded forms of each roll), for the editor's line alignment. */
export function placeholderTemplates(sourceId, index) {
  const pool = placeholderPool(sourceId, index);
  return pool ? [...new Set(pool.options.flatMap((option) => [option.template, option.corrodedTemplate]).filter(Boolean))] : [];
}

/**
 * The roll a saved line carries: { option, corroded } or null (still a placeholder, or text that matches no roll). The
 * text is compared by shape (numbers and ranges blanked), so any rolled value matches its template. Normal and corroded
 * forms can share a shape (Dawn Break: "+(50–100) Strength" / "+(120–150) Strength"); `corroded` (the line's saved
 * corrosion flag) picks the form to try first.
 */
export function placeholderOptionForText(sourceId, index, text, corroded = false) {
  const pool = placeholderPool(sourceId, index);
  if (!pool || !text) return null;
  const target = shape(text);
  for (const form of corroded ? [true, false] : [false, true]) {
    for (const option of pool.options) {
      const template = form ? option.corrodedTemplate : option.template;
      if (template && shape(template) === target) return { option, corroded: form };
    }
  }
  return null;
}

/** Every roll template of every placeholder line of legendary `sourceId` (the load-time reconcile treats them as known lines). */
export function allPlaceholderTemplates(sourceId) {
  return Object.keys(legendaryPlaceholderPoolsSs13[sourceId]?.slots || {}).flatMap((index) => placeholderTemplates(sourceId, Number(index)));
}

/** Legendary ids with at least one resolved placeholder. */
export function legendaryIdsWithPlaceholderPools() {
  return Object.keys(legendaryPlaceholderPoolsSs13);
}

// Keyword rolls (Pantheon's Elegy's Dirges): keyword -> effect lines, for the tooltip / dialog keyword display.
const keywordEffects = new Map(Object.values(legendaryPlaceholderPoolsSs13).flatMap((entry) => entry.pools.flatMap((pool) => pool.options)).filter((option) => option.keyword).map((option) => [option.keyword, option.effect || []]));

/**
 * Splits a saved keyword roll ("Goddess of Hunting's Dirge\n<effect lines>\n<corroded extra lines>") into its keyword, its
 * effect lines and the remaining lines, or null when the text does not start with a known keyword. The effect lines are
 * taken from the text itself (as many as the keyword's effect has), so an older saved value still shows what was saved.
 */
export function keywordRollParts(text) {
  const lines = String(text || "").split("\n");
  const keyword = lines[0].trim();
  const effect = keywordEffects.get(keyword);
  if (effect) return { keyword, effect: lines.slice(1, 1 + effect.length), rest: lines.slice(1 + effect.length), named: false };
  // A named gear affix (src/named-gear-affixes.js: Wield My Sword, Absolve My Sin, Castling, …): the saved line is only the
  // name, so its effect lines come from the table; any following lines (a corroded donor's "+(12–15)% Block Ratio") stay as rest.
  const named = namedGearAffixLines(keyword);
  if (named.length) return { keyword, effect: [...named], rest: lines.slice(1), named: true };
  // A belt blend with a bracketed name ("[Reflection] +6% additional damage …\nMinions …", src/data/gear/belt-blends-ss13.generated.js):
  // the name is the keyword and every line, the first without its bracket, is an effect line. Only a blend's own text matches.
  const blendName = beltBlendKeywords.get(normalizeLines(text));
  if (blendName) return { keyword: blendName, effect: [lines[0].trim().slice(blendName.length + 2).trim(), ...lines.slice(1).map((line) => line.trim())].filter(Boolean), rest: [], named: true };
  // A core talent named on its own line (a Pedigree of Gods slot, a captured belt blend saved as "Poisoned Relief",
  // src/core-talent-keywords.js): the name is the keyword and its effect is the core's description (`description`: these
  // lines describe the core rather than being the line's own clauses, so the tooltip gives them no per-line badge).
  const coreLines = coreTalentDescriptionLines(keyword);
  if (coreLines.length) return { keyword, effect: coreLines, rest: lines.slice(1), named: true, description: true };
  // An inline keyword (src/inline-keywords.js: Eternity's "… stack(s) of Eternal Morale on defeat …"): the keyword sits mid-line,
  // so the line keeps its text around it (`inline`), and each effect line carries the keyword's own badge (`statuses`).
  const inline = inlineKeywordParts(text);
  if (inline) return { keyword: inline.keyword, effect: inline.effect.map((line) => line.text), rest: [], named: false, inline: { before: inline.before, after: inline.after }, statuses: inline.effect.map(({ status, reason }) => ({ status, reason })) };
  return null;
}
