// Rosa (High Court Chariot, Unsullied Blade): hero trait audit batch B11 (2026-10-19; research/hero-traits-audit-2026-10-19.md §5 B11,
// §8 B11, §6 Q-H7). Pure: reads the build's trait lines (origin "trait"), the hero-exclusive revived lines the module reads
// (src/hero-exclusive-revivals.js MODULE_LINES: Between the Holy Land and Hell, Mercury Purged) and the rates the planner's hit pass
// measured (src/planner.js hitRateFacts.rosa), and returns
//   - rosaState: the Holy Domain / Murderous Intent state (High Court Chariot) or the Mystic Mercury / Realm of Mercury cycle
//     (Unsullied Blade), the best-case switches and the recount assumptions;
//   - rosaLineRead: one clause's status, reason and derived bodies (src/hero-trait-modules.js "holyDomain" / "mercury");
//   - mercuryBaptismSource: Mercury Baptism's True Damage from the modeled hits (src/planner.js damage paths and recount).
//
// Sourced:
// - Trait texts (TLIDB, SS14; src/data/heroes/all-hero-traits-ss13.generated.js) and the game tier records (audit §4.3).
// - TLIDB keyword tooltips (Torchlight_Hyperlink_hover, fetched 2026-10-19, research/tlidb-ss14/fetch-cache/): Murderous Intent
//   (17bf2069: "The base upper limit of Murderous Intent is 100"), Holy Domain (91a4c738: "automatically closes 1s after you leave the
//   Holy Domain"; radius 5 m), No Guard (f80f8e20: "+10% additional damage taken"; "Channeled stacks lost increase the effect of No
//   Guard, with the first 2 stacks lost increasing its effect by 100%, and each additional stack lost further increasing its effect by
//   100%"), Block Ratio (d7d85a46: "By default, Blocking absorbs 30% damage"), Block Ratio Upper Limit (5a1071c9: "60% by default and
//   can be increased to a maximum of 80%"), Enemy Count (4561e72f, the link on "each enemy" / "every enemy": "Each Boss counts as 5
//   monsters"), Mystic Mercury (2924f842: "Attempts to consume 10% of Unsealed Max Mana when using a non-Channeled Attack Skill. If
//   the Mana is consumed successfully, grants 10 Mercury Pts. When there is insufficient Mana, consumes 1% of Unsealed Max Mana and
//   grants 5 Mercury"), Realm of Mercury (23d03bff: "For every 10% Unsealed Max Mana you have, +2% additional Attack Speed and +2%
//   additional Elemental Damage. Restores 15% of Unsealed Max Mana when using a non-Channeled Attack Skill"), Mercury Baptism
//   (6c0bb25a: "Deals True Damage based on the damage recorded by Realm of Mercury to all enemies within it once and clears the
//   record"), Fire / Cold / Lightning Infiltration (07594c72 / a40b3b4e / a894aabc: +13% <type> Damage taken), Repent to the Light
//   (b0359042: self attack every 2 casts, "For every 1 attack(s) blocked when in the Holy Domain, +1% Block Ratio and Block Ratio Upper
//   Limit. Stacks up to 15 time(s)"), Baptism: Rage / Indolent / Impassive (4d2572e0 / b4ebd618 / befcad04: "+30% additional damage on
//   Critical Strike" / "+30% additional Max Damage" / "+60% Skill Area", each with a -30% additional <type> Damage taken on you).
// - Game data (config_char_field, SS14, read only): 2501100 Murderous Intent upper limit 100; 2501122 Mercury Pts upper limit 100;
//   2006460 Block Ratio 30.
//
// Provisional readings (src/open-questions.js, shown only for Rosa):
// - Q-H7 (kept, recommended reading): the Holy Domain is held at uptime 1 (a recast every 3.75 s from 4 Murderous Intent per second
//   would hold it if it lasts at least 3.75 s; the keyword says it closes 1 s after you leave it, so standing in it keeps it).
// - Murderous Intent level (best-case switch `rosaIntentHeld`, default on): the Domain is cast once and held, so Murderous Intent fills
//   to its max (Divine Intervention reads the max); Desperation's channel consumes none. Off: cast whenever 15 are ready, so the level
//   averages 15 ÷ 2.
// - Enemy count (best-case switch `rosaBossEnemyCount`, default on): the dummy is a Boss and counts as 5 enemies (Enemy Count keyword)
//   for Unbreakable Stand and Boundless Sanctuary. Off: 1.
// - Blocks: the dummy never attacks; the block-driven lines (Improvision's stacks at their cap, Repent to the Light's 15 Block Ratio
//   stacks) follow the "Hit or blocked recently" best case (user rule 2026-10-12).
// - No Guard (Desperation): held on the dummy at uptime 1 (the channel recasts the Domain at 2 stacks, inside 8 s); its effect = 10% ×
//   (1 + 100% for the 2 stacks lost + "No Guard Effect" lines) × (1 + per-1% × Block Ratio); the time spent channeling is not taken
//   from the attacks.
// - Mercury cycle (Unsullied Blade): Mystic Mercury's Mana cost and Pts per non-Channeled Attack use at the measured use rate; Realm of
//   Mercury drains 30 Pts/s, Mercury Baptism adds its Pts every 0.5 s, each use restores 15% Mana (× Born to Cleanse's -30%); Mystic
//   Mercury grants no Pts and costs no Mana inside the Realm (Born to Cleanse keeps only its damage effects at 40%); Utmost Devotion's
//   "10% Mercury Pts" is 10% of Max Mercury Pts per 2600 Mana consumed, Mystic Mercury's consumption included (skill Mana costs are not
//   in the planner). Each bonus is time-averaged over the cycle (the 5 s / 20 s windows use the same average); the rate is the one the
//   hit pass measured without the Realm's own Attack Speed.
// - Mercury Baptism: every 0.5 s in the Realm it re-deals X% of the non-Channeled Attack Elemental Hit Damage dealt (after the dummy's
//   mitigation) since the last Baptism, as True Damage; the Infiltration of the largest recorded type is held for the Realm's time share.
// - Mercury Purged: each Baptism buff is held while the build keeps that ailment on the dummy (every infliction refreshes its 8 s).

import { normalizePercentageText } from "./percentage-text.js";

export const CHARIOT = "rosa-high-court-chariot";
export const UNSULLIED = "rosa-unsullied-blade";
export const ROSA_HEROES = new Set([CHARIOT, UNSULLIED]);
export const INTENT_HELD_SWITCH = "rosaIntentHeld";
export const BOSS_COUNT_SWITCH = "rosaBossEnemyCount";
export const BAPTISM_KEY = "rosa:mercuryBaptism";
export const KEYWORDS = Object.freeze({
  murderousIntent: Object.freeze({ max: 100, source: "TLIDB keyword Murderous Intent (hover 17bf2069): the base upper limit is 100; config_char_field 2501100 (default 100)" }),
  holyDomain: Object.freeze({ radiusMeters: 5, closesAfterLeavingSeconds: 1, source: "TLIDB keyword Holy Domain (hover 91a4c738): closes 1 s after you leave it; radius 5 m, not affected by Skill Area" }),
  noGuard: Object.freeze({ takenPercent: 10, firstStacksLost: 2, perStackLostPercent: 100, source: "TLIDB keyword No Guard (hover f80f8e20): +10% additional damage taken; the first 2 channeled stacks lost raise its effect by 100%, each further stack by 100%" }),
  blockRatio: Object.freeze({ base: 30, upperLimit: 60, hardCap: 80, source: "TLIDB keywords Block Ratio (hover d7d85a46: 30% by default; config_char_field 2006460) and Block Ratio Upper Limit (hover 5a1071c9: 60% by default, at most 80%)" }),
  enemyCount: Object.freeze({ boss: 5, source: "TLIDB keyword Enemy Count (hover 4561e72f, linked from \"each enemy\" / \"every enemy\"): each Boss counts as 5 monsters" }),
  mysticMercury: Object.freeze({ costPercent: 10, pts: 10, lowCostPercent: 1, lowPts: 5, source: "TLIDB keyword Mystic Mercury (hover 2924f842): 10% of Unsealed Max Mana per non-Channeled Attack Skill use for 10 Mercury Pts; with too little Mana, 1% for 5" }),
  realm: Object.freeze({ perTenPercentMana: 2, restorePercent: 15, source: "TLIDB keyword Realm of Mercury (hover 23d03bff): +2% additional Attack Speed and +2% additional Elemental Damage per 10% Unsealed Max Mana; restores 15% Unsealed Max Mana per non-Channeled Attack Skill use" }),
  mercuryPts: Object.freeze({ max: 100, source: "config_char_field 2501122 (Mercury Realm value upper limit, default 100)" }),
  baptism: "TLIDB keyword Mercury Baptism (hover 6c0bb25a): True Damage based on the damage the Realm recorded, once, clearing the record",
  infiltration: Object.freeze({ takenPercent: 13, source: "TLIDB keywords Fire / Cold / Lightning Infiltration (hovers 07594c72 / a40b3b4e / a894aabc): +13% additional <type> Damage taken" }),
  repent: Object.freeze({ blockRatioPerBlock: 1, maxStacks: 15, source: "TLIDB keyword Repent to the Light (hover b0359042): a fixed 10 Physical self attack every 2 skill casts (0.1 s interval); +1% Block Ratio and Block Ratio Upper Limit per attack blocked in the Holy Domain, up to 15 stacks" }),
  baptisms: Object.freeze({
    Rage: Object.freeze({ ailment: "Ignite", body: "+30% additional damage on Critical Strike", source: "TLIDB keyword Baptism: Rage (hover 4d2572e0): -30% additional Fire Damage taken and +30% additional damage on Critical Strike" }),
    Indolent: Object.freeze({ ailment: "Numbed", body: "+30% additional Max Damage", source: "TLIDB keyword Baptism: Indolent (hover b4ebd618): -30% additional Lightning Damage taken and +30% additional Max Damage" }),
    Impassive: Object.freeze({ ailment: "Frostbite", body: "+60% Skill Area", source: "TLIDB keyword Baptism: Impassive (hover befcad04): -30% additional Cold Damage taken and +60% Skill Area" })
  })
});
const EPS = 1e-9;
const ELEMENTAL = ["Fire", "Cold", "Lightning"];
const round = (value) => Math.round(value * 10000) / 10000;
const pct = (value) => Math.round(value * 10000) / 100;
const fmt = (value) => Number.isFinite(value) ? String(round(value)) : "∞";
export const cleanRosa = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").replace(/(\d) %/g, "$1%").replace(/ ([,.:;])/g, "$1").replace(/^([+-]) (\d)/, "$1$2").trim();

const N = "(\\d+(?:\\.\\d+)?)";
export const ROSA_PATTERNS = Object.freeze({
  // High Court Chariot.
  regen: new RegExp(`^Restores ${N} Murderous Intent per second$`, "i"),
  blockGain: new RegExp(`^Restores ${N} Murderous Intent when Blocking$`, "i"),
  cast: new RegExp(`^When having at least ${N} Murderous Intent, you can cast the Trait Skill and consume ${N} Murderous Intent to create a Holy Domain`, "i"),
  inside: new RegExp(`^While inside the Holy Domain, \\+${N}% additional damage$`, "i"),
  moonRadius: new RegExp(`^For every ${N} Murderous Intent you currently have, \\+${N}% Holy Domain radius and \\+${N}% Attack and Spell Block Chance$`, "i"),
  stand: new RegExp(`^\\+${N}% additional damage for each enemy in the Holy Domain, up to \\+${N}% additional damage$`, "i"),
  advanceSpeed: new RegExp(`^\\+${N}% Movement Speed for ${N} ?s after entering or leaving the Holy Domain$`, "i"),
  advanceKill: new RegExp(`^Restores ${N} Murderous Intent upon defeating an enemy in the Holy Domain$`, "i"),
  invBlock: new RegExp(`^While inside the Holy Domain, \\+${N}% Block Ratio and Block Ratio Upper Limit$`, "i"),
  invRestore: new RegExp(`^\\+${N}% Murderous Intent restoration for every 1% Block Ratio$`, "i"),
  slot: /^Gains a Skill Slot, in which a Support Skill or Activation Medium Support Skill can be installed to support Trait Skill Holy Domain$/i,
  divine: new RegExp(`^For every 1 Murderous Intent you currently have, ${N}% additional damage dealt to enemies in the Holy Domain and \\+${N}% Murderous Intent restoration$`, "i"),
  despChannel: new RegExp(`^Trait Skills can be continuously channeled\\. During this time, the Holy Domain moves with the player, and no Murderous Intent is consumed while channeling\\. Max channeled stacks: ${N}$`, "i"),
  despNoGuard: new RegExp(`^At max channeled stacks, loses all channeled stacks and casts Holy Domain again\\. Inflicts No Guard on all units in the Holy Domain\\. No Guard lasts for ${N} ?s$`, "i"),
  despEffect: new RegExp(`^For every 1% Block Ratio, ${N}% additional No Guard Effect for enemies and -${N}% additional No Guard Effect on you$`, "i"),
  despRadius: new RegExp(`^-${N}% Holy Domain radius$`, "i"),
  improvision: new RegExp(`^When Blocking in the Holy Domain, \\+${N}% additional damage for ${N} ?s, up to \\+${N}%$`, "i"),
  // Between the Holy Land and Hell (revived, High Court Chariot).
  repent: new RegExp(`^Gains Repent to the Light for ${N} ?s after casting the Trait Skill$`, "i"),
  // Unsullied Blade.
  gains: /^Gains Mystic Mercury$/i,
  grants: /^While Mystic Mercury is active, using non-Channeled Attack Skills grants Mercury Pts$/i,
  realm: new RegExp(`^Upon reaching max Mercury Pts, Mystic Mercury becomes Realm of Mercury\\. Realm of Mercury consumes ${N} Mercury Pts every second\\.`, "i"),
  manaLock: /^Mana can only be consumed by Mystic Mercury\. At the same time, Mana can only be restored by Realm of Mercury$/i,
  moonSpeed: new RegExp(`^While Realm of Mercury exists, \\+${N}% additional Attack Speed for every Mercury Baptism cast, lasts for ${N} ?s, up to ${N} stack\\(s\\) \\(multiplies\\)$`, "i"),
  baptism: new RegExp(`^Inside Realm of Mercury, selects the enemy with the highest rarity that took damage from you recently and records ${N}% of the non-Channeled Attack Elemental Hit Damage dealt to this enemy\\. Every ${N} ?s, it casts Mercury Baptism on all enemies within it and gains ${N} Mercury Pts$`, "i"),
  infiltration: /^Mercury Baptism inflicts an Infiltration Effect of the same type as the highest recorded damage/i,
  sanctuaryEnemy: new RegExp(`^For every enemy inside Realm of Mercury, \\+${N}% additional Elemental Damage, up to \\+${N}% additional damage$`, "i"),
  devotionMana: new RegExp(`^Mana can be consumed via methods other than Mystic Mercury\\. Gains ${N}% Mercury Pts for every ${N} Mana consumed$`, "i"),
  devotionMax: new RegExp(`^For every ${N} Max Mana you have, \\+${N}% Max Mercury Pts, up to \\+${N}%$`, "i"),
  devotionPer: new RegExp(`^${N}% additional Elemental Damage for every Mercury Pt you have$`, "i"),
  cleanseRestore: new RegExp(`^-${N}% additional Mana restoration for Realm of Mercury$`, "i"),
  cleanseElemental: new RegExp(`^Mystic Mercury gains an additional effect: \\+${N}% additional Elemental Damage$`, "i"),
  cleanseRetain: new RegExp(`^Mystic Mercury still exists when it becomes Realm of Mercury and retains ${N}% effect$`, "i"),
  cleanseMainHand: new RegExp(`^While Mystic Mercury is active, \\+${N}% additional damage for Main-Hand Weapons?$`, "i"),
  // Mercury Purged (revived, Unsullied Blade).
  purged: new RegExp(`^When inflicting (Frostbite|Ignite|Numbed), gains Baptism: (Impassive|Rage|Indolent) for ${N} ?s$`, "i")
});
const CHARIOT_KEYS = ["regen", "blockGain", "cast", "inside", "moonRadius", "stand", "advanceSpeed", "advanceKill", "invBlock", "invRestore", "slot", "divine", "despChannel", "despNoGuard", "despEffect", "despRadius", "improvision"];
const UNSULLIED_KEYS = ["gains", "grants", "realm", "manaLock", "moonSpeed", "baptism", "infiltration", "sanctuaryEnemy", "devotionMana", "devotionMax", "devotionPer", "cleanseRestore", "cleanseElemental", "cleanseRetain", "cleanseMainHand"];
export const ROSA_REVIVED_KEYS = new Set(["repent", "purged"]);
const KEY_HERO = { ...Object.fromEntries(CHARIOT_KEYS.map((key) => [key, CHARIOT])), ...Object.fromEntries(UNSULLIED_KEYS.map((key) => [key, UNSULLIED])), repent: CHARIOT, purged: UNSULLIED };

/** The clause key of a Rosa line, or null. `revived`: only the revived keys. `heroId`: only that loadout's keys. */
export function rosaClauseKey(text, { revived = false, heroId = null } = {}) {
  const clean = cleanRosa(text);
  const keys = revived ? [...ROSA_REVIVED_KEYS] : [...CHARIOT_KEYS, ...UNSULLIED_KEYS];
  return keys.find((key) => (!heroId || KEY_HERO[key] === heroId) && ROSA_PATTERNS[key].test(clean)) || null;
}
/** The badge module of a Rosa line ("holyDomain" for High Court Chariot, "mercury" for Unsullied Blade), or null. */
export function rosaModuleOf(text, options = {}) {
  const key = rosaClauseKey(text, options);
  return !key ? null : KEY_HERO[key] === CHARIOT ? "holyDomain" : "mercury";
}
/** Whether a revived (memory) line of this loadout is read here. */
export function rosaRevivedLine(heroId, text) {
  const key = rosaClauseKey(text, { revived: true });
  return Boolean(key) && KEY_HERO[key] === heroId;
}

const linesOf = (modifierTexts, heroId) => modifierTexts.filter((line) => line && line.origin !== "derived" && !line.lineEffect && (line.origin === "trait" || (line.origin === "memory" && rosaRevivedLine(heroId, line.text)))).map((line) => ({ ...line, clean: cleanRosa(line.text) }));
const all = (lines, key) => lines.flatMap((line) => { const match = line.clean.match(ROSA_PATTERNS[key]); return match && (ROSA_REVIVED_KEYS.has(key) ? line.origin === "memory" : line.origin === "trait") ? [{ line, match }] : []; });
const plainSum = (modifierTexts, pattern) => modifierTexts.filter((line) => line && line.origin !== "derived" && !line.lineEffect).reduce((total, line) => {
  const match = cleanRosa(line.text).match(pattern);
  return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0);
}, 0);
const MAX_INTENT = /^\+(\d+(?:\.\d+)?) (?:to )?Max Murderous Intent$/i;
const BLOCK_RATIO = /^\+(\d+(?:\.\d+)?)% Block Ratio$/i;
const BLOCK_RATIO_UPPER = /^\+(\d+(?:\.\d+)?)% Block Ratio Upper Limit$/i;
const NO_GUARD_EFFECT = /^\+(\d+(?:\.\d+)?)% No Guard Effect$/i;
const INFILTRATION_EFFECT = (type) => new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% ${type} Infiltration Effect$`, "i");

/**
 * The Mystic Mercury / Realm of Mercury cycle, simulated in small steps until it repeats (pure; exported for the tests).
 * @returns {{ realmShare, averagePts, realmBonusPercent, moonStacks, stalled, mysticSeconds, realmSeconds, baptismsPerSecond }}
 */
export function mercuryCycle({ manaLocked = true, usesPerSecond = 0, maxPts = 100, drainPerSecond = 30, baptism = null, restorePercent = 15, unsealedMana = 0, devotion = null, moon = null, horizonSeconds = 240 } = {}) {
  const u = Math.max(0, Number(usesPerSecond) || 0);
  if (!(u > EPS)) return { realmShare: 0, averagePts: 0, realmBonusPercent: 0, moonStacks: 0, stalled: true, mysticSeconds: Infinity, realmSeconds: 0, baptismsPerSecond: 0 };
  const dt = Math.min(0.01, 1 / u / 4);
  const steps = Math.ceil(horizonSeconds / dt), warm = Math.floor(steps / 4);
  const useEvery = 1 / u, baptismEvery = baptism ? baptism.intervalSeconds : Infinity;
  const ptsPerDevotion = devotion && unsealedMana > 0 ? devotion.ptsPercent / 100 * maxPts / devotion.perMana : 0;
  let realm = false, mana = 100, pts = 0, nextUse = useEvery, nextBaptism = baptismEvery, t = 0;
  const baptismTimes = [];
  let sum = { time: 0, realm: 0, pts: 0, bonus: 0, moon: 0, baptisms: 0 }, realmStarts = 0, realmEnds = 0;
  for (let step = 0; step < steps; step++) {
    t += dt;
    const measuring = step >= warm;
    // Without the base trait's Mana lock, Mana regenerates as usual: read as full (provisional).
    if (!manaLocked) mana = 100;
    while (nextUse <= t + EPS) {
      if (!realm) {
        // Short of 10%: 1% (what is left, down to 0) for 5 Pts; read as always granting them (provisional: the keyword does not say
        // what happens at 0 Mana, and only the Realm restores Mana, so a strict reading would stall the cycle for good).
        const full = mana >= KEYWORDS.mysticMercury.costPercent - EPS;
        const cost = full ? KEYWORDS.mysticMercury.costPercent : Math.min(mana, KEYWORDS.mysticMercury.lowCostPercent);
        mana = Math.max(0, mana - cost);
        pts += full ? KEYWORDS.mysticMercury.pts : KEYWORDS.mysticMercury.lowPts;
        pts += ptsPerDevotion * cost / 100 * unsealedMana;
        if (pts >= maxPts - EPS) { pts = maxPts; realm = true; nextBaptism = t + baptismEvery; if (measuring) realmStarts += 1; }
      } else mana = Math.min(100, mana + restorePercent);
      nextUse += useEvery;
    }
    if (realm) {
      pts -= drainPerSecond * dt;
      if (baptism && nextBaptism <= t + EPS) { pts = Math.min(maxPts, pts + baptism.pts); baptismTimes.push(t); nextBaptism += baptismEvery; if (measuring) sum.baptisms += 1; }
      if (pts <= EPS) { pts = 0; realm = false; if (measuring) realmEnds += 1; }
    }
    // The moon's stacks last `seconds` each and exist only while the Realm does.
    if (!realm) baptismTimes.length = 0;
    else if (moon) while (baptismTimes.length && baptismTimes[0] <= t - moon.seconds + EPS) baptismTimes.shift();
    if (measuring) {
      sum.time += dt; sum.pts += pts * dt;
      if (realm) {
        sum.realm += dt;
        sum.bonus += KEYWORDS.realm.perTenPercentMana * Math.floor((mana + EPS) / 10) * dt;
        if (moon) sum.moon += Math.min(moon.maxStacks, baptismTimes.length) * dt;
      }
    }
  }
  const realmShare = sum.time > 0 ? sum.realm / sum.time : 0;
  const cycles = Math.max(realmStarts, realmEnds);
  const stalled = !realm && cycles === 0;
  return { realmShare: round(realmShare), averagePts: round(sum.pts / Math.max(EPS, sum.time)), realmBonusPercent: round(sum.bonus / Math.max(EPS, sum.time)), moonStacks: round(sum.moon / Math.max(EPS, sum.time)), stalled,
    mysticSeconds: cycles > 0 ? round((sum.time - sum.realm) / cycles) : stalled ? Infinity : 0, realmSeconds: cycles > 0 ? round(sum.realm / cycles) : realm ? Infinity : 0, baptismsPerSecond: round(sum.baptisms / Math.max(EPS, sum.time)) };
}

function chariotState(lines, modifierTexts, requestedConditions) {
  const one = (key) => all(lines, key)[0] || null;
  const has = (key) => Boolean(one(key));
  const cast = one("cast"), regen = one("regen");
  const domainLines = Boolean(cast && regen);
  const pressed = requestedConditions.traitSkillOnCooldown !== false;
  const held = domainLines && pressed;
  const maxIntent = KEYWORDS.murderousIntent.max + plainSum(modifierTexts, MAX_INTENT);
  const cost = cast ? Number(cast.match[2]) : 15;
  const regenPerSecond = regen ? Number(regen.match[1]) : 0;
  // Desperation needs both lines: the channel recasts the Domain, the recast inflicts No Guard.
  const desperation = has("despNoGuard") && has("despChannel");
  const intentSwitchOn = requestedConditions[INTENT_HELD_SWITCH] !== false;
  const intentAtMax = held && (intentSwitchOn || desperation);
  const intent = held ? (intentAtMax ? maxIntent : cost / 2) : 0;
  const blocks = requestedConditions.blockedRecently !== false;
  const bossCount = requestedConditions[BOSS_COUNT_SWITCH] !== false;
  const enemies = bossCount ? KEYWORDS.enemyCount.boss : 1;
  // Block Ratio inside the Domain: base 30 + plain lines + Invulnerability + Repent to the Light's stacks (blocks), capped by the
  // Upper Limit (60 + its lines, at most 80).
  const inv = one("invBlock"), repentLine = one("repent");
  const invPercent = held && inv ? Number(inv.match[1]) : 0;
  const repentOn = Boolean(repentLine) && held && desperation;
  const repentPercent = repentOn && blocks ? KEYWORDS.repent.blockRatioPerBlock * KEYWORDS.repent.maxStacks : 0;
  const upper = Math.min(KEYWORDS.blockRatio.hardCap, KEYWORDS.blockRatio.upperLimit + plainSum(modifierTexts, BLOCK_RATIO_UPPER) + invPercent + repentPercent);
  const blockRatio = round(Math.min(upper, KEYWORDS.blockRatio.base + plainSum(modifierTexts, BLOCK_RATIO) + invPercent + repentPercent));
  // No Guard (Desperation): the channel recasts the Domain at max channeled stacks (2): +100% effect for the 2 stacks lost.
  const channel = one("despChannel"), effect = one("despEffect");
  const maxStacks = channel ? Number(channel.match[1]) : KEYWORDS.noGuard.firstStacksLost;
  const lostIncrease = maxStacks >= KEYWORDS.noGuard.firstStacksLost ? KEYWORDS.noGuard.perStackLostPercent * (1 + Math.max(0, maxStacks - KEYWORDS.noGuard.firstStacksLost)) : 0;
  const noGuardIncrease = lostIncrease + plainSum(modifierTexts, NO_GUARD_EFFECT);
  const perRatio = effect ? Number(effect.match[1]) : 0;
  const noGuard = desperation ? { active: held, maxStacks, lostIncrease, increasedPercent: noGuardIncrease, perRatio, blockRatio, additionalPercent: round(perRatio * blockRatio),
    takenPercent: held ? round(KEYWORDS.noGuard.takenPercent * (1 + noGuardIncrease / 100) * (1 + perRatio * blockRatio / 100)) : 0, seconds: Number(one("despNoGuard").match[1]) } : null;
  const why = !domainLines ? "the Holy Domain or Murderous Intent line is not in the build" : "the Trait Skill switch is off: the Holy Domain is never cast";
  const state = { domainLines, pressed, held, why, maxIntent, cost, regenPerSecond, intent: round(intent), intentAtMax, intentSwitchOn, desperation, blocks, bossCount, enemies, blockRatio, upper, invPercent, repent: repentLine ? { on: repentOn, percent: repentPercent, seconds: Number(repentLine.match[1]) } : null, noGuard };
  const switches = [], assumptions = [];
  if (domainLines && (has("divine") || has("stand") || has("despNoGuard"))) {
    if (has("divine") && !desperation) switches.push({ id: INTENT_HELD_SWITCH, label: "Holy Domain cast once and held: Murderous Intent at its max", enabled: intentSwitchOn, active: intentAtMax, summary: `Murderous Intent held at ${maxIntent} (Divine Intervention reads it)`, reason: intentSwitchOn ? (held ? "best-case assumption (the Holy Domain keyword: it closes only 1 s after you leave it, so it is not recast)" : why) : `switched off: cast whenever ${cost} are ready, Murderous Intent averages ${round(cost / 2)}` });
    if (has("stand")) switches.push({ id: BOSS_COUNT_SWITCH, label: "The dummy (a Boss) counts as 5 enemies", enabled: bossCount, active: held && bossCount, summary: "Unbreakable Stand counts 5 enemies in the Holy Domain", reason: bossCount ? "best-case reading (TLIDB Enemy Count keyword: each Boss counts as 5 monsters)" : "switched off: one enemy" });
  }
  if (held) assumptions.push({ id: "rosa:holyDomain", value: round(intent), text: `Rosa – Holy Domain (Q-H7, provisional): held at uptime 1 with the dummy inside; Murderous Intent ${intentAtMax ? `held at its max ${maxIntent}${desperation ? " (Desperation's channel consumes none)" : " (cast once and held: the keyword says it closes 1 s after you leave it)"}` : `averages ${round(intent)} (cast whenever ${cost} are ready)`}; Block Ratio ${blockRatio}%${blocks ? " (blocks on the hit-recently best case)" : ""}; enemies counted ${enemies}${noGuard?.active ? `; No Guard on the dummy: +${noGuard.takenPercent}% additional damage taken (10% × (1 + ${noGuardIncrease}%) × (1 + ${perRatio}% × ${blockRatio}))` : ""}.` });
  return { ...state, switches, assumptions };
}

function unsullied(lines, modifierTexts, requestedConditions, facts, inputs) {
  const one = (key) => all(lines, key)[0] || null;
  const has = (key) => Boolean(one(key));
  const gains = has("gains");
  if (!gains) return { active: false, reason: "the Gains Mystic Mercury line is not in the build", switches: [], assumptions: [] };
  const measured = Boolean(facts);
  const maxMana = Math.max(0, Number(inputs.maxMana) || 0), unsealedShare = Math.max(0, Math.min(100, Number(inputs.manaUnsealedPercent ?? 100))) / 100;
  const unsealedMana = maxMana * unsealedShare;
  const devotionMax = one("devotionMax");
  const maxPtsPercent = devotionMax ? Math.min(Number(devotionMax.match[3]), Number(devotionMax.match[2]) * Math.floor(maxMana / Number(devotionMax.match[1]) + EPS)) : 0;
  const maxPts = round(KEYWORDS.mercuryPts.max * (1 + maxPtsPercent / 100));
  const realmLine = one("realm");
  const drain = realmLine ? Number(realmLine.match[1]) : 30;
  const bap = one("baptism");
  const baptism = bap ? { recordPercent: Number(bap.match[1]), intervalSeconds: Number(bap.match[2]), pts: Number(bap.match[3]) } : null;
  const restoreCut = one("cleanseRestore");
  const restorePercent = KEYWORDS.realm.restorePercent * (1 - (restoreCut ? Number(restoreCut.match[1]) : 0) / 100);
  const devotionMana = one("devotionMana");
  const devotion = devotionMana ? { ptsPercent: Number(devotionMana.match[1]), perMana: Number(devotionMana.match[2]) } : null;
  const moonLine = one("moonSpeed");
  const moon = moonLine && baptism ? { perStack: Number(moonLine.match[1]), seconds: Number(moonLine.match[2]), maxStacks: Number(moonLine.match[3]) } : null;
  const usesPerSecond = Math.max(0, Number(facts?.attackUses) || 0);
  const grants = has("grants");
  const cycle = measured && grants && realmLine ? mercuryCycle({ manaLocked: has("manaLock"), usesPerSecond, maxPts, drainPerSecond: drain, baptism, restorePercent, unsealedMana, devotion, moon }) : { realmShare: 0, averagePts: 0, realmBonusPercent: 0, moonStacks: 0, stalled: true, mysticSeconds: Infinity, realmSeconds: 0, baptismsPerSecond: 0 };
  const U = cycle.realmShare;
  const retainLine = one("cleanseRetain");
  const retain = retainLine ? Number(retainLine.match[1]) / 100 : 0;
  const mysticFactor = round((1 - U) + retain * U);
  const bossCount = requestedConditions[BOSS_COUNT_SWITCH] !== false;
  const enemies = bossCount ? KEYWORDS.enemyCount.boss : 1;
  const sanctuary = one("sanctuaryEnemy");
  const sanctuaryPercent = sanctuary ? Math.min(Number(sanctuary.match[2]), Number(sanctuary.match[1]) * enemies) : 0;
  const per = one("devotionPer");
  const elementalByType = facts?.elementalByType || {};
  const recordType = ELEMENTAL.filter((type) => (elementalByType[type] || 0) > 0).sort((a, b) => (elementalByType[b] || 0) - (elementalByType[a] || 0))[0] || null;
  const infiltrationPercent = recordType ? round(KEYWORDS.infiltration.takenPercent * (1 + plainSum(modifierTexts, INFILTRATION_EFFECT(recordType)) / 100)) : 0;
  const bodies = {
    realm: U > 0 && cycle.realmBonusPercent > 0 ? [`+${cycle.realmBonusPercent}% additional Attack Speed`, `+${cycle.realmBonusPercent}% additional Elemental Damage`] : [],
    moonSpeed: moon && cycle.moonStacks > 0 ? [`+${round(moon.perStack * cycle.moonStacks)}% additional Attack Speed`] : [],
    sanctuaryEnemy: sanctuary && U > 0 ? [`+${round(sanctuaryPercent * U)}% additional Elemental Damage`] : [],
    devotionPer: per && cycle.averagePts > 0 ? [`+${round(Number(per.match[1]) * cycle.averagePts)}% additional Elemental Damage`] : [],
    cleanseElemental: one("cleanseElemental") && mysticFactor > 0 ? [`+${round(Number(one("cleanseElemental").match[1]) * mysticFactor)}% additional Elemental Damage`] : [],
    cleanseMainHand: one("cleanseMainHand") && mysticFactor > 0 ? [`+${round(Number(one("cleanseMainHand").match[1]) * mysticFactor)}% additional damage for Main-Hand Weapons`] : []
  };
  const state = { active: true, measured, usesPerSecond: round(usesPerSecond), grants, maxMana: round(maxMana), unsealedMana: round(unsealedMana), maxPts, maxPtsPercent, drain, baptism, restorePercent: round(restorePercent), devotion, moon, cycle, realmShare: U, retain, mysticFactor,
    bossCount, enemies, sanctuaryPercent, recordType, infiltration: baptism && has("infiltration") && recordType && U > 0 ? { type: recordType, uptime: U, takenPercent: infiltrationPercent } : null, bodies };
  const switches = [], assumptions = [];
  if (sanctuary) switches.push({ id: BOSS_COUNT_SWITCH, label: "The dummy (a Boss) counts as 5 enemies", enabled: bossCount, active: bossCount && U > 0, summary: "Boundless Sanctuary counts 5 enemies inside Realm of Mercury", reason: bossCount ? "best-case reading (TLIDB Enemy Count keyword: each Boss counts as 5 monsters)" : "switched off: one enemy" });
  assumptions.push({ id: "rosa:mercury", value: U, text: `Rosa – Mystic Mercury / Realm of Mercury (provisional): ${!measured ? "the cycle waits for the hit pass's measured attack rate" : !grants || !realmLine ? "no Mercury Pts gain line" : cycle.stalled ? `${fmt(usesPerSecond)} non-Channeled Attack uses/s cannot reach ${maxPts} Mercury Pts before Mana runs out (Mana is restored only in the Realm): Mystic Mercury held` : `${fmt(usesPerSecond)} non-Channeled Attack uses/s fill ${maxPts} Mercury Pts in ${fmt(cycle.mysticSeconds)} s; the Realm drains ${drain}/s${baptism ? ` (+${baptism.pts} per Baptism every ${baptism.intervalSeconds} s)` : ""} and lasts ${fmt(cycle.realmSeconds)} s: Realm ${pct(U)}% of the time, ${fmt(cycle.averagePts)} Pts on average; the Realm's Mana bonus averages +${cycle.realmBonusPercent}%`}; bonuses time-averaged over the cycle.` });
  if (baptism && U > 0) assumptions.push({ id: "rosa:baptism", value: baptism.recordPercent, text: `Rosa – Mercury Baptism (provisional): every ${baptism.intervalSeconds} s in the Realm it re-deals ${baptism.recordPercent}% of the non-Channeled Attack Elemental Hit Damage dealt since the last Baptism, as True Damage (Realm ${pct(U)}% of the time)${recordType ? `; ${recordType} Infiltration (+${infiltrationPercent}% ${recordType} Damage taken) for that share` : ""}.` });
  return { ...state, switches, assumptions };
}

/**
 * @param {object} p
 * @param {string} p.heroId the selected loadout
 * @param {object[]} p.modifierTexts the build's lines (before the derived lines)
 * @param {object} p.requestedConditions the combat conditions (the best-case switches)
 * @param {object|null} p.facts the hit pass's measured rates (Unsullied Blade): { attackUses, elementalByType }
 * @param {object} p.inputs { maxMana, manaUnsealedPercent, enemyAilments }
 */
export function rosaState({ heroId = "", modifierTexts = [], requestedConditions = {}, facts = null, inputs = {} } = {}) {
  if (!ROSA_HEROES.has(heroId)) return null;
  const lines = linesOf(modifierTexts, heroId);
  if (heroId === CHARIOT) {
    const chariot = chariotState(lines, modifierTexts, requestedConditions);
    return { heroId, chariot, mercury: null, needsRates: false, switches: chariot.switches, assumptions: chariot.assumptions };
  }
  const mercury = unsullied(lines, modifierTexts, requestedConditions, facts, inputs);
  const ailments = new Set(inputs.enemyAilments || []);
  const purged = all(lines, "purged").map(({ match }) => {
    const name = match[2][0].toUpperCase() + match[2].slice(1).toLowerCase();
    const keyword = KEYWORDS.baptisms[name];
    return { ailment: keyword.ailment, name, seconds: Number(match[3]), active: ailments.has(keyword.ailment), body: keyword.body };
  });
  const assumptions = [...mercury.assumptions];
  if (purged.length) assumptions.push({ id: "rosa:purged", value: purged.filter((item) => item.active).length, text: `Rosa – Mercury Purged (provisional): ${purged.map((item) => `Baptism: ${item.name} ${item.active ? `held (the build keeps ${item.ailment} on the dummy; each infliction refreshes its ${item.seconds} s)` : `off (no ${item.ailment} on the dummy)`}`).join("; ")}; the -30% damage taken on you is defensive.` });
  return { heroId, chariot: null, mercury, purged, needsRates: Boolean(mercury.active), switches: mercury.switches, assumptions };
}

const inCalc = (reason, bodies = []) => ({ status: "In calc", reason, bodies });
const inactive = (reason) => ({ status: "Inactive", reason, bodies: [] });
const neutral = (reason) => ({ status: "No DPS effect", reason, bodies: [] });
const notOnDummy = (reason) => ({ status: "Not on dummy", reason, bodies: [] });

/** One clause's reading: { key, status, reason, bodies }, or null when the line is not a Rosa clause. */
export function rosaLineRead(heroId, text, state, { revived = false } = {}) {
  const clean = cleanRosa(text);
  const key = rosaClauseKey(clean, { revived, heroId });
  if (!key) return null;
  const match = clean.match(ROSA_PATTERNS[key]);
  const read = heroId === CHARIOT ? chariotRead(key, match, state?.chariot || null) : mercuryRead(key, match, state?.mercury || null, state?.purged || []);
  return read ? { key, ...read } : null;
}

function chariotRead(key, match, c) {
  if (!c) return inactive("no Holy Domain state");
  const held = c.held, why = c.why;
  const atMax = c.intentAtMax ? `Murderous Intent held at its max ${c.maxIntent}` : `Murderous Intent averages ${c.intent}`;
  switch (key) {
    case "regen": return held ? inCalc(`${match[1]} Murderous Intent per second: a Holy Domain (${c.cost}) every ${fmt(c.cost / Number(match[1]))} s, which holds it (Q-H7, provisional); ${atMax}`) : inactive(why);
    case "cast": return held ? inCalc(`cast whenever ${c.cost} Murderous Intent are ready, the dummy pulled inside: held at uptime 1 (Q-H7, provisional)`) : inactive(why);
    case "inside": {
      const body = `+${match[1]}% additional damage`;
      return held ? inCalc(`the Holy Domain is held at uptime 1 (a recast every 3.75 s from 4 Murderous Intent per second; the keyword says it closes 1 s after you leave it: Q-H7, provisional), centred on you: ${body}`, [body]) : inactive(why);
    }
    case "blockGain": return neutral(`Murderous Intent is ${c.intentAtMax ? "already held at its max" : "spent on each recast"}; Blocking only shortens the refill, which changes no dummy figure`);
    case "moonRadius": return neutral("Holy Domain radius and Block Chance change no dummy figure (the dummy is pulled inside)");
    case "stand": {
      const value = round(Math.min(Number(match[2]), Number(match[1]) * c.enemies));
      const body = `+${value}% additional damage`;
      return held ? inCalc(`${c.enemies} enem${c.enemies === 1 ? "y" : "ies"} in the Holy Domain (${c.bossCount ? "the dummy is a Boss: 5 by the Enemy Count keyword, best case" : "one dummy: the Boss count is switched off"}) × ${match[1]}%, up to ${match[2]}%: ${body} (provisional)`, [body]) : inactive(why);
    }
    case "advanceSpeed": return neutral("Movement Speed only");
    case "advanceKill": return notOnDummy("the dummy is never defeated");
    case "invBlock": return !held ? inactive(why) : c.noGuard ? inCalc(`+${match[1]}% Block Ratio inside the Holy Domain: Block Ratio ${c.blockRatio}% (upper limit ${c.upper}%), read by Desperation's No Guard Effect`) : neutral(`Block Ratio ${c.blockRatio}%: only Desperation's No Guard Effect and the Murderous Intent restoration read it, and neither changes a figure here`);
    case "invRestore": return neutral(`${atMax}: restoration only shortens refills, which changes no dummy figure`);
    case "slot": return neutral("the Holy Domain deals no damage and is already held at uptime 1, so a support installed in this slot changes no dummy figure");
    case "divine": {
      const value = round(Number(match[1]) * c.intent);
      const body = `+${value}% additional damage`;
      return held && value > 0 ? inCalc(`${atMax}${c.intentAtMax ? (c.desperation ? " (Desperation's channel consumes none)" : " (best case: cast once and held)") : " (cast whenever ready: switch off)"} × ${match[1]}% on the dummy inside the Domain: ${body}; its restoration part changes no figure (provisional)`, [body]) : inactive(why);
    }
    case "despChannel": return !held ? inactive(why) : !c.noGuard ? neutral("without the No Guard recast line the channel only moves the Domain") : inCalc(`the Trait Skill is channeled: the Domain moves with you, no Murderous Intent is consumed and each ${match[1]}-stack channel recasts it (No Guard; the channel time is not taken from your attacks: provisional)`);
    case "despNoGuard": {
      const ng = c.noGuard;
      const body = `+${ng?.takenPercent ?? 0}% additional damage taken`;
      return held && ng ? inCalc(`No Guard held on the dummy (recast within every ${match[1]} s by the channel): 10% × (1 + ${ng.increasedPercent}% for the ${ng.maxStacks} stacks lost and No Guard Effect lines) × (1 + ${ng.perRatio}% × ${ng.blockRatio}% Block Ratio) = ${body} (provisional)`, [body]) : inactive(why);
    }
    case "despEffect": return held && c.noGuard ? inCalc(`${match[1]}% additional No Guard Effect per 1% Block Ratio (${c.blockRatio}%): ×${round(1 + c.noGuard.additionalPercent / 100)} on the dummy's No Guard; the part on you is defensive`) : inactive(why);
    case "despRadius": return neutral("Holy Domain radius changes no dummy figure (the dummy is pulled inside)");
    case "improvision": {
      const body = `+${match[3]}% additional damage`;
      return !held ? inactive(why) : c.blocks ? inCalc(`blocks in the Holy Domain on the hit-recently best case (the dummy never attacks): held at the cap, ${body} (provisional)`, [body]) : inactive("the \"Hit or blocked recently\" switch is off: no blocks");
    }
    case "repent": {
      const r = c.repent;
      if (!held) return inactive(why);
      if (!r?.on) return neutral("without Desperation the Holy Domain is not recast within 8 s; Repent to the Light's Block Ratio stacks only feed the Murderous Intent restoration, which changes no figure");
      return c.blocks ? inCalc(`Desperation's channel recasts the Trait Skill within every ${r.seconds} s: Repent to the Light held, its self attacks blocked on the hit-recently best case: +${r.percent}% Block Ratio and Upper Limit (Block Ratio ${c.blockRatio}%), read by No Guard Effect (provisional)`) : inactive("the \"Hit or blocked recently\" switch is off: no blocked attacks, no Repent stacks");
    }
    default: return null;
  }
}

function mercuryRead(key, match, m, purged) {
  if (!m?.active) return inactive(m?.reason || "no Mystic Mercury state");
  const pending = !m.measured ? " (held before the hit pass measures the attack rate)" : "";
  const cyc = m.cycle, U = m.realmShare;
  const realmText = `Realm of Mercury ${pct(U)}% of the time`;
  const noAttack = "no non-Channeled Attack Skill is modeled: Mystic Mercury gains no Mercury Pts";
  const off = (bodies, reason, inactiveReason) => bodies.length ? inCalc(reason, bodies) : inactive(inactiveReason);
  switch (key) {
    case "gains": return inCalc(`Mystic Mercury active ${pct(1 - U)}% of the time${pending}`);
    case "grants": return !m.measured ? inCalc(`Mercury Pts per non-Channeled Attack use${pending}`) : m.usesPerSecond > 0 ? inCalc(`${m.usesPerSecond} non-Channeled Attack uses/s × 10 Mercury Pts (10% Unsealed Max Mana each; 5 Pts for 1% when Mana is short), Max ${m.maxPts} Pts${cyc.stalled ? ": Mana runs out first, the Realm is never reached" : ""} (provisional)`) : inactive(noAttack);
    case "realm": return off(m.bodies.realm, `${realmText} (${fmt(cyc.mysticSeconds)} s to fill, ${fmt(cyc.realmSeconds)} s in the Realm); its +2% additional Attack Speed and Elemental Damage per 10% Unsealed Mana average +${cyc.realmBonusPercent}% (TLIDB keyword; time-averaged, provisional)`, cyc.stalled ? (m.measured ? "Max Mercury Pts are never reached (Mana runs out first, and only the Realm restores it)" : `the Realm waits for the measured attack rate${pending}`) : "the Realm's Mana bonus is 0");
    case "manaLock": return inCalc(`Mana is spent only by Mystic Mercury and restored only by the Realm (${fmt(m.restorePercent)}% Unsealed Max Mana per non-Channeled Attack use): it sets the cycle${pending}`);
    case "moonSpeed": return off(m.bodies.moonSpeed, `Mercury Baptism every ${m.baptism?.intervalSeconds} s in the Realm: ${fmt(cyc.moonStacks)} stacks on average (up to ${m.moon?.maxStacks} for ${m.moon?.seconds} s) × ${m.moon?.perStack}%: ${m.bodies.moonSpeed[0] || ""} (time-averaged, provisional)`, !m.baptism ? "no Mercury Baptism (Baptism of Purity) in the build" : `the Realm is never reached${pending}`);
    case "baptism": return U > 0 ? inCalc(`every ${match[2]} s in the Realm (${pct(U)}% of the time) Mercury Baptism re-deals ${match[1]}% of the non-Channeled Attack Elemental Hit Damage dealt since the last one, as True Damage (a damage source; provisional), and adds ${match[3]} Mercury Pts`) : inactive(m.measured ? (cyc.stalled ? "the Realm is never reached" : "no Realm time") : `the Realm waits for the measured attack rate${pending}`);
    case "infiltration": return m.infiltration ? inCalc(`${m.infiltration.type} (the largest recorded Elemental type) Infiltration on the dummy for the Realm's ${pct(U)}%: +${m.infiltration.takenPercent}% additional ${m.infiltration.type} Damage taken at that share (provisional)`) : inactive(!m.baptism ? "no Mercury Baptism" : U > 0 ? "no Elemental hit damage is recorded" : `the Realm is never reached${pending}`);
    case "sanctuaryEnemy": return off(m.bodies.sanctuaryEnemy, `${m.enemies} enem${m.enemies === 1 ? "y" : "ies"} inside the Realm (${m.bossCount ? "the dummy is a Boss: 5 by the Enemy Count keyword, best case" : "one dummy"}): +${m.sanctuaryPercent}% while the Realm exists (${pct(U)}%): ${m.bodies.sanctuaryEnemy[0] || ""} (time-averaged, provisional)`, `the Realm is never reached${pending}`);
    case "devotionMana": return m.measured && m.usesPerSecond > 0 ? inCalc(`${match[1]}% of Max Mercury Pts per ${match[2]} Mana consumed (${fmt(m.unsealedMana)} Unsealed Max Mana; Mystic Mercury's own consumption counted, skill Mana costs are not in the planner: provisional)`) : inactive(m.measured ? noAttack : `the cycle waits for the measured attack rate${pending}`);
    case "devotionMax": return m.maxPtsPercent > 0 ? inCalc(`${fmt(m.maxMana)} Max Mana: +${m.maxPtsPercent}% Max Mercury Pts (${m.maxPts}), which lengthens the cycle and raises the per-Pt bonus`) : inactive(`${fmt(m.maxMana)} Max Mana is below ${match[1]}`);
    case "devotionPer": return off(m.bodies.devotionPer, `${fmt(cyc.averagePts)} Mercury Pts on average × ${match[1]}%: ${m.bodies.devotionPer[0] || ""} (time-averaged, provisional)`, `no Mercury Pts held${pending}`);
    case "cleanseRestore": return inCalc(`the Realm restores ${fmt(m.restorePercent)}% Unsealed Max Mana per use instead of 15%: it lowers the Realm's Mana bonus`);
    case "cleanseElemental": return off(m.bodies.cleanseElemental, `Mystic Mercury ${pct(1 - U)}% of the time${m.retain ? `, ${pct(m.retain)}% of its effect in the Realm` : ""}: ${m.bodies.cleanseElemental[0] || ""} (time-averaged, provisional)`, "Mystic Mercury is never active");
    case "cleanseRetain": return m.retain > 0 && U > 0 ? inCalc(`Mystic Mercury keeps ${pct(m.retain)}% of its damage effects in the Realm (${pct(U)}% of the time); its Mana cost and Pts are not read there (provisional)`) : inactive(`the Realm is never reached${pending}`);
    case "cleanseMainHand": return off(m.bodies.cleanseMainHand, `Mystic Mercury ${pct(1 - U)}% of the time${m.retain ? `, ${pct(m.retain)}% of its effect in the Realm` : ""}: ${m.bodies.cleanseMainHand[0] || ""} (main-hand swings; time-averaged, provisional)`, "Mystic Mercury is never active");
    case "purged": {
      const name = match[2][0].toUpperCase() + match[2].slice(1).toLowerCase();
      const item = purged.find((entry) => entry.name === name);
      if (!item) return inactive("no Mercury Purged state");
      if (!item.active) return inactive(`the build inflicts no ${item.ailment} on the dummy`);
      return name === "Impassive" ? inCalc(`the build keeps ${item.ailment} on the dummy: Baptism: Impassive held (+60% Skill Area; the Skill Area readers take it; -30% Cold Damage taken on you is defensive)`, [item.body]) : inCalc(`the build keeps ${item.ailment} on the dummy (each infliction refreshes the ${item.seconds} s): Baptism: ${name} held, ${item.body} (provisional)`, [item.body]);
    }
    default: return null;
  }
}

/** The Infiltration Mercury Baptism keeps on the dummy ({ type, uptime, takenPercent }) or null (src/combat-states.js reads it). */
export const rosaInfiltration = (state) => state?.mercury?.infiltration || null;

/**
 * Mercury Baptism's True Damage per second from the modeled hits (each { dps, components, setupTags, kind }): the record share × the
 * non-Channeled Attack Elemental part of their dealt damage × the Realm's time share. Returns null when it deals nothing.
 */
export function mercuryBaptismSource(state, hits = []) {
  const m = state?.mercury;
  if (!m?.active || !m.baptism || !(m.realmShare > 0)) return null;
  const elementalDps = (hit) => {
    const total = (hit.components || []).reduce((sum, component) => sum + (Number(component.perUse) || 0), 0);
    const elemental = (hit.components || []).filter((component) => ELEMENTAL.includes(component.type)).reduce((sum, component) => sum + (Number(component.perUse) || 0), 0);
    return total > 0 ? hit.dps * elemental / total : 0;
  };
  const eligible = hits.filter((hit) => (hit.setupTags || []).includes("Attack") && !(hit.setupTags || []).includes("Channeled") && hit.kind !== "channel" && hit.kind !== "channel-release");
  const recorded = eligible.reduce((sum, hit) => sum + elementalDps(hit), 0);
  if (!(recorded > 0)) return null;
  const dps = recorded * m.baptism.recordPercent / 100 * m.realmShare;
  return { key: BAPTISM_KEY, name: "Mercury Baptism (True Damage)", dps, recordedDps: recorded, recordPercent: m.baptism.recordPercent, realmShare: m.realmShare, usesPerSecond: m.realmShare / m.baptism.intervalSeconds, perUse: recorded * m.baptism.intervalSeconds * m.baptism.recordPercent / 100,
    text: `Mercury Baptism (Rosa – Unsullied Blade; provisional): ${m.baptism.recordPercent}% of the non-Channeled Attack Elemental Hit Damage dealt (${fmt(recorded)} per second) re-dealt as True Damage every ${m.baptism.intervalSeconds} s while the Realm exists (${pct(m.realmShare)}% of the time).` };
}
