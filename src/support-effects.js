import { supportProgressionSs13 } from "./data/skills/support-progression-ss13.generated.js";
import { dummyTarget, explicitRadiusHolds, DISTANT_STANDING_METERS } from "./dummy-target.js";
import { residualNonDamageStatus } from "./line-families.js";
import { resolveLineCondition } from "./line-conditions.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";
import { specialSupportTierData, progressionSupportTierData, progressionSupportText, specialSupportStarBonus, isActivationMedium } from "./data/skills/special-support-tiers-ss13.js";
import { EMPOWER_MODELED_SKILLS, EMPOWER_BUFF_SKILLS } from "./empower-effects.js";
import { WARCRY_BUFF_NAMES } from "./empower-buffs.js";
import { supportDataMode, supportGameLine, supportLineAffix } from "./game-skill-data.js";
// Movement rate for per-metre support lines (Hunting Tempo, 2026-10-15 patch update): src/dummy-target.js, the same 6 m/s
// placeholder as the Thunder Focus profile (no game figure fixes it).
import { ASSUMED_MOVEMENT_METERS_PER_SECOND } from "./dummy-target.js";
import { amEventInterval, AM_EVENT_LABELS } from "./activation-medium-events.js";
import { consumedStacks } from "./resource-consumption.js";
// Skill-mechanics census batch 4 (B2, 2026-10-28): Magnificent / Noble conditional additional damage (src/support-conditional-batch4.js).
import { BATCH4_RULES, resolveBatch4Condition } from "./support-conditional-batch4.js";
// Skill-mechanics census batch 5 (B3, 2026-10-28): hit-count and cadence changes (src/support-hit-count-batch5.js).
import { BATCH5_RULES, resolveBatch5Clause, batch5Status, BATCH5_DURATION_SKILLS, batch5ProjectileVolleyStatus } from "./support-hit-count-batch5.js";
// Census batch 6 (Minion, Spirit Magus, module and Sentry mechanics; src/minion-sentry-batch6.js).
import { BATCH6_SUPPORT_RULES, batch6Status, resolveBatch6Clause, BATCH6_DURATION_SKILLS } from "./minion-sentry-batch6.js";
// Supports on a summon read on its Minion skills (2026-10-28; src/summon-support-minion.js).
import { summonMinionRows, summonSupportReading } from "./summon-support-minion.js";
// Chunk 8 (2026-11-01): the clauses the census left unread, from their game records (src/support-chunk8.js).
import { CHUNK8_SUPPORT_RULES, resolveChunk8Condition, chunk8OwnStatus } from "./support-chunk8.js";
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

// Skills whose own effect is defensive only (2026-10-14): a support's Duration line adds no damage. Frost Shield (reference data):
// "-29% additional Physical Damage taken" / "-29% additional Fire Damage taken" while it lasts, no offensive buff or debuff.
const DEFENSIVE_ONLY_SKILLS = new Map([
  ["Frost Shield", "Frost Shield's own effect is defensive (reference data: -29% additional Physical and Fire Damage taken while it lasts; no offensive buff or debuff), so a longer duration adds no damage; its orbit hits per use are a fixed provisional count that does not read Duration"]
]);

// One resolver for what the supports on a setup do (research/support-batch-2026-10-12.md §6, chunk 1).
//
// resolveSupportEffects(setup, ctx) splits every enabled support into clauses — its reference data base text (eligibility and
// slot lines dropped), its Magnificent / Noble star line and rolled affix, and an Activation Medium's selected lines —
// reads each clause's value from its source, sorts it into a mechanic family with one ordered rule table, and returns a
// typed effect object plus a per-clause status for the engine that computes the setup's damage.
//
// Value sources (one per clause):
//   game       — (default; research/recipe-interpreter-step1-2026-10-25.md §17) the support's skill stone in the game tables
//                (src/game-skill-data.js supportGameLine): the stone affix (or the support's own buff record) whose template
//                matches the reference data base line, its arguments at the support's effective level (a level map, linear between the
//                listed levels) or fixed, stars for a star line. The clause keeps origin "leveled" / "fixed" by the game
//                argument and carries `game` (affix id) and, where reference data's number differed, `refdataText`. A line with no stone
//                affix (Activation Mediums, wordings the game splits or joins differently, Fragile Resurrection / Residues'
//                scripted expressions) keeps its reference data reading below. TLI_SUPPORT_PATH=text reads reference data only.
//   leveled    — the reference data progression column at the support's effective level (clamped 1–40); a cell can be a
//                fraction "a/b" or a pair "a,b" ("104,104" Added Erosion Damage, "6.5,26" Additional Ignite). The
//                pair form fixes bug B2 (it parsed as NaN and dropped every Added X Damage support on skill hits).
//   fixed      — the number in the base text (no column).
//   star       — Magnificent / Noble "+20% additional damage for the supported skill" replaced by
//                specialSupportStarBonus(stars): in game mode the stone's star map {1★ 0, 3★ 8, 5★ 20} (linear: 2★ 4, 4★ 14;
//                §17), with TLI_SUPPORT_PATH=text (stars − 1) × 5 (user-confirmed for Disintegrate 5★ = +20%).
//   roll       — the configured tier and roll (specialConfig) on the reference data T-ranges.
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
// with no cap (reference data Support_Skill: Lv1 +135%, Lv21 +235%, Lv41 +335%; the progression table's Lv.40 +330% agrees). The
// table value is used where it exists (Lv.1–40), the linear rule beyond it (B6, fixed 2026-10-12 with the user's source).
export function criticalStrikeRatingIncreasePercent(level) {
  const effective = Math.max(1, Math.round(level || 20));
  const column = supportProgressionSs13["Critical Strike Rating Increase"]?.columns?.find((item) => /Critical Strike Rating for the supported skill/i.test(item.heading));
  // Game mode: the stone's level map (the same values as the table, scripts/compare-support-game-values.mjs).
  const game = effective <= 40 && supportDataMode() === "game" ? supportGameLine("Critical Strike Rating Increase", "+135% Critical Strike Rating for the supported skill", { level: effective })?.values?.[0] : null;
  const table = Number.isFinite(game) ? game : effective <= 40 ? parseProgressionCell(column?.values?.[String(effective)])?.[0] : null;
  return Number.isFinite(table) ? table : 135 + 5 * (effective - 1);
}

/**
 * A progression column's numbers at a level for the readers outside the clause path (Aura supports, Aim's linked supports, Iron
 * Fortification): in game mode the stone affix behind the column's heading (src/game-skill-data.js, research §17), its numbers at the
 * column's numberIndexes; else (or when the stone has no matching affix) reference data's cell. null when neither has a number.
 */
export function supportColumnValues(name, column, level) {
  const refdata = parseProgressionCell(column?.values?.[String(level)]);
  if (column && supportDataMode() === "game") {
    const game = supportGameLine(name, column.heading, { level });
    const count = refdata?.length || 1;
    const indexes = Array.isArray(column.numberIndexes) && column.numberIndexes.length === count ? column.numberIndexes : Array.from({ length: count }, (_, index) => index);
    const values = game ? indexes.map((index) => game.values[index]) : null;
    if (values?.length && values.every(Number.isFinite)) return values;
  }
  return refdata;
}
/** A fixed support line's first number: the stone's value in game mode, else the number in the reference data text. */
export function supportLineValue(name, line, level = 20) {
  const game = supportDataMode() === "game" ? supportGameLine(name, line, { level }) : null;
  if (game && Number.isFinite(game.values[0])) return game.values[0];
  const match = String(line ?? "").replace(/−/g, "-").match(/[+-]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
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

const lineNumbersOf = (text) => (String(text).replace(/−/g, "-").match(/[+-]?\d+(?:\.\d+)?/g) || []).map(Number);
const tidy = (text) => String(text || "").replace(/−/g, "-").replace(/\s+%/g, "%").replace(/\s+/g, " ").trim().replace(/\s*\.$/, "");
// Wording with numbers (and reference data tier ranges "(a–b)") replaced by "#", for matching a base line with its column or tier line.
const signature = (text) => tidy(text).replace(/\(\s*[+-]?\d+(?:\.\d+)?\s*–\s*[+-]?\d+(?:\.\d+)?\s*\)/g, "#").replace(/[+-]?\d+(?:\.\d+)?/g, "#").replace(/#\s+(?=[a-z%])/gi, "#").toLowerCase();
const supportLevel = (support) => Math.max(1, Math.min(40, Math.round(support?.effectiveLevel || support?.level || 20)));
const isSpecial = (name) => /\((?:Magnificent|Noble)\)$/.test(name || "");
const eligibility = /^(?:Supports? |Cannot support |This skill can only be installed|Support Mobility)/i;
// Numbed and Frostbite count too (batch 1 2026-10-27): Numbed raises Lightning damage taken and Frostbite leads to Freeze on the dummy,
// so a clause that only inflicts them is damage-relevant (it read "No DPS effect" for want of the word "damage").
const damageWords = /damage|speed|critical strike|cast frequency|cooldown|channeled stack|ignite|trauma|wilt|ailment|affliction|reap|multistrike|spell burst|combo|trigger|numbed|frostbite/i;

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

// ---- SS14 conditional supports (census item #2, research/unmodeled-dps-census-2026-10-26.md §2.2; 2026-10-27) ----
// Nineteen regular supports whose damage clauses no rule read. Values come from the skill stones at the support's level (the clause
// text; src/game-skill-data.js), scopes from the game recipes named on each rule. Every clause here carries `census: true`; its
// condition is settled by resolveCensusCondition below from the planner's state (supportConditions in src/planner.js) and its badge
// by censusStatus. Untyped bodies are conditionalAdditional (all the skill's damage, or hit-only); typed bodies (Lightning, Physical,
// the dealt types, Fire) keep appliedValue 0 and carry `typedParts`, which reach the skill's hits (effects.additional), its DoT
// (src/skill-dot-model.js) and its ailments (src/ailment-applications.js) of those types. Build-wide buffs (Empowered Element,
// Gladiator's Roar, Psychic Surge) are family "censusBuff", settled in src/support-buff-effects.js.
const CENSUS_SUPPORT_RULES = [
  // Windbolt (recipe 559730880: 5719 all damage, additional, this skill, while the owner has Hasten 4015365).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill while having Hasten$`, "i"), build: (m) => ({ value: num(m[1]), condition: "hasten", census: true, recipe: 559730880 }) },
  // Blessed Leap (recipe 27578712: 5719 additional, this skill, × the Agility Blessing stacks l0, one term; up to 8).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill for each stack of Agility Blessing\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), condition: "agilityBlessingStacks", census: true, recipe: 27578712 }) },
  // Mana Convergence (recipe 822292224: node 119, per p0 Max Mana (attr 93) → 57191 all damage additional, this skill, capped).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill for every ${N} Max Mana, up to ${N}%$`, "i"), build: (m) => ({ value: num(m[1]), every: num(m[2]), cap: num(m[3]), condition: "perMaxMana", census: true, recipe: 822292224 }) },
  // Target Projection (recipe 101010412: 5719 additional, this skill, vs a Marked target 4010010; recipe 281533728: Enhanced Mark,
  // buff 331, on the supported skill's hits). The supported skill's own hits keep the dummy Marked.
  { family: "conditionalAdditional", pattern: new RegExp(`^The supported skill deals ${N}% additional damage to Marked enemies$`, "i"), build: (m) => ({ value: num(m[1]), condition: "markedByOwnHits", census: true, recipe: 101010412 }) },
  { family: "censusDetail", pattern: /^Inflicts Enhanced Mark when the supported skill hits$/i, build: () => ({ census: true, kind: "enhancedMark", recipe: 281533728 }) },
  // Reckless Aggression (recipe 370519520: node 700, per enemy within 20 m, while Aggression 4015373; 57191 additional, this skill).
  { family: "conditionalAdditional", pattern: new RegExp(`^While having Attack Aggression or Spell Aggression, ${N}% additional damage for the supported skill for each enemy within ${N} m, up to ${N}%$`, "i"), build: (m) => ({ value: num(m[1]), meters: num(m[2]), cap: num(m[3]), condition: "aggressionPerEnemy", census: true, recipe: 370519520 }) },
  { family: "nonDamage", pattern: /^[+-]?[\d.]+% Defense while having Attack Aggression or Spell Aggression$/i, build: () => ({}) },
  // Phantom Trace (recipe 309615840: gains Blur (buff 220) when this skill deals DoT; recipe 323230016: node 119 per p0 Blur Rating
  // (attr 46) → 57191 additional, this skill).
  { family: "censusDetail", pattern: /^Gains Blur when the supported skill deals Damage Over Time$/i, build: () => ({ census: true, kind: "blurGrant", recipe: 309615840 }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill for every ${N} Blur Rating$`, "i"), build: (m) => ({ value: num(m[1]), every: num(m[2]), condition: "perBlurRating", census: true, recipe: 323230016 }) },
  // Electric Overload (recipe 446638: buff 10800 on this skill's Critical Strike hits, 2 s; its buff row 762230: 5108 Lightning
  // additional, this skill). Uptime min(1, crit hits/s × duration), as Tremble's (src/crit-numbed-buff.js).
  { family: "conditionDetail", pattern: /^The supported skill gains a buff on Critical Strike\. The buff lasts [\d.]+\s*s$/i, build: () => ({}) },
  { family: "conditionalAdditional", pattern: new RegExp(`^Buffs grant ${N}% additional Lightning Damage to this skill$`, "i"), build: (m) => ({ value: num(m[1]), typed: "Lightning", condition: "critBuffUptime", census: true, recipe: 762230 }) },
  // Swiftstep Spell (recipe 513145920: row 4 5719 additional after moving > p0 s; row 3 a p4 s timed −25% after standing still > p2 s).
  // The Movement group (best by damage): moving holds the bonus; a sustained stand-still carries neither (the −25% lasts 3 s).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill after moving for more than ${N}\\s*s$`, "i"), build: (m) => ({ value: num(m[1]), seconds: num(m[2]), condition: "moving", census: true, recipe: 513145920 }) },
  { family: "conditionDetail", pattern: /^Loses this bonus if you stand still for more than [\d.]+\s*s, and [+-]?[\d.]+% additional damage for the supported skill for [\d.]+\s*s$/i, build: () => ({}) },
  // Elemental Conversion (recipe 978745600: rows 1–4 the dealt type's additional (5109 / 5107 / 5108 / 5402) when its collector
  // counted it; row 5 5002 Physical additional × l0+l1+l2+l3, one term).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional Physical Damage for the supported skill for each type of Non-Physical Damage dealt recently$`, "i"), build: (m) => ({ value: num(m[1]), typed: "Physical", condition: "nonPhysicalTypesPhysical", census: true, recipe: 978745600 }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage of the corresponding type for the supported skill for each type of Non-Physical Damage dealt recently$`, "i"), build: (m) => ({ value: num(m[1]), condition: "nonPhysicalTypesOwn", census: true, recipe: 978745600 }) },
  // Vigor Restitution (recipe 309503808: a counter of Max Life consumed, 4 s timed stacks of 57191 additional, multiplies).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage \\(multiplies\\) for the supported skill for every ${N}% Max Life consumed recently, up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ value: num(m[1]), every: num(m[2]), cap: num(m[3]), condition: "lifeConsumed", census: true, recipe: 309503808 }) },
  // Frostbloom (recipe 490668064: per hit of this skill, 4802 Critical Strike Rating increased by max(0, min(p0 × l0, p1)), l0 the
  // target's Frostbite Rating above 100).
  { family: "censusCrit", pattern: new RegExp(`^${N}% Critical Strike Rating against enemies for the supported skill for each point of enemy's Frostbite Rating exceeding (\\d+), up to ${N}%$`, "i"), build: (m) => ({ value: num(m[1]), above: num(m[2]), cap: num(m[3]), condition: "frostbiteAbove", census: true, recipe: 490668064 }) },
  // Still Charge (recipe 700563904: node 624 next action of this skill while standing still (l0 = 1); Still Momentum 11950).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the next supported skill after standing still$`, "i"), build: (m) => ({ value: num(m[1]), condition: "standingStill", census: true, recipe: 700563904 }) },
  { family: "conditionDetail", pattern: /^After standing still, gains Still Momentum when casting the supported skill$|^This effect lasts until the supported skill's Demolisher Charge is fully restored$/i, build: () => ({}) },
  // Finisher Combo (recipe 928460928: 6001 Attack Speed increased on the Combo Starter 6000411; recipe 994750784: 5719 additional on
  // the Combo Finisher 6000412; src/skill-hit-model.js reads both on the Combo cycle).
  { family: "combo", pattern: new RegExp(`^${N}% Attack Speed for the supported skill's Combo Starter$`, "i"), build: (m) => ({ value: num(m[1]), kind: "starterSpeed", census: true, recipe: 928460928 }) },
  { family: "combo", pattern: new RegExp(`^${N}% additional Hit Damage for the Combo Finisher of the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "finisherHit", census: true, recipe: 994750784 }) },
  // Psychic Surge (recipe 40376: node 624, on a Spell Burst activation after this Mobility skill's cast, the next action's hit
  // damage (tags Spell Burst 6010090, hit 5000003) +P2% additional), Empowered Element (recipe 446081152: 5727 Elemental Damage
  // increased while the supported skill lasts, node 292), Gladiator's Roar (recipe 654286: a p2 s timed 57191 additional on the
  // player when this Warcry is cast with an Elite inside 6 m × Skill Area): build-wide buffs (src/support-buff-effects.js).
  { family: "censusBuff", pattern: new RegExp(`^${N}% additional Hit Damage for skills cast by Spell Burst during the next (\\d+) Spell Burst\\(s\\) activated after casting the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), bursts: num(m[2]), kind: "psychicSurge", census: true, recipe: 40376 }) },
  { family: "censusBuff", pattern: new RegExp(`^${N}% Elemental Damage while the supported skill lasts$`, "i"), build: (m) => ({ value: num(m[1]), kind: "empoweredElement", census: true, recipe: 446081152 }) },
  { family: "censusBuff", pattern: new RegExp(`^${N}% additional damage for ${N}\\s*s if there are Elites within the area$`, "i"), build: (m) => ({ value: num(m[1]), seconds: num(m[2]), kind: "gladiatorsRoar", census: true, recipe: 654286 }) },
  { family: "nonDamage", pattern: /^Reverse Knocks Back enemies Nearby by [\d.]+ m when casting the supported skill$|^The effective area of this effect is affected by Skill Area bonuses$/i, build: () => ({}) },
  // Thrive in Adversity (recipes 878319232 / 446292160: 3401 Effect increased on this skill's Empower state with / without an entity
  // within 20 m): Empower Effect (src/empower-effects.js kind "conditionalEffect").
  { family: "empower", pattern: new RegExp(`^${N}% Effect for the supported skill when there is an Elite within ${N} m$`, "i"), build: (m) => ({ value: num(m[1]), meters: num(m[2]), kind: "conditionalEffect", eliteNeeded: true, census: true, recipe: 878319232 }) },
  { family: "empower", pattern: new RegExp(`^${N}% Effect for the supported skill when there are no Elites within ${N} m$`, "i"), build: (m) => ({ value: num(m[1]), meters: num(m[2]), kind: "conditionalEffect", eliteNeeded: false, census: true, recipe: 446292160 }) },
  // Turmoil Burst (recipe 3195285: Turmoil (buff 11920) on targets of this skill's Spell Burst hits, 0.2 s gate; its Effect +P2% per
  // Spell Burst stack consumed recently (buff 11921), up to 6). Turmoil's own +17%: buff 11920, affix 3221869 [17] (chunk 8; the patch notes agree).
  { family: "conditionalAdditional", pattern: /^Inflicts Turmoil on enemies within a certain area around the target when the supported skill cast by Spell Burst hits\. Interval: [\d.]+\s*s$/i, build: () => ({ value: TURMOIL_TAKEN_PERCENT, condition: "turmoil", census: true, recipe: 3195285 }) },
  { family: "conditionDetail", pattern: new RegExp(`^${N}% Turmoil (?:Effect|Radius) for each stack of Spell Burst consumed recently$|^Max stacks: \\d+$`, "i"), build: () => ({}) },
  // Blazing Scorch (recipe 412796512: Ablaze (buff 11930) on enemies the supported skill Ignites; recipe 357258688: node 700, +P2%
  // Ablaze Effect per Ignited enemy within 10 m, up to P3). Ablaze's own +15% Fire: buff 11930, affix 10413885 [15] (chunk 8; the patch notes agree).
  { family: "conditionalAdditional", pattern: /^Enemies Ignited by the supported skill gain Ablaze$/i, build: () => ({ value: ABLAZE_TAKEN_PERCENT, typed: "Fire", condition: "ablaze", census: true, recipe: 412796512 }) },
  { family: "conditionDetail", pattern: new RegExp(`^${N}% additional Ablaze Effect for each enemy within ${N} m Ignited by the supported skill, up to ${N}%$`, "i"), build: () => ({}) },
  // ---- Skill-mechanics census batch 2 (B1, 2026-10-27; research/skill-mechanics-census-2026-10-27.md) ----
  // Thunder Spike: Rumbling Thunder (Noble; recipe 13580737: on this skill's Shadow Strike True Body hit (trigger 1000033, tag 6020013), a
  // P2 s debuff on the target carrying attr 51221 mod 4 (additional Lightning Damage taken from this skill)). One True Body hit per use:
  // uptime min(1, uses/s × P2 s) on the skill's Lightning damage (typed part).
  { family: "conditionalAdditional", pattern: new RegExp(`^When the supported skill's Shadow Strike True Body hits an enemy, ${N}% additional Lightning Damage dealt by the skill to the enemy for ${N}\\s*s$`, "i"), build: (m) => ({ value: num(m[1]), seconds: num(m[2]), typed: "Lightning", condition: "trueBodyDebuff", census: true, recipe: 13580737 }) },
  // Homing Frost Bolt: Frost Barb (Magnificent; game affix 924935808: additional damage while holding ≥ P1 unfired Frost Bolts). The
  // Homing Frost Bolt profile holds its 6 unfired bolts (best case, src/skill-hit-profiles.js), so the bonus holds.
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill when having at least (\\d+) unfired Frost Bolt\\(s\\)$`, "i"), build: (m) => ({ value: num(m[1]), bolts: num(m[2]), condition: "unfiredBolts", census: true, recipe: 924935808 }) },
  // Homing Frost Bolt: Deep Chill (Noble; game affix 758886208): flat Critical Strike Rating against Frozen enemies (Frozen at a Frostbite
  // Rating of 100 or more, user-confirmed 2026-10-18).
  { family: "censusCrit", pattern: new RegExp(`^${N} Critical Strike Rating against Frozen enemies for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), critKind: "ratingFlat", condition: "frozenTarget", census: true, recipe: 758886208 }) },
  // Nether Grasp: Devour (Magnificent; game affix 10990381): +X% per enemy inside the Nether Terra's central area: the one dummy (best
  // case: it stands in the centre). Nether Grasp: Extermination (Noble; game affix 2809405): +X% additional damage taken by enemies inside
  // the central area, read on the supported skill's damage (provisional: the debuff on the dummy also raises the build's other damage).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for this skill for each enemy inside the Nether Terra's central area, up to ${N}% additional damage$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), condition: "terraCentre", census: true, recipe: 10990381 }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^The supported skill creates a fan-shaped Nether Grasp\\.\\s*\\+?\\s*(\\d+(?:\\.\\d+)?)% additional damage taken by enemies inside the Nether Terra's central area$`, "i"), build: (m) => ({ value: num(m[1]), condition: "terraCentre", census: true, recipe: 2809405 }) },
  // Corrosion Focus: Clustering (Magnificent): "+X% additional damage for the Projectile" while the character is within 6 m of it: the
  // Orb flies to the dummy, so it holds while the character stands near the dummy (the Distance group's Nearby, best case).
  { family: "conditionalAdditional", pattern: new RegExp(`^If the character is within ${N} m of a Projectile launched by the supported skill, ${N}% additional damage for the Projectile$`, "i"), build: (m) => ({ value: num(m[2]), meters: num(m[1]), condition: "nearOwnProjectile", census: true }) },
  // Scorching Beam: Shockwave (Magnificent): settled on the Scorching Beam path from the beam's explosions (src/build-mechanics.js).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage per explosion within ${N}\\s*s, up to (\\d+) times$`, "i"), build: (m) => ({ value: num(m[1]), seconds: num(m[2]), cap: num(m[3]), condition: "beamExplosions", census: true }) },
  // Frost Terra: Cohesion (Noble; recipe 596392704: field 2600241 (the Terra's additional damage per stack) p0 and 2600242 (Skill Area) p1,
  // "every 0.5 s, stacks up to 3"): the Terra's stacks build with its age, so its damage over time averages min(3, ⌊t ÷ 0.5⌋) stacks over
  // the Terra's life, one additional term (src/skill-dot-model.js reads the clause; provisional: stacks additive in one term).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage and ${N}% Skill Area for the Terra created by the supported skill every ${N}\\s*s\\. Stacks up to (\\d+) times$`, "i"), build: (m) => ({ value: num(m[1]), everySeconds: num(m[3]), cap: num(m[4]), condition: "terraAgeStacks", census: true, recipe: 596392704 }) },
  // Frost Terra: Winter's Bite (Noble; recipe 118137152): the Terra's debuff (+13% additional Cold Damage taken, label 3100212) on enemies
  // on it; each Terra Charge consumed per cast adds +P1% debuff effect (up to 4), and the charges no longer add the skill's own
  // per-charge additional damage. Read on the Terra's Cold damage (typed part) with the charges held per cast (provisional).
  { family: "conditionalAdditional", pattern: new RegExp(`^The Terra spawned by the supported skill inflicts a debuff on enemies on it, making them take ${N}% additional Cold Damage\\. When casting this skill, each stack of Terra Charge makes the debuff effect additionally ${N}%\\s*, stacking up to (\\d+) stacks, but no longer (?:additionally increases this skill's damage|increases this skill's additional damage)$`, "i"), build: (m) => ({ value: num(m[1]), perCharge: num(m[2]), cap: num(m[3]), typed: "Cold", condition: "wintersBite", census: true, recipe: 118137152 }) },
  // ---- Condition-unread batch 3 (2026-10-28; research/condition-coverage-2026-10-27.md; tests/condition-unread-batch3.test.js) ----
  // Mind Control: Befuddle (Magnificent; recipe 587389760: trigger 1000031 on this skill, no Hit tag, attr 5719 additional when the
  // target's crowd-control count l0 ≥ 3, gate 300 operator 3): the crowd control types the planner keeps on the dummy (src/combat-states.js).
  // Mind Control deals no hit: its DoT is what takes this (core-formulas §14).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage when the target of the supported skill (?:are|is) affected by (\\d+) or more crowd control effects$`, "i"), build: (m) => ({ value: num(m[1]), count: num(m[2]), condition: "crowdControlAtLeast", census: true, recipe: 587389760 }) },
  // Double Thrusts: Restless (Magnificent; recipe 164098032: node 700 counts the entities within 6 m (range 600) carrying Trauma 4000160 and
  // writes attr 6001 (Attack Speed) additional × the count, up to P2): one enemy, the training dummy, while the build Traumatizes it.
  { family: "censusSpeed", pattern: new RegExp(`^${N}% additional Attack Speed, up to ${N}%\\s*, for the supported skill for every enemy with Trauma nearby$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), meters: 6, condition: "traumatizedNearby", census: true, recipe: 164098032 }) },
  // Chain Lightning: Augmentation (Magnificent; recipe 882900480: trigger 1001220 "on each Jump of the skill", node 355 writes 5719 per Jump
  // remaining): only a jumped hit takes it, and on the one training dummy the chain makes no Jump.
  { family: "notOnDummy", pattern: new RegExp(`^${N}% additional damage for every ${N} Jump\\(s\\) remaining of the supported skill \\(multiplies\\)$`, "i"), build: () => ({ reason: "game recipe 882900480 applies it on each Jump of the skill (trigger 1001220); a chain needs another enemy to Jump to, and the dummy is the only one" }) },
  // Defense Layers (recipe 895779: Energy Shield Charge Speed, attr 1602, while the supported skill lasts) and Fire Burst: Prairie Fire's
  // Skill Area for the Spell Burst casts: no damage on the one dummy.
  { family: "nonDamage", pattern: /^[+-]?[\d.]+% Energy Shield Charge Speed while the supported skill lasts$/i, build: () => ({ reason: "Energy Shield Charge Speed (recovery only)" }) },
  { family: "nonDamage", pattern: /^[+-]?[\d.]+% additional Skill Area for skills cast by Spell Burst when Spell Burst is activated by the supported skill\. Stacks up to \d+ time\(s\)$/i, build: () => ({ reason: "Skill Area only: one dummy is inside the area either way" }) },
  // Howling Gale: Rapid Sweep (Magnificent; recipe 781151744: while the Gale (buff 10850) lasts, one stack of buff 10853 every 1 s (Wait 1),
  // up to P2; 2 lost per channeled stack lost, all when the channel ends; 5719 additional × stacks). The channel is held on the dummy, so
  // the stacks sit at their cap with own buffs pre-built; cold, they build 1 per second.
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for every 1\\s*s the Gale of the skill lasts\\. Stacks up to (\\d+) time\\(s\\)\\. For every channeled stack this skill loses, loses \\d+ stacks of this buff\\. All stacks of this buff are lost when all channeled stacks are lost$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), condition: "galeSeconds", census: true, recipe: 781151744 }) },
  // Focus Pts (Thunder Focus: Tremor, Acuteness Focus: Piercing Agony, Ice Focus: Shattered Ice; recipe 279580064: on casting, node 624 the
  // next action +P2% additional per P1 Focus Pts consumed) and Acuteness Focus: Remaining Strength (recipe 788476224: every P0 Focus Pts
  // gained adds a 4 s stack of buff 10446, up to 20; 5719 additional × stacks): the Focus skill profile's Pts per use and per second.
  { family: "conditionalAdditional", pattern: new RegExp(`^For every ${N} Focus Pts consumed by the supported skill, ${N}% additional damage$`, "i"), build: (m) => ({ value: num(m[2]), every: num(m[1]), condition: "focusPtsConsumed", census: true, recipe: 279580064 }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^For every ${N} Focus Pts gained by the supported skill recently, \\+?\\s*${N}% additional damage\\. Stacks up to (\\d+) times$`, "i"), build: (m) => ({ value: num(m[2]), every: num(m[1]), cap: num(m[3]), seconds: 4, condition: "focusPtsGained", census: true, recipe: 788476224 }) },
  // Psychic Burst, Lightning Storm: Raging Storm, Moon Strike: Wax and Wane (recipe 550492864: attr 5719 additional on {Spell Burst 6010090,
  // this skill, hit}): the supported skill's own Spell Burst casts; "can activate Spell Burst" lifts the skill's own Spell Burst block.
  { family: "spellBurst", pattern: new RegExp(`^The supported skill can activate Spell Burst\\s*\\.\\s*${N}% additional Hit Damage for skills cast by Spell Burst when Spell Burst is activated by the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "hitAdditional", canActivate: true, recipe: 550492864 }) },
  // The same two parts as separate clauses (a level row split on its sentence).
  { family: "spellBurst", pattern: /^The supported skill can activate Spell Burst$/i, build: () => ({ value: 0, kind: "canActivate", canActivate: true }) },
  { family: "spellBurst", pattern: new RegExp(`^${N}% additional Hit Damage for skills cast by Spell Burst when Spell Burst is activated by the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), kind: "hitAdditional", recipe: 550492864 }) },
  // Groundshaker: Epicenter / Cripple (recipe 119083224: attr 5719 additional on {this skill, 6101354 the spreading fissure}): a penalty on
  // the fissure's own hits (the Groundshaker profile's "fissure" component).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage while the fissure created by the supported skill spreads$`, "i"), build: (m) => ({ value: num(m[1]), component: "fissure", condition: "fissureSpreads", census: true, recipe: 119083224 }) },
  // Fire Explosion (recipe 13523221: on the supported skill dealing damage (trigger 1000030, 1 s gate) a 4 s buff 11730 of +P1 Affliction Per
  // Second): held while the supported skill deals damage to the dummy (src/planner.js adds it to the build's Affliction per second).
  { family: "affliction", pattern: new RegExp(`^${N} Affliction Per Second if the supported skill has dealt damage recently$`, "i"), build: (m) => ({ value: num(m[1]), kind: "recentDamage", recipe: 13523221 }) },
  // Precise: Safety in Numbers: read by the Aura model (src/aura-effects.js, × min(7, allies affected): the "auraAffectedAllies" setting).
  { family: "auraSupport", pattern: new RegExp(`^${N}% Aura Effect for each ally affected by the supported skill, stacking up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), condition: "auraAffectedAllies", recipe: 637226432 }) },
  // Minion supports (their recipes inject affix 2 into the Minions summoned by the supported skill, node 111): settled from the Minion's
  // own state (src/minion-damage-model.js minionCensusLine) or the planner's (resolveCensusCondition).
  // Savage Growth (recipe 886379: node 119, per P1 Growth (stat 65) → 57191 additional P2).
  { family: "minion", pattern: new RegExp(`^${N}% additional damage for every ${N} point\\(s\\) of Growth Minions summoned by the supported skill have$`, "i"), build: (m) => ({ value: num(m[1]), every: num(m[2]), condition: "minionGrowth", census: true, recipe: 886379 }) },
  // Command (Grim Phantom: Glare, Spider Tank: Focus Fire, Modularization: Resonance, Machine Guard: Discipline; recipes 7417917 / 916745472 /
  // 559099072: on casting (trigger 1000069) the next loop action of the Minions takes the bonus): the summoner's Command (src/minion-cores.js
  // commandState: full Command, switch fullCommand).
  { family: "minion", pattern: new RegExp(`^${N}% additional damage for Minions summoned by the supported skill for every 1 Command\\s*, up to ${N}%$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), condition: "minionCommand", census: true, recipe: 7417917 }) },
  { family: "minion", pattern: new RegExp(`^${N}% additional damage for Minions summoned by the supported skill for every 1 Command\\s*\\.\\s*Stacks up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ value: num(m[1]), stacks: num(m[2]), condition: "minionCommand", census: true, recipe: 916745472 }) },
  { family: "minion", pattern: new RegExp(`^While the buff is active, ${N}% additional damage for Minions summoned by the supported skill for every 1 Command the summoner has, stacking up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ value: num(m[1]), stacks: num(m[2]), buffHeld: true, condition: "minionCommand", census: true, recipe: 559099072 }) },
  // Summon Frost Magus: Piercing Cold (recipe 306222752: 5719 additional on the Minions' damage to a Frozen target 4000110).
  { family: "minion", pattern: new RegExp(`^${N}% additional damage dealt to Frozen enemies for Minions summoned by the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), condition: "minionFrozenTarget", census: true, recipe: 306222752 }) },
  // Erosion / Rock Magus Empower supports (recipe 638233600: 5719 additional on the Minion while it has buff 11160, its Empower Skill's).
  { family: "minion", pattern: new RegExp(`^${N}% additional damage while the Empower Skill of Minions summoned by the supported skill lasts$`, "i"), build: (m) => ({ value: num(m[1]), condition: "minionEmpowerBuff", census: true, recipe: 638233600 }) },
  // Modularization: Calibrate (recipe 5334973: on the summoner's hit (trigger 1000033) a P1 s stack of buff 11540; the Minions take min(P3,
  // stacks) × P2 additional): stacks = min(P3, the player's hits per second × P1 s).
  { family: "minion", pattern: new RegExp(`^For each hit the summoner landed in the last ${N}\\s*s, ${N}% additional damage for Minions summoned by the supported skill\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ value: num(m[2]), seconds: num(m[1]), cap: num(m[3]), condition: "summonerHits", census: true, recipe: 5334973 }) },
  // Summon Machine Guard: Dead Silence (recipe 368114272: attr 5901 (damage at the center) additional on Self-Destruct Protocol 6100310).
  { family: "minion", pattern: new RegExp(`^${N}% additional damage dealt to enemies in the center of Self-Destruct Protocol activated by Minions summoned by the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), condition: "selfDestructCentre", census: true, recipe: 368114272 }) }
];
// The two debuffs' values, config_char_buff 11920 and 11930 (chunk 8). What they reach: open question support-turmoil-ablaze-values.
const TURMOIL_TAKEN_PERCENT = 17;
const ABLAZE_TAKEN_PERCENT = 15;

// ---- Activation Medium event triggers and Spell Burst consumption (census items #8 / #12, 2026-10-27) ----
// Activation Medium rows (config_modifier kind 5; src/data/skills/activation-medium-progression-ss13.generated.js) whose trigger is
// an event: the event rate comes from the planner's hit pass (src/activation-medium-events.js; facts.amEvents), the rate rule is
// the user-confirmed 1 / max(event interval, trigger interval, effective cooldown) (Activation Medium: Boss, 2026-10-12). Every clause
// here carries `amEvent: true`; its badge is amEventStatus below. Kinds:
//   - trigger "amEvent" (the supported skill is triggered by the event): Spell Burst (the build's other skills' Spell Burst
//     activations), Burst Activation (its own full Spell Burst charge, then its Spell Burst), Demolisher (Demolisher Charges gained by
//     the build's Demolisher skills), Resonance (uses of the skills with Resonance Activation), Track (every interval while the dummy
//     is Locked On);
//   - trigger "eventSource" (the supported skill makes events for the others): Resonance Activation, Critical Strike / Channel
//     (Instructions), Lock On and Track's "Always Locks On";
//   - Preparation ("Prepares the supported skill every N s") is an interval trigger (the user's Aim setup reading: "triggers every
//     5 s, or as soon as the cooldown ends"; recipe 80629904: node 2320, the same trigger as the others, chunk 8);
//   - Instruction's "each Instruction adds +X% damage to the next skill triggered …, up to +Y%" is a triggered-only additional line
//     of min(Y, X × Instructions per second × the trigger interval) (open question am-instruction-events);
//   - Root Attack's per-metre bonus rides its "when stopping moving" auto-use, Not on dummy like the trigger.
// Magnificent "consume Spell Burst at max stacks" supports (Flame Jet, Fallen Star, Storm Field, Tidewell, Haunting Abomination):
// family "spellBurstConsume", read per component in src/skill-hit-model.js.
const AM_EVENT_RULES = [
  { family: "trigger", pattern: new RegExp(`^Triggers the supported skill when activating Spell Burst\\s*\\.? Interval: ${N}\\s*s$`, "i"), build: (m) => ({ kind: "amEvent", event: "spellBurst", interval: num(m[1]), amEvent: true }) },
  { family: "trigger", pattern: /^When Spell Burst is fully charged, triggers the supported skill on the nearest enemy within [\d.]+\s*m and attempts to trigger the supported skill's Spell Burst$/i, build: () => ({ kind: "amEvent", event: "burstFull", interval: 0, amEvent: true }) },
  { family: "nonDamage", pattern: /^[+-]?[\d.]+% Movement Speed for [\d.]+\s*s when the supported skill activates Spell Burst$/i, build: () => ({}) },
  { family: "trigger", pattern: new RegExp(`^Triggers the supported skill upon gaining Demolisher Charge\\s*\\.? Interval: ${N}\\s*s$`, "i"), build: (m) => ({ kind: "amEvent", event: "demolisher", interval: num(m[1]), amEvent: true }) },
  { family: "trigger", pattern: /^Triggers the supported skill when Resonance is activated$/i, build: () => ({ kind: "amEvent", event: "resonance", interval: 0, amEvent: true }) },
  { family: "trigger", pattern: /^Activates Resonance when you use the supported skill$/i, build: () => ({ kind: "eventSource", event: "resonance", amEvent: true }) },
  { family: "trigger", pattern: new RegExp(`^When the supported skill lands a Critical Strike, sends ${N} Instruction\\(s\\)\\s*\\.? Interval: ${N}\\s*s$`, "i"), build: (m) => ({ kind: "eventSource", event: "instruction", source: "crit", perEvent: num(m[1]), interval: num(m[2]), amEvent: true }) },
  { family: "trigger", pattern: new RegExp(`^When channeling the Supported Skill, sends 1 Instruction for every ${N} stack\\(s\\) channeled$`, "i"), build: (m) => ({ kind: "eventSource", event: "instruction", source: "channel", perStacks: num(m[1]), amEvent: true }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^During the trigger interval, each Instruction adds ${N}% damage to the next skill triggered by the Supported Skill, up to ${N}% additional damage$`, "i"), build: (m) => ({ value: num(m[2]), perInstruction: num(m[1]), cap: num(m[2]), condition: "instructions", triggeredOnly: true, amEvent: true }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^Every 1\\s*m moved adds ${N}% damage to the next auto used supported skill, up to ${N}%\\s*\\.? During Multistrike, the bonus persists until the multistrike ends$`, "i"), build: (m) => ({ value: num(m[2]), perMeter: num(m[1]), condition: "rootAttack", triggeredOnly: true, amEvent: true }) },
  { family: "trigger", pattern: new RegExp(`^Triggers the supported skill once on up to (\\d+) Locked-On enemy\\(ies\\) within ${N}\\s*m every ${N}\\s*s$`, "i"), build: (m) => ({ kind: "amEvent", event: "lockOn", targets: num(m[1]), meters: num(m[2]), interval: num(m[3]), amEvent: true }) },
  { family: "trigger", pattern: /^Always Locks On enemies within [\d.]+\s*m$/i, build: () => ({ kind: "eventSource", event: "lockOn", source: "always", amEvent: true }) },
  { family: "trigger", pattern: /^Locks On enemies within [\d.]+\s*m when you use the supported skill$/i, build: () => ({ kind: "eventSource", event: "lockOn", source: "use", amEvent: true }) },
  { family: "trigger", pattern: /^Removes Lock On when the supported skill deals damage$/i, build: () => ({ kind: "eventDetail", event: "lockOn", removesLockOn: true, amEvent: true }) },
  // Recipe 80629904 is a trigger like Perpetual Motion's: node 2320 (checkCD) behind gate 206 with cooldown P1, inCdOnCreating false, so it starts ready.
  { family: "trigger", pattern: new RegExp(`^Prepares the supported skill every ${N}\\s*s$`, "i"), build: (m) => ({ kind: "interval", interval: num(m[1]), prepared: true, startsReady: true, recipe: 80629904 }) },
  // Activation Medium: Sentry (skill-mechanics census batch 2, 2026-10-27): "Always attempts to trigger the Supported Skill if no Sentries
  // are within X m. Interval: 0.1 s" deploys the supported Sentry skill whenever none is near, so a Sentry is always deployed: the Sentry
  // use model's continuous uptime (src/skill-hit-profiles.js sentry: recast on expiry, best case) already holds it; no extra use is added
  // (a trigger only fires while no Sentry is within range). Family triggerDetail, so it adds no trigger rate.
  { family: "triggerDetail", pattern: new RegExp(`^Always attempts to trigger the Supported Skill if no Sentries are within ${N}\\s*m\\.? Interval: ${N}\\s*s$`, "i"), build: (m) => ({ kind: "sentryPresence", meters: num(m[1]), interval: num(m[2]), amEvent: true }) },
  { family: "spellBurstConsume", pattern: new RegExp(`^When the supported skill (erupts Fire Bombs|drops Comets|generates Currents|erupts Torrents|deals Area Damage), if Spell Burst is at max stacks, you can consume Spell Burst\\. ${N}% additional Hit Damage for (?:these|this|this wave of) (Fire Bombs|Comets|Thunderstrike|Torrents|Area Damage) for each stack consumed$`, "i"), build: (m) => ({ value: num(m[2]), component: SPELL_BURST_CONSUME_COMPONENTS[m[3].toLowerCase()], event: m[1], amEvent: true }) }
];
// The hit component each "consume Spell Burst" support names (src/skill-hit-profiles.js keys).
const SPELL_BURST_CONSUME_COMPONENTS = { "fire bombs": "bombs", comets: "comets", thunderstrike: "thunderstrike", torrents: "torrents", "area damage": "ticks" };

// The ordered clause rule table. `family` names the effect bucket; `build(match)` returns the parsed fields.
// Shared with the coverage badges (src/skill-coverage.js) through the clause statuses.
export const SUPPORT_CLAUSE_RULES = [
  ...CHUNK8_SUPPORT_RULES,
  ...CENSUS_SUPPORT_RULES,
  ...BATCH4_RULES,
  ...BATCH5_RULES,
  ...BATCH6_SUPPORT_RULES,
  ...AM_EVENT_RULES,
  // Conditional additional damage resolved from planner state (chunk 2; research/support-batch-2026-10-12.md §5.7).
  { family: "conditionalAdditional", pattern: new RegExp(`^The supported skill deals ${N}% additional damage to Cursed enemies$`, "i"), build: (m) => ({ value: num(m[1]), condition: "cursed" }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^The supported skill deals ${N}% additional damage to Numbed enemies\\. For every stack of Numbed the enemy has, the supported skill deals ${N}% additional damage$`, "i"), build: (m) => ({ value: num(m[1]), perStack: num(m[2]), condition: "numbed" }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^The supported skill deals ${N}% additional damage for every type of Ailment on enemy \\(multiplies\\)$`, "i"), build: (m) => ({ value: num(m[1]), condition: "ailmentTypes", multiplies: true }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill when there is only 1 enemy nearby$`, "i"), build: (m) => ({ value: num(m[1]), condition: "singleEnemy" }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill when using an? (gun|cannon|bow|crossbow)$`, "i"), build: (m) => ({ value: num(m[1]), condition: "weapon", weapon: m[2].toLowerCase() }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^The supported skill deals ${N}% additional damage to Frozen enemies`, "i"), build: (m) => ({ value: num(m[1]), condition: "frozen" }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill for every stack of buffs while standing still \\(multiplies\\)$`, "i"), build: (m) => ({ value: num(m[1]), condition: "standingStill", multiplies: true }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage \\(multiplies\\) for the supported skill for every 5 m moved recently\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), condition: "moving", multiplies: true }) },
  // Flame Slash: Immediate Threat (Magnificent), game recipe 754814272: node 136 (by distance) writing 57191 all damage mod 4 with the
  // Attack tag on trigger 1000031 of this skill: the supported skill's Attack hits only, never its ailments or DoT (batch 7 damage
  // fixes 2026-10-28; the Recklessness rule below). The Attack tag on the write decides this, not the trigger: the DoT value raises
  // 1000031 too (core-formulas §14). Before batch 7 it also reached Flame Slash's Ignite / Trauma / Wilt (×1.47 on each).
  { family: "conditionalAdditional", pattern: new RegExp(`deals more damage to enemies that are closer within \\d+ m, dealing up to ${N}% additional damage to enemies within (\\d+) m$`, "i"), build: (m) => ({ value: num(m[1]), condition: "nearTarget", meters: num(m[2]), skillScope: "Attack", hitOnly: true, recipe: 754814272 }) },
  { family: "conditionalAdditional", pattern: new RegExp(`^The supported skill deals ${N}% additional damage to enemies in proximity$`, "i"), build: (m) => ({ value: num(m[1]), condition: "nearTarget" }) },
  // Recklessness (reference data support text): "0.5% additional damage for the supported skill for every 1% Life lost, up to 26%". Its game
  // recipe (506943104: node 119 from missing Life %, writing 57191 all damage mod 4 with tags {Attack 6001090, this skill 5000002}, no
  // DoT or ailment tag) reaches the supported skill's Attack hits only: no Spell hit, DoT or ailment (user decision 2026-10-25, "follow
  // the game recipes"; research/recipe-interpreter-step1-2026-10-25.md §17).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill for every 1% Life lost, up to ${N}%$`, "i"), build: (m) => ({ value: num(m[2]), perPercent: num(m[1]), cap: num(m[2]), condition: "lifeLost", skillScope: "Attack", hitOnly: true, recipe: 506943104 }) },
  // Willpower's buff description: the stacks the damage line above counts.
  { family: "conditionDetail", pattern: /^While standing still, gains 1 stack of buff when using the supported skill|^The buff lasts for another [\d.]+ s after you start moving/i, build: () => ({}) },
  // Elemental Impact (reworked, 2026-10-15 patch update): additional Elemental Damage while the skill deals all three Elemental types.
  { family: "allElementalAdditional", pattern: new RegExp(`^${N}% additional Elemental Damage for the supported skill if it has dealt all types of Elemental Damage recently$`, "i"), build: (m) => ({ value: num(m[1]), typed: "Elemental", scope: scopeFor("Elemental") }) },
  // Chromatic Shot: Lightchaser (2026-11-02; game recipe 651717): per point of Intelligence / Strength / Dexterity, + P1 / 100 / 2 to
  // the main-stat damage ratio field 20062482 (node 114), on the supported skill's main-stat tags: the 0.5% per point × (1 + P1 / 100).
  { family: "mainStatRatio", pattern: new RegExp(`^${N} ?% additional damage ratio granted by the supported skill's main attribute$`, "i"), build: (m) => ({ value: num(m[1]) }) },
  // Hunting Tempo (reworked, 2026-10-15 patch update): buffed next N uses per 6 m moved; the Knockback half has no dummy effect.
  { family: "movementCharges", pattern: new RegExp(`^${N}% additional damage and ${N}% Knockback Chance to the next (\\d+) supported skill\\(s\\) for every ${N} m moved$`, "i"), build: (m) => ({ value: num(m[1]), knockback: num(m[2]), uses: num(m[3]), meters: num(m[4]) }) },
  { family: "critOnlyAdditional", pattern: new RegExp(`^${N}% additional damage for the supported skill when it lands a Critical Strike$`, "i"), build: (m) => ({ value: num(m[1]) }) },
  // Focused Shot: Power Bow (Noble), game recipe 145695360 (batch 1 2026-10-27; before, the nonDamage catch-all swallowed it): the
  // Knockback half (field 2006206) has no dummy effect; "+X% additional damage on Critical Strike" is attr 5719 additional on the crit
  // tag 5001010, × l0 (the Fervor Effect factor, "affected by Fervor Effect"). Fervor is read as held (best case).
  { family: "critOnlyAdditional", pattern: new RegExp(`^While having Fervor\\s*,\\s*${N}% Knockback Chance and ${N}% additional damage on Critical Strike for the supported skill\\. This effect is affected by Fervor Effect$`, "i"), build: (m) => ({ value: num(m[2]), knockback: num(m[1]), fervor: true }) },
  // Ice Focus: Frigid Wind (Noble), game recipe 400677504 (batch 1 2026-10-27; before, read as No DPS effect through the Skill Area
  // catch-all): while the Ice Storm buff (10474) is up, every 0.033 s tick repeats +0.16% additional damage (and +0.8% Skill Area), up
  // to P2 × 30 ticks: +4.8% per second of storm, capped at P2 × 4.8% (the text rounds it to "+5% every second … up to P2 times").
  // Read as a linear ramp from the storm's start, time-averaged over the storm (provisional, open question support-frigid-wind-ramp).
  { family: "conditionalAdditional", pattern: new RegExp(`^${N}% additional Skill Area and ${N}% additional damage every second for the supported skill while the Ice Storm lasts\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ value: num(m[2]), condition: "iceStormRamp", cap: num(m[3]) }) },
  { family: "perStack", pattern: new RegExp(`^${N}% additional damage for the supported skill for each stack of Focus Blessing, stacking up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), stackSource: "focusBlessing" }) },
  // Swift Bolt (Magnificent) roll (game recipe 277886048; Youga bolt gap F5, 2026-10-27): trigger 1000078 "on casting the supported
  // skill" adds a stack, up to P2; attr 5719 mod 4 = P1 × stacks (one additional term). The joined reference data row also carries the
  // "+P3% additional Projectile Speed … for each time it was cast recently" half: Projectile Speed's damage recipes read the increased
  // pool only, so it adds no damage. Stacks = min(cap, casts in the last 4 s) at the skill's use rate (src/skill-hit-model.js;
  // Tangle-fired casts counted: provisional, open question support-cast-recently-tangle).
  { family: "perStack", pattern: new RegExp(`^${N}% additional damage for the supported skill for each time it was cast recently, up to (\\d+) time\\(s\\)(?:\\s+${N}% additional Projectile Speed for the supported skill for each time it was cast recently, up to \\d+ time\\(s\\))?$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), stackSource: "castRecently" }) },
  // Disintegration (Noble) roll (game recipe 104227064 writes field 2600701 = P1, read by the skill's own script; F4, 2026-10-27):
  // additional Hit Damage × the forks remaining when the hit lands. On one dummy only the spear's first hit lands, with every fork
  // remaining (profile `forks`, src/skill-hit-profiles.js; provisional, open question forking-thunder-remaining-forks).
  { family: "perStack", pattern: new RegExp(`^${N}% additional Hit Damage for the supported skill for each remaining fork$`, "i"), build: (m) => ({ value: num(m[1]), cap: null, stackSource: "remainingForks" }) },
  { family: "perStack", pattern: new RegExp(`^${N}% additional damage for every channeled stack$`, "i"), build: (m) => ({ value: num(m[1]), cap: null, stackSource: "channel" }) },
  { family: "perStack", pattern: new RegExp(`^${N}% additional Ignite Damage for each stack of Ignite additionally inflicted$`, "i"), build: (m) => ({ value: num(m[1]), cap: null, stackSource: "additionalIgniteStacks" }) },
  { family: "perStack", pattern: new RegExp(`^For each stack of Ignite an enemy has, the supported skill deals ${N}% additional Ignite Damage to the enemy, up to ${N}%$`, "i"), build: (m) => ({ value: num(m[1]), cap: num(m[2]), stackSource: "igniteOnEnemy" }) },
  { family: "additional", pattern: new RegExp(`^${N}% additional damage for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), scope: {} }) },
  { family: "additional", pattern: new RegExp(`^${N}% additional Hit Damage for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), scope: { hitOnly: true }, typed: "Hit" }) },
  { family: "additional", pattern: new RegExp(`^${N}% additional (Spell|Area|Projectile|Elemental|Physical|Fire|Cold|Lightning|Erosion|Melee|Attack) Damage for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]), typed: m[2][0].toUpperCase() + m[2].slice(1).toLowerCase(), scope: scopeFor(m[2]) }) },
  { family: "dotAdditional", pattern: new RegExp(`^${N}% additional Damage Over Time for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]) }) },
  // Pain Amplification (reference data support text): additional DoT while the enemy is at Max Affliction (frost-terra audit 2026-10-13).
  { family: "maxAfflictionDot", pattern: new RegExp(`^${N}% additional Damage Over Time against enemies with Max Affliction for the supported skill$`, "i"), build: (m) => ({ value: num(m[1]) }) },
  // Ground Divide (reference data support text): Terra Charge stacks and restoration speed of the supported Terra skill (src/selena-dance.js).
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
  // Activation Medium: Multistrike (reference data, 2026-10-14): one trigger per Max Multistrike Count event of the build's multistriking
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
  // Thunder Slash: Flurry (Noble; game affix 711264384) and Keen Edge (Magnificent; game affixes 491653184 / 62898652; skill-mechanics
  // census batch 2, 2026-10-27): read by src/skill-hit-model.js multistrikeSequence (maxCountCap / allAtMax / repeatSpeedAdditionalPercent)
  // and steepAttemptShare (perRepeats).
  { family: "multistrike", pattern: /^Multistrikes of the supported skill are always deemed to have the Max Multistrike Count, but the Max Multistrike Count for the supported skill is (\d+)$/i, build: (m) => ({ value: num(m[1]), kind: "flurry" }) },
  { family: "multistrike", pattern: new RegExp(`^${N}% additional Attack Speed when the supported skill launches Multistrikes$`, "i"), build: (m) => ({ value: num(m[1]), kind: "repeatSpeed" }) },
  { family: "steepStrike", pattern: new RegExp(`^${N} to the number of Multistrikes required for the supported skill's Steep Strike attempts$`, "i"), build: (m) => ({ value: num(m[1]), kind: "attemptRepeats" }) },
  // Steep Strike chance on the supported skill (Raging Slash; 2026-10-14): summed with the skill's own chance and the build's
  // plain lines in src/skill-hit-model.js steepStrikeState.
  { family: "steepStrike", pattern: new RegExp(`^The supported skill ${N}% Steep Strike chance\\.?$`, "i"), build: (m) => ({ value: num(m[1]), kind: "chance" }) },
  // Thunder Slash: Big Stride (Noble; reference data): "After moving 8 m, the supported skill is guaranteed to launch a Steep Strike over
  // the next 4s". User-supplied reading (2026-10-14; the window held while moving confirmed by a user-supplied answer
  // 2026-10-15): every attack in the 4 s window is a Steep Strike; best case the window is always open while Moved recently
  // holds (the user's always-moving rule), so every use is a Steep Strike (provisional).
  { family: "steepStrike", pattern: new RegExp(`^After moving ${N}\\s*m, the supported skill is guaranteed to launch a Steep Strike over the next ${N}\\s*s$`, "i"), build: (m) => ({ value: 0, kind: "guaranteedAfterMoving", meters: num(m[1]), seconds: num(m[2]) }) },
  // Thunder Slash: Blade Cluster (Magnificent; reference data): "Generates 2 additional Steep Strikes when the supported skill launches a
  // Steep Strike". User-supplied answer (2026-10-15, provisional; replaces the 2026-10-14 "+2 max stored attempts" reading): each
  // launched Steep Strike produces 2 additional Steep Strike hits on the same target, so the Steep Strike component deals × 3
  // its hits per launch (src/skill-hit-model.js steepStrikeState clusterHits). Supports Thunder Slash only (game support filter).
  { family: "steepStrike", pattern: new RegExp(`^Generates ${N} additional Steep Strikes when the supported skill launches a Steep Strike$`, "i"), build: (m) => ({ value: 0, attempts: num(m[1]), kind: "extraAttempts" }) },
  // Thunder Spike: Tremble (Noble; reference data tiers T2 58–65, T1 66–71, T0 72–83): a buff on Critical Strike for the supported
  // skill's Numbed. src/planner.js settles its uptime from the skill's crit hits per second (provisional).
  { family: "critBuff", pattern: new RegExp(`^The supported skill gains a buff on Critical Strike: ${N}% Numbed Effect for ${N}\\s*s$`, "i"), build: (m) => ({ value: num(m[1]), seconds: num(m[2]), kind: "numbedEffect" }) },
  // Periodic Burst (reference data): "Gains a stack of buff when using the supported skill every 6s: +20.5% Attack and Cast Speed after
  // using a Mobility Skill" / "The buff lasts 2s". src/planner.js applies it to every skill at uptime duration ÷ max(6 s,
  // the Mobility skill's cooldown) (provisional).
  { family: "periodicBuff", pattern: new RegExp(`^Gains a stack of buff when using the supported skill every ${N}\\s*s: ${N}% Attack and Cast Speed after using a Mobility Skill$`, "i"), build: (m) => ({ kind: "speed", everySeconds: num(m[1]), value: num(m[2]) }) },
  { family: "periodicBuff", pattern: new RegExp(`^The buff lasts ${N}\\s*s$`, "i"), build: (m) => ({ kind: "duration", seconds: num(m[1]) }) },
  // All In (reference data, Lv1 20% … Lv20 29.5% … Lv40 35.7%): "When casting the supported skill, gains the buff:" / "X% additional
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
  // Gear affix batch C (2026-10-22): supports gear lines grant ("Main Skill is supported by Lv. N <Support>"), reference data texts.
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
  // Grudge (reference data; leveled Lv1 31 … Lv40 70): Paralysis on a Cursed target when the supported skill deals damage (manual rule
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
  // Deepened Curse (reference data; leveled Lv1 4.05% … Lv21 5.05%): "Enemies take X% additional damage if affected by curses inflicted by
  // the supported skill for at least N s": an enemy debuff on the dummy while the supported curse has been on it for N s
  // (src/planner.js; 2026-10-18, it read No DPS effect before).
  { family: "curseTaken", pattern: new RegExp(`^Enemies take ${N}% additional damage if affected by curses inflicted by the supported skill for at least ${N}\\s*s$`, "i"), build: (m) => ({ value: num(m[1]), delaySeconds: num(m[2]) }) },
  // Kill-driven lines (Feud's "+5% ... for every enemy defeated by the supported skill"): the dummy is never defeated.
  { family: "notOnDummy", pattern: /for every enemy defeated|on kill|when (?:the supported skill )?defeats? an enemy/i, build: () => ({}) },
  // Blind (user decision 2026-10-25): Blind only lowers the enemy's accuracy and the dummy never attacks. Refractions (user decision
  // 2026-10-25): a refracted beam never hits the same enemy, so on the one training dummy extra refractions deal nothing.
  { family: "blind", pattern: /^\+?[\d.]+% chance to Blind the target when the supported skill hits$|^[+-]?[\d.]+% Blinding Duration caused by the supported skill$|^[+-]?[\d.]+% Blind(?:ing)? Effect (?:caused by|for) the supported skill$/i, build: () => ({}) },
  { family: "refractions", pattern: /^[+-]?\d+ additional (?:beam )?refraction(?:s|\(s\))?(?: for (?:the supported|the|this) Beam Skill| for this skill's Combo Starters per [+-]?\d+ Beam\(s\))?$/i, build: () => ({}) },
  { family: "nonDamage", pattern: /Skill Area for the supported skill|Beam Length|Knockback|Evasion|Life will be consumed|Projectile Speed for the supported skill/i, build: () => ({}) }
];

// Clause families that never deal damage to the one dummy (the damage flag of the clause lists).
const NON_DAMAGE_FAMILIES = new Set(["nonDamage", "blind", "refractions"]);

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
  const gameMode = supportDataMode() === "game";
  // Stone entries already bound to a line (two lines can share a template: a star line and a fixed "-40% additional damage").
  const used = new Set();
  const amSelected = isActivationMedium(name) && (Array.isArray(config.lines) || config.tier != null) ? String(progressionSupportText(name, config) || "").split(" | ").map(tidy).filter(Boolean) : [];
  const lines = String(entry?.baseEffect || "").split(/\r?\n/).map(tidy).filter(Boolean);
  for (const line of lines) {
    if (eligibility.test(line)) continue;
    // Summon skills' Magnificent / Noble star line names their Minions ("+20% additional damage for Minions summoned by the
    // supported skill"); the same star rule applies to it.
    const minionStar = special && /^\+?20% additional damage for Minions summoned by the supported skill$/i.test(line);
    if (special && (minionStar || /^\+?20% additional damage for the supported skill$/i.test(line))) {
      const starAffix = gameMode ? supportLineAffix(name, line, { used }) : null;
      if (starAffix?.star) used.add(starAffix.index);
      clauses.push({ text: `+${starValue}% additional damage for ${minionStar ? "Minions summoned by " : ""}the supported skill`, baseText: line, origin: "star", stars, ...(starAffix?.star ? { game: { id: starAffix.id, source: "config_skill_stone star line" } } : {}) });
      starDone = true;
      continue;
    }
    if (isActivationMedium(name) && (Array.isArray(config.lines) || config.tier != null)) {
      // Activation Medium base lines repeat a tier line; the selected lines below hold the rolls. A base line no selected
      // line covers (reference data's T0 rows omit Rhythm / Instruction's trigger interval) keeps its base range at the best-case
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
    // Critical Strike Rating Increase past the Lv.40 table: the linear reference data rule (criticalStrikeRatingIncreasePercent).
    const effectiveLevel = Math.max(1, Math.round(support.effectiveLevel || support.level || 20));
    if (name === "Critical Strike Rating Increase" && column && effectiveLevel > 40) { const value = criticalStrikeRatingIncreasePercent(effectiveLevel); clauses.push({ text: substitute(line, [value]), baseText: line, origin: "leveled", level: effectiveLevel, values: [value] }); continue; }
    const refdata = values ? { text: substitute(line, values, columnNumberIndexes(column)), baseText: line, origin: "leveled", level, values } : { text: line, baseText: line, origin: "fixed" };
    // The stone's level map at the uncapped effective level (gameLevelValue holds its last point, e.g. Ground Divide's 85.5 from
    // Lv41): reference data's table stops at Lv40, the game's curve does not (Frost Terra v2 panel 115.5 Terra Charge Restoration, 2026-10-27).
    const game = gameMode ? supportGameLine(name, line, { level: effectiveLevel, stars: stars ?? 1, used }) : null;
    if (game) {
      used.add(game.index);
      const differs = JSON.stringify(lineNumbersOf(game.text)) !== JSON.stringify(lineNumbersOf(refdata.text));
      clauses.push({ text: game.text, baseText: line, origin: game.star ? "star" : game.leveled ? "leveled" : "fixed", ...(game.star ? { stars } : game.leveled ? { level: game.level } : {}), values: game.values, game: { id: game.id, source: game.star ? "config_skill_stone star line" : "config_skill_stone" }, ...(differs ? { refdataText: refdata.text } : {}) });
      continue;
    }
    clauses.push(refdata);
  }
  // A star bonus without a base line (direct callers, or a support missing from the progression data).
  if (!starDone && starValue) clauses.push({ text: `+${starValue}% additional damage for the supported skill`, baseText: "star bonus", origin: "star", stars });
  // Scorching Beam specials keep their own tier tables (one roll); the others use the reference data progression tiers.
  const beamTiers = specialSupportTierData(name);
  if (beamTiers) {
    const roll = Number(config.roll ?? config.rolls?.[0]);
    // A saved roll without a tier (older saves) falls in the tier whose range holds it.
    const tier = beamTiers.find((item) => item.tier === config.tier) || beamTiers.find((item) => roll >= item.min && roll <= item.max) || null;
    if (Number.isFinite(roll) && tier) clauses.push({ text: `+${roll}% ${tier.effect}`, baseText: `T${tier.tier} affix`, origin: "roll", tier: tier.tier });
  } else if (progressionSupportTierData(name) && config && (config.tier != null || Array.isArray(config.lines))) {
    const text = progressionSupportText(name, config);
    for (const part of String(text || "").split(" | ").map(tidy).filter(Boolean)) {
      // One reference data row can join two sentences ("... skill +5% additional damage taken ..."): split on a following "+N%".
      const pieces = isActivationMedium(name) ? [part] : part.split(/(?<=supported skill)\s+(?=[+-]\d+(?:\.\d+)?%\s)/).map(tidy).filter(Boolean);
      for (const piece of pieces) clauses.push({ text: piece, baseText: part, origin: isActivationMedium(name) ? "activation" : "roll", tier: config.tier });
    }
  }
  return clauses;
}

// Per-engine status of one classified clause (chunk 1 consumers).
// Aura supports src/aura-effects.js auraSupportEffects reads by name (its switch: the leveled Aura Effect column); any other
// support's plain "X% (additional) Aura Effect (for the supported skill)" line is read by its default branch.
const AURA_EFFECT_NAMED_SUPPORTS = new Set(["Aura Amplification", "Precise: Selfless", "Precise: Stand as One", "Precise: Disciplined", "Precise: Concentrated", "Precise: Malleable", "Precise: Selfishness", "Precise: Safety in Numbers"]);
const AURA_EFFECT_PLAIN_LINE = /^([+-]?[\d.]+)% (additional )?Aura Effect(?: for the supported skill)?\.?$/i;
function auraModelReadsClause(supportName, text = "") {
  if (!/Aura Effect/i.test(text)) return false;
  return AURA_EFFECT_NAMED_SUPPORTS.has(supportName) || AURA_EFFECT_PLAIN_LINE.test(String(text).trim());
}

function periodicBuffStatus(tags, ctx, s) {
  if (!tags.has("Mobility")) return s("Inactive", "Periodic Burst's buff follows a Mobility Skill use; the supported skill is not a Mobility Skill");
  if (ctx.conditions?.mobilitySkillUsed === false) return s("Inactive", "Mobility Skill used recently is switched off");
  return s("Provisional", "+Attack and Cast Speed for every skill at uptime buff duration ÷ max(6 s, the Mobility Skill's cooldown), the Mobility Skill used whenever its cooldown allows (user rule 2026-10-14; src/periodic-burst.js)", ["cast-rate", "skill-hit"]);
}

function clauseStatus(clause, support, ctx) {
  const engine = ctx.engine;
  const name = support.name;
  const beam = engine === "scorching-beam";
  const dedicated = beam && SCORCHING_BEAM_DEDICATED_SUPPORTS.has(name);
  const attack = ctx.speedType === "attack-speed";
  const types = ctx.dealtTypes || [];
  const tags = ctx.tags || new Set();
  const s = (status, reason, consumers = []) => ({ status, reason, consumers });
  // Chunk 8: the families with a reader of their own (src/support-chunk8.js).
  if (clause.chunk8Own) return chunk8OwnStatus(clause, ctx);
  // Census item #2 build-wide buffs and Thrive in Adversity's Empower Effect: read whatever engine the supported skill has.
  if (clause.census && (clause.family === "censusBuff" || clause.family === "empower")) return censusStatus(clause, ctx);
  // Empower skills whose buff the planner models without a damage engine of their own (src/empower-effects.js: Bull's Rage's
  // Euphoria, 2026-10-14): their trigger, cooldown, duration and Empower Effect clauses set the buff's value and uptime.
  if (!engine && EMPOWER_BUFF_SKILLS.has(ctx.skillName)) {
    const buff = EMPOWER_BUFF_SKILLS.get(ctx.skillName);
    if (clause.family === "empower") return s("Provisional", `Empower Effect of ${buff} (src/empower-effects.js)${clause.kind === "perCast" ? `; ${clause.cap} stacks with own buffs built before engaging, 1 on a cold start` : ""}`, ["empower"]);
    if (clause.family === "trigger" && clause.kind === "maxMultistrike") return s("Provisional", `triggered at the build's Max Multistrike Count events, at most once per ${clause.interval} s, capped by the skill's cooldown: uses per second = 1 / max(trigger interval, effective cooldown) (rule user-confirmed 2026-10-12 for Activation Medium: Boss); sets the uptime of ${buff}`, ["empower"]);
    if (clause.family === "cooldown") return s("Provisional", `shortens the cooldown that caps the use rate, and so raises the uptime of ${buff}`, ["empower"]);
    if (clause.family === "duration") return s("Provisional", `lengthens ${buff}, raising its uptime`, ["empower"]);
  }
  // The Warcries' own buffs (census #7, src/empower-buffs.js warcryBuffEntry): their cooldown and duration clauses set the buff's
  // uptime the same way (batch 7, 2026-10-28: Concentration Warcry's Cooldown Recovery Speed moved the Fearless Warcry buff while
  // the clause read Not modeled).
  if (!engine && WARCRY_BUFF_NAMES.includes(ctx.skillName) && (tags.has("Warcry") || !tags.size)) {
    if (clause.family === "cooldown") return s("Provisional", `shortens the Warcry's cooldown, raising the uptime of ${ctx.skillName}'s buff (src/empower-buffs.js warcryBuffEntry; cast on cooldown, best case)`, ["empower"]);
    if (clause.family === "duration") return s("Provisional", `lengthens ${ctx.skillName}'s buff, raising its uptime (src/empower-buffs.js warcryBuffEntry)`, ["empower"]);
  }
  // A curse support's enemy debuff (Deepened Curse): the planner adds it while the supported curse is on the dummy (src/planner.js).
  if (clause.family === "curseTaken") return !tags.size || tags.has("Curse") ? s("Provisional", `+${clause.value}% additional damage taken by the dummy once the supported curse has been on it for ${clause.delaySeconds} s (skill hits; the 5 s / 20 s windows start it at ${clause.delaySeconds} s)`, ["planner"]) : s("Inactive", "the supported skill is not a Curse");
  // Sealed Mana Compensation on an Aura (Restrain, Precise Restrain, Seal Conversion; gear affix batch C): the Aura reservation reads
  // it (src/aura-effects.js auraSupportSealedManaCompensation, src/engine.js), whatever the damage engine.
  if (clause.family === "sealedManaCompensation") return tags.has("Aura") || ctx.role === "aura" ? s("In calc", "the Aura's Sealed Mana: Σ local compensation and Π additional compensation (src/aura-effects.js auraSupportSealedManaCompensation; the progression table at the support's level)", ["aura"]) : s("No DPS effect", "the supported skill reserves no Mana");
  // Aura Effect on an Aura (Aura Amplification, Precise: Stand as One, …): the Aura model reads it (src/aura-effects.js
  // auraSupportEffects), whatever the damage engine (badge fix 2026-10-27, research/youga-combat-effects-2026-10-27.md).
  if ((tags.has("Aura") || ctx.role === "aura") && auraModelReadsClause(name, clause.text)) return s("In calc", AURA_EFFECT_NAMED_SUPPORTS.has(name) ? `the Aura's Aura Effect at the support's level (src/aura-effects.js auraSupportEffects${name === "Precise: Stand as One" ? ": × min(5, Auras affecting you)" : ""})` : "the Aura's Aura Effect (src/aura-effects.js auraSupportEffects)", ["aura"]);
  // Periodic Burst on a Mobility Skill: src/periodic-burst.js reads it from the setup's clauses, whatever the damage engine
  // (badge fix 2026-10-27; the Mobility skill usually has no damage engine of its own).
  if (clause.family === "periodicBuff") return periodicBuffStatus(tags, ctx, s);
  // Activation Medium event clauses (census items #8 / #12): event sources apply whatever the supported skill's engine.
  if (clause.amEvent) return amEventStatus(clause, ctx);
  // Census batch 5 (B3): hit-count and cadence changes on the supported skill's hit profile (src/support-hit-count-batch5.js).
  if (clause.batch5 && clause.family === "hitCount") return batch5Status(clause, ctx);
  // Census batch 6: Minion, Spirit Magus, module and Sentry clauses (src/minion-sentry-batch6.js).
  if (clause.batch6) return batch6Status(clause, ctx);
  if (!["scorching-beam", "skill-hit", "skill-dot", "minion"].includes(engine)) return s("Not modeled", "the setup's own damage has no engine that reads support clauses");
  // Residual (C) wordings with no dummy-damage effect (src/line-families.js; residual batch 2026-10-12 §6).
  const residual = residualNonDamageStatus(clause.text);
  if (residual) return s(residual.status, residual.reason);
  if (engine === "minion" && clause.family !== "minion") {
    // 2026-10-28: a support on a summon reaches its Minion skills (src/summon-support-minion.js; eligibility user-confirmed, the
    // calculation reading provisional). A context with no Minion rows (the coverage census engine) keeps the earlier statuses.
    const reading = summonMinionRows(ctx).length ? summonSupportReading(clause, ctx) : null;
    if (reading) return s(reading.status, reading.reason, reading.consumers);
    if (["additional", "increased", "critOnlyAdditional", "dotAdditional", "perStack", "allElementalAdditional", "movementCharges"].includes(clause.family)) return s("No DPS effect", "Minions take only lines that name Minions (manual rule 1001011821)");
    return s("Not modeled", "minion engine reads no support clause yet (chunk 3)");
  }
  if (clause.census) return censusStatus(clause, ctx);
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
    case "mainStatRatio": {
      if (engine !== "skill-hit") return s("Not modeled", "read on skill hits only (the main-stat bonus of the hit model)");
      if (tags.size && !["Strength", "Dexterity", "Intelligence"].some((stat) => tags.has(stat))) return s("Inactive", "the supported skill has no main stat");
      return s("In calc", "the skill's main-stat damage bonus (0.5% per point) × (1 + the ratio), on every main stat the skill has (game recipe 651717)", ["skill-hit"]);
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
      if (clause.fervor) return s("Provisional", clause.conditionText || "Fervor held (provisional)", [beam ? "scorching-beam crit" : "skill-hit crit"]);
      return s("In calc", beam ? "beam hit crit branch only (never Ignite)" : "crit share of the skill's hits", [beam ? "scorching-beam crit" : "skill-hit crit"]);
    case "perStack":
      if (clause.stackSource === "focusBlessing") {
        if (engine === "minion") break;
        return clause.stacks == null ? s("Provisional", "no Focus Blessing stack count available: 0 stacks assumed", [engine]) : clause.stacks > 0 ? s("In calc", `× ${clause.stacks} Focus Blessing stacks (blessing model)`, [engine]) : s("Inactive", "the build gains no Focus Blessing stacks");
      }
      if (clause.stackSource === "castRecently") return engine === "skill-hit" ? s("In calc", "× min(cap, the skill's casts in the last 4 s) at its use rate (game recipe 277886048; Tangle-fired casts counted: provisional)", [engine]) : s("Not modeled", "read on the generic skill-hit path only");
      if (clause.stackSource === "remainingForks") return engine === "skill-hit" ? (ctx.forks > 0 ? s("In calc", `× ${ctx.forks} forks remaining at the first hit (the only hit on one dummy; provisional)`, [engine]) : s("Inactive", "the supported skill does not fork")) : s("Not modeled", "read on the generic skill-hit path only");
      if (clause.stackSource === "channel") return beam ? s("In calc", "per channeled stack at full channel (src/build-mechanics.js)", ["scorching-beam"]) : s("Not modeled", "per-channeled-stack roll is read on the Scorching Beam path only");
      if (beam && dedicated) return s("In calc", "dedicated Ignite model", ["ignite"]);
      return s("Not modeled", "Ignite stack scaling is modeled for Scorching Beam only");
    case "dotAdditional":
      if (engine === "skill-dot") return s("In calc", "the skill's damage over time", ["skill-dot"]);
      if (beam) return s("In calc", "Scorching Beam's Ignite (and its other ailments); provisional (Q10)", ["ignite"]);
      return s("In calc", "the skill's own ailments (src/ailment-applications.js); provisional", ["ailment-applications"]);
    case "ailmentAdditional":
      if (clause.ailment === "deterioration") return s("Not modeled", "Deterioration (reference data: a debuff settled as True Damage) has no model");
      if (engine === "skill-dot") return s("No DPS effect", "the skill's own damage over time is not an ailment");
      if (beam && dedicated) return s("In calc", "dedicated Ignite model", ["ignite"]);
      if (beam) return ["ailment", "ignite"].includes(clause.ailment) ? s("In calc", "Scorching Beam's Ignite", ["ignite"]) : s("Not modeled", `the Scorching Beam path cannot scope a ${clause.ailment} line to its own ${clause.ailment} yet`);
      return s("In calc", "the skill's own ailments (src/ailment-applications.js)", ["ailment-applications"]);
    case "added":
      if (engine === "skill-dot") return s("No DPS effect", "added damage does not affect damage over time (manual: Damage Over Time)");
      // Batch 7 damage fixes 2026-10-28 (src/scorching-beam-added-damage.js): every type at the stone's value; Fire joins the beam's packets,
      // another type is its own hit part (its own ledger, conversions and resistance); never Ignite's base.
      if (beam) return s("In calc", clause.type && clause.type !== "Fire" ? `Scorching Beam: its own ${clause.type} hit part on the beam and explosion packets (× 41% effectiveness, the ${clause.type} ledger and resistance); never Ignite's base` : "Scorching Beam added Fire model (both packets × 41% effectiveness; never Ignite's base)", ["scorching-beam"]);
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
      // Census batch 5 (B3): a storm whose strike count follows its Duration (Lightning Storm: one strike per 0.5 s while it lasts).
      if (engine === "skill-hit" && BATCH5_DURATION_SKILLS.has(ctx.skillName)) return s("Provisional", `${ctx.skillName}'s strikes per cast follow its duration (one per ${BATCH5_DURATION_SKILLS.get(ctx.skillName).interval} s for ${BATCH5_DURATION_SKILLS.get(ctx.skillName).duration} s × (1 + Σ increased) × Π(1 + additional)); storms overlap, so each cast adds them (src/support-hit-count-batch5.js; provisional)`, ["skill-hit"]);
      // Census batch 6: Arrow Einherjar's Sentry duration sets how long its 5 buff stacks are held (src/minion-sentry-batch6.js).
      if (engine === "skill-hit" && BATCH6_DURATION_SKILLS.has(ctx.skillName)) return s("Provisional", `${ctx.skillName}'s Sentry lasts 8 s × (1 + Σ increased) × Π(1 + additional) Duration: its buff stacks (+8% additional Sentry Damage per stack, one per 1 s up to 5) are averaged over that life (src/minion-sentry-batch6.js; provisional)`, ["skill-hit"]);
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
      return periodicBuffStatus(tags, ctx, s);
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
      // Fire Explosion (condition-unread batch 3): +N Affliction Per Second while the supported skill deals damage (src/planner.js adds it
      // to the build's Affliction per second, which every DoT path reads).
      if (clause.kind === "recentDamage") return s("In calc", `+${clause.value} Affliction per second while the supported skill deals damage to the dummy (game recipe ${clause.recipe}: a 4 s buff renewed by its damage; joins the build's Affliction per second)`, ["affliction"]);
      // A hit skill with its own DoT component (Flame Jet; src/planner.js skillHitDotSources) reads it on that DoT (src/skill-dot-model.js;
      // badge movement probe 2026-10-27: an item-granted Cataclysm moved Flame Jet while it read Not modeled).
      if (engine === "skill-hit" && ctx.hitDot) return s("In calc", "Affliction on the skill's own damage over time", ["skill-dot"]);
      // A hit skill's ailments are its damage over time (game recipes 599597 / 943784: the supported skill's DoT damage process;
      // src/cataclysm-hit-ailments.js): the planner passes the ailments it inflicts.
      if (engine === "skill-hit" && ctx.hitAilment?.length) return s("In calc", `Affliction from the skill's ${ctx.hitAilment.map((key) => key[0].toUpperCase() + key.slice(1)).join(" / ")} (8 per 1 s while the ailment ticks; the ailment read as always up)`, ["ailment-applications"]);
      if (engine === "skill-hit" && ctx.hitAilment) return s("Inactive", "the skill inflicts no damaging ailment (Ignite, Trauma, Wilt) and has no damage over time of its own");
      return engine === "skill-dot" || (beam && dedicated) ? s("In calc", "Affliction", [engine]) : s("Not modeled", "Cataclysm is read for skill DoTs, Scorching Beam and a hit skill's damaging ailments only");
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
          return s("Provisional", `triggered every ${clause.interval} s, capped by the skill's cooldown (no use time; manual "Trigger"); rate = 1 / max(interval, effective cooldown) (user-confirmed 2026-10-12, Q2: Frost Shield + Boss every 6 s, its cooldown)${ctx.terra ? "; Terra-duration cap provisional" : ""}${ctx.combo ? "; a Combo skill plays the next step of its cycle (Starter, Starter, Finisher) per trigger (provisional, am-trigger-combo-step)" : ""}; first use at the first trigger provisional`, ["skill-hit"]);
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
      // Census batch 5 (B3): a support that gives the skill Shotgun Effect or extra projectiles per Projectile Quantity (Split Shot:
      // Volley, Sparkle: Magnetic Field, Corrosion Focus: Splash) or fixes it at 1 (src/support-hit-count-batch5.js).
      { const volley = batch5ProjectileVolleyStatus(ctx.skillName, ctx.setupSupportNames); if (volley) return s(volley.status, volley.reason, ["skill-hit"]); }
      // A skill's own projectile rule (src/skill-hit-profiles.js projectileVolley / additionalPerProjectileQuantityPercent).
      if (ctx.profile?.projectileVolley) return s("In calc", ctx.profile.projectileVolley.status, ["skill-hit"]);
      if (ctx.profile?.additionalPerProjectileQuantityPercent) return s("In calc", `+${ctx.profile.additionalPerProjectileQuantityPercent}% additional damage for every +1 Projectile Quantity of the skill (skill text); the extra projectiles themselves need other enemies`, ["skill-hit"]);
      return ctx.shotgun ? s("Provisional", `the skill text says its projectiles can hit the same enemy: the volley is a fan, of which ceil(n / 2) reach the dummy standing close (Chromatic Shot runs 2026-10-12; one at range), each after the first at ×${ctx.shotgun} (linear Shotgun falloff; coefficient from the skill text, else 70%)`, ["skill-hit"]) : s("No DPS effect", "the skill text does not say its projectiles can hit the same enemy, so one reaches the dummy (Ice Lances run 2026-10-12: Multiple Projectiles moved only by its additional damage)");
    case "multistrike":
      if (engine !== "skill-hit" || !ctx.speedType) return s("Not modeled", "Multistrike is read for skill hits only");
      if (ctx.speedType !== "attack-speed") return s("Inactive", "Multistrike needs an Attack Skill (reference data glossary)");
      if (ctx.channeled || ctx.sentry || tags.has("Mobility")) return s("No DPS effect", "Mobility, Channeled and Sentry skills cannot Multistrike (reference data glossary)");
      if (clause.kind === "flurry") return s("Provisional", `the repeat attacks are capped at ${clause.value} and each takes the Max Multistrike Count's increment and "+X% on reaching the Max Multistrike Count" bonus, and counts as a Max Multistrike Count event (game affix 711264384; src/skill-hit-model.js multistrikeSequence; provisional)`, ["skill-hit"]);
      if (clause.kind === "repeatSpeed") return s("Provisional", `+${clause.value}% additional Attack Speed on the repeat attacks of a Multistrike sequence (game affix 491653184, gated on the Multistriking state; src/skill-hit-model.js multistrikeSequence; provisional: the first attack keeps its own speed)`, ["skill-hit"]);
      return s("Provisional", "expected Multistrikes per attack (reference data glossary: one extra attack per 100% chance, +20% Attack Speed during them); increasing damage per Multistrike count (provisional reading)", ["skill-hit"]);
    case "steepStrike":
      // src/skill-hit-model.js steepStrikeState (2026-10-14): own + supports + build-wide lines per Slash-Strike skill.
      if (!tags.has("Slash-Strike") && !ctx.profile?.steepStrike) return s("Inactive", "the supported skill is not a Slash-Strike skill (only Slash-Strike skills have a Steep Strike form)");
      if (engine !== "skill-hit") return s("Not modeled", "Steep Strike chance is read for skill hits only");
      // Blade Cluster (user-supplied answer 2026-10-15, replaces the 2026-10-14 "+2 max stored attempts" reading): each launched
      // Steep Strike → 1 + N Steep Strike hits on the same target.
      // Keen Edge (game affix 62898652, field 2600141): fewer Multistrikes per stored Steep Strike attempt (steepAttemptShare perRepeats).
      if (clause.kind === "attemptRepeats") return ctx.profile?.steepStrike?.multistrikeAttempts ? s("Provisional", `${clause.value} to the repeat attacks per stored Steep Strike attempt: 1 attempt per ${Math.max(1, (ctx.profile.steepStrike.multistrikeAttempts.perRepeats || 2) + clause.value)} Multistrikes (src/skill-hit-model.js steepAttemptShare; the attempt mechanism is a user-supplied reading, provisional)`, ["skill-hit"]) : s("Inactive", "the supported skill stores no Steep Strike attempts from Multistrikes");
      if (clause.kind === "extraAttempts") return s("In calc",`user-supplied answer (2026-10-15, provisional): each launched Steep Strike generates ${clause.attempts} additional Steep Strikes on the same target, so the Steep Strike component deals × ${1 + clause.attempts} its hits per launch; the extra hits take "+X% additional Steep Strike Damage" and the skill's crit, spend no attempt, add no Multistrike, and count in the skill's hits/s (src/skill-hit-model.js steepStrikeState)`, ["skill-hit"]);
      // Big Stride (user-supplied reading 2026-10-14; held window confirmed by a user-supplied answer 2026-10-15): every attack
      // in the window is a Steep Strike; window open while moving.
      if (clause.kind === "guaranteedAfterMoving") {
        if (ctx.conditions?.movedRecently === false) return s("Inactive", `Moved recently is switched off, so the ${clause.seconds} s window after moving ${clause.meters} m is never open`);
        return s("Provisional", `user-supplied reading (2026-10-14): every attack in the ${clause.seconds} s window after moving ${clause.meters} m is a Steep Strike; the window is held open while Moved recently is on (always moving: best case), so every use is a Steep Strike replacing the Sweep Slash (src/skill-hit-model.js steepStrikeState)`, ["skill-hit"]);
      }
      if (ctx.profile?.steepStrike?.fromChance === false) return ctx.profile.steepStrike.multistrikeIncrementPerChancePercent ? s("In calc", `the skill cannot obtain Steep Strikes from Steep Strike chance; its Multistrikes gain ${ctx.profile.steepStrike.multistrikeIncrementPerChancePercent}% additional damage increment per +1% Steep Strike chance (skill text; provisional)`, ["skill-hit"]) : s("No DPS effect", "the skill cannot obtain Steep Strikes from Steep Strike chance");
      return s("In calc", "summed with the skill's own Steep Strike chance and the build's lines; that share of attacks are Steep Strikes replacing the Sweep Slash (observed: Whirlwind Lv16 run 2026-10-12)", ["skill-hit"]);
    case "spellBurst":
      if (engine !== "skill-hit") return s("Not modeled", "Spell Burst is read for skill hits only");
      // "The supported skill can activate Spell Burst" (Psychic Burst, Raging Storm, Wax and Wane; condition-unread batch 3) lifts the
      // skill's own block (cooldown, Channel, Sentry, Summon, rate model); a non-Spell skill still cannot (provisional, spell-burst-can-activate).
      if (!tags.has("Spell") || (!clause.canActivate && !ctx.spellBurstCanActivate && (tags.has("Summon") || ctx.channeled || ctx.sentry || ctx.rateModel || ctx.cooldown))) return s("Inactive", "the skill cannot activate Spell Burst (game manual: Spell Skills only; skills with a cooldown, Summon, Sentry, Channel and Triggered Skills and skills cast by Spell Burst cannot)");
      if (ctx.conditions && !(ctx.conditions.maxSpellBurst >= 1)) return s("Inactive", "the build has no Max Spell Burst (game manual: Spell Burst needs Max Spell Burst of at least 1)");
      if (clause.kind === "chargeIncreased" || clause.kind === "chargeAdditional") return s("In calc", "Spell Burst full charge time 2 s ÷ (1 + Σ Charge Speed) ÷ Π(1 + additional Charge Speed) (game manual)", ["skill-hit"]);
      return s("In calc", "Spell Burst casts: the activating cast and one automatic cast per stack consumed are cast by Spell Burst (game manual); automatic casts take no manual cast time and the activation period is not rounded (user-confirmed 2026-10-12)", ["skill-hit"]);
    case "shadow":
      if (!tags.has("Shadow Strike")) return s("Inactive", "the supported skill is not a Shadow Strike skill (only Shadow Strike skills summon Shadows: game manual 1001010820)");
      if (engine !== "skill-hit") return s("Not modeled", "Shadows are read for skill hits only");
      return s("Provisional", "each Shadow repeats the skill's attack on the dummy; on one target each Shadow after the first takes the 70% Shotgun falloff (game manual 1001010820 / 1001010821; reference data Phantom), as the Shadows' own hits (src/skill-hit-model.js shadowState; provisional)", ["skill-hit"]);
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
      return s("Not on dummy", clause.reason || "needs an enemy to be defeated; the dummy never dies");
    case "blind":
      return s("No DPS effect", "Blind only lowers enemy accuracy; the dummy never attacks");
    case "refractions":
      return s("Not on dummy", "refractions don't hit the same enemy");
    case "nonDamage":
      return s("No DPS effect", clause.reason ? `${clause.reason}: no effect on damage to one dummy` : "no effect on damage to one dummy");
    // Precise: Safety in Numbers on a non-Aura skill (on an Aura the Aura model reads it, checked above).
    case "auraSupport":
      return s("Inactive", "supports Auras only (src/aura-effects.js reads it on an Aura)");
    default:
      break;
  }
  return s("Not modeled", "no rule reads this clause");
}

// Conditional clauses resolve through the shared line-condition resolver (src/line-conditions.js, talent batch chunk 2):
// the same keys, readings and texts as before; talent, gear, slate and core lines use the same resolver.
// Without a state (direct engine calls) the condition is unresolved: nothing is applied and the clause reads Provisional.
// Ice Focus: Frigid Wind (game recipe 400677504; batch 1 2026-10-27, provisional, open question support-frigid-wind-ramp): +0.16%
// additional damage per 0.033 s tick of Ice Storm (4.8% per second), up to cap × 30 ticks. Ice Focus's storm is gain-bound and
// continuous once up (src/skill-hit-profiles.js focus-storm: 75 Pts/s gained, one 45-Pt consumption per 0.6 s), so one storm spans the
// sustained 20 s run; the ramp restarts with it (it is not an own buff held before engaging). Time average of min(cap, t) over D = 20 s:
// cap × (1 − cap ÷ (2D)) seconds' worth.
const FRIGID_WIND = Object.freeze({ perTickPercent: 0.16, ticksPerSecond: 30, stormSeconds: 20 });
function resolveIceStormRamp(clause) {
  const cap = Math.max(0, Number(clause.cap) || 0), D = FRIGID_WIND.stormSeconds;
  const perSecond = FRIGID_WIND.perTickPercent * FRIGID_WIND.ticksPerSecond;
  const averageSeconds = cap <= D ? cap * (1 - cap / (2 * D)) : D / 2;
  const appliedValue = round(perSecond * averageSeconds);
  return { active: true, appliedValue, provisional: true, conditionText: `Ice Storm ramp (game recipe 400677504: +${FRIGID_WIND.perTickPercent}% per ${round(1 / FRIGID_WIND.ticksPerSecond)} s tick = +${round(perSecond)}% per second, up to ${cap} s = +${round(perSecond * cap)}%), time-averaged over one ${D} s storm: +${appliedValue}% (provisional; the storm read as lasting the whole run)` };
}
// Focused Shot: Power Bow (game recipe 145695360): +X% additional damage on Critical Strike × (1 + Fervor Effect). Fervor is read as held
// (best case). Provisional (the l0 local read as the
// Fervor Effect factor).
function resolveFervorCrit(clause, conditions) {
  const effect = Number(conditions?.fervorEffectPercent) || 0;
  const appliedValue = round(clause.value * (1 + effect / 100));
  return { active: true, appliedValue, provisional: true, conditionText: `Fervor read as held (best case)${effect ? `; × (1 + ${round(effect)}% Fervor Effect)` : ""}: +${appliedValue}% additional damage on Critical Strike; the +${clause.knockback}% Knockback Chance has no DPS effect` };
}

function resolveCondition(clause, support, conditions) {
  // Willpower-style "for every stack of buffs while standing still (multiplies)": the stack cap from the support's base text.
  const stackCap = clause.condition === "standingStill" && clause.multiplies
    ? Number(String(supportProgressionSs13[clause.grantedWillpower ? "Willpower" : support.name]?.baseEffect || "").match(/Stacks up to (\d+) time/i)?.[1]) || 1
    : undefined;
  const resolved = resolveLineCondition({ ...clause, key: clause.condition, stackCap }, conditions);
  return { active: resolved.active, appliedValue: resolved.appliedValue ?? 0, conditionText: resolved.conditionText, ...(resolved.provisional ? { provisional: true } : {}) };
}

// ---- Activation Medium event clauses (AM_EVENT_RULES above; src/activation-medium-events.js) ----
// Resolved against the hit pass's event facts (conditions.amEvents; null before the pass measured them). The trigger clause takes its
// siblings' Lock On details; the Instruction bonus its sibling trigger interval and the build's Instructions per second.
function resolveAmEventClause(clause, full, siblings, setupKey) {
  const facts = full.conditions?.amEvents || null;
  if (clause.family === "trigger" && clause.kind === "amEvent") {
    const extra = {};
    if (clause.event === "lockOn") {
      extra.selfLock = siblings.some((text) => /^Always Locks On enemies within/i.test(tidy(text)));
      extra.removesLockOn = siblings.some((text) => /^Removes Lock On when the supported skill deals damage$/i.test(tidy(text)));
    }
    const event = clause.event === "burstFull" ? null : amEventInterval({ ...clause, ...extra }, facts, setupKey);
    return { ...extra, eventRateText: event ? event.text : null, eventIntervalSeconds: event ? event.intervalSeconds : undefined, measured: clause.event === "burstFull" || Boolean(event) };
  }
  if (clause.family === "conditionalAdditional" && clause.condition === "instructions") {
    const trigger = siblingMatch(siblings, /^Triggers the supported skill on the closest enemy within [\d.]+\s*m every ([\d.]+)\s*s$/i);
    const interval = trigger ? Number(trigger[1]) : null;
    if (!interval) return { active: false, appliedValue: 0, conditionText: "this tier has no trigger interval line (the reference data's T0 row omits it), so no use is triggered and no Instruction bonus applies" };
    if (!facts) return { active: null, appliedValue: 0, conditionText: "Instructions per second not measured yet (the planner's hit pass)" };
    const perSecond = Number(facts.instructionsPerSecond) || 0;
    if (!(perSecond > 0)) return { active: false, appliedValue: 0, conditionText: "no Instruction source on the board (Activation Medium: Critical Strike or Channel on a skill that crits or channels)" };
    const raw = clause.perInstruction * perSecond * interval;
    const applied = round(Math.min(clause.cap, raw));
    return { active: true, appliedValue: applied, conditionText: `${round(perSecond)} Instructions/s (${(facts.instructions || []).map((item) => item.text).join("; ")}) × ${interval} s trigger interval × ${clause.perInstruction}% each = ${round(raw)}%, up to ${clause.cap}% (provisional: every Instruction reaches every Instruction skill)` };
  }
  if (clause.family === "conditionalAdditional" && clause.condition === "rootAttack") return { active: false, appliedValue: 0, conditionText: "the bonus rides Root Attack's auto-use when stopping moving, which the dummy runs do not model" };
  return {};
}
function amEventStatus(clause, ctx) {
  const s = (status, reason, consumers = []) => ({ status, reason, consumers });
  const engine = ctx.engine;
  const facts = ctx.conditions?.amEvents || null;
  const label = AM_EVENT_LABELS[clause.event] || clause.event;
  if (clause.family === "spellBurstConsume") {
    if (engine !== "skill-hit") return s("Not modeled", "read on skill hits only");
    if (ctx.conditions && !(ctx.conditions.maxSpellBurst >= 1)) return s("Inactive", "the build has no Max Spell Burst (game manual: Spell Burst needs Max Spell Burst of at least 1)");
    return s("Provisional", `+${clause.value}% × the consumed stacks (Max Spell Burst) additional Hit Damage on the ${clause.component} hits that find Spell Burst full: a full charge every 2 s ÷ Charge Speed (game manual), consumed by the next event, so min(1, event interval ÷ full charge time) of the events take it (src/skill-hit-model.js; provisional: the skill's own Spell Burst activations and other skills share the stacks)`, ["skill-hit"]);
  }
  if (clause.family === "conditionalAdditional") {
    if (clause.condition === "rootAttack") return s("Not on dummy", clause.conditionText);
    if (engine !== "skill-hit") return s("Not modeled", "the Instruction bonus is read on triggered skill hits only");
    if (clause.active === false) return s("Inactive", clause.conditionText);
    return s("Provisional", clause.conditionText || "Instructions per second not measured yet", ["skill-hit"]);
  }
  if (clause.kind === "sentryPresence") {
    if (!(ctx.tags || new Set()).has("Sentry") && !ctx.sentry) return s("Inactive", "the supported skill is not a Sentry skill");
    if (!["skill-hit", "skill-dot"].includes(engine)) return s("Not modeled", "the supported Sentry skill has no damage engine");
    return s("In calc", `keeps a Sentry deployed: whenever no Sentry is within ${clause.meters} m the skill is triggered (checked every ${clause.interval} s), so the Sentry use model's continuous uptime holds (recast at once, no gap); no use is added beyond the deployed Sentry's hits`, [engine]);
  }
  if (clause.kind === "eventDetail") return s("Provisional", "each Track trigger removes the Lock On, so the next trigger waits for the next Lock On (src/activation-medium-events.js)", ["skill-hit"]);
  if (clause.kind === "eventSource") {
    const listened = facts ? (facts.listeners?.[clause.event] || 0) : null;
    if (clause.event === "lockOn" && clause.source === "always") return s("Provisional", "the dummy is always Locked On, so this skill's Track triggers need no other Lock On source", ["skill-hit"]);
    if (listened === 0) return s("No DPS effect", `no skill on the board is triggered by ${label}`);
    const what = clause.event === "instruction" ? (clause.source === "crit" ? `${clause.perEvent} Instruction(s) per Critical Strike of this skill, at most once per ${clause.interval} s` : `1 Instruction per ${clause.perStacks} channeled stack(s) (one stack per channel use, held at max: provisional)`)
      : clause.event === "resonance" ? "each use of this skill activates Resonance" : "each use of this skill Locks On the dummy";
    return s("Provisional", `${what}: an event source for the build's ${clause.event === "instruction" ? "Activation Medium: Instruction" : clause.event === "resonance" ? "Activation Medium: Resonance" : "Activation Medium: Track"} skills (src/activation-medium-events.js; provisional)`, ["planner"]);
  }
  // kind "amEvent": the supported skill is triggered by the event.
  const notHit = engine !== "skill-hit";
  if (notHit && !(engine === "skill-dot" && !ctx.channeled && clause.event !== "burstFull")) return s("Not modeled", "event triggers are modeled for skill hits and non-channeled skill DoTs only");
  if (!notHit && (ctx.channeled || ctx.rateModel || ctx.combo)) return s("Not modeled", "triggering a channeled, rate-driven or Combo skill is not modeled");
  if (clause.event === "lockOn" && !explicitRadiusHolds(clause.meters, ctx.conditions?.nearTarget)) return s("Inactive", `needs a Locked-On enemy within ${clause.meters} m; the Distant alternative stands ${DISTANT_STANDING_METERS} m away`);
  if (clause.event === "burstFull") {
    if (ctx.conditions && !(ctx.conditions.maxSpellBurst >= 1)) return s("Inactive", "the build has no Max Spell Burst, so Spell Burst is never fully charged");
    return s("Provisional", "triggered at every full Spell Burst charge (2 s ÷ Charge Speed, game manual), then its own Spell Burst: the triggered cast + Max Spell Burst automatic casts, all cast by Spell Burst; uses per second = 1 / max(full charge time, effective cooldown) (rate rule user-confirmed 2026-10-12 for Activation Medium: Boss; no use time; provisional)", [engine]);
  }
  if (clause.eventIntervalSeconds === null) return s("Inactive", clause.eventRateText || `no ${label} on the board`);
  const how = clause.eventRateText ? `${clause.eventRateText}` : `the event rate is measured on the planner's hit pass (${label})`;
  return s("Provisional", `triggered by ${label}: ${how}; uses per second = 1 / max(event interval, trigger interval, effective cooldown) (rate rule user-confirmed 2026-10-12 for Activation Medium: Boss; the event sources are provisional, src/activation-medium-events.js); no use time`, [engine]);
}

// ---- Census item #2 conditions (CENSUS_SUPPORT_RULES above) ----
// The state fields come from src/planner.js supportConditions: hasHasten, hasAggression, blessingStacks, maxMana, blurActive /
// blurRating, frostbiteRating, targetMarked, critHitsBySetup, moving, nearTarget, enemyAilments, maxSpellBurst. Without a state
// (direct engine calls, tooltips) the condition is unresolved: nothing applied, badge Provisional.
const NON_PHYSICAL = ["Fire", "Cold", "Lightning", "Erosion"];
const siblingMatch = (texts, pattern) => { for (const text of texts) { const match = tidy(text).match(pattern); if (match) return match; } return null; };
// Spell Burst eligibility of the supported skill (game manual; the same test as the "spellBurst" family's status).
function spellBurstBlock(full) {
  const tags = full.tags;
  if (full.engine !== "skill-hit") return "Spell Burst is read for skill hits only";
  if (!tags.has("Spell") || tags.has("Summon") || full.channeled || full.sentry || full.rateModel || full.cooldown || full.combo) return "the supported skill cannot activate Spell Burst (game manual: Spell Skills only; skills with a cooldown, Summon, Sentry, Channel, Triggered and Combo skills cannot)";
  if (!(full.conditions?.maxSpellBurst >= 1)) return "the build has no Max Spell Burst (game manual: Spell Burst needs Max Spell Burst of at least 1)";
  return null;
}
function resolveCensusCondition(clause, full, siblings, setupKey) {
  // Skill-mechanics census batch 4 (B2): settled in src/support-conditional-batch4.js.
  if (clause.batch4) return resolveBatch4Condition(clause, full, siblings, setupKey);
  if (clause.chunk8) return resolveChunk8Condition(clause, full, siblings, setupKey);
  const state = full.conditions;
  const r = (value) => round(value);
  if (!state) return { active: null, appliedValue: 0, conditionText: "condition not resolved (no planner state)" };
  const hits = full.engine === "skill-hit" || full.engine === "scorching-beam";
  const types = full.engine === "skill-dot" && !full.dealtTypes.length ? [full.damageType].filter(Boolean) : full.dealtTypes;
  const on = (conditionText, extra = {}) => ({ active: true, conditionText, ...extra });
  const off = (conditionText) => ({ active: false, appliedValue: 0, conditionText });
  switch (clause.condition) {
    case "hasten": return state.hasHasten ? on("Hasten held (src/combat-states.js)", { appliedValue: clause.value }) : off("no Hasten source");
    case "agilityBlessingStacks": {
      const stacks = Number(state.blessingStacks?.Agility) || 0;
      const counted = Math.min(clause.cap ?? Infinity, stacks);
      return counted > 0 ? on(`${r(stacks)} Agility Blessing stacks (Blessing model), counted up to ${clause.cap}: ${clause.value}% × ${r(counted)}, one term (game recipe ${clause.recipe})`, { appliedValue: r(clause.value * counted) }) : off("no Agility Blessing stacks (Blessing model)");
    }
    case "perMaxMana": {
      const mana = Math.max(0, Number(state.maxMana) || 0);
      const steps = Math.floor(mana / clause.every);
      const applied = Math.min(clause.cap, clause.value * steps);
      return steps > 0 ? on(`${r(mana)} Max Mana (stat sheet) ÷ ${clause.every} = ${steps} × ${clause.value}% = +${r(applied)}% (up to +${clause.cap}%; whole steps)`, { appliedValue: r(applied) }) : off(`${r(mana)} Max Mana, under ${clause.every}`);
    }
    case "markedByOwnHits":
      if (!hits) return off("the supported skill deals no hits, so it inflicts no Enhanced Mark");
      return state.targetMarked === false ? off("Dummy always Marked is switched off") : on("the supported skill's hits keep the dummy Marked (its Enhanced Mark; best case, the 'Dummy always Marked' switch)", { appliedValue: clause.value });
    case "aggressionPerEnemy": {
      if (!state.hasAggression) return off("no Attack or Spell Aggression source (src/combat-states.js)");
      if (!explicitRadiusHolds(clause.meters, state.nearTarget)) return off(`the dummy is outside ${clause.meters} m`);
      const applied = Math.min(clause.cap, clause.value);
      return on(`Aggression held; 1 enemy (the training dummy) within ${clause.meters} m: ${clause.value}% × 1 (up to +${clause.cap}%)`, { appliedValue: r(applied) });
    }
    case "perBlurRating": {
      const rating = state.blurActive ? Math.max(0, Number(state.blurRating) || 0) : 0;
      const steps = Math.floor(rating / clause.every);
      return steps > 0 ? on(`Blur held at Rating ${r(rating)} (src/blur-effects.js; Phantom Trace grants it while the skill deals Damage Over Time): ${steps} × ${clause.value}%`, { appliedValue: r(clause.value * steps) }) : off(state.blurActive ? `Blur Rating ${r(rating)} under ${clause.every}` : "Blur is not active (no Blur source, or the Blur condition is off)");
    }
    case "critBuffUptime": {
      if (full.engine !== "skill-hit") return off(full.engine === "scorching-beam" ? "read on skill hits only" : "the supported skill deals no hits, so it never crits");
      if (!types.includes("Lightning")) return off("the supported skill deals no Lightning Damage");
      const seconds = Number(siblingMatch(siblings, /The buff lasts ([\d.]+)\s*s/i)?.[1]) || 2;
      const facts = state.critHitsBySetup?.get?.(setupKey) || null;
      const rate = facts && Number.isFinite(facts.critHitsPerSecond) ? facts.critHitsPerSecond : null;
      const uptime = rate == null ? 1 : Math.min(1, rate * seconds);
      const value = r(clause.value * uptime);
      return value > 0 ? on(rate == null ? `buff held (crit hit rate not measured yet; ${seconds} s on Critical Strike)` : `${r(rate)} crit hits/s × ${seconds} s → uptime ${r(uptime)} (min 1; as Tremble's buff): +${clause.value}% × ${r(uptime)}`, { appliedValue: 0, typedParts: [{ typed: "Lightning", value }], provisional: true }) : off("the supported skill lands no Critical Strikes");
    }
    case "moving": return state.moving !== false ? on(`moving (movement group: best by damage): moving for more than ${clause.seconds} s holds the bonus`, { appliedValue: clause.value }) : off("standing still (movement group): the bonus is lost after 1 s; the −25% lasts 3 s after stopping, so a sustained stand-still carries neither (provisional)");
    case "standingStill": return state.moving === false ? on("standing still (movement group: best by damage): every use is the next use after standing still (provisional)", { appliedValue: clause.value, provisional: true }) : off("moving (movement group): no use follows standing still; flip to Standing still in the condition settings");
    case "nonPhysicalTypesPhysical": {
      const dealt = NON_PHYSICAL.filter((type) => types.includes(type));
      if (!dealt.length) return off("the supported skill deals no Non-Physical Damage");
      if (!types.includes("Physical")) return off(`the supported skill deals no Physical Damage (${dealt.join(", ")} only)`);
      return on(`${dealt.length} Non-Physical type${dealt.length === 1 ? "" : "s"} dealt by the supported skill (${dealt.join(", ")}; "recently" held while it is used): ${clause.value}% × ${dealt.length}, one term (recipe ${clause.recipe})`, { appliedValue: 0, typedParts: [{ typed: "Physical", value: r(clause.value * dealt.length) }] });
    }
    case "nonPhysicalTypesOwn": {
      const dealt = NON_PHYSICAL.filter((type) => types.includes(type));
      return dealt.length ? on(`${clause.value}% additional ${dealt.join(", ")} Damage, each type the supported skill deals (recipe ${clause.recipe})`, { appliedValue: 0, typedParts: dealt.map((typed) => ({ typed, value: clause.value })) }) : off("the supported skill deals no Non-Physical Damage");
    }
    // Vigor Restitution (census #4 leftover, 2026-10-27): stacks = % of Max Life consumed in the last 4 s ÷ 15, capped (src/resource-
    // consumption.js consumedStacks; the 4 s timed stacks are game recipe 309503808), one multiplying term per stack.
    case "lifeConsumed": {
      const held = consumedStacks(state, { resource: "Life", every: clause.every, percentOfMax: true, capStacks: clause.cap });
      if (!held) return off(`Max Life consumed recently: ${state.resourceConsumption?.reason || "no Life-consumption model in this context (the planner's hit pass measures it)"}`);
      const perSecond = Number(state.resourceConsumption?.lifePerSecond) || 0;
      const working = `${r(held.amount)}% of Max Life consumed in the last 4 s (${r(perSecond)} Life/s from the build's player-cast Life costs: provisional, resource-consumption-rate) ÷ ${clause.every} = ${held.raw}${held.raw > clause.cap ? `, capped at ${clause.cap}` : ""} stacks`;
      if (!(held.stacks > 0)) return off(`no Max Life consumed: ${working}`);
      const applied = ((1 + clause.value / 100) ** held.stacks - 1) * 100;
      return on(`${working}; (1 + ${clause.value}%)^${r(held.stacks)} (multiplies; game recipe ${clause.recipe}) = +${r(applied)}%`, { appliedValue: r(applied), provisional: true });
    }
    case "frostbiteAbove": {
      if (!hits) return off("the supported skill deals no hits");
      const rating = Math.max(0, Number(state.frostbiteRating) || 0);
      const applied = Math.min(clause.cap, Math.max(0, clause.value * (rating - clause.above)));
      return applied > 0 ? on(`the dummy's Frostbite Rating ${r(rating)} (src/combat-states.js) − ${clause.above} = ${r(rating - clause.above)} × ${clause.value}% = +${r(applied)}% Critical Strike Rating (up to +${clause.cap}%)`, { appliedValue: r(applied) }) : off(`the dummy's Frostbite Rating ${r(rating)} does not exceed ${clause.above}`);
    }
    case "turmoil": {
      const block = spellBurstBlock(full);
      if (block) return off(block);
      const perStack = Number(siblingMatch(siblings, new RegExp(`^${N}% Turmoil Effect for each stack`, "i"))?.[1]) || 0;
      const maxStacks = Number(siblingMatch(siblings, /^Max stacks: (\d+)$/i)?.[1]) || 6;
      const stacks = Math.min(maxStacks, Math.max(0, Number(state.maxSpellBurst) || 0));
      const value = r(clause.value * (1 + perStack * stacks / 100));
      return on(`Turmoil on the dummy from the skill's Spell Burst hits: +${clause.value}% damage taken from the supported skill (patch notes; provisional) × (1 + ${perStack}% × ${r(stacks)} Spell Burst stacks consumed recently: one activation of Max Spell Burst ${r(state.maxSpellBurst)} within 4 s, up to ${maxStacks}; provisional) = +${value}%`, { appliedValue: value, provisional: true });
    }
    case "ablaze": {
      if (!hits) return off("the supported skill deals no hits, so it Ignites nothing");
      if (!(state.enemyAilments || []).includes("Ignite")) return off("the dummy is not Ignited (enemy-ailment model)");
      if (!types.includes("Fire")) return off("the supported skill deals no Fire Damage");
      const effect = siblingMatch(siblings, new RegExp(`^${N}% additional Ablaze Effect for each enemy within ${N} m Ignited by the supported skill, up to ${N}%$`, "i"));
      const perEnemy = effect ? num(effect[1]) : 0, meters = effect ? num(effect[2]) : 10, cap = effect ? num(effect[3]) : 0;
      const enemies = explicitRadiusHolds(meters, state.nearTarget) ? 1 : 0;
      const boost = Math.min(cap, perEnemy * enemies);
      const value = r(clause.value * (1 + boost / 100));
      return on(`the dummy is Ignited (the supported skill deals Fire hits; provisional attribution): Ablaze +${clause.value}% Fire Damage taken from the supported skill (patch notes; provisional) × (1 + ${r(boost)}% Ablaze Effect for ${enemies} Ignited enemy within ${meters} m) = +${value}%`, { appliedValue: 0, typedParts: [{ typed: "Fire", value }], provisional: true });
    }
    // ---- Skill-mechanics census batch 2 (B1, 2026-10-27) ----
    // Rumbling Thunder: one Shadow Strike True Body hit per use; the debuff holds min(1, uses/s × seconds) of the time.
    case "trueBodyDebuff": {
      if (full.engine !== "skill-hit") return off("read on skill hits only");
      if (!types.includes("Lightning")) return off("the supported skill deals no Lightning Damage");
      const facts = state.critHitsBySetup?.get?.(setupKey) || null;
      const rate = facts && Number.isFinite(facts.usesPerSecond) ? facts.usesPerSecond : null;
      const uptime = rate == null ? 1 : Math.min(1, rate * clause.seconds);
      const value = r(clause.value * uptime);
      return value > 0 ? on(rate == null ? `debuff held (use rate not measured yet; ${clause.seconds} s per True Body hit; recipe ${clause.recipe})` : `one True Body hit per use: ${r(rate)} uses/s × ${clause.seconds} s → uptime ${r(uptime)} (min 1; recipe ${clause.recipe}): +${clause.value}% × ${r(uptime)}`, { appliedValue: 0, typedParts: [{ typed: "Lightning", value }], provisional: rate == null || uptime < 1 }) : off("the supported skill is not used");
    }
    case "unfiredBolts":
      return full.skillName === "Homing Frost Bolt" ? on(`the skill holds its 6 unfired Frost Bolts (best case, as its own "+4% per unfired Frost Bolt" line; src/skill-hit-profiles.js), at least ${clause.bolts} (game affix ${clause.recipe})`, { appliedValue: clause.value }) : off("the supported skill fires no Frost Bolts");
    case "frozenTarget": {
      if (!hits) return off("the supported skill deals no hits");
      const rating = Number(state.frostbiteRating) || 0;
      return rating >= 100 ? on(`the dummy is Frozen (Frostbite Rating ${r(rating)} ≥ 100, user-confirmed 2026-10-18): +${clause.value} Critical Strike Rating (game affix ${clause.recipe})`, { appliedValue: clause.value }) : off(`the dummy is not Frozen (Frostbite Rating ${r(rating)} < 100)`);
    }
    case "terraCentre":
      return on(`one enemy, the training dummy, inside the Nether Terra's central area (best case; game affix ${clause.recipe}${clause.cap ? `; up to +${clause.cap}%` : ""}; provisional)`, { appliedValue: Math.min(clause.cap ?? Infinity, clause.value), provisional: true });
    case "nearOwnProjectile":
      if (!hits) return off("the supported skill deals no hits");
      return explicitRadiusHolds(clause.meters, state.nearTarget) ? on(`the projectile flies to the dummy and the character stands within ${clause.meters} m of it (Distance group: Nearby, best case)`, { appliedValue: clause.value }) : off(`the character stands ${DISTANT_STANDING_METERS} m away (Distance group), outside ${clause.meters} m of the projectile`);
    case "beamExplosions":
      if (full.engine !== "scorching-beam") return off("the explosions are Scorching Beam's");
      return on(`+${clause.value}% × the beam's explosions in the last ${clause.seconds} s (casts/s ÷ Max Channeled Stacks; none with Immolate), up to ${clause.cap}, on the Scorching Beam path (src/build-mechanics.js; provisional)`, { appliedValue: 0, provisional: true });
    // Cohesion / Winter's Bite: settled on the Terra's damage over time in src/planner.js (src/terra-supports.js), where the recast
    // interval and the Terra Charges consumed per cast are known; nothing applied here (no double count).
    case "terraAgeStacks":
      if (full.engine !== "skill-dot" || !(full.terra || full.profile?.recast || full.profile?.delivery === "spell-terra")) return off("read on a Terra skill's damage over time only (src/terra-supports.js)");
      return on(`the Terra's stacks at its age when recast (one per ${clause.everySeconds} s, up to ${clause.cap}) on its damage over time (src/terra-supports.js; game affix ${clause.recipe}; provisional)`, { appliedValue: 0, provisional: true });
    case "wintersBite":
      if (full.engine !== "skill-dot" || !(full.terra || full.profile?.recast || full.profile?.delivery === "spell-terra")) return off("read on a Terra skill's damage over time only (src/terra-supports.js)");
      if (full.damageType && full.damageType !== "Cold") return off(`the Terra deals ${full.damageType} damage; the debuff raises Cold Damage taken`);
      return on(`+${clause.value}% additional Cold Damage taken × (1 + ${clause.perCharge}% per Terra Charge consumed per cast, up to ${clause.cap}) on the Terra's Cold damage over time; the charges no longer add the skill's own per-charge damage (src/terra-supports.js; game affix ${clause.recipe}; provisional)`, { appliedValue: 0, provisional: true });
    // ---- Condition-unread batch 3 (2026-10-28) ----
    case "crowdControlAtLeast": {
      if (!hits && full.engine !== "skill-dot") return off("the supported skill deals no hits and no damage over time");
      const types = state.enemyCrowdControl || [];
      return types.length >= clause.count ? on(`${types.length} crowd control type${types.length === 1 ? "" : "s"} on the dummy (${types.join(", ")}; src/combat-states.js) ≥ ${clause.count} (game recipe ${clause.recipe}, gate 300 ≥)`, { appliedValue: clause.value }) : off(`${types.length} crowd control type${types.length === 1 ? "" : "s"} on the dummy${types.length ? ` (${types.join(", ")})` : ""}, fewer than ${clause.count}`);
    }
    case "traumatizedNearby": {
      if (full.engine !== "skill-hit") return off("Attack Speed of the supported skill: read on skill hits only");
      if (!(state.enemyAilments || []).includes("Trauma")) return off("the dummy is not Traumatized (enemy-ailment model)");
      if (!explicitRadiusHolds(clause.meters, state.nearTarget)) return off(`the dummy is outside ${clause.meters} m (the Distant alternative stands ${DISTANT_STANDING_METERS} m away)`);
      const applied = Math.min(clause.cap, clause.value);
      return on(`1 Traumatized enemy (the training dummy) within ${clause.meters} m: +${clause.value}% × 1 (up to +${clause.cap}%; game recipe ${clause.recipe})`, { appliedValue: r(applied) });
    }
    case "galeSeconds": {
      if (!full.channeled && !full.tags.has("Channeled")) return off("the supported skill is not channeled, so it has no Gale");
      const prebuilt = state.prebuiltSelfBuffs !== false;
      // Cold start: one stack per second of Gale from 0, the 20 s window's average (provisional).
      const window = 20;
      const stacks = prebuilt ? clause.cap : (Array.from({ length: window }, (_, second) => Math.min(clause.cap, second)).reduce((a, b) => a + b, 0) / window);
      return on(prebuilt ? `the channel is held on the dummy, so the Gale's stacks sit at their cap ${clause.cap} (own buffs pre-built; game recipe ${clause.recipe}): +${clause.value}% × ${clause.cap}` : `own buffs not pre-built: one stack per second of Gale from 0, ${r(stacks)} on average over ${window} s (provisional)`, { appliedValue: r(clause.value * stacks), provisional: !prebuilt });
    }
    case "focusPtsConsumed":
    case "focusPtsGained": {
      const focus = full.profile?.focus;
      if (!focus) return off("the supported skill is not a modeled Focus skill (no Focus Pts economy)");
      if (clause.condition === "focusPtsConsumed") {
        const steps = Math.floor(focus.pointsPerUse / clause.every + 1e-9);
        return steps > 0 ? on(`each use consumes ${focus.pointsPerUse} Focus Pts (${full.skillName} profile): ${steps} × ${clause.value}% on that use (game recipe ${clause.recipe}: the next action after the consumption; whole steps: provisional)`, { appliedValue: r(clause.value * steps), provisional: true }) : off(`each use consumes ${focus.pointsPerUse} Focus Pts, under ${clause.every}`);
      }
      const stacks = Math.min(clause.cap, focus.pointsPerSecond * clause.seconds / clause.every);
      return stacks > 0 ? on(`${r(focus.pointsPerSecond)} Focus Pts/s (${full.skillName} profile) × ${clause.seconds} s ÷ ${clause.every} = ${r(stacks)} stacks held (each ${clause.seconds} s; up to ${clause.cap}; game recipe ${clause.recipe}; provisional)`, { appliedValue: r(clause.value * stacks), provisional: true }) : off("the skill gains no Focus Pts");
    }
    case "fissureSpreads": {
      if (!(full.profile?.components || []).some((component) => component.key === "fissure")) return off("the supported skill creates no modeled fissure");
      return on(`on the spreading fissure's own hits (the "fissure" hit group; game recipe ${clause.recipe}: tag 6101354): ${clause.value >= 0 ? "+" : ""}${clause.value}% additional`, { appliedValue: 0, componentParts: [{ component: "fissure", value: clause.value }] });
    }
    // Minion supports: the planner's state (Command, the dummy's Frostbite Rating, the player's hits) or the Minion model's own (Growth,
    // the Empower Skill buff, Self-Destruct Protocol: src/minion-damage-model.js minionCensusLine).
    case "minionGrowth": return on(`× the Spirit Magus's Growth (src/minion-damage-model.js; game recipe ${clause.recipe})`, { appliedValue: 0, minionScale: "growth" });
    case "minionEmpowerBuff": return on(`while the Minion's Empower Skill buff lasts: joins that buff (src/minion-damage-model.js; game recipe ${clause.recipe}; buff 11160 read as the Empower Skill's own: provisional)`, { appliedValue: 0, minionScale: "empowerBuff", provisional: true });
    case "selfDestructCentre": return on(`Self-Destruct Protocol explosions with the dummy at the centre (best case; src/minion-damage-model.js; game recipe ${clause.recipe}, attr 5901)`, { appliedValue: 0, minionScale: "selfDestruct", provisional: true });
    case "minionCommand": {
      const points = Math.max(0, Number(state.commandPoints) || 0);
      if (!points) return off(state.commandReason || "no Command: no \"+N Command per second\" source, or full Command is switched off (src/minion-cores.js commandState)");
      const counted = clause.stacks != null ? Math.min(points, clause.stacks) : points;
      const held = Math.min(clause.cap ?? Infinity, clause.value * counted);
      // Focus Fire's "While the buff is active" (game recipe 559099072: gate buff 11130, the buff its "When casting Dark Gate, Minions … gain a
      // buff for N s" clause grants, recipe 797326592): held min(1, N s ÷ Dark Gate's cooldown) of the time while Dark Gate is on the board,
      // Inactive without it (census batch 6, 2026-10-28: the same cadence as its Attack Speed part; it read the buff as always held before).
      let uptime = 1, gate = "";
      if (clause.buffHeld) {
        if (!state.darkGate?.active) return off("no Dark Gate on the board: its cast gives the buff (buff 11130, game recipes 797326592 / 559099072)");
        const seconds = siblings.map((text) => Number(String(text).match(/^When casting Dark Gate ?, Minions summoned by the supported skill gain a buff for ([\d.]+)\s*s$/i)?.[1])).find((value) => value > 0) || 2;
        uptime = Math.min(1, seconds / Math.max(0.01, Number(state.darkGate.cooldownSeconds) || 0.01));
        gate = `; × ${r(uptime)} Dark Gate buff uptime (${seconds} s per cast, Dark Gate every ${r(state.darkGate.cooldownSeconds)} s; buff 11130)`;
      }
      const applied = held * uptime;
      return on(`the summoner's Command ${r(points)} (src/minion-cores.js commandState: full Command, switch "fullCommand")${clause.stacks != null ? `, counted up to ${clause.stacks}` : ""}: ${clause.value}% × ${r(counted)}${clause.cap != null ? ` (up to +${clause.cap}%)` : ""} = +${r(held)}%${gate} (game recipe ${clause.recipe}: on each cast, the Minions' next loop action; read as held: provisional)`, { appliedValue: r(applied), provisional: true });
    }
    case "minionFrozenTarget": {
      const rating = Number(state.frostbiteRating) || 0;
      return rating >= 100 ? on(`the dummy is Frozen (Frostbite Rating ${r(rating)} ≥ 100, user-confirmed 2026-10-18; game recipe ${clause.recipe})`, { appliedValue: clause.value }) : off(`the dummy is not Frozen (Frostbite Rating ${r(rating)} < 100)`);
    }
    case "summonerHits": {
      const rate = Number.isFinite(state.playerHitsPerSecond) ? state.playerHitsPerSecond : null;
      const stacks = rate == null ? clause.cap : Math.min(clause.cap, rate * clause.seconds);
      if (!(stacks > 0)) return off("the summoner lands no hits on the dummy");
      return on(rate == null ? `held at ${clause.cap} stacks (the player's hit rate is measured on the planner's hit pass)` : `the player's ${r(rate)} hits/s × ${clause.seconds} s = ${r(rate * clause.seconds)} stacks${rate * clause.seconds > clause.cap ? `, capped at ${clause.cap}` : ""} (game recipe ${clause.recipe}): +${clause.value}% × ${r(stacks)}`, { appliedValue: r(clause.value * stacks), provisional: true });
    }
    default: return { active: null, appliedValue: 0, conditionText: "unknown condition" };
  }
}
// The Thrive in Adversity lines: the dummy is an Elite (a Boss) within 10 m, so an Elite is inside 20 m at both distances.
function resolveEliteEffect(clause, full) {
  if (!full.conditions) return { active: null, appliedValue: 0, conditionText: "condition not resolved (no planner state)" };
  const inside = dummyTarget.elite && explicitRadiusHolds(clause.meters, full.conditions.nearTarget);
  const active = clause.eliteNeeded ? inside : !inside;
  return { active, appliedValue: active ? clause.value : 0, conditionText: inside ? `the dummy is an Elite (a Boss; src/dummy-target.js) within ${clause.meters} m` : `no Elite within ${clause.meters} m` };
}
// Badges of the census clauses (before the per-family switch).
function censusStatus(clause, full) {
  const s = (status, reason, consumers = []) => ({ status, reason, consumers });
  const engine = full.engine;
  if (clause.family === "censusDetail") {
    // Enhanced Mark, config_char_buff 331 (chunk 8): affix 594266176 [15], attr 5720 additional on the attacker's Projectile tag 6001110 (src/support-chunk8.js chunk8EnemyLines).
    if (clause.kind === "enhancedMark") return engine === "skill-hit" || engine === "scorching-beam" ? s("Provisional", "+15% additional Projectile Damage taken on the dummy (buff 331, × Mark Effect), held while the skill hits; every Projectile Skill of the build takes it", ["planner"]) : s("Inactive", "the supported skill deals no hits");
    return engine === "skill-dot" || (full.dealtTypes || []).length ? s("Provisional", "a Blur source while the supported skill deals Damage Over Time (src/planner.js Blur sources; the skill's own DoT or its ailments)", ["blur"]) : s("Inactive", "the supported skill deals no Damage Over Time");
  }
  if (clause.family === "censusBuff") {
    if (clause.kind === "psychicSurge") return full.tags.has("Mobility") ? s("Provisional", "the Spell Burst casts of the build's other skills take it on the share of activations that follow a cast of this Mobility Skill (src/support-buff-effects.js)", ["planner"]) : s("Inactive", "supports Mobility Skills only");
    if (clause.kind === "empoweredElement") return full.tags.has("Empower") ? s("Provisional", "build-wide +Elemental Damage while the Empower Skill lasts, its buff held (best case, own buffs pre-built; src/support-buff-effects.js)", ["planner"]) : s("Inactive", "the supported skill is not an Empower Skill");
    if (clause.kind === "gladiatorsRoar") return full.tags.has("Warcry") ? s("Provisional", "build-wide additional damage after casting this Warcry with the dummy (an Elite) inside its area: uptime min(1, duration ÷ the Warcry's cooldown) (src/support-buff-effects.js)", ["planner"]) : s("Inactive", "the supported skill is not a Warcry");
  }
  if (clause.family === "empower") {
    if (clause.active == null) return s("Provisional", clause.conditionText, ["empower"]);
    if (!clause.active) return s("Inactive", clause.conditionText);
    return EMPOWER_MODELED_SKILLS.has(full.skillName) || EMPOWER_BUFF_SKILLS.has(full.skillName) ? s("Provisional", `Empower Effect +${clause.value}%: ${clause.conditionText} (src/empower-effects.js)`, ["empower"]) : s("Not modeled", "no Empower effect of this skill reaching the dummy is modeled");
  }
  if (clause.family === "combo") {
    if (engine !== "skill-hit" || !full.combo) return s(engine === "skill-hit" ? "Inactive" : "Not modeled", engine === "skill-hit" ? "the supported skill has no modeled Combo cycle" : "the Combo cycle is read for skill hits only");
    if (clause.comboReason) return s(clause.comboProvisional ? "Provisional" : "In calc", clause.comboReason, ["skill-hit"]);
    return s("In calc", clause.kind === "starterSpeed" ? "the Combo Starters' attack time: increased Attack Speed pool + this line on the Starter steps of the cycle (src/skill-hit-model.js)" : "one additional factor on the Combo Finisher's hits (src/skill-hit-model.js)", ["skill-hit"]);
  }
  if (clause.family === "censusCrit") {
    if (clause.active == null) return s("Provisional", clause.conditionText, [engine]);
    if (!clause.active) return s("Inactive", clause.conditionText);
    if (engine === "skill-dot") return s("No DPS effect", "damage over time never crits");
    return s(clause.provisional ? "Provisional" : "In calc", `${clause.conditionText}; increased Critical Strike Rating of the supported skill's hits`, [engine === "scorching-beam" ? "crit" : "skill-hit crit"]);
  }
  // Minion support lines (condition-unread batch 3): read by the Minion model on the Minions this setup summons.
  if (clause.family === "minion" && engine !== "minion") return s("No DPS effect", "the setup summons no modeled Minion");
  // conditionalAdditional
  if (clause.unmodeled) return s("Not modeled", clause.conditionText);
  if (clause.typedParts && engine === "scorching-beam" && !clause.typedParts.some((part) => part.typed === "Fire")) return s("Inactive", "does not reach Scorching Beam's Fire damage");
  if (clause.active == null) return s("Provisional", clause.conditionText, [engine]);
  if (!clause.active) return s("Inactive", clause.conditionText);
  return s(clause.provisional ? "Provisional" : "In calc", clause.conditionText, [engine]);
}
// A line inside a multi-line reference data progression column (Gladiator's Roar's "+X% additional damage for 6 s …" sits in one column with
// the Knockback lines): its value at the support's level (in game mode the stone's level map, else reference data's cell).
function multiLineColumnValue(supportName, baseText, level) {
  // The column's value belongs to this line only when the heading's copy of the line carries the Lv.1 value (Elemental Conversion's and
  // Turmoil Burst's columns span lines whose value is on another line).
  for (const column of supportProgressionSs13[supportName]?.columns || []) {
    const lines = String(column.heading).split(/\r?\n/);
    const line = lines.length > 1 ? lines.find((item) => signature(item) === signature(baseText)) : null;
    const first = line ? parseProgressionCell(column.values?.["1"]) : null;
    if (!line || first?.length !== 1 || !lineNumbersOf(line).some((number) => Math.abs(Math.abs(number) - Math.abs(first[0])) < 1e-9)) continue;
    const values = parseProgressionCell(column.values?.[String(level)]);
    return values?.length === 1 ? values[0] : null;
  }
  return null;
}

const hitTypedApplies = (typed, types, tags) => TYPES.includes(typed) ? types.includes(typed) : typed === "Elemental" ? types.some((type) => ELEMENTAL.includes(type)) : typed === "Hit" || typed === "Spell" || tags.has(typed);
const dotTypedApplies = (typed, damageType) => typed === damageType || (typed === "Elemental" && ELEMENTAL.includes(damageType));

// Shotgun Effect falloff coefficient of a skill: its reference data text's coefficient ("Shotgun Effect falloff coefficient is 64%",
// "70% Shotgun falloff"), else 70%; null without a Shotgun Effect. The coefficient is what each repeat hit deals, and the
// falloff is linear: 1 + c × (hits − 1) (src/shotgun-effect.js). Sources: the in-game tooltip (Chromatic Shot, user
// 2026-10-12: "falloff coefficient is 70%"), the game hit rule's one flat repeatDmgDecPercent row (100 − c), and the
// Chromatic Shot runs (1 + 0.7 and 1 + 0.7 × 2). The "×0.3" reading of "usually a 70% reduction" is ruled out.
// The skills whose text gives no coefficient and whose hit rule does (repeatDmgDecPercent, chunk 7): 36 → 64%.
const SPLIT_SHOTGUN_COEFFICIENT = { "Blazing Bullet": 0.64 };
export function shotgunFalloff(skillName) {
  if (SPLIT_SHOTGUN_COEFFICIENT[skillName]) return SPLIT_SHOTGUN_COEFFICIENT[skillName];
  const text = (allSkillEffectsSs13[skillName] || []).join("\n");
  if (!/Shotgun/i.test(text)) return null;
  const match = text.match(/Shotgun Effect falloff coefficient is (\d+(?:\.\d+)?)%/i) || text.match(/(\d+(?:\.\d+)?)% Shotgun/i) || text.match(/Shotgun (?:Effect )?falloff[^.%]*?(\d+(?:\.\d+)?)%/i);
  return match ? Number(match[1]) / 100 : 0.7;
}

// Falloff for extra projectiles from Projectile Quantity on the single dummy, or null when they cannot reach it. Ice Lances
// Lv16 with and without Multiple Projectiles (user, 2026-10-12; research/residual-batch-2026-10-12.md run 8): still one
// floating number per cast and the recount moved ×1.15 (the support's additional damage only), confirming reference data's "cannot
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
    // Forks the skill's projectile has left at its first hit (Disintegration's "for each remaining fork"; src/skill-hit-profiles.js).
    forks: ctx.forks ?? (Number(profile?.forks) || 0),
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
    maxAfflictionDot: [], terraCharge: [], empower: [], allElementalAdditional: [], movementCharges: [], alternating: [], censusBuff: [],
    componentAdditional: {},
    // Chunk 8 (src/support-chunk8.js): families with a reader of their own.
    ailmentDuration: [], demolisherRecovery: [], focusSpeed: [], maxDamage: [], deterioration: [], projectileSpeedShare: [], dotRoll: [], finisherHits: [], penetration: [], fervorOnSkill: [],
    clauses: []
  };
  const effectsSetupKey = effects.setupKey;
  // Census batch 4 (src/support-conditional-batch4.js): this setup's enabled supports and, on demand, every support's clause texts (Skill
  // Area, Projectile Quantity and Max Channeled Stacks lines one support reads from the others).
  const enabledSupports = (setup?.supports || []).filter((support) => support.enabled !== false);
  let setupTexts = null;
  full.setupSupportNames = new Set(enabledSupports.map((support) => support.name));
  full.setupClauseTexts = () => (setupTexts ??= enabledSupports.flatMap((support) => supportClauses(setup, support, full).map((raw) => tidy(raw.text))));
  for (const support of setup?.supports || []) {
    if (support.enabled === false) continue;
    const source = `Support: ${support.name}`;
    const raws = supportClauses(setup, support, full);
    const siblings = raws.map((item) => item.text);
    for (const raw of raws) {
      const parsed = classifySupportClause(raw.text);
      // "The supported skill can activate Spell Burst" (condition-unread batch 3) lifts the Spell Burst block for the clauses after it.
      if (parsed.family === "spellBurst" && parsed.canActivate) full.spellBurstCanActivate = true;
      const clause = { support: support.name, source, text: raw.text, baseText: raw.baseText, origin: raw.origin, level: raw.level ?? null, tier: raw.tier ?? null, stars: raw.stars ?? null, ...(raw.game ? { game: raw.game } : {}), ...(raw.refdataText ? { refdataText: raw.refdataText } : {}), ...parsed };
      // Census item #2 (CENSUS_SUPPORT_RULES): a multi-line column's value at the support's level, then the census condition.
      if (clause.census && clause.origin === "fixed" && Number.isFinite(clause.value)) {
        const leveled = multiLineColumnValue(support.name, raw.baseText, supportLevel(support));
        if (leveled != null && leveled !== clause.value) Object.assign(clause, { text: substitute(clause.text, [leveled]), value: leveled, origin: "leveled", level: supportLevel(support) });
      }
      if (clause.census && (clause.chunk8 || clause.family === "conditionalAdditional" || clause.family === "censusCrit" || clause.family === "censusSpeed" || clause.family === "minion")) Object.assign(clause, resolveCensusCondition(clause, full, siblings, effectsSetupKey));
      else if (clause.census && clause.family === "empower" && clause.kind === "conditionalEffect") Object.assign(clause, resolveEliteEffect(clause, full));
      // Census batch 5 (B3): the held weapon, Max Spell Burst and the hit pass's crit share (src/support-hit-count-batch5.js).
      else if (clause.batch5) Object.assign(clause, resolveBatch5Clause(clause, full, effectsSetupKey));
      // Activation Medium event clauses (census items #8 / #12): the hit pass's event facts.
      else if (clause.amEvent) Object.assign(clause, resolveAmEventClause(clause, full, siblings, effectsSetupKey));
      // Census batch 6: Mind Control: Enthrall's links to the build's Minions (src/minion-sentry-batch6.js).
      else if (clause.batch6 && clause.family === "conditionalAdditional") Object.assign(clause, resolveBatch6Clause(clause, full));
      else if (clause.family === "conditionalAdditional" && clause.condition === "iceStormRamp") Object.assign(clause, resolveIceStormRamp(clause));
      else if (clause.family === "conditionalAdditional") Object.assign(clause, resolveCondition(clause, support, full.conditions));
      if (clause.family === "critOnlyAdditional" && clause.fervor) Object.assign(clause, resolveFervorCrit(clause, full.conditions));
      // Empowered Channeling (gear affix batch C): a skill that does not channel takes nothing.
      if (clause.family === "conditionalAdditional" && clause.condition === "channelSeconds" && !full.channeled && !full.tags.has("Channeled")) Object.assign(clause, { active: false, appliedValue: 0, conditionText: "the supported skill is not channeled" });
      // A skill-type scope from the game recipe (Recklessness: Attack): a skill without the tag takes nothing.
      if (clause.family === "conditionalAdditional" && clause.skillScope && !full.tags.has(clause.skillScope)) Object.assign(clause, { active: false, appliedValue: 0, conditionText: `the game recipe (${clause.recipe}) scopes it to ${clause.skillScope} hits of the supported skill; this skill is not an ${clause.skillScope}` });
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
      clause.damage = clause.family !== "other" ? !NON_DAMAGE_FAMILIES.has(clause.family) : damageWords.test(clause.text);
      const entry = { support: support.name, source, text: clause.text, origin: clause.origin, status: clause.status, level: clause.level, tier: clause.tier, stars: clause.stars };
      switch (clause.family) {
        case "additional": effects.additional.push({ ...entry, value: clause.value, typed: clause.typed || null, scope: clause.scope }); break;
        case "increased": effects.increased.push({ ...entry, value: clause.value, typed: clause.typed || null, scope: clause.scope }); break;
        case "critOnlyAdditional": effects.critOnlyAdditional.push({ ...entry, value: clause.appliedValue ?? clause.value }); break;
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
        case "conditionalAdditional":
          effects.conditionalAdditional.push({ ...entry, value: clause.value, condition: clause.condition, active: clause.active, appliedValue: clause.appliedValue, conditionText: clause.conditionText, triggeredOnly: Boolean(clause.triggeredOnly), ...(clause.hitOnly ? { hitOnly: true, skillScope: clause.skillScope } : {}), ...(clause.typedParts ? { typedParts: clause.typedParts } : {}) });
          // Census item #2 typed bodies (Electric Overload, Elemental Conversion, Blazing Scorch): typed additional lines on the hits.
          if (clause.active && ["In calc", "Provisional"].includes(clause.status)) for (const part of clause.typedParts || []) if (part.value) effects.additional.push({ ...entry, text: `${part.value >= 0 ? "+" : ""}${part.value}% additional ${part.typed} Damage (${clause.text} — ${clause.conditionText})`, value: part.value, typed: part.typed, scope: scopeFor(part.typed) });
          // Condition-unread batch 3: a line scoped to one hit group (Groundshaker's fissure), read by src/skill-hit-model.js per component.
          if (clause.active && ["In calc", "Provisional"].includes(clause.status)) for (const part of clause.componentParts || []) if (part.value) (effects.componentAdditional[part.component] ??= []).push({ source: clause.source, text: `${clause.text} — ${clause.conditionText}`, value: part.value });
          break;
        // Condition-unread batch 3: a conditional Attack Speed of the supported skill (Restless).
        case "censusSpeed": if (clause.active && clause.appliedValue && ["In calc", "Provisional"].includes(clause.status)) effects.speed.push({ ...entry, text: `${clause.text} — ${clause.conditionText}`, value: clause.appliedValue, additional: true, kind: "attack" }); break;
        // Census item #2: Frostbloom's Frostbite-scaled Critical Strike Rating; the build-wide buffs (src/support-buff-effects.js).
        case "censusCrit": if (clause.active && clause.appliedValue) effects.crit.push({ ...entry, text: `${clause.text} — ${clause.conditionText}`, value: clause.appliedValue, kind: clause.critKind || "ratingPercent", census: true }); break;
        case "censusBuff": effects.censusBuff.push({ ...entry, value: clause.value, kind: clause.kind, seconds: clause.seconds ?? null, bursts: clause.bursts ?? null }); break;
        case "projectileQuantity": effects.quantity.push({ ...entry, value: clause.value, kind: "projectiles" }); break;
        case "multistrike": effects.multistrike.push({ ...entry, value: clause.value, kind: clause.kind }); break;
        case "steepStrike": effects.steepStrike.push({ ...entry, value: clause.value, kind: clause.kind, ...(clause.meters != null ? { meters: clause.meters } : {}), ...(clause.seconds != null ? { seconds: clause.seconds } : {}), ...(clause.attempts != null ? { attempts: clause.attempts } : {}) }); break;
        case "spellBurst": effects.spellBurst.push({ ...entry, value: clause.value, kind: clause.kind, ...(clause.canActivate ? { canActivate: true } : {}) }); break;
        case "combo": effects.combo.push({ ...entry, value: clause.value, kind: clause.kind, ...(clause.cap != null ? { cap: clause.cap } : {}), ...(clause.cooldown != null ? { cooldown: clause.cooldown } : {}) }); break;
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
        case "trigger": effects.trigger.push({ ...entry, kind: clause.kind, interval: clause.interval ?? null, meters: clause.meters ?? null, target: clause.target ?? null, castSpeedScaled: Boolean(clause.castSpeedScaled), startsReady: Boolean(clause.startsReady),
          ...(clause.amEvent ? { event: clause.event, eventIntervalSeconds: clause.eventIntervalSeconds, eventRateText: clause.eventRateText ?? null, selfLock: Boolean(clause.selfLock), removesLockOn: Boolean(clause.removesLockOn) } : {}), ...(clause.prepared ? { prepared: true } : {}) }); break;
        // Magnificent "consume Spell Burst at max stacks" (AM_EVENT_RULES): per component in src/skill-hit-model.js.
        case "spellBurstConsume": effects.spellBurst.push({ ...entry, value: clause.value, kind: "consume", component: clause.component }); break;
        case "triggerDetail": effects.triggerDetail.push({ ...entry, kind: clause.kind, share: clause.share ?? null }); break;
        case "manualPenalty": effects.manualPenalty.push({ ...entry, value: clause.value }); break;
        case "minion": effects.minion.push({ ...entry, value: clause.value }); break;
        case "target": effects.target.push({ ...entry, value: clause.value }); break;
        case "conditionalTyped": effects.conditionalTyped.push({ ...entry, value: clause.value, typed: clause.typed }); break;
        case "affliction": effects.affliction.push({ ...entry, value: clause.value, kind: clause.kind }); break;
        case "maxAfflictionDot": effects.maxAfflictionDot.push({ ...entry, value: clause.value }); break;
        case "terraCharge": effects.terraCharge.push({ ...entry, value: clause.value, kind: clause.kind }); break;
        case "empower": effects.empower.push({ ...entry, value: clause.value ?? null, kind: clause.kind, ...(clause.census ? { active: clause.active, appliedValue: clause.appliedValue } : {}) }); break;
        case "allElementalAdditional": effects.allElementalAdditional.push({ ...entry, value: clause.value, typed: "Elemental", active: clause.active }); break;
        case "movementCharges": effects.movementCharges.push({ ...entry, value: clause.value, uses: clause.uses, meters: clause.meters, knockback: clause.knockback, active: clause.active }); break;
        case "chunk8Duration": effects.ailmentDuration.push({ ...entry, value: clause.value, additional: clause.additional, ailment: clause.ailment }); break;
        case "chunk8Recovery": effects.demolisherRecovery.push({ ...entry, value: clause.value, kind: clause.kind }); break;
        case "chunk8Focus": effects.focusSpeed.push({ ...entry, value: clause.value, additional: clause.additional }); break;
        case "chunk8Max": effects.maxDamage.push({ ...entry, value: clause.value }); break;
        case "chunk8Fervor": if (clause.active && clause.appliedValue) effects.fervorOnSkill.push({ ...entry, value: clause.appliedValue }); break;
        case "chunk8Deterioration": effects.deterioration.push({ ...entry, value: clause.value, kind: clause.kind, stacks: clause.stacks ?? 1, profane: Boolean(clause.profane) }); break;
        case "chunk8SpeedShare": effects.projectileSpeedShare.push({ ...entry, value: clause.value }); break;
        case "chunk8DotRoll": effects.dotRoll.push({ ...entry, min: clause.min, max: clause.max }); break;
        case "chunk8FinisherHits": effects.finisherHits.push({ ...entry, value: clause.value, every: clause.every, cap: clause.cap }); break;
        case "chunk8Penetration": effects.penetration.push({ ...entry, value: clause.value, kind: clause.kind }); break;
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
  // tags: an empty set (batch 1 2026-10-27: censusStatus reads full.tags, and Psychic Surge threw on this engine).
  ["minion", { engine: "minion", tags: new Set() }]
];
const CENSUS_NEUTRAL = new Set(["No DPS effect", "Not on dummy"]);

/**
 * Per-engine statuses of one support clause (the coverage census, tools/coverage-census.mjs): the clause is classified by the
 * rule table and given each engine's status; reference data tier ranges "(a–b)" read at their upper value. The summary is "In calc"
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
    if (clause.family === "conditionalAdditional" && clause.condition === "iceStormRamp") Object.assign(clause, resolveIceStormRamp(clause));
    else if (clause.family === "conditionalAdditional") Object.assign(clause, resolveCondition(clause, support, null));
    if (clause.family === "critOnlyAdditional" && clause.fervor) Object.assign(clause, resolveFervorCrit(clause, null));
    const { status, reason } = clauseStatus(clause, support, { conditions: null, ...ctx });
    engines[label] = { status, reason };
  }
  const values = Object.values(engines).map((item) => item.status);
  const damage = parsed.family !== "other" ? !NON_DAMAGE_FAMILIES.has(parsed.family) : damageWords.test(concrete);
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
