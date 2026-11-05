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
const SYNTHETIC = new Set(["derived", "follower", "buff"]);
const UNIT_OF = { self: "player", enemy: "dummy", minion: "minion" };
export const GALE_LINE = /^\d+(?:\.\d+)?% of the Projectile Speed bonus is also applied to (?:the additional bonus for )?Projectile Damage$/i;
// Stat-sheet totals as the attribute ids conversions read (fromMod 5 / 1 on the whole attribute).
const STAT_ATTRS = Object.freeze({ strength: 1, dexterity: 2, intelligence: 3, maxLife: 1001, maxMana: 1301, maxEnergyShield: 1601, evasion: 4002 });
// Text readings of planner-made lines, for the sources the hit path's conversions read (Projectile Speed: the Gale converters).
const TEXT_WRITES = Object.freeze([
  { pattern: /^([+-]?\d+(?:\.\d+)?)% Projectile Speed$/i, attr: 6005, mod: 3 },
  { pattern: /^([+-]?\d+(?:\.\d+)?)% additional Projectile Speed$/i, attr: 6005, mod: 4 }
]);

// One line's recipe reading, once per line object and text.
const resolvedCache = new Map();
function resolveLine(line) {
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
function encodedKey(id) {
  const { base, layer } = baseId(id, { encoded: true });
  if (layer === "derivedField") return `field:${base}`;
  if (layer === "derivedLabel") return `label:${base}`;
  return base;
}
const staticWrite = (effect) => effect.kind === "attr" && effect.understood !== false && Number.isFinite(effect.value) && !effect.dynamic?.some((item) => item !== "scale")
  && effect.node !== "b" && (!effect.triggerId || effect.triggerId === 1000031) && !effect.tagAlt?.length
  // Conditions: only the tag-borne states (no gate node: they are the requirement's own tags) and the per-hit trigger.
  && (effect.conditions || []).every((condition) => condition.kind === "perHit" || (condition.kind === "state" && condition.node === undefined));

/**
 * The build pool. `modifierTexts`: the planner's lines; `playerBuffs`: your unit buff set (src/unit-buff-set.js); `stats`: the stat
 * sheet's totals (src/planner.js lineConditionState.stats); `conversions`: the pool's conversion mode.
 */
export function buildAttributePool({ modifierTexts = [], playerBuffs = null, stats = null, conversions = "legacy" } = {}) {
  const pool = new AttributePool({ conversions });
  const derivedFrom = new Set(modifierTexts.filter((line) => line?.derivedFrom).map((line) => lineKeyOf(line.source, line.derivedFrom)));
  const convertedLines = new Map();
  modifierTexts.forEach((line, lineIndex) => {
    if (!line) return;
    const lineKey = lineKeyOf(line.source, line.text);
    const scale = Number(line.multiplier ?? 1) || 1;
    // A planner-made line (a settled condition, a buff the planner models, the follower's) has no game record: its text reading, for the
    // few stats a conversion here reads (TEXT_WRITES).
    if (line.lineEffect || SYNTHETIC.has(line.origin)) {
      for (const rule of TEXT_WRITES) {
        const match = squash(line.text).match(rule.pattern);
        if (match) pool.add({ unit: "player", attr: rule.attr, mod: rule.mod, value: Number(match[1]) * scale, requirement: null, layer: "record", source: { kind: "text", origin: line.origin ?? null, line: line.text, lineSource: line.source, lineKey } });
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
        pool.add({ unit: UNIT_OF[effect.target ?? "self"], attr, mod: effect.mod, value: effect.value * scale, upper: Number.isFinite(effect.upper) ? effect.upper * scale : null, tags: effect.tagIds ?? null, layer: "record", source, group: `line${lineIndex}#${effect.row}#${index}` });
        return;
      }
      if ((effect.kind === "convert" || effect.kind === "share") && effect.understood !== false && Number.isFinite(effect.value)) {
        const droppable = GALE_LINE.test(squash(line.text)) ? "galeConverter" : derivedFrom.has(lineKey) ? "derivedLine" : null;
        const heldBy = line.origin === "trait" ? "the hero trait module" : droppable ? null : "the line's current reader (no derived line, not the hit model's converter)";
        const to = encodedKey(effect.attr), from = encodedKey(effect.from);
        const toMod = MOD_NUMBER[effect.bucket] ?? null, fromMod = MOD_NUMBER[effect.fromBucket] ?? 5;
        const record = pool.addConversion({
          unit: effect.kind === "share" ? "minion" : "player", sourceUnit: "player", to, toMod, toTags: effect.toTagIds ?? null, from, fromMod,
          fromValue: effect.per ?? 1, toLower: effect.value * scale, max: Number.isFinite(effect.max) ? effect.max * scale : null,
          source, heldBy: droppable && line.origin !== "trait" ? null : heldBy, droppable, lineKey,
          entry: { source: line.source, text: `${line.text} (node 114, read at this hit: ${effect.fromConcept ?? from} ${effect.fromBucket ?? ""} ÷ ${effect.per ?? 1} × ${effect.value * scale}; game affix ${resolved.chosen.id ?? "?"})`, origin: line.origin ?? null, category: toMod === 4 ? "Additional damage" : "Increased damage", conversion: true }
        });
        if (!record.heldBy) convertedLines.set(lineKey, record);
      }
    });
  });
  // Your held buffs' record writes.
  for (const item of heldBuffWrites(playerBuffs)) {
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
  pool.convertedLines = convertedLines;
  return pool;
}

/** The lines a traced pool reads through their conversion record (so their legacy reading is dropped): a Set of line keys. */
export function tracedConversionLines(pool) {
  if (!pool || pool.conversionMode !== "traced") return new Set();
  for (let at = pool; at; at = at.parent) if (at.convertedLines) return new Set(at.convertedLines.keys());
  return new Set();
}
