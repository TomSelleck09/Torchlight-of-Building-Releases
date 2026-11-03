// Compact build codes, short enough to travel in a pre-filled GitHub issue URL (src/feedback-dialog-model.js). Since
// 2026-10-27 the planner's Export writes the TLB4 code (falling back to TLB3, TLB2, then the original code); the original
// code (base64url of the state JSON, src/planner-state.js encodePlannerState) is still what the compact codes expand to,
// and Import accepts the original code and every compact version.
//   "TLB2:" + base64url(raw DEFLATE of the export JSON). Still decoded; no longer written.
//   "TLB3:" + base64url(raw DEFLATE of the packed JSON). The state is packed losslessly before deflating:
//     1. Strings: every string (value or key) that is in the frozen table src/data/build-code-dictionary-v3.js becomes
//        "~" + its index in base 36; any other string that starts with "~" gets one more "~" in front. So "~" followed
//        by base-36 digits is always a table entry, "~~…" is an escaped string, and a lone "~" never comes from data.
//     2. Equipped items: an equipmentOverrides[slot] whose sourceInventoryId names an equipmentInventory item becomes
//        { "~": [inventory index, changed or added fields, removed keys, key order] } (trailing parts left out; the key
//        order only when the fields' default order — the item's own order, then added keys — differs).
//   Packing is verified when the code is made: unpacking must give the exact original JSON text, or the code falls back
//   to TLB2. So expandBuildCode always returns the original Export code, byte for byte.
//   "TLB4:" + base64url(raw DEFLATE of the TLB4-packed JSON). Written since 2026-10-27. Frozen rules, applied in this
//   order when packing and undone in reverse when unpacking (every marker starts with "~=" or "~:", which no packed data
//   string can, so markers never collide with data):
//     1. Strings: the TLB3 rule with the TLB4 table (the TLB3 table, same indices, followed by the strings of
//        src/data/build-code-dictionary-v4.js). A string not in the table that splits at ": ", ":", " · ", " — " or a
//        line break into pieces some of which are in it becomes "~:" + its pieces joined by "~", each "#" + base-36
//        index or "'" + literal text (only for strings with no "~", and only when shorter).
//     2. Gear (equipmentInventory items and equipmentOverrides values): `modifiers` that starts with implicitModifiers +
//        baseAffixModifiers + prefixModifiers + suffixModifiers keeps only "~=c" and what follows; `legendaryModifiers`
//        equal to `modifiers` becomes "~=m".
//     3. Slates (slates.inventory): `affixes` equal to the affixGroups' lists joined in order becomes "~=g".
//     4. Equipped items: the TLB3 inventory reference.
//     5. The whole state is stored as a difference from the frozen default state of build-code-dictionary-v4.js (packed by
//        rules 1–4): { "~=d": [changed or added fields, removed keys, key order] } per object, nested for objects present
//        in both (when shorter), omitted parts trailing.
//   Like TLB3, the code is verified when made (unpacking gives the exact export JSON text, else TLB3 is written), so a
//   TLB4 code expands to the original Export code byte for byte and never depends on the live catalogs.
//   compactBuildCode(code)   original code → compact code (async: CompressionStream "deflate-raw", zlib in old Node)
//   expandBuildCode(text)    compact code → the original code; any other text comes back trimmed
//   expandBuildCodeSync(text, { inflateRawSync, dictionary, dictionaryV4 })  the same without streams
//                            (scripts/collect-submissions.mjs passes node:zlib inflateRawSync, BUILD_CODE_DICTIONARY_V3 and
//                            BUILD_CODE_DICTIONARY_V4)

export const COMPACT_BUILD_CODE_PREFIX = "TLB4:";
export const V3_COMPACT_BUILD_CODE_PREFIX = "TLB3:";
export const LEGACY_COMPACT_BUILD_CODE_PREFIX = "TLB2:";
export const COMPACT_BUILD_CODE_PREFIXES = Object.freeze([COMPACT_BUILD_CODE_PREFIX, V3_COMPACT_BUILD_CODE_PREFIX, LEGACY_COMPACT_BUILD_CODE_PREFIX]);
const MAX_COMPACT_LENGTH = 250000;
const MAX_EXPANDED_BYTES = 4 * 1024 * 1024;
const TOKEN = "~";
const MARKER = "~";

/** "TLB4", "TLB3", "TLB2" or "" for the (trimmed) text's compact version. */
export function compactCodeVersion(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  const prefix = COMPACT_BUILD_CODE_PREFIXES.find((item) => trimmed.startsWith(item));
  return prefix ? prefix.slice(0, -1) : "";
}

/** Whether the text (after trimming) is a compact build code (TLB4, TLB3 or TLB2). */
export const isCompactBuildCode = (text) => Boolean(compactCodeVersion(text));

export function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function base64UrlToBytes(text) {
  const clean = String(text).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9_+/=-]*$/.test(clean)) throw new TypeError("Invalid build code characters");
  const padded = clean.replaceAll("-", "+").replaceAll("_", "/").replace(/=+$/, "");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

const utf8Decode = (bytes) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const utf8Encode = (text) => new TextEncoder().encode(text);

async function throughStream(Stream, bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new Stream("deflate-raw"));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_EXPANDED_BYTES) { await reader.cancel(); throw new TypeError("Build code expands too far"); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

// CompressionStream "deflate-raw" (browsers, Electron, Node 21.2+); node:zlib where the stream lacks the format.
function streamSupports(Stream) {
  try { new Stream("deflate-raw"); return true; } catch { return false; }
}
async function deflateRaw(bytes) {
  if (streamSupports(globalThis.CompressionStream)) return throughStream(globalThis.CompressionStream, bytes);
  const zlib = await import("node:zlib");
  return new Uint8Array(zlib.deflateRawSync(bytes));
}
async function inflateRaw(bytes) {
  if (streamSupports(globalThis.DecompressionStream)) {
    try { return await throughStream(globalThis.DecompressionStream, bytes); }
    catch { throw new TypeError("That build code could not be decompressed"); }
  }
  const zlib = await import("node:zlib");
  try { return new Uint8Array(zlib.inflateRawSync(bytes, { maxOutputLength: MAX_EXPANDED_BYTES })); }
  catch { throw new TypeError("That build code could not be decompressed"); }
}

// ---- The string table (src/data/build-code-dictionary-v3.js) ----

function tableFromJson(json, expectedCount) {
  const list = JSON.parse(json);
  if (!Array.isArray(list) || list.length !== expectedCount || !list.every((item) => typeof item === "string")) throw new TypeError("Build code dictionary is damaged");
  return Object.freeze({ list, index: new Map(list.map((item, i) => [item, i])) });
}

let tablePromise = null;
/** The TLB3 string table (inflated once). */
export function loadBuildCodeTable() {
  tablePromise ||= (async () => {
    const { BUILD_CODE_DICTIONARY_V3: dictionary } = await import("./data/build-code-dictionary-v3.js");
    return tableFromJson(utf8Decode(await inflateRaw(base64UrlToBytes(dictionary.deflated))), dictionary.count);
  })().catch((error) => { tablePromise = null; throw error; });
  return tablePromise;
}

const syncTables = new WeakMap();
function syncTable(dictionary, inflateRawSync) {
  if (!syncTables.has(dictionary)) syncTables.set(dictionary, tableFromJson(utf8Decode(new Uint8Array(inflateRawSync(base64UrlToBytes(dictionary.deflated)))), dictionary.count));
  return syncTables.get(dictionary);
}

// ---- Packing (pure) ----

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function packString(table, text) {
  const index = table.index.get(text);
  if (index !== undefined) return `${TOKEN}${index.toString(36)}`;
  return text.startsWith(TOKEN) ? `${TOKEN}${text}` : text;
}

function unpackString(table, text) {
  if (!text.startsWith(TOKEN)) return text;
  if (text[1] === TOKEN) return text.slice(1);
  if (!/^~[0-9a-z]+$/.test(text)) throw new TypeError("Invalid build code string");
  const entry = table.list[parseInt(text.slice(1), 36)];
  if (entry === undefined) throw new TypeError("Invalid build code string");
  return entry;
}

// Object.fromEntries defines own properties, so a "__proto__" key stays an ordinary key.
function mapStrings(value, map) {
  if (typeof value === "string") return map(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, map));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [map(key), mapStrings(item, map)]));
  return value;
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameList = (a, b) => a.length === b.length && a.every((item, i) => item === b[i]);

function applyItemDiff(base, set, removed, order) {
  const value = (key) => (Object.hasOwn(set, key) ? set[key] : base[key]);
  if (order) return Object.fromEntries(order.map((key) => [key, value(key)]));
  const gone = new Set(removed);
  const entries = Object.keys(base).filter((key) => !gone.has(key)).map((key) => [key, value(key)]);
  for (const key of Object.keys(set)) if (!Object.hasOwn(base, key)) entries.push([key, set[key]]);
  return Object.fromEntries(entries);
}

function itemReference(base, index, item) {
  const set = {};
  for (const key of Object.keys(item)) if (!Object.hasOwn(base, key) || !sameJson(item[key], base[key])) set[key] = item[key];
  const removed = Object.keys(base).filter((key) => !Object.hasOwn(item, key));
  const order = sameList(Object.keys(applyItemDiff(base, set, removed, null)), Object.keys(item)) ? null : Object.keys(item);
  const parts = [index, set, removed, order];
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (last === null || (Array.isArray(last) && !last.length) || (isPlainObject(last) && !Object.keys(last).length)) parts.pop();
    else break;
  }
  return { [MARKER]: parts.map((part) => part ?? null) };
}

const keysFor = (table) => ({
  overrides: packString(table, "equipmentOverrides"),
  inventory: packString(table, "equipmentInventory"),
  source: packString(table, "sourceInventoryId"),
  id: packString(table, "id")
});

/** The packed form of a state object (strings tabled, equipped items referenced). */
export function packBuildState(state, table) {
  return referenceEquippedItems(mapStrings(state, (text) => packString(table, text)), keysFor(table));
}

// Equipped items → { "~": [inventory index, …] } (in place, on a string-packed state; shared by TLB3 and TLB4).
function referenceEquippedItems(packed, keys) {
  const overrides = packed[keys.overrides];
  const inventory = packed[keys.inventory];
  if (!isPlainObject(overrides) || !Array.isArray(inventory)) return packed;
  for (const slot of Object.keys(overrides)) {
    const item = overrides[slot];
    if (!isPlainObject(item) || typeof item[keys.source] !== "string") continue;
    const index = inventory.findIndex((entry) => isPlainObject(entry) && entry[keys.id] === item[keys.source]);
    if (index >= 0) overrides[slot] = itemReference(inventory[index], index, item);
  }
  return packed;
}

const isReference = (value) => isPlainObject(value) && Object.keys(value).length === 1 && Array.isArray(value[MARKER]);

/** The state object for a packed one (the inverse of packBuildState). */
export function unpackBuildState(packed, table) {
  if (!isPlainObject(packed)) throw new TypeError("Invalid build code state");
  resolveEquippedItems(packed, keysFor(table));
  return mapStrings(packed, (text) => unpackString(table, text));
}

// The inverse of referenceEquippedItems (in place).
function resolveEquippedItems(packed, keys) {
  const overrides = packed[keys.overrides];
  const inventory = packed[keys.inventory];
  if (isPlainObject(overrides)) {
    for (const slot of Object.keys(overrides)) {
      if (!isReference(overrides[slot])) continue;
      const [index, set = {}, removed = [], order = null] = overrides[slot][MARKER];
      const base = Array.isArray(inventory) && Number.isInteger(index) ? inventory[index] : undefined;
      if (!isPlainObject(base) || !isPlainObject(set) || !Array.isArray(removed) || !(order === null || Array.isArray(order))) throw new TypeError("Invalid build code item reference");
      overrides[slot] = applyItemDiff(base, set, removed, order);
    }
  }
  return packed;
}

/** The packed JSON for an export JSON text, or null when packing would not give that exact text back. */
export function packBuildJson(json, table) {
  let state;
  try { state = JSON.parse(json); } catch { return null; }
  if (!isPlainObject(state)) return null;
  const packed = JSON.stringify(packBuildState(state, table));
  try { return unpackBuildJson(packed, table) === json ? packed : null; } catch { return null; }
}

/** The export JSON text for a packed JSON text. */
export function unpackBuildJson(packedJson, table) {
  return JSON.stringify(unpackBuildState(JSON.parse(packedJson), table));
}

// ---- TLB4 (rules in the header; FROZEN: changing any rule changes what old TLB4 codes expand to) ----

const V4_MARK = Object.freeze({ modifiers: "~=c", legendary: "~=m", affixes: "~=g", diff: "~=d" });
const COMPOUND = "~:";
const SEPARATORS = /: |:| · | — |\n/g;
const MAX_COMPOUND_CUTS = 120;

function tableV4(v3, dictionary, extrasJson, defaultJson) {
  if (!dictionary || dictionary.baseCount !== v3.list.length) throw new TypeError("Build code dictionary is damaged");
  const extras = JSON.parse(extrasJson);
  if (!Array.isArray(extras) || extras.length !== dictionary.count || !extras.every((item) => typeof item === "string")) throw new TypeError("Build code dictionary is damaged");
  const list = [...v3.list, ...extras];
  const table = { list, index: new Map(list.map((item, i) => [item, i])) };
  const defaultState = JSON.parse(defaultJson);
  if (!isPlainObject(defaultState)) throw new TypeError("Build code dictionary is damaged");
  table.defaultPacked = JSON.stringify(packStructureV4(defaultState, table));
  return Object.freeze(table);
}

let tableV4Promise = null;
/** The TLB4 string table (the TLB3 table + build-code-dictionary-v4.js) with its packed default state (inflated once). */
export function loadBuildCodeTableV4() {
  tableV4Promise ||= (async () => {
    const [v3, { BUILD_CODE_DICTIONARY_V4: dictionary }] = await Promise.all([loadBuildCodeTable(), import("./data/build-code-dictionary-v4.js")]);
    const inflate = async (text) => utf8Decode(await inflateRaw(base64UrlToBytes(text)));
    return tableV4(v3, dictionary, await inflate(dictionary.deflated), await inflate(dictionary.defaultState));
  })().catch((error) => { tableV4Promise = null; throw error; });
  return tableV4Promise;
}

const syncTablesV4 = new WeakMap();
function syncTableV4(dictionary, dictionaryV4, inflateRawSync) {
  if (!syncTablesV4.has(dictionaryV4)) {
    const inflate = (text) => utf8Decode(new Uint8Array(inflateRawSync(base64UrlToBytes(text))));
    syncTablesV4.set(dictionaryV4, tableV4(syncTable(dictionary, inflateRawSync), dictionaryV4, inflate(dictionaryV4.deflated), inflate(dictionaryV4.defaultState)));
  }
  return syncTablesV4.get(dictionaryV4);
}

// Rule 1: strings.
function packStringV4(table, text) {
  const index = table.index.get(text);
  if (index !== undefined) return `${TOKEN}${index.toString(36)}`;
  if (text.startsWith(TOKEN)) return `${TOKEN}${text}`;
  if (text.includes(TOKEN)) return text;
  return compoundString(table, text) ?? text;
}

// The shortest split of the text at separator edges into table entries ("#" + index) and literal text ("'" + text).
function compoundString(table, text) {
  const cuts = new Set([0, text.length]);
  for (const match of text.matchAll(SEPARATORS)) { cuts.add(match.index); cuts.add(match.index + match[0].length); }
  if (cuts.size <= 2 || cuts.size > MAX_COMPOUND_CUTS) return null;
  const bounds = [...cuts].sort((a, b) => a - b);
  const best = [{ cost: 0, pieces: [] }];
  for (let j = 1; j < bounds.length; j++) {
    for (let i = 0; i < j; i++) {
      const piece = text.slice(bounds[i], bounds[j]);
      const index = table.index.get(piece);
      const encoded = index !== undefined ? `#${index.toString(36)}` : `'${piece}`;
      const cost = best[i].cost + encoded.length + 1;
      if (!best[j] || cost < best[j].cost) best[j] = { cost, pieces: [...best[i].pieces, encoded] };
    }
  }
  const pieces = [];
  for (const piece of best[bounds.length - 1].pieces) {
    const last = pieces[pieces.length - 1];
    if (piece[0] === "'" && last?.[0] === "'") pieces[pieces.length - 1] = last + piece.slice(1);
    else pieces.push(piece);
  }
  if (!pieces.some((piece) => piece[0] === "#")) return null;
  const compound = `${COMPOUND}${pieces.join(TOKEN)}`;
  return compound.length < text.length ? compound : null;
}

function unpackStringV4(table, text) {
  if (!text.startsWith(TOKEN)) return text;
  if (text[1] === TOKEN) return text.slice(1);
  if (text.startsWith(COMPOUND)) {
    return text.slice(COMPOUND.length).split(TOKEN).map((piece) => {
      if (piece[0] === "'") return piece.slice(1);
      if (!/^#[0-9a-z]+$/.test(piece)) throw new TypeError("Invalid build code string");
      const entry = table.list[parseInt(piece.slice(1), 36)];
      if (entry === undefined) throw new TypeError("Invalid build code string");
      return entry;
    }).join("");
  }
  if (!/^~[0-9a-z]+$/.test(text)) throw new TypeError("Invalid build code string");
  const entry = table.list[parseInt(text.slice(1), 36)];
  if (entry === undefined) throw new TypeError("Invalid build code string");
  return entry;
}

const keysV4 = (table) => Object.fromEntries(Object.entries({
  overrides: "equipmentOverrides", inventory: "equipmentInventory", source: "sourceInventoryId", id: "id",
  modifiers: "modifiers", legendary: "legendaryModifiers", parts: null,
  slates: "slates", slateInventory: "inventory", affixes: "affixes", affixGroups: "affixGroups"
}).map(([name, key]) => [name, name === "parts"
  ? ["implicitModifiers", "baseAffixModifiers", "prefixModifiers", "suffixModifiers"].map((part) => packStringV4(table, part))
  : packStringV4(table, key)]));

// Rule 2: gear lines.
function gearItems(packed, keys) {
  const items = [];
  if (Array.isArray(packed[keys.inventory])) items.push(...packed[keys.inventory].filter(isPlainObject));
  if (isPlainObject(packed[keys.overrides])) items.push(...Object.values(packed[keys.overrides]).filter((item) => isPlainObject(item) && !isReference(item)));
  return items;
}
// The item's implicit + base affix + prefix + suffix lines, or null when one of them is there but not a list.
function gearHead(item, keys) {
  const head = [];
  for (const part of keys.parts) {
    if (!Object.hasOwn(item, part)) continue;
    if (!Array.isArray(item[part])) return null;
    head.push(...item[part]);
  }
  return head;
}
function stripGear(item, keys) {
  const modifiers = item[keys.modifiers];
  if (!Array.isArray(modifiers)) return;
  const legendarySame = Object.hasOwn(item, keys.legendary) && sameJson(item[keys.legendary], modifiers);
  const head = gearHead(item, keys);
  if (head?.length && head.length <= modifiers.length && head.every((line, i) => sameJson(line, modifiers[i]))) item[keys.modifiers] = [V4_MARK.modifiers, ...modifiers.slice(head.length)];
  if (legendarySame) item[keys.legendary] = V4_MARK.legendary;
}
function restoreGear(item, keys) {
  const modifiers = item[keys.modifiers];
  if (Array.isArray(modifiers) && modifiers[0] === V4_MARK.modifiers) {
    const head = gearHead(item, keys);
    if (!head?.length) throw new TypeError("Invalid build code gear lines");
    item[keys.modifiers] = [...head, ...modifiers.slice(1)];
  }
  if (item[keys.legendary] === V4_MARK.legendary) {
    if (!Array.isArray(item[keys.modifiers])) throw new TypeError("Invalid build code gear lines");
    item[keys.legendary] = [...item[keys.modifiers]];
  }
}

// Rule 3: slate affixes.
function slateItems(packed, keys) {
  const slates = packed[keys.slates];
  return isPlainObject(slates) && Array.isArray(slates[keys.slateInventory]) ? slates[keys.slateInventory].filter(isPlainObject) : [];
}
function groupedAffixes(slate, keys) {
  const groups = slate[keys.affixGroups];
  if (!isPlainObject(groups) || !Object.values(groups).every(Array.isArray)) return null;
  return Object.values(groups).flat();
}
function stripSlate(slate, keys) {
  const flat = groupedAffixes(slate, keys);
  if (flat?.length && Array.isArray(slate[keys.affixes]) && sameJson(flat, slate[keys.affixes])) slate[keys.affixes] = V4_MARK.affixes;
}
function restoreSlate(slate, keys) {
  if (slate[keys.affixes] !== V4_MARK.affixes) return;
  const flat = groupedAffixes(slate, keys);
  if (!flat?.length) throw new TypeError("Invalid build code slate");
  slate[keys.affixes] = flat;
}

// Rules 1–4 (in place on a fresh string-packed copy).
function packStructureV4(state, table) {
  const keys = keysV4(table);
  const packed = mapStrings(state, (text) => packStringV4(table, text));
  for (const item of gearItems(packed, keys)) stripGear(item, keys);
  for (const slate of slateItems(packed, keys)) stripSlate(slate, keys);
  return referenceEquippedItems(packed, keys);
}

// Rule 5: difference from the frozen default state.
const isDiff = (value) => isPlainObject(value) && Object.keys(value).length === 1 && Array.isArray(value[V4_MARK.diff]);
function trimParts(parts) {
  while (parts.length) {
    const last = parts[parts.length - 1];
    if (last === null || (Array.isArray(last) && !last.length) || (isPlainObject(last) && !Object.keys(last).length)) parts.pop();
    else break;
  }
  return parts;
}
function diffObject(base, value) {
  const set = {};
  for (const key of Object.keys(value)) {
    if (Object.hasOwn(base, key) && sameJson(base[key], value[key])) continue;
    let entry = value[key];
    if (Object.hasOwn(base, key) && isPlainObject(base[key]) && isPlainObject(entry)) {
      const nested = diffObject(base[key], entry);
      if (JSON.stringify(nested).length < JSON.stringify(entry).length) entry = nested;
    }
    Object.defineProperty(set, key, { value: entry, enumerable: true, writable: true, configurable: true });
  }
  const removed = Object.keys(base).filter((key) => !Object.hasOwn(value, key));
  const order = sameList(Object.keys(applyItemDiff(base, set, removed, null)), Object.keys(value)) ? null : Object.keys(value);
  return { [V4_MARK.diff]: trimParts([set, removed, order]).map((part) => part ?? null) };
}
function applyDiff(base, node) {
  const [set = {}, removed = [], order = null] = node[V4_MARK.diff];
  const strings = (list) => Array.isArray(list) && list.every((key) => typeof key === "string");
  if (!isPlainObject(base) || !isPlainObject(set) || !strings(removed) || !(order === null || strings(order))) throw new TypeError("Invalid build code difference");
  const resolved = Object.fromEntries(Object.keys(set).map((key) => [key, isDiff(set[key]) ? applyDiff(Object.hasOwn(base, key) ? base[key] : null, set[key]) : set[key]]));
  if (order && order.some((key) => !Object.hasOwn(resolved, key) && !Object.hasOwn(base, key))) throw new TypeError("Invalid build code difference");
  return applyItemDiff(base, resolved, removed, order);
}

/** The TLB4-packed form of a state object. */
export function packBuildStateV4(state, table) {
  return diffObject(JSON.parse(table.defaultPacked), packStructureV4(state, table));
}

/** The state object for a TLB4-packed one (the inverse of packBuildStateV4). */
export function unpackBuildStateV4(node, table) {
  if (!isDiff(node)) throw new TypeError("Invalid build code state");
  const packed = applyDiff(JSON.parse(table.defaultPacked), node);
  const keys = keysV4(table);
  resolveEquippedItems(packed, keys);
  for (const slate of slateItems(packed, keys)) restoreSlate(slate, keys);
  for (const item of gearItems(packed, keys)) restoreGear(item, keys);
  return mapStrings(packed, (text) => unpackStringV4(table, text));
}

/** The TLB4-packed JSON for an export JSON text, or null when unpacking would not give that exact text back. */
export function packBuildJsonV4(json, table) {
  let state;
  try { state = JSON.parse(json); } catch { return null; }
  if (!isPlainObject(state)) return null;
  let packed;
  try { packed = JSON.stringify(packBuildStateV4(state, table)); } catch { return null; }
  try { return unpackBuildJsonV4(packed, table) === json ? packed : null; } catch { return null; }
}

/** The export JSON text for a TLB4-packed JSON text. */
export function unpackBuildJsonV4(packedJson, table) {
  return JSON.stringify(unpackBuildStateV4(JSON.parse(packedJson), table));
}

// ---- Codes ----

function compactBody(trimmed, prefix) {
  const body = trimmed.slice(prefix.length);
  if (!body || body.length > MAX_COMPACT_LENGTH) throw new TypeError("Invalid or oversized build code");
  return base64UrlToBytes(body);
}

/**
 * The compact code for an original build code (base64url JSON): TLB4 when its packing round-trips exactly, else TLB3,
 * else TLB2. Compact input comes back unchanged.
 */
export async function compactBuildCode(code) {
  const text = String(code ?? "").trim();
  if (isCompactBuildCode(text)) return text;
  const bytes = base64UrlToBytes(text);
  let packed = null;
  try { packed = packBuildJsonV4(utf8Decode(bytes), await loadBuildCodeTableV4()); } catch { packed = null; }
  if (packed !== null) return `${COMPACT_BUILD_CODE_PREFIX}${bytesToBase64Url(await deflateRaw(utf8Encode(packed)))}`;
  return compactBuildCodeV3(text);
}

/** The TLB3 code for an original build code when its packing round-trips exactly, else TLB2 (no longer written by Export). */
export async function compactBuildCodeV3(code) {
  const text = String(code ?? "").trim();
  if (isCompactBuildCode(text)) return text;
  const bytes = base64UrlToBytes(text);
  let packed = null;
  try { packed = packBuildJson(utf8Decode(bytes), await loadBuildCodeTable()); } catch { packed = null; }
  if (packed !== null) return `${V3_COMPACT_BUILD_CODE_PREFIX}${bytesToBase64Url(await deflateRaw(utf8Encode(packed)))}`;
  return legacyCompactBuildCode(text);
}

/** The TLB2 code (no packing) for an original build code. */
export async function legacyCompactBuildCode(code) {
  const text = String(code ?? "").trim();
  return `${LEGACY_COMPACT_BUILD_CODE_PREFIX}${bytesToBase64Url(await deflateRaw(base64UrlToBytes(text)))}`;
}

function originalCode(version, inflated, table) {
  const text = utf8Decode(inflated);
  if (version === "TLB2") return bytesToBase64Url(inflated);
  let json;
  try { json = version === "TLB4" ? unpackBuildJsonV4(text, table) : unpackBuildJson(text, table); } catch { throw new TypeError("That build code could not be read"); }
  const bytes = utf8Encode(json);
  if (bytes.length > MAX_EXPANDED_BYTES) throw new TypeError("Build code expands too far");
  return bytesToBase64Url(bytes);
}

/**
 * The original build code for a compact one (exactly what Export wrote for that state); other text is returned trimmed,
 * so the result can go straight to src/planner-state.js importBuildCode / decodePlannerState.
 */
export async function expandBuildCode(text) {
  const trimmed = String(text ?? "").trim();
  const version = compactCodeVersion(trimmed);
  if (!version) return trimmed;
  const inflated = await inflateRaw(compactBody(trimmed, `${version}:`));
  const table = version === "TLB4" ? await loadBuildCodeTableV4() : version === "TLB3" ? await loadBuildCodeTable() : null;
  return originalCode(version, inflated, table);
}

/**
 * expandBuildCode without streams or dynamic imports: inflateRawSync (bytes → bytes) and the dictionary modules' tables
 * (dictionary: BUILD_CODE_DICTIONARY_V3, needed for TLB3 and TLB4; dictionaryV4: BUILD_CODE_DICTIONARY_V4, for TLB4).
 */
export function expandBuildCodeSync(text, { inflateRawSync, dictionary, dictionaryV4 } = {}) {
  const trimmed = String(text ?? "").trim();
  const version = compactCodeVersion(trimmed);
  if (!version) return trimmed;
  let inflated;
  try { inflated = new Uint8Array(inflateRawSync(compactBody(trimmed, `${version}:`), { maxOutputLength: MAX_EXPANDED_BYTES })); }
  catch (error) { throw error instanceof TypeError && /oversized|characters/.test(error.message) ? error : new TypeError("That build code could not be decompressed"); }
  const table = version === "TLB4" ? syncTableV4(dictionary, dictionaryV4, inflateRawSync) : version === "TLB3" ? syncTable(dictionary, inflateRawSync) : null;
  return originalCode(version, inflated, table);
}
