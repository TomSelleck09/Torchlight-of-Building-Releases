// Game bucket of a modifier line (flat / added / increased / additional), read from the affix recipes' `mod` code
// (src/data/game/affix-buckets.generated.js; research/patch-ss14/calc-data-review.md §2.3, research/patch-ss14/bucket-conflicts.md).
//
// affixBucket(text) resolves the line's shape (src/affix-shape.js shape(), as written or without a leading "Name: " prefix)
// to its game affix(es). It returns the bucket(s) only when the shape maps to one affix, or to several whose bucket sets
// agree; ambiguous shapes, unknown shapes and shapes with no attribute write return null.
//
// gameDamageLayer(text) is what the planner's line classifiers consult: the game's "increased" / "additional" layer for a
// line, but only for the shapes listed in APPLIED_GAME_LAYERS (each checked by hand in bucket-conflicts.md). Every other
// line keeps the planner's wording rule, including the wording-vs-code conflicts left for the user.
//
// The generated table is about 1 MB, so it is loaded lazily: the module imports it (top-level await) only when
// APPLIED_GAME_LAYERS lists a shape. With nothing applied the browser never fetches it, and gameDamageLayer returns null
// without it. Scripts and tests that read the table call `await loadAffixBuckets()` (or `setAffixBucketData(data)` with the
// generated AFFIX_BUCKETS) before affixBucket / affixBucketEntry / setExtraAppliedShapes.
import { shape } from "./affix-shape.js";

const BUCKET_ATTR_KINDS = new Set(["flat", "added", "increased", "additional", "flag"]);

let AFFIX_BUCKETS = null;
/** Install the generated table (src/data/game/affix-buckets.generated.js AFFIX_BUCKETS). */
export function setAffixBucketData(data) {
  AFFIX_BUCKETS = data || null;
  layerCache.clear();
}
/** Load the generated table on demand (dynamic import; about 1 MB). Resolves to the table. */
export async function loadAffixBuckets() {
  if (!AFFIX_BUCKETS) setAffixBucketData((await import("./data/game/affix-buckets.generated.js")).AFFIX_BUCKETS);
  return AFFIX_BUCKETS;
}
export const affixBucketsLoaded = () => AFFIX_BUCKETS !== null;
function requireData() {
  if (!AFFIX_BUCKETS) throw new Error("affix bucket data is not loaded: await loadAffixBuckets() first (src/affix-bucket.js)");
  return AFFIX_BUCKETS;
}

function entryFor(text) {
  const AFFIX_BUCKETS = requireData();
  const raw = String(text ?? "");
  const direct = shape(raw);
  if (AFFIX_BUCKETS[direct]) return { key: direct, entry: AFFIX_BUCKETS[direct], prefixed: false };
  const strippedText = raw.replace(/^[^:%]{2,60}:\s+/, "");
  if (strippedText !== raw) {
    const stripped = shape(strippedText);
    if (AFFIX_BUCKETS[stripped]) return { key: stripped, entry: AFFIX_BUCKETS[stripped], prefixed: true };
  }
  return null;
}

/** The raw generated entry for a line (ambiguous ones included), or null. */
export function affixBucketEntry(text) {
  return entryFor(text);
}

/**
 * @returns {null | { shape, ids: number[], buckets: string[], bucket: string|null, attrs: number[], writes: object[], prefixed: boolean }}
 *   bucket: the single bucket when every bucketed attribute write shares one, else null.
 */
export function affixBucket(text) {
  const found = entryFor(text);
  if (!found || !found.entry.agree) return null;
  const buckets = (found.entry.buckets || []).filter((b) => BUCKET_ATTR_KINDS.has(b));
  if (!buckets.length) return null;
  const writes = found.entry.candidates[0].writes.filter((w) => BUCKET_ATTR_KINDS.has(w.b));
  return {
    shape: found.key,
    ids: found.entry.candidates.map((c) => c.id),
    buckets,
    bucket: buckets.length === 1 ? buckets[0] : null,
    attrs: [...new Set(found.entry.candidates.flatMap((c) => c.writes.filter((w) => BUCKET_ATTR_KINDS.has(w.b)).map((w) => w.a)))],
    writes,
    prefixed: found.prefixed,
  };
}

// Shapes whose game layer the planner applies (scripts/report-affix-bucket-conflicts.mjs lists every conflict; only these
// were judged unambiguous and not surprising). Kept explicit so a regenerated catalog cannot silently move a figure.
export const APPLIED_GAME_LAYERS = Object.freeze({
  // 2026-10-17 game bucket code: filled in from research/patch-ss14/bucket-conflicts.md "Applied".
});

// Report / test hook: extra shapes to treat as applied (scripts/report-affix-bucket-conflicts.mjs measures what each
// left-for-the-user conflict would move). Never set by the planner.
let extraApplied = new Set();
export function setExtraAppliedShapes(shapes = []) {
  if (shapes.length) requireData();
  extraApplied = new Set(shapes);
  layerCache.clear();
}
const isApplied = (key) => Object.prototype.hasOwnProperty.call(APPLIED_GAME_LAYERS, key) || extraApplied.has(key);
const layerCache = new Map();
const anyApplied = () => extraApplied.size > 0 || Object.keys(APPLIED_GAME_LAYERS).length > 0;

/** "increased" | "additional" from the game data for an applied shape, else null (keep the wording rule). */
export function gameDamageLayer(text) {
  const key = String(text ?? "");
  if (!anyApplied()) return null; // nothing applied: no table needed
  if (layerCache.has(key)) return layerCache.get(key);
  const found = entryFor(key);
  let layer = null;
  if (found && isApplied(found.key)) {
    const bucket = affixBucket(key)?.bucket;
    if (bucket === "increased" || bucket === "additional") layer = bucket;
  }
  if (layerCache.size > 20000) layerCache.clear();
  layerCache.set(key, layer);
  return layer;
}

// Load the table before first use only when a shape is applied (the browser skips it while APPLIED_GAME_LAYERS is empty).
if (Object.keys(APPLIED_GAME_LAYERS).length) await loadAffixBuckets();
