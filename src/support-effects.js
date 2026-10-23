import { supportProgressionSs13 } from "./data/skills/support-progression-ss13.generated.js";
import { dummyTarget, explicitRadiusHolds, DISTANT_STANDING_METERS } from "./dummy-target.js";
import { residualNonDamageStatus } from "./line-families.js";
import { resolveLineCondition } from "./line-conditions.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";
import { specialSupportTierData, progressionSupportTierData, progressionSupportText, specialSupportStarBonus, isActivationMedium } from "./data/skills/special-support-tiers-ss13.js";
import { EMPOWER_MODELED_SKILLS, EMPOWER_BUFF_SKILLS } from "./empower-effects.js";
// Movement rate for per-metre support lines (Hunting Tempo, 2026-10-15 patch update): src/dummy-target.js, the same 6 m/s
// placeholder as the Thunder Focus profile (no game figure fixes it).
import { ASSUMED_MOVEMENT_METERS_PER_SECOND } from "./dummy-target.js";
export { ASSUMED_MOVEMENT_METERS_PER_SECOND };

/**
 * Elemental Impact (2026-10-15 patch update): "+X% additional Elemental Damage for the supported skill if it has dealt all types
 * of Elemental Damage recently". Active when the skill's damage types (its own, conversions, added flat damage reaching it)
 * include Fire, Cold and Lightning; "recently" holds while the skill is used continuously.
 */
export function allElementalState(dealtTypes = []) {
  const dealt = new Set(dealtTypes || []);
  const missing = ELEMENTAL.filter((type) => !dealt.has(type));
  return { active: missing.length === 0, missing };
}

/**
 * Hunting Tempo (2026-10-15 patch update): "+X% additional damage … to the next N supported skill(s) for every 6 m moved". Share
 * of the skill's uses that carry the buff: min(1, (movement m/s ÷ metres) × N ÷ uses per second).
 */
export function movementChargeShare({ uses, meters, usesPerSecond, metersPerSecond = ASSUMED_MOVEMENT_METERS_PER_SECOND }) {
  if (!(usesPerSecond > 0) || !(meters > 0)) return 0;
  return Math.min(1, (metersPerSecond / meters) * uses / usesPerSecond);
}

// Skills whose own effect is defensive only (2026-10-14): a support's Duration line adds no damage. Frost Shield (TLIDB):
// "-29% additional Physical Damage taken" / "-29% additional Fire Damage taken" while it lasts, no offensive buff or debuff.
const DEFENSIVE_ONLY_SKILLS = new Map([
  ["Frost Shield", "Frost Shield's own effect is defensive (TLIDB: -29% additional Physical and Fire Damage taken while it lasts; no offensive buff or debuff), so a longer duration adds no damage; its orbit hits per use are a fixed provisional count that does not read Duration"]
]);

// One resolver for what the supports on a setup do (research/support-batch-2026-10-12.md §6, chunk 1).
//
// resolveSupportEffects(setup, ctx) splits every enabled support into clauses — its TLIDB base text (eligibility and
// slot lines dropped), its Magnificent / Noble star line and rolled affix, and an Activation Medium's selected lines —
// reads each clause's value from its source, sorts it into a mechanic family with one ordered rule table, and returns a
// typed effect object plus a per-clause status for the engine that computes the setup's damage.
//
// Value sources (one per clause):
//   leveled    — the TLIDB progression column at the support's effective level (clamped 1–40); a cell can be a
//                fraction "a/b" or a pair "a,b" ("104,104" Added Erosion Damage, "6.5,26" Additional Ignite). The
//                pair form fixes bug B2 (it parsed as NaN and dropped every Added X Damage support on skill hits).
//   fixed      — the number in the base text (no column).
//   star       — Magnificent / Noble "+20% additional damage for the supported skill" replaced by
//                specialSupportStarBonus(stars) = (stars − 1) × 5 (user-confirmed for Disintegrate 5★ = +20%;
//                intermediate stars provisional).
//   roll       — the configured tier and roll (specialConfig) on the TLIDB T-ranges.
//   activation — an Activation Medium's selected lines (specialConfig.lines).
//
// Statuses ("In calc", "Not modeled", "No DPS effect", "Not on dummy", "Inactive", "Provisional") describe whether the
// engine that computes this setup reads the clause after chunk 1. Engines: "scorching-beam" (the calibrated beam path
// plus src/build-mechanics.js), "skill-hit", "skill-dot", "minion"; anything else reads no support clause.

const N = "([+-]?\\d+(?:\\.\\d+)?)";
const TYPES = ["Physical", "Fire", "Cold", "Lightning", "Erosion"];
const ELEMENTAL = ["Fire", "Cold", "Lightning"];
const num = (value) => Number(String(value).replace("−", "-"));
const round = (value) => Math.round(value * 10000) / 10000;
// Max Fervor Rating (keyword Fervor, game hyperlink 740: "The Max Fervor Rating is 100"), for Attack Focus's per-Rating lines.
const FERVOR_MAX_RATING = 100;

// Supports the calibrated Scorching Beam path models in dedicated modules (src/build-mechanics.js separatelyModeledSupports).
export const SCORCHING_BEAM_DEDICATED_SUPPORTS = new Set(["Control Spell", "Guard", "Refracted Prism", "Additional Ignite", "Scorching Beam: Disintegrate (Noble)", "Fire Explosion", "Added Fire Damage", "Cataclysm"]);

// Critical Strike Rating Increase: "+135% Critical Strike Rating for the supported skill" at Lv.1, +5% per support level
// with no cap (TLIDB Support_Skill: Lv1 +135%, Lv21 +235%, Lv41 +335%; the progression table's Lv.40 +330% agrees). The
// table value is used where it exists (Lv.1–40), the linear rule beyond it (B6, fixed 2026-10-12 with the user's source).
export function criticalStrikeRatingIncreasePercent(level) {
  const effective = Math.max(1, Math.round(level || 20));
  const column = supportProgressionSs13["Critical Strike Rating Increase"]?.columns?.find((item) => /Critical Strike Rating for the supported skill/i.test(item.heading));
  const table = effective <= 40 ? parseProgressionCell(column?.values?.[String(effective)])?.[0] : null;
  return Number.isFinite(table) ? table : 135 + 5 * (effective - 1);
}

/** One progression cell → its numbers ("a/b" fractions, "a,b" pairs), or null when the cell is not numeric. */
export function parseProgressionCell(raw) {
  if (raw == null) return null;
  const parts = String(raw).replace(/−/g, "-").split(",").map((part) => part.trim());
  const values = parts.map((part) => {
    if (!/^[+-]?\d+(?:\.\d+)?(?:\/[+-]?\d+(?:\.\d+)?)?$/.test(part)) return NaN;
    const [top, bottom] = part.split("/").map(Number);
    return bottom ? top / bottom : top;
  });
  return values.length && values.every(Number.isFinite) ? values : null;
}

const tidy = (text) => String(text || "").replace(/−/g, "-").replace(/\s+%/g, "%").replace(/\s+/g, " ").trim().replace(/\s*\.$/, "");
// Wording with numbers (and TLIDB tier ranges "(a–b)") replaced by "#", for matching a base line with its column or tier line.
const signature = (text) => tidy(text).replace(/\(\s*[+-]?\d+(?:\.\d+)?\s*–\s*[+-]?\d+(?:\.\d+)?\s*\)/g, "#").replace(/[+-]?\d+(?:\.\d+)?/g, "#").replace(/#\s+(?=[a-z%])/gi, "#").toLowerCase();
const supportLevel = (support) => Math.max(1, Math.min(40, Math.round(support?.effectiveLevel || support?.level || 20)));
const isSpecial = (name) => /\((?:Magnificent|Noble)\)$/.test(name || "");
const eligibility = /^(?:Supports? |Cannot support |This skill can only be installed|Support Mobility)/i;
const damageWords = /damage|speed|critical strike|cast frequency|cooldown|channeled stack|ignite|trauma|wilt|ailment|affliction|reap|multistrike|spell burst|combo|trigger/i;

// Replace the clause's numbers with the leveled values (sign kept only when the text had "+"). `indexes` is the progression
// column's numberIndexes (which of the clause's numbers each value replaces); without it, the first k numbers. Mass Effect's
// "10.5% effect … for every +1 Charge, up to 31.5%" carries [0, 2]: the "+1" stays (frost-terra audit 2026-10-13; before, the
// second value overwrote the "+1").
function substitute(text, values, indexes = null) {
  const targets = Array.isArray(indexes) && indexes.length === values.length ? indexes : values.map((_, index) => index);
  let position = -1;
  return text.replace(/[+-]?\d+(?:\.\d+)?/g, (match) => {
    position++;
    const slot = targets.indexOf(position);
    if (slot < 0) return match;
    const value = round(values[slot]);
    return `${match.startsWith("+") && value >= 0 ? "+" : ""}${value}`;
  });
}

// Which of a column heading's numbers its values replace: the column's numberIndexes when they cover every value, else the
// positions of the heading numbers equal to the Lv.1 values (the heading is the Lv.1 text). Recklessness's "0.5% … for every 1%
// Life lost, up to 16.5%" has an empty numberIndexes and Lv.1 value 16.5: the cap (position 2) changes, not the 0.5%.
function columnNumberIndexes(column) {
  const listed = column?.numberIndexes;
  const first = parseProgressionCell(column?.values?.["1"]);
  if (!first) return listed;
  if (Array.isArray(listed) && listed.length === first.length) return listed;
  const numbers = (tidy(column.heading).match(/[+-]?\d+(?:\.\d+)?/g) || []).map(Number);
  const used = new Set();
  const found = first.map((value) => {
    const index = numbers.findIndex((number, position) => !used.has(position) && Math.abs(Math.abs(number) - Math.abs(value)) < 1e-9);
    if (index >= 0) used.add(index);
    return index;
  });
  return found.every((index) => index >= 0) ? found : listed;
}

// The ordered clause rule table. `family` names the effect bucket; `build(match)` returns the parsed fields.
// Shared with the coverage badges (src/skill-coverage.js) through the clause statuses.
export const SUPPORT_CLAUSE_RULES = [
  // Conditional additional damage resolved from planner state (chunk 2; research/support-batch-2026-10-12.md §5.7).
  { family: "conditionalAdditional", pattern: new RegExp(`^The supported skill deals ${N}% additional damage to Cursed enemies$`, "i"), build: (m) => ({ value: num(m[1]), condition: "cursed" }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^The supported skill deals ${N}% additional damage to Numbed enemies\\. For every stack of Numbed the enemy has, the supported skill deals ${N}% additional damage$`, "i"), build: (m) => ({ value: num(m[1]), perStack: num(m[2]), condition: "numbed" }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^The supported skill deals ${N}% additional damage for every type of Ailment on enemy \\(multiplies\\)$`, "i"), build: (m) => ({ value: num(m[1]), condition: "ailmentTypes", multiplies: true }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill when there is only 1 enemy nearby$`, "i"), build: (m) => ({ value: num(m[1]), condition: "singleEnemy" }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill when using an? (gun|cannon|bow|crossbow)$`, "i"), build: (m) => ({ value: num(m[1]), condition: "weapon", weapon: m[2].toLowerCase() }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^The supported skill deals ${N}% additional damage to Frozen enemies`, "i"), build: (m) => ({ value: num(m[1]), condition: "frozen" }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill for every stack of buffs while standing still \\(multiplies\\)$`, "i"), build: (m) => ({ value: num(m[1]), condition: "standingStill", multiplies: true }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage \\(multiplies\\) for the supported skill for every 5 m moved recently\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), condition: "moving", multiplies: true }) },
  { family: "conditionalAdditional", pattern: new RegExp(`deals more damage to enemies that are closer within \\d+ m, dealing up to ${N}% additional damage to enemies within (\\d+) m$`, "i"), build: (m) => ({ value: num(m[1]), condition: "nearTarget", meters: num(m[2]) }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^The supported skill deals ${N}% additional damage to enemies in proximity$`, "i"), build: (m) => ({ value: num(m[1]), condition: "nearTarget" }) },
  // Recklessness (TLIDB support text): "0.5% additional damage for the supported skill for every 1% Life lost, up to 26%".
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill for every 1% Life lost, up to ${N}%$`, "i"), build: (m) => ({ value: num(m[2]), perPercent: num(m[1]), cap: num(m[2]), condition: "lifeLost" }) },
  // Willpower's buff description: the stacks the damage line above counts.
  { family: "conditionDetail", pattern: /^While standing still, gains 1 stack of buff when using the supported skill|^The buff lasts for another [\d.]+ s after you start moving/i, build: () => ({}) },
  // Elemental Impact (reworked, 2026-10-15 patch update): additional Elemental Damage while the skill deals all three Elemental types.
  { family: "allElementalAdditional", pattern: new RegExp(`^${N}% additional Elemental Damage for the supported skill if it has dealt all types of Elemental Damage recently$`, "i"), build: (m) => ({ value: num(m[1]), typed: "Elemental", scope: scopeFor("Elemental") }) },
  // Hunting Tempo (reworked, 2026-10-15 patch update): buffed next N uses per 6 m moved; the Knockback half has no dummy effect.
  { family: "movementCharges", pattern: new RegExp(`^${N}% additional damage and ${N}% Knockback Chance to the next (\\d+) supported skill\\(s\\) for every ${N} m moved$`, "i"), build: (m) => ({ value: num(m[1]), knockback: num(m[2]), uses: num(m[3]), meters: num(m[4]) }) },
  { family: "critOnlyAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill when it lands a Critical Strike$`, "i"), build: (m) => ({ value: num(m[1]) }) },
  { family: "perStack", pattern: new RegExp(`^${N}% additional damage for the supported skill for each stack of Focus Blessing, stacking up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), stackSource: "focusBlessing" }) },
  { family: "perStack", pattern: new RegExp(`^${N}% additional damage for every channeled stack$`, "i"), build: (m) => ({ value: num(m[1]), cap: null, stackSource: "channel" }) },
  { family: "perStack", pattern: new RegExp(`^${N}% additional Ignite Damage for each stack of Ignite additionally inflicted$`, "i"), build: (m) => ({ value: num(m[1]), cap: null, stackSource: "additionalIgniteStacks" }) },
  { family: "perStack", pattern: new RegExp(`^For each stack of Ignite an enemy has, the supported skill deals ${N}% additional Ignite Damage to the enemy, up to ${N}%$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), stackSource: "igniteOnEnemy" }) },
  { family: "additional", pattern: new RegExp(`^${N}% additional damage for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), scope: {} }) },
  { family: "additional", pattern: new RegExp(`^${N}% additional Hit Damage for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), scope: { hitOnly: true }, typed: "Hit" }) },
  { family: "additional", pattern: new RegExp(`^${N}% additional (Spell|Area|Projectile|Elemental|Physical|Fire|Cold|Lightning|Erosion|Melee|Attack) Damage for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), typed: m[2][0].toUpperCase() + m[2].slice(1).toLowerCase(), scope: scopeFor(m[2]) }) },
  { family: "dotAdditional", pattern: new RegExp(`^${N}% additional Damage Over Time for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]) }) },
  // Pain Amplification (TLIDB support text): additional DoT while the enemy is at Max Affliction (frost-terra audit 2026-10-13).
  { family: "maxAfflictionDot", pattern: new RegExp(`^${N}% additional Damage Over Time against enemies with Max Affliction for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]) }) },
  // Ground Divide (TLIDB support text): Terra Charge stacks and restoration speed of the supported Terra skill (src/selena-dance.js).
  { family: "terraCharge", pattern: /^\+?(\d+) Max Terra Charge stacks for the supported skill$/i, build: (m) => ({ value: num(m[1]), kind: "max" }) },
  { family: "terraCharge", pattern: new RegExp(`^${N}% Terra Charge (?:Restoration|Recovery) Speed for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "recovery" }) },
  // Empower Effect (game keyword: "The positive effect values provided by Empower Skills are affected by Empower Effect bonuses";
  // src/empower-effects.js): Mass Effect, Well-Fought Battle, Blizzard: Freezing Point.
  { family: "empower", pattern: new RegExp(`^${N}% effect for the supported skill for every \\+?(\\d+) Charge, up to ${N}%$`, "i"), build: (m) => ({ value: num(m[1]), per: num(m[2]), cap: num(m[3]), kind: "perCharge" }) },
  { family: "empower", pattern: /^\+?(\d+) Max Charges for the supported skill$/i, build: (m) => ({ value: num(m[1]), kind: "charges" }) },
  { family: "empower", pattern: new RegExp(`^The supported skill ${N}% Effect every time it is cast, stacking up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), kind: "perCast" }) },
  { family: "empower", pattern: new RegExp(`^${N}% additional Empower Effect for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "additional" }) },
  { family: "empower", pattern: /^Debuffs inflicted when the supported skill hits are now affected by Empower Effect$/i, build: () => ({ kind: "debuffs" }) },
  { family: "empower", pattern: new RegExp(`^The cooldown of the supported skill becomes ${N} s, and the duration of inflicted debuffs becomes ${N} s$`, "i"), build: (m) => ({ cooldown: num(m[1]), duration: num(m[2]), kind: "timing" }) },
  { family: "empower", pattern: /^The supported skill becomes an Empower Skill(?: and no longer has a casting action)?$/i, build: () => ({ kind: "becomes" }) },
  { family: "ailmentAdditional", pattern: new RegExp(`^${N}% additional (Ailment|Ignite|Trauma|Wilt|Deterioration) Damage for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), ailment: m[2].toLowerCase() }) },
  { family: "minion", pattern: /for Minions summoned by the supported skill|Minions summoned by the supported skill/i, build: (m, text) => ({ value: num(text.match(new RegExp(`^${N}% additional damage for Minions summoned by the supported skill$`, "i"))?.[1] ?? NaN) }) },
  { family: "increased", pattern: new RegExp(`^${N}% (?:(Spell|Area|Projectile|Elemental|Physical|Fire|Cold|Lightning|Erosion|Hit) )?damage for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), typed: m[2] || null, scope: m[2] ? scopeFor(m[2]) : {} }) },
  { family: "added", pattern: new RegExp(`^(?:Adds|The supported skill adds|Supported skills add) ${N} - ${N} (Physical|Fire|Cold|Lightning|Erosion) Damage(?: to the supported skill)?$`, "i"), build: (m) => ({ min: num(m[1]), max: num(m[2]), type: m[3][0].toUpperCase() + m[3].slice(1).toLowerCase() }) },
  { family: "addedAs", pattern: new RegExp(`^Adds ${N}% of (\\w+) Damage as (\\w+) Damage to the supported skill`, "i"), build: (m) => ({ percent: num(m[1]), from: m[2], to: m[3] }) },
  { family: "conversion", pattern: new RegExp(`^(?:The supported skill )?Converts ${N}% of (?:the supported skill's )?(\\w+) Damage (?:in)?to (\\w+) Damage`, "i"), build: (m) => ({ percent: num(m[1]), from: m[2], to: m[3] }) },
  { family: "speed", pattern: new RegExp(`^${N}% (additional )?Attack and Cast Speed for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), additional: Boolean(m[2]), kind: "both" }) },
  { family: "speed", pattern: new RegExp(`^${N}% (additional )?(Attack|Cast) Speed for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), additional: Boolean(m[2]), kind: m[3].toLowerCase() }) },
  { family: "speed", pattern: new RegExp(`^${N}% (additional )?Cast Frequency for Sentries deployed by the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), additional: Boolean(m[2]), kind: "castFrequency" }) },
  { family: "cooldown", pattern: new RegExp(`^${N}% (additional )?Cooldown Recovery Speed for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), additional: Boolean(m[2]) }) },
  // Activation Medium wording of the same line (its cooldown-or-duration choice group keeps only the selected one).
  { family: "cooldown", pattern: new RegExp(`^The supported skill ${N}% (additional )?Cooldown Recovery Speed$`, "i"), build: (m) => ({ value: num(m[1]), additional: Boolean(m[2]) }) },
  { family: "duration", pattern: new RegExp(`^${N}% (additional )?Duration for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), additional: Boolean(m[2]) }) },
  { family: "channel", pattern: /^\+?(\d+) Max Channeled Stacks for the supported skill$/i, build: (m) => ({ value: num(m[1]), kind: "max" }) },
  { family: "channel", pattern: /^\+?(\d+) to the Min Channeled Stacks for the supported skill$/i, build: (m) => ({ value: num(m[1]), kind: "min" }) },
  { family: "crit", pattern: new RegExp(`^${N}% Critical Strike Rating for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "ratingPercent" }) },
  { family: "crit", pattern: new RegExp(`^${N}% additional Critical Strike Rating for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "ratingAdditional" }) },
  { family: "crit", pattern: new RegExp(`^${N} Critical Strike Rating for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "ratingFlat" }) },
  { family: "ailmentChance", pattern: new RegExp(`^${N}% (Ignite|Trauma|Wilt|Frostbite|Shock|Numbed) chance for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), ailment: m[2].toLowerCase() }) },
  { family: "ailmentExtraStacks", pattern: new RegExp(`^${N}% chance for the supported skill to inflict (\\d+) additional stacks? of (Ignite|Trauma|Wilt)$`, "i"), build: (m) => ({ chancePercent: num(m[1]), value: num(m[2]), ailment: m[3].toLowerCase() }) },
  { family: "ailmentChance", pattern: new RegExp(`^${N}% chance for the supported skill to inflict (Ignite|Trauma|Wilt|Damaging Ailments)$`, "i"), build: (m) => ({ value: num(m[1]), ailment: /Damaging/i.test(m[2]) ? "damaging" : m[2].toLowerCase() }) },
  { family: "ailmentExtraStacks", pattern: /^The supported skill inflicts (\d+) additional stack\(s\) of (Ignite|Trauma|Wilt)$/i, build: (m) => ({ chancePercent: 100, value: num(m[1]), ailment: m[2].toLowerCase() }) },
  { family: "ailmentBase", pattern: new RegExp(`^Adds ${N} - ${N} Base (Ignite|Trauma|Wilt) Damage to the supported skill$`, "i"), build: (m) => ({ min: num(m[1]), max: num(m[2]), ailment: m[3].toLowerCase() }) },
  { family: "ailmentBlock", pattern: /^The supported skill cannot inflict (.+)$/i, build: (m) => ({ ailments: m[1].split(/,\s*|\s+or\s+/i).map((item) => item.trim().toLowerCase()).filter(Boolean) }) },
  { family: "ailmentInflict", pattern: /^Inflicts (Frostbite|Numbed|Shock|Freeze) when the supported skill deals Hit (\w+) Damage$/i, build: (m) => ({ ailment: m[1].toLowerCase(), hitType: m[2] }) },
  { family: "target", pattern: new RegExp(`^${N}% additional damage taken by the enemy selected by the supported skill`, "i"), build: (m) => ({ value: num(m[1]) }) },
  { family: "conditionalTyped", pattern: new RegExp(`more damage to enemies with more Life, up to ${N}% additional (Physical|Fire|Cold|Lightning|Erosion) Damage$`, "i"), build: (m) => ({ value: num(m[1]), typed: m[2] }) },
  { family: "affliction", pattern: /^When the supported skill deals Damage Over Time, it inflicts (\d+) Affliction|^Affliction grants an additional ([\d.]+)% effect to the supported skill$/i, build: (m) => ({ value: num(m[1] ?? m[2]), kind: m[1] ? "perSecond" : "effect" }) },
  // Immolate: no max-stack explosion; explosions come from stacks gained, and the channel is held at full stacks
  // (own buffs pre-built), so none occur in the steady state (provisional reading).
  { family: "channelTransform", pattern: /^No explosions will be generated at max channeled stacks/i, build: () => ({}) },
  // Activation Medium lines (chunk 3). Manual "Cast" / "Use" / "Trigger": using and triggering are both casting; a
  // triggered skill "generates skill effects directly without any action" (no use time).
  { family: "manualPenalty", pattern: new RegExp(`^${N}% additional damage for manually used Supported Skill$`, "i"), build: (m) => ({ value: num(m[1]) }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^Auto-used supported skills ${N}% additional damage$`, "i"), build: (m) => ({ value: num(m[1]), condition: "standingStill", autoUsed: true }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^The next skill triggered by the supported skill ${N}% additional damage for every \\d+m of movement made during the trigger interval, up to ${N}%$`, "i"), build: (m) => ({ value: num(m[2]), perMeter: num(m[1]), condition: "moving", triggeredOnly: true }) },
  { family: "conditionalAdditional", pattern: /^The supported skill is supported by Lv\. (\d+) Willpower$/i, build: (m) => ({ value: 6, condition: "standingStill", multiplies: true, grantedWillpower: num(m[1]) }) },
  // First trigger after engaging (user decision 2026-10-22: skills start ready; a trigger that only fires after a delay waits for
  // it): an "Always attempts to trigger …" medium (Perpetual Motion, Boss / Elite, Wind Rhythm) starts ready like the skill, so it
  // fires at engagement (`startsReady`; its Interval / Cooldown spaces the later triggers; provisional reading, open question
  // "activation-medium-first-trigger"); a "Triggers … every X s" medium (Instruction, Rhythm) fires first X s in; Multistrike at
  // the first Max Multistrike Count event (src/skill-hit-model.js firstUseSeconds).
  { family: "trigger", pattern: new RegExp(`^Always attempts to trigger the supported skill\\. Interval: ${N}\\s*s$`, "i"), build: (m) => ({ kind: "interval", interval: num(m[1]), startsReady: true }) },
  { family: "trigger", pattern: new RegExp(`^Always attempts to trigger the supported skill when there is an? (boss|Elite) within ${N} m\\. Interval: ${N}\\s*s$`, "i"), build: (m) => ({ kind: "target", target: m[1].toLowerCase(), meters: num(m[2]), interval: num(m[3]), startsReady: true }) },
  { family: "trigger", pattern: new RegExp(`^Triggers the supported skill on the closest enemy within ${N}\\s*m every ${N}\\s*s\\.?$`, "i"), build: (m) => ({ kind: "interval", meters: num(m[1]), interval: num(m[2]) }) },
  { family: "trigger", pattern: new RegExp(`^Always attempts to trigger the supported skill on the closest enemy within ${N}\\s*m\\. Cooldown: ${N}\\s*s$`, "i"), build: (m) => ({ kind: "interval", meters: num(m[1]), interval: num(m[2]), castSpeedScaled: true, startsReady: true }) },
  // Activation Medium: Multistrike (TLIDB, 2026-10-14): one trigger per Max Multistrike Count event of the build's multistriking
  // skills, at most one per Interval; capped by the supported skill's cooldown (rate = 1 / max(trigger interval, effective
  // cooldown), the rule user-confirmed for Activation Medium: Boss on 2026-10-12). The event rate comes from the planner's hit
  // pass (src/planner.js hitRateFacts).
  { family: "trigger", pattern: new RegExp(`^Triggers the supported skill upon reaching the max Multistrike Count\\. Interval: ${N}\\s*s$`, "i"), build: (m) => ({ kind: "maxMultistrike", interval: num(m[1]) }) },
  { family: "triggerDetail", pattern: new RegExp(`^${N}% of the bonuses and additional bonuses for Cast Speed is also applied to the Cooldown Recovery Speed of this Support Skill and the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "castSpeedShare" }) },
  { family: "trigger", pattern: /^Automatically (?:and continuously cast the supported skill|use the Supported Attack Skill to continuously attack)(?: at)? the nearest enemy within [\d.]+\s*m while standing still$/i, build: () => ({ kind: "autoUse" }) },
  { family: "trigger", pattern: /upon stopping moving|upon starting to move|when stopping moving/i, build: () => ({ kind: "movementEvent" }) },
  { family: "trigger", pattern: /Energy Shield is lower than|HP is lower than|Severe Injury/i, build: () => ({ kind: "playerState" }) },
  { family: "trigger", pattern: /upon entering the stage/i, build: () => ({ kind: "summon" }) },
  { family: "trigger", pattern: /^(?:Triggers|Always attempts to trigger|Prepares|Activates|When)\b.*\b(?:trigger|Triggers|Instruction|Resonance|Prepares)/i, build: () => ({ kind: "event" }) },
  { family: "trigger", pattern: /^(?:Triggers|Always attempts to trigger|Prepares) the supported skill|triggered by the supported skill|^Interval:/i, build: () => ({ kind: "event" }) },
  // Chunk 4 families (research/support-batch-2026-10-12.md §8).
  { family: "projectileQuantity", pattern: /^(?:Projectile Quantity of the supported skill \+?(\d+)|\+?(\d+) Projectile Quantity for the supported skill)$/i, build: (m) => ({ value: num(m[1] ?? m[2]) }) },
  { family: "multistrike", pattern: new RegExp(`^${N}% chance for the supported skill to trigger Multistrike$`, "i"), build: (m) => ({ value: num(m[1]), kind: "chance" }) },
  { family: "multistrike", pattern: new RegExp(`^Multistrikes of the supported skill deal ${N}% increasing damage$`, "i"), build: (m) => ({ value: num(m[1]), kind: "increment" }) },
  // Steep Strike chance on the supported skill (Raging Slash; 2026-10-14): summed with the skill's own chance and the build's
  // plain lines in src/skill-hit-model.js steepStrikeState.
  { family: "steepStrike", pattern: new RegExp(`^The supported skill ${N}% Steep Strike chance\\.?$`, "i"), build: (m) => ({ value: num(m[1]), kind: "chance" }) },
  // Thunder Slash: Big Stride (Noble; TLIDB): "After moving 8 m, the supported skill is guaranteed to launch a Steep Strike over
  // the next 4s". User-supplied reading (2026-10-14; the window held while moving confirmed by a user-supplied answer
  // 2026-10-15): every attack in the 4 s window is a Steep Strike; best case the window is always open while Moved recently
  // holds (the user's always-moving rule), so every use is a Steep Strike (provisional).
  { family: "steepStrike", pattern: new RegExp(`^After moving ${N}\\s*m, the supported skill is guaranteed to launch a Steep Strike over the next ${N}\\s*s$`, "i"), build: (m) => ({ value: 0, kind: "guaranteedAfterMoving", meters: num(m[1]), seconds: num(m[2]) }) },
  // Thunder Slash: Blade Cluster (Magnificent; TLIDB): "Generates 2 additional Steep Strikes when the supported skill launches a
  // Steep Strike". User-supplied answer (2026-10-15, provisional; replaces the 2026-10-14 "+2 max stored attempts" reading): each
  // launched Steep Strike produces 2 additional Steep Strike hits on the same target, so the Steep Strike component deals × 3
  // its hits per launch (src/skill-hit-model.js steepStrikeState clusterHits). Supports Thunder Slash only (game support filter).
  { family: "steepStrike", pattern: new RegExp(`^Generates ${N} additional Steep Strikes when the supported skill launches a Steep Strike$`, "i"), build: (m) => ({ value: 0, attempts: num(m[1]), kind: "extraAttempts" }) },
  // Thunder Spike: Tremble (Noble; TLIDB tiers T2 58–65, T1 66–71, T0 72–83): a buff on Critical Strike for the supported
  // skill's Numbed. src/planner.js settles its uptime from the skill's crit hits per second (provisional).
  { family: "critBuff", pattern: new RegExp(`^The supported skill gains a buff on Critical Strike: ${N}% Numbed Effect for ${N}\\s*s$`, "i"), build: (m) => ({ value: num(m[1]), seconds: num(m[2]), kind: "numbedEffect" }) },
  // Periodic Burst (TLIDB): "Gains a stack of buff when using the supported skill every 6s: +20.5% Attack and Cast Speed after
  // using a Mobility Skill" / "The buff lasts 2s". src/planner.js applies it to every skill at uptime duration ÷ max(6 s,
  // the Mobility skill's cooldown) (provisional).
  { family: "periodicBuff", pattern: new RegExp(`^Gains a stack of buff when using the supported skill every ${N}\\s*s: ${N}% Attack and Cast Speed after using a Mobility Skill$`, "i"), build: (m) => ({ kind: "speed", everySeconds: num(m[1]), value: num(m[2]) }) },
  { family: "periodicBuff", pattern: new RegExp(`^The buff lasts ${N}\\s*s$`, "i"), build: (m) => ({ kind: "duration", seconds: num(m[1]) }) },
  // All In (TLIDB, Lv1 20% … Lv20 29.5% … Lv40 35.7%): "When casting the supported skill, gains the buff:" / "X% additional
  // Evasion. It drops to 0 gradually within 4s" — defence only; src/effective-hp.js time-averages it.
  { family: "buffHeader", pattern: /^When casting the supported skill, gains the buff:$/i, build: () => ({}) },
  { family: "decayingEvasion", pattern: new RegExp(`^${N}% additional Evasion\\. It drops to 0 gradually within ${N}\\s*s$`, "i"), build: (m) => ({ value: num(m[1]), seconds: num(m[2]) }) },
  { family: "spellBurst", pattern: new RegExp(`^${N}% additional Hit Damage for the supported skills cast by Spell Burst$`, "i"), build: (m) => ({ value: num(m[1]), kind: "hitAdditional" }) },
  // Spell Burst Charge Speed on a support (game manual: full charge time 2 s ÷ (1 + Σ increased) ÷ Π(1 + additional); src/skill-hit-model.js spellBurstChargeTime).
  { family: "spellBurst", pattern: new RegExp(`^${N}% (additional )?Spell Burst Charge Speed(?: for the supported skills?)?$`, "i"), build: (m) => ({ value: num(m[1]), kind: m[2] ? "chargeAdditional" : "chargeIncreased" }) },
  { family: "combo", pattern: new RegExp(`^${N}% Combo Finisher Amplification for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "amplification" }) },
  { family: "combo", pattern: new RegExp(`^${N} Combo Points gained from Combo Starters for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "points" }) },
  // Gear affix batch B (2026-10-22): Haunt's Shadow Quantity (game field 2012000) and Carpet Bombardment's per-wave damage (field
  // 2501029), read by src/skill-hit-model.js shadowState / barrageWaveState with the gear lines of the same stat.
  { family: "shadow", pattern: new RegExp(`^${N} (?:to )?Shadow Quantity for (?:the supported skill|this skill)$`, "i"), build: (m) => ({ value: num(m[1]), kind: "quantity" }) },
  { family: "barrage", pattern: new RegExp(`^The supported skill ${N}% damage increase per wave$`, "i"), build: (m) => ({ value: num(m[1]), kind: "perWave" }) },
  // Gear affix batch C (2026-10-22): supports gear lines grant ("Main Skill is supported by Lv. N <Support>"), TLIDB texts.
  // Attack Focus: Fervor Rating on hit (game affix 201391632: +P1 to resource 1, Fervor Rating, when the supported skill hits) and
  // per-10-Rating damage / Critical Strike Rating, settled from the held Rating in resolveSupportEffects (`fervorScaled`).
  { family: "fervorScaled", pattern: new RegExp(`^Gains ${N} Fervor Rating when the supported skill hits an enemy$`, "i"), build: (m) => ({ value: num(m[1]), kind: "gain" }) },
  { family: "fervorScaled", pattern: new RegExp(`^The supported skill ${N}% additional damage for every ${N} Fervor Rating$`, "i"), build: (m) => ({ value: num(m[1]), every: num(m[2]), kind: "damage" }) },
  { family: "fervorScaled", pattern: new RegExp(`^For every ${N} Fervor Rating, the supported skill ${N}% Critical Strike Rating$`, "i"), build: (m) => ({ value: num(m[2]), every: num(m[1]), kind: "crit" }) },
  // Dual Onslaught (game affix 381754400: while Dual Wielding (tag 4000530), the supported skill's casts alternate: the 1st takes
  // the speed, the 2nd the additional damage and Skill Area).
  { family: "buffHeader", pattern: /^While Dual Wielding:$/i, build: () => ({ dualWieldHeader: true }) },
  { family: "alternating", pattern: new RegExp(`^${N}% Attack and Cast Speed for every 1st cast of the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "speed" }) },
  { family: "alternating", pattern: new RegExp(`^${N}% additional damage and ${N}% Skill Area for every 2nd cast of the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "damage" }) },
  // Empowered Insight / Empowered Channeling (conditions in src/line-conditions.js).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill while affected by at least ${N} Empower Skill\\(s\\)$`, "i"), build: (m) => ({ value: num(m[1]), condition: "empowerSkills", min: num(m[2]) }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill for every 1 s spent channeling, up to ${N} time\\(s\\)$`, "i"), build: (m) => ({ value: num(m[1]), condition: "channelSeconds", cap: num(m[2]) }) },
  { family: "nonDamage", pattern: /^This effect lasts up to [\d.]+ ?s longer when channeling stops$/i, build: () => ({}) },
  // Precise Restrain / Restrain on an Aura: "X% Sealed Mana Compensation for the supported skill" reaches the Aura reservation
  // (src/aura-effects.js auraSupportSealedManaCompensation reads it from the support's own text and progression).
  { family: "sealedManaCompensation", pattern: new RegExp(`^${N}% (additional )?Sealed Mana Compensation for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), additional: Boolean(m[2]) }) },
  // Grudge (TLIDB; leveled Lv1 31 … Lv40 70): Paralysis on a Cursed target when the supported skill deals damage (manual rule
  // 1002020420: +15% damage taken, 4 s base duration, 1 stack). src/combat-states.js chanceParalysis reads it at the planner's hit rate.
  { family: "paralysis", pattern: new RegExp(`^When the supported skill deals damage to a Cursed target, there is a ${N}% chance to Paralyze it$`, "i"), build: (m) => ({ chancePercent: num(m[1]) }) },
  // Groundshaker: Cripple (Noble) (2026-10-14): Paralysis on every hit of the spreading fissure, no Curse needed. The
  // Groundshaker profile (src/attack-hit-profiles.js "fissure") lands the fissure on the dummy once per Demolisher Charge
  // consumed, so the fissure's hit rate drives the uptime; a skill without a fissure component is Not on dummy.
  { family: "paralysis", pattern: /^When the fissure created by the supported skill spreads, inflicts Paralysis on enemies on hit$/i, build: () => ({ chancePercent: 100, fissure: true }) },
  { family: "selfDebuff", pattern: new RegExp(`^When the supported skill deals damage, there is a ${N}% chance to inflict a debuff: ${N}% damage taken by the enemy from the supported skill for ${N} s$`, "i"), build: (m) => ({ chancePercent: num(m[1]), value: num(m[2]), durationSeconds: num(m[3]) }) },
  { family: "reaping", pattern: new RegExp(`^Reaps ${N} s of Damage Over Time when the supported skill hits\\. Only Reaps (\\w+) Damage dealt by the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "onHit", ailment: m[2].toLowerCase() }) },
  { family: "reaping", pattern: new RegExp(`^For every \\+1 Beam the supported skill has, ${N}% additional Reaping Recovery Speed for Reaping that is triggered when this skill reaches max channeled stacks$`, "i"), build: (m) => ({ value: num(m[1]), kind: "recoveryPerBeam" }) },
  { family: "beams", pattern: /^\+?(\d+) additional Beams for the supported Beam Skill$/i, build: (m) => ({ value: num(m[1]) }) },
  { family: "tags", pattern: /^The supported skill gains the (\w+) Tag$/i, build: (m) => ({ tag: m[1], kind: "add" }) },
  { family: "tags", pattern: /^(?:Removes the (\w+) [Tt]ag(?: (?:from|of) the supported skill)?|The supported skill loses the (\w+) [Tt]ag)$/i, build: (m) => ({ tag: m[1] ?? m[2], kind: "remove" }) },
  // Typed damage taken the supported skill inflicts on the enemy (Wilting Beam: Dispirit, Flame Jet: Scorched Earth,
  // Burning Shot: Ignition): a build-wide enemy debuff while the skill deals damage (uptime 1: provisional).
  { family: "targetTaken", pattern: new RegExp(`${N}% additional (Physical|Fire|Cold|Lightning|Erosion|Ignite) Damage taken (?:by (?:the enemy|enemies)|for enemies)`, "i"), build: (m) => ({ value: num(m[1]), typed: m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() }) },
  // Deepened Curse (TLIDB; leveled Lv1 4.05% … Lv21 5.05%): "Enemies take X% additional damage if affected by curses inflicted by
  // the supported skill for at least N s": an enemy debuff on the dummy while the supported curse has been on it for N s
  // (src/planner.js; 2026-10-18, it read No DPS effect before).
  { family: "curseTaken", pattern: new RegExp(`^Enemies take ${N}% additional damage if affected by curses inflicted by the supported skill for at least ${N}\\s*s$`, "i"), build: (m) => ({ value: num(m[1]), delaySeconds: num(m[2]) }) },
  // Kill-driven lines (Feud's "+5% ... for every enemy defeated by the supported skill"): the dummy is never defeated.
  { family: "notOnDummy", pattern: /for every enemy defeated|on kill|when (?:the supported skill )?defeats? an enemy/i, build: () => ({}) },
  { family: "nonDamage", pattern: /Skill Area for the supported skill|Beam Length|Knockback|Evasion|Life will be consumed|Projectile Speed for the supported skill/i, build: () => ({}) }
];

function scopeFor(word) {
  const type = String(word);
  const proper = type[0].toUpperCase() + type.slice(1).toLowerCase();
  if (TYPES.includes(proper)) return { damageTypes: [proper] };
  if (proper === "Elemental") return { damageTypes: [...ELEMENTAL] };
  if (proper === "Hit") return { hitOnly: true };
  return { skillTags: [proper] };
}

/** Classify one clause text → { family, ...fields } (family "other" when no rule matches). */
export function classifySupportClause(text) {
  const clean = tidy(text);
  for (const rule of SUPPORT_CLAUSE_RULES) {
    const match = clean.match(rule.pattern);
    if (match) return { family: rule.family, ...rule.build(match, clean) };
  }
  return { family: "other" };
}

// The config a setup carries for a Magnificent / Noble / Activation Medium support.
function configFor(setup, support, specialSupportConfigs = {}) {
  if (support.specialConfig && Object.keys(support.specialConfig).length) return support.specialConfig;
  const keys = [`${setup?.setupKey || setup?.instanceId || setup?.name}:${support.name}`, `${setup?.name}:${support.name}`];
  for (const key of keys) if (specialSupportConfigs[key]) return specialSupportConfigs[key];
  return {};
}

// Raw clauses of one support: { text, origin, level?, tier?, stars? }.
function supportClauses(setup, support, ctx) {
  const name = support.name;
  const entry = supportProgressionSs13[name];
  const level = supportLevel(support);
  const special = isSpecial(name);
  const config = configFor(setup, support, ctx.specialSupportConfigs);
  const starValue = Number.isFinite(support.starAdditionalDamagePercent) ? support.starAdditionalDamagePercent : special ? specialSupportStarBonus(config.stars ?? 1) : 0;
  const stars = support.stars ?? config.stars ?? (special ? 1 : null);
  const clauses = [];
  let starDone = false;
  const amSelected = isActivationMedium(name) && (Array.isArray(config.lines) || config.tier != null) ? String(progressionSupportText(name, config) || "").split(" | ").map(tidy).filter(Boolean) : [];
  const lines = String(entry?.baseEffect || "").split(/\r?\n/).map(tidy).filter(Boolean);
  for (const line of lines) {
    if (eligibility.test(line)) continue;
    // Summon skills' Magnificent / Noble star line names their Minions ("+20% additional damage for Minions summoned by the
    // supported skill"); the same star rule applies to it.
    const minionStar = special && /^\+?20% additional damage for Minions summoned by the supported skill$/i.test(line);
    if (special && (minionStar || /^\+?20% additional damage for the supported skill$/i.test(line))) {
      clauses.push({ text: `+${starValue}% additional damage for ${minionStar ? "Minions summoned by " : ""}the supported skill`, baseText: line, origin: "star", stars });
      starDone = true;
      continue;
    }
    if (isActivationMedium(name) && (Array.isArray(config.lines) || config.tier != null)) {
      // Activation Medium base lines repeat a tier line; the selected lines below hold the rolls. A base line no selected
      // line covers (TLIDB's T0 rows omit Rhythm / Instruction's trigger interval) keeps its base range at the best-case
      // end: the shortest interval, else the highest value (provisional).
      if (amSelected.some((selected) => signature(selected) === signature(line))) continue;
      if (/\(\s*-?\d/.test(line)) {
        const best = line.replace(/\((-?\d+(?:\.\d+)?)\s*–\s*(-?\d+(?:\.\d+)?)\)\s*(m|s)?/g, (match, low, high, unit) => `${/every|Interval|Cooldown/i.test(line) && unit === "s" ? Math.min(+low, +high) : Math.max(+low, +high)}${unit ? ` ${unit}` : ""}`);
        clauses.push({ text: tidy(best), baseText: line, origin: "fixed", bestCaseRange: true });
        continue;
      }
    }
    const column = (entry?.columns || []).find((item) => signature(item.heading) === signature(line));
    const values = column ? parseProgressionCell(column.values?.[String(level)]) : null;
    // Critical Strike Rating Increase past the Lv.40 table: the linear TLIDB rule (criticalStrikeRatingIncreasePercent).
    const effectiveLevel = Math.max(1, Math.round(support.effectiveLevel || support.level || 20));
    if (name === "Critical Strike Rating Increase" && column && effectiveLevel > 40) { const value = criticalStrikeRatingIncreasePercent(effectiveLevel); clauses.push({ text: substitute(line, [value]), baseText: line, origin: "leveled", level: effectiveLevel, values: [value] }); continue; }
    clauses.push(values ? { text: substitute(line, values, columnNumberIndexes(column)), baseText: line, origin: "leveled", level, values } : { text: line, baseText: line, origin: "fixed" });
  }
  // A star bonus without a base line (direct callers, or a support missing from the progression data).
  if (!starDone && starValue) clauses.push({ text: `+${starValue}% additional damage for the supported skill`, baseText: "star bonus", origin: "star", stars });
  // Scorching Beam specials keep their own tier tables (one roll); the others use the TLIDB progression tiers.
  const beamTiers = specialSupportTierData(name);
  if (beamTiers) {
    const roll = Number(config.roll ?? config.rolls?.[0]);
    // A saved roll without a tier (older saves) falls in the tier whose range holds it.
    const tier = beamTiers.find((item) => item.tier === config.tier) || beamTiers.find((item) => roll >= item.min && roll <= item.max) || null;
    if (Number.isFinite(roll) && tier) clauses.push({ text: `+${roll}% ${tier.effect}`, baseText: `T${tier.tier} affix`, origin: "roll", tier: tier.tier });
  } else if (progressionSupportTierData(name) && config && (config.tier != null || Array.isArray(config.lines))) {
    const text = progressionSupportText(name, config);
    for (const part of String(text || "").split(" | ").map(tidy).filter(Boolean)) {
      // One TLIDB row can join two sentences ("... skill +5% additional damage taken ..."): split on a following "+N%".
      const pieces = isActivationMedium(name) ? [part] : part.split(/(?<=supported skill)\s+(?=[+-]\d+(?:\.\d+)?%\s)/).map(tidy).filter(Boolean);
      for (const piece of pieces) clauses.push({ text: piece, baseText: part, origin: isActivationMedium(name) ? "activation" : "roll", tier: config.tier });
    }
  }
  return clauses;
}

// Per-engine status of one classified clause (chunk 1 consumers).
function clauseStatus(clause, support, ctx) {
  const engine = ctx.engine;
  const name = support.name;
  const beam = engine === "scorching-beam";
  const dedicated = beam && SCORCHING_BEAM_DEDICATED_SUPPORTS.has(name);
  const attack = ctx.speedType === "attack-speed";
  const types = ctx.dealtTypes || [];
  const tags = ctx.tags || new Set();
  const s = (status, reason, consumers = []) => ({ status, reason, consumers });
  // Empower skills whose buff the planner models without a damage engine of their own (src/empower-effects.js: Bull's Rage's
  // Euphoria, 2026-10-14): their trigger, cooldown, duration and Empower Effect clauses set the buff's value and uptime.
  if (!engine && EMPOWER_BUFF_SKILLS.has(ctx.skillName)) {
    const buff = EMPOWER_BUFF_SKILLS.get(ctx.skillName);
    if (clause.family === "empower") return s("Provisional", `Empower Effect of ${buff} (src/empower-effects.js)${clause.kind === "perCast" ? `; ${clause.cap} stacks with own buffs built before engaging, 1 on a cold start` : ""}`, ["empower"]);
    if (clause.family === "trigger" && clause.kind === "maxMultistrike") return s("Provisional", `triggered at the build's Max Multistrike Count events, at most once per ${clause.interval} s, capped by the skill's cooldown: uses per second = 1 / max(trigger interval, effective cooldown) (rule user-confirmed 2026-10-12 for Activation Medium: Boss); sets the uptime of ${buff}`, ["empower"]);
    if (clause.family === "cooldown") return s("Provisional", `shortens the cooldown that caps the use rate, and so raises the uptime of ${buff}`, ["empower"]);
    if (clause.family === "duration") return s("Provisional", `lengthens ${buff}, raising its uptime`, ["empower"]);
  }
  // A curse support's enemy debuff (Deepened Curse): the planner adds it while the supported curse is on the dummy (src/planner.js).
  if (clause.family === "curseTaken") return !tags.size || tags.has("Curse") ? s("Provisional", `+${clause.value}% additional damage taken by the dummy once the supported curse has been on it for ${clause.delaySeconds} s (skill hits; the 5 s / 20 s windows start it at ${clause.delaySeconds} s)`, ["planner"]) : s("Inactive", "the supported skill is not a Curse");
  // Sealed Mana Compensation on an Aura (Restrain, Precise Restrain, Seal Conversion; gear affix batch C): the Aura reservation reads
  // it (src/aura-effects.js auraSupportSealedManaCompensation, src/engine.js), whatever the damage engine.
  if (clause.family === "sealedManaCompensation") return tags.has("Aura") || ctx.role === "aura" ? s("In calc", "the Aura's Sealed Mana: Σ local compensation and Π additional compensation (src/aura-effects.js auraSupportSealedManaCompensation; the progression table at the support's level)", ["aura"]) : s("No DPS effect", "the supported skill reserves no Mana");
  if (!["scorching-beam", "skill-hit", "skill-dot", "minion"].includes(engine)) return s("Not modeled", "the setup's own damage has no engine that reads support clauses");
  // Residual (C) wordings with no dummy-damage effect (src/line-families.js; residual batch 2026-10-12 §6).
  const residual = residualNonDamageStatus(clause.text);
  if (residual) return s(residual.status, residual.reason);
  if (engine === "minion" && clause.family !== "minion") {
    if (["additional", "increased", "critOnlyAdditional", "dotAdditional", "perStack", "allElementalAdditional", "movementCharges"].includes(clause.family)) return s("No DPS effect", "Minions take only lines that name Minions (manual rule 1001011821)");
    return s("Not modeled", "minion engine reads no support clause yet (chunk 3)");
  }
  switch (clause.family) {
    case "additional": {
      if (beam) {
        if (dedicated) return s("In calc", "dedicated Scorching Beam model", ["scorching-beam"]);
        if (clause.typed) {
          if (["Fire", "Elemental"].includes(clause.typed)) return s("In calc", "Scorching Beam hits and its Ignite (typed line on the supported skill's own ailment: provisional, Q9)", ["scorching-beam", "ignite"]);
          if (hitTypedApplies(clause.typed, ["Fire"], tags)) return s("In calc", "Scorching Beam hits (hit-scoped; never Ignite)", ["scorching-beam"]);
          return s("Inactive", "does not reach Scorching Beam's Fire hits");
        }
        return s("In calc", "Scorching Beam hits and Ignite (src/build-mechanics.js)", ["scorching-beam", "ignite"]);
      }
      if (engine === "skill-hit") {
        if (!clause.typed) return s("In calc", "skill hits", ["skill-hit"]);
        if (hitTypedApplies(clause.typed, types, tags)) return s("In calc", "skill hits", ["skill-hit"]);
        return s("Inactive", `does not reach this skill's ${types.join("/") || "hits"}`);
      }
      // skill-dot
      if (!clause.typed) return s("In calc", "the skill's damage over time", ["skill-dot"]);
      if (clause.typed === "Hit") return s("No DPS effect", "hit-only line; damage over time does not hit");
      if (clause.typed === "Area") return s("No DPS effect", "Area Damage never boosts damage over time (user-confirmed 2026-10-11)");
      if (clause.typed === "Spell") return tags.has("Spell") ? s("In calc", "Spell skill's own damage over time (user-confirmed 2026-10-11)", ["skill-dot"]) : s("Inactive", "the skill is not a Spell");
      if (["Projectile", "Melee", "Attack"].includes(clause.typed)) return s("No DPS effect", `"${clause.typed}" scope on damage over time: no effect assumed by analogy with Area (provisional)`);
      return dotTypedApplies(clause.typed, ctx.damageType) ? s("In calc", "the skill's damage over time", ["skill-dot"]) : s("Inactive", `the damage over time is ${ctx.damageType || "untyped"}`);
    }
    case "conditionalAdditional": {
      if (clause.active == null) return s("Provisional", clause.conditionText, [engine]);
      if (!clause.active) return s("Inactive", clause.conditionText);
      return s(clause.provisional ? "Provisional" : "In calc", clause.conditionText, [engine]);
    }
    case "allElementalAdditional": {
      // Elemental Impact (2026-10-15 patch update). On skill hits the planner settles the status from the hit model's final parts.
      const { missing } = allElementalState(engine === "skill-dot" && !types.length ? [ctx.damageType].filter(Boolean) : types);
      if (missing.length) return s("Inactive", `the supported skill doesn't deal all three Elemental types (missing: ${missing.join(", ")})`);
      const recently = "\"recently\" is held while the skill is used continuously";
      if (engine === "skill-hit") return s("In calc", `the skill deals Fire, Cold and Lightning (own types, conversions, added flat damage); applies to its Elemental hit parts and its own Elemental damage over time; ${recently}`, ["skill-hit"]);
      if (engine === "skill-dot") return dotTypedApplies("Elemental", ctx.damageType) ? s("In calc", `the skill deals Fire, Cold and Lightning; its own Elemental damage over time; ${recently}`, ["skill-dot"]) : s("Inactive", `the damage over time is ${ctx.damageType || "untyped"}`);
      return s("Not modeled", "read on skill hits and skill DoTs only");
    }
    case "movementCharges": {
      // Hunting Tempo (2026-10-15 patch update): per-metre, so it follows the Movement group.
      if (engine !== "skill-hit") return s("Not modeled", "read on skill hits only (the use rate sets the buffed share)");
      if (ctx.channeled) return s("Inactive", "cannot support Channeled Skills");
      const knockback = `+${clause.knockback}% Knockback Chance: No DPS effect`;
      if (clause.active == null) return s("Provisional", `condition not resolved (no planner state); ${knockback}`, ["skill-hit"]);
      if (!clause.active) return s("Inactive", `standing still (movement group): no metres moved, so no use is buffed; flip to Moving in the condition settings. ${knockback}`);
      return s("In calc", `moving (movement group) at the assumed ${ASSUMED_MOVEMENT_METERS_PER_SECOND} m/s (the planner's movement placeholder, unsourced): buffed share of uses = min(1, (${ASSUMED_MOVEMENT_METERS_PER_SECOND} ÷ ${clause.meters} m) × ${clause.uses} ÷ uses per second), × +${clause.value}% additional damage. ${knockback}`, ["skill-hit"]);
    }
    case "conditionDetail":
      return s("No DPS effect", "describes the buff the damage line counts");
    case "increased":
      if (engine === "skill-hit" || engine === "skill-dot") return s("In calc", "increased damage layer", [engine]);
      return s("Not modeled", "not read on the Scorching Beam path");
    case "critOnlyAdditional":
      if (engine === "skill-dot") return s("No DPS effect", "damage over time never crits (manual: Damage Over Time)");
      return s("In calc", beam ? "beam hit crit branch only (never Ignite)" : "crit share of the skill's hits", [beam ? "scorching-beam crit" : "skill-hit crit"]);
    case "perStack":
      if (clause.stackSource === "focusBlessing") {
        if (engine === "minion") break;
        return clause.stacks == null ? s("Provisional", "no Focus Blessing stack count available: 0 stacks assumed", [engine]) : clause.stacks > 0 ? s("In calc", `× ${clause.stacks} Focus Blessing stacks (blessing model)`, [engine]) : s("Inactive", "the build gains no Focus Blessing stacks");
      }
      if (clause.stackSource === "channel") return beam ? s("In calc", "per channeled stack at full channel (src/build-mechanics.js)", ["scorching-beam"]) : s("Not modeled", "per-channeled-stack roll is read on the Scorching Beam path only");
      if (beam && dedicated) return s("In calc", "dedicated Ignite model", ["ignite"]);
      return s("Not modeled", "Ignite stack scaling is modeled for Scorching Beam only");
    case "dotAdditional":
      if (engine === "skill-dot") return s("In calc", "the skill's damage over time", ["skill-dot"]);
      if (beam) return s("In calc", "Scorching Beam's Ignite (and its other ailments); provisional (Q10)", ["ignite"]);
      return s("In calc", "the skill's own ailments (src/ailment-applications.js); provisional", ["ailment-applications"]);
    case "ailmentAdditional":
      if (clause.ailment === "deterioration") return s("Not modeled", "Deterioration (TLIDB: a debuff settled as True Damage) has no model");
      if (engine === "skill-dot") return s("No DPS effect", "the skill's own damage over time is not an ailment");
      if (beam && dedicated) return s("In calc", "dedicated Ignite model", ["ignite"]);
      if (beam) return ["ailment", "ignite"].includes(clause.ailment) ? s("In calc", "Scorching Beam's Ignite", ["ignite"]) : s("Not modeled", `the Scorching Beam path cannot scope a ${clause.ailment} line to its own ${clause.ailment} yet`);
      return s("In calc", "the skill's own ailments (src/ailment-applications.js)", ["ailment-applications"]);
    case "added":
      if (engine === "skill-dot") return s("No DPS effect", "added damage does not affect damage over time (manual: Damage Over Time)");
      if (beam) return dedicated ? s("In calc", "Scorching Beam added Fire model", ["scorching-beam"]) : s("Not modeled", "added damage on the Scorching Beam path is read only for Added Fire Damage");
      return s("In calc", "added flat damage on the skill's hits", ["skill-hit"]);
    case "speed":
      if (engine === "skill-hit") {
        if (ctx.sentry) return clause.kind === "castFrequency" ? s("In calc", "Sentry Cast Frequency (manual rule 1001011724)", ["skill-hit"]) : s("In calc", "the deploy cast's use time only; the Sentry's own cadence follows Cast Frequency (manual rule 1001011724)", ["skill-hit"]);
        if (clause.kind === "castFrequency") return s("No DPS effect", "the skill deploys no Sentry");
        if (clause.kind === "attack" && !attack) return s("No DPS effect", "the skill is not an attack");
        if (clause.kind === "cast" && attack) return s("No DPS effect", "attack skills use Attack Speed");
        if (clause.kind === "both" && clause.additional && name === "Quick Decision" && !attack) return s("In calc", "planner cast-speed total for this setup", ["cast-rate"]);
        return s("In calc", attack ? "attack rate (weapon Attack Speed with the support's lines)" : "skill use rate", ["skill-hit"]);
      }
      if (clause.kind === "both" && name === "Quick Decision" && clause.additional) return s("In calc", "the setup's own cast rate", ["cast-rate"]);
      return s("Not modeled", "this speed wording is read for skill hits only");
    case "cooldown":
      if (ctx.windRhythmTerraDot) return s("Provisional", "Cooldown Recovery Speed shortens Wind Rhythm's trigger cooldown (provisional)", [engine]);
      if (ctx.triggeredDot) return s("Provisional", "Cooldown Recovery Speed shortens the skill's cooldown that caps the Activation Medium's trigger rate (Wind Rhythm: also its trigger cooldown; provisional)", [engine]);
      return engine === "skill-hit" ? s("In calc", "cooldown-capped use rate", ["skill-hit"]) : s("Not modeled", "cooldown is not part of this engine's use rate");
    case "duration":
      if (DEFENSIVE_ONLY_SKILLS.has(ctx.skillName)) return s("No DPS effect", DEFENSIVE_ONLY_SKILLS.get(ctx.skillName));
      return s("Not modeled", "skill duration from supports is not read yet");
    case "critBuff": {
      // Thunder Spike: Tremble (2026-10-14): Numbed Effect while the crit buff is up, on Numbed the supported skill inflicts.
      if (engine !== "skill-hit") return s("Not modeled", "read for skill hits only (the crit hit rate drives the uptime)");
      const numbed = (ctx.conditions?.enemyAilments || []).includes("Numbed");
      if (!numbed) return s("Inactive", "the build inflicts no Numbed (enemy-ailment model), so there is no Numbed for the buff to raise");
      if (!types.includes("Lightning")) return s("Inactive", "the supported skill deals no Lightning hits, so it inflicts no Numbed here");
      return s("Provisional", `+${clause.value}% Numbed Effect on the Numbed the supported skill inflicts, at uptime min(1, crit hits per second × ${clause.seconds} s); the dummy keeps the stronger Numbed (src/planner.js)`, ["combat-states"]);
    }
    case "periodicBuff":
      if (!tags.has("Mobility")) return s("Inactive", "Periodic Burst's buff follows a Mobility Skill use; the supported skill is not a Mobility Skill");
      if (ctx.conditions?.mobilitySkillUsed === false) return s("Inactive", "Mobility Skill used recently is switched off");
      return s("Provisional", "+Attack and Cast Speed for every skill at uptime buff duration ÷ max(6 s, the Mobility Skill's cooldown), the Mobility Skill used whenever its cooldown allows (user rule 2026-10-14; src/planner.js)", ["cast-rate", "skill-hit"]);
    case "buffHeader":
      return s("No DPS effect", "introduces the buff on the next line");
    case "decayingEvasion":
      return s("No DPS effect", "defence only: time-averaged Evasion in the Effective HP view (src/effective-hp.js)");
    case "channel":
      if (clause.kind === "max") {
        if (engine === "skill-hit") return ctx.channeled ? s("In calc", "channel stacks", ["skill-hit"]) : s("No DPS effect", "the skill is not channeled");
        return ctx.isMain ? s("In calc", "build channel stacks (src/build-mechanics.js, main skill)", ["build-mechanics"]) : s("Not modeled", "channel stacks are read for the main skill only");
      }
      if (ctx.isMain) return s("In calc", "channel start stacks (src/build-mechanics.js, main skill)", ["build-mechanics"]);
      return engine === "skill-hit" ? s("No DPS effect", "the channel is held at max stacks (own buffs pre-built)") : s("Not modeled", "min channel stacks are read for the main skill only");
    case "crit":
      if (engine === "skill-dot") return s("No DPS effect", "damage over time never crits");
      if (engine === "skill-hit" && attack) return s("In calc", "attack crit: (weapon + flat rating) × (1 + Σ%) × Π(1 + additional %) (manual, Critical Strike Rating)", ["skill-hit crit"]);
      if (clause.kind === "ratingPercent" && ["Critical Strike Rating Increase", "Control Spell"].includes(name)) return s("In calc", "spell crit rating (src/scorching-beam-critical.js)", ["crit"]);
      return s("Not modeled", "spell crit reads Critical Strike Rating Increase and Control Spell only");
    case "ailmentChance":
      if (engine === "skill-dot") return s("Inactive", "the skill deals no hits, so it applies no hit ailment");
      return s("In calc", "per-skill ailment chance (src/ailment-applications.js)", ["ailment-applications"]);
    case "ailmentExtraStacks":
      if (beam && dedicated) return s("In calc", "dedicated Ignite model", ["ignite"]);
      if (engine === "skill-dot") return s("Inactive", "the skill deals no hits, so it applies no hit ailment");
      if (clause.ailment === "wilt") return s("In calc", "extra Wilt stacks on this skill's applications (src/ailment-applications.js)", ["ailment-applications"]);
      return s("Not modeled", "extra stacks are modeled for Wilt (independent stacks) and Scorching Beam's Additional Ignite only");
    case "ailmentBase":
      if (engine === "skill-dot") return s("Inactive", "the skill deals no hits, so it applies no hit ailment");
      if (clause.ailment === "ignite" && !ctx.isMain) return s("Not modeled", "a non-main skill's Ignite uses the Ignite ledger's base (success-equivalent to Scorching Beam's)");
      return s("In calc", "base on this skill's own applications (B8)", ["ailment-applications"]);
    case "ailmentBlock":
      return s("In calc", "\"cannot inflict\" block (src/ailment-applications.js)", ["ailment-applications"]);
    case "ailmentInflict":
      return s("In calc", "enemy ailment types (src/enemy-ailments.js)", ["enemy-ailments"]);
    case "target":
      return /Feud \(Magnificent\)$/.test(name) ? s("In calc", "target debuff (src/build-mechanics.js)", ["build-mechanics"]) : s("Not modeled", "target debuffs from supports other than Feud are not modeled yet (chunk 4)");
    case "conditionalTyped":
      if (engine === "skill-dot") return clause.typed === ctx.damageType ? s("In calc", "full value assumed (the dummy's Life share is not tracked)", ["skill-dot"]) : s("Inactive", `the damage over time is ${ctx.damageType || "untyped"}`);
      if (engine === "skill-hit") return types.includes(clause.typed) ? s("Provisional", "full value assumed on the hits (the dummy's Life share is not tracked)", ["skill-hit"]) : s("Inactive", `does not reach this skill's ${types.join("/") || "hits"}`);
      return s("Not modeled", "read on skill hits and skill DoTs only");
    case "affliction":
      return engine === "skill-dot" || (beam && dedicated) ? s("In calc", "Affliction", [engine]) : s("Not modeled", "Cataclysm is read for skill DoTs and Scorching Beam only");
    case "channelTransform":
      return beam ? s("Provisional", "the channel is held at full stacks, so it gains no stacks and generates no explosions in the steady state", ["scorching-beam"]) : s("Not modeled", "read on the Scorching Beam path only");
    case "trigger": {
      const notHit = engine !== "skill-hit";
      switch (clause.kind) {
        case "interval":
        case "target": {
          // The dummy is a Boss (so an Elite); the player stands close (best case, user decision 2026-10-12), so an explicit
          // radius holds at point blank (src/dummy-target.js). Before 2026-10-12 rolls under 10 m read Inactive.
          if (clause.kind === "target" && !(dummyTarget[clause.target] && explicitRadiusHolds(clause.meters, ctx.conditions?.nearTarget))) return s("Inactive", `needs a ${clause.target} within ${clause.meters} m; the dummy is a Boss and Elite, and the Distant alternative stands ${DISTANT_STANDING_METERS} m away`);
          if (notHit && ctx.windRhythmTerraDot && clause.castSpeedScaled) return s("Provisional", "Wind Rhythm recasts the Terra at each trigger: cooldown ÷ ((1 + Cooldown Recovery Speed + share × Cast Speed) × additional Cast Speed) (the creator's calc v0.3, user-provided 2026-10-13; provisional); no use time", [engine]);
          if (notHit && ctx.triggeredDot) return s("Provisional", `triggers the DoT skill every ${clause.interval} s${clause.castSpeedScaled ? " (Wind Rhythm: cooldown ÷ ((1 + Cooldown Recovery Speed + share × Cast Speed) × additional Cast Speed), the creator's calc v0.3)" : ""}, capped by the skill's own cooldown: uses per second = 1 / max(interval, effective cooldown) (rule user-confirmed 2026-10-12, Q2); no use time; each use refreshes the DoT (strongest application, src/skill-dot-model.js)`, [engine]);
          if (notHit) return s("Not modeled", "triggered cadence is modeled for skill hits and non-channeled skill DoTs only");
          if (ctx.channeled || ctx.rateModel) return s("Not modeled", "triggering a channeled or rate-driven skill is not modeled");
          // Status stays Provisional for the first use at the first trigger; the rate itself is user-confirmed (Q2, 2026-10-12).
          return s("Provisional", `triggered every ${clause.interval} s, capped by the skill's cooldown (no use time; manual "Trigger"); rate = 1 / max(interval, effective cooldown) (user-confirmed 2026-10-12, Q2: Frost Shield + Boss every 6 s, its cooldown)${ctx.terra ? "; Terra-duration cap provisional" : ""}; first use at the first trigger provisional`, ["skill-hit"]);
        }
        case "maxMultistrike":
          if (notHit) return s("Not modeled", "the Max Multistrike Count trigger is modeled for skill hits and Empower buffs only");
          if (ctx.channeled || ctx.rateModel) return s("Not modeled", "triggering a channeled or rate-driven skill is not modeled");
          return s("Provisional", `triggered at the build's Max Multistrike Count events (multistriking skill hits), at most once per ${clause.interval} s, capped by the skill's cooldown: uses per second = 1 / max(trigger interval, effective cooldown) (rule user-confirmed 2026-10-12 for Activation Medium: Boss); no use time`, ["skill-hit"]);
        case "autoUse": return s("In calc", "auto-use while standing still keeps the skill's own use rate; its bonus follows the movement group", [engine]);
        case "movementEvent": return s("Not on dummy", "needs repeated start / stop movement, which the dummy runs do not model");
        case "playerState": return s("Not on dummy", "needs the player to take damage; the dummy does not attack");
        case "summon": return s("No DPS effect", "the Minions are summoned before the window starts");
        default: return s("Not modeled", "event-driven trigger (Spell Burst, Multistrike, Demolisher, Resonance, Instructions, Sentries, Lock On); no event model yet");
      }
    }
    case "triggerDetail":
      return s("Provisional", "Wind Rhythm: this share of the Cast Speed bonus shortens its trigger cooldown (provisional)", ["skill-hit"]);
    case "manualPenalty":
      if (ctx.windRhythmTerraDot) return s("No DPS effect", "the Terra is only triggered by Wind Rhythm (no manual uses), so the penalty does not apply");
      if (ctx.triggeredDot) return s("No DPS effect", "the DoT skill is only triggered by its Activation Medium (no manual uses), so the penalty does not apply");
      return ctx.triggered === false || ctx.channeled || ctx.rateModel || engine !== "skill-hit" ? s("In calc", "the skill is used, not triggered, so the penalty applies", [engine]) : s("No DPS effect", "the skill is only triggered (no manual uses), so the penalty does not apply");
    case "minion":
      if (engine !== "minion") return s("No DPS effect", "the setup summons no modeled Minion");
      return /^[+-]?\d+(?:\.\d+)?% (?:additional )?(?:damage|Attack and Cast Speed|Attack Speed) for Minions summoned by the supported skill$/i.test(clause.text) ? s("In calc", "this summon's Minions (src/minion-damage-model.js)", ["minion"]) : s("Not modeled", "a Minion line the Minion model does not read (conditional or unmodeled)");
    case "addedAs":
    case "conversion":
      if (engine === "skill-hit") return s(clause.family === "addedAs" ? "Provisional" : "In calc", clause.family === "addedAs" ? "extra hit component of the source type's damage (provisional reading)" : "hit damage only (manual: Conversion of the Type of Damage Dealt); never DoT or ailments", ["skill-hit"]);
      if (engine === "skill-dot") return s("No DPS effect", "conversion does not affect damage over time (manual: Damage Over Time)");
      return s("Not modeled", "conversion from supports is read for skill hits only");
    case "projectileQuantity":
      if (engine !== "skill-hit") return s("Not modeled", "projectile quantity is read for skill hits only");
      // A skill's own projectile rule (src/skill-hit-profiles.js projectileVolley / additionalPerProjectileQuantityPercent).
      if (ctx.profile?.projectileVolley) return s("In calc", ctx.profile.projectileVolley.status, ["skill-hit"]);
      if (ctx.profile?.additionalPerProjectileQuantityPercent) return s("In calc", `+${ctx.profile.additionalPerProjectileQuantityPercent}% additional damage for every +1 Projectile Quantity of the skill (TLIDB skill text); the extra projectiles themselves need other enemies`, ["skill-hit"]);
      return ctx.shotgun ? s("Provisional", `the skill text says its projectiles can hit the same enemy: the volley is a fan, of which ceil(n / 2) reach the dummy standing close (Chromatic Shot runs 2026-10-12; one at range), each after the first at ×${ctx.shotgun} (linear Shotgun falloff; coefficient from the skill text, else 70%)`, ["skill-hit"]) : s("No DPS effect", "the skill text does not say its projectiles can hit the same enemy, so one reaches the dummy (Ice Lances run 2026-10-12: Multiple Projectiles moved only by its additional damage)");
    case "multistrike":
      if (engine !== "skill-hit" || !ctx.speedType) return s("Not modeled", "Multistrike is read for skill hits only");
      if (ctx.speedType !== "attack-speed") return s("Inactive", "Multistrike needs an Attack Skill (TLIDB glossary)");
      if (ctx.channeled || ctx.sentry || tags.has("Mobility")) return s("No DPS effect", "Mobility, Channeled and Sentry skills cannot Multistrike (TLIDB glossary)");
      return s("Provisional", "expected Multistrikes per attack (TLIDB glossary: one extra attack per 100% chance, +20% Attack Speed during them); increasing damage per Multistrike count (provisional reading)", ["skill-hit"]);
    case "steepStrike":
      // src/skill-hit-model.js steepStrikeState (2026-10-14): own + supports + build-wide lines per Slash-Strike skill.
      if (!tags.has("Slash-Strike") && !ctx.profile?.steepStrike) return s("Inactive", "the supported skill is not a Slash-Strike skill (only Slash-Strike skills have a Steep Strike form)");
      if (engine !== "skill-hit") return s("Not modeled", "Steep Strike chance is read for skill hits only");
      // Blade Cluster (user-supplied answer 2026-10-15, replaces the 2026-10-14 "+2 max stored attempts" reading): each launched
      // Steep Strike → 1 + N Steep Strike hits on the same target.
      if (clause.kind === "extraAttempts") return s("In calc", `user-supplied answer (2026-10-15, provisional): each launched Steep Strike generates ${clause.attempts} additional Steep Strikes on the same target, so the Steep Strike component deals × ${1 + clause.attempts} its hits per launch; the extra hits take "+X% additional Steep Strike Damage" and the skill's crit, spend no attempt, add no Multistrike, and count in the skill's hits/s (src/skill-hit-model.js steepStrikeState)`, ["skill-hit"]);
      // Big Stride (user-supplied reading 2026-10-14; held window confirmed by a user-supplied answer 2026-10-15): every attack
      // in the window is a Steep Strike; window open while moving.
      if (clause.kind === "guaranteedAfterMoving") {
        if (ctx.conditions?.movedRecently === false) return s("Inactive", `Moved recently is switched off, so the ${clause.seconds} s window after moving ${clause.meters} m is never open`);
        return s("Provisional", `user-supplied reading (2026-10-14): every attack in the ${clause.seconds} s window after moving ${clause.meters} m is a Steep Strike; the window is held open while Moved recently is on (always moving: best case), so every use is a Steep Strike replacing the Sweep Slash (src/skill-hit-model.js steepStrikeState)`, ["skill-hit"]);
      }
      if (ctx.profile?.steepStrike?.fromChance === false) return ctx.profile.steepStrike.multistrikeIncrementPerChancePercent ? s("In calc", `the skill cannot obtain Steep Strikes from Steep Strike chance; its Multistrikes gain ${ctx.profile.steepStrike.multistrikeIncrementPerChancePercent}% additional damage increment per +1% Steep Strike chance (TLIDB skill text; provisional)`, ["skill-hit"]) : s("No DPS effect", "the skill cannot obtain Steep Strikes from Steep Strike chance");
      return s("In calc", "summed with the skill's own Steep Strike chance and the build's lines; that share of attacks are Steep Strikes replacing the Sweep Slash (observed: Whirlwind Lv16 run 2026-10-12)", ["skill-hit"]);
    case "spellBurst":
      if (engine !== "skill-hit") return s("Not modeled", "Spell Burst is read for skill hits only");
      if (!tags.has("Spell") || tags.has("Summon") || ctx.channeled || ctx.sentry || ctx.rateModel || ctx.cooldown) return s("Inactive", "the skill cannot activate Spell Burst (game manual: Spell Skills only; skills with a cooldown, Summon, Sentry, Channel and Triggered Skills and skills cast by Spell Burst cannot)");
      if (ctx.conditions && !(ctx.conditions.maxSpellBurst >= 1)) return s("Inactive", "the build has no Max Spell Burst (game manual: Spell Burst needs Max Spell Burst of at least 1)");
      if (clause.kind === "chargeIncreased" || clause.kind === "chargeAdditional") return s("In calc", "Spell Burst full charge time 2 s ÷ (1 + Σ Charge Speed) ÷ Π(1 + additional Charge Speed) (game manual)", ["skill-hit"]);
      return s("In calc", "Spell Burst casts: the activating cast and one automatic cast per stack consumed are cast by Spell Burst (game manual); automatic casts take no manual cast time and the activation period is not rounded (user-confirmed 2026-10-12)", ["skill-hit"]);
    case "shadow":
      if (!tags.has("Shadow Strike")) return s("Inactive", "the supported skill is not a Shadow Strike skill (only Shadow Strike skills summon Shadows: game manual 1001010820)");
      if (engine !== "skill-hit") return s("Not modeled", "Shadows are read for skill hits only");
      return s("Provisional", "each Shadow repeats the skill's attack on the dummy; on one target each Shadow after the first takes the 70% Shotgun falloff (game manual 1001010820 / 1001010821; TLIDB Phantom), as the Shadows' own hits (src/skill-hit-model.js shadowState; provisional)", ["skill-hit"]);
    case "barrage":
      if (!tags.has("Barrage")) return s("Inactive", "the supported skill is not a Barrage skill");
      if (engine !== "skill-hit") return s("Not modeled", "Barrage waves are read for skill hits only");
      return s("Provisional", "wave k (the first 0) deals ×(1 + k × the per-wave %) over the skill's waves (game field 2501029; the per-wave formula is provisional: src/skill-hit-model.js barrageWaveState)", ["skill-hit"]);
    case "fervorScaled":
      if (engine !== "skill-hit") return s("Not modeled", "Attack Focus is read on skill hits only");
      if (!attack) return s("Inactive", "the supported skill is not an Attack");
      if (clause.kind === "gain") return s("Provisional", `holds the Fervor Rating its per-Rating lines read: ${clause.ratingSource} (2 per hit while the skill keeps hitting the dummy; whether Rating builds without Fervor itself is not published: provisional)`, ["skill-hit"]);
      return s("Provisional", `${clause.value}${clause.kind === "crit" ? "% Critical Strike Rating" : "% additional damage"} × ${clause.steps} (every ${clause.every} of ${clause.ratingSource}) = +${clause.appliedValue}%${clause.kind === "crit" ? " increased Critical Strike Rating on the skill's attacks" : " additional damage for the supported skill"} (provisional)`, ["skill-hit"]);
    case "alternating":
      if (engine !== "skill-hit") return s("Not modeled", "the alternating casts are read on skill hits only");
      if (ctx.conditions && !ctx.conditions.dualWielding) return s("Inactive", "not Dual Wielding (the effect needs two one-handed weapons)");
      return s("Provisional", clause.kind === "speed" ? "every other cast (the 1st) takes the speed: the use interval averages the two casts' (src/skill-hit-model.js; provisional)" : "every other cast (the 2nd) takes the additional damage: half the casts, so +half the value on average; the Skill Area has no effect on one dummy (provisional)", ["skill-hit"]);
    case "combo":
      if (clause.kind === "points") return engine === "skill-hit" && ctx.combo ? s("Provisional", "added to the 1 Combo Point per Starter observed on Crescent Slash (game field 2012116, shared with the gear line): the Finisher consumes 2 Starters × points, up to 4, which sets its Amplification and its hit / Clone count (src/combo-points.js comboPointState; provisional)", ["skill-hit"]) : s(engine === "skill-hit" ? "Inactive" : "Not modeled", engine === "skill-hit" ? "the supported skill has no modeled Combo cycle" : "Combo Points are read for skill hits only");
      return engine === "skill-hit" && ctx.combo ? s("Provisional", "adds to the skill's own Combo Finisher Amplification: its Finisher Hit Damage is additionally increased by consumed Combo Points × Amplification (game manual 1001013024; 2 consumed points read, provisional)", ["skill-hit"]) : s("No DPS effect", "the skill has no Combo Finisher");
    case "paralysis":
      if (clause.fissure) {
        if (engine !== "skill-hit") return s("Not modeled", "read for skill hits only (the fissure's hit rate drives the uptime)");
        return (ctx.profile?.components || []).some((component) => component.key === "fissure")
          ? s("Provisional", "Paralysis (+15% damage taken, 4 s, 1 stack; manual rule 1002020420) on each fissure hit: the skill model lands the fissure on the dummy once per Demolisher Charge consumed (src/attack-hit-profiles.js, provisional), so the uptime follows that rate (src/combat-states.js)", ["combat-states"])
          : s("Not on dummy", "the skill model has no fissure that hits the dummy; a spreading fissure needs other enemies");
      }
      return engine === "skill-hit" ? s("Provisional", "Paralysis (+15% damage taken, 4 s, 1 stack; manual rule 1002020420) on the Cursed dummy: expected uptime 1 − (1 − chance)^(hits in 4 s) at the skill's hit rate (src/combat-states.js)", ["combat-states"]) : s("Not modeled", "read for skill hits only (the hit rate drives the uptime)");
    case "selfDebuff":
      return engine === "skill-hit" ? s("Provisional", "expected uptime from the skill's hit rate: 1 − (1 − chance)^(hits in the duration)", ["skill-hit"]) : s("Not modeled", "read for skill hits only");
    case "targetTaken":
      return s("Provisional", "enemy debuff while the supported skill deals damage (uptime 1: provisional)", ["planner"]);
    case "reaping":
      if (clause.kind === "onHit") return engine === "skill-hit" ? s("Provisional", `extra Reap source on each hit; reaps the ${clause.ailment} share dealt by this skill`, ["reaping"]) : s("Not modeled", "read for skill hits only");
      return engine === "skill-dot" && ctx.isMain ? s("Provisional", "additional Reaping Recovery Speed per added Beam on the max-stack Reap", ["reaping"]) : s("Not modeled", "read for the main skill's built-in max-stack Reap only");
    case "beams":
      // Scorching Beam (src/scorching-beam-base-hit.js scorchingBeamShotgunFactor; Scattershot Beam run 2026-10-12).
      if (beam) return s("Provisional", "every Beam hits the dummy, beam ticks and explosions, after the first at the skill's 70% Shotgun falloff (linear reading)", ["scorching-beam"]);
      return s("No DPS effect", "extra Beams do not hit one dummy more than once (they count for Rapid Completion)");
    case "tags":
      return engine === "skill-hit" ? s("In calc", `the skill's line scopes ${clause.kind === "add" ? "gain" : "lose"} the ${clause.tag} tag`, ["skill-hit"]) : s("Not modeled", "tag changes are read for skill hits only");
    case "maxAfflictionDot":
      return engine === "skill-dot" ? s("In calc", "additional damage over time while the dummy is at Max Affliction (rating 100): the steady state, and the recount from the moment the simulated rating reaches 100 (src/skill-dot-model.js)", ["skill-dot"]) : s("Not modeled", "read for skill DoTs only");
    case "terraCharge":
      if (!tags.has("Terra")) return s("No DPS effect", "the supported skill is not a Terra skill");
      return s("In calc", clause.kind === "max" ? "Max Terra Charge Stacks of the supported Terra skill: charges consumed per cast (src/selena-dance.js)" : "Terra Charge restoration of the supported skill: the 0.5 s charge interval ÷ (1 + Σ%) (game manual: Restoration Duration = base ÷ (1 + all non-additional bonuses))", ["terra-charge"]);
    case "empower": {
      const modeled = EMPOWER_MODELED_SKILLS.get(ctx.skillName);
      if (!modeled) return s("Not modeled", "no Empower effect of this skill reaching the dummy is modeled");
      if (clause.kind === "becomes" || clause.kind === "timing") return s("Provisional", `${ctx.skillName}: ${clause.kind === "timing" ? "the debuff's duration against the cooldown sets its uptime" : "the skill is an Empower Skill, so Empower Effect lines apply"} (${modeled})`, ["empower"]);
      if (clause.kind === "debuffs") return s("Provisional", `the hit debuff is scaled by Empower Effect (${modeled})`, ["empower"]);
      return s("Provisional", `Empower Effect of ${ctx.skillName}: ${modeled}`, ["empower"]);
    }
    case "notOnDummy":
      return s("Not on dummy", "needs an enemy to be defeated; the dummy never dies");
    case "nonDamage":
      return s("No DPS effect", "no effect on damage to one dummy");
    default:
      break;
  }
  return s("Not modeled", "no rule reads this clause");
}

// Conditional clauses resolve through the shared line-condition resolver (src/line-conditions.js, talent batch chunk 2):
// the same keys, readings and texts as before; talent, gear, slate and core lines use the same resolver.
// Without a state (direct engine calls) the condition is unresolved: nothing is applied and the clause reads Provisional.
function resolveCondition(clause, support, conditions) {
  // Willpower-style "for every stack of buffs while standing still (multiplies)": the stack cap from the support's base text.
  const stackCap = clause.condition === "standingStill" && clause.multiplies
    ? Number(String(supportProgressionSs13[clause.grantedWillpower ? "Willpower" : support.name]?.baseEffect || "").match(/Stacks up to (\d+) time/i)?.[1]) || 1
    : undefined;
  const resolved = resolveLineCondition({ ...clause, key: clause.condition, stackCap }, conditions);
  return { active: resolved.active, appliedValue: resolved.appliedValue ?? 0, conditionText: resolved.conditionText, ...(resolved.provisional ? { provisional: true } : {}) };
}

const hitTypedApplies = (typed, types, tags) => TYPES.includes(typed) ? types.includes(typed) : typed === "Elemental" ? types.some((type) => ELEMENTAL.includes(type)) : typed === "Hit" || typed === "Spell" || tags.has(typed);
const dotTypedApplies = (typed, damageType) => typed === damageType || (typed === "Elemental" && ELEMENTAL.includes(damageType));

// Shotgun Effect falloff coefficient of a skill: its TLIDB text's coefficient ("Shotgun Effect falloff coefficient is 64%",
// "70% Shotgun falloff"), else 70%; null without a Shotgun Effect. The coefficient is what each repeat hit deals, and the
// falloff is linear: 1 + c × (hits − 1) (src/shotgun-effect.js). Sources: the in-game tooltip (Chromatic Shot, user
// 2026-10-12: "falloff coefficient is 70%"), the game hit rule's one flat repeatDmgDecPercent row (100 − c), and the
// Chromatic Shot runs (1 + 0.7 and 1 + 0.7 × 2). The "×0.3" reading of "usually a 70% reduction" is ruled out.
export function shotgunFalloff(skillName) {
  const text = (allSkillEffectsSs13[skillName] || []).join("\n");
  if (!/Shotgun/i.test(text)) return null;
  const match = text.match(/Shotgun Effect falloff coefficient is (\d+(?:\.\d+)?)%/i) || text.match(/(\d+(?:\.\d+)?)% Shotgun/i) || text.match(/Shotgun (?:Effect )?falloff[^.%]*?(\d+(?:\.\d+)?)%/i);
  return match ? Number(match[1]) / 100 : 0.7;
}

// Falloff for extra projectiles from Projectile Quantity on the single dummy, or null when they cannot reach it. Ice Lances
// Lv16 with and without Multiple Projectiles (user, 2026-10-12; research/residual-batch-2026-10-12.md run 8): still one
// floating number per cast and the recount moved ×1.15 (the support's additional damage only), confirming TLIDB's "cannot
// hit the same enemy". Extra projectiles count only when the skill's own text says its projectiles (or arrows) "can hit
// the same enemy" (Chromatic Shot, Rain of Arrows, …) and the skill takes Projectile Quantity bonuses; every other skill,
// Shotgun Effect or not, keeps one projectile on one target. How many of the volley land (a fan: ceil(n / 2) standing close)
// and the linear total are src/shotgun-effect.js's.
export function projectileQuantityFalloff(skillName) {
  const lines = allSkillEffectsSs13[skillName] || [];
  const text = lines.join("\n");
  // Skill-wide exclusions only (Arrow Einherjar, Spikeburst, Thunderlight Arrow); Marked Rain of Arrows' "The Projectile is
  // not affected" names its Marked Arrow, while its Explosive Arrows take the bonus and can hit the same enemy.
  if (/(?:Projectiles (?:fired|shot) by (?:this|the) skill are|Projectile Quantity of this skill is) not affected by Projectile Quantity bonuses/i.test(text)) return null;
  if (!lines.some((line) => /\b(?:Projectiles?|Arrows?)\b[^.\n]*\bcan hit the same enemy/i.test(line))) return null;
  return shotgunFalloff(skillName) ?? 0.7;
}

/**
 * Resolve every enabled support on a setup into typed effects and clause statuses.
 * @param {object} setup resolved setup (supports with effectiveLevel, specialConfig, starAdditionalDamagePercent)
 * @param {object} ctx { profile, engine, dealtTypes, tags, damageType, speedType, channeled, isMain, focusBlessingStacks, specialSupportConfigs }
 */
export function resolveSupportEffects(setup, ctx = {}) {
  const profile = ctx.profile || null;
  const engine = ctx.engine ?? profile?.engine ?? (setup?.name === "Scorching Beam" ? "scorching-beam" : null);
  const tags = new Set([...(ctx.tags || profile?.tags || setup?.tags || []), ...(profile?.lineScopeTags || [])]);
  const full = {
    ...ctx, engine, tags, skillName: ctx.skillName ?? setup?.name ?? null,
    dealtTypes: ctx.dealtTypes || profile?.dealtTypes || (profile?.damageType ? [profile.damageType] : []),
    damageType: ctx.damageType ?? profile?.damageType ?? null,
    speedType: ctx.speedType ?? null,
    channeled: ctx.channeled ?? Boolean(profile?.useModel && /channel/.test(profile.useModel.kind || "")),
    focusBlessingStacks: Number.isFinite(ctx.focusBlessingStacks) ? ctx.focusBlessingStacks : null,
    sentry: ctx.sentry ?? Boolean(profile?.sentry),
    shotgun: ctx.shotgun ?? projectileQuantityFalloff(setup?.name),
    combo: ctx.combo ?? Boolean(profile?.cycle),
    cooldown: ctx.cooldown ?? null,
    rateModel: ctx.rateModel ?? profile?.useModel?.kind === "rate",
    terra: ctx.terra ?? profile?.useModel?.kind === "terra",
    // A recast Terra DoT (Frost Terra) triggered by Activation Medium: Wind Rhythm (src/selena-dance.js windRhythmTerraTrigger).
    windRhythmTerraDot: ctx.windRhythmTerraDot ?? Boolean(engine === "skill-dot" && profile?.recast && (setup?.supports || []).some((support) => support.enabled !== false && support.name === "Activation Medium: Wind Rhythm")),
    // Any other non-channeled skill DoT with an Activation Medium (src/trigger-interval.js activationMediumDotTrigger; 2026-10-13).
    triggeredDot: ctx.triggeredDot ?? Boolean(engine === "skill-dot" && !profile?.channeled && (setup?.supports || []).some((support) => support.enabled !== false && /^Activation Medium: /.test(support.name || ""))),
    conditions: ctx.conditions || null
  };
  const effects = {
    setupKey: setup?.setupKey || setup?.instanceId || setup?.name || null, skillName: setup?.name || null, engine,
    additional: [], increased: [], critOnlyAdditional: [], perStack: [], added: [], conversion: [], addedAs: [],
    crit: [], speed: [], cooldown: [], duration: [], channel: { max: [], min: [] },
    ailment: { chance: [], base: [], extraStacks: [], additional: [], blocks: [], inflicts: [] },
    dotAdditional: [], conditionalAdditional: [], trigger: [], triggerDetail: [], manualPenalty: [], multistrike: [], steepStrike: [], spellBurst: [], combo: [], selfDebuff: [], paralysis: [], targetTaken: [], curseTaken: [], minion: [], target: [], conditionalTyped: [], affliction: [], reaping: [], quantity: [], tags: { add: [], remove: [] },
    maxAfflictionDot: [], terraCharge: [], empower: [], allElementalAdditional: [], movementCharges: [], alternating: [],
    clauses: []
  };
  for (const support of setup?.supports || []) {
    if (support.enabled === false) continue;
    const source = `Support: ${support.name}`;
    for (const raw of supportClauses(setup, support, full)) {
      const parsed = classifySupportClause(raw.text);
      const clause = { support: support.name, source, text: raw.text, baseText: raw.baseText, origin: raw.origin, level: raw.level ?? null, tier: raw.tier ?? null, stars: raw.stars ?? null, ...parsed };
      if (clause.family === "conditionalAdditional") Object.assign(clause, resolveCondition(clause, support, full.conditions));
      // Empowered Channeling (gear affix batch C): a skill that does not channel takes nothing.
      if (clause.family === "conditionalAdditional" && clause.condition === "channelSeconds" && !full.channeled && !full.tags.has("Channeled")) Object.assign(clause, { active: false, appliedValue: 0, conditionText: "the supported skill is not channeled" });
      // Attack Focus (gear affix batch C, provisional): the held Fervor Rating, the build's own (combat state) or else the Max
      // Fervor Rating (100) the support's Fervor Rating on hit builds while the skill keeps hitting the dummy.
      if (clause.family === "fervorScaled") {
        const own = Number(full.conditions?.fervorRating) || 0;
        clause.rating = own > 0 ? own : FERVOR_MAX_RATING;
        clause.ratingSource = own > 0 ? `the build's Fervor Rating ${own}` : `the Max Fervor Rating ${FERVOR_MAX_RATING}, built by the support's Fervor Rating on hit`;
        clause.steps = clause.every ? Math.floor(clause.rating / clause.every) : 0;
        clause.appliedValue = round(clause.value * clause.steps);
      }
      if (clause.family === "triggerDetail" && clause.kind === "castSpeedShare") clause.share = clause.value / 100;
      // 2026-10-15 patch update: Elemental Impact needs all three Elemental types (the planner refines this from the final hit
      // parts); Hunting Tempo is per metre moved, so it follows the Movement group (unresolved without a state).
      if (clause.family === "allElementalAdditional") clause.active = engine !== "minion" && allElementalState(full.engine === "skill-dot" && !full.dealtTypes.length ? [full.damageType].filter(Boolean) : full.dealtTypes).active;
      if (clause.family === "movementCharges") clause.active = full.conditions ? full.conditions.moving !== false : null;
      if (clause.family === "perStack" && clause.stackSource === "focusBlessing") {
        clause.stacks = full.focusBlessingStacks == null ? null : Math.min(clause.cap ?? Infinity, Math.max(0, full.focusBlessingStacks));
        clause.appliedValue = round(clause.value * (clause.stacks ?? 0));
      }
      Object.assign(clause, clauseStatus(clause, support, full));
      clause.damage = clause.family !== "other" ? clause.family !== "nonDamage" : damageWords.test(clause.text);
      const entry = { support: support.name, source, text: clause.text, origin: clause.origin, status: clause.status, level: clause.level, tier: clause.tier, stars: clause.stars };
      switch (clause.family) {
        case "additional": effects.additional.push({ ...entry, value: clause.value, typed: clause.typed || null, scope: clause.scope }); break;
        case "increased": effects.increased.push({ ...entry, value: clause.value, typed: clause.typed || null, scope: clause.scope }); break;
        case "critOnlyAdditional": effects.critOnlyAdditional.push({ ...entry, value: clause.value }); break;
        case "perStack": effects.perStack.push({ ...entry, value: clause.value, cap: clause.cap, stackSource: clause.stackSource, stacks: clause.stacks ?? null, appliedValue: clause.appliedValue ?? null }); break;
        case "added": effects.added.push({ ...entry, type: clause.type, min: clause.min, max: clause.max }); break;
        case "addedAs": effects.addedAs.push({ ...entry, from: clause.from, to: clause.to, percent: clause.percent }); break;
        case "conversion": effects.conversion.push({ ...entry, from: clause.from, to: clause.to, percent: clause.percent }); break;
        case "speed": effects.speed.push({ ...entry, value: clause.value, additional: clause.additional, kind: clause.kind }); break;
        case "cooldown": effects.cooldown.push({ ...entry, value: clause.value, additional: clause.additional }); break;
        case "duration": effects.duration.push({ ...entry, value: clause.value, additional: clause.additional }); break;
        case "channel": effects.channel[clause.kind].push({ ...entry, value: clause.value }); break;
        case "crit": effects.crit.push({ ...entry, value: clause.value, kind: clause.kind }); break;
        case "ailmentChance": effects.ailment.chance.push({ ...entry, value: clause.value, ailment: clause.ailment }); break;
        case "ailmentBase": effects.ailment.base.push({ ...entry, min: clause.min, max: clause.max, ailment: clause.ailment }); break;
        case "ailmentExtraStacks": effects.ailment.extraStacks.push({ ...entry, value: clause.value, chancePercent: clause.chancePercent, ailment: clause.ailment }); break;
        case "ailmentAdditional": effects.ailment.additional.push({ ...entry, value: clause.value, ailment: clause.ailment }); break;
        case "ailmentBlock": effects.ailment.blocks.push({ ...entry, ailments: clause.ailments }); break;
        case "ailmentInflict": effects.ailment.inflicts.push({ ...entry, ailment: clause.ailment, hitType: clause.hitType }); break;
        case "dotAdditional": effects.dotAdditional.push({ ...entry, value: clause.value }); break;
        case "conditionalAdditional": effects.conditionalAdditional.push({ ...entry, value: clause.value, condition: clause.condition, active: clause.active, appliedValue: clause.appliedValue, conditionText: clause.conditionText, triggeredOnly: Boolean(clause.triggeredOnly) }); break;
        case "projectileQuantity": effects.quantity.push({ ...entry, value: clause.value, kind: "projectiles" }); break;
        case "multistrike": effects.multistrike.push({ ...entry, value: clause.value, kind: clause.kind }); break;
        case "steepStrike": effects.steepStrike.push({ ...entry, value: clause.value, kind: clause.kind, ...(clause.meters != null ? { meters: clause.meters } : {}), ...(clause.seconds != null ? { seconds: clause.seconds } : {}), ...(clause.attempts != null ? { attempts: clause.attempts } : {}) }); break;
        case "spellBurst": effects.spellBurst.push({ ...entry, value: clause.value, kind: clause.kind }); break;
        case "combo": effects.combo.push({ ...entry, value: clause.value, kind: clause.kind }); break;
        // Attack Focus's per-Rating damage and Critical Strike Rating join the support's additional damage and crit lines.
        case "fervorScaled":
          if (["In calc", "Provisional"].includes(clause.status) && clause.appliedValue) {
            const read = { ...entry, text: `${clause.text} × ${clause.steps} (${clause.ratingSource})` };
            if (clause.kind === "damage") effects.additional.push({ ...read, value: clause.appliedValue, typed: null, scope: null });
            else if (clause.kind === "crit") effects.crit.push({ ...read, value: clause.appliedValue, kind: "ratingPercent" });
          }
          break;
        case "alternating": effects.alternating.push({ ...entry, value: clause.value, kind: clause.kind }); break;
        case "paralysis": if (clause.status !== "Not on dummy") effects.paralysis.push({ ...entry, chancePercent: clause.chancePercent, ...(clause.fissure ? { fissure: true, needsCurse: false } : {}) }); break;
        case "selfDebuff": effects.selfDebuff.push({ ...entry, value: clause.value, chancePercent: clause.chancePercent, durationSeconds: clause.durationSeconds }); break;
        case "targetTaken": effects.targetTaken.push({ ...entry, value: clause.value, typed: clause.typed }); break;
        case "curseTaken": effects.curseTaken.push({ ...entry, value: clause.value, delaySeconds: clause.delaySeconds }); break;
        case "reaping": effects.reaping.push({ ...entry, value: clause.value, kind: clause.kind, ailment: clause.ailment ?? null }); break;
        case "beams": effects.quantity.push({ ...entry, value: clause.value, kind: "beams" }); break;
        case "tags": effects.tags[clause.kind].push({ ...entry, tag: clause.tag }); break;
        case "trigger": effects.trigger.push({ ...entry, kind: clause.kind, interval: clause.interval ?? null, meters: clause.meters ?? null, target: clause.target ?? null, castSpeedScaled: Boolean(clause.castSpeedScaled), startsReady: Boolean(clause.startsReady) }); break;
        case "triggerDetail": effects.triggerDetail.push({ ...entry, kind: clause.kind, share: clause.share ?? null }); break;
        case "manualPenalty": effects.manualPenalty.push({ ...entry, value: clause.value }); break;
        case "minion": effects.minion.push({ ...entry, value: clause.value }); break;
        case "target": effects.target.push({ ...entry, value: clause.value }); break;
        case "conditionalTyped": effects.conditionalTyped.push({ ...entry, value: clause.value, typed: clause.typed }); break;
        case "affliction": effects.affliction.push({ ...entry, value: clause.value, kind: clause.kind }); break;
        case "maxAfflictionDot": effects.maxAfflictionDot.push({ ...entry, value: clause.value }); break;
        case "terraCharge": effects.terraCharge.push({ ...entry, value: clause.value, kind: clause.kind }); break;
        case "empower": effects.empower.push({ ...entry, value: clause.value ?? null, kind: clause.kind }); break;
        case "allElementalAdditional": effects.allElementalAdditional.push({ ...entry, value: clause.value, typed: "Elemental", active: clause.active }); break;
        case "movementCharges": effects.movementCharges.push({ ...entry, value: clause.value, uses: clause.uses, meters: clause.meters, knockback: clause.knockback, active: clause.active }); break;
        default: break;
      }
      effects.clauses.push(clause);
    }
  }
  return effects;
}

// Census engines: one synthetic context per engine a support can be installed on (research/support-batch-2026-10-12.md §6.2).
const CENSUS_ENGINES = [
  ["scorching-beam", { engine: "scorching-beam", isMain: true, dealtTypes: ["Fire"], damageType: "Fire", tags: new Set(["Spell", "Fire", "Channeled", "Beam", "Area"]), channeled: true }],
  ["skill-hit (spell)", { engine: "skill-hit", speedType: "cast-speed", dealtTypes: ["Physical", "Fire", "Cold", "Lightning", "Erosion"], tags: new Set(["Spell", "Area", "Projectile"]) }],
  ["skill-hit (attack)", { engine: "skill-hit", speedType: "attack-speed", dealtTypes: ["Physical", "Fire", "Cold", "Lightning", "Erosion"], tags: new Set(["Attack", "Melee", "Projectile", "Area"]), shotgun: 0.7, combo: true }],
  ["skill-dot", { engine: "skill-dot", isMain: true, damageType: "Erosion", tags: new Set(["Spell", "Erosion"]) }],
  ["minion", { engine: "minion" }]
];
const CENSUS_NEUTRAL = new Set(["No DPS effect", "Not on dummy"]);

/**
 * Per-engine statuses of one support clause (the coverage census, tools/coverage-census.mjs): the clause is classified by the
 * rule table and given each engine's status; TLIDB tier ranges "(a–b)" read at their upper value. The summary is "In calc"
 * when any engine applies it, "Provisional" when only provisional readings do, a neutral status when every engine says so,
 * "Not modeled" when an engine that could read it does not, else "Inactive".
 */
export function supportClauseEngineStatuses(text, supportName = "") {
  const concrete = tidy(String(text || "").replace(/\(\s*(-?\d+(?:\.\d+)?)\s*–\s*(-?\d+(?:\.\d+)?)\s*\)/g, (match, low, high) => String(Math.max(Number(low), Number(high)))));
  const parsed = classifySupportClause(concrete);
  const support = { name: supportName };
  const engines = {};
  for (const [label, ctx] of CENSUS_ENGINES) {
    const clause = { support: supportName, text: concrete, origin: "fixed", ...parsed };
    if (clause.family === "conditionalAdditional") Object.assign(clause, resolveCondition(clause, support, null));
    const { status, reason } = clauseStatus(clause, support, { conditions: null, ...ctx });
    engines[label] = { status, reason };
  }
  const values = Object.values(engines).map((item) => item.status);
  const damage = parsed.family !== "other" ? parsed.family !== "nonDamage" : damageWords.test(concrete);
  const summary = values.includes("In calc") ? "In calc" : values.includes("Provisional") ? "Provisional"
    : values.every((value) => CENSUS_NEUTRAL.has(value)) ? (values.includes("Not on dummy") ? "Not on dummy" : "No DPS effect")
    : values.includes("Not modeled") ? (damage ? "Not modeled" : "No DPS effect") : "Inactive";
  return { family: parsed.family, summary, engines, damage };
}

/** The setup's resolved effects, or a fresh resolution for direct engine calls (tests). */
export function supportEffectsFor(setup, ctx = {}) {
  return setup?.supportEffects || resolveSupportEffects(setup, ctx);
}

/** Clauses of one support with aggregate status for coverage: In calc / Partly modeled / Not modeled, or null. */
export function supportClauseSummary(effects, supportName) {
  const clauses = (effects?.clauses || []).filter((clause) => clause.support === supportName && clause.damage);
  if (!clauses.length) return null;
  const applied = clauses.filter((clause) => clause.status === "In calc" || clause.status === "Provisional");
  const missing = clauses.filter((clause) => clause.status === "Not modeled");
  const status = !missing.length ? (applied.length ? "In calc" : clauses.every((clause) => clause.status === "No DPS effect") ? "No DPS effect" : "Inactive") : applied.length ? "Partly modeled" : "Not modeled";
  return { status, clauses, applied, missing };
}
