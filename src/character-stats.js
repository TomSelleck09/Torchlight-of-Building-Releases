import { normalizePercentageText } from "./percentage-text.js";
import { gameDamageLayer } from "./affix-bucket.js";
import { auraSpeedStatLines } from "./aura-gained-effects.js";
import { heroById } from "./data/heroes/hero-catalog-ss13.js";
import { allHeroTraitsSs13 } from "./data/heroes/all-hero-traits-ss13.generated.js";
import { baseTraitDescriptionForLevel, artificialMoonGate, slotTraitLevel, nonBaseTraitLevelExtras, endsArtificialMoonSection } from "./hero-memory-rules.js";
import { heroTraitTree, heroTreeSelections, treeRowSlotKeys, TREE_ROW_LEVELS, EXTRA_PICK_LEVEL } from "./hero-trait-tree.js";
import { heroTraitKeywordPlainLines } from "./inline-keywords.js";
import { chooseStatReading, gameStatInfo } from "./recipe-stat-layers.js";
import { statDataMode } from "./game-skill-data.js";
import { NO_ENERGY_SHIELD_COMPENSATION } from "./sealed-mana-compensation.js";

// Character stat totals: every plain "+X stat" line the build carries, summed by stat and
// bucket whether or not it changes dummy damage. Input is the planner's own flattened
// modifier list (planner.modifierTexts, built by collectModifierTexts) plus the selected
// hero traits at their current level. Lines are matched whole (anchored), so conditional
// lines ("... while Blur is active", "... for every 1 Rage") stay out of the totals.
//
// Buckets: flat, increased (%; adds), additional (%; multiplies), gearFlat / gearIncreased
// (the item's own gear base values; the % is local to that item), base (weapon base values).
// A final value is computed only where the planner already uses that rule:
//   attributes = flat × (1 + increased%)   (theoretical-sources.js Intelligence pooling)
//   gear Armor / Evasion / Energy Shield per item = gear flat × (1 + that item's gear%)
// Life, Mana, Energy Shield, Armor and Evasion need character base values and the scope of
// "Defense" that are not sourced, so those show their components instead of a final value.

export const characterStatGroups = ["Attributes", "Defense", "Resistances", "Offense", "Utility"];

const NUM = "([+-]?\\d+(?:\\.\\d+)?)";
const ELEMENTS = ["Fire", "Cold", "Lightning", "Erosion"];
const lower = (value) => value.toLowerCase();
const title = (value) => value[0].toUpperCase() + value.slice(1).toLowerCase();
const camel = (value) => value.replace(/['’]/g, "").split(/\s+/).map((word, index) => index ? title(word) : word.toLowerCase()).join("");

// stat key → label, group, display unit. Dynamic keys (skill levels, typed damage taken,
// ailment-specific Reaping Duration) are described by `describeStat`.
const STATS = {
  strength: ["Strength", "Attributes", ""],
  dexterity: ["Dexterity", "Attributes", ""],
  intelligence: ["Intelligence", "Attributes", ""],
  maxLife: ["Max Life", "Defense", ""],
  maxMana: ["Max Mana", "Defense", ""],
  maxEnergyShield: ["Max Energy Shield", "Defense", ""],
  armor: ["Armor", "Defense", ""],
  evasion: ["Evasion", "Defense", ""],
  defense: ["Defense", "Defense", "%"],
  energyShieldChargeSpeed: ["Energy Shield Charge Speed", "Defense", "%"],
  energyShieldChargeInterval: ["Energy Shield Charge Interval", "Defense", "%"],
  attackBlockChance: ["Attack Block Chance", "Defense", "%"],
  spellBlockChance: ["Spell Block Chance", "Defense", "%"],
  blockRatio: ["Block Ratio", "Defense", "%"],
  blockRatioUpperLimit: ["Block Ratio Upper Limit", "Defense", "%"],
  injuryBuffer: ["Injury Buffer", "Defense", "%"],
  damageAvoidance: ["Chance to avoid damage", "Defense", "%"],
  elementalAilmentAvoidance: ["Chance to avoid Elemental Ailments", "Defense", "%"],
  lifeRegenerationSpeed: ["Life Regeneration Speed", "Defense", "%"],
  lifeRegain: ["Life Regain", "Defense", "%"],
  lifeRegainInterval: ["Life Regain Interval", "Defense", "%"],
  energyShieldRegain: ["Energy Shield Regain", "Defense", "%"],
  energyShieldRegainInterval: ["Energy Shield Regain Interval", "Defense", "%"],
  sealedManaCompensation: ["Sealed Mana Compensation", "Defense", "%"],
  fireResistance: ["Fire Resistance", "Resistances", "%"],
  coldResistance: ["Cold Resistance", "Resistances", "%"],
  lightningResistance: ["Lightning Resistance", "Resistances", "%"],
  erosionResistance: ["Erosion Resistance", "Resistances", "%"],
  maxFireResistance: ["Max Fire Resistance", "Resistances", "%"],
  maxColdResistance: ["Max Cold Resistance", "Resistances", "%"],
  maxLightningResistance: ["Max Lightning Resistance", "Resistances", "%"],
  maxErosionResistance: ["Max Erosion Resistance", "Resistances", "%"],
  weaponAttackSpeed: ["Weapon base Attack Speed", "Offense", ""],
  weaponCriticalStrikeRating: ["Weapon base Critical Strike Rating", "Offense", ""],
  attackSpeed: ["Attack Speed", "Offense", "%"],
  castSpeed: ["Cast Speed", "Offense", "%"],
  criticalStrikeRating: ["Critical Strike Rating", "Offense", ""],
  attackCriticalStrikeRating: ["Attack Critical Strike Rating", "Offense", ""],
  spellCriticalStrikeRating: ["Spell Critical Strike Rating", "Offense", ""],
  criticalStrikeDamage: ["Critical Strike Damage", "Offense", "%"],
  attackCriticalStrikeDamage: ["Attack Critical Strike Damage", "Offense", "%"],
  spellCriticalStrikeDamage: ["Spell Critical Strike Damage", "Offense", "%"],
  afflictionPerSecond: ["Affliction inflicted per second", "Offense", ""],
  afflictionEffect: ["Affliction Effect", "Offense", "%"],
  "game:elixirEffect": ["Elixir Skill Effect", "Utility", "%"],
  movementSpeed: ["Movement Speed", "Utility", "%"],
  reapingDuration: ["Reaping Duration", "Utility", "%"],
  reapingRecoverySpeed: ["Reaping Recovery Speed", "Utility", "%"],
  auraEffect: ["Aura Effect", "Utility", "%"],
  curseEffect: ["Curse Effect", "Utility", "%"],
  blurEffect: ["Blur Effect", "Utility", "%"],
  focusBuffEffect: ["Focus Buff Effect", "Utility", "%"],
  skillArea: ["Skill Area", "Utility", "%"],
  skillCost: ["Skill Cost", "Utility", ""],
  attackSkillCost: ["Attack Skill Cost", "Utility", ""],
  skillEffectDuration: ["Skill Effect Duration", "Utility", "%"],
  cooldownRecoverySpeed: ["Cooldown Recovery Speed", "Utility", "%"],
  projectileSpeed: ["Projectile Speed", "Utility", "%"],
  spellBurstChargeSpeed: ["Spell Burst Charge Speed", "Utility", "%"],
  maxFocusBlessingStacks: ["Max Focus Blessing stacks", "Utility", ""],
  maxTenacityBlessingStacks: ["Max Tenacity Blessing stacks", "Utility", ""],
  maxAgilityBlessingStacks: ["Max Agility Blessing stacks", "Utility", ""]
};
const ORDER = Object.keys(STATS);

export function describeStat(key) {
  if (STATS[key]) { const [label, group, unit] = STATS[key]; return { key, label, group, unit }; }
  let match = key.match(/^skillLevel:(.+)$/);
  if (match) return { key, label: match[1] === "All" ? "All Skills' Levels" : `${match[1]} Skill Level`, group: "Utility", unit: "" };
  match = key.match(/^damageTaken:(.+)$/);
  if (match) return { key, label: match[1] === "All" ? "Damage taken" : `${match[1]} Damage taken`, group: "Defense", unit: "%" };
  match = key.match(/^effectReceived:(.+)$/);
  if (match) return { key, label: `${match[1]} Effect received`, group: "Defense", unit: "%" };
  match = key.match(/^reapingDuration:(.+)$/);
  if (match) return { key, label: `${match[1]} Reaping Duration`, group: "Utility", unit: "%" };
  // A stat only the game recipe names (src/recipe-stat-layers.js: an unscoped, unconditional write with no sheet key of its own).
  const game = key.startsWith("game:") ? gameStatInfo(key) : null;
  if (game) return { key, label: game.label, group: "Utility", unit: game.unit, gameSource: game.source };
  return { key, label: key, group: "Utility", unit: "" };
}

const c = (stat, bucket, value) => ({ stat, bucket, value });
const splitNames = (list) => list.split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map((part) => part.trim()).filter(Boolean);
const resourceKey = { life: "maxLife", mana: "maxMana", "energy shield": "maxEnergyShield" };
const defenseKey = { armor: "armor", armour: "armor", evasion: "evasion", "energy shield": "maxEnergyShield" };
const elementsOf = (name) => name === "Elemental" ? ELEMENTS.slice(0, 3) : name === "All" ? ELEMENTS : [name];
// "Attack and Spell" and unscoped lines count toward the general stat.
const scoped = (scope, base) => !scope || /and/i.test(scope) ? base : `${lower(scope)}${base[0].toUpperCase()}${base.slice(1)}`;
const rule = (source, build, flags = "i") => [new RegExp(source.replaceAll("NUM", NUM), flags), build];

// Each rule: [pattern, (match, signed) → contributions]. `signed` is true when the line
// carries an explicit + or - (weapon base values are unsigned: "500 Critical Strike Rating").
const RULES = [
  rule("^NUM (Strength|Dexterity|Intelligence)(?: and (Strength|Dexterity|Intelligence))?$", (m) => [m[2], m[3]].filter(Boolean).map((name) => c(lower(name), "flat", +m[1]))),
  rule("^NUM (?:to )?All Stats$", (m) => ["strength", "dexterity", "intelligence"].map((stat) => c(stat, "flat", +m[1]))),
  rule("^NUM% (Strength|Dexterity|Intelligence)(?: and (Strength|Dexterity|Intelligence))?$", (m) => [m[2], m[3]].filter(Boolean).map((name) => c(lower(name), "increased", +m[1]))),
  rule("^NUM% (?:to )?All Stats$", (m) => ["strength", "dexterity", "intelligence"].map((stat) => c(stat, "increased", +m[1]))),
  // "-99% additional Intelligence" (Fool's Crown), "-99% additional Dexterity and Intelligence" (Magnus' Scar): a multiplier on the
  // attribute total (gear uniques round 2).
  rule("^NUM% additional (Strength|Dexterity|Intelligence)(?: and (Strength|Dexterity|Intelligence))?$", (m) => [m[2], m[3]].filter(Boolean).map((name) => c(lower(name), "additional", +m[1]))),
  rule("^NUM Max (Life|Mana|Energy Shield)$", (m) => [c(resourceKey[lower(m[2])], "flat", +m[1])]),
  // A trailing "(multiplies)" is the game's mark of an additional (mod 4) write: Banishment's "+3% additional Max Energy Shield
  // (multiplies)" per non-adjacent slate (server affix 10052 rows 151300101-103), already one factor per slate when scaled.
  rule("^NUM% (additional )?(Max (?:Life|Mana|Energy Shield)(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+)Max (?:Life|Mana|Energy Shield))*)(?: \\(multiplies\\))?$", (m) =>
    splitNames(m[3]).map((name) => c(resourceKey[lower(name.replace(/^Max\s+/i, ""))], m[2] ? "additional" : "increased", +m[1]))),
  rule("^NUM(%?) gear (Armou?r|Evasion|Energy Shield)$", (m) => [c(defenseKey[lower(m[3])], m[2] ? "gearIncreased" : "gearFlat", +m[1])]),
  rule("^NUM gear (Armou?r|Evasion|Energy Shield),? (?:and )?NUM gear (Armou?r|Evasion|Energy Shield)$", (m) => [c(defenseKey[lower(m[2])], "gearFlat", +m[1]), c(defenseKey[lower(m[4])], "gearFlat", +m[3])]),
  rule("^NUM(%?) (Armou?r|Evasion)$", (m) => [c(defenseKey[lower(m[3])], m[2] ? "increased" : "flat", +m[1])]),
  // "+X% additional Armor / Evasion" (attr 4001 / 4002 mod 4: Clenched Spring's 10839701, Banishment's per-slate rows 151300101 / 102,
  // which carry the same payload; 2026-11-09): one factor on the pool.
  rule("^NUM% additional (Armou?r|Evasion)(?: \\(multiplies\\))?$", (m) => [c(defenseKey[lower(m[2])], "additional", +m[1])]),
  rule("^NUM% Defense$", (m) => [c("defense", "increased", +m[1])]),
  // "Your Max Energy Shield is fixed at 0" (No Loose Ends; game affix 103360004: node 336 sets attribute 1601 Max Energy Shield to p0):
  // the pool reads the fixed value whatever its lines add (src/effective-hp.js pool; 2026-11-05).
  rule("^Your Max Energy Shield is fixed at NUM$", (m) => [c("maxEnergyShield", "fixed", +m[1])]),
  // "Your Max Life is set to 100" (Magister core Shell, the Unwavering Fortress prism; game affix 103360006: the same node 336, on
  // attribute 1001 Max Life): the fixed value (10 T claim audit G3a, 2026-11-09; the town panel reads Total Life 100).
  rule("^Your Max Life is set to NUM$", (m) => [c("maxLife", "fixed", +m[1])]),
  rule("^NUM% Energy Shield Charge Speed$", (m) => [c("energyShieldChargeSpeed", "increased", +m[1])]),
  rule("^NUM% additional Energy Shield Charge Interval$", (m) => [c("energyShieldChargeInterval", "additional", +m[1])]),
  rule("^NUM% (Attack and Spell|Attack|Spell) Block Chance$", (m) => (/and/i.test(m[2]) ? ["attack", "spell"] : [lower(m[2])]).map((kind) => c(`${kind}BlockChance`, "increased", +m[1]))),
  rule("^NUM% Block Ratio$", (m) => [c("blockRatio", "increased", +m[1])]),
  // Above the base 30% / 60% (src/block-model.js). Wield My Sword / Absolve My Sin raise both with one line.
  rule("^NUM% Block Ratio (?:Upper [Ll]imit|[Mm]aximum)$", (m) => [c("blockRatioUpperLimit", "increased", +m[1])]),
  rule("^NUM% Block Ratio and Block Ratio Upper Limit$", (m) => [c("blockRatio", "increased", +m[1]), c("blockRatioUpperLimit", "increased", +m[1])]),
  rule("^NUM% Injury Buffer$", (m) => [c("injuryBuffer", "increased", +m[1])]),
  rule("^NUM% chance to avoid damage$", (m) => [c("damageAvoidance", "increased", +m[1])]),
  rule("^NUM% chance to avoid Elemental Ailments$", (m) => [c("elementalAilmentAvoidance", "increased", +m[1])]),
  rule("^NUM% Life Regeneration Speed$", (m) => [c("lifeRegenerationSpeed", "increased", +m[1])]),
  rule("^NUM% Energy Shield Regain$", (m) => [c("energyShieldRegain", "increased", +m[1])]),
  rule("^NUM% additional Energy Shield Regain Interval$", (m) => [c("energyShieldRegainInterval", "additional", +m[1])]),
  // Life Regain and the shared Regain Interval (Regain model, 2026-10-14; src/regain-model.js): Life Regain and Shield Regain
  // have separate intervals (reference data Regain page), so an unscoped "Regain Interval" line reaches both.
  rule("^NUM% Life Regain$", (m) => [c("lifeRegain", "increased", +m[1])]),
  rule("^NUM% Life Regain and (?:Energy )?Shield Regain$", (m) => [c("lifeRegain", "increased", +m[1]), c("energyShieldRegain", "increased", +m[1])]),
  rule("^NUM% additional Life Regain Interval$", (m) => [c("lifeRegainInterval", "additional", +m[1])]),
  rule("^NUM% additional Regain Interval$", (m) => [c("lifeRegainInterval", "additional", +m[1]), c("energyShieldRegainInterval", "additional", +m[1])]),
  rule("^NUM% Sealed Mana Compensation$", (m) => [c("sealedManaCompensation", "increased", +m[1])]),
  rule("^NUM% (Max )?((?:Fire|Cold|Lightning|Erosion|Elemental|All)(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+)(?:Fire|Cold|Lightning|Erosion))*) Resistances?$", (m) => {
    const elements = [...new Set(splitNames(m[3]).flatMap((name) => elementsOf(title(name))))];
    return elements.map((element) => c(m[2] ? `max${element}Resistance` : `${lower(element)}Resistance`, "increased", +m[1]));
  }),
  rule("^NUM% (Attack and Cast|Attack|Cast) Speed$", (m) => (/and/i.test(m[2]) ? ["attack", "cast"] : [lower(m[2])]).map((kind) => c(`${kind}Speed`, "increased", +m[1]))),
  rule("^NUM Attack Speed$", (m, signed) => signed ? [] : [c("weaponAttackSpeed", "base", +m[1])]),
  rule("^NUM(%?) (?:(Attack and Spell|Attack|Spell) )?Critical Strike Rating$", (m, signed) => !m[2] && !m[3] && !signed
    ? [c("weaponCriticalStrikeRating", "base", +m[1])]
    : [c(scoped(m[3], "criticalStrikeRating"), m[2] ? "increased" : "flat", +m[1])]),
  rule("^NUM% (?:(Attack and Spell|Attack|Spell) )?Critical Strike Damage$", (m) => [c(scoped(m[2], "criticalStrikeDamage"), "increased", +m[1])]),
  rule("^NUM Affliction inflicted per second$", (m) => [c("afflictionPerSecond", "flat", +m[1])]),
  rule("^NUM% (additional )?(Affliction|Aura|Curse|Blur|Focus Buff) Effect$", (m) => [c(`${camel(m[3])}Effect`, m[2] ? "additional" : "increased", +m[1])]),
  // "+X% additional Movement Speed" (attr 4 mod 4) is its own factor (panel row 60101 [A4E]; 2026-11-10): the town % row keeps the increased
  // sum, the player's movement speed (src/dummy-target.js playerMoveSpeed) reads the product.
  rule("^NUM% (additional )?Movement Speed$", (m) => [c("movementSpeed", m[2] ? "additional" : "increased", +m[1])]),
  rule("^NUM% (?:(Ignite|Wilt|Trauma|Frostbite|Shock|Numbed) )?Reaping Duration$", (m) => [c(m[2] ? `reapingDuration:${title(m[2])}` : "reapingDuration", "increased", +m[1])]),
  rule("^NUM% (additional )?Reaping Recovery Speed$", (m) => [c("reapingRecoverySpeed", m[2] ? "additional" : "increased", +m[1])]),
  rule("^NUM to All Skills['’] Levels?$", (m) => [c("skillLevel:All", "flat", +m[1])]),
  rule("^NUM ((?:[A-Z][\\w'-]* )*?)Skill Levels?$", (m) => [c(`skillLevel:${m[2].trim() || "All"}`, "flat", +m[1])], ""),
  rule("^NUM% (additional )?(?:(Physical|Fire|Cold|Lightning|Erosion|Elemental|Ignite|Wilt|Trauma|Spell|Attack|Ailment) )?Damage taken$", (m) => [c(`damageTaken:${m[3] ? title(m[3]) : "All"}`, m[2] ? "additional" : "increased", +m[1])]),
  rule("^NUM% (Ignite|Wilt|Trauma|Frostbite|Shock|Numbed|Freeze) Effect received$", (m) => [c(`effectReceived:${title(m[2])}`, "increased", +m[1])]),
  rule("^NUM% Skill Area$", (m) => [c("skillArea", "increased", +m[1])]),
  rule("^NUM (Attack )?Skill Cost$", (m) => [c(m[2] ? "attackSkillCost" : "skillCost", "flat", +m[1])]),
  rule("^NUM% Skill Effect Duration$", (m) => [c("skillEffectDuration", "increased", +m[1])]),
  rule("^Additional NUM% Skill Effect Duration$", (m) => [c("skillEffectDuration", "additional", +m[1])]),
  rule("^NUM% Cooldown Recovery Speed$", (m) => [c("cooldownRecoverySpeed", "increased", +m[1])]),
  rule("^NUM% Projectile Speed$", (m) => [c("projectileSpeed", "increased", +m[1])]),
  rule("^NUM% (additional )?Spell Burst Charge Speed$", (m) => [c("spellBurstChargeSpeed", m[2] ? "additional" : "increased", +m[1])]),
  rule("^NUM to Max (Focus|Tenacity|Agility) Blessing Stacks$", (m) => [c(`max${title(m[2])}BlessingStacks`, "flat", +m[1])])
];

// "Feline Steps: +6% Movement Speed" style prefixes name the effect, not the stat. A prefix
// that states a condition ("Blur gains an additional effect:", "When ...:") keeps the line out, and so does a keyword's changed
// base effect ("Changes the base effect of Numbed to:", "… of Tenacity Blessing to:"): it acts on Numbed enemies or per
// Blessing stack (src/combat-states.js, src/blessing-model.js), not as a panel stat.
const stripName = (text) => {
  const match = text.match(/^((?:[A-Z][\w' ]+: )+)(?=[+-]?\d)/);
  return match && !/\b(?:when|while|if|after|during|upon|per|every|recently|additional effect|base effect of)\b/i.test(match[1]) ? text.slice(match[1].length) : text;
};

// Contributions for one clause (value before the source's rank multiplier), or [] when the
// clause is not a plain character stat.
export function parseCharacterStatClause(text) {
  const clean = stripName(normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim());
  if (!clean) return [];
  const signed = /^[+-]/.test(clean);
  for (const [pattern, build] of RULES) {
    const match = clean.match(pattern);
    if (!match) continue;
    const out = build(match, signed).filter((item) => item.stat && Number.isFinite(item.value));
    // Game bucket for the shapes src/affix-bucket.js applies (2026-10-17 game bucket code); the wording rule otherwise.
    const layer = out.length ? gameDamageLayer(text) : null;
    if (layer) for (const item of out) if (item.bucket === "increased" || item.bucket === "additional") item.bucket = layer;
    if (out.length) return out;
  }
  return [];
}

export const isCharacterStatLine = (text) => parseCharacterStatClause(text).length > 0;

// Selected hero traits at their current level ("( 18 / 23 / 28 )" → the level's value).
// Levels follow the trait tooltip: the base trait uses the base-trait memory level, the
// level 45/60/75 traits use 1 + that slot's memory trait level + that same memory's own "+N to (Non-Base) Hero Trait
// Level" (max 5). User-observed 2026-10-13 (Frost Terra character: The Cycle I Resist LV.5 from its slot's Memory of
// Progress "+2 to Hero Trait Level", the base trait LV.3): a memory's "+N" raises only the trait in its own slot
// (src/hero-memory-rules.js memoryOwnHeroTraitLevel / slotMemoryOwnTraitLevel), so memory lines (origin "memory") are left
// out of these build-wide totals. What remains build-wide is non-memory "+N to (Non-Base) Hero Trait Level" lines; the
// catalogs hold one: Bing's base-trait Artificial Moon "+1 to Non-Base Hero Trait Level". The base trait (user-confirmed
// 2026-10-13) takes 0 + its base-slot memory's bonus + that memory's own "+N to Hero Trait Level"
// (baseTraitLevelForMemory); the totals here never add to it.
export function heroTraitLevelBonus(modifierTexts = []) {
  const bonus = { all: 0, nonBase: 0, sources: [] };
  for (const line of modifierTexts) {
    if (line.origin === "memory") continue; // per-slot: memoryOwnHeroTraitLevel
    const match = String(line.text ?? "").replace(/\s+/g, " ").trim().match(/^\+(\d+) to (Non-Base )?Hero Trait Level$/i);
    if (!match) continue;
    const value = Number(match[1]) * (line.multiplier ?? 1);
    if (match[2]) bonus.nonBase += value; else bonus.all += value;
    bonus.sources.push({ source: line.source, text: line.text, value });
  }
  return bonus;
}

// Selena traits batch (2026-10-13, research/selena-traits-2026-10-13.md):
// - A slot memory's trait level is stored under the tier key the UI writes: "level45" for Selena (Sing with the Tide),
//   "<heroId>:level45" for every other hero (src/app.js heroMemoryTierForType). The prefixed key is read first; before
//   2026-10-13 only the bare key was read, so other heroes' slot memories never raised their trait levels here.
// - Trait-tree heroes (Selena – Dance of the Deep; since 2026-10-15 also Thea – Wisdom of The Gods and Youga – The Ultimate
//   One) keep their path in `hero.treeTraits[heroId]` (src/hero-trait-tree.js; Selena's earlier `hero.selenaDanceTraits` is
//   read as a fallback), not in `selectedTraits`; before 2026-10-13 none of Selena's path traits reached the build lines.
//   Each path trait takes the level of the memory in the row it is shown in. The array is row-indexed (index 0 / 1 / 2 →
//   Lv.45 / 60 / 75, "" = empty row; user, 2026-10-13: picks can be dragged between rows, and a child trait sits in a later
//   row than its parent). Youga's fourth row (the "+1 Max Youga Count in the Universe" memory) has no memory: its trait is at
//   level 5. Older saves stored pick order, which normalizes to the same rows (provisional until confirmed in game).
// - Artificial Moon (user-corrected 2026-10-13; src/hero-memory-rules.js artificialMoonGate): an equipped memory with the
//   Artificial Moon revived affix opens the base trait slot, and the base trait's lines after "Artificial Moon:" are active
//   only when the base trait reaches level 5 (0 + the base-slot memory's enhancement bonus + that memory's own "+N to Hero
//   Trait Level"; other memories' and gear lines do not count, user-confirmed 2026-10-13), for every hero.
//   `options.artificialMoon` (src/hero-memory-model.js heroMemories.artificialMoon) or, when the caller passes none, the
//   same gate on the state's memories. The lines carry
//   `artificialMoon: true`.
export function artificialMoonEquipped(hero = {}) {
  return artificialMoonGate(hero).active;
}

// The memory slot a selected 45 / 60 / 75 trait reads (a trait tree: its row, the index in the row-indexed
// hero.treeTraits[heroId]) and its level there; null for the base trait or a trait that is not selected. Level 0: no hero
// memory installed (inactive). Youga's fourth tree row: { row: "extra", keys: [], level: 5 }.
export function heroTraitSlotLevel(state = {}, traitName, levelBonus = { all: 0, nonBase: 0 }) {
  const hero = heroById(state.hero?.selectedHeroId);
  const trait = hero && allHeroTraitsSs13[hero.id]?.traits?.find((item) => item.name === traitName);
  if (!trait || trait.level <= 1) return null;
  let row = trait.level;
  if (heroTraitTree(hero.id)) {
    const index = heroTreeSelections(state.hero, hero.id).indexOf(traitName);
    if (index < 0) return null;
    if (!treeRowSlotKeys(hero.id, index)) return { row: "extra", keys: [], level: EXTRA_PICK_LEVEL };
    row = TREE_ROW_LEVELS[index];
  }
  const keys = hero.id === "selena-sing-with-the-tide" ? [`level${row}`] : [`${hero.id}:level${row}`, `level${row}`];
  // Bing – Creative Genius's sixth rank (tier 82000105's link; src/hero-memory-rules.js nonBaseTraitLevelExtras).
  const extras = nonBaseTraitLevelExtras(hero.id, artificialMoonGate(state.hero).active);
  return { row, keys, level: slotTraitLevel(state.hero, keys, (levelBonus.all || 0) + (levelBonus.nonBase || 0), extras) };
}

export function heroTraitStatLines(state = {}, baseTraitLevel = 1, levelBonus = { all: 0, nonBase: 0 }, options = {}) {
  const hero = heroById(state.hero?.selectedHeroId);
  const moonActive = options.artificialMoon ?? artificialMoonEquipped(state.hero);
  const traits = hero ? allHeroTraitsSs13[hero.id]?.traits || [] : [];
  if (!traits.length) return [];
  const picks = [];
  // The base trait: named like the hero trait, else the level-1 trait (Youga – The Ultimate One: "I Am the Ultimate One").
  const base = traits.find((trait) => trait.name === hero.trait) || traits.find((trait) => trait.level === 1);
  const tree = heroTraitTree(hero.id);
  // 45 / 60 / 75 traits (user-stated rule 2026-10-13; src/hero-memory-rules.js slotTraitLevel): 0 (inactive, no lines) with
  // no memory in the slot, else the memory's 1 / 2 / 3 + its own "+N" + the build-wide non-memory lines, max 5.
  // Bing – Creative Genius: the base trait's Artificial Moon "+1 to Non-Base Hero Trait Level" raises these traits and opens a
  // sixth rank (tier 82000105's link; src/hero-memory-rules.js nonBaseTraitLevelExtras).
  const levelExtras = nonBaseTraitLevelExtras(hero.id, moonActive);
  const tierLevel = (key, levelKey) => slotTraitLevel(state.hero, [key, levelKey], (levelBonus.all || 0) + (levelBonus.nonBase || 0), levelExtras);
  if (base) picks.push({ trait: base, level: Math.max(1, Math.min(5, Number(baseTraitLevel) || 1)) }); // base-slot memory only (user-confirmed 2026-10-13)
  // One-per-level picks. Tree heroes pick on the tree (below); a tree hero's selectedTraits stay read as before (a game-log
  // import wrote Selena's path there before 2026-10-15; the planner UI never does). A revamped hero's earlier picks whose
  // trait moved to another tree level no longer match here; src/hero-trait-tree.js migrates them into the tree.
  for (const [key, name] of Object.entries(state.hero?.selectedTraits || {})) {
    const levelKey = key.match(/(level\d+)/)?.[1];
    if (!levelKey || (key.includes(":") && !key.startsWith(`${hero.id}:`))) continue;
    const trait = traits.find((item) => item.name === name && item.level === Number(levelKey.slice(5)));
    const level = trait ? tierLevel(key.replace(/:(?:upper|lower)$/, ""), levelKey) : 0;
    if (trait && level > 0) picks.push({ trait, level });
  }
  if (tree) {
    heroTreeSelections(state.hero, hero.id).forEach((name, index) => {
      if (!name) return; // empty memory row
      const trait = traits.find((item) => item.name === name && item.level > 1);
      const keys = treeRowSlotKeys(hero.id, index);
      // A memory row: the level of its memory (0 without one); Youga's fourth row: level 5.
      const level = !trait ? 0 : keys ? tierLevel(...keys) : EXTRA_PICK_LEVEL;
      if (level > 0) picks.push({ trait, level });
    });
  }
  const lines = [];
  for (const { trait, level } of picks) {
    // The base trait's catalog description is the max-level text (Growing Breeze: "+20 % additional Minion Damage"); the
    // per-level values live in the progression table ("(+0 / +5 / +10 / +15 / +20) % additional Minion Damage", index 0 =
    // level 1), so the base trait substitutes from that text (2026-10-12; src/hero-memory-rules.js baseTraitDescriptionForLevel).
    const source = trait === base ? baseTraitDescriptionForLevel(hero.id, trait.description) : trait.description;
    const text = String(source || "").replace(/\(\s*([^()]*\/[^()]*)\)/g, (_, list) => {
      const values = list.split("/").map((value) => value.trim());
      return values[Math.min(values.length - 1, level - 1)];
    });
    // The moon section ends at a line that starts another section (Sage's "Damage Ingredient …" catalogue, hero trait audit B8 F4:
    // the ingredient options are not moon effects); with the gate shut its lines are skipped and the next section is kept.
    let moon = false, skipMoon = false;
    for (const line of text.split("\n").map((part) => part.trim()).filter(Boolean)) {
      if (/^Artificial Moon:$/i.test(line)) { if (trait === base && moonActive) { moon = true; continue; } if (trait !== base) break; skipMoon = true; continue; }
      if ((moon || skipMoon) && endsArtificialMoonSection(line)) { moon = false; skipMoon = false; }
      if (skipMoon) continue;
      // "+20 % additional Erosion Damage" (reference data's spacing; the progression substitution keeps it): the line joins planner.modifierTexts as
      // "+20%" (batch 7, 2026-10-28), as gear lines do: the text readers of the DoT and ailment paths do not take "N %" (Thea – Blasphemer's
      // +20% additional Erosion Damage reached hits but not Wilt or a Spell DoT). The hero modules normalise their own copy.
      lines.push({ text: normalizePercentageText(line), source: `Hero trait: ${trait.name} (Lv ${level}${moon ? ", Artificial Moon" : ""})`, origin: "trait", multiplier: 1, ...(moon ? { artificialMoon: true } : {}) });
      // A keyword line with stat lines of its own (Youga's "Spacetime Conqueror": -15% Movement Speed; src/inline-keywords.js
      // heroTraitKeywords) adds them as trait lines, so the generic readers apply them.
      for (const plain of heroTraitKeywordPlainLines(hero.id, line)) lines.push({ text: plain, source: `Hero trait: ${trait.name} (Lv ${level}) · ${line}`, origin: "trait", multiplier: 1, derivedFrom: line });
    }
  }
  return lines;
}

function noEnergyShieldContributions(line, planner) {
  const text = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim();
  if (!NO_ENERGY_SHIELD_COMPENSATION.test(text)) return null;
  const entry = (planner?.aura?.pageSealedManaCompensation?.gated || []).find((item) => item.active && normalizePercentageText(String(item.text ?? "")).replace(/\s+/g, " ").trim() === text);
  return entry ? [c("sealedManaCompensation", "increased", entry.percent / (Number.isFinite(line.multiplier) ? line.multiplier : 1))] : [];
}

// Conditional lines whose condition the planner holds (2026-11-09, user-approved; research/build-7t-panel-compare-2026-11-09.md §8).
// The line resolver (src/line-effects.js) settles each conditional line's condition; a held line's bodies are its scaled
// `derivedText`. Bodies a damage reader takes became derived lines (planner.modifierTexts, `lineEffect.conditional`), which these
// totals leave out; a body with no reader (Movement Speed, Regain, …) became none. So each body is counted once, from the entry.
//
// Town (the stat sheet, a mirror of the in-game character panel, which is a town sheet): only conditions the town panel meets.
// - A buff held by a plain "Has <Buff>" line: the game grants the state permanently (Has Hasten: record 250923184, node 325) and the
//   line's write is gated on it (Ranger's Dirty Boots "+8% Attack Speed, Cast Speed, and Movement Speed when having Hasten": record
//   30030214 row 1, node 101 on attrs 4 / 6001 / 6002 mod 3, state 4015365 on the owner). The 7 T Rehan town panel shows it: Movement
//   Speed 30 = 22 + 8, the Gear Attack Speed +69 with the boots' +8.
// - Standing still and the weapon held (dual wielding, a Shield): met in town (scripts/panel-breakdown-compare.mjs TOWN_CONDITIONS /
//   TOWN_LINE_CONDITIONS; the Rosa town panel 2026-11-05).
// Any other held condition (combat buffs, Blessings, enemies, resources spent) is combat-only: it reaches the combat figures through
// its readers, and Movement Speed through `conditionalMovementSpeed` below, not the town sheet.
const staticBuffHolder = (modifierTexts, buff) => modifierTexts.some((line) => line.origin !== "buff" && line.origin !== "derived" && !line.lineEffect
  && normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().toLowerCase() === `has ${String(buff).toLowerCase()}`);
const TOWN_HELD_CONDITIONS = {
  buffActive: (entry, modifierTexts) => Boolean(entry.params?.buff) && staticBuffHolder(modifierTexts, entry.params.buff),
  standingStill: () => true,
  // A per-stat line ("+1% Movement Speed for every 20 Dexterity, up to +300%", Ralph's Journey, record 101140049) reads the stat-sheet
  // attribute, met in town too: the 15 T Chain Lightning town panel's Movement Speed Bonus 268 holds its +140.43% (2026-11-18, G2).
  perStat: () => true,
  dualWielding: () => true,
  shield: () => true
};

function heldEntryBodies(entry) {
  if (!entry?.active || !Array.isArray(entry.bodies)) return [];
  return entry.bodies.filter((item) => item?.derivedText).map((item) => ({ item, contributions: parseCharacterStatClause(item.derivedText) })).filter(({ contributions }) => contributions.length);
}

/** Stat lines for the held conditional lines the town panel shows (see above), from planner.lineEffects. */
export function heldConditionalStatLines(planner) {
  const modifierTexts = planner?.modifierTexts || [];
  const lines = [];
  for (const entry of planner?.lineEffects?.lines || []) {
    const town = TOWN_HELD_CONDITIONS[entry?.condition];
    if (!town || !entry.active || !town(entry, modifierTexts)) continue;
    for (const { item, contributions } of heldEntryBodies(entry)) {
      lines.push({ text: item.derivedText, source: `${entry.source} (${entry.text}: ${entry.conditionText})`, origin: entry.origin, multiplier: 1, contributions, heldCondition: entry.condition });
    }
  }
  return lines;
}

/**
 * Combat: the increased Movement Speed of every held conditional line (src/line-effects.js), town or combat: the bodies with no
 * reader (no derived line) and the derived conditional lines (combat states, the follower, hero modules; a part-time one at its
 * time average). The stat sheet's own lines are not in it. `additionalFactor`: the product of their "+X% additional Movement Speed"
 * bodies (one factor each; 2026-11-10, read by the player's movement speed only).
 */
export function conditionalMovementSpeed(lineEffects) {
  const sources = [];
  let additionalFactor = 1;
  const add = (source, text, contributions) => {
    const value = contributions.filter((item) => item.stat === "movementSpeed" && (item.bucket === "increased" || item.bucket === "flat")).reduce((sum, item) => sum + item.value, 0);
    if (value) sources.push({ source, text, value });
    for (const item of contributions) if (item.stat === "movementSpeed" && item.bucket === "additional" && item.value) { additionalFactor *= 1 + item.value / 100; sources.push({ source, text, value: item.value, additional: true }); }
  };
  for (const entry of lineEffects?.lines || []) for (const { item, contributions } of heldEntryBodies(entry)) if (!item.readers?.length) add(entry.source, `${item.derivedText} (${entry.text})`, contributions);
  for (const line of lineEffects?.derived || []) if (line?.lineEffect?.conditional) add(line.source, line.text, parseCharacterStatClause(line.text));
  return { percent: round(sources.filter((item) => !item.additional).reduce((sum, item) => sum + item.value, 0)), additionalFactor, sources };
}

/**
 * Combat: one pool's contributions (`statKey`, "maxEnergyShield" for one) from the held conditional lines, as
 * conditionalMovementSpeed reads Movement Speed: the bodies no engine reads and the derived conditional lines. In the shape of
 * src/effective-hp.js pool's `extra` (10 T claim audit G3d, 2026-11-09: the boots' "+16% additional Max Energy Shield while moving").
 * @returns {{ flat: object[], increased: object[], additional: object[] }}
 */
export function heldConditionalPoolExtra(lineEffects, statKey, { skipTownHeld = false, modifierTexts = [], skipKeys = null } = {}) {
  const out = { flat: [], increased: [], additional: [] };
  // A pool built on characterStatTotals(planner) already holds the town-held entries (heldConditionalStatLines): skip them there.
  const townHeld = (entry) => { const town = TOWN_HELD_CONDITIONS[entry?.condition]; return Boolean(town && entry.active && town(entry, modifierTexts)); };
  const add = (source, text, contributions) => {
    for (const item of contributions) {
      if (item.stat !== statKey || !Number.isFinite(item.value) || !item.value) continue;
      const bucket = item.bucket === "additional" ? "additional" : item.bucket === "increased" ? "increased" : item.bucket === "flat" ? "flat" : null;
      if (bucket) out[bucket].push({ source, text, value: item.value });
    }
  };
  // `skipKeys`: conditions whose bodies a pool already holds (src/static-held-stats.js STATIC_HELD_KEYS, folded before the resolver; F1).
  for (const entry of lineEffects?.lines || []) { if ((skipTownHeld && townHeld(entry)) || skipKeys?.has(entry?.condition)) continue; for (const { item, contributions } of heldEntryBodies(entry)) if (!item.readers?.length) add(entry.source, `${item.derivedText} (${entry.text})`, contributions); }
  for (const line of lineEffects?.derived || []) if (line?.lineEffect?.conditional) add(line.source, line.text, parseCharacterStatClause(line.text));
  return out;
}

const CHEST_DEFENSE = /^\+?(\d+(?:\.\d+)?)% (additional )?Defense gained from Chest Armou?r$/i;
// "+X% Chest Armor Defense" / "-X% Helmet Defense" (Dual Kismet: Headless, set 100350725; the set's rows are not in the extracted
// tables): an increase on that item's own Armor, Evasion and Energy Shield, in the same pool as its local "+X% gear" lines and
// "Defense gained from Chest Armor" (10 T claim audit G3c, 2026-11-09: the town panel's Energy Shield 40,093 needs the chest's
// 501 × (1 + 48% + 100% + 100%); inferred from that fit).
const SLOT_DEFENSE = /^([+-]\d+(?:\.\d+)?)% (Chest Armou?r|Helmet) Defense$/i;
const SLOT_DEFENSE_SLOTS = { "chest armor": "chest", "chest armour": "chest", helmet: "helmet" };
const emptyTotal = (key) => ({ ...describeStat(key), flat: 0, increased: 0, additional: 1, gearFlat: 0, gearIncreased: 0, base: 0, sources: [], gearItems: new Map() });

// Totals for the planner's build. `planner.modifierTexts` already holds gear (implicits, base
// affixes, crafted, legendary and corrosion lines), talents with ranks, cores, prisms, slates,
// kismets, pacts and hero memories. Synthetic lines (origin "derived": aura buffs, curses,
// Focus Buff damage written by build-mechanics) are damage restatements and are skipped.
export function characterStatTotals(planner, options = {}) {
  const lines = [
    // The derived lines of conditional lines (src/line-effects.js) are left out: a held condition the town panel meets is read from
    // its resolver entry instead (heldConditionalStatLines, every body once); the others are combat states, not panel stats.
    // Trait lines come from heroTraitStatLines below (planner.modifierTexts carries the same lines since talent batch chunk 4).
    ...(planner?.modifierTexts || []).filter((line) => line.origin !== "derived" && line.origin !== "trait" && !line.lineEffect?.conditional),
    ...heldConditionalStatLines(planner),
    ...heroTraitStatLines(planner?.state, planner?.heroMemories?.baseTraitLevel, undefined, { artificialMoon: planner?.heroMemories?.artificialMoon }),
    // An active Aura's added Attack and Cast Speed (Pantheon's Elegy on Precise: Swiftness; src/aura-gained-effects.js), scaled by its Aura Effect.
    ...auraSpeedStatLines(planner?.aura?.entries || []),
    // The stat sheet's panel-state lines (src/elixir-model.js elixirPanelLines); no damage path passes them.
    ...(options.extraLines || [])
  ];
  const totals = new Map();
  const unmatched = [];
  // Game recipes (default; research/recipe-interpreter-step1-2026-10-25.md §17, src/recipe-stat-layers.js): each line is read from
  // its affix recipe as well; the two agree → the text reading, a stat line only the recipe reads → the recipe's ("sum all stats"),
  // a difference → the recipe when its template is settled. TLI_STAT_PATH=text: the text readers only.
  const gameMode = statDataMode() === "game";
  const unitOf = (key) => describeStat(key).unit;
  const recipe = { mode: gameMode ? "recipe" : "text", verdicts: {}, differences: [], recipeOnly: [] };
  // A Dual Kismet's effects apply once even with both copies on the pact page.
  const dualSeen = new Set();
  const chestDefense = [];
  for (const line of lines) {
    // "+X% (additional) Defense gained from Chest Armor" (The Brave (3,4); game affixes 810999 / 200000244: node 321 on the item's
    // attributes 4001 / 4002 / 1601, mod 3 / 4, condition 221 slot 4): the chest's own Armor, Evasion and Energy Shield, like that item's
    // own "+X% gear Armor" lines (2026-11-09, 25 T gap 3: the town panel's Total Armor 223,851 needs the Rag's 5,328 × 1.4).
    const dual = line.origin === "kismet" && String(line.source).match(/Dual Kismet: (.+)$/)?.[1];
    if (dual) { const key = `${dual}|${line.text}`; if (dualSeen.has(key)) continue; dualSeen.add(key); }
    const clean = String(line.text || "").replace(/\s+/g, " ").trim();
    const lineMultiplier = Number.isFinite(line.multiplier) ? line.multiplier : 1;
    const chest = clean.match(CHEST_DEFENSE);
    if (chest) { chestDefense.push({ line, slot: "chest", value: Number(chest[1]) * lineMultiplier, additional: Boolean(chest[2]) }); continue; }
    const slotDefense = clean.match(SLOT_DEFENSE);
    if (slotDefense) { chestDefense.push({ line, slot: SLOT_DEFENSE_SLOTS[slotDefense[2].toLowerCase()], value: Number(slotDefense[1]) * lineMultiplier, additional: false }); continue; }
    // A panel-state line states its own contribution (the conditional "+X% additional Elixir Skill Effect": src/elixir-model.js).
    // Dual Kismet: Hatch Out's "+30% Sealed Mana Compensation when you have no Energy Shield" (game affix 916287744): the planner's gate
    // (src/sealed-mana-compensation.js, planner.aura.pageSealedManaCompensation) settles it; its Aura levels are not a panel stat.
    const gated = noEnergyShieldContributions(line, planner);
    const textContributions = line.contributions || gated || parseCharacterStatClause(line.text);
    const choice = gameMode && !line.contributions && !gated ? chooseStatReading(line, textContributions, unitOf) : { contributions: textContributions, verdict: textContributions.length ? "text" : "none" };
    recipe.verdicts[choice.verdict] = (recipe.verdicts[choice.verdict] || 0) + 1;
    if (choice.verdict.startsWith("differ")) recipe.differences.push({ source: line.source, text: line.text, verdict: choice.verdict, affix: choice.recipe?.id, textReading: textContributions, recipeReading: choice.recipe?.contributions });
    if (choice.verdict === "recipe-only") recipe.recipeOnly.push({ source: line.source, text: line.text, affix: choice.recipe?.id, reading: choice.contributions });
    const contributions = choice.contributions;
    if (!contributions.length) { unmatched.push(line); continue; }
    const multiplier = Number.isFinite(line.multiplier) ? line.multiplier : 1;
    for (const item of contributions) {
      if (!totals.has(item.stat)) totals.set(item.stat, emptyTotal(item.stat));
      const total = totals.get(item.stat);
      const value = item.value * multiplier;
      if (item.bucket === "additional") total.additional *= 1 + value / 100;
      // A fixed value (node 336) replaces the pool; two fixes keep the lower (none of the catalogs has two on one attribute).
      else if (item.bucket === "fixed") total.fixed = Math.min(Number.isFinite(total.fixed) ? total.fixed : Infinity, item.value);
      else total[item.bucket] += value;
      if (item.bucket === "gearFlat" || item.bucket === "gearIncreased") {
        const gear = total.gearItems.get(line.source) || { flat: 0, increased: 0 };
        gear[item.bucket === "gearFlat" ? "flat" : "increased"] += value;
        total.gearItems.set(line.source, gear);
      }
      total.sources.push({ source: line.source, origin: line.origin, text: line.text, bucket: item.bucket, value });
    }
  }
  // The chest's own defences take the "Defense gained from Chest Armor" lines (above), as that item's local %; a slot-named Defense line
  // ("+100% Chest Armor Defense", "-50% Helmet Defense") its item's.
  const slotItem = (slot) => (planner?.equipment?.candidateItems || []).find((item) => item.slot === slot && !(planner?.state?.disabledEquipmentSlots || []).includes(slot));
  for (const { line, slot, value, additional } of chestDefense) {
    let applied = false;
    const chestItem = slotItem(slot);
    for (const key of ["armor", "evasion", "maxEnergyShield"]) {
      const total = totals.get(key);
      const gear = chestItem && total?.gearItems.get(chestItem.name);
      if (!gear?.flat) continue;
      if (additional) gear.additional = (gear.additional ?? 1) * (1 + value / 100); else gear.increased += value;
      total.sources.push({ source: line.source, origin: line.origin, text: line.text, bucket: additional ? "gearAdditional" : "gearIncreased", value, item: chestItem.name });
      applied = true;
    }
    if (!applied) unmatched.push(line);
  }
  for (const total of totals.values()) finalize(total, planner);
  const stats = [...totals.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
  return { stats, byKey: Object.fromEntries(stats.map((stat) => [stat.key, stat])), unmatched, recipe };
}

const rank = (key) => { const index = ORDER.indexOf(key); return index < 0 ? ORDER.length : index; };
const round = (value) => Math.round(value * 1000) / 1000;

function finalize(total, planner) {
  total.gearTotal = round([...total.gearItems.values()].reduce((sum, gear) => sum + gear.flat * (1 + gear.increased / 100) * (gear.additional ?? 1), 0));
  delete total.gearItems;
  total.flat = round(total.flat);
  total.increased = round(total.increased);
  total.additional = round(total.additional);
  if (total.group === "Attributes") {
    // Character base attributes are 0 (the SS21 panel's Strength -10 = +20 gear - 30 All Stats).
    total.value = round(total.flat * (1 + total.increased / 100) * total.additional);
    total.formula = total.additional !== 1 ? "flat × (1 + increased%) × additional" : "flat × (1 + increased%)";
    total.damagePath = total.key === "intelligence" && planner?.theoretical?.ledger?.some((entry) => /Total Intelligence/.test(entry.source))
      ? "Main-stat damage in calc (0.5% additional per point)"
      : "Not used by the modeled damage path";
    return;
  }
  if (["maxLife", "maxMana", "maxEnergyShield", "armor", "evasion"].includes(total.key)) {
    total.value = null;
    total.formula = "components only: character base values and the scope of Defense are not sourced";
    return;
  }
  if (total.base) { total.value = null; total.formula = "weapon base value, per weapon (not summed)"; return; }
  if (total.unit === "%") {
    total.value = round(total.increased + total.flat);
    total.formula = total.additional !== 1 ? "sum of % lines; additional lines multiply separately" : "sum of % lines";
    const element = total.key.match(/^(fire|cold|lightning|erosion)Resistance$/)?.[1];
    const entry = element && planner?.resistances?.entries?.find((item) => item.element.toLowerCase() === element);
    if (entry) { total.capped = entry.effective; total.maximum = entry.maximum; }
    return;
  }
  total.value = total.flat;
  total.formula = total.increased || total.additional !== 1 ? "flat sum; increased / additional % shown beside it" : "sum of flat lines";
}

// Display rows grouped for the stat sheet. Each row carries a breakdown for its hover text.
const signedText = (value, unit = "") => `${value > 0 ? "+" : ""}${Math.round(value * 100) / 100}${unit}`;
const BUCKET_LABEL = { flat: "flat", increased: "increased", additional: "additional", gearFlat: "gear flat", gearIncreased: "gear % (this item)", gearAdditional: "gear additional (this item)", base: "weapon base", fixed: "fixed value" };
export function characterStatRows(totals, format = (value) => String(Math.round(value * 100) / 100)) {
  const groups = Object.fromEntries(characterStatGroups.map((group) => [group, []]));
  for (const stat of totals.stats) {
    const extras = [];
    if (stat.increased && stat.unit !== "%" && stat.group !== "Attributes") extras.push(`${signedText(stat.increased, "%")} increased`);
    if (stat.additional !== 1) extras.push(`×${stat.additional} additional`);
    let value;
    if (stat.base) value = stat.sources.filter((item) => item.bucket === "base").map((item) => format(item.value)).join(" / ");
    else if (stat.value === null && Number.isFinite(stat.fixed)) value = `fixed at ${format(stat.fixed)}`;
    else if (stat.value === null) value = [
      stat.flat ? `${signedText(stat.flat)} flat` : null,
      stat.gearFlat ? `gear ${format(stat.gearFlat)}${stat.gearIncreased ? ` → ${format(stat.gearTotal)}` : ""}` : null,
      ...extras
    ].filter(Boolean).join(" · ") || "—";
    else if (stat.group === "Attributes") value = format(stat.value);
    else if (stat.unit === "%") value = [stat.value || !extras.length ? signedText(stat.value, "%") : null, ...extras, Number.isFinite(stat.capped) ? `${format(stat.capped)}% applied (max ${format(stat.maximum)}%)` : null].filter(Boolean).join(" · ");
    else value = [stat.value || !extras.length ? signedText(stat.value) : null, ...extras].filter(Boolean).join(" · ");
    const breakdown = [
      `${stat.label} · ${stat.formula}`,
      ...(stat.damagePath ? [stat.damagePath] : []),
      ...stat.sources.map((item) => `${item.source}: ${item.text} → ${signedText(item.value, ["flat", "gearFlat", "base"].includes(item.bucket) && stat.unit !== "%" ? "" : "%")} ${BUCKET_LABEL[item.bucket]}`)
    ].join("\n");
    groups[stat.group].push({ label: stat.label, value, breakdown, key: stat.key });
  }
  return characterStatGroups.map((group) => ({ title: group, rows: groups[group] })).filter((group) => group.rows.length);
}
