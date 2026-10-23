// Selena (Dance of the Deep): the trait state the damage engines read (Selena traits batch, 2026-10-13;
// research/selena-traits-2026-10-13.md). The path traits arrive as build lines (origin "trait",
// src/character-stats.js heroTraitStatLines reads hero.treeTraits, src/hero-trait-tree.js); this module settles the clauses the plain
// readers cannot: the Main Terra Skill rule, Terra Charge consumption and the trait-applied curse. The Crimson Tide
// lives in src/hero-trait-modules.js.
//
// Sources:
// - "Non-Main Terra Skill cannot deal damage" (base trait text): a Terra skill that is not the Main Skill deals nothing.
// - Terra Charge (keyword 151 and game manual 1001011320): "Using a Terra Skill will consume all of its charges, and every
//   consumed charge will enhance the skill". Charges consumed per cast = min(Max Terra Charge Stacks, charges gained over
//   one cast interval), the interval being the planner's existing cadence (a skill-hit Terra is recast when it expires,
//   6 s; a DoT Terra whenever a charge is available). Max Terra Charge Stacks: 1 + "Max Terra Charge Stacks +N" lines
//   (Silencing Severance) + Layered Hem's share of the Max Spell Burst increase (capped by the trait). Terra Charge
//   Recovery Speed shortens the 0.5 s charge interval (÷ (1 + Σ%), the Recovery Speed reading the planner uses for
//   Cooldown Recovery Speed).
// - Artificial Moon (base trait Lv5 with an Artificial Moon memory; user-corrected 2026-10-13, the gate is
//   src/hero-memory-rules.js artificialMoonGate and the line arrives through heroTraitStatLines): "Each Terra Charge consumed by
//   Terra skills now grants 32% Damage Bonus to that Terra skill" replaces the skill text's 26% per charge.
// - The Paradise I Curse: "Enemies within the Main Terra Skill's area are cursed with Lv. 1 Ominous": with an active Main
//   Terra Skill (centred on you and following you, the dummy within 10 m inside it: best case) the dummy is Cursed, so
//   "against Cursed enemies" lines hold. Ominous's Ill Omen is modeled in src/ill-omen.js (best-case Elite loop, condition illOmen).

import { activationMediumDotTrigger } from "./trigger-interval.js";
import { classifyHitLine } from "./skill-hit-lines.js";

export const DANCE_OF_THE_DEEP = "selena-dance-of-the-deep";
export const TERRA_CHARGE_BASE_PERCENT = 26;
export const TERRA_CHARGE_INTERVAL_SECONDS = 0.5;
const num = (text) => Number(String(text).replace("−", "-"));
const round = (value) => Math.round(value * 10000) / 10000;
const clean = (line) => String(line?.text ?? "").replace(/\s+/g, " ").replace(/(\d) %/g, "$1%").trim();

const MAX_CHARGE = /^(?:\+(\d+) Max Terra Charge Stacks?|Max Terra Charge Stacks? \+(\d+))$/i;
const SPELL_BURST_SHARE = /^Any increase\/decrease on Max Spell Burst Stacks is also applied to Max Terra Charge Stacks, up to \+(\d+)$/i;
const RECOVERY = /^\+?(-?\d+(?:\.\d+)?)% Terra Charge (?:Recovery|Restoration) Speed$/i;
// Kingly Armor: "Terra Charge's Restoration Speed is set to N% of the default value" (legendary audit 2026-10-22, provisional): the
// build's Recovery / Restoration Speed lines are replaced by N% - 100% (the highest such line wins); Crimson Gash's combat penalty
// still applies on top (src/open-questions.js legendary-terra-restoration-set).
export const RECOVERY_SET = /^Terra Charge ?'s Restoration Speed is set to (\d+(?:\.\d+)?) ?% of the default value$/i;
// "100% chance to gain 1 charge stacks when using a Terra Skill" (Vorax affix; game affix 444624: on using a Terra skill (tag
// 6000370), chance P1, node 2230 addRank P2 filtered to Terra skills; gear affix batch B, 2026-10-22). Read as Terra Charge gained at
// the use and consumed by that same cast, up to the max (provisional: the order of the gain and the consumption is not published;
// a cast that already holds the max, as under Activation Medium: Terra, gains nothing from it).
export const TERRA_CHARGE_ON_USE = /^(\d+(?:\.\d+)?)% chance to gain (\d+) charge stacks when using a Terra Skill$/i;
// Current text: "Each Terra Charge consumed by Terra skills now grants 32% Damage Bonus to that Terra skill" (TLIDB); the earlier
// wording is kept for saved text.
const MOON = /^(?:Increases damage provided by Terra Skills to (\d+(?:\.\d+)?)% for every 1 Terra Charge they consume|Each Terra Charge consumed by Terra skills now grants (\d+(?:\.\d+)?)% Damage Bonus to that Terra skill)$/i;
const PARADISE = /^Enemies within the Main Terra Skill's area are cursed with Lv\. (\d+) Ominous$/i;
// Gash (Crimson Gash: "When consuming Terra Charge, gains N stack(s) of Gash for every M stack(s) of Terra Charge consumed"). Per
// stack (official patch notes, Crimson Gash): +12% additional Terra Skill Damage (multiplies), −40% Terra Charge Recovery Speed,
// up to 8 stacks, lasts 3 s.
export const GASH = Object.freeze({ additionalPercent: 12, recoveryPercent: -40, maxStacks: 8, durationSeconds: 3 });
export const GASH_GAIN_TEXT = /^When consuming Terra Charge, gains (\d+(?:\.\d+)?) stack\(s\) of Gash for every (\d+(?:\.\d+)?) stack\(s\) of Terra Charge consumed$/i;
const GASH_GAIN = GASH_GAIN_TEXT;

/**
 * Gash held at the recast cadence and the Terra Charge interval it leaves. Each stack lasts 3 s from its gain, so the stacks held =
 * min(8, Gash gained per second × 3 s); Gash per second = stacks per charge × charges consumed per second, with
 * charges per cast = max(minimum, min(Max Terra Charge, cast interval ÷ charge interval)). The charge interval reads the held
 * stacks' −40% each, so the held count is the fixed point (one, as more stacks mean fewer charges). `castIntervalSeconds`
 * null: the cadence is charge-bound (Activation Medium: Terra, a recast at every charge), one charge per charge interval.
 */
export function settleGash(charges, castIntervalSeconds = null, { minimum = 0 } = {}) {
  // recoverySpeedPercent / recoverySources stay the build's stat lines (the character panel's figure); Gash is a combat buff.
  const base = charges.recoverySpeedPercent;
  const intervalAt = (stacks) => TERRA_CHARGE_INTERVAL_SECONDS / Math.max(0.01, 1 + (base + GASH.recoveryPercent * stacks) / 100);
  const gash = charges.gash;
  if (!gash) return charges;
  const held = (stacks) => {
    const interval = intervalAt(stacks);
    const cast = castIntervalSeconds > 0 ? castIntervalSeconds : interval;
    // The on-use charge (TERRA_CHARGE_ON_USE) joins a fixed recast's charges; a charge-bound recast already holds its charges.
    const consumed = Math.max(minimum, Math.min(charges.maxCharges, cast / interval + (castIntervalSeconds > 0 ? charges.onUseGain || 0 : 0)));
    return Math.min(GASH.maxStacks, gash.perCharge * consumed / cast * GASH.durationSeconds);
  };
  let low = 0, high = GASH.maxStacks;
  if (held(high) >= high) low = high;
  else for (let step = 0; step < 60; step++) { const mid = (low + high) / 2; if (held(mid) > mid) low = mid; else high = mid; }
  const stacks = round(low);
  const recoveryPercent = round(GASH.recoveryPercent * stacks);
  return { ...charges, combatRecoverySpeedPercent: round(base + recoveryPercent), chargeIntervalSeconds: intervalAt(stacks),
    gash: { ...gash, stacks, recoveryPercent, castIntervalSeconds, detail: `${GASH.recoveryPercent}% Terra Charge Recovery Speed per Gash stack × ${stacks} held (${round(gash.perCharge)} per charge consumed, ${GASH.durationSeconds} s each, up to ${GASH.maxStacks})` } };
}

/** Terra Charge state from the build's lines (any hero; the Dance traits supply most of them). */
export function resolveTerraCharges(modifierTexts = [], { maxSpellBurst = 0 } = {}) {
  const maxSources = [], recoverySources = [], onUseSources = [];
  let perChargePercent = TERRA_CHARGE_BASE_PERCENT, perChargeSource = null, gash = null, recoverySet = null;
  for (const line of modifierTexts) {
    const text = clean(line), multiplier = line.multiplier ?? 1;
    let match = text.match(TERRA_CHARGE_ON_USE);
    if (match) { onUseSources.push({ source: line.source, text, value: Math.min(1, num(match[1]) / 100) * num(match[2]) * multiplier }); continue; }
    match = text.match(GASH_GAIN);
    if (match) {
      const perCharge = num(match[1]) / Math.max(1e-9, num(match[2])) * multiplier;
      gash = gash ? { ...gash, perCharge: gash.perCharge + perCharge, text: `${gash.text}; ${text}` } : { source: line.source, text, perCharge };
      continue;
    }
    match = text.match(MAX_CHARGE);
    if (match) { maxSources.push({ source: line.source, text, value: num(match[1] ?? match[2]) * multiplier }); continue; }
    match = text.match(SPELL_BURST_SHARE);
    if (match) {
      const value = Math.min(num(match[1]), maxSpellBurst);
      if (value) maxSources.push({ source: line.source, text: `${text} (Max Spell Burst +${maxSpellBurst})`, value });
      continue;
    }
    match = text.match(RECOVERY_SET);
    if (match) { const value = num(match[1]); if (!recoverySet || value > recoverySet.value) recoverySet = { source: line.source, text, value }; continue; }
    match = text.match(RECOVERY);
    if (match) { recoverySources.push({ source: line.source, text, value: num(match[1]) * multiplier }); continue; }
    match = text.match(MOON);
    if (match && line.origin === "trait") { perChargePercent = num(match[1] ?? match[2]); perChargeSource = { source: line.source, text }; }
  }
  const maxCharges = Math.max(1, 1 + maxSources.reduce((sum, item) => sum + item.value, 0));
  if (recoverySet) recoverySources.splice(0, recoverySources.length, { source: recoverySet.source, text: `${recoverySet.text} (replaces the other Recovery Speed lines)`, value: recoverySet.value - 100, fixed: true });
  const recoverySpeedPercent = recoverySources.reduce((sum, item) => sum + item.value, 0);
  const chargeIntervalSeconds = TERRA_CHARGE_INTERVAL_SECONDS / Math.max(0.01, 1 + recoverySpeedPercent / 100);
  const onUseGain = onUseSources.reduce((sum, item) => sum + item.value, 0);
  const charges = { perChargePercent, perChargeSource, maxCharges, maxSources, recoverySpeedPercent, combatRecoverySpeedPercent: recoverySpeedPercent, recoverySources, chargeIntervalSeconds, gash, onUseGain, onUseSources,
    isDefault: perChargePercent === TERRA_CHARGE_BASE_PERCENT && maxCharges === 1 && !gash && !onUseGain };
  // Charge-bound cadence by default; a fixed recast interval re-settles it (terraChargesAtInterval).
  return settleGash(charges);
}

/** The Terra Charge state at a fixed recast interval (Gash depends on the cadence; without Gash it is unchanged). */
export function terraChargesAtInterval(charges, castIntervalSeconds, { minimum = 1 } = {}) {
  return charges?.gash && castIntervalSeconds > 0 ? settleGash(charges, castIntervalSeconds, { minimum }) : charges;
}

// A setup's own support clauses on Terra Charge (src/support-effects.js family "terraCharge"; Ground Divide: "+1 Max Terra Charge
// stacks for the supported skill", "X% Terra Charge Restoration Speed for the supported skill"), as the line forms
// resolveTerraCharges reads. They apply to that skill only (frost-terra audit 2026-10-13; before, no rule read them).
export function setupTerraChargeLines(setup) {
  const clauses = setup?.supportEffects?.clauses || [];
  return clauses.filter((clause) => clause.family === "terraCharge" && clause.value).map((clause) => ({
    source: clause.source, origin: "support", multiplier: 1,
    text: clause.kind === "max" ? `Max Terra Charge Stacks +${clause.value}` : `${clause.value >= 0 ? "+" : ""}${clause.value}% Terra Charge Restoration Speed`
  }));
}

/** Terra Charge state of one setup: the build's lines plus its own support clauses. */
export function terraChargesForSetup(modifierTexts = [], setup = null, options = {}) {
  return resolveTerraCharges([...modifierTexts, ...setupTerraChargeLines(setup)], options);
}

/**
 * Charges a cast consumes: all it holds, at most the max, gained over one cast interval (at least 1 by default).
 * `minimum: 0` (a triggered recast faster than the charge gain, Wind Rhythm) averages min(max, interval ÷ charge interval)
 * over the casts, so a cast that finds no charge gets no bonus (provisional; the creator's calc v0.3, user-provided 2026-10-13).
 */
export function terraChargesConsumed(charges, castIntervalSeconds, { minimum = 1 } = {}) {
  if (!charges || !(castIntervalSeconds > 0)) return 1;
  return Math.max(minimum, Math.min(charges.maxCharges, castIntervalSeconds / charges.chargeIntervalSeconds + (charges.onUseGain || 0)));
}

/** A Terra Charge additional line for `consumed` charges at the build's per-charge value. */
export function terraChargeLine(line, charges, consumed) {
  if (!line || !charges || (charges.isDefault && consumed === 1)) return line;
  const value = round(charges.perChargePercent * consumed);
  return { ...line, value, text: `+${charges.perChargePercent}% additional damage for every Terra Charge consumed × ${round(consumed)} consumed per cast (Max Terra Charge ${charges.maxCharges}; keyword: a cast consumes all its charges${charges.perChargeSource ? `; ${charges.perChargeSource.text}` : ""}) = +${value}%` };
}

/** A skill-hit Terra profile with its Terra Charge line for the build (recast when the Terra expires). */
export function withTerraCharges(profile, charges) {
  if (!profile?.terraCharge || !charges || charges.isDefault) return profile;
  const interval = profile.useModel?.kind === "terra" ? profile.useModel.durationSeconds || 6 : 6;
  const atInterval = terraChargesAtInterval(charges, interval);
  const consumed = terraChargesConsumed(atInterval, interval);
  // Whether the on-use charge (TERRA_CHARGE_ON_USE) adds to what the cast consumes (not when the recast already holds the max).
  const terraOnUseMoves = atInterval.onUseGain > 0 && terraChargesConsumed({ ...atInterval, onUseGain: 0 }, interval) < consumed;
  return { ...profile, terraCharge: terraChargeLine(profile.terraCharge, atInterval, consumed), terraChargesConsumed: consumed, terraOnUseMoves };
}

/**
 * @param {object} p
 * @param {object} p.state normalized planner state
 * @param {object[]} p.modifierTexts the build's lines (the Dance path traits included)
 * @param {object|null} p.resolvedMain the build's main setup
 * @param {Set<string>} p.activeNames active skill names
 * @param {number} p.maxSpellBurst Σ "+N Max Spell Burst"
 */
export function resolveDanceOfTheDeep({ state, modifierTexts = [], resolvedMain = null, activeNames = new Set(), maxSpellBurst = 0, extraChargeLines = [] } = {}) {
  const selected = state?.hero?.selectedHeroId === DANCE_OF_THE_DEEP;
  const mainIsTerra = Boolean(resolvedMain && activeNames.has(resolvedMain.name) && (resolvedMain.tags || []).includes("Terra"));
  // The Main Skill's Terra Charge: the build's lines plus its own support clauses (setupTerraChargeLines; Ground Divide).
  const charges = resolveTerraCharges([...modifierTexts, ...extraChargeLines], { maxSpellBurst });
  const paradiseLine = selected ? modifierTexts.find((line) => line.origin === "trait" && PARADISE.test(clean(line))) : null;
  const cursed = Boolean(paradiseLine && mainIsTerra);
  const blocksNonMainTerra = selected && modifierTexts.some((line) => line.origin === "trait" && /^Non-Main Terra Skill cannot deal damage$/i.test(clean(line)));
  const assumptions = !selected ? [] : [
    { id: "dance:mainTerra", value: mainIsTerra, text: `Dance of the Deep: ${mainIsTerra ? `Main Terra Skill ${resolvedMain.name} centred on you and following you, the dummy inside its area (best case: you stand within 10 m)` : "no active Main Terra Skill, so the Main Terra clauses are inactive"}; Terra skills that are not the Main Skill deal no damage.` },
    !charges.isDefault && { id: "dance:terraCharges", value: charges.maxCharges, text: `Terra Charge: +${charges.perChargePercent}% per charge consumed${charges.perChargeSource ? " (Artificial Moon)" : ""}, Max Terra Charge ${charges.maxCharges}${charges.maxSources.length ? ` (${charges.maxSources.map((item) => `${item.source}: +${item.value}`).join(", ")})` : ""}; a cast consumes all charges gained since the last cast, up to the max (keyword), at the planner's recast cadence; charge every ${round(charges.chargeIntervalSeconds)} s${charges.gash ? ` (Gash: ${charges.gash.stacks} stacks held, ${GASH.recoveryPercent}% Terra Charge Recovery Speed each)` : ""}.` },
    paradiseLine && { id: "dance:paradise", value: cursed, text: `The Paradise I Curse: the dummy is ${cursed ? "Cursed (Lv. 1 Ominous inside the Main Terra Skill's area; Ill Omen is counted separately in the Ill Omen line (best case, Elite loop); the curse does not take a curse slot: user-confirmed 2026-10-13)" : "not Cursed by it (no active Main Terra Skill)"}.` }
  ].filter(Boolean);
  return { selected, mainIsTerra, charges, cursed, paradiseSource: paradiseLine?.source || null, blocksNonMainTerra, assumptions };
}

// Activation Medium: Terra (Selena Dance traits, user answers 2026-10-13). Granted to the Main Terra Skill by Silencing
// Severance ("The Main Terra Skill is supported by Activation Medium: Terra"); Drenched Hem: "Activation Medium: Terra seals
// Life instead". TLIDB (research/tlidb-activation-medium/terra.html, captured 2026-10-13; the page is in Chinese):
//   "封印 20% 魔力" — Seals 20% Mana;
//   "25 米内存在敌人且 地面蓄能 层数达到上限时，触发被辅助地面技能，同时 -30% 移动速度，持续 2 秒" — when an enemy is within 25 m
//     and Terra Charge stacks reach the maximum, triggers the supported Terra skill, and −30% Movement Speed for 2 s;
//   "被辅助技能额外 +30% 伤害" — +30% additional damage for the supported skill.
// This matches the user's reading (user-stated 2026-10-13). Readings:
// - the +30% is a generic "additional damage for the supported skill" line, so it reaches the skill's hits and its own DoT
//   (the support rules; sourced text, the DoT reach by the support rule);
// - the trigger needs no use time (manual "Trigger": triggered skills act without the casting action); a cast fires each time
//   the charges refill to max, every Max Terra Charge × charge interval, and consumes them all (the dummy stands within 10 m);
// - the seal is a flat 20% of Mana, or of Life with Drenched Hem. Sealed Mana Compensation does not reduce it
//   (user-confirmed 2026-10-13).
export const ACTIVATION_MEDIUM_TERRA = Object.freeze({ additionalPercent: 30, sealPercent: 20, triggerMeters: 25, movementSpeedPercent: -30, movementSeconds: 2, source: "TLIDB Activation_Medium_Terra (2026-10-13)" });
const AM_TERRA_GRANT = /^The Main Terra Skill is supported by Activation Medium: Terra$/i;
const AM_TERRA_LIFE = /^Activation Medium: Terra seals Life instead$/i;

/** Activation Medium: Terra on the Main Terra Skill (Silencing Severance), and whether its seal is Life (Drenched Hem). */
export function resolveActivationMediumTerra({ modifierTexts = [], mainIsTerra = false } = {}) {
  const grant = modifierTexts.find((line) => line.origin === "trait" && AM_TERRA_GRANT.test(clean(line)));
  const life = modifierTexts.find((line) => line.origin === "trait" && AM_TERRA_LIFE.test(clean(line)));
  const active = Boolean(grant && mainIsTerra);
  return { ...ACTIVATION_MEDIUM_TERRA, active, granted: Boolean(grant), grantSource: grant?.source || null, sealsLife: Boolean(life), sealSource: life?.source || null };
}

/** The Main Terra Skill's trigger interval under Activation Medium: Terra: the time for its charges to refill to the max. */
export function activationMediumTerraInterval(charges) {
  return Math.max(1e-9, (charges?.maxCharges || 1) * (charges?.chargeIntervalSeconds || TERRA_CHARGE_INTERVAL_SECONDS));
}

// Activation Medium: Wind Rhythm on a recast Terra DoT (Frost Terra; TLIDB progression: "Always attempts to trigger the supported
// skill on the closest enemy within 25m. Cooldown: 0.5 s" at T0, "X% of the bonuses and additional bonuses for Cast Speed is also
// applied to the Cooldown Recovery Speed of this Support Skill and the supported skill"). The Terra is recast at each trigger
// (no use time: a triggered skill acts without the casting action), every
//   cooldown ÷ ((1 + Σ Cooldown Recovery Speed + share × Σ Cast Speed) × Π(1 + additional Cast Speed) × Π(additional CDR))
// (src/trigger-interval.js castSpeedScaledTriggerInterval; the build creator's calculator, DonTheCrown's "Selena DoT Stat Calc"
// v0.3, user-provided 2026-10-13, models it so). The Cast Speed is the planner's own for the skill (src/scorching-beam-cast-rate.js
// with the skill's setup). Provisional: the share reading and the recast at every trigger (a cast that finds no Terra Charge still
// recasts; terraChargesConsumed with minimum 0). Triggered only, so "-80% additional damage for manually used Supported Skill"
// does not apply. Activation Medium: Terra (Silencing Severance) switches the Main Skill's other Activation Mediums off.
/**
 * @param {object} p.setup the Terra setup (its resolved supportEffects)
 * @param {object} p.castRate src/scorching-beam-cast-rate.js output for the setup ({ baseRate, increasedPercent, castsPerSecond })
 * @param {object[]} p.modifierTexts the build's lines ("±X% [additional] Cooldown Recovery Speed")
 * @returns {null|{ intervalSeconds, castsPerSecond, cooldownSeconds, share, castIncreasedPercent, castAdditionalFactor, cooldownRecoveryPercent, cooldownAdditionalFactor, cooldownSources, source, text }}
 */
export function windRhythmTerraTrigger({ setup = null, castRate = null, modifierTexts = [] } = {}) {
  // The shared Activation Medium DoT trigger (src/trigger-interval.js activationMediumDotTrigger), Wind Rhythm only; the Terra's
  // Split cooldown is its Terra Charge gain, not a use cooldown, so nothing caps the trigger rate here.
  const wind = activationMediumDotTrigger({ setup, castRate, cooldownLines: buildCooldownRecoveryLines(modifierTexts), cooldownSeconds: 0 });
  if (!wind?.castSpeedScaled) return null;
  const { intervalSeconds, share, castIncreasedPercent, castAdditionalFactor, cooldownRecoveryPercent, cooldownAdditionalFactor } = wind;
  const text = `${setup.name}: triggered by Activation Medium: Wind Rhythm every ${round(intervalSeconds)} s = ${wind.cooldownSeconds} s ÷ ((1 + ${round(cooldownRecoveryPercent)}% Cooldown Recovery Speed + ${round(share * 100)}% × ${round(castIncreasedPercent)}% Cast Speed) × ${round(castAdditionalFactor)} additional Cast Speed${cooldownAdditionalFactor !== 1 ? ` × ${round(cooldownAdditionalFactor)} additional Cooldown Recovery Speed` : ""}) (no use time; the creator's calc v0.3, user-provided 2026-10-13; provisional); ${round(1 / intervalSeconds)} casts/s. Triggered only, so the manual-use penalty does not apply.`;
  // Wind Rhythm "Always attempts to trigger": the medium starts ready, so the first recast lands at engagement (user decision
  // 2026-10-22; src/support-effects.js startsReady).
  return { intervalSeconds, castsPerSecond: 1 / intervalSeconds, cooldownSeconds: wind.cooldownSeconds, share, castIncreasedPercent, castAdditionalFactor, cooldownRecoveryPercent, cooldownAdditionalFactor, cooldownSources: wind.cooldownSources, source: wind.source, text, startsReady: true };
}

/** The build's "±X% [additional] Cooldown Recovery Speed" lines ({ source, text, value, additional }). */
export function buildCooldownRecoveryLines(modifierTexts = []) {
  return modifierTexts.map((line) => ({ line, parsed: classifyHitLine(line.text, { targetCursed: false }) })).filter(({ parsed }) => parsed?.kind === "cooldownRecovery")
    .map(({ line, parsed }) => ({ source: line.source, text: line.text, value: parsed.value * (line.multiplier ?? 1), additional: parsed.additional }));
}

// The Cycle I Resist (TLIDB Dance_of_the_Deep, research/tlidb-dance-of-the-deep.html; game affixes 480006336 / 591569216):
//   "25% of the increase/decrease on Critical Strike Rating is also applied to Terra Skill Duration" (attr 48021 increased →
//     34021 increased, tagged Terra) and
//   "When casting a Terra Skill, if the previous Main Terra Skill hasn't ended, Reaps Damage Over Time equal to 6/7/8/9/10% of
//     the previous skill's remaining duration from enemies within this skill's Area" (node 631: reapTime = p0 × remaining ÷ 100,
//     calcReapTimeIncress: Reaping Duration applies). Neither record has a cooldown condition node (254 / 206; checked
//     2026-10-13 in tools/bin/reverse-engineering/affix-catalog-2026-10-09.json: 591569216 carries trigger 1000069 and nodes
//     4, 631, 2320 (checkCD false), 301; 480006336 has no nodes).
// No internal cooldown (user, 2026-10-13: the tooltip shows none; replaces the earlier user-stated 0.5 s): it Reaps on every
// qualifying recast while the previous Main Terra lasts. The reaping model still floors any Reap interval at the ~30 Hz server
// tick (src/reaping-model.js REAP_TICK_SECONDS).
// User-confirmed (2026-10-13): every general increase or reduction to Critical Strike Rating counts toward the 25% (all
// "±X% … Critical Strike Rating" lines, negative ones included, e.g. Control Spell's "−50% … for the supported skill" on the
// Main Terra); only lines scoped to another skill type or to Minions are left out. Flat "N Critical Strike Rating" lines are
// not an increase / decrease (game: the share reads increased rating, attr 48021 mod 3).
// User-confirmed (2026-10-13): the Reap settles every DoT active on the dummy (all ailments and skill DoTs), like the other
// Reaping sources (src/reaping-model.js; the source carries no dotKeys).
const CYCLE_REAP = /^When casting a Terra Skill, if the previous Main Terra Skill hasn't ended, Reaps Damage Over Time equal to (\d+(?:\.\d+)?)% of the previous skill's remaining duration from enemies within this skill's Area$/i;
const CYCLE_DURATION = /^(\d+(?:\.\d+)?)% of the increase\/decrease on Critical Strike Rating is also applied to Terra Skill Duration$/i;
const TERRA_DURATION = /^\+(\d+(?:\.\d+)?)% Terra Skill Duration$/i;
const CRIT_RATING = /^([+-]\d+(?:\.\d+)?)% (?:(.+?) )?Critical Strike Rating(?: for the supported skill)?$/i;

/** Whether a "±X% <scope> Critical Strike Rating" scope reaches a skill with `tags` (no scope, or only words the skill carries). */
export function critRatingScopeReaches(scope, tags = []) {
  if (!scope) return true;
  if (/\bMinions?\b/i.test(scope)) return false;
  const own = new Set((tags || []).map((tag) => String(tag).toLowerCase()));
  // "Attack and Spell": either part reaching the skill is enough; "Cold Spell": every word must.
  return String(scope).split(/\s+and\s+/i).some((part) => {
    const words = part.replace(/\bSkills?\b/gi, " ").split(/\s+/).map((word) => word.trim()).filter(Boolean);
    return words.length > 0 && words.every((word) => own.has(word.toLowerCase()));
  });
}

/**
 * The Cycle I Resist Reap as a Reaping source (src/reaping-model.js extraSources, trigger "skill use").
 * Per recast at interval Δt: the previous Main Terra has T − Δt left (T = base duration × (1 + Σ Terra Skill Duration %),
 * the crit share included); the Reap settles roll% × (T − Δt) of the DoT, before Reaping Duration (the reaping model applies
 * it). No internal cooldown: every recast Reaps (user, 2026-10-13: the tooltip shows none).
 * @returns {{ active, reap, terraDurationSeconds, ... } | null} null when the trait is not selected
 */
export function resolveCycleResist({ modifierTexts = [], mainIsTerra = false, castIntervalSeconds = 0, baseTerraSeconds = 6, mainTags = [], mainSupportClauses = [] } = {}) {
  const traits = modifierTexts.filter((line) => line.origin === "trait");
  const reapLine = traits.find((line) => CYCLE_REAP.test(clean(line)));
  if (!reapLine) return null;
  const sharePercent = num(traits.map((line) => clean(line).match(CYCLE_DURATION)).find(Boolean)?.[1] ?? 0);
  const durationLines = modifierTexts.filter((line) => TERRA_DURATION.test(clean(line))).map((line) => ({ source: line.source, text: clean(line), value: num(clean(line).match(TERRA_DURATION)[1]) * (line.multiplier ?? 1) }));
  // "the increase/decrease on Critical Strike Rating" (user-confirmed 2026-10-13): every ±X% Critical Strike Rating line that
  // reaches the Main Terra (no scope, or a scope of its own tags such as Spell / Cold / Terra), and the Main Terra's own support
  // rating lines ("for the supported skill", Control Spell's −50%). Minion lines and other skill types are left out.
  const critLines = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const match = clean(line).match(CRIT_RATING);
    if (!match || /for the supported skill$/i.test(clean(line))) continue;
    if (!critRatingScopeReaches(match[2], mainTags)) continue;
    critLines.push({ source: line.source, text: clean(line), value: num(match[1]) * (line.multiplier ?? 1) });
  }
  for (const clause of mainSupportClauses) {
    if (clause.family !== "crit" || clause.kind !== "ratingPercent" || !Number.isFinite(clause.value)) continue;
    critLines.push({ source: clause.source, text: clause.text, value: clause.value });
  }
  const critIncreasePercent = critLines.reduce((sum, item) => sum + item.value, 0);
  const durationPercent = durationLines.reduce((sum, item) => sum + item.value, 0) + critIncreasePercent * sharePercent / 100;
  const terraDurationSeconds = baseTerraSeconds * (1 + durationPercent / 100);
  const rollPercent = num(clean(reapLine).match(CYCLE_REAP)[1]);
  const interval = castIntervalSeconds > 0 ? castIntervalSeconds : Infinity;
  const recastsPerReap = Number.isFinite(interval) ? 1 : Infinity;
  const reapIntervalSeconds = interval;
  const remainingSeconds = Math.max(0, terraDurationSeconds - interval);
  const baseReapSeconds = rollPercent / 100 * remainingSeconds;
  const active = Boolean(mainIsTerra && baseReapSeconds > 0 && Number.isFinite(reapIntervalSeconds));
  const text = `The Cycle I Resist: every ${round(reapIntervalSeconds)} s (on every Main Terra recast; no internal cooldown, user 2026-10-13: the tooltip shows none) Reaps ${rollPercent}% × ${round(remainingSeconds)} s remaining (Terra ${round(terraDurationSeconds)} s = ${baseTerraSeconds} s × (1 + ${round(durationPercent)}% Terra Skill Duration, ${sharePercent}% of +${round(critIncreasePercent)}% Critical Strike Rating included) − ${round(interval)} s) = ${round(baseReapSeconds)} s of Damage Over Time before Reaping Duration`;
  return {
    active, rollPercent, sharePercent, critIncreasePercent, critLines, durationLines, durationPercent, terraDurationSeconds, castIntervalSeconds: interval,
    recastsPerReap, reapIntervalSeconds, remainingSeconds, baseReapSeconds, text, source: reapLine.source,
    // No dotKeys: the Reap settles every DoT on the dummy (user-confirmed 2026-10-13).
    reap: active ? { source: `${reapLine.source}: The Cycle I Resist`, trigger: "skill use", baseDurationSeconds: baseReapSeconds, baseRecoverySeconds: reapIntervalSeconds, usesPerSecond: 1 / reapIntervalSeconds, cycleResist: true, note: `${text}; it settles every DoT on the dummy (user-confirmed 2026-10-13)` } : null
  };
}

/** Whether Dance of the Deep's "Non-Main Terra Skill cannot deal damage" stops this setup's damage. */
export function danceBlocksSetup(dance, setup, resolvedMain) {
  return Boolean(dance?.blocksNonMainTerra && (setup?.tags || []).includes("Terra") && setup?.setupKey !== resolvedMain?.setupKey);
}
