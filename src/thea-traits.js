// Thea (Wisdom of The Gods, Incarnation of the Gods, Blasphemer): hero trait audit batch B7 (2026-10-19;
// research/hero-traits-audit-2026-10-19.md §5 B7, §8 B7, §6 Q-H3 / Q-H9). Pure: reads the build's trait lines (origin "trait") and
// the hero-exclusive revived lines the module reads (src/hero-exclusive-revivals.js MODULE_LINES: The Place of Oracle and its three
// Blessing variants, Crossing the Divine Threshold, Inverted Shrine) and returns
//   - theaBlessingInputs: the Blessing model's extra lines (the Divine Blessing cycle as a gain source, the revived Max Blessing
//     Stacks lines) and the max-stack rules (src/blessing-model.js applyTheaCapRules: Predicted Justice's shared bonus, the Divine
//     Realm's Agility / Tenacity conversion and transfer, Blasphemer's inversion into Max Desecration Stacks);
//   - theaState: God's Boon's cadence and buffs, the Focus Blessing that God's Boon consumes, the Divine Realm, the dummy deemed at
//     Low Life, Desecration on the dummy, for src/planner.js (the Focus override, the Lucky share) and src/hero-trait-modules.js
//     (the badges, the derived lines and the clocked parts);
//   - theaLineRead: one clause's status, reason, derived bodies and clocked parts.
//
// Sourced:
// - Trait texts (reference data, SS14; src/data/heroes/all-hero-traits-ss13.generated.js) and the game tier records (§4.3): God's Boon's
//   buff 82115 lasts the second parameter, 10 s (§6, answered from the game files); Predicted Reincarnation's buff 82113 and
//   Farewell Prophecy's 82114 stack per Focus consumed (node 213); Prophecy of Purity writes the God's Boon buffs' stack limit
//   (attr 3442 flat 1, tag 5008700).
// - reference data keyword tooltips (Torchlight_Hyperlink_hover, fetched 2026-10-19 into research/refdata-ss14/fetch-cache):
//   Focus / Agility / Tenacity Blessing (initial max stacks 4: +5% additional damage; +4% Attack and Cast Speed and +2% additional
//   damage; 4% damage reduction), Desecration (e08b6093: "+15% additional Erosion Damage taken (multiplies) for each stack of
//   Desecration. Initial max stacks: 3. Lasts for 5s. Can only affect 1 target"), Sacrificial Pawn (0f6b3f2c: "-10% additional
//   damage dealt and +10% additional Erosion Damage taken. This is considered a Crowd Control Effect"), Mountain of Sins (8ad74b7c:
//   "Reduces Erosion Resistance by 20%"), Divine Realm (8c37095a: the Agility / Tenacity conversion outside / within; "deals
//   additional damage to Full Life enemies when outside … to Low Life enemies when within"), God's Boon (83458fb2), Low Life
//   (be27a4cb: under 35% of Max Life), Preparation (5e33ceac: triggers the skill once when ready, else right after its cooldown).
//
// Provisional readings (src/open-questions.js, shown only for Thea):
// - Q-H3 (recommended): a Divine Blessing every 2 s in the order Focus → Agility → Tenacity, so each type gains a stack every 6 s
//   (Focus at 0, Agility at 2 s, Tenacity at 4 s of each 6 s). Each gain is a layer on its own 10 s timer (× Blessing Duration) and
//   refreshes nothing, the oldest out at the cap (user decision 2026-11-04, SS14 client, research/oq-blessing-refresh-2026-11-04.md;
//   open question blessing-layer-timers; src/blessing-layers.js): a type holds min(max, its gains in the last D s), so at base 2 stacks
//   for 4 s and 1 for 2 s of every 6 s, 1.67 on average, never its max of 4 from the cycle alone (the steady pattern with own buffs
//   built). "At max stacks" conditions are met only when ⌈D ÷ 6 s⌉ reaches the max, or another gain source holds the Blessing.
//   God's Boon fires at max Focus (when the cycle can reach it) and consumes every Focus stack: its cadence and the Focus it leaves
//   come from a frame simulation of the layers (godsBoonCycle; another Focus gain source in the build refills it at once: Focus held at
//   max, P = the cooldown). The God's Boon buffs last 10 s. The 5 s / 20 s windows cast God's Boon at t = 0 with own buffs built (Focus
//   pre-built), else at the first max Focus.
// - The Place of Oracle's "+2% additional damage" is per stack of Tenacity and Agility Blessing, scaled by each Blessing's Effect;
//   Prophecy of Purity's extra stack raises the per-Focus buffs' stack limits (Predicted Reincarnation, Farewell Prophecy, the
//   moon's Skill Area); Prophecy of Punishment's Lucky Damage and Max Damage hold for the share of time Focus equals Agility
//   (a part-time Lucky window); Farewell Prophecy's Double Damage chance is time-averaged and its
//   Quadruple Damage reads the averaged chance (src/double-damage.js).
// - The Divine Realm: pressed on cooldown (8 s / 8 s, the Trait Skill switch) or Prepared by Tenacious Divinity / Agile Godhood,
//   cast on the dummy: uptime 1 from t = 0. Inside vs outside the Realm cannot both hold: the "Divine Realm position" choice
//   (src/planner.js exclusiveConditionGroups) keeps the one with more damage, default outside. Outside, Tenacity converts to
//   Agility and Tenacity's max-stack change applies to Agility; within, the reverse. "When outside the Divine Realm" holds with no
//   Realm too; "while the Divine Realm is active" and "enemies in the Divine Realm" need it.
// - Q-H9 (recommended): the dummy never loses Life (0% lost) except where a line deems it at Low Life: Incarnation deems it for
//   6.5 s of every 10 s from the first hit (share 0.65), read by "enemies at Low Life" lines (src/line-conditions.js enemyLowLife).
// - Desecration (Blasphemer): applied on every Blessing gain (every 2 s, the trait skill ignores its cooldown) or, with no gain, on
//   the 5 s cooldown when the Trait Skill switch is on; each application inflicts ⌈max ÷ 3⌉ stacks; the dummy starts clean. Each stack
//   keeps its own 5 s from its own application and a new one refreshes none; at the cap the oldest is replaced (SS14 client, buff 82127
//   subtype 2 layers, research/oq-aeterna-stack-modes-2026-11-04.md R7; before 2026-11-04 every application refreshed every stack).
//   "+15% additional Erosion Damage taken (multiplies)" per stack: one line, (1.15^n − 1). Blasphemer turns every increase to Max
//   Blessing Stacks into a decrease and +1 Max Desecration Stack each (up to 4 per Blessing type); Extreme Desecration converts
//   the rest once every Blessing's max is 0, up to 25. Sacrificial Pawn (the dummy alone) is a crowd control type on the dummy;
//   Mountain of Sins reads any crowd control type on the Desecrated dummy and is read as Erosion Penetration (as Gemma's Frigid
//   Infusion). Onset of Depravity's True Damage is once per Elite: not on the dummy. Inverted Shrine's self Desecration is held
//   while you Desecrate the dummy.
//
// Chunk 1 audit (2026-11-01, research/hero-thea-chunk1-2026-11-01.md), each loadout on its own, from the game files:
// - Split 879174 (stone 403002): Focus, then Agility 2 s later, then Tenacity 2 s later, the loop every 6 s, each stack 10 s. So Q-H3's
//   cycle is proven. (Corrected 2026-11-04: manual 1002010220 is the Agility Blessing entry, Tenacity 1002010120, Focus 1002010320; all
//   three say a gain refreshes all stacks, but the client's add path gives each gain its own layer and timer, 0x141d02810 / 0x141d15bc0,
//   and the user adopted the code's reading: research/oq-blessing-refresh-2026-11-04.md.)
// - God's Boon: Split 349699, cooldown 15 s ÷ the skill's Cooldown Recovery Speed (general lines too, the routine reads attr 6007 with the
//   skill's tags). Its own hit: row 90020, Spell Physical (src/thea-gods-boon.js). Buffs 82113, 82114, 82115 carry tag 5100310: Skill
//   Effect Duration reaches their 10 s. 82113 and 82114 pile up to 30 stacks; their lines read p2, or p2 × 2 with Prophecy of Purity's
//   label 3050347. So overlapping God's Boons reach the read cap; the +52% (82115) has no stack reference, so its extra stack changes nothing.
// - Desecration: buffs 82142 / 82143 on you, trigger 1000031, attr 5402 "additional Erosion Damage": your own damage, not the enemy's
//   Damage taken, so Minions and the follower take none. Split 246040: cooldown 2 s (the text prints 5 s). Split 944929: Divine Realm
//   cooldown 4 s (the text prints 8 s), its 8 s area on tag 5100310.
// - Incarnation: node 6 has calcIncress, so Cooldown Recovery Speed shortens its 10 s.

import { normalizePercentageText } from "./percentage-text.js";
import { classifyDoubleDamageLine } from "./double-damage.js";
import { BASE_BLESSING_SECONDS, layerStacksAt } from "./blessing-layers.js";

export const WISDOM = "thea-wisdom-of-the-gods";
export const INCARNATION = "thea-incarnation-of-the-gods";
export const BLASPHEMER = "thea-blasphemer";
export const THEA_HEROES = new Set([WISDOM, INCARNATION, BLASPHEMER]);
export const INSIDE_REALM_CONDITION = "theaInsideRealm";
export const CYCLE_SOURCE = "Thea: Divine Blessing cycle (a stack of each Blessing every 6 s, Q-H3)";
export const CYCLE = Object.freeze({ intervalSeconds: 2, order: Object.freeze(["Focus", "Agility", "Tenacity"]) });
export const KEYWORDS = Object.freeze({
  desecration: Object.freeze({ perStackPercent: 15, initialMax: 3, durationSeconds: 5, source: "Keyword Desecration (hover e08b6093): +15% additional Erosion Damage taken (multiplies) per stack, initial max 3, lasts 5 s, 1 target" }),
  sacrificialPawn: Object.freeze({ erosionTakenPercent: 10, source: "Keyword Sacrificial Pawn (hover 0f6b3f2c): +10% additional Erosion Damage taken; a Crowd Control Effect" }),
  mountainOfSins: Object.freeze({ erosionResistancePercent: 20, source: "Keyword Mountain of Sins (hover 8ad74b7c): reduces Erosion Resistance by 20%" }),
  godsBoon: Object.freeze({ buffSeconds: 10, source: "game data: God's Boon's buff 82115 lasts 10 s (hero trait audit §6)" })
});
// The Split headers' cooldowns where the catalog text prints another number (Divine Realm 8 s, Desecration 5 s).
export const HEADER_COOLDOWNS = Object.freeze({ divineRealm: 4, desecration: 2 });
/** The client's cooldown speed: attr 6007 read with the skill's tags, at least 0.1. */
export const cooldownSpeedOf = (facts = {}, additional = []) => Math.max(0.1, (1 + (Number(facts.cooldownRecoverySpeedPercent) || 0) / 100) * (1 + (Number(facts.additionalCooldownRecoverySpeedPercent) || 0) / 100) * additional.reduce((product, value) => product * Math.max(0, 1 + value / 100), 1));
/** Skill Effect Duration on a buff or area with tag 5100310. */
export const skillDurationOf = (facts = {}) => Math.max(0, 1 + (Number(facts.skillEffectDurationPercent) || 0) / 100);
const HORIZON_SECONDS = 120;
const EPS = 1e-9;
const round = (value) => Math.round(value * 10000) / 10000;
const pct = (value) => Math.round(value * 10000) / 100;
export const cleanThea = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").replace(/(\d) %/g, "$1%").replace(/ ([,.:])/g, "$1").replace(/^\+ (\d)/, "+$1").trim();

const NUM = "([+-]?\\d+(?:\\.\\d+)?)";
export const THEA_PATTERNS = Object.freeze({
  cycle: /^Gain a Divine Blessing every ([\d.]+) ?s in the following order: Focus Blessing - Agility Blessing - Tenacity Blessing$/i,
  // Wisdom of The Gods (tree).
  boonClick: /^Click the Trait Skill to cast God's Boon$/i,
  boonBase: /^God's Boon: Consumes all Focus Blessings to grant self God's Boon\. Cooldown: ([\d.]+) ?s$/i,
  boonMax: /^\+(\d+(?:\.\d+)?)% additional damage if God's Boon consumes max stacks of Focus Blessing\. Lasts for ([\d.]+) ?s$/i,
  boonAuto: /^Automatically try to use God's Boon when Focus Blessing is at max stacks$/i,
  boonArea: /^\+(\d+(?:\.\d+)?)% Skill Area for each stack of Focus Blessing consumed by God's Boon\. Lasts for \+?([\d.]+) ?s\. Stacks up to (\d+) time\(s\)$/i,
  revelation: /^\+(\d+(?:\.\d+)?)% additional damage while having Tenacity Blessing, Agility Blessing, and Focus Blessing$/i,
  revelationTalents: /^Replaces some Talents on the No\. 4 activated Talent Panel/i,
  justiceShare: /^The biggest max stack bonus of Agility Blessing or Tenacity Blessing is also applied to the max stack bonus of Focus Blessing$/i,
  boonCdr: new RegExp(`^${NUM}% additional Cooldown Recovery Speed for God's Boon$`, "i"),
  punishment: /^Deals Lucky Damage and \+(\d+(?:\.\d+)?)% additional Max Damage per stack of Agility Blessing when the number of Agility Blessing stacks equals the number of Focus Blessing stacks$/i,
  reincarnation: /^\+(\d+(?:\.\d+)?)% additional damage for each stack of Focus Blessing that God's Boon consumes\. Lasts for ([\d.]+) ?s\. Stacks up to (\d+) time\(s\)$/i,
  farewell: /^\+(\d+(?:\.\d+)?)% Double Damage Chance for each stack of Focus Blessing that God's Boon consumes\. Lasts for ([\d.]+) ?s\. Stacks up to (\d+) time\(s\)$/i,
  quadruple: /^For every 1% overflown Double Damage Chance, there is a 1% chance to deal Quadruple Damage instead$/i,
  purity: /^Buffs gained from God's Boon can stack (\d+) additional time$/i,
  oracle: /^During God's Boon, Tenacity Blessing and Agility Blessing gain an additional effect: \+(\d+(?:\.\d+)?)% additional damage$/i,
  oracleCap: /^\+(\d+) to Max (Agility|Focus|Tenacity) Blessing Stacks$/i,
  // Incarnation of the Gods.
  realmCast: /^Click the Trait Skill to use Divine Realm on the closest enemy for ([\d.]+) ?s\. Cooldown: ([\d.]+) ?s$/i,
  realmDamage: /^\+(\d+(?:\.\d+)?)% additional damage for every stack of Blessing when the Divine Realm is active\. Stacks up to (\d+) time\(s\)$/i,
  convertOutside: /^Converts all Tenacity Blessing to Agility Blessing when outside the Divine Realm$/i,
  convertInside: /^Converts all Agility Blessing to Tenacity Blessing when within the Divine Realm$/i,
  transferOutside: /^The increase\/decrease of max Tenacity Blessing stacks is also applied to Agility Blessing when you're outside of the Divine Realm\.?$/i,
  transferInside: /^The increase\/decrease of max Agility Blessing stacks is also applied to Tenacity Blessing when you're within the Divine Realm\.?$/i,
  realmMoon: /^\+(\d+(?:\.\d+)?)% additional damage for every stack of Tenacity Blessing or Agility Blessing\. Stacks up to (\d+)%? time\(s\)$/i,
  realmArea: /additional Divine Realm Skill Area for every \+1 to the max stacks of any Blessing\. Stacks up to \d+ time\(s\)$/i,
  prepare: /^Every ([\d.]+) ?s, Prepares Divine Realm\. Prioritizes triggering Divine Realm on the (?:nearest|farthest) enemy$/i,
  tenacious: /^When Tenacity Blessing is at least at (\d+) stack\(s\), \+(\d+(?:\.\d+)?)% additional damage\. When Tenacity Blessing is at least at (\d+) stack\(s\), this effect becomes: Deals \+(\d+(?:\.\d+)?)% additional damage to enemies at Low Life for every stack of Tenacity Blessing\. Stacks up to (\d+) time\(s\)$/i,
  agile: /^When Agility Blessing is at least at (\d+) stack\(s\), \+(\d+(?:\.\d+)?)% additional Attack and Cast Speed\. When Agility Blessing is at least at (\d+) stack\(s\), this effect becomes: When at Low Life, \+(\d+(?:\.\d+)?)% additional damage for every stack of Agility Blessing\. Stacks up to (\d+) time\(s\)$/i,
  mightSpeed: /^(\d+(?:\.\d+)?)% additional Attack and Cast Speed for every stack of any Blessing owned when outside the Divine Realm, up to an additional \+(\d+(?:\.\d+)?)%$/i,
  mightDamage: /^(\d+(?:\.\d+)?)% additional damage for every stack of any Blessing owned when outside the Divine Realm, up to an additional \+(\d+(?:\.\d+)?)%$/i,
  mightTaken: /additional damage taken for every stack of any blessing owned while within area of Divine Realm, up to -?\d+(?:\.\d+)?%$/i,
  powerInside: /^When in the Divine Realm, \+(\d+(?:\.\d+)?)% additional damage to enemies in the Divine Realm$/i,
  powerSpeed: /^\+(\d+(?:\.\d+)?)% Attack and Cast Speed when outside the Divine Realm while the Divine Realm is active$/i,
  powerKill: /^When defeating an enemy outside the Divine Realm while the Divine Realm is active/i,
  powerRefresh: /^When there are no enemies in the Divine Realm, refreshes the cooldown of Divine Realm$/i,
  deem: /^Upon inflicting damage, deem this enemy to be at Low Life for ([\d.]+) ?s\. This effect's Cooldown for the same enemy: ([\d.]+) ?s$/i,
  realmEnemy: /^\+(\d+(?:\.\d+)?)% additional damage to enemies in the Divine Realm$/i,
  crossing: /^\+(\d+) to max stacks of all Blessings while outside the Divine Realm$/i,
  // Blasphemer.
  desecrationClick: /^Click the Trait Skill to inflict Desecration on the enemy with the highest rarity within ([\d.]+) ?m\. Cooldown: ([\d.]+) ?s\. Inflicts one-third of the max stacks each time \(rounded up\)$/i,
  desecrationConvert: /^Converts the effects of affixes that increase Max Blessings Stacks into effects that reduce Max Blessings Stacks and increase Max Desecration Stacks\. Increases Max Desecration Stacks by up to (\d+) for each type of Blessings$/i,
  desecrationTrigger: /^Triggers the Trait Skill and ignores its cooldown when gaining any Blessing\. Interval: ([\d.]+) ?s$/i,
  elitesOnly: /^Desecration only affects Elites$/i,
  pawn: /^When there are no other enemies within ([\d.]+) ?m of the Desecrated target, the target gains Sacrificial Pawn$/i,
  spread: /^Up to \d+ Elites within [\d.]+ ?m of a Desecrated target will also be inflicted with Desecration$/i,
  sageSpeed: /^\+(\d+(?:\.\d+)?)% Attack and Cast Speed when dealing damage to a Desecrated target\. Lasts ([\d.]+) ?s\. This effect cannot stack$/i,
  onsetTrue: /^When inflicting Desecration on an Elite for the first time, deals True Damage equal to (\d+(?:\.\d+)?)% of Max Life$/i,
  onsetMountain: /^When a Desecrated target is under a crowd control effect, the target gains Mountain of Sins$/i,
  extremeCap: /^If the Max Blessings Stacks are further increased when the max stacks of all Blessings are 0, converts the effects of their affixes into effects that increase Max Desecration Stacks\. Desecration stacks up to (\d+) times$/i,
  extremeLife: /^Desecration gains an additional base effect: (\d+(?:\.\d+)?)% additional Erosion Damage taken for every (\d+(?:\.\d+)?)% of Life the target loses$/i,
  shrineSelf: /^Inflicts Desecration on yourself when inflicting Desecration on enemies$/i,
  shrineDamage: /^\+(\d+(?:\.\d+)?)% additional Erosion Damage when you have Desecration$/i
});
const WISDOM_KEYS = ["cycle", "boonClick", "boonBase", "boonMax", "boonAuto", "boonArea", "revelation", "revelationTalents", "justiceShare", "boonCdr", "punishment", "reincarnation", "farewell", "quadruple", "purity", "oracle", "oracleCap"];
const INCARNATION_KEYS = ["cycle", "realmCast", "realmDamage", "convertOutside", "convertInside", "transferOutside", "transferInside", "realmMoon", "realmArea", "prepare", "tenacious", "agile", "mightSpeed", "mightDamage", "mightTaken", "powerInside", "powerSpeed", "powerKill", "powerRefresh", "deem", "realmEnemy", "crossing"];
const BLASPHEMER_KEYS = ["cycle", "desecrationClick", "desecrationConvert", "desecrationTrigger", "elitesOnly", "pawn", "spread", "sageSpeed", "onsetTrue", "onsetMountain", "extremeCap", "extremeLife", "shrineSelf", "shrineDamage"];
const KEYS = { [WISDOM]: WISDOM_KEYS, [INCARNATION]: INCARNATION_KEYS, [BLASPHEMER]: BLASPHEMER_KEYS };
// Revived (memory) lines the module reads: The Place of Oracle (+ its three Blessing variants), Crossing the Divine Threshold's
// Blessing line, Inverted Shrine.
export const THEA_REVIVED_KEYS = new Set(["oracle", "oracleCap", "crossing", "shrineSelf", "shrineDamage"]);

/** The clause key a Thea line is for this loadout, or null. */
export function theaClauseKey(heroId, text) {
  const keys = KEYS[heroId];
  if (!keys) return null;
  const clean = cleanThea(text);
  return keys.find((key) => THEA_PATTERNS[key].test(clean)) || null;
}
/** Whether a revived (memory) line of this loadout is read here. */
export const theaRevivedLine = (heroId, text) => THEA_REVIVED_KEYS.has(theaClauseKey(heroId, text));

const linesOf = (modifierTexts, heroId) => modifierTexts.filter((line) => line && line.origin !== "derived" && !line.lineEffect && (line.origin === "trait" || (line.origin === "memory" && theaRevivedLine(heroId, line.text)))).map((line) => ({ ...line, clean: cleanThea(line.text) }));
const matchesOf = (lines, pattern) => lines.map((line) => ({ line, match: line.clean.match(pattern) })).filter((item) => item.match);
const firstOf = (lines, pattern) => matchesOf(lines, pattern)[0] || null;

/**
 * The Blessing model's Thea inputs (before src/blessing-model.js calculateBlessings), or null for any other hero.
 * @returns {{ lines: { text, source }[], capRules: object }|null}
 */
export function theaBlessingInputs({ heroId = "", modifierTexts = [], requestedConditions = {} } = {}) {
  if (!THEA_HEROES.has(heroId)) return null;
  const lines = linesOf(modifierTexts, heroId);
  const P = THEA_PATTERNS;
  const cycle = firstOf(lines, P.cycle);
  const extra = [];
  // Q-H3: one Divine Blessing every 2 s in turn, so each type gains a stack every 3 × 2 s ("Timed gain": held at max stacks).
  // Each type's phase in the loop (Split 879174: Focus at 0, Agility 2 s later, Tenacity 2 s after that): its layers' steady pattern.
  if (cycle) CYCLE.order.forEach((name, index) => extra.push({ text: `Gains a stack of ${name} Blessing every ${round(Number(cycle.match[1]) * CYCLE.order.length)} s`, source: CYCLE_SOURCE, phaseSeconds: round(Number(cycle.match[1]) * index) }));
  // The Place of Oracle: Agility / Focus / Tenacity (revived, Wisdom of The Gods only: src/hero-exclusive-revivals.js).
  if (heroId === WISDOM) for (const { line, match } of matchesOf(lines.filter((item) => item.origin === "memory"), P.oracleCap)) extra.push({ text: `+${match[1]} to Max ${match[2]} Blessing Stacks`, source: line.source });
  const capRules = {};
  if (heroId === WISDOM && firstOf(lines, P.justiceShare)) capRules.shareBiggest = { to: "Focus", from: ["Agility", "Tenacity"], source: firstOf(lines, P.justiceShare).line.source };
  if (heroId === INCARNATION) {
    const realm = realmBasics(lines, requestedConditions);
    const crossing = firstOf(lines, P.crossing);
    if (realm.outside && crossing) for (const name of CYCLE.order) extra.push({ text: `+${crossing.match[1]} to Max ${name} Blessing Stacks`, source: `${crossing.line.source} (Crossing the Divine Threshold: outside the Divine Realm)` });
    const transfer = firstOf(lines, realm.outside ? P.transferOutside : P.transferInside);
    const convert = firstOf(lines, realm.outside ? P.convertOutside : P.convertInside);
    const [from, to] = realm.outside ? ["Tenacity", "Agility"] : ["Agility", "Tenacity"];
    if (transfer) capRules.transfer = { from, to, source: transfer.line.source };
    if (convert) capRules.convert = { from, to, source: convert.line.source };
  }
  if (heroId === BLASPHEMER) {
    const convert = firstOf(lines, P.desecrationConvert);
    const extreme = firstOf(lines, P.extremeCap);
    if (convert) capRules.invert = { perTypeCap: Number(convert.match[1]), baseDesecration: KEYWORDS.desecration.initialMax, extremeCap: extreme ? Number(extreme.match[1]) : null, source: convert.line.source };
  }
  return { lines: extra, capRules };
}

/**
 * Applies Thea's max-stack rules to the Blessing model's entries (src/blessing-model.js calls it after the cap lines are summed and
 * before the stacks are held). Mutates the entries; returns what it did.
 */
export function applyTheaCapRules(result, rules = {}) {
  const info = { shared: null, transfer: null, convert: null, invert: null };
  if (!rules) return info;
  const bonus = (name) => result[name].maxStacks - result[name].baseMax;
  if (rules.invert) {
    // Blasphemer: each increase to a Blessing's max becomes a decrease (to 0 at most) and +1 Max Desecration Stack, up to the
    // per-type cap; Extreme Desecration converts the rest once every Blessing's max is 0 (up to its cap).
    const perType = [];
    for (const name of Object.keys(result)) {
      const entry = result[name];
      const increases = entry.capSources.filter((line) => line.value > 0).reduce((sum, line) => sum + line.value, 0);
      const decreases = entry.capSources.filter((line) => line.value < 0).reduce((sum, line) => sum + line.value, 0);
      const before = Math.max(0, entry.baseMax + decreases);
      const converted = Math.min(rules.invert.perTypeCap, increases, before);
      entry.maxStacks = Math.max(0, before - increases);
      for (const line of entry.capSources.filter((item) => item.value > 0)) line.invertedBy = "Blasphemer: increases to Max Blessing Stacks reduce them and raise Max Desecration Stacks";
      perType.push({ name, increases, converted, rest: Math.max(0, increases - converted), max: entry.maxStacks });
    }
    const allZero = perType.every((item) => item.max === 0);
    const extremeExtra = rules.invert.extremeCap != null && allZero ? perType.reduce((sum, item) => sum + item.rest, 0) : 0;
    const raw = rules.invert.baseDesecration + perType.reduce((sum, item) => sum + item.converted, 0) + extremeExtra;
    info.invert = { perType, allZero, extremeExtra, desecrationMax: rules.invert.extremeCap != null ? Math.min(rules.invert.extremeCap, raw) : raw, extremeCap: rules.invert.extremeCap, source: rules.invert.source };
  }
  if (rules.transfer) {
    const change = bonus(rules.transfer.from);
    if (change) { result[rules.transfer.to].maxStacks += change; result[rules.transfer.to].capSources.push({ source: rules.transfer.source, text: `${rules.transfer.from} Blessing's max-stack change also applies to ${rules.transfer.to} Blessing`, value: change, transferred: true }); }
    info.transfer = { ...rules.transfer, change };
  }
  if (rules.shareBiggest) {
    const biggest = Math.max(0, ...rules.shareBiggest.from.map(bonus));
    if (biggest) { result[rules.shareBiggest.to].maxStacks += biggest; result[rules.shareBiggest.to].capSources.push({ source: rules.shareBiggest.source, text: `the biggest max-stack bonus of ${rules.shareBiggest.from.join(" or ")} Blessing also applies to ${rules.shareBiggest.to} Blessing`, value: biggest, transferred: true }); }
    info.shared = { ...rules.shareBiggest, value: biggest };
  }
  if (rules.convert) info.convert = { ...rules.convert };
  return info;
}

// The Divine Realm's cast and the player's position (Incarnation of the Gods). Split 944929: an 8 s area on tag 5100310, cooldown 4 s.
function realmBasics(lines, requestedConditions = {}, facts = {}) {
  const P = THEA_PATTERNS;
  const cast = firstOf(lines, P.realmCast);
  const prepares = matchesOf(lines, P.prepare).map(({ line, match }) => ({ source: line.source, everySeconds: Number(match[1]) }));
  const pressed = requestedConditions.traitSkillOnCooldown !== false;
  const active = Boolean(cast) && (pressed || prepares.length > 0);
  const durationSeconds = (cast ? Number(cast.match[1]) : 8) * skillDurationOf(facts), cooldownSeconds = HEADER_COOLDOWNS.divineRealm / cooldownSpeedOf(facts);
  const uptime = active ? Math.min(1, durationSeconds / cooldownSeconds) : 0;
  const inside = active && requestedConditions[INSIDE_REALM_CONDITION] === true;
  return { cast: Boolean(cast), pressed, prepares, active, durationSeconds, cooldownSeconds, uptime, inside, outside: !inside };
}

/** Focus stacks after a God's Boon at b: 0 for 6 s, then +1 per 6 s up to max, held at max until the next God's Boon. */
export function focusAfterBoon(sinceBoon, { maxStacks, periodSeconds, refillSeconds = 6 }) {
  if (!(maxStacks > 0)) return 0;
  const s = ((sinceBoon % periodSeconds) + periodSeconds) % periodSeconds;
  return Math.min(maxStacks, Math.floor(s / refillSeconds + EPS));
}

/**
 * The Focus the cycle's layers can reach: ⌈D ÷ 6 s⌉ gains live at once at most (each its own D s from its own gain). God's Boon at max Focus is
 * reachable from the cycle alone only when that reaches the max.
 */
export const cycleFocusPeak = (durationSeconds = BASE_BLESSING_SECONDS, perStackSeconds = 6) => Math.max(0, Math.ceil(durationSeconds / perStackSeconds - EPS));

// The God's Boon cycle on whole frames with layered Focus (each gain its own D s; the oldest out at the cap): a Focus gain every 6 s; God's Boon
// fires on the first frame Focus is at max and its cooldown is ready (the auto-cast or the Trait Skill best case), consumes every layer and starts
// its cooldown. Own buffs built: the steady layers at t = 0 (gains at −6 s, −12 s, … still live). The long-run figures read the second half of a
// 600 s run.
const SIM_FPS = 30, SIM_SECONDS = 600;
function layeredBoonCycle({ F, cooldownSeconds, prebuilt, buffSeconds, perStackSeconds, durationSeconds }) {
  const total = SIM_SECONDS * SIM_FPS, every = Math.max(1, Math.round(perStackSeconds * SIM_FPS)), life = Math.max(1, Math.ceil(durationSeconds * SIM_FPS - EPS)), cooldown = Math.max(1, Math.round(cooldownSeconds * SIM_FPS));
  let layers = [];
  if (prebuilt) for (let k = 1; k * every < life && layers.length < F; k++) layers.unshift(-k * every + life);
  const focus = new Uint8Array(total), boons = [];
  let ready = 0;
  for (let frame = 0; frame < total; frame++) {
    layers = layers.filter((end) => frame < end);
    if (frame % every === 0) { if (layers.length >= F) layers.shift(); layers.push(frame + life); }
    if (layers.length >= F && frame >= ready) { boons.push(frame); layers = []; ready = frame + cooldown; }
    focus[frame] = layers.length;
  }
  if (boons.length < 2) return null;
  // The steady window: whole God's Boon periods in the second half of the run (from its first God's Boon to its last).
  const steadyBoons = boons.filter((frame) => frame >= total / 2);
  const from = steadyBoons.length >= 2 ? steadyBoons[0] : boons[boons.length - 2], to = steadyBoons.length >= 2 ? steadyBoons[steadyBoons.length - 1] : boons[boons.length - 1];
  const half = from, end = to, span = end - half;
  let sum = 0, buffed = 0, lastEnd = -1;
  const buffFrames = Math.round(buffSeconds * SIM_FPS);
  for (let frame = half; frame < end; frame++) sum += focus[frame];
  for (const boon of boons) { const start = Math.max(half, boon, lastEnd), stop = Math.min(end, boon + buffFrames); if (stop > start) buffed += stop - start; lastEnd = Math.max(lastEnd, boon + buffFrames); }
  // The mean gap between God's Boons (a cooldown off the 6 s grid makes the gaps uneven).
  const periodSeconds = span / Math.max(1, steadyBoons.length >= 2 ? steadyBoons.length - 1 : 1) / SIM_FPS;
  const focusAt = (t) => focus[Math.max(0, Math.min(total - 1, Math.floor(t * SIM_FPS + EPS)))];
  const edges = new Set([0]);
  for (let frame = 1; frame < Math.min(total, HORIZON_SECONDS * SIM_FPS); frame++) if (focus[frame] !== focus[frame - 1]) edges.add(round(frame / SIM_FPS));
  for (const boon of boons) if (boon < HORIZON_SECONDS * SIM_FPS) { edges.add(round(boon / SIM_FPS)); edges.add(round(boon / SIM_FPS + buffSeconds)); }
  const times = [...edges].filter((time) => time >= 0 && time < HORIZON_SECONDS).sort((a, b) => a - b);
  // The share of the steady half where test(Focus, t) holds (t for a type on its own clock, Prophecy of Punishment's Agility).
  const steadyShare = (test) => { let hits = 0; for (let frame = half; frame < end; frame++) if (test(focus[frame], (frame + 0.5) / SIM_FPS)) hits++; return hits / span; };
  const steadyMean = (fn) => { let value = 0; for (let frame = half; frame < end; frame++) value += fn(focus[frame], (frame + 0.5) / SIM_FPS); return value / span; };
  return { maxFocus: F, cooldownSeconds: round(cooldownSeconds), refillSeconds: perStackSeconds * F, periodSeconds: round(periodSeconds), averageFocus: sum / span, firstBoonSeconds: round(boons[0] / SIM_FPS),
    uptime: buffed / span, buffSeconds, instantRefill: false, prebuilt, focusAt, times, layered: true, durationSeconds, steadyShare, steadyMean };
}

/**
 * God's Boon's cadence and the Focus it consumes (Q-H3).
 * @param {object} p
 * @param {number} p.maxFocus Focus Blessing's max stacks
 * @param {number} p.cooldownSeconds God's Boon's cooldown after its Cooldown Recovery Speed
 * @param {boolean} p.instantRefill another Focus gain source holds Focus at max
 * @param {boolean} p.prebuilt own buffs built before engaging
 * @param {number} p.buffSeconds the God's Boon buffs' duration
 * @param {number} p.durationSeconds Focus Blessing's duration (its layers' timer; 10 s × Blessing Duration)
 * @param {boolean} p.layered each Focus gain its own layer and timer (default; user decision 2026-11-04). false: the game manual's
 *   refresh-all reading (every gain refreshes every stack), kept for comparison
 * @returns {object|null} null when God's Boon never fires: no max Focus, or the cycle's layers never reach it (layered)
 */
export function godsBoonCycle({ maxFocus, cooldownSeconds, instantRefill = false, prebuilt = true, buffSeconds = KEYWORDS.godsBoon.buffSeconds, perStackSeconds = 6, durationSeconds = BASE_BLESSING_SECONDS, layered = true } = {}) {
  const F = Math.max(0, Math.floor(maxFocus || 0));
  if (!F) return null;
  if (layered && !instantRefill) return cycleFocusPeak(durationSeconds, perStackSeconds) >= F ? layeredBoonCycle({ F, cooldownSeconds, prebuilt, buffSeconds, perStackSeconds, durationSeconds }) : null;
  const refillSeconds = instantRefill ? 0 : perStackSeconds * F;
  const periodSeconds = Math.max(cooldownSeconds, refillSeconds, EPS);
  const averageFocus = instantRefill ? F : (3 * F * (F - 1) + F * (periodSeconds - perStackSeconds * F)) / periodSeconds;
  const firstBoonSeconds = prebuilt || instantRefill ? 0 : perStackSeconds * (F - 1);
  const uptime = Math.min(1, buffSeconds / periodSeconds);
  // Focus over the windows: before the first God's Boon (own buffs not built) Focus ramps from 1 at t = 0.
  const focusAt = (t) => instantRefill ? F : t < firstBoonSeconds - EPS ? Math.min(F, 1 + Math.floor(t / perStackSeconds + EPS)) : focusAfterBoon(t - firstBoonSeconds, { maxStacks: F, periodSeconds, refillSeconds: perStackSeconds });
  const edges = new Set([0]);
  for (let t = 0; t < HORIZON_SECONDS; t += perStackSeconds) edges.add(round(t));
  for (let b = firstBoonSeconds; b < HORIZON_SECONDS; b += periodSeconds) { edges.add(round(b)); for (let k = 1; k <= F; k++) edges.add(round(b + k * perStackSeconds)); edges.add(round(b + buffSeconds)); }
  const times = [...edges].filter((time) => time >= 0 && time < HORIZON_SECONDS).sort((a, b) => a - b);
  return { maxFocus: F, cooldownSeconds: round(cooldownSeconds), refillSeconds, periodSeconds: round(periodSeconds), averageFocus, firstBoonSeconds, uptime, buffSeconds, instantRefill, prebuilt, focusAt, times };
}

/** A piecewise-constant schedule ("steps", src/timed-effects.js) of `levelAt` over the given edge times. */
export function stepsFrom(levelAt, times) {
  const points = [];
  const sorted = [...new Set(times)].sort((a, b) => a - b);
  for (let index = 0; index < sorted.length; index++) {
    const next = sorted[index + 1] ?? HORIZON_SECONDS;
    const level = round(levelAt((sorted[index] + next) / 2));
    if (!points.length || points[points.length - 1][1] !== level) points.push([sorted[index], level]);
  }
  return points;
}

/** The long-run share of one God's Boon period where `test(focus)` holds (Focus after the Boon). */
function focusShare(cycle, test) {
  if (!cycle) return 0;
  if (cycle.instantRefill) return test(cycle.maxFocus) ? 1 : 0;
  if (cycle.steadyShare) return cycle.steadyShare((focus) => test(focus));
  const steps = 2000;
  let hits = 0;
  for (let index = 0; index < steps; index++) if (test(focusAfterBoon((index + 0.5) / steps * cycle.periodSeconds, { maxStacks: cycle.maxFocus, periodSeconds: cycle.periodSeconds }))) hits++;
  return hits / steps;
}

/**
 * Desecration stacks on the clean dummy t s after engagement: ⌈max ÷ 3⌉ per application, every `interval` s from t = 0. Each layer keeps
 * its own duration from its own application (buff 82127, subtype 2: layers on their own timers, no refresh; SS14 client), so the held
 * stacks are the applications in (t − duration, t], capped at max (the oldest replaced).
 */
export function desecrationStacksAt(t, { maxStacks, perApplication, intervalSeconds, durationSeconds = KEYWORDS.desecration.durationSeconds }) {
  if (!(t >= -EPS) || !(maxStacks > 0) || !(intervalSeconds > 0)) return 0;
  const last = Math.floor(t / intervalSeconds + EPS);
  let applications = 0;
  for (let k = last; k >= 0 && t - k * intervalSeconds < durationSeconds - EPS; k -= 1) applications += 1;
  return Math.min(maxStacks, perApplication * applications);
}

/** The steady mean of `f(stacks)` over one application period, past the first duration (own-timer layers). */
function desecrationSteadyMean(spec, f, durationSeconds = KEYWORDS.desecration.durationSeconds) {
  const start = Math.ceil(durationSeconds / spec.intervalSeconds + 1) * spec.intervalSeconds, steps = 2000;
  let total = 0;
  for (let index = 0; index < steps; index++) total += f(desecrationStacksAt(start + (index + 0.5) / steps * spec.intervalSeconds, spec, durationSeconds));
  return total / steps;
}

/**
 * Thea's state for the selected loadout, or null for any other hero.
 * @param {object} p
 * @param {string} p.heroId
 * @param {object[]} p.modifierTexts the build's lines
 * @param {object} p.requestedConditions best-case switches (traitSkillOnCooldown, theaInsideRealm, prebuiltSelfBuffs)
 * @param {object|null} p.blessings the Blessing model's result with Thea's inputs (src/blessing-model.js calculateBlessings)
 * @param {object} p.facts { anyDamage, life ("low" | "full"), enemyCrowdControl: [names] }
 */
export function theaState({ heroId = "", modifierTexts = [], requestedConditions = {}, blessings = null, facts = {} } = {}) {
  if (!THEA_HEROES.has(heroId)) return null;
  const lines = linesOf(modifierTexts, heroId);
  const P = THEA_PATTERNS;
  const cycleLine = firstOf(lines, P.cycle);
  const entries = Object.fromEntries((blessings?.entries || []).map((entry) => [entry.name, entry]));
  const held = (name) => entries[name]?.stacks || 0;
  const maxOf = (name) => entries[name]?.maxStacks ?? 4;
  const prebuilt = requestedConditions.prebuiltSelfBuffs !== false;
  const traitPressed = requestedConditions.traitSkillOnCooldown !== false;
  const anyDamage = facts.anyDamage !== false;
  const dealsErosion = facts.dealsErosion !== false;
  const state = { heroId, cycle: Boolean(cycleLine), cycleSource: cycleLine?.line.source || null, prebuilt, traitPressed, anyDamage, dealsErosion,
    blessings: Object.fromEntries(CYCLE.order.map((name) => [name, { stacks: round(held(name)), maxStacks: maxOf(name), baseMax: entries[name]?.baseMax ?? 4, effect: entries[name]?.effectMultiplier ?? 1, perStackDamage: entries[name]?.baseEffect?.additionalDamagePerStack ?? 0, capSources: (entries[name]?.capSources || []).map((line) => ({ source: line.source, text: line.text, value: line.value })), otherGain: (entries[name]?.gainSources || []).some((source) => source.available && source.source !== CYCLE_SOURCE), ...layerFields(entries[name]) }])),
    thea: blessings?.thea || null };
  if (heroId === WISDOM) state.wisdom = wisdomState(lines, state, { ...facts, modifierTexts });
  if (heroId === INCARNATION) state.incarnation = incarnationState(lines, state, requestedConditions, { ...facts, enemyLowLifeLines: modifierTexts.filter((line) => line && line.origin !== "derived" && !line.lineEffect && /against Low Life enemies$/i.test(cleanThea(line.text))).length });  if (heroId === BLASPHEMER) state.blasphemer = blasphemerState(lines, state, facts);
  return state;
}

// A type's layers (src/blessing-model.js entry.layers, blessing-layer-timers): its duration, its stacks over time in the steady cycle (every gain
// periodic: the layers of its streams, + its owned stacks), else held at its stacks; its peak.
function layerFields(entry) {
  const layers = entry?.layers;
  const durationSeconds = layers?.durationSeconds ?? BASE_BLESSING_SECONDS;
  if (!entry || entry.convertedTo || !(entry.stacks > 0)) return { durationSeconds, layered: layers?.reading || null, peak: 0, low: 0, stacksAt: () => 0 };
  if (layers?.reading === "periodic" && !entry.consumedBy) {
    const own = entry.ownStacks || 0;
    return { durationSeconds, layered: "periodic", peak: layers.peak + own, low: layers.low + own, stacksAt: (t) => layerStacksAt(t, layers.streams, durationSeconds, layers.maxStacks) + own };
  }
  const held = entry.stacks;
  return { durationSeconds, layered: layers?.reading || null, peak: held, low: held, stacksAt: () => held };
}

// The steady time average of fn(t) over 60 s of whole frames (the cycle's streams repeat every 6 s).
const MEAN_SECONDS = 60;
function timeMean(fn) {
  const frames = MEAN_SECONDS * 30;
  let total = 0;
  for (let frame = 0; frame < frames; frame++) total += fn((frame + 0.5) / 30);
  return total / frames;
}

function wisdomState(lines, state, facts) {
  const P = THEA_PATTERNS;
  const base = firstOf(lines, P.boonBase), auto = firstOf(lines, P.boonAuto), maxLine = firstOf(lines, P.boonMax);
  const cdr = matchesOf(lines, P.boonCdr).map(({ line, match }) => ({ source: line.source, value: Number(match[1]) * (line.multiplier ?? 1) }));
  const baseCooldown = base ? Number(base.match[1]) : 15;
  // Split 349699's 15 s ÷ attr 6007 read with the skill's tags: the plain Cooldown Recovery Speed lines with the God's Boon lines (mod 4).
  const cooldownSeconds = baseCooldown / cooldownSpeedOf(facts, cdr.map((item) => item.value));
  const focus = state.blessings.Focus;
  // God's Boon is cast at max Focus by its own auto-cast (or by the Trait Skill best case: pressed at max Focus).
  const cast = Boolean(base) && (Boolean(auto) || state.traitPressed) && focus.maxStacks > 0 && (state.cycle || focus.otherGain);
  // Each Focus stack keeps its own timer (blessing-layer-timers): from the cycle alone Focus reaches at most ⌈D ÷ 6 s⌉, so God's Boon at max Focus
  // fires only when that reaches the max (or another gain source holds Focus).
  const peak = cycleFocusPeak(focus.durationSeconds);
  const unreachable = cast && !focus.otherGain && peak < focus.maxStacks ? `Focus Blessing never reaches its max (${focus.maxStacks}) from the Divine Blessing cycle: each stack keeps its own ${round(focus.durationSeconds)} s from its own gain, so at most ⌈${round(focus.durationSeconds)} s ÷ 6 s⌉ = ${peak} are held (layers on their own timers, SS14 client; open question blessing-layer-timers)` : null;
  // Buffs 82113, 82114 and 82115 carry tag 5100310: Skill Effect Duration reaches their 10 s.
  const cycle = cast ? godsBoonCycle({ maxFocus: focus.maxStacks, cooldownSeconds, instantRefill: focus.otherGain, prebuilt: state.prebuilt, buffSeconds: (maxLine ? Number(maxLine.match[2]) : KEYWORDS.godsBoon.buffSeconds) * skillDurationOf(facts), durationSeconds: focus.durationSeconds }) : null;
  const purity = firstOf(lines, P.purity);
  const consumed = cycle ? cycle.maxFocus : 0;
  // Each God's Boon adds min(Focus consumed, p2) stacks to a buff of up to 30, whose stacks share one timer (mode 1, as the Blessings), and
  // the line reads min(stacks, p2); Prophecy of Purity (label 3050347) reads p2 × 2. So when a God's Boon lands inside the last one's
  // buffs the stacks pile up to the read cap; with no overlap one God's Boon's stacks are all there are.
  const overlaps = Boolean(cycle) && cycle.periodSeconds <= cycle.buffSeconds + EPS;
  const stackBuff = (pattern) => {
    const found = firstOf(lines, pattern);
    if (!found) return null;
    const per = Number(found.match[1]), seconds = Number(found.match[2]), cap = Number(found.match[3]);
    const perCast = Math.min(cap, consumed), readCap = purity ? cap * 2 : cap, stacks = overlaps && perCast > 0 ? readCap : perCast;
    return { per, seconds, cap, capWithPurity: readCap, perCast, stacks, percent: round(per * stacks), purityRaises: Boolean(purity) && overlaps && perCast > 0, source: found.line.source };
  };
  const reincarnation = stackBuff(P.reincarnation), farewell = stackBuff(P.farewell);
  const area = (() => { const found = firstOf(lines, P.boonArea); return found ? { per: Number(found.match[1]), cap: Number(found.match[3]), stacks: Math.min(Number(found.match[3]), consumed) } : null; })();
  const oracle = (() => {
    const found = firstOf(lines, P.oracle);
    if (!found) return null;
    const per = Number(found.match[1]);
    const percent = per * (state.blessings.Tenacity.stacks * state.blessings.Tenacity.effect + state.blessings.Agility.stacks * state.blessings.Agility.effect);
    return { per, percent: round(percent), tenacity: state.blessings.Tenacity.stacks, agility: state.blessings.Agility.stacks, source: found.line.source };
  })();
  const revelation = (() => {
    const found = firstOf(lines, P.revelation);
    if (!found) return null;
    const others = state.blessings.Agility.stacks > 0 && state.blessings.Tenacity.stacks > 0;
    // All three held at once, over time (each type on its own layers; Focus from the God's Boon cycle when it fires).
    const A = state.blessings.Agility.stacksAt, T = state.blessings.Tenacity.stacksAt;
    const share = !others ? 0 : cycle?.steadyShare ? cycle.steadyShare((f, t) => f > 0 && A(t) > 0 && T(t) > 0) : cycle ? focusShare(cycle, (f) => f > 0) * timeMean((t) => A(t) > 0 && T(t) > 0 ? 1 : 0) : timeMean((t) => focus.stacksAt(t) > 0 && A(t) > 0 && T(t) > 0 ? 1 : 0);
    return { percent: Number(found.match[1]), share: round(share), others, source: found.line.source };
  })();
  const punishment = (() => {
    const found = firstOf(lines, P.punishment);
    if (!found) return null;
    // Focus and Agility each on their own layers (blessing-layer-timers): the share of time they are equal, and the Agility held then.
    const A = state.blessings.Agility.stacksAt;
    const equal = (f, t) => (Math.abs(f - A(t)) < EPS ? 1 : 0);
    const share = cycle?.steadyShare ? cycle.steadyShare((f, t) => equal(f, t) === 1) : cycle ? timeMean((t) => equal(cycle.maxFocus, t)) : timeMean((t) => equal(focus.stacksAt(t), t));
    const agilityWhenEqual = cycle?.steadyMean ? cycle.steadyMean((f, t) => equal(f, t) * A(t)) : cycle ? timeMean((t) => equal(cycle.maxFocus, t) * A(t)) : timeMean((t) => equal(focus.stacksAt(t), t) * A(t));
    const agility = share > 0 ? round(agilityWhenEqual / share) : Math.round(state.blessings.Agility.stacks);
    return { perStack: Number(found.match[1]), agility, share: round(share), maxDamagePercent: round(Number(found.match[1]) * agilityWhenEqual), source: found.line.source };
  })();
  const quadruple = firstOf(lines, P.quadruple);
  // The build's unscoped Double Damage chance plus Farewell Prophecy's time-averaged share (Quadruple Damage reads the overflow).
  const otherChance = (facts.modifierTexts || []).filter((line) => line && line.origin !== "derived" && !line.lineEffect).reduce((sum, line) => { const rule = classifyDoubleDamageLine(line.text); return sum + (rule && !rule.tags.length && !rule.perStat && !rule.slot ? rule.value * (line.multiplier ?? 1) : 0); }, 0);
  const doubleDamageChancePercent = round(otherChance + (farewell && cycle ? farewell.percent * cycle.uptime : 0));
  return {
    base: Boolean(base), auto: Boolean(auto), cast, unreachable, focusPeak: peak, baseCooldown, cdr, cooldownSeconds: round(cooldownSeconds), cycle,
    boonPercent: maxLine ? Number(maxLine.match[1]) : 0, consumedMax: Boolean(cycle), purity: Boolean(purity), overlaps,
    cooldownBinds: Boolean(cycle) && cooldownSeconds > cycle.refillSeconds + EPS,
    reincarnation, farewell, area, oracle, revelation, punishment, quadruple: Boolean(quadruple), doubleDamageChancePercent,
    justice: state.thea?.shared || null
  };
}

function incarnationState(lines, state, requestedConditions, facts) {
  const P = THEA_PATTERNS;
  const realm = realmBasics(lines, requestedConditions, facts);
  const B = state.blessings;
  const total = B.Focus.stacks + B.Agility.stacks + B.Tenacity.stacks;
  const deemLine = firstOf(lines, P.deem);
  // Recipe 243324064: node 6 with calcIncress: 10 s ÷ Cooldown Recovery Speed. Buff 82139 has no duration tag.
  const deemCooldown = deemLine ? Number(deemLine.match[2]) / cooldownSpeedOf(facts) : 0;
  const deem = deemLine && state.anyDamage ? { seconds: Number(deemLine.match[1]), cooldownSeconds: round(deemCooldown), share: round(Math.min(1, Number(deemLine.match[1]) / deemCooldown)), source: deemLine.line.source } : null;
  const tenaciousLine = firstOf(lines, P.tenacious), agileLine = firstOf(lines, P.agile);
  const tenacious = tenaciousLine ? (() => {
    const [, at, flat, upper, per, cap] = tenaciousLine.match.map(Number);
    const stacks = round(B.Tenacity.stacks);
    // The thresholds read the stacks held at each moment: each stack its own layer (blessing-layer-timers), so a cycle-only Tenacity holds
    // a share of the time at each count; the effect is the time average.
    const T = B.Tenacity.stacksAt;
    const lowShare = timeMean((t) => (T(t) >= upper - EPS ? 1 : 0)), flatShare = timeMean((t) => (T(t) >= at - EPS && T(t) < upper - EPS ? 1 : 0));
    const lowSum = timeMean((t) => (T(t) >= upper - EPS ? per * Math.min(cap, T(t)) : 0));
    const mode = lowShare > 0 ? "lowLife" : flatShare > 0 ? "flat" : "none";
    const lowLifeShare = deem?.share || 0;
    const lowLifePercent = round(lowShare > 0 ? lowSum / lowShare : per * Math.min(cap, stacks));
    return { at, flat, upper, per, cap, stacks, mode, flatShare: round(flatShare), upperShare: round(lowShare), lowLifePercent, lowLifeShare, percent: round(flat * flatShare + lowSum * lowLifeShare), source: tenaciousLine.line.source };
  })() : null;
  const agile = agileLine ? (() => {
    const [, at, speed, upper, per, cap] = agileLine.match.map(Number);
    const stacks = round(B.Agility.stacks);
    // As Tenacious Divinity: the thresholds at each moment, time-averaged (blessing-layer-timers).
    const A = B.Agility.stacksAt;
    const lowShare = timeMean((t) => (A(t) >= upper - EPS ? 1 : 0)), speedShare = timeMean((t) => (A(t) >= at - EPS && A(t) < upper - EPS ? 1 : 0));
    const lowSum = timeMean((t) => (A(t) >= upper - EPS ? per * Math.min(cap, A(t)) : 0));
    const mode = lowShare > 0 ? "lowLife" : speedShare > 0 ? "speed" : "none";
    const lowLife = facts.life === "low";
    return { at, speed, upper, per, cap, stacks, mode, speedShare: round(speedShare), upperShare: round(lowShare), lowLife, speedPercent: round(speed * speedShare), damagePercent: lowLife ? round(lowSum) : 0, source: agileLine.line.source };
  })() : null;
  if (deem) deem.readers = (facts.enemyLowLifeLines || 0) + (tenacious?.mode === "lowLife" ? 1 : 0);
  // `compared`: automatic mode with no pinned position, so the Divine Realm position comparison (src/planner.js exclusiveConditionGroups)
  // evaluates both sides, each with its own conversion line.
  return {
    realm: { ...realm, compared: Boolean(facts.realmCompared) }, total: round(total), deem, tenacious, agile,
    crossing: Boolean(firstOf(lines, P.crossing)),
    convert: state.thea?.convert || null, transfer: state.thea?.transfer || null
  };
}

function blasphemerState(lines, state, facts) {
  const P = THEA_PATTERNS;
  const click = firstOf(lines, P.desecrationClick), trigger = firstOf(lines, P.desecrationTrigger);
  const invert = state.thea?.invert || null;
  const maxStacks = invert ? invert.desecrationMax : KEYWORDS.desecration.initialMax;
  const perApplication = Math.ceil(maxStacks / 3 - EPS);
  // Applications: every Blessing gain (one every 2 s while any Blessing type can hold a stack), or the 5 s cooldown when pressed.
  const gains = state.cycle && Boolean(trigger) && CYCLE.order.some((name) => state.blessings[name].maxStacks > 0);
  const cooldownSeconds = round(HEADER_COOLDOWNS.desecration / cooldownSpeedOf(facts));
  const intervalSeconds = gains ? CYCLE.intervalSeconds : click && state.traitPressed ? cooldownSeconds : null;
  const active = Boolean(click) && intervalSeconds !== null && state.anyDamage && maxStacks > 0;
  const spec = { maxStacks, perApplication, intervalSeconds: intervalSeconds || 0 };
  const factorAt = (n) => (1 + KEYWORDS.desecration.perStackPercent / 100) ** n;
  // Own timers (2026-11-04): the steady stacks and factor are the time means over one application period (each stack its own 5 s).
  const stacks = active ? round(desecrationSteadyMean(spec, (n) => n)) : 0;
  const takenPercent = active ? round((desecrationSteadyMean(spec, factorAt) - 1) * 100) : 0;
  const times = [];
  if (active) for (let t = 0; t < HORIZON_SECONDS; t += intervalSeconds) { times.push(round(t)); times.push(round(t + KEYWORDS.desecration.durationSeconds)); }
  const fullPercent = (factorAt(maxStacks) - 1) * 100;
  // The windows: the multiplicative stack factor as a share of the full-stack factor (level 1 = max stacks held).
  const schedule = active ? { kind: "steps", points: stepsFrom((t) => fullPercent > 0 ? (factorAt(desecrationStacksAt(t, spec)) - 1) * 100 / fullPercent : 0, times), sustained: fullPercent > 0 ? round(takenPercent / fullPercent) : 0 } : null;
  const pawnLine = firstOf(lines, P.pawn);
  const pawn = Boolean(pawnLine) && active;
  const crowdControl = [...new Set([...(facts.enemyCrowdControl || []), ...(pawn ? ["Sacrificial Pawn"] : [])])];
  const mountainLine = firstOf(lines, P.onsetMountain);
  const mountain = Boolean(mountainLine) && active && crowdControl.length > 0;
  const sageLine = firstOf(lines, P.sageSpeed);
  const shrineSelf = Boolean(firstOf(lines, P.shrineSelf)) && active;
  const shrineLine = firstOf(lines, P.shrineDamage);
  return {
    click: Boolean(click), trigger: Boolean(trigger), gains, intervalSeconds, cooldownSeconds, active, maxStacks, perApplication, stacks: round(stacks), takenPercent, fullPercent: round(fullPercent), schedule,
    invert, extreme: invert?.extremeCap != null,
    pawn, pawnPercent: pawn ? KEYWORDS.sacrificialPawn.erosionTakenPercent : 0,
    crowdControl, mountainLine: Boolean(mountainLine), mountain, mountainPercent: mountain ? KEYWORDS.mountainOfSins.erosionResistancePercent : 0,
    sage: sageLine ? { percent: Number(sageLine.match[1]), active } : null,
    shrine: shrineLine ? { percent: Number(shrineLine.match[1]), active: shrineSelf, self: Boolean(firstOf(lines, P.shrineSelf)) } : null
  };
}

/**
 * Mountain of Sins once the crowd control on the dummy is known (src/combat-states.js `crowdControl`, which includes Sacrificial
 * Pawn): a copy of the state with the Blasphemer's crowd control settled. Other loadouts are returned as they are.
 */
export function settleTheaCrowdControl(state, crowdControl = null) {
  const b = state?.blasphemer;
  if (!b || !Array.isArray(crowdControl)) return state;
  const list = [...new Set([...crowdControl, ...(b.pawn ? ["Sacrificial Pawn"] : [])])];
  const mountain = b.active && b.mountainLine && list.length > 0;
  return { ...state, blasphemer: { ...b, crowdControl: list, mountain, mountainPercent: mountain ? KEYWORDS.mountainOfSins.erosionResistancePercent : 0 } };
}

/** The best-case switches this loadout lists (src/hero-trait-modules.js pushes them as timed-effect toggles). */
export function theaSwitches(state) {
  if (!state) return [];
  const out = [];
  const realm = state.incarnation?.realm;
  if (realm?.cast) out.push({ id: "traitSkillOnCooldown", label: "Divine Realm pressed on cooldown (Trait Skill)", enabled: realm.pressed, active: realm.active, summary: `the Divine Realm (${realm.durationSeconds} s, ${realm.cooldownSeconds} s cooldown) on the dummy from t = 0: uptime ${pct(realm.uptime)}%`, reason: realm.active ? (realm.pressed ? "best-case assumption: pressed whenever off cooldown" : "Prepared by a trait: held without pressing") : "the Trait Skill switch is off and no trait Prepares the Divine Realm" });
  const b = state.blasphemer;
  if (b?.click && !b.gains) out.push({ id: "traitSkillOnCooldown", label: "Desecration pressed on cooldown (Trait Skill)", enabled: state.traitPressed, active: b.active, summary: `Desecration every ${b.cooldownSeconds} s on the dummy`, reason: b.active ? "best-case assumption" : "no Blessing gain triggers it and the Trait Skill switch is off" });
  return out;
}

const L = (status, reason, extra = {}) => ({ status, reason, ...extra });
const inCalc = (reason, extra) => L("In calc", reason, extra);
const inactive = (reason, extra) => L("Inactive", reason, extra);
const neutral = (reason, extra) => L("No DPS effect", reason, extra);
const notOnDummy = (reason, extra) => L("Not on dummy", reason, extra);
const notModeled = (reason, extra) => L("Not modeled", reason, extra);
const signed = (value) => `${value >= 0 ? "+" : ""}${round(value)}`;

/**
 * One Thea clause: { key, status, reason, bodies: [derived line texts], timed: [timed effects], group, lucky }, or null when the
 * line is not a Thea clause of this loadout.
 */
export function theaLineRead(heroId, text, state) {
  const key = theaClauseKey(heroId, text);
  if (!key) return null;
  if (!state) return inactive("the loadout's lines are not in the build", { key });
  const read = heroId === WISDOM ? wisdomRead(key, text, state) : heroId === INCARNATION ? incarnationRead(key, text, state) : blasphemerRead(key, text, state);
  return { key, bodies: [], timed: [], group: null, ...read };
}

function cycleRead(state) {
  const B = state.blessings;
  const list = CYCLE.order.map((name) => `${name} ${round(B[name].stacks)} of ${B[name].maxStacks}`).join(", ");
  const used = CYCLE.order.some((name) => B[name].stacks > 0 && B[name].perStackDamage > 0) || B.Agility.stacks > 0;
  return used ? inCalc(`a Divine Blessing every 2 s (Focus → Agility → Tenacity, one stack of each type every 6 s, game file Split 879174), each stack its own layer on its own ${round(B.Focus.durationSeconds ?? BASE_BLESSING_SECONDS)} s timer, refreshing none (SS14 client; open question blessing-layer-timers), so each type holds its gains of the last ${round(B.Focus.durationSeconds ?? BASE_BLESSING_SECONDS)} s, on average (own buffs built): ${list}`) : inactive(`no Blessing holds a stack (${list})`);
}

function wisdomRead(key, text, state) {
  const w = state.wisdom, c = w?.cycle;
  const noBoon = !w?.base ? "God's Boon's line is not in the build" : !c ? (state.blessings.Focus.maxStacks <= 0 ? "Focus Blessing has no max stacks" : w.unreachable ? w.unreachable : "God's Boon is never cast (no auto-cast line and the Trait Skill switch is off)") : "";
  const cadence = c ? `God's Boon every ${c.periodSeconds} s (${c.instantRefill ? `its ${w.cooldownSeconds} s cooldown; Focus held at max by another gain source` : `the first frame Focus is at max (${c.maxFocus}, one Focus layer per 6 s, each its own ${round(c.durationSeconds ?? BASE_BLESSING_SECONDS)} s) with the ${w.cooldownSeconds} s cooldown ready`}; Q-H3, provisional)` : "";
  const boonPeriodic = c ? { kind: "periodic", durationSeconds: c.buffSeconds, periodSeconds: c.periodSeconds, startSeconds: c.firstBoonSeconds } : null;
  const boonTimed = (id, label, percent, reach = "all") => c && percent ? [{ id, label, target: "self", toggle: false, enabled: true, active: true, parts: [{ type: null, reach, percent, schedule: boonPeriodic }] }] : [];
  const uptimeText = c ? `up ${pct(c.uptime)}% of the time (${c.buffSeconds} s every ${c.periodSeconds} s)` : "";
  switch (key) {
    case "cycle": {
      const base = cycleRead(state);
      if (!c || base.status !== "In calc") return base;
      const F = state.blessings.Focus;
      const percent = round(F.perStackDamage * F.effect);
      const timed = percent && !c.instantRefill ? [{ id: "theaFocus", label: "Focus Blessing (God's Boon consumes it)", target: "self", toggle: false, enabled: true, active: true, parts: [{ type: null, reach: "all", percent, schedule: { kind: "steps", points: stepsFrom(c.focusAt, c.times), sustained: c.averageFocus } }] }] : [];
      return inCalc(`${base.reason}; God's Boon consumes Focus: ${c.averageFocus} Focus stacks on average (one layer per 6 s after each God's Boon)`, { timed });
    }
    case "boonClick": return neutral(w?.auto ? "the auto-cast at max Focus (\"Automatically try to use God's Boon\") already casts it; a press before max Focus would consume fewer stacks" : "God's Boon is pressed at max Focus (Trait Skill best case)");
    case "boonBase": return c ? inCalc(`${cadence}: it consumes all ${c.maxFocus} Focus stacks each time${w.cooldownBinds ? " (the cooldown binds)" : ""}`) : inactive(noBoon);
    case "boonMax": {
      if (!c) return inactive(noBoon);
      const value = round(w.boonPercent * c.uptime), body = `+${value}% additional damage`;
      return inCalc(`God's Boon always consumes max Focus (auto-cast at max): +${w.boonPercent}% additional damage ${uptimeText} = ${body} (game data buff 82115; Q-H3, provisional)`, { bodies: value ? [body] : [], timed: boonTimed("theaGodsBoon", "God's Boon", w.boonPercent) });
    }
    case "boonAuto": return !c ? inactive(noBoon) : state.traitPressed ? neutral(`the Trait Skill best case (pressed at max Focus) casts God's Boon as well: ${cadence}`) : inCalc(`with the Trait Skill switch off, the auto-cast still casts God's Boon whenever Focus reaches its max (${c.maxFocus}) and the cooldown is ready: ${cadence}`);
    case "boonArea": return neutral("Skill Area only: the dummy is inside the skills' areas");
    case "revelation": {
      const r = w?.revelation;
      if (!r || !r.share) return inactive(!r ? "Prophecy of Revelation is not in the build" : !r.others ? "Agility or Tenacity Blessing holds no stack" : "Focus Blessing holds no stack");
      const value = round(r.percent * r.share), body = `+${value}% additional damage`;
      const timed = c && !c.instantRefill && r.share < 1 ? [{ id: "theaRevelation", label: "Prophecy of Revelation: all three Blessings", target: "self", toggle: false, enabled: true, active: true, parts: [{ type: null, reach: "all", percent: r.percent, schedule: { kind: "steps", points: stepsFrom((t) => c.focusAt(t) > 0 ? 1 : 0, c.times), sustained: r.share } }] }] : [];
      return inCalc(`all three Blessings held ${pct(r.share)}% of the time (Focus is 0 for 6 s after each God's Boon): +${r.percent}% × ${round(r.share)} = ${body} (provisional)`, { bodies: [body], timed });
    }
    case "revelationTalents": return inCalc("provisional: the 4th activated Talent Panel, when it is a God of Might, Goddess of Hunting or Goddess of Knowledge class tree, has its listed talents replaced (client talent-group table: 48 talents in 12 trees, each by its own record; src/prophecy-of-revelation.js), and every replacement reads like any talent line: see its badge on the panel. Whether the server applies the same list is inferred");
    case "justiceShare": {
      const shared = state.thea?.shared;
      return shared?.value > 0 ? inCalc(`+${shared.value} to Max Focus Blessing Stacks (the biggest of Agility's / Tenacity's max-stack bonus): Focus max ${state.blessings.Focus.maxStacks}`) : inactive("neither Agility nor Tenacity Blessing has a max-stack bonus");
    }
    case "boonCdr": {
      if (!c) return inactive(noBoon);
      return w.cooldownBinds || c.instantRefill ? inCalc(`God's Boon's cooldown ${w.baseCooldown} s → ${w.cooldownSeconds} s sets its cadence: ${cadence}`) : neutral(`the Focus refill (${c.refillSeconds} s) is longer than the cooldown (${w.cooldownSeconds} s), so God's Boon's cadence does not change`);
    }
    case "punishment": {
      const p = w?.punishment;
      if (!p || !p.share) return inactive(!p ? "Prophecy of Punishment is not in the build" : c && !c.instantRefill && p.agility === c.maxFocus ? `Focus equals Agility (${p.agility}) only at max Focus, which God's Boon consumes at once` : `Focus never equals Agility (${p.agility}) in the God's Boon cycle`);
      const body = `+${p.maxDamagePercent}% additional Max Damage`;
      return inCalc(`Focus equals Agility (${p.agility}) ${pct(p.share)}% of the time: Lucky Damage for that share (a part-time window of the luck count) and +${p.perStack}% × ${p.agility} Agility × ${round(p.share)} = ${body} (provisional)`, { bodies: [body] });
    }
    case "reincarnation": {
      const r = w?.reincarnation;
      if (!c || !r) return inactive(noBoon || "Predicted Reincarnation is not in the build");
      const value = round(r.percent * c.uptime), body = `+${value}% additional damage`;
      return inCalc(`${r.stacks} stacks (Focus consumed, up to ${r.capWithPurity}) × ${r.per}% = +${r.percent}% ${uptimeText} = ${body} (provisional)`, { bodies: value ? [body] : [], timed: boonTimed("theaReincarnation", "Predicted Reincarnation", r.percent) });
    }
    case "farewell": {
      const f = w?.farewell;
      if (!c || !f) return inactive(noBoon || "Farewell Prophecy is not in the build");
      const value = round(f.percent * c.uptime), body = `+${value}% chance to deal Double Damage`;
      return inCalc(`${f.stacks} stacks × ${f.per}% = +${f.percent}% Double Damage chance ${uptimeText} = ${body} (hits only; time-averaged: provisional)`, { bodies: value ? [body] : [], timed: boonTimed("theaFarewell", "Farewell Prophecy (Double Damage)", f.percent, "hit") });
    }
    case "quadruple": {
      const chance = Number(w?.doubleDamageChancePercent) || 0;
      return chance > 100 ? inCalc(`${round(chance)}% Double Damage chance: ${round(chance - 100)}% overflow → that chance of Quadruple Damage instead (src/double-damage.js; the time-averaged chance: provisional)`) : inactive(`Double Damage chance ${round(chance)}%: no overflow above 100%`);
    }
    case "purity": {
      const raised = [w?.reincarnation, w?.farewell].filter((item) => item?.purityRaises);
      return raised.length ? inCalc(`a second God's Boon lands inside the first one's ${c.buffSeconds} s, so the buffs add up to twice their limit (recipe label 3050347): ${raised.map((item) => `${item.stacks} of ${item.capWithPurity}`).join(", ")}`) : !c ? inactive(noBoon) : !w.reincarnation && !w.farewell ? neutral("no stacking God's Boon buff in the build; God's Boon's own damage line has no stack reference") : inactive(`God's Boon comes every ${c.periodSeconds} s and its buffs last ${c.buffSeconds} s: they never overlap, so the doubled limit is not reached`);
    }
    case "oracle": {
      const o = w?.oracle;
      if (!c || !o || !o.percent) return inactive(!c ? noBoon : "no Agility or Tenacity Blessing stacks");
      const value = round(o.percent * c.uptime), body = `+${value}% additional damage`;
      return inCalc(`during God's Boon (${pct(c.uptime)}% of the time): +${o.per}% per stack of Tenacity (${o.tenacity}) and Agility (${o.agility}) × each Blessing's Effect = +${o.percent}% → ${body} (per stack: provisional)`, { bodies: [body], timed: boonTimed("theaOracle", "The Place of Oracle", o.percent) });
    }
    case "oracleCap": {
      const match = cleanThea(text).match(THEA_PATTERNS.oracleCap);
      const name = match ? match[2][0].toUpperCase() + match[2].slice(1).toLowerCase() : "";
      const B = state.blessings[name];
      if (!B) return inactive("not a Blessing line");
      const used = name === "Focus" ? B.perStackDamage > 0 || Boolean(w?.cycle) : name === "Agility" ? B.stacks > 0 : Boolean(w?.oracle) || Boolean(w?.revelation) || Boolean(state.thea?.shared?.value);
      return B.stacks > 0 && used ? inCalc(`${name} Blessing max ${B.maxStacks} (held by the Divine Blessing cycle${name === "Focus" && w?.cycle ? `; God's Boon consumes ${w.cycle.maxFocus}` : ""})`) : B.stacks > 0 ? neutral(`${name} Blessing's stacks change no damage figure in this build`) : inactive(`${name} Blessing holds no stack`);
    }
    default: return notModeled("this Wisdom of The Gods clause is not read");
  }
}

function incarnationRead(key, text, state) {
  const n = state.incarnation, realm = n.realm, B = state.blessings;
  const where = realm.inside ? "you stand inside the Divine Realm (the \"Divine Realm position\" choice)" : "you stand outside the Divine Realm (the \"Divine Realm position\" choice: best case unless inside deals more)";
  const noRealm = !realm.cast ? "the Divine Realm line is not in the build" : "the Divine Realm is not active (the Trait Skill switch is off and no trait Prepares it)";
  const outsideOnly = realm.inside ? `${where}` : "";
  switch (key) {
    case "cycle": return cycleRead(state);
    case "realmCast": return realm.active ? inCalc(`the Divine Realm on the dummy from t = 0, ${realm.durationSeconds} s every ${realm.cooldownSeconds} s: uptime ${pct(realm.uptime)}% (${realm.pressed ? "pressed on cooldown: best case" : "Prepared by a trait"}); ${where}`) : inactive(noRealm);
    case "realmDamage": {
      const match = cleanThea(text).match(THEA_PATTERNS.realmDamage);
      if (!realm.active) return inactive(noRealm);
      const stacks = Math.min(Number(match[2]), n.total), value = round(Number(match[1]) * stacks * realm.uptime), body = `+${value}% additional damage`;
      return value ? inCalc(`${round(n.total)} Blessing stacks (up to ${match[2]}) × ${match[1]}% while the Divine Realm is active = ${body} (the keyword's Full Life / Low Life targets are not applied: provisional)`, { bodies: [body] }) : inactive("no Blessing stacks");
    }
    // The side not chosen still sets its alternative in the automatic Divine Realm position comparison: the conversion is what that
    // side's Blessings are compared with (batch 7 badge fixes, 2026-10-28: the inside conversion read Inactive while it decided the choice).
    case "convertOutside": return realm.inside ? (realm.compared ? inCalc(`read in the Divine Realm position comparison (automatic): standing outside, Tenacity would convert to Agility; inside deals more and is kept`, { group: "theaRealm" }) : inactive(where)) : inCalc(`outside the Divine Realm: Tenacity converts to Agility (Agility ${round(B.Agility.stacks)} of ${B.Agility.maxStacks}, Tenacity 0)`, { group: "theaRealm" });
    case "convertInside": return realm.inside ? inCalc(`within the Divine Realm: Agility converts to Tenacity (Tenacity ${round(B.Tenacity.stacks)} of ${B.Tenacity.maxStacks}, Agility 0)`, { group: "theaRealm" }) : realm.active && realm.compared ? inCalc(`read in the Divine Realm position comparison (automatic): standing inside, Agility would convert to Tenacity; outside deals more and is kept`, { group: "theaRealm" }) : inactive(realm.active ? where : noRealm);
    case "transferOutside": case "transferInside": {
      const outside = key === "transferOutside";
      if (outside === realm.inside) return inactive(realm.active || outside ? where : noRealm);
      const change = n.transfer?.change || 0;
      return change ? inCalc(`${outside ? "Tenacity" : "Agility"} Blessing's max-stack change (${signed(change)}) also applies to ${outside ? "Agility" : "Tenacity"} Blessing: max ${outside ? B.Agility.maxStacks : B.Tenacity.maxStacks}`, { group: "theaRealm" }) : inactive(`${outside ? "Tenacity" : "Agility"} Blessing's max stacks are unchanged`);
    }
    case "realmMoon": {
      const match = cleanThea(text).match(THEA_PATTERNS.realmMoon);
      const stacks = Math.min(Number(match[2]), B.Tenacity.stacks + B.Agility.stacks), value = round(Number(match[1]) * stacks), body = `+${value}% additional damage`;
      return value ? inCalc(`${round(B.Tenacity.stacks + B.Agility.stacks)} Tenacity + Agility stacks (up to ${match[2]}) × ${match[1]}% = ${body}`, { bodies: [body] }) : inactive("no Tenacity or Agility stacks");
    }
    case "realmArea": return neutral("Divine Realm Skill Area: the Realm is cast on the dummy");
    case "prepare": return !realm.cast ? inactive(noRealm) : realm.pressed ? neutral("the Trait Skill best case already holds the Divine Realm (pressed on cooldown); Preparation keeps it with the switch off") : inCalc("Prepares the Divine Realm (reference data Preparation: cast when ready, else right after its cooldown): held at uptime 1 without pressing");
    case "tenacious": {
      const t = n.tenacious;
      if (!t || t.mode === "none") return inactive(`Tenacity Blessing ${round(t?.stacks ?? B.Tenacity.stacks)} stacks: below ${t?.at ?? 6}${realm.inside ? "" : " (outside the Divine Realm Tenacity converts to Agility)"}`);
      if (t.mode === "flat") return inCalc(`Tenacity Blessing at least ${t.at} for ${pct(t.flatShare)}% of the time (${t.stacks} on average; each stack its own timer): +${t.flat}% × ${t.flatShare} = +${t.percent}% additional damage`, { bodies: t.percent ? [`+${t.percent}% additional damage`] : [] });
      const body = `+${t.percent}% additional damage`;
      return t.percent ? inCalc(`Tenacity Blessing ${t.stacks} ≥ ${t.upper}: +${t.per}% × ${Math.min(t.cap, t.stacks)} = +${t.lowLifePercent}% against enemies at Low Life; the dummy is deemed at Low Life ${pct(t.lowLifeShare)}% of the time (Incarnation; Q-H9) = ${body}`, { bodies: [body], timed: n.deem ? [{ id: "theaLowLifeTenacious", label: "Tenacious Divinity: the dummy deemed at Low Life", target: "enemy", toggle: false, enabled: true, active: true, parts: [{ type: null, reach: "all", percent: round(t.lowLifePercent * (t.upperShare ?? 1)), schedule: { kind: "periodic", durationSeconds: n.deem.seconds, periodSeconds: n.deem.cooldownSeconds, startSeconds: 0 } }] }] : [] }) : inactive(`Tenacity Blessing ${t.stacks} ≥ ${t.upper}: the bonus needs an enemy at Low Life, and the dummy never loses Life (Q-H9; Incarnation would deem it)`);
    }
    case "agile": {
      const a = n.agile;
      if (!a || a.mode === "none") return inactive(`Agility Blessing ${round(a?.stacks ?? B.Agility.stacks)} stacks: below ${a?.at ?? 6}${realm.inside ? " (inside the Divine Realm Agility converts to Tenacity)" : ""}`);
      if (a.mode === "speed") { const body = `+${a.speedPercent}% additional Attack and Cast Speed`; return inCalc(`Agility Blessing at least ${a.at} for ${pct(a.speedShare)}% of the time (${a.stacks} on average; each stack its own timer): +${a.speed}% × ${a.speedShare} = ${body}`, { bodies: a.speedPercent ? [body] : [] }); }
      const body = `+${a.damagePercent}% additional damage`;
      return a.damagePercent ? inCalc(`Agility Blessing ${a.stacks} ≥ ${a.upper} and you are at Low Life: +${a.per}% × ${Math.min(a.cap, a.stacks)} = ${body}`, { bodies: [body], group: "life" }) : inactive(`Agility Blessing ${a.stacks} ≥ ${a.upper}: the effect needs you at Low Life (the Life group compares Low Life)`, { group: "life" });
    }
    case "mightSpeed": case "mightDamage": {
      if (realm.inside) return inactive(where);
      const match = cleanThea(text).match(THEA_PATTERNS[key]);
      const value = round(Math.min(Number(match[2]), Number(match[1]) * n.total)), body = key === "mightSpeed" ? `+${value}% additional Attack and Cast Speed` : `+${value}% additional damage`;
      return value ? inCalc(`outside the Divine Realm: ${round(n.total)} Blessing stacks × ${match[1]}% (up to ${match[2]}%) = ${body}`, { bodies: [body], group: "theaRealm" }) : inactive("no Blessing stacks");
    }
    case "mightTaken": return neutral("damage you take: the dummy never attacks");
    case "powerInside": {
      const value = Number(cleanThea(text).match(THEA_PATTERNS.powerInside)[1]), body = `+${value}% additional damage`;
      return realm.inside ? inCalc(`you and the dummy are inside the Divine Realm: ${body}`, { bodies: [body], group: "theaRealm" }) : inactive(realm.active ? where : noRealm);
    }
    case "powerSpeed": {
      const value = Number(cleanThea(text).match(THEA_PATTERNS.powerSpeed)[1]), body = `+${value}% Attack and Cast Speed`;
      return realm.active && !realm.inside ? inCalc(`outside the active Divine Realm: ${body}`, { bodies: [body], group: "theaRealm" }) : inactive(!realm.active ? noRealm : where);
    }
    case "powerKill": return notOnDummy("needs defeated enemies (the dummy never dies); Movement Speed only");
    case "powerRefresh": return neutral("the dummy is always in the Divine Realm (cast on it)");
    case "deem": {
      if (!n.deem) return inactive("the build deals no modeled damage");
      const deemText = `the dummy is deemed at Low Life ${n.deem.seconds} s of every ${n.deem.cooldownSeconds} s from the first hit (${pct(n.deem.share)}%; Q-H9)`;
      return !n.deem.share ? inactive("no share") : n.deem.readers ? inCalc(`${deemText}: read by "enemies at Low Life" lines${n.tenacious?.mode === "lowLife" ? " (Tenacious Divinity)" : ""}`) : neutral(`${deemText}, but no line in the build reads an enemy at Low Life`);
    }
    case "realmEnemy": {
      const value = Number(cleanThea(text).match(THEA_PATTERNS.realmEnemy)[1]), body = `+${round(value * realm.uptime)}% additional damage`;
      return realm.active ? inCalc(`the dummy is in the Divine Realm (cast on it): ${body}`, { bodies: [body] }) : inactive(noRealm);
    }
    case "crossing": return realm.inside ? inactive(where) : inCalc(`outside the Divine Realm: +${cleanThea(text).match(THEA_PATTERNS.crossing)[1]} to max stacks of every Blessing (Tenacity's also reaches Agility): Focus ${B.Focus.maxStacks}, Agility ${B.Agility.maxStacks}, Tenacity ${B.Tenacity.maxStacks}`, { group: "theaRealm" });
    default: return notModeled(outsideOnly || "this Incarnation of the Gods clause is not read");
  }
}

function blasphemerRead(key, text, state) {
  const b = state.blasphemer;
  const off = !b.click ? "Desecration's line is not in the build" : !state.anyDamage ? "the build deals no modeled damage" : b.maxStacks <= 0 ? "no Max Desecration Stacks" : "Desecration is never inflicted (no Blessing gain triggers it and the Trait Skill switch is off)";
  const noErosion = "the build deals no Erosion Damage, so this Erosion bonus changes no dummy figure";
  const cadence = b.active ? `Desecration every ${b.intervalSeconds} s (${b.gains ? "each Blessing gain triggers the Trait Skill" : "pressed on its cooldown"}), ${b.perApplication} of ${b.maxStacks} stacks per application, each refreshing the shared 5 s duration: ${round(b.stacks)} stacks held (provisional)` : "";
  switch (key) {
    case "cycle": return cycleRead(state);
    case "desecrationClick": {
      if (!b.active) return inactive(off);
      if (!state.dealsErosion) return neutral(`${cadence}; ${noErosion}`);
      // Recipe 853846848 on buff 82142 (yours), trigger 1000031, attr 5402: it scales your own damage, so Minions and the follower take none.
      const body = `+${b.takenPercent}% additional Erosion Damage`;
      return inCalc(`${cadence}: (1 + 15%)^${round(b.stacks)} = ${body} on your own damage against the dummy (recipe 853846848; the dummy starts clean)`, { bodies: [body], timed: [{ id: "theaDesecration", label: "Desecration on the dummy", target: "self", toggle: false, enabled: true, active: true, parts: [{ type: "Erosion", reach: "all", percent: b.fullPercent, schedule: b.schedule }] }] });
    }
    case "desecrationConvert": {
      const inv = b.invert;
      if (!inv) return inactive("Blasphemer's conversion line is not in the build");
      const converted = inv.perType.filter((item) => item.converted > 0);
      return converted.length ? inCalc(`${converted.map((item) => `${item.name} +${item.increases} → max ${item.max}`).join(", ")}: Max Desecration Stacks ${b.maxStacks}`) : neutral(`no increase to Max Blessing Stacks in the build: Desecration keeps its ${b.maxStacks} max stacks`);
    }
    case "desecrationTrigger": return !b.active || !b.gains ? inactive(!b.gains ? "no Blessing can be gained (every Blessing's max is 0)" : off) : state.traitPressed && b.cooldownSeconds <= CYCLE.intervalSeconds + EPS ? neutral(`a Blessing gain every 2 s triggers the Trait Skill, but pressing it on its ${b.cooldownSeconds} s cooldown holds the same stacks`) : inCalc(`a Blessing gain every 2 s triggers the Trait Skill (its 0.3 s interval allows it): ${cadence}`);
    case "elitesOnly": return neutral("the training dummy is a Boss, an Elite: Desecration affects it");
    case "pawn": {
      if (!b.pawn) return inactive(off);
      if (!state.dealsErosion) return neutral(`the dummy gains Sacrificial Pawn (a crowd control type); ${noErosion}`);
      const body = `+${b.pawnPercent}% additional Erosion Damage taken`;
      return inCalc(`the dummy is the only enemy: Desecrated, it gains Sacrificial Pawn: ${body}, a crowd control type on the dummy (keyword)`, { bodies: [body] });
    }
    case "spread": return notOnDummy("other Elites near the dummy");
    case "sageSpeed": {
      if (!b.active) return inactive(off);
      const body = `+${b.sage.percent}% Attack and Cast Speed`;
      return inCalc(`you damage the Desecrated dummy continuously (5 s, refreshed): ${body}`, { bodies: [body] });
    }
    case "onsetTrue": return notOnDummy("once per Elite on its first Desecration (the dummy's Max Life is not modeled): not a sustained figure");
    case "onsetMountain": {
      if (!b.active) return inactive(off);
      if (!b.mountain) return inactive("the Desecrated dummy is under no crowd control effect (Sacrificial Pawn, Frostbite, Freeze, Paralysis, …)");
      if (!state.dealsErosion) return neutral(`Mountain of Sins on the dummy; ${noErosion}`);
      const body = `+${b.mountainPercent}% Erosion Penetration`;
      return inCalc(`the Desecrated dummy is under crowd control (${b.crowdControl.join(", ")}): Mountain of Sins, -${b.mountainPercent}% Erosion Resistance, applied as ${body} (the planner treats a resistance reduction like penetration; provisional)`, { bodies: [body] });
    }
    case "extremeCap": {
      if (!b.extreme) return inactive("not in the build");
      return b.invert?.extremeExtra > 0 ? inCalc(`every Blessing's max is 0: the further increases (+${b.invert.extremeExtra}) also raise Max Desecration Stacks, up to ${b.invert.extremeCap}: ${b.maxStacks}`) : inactive(b.invert?.allZero ? "no further increase to Max Blessing Stacks" : "not every Blessing's max stacks are 0");
    }
    case "extremeLife": return inactive("the dummy never loses Life (Q-H9: 0% Life lost)");
    case "shrineSelf": return b.active ? (b.shrine && state.dealsErosion ? inCalc("you Desecrate yourself with each application: held while you Desecrate the dummy (read by the +50% line)") : neutral("self Desecration only raises your Erosion Damage taken")) : inactive(off);
    case "shrineDamage": {
      if (!b.shrine?.active) return inactive(!b.active ? off : "Inverted Shrine's self Desecration line is not in the build");
      if (!state.dealsErosion) return neutral(noErosion);
      const body = `+${b.shrine.percent}% additional Erosion Damage`;
      return inCalc(`you have Desecration while you Desecrate the dummy: ${body}`, { bodies: [body] });
    }
    default: return notModeled("this Blasphemer clause is not read");
  }
}
