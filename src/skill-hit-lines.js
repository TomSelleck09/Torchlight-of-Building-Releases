import { normalizePercentageText } from "./percentage-text.js";
import { classifyDamageLine } from "./damage-line-classifier.js";
import { dummyTarget, dummyTargetWord } from "./dummy-target.js";
import { gameDamageLayer } from "./affix-bucket.js";
import { enemyBuffSet } from "./unit-buff-set.js";

// Modifier-line reader for the generic spell-hit engine (src/skill-hit-model.js).
// Plain "+X% [additional] <scope> Damage" and "+X% <type> [Resistance] Penetration" templates go through
// the shared classifier (src/damage-line-classifier.js: scope tokens and the hit / DoT flow rules from the
// game's attribute model). This module adds what a hit also needs and the shared classifier does not parse:
//   - a trailing condition the dummy profile settles ("against Elites / Bosses": src/dummy-target.js) or
//     the planner passes ("against Cursed enemies"); other conditional lines stay out;
//   - enemy damage taken ("+X% additional <Type> Damage taken"), "+X% additional [<scope>] Max Damage",
//     "Adds X–Y <Type> Damage to Spells", "+X% [additional] [Attack and] Cast Speed" and
//     "+X% [additional] Cooldown Recovery Speed".
// Results keep one shape: { kind, value, scope: { damageTypes, skillTags, hitOnly }, condition }.

const NUM = "([+-]?\\d+(?:\\.\\d+)?)";
const number = (text) => Number(String(text).replace("−", "-"));
export const DAMAGE_TYPES = Object.freeze(["Physical", "Fire", "Cold", "Lightning", "Erosion"]);
export const ELEMENTAL_TYPES = Object.freeze(["Fire", "Cold", "Lightning"]);

// "damage to Elites / Bosses" (Ethereal Prism Crushing Blast; core audit batch B1) is the same condition as "against".
const CONDITION_SUFFIX = /^(.*?[Dd]amage) (?:against|vs\.?|to(?= (?:Elites?|Bosses?)$)) (.+)$/;
const TAKEN_LINE = new RegExp(`^${NUM}% (additional )?(.*?)[Dd]amage taken$`);
// The scope may stand before or after the word ("Spell Max Damage", "Max Physical Damage": Impermanence's wording).
const MAX_DAMAGE_LINE = new RegExp(`^${NUM}% additional (.*?)Max (.*?)Damage$`, "i");
// "+X% additional [<scope>] Min Damage" (Impermanence, 2026-10-14): scales the lower roll only, like Max Damage the upper.
const MIN_DAMAGE_LINE = new RegExp(`^${NUM}% additional (.*?)Min (.*?)Damage$`, "i");
// A compound min / max line ("-90% additional Min Physical Damage, and +80% additional Max Physical Damage", Impermanence).
const MIN_MAX_COMPOUND = new RegExp(`^(${NUM}% additional (?:[A-Za-z]+ )*?M(?:in|ax) (?:[A-Za-z]+ )*?Damage),? and (${NUM}% additional (?:[A-Za-z]+ )*?M(?:in|ax) (?:[A-Za-z]+ )*?Damage)$`, "i");

/** One modifier text as the hit lines it holds: a compound Min / Max Damage line splits in two; anything else is itself. */
export function splitHitLineText(text) {
  const clean = normalizePercentageText(String(text || "")).replace(/\s+/g, " ").trim();
  const match = clean.match(MIN_MAX_COMPOUND);
  return match ? [match[1], match[3]] : [text];
}

const ADDED_LINE = /^Adds\s+(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s+(Physical|Fire|Cold|Lightning|Erosion) Damage(?:\s+to\s+(Spells|Attacks|Attacks and Spells|your Attacks and Spells|your and your Minions['’] Attacks and Spells|Minions|the gear))?$/i;
const CAST_SPEED_LINE = new RegExp(`^${NUM}% (additional )?(?:Attack and )?Cast Speed$`, "i");
const COOLDOWN_LINE = new RegExp(`^${NUM}% (additional )?Cooldown Recovery Speed$`, "i");

// The shared classifier's scope (damageTypes / skillTags / flow / ailments / minion) as a hit scope, or null
// when the line cannot reach a hit (DoT flow, ailment-tagged, minion-only).
function hitScope(parsed) {
  if (!parsed || parsed.minion || parsed.flow === "dot" || parsed.ailments) return null;
  return { damageTypes: parsed.damageTypes ? new Set(parsed.damageTypes) : null, skillTags: parsed.skillTags ? new Set(parsed.skillTags) : null, hitOnly: parsed.flow === "hit" };
}

// A scope phrase ("Spell", "additional Physical") parsed through the shared classifier by wrapping it in a
// damage line, so the two readers agree on the tokens.
function scopeOf(phrase) {
  return hitScope(classifyDamageLine(`+1% ${phrase ? `${phrase.trim()} ` : ""}Damage`));
}

// Enemy states a "damage against <State> enemies" line names → the enemy-ailment model's names (src/enemy-ailments.js
// ailmentStateNames; kept here to avoid an import cycle through src/combat-states.js).
const ENEMY_STATE_AILMENTS = Object.freeze({ Ignited: "Ignite", Traumatized: "Trauma", Withered: "Wilt", Wilted: "Wilt", Frostbitten: "Frostbite", Numbed: "Numbed", Frozen: "Frozen" });
const hasEnemyAilment = (enemyAilments, name) => typeof enemyAilments?.has === "function" ? Boolean(enemyAilments.has(name)) : (enemyAilments?.types || []).some((type) => type?.name === name);
// Ignited / Traumatized and the Ailment group from the dummy's unit buff set (src/unit-buff-set.js, W8 step 1); null with TLI_BUFF_SET=off.
const setHolds = (enemyAilments, name) => { const buffs = name === "Ignite" || name === "Trauma" ? enemyBuffSet(enemyAilments) : null; return buffs ? buffs.holds(name) : hasEnemyAilment(enemyAilments, name); };

// "against Elites" / "against Bosses" hold on the dummy (Boss, so also Elite); "against Cursed enemies"
// holds when the planner says the target is cursed. "against <State> enemies" (Frozen, Frostbitten, Ignited, Numbed, …) and
// "against enemies affected by Ailments" hold when the enemy-ailment model puts that state on the dummy (`enemyAilments`,
// src/enemy-ailments.js), the rule src/build-mechanics.js already applies to the beam and Ignite ledgers. Before 2026-10-18
// the generic skill hits left these lines out while their badge read In calc (Prophet's "+10% additional damage against
// Frozen enemies" on Homing Frost Bolt). Only the plain "+X% [additional] damage against …" body is settled here: a scoped or
// typed body ("+X% Cold Damage against Frostbitten enemies") resolves through src/line-effects.js (key enemyState), which
// leaves the plain shape to src/build-mechanics.js (MECHANICS_TARGET) — reading it here as well would count it twice.
// Anything else is a condition this module does not settle.
function parseCondition(text, { targetCursed = false, enemyAilments = null, genericBody = false } = {}) {
  if (!text) return { ok: true, condition: null };
  const target = text.match(/^(Elites?|Bosses?|Boss)$/i);
  if (target) { const flag = dummyTargetWord(target[1]); return flag && dummyTarget[flag] ? { ok: true, condition: `against ${target[1]} (dummy counts as a Boss and an Elite)` } : { ok: false }; }
  if (/^Cursed enemies$/i.test(text)) return targetCursed ? { ok: true, condition: "against Cursed enemies (curse on the dummy)" } : { ok: false };
  if (!genericBody) return { ok: false };
  const state = text.match(/^(\w+) enemies$/);
  if (state && ENEMY_STATE_AILMENTS[state[1]]) return setHolds(enemyAilments, ENEMY_STATE_AILMENTS[state[1]]) ? { ok: true, condition: `against ${state[1]} enemies (enemy-ailment model: the dummy is ${state[1]})` } : { ok: false };
  if (/^enemies affected by Ailments$/i.test(text)) return (enemyBuffSet(enemyAilments)?.count() ?? enemyAilments?.count ?? 0) > 0 ? { ok: true, condition: "against enemies affected by Ailments (enemy-ailment model)" } : { ok: false };
  return { ok: false };
}

/**
 * Classify one modifier text for a spell hit.
 * @returns {null|{kind:"damage",layer,value,scope,condition}|{kind:"maxDamage",value,scope}|{kind:"minDamage",value,scope}|{kind:"taken",layer,value,scope}|{kind:"penetration",value,damageTypes}|{kind:"armourPenetration",value}|{kind:"added",min,max,type,to}|{kind:"castSpeed",value,additional}|{kind:"cooldownRecovery",value,additional}}
 */
export function classifyHitLine(text, options = {}) {
  const clean = normalizePercentageText(String(text || "")).replace(/\s+/g, " ").trim();
  if (!clean) return null;
  let match = clean.match(ADDED_LINE);
  if (match) {
    const to = (match[4] || "").toLowerCase();
    return { kind: "added", min: number(match[1]), max: number(match[2]), type: match[3][0].toUpperCase() + match[3].slice(1).toLowerCase(), to: /spells/.test(to) ? "spells" : to ? "other" : "unspecified" };
  }
  // A "… Damage taken by nearby enemies" kismet line never gets here: src/line-conditions.js settles Mighty Arrow's as your own Attack Horizontal Projectile Damage within 6 m
  // (chunk 13, game row 100350834). The plain / typed "… taken by Nearby enemies" lines are src/combat-states.js debuffs (takenNearby / takenWithin).
  match = clean.match(TAKEN_LINE);
  if (match) { const scope = scopeOf(match[3]); return scope ? { kind: "taken", layer: gameDamageLayer(text) ?? (match[2] ? "additional" : "increased"), value: number(match[1]), scope } : null; }
  match = clean.match(MAX_DAMAGE_LINE);
  if (match) { const scope = scopeOf(`${match[2]}${match[3]}`); return scope ? { kind: "maxDamage", value: number(match[1]), scope } : null; }
  match = clean.match(MIN_DAMAGE_LINE);
  if (match) { const scope = scopeOf(`${match[2]}${match[3]}`); return scope ? { kind: "minDamage", value: number(match[1]), scope } : null; }
  match = clean.match(CAST_SPEED_LINE);
  if (match) return { kind: "castSpeed", value: number(match[1]), additional: (gameDamageLayer(text) ?? (match[2] ? "additional" : "increased")) === "additional" };
  match = clean.match(COOLDOWN_LINE);
  if (match) return { kind: "cooldownRecovery", value: number(match[1]), additional: (gameDamageLayer(text) ?? (match[2] ? "additional" : "increased")) === "additional" };
  // Plain damage / penetration, with an optional settled condition.
  const conditional = clean.match(CONDITION_SUFFIX);
  const condition = parseCondition(conditional?.[2], { ...options, genericBody: /^\+?\d+(?:\.\d+)?% (?:additional )?damage$/i.test(conditional?.[1] || "") });
  if (!condition.ok) return null;
  const parsed = classifyDamageLine(conditional ? conditional[1] : clean);
  if (!parsed) return null;
  if (parsed.kind === "penetration") return conditional || parsed.minion ? null : { kind: "penetration", value: parsed.value, damageTypes: new Set(parsed.damageTypes) };
  if (parsed.kind === "armourPenetration") return conditional || parsed.minion ? null : { kind: "armourPenetration", value: parsed.value, ...(parsed.skillTags ? { skillTags: new Set(parsed.skillTags) } : {}) };
  const scope = hitScope(parsed);
  // The full line (condition included) is the game shape; src/affix-bucket.js applies its bucket where listed (2026-10-17 game bucket code).
  return scope ? { kind: "damage", layer: gameDamageLayer(text) ?? parsed.layer, value: parsed.value, scope, condition: condition.condition } : null;
}

/**
 * Does a scoped line reach a damage component dealt as one of `damageTypes` by a skill with `skillTags`?
 * (A converted component counts as both its original and its final type: provisional.)
 */
export function scopeApplies(scope, { damageTypes = [], skillTags = new Set() } = {}) {
  if (!scope) return false;
  if (scope.damageTypes && !damageTypes.some((type) => scope.damageTypes.has(type))) return false;
  if (scope.skillTags && ![...scope.skillTags].every((tag) => skillTags.has(tag))) return false;
  return true;
}

/** A readable name for the scope ("Spell", "Lightning", "generic"). */
export function scopeLabel(scope) {
  if (!scope) return "";
  const types = scope.damageTypes ? (scope.damageTypes.size === 3 && ELEMENTAL_TYPES.every((type) => scope.damageTypes.has(type)) ? ["Elemental"] : [...scope.damageTypes]) : [];
  const parts = [...types, ...(scope.skillTags ? [...scope.skillTags] : []), ...(scope.hitOnly ? ["Hit"] : [])];
  return parts.length ? parts.join(" ") : "generic";
}
