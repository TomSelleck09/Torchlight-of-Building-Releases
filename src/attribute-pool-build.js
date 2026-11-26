// The build's attribute pool under the generic skill hits (W9 step 3, 2026-11-04; src/attribute-pool.js, src/attribute-pool-hit.js):
// what the hit readings do not carry themselves, as "record" and "stat" layer writes (no hit query reads those layers, so the figures do
// not change), and the conversion records. Built once per planner pass when TLI_POOL_HIT=pool (src/planner.js), the parent of each hit's
// pool.
//   - record: each catalog line's static game writes (node 101 on an attribute: no trigger but the damage calculation 1000031, no timed
//     buff, a value, no condition but the tag-borne states and the per-hit trigger), at the line's rank; "this skill" stays
//     5000002 (a catalog line has no writing skill); the held buffs' record writes (src/unit-buff-writes.js heldBuffWrites: value at the
//     buff's level and effect, × stacks for a stacked buff, × its steady share).
//   - stat: the stat sheet's totals (Strength, Dexterity, Intelligence, Max Life / Mana / Energy Shield, Evasion), the whole attribute a
//     conversion's `fromMod` 5 reads.
//   - conversions: node 114 (and 126, the owner's share) records from the lines. A record is evaluated only in mode "traced" and only when
//     the hit model can drop the line's legacy reading: a "… Projectile Speed bonus is also applied to … Projectile Damage" line (the hit
//     model's converter) or a line the planner resolved into derived lines (src/line-effects.js `derivedFrom`). Other records are held,
//     not evaluated (`heldBy` names the reader that still owns the line: a hero module, a channel or ailment model …).
import { interpretLine, baseId, MOD_BUCKET } from "./recipe-interpreter.js";
import { normalizePercentageText } from "./percentage-text.js";
import { AttributePool } from "./attribute-pool.js";
import { heldBuffWrites } from "./unit-buff-writes.js";

const squash = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
export const lineKeyOf = (source, text) => `${source ?? ""}|${squash(text)}`;
const MOD_NUMBER = Object.freeze(Object.fromEntries(Object.entries(MOD_BUCKET).map(([number, name]) => [name, Number(number)])));
export const SYNTHETIC = new Set(["derived", "follower", "buff"]);
export const UNIT_OF = { self: "player", enemy: "dummy", minion: "minion" };
export const GALE_LINE = /^\d+(?:\.\d+)?% of the Projectile Speed bonus is also applied to (?:the additional bonus for )?Projectile Damage$/i;
// Stat-sheet totals as the attribute ids conversions read (fromMod 5 / 1 on the whole attribute). Armor is the combat Armor
// (src/combat-armor.js: the stat sheet's lines, the Auras' and other combat Armor buffs; 2026-11-09), so a conversion reading Armor and the
// text per-Armor readers take one value (before, the pool rebuilt Armor from its record writes and missed node 321's chest Defense).
const STAT_ATTRS = Object.freeze({ strength: 1, dexterity: 2, intelligence: 3, maxLife: 1001, maxMana: 1301, maxEnergyShield: 1601, evasion: 4002, armor: 4001 });
// Text readings of planner-made lines, for the sources the hit path's conversions read (Projectile Speed: the Gale converters).
export const TEXT_WRITES = Object.freeze([
  { pattern: /^([+-]?\d+(?:\.\d+)?)% Projectile Speed$/i, attr: 6005, mod: 3 },
  { pattern: /^([+-]?\d+(?:\.\d+)?)% additional Projectile Speed$/i, attr: 6005, mod: 4 },
  // Max Spell Burst a held buff or a trait module adds (bing2 F2, 2026-11-10, user-approved): Squidnova's "+1 Max Spell Burst" (record
  // 815729280, attr 6361 flat, gated on its own state) and Multi-Coupling Equation's stacks (53529464, attr 6361 flat from a held-buff count)
  // arrive as planner-made lines; their source lines leave no static write here, so each is written once, from its derived line. Record
  // 812952064 (Vorax Neck) reads attr 6361's final value through node 114 (fromMod 5), so the neck's "per stack of Max Spell Burst" lines
  // read the combat Max Spell Burst. (A part-time Multi-Coupling stack, src/bing-traits.js coupling.partial, has no line: the whole stacks.)
  { pattern: /^\+(\d+(?:\.\d+)?) Max Spell Burst$/i, attr: 6361, mod: 1 }
]);

// One line's recipe reading, once per line object and text.
const resolvedCache = new Map();
export function resolveLine(line) {
  const text = squash(line.text);
  const key = `${line.origin}|${line.source}|${text}`;
  if (resolvedCache.has(key)) return resolvedCache.get(key);
  let resolved = null;
  try { const result = interpretLine(text, { multiplier: 1, origin: line.origin, line }); resolved = result?.templateMismatch ? result.templateMismatch.wording : result; } catch { resolved = null; }
  if (resolvedCache.size > 20000) resolvedCache.clear();
  resolvedCache.set(key, resolved);
  return resolved;
}
// A pool key for an encoded conversion target / source (attr × 10 + 1, field × 10 + 2).
export function encodedKey(id) {
  const { base, layer } = baseId(id, { encoded: true });
  if (layer === "derivedField") return `field:${base}`;
  if (layer === "derivedLabel") return `label:${base}`;
  return base;
}
export const staticWrite = (effect) => effect.kind === "attr" && effect.understood !== false && Number.isFinite(effect.value) && !effect.dynamic?.some((item) => item !== "scale")
  && effect.node !== "b" && (!effect.triggerId || effect.triggerId === 1000031) && !effect.tagAlt?.length
  // Conditions: only the tag-borne states (no gate node: they are the requirement's own tags) and the per-hit trigger.
  && (effect.conditions || []).every((condition) => condition.kind === "perHit" || (condition.kind === "state" && condition.node === undefined));

/**
 * The record layer of a line list, in list order (`tracedParent` reads the conversions of earlier lines, `heldCopy` the held buffs'
 * attributes): an ordered list of { kind: "write", write } (a pool.add argument) and { kind: "conversion", record } (a pool.addConversion
 * argument). `heldAttrs`: the held buffs' record attributes (buildAttributePool); `conversions`: the pool's conversion mode.
 */
export function compileRecordLines(modifierTexts = [], { heldAttrs = new Map(), conversions = "legacy" } = {}) {
  const items = [];
  const converted = new Set();
  const derivedFrom = new Set(modifierTexts.filter((line) => line?.derivedFrom).map((line) => lineKeyOf(line.source, line.derivedFrom)));
  const heldCopy = (line, rule) => [...heldAttrs.keys()].some((key) => { const [name, attr, mod] = key.split("|"); return Number(attr) === rule.attr && Number(mod) === rule.mod && (line.source === name || String(line.source ?? "").startsWith(`${name} (`)); });
  // A derived line of a conversion the traced pool reads at the hit (Law of Greed's "+X% Projectile Speed per stack of Max Spell Burst",
  // record 125797304: node 114 from Max Spell Burst to attr 6005) is that record's value: writing its text too would count it twice
  // (2026-11-09). The legacy pool keeps the text write (the record is not evaluated there). The derived lines follow their parent line.
  const tracedParent = (line) => conversions === "traced" && Boolean(line.derivedFrom) && converted.has(lineKeyOf(line.source, line.derivedFrom));
  modifierTexts.forEach((line, lineIndex) => {
    if (!line) return;
    const lineKey = lineKeyOf(line.source, line.text);
    const scale = Number(line.multiplier ?? 1) || 1;
    // A planner-made line (a settled condition, a buff the planner models, the follower's) has no game record: its text reading, for the
    // few stats a conversion here reads (TEXT_WRITES).
    if (line.lineEffect || SYNTHETIC.has(line.origin)) {
      for (const rule of TEXT_WRITES) {
        const match = squash(line.text).match(rule.pattern);
        if (match && !heldCopy(line, rule) && !tracedParent(line)) items.push({ kind: "write", write: { unit: "player", attr: rule.attr, mod: rule.mod, value: Number(match[1]) * scale, requirement: null, layer: "record", source: { kind: "text", origin: line.origin ?? null, line: line.text, lineSource: line.source, lineKey } } });
      }
      return;
    }
    const resolved = resolveLine(line);
    const effects = resolved?.chosen?.result?.effects || [];
    if (!effects.length) return;
    const source = { kind: "line", origin: line.origin ?? null, affixId: resolved.chosen.id ?? null, line: line.text, lineSource: line.source, lineKey };
    effects.forEach((effect, index) => {
      if (staticWrite(effect) && UNIT_OF[effect.target ?? "self"]) {
        const attr = effect.layer === "derivedField" ? `field:${effect.base}` : effect.base ?? effect.attr;
        // One group per line and write (two equal lines are two groups: each counts).
        items.push({ kind: "write", write: { unit: UNIT_OF[effect.target ?? "self"], attr, mod: effect.mod, value: effect.value * scale, upper: Number.isFinite(effect.upper) ? effect.upper * scale : null, tags: effect.tagIds ?? null, layer: "record", source, group: `line${lineIndex}#${effect.row}#${index}` } });
        return;
      }
      if ((effect.kind === "convert" || effect.kind === "share") && effect.understood !== false && Number.isFinite(effect.value)) {
        const droppable = GALE_LINE.test(squash(line.text)) ? "galeConverter" : derivedFrom.has(lineKey) ? "derivedLine" : null;
        const heldBy = line.origin === "trait" ? "the hero trait module" : droppable ? null : "the line's current reader (no derived line, not the hit model's converter)";
        const to = encodedKey(effect.attr), from = encodedKey(effect.from);
        const toMod = MOD_NUMBER[effect.bucket] ?? null, fromMod = MOD_NUMBER[effect.fromBucket] ?? 5;
        // Added flat damage (toMod 2, "Adds X - Y Fire Damage per N Strength", record 101140002): the read is an added-damage entry of
        // the target's type with its range, as a line's added write (src/attribute-pool-hit.js), so the hit model places it on its type.
        const flatSpan = toMod === 2 && effect.concept === "damage" && typeof effect.type === "string" && effect.type.length > 0;
        const addedType = flatSpan ? effect.type[0].toUpperCase() + effect.type.slice(1) : null;
        const record = {
          unit: effect.kind === "share" ? "minion" : "player", sourceUnit: "player", to, toMod, toTags: effect.toTagIds ?? null, from, fromMod,
          fromValue: effect.per ?? 1, toLower: effect.value * scale, toUpper: flatSpan && Number.isFinite(effect.upper) ? effect.upper * scale : null, max: Number.isFinite(effect.max) ? effect.max * scale : null,
          source, heldBy: droppable && line.origin !== "trait" ? null : heldBy, droppable, lineKey,
          entry: { source: line.source, text: `${line.text} (node 114, read at this hit: ${effect.fromConcept ?? from} ${effect.fromBucket ?? ""} ÷ ${effect.per ?? 1} × ${flatSpan && Number.isFinite(effect.upper) ? `${effect.value * scale} - ${effect.upper * scale}` : effect.value * scale}; game affix ${resolved.chosen.id ?? "?"})`, origin: line.origin ?? null, category: flatSpan ? `Added ${addedType} damage` : toMod === 4 ? "Additional damage" : "Increased damage", conversion: true, ...(flatSpan ? { type: addedType } : {}) }
        };
        items.push({ kind: "conversion", record });
        if (!record.heldBy) converted.add(lineKey);
      }
    });
  });
  return items;
}

/** The held buffs' record attributes `${name}|${attr}|${mod}` (compileRecordLines' `heldAttrs`), from heldBuffWrites(playerBuffs). */
export function heldRecordAttrs(heldWrites = []) {
  const heldAttrs = new Map();
  for (const item of heldWrites) for (const write of item.writes) if (item.name && write.value !== null && !write.trigger && !write.gates) heldAttrs.set(`${item.name}|${write.attr}|${write.mod}`, true);
  return heldAttrs;
}

/**
 * The build pool. `modifierTexts`: the planner's lines; `playerBuffs`: your unit buff set (src/unit-buff-set.js); `stats`: the stat
 * sheet's totals (src/planner.js lineConditionState.stats); `conversions`: the pool's conversion mode; `movementSpeedPercent`: the combat
 * increased Movement Speed (src/planner.js lineConditionState, the stat sheet's lines and the held conditional ones). `recordItems`: the
 * record layer already compiled from `modifierTexts` (src/line-intake.js LineIntake.recordFor, the same compileRecordLines call), or null.
 */
export function buildAttributePool({ modifierTexts = [], playerBuffs = null, stats = null, conversions = "legacy", movementSpeedPercent = null, recordItems = null, seal = false } = {}) {
  const pool = new AttributePool({ conversions });
  const convertedLines = new Map();
  const heldWrites = heldBuffWrites(playerBuffs);
  // A held buff the pool writes from its record (below) also has a planner-made copy of its stat as a line (an Elixir's "+179.15% Projectile
  // Speed", source "Scorpion Stinger Distillate (Elixir Effect × …)"): the copy is not written again, or a conversion reading that
  // attribute counts the buff twice (2026-11-09, 25 T gap 2: Gale read 477.8% Projectile Speed for the town panel's 256% read once).
  const heldAttrs = heldRecordAttrs(heldWrites);
  for (const item of recordItems ?? compileRecordLines(modifierTexts, { heldAttrs, conversions })) {
    if (item.kind === "write") { pool.add(item.write); continue; }
    const record = pool.addConversion(item.record);
    if (!record.heldBy) convertedLines.set(record.lineKey, record);
  }
  // Your held buffs' record writes.
  for (const item of heldWrites) {
    // A board Empower held at share 1 (own buffs pre-built) still lapses when its cooldown outlasts it: its steady uptime (W9 step 4,
    // Bull's Rage 0.8986 on Erika, as src/empower-effects.js reads it).
    const uptime = Number.isFinite(item.uptime) && item.uptime < 1 ? item.uptime : 1;
    const times = (item.perStack && Number.isFinite(item.stacks) ? item.stacks : 1) * (Number.isFinite(item.share) && item.share < 1 ? item.share : uptime);
    for (const write of item.writes) {
      if (write.value === null || write.trigger || write.gates) continue;
      pool.add({ unit: "player", attr: write.attr, mod: write.mod, value: write.value * times, upper: Number.isFinite(write.upper) ? write.upper * times : null, tags: write.tags?.length > 1 ? write.tags : write.tags?.[0] ?? null, layer: "record", source: { kind: "buff", buff: item.buff, name: item.name, stage: item.stage, affix: write.affix } });
    }
  }
  // The stat sheet's totals.
  for (const [key, attr] of Object.entries(STAT_ATTRS)) if (Number.isFinite(stats?.[key])) pool.add({ unit: "player", attr, mod: 1, value: stats[key], layer: "stat", source: { kind: "stat", key } });
  // The combat increased Movement Speed as Movement Speed's whole increased part (attr 4; a record's 41 is its encoded derived read): a
  // conversion reading it (fromMod 3; Haze's "+1% additional Damage per +5% Movement Speed", record 647724864) sees the held conditional
  // Movement Speed lines too, as the line's text reading does (2026-11-11).
  if (Number.isFinite(movementSpeedPercent)) pool.add({ unit: "player", attr: 4, mod: 3, value: movementSpeedPercent, layer: "stat", source: { kind: "stat", key: "movementSpeedPercent" } });
  pool.convertedLines = convertedLines;
  // The planner's build pool is sealed (slice 5a: every per-call write goes to a child); the census and the panel tool build theirs unsealed.
  if (seal) pool.seal();
  return pool;
}

/** The lines a traced pool reads through their conversion record (so their legacy reading is dropped): a Set of line keys. */
export function tracedConversionLines(pool) {
  if (!pool || pool.conversionMode !== "traced") return new Set();
  for (let at = pool; at; at = at.parent) if (at.convertedLines) return new Set(at.convertedLines.keys());
  return new Set();
}
