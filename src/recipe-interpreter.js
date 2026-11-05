// Recipe interpreter, step 1 (shadow mode; research/recipe-interpreter-step1-2026-10-25.md). Reads an affix's game recipe
// (config_affix_effect rows, src/data/game/affix-recipes.generated.js) instead of its English text and returns structured effects:
//   { id, row, node, kind, attr?, field?, concept, bucket, value, upper?, scope[], target, conditions[], evidence, ... }
// Step 2 (2026-10-25, research/recipe-interpreter-step1-2026-10-25.md §9): the Trauma damage path reads it through
// src/recipe-trauma-layers.js; the other DoT paths (§11, §14: recipe-ignite-layers, recipe-dot-layers) and the hit side (§15:
// src/recipe-hit-layers.js, src/recipe-hit-aggregates.js) followed. scripts/compare-*recipes.mjs and the tests read it too.
// Line ids (2026-10-25, §13): lineGameIds() finds the game affix ids of a talent / core / slate / prism / kismet / hero trait /
// memory line from AFFIX_LINE_IDS (config_talent, config_hero_character_tier, config_modifier), and interpretLine({ line })
// resolves the line by those ids instead of by its English text.
//
// Evidence levels used in the tables below:
//   sourced  - the game's own data names it: config_attributes English name (attribute-definitions.generated.js), the skill tag /
//              buff localization (AFFIX_TAG_NAMES / AFFIX_BUFF_NAMES), the panel formula table (calc-data-review §2.2), or the
//              executable's enum names quoted in research/ignite-attribute-mapping-2026-10-09.md §2.
//   inferred - read from the parameters and the templates that use the node / id (co-occurrence); not confirmed in game.
// The generated table is about 1.2 MB: loadAffixRecipes() (dynamic import; src/recipe-trauma-layers.js awaits it at load) or
// setAffixRecipeData().
import { lineNumbers, placeholderOrder, shape } from "./affix-shape.js";
import { normalizePercentageText } from "./percentage-text.js";

let DATA = null;
let lineIndex = null;
const EMPTY_NAMES = Object.freeze({ field: {}, label: {}, state: {}, attrTag: {}, skillTag: {}, resource: {}, blackboard: {} });
const EMPTY_DATA = Object.freeze({ AFFIX_RECIPES: {}, AFFIX_ATTRIBUTE_LABELS: {}, AFFIX_TAG_NAMES: {}, AFFIX_BUFF_NAMES: {}, AFFIX_GAME_NAMES: EMPTY_NAMES, AFFIX_SOURCE_IDS: {}, AFFIX_LINE_IDS: {} });
/**
 * Install the generated module's exports ({ AFFIX_RECIPES, AFFIX_ATTRIBUTE_LABELS, AFFIX_TAG_NAMES, AFFIX_BUFF_NAMES,
 * AFFIX_GAME_NAMES, AFFIX_SOURCE_IDS, AFFIX_LINE_IDS, AFFIX_RECIPE_SOURCE }).
 */
export function setAffixRecipeData(data) {
  DATA = data ? { ...EMPTY_DATA, ...data, AFFIX_GAME_NAMES: { ...EMPTY_NAMES, ...(data.AFFIX_GAME_NAMES || {}) } } : null;
  lineIndex = null;
}
export async function loadAffixRecipes() {
  if (!DATA) setAffixRecipeData(await import("./data/game/affix-recipes.generated.js"));
  return DATA;
}
/** Whether a recipe table is installed (loadAffixRecipes / setAffixRecipeData). */
export const affixRecipesLoaded = () => DATA !== null;
const data = () => DATA || EMPTY_DATA;
const gameName = (table, id) => data().AFFIX_GAME_NAMES[table]?.[id] ?? null;

// ---------------------------------------------------------------------------------------------------------------------------
// Buckets (recipe `mod`; calc-data-review §2.3, sourced from the panel formula tokens B / X / E).
export const MOD_BUCKET = Object.freeze({ 0: "flag", 1: "flat", 2: "added", 3: "increased", 4: "additional", 5: "total" });

// Attribute concepts the planner's ledgers use. Names are config_attributes (sourced); the concept key and damage type are the
// planner's vocabulary. `panel`: the attribute appears in a config_attributes_show damage / DoT formula with X / E / B tokens.
const C = (concept, extra = {}) => ({ concept, evidence: "sourced", ...extra });
export const ATTRIBUTE_CONCEPTS = Object.freeze({
  5719: C("damage", { type: "all", panel: true }),
  5727: C("damage", { type: "elemental", panel: true }),
  5002: C("damage", { type: "physical", panel: true }),
  5107: C("damage", { type: "fire", panel: true }),
  5108: C("damage", { type: "lightning", panel: true }),
  5109: C("damage", { type: "cold", panel: true }),
  5402: C("damage", { type: "erosion", panel: true }),
  5806: C("maxDamage", { type: "all" }), 5812: C("minDamage", { type: "all" }), 5801: C("maxDamage", { type: "physical" }), 5807: C("minDamage", { type: "physical" }), 5802: C("maxDamage", { type: "lightning" }),
  // "Abnormal damage actual base value bonus": read by the ailment magnitude at application (2026-10-06 trace; ignite mapping §2.3).
  3604: { concept: "ailmentDamageAtApplication", evidence: "inferred", note: "config name 'Abnormal damage actual base value bonus'; ailment magnitude at application (trace 2026-10-06)" },
  5720: C("damageTaken", { type: "all" }), 5003: C("damageTaken", { type: "physical" }), 5120: C("damageTaken", { type: "fire" }), 5121: C("damageTaken", { type: "cold" }),
  5122: C("damageTaken", { type: "lightning" }), 5123: C("damageTaken", { type: "elemental" }), 5408: C("damageTaken", { type: "erosion" }), 5813: C("damageTaken", { type: "dot" }),
  5821: C("baseAilment", { type: "trauma", panel: true }), 5823: C("baseAilment", { type: "ignite", panel: true }), 5824: C("baseAilment", { type: "wilt", panel: true }),
  3601: C("ailmentDuration"), 3602: C("ailmentDurationReceived"),
  3401: C("statusEffect", { note: "Inflicted status effect: the filter tag names the status (Aura 5100305, Blur 5100205, Curse …)" }),
  3402: C("statusDuration"), 3410: C("statusEffectReceived"), 3413: C("statusDurationEfficiency"),
  3440: C("activeStackLimit", { note: "Maximum buff effects to give: with an ailment tag, that ailment's active limit" }), 3442: C("maxBuffStacks"),
  4802: C("critRating", { panel: true }), 4803: C("critDamage", { panel: true }),
  6001: C("attackSpeed"), 6002: C("castSpeed"), 6003: C("warcrySpeed"), 6005: C("projectileSpeed"), 6007: C("cooldownRecoverySpeed"),
  6008: C("reapingDuration"), 6009: C("reapingRecoverySpeed"),
  5724: C("afflictionEffect", { panel: true, note: "Damage increases per Affliction (default 0.01)" }),
  6201: C("skillArea"), 6221: C("skillCost"), 1304: C("sealedManaCompensation"), 6350: C("multistrikeIncrement"), 6351: C("multistrikeSpeed"),
  6360: C("spellBurstChargeSpeed", { panel: true }), 6361: C("maxSpellBurst", { panel: true }), 7030: C("focusSpeed"), 5722: C("jumpDamageFalloff"), 5901: C("centerDamage"), 5902: C("dotDynamicBonus"),
  1: C("strength"), 2: C("dexterity"), 3: C("intelligence"), 4: C("movementSpeed"),
  1001: C("maxLife"), 1301: C("maxMana"), 1601: C("maxEnergyShield"), 4001: C("armor"), 4002: C("evasion"),
  5101: C("resistance", { type: "fire", panel: true }), 5102: C("resistance", { type: "lightning", panel: true }), 5103: C("resistance", { type: "cold", panel: true }),
  5401: C("resistance", { type: "erosion", panel: true }), 5741: C("resistance", { type: "elemental", panel: true }),
  5127: C("maxResistance", { type: "fire", panel: true }), 5128: C("maxResistance", { type: "lightning", panel: true }), 5129: C("maxResistance", { type: "cold", panel: true }), 5409: C("maxResistance", { type: "erosion", panel: true }),
  5104: C("penetration", { type: "fire", panel: true }), 5105: C("penetration", { type: "lightning", panel: true }), 5106: C("penetration", { type: "cold", panel: true }), 5414: C("penetration", { type: "erosion", panel: true }),
  5111: C("conversion", { type: "physical>lightning", panel: true }), 5112: C("conversion", { type: "physical>cold", panel: true }), 5113: C("conversion", { type: "physical>fire", panel: true }), 5403: C("conversion", { type: "physical>erosion", panel: true }),
  5116: C("conversion", { type: "cold>fire" }), 5114: C("conversion", { type: "lightning>cold" }), 5115: C("conversion", { type: "lightning>fire" }), 5404: C("conversion", { type: "lightning>erosion" }), 5405: C("conversion", { type: "cold>erosion" }), 5406: C("conversion", { type: "fire>erosion" }),
  5130: C("addedAs", { type: "physical>fire" }), 5131: C("addedAs", { type: "physical>cold" }), 5132: C("addedAs", { type: "physical>lightning" }), 5410: C("addedAs", { type: "physical>erosion" }),
  5411: C("addedAs", { type: "fire>erosion" }), 5412: C("addedAs", { type: "cold>erosion" }), 5413: C("addedAs", { type: "lightning>erosion" }), 5417: C("addedAs", { type: "cold>fire" }),
  1002: C("lifeRegenerationSpeed"), 1003: C("lifeRegeneration"), 1004: C("lifeRegenerationPercent"), 1320: C("lifeRegainInterval"), 1610: C("shieldRegainInterval"),
  1602: C("energyShieldChargeSpeed"), 1604: C("energyShieldChargeInterval"), 1605: C("energyShieldRegenerationPercent"), 4800: C("attackBlockChance"), 4801: C("spellBlockChance"),
  6301: C("restorationEffect"), 6225: C("barrierAbsorption"), 6321: C("sentryFrequency"), 6322: C("maxSentries"), 3430: C("knockbackDistance"), 6340: C("beamLength"),
  // Completeness pass (2026-10-25): every remaining attribute the mapped recipes write, mapped from its config_attributes name.
  // "Damage taken converted": own damage taken changes type before mitigation (defensive). [sourced: config_attributes names]
  5117: C("damageTakenConversion", { type: "physical>fire" }), 5118: C("damageTakenConversion", { type: "physical>cold" }), 5119: C("damageTakenConversion", { type: "physical>lightning" }),
  5124: C("damageTakenConversion", { type: "physical>randomElemental" }), 5407: C("damageTakenConversion", { type: "physical>erosion" }), 5133: C("damageTakenConversion", { type: "cold>fire" }),
  5134: C("damageTakenConversion", { type: "lightning>cold" }), 5135: C("damageTakenConversion", { type: "lightning>fire" }), 5136: C("damageTakenConversion", { type: "erosion>randomElemental" }),
  5728: C("damageTakenConversion", { type: "cold>erosion" }), 5729: C("damageTakenConversion", { type: "lightning>erosion" }), 5730: C("damageTakenConversion", { type: "fire>erosion" }),
  5731: C("damageTakenConversion", { type: "erosion>physical" }), 5732: C("damageTakenConversion", { type: "erosion>lightning" }), 5733: C("damageTakenConversion", { type: "erosion>cold" }),
  5734: C("damageTakenConversion", { type: "erosion>fire" }), 5736: C("damageTakenConversion", { type: "fire>lightning" }), 5737: C("damageTakenConversion", { type: "fire>cold" }),
  5739: C("damageTakenConversion", { type: "cold>lightning" }),
  4503: C("damageReflection", { type: "physical" }), 4504: C("damageReflection", { type: "lightning" }), 4505: C("damageReflection", { type: "cold" }), 4506: C("damageReflection", { type: "fire" }),
  6226: C("barrierAbsorption", { type: "physical" }), 6227: C("barrierAbsorption", { type: "lightning" }), 6228: C("barrierAbsorption", { type: "cold" }), 6229: C("barrierAbsorption", { type: "fire" }), 6230: C("barrierAbsorption", { type: "erosion" }),
  6302: C("deteriorationDamage", { note: "config name 'Putrefy Damage' = Deterioration (templates 'X% Deterioration Damage')" }),
  1302: C("manaRegenerationSpeed"), 1303: C("manaRegeneration"), 1307: C("manaRegenerationPercent"), 1306: C("damageTakenFromMana"), 1607: C("energyShieldChargePerSecond"),
  3620: C("commandPerSecond"), 3621: C("commandReturnSpeed"), 3630: C("elixirDuration"), 3631: C("elixirEffect"), 6300: C("restorationDuration"),
  6310: C("tangleAttachRange"), 6320: C("sentryStartTime"), 6323: C("sentriesPerDeploy"), 6330: C("buffAreaDurationExtension"),
  21: C("trackingArea", { note: "config name 'Alert Radius'; templates 'Tracking Area' / 'tracking distance for Sentries'" }), 23: C("forcedTeleportRange"),
  // No config_attributes row; named by its single-write template "X% additional Bomb Throwing Speed". [inferred]
  6390: { concept: "bombThrowingSpeed", evidence: "inferred", note: "no config_attributes row; templates 'X% additional Bomb Throwing Speed'" },
  7010: { concept: "burstCooldownRecoverySpeed", evidence: "sourced", note: "config_attributes internal name 'kuangren1chufabaolielengquesudu' (Berserker 1: Burst trigger cooldown speed); template '+X% Burst Cooldown Recovery Speed for every X Rage' (to 70101)" },
  7000: { concept: "fervorEffectOnSkill", evidence: "sourced", note: "config_attributes internal name 'zhanyi_duizhuanzhujineng_xiaoguo' (Fervor's effect on the supported skill)" },
  // Line ids (2026-10-25, §13): attributes of the talent / trait / kismet / memory recipes added with the line ids.
  3611: C("orderDecreasePerSecond"), 3612: C("orderEffect"), 3613: C("chaosEffect"),
});
// Five-digit (and longer) ids ending in 1 are attr × 10 + 1, and ids ending in 2 are field × 10 + 2: a buff / derived layer of the
// base id. They appear in buff carriers (306), conversions (114 / 119 / 126 / 632), next-action buffs (624) and per-entity
// scaling (700). [inferred, medium: research/ignite-attribute-mapping §2.2; calc-data-review §2.3]
// Direct writes (node 101 `a`): an id is derived only when config_attributes lacks it (label table `base`). Encoded positions
// (conversion `to` / `from`, 624 `aFL`, 700 `addType`) always use the encoding, even where the id is also an attribute (to 21 =
// Dexterity, not Alert Radius: "+X Dexterity per X level(s)").
// Completeness pass: ids ending in 3 are label × 10 + 3 (30010503 = label 3001050 "projectiles can return", 30000903 = label
// 3000090 "damage is Lucky"; templates "chance for … Projectiles to return", "Damage becomes Lucky"). Each decoded id is a row of
// its own game table (config_char_field for × 10 + 2, config_char_label for × 10 + 3), which settles the encoding. [sourced]
export function baseId(id, { encoded = false } = {}) {
  if (typeof id !== "number") return { base: id, layer: null };
  if (encoded) {
    if (id % 10 === 1) return { base: (id - 1) / 10, layer: "derived" };
    if (id % 10 === 2 && id >= 1000000) return { base: (id - 2) / 10, layer: "derivedField" };
    if (id % 10 === 3 && id >= 30000000 && id < 40000000) return { base: (id - 3) / 10, layer: "derivedLabel" };
    return { base: id, layer: null };
  }
  const labelBase = data().AFFIX_ATTRIBUTE_LABELS[id]?.[2];
  if (labelBase !== undefined && labelBase !== null) return { base: labelBase, layer: "derived" };
  if (id >= 10000000 && id % 10 === 2) return { base: (id - 2) / 10, layer: "derivedField" };
  if (id >= 30000000 && id < 40000000 && id % 10 === 3) return { base: (id - 3) / 10, layer: "derivedLabel" };
  return { base: id, layer: null };
}

// Skill / character fields written by node 108 (and 336). Executable enum names quoted in the ignite mapping §2.3 are sourced.
// Completeness pass (2026-10-25): every field id the recipes use has a config_char_field row ([internal name, Chinese description],
// AFFIX_GAME_NAMES.field) except 2006591; the concepts below agree with those descriptions (checked one by one; the English in the
// comments is the translation), so fieldMeaning reports them as sourced. Fields without a concept here are still named by the
// game table (concept "field:<internal name>", conceptMapped false).
const F = (concept, evidence = "inferred", extra = {}) => ({ concept, evidence, ...extra });
export const FIELD_CONCEPTS = Object.freeze({
  2006400: F("skillLevel", "sourced"), 2006480: F("ailmentChance", "sourced", { type: "ignite" }), 2006510: F("ailmentChance", "sourced", { type: "trauma" }), 2006520: F("ailmentChance", "sourced", { type: "wilt" }),
  2006591: F("ailmentChance", "sourced", { type: "elemental" }), 2006467: F("afflictionPerSecond", "sourced"), 2006249: F("damageEnhancement", "sourced"), 2010024: F("damageToLife", "sourced"),
  2600611: F("extraIgniteLayers", "sourced"), 2010090: F("extraCurseSlots", "sourced"),
  // 召唤物最大数量 "max summon quantity" (templates name Spirit Magi; the field is every summon's cap).
  2006100: F("maxMinions"), 2006224: F("doubleDamageChance"), 2006247: F("armorPenetration"), 2006330: F("damageAvoidance"), 2006460: F("blockRatio"), 2006471: F("blockRatioLimit"),
  2006020: F("maxCharges"), 2006240: F("multistrikeChance"), 2006252: F("initialMultistrikeCount"), 2006660: F("injuryBuffer"), 2010220: F("lifeRegain"), 2010230: F("shieldRegain"),
  2006050: F("maxChanneledStacks"), 2006051: F("minChanneledStacks"), 2006108: F("projectileQuantity"), 2006111: F("jumps", "inferred", { type: "chain" }), 2006204: F("jumps", "inferred", { type: "projectile" }), 2006213: F("projectilePenetration"),
  2006214: F("projectileSplits"), 2006216: F("projectileSize"), 2006257: F("comboFinisherAmplification"), 2006262: F("shotgunCoefficient"), 2006592: F("elementalAilmentAvoidance"),
  2011002: F("steepStrikeChance"), 2012000: F("shadowQuantity"), 2012060: F("beamRefractions"), 2012061: F("additionalBeams"), 2403040: F("maxTerraCharge"), 2006884: F("deteriorationChance"),
  // 几率触发麻痹 "chance to inflict Numbed": a Lightning ailment, so "Inflicts Numbed when dealing Hit Lightning Damage" = 100% here.
  2006900: F("illOmenEfficiency"), 2006530: F("ailmentChance", "inferred", { type: "numbed" }), 2006288: F("clockworkCoreCastInterval"), 2006780: F("critDamageMitigation"), 2010019: F("physique"), 2501029: F("barrageWaveDamage"), 2501030: F("barrageWaves"), 2501031: F("barrageWaveInterval"),
  // Completeness pass additions (meaning = the config_char_field description, translated; template wording agrees).
  2403020: F("terraChargeRecoverySpeed"), // 技能能量增加速度 "skill energy gain speed" (Terra Charge / Demolisher Charge restoration)
  2006206: F("knockbackChance"), // 几率触发击退
  2006104: F("maxSpacetimeIllusions"), // 角色拥有的代放实体数量上限 "max proxy-cast entities"
  2006215: F("maxProjectiles"), // 投射物数量上限 "projectile quantity cap"
  2007015: F("frostbiteRatingSet"), // 被我冰结的目标，冰结值修改为此数值 "targets I Frostbite have their Frostbite value set to this"
  2006770: F("weaponCritRatingFixed"), 2006771: F("weaponAttackSpeedFixed"), // 武器暴击值 / 攻速恒定时按此Field值来充当
  2010063: F("supportManaMultiplierFixed"), // 固定技能石魔力倍率的值
  2006322: F("maxResistanceAsEffectiveChance", "inferred", { type: "cold" }), 2006323: F("maxResistanceAsEffectiveChance", "inferred", { type: "fire" }),
  2006321: F("maxResistanceAsEffectiveChance", "inferred", { type: "lightning" }), 2006324: F("maxResistanceAsEffectiveChance", "inferred", { type: "erosion" }),
  2006243: F("armorEffectiveRate", "inferred", { type: "lightning" }), 2006244: F("armorEffectiveRate", "inferred", { type: "cold" }),
  2006245: F("armorEffectiveRate", "inferred", { type: "fire" }), 2006246: F("armorEffectiveRate", "inferred", { type: "erosion" }), // 护甲对X伤害效率
  2006474: F("penetrationAlsoErosion", "inferred", { type: "lightning" }), 2006475: F("penetrationAlsoErosion", "inferred", { type: "cold" }), 2006476: F("penetrationAlsoErosion", "inferred", { type: "fire" }),
  2006885: F("deteriorationTakenPerStack"), 2006886: F("deteriorationTakenPerStackLimit"), 2006887: F("deteriorationTickBonus"), 2006888: F("deteriorationTickBonusLimit"),
  2010250: F("regainToRestorationOverTime"), 2010260: F("minionRegainShare"),
  2006248: F("mainAttributeDamageRatio"), // 每点主属性转增伤点数 "damage per point of main attribute"
  2006255: F("multistrikeMaxCountChance"), 2006256: F("maxMultistrikeCount"), // 连续攻击计数视为最大几率 / 连续攻击最大计数上限
  2006110: F("chainSplits"), 2006131: F("jumpRangeMin"), 2006133: F("jumpFlightDistance"), 2006136: F("projectileReturnDistance"),
  2006270: F("spellBurstExtraCastInterval"), // 法术迸发额外释放技能间隔时间
  2600691: F("dotRandomRangeMin"), 2600692: F("dotRandomRangeMax"), // BuffAction_1041 随机 DOT 最小 / 最大伤害百分比修正
  2006490: F("ailmentChance", "inferred", { type: "frostbite" }), // 几率触发冰结 "chance to inflict Frostbite" (a Cold ailment)
  2012021: F("shadowTrackingArea"), // 额外突刺方向索敌范围扩大
  2012080: F("growthGain"), // 生长值增加值 (Spirit Magus Growth)
  2600552: F("comboStarterSpreadRadius"), // 流焰炎蛇引-起手技2扩散半径加成
});
// Labels (node 107 effects, gate 213, × 10 + 3 encoded writes): flags read by code. Every label id the recipes use is a
// config_char_label row; its internal name and Chinese description are the meaning (AFFIX_GAME_NAMES.label). English for the
// labels the fixture builds carry (translated from the description): [sourced]
export const LABEL_MEANINGS = Object.freeze({
  3001050: "projectiles can return", 3000090: "damage is Lucky", 3001211: "cannot deal Critical Strikes", 3100401: "Thunder Slash: additional Steep Strikes",
});

// Effect nodes. kind: what the interpreter emits. Coverage of the planner-mappable recipes (affix-recipes.generated.js, 2026-10-25):
// the 30 kinds below cover about 91% of effect nodes.
const N = (kind, meaning, evidence = "inferred") => ({ kind, meaning, evidence });
export const NODE_TYPES = Object.freeze({
  101: N("attr", "write attribute `a` with bucket `m` (1 flat, 2 added range, 3 increased, 4 additional)", "sourced"),
  b: N("attr", "attribute write inside a timed buff (node 306 carrier)", "sourced"),
  108: N("field", "add `value` to skill / character field `field`"),
  336: N("fieldSet", "set field `field` to `value` (\"is fixed at\", \"is set to\")"),
  // Client 0x141a5ece0 (SS13 copy): with several rows listed it runs one at random. No mapped recipe lists several (7 uses in the whole table).
  111: N("routing", "start row number(s) `affixes` of the same affix on each unit the filter picks (3 minions, 8 enemies), and take it off units that stop passing", "sourced"),
  114: N("convert", "for every `fromValue` of attribute `from` (attr × 10 + k, fromMod), add `toLowerValue` to `to` (toMod)"),
  119: N("perStat", "for every `fromValue` of stat source `from` (level, Mana, Rage, Fervor, Blur Rating …), add `toLowerValue` to `to` (toMod)"),
  126: N("share", "a fraction `toLowerValue` of the owner's `from` is also applied to `to` (Minions)"),
  632: N("perTargetStat", "per target stat `from` (target Life, Ailments on the enemy), add `toLowerValue` to `to`"),
  700: N("perEntity", "per counted entity, write `addType` (attr × 10 + 1), up to `maxValueLimit`"),
  116: N("perStack", "row `affixEffect` runs once per stack of buff `buff` (every `fromEveryNum`, up to `maxLimit`); with no `affixEffect` the row's own writes scale"),
  306: N("buffCarrier", "timed buff (mode, duration, count) carrying attribute writes (node b)"),
  301: N("gainBuff", "gain / inflict buff `buff` (duration, num)"),
  302: N("refreshBuff", "refresh buff `buff`"),
  303: N("gainBuffPeriodic", "gain buff `buff` every `interval` s"),
  304: N("loseBuffStacks", "lose `stack` stacks of buff `buff`"),
  374: N("buffStacks", "add `addStackNum` stacks of buff `buffCfgId` for `buffDuration` s"),
  623: N("consumeBuff", "consume `num` stacks of buff `buffCfgId`"),
  625: N("buffBaseEffect", "change buff `buffCfgId`'s base effect"),
  626: N("buffDuration", "refresh / set buff `buffCfgId`'s duration"),
  629: N("injectAffix", "inject affixes `inst` into buff `buffId` (\"<Buff> gains an additional effect: …\"), scaled by that buff's effect", "sourced"),
  // "<Applied buff / debuff> gains an additional (base) effect": the affixes `inst` act on the buff's bearer (Tenacity Blessing
  // applied, inflicted Wilt, Intimidated). Same argument encoding as 629 (generator expands `inst`).
  642: N("injectAffixApplied", "inject affixes `inst` into an applied buff / debuff `buffId` (its bearer gets them)"),
  2221: N("repeatAffix", "repeat the affix's other rows once per trigger, up to `maxAddCnt` times (\"stacking up to N times\")"),
  624: N("nextAction", "the write `aFL` applies to the next action / loop of the skill"),
  612: N("counter", "count events `dataType` (by `value`) and activate row `affix`"),
  613: N("counter", "count events `dataType` and activate row `affix`"),
  610: N("recordEvent", "record event `dataType` for `timeLimit` s"),
  2320: N("triggerSkill", "trigger skill stone `stoneCfgId` at level `level`"),
  1035: N("castStoneSkill", "cast skill stone `stone`"),
  244: N("grantSupport", "socket support `supportStoneId` at `level` into skill position(s) `skillPos`"),
  231: N("triggerSkill", "cast skill stone `stone` at level `level` on the filter target (102321011, a map affix's parameter stone)"),
  373: N("rule", "start row number `affix` per stack of buff `buffCfgId` (\"Each stack of Focus additionally grants\": 709280)"),
  232: N("castMode", "change the supported skill's cast mode (instant cast …)"),
  107: N("label", "set state label `label` (a mode / flag read elsewhere)"),
  627: N("resource", "change fight resource `resourceType` (1 Fervor, 2 Blur Rating, 6 Affliction, 11 Spell Burst Charge …)"),
  2100: N("resource", "generate Rage"),
  434: N("resource", "add charging progress"),
  631: N("reap", "Reap `reapTime` s of DoT", "sourced"),
  343: N("extraStacks", "inflict `layerNum` additional stacks of ailment buff `keyValue` (130 Ignite, 150 Wilt, 160 Trauma) with `probability`", "sourced"),
  347: N("inflictAilment", "inflict ailment `ailmentType` with `value` base damage"),
  381: N("flatToBaseAilment", "gain `percent`–`percentMax`% of added flat damage as base ailment `ailmentType` damage", "sourced"),
  133: N("setBonus", "set bonus `setsType` (Dual Kismet: 2 copies on the pact page)"),
  1017: N("grantTalent", "grant talent `talentId`", "sourced"),
  // Step 6 (support stones in the table): 431287584 "Immediately settles the Deterioration Damage on enemies after the Combo
  // Finisher of the supported skill deals damage" (trigger: dealing DoT with the Combo Finisher tag; `rate` 100).
  1021: N("settleDot", "settle `rate`% of the remaining Deterioration damage on the target at once"),
  1003: N("cull", "eliminate enemies under `percent`% Life"),
  102: N("selfDrain", "lose Life / Energy Shield (type 1 Life, 3 Energy Shield)"),
  103: N("restore", "restore Life / Mana / Energy Shield (type 1 / 2 / 3)"),
  122: N("selfDrain", "consume % of Life / Mana (cost)"),
  370: N("restore", "restore `point` over `time` s"),
  124: N("energyShieldCharge", "start Energy Shield charge"),
  // Local item writes (completeness pass 2026-10-25): the attribute is `a` and the bucket the node's attrMod (generator: `m`).
  321: N("localAttr", "weapon / item-scoped write: attribute `a` (bucket attrMod) on the item its filter names (221 slot 2 Main-Hand, 209 item type: 'to the Main-Hand Weapon', 'gained from Chest Armor')"),
  363: N("localAttr", "gear-local write: attribute `a` (bucket attrMod) of the item itself ('+X gear Energy Shield', '+X% gear Attack Speed'; every template says 'gear')"),
  // Sourced: config_item_base links each item base to config_modifier rows item_base id × 10 + k whose affix is a 364 node
  // (item 1000 'Crude Iron Maul': rows 10002 -> 349651 '$P1$ Attack Speed', 10003 -> 170782 '$P1$ Critical Strike Rating').
  364: N("localAttr", "item base stat: attribute `a` (bucket attrMod) of the item base ('500 Critical Strike Rating', '1.2 Attack Speed', 'N Armor')", "sourced"),
  349: N("spreadAilment", "spread ailment `keyValue` (5100003 Ignite) within `radius` / 100 m with `probability`"),
  436: N("skillLogic", "switch the skill to logic `skillLogicId` (skill behaviour; skill data)"),
  2322: N("autoCast", "cast the supported skill automatically (`filterTag`, `withTarget`)"),
  501: N("blackboard", "blackboard array for a scripted effect"),
  112: N("routing", "start row number(s) `affixes` of the same affix"),
  378: N("buffStacks", "gain stacks of buff `buffCfgId`, up to `stackLimit`"),
  379: N("buffStacks", "keep / add stacks of buff `buffCfgId`"),
  1010: N("resource", "change energy (`energyType`)"),
  1014: N("damageLink", "transfer `linkPercent`% of damage taken to Minions"),
  1018: N("selfDamage", "take secondary damage `damageValue` of type `damageType`"),
  2230: N("resource", "gain charge stacks (`addRank`)"),
  2242: N("resource", "restore hero resource points"),
  725: N("noDps", "drop replication"), 727: N("noDps", "boss drop"), 2702: N("noDps", "boss drop"),
  500: N("blackboard", "set a blackboard value for a scripted effect"),
  2250: N("noDps", "play an animation montage"),
  2206: N("noDps", "drop quantity"), 2207: N("noDps", "drop quantity"), 2208: N("noDps", "drop quantity"), 2209: N("noDps", "drop quantity"), 2202: N("noDps", "drop quantity"), 2700: N("noDps", "drop quantity"),
  325: N("noDps", "map-type effect"),
  // Completeness pass (2026-10-25): the remaining effect nodes of the mapped recipes. Meanings read from each node's parameter
  // names and the templates that use it (inferred unless marked).
  109: N("rule", "grant the Tide Effect the template lists (Selena Tide; scripted, no parameters)"),
  123: N("defensive", "Energy Shield Charge cannot be interrupted for `duration` s"), 129: N("defensive", "Energy Shield cannot be interrupted for `duration` s after casting the supported skill"),
  130: N("sealResource", "seal `reservedValue` (a share of Max Mana when bPercentOrNum) and activate row(s) `affixes`"),
  131: N("rule", "flag: Non-Main Skills cannot be tangled or trigger Spell Burst (no parameters; the template is the rule)"),
  132: N("fieldCap", "cap field `field` at `value` (isUpperLimit: 'The max Split Quantity … is X')"),
  136: N("byDistance", "write `to` (toMod, toTags) scaled by the distance between beginDistance and endDistance m (distanceRate per m, clamped by min / max)"),
  137: N("temporaryResource", "excess Life / Mana restoration (type 1 / 2) becomes temporary Life / Mana for `duration` s"),
  225: N("loseState", "leave character state `state`"), 226: N("gainState", "enter character state `state`"), 227: N("gainState", "enter a random state of group `state` with `probability`% (Dance Steps)"),
  237: N("skillEntity", "create a skill entity (Ice Storm; scripted, no parameters)"), 239: N("castStoneSkill", "cast skill stone `stone`"),
  243: N("castMode", "restrict how the supported skill is cast (bCannotTrigger, bCannotCastOtherThanTrigger)"),
  307: N("gainBuff", "gain buff `buff` at its max stacks (toMaxLimit)"),
  323: N("perCount", "per empty Support Skill slot of skills tagged `tag`, the row's writes apply"),
  339: N("convert", "add a share `toLowerValue` of the Main-Hand weapon's (equipSlot 2) local `from` to `to` (toMod, toTags)"),
  341: N("rule", "Dirge mode `mode` (Iron Sentry's Dirge)"), 342: N("grantBuff", "grant buff / debuff `id` of kind `type` (1 buff, 2 debuff) to the filter targets in range"),
  345: N("cleanse", "remove negative effects with tags (rule `removeRule`) from self"),
  346: N("perStatusType", "per type of status with tags `tg` the bearer has (Aura, crowd control), activate row `affix`"),
  350: N("resource", "gain `num` Steep Strike attempt(s)"), 351: N("extraStacks", "inflict `layerNum` additional stacks with `probability`% on targets with the filter tags (Wilt)"),
  355: N("attrPer", "write attribute `a` (bucket `m`) per `everyXBounceLeft` Jump(s) remaining"),
  357: N("perAilmentType", "per Ailment type on the enemy, add `toLowerValue` to `to` (toMod, toTags), up to `limit`"),
  361: N("perCount", "per `everyX` Minion(s), activate row `affix`"), 371: N("buffDuration", "extend buff `buff` by `duration` s"),
  375: N("spreadAilment", "spread `stackNum` ailment stack(s) (buffCfgId / the event's) to enemies within `radius` / 100 m"),
  380: N("knockback", "(reverse) knock back the filter targets by `knockbackDist` / 100 m"),
  404: N("injectAffix", "gain buff `buffCfgId` for `buffDuration` s carrying the affixes `inst` (like 629)"),
  425: N("inflictArea", "inflict the template's ailment / debuff (Numbed, Paralysis, Weaken) on enemies in range (vfx `vfxCfgId`, `cooldown`)"),
  621: N("buffStacks", "own `num` additional stacks of buff `buffCfgId` (Blessings, Fortitude)"),
  622: N("statusEffectTaken", "status effect taken by enemies with the row's tags (Infiltration; byTags)"),
  628: N("resource", "change fight resource `resourceType` by `numValue` every `changeInterval` s"),
  639: N("resourceFixed", "fixed fight resource `resource` at `value` (1 Fervor Rating: 'Has X point(s) of fixed Fervor Rating')"),
  801: N("onDefeat", "on defeat, +`incChainNum` Jump(s) (usageKillNum)"), 802: N("gainBuff", "gain a random buff with the row's tags (a random Curse) at `buffLevel` for `duration` s"),
  807: N("skillMessage", "send blackboard key `bBKey` to a skill entity (Corrosion Orb fires)"),
  1011: N("extraStacks", "inflict `count` additional stack(s) of buff `buff` (180 Deterioration)"),
  1016: N("defensive", "keep at least 1 Life on fatal damage"), 1034: N("selfDamage", "take `value` Ignite damage every `duration` s"),
  1105: N("autoCast", "auto-cast the skill (Purgatory) at the filter target"), 1109: N("deemState", "treat the target as having state `charStateTag` (Low Life)"),
  1110: N("castStoneSkill", "cast the Trait Skill (Twisted Spacetime) at the victim's position"), 1111: N("traitInterval", "reduce the Trait Skill's casting interval (lPZ_Val)"),
  1112: N("recordDamage", "record `dmgPercent`% of damage dealt (Twisted Spacetime)"), 1114: N("trueDamagePercentLife", "deal True Damage equal to `removeHpPercent`% of Max Life"),
  2241: N("resource", "restore `point` hero resource points (Murderous Intent)"), 2243: N("recordDamage", "record `dmgPercent`% of damage dealt (Realm of Mercury)"),
  2312: N("castStoneSkill", "spawn skill stone `stone` (Mechanical Part)"), 2313: N("perStat", "for every `fromValue` of stat source `from` (64 Command), add `toLowerValue` to `to`"),
  2321: N("autoCast", "auto-use the supported skill (stopping moving)"), 2402: N("rule", "bombs detonate `time` s after landing"),
  2500: N("rule", "the Trait Skill can be channeled continuously (no parameters)"),
  736: N("noDps", "drop replication"), 2223: N("noDps", "drop a supply"), 2701: N("noDps", "drop quantity"), 3031: N("noDps", "map boss replication"),
  377: N("buffStacks", "set buff `buffCfgId`'s stack limit to `stackLimit` (Desecration up to 25)"), 2007: N("rule", "force a reload (no parameters; 'Forced to reload once Overheated …')"),
  // Line ids (2026-10-25, §13): the node types of the talent, core, hero trait, kismet, memory and prism recipes added with the
  // line ids (src/data/game/line-affix-ids.generated.js). Read from each node's parameters and the templates that use it. [inferred]
  127: N("rule", "trait-tier switch machinery on target type 22 (no parameters; Selena tier secondary 272316672, research 2026-10-07)"),
  134: N("modifierGroup", "apply config_modifier group `modifierGroup` again (\"Doubles added Spell Damage from Wand and Tin Staff weapons\": one node per Wand / Tin Staff added-damage group)"),
  205: N("attrThreshold", "the affix's other rows apply while attribute `a` is at least `value` (\"… while having at least X Intelligence\")"),
  238: N("setState", "apply character state `state` (Ceaseless Tide: state 4030401, Loud Song's Tide Effect)"),
  358: N("copyItemToMinion", "Minions gain the bonuses of the item in slot `equipSlot` (\"Minions gain the Main-Hand Weapon's bonuses\")"),
  435: N("addSkillTag", "add skill tag `tagsToAdd` to the skill"),
  808: N("skillLogic", "a skill rule for skills tagged `filterTagAnd` and not `filterTagNot` (Starfall Wasteland)"),
  1008: N("castStoneSkill", "cast skill stone `stone` at `level` (Self-Destruct Protocol on a Synthetic Troop defeat)"),
  1009: N("lifeRule", "set a Life value from the formula `hpNumber` (Red Shoes of Cruelty)"),
  1015: N("reapSettle", "on Reaping, settle `linkPercent`% of the remaining total Damage Over Time (then remove it)"),
  1036: N("nextUse", "after event `event`, the next `times` use(s) gain row `affix` (\"the next Main Skill deals …\")"),
  1100: N("skillLogic", "automatically try to use God's Boon when Focus Blessing is at max stacks (no parameters)"),
  1102: N("buffConvert", "convert buff `outBuffId` to `innerBuffId` and back, by buff `condBuffId` (Divine Realm Blessings)"),
  1104: N("skillLogic", "set label `outLabel` / `innerLabel` by buff `condBuffId` (max Blessing stacks shared inside / outside the Divine Realm)"),
  2008: N("skillLogic", "start with max Heat Up stacks without the opening reload (no parameters)"),
  2105: N("rule", "own Seething Spirit (no parameters)"),
  2109: N("grantSkill", "grant skill stone `skillStoneCfgId` (Hero's Resourcefulness)"),
  2260: N("rule", "a code rule run on dealing damage (no parameters; template-less trait affix 6145477)"),
  2410: N("skillLogic", "skill slot `skillPos` becomes a Scent Bottle (Elixir) slot (`specialChemicalSlot`: the Special bottle)"),
});

// Gate (condition) nodes. scopeLike: settled by the build itself (slot, weapon, skill tag, hero), not a combat condition.
const G = (kind, meaning, extra = {}) => ({ kind, meaning, evidence: "inferred", ...extra });
export const GATE_TYPES = Object.freeze({
  10: G("state", "self / skill state or tag `tag` holds", { evidence: "sourced" }),
  104: G("state", "character state `state` holds"),
  105: G("moving", "while moving"),
  1005: G("state", "a skill with tags `skillStoneTagsAnd` / buff tag `buffTag` is active (Elixir …)"),
  184: G("hasBuff", "has buff `buff`"),
  1000: G("hasBuff", "has buff `buff`"),
  185: G("buffStacks", "has at least `stack` stacks of buff `buff`"),
  227: G("buffMaxStacks", "buff `buff` is at max stacks"),
  188: G("probability", "succeeds with `probability`%", { evidence: "sourced" }),
  // Node 188 with a shared random draw (`qubitId`, `entanglementId`; 103011007's Malice Incarnation chance). Inferred from its parameters.
  190: G("probability", "succeeds with `probability`% (a shared random draw)"),
  189: G("range", "target within `range` / 100 m", { evidence: "sourced" }),
  206: G("cooldown", "at most once per `cooldown` s", { evidence: "sourced" }), 251: G("cooldown", "at most once per `cooldown` s"), 254: G("cooldown", "per-target recovery `cooldown` s", { evidence: "sourced" }), 6: G("cooldown", "interval `cooldown` s"),
  300: G("compare", "number comparison `leftNum` `operator` `rightNum` (1 > (templates 550 'greater than', 418378 'more than', 373150 / 742454 'exceeds', 590 'higher than'; batch 1 2026-10-27, it read '<'), 3 >=, 0 ==?, 2 <? (985442 'lower than'), 4 <=?; no reader depends on these labels)"),
  309: G("compare", "fight resource `fightResource` `operator` `num`"),
  218: G("compare", "resource `type` below / above `value`"),
  224: G("compare", "attribute `attr1` vs `attr2` (highest stat)"),
  3: G("count", "at least `count` + 1 entities (0: none) in range"), 4: G("count", "at least `count` + 1 entities in range"), 5: G("count", "entity count `count`"),
  610: G("recentEvent", "event `dataType` happened within `timeLimit` s"), 611: G("recentEvent", "event `dataType` happened within `timeLimit` s"),
  213: G("label", "state label `label` is set"),
  292: G("skillActive", "while the supported skill lasts"),
  290: G("resourceType", "resource `resourceType` is consumed"),
  208: G("skillTag", "the skill carries tag `tag`", { scopeLike: true }),
  209: G("weapon", "weapon type check", { scopeLike: true }), 21: G("weapon", "two-handed weapon", { scopeLike: true }),
  221: G("slot", "equipped in slot `slot`", { scopeLike: true }),
  11: G("hero", "hero character `matchHeroCharacter`", { scopeLike: true }),
  // Parameterless unit check (2026-10-31; was read as "the effect source is the affix's skill"): it sits on the holder in trigger filters
  // (And(189 range, 324 with filter targets [1]) on 122 Activation Medium / item triggers) and on each receiver in ally filters (targets
  // [9] / [20]). Inferred from those places: the checked unit is alive and able to act. Always true for the planner's units.
  324: G("unitAlive", "the checked unit is alive and able to act (inferred)", { scopeLike: true }),
  326: G("targetAttitude", "target is hostile", { scopeLike: true }),
  327: G("targetCheck", "target's Life is not locked", { scopeLike: true }),
  325: G("map", "map type", { noDps: true }), 293: G("map", "drop source", { noDps: true }), 7: G("map", "map / boss gate", { noDps: true }),
  // Completeness pass (2026-10-25): the remaining gate nodes, read from their parameters and templates. [inferred]
  321: G("slot", "engraved in engram slot `slot` ('(Engram N Exclusive)')", { scopeLike: true }),
  253: G("skillReady", "the supported skill can be cast now (off cooldown): 'Prepares … every X s', 'Always attempts to trigger … Interval'"),
  270: G("restorationActive", "a restoration effect of type `type` is active (1 / 2; 'when an Elixir Skill is active', 'during the supported skill's restoration effect')"),
  // An action the extraction files with the gates (it appears in condition trees elsewhere): reduce the current cooldown of the
  // skills its filter selects (208 Mobility / Potion tags) by curPercent% plus `second` s. 530229 has no other effect node.
  320: G("cooldownReset", "reduce the current cooldown of the filtered skills by `curPercent`% (+ `second` s)", { action: true }),
  226: G("energyShieldCharging", "Energy Shield is charging"), 217: G("energyShieldActive", "Energy Shield is above 0"),
  228: G("maxChanneledStacks", "the skill is at max channeled stacks"),
  322: G("skillEntityActive", "the skill's entity is active (Corrosion Orb)"), 323: G("skillEntityActive", "the skill's entity is active (Purgatory)"),
  281: G("traitSkillUsable", "the Trait Skill can be clicked (off cooldown)"), 262: G("skillCategory", "the triggering skill matches `categoryOrTag`", { scopeLike: true }),
  515: G("chargeFull", "the skill's charge (energyId: Demolisher Charge) is fully restored"), 328: G("firstTimeOnTarget", "the first time on this target"),
  230: G("counterReached", "event counter `type` reached (casts of Fire / Cold Skills)"), 311: G("markTriggered", "a Mark was triggered on the target"),
  // Always under a Not: "+X% additional damage for manually used Supported Skill" = Not(210) (twice, Or>Not), so 210 = the use
  // was triggered (not manual).
  210: G("triggeredUse", "the skill use was triggered, not manual (under Not: manually used)"),
  // Only seen as Not(301) on "Eliminate enemies under X% Life on hit" (112675, 710501): the target cannot be eliminated. [low]
  301: G("eliminationImmune", "the target is immune to elimination (low confidence; only seen negated on Eliminate lines)"),
  // Line ids (2026-10-25, §13). [inferred]
  20: G("itemType", "item check `type` = `value` (the Wand / Tin Staff added-damage groups of 519547104)", { scopeLike: true }),
  207: G("targetRarity", "target rarity `rarity` (1 normal, 2 magic: \"non-Elite enemies\")"),
});

// Event triggers (ids >= 1000000) that open a row. Meanings inferred from the templates that use them (ignite mapping §2.2 for
// 1000030 / 1000032 / 1000033 / 1000010 / 1000150 / 1000112). perHit: the trigger is the damage calculation of one damage record, so
// its writes apply to that record (a target / skill filter, not a time window). The name is historic: 1000031 fires for a hit and when
// a DoT's value is set (research/core-formulas-chunk0-2026-10-31.md §14), so only the Hit tag or a skill-type tag makes a row hit-only.
const T = (name, extra = {}) => ({ name, evidence: "inferred", ...extra });
export const TRIGGERS = Object.freeze({
  1000010: T("on defeating an enemy", { notOnDummy: true }), 1000015: T("on suffering a Severe Injury"), 1000030: T("on dealing damage"), 1000031: T("damage calculation (a hit, or a DoT's value being set)", { perHit: true }),
  1000032: T("on Reaping"), 1000033: T("on hit"), 1000036: T("on evading / avoiding damage"), 1000037: T("on being hit"), 1000038: T("on blocking"), 1000040: T("on taking damage"),
  1000041: T("on an ally / Minion taking damage"), 1000047: T("on you or your Minions dealing damage"), 1000060: T("on starting a skill cast"), 1000069: T("on casting a skill"),
  1000070: T("on using a skill (resource)"), 1000074: T("on using a skill"), 1000076: T("on Spell Burst activation"), 1000078: T("on casting the supported skill"),
  1000090: T("on entering a state"), 1000100: T("on leaving a state"), 1000110: T("on gaining buff stacks"), 1000111: T("on gaining a buff / resource"), 1000112: T("on gaining a buff"),
  1000120: T("on a buff ending"), 1000121: T("while a skill effect lasts (periodic)"), 1000131: T("on Energy Shield charge start"), 1000150: T("on inflicting an ailment / debuff"),
  1000160: T("on inflicting ailment stacks"), 1000303: T("on consuming Spell Burst"), 1000340: T("per Minion owned"), 1001200: T("on Regain"), 1001210: T("on Regain"),
  1001300: T("on consuming a skill charge (Demolisher / Terra Charge)"), 1001330: T("on consuming Focus Blessing (God's Boon)"), 1001600: T("map event", { noDps: true }),
  // Completeness pass (2026-10-25): every remaining trigger of the mapped recipes, named from its templates. [inferred]
  1000011: T("on taking fatal damage"), 1000017: T("on knocking back an enemy"), 1000022: T("on inflicting Affliction for the first time"),
  1000046: T("on damaging an enemy, before the damage applies"), 1000071: T("on reaching the Max Multistrike Count"), 1000072: T("on gaining a channeled stack"),
  1000073: T("while channeling (each channel tick)"), 1000079: T("on casting the Trait Skill (Holy Illumination)"), 1000080: T("on a skill use ending"),
  1000128: T("on triggering a Mark"), 1000140: T("on inflicting a tagged ailment (the tags name it: Ignite)"), 1000220: T("on reaching max channeled stacks"),
  1001040: T("on Recall (Youga: Projectiles recalled)"), 1001050: T("on reloading"), 1001150: T("on consuming ammo"), 1001152: T("on consuming Special Ammo"),
  1001160: T("on generating a Projectile"), 1001166: T("on entering a stage or reviving", { noDps: true }), 1001220: T("on each Jump of the skill"),
  1001280: T("on Spacetime Illusion consuming Mana"), 1001320: T("on each Barrage wave"), 1001420: T("on picking up a Mechanical Part"),
  1001801: T("on bombs detonating"), 1001850: T("on dealing area damage (enemies in the area counted)"),
  // Line ids (2026-10-25, §13): triggers of the talent / trait / kismet / memory recipes added with the line ids. [inferred]
  1000020: T("on a Minion or ally being defeated"), 1000021: T("on triggering Ill Omen"), 1000039: T("on dealing Damage Over Time (recorded by Twisted Spacetime)"),
  1000082: T("on equipping or refreshing a skill (low confidence; adds a skill tag)"), 1000122: T("on a tagged state starting (low confidence)"),
  1000123: T("on reaching max Heat Up stacks"), 1000124: T("on a tagged ailment being renewed on the enemy (low confidence; paired with 1000150 on the same rows)"),
  1000126: T("on consuming a tagged Blessing (\"if Agility Blessing was consumed recently\")"), 1000350: T("on a Blessing being devoured (God's Boon)"),
  1001167: T("on Bulwark being refreshed or broken"),
});

// Tags the localization does not name (skill_tag|des covers some 6xxxxxx skill tags). Sourced from the executable enum names quoted
// in research/ignite-attribute-mapping-2026-10-09.md §2.1, each checked 2026-10-25 against its config_attr_tag / config_char_state row
// (AFFIX_GAME_NAMES; 5100209 灵动状态 = Agility Blessing).
export const EXTRA_TAG_NAMES = Object.freeze({
  5000002: "this skill", 5000003: "hit damage", 5000004: "DoT damage flow", 5100309: "Damage Over Time", 5100001: "Ailment", 5100002: "Elemental Ailment",
  5100003: "Ignite", 5100006: "Trauma", 5100007: "Wilt", 5100305: "Aura", 5100205: "Blur", 5100210: "Focus Blessing", 5100209: "Agility Blessing",
  5001010: "Critical Strike", 5002060: "Minion", 5001990: "Elite", 5002000: "Boss", 5002030: "Rare monster", 5001130: "dealt Fire Damage",
  4000130: "Ignited", 4000560: "Cursed", 4000900: "max Affliction", 4000060: "Blur active", 4030400: "Bard form", 4000120: "Shocked", 4000121: "Numbed",
  // Completeness pass (2026-10-25): checked against config_char_state, which corrects four step-1 names: 4000110 is 冰封
  // (Frozen) and 4000112 冰结 (Frostbite; 530229 "defeating a Frostbitten enemy" uses 4000112), 4000150 中毒 (poison = Wilt,
  // like 5100007 中毒状态) and 4000160 流血 (bleeding = Trauma, like 5100006 流血状态), 4000530 双持 (Dual Wielding, as
  // src/support-effects.js Dual Onslaught already reads it). The others agree with their config_char_state rows.
  4000110: "Frozen", 4000112: "Frostbitten", 4000150: "Wilted", 4000160: "Traumatized", 4000411: "Full Life", 4000410: "Low Life", 4000700: "standing still",
  4000810: "during Multistrike", 4000910: "Elixir state", 4000530: "Dual Wielding",
});
// Completeness pass: English for attribute / state tags the fixture recipes use, translated from config_attr_tag /
// config_char_state (AFFIX_GAME_NAMES.attrTag / .state). [sourced: game table descriptions]
export const GAME_TAG_ENGLISH = Object.freeze({
  5009027: "Crimson Tide (Selena)", 5100101: "crowd control state", 5006051: "Special Ammo", 5200065: "Deterioration", 5100326: "Elixir state", 5100311: "Empower state",
  5002010: "Normal monster", 5002020: "Magic monster", 4000416: "Full Energy Shield",
});
const STATE_TAG = (tag) => (tag >= 4000000 && tag < 5000000) || tag === 5001990 || tag === 5002000 || tag === 5002030 || tag === 5002010 || tag === 5002020;
// Name of a tag: skill-tag localization, the executable enum names, the translated game-table names, else the game table's own
// description (config_attr_tag / config_char_state, Chinese) with the id.
export function tagName(tag) {
  const own = data().AFFIX_TAG_NAMES[tag] ?? EXTRA_TAG_NAMES[tag] ?? GAME_TAG_ENGLISH[tag];
  if (own) return own;
  const row = gameName("attrTag", tag) ?? gameName("state", tag);
  if (row) return `${row[1] || row[0]} (${tag})`;
  const skill = gameName("skillTag", tag);
  return skill ? (skill[1] ?? `skill tag ${skill[0]} (${tag})`) : `tag ${tag}`;
}
// Whether the game names a tag (localization, enum names or a game table row).
export const tagKnown = (tag) => Boolean(data().AFFIX_TAG_NAMES[tag] ?? EXTRA_TAG_NAMES[tag] ?? GAME_TAG_ENGLISH[tag] ?? gameName("attrTag", tag) ?? gameName("state", tag) ?? gameName("skillTag", tag));
export const buffName = (id) => data().AFFIX_BUFF_NAMES[id] ?? `buff ${id}`;

// Node 119 stat sources (`from`); inferred from the templates.
export const STAT_SOURCES = Object.freeze({
  0: "Minions owned", 1: "character level", 3: "current Mana", 6: "current Mana %", 7: "current Energy Shield %", 8: "missing Life %", 9: "missing Mana", 11: "missing Life %",
  12: "Mana lost %", 13: "Energy Shield lost %", 24: "Rage", 31: "skill Mana Cost", 33: "channeled stacks", 36: "empty weapon slots", 37: "Life sealed %", 39: "Sealed Life",
  40: "Mana sealed", 45: "Fervor Rating", 46: "Blur Rating", 47: "Frostbites on enemy", 52: "Spacetime Energy", 53: "Affliction points", 62: "Order", 63: "Chaos", 64: "Command",
  65: "Spirit Magus Growth", 92: "Max Life", 93: "Max Mana",
  // Completeness pass (2026-10-25), from the templates that use them: [inferred]
  5: "target Life %", 66: "Ailments on the enemy", 73: "weapon base damage", 82: "Max Blessing stacks (82)", 83: "Max Blessing stacks (83)", 84: "Max Blessing stacks (84)",
  85: "Mercury Pts", 90: "activated Tangles", 91: "inactivated Tangles",
});

// ---------------------------------------------------------------------------------------------------------------------------
// Values: "p<i>", numbers, "rpn:<postfix>" (p / l / d tokens, scale, * / + - % neg, Name(args) calls).
export function evaluate(expr, params = {}, { scale = 1, outer = {} } = {}) {
  if (expr === undefined || expr === null) return { value: null, dynamic: [] };
  if (typeof expr === "number") return { value: expr, dynamic: [] };
  if (typeof expr === "boolean") return { value: expr ? 1 : 0, dynamic: [] };
  const s = String(expr);
  const token = (t) => {
    if (/^p\d+$/.test(t)) return params[t] ?? NaN;
    if (/^d\d+$/.test(t)) return outer[`p${Number(t.slice(1)) - 1}`] ?? NaN; // node 629 argument: outer parameter, 1-based [inferred]
    return NaN;
  };
  if (/^[pd]\d+$/.test(s)) { const v = token(s); return { value: Number.isFinite(v) ? v : null, dynamic: Number.isFinite(v) ? [] : [s] }; }
  if (!s.startsWith("rpn:")) return Number.isFinite(Number(s)) ? { value: Number(s), dynamic: [] } : { value: null, dynamic: [s] };
  const stack = [];
  const dynamic = [];
  for (const t of s.slice(4).trim().split(/\s+(?![^()]*\))/)) {
    if (/^[pd]\d+$/.test(t)) stack.push(token(t));
    else if (t === "scale") { stack.push(scale); if (scale !== 1) dynamic.push("scale"); }
    else if (/^-?[\d.]+(e-?\d+)?$/.test(t)) stack.push(Number(t));
    else if (t === "neg") stack.push(-stack.pop());
    else if (["*", "/", "+", "-", "%"].includes(t)) {
      const b = stack.pop(), a = stack.pop();
      stack.push(t === "*" ? a * b : t === "/" ? a / b : t === "+" ? a + b : t === "-" ? a - b : a % b);
    } else { stack.push(NaN); dynamic.push(t); } // l<i> locals and calls (GetAttr, GetBuffStack …) are runtime values
  }
  const value = stack.length === 1 && Number.isFinite(stack[0]) ? stack[0] : null;
  return { value, dynamic: value === null && !dynamic.length ? ["malformed"] : dynamic.filter((d) => d !== "scale" || value === null) };
}
const P_REF = /\bp(\d+)\b/g;
function pRefs(...values) {
  const out = new Set();
  const visit = (v) => { if (v == null) return; if (typeof v === "string") for (const m of v.matchAll(P_REF)) out.add(Number(m[1])); else if (Array.isArray(v)) v.forEach(visit); else if (typeof v === "object") Object.values(v).forEach(visit); };
  values.forEach(visit);
  return [...out];
}

// ---------------------------------------------------------------------------------------------------------------------------
/** What an attribute id means: { id, base, layer, concept, type?, name, label, evidence }. */
// Id 0 is a placeholder (flag affixes whose effect lives in code: "This skill cannot obtain Steep Strike attempts …").
export function attributeMeaning(id, options = {}) {
  if (id === 0) return { id, base: 0, layer: null, concept: null, name: null, label: null, evidence: "unknown", conceptMapped: false };
  const { base, layer } = baseId(id, options);
  // A field or label written through an attribute slot (field × 10 + 2, label × 10 + 3; buff carriers, next-action writes).
  if (layer === "derivedField") return { ...fieldMeaning(base), id, layer, via: "field" };
  if (layer === "derivedLabel") return { ...labelMeaning(base), id, layer, via: "label" };
  const labels = data().AFFIX_ATTRIBUTE_LABELS;
  const [name, label, , internal] = labels[id] ?? labels[base] ?? [null, null];
  const known = ATTRIBUTE_CONCEPTS[base];
  if (known) return { id, base, layer, ...known, name: name ?? null, ...(internal ? { internal } : {}), label };
  if (name) return { id, base, layer, concept: `attr:${name}`, name, label, evidence: "sourced", conceptMapped: false };
  // A config_attributes row with only an internal name (pinyin): named by the game, not mapped.
  if (internal) return { id, base, layer, concept: `attr:${internal}`, name: null, internal, label, evidence: "sourced", conceptMapped: false };
  if (label) return { id, base, layer, concept: `attr?:${label}`, name: null, label, evidence: "inferred", conceptMapped: false };
  return { id, base, layer, concept: null, name: null, label: null, evidence: "unknown", conceptMapped: false };
}
// A field: FIELD_CONCEPTS (mapped; sourced when its config_char_field row exists and agrees), else the game table's own name
// (concept "field:<internal name>", gameName [internal, Chinese description]; sourced, not mapped), else the single-write template.
export function fieldMeaning(id) {
  if (id === 0) return { id, base: 0, layer: null, concept: null, label: null, evidence: "unknown", conceptMapped: false };
  const { base, layer } = baseId(id);
  const label = data().AFFIX_ATTRIBUTE_LABELS[base]?.[1] ?? data().AFFIX_ATTRIBUTE_LABELS[id]?.[1] ?? null;
  const row = gameName("field", base);
  const known = FIELD_CONCEPTS[base];
  if (known) return { id, base, layer, ...known, ...(row ? { evidence: "sourced", gameName: row } : {}), label };
  if (row) return { id, base, layer, concept: `field:${row[0]}`, label, gameName: row, evidence: "sourced", conceptMapped: false };
  return label ? { id, base, layer, concept: `field?:${label}`, label, evidence: "inferred", conceptMapped: false } : { id, base, layer, concept: null, label: null, evidence: "unknown", conceptMapped: false };
}
// A label (node 107, gate 213, × 10 + 3 writes): LABEL_MEANINGS (English) or the config_char_label row.
export function labelMeaning(id) {
  const row = gameName("label", id);
  const english = LABEL_MEANINGS[id] ?? null;
  if (!row && !english) return { id, base: id, layer: null, concept: null, label: null, evidence: "unknown", conceptMapped: false };
  return { id, base: id, layer: null, concept: `label:${english ?? row[0]}`, label: english ?? row[1], ...(row ? { gameName: row } : {}), evidence: row ? "sourced" : "inferred", conceptMapped: Boolean(english) };
}
// A conversion / per-stat target: attr × 10 + 1 or field × 10 + 2 (or a plain attribute).
function targetMeaning(id) {
  const { base, layer } = baseId(id, { encoded: true });
  if (layer === "derivedField") return { ...fieldMeaning(base), id, layer, kind: "field" };
  if (layer === "derivedLabel") return { ...labelMeaning(base), id, layer, kind: "label" };
  return { ...attributeMeaning(base), id, layer, kind: "attr" };
}

// Tag lists. Within one tag object every listed tag is required (sourced: 357249664 "Minion Spell Damage" = {mine: [Minion,
// Spell]}; 14070749 "a Critical Strike with Lightning Damage" = {mine: [Lightning, Critical Strike]}; 8364677 "you or your
// Minions land a Critical Strike" is two writes, {mine: [Crit]} and {mine: [Crit, Minion]}). A list of two or more objects
// (generator `alt`) is a choice: any one object matches (sourced: 141833072 "Empower or Defensive Skill", 13682365 "Full Life or
// Full Energy Shield", 190801728 "Wilt or Deterioration", 611468864 "Spell and Ailment Damage taken" = {others: [DoT flow]} or
// {others: [Spell, hit]}).
function tagScopes(tags, alternatives = null) {
  if (alternatives?.length > 1) {
    const parts = alternatives.map((t) => tagScopes(t));
    const scopeText = parts.map((x) => x.scope.join(" + ") || "any").join(" or ");
    const conds = parts.map((x) => x.conditions);
    const scope = parts.every((x) => x.scope.length) ? [scopeText] : [];
    const anyCondition = conds.some((c) => c.length) ? [{ kind: "any", text: parts.map((x) => [...x.scope, ...x.conditions.map((c) => c.text)].join(" + ") || "any").join(" or "), parts: conds.flat(), alternatives: parts.map((x) => ({ scope: x.scope, conditions: x.conditions })) }] : [];
    return { scope, conditions: anyCondition, alternatives: parts.map((x) => x.scope) };
  }
  const scope = [], conditions = [];
  for (const [side, list] of Object.entries(tags || {})) for (const tag of list || []) {
    const negated = side.startsWith("not");
    const other = side === "others" || side === "notOthers";
    if (STATE_TAG(tag)) conditions.push({ kind: "state", tag, on: other ? "target" : "owner", negated, text: `${negated ? "not " : ""}${other ? "target " : ""}${tagName(tag)}` });
    else scope.push(`${negated ? "not " : ""}${other ? "vs " : ""}${tagName(tag)}`);
  }
  return { scope, conditions };
}

function conditionFromGate(node, p = {}, extra = {}) {
  const type = GATE_TYPES[node];
  const text = (() => {
    switch (node) {
      case 10: return `${tagName(p.tag)}${p.tag >= 6000000 ? " skill" : ""}`;
      case 104: return `state ${tagName(p.state)}`;
      // bUseTag: any buff carrying the tags (bUseTagAnd: all of them; 611820480 "curses inflicted by the supported skill" = tags
      // [this skill, Curse]).
      case 184: case 1000: return p.bUseTag && Array.isArray(p.tags) ? `has a buff tagged ${p.tags.map(tagName).join(p.bUseTagAnd ? " and " : " + ")}` : `has ${buffName(p.buff)}`;
      case 185: return `${p.stack ?? "?"}+ stacks of ${buffName(p.buff)}`;
      case 227: return `${buffName(p.buff)} at max stacks`;
      case 188: case 190: return `${p.probability ?? "?"}% chance`;
      case 189: return `within ${typeof p.range === "number" ? p.range / 100 : p.range} m`;
      case 206: case 251: case 254: case 6: return `${node === 254 ? "per-target recovery" : "cooldown"} ${p.cooldown ?? "?"} s`;
      case 208: return `skill tag ${tagName(p.tag)}`;
      case 221: return `equipped in slot ${p.slot}`;
      case 321: return `engraved in engram slot ${p.slot}`;
      case 213: { const m = labelMeaning(p.label); return `label ${m.label ?? p.label} set`; }
      case 270: return `restoration effect ${p.type ?? "?"} active`;
      case 610: case 611: return `event ${p.dataType} within ${p.timeLimit ?? "?"} s`;
      case 300: return `compare ${p.leftNum} op${p.operator} ${p.rightNum}`;
      case 3: case 4: return `${p.count === 0 ? "no" : `at least ${typeof p.count === "number" ? p.count + 1 : p.count}`} entities nearby`;
      default: return type?.meaning ?? `gate ${node}`;
    }
  })();
  // Node 10 with a skill tag (this skill, a 6xxxxxx skill tag) is a skill filter, not a combat condition.
  const scopeLike = type?.scopeLike || (node === 10 && (p.tag === 5000002 || (p.tag >= 6000000 && p.tag < 7000000)));
  // The raw tag id of a tag gate (208 `tag`; 10 `gateTag`, kept apart from the tag-list state conditions' `tag`, which other readers match),
  // so a reader can scope by it (src/recipe-hit-layers.js; 2026-10-25, research §15).
  return { kind: type?.kind ?? "unknownGate", node, text, ...(node === 208 && typeof p.tag === "number" ? { tag: p.tag } : {}), ...(node === 10 && typeof p.tag === "number" ? { gateTag: p.tag } : {}), ...((node === 184 || node === 1000) && p.bUseTag && Array.isArray(p.tags) ? { tags: p.tags } : {}), ...(scopeLike ? { scopeLike: true } : {}), ...(type?.noDps ? { noDps: true } : {}), ...(type ? {} : { unknown: true }), ...extra };
}
function conditionsFromTree(tree, resolve = (p) => p || {}, out = [], negated = false) {
  if (!tree) return out;
  if (Array.isArray(tree)) { tree.forEach((t) => conditionsFromTree(t, resolve, out, negated)); return out; }
  if (tree.ty === "Not") return conditionsFromTree(tree.k, resolve, out, !negated);
  if (tree.ty === "Or") { const parts = conditionsFromTree(tree.k, resolve, [], negated); out.push({ kind: "any", text: parts.map((c) => c.text).join(" or "), parts, ...(parts.every((c) => c.scopeLike) ? { scopeLike: true } : {}) }); return out; }
  if (tree.ty) return conditionsFromTree(tree.k, resolve, out, negated);
  if (tree.n !== undefined) { const c = conditionFromGate(tree.n, resolve(tree.p)); if (negated) { c.negated = true; c.text = `not ${c.text}`; } out.push(c); }
  if (tree.k) conditionsFromTree(tree.k, resolve, out, negated);
  return out;
}

const valueOf = (expr, params, options) => evaluate(expr, params, options);
// Actions the extraction files with the gates because their node id also appears in condition trees: 320 (cooldown reset) and
// 104 when it carries `type` + `value` (change the current Life / Mana / Energy Shield by a share: 840 "Loses X% of current Mana
// when Spell Burst is consumed", 5238533 "Loses X% current Life and Energy Shield", neither with another effect node). [inferred]
const isActionGate = (g) => Boolean(GATE_TYPES[g.n]?.action) || (g.n === 104 && g.p?.type !== undefined && g.p?.value !== undefined);
// Timing decorators above a node (generator `d`): Wait = delay, Time = runs for a time, Loop = repeats, Probability = one child
// at random, Task = runs in the background. Behaviour-tree decorator names from the game data; meanings inferred from use.
function decoratorConditions(list, params, opts) {
  return (list || []).flatMap((d) => {
    const v = (x) => (x === undefined ? null : evaluate(x, params, opts).value ?? x);
    if (d.t === "Wait") return [{ kind: "delay", text: `after ${v(d.p?.wait) ?? "?"} s` }];
    if (d.t === "Time") return [{ kind: "timed", text: `for ${v(d.p?.time) ?? "?"} s` }];
    if (d.t === "Loop") return [{ kind: "repeat", text: `repeats ${v(d.p?.loop) ?? "?"} time(s)`, scopeLike: true }];
    if (d.t === "Probability") return [{ kind: "random", text: "one of the listed alternatives at random", scopeLike: true }];
    if (d.t === "Task") return [{ kind: "background", text: "runs as a background task", scopeLike: true }];
    return [];
  });
}

// Row references (2026-10-31, research/core-formulas-chunk0-2026-10-31.md §12). A row's number is its EffectId: config_affix_effect is keyed
// by (affix id, row number), and the file order says nothing (782738 is stored 3, 1, 4, 5). `no` carries the number when it is not the row's
// place in `r`. Installing an affix starts its entry rows (config_affix_class, `o`); every other row runs only when a running row's node
// names it, on the units that node's filter picks (client, SS13 copy: 0x141ba96d0 walks the class list; 0x141ba8990 starts one row from a
// running one, with the same affix, on the unit given; 0x141a5ece0 is node 111, one such start per filtered unit). A row nothing starts
// never runs. The nodes and their row parameter:
const ROW_REFERENCE_PARAMS = Object.freeze({ 111: "affixes", 112: "affixes", 113: "affix", 116: "affixEffect", 130: "affixes", 346: "affix", 361: "affix", 373: "affix", 612: "affix", 613: "affix", 1031: "affix", 1036: "affix", 1120: "affixEffect", 2221: "repeatAffixEffect" });
/** The row numbers a compact effect node names. */
export function rowReferences(effect) {
  const param = ROW_REFERENCE_PARAMS[effect?.n];
  const value = param ? effect.p?.[param] : undefined;
  return (Array.isArray(value) ? value : value === undefined ? [] : [value]).filter((no) => Number.isInteger(no) && no > 0);
}
/** A row's game number: `no`, else its 1-based place in `r`. */
export const rowNumber = (row, index) => row.no ?? index + 1;
/** The rows an affix starts on install: `o`, else every row no node names. */
export function entryRowNumbers(recipe) {
  const rows = recipe?.r || [];
  if (recipe?.o) return recipe.o;
  const named = new Set(rows.flatMap((row) => row.e.flatMap(rowReferences)));
  return rows.map(rowNumber).filter((no) => !named.has(no));
}
// What a referring node adds to the row it starts. Nodes 111 / 112 / 130 start it as it is.
function referenceConditions(e, valueText) {
  const p = e.p || {};
  switch (e.n) {
    case 116: return [{ kind: "perStack", buff: p.buff, text: `per ${valueText(p.fromEveryNum) ?? 1} stack(s) of ${buffName(p.buff)}${p.maxLimit ? `, up to ${valueText(p.maxLimit)}` : ""}` }];
    case 373: return [{ kind: "perStack", buff: p.buffCfgId, text: `per stack of ${buffName(p.buffCfgId)}` }];
    case 346: return [{ kind: "per", text: "per status type the bearer has" }];
    case 361: return [{ kind: "per", text: `per ${valueText(p.everyX) ?? 1} Minion(s)` }];
    case 612: case 613: return [{ kind: "eventCount", text: `every ${valueText(p.value) ?? "?"} of event ${p.dataType}` }];
    case 1036: return [{ kind: "nextUse", text: `the next ${valueText(p.times) ?? 1} use(s) after event ${p.event}` }];
    case 2221: return [{ kind: "per", text: `stacks up to ${valueText(p.maxAddCnt) ?? "?"} times` }];
    default: return [];
  }
}

/**
 * A ledger's reading of an effect whose row runs per stack or count: `value` is one step, not the line's total, so what the ledger would
 * place (`part[placed]`) stays with the text reader. What it does not reach stays out.
 */
export function settleRowScaled(effect, part, placed) {
  if (!effect.rowScaled || !part[placed]?.length) return part;
  return { [placed]: [], relevant: true, unplaceable: "the row runs per stack or count (src/recipe-interpreter.js rowReferences)" };
}

/** The receiver of a filter's target list (see interpretRecipe): enemy, minion, ally (other friendly units, not the holder), else `fallback`. */
function filterTarget(targets, fallback) {
  if (targets.includes(8)) return "enemy";
  // [1, 3] is "you and your Minions" (12682557, the only such filter): the write stays yours, the Minion half is the reader's.
  if (targets.includes(3) && !targets.includes(1)) return "minion";
  if ((targets.includes(20) || targets.includes(9)) && !targets.includes(1)) return "ally";
  return fallback;
}

/**
 * Interpret one recipe (an AFFIX_RECIPES entry) for bound parameter values { p0, p1, … } (or an array).
 * options: { id, multiplier (talent ranks), scale (GetEffectScale; 1 outside buffs), outer (node 629 outer params), depth }
 * @returns {{ id, effects: object[], unknown: object[], notes: string[] }}
 */
export function interpretRecipe(recipe, values = {}, options = {}) {
  const params = Array.isArray(values) ? Object.fromEntries(values.map((v, i) => [`p${i}`, v])) : (values || {});
  const { id = null, multiplier = 1, scale = 1, outer = {}, depth = 0 } = options;
  const effects = [], unknown = [], notes = [];
  if (!recipe) return { id, effects, unknown: [{ reason: "no recipe" }], notes };
  const rows = recipe.r || [];
  // Filter targets (config_affix_effect node 1 `targets`; 2026-10-31, research/game-table-diff-2026-10-31.md): 1 the holder, 3 its Minions,
  // 8 enemies, 9 / 20 its other allies, 38 the follower's owner (written on you: "for you", 916010020 "you and Followers"; own unit
  // for a player affix). 20: Holy Domain 851527424 routes one row to [1], [20], [8] for "all units in the domain", so 1, 20 and 8 cover
  // everyone and 20 is the friendly units except the holder (inferred from that split; 1096360192 uses it for a monster's fellow
  // monsters). An effect with [1] and a twin on [20] or [9] is the same grant to two receivers, so the twin reads target "ally".
  // A buff carrier on an event filter (client UAffixFilter_101, 111, 113: no target list) has `to` [8] from the builder: it writes on the
  // event's other unit (research/core-formulas-chunk0-2026-10-31.md §13).
  const opts = { scale, outer };
  const resolve = (p) => resolveParams(p, params, opts);
  // What a row's own trigger and gates require. A row it starts requires them too.
  const headOf = rows.map((row, rowIndex) => {
    const rowConditions = [];
    if (row.tr) {
      const t = TRIGGERS[row.tr.id];
      const scopes = tagScopes(row.tr.tags, row.tr.alt);
      // An event trigger's tags name the event (a Channeled skill, an Empower or Defensive Skill): shown with the event.
      rowConditions.push({ kind: t?.perHit ? "perHit" : "trigger", trigger: row.tr.id, text: `${t ? t.name : `event ${row.tr.id}`}${!t?.perHit && scopes.scope.length ? ` (${scopes.scope.join(", ")})` : ""}`, ...(t?.perHit ? { scopeLike: true } : {}), ...(t?.notOnDummy ? { notOnDummy: true } : {}), ...(t?.noDps ? { noDps: true } : {}), ...(t ? {} : { unknown: true }), ...(scopes.scope.length ? { scope: scopes.scope } : {}) });
      rowConditions.push(...scopes.conditions);
    }
    const actionGates = [], unknownGates = [];
    for (const g of row.g || []) {
      // An action filed with the gates (320 cooldown reset): an effect of the row, its filter tree naming the skills it acts on.
      if (isActionGate(g)) { actionGates.push(g); continue; }
      const gate = conditionFromGate(g.n, resolveParams(g.p, params, opts));
      // A Not decorator above the gate (composite path "…>Not"): the condition is negated.
      if (/(^|>)Not(>|$)/.test(g.comp ?? "")) { gate.negated = true; gate.text = `not ${gate.text}`; }
      rowConditions.push(gate, ...decoratorConditions(g.d, params, opts));
      if (g.c) rowConditions.push(...conditionsFromTree(g.c, resolve));
      if (!GATE_TYPES[g.n]) unknownGates.push({ row: rowIndex, gate: g.n, reason: `gate node ${g.n} not in GATE_TYPES` });
    }
    return { rowConditions, actionGates, unknownGates };
  });
  // Who runs each row, from the entry rows down the row references. Node 111's filter tree (`c`) narrows its receivers: 9096861 "+X%
  // additional Synthetic Troop Minion Damage" routes row 2 to the Minions with condition 10 tag 6000320 (Synthetic Troop) (2026-10-25,
  // research §16: the Minion switch reads it; earlier steps dropped it). Kept for Minion-routed rows only, which every other path leaves
  // out as "Minions only"; an enemy- or self-routed row's filter (18 / 35 recipes: ranges, Purgatory, Sentries) stays out, so the hit,
  // Trauma, Ignite and DoT readings do not move. One row can run twice over (782738 rows 3 and 4: on the Spirit Magi, and on the Synthetic
  // Troops under label 3020102), each with its own receivers and filter.
  const placeOf = new Map(rows.map((row, rowIndex) => [rowNumber(row, rowIndex), rowIndex]));
  const runs = rows.map(() => []);
  const pending = [];
  const start = (no, run) => {
    const rowIndex = placeOf.get(no);
    if (rowIndex === undefined) return;
    const key = `${run.target}|${run.conditions.map((c) => c.text).join("|")}`;
    if (runs[rowIndex].some((other) => other.key === key)) return;
    runs[rowIndex].push({ ...run, key });
    pending.push([rowIndex, run]);
  };
  for (const no of entryRowNumbers(recipe)) start(no, { target: "self", conditions: [], trigger: null, path: [no] });
  const valueText = (x) => (x === undefined ? null : evaluate(x, params, opts).value ?? x);
  while (pending.length) {
    const [rowIndex, run] = pending.shift();
    const row = rows[rowIndex];
    const inherited = [...run.conditions, ...headOf[rowIndex].rowConditions];
    for (const e of row.e) for (const no of rowReferences(e)) {
      if (run.path.includes(no)) continue; // a row restarting itself adds no receiver
      const target = filterTarget(e.to || [], run.target);
      const filter = e.c && target === "minion" ? conditionsFromTree(e.c, resolve) : [];
      const scaling = referenceConditions(e, valueText);
      start(no, { target, conditions: [...inherited, ...filter, ...scaling], trigger: run.trigger ?? row.tr ?? null, path: [...run.path, no], scaled: run.scaled || scaling.length > 0 });
    }
  }
  const idleRows = rows.map(rowNumber).filter((no) => !runs[placeOf.get(no)].length);
  rows.forEach((row, rowIndex) => {
    // A row also given to you is the same grant, not a second one on allies (the [1] and [20] twins above).
    for (const run of runs[rowIndex].filter((one, _, all) => one.target !== "ally" || !all.some((other) => other.target === "self"))) {
    const { rowConditions: ownConditions, actionGates, unknownGates } = headOf[rowIndex];
    const rowConditions = [...run.conditions, ...ownConditions];
    const rowTrigger = row.tr ?? run.trigger;
    unknown.push(...unknownGates.filter((u) => !unknown.includes(u)));
    for (const g of actionGates) {
      const gp = resolveParams(g.p, params, opts);
      const filter = g.c ? conditionsFromTree(g.c, resolve) : [];
      const common = { id, row: rowIndex, rowNo: rowNumber(row, rowIndex), node: g.n, scope: filter.filter((c) => c.scopeLike).map((c) => c.text), target: "self", conditions: [...rowConditions], bucket: "effect", evidence: "inferred", understood: true };
      if (g.n === 104) effects.push({ ...common, kind: "selfDrain", concept: `currentResource:${{ 1: "Life", 2: "Mana", 3: "Energy Shield" }[gp.type] ?? gp.type}`, value: typeof gp.value === "number" ? gp.value * 100 : null, note: "share of the current resource (value × 100 %)" });
      else effects.push({ ...common, kind: GATE_TYPES[g.n].kind, concept: "cooldownReset", value: typeof gp.curPercent === "number" ? gp.curPercent : null, ...(gp.second ? { seconds: gp.second } : {}) });
    }
    // Row modifiers: timed buff carriers (306) and per-entity scaling (700) shape their siblings, as per-stack scaling (116) does when it
    // names no row (with `affixEffect` it scales that row: referenceConditions).
    const perStack = row.e.filter((e) => e.n === 116 && !rowReferences(e).length).flatMap((e) => referenceConditions(e, valueText));
    // A row can hold two carriers (2026-10-31: the follower ally twins, node 306 on [1] and on [20] + 324): each "b" write belongs to the
    // carrier before it.
    let carrier = row.e.find((e) => e.n === 306);
    const target = run.target;
    for (const e of row.e) {
      if (e.n === 306) carrier = e;
      if (e.n === 111 || e.n === 116 || e.n === 306) continue; // shapes other effects
      const type = NODE_TYPES[e.n];
      const conditions = [...rowConditions, ...perStack];
      if (e.c) conditions.push(...conditionsFromTree(e.c, resolve));
      conditions.push(...decoratorConditions(e.d, params, opts));
      if (e.n === "b" && carrier) conditions.push({ kind: "timedBuff", text: `for ${valueOf(carrier.p?.duration, params, opts).value ?? carrier.p?.duration ?? "?"} s (timed buff)` });
      const { scope, conditions: tagConditions } = tagScopes(e.tg, e.alt);
      conditions.push(...tagConditions);
      const targets = e.to || (e.n === "b" ? carrier?.to : null) || [];
      const effTarget = filterTarget(targets, target);
      // Raw tag ids (`tagIds`, `tagAlt`), the row's trigger id and a node-306 carrier's duration / count ride along for readers that
      // classify by id (src/recipe-trauma-layers.js); `scope` keeps the names.
      const carried = e.n === "b" && carrier ? { carrier: { mode: carrier.p?.mode ?? null, duration: valueOf(carrier.p?.duration, params, opts).value, count: valueOf(carrier.p?.count, params, opts).value } } : {};
      // rowScaled: the row runs once per stack or count (`value` is one step, not the line's total), so a ledger cannot take it as it stands.
      const base = { id, row: rowIndex, rowNo: rowNumber(row, rowIndex), node: e.n, scope, target: effTarget, conditions, tagIds: e.tg ?? null, ...(e.alt ? { tagAlt: e.alt } : {}), ...(rowTrigger ? { triggerId: rowTrigger.id, triggerTags: rowTrigger.tags ?? null } : {}), ...(run.scaled ? { rowScaled: true } : {}), ...carried };
      if (!type) { unknown.push({ row: rowIndex, node: e.n, reason: `effect node ${e.n} not in NODE_TYPES` }); effects.push({ ...base, kind: "unknown", concept: null, bucket: null, value: null, understood: false }); continue; }
      const out = buildEffect(type, e, params, opts, multiplier, base, notes);
      if (e.n === 629 || e.n === 642 || e.n === 404) {
        out.injected = [];
        const buffId = e.p?.buffId ?? e.p?.buffCfgId;
        const via = e.n === 629 ? { kind: "buffEffect", buff: buffId, text: `while ${buffName(buffId)} is active (scaled by ${buffName(buffId)} Effect)` }
          : e.n === 642 ? { kind: "buffEffect", buff: buffId, applied: true, text: `on the bearer of ${buffName(buffId)} (applied buff / debuff; scaled by its effect)` }
          : { kind: "timedBuff", buff: buffId, text: `while buff ${buffName(buffId)} lasts${e.p?.buffDuration !== undefined ? ` (${valueOf(e.p.buffDuration, params, opts).value ?? e.p.buffDuration} s)` : ""}` };
        for (const inst of e.inst || []) {
          const inner = data().AFFIX_RECIPES[inst.id];
          if (!inner || depth > 2) { unknown.push({ row: rowIndex, node: e.n, reason: `injected affix ${inst.id} not in the table` }); continue; }
          const args = Object.fromEntries((inst.args || []).map((a, i) => [`p${i}`, typeof a === "number" ? a : evaluate(a, {}, { outer: params }).value]));
          const result = interpretRecipe(inner, args, { id: inst.id, multiplier, scale, outer: params, depth: depth + 1 });
          for (const inner of result.effects) {
            inner.conditions.unshift({ ...via });
            if (e.n === 642 && inner.target === "self") inner.target = "buffBearer";
            inner.viaAffix = id;
            effects.push(inner);
          }
          unknown.push(...result.unknown);
          out.injected.push(inst.id);
        }
      }
      if (out.dynamic?.some((d) => d !== "scale")) out.conditions = [...out.conditions, { kind: "per", text: `scales with runtime value ${out.dynamic.filter((d) => d !== "scale").join(", ")}` }];
      if (out.understood === false && out.reason) unknown.push({ row: rowIndex, node: e.n, reason: out.reason });
      effects.push(out);
    }
    }
  });
  return { id, effects, unknown, notes, ...(idleRows.length ? { idleRows } : {}) };
}
function resolveParams(p, params, opts) {
  if (!p) return {};
  const out = {};
  for (const [k, v] of Object.entries(p)) out[k] = typeof v === "string" && (/^p\d+$/.test(v) || v.startsWith("rpn:")) ? (evaluate(v, params, opts).value ?? v) : v;
  return out;
}

function buildEffect(type, e, params, opts, multiplier, base, notes) {
  const scaled = (r) => (r.value === null ? null : r.value * multiplier);
  const p = e.p || {};
  switch (type.kind) {
    case "attr": case "localAttr": case "attrPer": {
      // Attribute 0 with mod 0 is a flag whose meaning is the template itself (the code reads the affix id): understood as a rule.
      if (e.a === 0) return { ...base, kind: "rule", attr: 0, concept: "rule", bucket: "flag", value: null, evidence: "inferred", understood: true, note: "attribute 0: a flag read by code; the template is the rule" };
      // The attribute is itself an affix parameter (102320000 "Hunting Affix": a map affix's `attr: p1`; the catalog keeps no number): no fixed stat.
      if (e.a === undefined) return { ...base, kind: "rule", concept: "rule", bucket: "flag", value: null, evidence: "inferred", understood: true, note: "the attribute is a parameter of the affix" };
      const meaning = attributeMeaning(e.a);
      const v = valueOf(e.v, params, opts), u = e.u !== undefined ? valueOf(e.u, params, opts) : null;
      const bucket = MOD_BUCKET[e.m] ?? (e.m === undefined ? "unset" : `mod${e.m}`);
      const understood = Boolean(meaning.concept);
      const local = type.kind === "localAttr" ? { local: { 321: "item", 363: "gear", 364: "itemBase" }[e.n] } : {};
      const per = type.kind === "attrPer" ? [{ kind: "per", text: `per ${valueOf(p.everyXBounceLeft, params, opts).value ?? p.everyXBounceLeft} Jump(s) remaining` }] : [];
      return { ...base, conditions: [...base.conditions, ...per], kind: "attr", attr: e.a, base: meaning.base, layer: meaning.layer, ...local, concept: meaning.concept, type: meaning.type, name: meaning.name, ...(meaning.gameName ? { gameName: meaning.gameName } : {}), bucket, mod: e.m, value: scaled(v), ...(u ? { upper: scaled(u) } : {}), ...(v.dynamic.length ? { dynamic: v.dynamic } : {}), evidence: type.kind === "localAttr" && type.evidence === "inferred" ? "inferred" : meaning.evidence, understood, evaluated: v.value !== null, ...(understood ? {} : { reason: `attribute ${e.a} has no name` }) };
    }
    case "field": case "fieldSet": case "fieldCap": {
      const bucket = type.kind === "fieldSet" ? "set" : type.kind === "fieldCap" ? "cap" : "field";
      const v = valueOf(p.value, params, opts);
      // Node 336 "is set to" on an attribute (field 0 / absent, attribute in `a`): an attribute set.
      if (!p.field && typeof e.a === "number" && e.a !== 0) {
        const meaning = attributeMeaning(e.a);
        return { ...base, kind: type.kind, attr: e.a, concept: meaning.concept, type: meaning.type, name: meaning.name, bucket, value: scaled(v), ...(v.dynamic.length ? { dynamic: v.dynamic } : {}), evidence: meaning.evidence, understood: Boolean(meaning.concept), ...(meaning.concept ? {} : { reason: `attribute ${e.a} has no name` }) };
      }
      if (!p.field) return { ...base, kind: "rule", concept: "rule", bucket, value: scaled(v), evidence: "inferred", understood: true, note: "set with neither field nor attribute: the template is the rule (fixed counts read by code)" };
      const meaning = fieldMeaning(p.field);
      return { ...base, kind: type.kind, field: p.field, concept: meaning.concept, type: meaning.type, ...(meaning.gameName ? { gameName: meaning.gameName } : {}), bucket, value: scaled(v), ...(v.dynamic.length ? { dynamic: v.dynamic } : {}), evidence: meaning.evidence, understood: Boolean(meaning.concept), ...(meaning.concept ? {} : { reason: `field ${p.field} has no label` }) };
    }
    case "byDistance": {
      const to = targetMeaning(p.to);
      const v = valueOf(p.distanceRate, params, opts);
      const { scope } = tagScopes(p.toTags);
      const range = `${valueOf(p.beginDistance, params, opts).value ?? p.beginDistance}–${valueOf(p.endDistance, params, opts).value ?? p.endDistance} m`;
      return { ...base, scope: [...base.scope, ...scope], kind: "byDistance", attr: p.to, concept: to.concept, type: to.type, bucket: MOD_BUCKET[p.toMod] ?? "conversion", value: scaled(v), ...(p.useMaxValueLimit ? { max: valueOf(p.maxValueLimit, params, opts).value } : {}), conditions: [...base.conditions, { kind: "per", text: `per metre of distance ${p.beDistanceIncress ? "travelled" : "closer"} (${range})` }], evidence: "inferred", understood: Boolean(to.concept), evaluated: v.value !== null };
    }
    case "perAilmentType": {
      const to = targetMeaning(p.to);
      const v = valueOf(p.toLowerValue, params, opts);
      const { scope } = tagScopes(p.toTags);
      return { ...base, scope: [...base.scope, ...scope], kind: "perAilmentType", attr: p.to, concept: to.concept, type: to.type, bucket: MOD_BUCKET[p.toMod] ?? "conversion", value: scaled(v), conditions: [...base.conditions, { kind: "per", text: "per Ailment type on the enemy" }], evidence: "inferred", understood: Boolean(to.concept), evaluated: v.value !== null };
    }
    case "perCount": case "perStatusType": return { ...base, kind: type.kind, concept: type.kind, bucket: "effect", value: null, conditions: [...base.conditions, { kind: "per", text: type.meaning }], evidence: "inferred", understood: true, ...(p.affix ? { activatesRow: p.affix } : {}) };
    case "label": {
      const meaning = labelMeaning(p.label);
      return { ...base, kind: "label", label: p.label, concept: meaning.concept ?? "label", ...(meaning.gameName ? { gameName: meaning.gameName } : {}), bucket: "flag", value: null, evidence: meaning.evidence === "unknown" ? "inferred" : meaning.evidence, understood: true };
    }
    case "gainState": case "loseState": return { ...base, kind: type.kind, state: p.state, concept: `state:${tagName(p.state)}`, bucket: "effect", value: null, evidence: tagKnown(p.state) ? "sourced" : "inferred", understood: true };
    case "resourceFixed": return { ...base, kind: "resource", concept: `resource:${resourceName(p.resource)}`, bucket: "set", value: valueOf(p.value, params, opts).value, evidence: "inferred", understood: true };
    case "convert": case "perStat": case "share": case "perTargetStat": {
      const to = targetMeaning(p.to);
      const v = valueOf(p.toLowerValue, params, opts), per = valueOf(p.fromValue, params, opts);
      const from = type.kind === "convert" || type.kind === "share" ? targetMeaning(p.from) : { concept: STAT_SOURCES[p.from] ?? `stat source ${p.from}`, evidence: STAT_SOURCES[p.from] ? "inferred" : "unknown" };
      const max = p.useMaxValueLimit ? valueOf(p.maxValueLimit, params, opts).value : null;
      const { scope } = tagScopes(p.toTags);
      return { ...base, scope: [...base.scope, ...scope], toTagIds: p.toTags ?? null, kind: type.kind, attr: p.to, concept: to.concept, type: to.type, bucket: MOD_BUCKET[p.toMod] ?? "conversion", value: scaled(v), per: per.value, from: p.from, fromMeaning: type.kind === "convert" || type.kind === "share" ? { concept: from.concept, type: from.type ?? null, base: from.base ?? null } : null, fromConcept: from.concept, fromBucket: MOD_BUCKET[p.fromMod] ?? null, ...(max !== null ? { max } : {}), conditions: [...base.conditions, { kind: "per", text: `per ${per.value ?? p.fromValue} ${from.concept}` }], evidence: to.evidence, understood: Boolean(to.concept), evaluated: v.value !== null, ...(to.concept ? {} : { reason: `conversion target ${p.to} has no name` }) };
    }
    case "perEntity": {
      const to = targetMeaning(p.addType);
      return { ...base, kind: "perEntity", attr: p.addType, concept: to.concept, bucket: "perEntity", value: null, max: p.useMaxValueLimit ? valueOf(p.maxValueLimit, params, opts).value : null, conditions: [...base.conditions, { kind: "per", text: "per counted entity" }], evidence: to.evidence, understood: Boolean(to.concept) };
    }
    case "nextAction": {
      const to = targetMeaning(p.aFL);
      return { ...base, kind: "nextAction", attr: p.aFL, concept: to.concept, bucket: "nextAction", value: null, conditions: [...base.conditions, { kind: "nextAction", text: "next action of the skill" }], evidence: "inferred", understood: Boolean(to.concept) };
    }
    case "reap": {
      // A runtime Reap time (the Terra's remaining duration, a field) is still a Reap: understood, value left to the runtime.
      const v = valueOf(p.reapTime, params, opts);
      // SS14 node 631 `tags`: the DoTs the Reap settles (5100003 Ignite, 5100006 Trauma, 4000150 / 5100007 Wilted …); `reapTags` keeps
      // the raw ids, `reapScope` their names (src/recipe-dot-layers.js reads them; 2026-10-25, research §15).
      const reapTags = Array.isArray(p.tags) && p.tags.length ? [...p.tags] : null;
      return { ...base, kind: "reap", concept: "reap", bucket: "effect", value: scaled(v), ...(v.dynamic.length ? { dynamic: v.dynamic } : {}), evidence: "sourced", understood: true, evaluated: v.value !== null, ...(p.reapFromSelf ? { reapFromSelf: true } : {}), ...(reapTags ? { reapTags, reapScope: reapTags.map(tagName) } : {}) };
    }
    case "extraStacks": {
      const v = valueOf(p.layerNum ?? p.count, params, opts), pr = valueOf(p.probability, params, opts);
      // Ailment by buff key (130 Ignite, 150 Wilt, 160 Trauma, 180 Deterioration) or by the target tag (5100007 Wilt …).
      const BUFF_AILMENT = { 130: "ignite", 150: "wilt", 160: "trauma", 180: "deterioration" };
      const TAG_AILMENT = { 5100003: "ignite", 5100006: "trauma", 5100007: "wilt" };
      const tagged = (e.tg?.others ?? []).map((t) => TAG_AILMENT[t]).find(Boolean);
      return { ...base, kind: "extraStacks", concept: "extraAilmentStacks", type: BUFF_AILMENT[p.keyValue ?? p.buff] ?? tagged ?? `buff ${p.keyValue ?? p.buff}`, bucket: "effect", value: scaled(v), probability: pr.value, evidence: e.n === 343 ? "sourced" : "inferred", understood: true };
    }
    case "flatToBaseAilment": {
      const v = valueOf(p.percent, params, opts), u = valueOf(p.percentMax, params, opts);
      // ailmentType: 0 Trauma, 3 Ignite, 4 Wilt, from the templates (758690 "… Base Trauma Damage" = 0, 22116 "… Base Ignite Damage" =
      // 3, 446516 "… Base Wilt Damage" = 4; 536515424 "… as Ailment Damage" writes 4, 3 and 0). Step 1 read 6 as Trauma, which no
      // recipe uses (fixed 2026-10-25 by the Trauma switch-over).
      return { ...base, kind: "flatToBaseAilment", concept: "baseAilmentFromFlat", type: { 0: "trauma", 3: "ignite", 4: "wilt" }[p.ailmentType] ?? `ailment ${p.ailmentType}`, bucket: "effect", value: scaled(v), upper: scaled(u), evidence: "sourced", understood: true };
    }
    case "gainBuff": case "refreshBuff": case "gainBuffPeriodic": case "loseBuffStacks": case "buffStacks": case "consumeBuff": case "buffBaseEffect": case "buffDuration": case "grantBuff": {
      const buff = p.buff ?? p.buffCfgId ?? p.id;
      const num = valueOf(p.num ?? p.addStackNum ?? p.stack, params, opts);
      return { ...base, kind: type.kind, buff, concept: `buff:${buffName(buff)}`, bucket: "effect", value: num.value, duration: valueOf(p.duration ?? p.buffDuration, params, opts).value, evidence: data().AFFIX_BUFF_NAMES[buff] ? "sourced" : "inferred", understood: true };
    }
    case "triggerSkill": case "castStoneSkill": return { ...base, kind: type.kind, concept: `skill:${p.stoneCfgId ?? p.stone}`, bucket: "effect", value: valueOf(p.level, params, opts).value, evidence: "inferred", understood: true };
    case "grantSupport": return { ...base, kind: "grantSupport", concept: `support:${p.supportStoneId}`, bucket: "effect", value: valueOf(p.level, params, opts).value, evidence: "inferred", understood: true };
    case "resource": return { ...base, kind: "resource", concept: `resource:${p.resourceType !== undefined ? resourceName(p.resourceType) : type.meaning}`, bucket: "effect", value: valueOf(p.numValue ?? p.value ?? p.pointNumber ?? p.point ?? p.num, params, opts).value, evidence: p.resourceType !== undefined && gameName("resource", p.resourceType) ? "sourced" : "inferred", understood: true };
    case "spreadAilment": return { ...base, kind: "spreadAilment", concept: "spreadAilment", type: p.keyValue === 5100003 || p.buffCfgId === 130 ? "ignite" : p.keyValue ? `tag ${p.keyValue}` : "the event's ailment", bucket: "effect", value: valueOf(p.probability ?? p.stackNum, params, opts).value, conditions: [...base.conditions, { kind: "range", text: `to enemies within ${typeof p.radius === "number" ? p.radius / 100 : p.radius} m` }], evidence: "inferred", understood: true };
    case "repeatAffix": return { ...base, kind: "repeatAffix", concept: "stacks", bucket: "effect", value: valueOf(p.maxAddCnt, params, opts).value, conditions: [...base.conditions, { kind: "per", text: `stacks up to ${valueOf(p.maxAddCnt, params, opts).value ?? p.maxAddCnt} times` }], evidence: "inferred", understood: true };
    case "setBonus": return { ...base, kind: "setBonus", concept: `set:${p.setsType}`, bucket: "effect", value: null, evidence: "inferred", understood: true };
    case "grantTalent": return { ...base, kind: "grantTalent", concept: `talent:${p.talentId}`, bucket: "effect", value: null, evidence: "sourced", understood: true };
    case "injectAffix": return { ...base, kind: "injectAffix", concept: `inject:${buffName(p.buffId ?? p.buffCfgId)}`, bucket: "effect", value: null, evidence: e.n === 629 ? "sourced" : "inferred", understood: true };
    case "injectAffixApplied": return { ...base, kind: type.kind, concept: `inject:${buffName(p.buffId)}`, bucket: "effect", value: null, evidence: "inferred", understood: true };
    default: {
      const value = valueOf(p.value ?? p.percent ?? p.point, params, opts);
      return { ...base, kind: type.kind, concept: type.kind, bucket: "effect", value: value.value, evidence: type.evidence, understood: true };
    }
  }
}

const resourceName = (id) => { const row = gameName("resource", id); return row ? (row[1] ?? row[0]) : String(id); };

/** Interpret an affix by id from the loaded table. */
export function interpretAffix(id, values = {}, options = {}) {
  return interpretRecipe(data().AFFIX_RECIPES[id], values, { ...options, id });
}

// ---------------------------------------------------------------------------------------------------------------------------
// Planner line -> affix id(s) -> effects. Shapes come from the recipes' own templates (whole text and each "\n" line).
function buildLineIndex() {
  const index = new Map();
  for (const [key, recipe] of Object.entries(data().AFFIX_RECIPES)) {
    if (!recipe.t) continue;
    const id = Number(key);
    const parts = recipe.t.split(/\\n/);
    for (const part of [recipe.t, ...(parts.length > 1 ? parts : [])]) {
      const s = shape(part);
      if (!s || s === "#") continue;
      const list = index.get(s) ?? [];
      if (!list.some((x) => x.id === id && x.part === part)) list.push({ id, whole: part === recipe.t, part });
      index.set(s, list);
    }
  }
  return index;
}
const ORIGIN_LETTER = { gear: "g", talent: "t", core: "t", prism: "t", slate: "s", pact: "p", kismet: "p", memory: "h", trait: "h", support: "u" };
// Write signature for telling same-text templates apart. One write to Attack and one to Spell equal one unscoped write.
export function writeSignature(effects) { return signature(effects); }
function signature(effects) {
  const groups = new Map();
  for (const e of effects) {
    if (e.kind !== "attr" && e.kind !== "field") continue;
    const key = `${e.attr ?? e.field}/${e.bucket}/${e.target}${e.local ? `/${e.local}` : ""}`;
    groups.set(key, [...(groups.get(key) ?? []), e.scope.join("+")]);
  }
  return [...groups.entries()].map(([key, scopes]) => {
    const set = [...new Set(scopes)].sort();
    return `${key}/${set.join("|") === "Attack|Spell" ? "" : set.join("|")}`;
  }).sort().join(" ");
}

// One candidate: an affix id bound to a line's numbers through one part (whole template or one "\n" line) of its template.
function bindCandidate(hit, numbers, multiplier) {
  const order = placeholderOrder(hit.part);
  const params = {};
  const bound = numbers.length === order.length;
  if (bound) order.forEach((p, i) => { if (!(`p${p}` in params)) params[`p${p}`] = numbers[i]; });
  const result = interpretAffix(hit.id, params, { multiplier });
  if (!hit.whole) {
    // One line of a multi-line affix: keep the effects its own placeholders feed (as src/affix-attributes.js does).
    const own = new Set(order);
    const recipe = data().AFFIX_RECIPES[hit.id];
    const keep = new Set();
    const shared = new Set();
    (recipe.r || []).forEach((row, r) => row.e.forEach((e) => {
      const refs = pRefs(e.v, e.u, e.p);
      const key = `${r}:${e.n}:${e.a ?? e.p?.field ?? ""}`;
      if (refs.some((x) => own.has(x))) keep.add(key);
      else if (!refs.length) shared.add(key);
    }));
    // A line none of whose placeholders feeds a node (a placeholder-free rule line, or values consumed by code) keeps the
    // recipe's placeholder-free nodes (a cast-mode switch, a set bonus, a label): they cannot be pinned to one line.
    const own2 = result.effects.filter((eff) => keep.has(`${eff.row}:${eff.node}:${eff.attr ?? eff.field ?? ""}`) || eff.viaAffix);
    result.effects = own2.length ? own2 : result.effects.filter((eff) => shared.has(`${eff.row}:${eff.node}:${eff.attr ?? eff.field ?? ""}`)).map((eff) => ({ ...eff, sharedPart: true }));
  }
  return { id: hit.id, part: !hit.whole, bound, params, result, categories: data().AFFIX_RECIPES[hit.id]?.c ?? "" };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Line ids (research §13): the game affix ids behind a talent, core, slate, prism, kismet, hero trait or memory line, from
// AFFIX_LINE_IDS (src/data/game/line-affix-ids.generated.js: config_talent, config_hero_character_tier, config_modifier).
//   exact: true  - the ids of one game record (a talent node, a core talent, a trait level, a kismet item): the line is one of
//                  them, so a line whose wording no template shape matches can still be bound to the record's id directly.
//   exact: false - a pool (every prism effect row, every talent record for a slate, every row of a memory
//                  type): it narrows same-text candidates but is never bound without a shape match.
// Pact spirit nodes and main effects: config_gen_contract_servant (chunk 13, research/pacts-chunk13-2026-11-01.md): one spirit's affixes; each is one of its record's lines.
const TALENT_SOURCE = /^(.+?) talent \((\d+),(\d+)\)$/;
const CORE_SOURCE = /^(.+?) core: (.+?)(?: \(Ethereal Prism\))?$/;
const TRAIT_SOURCE = /^Hero trait: (.+?) \(Lv (\d+)/;
// A gear line carries no row id. These are the legendary lines whose words reach another record's writes (chunk 12, research/legendaries-chunk12-2026-11-01.md §4): the corroded
// Glacial Abyss Arrow says Lightning, and its row's 737388224 writes attr 5719, all damage, on Numbed enemies.
const GEAR_LINE_RECORDS = Object.freeze({ "Glacial Abyss Arrow": [737388224] });
/**
 * Game affix ids for a planner modifier line ({ origin, source, text, reflectedFrom?, grantedCore? }), or null.
 * @returns {null | { ids: number[], exact: boolean, how: string, key: string }}
 */
export function lineGameIds(line) {
  const map = data().AFFIX_LINE_IDS;
  if (!map || !line) return null;
  const source = String(line.source ?? "");
  const out = (ids, exact, how, key) => (Array.isArray(ids) && ids.length ? { ids: [...new Set(ids)], exact, how, key } : null);
  switch (line.origin) {
    case "talent": {
      const m = source.match(TALENT_SOURCE);
      const cc = m && map.trees?.[m[1]];
      if (!cc) return null;
      // An Inverse Image copy is its source node (src/modifier-texts.js reflectedFrom).
      const [column, row] = (line.reflectedFrom ? String(line.reflectedFrom).split(",") : [m[2], m[3]]).map(Number);
      // Thea's Prophecy of Revelation puts its replacement record (the original's id + 1) on the node (src/prophecy-of-revelation.js).
      const id = Number(line.talentGameId) || cc * 1e6 + (column + 1) * 1e4 + (row + 1) * 100;
      return out(map.talents?.[id], true, `config_talent ${id} (${m[1]} ${column},${row}${line.reflectedFrom ? `, reflected to ${m[2]},${m[3]}` : ""})`, String(id));
    }
    case "core": {
      const m = source.match(CORE_SOURCE);
      const name = line.grantedCore ?? m?.[2];
      const all = (name && map.cores?.[name]) || [];
      if (!all.length) return null;
      const cc = m && map.trees?.[m[1]];
      const own = cc ? all.filter((key) => Math.floor(Number(key) / 1e6) === cc) : [];
      const keys = own.length ? own : all;
      const ids = keys.flatMap((key) => map.talents?.[key] ?? []);
      // One core record (or several with the same affixes) is exact; copies with different affixes are a pool.
      const same = new Set(keys.map((key) => JSON.stringify(map.talents?.[key] ?? []))).size === 1;
      return out(ids, same, `config_talent core ${keys.join("/")} (${name})`, keys.join("/"));
    }
    case "trait": {
      const m = source.match(TRAIT_SOURCE);
      return m ? out(map.traits?.[m[1]]?.[m[2]], true, `config_hero_character_tier ${m[1]} Lv ${m[2]}`, `${m[1]}|${m[2]}`) : null;
    }
    case "kismet": {
      const name = source.split(" · ").pop().replace(/\s*\(captured[^)]*\)$/, "").trim();
      return out(map.kismets?.[name], true, `config_modifier kismet row (${name})`, name);
    }
    case "pact": {
      // Affix 10214 has no effect rows (a server affix). It holds the Destiny node's "+6% damage", "+6% Minion Damage" and the Damage II nodes' "+24%": these keep the wording's reading.
      if (line.pactDestiny || /^\+[\d.]+% (?:damage|Minion Damage)$/i.test(String(line.text ?? "").trim())) return null;
      const name = source.replace(/ node$/, "").trim();
      return out(map.pacts?.[name], true, `config_gen_contract_servant (${name})`, name);
    }
    case "memory": {
      const name = source.replace(/^Hero memory:\s*/, "").trim();
      return out([...(map.memories?.[name] ?? []), ...(map.memories?.["Memory Revival"] ?? [])], false, `config_modifier ${name} and revived rows`, name);
    }
    case "gear": return out(GEAR_LINE_RECORDS[source], true, `config_modifier row of ${source}`, source);
    case "prism": return out(map.prism, false, "config_modifier prism effect rows", "prism");
    case "slate": return out(map.slatePool, false, "config_talent talent records (slate pool)", "slate");
    default: return null;
  }
}

const words = (s) => new Set(String(s).toLowerCase().replace(/\$[+-]?p\d+\$|[+-]?\d+(?:\.\d+)?/g, " ").split(/[^a-z]+/).filter((w) => w.length > 2));
// Bind a line straight to one of a record's ids when no template shape matches (wording differs between the planner's text and
// the game template): the part with as many placeholders as the line has numbers and the most words in common (at least half,
// and no tie).
function bindById(text, ids, multiplier) {
  const numbers = lineNumbers(text);
  const mine = words(text);
  const scored = [];
  for (const id of ids) {
    const recipe = data().AFFIX_RECIPES[id];
    if (!recipe?.t) continue;
    const parts = recipe.t.split(/\\n/);
    for (const part of [recipe.t, ...(parts.length > 1 ? parts : [])]) {
      if (placeholderOrder(part).length !== numbers.length) continue;
      const theirs = words(part);
      const common = [...mine].filter((w) => theirs.has(w)).length;
      const score = common / Math.max(1, Math.max(mine.size, theirs.size));
      scored.push({ id, part, whole: part === recipe.t, score });
    }
  }
  // A part that feeds no effect of its own (a Dual Kismet header's listed line) is not the line's affix.
  const bound = scored.map((x) => ({ ...x, candidate: bindCandidate(x, numbers, multiplier) })).filter((x) => x.whole || x.candidate.result.effects.some((e) => !e.sharedPart));
  bound.sort((a, b) => b.score - a.score);
  if (!bound.length || bound[0].score < 0.5 || (bound[1] && bound[1].score === bound[0].score && bound[1].id !== bound[0].id)) return null;
  return bound[0].candidate;
}

/**
 * Resolve a planner line to its affix id(s) and interpret them.
 * options: multiplier (talent ranks), origin (the line's origin, narrows same-text templates), ids (exact affix ids from the
 *   planner's own data), line (the planner line { origin, source, … }: its game ids come from lineGameIds unless `ids` is given).
 * @returns {null | { shape, via, candidates: [{ id, part, params, result }], ambiguous, chosen, resolvedBy, alternatives, gameIds? }}
 *   resolvedBy: "exact" (game ids settled same-text templates), "id" (no template shape matched; bound to the record's id),
 *   "single" / "origin" / "majority" (text).
 */
export function interpretLine(text, { multiplier = 1, origin = null, ids = null, line = null } = {}) {
  lineIndex ??= buildLineIndex();
  const raw = normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
  const game = !ids && line ? lineGameIds(line) : null;
  // A line the planner settled from another one (src/line-effects.js: a condition held, a per-stat value; a trait keyword's own
  // lines) is not the game line itself: its record id belongs to `derivedFrom`, which is reported, and the text reading stays.
  const derived = game && line?.derivedFrom ? String(line.derivedFrom) : null;
  const useIds = Array.isArray(ids) && ids.length ? ids : game?.ids ?? null;
  const gameIds = game ? { how: game.how, exact: game.exact, key: game.key, ids: game.ids } : null;
  if (derived) {
    const of = interpretLine(derived, { multiplier, origin, ids: game.ids });
    const result = interpretLine(text, { multiplier, origin });
    const derivedFrom = { text: derived, id: of && game.ids.includes(of.chosen.id) ? of.chosen.id : null };
    return result ? { ...result, gameIds: { ...gameIds, unbound: true, derivedFrom } } : null;
  }
  const attempts = [{ text: raw, via: "direct" }];
  const stripped = raw.replace(/^[^:%]{2,60}:\s+/, "");
  if (stripped !== raw) attempts.push({ text: stripped, via: "prefix" });
  let textFallback = null;
  for (const attempt of attempts) {
    const key = shape(attempt.text);
    const hits = lineIndex.get(key);
    if (!hits?.length) continue;
    const whole = hits.filter((h) => h.whole);
    const pool = whole.length ? whole : hits;
    const numbers = lineNumbers(attempt.text);
    const candidates = pool.map((hit) => bindCandidate(hit, numbers, multiplier));
    // Several ids can share one English template with different writes. Exact ids from the planner's own data (option `ids`:
    // the support's skill stone, the gear row's config_modifier affix; scripts/compare-recipes.mjs exactLineIds; or the line's
    // game record, lineGameIds) settle it ("exact"); otherwise the line's origin narrows them (the recipe's planner
    // categories), then the write signature most ids share is taken ("majority") and the rest are kept as alternatives.
    // ambiguous: no single signature wins.
    let exact = useIds ? candidates.filter((c) => useIds.includes(c.id)) : [];
    // The line's record may hold a multi-line template of which this line is one part, while another template matches the
    // whole line (Growing Breeze 782738 "When a Spirit Magus casts a skill, … lose 1 stack of Nourishment / …" vs 360698):
    // the record's part wins.
    if (useIds && !exact.length && pool !== hits) {
      // Only a part that feeds an effect of its own (not a Dual Kismet header's listed line, which only names the set row's
      // effects).
      exact = hits.filter((h) => !h.whole && useIds.includes(h.id)).map((hit) => bindCandidate(hit, numbers, multiplier)).filter((c) => c.result.effects.some((e) => !e.sharedPart));
      if (exact.length) candidates.push(...exact);
    }
    if (exact.length) {
      const signatures = new Set(exact.map((c) => signature(c.result.effects)));
      const others = candidates.filter((c) => !exact.includes(c));
      const allSignatures = new Set(candidates.map((c) => signature(c.result.effects))).size;
      return { shape: key, via: attempt.via, candidates, chosen: exact[0], ambiguous: signatures.size > 1, resolvedBy: allSignatures > 1 ? "exact" : "single", alternatives: others.map((c) => c.id), ...(gameIds ? { gameIds } : {}) };
    }
    let pool2 = candidates;
    if (origin && ORIGIN_LETTER[origin]) {
      const byOrigin = candidates.filter((c) => c.categories.includes(ORIGIN_LETTER[origin]));
      if (byOrigin.length) pool2 = byOrigin;
    }
    const groups = new Map();
    for (const c of pool2) { const sig = signature(c.result.effects); groups.set(sig, [...(groups.get(sig) ?? []), c]); }
    const ranked = [...groups.values()].sort((a, b) => b.length - a.length);
    const ambiguous = ranked.length > 1 && ranked[0].length === ranked[1].length;
    const allSignatures = new Set(candidates.map((c) => signature(c.result.effects))).size;
    const resolvedBy = ranked.length > 1 ? "majority" : allSignatures > 1 ? "origin" : "single";
    const alternatives = ranked.slice(1).flat().map((c) => c.id);
    const textResult = { shape: key, via: attempt.via, candidates, chosen: ranked[0][0], ambiguous, resolvedBy, alternatives, ...(gameIds ? { gameIds } : {}) };
    // The line's own game record (exact) names none of the shape's templates: the record decides (below), not the text.
    if (game?.exact) { textFallback ??= textResult; continue; }
    return textResult;
  }
  // No template shape names the record's affixes (the planner's wording differs from the game template, or no shape matched):
  // bind the line to the record's own id. When that fails too, the text reading stays, flagged `gameIds.unbound`.
  // The binding is reported either way. `templateMismatch` (2026-10-25, research §15) marks a line whose own wording matches other
  // templates (none of them the record's): the planner text and the game record disagree (a probe that rewrites a node's text, a
  // stale catalog wording). `chosen` stays the record's affix; `templateMismatch.wording` is the wording's own reading, for callers
  // that follow the planner text (src/recipe-trauma-layers.js resolveLine), so none of them has to interpret the line twice.
  if (game?.exact) {
    const bound = bindById(raw, game.ids, multiplier);
    if (bound && textFallback) return { shape: shape(raw), via: "id", candidates: [bound], chosen: bound, ambiguous: false, resolvedBy: "id", alternatives: [], gameIds, templateMismatch: { wordingIds: textFallback.candidates.map((c) => c.id), wording: { ...textFallback, gameIds: { ...gameIds, unbound: true } } } };
    if (bound) return { shape: shape(raw), via: "id", candidates: [bound], chosen: bound, ambiguous: false, resolvedBy: "id", alternatives: [], gameIds };
    if (textFallback) return { ...textFallback, gameIds: { ...gameIds, unbound: true } };
  }
  return null;
}

/** Coverage of one recipe: "full" (every effect understood, every gate known), "partial", or "none". */
export function recipeCoverage(id) {
  const recipe = data().AFFIX_RECIPES[id];
  if (!recipe) return { id, level: "none", reasons: ["no recipe"] };
  // Placeholder values: 1 for every parameter, so parameter-only values evaluate.
  const params = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`p${i}`, 1]));
  const result = interpretRecipe(recipe, params, { id });
  const effects = result.effects;
  const understood = effects.filter((e) => e.understood).length;
  const unknownGates = result.unknown.filter((u) => u.gate !== undefined).length;
  // No effect at all: "none" only if a running row holds a node that gave none (11041045 runs one gate-only row, and its cleanse row never starts).
  const running = recipe.r.some((row, place) => row.e.length && !result.idleRows?.includes(rowNumber(row, place)));
  const level = !effects.length ? (running ? "none" : "empty") : understood === effects.length && !unknownGates ? "full" : understood ? "partial" : "none";
  return { id, level, effects: effects.length, understood, reasons: result.unknown.map((u) => u.reason) };
}

/**
 * Census of the loaded table (completeness pass, 2026-10-25): per category, how many uses have a known meaning and how many of
 * those meanings are sourced (named by the game's own data) or inferred (read from parameters and templates).
 *   recipes: full / partial / none / empty (recipeCoverage levels).
 *   nodes / gates / conditions / triggers: uses; known = in NODE_TYPES / GATE_TYPES / TRIGGERS; sourced = that entry is sourced.
 *   attributes (node 101 / b / 321 / 363 / 364 writes, attribute 0 flags excluded): mapped = a planner concept; named = a
 *     config_attributes name (English or internal) or a field / label table row behind an encoded id; sourced = the meaning is.
 *   fields (108 / 132 / 336 field writes): mapped = FIELD_CONCEPTS; named = a config_char_field row or a template label.
 *   labels (107 / 213): named = a config_char_label row. tags (every tag id in trigger, effect and gate tags): named.
 *   statSources (119 / 2313 `from`): known = in STAT_SOURCES (all inferred).
 */
export function recipeCensus() {
  const recipes = data().AFFIX_RECIPES;
  const blank = () => ({ uses: 0, known: 0, sourced: 0, unknown: {} });
  const out = { recipes: { full: 0, partial: 0, none: 0, empty: 0 }, nodes: blank(), gates: blank(), conditions: blank(), triggers: blank(),
    attributes: { uses: 0, mapped: 0, named: 0, sourced: 0, unknown: {} }, fields: { uses: 0, mapped: 0, named: 0, sourced: 0, unknown: {} },
    labels: { uses: 0, named: 0, unknown: {} }, tags: { uses: 0, named: 0, unknown: {} }, statSources: { uses: 0, known: 0, unknown: {} } };
  const miss = (bucket, key) => { bucket.unknown[key] = (bucket.unknown[key] ?? 0) + 1; };
  const count = (bucket, table, key) => { bucket.uses++; const entry = table[key]; if (entry) { bucket.known++; if (entry.evidence === "sourced") bucket.sourced++; } else miss(bucket, key); };
  const tagList = (t) => (t && typeof t === "object" ? Object.values(t).flat().filter((x) => typeof x === "number") : []);
  const countTags = (t) => { for (const tag of tagList(t)) { out.tags.uses++; if (tagKnown(tag)) out.tags.named++; else miss(out.tags, tag); } };
  const walk = (tree, f) => { if (!tree) return; if (Array.isArray(tree)) return tree.forEach((x) => walk(x, f)); if (tree.n !== undefined) f(tree); walk(tree.k, f); };
  const countField = (id) => { out.fields.uses++; const m = fieldMeaning(id); if (FIELD_CONCEPTS[m.base]) out.fields.mapped++; if (m.concept) { out.fields.named++; if (m.evidence === "sourced") out.fields.sourced++; } else miss(out.fields, id); };
  for (const key of Object.keys(recipes)) out.recipes[recipeCoverage(Number(key)).level]++;
  for (const recipe of Object.values(recipes)) for (const row of recipe.r || []) {
    if (row.tr) { count(out.triggers, TRIGGERS, row.tr.id); countTags(row.tr.tags); }
    for (const g of row.g || []) {
      count(out.gates, GATE_TYPES, g.n);
      if (g.n === 213) { out.labels.uses++; if (labelMeaning(g.p?.label).concept) out.labels.named++; else miss(out.labels, g.p?.label); }
      if (typeof g.p?.tag === "number") countTags({ mine: [g.p.tag] });
      if (Array.isArray(g.p?.tags)) countTags({ mine: g.p.tags });
      walk(g.c, (c) => { count(out.conditions, GATE_TYPES, c.n); if (typeof c.p?.tag === "number") countTags({ mine: [c.p.tag] }); if (Array.isArray(c.p?.tags)) countTags({ mine: c.p.tags }); });
    }
    for (const e of row.e) {
      count(out.nodes, NODE_TYPES, e.n);
      walk(e.c, (c) => { count(out.conditions, GATE_TYPES, c.n); if (typeof c.p?.tag === "number") countTags({ mine: [c.p.tag] }); if (Array.isArray(c.p?.tags)) countTags({ mine: c.p.tags }); });
      countTags(e.tg);
      if (typeof e.a === "number" && e.a !== 0 && [101, "b", 321, 363, 364].includes(e.n)) {
        out.attributes.uses++;
        const m = attributeMeaning(e.a);
        if (m.conceptMapped !== false && m.concept) out.attributes.mapped++;
        if (m.concept) { out.attributes.named++; if (m.evidence === "sourced") out.attributes.sourced++; } else miss(out.attributes, e.a);
      }
      if (typeof e.p?.field === "number" && e.p.field !== 0 && [108, 132, 336].includes(e.n)) countField(e.p.field);
      if (e.n === 107) { out.labels.uses++; if (labelMeaning(e.p?.label).concept) out.labels.named++; else miss(out.labels, e.p?.label); }
      if ((e.n === 119 || e.n === 2313) && e.p?.from !== undefined) { out.statSources.uses++; if (STAT_SOURCES[e.p.from]) out.statSources.known++; else miss(out.statSources, e.p.from); }
    }
  }
  return out;
}
