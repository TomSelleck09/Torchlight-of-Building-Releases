import { normalizePercentageText } from "./percentage-text.js";
import { collectAilmentTypedSources, collectDamagingAilmentChance, collectAilmentDuration, CHANCE_TO_DAMAGE } from "./ailment-model.js";
import { collectReapingModifiers } from "./reaping-model.js";
import { parseReapingSource } from "./reaping-sources.js";
import { plannerContributions } from "./skill-coverage.js";
import { isCharacterStatLine } from "./character-stats.js";
import { classifyDamageLine, routeDamageLine } from "./damage-line-classifier.js";
import { matchTalentTextClause } from "./talent-text-effects.js";
import { lineEffectFor, resolveLineEffects } from "./line-effects.js";
import { resolveHeroModules, heroModuleFor } from "./hero-trait-modules.js";
import { classifyWeaponAttackLine } from "./weapon-damage-model.js";
import { skillLevelLineApplies, emptySlotLevelLine, emptySlotLevelApplies } from "./skill-level-bonuses.js";
import { familyOf, hasDamageSignal, isNonDamageBody, residualNonDamageStatus } from "./line-families.js";
import { grantedCoreLine, stripGrantedCore } from "./granted-core-lines.js";
import { classifyPassiveSupportLine } from "./passive-support-lines.js";
import { classifyDoubleDamageLine } from "./double-damage.js";
import { classifyCritOnlyLine } from "./crit-only-lines.js";
import { parseBlurSource } from "./blur-sources.js";
import { blockedAilmentsOf } from "./ailment-blocks.js";
import { classifyTaggedCritLine } from "./scorching-beam-critical.js";
import { classifyMinionLine, nourishmentLineKind } from "./minion-damage-model.js";
import { classifySkillCoverage } from "./skill-coverage.js";
import { parseItemTrigger, itemTriggerEvent } from "./item-triggered-skills.js";
import { inferDamageProfile } from "./skill-damage-profiles.js";
import { tlidbSkillCatalogSs13, tlidbSupportCatalogSs13 } from "./data/catalogs/tlidb-ss13.js";
import { resolveSupportEffects, supportClauseSummary } from "./support-effects.js";
import { expandScriptedItemLine, grantedPreciseAuras, PASSIVE_GRANT } from "./gear-unique-modules.js";
import { NAMED_AURA_SMC_ADDITIONAL } from "./aura-effects.js";
import { auraGainedLineStatus } from "./aura-gained-effects.js";
import { RADICAL_EVOLUTION, radicalEvolutionAuraEffects } from "./origin-of-spirit-magus.js";
import { classifyHitLine, splitHitLineText } from "./skill-hit-lines.js";
import { MULTISTRIKE_SPEED_LINE, UNSTOPPABLE_FORCE_LINE, CAST_SPEED_TO_CHARGE_LINE, SPELL_RIPPLE_LINE, SWEEPING_FURY_LINE, PROJECTILE_QUANTITY_LIMIT_LINE, MAIN_SPELL_REPEAT_LINE, SHADOW_QUANTITY_LINE, SHADOW_DAMAGE_LINE, SHADOW_CHANCE_LINE, BARRAGE_WAVE_CHANCE_LINE, BARRAGE_PER_WAVE_LINE, SPELL_BURST_USE_GAIN, DEMOLISHER_CONSUMED_LINE } from "./skill-hit-model.js";
import { TERRA_CHARGE_ON_USE } from "./selena-dance.js";
import { ATTACK_AILMENT_CHANCE } from "./ailment-applications.js";
import { COMBO_POINTS_GAINED_LINE } from "./combo-points.js";
import { markLineKind } from "./mark-effect.js";
import { pureHeartLineStatus } from "./pure-heart.js";
import { REGAIN_ENABLERS } from "./regain-model.js";
import { ONLY_DAMAGE_TYPE_LINE } from "./damage-type-restriction.js";
import { WEAPON_TO_SPELLS_LINE, WEAPON_CRIT_TO_SPELLS_LINE } from "./towering-presence.js";
import { isTangleAttachLine, isTangleDurationLine, isTangleEnhancementLine, tangleAttachStatus, tangleDurationStatus } from "./tangle-model.js";
import { EMPOWER_DEFENSIVE_EFFECT_LINE } from "./storm-command.js";
import { COMMAND_FAMILIES, COMMAND_GATED } from "./minion-cores.js";
import { setupBoardTab } from "./magus-active-slot.js";
import { legendaryLineStatus } from "./legendary-line-status.js";
import { TROOP_FAMILIES } from "./moto-iris-traits.js";

// Second opinion for tooltip coverage badges. The older per-panel checks know the
// Ignite ledger; this one knows the generic ailment, Reaping, crit, support, curse,
// and build-mechanics layers, and labels lines that cannot change single-target
// dummy damage instead of calling them "Not modeled". Plain stat lines with no dummy-damage
// effect read "Counted in stats": src/character-stats.js sums them for the stat sheet.

let context = null;
export function setCoverageContext(planner) { context = planner || null; }
export function coverageContext() { return context; }

export const neutralStatuses = new Set(["Counted in stats", "No DPS effect", "Not on dummy", "Planner only", "Quality of life"]);

const asLine = (text) => ({ text, source: "coverage", origin: "coverage", multiplier: 1 });

const engineRules = [
  /^\+[\d.]+% additional Damage Over Time$/i,
  /^\+[\d.]+% additional damage when having both Sealed Mana and Life$/i,
  /^\+[\d.]+% additional damage against Cursed enemies$/i,
  /\+[\d.]+% additional Ailment Damage while Blur is active$/i,
  /^Upon inflicting damage, \+[\d.]+% additional Ailment Damage \(multiplies\) for every type of Ailment the enemy has$/i,
  // (gear-pact batch chunk 1: "additional damage applied to Life", "additional Affliction effect", scoped crit damage and
  // skill levels moved out of this static list: they are decided by their readers below.)
  // Both wordings (2026-10-15): "per recent Critical Strike" and Nether King's "per recent non-Critical Strike".
  /^\+[\d.]+% Critical Strike Damage per recent (?:non-)?Critical Strike, up to \d+ stacks?$/i,
  /^\+[\d.]+% Critical Strike Damage against enemies affected by Ailments$/i,
  /^For every 1% Fire Resistance, \+[\d.]+% Critical Strike Damage, up to \+[\d.]+%$/i,
  // Reductions too ("-20% Critical Strike Damage against Traumatized enemies", Kismet: Red Leech; kismet / pact audit 2026-10-21):
  // the crit models read a negative line like a positive one; it read Inactive although it moved the Trauma fixture.
  /^[+-][\d.]+% (?:Spell )?Critical Strike Rating$/i,
  /^[+-][\d.]+% Critical Strike Damage$/i,
  /^\+[\d.]+% Attack and Cast Speed for Channeled Skills$/i,
  /^\+[\d.]+ Affliction inflicted per second$/i,
  /^\+[\d.]+% Affliction Effect$/i,
  /^\+?[\d.]+% Blur Effect$/i,
  /chance to (?:gain|regain) Blur/i,
  /^Gains \d+ stack\(s\) of (?:Focus|Tenacity|Agility) Blessing when/i,
  /^\+[\d.]+% Sealed Mana Compensation$/i,
  /^\+[\d.]+% Aura Effect$/i,
  /^\+[\d.]+% Reaping Recovery Speed if you have caused Reaping recently$/i
];

const MINION_RULE = /Minion/i;
// "You can cast / inflict N additional Curses" only raises the curse limit, which no longer gates the calculation (user decision
// 2026-10-21: every curse applies; the limit drives the over-limit warning only): No DPS effect (CURSE_LIMIT_LINE_REASON).
export const CURSE_LIMIT_LINE = /^You can (?:cast|inflict) \d+ additional Curses?$/i;
export const CURSE_LIMIT_LINE_REASON = "curse limit no longer gates the calculation (every curse applies; the limit only sets the over-limit warning)";
const noDpsRules = [
  CURSE_LIMIT_LINE,
  /Movement Speed/i, /Energy Shield/i, /\bDefense\b/i, /\bArmor\b/i, /\bEvasion\b/i, /Life Regeneration/i, /Life Regain|Energy Shield Regain/i,
  /^\+[\d.]+% (?:gear )?(?:Max )?Life$/i, /Max Mana$/i, /Mana Regeneration/i, /Injury Buffer/i, /Barrier of Radiance/i,
  /^Immune to /i, /are immune to/i, MINION_RULE, /Skill Area/i, /Projectile Speed/i, /Beam Length/i, /Skill Cost/i,
  // "+X% Aura Area" (Radiation Field; hero trait audit B6, adjudicated c → d): the dummy stands inside every Aura's area.
  /^\+[\d.]+% Aura Area$/i,
  // The character's own damage taken per Elemental Damage type received (Elementalist Legendary Medium; slates audit 2026-10-22, c → d).
  /additional Elemental Damage taken for every type of Elemental Damage recently received$/i,
  // A movement on cast (Dark Advance's "Moves in the target direction when casting Dark Gate"; core audit B7).
  /^Moves in the target direction when casting /i,
  // No /Paralyze/ rule (2026-10-14): every "Paralyze" wording in the catalogs inflicts Paralysis (+15% damage taken, read by
  // src/combat-states.js) or scales damage against Paralyzed enemies, so none is a defence-only line.
  /Crowd Control/i, /damage taken (?:from|while|when|if)/i, /Damage taken to /i, /^Converts [\d.]+% of \w+ Damage taken/i,
  /additional [\w ]*Damage taken$/i, /Curse effect against you/i, /Ailments inflicted are reflected back onto you/i,
  /^[+-]?[\d.]+% (?:Fire|Cold|Lightning|Erosion|Elemental|All) Resistance$/i, /Resistance(?:s)?$/i, /chance to avoid/i, /Restores [\d.]+% Missing Life/i,
  /Experience/i, /Item (?:Rarity|Quantity)/i,
  // SS14 Drop pact spirits' gameplay loot lines (Ripplepop - Taro, Heartbloom - Iris, Twin Inquisitors; kismet / pact audit 2026-10-21).
  /Warden's Cache|Torture Instrument refresh/i, /Bond Gaining Speed/i, /^\+\d+ Max Bond stacks$/i, /^Can obtain Bond$/i, /Pickup Range/i, /Light Radius/i, /Cooldown Recovery Speed/i, /Charge Speed/i, /Sealed Mana$/i
];

/**
 * Status of an Ill Omen line (src/ill-omen.js), or null for other lines (and without a planner, where the generic
 * "Not on dummy" rule answers). No Ominous in the build: Inactive. Nether King's extra effect: Not modeled. With the
 * illOmen condition on the lines are In calc (best case beyond the dummy); off, Not on dummy.
 */
export function illOmenLineStatus(text, planner = context) {
  const clean = normalizePercentageText(String(text || "")).trim();
  const efficiency = clean.match(/^[+-]?[\d.]+% Ill Omen Cumulative Efficiency( while Blur is active)?$/i);
  const purification = /^Ill Omen Effect is (?:converted to|becomes): /i.test(clean);
  const nether = /^Ill Omen gains an additional effect/i.test(clean);
  // An Ominous curse line (gear, slate, core): In calc while the Ill Omen line is in the dummy figures; otherwise the curse
  // rules answer ("Not on dummy").
  if (/cursed (?:by|with) Lv\. \d+ Ominous\b/.test(clean) || /Triggers? Lv\. \d+ Ominous Curse/i.test(clean)) return planner?.illOmen?.main?.applied && planner.illOmen.sources.some((source) => source.text === clean) ? "In calc" : null;
  if (!(efficiency || purification || nether) || !planner) return null;
  if (!planner.illOmen) return "Inactive";
  if (nether) return "Not modeled";
  if (efficiency?.[1] && !planner.conditions?.blur) return "Inactive";
  return planner.illOmen.main?.applied ? "In calc" : "Not on dummy";
}

const notOnDummyRules = [
  // (No "when evading": being attacked is a best-case assumption since the user's decision of 2026-10-12.)
  /Ill Omen/i, /spread to targets in Proximity/i, /for every enemy defeated|upon defeating|when defeating|on kill/i,
  /Spacetime Turbulence/i, /Nearby non-Elite enemies/i
];

const variants = (text) => {
  const clean = normalizePercentageText(String(text || "")).trim();
  const out = [clean];
  // "[Core name] effect" reads as its body (gear-pact batch G2; src/granted-core-lines.js).
  const granted = grantedCoreLine(clean);
  if (granted) out.push(granted.body);
  const colon = clean.lastIndexOf(": ");
  if (colon > 0) out.push(clean.slice(colon + 2));
  for (const value of [...out]) {
    const dash = value.match(/^[A-Z][\w' ]+ — (.+)$/);
    if (dash) out.push(dash[1]);
  }
  return [...new Set(out)];
};

// A label prefix is Title Case words ("Psychic: Legendary Medium Talent: ", "God of Might: Micro Talent: "); a sentence
// ("Changes the base effect of Tenacity Blessing to: ", Onslaughter core Sacrifice) is not one (talent batch T7).
const LABEL_WORD = "(?:[A-Z0-9][\\w'.]*|of|the|and)";
const BRACKET_PREFIX = /^\[[^\]]+\]\s*$/;
const LABEL_PREFIX = new RegExp(`^${LABEL_WORD}(?: ${LABEL_WORD})*(?::\\s*${LABEL_WORD}(?: ${LABEL_WORD})*)*:\\s*$`);

// Status for one clause, or null when this layer has no opinion.
// A plain stat line that changes no dummy damage is summed by src/character-stats.js; it reads
// "Counted in stats" instead of "No DPS effect" (or no opinion). Checked after every variant so a
// prefixed line ("Psychic: Legendary Medium Talent: +16% Blur Effect") keeps "In calc".
export function engineLineStatus(text, planner = context) {
  // "<Aura> gains an additional effect: <modifiers>" (src/aura-gained-effects.js): the Aura's state and the clauses' readers decide.
  const gainedAura = planner ? auraGainedLineStatus(text, planner) : null;
  if (gainedAura) return gainedAura;
  // Regain enablers on attack Critical Strike (Ranger Legendary Medium Talents; user-stated 2026-10-14; src/regain-model.js):
  // In calc when the talent drives a Regain pool that a used Regain line reads; otherwise Life / Energy Shield recovery only.
  const enabler = regainEnablerStatus(text, planner);
  if (enabler) return enabler;
  const regainAmount = regainAmountStatus(text, planner);
  if (regainAmount) return regainAmount;
  let found = null;
  // "[Core] effect" lines are judged as their body (the intake reads only the body; a conditional body must not be split
  // with the bracket still on it). Dedicated bracket names keep their text (src/granted-core-lines.js).
  const [whole, ...rest] = variants(stripGrantedCore(normalizePercentageText(String(text || "")).trim()));
  for (const clause of [whole, ...rest]) {
    // A stripped variant keeps the generic damage rule only behind a label-like prefix ("Psychic: Legendary
    // Medium Talent: +9% damage"), not behind a sentence ("… changes the base effect of Tenacity Blessing to: …").
    const prefix = clause === whole ? "" : whole.slice(0, whole.length - clause.length);
    found = clauseStatus(clause, planner, { allowGeneric: clause === whole || LABEL_PREFIX.test(prefix) || BRACKET_PREFIX.test(prefix) });
    if (found) break;
  }
  if (found === null) for (const clause of [whole, ...rest]) { found = familyStatus(clause); if (found) break; }
  if ((found === null || found === "No DPS effect") && isCharacterStatLine(text)) return "Counted in stats";
  return found;
}

/**
 * A Regain amount line's status ("+X% Life Regain", "+X% Energy Shield Regain", "-10% Life Regain and Energy Shield Regain"), or
 * null when the text is not one. The Regain model (src/regain-model.js) Regains only with a non-zero amount, so the amount decides
 * whether a "When Regaining …" / "Regained in the last N s" line of the build holds (gear affix audit 2026-10-22: the -10% line
 * moved the Erika build while it read Counted in stats). In calc where the build carries such a line and this line decides whether
 * a pool it names Regains (the pool's amount crosses 0 with it); otherwise the amount is recovery only.
 */
export function regainAmountStatus(text, planner = context) {
  const clean = normalizePercentageText(String(text || "")).replace(/\s+/g, " ").trim();
  const match = clean.match(/^([+-][\d.]+)% (Life Regain|Energy Shield Regain|Life Regain and Energy Shield Regain)$/i);
  if (!match || !planner?.activation) return null;
  const reads = (planner.lineEffects?.lines || []).some((line) => line.condition === "regained" || /^When Regaining\b/i.test(line.text || ""));
  const value = Number(match[1]);
  const pools = /and/i.test(match[2]) ? ["life", "energyShield"] : /Energy Shield/i.test(match[2]) ? ["energyShield"] : ["life"];
  const regain = planner.lineEffects?.combat?.regain;
  const decides = pools.some((pool) => { const amount = Number(regain?.pools?.[pool]?.uncappedPercent) || 0; return value > 0 ? amount > 0 && amount - value <= 0 : amount <= 0 && amount - value > 0; });
  return reads && decides ? "In calc" : "Counted in stats";
}

/** A Regain enabler line's status (src/regain-model.js), or null when the text is not one. */
export function regainEnablerStatus(text, planner = context) {
  const clean = normalizePercentageText(String(text || "")).replace(/\s+/g, " ").trim();
  const kind = REGAIN_ENABLERS.find((item) => new RegExp(item.pattern.source.replace(/^\^/, ""), "i").test(clean));
  if (!kind) return null;
  const regain = planner?.lineEffects?.combat?.regain;
  const driven = Boolean(regain?.active && regain.pools?.[kind.pool]?.drivenBy?.length);
  const used = (planner?.lineEffects?.lines || []).some((line) => line.active && (line.condition === "regained" || /^When Regaining\b/i.test(line.text || "")));
  return driven && used ? "In calc" : "No DPS effect";
}

// ---- Engine-aware statuses for parsed keys (talent batch T7) -------------------------------
// The talent / slate / gear parsers know which engine family reads a key (src/talent-text-effects.js routes); this
// says whether the build has that engine: a line the build cannot use reads "Inactive" (damage) or "Counted in stats"
// (speed and crit stats), never "In calc" (research/talent-batch-2026-10-12.md §3.1, §3.2).
export function plannerEngines(planner = context) {
  if (!planner || typeof planner !== "object" || !planner.activation) return null;
  const active = planner.activation.activeNames || new Set();
  const beam = active.has("Scorching Beam");
  const setupTags = (key) => new Set(planner.activation.setups?.find((setup) => setup.setupKey === key)?.tags || []);
  const hits = (planner.skillHits || []).filter((hit) => hit.modeled);
  const dots = (planner.skillDots || []).filter((dot) => dot.modeled);
  const baseIgnite = planner.theoretical?.totals?.baseIgniteDamage?.max > 0;
  const igniteAppliers = beam || (planner.igniteAppliers || []).length > 0;
  // An applier with Ignite chance (src/ailment-applications.js): without one a base Ignite line starts nothing.
  const igniteChance = (planner.igniteAppliers || []).some((applier) => applier.chancePercent > 0);
  const otherAilment = ["trauma", "wilt"].some((key) => planner.ailments?.[key]?.base?.max > 0);
  const ignite = baseIgnite && igniteChance;
  return {
    beam, hits, dots, ignite, igniteAppliers, otherAilment,
    // Damage types of the DoTs on the dummy (Ignite Fire, Trauma Physical, Wilt Erosion, each skill DoT's own type).
    dotTypes: new Set([...(ignite ? ["Fire"] : []), ...(planner.ailments?.trauma?.base?.max > 0 ? ["Physical"] : []), ...(planner.ailments?.wilt?.base?.max > 0 ? ["Erosion"] : []), ...dots.map((dot) => dot.damageType).filter(Boolean)]),
    igniteChance, baseIgnite,
    reaping: Boolean(planner.theoretical?.combat?.reaping?.sources?.some((source) => source.minimum?.triggersPerSecond > 0)) || (planner.damagePaths?.twentySeconds?.reaping?.sources || []).some((source) => source.triggersPerSecond > 0 || source.intervalSeconds < Infinity),
    anyHit: beam || hits.length > 0,
    anyDot: ignite || otherAilment || dots.length > 0,
    spellHit: beam || hits.some((hit) => setupTags(hit.setupKey).has("Spell")),
    // Every non-attack hit takes the cast-rate ledger (a Terra's "fixed" cadence still has a cast-speed use time).
    castRate: beam || hits.some((hit) => hit.rate?.speedType !== "attack-speed") || dots.some((dot) => !(dot.profile?.refreshPerSecond > 0) && !(dot.profile?.recast && dot.profile.recast.speedType !== "cast-speed")),
    attackRate: hits.some((hit) => hit.rate?.speedType === "attack-speed"),
    channeled: beam || hits.some((hit) => /^channel/.test(hit.rate?.useModel || "")) || dots.some((dot) => dot.profile?.channeled),
    affliction: planner.conditions?.affliction !== false,
    aura: (planner.aura?.entries || []).some((entry) => active.has(entry.name))
  };
}

// build-mechanics marks the lines it put on the beam hit ledger and the Ignite / DoT ledger ("… (hits and damage over
// time)", "Counted by the talent totals (…)"). Those ledgers only reach the dummy through the beam and the DoT engines;
// in a build with neither (a Minion or attack-only build) the note says nothing about dummy damage (talent batch T7).
function recognizedOnIdleLedger(note, planner, text = "") {
  const engines = plannerEngines(planner);
  if (!engines) return false;
  if (/^Counted by the (?:talent|slate|pact|equipment|hero memory) /i.test(note)) return !engines.beam && !engines.anyDot;
  const route = note.match(/\((hits|hits and damage over time|hits and Ignite|damage over time|Ignite)\)$/);
  if (!route) return false;
  const hits = /hits/.test(route[1]) && engines.beam;
  const types = classifyDamageLine(text)?.damageTypes;
  const typedDot = engines.anyDot && (!types || [...types].some((type) => engines.dotTypes.has(type)));
  const dot = /damage over time/.test(route[1]) ? typedDot : /Ignite/.test(route[1]) ? engines.ignite : false;
  return !hits && !dot;
}

/**
 * Intelligence lines ("+X Intelligence", "+X to All Stats", "+X% Intelligence"): In calc where a ledger takes the
 * Intelligence main-stat line (the beam / Ignite ledgers, a skill hit whose main stat is Intelligence); a stat-sheet line
 * otherwise (gear-pact batch chunk 2: "+20 to All Stats" read In calc on attack and Minion builds).
 */
export function intelligenceLineStatus(planner = context, stats = ["Intelligence"]) {
  if (!planner?.activation) return "In calc";
  return plannerContributions(planner).some((entry) => stats.some((stat) => new RegExp(`Total ${stat}|${stat} main stat|Main stats[^(]*\\([^)]*${stat}`, "i").test(`${entry.source} ${entry.text}`)) && entry.value) ? "In calc" : "Counted in stats";
}

/** "+X Strength / Dexterity" (and "% Strength / Dexterity"): main-stat damage where a modeled skill has that main stat (chunk 3). */
export function mainStatLineStatus(text, planner = context) {
  // Legendary audit 2026-10-22: two- and three-attribute lines ("+15 Dexterity and Intelligence", "+25 Strength and Dexterity") and
  // "+N to All Stats" take the same checks (they moved builds while they read Counted in stats). A lone Intelligence line keeps
  // its own reader (intelligenceLineStatus via the caller).
  const match = String(text).match(/^[+-][\d.]+%? ((?:Strength|Dexterity|Intelligence)(?:(?:,? and |, )(?:Strength|Dexterity|Intelligence))*)$|^[+-][\d.]+ to All Stats$/i);
  const named = match?.[1] ? match[1].split(/,? and |, /).map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()) : null;
  if (!match || (named && named.length === 1 && named[0] === "Intelligence")) return null;
  // Without a build (no coverage context) Strength / Dexterity keep their stat-sheet reading.
  if (named && !planner?.activation) return null;
  const stats = named || ["Intelligence", "Strength", "Dexterity"];
  // Gear affix audit 2026-10-22 ("+7% Dexterity" moved the Erika build while it read Counted in stats): a modeled skill hit whose
  // main-stat bonus holds the stat (src/skill-hit-model.js mainStatParts), or a "per N <Stat>" line of the build, reads it too.
  if (planner?.activation) {
    if ((planner.skillHits || []).some((hit) => hit.modeled && (hit.mainStatParts || []).some((part) => stats.includes(part.stat) && part.value))) return "In calc";
    if ((planner.modifierTexts || []).some((line) => stats.some((stat) => new RegExp(`(?:per|for every) \\d+ ${stat}\\b`, "i").test(String(line.text ?? ""))))) return "In calc";
  }
  return intelligenceLineStatus(planner, stats);
}

// An enemy damage-taken line ("+X% additional <Type> Damage taken", "+X% damage taken"): the skill-hit engine reads it by type
// or skill tag, the ailment / skill-DoT engines read typed ones; "Hit Damage taken" (Timid) reaches every hit, the beam
// included (src/planner.js pushes it on the beam hit ledger), and no DoT.
function takenBodyStatus(body, planner, engines = plannerEngines(planner)) {
  if (!engines) return "In calc";
  const typed = body.match(/(Physical|Fire|Cold|Lightning|Erosion|Spell|Hit) Damage taken$/i)?.[1];
  // Minion hits are hits too: a derived "Hit Damage taken" line (a curse's) reaches them (src/minion-damage-model.js takenLines).
  if (typed && /^Hit$/i.test(typed)) return engines.anyHit || (planner?.minions || []).some((minion) => minion.modeled) ? "In calc" : "Inactive";
  // "Hit <Type> Damage taken" (Open Wounds' derived body; core audit B4): skill hits with a part of that type (converted parts keep
  // their original type) and Minion hits of that type; never a DoT, and the beam ledger does not read it.
  const hitTyped = body.match(/\bHit (Physical|Fire|Cold|Lightning|Erosion) Damage taken$/i)?.[1];
  if (hitTyped) {
    const type = hitTyped[0].toUpperCase() + hitTyped.slice(1).toLowerCase();
    const skillHit = engines.hits.some((hit) => [...(hit.dealtTypes || [hit.damageType]), ...(hit.components || []).flatMap((component) => [component.type, component.originalType])].includes(type));
    const minionHit = (planner?.minions || []).some((minion) => minion.modeled && (minion.skills || []).some((skill) => [skill.type, skill.baseType].includes(type)));
    return skillHit || minionHit ? "In calc" : "Inactive";
  }
  // Untyped "additional damage taken" (an enemy debuff: build-mechanics puts it on the beam and DoT layers too).
  // (Paralysis's "+X% damage taken" too: build-mechanics reads both wordings since the pact scripted-effects batch.)
  if (!typed && /(?:additional )?damage taken$/i.test(body)) return engines.anyHit || engines.anyDot || (planner?.minions || []).some((minion) => minion.modeled) ? "In calc" : "Inactive";
  // Every damage component of the hit counts (added Lightning on an Erosion spell takes Lightning Damage taken).
  const hitTypes = (hit) => new Set([...(hit.dealtTypes || [hit.damageType]), ...(hit.components || []).flatMap((component) => [component.type, component.originalType])].filter(Boolean));
  const hitReads = engines.hits.some((hit) => !typed || (typed === "Spell" ? (planner.activation?.setups?.find((setup) => setup.setupKey === hit.setupKey)?.tags || []).includes("Spell") : hitTypes(hit).has(typed)));
  const dotReads = typed && engines.dotTypes.has(typed);
  // "Spell Damage taken" (Frail, the follower's Lightning Beam) never reads on a DoT: dotTypes holds damage types only, so a
  // DoT-only build reads Inactive (2026-10-18 user-supplied: Spell Damage taken is hit-only; not DoT, ailments or Reaps).
  // The beam (a Fire Spell) reads Spell Damage taken (Frail) and, with its Ignite, Fire Damage taken (Melting Flames; pact
  // scripted-effects batch 2026-10-13) through build-mechanics.
  const beamReads = /^(?:Spell|Fire)$/i.test(typed || "") && engines.beam;
  // Modeled Minions take enemy damage-taken lines of their hits' types (src/minion-damage-model.js; tag scopes are not read).
  const minionReads = !/^(?:Spell|Hit)$/i.test(typed || "") && (planner?.minions || []).some((minion) => minion.modeled && (!typed || (minion.skills || []).some((skill) => [skill.type, skill.baseType].includes(typed))));
  return hitReads || dotReads || beamReads || minionReads ? "In calc" : "Inactive";
}

/** Daze: In calc while the Blur model applies it and the dummy carries an ailment; Inactive otherwise. */
// True when a "±X% Skill Effect Duration" (kind "duration") or "±X% Cooldown Recovery Speed" (kind "cooldown") line changes
// Aim's derived uptime (src/aim-model.js): removing it when the build carries it, adding it when it is a preview.
function aimLineMoves(value, kind, planner) {
  const aim = planner?.aim;
  if (!aim?.active || aim.uptimeSource !== "derived" || !Number.isFinite(value) || !(aim.durationSeconds > 0) || !(aim.cooldownSeconds > 0)) return false;
  const sum = (list) => (list || []).filter((entry) => entry.kind === "increased").reduce((total, entry) => total + entry.value, 0);
  const duration = sum(aim.durationSources), recovery = sum(aim.cooldownSources);
  const baseDuration = aim.durationSeconds / Math.max(1e-9, 1 + duration / 100), baseCooldown = aim.cooldownSeconds * (1 + recovery / 100);
  const uptime = (d, c) => Math.min(100, baseDuration * Math.max(0, 1 + d / 100) / Math.max(baseCooldown / Math.max(1e-9, 1 + c / 100), aim.trigger?.everySeconds || 0) * 100);
  const text = `${value >= 0 ? "+" : ""}${value}% ${kind === "duration" ? "Skill Effect Duration" : "Cooldown Recovery Speed"}`;
  const carried = (planner.modifierTexts || []).some((line) => normalizePercentageText(String(line.text ?? "")).trim() === text);
  const delta = carried ? -value : value;
  const now = uptime(duration, recovery);
  return Math.abs((kind === "duration" ? uptime(duration + delta, recovery) : uptime(duration, recovery + delta)) - now) > 1e-9;
}

/**
 * Badge of a core clause the planner applies by the core's name (src/granted-core-lines.js NAME_READ_CORE_CLAUSES) when the
 * core comes from a Pedigree of Gods slate or a "[Core]" gear grant (core audit batch B1): the core tooltip's rule
 * (src/app.js .core-talent). Subtle Impact needs Blur active; the others read In calc like the panel's name-modeled cores.
 */
export function nameReadCoreStatus(name, planner = context) {
  if (name === "Subtle Impact" && planner?.conditions && !planner.conditions.blur) return (planner.blurSources || []).some((source) => source.available) ? "Inactive" : "Missing Blur source";
  return "In calc";
}

export function dazeStatus(planner = context) {
  if (!planner?.blurEffects) return "In calc";
  const engines = plannerEngines(planner);
  return planner.blurEffects.damageSources.some((line) => line.source === "Daze · Blur active") && (!engines || engines.ignite || engines.otherAilment) ? "In calc" : "Inactive";
}

/** Status of a parsed key's route (src/talent-text-effects.js) in this build, or null when the engine layer decides. */
export function routeStatus(route, key, planner = context) {
  if (route === "defense") return "Counted in stats";
  if (route === "utility" || !route) return null;
  const engines = plannerEngines(planner);
  if (!engines) return "In calc";
  const on = (ok, off = "Inactive") => ok ? "In calc" : off;
  switch (route) {
    case "hit": return on(engines.anyHit);
    case "dot": return on(engines.anyDot);
    case "damage": return on(engines.anyHit || engines.anyDot);
    // Base Ignite starts an Ignite where a skill can inflict it with chance; the other Ignite keys need one.
    case "ignite": return on(key === "baseIgniteDamage" ? engines.igniteChance : /^igniteChance/.test(key) ? engines.baseIgnite && engines.igniteAppliers : engines.ignite);
    case "ailment": return on(engines.ignite || engines.otherAilment);
    case "affliction": return on(engines.anyDot && (key === "afflictionPerSecond" || engines.affliction));
    case "reaping": return on(engines.anyDot && engines.reaping);
    case "castSpeed": return on(engines.castRate, "Counted in stats");
    case "attackAndCastSpeed": return on(engines.castRate || engines.attackRate, "Counted in stats");
    case "channeledSpeed": return on(engines.channeled, "Counted in stats");
    case "crit": return on(engines.anyHit, "Counted in stats");
    case "spellCrit": return on(engines.spellHit, "Counted in stats");
    case "aura": return on(engines.aura);
    default: return null;
  }
}

// ---- Lines the planner's own outputs show it applied ---------------------------------------
// A tooltip line is "In calc" when the build's flattened modifier list (planner.modifierTexts)
// holds it and a ledger entry the calculation used (src/skill-coverage.js contributions) carries
// it: the same text, or the same value from a source named after the line's source (e.g. core
// "Goddess of Deception core: Subtle Impact" → ledger "Core talent: Subtle Impact"), or an
// aggregate row for the line's origin ("Pacts: additional Damage") that includes its value.
const round2 = (value) => Math.round(value * 100) / 100;
const AGGREGATE_SOURCE = { pact: /^Pacts?\b/i, gear: /^(?:Gear|Equipment)\b/i, talent: /^Talents?\b/i, slate: /^Slates?\b/i };
const modifierIndexCache = new WeakMap();
function modifierIndex(planner) {
  if (modifierIndexCache.has(planner)) return modifierIndexCache.get(planner);
  const index = new Map();
  for (const line of planner?.modifierTexts ?? []) {
    const key = normalizePercentageText(String(line?.text ?? "")).trim();
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(line);
  }
  modifierIndexCache.set(planner, index);
  return index;
}
// The last segment of a source ("Goddess of Deception core: Subtle Impact" → "Subtle Impact") names a talent or core, which
// ledgers cite by that name. For gear, kismets, pacts and memories the last segment can be a stat phrase ("Micro Fate: Fire
// Resistance"), which matched unrelated ledger rows of equal value (gear-pact batch G15): those need the full source name.
const NAMED_SEGMENT_ORIGINS = new Set(["talent", "core", "slate", "trait", "prism"]);
const sourceNames = (source, origin) => {
  const text = String(source ?? "");
  const names = NAMED_SEGMENT_ORIGINS.has(origin) ? [text, text.split(/: | · /).pop()] : [text];
  return [...new Set(names)].filter((name) => name.length >= 3);
};
const namesSource = (entrySource, name) => new RegExp(`(?<![\\w])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`).test(entrySource);
export function appliedByPlanner(text, planner = context) {
  if (!planner || typeof planner !== "object") return false;
  const lines = modifierIndex(planner).get(text);
  if (!lines?.length) return false;
  const entries = plannerContributions(planner);
  if (!entries.length) return false;
  const knownTexts = new Set(entries.filter((entry) => entry.text).map((entry) => `${entry.source}|${round2(entry.value)}`));
  const number = Number(text.match(/^[+-]?(\d+(?:\.\d+)?)%/)?.[1]);
  const additional = /\badditional\b/i.test(text);
  // Aggregate rows ("Pacts: additional Damage") only stand for plain "+X% [additional] damage" lines.
  const plainDamage = /^\+[\d.]+% (?:additional )?damage$/i.test(text);
  return lines.some((line) => {
    const value = Number.isFinite(number) ? number * (line.multiplier ?? 1) : NaN;
    const names = sourceNames(line.source, line.origin);
    const aggregate = AGGREGATE_SOURCE[line.origin];
    return entries.some((entry) => {
      if (entry.text && normalizePercentageText(entry.text).trim() === text) return true;
      if (!Number.isFinite(value) || !value) return false;
      // A core's own entry ("Core talent: Subtle Impact (Pedigree of Gods slate)") stands only for that core's clauses, not for
      // another clause of the same slate with the same number (core audit batch B1: a Pedigree's second core line read In calc).
      const entryCore = String(entry.source || "").match(/^Core talent: ([^(]+?) \(/)?.[1];
      if (entryCore && line.grantedCore !== entryCore) return false;
      // An entry that carries (or shares source and value with an entry carrying) a different
      // text is a different line from the same source.
      if (!entry.text && !knownTexts.has(`${entry.source}|${round2(entry.value)}`) && round2(entry.value) === round2(value) && names.some((name) => namesSource(entry.source, name))) return true;
      const entryAdditional = entry.bucket === "additional" || /additional/i.test(`${entry.category} ${entry.source}`);
      return plainDamage && Boolean(aggregate?.test(entry.source)) && entryAdditional === additional && /damage/i.test(`${entry.source} ${entry.category}`) && entry.value >= value - 1e-9;
    });
  });
}

// Slate copy rules ("Copies the last Talent on ...", Space Rift's "Copies the Medium Talents ..."): the copied talents are resolved into
// planner.resolvedSlates[].copiedAffixSources and applied like the slate's own affixes.
function copyRuleStatus(text, planner) {
  if (!/^Copies the (?:last Talent|Medium Talents)\b/i.test(text) || !Array.isArray(planner?.resolvedSlates)) return null;
  const slates = planner.resolvedSlates.filter((slate) => normalizePercentageText(String(slate?.copyRule ?? "")).trim() === text || (slate?.fixed ?? []).some((affix) => normalizePercentageText(String(affix)).trim() === text));
  if (!slates.length) return null;
  return slates.some((slate) => slate.copiedAffixSources?.length) ? "In calc" : "Inactive";
}

function clauseStatus(text, planner, { allowGeneric = true } = {}) {
  if (!text) return null;
  // Legendary audit 2026-10-22 (src/legendary-line-status.js): the lines that audit brought into the calculation or settled.
  const legendary = legendaryLineStatus(text, planner, plannerEngines(planner));
  if (legendary) return legendary;
  // Revived memory lunar-phase lines (revived affix census 2026-10-21). Reactive Rainbow's offensive half needs the excess chance to
  // avoid Elemental Ailments and the Elemental Resistance Reversal debuff, which no model or source defines: Not modeled (its
  // defensive half stays a defence line).
  if (/chance to inflict Elemental Resistance Reversal on enemies/i.test(text)) return "Not modeled";
  // Radical Evolution Theory (src/origin-of-spirit-magus.js): In calc while the named Aura (or its Precise: version) is active and the
  // build has an Origin of Spirit Magus Effect bonus; otherwise Inactive.
  if (RADICAL_EVOLUTION.test(text) && planner?.activation) {
    const [item] = radicalEvolutionAuraEffects([{ text, source: "coverage", origin: "memory" }].concat((planner.modifierTexts || []).filter((line) => !RADICAL_EVOLUTION.test(normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim()))));
    const aura = item?.aura;
    const active = (planner.aura?.entries || []).some((entry) => planner.activation.activeNames?.has(entry.name) && (entry.name === aura || entry.name === `Precise: ${aura}`));
    return active && item.percent > 0 ? "In calc" : "Inactive";
  }
  // Escalating Affliction's reworked Affliction (core audit B4, src/combat-states.js): it scales Affliction, so it is In calc where a
  // modeled DoT (an ailment, a skill DoT or the beam's Ignite) runs with an Affliction rating on the dummy; otherwise Inactive.
  if (/^Changes the effect of each point of Affliction to: /i.test(text) && planner?.activation) {
    const rated = (entry) => entry && entry.modeled !== false && (entry.steps?.afflictionRating || 0) > 0 && (entry.combat?.steadyDps || 0) > 0;
    const ignite = (planner.recountFiveSeconds?.igniteDps || 0) > 0 && planner.conditions?.affliction !== false && (planner.afflictionRating ? planner.afflictionRating.rating > 0 : true);
    return (planner.skillDots || []).some(rated) || Object.values(planner.ailments || {}).some(rated) || ignite ? "In calc" : "Inactive";
  }
  // Cohesion's resolved body (core audit batch B3): its own multiplier on the rating in the spell and attack crit models, so In calc
  // where the build has a modeled player hit (the beam or a skill hit); a Minion-only build does not crit with it.
  if (/^\+[\d.]+% additional (?:Spell |Attack )?Critical Strike Rating$/i.test(text) && planner?.activation) return planner.activation.activeNames?.has("Scorching Beam") || (planner.skillHits || []).some((hit) => hit.modeled) ? "In calc" : "Inactive";
  // Ill Omen (src/ill-omen.js): Cumulative Efficiency and Reap Purification feed the best-case Ill Omen line of the dummy
  // figures and the "Ill Omen (beyond the dummy)" card when the build applies Ominous.
  const illOmen = illOmenLineStatus(text, planner);
  if (illOmen) return illOmen;
  // An item-granted Precise Aura ("You have a Lv. 20 Precise Cruelty.", Lone Walker's Boots; src/planner.js grantedAuraSetups):
  // In calc while that copy is in the Aura ledger; when the board's own copy has the larger effect, the grant adds nothing.
  const auraGrant = grantedPreciseAuras([{ text }])[0];
  if (auraGrant && planner?.aura) {
    // A Full Mana grant (legendary audit batch 2; src/planner.js conditionalAuraGrants) whose condition does not hold: Inactive.
    const conditional = auraGrant.condition ? (planner.aura.conditionalGrants || []).find((item) => item.name === auraGrant.name && item.condition === auraGrant.condition) : null;
    if (conditional && !conditional.active) return "Inactive";
    const choice = (planner.aura.grantedChoices || []).find((item) => item.name === auraGrant.name);
    // An Aura whose buff is movement or recovery only (Precise: Swiftness "20.5% Movement Speed", unless an added effect such as
    // Pantheon's Elegy's Attack and Cast Speed joins it) changes no dummy damage (gear affix audit 2026-10-22: Vorax boots).
    const effects = Object.entries((planner.aura.entries || []).find((entry) => entry.name === auraGrant.name)?.effectiveEffects || {}).filter(([, value]) => value);
    if (choice?.kept === "granted" && effects.length && effects.every(([key]) => /movement|regenerat|restor/i.test(key))) return "No DPS effect";
    if (choice) return choice.kept === "granted" ? "In calc" : "No DPS effect";
    return tlidbSkillCatalogSs13.some((entry) => entry.name === auraGrant.name && (entry.tags || []).includes("Aura")) ? "In calc" : "Not modeled";
  }
  // A row the gear intake splits for any item (src/gear-unique-modules.js, round 2: multi-type added damage, Magnus' Scar's two
  // sentences) is judged as the lines it becomes.
  // (Hare's Agility's per-stack clause is one resolver line, src/line-conditions.js exitStandStillStacks, not two sentences.)
  const parts = /^\+[\d.]+% additional damage dealt to enemies in proximity for each stack of buff\. /i.test(text) ? [text] : expandScriptedItemLine("", text);
  if (parts.length > 1) {
    const statuses = parts.map((part) => engineLineStatus(part, planner) ?? "Not modeled");
    // One type the build cannot use (Physical added to Spells on the beam) does not make the row partly modeled.
    if (statuses.includes("In calc") && statuses.every((status) => status === "In calc" || status === "Inactive" || neutralStatuses.has(status))) return "In calc";
    return combineStatuses(statuses);
  }
  // Skill-tag-gated ailment lines ("+X% additional Ailment Damage dealt by attacks", Great Strength): In calc where an ailment
  // with a base is inflicted by a skill carrying the tag (src/ailment-applications.js re-gates the line per inflicting skill).
  const tagGatedAilment = planner?.activation ? classifyDamageLine(text) : null;
  if (tagGatedAilment?.requiresSkillTag) {
    const tag = tagGatedAilment.requiresSkillTag.toLowerCase();
    const inflicts = ["ignite", "trauma", "wilt"].some((key) => {
      const ailment = planner.ailments?.[key];
      const based = key === "ignite" ? ailment?.base?.max > 0 || planner.theoretical?.totals?.baseIgniteDamage?.max > 0 : ailment?.base?.max > 0;
      return based && (ailment?.appliers || []).some((applier) => !applier.blocked && (applier.tags || []).some((item) => String(item).toLowerCase() === tag));
    }) || (planner.theoretical?.totals?.baseIgniteDamage?.max > 0 && (planner.mainSkill?.tags || []).some((item) => String(item).toLowerCase() === tag));
    return inflicts ? "In calc" : "Inactive";
  }
  const note = planner?.mechanics?.recognized?.get?.(text);
  if (note && !recognizedOnIdleLedger(note, planner, text)) {
    if (note === "Curse limit reached" || note.startsWith("Inactive")) return "Inactive";
    // build-mechanics notes that say why a recognized line changes nothing (gear-pact batch G5 / G6).
    if (note.startsWith("Not modeled")) return "Not modeled";
    // An item-granted support (src/gear-unique-modules.js) reads as that support on the Main Skill (skill coverage).
    // "All Passive Skill slots are supported by …" (gear affix batch C): the support's status on the Aura-slot setups that take it.
    const passiveGranted = note.match(/^Granted support: (.+?) Lv\.\d+ on (?:every Passive Skill slot|the (?:first|last) \d+ Passive Skill slots)/);
    if (passiveGranted) return passiveGrantStatus(planner, passiveGranted[1]);
    // "Demolisher Skills are supported by …" (legendary audit batch 2): the support's status on the active setups with the tag.
    const tagGranted = note.match(/^Granted support: (.+?) Lv\.\d+ on every (\w+) Skill /);
    if (tagGranted) {
      const users = (planner?.activation?.setups || []).filter((setup) => setup.enabled !== false && planner.activation.activeNames?.has(setup.name) && (setup.tags || []).includes(tagGranted[2]));
      if (!users.length) return "Inactive";
      const statuses = users.map((setup) => grantedSupportStatus(setup.supportEffects, tagGranted[1]));
      return statuses.includes("In calc") ? "In calc" : statuses[0];
    }
    const granted = note.match(/^Granted support: (.+?) Lv\.\d+ on the Main Skill/);
    if (granted && planner?.mainSkill) {
      const main = planner.activation?.setups?.find((setup) => setup.name === planner.mainSkill.name);
      if (main?.supportEffects && grantedSupportStatus(main.supportEffects, granted[1]) === "Not modeled") return "Not modeled";
      const status = classifySkillCoverage(planner, { skillName: planner.mainSkill.name, supportName: granted[1] }).status;
      return status === "Not installed" ? "Inactive" : status;
    }
    // Main-stat removal (Magnus' Jealousy): it changes damage only where a main-stat bonus existed (chunk 4).
    if (note.startsWith("Main-stat bonus removed")) { const stats = planner?.lineEffects?.state?.stats || {}; return ["intelligence", "strength", "dexterity"].some((stat) => (stats[stat] || 0) !== 0) ? "In calc" : "Inactive"; }
    if (/Intelligence \(main-stat damage\)$/.test(note)) return mainStatLineStatus(text, planner) ?? intelligenceLineStatus(planner);
    if (note.startsWith("Not on dummy")) return "Not on dummy";
    if (note.startsWith("No DPS effect")) return "No DPS effect";
    // Redundant stacks (residual batch §7 cosmetic): with own buffs pre-built the channel is held full, so a higher Max only
    // matters through a per-stack line (Supercharge, "per additional Max Channeled Stack"); without one it changes nothing.
    if (note === "Max channeled stacks" && planner?.conditions?.prebuiltSelfBuffs !== false && plannerEngines(planner)?.beam) {
      const perStack = (planner.mechanics?.channel?.perStackSupercharge || 0) > 0 || (planner.modifierTexts || []).some((line) => /for every \+1 additional Max Channeled Stack|per channeled stack|every channeled stack|excess stacks? of Min Channeled Stacks/i.test(String(line.text)));
      if (!perStack) return "No DPS effect";
    }
    // A typed damage-taken curse (src/curse-effects.js): In calc where a hit or DoT of its type reads the derived line.
    const curseBody = note.match(/ curse → (.+? Damage taken)/)?.[1];
    if (curseBody) return takenBodyStatus(curseBody, planner);
    return "In calc";
  }
  // Residual (C) wordings that cannot change dummy damage (src/line-families.js RESIDUAL_C_RULES).
  const residual = residualNonDamageStatus(text);
  if (residual) return residual.status;
  // "Precise: X gains an additional base effect: …" acts only while the Precise: X aura is active (residual batch P10: it read
  // In calc without Fearless, judged by its stripped body). No reader adds the effect to the aura yet: Not modeled when active.
  const precise = text.match(/^(Precise: [\w' ]+?) gains an additional base effect: (.+)$/i);
  if (precise && planner?.activation) return planner.activation.activeNames?.has(precise[1]) ? "Not modeled" : "Inactive";
  // "… while Blur is active" (Subtle Impact and others): the badge follows the Blur model (P10: In calc without Blur). Daze has
  // its own rule below.
  if (/ while Blur is active$/i.test(text) && !/Ailment Damage while Blur is active$/i.test(text) && planner?.blurEffects && !planner.blurEffects.active) return "Inactive";
  // "Reaping removes enemy's Affliction" sits on the full-Affliction Reap item (Torturer's Touch): src/reaping-sources.js gives that
  // Reap its Affliction reset and src/affliction-rating.js models it, so it is In calc wherever a DoT is reaped (P9).
  if (/^Reaping removes (?:enemy's Affliction|[\d.]+% Affliction from enemies)$/i.test(text) && planner?.activation) return plannerEngines(planner)?.anyDot ? "In calc" : "Inactive";
  // Lines whose reader only decides for carried lines (item triggers, item-granted supports, channel stacks): an uncarried
  // preview (crafting, legendary pages, the census) reads what the reader would say once equipped (residual batch P8).
  const preview = uncarriedPreviewStatus(text, planner);
  if (preview) return preview;
  // Double Damage chance (src/double-damage.js): In calc where a modeled hit has the line's scope tags (the beam is marked
  // by build-mechanics above), Inactive otherwise; a per-stat line needs the stat.
  const doubleDamage = classifyDoubleDamageLine(text);
  if (doubleDamage && planner?.activation) {
    const carriedSlots = (planner.modifierTexts || []).filter((line) => normalizePercentageText(String(line.text ?? "")).trim() === text).map((line) => line.slot);
    if (doubleDamage.slot && carriedSlots.length && !carriedSlots.includes(doubleDamage.slot)) return "Inactive";
    const statOk = !doubleDamage.perStat || (planner.lineEffects?.state?.stats?.[doubleDamage.stat] || 0) >= doubleDamage.per;
    const tagsOf = (key) => new Set(planner.activation.setups?.find((setup) => setup.setupKey === key)?.tags || []);
    // The beam takes every Double Damage line its tags (plus Channeled) allow (src/build-mechanics.js, src/planner.js), carried
    // or not (residual batch P2: an uncarried line read Inactive on Scorching Beam builds).
    const beam = planner.activation.activeNames?.has("Scorching Beam") ? planner.activation.setups?.find((setup) => setup.name === "Scorching Beam") : null;
    const beamTags = new Set([...(beam?.tags || []), "Channeled"]);
    const beamTakes = Boolean(beam) && doubleDamage.tags.every((tag) => beamTags.has(tag));
    return statOk && (beamTakes || (planner.skillHits || []).some((hit) => hit.modeled && doubleDamage.tags.every((tag) => tagsOf(hit.setupKey).has(tag)))) ? "In calc" : "Inactive";
  }
  // Build-wide "Cannot inflict X" (src/ailment-blocks.js): In calc where the build inflicts X (it removes it), No DPS effect
  // where it does not (nothing to remove). A carried line is judged against the planner's state before the block.
  const blocked = blockedAilmentsOf(text);
  if (blocked.length && planner?.activation) {
    const carried = (planner.modifierTexts || []).some((line) => normalizePercentageText(String(line.text ?? "")).trim() === text);
    const engines = plannerEngines(planner);
    const present = (name) => (planner.lineEffects?.state?.enemyAilments || []).includes(name) || (name === "Ignite" && (engines?.ignite || engines?.igniteChance)) || (name !== "Ignite" && planner.ailments?.[name.toLowerCase()]?.base?.max > 0);
    return carried || blocked.some(present) ? "In calc" : "No DPS effect";
  }
  // Plain "±X% Skill Effect Duration" / "±X% Cooldown Recovery Speed": Aim reads both (src/aim-model.js: its duration, and the
  // recast at cooldown end), so they are In calc where they change Aim's derived uptime; otherwise the other readers decide
  // (Activation Medium / Wind Rhythm cadence) or the stat sheet counts them (survey 2026-10-13 §4.1: Counted in stats on Selena
  // while they moved the dummy figure).
  const aimTiming = normalizePercentageText(text).match(/^([+-][\d.]+)% (Skill Effect Duration|Cooldown Recovery Speed)$/i);
  if (aimTiming && aimLineMoves(Number(aimTiming[1]), /Duration/i.test(aimTiming[2]) ? "duration" : "cooldown", planner)) return "In calc";
  // Youga – The Ultimate One (src/youga-ultimate-one.js): the Clockwork Core's share of Cooldown Recovery Speed and Skill Effect
  // Duration, and the trait skills' durations and cooldowns, read both pools (hero trait audit B1, F6: I Meet the Selves's
  // Skill Effect Duration moved the dummy figure while it badged Counted in stats).
  const youga = planner?.yougaUltimateOne;
  if (aimTiming && youga?.active && (youga.coreShare?.valuePercent > 0 || youga.traitSkills?.vault || youga.traitSkills?.selves)) return "In calc";
  // "+X% Aiming Skill Duration" (src/aim-model.js; Aim read as the Aiming Skill, provisional): In calc while Aim is active.
  if (/^[+-][\d.]+% Aiming Skill Duration\.?$/i.test(text) && planner?.activation) return planner.activation.activeNames?.has("Aim") ? "In calc" : "Inactive";
  // "+N to [Non-Base] Hero Trait Level" (src/character-stats.js heroTraitLevelBonus; on a memory, only the trait in that
  // memory's slot, user-observed 2026-10-13): raises the trait levels (max 5), so their per-level values; In calc with a hero
  // selected.
  // Hero trait audit B1 (2026-10-19): "+N to Non-Base Hero Trait Level" with no 45 / 60 / 75 trait picked raises nothing
  // (Inactive; before, In calc). Bing - Creative Genius's moon line also opens the sixth rank (Q-H2).
  if (/^\+\d+ to (?:Non-Base )?Hero Trait Level$/i.test(text) && planner?.state?.hero) {
    const hero = planner.state.hero;
    const picked = Object.values(hero.selectedTraits || {}).some(Boolean) || (hero.treeTraits?.[hero.selectedHeroId] || []).some(Boolean);
    return hero.selectedHeroId && (picked || !/Non-Base/i.test(text)) ? "In calc" : "Inactive";
  }
  // Terra Charge Recovery / Restoration Speed (src/selena-dance.js resolveTerraCharges): sets the charge interval, so the charges
  // a Main Terra cast consumes; In calc while the Main Terra Skill is active, Inactive otherwise. "+X% Terra Skill Duration"
  // lengthens The Cycle I Resist's T (src/selena-dance.js resolveCycleResist): In calc while that Reap is active. Both read
  // "Not modeled" before (Kismet: Growth Ring; pact badge audit 2026-10-13).
  if (/^[+-]?[\d.]+% Terra Charge (?:Recovery|Restoration) Speed$/i.test(text) && planner?.danceOfTheDeep) return planner.danceOfTheDeep.mainIsTerra ? "In calc" : "Inactive";
  // Kingly Armor's "set to N% of the default value" replaces those lines (src/selena-dance.js RECOVERY_SET).
  if (/^Terra Charge ?'s Restoration Speed is set to [\d.]+ ?% of the default value$/i.test(text) && planner?.danceOfTheDeep) return planner.danceOfTheDeep.mainIsTerra ? "In calc" : "Inactive";
  if (/^\+[\d.]+% Terra Skill Duration$/i.test(text) && planner?.cycleResist?.active) return "In calc";
  // Focus Blessing's changed base effect (src/blessing-model.js baseChange): In calc where Focus stacks are held and a modeled
  // skill hit takes the added Physical; Partly modeled on the beam (it loses Focus's +5% per stack, but its added-damage reader
  // takes Fire / Cold / Lightning only); Inactive without Focus stacks.
  const focusChange = text.match(/^Changes the base effect of (Tenacity|Focus|Agility) Blessing to: Adds Physical Damage equal to [\d.]+% of Max Mana to Attacks and Spells$/i);
  if (focusChange && planner?.blessings?.entries) {
    const held = planner.blessings.entries.find((entry) => entry.name.toLowerCase() === focusChange[1].toLowerCase())?.stacks > 0;
    if (!held) return "Inactive";
    return (planner.skillHits || []).some((hit) => hit.modeled) ? "In calc" : plannerEngines(planner)?.beam ? "Partly modeled" : "Inactive";
  }
  // Crit-only additional damage (src/crit-only-lines.js): the beam's crit branch and every modeled hit's crit share.
  const critOnly = classifyCritOnlyLine(text);
  if (critOnly && planner?.activation) {
    const tagsOf = (key) => new Set(planner.activation.setups?.find((setup) => setup.setupKey === key)?.tags || []);
    const beam = planner.activation.activeNames?.has("Scorching Beam") ? planner.activation.setups?.find((setup) => setup.name === "Scorching Beam") : null;
    const reaches = (tags) => !critOnly.tag || tags.has(critOnly.tag);
    return (beam && reaches(new Set(beam.tags || []))) || (planner.skillHits || []).some((hit) => hit.modeled && hit.crit?.chancePercent > 0 && reaches(tagsOf(hit.setupKey))) ? "In calc" : "Inactive";
  }
  // Tag-scoped crit rating / damage (src/scorching-beam-critical.js classifyTaggedCritLine): In calc where a modeled hit (or the
  // beam) carries every tag of the scope, Inactive otherwise.
  const taggedCrit = classifyTaggedCritLine(text);
  if (taggedCrit && planner?.activation) {
    const tagsOf = (key) => new Set(planner.activation.setups?.find((setup) => setup.setupKey === key)?.tags || []);
    const beam = planner.activation.activeNames?.has("Scorching Beam") ? planner.activation.setups?.find((setup) => setup.name === "Scorching Beam") : null;
    const reaches = (tags) => taggedCrit.tags.every((tag) => tags.has(tag));
    return (beam && reaches(new Set(beam.tags || []))) || (planner.skillHits || []).some((hit) => hit.modeled && reaches(tagsOf(hit.setupKey))) ? "In calc" : "Inactive";
  }
  // Strength / Dexterity / All Stats: main-stat damage where a modeled skill has that main stat (chunk 3).
  const mainStat = mainStatLineStatus(text, planner);
  if (mainStat) return mainStat;
  // Passive conversion / added-as / Multistrike / Projectile Quantity (src/passive-support-lines.js, gear-pact batch chunk 2):
  // In calc where a modeled hit uses it (a component of the source type, an attack that Multistrikes, a skill whose
  // projectiles can hit the same enemy), Inactive otherwise.
  // Youga / Homing Frost Bolt audit (2026-10-18; research/youga-homing-frost-bolt-audit-2026-10-18.md): badges that read
  // Not modeled or No DPS effect while the planner applied them (or could not apply them for a reason it knows).
  if (planner?.activation) {
    const clean = (value) => normalizePercentageText(String(value ?? "")).replace(/\s+/g, " ").trim();
    // Gale-type conversion (src/skill-hit-model.js projectileSpeedState) and the "+X% Projectile Speed" lines it converts.
    const speedHits = (planner.skillHits || []).filter((hit) => hit.modeled && hit.projectileSpeed?.lines?.length);
    if (/^\d+(?:\.\d+)?% of the Projectile Speed bonus is also applied to (?:the additional bonus for )?Projectile Damage$/i.test(text)) return speedHits.length ? "In calc" : "Inactive";
    if (/^[+-]?\d+(?:\.\d+)?% Projectile Speed$/i.test(text) && speedHits.some((hit) => hit.projectileSpeed.sources.some((line) => clean(line.text) === text))) return "In calc";
    // "Inflicts <Ailment> when dealing Hit <Type> Damage" (Prophet; src/enemy-ailments.js reads it): the dummy carries the ailment
    // when a skill dealing that hit type is active.
    const inflicts = text.match(/^Inflicts (Frostbite|Numbed|Freeze|Ignite|Trauma|Wilt) when dealing Hit (?:Physical|Fire|Cold|Lightning|Erosion) Damage$/i);
    if (inflicts && planner.mechanics?.enemyAilments) {
      const name = inflicts[1].toLowerCase() === "freeze" ? "frozen" : inflicts[1].toLowerCase();
      return (planner.mechanics.enemyAilments.types || []).some((type) => String(type?.name ?? type).toLowerCase() === name) ? "In calc" : "Inactive";
    }
    // "You can only deal <Type> Damage" (Extreme Coldness; core audit batch B5, src/damage-type-restriction.js): In calc where the
    // planner removed a part of another type (a hit part, the beam, an ailment or a skill DoT); No DPS effect when every modeled
    // source already deals only that type. Player only (game affix 232826, target 1): Minions, followers and True Damage are not affected (user-confirmed 2026-10-19).
    if (ONLY_DAMAGE_TYPE_LINE.test(text) && planner.damageTypeRestriction !== undefined) return planner.damageTypeRestriction?.removed?.length ? "In calc" : "No DPS effect";
    // Towering Presence (core audit batch B5, src/towering-presence.js): the main-hand weapon's damage reaches modeled Spell skill
    // hits (not attacks, not the Scorching Beam ledger, which has no added Physical part: Not modeled there); its crit rating reaches
    // every Spell skill's crit (the beam's included). Inactive without a main-hand weapon or a Spell hit.
    if (planner.weaponToSpells !== undefined && (WEAPON_TO_SPELLS_LINE.test(text) || WEAPON_CRIT_TO_SPELLS_LINE.test(text))) {
      const spellHit = (planner.skillHits || []).some((hit) => hit.modeled && !hit.profile?.weaponScaling && (hit.profile?.tags || []).includes("Spell"));
      const beam = Boolean(planner.activation.activeNames?.has("Scorching Beam"));
      if (WEAPON_TO_SPELLS_LINE.test(text)) return planner.weaponToSpells?.damage?.length && spellHit ? "In calc" : planner.weaponToSpells?.damage?.length && beam ? "Not modeled" : "Inactive";
      return planner.weaponToSpells?.critRating > 0 && (spellHit || beam) ? "In calc" : "Inactive";
    }
    // "+N to Parabolic Projectile Splits quantity" (Three Birds with One Stone): needs a Parabolic Projectile skill on the board.
    // The splits land as area explosions that can hit the same single target (user-supplied 2026-10-19, Google AI Mode answer,
    // not tested in game; open question core-three-birds-splits): In calc where a modeled hit carries split components (the
    // profile's `parabolicSplit`, src/skill-hit-model.js). Thunderbolt Overload's own "+30% additional damage for each
    // additional Split" above 3 needs its base Split count, which is not in the data: Not modeled there, and on any parabolic
    // skill whose profile names no landing component.
    // "Max Terra Charge Stacks +N" (gear affix audit 2026-10-22: read Not modeled while it moved Flame Jet): a Terra skill consumes up to
    // its Max Terra Charge Stacks per cast (src/selena-dance.js resolveTerraCharges). In calc where a modeled Terra hit or DoT carries a
    // Terra Charge bonus, Inactive without one.
    if (/^(?:\+\d+ Max Terra Charge Stacks?|Max Terra Charge Stacks? \+\d+)$/i.test(text)) {
      const terra = (planner.skillHits || []).some((hit) => hit.modeled && hit.profile?.terraCharge) || (planner.skillDots || []).some((dot) => dot.profile?.terraCharge || dot.terraCharge);
      return terra ? "In calc" : "Inactive";
    }
    if (/^\+\d+ (?:to )?Parabolic Projectile Splits? quantity$/i.test(text)) {
      const active = planner.activation.activeNames || new Set();
      const parabolic = (planner.activation.setups || []).filter((setup) => setup.enabled !== false && active.has(setup.name) && (setup.tags || []).includes("Parabolic"));
      if (!parabolic.length) return "Inactive";
      const split = (planner.skillHits || []).some((hit) => hit.modeled && (hit.components || []).some((component) => component.parabolicSplit));
      return split ? (parabolic.some((setup) => setup.name === "Thunderbolt Overload") ? "Partly modeled" : "In calc") : "Not modeled";
    }
    // Core audit batch B6 (src/skill-hit-model.js). "+N initial Multistrike Count" (Preemptive Strike): In calc where a modeled
    // attack Multistrikes with a damage increment (or a Finisher takes Unstoppable Force); a Multistrike without increment gains
    // nothing from the shifted counts.
    if (/^\+\d+ (?:to the )?initial Multistrike Count$/i.test(text)) {
      const multis = (planner.skillHits || []).filter((hit) => hit.modeled && hit.rate?.multistrike);
      if (!multis.length) return "Inactive";
      return multis.some((hit) => hit.rate.multistrike.effectiveIncrementPercent > 0) ? "In calc" : "No DPS effect";
    }
    // Unstoppable Force: In calc where a modeled Combo skill Multistrikes (its Finisher takes the Max Multistrike Count).
    if (UNSTOPPABLE_FORCE_LINE.test(text)) {
      const finishers = (planner.skillHits || []).filter((hit) => hit.modeled && hit.rate?.multistrike?.unstoppableForce);
      if (!finishers.length) return "Inactive";
      return finishers.some((hit) => Math.abs(hit.rate.multistrike.unstoppableForce.factor - 1) > 1e-12) ? "In calc" : "No DPS effect";
    }
    // Play Safe's Cast Speed → Spell Burst Charge Speed: In calc where a modeled Spell hit Spell Bursts with the converted share.
    if (CAST_SPEED_TO_CHARGE_LINE.test(text)) return (planner.skillHits || []).some((hit) => hit.modeled && hit.rate?.spellBurst?.chargeSpeed?.castSpeedShare?.length) ? "In calc" : "Inactive";
    // Spell Ripple: In calc where a modeled Main Spell hit spawns Pulses; Scorching Beam's own beam path does not read it yet.
    if (SPELL_RIPPLE_LINE.test(text)) {
      if ((planner.skillHits || []).some((hit) => hit.modeled && hit.spellRipple)) return "In calc";
      return planner.nativeHitCycle || planner.activation.activeNames?.has("Scorching Beam") ? "Not modeled" : "Inactive";
    }
    // Sweeping Fury (user-supplied 2026-10-19: one ring projectile per ring hits a single boss): In calc where a modeled Main
    // Horizontal Projectile hit casts rings; its Projectile Quantity cap is In calc where it cut a hit's extra projectiles, No
    // DPS effect on a projectile skill under the cap.
    if (SWEEPING_FURY_LINE.test(text)) return (planner.skillHits || []).some((hit) => hit.modeled && hit.sweepingFury) ? "In calc" : "Inactive";
    // "+X% chance to trigger the Main Spell Skill 1 additional time when using it" (src/skill-hit-model.js mainSpellRepeat; gear affix
    // audit 2026-10-22): In calc where the modeled Main Skill is a Spell it repeats, Inactive otherwise.
    if (MAIN_SPELL_REPEAT_LINE.test(text)) return (planner.skillHits || []).some((hit) => hit.modeled && hit.mainSpellRepeat?.usesPerSecond > 0) ? "In calc" : "Inactive";
    if (PROJECTILE_QUANTITY_LIMIT_LINE.test(text)) {
      const limited = (planner.skillHits || []).filter((hit) => hit.modeled && hit.projectileLimit);
      return limited.some((hit) => hit.projectileLimit.capped) ? "In calc" : limited.length ? "No DPS effect" : "Inactive";
    }
  }
  const passive = classifyPassiveSupportLine(text);
  if (passive && planner?.activation) {
    const hits = (planner.skillHits || []).filter((hit) => hit.modeled);
    const cap = (type) => type[0].toUpperCase() + type.slice(1).toLowerCase();
    // A carried conversion / added-as line shows in the hit's components ("(50% Physical → Fire)", "(20% of Fire as
    // Erosion)"); a line the build does not carry is judged by the source type being present.
    const carried = (planner.modifierTexts || []).some((line) => normalizePercentageText(String(line.text ?? "")).trim() === text);
    // "Adds X% Non-<Type> Damage as <Type> Damage" (Dual Kismet: Wraith; kismet / pact audit 2026-10-21) names every source type but one.
    const sourceTypes = passive.fromAllBut ? ["Physical", "Fire", "Cold", "Lightning", "Erosion"].filter((type) => type !== cap(passive.fromAllBut)) : passive.fromList ? passive.fromList.map(cap) : passive.from ? [cap(passive.from)] : [];
    const labelled = (hit) => (hit.components || []).some((component) => sourceTypes.some((from) => String(component.label || "").includes(passive.family === "conversion" ? `% ${from} → ${cap(passive.to)})` : `% of ${from} as ${cap(passive.to)})`)));
    // A converted share that takes exactly the modifiers its source type took (same increased / additional / taken /
    // resistance factors) changes nothing: "No DPS effect" (gear-pact batch chunk 3: Cold → Fire on the trauma build).
    if (passive.family === "conversion" && carried) {
      const unit = (component) => (component.increasedFactor ?? 1) * (component.additionalFactor ?? 1) * (component.takenFactor ?? 1) * (component.resistanceFactor ?? 1) * (component.armourFactor ?? 1);
      const marker = `% ${cap(passive.from)} → ${cap(passive.to)})`;
      const pairs = hits.flatMap((hit) => (hit.components || []).filter((component) => String(component.label || "").includes(marker)).map((part) => {
        const baseLabel = String(part.label).slice(0, String(part.label).lastIndexOf(" ("));
        const source = (hit.components || []).find((component) => component.label === baseLabel && component.type === cap(passive.from));
        return { part, source };
      }));
      if (pairs.length && pairs.every(({ part, source }) => source && Math.abs(unit(part) - unit(source)) <= 1e-9 * Math.max(1, unit(source)))) return "No DPS effect";
    }
    const used = passive.family === "multistrike" ? hits.some((hit) => hit.rate?.multistrike)
      // Steep Strike chance (2026-10-14; src/skill-hit-model.js steepStrikeState): a Slash-Strike hit whose share follows it, or
      // Thunder Slash's Multistrike increment per +1% chance.
      : passive.family === "steepStrike" ? hits.some((hit) => hit.steepStrike && (hit.steepStrike.fromChance || (hit.steepStrike.perChance && hit.rate?.multistrike)))
      : passive.family === "projectileQuantity" ? hits.some((hit) => hit.rate?.extraProjectiles)
      : carried ? hits.some(labelled)
      : hits.some((hit) => (hit.components || []).some((component) => sourceTypes.includes(component.type)));
    return used ? "In calc" : "Inactive";
  }
  // "+X% additional Steep Strike Damage" (2026-10-14; src/skill-hit-model.js, user-supplied reading: an independent multiplier on
  // Steep Strike hits only): In calc where a modeled hit lands Steep Strikes, Inactive otherwise.
  if (/^\+?[\d.]+% additional Steep Strike Damage\.?$/i.test(text) && planner?.activation) {
    return (planner.skillHits || []).some((hit) => hit.modeled && (hit.components || []).some((component) => /^Steep Strike/.test(component.label || "") && component.hitsPerUse > 0)) ? "In calc" : "Inactive";
  }
  // Highest Glance's "-60% additional Sweep Slash Damage; +120% additional Steep Strike Damage" (legendary audit 2026-10-22): each
  // part on its own component (src/skill-hit-model.js sweepDamageLines / steepDamageLines).
  if (/^[+-]?[\d.]+% additional Sweep Slash Damage(?:; ?\+?[\d.]+% additional Steep Strike Damage)?\.?$/i.test(text) && planner?.activation) {
    return (planner.skillHits || []).some((hit) => hit.modeled && (hit.components || []).some((component) => /^(?:Sweep Slash|Steep Strike)/.test(component.label || "") && component.hitsPerUse > 0)) ? "In calc" : "Inactive";
  }
  // Gear affix batch B (2026-10-22; src/skill-hit-model.js): Shadow Quantity / additional Shadow Damage (In calc where a modeled
  // Shadow Strike hit has Shadows), Barrage waves (a modeled Barrage hit with a waves part), Combo Points per Starter (a modeled
  // Combo cycle), "+X% additional skill damage when Demolisher Charge is consumed" (a modeled Demolisher skill) and the Terra
  // Charge gained on use (a modeled Terra hit or DoT with a Terra Charge bonus); Inactive otherwise.
  if (planner?.activation && (SHADOW_QUANTITY_LINE.test(text) || SHADOW_DAMAGE_LINE.test(text) || SHADOW_CHANCE_LINE.test(text))) return (planner.skillHits || []).some((hit) => hit.modeled && (hit.components || []).some((component) => component.shadow && component.perUse > 0)) ? "In calc" : "Inactive";
  if (planner?.activation && (BARRAGE_WAVE_CHANCE_LINE.test(text) || BARRAGE_PER_WAVE_LINE.test(text))) return (planner.skillHits || []).some((hit) => hit.modeled && hit.barrage?.active && (hit.components || []).some((component) => /^waves/.test(component.key || ""))) ? "In calc" : "Inactive";
  if (planner?.activation && COMBO_POINTS_GAINED_LINE.test(text)) return (planner.skillHits || []).some((hit) => hit.modeled && hit.comboPoints) ? "In calc" : "Inactive";
  // "+X% chance for Attacks to inflict Damaging Ailments" (gear affix batch D; src/ailment-applications.js): In calc where a modeled
  // ailment has an Attack Skill applying it, Inactive otherwise.
  if (planner?.activation && ATTACK_AILMENT_CHANCE.test(text)) return Object.values(planner.ailments || {}).some((ailment) => ailment?.modeled && (ailment.appliers || []).some((applier) => (applier.tags || []).includes("Attack") && applier.chancePercent > 0)) ? "In calc" : "Inactive";
  if (planner?.activation && DEMOLISHER_CONSUMED_LINE.test(text)) return (planner.skillHits || []).some((hit) => hit.modeled && hit.profile?.demolisher) ? "In calc" : "Inactive";
  // The Terra Charge gained on use moves a recast that consumes fewer than its max charges; a Terra hit already at the max reads No
  // DPS effect.
  if (planner?.activation && TERRA_CHARGE_ON_USE.test(text)) {
    // A recast Terra DoT carries its Terra Charge line in its profile's extra lines (src/skill-damage-profiles.js TERRA_CHARGE_DOT).
    const terraDot = (planner.skillDots || []).some((dot) => dot.modeled !== false && (dot.profile?.terraCharge || dot.terraCharge || (dot.profile?.recast && (dot.profile.extraAdditional || []).some((line) => /Terra Charge/.test(line.source || "")))));
    if ((planner.skillHits || []).some((hit) => hit.modeled && hit.profile?.terraOnUseMoves) || terraDot) return "In calc";
    return (planner.skillHits || []).some((hit) => hit.modeled && hit.profile?.terraCharge) ? "No DPS effect" : "Inactive";
  }
  // Spell Burst (src/skill-hit-model.js reads "+N Max Spell Burst" and "+X% additional Hit Damage for skills cast by Spell
  // Burst" and "±X% (additional) Spell Burst Charge Speed" (game manual 2026-10-12: full charge 2 s ÷ (1 + Σ) ÷ Π(1 +
  // additional)) from the modifier list): In calc where a modeled Spell hit Spell Bursts, Inactive otherwise (gear-pact batch G16).
  // Hero trait audit B4: signed hit lines (Telepathy Expert's / Fifth Cosmic Velocity's -20%) and Fifth Cosmic Velocity's interval
  // gain of Spell Burst Charge stacks.
  if (/^\+\d+ Max Spell Burst$|^[+-]?[\d.]+% additional Hit Damage for skills cast by Spell Burst$|^[+-]?[\d.]+\s?% (?:additional )?Spell Burst Charge Speed$|^[\d.]+% chance to immediately gain \d+ stack\(s\) of Spell Burst Charge\. Interval: [\d.]+ ?s$/i.test(text) && planner?.activation || SPELL_BURST_USE_GAIN.test(text) && planner?.activation) {
    return (planner.skillHits || []).some((hit) => hit.modeled && hit.rate?.spellBurst) ? "In calc" : "Inactive";
  }
  // Erika "E1 Model" talents (2026-10-14). Additional Min / Max Damage (Impermanence; src/skill-hit-model.js): In calc where a
  // modeled hit's component takes the line (per damage type); a Min line no modeled hit takes is Inactive.
  const minMaxParts = splitHitLineText(text).map((part) => ({ part: normalizePercentageText(String(part)).replace(/\s+/g, " ").trim(), parsed: classifyHitLine(part) })).filter((item) => item.parsed && (item.parsed.kind === "minDamage" || item.parsed.kind === "maxDamage"));
  if (minMaxParts.length && planner?.activation) {
    const hits = (planner.skillHits || []).filter((hit) => hit.modeled);
    const taken = minMaxParts.some(({ part }) => hits.some((hit) => (hit.components || []).some((component) => [...(component.minOnly || []), ...(component.maxOnly || [])].some((line) => normalizePercentageText(String(line.text)).replace(/\s+/g, " ").trim() === part))));
    // Scorching Beam's packets (src/build-mechanics.js → the beam hit ledger's "min" / "max" entries, 2026-10-14).
    const beamTaken = Boolean(planner.nativeHitCycle) && minMaxParts.some(({ part }) => (planner.directHit?.ledger || []).some((entry) => entry.lineText === part));
    if (taken || beamTaken) return "In calc";
    const damageModeled = hits.length || planner.nativeHitCycle || (planner.minions || []).some((minion) => minion.modeled);
    if (damageModeled && minMaxParts.some(({ parsed }) => parsed.kind === "minDamage")) return "Inactive";
  }
  // "+X% Minion Max Life" (pact nodes, Kismet: Leader; kismet / pact audit 2026-10-21): the dummy never attacks, so a Minion's Life
  // changes no damage figure. It read Not modeled where a Minion is modeled.
  if (/^[+-]?[\d.]+% (?:additional )?Minion Max Life$/i.test(text)) return "No DPS effect";
  // "Max Synthetic Troop Quantity +N" (src/minion-damage-model.js troopCount; Kismet: Synthetic Heart, kismet / pact audit 2026-10-21):
  // In calc where a modeled Synthetic Troop or Module Minion holds its max (combat condition troopMaxMinions), Inactive where other
  // Minions are modeled, No DPS effect without a modeled Minion. It read Not modeled although it moved the Huge Ember context.
  if (/^(?:Max Synthetic Troop Quantity \+?\d+|\+\d+ to Max Summonable Synthetic Troops)$/i.test(text) && planner?.activation) {
    const modeled = (planner.minions || []).filter((minion) => minion.modeled);
    if (!modeled.length) return "No DPS effect";
    return modeled.some((minion) => ["synthetic-troop", "module"].includes(minion.family) && (minion.troopCount ? !minion.troopCount.off : true)) ? "In calc" : "Inactive";
  }
  // "+X% additional Max / Min Damage for Minions" (src/minion-damage-model.js, 2026-10-14): In calc where a modeled Minion skill
  // takes it (per damage type), Inactive otherwise.
  const minionRoll = planner?.activation ? classifyMinionLine(text) : null;
  if (minionRoll && (minionRoll.kind === "maxDamage" || minionRoll.kind === "minDamage")) {
    const cleanText = (value) => normalizePercentageText(String(value)).replace(/\s+/g, " ").trim();
    const took = (planner.minions || []).some((minion) => minion.modeled && (minion.skills || []).some((skill) => !skill.buffOnly && skill.inCycle && [...(skill.maxOnly || []), ...(skill.minOnly || [])].some((line) => cleanText(line.text) === cleanText(text))));
    return took ? "In calc" : "Inactive";
  }
  // Minion damage, speed and Multistrike lines (src/minion-damage-model.js; core audit B7): where a Minion is modeled, In calc when
  // a modeled Minion applied the line, Inactive when every one left it out (its damage type, skill tag or Multistrike has no taker
  // in the cycle: `lines.inactive`). Without a modeled Minion the rules below decide.
  if (minionRoll && ["additional", "increased", "speed", "multistrikeChance", "multistrikeIncrement", "multistrikeIncrementAdditional"].includes(minionRoll.kind)) {
    const cleanText = (value) => normalizePercentageText(String(value)).replace(/\s+/g, " ").trim();
    const minions = (planner.minions || []).filter((minion) => minion.modeled);
    const listed = (keys) => minions.some((minion) => keys.some((key) => (minion.lines?.[key] || []).some((line) => cleanText(line.text) === cleanText(text))));
    if (listed(["increased", "additional", "speed", "multistrikeChance", "multistrikeIncrement", "multistrikeIncrementAdditional"])) return "In calc";
    if (minions.length && listed(["inactive"])) return "Inactive";
  }
  // Minion added flat damage, penetration, crit and Double Damage lines (gear affix audit 2026-10-22: "Adds X - Y Fire Damage to
  // Minions" read Not modeled while it moved the Huge Ember): In calc where a modeled Minion skill in the cycle takes the line
  // (added flat and penetration of the types it deals; Double Damage on its hits), Inactive where every one leaves it out.
  if (minionRoll && ["added", "penetration", "armourPenetration", "critRating", "critDamage", "doubleDamage", "lucky"].includes(minionRoll.kind)) {
    const cleanText = (value) => normalizePercentageText(String(value)).replace(/\s+/g, " ").trim();
    const minions = (planner.minions || []).filter((minion) => minion.modeled);
    if (minions.length) {
      const own = (list) => (list || []).some((line) => cleanText(line.text) === cleanText(text));
      const dealing = (minion) => (minion.skills || []).filter((skill) => skill.inCycle && !skill.buffOnly);
      const took = minions.some((minion) => {
        if (minionRoll.kind === "added") return dealing(minion).some((skill) => own(skill.added));
        if (minionRoll.kind === "penetration") return dealing(minion).some((skill) => own(skill.penetration));
        if (minionRoll.kind === "doubleDamage") return own(minion.lines?.doubleDamage) && dealing(minion).some((skill) => skill.doubleDamageChancePercent > 0);
        return own(minion.lines?.[minionRoll.kind]);
      });
      return took ? "In calc" : "Inactive";
    }
  }
  // Spirit Magus core clauses (core audit B7; src/minion-damage-model.js spiritMagusState). Without a modeled Spirit Magus they are
  // Inactive. Talons of Abyss' Ultimate speed: the Ultimate needs Full Bloom and is not in the cycle (its cooldown is unpublished), so
  // Not modeled with Full Bloom and No DPS effect without it. "+N initial Growth": In calc only where it changes something (a Stage,
  // a per-Growth line, Circle of Life). Source's Empower Skill Effect: In calc where a Magus's Empower buff takes it. Circle of Life:
  // In calc with a Magus (the player's Growth follows it).
  const magi = (planner?.minions || []).filter((minion) => minion.modeled && minion.family === "spirit-magus");
  if (planner?.activation && /^For every \d+ Growth a Spirit Magus has, it \+?[\d.]+% additional Ultimate Attack and Cast Speed$/i.test(text)) return !magi.length ? "Inactive" : magi.some((minion) => minion.magus?.fullBloom) ? "Not modeled" : "No DPS effect";
  if (planner?.activation && /^\+?[\d.]+ initial Growth for Spirit Magi$/i.test(text)) return !magi.length ? "Inactive" : magi.some((minion) => minion.magus?.initialGrowthMatters) ? "In calc" : "No DPS effect";
  if (planner?.activation && /^Spirit Magi \+?[\d.]+% (?:additional )?Empower Skill Effect$/i.test(text)) return magi.some((minion) => minion.magus?.empowerEffect?.applied) ? "In calc" : "Inactive";
  // Bond (src/minion-cores.js bondState; core audit B7): its lines act where Bond can be gained ("Can obtain Bond") and a Minion is
  // modeled; Bond Gaining Speed only shortens the build-up, which pre-built own buffs skip (No DPS effect then).
  const minionsModeled = (planner?.minions || []).some((minion) => minion.modeled);
  if (planner?.activation && /^Can obtain Bond$|^\+?\d+ (?:to )?Max Bond [Ss]tacks$|Minion Damage while having Bond$|Minion Damage at Max Bond stacks$|Minion Damage for each stack of Bond$|Minion Critical Strike Rating for every \d+ stacks? of Bond$|^\+?[\d.]+% Bond Gaining Speed$/i.test(text)) {
    const bond = planner.minionCores?.bond;
    // Without a modeled Minion a Bond line is a Minion-only effect, like the plain Minion lines: No DPS effect.
    if (!minionsModeled) return "No DPS effect";
    if (!bond?.canObtain) return "Inactive";
    return /Bond Gaining Speed$/i.test(text) && bond.prebuilt ? "No DPS effect" : "In calc";
  }
  // Orders' Summon Skill Cast Speed (src/minion-damage-model.js summon cast): In calc where a hand-cast summon (Machine Guard, Grim
  // Phantom, Spider Tank, the Spirit Magi; user-supplied 2026-10-19) took it; a Module summon is not in that list and its speed type
  // is not in the data (Not modeled).
  if (planner?.activation && /^\+?[\d.]+% (?:additional )?Summon Skill Cast Speed$/i.test(text)) {
    const minions = (planner.minions || []).filter((minion) => minion.modeled);
    if (!minions.length) return "Inactive";
    if (minions.some((minion) => minion.cycle?.summonCastFactor && minion.cycle.summonCastFactor !== 1)) return "In calc";
    return minions.some((minion) => !minion.cycle?.summonSpeedType) ? "Not modeled" : "No DPS effect";
  }
  // Rally's "+1 Synthetic Troop Minions summoned at a time" (Module summons included, up to the skill's max quantity: user-supplied
  // 2026-10-19, Google AI Mode answer): the model already counts a Synthetic Troop summon's published maximum ("This skill summons
  // up to N Minions") from the first cast, so it changes nothing there. A module also holds its max (4 by default, user-supplied
  // 2026-10-21) when own buffs are pre-built; for every Synthetic Troop Rally then only speeds the cold-start ramp, or adds Minions
  // with "troopMaxMinions" off (one per summon + N) (src/minion-damage-model.js).
  if (planner?.activation && /^Synthetic Troop Minions summoned at a time \+?\d+$/i.test(text)) {
    const troops = (planner.minions || []).filter((minion) => minion.modeled && ["synthetic-troop", "module"].includes(minion.family));
    return !troops.length ? "Inactive" : troops.some((minion) => minion.troopCount?.off || minion.troopCount?.rampIntervalSeconds != null) ? "In calc" : "No DPS effect";
  }
  // Minion defence ("-90% additional damage taken by Minions", Orders; Bond's own): the dummy never attacks the Minions.
  if (planner?.activation && /^[+-]?[\d.]+% additional damage taken by Minions$/i.test(text)) return "No DPS effect";
  // Overly Modified (src/sentry-cores.js; read per skill on its own hits and DoT, and on the ailments each skill inflicts, which
  // Reaps settle: user-supplied 2026-10-19): In calc where a modeled hit, DoT or ailment applier took it; Partly modeled with
  // Scorching Beam, whose hit ledger and Ignite path are not scaled per inflicting skill.
  if (planner?.activation && /^\+?[\d.]+% additional Sentry Damage, [+-]?[\d.]+% non-Sentry Active Skill damage$/i.test(text)) {
    const took = (entry) => entry.modeled !== false && (entry.profile?.grantedAdditional || []).some((line) => line.overlyModified);
    const applierTook = Object.values(planner.ailments || {}).some((ailment) => ailment?.modeled && (ailment.appliers || []).some((applier) => (applier.scaleSources || []).some((line) => line.overlyModified)));
    const applied = (planner.skillHits || []).some(took) || applierTook || (planner.skillDots || []).some((dot) => dot.modeled !== false && (dot.overlyModified || (dot.extraAdditional || []).some((line) => line.overlyModified)));
    if (!applied) return "Inactive";
    return planner.activation.activeNames?.has("Scorching Beam") ? "Partly modeled" : "In calc";
  }
  // Isomorphic Arms' "Minions gain the Main-Hand Weapon's bonuses." (game affix 103580002: node 358 copies the main-hand item, equip
  // slot 2, to the Minions): the weapon's damage (base and local affixes) and its other affixes reach the Minions, not its base attack
  // speed or base crit rating (user-supplied 2026-10-19, Google AI Mode answer; src/minion-cores.js isomorphicArmsState). In calc with
  // a weapon and a modeled Minion; Partly modeled where a weapon affix has no Minion reading; nothing to copy without a weapon.
  if (planner?.activation && /^Minions gain the Main-Hand Weapon's bonuses\.?$/i.test(text)) {
    if (!minionsModeled) return "No DPS effect";
    const arms = planner.minionCores?.isomorphicArms;
    if (!planner.weaponAttack?.mainHand?.weapon || !arms?.weapon) return "Inactive";
    return arms.unread?.length ? "Partly modeled" : "In calc";
  }
  // Comradeship's "Minions gain the Belt's bonuses." (belt blend audit 2026-10-21; src/minion-cores.js comradeshipState, read like
  // Isomorphic Arms, provisional): In calc where a modeled Minion takes a belt line; Partly modeled where a belt line has no Minion reading.
  if (planner?.activation && /^Minions gain the Belt's bonuses\.?$/i.test(text)) {
    if (!minionsModeled) return "No DPS effect";
    const belt = planner.minionCores?.comradeship;
    if (!belt?.belt || !(belt.read?.length || belt.unread?.length)) return "Inactive";
    return !belt.read?.length ? "Not modeled" : belt.unread?.length ? "Partly modeled" : "In calc";
  }
  // Max Sentry Quantity (src/skill-hit-model.js sentryQuantity): In calc where a modeled Sentry hit holds the extra Sentries; No DPS
  // effect where a support caps the deploy count; Inactive without a modeled Sentry skill.
  if (planner?.activation && /^(?:Max Sentry Quantity \+?\d+|\+?\d+ (?:to )?Max Sentry Quantity)$/i.test(text)) {
    const sentries = (planner.skillHits || []).filter((hit) => hit.modeled && hit.rate?.castFrequency);
    if (!sentries.length) return "Inactive";
    return sentries.some((hit) => (hit.rate.sentryQuantity?.count || 1) > (hit.rate.sentryQuantity?.base || 1)) ? "In calc" : "No DPS effect";
  }
  // Shared Fate's re-cast trigger and deploy count: the model already holds every Sentry deployed for the whole window (recast before
  // expiry; Max Sentry Quantity Sentries at once), so neither changes a figure; Inactive without a modeled Sentry skill.
  if (planner?.activation && (/^Triggers the Sentry Main Skill when there are no Sentries within \d+ ?m\. Interval: [\d.]+ ?s$/i.test(text) || /^The number of Sentries that can be deployed at a time is equal to the Max Sentry Quantity$/i.test(text))) {
    return (planner.skillHits || []).some((hit) => hit.modeled && hit.rate?.castFrequency) ? "No DPS effect" : "Inactive";
  }
  // Empower's one-Magus limit (src/minion-cores.js applySpiritMagiLimit): In calc where it left a Magus out, No DPS effect with one Magus.
  if (planner?.activation && /^The number of Max Spirit Magi In Map is 1$/i.test(text)) { const limit = planner.minionCores?.spiritMagiLimit; return limit?.dropped?.length ? "In calc" : (limit?.magi ?? magi.length) >= 1 ? "No DPS effect" : "Inactive"; }
  // Commander's Gambit on the Minions (src/minion-cores.js commanderGambitState): In calc where a modeled Minion holds one of your
  // Blessings with a damage or speed effect; the tripled cap needs the sharing clause.
  if (planner?.activation && /^When gaining any Blessing, Minions within \d+ ?m also gain it$|^Minions' Max Blessing Stacks are three times your own$/i.test(text)) {
    const gambit = planner.minionCores?.commanderGambit;
    const applied = (planner.minions || []).some((minion) => minion.modeled) && Boolean(gambit?.share) && (gambit?.blessings || []).some((entry) => entry.damage);
    return applied ? "In calc" : "Inactive";
  }
  if (planner?.activation && /^Gains Growth equal to [\d.]+% of the nearest Spirit Magus every 1 ?s/i.test(text)) return magi.some((minion) => minion.magus?.circle) ? "In calc" : "Inactive";
  if (planner?.activation && /^For every [\d.]+ Growth, \+?[\d.]+% additional damage for Spirit Magi/i.test(text)) return magi.some((minion) => minion.magus?.circle?.applied?.length) ? "In calc" : magi.some((minion) => minion.magus?.circle) ? "No DPS effect" : "Inactive";
  // "+X% additional Attack Speed when performing Multistrikes" (src/skill-hit-model.js, per skill that can Multistrike).
  if (MULTISTRIKE_SPEED_LINE.test(text) && planner?.activation) return (planner.skillHits || []).some((hit) => hit.modeled && hit.rate?.multistrike) ? "In calc" : "Inactive";
  // Mark on the dummy (src/mark-effect.js; best case, the targetMarked switch): sources and Mark Effect lines.
  const markKind = markLineKind(text);
  if (markKind && planner?.activation) {
    const mark = planner.mark;
    if (!mark?.active) return "Inactive";
    if (markKind === "source") return "In calc";
    const effect = (mark.effects || []).find((line) => normalizePercentageText(String(line.text)).replace(/\s+/g, " ").trim() === text);
    return !effect || effect.active ? "In calc" : "Inactive";
  }
  // Pure Heart (Azure Gunslinger; src/pure-heart.js): reasons in planner.pureHeart.lines.
  const pureHeartStatus = planner?.activation ? pureHeartLineStatus(text, planner.pureHeart) : null;
  if (pureHeartStatus) return pureHeartStatus.status;
  // Joined Force (src/weapon-damage-model.js): the off-hand weapon does not attack while dual wielding; the off-hand share joins
  // the main-hand weapon. In calc where a modeled attack uses them; Inactive when not dual wielding or no attack is modeled.
  const handLine = classifyWeaponAttackLine(text);
  if (handLine && ["offHandNoAttack", "offHandShare"].includes(handLine.kind) && planner?.activation) {
    const attack = weaponHitModeled(planner);
    if (!attack || !planner.weaponAttack?.dualWielding) return "Inactive";
    return handLine.kind === "offHandNoAttack" ? (planner.weaponAttack.joinedForce ? "In calc" : "Inactive") : (planner.weaponAttack.offHandSharePercent > 0 ? "In calc" : "Inactive");
  }
  // Conditional and per-stat passive lines (src/line-effects.js, talent batch chunk 2): an active line is In calc where the
  // build has an engine for its derived body; otherwise the resolver's reason (Inactive, Not on dummy, Not modeled).
  // A line the build does not carry (a tooltip shown elsewhere, the coverage census) resolves against this build's
  // condition state on the spot (talent batch chunk 4: statuses from the resolver for every origin).
  const lineEffect = lineEffectFor(planner, text) || resolveOnTheSpot(text, planner);
  if (lineEffect) {
    // A body with no damage effect (Movement Speed, Evasion, Resistance) changes no dummy damage whether or not its condition
    // holds (residual batch P3: such lines read Inactive when the condition was false).
    // (An enemy debuff's "… Damage taken" body is the dummy's, not a defence: an inactive one stays Inactive with its reason.)
    // (An active line with such a body, "+20% Movement Speed when Focus Blessing reaches max stacks" on Grace Boots, read Not
    // modeled for want of a reader before 2026-10-18: it is a stat line either way.)
    if ((lineEffect.status === "Inactive" || lineEffect.status === "Not modeled") && !lineEffect.enemyDebuff && lineEffect.bodies?.length && lineEffect.bodies.every((body) => isNonDamageBody(body.body))) return lineEffect.status === "Not modeled" && lineEffect.active && lineEffect.bodies.every((body) => isCharacterStatLine(body.body)) ? "Counted in stats" : "No DPS effect";
    // A Minion body in a build without a modeled Minion (P9: "+2% Minion Fire Penetration against Ignited enemies").
    // The Minion copies of player lines (core audit B7: Focused Strike, Dirty Tricks, Reflection; bodies "… for Minions") read like the
    // plain Minion lines there (No DPS effect: no Minion of this build can take them), so a core whose player clause applies keeps In calc.
    if (lineEffect.bodies?.length && lineEffect.bodies.every((body) => /\bMinions?\b/.test(body.body)) && !(planner?.minions || []).some((minion) => minion.modeled) && planner?.activation) return lineEffect.bodies.every((body) => / for Minions$/.test(body.body)) ? "No DPS effect" : "Inactive";
    if (!lineEffect.active || lineEffect.status !== "In calc" && lineEffect.status !== "Partly modeled") return lineEffect.status;
    // Focus / Combo / Terra Damage Enhancement (src/line-effects.js resolveDamageEnhancement): the summed derived line reaches
    // every modeled hit and own DoT of a skill with that tag (src/skill-dot-model.js reads it by tag), so the resolver's status
    // stands while such a skill is in the build. Judging the derived "additional Terra Skill Damage" body through the
    // hits-only skill-tag scope read Inactive on Frost Terra, which deals no hits.
    if (lineEffect.condition === "enhancement" && lineEffect.params?.kind && planner?.activation) {
      const tagsOf = (key) => new Set(planner.activation.setups?.find((setup) => setup.setupKey === key)?.tags || []);
      const kind = lineEffect.params.kind;
      const present = [...(planner.skillHits || []), ...(planner.skillDots || [])].some((entry) => entry.modeled && tagsOf(entry.setupKey).has(kind));
      return present ? lineEffect.status : "Inactive";
    }
    const derived = lineEffect.bodies.map((body) => body.derivedText).filter(Boolean);
    // A combat state with no body of its own (a buff or debuff source: "Have Fervor", "Inflicts Frail …"): its status.
    if (!derived.length) return lineEffect.status;
    const engines = plannerEngines(planner);
    const statuses = derived.map((body) => {
      // Enemy damage-taken bodies (combat states: Frostbite, Numbed, Infiltrations, Frail, Paralysis): the hit engine reads
      // them (by type / skill tag), and the ailment engines read typed ones.
      if (/Damage taken$|^[+-]?[\d.]+% damage taken$/i.test(body) && engines) return takenBodyStatus(body, planner, engines);
      // A conditional global Aura Effect body (src/conditional-aura-effect.js): In calc while an Aura is active.
      if (/^[+-]?[\d.]+% Aura Effect$/i.test(body) && planner?.activation) return (planner.aura?.entries || []).some((entry) => planner.activation.activeNames?.has(entry.name)) ? "In calc" : "Inactive";
      // Speed bodies feed the cast-rate ledger (Cast Speed) or the weapon model (Attack Speed).
      const speed = body.match(/^[+-]?[\d.]+% (?:additional )?(Attack and Cast Speed|Cast Speed|Attack Speed)$/i);
      if (speed && engines) {
        const used = /^Attack and/i.test(speed[1]) ? engines.castRate || engines.attackRate : /^Cast/i.test(speed[1]) ? engines.castRate : engines.attackRate;
        return used ? "In calc" : "Counted in stats";
      }
      // Flat Critical Strike Rating bodies (the spell crit model and the weapon model read derived ones; the revived Frostbitten
      // Critical Strike Rating family): In calc where a modeled player hit takes them.
      const flatCrit = body.match(/^\+[\d.]+ (?:(Attack and Spell|Spell|Attack) )?Critical Strike Rating$/i);
      // An unused crit stat reads "Counted in stats", like the speed bodies above.
      if (flatCrit && engines) return (/^Spell$/i.test(flatCrit[1] || "") ? engines.spellHit : /^Attack$/i.test(flatCrit[1] || "") ? engines.attackRate : engines.anyHit) ? "In calc" : "Counted in stats";
      return clauseStatus(body, planner);
    });
    if (statuses.includes("In calc")) return lineEffect.status;
    return statuses.find((status) => status) || "Inactive";
  }
  const blessing = planner?.blessings?.lineStatus?.get?.(text);
  if (blessing) return blessing;
  const copy = copyRuleStatus(text, planner);
  if (copy) return copy;
  // "+N Beams" with Scorching Beam's hits modeled for several Beams (src/scorching-beam-base-hit.js; Shotgun falloff): In calc.
  if (/^\+\d+ Beams$/i.test(text) && planner?.nativeHitCycle?.beams > 1) return "In calc";
  // "+N Beams" on a skill-DoT main skill: extra beams do not add DoT statuses (user-confirmed 2026-10-10).
  if (/^\+\d+ Beams$/i.test(text) && planner?.skillDots?.some((dot) => dot.modeled)) return "No DPS effect";
  // Windwalk's timed DoT window and the Full Life pact lines are applied by the planner when present.
  if (/additional Damage Over Time against enemies with Max Affliction/i.test(text) && planner?.timedDotLayers) return planner.timedDotLayers.some((layer) => layer.text === text) ? "In calc" : "Inactive";
  if (/(?:at|on) Full Life\.?$/i.test(text) && planner?.fullLife && planner.fullLife.lines.some((line) => line.text === text)) return planner.fullLife.active ? "In calc" : "Inactive";
  // "+X% Sealed Mana Compensation for <Aura>" (residual batch A-2): Inactive without that aura; with it, the per-aura
  // compensation is not read by the aura ledger (it would change the sealed Mana, and so the Low / Full Mana states).
  // "+X% Sealed Mana Compensation for Focus / Spirit Magus Skills" (core audit B7; src/engine.js auraSealedManaCompensation): In calc
  // where an active Aura carrying the tag takes it in its reservation (like the global Sealed Mana Compensation line); the Focus wording
  // reads Inactive without a Focus Aura (the Spirit Magus wording keeps its No DPS effect rule below).
  const taggedSealed = text.match(/^[+-]?[\d.]+% Sealed Mana Compensation for (Focus|Spirit Magus) Skills$/i);
  if (taggedSealed && planner?.activation) {
    const took = (planner.aura?.entries || []).some((entry) => planner.activation.activeNames?.has(entry.name) && (entry.sealedManaCompensation?.sources || []).some((source) => source.tag && normalizePercentageText(String(source.text)).replace(/\s+/g, " ").trim().replace(/^\[[^\]]+\]\s*/, "") === text));
    if (took) return "In calc";
    if (/^Focus$/i.test(taggedSealed[1])) return "Inactive";
  }
  // Gear affix batch D (2026-10-22): the aura ledger reads the named lines (src/aura-effects.js namedAuraSealedManaCompensation,
  // src/engine.js auraSealedManaCompensation), local "for <Aura>" and "additional <Aura> Sealed Mana Compensation" alike: In calc where
  // an active Aura of that family takes it in its reservation, Inactive otherwise (like the global Sealed Mana Compensation line).
  const namedSealed = text.match(/^[+-]?[\d.]+% Sealed Mana Compensation for (?!Spirit Magus)(.+?)$/i) || text.match(NAMED_AURA_SMC_ADDITIONAL);
  if (namedSealed && planner?.activation) {
    const name = namedSealed[namedSealed.length > 2 ? 2 : 1].trim().replace(/^Precise: /, "");
    const active = [...(planner.activation.activeNames || [])].some((item) => item === name || item === `Precise: ${name}`);
    const took = (planner.aura?.entries || []).some((entry) => entry.name.replace(/^Precise: /, "") === name && (entry.sealedManaCompensation?.named || []).some((source) => normalizePercentageText(String(source.text)).replace(/\s+/g, " ").trim() === text));
    return active && took ? "In calc" : "Inactive";
  }
  // "+X% <Aura name> Aura (Effect)" (e.g. Decaying Blessing, a Belt corrosion): applied to that aura and its Precise: version by
  // the aura ledger (engine.js namedAuraEffectPercent; Deep Pain's gear lines through deepPainAuraEffectPercent).
  const namedAura = text.match(/^\+[\d.]+% (.+?) Aura(?: Effect)?$/i);
  if (namedAura && planner?.aura?.entries) {
    const entries = planner.aura.entries.filter((item) => item.name.replace(/^Precise: /, "") === namedAura[1] && (item.namedAuraEffectPercent || item.deepPainAuraEffectPercent));
    if (entries.length) return entries.some((entry) => planner.activation?.activeNames?.has(entry.name)) ? "In calc" : "Inactive";
  }
  // A named aura's effect or Sealed Mana line ("+120% Fearless Aura", "-20% additional Fearless Sealed Mana Compensation"):
  // Inactive while the build runs no aura of that name (residual batch A-2); with the aura, the readers above decide.
  const auraNamed = text.match(/^[+-]?[\d.]+% (?:additional )?(.+?) (?:Aura(?: [Ee]ffect)?|Sealed Mana Compensation)$/i);
  if (auraNamed && planner?.activation && !/^(?:additional )?$/i.test(auraNamed[1])) {
    const name = auraNamed[1].trim();
    const known = tlidbSkillCatalogSs13.some((skill) => skill.name === name || skill.name === `Precise: ${name}`);
    const active = [...(planner.activation.activeNames || [])].some((item) => item === name || item === `Precise: ${name}`);
    if (known && !active) return "Inactive";
  }
  if (appliedByPlanner(text, planner)) return "In calc";
  // Ignite-path conditional lines (theoretical-sources.js). Not-Ignited chance only changes the
  // 5 s / 20 s windows, and nothing when the ordinary chance already reaches 100%.
  if (planner?.theoretical && /^\+[\d.]+% Ignite Chance against enemies that haven['’]t been Ignited$/i.test(text)) {
    if (!(planner.theoretical.totals?.baseIgniteDamage?.max > 0)) return "Inactive";
    return planner.theoretical.totals.applicationChancePercent >= 100 ? "No DPS effect" : "In calc";
  }
  // Max-Affliction resistance reduction: applied to Ignite, and to every other DoT of a resisted type (Wilt, skill DoTs; user decision
  // 2026-10-21), for the time the dummy sits at max Affliction.
  if (planner?.theoretical && /^[+-][\d.]+% All Resistance when the enemy has max Affliction$/i.test(text)) {
    const maxAffliction = planner.theoretical.combat?.maxAffliction;
    const ignite = planner.theoretical.totals?.baseIgniteDamage?.max > 0 && Number.isFinite(maxAffliction?.firstMaxSeconds);
    const otherDot = Object.values(planner.ailments || {}).some((ailment) => ailment?.modeled && ailment.maxAfflictionResistance);
    return ignite || otherDot ? "In calc" : "Inactive";
  }
  const line = asLine(text);
  for (const key of ["trauma", "wilt", "ignite"]) {
    const typed = collectAilmentTypedSources(key, [line]);
    const hit = Object.entries(typed).some(([bucket, items]) => bucket !== "unrecognized" && items.length);
    if (!hit) continue;
    // An Elemental line ("+12% Elemental Damage") also writes Cold and Lightning (src/damage-line-classifier.js): without Ignite
    // the generic rule below judges it on the build's Cold / Lightning hits and DoTs (pact badge audit 2026-10-13: an unallocated
    // Elemental pact node read Inactive on a Cold build).
    // The same holds for a plain Fire line ("+25% additional Fire Damage", Translucent's derived body; core audit batch B2): without
    // Ignite it still reaches Fire hits (an added-Fire component on a Cold spell), so the generic rule judges it.
    // Likewise a plain Erosion or Physical line without Wilt / Trauma (Self-Delusion's derived "+X% additional Erosion Damage" on an
    // added-Erosion attack; core audit batch B4): the generic rule judges it on the build's hits and DoTs of that type.
    const ailmentPresent = key === "ignite" ? planner?.theoretical?.totals?.baseIgniteDamage?.max > 0 : planner?.ailments?.[key]?.base?.max > 0;
    if ((key === "ignite" || planner?.activation) && !ailmentPresent && (classifyDamageLine(text)?.damageTypes?.size > 0)) break;
    if (key === "ignite") return planner?.theoretical?.totals?.baseIgniteDamage?.max > 0 ? "In calc" : "Inactive";
    return planner?.ailments?.[key]?.base?.max > 0 ? "In calc" : "Inactive";
  }
  if (collectDamagingAilmentChance([line]).length || collectAilmentDuration([line]).length) return "In calc";
  const reapSource = parseReapingSource(text, "coverage");
  if (reapSource) {
    // Trauma- / Wilt-only Reaps and "when inflicting Trauma / Wilt" triggers need that ailment on the dummy (chunk 3).
    const key = reapSource.dotKeys?.[0] || reapSource.trigger.match(/^inflicting (Trauma|Wilt)$/)?.[1]?.toLowerCase();
    if (key && planner?.ailments) return planner.ailments[key]?.modeled && planner.ailments[key]?.base?.max > 0 ? "In calc" : "Inactive";
    return "In calc";
  }
  // "Cannot inflict Reap": In calc where the build has a Reaping source it switches off, including The Cycle I Resist's Reap
  // on each Main Terra recast (src/selena-dance.js resolveCycleResist; the Reaping model drops it, src/reaping-model.js).
  if (/^Cannot inflict Reap$/i.test(text) && planner?.modifierTexts) return planner.modifierTexts.some((line) => parseReapingSource(String(line.text), "x")) || (planner.damageSources || []).some((source) => source.profile?.builtInReaping) || Boolean(planner.cycleResist?.reap) ? "In calc" : "Inactive";
  const reaping = collectReapingModifiers([line]);
  if (reaping.duration.length || reaping.recovery.length || reaping.additionalRecovery.length || reaping.recentReap.length || reaping.ailmentType.length) return "In calc";
  if (/^Activates the following effects when there are \d+ of this Kismet/i.test(text)) return "Planner only";
  // Added flat damage to Spells / Attacks (gear-pact batch G16): the beam reads Fire / Cold / Lightning added to Spells
  // (src/scorching-beam-added-damage.js); the skill-hit engine reads every type added to Spells (skill-hit-lines ADDED_LINE)
  // and the weapon model "to Attacks" for attack skills. Before 2026-10-12 only the beam was asked (47 Not modeled options).
  const added = text.match(/^Adds [\d.]+ ?[-–] ?[\d.]+ (Physical|Fire|Cold|Lightning|Erosion) Damage to (Attacks and Spells|Spells|Attacks|your Attacks and Spells)$/i);
  if (added && planner?.activation) {
    const toSpells = /Spells/i.test(added[2]), toAttacks = /Attacks/i.test(added[2]);
    const hits = (planner.skillHits || []).filter((hit) => hit.modeled);
    const beamReads = toSpells && /^(?:Fire|Cold|Lightning)$/i.test(added[1]) && planner.beamAddedDamage?.sources?.length > 0;
    // The skill-hit engine adds "to Spells" lines to Spell skill hits only, and "to Attacks and Spells" also to attacks
    // (src/skill-hit-model.js; before 2026-10-18 "to Spells" reached attack hits too).
    const spellReads = toSpells && hits.some((hit) => (hit.profile?.tags || []).includes("Spell") && !hit.profile?.weaponScaling);
    const attackReads = toAttacks && hits.some((hit) => hit.rate?.speedType === "attack-speed");
    if (beamReads || spellReads || attackReads) return "In calc";
    if (planner.activation.activeNames?.has("Scorching Beam") || hits.length) return "Inactive";
  }
  // Plain damage / penetration templates: the shared classifier (src/damage-line-classifier.js) applies
  // them through build-mechanics, which marks every applied or already-counted line in `recognized`
  // (checked first above). A parsed line that reached neither ledger in this build is Inactive.
  const generic = allowGeneric ? classifyDamageLine(text) : null;
  if (generic && !generic.minion) {
    if (!planner?.mechanics?.generic) return "In calc";
    // The generic hit and DoT engines (talent batch T7): a modeled spell / attack hit with the line's tags and one of
    // its damage types (every component: added Lightning on an Erosion spell counts), or a modeled skill DoT of the line's type.
    const tagsOf = (key) => new Set(planner.activation?.setups?.find((setup) => setup.setupKey === key)?.tags || []);
    const hitTypes = (hit) => [...new Set([...(hit.dealtTypes || (hit.damageType ? [hit.damageType] : [])), ...(hit.components || []).map((component) => component.type)].filter(Boolean))];
    const skillHitApplies = (planner.skillHits || []).filter((hit) => hit.modeled).some((hit) => (hitTypes(hit).length ? hitTypes(hit) : ["Physical"]).some((damageType) => {
      const route = routeDamageLine(generic, { skillTags: tagsOf(hit.setupKey), hitActive: true, damageType, dotAilment: "none" });
      // Armour penetration (route.armourPenetration): any modeled hit takes the dummy's armour (src/target-hit-mitigation.js).
      return route.hit || route.penetration || route.armourPenetration;
    }));
    const skillDotApplies = (planner.skillDots || []).filter((dot) => dot.modeled).some((dot) => {
      const tags = tagsOf(dot.setupKey);
      const route = routeDamageLine(generic, { skillTags: tags, dotSkillTags: tags.has("Spell") ? new Set(["Spell"]) : new Set(), hitActive: false, damageType: dot.damageType || "Physical", dotAilment: "none" });
      return route.dot || route.penetration;
    });
    // Carried by the build: build-mechanics marks what the beam / DoT ledgers took (checked first); the skill-hit and
    // skill-DoT engines read it themselves (gear-pact batch chunk 3: a Lightning line on Haunting Abomination's added
    // Lightning read Inactive while it moved damage). Otherwise Inactive.
    if (planner.modifierTexts?.some((line) => normalizePercentageText(String(line.text ?? "")).trim() === text)) return skillHitApplies || skillDotApplies ? "In calc" : "Inactive";
    // Not in the build: say whether the rule would apply it to this build's hitting skill or its DoTs.
    const beam = planner.activation?.setups?.find((setup) => setup.name === "Scorching Beam");
    const beamActive = Boolean(beam) && planner.activation?.activeNames?.has("Scorching Beam") === true;
    const main = planner.mainSkill || beam;
    const hitRoute = routeDamageLine(generic, { skillTags: new Set(beam?.tags || []), hitActive: beamActive });
    const dotRoute = routeDamageLine(generic, { skillTags: new Set(main?.tags || []), hitActive: false });
    const fireOnly = Boolean(generic.damageTypes) || generic.ailments?.has("ignite");
    const canIgnite = planner.theoretical?.totals?.baseIgniteDamage?.max > 0;
    const dotApplies = dotRoute.dot && (!fireOnly || canIgnite);
    if (hitRoute.hit || dotApplies || hitRoute.penetration) return "In calc";
    return skillHitApplies || skillDotApplies ? "In calc" : "Inactive";
  }
  const ailmentNamed = text.match(/\b(Wilt|Trauma|Ignite)\b/);
  if (ailmentNamed && /per \d+ stacks of|for each stack of|when inflicting|upon inflicting|stacks? of \w+ inflicted/i.test(text)) {
    const key = ailmentNamed[1].toLowerCase();
    const present = key === "ignite" ? planner?.theoretical?.totals?.baseIgniteDamage?.max > 0 : planner?.ailments?.[key]?.base?.max > 0;
    if (!present) return "Inactive";
  }
  // Per-level lines the planner resolved into a plain line (Brutality; planner.js `derivedFrom`).
  if (planner?.modifierTexts?.some((item) => item.derivedFrom && normalizePercentageText(String(item.derivedFrom)).trim() === text)) return "In calc";
  // Spirit Magus lines (src/minion-damage-model.js: "Spirit Magus Skill / Spirit Magi" damage and crit, Growth, Enhanced-skill
  // chance): In calc where a Spirit Magus is modeled, Inactive otherwise (gear-pact batch chunk 4: they read Not modeled).
  if (planner?.activation && (classifyMinionLine(text)?.spiritMagus || /^\+?[\d.]+ initial Growth for Spirit Magi$|^For every \d+ Growth a Spirit Magus has|chance for Spirit Magi to use an Enhanced Skill|^Gains [\d.]+ Growth for [\d.]+ ?s when Minions land a Critical Strike/i.test(text))) {
    return (planner.minions || []).some((minion) => minion.modeled && minion.family === "spirit-magus") ? "In calc" : "Inactive";
  }
  // Synthetic Troop-only Minion lines (legendary audit batch 8): In calc where a Synthetic Troop or Module Minion is modeled.
  if (planner?.activation && classifyMinionLine(text)?.troop) return (planner.minions || []).some((minion) => minion.modeled && TROOP_FAMILIES.includes(minion.family)) ? "In calc" : "Inactive";
  // Iris Nourishment (src/minion-damage-model.js nourishmentState, 2026-10-12): the grant, loss and damage lines of the base
  // trait are read by the Spirit Magus cycle; the movement line changes no dummy damage. Empower-share, Full Bloom and
  // auto-trigger lines keep the generic status (the Empower Skill Effect and the Ultimate are not read).
  const nourishKind = planner?.activation ? nourishmentLineKind(text) : null;
  if (nourishKind === "movement") return "No DPS effect";
  // Gentle Zephyr's no-loss / no-bonus line is read by the same cycle (hero trait audit B1, F6).
  if (["activeAsTrait", "grant", "extraGrant", "lose", "losePerStack", "effect", "noLossNoBonus"].includes(nourishKind)) {
    return (planner.minions || []).some((minion) => minion.modeled && minion.family === "spirit-magus") ? "In calc" : "Inactive";
  }
  // Minion / Synthetic Troop / Spirit Magus skill levels raise the summon skill of a modeled Minion of that family
  // (talent batch chunk 4; Minion Skill Level raises every Summon skill, user decision 2026-10-22): In calc where a modeled Minion's
  // setup took the level.
  const minionLevel = text.match(/^\+\d+ (Minion|Synthetic Troop|Spirit Magus) Skill Levels?$/i);
  if (minionLevel) {
    const minionSetups = new Set((planner?.minions || []).filter((minion) => minion.modeled).flatMap((minion) => minion.setupKeys || []));
    // A level the user pinned (manualAddedLevels) ignores the build's level lines.
    const took = (planner?.activation?.setups || []).some((setup) => minionSetups.has(setup.setupKey) && !planner?.state?.skills?.skillLevels?.[setup.setupKey]?.manualAddedLevels && (setup.levelBonusSources || []).some((entry) => new RegExp(`${minionLevel[1]} Skill Level`, "i").test(entry.text)));
    return took ? "In calc" : planner?.minions ? "Inactive" : "Not modeled";
  }
  // Sentry lines (talent batch chunk 4): Cast Frequency (src/skill-hit-model.js) and Sentry Skill crit (the player's crit
  // model scoped to Sentry skills) read where a modeled Sentry skill hits; conditional Cast Frequency wordings are not read.
  if (/^[+-]?[\d.]+% (?:additional )?Sentry(?: Skill)? [Cc]ast [Ff]requency$|^\+[\d.]+% Sentry Skill Critical Strike (?:Rating|Damage)$/i.test(text)) {
    const sentries = (planner?.skillHits || []).filter((hit) => hit.modeled && hit.rate?.castFrequency);
    return planner ? sentries.length ? "In calc" : "Inactive" : "In calc";
  }
  // Sentry speed (residual batch): a Sentry's cadence is its Cast Frequency, not Attack / Cast Speed (manual rule 1001011724), so
  // "Attack / Cast Speed for Sentry Skills" only shortens the deploy cast: No DPS effect on a held Sentry. The belt-blend wording
  // that carries the player's Cast / Attack Speed into the Cast Frequency is read by src/skill-hit-model.js.
  const sentryHits = (planner?.skillHits || []).filter((hit) => hit.modeled && hit.rate?.castFrequency);
  if (/^[+-]?[\d.]+% (?:additional )?(?:Attack and Cast|Cast|Attack) Speed for Sentry Skills$/i.test(text) && planner?.activation) return sentryHits.length ? "No DPS effect" : "Inactive";
  const sentryShare = text.match(/^(?:Cast|Attack) Speed bonus and [\d.]+% of additional bonus are also applied to (Spell|Attack) Sentries' Cast Frequency$/i);
  // Core audit B7: In calc where the share reached a Sentry's Cast Frequency (the build has a Cast / Attack Speed bonus); a Sentry of
  // that kind with no bonus to share reads No DPS effect.
  if (sentryShare && planner?.activation) {
    const kind = sentryShare[1][0].toUpperCase() + sentryShare[1].slice(1).toLowerCase();
    const own = sentryHits.filter((hit) => (planner.activation.setups?.find((setup) => setup.setupKey === hit.setupKey)?.tags || []).includes(kind));
    if (!own.length) return "Inactive";
    return own.some((hit) => (hit.rate.castFrequency.sources || []).some((line) => String(line.text || "").startsWith(text))) ? "In calc" : "No DPS effect";
  }
  // Command per second (Mighty Guard; src/minion-cores.js commandState): Command builds to its cap of 100 (user-supplied 2026-10-19,
  // Google AI Mode answer): In calc where a modeled Synthetic Troop / Module Minion takes full Command (best case, switch
  // fullCommand); Inactive without one or with the switch off.
  if (planner?.activation && /^\+ ?\d+(?:\.\d+)? Command per second$/i.test(text)) {
    const troops = (planner.minions || []).some((minion) => minion.modeled && COMMAND_FAMILIES.includes(minion.family));
    return troops && planner.minionCores?.command?.value > 0 ? "In calc" : "Inactive";
  }
  // "+X% additional damage for Synthetic Troop Minions when having at least N Command" (src/minion-cores.js commandState; gear affix
  // batch A): In calc where a modeled Synthetic Troop / Module Minion holds that much Command, Inactive otherwise.
  if (planner?.activation && COMMAND_GATED.test(normalizePercentageText(String(text)).replace(/\s+/g, " ").trim())) {
    const troops = (planner.minions || []).some((minion) => minion.modeled && COMMAND_FAMILIES.includes(minion.family));
    return troops && (planner.minionCores?.command?.gated || []).some((item) => item.active) ? "In calc" : "Inactive";
  }
  // Minion-family lines with no reader yet (talent batch chunk 4, §5.4), with the reason in the batch doc.
  // ("Origin of Spirit Magus effect" lines are read by src/origin-of-spirit-magus.js through the line-effect entries above.)
  if (/Sentry Duration|Sentry Start Time|Sentry quantity|Command per second|Max Spirit Magi In Map|Origin of Spirit Magus effect|if Sentry Skill is not used in the last/i.test(text)) return "Not modeled";
  if (/additional damage taken by Spirit Magi$|Sealed Mana Compensation for Spirit Magus Skills$/i.test(text)) return "No DPS effect";
  // Blur grants follow the build's Blur sources (src/blur-sources.js): In calc while that source holds Blur, Inactive
  // otherwise (a Reaping grant without a Reaping source). "On defeat" grants never fire: the training dummy never dies.
  if (/chance to (?:gain|regain) Blur/i.test(text)) {
    if (/\bdefeat/i.test(text)) return "Not on dummy";
    const own = (planner?.blurSources || []).filter((source) => normalizePercentageText(String(source.text ?? "")).trim() === text);
    if (own.length) return own.some((source) => source.available) ? "In calc" : "Inactive";
  }
  // Every other Blur grant src/blur-sources.js reads ("Gains Blur per 5 stacks of Wilt inflicted", "Gains Blur for 3 s after
  // losing Blur"; residual batch A-2): In calc where it holds Blur in this build (carried) or would (uncarried: its trigger
  // judged against this build), Inactive otherwise. Ring-slot grants are judged by their slot once equipped.
  if (planner?.activation && planner?.blurSources && !/Ring slot/i.test(text)) {
    const own = planner.blurSources.filter((source) => normalizePercentageText(String(source.text ?? "")).trim() === text);
    const parsed = own.length ? own : [parseBlurSource(text, "coverage", { hasReaping: plannerEngines(planner)?.reaping || (planner.blurSources || []).some((source) => source.trigger === "Reaping" && source.available), inflictsWilt: (planner.lineEffects?.state?.enemyAilments || []).includes("Wilt") })].filter(Boolean);
    if (parsed.length) {
      if (parsed.some((source) => source.notOnDummy)) return "Not on dummy";
      // A carried grant needs the Blur condition on; an uncarried one would turn Blur on once equipped (it is a source).
      return parsed.some((source) => source.available) && (!own.length || planner.conditions?.blur !== false) ? "In calc" : "Inactive";
    }
  }
  // "Has Dormant Entanglement" (Goddess of Knowledge core Acquaintance; src/tangle-model.js): "+40% additional Tangle Damage for
  // each inactivated Tangle" on the build's Tangle Skills. A carried line resolves through planner.lineEffects (with its reason);
  // this answers for an uncarried tooltip: In calc where the build has a Tangle Skill, Inactive otherwise.
  if (/^Has Dormant Entanglement$/i.test(text) && planner?.tangles) return planner.tangles.setups.length && planner.tangles.inactivated > 0 ? "In calc" : "Inactive";
  // Core audit B8 (src/tangle-model.js): "You can apply N additional Tangle(s) to enemies" (Peculiar Vibe) activates more Tangles
  // on the dummy (the cadence reading and the Dormant count read it); "±X% (additional) Tangle Duration" changes no dummy figure
  // while the build recasts its Tangle Skill within the duration (best case).
  // "+N (to) Max Tangle Quantity" (src/tangle-model.js quantitySources; Dual Kismet: Resentful Maiden, kismet / pact audit 2026-10-21):
  // In calc where the build has a Tangle Skill or the Clockwork Core (the activated / inactivated count and the Core's triggers read
  // it), Inactive otherwise. It read Not modeled although it moved the Youga fixture.
  if (/^\+\d+ (?:to )?Max Tangle Quantity$/i.test(text) && planner?.tangles) return planner.tangles.setups.length ? "In calc" : "Inactive";
  if (planner?.tangles && isTangleAttachLine(text)) return tangleAttachStatus(planner.tangles).status;
  if (planner?.tangles && isTangleDurationLine(text)) return tangleDurationStatus(planner.tangles).status;
  // "+X% Tangle Damage Enhancement" (gear affix batch B; src/tangle-model.js): In calc on a build with a Tangle Skill or the Clockwork Core.
  if (planner?.tangles && isTangleEnhancementLine(text)) return planner.tangles.enhancement?.active ? "In calc" : "Inactive";
  // "-99% additional Empower Skill and Defensive Skill Effect" (Storm's Command; core audit B8, src/storm-command.js): the Empower
  // half scales the Empower buffs the planner models (Aim's damage bonus, Ice Bond's and Bull's Rage's Euphoria, a Freezing Point
  // debuff); Defensive Skill effects are defence only. In calc where such a buff is in the build, Inactive otherwise.
  if (EMPOWER_DEFENSIVE_EFFECT_LINE.test(text) && planner?.activation) {
    const aim = Boolean(planner.aim?.active && planner.aim.baseDamagePercent > 0);
    const empower = (planner.empowerEffects?.entries || []).some((entry) => entry.active && entry.empowerScaled);
    return aim || empower ? "In calc" : "Inactive";
  }
  // Blessing duration (talent batch chunk 3): own buffs are pre-built and held (gain sources such as Reaps refresh them), so a
  // longer duration changes nothing: No DPS effect while the Blessing is held; Inactive when nothing holds it.
  const blessingDuration = text.match(/^\+[\d.]+% (Tenacity|Focus|Agility) Blessing Duration$/i);
  if (blessingDuration && planner?.blessings?.entries) return planner.blessings.entries.find((entry) => entry.name.toLowerCase() === blessingDuration[1].toLowerCase())?.stacks ? "No DPS effect" : "Inactive";
  // "+X% Numbed Duration": Numbed is held at its 10-stack cap on the dummy (best case, src/line-conditions.js), so a longer
  // duration changes nothing; Inactive without Numbed.
  if (/^\+[\d.]+% Numbed Duration$/i.test(text) && planner?.lineEffects?.state) return (planner.lineEffects.state.enemyAilments || []).includes("Numbed") ? "No DPS effect" : "Inactive";
  // The generic wording (residual batch A-2): every held Blessing is pre-built and refreshed, so a longer duration changes nothing.
  if (/^\+[\d.]+% Blessing Duration$/i.test(text) && planner?.blessings?.entries) return planner.blessings.entries.some((entry) => entry.stacks > 0) ? "No DPS effect" : "Inactive";
  // Ailment chance → ailment damage (Warlock [5,4]; src/ailment-model.js, src/theoretical-sources.js).
  if (CHANCE_TO_DAMAGE.test(text) && planner) {
    const engines = plannerEngines(planner);
    return engines && (engines.ignite || engines.otherAilment) ? "In calc" : "Inactive";
  }
  // Handedness / Dual Wield lines the weapon model reads (src/weapon-damage-model.js) that it did not apply here (the
  // held weapons do not match): Inactive. Applied ones read In calc above (appliedByPlanner).
  const weaponLine = classifyWeaponAttackLine(text);
  // Main-Hand Weapon speed / crit / added damage (src/weapon-damage-model.js reads them onto the main-hand weapon): In calc
  // where a modeled attack uses a held main-hand weapon (gear-pact batch chunk 1; they read Not modeled while applied).
  // (Legendary audit batch 1: a weapon value fixed by another item, "Weapon Attack Speed is fixed at 1.35", reads the same way.)
  if (weaponLine && ["critMainHand", "mainHandSpeed", "addedMainHand", "weaponCritFixed", "weaponSpeedFixed"].includes(weaponLine.kind) && planner?.activation) {
    const attack = weaponHitModeled(planner);
    return attack && planner.weaponAttack?.mainHand?.weapon ? "In calc" : "Inactive";
  }
  // "+X% additional Base Damage for Two-Handed Weapons" (src/weapon-damage-model.js scales a two-handed weapon's base damage; a sum,
  // so appliedByPlanner does not see it): In calc where a modeled attack uses a held two-handed weapon (belt blend audit 2026-10-21:
  // the blend moved Split Shot's bow attack while its badge read Inactive).
  if (weaponLine?.kind === "twoHandedBase" && planner?.activation) {
    const attack = weaponHitModeled(planner);
    return attack && planner.weaponAttack?.twoHanded ? "In calc" : "Inactive";
  }
  // "+X% additional Base Damage for Off-Hand Weapons" (Demons' Touch): In calc where a modeled weapon hit dual wields (legendary audit
  // 2026-10-22: it moved Erika while it read Inactive).
  if (weaponLine?.kind === "offHandBase" && planner?.activation) return weaponHitModeled(planner) && planner.weaponAttack?.dualWielding ? "In calc" : "Inactive";
  if (weaponLine && ["heldDamage", "dualDamage", "attackSpeedDual", "critTwoHanded", "twoHandedBase", "offHandBase", "mainHandDamage", "offHandShare"].includes(weaponLine.kind)) return "Inactive";
  // Stealth Stab "for 3 s after Blur ends" (src/blur-effects.js; the Blur group compares it with Blur active).
  if (/after Blur ends$/i.test(text) && planner?.blurEffects) return planner.blurEffects.afterEnd ? "In calc" : "Inactive";
  // Daze (slate, Warlock core, gear): one Blur state on every ailment (src/blur-effects.js, src/ailment-shared.js).
  if (/additional Ailment Damage while Blur is active$/i.test(text) && planner?.blurEffects) return dazeStatus(planner);
  // Keys of the shared talent / slate table (src/talent-text-effects.js): In calc only when the build has the engine
  // that reads them (talent batch T7).
  const parsedKey = matchTalentTextClause(text, "talent") || matchTalentTextClause(text, "slate");
  if (parsedKey) {
    const status = routeStatus(parsedKey.route, parsedKey.values[0][0], planner);
    if (status) return status;
  }
  const readerStatus = readerLineStatus(text, planner);
  if (readerStatus) return readerStatus;
  if (engineRules.some((rule) => rule.test(text))) return "In calc";
  if (/^\+?[\d.]+% (?:Max )?(?:Fire|Elemental|All) Resistances?$/i.test(text) && planner?.modifierTexts?.some((item) => /^For every 1% Fire Resistance, \+[\d.]+% Critical Strike Damage/i.test(item.text))) return "In calc";
  if (notOnDummyRules.some((rule) => rule.test(text))) return "Not on dummy";
  // Own damage taken at Low Life / Mana: defence the effective-HP sheet sums (src/effective-hp.js), "Counted in stats".
  if (/^[+-][\d.]+% additional damage taken (?:when |while )?(?:at |on )?Low (?:Life|Mana)$/i.test(text)) return "Counted in stats";
  // Minion lines are not "No DPS effect" when a Minion source is modeled: the Minion model applies the ones it reads
  // (appliedByPlanner above); the rest stay unmodeled (talent batch T7).
  const minionModeled = (planner?.minions || []).some((minion) => minion.modeled);
  // Penetration that scales with an own resistance ("Gains Elemental Resistance Penetration equal to your minimum effective
  // Elemental Resistance", Trinity; "+2% Lightning Penetration per +1% Lightning Resistance") is damage the planner does not
  // read: Not modeled, not the trailing-"Resistance" defence rule (survey 2026-10-13 §4.2).
  if (/\bPenetration\b/i.test(text) && /Resistances?$/i.test(text) && !/Armor DMG Mitigation/i.test(text)) return "Not modeled";
  // Damage wordings the defence words below would catch (core audit 2026-10-18 F5 / F6): Ethereal Prism Juggernaut's enemy
  // Armor / Resistance shred, Self-Delusion's damage per Crowd Control type, Keen Intellect's penetration per Curse skill,
  // Circle of Life's Spirit Magus damage per Growth, and Play Safe's Cast Speed → Spell Burst Charge Speed (it shortens the
  // charge time, src/skill-hit-model.js spellBurstChargeTime). No reader takes them yet. (Juggernaut and Self-Delusion are read by
  // src/combat-states.js since core audit B4: with a planner their resolver entry decides above; this stays the planner-less fallback.)
  if (/additional Armor and [+-]?[\d.]+% [\w ]*Resistance for enemies on Critical Strike/i.test(text)
    || /additional \w+ Damage to an enemy for each type of Crowd Control/i.test(text)
    || /^For every Active \w+ Skill equipped, .*Penetration/i.test(text)
    || /additional damage for Spirit Magi/i.test(text)
    || /bonuses to Cast Speed is also applied to Spell Burst Charge Speed/i.test(text)) return "Not modeled";
  if (noDpsRules.some((rule) => rule.test(text) && !(minionModeled && rule === MINION_RULE))) return "No DPS effect";
  return null;
}

// Last resort, after every variant of a clause found no engine status: the gear-pact batch's keyword families
// (src/line-families.js).
//   c-meta / c-defense / c-utility (non-damage) → No DPS effect (engineLineStatus turns stat-sheet lines into Counted in stats);
//   n-defeat (on defeat / kill / explode on death) → Not on dummy: the training dummy is never defeated;
//   n-taken (when hit / blocking / evading) → by the user's decision 2026-10-12 not "Not on dummy" (being hit and
//   blocking recently are best-case assumptions); only its non-damage lines (regeneration, reflection) read No DPS effect.
const NON_DAMAGE_FAMILIES = new Set(["c-meta", "c-defense", "c-utility"]);
function familyStatus(text) {
  const family = familyOf(text);
  if (NON_DAMAGE_FAMILIES.has(family?.id)) return "No DPS effect";
  if (family?.id === "n-defeat") return "Not on dummy";
  if (family?.id === "n-taken" && !hasDamageSignal(text)) return "No DPS effect";
  return null;
}

// ---- Keys whose reader depends on the line's origin or the build's skills (gear-pact batch chunk 1) -------------------
const carriedOrigins = (text, planner) => new Set((planner?.modifierTexts || []).filter((line) => normalizePercentageText(String(line.text ?? "")).trim() === text).map((line) => line.origin));
const READ_ORIGINS = new Set(["gear", "kismet", "pact", "memory"]);
function readerLineStatus(text, planner) {
  const engines = plannerEngines(planner);
  const origins = carriedOrigins(text, planner);
  // Carried, but only by origins no reader takes (a prism or core copy): Not modeled. Gear / kismet / pact / memory copies
  // are marked by build-mechanics (checked first); talent / slate copies by their totals (the parsed-key route above).
  const unreadOnly = (readers) => origins.size > 0 && ![...origins].some((origin) => readers.has(origin));
  if (/^\+?[\d.]+% additional damage applied to Life$/i.test(text)) {
    if (unreadOnly(new Set([...READ_ORIGINS, "talent", "slate", "core"]))) return "Not modeled";
    if (planner?.conditions?.targetLife === false) return "Inactive";
    return routeStatus("damage", "additionalDamageToLifePercent", planner);
  }
  if (/^\+[\d.]+% additional Affliction effect$/i.test(text)) {
    if (unreadOnly(new Set([...READ_ORIGINS, "talent", "slate", "prism", "trait"]))) return "Not modeled";
    return routeStatus("affliction", "additionalAfflictionEffectPercent", planner);
  }
  // "+X% Fire Skill Critical Strike Damage" (src/scorching-beam-critical.js: gear / kismet / pact / memory copies, Fire skills).
  if (/^\+[\d.]+% Fire Skill Critical Strike Damage$/i.test(text)) {
    if (unreadOnly(READ_ORIGINS)) return "Not modeled";
    if (!engines) return "In calc";
    const fireHit = engines.beam || engines.hits.some((hit) => (planner.activation?.setups?.find((setup) => setup.setupKey === hit.setupKey)?.tags || []).includes("Fire"));
    return fireHit ? "In calc" : "Counted in stats";
  }
  // Skill levels by tag (gear-pact batch G9): In calc where an active, modeled damage setup (or an active aura) takes the
  // level (src/skill-level-bonuses.js rules); Inactive where no such skill has the tag. Before 2026-10-12 a static rule
  // read In calc for tags no modeled skill carries ("+3 Lightning Skill Level" on a Fire build).
  return skillLevelLineStatus(text, planner);
}

/** Status of a "+N <Tag> Skill Level" / "+N to All Skills' Levels" line in this build, or null for other lines. */
export function skillLevelLineStatus(text, planner = context) {
  // Necklace of Inverse (gear uniques round 2): levels per empty skill-board slot (src/skill-level-bonuses.js, provisional board reading).
  const empty = emptySlotLevelLine(text);
  if (empty) {
    if (!planner?.activation) return "In calc";
    const enabled = (planner.activation.setups || []).filter((setup) => setup.enabled !== false || setup.slotInactive);
    const slots = empty.slot === "passive" ? 4 - enabled.filter((setup) => setupBoardTab(setup) === "auras").length : 5 - enabled.filter((setup) => setupBoardTab(setup) === "skills" && setup.role !== "support").length;
    if (slots <= 0) return "Inactive";
    const active = planner.activation.activeNames || new Set();
    const modeledKeys = new Set((planner.damageSources || []).filter((source) => source.status === "modeled").map((source) => source.setupKey));
    const auraNames = new Set((planner.aura?.entries || []).map((entry) => entry.name));
    const pinned = (setup) => Boolean(planner.state?.skills?.skillLevels?.[setup.setupKey]?.manualAddedLevels);
    return enabled.some((setup) => active.has(setup.name) && (setup.name === "Scorching Beam" || modeledKeys.has(setup.setupKey) || auraNames.has(setup.name)) && !pinned(setup) && emptySlotLevelApplies(empty, setup)) ? "In calc" : "Inactive";
  }
  // Negative levels ("-2 Main Skill Level", Enamor; "-1 Focus Skill Level") move damage the same way (survey §4.1).
  if (/^[+-]\d+ (?:[\w' ]+ )?Skill Levels?$|^[+-]\d+ to All Skills' Levels$/i.test(text)) {
    if (!planner?.activation) return "In calc";
    const active = planner.activation.activeNames || new Set();
    const modeledKeys = new Set([...(planner.damageSources || []).filter((source) => source.status === "modeled").map((source) => source.setupKey)]);
    const auraNames = new Set((planner.aura?.entries || []).map((entry) => entry.name));
    const users = (planner.activation.setups || []).filter((setup) => setup.enabled !== false && active.has(setup.name) && (setup.name === "Scorching Beam" || modeledKeys.has(setup.setupKey) || auraNames.has(setup.name)));
    // A level the user pinned (manualAddedLevels) ignores the build's level lines.
    const pinned = (setup) => Boolean(planner.state?.skills?.skillLevels?.[setup.setupKey]?.manualAddedLevels);
    // "Support Skill Level" raises the supports installed on those skills (planner.js levels them with the same rules).
    const supportTakes = (setup) => (setup.supports || []).some((support) => support.enabled !== false && skillLevelLineApplies(text, { ...support, role: "support", tags: [...(support.tags || []), "Support"] }));
    return users.some((setup) => (!pinned(setup) && skillLevelLineApplies(text, setup)) || supportTakes(setup)) ? "In calc" : "Inactive";
  }
  return null;
}

// Combine a panel's existing status with this layer, per clause. `baseForClause`
// re-runs the panel's own check on one clause so a mixed line keeps what that
// parser already knew.
const settled = ["In calc", "Not equipped", "Not allocated", "Not selected", "Not installed", "Inactive", "Replaced by corrosion", "Planner only", "Quality of life", "Missing Blur source", "Enables base slot"];
// A modeled hit that uses the held weapon: an attack-speed attack, or a weapon-scaled hit with a fixed cadence (Erika's Precise: Thunder
// Focus; legendary audit 2026-10-22).
function weaponHitModeled(planner) {
  return (planner?.skillHits || []).some((hit) => hit.modeled && (hit.rate?.speedType === "attack-speed" || hit.profile?.weaponScaling));
}

export function refineCoverage(status, text, planner = context, baseForClause = null) {
  if (settled.includes(status)) return status;
  // A granted-core label ("[Divine Grace] Changes the base effect …" on a Belt Blend) names the effect; the clause after it is read.
  const clauses = String(text || "").split(/\r?\n|\s+\|\s+|\s+·\s+/).map((part) => part.trim().replace(/^\[[^\]]+\]\s+/, "")).filter(Boolean);
  if (!clauses.length) return status;
  const statuses = clauses.map((clause) => {
    const base = baseForClause && clauses.length > 1 ? baseForClause(clause) : null;
    if (base === "In calc") return "In calc";
    return engineLineStatus(clause, planner) ?? (base && base !== "Partly modeled" ? base : clauses.length === 1 ? status : "Not modeled");
  });
  if (!baseForClause && statuses.every((value, index) => value === (clauses.length === 1 ? status : "Not modeled") && engineLineStatus(clauses[index], planner) === null)) return status;
  return combineStatuses(statuses);
}

export function combineStatuses(statuses) {
  const list = statuses.filter(Boolean);
  if (!list.length) return "Not modeled";
  if (list.every((value) => value === "In calc" || neutralStatuses.has(value))) {
    if (list.includes("In calc")) return "In calc";
    if (list.includes("Counted in stats")) return "Counted in stats";
    if (list.includes("No DPS effect")) return "No DPS effect";
    return list[0];
  }
  if (list.every((value) => value === "Inactive" || neutralStatuses.has(value))) return "Inactive";
  if (list.some((value) => value === "In calc" || value === "Partly modeled")) return "Partly modeled";
  return "Not modeled";
}

// The resolver's entry for one line against the planner's condition state (a copy: resolving never changes the planner).
function resolveOnTheSpot(text, planner) {
  const state = planner?.lineEffects?.state;
  if (!state) return null;
  const result = resolveLineEffects([{ text, source: "coverage", origin: "talent", multiplier: 1 }], { ...state });
  return result.lines.find((entry) => entry.text === normalizePercentageText(String(text)).replace(/\s+/g, " ").trim()) || null;
}

/** A hero trait line's status from its hero's module (src/hero-trait-modules.js), or null when no module reads it. */
export function heroModuleLineStatus(heroId, text, planner = context) {
  const module = heroModuleFor(heroId, normalizePercentageText(String(text)).replace(/\s+/g, " ").trim());
  if (!module) return null;
  if (module.status === "Not modeled" || !planner?.lineEffects?.state) return module.status === "Not modeled" ? "Not modeled" : "Partly modeled";
  const result = resolveHeroModules([{ text, source: "coverage", origin: "trait", multiplier: 1 }], { ...planner.lineEffects.state, heroId });
  const entry = result.entries[0];
  if (!entry) return "Not modeled";
  if (!entry.active || entry.status !== "In calc") return entry.status;
  // A module's untyped "+X% additional damage taken" body is an enemy debuff (src/build-mechanics.js reads hero-module debuffs
  // into the DoT and beam layers; the skill-hit and Minion engines read derived taken lines), not the character's own
  // defence that the plain clause reader assumes (Selena traits batch 2026-10-13: Crimson Tide, Purgatory).
  const statuses = entry.bodies.map((body) => body.derivedText).filter(Boolean).map((body) => /^\+[\d.]+% additional damage taken$/i.test(body) ? "In calc" : clauseStatus(body, planner));
  return !statuses.length || statuses.includes("In calc") ? "In calc" : statuses.find(Boolean) || "Inactive";
}

// A granted support's clauses on the main skill: the support resolver's summary; a support none of whose clauses any rule
// reads (Raging Slash's Steep Strike chance) is Not modeled, not "No DPS effect" (residual batch P10).
function passiveGrantStatus(planner, name, level = null) {
  const auras = (planner?.activation?.setups || []).filter((setup) => setupBoardTab(setup) === "auras" && setup.enabled !== false && planner.activation.activeNames?.has(setup.name));
  if (!auras.length) return "Inactive";
  const statuses = auras.map((setup) => level == null ? grantedSupportStatus(setup.supportEffects, name) : grantedSupportStatus(resolveSupportEffects({ ...setup, supports: [{ name, level, effectiveLevel: level, enabled: true }] }, { engine: setup.supportEffects?.engine ?? null }), name));
  return statuses.includes("In calc") ? "In calc" : statuses[0];
}
function grantedSupportStatus(effects, name) {
  const summary = supportClauseSummary(effects, name);
  if (summary) return summary.status;
  const own = (effects?.clauses || []).filter((clause) => clause.support === name);
  if (own.some((clause) => clause.status === "In calc" || clause.status === "Provisional")) return "In calc";
  return own.some((clause) => clause.status === "Not modeled") || !own.length ? "Not modeled" : "No DPS effect";
}

// ---- Uncarried previews of carried-only readers (residual batch P8) --------------------------------------------------
// src/planner.js and src/build-mechanics.js note item triggers, item-granted supports and channel-stack lines only for lines
// the build carries (mechanics.recognized, checked first in clauseStatus). A line shown in a crafting or legendary preview
// (or the census) is judged here by the same readers against this build, so it reads what it would read once equipped.
const SINGLE_RING_GRANT = /^If only 1 Ring is equipped, the Main Skill is supported by (?:a )?Lv\. (\d+) ([\w' :()-]+?)\.?$/i;
const MAIN_SKILL_GRANT = /^(?:The )?Main Skill is supported by (?:a )?Lv\. (\d+) ([\w' :()-]+?)\.?$/i;
function uncarriedPreviewStatus(text, planner) {
  if (!planner?.activation) return null;
  const trigger = parseItemTrigger(text);
  if (trigger) {
    if (trigger.notOnDummy) return "Not on dummy";
    if (trigger.unmodeled) return "Not modeled";
    const skill = tlidbSkillCatalogSs13.find((entry) => entry.name === trigger.name);
    const profile = skill ? inferDamageProfile({ ...skill, name: trigger.name, role: "item-trigger", baseLevel: trigger.level, effectiveLevel: trigger.level, supports: [] }) : null;
    // A Defensive-tagged skill (Stoneskin, Reform) deals no damage (src/planner.js item triggers; gear affix audit 2026-10-22).
    if ((!profile || profile.engine !== "skill-hit") && (skill?.tags || []).includes("Defensive")) return "No DPS effect";
    if (!profile || profile.engine !== "skill-hit") return "Not modeled";
    const state = planner.lineEffects?.state || {};
    const event = itemTriggerEvent(trigger, { moving: planner.conditions?.moving, anyHit: plannerEngines(planner)?.anyHit, enemyAilments: state.enemyAilments || [], paralysis: planner.lineEffects?.combat?.debuffs?.paralysis });
    if (!event.active) return "Inactive";
    // A weapon attack fires only with a weapon that deals its damage (src/planner.js marks such triggers Inactive).
    if (profile.weaponScaling && !planner.weaponAttack?.mainHand?.weapon) return "Inactive";
    return "In calc";
  }
  const passiveGrant = text.match(PASSIVE_GRANT);
  if (passiveGrant) {
    const name = passiveGrant[2].trim().replace(/^Precise: (?=Restrain$)/, "Precise ");
    return tlidbSupportCatalogSs13.some((entry) => entry.name === name) ? passiveGrantStatus(planner, name, Number(passiveGrant[1])) : "Not modeled";
  }
  const ring = text.match(SINGLE_RING_GRANT);
  const grant = ring || text.match(MAIN_SKILL_GRANT);
  if (grant) {
    if (ring) {
      const disabled = new Set(planner.state?.disabledEquipmentSlots || []);
      const rings = (planner.equipment?.candidateItems || []).filter((item) => ["leftRing", "rightRing"].includes(item.slot) && !disabled.has(item.slot)).length;
      if (rings !== 1) return "Inactive";
    }
    const name = grant[2].trim();
    if (!tlidbSupportCatalogSs13.some((entry) => entry.name === name)) return "Not modeled";
    const main = planner.mainSkill && planner.activation.setups?.find((setup) => setup.name === planner.mainSkill.name);
    if (!main || !planner.activation.activeNames?.has(main.name)) return "Inactive";
    // Cataclysm on Scorching Beam keeps its Ignite-ledger path (src/planner.js); other grants join the main skill's supports.
    if (name === "Cataclysm" && main.name === "Scorching Beam") return "In calc";
    const profile = (planner.damageSources || []).find((source) => source.setupKey === main.setupKey)?.profile || null;
    const effects = resolveSupportEffects({ ...main, supports: [{ name, level: Number(grant[1]), effectiveLevel: Number(grant[1]), enabled: true }] }, { profile, engine: main.supportEffects?.engine ?? profile?.engine });
    return grantedSupportStatus(effects, name);
  }
  // Max / Min Channeled Stacks (src/build-mechanics.js): the main skill's channel when it channels.
  if (/^\+\d+ (?:to )?Max Channeled Stacks?$|^Min Channeled Stacks \+\d+$/i.test(text)) {
    if (!plannerEngines(planner)?.channeled) return "Inactive";
    // A higher Max with the channel held full and no per-stack line: no change (the carried note path says the same).
    const perStack = (planner.mechanics?.channel?.perStackSupercharge || 0) > 0 || (planner.modifierTexts || []).some((line) => /for every \+1 additional Max Channeled Stack|per channeled stack|every channeled stack|excess stacks? of Min Channeled Stacks/i.test(String(line.text)));
    return /^\+\d+ (?:to )?Max/i.test(text) && planner.conditions?.prebuiltSelfBuffs !== false && !perStack && plannerEngines(planner)?.beam ? "No DPS effect" : "In calc";
  }
  // Precise: Acuteness / Corrosion Focus Buffs (src/build-mechanics.js): base ailment, chance and typed additional damage reach
  // every modeled hit (the ailment needs a hit to apply).
  if (/^(?:Gains Lv\. \d+ Precise: (?:Acuteness|Corrosion) Focus Buff|Has Lv\. \d+ Precise: (?:Acuteness|Corrosion) Focus)$/i.test(text)) return plannerEngines(planner)?.anyHit ? "In calc" : "Inactive";
  // Ring-slot channel lines (src/build-mechanics.js): judged as if equipped in that ring.
  if (/^\+\d+ (?:Max|minimum|Min) Channeled Stacks when equipped in the (?:left|right) Ring slot$/i.test(text)) return plannerEngines(planner)?.beam ? "In calc" : "Inactive";
  // "+X% additional Channeled Skill Damage for every N excess stack of Min Channeled Stacks": needs start stacks above Max.
  if (/additional Channeled Skill Damage for every \d+ excess stacks? of Min Channeled Stacks$/i.test(text)) return plannerEngines(planner)?.beam && planner.mechanics?.channel?.excessStacks > 0 ? "In calc" : "Inactive";
  return null;
}
