// The generic skill hit path's reads from the tagged attribute pool (W9 step 3, 2026-11-04; src/attribute-pool.js;
// research/unified-state-design-2026-11-03.md §4 part (b), §7 step 2). Default "pool" since W9 step 4 (2026-11-04); TLI_POOL_HIT=ledger
// (environment), globalThis.TLI_POOL_HIT = "ledger" (a browser console) or setHitPoolMode("ledger") (scripts, tests) runs the hit model's
// own lists, as before.
//
// What goes in (src/skill-hit-model.js calculateSkillHit, one pool per call):
//   - every modifier line's hit reading (the recipe's, src/recipe-hit-layers.js hitLineFromFacts, or the text reader's,
//     src/skill-hit-lines.js classifyHitLine: the same pick as before, pickHitReading) as writes: increased / additional damage on the
//     damage attributes of its types (5719 all, 5727 Elemental, 5002 / 5107 / 5108 / 5109 / 5402), Max / Min Damage (5806 / 5812 …),
//     enemy damage taken on the dummy (5720 / 5120 …), penetration (5104 / 5105 / 5106 / 5414), Armor DMG Mitigation Penetration (field
//     2006247), added damage (mod 2 on the type's attribute), Cooldown Recovery Speed (6007); the line's skill tags and its Hit flow are
//     the tag requirement; a line's per-type writes are one group (a part counted as two types takes it once);
//   - the setup's supports: increased / additional damage, Max Damage, Cooldown Recovery Speed, penetration, crit-only additional
//     damage, crit rating (source "support");
//   - the planner's typed taken lines (Scorch, Sing with the Tide) and the skill's own hit debuffs, on the dummy;
//   - the crit-only lines (src/crit-only-lines.js, their tag as the requirement plus the crit tag 5001010).
// What is read: each part's increased, additional, taken, Max / Min, penetration by the part's query (the skill's tags with its support
// tag changes, Hit 5000003, the setup's id; the part's types as attributes), the skill's Armor penetration, added damage, Cooldown
// Recovery Speed, crit-only and typed crit-only lines. The model's own entries (channel, weapon, Aura, level, main stat, Double Damage,
// restriction, Trinity …) keep their places after the pool's: sums continue from the pool's sum in the same order, so every figure is
// the same to the last digit.
//
// No legacy branch is left (W9 step 4, by the records): a support line written "for the supported skill" with no scope reaches every
// part; added damage reaches by its writes' tags (untagged, Spell, Attack; one record per tag) read with the skill's own tags; a converted
// or gained part reads every type in its chain (src/skill-hit-model.js). Not read from the pool yet: the spell crit totals and Cast Speed (the planner's aggregates, shared with the
// Scorching Beam ledger: src/scorching-beam-critical.js, src/scorching-beam-cast-rate.js), the weapon model's Attack Speed and crit.
import { AttributePool, POOL_TAG, makeQuery, normalizeRequirement } from "./attribute-pool.js";
import { SKILL_TAG_IDS } from "./recipe-hit-layers.js";
import { normalizePercentageText } from "./percentage-text.js";

const squashText = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------------------------------------------------------
// Modes.
const overrides = { hit: null, conversions: null };
const flagOf = (name, override) => override ?? globalThis[name] ?? globalThis.process?.env?.[name] ?? null;
/** "pool" (default since W9 step 4): the generic skill hit path reads the attribute pool; "ledger": the hit model's own lists. */
export const hitPoolMode = () => (flagOf("TLI_POOL_HIT", overrides.hit) === "ledger" ? "ledger" : "pool");
export const setHitPoolMode = (mode) => { overrides.hit = mode === "pool" || mode === "ledger" ? mode : null; };
/**
 * "traced" (default since W9 step 4): conversion records are evaluated at every read with the reader's query (node 114, no rounding:
 * research/node-114-trace-2026-11-03.md §2); "legacy" (TLI_POOL_CONVERSIONS=legacy): the derived lines' readings stand (rounded to 4
 * decimals by src/line-effects.js).
 */
export const poolConversionMode = () => (flagOf("TLI_POOL_CONVERSIONS", overrides.conversions) === "legacy" ? "legacy" : "traced");
export const setPoolConversionMode = (mode) => { overrides.conversions = mode === "traced" || mode === "legacy" ? mode : null; };
// W9 step 4 settled the legacy branches by their game records and removed them (and the TLI_POOL_LEGACY_OFF switch): a support line
// written "for the supported skill" with no scope reaches every part (noScopeNeverApplies); added damage reaches by its writes' tags read
// with the skill's own tags (spellModelAdded, toAttacksIgnored); a converted or gained part reads every type in its chain
// (convertedBothTypes: the SS14 conversion pass, 0x141fc3a80, gives the new record the target's start masks OR the source record's).

// ---------------------------------------------------------------------------------------------------------------------------
// Attribute keys. Game ids where the tables name one (src/recipe-interpreter.js ATTRIBUTE_CONCEPTS); a planner key otherwise.
const ELEMENTAL = ["Fire", "Cold", "Lightning"];
export const HIT_ATTRS = Object.freeze({
  damage: Object.freeze({ name: "damage", all: 5719, Elemental: 5727, Physical: 5002, Fire: 5107, Lightning: 5108, Cold: 5109, Erosion: 5402 }),
  max: Object.freeze({ name: "maxDamage", all: 5806, Physical: 5801, Lightning: 5802 }),
  min: Object.freeze({ name: "minDamage", all: 5812, Physical: 5807 }),
  taken: Object.freeze({ name: "damageTaken", all: 5720, Elemental: 5123, Physical: 5003, Fire: 5120, Cold: 5121, Lightning: 5122, Erosion: 5408 }),
  penetration: Object.freeze({ name: "penetration", Fire: 5104, Lightning: 5105, Cold: 5106, Erosion: 5414 })
});
export const ARMOUR_PENETRATION = 2006247, COOLDOWN_RECOVERY = 6007, ATTACK_SPEED = 6001, CAST_SPEED = 6002, CRIT_RATING = 4802, PROJECTILE_SPEED = 6005, MULTISTRIKE_SPEED = 6351;
const attrOf = (table, type) => table[type] ?? `${table.name}:${type}`;
const typeList = (types) => (types == null ? null : [...types]);
/** The attributes a reading's damage types write: all (no types), Elemental (exactly the three elements), else one per type. */
export function writeAttrs(table, damageTypes) {
  const list = typeList(damageTypes);
  if (list === null) return [table.all ?? `${table.name}:all`];
  if (table.Elemental && list.length === 3 && ELEMENTAL.every((type) => list.includes(type))) return [table.Elemental];
  return list.map((type) => attrOf(table, type));
}
/** The attributes a part of these types reads: all, each type's, Elemental when one of them is elemental. */
export function readAttrs(table, types) {
  const out = [];
  if (table.all) out.push(table.all);
  for (const type of types) out.push(attrOf(table, type));
  if (table.Elemental && types.some((type) => ELEMENTAL.includes(type))) out.push(table.Elemental);
  return [...new Set(out)];
}

/** A planner skill tag name as a pool tag: its game id (SKILL_TAG_IDS) or a planner key. */
export const tagKey = (name) => SKILL_TAG_IDS[name] ?? `tag:${name}`;
const WEAPON_ATTACK_FLAG = "flag:weaponAttack";
/** A hit reading's scope as a requirement: its skill tags all required (and Hit when hit-only); no scope reaches nothing (legacy). */
export function scopeRequirement(scope) {
  if (!scope) return false;
  const mine = [...(scope.skillTags || [])].map(tagKey);
  if (scope.hitOnly) mine.push(POOL_TAG.hit);
  return mine.length ? [{ mine }] : null;
}
const modOfLayer = (layer) => (layer === "increased" ? 3 : layer === "additional" ? 4 : `layer:${layer}`);
let groupCounter = 0;
const nextGroup = () => `g${++groupCounter}`;

// ---------------------------------------------------------------------------------------------------------------------------
/**
 * One generic skill hit's pool (src/skill-hit-model.js). `parent`: the build's record pool (conversion records, record-layer writes),
 * or null. `skillId`: the setup's key (the "this skill" tag of its own writes and of its queries).
 */
export class HitPool {
  constructor({ parent = null, skillId = null, scopeTags = new Set(), skillTags = new Set(), conversions = null } = {}) {
    this.pool = parent ? parent.extend(conversions ? { conversions } : {}) : new AttributePool({ conversions: conversions ?? poolConversionMode() });
    this.skillId = skillId;
    this.scopeTags = scopeTags;
    this.skillTags = skillTags;
    this.lineDamage = [];
    this.addedAttrs = new Set();
    this.queries = new Map();
  }

  /** The query of a hit: the skill's line-scope tags (skill tags, support tag changes, borrowed tags), Hit, the setup's id. */
  hitQuery() {
    if (!this.queries.has("hit")) this.queries.set("hit", makeQuery({ mine: [...[...this.scopeTags].map(tagKey), POOL_TAG.hit], skillId: this.skillId }));
    return this.queries.get("hit");
  }
  critQuery() {
    if (!this.queries.has("crit")) this.queries.set("crit", makeQuery({ mine: [...[...this.scopeTags].map(tagKey), POOL_TAG.hit, POOL_TAG.crit], skillId: this.skillId }));
    return this.queries.get("crit");
  }
  addedQuery(weaponAttack) {
    const key = `added|${weaponAttack}`;
    // The skill's own tags with its support changes, not the hit's line-scope tags: a borrowed tag ("Spell Damage bonus and additional
    // bonus also apply to the skill's Attack Damage", Moon Strike; label 3000114 adds the Spell tag for the scale stage only, Rosa chunk 1)
    // reaches the damage bonuses, not added flat damage (the base stage).
    const tags = this.skillTags;
    if (!this.queries.has(key)) this.queries.set(key, makeQuery({ mine: [...[...tags].map(tagKey), ...(weaponAttack ? [WEAPON_ATTACK_FLAG] : [])], skillId: this.skillId }));
    return this.queries.get(key);
  }

  #grouped(writes) {
    const group = writes.length > 1 ? nextGroup() : null;
    return writes.map((write) => this.pool.add({ ...write, group }));
  }
  #typed(table, damageTypes, base) {
    const attrs = writeAttrs(table, damageTypes);
    // A reading with an empty type set reaches no part (src/skill-hit-lines.js scopeApplies): one never-admitted write keeps its entry listed.
    if (!attrs.length) return this.#grouped([{ ...base, attr: table.all ?? `${table.name}:all`, requirement: false }]);
    return this.#grouped(attrs.map((attr) => ({ ...base, attr })));
  }

  /**
   * One line's hit reading (the line loop of calculateSkillHit). `entry` is the line's ledger base ({ source, text, origin, recipe? });
   * returns false for a reading the pool does not hold (the caller keeps it: an unspecified added line's warning).
   */
  addReading(parsed, line, entry, scaled) {
    const source = { kind: parsed.recipe ? "line" : "text", origin: line.origin ?? null, affixId: parsed.recipe?.affixId ?? null, line: line.text };
    const unit = "player";
    switch (parsed.kind) {
      case "damage": {
        const item = { ...entry, value: scaled(parsed.value), layer: parsed.layer, scope: parsed.scope, condition: parsed.condition, category: parsed.layer === "increased" ? "Increased damage" : "Additional damage" };
        const writes = this.#typed(HIT_ATTRS.damage, parsed.scope?.damageTypes ?? null, { unit, mod: modOfLayer(parsed.layer), value: item.value, requirement: scopeRequirement(parsed.scope), source, entry: item, derivedFrom: line.derivedFrom ?? null });
        this.lineDamage.push({ item, writes });
        return true;
      }
      case "maxDamage": case "minDamage": {
        const item = { ...entry, value: scaled(parsed.value), scope: parsed.scope, category: parsed.kind === "maxDamage" ? "Additional Max Damage" : "Additional Min Damage" };
        this.#typed(parsed.kind === "maxDamage" ? HIT_ATTRS.max : HIT_ATTRS.min, parsed.scope?.damageTypes ?? null, { unit, mod: 4, value: item.value, requirement: scopeRequirement(parsed.scope), source, entry: item });
        return true;
      }
      case "taken": {
        // Enemy damage taken: a write on the dummy (a recipe write on the enemy, the planner's derived curse lines, a typed positive line);
        // an untyped or negative one on gear is your own defence (written on you, not read by a hit).
        const enemy = parsed.enemy || line.origin === "derived" || (parsed.value > 0 && parsed.scope.damageTypes);
        const item = { ...entry, value: scaled(parsed.value), layer: parsed.layer, scope: parsed.scope, category: parsed.layer === "additional" ? "Additional damage taken" : "Increased damage taken" };
        this.#typed(HIT_ATTRS.taken, parsed.scope?.damageTypes ?? null, { unit: enemy ? "dummy" : "player", mod: modOfLayer(parsed.layer), value: item.value, requirement: scopeRequirement(parsed.scope), source, entry: item });
        return true;
      }
      case "penetration": {
        const item = { ...entry, value: scaled(parsed.value), damageTypes: parsed.damageTypes, category: "Penetration" };
        this.#grouped([...parsed.damageTypes].map((type) => ({ unit, attr: attrOf(HIT_ATTRS.penetration, type), mod: 1, value: item.value, requirement: null, source, entry: item })));
        return true;
      }
      case "armourPenetration": {
        const item = { ...entry, value: scaled(parsed.value), category: "Armor DMG Mitigation Penetration" };
        this.pool.add({ unit, attr: ARMOUR_PENETRATION, mod: 1, value: item.value, requirement: parsed.skillTags ? [{ mine: [...parsed.skillTags].map(tagKey) }] : null, source, entry: item });
        return true;
      }
      case "added": {
        if (parsed.to === "unspecified") return false;
        const item = { ...entry, type: parsed.type, min: scaled(parsed.min), max: scaled(parsed.max) };
        // The write's own tags (W9 step 4): the recipe's writes (one per skill tag; "any" an untagged write, e.g. 101010147 "Adds X - Y
        // Lightning Damage to Attacks and Spells", which reaches every skill), else the wording's ("to Spells" Spell; "to Attacks and
        // Spells" one Attack and one Spell write, as 200000042; "to Attacks" Attack). Each write is its own record, so a skill carrying
        // both tags takes both (the GetAttr sum). A weapon attack takes its Attack and untagged lines from the weapon model
        // (src/weapon-damage-model.js addedToAttacks), so those writes exclude it (the flag) and a line is never added twice; its Spell
        // write is not read by the weapon model and stays admitted for an attack that also carries the Spell tag.
        const wording = squashText(line.compoundText ?? line.text);
        const targets = parsed.addedTo?.length ? parsed.addedTo
          : parsed.to === "spells" ? ((parsed.alsoAttacks ?? /\bAttacks\b/i.test(line.text)) ? ["Attack", "Spell"] : ["Spell"])
          : /\bto (?:your )?Attacks$/i.test(wording) ? ["Attack"] : [];
        const attr = attrOf(HIT_ATTRS.damage, parsed.type);
        this.addedAttrs.add(attr);
        const requirementOf = (target) => (target === "any" ? [{ notMine: [WEAPON_ATTACK_FLAG] }]
          : target.split("+").includes("Attack") ? [{ mine: target.split("+").map(tagKey), notMine: [WEAPON_ATTACK_FLAG] }]
          : [{ mine: target.split("+").map(tagKey) }]);
        // A reading with no target (a text wording that names none) keeps one never-admitted write, so its entry stays listed.
        if (!targets.length) { this.pool.add({ unit, attr, mod: 2, value: item.min, upper: item.max, requirement: false, source, entry: item }); return true; }
        targets.forEach((target, index) => this.pool.add({ unit, attr, mod: 2, value: item.min, upper: item.max, requirement: requirementOf(target), source, entry: index ? { ...item, repeatOf: item.text } : item }));
        return true;
      }
      case "cooldownRecovery": {
        const item = { ...entry, value: scaled(parsed.value), additional: parsed.additional };
        this.pool.add({ unit, attr: COOLDOWN_RECOVERY, mod: parsed.additional ? 4 : 3, value: item.value, requirement: null, source, entry: item });
        return true;
      }
      case "castSpeed": {
        // Held, not read here: the hit's Cast Speed is the planner's cast-rate ledger (src/scorching-beam-cast-rate.js).
        this.pool.add({ unit, attr: CAST_SPEED, mod: parsed.additional ? 4 : 3, value: scaled(parsed.value), requirement: null, source, layer: "record" });
        return true;
      }
      default: return false;
    }
  }

  /** A record-layer write (not read by the hit's own queries; a conversion's source reads it). */
  addRecord(write) { return this.pool.add({ ...write, layer: "record" }); }

  // Model entries that join the pool as writes (supports on the setup, the planner's typed taken lines, the skill's own debuffs).
  addSupportIncreased(lines) {
    for (const line of lines) this.#typed(HIT_ATTRS.damage, line.scope?.damageTypes ?? null, { mod: 3, value: line.value, requirement: this.#supportRequirement(line.scope), source: { kind: "support", line: line.source }, entry: line });
  }
  // A support entry with no scope is written "for the supported skill" (5000002 → this setup's id: Moon's Dawn: Illumination's additional
  // Max Damage, recipe 234465248, 5806 mod 4 [this skill]): every part of this hit (W9 step 4; before, no part: the ledger's
  // scopeApplies has no scope → false).
  #supportRequirement(scope) { return scope ? scopeRequirement(scope) : null; }
  addSupportAdditional(lines) {
    for (const line of lines) this.#typed(HIT_ATTRS.damage, line.scopeTypes ?? null, { mod: 4, value: line.value, requirement: null, source: { kind: "support", line: line.source }, entry: line });
  }
  addSupportMax(lines) {
    for (const line of lines) this.#typed(HIT_ATTRS.max, line.scope?.damageTypes ?? null, { mod: 4, value: line.value, requirement: this.#supportRequirement(line.scope), source: { kind: "support", line: line.source }, entry: line });
  }
  addSupportCooldown(lines) {
    for (const line of lines) this.pool.add({ attr: COOLDOWN_RECOVERY, mod: line.additional ? 4 : 3, value: line.value, requirement: null, source: { kind: "support", line: line.source }, entry: line });
  }
  addPenetration(line, kind = "support") {
    this.#grouped([...line.damageTypes].map((type) => ({ attr: attrOf(HIT_ATTRS.penetration, type), mod: 1, value: line.value, requirement: null, source: { kind, line: line.source }, entry: line })));
  }
  addTaken(lines, kind = "model") {
    for (const line of lines) this.#typed(HIT_ATTRS.taken, line.scope?.damageTypes ?? null, { unit: "dummy", mod: modOfLayer(line.layer), value: line.value, requirement: scopeRequirement(line.scope), source: { kind, line: line.source }, entry: line });
  }
  /** Crit-only additional damage (the crit share's extra term): `tagOf(line)` the skill tag the line names, null for every skill. */
  addCritOnly(lines, { kind = "support", unit = "player", tagOf = () => null } = {}) {
    for (const line of lines) { const tag = tagOf(line); this.pool.add({ unit, attr: HIT_ATTRS.damage.all, mod: 4, value: line.value, requirement: [{ mine: [POOL_TAG.crit, ...(tag ? [tagKey(tag)] : [])] }], source: { kind, line: line.source }, entry: line }); }
  }
  addTypedCritOnly(lines) {
    for (const line of lines) this.pool.add({ attr: attrOf(HIT_ATTRS.damage, line.type), mod: 4, value: line.value, requirement: [{ mine: [POOL_TAG.crit] }], source: { kind: "text", line: line.source }, entry: line, critTyped: true });
  }
  /** The supports' (and this skill's own) Attack / Cast Speed lines: written "for this skill", so the setup's id admits them. */
  addSupportSpeed(lines, attr) {
    for (const line of lines) this.pool.add({ attr, mod: line.additional ? 4 : 3, value: line.value, requirement: [{ mine: [POOL_TAG.thisSkill] }], skillId: this.skillId, source: { kind: "support", line: line.source }, entry: line });
  }
  /** "+X% [additional] Attack Speed when performing Multistrikes" (attr 6351, Multistrike speed: this skill can Multistrike). */
  addMultistrikeSpeed(lines) {
    for (const line of lines) this.pool.add({ attr: MULTISTRIKE_SPEED, mod: line.additional ? 4 : 3, value: line.value, requirement: null, source: { kind: "text", line: line.source }, entry: line });
  }
  // The speed and crit rating reads add the supports' lines to the planner's own aggregates (the cast-rate ledger, the weapon model's
  // Attack Speed, the crit totals), which already read the build's conversion lines through their derived lines: a conversion record on
  // these attributes is not evaluated here (it would count twice).
  speed(attr) { return this.pool.query("player", attr, { query: this.hitQuery(), mods: [3, 4], conversions: "legacy" }); }
  multistrikeSpeed() { return this.pool.query("player", MULTISTRIKE_SPEED, { query: this.hitQuery(), mods: [3, 4], conversions: "legacy" }); }
  addCritRating(lines) {
    const MODS = { ratingFlat: 1, ratingPercent: 3, ratingAdditional: 4 };
    for (const line of lines) this.pool.add({ attr: CRIT_RATING, mod: MODS[line.kind] ?? `kind:${line.kind}`, value: line.value, requirement: null, source: { kind: "support", line: line.source }, entry: line });
  }

  // ---- Reads ----
  /** A part's damage writes of one bucket (3 increased / 4 additional) for its types. */
  damage(mod, types) { return this.pool.query("player", readAttrs(HIT_ATTRS.damage, types), { query: this.hitQuery(), mods: [mod] }); }
  taken(types) { return this.pool.query("dummy", readAttrs(HIT_ATTRS.taken, types), { query: this.hitQuery() }); }
  max(types) { return this.pool.query("player", readAttrs(HIT_ATTRS.max, types), { query: this.hitQuery(), mods: [4] }); }
  min(types) { return this.pool.query("player", readAttrs(HIT_ATTRS.min, types), { query: this.hitQuery(), mods: [4] }); }
  penetration(type) { return this.pool.query("player", attrOf(HIT_ATTRS.penetration, type), { query: this.hitQuery(), mods: [1] }); }
  armourPenetration() { return this.pool.query("player", ARMOUR_PENETRATION, { query: makeQuery({ mine: [...this.scopeTags].map(tagKey) }), mods: [1] }); }
  added(weaponAttack) { return this.pool.query("player", [...this.addedAttrs], { query: this.addedQuery(weaponAttack), mods: [2] }); }
  cooldown() { return this.pool.query("player", COOLDOWN_RECOVERY, { query: this.hitQuery() }); }
  /** Crit-only: the writes the crit share adds (each needs the crit tag), on you then on the dummy. */
  critOnly() {
    const own = this.pool.query("player", HIT_ATTRS.damage.all, { query: this.critQuery(), mods: [4], requireTag: POOL_TAG.crit });
    const taken = this.pool.query("dummy", HIT_ATTRS.damage.all, { query: this.critQuery(), mods: [4], requireTag: POOL_TAG.crit });
    return { entries: [...own.entries, ...taken.entries], own, taken };
  }
  typedCritOnly(types) { return this.pool.query("player", types.map((type) => attrOf(HIT_ATTRS.damage, type)), { query: this.critQuery(), mods: [4], requireTag: POOL_TAG.crit }); }
  critRating() { return this.pool.query("player", CRIT_RATING, { query: this.hitQuery(), conversions: "legacy" }); }

  /** Bard Song's bubble (game affix 311410880 rows 2 and 3): the Channeled-only lines reach the bubble's use; their requirement follows the entry. */
  retagLineDamage(item) {
    const found = this.lineDamage.find((entry) => entry.item === item);
    if (!found) return;
    for (const write of found.writes) write.requirement = normalizeRequirement(scopeRequirement(item.scope));
  }
  /** The damage line entries in line order (the hit model's former `damageLines`). */
  lineDamageItems() { return this.lineDamage.map((entry) => entry.item); }
}
