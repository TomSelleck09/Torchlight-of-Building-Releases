// Compact storage of the build library in localStorage (2026-11-09, user report: the build name turned red with "Storage full"
// and a reload lost the open build). The library used to be stored as plain JSON with every build's state and up to ten full
// copies of it in its revisions: about 0.55 MB per worked build, so roughly nine builds filled the browser's 5 MB quota.
//
// Format "TLBLIB2:" + JSON container:
//   { format: "tli-builder-library", version: 2, schemaVersion, activeBuildId, compareBuildId,
//     builds: [record, …], qz?: compressed JSON of the quarantined builds }
//   record: the build's own fields except state and revisions (id, name, notes, timestamps, shareHistory, …), rv (revision
//   count), z: compressText(JSON.stringify({ s: state, r: [revision, …] })). Revisions are stored oldest first as differences:
//   the newest one against the current state, each older one against the next newer one ({ t, l, p: patch }, { t, l } when
//   equal, { t, l, f: state } when a difference would not be smaller). A record whose compact form does not decode back to
//   the exact JSON of its state and revisions is stored plain ({ …, state, revisions }); the reader takes both.
// The plain JSON library (the format before 2026-11-09) is still read. The "TLBLIB2:" prefix makes the value unreadable for an
// older planner, which then keeps it unchanged and blocks its own writes (planner-state.js quarantine), so an old tab can never
// replace the compact library with an empty one.
//
// This module imports nothing: src/recovery-core.js (Recovery screen, backups) uses it too.

export const COMPACT_LIBRARY_PREFIX = "TLBLIB2:";
export const COMPACT_LIBRARY_FORMAT = "tli-builder-library";
export const COMPACT_LIBRARY_VERSION = 2;

export const isCompactLibraryText = (text) => typeof text === "string" && text.startsWith(COMPACT_LIBRARY_PREFIX);
export const isCompactBuildRecord = (record) => Boolean(record) && typeof record === "object" && !Array.isArray(record) && typeof record.z === "string";

// ---- Text compression (LZW with a growing code width, 15 bits per stored character) ----------------------------------------
// The scheme of lz-string's compressToUTF16: every stored character holds 15 bits + 32, so it is never a control character or
// a surrogate and costs one UTF-16 unit of the quota. Codes 0 and 1 introduce a new 8-bit or 16-bit character, 2 ends the
// stream, and dictionary codes start at 3.

const BITS_PER_CHAR = 15;
const CHAR_OFFSET = 32;

export function compressText(input) {
  const text = String(input);
  const out = [];
  let value = 0, position = 0;
  const writeBit = (bit) => {
    value = (value << 1) | bit;
    if (position === BITS_PER_CHAR - 1) { out.push(String.fromCharCode(value + CHAR_OFFSET)); value = 0; position = 0; }
    else position++;
  };
  const writeBits = (number, count) => { for (let i = 0; i < count; i++) { writeBit(number & 1); number >>= 1; } };
  // The dictionary as a trie: a phrase is its code; phrase + character is children.get(code * 65536 + character).
  const charCode = new Int32Array(65536).fill(-1);
  const children = new Map();
  const pending = new Set(); // characters whose first use is still to be written as a literal
  let enlargeIn = 2, dictSize = 3, numBits = 2;
  const grow = () => { if (--enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; } };
  const emit = (code, single) => {
    if (single !== -1 && pending.has(single)) {
      if (single < 256) { writeBits(0, numBits); writeBits(single, 8); }
      else { writeBits(1, numBits); writeBits(single, 16); }
      grow();
      pending.delete(single);
    } else writeBits(code, numBits);
    grow();
  };
  let w = -1, wSingle = -1; // the current phrase's code, and its character when it is one character long
  for (let index = 0; index < text.length; index++) {
    const c = text.charCodeAt(index);
    if (charCode[c] === -1) { charCode[c] = dictSize++; pending.add(c); }
    if (w === -1) { w = charCode[c]; wSingle = c; continue; }
    const key = w * 65536 + c;
    const next = children.get(key);
    if (next !== undefined) { w = next; wSingle = -1; continue; }
    emit(w, wSingle);
    children.set(key, dictSize++);
    w = charCode[c]; wSingle = c;
  }
  if (w !== -1) emit(w, wSingle);
  writeBits(2, numBits);
  for (;;) {
    value <<= 1;
    if (position === BITS_PER_CHAR - 1) { out.push(String.fromCharCode(value + CHAR_OFFSET)); break; }
    position++;
  }
  return out.join("");
}

/** The text compressText was given, or null when the input is not a valid compressed stream. */
export function decompressText(input) {
  if (typeof input !== "string" || !input.length) return null;
  const length = input.length;
  let index = 0, current = 0, mask = 0;
  const nextChar = () => {
    if (index >= length) return false;
    current = input.charCodeAt(index++) - CHAR_OFFSET;
    if (current < 0 || current >= 1 << BITS_PER_CHAR) return false;
    mask = 1 << (BITS_PER_CHAR - 1);
    return true;
  };
  if (!nextChar()) return null;
  let exhausted = false;
  const readBits = (count) => {
    let bits = 0;
    for (let power = 0; power < count; power++) {
      if (mask === 0 && !nextChar()) { exhausted = true; return 0; }
      if (current & mask) bits |= 1 << power;
      mask >>= 1;
    }
    return bits;
  };
  const dictionary = [];
  let enlargeIn = 4, dictSize = 4, numBits = 3;
  const first = readBits(2);
  if (exhausted) return null;
  let c;
  if (first === 0) c = String.fromCharCode(readBits(8));
  else if (first === 1) c = String.fromCharCode(readBits(16));
  else if (first === 2) return "";
  else return null;
  if (exhausted) return null;
  dictionary[3] = c;
  let w = c;
  const result = [c];
  for (;;) {
    let code = readBits(numBits);
    if (exhausted) return null;
    if (code === 0 || code === 1) {
      const char = String.fromCharCode(readBits(code === 0 ? 8 : 16));
      if (exhausted) return null;
      dictionary[dictSize++] = char;
      code = dictSize - 1;
      enlargeIn--;
    } else if (code === 2) return result.join("");
    if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
    let entry;
    if (code < dictSize && dictionary[code] !== undefined) entry = dictionary[code];
    else if (code === dictSize) entry = w + w[0];
    else return null;
    result.push(entry);
    dictionary[dictSize++] = w + entry[0];
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
  }
}

/** compressText's output when it decompresses to exactly the input, else null. */
export function compressVerified(text) {
  try { const packed = compressText(text); return decompressText(packed) === text ? packed : null; } catch { return null; }
}

// ---- JSON differences ------------------------------------------------------------------------------------------------------
// diffJson(base, target) → a patch, or undefined when both are the same JSON (key order included). applyJsonPatch(base, patch)
// → target. Patch nodes: { "=": value } replaces; { o: { key: patch }, "-": [removed keys], k: [key order] } edits an object
// (k only when the result's key order is not "base keys left, then added keys"); { a: [[index, patch], …] } edits an array of
// the same length; { p, s, m } keeps p leading and s trailing items of the base array and puts the items m between them.

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function jsonEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!jsonEqual(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const keysA = Object.keys(a), keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) if (keysA[i] !== keysB[i] || !jsonEqual(a[keysA[i]], b[keysB[i]])) return false;
  return true;
}

export function diffJson(base, target) {
  if (base === target) return undefined;
  if (isPlainObject(base) && isPlainObject(target)) {
    const o = {}, removed = [];
    let changed = false;
    for (const key of Object.keys(base)) if (!own(target, key)) removed.push(key);
    const targetKeys = Object.keys(target);
    for (const key of targetKeys) {
      const patch = own(base, key) ? diffJson(base[key], target[key]) : { "=": target[key] };
      if (patch !== undefined) { changed = true; Object.defineProperty(o, key, { value: patch, enumerable: true, writable: true, configurable: true }); }
    }
    const natural = [...Object.keys(base).filter((key) => own(target, key)), ...targetKeys.filter((key) => !own(base, key))];
    const reordered = natural.length !== targetKeys.length || natural.some((key, i) => key !== targetKeys[i]);
    if (!changed && !removed.length && !reordered) return undefined;
    const patch = { o };
    if (removed.length) patch["-"] = removed;
    if (reordered) patch.k = targetKeys;
    return patch;
  }
  if (Array.isArray(base) && Array.isArray(target)) {
    if (base.length === target.length) {
      const a = [];
      for (let i = 0; i < target.length; i++) { const patch = diffJson(base[i], target[i]); if (patch !== undefined) a.push([i, patch]); }
      return a.length ? { a } : undefined;
    }
    let p = 0;
    while (p < base.length && p < target.length && jsonEqual(base[p], target[p])) p++;
    let s = 0;
    while (s < base.length - p && s < target.length - p && jsonEqual(base[base.length - 1 - s], target[target.length - 1 - s])) s++;
    return { p, s, m: target.slice(p, target.length - s) };
  }
  return { "=": target };
}

const objectFrom = (entries) => Object.fromEntries(entries); // CreateDataProperty: a "__proto__" key stays a plain key

export function applyJsonPatch(base, patch) {
  if (!isPlainObject(patch)) throw new TypeError("Invalid stored difference");
  if (own(patch, "=")) return patch["="];
  if (own(patch, "o")) {
    if (!isPlainObject(base) || !isPlainObject(patch.o)) throw new TypeError("Invalid stored difference");
    const removed = new Set(Array.isArray(patch["-"]) ? patch["-"] : []);
    const keys = Array.isArray(patch.k) ? patch.k
      : [...Object.keys(base).filter((key) => !removed.has(key)), ...Object.keys(patch.o).filter((key) => !own(base, key))];
    return objectFrom(keys.map((key) => {
      if (own(patch.o, key)) return [key, applyJsonPatch(own(base, key) ? base[key] : undefined, patch.o[key])];
      if (!own(base, key)) throw new TypeError("Invalid stored difference");
      return [key, base[key]];
    }));
  }
  if (own(patch, "a")) {
    if (!Array.isArray(base) || !Array.isArray(patch.a)) throw new TypeError("Invalid stored difference");
    const result = base.slice();
    for (const [index, item] of patch.a) {
      if (!Number.isInteger(index) || index < 0 || index >= result.length) throw new TypeError("Invalid stored difference");
      result[index] = applyJsonPatch(result[index], item);
    }
    return result;
  }
  if (own(patch, "m")) {
    const { p, s, m } = patch;
    if (!Array.isArray(base) || !Array.isArray(m) || !Number.isInteger(p) || !Number.isInteger(s) || p < 0 || s < 0 || p + s > base.length) throw new TypeError("Invalid stored difference");
    return [...base.slice(0, p), ...m, ...base.slice(base.length - s)];
  }
  throw new TypeError("Invalid stored difference");
}

// ---- Build records -----------------------------------------------------------------------------------------------------------

const payloadJson = (state, revisions) => JSON.stringify({ state, revisions });

// A revision's packed entry depends only on it and the next newer state; `cache` (a WeakMap keyed by the revision object) keeps
// it across saves, so a save that adds one revision computes one difference.
function packRevision(revision, newer, cache) {
  const cached = cache?.get(revision);
  if (cached && cached.newer === newer && cached.state === revision.state && cached.timestamp === revision.timestamp && cached.label === revision.label) return cached.entry;
  const entry = { t: revision.timestamp, l: revision.label };
  const patch = diffJson(newer, revision.state);
  if (patch !== undefined) {
    const patchText = JSON.stringify(patch);
    const fullText = patchText.length > 2000 ? JSON.stringify(revision.state) : undefined;
    if (fullText !== undefined && patchText.length >= fullText.length) entry.f = revision.state;
    else entry.p = patch;
  }
  cache?.set(revision, { newer, state: revision.state, timestamp: revision.timestamp, label: revision.label, entry });
  return entry;
}

function packRevisions(state, revisions, cache) {
  const packed = new Array(revisions.length);
  let newer = state;
  for (let i = revisions.length - 1; i >= 0; i--) {
    const revision = revisions[i];
    if (!isPlainObject(revision)) return null;
    // Not the record shape this format knows: the build is stored plain.
    if (Object.keys(revision).some((key) => key !== "timestamp" && key !== "label" && key !== "state")) return null;
    packed[i] = packRevision(revision, newer, cache);
    newer = revision.state;
  }
  return packed;
}

function unpackRevisions(state, packed) {
  if (!Array.isArray(packed)) throw new TypeError("Invalid stored revisions");
  const revisions = new Array(packed.length);
  let newer = state;
  for (let i = packed.length - 1; i >= 0; i--) {
    const entry = packed[i];
    if (!isPlainObject(entry)) throw new TypeError("Invalid stored revision");
    const revisionState = own(entry, "f") ? entry.f : own(entry, "p") ? applyJsonPatch(newer, entry.p) : newer;
    const revision = {};
    if (entry.t !== undefined) revision.timestamp = entry.t;
    if (entry.l !== undefined) revision.label = entry.l;
    revision.state = revisionState;
    revisions[i] = revision;
    newer = revisionState;
  }
  return revisions;
}

/**
 * The compact form ({ rv, z }) of a build's state and revisions, verified: decoding it gives exactly the JSON of
 * { state, revisions }. Null when the build cannot be stored compactly (it is then stored plain).
 */
export function encodeBuildPayload(build, { revisionCache } = {}) {
  try {
    const revisions = Array.isArray(build?.revisions) ? build.revisions : null;
    if (!revisions || !isPlainObject(build.state)) return null;
    const r = packRevisions(build.state, revisions, revisionCache);
    if (!r) return null;
    const text = JSON.stringify({ s: build.state, r });
    const z = compressText(text);
    // Verified: the stored text decompresses to exactly what was packed, and unpacks to exactly this state and these revisions.
    const unpacked = decompressText(z);
    if (unpacked !== text) return null;
    if (payloadText(unpacked) !== payloadJson(build.state, revisions)) return null;
    return { rv: revisions.length, z };
  } catch { return null; }
}

function payloadText(text) {
  const payload = JSON.parse(text);
  if (!isPlainObject(payload) || !isPlainObject(payload.s)) throw new TypeError("A stored build has an unexpected shape");
  return payloadJson(payload.s, unpackRevisions(payload.s, payload.r));
}

/**
 * { state, revisions } (fresh objects) of a compact build's z. Throws when it cannot be read. `cache` (a Map from z to the
 * decoded JSON text) spares decompressing a build again when the library is re-read after another tab saved a different one.
 */
export function decodeBuildPayload(z, cache = null) {
  let text = cache?.get(z);
  if (text === undefined) {
    const packed = decompressText(z);
    if (packed === null) throw new TypeError("A stored build could not be decompressed");
    text = payloadText(packed);
    cache?.set(z, text);
  }
  // Revisions share unchanged parts with each other; the JSON round trip gives the caller separate objects.
  return JSON.parse(text);
}

/** The plain build record ({ …, state, revisions }) of a stored record (compact or plain). Throws when a compact one cannot be read. */
export function decodeBuildRecord(record, { cache = null } = {}) {
  if (!isCompactBuildRecord(record)) return record;
  const { z, rv, ...meta } = record;
  const { state, revisions } = decodeBuildPayload(z, cache);
  if (Number.isInteger(rv) && rv !== revisions.length) throw new TypeError("A stored build lost revisions");
  return { ...meta, state, revisions };
}

/** The stored (compact when possible) record of a build; `payload` is an already verified encodeBuildPayload result. */
export function compactBuildRecord(build, payload = encodeBuildPayload(build)) {
  if (!payload) return build;
  const { state, revisions, ...meta } = build;
  return { ...meta, rv: payload.rv, z: payload.z };
}

// ---- Library --------------------------------------------------------------------------------------------------------------

/**
 * The stored text of a library ({ schemaVersion, activeBuildId, compareBuildId, builds, quarantinedBuilds? } with plain build
 * records). `payloadFor(build)` may supply each build's verified compact payload (a cache); by default each is encoded here.
 */
export function encodeLibraryText(library, { payloadFor = encodeBuildPayload } = {}) {
  const { builds = [], quarantinedBuilds, format, version, qz, ...rest } = library || {};
  const container = { format: COMPACT_LIBRARY_FORMAT, version: COMPACT_LIBRARY_VERSION, ...rest, builds: builds.map((build) => compactBuildRecord(build, payloadFor(build))) };
  if (Array.isArray(quarantinedBuilds) && quarantinedBuilds.length) {
    const text = JSON.stringify(quarantinedBuilds);
    const packed = compressVerified(text);
    if (packed !== null) container.qz = packed; else container.quarantinedBuilds = quarantinedBuilds;
  }
  return `${COMPACT_LIBRARY_PREFIX}${JSON.stringify(container)}`;
}

/**
 * The stored library value with its build records as stored (compact records keep their z; decode each with
 * decodeBuildRecord) and the quarantined builds decoded. Plain JSON (the older format) comes back parsed. Throws when the
 * value is not a readable library.
 */
export function parseStoredLibrary(text) {
  if (text === null || text === undefined || text === "") return {};
  if (!isCompactLibraryText(text)) return JSON.parse(text);
  const container = JSON.parse(text.slice(COMPACT_LIBRARY_PREFIX.length));
  if (!isPlainObject(container) || container.format !== COMPACT_LIBRARY_FORMAT || container.version !== COMPACT_LIBRARY_VERSION || !Array.isArray(container.builds)) throw new TypeError("The stored build library has an unexpected shape");
  const { format, version, qz, ...library } = container;
  if (typeof qz === "string") {
    const quarantined = decompressText(qz);
    if (quarantined === null) throw new TypeError("The stored build library's kept builds could not be decompressed");
    library.quarantinedBuilds = JSON.parse(quarantined);
  }
  return library;
}

/**
 * The stored library value as a plain library object (every build record with its state and full revisions), as the format
 * before 2026-11-09 stored it. A compact record that cannot be read stays as stored (its z kept), so nothing is dropped.
 */
export function decodeStoredLibrary(text) {
  const library = parseStoredLibrary(text);
  if (!isPlainObject(library) || !Array.isArray(library.builds)) return library;
  return { ...library, builds: library.builds.map((record) => { try { return decodeBuildRecord(record); } catch { return record; } }) };
}

// ---- Unsaved copies --------------------------------------------------------------------------------------------------------
// When a library write fails, the open build is kept in a small copy (planner-state.js): this tab's sessionStorage (kept across
// a reload of the tab) and, when it fits, localStorage. The copy holds the build's fields and its state, compressed.

export const UNSAVED_COPY_KEY = "tli-builder:unsaved-build:v1";
export const UNSAVED_COPY_LOCAL_PREFIX = `${UNSAVED_COPY_KEY}:`;

export function encodeUnsavedCopy({ build, savedAt, reason = "" }) {
  const { state, revisions, ...meta } = build;
  const json = JSON.stringify(state);
  const z = compressVerified(json);
  return JSON.stringify({ format: "tli-builder-unsaved-build", version: 1, savedAt, reason, build: meta, ...(z !== null ? { z } : { state }) });
}

/** { savedAt, reason, build: { …, state } } of a stored unsaved copy, or null when it cannot be read. */
export function decodeUnsavedCopy(text) {
  try {
    const copy = JSON.parse(text);
    if (!isPlainObject(copy) || copy.format !== "tli-builder-unsaved-build" || !isPlainObject(copy.build) || typeof copy.build.id !== "string") return null;
    let state = copy.state;
    if (typeof copy.z === "string") { const json = decompressText(copy.z); if (json === null) return null; state = JSON.parse(json); }
    if (!isPlainObject(state)) return null;
    return { savedAt: String(copy.savedAt || ""), reason: String(copy.reason || ""), build: { ...copy.build, state } };
  } catch { return null; }
}
