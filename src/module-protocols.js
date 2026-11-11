import { MODULE_AFFIXES, MODULE_ITEMS, MODULE_POOL_SLOTS } from "./data/skills/module-affixes-ss14.generated.js";
import { auraValuesAtLevel } from "./data/skills/aura-scaling-ss13.js";

// Module skill affixes (2026-10-28, user report "I don't have the affix selectors for module skills"; the in-game Module: Ratlin
// Stormer Captain tooltip lists "Resistance Protocol" and "Haste Protocol" as orange-diamond lines).
//
// Source: the game tables (scripts/build-module-affixes.mjs → src/data/skills/module-affixes-ss14.generated.js). Every Module skill
// item comes in three item bases (config_item_base, e.g. Ratlin Stormer Captain 7328 / 7240 / 7306) whose affix pool is 9001 / 9002 /
// 9003; reference data's SS14 Module pages show 1 / 2 "<Random Module-Related Affix>" and 3 "<Random Module-Related Ultimate Affix>" on them.
// The affixes are config_modifier kind 8 rows 772000001–772000079: 10 Programs and 17 Protocols roll on every module item; 10 Aura
// Overwrites and 9 Source Codes only on the Ultimate (pool 9003) item. Each row is its own group and every value is fixed (min =
// max), so a module carries up to 3 different affixes and has no roll to set.
//
// Recipes (affix catalog 2026-10-15): node 111 routes the affix's rows to the Minions summoned by this skill (tag 5000002); a write
// with targets [1] / filter 3 is on that Minion ("… for Minions summoned by this skill"); node 374 grants a buff (limit 1 stack) to
// targets [9] (you and allies) and [1] (the Minion itself) ("Minions summoned by this skill grant … to you and allies"); node 301
// with filter 101 puts a debuff on the enemy hit (the Infiltrations).
//
// Readings (each part's badge; provisional ones carry open question `module-protocols`):
//   Minion part: the planner's Minion-line wording, read by src/minion-damage-model.js for this module's Minions only.
//   Ally buff: the buff's lines join the build's lines (origin "buff") once per buff id while the module's Minion is modeled and
//     active: your stat lines, and "… for Minions" copies where the buff changes every Minion's damage (Agile Protocol's Attack and
//     Cast Speed: you and allies, every Minion included; best case: every ally in range).
//   Enemy debuff: Cold / Fire / Lightning Protocol inflict that Infiltration (game buffs 3451 / 3441 / 3461: +13% additional <type>
//     Damage taken) when this module's Minions deal that damage type (after the module's conversion); read through the existing
//     "When Minions deal damage, inflicts X Infiltration" rule (src/combat-states.js; uptime 1, one Infiltration whoever inflicts it).
//   Ailment Protocol: +3% additional damage per type of Ailment on the dummy (one write per ailment state, multiplies): (1.03)^types.
//   Aura Overwrite (2026-11-09, 25 T gap 6): "Minions summoned by this skill grant a Lv. N <Aura> to you and allies" puts the Aura's own
//     buff (Weapon Amplification 15023, Charged Flames 15153, …; to [allies, minion]) on you and every Minion while the module's Minion
//     is out. Its typed "+X% additional <Type> Damage" (Weapon Amplification affix 200000399: attr 5002 mod 4, "p0 scale *") is read at
//     the Aura record's Lv. N value (src/data/skills/aura-scaling-ss13.js; Lv1 21%) as an ally-buff line, not scaled by your Aura Effect.
//     Client (SS14, static; research/build-25t-open-items-2026-11-09.md Q6): a buff's scale is the caster's attr 3401 for the buff's tags ×
//     the holder's attr 3410 (0x141d22dd0); node 374 without sourceAsAffixSource makes the module's Minion the caster, and a module Minion
//     reads only its own attributes (config_minion link field 0), so your Aura Effect lines never reach it; no line writes either attribute
//     here (two links inferred: the request's caster field, the context's holder id). The same Aura active on your board is the same buff
//     (15023: one key for every caster, cap 1, the higher level kept): one buff, the board copy kept. Its other stats (Armor, Evasion,
//     Energy Shield, resistance, Movement Speed) stay unread.

const FAMILY_ORDER = ["Program", "Protocol", "Aura Overwrite", "Source Code"];
export const MODULE_AFFIX_SLOT_COUNT = Math.max(...Object.values(MODULE_POOL_SLOTS));
export const MODULE_OPEN_QUESTION = "module-protocols";
const ULTIMATE_POOL = 9003;
const round = (value) => Math.round(value * 10000) / 10000;

const MODULE_NAMES = new Set(Object.values(MODULE_ITEMS).map((item) => item.name));
/** Whether a skill name is a Module skill (a "Module: …" item base of the game). */
export const isModuleSkillName = (name) => MODULE_NAMES.has(String(name || ""));
/** The module's item bases: [{ item, pool, slots }] (1, 2 and 3 affix slots). */
export function moduleItemVariants(name) {
  return Object.entries(MODULE_ITEMS).filter(([, item]) => item.name === name).map(([id, item]) => ({ item: Number(id), pool: item.pool, slots: MODULE_POOL_SLOTS[item.pool] ?? 0 })).sort((a, b) => a.slots - b.slots);
}

const RECORDS = Object.entries(MODULE_AFFIXES).map(([id, row]) => Object.freeze({ id: Number(id), ...row, ultimateOnly: row.pool === ULTIMATE_POOL }));
const BY_ID = new Map(RECORDS.map((record) => [record.id, record]));
/** One module affix row by its config_modifier id, or null. */
export const moduleAffixById = (id) => BY_ID.get(Number(id)) || null;
/**
 * A row as the planner stores it: a rollable row as is; a weight-0 row as its rollable twin with the same affix and pool, if any. The
 * client's module pool table lists both Aura Overwrite: Frigid Domain rows on the Ultimate item (772000064 weight 3, 772000069 weight 0,
 * the same affix 15920997 and value; encrypted-scripts full pass 2026-11-03, finding 14), so a logged 772000069 is Frigid Domain, kept
 * as 772000064. Other weight-0 rows have no twin and stay unrollable.
 */
export function rollableModuleAffix(record) {
  if (!record) return null;
  if (record.weight > 0) return record;
  return RECORDS.find((other) => other.weight > 0 && other.affix === record.affix && other.pool === record.pool) || null;
}
/** The rollable module affixes (weight > 0), Programs, Protocols, then the Ultimate-only families. */
export function moduleAffixOptions() {
  return RECORDS.filter((record) => record.weight > 0).sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) || a.id - b.id);
}

/**
 * Saved module affixes (`skills.moduleProtocols`): { setupKey: [{ id } | null, …] } with up to 3 slots. Unknown or unrollable ids
 * and a second copy of the same affix become empty slots; trailing empty slots and empty setups are dropped. Returns null when
 * nothing is left (the field is then left out of the state).
 */
export function normalizeModuleProtocols(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const [key, list] of Object.entries(value)) {
    if (!Array.isArray(list) || ["__proto__", "constructor", "prototype"].includes(key)) continue;
    const seen = new Set();
    const slots = list.slice(0, MODULE_AFFIX_SLOT_COUNT).map((entry) => {
      const record = rollableModuleAffix(entry && typeof entry === "object" ? moduleAffixById(entry.id) : null);
      if (!record || seen.has(record.affix)) return null;
      seen.add(record.affix);
      return { id: record.id };
    });
    while (slots.length && !slots[slots.length - 1]) slots.pop();
    if (slots.length) out[key] = slots;
  }
  return Object.keys(out).length ? out : null;
}

/** A setup's saved module affix records, in slot order (empty slots left out). */
export function savedModuleAffixes(moduleProtocols, setupKey, skillName) {
  if (!isModuleSkillName(skillName)) return [];
  return (moduleProtocols?.[setupKey] || []).map((entry) => (entry ? moduleAffixById(entry.id) : null)).filter(Boolean);
}

const typeWord = (word) => word[0].toUpperCase() + word.slice(1).toLowerCase();
const part = (text, status, reason, extra = {}) => ({ text, status, reason, ...extra });
const buffValue = (record, affix) => record.buffs.flatMap((buff) => buff.affixes).find(([id]) => id === affix)?.[1]?.[0];

/**
 * How the planner reads one module affix: minion lines (this module's Minions; Minion-model wording), player lines (ally buffs;
 * plain stat wording), all-Minion lines (an ally buff that changes every Minion), an Infiltration type, and each part's badge.
 * `context`: { types: the module Minions' damage types after conversion, tags: their skill tags }.
 */
export function moduleAffixReading(record, context = {}) {
  // `types`: the damage the Minions deal (after their conversion); `scaling`: those and the types they convert from (converted damage
  // keeps the modifiers of the type it came from: the Minion model applies a typed line to a converted row of either type).
  const types = new Set(context.types || []), scaling = new Set([...(context.types || []), ...(context.baseTypes || [])]), tags = new Set(context.tags || []);
  // Every Minion skill on a cooldown (only the Nether Bulwark's Aember Rain, 2 s, since the Splits are read: chunk 10): speed shortens each use, not the cadence.
  const speedNote = context.cooldownBound ? "; every Minion skill of this module waits on its cooldown in the model, so speed shortens each use but not the cadence" : "";
  const [v1, v2] = record.values;
  const reading = { minion: [], player: [], allMinions: [], infiltration: null, parts: [], provisional: false };
  const minion = (text, extra = {}) => reading.minion.push({ text, ...extra });
  const player = (text, buff) => reading.player.push({ text, buff });
  const tagged = (tag, text) => tags.has(tag) ? [part(text, "In calc", `the module's Minion skills carry the ${tag} tag`)] : [part(text, "Inactive", `no ${tag} skill among the module's Minion skills`)];
  switch (record.link) {
    case 2001: case 2002: case 2003: case 2004: case 2005: {
      const type = record.name.split(": ")[1];
      minion(`+${v1}% additional ${type} Damage for Minions`);
      reading.parts.push(scaling.has(type) ? part(record.text[0], "In calc", `game affix ${record.affix}: additional ${type} Damage on this module's Minions${types.has(type) ? "" : ` (their ${type} Damage is converted, and keeps its ${type} modifiers)`}`) : part(record.text[0], "Inactive", `this module's Minions deal no ${type} Damage`));
      break;
    }
    case 2006:
      minion(`+${v1}% Critical Strike Rating for Minions`); minion(`+${v2}% Critical Strike Damage for Minions`);
      reading.parts.push(part(record.text[0], "In calc", `game affix ${record.affix}: attr 4802 increased, 4803 flat on this module's Minions`));
      break;
    case 2007:
      minion(`${v1}% additional Min Damage for Minions`); minion(`+${v2}% additional Max Damage for Minions`);
      reading.parts.push(part(record.text[0], "In calc", `game affix ${record.affix}: attrs 5812 / 5806 additional on this module's Minions`));
      break;
    case 2008:
      reading.parts.push(part(record.text[0], "Not on dummy", "the dummy never attacks, so the Minions are never at Low Life (provisional)", { provisional: true }));
      break;
    case 2009:
      if (tags.has("Spell")) minion(`+${v2}% additional Spell Damage for Minions`);
      reading.parts.push(...tagged("Spell", `+${v2}% additional Spell Damage for Minions summoned by this skill`), part(`+${v1} Max Spell Burst for Minions summoned by this skill`, "Not modeled", "Minion Spell Burst is not modeled"));
      break;
    case 2010:
      if (tags.has("Melee")) minion(`+${v1}% additional Melee Damage for Minions`);
      reading.parts.push(...tagged("Melee", `+${v1}% additional Melee Damage for Minions summoned by this skill`), part(`+${v2}% Melee Skill Area for Minions summoned by this skill`, "No DPS effect", "skill area"));
      break;
    case 2011: case 2012: case 2013: {
      const type = typeWord(record.name.split(" ")[0]);
      const debuff = record.buffs.find((buff) => buff.to.includes("enemy"));
      const taken = debuff?.affixes?.[0]?.[1]?.[0] ?? 13;
      if (types.has(type)) reading.infiltration = type;
      reading.parts.push(types.has(type)
        ? part(record.text[0], "In calc", `this module's Minions deal ${type} Damage: ${type} Infiltration held on the dummy (game buff ${debuff?.buff}: +${taken}% additional ${type} Damage taken; uptime 1, provisional)`, { provisional: true })
        : part(record.text[0], "Inactive", `this module's Minions deal no ${type} Damage`));
      break;
    }
    case 2014:
      reading.parts.push(part(record.text[0], "Not modeled", "Minion ailments (Deterioration) are not modeled"));
      break;
    case 2015:
      minion(`+${v1}% Armor DMG Mitigation Penetration for Minions`);
      reading.parts.push(part(record.text[0], "In calc", `game affix ${record.affix}: char field 2006247 on this module's Minions`));
      break;
    case 2016: case 2017: case 2025: case 2023: {
      // The ally buff's stat line (game buffs 11550 / 11560 / 11620: affixes 101010520 / 101010379 / 101010171); Block Protocol's
      // taunt is an enemy debuff with no stat.
      const stat = { 2016: [101010520, (value) => `+${value}% additional Max Life`], 2017: [101010379, (value) => `+${value}% additional Max Energy Shield`], 2025: [101010171, (value) => `Regenerates ${value}% Life per second`] }[record.link];
      const value = stat ? buffValue(record, stat[0]) : undefined;
      if (value !== undefined) player(stat[1](value), record.buffs[0].buff);
      reading.parts.push(...record.text.map((text) => part(text, "No DPS effect", record.link === 2023 ? "block and taunt: the dummy never attacks" : "defence / recovery (stat lines counted)")));
      break;
    }
    case 2018: {
      minion(`+${v1}% Attack and Cast Speed for Minions`);
      const movement = buffValue(record, 200000402);
      if (movement) player(`+${movement}% Movement Speed`, record.buffs[0].buff);
      reading.parts.push(part(record.text[0], "In calc", `game affix ${record.affix}: attrs 6001 / 6002 increased on this module's Minions (Movement Speed: no DPS effect)${speedNote}`), part(record.text[1], "No DPS effect", "Movement Speed"));
      break;
    }
    case 2019: {
      const speed = buffValue(record, 101010065);
      if (speed) player(`+${speed}% Projectile Speed`, record.buffs[0].buff);
      reading.parts.push(part(record.text[0], "Not on dummy", "one dummy: extra projectiles and pierces do not hit it again (the Minion skills' hits per use are their profile's; provisional)", { provisional: true }), part(record.text[1], "No DPS effect", "Projectile Speed"));
      break;
    }
    case 2020: {
      if (tags.has("Area")) minion(`+${v1}% additional Area Damage for Minions`);
      const area = buffValue(record, 101010005);
      if (area) player(`+${area}% Skill Area`, record.buffs[0].buff);
      reading.parts.push(...tagged("Area", record.text[0]), part(record.text[1], "No DPS effect", "Skill Area"));
      break;
    }
    case 2021: {
      minion(`+${v1}% additional Elemental Damage for Minions`);
      const resistance = buffValue(record, 560655);
      if (resistance) player(`+${resistance}% Elemental Resistance`, record.buffs[0].buff);
      const elemental = ["Fire", "Cold", "Lightning"].some((type) => scaling.has(type));
      reading.parts.push(elemental ? part(record.text[0], "In calc", `game affix ${record.affix}: attr 5727 additional on this module's Minions`) : part(record.text[0], "Inactive", "this module's Minions deal no Elemental Damage"), part(record.text[1], "No DPS effect", "resistance (stat line counted)"));
      break;
    }
    case 2022: {
      minion("", { ailmentTypes: v1 });
      const ailment = buffValue(record, 363414400);
      if (ailment) player(`+${ailment}% additional Ailment Damage`, record.buffs[0].buff);
      reading.parts.push(part(record.text[0], "In calc", `game affix ${record.affix}: one +${v1}% additional write per ailment state on the enemy (Frostbitten, Frozen, Shocked, Ignited, Wilted, Traumatized, Numbed): (1 + ${v1}%)^types on the dummy`),
        part(record.text[1], "In calc", "your ailments (Ignite, Trauma, Wilt) take it; the Minions' own ailments are not modeled"));
      break;
    }
    case 2024:
      reading.parts.push(part(record.text[0], "Not on dummy", "the training dummy is read as never knocked back, so no Paralysis (provisional)", { provisional: true }));
      break;
    case 2026: {
      const speed = buffValue(record, 200000020);
      if (speed) { player(`+${speed}% Attack and Cast Speed`, record.buffs[0].buff); reading.allMinions.push({ text: `+${speed}% Attack and Cast Speed for Minions`, buff: record.buffs[0].buff }); }
      reading.parts.push(part(record.text[0], "In calc", `game buff ${record.buffs[0]?.buff} (affix 200000020) on you and allies: your Attack and Cast Speed, and every Minion's (best case: all in range; provisional)${speedNote}`, { provisional: true }));
      break;
    }
    case 2027:
      reading.parts.push(part(record.text[0], "Not modeled", "a random-element share of Physical Damage on the Minions and their Elemental ailments are not modeled"));
      break;
    case 2047: {
      minion("", { cooldownAdditional: v1 });
      for (const [affix, list] of record.buffs.find((buff) => buff.to.includes("allies"))?.affixes || []) if (affix === 101010070) player(`+${list[0]}% Cooldown Recovery Speed`, record.buffs[0].buff);
      reading.parts.push(part(record.text[0], "In calc", `game affix ${record.affix}: attr 6007 additional on this module's Minions`), part(record.text[1], "In calc", "your Cooldown Recovery Speed (Injury Buffer: no DPS effect)"));
      break;
    }
    case 2043: case 2045:
      reading.parts.push(part(record.text[0], "Not on dummy", "the training dummy is never defeated"));
      break;
    default: {
      const overwrite = record.family === "Aura Overwrite" ? auraOverwrite(record, context) : null;
      if (overwrite) {
        for (const line of overwrite.player) player(line.text, line.buff);
        reading.allMinions.push(...overwrite.allMinions);
        reading.parts.push(overwrite.part);
        break;
      }
      reading.parts.push(...record.text.map((text) => part(text, "Not modeled", record.family === "Aura Overwrite" ? "an Aura granted by a Minion is not modeled (only its typed additional damage is read)" : `${record.family} affixes are not modeled`)));
    }
  }
  reading.provisional = reading.parts.some((entry) => entry.provisional);
  reading.status = moduleAffixStatus(reading.parts);
  reading.reason = reading.parts.map((entry) => `${entry.status}: ${entry.reason}`).join(" · ");
  return reading;
}

const AURA_OVERWRITE = /grant a Lv\. (\d+) (.+?) to you and allies$/;
const TYPED_AURA_STAT = /^additional(Physical|Fire|Cold|Lightning|Erosion)DamagePercent$/;
/** An Aura Overwrite's typed additional damage (see the header), or null when its Aura has none. */
function auraOverwrite(record, context = {}) {
  const match = String(record.text?.[0] || "").match(AURA_OVERWRITE);
  if (!match) return null;
  const [, level, aura] = match;
  const typed = Object.entries(auraValuesAtLevel(aura, Number(level)) || {}).map(([stat, value]) => [stat.match(TYPED_AURA_STAT)?.[1], value]).filter(([type, value]) => type && Number(value));
  if (!typed.length) return null;
  const buff = record.buffs.find((item) => item.to.includes("allies") && item.affixes.length)?.buff ?? null;
  if (new Set(context.boardAuras || []).has(aura)) return { player: [], allMinions: [], part: part(record.text[0], "Inactive", `${aura} is active on your skill board: the same buff (${buff}), one buff, the board copy kept`) };
  const lines = typed.map(([type, value]) => ({ type, value: round(value) }));
  return {
    player: lines.map((line) => ({ text: `+${line.value}% additional ${line.type} Damage`, buff })),
    allMinions: lines.map((line) => ({ text: `+${line.value}% additional ${line.type} Damage for Minions`, buff })),
    part: part(record.text[0], "In calc", `game buff ${buff} on you and allies: ${lines.map((line) => `+${line.value}% additional ${line.type} Damage`).join(", ")} (Lv. ${level} ${aura}, its record's value; not scaled by your Aura Effect: client, the caster's attr 3401, the Minion's)`)
  };
}

/** One badge for several parts: In calc if any part is, Partly modeled when another part is Not modeled, else the most relevant. */
export function moduleAffixStatus(parts = []) {
  const statuses = new Set(parts.map((entry) => entry.status));
  if (statuses.has("In calc")) return statuses.has("Not modeled") ? "Partly modeled" : "In calc";
  for (const status of ["Not modeled", "Inactive", "Not on dummy", "No DPS effect"]) if (statuses.has(status)) return status;
  return "Not modeled";
}

/** The module Minion's damage types (after its conversion) and skill tags, from its profile (src/minion-profiles.js). */
export function moduleMinionContext(profile) {
  const skills = profile?.skills || [];
  return { types: [...new Set(skills.map((skill) => skill.type).filter(Boolean))], baseTypes: [...new Set(skills.map((skill) => skill.baseType).filter(Boolean))], tags: [...new Set(skills.flatMap((skill) => skill.tags || []))], cooldownBound: skills.length > 0 && skills.every((skill) => (skill.timing?.cooldown || 0) > 0) };
}

/**
 * Resolves every active module setup's affixes: { modules: [{ setupKey, name, affixes: [{ id, name, family, text, status, reason,
 * parts, provisional }] }], playerLines (modifier lines, once per buff), infiltrationLines }. `setups` carry `moduleAffixes` (the
 * planner sets them); `isActive(setup)` says whether the module's Minion is out; `profileOf(setup)` its Minion profile.
 */
export function resolveModuleProtocols({ setups = [], isActive = () => true, profileOf = () => null, boardAuras = [] } = {}) {
  const modules = [], playerLines = [], infiltrationLines = [], buffsSeen = new Set(), infiltrationSeen = new Set();
  for (const setup of setups) {
    const records = setup.moduleAffixes || [];
    if (!records.length) continue;
    const active = setup.enabled !== false && isActive(setup);
    const context = { ...moduleMinionContext(profileOf(setup)), boardAuras };
    const affixes = records.map((record) => {
      const reading = moduleAffixReading(record, context);
      const parts = active ? reading.parts : reading.parts.map((entry) => ({ ...entry, status: "Inactive", reason: "the module is not on the skill board, switched off or its Minion is not modeled" }));
      if (active) {
        const source = `${setup.name}: ${record.name}`;
        for (const line of [...reading.player, ...reading.allMinions]) {
          const key = `${line.buff}|${line.text}`;
          if (buffsSeen.has(key)) continue;
          buffsSeen.add(key);
          playerLines.push({ text: line.text, source, origin: "buff", multiplier: 1, moduleProtocol: record.id });
        }
        if (reading.infiltration && !infiltrationSeen.has(reading.infiltration)) {
          infiltrationSeen.add(reading.infiltration);
          infiltrationLines.push({ text: `When Minions deal damage, inflicts ${reading.infiltration} Infiltration`, source, origin: "buff", multiplier: 1, moduleProtocol: record.id });
        }
      }
      return { id: record.id, name: record.name, family: record.family, text: record.text, ultimateOnly: record.ultimateOnly, parts, status: moduleAffixStatus(parts), reason: parts.map((entry) => `${entry.status}: ${entry.reason}`).join(" · "), provisional: active && reading.provisional };
    });
    modules.push({ setupKey: setup.setupKey, name: setup.name, active, affixes });
  }
  return { modules, playerLines, infiltrationLines };
}

/**
 * The Minion-model entries of the module affixes on a Minion's summon setups ({ kind, value, … } like src/minion-damage-model.js
 * lines): parsed with its classifier (`classify`), Ailment Protocol's (1 + X%)^types and Overclock Composition's additional
 * Cooldown Recovery Speed built here. One copy per affix id across the Minion's setups.
 */
export function moduleMinionEntries(setups = [], { classify, enemyAilments = [], profile = null } = {}) {
  const out = [], seen = new Set();
  const context = moduleMinionContext(profile);
  for (const setup of setups) for (const record of setup.moduleAffixes || []) {
    if (seen.has(record.affix)) continue;
    seen.add(record.affix);
    const reading = moduleAffixReading(record, context);
    const source = `${setup.name}: ${record.name}`;
    for (const line of reading.minion) {
      if (line.ailmentTypes) {
        const types = [...new Set(enemyAilments)];
        const value = round(((1 + line.ailmentTypes / 100) ** types.length - 1) * 100);
        if (value) out.push({ kind: "additional", value, source, origin: "skill", text: `+${value}% additional damage (${record.name}: +${line.ailmentTypes}% per Ailment type on the dummy, multiplies; ${types.length}: ${types.join(", ")})` });
        continue;
      }
      if (line.cooldownAdditional) { out.push({ kind: "cooldownRecovery", value: line.cooldownAdditional, additional: true, source, origin: "skill", text: `+${line.cooldownAdditional}% additional Cooldown Recovery Speed for Minions (${record.name})` }); continue; }
      const parsed = classify ? classify(line.text) : null;
      if (parsed) out.push({ ...parsed, source, origin: "skill", text: `${line.text} (${record.name})` });
    }
  }
  return out;
}
