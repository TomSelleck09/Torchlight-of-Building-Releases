// The tagged attribute pool (W9 step 3, 2026-11-04; research/unified-state-design-2026-11-03.md §4 part (b), the user's decisions
// §11: static first, generic skill hits first, exact parity on a toggle flip). Pure: no planner import, no game table import.
//
// One pool holds writes per unit ("player" first; "dummy" for what is written on the enemy: damage taken, crit taken). A write is one
// attribute write as the game's attribute component holds it (research/getattr-cast-speed-2026-10-28.md §2.3-2.4, the node 114 trace
// research/node-114-trace-2026-11-03.md §2):
//   { unit, attr, mod, value, upper, requirement, skillId, source, layer, group, entry, conditions, gates }
//   - attr: the game attribute id where one is named (5719 damage, 5107 Fire Damage, 4802 Critical Strike Rating …), else a planner key
//     ("maxDamage:Fire") for a reading the game tables name no id for. A field target is its field id.
//   - mod: 1 base / flat, 2 added (value = min, upper = max), 3 increased, 4 additional, 5 total; "override" a "fixed at" value.
//   - requirement: the tag requirement, as the GetAttr matcher reads it (src/recipe-interpreter.js has the same rule): an array of
//     alternatives (any one admits), each { mine, others, notMine, notOthers, anyMine, anyOthers }: within one alternative every `mine`
//     tag must be in the query's own list and every `others` tag in its second list; a non-empty any-list admits on any one of its tags
//     instead of the all-list (FUN_141d154b0). null = untagged (admitted by every query); false = never admitted.
//   - "this skill" (5000002) is stored as the writing skill's own tag (`skillIdTag(skillId)`), "this support" (5000001) as the
//     support's: the substitution happens at write time (proven, nodes 101 and 114), so only a query carrying that skill's id sees it.
//   - source: { kind: "line" | "text" | "buff" | "support" | "trait" | "model" | "stat", … } (a `text` write is a text reader's
//     reading of a line the recipe cannot place).
//   - layer: "reading" (what today's paths read), "record" (a game record write the reading does not use yet: a line's other static
//     writes, a held buff's record), "stat" (a stat-sheet total seeded as a source for conversions). Queries read "reading" by default.
//   - group: writes of one group count once per query (a line's per-type writes: "+X% Fire and Cold Damage" is two attributes, and a
//     part that counts as both types takes the line once: the planner's reading, src/skill-hit-lines.js scopeApplies).
//   - entry: the ledger entry the reading shows (the hit model's line objects): the pool returns them in insertion order.
//
// A query is the reader's tag lists and skill id (`makeQuery`); the result sums like GetAttr: base Σ mod 1, Σ increased, every
// additional its own factor (Π(1 + v / 100), as the planner's ledgers already multiply), final = base × (1 + Σ / 100) × Π, the
// smallest admitted "fixed at" value replacing it. Sums run in insertion order (parents first), so a reader that continues a sum gets
// the same floating result as one list.
//
// Conversions (node 114 "for every fromValue of `from`, add toLowerValue to `to`", node 126 the owner's share) are records, not
// pre-summed lines (trace §10). Mode "traced": evaluated at every read, with the reader's own query (both lists unchanged; `fromTags`
// ignored), recursively (a conversion feeding the source is evaluated too), with a recursion guard on (unit, attribute, part, query)
// the client does not have; the source part by `fromMod` (1 base, 3 Σ increased, 4 combined additional, 5 final); 0 adds nothing;
// value = source ÷ fromValue × toLower, then the max and min limits; placed by `toMod` (1 base, 2 base + span, 3 increased, 4 one more
// additional factor). Mode "legacy" (default): records are held and listed but not evaluated, because today's paths read each such line
// through their own reading (a derived line, a hit model's Projectile Speed converter): the pool reproduces today exactly.
let sequence = 0;
const nextSeq = () => ++sequence;

export const POOL_MOD = Object.freeze({ base: 1, added: 2, increased: 3, additional: 4, total: 5, override: "override" });
export const POOL_TAG = Object.freeze({ thisSupport: 5000001, thisSkill: 5000002, hit: 5000003, dotFlow: 5000004, crit: 5001010, minion: 5002060, mainSkill: 6020000 });
/** The tag a "this skill" write carries once written by skill `id` (the client puts the skill's own tag id there). */
export const skillIdTag = (id) => `skill:${id}`;
export const supportIdTag = (id) => `support:${id}`;

const LIST_SIDES = ["mine", "others", "notMine", "notOthers", "anyMine", "anyOthers"];
const listOf = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

function normalizeAlternative(tags, { skillId = null, supportId = null } = {}) {
  const swap = (tag) => (tag === POOL_TAG.thisSkill && skillId != null ? skillIdTag(skillId) : tag === POOL_TAG.thisSupport && supportId != null ? supportIdTag(supportId) : tag);
  const out = {};
  for (const side of LIST_SIDES) {
    const raw = side === "anyMine" ? listOf(tags?.anyMine ?? tags?.any) : listOf(tags?.[side]);
    const list = [...new Set(raw.map(swap))];
    if (list.length) out[side] = list;
  }
  return out;
}
const emptyAlternative = (alt) => LIST_SIDES.every((side) => !alt[side]?.length);

/**
 * A tag requirement in the pool's form: null (untagged), false (never), or an array of alternatives. Accepts a recipe tag object
 * ({ mine, others, notMine, notOthers }), a list of them (the generator's `alt`: objects are alternatives), or the pool's own form.
 * `skillId` / `supportId`: the writer, for the "this skill" / "this support" substitution.
 */
export function normalizeRequirement(tags, options = {}) {
  if (tags === false) return false;
  if (tags == null) return null;
  const alternatives = (Array.isArray(tags) ? tags : [tags]).map((alt) => normalizeAlternative(alt, options));
  if (!alternatives.length || alternatives.some(emptyAlternative)) return null;
  return alternatives;
}

/** A query: the reader's own tag list (`mine`, plus the skill id's tag), its second list (`others`: the other unit's states, its rank). */
export function makeQuery({ mine = [], others = [], skillId = null } = {}) {
  const own = new Set(listOf(mine));
  if (skillId != null) own.add(skillIdTag(skillId));
  const second = new Set(listOf(others));
  return { mine: own, others: second, skillId, key: `${[...own].map(String).sort().join(",")}|${[...second].map(String).sort().join(",")}` };
}
const asQuery = (query) => (query?.mine instanceof Set ? query : makeQuery(query || {}));

function sideAdmits(all, any, present) {
  if (any?.length) return any.some((tag) => present.has(tag));
  return !all?.length || all.every((tag) => present.has(tag));
}
function alternativeAdmits(alt, query) {
  if (!sideAdmits(alt.mine, alt.anyMine, query.mine)) return false;
  if (!sideAdmits(alt.others, alt.anyOthers, query.others)) return false;
  if (alt.notMine?.some((tag) => query.mine.has(tag))) return false;
  if (alt.notOthers?.some((tag) => query.others.has(tag))) return false;
  return true;
}
/** The GetAttr tag rule: does `requirement` (pool form) admit `query`? */
export function admits(requirement, query) {
  if (requirement === null || requirement === undefined) return true;
  if (requirement === false) return false;
  const q = asQuery(query);
  return requirement.some((alt) => alternativeAdmits(alt, q));
}
// Does every admitting alternative of the requirement name `tag` in its own list? ("crit-only": the crit share's extra term.)
function requires(requirement, tag, query) {
  if (!Array.isArray(requirement)) return false;
  const q = asQuery(query);
  const admitting = requirement.filter((alt) => alternativeAdmits(alt, q));
  return admitting.length > 0 && admitting.every((alt) => alt.mine?.includes(tag) || alt.anyMine?.includes(tag));
}

const factorOf = (values) => values.reduce((factor, value) => factor * (1 + value / 100), 1);
const keyOf = (attr) => String(attr);

/** One attribute's parts summed like the reducer (FUN_141d28c70): base, Σ increased, the additional values. */
export function reduceParts({ base = 0, increased = 0, additional = [], clampNegative = true } = {}) {
  const increasedFactor = clampNegative ? Math.max(0, 1 + increased / 100) : 1 + increased / 100;
  const additionalFactor = additional.reduce((factor, value) => factor * (clampNegative ? Math.max(0, 1 + value / 100) : 1 + value / 100), 1);
  return base * increasedFactor * additionalFactor;
}

export class AttributePool {
  /**
   * @param {object} options { parent: a pool whose writes come first (a call's pool over a base pool), conversions: "legacy" | "traced" }
   */
  constructor({ parent = null, conversions = null } = {}) {
    this.parent = parent;
    this.conversionMode = conversions ?? parent?.conversionMode ?? "legacy";
    this.index = new Map();
    this.conversionIndex = new Map();
    this.count = 0;
  }

  /** A child pool: sees this pool's writes first, then its own (a per-call layer over a shared base). */
  extend(options = {}) { return new AttributePool({ parent: this, ...options }); }

  /** Add one write; returns the stored write. */
  add(write) {
    const stored = {
      ...write,
      // The value as given (a reader's NaN stays NaN, as in the list it replaces).
      unit: write.unit ?? "player", attr: write.attr, mod: write.mod, value: "value" in write ? write.value : 0,
      upper: Number.isFinite(write.upper) ? write.upper : null,
      requirement: normalizeRequirement(write.requirement !== undefined ? write.requirement : write.tags ?? null, write),
      skillId: write.skillId ?? null, source: write.source ?? null, layer: write.layer ?? "reading", group: write.group ?? null, entry: write.entry ?? null,
      conditions: write.conditions ?? [], gates: write.gates ?? [], seq: nextSeq()
    };
    if (!this.index.has(stored.unit)) this.index.set(stored.unit, new Map());
    const byAttr = this.index.get(stored.unit);
    const key = keyOf(stored.attr);
    if (!byAttr.has(key)) byAttr.set(key, []);
    byAttr.get(key).push(stored);
    this.count += 1;
    return stored;
  }

  /** Add several writes sharing one group (one line's per-type writes). */
  addGroup(writes, group) { return writes.map((write) => this.add({ ...write, group })); }

  /**
   * Add a conversion record (node 114 / 126). Fields: { unit, to, toMod, toTags, from, fromMod, fromValue, toLower, toUpper, max, min,
   * sourceUnit (node 126: the owner), sourceLayers, skillId, source, entry, legacy (how today's paths read the line) }.
   */
  addConversion(record) {
    const stored = { ...record, unit: record.unit ?? "player", requirement: normalizeRequirement(record.toTags ?? null, record), fromValue: Number(record.fromValue) || 1, toLower: Number(record.toLower) || 0, seq: nextSeq() };
    if (!this.conversionIndex.has(stored.unit)) this.conversionIndex.set(stored.unit, new Map());
    const byAttr = this.conversionIndex.get(stored.unit);
    const key = keyOf(stored.to);
    if (!byAttr.has(key)) byAttr.set(key, []);
    byAttr.get(key).push(stored);
    return stored;
  }

  /** Every stored write of a unit on an attribute (parents first). */
  writesOf(unit, attr) {
    const own = this.index.get(unit)?.get(keyOf(attr)) || [];
    return this.parent ? [...this.parent.writesOf(unit, attr), ...own] : own;
  }
  conversionsOf(unit, attr) {
    const own = this.conversionIndex.get(unit)?.get(keyOf(attr)) || [];
    return this.parent ? [...this.parent.conversionsOf(unit, attr), ...own] : own;
  }
  /** Every write of a unit (any attribute), in insertion order (diagnostics and tests). */
  allWrites(unit = "player") {
    const lists = [];
    for (let pool = this; pool; pool = pool.parent) for (const list of pool.index.get(unit)?.values() || []) lists.push(list);
    return lists.flat().sort((a, b) => a.seq - b.seq);
  }
  allConversions(unit = "player") {
    const lists = [];
    for (let pool = this; pool; pool = pool.parent) for (const list of pool.conversionIndex.get(unit)?.values() || []) lists.push(list);
    return lists.flat().sort((a, b) => a.seq - b.seq);
  }

  /**
   * Read attributes the way GetAttr sums them.
   * @param {string} unit
   * @param {number|string|Array} attrs one attribute or several (a damage part's family: all, its types, Elemental)
   * @param {object} options {
   *   query | mine / others / skillId: the reader's query;
   *   mods: the buckets to admit (default all);
   *   layers: the layers to read (default ["reading"]);
   *   requireTag: only writes whose admitting alternatives all name this tag (the crit share's extra term);
   *   conversions: "legacy" | "traced" (default the pool's mode); guard: internal recursion guard }
   * @returns {{ writes, entries, base, added: { min, max }, increased, additional: number[], additionalFactor, override, final, conversions, guarded }}
   */
  query(unit, attrs, options = {}) {
    const query = asQuery(options.query ?? options);
    const list = listOf(attrs);
    const mods = options.mods ? new Set(listOf(options.mods)) : null;
    const layers = new Set(options.layers ?? ["reading"]);
    const requireTag = options.requireTag ?? null;
    const lists = list.map((attr) => this.writesOf(unit, attr)).filter((items) => items.length);
    const merged = lists.length === 1 ? lists[0] : lists.flat().sort((a, b) => a.seq - b.seq);
    const writes = [], groups = new Set();
    for (const write of merged) {
      if (!layers.has(write.layer)) continue;
      if (mods && !mods.has(write.mod)) continue;
      if (!admits(write.requirement, query)) continue;
      if (requireTag !== null && !requires(write.requirement, requireTag, query)) continue;
      if (write.group !== null && write.group !== undefined) { if (groups.has(write.group)) continue; groups.add(write.group); }
      writes.push(write);
    }
    const result = summarize(writes);
    // Conversions: traced mode evaluates each admitted record at this read, with this query (trace §3).
    const mode = options.conversions ?? this.conversionMode;
    result.conversions = [];
    result.guarded = [];
    if (mode === "traced") {
      const guard = options.guard ?? new Set();
      for (const attr of list) {
        for (const record of this.conversionsOf(unit, attr)) {
          if (mods && !mods.has(record.toMod)) continue;
          if (record.heldBy) continue;
          if (!admits(record.requirement, query)) continue;
          if (requireTag !== null && !requires(record.requirement, requireTag, query)) continue;
          const value = this.conversionValue(record, query, guard);
          if (value === null) { result.guarded.push(record); continue; }
          if (value === 0) continue;
          const write = { conversion: record, unit, attr: record.to, mod: record.toMod, value: record.toMod === 2 ? value.min : value, upper: record.toMod === 2 ? value.max : null, source: record.source ?? null, entry: record.entry ? { ...record.entry, value: record.toMod === 2 ? value.min : value, ...(record.toMod === 2 ? { min: value.min, max: value.max } : {}) } : null, seq: record.seq };
          result.conversions.push(write);
          writes.push(write);
          addToSummary(result, write);
        }
      }
    }
    result.writes = writes;
    result.entries = writes.map((write) => write.entry ?? write);
    result.final = result.override !== null ? result.override : reduceParts({ base: result.base, increased: result.increased, additional: result.additional, clampNegative: options.clampNegative !== false });
    return result;
  }

  /** The part of an attribute a conversion reads (`fromMod`: 1 base, 3 Σ increased, 4 combined additional, 5 final). */
  part(unit, attr, fromMod, query, { layers = ["reading", "record", "stat"], guard = new Set() } = {}) {
    const q = asQuery(query);
    const key = `${unit}|${keyOf(attr)}|${fromMod}|${q.key}`;
    if (guard.has(key)) return null;
    guard.add(key);
    try {
      // A stat-sheet total (layer "stat") is the whole attribute: it is read alone, not summed with the lines it already holds.
      const stat = this.writesOf(unit, attr).filter((write) => write.layer === "stat" && admits(write.requirement, q));
      const result = this.query(unit, attr, { query: q, layers: stat.length ? ["stat"] : layers, guard, conversions: "traced" });
      if (fromMod === 1) return result.base;
      if (fromMod === 3) return result.increased;
      if (fromMod === 4) return (result.additionalFactor - 1) * 100;
      return result.final;
    } finally {
      guard.delete(key);
    }
  }

  /** A conversion's value at one read: null when the guard stops a cycle. */
  conversionValue(record, query, guard = new Set()) {
    const source = this.part(record.sourceUnit ?? record.unit, record.from, record.fromMod ?? 5, query, { layers: record.sourceLayers ?? ["reading", "record", "stat"], guard });
    if (source === null) return null;
    if (!source) return 0;
    const clamp = (value) => {
      let out = value;
      if (record.max !== null && record.max !== undefined && Number.isFinite(record.max)) out = Math.min(out, record.max);
      if (record.min !== null && record.min !== undefined && Number.isFinite(record.min)) out = Math.max(out, record.min);
      return out;
    };
    const low = clamp(source / record.fromValue * record.toLower);
    if (record.toMod === 2) return { min: low, max: clamp(source / record.fromValue * (Number(record.toUpper) || record.toLower)) };
    return low;
  }

  /** GetAttr(attr, tags, tags2, setBase, addBase, base): the final value; `setBase` replaces the collected base (flat writes dropped). */
  value(unit, attr, { query = {}, setBase = false, addBase = false, base = 0, layers, conversions } = {}) {
    const result = this.query(unit, attr, { query, layers, conversions });
    if (result.override !== null) return result.override;
    const collected = setBase ? base : addBase ? result.base + base : result.base;
    return reduceParts({ base: collected, increased: result.increased, additional: result.additional });
  }
}

function summarize(writes) {
  const result = { base: 0, added: { min: 0, max: 0 }, increased: 0, additional: [], additionalFactor: 1, override: null };
  for (const write of writes) addToSummary(result, write);
  return result;
}
function addToSummary(result, write) {
  switch (write.mod) {
    case 1: result.base += write.value; break;
    case 2: result.added.min += write.value; result.added.max += write.upper ?? write.value; break;
    case 3: result.increased += write.value; break;
    case 4: result.additional.push(write.value); result.additionalFactor *= 1 + write.value / 100; break;
    case 5: result.base += write.value; break;
    case "override": result.override = result.override === null ? write.value : Math.min(result.override, write.value); break;
    default: break;
  }
}

/** Σ of the values of writes (or entries), in order, from `start` (continuing a sum keeps one list's floating result). */
export const sumValues = (items, start = 0) => items.reduce((total, item) => total + item.value, start);
/** Π(1 + v / 100) of writes (or entries), in order, from `start`. */
export const productValues = (items, start = 1) => items.reduce((factor, item) => factor * (1 + item.value / 100), start);
export { factorOf };
