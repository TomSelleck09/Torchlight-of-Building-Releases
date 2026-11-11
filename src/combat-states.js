import { maxSpellBurstTotal } from "./max-spell-burst.js";
import { wholePercentRoll } from "./whole-percent-roll.js";
import { normalizePercentageText } from "./percentage-text.js";
import { recipeCrowdControl, crowdControlEventRate, crowdControlLocalChance } from "./crowd-control-recipes.js";
import { explicitRadiusHolds, KEYWORD_RADII_METERS, DISTANT_STANDING_METERS } from "./dummy-target.js";
import { sustainedLevel } from "./timed-effects.js";
import { resolveRegain } from "./regain-model.js";
import { level85DummyDefenses } from "./target-hit-mitigation.js";
import { AFFLICTION_DAMAGE_PER_POINT } from "./game-attribute-defaults.js";
import { classifyHitLine, splitHitLineText } from "./skill-hit-lines.js";
import { LUCKY_DAMAGE_PATTERNS, readLuckyDamage, luckyRollAverage, luckyCritChance } from "./lucky-damage.js";
import { STORM_COMMAND_LINE, resolveStormCommand } from "./storm-command.js";
import { sageOwnedLine } from "./sage-traits.js";
import { lineTriggerRows } from "./trigger-rows.js";
import { BY_YOU, BY_YOU_OR_FOLLOWER, UnitBuffSet, buffRecordOf, enemyBuffSet, playerBuffSet } from "./unit-buff-set.js";
import { DEFLECTION_SOURCES } from "./carino-traits.js";
import { ELIXIR_PROGRESS_LINE, ELIXIR_EFFECT_LINE, ELIXIR_ADDITIONAL_EFFECT_LINE, TAILORED_REMEDY_LINE, ELIXIR_DURATION_LINE, RESTORATION_KEPT_LINE, MIRACULOUS_GAIN_LINE, resolveElixirs, elixirSetupText, miraculousGainState } from "./elixir-model.js";

// Your Blessings from your unit buff set (W9 step 2: the early Blessing pass, src/planner.js), else the state's fields (TLI_BUFF_SET=off).
const ownBlessingStacks = (state) => { const own = playerBuffSet(state); return own?.staged("blessing") ? own.blessingStacks() : state.blessingStacks; };
const ownBlessingMaxStacks = (state) => { const own = playerBuffSet(state); return own?.staged("blessing") ? own.blessingMaxStacks() : state.blessingMaxStacks; };

// Buffs, enemy debuffs and the damage side of non-damaging ailments (research/talent-batch-2026-10-12.md §10 chunk 3).
// Each state turns into derived plain lines (src/line-effects.js pushes them into planner.modifierTexts, so every engine
// reads them like the same plain line) and into one entry per source line for its badge and the recount assumptions.
//
// Sources: the game's keyword tooltips (config_multi_language_en hyperlink records, values as reference data fills them; the
// manual entries where they exist):
//   Attack Aggression (hyperlink 10000100): "Additionally increases Attack Speed and Attack Damage by 5%".
//   Spell Aggression (10000101): "Additionally increases Cast Speed and Spell Damage by 7%".
//   Hasten (10000106 "Quickness"): "Additionally increases Attack Speed, Cast Speed, Movement Speed … by 8%".
//   Fervor (740 / manual): "+2% Critical Strike Rating for every point of Fervor Rating. The Max Fervor Rating is 100";
//     accumulates "when you defeat enemies or hit Elite enemies while having Fervor" (the dummy is an Elite). A fixed Rating
//     ("Has 130 point(s) of fixed Fervor Rating", Unmatched Valor) goes past the 100 cap (user-confirmed 2026-10-14).
//   Fortitude (10000107): "Each stack … additionally reduces Hit Damage taken by 5% for 10s. Base Max Fortitude Stacks: 3".
//   Frail (10000102): "Additionally increases Spell Damage taken by 15%".
//   Fire / Cold / Lightning Infiltration (10000103–05): "Additionally increases <Type> Damage taken by 13%".
//   Paralysis (704): "Increases damage taken by 15%"; manual rule 1002020420: "Stacks up to 1 time. The base duration is 4s".
//     Weaken (701): "Reduces damage dealt by 10%" (the enemy's damage). Crowd Control Effects (742): "Frostbite, Freeze,
//     Paralysis, Knockback, Weaken, Slow, Taunt, and Blinding".
//   Frostbite (735): "Base Frostbite Rating: 10. For every 1 Frostbite Rating, +1% additional Cold Damage taken. The enemy
//     will be Frozen once they have more than 100 Frostbite Rating"; manual: "The Max Frostbite Rating is 120"; 736:
//     "Enemies are inflicted with a fixed amount of Frostbite Rating … increased by raising Max Frostbite Rating".
//   Numbed (762): "Max Numbed stacks: 10. Each stack of Numbed increases the Lightning Damage taken by an additional +5%".
//     Conductive (Assassin core) changes that base effect to +11% per stack, same 10-stack cap (user-confirmed 2026-10-12).
// Own buffs are held at their built-up state before engaging (user rule 2026-10-09: own buffs pre-built); debuffs on the
// dummy are applied at their steady state. Readings nobody has checked in game are `provisional` and listed.

export const BUFF_VALUES = Object.freeze({
  attackAggression: { percent: 5, source: "Attack Aggression (game keyword 10000100)" },
  spellAggression: { percent: 7, source: "Spell Aggression (game keyword 10000101)" },
  hasten: { percent: 8, source: "Hasten (game keyword 10000106)" },
  // Ash (reference data keyword 10147): +30% additional Fire Damage.
  ash: 30,
  profane: { percent: 7, source: "Profane (game buff 3492)" },
  // Gear affix batch D (2026-10-22): Ferocity (keyword 10000118: "+10% additional Physical Damage and -3% additional damage taken.
  // Physical Damage cannot be converted to other types"; game buff 3493, 4 s) and God of War's Blessing (game buff 3, affix 200000139
  // per stack: +10% Movement Speed, +10% Skill Area, +0.5 Projectile Quantity on Projectile Skills (field 2006108, tag 6001110), and a
  // node-403 effect "percent 2" the readable tables do not name).
  ferocity: { percent: 10, source: "Ferocity (game keyword 10000118)" },
  godOfWar: { projectileQuantityPerStack: 0.5, source: "God of War's Blessing (game buff 3, affix 200000139)" },
  fervorPerPoint: 2, fervorMax: 100,
  fortitudeBaseMax: 3,
  frail: 15, infiltration: 13, paralysis: 15, paralysisDurationSeconds: 4, thrillBarrier: 20,
  frostbiteBaseRating: 10, frostbiteMaxRating: 120, frostbiteFreezeAt: 100, frostbiteTakenPerRating: 1,
  // Condensed Frost (affix 3166437 on buff 81233): 0.35% per point over 120, +28% at most before its Effect (80 points).
  condensedFrostPerPoint: 0.35, condensedFrostMaxPoints: 80,
  numbedPerStack: 5, numbedMaxStacks: 10, numbedDurationSeconds: 2
});

// Discord of the Second Will's rotation (game affix 14747381; chunk 2, 2026-11-01): node 802 reads the buffs with tag 5100112, config_char_buff
// 230, 112, 270, 260, 280 and 20060, each 4 s in its record. One per Interval, a type not yet on the target first (the text): each
// type's turn comes every 6 × Interval, so it holds 4 s of them.
const DISCORD_CROWD_CONTROL = Object.freeze(["Paralysis", "Frostbite", "Weaken", "Slow", "Taunt", "Blinding"]);
const discordSchedule = (interval, turn) => ({ kind: "periodic", durationSeconds: BUFF_VALUES.paralysisDurationSeconds, periodSeconds: interval * DISCORD_CROWD_CONTROL.length, startSeconds: interval * turn });
const discordInterval = (line) => Number(line.clean.match(PATTERNS.discordCrowdControl)[1]);
// Lines that count the crowd control types on the dummy: ccTypeDamage, Self-Delusion, Passing of Time (src/line-conditions.js
// ailmentOrCcTypes), Wings of Light's Intimidated added effect (611468864, GetBuffCfgIdCountByTag 5100101) and First Flake of Strange
// Snow's deemed Frostbite Rating. A crowd control line with no effect of its own on the dummy (Weaken, Slow, Blind) reads In calc only
// with one of them.
const CROWD_CONTROL_READER = /type of crowd control effect the enemy has|for each type of Crowd Control Effect they are under|every type of Ailment or Crowd Control Effect inflicted recently|for each type of crowd control effect the target is under|^Each type of Crowd Control Effect, Ailment, and Curse afflicting an enemy is deemed/i;
// Readers of the Blinded state (target state 4000140: "+X% additional damage to Blinded enemies" 101010148, Spirit Magi 171666624,
// Lucky Critical Strike against Blinded enemies) and of the Paralyzed state (Judgment 191779): a held Blind / Paralysis feeds them.
const BLINDED_READER = /\bBlinded enem/i, PARALYZED_READER = /\bParalyzed enem/i;
// Crowd control held from the game recipes (src/crowd-control-recipes.js; wiring audit gap 1, 2026-11-03): the planner measures the
// event rates (your hits, triggered uses, Minion hits, skill casts: src/planner.js hit-rate pass) when such a line has a reader, or
// holds Paralysis (its own damage taken).
export function crowdControlChanceRatesNeeded(modifierTexts = [], supportHolders = []) {
  const lines = modifierTexts.filter((line) => line?.origin !== "derived" && !line?.lineEffect).map((line) => ({ ...line, clean: normalizePercentageText(String(line?.text ?? "")).replace(/\s+/g, " ").trim() }));
  // Support clauses that hold crowd control (wiring audit W6a item 1) count as holders too.
  const holders = [...lines.filter((line) => !scriptedCrowdControl(line.clean)).map((line) => recipeCrowdControl(line)).filter(Boolean), ...supportHolders.map((holder) => holder.reading).filter(Boolean)];
  if (!holders.length) return false;
  const readers = lines.some((line) => CROWD_CONTROL_READER.test(line.clean) || BLINDED_READER.test(line.clean) || PARALYZED_READER.test(line.clean));
  return readers || holders.some((holder) => holder.rows.some((row) => row.types.some((type) => type.type === "Paralysis")));
}
// Read only for the revived Numbed family's own stacks (revivedNumbed in resolveCombatStates), so they stay out of PATTERNS.
const NUMBED_DURATION_LINE = /^([+-]\d+(?:\.\d+)?)% Numbed Duration$/i, FOLLOWER_NUMBED_LINE = /^The Follower inflicts Numbed on the dummy$/i;

const num = (text) => Number(String(text).replace("−", "-"));
const sum = (values) => values.reduce((total, value) => total + value, 0);
const round = (value) => Math.round(value * 10000) / 10000;
// "Recently" is "Within 4s" (game hyperlink 103, as src/line-conditions.js RECENTLY_SECONDS).
const RECENT_SECONDS = 4;
// A body's leading value × factor ("+30% Critical Strike Damage" × 0.5 → "+15% Critical Strike Damage"); null without a value or at 0.
const scaleLeadingNumber = (body, factor) => {
  const match = String(body).match(/^([+-]?)(\d+(?:\.\d+)?)(.*)$/);
  if (!match) return null;
  const value = round(Number(match[2]) * factor);
  return value ? `${match[1] || "+"}${value}${match[3]}` : null;
};
// Juggernaut's Armor scale is read against the level-85 dummy's Physical Armor mitigation (src/target-hit-mitigation.js).
const AFFLICTION_PERCENT_PER_POINT = AFFLICTION_DAMAGE_PER_POINT * 100;
const JUGGERNAUT_DUMMY_PHYSICAL_ARMOUR_PERCENT = level85DummyDefenses.armourPercent;
/** E[min(cap, N)] for N ~ Poisson(mean): the expected count of events in a window, capped (recent-crit stacks). */
export function expectedCappedPoisson(mean, cap) {
  if (!(mean > 0) || !(cap > 0)) return 0;
  let expected = 0, probability = Math.exp(-mean), cumulative = 0;
  for (let count = 0; count < cap; count++) { expected += count * probability; cumulative += probability; probability *= mean / (count + 1); }
  return expected + cap * Math.max(0, 1 - cumulative);
}

// Lines this module reads, by family (also the "handled" set for src/line-effects.js).
const PATTERNS = {
  hasFervor: /^(?:Have|Has|Gains) Fervor(?: when there are enemies Nearby)?$/i,
  // Negative values too (2026-10-17: the follower's Focused Slash "-5% Fervor Effect … for each Sweep Slash", src/follower-model.js).
  fervorEffect: /^([+-]\d+(?:\.\d+)?)% Fervor effect$/i,
  // Rating gains (also Chaotic Ending's "Gains 3 Fervor Rating on a Critical Strike" / "… for Non-Critical Strikes"): the Rating
  // is already held at its max (or fixed) while Fervor is held, so the gains change nothing.
  fervorRatingOnHit: /^(?:\+\d+% chance to gain \d+ Fervor rating on hit|Gains \d+ (?:points of )?Fervor Rating (?:on a Critical Strike|for Non-Critical Strikes))$/i,
  critDamagePerFervor: /^\+?(\d+(?:\.\d+)?)% Critical Strike Damage per Fervor Rating$/i,
  movementPerFervor: /^\+\d+(?:\.\d+)?% Movement Speed per \d+ Fervor Rating$/i,
  // Centralize (Ronin core): its two parts arrive as separate lines. Part 1 raises the Rating on hit; part 2 consumes half of it
  // when the player is hit (best case: not hit, condition centralizeNotHit); its "-0.8% additional damage per point consumed" is a
  // defence (game recipe 570574: additional damage taken from hits), so it has no DPS effect.
  centralize: /^Gains additional Fervor Rating equal to/i,
  centralizeHit: /^Consumes half of current Fervor Rating when hit(?:\. ?-(\d+(?:\.\d+)?)% additional damage per (\d+)? ?points? consumed)?/i,
  // Nether King nodes (slates audit 2026-10-22): "You and your Minions have Attack / Spell Aggression" (SS13 and SS14 wordings).
  attackAggressionGain: /^(?:Has Attack Aggression|(?:Both )?you and your Minions have Attack Aggression|Gains Attack Aggression when casting an Attack Skill)$/i,
  attackAggressionDefeat: /chance to gain Attack Aggression on defeat$/i,
  spellAggressionGain: /^(?:Has Spell Aggression|(?:Both )?you and your Minions have Spell Aggression)$/i,
  aggressionEffect: /^\+(\d+(?:\.\d+)?)% (Attack|Spell) Aggression Effect$/i,
  spellAggressionPerCast: /^\+(\d+(?:\.\d+)?)% Spell Aggression Effect for every Main Spell Skill cast recently\. Stacks up to (\d+) times$/i,
  hastenAlways: /^Has Hasten$/i,
  hastenAgility: /^(?:Has Hasten when reaching Max Agility Blessing stacks|When having Agility Blessing ?, has Hasten)$/i,
  hastenTrauma: /^Gains Hasten when inflicting Trauma for \d+(?:\.\d+)? ?s$/i,
  hastenMinionCrit: /^Gains Hasten when Minions land a Critical Strike$/i,
  // Gear affix batch A (2026-10-22). "Minions have Hasten": the Minions hold Hasten (game buff 3471 "Quickness": +8% additional
  // Attack, Cast and Movement Speed). Aggression the Minions gain from their crits. Profane (game buff 3492: +7% additional Erosion
  // Damage, +7% additional Wilt and Deterioration Duration) for the player and / or the Minions.
  minionHasten: /^Minions have Hasten$/i,
  attackAggressionMinionCrit: /^Gains Attack Aggression when Minions land a Critical Strike$/i,
  spellAggressionMinionSpellCrit: /^Gains Spell Aggression when Minion Spells land a Critical Strike$/i,
  profane: /^Has Profane(\. Minions have Profane)?$/i,
  profaneOnWilt: /^Gains Profane when inflicting Wilt or Deterioration$/i,
  ferocityOnPhysical: /^Gains Ferocity when dealing Physical Damage$/i,
  godOfWarBlessing: /^Gains (\d+) stack\(s\) of God of War's Blessing$/i,
  hastenEffect: /^\+(\d+(?:\.\d+)?)% Hasten Effect$/i,
  // Records 936246784 and 940275264 (wiring fix W6b, 2026-11-03): trigger 1000074 (a use you make yourself) with the Melee tag 6001120,
  // node 301 adding buff 3481 (Fortitude); the chance form has gate 188 at p0. One reading for both wordings.
  fortitudeGain: /^(?:\+?(\d+(?:\.\d+)?)% chance to gain|Gains) a stack of Fortitude when using a Melee Skill$/i,
  fortitudeExtra: /^(?:Owns (\d+) additional stack\(s\) of Fortitude|\+(\d+) (?:to )?Max Fortitude Stacks)$/i,
  fortitudeDamage: /^\+(\d+(?:\.\d+)?)% additional damage (?:per|for every) (\d+) stack\(s\) of Fortitude$/i,
  elixirActive: /^(.+?) while an Elixir Skill is active$/i,
  // Legendary audit batch 1 (Fire Lord's Promise, Strayed Healer's Waistguard, Omni-Elixir Notes, Illusory Chimera's rolls).
  elixirCastRecently: /^(.+?) if you have cast an Elixir Skill recently$/i,
  elixirPerCastRecently: /^(.+?) for every Elixir Skill cast recently\. Stacks up to (\d+) time\(s\)$/i,
  // Core audit B8 (src/elixir-model.js): the Elixir Skills' uptime on the dummy and their Elixir Effect.
  elixirProgress: ELIXIR_PROGRESS_LINE,
  elixirEffect: ELIXIR_EFFECT_LINE,
  elixirAdditionalEffect: ELIXIR_ADDITIONAL_EFFECT_LINE,
  tailoredRemedy: TAILORED_REMEDY_LINE,
  elixirDuration: ELIXIR_DURATION_LINE,
  restorationKept: RESTORATION_KEPT_LINE,
  miraculousGain: MIRACULOUS_GAIN_LINE,
  // "Gains N stack(s) of all Blessings when casting an Elixir Skill" (Belt base affix; gear affix batch A): a Blessing gain source,
  // read by src/blessing-model.js (every Blessing while an Elixir Skill is on the board and cast).
  elixirBlessings: /^Gains \d+ stack\(s\) of all Blessings when casting an Elixir Skill$/i,
  elixirOther: /Elixir Skill/i,
  // Storm's Command (core audit B8, src/storm-command.js): +X% additional Attack Damage per different Warcry cast recently.
  stormCommand: STORM_COMMAND_LINE,
  frail: /^Inflicts Frail when dealing Spell Damage$/i,
  // Gear-pact batch chunk 2 (enemy debuffs from passive lines). Radii (residual batch 2026-10-12): Nearby within 6 m, Proximity
  // within 4 m (reference data keyword tooltips); the player stands close, so they hold and an explicit radius holds at point blank.
  frailNearby: /^Nearby enemies within (\d+(?:\.\d+)?) ?m have Frail$/i,
  // The follower's support affixes (src/follower-model.js AFFIX_MARKERS, 2026-10-19).
  followerDebuff: /^The Follower inflicts (Frail|Fire Infiltration|Cold Infiltration|Lightning Infiltration) on the dummy$/i,
  // The follower's crowd control (src/follower-model.js AFFIX_MARKERS, 2026-10-27): Coercion / Chance Paralysis, and Weaken, Slow, Taunt, Blind.
  followerParalysis: /^The Follower inflicts Paralysis on the dummy every (\d+(?:\.\d+)?) ?s(?: within (\d+(?:\.\d+)?) ?m)?$/i,
  followerCrowdControl: /^The Follower inflicts (Weaken|Slow|Taunt|Blinding) on the dummy$/i,
  infiltrationOnHit: /^(?:Inflicts (Fire|Cold|Lightning) Infiltration (?:on hit|when dealing damage)|When dealing damage, inflicts (Fire|Cold|Lightning) Infiltration)(?:\. Interval for each enemy: [\d.]+ ?s)?$/i,
  takenNearby: /^\+(\d+(?:\.\d+)?)% additional damage taken by (?:Nearby enemies|enemies in Proximity)$/i,
  // Residual batch A-2: typed or explicit-radius wordings ("+14% additional Fire Damage taken by enemies within 10 m").
  takenWithin: /^\+(\d+(?:\.\d+)?)% additional (Physical|Fire|Cold|Lightning|Erosion) Damage taken by (?:Nearby enemies|enemies in Proximity|enemies within (\d+(?:\.\d+)?) ?m)$|^\+(\d+(?:\.\d+)?)% additional damage taken by enemies within (\d+(?:\.\d+)?) ?m$/i,
  // "Every 0.25 s, +6% additional damage taken for enemies within 10 m. Stacks up to 5 times" (Impending): a stacking debuff.
  takenStacking: /^Every ([\d.]+) ?s, \+(\d+(?:\.\d+)?)% additional damage taken for enemies within (\d+(?:\.\d+)?) ?m\. Stacks up to (\d+) times?$/i,
  // Legendary audit batch 1 (2026-10-22): an aura of resistance change around the player ("-35% Elemental Resistance for enemies
  // within 20m", Pantheon's Elegy: Elementalist's Dirge, game buff 35115; "-40% Elemental and Erosion Resistance for enemies within
  // 15m", The Coward's Counterfire: Corroded Heart; "+20% Elemental Resistance for enemies within 12m", Grasp of Truth, a penalty,
  // affix 869075584 attr 5741 flat).
  enemyResistanceWithin: /^([+-]\d+(?:\.\d+)?)% (Elemental and Erosion|Elemental|Fire|Cold|Lightning|Erosion) Resistance for enemies within (\d+(?:\.\d+)?) ?m$/i,
  // Chunk 3: "When a Spell hit inflicts Fire Damage, -15% Cold, Lightning, and Erosion Resistance for the target for 3 s".
  spellHitShred: /^When a Spell hit inflicts (Fire|Cold|Lightning|Erosion) Damage, -(\d+(?:\.\d+)?)% ((?:(?:Fire|Cold|Lightning|Erosion)(?:, | and |, and )?)+) Resistance for the target for (\d+(?:\.\d+)?) ?s$/i,
  // Gear affix audit 2026-10-22 (Helmet base / Chest craft / TOWER Sequence lines): "When Minions deal damage, inflicts Cold Infiltration.
  // Interval for each enemy: 1 s" — held while a modeled Minion deals damage, as the player's on-hit wording.
  infiltrationMinions: /^When Minions deal damage, inflicts (Fire|Cold|Lightning) Infiltration(?:\. Interval for each enemy: [\d.]+ ?s)?$/i,
  lightningInfiltrationCrit: /^Inflicts Lightning Infiltration on Critical Strike$/i,
  coldInfiltrationFrozen: /^Inflicts Cold Infiltration when dealing damage to Frozen enemies$/i,
  // Legendary audit batch 2 (2026-10-22). Varagon's Lament: Cold Infiltration at a Frostbite Rating threshold. Iced Drinker's Cage:
  // Cage (reference data 10139: "+14% additional Cold Damage and -7% additional Damage Over Time taken. Stacks up to 4 stack(s) and lasts 5s
  // (multiplies)") gained on Frostbite infliction once per second. Supreme Throne: Throne (10122: "+1% additional Channeled Skill
  // Damage per stack. -1% additional damage taken, up to 10 stacks. Lasts for 4s") while channeling at max stacks. Thunder Branch /
  // Shadow of Thunderlight's Touch: Combo Lightning (10111: "Reduces enemy Lightning Resistance by 10% on hit for 8s, dealing minor
  // damage") from attacks. When Winter Comes: an Elemental Resistance shred per Barrage hit. Formation Breaker: damage taken near a
  // Sentry.
  coldInfiltrationFrostbiteRating: /^Inflicts Cold Infiltration when dealing damage to enemies with a Frostbite Rating of (\d+) or above$/i,
  cageOnFrostbite: /^Gains 1 stack\(s\) of Cage when inflicting Frostbite ?\. Interval: ([\d.]+) ?s$/i,
  throneAtMaxChannel: /^(?:Gains 1 Throne at max channeled stacks|Gains (\d+) stacks of Throne every [\d.]+ ?s when channeling), up to (\d+) stacks$/i,
  comboLightningAttacks: /^(\d+(?:\.\d+)?) ?% for Attacks chance to trigger Combo Lightning$/i,
  barrageHitShred: /^-(\d+(?:\.\d+)?)% Elemental Resistance for enemies when a Barrage Skill hits\. Stacks up to (\d+) time\(s\)\. Lasts for [\d.]+ ?s$/i,
  sentryProximityTaken: /^\+(\d+(?:\.\d+)?)% additional damage taken by enemies in proximity to Sentries$/i,
  solarRingTaken: /^Enemies within the (Solar Ring|Corona) take \+(\d+(?:\.\d+)?)% additional damage$/i,
  solarRingNear: /^Enemies within the (?:Solar Ring|Corona) are considered to be within 3m of you$/i,
  // Legendary audit batch 3. Chaos Abyss: damage taken per Wilt stack on the dummy (the Wilt model's steady stacks). Ralph's Dreadcrest:
  // Laceration (reference data 10182: "+8% additional Physical Damage … This effect lasts 5s. Stacks up to 30 time(s)") per Trauma inflicted,
  // and its Effect per Trauma stack on the dummy.
  wiltStackTaken: /^Upon inflicting damage, \+(\d+(?:\.\d+)?)% additional damage taken \(multiplies\) for enemies for each stack of Wilt they have\. Stacks up to (\d+) time\(s\)$/i,
  wiltDurationBelowStacks: /^\+(\d+(?:\.\d+)?)% additional Wilt Duration if enemies' Wilt stacks are less than (\d+)$/i,
  wiltStackErosion: /^\+?(\d+(?:\.\d+)?)% Erosion Damage per stack of Wilt inflicted, stacking up to (\d+) times$/i,
  lacerationOnTrauma: /^Gains 1 stack of Laceration when inflicting Trauma$/i,
  lacerationEffectPerTrauma: /^\+(\d+(?:\.\d+)?)% Laceration Effect for each stack of Trauma$/i,
  // The same Elementalist node since the 2026-10-14 game patch (reference data tree text): Frostbitten instead of Frozen.
  coldInfiltrationFrostbitten: /^Inflicts Cold Infiltration when dealing damage to Frostbitten enemies$/i,
  // Wiring audit gap 2d (2026-11-03): the Ignited readers off the Scorching Beam path (the beam keeps its own ledgers' talent keys).
  fireInfiltrationIgnited: /^Inflicts Fire Infiltration when dealing Fire Damage to Ignited enemies$/i,
  firePenetrationIgnited: /^\+(\d+(?:\.\d+)?)% Fire Penetration against Ignited enemies$/i,
  // Broken Dream (2026-10-18): "Inflicts Cold Infiltration on enemies cursed by Biting Cold": held while that curse skill is on the dummy.
  infiltrationCursedBy: /^Inflicts (Fire|Cold|Lightning) Infiltration on enemies cursed by ([A-Z][\w' ]+?)$/i,
  penetrating: /^When dealing Fire, Lightning, or Cold Damage, inflicts Fire Infiltration, Lightning Infiltration, or Cold Infiltration respectively\.$/i,
  perInfiltrationType: /^Upon inflicting damage, \+(\d+(?:\.\d+)?)% additional Elemental Damage for each type of Infiltration Effect the enemy has$/i,
  paralysisAttacks: /^\+(\d+(?:\.\d+)?)% chance for Attacks to inflict Paralysis on hit$/i,
  // Residual batch A-3: the unscoped wording ("+30% chance to inflict Paralysis on hit"): any modeled hit.
  // "+100% chance to Paralyze the target on hit" (gear) is the same on-hit chance.
  paralysisOnHit: /^\+(\d+(?:\.\d+)?)% chance to (?:inflict Paralysis|Paralyze the target) on hit$/i,
  // Paralysis sources without a chance roll on the dummy (2026-10-14; held from the first hit, 4 s base duration refreshed):
  // the Tenacity-gated chance, the damage-dealing one (with Weaken), Nearby enemies, and on Block.
  paralysisTenacity: /^\+(\d+(?:\.\d+)?)% chance to inflict Paralysis on hit when Tenacity Blessing reaches max stacks$/i,
  paralysisDealDamage: /^Inflicts Paralysis and Weaken when you or Minions deal damage$/i,
  paralysisNearby: /^Nearby enemies are Paralyzed$/i,
  paralysisBlocking: /^Paralyze enemies Nearby when Blocking$/i,
  // "+100% Fire Infiltration Effect" scales that Infiltration's +13% damage taken (keyword value × (1 + effect)).
  infiltrationEffect: /^\+(\d+(?:\.\d+)?)% (Fire|Cold|Lightning) Infiltration Effect$/i,
  // "+40% Frail Effect" (batch 7, 2026-10-28; game recipe 540757504: attr 3401 Status Effect, increased, on the Frail tag 5200073, as the
  // Infiltration Effect recipes write it on 5200075): scales the Frail you inflict (keyword value × (1 + Σ effect)).
  frailEffect: /^\+(\d+(?:\.\d+)?)% Frail Effect$/i,
  // Fervor at a fixed Rating ("Has 70 point(s) of fixed Fervor Rating") and per-Rating damage ("+1% additional damage per
  // 3 Fervor Rating"), residual batch A-3.
  // The fixed Rating may sit behind a granted-core prefix ("[Unmatched Valor] Has 130 point(s) of fixed Fervor Rating", the
  // Ethereal Prism's mutated-core clause; src/modifier-texts.js strips the prefix for intake, this keeps any that stays).
  fervorFixed: /^(?:\[[^\]]+\] ?)?Has (\d+) point\(s\) of fixed Fervor Rating$/i,
  // Ghost Slaughter (2026-10-14): Fervor's additional base effects, its Life drain, and losing Fervor at Low Life.
  fervorAttackAilment: /^Fervor gains an additional base effect: \+(\d+(?:\.\d+)?)% additional Attack and Ailment Damage for every (\d+(?:\.\d+)?)? ?Fervor Rating$/i,
  fervorSkillArea: /^Fervor gains an additional base effect: \+\d+(?:\.\d+)?% Skill Area for every \d+(?:\.\d+)? Fervor Rating$/i,
  fervorLifeDrain: /^Consumes \d+(?:\.\d+)?% of current Life and Energy Shield per second while Fervor is active$/i,
  losesFervorLowLife: /^Loses Fervor at Low Life$/i,
  // Hair-trigger (Shadowdancer core; game talent 41001200, trigger 1000060 "skill triggered", node 624 on attr 57191; core audit
  // batch B3): "+2% additional damage of a skill for every 7 points of Fervor Rating when the skill is triggered".
  // "+9% damage for Triggered Skills" (census #15; game affix 101010633: 5719 increased on the Trigger skill tag 6000080).
  triggeredIncreased: /^\+(\d+(?:\.\d+)?)% damage for Triggered Skills$/i,
  hairTrigger: /^\+(\d+(?:\.\d+)?)% additional damage of a skill for every (\d+) points? of Fervor Rating when the skill is triggered$/i,
  // "points of" too (Chaotic Ending's "+7% damage for every 10 points of Fervor Rating"; legendary audit batch 1, 2026-10-22).
  damagePerFervor: /^\+(\d+(?:\.\d+)?)% (additional )?(damage|Projectile Damage) (?:per|for every) (\d+)? ?(?:points? of )?Fervor Rating$/i,
  // Ranger's Dirge (Pantheon's Elegy; legendary audit batch 1): Aggression and its effect while Fervor is held.
  fervorAggression: /^While having Fervor, gains Attack Aggression and Spell Aggression, and \+(\d+(?:\.\d+)?)% Attack Aggression and Spell Aggression Effect$/i,
  spellAggressionOnCast: /^Gains Spell Aggression when casting a Spell Skill$/i,
  // "+20% chance to gain a 4 s Thrill Barrier upon inflicting Elemental Ailments" (reference data keyword: Thrill Barrier +20% additional
  // Elemental Damage).
  thrillBarrier: /^\+(\d+(?:\.\d+)?)% chance to gain a (\d+(?:\.\d+)?) ?s Thrill Barrier upon inflicting Elemental Ailments$/i,
  ashGain: /^Every (\d+) time\(s\) a Fire Skill is cast, gains Ash for (\d+(?:\.\d+)?) ?s$/i,
  shadowHitSpeed: /^(\d+(?:\.\d+)?)% chance to gain \+(\d+(?:\.\d+)?)% Attack Speed for (\d+(?:\.\d+)?) ?s when Shadows hit enemies$/i,
  // Decimal chances read too (2026-10-15): a Judgment-linked slate scales "+25%" to "+35%" (+40%), and other values to decimals.
  paralysisCursed: /^Upon dealing damage to a Cursed target, there is a \+(\d+(?:\.\d+)?)% chance to Paralyze it$/i,
  paralysisRegain: /^When Regaining, inflicts Paralysis on enemies within \d+ ?m$/i,
  // Bing – Blast Nova's Artificial Moon line (hero trait audit B12): Paralysis around the bombs, which are thrown at the dummy.
  paralysisBombs: /^Continuously inflicts enemies within (\d+) ?m of the bomb with Paralysis and Slow$/i,
  paralysisEffect: /^\+(\d+(?:\.\d+)?)% inflicted Paralysis Effect(?: when holding a (Two|One)-Handed Weapon)?$/i,
  // Judgment (core audit batch B2): game affix 191779 writes attr 5719 mod 4 with the Critical Strike tag 5001010 and the enemy
  // state tag 4000180 (Paralyzed), the "+X% additional damage on Critical Strike" bucket (src/crit-only-lines.js), gated on
  // Paralysis on the dummy.
  critVsParalyzed: /^\+(\d+(?:\.\d+)?)% additional Critical Strike Damage against Paralyzed enemies$/i,
  weaken: /Weaken/i,
  // Frostbitten Heart's Artificial Moon line "+10 Max Frostbite Rating and +50% additional Cold Pulse Skill Area" (game affix
  // 2125501 [10, 50]: field 2007015 Max Frostbite Rating, attr 6201 Skill Area on the Cold Pulse tag 6100040; hero trait audit
  // B2): the rating part; the Skill Area part changes nothing on one dummy.
  maxFrostbite: /^\+?(\d+(?:\.\d+)?) (?:to )?Max Frostbite Rating(?: and [+-]\d+(?:\.\d+)? ?% additional [\w ]+ Skill Area)?$/i,
  // Prophet's Dirge (legendary audit batch 1): per damage type group dealt recently (MAX_FROSTBITE_PER_TYPE below).
  maxFrostbitePerType: /^\+(\d+) to Max Frostbite Rating for each damage type among Physical\/Elemental\/Erosion dealt recently$/i,
  // Ice Puppet's Ice Cage (pactspirit outer node, game affix 404859, a text row; the skill is stone 80030).
  icePrison: /^Focus energy to create an ice prison Near yourself and the Pact Holder, which debuffs Frostbitten enemies inside every second and makes them take \+(\d+(?:\.\d+)?)% additional Cold Damage, up to (\d+) stacks, for (\d+(?:\.\d+)?) ?s\.?$/i,
  // Pact scripted-effects batch (2026-10-13): pact-spirit outer effects and kismets with their own clock (src/timed-effects.js).
  // A pact level text splits into lines, so a spirit's "Cooldown: N s" line pairs with its effect line by source.
  spiritCooldown: /^Cooldown: (\d+(?:\.\d+)?) ?s\.?$/i,
  meltingFlamesArea: /^Covers targets within a (\d+(?:\.\d+)?) ?m radius with flames and debuffs enemies within the area\.?$/i,
  meltingFlamesDebuff: /^Debuff: \+ ?(\d+(?:\.\d+)?)% additional Fire Damage taken by the enemy for (\d+(?:\.\d+)?) ?s\.?$/i,
  bitterThunder: /^Bestows the surging power of lightning to the pact holder, granting \+ ?(\d+(?:\.\d+)?)% additional Lightning Damage and \+ ?(\d+(?:\.\d+)?)% additional Max Damage for (\d+(?:\.\d+)?) ?s\.?$/i,
  witchAntelope: /^Inflicts Paralysis or Weaken on enemies within (\d+(?:\.\d+)?) ?m in turn\. Cooldown: (\d+(?:\.\d+)?) ?s\.?$/i,
  ccTypeDamage: /^For every type of crowd control effect the enemy has, you and your Minions deal \+?(\d+(?:\.\d+)?)% additional damage to them$/i,
  // Core audit batch B4 (research/core-talents-audit-2026-10-18.md §4.4, §6): enemy debuffs and the Affliction rework.
  selfDelusion: /^\+(\d+(?:\.\d+)?)% additional (Physical|Fire|Cold|Lightning|Erosion) Damage to an enemy for each type of Crowd Control Effect they are under$/i,
  // Intimidated (buff 35063) and its added base effect (Wings of Light; 2026-11-02).
  intimidatedAdded: /^Intimidated gains an additional base effect: \+(\d+(?:\.\d+)?)% additional Spell and Ailment Damage taken for each type of crowd control effect the target is under\. Stacks up to (\d+) times$/i,
  intimidateOnHit: /^\+(\d+(?:\.\d+)?)% chance to inflict Intimidated on hit$/i,
  intimidateDealDamage: /^Adds Intimidated when you or Minions deal damage$/i,
  intimidateNearby: /^Enemies within (\d+(?:\.\d+)?) ?m are Intimidated$/i,
  intimidatingEffect: /^\+(\d+(?:\.\d+)?)% Intimidating effect$/i,
  // Crowd control by chance ("+X% chance to Blind the target on hit" 574297, "+X% chance to inflict Slow on hit" 472365504, "+X%
  // chance to Weaken nearby enemies when triggering any skill" 279824224, and every other line whose record applies a crowd control
  // buff) is held from the game recipes since 2026-11-03 (src/crowd-control-recipes.js; the block "Crowd control from the game
  // recipes" below), not by wording.
  juggernaut: /^-(\d+(?:\.\d+)?)% additional Armor and -(\d+(?:\.\d+)?)% Elemental and Erosion Resistance for enemies on Critical Strike for (\d+(?:\.\d+)?) ?s\. Stacks up to (\d+) times$/i,
  openWounds: /^\+(\d+(?:\.\d+)?)% additional Hit Physical Damage taken for every stack of Trauma the enemy has, up to \+(\d+(?:\.\d+)?)%$/i,
  escalatingAffliction: /^Changes the effect of each point of Affliction to: \+?(\d+(?:\.\d+)?)% - \+?(\d+(?:\.\d+)?)% additional Damage Over Time taken\. Refreshes every 1 ?s and is affected by Lucky Damage bonuses$/i,
  escalatingMaxDamage: /^(\d+(?:\.\d+)?)% of the bonuses and additional bonuses for Max Damage is also applied to Damage Over Time$/i,
  iceSoul: /^Inflicts Frostbite on nearby enemies$/i,
  holyMaiden: /^Inflicts Paralysis, Blind, Weaken, Slow, Taunt, and Frostbite on hit$/i,
  // Discord of the Second Will (lunar-phase revived memory affix, game affix 500201500): one random crowd control effect per second
  // when dealing damage, not Freeze or Knockback, an effect the target lacks first. Chunk 2, 2026-11-01 (game affix 14747381): node 802
  // picks one of the six buffs with tag 5100112 (DISCORD_CROWD_CONTROL below), each 4 s in its record, so four are up at a time:
  // each type holds 4 s of every 6 × Interval. Before it was read like the Holy Maiden line, every type held.
  discordCrowdControl: /^When dealing damage, inflicts a random crowd control effect \(except Freeze and Knockback\), prioritizing effects that have not yet been inflicted\. Interval: ([\d.]+) ?s$/i,
  // Reactive Rainbow's offensive half (game affix 10218501; chunk 2, 2026-11-01): chance = 0.35 × (avoid Elemental Ailments − 100).
  reactiveRainbowReversal: /^For every (\d+(?:\.\d+)?)% excess chance to avoid Elemental Ailments, \+(\d+(?:\.\d+)?)% chance to inflict Elemental Resistance Reversal on enemies when dealing Elemental Damage$/i,
  channelWeaken: /^For every (\d+) channeled stacks, inflicts Weaken on enemies within (\d+(?:\.\d+)?) ?m$/i,
  attackProjectileBlind: /^Blinds nearby enemies when using an Attack Projectile Skill$/i,
  mainSkillManaConsume: /^Consumes (\d+(?:\.\d+)?)% of current Mana when casting a Main Skill(?:\. Interval: (\d+(?:\.\d+)?) ?s)?$/i,
  attackLifeConsume: /^Consumes (\d+(?:\.\d+)?)% of current Life when you use Attack Skills$/i,
  valkyrieGain: /^Gains 1 stack of Valkyrie's Hymn for every (\d+(?:\.\d+)?)% Max Mana consumed$/i,
  valkyrieMax: /^\+(\d+) Max Valkyrie's Hymn Stacks$/i,
  valkyriePerStack: /^\+(\d+(?:\.\d+)?)% Elemental Damage for every stack of Valkyrie's Hymn$/i,
  valkyrieAtMax: /^Upon reaching Max Valkyrie's Hymn Stacks, \+(\d+(?:\.\d+)?)% Elemental Resistance Penetration$/i,
  mirroredGain: /^Gains 1 stack of Mirrored Shade every (\d+(?:\.\d+)?) ?s while standing on a Terra Skill$/i,
  mirroredMax: /^\+(\d+) to Max Mirrored Shade Stacks$/i,
  mirroredDamage: /^\+(\d+(?:\.\d+)?)% additional Terra Skill Damage while having Mirrored Shade$/i,
  mirroredCharge: /^\+(\d+) to Max Terra Charge Stacks when Mirrored Shade reaches max stacks$/i,
  felineGain: /^Gains 1 stack of Feline Stimulant when triggering a Main Skill$/i,
  felineMax: /^\+(\d+) to Max Feline Stimulant stacks$/i,
  felineDamage: /^\+(\d+(?:\.\d+)?)% additional Attack Damage when having Feline Stimulant$/i,
  felineAggression: /^Has Attack Aggression when reaching Max Feline Stimulant stacks$/i,
  squidGain: /^Consuming Spell Burst with at least (\d+) stack\(s\) of Max Spell Burst grants 1 stack of Squidnova$/i,
  squidEffect: /^\+(\d+(?:\.\d+)?)% Squidnova Effect$/i,
  squidDamage: /^\+(\d+(?:\.\d+)?)% additional Spell Damage when having Squidnova$/i,
  squidBurst: /^\+(\d+) to Max Spell Burst when having Squidnova$/i,
  spiderFluid: /^\+(\d+(?:\.\d+)?)% damage per stack of Wilt inflicted recently\. Stacks up to (\d+) time\(s\)$/i,
  scorpionStinger: /^\+(\d+(?:\.\d+)?)% Reaping Recovery Speed for each Reaping dealt recently, up to (\d+(?:\.\d+)?)%$/i,
  witchCauldron: /^When at full Energy Shield, removes all Energy Shields, \+(\d+(?:\.\d+)?)% additional Max Mana, and \+(\d+(?:\.\d+)?)% additional Spell Damage for (\d+(?:\.\d+)?) ?s$/i,
  flashFlood: /^(?:Halves Spell Burst Upper Limit|\+\d+(?:\.\d+)?% additional Attack and Cast Speed for every Spell Burst triggered recently, up to \d+%)$/i,
  // Negative values too (2026-10-17: the follower's Icy Blade "-5% Frostbite Effect … for each Sweep Slash").
  frostbiteEffect: /^([+-]\d+(?:\.\d+)?)% Frostbite Effect$/i,
  // Gemma (hero trait audit B3, 2026-10-19). Deepfreeze: "Frostbite Rating can exceed its upper limit, up to N" (game affix
  // 12710333 [200, 5]: buff 81232) raises the 120 cap to N. First Flake of Strange Snow (revived, Frostbitten Heart only):
  // "-50% additional Frostbite Effect" multiplies the effect, and "Each type of Crowd Control Effect, Ailment, and Curse
  // afflicting an enemy is deemed to have 50 additional Frostbite Rating, up to 350" (provisional readings: the deemed rating
  // adds on top of the inflicted one, the 350 caps the deemed part, it counts for Freeze, a type that is both an Ailment and a
  // Crowd Control Effect counts once).
  frostbiteCapRaise: /^Frostbite Rating can exceed its upper limit, up to (\d+)$/i,
  condensedFrost: /^Enemies are inflicted with Condensed Frost$/i,
  condensedFrostEffect: /^([+-]\d+(?:\.\d+)?) ?% Condensed Frost Effect$/i,
  frostbiteEffectAdditional: /^([+-]\d+(?:\.\d+)?)% additional Frostbite Effect$/i,
  deemedFrostbite: /^Each type of Crowd Control Effect, Ailment, and Curse afflicting an enemy is deemed to have (\d+) additional Frostbite Rating, up to (\d+)$/i,
  // Signed: the revived Numbed family's T3 prints "-10% Numbed Effect" (revived affix census 2026-10-21).
  numbedEffect: /^([+-]\d+(?:\.\d+)?)% Numbed Effect$/i,
  // The revived Numbed family (reference data Memory Revival; game affix 16227245): a Numbed source on Lightning Damage dealt
  // (src/enemy-ailments.js adds the ailment; this entry badges the line).
  numbedOnLightning: /^Every (\d+) time\(s\) Lightning Damage is dealt, inflicts (\d+) stack\(s\) of Numbed on enemies within (\d+(?:\.\d+)?) ?m nearby\. Interval: ([\d.]+) ?s$/i,
  numbedExtra: /^Inflicts (\d+(?:\.\d+)?) additional stack\(s\) of Numbed$/i, // decimals too (batch 1 2026-10-27: a scaled count must not drop)
  numbedThreshold: /thresholds for inflicting Numbed$/i,
  numbedBase: /^Changes the base effect of Numbed to: \+(\d+(?:\.\d+)?)% additional Lightning Damage taken$/i,
  numbedCritBuff: /^\+(\d+(?:\.\d+)?)% additional Numbed Effect on Critical Strike with Lightning Damage for (\d+(?:\.\d+)?) ?s$/i,
  // Lucky lines: src/lucky-damage.js (shared with the skill DoT's random roll).
  ...LUCKY_DAMAGE_PATTERNS,
  deteriorationChance: /^\+(\d+(?:\.\d+)?)% Deterioration Chance$/i,
  deteriorationExtra: /^(\d+(?:\.\d+)?)% chance to inflict (\d+(?:\.\d+)?) additional stack\(s\) of Deterioration$/i,
  deteriorationIncreased: /^\+(\d+(?:\.\d+)?)% Deterioration Damage$/i,
  deteriorationAdditional: /^([+-]?\d+(?:\.\d+)?)% additional Deterioration Damage$/i,
  // The revived Erosion to Deterioration family (game affix 16346693: node 114 converts P1% of attr 54021 mod 3, the increased
  // Erosion Damage bonus, into attr 63021 mod 3, the increased Deterioration Damage, at most P2).
  deteriorationFromErosion: /^(\d+(?:\.\d+)?)% of the bonus to Erosion Damage also applied to Deterioration Damage, up to \+?(\d+(?:\.\d+)?)%$/i,
  deteriorationDuration: /^[+-]?\d+(?:\.\d+)?% (?:additional )?Deterioration Duration$/i,
  // Legendary audit batch 6 (2026-10-22): Blight, Hand of Malice, Ruinous Star (Obliterate: reference data keyword 10162).
  deteriorationTakenPerStack: /^\+(\d+(?:\.\d+)?)% additional Deterioration Damage taken per stack of Deterioration the enemy has\. Stacks up to (\d+) time\(s\)$/i,
  deteriorationCritRecently: /^([+-]?\d+(?:\.\d+)?)% additional Deterioration Damage if you have dealt a Critical Strike recently$/i,
  deteriorationTicks: /^Deterioration no longer deals True Damage when it expires\. Instead, it deals True Damage once every (\d+(?:\.\d+)?) ?s while it lasts\. The damage gains a (\d+(?:\.\d+)?)% additional damage increment each time, up to (\d+) time\(s\)$/i,
  obliterateEvery: /^Every (\d+(?:\.\d+)?) ?s, your next non-Channeled Main Skill is enhanced by Obliterate(?: Skills not enhanced by Obliterate cannot inflict Deterioration)?$/i,
  obliterateOnly: /^Skills not enhanced by Obliterate cannot inflict Deterioration$/i,
  // Nether King Ultimate (census #15, 2026-10-27; game affix 926491008).
  spellLevelCrit: /^\+(\d+(?:\.\d+)?) Spell Critical Strike Rating and \+(\d+(?:\.\d+)?)% Spell Critical Strike Rating for every \+(\d+) to Spell Skill Level\. Stacks up to (\d+) time\(s\)$/i
};

// Crowd control the scripted readers below hold by wording (their conditions are their own: on Block, at max Tenacity, every N s in
// turn, Nearby …); every other line whose record applies a crowd control buff is held from its recipe (src/crowd-control-recipes.js).
const SCRIPTED_CROWD_CONTROL = ["paralysisAttacks", "paralysisOnHit", "paralysisCursed", "paralysisTenacity", "paralysisDealDamage", "paralysisNearby", "paralysisBlocking", "paralysisRegain", "paralysisBombs", "holyMaiden", "witchAntelope", "discordCrowdControl", "channelWeaken", "attackProjectileBlind", "followerCrowdControl", "followerParalysis", "iceSoul"];
function scriptedCrowdControl(text) { return SCRIPTED_CROWD_CONTROL.some((key) => PATTERNS[key].test(text)); }

/** True when this module reads the line (src/line-effects.js leaves it alone). */
export function readByCombatStates(text) {
  return Object.values(PATTERNS).some((pattern) => pattern.test(text)) || Boolean(recipeCrowdControl({ text, origin: null, source: "" }));
}

/** The Frostbite Rating the build inflicts (10 base + "+N to Max Frostbite Rating", capped at 120, or at a "can exceed its
 * upper limit, up to N" line's N; provisional reading). */
export function inflictedFrostbiteRating(modifierTexts = [], { typeGroups = 0 } = {}) {
  return Math.min(frostbiteRatingCap(modifierTexts), uncappedFrostbiteRating(modifierTexts, typeGroups));
}
// Prophet's Dirge (Pantheon's Elegy): "+20 to Max Frostbite Rating for each damage type among Physical / Elemental / Erosion dealt recently". Record 1033360248 has one row per
// damage tag, 5001100 to 5001140, each its own 4 s +20 (chunk 12): Fire, Cold and Lightning count apart, so +100 at most. Every hit lands far more often than the 4 s runs out.
// Callers without the dealt types (the Freeze check of src/enemy-ailments.js) pass none and count no group (provisional).
export const MAX_FROSTBITE_PER_TYPE = PATTERNS.maxFrostbitePerType;
export const damageTypeGroups = (types) => { const set = new Set(types || []); return ["Physical", "Fire", "Cold", "Lightning", "Erosion"].filter((type) => set.has(type)).length; };
const perTypeFrostbiteRating = (modifierTexts, typeGroups) => typeGroups > 0 ? sum(modifierTexts.map((line) => { const match = normalizePercentageText(String(line.text)).trim().match(MAX_FROSTBITE_PER_TYPE); return match && line.origin !== "derived" && !line.lineEffect ? num(match[1]) * (line.multiplier ?? 1) * typeGroups : 0; })) : 0;
const uncappedFrostbiteRating = (modifierTexts, typeGroups = 0) => BUFF_VALUES.frostbiteBaseRating + perTypeFrostbiteRating(modifierTexts, typeGroups) + sum(modifierTexts.map((line) => { const match = normalizePercentageText(String(line.text)).trim().match(PATTERNS.maxFrostbite); return match && !/Minion/i.test(line.text) ? num(match[1]) * (line.multiplier ?? 1) : 0; }));
/** The Frostbite Rating cap: 120, or the highest "Frostbite Rating can exceed its upper limit, up to N" (Deepfreeze; B3). */
export function frostbiteRatingCap(modifierTexts = []) {
  return Math.max(BUFF_VALUES.frostbiteMaxRating, ...modifierTexts.map((line) => { const match = normalizePercentageText(String(line.text)).trim().match(PATTERNS.frostbiteCapRaise); return match ? num(match[1]) : 0; }));
}

/**
 * @param {object[]} modifierTexts
 * @param {object} state src/planner.js lineConditionState (buff, ailment and skill facts)
 * @returns {{ entries: object[], derived: object[], buffs: object, debuffs: object, lucky: object, deterioration: object, iceCage: object[], timedEffects: object[] }}
 */
// The Infiltration types your own lines hold on the dummy (active entries not from the follower), so a follower Infiltration can tell
// whether it adds one (batch 7 badge fixes, 2026-10-28; src/follower-model.js). Read from the entries: no figure reads it.
const ownInfiltrationTypes = (entries) => [...new Set(entries.filter((item) => item.active && /Infiltration/i.test(String(item.text || "")) && !/^Follower\b/i.test(String(item.source || ""))).flatMap((item) => (item.bodies || []).map((body) => String(body.body || "").match(/additional (Fire|Cold|Lightning) Damage taken/i)?.[1]).filter(Boolean).map((type) => type[0].toUpperCase() + type.slice(1).toLowerCase())))];

export function resolveCombatStates(modifierTexts = [], state = {}) {
  const first = resolveCombatStatesOnce(modifierTexts, state);
  if (!first.deemedRerun) { delete first.deemedRerun; return first; }
  const second = resolveCombatStatesOnce(modifierTexts, { ...state, deemedCrowdControl: first.deemedRerun });
  delete second.deemedRerun;
  return second;
}

// Feline Figure's Numbed hold on the dummy's set (W8 step 3 Group B; see resolveCombatStatesOnce).
const FELINE_NUMBED_SOURCE = "Lightning Shadow: Feline Figure (buff 170)";
const felineNumbedHold = (entry) => entry.stage === "combat" && entry.source === FELINE_NUMBED_SOURCE;

// The pass's dummy holds as non-enumerable fields (W8 steps 2 and 3), read by putCombatHolds, not part of the planner result's data:
// `passHolds` the entries of the pass's own set (Frail, Infiltrations, held Paralysis, Intimidated), `crowdControlBy` the unit that holds
// each crowd control type you do not inflict ("follower", "minion").
// `triggerHolds` (W10, src/trigger-bus.js): each crowd control type's hold as the planner composes it (the scripted holders' schedule, then the recipe
// holds with the row that fires each), the crowd control counters and Intimidated's holders: what the tick engine's trigger bus needs to
// replace the holds it owns on the loop, read only.
const withDummyHolds = (result, passHolds, crowdControlBy, triggerHolds = null) => Object.defineProperties(result, { passHolds: { value: passHolds, enumerable: false }, crowdControlBy: { value: crowdControlBy, enumerable: false }, triggerHolds: { value: triggerHolds, enumerable: false } });

function resolveCombatStatesOnce(modifierTexts = [], state = {}) {
  let deemedRerun = null;
  // The pass's own holds on the dummy (W8 step 3): Frail, the Infiltrations, held Paralysis and Intimidated go on this set as each
  // producer stage completes, and the pass's later readers query it (the result fields stay for TLI_BUFF_SET=off). putCombatHolds puts
  // its entries on the dummy's set (stage "debuff").
  const passSet = new UnitBuffSet("dummy");
  // The dummy's unit buff set (src/unit-buff-set.js, W8 step 1): the Ignited / Traumatized readers below query it; null with
  // TLI_BUFF_SET=off or a hand-made state (the old lists then). Trauma you inflict: yours or the follower's, not your Minions'.
  const buffs = enemyBuffSet(state);
  const traumaInflicted = buffs ? buffs.holds("Trauma", { by: BY_YOU_OR_FOLLOWER }) : (state.enemyAilmentsInflicted ?? state.enemyAilments ?? []).includes("Trauma");
  // W8 step 2: the other ailment states, the ailments you (or the follower) inflict, the curses and the Minion-only shares from the set too.
  const inflictedAilments = buffs ? buffs.types("Ailment", { by: BY_YOU_OR_FOLLOWER, stage: "model" }) : state.enemyAilmentsInflicted ?? state.enemyAilments ?? [];
  const onDummy = (name) => buffs ? buffs.holds(name) : (state.enemyAilments || []).includes(name);
  const targetCursed = buffs ? buffs.holds("Cursed") : Boolean(state.cursed);
  const lines = modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).map((line) => ({ ...line, clean: normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim() }));
  // Sage's trait and revived lines are read and badged by its module (src/sage-traits.js, hero trait audit B8); the Elixir engine
  // still reads them below (Scent of Ambition's duration, the bottle-only moon line, Omni-Elixir Side Effect's -50%).
  const find = (pattern) => lines.filter((line) => pattern.test(line.clean) && !sageOwnedLine(state.heroId, line));
  // Lines that count crowd control types on the dummy (ccTypeDamage, Self-Delusion here; Passing of Time in src/line-conditions.js
  // ailmentOrCcTypes): the follower's Weaken / Slow / Taunt / Blind read In calc only with one (2026-10-27).
  const crowdControlReaders = lines.filter((line) => CROWD_CONTROL_READER.test(line.clean)).length;
  const values = (pattern, index = 1) => find(pattern).map((line) => num(line.clean.match(pattern)[index]) * (line.multiplier ?? 1));
  // Lines that read the dummy's damaging ailments (batch 7 badge fixes, 2026-10-28): "any" counts ailment types or any ailment, the
  // named keys an Ignited / Traumatized / Wilted dummy. The follower's ailment markers (its 1-base Ignite / Wilt / Trauma only marks the
  // dummy) read In calc only with one (src/follower-model.js), as its crowd control does with crowdControlReaders.
  const readerCount = (pattern) => lines.filter((line) => pattern.test(line.clean) && !/\bdefeat/i.test(line.clean)).length;
  const ailmentReaders = {
    any: readerCount(/(?<!every )types? of (?:Damaging )?Ailments?(?! or Crowd Control Effect the enemy has)|every type of (?:Damaging )?Ailment(?! or Crowd Control Effect the enemy has)|per Ailment on enem|(?:affected by|with) (?:Damaging )?Ailments|Ailments? (?:the enemy|they) ha(?:s|ve)/i),
    // "an enemy with Elemental Ailments" (target state 4000570: Ignite, Frostbite, Freeze, Numbed) reads an Ignited dummy too (W6a item 3).
    Ignite: readerCount(/\bIgnited\b|\bwith Ignite\b|(?:affected by|with) Elemental Ailments?\b/i), Trauma: readerCount(/\bTraumatized\b|\bwith Trauma\b/i), Wilt: readerCount(/\bWilted\b|\bwith Wilt\b/i)
  };
  const entries = [], derived = [];
  // Timed and stacking effects (src/timed-effects.js): { id, label, source, target, toggle, enabled, active, reason, parts, … }.
  // Their derived lines hold the sustained value; the parts carry the clock the 5 s / 20 s windows and the recount follow.
  const timedEffects = [];
  const entry = (line, active, conditionText, extra = {}) => entries.push({ source: line.source, origin: line.origin, text: line.clean, active, conditionText, status: extra.status || (active ? "In calc" : "Inactive"), provisional: Boolean(extra.provisional), bodies: (extra.bodies || []).map((text) => ({ body: text, derivedText: active ? text : null, readers: ["state"] })), condition: extra.condition || "combatState", group: extra.group || null, ...(extra.enemyDebuff ? { enemyDebuff: true } : {}), ...(extra.armourShred ? { armourShred: true } : {}), ...(extra.ccHolder ? { ccHolder: true } : {}) });
  // Buff lines take origin "buff" (every engine reads them as plain lines); enemy damage-taken lines take origin "derived"
  // (the hit engine reads derived "damage taken" lines as the target's; the ailment engines read typed ones).
  // A best-case assumption is on unless its condition is switched off (state flag or the requested conditions; Config tab
  // "Best-case assumptions" list, src/app.js).
  const conditionOn = (id) => state[id] !== false && state.requestedConditions?.[id] !== false;
  // `timeShare` (optional): the line holds that share of the time at value ÷ share (the crit models split crit terms into on / off
  // states, src/crit-time-states.js; research/lucky-crit-mechanics-2026-10-27.md).
  const derive = (text, source, conditionText, provisional = false, timeShare = null) => derived.push({ text, source, origin: /damage taken$/i.test(text) ? "derived" : "buff", multiplier: 1, derivedFrom: source, lineEffect: { conditional: true, key: "combatState", conditionText, provisional, ...(timeShare > 0 && timeShare < 1 ? { timeShare } : {}) } });

  // ---- Fervor ----
  const fervorSources = find(PATTERNS.hasFervor);
  // A fixed Fervor Rating (residual batch A-3) gives Fervor at that Rating; the largest fixed value holds (game code 0x14207d0b0: the sorted list of fixed values sets the largest). A fixed
  // Rating is not capped at the Max Fervor Rating of 100 (user-confirmed 2026-10-14: Unmatched Valor's 130 goes past it).
  const fixedFervor = find(PATTERNS.fervorFixed).map((line) => num(line.clean.match(PATTERNS.fervorFixed)[1]));
  const hasFervor = fervorSources.length > 0 || fixedFervor.length > 0;
  const fervorEffect = sum(values(PATTERNS.fervorEffect));
  const heldFervorRating = !hasFervor ? 0 : fixedFervor.length ? Math.max(...fixedFervor) : BUFF_VALUES.fervorMax;
  // Centralize part 2 ("Consumes half of current Fervor Rating when hit. -0.8% additional damage per 1 point consumed"). Game recipe
  // 570574 (user decision 2026-10-25, "follow the game recipes"; research/recipe-interpreter-step1-2026-10-25.md §17):
  //   row 1: on being hit (trigger 1000037), after 0.04 s, node 627 Fervor Rating -50% of current (the halving);
  //   row 2: node 119 per 1 held Fervor Rating, attribute 57201 (additional damage TAKEN, mod 4) p0 / 2 = -0.4% per held point (-0.8%
  //          per consumed point), against incoming hits (others: 5000003). A defence: it lowers the damage you take, no DPS effect.
  // The damage penalty read before (2026-10-14: "-0.8% × consumed additional damage applies to everything") is gone. Being hit still
  // halves the Rating, which costs Fervor readers, so the best case stays not hit (condition centralizeNotHit, on by default,
  // separate from "Hit or blocked recently"). Switched off: hit at the held Rating, half of it consumed, the Rating halves for every
  // Fervor reader below. Whether a fixed Rating can be consumed is unknown: assumed yes when switched off (provisional).
  const centralizeLines = find(PATTERNS.centralizeHit);
  const centralizeNotHit = conditionOn("centralizeNotHit");
  const centralizeHitApplies = hasFervor && centralizeLines.length > 0 && !centralizeNotHit;
  // A fixed Rating locks the fight resource (game code, research/oq-rosa-client-2026-11-05.md §2: 0x14207caf0 refuses every change while a
  // node-639 fixed value is held; 0x14207d0b0 sets the largest fixed value, unclamped): the halving when hit takes nothing, and Centralize's
  // +25% of current on hit adds nothing either. Only the damage-taken defence remains.
  const centralizeConsumed = centralizeHitApplies && !fixedFervor.length ? round(heldFervorRating / 2) : 0;
  // Per held point on damage taken (the defence; reported, not applied): p0 / 2 of the line's per-consumed-point value.
  const centralizePerPoint = Math.max(0, ...centralizeLines.map((line) => { const match = line.clean.match(PATTERNS.centralizeHit); return match[1] ? num(match[1]) * (line.multiplier ?? 1) / num(match[2] || 1) : 0; }));
  const centralizeDamageTakenPercent = round(-centralizePerPoint / 2 * (heldFervorRating - centralizeConsumed));
  const centralizePenalty = 0;
  const fervorRating = round(heldFervorRating - centralizeConsumed);
  const centralizeHitText = fixedFervor.length ? `hit (Centralize; condition "Centralize: not hit" off): the fixed ${heldFervorRating} Fervor Rating refuses the halving (game code 0x14207caf0: no change while a fixed value is held), nothing consumed, ${fervorRating} left for every Fervor reader`
    : `hit (Centralize; condition "Centralize: not hit" off): half of the ${heldFervorRating} Fervor Rating consumed (${centralizeConsumed}), ${fervorRating} left for every Fervor reader (provisional)`;
  const fervorText = (fixedFervor.length
    ? `Fervor Rating fixed at ${heldFervorRating} (the fixed-Rating line's value, not capped at ${BUFF_VALUES.fervorMax}: user-confirmed 2026-10-14${fixedFervor.length > 1 ? "; the largest fixed value holds (game code)" : ""})`
    : `Fervor held at ${BUFF_VALUES.fervorMax} Rating (it builds on hitting Elite enemies; the dummy is an Elite; own buffs pre-built: provisional)`)
    + (centralizeConsumed ? `; ${centralizeHitText}` : "");
  for (const line of fervorSources) entry(line, true, fervorText, { provisional: !fixedFervor.length });
  for (const line of find(PATTERNS.fervorFixed)) entry(line, true, fervorText);
  // "+1% additional damage per 3 Fervor Rating": linear, node 119 from resource 45 (458113, 20638; chunk 12).
  for (const line of find(PATTERNS.damagePerFervor)) {
    const match = line.clean.match(PATTERNS.damagePerFervor);
    const every = num(match[4] || 1);
    const value = round(num(match[1]) * (line.multiplier ?? 1) * (fervorRating / every));
    const body = `+${value}% ${match[2] || ""}${match[3]}`;
    entry(line, hasFervor && value !== 0, hasFervor ? `${fervorRating} Fervor Rating ÷ ${every}` : "no Fervor source", { bodies: [body] });
    if (hasFervor && value) derive(body, line.source, `${fervorRating} Fervor Rating`, true);
  }
  // Hair-trigger: game record 281, node 624 lowerValue = GetFightResource(1, 0) ÷ P1 × P2: the held Fervor Rating ÷ 7 × 2% with no
  // GetFloorInt (chunk 4, 2026-11-01), as one additional term on triggered skills only (an Activation Medium trigger, a gear / pact "Trigger" skill, a Wind Rhythm Terra recast). The
  // engines apply it there (src/skill-hit-model.js, src/skill-dot-model.js through src/planner.js); src/planner.js settles the
  // entry's status once it knows whether the build has a triggered skill.
  const triggeredSkillAdditional = [];
  for (const line of find(PATTERNS.hairTrigger)) {
    const match = line.clean.match(PATTERNS.hairTrigger);
    const every = num(match[2]);
    const value = round(num(match[1]) * (line.multiplier ?? 1) * (fervorRating / every));
    const reading = hasFervor ? `${fervorRating} Fervor Rating ÷ ${every} × ${num(match[1])}% = +${value}% additional damage on triggered skills (game record 281)` : "no Fervor source";
    entry(line, hasFervor && value !== 0, reading, { provisional: true, condition: "hairTrigger" });
    if (hasFervor && value) triggeredSkillAdditional.push({ source: line.source, value, text: `+${value}% additional damage when the skill is triggered (${reading})`, category: "Additional damage" });
  }
  // "+X% damage for Triggered Skills" (Goddess of Knowledge / Shadowdancer talents, slates; census #15): increased damage on the
  // same triggered uses as Hair-trigger (src/skill-hit-model.js routes `increased` items to the increased pool; the skill DoTs do not
  // take it yet). src/planner.js settles the status (condition hairTrigger).
  for (const line of find(PATTERNS.triggeredIncreased)) {
    const value = round(num(line.clean.match(PATTERNS.triggeredIncreased)[1]) * (line.multiplier ?? 1));
    entry(line, value !== 0, `+${value}% damage (increased) on triggered skills`, { condition: "hairTrigger" });
    if (value) triggeredSkillAdditional.push({ source: line.source, value, text: `+${value}% damage for Triggered Skills`, category: "Increased damage", increased: true, scope: { damageTypes: null, skillTags: null, hitOnly: false } });
  }
  if (hasFervor) {
    const rating = round(fervorRating * BUFF_VALUES.fervorPerPoint * (1 + fervorEffect / 100));
    derive(`+${rating}% Critical Strike Rating`, "Fervor (keyword 740: +2% Critical Strike Rating per point, max 100)", `${fervorText}; ${fervorEffect ? `+${fervorEffect}% Fervor effect` : "no Fervor effect"}`, true);
  }
  // Ghost Slaughter: "Fervor gains an additional base effect: +1% additional Attack and Ailment Damage for every 1 Fervor
  // Rating": +Rating × 1% additional Attack Damage and additional Ailment Damage. Provisional: a Fervor base effect, so Fervor
  // effect scales it, like the Critical Strike Rating base effect.
  const fervorAttackAilment = [];
  for (const line of find(PATTERNS.fervorAttackAilment)) {
    const match = line.clean.match(PATTERNS.fervorAttackAilment);
    const every = num(match[2] || 1);
    const value = round(num(match[1]) * (line.multiplier ?? 1) * (fervorRating / every) * (1 + fervorEffect / 100));
    const bodies = [`+${value}% additional Attack Damage`, `+${value}% additional Ailment Damage`];
    const reading = `${fervorRating} Fervor Rating${every !== 1 ? ` ÷ ${every}` : ""} × ${num(match[1])}%${fervorEffect ? ` × (1 + ${fervorEffect}% Fervor effect)` : ""}; a Fervor base effect, so Fervor effect scales it, like the Critical Strike Rating base effect (provisional)`;
    entry(line, hasFervor && value !== 0, hasFervor ? reading : "no Fervor source", { provisional: true, bodies });
    if (hasFervor && value) {
      for (const body of bodies) derive(body, line.source, reading, true);
      fervorAttackAilment.push({ source: line.source, value, rating: fervorRating, fervorEffectPercent: fervorEffect, text: `${line.source}: ${bodies.join(" and ")} (${reading})` });
    }
  }
  // Ghost Slaughter's "Fervor gains an additional base effect: +1% Skill Area for every 3 Fervor Rating" (464187 → 28444: node 119, attr 6201
  // increased, × GetEffectScale, manuals 1002010421 / 1002010422: Fervor Effect scales an added base effect; linear, no whole steps). A Skill
  // Area reader on the hit (Berserking Blade: Rampage, Blazing Bullet: Ignition Point; src/support-conditional-batch4.js) takes it
  // (2026-11-05, Rosa build audit gap 4); else it moves no damage on one dummy.
  const fervorSkillArea = [];
  for (const line of find(PATTERNS.fervorSkillArea)) {
    const match = line.clean.match(/\+(\d+(?:\.\d+)?)% Skill Area for every (\d+(?:\.\d+)?) Fervor Rating/i);
    const value = hasFervor && match ? round(num(match[1]) * (line.multiplier ?? 1) * (fervorRating / num(match[2])) * (1 + fervorEffect / 100)) : 0;
    if (value) fervorSkillArea.push({ source: line.source, value, text: `+${value}% Skill Area (${fervorRating} Fervor Rating ÷ ${num(match[2])} × ${num(match[1])}%${fervorEffect ? ` × (1 + ${fervorEffect}% Fervor effect)` : ""})` });
    entry(line, hasFervor, hasFervor ? `+${value}% Skill Area (${fervorRating} Fervor Rating ÷ ${match ? num(match[2]) : "?"}${fervorEffect ? ` × (1 + ${fervorEffect}% Fervor effect)` : ""})${state.skillAreaReaders ? ": read by the hit's Skill Area support" : ": no Skill Area reader on the build"}` : "no Fervor source", { status: hasFervor && state.skillAreaReaders ? "In calc" : "No DPS effect", provisional: Boolean(state.skillAreaReaders) });
  }
  // The drain sets the held current-Life level the "per 1% Life lost" readers take (src/planner.js lifeLostState; record 824274, 2026-11-05).
  for (const line of find(PATTERNS.fervorLifeDrain)) entry(line, hasFervor, state.lifeLostDrain ? `${state.lifeLostDrain.text}${state.lifeLostReaders ? "; read by the build's Life-lost lines" : "; no Life-lost reader on the build"}` : "Life and Energy Shield drain", { status: hasFervor && state.lifeLostDrain && state.lifeLostReaders ? "In calc" : "No DPS effect", provisional: Boolean(state.lifeLostDrain && state.lifeLostReaders) });
  // User-confirmed 2026-10-14: Fervor from a static source ("Have Fervor", the necklace) is not lost at Low Life, though sealed
  // Life keeps the build at Low Life; only Fervor gained in combat would be.
  for (const line of find(PATTERNS.losesFervorLowLife)) entry(line, false, fervorSources.length || fixedFervor.length ? "Fervor here is static (\"Have Fervor\" or a fixed Rating), so Low Life does not remove it (user-confirmed 2026-10-14)" : "no Fervor source", { status: "No DPS effect" });
  for (const line of find(PATTERNS.fervorEffect)) entry(line, hasFervor, hasFervor ? `scales the Fervor Critical Strike Rating${fervorAttackAilment.length ? " and Ghost Slaughter's additional Attack and Ailment Damage" : ""}` : "no Fervor source");
  for (const line of find(PATTERNS.critDamagePerFervor)) {
    const value = round(num(line.clean.match(PATTERNS.critDamagePerFervor)[1]) * (line.multiplier ?? 1) * fervorRating);
    entry(line, hasFervor, hasFervor ? `${fervorRating} Fervor Rating (provisional)` : "no Fervor source", { provisional: true, bodies: [`+${value}% Critical Strike Damage`] });
    if (hasFervor && value) derive(`+${value}% Critical Strike Damage`, line.source, `${fervorRating} Fervor Rating`, true);
  }
  for (const line of find(PATTERNS.fervorRatingOnHit)) entry(line, hasFervor, hasFervor ? (fixedFervor.length ? `Fervor Rating is fixed at ${heldFervorRating}` : "Fervor Rating is already held at its max (100)") : "no Fervor source", { status: "No DPS effect" });
  // Centralize part 1 (the user has not answered whether it can raise a fixed Rating): the current reading is kept.
  const fixedFervorSource = (() => { const fixedLine = find(PATTERNS.fervorFixed).find((line) => num(line.clean.match(PATTERNS.fervorFixed)[1]) === heldFervorRating); if (!fixedLine) return ""; const prefix = fixedLine.clean.match(/^\[([^\]]+)\]/); const core = String(fixedLine.source || "").match(/core: ([^(]+?)(?: \(|$)/i); return (prefix?.[1] || core?.[1] || fixedLine.source || "").trim(); })();
  for (const line of find(PATTERNS.centralize)) entry(line, hasFervor, hasFervor ? (fixedFervor.length ? `Fervor Rating fixed at ${heldFervorRating}${fixedFervorSource ? ` by ${fixedFervorSource}` : ""}; a fixed Rating refuses Centralize's gain (game code 0x14207caf0)` : "Fervor Rating is already held at its max (100)") : "no Fervor source", { status: "No DPS effect" });
  // Centralize part 2: the "-0.8% additional damage" is a defence (game recipe 570574: additional damage taken from hits), No DPS
  // effect. The halving reaches the Fervor readers when the "Centralize: not hit" switch is off (In calc, provisional).
  const centralizeDefence = `game recipe 570574: ${-centralizePerPoint / 2}% additional damage taken from hits per held Fervor Rating point (attribute 57201, additional damage taken), a defence with no DPS effect`;
  for (const line of centralizeLines) {
    const reason = !hasFervor ? "no Fervor source"
      : centralizeNotHit ? `best case: not hit, so no Fervor Rating is consumed (condition "Centralize: not hit"); its damage line: ${centralizeDefence}`
      : `${centralizeHitText}; its damage line: ${centralizeDefence} (${centralizeDamageTakenPercent}% at ${heldFervorRating - centralizeConsumed} Rating)`;
    if (centralizeHitApplies) entry(line, true, reason, { provisional: true });
    else entry(line, hasFervor, reason, { status: hasFervor ? "No DPS effect" : "Inactive" });
    entries[entries.length - 1].listedAs = "condition:centralizeNotHit";
  }
  const centralize = centralizeLines.length ? { sources: centralizeLines.map((line) => line.source), notHit: centralizeNotHit, hasFervor, applied: centralizeHitApplies, heldRating: heldFervorRating, consumed: centralizeConsumed, rating: fervorRating, perPointPercent: centralizePerPoint, penaltyPercent: centralizePenalty, damageTakenPercent: centralizeDamageTakenPercent, recipe: 570574, fixed: fixedFervor.length > 0 } : null;
  for (const line of find(PATTERNS.movementPerFervor)) entry(line, false, "Movement Speed", { status: "No DPS effect" });

  // ---- Aggression and Hasten ----
  // Ranger's Dirge (legendary audit batch 1): with Fervor held, both Aggressions and +X% to each one's effect (provisional: the
  // Aggressions are buffs on the player, like "Has Attack Aggression").
  const fervorAggressionLines = find(PATTERNS.fervorAggression);
  const fervorAggressionEffect = hasFervor ? sum(fervorAggressionLines.map((line) => num(line.clean.match(PATTERNS.fervorAggression)[1]) * (line.multiplier ?? 1))) : 0;
  for (const line of fervorAggressionLines) entry(line, hasFervor, hasFervor ? `Fervor held (${fervorRating} Rating): Attack and Spell Aggression held, +${fervorAggressionEffect}% Aggression Effect (provisional)` : "no Fervor source", { provisional: true });
  const aggressionEffect = (kind) => fervorAggressionEffect + sum(find(PATTERNS.aggressionEffect).filter((line) => line.clean.match(PATTERNS.aggressionEffect)[2].toLowerCase() === kind).map((line) => num(line.clean.match(PATTERNS.aggressionEffect)[1]) * (line.multiplier ?? 1)));
  const attackAggressionLines = [...find(PATTERNS.attackAggressionGain).filter((line) => !/when casting an Attack Skill/i.test(line.clean) || state.castsAttack), ...(hasFervor ? fervorAggressionLines : [])];
  // Kitty Express (pact scripted-effects batch): "Has Attack Aggression when reaching Max Feline Stimulant stacks" (game affix
  // 86855680) holds with the Feline Stimulant stacks at their cap (own buff, best case; resolved with the timed effects below).
  // "when triggering a Main Skill" is trigger 1000060 with the Main Skill tag (game record 715628480; the 1000074 / 1000060 pairs settle
  // 1000060 as a triggered use): the Main Skill's triggered uses from the hit pass (wiring audit W2 gap 5, 2026-11-03: a manual Main Skill
  // alone no longer holds it); before the pass, any Main Skill use.
  const mainTriggered = Number.isFinite(state.mainTriggeredUsesPerSecond) ? state.mainTriggeredUsesPerSecond > 0 : Number(state.mainUsesPerSecond) > 0;
  const felineOn = find(PATTERNS.felineGain).length > 0 && conditionOn("felineStimulant") && mainTriggered;
  // "Gains Attack / Spell Aggression when Minions land a (Spell) Critical Strike": the Minion holds it, not you. Raw affixes 77639088 and 817133056: row 1 hands
  // row 2 to the Minions ([3]), and row 2's buff filter is [1], that row's own holder; a line that reaches you says so (Command's 9338664 writes on [4]). The
  // buff's own values at uptime 1 while the Minion crits (open question gear-aggression-minion-crit; chunk 11, 2026-11-01).
  for (const line of find(PATTERNS.attackAggressionMinionCrit)) {
    entry(line, Boolean(state.minionsCrit), state.minionsCrit ? "the modeled Minions hold Attack Aggression" : "no modeled Minion", { provisional: true });
    if (state.minionsCrit) {
      derive(`+${BUFF_VALUES.attackAggression.percent}% additional Attack Damage for Minions`, BUFF_VALUES.attackAggression.source, "Minions hold Attack Aggression", true);
      derive(`+${BUFF_VALUES.attackAggression.percent}% additional Minion Attack Speed`, BUFF_VALUES.attackAggression.source, "Minions hold Attack Aggression", true);
    }
  }
  const hasAttackAggression = attackAggressionLines.length > 0 || (felineOn && find(PATTERNS.felineAggression).length > 0);
  for (const line of find(PATTERNS.attackAggressionGain)) entry(line, attackAggressionLines.includes(line), attackAggressionLines.includes(line) ? "Attack Aggression held (gained by the build's Attack skill / always)" : "no active Attack skill");
  for (const line of find(PATTERNS.attackAggressionDefeat)) entry(line, false, "the training dummy never dies", { status: "Not on dummy" });
  if (hasAttackAggression) {
    const value = round(BUFF_VALUES.attackAggression.percent * (1 + aggressionEffect("attack") / 100));
    derive(`+${value}% additional Attack Damage`, BUFF_VALUES.attackAggression.source, "Attack Aggression held");
    derive(`+${value}% additional Attack Speed`, BUFF_VALUES.attackAggression.source, "Attack Aggression held");
  }
  // "Gains Spell Aggression when casting a Spell Skill" (residual batch A-3): held while the build casts a Spell on the dummy.
  const spellAggressionLines = [...find(PATTERNS.spellAggressionGain), ...find(PATTERNS.spellAggressionOnCast).filter(() => state.castsSpell ?? state.dealsSpellDamage), ...(hasFervor ? fervorAggressionLines : [])];
  for (const line of find(PATTERNS.spellAggressionOnCast).filter(() => !(state.castsSpell ?? state.dealsSpellDamage))) entry(line, false, "no Spell Skill is cast on the dummy");
  // The Spell half of the Minion lines above (affix 817133056, trigger tags Spell + crit).
  for (const line of find(PATTERNS.spellAggressionMinionSpellCrit)) {
    entry(line, Boolean(state.minionSpellsCrit), state.minionSpellsCrit ? "the modeled Minions hold Spell Aggression" : "no modeled Minion casts a Spell", { provisional: true });
    if (state.minionSpellsCrit) {
      derive(`+${BUFF_VALUES.spellAggression.percent}% additional Spell Damage for Minions`, BUFF_VALUES.spellAggression.source, "Minions hold Spell Aggression", true);
      derive(`+${BUFF_VALUES.spellAggression.percent}% additional Minion Cast Speed`, BUFF_VALUES.spellAggression.source, "Minions hold Spell Aggression", true);
    }
  }
  const hasSpellAggression = spellAggressionLines.length > 0;
  for (const line of spellAggressionLines.filter((item) => !fervorAggressionLines.includes(item))) entry(line, true, "Spell Aggression held");
  const perCast = find(PATTERNS.spellAggressionPerCast);
  // Burning Touch (chunk 4, 2026-11-01; game record 648060544): each Main Spell cast adds a 4 s stack of buff 20391 (cap 10, affix 885799744
  // +10% Spell Aggression Effect), player casts and triggered casts alike: stacks = min(cap, Main Spell casts/s × 4 s), as Elixir Fairies'
  // "for every ... cast recently" (each stack its own timer: provisional). The rate is the hit pass's measured Main Skill uses (your own and
  // triggered, a Spacetime Illusion's casts included: they raise 1000074 / 1000060 on you, 15 T audit G4, 2026-11-10), else the early
  // Main Skill rate (the cast-speed factor). Before any rate is known, the cap.
  const mainCastRate = () => Number.isFinite(state.mainCastsPerSecond) ? state.mainCastsPerSecond : Number(state.mainUsesPerSecond);
  const perCastStacks = (cap) => { const rate = mainCastRate(); return rate > 0 ? Math.min(cap, rate * 4) : cap; };
  const perCastEffect = hasSpellAggression && state.mainIsSpell ? sum(perCast.map((line) => { const match = line.clean.match(PATTERNS.spellAggressionPerCast); return num(match[1]) * perCastStacks(num(match[2])) * (line.multiplier ?? 1); })) : 0;
  for (const line of perCast) { const cap = num(line.clean.match(PATTERNS.spellAggressionPerCast)[2]); entry(line, perCastEffect > 0, perCastEffect > 0 ? `${round(mainCastRate() || 0)} Main Spell casts/s × 4 s: ${round(perCastStacks(cap))} of ${cap} stacks (each its own 4 s, provisional)` : "no Spell Aggression or no Main Spell Skill", { provisional: true }); }
  if (hasSpellAggression) {
    const value = round(BUFF_VALUES.spellAggression.percent * (1 + (aggressionEffect("spell") + perCastEffect) / 100));
    derive(`+${value}% additional Spell Damage`, BUFF_VALUES.spellAggression.source, "Spell Aggression held");
    derive(`+${value}% additional Cast Speed`, BUFF_VALUES.spellAggression.source, "Spell Aggression held");
  }
  for (const line of find(PATTERNS.aggressionEffect)) entry(line, line.clean.includes("Attack") ? hasAttackAggression : hasSpellAggression, "scales the Aggression buff");
  const hastenSources = [
    ...find(PATTERNS.hastenAlways).map((line) => [line, true, "Hasten held"]),
    ...find(PATTERNS.hastenAgility).map((line) => [line, (ownBlessingStacks(state)?.Agility || 0) > 0, (ownBlessingStacks(state)?.Agility || 0) > 0 ? "Agility Blessing at max stacks (Blessing model)" : "no Agility Blessing stacks"]),
    ...find(PATTERNS.hastenTrauma).map((line) => [line, traumaInflicted, traumaInflicted ? "the build keeps inflicting Trauma: Hasten refreshed (uptime 1; provisional)" : "the build inflicts no Trauma"])
  ];
  const hasHasten = hastenSources.some(([, active]) => active);
  for (const [line, active, text] of hastenSources) entry(line, active, text, { provisional: /provisional/.test(text) });
  const hastenEffect = sum(values(PATTERNS.hastenEffect));
  for (const line of find(PATTERNS.hastenEffect)) entry(line, hasHasten, hasHasten ? "scales Hasten" : "no Hasten source");
  if (hasHasten) {
    const value = round(BUFF_VALUES.hasten.percent * (1 + hastenEffect / 100));
    derive(`+${value}% additional Attack Speed`, BUFF_VALUES.hasten.source, "Hasten held");
    derive(`+${value}% additional Cast Speed`, BUFF_VALUES.hasten.source, "Hasten held");
  }
  // "Minions have Hasten": the buff's own value on the Minions (the player's "Hasten Effect" lines scale the player's Hasten only;
  // provisional), read by src/minion-damage-model.js as Minion Attack and Cast Speed. "Gains Hasten when Minions land a Critical Strike" is the same buff on
  // the Minion (affix 986022528: row 2, handed to the Minions, adds buff 3471 to its own holder; chunk 11, 2026-11-01).
  const minionHastenLines = [...find(PATTERNS.minionHasten), ...find(PATTERNS.hastenMinionCrit)];
  for (const line of minionHastenLines) entry(line, Boolean(state.minionsCrit), state.minionsCrit ? "the modeled Minions hold Hasten" : "no modeled Minion", { provisional: true });
  if (minionHastenLines.length && state.minionsCrit) derive(`+${BUFF_VALUES.hasten.percent}% additional Minion Attack and Cast Speed`, BUFF_VALUES.hasten.source, "Minions have Hasten", true);
  // ---- Profane (gear affix batch A; game buff 3492) ----
  // "Has Profane" holds always; "Gains Profane when inflicting Wilt or Deterioration" while the dummy carries Wilt or Deterioration;
  // "Minions have Profane" while a modeled Minion is out. Values: +7% additional Erosion Damage, +7% additional Wilt and Deterioration
  // Duration (game affixes 319376192, 334360768, 491988896 on the buff).
  const profaneLines = find(PATTERNS.profane);
  const profaneOnWilt = find(PATTERNS.profaneOnWilt);
  // "when inflicting" readers: your own ailments only (not those your Minions keep on the dummy, src/minion-ailment-types.js).
  const wiltOnDummy = inflictedAilments.some((name) => ["Wilt", "Deterioration"].includes(name));
  for (const line of profaneOnWilt) entry(line, wiltOnDummy, wiltOnDummy ? "the build inflicts Wilt or Deterioration: Profane refreshed (uptime 1; provisional)" : "the build inflicts no Wilt or Deterioration", { provisional: true });
  const hasProfane = profaneLines.length > 0 || (profaneOnWilt.length > 0 && wiltOnDummy);
  const minionsProfane = profaneLines.some((line) => line.clean.match(PATTERNS.profane)[1]) && Boolean(state.minionsCrit);
  for (const line of profaneLines) entry(line, true, `Profane held${line.clean.match(PATTERNS.profane)[1] ? (state.minionsCrit ? "; the modeled Minions hold it too" : "; no modeled Minion") : ""}`);
  if (hasProfane) {
    derive(`+${BUFF_VALUES.profane.percent}% additional Erosion Damage`, BUFF_VALUES.profane.source, "Profane held");
    derive(`+${BUFF_VALUES.profane.percent}% additional Wilt Duration`, BUFF_VALUES.profane.source, "Profane held");
  }
  // ---- Ferocity and God of War's Blessing (gear affix batch D) ----
  // "Gains Ferocity when dealing Physical Damage" (game affix 16567469: on dealing Physical damage, buff 3493 for 4 s): held while
  // the build deals Physical Damage on the dummy (uptime 1; provisional). Its -3% damage taken is defence; "Physical Damage cannot be
  // converted" would undo a partial conversion and is not modeled (a fully converting build deals no Physical, so never gains it).
  const ferocityLines = find(PATTERNS.ferocityOnPhysical);
  const hasFerocity = ferocityLines.length > 0 && Boolean(state.dealsPhysicalDamage);
  const ferocityBody = `+${BUFF_VALUES.ferocity.percent}% additional Physical Damage`;
  for (const line of ferocityLines) entry(line, hasFerocity, hasFerocity ? "the build deals Physical Damage on the dummy: Ferocity (4 s) refreshed (uptime 1; provisional); its -3% damage taken is defence and \"Physical Damage cannot be converted\" is not modeled" : "the build deals no Physical Damage", { provisional: true, bodies: [ferocityBody] });
  if (hasFerocity) derive(ferocityBody, BUFF_VALUES.ferocity.source, "Ferocity held", true);
  // "Gains N stack(s) of God of War's Blessing" (game affix 11688589: buff 3, permanent stacks): +0.5 Projectile Quantity per stack on
  // Projectile Skills, read as whole projectiles (rounded down; provisional); Movement Speed and Skill Area have no DPS effect on one
  // dummy; the fourth effect is unidentified (Partly modeled).
  const godOfWarLines = find(PATTERNS.godOfWarBlessing);
  const godOfWarStacks = godOfWarLines.reduce((total, line) => total + num(line.clean.match(PATTERNS.godOfWarBlessing)[1]) * (line.multiplier ?? 1), 0);
  const godOfWarQuantity = Math.floor(godOfWarStacks * BUFF_VALUES.godOfWar.projectileQuantityPerStack + 1e-9);
  for (const line of godOfWarLines) entry(line, true, `${godOfWarStacks} permanent stack(s): +${godOfWarQuantity} Projectile Quantity on Projectile Skills (0.5 per stack, whole projectiles; provisional); +10% Movement Speed and +10% Skill Area per stack have no DPS effect; the buff's fourth effect (game node 403, "percent 2" per stack) is not identified`, { provisional: true, status: "Partly modeled", bodies: godOfWarQuantity ? [`+${godOfWarQuantity} Projectile Quantity`] : [] });
  if (godOfWarQuantity) derive(`+${godOfWarQuantity} Projectile Quantity`, BUFF_VALUES.godOfWar.source, `${godOfWarStacks} stacks × 0.5`, true);
  if (minionsProfane) derive(`+${BUFF_VALUES.profane.percent}% additional Minion Erosion Damage`, BUFF_VALUES.profane.source, "Minions have Profane", true);

  // ---- Thrill Barrier (residual batch A-3) ----
  // Uptime = 1 − (1 − chance)^(inflictions in one duration), with one Elemental Ailment infliction per main-skill use (the
  // early use rate: a lower bound for builds whose hits inflict several; provisional). Value: reference data keyword +20% additional
  // Elemental Damage.
  const elementalOnDummy = buffs ? buffs.holds("ElementalAilment") : (state.enemyAilments || []).some((name) => ["Ignite", "Frostbite", "Frozen", "Freeze", "Numbed", "Shock"].includes(name));
  for (const line of find(PATTERNS.thrillBarrier)) {
    const match = line.clean.match(PATTERNS.thrillBarrier);
    const chance = Math.min(1, num(match[1]) * (line.multiplier ?? 1) / 100), seconds = num(match[2]);
    const rate = Math.max(0, Number(state.mainUsesPerSecond) || 0);
    const uptime = elementalOnDummy && rate > 0 ? 1 - (1 - chance) ** (rate * seconds) : 0;
    const value = round(BUFF_VALUES.thrillBarrier * uptime);
    entry(line, uptime > 0, uptime > 0 ? `Thrill Barrier uptime ${round(uptime * 100)}% (${round(chance * 100)}% per infliction, ${round(rate)} inflictions/s from the main skill's use rate, ${seconds} s; provisional)` : elementalOnDummy ? "no main-skill use rate" : "the build inflicts no Elemental Ailment", { provisional: true, bodies: [`+${value}% additional Elemental Damage`] });
    if (value > 0) derive(`+${value}% additional Elemental Damage`, line.source, `Thrill Barrier at ${round(uptime * 100)}% uptime`, true);
  }

  // ---- Ash (legendary audit batch 7; reference data keyword 10147: "Cannot inflict Critical Strike. +30% additional Fire Damage and +30%
  // Movement Speed. Unable to refresh") ----
  // Hot Night's Embrace / Illusory Chimera: "Every N time(s) a Fire Skill is cast, gains Ash for D s". The casts are every Fire skill use,
  // player and triggered (the recipe's counter has no gate on Ash). SS14 client (research/oq-aeterna-stack-modes-2026-11-04.md R7,
  // legendary-ash; 2026-11-04): affix 248970000's Ash is a node-306 carrier in mode 2, so a gain while Ash is up refreshes it to the full
  // D (the keyword's "unable to refresh" does not describe this carrier): uptime = min(1, D ÷ (N ÷ Fire casts/s)). Before 2026-11-04 a gain
  // while up was lost: D ÷ (the first multiple of the period that reaches D). Time-averaged: +30% × uptime additional Fire Damage and no
  // crits for that share ("-X% additional Critical Strike Rating" marked cannotCrit: label 3001211 wins over a guaranteed crit).
  for (const line of find(PATTERNS.ashGain)) {
    const [, every, seconds] = line.clean.match(PATTERNS.ashGain);
    // The hit pass's measured Fire casts per second (src/planner.js facts.fireCastsPerSecond); the early Main Skill rate meanwhile.
    const measured = Number.isFinite(state.fireCastsPerSecond) ? state.fireCastsPerSecond : null;
    const rate = Math.max(0, measured ?? (Number(state.mainUsesPerSecond) || 0));
    const fire = measured != null ? measured > 0 : (state.activeTags || new Set()).has("Fire");
    const period = rate > 0 ? num(every) / rate : Infinity;
    const duration = num(seconds);
    const uptime = fire && Number.isFinite(period) ? Math.min(1, duration / period) : 0;
    const value = round(BUFF_VALUES.ash * uptime), critLoss = round(100 * uptime);
    entry(line, uptime > 0, uptime > 0 ? `Ash uptime ${round(uptime * 100)}% (one gain per ${every} Fire casts at ${round(rate)} casts/s, ${duration} s, a gain while up refreshes it: SS14 client): +${value}% additional Fire Damage and no crits for that share (time-averaged; provisional)` : fire ? "no Main Skill use rate" : "no active Fire skill", { provisional: true, bodies: uptime > 0 ? [`+${value}% additional Fire Damage`, `-${critLoss}% additional Critical Strike Rating`] : [] });
    if (uptime > 0) { derive(`+${value}% additional Fire Damage`, line.source, `Ash at ${round(uptime * 100)}% uptime`, true); derive(`-${critLoss}% additional Critical Strike Rating`, line.source, `Ash at ${round(uptime * 100)}% uptime: no crits`, true, uptime); derived.at(-1).lineEffect.cannotCrit = true; }
  }

  // ---- Frantic Shadow (legendary audit batch 7): "N% chance to gain +X% Attack Speed for T s when Shadows hit enemies" ----
  // Uptime = 1 − (1 − chance)^(Shadow hits in T s), with the hit pass's measured Shadow hits per second (src/planner.js
  // facts.shadowHitsPerSecond); the three rolls are separate buffs, each time-averaged (provisional).
  for (const line of find(PATTERNS.shadowHitSpeed)) {
    const [, chance, value, seconds] = line.clean.match(PATTERNS.shadowHitSpeed);
    const rate = Number.isFinite(state.shadowHitsPerSecond) ? state.shadowHitsPerSecond : null;
    const uptime = rate > 0 ? 1 - (1 - Math.min(1, num(chance) * (line.multiplier ?? 1) / 100)) ** (rate * num(seconds)) : 0;
    const speed = round(num(value) * uptime);
    entry(line, uptime > 0, uptime > 0 ? `uptime ${round(uptime * 100)}% (${chance}% per Shadow hit, ${round(rate)} Shadow hits/s, ${seconds} s): +${speed}% Attack Speed time-averaged (provisional)` : rate === 0 ? "no Shadow hits the dummy" : "the Shadow hit rate is not measured yet", { provisional: true, bodies: uptime > 0 ? [`+${speed}% Attack Speed`] : [] });
    if (uptime > 0) derive(`+${speed}% Attack Speed`, line.source, `Frantic Shadow at ${round(uptime * 100)}% uptime`, true);
  }

  // ---- Fortitude (defence) and per-stack damage ----
  const fortitudeGain = find(PATTERNS.fortitudeGain);
  // Each gain line's chance (100% for "Gains a stack …"); the gains answer your own Melee uses (trigger 1000074). Measured by the hit
  // pass (state.meleeManualUsesPerSecond); before it, an active Melee skill holds the stacks (own buffs pre-built).
  const fortitudeChance = Math.min(1, sum(fortitudeGain.map((line) => { const match = line.clean.match(PATTERNS.fortitudeGain); return (match[1] == null ? 100 : num(match[1]) * (line.multiplier ?? 1)) / 100; })));
  const meleeUses = Number.isFinite(state.meleeManualUsesPerSecond) ? state.meleeManualUsesPerSecond : null;
  const hasFortitude = fortitudeGain.length > 0 && state.castsMelee && fortitudeChance > 0 && meleeUses !== 0;
  const fortitudeMax = BUFF_VALUES.fortitudeBaseMax + sum(find(PATTERNS.fortitudeExtra).map((line) => { const match = line.clean.match(PATTERNS.fortitudeExtra); return num(match[1] || match[2]) * (line.multiplier ?? 1); }));
  // A guaranteed gain on every use holds the max (pre-built). A chance gain holds min(max, chance × Melee uses/s × 10 s): each stack read
  // as its own 10 s (keyword 10000107), provisional (open question fortitude-chance-stacks).
  const fortitudeStacks = !hasFortitude ? 0 : fortitudeChance >= 1 || meleeUses === null ? fortitudeMax : Math.min(fortitudeMax, fortitudeChance * meleeUses * 10);
  // The stacks are damage where a "+X% additional damage per N stack(s) of Fortitude" line reads them (badge movement probe
  // 2026-10-27: Automatic Upgrade's gain line moved Hammer of Ash while it read No DPS effect).
  const fortitudeRead = hasFortitude && find(PATTERNS.fortitudeDamage).length > 0;
  for (const line of fortitudeGain) entry(line, hasFortitude, hasFortitude ? `${round(fortitudeStacks)} Fortitude stacks held${fortitudeChance < 1 && meleeUses !== null ? ` (${round(fortitudeChance * 100)}% chance × ${round(meleeUses)} Melee uses/s × 10 s, up to ${fortitudeMax}; provisional)` : ""} (defence: -5% Hit Damage taken each${fortitudeRead ? "; read by the per-stack damage line" : ""})` : meleeUses === 0 ? "no Melee skill you use yourself (its uses are all triggered; trigger 1000074)" : "no active Melee skill", { status: hasFortitude ? (fortitudeRead ? "In calc" : "No DPS effect") : "Inactive" });
  for (const line of find(PATTERNS.fortitudeExtra)) entry(line, hasFortitude, "Fortitude stack cap", { status: hasFortitude ? (fortitudeRead ? "In calc" : "No DPS effect") : "Inactive" });
  for (const line of find(PATTERNS.fortitudeDamage)) {
    const match = line.clean.match(PATTERNS.fortitudeDamage);
    // Whole steps of the held stacks; a chance gain's expected stacks are a time average (no floor on the average: provisional).
    const steps = fortitudeChance >= 1 || meleeUses === null ? Math.floor(fortitudeStacks / num(match[2])) : fortitudeStacks / num(match[2]);
    const value = round(num(match[1]) * (line.multiplier ?? 1) * steps);
    entry(line, value > 0, value > 0 ? `${fortitudeStacks} Fortitude stacks held (own buffs pre-built)` : "no Fortitude stacks", { bodies: [`+${value}% additional damage`] });
    if (value > 0) derive(`+${value}% additional damage`, line.source, `${fortitudeStacks} Fortitude stacks`);
  }

  // ---- Elixir Skills (core audit B8, src/elixir-model.js; Sage's Basic Scent Bottle Elixir joins from src/sage-traits.js) ----
  // Uptime on the dummy comes only from "Elixir Skills gain N Charging Progress every second" (the dummy is never defeated); each
  // value line of an up Elixir Effect becomes a time-averaged derived line × Elixir Skill Effect (Tailored Remedy included).
  const elixirSetups = Array.isArray(state.elixirSetups) ? state.elixirSetups : [];
  const hasElixir = elixirSetups.length > 0 || Boolean(state.elixirSkill);
  // Sage (hero trait audit B8): the Scent Bottle setup is in state.elixirSetups; Scent of Ambition's and Everlasting Nectar's Elixir
  // Skill Effect lines (time-averaged, src/sage-traits.js) join the engine's lines.
  const elixirs = hasElixir ? resolveElixirs({ elixirs: elixirSetups, lines: [...lines, ...(state.sage?.elixirExtraLines || [])] }) : null;
  for (const item of elixirs?.derived || []) derive(item.text, item.source, item.conditionText, true, item.uptime);
  const elixirBodies = (elixirs?.derived || []).map((item) => item.text);
  const elixirUp = (elixirs?.setups || []).some((setup) => setup.uptime > 0);
  const elixirStateText = elixirs?.setups?.length ? elixirs.setups.map((setup) => elixirSetupText(setup, elixirs)).join(" | ") : "no Elixir Skill on the skill board";
  // A line that acts only through the Elixir Effects: In calc where an Elixir Effect with a value line is up (its bodies are the
  // time-averaged Elixir lines, judged by their readers), Not on dummy where no Elixir recharges on the dummy, No DPS effect where
  // the Elixirs restore Life / Mana or carry no value line.
  const elixirScaled = (line, blocked = null) => {
    if (!hasElixir || !elixirs.setups.length) return entry(line, false, "no Elixir Skill on the skill board", { status: "Inactive" });
    if (blocked) return entry(line, false, blocked, { status: "Inactive", provisional: true });
    if (!elixirs.setups.some((setup) => setup.kind === "effect")) return entry(line, false, elixirStateText, { status: "No DPS effect" });
    if (!elixirUp) return entry(line, false, elixirStateText, { status: "Not on dummy" });
    if (!elixirBodies.length) return entry(line, false, `${elixirStateText}: the Elixir Effects carry no value line the planner can average`, { status: "Not modeled" });
    return entry(line, true, elixirStateText, { provisional: true, bodies: elixirBodies });
  };
  for (const line of find(PATTERNS.elixirProgress)) elixirScaled(line);
  for (const line of find(PATTERNS.elixirEffect)) elixirScaled(line);
  for (const line of find(PATTERNS.elixirAdditionalEffect)) elixirScaled(line);
  for (const line of find(PATTERNS.elixirDuration)) elixirScaled(line);
  for (const line of find(PATTERNS.tailoredRemedy)) {
    const own = (elixirs?.tailored || []).find((item) => item.source === line.source && item.text === line.clean);
    elixirScaled(line, own && !own.holds && elixirUp ? `${own.count} Elixir Skills ${/affected/i.test(own.text) ? "up" : "equipped"}, more than ${own.limit} (a build with more is not split by time: provisional)` : null);
  }
  for (const line of find(PATTERNS.restorationKept)) entry(line, false, "Restoration Effects (Life / Mana recovery) only", { status: "No DPS effect" });
  for (const line of find(PATTERNS.miraculousGain)) {
    if (!hasElixir || !elixirs.setups.length) entry(line, false, "no Elixir Skill on the skill board", { status: "Inactive" });
    else if (!elixirs.setups.some((setup) => setup.castsPerSecond > 0)) entry(line, false, `${elixirStateText}: no Elixir Skill is cast on the dummy`, { status: "Not on dummy" });
    else { const gain = miraculousGainState(elixirs, [line]); entry(line, Boolean(gain), gain ? gain.text : `${elixirStateText}: no Elixir cast`, { provisional: true, status: gain ? "Partly modeled" : "Not on dummy" }); }
  }
  const elixirRead = [PATTERNS.elixirActive, PATTERNS.elixirProgress, PATTERNS.elixirEffect, PATTERNS.elixirAdditionalEffect, PATTERNS.elixirDuration, PATTERNS.tailoredRemedy, PATTERNS.restorationKept, PATTERNS.miraculousGain, PATTERNS.elixirBlessings, PATTERNS.elixirCastRecently, PATTERNS.elixirPerCastRecently];
  for (const line of find(PATTERNS.elixirBlessings)) entry(line, hasElixir, hasElixir ? "an Elixir Skill on the skill board is cast during the fight: a gain source of every Blessing (src/blessing-model.js; provisional)" : "no Elixir Skill on the skill board", { provisional: true });
  // Legendary audit batch 1 (2026-10-22): lines that hold while an Elixir Skill is active, or after one was cast recently (4 s, game
  // hyperlink 103), read from the Elixir model's casts and uptimes. "While active": the share of time some Elixir is up, 1 − Π(1 −
  // each Elixir's active share) (independent casts: provisional); "cast recently": min(1, casts per second × 4 s) (regular casts);
  // "for every Elixir Skill cast recently, stacks up to N": min(N, casts per second × 4 s). Each body is time-averaged (its value ×
  // the share), as the Elixir Effects are (src/elixir-model.js). A body with no linear value ("Damage dealt is guaranteed to inflict
  // Wilt", "+N% Elixir Skill Effect for every Elixir Skill cast recently") stays unread.
  const elixirShare = elixirs?.setups?.length ? 1 - elixirs.setups.reduce((product, setup) => product * (1 - Math.max(0, Math.min(1, setup.activeShare ?? setup.uptime ?? 0))), 1) : 0;
  const elixirCastsPerSecond = sum((elixirs?.setups || []).map((setup) => Number(setup.castsPerSecond) || 0));
  const elixirRecent = Math.min(1, elixirCastsPerSecond * RECENT_SECONDS);
  const elixirBodies2 = (body) => { const both = body.match(/^([+-]\d+(?:\.\d+)?)% (additional )?damage (?:and Minion Damage|for you and your Minions)$/i); return both ? [`${both[1]}% ${both[2] || ""}damage`, `${both[1]}% ${both[2] || ""}Minion Damage`] : [body]; };
  const elixirTimed = (line, body, factor, how) => {
    if (!hasElixir || !elixirs?.setups?.length) return entry(line, false, "no Elixir Skill on the skill board", { status: "Inactive" });
    if (!(factor > 0)) return entry(line, false, `${elixirStateText}: no Elixir Skill is cast on the dummy (the dummy is never defeated, so only Charging Progress per second recharges one)`, { status: "Not on dummy" });
    if (/Elixir Skill Effect|guaranteed to inflict/i.test(body)) return entry(line, false, `${elixirStateText}: this body has no time-averaged reader (provisional)`, { status: "Not modeled" });
    const bodies = elixirBodies2(body).map((item) => scaleLeadingNumber(item, factor * (line.multiplier ?? 1))).filter(Boolean);
    if (!bodies.length) return entry(line, false, `${elixirStateText}: the body has no value to average`, { status: "Not modeled" });
    entry(line, true, `${how} → ×${round(factor)} (time-averaged; provisional)`, { provisional: true, bodies });
    for (const text of bodies) derive(text, line.source, how, true);
  };
  for (const line of find(PATTERNS.elixirActive)) elixirTimed(line, line.clean.match(PATTERNS.elixirActive)[1], elixirShare, `an Elixir Skill is active ${round(elixirShare * 100)}% of the time (${elixirStateText})`);
  for (const line of find(PATTERNS.elixirCastRecently)) elixirTimed(line, line.clean.match(PATTERNS.elixirCastRecently)[1], elixirRecent, `an Elixir Skill cast in the last ${RECENT_SECONDS} s ${round(elixirRecent * 100)}% of the time (${round(elixirCastsPerSecond)} casts/s)`);
  for (const line of find(PATTERNS.elixirPerCastRecently)) {
    const match = line.clean.match(PATTERNS.elixirPerCastRecently); const stacks = Math.min(num(match[2]), elixirCastsPerSecond * RECENT_SECONDS);
    // "+X% Elixir Skill Effect for every Elixir Skill cast recently" (Elixir Fairies, recipe 8977413; 2026-10-28): the Elixir model reads it
    // into the Elixir Skill Effect (src/elixir-model.js ELIXIR_EFFECT_PER_CAST_LINE), so it is not derived here.
    if (/^\+?\d+(?:\.\d+)?% Elixir Skill Effect$/i.test(match[1].trim()) && hasElixir && stacks > 0) { entry(line, true, `${round(stacks)} Elixir casts in the last ${RECENT_SECONDS} s (${round(elixirCastsPerSecond)} casts/s, up to ${match[2]}): +${round(num(match[1].replace(/^\+/, "").replace(/%.*$/, "")) * stacks)}% Elixir Skill Effect, read by the Elixir model (provisional)`, { provisional: true, status: "In calc" }); continue; }
    elixirTimed(line, match[1], stacks, `${round(stacks)} Elixir casts in the last ${RECENT_SECONDS} s (${round(elixirCastsPerSecond)} casts/s, up to ${match[2]})`);
  }
  for (const line of find(PATTERNS.elixirOther).filter((line) => !elixirRead.some((re) => re.test(line.clean)))) entry(line, false, "Elixir Skill effects are not modeled", { status: hasElixir ? "Not modeled" : "Inactive" });

  // ---- Storm's Command (core audit B8, src/storm-command.js) ----
  // +X% additional Attack Damage per different Warcry cast in the last 8 s; each Warcry on the board cast on cooldown (best-case
  // switch warcriesOnCooldown).
  const stormLines = find(PATTERNS.stormCommand);
  const stormCommand = resolveStormCommand({ lines: stormLines, warcries: Array.isArray(state.warcrySetups) ? state.warcrySetups : [], modifierTexts: lines, castOnCooldown: conditionOn("warcriesOnCooldown"), attackHits: Boolean(state.attackHits) });
  for (const line of stormLines) entry(line, stormCommand.active, stormCommand.reason, { provisional: stormCommand.active, bodies: stormCommand.derivedText ? [stormCommand.derivedText] : [], status: stormCommand.active ? "In calc" : "Inactive" });
  if (stormCommand?.derivedText) derive(stormCommand.derivedText, `Storm's Command (${stormCommand.sources.join(", ")})`, stormCommand.reason, true);

  // ---- enemy debuffs ----
  // Audit of debuffs held from t = 0 in the 5 s / 20 s windows (pact scripted-effects batch 2026-10-13; the dummy starts clean):
  //   built from zero now (src/timed-effects.js): the Ice Cage, the "Every N s … Stacks up to M" debuff (Impending), Numbed
  //   (one stack per main-skill use), Witch Antelope's Paralysis turns, Melting Flames, Purgatory (src/hero-trait-modules.js);
  //   correct as held: Frail, the Infiltrations, Spell-hit resistance shred, on-hit Paralysis (4 s base duration, refreshed by
  //   hits), Frostbite and Freeze (a fixed rating on the first Cold hit), skill and gear-triggered curses (applied by the first
  //   cast or hit), Blizzard's hit debuff (6 s, refreshed every 2 s), Crimson Tide (from the first Terra cast) and the
  //   "damage taken by Nearby enemies" auras: each lands with the first hit or cast, which every window starts with. Own
  //   speed buffs that build per second (Starcatcher) stay held when prebuiltSelfBuffs is off (the windows do not vary use
  //   rates over time; provisional).
  const debuffs = { frail: false, frailOwn: false, infiltration: new Set(), paralysis: 0, frostbiteRating: 0, frozen: false, numbedStacks: 0 };
  const dealt = state.dealtTypes || new Set();
  for (const line of find(PATTERNS.frail)) { const active = Boolean(state.dealsSpellDamage); debuffs.frail ||= active; debuffs.frailOwn ||= active; entry(line, active, active ? "the build deals Spell Damage: Frail held on the dummy (duration not sourced; uptime 1, provisional)" : "the build deals no Spell Damage", { provisional: true, bodies: [`+${BUFF_VALUES.frail}% additional Spell Damage taken`] }); }
  // "Nearby enemies within N m have Frail": an explicit radius holds at the chosen distance (src/dummy-target.js: close to the
  // dummy, or 6 m away in the Distant alternative). Before 2026-10-12 it needed N ≥ 10 (the 10 m stand-in).
  for (const line of find(PATTERNS.frailNearby)) { const radius = num(line.clean.match(PATTERNS.frailNearby)[1]); const active = explicitRadiusHolds(radius, state.nearTarget); debuffs.frail ||= active; debuffs.frailOwn ||= active; entry(line, active, active ? `the player stands ${state.nearTarget === false ? `${DISTANT_STANDING_METERS} m away (Distant alternative)` : "close to the dummy (best case)"}, inside ${radius} m: Frail held` : `the Distant alternative stands ${DISTANT_STANDING_METERS} m away, outside ${radius} m`, { bodies: [`+${BUFF_VALUES.frail}% additional Spell Damage taken`] }); }
  // The follower's support affixes (src/follower-model.js AFFIX_MARKERS, 2026-10-19): Frail or an Infiltration the follower
  // keeps on the dummy while its skill hits it (uptime 1 at its cadence, provisional); one debuff of a kind whoever inflicts it.
  for (const line of find(PATTERNS.followerDebuff)) {
    const what = line.clean.match(PATTERNS.followerDebuff)[1];
    const type = /Infiltration/i.test(what) ? what.split(" ")[0][0].toUpperCase() + what.split(" ")[0].slice(1).toLowerCase() : null;
    if (type) debuffs.infiltration.add(type); else debuffs.frail = true;
    entry(line, true, `the follower keeps ${type ? `${type} Infiltration` : "Frail"} on the dummy while its skill hits it (uptime 1, provisional)`, { provisional: true, enemyDebuff: true, bodies: [type ? `+${BUFF_VALUES.infiltration}% additional ${type} Damage taken` : `+${BUFF_VALUES.frail}% additional Spell Damage taken`] });
  }
  if (debuffs.frail) passSet.add({ name: "Frail", inflictedBy: debuffs.frailOwn ? "you" : "follower", stage: "debuff", source: "Frail (keyword 10000102)" });
  const frailHeld = buffs ? passSet.holds("Frail") : debuffs.frail, frailOwn = buffs ? passSet.holds("Frail", { by: BY_YOU }) : debuffs.frailOwn;
  // Frail Effect (batch 7): scales the Frail you inflict; a Frail only the follower keeps is its own (as the follower's Paralysis is not
  // scaled by your inflicted Paralysis Effect).
  const frailEffect = sum(find(PATTERNS.frailEffect).map((line) => num(line.clean.match(PATTERNS.frailEffect)[1]) * (line.multiplier ?? 1)));
  for (const line of find(PATTERNS.frailEffect)) entry(line, frailOwn, frailOwn ? "scales the Frail you keep on the dummy (game recipe 540757504: Status Effect on Frail)" : frailHeld ? "the Frail on the dummy is the follower's: your Frail Effect does not scale it" : "no Frail source");
  if (frailHeld) derive(`+${round(BUFF_VALUES.frail * (frailOwn ? 1 + frailEffect / 100 : 1))}% additional Spell Damage taken`, "Frail (keyword 10000102)", "Frail on the dummy", true);
  // "+X% additional damage taken by Nearby enemies / enemies in Proximity": Nearby is within 6 m and Proximity within 4 m
  // (reference data keyword tooltips, Q-G9 answered 2026-10-12). The player stands close (best case), so it holds; the Distant
  // alternative of the Distance group (6 m away) drops it.
  for (const line of find(PATTERNS.takenNearby)) {
    const value = round(num(line.clean.match(PATTERNS.takenNearby)[1]) * (line.multiplier ?? 1));
    const near = state.nearTarget !== false;
    entry(line, near, near ? `the player stands close to the dummy (best case): inside Nearby (${KEYWORD_RADII_METERS.nearby} m) and Proximity (${KEYWORD_RADII_METERS.proximity} m), keyword radii` : `the Distant alternative stands ${DISTANT_STANDING_METERS} m away: not Nearby / in Proximity`, { bodies: [`+${value}% additional damage taken`] });
    if (near) derive(`+${value}% additional damage taken`, line.source, "Nearby enemy (reference data radius: within 6 m)");
  }
  for (const line of find(PATTERNS.takenWithin)) {
    const m = line.clean.match(PATTERNS.takenWithin);
    const value = round(num(m[1] ?? m[4]) * (line.multiplier ?? 1));
    const type = m[2] ? `${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()} ` : "";
    const meters = m[3] ?? m[5];
    const active = meters !== undefined ? explicitRadiusHolds(num(meters), state.nearTarget) : state.nearTarget !== false;
    const body = `+${value}% additional ${type ? `${type}Damage` : "damage"} taken`;
    entry(line, active, active ? `the player stands ${state.nearTarget === false ? `${DISTANT_STANDING_METERS} m away (Distant alternative)` : "close to the dummy (best case)"}${meters !== undefined ? `, inside ${meters} m` : ", inside Nearby / Proximity (reference data radii)"}` : `the Distant alternative stands ${DISTANT_STANDING_METERS} m away${meters !== undefined ? `, outside ${meters} m` : ""}`, { bodies: [body] });
    if (active) derive(body, line.source, "enemy within the line's radius");
  }
  // Stacking enemy debuff: held at its stack cap. The dummy starts clean and the stacks build over stacks × interval seconds
  // (1.25 s for Impending), which the 5 s / 20 s windows do not ramp: provisional.
  for (const line of find(PATTERNS.takenStacking)) {
    const m = line.clean.match(PATTERNS.takenStacking);
    const stacks = num(m[4]), value = round(num(m[2]) * stacks * (line.multiplier ?? 1));
    const active = state.ownDamage !== false && explicitRadiusHolds(num(m[3]), state.nearTarget);
    // Audit of held debuffs (pact scripted-effects batch 2026-10-13): the stacks build on the clean dummy, 1 at t = 0 and 1 more
    // every interval (src/timed-effects.js ramp; whether the first lands at t = 0 or after one interval is not sourced: provisional).
    const interval = num(m[1]), perStack = num(m[2]) * (line.multiplier ?? 1);
    entry(line, active, active ? `the dummy within ${m[3]} m: ${stacks} stacks in sustained figures; the 5 s / 20 s windows build them on the clean dummy, 1 at t = 0 and 1 more every ${interval} s (full after ${round(interval * (stacks - 1))} s; provisional)` : state.ownDamage === false ? "only Minions deal damage: the record writes on your own damage" : `outside ${m[3]} m`, { provisional: true, enemyDebuff: true, bodies: [`+${value}% additional damage taken`] });
    if (active) {
      derive(`+${value}% additional damage taken`, line.source, `${stacks} stacks of a stacking debuff (built from zero in the windows)`, true);
      // Impending, game record 362743 (chunk 4, 2026-11-01): buff 20130 holds no affix; the bonus is a write on your own damage (trigger
      // 1000031, attr 5719), with no Minion row, so Minion hits do not take it.
      derived.at(-1).ownDamageOnly = true;
      timedEffects.push({ id: `stackingDebuff:${line.source}`, label: `${line.source}: stacking debuff`, source: line.source, target: "enemy", toggle: false, enabled: true, active: true, parts: [{ type: null, reach: "all", percent: perStack, schedule: { kind: "ramp", maxStacks: stacks, intervalSeconds: interval, startStacks: 1 } }] });
    }
  }
  // Resistance shred on a Spell hit of a type (chunk 3): held while a Spell hit deals that type (uptime 1: a modeled Spell
  // hits far more often than once per 3 s; provisional). The reduction is applied as an equal penetration (the dummy's
  // resistance is 30%, so the two coincide there; their difference below 0% resistance is not modeled: provisional).
  // Resistance change on enemies within a radius of the player (legendary audit batch 1): held while the dummy stands inside it
  // (within 10 m in the near case; the Distant alternative stands farther), applied as penetration of the opposite sign, as the
  // Spell-hit shred below (provisional, open question legendary-enemy-resistance-radius).
  for (const line of find(PATTERNS.enemyResistanceWithin)) {
    const match = line.clean.match(PATTERNS.enemyResistanceWithin);
    const value = round(num(match[1]) * (line.multiplier ?? 1));
    const radius = num(match[3]);
    const active = explicitRadiusHolds(radius, state.nearTarget) && value !== 0;
    const types = /and Erosion/i.test(match[2]) ? ["Elemental", "Erosion"] : [match[2][0].toUpperCase() + match[2].slice(1).toLowerCase()];
    const bodies = types.map((type) => `${-value >= 0 ? "+" : ""}${round(-value)}% ${type} Resistance Penetration`);
    entry(line, active, active ? `the dummy stands within ${radius} m (${state.nearTarget === false ? `Distant alternative, ${DISTANT_STANDING_METERS} m` : "near case: within 10 m"}): ${value > 0 ? "+" : ""}${value}% ${match[2]} Resistance held on it, applied as ${bodies.join(" and ")} (provisional)` : `the Distant alternative stands ${DISTANT_STANDING_METERS} m away, outside ${radius} m`, { provisional: true, bodies });
    if (active) for (const body of bodies) derive(body, line.source, `enemies within ${radius} m: ${value > 0 ? "+" : ""}${value}% ${match[2]} Resistance (provisional)`, true);
  }
  for (const line of find(PATTERNS.spellHitShred)) {
    const match = line.clean.match(PATTERNS.spellHitShred);
    const type = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
    const value = round(num(match[2]) * (line.multiplier ?? 1));
    const targets = match[3].split(/,\s*(?:and\s+)?|\s+and\s+/).map((word) => word.trim()).filter(Boolean);
    const active = Boolean(state.spellHitTypes?.has?.(type));
    const bodies = targets.map((target) => `+${value}% ${target} Penetration`);
    entry(line, active, active ? `a Spell hit deals ${type} Damage: -${value}% ${targets.join(", ")} Resistance held (uptime 1; applied as penetration, provisional)` : `no Spell hit deals ${type} Damage`, { provisional: true, bodies });
    if (active) for (const body of bodies) derive(body, line.source, `Spell hit ${type} Damage (resistance shred, provisional)`, true);
  }
  for (const line of find(PATTERNS.infiltrationOnHit)) {
    const match = line.clean.match(PATTERNS.infiltrationOnHit);
    const type = match[1] || match[2];
    const typeWord = type[0].toUpperCase() + type.slice(1).toLowerCase();
    // "when dealing damage" is trigger 1000031 (game records 69093904, 923795264, 984191424): a hit or a DoT's value being set (proven:
    // client 0x141c337c0), so a DoT of yours holds it too (wiring audit W2 gap 4, 2026-11-03); "on hit" is your hits.
    const onHit = /on hit/i.test(line.clean), viaDot = !onHit && !state.anyHit && Boolean(state.dealsDamageOverTime);
    const active = Boolean(state.anyHit) || viaDot;
    if (active) debuffs.infiltration.add(typeWord);
    entry(line, active, active ? (viaDot ? `your damage over time sets its value on the dummy (trigger 1000031): ${typeWord} Infiltration held (uptime 1, provisional)` : `the build hits the dummy: ${typeWord} Infiltration held (uptime 1, provisional)`) : onHit ? "no modeled hit" : "no damage of yours (no hit or damage over time)", { provisional: true, bodies: [`+${BUFF_VALUES.infiltration}% additional ${typeWord} Damage taken`] });
  }
  for (const line of find(PATTERNS.infiltrationMinions)) {
    const type = line.clean.match(PATTERNS.infiltrationMinions)[1];
    const typeWord = type[0].toUpperCase() + type.slice(1).toLowerCase();
    const active = Boolean(state.minionsCrit);
    if (active) debuffs.infiltration.add(typeWord);
    entry(line, active, active ? `a modeled Minion deals damage to the dummy: ${typeWord} Infiltration held (uptime 1, provisional)` : "no modeled Minion", { provisional: true, bodies: [`+${BUFF_VALUES.infiltration}% additional ${typeWord} Damage taken`] });
  }
  for (const line of find(PATTERNS.lightningInfiltrationCrit)) { const active = Boolean(state.canCrit) && dealt.has("Lightning"); if (active) debuffs.infiltration.add("Lightning"); entry(line, active, active ? "the build crits with Lightning Damage: Lightning Infiltration held (uptime 1, provisional)" : "no crit with Lightning Damage", { provisional: true }); }
  const frostbitten = onDummy("Frostbite");
  const frostbiteTypeGroups = damageTypeGroups(state.dealtDamageTypes || state.dealtTypes);
  debuffs.frostbiteRating = frostbitten ? inflictedFrostbiteRating(modifierTexts, { typeGroups: frostbiteTypeGroups }) : 0;
  // Frostbite only from Discord of the Second Will: buff 112 on its turn in the rotation, so Cold Damage taken and the crowd control
  // count take that uptime (chunk 2, 2026-11-01). Readers of the Frostbitten state itself keep it held.
  const discordFrostbiteLine = frostbitten ? find(PATTERNS.discordCrowdControl).find((line) => (state.enemyAilmentSources || {}).Frostbite === line.source) ?? null : null;
  for (const line of find(MAX_FROSTBITE_PER_TYPE)) { const value = num(line.clean.match(MAX_FROSTBITE_PER_TYPE)[1]) * (line.multiplier ?? 1); const active = frostbitten && frostbiteTypeGroups > 0; entry(line, active, !frostbitten ? "the build inflicts no Frostbite" : `${frostbiteTypeGroups} damage type group${frostbiteTypeGroups === 1 ? "" : "s"} dealt (Physical / Elemental / Erosion): +${round(value * frostbiteTypeGroups)} Max Frostbite Rating → Frostbite Rating ${debuffs.frostbiteRating} (max 120; provisional)`, { provisional: true }); }
  // user-confirmed 2026-10-18: Frozen at 100 or higher (reference data says "more than 100").
  debuffs.frozen = frostbitten && debuffs.frostbiteRating >= BUFF_VALUES.frostbiteFreezeAt;
  // W8 step 3 (Group B): a Freeze this pass reaches with the per-type Max Frostbite Rating lines (Prophet's Dirge: the enemy-ailment
  // model's Freeze check counts no damage type group) is on the dummy for every Frozen reader, as the deemed Freeze below is (before, only
  // the crowd control counters saw it).
  if (debuffs.frozen && Array.isArray(state.enemyAilments) && !state.enemyAilments.includes("Frozen")) {
    state.enemyAilments.push("Frozen");
    const foreign = buffs && !buffs.holds("Frostbite", { by: BY_YOU }) ? buffs.entries("Frostbite").find((item) => item.inflictedBy !== "you")?.inflictedBy : null;
    state.enemyBuffs?.add?.({ name: "Frozen", source: "Frostbite Rating (src/combat-states.js)", reason: `Frostbite Rating ${debuffs.frostbiteRating} ≥ ${BUFF_VALUES.frostbiteFreezeAt} with ${frostbiteTypeGroups} damage type group${frostbiteTypeGroups === 1 ? "" : "s"} dealt`, inflictedBy: foreign || "you", stage: "combat" });
  }
  // First Flake of Strange Snow (B3): deemed Frostbite Rating per type of Crowd Control Effect, Ailment and Curse on the dummy.
  // Types: the dummy's ailments (Frostbite and Freeze one type each), Paralysis, and each curse (the curse skills, or one "Curse"
  // when only a granted curse holds); a Freeze the deemed rating reaches adds its own type (one step).
  let deemedFrostbite = null;
  {
    const deemedLines = find(PATTERNS.deemedFrostbite);
    if (deemedLines.length && frostbitten) {
      const [, per, cap] = deemedLines[0].clean.match(PATTERNS.deemedFrostbite).map(Number);
      const names = new Set((buffs ? buffs.types("Ailment") : state.enemyAilments || []).map((name) => name === "Frozen" ? "Freeze" : name));
      if (debuffs.paralysis) names.add("Paralysis");
      // The crowd control types held further down (Paralysis by chance, Weaken, Slow, Blind, Taunt, …): resolveCombatStates runs a
      // second time with the first run's types when they add one (2026-11-03: the deemed rating counted 5 types, not 6, before).
      for (const name of state.deemedCrowdControl || []) names.add(name === "Frozen" ? "Freeze" : name);
      for (const name of state.curseSkillNames || []) names.add(`Curse: ${name}`);
      if (targetCursed && !(state.curseSkillNames || []).length) names.add("Curse");
      const deemed = (count) => Math.min(cap, per * count);
      let bonus = deemed(names.size);
      if (!names.has("Freeze") && debuffs.frostbiteRating + bonus >= BUFF_VALUES.frostbiteFreezeAt) { names.add("Freeze"); bonus = deemed(names.size); }
      debuffs.frostbiteRating = round(debuffs.frostbiteRating + bonus);
      if (debuffs.frostbiteRating >= BUFF_VALUES.frostbiteFreezeAt && !debuffs.frozen) {
        debuffs.frozen = true;
        if (Array.isArray(state.enemyAilments) && !state.enemyAilments.includes("Frozen")) {
          state.enemyAilments.push("Frozen");
          // The same Frozen on the line-condition state's unit buff set (src/unit-buff-set.js), as a combat-pass entry: the list readers
          // see it, the per-type count (stage "model") does not, as before (W8 step 1).
          state.enemyBuffs?.add?.({ name: "Frozen", source: deemedLines[0].source, reason: "deemed Frostbite Rating ≥ 100 (First Flake of Strange Snow)", inflictedBy: "you", stage: "combat" });
        }
      }
      deemedFrostbite = { per, cap, types: [...names], bonus };
    }
    for (const line of deemedLines) entry(line, Boolean(deemedFrostbite), deemedFrostbite ? `${deemedFrostbite.types.length} type${deemedFrostbite.types.length === 1 ? "" : "s"} on the dummy (${deemedFrostbite.types.join(", ")}): +${deemedFrostbite.bonus} deemed Frostbite Rating (${deemedFrostbite.per} each, up to ${deemedFrostbite.cap}), ${debuffs.frostbiteRating} in all${debuffs.frozen ? ", Frozen" : ""} (provisional: on top of the inflicted rating, counts for Freeze)` : "the dummy is not Frostbitten", { provisional: true });
  }
  for (const line of find(PATTERNS.frostbiteCapRaise)) {
    const raw = uncappedFrostbiteRating(modifierTexts, frostbiteTypeGroups), moves = frostbitten && raw > BUFF_VALUES.frostbiteMaxRating;
    entry(line, moves, !frostbitten ? "the build inflicts no Frostbite" : moves ? `Frostbite Rating ${Math.min(raw, frostbiteRatingCap(modifierTexts))} past the 120 cap (up to ${frostbiteRatingCap(modifierTexts)})` : `the inflicted Frostbite Rating (${raw}) stays under the 120 cap, so the raised cap changes nothing`);
  }
  for (const line of find(PATTERNS.coldInfiltrationFrozen)) { if (debuffs.frozen) debuffs.infiltration.add("Cold"); entry(line, debuffs.frozen, debuffs.frozen ? "the dummy is Frozen" : "the dummy is not Frozen (Frostbite Rating < 100)"); }
  // ---- Legendary audit batch 2 (keyword values from the reference data hover cards, research/refdata-ss14-2026-10-22/legendary-keyword-hovers/) ----
  for (const line of find(PATTERNS.coldInfiltrationFrostbiteRating)) {
    const need = num(line.clean.match(PATTERNS.coldInfiltrationFrostbiteRating)[1]);
    const active = frostbitten && debuffs.frostbiteRating >= need && Boolean(state.anyHit);
    if (active) debuffs.infiltration.add("Cold");
    entry(line, active, !frostbitten ? "the build inflicts no Frostbite" : active ? `the dummy's Frostbite Rating ${debuffs.frostbiteRating} ≥ ${need}: Cold Infiltration held (uptime 1, provisional)` : `the dummy's Frostbite Rating ${debuffs.frostbiteRating} < ${need}`, { provisional: true, bodies: [`+${BUFF_VALUES.infiltration}% additional Cold Damage taken`] });
  }
  for (const line of find(PATTERNS.cageOnFrostbite)) {
    const interval = num(line.clean.match(PATTERNS.cageOnFrostbite)[1]);
    const stacks = frostbitten ? Math.min(4, Math.floor(5 / Math.max(1e-9, interval))) : 0;
    const value = round(((1 + 14 / 100) ** stacks - 1) * 100);
    entry(line, stacks > 0, stacks > 0 ? `Frostbite inflicted on every hit: a Cage stack every ${interval} s, each lasting 5 s: ${stacks} stacks held (max 4), +14% additional Cold Damage each (multiplies; own buff pre-built, provisional)` : "the build inflicts no Frostbite", { provisional: true, bodies: stacks ? [`+${value}% additional Cold Damage`] : [] });
    if (stacks > 0) derive(`+${value}% additional Cold Damage`, line.source, `${stacks} Cage stacks`, true);
  }
  for (const line of find(PATTERNS.throneAtMaxChannel)) {
    const cap = num(line.clean.match(PATTERNS.throneAtMaxChannel)[2]);
    const active = Boolean(state.channeledMain) && state.prebuiltSelfBuffs !== false;
    entry(line, active, active ? `channeling the Main Skill at max stacks: ${cap} Throne stacks held (own buff pre-built; +1% additional Channeled Skill Damage per stack; provisional)` : state.channeledMain ? "own buffs start cold (condition prebuiltSelfBuffs off)" : "no channeled Main Skill", { provisional: true, bodies: active ? [`+${cap}% additional Channeled Skill Damage`] : [] });
    if (active) derive(`+${cap}% additional Channeled Skill Damage`, line.source, `${cap} Throne stacks`, true);
  }
  for (const line of find(PATTERNS.comboLightningAttacks)) {
    const active = Boolean(state.castsAttack) && Boolean(state.anyHit);
    entry(line, active, active ? "an Attack hits the dummy far more often than Combo Lightning's 8 s: -10% Lightning Resistance held, applied as +10% Lightning Resistance Penetration (its minor damage not modeled; provisional)" : "no Attack Skill hits the dummy", { provisional: true, bodies: active ? ["+10% Lightning Resistance Penetration"] : [] });
    if (active) derive("+10% Lightning Resistance Penetration", line.source, "Combo Lightning held (provisional)", true);
  }
  for (const line of find(PATTERNS.barrageHitShred)) {
    const [, per, cap] = line.clean.match(PATTERNS.barrageHitShred);
    const active = Boolean(state.anyHit) && (state.activeTags || new Set()).has("Barrage");
    const value = round(num(per) * num(cap));
    entry(line, active, active ? `a Barrage Skill hits the dummy: ${cap} stacks held, -${value}% Elemental Resistance applied as +${value}% Elemental Resistance Penetration (provisional)` : "no Barrage Skill hits the dummy", { provisional: true, bodies: active ? [`+${value}% Elemental Resistance Penetration`] : [] });
    if (active) derive(`+${value}% Elemental Resistance Penetration`, line.source, `${cap} stacks (Barrage hits)`, true);
  }
  // Wilt stacks on the dummy: the Wilt model's steady stacks from the measuring pass (the cap meanwhile, as Open Wounds' Trauma).
  const wiltInflicted = inflictedAilments.includes("Wilt");
  for (const line of find(PATTERNS.wiltStackTaken)) {
    const [, per, cap] = line.clean.match(PATTERNS.wiltStackTaken);
    const measured = Number.isFinite(state.wilt?.steadyActiveStacks) ? state.wilt.steadyActiveStacks : null;
    const stacks = wiltInflicted ? Math.min(num(cap), measured ?? num(cap)) : 0;
    const value = round(((1 + num(per) * (line.multiplier ?? 1) / 100) ** stacks - 1) * 100);
    entry(line, value > 0, !wiltInflicted ? "the build inflicts no Wilt" : `${round(stacks)} Wilt stacks on the dummy (${measured != null ? "the Wilt model's steady stacks" : "held at the cap until the Wilt model measures them"}): +${per}% additional damage taken per stack, multiplying (provisional)`, { provisional: true, enemyDebuff: true, bodies: value > 0 ? [`+${value}% additional damage taken`] : [] });
    if (value > 0) derive(`+${value}% additional damage taken`, line.source, `${round(stacks)} Wilt stacks on the dummy`, true);
  }
  // Shadowmaster 6,0 (game record 736411: trigger 1000160 on your Wilt stacks, node 306 mode 3, 4 s, count P2; +P1% increased Erosion per
  // stack; chunk 3, 2026-11-01): each stack of Wilt inflicted is its own 4 s stack, so stacks = min(P2, Wilt stacks inflicted per second × 4 s),
  // the cap until the Wilt model measures the rate. Steady, not ramped (C7, provisional: open question talent-wilt-stack-timer).
  for (const line of find(PATTERNS.wiltStackErosion)) {
    const [, per, cap] = line.clean.match(PATTERNS.wiltStackErosion);
    const rate = Number(state.wilt?.stackRate);
    const stacks = !wiltInflicted ? 0 : Number.isFinite(rate) && rate > 0 ? Math.min(num(cap), rate * RECENT_SECONDS) : num(cap);
    const value = round(num(per) * (line.multiplier ?? 1) * stacks);
    entry(line, value > 0, !wiltInflicted ? "the build inflicts no Wilt" : `${round(stacks)} stacks (Wilt inflicted ${Number.isFinite(rate) && rate > 0 ? `${round(rate)} stacks/s × ${RECENT_SECONDS} s` : "often enough to hold the cap"}, up to ${cap}): +${value}% Erosion Damage (provisional)`, { provisional: true, bodies: value > 0 ? [`+${value}% Erosion Damage`] : [] });
    if (value > 0) derive(`+${value}% Erosion Damage`, line.source, `${round(stacks)} stacks of Wilt inflicted in ${RECENT_SECONDS} s`, true);
  }
  for (const line of find(PATTERNS.wiltDurationBelowStacks)) {
    const need = num(line.clean.match(PATTERNS.wiltDurationBelowStacks)[2]);
    const stacks = Number.isFinite(state.wilt?.steadyActiveStacks) ? state.wilt.steadyActiveStacks : null;
    const active = wiltInflicted && stacks != null && stacks < need;
    entry(line, active, !wiltInflicted ? "the build inflicts no Wilt" : stacks == null ? "the Wilt stacks on the dummy are not measured" : active ? `${round(stacks)} Wilt stacks < ${need} (steady): the duration bonus holds; its feedback on the stacks is not iterated (provisional)` : `${round(stacks)} Wilt stacks ≥ ${need}`, { provisional: true, bodies: active ? [`+${line.clean.match(PATTERNS.wiltDurationBelowStacks)[1]}% additional Wilt Duration`] : [] });
    if (active) derive(`+${line.clean.match(PATTERNS.wiltDurationBelowStacks)[1]}% additional Wilt Duration`, line.source, `${round(stacks)} Wilt stacks < ${need}`, true);
  }
  // Laceration: stacks = min(30, Trauma stacks inflicted per second × 5 s) (the cap until the Trauma model measures the rate); each
  // +8% additional Physical Damage, summed (provisional), × (1 + Laceration Effect: +X% per Trauma stack on the dummy). Its self-damage
  // (50 True Damage per second, Mana and Energy Shield removal) is defence.
  for (const line of find(PATTERNS.lacerationOnTrauma)) {
    const inflicted = traumaInflicted;
    const rate = Number(state.trauma?.stackRate);
    const stacks = !inflicted ? 0 : Number.isFinite(rate) && rate > 0 ? Math.min(30, rate * 5) : 30;
    const traumaStacks = !inflicted ? 0 : Number.isFinite(state.trauma?.steadyActiveStacks) ? state.trauma.steadyActiveStacks : Math.max(1, Number(state.trauma?.stackLimit) || 1);
    const effect = sum(find(PATTERNS.lacerationEffectPerTrauma).map((item) => num(item.clean.match(PATTERNS.lacerationEffectPerTrauma)[1]) * (item.multiplier ?? 1))) * traumaStacks;
    const value = round(8 * stacks * (1 + effect / 100));
    entry(line, value > 0, !inflicted ? "the build inflicts no Trauma" : `${round(stacks)} Laceration stacks (Trauma inflicted ${Number.isFinite(rate) && rate > 0 ? `${round(rate)}/s × 5 s` : "often enough to hold the cap"}, max 30) × 8% additional Physical Damage${effect ? ` × (1 + ${round(effect)}% Laceration Effect from ${round(traumaStacks)} Trauma stacks)` : ""} (summed; provisional)`, { provisional: true, bodies: value > 0 ? [`+${value}% additional Physical Damage`] : [] });
    if (value > 0) derive(`+${value}% additional Physical Damage`, line.source, `${round(stacks)} Laceration stacks`, true);
  }
  for (const line of find(PATTERNS.lacerationEffectPerTrauma)) entry(line, find(PATTERNS.lacerationOnTrauma).length > 0 && traumaInflicted, "scales Laceration (read with its gain line)", { provisional: true });
  for (const line of find(PATTERNS.sentryProximityTaken)) {
    const value = num(line.clean.match(PATTERNS.sentryProximityTaken)[1]) * (line.multiplier ?? 1);
    const active = (state.sentrySkills || []).length > 0;
    entry(line, active, active ? `a Sentry (${state.sentrySkills.join(", ")}) is deployed at the dummy: +${value}% additional damage taken (provisional)` : "no modeled Sentry Skill", { provisional: true, bodies: active ? [`+${value}% additional damage taken`] : [] });
    if (active) derive(`+${value}% additional damage taken`, line.source, "enemy in proximity to a Sentry (provisional)", true);
  }
  // Broken Sun Ring's Solar Ring / Corona (keyword hovers 10166 / 10167; game buffs 35107 / 35108): the ring's radius is not
  // published, so the best case (user rule 2026-10-09: best-case distance) stands the player so the dummy is inside it; the line
  // "considered to be within 3m of you" then holds too (the near case already does). Provisional: open question legendary-solar-ring.
  for (const line of find(PATTERNS.solarRingTaken)) {
    const [, ring, percent] = line.clean.match(PATTERNS.solarRingTaken);
    const value = num(percent) * (line.multiplier ?? 1);
    entry(line, true, `best case: the dummy stands inside the ${ring} (its radius is not published): +${value}% additional damage taken (provisional)`, { provisional: true, enemyDebuff: true, bodies: [`+${value}% additional damage taken`] });
    derive(`+${value}% additional damage taken`, line.source, `the dummy inside the ${ring} (best case, provisional)`, true);
  }
  for (const line of find(PATTERNS.solarRingNear)) entry(line, state.nearTarget !== false, state.nearTarget !== false ? "the dummy counts as within 3 m (the near case holds anyway)" : "the Distant alternative: the ring's 3 m rule is not modeled there", { provisional: true });
  for (const line of find(PATTERNS.infiltrationCursedBy)) {
    const [, type, curse] = line.clean.match(PATTERNS.infiltrationCursedBy);
    const typeWord = type[0].toUpperCase() + type.slice(1).toLowerCase();
    const active = (state.curseSkillNames || []).some((name) => name.toLowerCase() === curse.trim().toLowerCase());
    if (active) debuffs.infiltration.add(typeWord);
    entry(line, active, active ? `${curse} is on the dummy: ${typeWord} Infiltration held (uptime 1, provisional)` : `${curse} is not on the dummy (no active ${curse} curse within the curse limit)`, { provisional: true, enemyDebuff: true, bodies: [`+${BUFF_VALUES.infiltration}% additional ${typeWord} Damage taken`] });
  }
  for (const line of find(PATTERNS.coldInfiltrationFrostbitten)) { if (frostbitten) debuffs.infiltration.add("Cold"); entry(line, frostbitten, frostbitten ? "the dummy is Frostbitten" : "the build inflicts no Frostbite"); }
  // "Inflicts Fire Infiltration when dealing Fire Damage to Ignited enemies" (885067264: trigger 1000030 on your Fire damage, tag 5001130,
  // to a target in state 4000130 Ignited; buff 3441) and "+X% Fire Penetration against Ignited enemies" (391400 / 101010706: attr 5104 on
  // the target state 4000130) read the dummy's Ignite whoever inflicted it (wiring audit gap 2d, 2026-11-03): your own, or your Minions'
  // at its uptime (src/minion-ailment-types.js). On the Scorching Beam path they stay the beam and Ignite ledgers' own talent keys
  // (src/scorching-beam-hit.js conditions.fireInfiltration, src/theoretical-sources.js "vs Ignited enemies"); elsewhere they hold here, on
  // every Fire hit and Fire DoT of yours: the Infiltration as Fire Infiltration on the dummy, the penetration as a plain line × the share.
  const ignitedShare = buffs ? buffs.share("Ignite") : (state.enemyAilments || []).includes("Ignite") ? Math.min(1, Math.max(0, Number(state.enemyAilmentUptime?.Ignite ?? 1))) : 0;
  const dealsFireOwn = state.ownDamage !== false && (state.dealtDamageTypes || dealt).has("Fire");
  let fireInfiltrationIgnitedShare = 0;
  for (const line of state.beamActive ? [] : find(PATTERNS.fireInfiltrationIgnited)) {
    const active = !state.beamActive && ignitedShare > 0 && dealsFireOwn;
    if (active && ignitedShare >= 1) debuffs.infiltration.add("Fire"); else if (active) fireInfiltrationIgnitedShare = Math.max(fireInfiltrationIgnitedShare, ignitedShare);
    entry(line, active, state.beamActive ? "the Scorching Beam path reads it in its own ledgers (the beam's Ignite keeps the dummy Ignited)" : !(ignitedShare > 0) ? "the dummy is not Ignited" : !dealsFireOwn ? "the build deals no Fire Damage of its own" : `the dummy is Ignited${ignitedShare < 1 ? ` ${round(ignitedShare * 100)}% of the time (by your Minions)` : ""} and the build deals Fire Damage: Fire Infiltration on the dummy (game affix 885067264; provisional)`, { provisional: true, enemyDebuff: true });
  }
  for (const line of state.beamActive ? [] : find(PATTERNS.firePenetrationIgnited)) {
    const value = num(line.clean.match(PATTERNS.firePenetrationIgnited)[1]) * (line.multiplier ?? 1);
    const active = !state.beamActive && ignitedShare > 0 && dealsFireOwn;
    if (active) derive(`+${round(value * ignitedShare)}% Fire Penetration`, line.source, `the dummy is Ignited${ignitedShare < 1 ? ` ${round(ignitedShare * 100)}% of the time (by your Minions; time-averaged)` : ""}`, true);
    entry(line, active, state.beamActive ? "the Scorching Beam path reads it in its own ledgers (the beam's Ignite keeps the dummy Ignited)" : !(ignitedShare > 0) ? "the dummy is not Ignited" : !dealsFireOwn ? "the build deals no Fire Damage of its own" : `the dummy is Ignited${ignitedShare < 1 ? ` ${round(ignitedShare * 100)}% of the time (by your Minions)` : ""}: +${round(value * ignitedShare)}% Fire Penetration on your Fire damage (game affix 391400; provisional)`, { provisional: true, bodies: [`+${round(value * ignitedShare)}% Fire Penetration`] });
  }
  for (const line of find(PATTERNS.penetrating)) {
    // Game record 425153344: trigger 1000030 on your own damage of each type, no Minion row (chunk 4, 2026-11-01). `dealt` always carries
    // Fire, so read the types the build really deals, and none when only Minions deal damage.
    const own = state.ownDamage === false ? new Set() : state.dealtDamageTypes || dealt;
    const types = ["Fire", "Lightning", "Cold"].filter((type) => own.has(type));
    for (const type of types) debuffs.infiltration.add(type);
    entry(line, types.length > 0, types.length ? `inflicts ${types.join(", ")} Infiltration (the types the build deals; uptime 1, provisional)` : "the build deals no Elemental Damage", { provisional: true });
  }
  // Mercury Baptism (Rosa – Unsullied Blade, hero trait audit B11; src/rosa-traits.js): the Infiltration of the largest recorded
  // Elemental type, held for the Realm of Mercury's time share (provisional). A full share joins the held set; a partial one adds its
  // time-averaged value below unless another source already holds that type.
  const rosaInfiltration = state.rosa?.mercury?.infiltration || null;
  if (rosaInfiltration && rosaInfiltration.uptime >= 1 - 1e-9) debuffs.infiltration.add(rosaInfiltration.type);
  // Every Infiltration producer has run: the types on the pass's set (their inflicters are settled from the entries at the end).
  for (const type of debuffs.infiltration) passSet.add({ name: `${type} Infiltration`, label: type, stage: "debuff", tags: buffRecordOf(`${type} Infiltration`)?.tags?.includes(5200086) ? null : [5200086], source: "Infiltration (src/combat-states.js)" });
  const infiltrationTypes = buffs ? passSet.types({ tag: 5200086 }) : [...debuffs.infiltration];
  const infiltrationHeld = (type) => infiltrationTypes.includes(type);
  // Fire Infiltration on the beam / Ignite path stays the existing condition (src/scorching-beam-hit.js, theoretical-sources).
  // Infiltration Effect (residual batch A-3): scales that type's +13% (keyword value × (1 + Σ effect)). The beam / Ignite
  // path's own Fire Infiltration (src/scorching-beam-hit.js) does not read it.
  const infiltrationEffect = (type) => sum(find(PATTERNS.infiltrationEffect).filter((line) => line.clean.match(PATTERNS.infiltrationEffect)[2].toLowerCase() === type.toLowerCase()).map((line) => num(line.clean.match(PATTERNS.infiltrationEffect)[1]) * (line.multiplier ?? 1)));
  for (const line of find(PATTERNS.infiltrationEffect)) {
    const type = line.clean.match(PATTERNS.infiltrationEffect)[2];
    const word = type[0].toUpperCase() + type.slice(1).toLowerCase();
    const beamFire = word === "Fire" && state.beamActive;
    const held = infiltrationHeld(word) && !beamFire;
    entry(line, held, held ? `scales the ${word} Infiltration on the dummy` : beamFire ? "the beam path's Fire Infiltration does not read Infiltration Effect" : `no ${word} Infiltration source`, beamFire ? { status: "Not modeled" } : {});
  }
  for (const type of infiltrationTypes) if (!(type === "Fire" && state.beamActive)) derive(`+${round(BUFF_VALUES.infiltration * (1 + infiltrationEffect(type) / 100))}% additional ${type} Damage taken`, `${type} Infiltration (keyword ${type === "Fire" ? "10000103" : type === "Cold" ? "10000104" : "10000105"})`, `${type} Infiltration on the dummy`, true);
  // Fire Infiltration on an Ignited dummy only your Minions keep Ignited part of the time (above): its time-averaged value.
  if (fireInfiltrationIgnitedShare > 0 && !infiltrationHeld("Fire")) derive(`+${round(BUFF_VALUES.infiltration * (1 + infiltrationEffect("Fire") / 100) * fireInfiltrationIgnitedShare)}% additional Fire Damage taken`, "Fire Infiltration (keyword 10000103) on the Ignited dummy", `the dummy is Ignited ${round(fireInfiltrationIgnitedShare * 100)}% of the time by your Minions (time-averaged; provisional)`, true);
  if (rosaInfiltration && rosaInfiltration.uptime < 1 - 1e-9 && !infiltrationHeld(rosaInfiltration.type) && !(rosaInfiltration.type === "Fire" && state.beamActive)) {
    derive(`+${round(BUFF_VALUES.infiltration * (1 + infiltrationEffect(rosaInfiltration.type) / 100) * rosaInfiltration.uptime)}% additional ${rosaInfiltration.type} Damage taken`, `${rosaInfiltration.type} Infiltration (Mercury Baptism)`, `Mercury Baptism's ${rosaInfiltration.type} Infiltration for the Realm's ${round(rosaInfiltration.uptime * 100)}% (provisional)`, true);
  }
  for (const line of find(PATTERNS.perInfiltrationType)) {
    const count = infiltrationTypes.length + (state.fireInfiltrationCondition && !infiltrationHeld("Fire") ? 1 : 0);
    const value = round(num(line.clean.match(PATTERNS.perInfiltrationType)[1]) * (line.multiplier ?? 1) * count);
    entry(line, count > 0, `${count} Infiltration type${count === 1 ? "" : "s"} on the dummy`, { bodies: [`+${value}% additional Elemental Damage`] });
    if (value > 0) derive(`+${value}% additional Elemental Damage`, line.source, `${count} Infiltration types`, true);
  }
  const paralysisEffect = sum(find(PATTERNS.paralysisEffect).filter((line) => { const hand = line.clean.match(PATTERNS.paralysisEffect)[2]; return !hand || (hand === "Two" ? state.twoHanded : !state.twoHanded); }).map((line) => num(line.clean.match(PATTERNS.paralysisEffect)[1]) * (line.multiplier ?? 1)));
  for (const line of find(PATTERNS.paralysisAttacks)) { const active = Boolean(state.attackHits); if (active) debuffs.paralysis = 1; entry(line, active, active ? "Attacks hit the dummy: Paralysis held (duration not sourced; uptime 1, provisional)" : "no modeled Attack hit", { provisional: true }); }
  // A record on trigger 1000030 (882870: "… on hit" in its text, "dealing damage" 5001160 on the row) also fires on your DoT's damage (wiring
  // audit W2 gap 4, 2026-11-03); one on 1000033 needs your hits.
  for (const line of find(PATTERNS.paralysisOnHit)) { const viaDot = !state.anyHit && Boolean(state.dealsDamageOverTime) && (lineTriggerRows(line)?.rows || []).some((row) => row.trigger === 1000030); const active = Boolean(state.anyHit) || viaDot; if (active) debuffs.paralysis = 1; entry(line, active, active ? (viaDot ? "your damage over time deals damage to the dummy (game trigger 1000030): Paralysis held (duration not sourced; uptime 1, provisional)" : "the build hits the dummy: Paralysis held (duration not sourced; uptime 1, provisional: talent Q18)") : "no modeled hit", { provisional: true }); }
  for (const line of find(PATTERNS.paralysisCursed)) { const active = Boolean(targetCursed && state.anyHit); if (active) debuffs.paralysis = 1; entry(line, active, active ? "the dummy is Cursed and hit: Paralysis held (uptime 1, provisional)" : "the dummy is not Cursed or not hit", { provisional: true }); }
  // Paralysis sources without a chance on the dummy (2026-10-14): each holds Paralysis (4 s base duration, manual rule
  // 1002020420, refreshed long before it lapses) while its condition holds; best case, provisional.
  const tenacity = Number(ownBlessingStacks(state)?.Tenacity) || 0, tenacityMax = Number(ownBlessingMaxStacks(state)?.Tenacity) || 0;
  const tenacityAtMax = tenacity > 0 && tenacity >= tenacityMax;
  for (const line of find(PATTERNS.paralysisTenacity)) { const active = Boolean(state.anyHit) && tenacityAtMax; if (active) debuffs.paralysis = 1; entry(line, active, active ? `Tenacity Blessing at max stacks (${tenacity}; Blessing model, own buffs held) and the build hits the dummy: Paralysis held (4 s base duration refreshed by hits; provisional)` : !state.anyHit ? "no modeled hit" : tenacity > 0 ? `Tenacity Blessing below max stacks (${tenacity} of ${tenacityMax})` : "no Tenacity Blessing stacks", { provisional: true }); }
  // Your damage (trigger 1000030: your hits or DoT; wiring audit W2 gaps 3 and 4, 2026-11-03) and yours or your Minions' (the "you or
  // Minions" wordings). Discord of the Second Will (14747381) is a 1000030 row: your Minions' damage is theirs, a DoT of yours fires it.
  const yourDamage = Boolean(state.anyHit || state.dealsDamageOverTime);
  const dealsDamage = Boolean(yourDamage || state.minionsCrit);
  for (const line of find(PATTERNS.paralysisDealDamage)) { if (dealsDamage) debuffs.paralysis = 1; entry(line, dealsDamage, dealsDamage ? "the build (or its Minions) deals damage to the dummy: Paralysis held (4 s base duration, refreshed); Weaken lowers only the enemy's damage and counts as a crowd control type (provisional)" : "the build deals no modeled damage", { provisional: true, enemyDebuff: true }); }
  // Bing – Blast Nova's moon (hero trait audit B12; src/bing-traits.js): the bombs land at the dummy, so it stays within their 10 m while
  // the bombs replace the Main Skill's casts (provisional); Slow lowers only the enemy's speed.
  for (const line of find(PATTERNS.paralysisBombs)) { const active = Boolean(state.bing?.blastNova?.bombsActive); if (active) debuffs.paralysis = 1; entry(line, active, active ? `the bombs are thrown at the dummy, so it stays within ${num(line.clean.match(PATTERNS.paralysisBombs)[1])} m of them: Paralysis held (refreshed continuously; provisional); Slow only slows it` : `no bombs: ${state.bing?.blastNova?.why || "Blast Nova's bombs are not in this build"}`, { provisional: true, enemyDebuff: true }); }
  for (const line of find(PATTERNS.paralysisNearby)) { const active = state.nearTarget !== false; if (active) debuffs.paralysis = 1; entry(line, active, active ? `the player stands close to the dummy (best case): inside Nearby (${KEYWORD_RADII_METERS.nearby} m, keyword radius), so it is Paralyzed` : `the Distant alternative stands ${DISTANT_STANDING_METERS} m away: not Nearby`, { provisional: true, enemyDebuff: true }); }
  // Blocking: the "Hit or blocked recently" best case (condition blockedRecently, state.hitRecently), which needs Block chance.
  const canBlock = (Number(state.blockChance?.attack) || 0) > 0 || (Number(state.blockChance?.spell) || 0) > 0;
  for (const line of find(PATTERNS.paralysisBlocking)) { const active = state.hitRecently !== false && canBlock && state.nearTarget !== false; if (active) debuffs.paralysis = 1; entry(line, active, active ? "blocked recently (best-case assumption, user decision 2026-10-12; condition 'Hit or blocked recently') with the dummy Nearby: Paralysis held (provisional)" : state.hitRecently === false ? "Blocked recently is off (condition 'Hit or blocked recently')" : !canBlock ? "no Block chance, so the build never Blocks" : `the Distant alternative stands ${DISTANT_STANDING_METERS} m away: not Nearby`, { provisional: true }); }
  // Dual Kismet: Bounded Holy Maiden (game affix 908139264: on hit, Paralysis buff 230, Blind 20060, Weaken 270, Slow 260,
  // Taunt 280 and Frostbite): Paralysis held while the build hits (pact scripted-effects batch 2026-10-13; the -60% Crowd
  // Control Effect next to it is not applied to the Paralysis it inflicts: provisional).
  for (const line of find(PATTERNS.holyMaiden)) { const active = Boolean(state.anyHit); if (active) debuffs.paralysis = 1; entry(line, active, active ? "the build hits the dummy: Paralysis held (4 s base duration, refreshed by hits; manual rule 1002020420), Frostbite inflicted on hit (src/enemy-ailments.js), and Blind, Weaken, Slow and Taunt count as crowd control types" : "no modeled hit", { provisional: true, enemyDebuff: true, bodies: [`+${round(BUFF_VALUES.paralysis)}% damage taken`] }); }
  // Regain events (src/regain-model.js, 2026-10-14): the build Regains on hit while it has missing Life / Energy Shield (a
  // self-drain line, or the "Hit or blocked recently" best case); switched by the regainEvents condition. Read again by
  // src/line-conditions.js ("if you have Regained in the last N s") through state.regain (src/line-effects.js).
  const regain = resolveRegain({ modifierTexts: lines, supportDrains: state.regainInputs?.supportDrains || [], stats: state.regainInputs?.stats || {}, anyHit: Boolean(state.anyHit), hitRecently: state.hitRecently !== false, enabled: conditionOn("regainEvents"), hasFervor, castsAttack: Boolean(state.castsAttack), attackCrits: Boolean(state.attackHits && state.canCrit) });
  // W10 step 4a: the planner keeps this full hold, now as a Paralysis source per Regain row of its record (3829717: node 374 on 1001200 and
  // 1001210, buff 230 for 4 s; `regainParalysis`, below the other sources), so the trigger bus can hold it from the Regain events on the loop. A
  // line whose record does not read stays a held line, as before.
  const regainParalysis = [];
  for (const line of find(PATTERNS.paralysisRegain)) {
    const meters = Number(line.clean.match(/within (\d+) ?m/i)?.[1] ?? 10); const inside = explicitRadiusHolds(meters, state.nearTarget); const active = regain.active && inside;
    const rows = active ? (recipeCrowdControl(line)?.rows || []).filter((row) => row.event === "regain" && !row.unknown.length && row.types.some((type) => type.type === "Paralysis") && regain.pools?.[row.trigger === 1001210 ? "energyShield" : "life"]?.active) : [];
    if (active && rows.length) regainParalysis.push({ line, rows, id: recipeCrowdControl(line).id });
    else if (active) debuffs.paralysis = 1;
    entry(line, active, active ? `${regain.reason}; the dummy is within ${meters} m: Paralysis held (refreshed every Regain; provisional)` : !regain.active ? regain.reason : `the Distant alternative stands ${DISTANT_STANDING_METERS} m away: outside ${meters} m`, { provisional: true, enemyDebuff: true });
  }
  // Every line that holds Paralysis has run: the held Paralysis on the pass's set.
  if (debuffs.paralysis > 0) passSet.add({ name: "Paralysis", share: Math.min(1, debuffs.paralysis), stage: "debuff", source: "Paralysis held by a line (src/combat-states.js)" });
  const paralysisHeld = buffs ? passSet.holds("Paralysis") : debuffs.paralysis > 0;
  // Grudge (support; src/support-effects.js family "paralysis"): "When the supported skill deals damage to a Cursed target, there
  // is a +X% chance to Paralyze it" (leveled). Paralysis (keyword 704, manual rule 1002020420): +15% damage taken × (1 +
  // Paralysis Effect), 4 s base duration, 1 stack. Expected uptime 1 − (1 − p)^(hits in 4 s) at the supported skill's hit rate
  // from the skill-hit model (the Tendonslicer rule; state.chanceParalysis, filled by the planner's second pass with the measured
  // rate), built from zero on the clean dummy (timed schedule "chance": hits from the first use, then every 1 / rate s). Several
  // sources (and Witch Antelope's turns below) combine as 1 − Π(1 − uptime); an on-hit source that holds Paralysis leaves
  // nothing to add (1 stack). No line in the catalogs changes Paralysis duration. Freezing Point's "Debuffs inflicted when the
  // supported skill hits are now affected by Empower Effect" is not applied (open: src/empower-effects.js applies it to the
  // skill's own hit debuff only). Not a best-case assumption: the Cursed dummy and the hits are automatic.
  // ---- Crowd control from the game recipes (wiring audit gap 1, 2026-11-03; src/crowd-control-recipes.js) ----
  // Every line no scripted reader above or below holds by its wording, whose record applies a crowd control buff (Paralysis 230,
  // Slow 260, Weaken 270, Taunt 280, Blind 20060; tag 5100101): the type is held on the dummy at its trigger's rate (state.ccEventRates,
  // measured by the planner's hit pass: your hits for 1000033 / 1000030, Minion hits for 1000047, triggered uses for 1000060; the
  // Regain rate above for 1001200 / 1001210; the casts of a board skill with the trigger's tag for 1000069) × the gate-188 chance ×
  // the buff's duration (4 s by its record for duration -2): uptime 1 − (1 − p)^(events/s × duration), or min(1, duration × events/s)
  // for a certain event, built from zero on the clean dummy (first event from the hit pass). Lines and rows of one type combine as
  // 1 − Π(1 − uptime). Paralysis joins the Paralysis sources below (its +15% damage taken, one stack whoever inflicts it); the other
  // types do nothing to the dummy, which never attacks, but every crowd control reader counts them (Wings of Light, Self-Delusion,
  // the pact counter, First Flake, Passing of Time) and a held Blind / Paralysis makes the dummy Blinded / Paralyzed. Before the
  // hit pass measures a rate the type is held. Provisional (open question cc-chance-holders): a ticking DoT of yours raises a 1000030 event
  // every server tick (wiring audit W2 gap 4, 2026-11-03; open question dot-damage-trigger-events), and a gate-184 Blessing requirement is
  // read as the Blessing held.
  const ccRecipeRates = state.ccEventRates || null;
  // ccRecipeMinionTypes (W8 step 3): the types a row holds on your Minions' events (1000047, node 111 Minion hits, a summon's interval), whose inflicter is your Minions.
  const ccRecipeTypes = new Map(), ccRecipeHolds = new Map(), ccRecipeParalysisHolds = new Map(), ccRecipeLines = new Map(), ccRecipeParalysis = [], ccRecipeOwnTypes = new Set(), ccRecipeMinionTypes = new Set(), ccSupportHolders = [], supportCrowdControlStatus = [];
  const CC_BLESSING_BUFFS = { 320: "Agility" };
  // One holder's rows (a modifier line, or a support clause on its setup: wiring audit W6a item 1, 2026-11-03). `scope` gives the
  // events' rates (the build's for a line; the supported setup's own for a support clause, whose rows trigger on "this skill") and
  // whether each event exists at all.
  const holdRows = (reading, rows, holder, scope) => {
    const parts = [];
    const rates = scope.rates;
    for (const row of rows) {
      // A Regain that spends the Agility its gate needs (node 623, W10 step 4a; src/consumption-procs.js regainAgilitySpend): the gate reads the
      // stack the Regain finds (its hit's gain, or one held since the last Regain), not the average left after the spends, and only that share of
      // the Regains opens it.
      const spend = row.event === "regain" && row.requiresBuffs.includes(320) && state.consumption?.regainSpend?.active ? state.consumption.regainSpend : null;
      const missingBuff = row.requiresBuffs.map((buff) => ({ buff, name: CC_BLESSING_BUFFS[buff] || null })).find((item) => !item.name || !(Number(ownBlessingStacks(state)?.[item.name]) > 0 || (spend && item.name === "Agility" && spend.findShare > 0)));
      const missingState = (row.requiresTargetStates || []).find((name) => name === "frostTerra" && !state.frostTerraOnBoard);
      const inside = row.radiusMeters === null || explicitRadiusHolds(row.radiusMeters, state.nearTarget);
      const casters = row.event === "cast" ? (state.ccSkillCasts || []).filter((skill) => row.triggerTags.length && row.triggerTags.every((tag) => (skill.tagIds || []).includes(tag))) : [];
      const eventRate = crowdControlEventRate(row, { rates, regainPerSecond: regain.active ? regain.ratePerSecond : 0, skillCasts: state.ccSkillCasts || [] });
      const rate = spend && eventRate !== null && spend.findShare < 1 ? eventRate * spend.findShare : eventRate;
      const eventOk = row.event === "hit" ? scope.hits : row.event === "damage" ? scope.damage : row.event === "minionDamage" || row.event === "minionHit" || row.event === "interval" ? scope.minions : row.event === "regain" ? regain.active : row.event === "cast" ? casters.length > 0 : true;
      // A chance held in a local the recipe table drops (Defense Form's Command, Tidewell: Undertow's Terra Charge consumed).
      const localChance = crowdControlLocalChance(row, { command: (playerBuffSet(state)?.level("Command") ?? state.commandPoints) ?? null, terraChargesConsumed: scope.terraChargesConsumed ?? null });
      const chance = localChance === null ? 0 : Math.min(100, localChance);
      const active = !missingBuff && !missingState && inside && eventOk && chance > 0 && (rate === null || rate > 0);
      const first = row.event === "minionDamage" || row.event === "minionHit" ? rates?.minionFirstHitSeconds : row.event === "interval" ? 0 : row.event === "cast" ? Math.min(...casters.map((skill) => Number.isFinite(skill.firstSeconds) ? skill.firstSeconds : 0)) : row.event === "regain" ? regain.pools && Math.min(...Object.values(regain.pools).filter((pool) => pool.active).map((pool) => pool.effectiveIntervalSeconds || 0)) : row.event === "damage" ? rates?.firstDamageSeconds ?? rates?.firstHitSeconds : rates?.firstHitSeconds;
      const whose = scope.whose || "your";
      const event = { hit: `${whose} hits/s (trigger 1000033)`, damage: `${whose} damage events/s (trigger 1000030: hits, and a ticking DoT every server tick)`, minionDamage: "your Minions' hits/s (trigger 1000047)", minionHit: `the hits/s of the Minions ${scope.minionLabel || "it summons"} (trigger 1000033 on the Minions, node 111)`, interval: `${row.cooldownSeconds} s cooldown (gate 206) while a Minion ${scope.minionLabel || "it summons"} is out`, triggered: "triggered uses/s (trigger 1000060: uses not cast by you, Tangle casts included; inferred)", regain: "Regains/s (triggers 1001200 / 1001210)", cast: `casts/s of ${casters.map((skill) => skill.name).join(", ") || "a board skill with the trigger's skill tag"} (trigger 1000069)` }[row.event];
      const why = missingBuff ? (missingBuff.name ? `needs ${missingBuff.name} Blessing (gate 184 on buff ${missingBuff.buff}) and the build holds none` : `needs buff ${missingBuff.buff} held (gate 184; not read)`)
        : missingState ? "needs the target on a Frost Terra (trigger target tag 4015180) and no Frost Terra is on the skill board"
          : !inside ? `the Distant alternative stands ${DISTANT_STANDING_METERS} m away: outside ${round(row.radiusMeters)} m`
            : !eventOk ? (row.event === "minionDamage" || row.event === "minionHit" || row.event === "interval" ? `no modeled Minion${scope.minionLabel ? ` ${scope.minionLabel}` : ""}` : row.event === "regain" ? regain.reason : row.event === "cast" ? "the skill that triggers it is not on the skill board" : row.event === "damage" ? scope.noDamage || "no damage of yours (no hit or damage over time; your Minions' damage is theirs)" : scope.noHit || "no modeled hit of yours")
              : localChance === null ? (row.chanceLocal?.kind === "command" ? "no Command source (\"+N Command per second\") or full Command switched off" : "the Terra Charges a use consumes are not modeled for this skill")
                : !(chance > 0) ? (row.chanceLocal?.kind === "command" ? `⌊${round(state.commandPoints || 0)} Command ÷ ${row.chanceLocal.p0}⌋ × ${row.chanceLocal.p1}% = 0% (full Command switched off, or too little held)` : "no chance") : rate !== null && !(rate > 0) ? `no event: ${event} is 0` : null;
      const chanceNote = row.chanceLocal?.kind === "command" ? ` (⌊${round(state.commandPoints || 0)} Command ÷ ${row.chanceLocal.p0}⌋ × ${row.chanceLocal.p1}%)` : row.chanceLocal?.kind === "terraChargeConsumed" ? ` (${round(scope.terraChargesConsumed || 0)} Terra Charge consumed ÷ ${row.chanceLocal.p0} × ${row.chanceLocal.p1}%)` : "";
      for (const item of row.types) {
        const schedule = !active ? null : rate === null ? { kind: "full" } : chance >= 100 ? { kind: "periodic", durationSeconds: item.durationSeconds, periodSeconds: 1 / rate, startSeconds: Number.isFinite(first) ? first : 0 }
          : { kind: "chance", chancePercent: chance, hitsPerSecond: rate, durationSeconds: item.durationSeconds, ...(Number.isFinite(first) ? { firstHitSeconds: first } : {}) };
        const uptime = schedule ? sustainedLevel(schedule) : 0;
        const label = item.type === "Blinding" ? "Blind" : item.type;
        const text = why ? `${label}: ${why}` : rate === null ? `${label} held (rate not measured yet on this pass)`
          : chance >= 100 ? `${label} (buff ${item.buff}, ${round(item.durationSeconds)} s) on every event at ${round(rate)} ${event}: min(1, ${round(item.durationSeconds)} s × ${round(rate)}) = ${round(uptime * 100)}% of the time`
            : `${label} (buff ${item.buff}, ${round(item.durationSeconds)} s) at ${round(chance)}%${chanceNote} per event, ${round(rate)} ${event}: 1 − (1 − ${round(chance / 100)})^(${round(rate)} × ${round(item.durationSeconds)} s) = ${round(uptime * 100)}% of the time`;
        parts.push({ type: item.type, active: Boolean(schedule), schedule, uptime, text, chance, rate });
        if (!schedule) continue;
        if (item.type === "Paralysis") {
          const source = { minion: row.event === "minionDamage" || row.event === "minionHit" || row.event === "interval", skill: holder.source, support: "Paralysis", text: holder.clean, chancePercent: chance, hitsPerSecond: rate, rateKnown: rate !== null, active: true, schedule, uptime: round(uptime), reason: `${text} (game record ${reading.id}; provisional)`, recipe: true };
          ccRecipeParalysis.push(source);
          // What fires it, for the trigger bus (W10 step 2): the bus owns the whole Paralysis series when it drives both of your triggers.
          ccRecipeParalysisHolds.set(source, { recipeId: reading.id, row: row.row, trigger: row.trigger, event: row.event, runner: row.runner ?? "you", triggerTags: [...(row.triggerTags || [])], source: holder.source, text: holder.clean, line: scope.line ?? null, setupKey: scope.setupKey ?? null, chancePercent: chance, cooldownSeconds: row.cooldownSeconds ?? null, buff: item.buff, durationSeconds: item.durationSeconds, requiresBuffs: [...(row.requiresBuffs || [])], consumesBuffs: [...(row.consumesBuffs || [])] });
        }
        else {
          ccRecipeTypes.set(item.type, [...(ccRecipeTypes.get(item.type) || []), schedule]);
          // The same hold with what fires it, for the tick engine's trigger bus (src/trigger-bus.js, W10): a listener it owns replaces this
          // schedule on the loop; the planner's own figures keep reading the schedule.
          ccRecipeHolds.set(item.type, [...(ccRecipeHolds.get(item.type) || []), { schedule, holder: { recipeId: reading.id, row: row.row, trigger: row.trigger, event: row.event, runner: row.runner ?? "you", triggerTags: [...(row.triggerTags || [])], source: holder.source, text: holder.clean, line: scope.line ?? null, setupKey: scope.setupKey ?? null, chancePercent: chance, cooldownSeconds: row.cooldownSeconds ?? null, buff: item.buff, durationSeconds: item.durationSeconds, requiresBuffs: [...(row.requiresBuffs || [])], consumesBuffs: [...(row.consumesBuffs || [])] } }]);
        }
        if (row.event !== "minionDamage" && row.event !== "minionHit" && row.event !== "interval") ccRecipeOwnTypes.add(item.type === "Paralysis" ? "Paralysis" : item.type);
        else if (item.type !== "Paralysis") ccRecipeMinionTypes.add(item.type);
      }
    }
    return parts;
  };
  for (const line of lines) {
    if (sageOwnedLine(state.heroId, line) || scriptedCrowdControl(line.clean)) continue;
    const reading = recipeCrowdControl(line);
    const rows = (reading?.rows || []).filter((row) => !row.unknown.length);
    if (!rows.length) continue;
    const parts = holdRows(reading, rows, line, { rates: ccRecipeRates, hits: Boolean(state.anyHit), damage: yourDamage, minions: Boolean(state.minionsCrit), line });
    ccRecipeLines.set(line, { id: reading.id, parts });
  }
  // Support clauses (wiring audit W6a item 1, 2026-11-03; src/crowd-control-recipes.js supportRecipeCrowdControl): each enabled support's
  // stone affix that applies a crowd control buff, by its game id, on the supported setup's own events (state.supportCrowdControl, from
  // src/planner.js: the setup's hits, damage events and Minions; rates from the hit pass's per-setup facts). Before this the planner read
  // these clauses No DPS effect / Not modeled and held nothing (Wings of Light ×2.32 when fed; provisional, open question cc-chance-holders).
  for (const holder of state.supportCrowdControl || []) {
    const reading = holder.reading;
    const rows = (reading?.rows || []).filter((row) => !row.unknown.length);
    if (!rows.length) continue;
    const source = `${holder.skill}: ${holder.support}`;
    const parts = holdRows(reading, rows, { source, clean: holder.text }, { rates: holder.rates ?? null, hits: Boolean(holder.hits), damage: Boolean(holder.hits || holder.dot), minions: Boolean(holder.minions), terraChargesConsumed: holder.terraChargesConsumed ?? null, setupKey: holder.setupKey ?? null,
      whose: `${holder.skill}'s`, minionLabel: `summoned by ${holder.skill}`, noHit: `${holder.skill} deals no modeled hit`, noDamage: `${holder.skill} deals no modeled damage (hit or damage over time)` });
    ccSupportHolders.push({ holder, id: reading.id, parts });
  }
  const chanceParalysisSources = (state.chanceParalysis || []).map((item) => {
    const chancePercent = wholePercentRoll(item.chancePercent); // EAilmentType palsy: the ailment routine's whole-percent roll (src/whole-percent-roll.js)
    const rateKnown = Number.isFinite(item.hitsPerSecond);
    const hitsPerSecond = rateKnown ? Math.max(0, item.hitsPerSecond) : null;
    // Cripple's fissure Paralysis (needsCurse false) needs no Curse; Grudge needs the Cursed dummy.
    const cursedOk = item.needsCurse === false || targetCursed;
    const active = cursedOk && chancePercent > 0 && (!rateKnown || hitsPerSecond > 0);
    // Before the hit rate is measured (the planner's first pass) the source holds Paralysis, so state-gated lines read alike.
    // A certain Paralysis on each fissure hit is periodic: 4 s every 1 / rate s (full uptime once the fissure lands every ≤ 4 s).
    const schedule = !active ? null : rateKnown && item.fissure ? { kind: "periodic", durationSeconds: BUFF_VALUES.paralysisDurationSeconds, periodSeconds: 1 / hitsPerSecond, startSeconds: Number.isFinite(item.firstHitSeconds) ? item.firstHitSeconds : 0 } : rateKnown ? { kind: "chance", chancePercent, hitsPerSecond, durationSeconds: BUFF_VALUES.paralysisDurationSeconds, ...(Number.isFinite(item.firstHitSeconds) ? { firstHitSeconds: item.firstHitSeconds } : {}) } : { kind: "full" };
    const uptime = schedule ? sustainedLevel(schedule) : 0;
    const target = item.fissure ? "fissure hit on the dummy" : "hit on the Cursed dummy";
    const rateLabel = item.fissure ? "fissure hits/s (one per Demolisher Charge consumed; skill-hit model, provisional)" : "hits/s (skill-hit model)";
    const reason = !cursedOk ? "the dummy is not Cursed" : !(chancePercent > 0) ? "no Paralysis chance" : !active ? `${item.skill} deals no modeled ${item.fissure ? "fissure hits" : "hits"}` : rateKnown && item.fissure
      ? `Paralysis on every ${target} at ${round(hitsPerSecond)} ${rateLabel}: ${BUFF_VALUES.paralysisDurationSeconds} s every ${round(1 / hitsPerSecond)} s = ${round(uptime * 100)}% uptime, from the first fissure on the clean dummy (provisional)`
      : rateKnown ? `${chancePercent}% chance per ${target} at ${round(hitsPerSecond)} ${rateLabel}: 1 − (1 − ${round(chancePercent / 100)})^(${round(hitsPerSecond)} × ${BUFF_VALUES.paralysisDurationSeconds} s) = ${round(uptime * 100)}% uptime; the 5 s / 20 s windows build it from zero, hit by hit (provisional)`
      : "hit rate not measured yet (held for this pass)";
    return { ...item, chancePercent, hitsPerSecond, rateKnown, active, schedule, uptime: round(uptime), reason };
  });
  // The follower's Paralysis (Coercion on cast, Chance Paralysis on hit; src/follower-model.js, 2026-10-27; provisional, open
  // question follower-crowd-control): 4 s (manual rule 1002020420) from each cast, every P s from the first cast at t = 0, so
  // min(1, 4 s ÷ P) uptime. The dummy is within the line's radius of the follower, which stays by you (explicit radius at the
  // chosen distance). It joins the other Paralysis sources (one stack whoever inflicts it); your inflicted Paralysis Effect does
  // not scale it.
  for (const line of find(PATTERNS.followerParalysis)) {
    const match = line.clean.match(PATTERNS.followerParalysis), period = num(match[1]), meters = match[2] !== undefined ? num(match[2]) : null;
    const inside = meters === null || explicitRadiusHolds(meters, state.nearTarget), active = inside && period > 0;
    const schedule = active ? { kind: "periodic", durationSeconds: BUFF_VALUES.paralysisDurationSeconds, periodSeconds: period, startSeconds: 0 } : null;
    const uptime = schedule ? sustainedLevel(schedule) : 0;
    const reason = !inside ? `the Distant alternative stands ${DISTANT_STANDING_METERS} m away: outside ${meters} m` : `the follower inflicts Paralysis every ${round(period)} s${meters !== null ? ` (the dummy within ${meters} m of the follower, which stays by you: best case)` : ""}: ${BUFF_VALUES.paralysisDurationSeconds} s each = ${round(uptime * 100)}% uptime (provisional)`;
    chanceParalysisSources.push({ skill: line.source, support: "Paralysis", text: line.clean, follower: true, chancePercent: 100, hitsPerSecond: period > 0 ? 1 / period : 0, rateKnown: true, active, schedule, uptime: round(uptime), reason });
    entry(line, active, reason, { provisional: true, enemyDebuff: true });
  }
  // Discord of the Second Will's Paralysis: its turn in the rotation (chunk 2, 2026-11-01; discordSchedule above). It joins the other
  // Paralysis sources (one stack whoever inflicts it); an on-hit source that holds Paralysis leaves it nothing to add.
  for (const line of find(PATTERNS.discordCrowdControl)) {
    const interval = num(line.clean.match(PATTERNS.discordCrowdControl)[1]), schedule = yourDamage ? discordSchedule(interval, 0) : null, uptime = schedule ? sustainedLevel(schedule) : 0;
    const reason = yourDamage ? `one of ${DISCORD_CROWD_CONTROL.length} crowd control types every ${interval} s (${DISCORD_CROWD_CONTROL.join(", ")}: the buffs with game tag 5100112), each ${BUFF_VALUES.paralysisDurationSeconds} s in its record, so ${round(uptime * 100)}% uptime each and ${round(uptime * DISCORD_CROWD_CONTROL.length)} up at a time (game affix 14747381; provisional: duration −2 read as the record's own)` : "you deal no damage yourself (trigger 1000030: your hits or DoT; your Minions' damage is theirs)";
    chanceParalysisSources.push({ skill: line.source, support: "Discord of the Second Will", text: line.clean, chancePercent: 100, hitsPerSecond: interval > 0 ? 1 / (interval * DISCORD_CROWD_CONTROL.length) : 0, rateKnown: true, active: yourDamage, schedule, uptime: round(uptime), reason });
    entry(line, yourDamage, reason, { provisional: true, enemyDebuff: true, bodies: [`+${round(BUFF_VALUES.paralysis * uptime)}% damage taken`] });
  }
  // Paralysis held from the game recipes (above): one more source of the same debuff.
  chanceParalysisSources.push(...ccRecipeParalysis);
  // "When Regaining, inflicts Paralysis on enemies within 10m" (game record 3829717; W10 step 4a): one source per Regain row whose pool Regains,
  // held full as the planner always read it (refreshed every Regain; a Regain needs your hit, which the closed form holds from t = 0). Recorded with
  // its row (trigger 1001200 / 1001210, 4 s) so the trigger bus, when it raises your Regains, holds it from the Regain events on the loop.
  for (const { line, rows, id } of regainParalysis) for (const row of rows) {
    const pool = row.trigger === 1001210 ? "energyShield" : "life", type = row.types.find((item) => item.type === "Paralysis");
    const label = pool === "life" ? "Life" : "Energy Shield";
    const source = { skill: line.source, support: `Paralysis (${label} Regain)`, text: line.clean, chancePercent: 100, hitsPerSecond: regain.pools[pool].ratePerSecond, rateKnown: true, active: true, schedule: { kind: "full" }, uptime: 1,
      reason: `${regain.pools[pool].reason}: Paralysis on each Regain (game record ${id}, ${round(type.durationSeconds)} s), held (refreshed every Regain; provisional)`, recipe: true };
    chanceParalysisSources.push(source);
    ccRecipeParalysisHolds.set(source, { recipeId: id, row: row.row, trigger: row.trigger, event: "regain", runner: "you", triggerTags: [...(row.triggerTags || [])], source: line.source, text: line.clean, line, setupKey: null, chancePercent: 100, cooldownSeconds: null, buff: type.buff, durationSeconds: type.durationSeconds, requiresBuffs: [], consumesBuffs: [] });
  }
  const chanceParalysisActive = chanceParalysisSources.filter((item) => item.active);
  // Your own Paralysis Effect scales only Paralysis your build inflicts (not the follower's).
  const ownParalysis = paralysisHeld || chanceParalysisActive.some((item) => !item.follower);
  for (const line of find(PATTERNS.paralysisEffect)) {
    const hand = line.clean.match(PATTERNS.paralysisEffect)[2], held = !hand || (hand === "Two" ? state.twoHanded : !state.twoHanded);
    entry(line, ownParalysis && held, !held ? `not holding a ${hand}-Handed Weapon` : ownParalysis ? "scales Paralysis (provisional: the effect scales its damage taken)" : "no Paralysis source", { provisional: true });
  }
  if (paralysisHeld) derive(`+${round(BUFF_VALUES.paralysis * (1 + paralysisEffect / 100))}% damage taken`, "Paralysis (keyword 704)", "Paralysis on the dummy", true);
  const scriptedWeaken = [PATTERNS.witchAntelope, PATTERNS.holyMaiden, PATTERNS.channelWeaken, PATTERNS.paralysisDealDamage];
  for (const line of find(PATTERNS.weaken).filter((line) => !scriptedWeaken.some((pattern) => pattern.test(line.clean)) && !ccRecipeLines.has(line))) entry(line, false, "Weaken lowers the enemy's damage (the dummy does not attack)", { status: "No DPS effect" });

  // ---- Frostbite and Freeze ----
  // Overwrite between units (patch notes 2026-10-15: "Priority is now determined first by maximum Frostbite Rating, then by
  // Frostbite effect"): it decides which unit's Frostbite stays when several units Frostbite one enemy. The dummy carries one
  // Frostbite here, the character's: every skill and item line of the character pools into one rating and one effect (a unit's
  // Frostbite, not a per-skill one), and Minions' Frostbite lines are not read (the maxFrostbite reader skips them). With a
  // single unit nothing is overwritten, so the rule changes no figure.
  const frostbiteEffect = sum(values(PATTERNS.frostbiteEffect));
  // "+X% additional Frostbite Effect" (First Flake of Strange Snow's −50%; B3): its own multiplier on (1 + Frostbite Effect).
  const frostbiteEffectAdditional = values(PATTERNS.frostbiteEffectAdditional).reduce((product, value) => product * Math.max(0, 1 + value / 100), 1);
  // Read by Homing Frost Bolt's Alternate Spacetime effect (src/youga-ultimate-one.js).
  debuffs.frostbiteEffectPercent = frostbiteEffect;
  debuffs.frostbiteEffectFactor = frostbiteEffectAdditional;
  for (const line of find(PATTERNS.frostbiteEffectAdditional)) entry(line, frostbitten, frostbitten ? "multiplies Frostbite's Cold Damage taken: rating × (1 + Frostbite Effect) × (1 + this) (provisional)" : "the build inflicts no Frostbite", { provisional: true });
  // Cold Damage taken = rating × (1 + Frostbite Effect) % (user-confirmed 2026-10-13; the creator's calc v0.3 multiplies the two instead).
  if (frostbitten) {
    const frostbiteUptime = discordFrostbiteLine ? sustainedLevel(discordSchedule(discordInterval(discordFrostbiteLine), 1)) : 1;
    const taken = round(debuffs.frostbiteRating * BUFF_VALUES.frostbiteTakenPerRating * (1 + frostbiteEffect / 100) * frostbiteEffectAdditional * frostbiteUptime);
    derive(`+${taken}% additional Cold Damage taken`, "Frostbite (keyword 735: +1% additional Cold Damage taken per Frostbite Rating)", `Frostbite Rating ${debuffs.frostbiteRating} on the dummy${frostbiteEffect ? `, +${frostbiteEffect}% Frostbite Effect applied to it (user-confirmed 2026-10-13)` : ""}${frostbiteUptime < 1 ? `, at ${round(frostbiteUptime * 100)}% uptime (Discord of the Second Will's turn)` : ""}`, frostbiteEffect > 0 || frostbiteUptime < 1);
  }
  for (const line of find(PATTERNS.maxFrostbite)) entry(line, frostbitten, frostbitten ? `Frostbite Rating ${debuffs.frostbiteRating} (10 base + Max Frostbite Rating, max 120; provisional reading of the inflicted amount)` : "the build inflicts no Frostbite", { provisional: true });
  for (const line of find(PATTERNS.frostbiteEffect)) entry(line, frostbitten, frostbitten ? "scales Frostbite's Cold Damage taken: rating × (1 + Frostbite Effect) (user-confirmed 2026-10-13)" : "the build inflicts no Frostbite");
  // Condensed Frost (Gemma – Glacial Night; chunk 1, 2026-10-31; buff 81233 on every enemy, affix 3166437 [7/20, -10, 28, 120], tag 5008005):
  // +0.35% additional Cold Damage taken per point of the Frostbite Rating over 120, the points capped at 28 ÷ 0.35 = 80, × (1 + Condensed
  // Frost Effect). The rating is the same GetFightResource(4) Frostbite's own line reads, so a deemed rating counts. Its -10% additional
  // Attack and Cast Speed is the enemy's.
  {
    const condensed = find(PATTERNS.condensedFrost);
    const effect = sum(values(PATTERNS.condensedFrostEffect));
    const points = Math.min(BUFF_VALUES.condensedFrostMaxPoints, Math.max(0, debuffs.frostbiteRating - BUFF_VALUES.frostbiteMaxRating));
    const active = condensed.length > 0 && frostbitten && points > 0;
    const taken = round(points * BUFF_VALUES.condensedFrostPerPoint * (1 + effect / 100));
    const why = !condensed.length ? "no Condensed Frost on the dummy" : !frostbitten ? "the build inflicts no Frostbite" : `the dummy's Frostbite Rating ${debuffs.frostbiteRating} is not over 120`;
    if (active) derive(`+${taken}% additional Cold Damage taken`, "Condensed Frost (buff 81233: +0.35% additional Cold Damage taken per Frostbite Rating over 120, up to +28%)", `${round(points)} points over 120 × 0.35%${effect ? ` × (1 + ${effect}% Condensed Frost Effect)` : ""}`);
    for (const line of condensed) entry(line, active, active ? `+${taken}% additional Cold Damage taken: ${round(points)} points of Frostbite Rating over 120 × 0.35%${effect ? ` × (1 + ${effect}% Condensed Frost Effect)` : ""} (game record 3166437)` : why);
    for (const line of find(PATTERNS.condensedFrostEffect)) entry(line, active && effect !== 0, active ? `scales Condensed Frost: +${taken}% additional Cold Damage taken (game record 3166437)` : why);
  }

  // ---- Timed pact-spirit and kismet effects (pact scripted-effects batch 2026-10-13; src/timed-effects.js) ----
  // Each effect derives its sustained lines (full stacks, or value × uptime for a cooldown effect) and reports parts whose
  // clock the 5 s / 20 s windows and the recount follow: a cooldown effect casts at t = 0 (best case, user 2026-10-13) and
  // its sustained figure uses the long-run uptime; debuffs build from zero on the clean dummy; own buffs start full when built
  // before engaging (prebuiltSelfBuffs). Each is a best-case assumption with a stable condition id (`toggle`), listed in the
  // recount assumptions and switched in the Config tab's "Best-case assumptions" list (src/planner.js bestCaseAssumptions).
  const prebuilt = state.prebuiltSelfBuffs !== false;
  const sameSource = (pattern, line) => lines.find((other) => other.source === line.source && pattern.test(other.clean)) || null;
  const cooldownOf = (line, fallback) => { const other = sameSource(PATTERNS.spiritCooldown, line); return other ? num(other.clean.match(PATTERNS.spiritCooldown)[1]) : fallback; };
  const cast = (duration, period) => ({ kind: "periodic", durationSeconds: duration, periodSeconds: period, startSeconds: 0 });
  const castText = (duration, period) => `cast on its ${period} s cooldown from t = 0 (best case), ${duration} s per cast: ${round(Math.min(1, duration / period) * 100)}% uptime in sustained figures; the 5 s / 20 s windows follow the casts (${duration >= period ? "held" : `on 0–${duration} s, ${period}–${round(period + duration)} s, …`})`;
  // `listed`: the recount lists the effect once, under its condition (src/planner.js), not per line; parameter lines (radius,
  // cooldown) share the effect's status and reason.
  const addTimed = (effect, line, paramLines = []) => {
    timedEffects.push({ toggle: true, provisional: true, ...effect, source: line.source, text: line.clean });
    entry(line, effect.active, effect.reason, { provisional: effect.provisional !== false, enemyDebuff: effect.target === "enemy", bodies: effect.bodies || [], ...(effect.status ? { status: effect.status } : {}) });
    entries[entries.length - 1].listedAs = `condition:${effect.id}`;
    for (const param of paramLines.filter(Boolean)) { entry(param, effect.active, `${effect.label}: ${effect.reason}`, { provisional: true, ...(effect.status ? { status: effect.status } : {}) }); entries[entries.length - 1].listedAs = `condition:${effect.id}`; }
    if (effect.active) for (const [text, conditionText] of effect.derived || []) derive(text, effect.derivedSource || (line.source === effect.label ? line.source : `${line.source}: ${effect.label}`), conditionText, true);
  };
  const offReason = (id) => `the ${id} condition is off: left out`;

  // Ice Puppet: Ice Cage (pact badge audit 2026-10-13). reference data / game text (affix 404859): "Focus energy to create an ice prison
  // Near yourself and the Pact Holder, which debuffs Frostbitten enemies inside every second and makes them take +X% additional
  // Cold Damage, up to 4 stacks, for 6s. Cooldown: 10s". Sourced: the value per stack (Lv1–5 10%, Lv6 13%), 4 stacks, 6 s per
  // debuff, the 10 s cooldown, Frostbitten enemies only; the in-game tooltip at Ice Puppet Lv2 (user, 2026-10-13) confirms them.
  // The affix is a text row; the skill is stone 80030 (server affix 19058 on the spirit's outer position, config_gen_contract_servant; chunk 13), Split 552980: cooldown 10 s, a
  // prison that stands 6 s and pulses 6 times 1 s apart, each pulse +1 stack of buff 100020 (7 + 3 × level, 6 s, cap 4, mode 1 as Focus Blessing: a new stack refreshes the others),
  // so the last stack outlasts the next cast and 4 stacks hold. When the spirit casts it stays a best case (open question pact-spirit-skill-timing).
  // Best case (condition icePrison): cast next to the player, who stands close to the dummy; the
  // stacks add into one multiplier (4 × X% additional Cold Damage taken, as stacked buffs write p0 × stacks) and are held in
  // sustained figures; the windows and the recount build them at 1 stack per second from t = 0 (src/ice-cage-ramp.js).
  // `iceCage` keeps the per-prison summary the Ice Cage tests and the assumption text read.
  const iceCage = [];
  for (const line of find(PATTERNS.icePrison)) {
    const match = line.clean.match(PATTERNS.icePrison);
    const perStack = num(match[1]) * (line.multiplier ?? 1), stacks = num(match[2]);
    const value = round(perStack * stacks);
    const near = state.nearTarget !== false;
    const allowed = state.icePrison !== false && conditionOn("icePrison");
    const active = frostbitten && near && allowed;
    const reason = !frostbitten ? "the build inflicts no Frostbite (the prison debuffs Frostbitten enemies only)"
      : !allowed ? "the icePrison condition is off: the prison is left out"
      : !near ? `the Distant alternative stands ${DISTANT_STANDING_METERS} m away: the dummy is not inside the prison Near you`
      : `best case: cast on its 10 s cooldown next to you, the Frostbitten dummy inside; ${stacks} stacks of +${perStack}% held in sustained figures; the 5 s / 20 s windows build them at one stack per second on the clean dummy (${match[3]} s each; prison duration ≥ ${stacks} s assumed, not in the tooltip: provisional)`;
    iceCage.push({ source: line.source, perStackPercent: perStack, stacks, valuePercent: value, enabled: allowed, active, reason });
    addTimed({ id: "icePrison", label: "Ice Cage", target: "enemy", enabled: allowed, active, reason, summary: `${stacks} × +${perStack}% additional Cold Damage taken on a Frostbitten dummy, 1 stack per second from t = 0`,
      parts: active ? [{ type: "Cold", reach: "all", percent: perStack, schedule: { kind: "ramp", maxStacks: stacks, intervalSeconds: 1, startStacks: 1 } }] : [],
      bodies: [`+${value}% additional Cold Damage taken`], derived: [[`+${value}% additional Cold Damage taken`, `${stacks} prison stacks on the Frostbitten dummy (best case, provisional)`]],
      derivedSource: `${line.source}: Ice Cage (${stacks} × +${perStack}% additional Cold Damage taken)` }, line, [sameSource(PATTERNS.spiritCooldown, line)]);
  }

  // Melting Flames: Burning Heart (game affix 257943, a text row; the skill is stone 80020, Split 370958, cooldown 5 s, buff 100010: 17 + 9 × level; chunk 13): "Covers targets within a 5m radius with
  // flames and debuffs enemies within the area. Debuff: +26% (Lv6 35%) additional Fire Damage taken by the enemy for 3s.
  // Cooldown: 5 s." Best case (condition meltingFlames; user 2026-10-13): the flames are centred on the player and the dummy is
  // within 5 m (the Distant alternative, 6 m away, loses it); a cast at t = 0, every 5 s: 3 / 5 = 60% uptime.
  for (const line of find(PATTERNS.meltingFlamesDebuff)) {
    const match = line.clean.match(PATTERNS.meltingFlamesDebuff);
    const percent = num(match[1]) * (line.multiplier ?? 1), duration = num(match[2]);
    const area = sameSource(PATTERNS.meltingFlamesArea, line);
    const radius = area ? num(area.clean.match(PATTERNS.meltingFlamesArea)[1]) : 5;
    const cooldown = cooldownOf(line, 5), uptime = Math.min(1, duration / cooldown), sustained = round(percent * uptime);
    const allowed = conditionOn("meltingFlames"), inside = explicitRadiusHolds(radius, state.nearTarget);
    const active = allowed && inside;
    const reason = !allowed ? offReason("meltingFlames") : !inside ? `the Distant alternative stands ${DISTANT_STANDING_METERS} m away, outside the ${radius} m flames centred on you`
      : `best case: the flames are centred on you and the dummy is within ${radius} m; +${percent}% additional Fire Damage taken, ${castText(duration, cooldown)}: +${sustained}% (the cast timing is provisional)`;
    addTimed({ id: "meltingFlames", label: "Melting Flames", target: "enemy", enabled: allowed, active, reason, summary: `+${percent}% additional Fire Damage taken for ${duration} s every ${cooldown} s (${round(uptime * 100)}% uptime), cast at t = 0`,
      parts: active ? [{ type: "Fire", reach: "all", percent, schedule: cast(duration, cooldown) }] : [],
      bodies: [`+${sustained}% additional Fire Damage taken`], derived: [[`+${sustained}% additional Fire Damage taken`, `Melting Flames at ${round(uptime * 100)}% uptime (best case, provisional)`]] }, line, [area, sameSource(PATTERNS.spiritCooldown, line)]);
  }

  // Bitter Thunder: Excruciating Thunder (game affix 20432, a text row; the skill is stone 80040, Split 923780, cooldown 10 s, buff 100000: 9 / 10 + 5 × level, 5 s; chunk 13): "+14% (Lv6 19%) additional Lightning
  // Damage and +15% (Lv6 20%) additional Max Damage for 5s. Cooldown: 10s." An own buff cast at t = 0 (condition bitterThunder):
  // the 5 s window holds it throughout, the 20 s window half the time, sustained figures 50%. The sustained lines are the two
  // values × uptime (their cross term, uptime × (1 − uptime) × both, is left out: provisional). In the windows the Max Damage
  // part moves a hit's average roll by half its value (equal minimum and maximum rolls: provisional).
  for (const line of find(PATTERNS.bitterThunder)) {
    const match = line.clean.match(PATTERNS.bitterThunder);
    const lightning = num(match[1]) * (line.multiplier ?? 1), max = num(match[2]) * (line.multiplier ?? 1), duration = num(match[3]);
    const cooldown = cooldownOf(line, 10), uptime = Math.min(1, duration / cooldown);
    const allowed = conditionOn("bitterThunder"), active = allowed;
    const reason = !allowed ? offReason("bitterThunder") : `best case: +${lightning}% additional Lightning Damage and +${max}% additional Max Damage, ${castText(duration, cooldown)}: +${round(lightning * uptime)}% and +${round(max * uptime)}% (the cast timing is provisional; the two values' cross term is left out)`;
    addTimed({ id: "bitterThunder", label: "Bitter Thunder", target: "self", enabled: allowed, active, reason, summary: `+${lightning}% additional Lightning Damage and +${max}% additional Max Damage for ${duration} s every ${cooldown} s (${round(uptime * 100)}% uptime), cast at t = 0`,
      parts: active ? [{ type: "Lightning", reach: "all", percent: lightning, schedule: cast(duration, cooldown) }, { type: null, reach: "hit", percent: max / 2, schedule: cast(duration, cooldown) }] : [],
      bodies: [`+${round(lightning * uptime)}% additional Lightning Damage`, `+${round(max * uptime)}% additional Max Damage`],
      derived: [[`+${round(lightning * uptime)}% additional Lightning Damage`, `Bitter Thunder at ${round(uptime * 100)}% uptime (best case, provisional)`], [`+${round(max * uptime)}% additional Max Damage`, `Bitter Thunder at ${round(uptime * 100)}% uptime (best case, provisional)`]] }, line, [sameSource(PATTERNS.spiritCooldown, line)]);
  }

  // Witch Antelope of Lust: Bewitched (game affix 608081): no cooldown at player start, then every P1 s it inflicts Paralysis
  // (buff 230) and Weaken (buff 270) in turn on enemies within 10 m. Paralysis: +15% damage taken, 1 stack, 4 s base duration
  // (manual rule 1002020420), scaled by Paralysis Effect. Weaken's duration is not sourced: best case equal to the cooldown
  // (user 2026-10-13; provisional). A cast at t = 0: Paralysis on [0, 4) s, Weaken on [cd, 2·cd), Paralysis again at 2·cd, …
  // (condition witchAntelope). Paralysis already held by an on-hit source (Red Umbrella, Bounded Holy Maiden) adds nothing (1 stack).
  const ccSchedules = new Map();
  let paralysisMergedInto = null;
  // Witch Antelope's own Paralysis turns and value when Grudge's chance Paralysis is merged into its part (the trigger bus, W10 step 2).
  let antelopeParalysis = null;
  // The types you inflict yourself (wiring audit W2 gap 6, 2026-11-03): the follower's crowd control and your Minions' are theirs, so the
  // "inflicted recently" readers (1000160) do not count them; every state reader still sees them on the dummy (`crowdControl`).
  const ownCcTypes = new Set();
  // Who holds a type you do not inflict (W8 step 3): the first foreign holder's unit, "follower" or "minion" (the unit buff set's inflicter).
  const ccForeignBy = new Map();
  const holdCc = (type, schedule, { foreign = false, by = "follower" } = {}) => { const current = ccSchedules.get(type); if (!current || schedule.kind === "full") ccSchedules.set(type, schedule); if (!foreign) ownCcTypes.add(type); else if (!ccForeignBy.has(type)) ccForeignBy.set(type, by); };
  // The unit that holds an ailment you do not inflict yourself (Frostbite only the follower keeps), from the set's entries.
  const foreignAilmentBy = (name) => (buffs ? buffs.entries(name).find((entry) => entry.inflictedBy !== "you")?.inflictedBy : null) ?? "follower";
  const ownAilmentList = buffs ? buffs.types("Ailment", { by: BY_YOU, stage: "model" }) : Array.isArray(state.ownAilments) ? state.ownAilments : null;
  for (const line of find(PATTERNS.witchAntelope)) {
    const match = line.clean.match(PATTERNS.witchAntelope);
    const radius = num(match[1]), cooldown = num(match[2]);
    const paralysisValue = round(BUFF_VALUES.paralysis * (1 + paralysisEffect / 100));
    const ownParalysisSchedule = cast(Math.min(BUFF_VALUES.paralysisDurationSeconds, 2 * cooldown), 2 * cooldown);
    const allowed = conditionOn("witchAntelope"), inside = explicitRadiusHolds(radius, state.nearTarget);
    const active = allowed && inside, held = paralysisHeld;
    // Grudge's chance Paralysis (above) is the same debuff (1 stack): one union schedule, 1 − Π(1 − level), carried here.
    const merged = active && !held && chanceParalysisActive.length > 0 && !paralysisMergedInto;
    const paralysisSchedule = merged ? { kind: "union", schedules: [ownParalysisSchedule, ...chanceParalysisActive.map((item) => item.schedule)] } : ownParalysisSchedule;
    if (merged) { paralysisMergedInto = "witchAntelope"; antelopeParalysis = { schedule: ownParalysisSchedule, percent: paralysisValue, partSchedule: paralysisSchedule }; }
    const uptime = sustainedLevel(paralysisSchedule), sustained = round(paralysisValue * uptime);
    if (active) { holdCc("Paralysis", held ? { kind: "full" } : paralysisSchedule); holdCc("Weaken", { kind: "periodic", durationSeconds: cooldown, periodSeconds: 2 * cooldown, startSeconds: cooldown }); }
    const ccLines = find(PATTERNS.ccTypeDamage).length > 0;
    const reason = !allowed ? offReason("witchAntelope") : !inside ? `outside ${radius} m` : held
      ? `Paralysis is already held by an on-hit source (1 stack), so the Paralysis turns add nothing; Weaken lowers only the enemy's damage${ccLines ? " and counts as a crowd control type (Weaken lasts its cooldown: best case, provisional)" : ""}`
      : `best case: Paralysis (+${paralysisValue}% damage taken, 4 s base duration: manual rule 1002020420) and Weaken in turn, a cast every ${cooldown} s from t = 0: Paralysis on 0–4 s of every ${2 * cooldown} s, ${round(sustainedLevel(ownParalysisSchedule) * 100)}% uptime${merged ? `, combined with ${chanceParalysisActive.map((item) => `${item.skill}'s ${item.support}`).join(", ")} (1 − Π(1 − uptime), 1 stack) to ${round(uptime * 100)}%` : ""} (+${sustained}% sustained); Weaken lasts its cooldown (not sourced: best case, provisional)`;
    addTimed({ id: "witchAntelope", label: "Witch Antelope (Paralysis / Weaken)", target: "enemy", enabled: allowed, active, reason, summary: `Paralysis +${paralysisValue}% damage taken for 4 s every ${2 * cooldown} s and Weaken in turn, cast at t = 0`,
      ...(active && held && !ccLines ? { status: "No DPS effect" } : {}),
      parts: active && !held ? [{ type: null, reach: "all", percent: paralysisValue, schedule: paralysisSchedule }] : [],
      bodies: held ? [] : [`+${sustained}% damage taken`], derived: active && !held ? [[`+${sustained}% damage taken`, `Witch Antelope's Paralysis at ${round(uptime * 100)}% uptime (best case, provisional)`]] : [] }, line);
  }

  // Kismet: Ice Soul (game affix 494613472: Frostbite on enemies within 6 m): src/enemy-ailments.js adds Frostbite to the dummy;
  // its Cold Damage taken is the Frostbite line above. Not a best-case assumption (it always holds within 6 m).
  for (const line of find(PATTERNS.iceSoul)) entry(line, frostbitten, frostbitten ? `the dummy is Frostbitten (Nearby enemies, within 6 m: game affix 494613472; holds close and at the Distant 6 m alternative): Frostbite Rating ${debuffs.frostbiteRating}, a crowd control type and an Ailment on the dummy` : "a build-wide Cannot inflict Frostbite line blocks it", { enemyDebuff: true, bodies: frostbitten ? [`+${round(debuffs.frostbiteRating * (1 + frostbiteEffect / 100) * frostbiteEffectAdditional)}% additional Cold Damage taken`] : [] });

  // Grudge's Paralysis on its own clock (not held by an on-hit source, not merged into Witch Antelope's part above).
  const chanceParalysis = { sources: chanceParalysisSources, value: round(BUFF_VALUES.paralysis * (1 + (ownParalysis ? paralysisEffect : 0) / 100)), uptime: 0, factor: 1, held: paralysisHeld, mergedInto: paralysisMergedInto };
  // The one Paralysis debuff's timed part as the trigger bus needs it (W10 step 2, src/trigger-bus.js; read only, no figure reads it): the timed
  // effect that carries it (this one, or Witch Antelope's when merged), its percent and schedule, and each active source with what fires it: a
  // support clause on its setup's damage (Grudge: game record 369609664, trigger 1000030 on "this skill"), a recipe row (its holder), or another
  // clock (the follower's casts, Discord's turn, a fissure, your Minions, Witch Antelope's own turns). Null when an on-hit source holds it.
  const busParalysisSource = (item) => ccRecipeParalysisHolds.has(item) ? { owner: "recipe", schedule: item.schedule, holder: ccRecipeParalysisHolds.get(item) }
    : item.setupKey && !item.fissure && !item.follower && !item.recipe ? { owner: "support", schedule: item.schedule, setupKey: item.setupKey, skill: item.skill, support: item.support, text: item.text, chancePercent: item.chancePercent, durationSeconds: BUFF_VALUES.paralysisDurationSeconds }
      : { owner: "other", schedule: item.schedule, skill: item.skill, support: item.support };
  const busParalysis = paralysisHeld || !chanceParalysisActive.length ? null
    : paralysisMergedInto === "witchAntelope" && antelopeParalysis ? { timedId: "witchAntelope", percent: antelopeParalysis.percent, schedule: antelopeParalysis.partSchedule, sources: [{ owner: "other", schedule: antelopeParalysis.schedule, skill: "Witch Antelope", support: "Paralysis" }, ...chanceParalysisActive.map(busParalysisSource)] }
      : paralysisMergedInto ? null : { timedId: "chanceParalysis", percent: chanceParalysis.value, schedule: chanceParalysisActive.length === 1 ? chanceParalysisActive[0].schedule : { kind: "union", schedules: chanceParalysisActive.map((item) => item.schedule) }, sources: chanceParalysisActive.map(busParalysisSource) };
  if (chanceParalysisActive.length) {
    const schedule = chanceParalysisActive.length === 1 ? chanceParalysisActive[0].schedule : { kind: "union", schedules: chanceParalysisActive.map((item) => item.schedule) };
    const uptime = sustainedLevel(schedule), sustained = round(chanceParalysis.value * uptime);
    Object.assign(chanceParalysis, { schedule, uptime: round(uptime), factor: round(1 + sustained / 100) });
    if (!chanceParalysis.held && !paralysisMergedInto) {
      // W8 step 3 (Group B): a Paralysis only your Minions' rows inflict (1000047, node 111 Minion hits) is theirs, not yours, like the follower's.
      holdCc("Paralysis", schedule, { foreign: chanceParalysisActive.every((item) => item.follower || item.minion), by: chanceParalysisActive.every((item) => item.follower) ? "follower" : "minion" });
      const label = chanceParalysisActive.map((item) => `${item.skill}: ${item.support}`).join(", ");
      timedEffects.push({ id: "chanceParalysis", label: "Paralysis (support chance)", source: label, text: chanceParalysisActive.map((item) => item.text).join(" · "), target: "enemy", toggle: false, provisional: true, enabled: true, active: true,
        reason: chanceParalysisActive.map((item) => item.reason).join("; "), summary: `Paralysis +${chanceParalysis.value}% damage taken at ${round(uptime * 100)}% uptime`,
        parts: [{ type: null, reach: "all", percent: chanceParalysis.value, schedule }], bodies: [`+${sustained}% damage taken`] });
      derive(`+${sustained}% damage taken`, `${label}: Paralysis (+${chanceParalysis.value}% damage taken × ${round(uptime * 100)}% uptime)`, `Paralysis from ${label} at ${round(uptime * 100)}% uptime (provisional)`, true);
    }
  }

  // Crowd control types on the dummy (game keyword 742: Frostbite, Freeze, Paralysis, Knockback, Weaken, Slow, Taunt and
  // Blinding; user-accepted 2026-10-13 that Frostbite and Freeze count). "For every type of crowd control effect the enemy has,
  // you and your Minions deal +X% additional damage to them" (game affix 75106: one multiplier, X × the count at hit time):
  // the count follows each type's clock (Witch Antelope's turns), so it is a timed sum. Knockback is instantaneous: not counted.
  if (frostbitten) holdCc("Frostbite", discordFrostbiteLine ? discordSchedule(discordInterval(discordFrostbiteLine), 1) : { kind: "full" }, { foreign: Boolean(ownAilmentList) && !ownAilmentList.includes("Frostbite"), by: foreignAilmentBy("Frostbite") });
  if (debuffs.frozen) holdCc("Freeze", { kind: "full" }, { foreign: Boolean(ownAilmentList) && !ownAilmentList.includes("Frostbite"), by: foreignAilmentBy("Frostbite") });
  if (paralysisHeld) holdCc("Paralysis", { kind: "full" });
  if (find(PATTERNS.holyMaiden).length && state.anyHit) for (const type of ["Weaken", "Slow", "Taunt", "Blinding"]) holdCc(type, { kind: "full" });
  if (yourDamage) for (const line of find(PATTERNS.discordCrowdControl)) for (const type of ["Weaken", "Slow", "Taunt", "Blinding"]) holdCc(type, discordSchedule(discordInterval(line), DISCORD_CROWD_CONTROL.indexOf(type)));
  if (find(PATTERNS.paralysisDealDamage).length && dealsDamage) holdCc("Weaken", { kind: "full" });
  // The follower's Weaken, Slow, Taunt and Blind (src/follower-model.js, 2026-10-27): held while it casts (durations not
  // published: best case, provisional, open question follower-crowd-control).
  for (const line of find(PATTERNS.followerCrowdControl)) { const type = line.clean.match(PATTERNS.followerCrowdControl)[1]; holdCc(type, { kind: "full" }, { foreign: true, by: "follower" }); entry(line, true, `the follower keeps ${type} on the dummy while it casts the skill: a crowd control type (held, best case, provisional)`, { provisional: true, enemyDebuff: true, status: crowdControlReaders > 0 ? "In calc" : "No DPS effect" }); }
  // Sacrificial Pawn (Thea – Blasphemer's Disgraced Minister on the Desecrated dummy, alone; reference data keyword: "considered a Crowd
  // Control Effect"; hero trait audit B7, src/thea-traits.js).
  if (state.thea?.blasphemer?.pawn) holdCc("Sacrificial Pawn", { kind: "full" });
  for (const line of find(PATTERNS.channelWeaken)) {
    const radius = num(line.clean.match(PATTERNS.channelWeaken)[2]);
    const active = Boolean(state.channeledMain) && explicitRadiusHolds(radius, state.nearTarget);
    if (active) holdCc("Weaken", { kind: "full" });
    entry(line, active && find(PATTERNS.ccTypeDamage).length > 0, active ? "the channeled Main Skill keeps Weaken on the dummy: Weaken lowers only the enemy's damage and counts as a crowd control type" : "no channeled Main Skill", { status: active ? (find(PATTERNS.ccTypeDamage).length ? "In calc" : "No DPS effect") : "Inactive" });
  }
  for (const line of find(PATTERNS.attackProjectileBlind)) {
    const active = Boolean(state.activeTags?.has?.("Attack") && state.activeTags?.has?.("Projectile"));
    if (active) holdCc("Blinding", { kind: "full" });
    entry(line, active && find(PATTERNS.ccTypeDamage).length > 0, active ? "an active Attack Projectile Skill keeps the dummy Blinded: a crowd control type" : "no active Attack Projectile Skill", { status: active ? (find(PATTERNS.ccTypeDamage).length ? "In calc" : "No DPS effect") : "Inactive" });
  }
  // Crowd control from the game recipes (src/crowd-control-recipes.js; the block before the Paralysis sources above): the types each
  // line holds join the held set, one union per type with the scripted holders (an on-hit holder that keeps a type up wins), and each
  // line gets its badge: In calc where its Paralysis adds damage taken or a reader counts its types (crowd control counters; a Blinded /
  // Paralyzed reader for Blind / Paralysis), No DPS effect where nothing reads them (their own effects act on an enemy that attacks),
  // Inactive where its trigger never fires on the dummy. Replaces the 2026-11-03 morning reading of three wordings (574297, 472365504,
  // 279824224), which the recipes hold the same way.
  // The scripted holders' schedule of each type before the recipe holders join (the trigger bus rebuilds a type's hold without the listeners
  // it owns from this and the recipe holds: src/trigger-bus.js, W10).
  const ccScripted = new Map(ccSchedules);
  // The crowd control counters (their per-type value, cap and derived bodies) and Intimidated's holders, for the same bus.
  const busCounters = [], busIntimidated = [];
  {
    const counted = crowdControlReaders > 0;
    const blindedRead = lines.some((line) => BLINDED_READER.test(line.clean)), paralyzedRead = lines.some((line) => PARALYZED_READER.test(line.clean));
    for (const [type, schedules] of ccRecipeTypes) {
      if (ccRecipeOwnTypes.has(type)) ownCcTypes.add(type);
      else if (!ccForeignBy.has(type) && !ownCcTypes.has(type) && ccRecipeMinionTypes.has(type)) ccForeignBy.set(type, "minion");
      const current = ccSchedules.get(type);
      if (current?.kind === "full") continue;
      const all = current ? [current, ...schedules] : schedules;
      ccSchedules.set(type, all.some((schedule) => schedule.kind === "full") ? { kind: "full" } : all.length === 1 ? all[0] : { kind: "union", schedules: all });
    }
    for (const [line, { id, parts }] of ccRecipeLines) {
      const active = parts.filter((part) => part.active);
      const paralysisAdds = active.some((part) => part.type === "Paralysis") && !chanceParalysis.held;
      const read = active.some((part) => counted || (part.type === "Blinding" && blindedRead) || (part.type === "Paralysis" && paralyzedRead));
      const status = !active.length ? "Inactive" : paralysisAdds || read ? "In calc" : "No DPS effect";
      const tail = !active.length ? "" : paralysisAdds ? "; Paralysis adds its damage taken (one stack whoever inflicts it)" : read ? "" : chanceParalysis.held && active.some((part) => part.type === "Paralysis") ? "; Paralysis is already held by an on-hit source and no line counts crowd control types" : "; no line counts crowd control types and their own effects do nothing to the dummy, which never attacks";
      entry(line, status === "In calc", `${[...new Set(parts.map((part) => part.text))].join("; ")}: crowd control types (tag 5100101; game record ${id})${tail} (provisional)`, { provisional: true, enemyDebuff: true, status, ccHolder: true });
    }
    // The support clauses' badges, the same rule (read by src/support-effects.js clauseStatus through supportConditions).
    for (const { holder, id, parts } of ccSupportHolders) {
      const active = parts.filter((part) => part.active);
      const paralysisAdds = active.some((part) => part.type === "Paralysis") && !chanceParalysis.held;
      const read = active.some((part) => counted || (part.type === "Blinding" && blindedRead) || (part.type === "Paralysis" && paralyzedRead));
      const status = !active.length ? "Inactive" : paralysisAdds || read ? "In calc" : "No DPS effect";
      const tail = !active.length ? "" : paralysisAdds ? "; Paralysis adds its damage taken (one stack whoever inflicts it)" : read ? "; the crowd control readers count it" : "; no line counts crowd control types and their own effects do nothing to the dummy, which never attacks";
      supportCrowdControlStatus.push({ setupKey: holder.setupKey, support: holder.support, gameId: holder.gameId, status, reason: `${[...new Set(parts.map((part) => part.text))].join("; ")}: a crowd control type (tag 5100101; game record ${id})${tail} (provisional)`, types: active.map((part) => part.type) });
    }
  }
  // Judgment: "+X% additional Critical Strike Damage against Paralyzed enemies" multiplies the crit share of every hit while the
  // dummy is Paralyzed (affix 191779, crit tag 5001010: the crit-only bucket). Value × Paralysis uptime is exact for that bucket
  // (E = (1 − c) + c × D × Π(1 + X) is linear in each factor), so the derived crit-only line carries the sustained uptime.
  const paralysisSchedule = ccSchedules.get("Paralysis");
  const paralysisUptime = paralysisSchedule ? sustainedLevel(paralysisSchedule) : 0;
  for (const line of find(PATTERNS.critVsParalyzed)) {
    const percent = num(line.clean.match(PATTERNS.critVsParalyzed)[1]) * (line.multiplier ?? 1), value = round(percent * paralysisUptime);
    const active = paralysisUptime > 0 && state.canCrit !== false;
    const reason = !(paralysisUptime > 0) ? "no Paralysis on the dummy" : !active ? "no modeled hit can crit" : `the dummy is Paralyzed (${round(paralysisUptime * 100)}% uptime): +${percent}% additional damage on the crit share of every hit (crit-only bucket, game affix 191779)${paralysisUptime < 1 ? `, × ${round(paralysisUptime)} uptime = +${value}%` : ""}`;
    entry(line, active, reason, { bodies: [`+${value}% additional damage on Critical Strike`] });
    if (active && value) derive(`+${value}% additional damage on Critical Strike`, line.source, `Paralysis on the dummy (${round(paralysisUptime * 100)}% uptime)`, false);
  }
  const ccTypes = [...ccSchedules.keys()];
  // First Flake of Strange Snow counts these too (see deemedFrostbite above): a type it missed asks for the second run.
  deemedRerun = deemedFrostbite && !state.deemedCrowdControl && ccTypes.some((type) => !deemedFrostbite.types.includes(type)) ? ccTypes : null;
  const ccSum = { kind: "sum", schedules: [...ccSchedules.values()] };
  const ccCount = round(sustainedLevel(ccSum));
  for (const line of find(PATTERNS.ccTypeDamage)) {
    const percent = num(line.clean.match(PATTERNS.ccTypeDamage)[1]) * (line.multiplier ?? 1), value = round(percent * ccCount);
    const active = ccCount > 0;
    entry(line, active, active ? `${ccCount} crowd control type${ccCount === 1 ? "" : "s"} on the dummy on average (${ccTypes.join(", ")}; game keyword 742, Frostbite and Freeze included: user-accepted 2026-10-13)` : "no crowd control effect on the dummy", { bodies: [`+${value}% additional damage`, `+${value}% additional Minion Damage`] });
    if (active) {
      derive(`+${value}% additional damage`, line.source, `${ccCount} crowd control types on the dummy`, true);
      derive(`+${value}% additional Minion Damage`, line.source, `${ccCount} crowd control types on the dummy`, true);
      const timed = ccSum.schedules.some((schedule) => schedule.kind !== "full");
      if (timed) timedEffects.push({ id: `crowdControlTypes:${line.source}`, label: "Crowd control types on the dummy", source: line.source, target: "enemy", toggle: false, enabled: true, active: true, parts: [{ type: null, reach: "all", percent, schedule: ccSum }] });
      busCounters.push({ kind: "ccTypeDamage", source: line.source, perType: percent, cap: Infinity, effectFactor: 1, type: null, bodies: [`+${value}% additional damage`], timedId: timed ? `crowdControlTypes:${line.source}` : null });
    }
  }
  // Self-Delusion (Ethereal Prism core; game affix 452467424: "<Type> Damage additional 12" × a local count of the Crowd Control
  // buffs on the enemy): +X% additional <Type> Damage per crowd control type on the dummy, one additional term (X × the count).
  // User-confirmed 2026-10-18 (audit Q6): the count is the crowd control the planner already applies to the dummy (Frostbite
  // slow, Freeze, Paralysis and the other held types above), listed in the assumptions; provisional until an in-game test.
  let selfDelusion = null;
  for (const line of find(PATTERNS.selfDelusion)) {
    const match = line.clean.match(PATTERNS.selfDelusion);
    const perType = num(match[1]) * (line.multiplier ?? 1), type = match[2][0].toUpperCase() + match[2].slice(1).toLowerCase(), value = round(perType * ccCount);
    const active = ccCount > 0;
    const body = `+${value}% additional ${type} Damage`;
    entry(line, active, active ? `${ccCount} crowd control type${ccCount === 1 ? "" : "s"} on the dummy (${ccTypes.join(", ")}; user-confirmed 2026-10-18, audit Q6): +${round(perType)}% × ${ccCount} = +${value}% additional ${type} Damage` : "no crowd control effect on the dummy (Frostbite, Freeze, Paralysis or another held type)", { bodies: [body] });
    if (active) {
      derive(body, line.source, `${ccCount} crowd control types on the dummy (Self-Delusion)`);
      const timed = ccSum.schedules.some((schedule) => schedule.kind !== "full");
      if (timed) timedEffects.push({ id: `selfDelusion:${line.source}`, label: "Self-Delusion: crowd control types", source: line.source, target: "enemy", toggle: false, enabled: true, active: true, parts: [{ type, reach: "all", percent: perType, schedule: ccSum }] });
      busCounters.push({ kind: "selfDelusion", source: line.source, perType, cap: Infinity, effectFactor: 1, type, bodies: [body], timedId: timed ? `selfDelusion:${line.source}` : null });
    }
    selfDelusion = { active, ccCount, ccTypes, perTypePercent: round(perType), type, value };
  }
  // Intimidated (game buff 35063, 4 s; its own "+12% damage taken / -12% damage at Low Life" rows never act on the dummy) and the
  // added base effect "Intimidated gains an additional base effect: +X% additional Spell and Ailment Damage taken for each type of
  // crowd control effect the target is under. Stacks up to 6 times" (game affix 403241: node 642 injects affix 611468864 into buff
  // 35063; 611468864 has no Low Life gate: on the holder taking damage tagged DoT damage flow (5000004) or Spell + hit damage
  // (6001100 + 5000003), attr 5719 mod 4 = X × min(6, the crowd control buffs on it, tag 5100101: 887539264's
  // GetBuffCfgIdCountByTag)). Sources: "+X% chance to inflict Intimidated on hit" (563280: buff 35063 for 4 s on hit; read as held
  // while the build hits), "Adds Intimidated when you or Minions deal damage", "Enemies within N m are Intimidated" (20976). The
  // count is the planner's crowd control types on the dummy, as the other per-type readers use. One additional term per added-effect
  // line, on Spell hits ("+V% additional Spell Damage taken") and every DoT ("+V% additional Damage Over Time"). The injected value
  // carries GetEffectScale, and "+X% Intimidating effect" (21655: attr 3401 mod 3 on tag 5100212, buff 35063's only tag) raises it:
  // X × count × (1 + Σ Intimidating effect) (2026-11-03; the same injection-and-effect mechanism as Selena's Dreambreaker, 82317 /
  // 409015552, and Bing G2; provisional, open question `intimidated-added-effect-scale`).
  {
    const addedLines = find(PATTERNS.intimidatedAdded);
    const sources = [
      ...find(PATTERNS.intimidateOnHit).map((line) => ({ line, active: Boolean(state.anyHit) && num(line.clean.match(PATTERNS.intimidateOnHit)[1]) > 0, how: "on hit (game recipe 563280: 4 s, renewed by every hit)", off: "no modeled hit" })),
      ...find(PATTERNS.intimidateDealDamage).map((line) => ({ line, active: dealsDamage, how: "when you or your Minions deal damage", off: "the build deals no damage" })),
      ...find(PATTERNS.intimidateNearby).map((line) => { const radius = num(line.clean.match(PATTERNS.intimidateNearby)[1]); return { line, active: explicitRadiusHolds(radius, state.nearTarget), how: `within ${radius} m (game recipe 20976)`, off: `outside ${radius} m` }; })
    ];
    const via = sources.filter((source) => source.active).map((source) => `${source.line.source} ${source.how}`).join("; ");
    if (sources.some((source) => source.active)) passSet.add({ name: "Intimidated", source: via, reason: "Intimidated (game buff 35063) held while its source acts", stage: "debuff" });
    const intimidated = buffs ? passSet.holds("Intimidated") : sources.some((source) => source.active);
    for (const source of sources) {
      const reason = !source.active ? source.off : addedLines.length ? `the dummy is Intimidated (${source.how}): it carries Wings of Light's added base effect (see that line)` : "Intimidated's own effects act only at Low Life (game buff 35063); the training dummy never loses Life";
      entry(source.line, source.active && addedLines.length > 0, reason, { enemyDebuff: true, status: !source.active ? "Inactive" : addedLines.length ? "In calc" : "Not on dummy" });
    }
    const intimidatingEffect = sum(values(PATTERNS.intimidatingEffect));
    for (const line of addedLines) {
      const match = line.clean.match(PATTERNS.intimidatedAdded);
      const perType = num(match[1]) * (line.multiplier ?? 1), cap = num(match[2]);
      const count = Math.min(cap, ccCount), value = round(perType * count * (1 + intimidatingEffect / 100));
      const active = intimidated && count > 0;
      const reason = !intimidated ? "the dummy is not Intimidated (no Intimidated source: \"+X% chance to inflict Intimidated on hit\", \"Adds Intimidated when you or Minions deal damage\")"
        : !(count > 0) ? "the dummy is Intimidated but under no crowd control effect"
          : `the dummy is Intimidated (${via}) and under ${ccCount} crowd control type${ccCount === 1 ? "" : "s"} (${ccTypes.join(", ")}): +${round(perType)}% × ${round(count)}${ccCount > cap ? ` (capped at ${cap})` : ""} ${intimidatingEffect ? `× (1 + ${round(intimidatingEffect)}% Intimidating effect) ` : ""}= +${value}% additional damage taken from Spell hits and Damage Over Time (game affixes 611468864, 21655; no Low Life gate; provisional)`;
      entry(line, active, reason, { provisional: true, enemyDebuff: true, bodies: [`+${value}% additional Spell Damage taken`, `+${value}% additional Damage Over Time`] });
      // Intimidating effect scales the added effect (21655 on tag 5100212): In calc wherever the added effect is.
      if (line === addedLines[0] && active) for (const effect of find(PATTERNS.intimidatingEffect)) entry(effect, true, `scales Wings of Light's added Intimidated effect: +${round(perType)}% × ${round(count)} × (1 + ${round(intimidatingEffect)}%) = +${value}% (game affix 21655: attr 3401 on Intimidated's tag 5100212; provisional)`, { provisional: true, enemyDebuff: true });
      if (active) {
        derive(`+${value}% additional Spell Damage taken`, line.source, `Intimidated with ${round(count)} crowd control types on the dummy`, true);
        derive(`+${value}% additional Damage Over Time`, line.source, `Intimidated with ${round(count)} crowd control types on the dummy (the enemy's Damage Over Time taken)`, true);
        busCounters.push({ kind: "intimidated", source: line.source, perType, cap, effectFactor: 1 + intimidatingEffect / 100, type: null, bodies: [`+${value}% additional Spell Damage taken`, `+${value}% additional Damage Over Time`], timedId: null });
      }
    }
    // Intimidated's holders, for the trigger bus (src/trigger-bus.js, W10): the on-hit lines' records hold it on the loop when it owns their trigger.
    busIntimidated.push(...sources.map((source) => ({ source: source.line.source, text: source.line.clean, line: source.line, how: source.how, active: Boolean(source.active), onHit: PATTERNS.intimidateOnHit.test(source.line.clean) })));
  }
  // Juggernaut (Ethereal Prism core; game affix 105197304): on a player Critical Strike (trigger 1000030, crit tag 5001010) the
  // enemy gains a stack of buff 20392 (8 s, up to 10), and while it has that buff, buff 20390 (affix 537217344: P1 −10, P2 −2,
  // P3 −2) applies −10% additional Armor and −2% Elemental / Erosion Resistance per stack. Reading (core audit B4):
  //   stacks = the expected crits of the last 8 s, capped at 10: E[min(10, N)], N ~ Poisson(crit hits/s × 8 s) from the planner's
  //   hit pass (hitRateFacts.critHitsPerSecond; held at the cap before it is measured). User-supplied 2026-10-19 (not in-game
  //   tested): each stack keeps its own 8 s timer and a new crit does not refresh the older stacks (this model). The Armor part is
  //   one write (chunk 4, 2026-11-01; game record 537217344: attr 4001 mod 4 = P1 × GetBuffStack(20392)): Armor × (1 − 10% × stacks),
  //   so 10 stacks take it to 0. This overrides the same answer's "compounds, × 0.9 ^ stacks", which the record does not support.
  //   The reference data Armor formula DR = A ÷ (0.9 A + K) gives DR' = s ÷ (0.9 s + 1 ÷ DR − 0.9) from the dummy's 50% Physical DR, and
  //   60% of it against non-Physical hits. The resistance part is applied as an equal penetration, −2% per stack summed
  //   (provisional; the dummy's 30% resistance, the same reading as the Spell-hit shred above). Minion crits add no stacks: the
  //   record's only event is 1000030 on your own damage with no Minion row; lines that do count Minions name trigger 1000047 or a
  //   node 111 copy (chunk 4; one link inferred).
  let juggernaut = null;
  for (const line of find(PATTERNS.juggernaut)) {
    const match = line.clean.match(PATTERNS.juggernaut);
    const scale = line.multiplier ?? 1;
    const armourPerStack = num(match[1]) * scale, resistancePerStack = num(match[2]) * scale, seconds = num(match[3]), cap = num(match[4]);
    const measured = Number.isFinite(state.critHitsPerSecond) ? state.critHitsPerSecond : null;
    const canCrit = state.canCrit !== false && (measured == null || measured > 0);
    const stacks = !canCrit ? 0 : measured == null ? cap : expectedCappedPoisson(measured * seconds, cap);
    const armourScale = Math.max(0, 1 - armourPerStack / 100 * stacks);
    const baseDr = JUGGERNAUT_DUMMY_PHYSICAL_ARMOUR_PERCENT / 100;
    const physicalDr = armourScale > 0 ? armourScale / (0.9 * armourScale + 1 / baseDr - 0.9) : 0;
    const penetration = round(resistancePerStack * stacks);
    const armour = { armourPercent: round(physicalDr * 100), nonPhysicalArmourPercent: round(physicalDr * 60) };
    const body = `+${penetration}% Elemental and Erosion Resistance Penetration`;
    const reason = !canCrit ? "no modeled player hit can crit" : `${measured == null ? "crit hit rate not measured yet (held at the cap for this pass)" : `${round(measured)} crit hits/s × ${seconds} s`} → ${round(stacks)} of ${cap} stacks, each on its own ${seconds} s timer: enemy Armor × (1 − ${armourPerStack}% × ${round(stacks)}) = ×${round(armourScale)} (one write per stack count, game record 537217344) (Physical Armor mitigation ${JUGGERNAUT_DUMMY_PHYSICAL_ARMOUR_PERCENT}% → ${armour.armourPercent}%, non-Physical ${round(JUGGERNAUT_DUMMY_PHYSICAL_ARMOUR_PERCENT * 0.6)}% → ${armour.nonPhysicalArmourPercent}%) and −${penetration}% Elemental and Erosion Resistance (applied as penetration; provisional)`;
    // `armourShred`: its Armor part reaches every player hit through the target's Armor (src/planner.js), not through a derived body.
    entry(line, stacks > 0, reason, { provisional: true, enemyDebuff: true, armourShred: true, bodies: stacks > 0 ? [body] : [] });
    if (stacks > 0) derive(body, line.source, `Juggernaut: ${round(stacks)} stacks of −${resistancePerStack}% Elemental and Erosion Resistance (applied as penetration, provisional)`, true);
    juggernaut = { active: stacks > 0, stacks: round(stacks), cap, seconds, critHitsPerSecond: measured, armourScale: round(armourScale), ...armour, penetrationPercent: penetration, reason };
  }
  // Open Wounds (Shadowdancer core; sub-affix 10388613): "+12% additional Hit Physical Damage taken for every stack of Trauma the
  // enemy has, up to +60%". User-confirmed 2026-10-18 (audit Q9): one additional term of 12% × the Trauma stacks, capped at 60%,
  // the stacks from the Trauma model (its limit 1 + Open Wounds' +2, all damaging and on one shared timer like Ignite's, user-confirmed
  // 2026-10-19: src/ailment-model.js); Physical hits only. The stack count
  // is measured by the planner's hit pass (hitRateFacts.trauma; held at the limit before it); the 5 s / 20 s windows build the
  // stacks from the clean dummy at the Trauma stack rate.
  let openWounds = null;
  for (const line of find(PATTERNS.openWounds)) {
    const match = line.clean.match(PATTERNS.openWounds);
    const perStack = num(match[1]) * (line.multiplier ?? 1), cap = num(match[2]) * (line.multiplier ?? 1);
    const trauma = state.trauma || null;
    // Stacks from your own Trauma model (a Minion-held Trauma has no stack count here).
    const inflicted = traumaInflicted;
    const stacks = !inflicted ? 0 : trauma && Number.isFinite(trauma.steadyActiveStacks) ? trauma.steadyActiveStacks : Math.max(1, Number(trauma?.stackLimit) || 1);
    const value = round(Math.min(cap, perStack * stacks));
    const body = `+${value}% additional Hit Physical Damage taken`;
    const active = value > 0;
    const reason = !inflicted ? "the build inflicts no Trauma (enemy-ailment model)" : `${round(stacks)} Trauma stack${stacks === 1 ? "" : "s"} on the dummy${trauma && Number.isFinite(trauma.steadyActiveStacks) ? ` (Trauma limit ${trauma.stackLimit}; ${round(trauma.stackRate || 0)} stacks/s on one shared ${round(trauma.durationSeconds || 0)} s timer that every application refreshes, so the run holds its stacks; user-confirmed 2026-10-19)` : " (not measured yet: held at the limit for this pass)"} × ${round(perStack)}% = +${value}% additional Hit Physical Damage taken (cap ${round(cap)}%; user-confirmed 2026-10-18, audit Q9)`;
    entry(line, active, reason, { enemyDebuff: true, bodies: [body] });
    if (active) {
      derive(body, line.source, `Open Wounds: ${round(stacks)} Trauma stacks on the dummy`);
      const rate = Number(trauma?.stackRate) || 0, capStacks = cap / perStack, held = Math.min(stacks, capStacks);
      if (rate > 0) {
        const points = [];
        for (let k = 1; k < held; k++) points.push([round(k / rate), k]);
        points.push([round(held / rate), round(held)]);
        timedEffects.push({ id: `openWounds:${line.source}`, label: "Open Wounds: Trauma stacks", source: line.source, target: "enemy", toggle: false, enabled: true, active: true, parts: [{ type: "Physical", reach: "hit", percent: perStack, schedule: { kind: "steps", points, sustained: round(held) } }] });
      }
    }
    openWounds = { active, stacks: round(stacks), perStackPercent: round(perStack), capPercent: round(cap), value, reason };
  }

  // Valkyrie's Night Patrol: Revelations of War. Valkyrie's Hymn (buff 11280; keyword 2000011 "X% additional Elemental Damage
  // to Attack Skills for each stack (multiplies)", the buff's affix 779656320 [4]) is gained per 2% Max Mana consumed; base max
  // 4 stacks (game affix 451704480: GetAttr 3442 + 4) plus "+N Max Valkyrie's Hymn Stacks"; "+X% Elemental Damage for every
  // stack" and "+10% Elemental Resistance Penetration at max stacks". Own buff: full stacks when pre-built (condition
  // valkyrieHymn); the Main Skill is assumed to consume Mana and the Hymn's duration is not in the saved data (provisional).
  for (const line of find(PATTERNS.valkyrieGain)) {
    const maxStacks = 4 + sum(values(PATTERNS.valkyrieMax));
    const perStack = sum(values(PATTERNS.valkyriePerStack)), pen = sum(values(PATTERNS.valkyrieAtMax));
    const hymn = round((1.04 ** maxStacks - 1) * 100);
    const allowed = conditionOn("valkyrieHymn"), active = allowed && Number(state.mainUsesPerSecond) > 0;
    const reason = !allowed ? offReason("valkyrieHymn") : !active ? "no Main Skill consumes Mana" : `best case: ${maxStacks} Hymn stacks held (own buff${prebuilt ? ", pre-built" : "; its build-up from Mana spent is not modeled, held from t = 0"}): +${hymn}% additional Elemental Damage for Attack Skills (4% per stack, multiplies), +${round(perStack * maxStacks)}% Elemental Damage${pen ? `, +${pen}% Elemental Resistance Penetration` : ""} (provisional: the Main Skill consumes Mana; the Hymn's duration is not in the saved data)`;
    const derivedLines = [[`+${hymn}% additional Elemental Damage for Attack Skills`, `${maxStacks} Valkyrie's Hymn stacks`], ...(perStack ? [[`+${round(perStack * maxStacks)}% Elemental Damage`, `${maxStacks} Valkyrie's Hymn stacks`]] : []), ...(pen ? [[`+${pen}% Elemental Resistance Penetration`, "Max Valkyrie's Hymn stacks"]] : [])];
    addTimed({ id: "valkyrieHymn", label: "Valkyrie's Hymn", target: "self", enabled: allowed, active, reason, summary: `${maxStacks} Hymn stacks held`, parts: [], bodies: derivedLines.map(([text]) => text), derived: derivedLines },
      line, [...find(PATTERNS.valkyrieMax), ...find(PATTERNS.valkyriePerStack), ...find(PATTERNS.valkyrieAtMax)]);
  }

  // "Consumes X% of current Mana when casting a Main Skill" (Arcanist; record 266457104, node 500 + node 122 type 2; 2026-11-05 build
  // audit gap 1): Mana consumed for the "per Mana consumed" readers (src/resource-consumption.js mainSkillManaConsumption). In calc where
  // such a reader is on the build (a node 612 collector on data type 10000010 / 10000011, or Utmost Devotion's Mercury Pts); else no
  // damage effect. Node 122's consumption raises the consumed-Mana event (proven, research/oq-15t-client-2026-11-05.md §2).
  {
    const consume = state.resourceConsumption?.consume || null;
    const readers = lines.some((other) => (/Mana consumed recently/i.test(other.clean) && !/^\+?[\d.]+% Mana Regeneration Speed for every/i.test(other.clean)) || /Mercury Pts for every [\d.]+ Mana consumed/i.test(other.clean));
    for (const line of find(PATTERNS.mainSkillManaConsume)) {
      const copy = consume?.copies?.find((item) => item.text === line.clean && item.source === line.source) || consume?.copies?.find((item) => item.text === line.clean) || null;
      const moving = Boolean(copy && copy.manaPerSecond > 0);
      const why = !state.resourceConsumption?.measured ? "Mana consumed: measured by the hit pass" : consume?.blocked ? consume.blocked : !moving ? "no Main Skill use measured" : `${copy.manaPerUse} Mana a use (${copy.percent}% of the current Mana, ${consume.currentMana} at the planner's Mana state) × ${copy.usesPerSecond} Main Skill uses/s = ${copy.manaPerSecond} Mana consumed per second${readers ? ", read by the build's Mana-consumed lines" : "; no Mana-consumed reader on the build"}`;
      entry(line, moving, why, { status: moving && readers ? "In calc" : consume?.blocked ? "Inactive" : "No DPS effect", provisional: moving && readers });
    }
  }

  // "Consumes X% of current Life when you use Attack Skills" (record 200000005, node 500 + node 122 type 1; 2026-11-08 build audit gap 4):
  // Life consumed for the "Life consumed" readers (src/resource-consumption.js attackLifeConsumption), In calc where one is on the build
  // (a gate 610 / node 612 on 10000000 / 10000001, Hysteria's Rage); its Regain enabler role stays (src/regain-model.js).
  {
    const consume = state.resourceConsumption?.attackConsume || null;
    const readers = lines.some((other) => /Life (?:has been )?consumed recently|consumed more than [+\d.]+ ?% (?:of )?(?:Max )?Life recently|Rage for every [\d.]+% Max Life consumed/i.test(other.clean));
    for (const line of find(PATTERNS.attackLifeConsume)) {
      const moving = Boolean(consume && consume.lifePerSecond > 0);
      const why = !state.resourceConsumption?.measured ? "Life consumed: measured by the hit pass" : !moving ? "no Attack use measured" : `${consume.percent}% of ${consume.currentLife} current Life (the planner's Life state; every copy reads the same current Life) × ${consume.usesPerSecond} Attack uses/s (${consume.uses.map((use) => `${use.name} ${use.stepsPerSecond}`).join(", ")}) = ${consume.lifePerSecond} Life consumed per second${readers ? ", read by the build's Life-consumed lines" : "; no Life-consumed reader on the build"} (record 200000005; its links proven, research/attack-life-consume-2026-11-09.md; current Life the Life group's best case)`;
      entry(line, moving, why, { status: moving && readers ? "In calc" : "No DPS effect", provisional: moving && readers });
    }
  }

  // Icemirror: Stage in the Mirror. Mirrored Shade (buff 11750) every 1 s while standing on a Terra Skill: "+X% additional Terra
  // Skill Damage while having Mirrored Shade" and "+1 Max Terra Charge Stacks when Mirrored Shade reaches max stacks" (the max
  // is 3 in buff 11750's record). Best case (condition mirroredShade): the player stands on the Main Terra Skill; own buff, so the
  // stacks are full from t = 0 when pre-built; otherwise the damage starts after the first interval and the cap is assumed
  // reached (provisional). The Terra Charge line reaches src/selena-dance.js through src/planner.js (icemirrorTerraChargeLines).
  for (const line of find(PATTERNS.mirroredGain)) {
    const interval = num(line.clean.match(PATTERNS.mirroredGain)[1]);
    const damage = sum(values(PATTERNS.mirroredDamage)), charge = sum(values(PATTERNS.mirroredCharge));
    const allowed = conditionOn("mirroredShade"), active = allowed && Boolean(state.mainIsTerra);
    const reason = !allowed ? offReason("mirroredShade") : !state.mainIsTerra ? "no Main Terra Skill to stand on" : `best case: the player stands on the Main Terra Skill, Mirrored Shade every ${interval} s${prebuilt ? " (own buff, pre-built: full from t = 0)" : ` (from ${interval} s in the windows)`}${damage ? `: +${damage}% additional Terra Skill Damage` : ""}${charge ? `; max stacks reached: +${charge} Max Terra Charge Stacks` : ""} (provisional: the max stacks and duration are not in the saved data)`;
    addTimed({ id: "mirroredShade", label: "Mirrored Shade (Icemirror)", target: "self", enabled: allowed, active, reason, summary: `standing on the Main Terra Skill, Mirrored Shade held${damage ? `: +${damage}% additional Terra Skill Damage` : ""}`,
      parts: active && damage && !prebuilt ? [{ type: null, reach: "all", percent: damage, schedule: { kind: "ramp", maxStacks: 1, intervalSeconds: interval, startStacks: 0 } }] : [],
      bodies: damage ? [`+${damage}% additional Terra Skill Damage`] : [], derived: damage ? [[`+${damage}% additional Terra Skill Damage`, "Mirrored Shade held (best case)"]] : [] },
      line, [...find(PATTERNS.mirroredMax), ...find(PATTERNS.mirroredDamage), ...find(PATTERNS.mirroredCharge)]);
  }

  // Kitty Express: Assassin Cat Snack. Feline Stimulant (buff 11360; keyword 2000014 "X% additional Attack Damage for each stack
  // (multiplies)", the buff's affix 101010078 [5]) on each Main Skill use (game: triggering a Main Skill; read as using it,
  // provisional); base max 3 (game affix 86855680: GetAttr 3442 + 3) plus "+N to Max Feline Stimulant stacks"; "+X% additional
  // Attack Damage when having Feline Stimulant"; Attack Aggression at max (read above). Own buff, full when pre-built
  // (condition felineStimulant); its duration is not in the saved data (provisional).
  for (const line of find(PATTERNS.felineGain)) {
    const maxStacks = 3 + sum(values(PATTERNS.felineMax)), having = sum(values(PATTERNS.felineDamage));
    const buff = round((1.05 ** maxStacks - 1) * 100);
    const allowed = conditionOn("felineStimulant"), active = felineOn;
    const reason = !allowed ? offReason("felineStimulant") : !active ? (Number(state.mainUsesPerSecond) > 0 ? "the Main Skill is never triggered (trigger 1000060: a triggered use, not one you cast yourself)" : "no Main Skill in use") : `best case: ${maxStacks} Feline Stimulant stacks held (own buff${prebuilt ? ", pre-built" : "; held from t = 0, its build-up is not modeled"}): +${buff}% additional Attack Damage (5% per stack, multiplies)${having ? `, +${having}% additional Attack Damage while having it` : ""}${find(PATTERNS.felineAggression).length ? ", Attack Aggression at max stacks" : ""} (provisional: the duration is not in the saved data)`;
    const derivedLines = [[`+${buff}% additional Attack Damage`, `${maxStacks} Feline Stimulant stacks`], ...(having ? [[`+${having}% additional Attack Damage`, "having Feline Stimulant"]] : [])];
    addTimed({ id: "felineStimulant", label: "Feline Stimulant (Kitty Express)", target: "self", enabled: allowed, active, reason, summary: `${maxStacks} Feline Stimulant stacks held`, parts: [], bodies: derivedLines.map(([text]) => text), derived: derivedLines },
      line, [...find(PATTERNS.felineMax), ...find(PATTERNS.felineDamage), ...find(PATTERNS.felineAggression)]);
  }

  // Squiddle: Squidnova (buff 11300: "+16% additional Hit Damage for skills cast by Spell Burst", scaled by Squidnova Effect)
  // when Spell Burst is consumed with at least 4 Max Spell Burst; "+X% additional Spell Damage" and "+1 Max Spell Burst" while
  // having it. Best case (condition squidnova): held while a Spell Main Skill Spell Bursts (its duration is not in the saved
  // data; provisional).
  // The Max Spell Burst a Spell Burst consumes (record 162938320: gate |Δ Spell Burst Charge| ≥ P1 on the consume, trigger 1000303):
  // the build's lines plus Bing's Multi-Coupling Equation stacks (record 53529464, attr 6361 flat), the figure the hit model reads
  // (src/bing-traits.js creative.maxSpellBurst). Before (10 T claim audit, 2026-11-09) Squidnova read the lines alone (3 for 4).
  const maxSpellBurst = Number.isFinite(state.bing?.creative?.maxSpellBurst) ? state.bing.creative.maxSpellBurst : maxSpellBurstTotal(modifierTexts);
  for (const line of find(PATTERNS.squidGain)) {
    const threshold = num(line.clean.match(PATTERNS.squidGain)[1]);
    const effect = sum(values(PATTERNS.squidEffect)), spell = sum(values(PATTERNS.squidDamage)), burst = sum(values(PATTERNS.squidBurst));
    const hit = round(16 * (1 + effect / 100));
    const allowed = conditionOn("squidnova"), active = allowed && Boolean(state.mainIsSpell) && maxSpellBurst >= threshold;
    const reason = !allowed ? offReason("squidnova") : !state.mainIsSpell ? "no Spell Main Skill" : maxSpellBurst < threshold ? `Max Spell Burst ${maxSpellBurst} < ${threshold}` : `best case: Squidnova held (Max Spell Burst ${maxSpellBurst} ≥ ${threshold}): +${hit}% additional Hit Damage for skills cast by Spell Burst${spell ? `, +${spell}% additional Spell Damage` : ""}${burst ? `, +${burst} Max Spell Burst` : ""} (provisional: the duration is not in the saved data)`;
    const derivedLines = [[`+${hit}% additional Hit Damage for skills cast by Spell Burst`, "Squidnova held"], ...(spell ? [[`+${spell}% additional Spell Damage`, "having Squidnova"]] : []), ...(burst ? [[`+${burst} Max Spell Burst`, "having Squidnova"]] : [])];
    addTimed({ id: "squidnova", label: "Squidnova (Squiddle)", target: "self", enabled: allowed, active, reason, summary: "Squidnova held", parts: [], bodies: derivedLines.map(([text]) => text), derived: derivedLines },
      line, [...find(PATTERNS.squidEffect), ...find(PATTERNS.squidDamage), ...find(PATTERNS.squidBurst)]);
  }

  // Kismet: Spider Fluid (game affix 635242752: an independent 4 s stack per Wilt stack inflicted, increased damage attr 57191)
  // and Kismet: Scorpion Stinger (game affix 260658592: an independent 4 s stack per Reap). Own buffs, at their cap when
  // pre-built (user 2026-10-13; conditions spiderFluid / scorpionStinger): the build's Wilt or Reap rate over 4 s is assumed to
  // reach the cap (provisional; the rates resolve after these lines).
  for (const line of find(PATTERNS.spiderFluid)) {
    const match = line.clean.match(PATTERNS.spiderFluid);
    const value = round(num(match[1]) * (line.multiplier ?? 1) * num(match[2]));
    const wilt = inflictedAilments.includes("Wilt");
    const allowed = conditionOn("spiderFluid"), active = allowed && wilt;
    addTimed({ id: "spiderFluid", label: "Spider Fluid (Wilt stacks)", target: "self", enabled: allowed, active, summary: `${match[2]} Wilt stacks inflicted recently held`,
      reason: !allowed ? offReason("spiderFluid") : !wilt ? "the build inflicts no Wilt" : `best case: ${match[2]} stacks held (own buff${prebuilt ? ", pre-built" : ", held from t = 0"}; the Wilt rate over 4 s is assumed to reach the cap: provisional)`,
      parts: [], bodies: [`+${value}% damage`], derived: [[`+${value}% damage`, `${match[2]} Wilt stacks inflicted recently`]] }, line);
  }
  for (const line of find(PATTERNS.scorpionStinger)) {
    const match = line.clean.match(PATTERNS.scorpionStinger);
    const cap = round(num(match[2]) * (line.multiplier ?? 1));
    const allowed = conditionOn("scorpionStinger"), active = allowed && Boolean(state.hasReaping);
    addTimed({ id: "scorpionStinger", label: "Scorpion Stinger (Reaps recently)", target: "self", enabled: allowed, active, summary: `+${cap}% Reaping Recovery Speed held`,
      reason: !allowed ? offReason("scorpionStinger") : !state.hasReaping ? "no Reaping source" : `best case: +${cap}% Reaping Recovery Speed held (own buff${prebuilt ? ", pre-built" : ", held from t = 0"}; at least ${round(cap / num(match[1]))} Reaps in 4 s assumed: provisional)`,
      parts: [], bodies: [`+${cap}% Reaping Recovery Speed`], derived: [[`+${cap}% Reaping Recovery Speed`, "Reaps dealt recently at the cap"]] }, line);
  }

  // Dual Kismet: Witch's Cauldron: "When at full Energy Shield, removes all Energy Shields, +20% additional Max Mana, and +10%
  // additional Spell Damage for 4s". Best-case uptime (user 2026-10-13; condition witchCauldron): held, the Energy Shield
  // recharge cadence is not modeled (provisional).
  for (const line of find(PATTERNS.witchCauldron)) {
    const match = line.clean.match(PATTERNS.witchCauldron);
    const spell = round(num(match[2]) * (line.multiplier ?? 1));
    const allowed = conditionOn("witchCauldron"), active = allowed && Boolean(state.dealsSpellDamage);
    addTimed({ id: "witchCauldron", label: "Witch's Cauldron", target: "self", enabled: allowed, active, summary: `+${spell}% additional Spell Damage held`,
      reason: !allowed ? offReason("witchCauldron") : !state.dealsSpellDamage ? "the build deals no Spell Damage" : `best case: +${spell}% additional Spell Damage held (re-triggered as soon as Energy Shield refills; the recharge cadence is not modeled: provisional)`,
      parts: [], bodies: [`+${spell}% additional Spell Damage`], derived: [[`+${spell}% additional Spell Damage`, `Witch's Cauldron held (best case, provisional)`]] }, line);
  }

  // Not modeled, with the reason (they read "No DPS effect" before): Flash Flood needs the Spell Burst count per 4 s and the halved
  // Spell Burst limit. (Sky Piercer is read since census #5, 2026-10-27: src/line-conditions.js key mobility.)
  // Its "Halves Spell Burst Upper Limit" (game affix 101070006: attr 6361 additional −50%) is read by every Max Spell Burst reader
  // (src/max-spell-burst.js; wiring audit W1 gap 2, 2026-11-03); the per-Spell-Burst speed line is still not modeled.
  for (const line of find(PATTERNS.flashFlood)) {
    if (/^Halves Spell Burst Upper Limit$/i.test(line.clean)) entry(line, maxSpellBurst > 0, maxSpellBurst > 0 ? `Max Spell Burst × 0.5 = ${round(maxSpellBurst)} (game affix 101070006: additional −50% on attr 6361)` : "no Max Spell Burst", { status: maxSpellBurst > 0 ? "In calc" : "Inactive" });
    else entry(line, false, maxSpellBurst >= 1 && state.mainIsSpell ? "Spell Bursts per 4 s are not modeled" : "no Spell Burst", { status: maxSpellBurst >= 1 && state.mainIsSpell ? "Not modeled" : "Inactive" });
  }

  // ---- Numbed ----
  // Erika – Lightning Shadow (hero trait audit B5, Q-H10 provisional; src/erika-traits.js felineFigureState): Feline Figure's
  // Numbed on the dummy (its average stacks, at most 10; another Numbed source keeps the dummy at 10) and the "additional Numbed
  // Effect" lines as one multiplier (the trait lines, Wild Lightning, Charging Equation, Charging Tail on Feline Figure's share).
  const felineFigure = state.felineFigure?.active ? state.felineFigure : null;
  // Another source's Numbed: not the Feline Figure's own hold this pass puts on the dummy below (W8 step 3 Group B), so a rerun of the pass
  // (the deemed Frostbite rerun, the badge probes' state copies) reads Feline Figure's own stacks, not a held 10.
  const otherNumbed = buffs ? buffs.entries("Numbed").some((item) => !felineNumbedHold(item)) : onDummy("Numbed") && !state.felineNumbedOnly;
  // Feline Figure fires once on the dummy without a retrigger (game affix 264779, 2026-10-31): its 2 s opening is the timed part below,
  // and the sustained dummy is not Numbed.
  const numbed = otherNumbed || Boolean(felineFigure?.totalStacks > 0);
  // Thunder Manipulator (game recipe 617084288, 2026-10-28): on a Critical Strike that deals Lightning Damage (trigger 1000030, tags
  // 5001010 + 5001110), a 2 s buff of +X% additional Numbed Effect (attr 34011, mod 4) on the Numbed the build inflicts. Uptime
  // min(1, Lightning crit hits/s × duration) from the hit pass (state.lightningCritHitsPerSecond; held at 1 before it is measured),
  // time-averaged as one additional factor (provisional, as Tremble's crit buff; open question first-aember-crafting lists it).
  const lightningCrits = state.lightningCritHitsPerSecond;
  const numbedCritBuffFactor = find(PATTERNS.numbedCritBuff).reduce((product, line) => {
    const [, value, seconds] = line.clean.match(PATTERNS.numbedCritBuff);
    const uptime = lightningCrits == null ? 1 : Math.min(1, Math.max(0, Number(lightningCrits)) * num(seconds));
    const active = numbed && uptime > 0;
    entry(line, active, !numbed ? "the build inflicts no Numbed" : uptime <= 0 ? "no modeled Critical Strike deals Lightning Damage" : lightningCrits == null ? "Lightning crit rate not measured yet (held for this pass)" : `${round(lightningCrits)} Lightning crit hits/s × ${num(seconds)} s → uptime ${round(uptime)}; +${num(value)}% additional Numbed Effect × uptime`, { provisional: true });
    return active ? product * (1 + (num(value) / 100) * uptime) : product;
  }, 1);
  const numbedAdditional = (felineFigure ? felineFigure.additionalFactor : state.felineFigure?.otherNumbed ? state.felineFigure.additionalFactor : 1) * numbedCritBuffFactor;
  // "Changes the base effect of Numbed" (game record 289590144): your own Numbed infliction (trigger 1000150, Numbed tag) gives you the
  // buff that changes it, so a Numbed only the follower or your Minions inflict keeps the +5% (wiring audit W2 gap 6, 2026-11-03; inferred:
  // the follower's events go to its own rows).
  const ownNumbed = Boolean(felineFigure?.totalStacks > 0) || (buffs ? buffs.holds("Numbed", { by: BY_YOU, stage: "model" }) : Array.isArray(state.ownAilments) ? state.ownAilments.includes("Numbed") : otherNumbed);
  const numbedBase = (ownNumbed ? find(PATTERNS.numbedBase).map((line) => num(line.clean.match(PATTERNS.numbedBase)[1]))[0] : null) ?? BUFF_VALUES.numbedPerStack;
  // + a supported skill's time-averaged crit buff on the Numbed it inflicts (Thunder Spike: Tremble; src/crit-numbed-buff.js,
  // state.numbedEffectBuffs from src/planner.js; 2026-10-14, provisional): the dummy keeps the stronger Numbed.
  const numbedEffect = sum(values(PATTERNS.numbedEffect)) + (state.numbedEffectBuffs || []).reduce((total, buff) => total + (Number(buff.value) || 0), 0);
  // The revived Numbed family as the dummy's only Numbed source (game affix 16227245, buff 170; chunk 2, 2026-11-01): every Nth Lightning
  // damage event, gated by the Interval, adds M stacks of 2 s × (1 + Numbed Duration), each on its own timer, so
  // min(10, M × min(events/s ÷ N, 1 ÷ Interval) × duration). Lightning hits are the events modeled (a Lightning DoT tick would count too,
  // trigger 1000030 fires on DoT: 599597); before the hit pass the cap is held. One Lightning source holds at most 4 stacks on T2 / T3.
  const revivedNumbedLine = otherNumbed && !find(FOLLOWER_NUMBED_LINE).length ? find(PATTERNS.numbedOnLightning).find((line) => (state.enemyAilmentSources || {}).Numbed === line.source) ?? null : null;
  const revivedNumbed = (() => {
    const hits = state.lightningHitsPerSecond;
    if (!revivedNumbedLine || !(Number(hits) > 0)) return null;
    const [, every, perTrigger, , interval] = revivedNumbedLine.clean.match(PATTERNS.numbedOnLightning);
    const triggersPerSecond = Math.min(Number(hits) / num(every), 1 / num(interval));
    const durationSeconds = BUFF_VALUES.numbedDurationSeconds * (1 + sum(values(NUMBED_DURATION_LINE)) / 100);
    return { triggersPerSecond, perTrigger: num(perTrigger), durationSeconds, stacks: Math.min(BUFF_VALUES.numbedMaxStacks, num(perTrigger) * triggersPerSecond * durationSeconds) };
  })();
  // Client 0x141ef1180 (chunk 14, 2026-11-01; manual rule 1002000720): on a Numbed enemy each attacker's Lightning hits build a store, and every whole
  // (field 2006882, 10%) × (Max Life + Max Energy Shield) in it adds a stack; the rest carries. The follower's strikes are 50 flat Lightning, so they never reach
  // one on any dummy that survives a fight: with no Lightning hit of yours it holds the 1 stack the strike that finds it clean inflicts (tick-numbed-stacks).
  const followerNumbedOnly = otherNumbed && find(FOLLOWER_NUMBED_LINE).length > 0 && state.lightningHitsPerSecond === 0;
  // Numbed only your Minions keep on the dummy (src/minion-ailment-types.js "+X% Numbed chance for Minions"; wiring audit gap 2,
  // 2026-11-03; provisional): its uptime share of the stacks (10 when Lightning hits of yours fill the store, else the 1 stack the Minion
  // strike that finds it clean inflicts, as for the follower), time-averaged.
  const minionNumbedShare = buffs ? (buffs.heldOnlyBy("Numbed", "minion") ? buffs.share("Numbed") : undefined) : state.enemyAilmentUptime?.Numbed;
  const minionNumbedStacks = otherNumbed && minionNumbedShare != null ? (state.lightningHitsPerSecond === 0 ? 1 : BUFF_VALUES.numbedMaxStacks) * minionNumbedShare : null;
  debuffs.numbedStacks = revivedNumbed ? round(revivedNumbed.stacks) : followerNumbedOnly ? 1 : minionNumbedStacks !== null ? round(minionNumbedStacks) : otherNumbed ? BUFF_VALUES.numbedMaxStacks : felineFigure ? felineFigure.totalStacks : 0;
  // A changed base effect (Conductive: "+11% additional Lightning Damage taken") replaces the +5% per stack and stacks the same,
  // max 10 (user-confirmed 2026-10-12). It acts only on enemies the build Numbs, never on the player.
  const numbedChanged = ownNumbed && find(PATTERNS.numbedBase).length > 0;
  // Audit of held debuffs (2026-10-13): the dummy starts clean, so the windows build Numbed at one stack per main-skill use (a
  // Numbing hit inflicts 1 stack; provisional: the "+N additional stacks" and the per-damage thresholds are not counted).
  const numbedPerStackRaw = numbedBase * (1 + numbedEffect / 100) * numbedAdditional, numbedPerStack = round(numbedPerStackRaw);
  if (otherNumbed && Number(state.mainUsesPerSecond) > 0) timedEffects.push({ id: "numbed", label: "Numbed", source: "Numbed (keyword 762)", target: "enemy", toggle: false, enabled: true, active: true, parts: [{ type: "Lightning", reach: "all", percent: numbedPerStack, schedule: { kind: "ramp", maxStacks: debuffs.numbedStacks, intervalSeconds: revivedNumbed ? 1 / (revivedNumbed.perTrigger * revivedNumbed.triggersPerSecond) : 1 / Number(state.mainUsesPerSecond), startStacks: 1 } }] });
  // Feline Figure alone: its own stack schedule from t = 0 (Electrify owned when engaging; the dummy starts clean).
  else if (felineFigure?.schedule?.points?.length) timedEffects.push({ id: "numbed", label: "Numbed (Feline Figure)", source: "Lightning Shadow: Feline Figure", target: "enemy", toggle: false, enabled: true, active: true, parts: [{ type: "Lightning", reach: "all", percent: numbedPerStack, schedule: { kind: "steps", points: felineFigure.schedule.points, sustained: debuffs.numbedStacks } }] });
  // Feline Figure's Numbed is the Numbed buff (game affix 520462624 row 2: node 343 adds buff 170, Electrify stacks − 1 layers; W8 step 3
  // Group B), so with no other Numbed source the dummy holds the Numbed state and its groups (4000121, 4000570, 4000580) while the stacks
  // last: every Numbed, Elemental Ailment and Ailment reader sees it (W4 item 9). Before, only its Lightning Damage taken was read.
  if (felineFigure && Number(felineFigure.totalStacks) > 0 && !otherNumbed) {
    if (state.enemyBuffs instanceof UnitBuffSet && !state.enemyBuffs.list.some(felineNumbedHold)) state.enemyBuffs.add({ name: "Numbed", source: FELINE_NUMBED_SOURCE, reason: `${felineFigure.totalStacks} Numbed stack(s) from Electrify (game affix 520462624: buff 170)`, inflictedBy: "you", stage: "combat" });
    if (Array.isArray(state.enemyAilments) && !state.enemyAilments.includes("Numbed")) { state.enemyAilments.push("Numbed"); state.felineNumbedOnly = true; }
  }
  if (numbed && debuffs.numbedStacks > 0) derive(`+${round(numbedPerStackRaw * debuffs.numbedStacks)}% additional Lightning Damage taken`, `Numbed (keyword 762: +${numbedBase}% additional Lightning Damage taken per stack${numbedChanged ? ", changed base effect" : ""}, max 10${numbedAdditional !== 1 ? `; ×${numbedAdditional} additional Numbed Effect` : ""})`, otherNumbed ? `${debuffs.numbedStacks} Numbed stacks on the dummy (best case, as the support resolver reads it: provisional)` : `${debuffs.numbedStacks} average Numbed stacks from Feline Figure (Q-H10: provisional)`, true);
  for (const line of find(PATTERNS.numbedEffect)) entry(line, numbed, numbed ? "scales Numbed's Lightning Damage taken" : "the build inflicts no Numbed");
  // The revived Numbed family's source line (src/enemy-ailments.js): In calc when it is what keeps the dummy Numbed; with another
  // source already holding the 10-stack cap it adds nothing (provisional best-case stack count, as for every Numbed source).
  for (const line of find(PATTERNS.numbedOnLightning)) {
    const own = (state.enemyAilmentSources || {}).Numbed === line.source;
    entry(line, numbed && own, !numbed ? "no active skill deals Lightning Damage, so this inflicts no Numbed" : own ? (revivedNumbed ? `${round(revivedNumbed.perTrigger)} stack(s) per trigger × ${round(revivedNumbed.triggersPerSecond)} triggers/s × ${round(revivedNumbed.durationSeconds)} s = ${debuffs.numbedStacks} Numbed stacks held (game affix 16227245, buff 170: each stack on its own timer)` : `keeps the dummy Numbed (${BUFF_VALUES.numbedMaxStacks} stacks held until the Lightning hit rate is measured)`) : "another Numbed source already holds the dummy at its 10-stack cap (best case: provisional)", { status: numbed && own ? "In calc" : numbed ? "No DPS effect" : "Inactive" });
  }
  // Reactive Rainbow's Elemental Resistance Reversal (game affix 10218501, fields 2006325–27; game text 12050 "Changes the enemy's original
  // Elemental Resistance to a corresponding negative value"; client 0x141dd6a40 and its DoT twin 0x141dd6ee0: per damage instance, on
  // the roll the resistance is multiplied by −1 before penetration subtracts). Expected damage factor 1 − R + P + p × 2R, so it reads
  // exactly as +(p × 2R) Elemental Resistance Penetration, with R the dummy's 30%. Chunk 2, 2026-11-01.
  for (const line of find(PATTERNS.reactiveRainbowReversal)) {
    const [, step, gain] = line.clean.match(PATTERNS.reactiveRainbowReversal);
    const excess = Math.max(0, (Number(state.stats?.elementalAilmentAvoidance) || 0) - 100);
    const chance = Math.min(100, excess * num(gain) / num(step)), penetration = round(chance / 100 * 2 * level85DummyDefenses.fireResistancePercent);
    entry(line, chance > 0, chance > 0 ? `${round(excess)}% excess chance to avoid Elemental Ailments: ${round(chance)}% chance per Elemental damage instance to read the dummy's ${level85DummyDefenses.fireResistancePercent}% Resistance as −${level85DummyDefenses.fireResistancePercent}%, on average +${penetration}% Elemental Resistance Penetration` : "the chance to avoid Elemental Ailments is not above 100%", { provisional: true, bodies: [`+${penetration}% Elemental Resistance Penetration`] });
    if (chance > 0) derive(`+${penetration}% Elemental Resistance Penetration`, line.source, `Reactive Rainbow's Elemental Resistance Reversal (${round(chance)}% chance)`, true);
  }
  for (const line of find(PATTERNS.numbedBase)) entry(line, numbed && ownNumbed, numbed && ownNumbed ? "replaces Numbed's +5% per stack, max 10 stacks (user-confirmed 2026-10-12)" : numbed ? "the Numbed on the dummy is the follower's or your Minions': the changed base effect comes with your own Numbed infliction (game record 289590144, trigger 1000150; inferred)" : "the build inflicts no Numbed");
  for (const line of [...find(PATTERNS.numbedExtra), ...find(PATTERNS.numbedThreshold)]) entry(line, false, otherNumbed ? "Numbed is already at its 10-stack cap in the best-case reading (provisional)" : "the build inflicts no Numbed", { status: otherNumbed ? "No DPS effect" : "Inactive", provisional: true });

  // ---- Lucky ----
  // Census #11 (2026-10-27): Everburn Thunderfire (Ignited dummy), Hanging Bird (held Deflection), Megagon Dice (random windows) and
  // an Elixir Effect's "Damage triggers Lucky" at its uptime (src/lucky-damage.js).
  const ignitedDummy = buffs ? buffs.holds("Ignite") : (state.enemyAilments || []).includes("Ignite");
  const deflectionGain = lines.filter((line) => !line.lineEffect && line.origin !== "derived").flatMap((line) => {
    const rule = DEFLECTION_SOURCES.find((item) => item.pattern.test(line.clean));
    if (!rule) return [];
    const active = rule.kind === "movement" ? state.moving !== false : rule.kind === "reaping" ? Boolean(state.hasReaping) : rule.kind === "hitRecently" ? state.hitRecently !== false : rule.kind === "notHitRecently" ? state.hitRecently === false : false;
    return [{ kind: rule.kind, active, source: line.source }];
  });
  const deflectionMax = 4 + lines.reduce((total, line) => total + (Number(line.clean.match(/^\+(\d+) to Max Deflection$/i)?.[1]) || 0) * (line.multiplier ?? 1), 0);
  const deflectionActive = deflectionGain.filter((item) => item.active);
  const deflection = { held: deflectionActive.length > 0, max: deflectionMax, reason: deflectionActive.length ? `gained by ${deflectionActive.map((item) => `${item.source} (${item.kind})`).join(", ")}, never consumed (the dummy never attacks)` : deflectionGain.length ? "its Deflection gain sources do not hold (Movement group, Reaping, Hit or blocked recently)" : "no Deflection gain source in the build" };
  const elixirLucky = (elixirs?.setups || []).filter((setup) => setup.uptime > 0 && (setup.states || []).some((item) => /^Damage (?:triggers|gains|becomes) Lucky\.?$/i.test(item.text))).map((setup) => ({ share: setup.uptime, source: setup.name, text: "Damage triggers Lucky" }));
  const { luckyLines, veryLucky, luckyCritLines, luckyNumbed, damageRolls, plainLucky, critRolls, scoped: scopedLucky, ignitedLightning, deflectionLines, randomLines, partial: luckyPartial, unlucky: unluckyWindows } = readLuckyDamage(lines, { numbed, ignited: ignitedDummy, deflection, elixirLucky });
  const lucky = { damageRolls, plainLucky, critRolls, scoped: scopedLucky.map((item) => ({ kind: item.kind, rolls: item.rolls, source: item.line.source, text: item.line.clean })), partial: luckyPartial, unlucky: unluckyWindows };
  for (const line of ignitedLightning) entry(line, ignitedDummy, ignitedDummy ? "the dummy is Ignited: Lightning damage rolls are Lucky (the best of 2)" : "the build does not Ignite the dummy", { provisional: true });
  for (const item of deflectionLines) entry(item.line, item.active, item.reason, { provisional: true });
  for (const item of randomLines) entry(item.line, true, `each effect 1/${item.effects.length} of the time: damage rolls Lucky ${round(item.share * 100)}% / Unlucky ${round(item.share * 100)}% of the time (Unlucky: the worse of 2, cancelled by a Lucky held then); the Lucky / Unlucky Critical Strike windows average to the plain crit chance`, { provisional: true });
  // A scoped line ("Lucky Lightning Damage", "Hit Damage is Lucky") reaches only the rolls it names (src/lucky-damage.js luckyRollsFor);
  // the skill DoT's random roll and the skill hits read it (census #11). Escalating Affliction reads the unscoped count only.
  for (const item of scopedLucky) if (!ignitedLightning.includes(item.line)) entry(item.line, true, `${item.kind} damage rolls only: the best of ${item.rolls} rolls (manual "Lucky & Unlucky"; read by skill hits and a skill's own random damage roll)`, { provisional: true });
  for (const line of [...luckyLines, ...veryLucky]) entry(line, true, "damage rolls: the best of " + lucky.damageRolls + " rolls (manual \"Lucky & Unlucky\")");
  for (const line of luckyNumbed) entry(line, numbed, numbed ? "the dummy is Numbed" : "the build inflicts no Numbed");
  for (const line of luckyCritLines) entry(line, true, "Critical Strike checks: the better of 2 rolls (manual \"Lucky & Unlucky\")");
  // Conditional Lucky Critical Strike grants (2026-10-27; research/lucky-crit-mechanics-2026-10-27.md §2, verdict A: label 3000101 is
  // written behind a gate and read at each crit determination). Settled with the build's own state, best case: Fervor at the held
  // Rating; Blinded only while the build keeps the dummy Blinded (its time share if part-time); Marked while the build has a Mark
  // source and the "Dummy always Marked" switch is on; Full Life by the Life rule; N Blessing types from the Blessing model. A holding
  // grant becomes a marker line (`lineEffect.luckyCrit`, with `timeShare` when part-time) the crit models read: the spell crit
  // (src/scorching-beam-critical.js) and, through `lucky.critRolls` / `critPartialShare`, the attack crit (src/planner.js). The
  // town panel shows only the unconditional flag (no target). Two Lucky sources give 2 rolls (a flag: game code FUN_141e11050, a
  // second roll on a miss; Unlucky a second roll on a hit; both together cancel).
  const luckyCritGrants = find(LUCKY_DAMAGE_PATTERNS.conditionalLuckyCrit).map((line) => {
    const match = line.clean.match(LUCKY_DAMAGE_PATTERNS.conditionalLuckyCrit);
    const condition = match[1];
    if (/Fervor/i.test(condition)) {
      const need = num(match[2]);
      return { line, share: hasFervor && fervorRating >= need ? 1 : 0, reason: !hasFervor ? "no Fervor source" : `${fervorRating} Fervor Rating ${fervorRating >= need ? "≥" : "<"} ${need} (Fervor model)` };
    }
    if (/Blinded/i.test(condition)) {
      const schedule = ccSchedules.get("Blinding");
      const share = !schedule ? 0 : schedule.kind === "full" ? 1 : Math.max(0, Math.min(1, sustainedLevel(schedule)));
      return { line, share, reason: !schedule ? "the build does not Blind the dummy" : share >= 1 ? "the build keeps the dummy Blinded (crowd control model)" : `the dummy is Blinded ${round(share * 100)}% of the time (crowd control model)`, provisional: true };
    }
    if (/Marked/i.test(condition)) {
      const markSource = lines.some((item) => /^\+?[\d.]+% chance to Mark the (?:enemy|target) on (?:Critical Strike|hit)$/i.test(item.clean)) || Boolean(state.markSource);
      const on = conditionOn("targetMarked");
      return { line, share: markSource && on ? 1 : 0, reason: !markSource ? "no Mark source in the build" : on ? "the build Marks the dummy and the \"Dummy always Marked\" best case is on (src/mark-effect.js)" : "the \"Dummy always Marked\" assumption is off", provisional: true };
    }
    if (/Full Life/i.test(condition)) {
      // The Full Life rule of src/line-conditions.js atFullLife (≥ 95% unsealed, not at Low Life; user-confirmed 2026-10-12), inlined
      // to keep the module graph acyclic.
      const full = state.life !== "low" && (state.lifeRemainingPercent ?? 100) >= 95;
      return { line, share: full ? 1 : 0, reason: full ? "at Full Life: the dummy never attacks (best case)" : "not at Full Life (sealed Life or the Low Life group)" };
    }
    const need = num(match[3]), types = Object.values(ownBlessingStacks(state) || {}).filter((stacks) => Number(stacks) > 0).length;
    return { line, share: types >= need ? 1 : 0, reason: `${types} Blessing type${types === 1 ? "" : "s"} held (Blessing model) ${types >= need ? "≥" : "<"} ${need}`, provisional: true };
  });
  for (const grant of luckyCritGrants) {
    entry(grant.line, grant.share > 0, `${grant.reason}${grant.share > 0 ? `: Critical Strike checks roll twice, the better kept${grant.share < 1 ? `, ${round(grant.share * 100)}% of the time` : ""} (per hit, against that hit's own chance)` : ""}`, { provisional: Boolean(grant.provisional) });
    if (grant.share > 0) derived.push({ text: `Lucky Critical Strike (${grant.line.clean})`, source: grant.line.source, origin: "buff", multiplier: 1, derivedFrom: grant.line.text, lineEffect: { conditional: true, key: "combatState", conditionText: grant.reason, provisional: Boolean(grant.provisional), luckyCrit: true, ...(grant.share < 1 ? { timeShare: grant.share } : {}) } });
  }
  if (luckyCritGrants.some((grant) => grant.share >= 1)) lucky.critRolls = Math.max(lucky.critRolls, 2);
  const partialLuckyCrit = luckyCritGrants.filter((grant) => grant.share > 0 && grant.share < 1);
  if (partialLuckyCrit.length && lucky.critRolls < 2) lucky.critPartialShare = 1 - partialLuckyCrit.reduce((product, grant) => product * (1 - grant.share), 1);

  // ---- Spell crit per Spell Skill Level (Nether King Ultimate; census #15, 2026-10-27) ----
  // Game affix 926491008: two node-114 conversions from the flat (mod 1) Spell-tagged skill level (field 20064002) to Spell Critical
  // Strike Rating, flat +P2 and increased +P3% per +P1 level, capped at P4 times. The flat "+N Spell Skill Level" lines are counted
  // (whole steps); "+N Skill Level" / "+N Active Skill Level" lines carry no Spell tag and are left out (provisional, open question
  // nether-king-spell-level-crit).
  for (const line of find(PATTERNS.spellLevelCrit)) {
    const match = line.clean.match(PATTERNS.spellLevelCrit);
    const levels = lines.filter((item) => !item.lineEffect).reduce((total, item) => total + (Number(item.clean.match(/^\+(\d+) (?:to )?Spell Skill Levels?$/i)?.[1]) || 0) * (item.multiplier ?? 1), 0);
    const steps = Math.min(num(match[4]), Math.floor(levels / num(match[3]) + 1e-9));
    const scale = line.multiplier ?? 1;
    const flat = round(num(match[1]) * steps * scale), percent = round(num(match[2]) * steps * scale);
    const working = `${levels} Spell Skill Level from the build's "+N Spell Skill Level" lines ÷ ${match[3]} = ${steps} step(s) (up to ${match[4]})`;
    if (steps > 0) { derive(`+${flat} Spell Critical Strike Rating`, line.source, working, true); derive(`+${percent}% Spell Critical Strike Rating`, line.source, working, true); }
    entry(line, steps > 0, steps > 0 ? `${working}: +${flat} Spell Critical Strike Rating and +${percent}% Spell Critical Strike Rating (Spell hits)` : `no "+N Spell Skill Level" line in the build (${working})`, { provisional: true });
  }

  // ---- Escalating Affliction (Ethereal Prism core; core audit B4, 2026-10-18) ----
  // Clause 1 (affix 129825744; the raw rows, chunk 4, 2026-11-01): every 1 s, l0 = a roll of 10 to 300, less 100; one roll, the best of 2
  // with label 3000090, the best of 3 with label 3000091 too; attr 5724 mod 4 = l0. So it is +(roll − 100)% additional Affliction Effect,
  // proven: it multiplies with the Affliction Effect lines, the 1.55% (2.03% Lucky, 2.275% Very Lucky) is that roll's mean, typed Lucky lines
  // do not count, and Unlucky does not either. The planner's Affliction is 1% per point (config_attributes 5724), so the same
  // derived "+X% additional Affliction effect" line reaches every DoT, Ignite and Reap path (src/build-mechanics.js).
  let escalatingAffliction = null;
  for (const line of find(PATTERNS.escalatingAffliction)) {
    const match = line.clean.match(PATTERNS.escalatingAffliction);
    const perPoint = luckyRollAverage(num(match[1]), num(match[2]), lucky.damageRolls);
    const value = round((perPoint / AFFLICTION_PERCENT_PER_POINT - 1) * 100);
    const body = `+${value}% additional Affliction effect`;
    entry(line, true, `each Affliction point: ${match[1]}%–${match[2]}% additional Damage Over Time taken, expected ${round(perPoint)}% per point (${lucky.damageRolls > 1 ? `Lucky: the best of ${lucky.damageRolls} rolls` : "the uniform roll's mean"}; audit Q15) instead of ${AFFLICTION_PERCENT_PER_POINT}%: ×${round(perPoint / AFFLICTION_PERCENT_PER_POINT)} on Affliction's effect (provisional)`, { provisional: true, bodies: [body] });
    derive(body, line.source, `Escalating Affliction: ${round(perPoint)}% per Affliction point`, true);
    escalatingAffliction = { perPointPercent: round(perPoint), luckyRolls: lucky.damageRolls, value, maxDamage: [] };
  }
  // Clause 2 (affix 144077888: node 114 from attr 5806, "Max All Damage", to 5719 with the DoT tag, mod 4 to mod 4): 90% of each
  // generic "additional Max Damage" bonus also applies to Damage Over Time, as its own additional multiplier. Typed lines write their own
  // attr ("Max Physical Damage" is 5801), so they are out (chunk 4, 2026-11-01). The mod 3 row has no source: no game line writes
  // increased Max Damage. The plain (unconditional) lines are read; skill-scoped and conditional ones (a resolved body, a timed buff) are not.
  for (const line of find(PATTERNS.escalatingMaxDamage)) {
    const share = num(line.clean.match(PATTERNS.escalatingMaxDamage)[1]) / 100;
    const bodies = [];
    for (const other of lines) {
      if (other === line) continue;
      for (const part of splitHitLineText(other.clean)) {
        const parsed = classifyHitLine(part);
        if (parsed?.kind !== "maxDamage" || parsed.scope?.skillTags || parsed.scope?.hitOnly || !(parsed.value > 0)) continue;
        if (parsed.scope?.damageTypes && [...parsed.scope.damageTypes].length) continue;
        const value = round(parsed.value * share * (other.multiplier ?? 1) * (line.multiplier ?? 1));
        const body = `+${value}% additional Damage Over Time`;
        bodies.push(body);
        derive(body, `${line.source} (${Math.round(share * 100)}% of "${other.clean}" from ${other.source})`, "Escalating Affliction: Max Damage bonus applied to Damage Over Time", true);
      }
    }
    entry(line, bodies.length > 0, bodies.length ? `${bodies.length} additional Max Damage bonus${bodies.length === 1 ? "" : "es"} at ${Math.round(share * 100)}% on Damage Over Time: ${bodies.join("; ")} (plain lines only; provisional)` : "the build has no plain additional Max Damage bonus", { provisional: true, bodies });
    if (escalatingAffliction) escalatingAffliction.maxDamage = bodies;
    else escalatingAffliction = { maxDamage: bodies };
  }

  // Buff / debuff source entries without a body of their own carry the derived lines of their state, so their badge
  // reads In calc only where an engine reads those lines (src/line-coverage.js).
  const effectsOf = (entryItem) => {
    const text = entryItem.text;
    const pick = (re) => derived.filter((line) => re.test(line.source)).map((line) => line.text);
    if (PATTERNS.hasFervor.test(text) || PATTERNS.fervorEffect.test(text)) return pick(/^Fervor/);
    if (PATTERNS.attackAggressionGain.test(text) || /Attack Aggression Effect/i.test(text)) return pick(/^Attack Aggression/);
    if (PATTERNS.spellAggressionGain.test(text) || PATTERNS.spellAggressionPerCast.test(text) || /Spell Aggression Effect/i.test(text)) return pick(/^Spell Aggression/);
    if ([PATTERNS.hastenAlways, PATTERNS.hastenAgility, PATTERNS.hastenTrauma, PATTERNS.hastenMinionCrit, PATTERNS.hastenEffect].some((re) => re.test(text))) return pick(/^Hasten/);
    if (PATTERNS.frail.test(text)) return pick(/^Frail/);
    if (PATTERNS.lightningInfiltrationCrit.test(text) || PATTERNS.coldInfiltrationFrozen.test(text) || PATTERNS.coldInfiltrationFrostbitten.test(text) || PATTERNS.penetrating.test(text)) return pick(/Infiltration/);
    if ([PATTERNS.paralysisAttacks, PATTERNS.paralysisCursed, PATTERNS.paralysisEffect].some((re) => re.test(text))) return pick(/^Paralysis/);
    if (PATTERNS.maxFrostbite.test(text) || PATTERNS.frostbiteEffect.test(text) || PATTERNS.frostbiteEffectAdditional.test(text) || PATTERNS.frostbiteCapRaise.test(text) || PATTERNS.deemedFrostbite.test(text)) return pick(/^Frostbite/);
    if (PATTERNS.numbedEffect.test(text) || PATTERNS.numbedBase.test(text)) return pick(/^Numbed/);
    return [];
  };
  for (const item of entries) if (!item.bodies.length && item.active) { const effects = effectsOf(item); if (effects.length) item.bodies = effects.map((text) => ({ body: text, derivedText: text, readers: ["state"] })); }
  // Prism Butterfly Distillate (chunk 9): "Inflicts all Infiltration Effects when a Spell Skill deals damage. Interval on each enemy: 1 s" (record 1018285): the three
  // keywords' +13% on a build with a Spell hit, time-averaged by the Elixir's uptime (no value line, so no Elixir Skill Effect); a type another line holds stays one Infiltration.
  for (const setup of elixirs?.setups || []) {
    if (!(setup.uptime > 0) || !setup.states.some((item) => /^Inflicts all Infiltration Effects/i.test(item.text)) || !state.spellHitTypes?.size) continue;
    for (const type of ["Fire", "Cold", "Lightning"]) if (!infiltrationHeld(type)) derive(`+${round(BUFF_VALUES.infiltration * setup.uptime)}% additional ${type} Damage taken`, `${setup.name}: ${type} Infiltration`, `${setup.name} up ${setup.uptime} of the time, a Spell hit inflicts ${type} Infiltration (time-averaged; provisional)`, true, setup.uptime);
  }
  // The Infiltrations' inflicters, settled from the pass's entries (a follower affix's is the follower's).
  const ownInfiltration = new Set(ownInfiltrationTypes(entries));
  for (const hold of passSet.list) if (/ Infiltration$/.test(hold.name)) hold.inflictedBy = ownInfiltration.has(hold.label) ? "you" : "follower";
  return withDummyHolds({ supportCrowdControl: supportCrowdControlStatus, crowdControl: [...ccSchedules.keys()], ownCrowdControl: [...ccSchedules.keys()].filter((type) => ownCcTypes.has(type)), crowdControlShares: Object.fromEntries([...ccSchedules].map(([type, schedule]) => [type, round(Math.min(1, sustainedLevel(schedule)))])), crowdControlReaders, ailmentReaders, centralize, regain, warcry: stormCommand, elixir: elixirs, numbedRevived: revivedNumbed, entries,derived, buffs: { fervorRating, fervorEffectPercent: fervorEffect, fervorAttackAilment, fervorSkillArea, triggeredSkillAdditional, hasAttackAggression, hasSpellAggression, attackAggressionEffectPercent: hasAttackAggression ? aggressionEffect("attack") : 0, spellAggressionEffectPercent: hasSpellAggression ? aggressionEffect("spell") + perCastEffect : 0, hasHasten, hasProfane, fortitudeStacks }, debuffs: { ...debuffs, infiltration: [...debuffs.infiltration], ownInfiltration: ownInfiltrationTypes(entries) }, lucky, enemyDebuffCores: { selfDelusion, juggernaut, openWounds, escalatingAffliction }, iceCage, timedEffects, chanceParalysis, deemedRerun }, passSet.list, Object.fromEntries(ccForeignBy), { crowdControl: Object.fromEntries([...ccSchedules.keys()].map((type) => [type, { schedule: ccSchedules.get(type), scripted: ccScripted.get(type) ?? null, recipe: ccRecipeHolds.get(type) || [] }])), counters: busCounters, intimidated: busIntimidated, paralysis: busParalysis,
    // First Flake of Strange Snow's deemed rating (W10 step 2): the types it counted, its per-type value and cap, and the rating it gave.
    deemedFrostbite: deemedFrostbite ? { ...deemedFrostbite, types: [...deemedFrostbite.types], rating: debuffs.frostbiteRating } : null });
}

// Lucky roll helpers live in src/lucky-damage.js; re-exported for the existing importers.
export { luckyRollAverage, luckyCritChance };

// Deterioration (manual rule 1002030520 and reference data keyword 764): "a debuff that can only be inflicted through Hit Erosion
// Damage … lasts for 1s. When the duration ends, it deals True Damage equal to 60% of the Hit Erosion Damage dealt. Stacks
// up to 99 times. Each stack is calculated independently." Two game buff variants (char_buff 180_4 / 180_6) instead say
// "for every 0.3 [s] it lasts"; the manual and keyword wording is used (open question Q8). Applied by the hit engine
// (src/skill-hit-model.js) to each Erosion hit: chance (capped at 100%) × (1 + expected extra stacks) × 60% of the
// Erosion damage dealt × (1 + increased) × Π(1 + additional). True Damage: no further resistance. The 1 s delay is not
// in the windows (provisional). Duration lines only move the delay: No DPS effect.
export const DETERIORATION_SHARE = 0.6;
export function deteriorationFrom(modifierTexts = [], state = {}, entries = []) {
  const lines = modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).map((line) => ({ ...line, clean: normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim() }));
  const pick = (pattern) => lines.filter((line) => pattern.test(line.clean)).map((line) => ({ line, match: line.clean.match(pattern), scale: line.multiplier ?? 1 }));
  const chance = pick(PATTERNS.deteriorationChance), extra = pick(PATTERNS.deteriorationExtra), increased = pick(PATTERNS.deteriorationIncreased), additional = pick(PATTERNS.deteriorationAdditional), duration = pick(PATTERNS.deteriorationDuration);
  const chancePercent = sum(chance.map(({ match, scale }) => num(match[1]) * scale));
  const extraStacks = sum(extra.map(({ match, scale }) => num(match[1]) * scale / 100 * num(match[2])));
  // The revived Erosion to Deterioration family: P1% of the increased Erosion Damage bonus joins the increased Deterioration Damage,
  // at most P2 (game affix 16346693). The bonus is read as the untyped-skill "+X% Erosion Damage" lines (also "<Type> and Erosion");
  // generic "+X% damage" and skill-scoped lines are left out: node 114 reads attr 54021 mod 3 with the write's own tags, none here
  // (node 114 reads with the reader's own query, research/node-114-trace-2026-11-03.md; open question ailment-record-skill-tags for a DoT), so attr 5402's untagged increased writes, not attr 5719 (chunk 2, 2026-11-01). Lines that
  // hold under a condition are not summed here.
  const fromErosionLines = pick(PATTERNS.deteriorationFromErosion);
  const erosionBonus = fromErosionLines.length ? sum(lines.map((line) => line.clean.match(/^\+(\d+(?:\.\d+)?)% (?:(?:Physical|Fire|Cold|Lightning|Elemental) and )?Erosion Damage$/i)?.[1]).map((value, index) => value ? num(value) * (lines[index].multiplier ?? 1) : 0)) : 0;
  const fromErosion = fromErosionLines.reduce((total, { match, scale }) => total + Math.min(num(match[2]) * scale, num(match[1]) * scale / 100 * erosionBonus), 0);
  const increasedPercent = sum(increased.map(({ match, scale }) => num(match[1]) * scale)) + fromErosion;
  const additionalPercents = additional.map(({ match, scale }) => num(match[1]) * scale);
  // Legendary audit batch 6 (provisional; open question legendary-deterioration-items):
  // - Hand of Malice "+35% additional Deterioration Damage if you have dealt a Critical Strike recently": while the build crits.
  const critRecently = pick(PATTERNS.deteriorationCritRecently);
  if (state.canCrit) for (const { match, scale } of critRecently) additionalPercents.push(num(match[1]) * scale);
  // - Blight "+10% additional Deterioration Damage taken per stack of Deterioration the enemy has, up to 8": summed per held stack;
  //   the hit engine counts the stacks (applications per second × the 1 s duration).
  const takenPerStack = pick(PATTERNS.deteriorationTakenPerStack).map(({ match, scale }) => ({ per: num(match[1]) * scale, cap: num(match[2]) }));
  // - Ruinous Star: each stack deals its True Damage every 0.33 s while it lasts (1 s: 3 ticks), +30% additional per tick after the
  //   first, at most 5 increments; each tick read as the expiry damage (60% of the Erosion hit) with its increment.
  const ticks = pick(PATTERNS.deteriorationTicks)[0];
  const tickFactor = ticks ? (() => {
    const every = num(ticks.match[1]), increment = num(ticks.match[2]), cap = num(ticks.match[3]);
    const count = every > 0 ? Math.max(1, Math.floor(1 / every + 1e-9)) : 1;
    let total = 0;
    for (let k = 0; k < count; k += 1) total += 1 + increment / 100 * Math.min(cap, k);
    return { count, factor: total, every, increment, cap };
  })() : null;
  // - Ruinous Star: "Every 0.5 s, your next non-Channeled Main Skill is enhanced by Obliterate" and "Skills not enhanced by Obliterate
  //   cannot inflict Deterioration": only that share of the Main Skill's uses inflicts it (Obliterate's conversion of the other parts
  //   to Erosion, keyword 10162, is not modeled).
  const obliterate = pick(PATTERNS.obliterateEvery)[0];
  const obliterateOnly = Boolean(obliterate && (/cannot inflict Deterioration$/i.test(obliterate.line.clean) || pick(PATTERNS.obliterateOnly).length));
  const active = chancePercent > 0 && Boolean(state.hitErosion);
  const reason = !state.hitErosion ? "no modeled hit deals Erosion Damage (Deterioration needs Hit Erosion Damage)" : chancePercent > 0 ? `${Math.min(100, chancePercent)}% chance per Erosion hit, 60% of the Erosion damage dealt as True Damage when each 1 s stack ends (manual; the delay is not in the windows: provisional)` : "no Deterioration chance";
  const add = (items, status) => { for (const { line } of items) entries.push({ source: line.source, origin: line.origin, text: line.clean, active: status === "In calc", conditionText: reason, status, provisional: true, bodies: [], condition: "combatState", group: null }); };
  add(chance, active ? "In calc" : "Inactive");
  add([...extra, ...increased, ...additional], active ? "In calc" : "Inactive");
  for (const { line } of fromErosionLines) entries.push({ source: line.source, origin: line.origin, text: line.clean, active: active && fromErosion > 0, conditionText: !active ? reason : fromErosion > 0 ? `${round(erosionBonus)}% Erosion Damage bonus → +${round(fromErosion)}% Deterioration Damage (provisional)` : "no \"+X% Erosion Damage\" bonus to carry over", status: active && fromErosion > 0 ? "In calc" : "Inactive", provisional: true, bodies: [], condition: "combatState", group: null });
  for (const { line } of duration) entries.push({ source: line.source, origin: line.origin, text: line.clean, active: false, conditionText: "duration only delays the damage (dealt when each stack ends)", status: "No DPS effect", provisional: true, bodies: [], condition: "combatState", group: null });
  add(critRecently, active && state.canCrit ? "In calc" : "Inactive");
  add(pick(PATTERNS.deteriorationTakenPerStack), active ? "In calc" : "Inactive");
  add(ticks ? [ticks] : [], active ? "In calc" : "Inactive");
  add(obliterate ? [obliterate] : [], active ? "Partly modeled" : "Inactive");
  add(pick(PATTERNS.obliterateOnly), active ? "In calc" : "Inactive");
  return active ? { chancePercent: Math.min(100, chancePercent), extraStacks, increasedPercent, additionalPercents, takenPerStack, tickFactor, obliterateEverySeconds: obliterateOnly ? num(obliterate.match[1]) : null, share: DETERIORATION_SHARE, source: "Deterioration (manual rule 1002030520)" } : null;
}

/**
 * Icemirror's "+N to Max Terra Charge Stacks when Mirrored Shade reaches max stacks" as a Terra Charge line for
 * src/selena-dance.js (the Terra Charge model resolves before the line effects): with the Mirrored Shade gain line, a Main
 * Terra Skill to stand on and the mirroredShade condition on (best case: the stacks reach their cap; provisional).
 */
export function mirroredShadeTerraChargeLines(modifierTexts = [], { mainIsTerra = false, requestedConditions = {} } = {}) {
  if (!mainIsTerra || requestedConditions.mirroredShade === false) return [];
  const clean = (line) => normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim();
  const gain = modifierTexts.filter((line) => line.origin !== "derived" && PATTERNS.mirroredGain.test(clean(line)));
  return gain.flatMap((line) => modifierTexts.filter((other) => other.source === line.source && PATTERNS.mirroredCharge.test(clean(other)))
    .map((other) => ({ source: `${other.source}: Mirrored Shade at max stacks`, text: `Max Terra Charge Stacks +${Number(clean(other).match(PATTERNS.mirroredCharge)[1]) * (other.multiplier ?? 1)}` })));
}
