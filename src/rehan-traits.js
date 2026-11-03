// Rehan (Anger, Seething Silhouette): hero trait audit batch B10 (2026-10-19; research/hero-traits-audit-2026-10-19.md §5 B10, §8 B10,
// §6 Q-H1 / Q-H15). Pure: reads the build's trait lines (origin "trait"), the hero-exclusive revived lines the module reads
// (src/hero-exclusive-revivals.js MODULE_LINES: Hero's Resourcefulness, Furious Roar, Ancestral Hate's Life cost, Starfall Wasteland)
// and the rates the planner's hit pass measured (src/planner.js hitRateFacts.rehan), and returns
//   - rehanState: the Rage cycle (Rage gained outside Berserk, Berserk's drain and duration, its uptime), the Rage bonus level in each
//     phase, Burst (Anger) and the Seething Spirit (Seething Silhouette), Disarmed, the best-case switches and the recount assumptions;
//   - rehanPhaseLines: the Rage-driven lines for a phase weighting (the time average for the build, Berserk only for Burst and the
//     Spirit, the player's attacking time under Ritual of Offering's Disarm);
//   - rehanLineRead: one clause's status, reason and derived bodies (src/hero-trait-modules.js "rage" / "burst" / "spirit").
//
// Sourced:
// - Trait texts (reference data, SS14; src/data/heroes/all-hero-traits-ss13.generated.js); game tier records (audit §4.3; SS14 tier data):
//   Fury's Onslaught's second parameter (-33.33 / -36.31 / -39.02 / -41.52 / -43.82) is a Berserk + Seething Spirit additional damage
//   (affix 187841424: attr 5719 with tags 4030001 / 6001190), so the Spirit's casts take the player's +X% and this offset.
// - reference data keyword tooltips (Torchlight_Hyperlink_hover, fetched 2026-10-19, research/refdata-ss14/fetch-cache/): Rage (ece24b16: "a
//   Berserker exclusive energy that has a default upper limit of 100"), Berserk (b3645c45: "gains bonuses twice the Max Rage while
//   Berserk is active; Berserk expires when you run out of Rage"), Burst (46230009: "deals … area explosion damage equal to 340% of
//   Weapon Damage to enemies within 3m. While Dual Wielding, the Base Damage is the average damage of both weapons. For every +1 to
//   Skill Level, Burst +10% additional damage (multiplies)"; tags Attack, Melee, Physical, Triggered, Area, Strength, Dexterity), Burst
//   Blast (219965c8: "1166-1944 Spell Physical Damage … The damage effect of this skill is 288%"; tags Spell, Physical, Triggered,
//   Area, Strength, Dexterity), Seething Spirit (bfe0c1e9: "casts your Non-Mobility and Non-Channeled Main Melee Attack Skills when it
//   appears"), Disarm (a54e950b: "unable to use Attack Skills when disarmed").
// - Game data (readable tables): config_skill_damage group 90000 "野蛮人_爆裂" (Barbarian Burst), one Lv. 1 row, 340% Weapon Damage at
//   +0x08 (the attack-row layout of Whirlwind 51 / 52); group 90003 (the same name), Physical 1166–1944 at 288% (Burst Blast). SS14 flat
//   extraction 2026-10-15 (session scratchpad), read only. Burst's trigger (affix 102360002): on hit (trigger 1000033, once per source)
//   while Berserk (state 4030001), cooldown p0 ÷ the Burst Cooldown Recovery attribute 7010 (Rampaging converts Attack Speed 6001 into
//   7010), trigger node 2320 (skill position 3000). config_char_field 2300106 "base Rage cost" 10 (Seething's cost per Melee cast).
//
// Read from the game (chunk 1, research/hero-rehan-chunk1-2026-11-01.md; the client routines are the SS13 copy's, the tables SS14):
// - Max Rage: field 2300000, default 100. Berserk enters at Max Rage (label 3050010, both loadouts) and ends when Rage reaches 0.
// - The Rage a per-Rage line reads (stat source 24): the Rage held; in Berserk Max Rage × config_c 1640 (2) × (1 + field 2300011), on
//   both loadouts: client code, not the line 899838, which has no rows. Outside Berserk the Rage fills linearly from 0: Max ÷ 2.
// - Rage gained (field 2300005) scales every gain, before the cap. Node 2100: operation 0 gain, 1 consume, 2 lose; method 0 flat, 1 % of
//   Max Rage, 2 % of current, 3 to the limit. Row 2 of 121000001 gives 90% of Max Rage 0.5 s after the affix starts (not modeled: the
//   cycle is steady, and a cold start belongs to chunk 15).
// - Hidden tier lines on Seething Silhouette: 121000006 (5 Rage per channeled stack outside Berserk) and 121000007 (5 Rage consumed per
//   channeled stack in Berserk; not halved by Fury's Onslaught, which only lowers field 2300106).
// - The Seething Spirit's skill use reaches the owner's triggers: 1000070 and 1000074 fire at the same site, and the owner's rows see it
//   (Growing Anger's [6001190], Fury's notMine [6001190]). So its Melee Attack casts pay field 2300106 (434583584 has no notMine), and
//   Starfall's Ranged casts give the 15 Rage (row 4 has no notMine). One link inferred: the event's tags on that row, chunk 1 note §5.
// - Rage Infusion: "+40% Rage gained" and the end of the Disarm are record 709707904 on buff 80203: 5 s after entering Berserk, until
//   Berserk ends. Not outside Berserk, not in the first 5 s. Its stacks count data type 11000002, Rage gained before the cap, so a
//   permanent Berserk at Max Rage still stacks. Whether stacks keep their own 4 s (buff 80204) is not settled.
// - Tunnel Vision: node 624 on casts without the Burst tag, so Burst's ailments do not take it. Records 990447, 101010239 and Furious
//   Roar's row 3 write 3604 on Burst + Ignite / Wilt / Trauma, so their lines reach Burst's ailments (`burstAilmentScale`).
// - Uncontrolled Anger: node 114 is continuous, no whole steps. Rampaging: increased → increased, additional → additional.
// - Burst's cooldown is p0 ÷ max(attr 7010, 0.01): general Cooldown Recovery Speed does not reach it (102360002's gate). Furious Roar has
//   its own gate (its own row), so its own 0.3 s. Level: stone affix 918942, (1 + 10%)^(level − 1), one additional write.
//
// Provisional readings (src/open-questions.js, shown only for Rehan):
// - Burst's level starts at 1 and takes the build's level lines that match its tags. Its own hit can fire Burst only if the cooldown is
//   shorter than its hit delay (checklist §6 test 58): not read.
// - Burst (Anger): triggered on the hits of the player's Attack Skills (once per attack: the trigger is once per source) while
//   Berserk, at most once per cooldown: rate in Berserk = 1 ÷ max(1 ÷ attack uses per second, 0.3 s ÷ (1 + Burst Cooldown Recovery
//   Speed)) (the Activation Medium rule, user-confirmed 2026-10-12), × the Berserk uptime. The 5 s / 20 s windows use the cycle average.
//   Own buffs pre-built (default): Rage full at engagement, so a permanent Berserk holds from t = 0.
// - Seething Spirit: casts the Main Skill (Melee Attack, not Mobility or Channeled; Starfall: Ranged, not Channeled or Parabolic, node
//   808) at the player's own use rate for it, × (1 - 30%) with Fury's Onslaught; Ritual of Offering: always while Berserk;
//   Fury's Onslaught: while the Main Skill is used within every 2 s in Berserk. Each Spirit cast is a full use of the Main Skill with
//   the Berserk-phase lines, Ritual's +40% and Fury's offset (game record). Disarmed (Ritual): the player's Attack Skills pause while
//   Berserk (Rage Infusion: for its first 5 s).
// - Hysteria's Rage: damage taken from Ritual of Offering's self-damage (1% of current Life every 0.2 s in Berserk) and Life consumed by
//   Ancestral Hate (30% of current Life per Spirit skill), current Life read as Max Life (an upper bound); the dummy never attacks.
// - Rage Infusion: stacks = min(max, Rage gained per second × 4 s ÷ 25) in each phase (game buff 80204: 4 s, own timers read).

import { normalizePercentageText } from "./percentage-text.js";
import { buildSkillHitProfile } from "./skill-hit-profiles.js";

export const ANGER = "rehan-anger";
export const SEETHING = "rehan-seething-silhouette";
export const REHAN_HEROES = new Set([ANGER, SEETHING]);
export const TUNNEL_VISION_SWITCH = "rehanTunnelVision";
export const SPIRIT_RETURN_SWITCH = "rehanSpiritReturn";
export const BURST_SETUP_KEY = "rehan:burst";
export const INFUSION_RECENT_SECONDS = 4;
// Fury's Onslaught's second game parameter by rank (tier records 320012 01–05; SS13 = SS14): the Spirit's Berserk additional damage.
export const FURY_SPIRIT_OFFSET = Object.freeze({ 40: -33.33, 47: -36.31, 54: -39.02, 61: -41.52, 68: -43.82 });
// Tier records 320001 01–05, second group (active, not printed in the trait text): 121000006 [5], 121000007 [5].
export const SEETHING_HIDDEN = Object.freeze({ channelStackRage: 5, channelStackCost: 5 });
export const KEYWORDS = Object.freeze({
  rage: Object.freeze({ maxRage: 100, source: "config_char_field 2300000 (Max Rage, default 100); keyword Rage: a default upper limit of 100; at max Rage the Berserker enters Berserk" }),
  berserk: Object.freeze({ bonusFactor: 2, source: "config_c 1640 = 2: in Berserk stat source 24 reads Max Rage × 2 on both loadouts (client); hyperlink 615: gains bonuses twice the Max Rage while Berserk is active; Berserk expires when you run out of Rage" }),
  burst: Object.freeze({ weaponPercent: 340, radiusMeters: 3, perLevelAdditionalPercent: 10, level: 1, gameRow: 90000, tags: Object.freeze(["Attack", "Melee", "Physical", "Triggered", "Area", "Strength", "Dexterity"]),
    source: "Keyword Burst (hover 46230009): 340% of Weapon Damage to enemies within 3 m (dual wielding: the average of both weapons), +10% additional damage (multiplies) per +1 Skill Level; game row config_skill_damage 90000 (one Lv. 1 row, 340% Weapon Damage)" }),
  burstBlast: Object.freeze({ min: 1166, max: 1944, effectiveness: 288, type: "Physical", gameRow: 90003, tags: Object.freeze(["Spell", "Physical", "Triggered", "Area", "Strength", "Dexterity"]),
    source: "Keyword Burst Blast (hover 219965c8): 1166–1944 Spell Physical Damage within 3 m, damage effect 288%; game row config_skill_damage 90003 (Physical 1166–1944, 288%)" }),
  seethingSpirit: "Keyword Seething Spirit (hover bfe0c1e9): an ancestor spirit that casts your Non-Mobility and Non-Channeled Main Melee Attack Skills when it appears",
  disarm: "Keyword Disarm (hover a54e950b): deemed unarmed and unable to use Attack Skills when disarmed"
});
const EPS = 1e-9;
const round = (value) => Math.round(value * 10000) / 10000;
const pct = (value) => Math.round(value * 10000) / 100;
const fmt = (value) => Number.isFinite(value) ? String(round(value)) : "∞";
export const cleanRehan = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").replace(/(\d) %/g, "$1%").replace(/ ([,.:;])/g, "$1").replace(/^\+ (\d)/, "+$1").replace(/\bnon- /gi, "non-").trim();

const N = "(\\d+(?:\\.\\d+)?)";
export const REHAN_PATTERNS = Object.freeze({
  // Rage outside Berserk and the Berserk state (both loadouts).
  rageMelee: new RegExp(`^When not in the Berserk state, each Melee Attack Skill generates ${N} Rage$`, "i"),
  rageChannel: new RegExp(`^When not in the Berserk state, each stack of Melee Attack Skill channeled generates ${N} Rage$`, "i"),
  enter: /^Enter Berserk automatically at Max Rage$/i,
  drain: new RegExp(`^While Berserk is active, ${N} Rage is consumed per second$`, "i"),
  // Anger.
  perRage: new RegExp(`^\\+?${N}% additional damage and \\+?${N}% Movement Speed for every ${N} Rage you have$`, "i"),
  burstTrigger: new RegExp(`^Attacks trigger Burst once on hit while Berserk is active\\. Cooldown: ${N} ?s$`, "i"),
  burstPerLevel: new RegExp(`^\\+?${N}% additional Burst Damage per ${N} levels?$`, "i"),
  moonCdr: new RegExp(`^\\+?${N}% Burst Cooldown Recovery Speed for every ${N} Rage$`, "i"),
  furyGen: new RegExp(`^Generates ${N} Rage per second instead of consuming Rage while Berserk is active$`, "i"),
  furyCost: new RegExp(`^When triggering Burst, consumes ${N} Rage$`, "i"),
  frenzyCrit: new RegExp(`^\\+?${N}% Critical Strike Rating for every ${N} Rage$`, "i"),
  frenzyGain: new RegExp(`^When Burst lands a Critical Strike, generates ${N} Rage\\. Interval: ${N} ?s$`, "i"),
  tunnelPenalty: new RegExp(`^-${N}% additional damage for non-Burst skills$`, "i"),
  burstAdditional: /^([+-]\d+(?:\.\d+)?)% additional Burst Damage$/i,
  rampaging: new RegExp(`^${N}% of the bonus and additional bonus to Attack Speed is also applied to Burst's Cooldown Recovery Speed$`, "i"),
  burstArea: new RegExp(`^\\+${N}% additional Burst Area$`, "i"),
  areaToBurst: new RegExp(`^For every \\+${N}% Skill Area, \\+${N}% additional Burst Damage, up to \\+?${N}%$`, "i"),
  // Seething Silhouette.
  attackSpeedPerRage: new RegExp(`^\\+${N}% Attack Speed for every ${N} Rage$`, "i"),
  berserkMove: new RegExp(`^\\+${N}% Movement Speed while Berserk is active$`, "i"),
  twice: /^Gains bonuses twice the Max Rage while Berserk is active$/i,
  castCost: new RegExp(`^Casting Melee Attack Skills no longer generates Rage and consumes ${N} points of Rage instead while Berserk is active\\. The mode ends when Rage runs out$`, "i"),
  berserkArea: new RegExp(`^\\+${N}% Skill Area while Berserk is active$`, "i"),
  berserkDamage: new RegExp(`^\\+${N}% additional damage while Berserk is active$`, "i"),
  doubleDamage: new RegExp(`^\\+${N}% chance to deal Double Damage every ${N} points of Rage you have$`, "i"),
  ownSpirit: /^Own Seething Spirit$/i,
  ritualSpirit: /^Seething Spirit will always exist and attack automatically while Berserk is active$/i,
  disarmed: /^You are Disarmed while Berserk is active$/i,
  spiritDamage: new RegExp(`^\\+${N}% additional Seething Spirit Damage$`, "i"),
  ritualSelfDamage: new RegExp(`^While Berserk is active, takes Secondary Physical Damage equal to ${N}% of current Life every ${N} ?s\\. This damage is not affected by bonuses$`, "i"),
  onslaughtSpirit: new RegExp(`^When a Melee Main Skill is used while Berserk is active, Seething Spirit appears and automatically attacks for ${N} ?s\\. Using the Melee Main Skill again will refresh the Seething Spirit's duration$`, "i"),
  spiritSpeed: new RegExp(`^-${N}% additional Seething Spirit Attack Speed$`, "i"),
  onslaughtRage: new RegExp(`^Rage will no longer be naturally consumed while Berserk is active\\. The Rage consumed by Melee Attack Skills will be halved\\. \\+${N}% additional damage dealt by the player$`, "i"),
  hysteriaTaken: new RegExp(`^Generates ${N} points? of Rage when taking damage equal to ${N}% of the sum of Max Life and Max Energy Shield$`, "i"),
  hysteriaConsumed: new RegExp(`^Generate ${N} Rage for every ${N}% Max Life consumed$`, "i"),
  growing: new RegExp(`^Gains ${N} additional Rage when Seething Spirit uses a skill\\. The Rage gained is doubled when Seething Spirit deals Double Damage\\. Interval: ${N} ?s$`, "i"),
  splitForm: new RegExp(`^\\+${N}% Rage gained for every ${N} Max Life$`, "i"),
  // Split Form's Max Life line: a plain stat line (the stat sheet reads it) that also feeds the Rage-gained line above.
  splitLife: /^([+-]?\d+(?:\.\d+)?)% additional Max Life$/i,
  infusion: new RegExp(`^\\+${N}% additional damage per ${N} points of Rage gained recently\\. Stacks up to ${N} times$`, "i"),
  infusionDisarm: new RegExp(`^You will no longer be Disarmed after Berserk has been active for ${N} ?s\\. \\+${N}% Rage gained$`, "i"),
  // Hero-exclusive revivals: Hero's Resourcefulness and Furious Roar (Anger).
  blast: /^Burst becomes Burst Blast and can activate Spell Burst$/i,
  onHit: /^All conditions of this trait that trigger on attack are changed to trigger on hit$/i,
  skillUse: /^The Base Trait effect that generates Rage from using Melee Skills is changed to generating Rage upon skill use\./i,
  roarTrigger: new RegExp(`^Attacks trigger Burst once on Critical Strike while Berserk is active\\. Cooldown: ${N} ?s$`, "i"),
  roarPenalty: /^([+-]\d+(?:\.\d+)?)% additional Burst Damage$/i,
  // Ancestral Hate's Life cost and Starfall Wasteland (Seething Silhouette).
  hateConsume: new RegExp(`^Seething Spirit consumes ${N}% of current Life when using skills$`, "i"),
  starfallRanged: /^Seething Spirit now only uses Ranged Projectile Skills \(except Channeled and Parabolic Skills\)$/i,
  starfallRage: new RegExp(`^Generates ${N} Rage when using a Ranged Skill$`, "i"),
  starfallProjectiles: new RegExp(`^\\+(\\d+) to Projectile Quantity, \\+(\\d+) Horizontal Projectile Jump\\(s\\), \\+(\\d+) Horizontal Projectile Penetration\\(s\\), \\+${N}% Projectile Size for Ranged Skills cast by Seething Spirit$`, "i"),
  starfallReturn: new RegExp(`^${N}% chance for Ranged Skills cast by Seething Spirit to return after reaching their max range$`, "i")
});
// Each clause's badge module (src/hero-trait-modules.js).
const GROUP = Object.freeze({
  rageMelee: "rage", rageChannel: "rage", enter: "rage", drain: "rage", perRage: "rage", furyGen: "rage", frenzyCrit: "rage", attackSpeedPerRage: "rage", berserkMove: "rage",
  twice: "rage", castCost: "rage", berserkArea: "rage", berserkDamage: "rage", doubleDamage: "rage", disarmed: "rage", ritualSelfDamage: "rage", onslaughtRage: "rage",
  hysteriaTaken: "rage", hysteriaConsumed: "rage", splitForm: "rage", splitLife: "rage", infusion: "rage", infusionDisarm: "rage", skillUse: "rage", starfallRage: "rage",
  burstTrigger: "burst", burstPerLevel: "burst", moonCdr: "burst", furyCost: "burst", frenzyGain: "burst", tunnelPenalty: "burst", burstAdditional: "burst", rampaging: "burst",
  burstArea: "burst", areaToBurst: "burst", blast: "burst", onHit: "burst", roarTrigger: "burst", roarPenalty: "burst",
  ownSpirit: "spirit", ritualSpirit: "spirit", spiritDamage: "spirit", onslaughtSpirit: "spirit", spiritSpeed: "spirit", growing: "spirit", hateConsume: "spirit",
  starfallRanged: "spirit", starfallProjectiles: "spirit", starfallReturn: "spirit"
});
const KEY_ORDER = Object.keys(GROUP);
export const REHAN_REVIVED_KEYS = new Set(["blast", "onHit", "skillUse", "roarTrigger", "roarPenalty", "hateConsume", "starfallRanged", "starfallRage", "starfallProjectiles", "starfallReturn"]);
const REVIVED_HERO = { blast: ANGER, onHit: ANGER, skillUse: ANGER, roarTrigger: ANGER, roarPenalty: ANGER, hateConsume: SEETHING, starfallRanged: SEETHING, starfallRage: SEETHING, starfallProjectiles: SEETHING, starfallReturn: SEETHING };

/** The clause key of a Rehan line, or null. `revived`: only the revived keys. */
export function rehanClauseKey(text, { revived = false } = {}) {
  const clean = cleanRehan(text);
  const keys = revived ? [...REHAN_REVIVED_KEYS] : KEY_ORDER.filter((key) => !REHAN_REVIVED_KEYS.has(key));
  return keys.find((key) => REHAN_PATTERNS[key].test(clean)) || null;
}
/** The badge module of a Rehan line ("rage", "burst", "spirit"), or null. */
export const rehanModuleOf = (text, options) => GROUP[rehanClauseKey(text, options)] || null;
/** Whether a revived (memory) line of this loadout is read here. */
export function rehanRevivedLine(heroId, text) {
  const key = rehanClauseKey(text, { revived: true });
  return Boolean(key) && REVIVED_HERO[key] === heroId;
}

const linesOf = (modifierTexts, heroId) => modifierTexts.filter((line) => line && line.origin !== "derived" && !line.lineEffect && (line.origin === "trait" || (line.origin === "memory" && rehanRevivedLine(heroId, line.text)))).map((line) => ({ ...line, clean: cleanRehan(line.text) }));
const all = (lines, key) => lines.flatMap((line) => { const match = line.clean.match(REHAN_PATTERNS[key]); return match && (REHAN_REVIVED_KEYS.has(key) ? line.origin === "memory" : line.origin === "trait") ? [{ line, match }] : []; });
const first = (lines, key) => all(lines, key)[0] || null;
const plainSum = (modifierTexts, pattern) => modifierTexts.filter((line) => line && line.origin !== "derived" && !line.lineEffect).reduce((total, line) => {
  const match = cleanRehan(line.text).match(pattern);
  return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0);
}, 0);
const MAX_RAGE = /^\+(\d+(?:\.\d+)?) (?:to )?Max Rage$/i;
const RAGE_GAINED = /^([+-]?\d+(?:\.\d+)?)% Rage gained$/i;
const DOUBLE_DAMAGE = /^\+(\d+(?:\.\d+)?)% chance to deal Double Damage$/i;

/** Burst's hit profile (src/skill-hit-profiles.js builder): the attack row (340% Weapon Damage) or, with Hero's Resourcefulness, Burst Blast. */
export function burstProfile({ blast = false } = {}) {
  const levels = (row) => Object.fromEntries(Array.from({ length: 20 }, (_, index) => [String(index + 1), row]));
  const keyword = blast ? KEYWORDS.burstBlast : KEYWORDS.burst;
  const definition = blast
    ? { name: "Burst Blast", delivery: "spell-area", components: [{ key: "blast", label: "Burst Blast", groupId: keyword.gameRow, group: { id: keyword.gameRow, synthetic: `game row ${keyword.gameRow}`, levels: levels({ kind: "hit", effectiveness: keyword.effectiveness, entries: [{ type: keyword.type, min: keyword.min, max: keyword.max }] }) }, perUse: 1, basis: "text", note: "one area hit within 3 m per trigger (the dummy inside: best case)" }],
      notes: [`Burst Blast (hero trait audit B10): ${keyword.source}. Its single row is read at every level; levels add +10% additional damage each (multiplies).`] }
    : { name: "Burst", delivery: "attack-melee", weaponScaling: { baseTypes: ["Physical"], restriction: null },
      components: [{ key: "burst", label: "Burst", groupId: keyword.gameRow, group: { id: keyword.gameRow, synthetic: `game row ${keyword.gameRow}`, levels: levels({ kind: "hit", effectiveness: keyword.weaponPercent, entries: [] }) }, perUse: 1, basis: "text", note: "one area explosion within 3 m per trigger (the dummy inside: best case)" }],
      notes: [`Burst (hero trait audit B10): ${keyword.source}. Its single row is read at every level; levels add +10% additional damage each (multiplies).`] };
  const profile = buildSkillHitProfile(definition);
  const tags = [...keyword.tags];
  return Object.freeze({ ...profile, tags, spell: blast, mainStats: tags.filter((tag) => ["Strength", "Dexterity", "Intelligence"].includes(tag)),
    useModel: { kind: "rate", usesPerSecond: 0, firstUseSeconds: null, note: "triggered by the trait (hero trait audit B10)" }, spellBurstAllowed: blast,
    sources: { refdata: blast ? "" : "", gameData: `config_skill_damage group ${keyword.gameRow} (one Lv. 1 row; SS14 flat extraction 2026-10-15)`, timing: "triggered by Anger (no use time)" } });
}

const spiritEligible = (main, starfall) => {
  if (!main) return { ok: false, reason: "no active Main Skill" };
  const tags = new Set(main.tags || []);
  if (starfall) {
    if (!tags.has("Ranged") || !tags.has("Projectile")) return { ok: false, reason: `Starfall Wasteland: the Spirit only uses Ranged Projectile Skills, and ${main.name} is not one` };
    if (tags.has("Channeled") || tags.has("Parabolic")) return { ok: false, reason: `Starfall Wasteland: ${main.name} is a Channeled or Parabolic skill` };
    return { ok: true, reason: "" };
  }
  if (!tags.has("Melee") || !tags.has("Attack")) return { ok: false, reason: `the Seething Spirit casts Main Melee Attack Skills (keyword), and ${main.name} is not one` };
  if (tags.has("Mobility") || tags.has("Channeled")) return { ok: false, reason: `the Seething Spirit casts Non-Mobility and Non-Channeled skills (keyword), and ${main.name} is a Mobility or Channeled skill` };
  return { ok: true, reason: "" };
};

/**
 * @param {object} p
 * @param {string} p.heroId the selected loadout
 * @param {object[]} p.modifierTexts the build's lines (before the derived lines)
 * @param {object} p.requestedConditions the combat conditions (the best-case switches, prebuiltSelfBuffs)
 * @param {object|null} p.facts the hit pass's measured rates (null before it): { meleeCasts, channelStacks, skillUses, rangedUses,
 *   attackUses, attackCritUses, hitUses, mainUses, burstCritChance, attackIncreasedPercent, rageAttackSpeedPercent }
 * @param {object} p.inputs { main: { setupKey, name, tags }, characterLevel: { level, stored }, maxLife, maxEnergyShield,
 *   skillAreaPercent, attackSpeed (the weapon model's attackSpeed: Rampaging) }
 */
export function rehanState({ heroId = "", modifierTexts = [], requestedConditions = {}, facts = null, inputs = {} } = {}) {
  if (!REHAN_HEROES.has(heroId)) return null;
  const lines = linesOf(modifierTexts, heroId);
  const one = (key) => first(lines, key);
  const has = (key) => Boolean(one(key));
  const anger = heroId === ANGER;
  const measured = Boolean(facts);
  const prebuilt = requestedConditions.prebuiltSelfBuffs !== false;
  const maxRage = KEYWORDS.rage.maxRage + plainSum(modifierTexts, MAX_RAGE);
  const enters = has("enter");
  // In Berserk stat source 24 reads Max Rage × config_c 1640 on both loadouts: client code, no line needed.
  const doubled = enters;
  const berserkLevel = doubled ? KEYWORDS.berserk.bonusFactor * maxRage : maxRage / 2;
  const outLevel = maxRage / 2;

  // ---- Rage gained (+%): Split Form per 40 Max Life, plain lines; Rage Infusion's +40% only from 5 s into Berserk (record 709707904) ----
  const maxLife = Math.max(0, Number(inputs.maxLife) || 0), maxEnergyShield = Math.max(0, Number(inputs.maxEnergyShield) || 0);
  const split = one("splitForm");
  const splitPercent = split ? Number(split.match[1]) * Math.floor(maxLife / Number(split.match[2]) + EPS) : 0;
  const infusionDisarm = one("infusionDisarm");
  const infusionGained = infusionDisarm ? Number(infusionDisarm.match[2]) : 0;
  const infusionAfterSeconds = infusionDisarm ? Number(infusionDisarm.match[1]) : 0;
  const plainGained = plainSum(modifierTexts, RAGE_GAINED);
  const gainedPercent = round(splitPercent + plainGained);
  const G = Math.max(0, 1 + gainedPercent / 100);
  // The gains from 5 s into Berserk, against G.
  const lateFactor = Math.max(0, 1 + (gainedPercent + infusionGained) / 100) / Math.max(EPS, G);

  // ---- The measured rates, corrected for each phase's Rage Attack Speed (Seething Silhouette: +1% per 5 Rage) ----
  const asLine = one("attackSpeedPerRage");
  const asPer = asLine ? Number(asLine.match[1]) / Number(asLine.match[2]) : 0;
  const attackInc = Number(facts?.attackIncreasedPercent) || 0, measuredRageAs = Number(facts?.rageAttackSpeedPercent) || 0;
  const asFactor = (level) => asPer ? Math.max(0, 1 + (attackInc - measuredRageAs + asPer * level) / 100) / Math.max(EPS, 1 + attackInc / 100) : 1;
  const fact = (key) => Math.max(0, Number(facts?.[key]) || 0);
  const ratesAt = (level) => {
    const k = asFactor(level), attackExtra = fact("attackUses") * (k - 1);
    return { melee: fact("meleeCasts") * k, stacks: fact("channelStacks") * k, ranged: fact("rangedUses") * k, attack: fact("attackUses") * k, attackCrit: fact("attackCritUses") * k, main: fact("mainUses") * k, skill: fact("skillUses") + attackExtra, hits: fact("hitUses") + attackExtra };
  };
  const out = ratesAt(outLevel), inside = ratesAt(berserkLevel);

  // ---- Rage outside Berserk ----
  const melee = one("rageMelee"), channel = one("rageChannel"), starfallRage = one("starfallRage");
  const resource = has("skillUse");
  const hiddenChannel = heroId === SEETHING && enters;
  const perMelee = melee ? Number(melee.match[1]) : 0, perStack = channel ? Number(channel.match[1]) : hiddenChannel ? SEETHING_HIDDEN.channelStackRage : 0, perRanged = starfallRage ? Number(starfallRage.match[1]) : 0;
  const outParts = { melee: G * perMelee * (resource ? out.skill : out.melee), channel: G * perStack * out.stacks, ranged: G * perRanged * out.ranged };
  const outGain = outParts.melee + outParts.channel + outParts.ranged;
  // Outside Berserk the Rage fills linearly from 0 (its bonuses read Max ÷ 2); with no Rage gained it stays at 0.
  const outBonusLevel = outGain > EPS || !measured ? maxRage / 2 : 0;

  // ---- Seething Spirit: its casts in Berserk (for Growing Anger / Hysteria) ----
  const ritual = has("ritualSpirit"), onslaught = one("onslaughtSpirit"), starfall = has("starfallRanged");
  // "Own Seething Spirit" grants the Spirit; Ritual of Offering / Fury's Onslaught say when it attacks.
  const spiritSource = !has("ownSpirit") ? null : ritual ? "ritual" : onslaught ? "onslaught" : null;
  const eligible = spiritEligible(inputs.main, starfall);
  const speedLine = one("spiritSpeed");
  const spiritSpeedFactor = speedLine ? Math.max(0, 1 - Number(speedLine.match[1]) / 100) : 1;
  const onslaughtSeconds = onslaught ? Number(onslaught.match[1]) : 0;
  const spiritPresence = !spiritSource || !eligible.ok ? 0 : spiritSource === "ritual" || !measured ? 1 : Math.min(1, onslaughtSeconds * inside.main);
  const spiritUsesIn = spiritPresence > 0 && measured ? inside.main * spiritSpeedFactor * spiritPresence : 0;

  // ---- Burst (Anger): its triggers in Berserk (Righteous Fury's cost, Frenzy Furious's gain read them) ----
  const trigger = one("burstTrigger"), roar = one("roarTrigger");
  const moon = one("moonCdr"), rampaging = one("rampaging"), levelLine = one("burstPerLevel"), areaLine = one("areaToBurst");
  const characterLevel = Number(inputs.characterLevel?.level) || 100;
  const skillArea = Number(inputs.skillAreaPercent) || 0;
  const burst = trigger || roar ? {
    blast: has("blast"), onHit: has("onHit"), base: Boolean(trigger), cooldownSeconds: Number((trigger || roar).match[1]), roar: roar ? { cooldownSeconds: Number(roar.match[1]) } : null,
    moonPercent: moon ? Number(moon.match[1]) * berserkLevel / Number(moon.match[2]) : 0, rampagingShare: rampaging ? Number(rampaging.match[1]) / 100 : 0,
    perLevel: levelLine ? { percent: Number(levelLine.match[1]), per: Number(levelLine.match[2]), level: characterLevel, stored: Boolean(inputs.characterLevel?.stored), value: round(Number(levelLine.match[1]) * Math.floor(characterLevel / Number(levelLine.match[2]) + EPS)) } : null,
    additional: [...all(lines, "burstAdditional"), ...all(lines, "roarPenalty")].map((item) => ({ source: item.line.source, text: item.line.clean, value: Number(item.match[1]) })),
    // Node 114: continuous, no whole steps.
    area: areaLine ? { per: Number(areaLine.match[1]), gain: Number(areaLine.match[2]), cap: Number(areaLine.match[3]), skillArea: round(skillArea), value: round(Math.min(Number(areaLine.match[3]), skillArea / Number(areaLine.match[1]) * Number(areaLine.match[2]))) } : null,
    events: { attack: inside.attack, attackCrit: inside.attackCrit, hits: inside.hits }, critChance: round(Math.max(0, Math.min(1, fact("burstCritChance")))), measured
  } : null;
  const burstRateIn = burst ? burstCadence({ burst, rage: { uptime: 1 } }, inputs.attackSpeed || null).inBerserk : 0;
  if (burst) burst.burstRateIn = round(burstRateIn);
  const burstCrit = burst ? burst.critChance : 0;

  // ---- Berserk: the net Rage change per second (phase A: disarmed, phase B: attacking) ----
  const drain = one("drain"), furyGen = one("furyGen"), furyCost = one("furyCost"), frenzy = one("frenzyGain");
  const castCost = one("castCost"), onslaughtRage = one("onslaughtRage");
  const disarmLine = has("disarmed");
  const disarmSeconds = !disarmLine ? 0 : infusionDisarm ? Number(infusionDisarm.match[1]) : Infinity;
  const natural = furyGen ? G * Number(furyGen.match[1]) : onslaughtRage ? 0 : drain ? -Number(drain.match[1]) : 0;
  const furyCostRate = furyCost && trigger ? Number(furyCost.match[1]) * burstRateIn : 0;
  const frenzyRate = frenzy && (trigger || roar) ? G * Number(frenzy.match[1]) * Math.min(burstRateIn * burstCrit, 1 / Math.max(EPS, Number(frenzy.match[2]))) : 0;
  const ddLine = one("doubleDamage");
  const ddPer = ddLine ? Number(ddLine.match[1]) / Number(ddLine.match[2]) : 0;
  const spiritDoubleChance = Math.min(1, (ddPer * berserkLevel + plainSum(modifierTexts, DOUBLE_DAMAGE)) / 100);
  const growing = one("growing");
  const growingUses = growing ? Math.min(spiritUsesIn, 1 / Math.max(EPS, Number(growing.match[2]))) : 0;
  const growingRate = growing ? G * Number(growing.match[1]) * (1 + spiritDoubleChance) * growingUses : 0;
  const selfDamage = one("ritualSelfDamage"), hysteriaTaken = one("hysteriaTaken");
  const lifeShare = maxLife > 0 ? maxLife / (maxLife + maxEnergyShield) : 0;
  const takenRate = selfDamage && hysteriaTaken ? G * Number(hysteriaTaken.match[1]) * (Number(selfDamage.match[1]) / Number(selfDamage.match[2])) / Number(hysteriaTaken.match[2]) * lifeShare : 0;
  const consumed = one("hysteriaConsumed"), hate = one("hateConsume");
  const consumedRate = consumed && hate ? G * Number(consumed.match[1]) * spiritUsesIn * Number(hate.match[1]) / Number(consumed.match[2]) : 0;
  // Field 2300106 per Melee Attack cast (halved by Fury's Onslaught's -5); hidden 121000007: 5 per channeled stack, not halved.
  const castCostPerUse = castCost ? Number(castCost.match[1]) * (onslaughtRage ? 0.5 : 1) : 0;
  const channelCostRate = hiddenChannel ? SEETHING_HIDDEN.channelStackCost * inside.stacks : 0;
  const castCostRate = castCostPerUse * inside.melee + channelCostRate;
  const rangedRateIn = G * perRanged * inside.ranged;
  // The Spirit's casts: its Melee Attack casts pay the same cost, its Ranged casts give Starfall's Rage (no notMine on either row).
  const spiritCostRate = starfall ? 0 : castCostPerUse * spiritUsesIn;
  const spiritRangedRate = starfall ? G * perRanged * spiritUsesIn : 0;
  // The Rage cycle for a set of rates (the build's, or one clause left out: the badges' leave-one-out reading). Phase A: until
  // `split` (the Disarm's end, Rage Infusion's 5 s; all of Berserk with Ritual alone), phase B after it (the gains × `late`).
  const infusion = one("infusion");
  const stacksFor = (gainRate) => infusion ? Math.min(Number(infusion.match[3]), gainRate * INFUSION_RECENT_SECONDS / Number(infusion.match[2])) : 0;
  const cycleFor = ({ out = outGain, nat = natural, cost = furyCostRate, frenzyGain = frenzyRate, grow = growingRate, taken = takenRate, consumedGain = consumedRate, cast = castCostRate, ranged = rangedRateIn, spiritCost = spiritCostRate, spiritRanged = spiritRangedRate, disarmFor = disarmSeconds, late = lateFactor } = {}) => {
    const attacksInA = !(disarmFor > 0);
    const shared = Math.max(0, nat) + frenzyGain + grow + taken + consumedGain + spiritRanged;
    const loss = Math.max(0, -nat) + cost + spiritCost;
    const gainsA = shared + (attacksInA ? ranged : 0), gainsB = late * (shared + ranged);
    const netA = gainsA - loss - (attacksInA ? cast : 0), netB = gainsB - loss - cast;
    const fill = out > EPS ? maxRage / out : Infinity;
    const split = disarmFor === Infinity ? Infinity : Math.max(disarmFor, infusionAfterSeconds);
    // How long Berserk lasts from Max Rage (Infinity: Rage never runs out).
    let seconds;
    if (!enters) seconds = 0;
    else if (split === Infinity) seconds = netA >= -EPS ? Infinity : maxRage / -netA;
    else if (split > 0) {
      const after = netA >= 0 ? maxRage : maxRage + netA * split;
      seconds = after <= EPS ? maxRage / -netA : netB >= -EPS ? Infinity : split + after / -netB;
    } else seconds = netB >= -EPS ? Infinity : maxRage / -netB;
    // Uptime: a permanent Berserk holds once entered (pre-built Rage: from t = 0); otherwise Berserk ÷ (Berserk + fill).
    const up = !enters ? 0 : !measured ? 1 : seconds === Infinity ? (out > EPS || prebuilt ? 1 : 0) : Number.isFinite(fill) ? seconds / (seconds + fill) : 0;
    const disarm = !disarmLine || !(up > 0) ? 0 : disarmFor === Infinity ? 1 : seconds === Infinity ? 0 : Math.min(1, disarmFor / seconds);
    // Rage gained recently (Rage Infusion): data type 11000002, before the cap, so Max Rage does not stop it. Phase B's share of Berserk.
    const lateShare = split === Infinity ? 0 : !(split > 0) || seconds === Infinity ? 1 : Math.max(0, 1 - split / Math.max(EPS, seconds));
    const stacks = { out: stacksFor(out), in: (1 - lateShare) * stacksFor(gainsA) + lateShare * stacksFor(gainsB) };
    return { gainsA, gainsB, netA, netB, fill, seconds, uptime: up, disarm, stacks };
  };
  const cycle = cycleFor();
  const { netA, netB, uptime } = cycle;
  const fillSeconds = cycle.fill, berserkSeconds = cycle.seconds, disarmShare = cycle.disarm, infusionStacks = cycle.stacks;
  // Whether leaving a rate out changes the cycle (the uptime, the Disarm share or the Rage Infusion stacks).
  const changes = (patch) => { const other = cycleFor(patch); return Math.abs(other.uptime - uptime) > EPS || Math.abs(other.disarm - disarmShare) > EPS || Math.abs(other.stacks.out - infusionStacks.out) > EPS || Math.abs(other.stacks.in - infusionStacks.in) > EPS; };
  // The Rage-gained multiplier left out (Split Form's or Rage Infusion's share): every gain scales by k.
  const scaled = (percent) => { const k = Math.max(0, 1 + (gainedPercent - percent) / 100) / Math.max(EPS, G); return { out: outGain * k, nat: furyGen ? natural * k : natural, frenzyGain: frenzyRate * k, grow: growingRate * k, taken: takenRate * k, consumedGain: consumedRate * k, ranged: rangedRateIn * k, spiritRanged: spiritRangedRate * k }; };
  const matters = {
    melee: changes({ out: outGain - outParts.melee }), channel: changes({ out: outGain - outParts.channel }), ranged: changes({ out: outGain - outParts.ranged, ranged: 0, spiritRanged: 0 }),
    furyCost: changes({ cost: 0 }), frenzy: changes({ frenzyGain: 0 }), cast: changes({ cast: 0, spiritCost: 0 }), growing: changes({ grow: 0 }), taken: changes({ taken: 0 }), consumed: changes({ consumedGain: 0 }),
    split: splitPercent > 0 && changes(scaled(splitPercent)), infusionGained: infusionGained > 0 && changes({ late: 1 }),
    // Hero's Resourcefulness: Rage from every skill use instead of the Melee Attack uses only; Rage Infusion's end of the Disarm.
    resource: resource && changes({ out: outGain - G * perMelee * Math.max(0, out.skill - out.melee) }), disarmEnd: disarmLine && Boolean(infusionDisarm) && changes({ disarmFor: Infinity })
  };
  // The player's attacking time (Disarmed: no Attack Skills during that share of Berserk).
  const playerOut = 1 - uptime, playerIn = uptime * (1 - disarmShare);
  const playerShare = playerOut + playerIn;

  const weights = { average: { out: 1 - uptime, in: uptime }, berserk: { out: 0, in: 1 }, player: playerShare > EPS ? { out: playerOut / playerShare, in: playerIn / playerShare } : { out: 1 - uptime, in: uptime } };
  const rage = { maxRage, enters, doubled, berserkLevel, outLevel: outBonusLevel, gainedPercent, splitPercent, infusionGained, infusionAfterSeconds, lateFactor: round(lateFactor), plainGained, G: round(G), resource,
    outParts: { melee: round(outParts.melee), channel: round(outParts.channel), ranged: round(outParts.ranged) }, outGain: round(outGain), fillSeconds: Number.isFinite(fillSeconds) ? round(fillSeconds) : Infinity,
    natural: round(natural), furyGen: Boolean(furyGen), noNaturalDrain: Boolean(onslaughtRage), furyCostRate: round(furyCostRate), frenzyRate: round(frenzyRate), growingRate: round(growingRate), takenRate: round(takenRate), consumedRate: round(consumedRate),
    castCostRate: round(castCostRate), channelCostRate: round(channelCostRate), spiritCostRate: round(spiritCostRate), rangedRateIn: round(rangedRateIn), spiritRangedRate: round(spiritRangedRate), netA: round(netA), netB: round(netB), disarmSeconds, berserkSeconds: Number.isFinite(berserkSeconds) ? round(berserkSeconds) : Infinity,
    uptime: round(uptime), disarmShare: round(disarmShare), playerShare: round(playerShare), infusionStacks: { out: round(infusionStacks.out), in: round(infusionStacks.in) }, measured, prebuilt,
    // Leave-one-out readings for the badges: does leaving the clause's rate out change the cycle?
    matters };

  // ---- Seething Spirit ----
  const spiritDamage = one("spiritDamage");
  const furyBonus = onslaughtRage ? Number(onslaughtRage.match[1]) : 0;
  const furyOffset = onslaughtRage ? FURY_SPIRIT_OFFSET[furyBonus] ?? null : null;
  const projectiles = one("starfallProjectiles"), returning = one("starfallReturn");
  const spirit = spiritSource ? {
    source: spiritSource, eligible: eligible.ok, reason: eligible.reason, mainSetupKey: inputs.main?.setupKey || null, mainName: inputs.main?.name || null, starfall,
    presence: round(spiritPresence), onslaughtSeconds, speedFactor: round(spiritSpeedFactor), usesInBerserk: round(spiritUsesIn), active: eligible.ok && spiritPresence > 0 && uptime > 0,
    additional: [...(spiritDamage ? [{ source: spiritDamage.line.source, text: `${spiritDamage.line.clean} (Seething Spirit casts)`, value: Number(spiritDamage.match[1]) }] : []),
      ...(onslaughtRage && furyOffset !== null ? [{ source: onslaughtRage.line.source, text: `${furyOffset}% additional damage for the Seething Spirit while Berserk (Fury's Onslaught: game record 187841424's second parameter, the Spirit's offset to the player's +${furyBonus}%)`, value: furyOffset }] : [])],
    extraLines: projectiles && starfall ? [{ text: `+${projectiles.match[1]} Projectile Quantity`, source: projectiles.line.source, origin: "memory", multiplier: 1 }, { text: `+${projectiles.match[3]} Horizontal Projectile Penetration(s)`, source: projectiles.line.source, origin: "memory", multiplier: 1 }] : [],
    returning: returning && starfall ? { percent: Number(returning.match[1]), on: requestedConditions[SPIRIT_RETURN_SWITCH] !== false, source: returning.line.source, active: false, reason: "settled with the Spirit's casts" } : null,
    doubleChance: round(spiritDoubleChance)
  } : null;

  // ---- Tunnel Vision ----
  const tunnelLine = one("tunnelPenalty");
  const tunnel = tunnelLine ? { percent: Number(tunnelLine.match[1]), on: requestedConditions[TUNNEL_VISION_SWITCH] !== false, source: tunnelLine.line.source } : null;

  const state = { heroId, anger, measured, facts: facts || null, inputs: { maxLife, maxEnergyShield, skillAreaPercent: skillArea, characterLevel: inputs.characterLevel || null, main: inputs.main || null },
    rage, weights, burst, spirit, tunnel, burstHit: null, spiritHit: null,
    needsRates: Boolean(enters || trigger || roar || spiritSource) };
  state.bodiesSource = phaseSources(lines, state);
  state.averageBodies = rehanPhaseBodies(state, "average");
  state.cadence = burstCadence(state, inputs.attackSpeed || null);
  return withAssumptions(state);
}

// The per-clause phase readers: perRage, frenzyCrit, attackSpeedPerRage, doubleDamage, berserkDamage, onslaughtRage, infusion. Each
// value is linear in the phase values, so a weighting is their weighted mean (expected-value reading).
const signed = (value, unit) => `${value >= 0 ? "+" : ""}${round(value)}% ${unit}`;
function phaseSources(lines, state) {
  const one = (key) => first(lines, key);
  const sources = [];
  const perRage = (key, unit, perIndex) => {
    const item = one(key);
    if (!item) return;
    const percent = Number(item.match[1]), every = Number(item.match[perIndex]);
    sources.push({ key, source: item.line.source, value: (level) => percent * level / every, unit });
  };
  perRage("perRage", "additional damage", 3);
  perRage("frenzyCrit", "Critical Strike Rating", 2);
  perRage("attackSpeedPerRage", "Attack Speed", 2);
  const dd = one("doubleDamage");
  if (dd) sources.push({ key: "doubleDamage", source: dd.line.source, value: (level) => Number(dd.match[1]) * level / Number(dd.match[2]), text: (value) => `+${round(value)}% chance to deal Double Damage` });
  for (const key of ["berserkDamage", "onslaughtRage"]) {
    const item = one(key);
    if (item) sources.push({ key, source: item.line.source, value: (_, w) => Number(item.match[1]) * w.in, unit: "additional damage" });
  }
  const infusion = one("infusion");
  if (infusion) sources.push({ key: "infusion", source: infusion.line.source, value: (_, w) => Number(infusion.match[1]) * (w.out * state.rage.infusionStacks.out + w.in * state.rage.infusionStacks.in), unit: "additional damage" });
  return sources;
}

/** The Rage-driven bodies for a weighting ("average": the time average; "berserk": Berserk only; "player": the player's attacking time). */
export function rehanPhaseBodies(state, weighting = "average") {
  if (!state) return [];
  const w = state.weights[weighting] || state.weights.average;
  const level = w.out * state.rage.outLevel + w.in * state.rage.berserkLevel;
  return (state.bodiesSource || []).flatMap((item) => {
    const value = item.value(level, w);
    if (!(Math.abs(value) > EPS)) return [];
    return [{ key: item.key, value: round(value), source: item.source, unit: item.unit ?? null, text: item.text ? item.text(value) : signed(value, item.unit) }];
  });
}

/** The derived line objects for a weighting (src/planner.js swaps them in for Burst, the Spirit and the disarmed player). */
export function rehanPhaseLines(state, weighting = "average") {
  return rehanPhaseBodies(state, weighting).map((item) => ({ text: item.text, source: item.source, origin: "trait", multiplier: 1, derivedFrom: item.source, rehanPhase: weighting, lineEffect: { conditional: true, key: "heroModule", conditionText: `Rehan: Rage bonuses (${weighting === "berserk" ? "while Berserk is active" : weighting === "player" ? "the player's attacking time" : "time-averaged"})`, provisional: true } }));
}

/** Burst's cooldown and trigger rate (Rampaging reads the weapon model's Attack Speed bonuses). */
export function burstCadence(state, attackSpeed = null) {
  const burst = state?.burst;
  if (!burst) return null;
  const share = burst.rampagingShare || 0;
  const increased = share * Math.max(0, Number(attackSpeed?.increasedPercent) || 0);
  const additionalFactor = share ? (attackSpeed?.sources || []).filter((line) => line.additional && Number(line.value)).reduce((product, line) => product * Math.max(0, 1 + share * Number(line.value) / 100), 1) : 1;
  const cdrPercent = burst.moonPercent + increased;
  const events = burst.onHit ? burst.events.hits : burst.events.attack;
  const critEvents = burst.events.attackCrit;
  const measured = burst.measured;
  const fromEvents = (rate, cd) => !measured ? 1 / cd : rate > EPS ? 1 / Math.max(1 / rate, cd) : 0;
  // The trigger rates for a Cooldown Recovery Speed (the build's, or one part left out: the badges' leave-one-out reading).
  const ratesFor = (percent, additional) => {
    const factor = Math.max(EPS, 1 + percent / 100) * additional;
    const cooldown = burst.cooldownSeconds / factor, roarCooldown = burst.roar ? burst.roar.cooldownSeconds / factor : null;
    const hitRate = burst.base ? fromEvents(events, cooldown) : 0, roarRate = burst.roar ? fromEvents(critEvents, roarCooldown) : 0;
    return { cooldown, roarCooldown, hitRate, roarRate, inBerserk: hitRate + roarRate };
  };
  const { cooldown, roarCooldown, hitRate, roarRate, inBerserk } = ratesFor(cdrPercent, additionalFactor);
  const binds = !measured || (events > EPS && 1 / events < cooldown - EPS) || (Boolean(burst.roar) && critEvents > EPS && 1 / critEvents < roarCooldown - EPS);
  const moonMatters = burst.moonPercent > 0 && Math.abs(ratesFor(increased, additionalFactor).inBerserk - inBerserk) > EPS;
  const rampagingMatters = share > 0 && Math.abs(ratesFor(burst.moonPercent, 1).inBerserk - inBerserk) > EPS;
  const uptime = state.rage.uptime;
  return { cooldownSeconds: round(cooldown), baseCooldownSeconds: burst.cooldownSeconds, cdrPercent: round(cdrPercent), moonPercent: round(burst.moonPercent), rampagingIncreased: round(increased), rampagingAdditionalFactor: round(additionalFactor),
    eventsPerSecond: round(events), eventKind: burst.onHit ? "uses of every hitting skill" : "Attack Skill uses", hitRate: round(hitRate), roarRate: round(roarRate), roarCooldownSeconds: roarCooldown === null ? null : round(roarCooldown), critEventsPerSecond: round(critEvents),
    binds, moonMatters, rampagingMatters, inBerserk: round(inBerserk), usesPerSecond: round(inBerserk * uptime), uptime, measured };
}

/** The Burst source's additional damage lines (src/planner.js heroEffects.additional) with its level bonus. */
export function burstAdditionalLines(state, { levels = 0 } = {}) {
  const burst = state?.burst;
  if (!burst) return [];
  const lines = [];
  if (burst.perLevel?.value) lines.push({ source: "Hero trait: Anger", text: `+${burst.perLevel.percent}% additional Burst Damage per ${burst.perLevel.per} level × character level ${burst.perLevel.level}${burst.perLevel.stored ? "" : " (not stored: the default 100)"} = +${burst.perLevel.value}%`, value: burst.perLevel.value });
  for (const line of burst.additional) lines.push({ source: line.source, text: line.text, value: line.value });
  if (burst.area?.value) lines.push({ source: "Hero trait: Uncontrolled Anger", text: `For every +${burst.area.per}% Skill Area, +${burst.area.gain}% additional Burst Damage: +${burst.area.skillArea}% Skill Area → +${burst.area.value}% (cap ${burst.area.cap}%)`, value: burst.area.value });
  if (levels > 0) lines.push({ source: "Burst: Skill Level", text: `+${levels} Skill Level(s) × +10% additional damage (multiplies, Burst keyword) = +${round((1.1 ** levels - 1) * 100)}%`, value: round((1.1 ** levels - 1) * 100) });
  return lines;
}

/**
 * The factors on the ailments Burst itself inflicts (src/ailment-applications.js), against the build's shared layers: Tunnel Vision's
 * penalty is off them (node 624 only on casts without the Burst tag), the 3604 writes on Burst + Ignite / Wilt / Trauma are on them
 * (990447, 101010239, Furious Roar's row 3; Uncontrolled Anger has no such write), its level is on them as any skill's, and the Rage
 * lines are the Berserk ones (the attacker's lines are fixed at application, chunk 0 note §5).
 */
export function burstAilmentScale(state, { levels = 0 } = {}) {
  const burst = state?.burst;
  if (!burst) return [];
  const lines = [];
  if (state.tunnel?.on) lines.push({ source: state.tunnel.source, text: `Tunnel Vision's -${state.tunnel.percent}% is not on Burst's ailments (game record 277809984: casts without the Burst tag)`, factor: 1 / Math.max(EPS, 1 - state.tunnel.percent / 100) });
  if (burst.perLevel?.value) lines.push({ source: "Hero trait: Anger", text: `+${burst.perLevel.value}% additional Burst Damage on its ailments (game record 990447: attr 3604 on Burst + Ignite / Wilt / Trauma)`, factor: 1 + burst.perLevel.value / 100 });
  for (const line of burst.additional) lines.push({ source: line.source, text: `${line.text} on its ailments (attr 3604 on Burst + Ignite / Wilt / Trauma)`, factor: Math.max(0, 1 + line.value / 100) });
  if (levels > 0) lines.push({ source: "Burst: Skill Level", text: `+${levels} Skill Level(s), one additional write (stone affix 918942)`, factor: 1.1 ** levels });
  const bodies = (weighting) => rehanPhaseBodies(state, weighting).filter((item) => item.unit === "additional damage").reduce((total, item) => total + item.value, 0);
  const phase = (1 + bodies("berserk") / 100) / Math.max(EPS, 1 + bodies("average") / 100);
  if (Math.abs(phase - 1) > EPS) lines.push({ source: "Hero trait: Rage", text: "the Rage lines at the Berserk level, where Burst fires", factor: phase });
  return lines;
}

/** The state with the settled Burst cadence (the final weapon model) and the computed Burst / Spirit hits, for the badges. */
export function withRehanHits(state, { attackSpeed = null, burstHit = null, spiritHit = null, spiritReturning = null } = {}) {
  if (!state) return state;
  const spirit = state.spirit && spiritReturning && state.spirit.returning ? { ...state.spirit, returning: { ...state.spirit.returning, ...spiritReturning } } : state.spirit;
  return withAssumptions({ ...state, spirit, cadence: attackSpeed ? burstCadence(state, attackSpeed) : state.cadence, burstHit: burstHit || state.burstHit, spiritHit: spiritHit || state.spiritHit });
}

function withAssumptions(state) {
  const { rage, burst, spirit, tunnel, cadence } = state;
  const switches = [];
  if (tunnel) switches.push({ id: TUNNEL_VISION_SWITCH, label: "Tunnel Vision: -80% additional damage for non-Burst skills (applied)", enabled: tunnel.on, active: tunnel.on, summary: tunnel.on ? `every skill but Burst deals -${tunnel.percent}% additional damage` : "the penalty is switched off: the non-Burst skills keep their damage", reason: tunnel.on ? "applied so the build does not read stronger than it is (Q-H15, provisional)" : "switched off" });
  if (spirit?.returning) switches.push({ id: SPIRIT_RETURN_SWITCH, label: "Starfall Wasteland: the Spirit's returning projectiles hit the dummy", enabled: spirit.returning.on, active: spirit.returning.on && spirit.returning.active, summary: `${spirit.returning.percent}% of the Spirit's penetrating projectiles return through the dummy`, reason: spirit.returning.on ? "best-case assumption (the dummy on the return path)" : "switched off" });
  const assumptions = [];
  if (rage.enters) assumptions.push({ id: "rehan:rage", value: rage.uptime, text: `Rehan – Rage / Berserk: Max Rage ${rage.maxRage} (game field 2300000); ${!rage.measured ? "Berserk held before the hit pass measures the rates" : `outside Berserk ${fmt(rage.outGain)} Rage/s${rage.gainedPercent ? ` (×${rage.G} Rage gained)` : ""} → fills in ${fmt(rage.fillSeconds)} s; in Berserk ${fmt(rage.disarmShare === 1 ? rage.netA : rage.netB)} Rage/s net${rage.spiritCostRate > 0 ? `, the Spirit's casts paying ${fmt(rage.spiritCostRate)} Rage/s` : ""} → lasts ${fmt(rage.berserkSeconds)} s; uptime ${pct(rage.uptime)}%`}; the per-Rage bonuses read ${rage.berserkLevel} Rage in Berserk${rage.doubled ? " (Max Rage × 2, game client and config_c 1640)" : ""} and ${rage.outLevel} outside (a linear fill); the 5 s / 20 s windows use the cycle average.` });
  if (burst && cadence) assumptions.push({ id: "rehan:burst", value: cadence.usesPerSecond, text: `Rehan – Burst (Q-H1, provisional): ${burst.blast ? "Burst Blast (game row 90003, 1166–1944 Spell Physical at 288%)" : "340% Weapon Damage (game row 90000, keyword)"}; ${cadence.usesPerSecond > 0 ? `${fmt(cadence.inBerserk)} per second in Berserk = ${cadence.measured ? `1 ÷ max(1 ÷ ${fmt(cadence.eventsPerSecond)} ${cadence.eventKind}/s, cooldown ${fmt(cadence.cooldownSeconds)} s)` : `1 ÷ cooldown ${fmt(cadence.cooldownSeconds)} s (before the hit pass measures the attack rate)`}${burst.roar ? ` + Furious Roar's ${fmt(cadence.roarRate)} on attack crits` : ""}, × ${pct(rage.uptime)}% uptime = ${fmt(cadence.usesPerSecond)}/s` : "no trigger on the dummy"}; "per 1 levels" reads the character level (${burst.perLevel?.level ?? "—"}).` });
  if (tunnel) assumptions.push({ id: "rehan:tunnelVision", value: tunnel.on, text: `Rehan – Tunnel Vision: ${tunnel.on ? `-${tunnel.percent}% additional damage on every cast but Burst (game record 277809984; hits, damage over time and their ailments, the ailments inferred); Burst's own ailments do not take it` : "switched off: the non-Burst skills keep their damage"}.` });
  if (spirit) assumptions.push({ id: "rehan:spirit", value: spirit.active ? spirit.usesInBerserk : 0, text: `Rehan – Seething Spirit (provisional): ${!spirit.eligible ? spirit.reason : `casts ${spirit.mainName} at your use rate${spirit.speedFactor !== 1 ? ` × ${spirit.speedFactor}` : ""}${spirit.source === "ritual" ? " for the whole Berserk" : ` while you use it within every ${spirit.onslaughtSeconds} s in Berserk (${pct(spirit.presence)}%)`}, each a full use with the Berserk lines${spirit.additional.length ? ` and ${spirit.additional.map((line) => `${line.value >= 0 ? "+" : ""}${line.value}%`).join(", ")} additional` : ""}`}.` });
  if (rage.disarmShare > 0) assumptions.push({ id: "rehan:disarm", value: rage.disarmShare, text: `Rehan – Disarmed (Ritual of Offering): the player's Attack Skills pause for ${pct(rage.disarmShare)}% of each Berserk${rage.disarmSeconds !== Infinity ? ` (Rage Infusion: the first ${rage.disarmSeconds} s)` : ""}; their per-Rage bonuses read the attacking time only.` });
  return { ...state, switches, assumptions };
}

const L = (status, reason, extra = {}) => ({ status, reason, ...extra });

/** One Rehan clause: { key, status, reason, bodies }, or null when the line is not a Rehan clause. */
export function rehanLineRead(heroId, text, state, { revived = false } = {}) {
  if (!REHAN_HEROES.has(heroId)) return null;
  const key = rehanClauseKey(text, { revived });
  if (!key) return null;
  return { key, bodies: [], ...lineRead(key, cleanRehan(text), state) };
}

function lineRead(key, text, state) {
  if (!state) return L("Inactive", "Rehan's lines are not in the build");
  const { rage, burst, spirit, tunnel, cadence } = state;
  const measured = state.measured;
  const pending = measured ? "" : " (held before the hit pass measures the rates)";
  const cycle = !rage.enters ? "no \"Enter Berserk automatically at Max Rage\" line, so Berserk is never entered"
    : !measured ? "Berserk held before the hit pass measures the rates"
    : rage.berserkSeconds === Infinity ? (rage.uptime > 0 ? `Berserk never ends once entered${rage.prebuilt ? " (pre-built Rage: from t = 0)" : ""}: uptime ${pct(rage.uptime)}%` : "no Rage is gained, so Berserk is never entered (own buffs not pre-built)")
    : rage.uptime > 0 ? `Rage fills in ${fmt(rage.fillSeconds)} s (${fmt(rage.outGain)} Rage/s) and Berserk lasts ${fmt(rage.berserkSeconds)} s: uptime ${pct(rage.uptime)}% (Q-H1, provisional)`
    : "no Rage is gained outside Berserk, so Berserk is not re-entered (uptime 0)";
  const bodyFor = (clauseKey) => (state.averageBodies || []).find((item) => item.key === clauseKey) || null;
  const derived = (clauseKey, why) => {
    const item = bodyFor(clauseKey);
    return item ? L("In calc", `${why}: ${item.text} (time-averaged over the Rage cycle; ${cycle})`, { bodies: [item.text] }) : L("Inactive", `${why}: no bonus (${cycle})`);
  };
  const burstUses = cadence?.usesPerSecond || 0;
  const noBurst = !burst ? "no Burst trigger line" : !(rage.uptime > 0) ? cycle : !(burstUses > 0) ? (burst.onHit ? "no skill hits the dummy" : "no Attack Skill hits the dummy, so nothing triggers Burst") : "";
  const burstHit = state.burstHit;
  const burstDealt = burstHit ? Boolean(burstHit.modeled) : burstUses > 0;
  const burstIdle = noBurst || (!burstDealt ? burstHit?.inactiveReason || "Burst deals no damage here (no weapon damage)" : "");
  switch (key) {
    // ---- Rage gained outside Berserk ----
    case "rageMelee":
      if (!rage.enters) return L("Inactive", cycle);
      if (!measured) return L("In calc", `+${text.match(REHAN_PATTERNS.rageMelee)[1]} Rage per ${rage.resource ? "skill" : "Melee Attack"} use outside Berserk${pending}`);
      if (!(rage.outParts.melee > EPS)) return L("Inactive", rage.resource ? "no skill is used on the dummy" : "no Melee Attack skill is used on the dummy");
      return rage.matters.melee ? L("In calc", `${fmt(rage.outParts.melee)} Rage/s from ${rage.resource ? "every skill use (Hero's Resourcefulness)" : "the Melee Attack uses"} outside Berserk (${cycle})`) : L("No DPS effect", "Berserk never ends once entered and Rage is full at engagement (own buffs pre-built), so this Rage changes nothing");
    case "rageChannel":
      if (!rage.enters) return L("Inactive", cycle);
      if (!(rage.outParts.channel > EPS)) return L("Inactive", `no channeled Melee Attack skill${pending}`);
      return rage.matters.channel ? L("In calc", `${fmt(rage.outParts.channel)} Rage/s from channeled stacks (one stack per channel interval: provisional; ${cycle})`) : L("No DPS effect", "Berserk never ends once entered and Rage is full at engagement (own buffs pre-built), so this Rage changes nothing");
    case "starfallRage":
      if (!rage.enters) return L("Inactive", cycle);
      if (!(rage.outParts.ranged + rage.rangedRateIn + rage.spiritRangedRate > EPS)) return L("Inactive", `no Ranged Skill is used on the dummy${pending}`);
      return rage.matters.ranged ? L("In calc", `+${text.match(REHAN_PATTERNS.starfallRage)[1]} Rage per Ranged Skill use: ${fmt(rage.outParts.ranged)} Rage/s outside Berserk, ${fmt(rage.rangedRateIn + rage.spiritRangedRate)} in it, the Spirit's casts included (${cycle})`) : L("No DPS effect", "Berserk never ends once entered and Rage is full at engagement (own buffs pre-built), so this Rage changes nothing");
    case "skillUse": {
      if (!rage.enters) return L("Inactive", cycle);
      const melee = Number(state.facts?.meleeCasts) || 0, skill = Number(state.facts?.skillUses) || 0;
      if (!(measured && skill > melee + EPS)) return L("Inactive", `every skill used here is a Melee Attack Skill, so the change adds no Rage${pending}`);
      return rage.matters.resource ? L("In calc", `Rage from every skill use (${round(skill)} uses/s, of which ${round(melee)} Melee Attack) (${cycle})`) : L("No DPS effect", "Berserk never ends once entered and Rage is full at engagement (own buffs pre-built), so this Rage changes nothing");
    }
    case "enter":
      return rage.enters && rage.uptime > 0 ? L("In calc", cycle) : L("Inactive", cycle);
    case "drain":
      if (!rage.enters) return L("Inactive", cycle);
      if (rage.furyGen) return L("No DPS effect", "Righteous Fury generates Rage instead of consuming it while Berserk is active");
      if (rage.noNaturalDrain) return L("No DPS effect", "Fury's Onslaught: Rage is no longer naturally consumed while Berserk is active");
      return rage.uptime > 0 ? L("In calc", cycle) : L("Inactive", cycle);
    case "twice":
      return rage.uptime > 0 ? L("In calc", `the per-Rage bonuses read ${rage.berserkLevel} Rage while Berserk is active (${cycle})`) : L("Inactive", cycle);
    case "castCost":
      if (!(rage.uptime > 0)) return L("Inactive", cycle);
      if (rage.disarmShare === 1 && !(rage.spiritCostRate > EPS)) return L("No DPS effect", "Disarmed for the whole Berserk (Ritual of Offering): no Melee Attack casts, so nothing consumes Rage");
      if (!measured) return L("In calc", `Melee Attack casts consume Rage in Berserk${pending}`);
      return rage.matters.cast ? L("In calc", `${fmt(rage.castCostRate + rage.spiritCostRate)} Rage/s consumed by Melee Attack casts in Berserk, the Spirit's included (${cycle})`) : rage.castCostRate + rage.spiritCostRate > EPS ? L("No DPS effect", `Berserk never ends: the gains outweigh the ${fmt(rage.castCostRate + rage.spiritCostRate)} Rage/s the casts consume`) : L("Inactive", "no Melee Attack cast in Berserk");
    case "furyGen":
      return rage.enters ? L("In calc", `+${text.match(REHAN_PATTERNS.furyGen)[1]} Rage/s in Berserk instead of the drain (${cycle})`) : L("Inactive", cycle);
    case "onslaughtRage":
      return derived("onslaughtRage", "no natural consumption and half-cost Melee casts; +X% additional damage while Berserk (game record: the Berserk state)");
    case "disarmed":
      if (!(rage.uptime > 0)) return L("Inactive", cycle);
      return rage.disarmShare > 0 ? L("In calc", `the player's Attack Skills pause for ${pct(rage.disarmShare)}% of each Berserk (keyword Disarm); the Seething Spirit attacks instead (provisional)`) : L("No DPS effect", "Rage Infusion ends the Disarm after its first seconds and Berserk never ends");
    case "infusionDisarm": {
      if (!measured) return L("In calc", `+${rage.infusionGained}% Rage gained${pending}`);
      const parts = [rage.matters.infusionGained ? `+${rage.infusionGained}% Rage gained from ${rage.infusionAfterSeconds} s into Berserk` : "", rage.matters.disarmEnd ? `Disarmed only for the first ${rage.disarmSeconds} s of Berserk` : ""].filter(Boolean);
      return parts.length ? L("In calc", `${parts.join("; ")} (${cycle})`) : L("No DPS effect", rage.outGain > EPS || rage.disarmSeconds !== 0 ? "neither the extra Rage nor the end of the Disarm changes the cycle here (Berserk never ends, Rage full at engagement)" : "no Rage is gained and no Disarm");
    }
    case "splitLife":
      return rage.splitPercent > 0 && rage.matters.split ? L("In calc", `Max Life feeds Split Form's +${round(rage.splitPercent)}% Rage gained (Max Life ${Math.round(state.inputs.maxLife)}; the stat sheet counts it too)`) : L("Counted in stats", "Max Life (the stat sheet)");
    case "splitForm":
      if (!(rage.splitPercent > 0)) return L("Inactive", "Max Life below 40");
      if (!measured) return L("In calc", `+${round(rage.splitPercent)}% Rage gained${pending}`);
      return rage.matters.split ? L("In calc", `+${round(rage.splitPercent)}% Rage gained (Max Life ${Math.round(state.inputs.maxLife)}; ${cycle})`) : L("No DPS effect", "the extra Rage changes nothing here (Berserk never ends, Rage full at engagement)");
    case "hysteriaTaken":
      if (!(rage.takenRate > EPS)) return L("Inactive", "the dummy never attacks, and no self-damage source (Ritual of Offering) is in the build");
      return rage.matters.taken ? L("In calc", `${fmt(rage.takenRate)} Rage/s in Berserk from Ritual of Offering's self-damage (current Life read as Max Life: an upper bound, provisional)`) : L("No DPS effect", "Berserk never ends without it");
    case "hysteriaConsumed":
      if (!(rage.consumedRate > EPS)) return L("Inactive", "no Life is consumed (Ancestral Hate with an active Seething Spirit)");
      return rage.matters.consumed ? L("In calc", `${fmt(rage.consumedRate)} Rage/s in Berserk from the Life Ancestral Hate's Spirit consumes (current Life read as Max Life: an upper bound, provisional)`) : L("No DPS effect", "Berserk never ends without it");
    case "ritualSelfDamage":
      return rage.takenRate > EPS && rage.matters.taken ? L("In calc", `Hysteria: the self-damage generates ${fmt(rage.takenRate)} Rage/s in Berserk (provisional)`) : L("No DPS effect", rage.takenRate > EPS ? "self-damage: Berserk never ends without its Rage" : "self-damage (Hysteria would turn it into Rage)");
    // ---- Rage bonuses (time-averaged over the cycle) ----
    case "perRage": return derived("perRage", "per Rage you have (the Movement Speed part has no DPS effect)");
    case "frenzyCrit": return derived("frenzyCrit", "per Rage you have");
    case "attackSpeedPerRage": return derived("attackSpeedPerRage", "per Rage you have");
    case "doubleDamage": return derived("doubleDamage", "per 5 Rage you have");
    case "berserkDamage": return derived("berserkDamage", "while Berserk is active");
    case "infusion": return derived("infusion", `Rage gained in the last ${INFUSION_RECENT_SECONDS} s: ${rage.infusionStacks.out} stacks outside Berserk, ${rage.infusionStacks.in} in it`);
    case "berserkMove": return L("No DPS effect", "Movement Speed");
    case "berserkArea": return L("No DPS effect", "Skill Area: the dummy stands within the area");
    // ---- Burst ----
    case "burstTrigger": case "roarTrigger": case "blast":
      if (burstIdle) return L("Inactive", burstIdle);
      if (key === "roarTrigger") return cadence.roarRate > 0 ? L("In calc", `+${fmt(cadence.roarRate)} Bursts/s in Berserk on attack Critical Strikes (${fmt(cadence.critEventsPerSecond)}/s), its own ${fmt(cadence.roarCooldownSeconds)} s cooldown (provisional)`) : L("Inactive", "no attack Critical Strike");
      if (key === "blast") return L("In calc", `Burst Blast (${KEYWORDS.burstBlast.min}–${KEYWORDS.burstBlast.max} Spell Physical at ${KEYWORDS.burstBlast.effectiveness}%, game row ${KEYWORDS.burstBlast.gameRow}) replaces Burst and can activate Spell Burst (provisional)`);
      return L("In calc", `${fmt(burstUses)} Bursts/s: 1 ÷ max(1 ÷ ${fmt(cadence.eventsPerSecond)} ${cadence.eventKind}/s, cooldown ${fmt(cadence.cooldownSeconds)} s) in Berserk × ${pct(rage.uptime)}% uptime (provisional)${pending}`);
    case "onHit": {
      if (burstIdle) return L("Inactive", burstIdle);
      const hits = Number(state.facts?.hitUses) || 0, attacks = Number(state.facts?.attackUses) || 0;
      return measured && hits > attacks + EPS ? L("In calc", `Burst triggers on the hits of every skill (${fmt(hits)} uses/s; Attacks ${fmt(attacks)}/s)`) : L("Inactive", `every skill that hits here is an Attack, so the change adds no trigger${pending}`);
    }
    case "burstPerLevel": case "burstAdditional": case "roarPenalty": case "areaToBurst":
      if (burstIdle) return L("Inactive", burstIdle);
      if (key === "areaToBurst") return burst.area?.value ? L("In calc", `+${burst.area.skillArea}% Skill Area → +${burst.area.value}% additional Burst Damage (cap ${burst.area.cap}%)`) : L("Inactive", "no Skill Area bonus");
      if (key === "burstPerLevel") return L("In calc", `× character level ${burst.perLevel.level}${burst.perLevel.stored ? "" : " (not stored: the default 100)"} = +${burst.perLevel.value}% additional Burst Damage ("per 1 levels" read as the character level: provisional)`);
      return L("In calc", "on Burst's hits");
    case "moonCdr": case "rampaging":
      if (burstIdle) return L("Inactive", burstIdle);
      if (key === "rampaging" && !(cadence.rampagingIncreased > 0 || cadence.rampagingAdditionalFactor > 1)) return L("Inactive", "no Attack Speed bonus");
      if (measured && !(key === "moonCdr" ? cadence.moonMatters : cadence.rampagingMatters)) return L("Inactive", `the attacks trigger Burst every ${fmt(1 / Math.max(EPS, cadence.eventsPerSecond))} s, slower than its cooldown even without this line (${fmt(cadence.cooldownSeconds)} s with it), so it changes nothing`);
      return L("In calc", `Burst cooldown ${fmt(cadence.baseCooldownSeconds)} s ÷ (1 + ${fmt(cadence.cdrPercent)}%)${cadence.rampagingAdditionalFactor > 1 ? ` ÷ ${fmt(cadence.rampagingAdditionalFactor)}` : ""} = ${fmt(cadence.cooldownSeconds)} s (${cadence.binds ? "the cooldown binds" : "Burst now follows every attack: without the line the cooldown binds"}; Artificial Moon at ${rage.berserkLevel} Rage${cadence.rampagingIncreased ? `, Rampaging +${fmt(cadence.rampagingIncreased)}%` : ""}; provisional)${pending}`);
    case "furyCost":
      if (burstIdle) return L("Inactive", burstIdle);
      return rage.matters.furyCost ? L("In calc", `${fmt(rage.furyCostRate)} Rage/s consumed by Bursts (${cycle})`) : L("No DPS effect", `Rage stays at max: the ${fmt(rage.natural)} Rage/s Righteous Fury generates outweighs the ${fmt(rage.furyCostRate)} Rage/s the Bursts cost`);
    case "frenzyGain":
      if (burstIdle) return L("Inactive", burstIdle);
      if (!(rage.frenzyRate > EPS)) return L("Inactive", measured ? "Burst lands no Critical Strike" : "Burst's crits are measured by the hit pass");
      return rage.matters.frenzy ? L("In calc", `+${fmt(rage.frenzyRate)} Rage/s in Berserk from Burst Critical Strikes (${pct(burst.critChance)}% crit; ${cycle})`) : L("No DPS effect", "Berserk is permanent without it (Rage stays at max)");
    case "tunnelPenalty":
      if (!tunnel) return L("Inactive", "Tunnel Vision is not in the build");
      return tunnel.on ? L("In calc", `applied: -${tunnel.percent}% additional damage on every cast but Burst, its hits, damage over time and ailments (game record 277809984; the ailments inferred); Burst's own ailments do not take it${burstDealt ? "" : "; Burst deals no damage here, so the build's main damage source is missing"}`, { bodies: [`-${tunnel.percent}% additional damage`] }) : L("Inactive", "switched off (best-case assumptions): the non-Burst skills keep their damage");
    case "burstArea": return L("No DPS effect", "Burst's area: the dummy stands within 3 m (best case)");
    // ---- Seething Spirit ----
    case "ownSpirit": case "ritualSpirit": case "onslaughtSpirit": case "spiritDamage": case "spiritSpeed": case "growing": case "hateConsume":
    case "starfallRanged": case "starfallProjectiles": case "starfallReturn": {
      if (!spirit) return key === "hateConsume" ? L("No DPS effect", "a Life cost: no Seething Spirit in the build (Ritual of Offering or Fury's Onslaught)") : L("Inactive", "no Seething Spirit (Ritual of Offering or Fury's Onslaught)");
      if (!spirit.eligible) return L("Inactive", spirit.reason);
      if (!spirit.active) return L("Inactive", spirit.presence > 0 ? cycle : `the Main Skill is not used within every ${spirit.onslaughtSeconds} s`);
      const settled = state.spiritHit;
      if (settled && !settled.modeled) return L("Inactive", `the Spirit's casts deal no damage here${settled.inactiveReason ? ` (${settled.inactiveReason})` : ""}`);
      if (key === "hateConsume") return rage.consumedRate > EPS && rage.matters.consumed ? L("In calc", `Hysteria: ${fmt(rage.consumedRate)} Rage/s in Berserk from the Life consumed (provisional)`) : L("No DPS effect", "a Life cost (Hysteria would turn it into Rage)");
      if (key === "growing") return !(rage.growingRate > EPS) ? L("Inactive", `the Spirit's casts are measured by the hit pass${pending}`) : rage.matters.growing ? L("In calc", `+${fmt(rage.growingRate)} Rage/s in Berserk (${fmt(spirit.usesInBerserk)} Spirit casts/s, doubled on its ${pct(spirit.doubleChance)}% Double Damage; ${cycle})`) : L("No DPS effect", "Berserk never ends without it");
      if (key === "starfallReturn") {
        const ret = spirit.returning;
        if (!ret) return L("Inactive", "Starfall Wasteland is not in the build");
        if (!ret.on) return L("Inactive", "switched off");
        return ret.active ? L("In calc", `${ret.percent}% of the Spirit's projectiles pass through the dummy (Penetration) and return through it: +${round(ret.percent / 100)} hits per projectile (best case: the dummy on the return path; provisional)`) : L("Inactive", ret.reason || "the Spirit's projectiles do not penetrate");
      }
      if (key === "starfallProjectiles") return L("In calc", "+1 Projectile Quantity and +1 Horizontal Projectile Penetration on the Spirit's casts (Jumps and Projectile Size: no DPS effect on one dummy)");
      if (key === "spiritSpeed") return L("In calc", `the Spirit casts at ×${spirit.speedFactor} your use rate`);
      if (key === "spiritDamage") return L("In calc", "on the Spirit's casts");
      return L("In calc", `${settled ? `${fmt(settled.usesPerSecond)} Spirit casts/s of ${spirit.mainName} (${fmt(settled.dps)} DPS)` : `the Spirit casts ${spirit.mainName}`}: ${spirit.source === "ritual" ? "always while Berserk" : `while ${spirit.mainName} is used within every ${spirit.onslaughtSeconds} s (${pct(spirit.presence)}%)`}, × ${pct(rage.uptime)}% Berserk uptime (provisional)`);
    }
    default: return L("Not modeled", "this Rehan clause is not read");
  }
}
