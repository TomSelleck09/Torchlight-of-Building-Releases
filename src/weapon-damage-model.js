import { normalizePercentageText } from "./percentage-text.js";
import { effectiveGearModifierTexts } from "./engine.js";
import { rareBaseForItem, rareBaseByName } from "./rare-base-lookup.js";
import { legendaryBasesSs14 } from "./data/gear/legendary-bases-ss14.generated.js";
import { legendaryGearSs13 } from "./data/gear/legendary-gear-ss13.generated.js";
import { defaultBaseForItem } from "./data/gear/corrosion-implicits-ss13.js";

// Weapon-damage model for "Deals X% Weapon Attack Damage" skills (the attack batch of
// research/skill-inventory-2026-10-11.md; first slice in src/attack-hit-profiles.js).
//
// What is sourced and what is provisional:
//   - Weapon base lines come from the TLIDB equipment tables (src/data/gear/rare-base-items-ss13.generated.js, e.g.
//     Unforgotten Long Blade "154 - 154 Physical Damage", "500 Critical Strike Rating", "1.5 Attack Speed"; spell
//     weapons carry "Adds X - X <Type> Damage to Spells" instead of weapon damage). A legendary or crafted weapon
//     keeps the same base lines as implicit modifiers.
//   - Weapon-local affixes (research/coverage-census-2026-10-11.md, game attribute ids): "+X% Gear Physical Damage"
//     (attr 5002, the weapon's Physical damage), "Adds A - B <Type> Damage to the gear" (attr 5002/5107/5108/5109),
//     "+X% Gear Elemental Damage" (5107+5108+5109), "+X% gear Attack Speed" (attr 6001) and "+X% Attack Critical
//     Strike Rating for this gear" (attr 4802). They are read only from the weapon item that carries them.
//   - The skill's Weapon Attack Damage % per level is the +0x08 double of its config_skill_damage rows (equal to TLIDB's
//     "Deals X% Weapon Attack Damage" line for every level of the four channels; research/skill-data-format-2026-10-11.md).
//     TLIDB publishes the same number as the skill's "effectiveness of added damage", so added flat damage to Attacks
//     is scaled by the same percentage (reading of the two published stats; not yet checked in game).
//   - Dual wielding: the captured in-game status row (src/data/stats/selena-scorching-beam-combat-validation.js:
//     "Dual Wielding" +30% Attack Block Chance, +10% additional Attack Speed) and the game affix texts ("+X% additional
//     Base Damage for Off-Hand Weapons", "Adds X% of the damage of the Off-Hand Weapon to the final damage of the
//     Main-Hand Weapon", "+X% additional Attack Speed while Dual Wielding") show the off-hand weapon has damage of its
//     own. `dualWieldMode` "alternate" (default): swings alternate hands, each with its own hand's damage, crit
//     and speed (user-confirmed 2026-10-14; `hands`), at the alternating attack interval; "main-hand" uses the main hand only.
//   - Attack speed: a weapon's "1.5 Attack Speed" is read as 1.5 attacks per second at a skill's 1 s base attack time
//     (the stat sheet's existing reading), scaled by increased Attack Speed and additional Attack Speed lines. Hypothesis
//     to confirm with the proposed in-game test (a plain weapon + Whirlwind).
//   - Attack crit: weapon Critical Strike Rating (500 = 5%, 100 rating per chance point, the spell crit model's rule) ×
//     (1 + % Attack Critical Strike Rating + "for this gear") + flat Attack (and Spell) Critical Strike Rating.
//   - Unarmed: no weapon damage is published for empty hands, so unarmed attacks compute no Weapon Attack Damage
//     (warning) until a source fixes the unarmed base.

const NUM = "([+-]?\\d+(?:\\.\\d+)?)";
const number = (text) => Number(String(text).replace("−", "-"));
const clean = (text) => normalizePercentageText(String(text || "")).replace(/\s+/g, " ").trim();

export const ONE_HANDED_WEAPON_TYPES = Object.freeze(["Claw", "Dagger", "One-Handed Sword", "One-Handed Hammer", "One-Handed Axe", "Wand", "Rod", "Scepter", "Cane", "Pistol"]);
export const TWO_HANDED_WEAPON_TYPES = Object.freeze(["Two-Handed Sword", "Two-Handed Hammer", "Two-Handed Axe", "Tin Staff", "Cudgel", "Bow", "Crossbow", "Musket", "Fire Cannon"]);
export const SHIELD_TYPES = Object.freeze(["STR Shield", "DEX Shield", "INT Shield"]);
// TLIDB "Limited to …" weapon restriction wordings → base types (Crossbow is neither a gun nor a cannon on TLIDB's
// wording; it is left out of "guns and cannons" and flagged in the profile notes).
export const WEAPON_FAMILIES = Object.freeze({
  swords: ["One-Handed Sword", "Two-Handed Sword"], axes: ["One-Handed Axe", "Two-Handed Axe"], hammers: ["One-Handed Hammer", "Two-Handed Hammer"],
  "two-handed axes": ["Two-Handed Axe"], "two-handed hammers": ["Two-Handed Hammer"], cudgels: ["Cudgel"], "tin staffs": ["Tin Staff"],
  guns: ["Pistol", "Musket"], cannons: ["Fire Cannon"], bows: ["Bow"], crossbows: ["Crossbow"], claws: ["Claw"], daggers: ["Dagger"],
  // Second attack slice (2026-10-12): one-handed families, caster one-handers, "firearms" and "ranged weapons".
  "one-handed swords": ["One-Handed Sword"], "one-handed axes": ["One-Handed Axe"], "one-handed hammers": ["One-Handed Hammer"],
  canes: ["Cane"], wands: ["Wand"], rods: ["Rod"], scepters: ["Scepter"], firearms: ["Pistol", "Musket"],
  "ranged weapons": ["Bow", "Crossbow", "Pistol", "Musket", "Fire Cannon"]
});
export const DUAL_WIELD_STATUS = Object.freeze({ attackBlockChancePercent: 30, additionalAttackSpeedPercent: 10, source: "captured in-game status row \"Dual Wielding\" (src/data/stats/selena-scorching-beam-combat-validation.js)" });
const DAMAGE_TYPES = ["Physical", "Fire", "Cold", "Lightning", "Erosion"];
const ELEMENTAL = ["Fire", "Cold", "Lightning"];

/** Weapon restriction text ("Limited to swords, axes, hammers, cudgels, and tin staffs") → allowed base types, or null. */
export function weaponRestrictionTypes(text) {
  return weaponRestriction(text)?.types ?? null;
}

/**
 * Weapon restriction text → { text, types, dualWield }. "Limited to dual-wielding one-handed swords, …" (TLIDB's
 * "duel wielding" spelling included) also needs two one-handed weapons; "unarmed" names no base type (no published
 * unarmed damage) and is dropped from the list.
 */
export function weaponRestriction(text) {
  if (!text) return null;
  const lower = String(text).replace(/^Limited to\s+/i, "").replace(/\.\s*$/, "").toLowerCase();
  const dualWield = /\bdu[ae]l[\s-]*wielding\b/.test(lower);
  const words = lower.replace(/\bdu[ae]l[\s-]*wielding\s+/g, "").split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map((word) => word.trim()).filter(Boolean);
  const types = new Set();
  for (const word of words) for (const type of WEAPON_FAMILIES[word] || []) types.add(type);
  return { text, types: types.size ? [...types] : null, dualWield };
}

/** The base type of an equipped item (rare base id / name, `base`, or the legendary catalog's icon). */
export function weaponTypeOf(item) {
  if (!item) return null;
  const rareBase = rareBaseForItem(item, [item.base, item.name]);
  if (rareBase) return rareBase.type;
  if (item.base && [...ONE_HANDED_WEAPON_TYPES, ...TWO_HANDED_WEAPON_TYPES, ...SHIELD_TYPES].includes(item.base)) return item.base;
  const catalogItem = legendaryGearSs13.find((entry) => entry.name === item.name || entry.id === item.baseId);
  const remoteIcon = item.remoteIcon || catalogItem?.remoteIcon;
  const resolved = defaultBaseForItem({ ...item, remoteIcon: remoteIcon || "" });
  return resolved || null;
}

export const weaponHands = (type) => ONE_HANDED_WEAPON_TYPES.includes(type) ? "one" : TWO_HANDED_WEAPON_TYPES.includes(type) ? "two" : SHIELD_TYPES.includes(type) ? "shield" : null;

const BASE_DAMAGE = new RegExp(`^${NUM}\\s*[-–]\\s*${NUM} (Physical|Fire|Cold|Lightning|Erosion) Damage$`, "i");
const BASE_CRIT = /^(\d+(?:\.\d+)?) Critical Strike Rating$/i;
const BASE_SPEED = /^(\d+(?:\.\d+)?) Attack Speed$/i;
const LOCAL_PHYSICAL = new RegExp(`^${NUM}% Gear Physical Damage$`, "i");
const LOCAL_ELEMENTAL = new RegExp(`^${NUM}% Gear Elemental Damage$`, "i");
// "Elemental" (Claw / Dagger craft prefix, gear affix batch D 2026-10-22): game affix 899716224 adds the same range to the gear's Fire,
// Cold and Lightning damage (three node-363 writes in parallel, attrs 5107 / 5108 / 5109 on Attacks), so each type gets it.
const LOCAL_ADDED = new RegExp(`^Adds ${NUM}\\s*[-–]\\s*${NUM} (Physical|Fire|Cold|Lightning|Erosion|Elemental) Damage to the gear$`, "i");
const LOCAL_SPEED = new RegExp(`^${NUM}% gear Attack Speed$`, "i");
const LOCAL_CRIT = new RegExp(`^${NUM}% Attack Critical Strike Rating for this gear$`, "i");
// Flat local rating (Incorrect Arbitration, corroded: "+10000 Critical Strike Rating for this gear"; legendary audit batch 1): added to
// the weapon's base rating before its local increased rating.
const LOCAL_CRIT_FLAT = new RegExp(`^\\+${NUM} (?:Attack )?Critical Strike Rating for this gear$`, "i");

/** "base" / "local" for a weapon base or weapon-local line that readWeapon reads, else null (coverage badges). */
export function weaponLocalLineKind(text) {
  const line = clean(text);
  if ([BASE_DAMAGE, BASE_CRIT, BASE_SPEED].some((pattern) => pattern.test(line))) return "base";
  if ([LOCAL_PHYSICAL, LOCAL_ELEMENTAL, LOCAL_ADDED, LOCAL_SPEED, LOCAL_CRIT, LOCAL_CRIT_FLAT].some((pattern) => pattern.test(line))) return "local";
  return null;
}

// A legendary weapon's base lines (base damage, Critical Strike Rating, Attack Speed) when the item carries none: the legendary
// crafter saves only the legendary lines, while a game-log import keeps the base attributes as implicitModifiers. The base is the
// game's own record (src/data/gear/legendary-bases-ss14.generated.js: config_item_gold base id → item_base name), and its lines
// are that base's (src/data/gear/rare-base-items-ss13.generated.js; Scorching Words: Rusted Wooden Hammer "8 - 8 Physical Damage",
// "500 Critical Strike Rating", "1.5 Attack Speed"). Legendary audit 2026-10-22: before, a crafted legendary weapon had no
// weapon damage, so its Attack skills dealt only added damage.
export function legendaryWeaponBaseLines(item) {
  if (!item || (item.rarity && !["legendary", "captured"].includes(item.rarity))) return [];
  const entry = legendaryBasesSs14[String(item.name || "").replace(/ - Priceless$/i, "")];
  if (!entry) return [];
  const carried = effectiveGearModifierTexts(item).map(clean);
  if (carried.some((line) => [BASE_DAMAGE, BASE_CRIT, BASE_SPEED].some((pattern) => pattern.test(line)))) return [];
  const base = rareBaseByName(entry.base, entry.type);
  return (base?.modifiers || []).filter((line) => [BASE_DAMAGE, BASE_CRIT, BASE_SPEED].some((pattern) => pattern.test(clean(line))));
}

/** One equipped weapon: base lines, its own local affixes, and the resulting per-hit damage / speed / crit. */
export function readWeapon(item) {
  if (!item) return null;
  const type = weaponTypeOf(item);
  const hands = weaponHands(type);
  if (!hands || hands === "shield") return { slot: item.slot, name: item.name, type, hands, weapon: false, damage: {}, attackSpeed: null, critRating: null, sources: [], notes: hands === "shield" ? [`${item.name}: a shield, no weapon damage.`] : [`${item.name}: base type ${type || "unknown"} is not a weapon type.`] };
  const base = {}, added = {}, sources = [];
  let physicalPercent = 0, elementalPercent = 0, speedPercent = 0, critPercent = 0, attackSpeed = null, critRating = null, critFlat = 0;
  for (const raw of [...effectiveGearModifierTexts(item), ...legendaryWeaponBaseLines(item)]) {
    const text = clean(raw);
    let match;
    if ((match = text.match(BASE_DAMAGE))) { const type = match[3][0].toUpperCase() + match[3].slice(1).toLowerCase(); base[type] = { min: number(match[1]), max: number(match[2]) }; sources.push({ kind: "base", text, type }); }
    else if ((match = text.match(BASE_CRIT))) { critRating = number(match[1]); sources.push({ kind: "base", text }); }
    else if ((match = text.match(BASE_SPEED))) { attackSpeed = number(match[1]); sources.push({ kind: "base", text }); }
    else if ((match = text.match(LOCAL_PHYSICAL))) { physicalPercent += number(match[1]); sources.push({ kind: "local", text }); }
    else if ((match = text.match(LOCAL_ELEMENTAL))) { elementalPercent += number(match[1]); sources.push({ kind: "local", text }); }
    else if ((match = text.match(LOCAL_ADDED))) { const named = match[3][0].toUpperCase() + match[3].slice(1).toLowerCase(); for (const type of named === "Elemental" ? ["Fire", "Cold", "Lightning"] : [named]) { added[type] = { min: (added[type]?.min || 0) + number(match[1]), max: (added[type]?.max || 0) + number(match[2]) }; sources.push({ kind: "local", text, type }); } }
    else if ((match = text.match(LOCAL_SPEED))) { speedPercent += number(match[1]); sources.push({ kind: "local", text }); }
    else if ((match = text.match(LOCAL_CRIT))) { critPercent += number(match[1]); sources.push({ kind: "local", text }); }
    else if ((match = text.match(LOCAL_CRIT_FLAT))) { critFlat += number(match[1]); sources.push({ kind: "local", text }); }
  }
  // Local layers: "Gear Physical Damage" multiplies the weapon's Physical damage (base + Physical added to the gear);
  // "Gear Elemental Damage" multiplies the elemental damage added to the gear (reading of attr 5002 / 5107–5109).
  const damage = {};
  for (const type of DAMAGE_TYPES) {
    const min = (base[type]?.min || 0) + (added[type]?.min || 0), max = (base[type]?.max || 0) + (added[type]?.max || 0);
    if (!(max > 0)) continue;
    const factor = 1 + (type === "Physical" ? physicalPercent : ELEMENTAL.includes(type) ? elementalPercent : 0) / 100;
    damage[type] = { min: min * factor, max: max * factor };
  }
  return {
    slot: item.slot, name: item.name, type, hands, weapon: true,
    base, added, local: { physicalPercent, elementalPercent, attackSpeedPercent: speedPercent, critRatingPercent: critPercent },
    damage, hasWeaponDamage: Object.keys(damage).length > 0,
    attackSpeed: attackSpeed != null ? attackSpeed * (1 + speedPercent / 100) : null, baseAttackSpeed: attackSpeed,
    critRating: critRating != null ? (critRating + critFlat) * (1 + critPercent / 100) : null, baseCritRating: critRating,
    sources, notes: []
  };
}

// Build-wide attack lines (any origin). Scoped "+X% Attack / Melee / Physical Damage" lines are not read here: the
// hit engine applies them through the skill's tags and damage types (src/skill-hit-lines.js).
const ATTACK_SPEED = new RegExp(`^${NUM}% (additional )?(?:Attack and Cast Speed|Attack Speed)$`, "i");
const ATTACK_SPEED_DUAL = new RegExp(`^${NUM}% (additional )?Attack Speed while Dual Wielding$`, "i");
const MAIN_HAND_SPEED = new RegExp(`^${NUM}% Main-Hand Weapon Attack Speed$`, "i");
// The plain "+N Critical Strike Rating" (the general rating; the revived Frostbitten Critical Strike Rating family's body) too.
const CRIT_FLAT = new RegExp(`^\\+${NUM} (?:(?:Attack|Attack and Spell) )?Critical Strike Rating$`, "i");
const CRIT_PERCENT = new RegExp(`^${NUM}% (?:Attack |Attack and Spell )?Critical Strike Rating$`, "i");
// "+X% additional Critical Strike Rating" (Cohesion's next-Main-Skill buff × its share, core audit batch B3; game node 624 on
// attr 4802): its own multiplier on the rating after the increased layer.
const CRIT_ADDITIONAL = new RegExp(`^${NUM}% additional (?:Attack |Attack and Spell )?Critical Strike Rating$`, "i");
const CRIT_MAIN_HAND = new RegExp(`^${NUM}% Critical Strike Rating for the Main-Hand Weapon$`, "i");
const CRIT_TWO_HANDED = new RegExp(`^${NUM}% Attack Critical Strike Rating when holding a Two-Handed Weapon$`, "i");
const ADDED_ATTACKS = new RegExp(`^Adds ${NUM}\\s*[-–]\\s*${NUM} (Physical|Fire|Cold|Lightning|Erosion) Damage to (?:Attacks|Attacks and Spells|your Attacks and Spells|your and your Minions['’] Attacks and Spells)$`, "i");
// Legendary audit batch 1 (2026-10-22): Boor's Iron Crown writes "… to Main-Hand Weapon" without "the" (one game wording).
const ADDED_MAIN_HAND = new RegExp(`^Adds ${NUM}\\s*[-–]\\s*${NUM} (Physical|Fire|Cold|Lightning|Erosion) Damage to (?:the )?Main-Hand Weapon$`, "i");
const TWO_HANDED_BASE = new RegExp(`^${NUM}% additional Base Damage for Two-Handed Weapons$`, "i");
const OFF_HAND_BASE = new RegExp(`^${NUM}% additional Base Damage for Off-Hand Weapons$`, "i");
const MAIN_HAND_DAMAGE = new RegExp(`^${NUM}% additional damage for Main-Hand Weapons$`, "i");
const HELD_DAMAGE = new RegExp(`^${NUM}% (additional )?Attack Damage when holding a (One|Two)-Handed Weapon$`, "i");
// Falling Leaves (Ronin core) "-20% additional damage for Weapons". Read as every Weapon Attack Damage hit (both hands);
// provisional until checked in game (talent batch Q13).
const WEAPONS_DAMAGE = new RegExp(`^${NUM}% additional damage for Weapons$`, "i");
const DUAL_DAMAGE = new RegExp(`^${NUM}% (additional )?Attack Damage while Dual Wielding$`, "i");
const OFF_HAND_SHARE = new RegExp(`^Adds ${NUM}% of the damage of the Off-Hand Weapon to the final damage of the Main-Hand Weapon$`, "i");
// Joined Force (Bladerunner 24-point core, TLIDB text): "Off-Hand Weapons do not participate in Attacks while Dual Wielding".
const WEAPON_CRIT_FIXED = /^The Critical Strike Rating is fixed at (\d+(?:\.\d+)?) for the Weapon$/i;
const WEAPON_SPEED_FIXED = /^Weapon Attack Speed is fixed at (\d+(?:\.\d+)?)$/i;
const OFF_HAND_NO_ATTACK =/^Off-Hand Weapons do not participate in Attacks while Dual Wielding$/i;
// Twinblade Onslaught (Erika – Vendetta's Sting; hero trait audit B2, 2026-10-19): "No additional Attack Speed bonus is granted
// while Dual Wielding. Instead, +X% additional Attack Damage". Read as the Dual Wielding status's +10% additional Attack Speed
// being dropped (its sibling line drops the status's Attack Block Chance); "+X% Attack Speed while Dual Wielding" lines from
// other sources still apply (provisional, open question erika-twinblade-dual-wield-speed). The +X% additional Attack Damage is
// resolved by src/line-conditions.js (key dualWielding). Not a classifyWeaponAttackLine kind, so the line resolver keeps it.
export const NO_DUAL_WIELD_SPEED = /^No additional Attack Speed bonus is granted while Dual Wielding ?\. Instead, [+-]?\d+(?:\.\d+)?% additional Attack Damage$/i;

/**
 * Classify one build-wide line for the weapon-attack model.
 * @returns {null|{kind:string,value:number,additional?:boolean,type?:string,min?:number,max?:number,hands?:string}}
 */
export function classifyWeaponAttackLine(text) {
  const line = clean(text);
  if (!line) return null;
  let match;
  if ((match = line.match(ATTACK_SPEED))) return { kind: "attackSpeed", value: number(match[1]), additional: Boolean(match[2]) };
  if ((match = line.match(ATTACK_SPEED_DUAL))) return { kind: "attackSpeedDual", value: number(match[1]), additional: Boolean(match[2]) };
  if ((match = line.match(MAIN_HAND_SPEED))) return { kind: "mainHandSpeed", value: number(match[1]) };
  if ((match = line.match(CRIT_FLAT))) return { kind: "critFlat", value: number(match[1]) };
  if ((match = line.match(CRIT_MAIN_HAND))) return { kind: "critMainHand", value: number(match[1]) };
  if ((match = line.match(CRIT_TWO_HANDED))) return { kind: "critTwoHanded", value: number(match[1]) };
  if ((match = line.match(CRIT_ADDITIONAL))) return { kind: "critAdditional", value: number(match[1]) };
  if ((match = line.match(CRIT_PERCENT))) return /Spell Critical/i.test(line) && !/Attack and Spell/i.test(line) ? null : { kind: "critPercent", value: number(match[1]) };
  if ((match = line.match(ADDED_ATTACKS))) return { kind: "addedAttacks", type: match[3][0].toUpperCase() + match[3].slice(1).toLowerCase(), min: number(match[1]), max: number(match[2]), value: (number(match[1]) + number(match[2])) / 2 };
  if ((match = line.match(ADDED_MAIN_HAND))) return { kind: "addedMainHand", type: match[3][0].toUpperCase() + match[3].slice(1).toLowerCase(), min: number(match[1]), max: number(match[2]), value: (number(match[1]) + number(match[2])) / 2 };
  if ((match = line.match(TWO_HANDED_BASE))) return { kind: "twoHandedBase", value: number(match[1]) };
  if ((match = line.match(OFF_HAND_BASE))) return { kind: "offHandBase", value: number(match[1]) };
  if ((match = line.match(MAIN_HAND_DAMAGE))) return { kind: "mainHandDamage", value: number(match[1]), additional: true };
  if ((match = line.match(WEAPONS_DAMAGE))) return { kind: "weaponsDamage", value: number(match[1]), additional: true };
  if ((match = line.match(HELD_DAMAGE))) return { kind: "heldDamage", value: number(match[1]), additional: Boolean(match[2]), hands: match[3].toLowerCase() };
  if ((match = line.match(DUAL_DAMAGE))) return { kind: "dualDamage", value: number(match[1]), additional: Boolean(match[2]) };
  if ((match = line.match(OFF_HAND_SHARE))) return { kind: "offHandShare", value: number(match[1]) };
  if (OFF_HAND_NO_ATTACK.test(line)) return { kind: "offHandNoAttack", value: 0 };
  // Legendary audit batch 1 (2026-10-22): a weapon's Critical Strike Rating or Attack Speed fixed by another item (Death's Touch "The
  // Critical Strike Rating is fixed at 500 for the Weapon", Demons' Touch "Weapon Attack Speed is fixed at 1.35"): every held weapon's
  // own value (its base and local lines) is replaced; the build-wide lines still apply on top (provisional).
  if ((match = line.match(WEAPON_CRIT_FIXED))) return { kind: "weaponCritFixed", value: number(match[1]) };
  if ((match = line.match(WEAPON_SPEED_FIXED))) return { kind: "weaponSpeedFixed", value: number(match[1]) };
  return null;
}

const scale = (range, factor) => ({ min: range.min * factor, max: range.max * factor });
const addRange = (into, type, range) => { into[type] = { min: (into[type]?.min || 0) + range.min, max: (into[type]?.max || 0) + range.max }; };

/**
 * The build's weapon-attack state: the weapon(s) a Weapon Attack Damage hit uses, attack speed and attack crit.
 * @param {object} p
 * @param {object} p.equipment planner equipment (candidateItems with slot mainHand / secondaryHand)
 * @param {string[]} p.disabledSlots
 * @param {object[]} p.modifierTexts flattened build lines (planner.modifierTexts)
 * @param {"alternate"|"main-hand"} p.dualWieldMode which weapon(s) strike while dual wielding (provisional)
 */
export function calculateWeaponAttack({ equipment, disabledSlots = [], modifierTexts = [], dualWieldMode = "alternate" } = {}) {
  const items = (equipment?.candidateItems || []).filter((item) => !disabledSlots.includes(item.slot));
  // Fixed weapon values from other items (WEAPON_CRIT_FIXED / WEAPON_SPEED_FIXED): the lowest fixed value wins when several apply.
  const fixedOf = (kind) => { const values = modifierTexts.map((line) => classifyWeaponAttackLine(line.text)).filter((parsed) => parsed?.kind === kind).map((parsed) => parsed.value); return values.length ? Math.min(...values) : null; };
  const fixedCrit = fixedOf("weaponCritFixed"), fixedSpeed = fixedOf("weaponSpeedFixed");
  const fixWeapon = (weapon) => (weapon?.weapon && (fixedCrit != null || fixedSpeed != null) ? { ...weapon, ...(fixedCrit != null ? { critRating: fixedCrit, fixedCritRating: fixedCrit } : {}), ...(fixedSpeed != null ? { attackSpeed: fixedSpeed, fixedAttackSpeed: fixedSpeed } : {}) } : weapon);
  const mainHand = fixWeapon(readWeapon(items.find((item) => item.slot === "mainHand") || null));
  const offHand = fixWeapon(readWeapon(items.find((item) => item.slot === "secondaryHand") || null));
  const notes = [], warnings = [];
  const dualWielding = Boolean(mainHand?.weapon && offHand?.weapon && mainHand.hands === "one" && offHand.hands === "one");
  const twoHanded = mainHand?.hands === "two";

  // Build-wide lines.
  const lines = { attackSpeed: [], crit: [], added: [], additional: [], increased: [] };
  let twoHandedBasePercent = 0, offHandBasePercent = 0, offHandSharePercent = 0, mainHandSpeedPercent = 0, mainHandCritPercent = 0;
  const offHandNoAttackSources = [];
  const addedMainHand = {};
  for (const line of modifierTexts) {
    const parsed = classifyWeaponAttackLine(line.text);
    if (!parsed) continue;
    const value = parsed.value * (line.multiplier ?? 1);
    const entry = { source: line.source, text: line.text, origin: line.origin, value };
    switch (parsed.kind) {
      case "attackSpeed": lines.attackSpeed.push({ ...entry, additional: parsed.additional }); break;
      case "attackSpeedDual": if (dualWielding) lines.attackSpeed.push({ ...entry, additional: parsed.additional, condition: "while Dual Wielding" }); break;
      case "mainHandSpeed": mainHandSpeedPercent += value; break;
      case "critFlat": lines.crit.push({ ...entry, layer: "flat" }); break;
      case "critPercent": lines.crit.push({ ...entry, layer: "increased" }); break;
      case "critAdditional": lines.crit.push({ ...entry, layer: "additional" }); break;
      case "critMainHand": mainHandCritPercent += value; break;
      case "critTwoHanded": if (twoHanded) lines.crit.push({ ...entry, layer: "increased", condition: "holding a Two-Handed Weapon" }); break;
      case "addedAttacks": lines.added.push({ ...entry, type: parsed.type, min: parsed.min * (line.multiplier ?? 1), max: parsed.max * (line.multiplier ?? 1) }); break;
      case "addedMainHand": addRange(addedMainHand, parsed.type, { min: parsed.min * (line.multiplier ?? 1), max: parsed.max * (line.multiplier ?? 1) }); break;
      case "twoHandedBase": twoHandedBasePercent += value; break;
      case "offHandBase": offHandBasePercent += value; break;
      // `hand: "main"`: in alternate dual wielding only the main-hand swings take it (src/skill-hit-model.js per-hand rolls).
      case "mainHandDamage": lines.additional.push({ ...entry, category: "Additional damage", condition: "Main-Hand Weapon attacks", hand: "main" }); break;
      case "weaponsDamage": lines.additional.push({ ...entry, category: "Additional damage", condition: "Weapon attacks (read as all Weapon Attack Damage; provisional, talent batch Q13)", provisional: true }); break;
      case "heldDamage": if ((parsed.hands === "two") === twoHanded && mainHand?.weapon) (parsed.additional ? lines.additional : lines.increased).push({ ...entry, category: parsed.additional ? "Additional damage" : "Increased damage", condition: `holding a ${parsed.hands === "two" ? "Two" : "One"}-Handed Weapon` }); break;
      case "dualDamage": if (dualWielding) (parsed.additional ? lines.additional : lines.increased).push({ ...entry, category: parsed.additional ? "Additional damage" : "Increased damage", condition: "while Dual Wielding" }); break;
      case "offHandShare": offHandSharePercent += value; break;
      case "offHandNoAttack": offHandNoAttackSources.push(entry); break;
      default: break;
    }
  }

  // Per-weapon damage with handedness layers: Two-Handed base bonus on a two-hander, Off-Hand base bonus on the
  // off-hand weapon, "Adds … to the Main-Hand Weapon" on the main hand only.
  const weaponDamage = (weapon, role) => {
    if (!weapon?.weapon) return {};
    const out = {};
    for (const [type, range] of Object.entries(weapon.damage)) out[type] = { ...range };
    if (role === "main") for (const [type, range] of Object.entries(addedMainHand)) addRange(out, type, range);
    const factor = (weapon.hands === "two" ? 1 + twoHandedBasePercent / 100 : 1) * (role === "off" ? 1 + offHandBasePercent / 100 : 1);
    for (const type of Object.keys(out)) out[type] = scale(out[type], factor);
    return out;
  };
  const mainDamage = weaponDamage(mainHand, "main");
  const offDamage = weaponDamage(offHand, "off");
  // Off-hand share (legendary affix): X% of the off-hand weapon's damage joins the main-hand weapon's hits.
  if (offHandSharePercent && dualWielding) for (const [type, range] of Object.entries(offDamage)) addRange(mainDamage, type, scale(range, offHandSharePercent / 100));

  // Joined Force (2026-10-14): while dual wielding, the off-hand weapon does not attack, so every attack is a main-hand attack
  // (main-hand damage, speed and crit rating); the build stays dual wielding (the Dual Wielding status and "while Dual Wielding"
  // lines keep applying). The 60% share above joins the main-hand weapon's own damage (with the off-hand weapon's local affixes
  // and Off-Hand base bonus) before the skill's Weapon Attack Damage % and every build-wide layer, so those layers scale it like
  // main-hand damage. User-supplied reading (a Google AI Mode answer the user pasted, 2026-10-14; not an in-game test): the
  // 60% is of the off-hand's local base weapon damage (its own flat ranges after its own local modifiers and the Off-Hand
  // base bonus), added to the main hand's base damage before global multipliers; attack speed and crit come from the main
  // hand's local properties only (the off-hand's are dead stats); the Dual Wielding status still applies.
  const joinedForce = dualWielding && offHandNoAttackSources.length > 0 && Boolean(mainHand?.weapon);
  // The damage one Weapon Attack Damage hit scales from.
  let damageByType = {}, mode = "main-hand";
  if (joinedForce) {
    damageByType = mainDamage;
    mode = "main-hand-only";
    notes.push(`Dual wielding ${mainHand.type} + ${offHand.type} with "Off-Hand Weapons do not participate in Attacks while Dual Wielding" (${offHandNoAttackSources.map((line) => line.source).join(", ")}): every attack uses the main-hand weapon${offHandSharePercent ? ` plus ${offHandSharePercent}% of the off-hand weapon's damage, added to the main-hand weapon's damage before the skill's Weapon Attack Damage % and the build's multipliers (user-supplied reading, 2026-10-14)` : ""}; still dual wielding.`);
  } else if (mainHand?.weapon && dualWielding && dualWieldMode === "alternate") {
    mode = "alternate";
    const types = new Set([...Object.keys(mainDamage), ...Object.keys(offDamage)]);
    for (const type of types) damageByType[type] = { min: ((mainDamage[type]?.min || 0) + (offDamage[type]?.min || 0)) / 2, max: ((mainDamage[type]?.max || 0) + (offDamage[type]?.max || 0)) / 2 };
    notes.push(`Dual wielding ${mainHand.type} + ${offHand.type}: attacks alternate hands, so half the swings use the main-hand weapon's damage and crit and half the off-hand weapon's (user-confirmed 2026-10-14: each swing uses its own hand's local crit, speed and damage; the two weapons' crit is not averaged); the attack interval alternates ("main-hand" mode uses the main hand only).`);
  } else if (mainHand?.weapon) {
    damageByType = mainDamage;
    if (dualWielding) notes.push(`Dual wielding ${mainHand.type} + ${offHand.type}: main-hand mode, the off-hand weapon only grants the Dual Wielding status (provisional).`);
  } else if (offHand?.weapon) {
    damageByType = offDamage; mode = "off-hand";
    warnings.push("Only the secondary hand holds a weapon; its damage is used for Weapon Attack Damage (provisional).");
  }
  const unarmed = !mainHand?.weapon && !offHand?.weapon;
  if (unarmed) warnings.push("No weapon is equipped: Weapon Attack Damage skills have no published unarmed base, so their hits compute to 0 until one is sourced.");
  else if (!Object.keys(damageByType).length) warnings.push(`${mainHand?.name || offHand?.name}: no "X - Y <Type> Damage" weapon line found, so Weapon Attack Damage is 0 (a spell weapon carries "Adds … to Spells" instead).`);

  // Attack speed: weapon attacks per second (alternating hands: 2 ÷ (1/a + 1/b)) × (1 + Σ increased) × Π additional,
  // the main hand's own "+X% Main-Hand Weapon Attack Speed", and the Dual Wielding status's +10% additional.
  const mainSpeed = mainHand?.attackSpeed != null ? mainHand.attackSpeed * (1 + mainHandSpeedPercent / 100) : null;
  const offSpeed = offHand?.attackSpeed ?? null;
  const weaponAttacksPerSecond = mode === "alternate" && mainSpeed && offSpeed ? 2 / (1 / mainSpeed + 1 / offSpeed) : mode === "off-hand" ? offSpeed : mainSpeed;
  const noDualWieldSpeed = modifierTexts.filter((line) => NO_DUAL_WIELD_SPEED.test(clean(line.text)));
  if (dualWielding && !noDualWieldSpeed.length) lines.attackSpeed.push({ source: "Dual Wielding status", text: `+${DUAL_WIELD_STATUS.additionalAttackSpeedPercent}% additional Attack Speed while Dual Wielding`, origin: "derived", value: DUAL_WIELD_STATUS.additionalAttackSpeedPercent, additional: true });
  if (dualWielding && noDualWieldSpeed.length) notes.push(`Dual Wielding status: its +${DUAL_WIELD_STATUS.additionalAttackSpeedPercent}% additional Attack Speed is not granted (${noDualWieldSpeed.map((line) => line.source).join(", ")}: "No additional Attack Speed bonus is granted while Dual Wielding"; provisional reading).`);
  const increasedSpeedPercent = lines.attackSpeed.filter((line) => !line.additional).reduce((sum, line) => sum + line.value, 0);
  const additionalSpeedFactor = lines.attackSpeed.filter((line) => line.additional).reduce((factor, line) => factor * (1 + line.value / 100), 1);
  const attacksPerSecondAtOneSecond = (weaponAttacksPerSecond || 0) * Math.max(0, 1 + increasedSpeedPercent / 100) * additionalSpeedFactor;
  const attackSpeed = {
    weaponAttacksPerSecond: weaponAttacksPerSecond || 0, mainHandAttackSpeed: mainSpeed, offHandAttackSpeed: offSpeed, mainHandSpeedPercent,
    increasedPercent: increasedSpeedPercent, additionalFactor: additionalSpeedFactor, sources: lines.attackSpeed,
    // Multiplier on a skill's uses per second at its base attack time (1 s for the attack channels): factor = attacks/s.
    factor: attacksPerSecondAtOneSecond,
    note: "weapon Attack Speed read as attacks per second at a 1 s base attack time (hypothesis; in-game check pending)"
  };
  if (!weaponAttacksPerSecond && !unarmed) warnings.push("The equipped weapon has no \"N Attack Speed\" line, so the attack rate is 0.");

  // Attack crit: weapon rating × (1 + increased) + flat, 100 rating per chance point.
  const weaponRating = mode === "alternate" && mainHand?.critRating != null && offHand?.critRating != null ? (mainHand.critRating * (1 + mainHandCritPercent / 100) + offHand.critRating) / 2 : mode === "off-hand" ? offHand?.critRating || 0 : (mainHand?.critRating || 0) * (1 + mainHandCritPercent / 100);
  const flatRating = lines.crit.filter((line) => line.layer === "flat").reduce((sum, line) => sum + line.value, 0);
  const increasedRatingPercent = lines.crit.filter((line) => line.layer === "increased").reduce((sum, line) => sum + line.value, 0);
  const additionalRatingFactor = lines.crit.filter((line) => line.layer === "additional").reduce((product, line) => product * Math.max(0, 1 + line.value / 100), 1);
  const rating = Math.max(0, (weaponRating + flatRating) * Math.max(0, 1 + increasedRatingPercent / 100) * additionalRatingFactor);
  const crit = { weaponRating, flatRating, increasedRatingPercent, additionalRatingFactor, rating, chancePercent: Math.min(100, rating / 100), sources: lines.crit, rule: "100 Critical Strike Rating = 1% chance (the spell crit model's observed rule); increased Attack Critical Strike Rating multiplies weapon + flat rating" };
  // Alternate dual wielding (user-confirmed 2026-10-14): each swing uses its own hand's local damage, crit rating and speed;
  // the game does not average the two weapons' crit. Each hand makes half the swings (the alternating harmonic rate above).
  // `hands` carries the per-hand inputs; `crit.hands` each hand's rating with the build-wide flat and increased lines, and
  // the swing-average chance (each hand capped on its own) replaces the averaged-rating chance.
  let hands = null;
  if (mode === "alternate") {
    const handRating = (weaponRatingValue) => Math.max(0, (weaponRatingValue + flatRating) * Math.max(0, 1 + increasedRatingPercent / 100) * additionalRatingFactor);
    hands = [
      { hand: "main", name: mainHand.name, type: mainHand.type, share: 0.5, damageByType: mainDamage, critRating: (mainHand.critRating || 0) * (1 + mainHandCritPercent / 100), attackSpeed: mainSpeed },
      { hand: "off", name: offHand.name, type: offHand.type, share: 0.5, damageByType: offDamage, critRating: offHand.critRating || 0, attackSpeed: offSpeed }
    ];
    crit.hands = hands.map((hand) => { const handRatingValue = handRating(hand.critRating); return { hand: hand.hand, share: hand.share, weaponRating: hand.critRating, flatRating, increasedRatingPercent, rating: handRatingValue, chancePercent: Math.min(100, handRatingValue / 100) }; });
    crit.chancePercent = crit.hands.reduce((total, hand) => total + hand.share * hand.chancePercent, 0);
  }

  return {
    mainHand, offHand, dualWielding, dualWieldMode: mode, twoHanded, unarmed,
    dualWieldStatus: dualWielding ? DUAL_WIELD_STATUS : null,
    damageByType, damageTypes: Object.keys(damageByType), hands,
    twoHandedBasePercent, offHandBasePercent, offHandSharePercent,
    joinedForce: joinedForce ? { sources: offHandNoAttackSources, offHandSharePercent, mainHandAttacksPerSecond: mainSpeed, reading: "off-hand share = % of the off-hand's local base damage, added to the main hand's base before global multipliers; main-hand speed and crit only; Dual Wielding status kept", source: "user-supplied (Google AI Mode answer, 2026-10-14; not an in-game test)" } : null,
    addedToAttacks: lines.added, additional: lines.additional, increased: lines.increased,
    attackSpeed, crit, notes, warnings,
    sources: {
      bases: "TLIDB equipment tables (src/data/gear/rare-base-items-ss13.generated.js)",
      local: "game attribute ids per research/coverage-census-2026-10-11.md (Gear Physical Damage attr 5002, gear Attack Speed attr 6001, Attack Critical Strike Rating for this gear attr 4802)",
      dualWield: DUAL_WIELD_STATUS.source
    }
  };
}
