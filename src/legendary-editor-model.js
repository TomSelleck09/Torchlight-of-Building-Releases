// Legendary item editor model: which of an item's modifier lines are the catalog's legendary lines (editable) and which
// are other lines (a captured base implicit such as Folklore's "+6% Erosion Resistance", a game-log implicit, a Belt Blend
// or TOWER Sequence line) that the editor must keep untouched. Lines are matched by text signature and roll range, never
// by position, so an extra line before, between or after the legendary lines cannot shift the catalog indexes.
// corrodedModifierIndices are positions in item.modifiers; the editor works in catalog indexes and converts both ways.
import { legendaryModifierSignature } from "./legendary-modifier-signature.js";
import { folkloreRingModifier } from "./legendary-ring-options.js";
import { placeholderPool, placeholderTemplates } from "./legendary-placeholder-pools.js";
import { legendaryLineTiers, legendaryLowerTierTemplates } from "./legendary-affix-tiers.js";

const placeholderText = (text) => /^<[^>]+>$/.test(String(text || "").trim());

const RANGE = /\((-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\)/g;
const normalize = (text) => String(text || "").replace(/\s+%/g, "%").replace(/\s+/g, " ").trim().toLowerCase();
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*").replace(/%/g, "\\s*%");

// Templates that can stand at catalog index `index`: the normal line, its corroded form, for Folklore of Locking
// Fingers the four ring-slot options of line 2, and for a placeholder line every roll of its pool.
export function legendaryLineTemplates(source, index, corrodedLines = []) {
  const templates = [source.modifiers[index], corrodedLines?.[index]];
  if (source.id === "Folklore_of_Locking_Fingers" && index === 2) templates.push(folkloreRingModifier("left"), folkloreRingModifier("right"), folkloreRingModifier("left", true), folkloreRingModifier("right", true));
  // A "<Random …>" placeholder line can carry any roll of its pool (src/legendary-placeholder-pools.js).
  templates.push(...placeholderTemplates(source.id, index));
  // A tiered line (Ice Pulse's Spell Damage) can carry a lower tier's roll (src/legendary-affix-tiers.js).
  templates.push(...legendaryLowerTierTemplates(source.id, index));
  return [...new Set(templates.filter(Boolean))];
}

// The tier a tiered line's text was rolled in: the first (best) tier whose range holds its rolls, else null (a line with one
// range, a corroded or out-of-range text). A roll inside two tiers' ranges reads as the better tier.
export function legendaryTierForText(source, index, text) {
  return legendaryLineTiers(source?.id, index)?.find((entry) => rollValuesFromText(entry.text, text))?.tier ?? null;
}

// Roll values of `text` read against `template`, or null when the text is not that template with in-range rolls.
export function rollValuesFromText(template, text) {
  const ranges = [...String(template).matchAll(RANGE)];
  if (!ranges.length) return normalize(template) === normalize(text) ? [] : null;
  const parts = []; let cursor = 0;
  for (const match of ranges) { parts.push(escape(template.slice(cursor, match.index)), "(-?\\d+(?:\\.\\d+)?)"); cursor = match.index + match[0].length; }
  const result = String(text || "").trim().match(new RegExp(`^${parts.join("")}${escape(template.slice(cursor))}$`, "i"));
  if (!result) return null;
  const values = result.slice(1).map(Number);
  return values.every((value, i) => { const a = Number(ranges[i][1]), b = Number(ranges[i][2]); return value >= Math.min(a, b) && value <= Math.max(a, b); }) ? values : null;
}

function matchScore(templates, text) {
  if (templates.some((template) => rollValuesFromText(template, text))) return 2;
  const signature = legendaryModifierSignature(text);
  return templates.some((template) => legendaryModifierSignature(template) === signature) ? 1 : 0;
}

// Positions of special lines that are never catalog lines: base implicits stored separately (implicitModifiers) and the
// Belt Blend / TOWER Sequence lines. Each is taken from the end, matching how they are appended.
function specialPositions(modifiers, specialTexts) {
  const taken = new Set();
  for (const text of specialTexts.filter(Boolean)) {
    for (let position = modifiers.length - 1; position >= 0; position -= 1) if (!taken.has(position) && modifiers[position] === text) { taken.add(position); break; }
  }
  return taken;
}

// Order-preserving alignment of catalog lines to modifier positions that maximises the match score (2 = template with
// in-range rolls, 1 = same signature). Unmatched catalog lines get position -1; unmatched positions stay fixed.
export function legendaryEditorModel(item, source, { corrodedLines = [], specialTexts = [] } = {}) {
  const modifiers = [...(item?.modifiers || [])];
  const specials = specialPositions(modifiers, [...(item?.implicitModifiers || []), ...specialTexts]);
  const candidates = modifiers.map((_, position) => position).filter((position) => !specials.has(position));
  const templates = source.modifiers.map((_, index) => legendaryLineTemplates(source, index, corrodedLines));
  const n = templates.length, m = candidates.length;
  const best = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) {
    const score = matchScore(templates[i], modifiers[candidates[j]]);
    best[i][j] = Math.max(best[i + 1][j], best[i][j + 1], score ? score + best[i + 1][j + 1] : 0);
  }
  const positions = new Array(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m;) {
    const score = matchScore(templates[i], modifiers[candidates[j]]);
    if (score && best[i][j] === score + best[i + 1][j + 1]) { positions[i] = candidates[j]; i += 1; j += 1; }
    else if (best[i][j] === best[i + 1][j]) i += 1;
    else j += 1;
  }
  // Reworded captured lines (e.g. "Stealth Stab" for the full Stealth Stab text): between two matched neighbours, missing
  // catalog lines take the unmatched lines of the same gap in order, but only when the counts are equal.
  const anchors = [-1, ...positions.map((position, index) => (position >= 0 ? index : null)).filter((index) => index !== null), n];
  for (let a = 0; a < anchors.length - 1; a += 1) {
    const lo = anchors[a], hi = anchors[a + 1];
    const missing = []; for (let i = lo + 1; i < hi; i += 1) missing.push(i);
    if (!missing.length) continue;
    const from = lo >= 0 ? positions[lo] : -1, to = hi < n ? positions[hi] : Infinity;
    const free = candidates.filter((position) => position > from && position < to);
    if (free.length === missing.length) missing.forEach((index, k) => { positions[index] = free[k]; });
  }
  const corroded = new Set(item?.corrodedModifierIndices || []);
  const slots = positions.map((position, catalogIndex) => ({ catalogIndex, position, text: position >= 0 ? modifiers[position] : null, corroded: position >= 0 && corroded.has(position) }));
  const used = new Set(positions.filter((position) => position >= 0));
  return { slots, fixedPositions: modifiers.map((_, position) => position).filter((position) => !used.has(position)), missing: slots.filter((slot) => slot.position < 0).map((slot) => slot.catalogIndex) };
}

// The catalog lines the editor shows: every line the item carries, plus every "<Random …>" placeholder line it lacks (an item
// imported before its pool rolls were read, e.g. False God's Skin with only "+9% All Stats"), so a roll can be picked for it.
export function editableLegendarySlots(model, source) {
  return model.slots.filter((slot) => slot.position >= 0 || Boolean(placeholderPool(source?.id, slot.catalogIndex)));
}

// Applies edited catalog lines (texts: Map catalogIndex -> text; corrodedCatalog: Set of catalog indexes) in place. Other
// lines keep their text, order and corrosion flag. A changed special line (Belt Blend, TOWER Sequence) replaces the old one;
// an unchanged one stays where it is. Returns the new modifiers, corrodedModifierIndices and legendaryModifiers.
export function applyLegendaryEditorEdits(item, model, { texts = new Map(), corrodedCatalog = new Set(), specials = [] } = {}) {
  const corroded = new Set(item?.corrodedModifierIndices || []);
  let records = (item?.modifiers || []).map((text, position) => ({ text, corroded: corroded.has(position), slot: null }));
  for (const slot of model.slots) {
    if (slot.position < 0) continue;
    const record = records[slot.position];
    record.slot = slot.catalogIndex;
    if (texts.has(slot.catalogIndex) && texts.get(slot.catalogIndex)) record.text = texts.get(slot.catalogIndex);
    record.corroded = corrodedCatalog.has(slot.catalogIndex);
  }
  // A missing catalog line given a real roll (a placeholder line the item lacked) is inserted after the nearest earlier
  // catalog line (else before the nearest later one), so the item's lines keep the catalog order.
  const inserted = [];
  for (const slot of model.slots) {
    if (slot.position >= 0) continue;
    const text = texts.get(slot.catalogIndex);
    if (!text || placeholderText(text)) continue;
    const record = { text, corroded: corrodedCatalog.has(slot.catalogIndex), slot: slot.catalogIndex };
    const before = records.reduce((best, entry, i) => (entry.slot !== null && entry.slot < slot.catalogIndex ? i : best), -1);
    const after = records.findIndex((entry) => entry.slot !== null && entry.slot > slot.catalogIndex);
    records.splice(before >= 0 ? before + 1 : after >= 0 ? after : records.length, 0, record);
    inserted.push(record);
  }
  for (const { from, to } of specials) {
    if ((from || "") === (to || "")) continue;
    if (from) { for (let i = records.length - 1; i >= 0; i -= 1) if (records[i].slot === null && records[i].text === from) { records.splice(i, 1); break; } }
    if (to) records.push({ text: to, corroded: false, slot: null });
  }
  const modifiers = records.map((record) => record.text);
  const corrodedModifierIndices = records.map((record, position) => (record.corroded ? position : -1)).filter((position) => position >= 0);
  let legendaryModifiers;
  if (Array.isArray(item?.legendaryModifiers)) {
    legendaryModifiers = [...item.legendaryModifiers];
    const replaced = new Set();
    for (const slot of model.slots) {
      if (slot.position < 0) continue;
      const next = records.find((record) => record.slot === slot.catalogIndex)?.text;
      if (next === undefined || next === slot.text) continue;
      const at = legendaryModifiers.findIndex((text, i) => !replaced.has(i) && text === slot.text);
      if (at >= 0) { legendaryModifiers[at] = next; replaced.add(at); }
    }
    // Inserted lines take the same place among the legendary lines (catalog order of the lines around them).
    for (const record of inserted) {
      const catalogRecords = records.filter((entry) => entry.slot !== null);
      const prior = catalogRecords.filter((entry) => entry.slot < record.slot && entry !== record).pop();
      const at = prior ? legendaryModifiers.lastIndexOf(prior.text) : -1;
      legendaryModifiers.splice(at >= 0 ? at + 1 : prior ? legendaryModifiers.length : 0, 0, record.text);
    }
  }
  return { modifiers, corrodedModifierIndices, ...(legendaryModifiers ? { legendaryModifiers } : {}) };
}

// The catalog entry for an item. Some names have several catalog variants (Unholy Prayer has three); pick the one whose
// lines the item actually carries, falling back to the first.
export function legendarySourceForItem(item, catalog, corrodedModifiers = {}) {
  const name = String(item?.name || "").replace(/ - Priceless$/i, "").toLowerCase();
  const entries = catalog.filter((entry) => entry.name.toLowerCase() === name);
  if (entries.length < 2) return entries[0] || null;
  const score = (entry) => legendaryEditorModel(item, entry, { corrodedLines: corrodedModifiers[entry.id] }).slots.filter((slot) => slot.position >= 0 && legendaryLineTemplates(entry, slot.catalogIndex, corrodedModifiers[entry.id]).some((template) => legendaryModifierSignature(template) === legendaryModifierSignature(slot.text))).length;
  return entries.reduce((best, entry) => (score(entry) > score(best) ? entry : best), entries[0]);
}
