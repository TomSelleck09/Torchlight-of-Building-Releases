// The hit side's aggregate ledgers from the game recipes (recipe interpreter step 3, research/recipe-interpreter-step1-2026-10-25.md §15).
// The Scorching Beam hit ledger, the spell crit model and the cast-rate ledger read per-source totals ("Talents: Damage", "Gear:
// Elemental Damage", talent / slate / gear / pact crit and speed keys …) next to per-line entries and model entries. As the Ignite patch
// does (src/recipe-ignite-layers.js), each total is split into the lines it holds (the parsers the totals are built from, one line at a
// time); a line the recipe places takes the recipe's value (src/recipe-hit-layers.js recipeHitFacts), a line it cannot place keeps its
// text reading, and what a total holds beyond its listed lines stays as a remainder. Model entries are untouched.
import { normalizePercentageText } from "./percentage-text.js";
import { collectNormalizedGearModifiers, aggregateSlateEffects } from "./engine.js";
import { parseTalentEffects } from "./candidate-sources.js";
import { parseKismetEffect } from "./kismet-effects.js";
import { nativePactspiritNodeEffect, pactDestinyValue } from "./pactspirit-levels.js";
import { modeledCoreTalents } from "./core-talent-model.js";
import { isDamageToLifeEntry } from "./damage-to-life.js";
import { hitRecipeReader, factReaches, critFromFacts, speedFromFacts, settledConditionOf } from "./recipe-hit-layers.js";

const squash = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const round4 = (value) => Math.round(value * 10000) / 10000;

// ---- Per-line readers of the totals (the parsers the totals come from) ----
export const gearStat = (stat, type) => (line) => line.origin === "gear" ? collectNormalizedGearModifiers([{ name: line.source, slot: "probe", modifiers: [squash(line.text)] }]).filter((item) => item.stat === stat && item.type === type).reduce((sum, item) => sum + item.value, 0) : 0;
export const talentKey = (key) => (line) => line.origin === "talent" ? (Number(parseTalentEffects(squash(line.text)).effects[key]) || 0) * (line.multiplier ?? 1) : 0;
export const slateKey = (key) => (line) => line.origin === "slate" ? Number(aggregateSlateEffects({ slates: [{ id: "probe", fixed: [squash(line.text)] }] })[key]) || 0 : 0;
export const pactStat = (stat) => (line) => {
  if (line.origin === "kismet") { const parsed = parseKismetEffect(squash(line.text)); return parsed?.stat === stat ? parsed.value : 0; }
  if (line.origin === "pact" && line.pactDestiny) return pactDestinyValue(line, stat);
  if (line.origin === "pact" && / node$/.test(String(line.source))) { const parsed = nativePactspiritNodeEffect({ effect: squash(line.text) }); return parsed?.stat === stat ? parsed.value : 0; }
  return 0;
};
const pactLevel = (pattern) => (line) => line.origin === "pact" && !/ node$/.test(String(line.source)) ? Number(squash(line.text).match(pattern)?.[1]) || 0 : 0;
const sumReaders = (...readers) => (line) => readers.reduce((total, read) => total + read(line), 0);
const readCache = new Map();
const cachedRead = (label, read, line) => {
  const key = `${label}|${line.origin}|${line.source}|${line.text}|${line.multiplier ?? 1}`;
  if (!readCache.has(key)) { if (readCache.size > 50000) readCache.clear(); readCache.set(key, read(line)); }
  return readCache.get(key);
};

const coreName = (line) => String(line.source || "").match(/core: (.+)$/)?.[1] ?? line.grantedCore ?? null;
// Lines a model owns: the core-talent model's cores (their ledger entries carry the core's name, not the line).
const modelOwned = (line) => line.origin === "core" && modeledCoreTalents.includes(coreName(line)) ? `core talent model (${coreName(line)})` : null;

// ---------------------------------------------------------------------------------------------------------------------------
// Scorching Beam hit ledger (src/scorching-beam-hit.js). Totals and their per-line readers; `split`: a multiplicative bucket, so each line
// is its own factor (every additional / Max write multiplies on its own: the panel formulas' E token, the planner's own rule).
const BEAM_AGGREGATES = Object.freeze({
  "Talents: Damage": { read: talentKey("damagePercent") },
  "Slates: Damage": { read: slateKey("damagePercent") },
  "Talents: Area Damage": { read: talentKey("areaDamagePercent") },
  "Slates: Area Damage": { read: slateKey("areaDamagePercent") },
  "Gear: Damage": { read: gearStat("damagePercent", "increased") },
  "Gear: Elemental Damage": { read: gearStat("elementalDamagePercent", "increased") },
  "Gear: additional Fire Damage": { read: gearStat("additionalFireDamagePercent", "more"), split: true },
  "Slates: additional Fire Damage": { read: slateKey("additionalFireDamagePercent"), split: true },
  "Slates: additional Max Damage": { read: slateKey("additionalMaxDamagePercent"), split: true },
  "Pacts: Damage": { read: pactStat("damagePercent") },
  "Pacts: Spell Damage": { read: pactStat("spellDamagePercent") },
  "Pacts: Elemental Damage": { read: pactStat("elementalDamagePercent") },
  "Pacts: Fire Damage": { read: pactStat("fireDamagePercent") },
  "Pacts: additional Damage": { read: sumReaders(pactLevel(/^\+([0-9.]+)% additional damage$/i), pactStat("outgoingAdditionalDamagePercent")), split: true }
});
// One entry per line without its text ("Slates: additional Fire Damage (+X% line)"): matched by value.
const BEAM_PER_LINE = Object.freeze({ "Slates: additional Fire Damage (+": slateKey("additionalFireDamagePercent") });

/**
 * The recipe's beam-hit entries of one line ({ bucket, percent, affixId, conditional }), or null when the text reading stays.
 * `damageTypes`: the part's type chain (the beam's Fire; an added-damage part's own type, with its origin when converted: batch 7
 * damage fixes 2026-10-28). A typed write reaches the part when it names any type of the chain (each line once).
 */
function beamEntriesOf(facts, line, beamTags, damageTypes = ["Fire"]) {
  if (facts.status === "fallback") return null;
  const scale = line.multiplier ?? 1;
  const out = [];
  for (const fact of facts.facts) {
    if (fact.local || !factReaches(fact, beamTags)) continue;
    const reaches = !fact.damageTypes || fact.damageTypes.some((type) => damageTypes.includes(type));
    if (!reaches) continue;
    if (fact.kind === "damage") out.push({ bucket: fact.layer, percent: fact.value * scale, affixId: fact.affixId, conditional: fact.conditional, conditions: fact.conditions });
    else if (fact.kind === "maxDamage" || fact.kind === "minDamage") out.push({ bucket: fact.kind === "maxDamage" ? "max" : "min", percent: fact.value * scale, affixId: fact.affixId, conditional: fact.conditional, conditions: fact.conditions });
    // Enemy damage taken reaches the beam's hits as its own additional factor (the ledger's rule for the derived debuff lines).
    else if (fact.kind === "taken") { if (fact.layer !== "additional") return null; out.push({ bucket: "additional", percent: fact.value * scale, affixId: fact.affixId, conditional: fact.conditional, conditions: fact.conditions, taken: true }); }
  }
  return out;
}

// Recipe gates the planner's state settles for a line the text ledger never read (the same state the Ignite patch uses).
export function settledCondition(conditions = []) {
  return settledConditionOf(conditions);
}

/**
 * The beam hit ledger with every line-derived entry placed from the game recipes (see the header). Returns the new entries and the
 * diagnostics (per-line differences, residuals, added and left-out writes).
 * @param {object[]} ledger scorchingBeamHitModifiers' entries ({ source, bucket, percent, text? })
 * @param {{ modifierTexts: object[], beamTags: Set<string>, damageTypes?: string[] }} p `damageTypes` (default Fire): the hit part's type chain
 */
export function patchBeamHitLedger(ledger, { modifierTexts = [], beamTags = new Set(), state = {}, damageTypes = ["Fire"] } = {}) {
  // (Called only while the beam is on the board: an inactive beam's ledger reads none of the beam-gated lines.)
  const read = hitRecipeReader(modifierTexts);
  const items = modifierTexts.map((line, index) => {
    const facts = read(line);
    const owned = modelOwned(line);
    const entries = owned ? null : beamEntriesOf(facts, line, beamTags, damageTypes);
    return { index, line, facts, entries, use: entries ? "recipe" : "text", ...(owned ? { modelOwned: owned } : {}) };
  });
  const byText = new Map(), bySourceText = new Map();
  for (const item of items) {
    const text = squash(item.line.text);
    byText.set(text, [...(byText.get(text) || []), item]);
    const named = `${item.line.source}: ${text}`;
    bySourceText.set(named, [...(bySourceText.get(named) || []), item]);
  }
  const claimed = new Set(), matched = new Set(), emitted = new Set();
  const lineFor = (entry) => {
    const source = String(entry.source || "");
    if (!(entry.lineText ?? entry.text ?? entry.matchText)) {
      const match = (bySourceText.get(squash(source)) || []).find((item) => !claimed.has(item.index));
      if (match) claimed.add(match.index);
      return match || null;
    }
    const candidates = byText.get(squash(entry.lineText ?? entry.text ?? entry.matchText)) || [];
    const match = candidates.find((item) => !claimed.has(item.index) && (source === item.line.source || source.startsWith(`${item.line.source}: `) || source.startsWith(`${item.line.source} `) || source.includes(item.line.source)))
      ?? candidates.find((item) => !claimed.has(item.index) && candidates.length === 1);
    if (match) claimed.add(match.index);
    return match || null;
  };
  const out = [], deferred = [], differences = [], residuals = [];
  // A recipe entry keeps the text fields its text-path entry had (`text`, `lineText` or only `matchText`), so the readers that place an entry
  // by its text (the panel compare, the badges) see it as before.
  const recipeEntry = (item, entry, template = null) => ({ source: template?.source && !BEAM_AGGREGATES[template.source] ? template.source : item.line.source, bucket: entry.bucket, percent: entry.percent, ...(template && !template.text && !template.lineText ? { matchText: item.line.text } : { text: item.line.text }), ...(template?.lineText ? { lineText: template.lineText } : {}), recipe: { affixId: entry.affixId, ...(entry.conditions?.length ? { conditions: entry.conditions } : {}) } });
  // A line's recipe entries, once: those in `bucket` go to `into`, the others to the end of the ledger.
  const emit = (item, bucket, into, template) => {
    if (emitted.has(item.index)) return [];
    emitted.add(item.index);
    const placed = [];
    for (const entry of item.entries) {
      const fresh = recipeEntry(item, entry, template);
      if (entry.bucket === bucket) { into.push(fresh); placed.push(fresh); } else deferred.push(fresh);
    }
    return placed;
  };
  // What the text path made of each line (bucket, percent), compared with the recipe's entries at the end.
  const textOf = new Map();
  const note = (item, bucket, percent) => { if (!textOf.has(item.index)) textOf.set(item.index, []); textOf.get(item.index).push({ bucket, percent }); };
  for (const entry of ledger) {
    if (isDamageToLifeEntry(entry)) { out.push(entry); continue; }
    const aggregate = !entry.text && !entry.lineText && !entry.matchText ? BEAM_AGGREGATES[entry.source] : null;
    if (aggregate) {
      const parts = [];
      let attributed = 0;
      for (const item of items) {
        if (item.line.lineEffect) continue;
        const value = cachedRead(entry.source, aggregate.read, item.line);
        if (!value) continue;
        attributed += value;
        matched.add(item.index);
        if (item.use !== "recipe") { parts.push({ source: item.line.source, text: item.line.text, percent: value }); continue; }
        note(item, entry.bucket, value);
        emit(item, entry.bucket, parts, null);
      }
      const remainder = (entry.percent || 0) - attributed;
      if (Math.abs(remainder) > 1e-6) residuals.push({ source: entry.source, total: entry.percent, attributed, remainder });
      if (aggregate.split) {
        // Each line its own factor (one game write each); the remainder keeps the total's label. A single line with no remainder keeps the
        // total's label (the text path's own entry).
        if (parts.length === 1 && Math.abs(remainder) <= 1e-6) { out.push({ ...entry, percent: parts[0].percent, matchText: parts[0].text, ...(parts[0].recipe ? { recipe: parts[0].recipe } : {}) }); continue; }
        for (const part of parts) out.push({ ...part, source: `${entry.source} (${part.source})`, bucket: entry.bucket });
        if (Math.abs(remainder) > 1e-6) out.push({ ...entry, percent: remainder, source: `${entry.source} (not from a listed line)` });
      } else {
        const percent = parts.reduce((sum, part) => sum + part.percent, 0) + remainder;
        if (percent || parts.length) out.push({ ...entry, percent, parts: parts.map((part) => ({ source: part.source, text: part.text, percent: part.percent, ...(part.recipe ? { recipe: part.recipe } : {}) })), ...(Math.abs(remainder) > 1e-6 ? { remainder } : {}) });
      }
      continue;
    }
    const perLine = !entry.text && !entry.lineText && !entry.matchText ? Object.entries(BEAM_PER_LINE).find(([prefix]) => String(entry.source).startsWith(prefix))?.[1] : null;
    if (perLine) {
      const item = items.find((candidate) => !claimed.has(candidate.index) && !candidate.line.lineEffect && Math.abs(cachedRead("perLine", perLine, candidate.line) - (entry.percent || 0)) < 1e-6);
      if (!item) { out.push(entry); continue; }
      claimed.add(item.index); matched.add(item.index);
      if (item.use !== "recipe") { out.push(entry); continue; }
      note(item, entry.bucket, entry.percent);
      emit(item, entry.bucket, out, entry);
      continue;
    }
    const item = lineFor(entry);
    if (!item) { out.push(entry); continue; }
    matched.add(item.index);
    if (item.use !== "recipe") { out.push(entry); continue; }
    note(item, entry.bucket, entry.percent);
    emit(item, entry.bucket, out, entry);
  }
  out.push(...deferred);
  // Recipe writes on lines the text path never put in this ledger: unconditional ones are added, conditional ones left out (the
  // planner's condition state never counted them; the rule of §9).
  const added = [], leftOut = [];
  for (const item of items) {
    if (matched.has(item.index) || item.use !== "recipe" || !item.entries.length) continue;
    for (const entry of item.entries) {
      // A gate the planner's own state settles, as the Ignite patch and the Trauma / Wilt layers settle it (src/recipe-ignite-layers.js
      // settledCondition): target Cursed (combat), both Sealed Mana and Life.
      const settled = entry.conditional ? settledCondition(entry.conditions) : null;
      if (settled && state[settled.need]) {
        out.push({ ...recipeEntry(item, entry), condition: settled.label });
        added.push({ source: item.line.source, text: item.line.text, bucket: entry.bucket, percent: entry.percent, affixId: entry.affixId, need: settled.need });
        continue;
      }
      if (entry.conditional) { leftOut.push({ source: item.line.source, text: item.line.text, bucket: entry.bucket, percent: entry.percent, conditions: entry.conditions }); continue; }
      out.push(recipeEntry(item, entry));
      added.push({ source: item.line.source, text: item.line.text, bucket: entry.bucket, percent: entry.percent, affixId: entry.affixId });
    }
  }
  const key = (list) => JSON.stringify(list.map((entry) => [entry.bucket, round4(entry.percent)]).sort());
  for (const [index, text] of textOf) {
    const item = items[index];
    if (key(text) !== key(item.entries)) differences.push({ source: item.line.source, text: item.line.text, affixId: item.facts.affixId ?? null, textReading: text, recipeReading: item.entries.map((entry) => ({ bucket: entry.bucket, percent: entry.percent })) });
  }
  return { ledger: out, differences, residuals, added, leftOut };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Spell crit (src/scorching-beam-critical.js). The totals it reads (gear / talent / slate / pact / hero memory keys) and its own line
// readers (critLineReading), one line at a time; the recipe's crit writes that reach the skill (4802 / 4803 by skill tag). The model is
// the crit of Spell hits: an Attack skill takes its rating from the weapon model and drops the Spell-only crit damage (src/planner.js), so
// the reach is the skill's tags without Attack, plus Spell.
const CRIT_TOTALS = Object.freeze({
  flat: [gearStat("spellCriticalStrikeRating", "flat"), talentKey("spellCriticalStrikeRating"), slateKey("spellCriticalStrikeRating"), pactStat("spellCriticalStrikeRating")],
  increased: [gearStat("spellCriticalStrikeRatingPercent", "increased"), talentKey("criticalStrikeRatingPercent"), talentKey("spellCriticalStrikeRatingPercent"), slateKey("criticalStrikeRatingPercent"), slateKey("spellCriticalStrikeRatingPercent"), pactStat("criticalStrikeRatingPercent"), pactStat("spellCriticalStrikeRatingPercent")],
  damage: [gearStat("criticalStrikeDamagePercent", "increased"), talentKey("criticalStrikeDamagePercent"), slateKey("criticalStrikeDamagePercent"), pactStat("criticalStrikeDamagePercent")],
  spellDamage: [talentKey("spellCriticalStrikeDamagePercent"), slateKey("spellCriticalStrikeDamagePercent")]
});
// Hero memory totals the crit model reads through the memory-merged equipment (src/planner.js memoryEquipment).
const MEMORY_CRIT = Object.freeze({ "spellCriticalStrikeRating:flat": "flat", "spellCriticalStrikeRatingPercent:increased": "increased", "criticalStrikeDamagePercent:increased": "damage" });
const memoryIndexOf = (heroMemories) => {
  const index = new Map();
  for (const line of heroMemories?.lines || []) { const key = `${line.source}|${squash(line.text)}`; index.set(key, [...(index.get(key) || []), line]); }
  return index;
};
const memoryValues = (index, line, table) => {
  const out = {};
  if (line.origin !== "memory") return out;
  for (const item of index.get(`${line.source}|${squash(line.text)}`) || []) { const bucket = table[`${item.stat}:${item.type}`]; if (bucket) out[bucket] = (out[bucket] || 0) + (Number(item.value) || 0); }
  return out;
};
const sumOf = (readers, line, label) => readers.reduce((total, read, i) => total + cachedRead(`${label}#${i}`, read, line), 0);

/** What the text side of the spell crit model takes from one line ({ flat, increased, additional: [], damage, spellOnlyDamage }). */
export function textCritOfLine(line, main, memoryIndex = new Map(), critLineReading = null) {
  const own = critLineReading ? critLineReading(line, main) : { flat: 0, increased: 0, additional: [], damage: 0, spellOnlyDamage: 0 };
  const memory = memoryValues(memoryIndex, line, MEMORY_CRIT);
  const spellDamage = sumOf(CRIT_TOTALS.spellDamage, line, "critSpellDamage");
  return {
    flat: sumOf(CRIT_TOTALS.flat, line, "critFlat") + (memory.flat || 0) + own.flat,
    increased: sumOf(CRIT_TOTALS.increased, line, "critIncreased") + (memory.increased || 0) + own.increased,
    additional: own.additional,
    damage: sumOf(CRIT_TOTALS.damage, line, "critDamage") + spellDamage + (memory.damage || 0) + own.damage,
    spellOnlyDamage: spellDamage + own.spellOnlyDamage
  };
}
const critKey = (reading) => JSON.stringify([round4(reading.flat), round4(reading.increased), reading.additional.map(round4).sort(), round4(reading.damage), round4(reading.spellOnlyDamage)]);
// Lines the model reads in combat only (recent strikes, against ailing enemies, per Fire Resistance): they keep their readers.
const CRIT_COMBAT_ONLY = /Critical Strike Damage per recent|Critical Strike Damage against enemies affected by Ailments|^For every 1% Fire Resistance, \+[\d.]+% Critical Strike Damage/i;

/**
 * The recipe adjustment of the spell crit model for one skill: Σ over the lines the recipe places of (recipe − text), and the per-line
 * differences. `critLineReading` is src/scorching-beam-critical.js's per-line reader (passed in: that module does not import this one).
 * @returns {(main: object, lines?: object[]) => { flat, increased, additionalFactor, damage, spellOnlyDamage, sources: object[], differences: object[] }}
 *   `lines`: the lines the caller's model reads (a skill's own list); the planner's list by default.
 */
export function critRecipeAdjuster({ modifierTexts = [], heroMemories = null, critLineReading = null } = {}) {
  const memoryIndex = memoryIndexOf(heroMemories);
  const memo = new WeakMap();
  return (main, lines = modifierTexts) => {
    const tags = new Set([...(main?.tags || []).filter((tag) => tag !== "Attack"), "Spell"]);
    // Crit damage of an Attack skill takes its Attack-scoped writes too ("+X% Attack Critical Strike Damage"; batch 1 2026-10-27);
    // the rating stays on the Spell-model tags (the Attack rating is the weapon model's).
    const damageTags = (main?.tags || []).includes("Attack") ? new Set([...tags, "Attack"]) : tags;
    const key = [...damageTags].sort().join("|") + (damageTags === tags ? "" : "|#attack");
    if (!memo.has(lines)) memo.set(lines, new Map());
    const cache = memo.get(lines);
    if (cache.has(key)) return cache.get(key);
    const modifierTexts = lines;
    const read = hitRecipeReader(modifierTexts);
    const result = { flat: 0, increased: 0, additionalFactor: 1, damage: 0, spellOnlyDamage: 0, sources: [], differences: [] };
    for (const line of modifierTexts) {
      if (CRIT_COMBAT_ONLY.test(squash(line.text))) continue;
      const facts = read(line);
      if (facts.status === "fallback") continue;
      const text = textCritOfLine(line, main, memoryIndex, critLineReading);
      const counted = text.flat || text.increased || text.additional.length || text.damage;
      const ratingRecipe = critFromFacts(facts, tags, { textCounted: Boolean(counted) });
      if (!ratingRecipe) continue;
      const damageRecipe = damageTags === tags ? ratingRecipe : critFromFacts(facts, damageTags, { textCounted: Boolean(counted) });
      const recipe = { ...ratingRecipe, damage: damageRecipe.damage, spellOnlyDamage: damageRecipe.spellOnlyDamage };
      const scale = line.multiplier ?? 1;
      const scaled = { flat: recipe.flat * scale, increased: recipe.increased * scale, additional: recipe.additional.map((value) => value * scale), damage: recipe.damage * scale, spellOnlyDamage: recipe.spellOnlyDamage * scale };
      if (critKey(scaled) === critKey(text)) continue;
      const delta = { flat: scaled.flat - text.flat, increased: scaled.increased - text.increased, damage: scaled.damage - text.damage, spellOnlyDamage: scaled.spellOnlyDamage - text.spellOnlyDamage };
      result.flat += delta.flat; result.increased += delta.increased; result.damage += delta.damage; result.spellOnlyDamage += delta.spellOnlyDamage;
      result.additionalFactor *= scaled.additional.reduce((factor, value) => factor * Math.max(0, 1 + value / 100), 1) / Math.max(1e-12, text.additional.reduce((factor, value) => factor * Math.max(0, 1 + value / 100), 1));
      result.differences.push({ source: line.source, text: line.text, affixId: facts.affixId ?? null, textReading: text, recipeReading: scaled });
      // One entry per line (its Spell-only part apart, which an attack path removes).
      const label = `${line.text} (game recipe ${facts.affixId ?? "?"}: ${round4(scaled.damage)}% Critical Strike Damage; text reading ${round4(text.damage)}%)`;
      if (Math.abs(delta.damage - delta.spellOnlyDamage) > 1e-9) result.sources.push({ source: line.source, text: label, value: delta.damage - delta.spellOnlyDamage, recipe: { affixId: facts.affixId ?? null } });
      if (Math.abs(delta.spellOnlyDamage) > 1e-9) result.sources.push({ source: line.source, text: label, value: delta.spellOnlyDamage, spellOnly: true, recipe: { affixId: facts.affixId ?? null } });
    }
    cache.set(key, result);
    return result;
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Cast speed (src/scorching-beam-cast-rate.js): the talent / slate / pact speed keys, the memory-merged gear keys and the gear
// additional key, one line at a time; the recipe's Cast Speed writes (6002) that reach the skill.
const SPEED_TOTALS = Object.freeze({
  increased: [talentKey("attackAndCastSpeedPercent"), talentKey("castSpeedPercent"), slateKey("attackAndCastSpeedPercent"), slateKey("castSpeedPercent"), gearStat("castSpeedPercent", "increased"), pactStat("attackAndCastSpeedPercent"), pactStat("castSpeedPercent")],
  channeled: [talentKey("channeledAttackAndCastSpeedPercent"), slateKey("channeledAttackAndCastSpeedPercent")],
  additional: [gearStat("castSpeedPercent", "more")]
});
const MEMORY_SPEED = Object.freeze({ "castSpeedPercent:increased": "increased", "castSpeedPercent:more": "additional" });

/** What the text side of the cast-rate ledger takes from one line ({ increased, additional: [] }). */
export function textSpeedOfLine(line, { channeledCounted = false, memoryIndex = new Map() } = {}) {
  const memory = memoryValues(memoryIndex, line, MEMORY_SPEED);
  const additional = sumOf(SPEED_TOTALS.additional, line, "speedAdditional") + (memory.additional || 0);
  return {
    increased: sumOf(SPEED_TOTALS.increased, line, "speedIncreased") + (channeledCounted ? sumOf(SPEED_TOTALS.channeled, line, "speedChanneled") : 0) + (memory.increased || 0),
    additional: additional ? [additional] : []
  };
}

/**
 * The recipe adjustment of the cast-rate ledger for one skill: Σ over the lines the recipe places of (recipe − text) increased Cast Speed,
 * and every line's additional Cast Speed as its own factor (each mod-4 write multiplies; the text ledger summed the gear lines into one
 * term with Quick Decision). `textAdditional` is what the text ledger's gear additional term held from the lines.
 * @returns {(main: object, options: { channeledCounted: boolean }) => { increased, additional: object[], textAdditional, differences }}
 */
export function speedRecipeAdjuster({ modifierTexts = [], heroMemories = null } = {}) {
  const read = hitRecipeReader(modifierTexts);
  const memoryIndex = memoryIndexOf(heroMemories);
  const memo = new Map();
  return (main, { channeledCounted = false } = {}) => {
    const tags = new Set(main?.tags || []);
    const key = `${[...tags].sort().join("|")}|${channeledCounted}`;
    if (memo.has(key)) return memo.get(key);
    const result = { increased: 0, additional: [], textAdditional: 0, differences: [] };
    for (const line of modifierTexts) {
      const facts = read(line);
      const text = textSpeedOfLine(line, { channeledCounted, memoryIndex });
      const textAdditional = text.additional.reduce((sum, value) => sum + value, 0);
      result.textAdditional += textAdditional;
      if (facts.status === "fallback") { if (textAdditional) result.additional.push({ source: line.source, text: line.text, value: textAdditional }); continue; }
      const recipe = speedFromFacts(facts, tags, "castSpeed", { textCounted: Boolean(text.increased || textAdditional) });
      const scale = line.multiplier ?? 1;
      const recipeIncreased = recipe.increased * scale, recipeAdditional = recipe.additional.map((value) => value * scale);
      result.increased += recipeIncreased - text.increased;
      for (const value of recipeAdditional) result.additional.push({ source: line.source, text: line.text, value, recipe: { affixId: facts.affixId ?? null } });
      if (Math.abs(recipeIncreased - text.increased) > 1e-9 || JSON.stringify(recipeAdditional.map(round4).sort()) !== JSON.stringify(text.additional.map(round4).sort())) result.differences.push({ source: line.source, text: line.text, affixId: facts.affixId ?? null, textReading: text, recipeReading: { increased: recipeIncreased, additional: recipeAdditional } });
    }
    memo.set(key, result);
    return result;
  };
}

export { round4 };
