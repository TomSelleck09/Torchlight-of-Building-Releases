import { escapeHtml } from "./html.js";
import { normalizePercentageText } from "./percentage-text.js";
import { barrierShieldBonus, barrierShieldValue } from "./barrier-sources.js";
import { characterStatTotals, heldConditionalPoolExtra } from "./character-stats.js";
import { formatRecountInteger, toggleNumberMarkup } from "./dummy-recount-panel.js";
import { blockWithAegisOfFire } from "./block-model.js";
import { aegisOfFireState } from "./aegis-of-fire.js";
import { identicalResistancePairs } from "./line-conditions.js";
import { DAMAGE_TAKEN_ATTRIBUTES, limitDamageTakenFactor, MAX_BLOCK_CHANCE_PERCENT } from "./game-attribute-defaults.js";

// Effective HP banner for the Stats page (src/stat-sheet.js): usable Life + Energy Shield (+ Guard
// Barrier) divided by the expected fraction of a reference hit that reaches the pools, per damage
// type, plus an ailment / crowd-control immunity checklist read from the build's modifier lines.
//
// Sourced rules (reference data pages read 2026-10-11; the wiki marks them "based on beta testing data"):
// - Life: "Players have 50 Max Life by default", "+13 for every level gained". Mana: 40, +5 per level.
//   UE_game.log 2026-10-10 shows Total Life 1259 / Total Mana 505, i.e. level 94 by these rules.
// - Energy Shield: none by default; "deducted before Life when taking damage".
// - Defense: "The sum of Armor, Evasion, and Energy Shield". How "+X% Defense" applies is not stated;
//   it is treated here as increased % on each of the three (provisional).
// - Armor: DR = Armor / (0.9 × Armor + 3000 + 300 × min(enemy level, 90)); 60% of the reduction applies
//   to non-Physical damage; cap 80%; "the game uses double the Armor value for the reduction calculation".
// - Evasion: 0 by default, +2 per level; chance = 1 − 1.15 × Accuracy / (Accuracy + 0.5 × Evasion^0.75);
//   cap 75%; enemy Accuracy "ranging from 130 to 680" by level (no table: interpolated here, provisional);
//   "Evasion reduces Spell Damage by 40% by default": an evaded spell hit still lands but deals 40% less
//   (user-confirmed reference data reading, 2026-10-11), so spell damage avoided = spell evade chance × 40%. The game panel's
//   Spell Evasion Chance (attr 40402) is the same formula at 60% of the Evasion rating: UE_game.log, Frost Terra v2
//   character, Evasion 2356.9 → Attack 9.339136810607% and Spell 2.7911688391322%, both exact with Accuracy 630.
// - Block: Block Ratio default 30%, max 60% (up to 80%); chance capped at 100% (src/block-model.js).
// - Resistance: effective = min(current, max); max 60% by default, cap 90% (src/resistance-model.js).
// - Barrier (reference data Barrier help): a Shield of 20% of Max Life and Max Energy Shield absorbing 50% of Hit Damage; one at a time.
//   Sources: the Guard support, and "chance to gain a Barrier for every N m you move" while moving (the movement best case).
//   "+X% Barrier Shield" lines raise the Shield (game attrs 42200 / 42201: Barrier Shield Bonus / Additional Bonus).
// - Damage taken conversion (reference data Damage Type Conversion help): the type changes before Damage Mitigation, so the converted
//   share takes the new type's mitigation; sources stack, and past 100% the total is redistributed by each source's share;
//   it applies to all forms of damage (hits and damage over time).
// - "+2 Max Energy Shield per 5 Intelligence" (Magister): linear, no step (game affix 101140081, node 114 conversion).
// Not sourced: character level (assumed), chance-to-avoid-damage cap.

export const EHP_DEFAULTS = Object.freeze({ characterLevel: 100, enemyLevel: 85 });
export const DAMAGE_TYPES = ["Physical", "Fire", "Cold", "Lightning", "Erosion"];
const ELEMENTAL = ["Fire", "Cold", "Lightning"];

const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function baseLife(level) { return 50 + 13 * (clamp(level, 1, 100) - 1); }
export function baseMana(level) { return 40 + 5 * (clamp(level, 1, 100) - 1); }
export function baseEvasion(level) { return 2 * (clamp(level, 1, 100) - 1); }

/**
 * reference data Armor: reduction fraction for a hit from an enemy of `enemyLevel`; `physical` false applies the non-Physical
 * effective rate (60% by default; Iron Fortification adds "+2% Armor Effective Rate against non-Physical Damage").
 */
export function armorReduction(armor, enemyLevel, { physical = true, doubleArmor = true, nonPhysicalRate = 0.6 } = {}) {
  const effective = Math.max(0, armor) * (doubleArmor ? 2 : 1);
  if (effective <= 0) return 0;
  const reduction = Math.min(0.8, effective / (0.9 * effective + 3000 + 300 * Math.min(enemyLevel, 90)));
  return physical ? reduction : reduction * nonPhysicalRate;
}

/** Enemy Accuracy by level: reference data gives only the 130–680 range, so this is a linear interpolation (provisional). */
export function enemyAccuracy(enemyLevel) { return 130 + (680 - 130) * (clamp(enemyLevel, 1, 100) - 1) / 99; }

/** The share of the Evasion rating that counts against spells (game panel attr 40402, exact on the Frost Terra v2 snapshot). */
export const SPELL_EVASION_RATING_SHARE = 0.6;

/**
 * reference data Evade: chance (0–0.75) to evade a hit. With { spell: true } returns the share of spell damage avoided
 * instead: the evade chance at 60% of the rating (the game's Spell Evasion Chance) × 0.4 (an evaded spell still
 * deals 60%). `accuracy` overrides the enemy Accuracy (the game panel uses 630).
 */
export function evadeChance(evasion, enemyLevel, { spell = false, accuracy } = {}) {
  const rating = Math.max(0, evasion) * (spell ? SPELL_EVASION_RATING_SHARE : 1);
  if (rating <= 0) return 0;
  const enemy = Number.isFinite(accuracy) ? accuracy : enemyAccuracy(enemyLevel);
  const chance = clamp(1 - 1.15 * enemy / (enemy + 0.5 * rating ** 0.75), 0, 0.75);
  return spell ? chance * 0.4 : chance;
}

const emptyStat = { flat: 0, increased: 0, additional: 1, gearTotal: 0, sources: [] };
/** A resource pool (Max Life / Mana / …) from the stat-sheet totals: (base + flat + gear) × (1 + increased) × additional. */
export function resourcePool(totals, key, base, options = {}) { return pool(totals, key, base, options); }
// `extra` adds defence-view contributions that are not plain stat lines: flat (per-attribute lines, Aura buffs, a skill's
// "+N Armor while the skill lasts"), increased (a per-Blessing-stack "+X% Armor") and additional factors (Aura "additional" lines),
// each with its source text.
function pool(totals, key, base, { defense = false, baseLabel = "", extra = null } = {}) {
  const stat = totals.byKey[key] || emptyStat;
  const defenseStat = defense ? totals.byKey.defense || emptyStat : emptyStat;
  const increased = stat.increased + defenseStat.increased + (extra?.increased || []).reduce((sum, item) => sum + item.value, 0);
  const extraFlat = (extra?.flat || []).reduce((sum, item) => sum + item.value, 0);
  const extraAdditional = (extra?.additional || []).reduce((product, item) => product * (1 + item.value / 100), 1);
  const flat = stat.flat + extraFlat;
  const additional = stat.additional * extraAdditional;
  // "Your Max Energy Shield is fixed at 0" (game affix 103360004, node 336 on attribute 1601): the fixed value, whatever the lines add.
  const fixed = Number.isFinite(stat.fixed) ? stat.fixed : null;
  const value = fixed !== null ? Math.max(0, fixed) : Math.max(0, (base + flat + stat.gearTotal) * (1 + increased / 100) * additional);
  const sources = [
    ...(base ? [{ source: baseLabel, text: `${base} base`, value: base }] : []),
    ...stat.sources.map((item) => ({ source: item.source, text: item.text })),
    ...[...(extra?.flat || []), ...(extra?.increased || []), ...(extra?.additional || [])].map((item) => ({ source: item.source, text: item.text })),
    ...defenseStat.sources.map((item) => ({ source: item.source, text: `${item.text} (Defense: Armor, Evasion and Energy Shield)` }))
  ];
  return { key, base, flat: round(flat), gear: round(stat.gearTotal), increased: round(increased), additional: round(additional), value: round(value), ...(fixed !== null ? { fixed } : {}), sources };
}

// All In (support, reference data 2026-10-14; Lv1 20% … Lv20 29.5% … Lv40 35.7%): "When casting the supported skill, gains the buff: X%
// additional Evasion. It drops to 0 gradually within 4s". A conditional layer, time-averaged (provisional): the buff starts at
// X% on each cast and falls linearly to 0 over T s, so with casts every P s (the supported skill's modeled use rate, e.g. Frost
// Shield triggered by Activation Medium: Multistrike and capped by its cooldown) its average is X × T ÷ (2P) when P ≥ T, else
// X × (1 − P ÷ (2T)) (recast before it runs out). A supported skill with no modeled use rate is listed and left out.
const DECAYING_EVASION = /^\+?(\d+(?:\.\d+)?)% additional Evasion\. It drops to 0 gradually within (\d+(?:\.\d+)?)\s*s$/i;
export function decayingEvasionLayers(planner) {
  const layers = [], notes = [];
  const activeNames = planner.activation?.activeNames || new Set();
  for (const setup of planner.activation?.setups || []) {
    if (setup.enabled === false || !activeNames.has(setup.name)) continue;
    const clauses = (planner.supportEffects?.[setup.setupKey] || setup.supportEffects)?.clauses || [];
    for (const clause of clauses) {
      const match = String(clause.text || "").replace(/\s+/g, " ").trim().match(DECAYING_EVASION);
      if (!match) continue;
      const value = Number(match[1]), seconds = Number(match[2]);
      const hit = (planner.skillHits || []).find((item) => item.setupKey === setup.setupKey && item.modeled);
      const period = hit?.rate?.usesPerSecond > 0 ? 1 / hit.rate.usesPerSecond : null;
      if (!period) { notes.push(`${setup.name}: ${clause.support} (${clause.text}) — no modeled use rate for ${setup.name}, so its Evasion buff is left out`); continue; }
      const average = period >= seconds ? value * seconds / (2 * period) : value * (1 - period / (2 * seconds));
      layers.push({ source: `${setup.name}: ${clause.support}`, text: `+${round(average, 4)}% additional Evasion on average (+${value}% on each cast, falling to 0 over ${seconds} s; a cast every ${round(period, 4)} s: ${period >= seconds ? `${value} × ${seconds} ÷ (2 × ${round(period, 4)})` : `${value} × (1 − ${round(period, 4)} ÷ (2 × ${seconds}))`}; time-averaged conditional layer, provisional)`, value: round(average, 6), conditional: true });
    }
  }
  return { layers, notes };
}

// "+2 Max Energy Shield per 5 Intelligence" (Magister): game affix 101140081 is a node 114 conversion (Intelligence → Max
// Energy Shield, p1 per p0, no step and no limit), so it is linear. The same shape for Life / Mana and the other attributes.
const PER_ATTRIBUTE = /^\+?(\d+(?:\.\d+)?) Max (Life|Energy Shield|Mana) per (\d+(?:\.\d+)?) (Strength|Dexterity|Intelligence)$/i;
const POOL_KEY = { life: "maxLife", "energy shield": "maxEnergyShield", mana: "maxMana" };
export function perAttributePoolLines(modifierTexts, totals) {
  const out = { maxLife: [], maxEnergyShield: [], maxMana: [] };
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const match = stripName(normalizePercentageText(String(line.text || "")).replace(/\s+/g, " ").trim()).match(PER_ATTRIBUTE);
    if (!match) continue;
    const attribute = totals.byKey[match[4].toLowerCase()]?.value || 0;
    const multiplier = Number.isFinite(line.multiplier) ? line.multiplier : 1;
    const value = attribute * Number(match[1]) / Number(match[3]) * multiplier;
    out[POOL_KEY[match[2].toLowerCase()]].push({ source: line.source, text: `${line.text} → ${round(value, 3)} (${round(attribute, 2)} ${match[4]}, linear)`, value });
  }
  return out;
}

// Defence effects an active Aura's buff carries (planner.aura.entries[].effectiveEffects, already scaled by that Aura's Aura
// Effect): Precise: Elemental Resistance's "-14% additional Elemental Damage taken" and "+15% chance to avoid Elemental Ailments",
// and the Evasion / Energy Shield / Armor keys src/aura-damage.js marks as defence. Its Elemental Resistance is already in the
// Resistances card (src/resistance-model.js).
const AURA_TAKEN = /^additional(Physical|Fire|Cold|Lightning|Erosion|Elemental|Spell|Attack)?DamageTakenPercent$/;
const AURA_POOLS = { evasion: ["evasion", "flat", "Evasion"], additionalEvasionPercent: ["evasion", "additional", "additional Evasion"], maxEnergyShield: ["maxEnergyShield", "flat", "Max Energy Shield"], additionalMaxEnergyShieldPercent: ["maxEnergyShield", "additional", "additional Max Energy Shield"], armor: ["armor", "flat", "Armor"], additionalArmorPercent: ["armor", "additional", "additional Armor"] };
function auraDefense(planner) {
  const taken = [], checklistLines = [], pools = { evasion: { flat: [], additional: [] }, maxEnergyShield: { flat: [], additional: [] }, armor: { flat: [], additional: [] } };
  for (const entry of planner.aura?.entries || []) {
    const source = `${entry.name} (Aura)`;
    for (const [key, raw] of Object.entries(entry.effectiveEffects || {})) {
      const value = Number(raw);
      if (!Number.isFinite(value) || !value) continue;
      const scoped = key.match(AURA_TAKEN);
      if (scoped) {
        const scope = scoped[1] || "All";
        const text = `${value > 0 ? "+" : ""}${round(value, 4)}% additional ${scoped[1] ? `${scoped[1]} ` : ""}Damage taken`;
        taken.push({ source, text, percent: round(value, 4), scope, condition: "", active: true, assumption: null, unmodeled: false, aura: true });
      } else if (key === "elementalAilmentAvoidancePercent") {
        checklistLines.push({ text: `+${round(value, 4)}% chance to avoid Elemental Ailments`, source, origin: "aura", multiplier: 1 });
      } else if (AURA_POOLS[key]) {
        const [pool, bucket, label] = AURA_POOLS[key];
        pools[pool][bucket].push({ source, text: `${value > 0 ? "+" : ""}${round(value, 4)}${bucket === "additional" ? "%" : ""} ${label}`, value });
      }
    }
  }
  return { taken, checklistLines, pools };
}

/**
 * The Max Energy Shield pool's contributions beyond its stat lines: the per-attribute lines ("+2 Max Energy Shield per 5 Intelligence",
 * game affix 101140081, node 114, linear) and the active Auras' held Energy Shield buffs (Precise: Energy Fortress's flat and additional
 * Max Energy Shield, at their Aura Effect). One pool for every reader: the defence view below and the planner's combat stats (Barrier
 * Burst's Shield, the Sage and Rehan inputs; 10 T claim audit G3b, 2026-11-09: the town panel's Energy Shield 40,093 needs both).
 * With `lineEffects` (the line resolver's result) it also holds the held conditional Max Energy Shield lines no engine reads, such as
 * "+16% additional Max Energy Shield while moving" under the Movement group (src/character-stats.js heldConditionalPoolExtra; G3d,
 * 2026-11-09); `skipTownHeld` leaves out the town-held ones a pool built on characterStatTotals(planner) already counts.
 * @param {{ modifierTexts?: object[], totals: object, auraEntries?: object[], lineEffects?: object, skipTownHeld?: boolean }} input
 * @returns {{ flat: { source, text, value }[], increased: { source, text, value }[], additional: { source, text, value }[] }} the pool's `extra`
 */
export function energyShieldPoolExtra({ modifierTexts = [], totals, auraEntries = [], lineEffects = null, skipTownHeld = false } = {}) {
  const aura = auraDefense({ aura: { entries: auraEntries } });
  const held = lineEffects ? heldConditionalPoolExtra(lineEffects, "maxEnergyShield", { skipTownHeld, modifierTexts }) : { flat: [], increased: [], additional: [] };
  return { flat: [...perAttributePoolLines(modifierTexts, totals).maxEnergyShield, ...aura.pools.maxEnergyShield.flat, ...held.flat], increased: held.increased, additional: [...aura.pools.maxEnergyShield.additional, ...held.additional] };
}

// "+X% Barrier Shield" lines and the Shield value: src/barrier-sources.js (shared with Barrier Burst, 2026-10-26).

// Barrier from movement: "100% chance to gain a Barrier for every 5 m you move" (Perishing Inferno Flame Ring). The planner's
// movement condition is the best case (moving constantly, user rule 2026-10-10), so a Barrier is up whenever moving holds.
function movementBarrierSources(modifierTexts, moving) {
  const sources = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const match = stripName(normalizePercentageText(String(line.text || "")).replace(/\s+/g, " ").trim()).match(/^(\d+(?:\.\d+)?)% chance to gain a Barrier for every ([\d.]+) ?m you move$/i);
    if (match) sources.push({ source: line.source, trigger: `${match[1]}% chance per ${match[2]} m moved (moving: best case)`, available: Boolean(moving), movement: true });
  }
  return sources;
}

// Hit-damage-taken lines: "-15% additional damage taken while Blur is active". Ailment / Damage Over Time
// lines do not match (they are not hit damage). Conditions map to the planner's combat conditions.
const TAKEN = /^([+-]\d+(?:\.\d+)?)\s*% additional (?:(Physical|Fire|Cold|Lightning|Erosion|Elemental|Spell|Attack|Hit) )?damage taken(?:\s+(.+))?$/i;
// A "Changes the base effect of <keyword> to: …" prefix is not a name label: the body is that keyword's new effect (Conductive:
// Numbed's +11% Lightning Damage taken per stack lands on enemies the build Numbs, src/combat-states.js), never the player's own.
const stripName = (text) => text.replace(/^\[[^\]]+\]\s*/, "").replace(/^(?:[A-Z][\w' ]+: )+(?=[+-]?\d|Immune)/, (prefix) => /\bbase effect of\b/i.test(prefix) ? prefix : "");

function takenCondition(condition, context) {
  if (!condition) return { active: true };
  if (/^by\b/i.test(condition)) return null; // "+20% additional damage taken by enemies on the Tide"
  if (/while Blur is active/i.test(condition)) return { active: Boolean(context.blur), assumption: "Blur active" };
  if (/at Low Life/i.test(condition)) return { active: Boolean(context.lowLife), assumption: "Low Life (after sealing)" };
  if (/at Low Mana/i.test(condition)) return { active: Boolean(context.lowMana), assumption: "Low Mana (after sealing)" };
  if (/while channeling|Channeled Skill recently/i.test(condition)) return { active: Boolean(context.channeling), assumption: "Channeling the main skill" };
  if (/from Cursed enemies/i.test(condition)) return { active: Boolean(context.cursing), assumption: "Attacker is Cursed by the build" };
  if (/for every type of Elemental Damage recently received/i.test(condition)) return { active: true, perType: "Elemental", assumption: "One Elemental type received (the reference hit)" };
  if (/only 1 enem(?:y|ies) Nearby|exactly one enemy/i.test(condition)) return { active: true, assumption: "A single nearby enemy (dummy)" };
  // Double Rainbow's damage-taken twin (game recipes 16450405 / 4702925): one additional write per pair of equal uncapped
  // resistance totals, as its damage line (src/line-conditions.js identicalResistancePairs).
  const identical = condition.match(/^for every 2 types of (Elemental )?Resistance with identical values \(multiplies\)$/i);
  if (identical) {
    const { pairs } = identicalResistancePairs(context.resistanceTotals || {}, { elementalOnly: Boolean(identical[1]) });
    return { active: pairs > 0, power: pairs, assumption: `${pairs} equal ${identical[1] ? "Elemental " : ""}Resistance pair${pairs === 1 ? "" : "s"} (uncapped totals)` };
  }
  // Azure Gunslinger (src/pure-heart.js): Pure Heart held while an Attack Mobility Skill is used constantly (best case).
  if (/^when Pure Heart is active$/i.test(condition)) return { active: Boolean(context.pureHeart), assumption: "Pure Heart active (Attack Mobility Skill used constantly)" };
  return { active: false, unmodeled: true };
}

/** Additional hit-damage-taken layers from the build's modifier lines, each with scope and activity. */
export function collectDamageTakenLayers(modifierTexts = [], context = {}) {
  const layers = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const clean = stripName(normalizePercentageText(String(line.text || "")).replace(/\s+/g, " ").trim());
    const match = clean.match(TAKEN);
    if (!match) continue;
    // "[Stealth Stab] -15% ... while Blur is active +25% additional damage for 3 s after Blur ends": keep the first clause.
    const condition = (match[3] || "").split(/\s(?=[+-]\d)/)[0].trim();
    const status = takenCondition(condition, context);
    if (!status) continue;
    const single = Number(match[1]) * (Number.isFinite(line.multiplier) ? line.multiplier : 1);
    const percent = status.power > 1 ? (Math.pow(1 + single / 100, status.power) - 1) * 100 : single;
    const scope = match[2] ? match[2][0].toUpperCase() + match[2].slice(1).toLowerCase() : "All";
    layers.push({ source: line.source, text: line.text, percent: round(percent), scope, condition, active: status.active, assumption: status.assumption || null, unmodeled: Boolean(status.unmodeled) });
  }
  return layers;
}

// Damage over time (game data, src/data/affix-index-ss13.generated.js): every damage-taken line writes attr 5720.
//   "#% additional damage over time taken"  mod 4 (additional, multiplies), tag 5000004 (Damage Over Time)
//   "#% additional ignite damage taken"     mod 4 (additional), tag 5100003 (Ignite)
//   "#% wilt damage taken"                  mod 3 (increased: lines of one ailment sum), tag 5100007 (Wilt)
//   "#% trauma damage taken"                mod 3 (increased), tag 5100006 (Trauma)
const DOT_TAKEN = /^([+-]\d+(?:\.\d+)?)\s*% additional Damage Over Time taken(?:\s+(.+))?$/i;
const AILMENT_TAKEN = /^([+-]\d+(?:\.\d+)?)\s*% (additional )?(Ignite|Trauma|Wilt) Damage taken(?:\s+(.+))?$/i;
/** The damaging ailment of each damage type (reference data Ailment page); Cold and Lightning ailments deal no damage. */
export const DOT_AILMENT_BY_TYPE = Object.freeze({ Physical: "Trauma", Fire: "Ignite", Erosion: "Wilt" });

function dotCondition(condition, context, pools) {
  const threshold = condition.match(/^when (?:you have|having) at least (\d+(?:\.\d+)?) (Max Energy Shield|Armou?r|Evasion)$/i);
  if (threshold) {
    const key = /Energy Shield/i.test(threshold[2]) ? "energyShield" : /Evasion/i.test(threshold[2]) ? "evasion" : "armor";
    const have = pools[key] || 0;
    return { active: have >= Number(threshold[1]), assumption: `${threshold[2]} ${formatRecountInteger(have)} vs ${threshold[1]} required` };
  }
  // Absolve My Sin: "-1% additional Damage Over Time taken for every +2% Block Ratio owned". Game affix 663380864 is a node 114
  // conversion from the Block Ratio (no step, no limit), so it is linear in the Block Ratio the Effective HP block uses
  // (including the 30% base: provisional, the field read is the Block Ratio total).
  const perRatio = condition.match(/^for every \+?(\d+(?:\.\d+)?)% Block Ratio owned$/i);
  if (perRatio && Number.isFinite(pools.blockRatio)) {
    const steps = pools.blockRatio / Number(perRatio[1]);
    return { active: steps > 0, factor: steps, assumption: `Block Ratio ${round(pools.blockRatio, 2)}% ÷ ${perRatio[1]} = ${round(steps, 3)} (linear, game affix 663380864)` };
  }
  return takenCondition(condition, context);
}

/** "Damage Over Time taken" and Ignite / Trauma / Wilt damage-taken lines; hit-only lines are collectDamageTakenLayers'. */
export function collectDotTakenLayers(modifierTexts = [], context = {}, pools = {}) {
  const layers = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const clean = stripName(normalizePercentageText(String(line.text || "")).replace(/\s+/g, " ").trim());
    const dot = clean.match(DOT_TAKEN);
    const ailment = dot ? null : clean.match(AILMENT_TAKEN);
    if (!dot && !ailment) continue;
    const condition = ((dot ? dot[2] : ailment[4]) || "").trim();
    const status = dotCondition(condition, context, pools);
    if (!status) continue;
    const percent = Number((dot || ailment)[1]) * (Number.isFinite(line.multiplier) ? line.multiplier : 1) * (Number.isFinite(status.factor) ? status.factor : 1);
    const scope = dot ? "DoT" : ailment[3][0].toUpperCase() + ailment[3].slice(1).toLowerCase();
    const additional = dot ? true : Boolean(ailment[2]);
    // Micro Fate kismet copies of one mitigation stack additively with each other (user-confirmed
    // 2026-10-11), even when worded "additional": they form one summed group per ailment.
    const kismetGroup = line.origin === "kismet" && !dot;
    layers.push({ source: line.source, text: line.text, origin: line.origin, percent: round(percent), scope, additional: additional && !kismetGroup, kismetGroup, condition, active: status.active, assumption: status.assumption || null, unmodeled: Boolean(status.unmodeled) });
  }
  return layers;
}

// Damage taken conversion: "Converts 45% of Erosion Damage taken to Cold Damage" (game attrs 5733 / 5118 / 5117 …, flat sums).
// reference data Damage Type Conversion (help text, read 2026-10-13): the type changes before the defender's Damage Mitigation is
// calculated, so the converted share takes the new type's mitigation; conversions from different sources stack; past 100% the
// total is redistributed by each source's share; it applies to all forms of damage. One step only: a converted share is not
// converted again (not stated; provisional).
const CONVERT_TAKEN = /^Converts (\d+(?:\.\d+)?)% of (Physical|Fire|Cold|Lightning|Erosion) Damage taken to (Physical|Fire|Cold|Lightning|Erosion) Damage(?:\s+(.+))?$/i;
const typeName = (value) => value[0].toUpperCase() + value.slice(1).toLowerCase();
function conversionCondition(condition, context) {
  if (!condition) return { active: true };
  if (/^while Aegis of Fire is active$/i.test(condition)) return { active: Boolean(context.aegisOfFire), assumption: "Aegis of Fire active (best case)" };
  return { active: false, unmodeled: true };
}

/** Damage-taken conversion lines with their condition state. */
export function collectDamageTakenConversions(modifierTexts = [], context = {}) {
  const lines = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const clean = stripName(normalizePercentageText(String(line.text || "")).replace(/\s+/g, " ").trim());
    const match = clean.match(CONVERT_TAKEN);
    if (!match) continue;
    const condition = (match[4] || "").trim();
    const status = conversionCondition(condition, context);
    const percent = Number(match[1]) * (Number.isFinite(line.multiplier) ? line.multiplier : 1);
    lines.push({ source: line.source, text: line.text, from: typeName(match[2]), to: typeName(match[3]), percent: round(percent, 4), condition, active: status.active, assumption: status.assumption || null, unmodeled: Boolean(status.unmodeled) });
  }
  return lines;
}

/**
 * Where an incoming hit or DoT of `type` lands after taken conversion: [{ type, share, sources }], shares summing to 1. Sources
 * of one type stack; above 100% each is scaled by 100 / total (reference data: redistributed by each source's share).
 */
export function damageTakenShares(conversions = [], type) {
  const own = conversions.filter((line) => line.active && line.from === type && line.to !== type);
  const total = own.reduce((sum, line) => sum + line.percent, 0);
  const scale = total > 100 ? 100 / total : 1;
  const shares = new Map([[type, { share: Math.max(0, 1 - Math.min(100, total) / 100), sources: [] }]]);
  for (const line of own) {
    const entry = shares.get(line.to) || { share: 0, sources: [] };
    entry.share += line.percent * scale / 100;
    entry.sources.push(line);
    shares.set(line.to, entry);
  }
  return [...shares].filter(([, entry]) => entry.share > 1e-9).map(([to, entry]) => ({ type: to, share: round(entry.share, 6), sources: entry.sources }));
}

// Type-scoped layers count toward the guaranteed figure; Attack / Spell layers only toward the matching expected figure.
// Additional damage taken: each scope is its own game attribute (All 5720, Physical 5003, Fire 5120, Cold 5121, Lightning 5122,
// Elemental 5123, Erosion 5408; the recipes' attribute writes) and each attribute's product stops at −90% (config_attributes
// limit; 5408 has none; 2026-10-17 game attribute data). Scopes with no single attribute (Hit, Spell, Attack) multiply as written.
function limitedTakenFactor(layers) {
  const groups = new Map();
  for (const layer of layers) {
    const key = DAMAGE_TAKEN_ATTRIBUTES[layer.scope] ?? `scope:${layer.scope}`;
    groups.set(key, (groups.get(key) ?? 1) * (1 + layer.percent / 100));
  }
  let product = 1;
  for (const [key, factor] of groups) product *= typeof key === "number" ? limitDamageTakenFactor(factor, key) : factor;
  return product;
}

const dotScopeApplies = (scope, type) => scope === "All" || scope === type || (scope === "Elemental" && ELEMENTAL.includes(type));
const scopeApplies = (scope, type) => scope === "All" || scope === "Hit" || scope === type || (scope === "Elemental" && ELEMENTAL.includes(type));
const kindApplies = (scope, spell) => (scope === "Spell" && spell) || (scope === "Attack" && !spell);

/** The ailment and crowd-control rows of the checklist. */
export const AILMENT_ROWS = Object.freeze([
  { key: "Ignite", label: "Ignite", group: "Ailment", note: "Fire damage over time" },
  { key: "Shock", label: "Shock", group: "Ailment", note: "Secondary Lightning damage on hits" },
  { key: "Numbed", label: "Numbed", group: "Ailment", note: "+5% damage taken per stack" },
  { key: "Trauma", label: "Trauma", group: "Ailment", note: "Physical damage over time" },
  { key: "Wilt", label: "Wilt", group: "Ailment", note: "Erosion damage over time" },
  { key: "Frostbite", label: "Frostbite", group: "Ailment", note: "Slows; also a crowd control effect" },
  { key: "Freeze", label: "Freeze", group: "Ailment", note: "At 100 Frostbite Rating; also a crowd control effect" },
  { key: "Slow", label: "Slow", group: "Crowd control", note: "Attack, Cast and Movement Speed per stack" },
  { key: "Paralysis", label: "Paralysis", group: "Crowd control", note: "" },
  { key: "Weaken", label: "Weaken", group: "Crowd control", note: "" },
  { key: "Blind", label: "Blinding", group: "Crowd control", note: "Attacks have a chance to miss" },
  { key: "Knockback", label: "Knockback", group: "Crowd control", note: "" },
  { key: "Taunt", label: "Taunt", group: "Crowd control", note: "" },
  { key: "Curses", label: "Curses", group: "Curse", note: "" }
]);
// reference data Ailment page: Ignite, Frostbite, Freeze, Shock, Numbed, Trauma, Wilt. reference data Crowd Control
// Effects page: Frostbite, Freeze, Paralysis, Knockback, Weaken, Slow, Taunt, Blinding. No Stun page.
const ALL_AILMENTS = ["Ignite", "Shock", "Numbed", "Trauma", "Wilt", "Frostbite", "Freeze"];
const CROWD_CONTROL = ["Frostbite", "Freeze", "Slow", "Paralysis", "Weaken", "Blind", "Knockback", "Taunt"];
const DAMAGING = ["Ignite", "Trauma", "Wilt"];
// "Elemental Ailments" has no reference data definition; the Fire/Cold/Lightning ailments are a likely reading.
const ELEMENTAL_AILMENTS = ["Ignite", "Frostbite", "Freeze", "Shock", "Numbed"];

function groupKeys(name) {
  const clean = name.toLowerCase().replace(/\s+damage$/, "").replace(/\s+effects?$/, "").trim();
  if (/^crowd control$/.test(clean)) return { keys: CROWD_CONTROL, likely: false, mapping: "Reference data: Crowd Control Effects" };
  if (/^(?:all )?ailments?$/.test(clean)) return { keys: ALL_AILMENTS, likely: false, mapping: "Reference data: Ailment" };
  if (/^elemental ailments?$/.test(clean)) return { keys: ELEMENTAL_AILMENTS, likely: true, mapping: "Elemental Ailments: no reference data definition; Fire, Cold and Lightning ailments assumed" };
  if (/^damaging ailments?$/.test(clean)) return { keys: DAMAGING, likely: false, mapping: "Reference data: Ailment (Ailment Damage)" };
  if (/^curses?$/.test(clean)) return { keys: ["Curses"], likely: false, mapping: "" };
  if (/^blind(?:ing)?$/.test(clean)) return { keys: ["Blind"], likely: false, mapping: "" };
  if (/^(?:freeze|frozen)$/.test(clean)) return { keys: ["Freeze"], likely: false, mapping: "" };
  const row = AILMENT_ROWS.find((item) => item.key.toLowerCase() === clean || item.label.toLowerCase() === clean);
  return row ? { keys: [row.key], likely: false, mapping: "" } : null;
}
const splitNames = (list) => list.split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s+or\s+/).map((part) => part.trim()).filter(Boolean);
const CONDITION = /\s+\b(while|when|whenever|for|if|during|after|against|upon|within|at)\b/i;

/**
 * Immunity checklist: Immune / Conditional / Reduced / Not protected per row, from the build's
 * "Immune to …", "chance to avoid …" and "… Effect received" lines (planner.modifierTexts).
 */
export function immunityChecklist(modifierTexts = []) {
  const rows = AILMENT_ROWS.map((row) => ({ ...row, status: "none", immune: [], conditional: [], reduced: [], worse: [], likely: false }));
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
  const apply = (keys, bucket, entry, likely = false) => { for (const key of keys) { const row = byKey[key]; if (row) row[bucket].push({ ...entry, likely }); } };
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const clean = stripName(normalizePercentageText(String(line.text || "")).replace(/\s+/g, " ").trim()).replace(/^You are /i, "");
    const entry = { source: line.source, text: line.text };
    let match = clean.match(/^Immune to (.+)$/i);
    if (match) {
      const conditionIndex = match[1].search(CONDITION);
      const names = conditionIndex < 0 ? match[1] : match[1].slice(0, conditionIndex);
      const condition = conditionIndex < 0 ? "" : match[1].slice(conditionIndex).trim();
      for (const name of splitNames(names)) {
        const group = groupKeys(name);
        if (group) apply(group.keys, condition ? "conditional" : "immune", { ...entry, condition, mapping: group.mapping }, group.likely);
      }
      continue;
    }
    match = clean.match(/^\+(\d+(?:\.\d+)?)% chance to avoid (Elemental Ailments|Damaging Ailments|Ailments|Crowd Control Effects)(?:\s+(.+))?$/i);
    if (match) {
      const group = groupKeys(match[2]);
      if (group) apply(group.keys, match[3] ? "conditional" : "reduced", { ...entry, condition: match[3] || "", detail: `${match[1]}% chance to avoid`, kind: "chance to avoid", percent: Number(match[1]), mapping: group.mapping }, group.likely);
      continue;
    }
    match = clean.match(/^([+-]\d+(?:\.\d+)?)% (Ignite|Numbed|Slow|Paralysis|Weaken|Curse|Frostbite|Freeze|Shock|Trauma|Wilt|Blind(?:ing)?) Effect received$/i);
    if (match) {
      const group = groupKeys(match[2]);
      const percent = Number(match[1]) * (Number.isFinite(line.multiplier) ? line.multiplier : 1);
      if (group) apply(group.keys, percent < 0 ? "reduced" : "worse", { ...entry, detail: `${percent > 0 ? "+" : ""}${round(percent, 2)}% effect received`, kind: "effect received", percent });
      continue;
    }
    match = clean.match(/^([+-]\d+(?:\.\d+)?)% (additional )?(Ignite|Trauma|Wilt|Shock) Damage taken$/i);
    if (match) {
      const percent = Number(match[1]) * (Number.isFinite(line.multiplier) ? line.multiplier : 1);
      // The same grouping as the damage-over-time figure (collectDotTakenLayers): "additional" lines multiply (game mod 4),
      // the others and Micro Fate copies are summed (game mod 3; kismet copies stack additively, user-confirmed 2026-10-11).
      const kismetGroup = line.origin === "kismet";
      apply(groupKeys(match[3]).keys, percent < 0 ? "reduced" : "worse", { ...entry, detail: `${percent > 0 ? "+" : ""}${round(percent, 2)}% damage taken`, kind: "damage taken", percent, additional: Boolean(match[2]) && !kismetGroup, kismetGroup });
      continue;
    }
    match = clean.match(/^Effects of Control Effects received \+(\d+(?:\.\d+)?)%$/i);
    if (match) apply(CROWD_CONTROL, "worse", { ...entry, detail: `+${match[1]}% effect received`, kind: "effect received", percent: Number(match[1]) });
  }
  for (const row of rows) {
    // Same-kind values stack additively (user-confirmed for kismet copies, 2026-10-11): one summed figure per kind.
    const listed = [...row.conditional, ...row.reduced, ...row.worse];
    const sums = new Map();
    for (const item of listed) if (item.kind && Number.isFinite(item.percent)) sums.set(item.kind, (sums.get(item.kind) || 0) + item.percent);
    // User rule (2026-10-13): a summed reduction of 100% or more is immunity ("if Wilt damage is reduced by 100% you are immune;
    // same with slow"). The game panel caps "Reduced Slow / Paralysis Effect Received" at 100 (attrs 43002 / 43003). Per kind,
    // from the unconditional lines: chance to avoid (summed), effect received (summed), damage taken (additional lines multiply,
    // the others and Micro Fate copies are summed, as in the damage-over-time figure).
    const unconditional = [...row.reduced, ...row.worse];
    const mitigation = mitigationByKind(unconditional);
    const deciding = Object.entries(mitigation).filter(([, value]) => value >= 100 - 1e-9);
    row.mitigationPercent = round(Math.max(0, ...Object.values(mitigation)), 2);
    row.immuneBySum = !row.immune.length && deciding.length > 0;
    row.status = row.immune.length || row.immuneBySum ? "immune" : row.conditional.length ? "conditional" : row.reduced.length ? "reduced" : row.worse.length ? "worse" : "none";
    // "likely" only when the deciding lines rely on the assumed Elemental Ailments membership.
    const decidingItems = row.immuneBySum ? unconditional.filter((item) => deciding.some(([kind]) => kind === item.kind)) : row.status === "immune" ? row.immune : row.status === "conditional" ? row.conditional : row.status === "reduced" ? row.reduced : row.worse;
    row.likely = decidingItems.some((item) => item.likely);
    const detailOf = (item) => item.detail || (item.condition ? `Immune ${item.condition}` : "Immune");
    const summed = [...sums].map(([kind, percent]) => `${percent > 0 && kind !== "chance to avoid" ? "+" : ""}${round(percent, 2)}% ${kind}`);
    row.detail = row.status === "immune" ? (row.immuneBySum ? `Immune: ${summed.join(" · ")} (summed, 100% or more)` : "Immune") : row.status === "none" ? "Not protected"
      : [...new Set(listed.filter((item) => !item.kind).map(detailOf)), ...summed].join(" · ");
    row.sources = [...row.immune, ...row.conditional, ...row.reduced, ...row.worse];
  }
  return rows;
}

// Mitigation % per kind from a row's unconditional lines (positive = protection).
function mitigationByKind(items) {
  const out = {};
  const avoid = items.filter((item) => item.kind === "chance to avoid");
  if (avoid.length) out["chance to avoid"] = avoid.reduce((sum, item) => sum + item.percent, 0);
  const effect = items.filter((item) => item.kind === "effect received");
  if (effect.length) out["effect received"] = -effect.reduce((sum, item) => sum + item.percent, 0);
  const taken = items.filter((item) => item.kind === "damage taken");
  if (taken.length) {
    const additional = taken.filter((item) => item.additional).reduce((product, item) => product * Math.max(0, 1 + item.percent / 100), 1);
    const increased = taken.filter((item) => !item.additional && !item.kismetGroup).reduce((sum, item) => sum + item.percent, 0);
    const kismet = taken.filter((item) => item.kismetGroup).reduce((sum, item) => sum + item.percent, 0);
    out["damage taken"] = (1 - additional * Math.max(0, 1 + increased / 100) * Math.max(0, 1 + kismet / 100)) * 100;
  }
  return out;
}

/**
 * The full model: pools, mitigation layers, per-type EHP and the checklist. `options` override the assumed
 * character level and the reference enemy level (the level-85 dummy by default).
 */
export function effectiveHpModel(planner, options = {}) {
  const characterLevel = options.characterLevel ?? EHP_DEFAULTS.characterLevel;
  const enemyLevel = options.enemyLevel ?? EHP_DEFAULTS.enemyLevel;
  const totals = characterStatTotals(planner, { extraLines: options.extraLines });
  const modifierTexts = planner.modifierTexts || [];
  const assumptions = [];
  const provisional = [];
  assumptions.push(`Character level ${characterLevel} (not stored in the build; sets base Life ${baseLife(characterLevel)}, base Evasion ${baseEvasion(characterLevel)})`);
  assumptions.push(`Reference hit from a level ${enemyLevel} enemy (Armor and Evasion formulas use the enemy level, not the hit size)`);

  // Aegis of Fire up when a hit lands (best case, condition "aegisOfFire"; src/aegis-of-fire.js).
  const aegis = aegisOfFireState(planner);
  if (aegis.onBoard && aegis.active) assumptions.push(`Aegis of Fire active (best case; ${aegis.summary}): +${aegis.attackBlockChancePercent}% Attack / +${aegis.spellBlockChancePercent}% Spell Block Chance${aegis.armor ? `, ${aegis.armor.source} +${aegis.armor.armor} Armor and +${aegis.armor.nonPhysicalArmorRatePercent}% non-Physical Armor Effective Rate` : ""}${aegis.lines.length ? `, and ${aegis.lines.map((line) => `${line.source}: ${line.text}`).join("; ")}` : ""}. Switch it off under Best-case assumptions`);
  else if (aegis.onBoard && !aegis.requested) assumptions.push("Aegis of Fire: switched off (its block, Armor and the lines that need it are left out)");
  const aura = auraDefense(planner);
  const perAttribute = perAttributePoolLines(modifierTexts, totals);
  const fortification = aegis.active && aegis.armor?.armor ? [{ source: `Aegis of Fire · ${aegis.armor.source}`, text: `+${aegis.armor.armor} Armor while the supported skill lasts (Aegis of Fire active: best case)`, value: aegis.armor.armor }] : [];
  const nonPhysicalArmorRate = 0.6 + (aegis.active && aegis.armor ? aegis.armor.nonPhysicalArmorRatePercent / 100 : 0);

  const life = pool(totals, "maxLife", baseLife(characterLevel), { baseLabel: `Base Life · level ${characterLevel}`, extra: { flat: perAttribute.maxLife } });
  const energyShield = pool(totals, "maxEnergyShield", 0, { defense: true, extra: energyShieldPoolExtra({ modifierTexts, totals, auraEntries: planner.aura?.entries || [], lineEffects: planner.lineEffects, skipTownHeld: true }) });
  const mana = pool(totals, "maxMana", baseMana(characterLevel), { baseLabel: `Base Mana · level ${characterLevel}`, extra: { flat: perAttribute.maxMana } });
  const armor = pool(totals, "armor", 0, { defense: true, extra: { flat: [...fortification, ...aura.pools.armor.flat], additional: aura.pools.armor.additional } });
  const decayingEvasion = decayingEvasionLayers(planner);
  if (decayingEvasion.layers.length) provisional.push(`Decaying Evasion buffs (All In) are time-averaged over the supported skill's cast period: ${decayingEvasion.layers.map((layer) => `${layer.source} ${layer.text}`).join("; ")}`);
  provisional.push(...decayingEvasion.notes);
  const evasion = pool(totals, "evasion", baseEvasion(characterLevel), { defense: true, baseLabel: `Base Evasion · level ${characterLevel}`, extra: { flat: aura.pools.evasion.flat, additional: [...aura.pools.evasion.additional, ...decayingEvasion.layers] } });
  // UE_game.log (Frost Terra v2, 2026-10-13): Armor Bonus 30 = Evasion Bonus 30 = the build's one Defense line, and Max Energy
  // Shield Bonus 172.2 = 142.2 + 30, so "+X% Defense" is an increase on all three.
  if (totals.byKey.defense?.increased) provisional.push("+% Defense is applied as increased Armor, Evasion and Energy Shield (the reference data defines Defense as their sum; the game panel shows the same Defense % in Armor Bonus, Evasion Bonus and Max Energy Shield Bonus)");
  const lifeReservedPercent = planner.aura?.lifeReservedPercent || 0;
  const usableLife = round(life.value * Math.max(0, 1 - lifeReservedPercent / 100));
  const basePool = usableLife + energyShield.value;
  // Barrier: Guard, or a movement Barrier while moving (the planner's movement condition). One Barrier at a time (reference data).
  const barrierSource = [...(planner.barrierSources || []), ...movementBarrierSources(modifierTexts, planner.conditions?.moving !== false)].find((source) => source.available);
  const shieldBonus = barrierShieldBonus(modifierTexts);
  const barrierShield = barrierSource ? round(barrierShieldValue({ maxLife: life.value, maxEnergyShield: energyShield.value, bonus: shieldBonus }).shield) : 0;
  // The Shield absorbs half of each hit until spent: it adds at most the pool it protects.
  const barrierAbsorb = barrierSource ? round(Math.min(barrierShield, basePool)) : 0;
  if (barrierSource) assumptions.push(`${barrierSource.movement ? "Barrier" : "Guard Barrier"} up (${barrierSource.trigger.toLowerCase()}): a Shield of 20% × (Max Life + Max Energy Shield)${shieldBonus.increased || shieldBonus.additional !== 1 ? ` × (1 + ${round(shieldBonus.increased, 2)}% Barrier Shield)${shieldBonus.additional !== 1 ? ` × ${round(shieldBonus.additional, 4)}` : ""}` : ""} = ${formatRecountInteger(barrierShield)} absorbing 50% of hit damage`);
  const poolTotal = round(basePool + barrierAbsorb);

  // Avoidance and block.
  const activeNames = planner.activation?.activeNames || new Set();
  const channeling = (planner.activation?.setups || []).some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Channeled"));
  const cursing = (planner.curseLimit?.active || []).length > 0;
  const resistanceTotals = Object.fromEntries((planner.resistances?.entries || []).map((entry) => [entry.element, entry.total]));
  const context = { resistanceTotals, blur: planner.conditions?.blur, lowLife: planner.lowResources?.lowLife, lowMana: planner.lowResources?.lowMana, channeling, cursing, aegisOfFire: aegis.active, pureHeart: Boolean(planner.pureHeart?.active) };
  const takenLayers = [...collectDamageTakenLayers(modifierTexts, context), ...aura.taken];
  const blessings = planner.blessings;
  const divineGrace = modifierTexts.find((line) => /Changes the base effect of all Blessings to: \+[\d.]+% additional damage and -[\d.]+% additional damage taken/i.test(line.text));
  if (divineGrace && blessings) {
    const percent = Number(divineGrace.text.match(/-([\d.]+)% additional damage taken/i)[1]);
    const stacks = (blessings.entries || []).reduce((sum, blessing) => sum + (blessing.stacks || 0), 0);
    takenLayers.push({ source: divineGrace.source, text: divineGrace.text, percent: round((Math.pow(1 - percent / 100, stacks) - 1) * 100, 2), scope: "All", condition: `${stacks} Blessing stacks`, active: stacks > 0, assumption: `${stacks} Blessing stacks (best case, −${percent}% each)`, unmodeled: false });
  } else if (blessings?.tenacityMitigationPercent) {
    const tenacity = (blessings.entries || []).find((blessing) => blessing.name === "Tenacity");
    takenLayers.push({ source: "Tenacity Blessing", text: `${tenacity?.stacks || 0} stacks · −4% additional damage taken each`, percent: -round(blessings.tenacityMitigationPercent, 2), scope: "All", condition: "", active: true, assumption: `${tenacity?.stacks || 0} Tenacity stacks (best case)`, unmodeled: false });
  }
  for (const layer of takenLayers) if (layer.active && layer.assumption) assumptions.push(`${layer.source}: ${layer.assumption}`);
  const conversions = collectDamageTakenConversions(modifierTexts, context);
  for (const line of conversions) if (line.active && line.assumption) assumptions.push(`${line.source}: ${line.text} (${line.assumption})`);
  if (conversions.some((line) => line.active)) provisional.push("Damage taken conversion: one step (a converted share is not converted again); the reference data does not say");
  const avoidance = totals.byKey.damageAvoidance?.increased || 0;
  const blurAvoid = planner.conditions?.blur && planner.blurEffects?.active ? planner.blurEffects.avoidancePercent || 0 : 0;
  const avoidSources = [...(totals.byKey.damageAvoidance?.sources || []).map((item) => ({ source: item.source, text: item.text })), ...(blurAvoid ? [{ source: "Blur", text: `${round(blurAvoid, 2)}% chance to avoid damage from Blur Rating (best case)` }] : [])];
  const avoidPercent = round(clamp(avoidance + blurAvoid, 0, 100), 3);
  // No cap found in reference data or game data, and the user knows of none in game (2026-10-11); only the 100% clamp applies.
  if (avoidPercent) provisional.push("Chance to avoid damage: no known cap (clamped at 100%)");
  if (blurAvoid) assumptions.push("Blur active at its best-case rating");
  const block = blockWithAegisOfFire(planner.block || { attackChance: 0, spellChance: 0, ratio: 30, ratioCap: 60, blockedHitTakenFactor: 0.7, sources: [] }, aegis);
  const blockFactor = (spell) => 1 - clamp(spell ? block.spellChance : block.attackChance, 0, MAX_BLOCK_CHANCE_PERCENT) / 100 * (1 - block.blockedHitTakenFactor);
  const evade = { attack: round(evadeChance(evasion.value, enemyLevel), 4), spell: round(evadeChance(evasion.value, enemyLevel, { spell: true }), 4), accuracy: round(enemyAccuracy(enemyLevel), 1) };
  if (evasion.value) provisional.push(`Evasion: enemy Accuracy ${evade.accuracy} is a linear interpolation of the reference data's 130–680 range by level (the game's character panel uses Accuracy 630)`);
  if (armor.value) provisional.push("Armor: the reference data's \"double the Armor value\" rule is applied inside the formula (unverified against a hit test)");
  if (nonPhysicalArmorRate !== 0.6) provisional.push(`Armor against non-Physical Damage: ${round(nonPhysicalArmorRate * 100, 2)}% effective rate (reference data 60% + Iron Fortification's +${round((nonPhysicalArmorRate - 0.6) * 100, 2)}%, added: provisional)`);
  const resistanceEntries = planner.resistances?.entries || [];

  // Per damage type after taken conversion: armour, resistance and the type-scoped additional damage taken.
  const hitTarget = Object.fromEntries(DAMAGE_TYPES.map((type) => {
    const physical = type === "Physical";
    const armorFactor = 1 - armorReduction(armor.value, enemyLevel, { physical, nonPhysicalRate: nonPhysicalArmorRate });
    const resistance = physical ? null : resistanceEntries.find((entry) => entry.element === type);
    const resistanceFactor = 1 - clamp(resistance?.effective || 0, -1000, 100) / 100;
    const layers = takenLayers.filter((layer) => layer.active && scopeApplies(layer.scope, type));
    const additionalFactor = limitedTakenFactor(layers);
    return [type, { type, armorFactor, resistance, resistanceFactor, layers, additionalFactor, factor: armorFactor * resistanceFactor * additionalFactor }];
  }));
  const types = DAMAGE_TYPES.map((type) => {
    const own = hitTarget[type];
    const conversion = damageTakenShares(conversions, type);
    const mitigation = conversion.reduce((sum, part) => sum + part.share * hitTarget[part.type].factor, 0);
    const layers = [...new Set(conversion.flatMap((part) => hitTarget[part.type].layers))];
    const guaranteed = mitigation > 0 ? poolTotal / mitigation : Infinity;
    const expected = (spell) => {
      const spellLayers = takenLayers.filter((layer) => layer.active && kindApplies(layer.scope, spell));
      const factor = mitigation * spellLayers.reduce((product, layer) => product * (1 + layer.percent / 100), 1) * (1 - evade[spell ? "spell" : "attack"]) * (1 - avoidPercent / 100) * blockFactor(spell);
      return factor > 0 ? poolTotal / factor : Infinity;
    };
    return {
      type, armorFactor: round(own.armorFactor, 4), armorReductionPercent: round((1 - own.armorFactor) * 100, 2),
      resistancePercent: own.resistance ? own.resistance.effective : 0, resistanceFactor: round(own.resistanceFactor, 4),
      layers, additionalFactor: round(own.additionalFactor, 4), mitigation: round(mitigation, 4),
      conversion: conversion.map((part) => ({ type: part.type, share: part.share, factor: round(hitTarget[part.type].factor, 4), sources: part.sources.map((line) => `${line.source}: ${line.text}`) })),
      guaranteed: round(guaranteed, 0), expectedAttack: round(expected(false), 0), expectedSpell: round(expected(true), 0)
    };
  });
  // Damage over time: Life + Energy Shield only (the Barrier absorbs "Hit Damage taken"); no Armor, Evasion,
  // block or avoid (reference data: Armor, Evade and Block are defensive mechanics "against Hit Damage"). Taken conversion applies
  // (reference data: "all forms of damage").
  const dotPool = round(basePool);
  const dotLayers = collectDotTakenLayers(modifierTexts, context, { energyShield: energyShield.value, armor: armor.value, evasion: evasion.value, blockRatio: block.ratio });
  for (const layer of dotLayers) if (layer.active && layer.assumption) assumptions.push(`${layer.source}: ${layer.assumption}`);
  provisional.push("Damage over time: Energy Shield is assumed to absorb it before Life (the reference data says \"when taking damage\" without separating hits from damage over time)");
  if (avoidPercent) provisional.push("Damage over time: chance to avoid damage is not applied (no source says whether it covers damage over time)");
  if (dotLayers.some((layer) => !layer.additional && layer.active)) provisional.push("Ailment damage taken (non-additional, game mod 3): lines of one ailment are summed and floored at 0% taken; no cap is sourced");
  const checklistRows = immunityChecklist([...modifierTexts, ...aura.checklistLines]);
  const dotOnly = dotLayers.filter((layer) => layer.active && layer.scope === "DoT");
  // "additional Damage Over Time taken" lines write attr 5720 (DoT tag), so they share the All-scope attribute and its −90% limit.
  const dotOnlyAsAll = dotOnly.map((layer) => ({ ...layer, scope: "All" }));
  const dotTarget = Object.fromEntries(DAMAGE_TYPES.map((type) => {
    const generalLayers = takenLayers.filter((layer) => layer.active && dotScopeApplies(layer.scope, type));
    const general = limitedTakenFactor([...generalLayers, ...dotOnlyAsAll]);
    return [type, { generalLayers, general, factor: hitTarget[type].resistanceFactor * general }];
  }));
  for (const item of types) {
    const conversion = item.conversion;
    const mitigation = conversion.reduce((sum, part) => sum + part.share * dotTarget[part.type].factor, 0);
    const generalLayers = [...new Set(conversion.flatMap((part) => dotTarget[part.type].generalLayers))];
    const ailmentName = DOT_AILMENT_BY_TYPE[item.type];
    let ailment = null;
    if (ailmentName) {
      const own = dotLayers.filter((layer) => layer.active && layer.scope === ailmentName);
      const additional = own.filter((layer) => layer.additional).reduce((product, layer) => product * (1 + layer.percent / 100), 1);
      // Non-additional lines (game mod 3) and the kismet group are each summed; a sum at or below −100% means no damage.
      const increasedPercent = own.filter((layer) => !layer.additional && !layer.kismetGroup).reduce((sum, layer) => sum + layer.percent, 0);
      const kismetPercent = own.filter((layer) => layer.kismetGroup).reduce((sum, layer) => sum + layer.percent, 0);
      const factor = mitigation * additional * Math.max(0, 1 + increasedPercent / 100) * Math.max(0, 1 + kismetPercent / 100);
      // User rule (2026-10-13): a summed reduction of 100% or more is immunity (the checklist row says Immune).
      const immune = checklistRows.find((row) => row.key === ailmentName)?.status === "immune";
      ailment = { name: ailmentName, layers: own, additionalFactor: round(additional, 4), increasedPercent: round(increasedPercent, 2), kismetPercent: round(kismetPercent, 2), mitigation: round(factor, 4), immune, guaranteed: immune || factor <= 0 ? Infinity : round(dotPool / factor, 0) };
    }
    item.dot = { layers: [...generalLayers, ...dotOnly], additionalFactor: round(dotTarget[item.type].general, 4), mitigation: round(mitigation, 4), guaranteed: mitigation > 0 ? round(dotPool / mitigation, 0) : Infinity, ailment };
  }
  const weakestDot = types.reduce((low, item) => item.dot.guaranteed < low.dot.guaranteed ? item : low, types[0]);
  const weakest = types.reduce((low, item) => item.guaranteed < low.guaranteed ? item : low, types[0]);
  const weakestExpected = types.reduce((low, item) => Math.min(item.expectedAttack, item.expectedSpell) < Math.min(low.expectedAttack, low.expectedSpell) ? item : low, types[0]);
  const checklist = checklistRows;
  const likely = checklist.filter((row) => row.likely);
  if (likely.length) provisional.push("\"Elemental Ailments\" has no reference data definition; Ignite, Frostbite, Freeze, Shock and Numbed are assumed (rows marked \"likely\")");
  if (checklist.some((row) => row.immuneBySum && (mitigationByKind(row.reduced)["chance to avoid"] || 0) >= 100)) provisional.push("Chance to avoid an ailment at 100% or more is read as immunity (user rule 2026-10-13); no cap on ailment avoidance is sourced");
  return {
    characterLevel, enemyLevel, totals,
    pools: { life, usableLife, lifeReservedPercent: round(lifeReservedPercent, 2), energyShield, mana, armor, evasion, nonPhysicalArmorRate: round(nonPhysicalArmorRate, 4), barrier: barrierSource ? { source: barrierSource.source, trigger: barrierSource.trigger, movement: Boolean(barrierSource.movement), shieldBonusPercent: round(shieldBonus.increased, 2), shieldBonusSources: shieldBonus.sources, shield: barrierShield, absorb: barrierAbsorb } : null, basePool: round(basePool), total: poolTotal },
    avoidance: { percent: avoidPercent, sources: avoidSources },
    aegisOfFire: aegis.onBoard ? { active: aegis.active, requested: aegis.requested, summary: aegis.summary, uptimePercent: aegis.uptimePercent } : null,
    evade, block: { attackChance: block.attackChance, spellChance: block.spellChance, ratio: block.ratio, ratioCap: block.ratioCap, uncappedRatio: block.uncappedRatio ?? block.ratio, panel: block.aegisOfFire?.panel || null, blockedHitTakenFactor: block.blockedHitTakenFactor, attackFactor: round(blockFactor(false), 4), spellFactor: round(blockFactor(true), 4), sources: block.sources || [] },
    takenLayers, dotLayers, conversions, dotPool, types, weakest, weakestExpected, weakestDot, checklist, assumptions, provisional,
    injuryBufferPercent: totals.byKey.injuryBuffer?.increased || 0
  };
}

const percentText = (value, places = 1) => `${round(value, places)}%`;
const sourceTitle = (sources) => sources.map((item) => `${item.source}: ${item.text}`).join("\n");
const poolTitle = (item, label) => [`${label} · (base + flat + gear) × (1 + increased%) × additional`, `base ${item.base} · flat ${item.flat} · gear ${item.gear} · +${item.increased}% · ×${item.additional}`, ...item.sources.map((source) => `${source.source}: ${source.text}`)].join("\n");

/** Banner markup in the damage panel's style from `effectiveHpModel`'s result; the checklist sits on the right. */
export function effectiveHpMarkup(model) {
  const { pools, types } = model;
  const integer = (value) => Number.isFinite(value) ? formatRecountInteger(value) : "Immune";
  // The recount classes carry the styling; the "ehp-" classes keep these rows apart from the damage panel's.
  const row = (key, label, value, note = "", extraClass = "") => `<div class="dummy-recount-row ehp-row${extraClass ? ` ${extraClass}` : ""}" data-ehp-field="${key}"${note ? ` title="${escapeHtml(note)}"` : ""}><span class="dummy-recount-label ehp-label">${escapeHtml(label)}</span>${Number.isFinite(value) ? toggleNumberMarkup(`ehp:${key}`, value, { className: "dummy-recount-value ehp-value" }) : `<strong class="dummy-recount-value ehp-value">${escapeHtml(integer(value))}</strong>`}</div>`;
  const hero = row("weakest", `Effective HP · weakest: ${model.weakest.type}`, model.weakest.guaranteed, `Usable pool ÷ ${model.weakest.type} mitigation (Armor, resistance, additional damage taken). Evasion, block and avoidance are not counted here.`, "dummy-recount-hero");
  const pair = `<div class="dummy-recount-pair">${row("pool", "Usable pool", pools.total, `Life after sealing ${formatRecountInteger(pools.usableLife)} + Energy Shield ${formatRecountInteger(pools.energyShield.value)}${pools.barrier ? ` + ${pools.barrier.movement ? "Barrier" : "Guard Barrier"} ${formatRecountInteger(pools.barrier.absorb)}` : ""}`)}${row("expected", `Expected vs hits · weakest: ${model.weakestExpected.type}`, Math.min(model.weakestExpected.expectedAttack, model.weakestExpected.expectedSpell), "Lowest of the attack and spell expected values: evasion, block and chance to avoid damage as averages. A single unlucky hit still sees only the guaranteed figure.")}${row("dot", `Weakest vs damage over time: ${model.weakestDot.type}`, model.weakestDot.dot.guaranteed, `Life after sealing + Energy Shield (${formatRecountInteger(model.dotPool)}, no Barrier) ÷ ${model.weakestDot.type} resistance and damage-taken lines that are not hit-only. Armor, evasion, block and avoidance do not apply.`)}</div>`;
  const layerLine = (layer) => `${layer.source}: ${layer.text}`;
  const dotTitle = (item) => {
    const { dot } = item;
    const ailment = dot.ailment;
    const inactive = model.dotLayers.filter((layer) => !layer.active && (layer.scope === "DoT" || layer.scope === ailment?.name));
    return [
      `Damage over time · pool ${formatRecountInteger(model.dotPool)} ÷ ×${dot.mitigation.toFixed(3)}`,
      `Resistance ${percentText(item.resistancePercent)} · additional damage taken ×${dot.additionalFactor} · no Armor, evasion, block or avoid`,
      ...dot.layers.map(layerLine),
      ...(ailment ? [ailment.immune ? `${ailment.name}: immune` : `${ailment.name}: ×${ailment.mitigation.toFixed(3)} → ${ailmentValue(ailment)} (additional ×${ailment.additionalFactor}${ailment.layers.some((layer) => !layer.additional && !layer.kismetGroup) ? ` · ${ailment.increasedPercent}% damage taken, summed` : ""}${ailment.layers.some((layer) => layer.kismetGroup) ? ` · kismets ${ailment.kismetPercent}%, stacked additively` : ""})`, ...ailment.layers.map(layerLine)] : []),
      ...inactive.map((layer) => `${layer.unmodeled ? "Not applied (condition not modeled)" : "Inactive"} · ${layerLine(layer)}`)
    ].join("\n");
  };
  // Summed (mod 3) ailment lines at −100% or below leave no damage taken: not an immunity, so it is labelled apart.
  const ailmentValue = (ailment) => ailment.immune ? "Immune" : Number.isFinite(ailment.guaranteed) ? formatRecountInteger(ailment.guaranteed) : "fully mitigated";
  const dotCell = (item) => `<td class="ehp-dot" title="${escapeHtml(dotTitle(item))}">${integer(item.dot.guaranteed)}${item.dot.ailment ? `<small class="ehp-dot-ailment" data-ehp-ailment="${escapeHtml(item.dot.ailment.name)}">${escapeHtml(item.dot.ailment.name)} ${escapeHtml(ailmentValue(item.dot.ailment))}</small>` : ""}</td>`;
  // Taken as (reference data Damage Type Conversion): each share takes its own type's Armor, resistance and damage taken.
  const mitigationTitle = (item) => [
    item.conversion?.length > 1 || (item.conversion?.[0] && item.conversion[0].type !== item.type) ? `Taken as ${item.conversion.map((part) => `${percentText(part.share * 100, 2)} ${part.type} (×${part.factor.toFixed(3)})`).join(" + ")}` : `Armor ${percentText(item.armorReductionPercent)} · resistance ${percentText(item.resistancePercent)} · additional damage taken ×${item.additionalFactor}`,
    ...(item.conversion || []).flatMap((part) => part.sources),
    ...item.layers.map((layer) => `${layer.source}: ${layer.text}`)
  ].join("\n");
  const typeRows = types.map((item) => `<tr><th scope="row">${escapeHtml(item.type)}</th><td class="ehp-mitigation" title="${escapeHtml(mitigationTitle(item))}">×${item.mitigation.toFixed(3)}</td><td>${integer(item.guaranteed)}</td><td title="${escapeHtml(`Evade ${percentText(model.evade.attack * 100)} · block ${percentText(model.block.attackChance)} × ${percentText(model.block.ratio)} ratio · avoid ${percentText(model.avoidance.percent)}`)}">${integer(item.expectedAttack)}</td><td title="${escapeHtml(`Evade ${percentText(model.evade.spell * 100)} (60% rating) · block ${percentText(model.block.spellChance)} × ${percentText(model.block.ratio)} ratio · avoid ${percentText(model.avoidance.percent)}`)}">${integer(item.expectedSpell)}</td>${dotCell(item)}</tr>`).join("");
  const table = `<table class="ehp-types"><thead><tr><th scope="col">Damage type</th><th scope="col" class="ehp-mitigation">Hit mitigation</th><th scope="col">Guaranteed</th><th scope="col">vs attacks</th><th scope="col">vs spells</th><th scope="col" class="ehp-dot" title="Damage over time: Life + Energy Shield ÷ resistance and non-hit damage taken; the ailment of that type below">vs DoT</th></tr></thead><tbody>${typeRows}</tbody></table>`;
  const marks = { immune: "✓", conditional: "◐", reduced: "◐", worse: "✕", none: "✕" };
  const statusLabel = { immune: "Immune", conditional: "Conditional", reduced: "Reduced", worse: "Weakened", none: "Not protected" };
  // The summed detail ("-101% damage taken · 14% chance to avoid") and the per-source lines are the row's hover text.
  const checkTitle = (item) => [(item.status !== "immune" && item.status !== "none") || item.immuneBySum ? item.detail : "", item.note, ...item.sources.map((source) => `${source.source}: ${source.text}${source.mapping ? ` (${source.mapping})` : ""}`)].filter(Boolean).join("\n");
  const checklist = `<aside class="ehp-checklist" aria-label="Ailment and crowd control immunity"><span class="dummy-recount-mix-title">Ailments and crowd control</span><ul>${model.checklist.map((item) => `<li class="ehp-check ehp-check-${item.status}"${checkTitle(item) ? ` title="${escapeHtml(checkTitle(item))}"` : ""}><i class="ehp-mark" aria-hidden="true">${marks[item.status]}</i><span class="ehp-check-name">${escapeHtml(item.label)}${item.likely && item.status !== "immune" ? ` <em>likely</em>` : ""}</span><span class="ehp-check-status">${escapeHtml(item.status === "reduced" && item.mitigationPercent > 0 ? `${statusLabel.reduced} ${round(item.mitigationPercent, 1)}%` : statusLabel[item.status])}</span></li>`).join("")}</ul></aside>`;
  const chip = (label, value, title) => `<span class="ehp-layer" title="${escapeHtml(title)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></span>`;
  const layers = [
    chip("Max Life", `${formatRecountInteger(pools.life.value)}${pools.lifeReservedPercent ? ` · ${percentText(pools.lifeReservedPercent)} sealed` : ""}`, poolTitle(pools.life, "Max Life")),
    chip("Energy Shield", formatRecountInteger(pools.energyShield.value), poolTitle(pools.energyShield, "Max Energy Shield")),
    ...(pools.barrier ? [chip(pools.barrier.movement ? "Barrier" : "Guard Barrier", formatRecountInteger(pools.barrier.shield), `${pools.barrier.source} · ${pools.barrier.trigger}\n20% × (Max Life + Max Energy Shield)${pools.barrier.shieldBonusPercent ? ` × (1 + ${pools.barrier.shieldBonusPercent}% Barrier Shield)` : ""}, absorbs 50% of hit damage; counts ${formatRecountInteger(pools.barrier.absorb)} toward the pool${pools.barrier.shieldBonusSources.length ? `\n${sourceTitle(pools.barrier.shieldBonusSources)}` : ""}`)] : []),
    chip("Armor", `${formatRecountInteger(pools.armor.value)} · ${percentText(types[0].armorReductionPercent)} phys`, `${poolTitle(pools.armor, "Armor")}\nReduction = 2 × Armor ÷ (0.9 × 2 × Armor + 3000 + 300 × min(${model.enemyLevel}, 90)); ${percentText(pools.nonPhysicalArmorRate * 100, 2)} of it against non-Physical; cap 80%`),
    chip("Evasion", `${formatRecountInteger(pools.evasion.value)} · ${percentText(model.evade.attack * 100)} / ${percentText(model.evade.spell * 100)}`, `${poolTitle(pools.evasion, "Evasion")}\nEvade = 1 − 1.15 × Accuracy ÷ (Accuracy + 0.5 × Evasion^0.75), cap 75%; enemy Accuracy ${model.evade.accuracy} at level ${model.enemyLevel}; against spells the chance uses 60% of the Evasion rating (game panel Spell Evasion Chance) and an evaded spell still deals 60% (reference data: evasion reduces spell damage by 40%)`),
    chip("Block", `${percentText(model.block.attackChance)} / ${percentText(model.block.spellChance)} × ${percentText(model.block.ratio)}`, `Attack / Spell Block Chance × Block Ratio (cap ${percentText(model.block.ratioCap)}; reference data: 30% base, 60% max by default, up to 80%; Block Chance up to 100%)${model.block.panel ? `\nAegis of Fire active (best case): the character panel without it reads ${percentText(model.block.panel.attackChance)} / ${percentText(model.block.panel.spellChance)} × ${percentText(model.block.panel.ratio)}` : ""}\n${sourceTitle(model.block.sources) || "No block lines"}`),
    chip("Avoid damage", percentText(model.avoidance.percent), sourceTitle(model.avoidance.sources) || "No chance-to-avoid lines"),
    chip("Resistances", types.slice(1).map((item) => `${item.type} ${item.resistancePercent}%`).join(" · "), "Effective (capped) resistances from the Resistances card"),
    chip("Damage taken", model.takenLayers.filter((layer) => layer.active).length ? model.takenLayers.filter((layer) => layer.active).map((layer) => `${layer.scope === "All" ? "" : `${layer.scope} `}${layer.percent > 0 ? "+" : ""}${round(layer.percent, 2)}%`).join(" · ") : "none", [...model.takenLayers.map((layer) => `${layer.active ? "Active" : layer.unmodeled ? "Not applied (condition not modeled)" : "Inactive"} · ${layer.source}: ${layer.text}`), ...(model.conversions || []).map((line) => `${line.active ? "Active" : line.unmodeled ? "Not applied (condition not modeled)" : "Inactive"} · taken as · ${line.source}: ${line.text}`)].join("\n") || "No additional damage taken or taken-conversion lines")
  ].join("");
  const details = `<details class="dummy-recount-details"><summary>How this is calculated</summary><ul class="dummy-recount-assumptions"><li>Pool = Life × (1 − sealed %) + Energy Shield${pools.barrier ? ` + ${pools.barrier.movement ? "Barrier" : "Guard Barrier"} absorb` : ""}. Life = (${baseLife(model.characterLevel)} base + flat) × (1 + increased %) × additional; Energy Shield = (gear + flat) × (1 + increased %) × additional. Reference data: 50 Life +13 per level, no base Energy Shield, Energy Shield is deducted before Life.</li><li>Guaranteed EHP = pool ÷ [(1 − Armor reduction) × (1 − resistance) × Π(1 + additional damage taken)]. With damage taken conversion ("Converts X% of Erosion Damage taken to Cold Damage") each share takes its new type's mitigation and the shares are summed (reference data Damage Type Conversion: the type changes before Damage Mitigation; past 100% the sources are scaled to 100%; it applies to hits and damage over time). Expected = guaranteed ÷ [(1 − evade) × (1 − avoid) × (1 − block chance × block ratio)].</li><li>vs damage over time = (Life × (1 − sealed %) + Energy Shield) ÷ [(1 − resistance) × Π(1 + additional damage taken that is not hit-only) × Π(1 + additional Damage Over Time taken)]. No Barrier (it absorbs Hit Damage), no Armor, evasion or block (reference data: defensive mechanics against Hit Damage), no chance to avoid damage. The ailment of each type (Trauma · Physical, Ignite · Fire, Wilt · Erosion) also takes its own lines: "additional Ignite Damage taken" multiplies (game mod 4); "Wilt / Trauma Damage taken" lines add together (game mod 3). Immune ailments show Immune; a summed reduction of 100% or more (damage taken, effect received, chance to avoid) counts as immunity (user rule 2026-10-13).</li><li>Injury Buffer (${percentText(model.injuryBufferPercent)}) delays part of each hit; the total is unchanged, so it does not change EHP. Energy Shield charge and Life regeneration are not counted.</li>${model.assumptions.map((text) => `<li>Assumed: ${escapeHtml(text)}</li>`).join("")}${model.provisional.map((text) => `<li>Provisional: ${escapeHtml(text)}</li>`).join("")}<li>Checklist mapping: reference data Ailment page (Ignite, Frostbite, Freeze, Shock, Numbed, Trauma, Wilt) and Crowd Control Effects page (Frostbite, Freeze, Paralysis, Knockback, Weaken, Slow, Taunt, Blinding). The reference data has no Stun entry.</li></ul><p class="damage-bucket-footnote">Not an in-game figure: the Armor and Evasion formulas are the reference data's beta-data text and no hit test has calibrated them.</p></details>`;
  return `<section class="stat-sheet-banner stat-sheet-banner-wide stat-sheet-ehp-banner" aria-label="Effective HP"><h2>Effective HP <small>Level ${model.enemyLevel} hits</small></h2><section class="dummy-recount-panel ehp-panel"><header class="dummy-recount-head"><span class="dummy-recount-tab">Defense (Level ${model.enemyLevel})</span><span class="dummy-recount-duration" title="Character level is not stored in the build; it sets base Life and Evasion">Character <strong>Lv.${model.characterLevel}</strong> assumed</span></header><div class="ehp-body"><div class="ehp-main"><div class="dummy-recount-body">${hero}${pair}</div>${table}</div>${checklist}</div></section><footer class="dummy-recount-foot"><details class="dummy-recount-details ehp-layers-details" data-persist-open="ehpLayers"><summary>Defence layers</summary><div class="ehp-layers">${layers}</div></details>${details}</footer></section>`;
}
