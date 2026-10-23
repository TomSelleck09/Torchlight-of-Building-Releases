import { skillLevelDamageMultiplier } from "./engine.js";
import { minionBaseDamage, MINION_BASE_DAMAGE_FROZEN_LEVEL } from "./minion-base-damage.js";
import { level85DummyDefenses, armourMitigationPercent } from "./target-hit-mitigation.js";
import { MINION_PROFILES } from "./minion-profiles.js";
import { supportEffectsFor } from "./support-effects.js";
import { classifyHitLine, scopeApplies } from "./skill-hit-lines.js";
import { multistrikeSequence } from "./skill-hit-model.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";

import { BOND } from "./minion-cores.js";
import { KEYWORDS, RECENTLY_SECONDS as RECENT_SECONDS, TROOP_FAMILIES, vigilantBreezeMax, vigilantBreezeAt } from "./moto-iris-traits.js";
const TROOP_FAMILY = new Set(TROOP_FAMILIES);


// Minion damage path (2026-10-11; research/base-damage-skills-2026-10-11.md). Minions are independent of the player:
// "Only effects that explicitly increase Minion stats will be applied to Minions" (manual rule 1001011821), so this
// engine reads Minion-named lines only and never the player's Spell / Fire / Area / main-stat layers.
//
// Per hit of a Minion skill at summon-skill level L:
//   hit = (Base Damage(L) × percent(L) + added flat to Minions × effectiveness) × (1 + Σ Minion increased)
//         × Π(1 + Minion additional) × level bonus past Lv.20 (rule 1001000822) × special-skill self buff (while up)
//         × crit factor (rating 500 → 5%, damage 150%: Minion Base Stats on the summon tooltip, user-confirmed 2026-10-11)
//         × dummy armour (50% Physical / 30% other hits) × (1 − (resistance − Minion penetration))
// Base Damage(L) is the shared Minion table (10 at Lv.1 … 300 at Lv.20, frozen; src/minion-base-damage.js), confirmed in
// game for Goblin Priest Lv.1 (10) and God of Swords / Huge Ember Automaton Lv.20 (300).
//
// Use pattern: a deterministic cycle. From the summon cast on, the Minion uses a special skill whenever its cooldown is
// ready and its basic skill otherwise; each use takes its game use time (attack-speed skills ÷ the Minion's attack speed,
// cast-speed skills ÷ its cast speed; the player's speed never applies) and its hit lands at the end of the use. Special
// self buffs run from the use's start. Persistent rows tick once per second for their assumed duration. Every Minion of
// the summon acts identically and simultaneously (one Minion for modules: count unpublished). The town panel reads 0 for
// summon skills (user, 2026-10-11), so no town figure is produced.
//
// Spirit Magi (2026-10-12; manual rules 1001012022–34): the "basic slot" of the cycle is the Base Skill, replaced by the
// Enhanced Skill with the Enhanced-skill chance (Stage 2: +30%; "+X% chance for Spirit Magi to use an Enhanced Skill"
// lines; an expected-value blend of the two casts). The Empower Skill is the cooldown-bound special: it grants the Magus a
// buff (Euphoria) for its duration and, for Blazing Spin / Frost Release, deals its own row. Stage = ⌊Growth ÷ 100⌋ from
// 100 Growth plus "+N initial Growth for Spirit Magi" lines (Stage 1 … 5); Stage 3 enhances the Enhanced Skill (its own
// "When at Stage 3 or higher" lines), Stage 4 adds the Empower Skill's new effect. The Ultimate needs Full Bloom (only The
// Forsaken Iris – Growing Breeze, rule 1001012027) and is not in the cycle.

const number = (value) => Number(String(value).replace("−", "-"));
const NUM = "([+-]?\\d+(?:\\.\\d+)?)";
const TYPE = "(Physical|Fire|Cold|Lightning|Erosion|Elemental)";
const ELEMENTAL = ["Fire", "Cold", "Lightning"];
const round = (value) => Math.round(value * 10000) / 10000;
const sum = (lines) => lines.reduce((total, line) => total + line.value, 0);
const product = (lines) => lines.reduce((factor, line) => factor * (1 + line.value / 100), 1);
// A detached closing full stop (Lady's Tears: "… dealt by Ultimate .", legendary audit batch 2) is dropped.
const clean = (text) => String(text || "").replace(/\s*%/g, "%").replace(/\+\s+/g, "+").replace(/\s+/g, " ").trim().replace(/ \.$/, "");

const PATTERNS = [
  [new RegExp(`^${NUM}% Minion Damage$`, "i"), (m) => ({ kind: "increased", value: number(m[1]) })],
  [new RegExp(`^${NUM}% (?:damage and|Damage and) Minion Damage$`, "i"), (m) => ({ kind: "increased", value: number(m[1]) })],
  [new RegExp(`^${NUM}% additional Minion Damage$`, "i"), (m) => ({ kind: "additional", value: number(m[1]) })],
  // Core audit B7 (2026-10-18): typed Minion copies of player lines (Frozen Lotus "+25% additional Minion Cold Damage", game affix
  // 634876544 attr 5109; Brutality "+30% additional Minion Physical Damage", 174535344 attr 5002; both additional, Minion tag).
  [new RegExp(`^${NUM}% additional Minion ${TYPE} Damage$`, "i"), (m) => ({ kind: "additional", value: number(m[1]), type: m[2] })],
  [new RegExp(`^${NUM}% additional damage(?: and ${NUM}% additional Minion Damage)$`, "i"), (m) => ({ kind: "additional", value: number(m[2]) })],
  [new RegExp(`^${NUM}% additional damage; ${NUM}% additional Minion Damage$`, "i"), (m) => ({ kind: "additional", value: number(m[2]) })],
  [new RegExp(`^${NUM}% ${TYPE} Damage for (?:you and your )?Minions$`, "i"), (m) => ({ kind: "increased", value: number(m[1]), type: m[2] })],
  [new RegExp(`^${NUM}% additional ${TYPE} Damage for (?:you and your )?Minions$`, "i"), (m) => ({ kind: "additional", value: number(m[1]), type: m[2] })],
  [new RegExp(`^${NUM}% additional damage for (?:you and your )?Minions$`, "i"), (m) => ({ kind: "additional", value: number(m[1]) })],
  [new RegExp(`^${NUM}% additional (?:Hit )?Damage for Minions$`, "i"), (m) => ({ kind: "additional", value: number(m[1]) })],
  // Skill-tag scoped Minion lines (core audit B7): "+X% additional Area Damage for Minions" (Focused Strike's Minion copy, derived
  // by src/line-conditions.js), "+X% additional Spell Damage for Minions" (Isomorphic Arms' wand clause, game affix 357249664: attr
  // 5719 with tags Minion + Spell). They reach the Minion skills that carry the tag (TLIDB skill tags in src/minion-profiles.js).
  [new RegExp(`^${NUM}% additional (Spell|Attack|Area|Melee|Projectile|Ranged) Damage for Minions$`, "i"), (m) => ({ kind: "additional", value: number(m[1]), skillTag: m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() })],
  // Support lines on the summon setup (Servant Damage, a summon Magnificent / Noble star or roll, Activation Medium: Minion).
  [new RegExp(`^${NUM}% additional damage for Minions summoned by the supported skill$`, "i"), (m) => ({ kind: "additional", value: number(m[1]) })],
  // Spirit Magus skill lines (minion family "spirit-magus" only; the engine drops them for other Minions).
  [new RegExp(`^${NUM}% additional Spirit Magus Skill Damage$`, "i"), (m) => ({ kind: "additional", value: number(m[1]), spiritMagus: true })],
  // Synthetic Troop Minions only (Machine Lord "+800% additional Synthetic Troop Minion Damage"; legendary audit batch 8).
  [new RegExp(`^${NUM}% additional Synthetic Troop Minion Damage$`, "i"), (m) => ({ kind: "additional", value: number(m[1]), troop: true })],
  [new RegExp(`^${NUM}% Spirit Magus Skill Damage$`, "i"), (m) => ({ kind: "increased", value: number(m[1]), spiritMagus: true })],
  // Gear-pact batch chunk 4: "Spirit Magi" wordings of the same Minion stats (Spirit Magus family only).
  [new RegExp(`^${NUM}% additional Spirit Magi Damage$`, "i"), (m) => ({ kind: "additional", value: number(m[1]), spiritMagus: true })],
  [new RegExp(`^${NUM} Spirit Magi Critical Strike Rating$`, "i"), (m) => ({ kind: "critRating", value: number(m[1]), flat: true, spiritMagus: true })],
  [new RegExp(`^${NUM}% additional Attack and Cast Speed for Minions(?: summoned by the supported skill)?$`, "i"), (m) => ({ kind: "speed", value: number(m[1]), additional: true, attack: true, cast: true })],
  [new RegExp(`^${NUM}% Attack and Cast Speed for Minions(?: summoned by the supported skill)?$`, "i"), (m) => ({ kind: "speed", value: number(m[1]), additional: false, attack: true, cast: true })],
  // Battle Trumpet (core audit B7): "-10% additional Minion Attack and Cast Speed" (game affix 96256: attr 6001 / 6002 additional,
  // Minion tag).
  [new RegExp(`^${NUM}% (?:additional )?Minion Attack and Cast Speed$`, "i"), (m, text) => ({ kind: "speed", value: number(m[1]), additional: /additional/i.test(text), attack: true, cast: true })],
  [new RegExp(`^${NUM}% (?:additional )?Minion Attack Speed$`, "i"), (m, text) => ({ kind: "speed", value: number(m[1]), additional: /additional/i.test(text), attack: true, cast: false })],
  [new RegExp(`^${NUM}% (?:additional )?Minion Cast Speed$`, "i"), (m, text) => ({ kind: "speed", value: number(m[1]), additional: /additional/i.test(text), attack: false, cast: true })],
  [new RegExp(`^${NUM}% Attack Speed for Minions(?: summoned by the supported skill)?$`, "i"), (m) => ({ kind: "speed", value: number(m[1]), additional: false, attack: true, cast: false })],
  [new RegExp(`^${NUM} Critical Strike Rating for Minions$`, "i"), (m) => ({ kind: "critRating", value: number(m[1]), flat: true })],
  [new RegExp(`^${NUM}% (additional )?Critical Strike Rating for Minions$`, "i"), (m) => ({ kind: "critRating", value: number(m[1]), additional: Boolean(m[2]) })],
  [new RegExp(`^${NUM}% (additional )?Critical Strike Damage for Minions$`, "i"), (m) => ({ kind: "critDamage", value: number(m[1]), additional: Boolean(m[2]) })],
  // The kismet wordings of the same Minion crit stats (kismet / pact audit 2026-10-21: Micro / Medium Fate: Critical Strike Rating's
  // "+(24–30)% Minion Critical Strike Rating", Critical Strike Damage's "+(12–15)% Minion Critical Strike Damage", Kismet: Screw's
  // "+(100–120) Minion Critical Strike Rating"; game affix_class 13183117 "$+P1$% Minion Critical Strike Rating"). They read Not
  // modeled before.
  [new RegExp(`^${NUM}% (additional )?Minion Critical Strike Rating$`, "i"), (m) => ({ kind: "critRating", value: number(m[1]), additional: Boolean(m[2]) })],
  [new RegExp(`^${NUM}% (additional )?Minion Critical Strike Damage$`, "i"), (m) => ({ kind: "critDamage", value: number(m[1]), additional: Boolean(m[2]) })],
  [new RegExp(`^${NUM} Minion Critical Strike Rating$`, "i"), (m) => ({ kind: "critRating", value: number(m[1]), flat: true })],
  // "+X% additional Max / Min Damage for Minions" (2026-10-14): the Minion hit's upper / lower roll (Minion-named lines only,
  // rule 1001011821; a plain "additional Max Damage" line stays the player's).
  [new RegExp(`^${NUM}% additional (?:${TYPE} )?(Max|Min) (?:${TYPE} )?Damage for (?:you and your )?Minions$`, "i"), (m) => ({ kind: /^max$/i.test(m[3]) ? "maxDamage" : "minDamage", value: number(m[1]), type: (m[2] || m[4]) ? (m[2] || m[4])[0].toUpperCase() + (m[2] || m[4]).slice(1).toLowerCase() : undefined })],
  // "+X% Armor DMG Mitigation Penetration for Minions" (game affix 467574 → char field 2006247 on the Minions): points off the
  // dummy's armour mitigation of Minion hits (src/target-hit-mitigation.js armourMitigationPercent).
  [new RegExp(`^${NUM}% Armor DMG Mitigation Penetration for Minions$`, "i"), (m) => ({ kind: "armourPenetration", value: number(m[1]) })],
  // Minion Multistrike (core audit B7; game affixes 314249 "+X% Minion Multistrike chance" field 2006240 on Minions, 868709
  // "Minions' Multistrikes deal X% increasing damage" attr 6350 flat on Minions (Quick Advancement's copy), 942960896 "The damage of
  // Minion Multistrikes increments by an additional X%" attr 6350 additional). Read on Minion Attack skills like the player's
  // Multistrike (src/skill-hit-model.js multistrikeSequence).
  [new RegExp(`^${NUM}% Minion Multistrike chance$`, "i"), (m) => ({ kind: "multistrikeChance", value: number(m[1]) })],
  [new RegExp(`^Minions' Multistrikes deal ${NUM}% increasing damage$`, "i"), (m) => ({ kind: "multistrikeIncrement", value: number(m[1]) })],
  [new RegExp(`^The damage of Minion Multistrikes increments by an additional ${NUM}%$`, "i"), (m) => ({ kind: "multistrikeIncrementAdditional", value: number(m[1]) })],
  [new RegExp(`^${NUM}% ${TYPE} Penetration for Minions$`, "i"), (m) => ({ kind: "penetration", value: number(m[1]), types: m[2] === "Elemental" ? ELEMENTAL : [m[2]] })],
  // Gear affix audit 2026-10-22 (research/gear-affixes-audit-2026-10-22.md): gear wordings of the same Minion stats.
  // "+X% Minion <Type> Damage" (Rod / Necklace craft suffixes, game affix_class "$+P1$% Minion Elemental Damage"): increased, typed
  // like "+X% <Type> Damage for Minions". "+X% Minion <Type> Penetration" (TOWER Sequences) and "+X% Elemental and Erosion
  // Resistance Penetration for Minions" (base, craft and corrosion affixes): Minion penetration of those types.
  [new RegExp(`^${NUM}% Minion ${TYPE} Damage$`, "i"), (m) => ({ kind: "increased", value: number(m[1]), type: m[2] })],
  [new RegExp(`^${NUM}% Minion ${TYPE} Penetration$`, "i"), (m) => ({ kind: "penetration", value: number(m[1]), types: m[2] === "Elemental" ? ELEMENTAL : [m[2]] })],
  [new RegExp(`^${NUM}% Elemental and Erosion Resistance Penetration for Minions$`, "i"), (m) => ({ kind: "penetration", value: number(m[1]), types: [...ELEMENTAL, "Erosion"] })],
  // "+X% chance for Minions to deal Double Damage" (Boots / Spirit Ring craft suffixes): the player's Double Damage rule (src/double-damage.js:
  // per hit, × 2 at the summed chance, capped at 100%) on the Minions' hits (provisional: open question gear-minion-double-damage).
  [new RegExp(`^${NUM}% chance for Minions to deal Double Damage$`, "i"), (m) => ({ kind: "doubleDamage", value: number(m[1]) })],
  // Pantheon's Elegy rolls (legendary audit batch 8): "+18% chance for Synthetic Troop Minions to deal Double Damage" (troops only) and
  // "When Synthetic Troop minions deal Double Damage, they deal Triple Damage instead" (their Double Damage is ×3; provisional).
  [new RegExp(`^${NUM}% chance for Synthetic Troop Minions to deal Double Damage$`, "i"), (m) => ({ kind: "doubleDamage", value: number(m[1]), troop: true })],
  [/^When Synthetic Troop minions deal Double Damage, they deal Triple Damage instead$/i, () => ({ kind: "tripleDamage", value: 1, troop: true })],
  // "Minions gain Lucky upon a Critical Strike" (Vorax gloves; gear affix batch A): Lucky crit checks and added rolls (calculateMinion).
  [/^Minions gain Lucky upon a Critical Strike$/i, () => ({ kind: "lucky", value: 1 })],
  // Warden's Breastpin's roll (legendary audit batch 8): "Your Minions can only deal Elemental / Erosion / Physical Damage": a Minion
  // skill row of another type deals 0 (each row has one type here; the player's Extremity-style rule for the Minions, provisional).
  [/^Your Minions can only deal (Elemental|Erosion|Physical|Fire|Cold|Lightning) Damage$/i, (m) => ({ kind: "onlyType", value: 1, types: /^Elemental$/i.test(m[1]) ? ELEMENTAL : [m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()] })],
  // Spirit Magus skill-role lines (Tin Staff / Rod craft prefixes): "+X% additional Spirit Magus Enhanced Skill Damage and Ailment
  // Damage dealt by Enhanced Skills" reaches the Enhanced Skill's hits, the Ultimate one the Ultimate (out of the cycle unless Full
  // Bloom). Minion ailments are not modeled, so the ailment half reaches nothing.
  [new RegExp(`^${NUM}% additional Spirit Magus (Enhanced Skill|Ultimate) Damage and Ailment Damage dealt by (?:Enhanced Skills|Ultimate) ?\\.?$`, "i"), (m) => ({ kind: "additional", value: number(m[1]), spiritMagus: true, skillRole: /ultimate/i.test(m[2]) ? "ultimate" : "enhanced" })],
  [new RegExp(`^Minion Damage penetrates ${NUM}% Elemental Resistance$`, "i"), (m) => ({ kind: "penetration", value: number(m[1]), types: ELEMENTAL })],
  [new RegExp(`^Adds ${NUM}\\s*[–-]\\s*${NUM} (Physical|Fire|Cold|Lightning|Erosion) Damage to (?:your and your Minions['’] Attacks and Spells|Minions)$`, "i"), (m) => ({ kind: "added", min: number(m[1]), max: number(m[2]), type: m[3] })]
];

/**
 * The Minions a profile keeps out, for "… when you have N Minion(s)" lines (gear affix batch A, 2026-10-22): a Synthetic Troop or
 * Module summon its max (base + "Max Synthetic Troop Quantity +N" / "+N to Max Summonable Synthetic Troops", within the cap lines;
 * one per summon + Rally with "troopMaxMinions" off), any other Minion its count at the summon level. Hero extras are left out.
 */
export function minionCountOut(profile, level = 20, modifierTexts = [], { troopMaxMinions = true } = {}) {
  const resolved = typeof profile === "string" ? MINION_PROFILES[profile] : profile;
  if (!resolved) return 0;
  const values = (pattern) => modifierTexts.flatMap((line) => { const match = clean(line.text).match(pattern); return match ? [Number(match[1] ?? match[2]) * (line.multiplier ?? 1)] : []; });
  if (!TROOP_FAMILY.has(resolved.family)) return resolved.count?.at(Math.max(1, Math.floor(level || 20))) ?? 1;
  const rally = values(/^Synthetic Troop Minions summoned at a time \+?(\d+)$/i).reduce((total, value) => total + value, 0);
  if (!troopMaxMinions) return 1 + rally;
  const base = resolved.family === "module" ? (resolved.count?.max ?? 1) : (resolved.count?.at(Math.max(1, Math.floor(level || 20))) ?? 1);
  const raise = values(TROOP_RAISE).reduce((total, value) => total + value, 0);
  const caps = [...values(/^The Max Minion Quantity for each Synthetic Troop Skill is (\d+)\b/i), ...values(/^The number of Max Synthetic Troops In Map is fixed at (\d+)$/i)];
  return Math.max(1, Math.min(base + raise, ...caps));
}
// "Max Synthetic Troop Quantity +N" and the craft wording "+N to Max Summonable Synthetic Troops" (gear affix batch A, 2026-10-22).
const TROOP_RAISE = /^(?:Max Synthetic Troop Quantity \+?(\d+)|\+(\d+) to Max Summonable Synthetic Troops)$/i;

/** Minion-named modifier line → { kind, ... } or null (anything else, including conditional Minion lines). */
export function classifyMinionLine(text) {
  const line = clean(text);
  for (const [pattern, build] of PATTERNS) {
    const match = line.match(pattern);
    if (match) return build(match, line);
  }
  return null;
}

// Spirit Magus Growth / Enhanced-chance lines (catalog wordings; a trait or kismet text may hold several lines).
const GROWTH_ON_MINION_CRIT = /^Gains (\d+(?:\.\d+)?) Growth for [\d.]+ ?s when Minions land a Critical Strike, up to (\d+(?:\.\d+)?) ?\.?$/i;
const GROWTH_INITIAL = /^\+?(\d+(?:\.\d+)?) initial Growth for Spirit Magi$/i;
const GROWTH_PER = /^For every (\d+) Growth a Spirit Magus has, it deals \+(\d+(?:\.\d+)?)% additional damage(?:, up to \+(\d+(?:\.\d+)?)% additional damage)?$/i;
const GROWTH_PER_100 = /^For every 100 Growth a Spirit Magus has, it deals \+(\d+(?:\.\d+)?)% additional damage and ([+-]?\d+(?:\.\d+)?)% additional Attack and Cast Speed$/i;
const ENHANCED_CHANCE = /^\+?(\d+(?:\.\d+)?)% chance for Spirit Magi to use an Enhanced Skill$/i;
const ENHANCED_FIXED = /chance for Spirit Magi to use an Enhanced Skill is fixed at (\d+(?:\.\d+)?)%/i;
const GROWTH_MENTION = /\bGrowth\b|Spirit Mag(?:us|i)|Enhanced Skill|Nourishment|Full Bloom/i;
// Talons of Abyss (core audit B7; game affix 375621824: Growth → attr 60011 / 60021 additional on the Ultimate tag 6000403): the
// Ultimate is cast only in Full Bloom and stays out of the cycle (its cooldown is unpublished), so the line is read, not applied.
const GROWTH_ULTIMATE_SPEED = /^For every (\d+) Growth a Spirit Magus has, it \+?(\d+(?:\.\d+)?)% additional Ultimate Attack and Cast Speed$/i;
// Circle of Life (Ethereal Prism core; game affix 875331904): every 1 s, while a Spirit Magus is out (node 300: Spirit Magus count
// > 0), the player's Growth (resource 12, buff 460) is set to P1% of the nearest Spirit Magus's Growth; "For every P2 Growth,
// +P3% additional damage for Spirit Magi" reads the player's Growth. Its "Return Speed equal to Command" decay is not applied
// (Command is not modeled); the Physique and Skill Area parts change no dummy damage.
const CIRCLE_GAIN = /^Gains Growth equal to (\d+(?:\.\d+)?)% of the nearest Spirit Magus every 1 ?s(?:, and Growth gains Return Speed equal to Command)?$/i;
const CIRCLE_DAMAGE = /^For every (\d+(?:\.\d+)?) Growth, \+?(\d+(?:\.\d+)?)% additional damage for Spirit Magi(?:, .+)?$/i;
// Source (core audit B7; game affix 931211264: attr 3401 "inflicted status effect" additional with the Empower tag 5100311, on the
// Spirit Magi): their Empower Skill's buff (Euphoria) is stronger; read as a multiplier on every value of that buff (provisional).
const EMPOWER_EFFECT = /^Spirit Magi \+?([+-]?\d+(?:\.\d+)?)% (additional )?Empower Skill Effect$/i;
// TLIDB keyword Growth (hover a3edcfc8, fetched 2026-10-19): "The max Growth is 1000."
const MAX_GROWTH = 1000;
// The Stage bonuses of the TLIDB Growth keyword (hover a3edcfc8, fetched 2026-10-19): "At Stage 2, +30% chance for them to use
// Enhanced Skill chance. At Stage 3, their Enhanced Skills become stronger. At Stage 4, their Empower Skills become stronger. At
// Stage 5, they +50% additional damage, +10% additional Skill Area, and gain increased Movement Speed and Tracking Area." Stage 2's
// +30% matches manual rule 1001012031; Stages 3 and 4 are each skill's own "When at Stage N or higher" text (src/minion-profiles.js
// stageBonus); Stage 5's +50% additional damage is applied from the keyword. "For every 8 Growth, +1% Physique and +10% additional
// Skill Area" changes no dummy figure.
export const GROWTH_KEYWORD = Object.freeze({ stage2EnhancedChancePercent: 30, stage5AdditionalPercent: 50, source: "TLIDB Growth keyword" });

/**
 * Spirit Magus Growth, Stage and Enhanced-skill chance from the build's lines (manual rules 1001012024, 1001012029, 1001012031).
 * `extraGrowth`: Growth a hero state adds (Iris – Vigilant Breeze's moon: +6 per Breeze stack; hero trait audit B6), capped with
 * the rest at the keyword's max Growth of 1000 (TLIDB keyword Growth, hover a3edcfc8).
 */
export function spiritMagusState(lines = [], { extraGrowth = 0 } = {}) {
  const initial = [], perGrowth = [], per100 = [], chance = [], unread = [], ultimateSpeed = [], circleGain = [], circleDamage = [], empowerEffect = [];
  let fixedChance = null;
  for (const line of lines) {
    const multiplier = line.multiplier ?? 1;
    for (const raw of String(line.text || "").split(/\r?\n/)) {
      // An Ethereal Prism core's clause carries its "[Base]" label (src/modifier-texts.js).
      const text = clean(raw).replace(/^\[[^\]]+\]\s*/, "");
      if (!text) continue;
      const entry = { source: line.source, text, origin: line.origin || "gear" };
      let match;
      if ((match = text.match(GROWTH_ULTIMATE_SPEED))) ultimateSpeed.push({ ...entry, per: number(match[1]), percent: number(match[2]) * multiplier });
      else if ((match = text.match(CIRCLE_GAIN))) circleGain.push({ ...entry, percent: number(match[1]) * multiplier });
      else if ((match = text.match(CIRCLE_DAMAGE))) circleDamage.push({ ...entry, per: number(match[1]), percent: number(match[2]) * multiplier });
      else if ((match = text.match(EMPOWER_EFFECT))) empowerEffect.push({ ...entry, value: number(match[1]) * multiplier, additional: Boolean(match[2]) });
      else if ((match = text.match(GROWTH_INITIAL))) initial.push({ ...entry, value: number(match[1]) * multiplier });
      // Call of Souls (legendary audit batch 8): "Gains 5 Growth for 25 s when Minions land a Critical Strike, up to 50": the Spirit
      // Magi crit far more often than every 25 s (base Minion crit rating 150), so the cap is held (provisional).
      else if ((match = text.match(GROWTH_ON_MINION_CRIT))) initial.push({ ...entry, value: number(match[2]) * multiplier });
      else if ((match = text.match(GROWTH_PER))) perGrowth.push({ ...entry, per: number(match[1]), percent: number(match[2]) * multiplier, cap: match[3] != null ? number(match[3]) * multiplier : null });
      else if ((match = text.match(GROWTH_PER_100))) per100.push({ ...entry, percent: number(match[1]) * multiplier, speedPercent: number(match[2]) * multiplier });
      else if ((match = text.match(ENHANCED_CHANCE))) chance.push({ ...entry, value: number(match[1]) * multiplier });
      else if ((match = text.match(ENHANCED_FIXED))) { fixedChance = number(match[1]); unread.push({ ...entry, read: true }); }
      else if (GROWTH_MENTION.test(text) && !/^[+-]?\d+(?:\.\d+)?% additional (?:Spirit Magus Skill|Minion) Damage$/i.test(text)) unread.push(entry);
    }
  }
  const growth = Math.min(MAX_GROWTH, 100 + sum(initial) + Math.max(0, Number(extraGrowth) || 0));
  const stage = Math.max(1, Math.min(5, Math.floor(growth / 100)));
  // Circle of Life: the player's Growth = P1% of the nearest Magus's Growth (every modeled Magus has the same Growth), read right
  // after the 1 s update (no Return-Speed decay: 80% of the nearest Magus's Growth: user-supplied 2026-10-19, Google AI Mode answer, not tested in game).
  const circleGainPercent = circleGain.length ? Math.max(...circleGain.map((line) => line.percent)) : 0;
  const playerGrowth = growth * circleGainPercent / 100;
  const circle = circleGain.length ? circleDamage.map((line) => ({ source: line.source, text: `${line.text} (player Growth ${round(playerGrowth)} = ${circleGainPercent}% of the Magus's ${growth}; Circle of Life, provisional)`, origin: line.origin, value: line.percent * Math.floor(playerGrowth / line.per + 1e-9) })).filter((line) => line.value !== 0) : [];
  const stageChance = stage >= 2 ? GROWTH_KEYWORD.stage2EnhancedChancePercent : 0;
  const enhancedChancePercent = fixedChance != null ? fixedChance : Math.max(0, Math.min(100, stageChance + sum(chance)));
  const additional = [
    ...perGrowth.map((line) => ({ source: line.source, text: `${line.text} (${growth} Growth)`, origin: line.origin, value: Math.min(line.cap ?? Infinity, line.percent * Math.floor(growth / line.per)) })),
    ...per100.map((line) => ({ source: line.source, text: `${line.text} (${growth} Growth)`, origin: line.origin, value: line.percent * Math.floor(growth / 100) })),
    ...circle,
    // Stage 5 (TLIDB Growth keyword, hover a3edcfc8, cached in research/tlidb-ss14/fetch-cache; 2026-10-19, coordinator decision):
    // "At Stage 5, they +50% additional damage, +10% additional Skill Area, and gain increased Movement Speed and Tracking Area"
    // (sourced; the manual's 1001012034 value is a placeholder). The Skill Area, Movement Speed and Tracking Area parts change no
    // dummy figure.
    ...(stage >= 5 ? [{ source: "TLIDB Growth keyword", text: `+${GROWTH_KEYWORD.stage5AdditionalPercent}% additional damage (Stage 5, ${growth} Growth: TLIDB Growth keyword)`, origin: "skill", value: GROWTH_KEYWORD.stage5AdditionalPercent }] : [])
  ].filter((line) => line.value !== 0);
  // Whether the "+N initial Growth" lines change anything (core audit B7, Mighty Guard): a Stage above 1, a per-Growth line, Circle of
  // Life (the player's Growth follows the Magus's).
  const initialGrowthMatters = initial.length > 0 && (stage > 1 || perGrowth.length > 0 || per100.length > 0 || (circleGain.length > 0 && circleDamage.length > 0));
  // The hero state's extra Growth (B6) changes something when it moves the Stage or a per-Growth line reads it.
  const stageWithout = Math.max(1, Math.min(5, Math.floor(Math.min(MAX_GROWTH, 100 + sum(initial)) / 100)));
  const extraGrowthMatters = extraGrowth > 0 && (stage !== stageWithout || perGrowth.length > 0 || per100.length > 0 || (circleGain.length > 0 && circleDamage.length > 0));
  const speed = per100.map((line) => ({ source: line.source, text: `${line.text} (${growth} Growth)`, origin: line.origin, value: line.speedPercent * Math.floor(growth / 100), additional: true, attack: true, cast: true })).filter((line) => line.value !== 0);
  return {
    growth, stage, enhancedChancePercent, fixedChance, stageChancePercent: stageChance,
    sources: { initial, chance, perGrowth, per100, ultimateSpeed, circleGain, circleDamage }, additional, speed, unread: unread.filter((line) => !line.read),
    empowerEffect: { lines: empowerEffect, factor: Math.max(0, 1 + sum(empowerEffect.filter((line) => !line.additional)) / 100) * product(empowerEffect.filter((line) => line.additional)) },
    initialGrowthMatters, extraGrowth: Math.max(0, Number(extraGrowth) || 0), extraGrowthMatters, ultimateSpeed, circle: circleGain.length ? { gainPercent: circleGainPercent, playerGrowth, applied: circle, damageLines: circleDamage } : null,
    growthRule: "Spirit Magi start at Stage 1 (100 Growth) and gain a Stage per 100 Growth up to Stage 5, max 1000 Growth (manual rule 1001012029; TLIDB Growth keyword); the build's \"+N initial Growth for Spirit Magi\" lines add to the 100; Stage 5: +50% additional damage (TLIDB Growth keyword)",
    chanceRule: fixedChance != null ? `the Enhanced-skill chance is fixed at ${fixedChance}% (hero trait text)` : `Stage ${stage}: ${stageChance}% base Enhanced-skill chance (manual rule 1001012031 and the TLIDB Growth keyword: +30% at Stage 2; the Stage 1 base is not published and is read as 0%) + ${sum(chance)}% from lines`
  };
}

// Iris – Growing Breeze Nourishment (2026-10-12; hero trait text, src/data/heroes/base-hero-trait-levels-ss13.generated.js and
// all-hero-traits-ss13.generated.js). The base trait at every level carries: "When a Spirit Magus Skill is set as an Active
// Skill, casting the Active Skill is considered as casting the Trait Skill as well"; "Grants 4 stack(s) of Nourishment to all
// Spirit Magi when using Trait Skills. Cooldown: 5 s"; "When a Spirit Magus casts a skill, +30% chance for it to lose 1 stack
// of Nourishment"; "For every stack of Nourishment a Spirit Magus has, when it uses a skill, +8% chance for it to lose a stack
// of Nourishment"; "Nourishment: When using a skill, +30% additional damage dealt by this skill. Lasts 15 s and stacks up to
// 10 time(s)."; "100% of your Empower Skill Effect bonus is also applied to Spirit Magi's Nourishment"; a movement line. Its
// "+1 additional stack" is an Artificial Moon line (level 5 only; heroTraitStatLines stops at "Artificial Moon:"). Full Bloom
// and "do not lose / do not gain bonuses" are the Lv.60 trait Gentle Zephyr; auto-triggering the Trait Skill is the Lv.75
// trait Grow With Them; Socialite (Lv.45) adds to the per-cast loss chance.
const NOURISH = {
  activeAsTrait: /^When a Spirit Magus Skill is set as an Active Skill, casting the Active Skill is considered as casting the Trait Skill as well$/i,
  grant: /^Grants (\d+(?:\.\d+)?) stack\(s\) of Nourishment to all Spirit Magi when using Trait Skills\. Cooldown: (\d+(?:\.\d+)?) s$/i,
  extraGrant: /^Grant (\d+(?:\.\d+)?) additional stacks? of Nourishment to all Spirit Magi when casting a Trait Skill$/i,
  lose: /^When a Spirit Magus casts a skill, \+?(\d+(?:\.\d+)?)% chance for it to lose 1 stack of Nourishment$/i,
  losePerStack: /^For every stack of Nourishment a Spirit Magus has, when it uses a skill, \+?(\d+(?:\.\d+)?)% chance for it to lose a stack of Nourishment$/i,
  effect: /^Nourishment ?: When using a skill, \+(\d+(?:\.\d+)?)% additional damage dealt by this skill\. Lasts (\d+(?:\.\d+)?) s and stacks up to (\d+) time\(s\)\.?$/i,
  empowerShare: /^(\d+(?:\.\d+)?)% of your Empower Skill Effect bonus is also applied to Spirit Magi's Nourishment$/i,
  autoTrait: /^Always attempts to auto-trigger the Trait Skill, Growing Breeze$/i,
  noLossNoBonus: /^Spirit Magi do not lose Nourishment when casting non-Ultimates but do not gain Nourishment bonuses$/i,
  fullBloom: /^After gaining a total of (\d+) stacks of Nourishment ?, Spirit Magi enter Full Bloom for (\d+(?:\.\d+)?) s$/i,
  movement: /^Within \d+(?:\.\d+)? s of Spirit Magi gaining Nourishment ?, if there are no enemies within \d+ m, \+\d+(?:\.\d+)?% Movement Speed$/i
};

/** Which Nourishment line a text is (a NOURISH key), or null. */
export function nourishmentLineKind(text) {
  const line = clean(text);
  return Object.keys(NOURISH).find((key) => NOURISH[key].test(line)) || null;
}

/** Nourishment mechanics from the build's lines (Iris – Growing Breeze), or null when the build grants none. */
export function nourishmentState(lines = []) {
  const state = { stacksPerTraitCast: 0, extraStacksPerTraitCast: 0, traitCooldownSeconds: null, effectPercent: 0, durationSeconds: null, maxStacks: null, loseChancePercent: 0, losePerStackPercent: 0,
    empowerSharePercent: 0, activeAsTrait: false, autoTrait: false, noLossNoBonus: false, fullBloom: null, sources: [], readTexts: new Set() };
  for (const line of lines) {
    for (const raw of String(line.text || "").split(/\r?\n/)) {
      const text = clean(raw);
      if (!text) continue;
      const read = (key, extra = {}) => { state.sources.push({ source: line.source, text, origin: line.origin || "gear", key, ...extra }); state.readTexts.add(text); };
      let match;
      if (NOURISH.activeAsTrait.test(text)) { state.activeAsTrait = true; read("activeAsTrait"); }
      else if ((match = text.match(NOURISH.grant))) { state.stacksPerTraitCast += number(match[1]); state.traitCooldownSeconds = Math.max(state.traitCooldownSeconds ?? 0, number(match[2])); read("grant"); }
      else if ((match = text.match(NOURISH.extraGrant))) { state.extraStacksPerTraitCast += number(match[1]); read("extraGrant"); }
      else if ((match = text.match(NOURISH.lose))) { state.loseChancePercent += number(match[1]); read("lose"); }
      else if ((match = text.match(NOURISH.losePerStack))) { state.losePerStackPercent += number(match[1]); read("losePerStack"); }
      else if ((match = text.match(NOURISH.effect))) { state.effectPercent = Math.max(state.effectPercent, number(match[1])); state.durationSeconds = number(match[2]); state.maxStacks = Math.max(state.maxStacks ?? 0, number(match[3])); read("effect"); }
      else if ((match = text.match(NOURISH.empowerShare))) { state.empowerSharePercent += number(match[1]); read("empowerShare"); }
      else if (NOURISH.autoTrait.test(text)) { state.autoTrait = true; read("autoTrait"); }
      else if (NOURISH.noLossNoBonus.test(text)) { state.noLossNoBonus = true; read("noLossNoBonus"); }
      else if ((match = text.match(NOURISH.fullBloom))) { state.fullBloom = { totalStacks: number(match[1]), durationSeconds: number(match[2]), source: line.source }; read("fullBloom"); }
      else if (NOURISH.movement.test(text)) read("movement", { noDpsEffect: true });
    }
  }
  if (!(state.stacksPerTraitCast > 0) || !(state.effectPercent > 0)) return null;
  return state;
}

// An Empower Skill buff with every value × `factor` (Spirit Magi Empower Skill Effect; core audit B7). Durations stay.
function scaleBuff(buff, factor, lines = []) {
  const scaled = { ...buff, empowerEffectFactor: factor, source: `${buff.source || "Empower Skill buff"} × ${round(factor)} Empower Skill Effect (${lines.map((line) => line.source).join(", ")})` };
  for (const key of ["additionalPercent", "critRating", "critRatingPercent", "critDamagePercent", "attackSpeedAdditionalPercent"]) if (buff[key]) scaled[key] = buff[key] * factor;
  if (buff.nextUses) scaled.nextUses = buff.nextUses.map((value) => value * factor);
  return scaled;
}

const typeApplies = (lineType, componentTypes) => !lineType || (lineType === "Elemental" ? componentTypes.some((type) => ELEMENTAL.includes(type)) : componentTypes.includes(lineType));

// Combine the self buffs active at a moment for one skill: additional factors multiply (typed buffs only for their types),
// crit rating / crit rating % / crit damage add, attack-speed additional multiplies.
function combineBuffs(active, skillType) {
  const combined = { additionalFactor: 1, critRating: 0, critRatingPercent: 0, critDamagePercent: 0, attackSpeedAdditionalFactor: 1, labels: [] };
  for (const buff of active) {
    if (buff.additionalPercent && (!buff.types || buff.types.includes(skillType))) combined.additionalFactor *= 1 + buff.additionalPercent / 100;
    combined.critRating += buff.critRating || 0;
    combined.critRatingPercent += buff.critRatingPercent || 0;
    combined.critDamagePercent += buff.critDamagePercent || 0;
    if (buff.attackSpeedAdditionalPercent) combined.attackSpeedAdditionalFactor *= 1 + buff.attackSpeedAdditionalPercent / 100;
    combined.labels.push(buff.skill || buff.source || "buff");
  }
  return combined;
}

/**
 * Model one Minion source against the dummy.
 * @param {object} p
 * @param {object} p.profile MINION_PROFILES entry
 * @param {number} p.level summon-skill level (effective)
 * @param {object[]} p.modifierTexts flattened build lines (planner.modifierTexts)
 * @param {object[]} p.traitLines hero trait lines (src/character-stats.js heroTraitStatLines)
 * @param {object} p.target { resistancePercent: { Fire, Cold, Lightning, Erosion }, armourPercent, nonPhysicalArmourPercent }
 * @param {number} p.timelineSeconds how far the hit schedule is generated (dummy recount timeline)
 * @param {{ setupKey, name }[]} p.setups the catalog setups that activate this Minion
 * @param {"cooldown"|"summon"|"none"} p.traitSkill Trait Skill casts for Nourishment (Iris – Growing Breeze): "cooldown" =
 *   pressed whenever off cooldown from the summon cast on (best case; also forced by an auto-trigger trait), "summon" = only
 *   the summon cast counts (the trait's "casting the Active Skill is considered as casting the Trait Skill"; open whether the
 *   Magus it creates receives the stacks), "none" = never.
 * @param {object|null} p.heroTraits Moto / Iris trait inputs for this Minion (hero trait audit B6; src/moto-iris-traits.js, built
 *   by src/planner.js minionHeroTraits): { readTexts, layers (static Minion layers: Overload, Nourishing Spring Rain's Growth,
 *   Unstoppable Wave …), overloadRamp, extraCount, nourish (Growing Breeze extras), troopNourish, vigilant, selfDestruct, magiCount }.
 */
export function calculateMinion({ profile, level = 20, modifierTexts = [], traitLines = [], target = {}, timelineSeconds = 60, setups = [], windows = [5, 20], extraTaken = [], traitSkill = "cooldown", extraCritOnly = [], handledTexts = null, extraLines = [], bond = null, summonCastSpeed = null, heroTraits = null, prebuilt = true, troopMaxMinions = true, moduleMaxMinions = true } = {}) {
  const resolved = typeof profile === "string" ? MINION_PROFILES[profile] : profile;
  if (!resolved) return null;
  const capped = Math.max(1, Math.min(MINION_BASE_DAMAGE_FROZEN_LEVEL, Math.floor(level || 20)));
  const effectiveLevel = Math.max(1, Math.floor(level || 20));
  const baseDamage = minionBaseDamage(effectiveLevel);
  const levelFactor = skillLevelDamageMultiplier(effectiveLevel);
  const notes = [...(resolved.notes || [])];
  const warnings = [];
  const assumptions = [];
  const isSpiritMagus = resolved.family === "spirit-magus";

  // Minion lines from the build and the hero's traits; other Minion-mentioning lines are listed as not read.
  const lines = { tripleDamage: [], onlyType: [], increased: [], additional: [], speed: [], critRating: [], critDamage: [], penetration: [], armourPenetration: [], added: [], unread: [], support: [], maxDamage: [], minDamage: [], multistrikeChance: [], multistrikeIncrement: [], multistrikeIncrementAdditional: [], doubleDamage: [], lucky: [], inactive: [] };
  // Conditional lines the shared resolver reads (src/line-effects.js: an active one reaches this model as a derived plain line, an
  // inactive one keeps its reason on the badge) are not "unread" here, nor are the originals of derived copies (core audit B7).
  const handled = new Set([...[...(handledTexts || [])].map(clean), ...modifierTexts.filter((line) => line.derivedFrom).map((line) => clean(line.derivedFrom)), ...[...(bond?.readTexts || [])].map(clean), ...[...(heroTraits?.readTexts || [])].map(clean)]);
  for (const line of [...modifierTexts, ...traitLines]) {
    const parsed = classifyMinionLine(line.text);
    const entry = { source: line.source, text: clean(line.text), origin: line.origin || "gear" };
    const multiplier = line.multiplier ?? 1;
    if (!parsed) { if (/\bMinions?\b/i.test(line.text) && !handled.has(clean(line.text)) &&!/Minion Max Life|Minion Movement|Minion Life|Minion Energy Shield|Minion Armou?r|Minion Evasion|Skill Area for Minions|Duration for Minions|avoid damage|Aggressiveness|Max Minion|Minion Quantity|Summonable|Minion Damage per stack of any Blessing/i.test(line.text)) lines.unread.push(entry); continue; }
    if (parsed.spiritMagus && !isSpiritMagus) continue;
    if (parsed.troop && !TROOP_FAMILY.has(resolved.family)) continue;
    if (parsed.kind === "added") lines.added.push({ ...entry, type: parsed.type, min: parsed.min * multiplier, max: parsed.max * multiplier });
    else if (parsed.kind === "penetration") lines.penetration.push({ ...entry, value: parsed.value * multiplier, types: parsed.types });
    else lines[parsed.kind].push({ ...entry, ...parsed, value: parsed.value * multiplier });
  }
  // Supports on the setups that summon this Minion (manual rule 1001011821: Minions take only lines that name Minions). Each
  // line is its own multiplier; when several setups of the same Minion carry the same support, it counts once (its
  // highest value; provisional: which setup summoned the Minion is not tracked).
  const supportLines = new Map();
  for (const setup of setups) {
    for (const clause of supportEffectsFor(setup, { engine: "minion" }).clauses.filter((item) => item.family === "minion")) {
      const parsed = classifyMinionLine(clause.text);
      if (!parsed || parsed.kind === "added" || parsed.kind === "penetration" || (parsed.spiritMagus && !isSpiritMagus)) { if (!parsed) lines.unread.push({ source: clause.source, text: clean(clause.text), origin: "support" }); continue; }
      if (!parsed.value) continue;
      const key = `${clause.support}|${clause.origin}|${parsed.kind}|${clause.baseText}`;
      const entry = { source: clause.source, text: `${clean(clause.text)}${clause.origin === "star" ? ` (${clause.stars ?? "?"}★ star bonus)` : clause.origin === "leveled" ? ` (Lv.${clause.level})` : clause.origin === "roll" ? ` (T${clause.tier ?? "?"} roll)` : ""}`, origin: "support", ...parsed, value: parsed.value };
      if (!supportLines.has(key) || supportLines.get(key).value < entry.value) supportLines.set(key, entry);
    }
  }
  for (const entry of supportLines.values()) lines[entry.kind].push(entry);
  lines.support = [...supportLines.values()];
  for (const line of lines.unread) warnings.push(`${line.source}: "${line.text}" names Minions but is not read by the Minion damage model (conditional or unmodeled).`);
  // Planner-resolved Minion layers (core audit B7: Commander's Gambit's Blessings on the Minions, Bond): { kind, value, … } entries.
  for (const line of extraLines) if (lines[line.kind]) lines[line.kind].push({ origin: "derived", ...line });
  // Bond (core audit B7, src/minion-cores.js bondState): its full-stack layers join the Minion lines (own buffs pre-built); with
  // prebuiltSelfBuffs off the cycle scales each use by the stacks held at that moment (bondRamp below).
  const bondActive = Boolean(bond?.canObtain && bond.maxStacks > 0);
  if (bondActive) for (const line of bond.layersAt(bond.maxStacks)) if (lines[line.kind]) lines[line.kind].push({ origin: "derived", ...line });
  // Moto / Iris trait layers resolved for this Minion (hero trait audit B6): Overload, Nourishing Spring Rain's Growth bonus, ….
  for (const line of heroTraits?.layers || []) if (lines[line.kind]) lines[line.kind].push({ origin: "derived", heroTrait: true, ...line });

  // Spirit Magus Growth / Stage / Enhanced chance; Growth-based additional and speed lines join the Minion layers.
  const magusTexts = [...modifierTexts, ...traitLines];
  // Iris – Vigilant Breeze (hero trait audit B6, Q-H13 recommended reading, provisional): a Merged Magus holds Breeze at its max
  // (10 + Breeze's Whisper + Warmest Vigilance + Blowing Breeze where their sources fire), each stack +16% additional damage (keyword
  // Breeze), and the moon's Growth per stack joins its Growth (Stage, per-Growth lines, Merging Stream).
  const vigilant = isSpiritMagus && heroTraits?.vigilant?.held && heroTraits.vigilant.merged ? heroTraits.vigilant : null;
  const breeze = vigilant ? vigilantBreezeMax(vigilant, { chanceAt: (extraGrowth) => spiritMagusState(magusTexts, { extraGrowth }).enhancedChancePercent }) : null;
  const magus = isSpiritMagus ? spiritMagusState(magusTexts, { extraGrowth: breeze?.extraGrowth || 0 }) : null;
  // Nourishment (Iris – Growing Breeze): Spirit Magi, and Synthetic Troop / Module Minions with the revived Nourishing Spring Rain
  // (hero trait audit B6: "Nourishment can be applied to Synthetic Troop Minions"; their loss chance is the Magi's, lowered by
  // 2% per 1% of the Magi's Enhanced-skill chance; provisional).
  const troopNourish = heroTraits?.troopNourish && TROOP_FAMILY.has(resolved.family) ? heroTraits.troopNourish : null;
  const nourish = isSpiritMagus || troopNourish ? nourishmentState(magusTexts) : null;
  if (magus) {
    lines.additional.push(...magus.additional.map((line) => ({ ...line, kind: "additional" })));
    lines.speed.push(...magus.speed.map((line) => ({ ...line, kind: "speed" })));
    for (const line of magus.unread.filter((item) => !nourish?.readTexts.has(item.text) && !handled.has(clean(item.text)))) warnings.push(`${line.source}: "${line.text}" is a Spirit Magus line the Minion model does not read (Nourishment, Full Bloom, conditional Growth).`);
    assumptions.push({ id: `magusStage:${resolved.key}`, value: magus.stage, text: `${resolved.minion} Stage ${magus.stage} (${magus.growth} Growth: ${magus.growthRule}).` });
    assumptions.push({ id: `magusEnhancedChance:${resolved.key}`, value: magus.enhancedChancePercent, text: `${resolved.minion} Enhanced-skill chance ${round(magus.enhancedChancePercent)}% (${magus.chanceRule}).` });
    if (magus.empowerEffect.factor !== 1) assumptions.push({ id: `magusEmpowerEffect:${resolved.key}`, value: round(magus.empowerEffect.factor), text: `${resolved.minion} Empower Skill Effect ×${round(magus.empowerEffect.factor)} (${magus.empowerEffect.lines.map((line) => line.text).join(", ")}): every value of its Empower Skill's buff is scaled (game affix 931211264; provisional reading).` });
    if (magus.circle) assumptions.push({ id: `circleOfLife:${resolved.key}`, value: round(magus.circle.playerGrowth), text: `Circle of Life: your Growth ${round(magus.circle.playerGrowth)} = ${magus.circle.gainPercent}% of the ${resolved.minion}'s ${magus.growth} Growth, read right after each 1 s update (its Return Speed equal to Command is not applied: Command is not modeled; provisional).` });
  }
  const stage = magus?.stage ?? 1;
  // Vigilant layers (B6): Breeze on the Merged Magus; Happiest Reunion's +X% additional (multiplies) per Spirit Magus in the map.
  const heroTraitState = {};
  if (breeze) {
    const value = KEYWORDS.breeze.perStackPercent * breeze.max;
    lines.additional.push({ origin: "derived", heroTrait: true, kind: "additional", value, source: `Breeze (Vigilant Breeze; ${KEYWORDS.breeze.source})`, text: `+${value}% additional damage (Breeze: ${breeze.max} stacks × ${KEYWORDS.breeze.perStackPercent}%, held at its max: Q-H13)` });
    if (vigilant.reunion) {
      const magi = Math.max(1, vigilant.magiCount || 1);
      const reunion = ((1 + vigilant.reunion.perMagusPercent / 100) ** magi - 1) * 100;
      lines.additional.push({ origin: "derived", heroTrait: true, kind: "additional", value: round(reunion), source: "Happiest Reunion (Vigilant state)", text: `+${round(reunion)}% additional damage (Happiest Reunion: +${vigilant.reunion.perMagusPercent}% (multiplies) × ${magi} Spirit Magi)` });
    }
    heroTraitState.vigilant = { merged: true, breeze, reunionMagi: vigilant.reunion ? Math.max(1, vigilant.magiCount || 1) : 0, growth: magus?.growth ?? null, extraGrowthMatters: Boolean(magus?.extraGrowthMatters) };
    assumptions.push({ id: `vigilant:${resolved.key}`, value: breeze.max, text: `${resolved.minion} is Merged in the Vigilant state (held, best case: switch "Vigilant held"; Q-H13, provisional): Breeze at its max ${breeze.max} (${breeze.base} + Warmest Vigilance ${breeze.warmest} + Breeze's Whisper ${breeze.whisper} + Blowing Breeze ${breeze.blowing}; Reconjuring breaks ignored)${breeze.extraGrowth ? `, +${breeze.extraGrowth} Growth from the moon (Stage ${stage})` : ""}.` });
  } else if (isSpiritMagus && heroTraits?.vigilant) heroTraitState.vigilant = { merged: false, reason: !heroTraits.vigilant.held ? "the Vigilant state is switched off" : "another Spirit Magus is the Merged one (best case)" };
  // Merging Stream (B6): the build's Origins on every Spirit Magus, each × (1 + X% per 2 Growth received).
  if (isSpiritMagus && heroTraits?.merging) {
    const merging = heroTraits.merging;
    const received = merging.perGrowth > 0 ? merging.percent * Math.floor((magus?.growth ?? 100) / merging.perGrowth + 1e-9) : 0;
    const factor = 1 + received / 100;
    const applied = [];
    for (const origin of merging.origins || []) {
      const source = `${origin.source}${received ? `, ×${round(factor)} received (${round(received)}% from ${magus?.growth ?? 100} Growth)` : ""}`;
      if (origin.damage) { lines.additional.push({ origin: "derived", heroTrait: true, kind: "additional", value: round(origin.damage * factor), source, text: `+${round(origin.damage * factor)}% additional damage (Origin of ${origin.magus} on the Spirit Magi: Merging Stream)` }); applied.push(origin.magus); }
      if (origin.speed) lines.speed.push({ origin: "derived", heroTrait: true, kind: "speed", value: round(origin.speed * factor), additional: true, attack: true, cast: true, source, text: `+${round(origin.speed * factor)}% additional Attack and Cast Speed (Origin of ${origin.magus}: Merging Stream)` });
      if (origin.critRating) { lines.critRating.push({ origin: "derived", heroTrait: true, kind: "critRating", value: round(origin.critRating * factor), flat: true, source, text: `+${round(origin.critRating * factor)} Critical Strike Rating (Origin of ${origin.magus}: Merging Stream)` }); applied.push(origin.magus); }
    }
    heroTraitState.merging = { receivedPercent: round(received), growth: magus?.growth ?? 100, applied: [...new Set(applied)], origins: (merging.origins || []).map((origin) => origin.magus) };
  }

  // Rally ("Synthetic Troop Minions summoned at a time +N"): each cast (or automatic summon) brings N more, up to the skill's max
  // quantity (user-supplied 2026-10-19, Google AI Mode answer, not tested in game). With own buffs pre-built the max is out from
  // the start, so Rally only speeds the cold-start ramp, or adds N with "troopMaxMinions" off.
  const rallyLines = TROOP_FAMILY.has(resolved.family) ? modifierTexts.flatMap((line) => { const match = clean(line.text).match(/^Synthetic Troop Minions summoned at a time \+?(\d+)$/i); return match ? [{ source: line.source, value: Number(match[1]) * (line.multiplier ?? 1) }] : []; }) : [];
  const rallyExtra = rallyLines.reduce((total, line) => total + line.value, 0);
  // Socialite (Iris – Growing Breeze, B6): +N Max Summonable Spirit Magi for this Magus skill, within the map cap (planner).
  const heroExtraCount = Math.max(0, Math.floor(Number(heroTraits?.extraCount) || 0));
  // Synthetic Troop Minions (modules: user-supplied 2026-10-21, Google AI Mode answer, not an in-game test; Synthetic Troop summons:
  // user decision 2026-10-21, same rules). Base max: a module 4 (TLIDB SS14 Module pages agree); a Synthetic Troop summon its text's
  // "This skill summons up to N Minions" at its level (Machine Guard, Spider Tank 4; Grim Phantom 2 / 3 / 4 by level). No Minion
  // has a duration (the skill stops summoning at its max), so the sustained figure holds the max (best case). One per cast (+ Rally);
  // Grim Phantom summons one every 1 s by itself. "Max Synthetic Troop Quantity +N" raises the max; "The Max Minion Quantity for
  // each Synthetic Troop Skill is N" and "The number of Max Synthetic Troops In Map is fixed at N" cap it. The combat condition
  // "troopMaxMinions" (saved "moduleMaxMinions" still read) off reads one Minion per summon (+ Rally); the Huge Ember Lv.20 reference
  // run had one out.
  const lineValues = (pattern, scaled = false) => modifierTexts.flatMap((line) => { const match = clean(line.text).match(pattern); return match ? [{ source: line.source, text: clean(line.text), value: Number(match[1]) * (scaled ? (line.multiplier ?? 1) : 1) }] : []; });
  const troopCount = TROOP_FAMILY.has(resolved.family) ? (() => {
    const perCast = 1 + rallyExtra;
    if (!(troopMaxMinions && moduleMaxMinions)) return { max: perCast, perCast, base: perCast, raise: [], caps: [], off: true };
    const base = resolved.family === "module" ? (resolved.count?.max ?? 1) : (resolved.count?.at(effectiveLevel) ?? 1);
    const raise = modifierTexts.flatMap((line) => { const match = clean(line.text).match(TROOP_RAISE); return match ? [{ source: line.source, text: clean(line.text), value: Number(match[1] ?? match[2]) * (line.multiplier ?? 1) }] : []; });
    const caps = [...lineValues(/^The Max Minion Quantity for each Synthetic Troop Skill is (\d+)\b/i), ...lineValues(/^The number of Max Synthetic Troops In Map is fixed at (\d+)$/i)];
    return { max: Math.max(1, Math.min(base + sum(raise), ...caps.map((line) => line.value))), perCast, base, raise, caps, off: false };
  })() : null;
  const count = troopCount ? troopCount.max : (resolved.count?.at(effectiveLevel) ?? 1) + rallyExtra + heroExtraCount;
  if (heroExtraCount) { heroTraitState.extraCount = heroExtraCount; assumptions.push({ id: `magusCount:${resolved.key}`, value: count, text: `${resolved.summon}: ${count} Spirit Magi (${heroTraits.extraCountSource || "Socialite"}: +${heroExtraCount} Max Summonable Spirit Magi within the map cap; provisional).` }); }
  if (troopCount) assumptions.push({ id: `minionCount:${resolved.key}`, value: count, text: `${resolved.summon}: ${count} ${resolved.minion}${count === 1 ? "" : "s"} out${troopCount.off ? ` (combat condition "troopMaxMinions" off: one per summon${rallyExtra ? ` + ${rallyExtra} (Rally)` : ""})` : ` (base ${troopCount.base}: ${resolved.count?.source}${troopCount.raise.length ? `; + ${sum(troopCount.raise)} from ${troopCount.raise.map((line) => line.source).join(", ")}` : ""}${troopCount.caps.length ? `; capped at ${Math.min(...troopCount.caps.map((line) => line.value))} by ${troopCount.caps.map((line) => line.source).join(", ")}` : ""}; ${troopCount.perCast} per ${resolved.autoSummonSeconds ? `automatic summon (every ${resolved.autoSummonSeconds} s)` : "cast"}${rallyExtra ? " with Rally" : ""}; best case: all out before engaging${prebuilt ? "" : ", ramping here (own buffs not pre-built)"}; flip with the combat condition "troopMaxMinions")`}.` });
  else if (resolved.count?.assumed) assumptions.push({ id: `minionCount:${resolved.key}`, value: count, text: `${resolved.summon}: ${resolved.count.source}.` });
  // Contained Mind (legendary audit batch 8): "The Max Minion Quantity for each Synthetic Troop Skill is 1, but +50% additional
  // Synthetic Troop Minion Damage for each Synthetic Troop Minion (multiplies)": the cap above, and (1 + X%)^(troops out) on the
  // troop's own hits (provisional: "for each Synthetic Troop Minion" read as those this skill keeps out).
  const containedMind = troopCount ? modifierTexts.flatMap((line) => { const match = clean(line.text).match(/^The Max Minion Quantity for each Synthetic Troop Skill is \d+, but \+?(\d+(?:\.\d+)?)% additional Synthetic Troop Minion Damage for each Synthetic Troop Minion \(multiplies\)$/i); return match ? [{ source: line.source, text: `${clean(line.text)} (${count} out)`, value: ((1 + Number(match[1]) * (line.multiplier ?? 1) / 100) ** count - 1) * 100, origin: "gear" }] : []; }) : [];
  lines.additional.push(...containedMind);
  const perMinionAdditional = resolved.perMinionAdditionalPercent ? [{ source: `${resolved.summon}: per Minion summoned`, text: `+${resolved.perMinionAdditionalPercent}% additional damage for every ${resolved.minion} summoned (${count} summoned)`, value: resolved.perMinionAdditionalPercent * count, origin: "skill" }] : [];
  const levelLine = effectiveLevel > 20 ? [{ source: `${resolved.summon} level ${effectiveLevel}`, text: `+${round((levelFactor - 1) * 100)}% additional damage (TLIDB Skill Level: +10%/level 21–30, +8%/level 31+; applies to the skill and its Minions, rule 1001000822)`, value: (levelFactor - 1) * 100, origin: "skill" }] : [];

  // Speeds: the Minion's own attack / cast speed (base 1; player speed never applies).
  const speedFactor = (which) => { const relevant = lines.speed.filter((line) => line[which]); return Math.max(0.0001, 1 + sum(relevant.filter((line) => !line.additional)) / 100) * product(relevant.filter((line) => line.additional)); };
  const attackSpeedFactor = speedFactor("attack"), castSpeedFactor = speedFactor("cast");
  // Minion Multistrike inputs (core audit B7): chance, increment ("Minions' Multistrikes deal X% increasing damage") and the
  // additional increment multiplier.
  const msChance = sum(lines.multistrikeChance), msIncrement = sum(lines.multistrikeIncrement), msIncrementAdditional = sum(lines.multistrikeIncrementAdditional);

  // Crit: Minion Base Stats (rating 500, damage 150) plus Minion crit lines; a special's self buff adds while it runs
  // (flat rating, "+X% Critical Strike Rating" of the Magus's rating, crit damage).
  const baseCritRating = 500, baseCritDamage = 150;
  const critRating = (buff) => (baseCritRating + sum(lines.critRating.filter((line) => line.flat)) + (buff?.critRating || 0)) * Math.max(0, 1 + (sum(lines.critRating.filter((line) => !line.flat && !line.additional)) + (buff?.critRatingPercent || 0)) / 100) * product(lines.critRating.filter((line) => !line.flat && line.additional));
  // "Minions gain Lucky upon a Critical Strike" (gear affix batch A, 2026-10-22): Lucky (game keyword 116: "performs a random check
  // or random roll twice and picks the result that benefits you the most"), held once the Minions crit (they crit far more often than
  // the buff lasts; provisional). Crit check: 1 − (1 − c)²; added flat rolls: the better of two (see rollAverage).
  const luckyCrit = lines.lucky.length > 0;
  const critChance = (buff) => { const base = Math.min(100, Math.max(0, critRating(buff)) / 100) / 100; return luckyCrit && base > 0 ? 1 - (1 - base) ** 2 : base; };
  const critDamage = (buff) => Math.max(100, (baseCritDamage + sum(lines.critDamage.filter((line) => !line.additional)) + (buff?.critDamagePercent || 0)) * product(lines.critDamage.filter((line) => line.additional)) * (buff?.critDamageFactor ?? 1)) / 100;
  // Enemy crit-taken debuffs on the crit share (the Marked dummy, src/mark-effect.js; 2026-10-14): Minion hits take them too.
  const critOnlyFactor = product(extraCritOnly);
  const critFactor = (buff) => 1 - critChance(buff) + critChance(buff) * critDamage(buff) * critOnlyFactor;

  // Target (src/target-hit-mitigation.js, user-confirmed Lv.85 dummy): 50% armour vs Physical hits, 30% vs other hits,
  // 30% resistances. Minion hits are assumed to take the same mitigation as the player's hits (not sourced for Minions).
  const armourPercent = target.armourPercent ?? level85DummyDefenses.armourPercent;
  const nonPhysicalArmourPercent = target.nonPhysicalArmourPercent ?? level85DummyDefenses.nonPhysicalArmourPercent;
  const resistanceOf = (type) => type === "Physical" ? 0 : (target.resistancePercent?.[type] ?? level85DummyDefenses[`${type.toLowerCase()}ResistancePercent`] ?? 30);

  // Enemy damage taken (residual batch follow-up): a debuff on the dummy (curses, Frail, Infiltrations, Numbed, Paralysis,
  // "taken by Nearby enemies") raises every hit it takes, Minion hits included; the manual's Minion rule (1001011821) limits
  // the Minion's own damage lines, not the target's. Read like src/skill-hit-model.js: the planner's derived lines and typed
  // positive lines, plus the planner's resolved curse lines (Scorch). Tag-scoped lines ("Spell Damage taken") need the hit's
  // skill tags, which a Minion skill does not carry here: not applied (provisional).
  const takenLines = [];
  for (const line of modifierTexts) {
    const parsed = classifyHitLine(line.text);
    if (parsed?.kind !== "taken" || !(line.origin === "derived" || (parsed.value > 0 && parsed.scope.damageTypes))) continue;
    if (parsed.scope.skillTags) continue;
    takenLines.push({ source: line.source, text: clean(line.text), value: parsed.value * (line.multiplier ?? 1), layer: parsed.layer, scope: parsed.scope });
  }
  for (const line of extraTaken) takenLines.push({ source: line.source, text: line.text, value: line.value, layer: line.layer || "additional", scope: { damageTypes: line.types ? new Set(line.types) : null, skillTags: null } });
  const takenFactorFor = (types) => {
    const own = takenLines.filter((line) => scopeApplies(line.scope, { damageTypes: types }));
    return { lines: own, factor: Math.max(0, 1 + sum(own.filter((line) => line.layer === "increased")) / 100) * product(own.filter((line) => line.layer !== "increased")) };
  };

  // Charge Calling (Moto – Charge Calling, hero trait audit B6; src/moto-iris-traits.js, provisional): with Charge Calling held
  // (6 s / 6 s, pressed on cooldown) every summon cast creates 1 (+ Rally) + 1 Synthetic Troop Minions that self-destruct 1 s
  // after (keyword: 115% of Base Damage, Physical Attack, Melee, Area), at most the skill's quantity + 1 alive, so explosions/s =
  // min(summon casts/s × troops per cast, alive ÷ 1 s). Summon casts: Fuel War with War's trigger of the Main Summon Skill, or the
  // summon recast at its own pace (use time; a Module's 4 s cooldown). Mechanical Parts (Unstoppable Wave) drop at the chance per
  // explosion and are picked up; "recently" is 4 s. The explosion loop replaces the troops' own attacks where it deals more.
  const sdInput = heroTraits?.selfDestruct?.pressed && TROOP_FAMILY.has(resolved.family) ? heroTraits.selfDestruct : null;
  let sdPlan = null;
  if (sdInput) {
    const perCast = 1 + rallyExtra + sdInput.extraPerCast;
    const maxAlive = count + sdInput.extraPerCast;
    const summonScaled = skillTimingSs13[resolved.summon]?.speedType === "cast-speed" || resolved.family === "synthetic-troop";
    const summonSeconds = (resolved.summonCastSeconds ?? 1) / (summonScaled && summonCastSpeed?.factor ? summonCastSpeed.factor : 1);
    const ownCooldown = resolved.family === "module" ? resolved.summonCooldownSeconds || 0 : skillTimingSs13[resolved.summon]?.cooldown || 0;
    const fuel = sdInput.fuelWar && sdInput.mainSummon ? sdInput.fuelWar : null;
    const ignoresCooldown = Boolean(fuel) && (resolved.family !== "module" || fuel.ignoresModuleCooldown);
    const castInterval = fuel ? Math.max(fuel.intervalSeconds, ignoresCooldown ? 0 : ownCooldown) : Math.max(summonSeconds, ownCooldown);
    const castsPerSecond = 1 / Math.max(0.01, castInterval);
    const ownCastsPerSecond = 1 / Math.max(0.01, Math.max(summonSeconds, ownCooldown));
    const parts = sdInput.parts?.pickup ? sdInput.parts : null;
    let held = 0, rate = 0, life = sdInput.chargeSeconds, guerillaStacks = 0;
    for (let pass = 0; pass < 6; pass++) {
      life = sdInput.chargeSeconds / (1 + (parts?.guerilla ? parts.guerilla.speedPercent * guerillaStacks / 100 : 0));
      rate = Math.min(castsPerSecond * perCast, maxAlive / life);
      held = parts ? rate * parts.chancePercent / 100 * parts.perDrop * RECENT_SECONDS : 0;
      guerillaStacks = parts?.guerilla ? Math.min(parts.guerilla.cap, held) : 0;
    }
    const partStacks = parts ? Math.min(parts.partCap, held) : 0;
    const ownRate = Math.min(ownCastsPerSecond * perCast, maxAlive / life);
    const troopLife = 5 * baseDamage + sdInput.peril.lifePercent / 100 * sdInput.peril.playerLife;
    const troopShield = sdInput.peril.shieldPercent / 100 * sdInput.peril.playerShield;
    const heroicPercent = sdInput.heroic ? sdInput.heroic.percent * Math.floor((troopLife + troopShield) / sdInput.heroic.per + 1e-9) : 0;
    const attackSpeedLines = lines.speed.filter((line) => line.attack);
    const share = sdInput.essentialSharePercent / 100;
    const extraAdditional = [
      ...sdInput.additional.map((line) => ({ source: line.source, text: line.text, value: line.value })),
      ...(heroicPercent ? [{ source: "Heroic Sacrifice", text: `+${heroicPercent}% additional Self-Destruct damage (Synthetic Troop Life ${round(troopLife)}${troopShield ? ` + Energy Shield ${round(troopShield)}` : ""} ÷ ${sdInput.heroic.per}; Life = 5 × Base Damage${sdInput.peril.lifePercent || sdInput.peril.shieldPercent ? " + Peril of Synthetic Troops" : ""}, provisional)`, value: heroicPercent }] : []),
      ...(parts?.guerilla && guerillaStacks ? [{ source: "Guerilla Tactics", text: `+${round(parts.guerilla.damagePercent * guerillaStacks)}% additional Self-Destruct damage (${round(guerillaStacks)} Mechanical Parts collected recently)`, value: parts.guerilla.damagePercent * guerillaStacks }] : []),
      ...(parts && partStacks && parts.perPartPercent ? [{ source: "Unstoppable Wave", text: `+${round(parts.perPartPercent * partStacks)}% additional Minion Damage (${round(partStacks)} Mechanical Parts picked up recently)`, value: parts.perPartPercent * partStacks }] : []),
      ...(parts && partStacks > 0 && sdInput.moonPercent ? [{ source: "Charge Calling (Artificial Moon)", text: `+${sdInput.moonPercent}% additional Minion Damage (a Mechanical Part picked up recently)`, value: sdInput.moonPercent }] : []),
      ...(share ? attackSpeedLines.filter((line) => line.additional).map((line) => ({ source: `Essential Speed (${line.source})`, text: `+${round(share * line.value)}% additional Self-Destruct damage (${sdInput.essentialSharePercent}% of "${line.text}")`, value: share * line.value })) : [])
    ];
    const essentialIncreased = share ? attackSpeedLines.filter((line) => !line.additional).reduce((total, line) => total + line.value, 0) * share : 0;
    sdPlan = { perCast, maxAlive, castsPerSecond, castInterval, ownRate, fuel: Boolean(fuel), ignoresCooldown, life, rate, partsPerSecond: parts ? rate * parts.chancePercent / 100 * parts.perDrop : 0, partStacks, guerillaStacks, heroicPercent, troopLife, troopShield, essentialIncreased, capped: castsPerSecond * perCast > maxAlive / life + 1e-9,
      raw: { name: "Self-Destruct Protocol", role: "selfDestruct", kind: "hit", type: "Physical", baseType: "Physical", tags: [...KEYWORDS.selfDestruct.tags], noMultistrike: true,
        percentByLevel: Array(20).fill(KEYWORDS.selfDestruct.percent), addedEffectivenessByLevel: Array(20).fill(KEYWORDS.selfDestruct.percent), timing: { useTime: life, speedType: "fixed", cooldown: 0 },
        basis: "provisional", note: `${KEYWORDS.selfDestruct.source}; Charge Calling held (Q-H8 note: Trait Skill pressed on cooldown), ${round(rate)} explosions/s`, extraAdditional,
        extraIncreased: essentialIncreased ? [{ source: "Essential Speed", text: `+${round(essentialIncreased)}% Self-Destruct damage (${sdInput.essentialSharePercent}% of the Minion Attack Speed bonus)`, value: essentialIncreased }] : [] } };
  }
  const skills = [...resolved.skills, ...(sdPlan ? [sdPlan.raw] : [])].map((raw) => {
    // A buff-only skill (an Empower Skill without a damage row) takes the Minion's dealt type for its layers.
    const entry = raw.type ? raw : { ...raw, type: resolved.skills.find((item) => item.type)?.type || "Physical" };
    const percent = entry.percentByLevel?.[capped - 1] ?? 0;
    const addedEffectiveness = entry.kind === "hit" ? (entry.addedEffectivenessByLevel?.[capped - 1] ?? percent) : 0;
    const types = entry.conversion ? [entry.baseType, entry.type] : [entry.type];
    const added = lines.added.filter((line) => line.type === entry.baseType || line.type === entry.type).map((line) => ({ ...line, effectiveness: addedEffectiveness, value: (line.min + line.max) / 2 * addedEffectiveness / 100 }));
    const addedAverage = sum(added);
    const increased = [...lines.increased.filter((line) => typeApplies(line.type, types)), ...(entry.extraIncreased || [])];
    // Stage-dependent bonuses of a Spirit Magus skill (its own "When at Stage N or higher" lines).
    const stageBonus = entry.stageBonus ? entry.stageBonus(stage) : null;
    const stageAdditional = stageBonus?.additionalPercent ? [{ source: `${entry.name}: Stage ${stage}`, text: stageBonus.text, value: stageBonus.additionalPercent, origin: "skill" }] : [];
    const skillTags = new Set(entry.tags || []);
    const additional = [...lines.additional.filter((line) => typeApplies(line.type, types) && (!line.skillTag || skillTags.has(line.skillTag)) && (!line.skillRole || line.skillRole === entry.role)), ...levelLine, ...perMinionAdditional, ...(entry.extraAdditional || []).map((line) => ({ ...line, origin: "skill" })), ...stageAdditional];
    if (lines.onlyType.length && !lines.onlyType.some((line) => line.types.includes(entry.type))) additional.push({ source: lines.onlyType[0].source, text: `${lines.onlyType[0].text}: this ${entry.type} row deals 0`, value: -100, origin: "gear" });
    const penetration = lines.penetration.filter((line) => line.types.includes(entry.type));
    const increasedFactor = Math.max(0, 1 + sum(increased) / 100);
    const additionalFactor = product(additional);
    const resistancePercent = resistanceOf(entry.type);
    const penetrationPercent = sum(penetration);
    const resistanceFactor = Math.max(0, 1 - (resistancePercent - penetrationPercent) / 100);
    const armourPenetration = lines.armourPenetration;
    const armour = armourMitigationPercent({ physical: entry.type === "Physical", armourPercent, nonPhysicalArmourPercent, penetrationPercent: sum(armourPenetration) });
    const armourFactor = armour.factor;
    const taken = takenFactorFor(types);
    const base = baseDamage * percent / 100;
    const rawBuff = typeof entry.selfBuff === "function" ? entry.selfBuff(stage) : entry.selfBuff || null;
    // "Spirit Magi +X% additional Empower Skill Effect" (Source; core audit B7): the Magus's Empower Skill buff values × the factor.
    const empowerFactor = rawBuff && magus && skillTags.has("Empower") ? magus.empowerEffect.factor : 1;
    const selfBuff = rawBuff && empowerFactor !== 1 ? scaleBuff(rawBuff, empowerFactor, magus.empowerEffect.lines) : rawBuff;
    // `buff` is a combined active-buff object (combineBuffs) or null; `extraAdditionalPercent` a next-use bonus (Frost Release).
    // "+X% additional Max / Min Damage for Minions" (2026-10-14): the roll's upper / lower end (base + added flat) before it is
    // averaged; the Minion base is one value, so both ends start from it. A negative Min total floors at 0.
    const maxOnly = lines.maxDamage.filter((line) => typeApplies(line.type, types));
    const minOnly = lines.minDamage.filter((line) => typeApplies(line.type, types));
    const maxFactor = product(maxOnly), minFactor = Math.max(0, product(minOnly));
    const addedMin = added.reduce((total, line) => total + line.min * line.effectiveness / 100, 0), addedMax = added.reduce((total, line) => total + line.max * line.effectiveness / 100, 0);
    // Lucky (gear affix batch A): the added flat roll is the better of two, min + 2/3 (max − min).
    const luckyAdded = luckyCrit ? added.reduce((total, line) => total + (line.max - line.min) / 6 * line.effectiveness / 100, 0) : 0;
    const rollAverage = (maxOnly.length || minOnly.length ? ((base + addedMin) * minFactor + (base + addedMax) * maxFactor) / 2 : base + addedAverage) + luckyAdded;
    // `extraFlat`: added flat damage of a per-stack effect (Nature's Party's Rock Magus, B6), at the skill's added-damage effectiveness.
    const beforeTargetNoCrit = (buff, extraAdditionalPercent = 0, extraFlat = 0) => (rollAverage + extraFlat * addedEffectiveness / 100) * increasedFactor * additionalFactor * (buff?.additionalFactor ?? 1) * (1 + extraAdditionalPercent / 100);
    // Minion Double Damage (gear affix audit 2026-10-22): hits only, × (1 + min(100, Σ chance) / 100) as for the player's hits.
    const doubleChance = entry.kind === "hit" && !entry.buffOnly ? Math.min(100, Math.max(0, sum(lines.doubleDamage))) : 0;
    const doubleFactor = 1 + doubleChance / 100 * (lines.tripleDamage.length ? 2 : 1);
    const perHit = (buff, extraAdditionalPercent = 0, extraFlat = 0) => beforeTargetNoCrit(buff, extraAdditionalPercent, extraFlat) * critFactor(buff) * doubleFactor * taken.factor * armourFactor * resistanceFactor;
    const timing = entry.timing;
    const speed = timing?.speedType === "attack-speed" ? attackSpeedFactor : timing?.speedType === "cast-speed" ? castSpeedFactor : 1;
    // Minion Multistrike (core audit B7): an Attack-tagged hit skill with Minion Multistrike chance repeats like the player's
    // (TLIDB glossary: one extra attack per 100% chance, +20% Attack Speed during Multistrikes; the k-th repeat deals +k × increment,
    // provisional reading of "increasing damage"). One use deals the whole sequence (×damagePerCycle) and lasts its cycle
    // (×cycleIntervals use times). Mobility, Channeled and Sentry skills cannot Multistrike; no Minion skill carries those tags.
    const multistrike = msChance > 0 && entry.kind === "hit" && !entry.buffOnly && !entry.noMultistrike && skillTags.has("Attack") ? multistrikeSequence({ chancePercent: msChance, incrementPercent: msIncrement, incrementAdditionalPercent: msIncrementAdditional }) : null;
    const useTime = timing ? timing.useTime / speed * (multistrike?.cycleIntervals ?? 1) : null;
    if (!timing) warnings.push(`${resolved.minion}: ${entry.name} has no use time (no Split file linked and no TLIDB fallback), so it is left out of the cycle.`);
    if (entry.basis === "provisional") assumptions.push({ id: `minionSkill:${entry.name}`, value: "best case", text: `${entry.name}: ${entry.note}.` });
    if (stageBonus?.note) notes.push(`${entry.name}: ${stageBonus.note}`);
    const ownBuff = selfBuff ? combineBuffs([{ ...selfBuff, skill: entry.name }], entry.type) : null;
    return {
      name: entry.name, role: entry.role, kind: entry.kind, groupId: entry.groupId, type: entry.type, baseType: entry.baseType, converted: Boolean(entry.conversion), conversion: entry.conversion,
      buffOnly: Boolean(entry.buffOnly), doubleDamageChancePercent: doubleChance, doubleDamageFactor: doubleFactor, percent, addedEffectiveness, base, added, addedAverage, maxOnly, minOnly, maxFactor, minFactor, rollAverage, increased, additional, penetration, armourPenetration, armourPercent: armour.before, armourPenetrationPercent: armour.penetrationPercent, increasedFactor, additionalFactor, taken: taken.lines, takenFactor: taken.factor, armourFactor, resistancePercent, penetrationPercent, resistanceFactor,
      // A Multistrike sequence per use: the strikes' summed damage (each strike `hitsPerUse` hits).
      hitsPerUse: (stageBonus?.hitsPerUse ?? entry.hitsPerUse ?? 1) * (multistrike?.damagePerCycle ?? 1), multistrike: multistrike ? { ...multistrike, chancePercent: msChance, incrementPercent: msIncrement, incrementAdditionalPercent: msIncrementAdditional, strikesPerUse: 1 + multistrike.expectedExtraAttacks } : null, tags: [...skillTags], hitsBasis: entry.basis, hitsNote: entry.note, persistentSeconds: entry.persistentSeconds || null,
      selfBuff, timing, useTimeSeconds: timing?.useTime ?? null, effectiveUseTimeSeconds: useTime, cooldownSeconds: timing?.cooldown || 0, speedFactor: speed,
      perHitNoBuff: perHit(null), perHitBuffed: ownBuff ? perHit(ownBuff) : null, perHitBeforeTargetNoCrit: beforeTargetNoCrit(null),
      critChancePercent: critChance(null) * 100, critDamagePercent: critDamage(null) * 100, critFactor: critFactor(null),
      perHit, usesInCycle: 0, hitsInCycle: 0, damageInCycle: 0, increasedSum: sum(increased)
    };
  });

  // Cycle simulation: special skills when ready (longest cooldown first), the basic slot otherwise (Base Skill, replaced by
  // the Enhanced Skill at the Enhanced-skill chance as an expected-value blend); hits at the end of each use. Ultimates
  // (Full Bloom) stay out of the cycle.
  // The summon cast (the first use waits for it). "+X% Summon Skill Cast Speed" (Orders; core audit B7, src/minion-cores.js
  // summonCastSpeed) shortens it for every Summon-tag skill the player casts by hand: Summon Machine Guard, Grim Phantom, Spider Tank
  // and the Spirit Magi (user-supplied 2026-10-19, Google AI Mode answer, not tested in game; the Split's "fixed" flag on the Spirit
  // Magus and Grim Phantom summons does not exempt them). A Module summon is not in that list and its stone is not in the data (not
  // applied).
  const summonSpeedType = skillTimingSs13[resolved.summon]?.speedType || null;
  const summonCastBase = resolved.summonCastSeconds ?? 1;
  const summonCastScaled = summonSpeedType === "cast-speed" || ["synthetic-troop", "spirit-magus"].includes(resolved.family);
  const summonCastFactor = summonCastSpeed?.factor && summonCastSpeed.factor !== 1 && summonCastScaled ? summonCastSpeed.factor : 1;
  const summonCast = summonCastBase / summonCastFactor;
  if (summonCastFactor !== 1) notes.push(`${resolved.summon}: summon cast ${round(summonCastBase)} s ÷ ${round(summonCastFactor)} Summon Skill Cast Speed (${summonCastSpeed.sources.map((line) => line.source).join(", ")}) = ${round(summonCast)} s before the first use.`);
  // Bond ramp (prebuiltSelfBuffs off): each use takes the stacks held when it lands (damage) or starts (speed), against the full
  // stacks the layers above carry. The Bond crit-rating line stays at its full-stack value (provisional).
  const bondRamp = bondActive && !bond.prebuilt;
  const speedSums = { attack: sum(lines.speed.filter((line) => line.attack && !line.additional)), cast: sum(lines.speed.filter((line) => line.cast && !line.additional)) };
  const bondAdditional = (stacks) => product(bond.layersAt(stacks).filter((line) => line.kind === "additional"));
  const bondDamageRatio = (skill, at) => {
    if (!bondRamp) return 1;
    const stacks = bond.stacksAt(at, summonCast);
    if (stacks >= bond.maxStacks) return 1;
    const full = 1 + skill.increasedSum / 100, now = 1 + (skill.increasedSum - BOND.damagePerStack * (bond.maxStacks - stacks)) / 100;
    return Math.max(0, now) / Math.max(1e-9, full) * bondAdditional(stacks) / bondAdditional(bond.maxStacks);
  };
  const bondSpeedRatio = (skill, at) => {
    if (!bondRamp || !["attack-speed", "cast-speed"].includes(skill.timing?.speedType)) return 1;
    const stacks = bond.stacksAt(at, summonCast);
    if (stacks >= bond.maxStacks) return 1;
    const inc = skill.timing.speedType === "attack-speed" ? speedSums.attack : speedSums.cast;
    return Math.max(0.0001, 1 + (inc - BOND.speedPerStack * (bond.maxStacks - stacks)) / 100) / Math.max(0.0001, 1 + inc / 100);
  };
  const horizon = Math.max(timelineSeconds, 80);
  const specials = skills.filter((item) => item.role === "special" && item.effectiveUseTimeSeconds != null).sort((a, b) => b.cooldownSeconds - a.cooldownSeconds);
  const basic = skills.find((item) => item.role === "basic" && item.effectiveUseTimeSeconds != null) || null;
  const enhanced = skills.find((item) => item.role === "enhanced" && item.effectiveUseTimeSeconds != null) || null;
  const enhancedShare = enhanced && basic ? Math.max(0, Math.min(1, (magus?.enhancedChancePercent ?? 0) / 100)) : 0;
  // The Ultimate in the cycle (hero trait audit B6, provisional): unlocked for a Merged Magus in the Vigilant state (keyword
  // Vigilant) and in Full Bloom (Gentle Zephyr; keyword Full Bloom: "an initial cooldown of 8s"). Whirlwind Tango removes the
  // Merged Magus's cooldown: the Ultimate is then cast back to back only where it out-damages the Base / Enhanced slot per second
  // of use (the player controls the Merged Magus: best case). Soft Storm: the Magus cannot use it; every N Enhanced uses trigger it
  // (no use time) at its -X% additional Ultimate Damage.
  const ultimate = isSpiritMagus ? skills.find((item) => item.role === "ultimate" && item.effectiveUseTimeSeconds != null && item.percent > 0) || null : null;
  const fullBloomOn = Boolean(ultimate && nourish?.fullBloom);
  const softStorm = ultimate && vigilant?.softStorm?.every > 0 ? vigilant.softStorm : null;
  const ultimatePenalty = vigilant?.softStorm?.penaltyPercent ? -vigilant.softStorm.penaltyPercent : 0;
  const slotRate = basic ? ((1 - enhancedShare) * basic.perHitNoBuff * basic.hitsPerUse + (enhanced && enhancedShare > 0 ? enhancedShare * enhanced.perHitNoBuff * enhanced.hitsPerUse : 0)) / Math.max(1e-9, (1 - enhancedShare) * basic.effectiveUseTimeSeconds + (enhanced && enhancedShare > 0 ? enhancedShare * enhanced.effectiveUseTimeSeconds : 0)) : 0;
  const ultimateRate = ultimate ? ultimate.perHitNoBuff * ultimate.hitsPerUse / Math.max(1e-9, ultimate.effectiveUseTimeSeconds) : 0;
  let ultimatePlan = null;
  if (ultimate && vigilant && !vigilant.softStorm?.blocksUse) {
    const noCooldown = Boolean(vigilant.tango?.noCooldown);
    ultimatePlan = noCooldown && ultimateRate <= slotRate ? { mode: "unused", reason: `no cooldown (Whirlwind Tango), but ${ultimate.name} deals less per second of use (${round(ultimateRate)}) than the Base / Enhanced slot (${round(slotRate)}), so it is not cast back to back (best case)` }
      : { mode: "vigilant", cooldownSeconds: noCooldown ? 0 : vigilant.ultimateCooldownSeconds, reason: noCooldown ? `no cooldown (Whirlwind Tango): cast back to back (${round(ultimateRate)} vs ${round(slotRate)} per second of the slot)` : `unlocked in the Vigilant state, ${vigilant.ultimateCooldownSeconds} s cooldown (the Full Bloom keyword's initial cooldown; provisional)` };
  } else if (ultimate && vigilant?.softStorm?.blocksUse) ultimatePlan = { mode: softStorm && enhancedShare > 0 ? "triggered" : "unused", reason: softStorm && enhancedShare > 0 ? `Soft Storm: triggered once per ${softStorm.every} Enhanced uses (no use time), ${ultimatePenalty}% additional Ultimate Damage` : "Soft Storm: the Magi cannot use it, and no Enhanced use triggers it" };
  else if (fullBloomOn) ultimatePlan = { mode: "fullBloom", cooldownSeconds: KEYWORDS.fullBloom.ultimateCooldownSeconds, reason: `cast whenever ready while Full Bloom lasts (${KEYWORDS.fullBloom.ultimateCooldownSeconds} s initial cooldown, keyword Full Bloom${heroTraits?.nourish?.ultimateCdrPercent ? `; Gentle Zephyr +${heroTraits.nourish.ultimateCdrPercent}% additional Ultimate Cooldown Recovery Speed per Nourishment stack held at the cast` : ""})` };
  const ultimateSpecial = ultimatePlan && (ultimatePlan.mode === "vigilant" || ultimatePlan.mode === "fullBloom") ? { ...ultimate, role: "special", cooldownSeconds: ultimatePlan.cooldownSeconds, isUltimate: true } : null;
  if (ultimateSpecial) { specials.push(ultimateSpecial); specials.sort((a, b) => b.cooldownSeconds - a.cooldownSeconds); }
  const ready = new Map(specials.map((item) => [item.name, 0]));
  const buffs = [];
  const events = [];
  const persistentCoveredUntil = new Map();
  let nextUses = null; // { values: [...], until } from an Empower "next N uses" buff (Frost Release)
  let time = summonCast;
  let guard = 0;
  const activeAt = (at) => buffs.filter((buff) => buff.from <= at + 1e-9 && at < buff.until - 1e-9);
  const useTimeOf = (skill, at) => {
    const speedBuff = combineBuffs(activeAt(at), skill.type).attackSpeedAdditionalFactor;
    return (skill.timing?.speedType === "attack-speed" ? skill.effectiveUseTimeSeconds / speedBuff : skill.effectiveUseTimeSeconds) / bondSpeedRatio(skill, at);
  };
  // Nourishment on the Magus (src: the trait text above nourishmentState). Exact expected value over the stack count: a
  // probability vector over 0 … max stacks. Trait Skill casts grant their stacks (capped) when the Magus is out; every Magus
  // skill use deals ×(1 + effect × stacks) with the stacks it holds at the use (stacks add: the text gives no "multiply" rule,
  // provisional) and then loses one stack with chance min(1, Σ lose + Σ per-stack × stacks) (one summed chance, provisional).
  // All stacks end 15 s after the last gain (one shared duration refreshed on gain, provisional). Full Bloom (Gentle Zephyr) is
  // entered each time the total granted reaches a multiple of its threshold (B6; and at the start with own buffs built).
  const nourishPlus = nourish ? heroTraits?.nourish || null : null;
  const traitMode = nourish?.autoTrait ? "cooldown" : traitSkill;
  const nourishCap = nourish ? Math.max(1, Math.round(nourish.maxStacks || 10)) : 0;
  // Run With the Wind (B6): Windrider replaces the press: 3 Nourishment (+ the moon's extra stack, provisional) per full channel of
  // 5 × 0.33 s ÷ (1 + Cast Speed), no cooldown (keyword Windrider), channelled whenever the Trait Skill switch is on.
  const windrider = nourish && nourishPlus?.windrider ? nourishPlus.windrider : null;
  const nourishGain = !nourish ? 0 : windrider ? windrider.stacks + nourish.extraStacksPerTraitCast : nourish.stacksPerTraitCast + nourish.extraStacksPerTraitCast;
  // "100% of your Empower Skill Effect bonus is also applied to Spirit Magi's Nourishment" and Grow With Them's Origin share (B6):
  // the shared bonuses in one Nourishment Effect factor (src/moto-iris-traits.js; plain "+X% Empower Skill Effect" lines only).
  const nourishEffectFactor = nourishPlus?.effectFactor ?? 1;
  const nourishEffect = nourish && !nourish.noLossNoBonus ? nourish.effectPercent * nourishEffectFactor : 0;
  const traitCooldown = windrider ? windrider.intervalSeconds : nourish?.traitCooldownSeconds || 5;
  const traitCasts = !nourish || traitMode === "none" ? [] : traitMode === "summon" ? [0] : Array.from({ length: Math.ceil(horizon / traitCooldown) }, (_, index) => index * traitCooldown);
  // Nourishing Spring Rain on a Synthetic Troop (B6): its loss chance lowered by 2% per 1% of the Magi's Enhanced-skill chance.
  const lossReduction = troopNourish ? Math.max(0, troopNourish.reductionPercent || 0) : 0;
  let nourishDist = nourish ? Object.assign(new Array(nourishCap + 1).fill(0), { 0: 1 }) : null;
  let nourishNext = 0, nourishLastGain = -Infinity, nourishGained = 0, fullBloomCount = 0;
  const fullBloomEntries = [];
  if (fullBloomOn && heroTraits?.prebuilt !== false && traitMode !== "none") fullBloomEntries.push({ at: summonCast, until: summonCast + nourish.fullBloom.durationSeconds, prebuilt: true });
  const inFullBloom = (at) => fullBloomEntries.some((entry) => entry.at <= at + 1e-9 && at < entry.until - 1e-9);
  const nourishExpire = (at) => { if (nourishDist && at - nourishLastGain >= (nourish.durationSeconds ?? 15) - 1e-9 && nourishDist[0] < 1) nourishDist = Object.assign(new Array(nourishCap + 1).fill(0), { 0: 1 }); };
  const nourishGrants = (at) => {
    if (!nourishDist) return;
    // Grants land when the Magus is out (a Trait cast during the summon reaches it at its first use).
    while (nourishNext < traitCasts.length && traitCasts[nourishNext] <= at + 1e-9) {
      const castAt = Math.max(traitCasts[nourishNext++], summonCast);
      nourishExpire(castAt);
      const next = new Array(nourishCap + 1).fill(0);
      nourishDist.forEach((p, n) => { next[Math.min(nourishCap, n + nourishGain)] += p; });
      nourishDist = next; nourishLastGain = castAt; nourishGained += nourishGain;
      if (nourish.fullBloom && Math.floor(nourishGained / nourish.fullBloom.totalStacks + 1e-9) > fullBloomCount) {
        fullBloomCount = Math.floor(nourishGained / nourish.fullBloom.totalStacks + 1e-9);
        if (fullBloomOn || !fullBloomEntries.length) fullBloomEntries.push({ at: castAt, until: castAt + nourish.fullBloom.durationSeconds });
      }
    }
  };
  const nourishUse = (at, { ultimateCast = false } = {}) => {
    if (!nourishDist) return { factor: 1, stacks: 0 };
    nourishGrants(at);
    nourishExpire(at);
    const dist = nourishDist.slice();
    const stacks = dist.reduce((total, p, n) => total + p * n, 0);
    // Gentle Zephyr: no loss on non-Ultimates (B6: the Ultimate still rolls its loss).
    if (!nourish.noLossNoBonus || ultimateCast) {
      const next = new Array(nourishCap + 1).fill(0);
      nourishDist.forEach((p, n) => { const lose = n > 0 ? Math.min(1, Math.max(0, nourish.loseChancePercent + nourish.losePerStackPercent * n - lossReduction) / 100) : 0; next[n] += p * (1 - lose); if (n > 0) next[n - 1] += p * lose; });
      nourishDist = next;
    }
    return { factor: 1 + nourishEffect / 100 * stacks, stacks, dist };
  };
  // Nature's Party (revived, B6): Nourishment's per-Magus base effects per stack (Fire: crit, Rock: added Physical from Armor;
  // Thunder: Numbed and its Lightning bonus, Erosion: Deterioration, both settled after the cycle).
  const party = isSpiritMagus && nourish ? heroTraits?.party || null : null;
  const partyFire = party?.fire && resolved.key === "fire-magus" ? party.fire : null;
  const partyRock = party?.rock && resolved.key === "rock-magus" && party.rock.perStack > 0 ? party.rock : null;
  const nourishedDamage = (skill, combined, extraAdditionalPercent, nourishment) => {
    let total = 0;
    nourishment.dist.forEach((p, n) => {
      if (!(p > 0)) return;
      const buff = partyFire && n > 0 ? { ...(combined || { additionalFactor: 1, critRating: 0, critRatingPercent: 0, critDamagePercent: 0, attackSpeedAdditionalFactor: 1, labels: [] }), critRatingPercent: (combined?.critRatingPercent || 0) - partyFire.critRatingPerStack * n, critDamageFactor: (combined?.critDamageFactor ?? 1) * (1 + partyFire.critDamagePerStack * n / 100) } : combined;
      const flat = partyRock && n > 0 && (skill.type === "Physical" || skill.baseType === "Physical") ? partyRock.perStack * n : 0;
      total += p * skill.perHit(buff, extraAdditionalPercent, flat) * (1 + nourishEffect / 100 * n);
    });
    return total;
  };
  // Full Bloom (keyword): 50% of the Minion Attack / Cast Speed bonuses (increased and additional) as additional Spirit Magi Attack /
  // Spell Damage while it lasts; the Magus's skills take its speed type (attack-speed: Attack, cast-speed: Spell; provisional).
  const fullBloomShare = (skill) => {
    if (!fullBloomOn) return 1;
    const which = skill.timing?.speedType === "attack-speed" ? "attack" : "cast";
    const pool = speedSums[which] + sum(lines.speed.filter((line) => line[which] && line.additional));
    return 1 + KEYWORDS.fullBloom.speedSharePercent / 100 * pool / 100;
  };
  // Ramps when own buffs are not pre-built (B6): Machine's Joy's stacks from the Minion hits so far; a Merged Magus's Breeze from 5
  // on merging (t = 0), +1 per second and the Ultimate's gains.
  const overloadRamp = heroTraits?.overloadRamp && !heroTraits.overloadRamp.prebuilt ? heroTraits.overloadRamp : null;
  const breezeRamp = breeze && heroTraits?.prebuilt === false ? breeze : null;
  let hitsLanded = 0, ultimateCasts = 0;
  const rampRatio = (at) => {
    let ratio = 1;
    if (overloadRamp) ratio *= overloadRamp.ratioAt(Math.min(overloadRamp.maxStacks, hitsLanded));
    if (breezeRamp) ratio *= (1 + KEYWORDS.breeze.perStackPercent * vigilantBreezeAt(vigilant, breezeRamp.max, at, ultimateCasts) / 100) / (1 + KEYWORDS.breeze.perStackPercent * breezeRamp.max / 100);
    return ratio;
  };
  const land = (skill, at, weight, extraAdditionalPercent = 0, nourishment = { factor: 1, stacks: 0 }, landAtOverride = null) => {
    if (skill.buffOnly || !(skill.percent > 0)) return;
    const landAt = landAtOverride ?? at + useTimeOf(skill, at);
    const nourishTag = nourishDist ? { nourishmentStacks: nourishment.stacks, nourishmentFactor: nourishment.factor, nourishedShare: nourishment.dist ? 1 - (nourishment.dist[0] || 0) : 0 } : {};
    const bloom = fullBloomOn && inFullBloom(at) ? fullBloomShare(skill) : 1;
    const ramp = rampRatio(landAt);
    if (skill.kind === "persistent") {
      // One ground effect at a time (a recast refreshes it): ticks once per second over the assumed duration, only for
      // seconds not already covered by the previous cast. Nourishment ("damage dealt by this skill") lifts every tick.
      const ticks = Math.max(1, Math.round(skill.persistentSeconds || 1));
      const covered = persistentCoveredUntil.get(skill.name) ?? -Infinity;
      for (let tick = 0; tick < ticks; tick++) { const atTick = landAt + tick; if (atTick < horizon && atTick >= covered - 1e-9) events.push({ time: atTick, skill: skill.name, type: skill.type, damage: skill.perHit(null) * count * weight * nourishment.factor * bondDamageRatio(skill, atTick) * bloom * ramp, weight, buffed: false, ...nourishTag }); }
      persistentCoveredUntil.set(skill.name, landAt + ticks);
      return;
    }
    const active = activeAt(landAt).filter((buff) => buff.skill !== skill.name || buff.selfApplies !== false);
    const combined = active.length ? combineBuffs(active, skill.type) : null;
    const buffed = Boolean(combined && (combined.additionalFactor !== 1 || combined.critRating || combined.critRatingPercent || combined.critDamagePercent)) || extraAdditionalPercent > 0;
    const partyPerHit = Boolean((partyFire || partyRock) && nourishment.dist);
    events.push({ time: landAt, skill: skill.name, type: skill.type, damage: (partyPerHit ? nourishedDamage(skill, combined, extraAdditionalPercent, nourishment) * skill.hitsPerUse * count * weight : skill.perHit(combined, extraAdditionalPercent) * skill.hitsPerUse * count * weight * nourishment.factor) * bondDamageRatio(skill, landAt) * bloom * ramp, weight, buffed, buff: buffed ? combined?.labels.join(" + ") || "next-use bonus" : null, ...nourishTag });
    hitsLanded += skill.hitsPerUse * weight * count;
  };
  while (time < horizon && guard++ < 100000) {
    nourishGrants(time);
    const special = specials.find((item) => ready.get(item.name) <= time + 1e-9 && (!item.isUltimate || ultimatePlan.mode !== "fullBloom" || inFullBloom(time)));
    if (special) {
      const nourishment = nourishUse(time, { ultimateCast: Boolean(special.isUltimate) });
      // Gentle Zephyr: the Ultimate's cooldown recovers faster by +X% additional per Nourishment stack held at the cast.
      const cdr = special.isUltimate && ultimatePlan.mode === "fullBloom" ? 1 + (heroTraits?.nourish?.ultimateCdrPercent || 0) * nourishment.stacks / 100 : 1;
      ready.set(special.name, time + special.cooldownSeconds / cdr);
      if (special.selfBuff) {
        // A recast refreshes the skill's own buff (the Empower cooldown is shorter than its 6 s duration); it does not stack.
        for (const buff of buffs) if (buff.skill === special.name && buff.until > time) buff.until = time;
        buffs.push({ ...special.selfBuff, from: time, until: time + special.selfBuff.durationSeconds, skill: special.name });
        if (special.selfBuff.nextUses) nextUses = { values: [...special.selfBuff.nextUses], until: time + special.selfBuff.durationSeconds, skill: special.name };
      }
      land(special, time, 1, special.isUltimate ? ultimatePenalty : 0, nourishment);
      if (special.isUltimate) ultimateCasts += 1;
      special.usesInCycle += 1;
      // A zero-cooldown special (the Merged Magus's Ultimate with Whirlwind Tango) must still advance time.
      time += Math.max(1e-3, useTimeOf(special, time));
      continue;
    }
    if (!basic) {
      // Every skill is on cooldown and there is no filler: idle until the next one is ready.
      const next = Math.min(...specials.map((item) => ready.get(item.name)));
      if (!Number.isFinite(next) || next <= time) break;
      time = next;
      continue;
    }
    // Basic slot: the Base Skill, or the Enhanced Skill with the Enhanced-skill chance (expected-value blend of both casts).
    const bonus = nextUses && time < nextUses.until - 1e-9 && nextUses.values.length ? nextUses.values.shift() : 0;
    const baseWeight = 1 - enhancedShare;
    const slotNourishment = nourishUse(time); // one cast, one loss roll, whichever of the two skills it is
    if (baseWeight > 0) { land(basic, time, baseWeight, bonus, slotNourishment); basic.usesInCycle += baseWeight; }
    if (enhancedShare > 0) { land(enhanced, time, enhancedShare, bonus, slotNourishment); enhanced.usesInCycle += enhancedShare; }
    // Soft Storm (revived, B6): every N Enhanced uses trigger the Ultimate, landing with the Enhanced Skill (no use time).
    if (ultimatePlan?.mode === "triggered" && enhancedShare > 0) {
      const weight = enhancedShare / softStorm.every;
      land(ultimate, time, weight, ultimatePenalty, { factor: 1, stacks: 0 }, time + useTimeOf(enhanced, time));
      ultimateCasts += weight;
    }
    time += baseWeight * useTimeOf(basic, time) + (enhancedShare > 0 ? enhancedShare * useTimeOf(enhanced, time) : 0);
  }
  // Nature's Party (B6, provisional): the Thunder Magus Numbs the dummy on its Nourished hits (one stack per hit, at most one per
  // 0.2 s, 2 s each, up to 10: keyword Numbed), each stack +5% Lightning Damage taken on its Lightning hits (the Magus's own hits
  // here), and +2% additional Lightning Damage per Nourishment stack against the Numbed dummy; the Erosion Magus inflicts
  // Deterioration on its Nourished Erosion hits (60% of the Erosion damage dealt as True Damage when each 1 s stack ends; the
  // player's Deterioration lines are not the Minion's).
  let partySettled = null;
  if (party && (resolved.key === "thunder-magus" && party.thunder || resolved.key === "erosion-magus" && party.erosion)) {
    const steady = events.filter((event) => event.time >= 20 && event.time < horizon);
    const nourishedHits = steady.reduce((total, event) => total + (event.weight ?? 1) * (event.nourishedShare || 0), 0) / Math.max(1e-9, horizon - 20);
    if (resolved.key === "thunder-magus" && party.thunder) {
      const stacks = Math.min(10, Math.min(nourishedHits, 1 / party.thunder.intervalSeconds) * 2);
      for (const event of events) if (event.type === "Lightning") event.damage *= (1 + 0.05 * stacks) * (stacks > 0 ? 1 + party.thunder.percentPerStack * (event.nourishmentStacks || 0) / 100 : 1);
      partySettled = { magus: "Thunder", numbedStacks: round(stacks), nourishedHitsPerSecond: round(nourishedHits) };
    } else {
      for (const event of events) if (event.type === "Erosion") event.damage *= 1 + 0.6 * (event.nourishedShare || 0);
      partySettled = { magus: "Erosion", deteriorationShare: 0.6, nourishedHitsPerSecond: round(nourishedHits) };
    }
  }
  // Charge Calling (B6): the explosion loop replaces the troops' own attacks where it deals more (best case).
  if (sdPlan) {
    const sd = skills.find((item) => item.role === "selfDestruct");
    const perExplosion = sd.perHit(null);
    const loopDps = sdPlan.rate * perExplosion;
    const ownSteady = events.filter((event) => event.time >= 20 && event.time < horizon).reduce((total, event) => total + event.damage, 0) / (horizon - 20);
    sdPlan.perExplosion = perExplosion; sdPlan.loopDps = loopDps; sdPlan.ownDps = ownSteady; sdPlan.chosen = loopDps > ownSteady;
    if (sdPlan.chosen) {
      events.length = 0;
      const step = 1 / sdPlan.rate;
      for (let at = summonCast + sdPlan.life; at < horizon; at += step) events.push({ time: at, skill: sd.name, type: "Physical", damage: perExplosion, weight: 1, buffed: false });
      for (const item of skills) item.usesInCycle = 0;
    }
  }
  events.sort((a, b) => a.time - b.time);
  // Synthetic Troop ramp (own buffs not pre-built): one summon (+ Rally) per max(summon cast, its cooldown) from the first one (a
  // module: 4 s cooldown; Machine Guard / Spider Tank: none (Split cooldown 0); Grim Phantom: one every 1 s by itself), so the
  // 5 s / 20 s windows see fewer Minions; the steady window (from 20 s) is at the max.
  if (troopCount && !prebuilt && !sdPlan?.chosen && count > troopCount.perCast) {
    const interval = resolved.autoSummonSeconds || Math.max(summonCast, resolved.family === "module" ? resolved.summonCooldownSeconds || 0 : skillTimingSs13[resolved.summon]?.cooldown || 0);
    const outAt = (at) => Math.min(count, troopCount.perCast * (1 + Math.floor(Math.max(0, at - summonCast) / interval + 1e-9)));
    for (const event of events) event.damage *= outAt(event.time) / count;
    troopCount.rampIntervalSeconds = interval;
    troopCount.fullAt = summonCast + Math.ceil(count / troopCount.perCast - 1) * interval;
  }
  const windowAverage = (seconds) => events.filter((event) => event.time < seconds).reduce((total, event) => total + event.damage, 0) / seconds;
  const steadyFrom = 20, steadyTo = horizon;
  const steadyDps = events.filter((event) => event.time >= steadyFrom && event.time < steadyTo).reduce((total, event) => total + event.damage, 0) / (steadyTo - steadyFrom);
  const perSkill = skills.map((item) => {
    const own = events.filter((event) => event.skill === item.name && event.time >= steadyFrom && event.time < steadyTo);
    const dps = own.reduce((total, event) => total + event.damage, 0) / (steadyTo - steadyFrom);
    const uses = own.reduce((total, event) => total + (event.weight ?? 1), 0);
    return { ...item, perHit: undefined, steadyDps: dps, steadyUsesPerSecond: (item.kind === "persistent" ? own.length : uses) / (steadyTo - steadyFrom), buffedShare: uses ? own.filter((event) => event.buffed).reduce((total, event) => total + (event.weight ?? 1), 0) / uses : 0, inCycle: sdPlan?.chosen ? item.role === "selfDestruct" : item.role === "basic" || item.role === "special" || (item.role === "enhanced" && enhancedShare > 0) || (item.role === "ultimate" && ultimateCasts > 0) };
  });
  // Typed and tag-scoped Minion lines no damage skill of the cycle takes (a Cold line on a Fire Minion, an Area line on a projectile
  // Minion) and Multistrike lines with no Multistrike: listed as inactive with the reason, not as applied (core audit B7).
  const usedSkills = perSkill.filter((item) => item.inCycle && !item.buffOnly && item.percent > 0);
  for (const key of ["increased", "additional"]) {
    lines[key] = lines[key].filter((line) => {
      if (!line.type && !line.skillTag && !line.skillRole) return true;
      if (usedSkills.some((item) => (item[key] || []).includes(line))) return true;
      lines.inactive.push({ ...line, reason: line.skillRole ? `no ${line.skillRole === "ultimate" ? "Ultimate" : "Enhanced Skill"} of the ${resolved.minion} in its cycle` : line.skillTag ? `no ${line.skillTag} skill of the ${resolved.minion} in its cycle` : `the ${resolved.minion} deals no ${line.type} damage` });
      return false;
    });
  }
  const multistrikes = usedSkills.some((item) => item.multistrike);
  if (!multistrikes) for (const key of ["multistrikeChance", "multistrikeIncrement", "multistrikeIncrementAdditional"]) {
    lines.inactive.push(...lines[key].map((line) => ({ ...line, reason: msChance > 0 ? `the ${resolved.minion} has no Attack skill in its cycle (Multistrike is for Attacks)` : "no Minion Multistrike chance" })));
    lines[key] = [];
  }
  if (multistrikes) notes.push(`${resolved.minion}: Minion Multistrike ${round(msChance)}% → ${round(msChance / 100)} extra attacks per attack at +${round(msIncrement * (1 + msIncrementAdditional / 100))}% increasing damage each on its Attack skills (${usedSkills.filter((item) => item.multistrike).map((item) => `${item.name} ×${round(item.multistrike.damagePerCycle)} damage per use over ${round(item.multistrike.cycleIntervals)} use times`).join(", ")}; TLIDB glossary, provisional reading as for the player).`);
  const slotLabel = basic ? (enhanced && enhancedShare > 0 ? `${basic.name} (${round((1 - enhancedShare) * 100)}%) or ${enhanced.name} (${round(enhancedShare * 100)}%, ${round(enhanced.effectiveUseTimeSeconds)} s use) every ${round(basic.effectiveUseTimeSeconds)} s` : `${basic.name} every ${round(basic.effectiveUseTimeSeconds)} s`) : "no basic skill";
  const cycle = {
    summonCastSeconds: summonCast, summonCastSource: resolved.summonCastSource || null, summonCastBaseSeconds: summonCastBase, summonSpeedType, summonCastFactor,
    bond: bondActive ? { maxStacks: bond.maxStacks, intervalSeconds: bond.intervalSeconds, prebuilt: bond.prebuilt, fullAt: bond.prebuilt ? summonCast : summonCast + bond.maxStacks * bond.intervalSeconds } : null,
    rule: sdPlan?.chosen ? `Charge Calling held: ${round(sdPlan.rate)} Self-Destruct Protocol explosions/s (${sdPlan.fuel ? `Fuel War with War triggers the summon every ${round(sdPlan.castInterval)} s` : `the summon recast every ${round(sdPlan.castInterval)} s`}, ${sdPlan.perCast} troops per cast, at most ${sdPlan.maxAlive} alive for ${round(sdPlan.life)} s each${sdPlan.capped ? ": the alive cap binds" : ""}); the first explosion ${round(sdPlan.life)} s after the ${summonCast} s summon cast` : `${specials.length ? `${specials.map((item) => `${item.name} (${round(item.effectiveUseTimeSeconds)} s use, ${item.cooldownSeconds} s cooldown)`).join(", ")} whenever ready, otherwise ` : ""}${slotLabel}; hits land at the end of each use; the first use starts after the ${summonCast} s summon cast`,
    firstHitSeconds: events[0]?.time ?? null, enhancedShare
  };
  assumptions.push({ id: `minionCycle:${resolved.key}`, value: "deterministic", text: `${resolved.minion} use pattern: ${cycle.rule} (assumed AI; in range of the stationary dummy the whole time).` });
  if (resolved.summonCooldownSeconds && specials.some((item) => item.cooldownSeconds && item.cooldownSeconds !== resolved.summonCooldownSeconds)) notes.push(`${resolved.summon}: the module tooltip's Cooldown ${resolved.summonCooldownSeconds} s is read as the summon's own cooldown; the special skill uses its Split cooldown (${specials.map((item) => `${item.name} ${item.cooldownSeconds} s`).join(", ")}).`);
  // Nourishment summary over the steady window: damage-weighted factor and the stacks held at each use.
  let nourishment = null;
  if (nourish) {
    const steadyEvents = events.filter((event) => event.time >= steadyFrom && event.time < steadyTo && event.nourishmentFactor);
    const lifted = steadyEvents.reduce((total, event) => total + event.damage, 0);
    const bare = steadyEvents.reduce((total, event) => total + event.damage / event.nourishmentFactor, 0);
    const uses = steadyEvents.reduce((total, event) => total + (event.weight ?? 1) * event.nourishmentStacks, 0) / Math.max(1e-9, steadyEvents.reduce((total, event) => total + (event.weight ?? 1), 0));
    nourishment = {
      mode: traitMode, autoTrait: nourish.autoTrait, activeAsTrait: nourish.activeAsTrait, traitCastSeconds: traitCasts.filter((at) => at < timelineSeconds),
      stacksPerTraitCast: nourishGain, traitCooldownSeconds: traitCooldown, effectPercent: nourish.effectPercent, effectivePercent: nourishEffect, durationSeconds: nourish.durationSeconds, maxStacks: nourishCap,
      loseChancePercent: nourish.loseChancePercent, losePerStackPercent: nourish.losePerStackPercent, noLossNoBonus: nourish.noLossNoBonus, empowerSharePercent: nourish.empowerSharePercent,
      steadyAverageStacks: uses, steadyFactor: bare ? lifted / bare : 1,
      fullBloom: nourish.fullBloom ? { ...nourish.fullBloom, entries: fullBloomEntries } : null, windrider: windrider ? { ...windrider } : null, effectFactor: nourishEffectFactor, lossReductionPercent: lossReduction, troop: Boolean(troopNourish),
      sources: nourish.sources
    };
    const modeText = traitMode === "cooldown" ? `the Trait Skill is cast whenever off cooldown (every ${traitCooldown} s from the summon cast${nourish.autoTrait ? "; auto-triggered by the trait" : "; best case, flip with the \"Trait Skill on cooldown\" combat condition"})` : traitMode === "summon" ? "only the summon cast counts as a Trait Skill cast (open: whether the Magus it creates receives the stacks)" : "the Trait Skill is never cast (no Nourishment)";
    assumptions.push({ id: `nourishment:${resolved.key}`, value: traitMode, text: `${resolved.minion} Nourishment (Iris – Growing Breeze): ${modeText}; ${nourishGain} stacks per Trait Skill cast (cap ${nourishCap}, ${nourish.durationSeconds} s); ${nourish.noLossNoBonus ? "no loss and no damage bonus (Gentle Zephyr)" : `+${round(nourishEffect)}% additional damage per stack on each Magus skill use (stacks add, provisional); each use then loses a stack with chance ${round(nourish.loseChancePercent)}% + ${round(nourish.losePerStackPercent)}% per stack held (one summed roll, provisional)`}; steady state ${round(uses)} stacks per hit on average, damage ×${round(nourishment.steadyFactor)}.` });
  }
  // Hero trait audit B6: Charge Calling, the Ultimate in the cycle, Windrider.
  if (sdPlan) assumptions.push({ id: `selfDestruct:${resolved.key}`, value: sdPlan.chosen ? "explosions" : "own attacks", text: `${resolved.minion} with Charge Calling held (6 s / 6 s, the Trait Skill pressed on cooldown; provisional): ${round(sdPlan.rate)} Self-Destruct Protocol explosions/s × ${round(sdPlan.perExplosion)} = ${round(sdPlan.loopDps)} DPS vs ${round(sdPlan.ownDps)} DPS from its own attacks: ${sdPlan.chosen ? "the explosion loop is kept (best case)" : "its own attacks are kept (best case: the explosions deal less)"}${sdPlan.partStacks ? `; ${round(sdPlan.partStacks)} Mechanical Parts picked up recently (${round(sdPlan.partsPerSecond)}/s × ${RECENT_SECONDS} s)` : ""}.` });
  if (ultimatePlan) notes.push(`${resolved.summon}: ${ultimate.name} (Ultimate, ${round(ultimate.perHitNoBuff)} per hit): ${ultimatePlan.reason}.`);
  if (windrider) notes.push(`${resolved.summon}: Windrider (Run With the Wind) replaces the Trait Skill press: ${nourishGain} Nourishment per full channel every ${round(windrider.intervalSeconds)} s (5 × 0.33 s ÷ (1 + ${round(windrider.castSpeedPercent)}% Cast Speed); keyword Windrider; provisional).`);
  for (const item of skills.filter((entry) => entry.role === "ultimate" && !ultimatePlan)) notes.push(`${resolved.summon}: ${item.name} is the Ultimate (${round(item.perHitNoBuff)} per hit at this level) and needs Full Bloom, which only The Forsaken Iris – Growing Breeze grants (manual rule 1001012027); ${nourishment?.fullBloom ? (fullBloomEntries.length ? `Full Bloom starts at ${round(fullBloomEntries[0].at)} s (${nourishment.fullBloom.totalStacks} Nourishment stacks gained in total) for ${nourishment.fullBloom.durationSeconds} s, but the Ultimate's cooldown is unpublished, so it` : `this build's Full Bloom line (${nourishment.fullBloom.totalStacks} stacks gained in total) is not reached, so it`) : nourish ? "this build has no Full Bloom line (the Lv.60 trait Gentle Zephyr), so it" : "it"} is not in the cycle.`);
  if (enhanced && enhancedShare === 0) notes.push(`${resolved.summon}: ${enhanced.name} (Enhanced Skill, ${round(enhanced.perHitNoBuff)} per hit) is never used at a ${round(magus?.enhancedChancePercent ?? 0)}% Enhanced-skill chance.`);
  for (const line of lines.unread) notes.push(`${resolved.minion}: "${line.text}" (${line.source}) is not applied.`);
  const traitLinesUsed = traitLines.filter((line) => classifyMinionLine(line.text)).map((line) => ({ source: line.source, text: clean(line.text) }));
  const key = `minion:${resolved.key}`;
  return {
    key, minionKey: resolved.key, name: resolved.minion, summon: resolved.summon, family: resolved.family, level: effectiveLevel, baseLevel: capped,
    setupKeys: setups.map((setup) => setup.setupKey), setupNames: setups.map((setup) => setup.name),
    baseDamage, baseDamageSource: resolved.family === "module" ? "shared Minion table; Lv.1 = 10 and Lv.20 = 300 confirmed in game on module tooltips (2026-10-11)" : "TLIDB summon Minion table (damage column)", levelFactor,
    count, countSource: resolved.count?.source || null, troopCount: troopCount ? { max: troopCount.max, base: troopCount.base, perCast: troopCount.perCast, off: troopCount.off, raisedBy: troopCount.raise, cappedBy: troopCount.caps, rampIntervalSeconds: troopCount.rampIntervalSeconds ?? null, fullAtSeconds: troopCount.fullAt ?? null } : null,
    magus: magus ? { growth: magus.growth, stage: magus.stage, enhancedChancePercent: magus.enhancedChancePercent, fixedChance: magus.fixedChance, growthRule: magus.growthRule, chanceRule: magus.chanceRule, sources: magus.sources, fullBloom: Boolean(fullBloomEntries.length), nourishment,
      initialGrowthMatters: magus.initialGrowthMatters, circle: magus.circle, ultimateSpeed: magus.ultimateSpeed, empowerEffect: { ...magus.empowerEffect, applied: magus.empowerEffect.factor !== 1 && skills.some((item) => item.selfBuff?.empowerEffectFactor) } } : null,
    lines: { increased: lines.increased, additional: lines.additional, speed: lines.speed, critRating: lines.critRating, critDamage: lines.critDamage, penetration: lines.penetration, armourPenetration: lines.armourPenetration, added: lines.added, doubleDamage: lines.doubleDamage, lucky: lines.lucky, unread: lines.unread, inactive: lines.inactive, trait: traitLinesUsed, support: lines.support, ...(multistrikes ? { multistrikeChance: lines.multistrikeChance, multistrikeIncrement: lines.multistrikeIncrement, multistrikeIncrementAdditional: lines.multistrikeIncrementAdditional } : {}), ...(lines.maxDamage.length ? { maxDamage: lines.maxDamage } : {}), ...(lines.minDamage.length ? { minDamage: lines.minDamage } : {}) },
    speeds: { attackSpeedFactor, castSpeedFactor },
    crit: { rating: critRating(null), chancePercent: critChance(null) * 100, damagePercent: critDamage(null) * 100, factor: critFactor(null), baseRating: baseCritRating, baseDamagePercent: baseCritDamage, ...(extraCritOnly.length ? { critOnlyFactor, critOnlySources: extraCritOnly } : {}) },
    skills: perSkill, cycle, events: events.filter((event) => event.time < timelineSeconds),
    combat: { dps: steadyDps, perMinionDps: steadyDps / Math.max(1, count), fiveSecondAverageDps: windowAverage(windows[0] ?? 5), twentySecondAverageDps: windowAverage(windows[1] ?? 20) },
    town: { dps: 0, note: "the character panel reads 0 for summon skills (user, 2026-10-11)" },
    notes, warnings, assumptions, modeled: steadyDps > 0,
    // Hero trait audit B6 (src/moto-iris-traits.js): what the Moto / Iris inputs did on this Minion (the module badges read it).
    heroTraits: heroTraits ? {
      ...heroTraitState, overload: Boolean(heroTraits.overload), ultimate: ultimatePlan ? { ...ultimatePlan, name: ultimate.name, casts: round(ultimateCasts) } : null,
      selfDestruct: sdPlan ? { chosen: sdPlan.chosen, rate: sdPlan.rate, perExplosion: sdPlan.perExplosion, loopDps: sdPlan.loopDps, ownDps: sdPlan.ownDps, perCast: sdPlan.perCast, maxAlive: sdPlan.maxAlive, castsPerSecond: sdPlan.castsPerSecond, castInterval: sdPlan.castInterval, ownRate: sdPlan.ownRate, fuel: sdPlan.fuel, ignoresCooldown: sdPlan.ignoresCooldown, capped: sdPlan.capped, life: sdPlan.life, partStacks: sdPlan.partStacks, guerillaStacks: sdPlan.guerillaStacks, partsPerSecond: sdPlan.partsPerSecond, heroicPercent: sdPlan.heroicPercent, troopLife: sdPlan.troopLife, troopShield: sdPlan.troopShield, essentialIncreased: sdPlan.essentialIncreased, essentialAdditional: (sdPlan.raw.extraAdditional || []).filter((line) => /^Essential Speed/.test(line.source)).length } : null,
      party: partySettled, partyFire: Boolean(partyFire), partyRock: Boolean(partyRock), fullBloom: fullBloomOn ? { entries: fullBloomEntries.length, shareActive: fullBloomShare(basic || ultimate) !== 1 } : null, windrider: Boolean(windrider),
      nourishEffectFactor, troopNourish: Boolean(troopNourish && nourish), lossReduction, overloadRamp: Boolean(overloadRamp), breezeRamp: Boolean(breezeRamp)
    } : null,
    sources: { base: "src/minion-base-damage.js (TLIDB Minion table; in-game module tooltips)", rows: "src/data/skills/minion-skill-damage-ss13.generated.js (config_skill_damage)", timing: "src/data/skills/skill-timing-ss13.generated.js (SkillEditor Split)" }
  };
}

/**
 * Group active Minion-skill damage sources by Minion: one calculation per Minion type however many of its skills are set up.
 * @param {{ name, setupKey, status, profile }[]} damageSources collectSkillDamageSources output
 */
export function groupMinionSources(damageSources = []) {
  const groups = new Map();
  for (const source of damageSources) {
    if (source.status !== "modeled" || source.profile?.engine !== "minion") continue;
    const key = source.profile.minionKey;
    if (!groups.has(key)) groups.set(key, { profile: MINION_PROFILES[key], sources: [] });
    groups.get(key).sources.push(source);
  }
  return [...groups.values()];
}
