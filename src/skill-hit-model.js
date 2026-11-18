import { enemyBuffSet } from "./unit-buff-set.js";
import { normalizePercentageText } from "./percentage-text.js";
import { passiveSupportLines, physicalConversionBlocked } from "./passive-support-lines.js";
import { critOnlyLinesFor, typedCritOnlyLinesFor, classifyCritOnlyLine } from "./crit-only-lines.js";
// W9 step 3 (src/attribute-pool-hit.js): with TLI_POOL_HIT=pool the hit's attribute reads come from the tagged attribute pool.
import { HitPool, hitPoolMode, PROJECTILE_SPEED, ATTACK_SPEED, CAST_SPEED } from "./attribute-pool-hit.js";
import { sumValues, productValues, POOL_TAG } from "./attribute-pool.js";
import { tracedConversionLines, lineKeyOf } from "./attribute-pool-build.js";
import { luckyRollFraction } from "./lucky-damage.js";
import { wholePercentRoll } from "./whole-percent-roll.js";
import { finisherAmplificationPercent, CONSUMED_COMBO_POINTS, comboPointState, comboExtraState, expectedConsumedWithCritPoints, finisherConsumedPoints, finisherChargeInstances, MAX_COMBO_POINTS_DEFAULT, comboCountFromPoints } from "./combo-points.js";
import { doubleDamageForSkill } from "./double-damage.js";
import { skillLevelDamageMultiplier } from "./engine.js";
import { supportEffectsFor, projectileQuantityFalloff, allElementalState, movementChargeShare, BASE_PLAYER_MOVE_SPEED } from "./support-effects.js";
import { setupEventTagIds, skillTagsWithSupportChanges } from "./support-compatibility.js";
import { lineTriggerRows, rowTagsFit } from "./trigger-rows.js";
import { maxSpellBurstTotal } from "./max-spell-burst.js";
import { shotgunVolley, shotgunVolleyText } from "./shotgun-effect.js";
import { level85DummyDefenses, armourMitigationPercent } from "./target-hit-mitigation.js";
import { classifyHitLine, splitHitLineText, scopeApplies, scopeLabel, ELEMENTAL_TYPES } from "./skill-hit-lines.js";
import { skillHitBaseAtLevel, skillHitTiming } from "./skill-hit-profiles.js";
import { castSpeedScaledTriggerInterval } from "./trigger-interval.js";
import { SOLID_RIVER_DAMAGE_LINE } from "./activation-medium-events.js";
import { frameSnap as snapToFrames } from "./frame-snapping.js";
import { BASE_CRITICAL_DAMAGE_PERCENT } from "./game-attribute-defaults.js";
import { damageTypeRestriction, restrictionLine, removesType } from "./damage-type-restriction.js";
import { trinityState, trinityFactors, trinityLine } from "./trinity.js";
import { anyHitRecipeMode, hitRecipeReader, hitLineFromFacts, pickHitReading } from "./recipe-hit-layers.js";
import { critCacheFor, cachedCritChecksPerUse } from "./crit-cache.js";
// Skill-mechanics census batch 5 (B3, 2026-10-28): support hit-count and cadence changes edit a copy of the profile.
import { applyBatch5ProfileEdits } from "./support-hit-count-batch5.js";
// Census batch 6 (src/minion-sentry-batch6.js): Sentry skill supports and own text, Scorching Pulse's Flame Core retrigger.
import { applyBatch6SentryEdits } from "./minion-sentry-batch6.js";
import { applyFocusSpeed } from "./focus-speed.js";
import { reboundState } from "./ice-lances-rebound.js";
import { maxChanneledStacksLine } from "./channeled-stack-lines.js";
import { SPELL_BURST_USE_GAIN, spellBurstUseGainLines, spellBurstRefillWalk } from "./spell-burst-refill.js";

// Generic spell-hit engine (profile kind "hit", engine "skill-hit"; src/skill-hit-profiles.js).
//
// Per hit component (one per typed entry of each hit group the profile lists, plus one per added-flat type):
//   hit = (base roll + added flat × effectiveness) × (1 + Σ increased) × Π(1 + additional) × crit factor
//         × Π(1 + damage taken) × armour × (1 − (resistance − penetration))
// scoped by the component's damage type and the skill's tags (src/skill-hit-lines.js). The skill-level
// bonus past Lv.20 is an additional-damage line (reference data Skill Level), the setup's supports read their
// progression tables, Magnificent/Noble supports add their star bonus, Aim's Projectile/Beam line applies to
// Beam / Projectile skills at its uptime, Terra skills add their Terra Charge line, and the main stat follows the
// Scorching Beam hit ledger's observed 0.5% additional damage per Intelligence point (Intelligence skills
// only; Strength / Dexterity have no modeled rule yet). Hits crit (expected factor from the planner's spell
// crit totals).
//
// Use rate: game use time (speed type "cast-speed" ÷ the planner's cast-speed factor; "fixed" unscaled),
// capped by cooldown ÷ charges after Cooldown Recovery Speed; a Terra skill is recast when its ground effect
// expires (uses/s = 1 / duration, best case continuous uptime); a Combo skill uses its cycle time. Hits per use
// come from each component: a number, or a tick spec (perTick × duration ÷ effective interval × shotgun falloff).
// DoT components are not computed here: src/skill-hit-profiles.js `skillHitDotComponents` turns them into
// skill-DoT profiles the planner feeds to src/skill-dot-model.js.
//
// Town figure: the character panel's skill DPS is assumed to be the average hit (with crit) × hits per use ×
// uses per second with the town layers only (no target armour / resistance, no damage taken, no Aim / combat
// lines). This formula is a hypothesis to confirm against an in-game panel.

const number = (value) => Number(String(value).replace("−", "-"));
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const product = (lines) => lines.reduce((factor, line) => factor * (1 + line.value / 100), 1);
const sum = (lines) => lines.reduce((total, line) => total + line.value, 0);

// Spell Burst full charge time (game manual, pasted by the user 2026-10-12): "Full Spell Burst Charge Restoration Time = 2 /
// (100 + Spell Burst Charge Speed)% x (100 + additional Spell Burst Charge Speed 1)% x (100 + additional Spell Burst Charge
// Speed 2)%…", i.e. 2 s ÷ (1 + Σ increased) ÷ Π(1 + additional) (user-confirmed 2026-10-12: additional Charge Speed
// shortens the charge time). Reads "+X% Spell Burst Charge Speed" and "±X% additional
// Spell Burst Charge Speed" lines from every source (gear, talents, slates, pacts, supports, memories); Minion lines and
// conditional ones (buffs, per stack, "for every") do not match and are not read.
export const SPELL_BURST_BASE_CHARGE_SECONDS = 2;
// "+X% [additional] Attack Speed when performing Multistrikes" (Bladerunner talent; read per skill in calculateSkillHit).
export const MULTISTRIKE_SPEED_LINE = /^([+-]?\d+(?:\.\d+)?)\s?% (additional )?Attack Speed when performing Multistrikes$/i;
// Core audit batch B6 (research/core-talents-audit-2026-10-18.md §4.4): Unstoppable Force, Play Safe's Cast Speed → Spell Burst
// Charge Speed and Spell Ripple's Pulse (read in calculateSkillHit).
// Sentry timing lines (census item #13): game recipes 327769 and 857570.
export const SENTRY_IDLE_LINE = /^\+?([+-]?\d+(?:\.\d+)?)% additional Sentry Damage if Sentry Skill is not used in the last (\d+(?:\.\d+)?) ?s$/i;
export const SENTRY_START_LINE = /^([+-]?\d+(?:\.\d+)?)% additional Sentry Start Time(?: for the supported skill)?$/i;
const SENTRY_LINE_SPLIT = /\r?\n| \| /;
// Shadow of Thunderlight's Fury (game recipe 12617).
export const FURY_LUCKY_LINE = /^Damage becomes Lucky and at least (\d+) stack\(s\) of Spell Burst Charge is consumed when Spell Burst is activated$/i;
export const UNSTOPPABLE_FORCE_LINE = /^When a Combo Finisher is in Multistrike, it is guaranteed to deal damage equal to the Max Multistrike Count$/i;
export const CAST_SPEED_TO_CHARGE_LINE = /^(\d+(?:\.\d+)?)% of the bonuses and additional bonuses to Cast Speed is also applied to Spell Burst Charge Speed$/i;
// Sweeping Fury (Ethereal Prism core; game affix 19348734) and its Projectile Quantity cap (555436864 / 101080025).
// The planner's own Bard line (src/selena-tide.js hitLines): the one Channeled line a Bard Song bubble does not take.
const BARD_STATE_LINE = /^Selena: Bard state/;
export const SWEEPING_FURY_LINE = /^On hit, Main Ranged Horizontal Projectile Skills have a (\d+(?:\.\d+)?)% chance to cast an additional Main Skill, whose projectiles fire in a ring and deal ([+-]\d+(?:\.\d+)?)% additional damage\. Interval: (\d+(?:\.\d+)?)\s?s\.?(?: Does not affect Sentry Skills, Vertical Skills, and Channeled Skills\.?)?$/i;
export const PROJECTILE_QUANTITY_LIMIT_LINE = /^Projectile Quantity Upper limit: (\d+)$/i;
// The Mobility attacks' own line (chunk 9): recipe 811059904 [75, 60] on stones 1020, 1260, 2170, 2180, 2210: node 114 from attr 41 mod 3, the increased Movement
// Speed, × 75% into additional Attack Speed on this skill, up to +60%. Chunk 8 read the same record on Rumbling Thunder and Wrathful Vault.
export const MOVEMENT_ATTACK_SPEED_SKILLS = new Set(["Leap Attack", "Rocket Jump", "Blink Arrow", "Swift Shadow Raid", "Spiral Strike"]);
const MOVEMENT_ATTACK_SPEED = Object.freeze({ sharePercent: 75, capPercent: 60 });
export const SPELL_RIPPLE_LINE = /^Main Spell Skills on hit have a (\d+(?:\.\d+)?)% chance to spawn a Pulse, dealing True Damage equal to (\d+(?:\.\d+)?)% of Hit Damage\. Interval: (\d+(?:\.\d+)?)\s?s$/i;
export const SPELL_BURST_CHARGE_PATTERN =/^([+-]?\d+(?:\.\d+)?)\s?% (additional )?Spell Burst Charge Speed$/i;
// Fifth Cosmic Velocity (hero trait audit B4): Spell Burst Charge stacks gained on an interval.
export const SPELL_BURST_INTERVAL_GAIN = /^(\d+(?:\.\d+)?)% chance to immediately gain (\d+) stack\(s\) of Spell Burst Charge\. Interval: (\d+(?:\.\d+)?) ?s$/i;
export function spellBurstChargeTime(lines = []) {
  const sources = [];
  let increasedPercent = 0, additionalFactor = 1;
  for (const line of lines) {
    const match = String(line?.text ?? "").match(SPELL_BURST_CHARGE_PATTERN);
    if (!match) continue;
    const value = Number(match[1]) * (line.multiplier ?? 1);
    if (match[2]) additionalFactor *= 1 + value / 100; else increasedPercent += value;
    sources.push({ source: line.source ?? null, text: line.text, value, additional: Boolean(match[2]) });
  }
  const divisor = (1 + increasedPercent / 100) * additionalFactor;
  return { seconds: divisor > 0 ? SPELL_BURST_BASE_CHARGE_SECONDS / divisor : Infinity, increasedPercent, additionalFactor, sources };
}
const round = (value) => Math.round(value * 10000) / 10000;
// Also the gear wording "+N Parabolic Projectile Split Quantity" (craft / base affixes; gear affix audit 2026-10-22, read as the
// same stat).
const PARABOLIC_SPLIT_LINE = /^\+(\d+(?:\.\d+)?) (?:to )?Parabolic Projectile Splits? quantity$/i;
export const MAIN_SPELL_REPEAT_LINE = /^\+(\d+(?:\.\d+)?)% chance to trigger the Main Spell Skill 1 additional time when using it$/i;
const lineText = (line) => normalizePercentageText(String(line?.text ?? "")).replace(/\s+/g, " ").trim();
// "Adds X% of <A> Damage as <B> Damage during Multistrike" (gear; game recipe 424512480: attr 5130 on {Multistriking 4000810, Attack 6001090};
// condition-unread batch 3), read per skill below from its Multistrike sequence.
const DURING_MULTISTRIKE_ADDED_AS = /^Adds (\d+(?:\.\d+)?)% of (Physical|Fire|Cold|Lightning|Erosion) Damage as (Physical|Fire|Cold|Lightning|Erosion) Damage during Multistrike$/i;

// Gear affix batch B (2026-10-22; research/gear-affixes-audit-2026-10-22.md §8).
// Shadows. Game manual 1001010820: "Casting a Shadow Strike Skill can summon multiple Shadows to attack. Each Shadow attacks an
// enemy within the Tracking Area 1 time. Shadows use the same Attack Skills as the player. The default number of Shadows is 0";
// 1001010821: "Shadows deal the same amount of damage as the player, but if multiple Shadows hit the same enemy at the same time,
// the damage from each Shadow beyond the first one will additionally" −70%; reference data Phantom (game hyperlink 136): "If no other
// targets are present, it will strike the character's target … the Shadows' Shotgun Effect falloff coefficient is 70% … Shadow
// damage and character damage are independent of each other". Client (research/oq-shadows-seal-client-2026-11-05.md §1): every
// Shadow Strike Split's Shadow part has its own hit rule (brother group 1, falloff table [(1, 30)]; Frost Spike 606237, Wilt Spike
// 155317, Thunder Spike 471623, Double Thrusts 157350), and the repeat multiplier (SS14 0x1423e3d40) keeps the table value: the
// first Shadow deals 100%, each further one 30% (the texts' 70% is the share lost); the player's thrust (group −1) is not counted.
// User-confirmed 2026-11-05 (Lv.85 dummy, 20 s, Thunder Spike Lv16): without Haunt 295 average, with Haunt (+2 Shadows) 659,
// ×2.234 against ×2.30 at 30% and ×2.70 at 70% (tests/shadows-user-test-2026-11-05.test.js). So on the one dummy each use adds
// the use's hits again × (1 + 30% × (Shadows − 1)), as their own hits. Shadow Quantity: "Shadow Quantity +N"
// (game field 2012000), Haunt's "+2 Shadow Quantity for the supported skill", a skill's own (`ownShadowQuantity`, Wilt Spike).
// "+X% additional Shadow Damage" (game affix 24304: attr 5719 additional with the Shadows tag 6020014) reaches the Shadows only.
/**
 * The Auras' Melee-scoped lines (gear-pact batch G4; game-data aura records, src/data/skills/aura-scaling-ss13.js) for a skill with these tags:
 * Fearless "+X% Critical Strike Rating for Melee Skills" (record 538865344: attr 4802 on the Melee tag 6001120) and Precise: Fearless "+X%
 * Melee Attack Speed" (record 707968: attr 6001 mod 3; its write carries no tag, the text names Melee: read on Melee attack-speed skills),
 * each as a support line of the same kind. Also read for a trigger skill's own use time (src/vendetta-model.js, the 9 T Double Thrusts follow-up).
 */
export function auraTagLines(auraEntries = [], scopeTags = new Set(), speedType = "cast-speed") {
  const speed = [], crit = [];
  if (!scopeTags.has("Melee")) return { speed, crit };
  for (const entry of auraEntries) {
    const effects = entry.effectiveEffects || {};
    if (effects.meleeAttackSpeedPercent && speedType === "attack-speed") speed.push({ source: `Aura: ${entry.name} / Melee Attack Speed`, text: `+${round(effects.meleeAttackSpeedPercent)}% Melee Attack Speed`, value: effects.meleeAttackSpeedPercent, additional: false });
    if (effects.meleeCriticalStrikeRatingPercent) crit.push({ kind: "ratingPercent", source: `Aura: ${entry.name} / Melee Critical Strike Rating`, text: `+${round(effects.meleeCriticalStrikeRatingPercent)}% Critical Strike Rating for Melee Skills`, value: effects.meleeCriticalStrikeRatingPercent });
  }
  return { speed, crit };
}

export const SHADOW_FALLOFF = 0.3;
export const SHADOW_QUANTITY_LINE = /^(?:Shadow Quantity \+(\d+)|\+(\d+) (?:to )?Shadow Quantity)$/i;
export const SHADOW_DAMAGE_LINE = /^([+-]?\d+(?:\.\d+)?)% additional Shadow Damage$/i;
export function shadowState({ profile = null, modifierTexts = [], supportClauses = [] } = {}) {
  const sources = [];
  for (const line of modifierTexts) { const match = lineText(line).match(SHADOW_QUANTITY_LINE); if (match) sources.push({ source: line.source, text: lineText(line), value: Number(match[1] ?? match[2]) * (line.multiplier ?? 1) }); }
  for (const clause of supportClauses) if (clause.family === "shadow" && clause.value) sources.push({ source: clause.source, text: clause.text, value: clause.value });
  if (profile?.ownShadowQuantity?.value) sources.push({ source: `${profile.name}: skill text`, text: profile.ownShadowQuantity.text, value: profile.ownShadowQuantity.value });
  const count = Math.max(0, Math.floor(sources.reduce((total, item) => total + item.value, 0)));
  const damage = modifierTexts.flatMap((line) => { const match = lineText(line).match(SHADOW_DAMAGE_LINE); return match ? [{ source: line.source, text: `${lineText(line)} (Shadows' hits only: game tag 6020014)`, value: Number(match[1]) * (line.multiplier ?? 1) }] : []; });
  // Support lines on the Shadows (Phantoms) only (census batch 4: Frost Spike: Ice Fission vs a Frozen dummy; src/support-conditional-batch4.js).
  for (const clause of supportClauses) if (clause.active && ["In calc", "Provisional"].includes(clause.status)) for (const part of clause.shadowParts || []) if (part.value) damage.push({ source: clause.source, text: `${clause.text} — ${clause.conditionText} (Shadows' hits only: game tag 6020014)`, value: part.value });
  // Despised Shadow (legendary audit batch 7): "33% chance to gain +3 Shadows when using the Shadow Strike skill": the expected
  // repetition weight over the chances (each line independent; provisional).
  const weightOf = (value) => (value > 0 ? 1 + SHADOW_FALLOFF * (value - 1) : 0);
  const chances = modifierTexts.flatMap((line) => { const match = lineText(line).match(SHADOW_CHANCE_LINE); return match ? [{ source: line.source, text: lineText(line), chance: Math.min(1, Number(match[1]) * (line.multiplier ?? 1) / 100), extra: Number(match[2]) }] : []; });
  let weight = 0;
  for (let mask = 0; mask < 1 << chances.length; mask += 1) {
    let probability = 1, extra = 0;
    chances.forEach((item, index) => { if (mask & (1 << index)) { probability *= item.chance; extra += item.extra; } else probability *= 1 - item.chance; });
    weight += probability * weightOf(count + extra);
  }
  const expectedCount = count + chances.reduce((total, item) => total + item.chance * item.extra, 0);
  return { count, expectedCount, chances, weight: chances.length ? weight : weightOf(count), sources, damage };
}
/**
 * Double Thrusts: Recourse (Noble) (record 801293952; 9 T Double Thrusts audit G4, 2026-11-13) as an expected additional term on the Shadows'
 * hits. User decisions 2026-11-13: (a) every landing hit of the skill adds a stack (row 1, trigger 1000033 on this skill): each use lands its
 * thrusts and N Shadow hits per thrust (stacks count landing hits, not the Shadows' 1 + 30% × (N − 1) damage weight), so a Shadow is
 * N / (1 + N) of the landings; (b) the bonus is the support's rolled value (741% at T0), not row 3's constant 1000. Inferred: row 3
 * (trigger 1000031 on [this skill, Shadow, Hit]) reads the stacks after the hit's own (row 1 first), so a detonation needs `threshold`
 * stacks and then the next Shadow hit: a cycle of threshold + q ÷ (1 − q) landings, q = 1 ÷ (1 + N) the thrusts' share (geometric wait,
 * order within a use not traced); the detonating Shadow takes the Shadows' mean falloff share (the +X% multiplies that hit as dealt);
 * the stacks never expire between uses (buff 10832's duration not read). Per Shadow landing: X × ((1 + N) ÷ N) ÷ cycle.
 */
export function recourseShadowLine(clause, shadowCount) {
  const n = Number(shadowCount) || 0, threshold = Number(clause?.threshold) || 0, value = Number(clause?.value) || 0;
  if (!(n > 0) || !(threshold > 0) || !value) return null;
  const cycle = threshold + 1 / n;
  const percent = value * ((1 + n) / n) / cycle;
  return { source: clause.source, text: `+${Math.round(percent * 10000) / 10000}% additional Shadow Damage on average: +${value}% on one Shadow hit every ${Math.round(cycle * 10000) / 10000} landings (${threshold} stacks, a stack per landing hit, the thrusts and ${Math.round(n * 100) / 100} Shadows per thrust; Double Thrusts: Recourse, record 801293952; provisional)`, value: percent, recourse: { cycleLandings: cycle, shadowShare: n / (1 + n), detonationsPerShadowLanding: (1 + n) / n / cycle } };
}
export const SHADOW_CHANCE_LINE = /^(\d+(?:\.\d+)?) ?% chance to gain \+(\d+) Shadows when using the Shadow Strike skill$/i;
// Barrage waves (manual 1001011421: "The number of repetitions of the effect created by a Barrage Skill, including the initial
// casting, is referred to as the skill's Barrage Waves"). "+X% chance to +1 to Barrage Skill Total Waves when casting a Barrage
// Skill" (game affix 469039: field 2013001 on the Barrage tag 6000390; the lines sum into one chance) adds min(1, ΣX%) expected
// waves per cast. "Barrage Skills +X% damage increase per wave" (368511: field 2501029, Barrage tag) and Carpet Bombardment's
// "The supported skill +X% damage increase per wave" (same field): provisional reading, wave k (the first is 0) deals
// (1 + k × ΣX%), so a cast averages 1 + ΣX% × (waves − 1) ÷ 2 per wave (no game text gives the per-wave formula).
export const BARRAGE_WAVE_CHANCE_LINE = /^\+?(\d+(?:\.\d+)?)% chance to \+1 to Barrage Skill Total Waves when casting a Barrage Skill$/i;
export const BARRAGE_PER_WAVE_LINE = /^Barrage Skills \+?(-?\d+(?:\.\d+)?)% damage increase per wave$/i;
export function barrageWaveState({ modifierTexts = [], supportClauses = [] } = {}) {
  const chance = [], perWave = [];
  for (const line of modifierTexts) {
    const text = lineText(line);
    let match = text.match(BARRAGE_WAVE_CHANCE_LINE);
    if (match) { chance.push({ source: line.source, text, value: Number(match[1]) * (line.multiplier ?? 1) }); continue; }
    match = text.match(BARRAGE_PER_WAVE_LINE);
    if (match) perWave.push({ source: line.source, text, value: Number(match[1]) * (line.multiplier ?? 1) });
  }
  for (const clause of supportClauses) if (clause.family === "barrage" && clause.kind === "perWave" && clause.value) perWave.push({ source: clause.source, text: clause.text, value: clause.value });
  // The same field behind a held-weapon condition (census batch 4: Inexhaustible Barrage: Bombard with a cannon; src/support-conditional-batch4.js).
  for (const clause of supportClauses) if (clause.barragePerWave && clause.active && ["In calc", "Provisional"].includes(clause.status)) perWave.push({ source: clause.source, text: `${clause.text} — ${clause.conditionText}`, value: clause.barragePerWave });
  const extraWaves = Math.min(1, chance.reduce((total, item) => total + item.value, 0) / 100);
  const perWavePercent = perWave.reduce((total, item) => total + item.value, 0);
  return { extraWaves, perWavePercent, chance, perWave, active: extraWaves > 0 || perWavePercent !== 0 };
}
// The average per-wave factor of a cast of `waves` waves plus a fractional extra wave (`extra` expected).
export function barrageAverageFactor(waves, extra, perWavePercent) {
  const step = perWavePercent / 100;
  const total = waves + step * waves * (waves - 1) / 2 + extra * (1 + step * waves);
  return waves + extra > 0 ? total / (waves + extra) : 1;
}
// "+X% chance to immediately gain N stack(s) of Spell Burst Charge when using a skill. Interval: 0.03s" (game affix 32278: trigger 1000074,
// chance P1, cooldown 0.03 s, +P2 to resource 11, Spell Burst Charge): src/spell-burst-refill.js (every use of yours rolls it, a 30 Hz walk
// of the charge; 15 T Chain Lightning audit G1, 2026-11-18).
export { SPELL_BURST_USE_GAIN };
// "+X% additional skill damage when Demolisher Charge is consumed" (game affix 175116: on Demolisher Charge consumed (trigger
// 1001300, tag 6010010), additional damage for that skill use): every hit of a use that consumes a charge. Components that only
// land on such uses (`demolisher.gated`) take it in full; the others at the profile's Demolisher share of uses.
// Steel Stagnation / Broken Sun Ring's roll (legendary audit batch 8): "+40% additional Area Damage for this skill when Demolisher
// Charge is consumed." reads the same way (the Demolisher skills are Area skills; provisional).
export const DEMOLISHER_CONSUMED_LINE = /^\+?(-?\d+(?:\.\d+)?)% additional (?:skill damage|Area Damage for this skill) when Demolisher Charge is consumed\.?$/i;
const average = (range) => (range.min + range.max) / 2;
// Per-hand ranges of an alternate dual-wield component (src/skill-hit-profiles.js), scaled with the component's own share.
const scaleHands = (hands, share) => hands ? hands.map((hand) => ({ ...hand, min: hand.min * share, max: hand.max * share })) : hands;
// Joined Force's off-hand share inside a weapon component (G3), scaled with the component through conversions.
const scaleJoined = (component, share) => component.joinedShare ? { joinedShare: { min: component.joinedShare.min * share, max: component.joinedShare.max * share } } : {};

const signedText = (value) => `${value >= 0 ? "+" : ""}${value}`;
const cap = (word) => String(word || "").charAt(0).toUpperCase() + String(word || "").slice(1).toLowerCase();
// Manual "Conversion of the Type of Damage Dealt": lower to higher only, in this order.
const CONVERSION_ORDER = ["Physical", "Lightning", "Cold", "Fire", "Erosion"];
const UNMODELED_WARNING_SKIP = /Minion|Ailment|Ignite|Trauma|Wilt|Over Time|Cursed|Numbed|Skill Area/i;

// Supports on the setup, read from the shared resolver (src/support-effects.js): leveled reference data progression values
// at the effective level (a,b pairs and a/b fractions), fixed base lines, Magnificent / Noble star bonuses and rolled
// affixes. Each additional line keeps its own multiplier (the star bonus and the roll of one support are two lines).
export function supportLayers(setup, { dealtTypes, skillTags, profile, speedType }) {
  const effects = supportEffectsFor(setup, { profile, engine: "skill-hit", dealtTypes, tags: [...skillTags], speedType, channeled: Boolean(profile?.useModel && /channel/.test(profile.useModel.kind || "")) });
  const additional = [], increased = [], critOnlyAdditional = [], added = [], castSpeed = [], castFrequency = [], critRating = [], conversion = [], addedAs = [], cooldown = [], unmodeled = [], notes = [], maxStacks = [];
  const attack = speedType === "attack-speed";
  const suffix = (line) => line.origin === "leveled" ? ` (Lv.${line.level})` : line.origin === "roll" ? ` (T${line.tier ?? "?"} roll)` : line.origin === "fixed" ? " (fixed)" : "";
  const typedApplies = (typed) => ELEMENTAL_TYPES.includes(typed) || ["Physical", "Erosion"].includes(typed) ? dealtTypes.includes(typed) : typed === "Elemental" ? dealtTypes.some((type) => ELEMENTAL_TYPES.includes(type)) : typed === "Hit" || typed === "Spell" || skillTags.has(typed);
  for (const line of effects.additional) {
    if (line.origin === "star") { if (line.value) additional.push({ source: line.source, text: `+${line.value}% additional damage (${line.stars ?? "?"}★ star bonus)`, value: line.value, category: "Additional damage" }); continue; }
    if (!line.typed) { additional.push({ source: line.source, text: `${signedText(line.value)}% additional damage for the supported skill${suffix(line)}`, value: line.value, category: "Additional damage" }); continue; }
    if (typedApplies(line.typed)) additional.push({ source: line.source, text: `${signedText(line.value)}% additional ${line.typed} Damage for the supported skill${suffix(line)}`, value: line.value, category: "Additional damage", scopeTypes: line.typed === "Elemental" ? [...ELEMENTAL_TYPES] : ["Physical", "Fire", "Cold", "Lightning", "Erosion"].includes(line.typed) ? [line.typed] : null });
    else notes.push(`${line.support}: "${line.text}" does not reach this skill's ${dealtTypes.join("/")} hits.`);
  }
  // Conditional lines resolved from the planner's state (src/support-effects.js resolveCondition): cursed / Numbed /
  // ailment-type count / one enemy / weapon type / standing still or moving / distance. Unresolved (no state) adds nothing.
  // Lines for triggered uses only (Rhythm's movement bonus) wait for the trigger model below.
  const triggeredAdditional = [];
  for (const line of effects.conditionalAdditional.filter((item) => item.active && item.appliedValue && item.triggeredOnly)) triggeredAdditional.push({ source: line.source, text: `${line.text}${suffix(line)} — ${line.conditionText}`, value: line.appliedValue, category: "Additional damage", condition: line.conditionText });
  // Activation Medium triggers on the dummy (src/support-effects.js statuses): interval, always and Boss / Elite mediums.
  const triggers = effects.trigger.filter((item) => ["interval", "target", "maxMultistrike", "amEvent"].includes(item.kind) && item.status !== "Inactive" && item.status !== "Not modeled");
  const castSpeedShare = effects.triggerDetail.find((item) => item.kind === "castSpeedShare")?.share ?? null;
  const manualPenalty = effects.manualPenalty.map((line) => ({ source: line.source, text: `${line.text} (the skill is used, not triggered)`, value: line.value, category: "Additional damage" }));
  for (const line of effects.conditionalAdditional.filter((item) => item.active && item.appliedValue && !item.triggeredOnly)) additional.push({ source: line.source, text: `${line.text}${suffix(line)} — ${line.conditionText}`, value: line.appliedValue, category: "Additional damage", condition: line.conditionText });
  // Passivation on hits: "up to +X% additional <Type> Damage" vs enemies with more Life, full value (best case; the
  // dummy's Life share is not tracked: provisional), on components of that type.
  for (const clause of effects.clauses.filter((item) => item.family === "conditionalTyped" && dealtTypes.includes(item.typed) && item.value)) additional.push({ source: clause.source, text: `up to +${clause.value}% additional ${clause.typed} Damage vs enemies with more Life${suffix(clause)} (full value assumed; provisional)`, value: clause.value, category: "Additional damage", scopeTypes: [clause.typed] });
  // "+X% additional damage for the supported skill for each stack of Focus Blessing" (Overload): × the planner's Focus
  // Blessing stacks (blessing model); 0 stacks (Provisional) when the setup was resolved without a stack count.
  for (const line of effects.perStack.filter((item) => item.stackSource === "focusBlessing" && item.appliedValue)) additional.push({ source: line.source, text: `+${line.value}% additional damage for the supported skill × ${line.stacks} Focus Blessing stacks${suffix(line)}`, value: line.appliedValue, category: "Additional damage" });
  for (const line of effects.increased.filter((item) => item.status === "In calc")) increased.push({ source: line.source, text: `${line.text}${suffix(line)}`, value: line.value, category: "Increased damage", scope: { damageTypes: line.scope?.damageTypes ? new Set(line.scope.damageTypes) : null, skillTags: line.scope?.skillTags ? new Set(line.scope.skillTags) : null, hitOnly: Boolean(line.scope?.hitOnly) } });
  for (const line of effects.critOnlyAdditional) critOnlyAdditional.push({ source: line.source, text: `${signedText(line.value)}% additional damage on Critical Strikes${suffix(line)}`, value: line.value, category: "Additional damage (crits only)" });
  for (const line of effects.added) added.push({ source: line.source, text: `Adds ${line.min}–${line.max} ${line.type} Damage to the supported skill${suffix(line)}`, type: line.type, min: line.min, max: line.max });
  for (const line of effects.speed) {
    const wording = line.kind === "both" ? "Attack and Cast Speed" : line.kind === "attack" ? "Attack Speed" : line.kind === "cast" ? "Cast Speed" : "Cast Frequency for Sentries";
    const entry = { source: line.source, text: `${signedText(line.value)}% ${line.additional ? "additional " : ""}${wording}${suffix(line)}`, value: line.value, additional: line.additional };
    if (line.kind === "castFrequency") { castFrequency.push(entry); continue; }
    if ((line.kind === "attack" && !attack) || (line.kind === "cast" && attack)) continue;
    // Quick Decision's additional speed is already in the planner's cast-speed total for spells (src/scorching-beam-cast-rate.js
    // reads it per setup); attacks use the weapon's Attack Speed, which never included it (B3), so it applies here.
    if (line.kind === "both" && line.additional && line.support === "Quick Decision" && !attack) continue;
    castSpeed.push(entry);
  }
  for (const line of effects.crit) critRating.push({ source: line.source, text: `${line.kind === "ratingFlat" ? signedText(line.value) : `${signedText(line.value)}%`} ${line.kind === "ratingAdditional" ? "additional " : ""}Critical Strike Rating${suffix(line)}`, value: line.value, kind: line.kind });
  for (const line of effects.conversion) conversion.push({ source: line.source, text: line.text, from: cap(line.from), to: cap(line.to), percent: line.percent });
  for (const line of effects.addedAs) addedAs.push({ source: line.source, text: `${line.text}${suffix(line)}`, from: cap(line.from), to: cap(line.to), percent: line.percent });
  for (const line of effects.cooldown) cooldown.push({ source: line.source, text: `${signedText(line.value)}% ${line.additional ? "additional " : ""}Cooldown Recovery Speed${suffix(line)}`, value: line.value, additional: line.additional });
  // "+N Max Channeled Stacks for the supported skill" (Channeled Depths +2, Immolate +13): the same reading as
  // src/build-mechanics.js for the Scorching Beam channel.
  for (const line of effects.channel.max) maxStacks.push({ source: line.source, text: `+${line.value} Max Channeled Stacks`, value: line.value });
  for (const clause of effects.clauses) if (clause.status === "Not modeled" && /[Dd]amage/.test(clause.text) && !UNMODELED_WARNING_SKIP.test(clause.text)) unmodeled.push({ source: clause.source, text: clause.text });
  return { additional, increased, critOnlyAdditional, added, castSpeed, castFrequency, critRating, conversion, addedAs, cooldown, unmodeled, notes, maxStacks, triggers, castSpeedShare, manualPenalty, triggeredAdditional, effects };
}

// Channeled-skill lines the shared classifier does not parse (the same templates src/build-mechanics.js reads for
// the Scorching Beam channel): increased damage for Channeled Skills, per-additional-max-stack damage, and the
// max-stack lines themselves. Returns null for anything else.
const CHANNEL_INCREASED = /^\+(\d+(?:\.\d+)?)% damage for Channeled Skills$/i;
const CHANNEL_PER_STACK_INCREASED = /^\+(\d+(?:\.\d+)?)% damage for every \+1 additional Max Channeled Stack\(s\)$/i;
const CHANNEL_PER_STACK_ADDITIONAL = /^\+(\d+(?:\.\d+)?)% additional damage for every \+(\d+) additional Max Channeled Stack\(s\)$/i;
const CHANNEL_MAX_STACKS = /^\+(\d+) (?:to )?Max Channeled Stacks?$/i;
function classifyChannelLine(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  let match = clean.match(CHANNEL_INCREASED);
  if (match) return { kind: "increased", value: number(match[1]) };
  match = clean.match(CHANNEL_PER_STACK_INCREASED);
  if (match) return { kind: "perStackIncreased", value: number(match[1]), per: 1 };
  match = clean.match(CHANNEL_PER_STACK_ADDITIONAL);
  if (match) return { kind: "perStackAdditional", value: number(match[1]), per: number(match[2]) };
  match = clean.match(CHANNEL_MAX_STACKS);
  if (match) return { kind: "maxStacks", value: number(match[1]) };
  return null;
}

// Sentry Cast Frequency lines (sentry batch, 2026-10-12). Manual rule 1001011724: "The speed at which Sentries use skills is
// controlled by Cast Frequency and not Attack or Cast Speed. It is calculated in the same way as Attack and Cast Speed."
// Plain lines ("+X% Sentry Skill cast frequency", "+X% additional Sentry Skill Cast Frequency") are read; conditional
// wordings (no Sentries Nearby, per Sentry Skill used recently, per Numbed enemy, per Chaos point) are listed as not read.
const SENTRY_CAST_FREQUENCY = /^([+-]?\d+(?:\.\d+)?)% (additional )?Sentry(?: Skill)? [Cc]ast [Ff]requency$/i;
const SENTRY_CAST_FREQUENCY_ANY = /Sentr(?:y|ies)[^.]*[Cc]ast [Ff]requency|[Cc]ast [Ff]requency[^.]*Sentr(?:y|ies)/i;
export function classifySentryLine(text) {
  const clean = String(text || "").replace(/\s*%/g, "%").replace(/\+\s+/g, "+").replace(/\s+/g, " ").trim();
  const match = clean.match(SENTRY_CAST_FREQUENCY);
  if (match) return { kind: "castFrequency", value: number(match[1]), additional: Boolean(match[2]) };
  if (SENTRY_CAST_FREQUENCY_ANY.test(clean)) return { kind: "castFrequency", conditional: true };
  return null;
}

// Shotgun Effect (src/shotgun-effect.js): of a volley of n, `reach` decides how many land on the dummy (a fan: all
// standing close, one at range; "all" otherwise), and they total 1 + factor × (landed − 1), factor the share each later hit keeps
// (client repeat multiplier, user decision 2026-11-05: the hit rule's repeatDmgDecPercent table). Replaces the compounding Σ factor^i used before.
// `fanLandsAll` (Banishment: Tangle, src/tangle-model.js tangleHitEffects): a Tangle-fired cast from a Minion lands every
// projectile of a fan on the dummy (best case, user statement 2026-11-03: more land than from the player); the falloff stays.
const fanReach = (reach, fanLandsAll) => fanLandsAll && reach === "fan" ? "all" : reach;
// `landed`: the user's projectile landing count (combat.projectileHits), read only by a volley the profile marks `projectile: true`.
const falloffVolley = (falloff, nearTarget, fanLandsAll = false, landed = null) => falloff ? shotgunVolley(fanLandsAll && falloff.reach === "fan" ? { ...falloff, reach: "all" } : falloff, { nearTarget, landed: falloff.projectile ? landed : null }) : null;

// One Multistrike sequence (Attack skills). Game manual (config_multi_language_en, sourced): 1001020124 "Multistrike Chance is
// 0 by default. When the Multistrike Chance exceeds 100%, one additional attack is guaranteed to be performed after your
// initial attack, and each full 100% increment grants another additional attack. The excessive chance that is lower than 100%
// will be the chance of performing another additional attack after the additional attacks"; 1001020125 "Each attack performed
// during Multistrike of the skill will receive additional damage bonus based on the Multistrike Damage Increment (the second
// attack receives the bonus once, the third attack receives the bonus twice, and so on)"; 1001020126 "Additional Multistrike
// Damage Increment … its value will be multiplied by (100% + Additional Increment percentage)"; 1001020127 "The Multistrike
// Count starts from 1 (E.g. When the Multistrike Chance is 200%, … a cycle of 1, 2, 3...). The Max Multistrike Count depends
// on the Multistrike Chance"; 1001020123 / reference data: +20% Attack Speed during Multistrikes.
// Attack j of a sequence (j = 0 the initial attack) has Multistrike Count 1 + initialCountBonus + j and takes
// (count − 1) × increment. Provisional readings (Erika batch 2026-10-14, questions to the user):
// - "+N initial Multistrike Count" shifts every count of the sequence by N; the number of attacks still follows the chance, so
//   the Max Multistrike Count is the last attack's count (reading A). The alternative (the sequence stops at a fixed Max, so a
//   higher start means fewer, stronger attacks) is not modeled.
// - "+X% additional damage during Multistrike" (repeatAdditionalPercent) reaches the repeated attacks (j ≥ 1), not the
//   initial attack (the planner's reading of "+20% Attack Speed during Multistrikes" too).
// - "attacks that reach max Multistrike Count" (maxCountAdditionalPercent) is the last attack of a sequence that multistrikes;
//   a sequence below 100% chance reaches it only when the repeat happens. One Max Multistrike Count event per such sequence.
// - Additional Multistrike Damage Increment from several sources (Cat's Scratch, Thunder Slash's "2% additional damage
//   increment for every +1% Steep Strike chance" = skillIncrementAdditionalPercent): game affixes 889828224 and 570299392 are two
//   writes of attr 63501 mod 4, so each is its own factor on the increment (2026-10-31; research/hero-erika-chunk1-2026-10-31.md).
//   This overrides the 2026-10-14 pasted AI answer that they shared one additive pool.
// - Cat Dive (Erika, catDiveChancePercent; user-supplied reading, confirmed 2026-10-14, provisional): each repeated attack
//   (j ≥ 1) has that chance to take the damage increment of the Max Multistrike Count attack instead of its own; expected
//   value chance × max-count strike + (1 − chance) × own strike. A Cat Dive trigger is not a Max Multistrike Count event
//   (user-confirmed 2026-10-14), so maxCountAdditionalPercent and the event count do not change. The max-count strike is the
//   last attack's count (whole + 1 when the remainder may add one more, else whole); each repeat's other multipliers
//   (Stalker's repeat bonus) are kept.
// Thunder Slash: Flurry (Noble; game affix 711264384: field 2006255 = 100 "deemed to have the Max Multistrike Count", field 2006256 = P1
//   the Max Multistrike Count; skill-mechanics census batch 2, 2026-10-27; provisional, open question thunder-slash-flurry-keen-edge):
//   `maxCountCap` caps the repeat attacks at P1 and `allAtMax` makes every repeat attack take the count-P1 increment and the "+X% on the
//   attack that reaches the Max Multistrike Count" bonus, and count as a Max Multistrike Count event.
// Thunder Slash: Keen Edge (Magnificent; game affix 491653184: attr 6001 Attack Speed mod 4 additional, this skill, gated on the
//   Multistriking state 4000810): `repeatSpeedAdditionalPercent` speeds the repeat attacks (provisional: the state is read as the
//   repeats only; the first attack keeps the skill's own speed).
export function multistrikeSequence({ chancePercent = 0, incrementPercent = 0, initialCountBonus = 0, repeatAdditionalPercent = 0, maxCountAdditionalPercent = 0, incrementAdditionalPercent = 0, skillIncrementAdditionalPercent = 0, catDiveChancePercent = 0, firstAtMax = false, maxCountCap = null, allAtMax = false, repeatSpeedAdditionalPercent = 0 } = {}) {
  const expected = Math.min(Number.isFinite(maxCountCap) ? Math.max(0, maxCountCap) : Infinity, Math.max(0, chancePercent) / 100), whole = Math.floor(expected), remainder = expected - whole;
  const increment = incrementPercent * (1 + incrementAdditionalPercent / 100) * (1 + skillIncrementAdditionalPercent / 100) / 100;
  const dive = Math.min(1, Math.max(0, catDiveChancePercent / 100));
  const maxIndex = remainder > 0 ? whole + 1 : whole;
  const plainStrike = (index) => (1 + (initialCountBonus + index) * increment) * (index >= 1 ? 1 + repeatAdditionalPercent / 100 : 1);
  // `firstAtMax` (Unstoppable Force, user-supplied 2026-10-19): the first attack of the sequence takes the Max Multistrike Count
  // increment too (without the repeat-only bonus); otherwise only the repeated attacks dive.
  const maxIncrementFirst = () => 1 + (initialCountBonus + maxIndex) * increment;
  const strikeAt = (index) => index === 0 && firstAtMax && dive > 0 && maxIndex > 0 ? dive * maxIncrementFirst() + (1 - dive) * plainStrike(0) : index >= 1 && dive > 0 && index < maxIndex ? dive * plainStrike(maxIndex) + (1 - dive) * plainStrike(index) : plainStrike(index);
  // The +X% on the attack that reaches the Max Multistrike Count (the last attack of the sequence) applies to whatever that
  // attack deals, a Cat Dive included; the dive itself never makes an earlier attack count as reaching it.
  const flurryIndex = allAtMax && Number.isFinite(maxCountCap) ? Math.max(0, maxCountCap) : null;
  const strike = flurryIndex != null ? (index) => index >= 1 ? plainStrike(flurryIndex) : plainStrike(0) : strikeAt;
  let damage = 0;
  for (let index = 0; index <= whole; index++) damage += strike(index);
  damage += remainder * strike(whole + 1);
  const atMax = maxCountAdditionalPercent / 100;
  if (atMax) damage += flurryIndex != null ? atMax * expected * strike(1) : atMax * ((whole >= 1 ? (1 - remainder) * strike(whole) : 0) + remainder * strike(whole + 1));
  const cycleIntervals = 1 + expected / (1.2 * (1 + Math.max(-99, repeatSpeedAdditionalPercent) / 100));
  return { chancePercent, incrementPercent, skillIncrementAdditionalPercent, catDiveChancePercent: dive * 100, effectiveIncrementPercent: increment * 100, initialCountBonus, expectedExtraAttacks: expected, damagePerCycle: damage, cycleIntervals, rateFactor: (1 + expected) / cycleIntervals, averageDamageFactor: damage / (1 + expected), maxCountEventsPerCycle: flurryIndex != null ? expected : whole >= 1 ? 1 : remainder, maxCount: flurryIndex != null ? 1 + initialCountBonus + flurryIndex : 1 + initialCountBonus + whole + (remainder > 0 ? 1 : 0), ...(flurryIndex != null ? { allAtMax: true, maxCountCap } : {}), ...(repeatSpeedAdditionalPercent ? { repeatSpeedAdditionalPercent } : {}) };
}
// Steep Strike chance per Slash-Strike skill (2026-10-14): the skill's own chance (profile.steepStrike, reference data "This skill +20%
// Steep Strike chance") + "The supported skill +X% Steep Strike chance" on its supports (Raging Slash) + the build's plain
// "+X% Steep Strike chance" lines (gear, talents, slates; src/passive-support-lines.js). Only Slash-Strike skills have a Steep
// Strike form, so a plain line reaches each of them.
// - fromChance (the default): min(100%, total) of attacks are Steep Strikes and replace the Sweep Slash (observed: Whirlwind Lv16
//   run 2026-10-12, research/attack-weapon-tests-2026-10-12.md); components marked `steep` in src/attack-hit-profiles.js follow
//   that share (the Steep Strike, Icy Blade's Explosion at 1 per Steep Strike, the Sweep Slash on the rest).
// - Thunder Slash (fromChance false; reference data "This skill cannot obtain Steep Strike attempts with Steep Strike Chance"): the
//   chance adds no Steep Strikes; its own Steep Strike "for every 2 Multistrikes during Sweep Slash" keeps its component, and
//   "The skill's Multistrikes gain 2% additional damage increment for every +1% Steep Strike chance" reads the total
//   (multistrikeSequence skillIncrementAdditionalPercent; provisional: added to the other additional increments).
// - Thunder Slash's Steep Strike attempts (spec.multistrikeAttempts; user-supplied mechanism 2026-10-14, provisional; the
//   per-attack check confirmed by a user-supplied answer 2026-10-15: attempts are checked once per individual attack, not once
//   per sequence): it stores
//   one attempt per 2 Multistrikes (repeat attacks); each use with a stored attempt spends it and is a Steep Strike, which
//   replaces that use's Sweep Slash (reference data "When having Steep Strike attempts, launches a Steep Strike"; Raging Slash's keyword
//   text: "the skill will be cast in Steep Strike form and consume 1 Steep Strike attempt"). Steep Strikes per use = min(1,
//   expected repeat attacks per use ÷ 2), a use being one attack of the Multistrike sequence (the model's use rate counts every
//   attack): repeats per use = E ÷ (1 + E) from multistrikeSequence (calculateSkillHit sets `share`). Big Stride's window
//   (`window`, user-supplied 2026-10-14: every attack within 4 s after moving 8 m is a Steep Strike; the window held while
//   moving, confirmed by a user-supplied answer 2026-10-15) makes it 1 while Moved recently holds (always moving: best case).
// - Blade Cluster (reference data "Generates 2 additional Steep Strikes when the supported skill launches a Steep Strike"): SS14 client
//   (research/oq-r3-r4-rea-2026-11-04.md blade-cluster-hits; one link inferred: the reactions spawn into the casting instance):
//   Split 352391 fires the normal Steep Strike and the two extra ones together as siblings whose hit rule has `bHitBrother` 0 and
//   `bHitBrotherLabelValid` 1, so once one lands the other two are refused on the same dummy unless the skill has Shotgun Effect
//   (label 3050340; then all three land at full damage, the reactions' falloff tables being empty). `clusterGenerated` = N, and
//   `clusterHits` = N only with Shotgun Effect (`shotgunEffect`), else 0. Before 2026-11-04 (user-supplied answer 2026-10-15):
//   every launch dealt × (1 + N) Steep Strike hits.
export function steepStrikeState({ profile, supportLines = [], passiveLines = [], shotgunEffect = null } = {}) {
  const spec = profile?.steepStrike;
  if (!spec) return null;
  const window = supportLines.find((line) => line.kind === "guaranteedAfterMoving") || null;
  const extraAttempts = supportLines.filter((line) => line.kind === "extraAttempts");
  supportLines = supportLines.filter((line) => !line.kind || line.kind === "chance");
  const sources = [
    ...(spec.ownChancePercent ? [{ source: `${profile.name} (skill text)`, text: `This skill +${spec.ownChancePercent}% Steep Strike chance`, value: spec.ownChancePercent, origin: "skill" }] : []),
    ...supportLines.map((line) => ({ source: line.source, text: line.text, value: line.value, origin: "support" })),
    ...passiveLines.map((line) => ({ source: line.source, text: line.text, value: line.value, origin: line.origin }))
  ];
  const chancePercent = sources.reduce((total, line) => total + (Number(line.value) || 0), 0);
  const fromChance = spec.fromChance !== false;
  const perChance = spec.multistrikeIncrementPerChancePercent || 0;
  return { chancePercent, sources, fromChance, share: fromChance ? (Number.isFinite(spec.forcedShare) ? spec.forcedShare : Math.min(1, Math.max(0, chancePercent / 100))) : null, ...(Number.isFinite(spec.forcedShare) ? { forcedShare: spec.forcedShare, forcedSource: spec.forcedSource || null } : {}), perChance, incrementAdditionalPercent: perChance * Math.max(0, chancePercent), source: spec.source || null,
    multistrikeAttempts: spec.multistrikeAttempts || null, window: window ? { source: window.source, text: window.text, meters: window.meters ?? null, seconds: window.seconds ?? null } : null, extraAttempts: extraAttempts.map((line) => ({ source: line.source, text: line.text, attempts: Number(line.attempts) || 0 })),
    clusterGenerated: extraAttempts.reduce((total, line) => total + (Number(line.attempts) || 0), 0),
    clusterHits: shotgunEffect ? extraAttempts.reduce((total, line) => total + (Number(line.attempts) || 0), 0) : 0,
    shotgunEffect: shotgunEffect || null };
}

/**
 * Shotgun Effect on one setup (label 3050340, SS14 client: research/oq-r3-r4-rea-2026-11-04.md): every grant reads "… has / have the
 * Shotgun Effect": the setup's own support clauses ("The supported skill has Shotgun Effect", 332712800 / 483352160 and their
 * variants) and build lines "<Tag> Skills / <Tag> Projectiles have the Shotgun Effect" (297159 Projectile Skills, 763970 Bomb
 * Projectiles) whose tag the skill carries. Returns the granting line { source, text } or null.
 */
export function shotgunEffectGrant({ setup = null, modifierTexts = [], tags = [] } = {}) {
  const tagSet = new Set([...(tags || [])].map((tag) => String(tag).toLowerCase()));
  for (const clause of setup?.supportEffects?.clauses || []) {
    const text = String(clause?.text || "");
    if (/(?:^|\. )the supported skill has (?:the )?Shotgun Effect/i.test(text)) return { source: clause.source || `Support: ${clause.support}`, text };
  }
  for (const line of modifierTexts || []) {
    const match = String(line?.text || "").trim().match(/^(.+?) (?:Skills|Projectiles) have (?:the )?Shotgun Effect$/i);
    if (match && match[1].split(/\s+/).every((word) => tagSet.has(word.toLowerCase()))) return { source: line.source || "build line", text: line.text };
  }
  return null;
}

/** Steep Strikes per use from stored attempts (Thunder Slash; see steepStrikeState): { share, repeatsPerUse, fromRepeats, window }. */
// Without the Multistrike sequence model (no Multistrike chance on the skill's supports or the build's lines) the profile's own
// reading holds: `ownRepeatsPerUse` repeated attacks per use (Thunder Slash: its +20% Multistrike chance as 0.2 repeated sweeps).
export function steepAttemptShare({ multistrike = null, perRepeats = 2, window = false, ownRepeatsPerUse = 0 } = {}) {
  const extra = multistrike ? Math.max(0, multistrike.expectedExtraAttacks || 0) : 0;
  const repeatsPerUse = multistrike ? extra / (1 + extra) : Math.max(0, ownRepeatsPerUse);
  const fromRepeats = Math.min(1, repeatsPerUse / perRepeats);
  return { share: window ? 1 : fromRepeats, repeatsPerUse, fromRepeats, window: Boolean(window) };
}

// Expected damage per sequence over weighted states ({ weight, ...multistrikeSequence options }).
export function multistrikeStatesDamage(base, states = []) {
  const total = states.reduce((sum, state) => sum + (Number(state.weight) || 0), 0);
  if (!(total > 0)) return multistrikeSequence(base).damagePerCycle;
  // A state's initial Multistrike Count adds to the build's own ("+N initial Multistrike Count" lines, Preemptive Strike).
  return states.reduce((sum, state) => sum + (Number(state.weight) || 0) / total * multistrikeSequence({ ...base, ...state, initialCountBonus: (base.initialCountBonus || 0) + (state.initialCountBonus || 0) }).damagePerCycle, 0);
}

/**
 * Hit events per use: one per strike, not per damage part (2026-10-15 hit-count fix). The typed parts of one hit group (a
 * row's damage types, a weapon's damage types, profile or support conversion pieces) share a `strikeKey` (src/skill-hit-
 * profiles.js skillHitBaseAtLevel) and count once; distinct groups (Sweep Slash vs Steep Strike, a Pummel vs its Explosion)
 * stay separate. Added-only parts (added flat of a new type, "added as") never count. Before the fix every typed part counted,
 * so Thunder Slash with a Physical→Lightning and a Lightning weapon part read 6.4 hits per use instead of 3.2.
 * `hitsOf(component)` gives a part's hits per use (default its hitsPerUse); parts of one strike share it, the max is taken.
 */
export function strikeHitsPerUse(components = [], hitsOf = (component) => component.hitsPerUse) {
  const strikes = new Map();
  for (const component of components) {
    if (!component || component.addedOnly || component.splitPart) continue;
    const key = component.strikeKey ?? component.componentKey ?? component.key ?? component.label;
    strikes.set(key, Math.max(strikes.get(key) ?? 0, Number(hitsOf(component)) || 0));
  }
  return [...strikes.values()].reduce((total, hits) => total + hits, 0);
}

/**
 * Projectiles of one hit group that reach the dummy per use, without Shotgun falloff: a fan's falloff-weighted hits
 * (`hitsPerUse` = per-use hits × shotgun.total) count each landing projectile once (× shotgun.reached / shotgun.total). Youga's
 * Recall (src/youga-ultimate-one.js) returns every one of them as a fresh hit event (its damage takes the pass's Shotgun falloff).
 */
export function recalledProjectilesPerUse(component) {
  const hits = Number(component?.hitsPerUse) || 0;
  const shotgun = component?.shotgun;
  return shotgun && shotgun.total > 0 && Number.isFinite(shotgun.reached) ? hits / shotgun.total * shotgun.reached : hits;
}

/**
 * Hit events that land on the dummy per use for one hit group: each projectile, strike or Shadow that passes the hit rule is one event,
 * whatever its Shotgun falloff (SS14 client, research/trigger-events-rea-2026-11-04.md §1: one damage event per (entity, target) pair that
 * passes the hit rule; the repeat multiplier scales that event's damage only). A Shotgun fan counts its landing projectiles
 * (recalledProjectilesPerUse), a Shadows copy its expected Shadows × the copied group's landings (`landingsPerUse`, set below).
 */
export function landingsPerUse(component) {
  return Number.isFinite(component?.landingsPerUse) ? component.landingsPerUse : recalledProjectilesPerUse(component);
}

/**
 * Model one skill's hits against the dummy.
 * @param {object} p
 * @param {object} p.setup resolved setup (effectiveLevel, supports)
 * @param {object} p.profile SKILL_HIT_PROFILES entry
 * @param {object[]} p.modifierTexts flattened modifier lines (planner.modifierTexts)
 * @param {object} p.castSpeed { factor, sources } — the planner's cast-speed total as a multiplier on uses/s
 * @param {object} p.crit scorchingBeamCritical(...) output for this setup (spell crit totals)
 * @param {object[]} p.auraEntries active aura entries (effectiveEffects)
 * @param {object} p.aim planner.aim
 * @param {number} p.intelligenceAdditionalPercent main-stat line (0.5% × total Intelligence) from the hit ledger
 * @param {object} p.target { resistancePercent: { Fire, Cold, Lightning, Erosion }, armourPercent, nonPhysicalArmourPercent }
 * @param {boolean} p.targetCursed
 * @param {object[]} p.extraTaken typed enemy damage-taken lines the planner settles ({ source, text, value, types })
 * @param {object} p.multistrikeEffects hero states on Multistrike sequences (src/erika-wind-stalker.js): { steps: [{ source,
 *   text, states: [{ weight, initialCountBonus, repeatAdditionalPercent, maxCountAdditionalPercent, incrementAdditionalPercent }] }] }
 *   — each step's states are cumulative; each step becomes one additional-damage line (its factor over the previous step)
 * @param {object[]} p.extraCritOnly enemy crit-taken debuffs on the crit share ({ source, text, value }; Mark, src/mark-effect.js)
 */
/**
 * Thunder Focus and Precise: Thunder Focus gain Focus Pts per metre moved (`profile.focus.pointsPerMeter`): their Focus Pts per second,
 * uses per second and first use follow the player's movement speed (src/dummy-target.js playerMoveSpeed: 6.5 m/s base × the build's
 * Movement Speed; user decision 2026-11-10). Without a speed the profile keeps its 6.5 m/s base figures.
 */
export function movementFocusProfile(profile, moveSpeed) {
  const perMeter = Number(profile?.focus?.pointsPerMeter);
  if (!(perMeter > 0) || !moveSpeed || !profile.useModel) return profile;
  const pointsPerSecond = Math.max(0, Number(moveSpeed.metersPerSecond) || 0) * perMeter;
  const perUse = Number(profile.focus.pointsPerUse) || 100;
  const usesPerSecond = pointsPerSecond / perUse;
  const note = `Reference data: ${perMeter * 2} Focus Pts per 2 m moved, ${perUse} Pts per Thunderstrike when a non-Mobility Attack Skill is used; moving at ${moveSpeed.text} gives ${round(usesPerSecond)} Thunderstrikes/s; standing still it never triggers`;
  return { ...profile, focus: { ...profile.focus, pointsPerSecond }, useModel: { ...profile.useModel, usesPerSecond, firstUseSeconds: pointsPerSecond > 0 ? perUse / pointsPerSecond : Infinity, note } };
}

export function calculateSkillHit({ fervor = null, prebuiltSelfBuffs = true, luckyDamageRolls = 1, luckyState = null, deterioration = null, setup, profile, modifierTexts = [], castSpeed = { factor: 1, sources: [] }, attackSpeed = null, weapon = null, crit = {}, auraEntries = [], aim = null, intelligenceAdditionalPercent = 0, intelligenceSource = null, mainStatPoints = null, target = {}, targetCursed = false, targetCurseCount = 0, enemyAilments = null, extraTaken = [], windows = [5, 20], nearTarget = true, multistrikeEffects = null, extraCritOnly = [], movedRecently = true, multistrikeEventsPerSecond = null, heroEffects = null, triggeredSkillAdditional = [], tangleSkill = false, extraTriggeredUses = null, takenConversion = null, frameSnap = false, damageToLife = null, burstChargeTrigger = null, recipeState = null, boardSkillNames = null, movementSpeedPercent = 0, moveSpeed = null, projectileQuantityFixed = false, tagSpeedLines = [], attributePool = null, measuredDealtTypes = null, spellTagOnAttack = false, rotation = null, projectileHits = null, isMainSkill = null, spellBurstUseStreams = null } = {}) {
  // A Focus skill that gains its Focus Pts per metre moved (Thunder Focus) at the player's movement speed (user decision 2026-11-10).
  profile = movementFocusProfile(profile, moveSpeed);
  // The Main Skill is the planner's Main Skill (isMainSkill, from src/planner.js resolvedMain; 2026-11-15): every active-slot skill of a
  // custom board has role "main", so the role alone read a second board skill as the Main Skill. Every Main Skill check below reads it
  // (Sweeping Fury 19348734, the Main Spell repeat 222907, Spell Ripple 864131584, Obliterate's buff 35100 affix 355845824, the Main
  // Attack Skill guaranteed Double Damage 6038069: each record's row needs Main Skill 6020000). Without the flag (direct calls) the role stands.
  const mainSkill = isMainSkill ?? setup?.role === "main";
  // Hero effects on one skill (src/youga-ultimate-one.js: Clockwork Core's Tangle cadence, its shared bonuses, Recall hits,
  // the crit cooldown reduction, the Spell Burst rules, the Alternate Spacetime lines): skill-local plain lines join the
  // modifier lines read below.
  if (heroEffects?.extraModifierTexts?.length) modifierTexts = [...modifierTexts, ...heroEffects.extraModifierTexts];
  const fanLandsAll = Boolean(heroEffects?.fanLandsAll);
  // "Projectiles hitting the dummy" (Config tab, combat.projectileHits[setupKey]; user decision 2026-11-12): a whole count ≥ 1 replaces
  // the automatic landing rule of this setup's projectile volleys (profile falloff specs marked `projectile: true` and the fan that
  // extra Projectile Quantity makes), clamped to each volley's fired count, at either distance. Absent: automatic (best case).
  const landedOverride = Number.isInteger(projectileHits) && projectileHits >= 1 ? projectileHits : null;
  // Every projectile volley the hit passes build (for the Config row's fired / automatic counts).
  const projectileVolleys = [];
  const projectileVolley = (falloff) => { const volley = falloffVolley(falloff, nearTarget, fanLandsAll, landedOverride); if (volley && falloff?.projectile) projectileVolleys.push(volley); return volley; };
  // Skill-mechanics census batch 5 (B3; src/support-hit-count-batch5.js): this setup's hit-count and cadence supports (Shotgun Effect,
  // waves, pulses, cooldowns, intervals, Focus Pts, Steep Strike overrides) apply to a copy of the profile; its notes list each change.
  profile = applyBatch5ProfileEdits(profile, supportEffectsFor(setup, { profile, engine: "skill-hit" }), { weapon }).profile;
  // Census batch 6 (src/minion-sentry-batch6.js): the Sentry skills' supports and own text (Ghost Blade / Arrow Einherjar, Flame Core,
  // Frost Core, Thunder Core) and Scorching Pulse's retrigger with a Flame Core on the board.
  profile = applyBatch6SentryEdits(profile, supportEffectsFor(setup, { profile, engine: "skill-hit" }), { modifierTexts, enemyAilments, boardSkillNames }).profile;
  // Archery Bond's held "Projectile Quantity is fixed at 1" (chunk 9, affix 254952): a fan loses its base count and its extra projectiles alike.
  if (projectileQuantityFixed && (profile.tags || setup?.tags || []).includes("Projectile")) profile = { ...profile, projectileQuantityFixed: true, projectileVolley: null, components: (profile.components || []).map((component) => (component.perUse?.falloff ? { ...component, perUse: 1 } : component)) };
  // Focus Speed scales a Focus skill's Focus Pts gain, so its gain-bound uses (src/focus-speed.js; game manual 1001012924).
  profile = applyFocusSpeed(profile, modifierTexts, supportEffectsFor(setup, { profile, engine: "skill-hit" }).focusSpeed);
  const level = Math.max(1, Math.floor(setup?.effectiveLevel ?? 20));
  // Weapon Attack Damage skills (src/attack-hit-profiles.js) scale the equipped weapon's damage (src/weapon-damage-model.js).
  const attackProfile = Boolean(profile.weaponScaling);
  const base = skillHitBaseAtLevel(profile, level, attackProfile ? weapon : null);
  const timing = skillHitTiming(profile);
  // The stone filter's tag changes (setup.supportAddedTags / supportRemovedTags, src/planner.js: Split Shot: Rapid Advance adds
  // Channeled, Whirlwind: Whirling Blade Projectile and Horizontal) put the tag on the skill itself, so every write scoped to it is
  // admitted (GetAttr tag rule; wiring audit W1 gap 1).
  const skillTags = skillTagsWithSupportChanges(profile.tags, setup);
  // Lines scoped to tags the skill text borrows ("Spell Damage bonus and additional bonus also apply to the skill's
  // Attack Damage": Moon Strike) reach the hit; the ailment inputs keep the skill's real tags.
  const scopeTags = new Set([...skillTags, ...(profile.lineScopeTags || [])]);
  // Chain Lightning: Lucky (Noble) "The supported skill deals Lucky Damage" (census #11): the supported skill's own rolls.
  const ownLuckyRolls = (setup?.supports || []).some((support) => support.enabled !== false && support.name === "Chain Lightning: Lucky (Noble)") ? 2 : 1;
  // Skill-tag changes from supports ("The supported skill gains the Cold Tag", "Removes the Area tag"): the line scopes follow.
  const tagEffects = supportEffectsFor(setup, { profile, engine: "skill-hit" }).tags;
  for (const line of tagEffects.add) scopeTags.add(line.tag);
  for (const line of tagEffects.remove) scopeTags.delete(line.tag);
  // The types the hit really deals, with a converted part's chain (the planner's hit pass, src/planner.js hitDealtTypes; 2026-11-05) judge the supports' typed lines
  // (High Voltage's additional Lightning on an Attack whose weapon deals Lightning); the profile's types before that pass.
  const dealtTypes = measuredDealtTypes?.length ? [...measuredDealtTypes] : profile.dealtTypes || [];
  const notes = [...(profile.notes || [])];
  const warnings = [...(profile.warnings || [])];
  const speedTypeForSupports = skillHitTiming(profile)?.speedType || "cast-speed";
  const supportsRaw = supportLayers(setup, { dealtTypes, skillTags: scopeTags, profile, speedType: speedTypeForSupports });
  // Aura stats scoped to the Melee tag (gear-pact batch G4; game-data aura records, src/data/skills/aura-scaling-ss13.js):
  // Fearless "+X% Critical Strike Rating for Melee Skills" joins the attack crit rating's increased pool and Precise:
  // Fearless "+X% Melee Attack Speed" the attack-speed pool, like the supports' lines of the same kind. Melee skills only;
  // a Melee skill without an attack crit base (no weapon model) does not read the crit line (provisional).
  const { speed: auraTagSpeed, crit: auraTagCrit } = auraTagLines(auraEntries, scopeTags, speedTypeForSupports);
  // Passive build-wide conversion, added-as, Multistrike and Projectile Quantity lines (src/passive-support-lines.js; gear-pact
  // batch chunk 2) join the support arrays they share their rules with.
  const passive = passiveSupportLines(modifierTexts);
  const capType = (type) => type[0].toUpperCase() + type.slice(1).toLowerCase();
  const supports = {
    ...supportsRaw,
    castSpeed: [...supportsRaw.castSpeed, ...auraTagSpeed],
    critRating: [...supportsRaw.critRating, ...auraTagCrit],
    conversion: [...supportsRaw.conversion, ...passive.conversion.map((line) => ({ source: line.source, text: line.text, from: capType(line.from), to: capType(line.to), percent: line.percent }))],
    addedAs: [...supportsRaw.addedAs, ...passive.addedAs.map((line) => ({ source: line.source, text: `${line.text} (provisional reading)`, from: capType(line.from), to: capType(line.to), percent: line.percent }))],
    effects: { ...supportsRaw.effects, multistrike: [...supportsRaw.effects.multistrike, ...passive.multistrike], quantity: [...supportsRaw.effects.quantity, ...passive.quantity] }
  };
  notes.push(...supports.notes);
  // The tagged attribute pool (W9 step 3; src/attribute-pool-hit.js), TLI_POOL_HIT=pool: the lines' hit readings, the supports' damage,
  // crit, cooldown and penetration lines and the typed taken lines go in as writes; each part reads them by its query (the skill's tags,
  // Hit, the setup's id) and its types. `attributePool`: the planner's build pool (record writes, conversion records), or none.
  const hitPool = hitPoolMode() === "pool" ? new HitPool({ parent: attributePool, skillId: setup?.setupKey ?? setup?.instanceId ?? profile.name ?? null, scopeTags, skillTags }) : null;
  if (hitPool) hitPool.addCritRating(supports.critRating);
  // Conversion records the traced pool reads at this hit (TLI_POOL_CONVERSIONS=traced): their lines' legacy readings (a derived line, the
  // Projectile Speed converter below) are dropped. Their sources here: the setup's "+X% Projectile Speed for the supported skill" clauses
  // (written "for this skill": the setup's id, so only this hit's query sees them) and the hero's Projectile Speed (record writes).
  const tracedLines = hitPool ? tracedConversionLines(attributePool) : new Set();
  if (hitPool && tracedLines.size) {
    for (const clause of setup?.supportEffects?.clauses || []) {
      const match = normalizePercentageText(String(clause.text || "")).replace(/\s+/g, " ").trim().match(/^([+-]?\d+(?:\.\d+)?)% Projectile Speed for the supported skill$/i);
      if (match) hitPool.addRecord({ attr: PROJECTILE_SPEED, mod: 3, value: Number(match[1]), requirement: [{ mine: [POOL_TAG.thisSkill] }], skillId: hitPool.skillId, source: { kind: "support", line: clause.source || `Support: ${clause.support}` } });
    }
    for (const line of heroEffects?.projectileSpeed || []) hitPool.addRecord({ attr: PROJECTILE_SPEED, mod: 3, value: line.value, requirement: null, source: { kind: "trait", line: line.source } });
  }
  // The supports' Critical Strike Rating lines (attack crit): Σ flat, Σ %, Π additional, from the pool or the list.
  const supportCritSums = () => {
    if (hitPool) { const read = hitPool.critRating(); return { flat: read.base, percent: read.increased, additionalFactor: read.additionalFactor }; }
    return { flat: sum(supports.critRating.filter((line) => line.kind === "ratingFlat")), percent: sum(supports.critRating.filter((line) => line.kind === "ratingPercent")), additionalFactor: product(supports.critRating.filter((line) => line.kind === "ratingAdditional")) };
  };
  // Steep Strike chance (Slash-Strike skills; steepStrikeState above).
  const steepStrike = steepStrikeState({ profile, supportLines: supportsRaw.effects.steepStrike || [], passiveLines: passive.steepStrike || [], shotgunEffect: profile?.steepStrike ? shotgunEffectGrant({ setup, modifierTexts, tags: [...scopeTags] }) : null });
  if (steepStrike) notes.push(steepStrike.fromChance
    ? `${profile.name}: Steep Strike chance ${round(steepStrike.chancePercent)}% (${steepStrike.sources.map((line) => `${line.source} +${round(line.value)}%`).join(", ")}) → ${round(steepStrike.share * 100)}% of attacks are Steep Strikes replacing the Sweep Slash (observed reading, Whirlwind Lv16 run 2026-10-12).`
    : `${profile.name}: cannot obtain Steep Strikes from Steep Strike chance; ${round(steepStrike.chancePercent)}% chance${steepStrike.sources.length ? ` (${steepStrike.sources.map((line) => `${line.source} +${round(line.value)}%`).join(", ")})` : ""}${steepStrike.perChance ? ` × ${steepStrike.perChance}% = +${round(steepStrike.incrementAdditionalPercent)}% additional Multistrike damage increment (provisional)` : ""}.`);
  for (const line of supports.unmodeled) warnings.push(`${line.source}: "${line.text}" is not read by the ${profile.name} hit model.`);

  // Use model: "cast" (one use per cast), "terra" (one ground effect / sentry at a time, recast on expiry), "channel"
  // (one use per channel interval, stacks held at max) or "rate" (a trigger cadence the profile fixes).
  // "channel-release" (attack channels such as Charged Pummel): the channel is built to its max stacks and released; one
  // use is the whole cycle (stacks × channel interval), with per-stack hits during the channel and release hits at its end.
  const release = profile.useModel?.kind === "channel-release" ? profile.useModel : null;
  const channel = profile.useModel?.kind === "channel" || release ? profile.useModel : null;
  const rateModel = profile.useModel?.kind === "rate" ? profile.useModel : null;
  // Weapon restriction ("Limited to …"): a weapon the skill cannot be used with makes the skill inactive (no uses; the
  // per-hit figures are still computed so the ledger shows what an allowed weapon of the same damage would deal).
  let inactiveReason = null;
  if (attackProfile) {
    const restriction = profile.weaponScaling.restriction;
    const held = weapon?.mainHand?.weapon ? weapon.mainHand : weapon?.offHand?.weapon ? weapon.offHand : null;
    if (!weapon || weapon.unarmed) warnings.push(`${profile.name}: deals Weapon Attack Damage and no weapon damage is available (no weapon model / unarmed), so its hits compute to 0.`);
    else if (restriction?.types && held?.type && !restriction.types.includes(held.type)) inactiveReason = `${restriction.text} — the equipped ${held.type} cannot use this skill in game`;
    else if (restriction?.dualWield && !weapon.dualWielding) inactiveReason = `${restriction.text} — the skill needs two one-handed weapons and the build is not dual wielding`;
    if (inactiveReason) warnings.push(`${profile.name}: inactive — ${inactiveReason}; its hits are shown for reference and its rate is 0.`);
    for (const note of weapon?.notes || []) notes.push(`${profile.name}: ${note}`);
    for (const warning of weapon?.warnings || []) warnings.push(`${profile.name}: ${warning}`);
  }
  // A trigger that needs an ailment on the target (Ice Focus: Focus Pts only from damage to Frostbitten enemies) is inactive
  // unless the enemy-ailment model (src/enemy-ailments.js: a support such as Glacial Freeze on an active skill dealing Hit
  // <Type> Damage) finds the build inflicting it; the per-hit figures are still computed for reference.
  if (profile.requiresEnemyAilment && !inactiveReason) {
    const present = enemyBuffSet(enemyAilments)?.holds(profile.requiresEnemyAilment) ?? Boolean(enemyAilments?.types?.some((type) => type.name === profile.requiresEnemyAilment));
    if (!present) {
      inactiveReason = `${profile.requiresEnemyAilmentNote || `its trigger needs ${profile.requiresEnemyAilment} on the target`} and the build inflicts no ${profile.requiresEnemyAilment} (enemy-ailment model: a support such as Glacial Freeze on an active skill dealing Hit Cold Damage)`;
      warnings.push(`${profile.name}: inactive — ${inactiveReason}; its hits are shown for reference and its rate is 0.`);
    }
  }
  // A hero or build effect that leaves the skill nothing to fire from (Banishment: Tangle with no Minion to attach its Tangles to,
  // src/tangle-model.js tangleHitEffects): its uses are 0, its hits still computed for reference.
  if (heroEffects?.inactiveReason && !inactiveReason) {
    inactiveReason = heroEffects.inactiveReason;
    warnings.push(`${profile.name}: inactive — ${inactiveReason}; its hits are shown for reference and its rate is 0.`);
  }

  // Modifier lines by kind, scoped later per component.
  const damageLines = [], takenLines = [], penetrationLines = [], armourPenetrationLines = [], addedLines = [], unspecifiedAdded = [], cooldownLines = [], maxLines = [], minLines = [], channelLines = [];
  // A compound "Min …, and Max …" line (Impermanence) is read as its two lines (src/skill-hit-lines.js splitHitLineText).
  // Recipe step 3 (2026-10-25, research/recipe-interpreter-step1-2026-10-25.md §15): each line's game recipe gives its reading
  // (src/recipe-hit-layers.js hitLineFromFacts, in classifyHitLine's shape); the text reading stays where the recipe cannot place the
  // line (planner-made lines, hero-trait lines, runtime-scaled writes). TLI_HIT_PATH=text (TLI_SPEED_PATH=text for the Cooldown
  // Recovery Speed lines) restores the text readers.
  const readRecipe = anyHitRecipeMode() ? hitRecipeReader(modifierTexts) : null;
  for (const line of modifierTexts.flatMap((item) => { const parts = splitHitLineText(item.text); return parts.length > 1 ? parts.map((text) => ({ ...item, text, compoundText: item.text })) : [item]; })) {
    // Traced pool: a line resolved from a conversion line (its per-stat value) is read through the conversion record instead.
    if (tracedLines.size && line.derivedFrom && tracedLines.has(lineKeyOf(line.source, line.derivedFrom))) continue;
    // The ring's "+N Max Channeled Stacks when equipped in the left / right Ring slot" counts from that slot only (2026-11-12,
    // src/channeled-stack-lines.js; the plain wording is classifyChannelLine's).
    const ringStacks = channel ? maxChanneledStacksLine(line) : null;
    if (ringStacks?.ringSlot) { if (ringStacks.active) channelLines.push({ kind: "maxStacks", value: ringStacks.value * (line.multiplier ?? 1), source: line.source, text: line.text, origin: line.origin }); continue; }
    const channelParsed = channel ? classifyChannelLine(line.text) : null;
    if (channelParsed) { channelLines.push({ ...channelParsed, source: line.source, text: line.text, origin: line.origin, value: channelParsed.value * (line.multiplier ?? 1) }); continue; }
    const textParsed = classifyHitLine(line.text, { targetCursed, enemyAilments });
    const recipeParsed = readRecipe ? hitLineFromFacts(readRecipe(line), textParsed, recipeState) : undefined;
    const parsed = pickHitReading(textParsed, recipeParsed);
    if (!parsed) continue;
    const scaled = (value) => value * (line.multiplier ?? 1);
    const entry = { source: line.source, text: line.text, origin: line.origin, ...(parsed.recipe ? { recipe: parsed.recipe } : {}) };
    if (hitPool && hitPool.addReading(parsed, line, entry, scaled)) continue;
    if (parsed.kind === "damage") damageLines.push({ ...entry, value: scaled(parsed.value), layer: parsed.layer, scope: parsed.scope, condition: parsed.condition, category: parsed.layer === "increased" ? "Increased damage" : "Additional damage" });
    else if (parsed.kind === "maxDamage") maxLines.push({ ...entry, value: scaled(parsed.value), scope: parsed.scope, category: "Additional Max Damage" });
    // "+X% additional [<scope>] Min Damage" (Impermanence, 2026-10-14; user-supplied reading, provisional): the lower roll only.
    else if (parsed.kind === "minDamage") minLines.push({ ...entry, value: scaled(parsed.value), scope: parsed.scope, category: "Additional Min Damage" });
    // Enemy damage taken: the planner's derived curse lines, or a typed positive line. Untyped or negative
    // "damage taken" lines on gear are the character's own defence (e.g. "-30% additional damage taken").
    // A recipe reading names its target: `enemy` is a write on the enemy (one on yourself never reaches here).
    else if (parsed.kind === "taken") { if (parsed.enemy || line.origin === "derived" || (parsed.value > 0 && parsed.scope.damageTypes)) takenLines.push({ ...entry, value: scaled(parsed.value), layer: parsed.layer, scope: parsed.scope, category: parsed.layer === "additional" ? "Additional damage taken" : "Increased damage taken" }); }
    else if (parsed.kind === "penetration") penetrationLines.push({ ...entry, value: scaled(parsed.value), damageTypes: parsed.damageTypes, category: "Penetration" });
    // A tag-scoped copy ("… for Attack Skills") reaches only skills carrying the tag (census leftover 2026-10-27).
    else if (parsed.kind === "armourPenetration") { if (!parsed.skillTags || [...parsed.skillTags].every((tag) => scopeTags.has(tag))) armourPenetrationLines.push({ ...entry, value: scaled(parsed.value), category: "Armor DMG Mitigation Penetration" }); }
    // Added flat damage by target: "… to Spells" reaches Spell skills only; "… to Attacks and Spells" reaches Spells, and attacks that
    // have no weapon model (an attack with one takes it from weapon.addedToAttacks below, so it is not added twice). Before
    // 2026-10-18 a plain "to Spells" line also reached attack hits and an "Attacks and Spells" line was added twice to attacks.
    else if (parsed.kind === "added") {
      if (parsed.to === "spells") {
        const alsoAttacks = parsed.alsoAttacks ?? /\bAttacks\b/i.test(line.text);
        const reaches = alsoAttacks ? !(attackProfile && weapon) : skillTags.has("Spell");
        if (reaches) addedLines.push({ ...entry, type: parsed.type, min: scaled(parsed.min), max: scaled(parsed.max) });
      } else if (parsed.to === "unspecified") unspecifiedAdded.push(entry);
    }
    else if (parsed.kind === "cooldownRecovery") cooldownLines.push({ ...entry, value: scaled(parsed.value), additional: parsed.additional });
  }
  // Curse models the planner resolves itself (Scorch) and the skill's own hit debuffs (Blizzard) arrive as typed lines.
  // Moon's Dawn: Illumination (chunk 8; recipe 234465248: additional Max Damage, this skill).
  const supportMax = (supports.effects.maxDamage || []).map((line) => ({ source: line.source, text: line.text, value: line.value, scope: null, category: "Additional Max Damage" }));
  if (hitPool) hitPool.addSupportMax(supportMax); else maxLines.push(...supportMax);
  const typedTaken = (line, origin) => ({ source: line.source, text: line.text, origin, value: line.value, layer: line.layer || "additional", scope: { damageTypes: line.types ? new Set(line.types) : null, skillTags: null, hitOnly: false }, category: "Additional damage taken" });
  const extraTakenLines = extraTaken.map((line) => typedTaken(line, "derived")), selfTakenLines = (profile.selfDebuffTaken || []).map((line) => typedTaken({ ...line, source: `${profile.name}: hit debuff` }, "skill"));
  if (hitPool) { hitPool.addTaken(extraTakenLines, "model"); hitPool.addTaken(selfTakenLines, "skill"); } else takenLines.push(...extraTakenLines, ...selfTakenLines);
  for (const line of unspecifiedAdded) warnings.push(`${line.source}: "${line.text}" names no skill type (Spells / Attacks), so it is not added to ${profile.name}.`);
  // Pool: the lines' added damage this skill admits (a "to Spells" line by its Spell tag, an "Attacks and Spells" line unless the weapon
  // model reads it), in line order; the supports' and the weapon's follow as before.
  if (hitPool) addedLines.push(...hitPool.added(Boolean(attackProfile && weapon)).entries);
  addedLines.push(...supports.added.map((line) => ({ ...line, origin: "support" })));
  // Towering Presence (src/towering-presence.js; core audit batch B5): the main-hand weapon's damage added to Spells, Spell skills only.
  if (skillTags.has("Spell") && !attackProfile) for (const line of modifierTexts) if (line.weaponToSpells) addedLines.push({ source: line.source, text: line.weaponToSpells.note, origin: "derived", type: line.weaponToSpells.type, min: line.weaponToSpells.min, max: line.weaponToSpells.max });
  // Attack skills: "Adds X–Y <Type> Damage to Attacks [and Spells]" and the weapon model's handedness lines
  // ("+X% additional damage for Main-Hand Weapons", "… when holding a Two-Handed Weapon", "… while Dual Wielding").
  if (attackProfile && weapon) addedLines.push(...weapon.addedToAttacks.map((line) => ({ source: line.source, text: line.text, origin: line.origin, type: line.type, min: line.min, max: line.max })));
  const weaponAdditional = attackProfile && weapon ? weapon.additional.map((line) => ({ ...line, category: "Additional damage" })) : [];
  const weaponIncreased = attackProfile && weapon ? weapon.increased.map((line) => ({ ...line, category: "Increased damage" })) : [];

  // Channel stacks (channel skills): base max from the Split struct + supports + build lines; the channel is held at
  // max stacks (own buffs pre-built), so per-stack cadences read the full count. The skill's own and the build's
  // per-additional-max-stack lines scale with the stacks above the base.
  const channelState = (() => {
    if (!channel) return null;
    const base = profile.channel?.baseMaxStacks ?? 5;
    const sources = [...supports.maxStacks, ...channelLines.filter((line) => line.kind === "maxStacks").map((line) => ({ source: line.source, text: line.text, value: line.value }))];
    const maxStacks = base + sum(sources);
    const additionalMaxStacks = Math.max(0, maxStacks - base);
    const increased = channelLines.filter((line) => line.kind === "increased").map((line) => ({ source: line.source, text: line.text, origin: line.origin, value: line.value, category: "Increased damage" }));
    increased.push(...channelLines.filter((line) => line.kind === "perStackIncreased").map((line) => ({ source: line.source, text: `${line.text} (${additionalMaxStacks} additional)`, origin: line.origin, value: line.value * additionalMaxStacks, category: "Increased damage" })));
    const additional = channelLines.filter((line) => line.kind === "perStackAdditional").map((line) => ({ source: line.source, text: `${line.text} (${additionalMaxStacks} additional)`, origin: line.origin, value: line.value * additionalMaxStacks / line.per, category: "Additional damage" }));
    const own = profile.channel?.perAdditionalMaxStackAdditionalPercent;
    if (own) additional.push({ source: `${profile.name}: additional Max Channeled Stacks`, text: `+${own}% additional damage for every +1 additional Max Channeled Stack(s) (${additionalMaxStacks} additional; skill text)`, origin: "skill", value: own * additionalMaxStacks, category: "Additional damage" });
    return { baseMaxStacks: base, baseMaxSource: profile.channel?.baseMaxSource || null, maxStacks, additionalMaxStacks, fullStacks: maxStacks, sources, increased, additional: additional.filter((line) => line.value !== 0) };
  })();

  // Use rate (before the components: tick intervals scale with cast speed). Attack skills (speed type "attack-speed")
  // use the weapon model's attacks-per-second factor, the supports' "Attack and Cast Speed" lines and the skill's own
  // "+X% additional Attack Speed for this skill" line instead of the cast-speed total.
  const speedType = timing?.speedType || "cast-speed";
  // Attack skills (B3): the supports' increased Attack Speed joins the weapon model's increased pool and their additional
  // lines multiply (manual: speed is calculated like Critical Strike Rating, Σ non-additional × Π additional); without
  // the weapon model's breakdown (direct calls) they multiply separately. Spells keep the separate support factor.
  // Multistrike (Attack skills; the sequence model below): whether this skill can Multistrike decides the speed lines that act
  // "when performing Multistrikes".
  const multistrikeChance = sum(supports.effects.multistrike.filter((line) => line.kind === "chance"));
  const multistrikeIncrement = sum(supports.effects.multistrike.filter((line) => line.kind === "increment"));
  const canMultistrike = speedType === "attack-speed" && !channel && !profile.sentry && !skillTags.has("Mobility") && multistrikeChance > 0;
  // "+X% [additional] Attack Speed when performing Multistrikes" (Bladerunner talent, rank multiplier applied; 2026-10-14): active
  // for an attacking skill that can Multistrike, on that skill's attack speed only. Read as the whole sequence's attack speed
  // (best case); whether it covers only the repeat attacks is not sourced (provisional).
  const multistrikeSpeedLines = canMultistrike ? modifierTexts.flatMap((line) => {
    const match = normalizePercentageText(String(line.text || "")).replace(/\s+/g, " ").trim().match(MULTISTRIKE_SPEED_LINE);
    return match ? [{ source: line.source, text: `${line.text} (${profile.name} can Multistrike; whole sequence, provisional)`, origin: line.origin, value: Number(match[1]) * (line.multiplier ?? 1), additional: Boolean(match[2]) }] : [];
  }) : [];
  // Dual Onslaught (gear affix batch C, provisional; game affix 381754400): while Dual Wielding the supported skill's casts alternate,
  // the 1st taking "+X% Attack and Cast Speed", the 2nd "+Y% additional damage". The use interval averages the two casts' (an
  // equivalent increased-speed line: the harmonic mean of the two speed pools), and the damage is +Y% on half the casts.
  // A tag-scoped buff speed (Archery Bond): on a skill with every tag of the line, in the increased pool; the Attack line needs the Attack tag, so it never reaches a cast.
  for (const line of tagSpeedLines) if (line.tags.every((tag) => skillTags.has(tag))) supports.castSpeed.push({ source: line.source, text: line.text, value: line.value, additional: false });
  if (speedType === "attack-speed" && MOVEMENT_ATTACK_SPEED_SKILLS.has(profile.name) && movementSpeedPercent > 0) {
    const value = round(Math.min(MOVEMENT_ATTACK_SPEED.capPercent, movementSpeedPercent * MOVEMENT_ATTACK_SPEED.sharePercent / 100));
    supports.castSpeed.push({ source: `${profile.name}: Movement Speed share`, text: `+${value}% additional Attack Speed for this skill: ${MOVEMENT_ATTACK_SPEED.sharePercent}% of +${round(movementSpeedPercent)}% Movement Speed, up to +${MOVEMENT_ATTACK_SPEED.capPercent}% (game recipe 811059904)`, value, additional: true });
  }
  const alternating = (supports.effects.alternating || []).filter((line) => line.status === "Provisional" || line.status === "In calc");
  const alternatingSpeed = sum(alternating.filter((line) => line.kind === "speed"));
  // Pool: the supports' (and this skill's own) speed lines "for this skill" on its speed attribute, the Multistrike speed lines on 6351.
  const speedAttr = speedType === "attack-speed" ? ATTACK_SPEED : CAST_SPEED;
  let speedWritten = 0;
  const writeSpeed = () => { if (!hitPool) return; hitPool.addSupportSpeed(supports.castSpeed.slice(speedWritten), speedAttr); speedWritten = supports.castSpeed.length; };
  if (hitPool) hitPool.addMultistrikeSpeed(multistrikeSpeedLines);
  if (alternatingSpeed) {
    writeSpeed();
    const pool = (speedType === "attack-speed" && Number.isFinite(attackSpeed?.increasedPercent) ? attackSpeed.increasedPercent : 0) + (hitPool ? hitPool.speed(speedAttr).increased : sum(supports.castSpeed.filter((line) => !line.additional))) + (hitPool ? hitPool.multistrikeSpeed().increased : sum(multistrikeSpeedLines.filter((line) => !line.additional)));
    const plain = Math.max(1e-9, 1 + pool / 100), fast = plain + alternatingSpeed / 100;
    const equivalent = (2 * plain * fast / (plain + fast) - plain) * 100;
    supports.castSpeed.push({ source: alternating.find((line) => line.kind === "speed").source, text: `+${alternatingSpeed}% Attack and Cast Speed on every 1st cast (Dual Onslaught, Dual Wielding) = +${round(equivalent)}% averaged over the alternating casts (provisional)`, value: equivalent, additional: false });
  }
  for (const line of alternating.filter((item) => item.kind === "damage")) supports.additional.push({ source: line.source, text: `+${line.value}% additional damage on every 2nd cast (Dual Onslaught, Dual Wielding) = +${round(line.value / 2)}% on average (provisional)`, value: line.value / 2, category: "Additional damage" });
  writeSpeed();
  const speedRead = hitPool ? hitPool.speed(speedAttr) : null, multistrikeSpeedRead = hitPool ? hitPool.multistrikeSpeed() : null;
  const supportIncreasedSpeed = speedRead ? speedRead.increased + multistrikeSpeedRead.increased : sum(supports.castSpeed.filter((line) => !line.additional)) + sum(multistrikeSpeedLines.filter((line) => !line.additional));
  const supportAdditionalSpeed = speedRead ? speedRead.additionalFactor * multistrikeSpeedRead.additionalFactor : product(supports.castSpeed.filter((line) => line.additional)) * product(multistrikeSpeedLines.filter((line) => line.additional));
  const pooledAttackSpeed = speedType === "attack-speed" && attackSpeed && Number.isFinite(attackSpeed.increasedPercent) && Number.isFinite(attackSpeed.weaponAttacksPerSecond) && (attackSpeed.factor || 0) > 0;
  const supportSpeedFactor = pooledAttackSpeed
    ? Math.max(0, 1 + (attackSpeed.increasedPercent + supportIncreasedSpeed) / 100) / Math.max(1e-9, 1 + attackSpeed.increasedPercent / 100) * supportAdditionalSpeed
    : Math.max(0, 1 + supportIncreasedSpeed / 100) * supportAdditionalSpeed;
  const ownSpeedLine = speedType === "attack-speed" && profile.attackSpeed?.additionalPercent ? { source: `${profile.name}: own Attack Speed`, text: `+${profile.attackSpeed.additionalPercent}% additional Attack Speed for this skill (${profile.attackSpeed.source || "skill text"})`, value: profile.attackSpeed.additionalPercent, additional: true } : null;
  const speedFactor = speedType === "attack-speed" ? Math.max(0.0001, attackSpeed?.factor ?? 1) * supportSpeedFactor * (ownSpeedLine ? 1 + ownSpeedLine.value / 100 : 1) : Math.max(0.0001, castSpeed.factor || 1) * supportSpeedFactor;
  // Finisher Combo (census item #2; game recipe 928460928: increased Attack Speed on the Combo Starter tag 6000411): the Starter steps
  // of the cycle take the line in their own increased pool, (1 + I) ÷ (1 + I + X) times longer; the Finisher keeps the plain pool.
  const starterSpeed = profile.cycle?.steps?.length ? sum((supports.effects.combo || []).filter((line) => line.kind === "starterSpeed" && line.status === "In calc")) : 0;
  const starterPool = (pooledAttackSpeed ? attackSpeed.increasedPercent : 0) + supportIncreasedSpeed;
  const starterFactor = starterSpeed ? Math.max(0, 1 + starterPool / 100) / Math.max(1e-9, 1 + (starterPool + starterSpeed) / 100) : 1;
  // Combo cycle extras (census item #9; src/combo-points.js comboExtraState): the Starters' / Finishers' additional Attack and Cast
  // Speed (game recipes 599932864 / 856471424) divide those steps' time, and "+N Combo Finisher charge(s)" (440107424) repeats the
  // Finisher steps N more times in the cycle (each Finisher consumes the Starters' points, manual 1001013029).
  // Crescent Slash: Raid (chunk 8; recipes 214972384 / 232673104: additional Attack Speed on the Starter / Finisher tags of this skill): the same step division.
  const comboSupportSpeed = (supports.effects.combo || []).filter((line) => line.kind === "stepSpeedStarter" || line.kind === "stepSpeedFinisher").map((line) => ({ source: line.source, text: `${line.value >= 0 ? "+" : ""}${line.value}% additional Attack and Cast Speed for Combo ${line.kind === "stepSpeedStarter" ? "Starters" : "Finishers"}` }));
  const comboExtras = profile.cycle?.steps?.length ? comboExtraState([...modifierTexts, ...comboSupportSpeed]) : null;
  const isStarterStep = (step) => step.keys.some((key) => /^starter/i.test(key));
  const isFinisherStep = (step) => step.keys.some((key) => /^finisher/i.test(key));
  const finisherRepeats = 1 + (comboExtras?.extraFinishers || 0);
  const cycleStepList = profile.cycle?.steps?.length ? profile.cycle.steps.flatMap((step) => isFinisherStep(step) && finisherRepeats > 1 ? Array.from({ length: finisherRepeats }, () => step) : [step]) : null;
  const comboStepChanged = Boolean(comboExtras && (comboExtras.starterSpeedFactor !== 1 || comboExtras.finisherSpeedFactor !== 1 || finisherRepeats > 1));
  const cycleStepSeconds = starterFactor !== 1 || comboStepChanged ? cycleStepList.map((step) => step.seconds * (isStarterStep(step) ? starterFactor / (comboExtras?.starterSpeedFactor || 1) : 1) / (isFinisherStep(step) ? comboExtras?.finisherSpeedFactor || 1 : 1)) : null;
  if (cycleStepSeconds && starterFactor !== 1) notes.push(`${profile.name}: ${starterSpeed}% Attack Speed for the Combo Starters (Finisher Combo): the Starter attacks take ×${round(starterFactor)} their time (increased pool ${round(starterPool)}%).`);
  if (comboExtras?.starterSpeed.length) notes.push(`${profile.name}: ${comboExtras.starterSpeed.map((line) => `"${line.text}" (${line.source})`).join(", ")}: the Starter steps take ÷${round(comboExtras.starterSpeedFactor)} their time (game recipe 599932864: additional Attack / Cast Speed on the Combo Starter tag).`);
  if (comboExtras?.finisherSpeed.length) notes.push(`${profile.name}: ${comboExtras.finisherSpeed.map((line) => `"${line.text}" (${line.source})`).join(", ")}: the Finisher steps take ÷${round(comboExtras.finisherSpeedFactor)} their time (game recipe 856471424: additional Attack / Cast Speed on the Combo Finisher tag).`);
  if (finisherRepeats > 1) notes.push(`${profile.name}: +${comboExtras.extraFinishers} Combo Finisher charge(s) (${comboExtras.finisherCharges.map((line) => line.source).join(", ")}; game field 2012108): the cycle holds ${finisherRepeats} Finishers after the two Starters; the first consumes the Starters' points, each later one only the points gained since the previous Finisher's consume (SS14 client 0x141defa80: each step its own instance, stamped with the Combo Points then held, a Finisher consuming 100% of them; provisional timing).`);
  if (comboExtras?.sequenceReset.length) notes.push(`${profile.name}: "${comboExtras.sequenceReset[0].text}" (${comboExtras.sequenceReset[0].source}): the cycle is played without pauses (best case), so the reset time has no DPS effect.`);
  const baseUseTime = cycleStepSeconds ? cycleStepSeconds.reduce((total, seconds) => total + seconds, 0) : profile.cycle?.useTimeSeconds ?? timing?.useTimeSeconds ?? null;
  const useTime = baseUseTime != null ? baseUseTime / (speedType === "cast-speed" || speedType === "attack-speed" ? speedFactor : 1) : null;
  // The cycle's real step list for the tick loop (src/tick-plain-skills.js cycleSteps; research/spectral-slash-cycle-rate-2026-11-14.md):
  // the steps that make baseUseTime, each with its base seconds, its component keys, its share and, on a Finisher step, its place among
  // the cycle's Finishers (1 = the first; a `<key>:chargeN` component lands on the N-th).
  const exposedCycleSteps = cycleStepList ? (() => {
    let finishers = 0;
    return cycleStepList.map((step, index) => ({ seconds: cycleStepSeconds?.[index] ?? step.seconds, keys: [...step.keys], ...(step.share !== undefined ? { share: step.share } : {}), finisher: isFinisherStep(step) ? ++finishers : null }));
  })() : null;
  if (hitPool) hitPool.addSupportCooldown(supports.cooldown);
  const cooldownRecovery = hitPool ? hitPool.cooldown().entries : [...cooldownLines, ...supports.cooldown];
  const cooldownFactor = Math.max(0.0001, 1 + sum(cooldownRecovery.filter((line) => !line.additional)) / 100) * product(cooldownRecovery.filter((line) => line.additional));
  // A hero's flat cooldown reduction on events (Clockwork Core: -0.1 s per crit) as a divisor of the cooldown.
  // frameSnap (internal combat condition frameSnapCooldowns, off; not tied to the Config toggle, which snaps Reaps only; src/frame-snapping.js): each charge's cooldown
  // rounds up to whole 1/30 s frames.
  const effectiveCooldown = !(timing?.cooldownSeconds > 0) ? 0
    : frameSnap ? snapToFrames(timing.cooldownSeconds / cooldownFactor / Math.max(1, heroEffects?.cooldownFactor || 1)) / Math.max(1, timing.charges || 1)
      : timing.cooldownSeconds / cooldownFactor / Math.max(1, timing.charges || 1) / Math.max(1, heroEffects?.cooldownFactor || 1);
  const terra = profile.useModel?.kind === "terra" ? profile.useModel : null;
  // Spell Burst stacks and full charge time (hoisted 2026-10-27 so Activation Medium: Burst Activation can read the charge time as its
  // trigger interval; the computation is unchanged).
  // Σ "+N Max Spell Burst" × Π additional (Flash Flood's "Halves Spell Burst Upper Limit", game affix 101070006; src/max-spell-burst.js).
  const maxSpellBurst = maxSpellBurstTotal(modifierTexts);
  // A part-time stack (Bing's Multi-Coupling Equation with an alternating Defensive buff; src/bing-traits.js coupling.partial, 10 T claim
  // audit H1): its time share joins as an average, so each activation's automatic casts and Ingenuity Overload's take it.
  const spellBurstStacks = Math.floor(maxSpellBurst) + Math.max(0, Number(heroEffects?.spellBurstPartialStacks) || 0);
  // Play Safe (game affix 8855: node 114 copies P1% of Cast Speed attr 60021 to Spell Burst Charge Speed attr 63601, mod 3
  // increased → increased and mod 4 additional → additional): only the character's Cast Speed (the build's cast-rate ledger,
  // increased and additional) joins the charge; the skill's own support lines ("+X% Cast Speed for the supported skill") do not
  // (user decision 2026-10-19 on a Google AI Mode answer, not tested in game).
  // `castSpeed.character` (planner): the same ledger without the setup's own support lines (Quick Decision).
  const characterCast = castSpeed.character || castSpeed;
  const castSpeedIncreasedPercent = Number.isFinite(characterCast.increasedPercent) ? characterCast.increasedPercent : ((castSpeed.factor || 1) - 1) * 100;
  const castSpeedAdditionalFactor = Number.isFinite(characterCast.additionalFactor) ? characterCast.additionalFactor : 1;
  const castToChargeLines = skillTags.has("Spell") ? modifierTexts.flatMap((line) => {
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(CAST_SPEED_TO_CHARGE_LINE);
    if (!match) return [];
    const share = Number(match[1]) * (line.multiplier ?? 1) / 100;
    const increased = share * castSpeedIncreasedPercent;
    const additional = share * (castSpeedAdditionalFactor - 1) * 100;
    const note = `(${line.source}: ${round(share * 100)}% of the character's Cast Speed, not the skill's support lines; game affix 8855; user decision 2026-10-19)`;
    return [
      ...(increased ? [{ source: line.source, text: `${round(increased)}% Spell Burst Charge Speed`, note: `+${round(increased)}% increased Cast Speed → Spell Burst Charge Speed ${note}`, castSpeedShare: true }] : []),
      ...(additional ? [{ source: line.source, text: `${round(additional)}% additional Spell Burst Charge Speed`, note: `${round(additional)}% additional Cast Speed → additional Spell Burst Charge Speed ${note}`, castSpeedShare: true }] : [])
    ];
  }) : [];
  const spellBurstCharge = spellBurstChargeTime([...modifierTexts, ...castToChargeLines, ...supports.effects.spellBurst.filter((line) => line.kind === "chargeIncreased" || line.kind === "chargeAdditional")
    .map((line) => ({ source: line.source, text: `${line.value}% ${line.kind === "chargeAdditional" ? "additional " : ""}Spell Burst Charge Speed` }))]);
  spellBurstCharge.castSpeedShare = castToChargeLines.map((line) => ({ source: line.source, text: line.note }));
  // Fifth Cosmic Velocity (Youga – Spacetime Illusion revival; hero trait audit B4, provisional): "100% chance to immediately gain 2
  // stack(s) of Spell Burst Charge. Interval: 0.03s": stacks gained on that interval fill Max Spell Burst in interval × ⌈N ÷ gain⌉
  // (÷ chance), whichever of that and the charge time is shorter.
  for (const line of modifierTexts) {
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(SPELL_BURST_INTERVAL_GAIN);
    if (!match || spellBurstStacks < 1) continue;
    const chance = Math.min(1, Number(match[1]) / 100), gain = Number(match[2]), interval = Number(match[3]);
    if (!(chance > 0 && gain > 0 && interval > 0)) continue;
    const fill = interval / chance * Math.ceil(spellBurstStacks / gain);
    if (fill < spellBurstCharge.seconds) Object.assign(spellBurstCharge, { seconds: fill, intervalGain: { source: line.source, text: line.text, seconds: fill } });
  }
  // Triggered use model (Activation Mediums: interval / always / Boss / Elite within reach of the dummy). Manual "Cast",
  // "Use", "Trigger": a triggered skill "generates skill effects directly without any action", so it has no use time.
  // Rate: one use per max(trigger interval, effective cooldown[, Terra duration: one ground effect at a
  // time]). Modeled as triggered only (best case: no manual casts, so "-X% additional damage for manually used Supported
  // Skill" does not apply); a skill the medium cannot trigger here (channel, rate-driven, combo) is used and takes it.
  // Wind Rhythm: its share of the Cast Speed bonus shortens the trigger cooldown (interval ÷ (1 + share × bonus); provisional).
  // 1 / max(interval, effective cooldown) is user-confirmed 2026-10-12 (Q2): Frost Shield with Activation Medium: Boss (T1,
  // 11 m, Duration +13%, no Cooldown Recovery line) fires every 6 s, its cooldown, and a Cooldown Recovery roll on the medium
  // lowers the skill's cooldown. The Terra-duration cap, the first use at the first trigger and Wind Rhythm's share stay provisional.
  const sentry_ = Boolean(profile.sentry);
  // A Combo skill (a `cycle` profile) is triggered too (batch 7 damage fixes 2026-10-28): each trigger plays the next step of its cycle
  // (Starter, Starter, Finisher), so the cycle takes one trigger interval per step; only triggered uses are modeled, so its manual-use
  // penalty does not apply (provisional, open question `am-trigger-combo-step`). Before, the cycle ignored the trigger and took the
  // penalty (Serpent Beam + Activation Medium: Rhythm ×0.2) while the trigger clause read "only triggered".
  const triggerLine = !channel && !rateModel && !release && !inactiveReason ? supports.triggers[0] || null : null;
  const castBonus = Math.max(0, (speedType === "cast-speed" ? castSpeed.factor || 1 : speedFactor) - 1);
  // Activation Medium: Multistrike (2026-10-14): one trigger per Max Multistrike Count event of the build's multistriking hits
  // (the planner's hit pass: multistrikeEventsPerSecond), at most one per the medium's interval; before the rate is measured
  // the medium's interval (best case for that pass); no events, no trigger (the skill is used manually).
  // frameSnap: the medium's own interval (a timer) rounds up to whole 1/30 s frames; the Multistrike event rate does not.
  const timerInterval = (seconds) => snapToFrames(seconds, frameSnap);
  const maxMultistrikeInterval = triggerLine?.kind === "maxMultistrike" ? (multistrikeEventsPerSecond == null ? timerInterval(triggerLine.interval) : multistrikeEventsPerSecond > 0 ? Math.max(timerInterval(triggerLine.interval), 1 / multistrikeEventsPerSecond) : null) : undefined;
  // Activation Medium event triggers (census items #8 / #12; src/activation-medium-events.js): the event interval the support
  // resolution read from the hit pass (max(gate, 1 / events per second); undefined before the pass measured it, null without
  // events: then the skill is used manually); Burst Activation: every full Spell Burst charge (2 s ÷ Charge Speed, game manual),
  // needing Max Spell Burst of at least 1.
  const burstActivation = triggerLine?.kind === "amEvent" && triggerLine.event === "burstFull";
  // Spell Burst Charge gained on your uses (src/spell-burst-refill.js; 15 T Chain Lightning audit G1, 2026-11-18): every use of yours that
  // raises 1000074 rolls the refill lines ("+X% chance to immediately gain N stack(s) of Spell Burst Charge when using a skill", record 32278),
  // the other skills' uses from the measuring pass (`spellBurstUseStreams`: presses, each channel loop step, a player cast's Spell Burst
  // automatic casts, Multistrike repeats; never a triggered use). Burst Activation's casts are triggered (1000060), so they roll nothing, and
  // its row (record 987090624 row 1, no trigger) casts at the first frame Spell Burst is full: the walk's activations, every activation
  // emptying the charge (C1); its mean interval is the trigger interval. Applied where it fills faster than the regular charge alone.
  const refillLines = spellBurstStacks >= 1 ? spellBurstUseGainLines(modifierTexts, lineText) : [];
  const otherUseStreams = refillLines.length && Array.isArray(spellBurstUseStreams) ? spellBurstUseStreams.filter((stream) => stream && stream.setupKey !== setup?.setupKey && stream.usesPerSecond > 0) : [];
  const refillSummary = (walked, streams, activationUses) => ({ lines: refillLines.map((line) => ({ source: line.source, text: line.text })), streams: streams.map((stream) => ({ name: stream.name, usesPerSecond: round(stream.usesPerSecond), from: stream.from || null })),
    regularSeconds: round(spellBurstCharge.seconds), activationUses, usesPerSecond: round(walked.usesPerSecond), successesPerSecond: round(walked.successesPerSecond), activationsPerSecond: round(walked.activationsPerSecond), seconds: walked.fillSeconds,
    text: `${round(walked.usesPerSecond)} uses/s of yours raise 1000074 (${streams.map((stream) => `${stream.name} ${round(stream.usesPerSecond)}`).join(", ")}${activationUses ? `, + ${round(activationUses)} automatic casts per activation` : ""}) and roll ${refillLines.map((line) => `${line.source}: ${round(line.chance * 100)}% for +${line.stacks}`).join(", ")} (record 32278; its 0.03 s gate: one success a frame): ${round(walked.successesPerSecond)} gains/s; with the regular charge (full in ${round(spellBurstCharge.seconds)} s) a 30 Hz walk of the charge fills Max Spell Burst ${round(spellBurstStacks)} ${round(walked.activationsPerSecond)} times a second, every ${round(walked.fillSeconds)} s on average, each activation emptying it (C1; 15 T Chain Lightning audit G1, provisional)` });
  if (burstActivation && refillLines.length && otherUseStreams.length && Number.isFinite(spellBurstCharge.seconds) && spellBurstCharge.seconds > 0) {
    const walked = spellBurstRefillWalk({ fullChargeSeconds: spellBurstCharge.seconds, maxSpellBurst: spellBurstStacks, lines: refillLines, streams: otherUseStreams });
    if (walked.fillSeconds < spellBurstCharge.seconds) Object.assign(spellBurstCharge, { refill: refillSummary(walked, otherUseStreams, 0) }, { seconds: walked.fillSeconds });
  }
  const amEventInterval_ = triggerLine?.kind !== "amEvent" ? undefined
    : burstActivation ? (spellBurstStacks >= 1 && Number.isFinite(spellBurstCharge.seconds) && spellBurstCharge.seconds > 0 ? spellBurstCharge.seconds : null)
      : triggerLine.eventIntervalSeconds > 0 ? triggerLine.eventIntervalSeconds : null;
  const triggerInterval = amEventInterval_ !== undefined ? amEventInterval_ : maxMultistrikeInterval !== undefined ? maxMultistrikeInterval : triggerLine?.interval > 0 ? timerInterval(triggerLine.castSpeedScaled ? castSpeedScaledTriggerInterval(triggerLine.interval, { share: supports.castSpeedShare ?? 0, castIncreasedPercent: castBonus * 100 }) : triggerLine.interval) : null;
  const triggered = triggerInterval > 0;
  // A triggered Combo skill: one cycle step per trigger (above); `triggerStepSeconds` is one trigger's interval (cooldown-capped).
  const cycleTriggerSteps = triggered && cycleStepList?.length ? cycleStepList.length : 0;
  // One projectile at a time (Whirlwind Blade): a new one fires only after the last was recalled, so its life is part of every cycle.
  const heldProjectileSeconds = profile.heldProjectile?.seconds || 0;
  const triggerStepSeconds = triggered ? Math.max(triggerInterval, effectiveCooldown, terra?.durationSeconds || 0, heldProjectileSeconds) : null;
  // "+X% damage for Triggered Skills" (census #15) rides with the triggered-skill lines as an increased item (src/combat-states.js).
  function pushTriggered(...lines) { for (const line of lines) (line.increased ? supports.increased : supports.additional).push(line); }
  if (triggered) {
    supports.additional.push(...supports.triggeredAdditional);
    // Character lines for triggered skills (Hair-trigger, src/combat-states.js; core audit batch B3).
    pushTriggered(...triggeredSkillAdditional);
    if (triggerLine.kind === "amEvent") notes.push(`${profile.name}: ${triggerLine.source.replace(/^Support: /, "")} event trigger: ${burstActivation ? spellBurstCharge.refill ? `every full Spell Burst charge, ${round(triggerInterval)} s on average: ${spellBurstCharge.refill.text}; then its own Spell Burst` : `every full Spell Burst charge, ${round(triggerInterval)} s (Max Spell Burst ${spellBurstStacks}; 2 s ÷ ${round(1 + spellBurstCharge.increasedPercent / 100)} ÷ ${round(spellBurstCharge.additionalFactor)}, game manual), then its own Spell Burst` : triggerLine.eventRateText || `every ${round(triggerInterval)} s`} (provisional event source, src/activation-medium-events.js).`);
    notes.push(`${profile.name}: triggered by ${triggerLine.source.replace(/^Support: /, "")} every ${round(triggerInterval)} s (no use time); uses per second = 1 / max(${round(triggerInterval)} s, cooldown ${round(effectiveCooldown)} s${terra ? `, Terra ${terra.durationSeconds} s` : ""}) — user-confirmed 2026-10-12 (Q2: Frost Shield + Boss every 6 s, its cooldown)${terra ? "; the Terra-duration cap is provisional" : ""}. Only triggered uses are modeled, so the manual-use penalty does not apply.`);
    if (cycleTriggerSteps) notes.push(`${profile.name}: a Combo skill: each trigger plays the next step of its ${cycleTriggerSteps}-step cycle, so a cycle takes ${cycleTriggerSteps} × ${round(triggerStepSeconds)} s = ${round(cycleTriggerSteps * triggerStepSeconds)} s (its own step times do not apply; provisional, open question am-trigger-combo-step).`);
  } else if (supports.manualPenalty.length) {
    supports.additional.push(...supports.manualPenalty);
    notes.push(`${profile.name}: no Activation Medium trigger applies to this skill here, so its uses are manual and take ${supports.manualPenalty.map((line) => `${line.value}%`).join(", ")} additional damage.`);
  }
  // A skill a gear / pact line triggers (src/item-triggered-skills.js, role "item-trigger") is a triggered skill too.
  if (!triggered && setup?.role === "item-trigger") pushTriggered(...triggeredSkillAdditional);
  // Selena – Sing with the Tide's Bard Song (hero trait audit B13; src/selena-leftover-traits.js bardSongState, provisional): in the Bard
  // state a non-channeled, non-instant skill channels Bard Song instead of its cast, and the bubble uses it once at max stacks: one use
  // every stacks per bubble × 0.8 s ÷ the skill's speed factor (Cast Speed for Spells, Attack Speed for Attacks), never faster than its
  // cooldown or Terra duration allow. Triggered, rate-driven, channel, Combo and Sentry skills keep their own use model.
  const bardSpec = heroEffects?.bardSong && !triggered && !rateModel && !release && !channel && !profile.cycle && !sentry_ && !heroEffects?.bombs && !inactiveReason && useTime != null ? heroEffects.bardSong : null;
  const bardSongUseTime = bardSpec ? bardSpec.stacksPerBubble * bardSpec.intervalSeconds / Math.max(0.0001, speedFactor) : null;
  const manualUseTime = bardSongUseTime ?? useTime;
  const intervalSeconds = triggered ? (cycleTriggerSteps ? cycleTriggerSteps * triggerStepSeconds : triggerStepSeconds) : rateModel ? (rateModel.usesPerSecond > 0 ? 1 / rateModel.usesPerSecond : null) : release && useTime != null ? useTime * (channelState?.fullStacks ?? 5) : manualUseTime != null ? Math.max(manualUseTime + heldProjectileSeconds, effectiveCooldown, terra?.durationSeconds || 0) : null;
  const bardSong = bardSpec ? { prebuilt: Boolean(bardSpec.prebuilt), stacksPerBubble: bardSpec.stacksPerBubble, channelIntervalSeconds: round(bardSpec.intervalSeconds / Math.max(0.0001, speedFactor)), bubbleSeconds: round(bardSongUseTime), castUseTimeSeconds: round(useTime), bound: bardSongUseTime >= Math.max(effectiveCooldown, terra?.durationSeconds || 0) ? "bubble" : effectiveCooldown >= (terra?.durationSeconds || 0) ? "cooldown" : "terra", detail: bardSpec.detail } : null;
  if (bardSong) notes.push(`${profile.name}: Bard Song (Sing with the Tide, hero trait audit B13, provisional): channeled instead of cast; a bubble every ${bardSong.stacksPerBubble} stack(s) × ${bardSpec.intervalSeconds} s ÷ speed ×${round(speedFactor)} = ${bardSong.bubbleSeconds} s uses it once (its cast takes ${bardSong.castUseTimeSeconds} s)${bardSong.bound !== "bubble" ? `; its ${bardSong.bound === "cooldown" ? `cooldown (${round(effectiveCooldown)} s)` : `Terra duration (${terra.durationSeconds} s)`} still sets the use rate` : ""}.`);
  // The bubble's use (game affix 311410880, tag 6300041 "released by the bubble"): the skill does not carry the Channeled tag, but rows 2 and 3
  // hand it the Channeled-only All Damage lines: increased max(0, Σ Channeled − Σ untagged), additional Π Channeled ÷ Π untagged, with a
  // +25% write that cancels Bard's own −20% inside that ratio. So "+X% [additional] Channeled Skill Damage" reaches it, a net negative
  // increased sum does not, and the Bard line never does. Hits only: the rows write attr 5719, not the ailment attr 3604.
  if (bardSong) {
    const channeledOnly = (hitPool ? hitPool.lineDamageItems() : damageLines).filter((line) => line.scope?.skillTags?.size === 1 && line.scope.skillTags.has("Channeled") && !line.scope.damageTypes && !line.scope.hitOnly && !line.condition && !BARD_STATE_LINE.test(line.source || ""));
    const increasedSum = channeledOnly.filter((line) => line.layer === "increased").reduce((sum, line) => sum + line.value, 0);
    for (const line of channeledOnly) if (line.layer !== "increased" || increasedSum > 0) { line.scope = { ...line.scope, skillTags: null }; line.text = `${line.text} (Bard Song bubble: game affix 311410880)`; hitPool?.retagLineDamage(line); }
  }
  // Multistrike (Attack skills; reference data glossary: "Chance to perform an additional attack … If the chance exceeds 100%, one
  // additional attack will be performed with every 100% of the chance. +20% Attack Speed during Multistrikes … Mobility,
  // Channeled Skills, and Sentry skills cannot Multistrike"). Expected extra attacks E = chance ÷ 100 (whole attacks plus the
  // remainder as a chance of one more); the k-th Multistrike deals +k × increment% (the Multistrike Count rises by one per
  // attack; provisional reading of "increasing damage"); a cycle lasts 1 + E ÷ 1.2 attack intervals. Provisional.
  // Thunder Slash: Steep Strike chance → additional Multistrike damage increment (steepStrikeState), its own ledger line.
  const skillIncrementAdditionalPercent = canMultistrike ? steepStrike?.incrementAdditionalPercent || 0 : 0;
  // "+N initial Multistrike Count" (Preemptive Strike, game affix 713584 field 2006252; src/passive-support-lines.js): every count
  // of the sequence shifts by N (multistrikeSequence initialCountBonus; the user-accepted reading for Cat's Punches), so it moves
  // damage only through the Multistrike damage increment. Its own ledger line.
  const initialCountLines = canMultistrike ? supports.effects.multistrike.filter((line) => line.kind === "initial" && line.value > 0) : [];
  const initialCountBonus = Math.floor(sum(initialCountLines));
  // Thunder Slash: Flurry / Keen Edge (skill-mechanics census batch 2; multistrikeSequence maxCountCap / allAtMax / repeatSpeedAdditionalPercent).
  const flurryLine = canMultistrike ? supports.effects.multistrike.find((line) => line.kind === "flurry" && line.value >= 0) || null : null;
  const repeatSpeedLines = canMultistrike ? supports.effects.multistrike.filter((line) => line.kind === "repeatSpeed" && line.value) : [];
  const sequenceExtra = { ...(flurryLine ? { maxCountCap: flurryLine.value, allAtMax: true } : {}), ...(repeatSpeedLines.length ? { repeatSpeedAdditionalPercent: (repeatSpeedLines.reduce((factor, line) => factor * (1 + line.value / 100), 1) - 1) * 100 } : {}) };
  const plainMultistrike = canMultistrike ? multistrikeSequence({ chancePercent: multistrikeChance, incrementPercent: multistrikeIncrement, ...sequenceExtra }) : null;
  const initialMultistrike = canMultistrike ? multistrikeSequence({ chancePercent: multistrikeChance, incrementPercent: multistrikeIncrement, initialCountBonus, ...sequenceExtra }) : null;
  const multistrike = canMultistrike ? multistrikeSequence({ chancePercent: multistrikeChance, incrementPercent: multistrikeIncrement, skillIncrementAdditionalPercent, initialCountBonus, ...sequenceExtra }) : null;
  // "Adds X% of <A> Damage as <B> Damage during Multistrike": the repeat attacks only (the user-accepted Stalker reading, 2026-10-14: "during
  // Multistrike" covers the repeats, not the triggering first hit), so the added part × the repeat share E ÷ (1 + E) of the attacks (provisional).
  if (multistrike && multistrike.expectedExtraAttacks > 0) for (const line of modifierTexts) {
    const match = lineText(line).match(DURING_MULTISTRIKE_ADDED_AS);
    if (!match) continue;
    const share = multistrike.expectedExtraAttacks / (1 + multistrike.expectedExtraAttacks);
    supports.addedAs.push({ source: line.source, text: `${lineText(line)} × ${round(share)} repeat share (E ÷ (1 + E), E = ${round(multistrike.expectedExtraAttacks)}; provisional)`, from: capType(match[2]), to: capType(match[3]), percent: Number(match[1]) * (line.multiplier ?? 1) * share });
  }
  if (flurryLine) notes.push(`${profile.name}: ${flurryLine.source.replace(/^Support: /, "")}: Max Multistrike Count ${flurryLine.value}; every repeat attack is deemed at it (its increment, its bonus and a Max Multistrike Count event each; game affix 711264384, provisional)`);
  if (repeatSpeedLines.length) notes.push(`${profile.name}: ${repeatSpeedLines.map((line) => line.source.replace(/^Support: /, "")).join(", ")}: +${round(sequenceExtra.repeatSpeedAdditionalPercent)}% additional Attack Speed on the repeat attacks (game affix 491653184; provisional)`);
  if (multistrike) {
    supports.additional.push({ source: "Multistrike (supports)", text: `Multistrikes: ${round(plainMultistrike.expectedExtraAttacks)} extra attacks per attack at +${multistrikeIncrement}% increasing damage each; average ×${round(plainMultistrike.averageDamageFactor)} per strike (provisional)`, value: (plainMultistrike.averageDamageFactor - 1) * 100, category: "Additional damage" });
    if (initialCountBonus && initialMultistrike.damagePerCycle !== plainMultistrike.damagePerCycle) supports.additional.push({ source: initialCountLines.map((line) => line.source).join(" + "), text: `+${initialCountBonus} initial Multistrike Count: every count of the sequence shifts by ${initialCountBonus} (counts ${1 + initialCountBonus}…${initialMultistrike.maxCount}), each strike +${initialCountBonus} × ${round(multistrike.effectiveIncrementPercent)}% increment (game affix 713584; shift reading user-accepted 2026-10-14)`, value: (initialMultistrike.damagePerCycle / plainMultistrike.damagePerCycle - 1) * 100, category: "Additional damage" });
    if (skillIncrementAdditionalPercent) supports.additional.push({ source: `${profile.name}: Steep Strike chance → Multistrike damage increment`, text: `+${steepStrike.perChance}% additional Multistrike damage increment per +1% Steep Strike chance × ${round(steepStrike.chancePercent)}% = +${round(skillIncrementAdditionalPercent)}%: increment ${multistrikeIncrement}% → ${round(multistrike.effectiveIncrementPercent)}% (skill text; manual 1001020126; its own factor beside Cat's Scratch, game affixes 570299392 and 889828224; was: user-supplied answer 2026-10-14; provisional)`, value: (multistrike.damagePerCycle / initialMultistrike.damagePerCycle - 1) * 100, category: "Additional damage" });
    notes.push(`${profile.name}: Multistrike ${multistrikeChance}% → ${round(multistrike.expectedExtraAttacks)} extra attacks per attack (reference data glossary), cycle ${round(multistrike.cycleIntervals)} attack intervals (+20% Attack Speed during Multistrikes), strikes ×${round(multistrike.rateFactor)} per second; increasing damage read as +${multistrikeIncrement}% × count (provisional).`);
    // Hero states on the sequence (Erika: Stalker, initial Multistrike Count, Hunting Instinct; src/erika-wind-stalker.js): each
    // step's expected damage per sequence over the previous step's, as its own additional-damage line (the working).
    const base = { chancePercent: multistrikeChance, incrementPercent: multistrikeIncrement, skillIncrementAdditionalPercent, initialCountBonus, ...sequenceExtra };
    let previous = multistrike.damagePerCycle;
    for (const step of multistrikeEffects?.steps || []) {
      const damage = multistrikeStatesDamage(base, step.states);
      if (previous > 0 && Math.abs(damage / previous - 1) > 1e-12) supports.additional.push({ source: step.source, text: step.text, value: (damage / previous - 1) * 100, category: "Additional damage" });
      previous = damage;
    }
    if (multistrikeEffects?.steps?.length) {
      multistrike.heroDamagePerCycle = previous;
      multistrike.heroFactor = previous / multistrike.damagePerCycle;
    }
  }
  // Thunder Slash's stored Steep Strike attempts (steepStrikeState / steepAttemptShare; user-supplied mechanism 2026-10-14,
  // provisional; per-attack check and Big Stride's held window confirmed by a user-supplied answer 2026-10-15): 1 per 2 repeat
  // attacks, or every use inside Big Stride's window while Moved recently holds.
  if (steepStrike?.multistrikeAttempts) {
    // Keen Edge (game affix 62898652): "+N to the number of Multistrikes required for the supported skill's Steep Strike attempts" (at least 1).
    const attemptRepeatsDelta = (supports.effects.steepStrike || []).filter((line) => line.kind === "attemptRepeats").reduce((total, line) => total + (Number(line.value) || 0), 0);
    if (attemptRepeatsDelta) steepStrike.multistrikeAttempts = { ...steepStrike.multistrikeAttempts, perRepeats: Math.max(1, (steepStrike.multistrikeAttempts.perRepeats || 2) + attemptRepeatsDelta), perRepeatsDelta: attemptRepeatsDelta };
    const attempts = steepAttemptShare({ multistrike, perRepeats: steepStrike.multistrikeAttempts.perRepeats || 2, window: Boolean(steepStrike.window) && movedRecently, ownRepeatsPerUse: steepStrike.multistrikeAttempts.ownRepeatsPerUse || 0 });
    Object.assign(steepStrike, { share: attempts.share, attempts });
    notes.push(`${profile.name}: Steep Strike attempts (user-supplied mechanism 2026-10-14, provisional): 1 per ${steepStrike.multistrikeAttempts.perRepeats || 2} repeat attacks; ${round(attempts.repeatsPerUse)} repeat attacks per use (${multistrike ? `Multistrike ${round(multistrike.expectedExtraAttacks)} per sequence ÷ ${round(1 + multistrike.expectedExtraAttacks)} attacks` : "no Multistrike model: the skill's own repeated-sweep reading"}) → min(1, ${round(attempts.repeatsPerUse)} ÷ ${steepStrike.multistrikeAttempts.perRepeats || 2}) = ${round(attempts.fromRepeats)} Steep Strikes per use (0.1 before 2026-10-14)${steepStrike.window ? movedRecently ? `; ${steepStrike.window.source.replace(/^Support: /, "")}: every use within ${steepStrike.window.seconds} s after moving ${steepStrike.window.meters} m is a Steep Strike, the window held open while Moved recently is on (user-supplied reading, best case) → 1 per use` : `; ${steepStrike.window.source.replace(/^Support: /, "")}: Moved recently is off, so its window is closed` : ""}. Each Steep Strike replaces that use's Sweep Slash.${steepStrike.clusterGenerated > 0 ? ` ${steepStrike.extraAttempts.map((line) => line.source.replace(/^Support: /, "")).join(", ")}: each launched Steep Strike generates ${steepStrike.clusterGenerated} additional Steep Strikes, siblings of it that cannot hit the same enemy (hit rule bHitBrother 0; SS14 client)${steepStrike.clusterHits > 0 ? `, but the skill has Shotgun Effect (${steepStrike.shotgunEffect.source.replace(/^Support: /, "")}): all land → Steep Strike hits × ${1 + steepStrike.clusterHits} (no attempt spent, no Multistrike added)` : ": on the one dummy only one of them lands (no extra hits)"}.` : ""}`);
  }
  // Spell Burst (game manual, pasted by the user 2026-10-12; sourced): "When Spell Burst is fully charged, casting a Spell
  // Skill will activate Spell Burst, which will consume all stacks of Spell Burst charged and automatically cast the Spell
  // Skill the same number of times as the number of stacks consumed." "Skills that are cast by Spell Burst, skills with a
  // cooldown, Summon Skills, Sentry Skills, Channel Skills, and Triggered Skills cannot activate Spell Burst." "The Spell
  // Skill that activates the Spell Burst is considered a skill cast by Spell Burst." "Spell Burst can only be cast when Max
  // Spell Burst is no lower than 1." Full charge time: spellBurstChargeTime. Per activation: the activating cast plus N
  // automatic casts (N = Max Spell Burst; a full charge holds that many stacks); all 1 + N are cast by Spell Burst, so
  // "… cast by Spell Burst" lines raise them all. Activations per second = 1 / max(full charge time, use interval).
  // User-confirmed 2026-10-12 (listed in the recount assumptions): the N automatic casts neither take up nor add to manual
  // cast time; the activation period is max(charge time, use interval), not rounded up to a whole number of use intervals.
  // Combo-cycle skills stay out (user-confirmed 2026-10-12: Combo skills cannot Spell Burst); rate-model skills stay out (user-confirmed 2026-10-12 for Corrosion Focus; the other rate-model skills follow by the same reading). The automatic casts cannot activate Spell Burst
  // again (manual), so they add no activations.
  // A rate-model skill whose own text lets it activate Spell Burst (Rehan – Hero's Resourcefulness: "Burst becomes Burst Blast and
  // can activate Spell Burst"; hero trait audit B10, src/rehan-traits.js burstProfile) is not blocked by its rate model.
  // "The supported skill can activate Spell Burst" (Psychic Burst, Lightning Storm: Raging Storm, Moon Strike: Wax and Wane; game recipe
  // 550492864; condition-unread batch 3) lifts the skill's own blocks except a non-Spell or Triggered skill's (provisional, open question
  // spell-burst-can-activate).
  const supportCanActivate = (supports.effects.spellBurst || []).some((line) => line.canActivate && ["In calc", "Provisional"].includes(line.status));
  // Barrier Burst (Necklace of Firebird's Main Skill) activates Spell Burst: user-confirmed in game 2026-11-09 ("It can spell burst"; the
  // 10 T claim build). The game records point the other way (its 0.4 s cooldown needs label 3001604, "skills with the given tag can Spell
  // Burst even with a cooldown", which nothing on that build grants); the user's observation wins. The profile flag lifts the cooldown and
  // rate-model blocks for Barrier Burst only (src/planner.js itemMainSkillProfile).
  const spellBurstUserConfirmed = Boolean(profile.spellBurstUserConfirmed);
  const spellBurstBlock = !skillTags.has("Spell") ? "it is not a Spell Skill"
    : supportCanActivate ? (triggered && !burstActivation ? "it is a Triggered Skill (cast by an Activation Medium)" : null)
    : spellBurstUserConfirmed ? null
    : timing?.cooldownSeconds > 0 ? "it has a cooldown" : triggered && !burstActivation ? "it is a Triggered Skill (cast by an Activation Medium)"
    : channel ? "it is a Channel Skill" : sentry_ ? "it is a Sentry Skill" : skillTags.has("Summon") ? "it is a Summon Skill"
    : rateModel && !profile.spellBurstAllowed ? "its uses come from a rate model, not casts (user-confirmed for Corrosion Focus)" : profile.cycle ? "it is a Combo skill (user-confirmed: Combo skills cannot Spell Burst)" : heroEffects?.spellBurstBlock || null;
  // Ingenuity Overload's buff 82189 carries label 3001606 on the Main Skill: a triggered cast may Spell Burst (client 0x141e4e600).
  const overloadBurstBlock = triggered && !burstActivation && spellBurstBlock === "it is a Triggered Skill (cast by an Activation Medium)" ? null : spellBurstBlock;
  // A hero's trigger component on top of (or, with `manualCasts: false`, instead of) the skill's own (manual) uses: `heroEffects.triggerComponent.perInterval` uses per
  // casting interval (Clockwork Core: Max Tangle Quantity Tangle triggers, × I Will Hunt You Down's Core Cast Speed while the
  // Vault is up; user-supplied answers 2026-10-18). Those uses are Triggered casts: they never activate Spell Burst.
  const heroTrigger = heroEffects?.triggerComponent && Number.isFinite(heroEffects.triggerComponent.perInterval) && heroEffects.triggerComponent.perInterval > 0 ? heroEffects.triggerComponent : null;
  const heroTriggerUsesPerSecond = heroTrigger && intervalSeconds > 0 && !inactiveReason ? heroTrigger.perInterval / intervalSeconds : 0;
  // Spell Burst Charge on your uses, for a skill other than Burst Activation's (src/spell-burst-refill.js; 15 T Chain Lightning audit G1,
  // 2026-11-18; was gear affix batch B's plain rate sum of this skill's manual casts alone): its own presses (one a use interval: a use you
  // cast yourself) and the other skills' uses roll the refill lines, and so do each activation's automatic casts (1000074: they inherit the
  // activating press's flag) in the walk's activation frame. The walk's mean fill time is the full charge time the user-confirmed rule reads
  // (activations every max(full charge, use interval), 2026-10-12). A triggered skill's own uses (1000060) roll nothing.
  if (refillLines.length && !burstActivation && intervalSeconds > 0 && Number.isFinite(spellBurstCharge.seconds) && spellBurstCharge.seconds > 0) {
    const ownUses = !triggered && setup?.role !== "item-trigger" && !(rateModel && !rateModel.readyWhenPrebuilt) ? 1 / intervalSeconds : 0;
    const streams = [...(ownUses > 0 ? [{ setupKey: setup?.setupKey ?? null, name: `${profile.name} (its presses)`, usesPerSecond: ownUses, from: "player uses" }] : []), ...otherUseStreams];
    const activationUses = !spellBurstBlock && ownUses > 0 ? spellBurstStacks : 0;
    if (streams.length) {
      const walked = spellBurstRefillWalk({ fullChargeSeconds: spellBurstCharge.seconds, maxSpellBurst: spellBurstStacks, lines: refillLines, streams, activationUses });
      if (walked.fillSeconds < spellBurstCharge.seconds) Object.assign(spellBurstCharge, { refill: refillSummary(walked, streams, activationUses) }, { seconds: walked.fillSeconds });
    }
    if (spellBurstCharge.refill) notes.push(`${profile.name}: Spell Burst Charge on your uses: ${spellBurstCharge.refill.text}.`);
  }
  const canSpellBurst = !spellBurstBlock && spellBurstStacks >= 1 && intervalSeconds > 0 && Number.isFinite(spellBurstCharge.seconds);
  if (spellBurstStacks >= 1 && skillTags.has("Spell") && spellBurstBlock) notes.push(`${profile.name}: cannot activate Spell Burst: ${spellBurstBlock}${/provisional/.test(spellBurstBlock) ? "" : spellBurstBlock === heroEffects?.spellBurstBlock ? ` (${heroEffects.spellBurstBlockSource || "trait text"})` : " (game manual)"}.`);
  // "… cast by Spell Burst" hit lines (shared with Bing's Ingenuity Overload casts below, hero trait audit B12).
  const spellBurstBonusLines = [...supports.effects.spellBurst.filter((line) => line.kind === "hitAdditional").map((line) => ({ source: line.source, text: line.text, value: line.value })),
    // Signed since hero trait audit B4: Telepathy Expert's / Fifth Cosmic Velocity's "-20% additional Spell Burst Hit Damage" arrives
    // in this wording (src/hero-exclusive-revivals.js INTAKE_REWRITES; provisional).
    ...modifierTexts.map((line) => { const match = String(line.text).match(/^([+-]?\d+(?:\.\d+)?)% additional Hit Damage for skills cast by Spell Burst$/i); return match ? { source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1) } : null; }).filter(Boolean),
    // Solid River (census item #8; game recipe 510361024: node 114 converts the increased Spell Burst Charge Speed, attr 63601 mod 3,
    // into additional Hit Damage on Spell Burst casts): + each × increased Charge Speed ÷ per, up to the cap. Node 114 is linear (chunk 12).
    ...modifierTexts.flatMap((line) => {
      const match = lineText(line).match(SOLID_RIVER_DAMAGE_LINE);
      if (!match) return [];
      const per = Number(match[1]), each = Number(match[2]) * (line.multiplier ?? 1), cap = Number(match[3]) * (line.multiplier ?? 1);
      const steps = per > 0 ? Math.max(0, spellBurstCharge.increasedPercent) / per : 0;
      const value = Math.min(cap, steps * each);
      return value ? [{ source: line.source, text: `${lineText(line)}: ${round(spellBurstCharge.increasedPercent)}% increased Spell Burst Charge Speed → ${round(steps)} × ${round(each)}% = +${round(value)}% (game recipe 510361024)`, value }] : [];
    })];
  // Solid River's trigger (census item #8; game recipe 493789504, src/activation-medium-events.js SOLID_RIVER_TRIGGER_LINE), passed for
  // the Main Skill: while the Spell Burst Charge Speed (1 + increased) × additional is at least P1%, each full charge casts the Main
  // Skill with the Spell Burst tag and empties Spell Burst, so it activates every full charge without waiting for a player cast: one
  // triggered cast + Max Spell Burst automatic casts, all cast by Spell Burst; the player's own casts then never find Spell Burst full
  // (provisional; the triggered cast takes no triggered-skill lines here).
  const chargeMultiplier = (1 + spellBurstCharge.increasedPercent / 100) * spellBurstCharge.additionalFactor;
  const chargeTrigger = burstChargeTrigger && !burstActivation && skillTags.has("Spell") ? { source: burstChargeTrigger.source, text: burstChargeTrigger.text, thresholdPercent: burstChargeTrigger.thresholdPercent, chargeMultiplier: round(chargeMultiplier),
    active: canSpellBurst && chargeMultiplier * 100 + 1e-9 >= burstChargeTrigger.thresholdPercent, reason: !canSpellBurst ? `the Main Skill cannot activate Spell Burst (${spellBurstBlock || (spellBurstStacks < 1 ? "no Max Spell Burst" : "no use rate")})` : chargeMultiplier * 100 + 1e-9 >= burstChargeTrigger.thresholdPercent ? `Spell Burst Charge Speed ${round(chargeMultiplier * 100)}% of base ≥ ${burstChargeTrigger.thresholdPercent}%` : `Spell Burst Charge Speed ${round(chargeMultiplier * 100)}% of base < ${burstChargeTrigger.thresholdPercent}%` } : null;
  const spellBurst = canSpellBurst ? (() => {
    const solidRiver = chargeTrigger?.active ? chargeTrigger : null;
    // Bing's Ingenuity Overload empties the Spell Burst Charge too (bing2 C1, client 0x142067f90 → 0x14207caf0): the regular activations
    // left after the charge restarts at each Overload, the share the Whimsy / Ingenuity walk measures (src/bing-traits.js whimsyCadence).
    const regularShare = heroEffects?.overload?.activationsPerSecond > 0 && Number.isFinite(heroEffects.overload.regularActivationShare) ? Math.max(0, Math.min(1, heroEffects.overload.regularActivationShare)) : 1;
    const activationsPerSecond = (solidRiver ? 1 / spellBurstCharge.seconds : 1 / Math.max(spellBurstCharge.seconds, intervalSeconds)) * regularShare;
    const extraUsesPerSecond = (spellBurstStacks + (solidRiver ? 1 : 0)) * activationsPerSecond;
    const burstCastsPerSecond = (1 + spellBurstStacks) * activationsPerSecond;
    const bonusLines = spellBurstBonusLines;
    const bonusFactor = product(bonusLines);
    // A hero's separate trigger component (Clockwork Core's Tangle triggers) adds uses that never burst: the share is of all uses.
    const share = burstCastsPerSecond / (1 / intervalSeconds + extraUsesPerSecond + heroTriggerUsesPerSecond);
    return { regularShare, maxSpellBurst: spellBurstStacks, fullChargeSeconds: spellBurstCharge.seconds, chargeSpeed: spellBurstCharge, castsPerActivation: 1 + spellBurstStacks, automaticCastsPerActivation: spellBurstStacks, activationsPerSecond, chargeTrigger: solidRiver, burstActivation, extraUsesPerSecond, burstCastsPerSecond, bonusLines, bonusFactor, share, rateFactor: 1 + extraUsesPerSecond * intervalSeconds, averageDamageFactor: 1 + share * (bonusFactor - 1) };
  })() : null;
  // A Tangle Skill's casts are triggered by its Tangles (and a Clockwork Core skill's by the Core's Tangles), so they take the
  // triggered-skill lines (Hair-trigger); Spell Burst casts are not triggered and keep none of it, so the lines are scaled by the
  // share of uses not cast by Spell Burst (user-supplied 2026-10-19, Google AI Mode answer, not tested in game;
  // research/google-ai-mode-answers-2026-10-19.md).
  if (!triggered && setup?.role !== "item-trigger" && tangleSkill && triggeredSkillAdditional.length) {
    const tangleShare = 1 - (spellBurst?.share || 0);
    pushTriggered(...triggeredSkillAdditional.map((line) => tangleShare === 1 ? { ...line, text: `${line.text}; Tangle casts are triggered` } : { ...line, value: line.value * tangleShare, text: `${line.text}; Tangle casts are triggered, × ${round(tangleShare)} of uses not cast by Spell Burst` }));
  }
  if (spellBurst) {
    if (spellBurst.averageDamageFactor !== 1) supports.additional.push({ source: "Spell Burst casts", text: `${round(spellBurst.share * 100)}% of casts are cast by Spell Burst (the activating cast + ${spellBurstStacks} automatic, game manual) at ×${round(spellBurst.bonusFactor)} (${spellBurst.bonusLines.map((line) => line.text).join("; ")}); average ×${round(spellBurst.averageDamageFactor)}`, value: (spellBurst.averageDamageFactor - 1) * 100, category: "Additional damage" });
    if (spellBurst.chargeTrigger) notes.push(`${profile.name}: ${spellBurst.chargeTrigger.source}: ${spellBurst.chargeTrigger.reason}, so every full charge (${round(spellBurst.fullChargeSeconds)} s) triggers the Main Skill and activates its Spell Burst: 1 triggered + ${spellBurstStacks} automatic cast(s) per activation, all cast by Spell Burst; the player's casts never find Spell Burst full (game recipe 493789504; provisional).`);
    else if (chargeTrigger) notes.push(`${profile.name}: ${chargeTrigger.source}'s Spell Burst trigger is off: ${chargeTrigger.reason} (game recipe 493789504).`);
    notes.push(`${profile.name}: Spell Burst ${spellBurstStacks} stack(s), fully charged in ${round(spellBurst.fullChargeSeconds)} s ${spellBurstCharge.refill ? `on average (the regular charge 2 s ÷ ${round(1 + spellBurstCharge.increasedPercent / 100)} ÷ ${round(spellBurstCharge.additionalFactor)} = ${spellBurstCharge.refill.regularSeconds} s, game manual, refilled on your uses: src/spell-burst-refill.js)` : `= 2 s ÷ ${round(1 + spellBurstCharge.increasedPercent / 100)} ÷ ${round(spellBurstCharge.additionalFactor)} (game manual)`}, activated every ${round(1 / spellBurst.activationsPerSecond)} s = max(charge time, use interval ${round(intervalSeconds)} s); each activation is the activating cast + ${spellBurstStacks} automatic cast(s), all cast by Spell Burst (game manual); +${round(spellBurst.extraUsesPerSecond)} casts per second without player time (user-confirmed 2026-10-12: automatic casts take no manual cast time; the period is not rounded; additional Charge Speed shortens the charge).`);
  }
  // Shadow of Thunderlight's Fury (census #11 leftover, 2026-10-27; game recipe 12617: on casting a skill with the Spell Burst tag, gate
  // 309 "Spell Burst Charge ≥ P1", node 624 Lucky Damage on that cast's next action): the casts made by Spell Burst roll Lucky when the
  // activation consumes at least P1 stacks, i.e. Max Spell Burst ≥ P1 (all stacks are consumed at full charge). Their share of the
  // skill's casts (spellBurst.share) enters the Lucky roll as a part-time Lucky window (src/lucky-damage.js luckyRollFraction).
  // Provisional (open question lucky-damage-hit-rolls): the gate's operator 3 read as "at least", as the item text says.
  const furyLucky = spellBurst ? modifierTexts.map((line) => ({ line, match: lineText(line).match(FURY_LUCKY_LINE) })).find((item) => item.match) || null : null;
  const furyActive = Boolean(furyLucky && spellBurstStacks >= Number(furyLucky.match[1]) && spellBurst.share > 0);
  if (furyLucky) notes.push(`${profile.name}: "${lineText(furyLucky.line)}" (${furyLucky.line.source}): ${furyActive ? `the casts made by Spell Burst (${round(spellBurst.share * 100)}% of casts) roll Lucky Damage (Max Spell Burst ${spellBurstStacks} ≥ ${furyLucky.match[1]}; game recipe 12617, provisional)` : `inactive: Max Spell Burst ${spellBurstStacks} < ${furyLucky.match[1]}`}.`);
  const hitLuckyState = furyActive ? { ...(luckyState || { damageRolls: luckyDamageRolls }), partial: [...(luckyState?.partial || []), { share: spellBurst.share, rolls: 2, source: furyLucky.line.source, text: "Damage becomes Lucky (casts made by Spell Burst)" }] } : luckyState;
  const rateFactor = multistrike?.rateFactor ?? spellBurst?.rateFactor ?? 1;
  // A hero's use-rate factor (Clockwork Core: every attached Tangle triggers the skill; I Will Hunt You Down's Cast Speed).
  const heroRateFactor = Number.isFinite(heroEffects?.rateFactor) && heroEffects.rateFactor > 0 ? heroEffects.rateFactor : 1;
  // A hero trigger component with `manualCasts: false` replaces the player's own casts as a hit source (Clockwork Core: the
  // player's cast only summons or moves the Core and fires nothing; user-decided 2026-10-18 from game-code evidence,
  // research/youga-recall-mechanics-2026-10-18.md R1), so only the trigger component deals hits.
  const manualHits = !(heroTrigger && heroTrigger.manualCasts === false);
  // Bing – Blast Nova's bombs (hero trait audit B12, Q-H14 recommended reading; src/bing-traits.js): the Main Attack Projectile Skill
  // throws bombs instead of its own casts. Throws per second = the base speed × (1 + share × (the Attack Speed bonuses − 1)) ×
  // Π(1 + additional Bomb Throwing Speed); bombs per throw from the trait (Blast Barrage's chance added). Each bomb is one use of the
  // skill; its hits per use are set on the components below (one projectile, or the volley with Radiation Effect).
  const bombSpec = heroEffects?.bombs && !inactiveReason ? heroEffects.bombs : null;
  const bombs = bombSpec ? (() => {
    const weaponRate = speedType === "attack-speed" ? Number(attackSpeed?.weaponAttacksPerSecond) || 0 : 0;
    // 4881501: node 114 reads Attack Speed with no tags, so the supported skill's own speed lines stay out of the throws.
    const generalSpeed = speedType === "attack-speed" ? Math.max(0.0001, attackSpeed?.factor ?? 1) : speedFactor;
    const bonusFactor = weaponRate > 0 ? generalSpeed / weaponRate : generalSpeed;
    const throwFactor = Math.max(0, 1 + (bombSpec.speedShare ?? 1) * (bonusFactor - 1));
    const additionalFactor = (bombSpec.throwAdditional || []).reduce((factor, line) => factor * Math.max(0, 1 + line.value / 100), 1);
    const throwsPerSecond = Math.max(0, bombSpec.baseSpeed || 0) * throwFactor * additionalFactor;
    const bombsPerSecond = throwsPerSecond * Math.max(0, bombSpec.bombsPerThrow || 0);
    // First detonation: the first throw lands one throw interval in, then the fuse; Phantom Delivery waits for the (limit + 1)-th bomb.
    const throwsToFirst = bombSpec.hold ? Math.ceil((bombSpec.hold + 1) / Math.max(1e-9, bombSpec.bombsPerThrow)) : 1;
    const firstSeconds = throwsPerSecond > 0 ? throwsToFirst / throwsPerSecond + (bombSpec.hold ? 0 : bombSpec.fuseSeconds || 0) : null;
    const lines = [...(bombSpec.lines || [])];
    const recent = bombSpec.runaway ? Math.min(bombSpec.runaway.cap, bombSpec.runaway.per * bombsPerSecond * bombSpec.runaway.recentSeconds) : 0;
    if (recent > 0) lines.push({ source: bombSpec.runaway.source, text: `${bombSpec.runaway.text}: ${round(bombsPerSecond)} bombs/s × ${bombSpec.runaway.recentSeconds} s recently = ${round(bombsPerSecond * bombSpec.runaway.recentSeconds)} × ${bombSpec.runaway.per}%, capped at ${bombSpec.runaway.cap}% (provisional)`, value: round(recent) });
    const onField = bombSpec.hold ? bombSpec.hold : Math.min(bombSpec.limit ?? Infinity, bombsPerSecond * (bombSpec.fuseSeconds || 0));
    const phantom = bombSpec.phantom ? Math.min(bombSpec.phantom.cap, bombSpec.phantom.per * onField) : 0;
    if (phantom > 0) lines.push({ source: bombSpec.phantom.source, text: `${bombSpec.phantom.text}: ${round(onField)} bombs on the field at each detonation (provisional)`, value: round(phantom) });
    return { ...bombSpec, bonusFactor, throwFactor, additionalFactor, throwsPerSecond, bombsPerSecond, firstSeconds, onField, lines };
  })() : null;
  if (bombs) notes.push(`${profile.name}: Blast Nova bombs (Q-H14, provisional): ${bombs.baseSpeed} throw/s × ${round(bombs.throwFactor)} (${round((bombs.speedShare ?? 1) * 100)}% of the Attack Speed bonuses ×${round(bombs.bonusFactor)})${bombs.additionalFactor !== 1 ? ` × ${round(bombs.additionalFactor)} additional Bomb Throwing Speed` : ""} = ${round(bombs.throwsPerSecond)} throws/s × ${round(bombs.bombsPerThrow)} bombs = ${round(bombs.bombsPerSecond)} bombs/s in place of its own casts; ${bombs.mode === "single" ? "one projectile of each bomb's all-direction volley hits the dummy" : bombs.mode === "volley" ? "Radiation Effect: each bomb lands the skill's volley at its Shotgun share" : "the bombs fire no projectiles"}; first detonation at ${bombs.firstSeconds == null ? "—" : round(bombs.firstSeconds)} s.`);
  // Pressed skills share one action timeline (src/planner.js pressRotation, 2026-11-05; research/rosa-build-followups-2026-11-05.md §3): the
  // Main Skill keeps `rotation.share` of its action time; a proc skill is pressed once every `rotation.pressEverySeconds`. A Main Skill bound by
  // its cooldown or Terra (`rotation.timeBound` false; src/press-schedule.js) keeps its rate while its casts fit that share of the time.
  const fullManualUsesPerSecond = bombs ? bombs.bombsPerSecond : manualHits && intervalSeconds > 0 && !inactiveReason ? rateFactor * heroRateFactor / intervalSeconds : 0;
  const manualUsesPerSecond = bombs || !rotation ? fullManualUsesPerSecond : rotation.pressEverySeconds > 0 ? Math.min(fullManualUsesPerSecond, rateFactor * heroRateFactor / rotation.pressEverySeconds) : rotation.timeBound === false && useTime > 0 ? Math.min(fullManualUsesPerSecond, Math.max(0, Math.min(1, rotation.share ?? 1)) * rateFactor * heroRateFactor / useTime) : fullManualUsesPerSecond * Math.max(0, Math.min(1, rotation.share ?? 1));
  if (rotation && !bombs && fullManualUsesPerSecond > 0) notes.push(`${profile.name}: ${rotation.text}`);
  // Extra triggered uses from outside the skill (Miraculous Gain's Main Skill triggers, src/elixir-model.js; user-supplied
  // 2026-10-19): added to the use rate as full uses of the skill.
  const outsideTriggerUsesPerSecond = extraTriggeredUses?.usesPerSecond > 0 && !inactiveReason && intervalSeconds > 0 ? extraTriggeredUses.usesPerSecond : 0;
  if (outsideTriggerUsesPerSecond) notes.push(`${profile.name}: + ${round(outsideTriggerUsesPerSecond)} uses/s from ${extraTriggeredUses.label}${extraTriggeredUses.note ? ` (${extraTriggeredUses.note})` : ""}.`);
  // Bing – Creative Genius (hero trait audit B12; src/bing-traits.js, provisional): each Ingenuity Overload casts the Main Skill once
  // with Max Spell Burst × 3 (+200% additional; Genius Idea Generator's +1 before it) automatic casts, all cast by Spell Burst (the
  // skill must be able to activate Spell Burst: keyword Ingenuity Overload); Contingency Inspiration Machines each cast it every
  // interval ÷ your Cast Speed for their lifetime (triggered casts: no Spell Burst).
  const overloadSpec = heroEffects?.overload?.activationsPerSecond > 0 && !inactiveReason ? heroEffects.overload : null;
  const overload = overloadSpec && skillTags.has("Spell") && !overloadBurstBlock && spellBurstStacks >= 1 ? (() => {
    const stacks = (spellBurstStacks + (overloadSpec.extraMaxSpellBurst || 0)) * (1 + (overloadSpec.multiplierPercent ?? 200) / 100);
    const usesPerSecond = overloadSpec.activationsPerSecond * (1 + stacks);
    const factor = product(spellBurstBonusLines) * (1 + (overloadSpec.additionalPercent || 0) / 100);
    return { activationsPerSecond: overloadSpec.activationsPerSecond, stacks, castsPerActivation: 1 + stacks, usesPerSecond, factor, additionalPercent: overloadSpec.additionalPercent || 0 };
  })() : null;
  const machineSpec = overload && heroEffects?.machines ? heroEffects.machines : null;
  const machines = machineSpec ? (() => {
    const castFactor = Math.max(0.0001, castSpeed.factor || 1);
    const perMachine = castFactor / Math.max(1e-9, machineSpec.intervalSeconds);
    const usesPerSecond = machineSpec.overloadsPerSecond * machineSpec.count * machineSpec.lifetimeSeconds * perMachine;
    return { ...machineSpec, castFactor, perMachine, usesPerSecond };
  })() : null;
  const bingUsesPerSecond = (overload?.usesPerSecond || 0) + (machines?.usesPerSecond || 0);
  // "+X% chance to trigger the Main Spell Skill 1 additional time when using it" (weapon corrosion base affix). Record 222907: on a player's use (trigger
  // 1000074) of a skill tagged Main Skill and Spell and not Channeled, node 2320 casts the skill in position 1. So each manual use repeats once with the
  // summed chance (at most 100%), as a full use of the skill; a repeat is no player use, so it does not roll again. Only the player's uses
  // roll it (wiring audit W2 gap 5, 2026-11-03): an Activation Medium / item-triggered Main Spell (1000060) does not, where before every
  // use of the skill did (×1.05 on a triggered one).
  // The player's own uses (what "after using a … Skill" triggers count: Dual Kismet: Hunter's Hand, provisional): manual uses, not an
  // Activation Medium / gear / pact trigger or an outside trigger rate; a Multistrike sequence is one use.
  const playerUsesPerSecond = triggered || setup?.role === "item-trigger" || (rateModel && !rateModel.readyWhenPrebuilt) || bombs ? 0 : manualUsesPerSecond / (1 + (multistrike?.expectedExtraAttacks || 0));
  const repeatLines = mainSkill && skillTags.has("Spell") && !skillTags.has("Channeled") && playerUsesPerSecond > 0 ? modifierTexts.flatMap((line) => { const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(MAIN_SPELL_REPEAT_LINE); return match ? [{ source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1) }] : []; }) : [];
  const mainSpellRepeat = repeatLines.length ? { chancePercent: Math.min(100, Math.max(0, sum(repeatLines))), lines: repeatLines } : null;
  if (mainSpellRepeat) { mainSpellRepeat.usesPerSecond = playerUsesPerSecond * mainSpellRepeat.chancePercent / 100; notes.push(`${profile.name}: ${round(mainSpellRepeat.chancePercent)}% chance to trigger the Main Spell Skill once more per use: + ${round(mainSpellRepeat.usesPerSecond)} uses/s (provisional).`); }
  const ownUsesPerSecond = manualUsesPerSecond + heroTriggerUsesPerSecond + outsideTriggerUsesPerSecond + bingUsesPerSecond + (mainSpellRepeat?.usesPerSecond || 0);
  // Selena – Lonely Ensemble's Crimson Shades (hero trait audit B13; src/selena-leftover-traits.js crimsonShadeState, provisional): each
  // Main Terra cast, at most once per summon interval (1 s), summons `count` Shades that each cast the Main Terra once on the dummy at
  // the trait's additional damage. Game affix 976528768 (2026-10-31): the Main Terra's cast stores the consumed rank (trigger 1001300) and
  // gives it back (node 2230 addRank), and each Shade cast but the last gives it back again (buff 82320), so every Shade consumes the same
  // charges and keeps the same Terra Charge bonus (974028 reads GetEnergyRank at its own consumption).
  const shadeSpec = heroEffects?.crimsonShade && terra && !inactiveReason && ownUsesPerSecond > 0 ? heroEffects.crimsonShade : null;
  const crimsonShade = shadeSpec ? (() => {
    const summonsPerSecond = Math.min(ownUsesPerSecond, 1 / Math.max(1e-9, shadeSpec.intervalSeconds || 1));
    const terraValue = profile.terraCharge && !profile.terraCharge.dotOnly ? Number(profile.terraCharge.value) || 0 : 0;
    const relative = shadeSpec.factor;
    return { count: shadeSpec.count, summonsPerSecond, usesPerSecond: summonsPerSecond * shadeSpec.count, factor: shadeSpec.factor, additionalPercent: shadeSpec.additionalPercent, terraChargePercent: terraValue, relative, source: shadeSpec.source };
  })() : null;
  const usesPerSecond = ownUsesPerSecond + (crimsonShade?.usesPerSecond || 0);
  // Uses by source (wiring audit W2 gap 5, 2026-11-03): the player's presses (trigger 1000074), Spell Burst's automatic casts (1000074: they
  // inherit the activating cast's flag, SS14 client, research/use-events-rea-2026-11-04.md §1; the planner keeps them in playerUsesPerSecond for
  // the 1000074 readers; resource consumption leaves them out, its stated rule), Multistrike repeats (a repeat of your use is a 1000074 event, a
  // repeat of a triggered use raises none: same note, read in src/planner.js) and triggered uses (1000060: Activation Medium, item, outside and
  // hero triggers, the Main Spell repeat, Crimson Shades, Ingenuity Overload casts).
  const spellBurstAutoUsesPerSecond = playerUsesPerSecond > 0 && spellBurst && !multistrike ? playerUsesPerSecond * (1 - 1 / spellBurst.rateFactor) : 0;
  const multistrikeRepeatUsesPerSecond = multistrike ? manualUsesPerSecond * multistrike.expectedExtraAttacks / (1 + multistrike.expectedExtraAttacks) : 0;
  const pressedUsesPerSecond = Math.max(0, playerUsesPerSecond - spellBurstAutoUsesPerSecond);
  // The triggered share is what is left; a residue of the float sum (1.8e-15 of 13.8 uses/s on a Main Skill that keeps a press share of its
  // time, 2026-11-08) is no triggered use.
  const triggeredResidue = usesPerSecond - pressedUsesPerSecond - spellBurstAutoUsesPerSecond - multistrikeRepeatUsesPerSecond;
  const usesBySource = { manual: pressedUsesPerSecond, spellBurstAuto: spellBurstAutoUsesPerSecond, multistrikeRepeat: multistrikeRepeatUsesPerSecond, triggered: triggeredResidue > 1e-12 * Math.max(1, usesPerSecond) ? triggeredResidue : 0 };
  if (crimsonShade) {
    const average = (ownUsesPerSecond + crimsonShade.usesPerSecond * crimsonShade.relative) / Math.max(1e-9, usesPerSecond);
    if (Math.abs(average - 1) > 1e-12) supports.additional.push({ source: "Crimson Shade casts (Selena – Lonely Ensemble)", text: `${round(crimsonShade.usesPerSecond)} Crimson Shade casts/s at ×${round(crimsonShade.relative)} (${crimsonShade.additionalPercent}% additional damage${crimsonShade.terraChargePercent ? `, the cast's +${round(crimsonShade.terraChargePercent)}% Terra Charge bonus kept: game affix 976528768 gives the consumed charges back` : ""}) among ${round(usesPerSecond)} uses/s: average ×${round(average)} (hero trait audit B13, provisional)`, value: (average - 1) * 100, category: "Additional damage" });
    notes.push(`${profile.name}: Lonely Ensemble: ${crimsonShade.count} Crimson Shade(s) per Main Terra cast, ${round(crimsonShade.summonsPerSecond)} summons/s (at most one per ${shadeSpec.intervalSeconds} s) = +${round(crimsonShade.usesPerSecond)} Terra casts/s on the dummy (hero trait audit B13, provisional).`);
  }
  if (overload) {
    const before = ownUsesPerSecond - bingUsesPerSecond, baseFactor = spellBurst?.averageDamageFactor ?? 1;
    const average = (before * baseFactor + overload.usesPerSecond * overload.factor + (machines?.usesPerSecond || 0)) / Math.max(1e-9, usesPerSecond * baseFactor);
    if (Math.abs(average - 1) > 1e-12) supports.additional.push({ source: "Ingenuity Overload casts (Bing – Creative Genius)", text: `${round(overload.usesPerSecond)} Overload casts/s at ×${round(overload.factor)} (cast by Spell Burst${overload.additionalPercent ? `, +${overload.additionalPercent}% Genius Idea Generator` : ""})${machines ? ` and ${round(machines.usesPerSecond)} Contingency Inspiration Machine casts/s at ×1` : ""} among ${round(usesPerSecond)} uses/s: average ×${round(average)} over the other uses' ×${round(baseFactor)} (provisional)`, value: (average - 1) * 100, category: "Additional damage" });
    notes.push(`${profile.name}: Ingenuity Overload every ${round(1 / overload.activationsPerSecond)} s: 1 + ${round(overload.stacks)} casts (Max Spell Burst × 3, all cast by Spell Burst) = +${round(overload.usesPerSecond)} uses/s${machines ? `; ${machines.count} Contingency Inspiration Machines × ${machines.lifetimeSeconds} s × ${round(machines.perMachine)} casts/s (${machines.intervalSeconds} s ÷ Cast Speed ×${round(machines.castFactor)}) = +${round(machines.usesPerSecond)} uses/s` : ""} (hero trait audit B12, provisional).`);
  }
  // The two rate components, kept apart for the working (Clockwork Core triggers vs manual casts).
  const rateComponents = heroTrigger ? [
    ...(manualHits ? [{ key: "manual", label: heroTrigger.manualLabel || "manual casts", usesPerSecond: manualUsesPerSecond }] : []),
    { key: "trigger", label: heroTrigger.label || "hero triggers", usesPerSecond: heroTriggerUsesPerSecond, perInterval: heroTrigger.perInterval }
  ] : null;
  if (heroRateFactor !== 1 || heroEffects?.rateNote) notes.push(`${profile.name}: ${heroEffects.rateNote || "hero use-rate factor"}${heroRateFactor !== 1 ? ` (uses × ${round(heroRateFactor)})` : ""}.`);
  if (fanLandsAll && heroEffects?.fanNote) notes.push(`${profile.name}: ${heroEffects.fanNote}.`);
  if (rateComponents) notes.push(manualHits
    ? `${profile.name}: uses per second = ${round(manualUsesPerSecond)} ${rateComponents[0].label} + ${round(heroTriggerUsesPerSecond)} ${rateComponents[1].label} (${round(heroTrigger.perInterval)} per casting interval of ${round(intervalSeconds)} s) = ${round(usesPerSecond)}.`
    : `${profile.name}: uses per second = ${round(heroTriggerUsesPerSecond)} ${rateComponents[0].label} (${round(heroTrigger.perInterval)} per casting interval of ${round(intervalSeconds)} s); ${heroTrigger.manualNote || "the player's own casts deal no hits"}.`);
  // Sequences per second and the Max Multistrike Count events they reach (Erika's Stalker / Hunting Instinct read them).
  if (multistrike) {
    multistrike.sequencesPerSecond = usesPerSecond / (1 + multistrike.expectedExtraAttacks);
    multistrike.maxCountEventsPerSecond = multistrike.sequencesPerSecond * multistrike.maxCountEventsPerCycle;
  }
  // Demolisher Charge (Charged Pummel, Savage Charge: "gains Demolisher Charge once every 3 s"): the share of release
  // cycles that consume a charge, min(1, cycle ÷ 3 s) (expected-value reading; the charge is assumed banked at most once).
  // Quick Return and Savage Charge: Infuriate (chunk 8; field 2403020 Charge Restoration Speed): the 3 s ÷ (1 + Σ). Infuriate reads the
  // skill's increased Attack Speed pool (recipe 671651392, node 114 from attr 60011 mod 3).
  const demolisherRecovery = profile.demolisher ? (supports.effects.demolisherRecovery || []).reduce((total, line) => total + (line.kind === "fromAttackSpeed" ? line.value / 100 * Math.max(0, (attackSpeed?.increasedPercent || 0) + supportIncreasedSpeed) : line.kind === "flat" ? line.value : 0), 0) : 0;
  const demolisherEvery = profile.demolisher ? profile.demolisher.everySeconds / Math.max(1e-9, 1 + demolisherRecovery / 100) : 0;
  if (demolisherRecovery) notes.push(`${profile.name}: +${round(demolisherRecovery)}% Demolisher Charge Restoration Speed: a Charge every ${round(demolisherEvery)} s.`);
  // Charged Pummel: Charge Reduction (recipe 404583872): at max channeled stacks 3 stacks of the buff, each consumption gives the Charge back, so every release consumes one.
  const demolisherInstant = profile.demolisher && (supports.effects.demolisherRecovery || []).some((line) => line.kind === "instant");
  const useGapSeconds = rotation?.pressEverySeconds > 0 && intervalSeconds > 0 ? Math.max(intervalSeconds, rotation.pressEverySeconds) : intervalSeconds;
  const demolisherShare = profile.demolisher && intervalSeconds > 0 ? (demolisherInstant ? 1 : Math.min(1, useGapSeconds / demolisherEvery)) : 0;
  // First use: the opening cast completes after its use time (a cooldown- or Terra-bound skill does not wait a whole
  // interval first). Flame Jet Lv16 dummy run 2026-10-11: the 21 s average (121) sits near the steady figure, so damage
  // starts with the first cast, not one interval in. A rate-model skill waits for its first trigger; a release channel's
  // first cycle lands after its full channel.
  // A triggered skill's first use lands at its first trigger (user decision 2026-10-22: skills start ready, a trigger that only
  // fires after a delay is waited for): an "Always attempts to trigger" medium (Perpetual Motion, Boss / Elite, Wind Rhythm;
  // `startsReady`) fires at engagement, 0 s; a "Triggers … every X s" medium (Instruction, Rhythm) X s in; Activation Medium:
  // Multistrike at the first Max Multistrike Count event (its trigger interval). Provisional: open question
  // "activation-medium-first-trigger". Before 2026-10-22 every trigger read one trigger interval in.
  // Bard Song: the first bubble lands one channel interval in with own buffs pre-built (the song one stack short of max at engagement,
  // best case), a whole bubble in on a cold start.
  // A rate model built from an own resource (a Focus skill's points, `readyWhenPrebuilt`) is ready at 0 s with own buffs built
  // before engaging (prebuiltSelfBuffs, default on; user decision 2026-10-22); off, its first use waits for the points to fill.
  // A triggered Combo skill's first whole cycle ends at its last step's trigger (its steps: cycleSteps below).
  const firstUseSeconds = bombs ? bombs.firstSeconds : triggered ? (triggerLine?.startsReady ? 0 : triggerInterval) + (cycleTriggerSteps ? (cycleTriggerSteps - 1) * triggerStepSeconds : 0) : rateModel ? (rateModel.readyWhenPrebuilt && prebuiltSelfBuffs ? 0 : rateModel.firstUseSeconds ?? intervalSeconds) : release ? intervalSeconds : bardSong ? (bardSpec.prebuilt ? bardSong.channelIntervalSeconds : bardSongUseTime) : useTime != null ? useTime : null;
  if (terra) notes.push(`${profile.name}: ${terra.note}`);
  if (heldProjectileSeconds) notes.push(`${profile.name}: ${profile.heldProjectile.note}`);
  if (profile.demolisher) notes.push(`${profile.name}: Demolisher Charge once every ${profile.demolisher.everySeconds} s; ${round(demolisherShare * 100)}% of ${release ? "release cycles" : "uses"} (${round(intervalSeconds || 0)} s each) consume one (expected-value reading, provisional).`);
  if (speedType === "attack-speed" && attackSpeed) notes.push(`${profile.name}: ${attackSpeed.note}`);
  if (channel) notes.push(`${profile.name}: ${channel.note}`);
  if (rateModel) notes.push(`${profile.name}: ${rateModel.note}`);
  if (profile.cycle) notes.push(`${profile.name}: ${profile.cycle.note}`);
  if (timing && timing.agreesWithRefdata === false && timing.refdataCastSeconds) warnings.push(`${profile.name}: game use time ${timing.useTimeSeconds} s differs from the reference data's ${timing.refdataCastSeconds} s; the game value is used.`);
  if (timing && speedType === "fixed" && !rateModel) notes.push(`${profile.name}: its use time is not scaled by Cast Speed (game speed type "fixed").`);
  if (!timing && !rateModel) warnings.push(`${profile.name}: no use time is available, so its hit rate is 0.`);
  if (timing?.charges > 1) notes.push(`${profile.name}: ${timing.charges} charges recharge in ${timing.cooldownSeconds} s each (sustained rate = charges ÷ cooldown; provisional reading of cdTimes).`);

  // Sentries (profile.sentry; src/skill-hit-profiles.js / src/attack-hit-profiles.js). Manual rule 1001011723: "Sentries'
  // stats are inherited from the player, so their damage stat calculation should be the same as the player's" (no Spell
  // Burst, no Multistrike unless the skill grants it), and rule 1001011721: a Sentry's hits count as the player's. So the
  // hit layers above are the player's; only the Sentry's own cadence differs: Cast Frequency (rule 1001011724) scales
  // the tick interval, and an Attack Sentry's base Cast Frequency is the weapon's average Attack Speed (reference data skill
  // text), so its interval is 1 ÷ weapon attacks per second (the build's Attack Speed bonuses do not apply to it).
  const sentry = profile.sentry || null;
  const castFrequencyLines = [];
  if (sentry) {
    for (const line of modifierTexts) {
      const parsed = classifySentryLine(line.text);
      if (!parsed) continue;
      if (parsed.conditional) { warnings.push(`${line.source}: "${line.text}" is a conditional Sentry Cast Frequency line and is not read by the ${profile.name} sentry model.`); continue; }
      castFrequencyLines.push({ source: line.source, text: line.text, origin: line.origin, value: parsed.value * (line.multiplier ?? 1), additional: parsed.additional });
    }
    // Support lines "+X% additional Cast Frequency for Sentries deployed by the supported skill" (Sentry Modification).
    castFrequencyLines.push(...supports.castFrequency.map((line) => ({ ...line, origin: "support" })));
    for (const own of sentry.castFrequency || []) castFrequencyLines.push({ source: `${profile.name}: own Cast Frequency`, text: own.text, origin: "skill", value: own.value, additional: own.additional !== false });
    // "Cast Speed bonus and 100% of additional bonus are also applied to Spell Sentries' Cast Frequency" (and the Attack
    // wording; belt blends, residual batch): the player's whole Cast / Attack Speed factor for this setup joins the Sentry's
    // Cast Frequency as one more factor (both are "calculated in the same way", manual rule 1001011724).
    const spellSentry = scopeTags.has("Spell"), attackSentry = scopeTags.has("Attack");
    for (const line of modifierTexts) {
      const match = String(line.text ?? "").replace(/\s+/g, " ").trim().match(/^(Cast|Attack) Speed bonus and (\d+(?:\.\d+)?)% of additional bonus are also applied to (Spell|Attack) Sentries' Cast Frequency$/i);
      if (!match || (match[3].toLowerCase() === "spell" ? !spellSentry : !attackSentry)) continue;
      // The Attack Speed *bonus* (core audit B7): the weapon model's `factor` is attacks per second (the weapon's base included), and
      // an Attack Sentry's base Cast Frequency already is the weapon's attacks per second, so only the increased × additional bonus
      // joins (game affix 255288: node 114 from attr 60011, mod 3 and mod 4, to the Cast Frequency attr 63211). Before 2026-10-18 the
      // whole attacks-per-second figure was used (×1.5 Cast Frequency from a 1.5 Attack Speed weapon with no bonus).
      const factor = /^Cast$/i.test(match[1]) ? castSpeed?.factor ?? 1 : attackSpeed ? Math.max(0, 1 + (attackSpeed.increasedPercent || 0) / 100) * (attackSpeed.additionalFactor ?? 1) : 1;
      if (factor !== 1) castFrequencyLines.push({ source: line.source, text: `${line.text} (×${round(factor)} ${match[1]} Speed; the "100% of additional bonus" share is read as the whole factor: provisional)`, origin: line.origin, value: (factor - 1) * 100, additional: true });
    }
  }
  const castFrequencyFactor = sentry ? Math.max(0.0001, 1 + sum(castFrequencyLines.filter((line) => !line.additional)) / 100) * product(castFrequencyLines.filter((line) => line.additional)) : 1;
  // Sentry quantity (core audit B7; Sentry core "Max Sentry Quantity +1", game affix 104343: attr 6322 flat on the Sentry tag). Every
  // modeled Sentry skill's max base Sentry quantity is 1 (reference data); each extra Max Sentry Quantity is another Sentry hitting the dummy,
  // all of them held deployed (best case: recast before expiry, or deployed at once with Shared Fate;
  // two Sentries double the damage on one target: user-supplied 2026-10-19, Google AI Mode answer, not tested in game). A support that limits the skill ("The supported skill can only deploy N Sentry(ies)") caps the count.
  const sentryQuantityLines = sentry ? modifierTexts.flatMap((line) => String(line.text ?? "").split(/\r?\n/).flatMap((part) => {
    // Blade-Dancer's Edges corroded (legendary audit batch 8): "+1 Sentries that can be deployed at a time" is the same quantity.
    const match = normalizePercentageText(part).replace(/\s+/g, " ").trim().match(/^(?:Max Sentry Quantity \+?(\d+)|\+?(\d+) (?:to )?Max Sentry Quantity|\+?(\d+) Sentries that can be deployed at a time)$/i);
    return match ? [{ source: line.source, text: part.trim(), value: Number(match[1] ?? match[2] ?? match[3]) * (line.multiplier ?? 1) }] : [];
  })) : [];
  const sentryDeployCap = sentry ? Math.min(Infinity, ...(setup?.supports || []).filter((support) => support && support.enabled !== false).flatMap((support) => support.effects || []).map((text) => Number(String(text).match(/The supported skill can only deploy (\d+) Sentr/i)?.[1])).filter((value) => value > 0)) : Infinity;
  const sentryQuantity = sentry ? Math.max(1, Math.min(sentryDeployCap, (sentry.baseQuantity ?? 1) + Math.floor(sum(sentryQuantityLines)))) : 1;
  if (sentry && sentryQuantity > 1) notes.push(`${profile.name}: ${sentryQuantity} Sentries held deployed (max base Sentry quantity ${sentry.baseQuantity ?? 1} + ${sentryQuantityLines.map((line) => `${line.text} (${line.source})`).join(", ")}): each hits the dummy (best case; provisional).`);
  // Blade-Dancer's Edges (legendary audit batch 8): "+10% additional Sentry Damage for every nearby Sentry within 10m": the Sentries
  // held deployed stand together at the dummy, so each counts (summed into one additional term; provisional).
  const sentryNearbyLines = sentry ? modifierTexts.flatMap((line) => { const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(/^\+(\d+(?:\.\d+)?)% additional Sentry Damage for every nearby Sentry within \d+ ?m$/i); return match ? [{ source: line.source, text: `${line.text} (${sentryQuantity} Sentr${sentryQuantity === 1 ? "y" : "ies"} nearby; provisional)`, value: Number(match[1]) * (line.multiplier ?? 1) * sentryQuantity, category: "Additional damage", origin: "gear" }] : []; }) : [];
  // Sentry timing (census item #13, 2026-10-27). "+X% additional Sentry Damage if Sentry Skill is not used in the last N s" (game
  // recipe 327769: 5719 additional on the Sentry tag, gate 611 "no skill-use event 1000074 on a Sentry skill within N s"): the Sentry is
  // recast once per use interval (held continuously, recast on expiry), so its hits fall outside the N s after a cast for
  // max(0, 1 − N × uses per second) of the time; the line is that share of its value (only this skill's casts are counted;
  // provisional, open question sentry-timing).
  const sentryIdleLines = sentry ? modifierTexts.flatMap((line) => String(line.text ?? "").split(SENTRY_LINE_SPLIT).flatMap((part) => {
    const match = normalizePercentageText(part).replace(/\s+/g, " ").trim().match(SENTRY_IDLE_LINE);
    if (!match) return [];
    const seconds = Number(match[2]);
    const share = usesPerSecond > 0 ? Math.max(0, 1 - seconds * usesPerSecond) : 1;
    const value = Number(match[1]) * (line.multiplier ?? 1);
    return [{ source: line.source, text: `${part.trim()} — ${profile.name} is used every ${usesPerSecond > 0 ? round(1 / usesPerSecond) : "∞"} s, so ${round(share * 100)}% of the time is outside the ${seconds} s after a use (game recipe 327769; provisional)`, value: value * share, category: "Additional damage", origin: "derived", sentryIdle: { share, full: value } }];
  })) : [];
  sentryNearbyLines.push(...sentryIdleLines);
  // "−X% additional Sentry Start Time" (game recipe 857570: attr 6320 "Time required for activating Sentry Skills", mod 4; Heat Up,
  // Artisan, slates, Multifaceted Guard's "… for the supported skill"): the attribute's default is 0 and no Sentry skill record in the
  // extracted data carries a base start time, so the start delay is 0 in the model and the reduction changes nothing (the Sentry is
  // held continuously; its first use is its cast time). Read and listed; no DPS effect until a base start time is sourced (open
  // question sentry-timing).
  const sentryStartLines = sentry ? [...modifierTexts, ...(setup?.supports || []).filter((support) => support && support.enabled !== false).flatMap((support) => (support.effects || []).map((text) => ({ text, source: `Support: ${support.name}` })))].flatMap((line) => String(line.text ?? "").split(SENTRY_LINE_SPLIT).flatMap((part) => {
    const match = normalizePercentageText(part).replace(/\s+/g, " ").trim().match(SENTRY_START_LINE);
    return match ? [{ source: line.source, text: part.trim(), value: Number(match[1]) * (line.multiplier ?? 1) }] : [];
  })) : [];
  const sentryStartFactor = sentryStartLines.reduce((total, line) => total * Math.max(0, 1 + line.value / 100), 1);
  if (sentryStartLines.length) notes.push(`${profile.name}: Sentry Start Time ×${round(sentryStartFactor)} (${sentryStartLines.map((line) => `${line.text} (${line.source})`).join(", ")}; game recipe 857570, attr 6320): no base start time is in the game data (attribute default 0), so the start delay stays 0 and this changes nothing (provisional).`);
  const weaponAttacksPerSecond = attackSpeed?.weaponAttacksPerSecond ?? null;
  if (sentry) notes.push(`${profile.name}: ${sentry.note || "the Sentry's cadence follows Cast Frequency (manual rule 1001011724), not Attack / Cast Speed"}; Cast Frequency ×${round(castFrequencyFactor)}${castFrequencyLines.length ? ` (${castFrequencyLines.map((line) => line.text).join("; ")})` : " (no Cast Frequency lines)"}.`);
  if (sentry?.weaponAttackSpeed && attackProfile && !(weaponAttacksPerSecond > 0)) warnings.push(`${profile.name}: its base Cast Frequency is the weapon's Attack Speed and no weapon Attack Speed is available, so its rate is 0.`);

  // Hits per use for a component: a number, or perTick × (duration ÷ effective interval) × shotgun falloff ÷ everyUses.
  // The tick duration is the Terra's (or sentry's) lifetime, or one effective channel interval for a channel skill.
  // Release channels: `perStack` hits land once per channel stack of the cycle, `countAtStacks(stacks)` fixes a count
  // (barrage waves), `durationAtStacks(stacks)` a tick span (Charged Pummel's Electric Field), and `demolisherGated`
  // components only land on cycles that consume a Demolisher Charge.
  const hitsFor = (component) => {
    const spec = component.perUse;
    const gate = component.demolisher?.gated ? demolisherShare : 1;
    // A component that only lands on a Cursed target (Shackles of Malice's Explosion): 0 hits on an uncursed dummy.
    if (component.requiresCursed && !targetCursed) return { hits: 0, detail: "0 per use (the dummy carries no Curse)" };
    if (typeof spec === "number") return { hits: spec * gate, detail: `${spec} per use${gate !== 1 ? ` × ${round(gate)} Demolisher share` : ""}` };
    // Entities the skill leaves behind, each hitting on its own timer (Lightning Beam's Thunderbolts): held = min(cap, uses/s ÷ uses per entity × life).
    if (spec?.heldEntities) {
      const { everyUses, durationSeconds, cap, intervalSeconds: every } = spec.heldEntities;
      const held = intervalSeconds > 0 ? Math.min(cap, durationSeconds / (everyUses * intervalSeconds)) : 0;
      return { hits: held / every * (intervalSeconds || 0), detail: `${round(held)} held (up to ${cap}: one per ${everyUses} uses, ${durationSeconds} s), each hitting every ${every} s, per ${round(intervalSeconds || 0)} s use` };
    }
    // A count the skill's own data computes from its Attack Speed (Spiral Strike, Split 456215: damageCntOnHit = max − numerator ÷
    // (Attack Speed + offset), cast to whole hits; the operand is the skill's speed factor over its base use time).
    if (spec?.speedCount) {
      const { offset, numerator, max } = spec.speedCount;
      const count = Math.max(0, Math.floor(max - numerator / (Math.max(0, speedFactor) + offset) + 1e-9));
      return { hits: count * gate, detail: `${count} per use (${max} − ${numerator} ÷ (Attack Speed ${round(speedFactor)} + ${offset}) = ${round(max - numerator / (Math.max(0, speedFactor) + offset))}, whole hits; ${spec.speedCount.source})${gate !== 1 ? ` × ${round(gate)} Demolisher share` : ""}` };
    }
    if (spec?.perStack) { const stacks = channelState?.fullStacks ?? 5; return { hits: spec.perStack * stacks * gate, detail: `${spec.perStack} per channel stack × ${stacks} stacks per cycle` }; }
    if (spec?.countAtStacks) { const stacks = channelState?.fullStacks ?? 5; const count = spec.countAtStacks(stacks); const volley = projectileVolley(spec.falloff);
      // Census batch 5: Inexhaustible Barrage: Bombard (with a gun) adds extraPerWave projectiles to each next wave: wave k fires k × that more.
      const perWave = spec.falloff?.extraPerWave || 0;
      const falloff = perWave && count > 0 ? Array.from({ length: Math.max(1, Math.floor(count)) }, (_, k) => projectileVolley({ ...spec.falloff, count: spec.falloff.count + perWave * k }).total).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(count)) : volley?.total ?? 1; return { hits: count * (spec.perTick ?? 1) * falloff * gate, shotgun: volley, detail: `${round(count)} at ${stacks} stacks × ${spec.perTick ?? 1} per tick${volley ? ` × ${shotgunVolleyText(volley)}` : ""}` }; }
    // A per-stack rate (Ring of Blades: one hit per blade per second; blades = its Max Projectiles, else channeled stacks): hits per use = stacks ×
    // rate × the effective channel interval, so the hit rate is independent of cast speed.
    if (spec?.perSecondPerStack) {
      const fullStacks = channelState?.fullStacks ?? 5;
      // A blade cap (Ring of Blades: "Generates 1 Projectile for each channeling, up to 5 Projectile(s)"; Blade Formation raises
      // it per Projectile Quantity, game recipe 5798517 [1, 1, 7]: +1 Max Projectiles per +1, up to +7). Read 2026-10-28
      // (user-supplied AI answer; provisional, open question `ring-of-blades-blade-count`): one blade per channel use up
      // to the Max Projectiles, so a held channel keeps the cap (Blade Formation's own 3814813 "creates all Projectiles at
      // once" names the same pool), not the channeled stacks: 7 stacks → 5 blades, Blade Formation + N → 5 + min(7, N).
      const bonus = spec.maxCountBonus ? Math.min(spec.maxCountBonus.cap, spec.maxCountBonus.per * Math.floor(Math.max(0, projectileQuantity) / spec.maxCountBonus.every)) : 0;
      const stacks = Number.isFinite(spec.maxCount) ? spec.maxCount + bonus : fullStacks;
      const span = channel && useTime != null ? useTime : 1;
      return { hits: spec.perSecondPerStack * stacks * span, detail: `${stacks} ${stacks !== fullStacks ? `blades (max ${spec.maxCount + bonus}${bonus ? `: ${spec.maxCount} + ${bonus} Blade Formation` : ""}; ${fullStacks} stacks)` : Number.isFinite(spec.maxCount) ? "blades" : "stacks"} × ${spec.perSecondPerStack} hit/s each × ${round(span)} s channel use` };
    }
    // Sentry tick specs: `intervalSeconds` may be a function of the weapon's attacks per second (Einherjar cadence);
    // `castFrequencyScaled` divides the interval by the Cast Frequency factor; `weaponAttackSpeedScaled` by the weapon's
    // base attacks per second (no weapon → no ticks).
    const rawInterval = spec?.intervalAtStacks ? spec.intervalAtStacks(channelState?.fullStacks ?? 5) : typeof spec?.intervalSeconds === "function" ? spec.intervalSeconds({ weaponAttacksPerSecond: weaponAttacksPerSecond || 0, castFrequencyFactor }) : spec?.intervalSeconds;
    const sentryDivisor = (spec?.castFrequencyScaled ? castFrequencyFactor : 1) * (spec?.weaponAttackSpeedScaled ? (weaponAttacksPerSecond || 0) : 1);
    const baseInterval = rawInterval ? (sentryDivisor > 0 ? rawInterval / sentryDivisor : Infinity) : rawInterval;
    const speedScaled = speedType === "attack-speed" ? spec?.attackSpeedScaled : spec?.castSpeedScaled;
    const interval = baseInterval ? baseInterval / (speedScaled ? speedFactor : 1) : null;
    // `durationSeconds` on the spec: a fixed span per use (Spiral Strike's dash) whose ticks follow the speed-scaled interval.
    const span = spec?.durationAtStacks ? spec.durationAtStacks(channelState?.fullStacks ?? 5) : spec?.durationSeconds ?? terra?.durationSeconds ?? (channel && !release && useTime != null ? useTime : 1);
    const ticks = interval ? span / interval : 1;
    const volley = projectileVolley(spec?.falloff);
    const falloff = volley?.total ?? 1;
    const everyUses = Math.max(1, spec?.everyUses || 1);
    const hits = ticks * (spec?.perTick ?? 1) * falloff / everyUses * gate;
    return { hits, shotgun: volley, detail:`${interval ? `${round(ticks)} ticks (every ${round(interval)} s${terra ? ` over ${terra.durationSeconds} s` : spec?.durationAtStacks ? ` over ${round(span)} s at ${channelState?.fullStacks ?? 5} stacks` : spec?.durationSeconds ? ` over a ${round(span)} s use` : channel ? ` per ${round(span)} s channel use` : ""}${spec?.intervalAtStacks ? ` at ${channelState?.fullStacks ?? 5} stacks` : ""})` : "1 tick"} × ${spec?.perTick ?? 1} per tick${volley ? ` × ${shotgunVolleyText(volley)}` : ""}${everyUses > 1 ? ` ÷ every ${everyUses} uses` : ""}${gate !== 1 ? ` × ${round(gate)} Demolisher share` : ""}` };
  };
  const provisionalComponents = [];

  // Components: the hit rows' typed entries plus one per added-flat type (attached to the primary component).
  // A component's Demolisher bonus ("+X% additional Hit Damage [per channeled stack] when consuming Demolisher Charge")
  // joins its additional layer at the expected share: E = hit × (1 + share × X% [× stacks]).
  // Extra projectiles from Projectile Quantity reach the single dummy only when the skill text says its projectiles can hit
  // the same enemy (src/support-effects.js projectileQuantityFalloff). A projectile volley component (falloff spec) gains the
  // projectiles and keeps its reach rule; a single-component skill's lone projectile becomes a fan of 1 + extra (manual
  // 1001011021: additional projectiles share the origin and fly at an angle), all of which reach the dummy standing
  // close (one at range), each after the first keeping the hit rule's share, else 100% − the skill text's coefficient, else 30%
  // (src/shotgun-effect.js: client repeat multiplier, user decision 2026-11-05). Every other skill keeps one projectile on one target: Ice Lances
  // Lv16 + Multiple Projectiles (user, 2026-10-12) showed one floating number per cast and only the ×1.15 additional damage.
  // A profile's own projectile rule (`projectileVolley`, from the skill's reference data card): its coefficient and reach, and how many
  // extra projectiles the Projectile Quantity gives (Homing Frost Bolt: 1 per +2, up to +2).
  const volleyRule = profile.projectileVolley || null;
  const projectileQuantity = sum(supports.effects.quantity.filter((line) => line.kind === "projectiles"));
  // "Projectile Quantity Upper limit: N" (Sweeping Fury; user-supplied 2026-10-19 with the ring reading): the skill fires at most
  // N projectiles, so the extra projectiles stop at N − its base count (the volley's own count, else 1).
  const projectileLimitLines = modifierTexts.flatMap((line) => { const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(PROJECTILE_QUANTITY_LIMIT_LINE); return match ? [{ source: line.source, value: Number(match[1]) }] : []; });
  const projectileLimit = projectileLimitLines.length && skillTags.has("Projectile") ? Math.min(...projectileLimitLines.map((line) => line.value)) : Infinity;
  const baseProjectiles = Math.max(1, ...base.components.map((component) => component.perUse?.falloff?.count || 0));
  const uncappedExtraProjectiles = volleyRule ? Math.min(volleyRule.maxExtra ?? Infinity, Math.floor(projectileQuantity / (volleyRule.perQuantity || 1))) : projectileQuantity;
  const extraProjectiles = profile.projectileQuantityFixed ? 0 : Math.max(0, Math.min(uncappedExtraProjectiles, projectileLimit - baseProjectiles));
  if (profile.projectileQuantityFixed && uncappedExtraProjectiles > 0) notes.push(`${profile.name}: Projectile Quantity fixed at 1 (census batch 5): the +${round(uncappedExtraProjectiles)} extra projectiles are not fired.`);
  if (extraProjectiles < uncappedExtraProjectiles) notes.push(`${profile.name}: Projectile Quantity Upper limit ${projectileLimit} (${projectileLimitLines.map((line) => line.source).join(", ")}): ${round(uncappedExtraProjectiles)} extra projectiles → ${round(extraProjectiles)} (base ${baseProjectiles}).`);
  const falloffFactor = extraProjectiles > 0 ? (volleyRule ? volleyRule.factor : projectileQuantityFalloff(profile.name)) : null;
  // A profile that names its projectile group (census batch 5: Psionic Missile's pulse added beside it) keeps it the target.
  const projectileTargets = falloffFactor ? base.components.filter((component) => component.perUse?.falloff || ((base.components.length === 1 || (profile.projectileComponent && component.componentKey === profile.projectileComponent)) && component.perUse != null)) : [];
  if (extraProjectiles > 0 && !falloffFactor) notes.push(`${profile.name}: +${extraProjectiles} Projectile Quantity — the skill text does not say its projectiles can hit the same enemy, so one reaches the dummy (Ice Lances run, 2026-10-12).`);
  if (falloffFactor && !projectileTargets.length) notes.push(`${profile.name}: +${extraProjectiles} Projectile Quantity — the projectile component is not identified in this profile, so the extra projectiles are not counted.`);
  // Gear "+X% Combo Finisher Amplification" (Heart of Animitta; field 2006257, census item #9) sums with the supports' lines.
  const comboAmplification = [...supports.effects.combo.filter((line) => line.kind === "amplification"), ...(comboExtras?.amplification || []).map((line) => ({ source: line.source, text: line.text, value: line.value }))];
  // Unstoppable Force (Ethereal Prism core; game affix 273110144: field 2006255 = 100 on the Combo Finisher tag 6000412): "When a
  // Combo Finisher is in Multistrike, it is guaranteed to deal damage equal to the Max Multistrike Count". Every Multistrike attack
  // of the Finisher's sequence, the first included, takes the Max Multistrike Count attack's increment (user-supplied 2026-10-19,
  // Google AI Mode answer, not tested in game): a 100% Cat Dive on the repeats (multistrikeSequence catDiveChancePercent) plus
  // `firstAtMax` on the first attack.
  // One additional factor on the Finisher components only. Needs a Combo skill that Multistrikes.
  const unstoppableLine = multistrike && profile.cycle ? modifierTexts.find((line) => UNSTOPPABLE_FORCE_LINE.test(normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim())) : null;
  const unstoppable = unstoppableLine ? (() => {
    const guaranteed = multistrikeSequence({ chancePercent: multistrikeChance, incrementPercent: multistrikeIncrement, skillIncrementAdditionalPercent, initialCountBonus, catDiveChancePercent: 100, firstAtMax: true });
    const factor = multistrike.damagePerCycle > 0 ? guaranteed.damagePerCycle / multistrike.damagePerCycle : 1;
    return { source: unstoppableLine.source, text: unstoppableLine.text, factor, maxCount: guaranteed.maxCount };
  })() : null;
  if (unstoppable) multistrike.unstoppableForce = { source: unstoppable.source, factor: unstoppable.factor, maxCount: unstoppable.maxCount };
  // "+X% additional Steep Strike Damage" (gear, e.g. Shadowless Swordsman's Blade; user-supplied reading 2026-10-14): an
  // independent multiplier on Steep Strike hits only (the components marked steep role "steep"). The shared damage classifier
  // leaves these lines out (src/damage-line-classifier.js), so no other layer reads them.
  const steepDamageLines = steepStrike ? modifierTexts.flatMap((line) => String(line.text ?? "").split(/;|\n/).flatMap((part) => {
    const match = normalizePercentageText(part).replace(/\s+/g, " ").trim().match(/^\+?([+-]?\d+(?:\.\d+)?)% additional Steep Strike Damage\.?$/i);
    return match ? [{ source: line.source, text: `${part.trim()} (Steep Strike hits only; user-supplied reading 2026-10-14)`, value: Number(match[1]) * (line.multiplier ?? 1) }] : [];
  })) : [];
  // Blazing Sun (Dual Kismet: Sun Slash "Gains Blazing Sun", record 576525120: buff 35090, affix 882869952 args [6, 1, 1]; 2026-11-09, 25 T
  // gap 5): node 114 from the Steep Strike chance field 2011002 (base) per 6 → +1% additional damage on the Steep Strike tag 5006010
  // (attr 5719 mod 4), linear (no GetFloorInt), uncapped; its twin write (+1% Skill Area for Slash-Strike skills) moves no hit. The field
  // is read at the skill's own chance (the query is inferred: open question blazing-sun-steep-chance).
  const blazingSun = steepStrike ? modifierTexts.find((line) => /^Gains Blazing Sun$/i.test(String(line.text ?? "").trim())) : null;
  if (blazingSun && steepStrike.chancePercent > 0) steepDamageLines.push({ source: blazingSun.source, text: `Blazing Sun: +1% additional Steep Strike Damage per 6% Steep Strike chance × ${round(steepStrike.chancePercent)}% = +${round(steepStrike.chancePercent / 6)}% (affix 882869952, node 114; Steep Strike hits only)`, value: steepStrike.chancePercent / 6 });
  // "-X% additional Sweep Slash Damage" (Highest Glance, "…; +120% additional Steep Strike Damage"; legendary audit 2026-10-22): the
  // same independent multiplier on the Sweep Slash hits (the components marked steep role "sweep").
  const sweepDamageLines = steepStrike ? modifierTexts.flatMap((line) => String(line.text ?? "").split(/;|\n/).flatMap((part) => {
    const match = normalizePercentageText(part).replace(/\s+/g, " ").trim().match(/^([+-]?\d+(?:\.\d+)?)% additional Sweep Slash Damage\.?$/i);
    return match ? [{ source: line.source, text: `${part.trim()} (Sweep Slash hits only)`, value: Number(match[1]) * (line.multiplier ?? 1) }] : [];
  })) : [];
  // "+X% additional Combo Finisher Damage" (Shockwave Warcry's buff, game affix 127872560 on the Combo Finisher tag; census 2026-10-27,
  // src/empower-buffs.js): one additional factor on the Combo Finisher components only. The shared classifier does not read it.
  const finisherDamageLines = profile.cycle ? modifierTexts.flatMap((line) => { const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(/^\+?([+-]?\d+(?:\.\d+)?)% additional Combo Finisher Damage$/i); return match ? [{ source: line.source, text: `${line.text} (Combo Finisher hits only)`, value: Number(match[1]) * (line.multiplier ?? 1) }] : []; }) : [];
  // Combo Points per Starter (src/combo-points.js comboPointState; gear and the supports' "for the supported skill" lines).
  const comboPoints = profile.cycle ? comboPointState(modifierTexts, supports.effects.combo.filter((line) => line.kind === "points")) : null;
  // "Gains N Combo Point(s) on Critical Strike from Combo Finishers" (census item #9; game recipe 313241984): the share of Finisher
  // casts that crit (one check per cast: 1 − (1 − c)^hits) carries N points into the next Finisher (expected value; provisional). The
  // crit chance here is the skill's chance read the way the crit block below reads it (supports' and tagged rating on the attack crit).
  const starterCritPointLines = profile.cycle ? (supports.effects.combo || []).filter((line) => line.kind === "starterCritPoints" && ["In calc", "Provisional"].includes(line.status)) : [];
  const comboCritChance = comboExtras?.pointsOnCrit > 0 || starterCritPointLines.length ? (() => {
    if (crit.guaranteedCrit) return 1 - (crit.cannotCritShare || 0);
    const base = attackProfile ? (crit.attackCrit || weapon?.crit || null) : null;
    const tagged = base ? crit.taggedCrit || { ratingPercent: 0, ratingFlat: 0 } : null;
    if (base && (supports.critRating.length || tagged.ratingPercent || tagged.ratingFlat)) {
      const own = supportCritSums();
      const flat = own.flat + tagged.ratingFlat;
      const percent = own.percent + tagged.ratingPercent;
      const rating = Math.max(0, ((base.weaponRating || 0) + (base.flatRating || 0) + flat) * Math.max(0, 1 + ((base.increasedRatingPercent || 0) + percent) / 100) * own.additionalFactor);
      return Math.min(100, rating / 100) / 100;
    }
    return Math.max(0, Math.min(100, crit.criticalChancePercent || 0)) / 100;
  })() : 0;
  const baseConsumedPoints = comboPoints?.consumed ?? CONSUMED_COMBO_POINTS;
  // Combo Finisher support lines (census batch 4; src/support-conditional-batch4.js): Crescent Slash: Rising's single-hit Finisher (1 hit, not
  // 1 + 1 per consumed point: its Finisher split 837369 deals damage row 952 once, game files 2026-10-28) and per-consumed-point additional
  // damage (game recipe 468001344; also on the Finisher's ailments, `combo.finisherDamageLines`), Gale Slash: Brutality's additional Critical
  // Strike Damage per consumed point (867824320).
  const comboSupportLines = (kind) => profile.cycle ? supports.effects.combo.filter((line) => line.kind === kind && ["In calc", "Provisional"].includes(line.status)) : [];
  const singleHitFinisher = comboSupportLines("singleHitFinisher").length > 0;
  const finisherHitsPerCast = Math.max(1, base.components.filter((component) => String(component.componentKey ?? component.key ?? "").split(/[+>:]/)[0] === "finisher" && !component.addedOnly).reduce((total, component) => total + (component.comboPerPoint === "hits" ? (singleHitFinisher ? 1 : 1 + comboCountFromPoints(baseConsumedPoints)) : typeof component.perUse === "number" ? component.perUse : 1), 0));
  const finisherCritCastChance = comboCritChance > 0 ? 1 - Math.pow(1 - comboCritChance, finisherHitsPerCast) : 0;
  // Gale Slash: Brutality (chunk 8; recipe 321298880): points on Starter 1 behind a cooldown, min(1, cycle ÷ cooldown) of the cycles, up to the Max Combo Points.
  const cycleSeconds = usesPerSecond > 0 ? 1 / usesPerSecond : 0;
  // The cap holds on each cycle that gains them, so a mean over the cycles reads the capped gain.
  const consumedAfterStarterPoints = comboSupportLines("starterPoints").reduce((points, line) => points + Math.min(1, cycleSeconds / Math.max(1e-9, line.cooldown)) * Math.max(0, Math.min(MAX_COMBO_POINTS_DEFAULT, baseConsumedPoints + line.value) - baseConsumedPoints), baseConsumedPoints);
  // Gale Slash: Dominance (src/support-chunk8.js; game recipe 955168320): each Combo Starter cast that crits gains N points once (label 3100533
  // on the cast's instance), before the next Finisher's instance is created, so the first Finisher of the sequence consumes them: per Starter
  // step N × P(the cast crits), P = 1 − (1 − c)^checks, checks = 1 per hit group with the crit cache on (src/crit-cache.js), else its hits.
  const starterCritGain = starterCritPointLines.reduce((total, line) => total + (Number(line.value) || 0), 0);
  const starterCritCasts = starterCritGain > 0 && comboCritChance > 0 && profile.cycle?.steps?.length ? profile.cycle.steps.filter(isStarterStep).map((step) => {
    const parts = base.components.filter((component) => !component.addedOnly && !component.splitPart && step.keys.includes(String(component.componentKey ?? component.key ?? "").split(/[+>:]/)[0]));
    const hits = parts.reduce((total, component) => total + (typeof component.hitsPerUse === "number" ? component.hitsPerUse : typeof component.perUse === "number" ? component.perUse : 1), 0);
    const groups = new Set(parts.map((component) => component.strikeKey ?? component.componentKey ?? component.key)).size;
    const checks = critCacheFor(profile.name).cached ? Math.min(hits, groups) : hits;
    return { keys: step.keys, checks, chance: checks > 0 ? 1 - Math.pow(1 - Math.min(1, comboCritChance), checks) : 0 };
  }) : [];
  const starterCritPoints = starterCritCasts.reduce((total, cast) => total + starterCritGain * cast.chance, 0);
  const consumedBeforeCrit = starterCritPoints > 0 ? Math.min(MAX_COMBO_POINTS_DEFAULT, consumedAfterStarterPoints + starterCritPoints) : consumedAfterStarterPoints;
  const consumedPoints = comboExtras?.pointsOnCrit > 0 ? expectedConsumedWithCritPoints(consumedBeforeCrit, comboExtras.pointsOnCrit, finisherCritCastChance, MAX_COMBO_POINTS_DEFAULT) : consumedBeforeCrit;
  if (comboPoints && consumedPoints !== baseConsumedPoints) Object.assign(comboPoints, { changed: true, consumed: consumedPoints, ...(comboExtras?.pointsOnCrit > 0 ? { critPoints: { value: comboExtras.pointsOnCrit, castChance: finisherCritCastChance, sources: comboExtras.pointOnFinisherCrit } } : {}), ...(starterCritPoints > 0 ? { starterCritPoints: { value: starterCritGain, expected: starterCritPoints, casts: starterCritCasts, sources: starterCritPointLines.map((line) => line.source) } } : {}) });
  if (starterCritPoints > 0) notes.push(`${profile.name}: "${starterCritPointLines[0].text}" (${starterCritPointLines.map((line) => line.source).join(", ")}; game recipe 955168320, once per cast): ${starterCritCasts.map((cast) => `${cast.keys.join("+")} crits on ${round(cast.chance * 100)}% of casts (${round(cast.checks)} determination(s))`).join(", ")}, so the Finisher consumes ${round(starterCritPoints)} more Combo Point(s) on average: ${round(consumedPoints)} in all (provisional).`);
  // Each Finisher of the sequence consumes what is held when it is created (src/combo-points.js finisherConsumedPoints; SS14 client
  // 0x141defa80): the first `consumedPoints`, each later one only the crit points gained since the previous Finisher's consume.
  // `finisherCharges` lists them (expected) when the sequence holds more than one Finisher; `finisherInstances` gives each its own Finisher
  // component below, a later Finisher split by whether the previous one's cast crit (whole Clones / hits per outcome).
  const finisherChargeInput = { starterPoints: consumedBeforeCrit, finishers: finisherRepeats, pointsOnCrit: comboExtras?.pointsOnCrit || 0, critCastChance: finisherCritCastChance, maxPoints: MAX_COMBO_POINTS_DEFAULT };
  const finisherCharges = profile.cycle && finisherRepeats > 1 ? finisherConsumedPoints(finisherChargeInput) : null;
  const finisherInstances = finisherCharges ? finisherChargeInstances(finisherChargeInput) : null;
  if (finisherCharges && comboPoints) Object.assign(comboPoints, { perFinisher: finisherCharges });
  // Crescent Slash: Flash (chunk 8; recipe 679952384: field 2600541, the Finisher's extra attacks, from the increased Attack Speed): whole steps, up to the cap.
  const comboConsumedPoints = singleHitFinisher ? 0 : consumedPoints;
  const finisherExtraHits = profile.cycle ? (supports.effects.finisherHits || []).reduce((total, line) => total + Math.min(line.cap, line.value * Math.floor(Math.max(0, (attackSpeed?.increasedPercent || 0) + supportIncreasedSpeed) / line.every)), 0) : 0;
  if (finisherExtraHits) notes.push(`${profile.name}: +${finisherExtraHits} Combo Finisher hit(s) from the increased Attack Speed (${supports.effects.finisherHits.map((line) => line.source).join(", ")}).`);
  // A Finisher of its own (Combo Finisher charges, finisherCharges) reads its own consumed points.
  const finisherPointLinesAt = (consumed) => comboSupportLines("perConsumedPoint").map((line) => { const points = Math.min(line.cap ?? Infinity, consumed); return { source: line.source, text: `${line.text} × ${round(points)} consumed Combo Points (one term; game recipe 468001344)`, value: line.value * points }; }).filter((line) => line.value);
  const finisherPointLines = finisherPointLinesAt(consumedPoints);
  const finisherCritPointLines = comboSupportLines("critDamagePerConsumedPoint").map((line) => ({ ...line, points: Math.min(line.cap ?? Infinity, consumedPoints) }));
  if (singleHitFinisher) notes.push(`${profile.name}: ${comboSupportLines("singleHitFinisher").map((line) => line.source).join(", ")}: the Combo Finisher deals damage once per cycle (not 1 + 1 per consumed Combo Point).`);
  if (comboPoints?.critPoints) notes.push(`${profile.name}: "${comboExtras.pointOnFinisherCrit[0].text}" (${comboExtras.pointOnFinisherCrit.map((line) => line.source).join(", ")}; game recipe 313241984): ${round(finisherCritCastChance * 100)}% of Finisher casts crit (1 − (1 − ${round(comboCritChance * 100)}%)^${round(finisherHitsPerCast)} hits) and carry ${comboExtras.pointsOnCrit} point(s) into the next Finisher: ${round(consumedPoints)} consumed on average (Max Combo Points field 2012115: ${MAX_COMBO_POINTS_DEFAULT}; provisional).`);
  if (comboPoints?.sources.length) notes.push(`${profile.name}: ${round(comboPoints.perStarter)} Combo Points per Starter (1 observed + ${comboPoints.sources.map((line) => `${round(line.value)} ${line.source}`).join(" + ")}; game field 2012116, provisional): the Finisher consumes ${round(consumedPoints)} (2 Starters; no cap on the points, field 2012115; up to 4 extra hits / Clones).`);
  // Barrage waves (barrageWaveState) on a Barrage skill's "waves" component.
  const barrage = skillTags.has("Barrage") ? barrageWaveState({ modifierTexts, supportClauses: supports.effects.clauses }) : null;
  // Chunk 8 (src/support-chunk8.js): Blizzard: Numbing Cold, wave k at k × P1 Cold Penetration, so the mean over the waves is linear in the factor;
  // Shackles of Malice: Mutual Destruction, the share of the skill's Elemental Penetration, read as one pool (the highest type), on its Erosion hits.
  for (const line of supports.effects.penetration || []) {
    if (line.kind === "perWave") {
      const waves = (base.components.find((component) => String(component.componentKey ?? component.key ?? "").split(/[+>:]/)[0] === "waves")?.hitsPerUse ?? (typeof profile.components?.find((component) => component.key === "waves")?.perUse === "number" ? profile.components.find((component) => component.key === "waves").perUse : 1)) + (barrage?.extraWaves || 0);
      const item = { source: line.source, text: `${line.text}: mean over ${round(waves)} waves`, value: line.value * Math.max(0, waves - 1) / 2, damageTypes: new Set(["Cold"]), category: "Penetration" };
      if (hitPool) hitPool.addPenetration(item); else penetrationLines.push(item);
    } else if (line.kind === "elementalToErosion") {
      const top = Math.max(0, ...["Fire", "Cold", "Lightning"].map((type) => hitPool ? hitPool.penetration(type).base : sum(penetrationLines.filter((item) => item.damageTypes.has(type)))));
      const item = { source: line.source, text: `${line.text}: ${line.value}% × ${round(top)}% Elemental Penetration`, value: line.value / 100 * top, damageTypes: new Set(["Erosion"]), category: "Penetration" };
      if (top > 0) { if (hitPool) hitPool.addPenetration(item); else penetrationLines.push(item); }
    }
  }
  // "+X% additional skill damage when Demolisher Charge is consumed" (DEMOLISHER_CONSUMED_LINE).
  const demolisherConsumed = profile.demolisher ? modifierTexts.flatMap((line) => { const match = lineText(line).match(DEMOLISHER_CONSUMED_LINE); return match ? [{ source: line.source, text: lineText(line), value: Number(match[1]) * (line.multiplier ?? 1) }] : []; }) : [];
  // The support line of the same rule (census batch 4: Groundshaker: Cripple, game recipe 88992; src/support-conditional-batch4.js).
  if (profile.demolisher) for (const clause of supports.effects.clauses) if (clause.demolisherConsumedValue && clause.active && ["In calc", "Provisional"].includes(clause.status)) demolisherConsumed.push({ source: clause.source, text: clause.text, value: clause.demolisherConsumedValue });
  // Magnificent "When the supported skill <event>, if Spell Burst is at max stacks, you can consume Spell Burst. +X% additional Hit
  // Damage for <these hits> for each stack consumed" (Flame Jet, Fallen Star, Storm Field, Tidewell, Haunting Abomination; census
  // item #8, skill stones): Spell Burst fills every full charge time (2 s ÷ Charge Speed, game manual) and the next event of that
  // component consumes it, so min(1, event interval ÷ full charge time) of its events take +X% × Max Spell Burst (the whole event's
  // hits). These skills have a cooldown, so they never activate Spell Burst themselves; a skill that does keeps the stacks for its
  // own activations (no consumption here). Provisional (open question spell-burst-consume-share).
  const spellBurstConsume = spellBurstStacks >= 1 && Number.isFinite(spellBurstCharge.seconds) && spellBurstCharge.seconds > 0 && !spellBurst ? supports.effects.spellBurst.filter((line) => line.kind === "consume" && line.status !== "Inactive" && line.value) : [];
  // The profile component a typed part comes from (its census batch 5 fields: quantityBonus, extraClones, allLastWave).
  const profileComponentOf = (component) => profile.components.find((item) => item.key === String(component.componentKey ?? "").split(/[+>:]/)[0]) || {};
  // The lines on the hits that carry Groundshaker's fissure tag 6101354 (supports.effects.fissureTagAdditional: Cripple, record 119083224)
  // for a profile component's `fissureTag` (2026-11-14, src/attack-hit-profiles.js Groundshaker): 1, every hit of the component carries it
  // (Frequent Quake's pulses); "demolisher", only the hits of the uses that consume a Demolisher Charge (the Fission, which the spreading
  // fissure deals on those uses: Split 177867). The row-502 explosion carries none.
  const fissureTagged = (tag) => (tag && demolisherShare > 0 ? (supports.effects.fissureTagAdditional || []).filter((line) => line.value) : []);
  // `charge` (Combo Finisher charges, finisherInstances): which Finisher of the sequence this component is, the points it consumes and its
  // weight (a later Finisher's crit / no-crit outcome of the previous one).
  const buildComponent = (component, charge = null) => {
    const pointsHere = charge ? charge.points : consumedPoints;
    const laterCharge = Boolean(charge && charge.index > 0);
    const chargeWeight = charge?.weight ?? 1;
    const projectileBoost = projectileTargets.includes(component);
    // Slash-Strike components follow the summed Steep Strike share (steepStrikeState; 2026-10-14).
    // Thunder Slash (stored attempts): the Steep Strike lands on `share` of uses and replaces that use's Sweep Slash, so the
    // Sweep Slash keeps its profile count less the share (1.2 − share: the profile's +20% repeated sweep stays a sweep).
    const attemptMode = Boolean(steepStrike?.attempts) && component.steep;
    const steepRole = (steepStrike?.fromChance || attemptMode) && component.steep ? component.steep : null;
    // Blade Cluster: each launched Steep Strike → 1 + clusterHits Steep Strike hits, clusterHits 0 without Shotgun Effect (steepStrikeState).
    const clusterFactor = steepRole?.role === "steep" ? 1 + (steepStrike.clusterHits || 0) : 1;
    const steepPerUse = !steepRole ? null : attemptMode
      ? (steepRole.role === "sweep" ? Math.max(0, (typeof component.perUse === "number" ? component.perUse : 1) - steepStrike.share) : steepStrike.share * (steepRole.perSteep ?? 1) * clusterFactor)
      : (steepRole.role === "sweep" ? 1 - steepStrike.share : steepStrike.share * (steepRole.perSteep ?? 1) * clusterFactor);
    // A Finisher's count follows the consumed Combo Points (Crescent Slash: 1 hit + 1 per point; Spectral Slash: 1 Clone + 1 per point).
    // The points are not capped (field 2012115); the hits / Clones they buy are, "up to 4" (comboCountFromPoints).
    const comboSpec = singleHitFinisher && component.comboPerPoint === "hits" ? 1 : !(comboPoints?.changed || laterCharge) ? null : component.comboPerPoint === "hits" ? 1 + comboCountFromPoints(pointsHere)
      : component.comboPerPoint === "clones" && component.perUse?.falloff ? { ...component.perUse, falloff: { ...component.perUse.falloff, count: 1 + comboCountFromPoints(pointsHere) + (profileComponentOf(component).extraClones || 0) } } : null;
    // Census batch 5: a count raised per Projectile Quantity (Blazing Meteor: Detonation's Ash explosions).
    const ownBonus = profileComponentOf(component).quantityBonus;
    const quantityBonus = ownBonus && typeof component.perUse === "number" ? Math.min(ownBonus.cap, ownBonus.per * Math.floor(Math.max(0, projectileQuantity) / ownBonus.every)) : 0;
    const spec = quantityBonus ? component.perUse + quantityBonus : steepPerUse != null ? steepPerUse : comboSpec != null ? comboSpec : projectileBoost && component.perUse?.falloff ? { ...component.perUse, falloff: { ...component.perUse.falloff, count: component.perUse.falloff.count + extraProjectiles } } : component.perUse;
    const steppedPerUse = hitsFor({ ...component, perUse: spec });
    const rawPerUse = !steepRole ? steppedPerUse : attemptMode
      ? { ...steppedPerUse, detail: `${steppedPerUse.detail} (${steepRole.role === "sweep" ? `${typeof component.perUse === "number" ? component.perUse : 1} − ${round(steepStrike.share)}` : `${round(steepStrike.share)}${clusterFactor !== 1 ? ` × ${clusterFactor}` : ""}`}: Steep Strikes per use from stored attempts${steepStrike.attempts.window ? ", Big Stride's window open" : ""}${clusterFactor !== 1 ? `; × ${clusterFactor} Blade Cluster hits per launched Steep Strike` : ""}; user-supplied mechanism, provisional)` }
      : { ...steppedPerUse, detail: `${steppedPerUse.detail} (${steepRole.role === "sweep" ? `1 − ${round(steepStrike.share)}` : `${round(steepStrike.share)}${(steepRole.perSteep ?? 1) !== 1 ? ` × ${steepRole.perSteep}` : ""}${clusterFactor !== 1 ? ` × ${clusterFactor}` : ""}`}: Steep Strike share min(100%, ${round(steepStrike.chancePercent)}% chance))` };
    const extraVolley = projectileBoost && !component.perUse?.falloff ? shotgunVolley({ count: extraProjectiles + 1, factor: falloffFactor, reach: fanReach(volleyRule?.reach || "fan", fanLandsAll) }, { nearTarget, landed: profile.noProjectileControl ? null : landedOverride }) : null;
    if (extraVolley && !profile.noProjectileControl) projectileVolleys.push(extraVolley);
    // Psionic Missile: Convergence (census batch 5): each explosion after the first takes +X% × min(cap, projectiles fired).
    const converge = extraVolley && volleyRule?.subsequentAdditional ? { ...volleyRule.subsequentAdditional, bonus: volleyRule.subsequentAdditional.value * Math.min(volleyRule.subsequentAdditional.cap, extraVolley.count) / 100 } : null;
    if (converge) extraVolley.total = 1 + extraVolley.factor * (extraVolley.reached - 1) * (1 + converge.bonus);
    const perUse = extraVolley ? { hits: rawPerUse.hits * extraVolley.total, shotgun: extraVolley, detail: `${rawPerUse.detail} × ${shotgunVolleyText(extraVolley)} (1 + ${extraProjectiles} projectiles from supports ${volleyRule ? `by the skill's own rule: ${volleyRule.note}` : "in a fan; provisional"})` } : projectileBoost ? { ...rawPerUse, detail: `${rawPerUse.detail} (+${extraProjectiles} projectiles from supports; provisional)` } : rawPerUse;
    if (component.basis === "provisional") provisionalComponents.push(component);
    const fissureTag = profileComponentOf(component).fissureTag;
    // Hero effects scoped to one hit group (Youga's Alternate Spacetime: Blazing Meteor's Ash, Serpent Beam's Finisher; src/youga-ultimate-one.js).
    const heroComponentLines = [...(heroEffects?.componentAdditional?.[String(component.componentKey ?? component.key).split(/[+>:]/)[0]] || []),
      // Support lines scoped to one hit group (condition-unread batch 3).
      ...(supports.effects.componentAdditional?.[String(component.componentKey ?? component.key).split(/[+>:]/)[0]] || []),
      // Lines on the hits that carry the fissure tag on every hit (fissureTag 1); a "demolisher" share joins the Demolisher-consumed lines below.
      ...(fissureTag === 1 ? fissureTagged(fissureTag).map((line) => ({ ...line, text: `${line.text} (every hit carries the fissure tag 6101354)` })) : [])].filter((line) => line.value);
    const extraAdditional = [...(component.extraAdditional || []), ...(component.steep?.role === "steep" ? steepDamageLines : component.steep?.role === "sweep" ? sweepDamageLines : []), ...(String(component.componentKey ?? component.key).split(/[+>:]/)[0] === "finisher" ? [...finisherDamageLines, ...(charge ? finisherPointLinesAt(pointsHere) : finisherPointLines)] : []), ...heroComponentLines];
    // Barrage waves (barrageWaveState): the expected extra wave on the "waves" component, and the per-wave damage average.
    const waveCount = barrage?.active && String(component.componentKey).split(/[+>:]/)[0] === "waves" ? (typeof spec === "number" ? spec : spec?.countAtStacks ? spec.countAtStacks(channelState?.fullStacks ?? 5) : null) : null;
    const waveHitsFactor = waveCount > 0 ? (waveCount + barrage.extraWaves) / waveCount : 1;
    if (waveCount > 0 && barrage.perWavePercent) {
      // Blizzard: Avalanche (census batch 5): every wave is the last wave, so each takes the last wave's per-wave bonus.
      const factor = profileComponentOf(component).allLastWave ? 1 + (waveCount + barrage.extraWaves - 1) * barrage.perWavePercent / 100 : barrageAverageFactor(waveCount, barrage.extraWaves, barrage.perWavePercent);
      extraAdditional.push({ source: barrage.perWave.map((line) => line.source).join(" + "), text: `+${round(barrage.perWavePercent)}% damage increase per wave: wave k deals ×(1 + k × ${round(barrage.perWavePercent)}%) over ${round(waveCount + barrage.extraWaves)} waves = ×${round(factor)} average (game field 2501029; per-wave formula provisional)`, value: (factor - 1) * 100 });
    }
    // "+X% additional skill damage when Demolisher Charge is consumed" (DEMOLISHER_CONSUMED_LINE).
    // With fissure-tag lines on the charge-consuming share (fissureTag "demolisher": the Fission, dealt by the spreading fissure on those
    // uses), both act on the same uses: one expected factor 1 + share × (Π(1 + X) − 1) over the uses, not one linear term per line.
    const chargeFissure = fissureTag === "demolisher" && !component.demolisher?.gated ? fissureTagged(fissureTag) : [];
    if (chargeFissure.length) {
      const lines = [...demolisherConsumed, ...chargeFissure], product = lines.reduce((factor, line) => factor * (1 + line.value / 100), 1);
      extraAdditional.push({ source: lines.map((line) => line.source).join(" + "), text: `${lines.map((line) => line.text).join("; ")}: ×${round(product)} together on a use that consumes a Demolisher Charge (its Fission is the spreading fissure, tag 6101354: Split 177867), ×1 on the rest, × ${round(demolisherShare)} share of uses that consume a charge`, value: (product - 1) * demolisherShare * 100 });
    } else if (demolisherConsumed.length && demolisherShare > 0) {
      const share = component.demolisher?.gated ? 1 : demolisherShare;
      for (const line of demolisherConsumed) extraAdditional.push({ source: line.source, text: `${line.text} × ${round(share)} ${component.demolisher?.gated ? "(this part lands only on uses that consume a charge)" : "share of uses that consume a charge"} (game affix 175116; provisional)`, value: line.value * share });
    }
    // Focused Slash: "0.4% additional damage for this skill for every 1 Fervor Rating"; Focused Shot: "For every 10 Fervor Rating, ... up to +4% additional
    // damage to a distant enemy" (whole steps, at range only). Both "affected by Fervor Effect" (skill text; chunk 7).
    if (profile.fervorBonus && fervor?.rating > 0 && (!profile.fervorBonus.distant || !nearTarget)) {
      // Focused Slash: Tranquility, Focused Shot: Long Shot (chunk 8): attr 7000 raises Fervor's effect on this skill, not the keyword's basic effects.
      const fervorOnSkill = (supports.effects.fervorOnSkill || []).reduce((total, line) => total + line.value, 0);
      const { every } = profile.fervorBonus, percent = profile.fervorBonus.percent * (1 + fervorOnSkill / 100), steps = every > 1 ? Math.floor(fervor.rating / every) : fervor.rating;
      extraAdditional.push({ source: `${profile.name}: Fervor`, text: `+${percent}% additional damage per ${every > 1 ? `${every} ` : ""}Fervor Rating × ${round(steps)}${fervor.effectPercent ? ` × (1 + ${round(fervor.effectPercent)}% Fervor Effect)` : ""}${profile.fervorBonus.distant ? " at range (Distance condition)" : ""} (skill text; provisional)`, value: percent * steps * (1 + fervor.effectPercent / 100) });
    }
    // "+X% additional Damage for every +1 Projectile Quantity of this skill" (Hound's Fangs; reference data skill text).
    if (profile.additionalPerProjectileQuantityPercent && projectileQuantity > 0) extraAdditional.push({ source: `${profile.name}: Projectile Quantity`, text: `+${profile.additionalPerProjectileQuantityPercent}% additional Damage for every +1 Projectile Quantity of this skill × ${projectileQuantity}`, value: profile.additionalPerProjectileQuantityPercent * projectileQuantity });
    const bonus = component.demolisher;
    if (bonus && (bonus.additionalPercent || bonus.perStackAdditionalPercent) && demolisherShare > 0) {
      const stacks = channelState?.fullStacks ?? 5;
      const percent = (bonus.additionalPercent || 0) + (bonus.perStackAdditionalPercent || 0) * stacks;
      extraAdditional.push({ source: `${profile.name}: Demolisher Charge`, text: `${bonus.text || `+${percent}% additional Hit Damage when consuming Demolisher Charge`}${bonus.perStackAdditionalPercent ? ` (${bonus.perStackAdditionalPercent}% × ${stacks} stacks)` : ""} × ${round(demolisherShare)} share of cycles`, value: percent * demolisherShare });
    }
    // "+X% additional Hit Damage for every 1 Curse Effect on the enemy (multiplies)" (Shackles of Malice's Explosion): the
    // planner's count of curses on the dummy (skill curses + gear-triggered curses; all of them, past the curse limit too:
    // user decision 2026-10-21).
    if (component.additionalPerCursePercent && targetCurseCount > 0) extraAdditional.push({ source: `${profile.name}: Curse Effects on the target`, text: `+${component.additionalPerCursePercent}% additional Hit Damage for every 1 Curse Effect on the enemy (multiplies) × ${targetCurseCount} curse${targetCurseCount === 1 ? "" : "s"} on the dummy = ×${round(Math.pow(1 + component.additionalPerCursePercent / 100, targetCurseCount))}`, value: (Math.pow(1 + component.additionalPerCursePercent / 100, targetCurseCount) - 1) * 100 });
    // "+X% Combo Finisher Amplification for the supported skill" (Recuperation): Amplification sums with the skill's own, and the
    // Finisher's Hit Damage is additionally increased by consumed Combo Points × Amplification (game manual 1001013024;
    // src/combo-points.js: 2 consumed points read, provisional).
    // The Amplification values add up first, then one additional factor (consumed points × Σ Amplification).
    const ownIndex = extraAdditional.findIndex((line) => /Combo Finisher Amplification/.test(line.source || ""));
    // The consumed points follow the build's Combo Points per Starter (comboPointState; gear affix batch B).
    if ((comboAmplification.length || comboPoints?.changed || laterCharge) && ownIndex >= 0) {
      const own = extraAdditional[ownIndex];
      const ownAmplification = own.amplification ?? own.value / CONSUMED_COMBO_POINTS;
      const total = ownAmplification + sum(comboAmplification);
      extraAdditional[ownIndex] = { ...own, source: [own.source, ...comboAmplification.map((line) => line.source)].join(" + "), text: `${total}% Combo Finisher Amplification (skill ${ownAmplification}%${comboAmplification.length ? ` + supports ${sum(comboAmplification)}%` : ""}) × ${charge ? round(pointsHere) : consumedPoints} consumed Combo Points${charge ? ` (Finisher ${charge.index + 1} of ${charge.of})` : ""} (manual; points per Starter ${comboPoints?.changed ? `${round(comboPoints.perStarter)} with the build's Combo Points lines, ` : ""}provisional)`, value: finisherAmplificationPercent(total, pointsHere), amplification: total };
    }
    // Finisher Combo (census item #2; game recipe 994750784: 5719 additional on the Combo Finisher tag 6000412): its own factor on the
    // Finisher's hits.
    if (String(component.componentKey ?? component.key ?? "").split(/[+>:]/)[0] === "finisher") for (const line of (supports.effects.combo || []).filter((item) => item.kind === "finisherHit" && item.status === "In calc")) extraAdditional.push({ source: line.source, text: `${line.text} (Combo Finisher hits only; game recipe 994750784)`, value: line.value });
    for (const line of spellBurstConsume.filter((item) => item.component === String(component.componentKey ?? component.key ?? "").split(/[+>:]/)[0])) {
      const rawEvent = typeof component.perUse?.intervalSeconds === "number" ? component.perUse.intervalSeconds : null;
      const eventSeconds = rawEvent ? rawEvent / ((speedType === "attack-speed" ? component.perUse.attackSpeedScaled : component.perUse.castSpeedScaled) ? speedFactor : 1) : null;
      if (!(eventSeconds > 0)) { notes.push(`${profile.name}: ${line.support}: the ${component.label} have no event interval, so the Spell Burst consumption is not applied.`); continue; }
      const share = Math.min(1, eventSeconds / spellBurstCharge.seconds);
      extraAdditional.push({ source: line.source, text: `+${line.value}% additional Hit Damage per Spell Burst stack consumed × ${spellBurstStacks} (Max Spell Burst) on the ${component.label} events that find Spell Burst full: min(1, ${round(eventSeconds)} s between events ÷ ${round(spellBurstCharge.seconds)} s full charge) = ${round(share)} of them (skill stone; provisional)`, value: line.value * spellBurstStacks * share });
    }
    if (unstoppable && component.componentKey === "finisher" && Math.abs(unstoppable.factor - 1) > 1e-12) extraAdditional.push({ source: unstoppable.source, text: `${unstoppable.text}: each Multistrike of the Finisher at the Max Multistrike Count ${unstoppable.maxCount} (game affix 273110144; the first attack included: user-supplied 2026-10-19, provisional) = ×${round(unstoppable.factor)} on the Finisher`, value: (unstoppable.factor - 1) * 100 });
    const wavedDetail = waveHitsFactor !== 1 ? `${perUse.detail} × ${round(waveHitsFactor)} (${round(waveCount)} + ${round(barrage.extraWaves)} expected Barrage waves: ${barrage.chance.map((line) => line.source).join(" + ")}; game field 2013001, provisional)` : perUse.detail;
    // "+N Combo Finisher charge(s)" (census item #9): each Finisher of the cycle is its own component (finisherCharges), so this one's
    // hits land once per cycle; Crescent Slash: Flash's extra hits per Finisher scale its own count.
    const finisherFactor = (finisherRepeats > 1 || finisherExtraHits) && String(component.componentKey ?? component.key ?? "").split(/[+>:]/)[0] === "finisher" ? (charge ? 1 : finisherRepeats) * (1 + finisherExtraHits / (1 + comboCountFromPoints(charge ? (singleHitFinisher ? 0 : pointsHere) : comboConsumedPoints))) : 1;
    const outcomeText = charge?.outcome === "crit" ? `, × ${round(chargeWeight)}: the previous Finisher's cast crit and gave its points` : charge?.outcome === "none" ? `, × ${round(chargeWeight)}: the previous Finisher's cast did not crit` : "";
    const chargedDetail = charge ? `${wavedDetail}${finisherFactor !== 1 ? ` × ${round(finisherFactor)}` : ""} (Finisher ${charge.index + 1} of ${charge.of} per cycle, ${round(pointsHere)} consumed Combo Points${outcomeText}: each Finisher consumes the points held when it is created; SS14 client)` : finisherFactor > 1 ? `${wavedDetail} × ${finisherFactor} Finishers per cycle (Combo Finisher charges)` : wavedDetail;
    // A later Finisher is its own strike (its own instance: its own crit determination; each outcome a share of it); the first keeps the
    // profile's keys.
    const chargeSuffix = laterCharge ? `:charge${charge.index + 1}${charge.outcome === "none" ? ":none" : ""}` : "";
    const chargeKeys = laterCharge ? { componentKey: `${component.componentKey}${chargeSuffix}`, strikeKey: `${component.strikeKey ?? component.componentKey}${chargeSuffix}`, label: `${component.label} (Finisher ${charge.index + 1}${charge.outcome === "none" ? ", no crit points" : ""})` } : {};
    return { ...component, ...chargeKeys, ...(charge ? { finisherCharge: { index: charge.index, of: charge.of, points: pointsHere, weight: chargeWeight, ...(charge.outcome ? { outcome: charge.outcome } : {}) } } : {}), ...(chargeWeight !== 1 ? { critShare: chargeWeight } : {}), extraAdditional, critEntities: sentryQuantity * finisherFactor * clusterFactor, hitsPerUse: perUse.hits * waveHitsFactor * sentryQuantity * finisherFactor * chargeWeight, hitsDetail: sentryQuantity > 1 ? `${chargedDetail} × ${sentryQuantity} Sentries` : chargedDetail, shotgun: perUse.shotgun ? { ...perUse.shotgun, extraProjectiles: projectileBoost ? extraProjectiles : 0 } : null, added: { min: 0, max: 0 }, addedSources: [] };
  };
  const isFinisherPart = (component) => String(component.componentKey ?? component.key ?? "").split(/[+>:]/)[0] === "finisher";
  const components = base.components.flatMap((component) => finisherInstances && isFinisherPart(component) ? finisherInstances.map((instance) => buildComponent(component, { ...instance, of: finisherCharges.length })) : [buildComponent(component)]);
  // A Combo skill's own Mark (profile.ownMark; Spectral Slash: Mark, config_char_buff 11340, src/attack-hit-profiles.js): affix 817163584
  // writes attribute 5720 mod 4 (additional damage taken: its own factor) = p0 × GetEffectScale on the attacker tag 5000002 (the skill that
  // applied it), +30% (its record carries tag 5100310 only, which no Effect writer reaches: Mark Effect does not scale it). Starter 1's hit
  // applies it (Split 482940, on hit) and each Finisher's counter (buff 11341) removes it after the sequence's last Finisher (affix
  // 4150517 against field 2012108), so on one dummy Starter 1's own hit lands unmarked and the later steps' hits (Starter 2, every
  // Finisher's slash and Clones) take it: one damage-taken term on those parts. The skill's own ailments take it while it is on the dummy:
  // from Starter 1's hit to the cycle's end, (cycle − Starter 1's step) ÷ cycle (the Clones after the last Finisher can only lengthen it;
  // provisional, open question spectral-slash-mark). On the loop each step's hits carry it, so the dummy starts clean with the first Starter 1.
  const ownMark = profile.ownMark && profile.cycle?.steps?.length ? (() => {
    const mark = profile.ownMark;
    const steps = cycleStepList || profile.cycle.steps;
    const seconds = cycleTriggerSteps ? steps.map(() => 1) : cycleStepSeconds || steps.map((step) => step.seconds);
    const cycle = seconds.reduce((sum, value) => sum + value, 0);
    const appliedAt = steps.findIndex((step) => step.keys.includes(mark.appliedBy));
    const timeShare = cycle > 0 && appliedAt >= 0 ? Math.max(0, Math.min(1, 1 - seconds[appliedAt] / cycle)) : 0;
    const line = { source: `${mark.name} (config_char_buff ${mark.buff})`, text: `+${mark.percent}% additional damage taken from this skill while the target holds ${mark.name} (game affix ${mark.record}: attribute 5720 mod 4 on the attacker's own skill; applied by ${profile.name}'s Combo Starter 1 hit, removed after the sequence's last Finisher)`, value: mark.percent, layer: "additional", category: "Additional damage taken" };
    let marked = 0;
    for (const component of components) {
      if (!mark.markedKeys.includes(String(component.componentKey ?? component.key ?? "").split(/[+>:]/)[0])) continue;
      component.extraTaken = [...(component.extraTaken || []), line];
      marked += 1;
    }
    notes.push(`${profile.name}: ${mark.name} (buff ${mark.buff}, game affix ${mark.record}: +${mark.percent}% additional damage taken from this skill, its own factor; GetEffectScale 1: the record's only tag 5100310 has no Effect writer, so Mark Effect does not scale it, and it is not the Mark keyword the build's Mark lines read): Combo Starter 1's own hit lands before it, the ${profile.components.filter((item) => mark.markedKeys.includes(item.key)).map((item) => item.label).join(" and ")} hits take it (every Finisher of the sequence; removed after the last one); the skill's own ailments take it ${round(timeShare * 100)}% of the time (from Starter 1's hit to the cycle's end; provisional, open question spectral-slash-mark).`);
    return marked ? { buff: mark.buff, name: mark.name, percent: mark.percent, timeShare, markedKeys: [...mark.markedKeys] } : null;
  })() : null;
  // "+X% additional damage when this skill hits an enemy with at least N Frostbite Rating" (Frost Spike, record 559611328: trigger 1000031
  // on this skill, attr 5719 mod 4 = p1 while the target's rating >= p0): one additional factor on every hit part while the dummy holds the
  // rating (2026-11-05 build audit gap 7; before, the profile note said no Frostbite Rating was modeled on the dummy).
  const frostbiteGate = profile.frostbiteRatingAdditional;
  if (frostbiteGate) {
    const rating = Number(target?.frostbiteRating) || 0;
    if (rating >= frostbiteGate.atLeast) {
      const line = { source: frostbiteGate.source, text: `${frostbiteGate.text} (the dummy's Frostbite Rating ${round(rating)})`, value: frostbiteGate.percent };
      for (const component of components) component.extraAdditional = [...(component.extraAdditional || []), line];
      notes.push(`${profile.name}: ${frostbiteGate.text}: the dummy holds ${round(rating)} Frostbite Rating, so it applies (game record 559611328).`);
    } else notes.push(`${profile.name}: ${frostbiteGate.text}: the dummy holds ${round(rating)} Frostbite Rating (below ${frostbiteGate.atLeast}), so it does not apply.`);
  }
  // Recalled hits (src/youga-ultimate-one.js; provisional): the recalling hit group (its typed parts share a strike key) lands
  // again `hitsFactor` times per use on average, as its own strike, with the Recalled-only lines. Added flat damage and
  // conversions reach it like the group it copies.
  // Each Recall pass is its own Shotgun wave (SS14 client, research/oq-r3-r4-rea-2026-11-04.md youga-recall-falloff: every
  // Recall gives each bolt a fresh hit state in the cast's instance, keyed by the pass number, so the bolts of one pass are
  // siblings and count each other's hits; earlier passes are other groups). So a pass deals the cast's falloff-weighted hits
  // (1 + c × (n − 1)), and every landing projectile is still one hit event (`landingsPerUse`, the trigger bus and crit events).
  // Before 2026-11-04 each Recall was a full-damage hit with no falloff (user-supplied 2026-10-18): a 3-bolt fan at 60%
  // falloff counted 3 Recalled hits per pass, now 2.2.
  const recall = heroEffects?.recall;
  if (recall?.hitsFactor > 0) {
    const group = components.filter((component) => !component.addedOnly && (component.strikeKey ?? component.componentKey) === recall.strikeKey);
    for (const component of group) {
      const key = `${component.componentKey}:recall`;
      const projectiles = recalledProjectilesPerUse(component);
      const weighted = Number(component.hitsPerUse) || 0;
      const fan = component.shotgun?.total > 0;
      components.push({ ...component, componentKey: key, strikeKey: `${component.strikeKey ?? component.componentKey}:recall`, label: `${component.label} (Recalled)`, hitsPerUse: weighted * recall.hitsFactor, landingsPerUse: projectiles * recall.hitsFactor, hitsDetail: `${round(weighted)}${fan ? ` falloff-weighted hit${weighted === 1 ? "" : "s"} (${round(projectiles)} projectile${projectiles === 1 ? "" : "s"} reaching the dummy; each Recall pass is its own Shotgun wave: SS14 client)` : ""} × ${round(recall.hitsFactor)} Recalls per use (${round(recall.recallsPerProjectile)} per projectile × ${round(recall.shareOfUses * 100)}% of uses inside Stasis Vault; provisional)`, shotgun: null, recalled: true, extraAdditional: [...(component.extraAdditional || []), ...(recall.additional || [])], added: { min: 0, max: 0 }, addedSources: [] });
    }
    if (group.length && recall.note) notes.push(`${profile.name}: ${recall.note}.`);
  }
  // Bing – Blast Nova's bombs (Q-H14, provisional): each bomb fires the skill's projectiles in all directions and one of them hits the
  // one dummy (one projectile hit, no Shotgun falloff); with Radiation Effect the volley flies at the dummy (its Shotgun share, as
  // computed); without the detonation line the bombs fire nothing.
  if (bombs) for (const component of components) {
    if (component.addedOnly) continue;
    if (bombs.mode === "single") {
      const single = component.shotgun?.total > 0 ? component.hitsPerUse / component.shotgun.total : Math.min(1, component.hitsPerUse);
      component.hitsDetail = `${round(single)} per bomb: one projectile of the bomb's all-direction volley hits the dummy (Q-H14, provisional; the skill's own count was ${component.hitsDetail})`;
      component.hitsPerUse = single;
      component.shotgun = null;
    } else if (bombs.mode === "volley") component.hitsDetail = `${component.hitsDetail} per bomb (Radiation Effect: the volley flies at the dummy; Q-H14, provisional)`;
    else { component.hitsPerUse = 0; component.hitsDetail = "the bombs fire no projectiles (no detonation line)"; }
  }
  // Parabolic Projectile Splits (Three Birds with One Stone, "+N to Parabolic Projectile Splits quantity", game affix 101080024
  // field 2006214): each landing parabolic projectile splits N times, and the splits land as area explosions that can hit the
  // same single target (user-supplied 2026-10-19, Google AI Mode answer, not tested in game; still an open question). A profile's
  // `parabolicSplit` names the landing components and the skill's own after-split damage ("The skill's Projectiles' effect after
  // splitting -50% additional damage"); each split is one more hit of that component per landing, with no Shotgun falloff.
  const parabolicSplits = profile.parabolicSplit && skillTags.has("Parabolic") ? modifierTexts.reduce((total, line) => { const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(PARABOLIC_SPLIT_LINE); return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0) : 0;
  if (parabolicSplits > 0) {
    const rule = profile.parabolicSplit;
    const splitLine = rule.additionalPercent ? [{ source: `${profile.name}: after splitting`, text: rule.text, value: rule.additionalPercent }] : [];
    for (const component of components.filter((item) => !item.addedOnly && !item.recalled && rule.components.includes(String(item.componentKey).split(/[+>:]/)[0]))) {
      components.push({ ...component, componentKey: `${component.componentKey}:split`, strikeKey: `${component.strikeKey ?? component.componentKey}:split`, label: `${component.label} (parabolic splits)`, hitsPerUse: component.hitsPerUse * parabolicSplits, hitsDetail: `${component.hitsDetail} × ${round(parabolicSplits)} Parabolic Projectile Split${parabolicSplits === 1 ? "" : "s"} per landing, each an area explosion on the same target (no Shotgun falloff; user-supplied 2026-10-19, Google AI Mode answer, provisional)`, shotgun: null, parabolicSplit: true, extraAdditional: [...(component.extraAdditional || []), ...splitLine], added: { min: 0, max: 0 }, addedSources: [] });
    }
    notes.push(`${profile.name}: +${round(parabolicSplits)} Parabolic Projectile Splits: each landing projectile's ${rule.components.join(" / ")} lands ${round(parabolicSplits)} more time(s) on the dummy${rule.additionalPercent ? ` at ${rule.additionalPercent}% additional damage (${rule.text})` : ""} (user-supplied 2026-10-19, Google AI Mode answer, not tested in game).`);
  }
  const primaryComponent = components[0] || null;
  // Added flat damage joins its type's list before the gain and conversion passes (game code, SS14 0x141fbe3a0 → 0x141fc3a80;
  // research/core-formulas-chunk0-2026-10-31.md §1), so added damage of a type the skill's own conversion takes ("Converts 100% of
  // the skill's Physical Damage to Cold Damage", profile.conversion) rides that conversion: it lands on the parts converted from its
  // type (2026-11-05 build audit gap 2; before, added Physical stayed an unconverted Physical part on Frost Spike). A part's type before
  // the conversion pass is its original type when the profile converted it (support conversions run below).
  const preConversionType = (item) => item.converted && !String(item.componentKey).includes("+as:") ? item.originalType : item.type;
  const ownConversion = (type) => (profile.conversion || []).find((rule) => rule.from === type && rule.percent >= 100) || null;
  for (const line of addedLines) {
    let targets = components.filter((item) => !item.addedOnly && preConversionType(item) === line.type);
    // No part of its own type: the parts converted into it take it as before (added Cold on a Physical → Cold part).
    if (!targets.length) targets = components.filter((item) => item.type === line.type && !item.addedOnly);
    if (!targets.length) {
      const rule = ownConversion(line.type);
      const extra = { componentKey: `added:${line.type}`, label: `Added ${line.type} damage`, type: rule ? rule.to : line.type, originalType: line.type, min: 0, max: 0, converted: Boolean(rule), effectiveness: primaryComponent?.effectiveness ?? 100, hitsPerUse: primaryComponent?.hitsPerUse ?? 1, hitsDetail: primaryComponent?.hitsDetail || "", basis: primaryComponent?.basis || "text", extraAdditional: primaryComponent?.extraAdditional || [], source: "added flat damage", added: { min: 0, max: 0 }, addedSources: [], addedOnly: true };
      components.push(extra); targets = [extra];
    }
    for (const component of targets) {
      const effectiveness = Number.isFinite(component.effectiveness) ? component.effectiveness / 100 : 1;
      component.added.min += line.min * effectiveness; component.added.max += line.max * effectiveness;
      component.addedSources.push({ source: line.source, text: line.text, min: line.min, max: line.max, value: (line.min + line.max) / 2, effectiveness: component.effectiveness });
    }
  }
  // Shadows (shadowState): each use's hits again × (1 + 30% × (Shadows − 1)) as the Shadows' own hits, with the Shadow-only lines;
  // added flat damage is already on the parts, so the copies carry it (added-only parts included).
  const shadows = skillTags.has("Shadow Strike") ? shadowState({ profile, modifierTexts, supportClauses: supports.effects.clauses }) : null;
  // Double Thrusts: Recourse (Noble) (G4): its detonation as an expected additional term on the Shadows' hits.
  if (shadows?.weight > 0) for (const clause of supports.effects.clauses.filter((item) => item.family === "recourse" && ["In calc", "Provisional"].includes(item.status))) {
    const line = recourseShadowLine(clause, shadows.expectedCount);
    if (line) shadows.damage.push(line);
  }
  if (shadows?.weight > 0) {
    for (const component of [...components]) {
      if (!(component.hitsPerUse > 0)) continue;
      components.push({ ...component, componentKey: `${component.componentKey}:shadow`, strikeKey: `${component.strikeKey ?? component.componentKey}:shadow`, label: `${component.label} (Shadows)`, hitsPerUse: component.hitsPerUse * shadows.weight, hitsDetail: `${component.hitsDetail} × ${round(shadows.weight)} for ${shadows.count} Shadow${shadows.count === 1 ? "" : "s"} on the one dummy (1 + 30% × ${shadows.count - 1}: each Shadow after the first keeps 30%, the Split's Shadow hit rule; user-confirmed 2026-11-05)`, shotgun: null, shadow: true, landingsPerUse: landingsPerUse(component) * shadows.expectedCount, extraAdditional: [...(component.extraAdditional || []), ...shadows.damage], added: { ...component.added }, addedSources: [...component.addedSources] });
    }
    notes.push(`${profile.name}: ${shadows.count} Shadow${shadows.count === 1 ? "" : "s"} (${shadows.sources.map((item) => `${item.source} +${round(item.value)}`).join(", ")}; base 0, game manual 1001010820): each use's attack is repeated by the Shadows on the dummy at × ${round(shadows.weight)} (each Shadow after the first keeps 30%: the Split's Shadow hit rule, user-confirmed 2026-11-05)${shadows.damage.length ? `, with ${shadows.damage.map((line) => line.text).join("; ")}` : ""}.`);
  } else if (shadows?.damage.length) notes.push(`${profile.name}: no Shadow (Shadow Quantity 0, game manual 1001010820), so the additional Shadow Damage lines reach nothing.`);
  // Ice Lances: Rebound (src/ice-lances-rebound.js; 15 T audit G2): the lance returns to the dummy floor(Jumps ÷ 2) times, each return its
  // own hits (the cast's hits again × the returns' weight), every return one more landing (the trigger bus and crit events).
  const rebound = reboundState({ profile, modifierTexts, supportClauses: supports.effects.clauses });
  if (rebound?.repeats > 0) {
    for (const component of [...components]) {
      if (!(component.hitsPerUse > 0) || component.shadow || component.recalled) continue;
      components.push({ ...component, componentKey: `${component.componentKey}:rebound`, strikeKey: `${component.strikeKey ?? component.componentKey}:rebound`, label: `${component.label} (Rebound returns)`, hitsPerUse: component.hitsPerUse * rebound.weight, hitsDetail: `${component.hitsDetail} × ${rebound.detail}`, shotgun: null, rebound: true, landingsPerUse: landingsPerUse(component) * rebound.repeats, added: { ...component.added }, addedSources: [...component.addedSources] });
    }
    notes.push(`${profile.name}: ${rebound.detail} (open question ice-lances-rebound-repeat-share).`);
  }
  for (const component of provisionalComponents) warnings.push(`${profile.name}: ${component.label} — hits per use are a best-case assumption (${component.note}).`);

  // Trinity (src/trinity.js): "Damage types cannot be converted" switches the skill's own conversion (its profile, e.g. Hammer of
  // Ash's Physical → Fire) and the support conversions below off (provisional: open question legendary-trinity-law).
  const trinity = trinityState(modifierTexts);
  if (trinity?.noConversion) {
    const reverted = components.filter((component) => component.converted && component.originalType && component.originalType !== component.type && !String(component.componentKey).includes("+as:"));
    for (const component of reverted) { component.type = component.originalType; component.converted = false; }
    if (reverted.length) notes.push(`${profile.name}: ${trinity.source || "Trinity"}: "Damage types cannot be converted": the skill's own conversion is off (its parts stay ${[...new Set(reverted.map((component) => component.type))].join(", ")}; provisional).`);
  }
  // "Physical Damage can't be converted to other types of damage" (Shadowdancer 6,0; src/passive-support-lines.js): the same for Physical alone.
  const noPhysicalConversion = physicalConversionBlocked(modifierTexts);
  if (noPhysicalConversion) {
    const reverted = components.filter((component) => component.converted && component.originalType === "Physical" && component.type !== "Physical" && !String(component.componentKey).includes("+as:"));
    for (const component of reverted) { component.type = "Physical"; component.converted = false; }
    if (reverted.length) notes.push(`${profile.name}: Physical Damage can't be converted: the skill's own conversion is off, its parts stay Physical (provisional).`);
    if (supports.conversion.some((line) => line.from === "Physical")) notes.push(`${profile.name}: Physical Damage can't be converted: the Physical conversions (${supports.conversion.filter((line) => line.from === "Physical").map((line) => line.text).join("; ")}) are off.`);
  }
  // Support conversion and "added as" (hit damage only; manual "Damage Over Time": conversion or addition of the damage
  // type does not affect DoT). Game code (FUN_141e14330, SS14 0x141fc3a80; research/core-formulas-chunk0-2026-10-31.md §1): each
  // type keeps a list of parts with two masks (the increased and the additional pools that reach it). First the gain pass: per source
  // type in the order Physical → Lightning → Cold → Fire → Erosion, "Adds X% of <A> Damage as <B> Damage" adds to <B> a copy of every
  // part held in <A> at that moment, earlier gains included, scaled by X%, with the masks of both types; the source keeps its damage.
  // Then the conversion pass, same order: the percentages to higher types, weighted down when they sum above 100%; the source keeps
  // 1 − the sum. Last each part is scaled once: (100 + Σ increased over its mask) ÷ 100 × Π additional over its mask, so a gained or
  // converted part takes every type in its chain (user-stated 2026-10-12, Q8) and each Elemental / All pool once. Profile conversions
  // read the same way ([originalType, type]).
  for (const line of [...supports.addedAs].sort((a, b) => CONVERSION_ORDER.indexOf(a.from) - CONVERSION_ORDER.indexOf(b.from))) {
    // The gain pass runs before the conversion pass, so it reads each part's type before the skill's own conversion (2026-11-05 build
    // audit gap 2: Mind Blade's "30% of Physical as Cold" on Frost Spike's Physical → Cold weapon base; a Cold gain no longer reads it).
    for (const component of components.filter((item) => preConversionType(item) === line.from)) {
      const share = line.percent / 100;
      components.push({ ...component, componentKey: `${component.componentKey}+as:${line.to}`, label: `${component.label} (${line.percent}% of ${line.from} as ${line.to})`, type: line.to, originalType: line.from, converted: true, min: component.min * share, max: component.max * share, hands: scaleHands(component.hands, share), ...scaleJoined(component, share), added: { min: component.added.min * share, max: component.added.max * share }, addedSources: [], addedOnly: true, addedAs: line, scopeTypes: [...new Set([...(component.scopeTypes || [component.originalType, component.type]), line.to])] });
      notes.push(`${profile.name}: ${line.source} — ${line.text} adds a ${line.to} part to ${component.label} (game code: X% of its roll before conversion).`);
    }
  }
  if (trinity?.noConversion && supports.conversion.length) notes.push(`${profile.name}: ${trinity.source || "Trinity"}: "Damage types cannot be converted": the support conversions (${supports.conversion.map((line) => line.text).join("; ")}) are off (provisional).`);
  for (const from of trinity?.noConversion ? [] : noPhysicalConversion ? CONVERSION_ORDER.filter((type) => type !== "Physical") : CONVERSION_ORDER) {
    const lines = supports.conversion.filter((line) => line.from === from && CONVERSION_ORDER.indexOf(line.to) > CONVERSION_ORDER.indexOf(from));
    for (const line of supports.conversion.filter((item) => item.from === from && !lines.includes(item))) warnings.push(`${line.source}: "${line.text}" converts to a lower type, which the manual does not allow; not applied.`);
    if (!lines.length) continue;
    const total = lines.reduce((sum, line) => sum + line.percent, 0);
    const scale = total > 100 ? 100 / total : 1;
    for (const component of components.filter((item) => item.type === from)) {
      const index = components.indexOf(component);
      const parts = lines.map((line) => {
        const share = line.percent * scale / 100;
        const priorTypes = component.scopeTypes || (component.converted ? [component.originalType, component.type] : [component.type]);
        return { ...component, componentKey: `${component.componentKey}>${line.to}`, label: `${component.label} (${round(line.percent * scale)}% ${from} → ${line.to})`, type: line.to, originalType: component.originalType || from, converted: true, min: component.min * share, max: component.max * share, hands: scaleHands(component.hands, share), ...scaleJoined(component, share), added: { min: component.added.min * share, max: component.added.max * share }, addedSources: component.addedSources, supportConversion: line, scopeTypes: [...new Set([...priorTypes, line.to])] };
      });
      const kept = 1 - total * scale / 100;
      const remaining = kept > 1e-9 ? [{ ...component, min: component.min * kept, max: component.max * kept, hands: scaleHands(component.hands, kept), ...scaleJoined(component, kept), added: { min: component.added.min * kept, max: component.added.max * kept } }] : [];
      // A converted share is part of the same hit, not another hit (manual: conversion changes the damage type of Hit
      // Damage): only one piece of each split counts towards hits per use, ailment applications and on-hit triggers.
      // Before 2026-10-12 every piece counted as a hit, so a partial conversion doubled the skill's ailment applications.
      parts.forEach((part, partIndex) => { part.splitPart = remaining.length > 0 || partIndex > 0 || Boolean(component.splitPart); });
      components.splice(index, 1, ...remaining, ...parts);
    }
  }

  // Shared (type-independent) layers.
  const levelLine = level > 20 ? [{ source: `${profile.name} level ${level}`, text: `+${round((skillLevelDamageMultiplier(level) - 1) * 100)}% additional damage (reference data Skill Level: +10%/level 21–30, +8%/level 31+)`, value: (skillLevelDamageMultiplier(level) - 1) * 100, category: "Additional damage", origin: "skill" }] : [];
  // A Terra Charge line that only reaches "enemies on the Terra" (Corrosive Shot) applies to the Terra's DoT, not the hit.
  const terraLine = profile.terraCharge && !profile.terraCharge.dotOnly ? [{ source: `${profile.name}: Terra Charge`, text: profile.terraCharge.text, value: profile.terraCharge.value, category: "Additional damage", origin: "skill" }] : [];
  // Additional damage a granted support gives this skill (src/planner.js: Activation Medium: Terra on the Main Terra Skill).
  // An `increased` granted line ("+X% Tangle Damage", src/tangle-model.js; census #15) joins the increased pool instead.
  for (const line of (profile.grantedAdditional || []).filter((item) => item.increased)) supports.increased.push({ ...line, category: "Increased damage", origin: "skill" });
  const grantedLines = [...(profile.grantedAdditional || []).filter((line) => !line.increased).map((line) => ({ ...line, category: "Additional damage", origin: "skill" })),
    // Hero lines on this skill (Clockwork Core's shared bonuses: src/youga-ultimate-one.js).
    ...(heroEffects?.additional || []).filter((line) => line.value).map((line) => ({ ...line, category: "Additional damage", origin: "trait" })),
    // Bing – Blast Nova's bomb lines (hero trait audit B12; src/bing-traits.js): additional Bomb Damage, Dangerous Runaway, Phantom
    // Delivery, Frenzy Hound, Big Bang Pack's Spare Bombs.
    ...(bombs?.lines || []).filter((line) => line.value).map((line) => ({ ...line, category: "Additional damage", origin: "trait" })),
    // "+X% additional damage applied to Life": every copy in one summed term (src/damage-to-life.js; user decision 2026-10-25).
    ...(damageToLife?.value ? [{ ...damageToLife, category: "Additional damage", origin: "build" }] : [])];
  // "X% additional damage for this skill for every +1% Attack Speed" (Gale Slash): the build's increased Attack Speed
  // total from the weapon model (additional Attack Speed lines are not counted: provisional reading of "bonuses").
  const speedBonusLine = profile.additionalPerAttackSpeedPercent && attackSpeed ? [{ source: `${profile.name}: Attack Speed bonus`, text: `+${profile.additionalPerAttackSpeedPercent}% additional damage for this skill for every +1% Attack Speed × ${round(Math.max(0, attackSpeed.increasedPercent || 0))}% increased Attack Speed from the build's lines (additional Attack Speed lines not counted: provisional)`, value: profile.additionalPerAttackSpeedPercent * Math.max(0, attackSpeed.increasedPercent || 0), category: "Additional damage", origin: "skill" }] : [];
  // Gale (Marksman core, "X% of the Projectile Speed bonus is also applied to the additional bonus for Projectile Damage") and
  // the plain wording ("… applied to Projectile Damage"). Game affixes 114414 / 101140017 are node 114 conversions from the
  // increased (mod 3) value of attribute 60051 (Projectile Speed) to attribute 57191 (damage, all) for the Projectile tag
  // (6001110): mod 4 (additional) for Gale, mod 3 (increased) for the plain wording, no cap (src/data/affix-index-ss13.generated.js).
  // The increased pool this skill reads: the build's plain "+X% Projectile Speed" lines, its own supports' "+X% Projectile
  // Speed for the supported skill", the Aura buffs' Projectile Speed and hero buffs (Youga's Centralization). "+X% additional
  // Projectile Speed" (mod 4) is not converted. Before 2026-10-18 Gale read No DPS effect.
  const projectileSpeedState = (() => {
    if (!scopeTags.has("Projectile")) return null;
    const converters = modifierTexts.flatMap((line) => {
      const match = normalizePercentageText(String(line.text || "")).replace(/\s+/g, " ").trim().match(/^(\d+(?:\.\d+)?)% of the Projectile Speed bonus is also applied to (the additional bonus for )?Projectile Damage$/i);
      // Traced pool: the line's node 114 record is read at the hit instead (src/attribute-pool-build.js); the state keeps the converter.
      return match ? [{ source: line.source, text: line.text, share: Number(match[1]) * (line.multiplier ?? 1), layer: match[2] ? "additional" : "increased", ...(tracedLines.size && tracedLines.has(lineKeyOf(line.source, line.text)) ? { traced: true } : {}) }] : [];
    });
    // Rain of Arrows' own line (field 2006129; chunk 8): "25% of bonuses to Projectile Speed for this skill (up to 200%) also apply to this skill's additional
    // damage", the bonus read up to 200%; Rain of Arrows: Swift Flight's row sets the share (recipe 23468732).
    if (profile.projectileSpeedShare) {
      const share = (supports.effects.projectileSpeedShare || []).find((line) => line.status === "In calc");
      converters.push({ source: share?.source ?? `${profile.name}: skill text`, text: share?.text ?? profile.projectileSpeedShare.text, share: share?.value ?? profile.projectileSpeedShare.percent, layer: "additional", capPercent: profile.projectileSpeedShare.capPercent });
    }
    if (!converters.length) return null;
    const sources = [];
    for (const line of modifierTexts) {
      const match = normalizePercentageText(String(line.text || "")).replace(/\s+/g, " ").trim().match(/^([+-]?\d+(?:\.\d+)?)% Projectile Speed$/i);
      if (match) sources.push({ source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1) });
    }
    for (const clause of setup?.supportEffects?.clauses || []) {
      const match = normalizePercentageText(String(clause.text || "")).replace(/\s+/g, " ").trim().match(/^([+-]?\d+(?:\.\d+)?)% Projectile Speed for the supported skill$/i);
      if (match) sources.push({ source: clause.source || `Support: ${clause.support}`, text: clause.text, value: Number(match[1]) });
    }
    for (const entry of auraEntries) if (entry.effectiveEffects?.projectileSpeedPercent) sources.push({ source: `Aura: ${entry.name} / Projectile Speed`, text: `+${round(entry.effectiveEffects.projectileSpeedPercent)}% Projectile Speed`, value: entry.effectiveEffects.projectileSpeedPercent });
    for (const line of heroEffects?.projectileSpeed || []) sources.push({ source: line.source, text: line.text, value: line.value });
    const increasedPercent = sources.reduce((total, line) => total + line.value, 0);
    return { increasedPercent, sources, converters };
  })();
  // Every converter's reading for the working (`projectileSpeed.lines`, the badges); a traced one (its node 114 record read at the hit,
  // src/attribute-pool-build.js) is shown, flagged, and stays out of the damage lists (the pool's conversion entry carries it).
  const galeReadings = (projectileSpeedState?.converters || []).map((converter) => {
    const value = converter.share / 100 * Math.min(converter.capPercent ?? Infinity, Math.max(0, projectileSpeedState.increasedPercent));
    return { source: converter.source, text: `+${round(value)}% ${converter.layer === "additional" ? "additional " : ""}Projectile Damage (${converter.text}: ${converter.share}% × +${round(projectileSpeedState.increasedPercent)}% increased Projectile Speed = ${projectileSpeedState.sources.map((line) => `${round(line.value)} ${line.source}`).join(" + ")}; additional Projectile Speed not converted; game affix node 114)`, value, layer: converter.layer, category: converter.layer === "additional" ? "Additional damage" : "Increased damage", origin: "derived", ...(converter.traced ? { traced: true } : {}) };
  }).filter((line) => line.value > 0);
  const galeLines = galeReadings.filter((line) => !line.traced);
  const auraLines = [];
  // Label 3000114 (Rosa – Unsullied Blade, record 101070122): the Spell tag joins an Attack hit's query for the damage scale stage only, so
  // a [Spell] write the Aura holds (Precise: Spell Amplification, buff 15073 affix 10091901) reaches the Attack's hits (2026-11-05,
  // research/oq-rosa-build-2026-11-04.md §8; client 0x141fc3b7d). A skill with both tags takes it once.
  const spellScaleStage = scopeTags.has("Spell") || (spellTagOnAttack && scopeTags.has("Attack"));
  for (const entry of auraEntries) {
    const effects = entry.effectiveEffects || {};
    if (effects.additionalSpellDamagePercent && spellScaleStage) auraLines.push({ source: `Aura: ${entry.name} / Spell Damage`, text: `+${round(effects.additionalSpellDamagePercent)}% additional Spell Damage`, value: effects.additionalSpellDamagePercent, category: "Additional damage", origin: "derived" });
    if (effects.additionalAreaDamagePercent && skillTags.has("Area")) auraLines.push({ source: `Aura: ${entry.name} / Area Damage`, text: `+${round(effects.additionalAreaDamagePercent)}% additional Area Damage`, value: effects.additionalAreaDamagePercent, category: "Additional damage", origin: "derived" });
    // Precise: Domain Expansion's "at least 5 enemies within 10 m" write (record 263618880; the Boss dummy counts as 5): its own factor (G1b).
    if (effects.additionalAreaDamageCrowdPercent && skillTags.has("Area")) auraLines.push({ source: `Aura: ${entry.name} / Area Damage (at least 5 enemies)`, text: `+${round(effects.additionalAreaDamageCrowdPercent)}% additional Area Damage`, value: effects.additionalAreaDamageCrowdPercent, category: "Additional damage", origin: "derived" });
    // Skill-tag and typed aura stats (gear-pact batch G4): Cruelty "+X% additional Attack Damage" (Attack skills), Fearless
    // "+X% additional Melee Skill Damage" (Melee skills), Charged Flames / Frigid Domain / Electric Conversion "+X% additional
    // Fire / Cold / Lightning Damage" (components of that type). Physical / Erosion arrive as derived modifier texts when
    // the planner emitted them (src/aura-damage.js), so they are added here only when that line is absent.
    if (effects.additionalAttackDamagePercent && scopeTags.has("Attack")) auraLines.push({ source: `Aura: ${entry.name} / Attack Damage`, text: `+${round(effects.additionalAttackDamagePercent)}% additional Attack Damage`, value: effects.additionalAttackDamagePercent, category: "Additional damage", origin: "derived" });
    if (effects.additionalMeleeSkillDamagePercent && scopeTags.has("Melee")) auraLines.push({ source: `Aura: ${entry.name} / Melee Skill Damage`, text: `+${round(effects.additionalMeleeSkillDamagePercent)}% additional Melee Skill Damage`, value: effects.additionalMeleeSkillDamagePercent, category: "Additional damage", origin: "derived" });
    for (const [stat, type] of [["additionalFireDamagePercent", "Fire"], ["additionalColdDamagePercent", "Cold"], ["additionalLightningDamagePercent", "Lightning"], ["additionalPhysicalDamagePercent", "Physical"], ["additionalErosionDamagePercent", "Erosion"]]) {
      if (!effects[stat] || modifierTexts.some((line) => line.aura === entry.name && line.stat === stat)) continue;
      auraLines.push({ source: `Aura: ${entry.name} / ${type} Damage`, text: `+${round(effects[stat])}% additional ${type} Damage`, value: effects[stat], category: "Additional damage", origin: "derived", types: [type] });
    }
    if (effects.additionalProjectileDamagePercent && skillTags.has("Projectile")) auraLines.push({ source: `Aura: ${entry.name} / Projectile Damage`, text: `+${round(effects.additionalProjectileDamagePercent)}% additional Projectile Damage`, value: effects.additionalProjectileDamagePercent, category: "Additional damage", origin: "derived" });
  }
  const mainStatLines = [];
  // Main stats (manual keyword text, config_multi_language_en: "Every point of Strength / Dexterity additionally increases
  // the damage of skills that have Strength / Dexterity as a main stat by 0.5% … When a skill has multiple main stats, the
  // bonuses of the main stats are added together before calculating the final damage bonus"; gear-pact batch chunk 3, Q-G8).
  // Intelligence keeps the beam hit ledger's pooled total (observed); Strength and Dexterity read the stat-sheet totals.
  const mainStats = profile.mainStats || [];
  // "+X% additional damage ratio granted by the supported skill's main attribute" (Chromatic Shot: Lightchaser; game recipe 651717:
  // + X / 100 / 2 per point on field 20062482, the 0.5%-per-point ratio, for each main stat of this skill): ratio × (1 + ΣX / 100).
  const ratioClauses = (supports.effects?.clauses || []).filter((clause) => clause.family === "mainStatRatio" && clause.value);
  const ratioFactor = 1 + ratioClauses.reduce((sum, clause) => sum + clause.value, 0) / 100;
  const ratioText = ratioClauses.length ? ` × ${round(ratioFactor)} (${ratioClauses.map((clause) => `${clause.source}: +${clause.value}% main-attribute damage ratio`).join(", ")}; game recipe 651717)` : "";
  const statParts = [
    ...(mainStats.includes("Intelligence") && intelligenceAdditionalPercent ? [{ stat: "Intelligence", value: intelligenceAdditionalPercent * ratioFactor }] : []),
    ...["Strength", "Dexterity"].filter((stat) => mainStats.includes(stat) && Number(mainStatPoints?.[stat.toLowerCase()])).map((stat) => ({ stat, value: 0.5 * Number(mainStatPoints[stat.toLowerCase()]) * ratioFactor }))
  ];
  if (statParts.length === 1 && statParts[0].stat === "Intelligence") mainStatLines.push({ source: intelligenceSource || "Total Intelligence (0.5% per point)", text: `+${round(statParts[0].value)}% additional damage (Intelligence main stat, Scorching Beam hit-ledger rule${ratioText})`, value: statParts[0].value, category: "Additional damage", origin: "derived" });
  else if (statParts.length) {
    const value = statParts.reduce((total, part) => total + part.value, 0);
    mainStatLines.push({ source: `Main stats (${statParts.map((part) => part.stat).join(" + ")}; 0.5% per point, added together)`, text: `+${round(value)}% additional damage (${statParts.map((part) => `${part.stat} ${round(part.value)}%`).join(" + ")}; manual: main-stat bonuses are added before the final bonus${ratioText})`, value, category: "Additional damage", origin: "derived" });
  }
  // Double Damage (src/double-damage.js; manual + executable trace): expected ×(1 + min(100, Σ chance)/100) on hits.
  const doubleDamage = doubleDamageForSkill(modifierTexts, { tags: [...scopeTags], stats: mainStatPoints || {}, main: mainSkill, twoHanded: attackProfile && Boolean(weapon?.twoHanded) });
  // A guaranteed Double Damage cast every N casts (the revived Main Attack Skill family; src/double-damage.js) joins the same line.
  const guaranteedText = doubleDamage.guaranteed ? `${doubleDamage.chancePercent > 0 ? "; " : ""}guaranteed Double Damage on 1 in ${doubleDamage.guaranteed.every} casts (${doubleDamage.guaranteed.source}; provisional)` : "";
  const doubleDamageLines = doubleDamage.chancePercent > 0 || doubleDamage.guaranteed ? [{ source: `Double Damage (${[...doubleDamage.sources, ...(doubleDamage.guaranteed ? [doubleDamage.guaranteed] : [])].map((line) => line.source).join(", ")})`, text: `${doubleDamage.chancePercent > 0 ? `${round(doubleDamage.chancePercent)}% Double Damage chance` : ""}${guaranteedText} → ×${round(doubleDamage.doubleFactor)} expected hit damage (manual: chances stack, then one 2× roll per hit)`, value: (doubleDamage.doubleFactor - 1) * 100, category: "Additional damage (Double Damage, expected)", origin: "derived" }] : [];
  // Kismet: Giant (census #14): Triple Damage on a two-handed Attack use, its own expected factor (src/double-damage.js).
  if (doubleDamage.tripleChancePercent > 0) doubleDamageLines.push({ source: `Triple Damage (${doubleDamage.tripleSources.map((line) => line.source).join(", ")})`, text: `${round(doubleDamage.tripleChancePercent)}% Triple Damage chance (Attack, holding a Two-Handed Weapon) → ×${round(doubleDamage.tripleFactor)} expected per use (×3 on a roll; provisional)`, value: (doubleDamage.tripleFactor - 1) * 100, category: "Additional damage (Triple Damage, expected)", origin: "derived" });
  const combatLines = [];
  // Aim's scope since the 2026-10-15 data: "Projectile and Beam Skills" (game tag 6001130 Ranged → 6001110 Projectile).
  if (aim?.active && aim.averageDamagePercent && (skillTags.has("Beam") || skillTags.has("Projectile"))) combatLines.push({ source: `Aim: Projectile and Beam Skills additional damage (${aim.uptimeLabel || "uptime averaged"})`, text: `+${round(aim.damagePercent)}% while active`, value: aim.averageDamagePercent, category: "Additional damage", origin: "derived" });

  // Critical strikes: expected factor with crit-only additional lines on the crit share.
  // Attack skills (B3): the supports' Critical Strike Rating lines join the weapon crit by the manual's formula, rating =
  // Σ base (weapon + flat) × (1 + Σ %) × Π(1 + additional %), 100 rating per 1% chance. Spell crit already reads its
  // supports in src/scorching-beam-critical.js (Critical Strike Rating Increase there keeps its Lv.21 cap, B6 open; the
  // attack path reads the reference data table at the support's level).
  const attackCritBase = attackProfile ? (crit.attackCrit || weapon?.crit || null) : null;
  let supportCrit = null;
  // Tag-scoped crit rating lines ("+30% Projectile Critical Strike Rating"; src/scorching-beam-critical.js taggedCrit, read for
  // this setup's tags) join the attack crit like the supports' lines (residual batch).
  const taggedRating = attackCritBase ? crit.taggedCrit || { ratingPercent: 0, ratingFlat: 0 } : { ratingPercent: 0, ratingFlat: 0 };
  if (attackCritBase && (supports.critRating.length || taggedRating.ratingPercent || taggedRating.ratingFlat)) {
    const own = supportCritSums();
    const flat = own.flat + taggedRating.ratingFlat;
    const percent = own.percent + taggedRating.ratingPercent;
    const additionalFactor = own.additionalFactor;
    const rating = Math.max(0, ((attackCritBase.weaponRating || 0) + (attackCritBase.flatRating || 0) + flat) * Math.max(0, 1 + ((attackCritBase.increasedRatingPercent || 0) + percent) / 100) * additionalFactor);
    supportCrit = { rating, chancePercent: Math.min(100, rating / 100), sources: supports.critRating, base: { weaponRating: attackCritBase.weaponRating || 0, flatRating: attackCritBase.flatRating || 0, increasedRatingPercent: attackCritBase.increasedRatingPercent || 0 } };
  }
  // "Guaranteed to land Critical Strikes" (src/scorching-beam-critical.js hasGuaranteedCrit): every hit crits, the attack and
  // dual-wield paths included (legendary audit batch 1; SS14 client 0x141fc07a0: the guaranteed branch reads no chance).
  // "Cannot inflict Critical Strike" (label 3001211) is checked before the guaranteed flag (SS14 client): its share never crits.
  let critChance = crit.guaranteedCrit ? 1 - (crit.cannotCritShare || 0) : (crit.cannotCritShare || 0) >= 1 ? 0 : Math.max(0, Math.min(100, supportCrit ? supportCrit.chancePercent : crit.criticalChancePercent || 0)) / 100;
  // Default crit damage: config_attributes 4803, 150% (2026-10-17 game attribute data).
  // "Critical Strikes cannot deal additional damage" (Silent Aria): record 861697408 fixes attr 4803 Critical Strike Damage at 100 and nothing else, so the crit-only additional
  // lines, which are damage writes on the crit tag, still apply (chunk 12; src/scorching-beam-critical.js critNoExtraDamage).
  const critDamage = crit.critNoExtraDamage ? 1 : Math.max(100, crit.combatCriticalDamagePercent ?? crit.criticalDamagePercent ?? BASE_CRITICAL_DAMAGE_PERCENT) / 100;
  const townCritDamage = crit.critNoExtraDamage ? 1 : Math.max(100, crit.criticalDamagePercent ?? BASE_CRITICAL_DAMAGE_PERCENT) / 100;
  // Build-wide "+X% additional damage on [<Tag>] Critical Strike" lines (src/crit-only-lines.js) join the supports' crit-only list.
  // The planner's enemy crit-taken debuffs (Mark on the dummy, src/mark-effect.js) act on the crit share the same way.
  // Pool: the supports' crit-only lines, every line's crit-only reading (its skill tag and the crit tag 5001010 as the requirement, so the
  // part's query admits it), the planner's crit-taken debuffs on the dummy; the crit share's query reads the writes that need the crit tag.
  if (hitPool) {
    hitPool.addCritOnly(supports.critOnlyAdditional, { kind: "support" });
    const critTags = new Map();
    const critLines = modifierTexts.flatMap((line) => { const rule = classifyCritOnlyLine(line.text); const value = rule ? rule.value * (line.multiplier ?? 1) : 0; if (!value) return []; const item = { source: line.source, text: `${line.text} (crit hits only)`, value }; critTags.set(item, rule.tag); return [item]; });
    hitPool.addCritOnly(critLines, { kind: "text", tagOf: (item) => critTags.get(item) });
    hitPool.addCritOnly(extraCritOnly, { kind: "model", unit: "dummy" });
  }
  const critOnlyRead = hitPool ? hitPool.critOnly() : null;
  const critOnlySources = critOnlyRead ? critOnlyRead.entries : [...supports.critOnlyAdditional, ...critOnlyLinesFor(modifierTexts, [...scopeTags]), ...extraCritOnly];
  const critOnlyFactor = critOnlyRead ? productValues(critOnlyRead.taken.writes, critOnlyRead.own.additionalFactor) : product(critOnlySources);
  // Typed crit-only lines ("+14% additional Cold Damage on Critical Strike", census #15): per component of that type (below).
  const typedCritOnlySources = typedCritOnlyLinesFor(modifierTexts);
  if (hitPool) hitPool.addTypedCritOnly(typedCritOnlySources);
  // Alternate dual wielding (user-confirmed 2026-10-14): each swing uses its own hand's crit rating with the build-wide lines
  // (the supports' and tagged rating lines, the cap, crit damage, crit-only lines); the hands are not averaged. Each hand's
  // chance: the supports' formula on that hand's weapon rating, or the planner's per-hand chance (crit.hands: Lucky / Sentry
  // rules applied), else the weapon model's. The reported chance is the swing average.
  const weaponHands = attackProfile && weapon?.hands?.length && attackCritBase?.hands?.length === weapon.hands.length ? attackCritBase.hands : null;
  const handCrits = weaponHands ? weaponHands.map((hand, index) => {
    let chancePercent;
    if (supportCrit) {
      const own = supportCritSums();
      const flat = own.flat + taggedRating.ratingFlat;
      const percent = own.percent + taggedRating.ratingPercent;
      const rating = Math.max(0, ((hand.weaponRating || 0) + (attackCritBase.flatRating || 0) + flat) * Math.max(0, 1 + ((attackCritBase.increasedRatingPercent || 0) + percent) / 100) * own.additionalFactor);
      chancePercent = Math.min(100, rating / 100);
    } else chancePercent = crit.hands?.[index]?.criticalChancePercent ?? hand.chancePercent;
    if (crit.guaranteedCrit) chancePercent = 100 * (1 - (crit.cannotCritShare || 0));
    const chance = Math.max(0, Math.min(100, chancePercent || 0)) / 100;
    return { hand: hand.hand, share: hand.share, chancePercent: chance * 100, factor: (1 - chance) + chance * critDamage * critOnlyFactor, townFactor: (1 - chance) + chance * townCritDamage * critOnlyFactor };
  }) : null;
  if (handCrits) critChance = handCrits.reduce((total, hand) => total + hand.share * hand.chancePercent / 100, 0);
  // Main-hand-only additional lines (src/weapon-damage-model.js `hand: "main"`): per-hand in alternate dual wielding (2026-10-14).
  const mainHandOnlyLines = handCrits ? weaponAdditional.filter((line) => line.hand === "main") : [];
  const mainHandOnlyFactor = product(mainHandOnlyLines);
  // Joined Force (G3): every attack is a main-hand attack, but the off-hand's share in it skips the main-hand weapon's own lines.
  const joinedMainHandLines = !handCrits && weapon?.dualWieldMode === "main-hand-only" && weapon?.joinedShareByType ? weaponAdditional.filter((line) => line.hand === "main") : [];
  const joinedMainHandFactor = product(joinedMainHandLines);
  const joinedMainHand = (component) => joinedMainHandLines.length > 0 && Boolean(component.joinedShare);
  if (joinedMainHandLines.length) notes.push(`${profile.name}: Joined Force: ${joinedMainHandLines.map((line) => `"${line.text}" (${line.source})`).join(", ")} ×${round(joinedMainHandFactor)} on the main-hand weapon's own damage and the added flat only; the off-hand's ${weapon.joinedForce?.offHandSharePercent ?? ""}% share does not take it (the Hero Ranking panel's hand rows, 9 T Double Thrusts audit G3).`);
  if (mainHandOnlyLines.length) notes.push(`${profile.name}: ${mainHandOnlyLines.map((line) => `"${line.text}" (${line.source})`).join(", ")} applies to the main-hand swings only (alternate dual wielding: half the swings), ×${round(mainHandOnlyFactor)} on those.`);
  const critFactor = handCrits ? handCrits.reduce((total, hand) => total + hand.share * hand.factor, 0) : (1 - critChance) + critChance * critDamage * critOnlyFactor;
  const townCritFactor = handCrits ? handCrits.reduce((total, hand) => total + hand.share * hand.townFactor, 0) : (1 - critChance) + critChance * townCritDamage * critOnlyFactor;

  // Target (src/target-hit-mitigation.js: user-confirmed Lv.85 dummy): 50% armour vs Physical hits, 30% vs other hits.
  const armourPercent = target.armourPercent ?? level85DummyDefenses.armourPercent;
  const nonPhysicalArmourPercent = target.nonPhysicalArmourPercent ?? level85DummyDefenses.nonPhysicalArmourPercent;
  const resistanceOf = (type) => type === "Physical" ? 0 : (target.resistancePercent?.[type] ?? level85DummyDefenses[`${type.toLowerCase()}ResistancePercent`] ?? 30);

  // "When the supported skill deals damage, there is a X% chance to inflict a debuff: +Y% damage taken by the enemy from the
  // supported skill for Z s" (Tendonslicer): expected uptime 1 − (1 − X%)^(hits in Z s) at the skill's hit rate (provisional).
  const hitsPerSecondForDebuff = usesPerSecond * strikeHitsPerUse(components);
  for (const line of supports.effects.selfDebuff) {
    const uptime = 1 - Math.pow(1 - Math.min(100, line.chancePercent) / 100, hitsPerSecondForDebuff * line.durationSeconds);
    if (uptime > 0) supports.additional.push({ source: line.source, text: `${line.text} — uptime ${round(uptime * 100)}% at ${round(hitsPerSecondForDebuff)} hits/s (provisional)`, value: line.value * uptime, category: "Additional damage taken (from this skill)" });
  }
  // 2026-10-15 patch update (src/support-effects.js). Elemental Impact: active when the final hit parts (own types, conversions,
  // added flat damage) include Fire, Cold and Lightning; Elemental parts only. Hunting Tempo: the buffed share of uses
  // min(1, (m/s ÷ metres) × N ÷ uses per second) × its additional damage, while the Movement group is Moving.
  const finalTypes = components.filter((component) => component.min + component.max + (component.added?.min || 0) + (component.added?.max || 0) > 0).map((component) => component.type);
  for (const clause of supports.effects.clauses.filter((item) => item.family === "allElementalAdditional" && item.value)) {
    const { missing } = allElementalState(finalTypes);
    if (missing.length) notes.push(`${clause.support}: the supported skill doesn't deal all three Elemental types (missing: ${missing.join(", ")}), so "${clause.text}" is inactive.`);
    else supports.additional.push({ source: clause.source, text: `${clause.text} (Lv.${clause.level ?? "?"}) — the hits deal Fire, Cold and Lightning; "recently" held while the skill is used continuously`, value: clause.value, category: "Additional damage", scopeTypes: [...ELEMENTAL_TYPES] });
  }
  // Advanced Elemental Impact (Three-Chambered Heart, game record 5941629; the Main Skill only, src/planner.js): each Elemental type the hits
  // deal gives the other two +X% additional damage for 4 s (one buff per dealt type, each its own factor; held while the skill is used).
  if (heroEffects?.advancedElementalImpact) {
    const { value, source } = heroEffects.advancedElementalImpact;
    for (const type of ELEMENTAL_TYPES) for (const from of ELEMENTAL_TYPES.filter((item) => item !== type && finalTypes.includes(item))) supports.additional.push({ source, text: `+${value}% additional ${type} Damage: the Main Skill dealt ${from} Damage recently (game record 5941629)`, value, category: "Additional damage", scopeTypes: [type] });
  }
  // Swift Bolt (Magnificent) "for each time it was cast recently, up to N time(s)" (game recipe 277886048; F5 2026-10-27): stacks =
  // min(N, casts in the last 4 s) at the skill's use rate, one additional term. Disintegration (Noble) "for each remaining fork"
  // (recipe 104227064; F4): × the forks left at the first hit, the only hit on one dummy (profile `forks`; provisional).
  for (const clause of supports.effects.clauses.filter((item) => item.family === "perStack" && item.status === "In calc" && item.value && (item.stackSource === "castRecently" || item.stackSource === "remainingForks"))) {
    if (clause.stackSource === "castRecently") {
      const stacks = Math.min(clause.cap ?? Infinity, Math.floor(usesPerSecond * 4 + 1e-9));
      if (stacks > 0) supports.additional.push({ source: clause.source, text: `${clause.text} — ${stacks} casts in the last 4 s (${round(usesPerSecond)} uses/s, up to ${clause.cap}; Tangle-fired casts counted: provisional)`, value: clause.value * stacks, category: "Additional damage" });
    } else {
      const forks = Number(profile.forks) || 0;
      if (forks > 0) supports.additional.push({ source: clause.source, text: `${clause.text} — × ${forks} forks remaining at the spear's first hit (provisional)`, value: clause.value * forks, category: "Additional damage" });
    }
  }
  for (const clause of supports.effects.clauses.filter((item) => item.family === "movementCharges" && item.active && item.value)) {
    const speed = clause.moveSpeed || moveSpeed || BASE_PLAYER_MOVE_SPEED;
    const share = movementChargeShare({ uses: clause.uses, meters: clause.meters, usesPerSecond, metersPerSecond: speed.metersPerSecond });
    if (share > 0) supports.additional.push({ source: clause.source, text: `${clause.text} (Lv.${clause.level ?? "?"}) — moving at ${speed.text}: min(1, (${round(speed.metersPerSecond)} ÷ ${clause.meters}) × ${clause.uses} ÷ ${round(usesPerSecond)} uses/s) = ${round(share * 100)}% of uses buffed`, value: clause.value * share, category: "Additional damage", share });
  }

  // "You can only deal Cold Damage" (Extreme Coldness; src/damage-type-restriction.js, user-confirmed 2026-10-18): a part whose
  // final type (after conversion and "added as") is not the dealt type takes −100% additional, so it deals 0. A hit whose every part
  // is removed deals nothing and is not modeled (no hits for on-hit effects, no ailment applications; user-confirmed 2026-10-19).
  const typeRestriction = damageTypeRestriction(modifierTexts);
  // Trinity's chosen-element multiple per Elemental part, Attack hits only (src/trinity.js).
  const trinityByType = trinityFactors(components, trinity, { attack: scopeTags.has("Attack") });
  if (trinityByType) notes.push(`${profile.name}: ${trinity.text} (${trinity.source}): ${[...trinityByType.factors].map(([type, factor]) => `${type} ×${round(factor)}`).join(", ")} (one of three elements per hit, client weights 1 ÷ (1 + share)⁴; an element the hit does not deal can be picked, and then the hit deals nothing).`);
  else if (trinity && !scopeTags.has("Attack")) notes.push(`${profile.name}: ${trinity.text}: Attack hits only (records 474135584 / 293710144, tags Attack + Hit).`);
  // Pool: the supports' increased / additional damage lines (after the lines, as in the lists), and the skill's Armor penetration.
  if (hitPool) { hitPool.addSupportIncreased(supports.increased); hitPool.addSupportAdditional(supports.additional); }
  const armourPenetrationRead = hitPool ? hitPool.armourPenetration() : null;
  // Per component.
  const perType = components.map((component) => {
    // A converted part counts as its original and its final type: the SS14 conversion pass (0x141fc3a80; SS13 0x141e14330) gives the new
    // record the target type's start masks OR the source record's, and the scale step reads every attribute in those masks (W9 step 4,
    // proven; user-stated 2026-10-12, Q8).
    const types = component.scopeTypes || (component.converted ? [component.originalType, component.type] : [component.type]);
    const additionalTypes = component.additionalScopeTypes || types;
    const applies = (line) => scopeApplies(line.scope, { damageTypes: types, skillTags: scopeTags });
    const appliesAdditional = (line) => scopeApplies(line.scope, { damageTypes: additionalTypes, skillTags: scopeTags });
    // Pool reads of this part (the hit's query, the part's types; the additional and taken reads by its additional-scope types).
    const increasedRead = hitPool ? hitPool.damage(3, types) : null, additionalRead = hitPool ? hitPool.damage(4, additionalTypes) : null;
    // Typed crit-only lines (census #15): one more factor on this component's crit share, Σ over the types it counts as.
    const typedCritOnly = hitPool ? hitPool.typedCritOnly(additionalTypes).additionalFactor : product(typedCritOnlySources.filter((line) => additionalTypes.includes(line.type)));
    const typedCritExtra = (chance, damage) => chance * damage * critOnlyFactor * (typedCritOnly - 1);
    const typedHand = (hand) => typedCritOnly === 1 ? hand : { ...hand, factor: hand.factor + typedCritExtra(hand.chancePercent / 100, critDamage), townFactor: hand.townFactor + typedCritExtra(hand.chancePercent / 100, townCritDamage) };
    const componentCritFactor = handCrits ? critFactor : critFactor + typedCritExtra(critChance, critDamage);
    const componentTownCritFactor = handCrits ? townCritFactor : townCritFactor + typedCritExtra(critChance, townCritDamage);
    const componentIncreased = (component.extraIncreased || []).map((line) => ({ ...line, category: "Increased damage", origin: "skill" }));
    const increased = [...(increasedRead ? increasedRead.entries : [...damageLines.filter((line) => line.layer === "increased" && applies(line)), ...supports.increased.filter((line) => applies(line))]), ...(channelState?.increased || []), ...weaponIncreased, ...componentIncreased, ...galeLines.filter((line) => line.layer === "increased")];
    const componentLines = (component.extraAdditional || []).map((line) => ({ ...line, category: "Additional damage", origin: "skill" }));
    const additional = [...(additionalRead ? additionalRead.entries : [...damageLines.filter((line) => line.layer === "additional" && appliesAdditional(line)), ...supports.additional.filter((line) => !line.scopeTypes || line.scopeTypes.some((type) => additionalTypes.includes(type)))]), ...levelLine, ...sentryNearbyLines, ...terraLine, ...grantedLines, ...speedBonusLine.filter((line) => line.value > 0), ...galeLines.filter((line) => line.layer === "additional"), ...(channelState?.additional || []), ...componentLines, ...auraLines.filter((line) => !line.types || line.types.some((type) => additionalTypes.includes(type))), ...mainStatLines, ...doubleDamageLines, ...weaponAdditional.filter((line) => !((handCrits || joinedMainHand(component)) && line.hand === "main")), ...(restrictionLine(typeRestriction, component.type, "hit damage") ? [restrictionLine(typeRestriction, component.type, "hit damage")] : []), ...(trinityLine(trinity, trinityByType, component.type) ? [trinityLine(trinity, trinityByType, component.type)] : [])];
    // Combo Finisher crit and Double Damage extras (census item #9; src/combo-points.js comboExtraState), on the Finisher's hits only:
    // "+X% Critical Strike Damage for Combo Finishers" (727988544, flat crit damage) and "+X% additional damage for every 1 Combo Point
    // consumed on Critical Strike from Combo Finishers" (157017744, X × consumed points on the crit share) change the crit factor
    // (1 − c) + c × D × K to (1 − c) + c × (D + d) × K × Π(1 + X × points); "+X% Double Damage Chance for Combo Finishers for every N
    // Combo Point(s) consumed" (707968384) adds X × points ÷ N to the Double Damage chance (expected ×(1 + min(100, chance) ÷ 100)).
    if (comboExtras && String(component.componentKey ?? component.key ?? "").split(/[+>:]/)[0] === "finisher") {
      const critDamageBonus = sum(comboExtras.finisherCritDamage) / 100;
      // A Finisher of its own (Combo Finisher charges) reads its own consumed points (component.finisherCharge).
      const pointsHere = component.finisherCharge ? component.finisherCharge.points : consumedPoints;
      const critPointLines = component.finisherCharge ? finisherCritPointLines.map((line) => ({ ...line, points: Math.min(line.cap ?? Infinity, pointsHere) })) : finisherCritPointLines;
      const perPointFactor = comboExtras.critPerPoint.reduce((total, line) => total * Math.max(0, 1 + line.value * pointsHere / line.perPoints / 100), 1) * critPointLines.reduce((total, line) => total * Math.max(0, 1 + line.value * line.points / 100), 1);
      const chanceShare = critChance;
      const oldFactor = componentCritFactor;
      if (!crit.critNoExtraDamage && chanceShare > 0 && (critDamageBonus || perPointFactor !== 1)) {
        const newFactor = oldFactor + chanceShare * critOnlyFactor * ((critDamage + critDamageBonus) * perPointFactor - critDamage);
        if (oldFactor > 0 && Math.abs(newFactor / oldFactor - 1) > 1e-12) additional.push({ source: [...comboExtras.finisherCritDamage, ...comboExtras.critPerPoint, ...finisherCritPointLines].map((line) => line.source).join(" + "), text: `Combo Finisher crits: ${[...comboExtras.finisherCritDamage, ...comboExtras.critPerPoint, ...finisherCritPointLines].map((line) => line.text).join("; ")}${comboExtras.critPerPoint.length || finisherCritPointLines.length ? ` × ${round(pointsHere)} consumed Combo Points` : ""} → crit factor ×${round(oldFactor)} → ×${round(newFactor)} at ${round(chanceShare * 100)}% crit chance (game recipes 727988544 / 157017744${finisherCritPointLines.length ? " / 867824320" : ""}; Finisher hits only)`, value: (newFactor / oldFactor - 1) * 100, category: "Additional damage (Combo Finisher crits)", origin: "derived" });
      }
      const doubleExtra = comboExtras.doubleDamagePerPoint.reduce((total, line) => total + line.value * pointsHere / line.perPoints, 0);
      if (doubleExtra) {
        const baseChance = Math.max(0, doubleDamage.chancePercent || 0);
        const factor = (1 + wholePercentRoll(baseChance + doubleExtra) / 100) / (1 + wholePercentRoll(baseChance) / 100);
        if (Math.abs(factor - 1) > 1e-12) additional.push({ source: comboExtras.doubleDamagePerPoint.map((line) => line.source).join(" + "), text: `${comboExtras.doubleDamagePerPoint.map((line) => line.text).join("; ")} × ${round(pointsHere)} consumed Combo Points = +${round(doubleExtra)}% Double Damage chance on the Finisher (${round(baseChance)}% → ${round(Math.min(100, baseChance + doubleExtra))}%; game recipe 707968384) → ×${round(factor)}`, value: (factor - 1) * 100, category: "Additional damage (Double Damage, expected)", origin: "derived" });
      }
    }
    const combatAdditional = [...combatLines];
    const takenRead = hitPool ? hitPool.taken(additionalTypes) : null, maxRead = hitPool ? hitPool.max(types) : null, minRead = hitPool ? hitPool.min(types) : null, penetrationRead = hitPool ? hitPool.penetration(component.type) : null;
    // A part's own damage-taken terms (a Combo skill's own Mark, ownMark above): additional, each its own factor, after the build's.
    const componentTaken = component.extraTaken || [];
    const taken = [...(takenRead ? takenRead.entries : takenLines.filter((line) => appliesAdditional(line))), ...componentTaken];
    const maxOnly = maxRead ? maxRead.entries : maxLines.filter((line) => applies(line));
    const minOnly = minRead ? minRead.entries : minLines.filter((line) => applies(line));
    const penetration = penetrationRead ? penetrationRead.entries : penetrationLines.filter((line) => line.damageTypes.has(component.type));
    // Pool sums continue in list order (the pool's writes first, then the model's entries), so they equal one list's sum.
    const increasedFactor = Math.max(0, 1 + (increasedRead ? sumValues(increased.slice(increasedRead.entries.length), increasedRead.increased) : sum(increased)) / 100);
    const takenFactor = (takenRead ? Math.max(0, 1 + takenRead.increased / 100) * takenRead.additionalFactor : Math.max(0, 1 + sum(taken.filter((line) => line.layer === "increased" && !componentTaken.includes(line))) / 100) * product(taken.filter((line) => line.layer === "additional" && !componentTaken.includes(line)))) * product(componentTaken);
    const penetrationPercent = penetrationRead ? penetrationRead.base : sum(penetration);
    const resistancePercent = resistanceOf(component.type);
    const resistanceFactor = Math.max(0, 1 - (resistancePercent - penetrationPercent) / 100);
    // "+X% Armor DMG Mitigation Penetration": points off the (capped) armour mitigation of every hit type (sourced trace;
    // no floor after the subtraction: provisional). src/target-hit-mitigation.js armourMitigationPercent.
    const armourPenetration = armourPenetrationRead ? armourPenetrationRead.entries : armourPenetrationLines;
    const armour = armourMitigationPercent({ physical: component.type === "Physical", armourPercent, nonPhysicalArmourPercent, penetrationPercent: armourPenetrationRead ? armourPenetrationRead.base : sum(armourPenetration) });
    const armourFactor = armour.factor;
    const maxFactor = maxRead ? maxRead.additionalFactor : product(maxOnly);
    // Additional Min / Max Damage scale this component's own lower / upper roll (per damage type: a Physical-scoped line reaches
    // Physical components only) before the roll is averaged; a negative total floors at 0.
    const minFactor = Math.max(0, minRead ? minRead.additionalFactor : product(minOnly));
    const roll = { min: (component.min + component.added.min) * minFactor, max: (component.max + component.added.max) * maxFactor };
    // Attack panels (Hammer of Ash / Whirlwind / Split Shot Lv16 runs 2026-10-12): "Total Main-Hand Attack Damage" is the
    // weapon × % hit after the dummy's Physical armour (0.5) or non-Physical armour × resistance (0.49), without the
    // Demolisher expectation, and "Attack DPS" is that hit × attack speed × crit (observed on the three panels; see
    // research/attack-weapon-tests-2026-10-12.md). Spell panels show the unmitigated hit (Ring of Blades, Flame Jet).
    const townAdditionalFactor = product(attackProfile ? additional.filter((entry) => !/: Demolisher Charge$/.test(entry.source || "")) : additional);
    const additionalFactor = (additionalRead ? productValues(additional.slice(additionalRead.entries.length), additionalRead.additionalFactor) : product(additional)) * product(combatAdditional);
    // Lucky / Very Lucky Damage (manual "Lucky & Unlucky"): the best of N uniform rolls, min + (max − min) × N / (N + 1).
    // Census #11 (2026-10-27): with the build's whole Lucky state (src/lucky-damage.js luckyRollFraction) the scoped lines reach this
    // component's damage type and the skill's tags, Unlucky and part-time windows enter the expected fraction of the range, and
    // Chain Lightning: Lucky (Noble) makes the supported skill's own rolls Lucky.
    const luckyFraction = hitLuckyState || ownLuckyRolls > 1 ? luckyRollFraction(hitLuckyState || { damageRolls: luckyDamageRolls }, { damageType: component.type, tags: [...scopeTags], hit: true }, { ownRolls: ownLuckyRolls }) : null;
    const rollAverageOf = (range) => luckyFraction != null ? range.min + (range.max - range.min) * luckyFraction : luckyDamageRolls > 1 ? range.min + (range.max - range.min) * luckyDamageRolls / (luckyDamageRolls + 1) : average(range);
    // Joined Force (G3, 9 T Double Thrusts audit 2026-11-13): the off-hand's share inside this component (component.joinedShare) does
    // not take the main-hand weapon's own lines; the main weapon's own damage and the added flat do. Same min / max / Lucky rolls.
    const joined = joinedMainHand(component) ? component.joinedShare : null;
    const rollAverage = joined
      ? rollAverageOf({ min: (component.min - joined.min + component.added.min) * minFactor, max: (component.max - joined.max + component.added.max) * maxFactor }) * joinedMainHandFactor + rollAverageOf({ min: joined.min * minFactor, max: joined.max * maxFactor })
      : rollAverageOf(roll);
    // Alternate dual wielding: ½ (main-hand roll + shared added flat) × main crit + ½ (off-hand roll + shared added flat) × off
    // crit; a component without per-hand ranges (added flat only) rolls the same in both hands.
    // "+X% additional damage for Main-Hand Weapons" (2026-10-14): in alternate dual wielding only the main-hand swings take it
    // (mainHandOnlyLines), as a factor on that hand's roll; the off-hand swings do not.
    const handRolls = handCrits ? (component.hands || handCrits.map(() => ({ min: component.min, max: component.max }))).map((hand, index) => {
      const range = { min: (hand.min + component.added.min) * minFactor, max: (hand.max + component.added.max) * maxFactor };
      const handFactor = handCrits[index].hand === "main" ? mainHandOnlyFactor : 1;
      return { hand: handCrits[index].hand, share: handCrits[index].share, roll: range, average: rollAverageOf(range) * handFactor, handAdditionalFactor: handFactor, critFactor: typedHand(handCrits[index]).factor, townCritFactor: typedHand(handCrits[index]).townFactor };
    }) : null;
    const critWeighted = handRolls ? handRolls.reduce((total, hand) => total + hand.share * hand.average * hand.critFactor, 0) : null;
    const townCritWeighted = handRolls ? handRolls.reduce((total, hand) => total + hand.share * hand.average * hand.townCritFactor, 0) : null;
    const townPerHit = handRolls ? townCritWeighted * increasedFactor * townAdditionalFactor * (attackProfile ? armourFactor * resistanceFactor : 1) : rollAverage * increasedFactor * townAdditionalFactor * componentTownCritFactor * (attackProfile ? armourFactor * resistanceFactor : 1);
    const townPerHitNoCrit = (handRolls ? handRolls.reduce((total, hand) => total + hand.share * hand.average, 0) : rollAverage) * increasedFactor * townAdditionalFactor * (attackProfile ? armourFactor * resistanceFactor : 1);
    const perHitBeforeTarget = handRolls ? critWeighted * increasedFactor * additionalFactor : rollAverage * increasedFactor * additionalFactor * componentCritFactor;
    // Taken-side conversion (Gemma – Dress Licker, hero trait audit B3; src/hero-trait-modules.js): a share of this component's
    // damage is taken as another type, after the player's own bonuses: that share takes the new type's resistance, penetration,
    // armour and typed Damage taken lines (provisional).
    const converted = takenConversion && takenConversion.share > 0 && component.type === takenConversion.from ? (() => {
      const to = takenConversion.to;
      const toTaken = hitPool ? hitPool.taken([to]).entries : takenLines.filter((line) => scopeApplies(line.scope, { damageTypes: [to], skillTags: scopeTags }));
      const toTakenFactor = Math.max(0, 1 + sum(toTaken.filter((line) => line.layer === "increased")) / 100) * product(toTaken.filter((line) => line.layer === "additional")) * product(componentTaken);
      const toResistanceFactor = Math.max(0, 1 - (resistanceOf(to) - (hitPool ? hitPool.penetration(to).base : sum(penetrationLines.filter((line) => line.damageTypes.has(to))))) / 100);
      const toArmourFactor = armourMitigationPercent({ physical: to === "Physical", armourPercent, nonPhysicalArmourPercent, penetrationPercent: sum(armourPenetration) }).factor;
      return { share: takenConversion.share, to, source: takenConversion.source, takenFactor: toTakenFactor, resistanceFactor: toResistanceFactor, armourFactor: toArmourFactor, factor: toTakenFactor * toArmourFactor * toResistanceFactor };
    })() : null;
    const targetFactor = converted ? (1 - converted.share) * takenFactor * armourFactor * resistanceFactor + converted.share * converted.factor : takenFactor * armourFactor * resistanceFactor;
    const perHit = perHitBeforeTarget * targetFactor;
    return { key: component.componentKey, strikeKey: component.strikeKey ?? component.componentKey, label: component.label, ...(component.recalled ? { recalled: true, landingsPerUse: component.landingsPerUse } : {}), ...(component.parabolicSplit ? { parabolicSplit: true } : {}), ...(component.shadow ? { shadow: true, landingsPerUse: component.landingsPerUse } : {}), ...(component.rebound ? { rebound: true, landingsPerUse: component.landingsPerUse } : {}), type: component.type, originalType: component.originalType, converted: component.converted, ...(component.scopeTypes ? { scopeTypes: [...component.scopeTypes] } : {}), addedOnly: Boolean(component.addedOnly), splitPart: Boolean(component.splitPart), hitsPerUse: component.hitsPerUse, hitsDetail: component.hitsDetail, shotgun: component.shotgun || null, basis: component.basis, note: component.note, effectiveness: component.effectiveness, base: { min: component.min, max: component.max }, added: component.added, addedSources: component.addedSources, roll, increased, additional, combatAdditional, taken, maxOnly, minOnly, penetration, armourPenetration, armourPercent: armour.before, armourPenetrationPercent: armour.penetrationPercent, armourAfterPenetrationPercent: armour.after, ...(converted ? { takenConversion: converted } : {}), increasedFactor, additionalFactor, townAdditionalFactor, takenFactor, penetrationPercent, resistancePercent, resistanceFactor, armourFactor, maxFactor, minFactor, handRolls, mainHandOnly: mainHandOnlyLines, ...(joined ? { joinedShare: { ...joined }, joinedMainHandFactor } : {}), townPerHit, townPerHitNoCrit, perHitBeforeTarget, perHit, perUse: perHit * component.hitsPerUse, townPerUse: townPerHit * component.hitsPerUse };
  });

  if (typeRestriction) {
    const removed = [...new Set(perType.filter((component) => removesType(typeRestriction, component.type)).map((component) => component.type))];
    if (removed.length) notes.push(`${profile.name}: ${typeRestriction.label}: its ${removed.join(", ")} part${removed.length === 1 ? "" : "s"} deal${removed.length === 1 ? "s" : ""} 0${perType.some((component) => !removesType(typeRestriction, component.type)) ? `; the ${typeRestriction.type} parts (own, added or converted) stay` : "; nothing is left, so the skill deals no damage"}.`);
  }
  // Hit events per use: one per strike (strikeHitsPerUse); damage still sums every typed part below.
  const hitsPerUse = strikeHitsPerUse(perType);
  // Crit determinations per use (src/crit-cache.js; research/lucky-crit-mechanics-2026-10-27.md §4): per hit for a skill whose damage
  // crit cache is off, else one per hit group per use. They count the rolls (a Lucky re-roll is per determination); damage is unchanged.
  // Crit events (SS14 client, research/oq-aeterna-stack-modes-2026-11-04.md R-b, 2026-11-04): every hit event of a critting group carries
  // the crit tag and raises the crit events (0x141fbaac0 runs per event), so the crit-event readers (src/planner.js hitRateFacts, Aeterna
  // Martyr, Nether King's recent non-crit stacks, Instructions on crit) count the landing hit events × the crit share: `critEventsPerUse`
  // (each landing projectile, strike, Shadow or Recall once, the typed parts of one strike once). Before 2026-11-04 they counted the
  // determinations. The once-per-frame-per-source cap of a flagged listener is not applied here (the tick engine's bus applies it).
  const critEventsPerUse = strikeHitsPerUse(perType, landingsPerUse);
  const critCache = critCacheFor(profile.name);
  const critChecksPerUse = critCache.cached ? cachedCritChecksPerUse(components.filter((component) => perType.some((part) => (part.strikeKey ?? part.key) === (component.strikeKey ?? component.componentKey)))) : hitsPerUse;
  const hitPerUse = perType.reduce((total, component) => total + component.perHit * component.hitsPerUse, 0);
  // Deterioration (src/combat-states.js deteriorationFrom; manual rule 1002030520): each Erosion hit has the chance to add
  // a stack (plus expected extra stacks) that deals 60% of that hit's Erosion damage dealt as True Damage when it ends.
  const erosionPerUse = perType.filter((component) => component.type === "Erosion").reduce((total, component) => total + component.perHit * component.hitsPerUse, 0);
  // Legendary audit batch 6 (src/combat-states.js deteriorationFrom): Ruinous Star's Obliterate share (only the enhanced uses of a
  // non-channeled Main Skill inflict it: min(1, (1 ÷ interval) ÷ uses per second)), its per-tick damage, and Blight's damage taken per
  // held stack (stacks = Erosion hit events per second × chance × (1 + extra stacks) × the share × the 1 s duration).
  const obliterateShare = deterioration?.obliterateEverySeconds ? (mainSkill && !channel && usesPerSecond > 0 ? Math.min(1, (1 / deterioration.obliterateEverySeconds) / usesPerSecond) : 0) : 1;
  const erosionHitsPerUse = strikeHitsPerUse(perType.filter((component) => component.type === "Erosion"));
  const deteriorationStacks = deterioration ? erosionHitsPerUse * usesPerSecond * (deterioration.chancePercent / 100) * (1 + deterioration.extraStacks) * obliterateShare * 1 : 0;
  const deteriorationTakenFactor = (deterioration?.takenPerStack || []).reduce((factor, line) => factor + line.per / 100 * Math.min(line.cap, deteriorationStacks), 1);
  // + the skill's own additional Deterioration Damage from hero effects (Youga's Shackles of Malice Alternate Spacetime; src/youga-ultimate-one.js).
  const heroDeteriorationFactor = (heroEffects?.deteriorationAdditional || []).reduce((factor, line) => factor * (1 + (Number(line.value) || 0) / 100), 1);
  // Chunk 8 (src/support-chunk8.js): the supported skill's own Deterioration lines. A Finisher line takes the Finisher hits' share of this skill's Erosion hits (provisional averaging, as Rising's ailments).
  const deteriorationLines = (supports.effects.deterioration || []).filter((line) => line.status === "In calc" || line.status === "Provisional");
  const finisherShareOfHits = (() => { const finisher = strikeHitsPerUse(perType.filter((component) => component.type === "Erosion" && String(component.componentKey ?? component.key ?? "").split(/[+>:]/)[0] === "finisher")); return erosionHitsPerUse > 0 ? finisher / erosionHitsPerUse : 0; })();
  const supportDeteriorationFactor = deteriorationLines.reduce((factor, line) => line.kind === "additional" ? factor * (1 + line.value / 100) : line.kind === "ownBuff" ? factor * (1 + line.value * line.stacks / 100) : line.kind === "finisher" ? factor * (1 + line.value * finisherShareOfHits / 100) : factor, 1);
  const supportDeteriorationStacks = deteriorationLines.filter((line) => line.kind === "extraStacks").reduce((total, line) => total + line.value, 0);
  const deteriorationFactor = deterioration && erosionPerUse > 0 ? deterioration.share * (deterioration.chancePercent / 100) * (1 + deterioration.extraStacks + supportDeteriorationStacks) * (1 + deterioration.increasedPercent / 100) * deterioration.additionalPercents.reduce((factor, value) => factor * (1 + value / 100), 1) * obliterateShare * (deterioration.tickFactor?.factor || 1) * deteriorationTakenFactor * heroDeteriorationFactor * supportDeteriorationFactor : 0;
  if (deterioration && erosionPerUse > 0 && (deterioration.obliterateEverySeconds || deterioration.tickFactor || deterioration.takenPerStack?.length)) notes.push(`${profile.name}: Deterioration${deterioration.obliterateEverySeconds ? ` from ${round(obliterateShare * 100)}% of uses (Obliterate every ${deterioration.obliterateEverySeconds} s)` : ""}${deterioration.tickFactor ? `, ${deterioration.tickFactor.count} ticks per stack ×${round(deterioration.tickFactor.factor)}` : ""}${deterioration.takenPerStack?.length ? `, ${round(deteriorationStacks)} stacks held → ×${round(deteriorationTakenFactor)} damage taken` : ""} (provisional).`);
  const deteriorationPerUse = erosionPerUse * deteriorationFactor;
  // Spell Ripple (Ethereal Prism core; game affix 864131584): on a hit (trigger 1000030, tags Hit 5000003 + Spell 6001100 + Main
  // Skill 6020000) a P1% chance (node 188) to cast the Pulse (node 1035, skill stone 210150), at most once per 0.03 s (node 206).
  // The Pulse deals True Damage equal to P2% of the hit's damage. Read (user-supplied 2026-10-19, Google AI Mode answer, not tested in game): the
  // hit's damage dealt to the dummy (after resistance, with its crit expectation), not mitigated again (True Damage, as for a
  // Reap); one Pulse per qualifying hit event; the Pulse does not crit and is not itself counted as a hit of the skill.
  // Pulses per second = min(chance × hits/s, 1 ÷ interval).
  const rippleLine = skillTags.has("Spell") && mainSkill ? modifierTexts.map((line) => ({ line, match: normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(SPELL_RIPPLE_LINE) })).find((item) => item.match) : null;
  const spellRipple = rippleLine && hitPerUse > 0 && hitsPerUse > 0 && usesPerSecond > 0 ? (() => {
    const chance = Math.min(1, Number(rippleLine.match[1]) / 100), percent = Number(rippleLine.match[2]) * (rippleLine.line.multiplier ?? 1), interval = Number(rippleLine.match[3]);
    const hitsPerSecond = hitsPerUse * usesPerSecond;
    const pulsesPerSecond = Math.min(chance * hitsPerSecond, interval > 0 ? 1 / interval : Infinity);
    const pulsesPerUse = pulsesPerSecond / usesPerSecond;
    const perPulse = percent / 100 * hitPerUse / hitsPerUse;
    return { source: rippleLine.line.source, text: rippleLine.line.text, chancePercent: chance * 100, percent, intervalSeconds: interval, hitsPerSecond, pulsesPerSecond, capped: chance * hitsPerSecond > pulsesPerSecond + 1e-12, perPulse, perUse: perPulse * pulsesPerUse, dps: perPulse * pulsesPerSecond,
      rule: `Spell Ripple: ${round(chance * 100)}% of ${round(hitsPerSecond)} hits/s${chance * hitsPerSecond > pulsesPerSecond + 1e-12 ? `, capped at 1 per ${interval} s` : ""} = ${round(pulsesPerSecond)} Pulses/s × ${percent}% of the average hit dealt (${round(hitPerUse / hitsPerUse)}) as True Damage (game affix 864131584; after resistance, not mitigated again, no crit: user-supplied 2026-10-19, not tested in game)` };
  })() : null;
  if (spellRipple) notes.push(spellRipple.rule);
  // Sweeping Fury: on a hit of a Main Horizontal Projectile skill (not Sentry, Vertical, Channeled; not a hit of a ring copy) the
  // Main Skill is cast again with its projectiles in a ring at -60% additional damage, at most once per 0.03 s (game affix
  // 19348734; the cast checks the cooldown). Exactly 1 ring projectile hits a single boss per ring (user-supplied 2026-10-19,
  // Google AI Mode answer, not tested in game): one extra projectile hit per ring at the average hit dealt × (1 − 60%). The
  // ring hit is not counted as a hit of the skill (no on-hit chains from it).
  // Which skills: the record's 1000033 row (wiring audit W2 gap 1, 2026-11-03): `mine` Ranged 6001130, Horizontal 6001111, Projectile
  // 6001110 and Main Skill 6020000 all on the hit, `notMine` the ring copy's 6010110, Sentry 6000360, Channeled 6000030 and Vertical
  // 6001113 none, checked against the setup's game stone tags with its supports' tag changes (setupEventTagIds); before, Projectile +
  // Horizontal alone, so a Spell (Ice Lances) or Melee (Hammer of Ash) Main Skill cast rings (×2.10 on each). Without the recipe table the
  // record's tags are read from the text.
  // The Main Skill is the planner's Main Skill (isMainSkill, from src/planner.js resolvedMain; 2026-11-15): setupEventTagIds adds Main Skill
  // 6020000 for every setup in a "main" role, which every active-slot skill of a custom board has, so a non-Main board skill read as one
  // (the trigger bus's fix of the same day). Without the flag (direct calls) the role stands.
  const furyMain = mainSkill;
  const furyText = furyMain && !channel && !sentry_ ? modifierTexts.map((line) => ({ line, match: normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(SWEEPING_FURY_LINE) })).find((item) => item.match) : null;
  const furyRow = furyText ? (lineTriggerRows(furyText.line)?.rows || []).find((row) => row.trigger === 1000033) || { mine: [6001130, 6001111, 6001110, 6020000], notMine: [6010110, 6000360, 6000030, 6001113] } : null;
  const furyTags = furyText ? setupEventTagIds(setup, profile.tags || []) : null;
  if (furyTags) { if (furyMain) furyTags.add(6020000); else furyTags.delete(6020000); }
  const furyLine = furyText && rowTagsFit(furyRow, furyTags) ? furyText : null;
  if (furyText && !furyLine) notes.push(`${profile.name}: Sweeping Fury needs a Main Ranged Horizontal Projectile Skill that is not Sentry, Vertical or Channeled (game affix 19348734, trigger 1000033 tags); ${profile.name} is not one.`);
  const sweepingFury = furyLine && hitPerUse > 0 && hitsPerUse > 0 && usesPerSecond > 0 ? (() => {
    const chance = Math.min(1, Number(furyLine.match[1]) / 100), additionalPercent = Number(furyLine.match[2]) * (furyLine.line.multiplier ?? 1), interval = Number(furyLine.match[3]);
    const hitsPerSecond = hitsPerUse * usesPerSecond;
    const caps = [interval > 0 ? 1 / interval : Infinity, effectiveCooldown > 0 ? 1 / effectiveCooldown : Infinity];
    const ringsPerSecond = Math.min(chance * hitsPerSecond, ...caps);
    const perRing = Math.max(0, 1 + additionalPercent / 100) * hitPerUse / hitsPerUse;
    return { source: furyLine.line.source, text: furyLine.line.text, chancePercent: chance * 100, additionalPercent, intervalSeconds: interval, hitsPerSecond, ringsPerSecond, capped: chance * hitsPerSecond > ringsPerSecond + 1e-12, projectilesPerRingOnTarget: 1, perRing, perUse: perRing * ringsPerSecond / usesPerSecond, dps: perRing * ringsPerSecond,
      rule: `Sweeping Fury: ${round(chance * 100)}% of ${round(hitsPerSecond)} hits/s${chance * hitsPerSecond > ringsPerSecond + 1e-12 ? `, capped at ${round(ringsPerSecond)} rings/s (${interval} s interval${effectiveCooldown > 0 ? `, ${round(effectiveCooldown)} s cooldown` : ""})` : ""} = ${round(ringsPerSecond)} ring casts/s × 1 ring projectile on the dummy × the average hit dealt (${round(hitPerUse / hitsPerUse)}) × ${round(1 + additionalPercent / 100)} (${additionalPercent}% additional; game affix 19348734; one ring projectile per ring on a single boss: user-supplied 2026-10-19, not tested in game)` };
  })() : null;
  if (sweepingFury) notes.push(sweepingFury.rule);
  const perUse = hitPerUse + deteriorationPerUse + (spellRipple?.perUse || 0) + (sweepingFury?.perUse || 0);
  // Town / panel figure. For a channel skill the character panel reads one hit of the primary component per channel use
  // (Ring of Blades Lv16 runs 2026-10-11: panel 537 = 178.9 per hit × 3.003 uses/s, and × 1.245 with Quick Decision),
  // not the blades' landed hit rate; other skills read every hit of every component per use.
  const primaryKey = perType.find((component) => !component.addedOnly)?.key ?? null;
  // Attack panels read one hit of the primary component per attack (Hammer of Ash 298 = the Pummel alone, no Explosion;
  // Whirlwind 358 = the Sweep Slash alone; Split Shot 472 = one arrow), the same shape as the channel rule.
  const townHits = (component) => (channel && !release) || attackProfile ? (component.key === primaryKey || component.addedOnly ? 1 : 0) : component.hitsPerUse;
  const townPerUse = perType.reduce((total, component) => total + component.townPerHit * townHits(component), 0);
  // Panel readout without the crit expectation: the Flame Jet Lv16 panel showed 170 against 175.0 with crit and 170.7
  // without (one observation; the DoT panel figures never carry crit either).
  const townPerUseNoCrit = handCrits ? perType.reduce((total, component) => total + component.townPerHitNoCrit * townHits(component), 0) : townCritFactor > 0 ? townPerUse / townCritFactor : townPerUse;
  const perUseBeforeTarget = perType.reduce((total, component) => total + component.perHitBeforeTarget * component.hitsPerUse, 0);
  const dps = perUse * usesPerSecond;
  // Windows: uses fall at u / rate (u ≥ 1) as in the dummy recount; a cooldown-bound skill gets floor(seconds × rate) uses.
  // A Terra skill's ground effect is continuous from its first cast, a channel is held at full stacks (own buffs
  // pre-built) and a rate-model trigger runs steadily, so their windows use the steady rate.
  // A Combo cycle with per-attack `steps` counts each attack as it lands (end of its own attack time) instead of whole
  // cycles: Crescent Slash Lv16 (2026-10-12) showed 49 Moon Halo stacks (1 per Starter hit, 7 per cycle) after 20 s, i.e.
  // the 7th cycle's Starters landed although only 6 whole cycles fit. Each step's share of a use is its components'
  // damage (keys match the base component, its conversion parts, and `share` for steps that split one component);
  // damage not tied to a step key (added flat damage) is spread in the same proportions.
  const cycleSteps = profile.cycle?.steps?.length && baseUseTime > 0 && intervalSeconds > 0 ? (() => {
    const baseKey = (key) => String(key).split(/[+>]/)[0];
    const stepDamage = cycleStepList.map((step) => perType.filter((component) => step.keys.includes(baseKey(component.key))).reduce((total, component) => total + component.perHit * component.hitsPerUse, 0) * (step.share ?? 1));
    const mapped = stepDamage.reduce((total, value) => total + value, 0);
    if (!(mapped > 0)) return null;
    const scale = intervalSeconds / baseUseTime;
    // Triggered: one step per trigger interval (the first at the first trigger, cycleStart below).
    return cycleStepList.map((step, index) => ({ seconds: cycleTriggerSteps ? triggerStepSeconds : (cycleStepSeconds?.[index] ?? step.seconds) * scale, damage: perUse * stepDamage[index] / mapped }));
  })() : null;
  const cycleStart = cycleTriggerSteps ? (triggerLine?.startsReady ? 0 : triggerInterval) - triggerStepSeconds : 0;
  const cycleWindowDamage = (seconds) => {
    let time = cycleStart, total = 0;
    for (let guard = 0; guard < 100000; guard += 1) {
      const step = cycleSteps[guard % cycleSteps.length];
      time += step.seconds;
      if (time > seconds + 1e-9) break;
      total += step.damage;
    }
    return total;
  };
  // The 5 s / 20 s windows start at the same first use as the dummy recount (firstUseSeconds; user decision 2026-10-22: skills
  // start ready, so a manual skill's first use is its use time and a cooldown skill's too, e.g. 2 uses in 5 s at 1 s and 4 s;
  // a triggered skill's first use waits for its first trigger, above). Whole uses: one at firstUseSeconds, then one every
  // 1 / usesPerSecond (without a first-use time, the first one interval in). Before 2026-10-21 the windows counted
  // floor(seconds × rate), the first use one whole interval in: Erika's Frost Shield (6 s cooldown) read 0 in the 5 s window
  // while the recount had it in. A rate-model, Terra or channel skill runs at its continuous rate. With own buffs built before
  // engaging (prebuiltSelfBuffs, default on: Focus points, channel stacks and Terra Charge full) its windows read the steady rate
  // and the recount starts it ready (a Focus skill at 0 s, a Terra or channel skill at its use time); with them off, both wait
  // for its first use (user decision 2026-10-22). A rate model that is a trigger (a gear / pact triggered skill, Rehan's Burst)
  // waits for its first trigger either way.
  // An outside trigger with its own first use (Dual Kismet: Hunter's Hand, src/main-skill-retriggers.js: 0.5 s after the first
  // Attack Horizontal Projectile use) counts its whole uses on its own schedule; the rest of the rate keeps the skill's first use.
  const separateTriggers = outsideTriggerUsesPerSecond > 0 ? (extraTriggeredUses.components || []).filter((item) => item.usesPerSecond > 0 && Number.isFinite(item.firstUseSeconds) && item.firstUseSeconds >= 0) : [];
  const scheduleUses = (seconds, first, rate) => !(rate > 0) ? 0 : seconds + 1e-9 < first ? 0 : Math.floor((seconds - first) * rate + 1e-9) + 1;
  const windowUses = (seconds) => {
    const separateRate = separateTriggers.reduce((total, item) => total + item.usesPerSecond, 0);
    const restRate = Math.max(0, usesPerSecond - separateRate);
    const first = Number.isFinite(firstUseSeconds) && firstUseSeconds >= 0 ? firstUseSeconds : 1 / restRate;
    return scheduleUses(seconds, first, restRate) + separateTriggers.reduce((total, item) => total + scheduleUses(seconds, item.firstUseSeconds, item.usesPerSecond), 0);
  };
  const steadyWindow = (terra || channel || rateModel?.readyWhenPrebuilt) && prebuiltSelfBuffs;
  const continuousWindowDps = (seconds) => steadyWindow ? dps : dps * Math.max(0, seconds - (Number.isFinite(firstUseSeconds) && firstUseSeconds >= 0 ? firstUseSeconds : 0)) / seconds;
  const windowDps = (seconds) => !(usesPerSecond > 0) ? 0 : bombs && Number.isFinite(bombs.firstSeconds) ? (seconds + 1e-9 < bombs.firstSeconds ? 0 : perUse * (Math.floor((seconds - bombs.firstSeconds) * usesPerSecond + 1e-9) + 1) / seconds) : terra || channel || rateModel ? continuousWindowDps(seconds) : cycleSteps ? cycleWindowDamage(seconds) / seconds : perUse * windowUses(seconds) / seconds;
  // The primary part: the first own part that deals damage (2026-11-05: a part a Trinity pick or "-100% Gear Physical Damage" leaves at 0,
  // the Rosa build's Physical sweep, read ×0 in the panel rows); the first own part when none does.
  const primary = perType.find((component) => !component.addedOnly && component.perUse > 0) || perType.find((component) => !component.addedOnly) || perType[0] || null;
  const key = `hit:${setup?.setupKey || setup?.instanceId || profile.name}`;
  // A built-in Reap per hit of a retriggered skill (census batch 6: Scorching Pulse's second pulse, `reapsPerUse`).
  const reapsPerUse = Math.max(1, Number(profile.builtInReaping?.reapsPerUse) || 1);
  const builtInReaping = profile.builtInReaping && usesPerSecond > 0 ? { ...profile.builtInReaping, usesPerSecond: usesPerSecond * reapsPerUse, intervalSeconds: intervalSeconds / reapsPerUse, baseRecoverySeconds: intervalSeconds / reapsPerUse } : null;
  // What a per-skill ailment-application model needs from this hit (hit ailments are not applied here): hit damage
  // per use by type before target mitigation (expected, with crit; and the plain average), the use and hit rates,
  // crit, the skill's tags, and the ailment lines the build and the skill text carry.
  const ailmentPattern = /\b(?:Ignite|Ignited|Trauma|Wilt|Shock|Frostbite|Freeze|Frozen|Numbed|Ailments?)\b/i;
  const byType = (pick) => perType.reduce((totals, component) => ({ ...totals, [component.type]: (totals[component.type] || 0) + pick(component) * component.hitsPerUse }), {});
  const ailmentInputs = {
    name: profile.name, setupKey: setup?.setupKey, tags: [...skillTags], dealtTypes, level,
    usesPerSecond, hitsPerUse, hitsPerSecond: usesPerSecond * hitsPerUse, intervalSeconds,
    critChancePercent: critChance * 100, critDamagePercent: critDamage * 100, critFactor,
    perUseByTypeBeforeTarget: byType((component) => component.perHitBeforeTarget),
    perUseAverageByTypeNoCrit: byType((component) => average(component.roll) * component.increasedFactor * component.additionalFactor),
    baseRollByType: byType((component) => average(component.base)),
    ailmentLines: modifierTexts.filter((line) => ailmentPattern.test(line.text)).map((line) => ({ source: line.source, text: line.text, origin: line.origin, multiplier: line.multiplier ?? 1 })),
    skillAilmentTexts: (setup?.effects || []).join("\n").split(/\r?\n/).map((text) => text.trim()).filter((text) => text && ailmentPattern.test(text)),
    supportNames: (setup?.supports || []).filter((support) => support.enabled !== false).map((support) => support.name)
  };
  // The Config tab's "Projectiles hitting the dummy" row (2026-11-12): the largest projectile volley this setup fires per use, how
  // many land automatically (best case) and with the user's count. A skill whose extra projectiles cannot hit the same enemy (Ice
  // Lances without Rebound, Forking Thunder, Split Shot without Volley; the Ice Lances run of 2026-10-12) gets a read-only row.
  const projectileLanding = profile.noProjectileControl ? null : projectileVolleys.length ? (() => {
    const top = projectileVolleys.reduce((best, volley) => volley.count > best.count ? volley : best);
    return { fired: top.count, auto: top.override ? top.autoReached : top.reached, landed: top.reached, override: landedOverride, applied: Boolean(top.override), reach: top.reach, canHitSame: true };
  })() : extraProjectiles > 0 && !falloffFactor && skillTags.has("Projectile") ? { fired: 1 + extraProjectiles, auto: 1, landed: 1, override: null, applied: false, canHitSame: false } : null;
  if (projectileLanding?.applied) notes.push(`${profile.name}: ${projectileLanding.landed} of ${projectileLanding.fired} projectiles hit the dummy (set on the Config tab${landedOverride > projectileLanding.fired ? `: saved ${landedOverride}, ${projectileLanding.fired} fired` : ""}; best case ${projectileLanding.auto}).`);
  return {
    key, name: profile.name, setupKey: setup?.setupKey, profile, skillHit: true, damageType: profile.damageType, dealtTypes,
    ...(projectileLanding ? { projectileLanding } : {}),
    // Extreme Coldness (src/damage-type-restriction.js): the typed parts this hit loses.
    typeRestriction: typeRestriction ? { type: typeRestriction.type, label: typeRestriction.label, removedTypes: [...new Set(perType.filter((component) => removesType(typeRestriction, component.type)).map((component) => component.type))], keptTypes: [...new Set(perType.filter((component) => !removesType(typeRestriction, component.type)).map((component) => component.type))] } : null,
    level, baseLevel: base.level, effectiveness: primary?.effectiveness ?? base.effectiveness, components: perType, primary,
    // Double Damage chance of the hits (condition-unread batch 3: "when dealing Double Damage recently" reads the event rate).
    doubleDamageChancePercent: wholePercentRoll(doubleDamage.chancePercent),
    rate: { useTimeSeconds: baseUseTime, ...(exposedCycleSteps ? { cycleSteps: exposedCycleSteps } : {}), speedType, speedFactor, supportSpeedFactor, spellBurstBlock: spellBurstBlock || null, overloadBurstBlock: overloadBurstBlock || null, castFrequency: sentry ? { factor: castFrequencyFactor, sources: castFrequencyLines, weaponAttacksPerSecond: sentry.weaponAttackSpeed ? weaponAttacksPerSecond || 0 : null } : null, furyLucky: furyLucky ? { active: furyActive, share: furyActive ? spellBurst.share : 0, source: furyLucky.line.source, minStacks: Number(furyLucky.match[1]) } : null, sentryTiming: sentry ? { idle: sentryIdleLines.map((line) => ({ source: line.source, text: line.text, value: line.value, share: line.sentryIdle.share })), startTimeFactor: sentryStartFactor, startTime: sentryStartLines } : null, sentryQuantity: sentry ? { count: sentryQuantity, base: sentry.baseQuantity ?? 1, sources: sentryQuantityLines, deployCap: Number.isFinite(sentryDeployCap) ? sentryDeployCap : null } : null, conversions: supports.conversion, addedAs: supports.addedAs, castSpeedSources: speedType === "attack-speed" ? [...(attackSpeed?.sources || []), ...supports.castSpeed, ...multistrikeSpeedLines, ...(ownSpeedLine ? [ownSpeedLine] : [])] : [...(castSpeed.sources || []), ...supports.castSpeed], attackSpeed: speedType === "attack-speed" ? attackSpeed : null, effectiveUseTimeSeconds: useTime, cooldownSeconds: timing?.cooldownSeconds || 0, charges: timing?.charges || 0, cooldownFactor, cooldownSources: cooldownRecovery, effectiveCooldownSeconds: effectiveCooldown, useModel: triggered ? `triggered (every ${round(triggerInterval)} s; provisional)` : terra ? `${terra.label || "terra"} (${terra.durationSeconds} s ${terra.label === "sentry" ? "sentry" : "ground effect"})` : release ? `channel and release (${channelState.maxStacks} stacks × ${round(useTime || 0)} s, ${round(intervalSeconds || 0)} s per cycle)` : channel ? `channel (${round(baseUseTime)} s interval, ${channelState.maxStacks} stacks held)` : rateModel ? `trigger rate (${round(usesPerSecond)} per second)` : profile.cycle ? "combo cycle" : "cast", terraDurationSeconds: terra?.durationSeconds ?? null, intervalSeconds, usesPerSecond, playerUsesPerSecond, pressedUsesPerSecond, usesBySource, firstUseSeconds, hitsPerUse, hitsPerUseBasis: provisionalComponents.length ? "provisional" : "text", hitsPerUseNote: perType.filter((component) => !component.addedOnly).map((component) => `${component.label}: ${component.hitsDetail} — ${component.note}`).join(" · "), hitsPerSecond: usesPerSecond * hitsPerUse, critChecksPerUse, critChecksPerSecond: usesPerSecond * critChecksPerUse, critEventsPerUse, critEventsPerSecond: usesPerSecond * critEventsPerUse, critCache: { cached: critCache.cached, reason: critCache.reason }, source: timing?.source || null, refdataCastSeconds: timing?.refdataCastSeconds ?? null, demolisherShare, demolisherEverySeconds: profile.demolisher ? demolisherEvery : null, fullManualUsesPerSecond, rotation: rotation || null, multistrike, spellBurst, spellBurstBlock: skillTags.has("Spell") ? spellBurstBlock || (spellBurstStacks < 1 ? "no Max Spell Burst" : null) : "it is not a Spell Skill", bardSong, crimsonShade, bombs: bombs ? { mode: bombs.mode, bonusFactor: bombs.bonusFactor, throwFactor: bombs.throwFactor, additionalFactor: bombs.additionalFactor, throwsPerSecond: bombs.throwsPerSecond, bombsPerThrow: bombs.bombsPerThrow, bombsPerSecond: bombs.bombsPerSecond, firstSeconds: bombs.firstSeconds, onField: bombs.onField, lines: bombs.lines } : null, overload, machines, rateComponents, extraProjectiles: falloffFactor && projectileTargets.length ? { count: extraProjectiles, falloff: falloffFactor } : null, trigger: triggered ? { source: triggerLine.source, text: triggerLine.text, intervalSeconds: triggerInterval, kind: triggerLine.kind, provisional: true } : null },
    weapon: attackProfile ? { damageByType: weapon?.damageByType || {}, mainHand: weapon?.mainHand ? { name: weapon.mainHand.name, type: weapon.mainHand.type, hands: weapon.mainHand.hands } : null, dualWielding: Boolean(weapon?.dualWielding), dualWieldMode: weapon?.dualWieldMode || null, hands: weapon?.hands ? weapon.hands.map((hand) => ({ hand: hand.hand, name: hand.name, type: hand.type, share: hand.share, critRating: hand.critRating, attackSpeed: hand.attackSpeed })) : null, percents: base.weaponPercents } : null,
    crit: { ...crit, chancePercent: critChance * 100, townDamagePercent: townCritDamage * 100, combatDamagePercent: critDamage * 100, critOnlyFactor, critOnlySources, supportRating: supportCrit, factor: critFactor, townFactor: townCritFactor, hands: handCrits ?? crit.hands ?? null },
    town: { perUse: townPerUse, dps: townPerUse * usesPerSecond, perUseNoCrit: townPerUseNoCrit, dpsNoCrit: townPerUseNoCrit * usesPerSecond, hitsPerUse: strikeHitsPerUse(perType, townHits), formula: attackProfile ? "one hit of the primary component after the dummy's armour / resistance × attack speed × crit, without the Demolisher expectation (observed on the Hammer of Ash / Whirlwind / Split Shot Lv16 panels 2026-10-12: 298 / 358 / 472)" : channel ? "average hit × one hit per channel use × channel uses per second (cast-speed scaled); town layers only (Ring of Blades panel runs 2026-10-11: matched with the crit expectation, 537 = 178.9 × 3.003)" : "average hit (with crit) × hits per use × uses per second; town layers only (hypothesis for the character panel's skill DPS)" },
    combat: { perUse, perUseBeforeTarget, dps, dpsBeforeTarget: perUseBeforeTarget * usesPerSecond, fiveSecondAverageDps: windowDps(windows[0] ?? 5), twentySecondAverageDps: windowDps(windows[1] ?? 20) },
    steps: primary ? { increasedFactor: primary.increasedFactor, additionalFactor: primary.additionalFactor, critFactor, takenFactor: primary.takenFactor, armourFactor: primary.armourFactor, armourPercent: primary.armourPercent, armourPenetrationPercent: primary.armourPenetrationPercent, resistanceFactor: primary.resistanceFactor, resistancePercent: primary.resistancePercent, penetrationPercent: primary.penetrationPercent, maxFactor: primary.maxFactor, minFactor: primary.minFactor } : null,
    builtInReaping, ailmentInputs, channel: channelState,
    shadows: shadows?.weight > 0 ? { count: shadows.count, expectedCount: shadows.expectedCount, weight: shadows.weight, sources: shadows.sources, damage: shadows.damage } : null,
    rebound: rebound ? { jumps: rebound.jumps, hits: rebound.hits, repeats: rebound.repeats, weight: rebound.weight, perJumpPercent: rebound.perJumpPercent, sources: rebound.sources } : null,
    // A Combo skill's own Mark (ownMark): on the ailments this skill inflicts, +X% damage taken × the Mark's time on the dummy
    // (src/ailment-applications.js reads `ownAilmentScale`; the Mark is a target-side term, read here as a factor on its applications).
    ...(ownMark ? { ownMark, ownAilmentScale: [{ source: `${ownMark.name} (config_char_buff ${ownMark.buff})`, text: `${ownMark.name}: +${ownMark.percent}% additional damage taken from this skill (its DoT records keep the skill's id), on the dummy ${round(ownMark.timeShare * 100)}% of the time (from Combo Starter 1's hit to the cycle's end; provisional, open question spectral-slash-mark)`, factor: 1 + ownMark.percent / 100 * ownMark.timeShare }] } : {}),
    barrage: barrage?.active ? barrage : null, comboPoints: comboPoints ? { perStarter: comboPoints.perStarter, consumed: comboPoints.consumed, sources: comboPoints.sources, critPoints: comboPoints.critPoints || null, ...(comboPoints.starterCritPoints ? { starterCritPoints: comboPoints.starterCritPoints } : {}), ...(comboPoints.perFinisher ? { perFinisher: [...comboPoints.perFinisher] } : {}) } : null,
    // Combo cycle extras (census item #9): the lines read and the Finisher hits' share of the skill's hits (Shockwave Warcry's
    // "Ailment Damage for Combo Finishers", src/ailment-applications.js).
    combo: profile.cycle ? (() => {
      const strikes = perType.filter((component) => !component.addedOnly && !component.splitPart);
      const total = strikes.reduce((sum, component) => sum + (component.hitsPerUse || 0), 0);
      const finisher = strikes.filter((component) => String(component.key ?? "").split(/[+>:]/)[0] === "finisher").reduce((sum, component) => sum + (component.hitsPerUse || 0), 0);
      const lines = comboExtras ? ["starterSpeed", "finisherSpeed", "finisherCritDamage", "critPerPoint", "doubleDamagePerPoint", "finisherCharges", "amplification", "pointOnFinisherCrit", "sequenceReset"].flatMap((kind) => comboExtras[kind]) : [];
      // finisherDamageLines: the Finisher's whole-damage additional terms (Crescent Slash: Rising's per-consumed-point line, attr 57191 on
      // the Combo Finisher tag, game recipe 468001344), which its ailments take on the Finisher share (src/ailment-applications.js). With
      // Combo Finisher charges each Finisher reads its own points: the value is their mean over the Finisher hits.
      const chargeParts = finisherInstances ? [...new Map(components.filter((component) => component.finisherCharge && !component.addedOnly && !component.splitPart).map((component) => [component.strikeKey ?? component.componentKey, component])).values()] : [];
      const chargeHitTotal = chargeParts.reduce((sum, component) => sum + (component.hitsPerUse || 0), 0);
      const damageLines = !chargeParts.length || !(chargeHitTotal > 0) ? finisherPointLines : comboSupportLines("perConsumedPoint").map((line) => { const value = chargeParts.reduce((sum, component) => sum + (component.hitsPerUse || 0) * line.value * Math.min(line.cap ?? Infinity, component.finisherCharge.points), 0) / chargeHitTotal; return { source: line.source, text: `${line.text} × each Finisher's consumed Combo Points, the mean over the cycle's ${finisherCharges.length} Finishers by their hits (one term; game recipe 468001344)`, value }; }).filter((line) => line.value);
      return { finisherHitShare: total > 0 ? finisher / total : 0, finishersPerCycle: finisherRepeats, ...(finisherCharges ? { finisherPoints: [...finisherCharges] } : {}), finisherDamageLines: damageLines.map((line) => ({ source: line.source, text: line.text, value: line.value })), lines: lines.map((line) => ({ kind: line.kind, source: line.source, text: line.text })) };
    })() : null,
    spellRipple, sweepingFury, mainSpellRepeat, projectileLimit: Number.isFinite(projectileLimit) ? { limit: projectileLimit, baseProjectiles, extraBefore: uncappedExtraProjectiles, extraAfter: extraProjectiles, capped: extraProjectiles < uncappedExtraProjectiles } : null,
    deterioration: deteriorationPerUse > 0 ? { source: deterioration.source, erosionPerUse, factor: deteriorationFactor, perUse: deteriorationPerUse, dps: deteriorationPerUse * usesPerSecond, rule: "60% of each Erosion hit dealt, as True Damage when the 1 s stack ends (manual); chance × (1 + extra stacks) × (1 + increased) × Π(1 + additional); the delay is not in the windows (provisional)" } : null,
    luckyDamageRolls,
    ledger: {
      base: perType.filter((component) => !component.addedOnly).map((component) => ({ source: `${profile.name} · ${component.label} Lv.${base.level}`, text: component.weaponPercent != null ? `${component.weaponPercent}% Weapon Attack Damage × ${round(component.weaponDamage.min)}–${round(component.weaponDamage.max)} ${component.converted ? `${component.originalType} → ${component.type}` : component.type} weapon damage = ${round(component.base.min)}–${round(component.base.max)} × ${round(component.hitsPerUse)} hits per use (${profile.sources.gameData}${level > 20 ? "; base frozen past Lv.20" : ""})` : `${component.base.min}–${component.base.max} ${component.converted ? `${component.originalType} → ${component.type}` : component.type} damage × ${round(component.hitsPerUse)} hits per use (${profile.sources.gameData}${level > 20 ? "; base frozen past Lv.20" : ""})`, min: component.base.min, max: component.base.max, value: average(component.base), category: `Base ${profile.name} damage`, origin: "base" })),
      added: perType.flatMap((component) => component.addedSources.map((line) => ({ ...line, text: `${line.text} × ${round(line.effectiveness ?? 100)}% effectiveness`, category: `Added ${component.type} damage` }))),
      // Joined Force (G3): the main-hand weapon's own lines, on the main weapon's damage and the added flat only (not in `additional`).
      ...(joinedMainHandLines.length ? { joinedMainHand: joinedMainHandLines.map((line) => ({ ...line, text: `${line.text} (the main-hand weapon's own damage and the added flat; Joined Force's off-hand share skips it)` })) } : {}),
      increased: primary?.increased || [], additional: primary?.additional || [], combatAdditional: primary?.combatAdditional || [], taken: primary?.taken || [], penetration: primary?.penetration || [], armourPenetration: primary?.armourPenetration || [], maxOnly: primary?.maxOnly || [], minOnly: primary?.minOnly || []
    },
    scopeLabel,
    notes, warnings,
    inactiveReason,
    // Main-stat shares (chunk 4: the manual's rule also covers "Ailment Damage dealt directly by the skill").
    mainStatParts: statParts,
    // Steep Strike chance (Slash-Strike skills; steepStrikeState): total, sources, share or the Multistrike increment it feeds.
    steepStrike,
    // Gale-type Projectile Speed → Projectile Damage conversion (projectileSpeedState): the increased pool and the lines it gave.
    projectileSpeed: projectileSpeedState ? { increasedPercent: projectileSpeedState.increasedPercent, sources: projectileSpeedState.sources, converters: projectileSpeedState.converters.map(({ source, text, share, layer }) => ({ source, text, share, layer })), lines: galeReadings } : null,
    modeled: perUse > 0 && usesPerSecond > 0
  };
}
