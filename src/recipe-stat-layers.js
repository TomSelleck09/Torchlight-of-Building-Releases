// Character stat sheet from the game recipes (recipe interpreter step 5, user goal 2026-10-25 "everything in the calc"; research/
// recipe-interpreter-step1-2026-10-25.md §17). src/character-stats.js totals every plain stat line by stat and bucket; this module
// reads the same line from its affix recipe (src/recipe-interpreter.js, with the line's game record where the planner has one, §13)
// and turns each unconditional write on the player into the sheet's (stat, bucket, value) contributions:
//   attributes 1 / 2 / 3, Max Life 1001, Max Mana 1301, Max Energy Shield 1601, Armor 4001, Evasion 4002 (gear-local node 363 →
//   gearFlat / gearIncreased), resistances 5101-5103 / 5401 / 5741 (Elemental → each element) and max resistances, Attack / Cast Speed
//   6001 / 6002, crit rating 4802 and damage 4803 (Attack 6001090 / Spell 6001100 scopes), item-base Attack Speed / crit rating (node
//   364 → weapon base), Affliction per second (field 2006467), Affliction effect 5724, the status effects 3401 by tag (Aura 5100305,
//   Curse 5100301, Blur 5100205, Focus Buff 5100306), Movement Speed 4, Reaping Duration 6008 (an ailment tag → that ailment's) and
//   Recovery Speed 6009, Skill Area 6201, Skill Cost 6221, Cooldown Recovery 6007, Projectile Speed 6005, Spell Burst Charge Speed
//   6360, Sealed Mana Compensation 1304, Energy Shield charge 1602 / 1604, Life Regeneration Speed 1002, block 4800 / 4801 and fields
//   2006460 / 2006471, Injury Buffer 2006660, damage avoidance 2006330, Elemental Ailment avoidance 2006592, Regain 2010220 / 2010230
//   and intervals 1320 / 1610, skill levels 2006400 (tags → "<Tag> Skill Level"), your own damage taken 5720 / 5003 / 51xx, Max
//   Blessing stacks 3442 (Focus 5100210, Agility 5100209, Tenacity 5100208).
// Any other unscoped, unconditional write on the player that is not a damage layer becomes a game stat of its own ("game:<concept>",
// labelled with its config_attributes / config_char_field name): the "sum all stats" rule (every stat line totals, damage effect or
// not). A write with a condition, trigger, skill-tag scope (other than the crit / skill-level scopes above) or another target is not a
// panel stat and stays out, as the text reader keeps conditional lines out.
//
// Percent stats: the sheet sums a % stat's flat and increased lines (character-stats finalize), and the text reader files "+X% Fire
// Resistance" as increased while the recipe writes mod 1; both count the same, so the comparison treats them as one "sum" bucket and
// a recipe reading keeps the text reader's bucket name for them.
import { affixRecipesLoaded, interpretLine, loadAffixRecipes, tagName } from "./recipe-interpreter.js";

try { await loadAffixRecipes(); } catch { /* the text readers stay */ }

const STATUS = { 5100305: "auraEffect", 5100301: "curseEffect", 5100205: "blurEffect", 5100306: "focusBuffEffect" };
const BLESSING = { 5100210: "maxFocusBlessingStacks", 5100209: "maxAgilityBlessingStacks", 5100208: "maxTenacityBlessingStacks" };
const AILMENT = { 5100003: "Ignite", 5100006: "Trauma", 5100007: "Wilt", 5100008: "Frostbite", 5100009: "Numbed" };
const ATTACK = 6001090, SPELL = 6001100;
// Incoming damage scopes of your own damage taken (tagIds.others): Spell / Attack skills, Ailments 5100001.
const INCOMING = { 6001100: "Spell", 6001090: "Attack", 5100001: "Ailment" };
const TYPE = { fire: "Fire", cold: "Cold", lightning: "Lightning", erosion: "Erosion", physical: "Physical", elemental: "Elemental", all: "All", dot: "Damage Over Time" };
// Damage layers and other concepts the damage ledgers own: never a sheet stat of their own.
const DAMAGE_CONCEPTS = new Set(["damage", "maxDamage", "minDamage", "penetration", "conversion", "addedAs", "ailmentDamageAtApplication", "baseAilment", "damageEnhancement", "damageToLife", "armorPenetration", "doubleDamageChance", "ailmentChance", "extraIgniteLayers", "activeStackLimit", "ailmentDuration", "statusDuration", "afflictionPerSecond"]);
const PERCENT = (bucket) => bucket === "increased" || bucket === "additional";
const sheetBucket = (bucket) => (bucket === "additional" ? "additional" : "increased");
const tags = (effect) => effect.tagIds?.mine ?? [];
const onlyTags = (effect, allowed) => tags(effect).every((tag) => allowed.has(tag));
const scopeKey = (effect, base) => {
  const list = tags(effect);
  if (!list.length || (list.includes(ATTACK) && list.includes(SPELL) && list.length === 2)) return base;
  if (list.length === 1 && list[0] === ATTACK) return `attack${base[0].toUpperCase()}${base.slice(1)}`;
  if (list.length === 1 && list[0] === SPELL) return `spell${base[0].toUpperCase()}${base.slice(1)}`;
  return null;
};

// Game-only stat labels and units ("game:<concept>"), filled as lines are read (character-stats describeStat reads them).
const GAME_STATS = new Map();
export const gameStatInfo = (key) => GAME_STATS.get(key) ?? null;

/** The sheet's contributions for one recipe effect: [{ stat, bucket, value }], [] when it is not a panel stat. */
// A game stat's label: the line's wording without its leading number ("+5 to Max Frostbite Rating" → "Max Frostbite Rating"; a number
// inside the wording becomes "X": "Multistrikes deal X% increasing damage"), else the attribute's config_attributes name.
function gameStatLabel(lineText, effect) {
  const words = String(lineText || "").replace(/−/g, "-").replace(/^[+-]?\d+(?:\.\d+)?%?\s*(?:to\s+)?/, "").replace(/[+-]?\d+(?:\.\d+)?/g, "X").replace(/\.$/, "").replace(/\s*\+?X$/, "").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : effect.name || effect.concept;
}
export function effectStatContributions(effect, { percentLine = false, lineText = "" } = {}) {
  if (effect.target !== "self" || (effect.conditions || []).length || effect.understood === false || !Number.isFinite(effect.value)) return [];
  const c = (stat, bucket) => [{ stat, bucket, value: effect.value }];
  const b = effect.bucket;
  const list = tags(effect);
  switch (effect.concept) {
    case "strength": case "dexterity": case "intelligence": case "maxLife": case "maxMana": case "maxEnergyShield":
      if (list.length) return [];
      if (effect.local === "gear" && effect.concept === "maxEnergyShield") return c("maxEnergyShield", b === "flat" ? "gearFlat" : "gearIncreased");
      return c(effect.concept, b === "flat" ? "flat" : b);
    case "armor": case "evasion":
      if (list.length) return [];
      if (effect.local === "gear") return c(effect.concept, b === "flat" ? "gearFlat" : "gearIncreased");
      return c(effect.concept, b === "flat" ? "flat" : b);
    case "resistance": case "maxResistance": {
      if (list.length) return [];
      const types = effect.type === "elemental" ? ["Fire", "Cold", "Lightning"] : TYPE[effect.type] ? [TYPE[effect.type]] : [];
      return types.map((type) => ({ stat: effect.concept === "resistance" ? `${type.toLowerCase()}Resistance` : `max${type}Resistance`, bucket: sheetBucket(b), value: effect.value }));
    }
    case "attackSpeed": case "castSpeed":
      if (effect.local === "itemBase" && effect.concept === "attackSpeed") return c("weaponAttackSpeed", "base");
      // "+X% gear Attack Speed" (node 363) is the weapon's own: the weapon model reads it, not the sheet.
      return list.length || effect.local ? [] : c(effect.concept, sheetBucket(b));
    case "critRating": {
      if (effect.local === "itemBase") return c("weaponCriticalStrikeRating", "base");
      if (effect.local) return [];
      const key = scopeKey(effect, "criticalStrikeRating");
      return key ? c(key, b === "flat" ? "flat" : b) : [];
    }
    case "critDamage": { if (effect.local) return []; const key = scopeKey(effect, "criticalStrikeDamage"); return key ? c(key, sheetBucket(b)) : []; }
    case "afflictionEffect": return list.length ? [] : c("afflictionEffect", sheetBucket(b));
    case "afflictionPerSecond": return list.length ? [] : c("afflictionPerSecond", "flat");
    case "statusEffect": return list.length === 1 && STATUS[list[0]] ? c(STATUS[list[0]], sheetBucket(b)) : [];
    case "movementSpeed": return list.length ? [] : c("movementSpeed", sheetBucket(b));
    case "reapingDuration": {
      if (!list.length) return c("reapingDuration", sheetBucket(b));
      return list.length === 1 && AILMENT[list[0]] ? c(`reapingDuration:${AILMENT[list[0]]}`, sheetBucket(b)) : [];
    }
    case "reapingRecoverySpeed": return list.length ? [] : c("reapingRecoverySpeed", sheetBucket(b));
    case "skillArea": return list.length ? [] : c("skillArea", sheetBucket(b));
    case "skillCost": { if (b !== "flat") return []; if (!list.length) return c("skillCost", "flat"); return list.length === 1 && list[0] === ATTACK ? c("attackSkillCost", "flat") : []; }
    case "cooldownRecoverySpeed": return list.length ? [] : c("cooldownRecoverySpeed", sheetBucket(b));
    case "projectileSpeed": return list.length ? [] : c("projectileSpeed", sheetBucket(b));
    case "spellBurstChargeSpeed": return list.length ? [] : c("spellBurstChargeSpeed", sheetBucket(b));
    case "sealedManaCompensation": return list.length ? [] : c("sealedManaCompensation", sheetBucket(b));
    case "energyShieldChargeSpeed": return list.length ? [] : c("energyShieldChargeSpeed", sheetBucket(b));
    case "energyShieldChargeInterval": return list.length ? [] : c("energyShieldChargeInterval", "additional");
    case "lifeRegenerationSpeed": return list.length ? [] : c("lifeRegenerationSpeed", sheetBucket(b));
    case "attackBlockChance": return list.length ? [] : c("attackBlockChance", sheetBucket(b));
    case "spellBlockChance": return list.length ? [] : c("spellBlockChance", sheetBucket(b));
    case "blockRatio": return list.length ? [] : c("blockRatio", "increased");
    case "blockRatioLimit": return list.length ? [] : c("blockRatioUpperLimit", "increased");
    // Field 2006660 stores a fraction ("+12% Injury Buffer" writes 0.12; §5.4 unit scale).
    case "injuryBuffer": return list.length ? [] : [{ stat: "injuryBuffer", bucket: "increased", value: Math.round(effect.value * 100 * 1e6) / 1e6 }];
    case "damageAvoidance": return list.length ? [] : c("damageAvoidance", "increased");
    case "elementalAilmentAvoidance": return list.length ? [] : c("elementalAilmentAvoidance", "increased");
    case "lifeRegain": return list.length ? [] : c("lifeRegain", "increased");
    case "shieldRegain": return list.length ? [] : c("energyShieldRegain", "increased");
    case "lifeRegainInterval": return list.length ? [] : c("lifeRegainInterval", "additional");
    case "shieldRegainInterval": return list.length ? [] : c("energyShieldRegainInterval", "additional");
    case "skillLevel": {
      if (!list.length) return c("skillLevel:All", "flat");
      const names = list.map((tag) => tagName(tag)).filter((name) => name && !/\(\d+\)$/.test(name));
      return names.length === list.length ? c(`skillLevel:${names.join(" ")}`, "flat") : [];
    }
    case "damageTaken": {
      // Your own damage taken; the incoming damage's tags (tagIds.others) scope it ("-36% Wilt Damage taken": others Wilt 5100007).
      if (list.length || !TYPE[effect.type]) return [];
      const others = effect.tagIds?.others ?? [];
      const scope = others.length === 1 ? AILMENT[others[0]] ?? INCOMING[others[0]] : null;
      if (others.length && !scope) return [];
      return c(`damageTaken:${scope ?? (effect.type === "all" ? "All" : TYPE[effect.type])}`, sheetBucket(b));
    }
    case "maxBuffStacks": return list.length === 1 && BLESSING[list[0]] && b === "flat" ? c(BLESSING[list[0]], "flat") : [];
    default: {
      // Game-only stats: unscoped, unconditional, not a damage layer, a named attribute or field.
      if (list.length || effect.local || DAMAGE_CONCEPTS.has(effect.concept) || !effect.concept || /^field:|^resource|^label|^flag/.test(effect.concept) || !(effect.kind === "attr" || effect.kind === "field")) return [];
      const key = `game:${effect.concept}${effect.type ? `:${effect.type}` : ""}`;
      if (!GAME_STATS.has(key)) GAME_STATS.set(key, { label: gameStatLabel(lineText, effect), unit: percentLine || PERCENT(b) ? "%" : "", source: effect.kind === "attr" ? `attribute ${effect.attr}` : `field ${effect.field}` });
      return c(key, effect.kind === "field" ? "flat" : b === "flat" ? "flat" : b);
    }
  }
}

// Planner-made lines and hero-trait lines keep the text reading (no template; the trait models own them).
const KEEP_TEXT_ORIGINS = new Set(["trait", "derived", "buff", "follower", "aura"]);
/**
 * The recipe's reading of one sheet line: { status, contributions, id, resolvedBy } where status is "read" (unconditional player
 * writes mapped to sheet stats), "conditional" (a write behind a gate or trigger, or scoped to a skill: not a panel stat), "none" (no
 * stat write), "unresolved" (no template) or "text" (an origin that keeps the text reading).
 */
// The sheet is totalled several times per planner pass (line conditions, panel, defence view): one reading per line identity.
const READ_CACHE = new Map();
export function recipeStatReading(line) {
  if (!affixRecipesLoaded()) return { status: "unresolved", contributions: [] };
  if (KEEP_TEXT_ORIGINS.has(line.origin) || line.derivedFrom || line.lineEffect) return { status: "text", contributions: [] };
  const key = `${line.origin}|${line.source}|${line.reflectedFrom ?? ""}|${line.text}`;
  if (READ_CACHE.has(key)) return READ_CACHE.get(key);
  if (READ_CACHE.size > 20000) READ_CACHE.clear();
  const reading = readLine(line);
  READ_CACHE.set(key, reading);
  return reading;
}
function readLine(line) {
  const text = String(line.text ?? "");
  const resolved = interpretLine(text, { origin: line.origin ?? null, line });
  const chosen = resolved?.chosen ?? resolved?.candidates?.[0] ?? null;
  if (!chosen) return { status: "unresolved", contributions: [] };
  const effects = (chosen.result?.effects || []).filter((effect) => effect.kind === "attr" || effect.kind === "field");
  const percentLine = /%/.test(text);
  const contributions = effects.flatMap((effect) => effectStatContributions(effect, { percentLine, lineText: text }));
  const gated = effects.some((effect) => effect.target === "self" && (effect.conditions || []).length);
  return { status: contributions.length ? "read" : gated ? "conditional" : "none", contributions, id: chosen.id, resolvedBy: resolved.resolvedBy, ambiguous: Boolean(resolved.ambiguous) };
}

// Canonical form for comparing two readings: % stats sum their flat and increased lines.
// "+X% Defense": the text reader's one "defense" stat is the recipe's three writes (8628845: Armor 4001, Evasion 4002 and Max Energy
// Shield 1601, increased), which src/effective-hp.js already applies to all three; the comparison expands it, the sheet keeps its row.
const expandDefense = (list) => list.flatMap((item) => (item.stat === "defense" ? ["armor", "evasion", "maxEnergyShield"].map((stat) => ({ ...item, stat })) : [item]));
const canonical = (contributions, unitOf) => expandDefense(contributions).map((item) => `${item.stat}|${unitOf(item.stat) === "%" && (item.bucket === "flat" || item.bucket === "increased") ? "sum" : item.bucket}|${Math.round(item.value * 1e6) / 1e6}`).sort().join(" ");
/**
 * Choose the reading for one line. Text and recipe agree → text (same contributions). Recipe only → recipe (the "sum all stats"
 * rule: a stat line the text reader missed). Both differ → the recipe when its template is settled (exact / single / id / origin),
 * the text when the recipe picked a same-text template by majority. Returns { contributions, verdict, recipe }.
 */
export function chooseStatReading(line, textContributions, unitOf) {
  const recipe = recipeStatReading(line);
  if (recipe.status !== "read") return { contributions: textContributions, verdict: textContributions.length ? (recipe.status === "conditional" ? "text (recipe: conditional)" : `text (recipe: ${recipe.status})`) : "none", recipe };
  // A line with no number of its own (a keyword name such as "Psychic's Dirge", whose effects arrive as their own lines) adds nothing.
  if (!textContributions.length && !/\d/.test(String(line.text ?? ""))) return { contributions: [], verdict: "none (keyword line)", recipe };
  if (!textContributions.length) return { contributions: recipe.contributions, verdict: "recipe-only", recipe };
  if (canonical(textContributions, unitOf) === canonical(recipe.contributions, unitOf)) return { contributions: textContributions, verdict: "agree", recipe };
  if (recipe.resolvedBy === "majority" || recipe.ambiguous) return { contributions: textContributions, verdict: "differ (kept text: same-text template by majority)", recipe };
  return { contributions: recipe.contributions.map((item) => ({ ...item, bucket: unitOf(item.stat) === "%" && item.bucket === "flat" ? "increased" : item.bucket })), verdict: "differ (recipe)", recipe };
}
