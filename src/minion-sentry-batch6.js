// Skill-mechanics census batch 6 (themes "Minion, Spirit Magus and module skills" and "Sentry skills" of
// research/skill-mechanics-census-2026-10-27.md §3; user-approved 2026-10-28): the Minion, Spirit Magus, module / Synthetic Troop and
// Sentry mechanics no reader handled.
//
// Shape (the precedent of src/support-conditional-batch4.js and src/support-hit-count-batch5.js):
//   - BATCH6_SUPPORT_RULES classify a support clause (`batch6: true`, a `kind`, the clause's own numbers: src/support-effects.js
//     supportClauses substitutes the stone / tier values before the rule reads the text). Family "minion" clauses are read by the
//     Minion model (src/minion-damage-model.js calculateMinion, through minionBatch6Plan below); family "sentry" clauses edit the Sentry
//     skill's hit profile (applyBatch6SentryEdits, called by src/skill-hit-model.js calculateSkillHit); Mind Control: Enthrall is a
//     conditionalAdditional settled by resolveBatch6Clause from the planner's Minion count. Neutral clauses carry their status and
//     reason; clauses whose game data is missing carry `notModeled` with the reason (listed as decided in the census allowlist).
//   - batch6Status gives the badge.
// Values: the clause text (stone / tier values), the skills' game buff records (SKILL_BUFFS) and stones (SUPPORT_STONES). Scopes and
// conditions: the game recipes named per rule (src/data/game/affix-recipes.generated.js). Counts and cadences the data leaves open
// follow the Minion model's rules (src/minion-damage-model.js: deterministic cycle, every Minion of a summon acting alike, the dummy a
// Boss within 10 m that never attacks) and are provisional: open questions minion-batch6-* / sentry-batch6-* in src/open-questions.js.
import { enemyBuffSet } from "./unit-buff-set.js";
import { skillBuffValue, supportStone, gameLevelValue } from "./game-skill-data.js";

const N = "([+-]?\\d+(?:\\.\\d+)?)";
const num = (value) => Number(String(value).replace("−", "-"));
const round = (value) => Math.round(value * 10000) / 10000;
const sum = (values) => values.reduce((total, value) => total + (Number(value) || 0), 0);
const clean = (text) => String(text ?? "").replace(/\s*%/g, "%").replace(/\+\s+/g, "+").replace(/\s+/g, " ").trim();

// `condition` (on the rules whose game recipe gates them: a named Minion skill, a Dark Gate cast, Command, the Origin buff, the Pulse's hit
// count) tells the condition census (scripts/condition-coverage-census.mjs) that the rule settles the gate itself.
const minion = (pattern, build) => ({ family: "minion", pattern, build: (m) => ({ ...build(m), batch6: true }) });
const sentry = (pattern, build) => ({ family: "sentry", pattern, build: (m) => ({ ...build(m), batch6: true }) });
const neutral = (family, pattern, status, reason) => ({ family, pattern, build: () => ({ batch6: true, neutral: status, reason }) });
const unmodeled = (family, pattern, kind, reason) => ({ family, pattern, build: () => ({ batch6: true, kind, notModeled: true, reason }) });

// Keyword values the Minion reads (reference data keyword / game buff records; the same constants as src/combat-states.js BUFF_VALUES).
// Profane: game buff 3492, +7% additional Erosion Damage (src/combat-states.js BUFF_VALUES.profane).
const PROFANE_PERCENT = 7;
// "Recently" = 4 s (game hyperlink 103; the God of Swords and Firebird recipes give their buffs a 4 s duration).
const RECENT_SECONDS = 4;
// Mind Control (reference data): "Initially has 3 maximum links", "+1 maximum link for every channeled stack", "Channels up to 5 stacks".
const MIND_CONTROL = { baseLinks: 3, baseStacks: 5 };

export const BATCH6_SUPPORT_RULES = [
  // ---- Neutral wordings (no damage on the one dummy that never attacks) ----
  neutral("minion", /^[+-]?\d+(?:\.\d+)?% Physique for (?:Minions summoned|Sentries deployed) by the supported skill$/i, "No DPS effect", "Physique sets the Minions' (Sentries') Life and size; the dummy never attacks them"),
  neutral("minion", /^[+-]?\d+(?:\.\d+)?% Aggressiveness for Minions summoned by the supported skill$/i, "No DPS effect", "Aggressiveness sets how far the Minions seek targets; the one dummy stands in range"),
  neutral("minion", /^[+-]?\d+(?:\.\d+)?% Projectile Flight Duration for (?:Minions summoned|Sentries deployed) by the supported skill$/i, "No DPS effect", "flight duration sets the projectiles' range; the dummy stands in range"),
  neutral("minion", /^When there is 1 or more Minions summoned by the supported skill, [\d.]+% of damage taken is transferred to a Minion summoned by the supported skill$/i, "No DPS effect", "a defence: the dummy never attacks"),
  // Modularization: Sever (Noble): its immunity is a defence (2026-10-28, module support eligibility).
  neutral("minion", /^Minions summoned by the supported skill are immune to damage$/i, "No DPS effect", "a defence: the dummy never attacks"),
  neutral("minion", /^When casting Dark Gate ?, makes Minions summoned by the supported skill prioritize attacking an enemy with the highest rarity within [\d.]+\s*m$/i, "No DPS effect", "one enemy: the dummy is always the target"),
  neutral("minion", /^When a Minion summoned by the supported skill takes damage, triggers its Empower Skill\.? Cooldown: [\d.]+\s*s$/i, "Not on dummy", "the dummy never attacks, so the Minions take no damage"),
  // Shriek: High Energy Beam fires 1 beam in its base state (reference data), so no later beam of its Shotgun Effect reaches the dummy.
  neutral("minion", new RegExp(`^While the buff is active, ${N} base damage coefficient for subsequent effects of Shotgun Effect for High Energy Beam of Minions summoned by the supported skill$`, "i"), "No DPS effect", "High Energy Beam fires 1 beam in its base state, so the Shotgun Effect has no subsequent beam on the dummy (the Minion model reads no Minion beam quantity)"),
  // Summon Spider Tank: Focus Fire's / Shriek's buff descriptor: the next clauses read the buff (Dark Gate's cadence).
  minion(new RegExp(`^When casting Dark Gate ?, Minions summoned by the supported skill gain a buff for ${N}\\s*s$`, "i"), (m) => ({ kind: "darkGateBuff", seconds: num(m[1]), recipe: 797326592 })),
  // ---- Clauses the readable game data cannot settle (decided in the census allowlist; open questions minion-batch6-*) ----
  unmodeled("minion", /^While the buff is active, Minions summoned by the supported skill will fire Volley instead of High Energy Beam$/i, "volley", "Volley's damage row is not in the readable game tables (open question minion-batch6-unread)"),
  unmodeled("minion", /^Replaces the Ultimate of Minions summoned by the supported skill with Melting Explosion$/i, "meltingExplosion", "Melting Explosion (stone 1895) has no readable damage row or cadence (open question minion-batch6-unread)"),
  unmodeled("minion", new RegExp(`^Minions summoned by the supported skill Reap ${N}\\s*s of Damage Over Time on Critical Strikes for every ${N}% their Critical Strike Damage$`, "i"), "critReap", "a Minion Reap on its crits settles the dummy's DoTs: the Reaping model has no Minion source yet (open question minion-batch6-unread)"),
  unmodeled("minion", /^(?:[+-]?\d+ Spell Burst upper limit for Minions summoned by the supported skill|The High Energy Beam cast by Minions summoned by the supported skill can't activate Spell Burst|The Enhanced Skills of Minions summoned by the supported skill can't activate Spell Burst)$/i, "minionSpellBurst", "the Minion model gives Minions no Spell Burst (their charge time and which Minion skills Spell Burst are unpublished; open question minion-batch6-unread)"),
  unmodeled("minion", new RegExp(`^For every 1\\s*m that Minions summoned by the supported skill Blink, ${N}% additional damage for the activated Self-Destruct Protocol$`, "i"), "blinkSelfDestruct", "the Blink distance to the enemy is unpublished (open question minion-batch6-unread)"),
  unmodeled("minion", new RegExp(`^${N}\\s*s to the Strike Interval for the Ultimate of Minions summoned by the supported skill$`, "i"), "ultimateStrikeInterval", "the Thunder Magus Ultimate's strike interval and strike count are unpublished (the model counts one hit per use; open question minion-batch6-unread)"),
  // ---- Synthetic Troop supports ----
  // Mechanical Modification (game affix 101070083: label 3016001 on every Synthetic Troop skill, once): halves the troops' max.
  minion(/^Halve the max number of Synthetic Troop Minions that can be summoned by you, rounding up to at least 1\.? This effect will take effect once$/i, () => ({ kind: "troopHalve", recipe: 101070083 })),
  // Activation Medium: Minion (game text): the Minions are at their max when the fight starts, also with own buffs not pre-built.
  minion(/^Triggers the supported skill and replenishes the Minions of the supported skill to the maximum upon entering the stage$/i, () => ({ kind: "replenish" })),
  // Assault Command (recipe 2240: gate Command (fight resource 9) ≥ P1 → attr 4802 flat on the Minions).
  minion(new RegExp(`^${N} Critical Strike Rating for Minions summoned by the supported skill when having at least (\\d+) Command$`, "i"), (m) => ({ kind: "critRatingCommand", value: num(m[1]), need: num(m[2]), recipe: 2240 })),
  // Maniacal Army (recipe 750969: on a Minion dealing damage (trigger 1000047), buff 10960 "+15 Command per second" for P2 s, 1 s gate):
  // a Command source while the Minions deal damage (src/planner.js adds the derived "+N Command per second" line; src/minion-cores.js).
  minion(new RegExp(`^Whenever a Minion summoned by the supported skill deals damage, gains ${N} Command per second for ${N}\\s*s\\.? Interval: ${N}\\s*s$`, "i"), (m) => ({ kind: "commandGain", value: num(m[1]), seconds: num(m[2]), recipe: 750969 })),
  // Modularization: Cluster (recipe 14593005) and Sever (recipe 11991501): the summoner's lines (src/planner.js derived lines).
  minion(new RegExp(`^${N}% additional Minion Damage for the summoner for every Minion summoned by the supported skill$`, "i"), (m) => ({ kind: "clusterMinion", value: num(m[1]), recipe: 14593005 })),
  minion(new RegExp(`^${N}% additional damage for the summoner when there is at least 1 Minion summoned by the supported skill$`, "i"), (m) => ({ kind: "severSummoner", value: num(m[1]), recipe: 11991501 })),
  // Modularization: Superconductivity (recipe 12460589: attr 6007 additional on the Minions).
  minion(new RegExp(`^${N}% additional Cooldown Recovery Speed for Minions summoned by the supported skill$`, "i"), (m) => ({ kind: "minionCdr", value: num(m[1]), recipe: 12460589 })),
  // ---- Spirit Magus supports ----
  // Savage Growth (recipe 689779: after P1 Minion casts (trigger 1000069) buff 10970 for P2 s, none while it holds; buff 10970 = game affix
  // 308909 "+150 initial Growth, reducing to +60 in 5 s").
  minion(new RegExp(`^Gains a buff when Minions summoned by the supported skill cast skills (\\d+) time\\(s\\)\\. Lasts ${N}\\s*s\\. You will not receive another buff while the buff is active$`, "i"), (m) => ({ kind: "savageGrowth", casts: num(m[1]), seconds: num(m[2]), recipe: 689779 })),
  // Harvest Time (recipes 358195744 / 855769 / 672719 / 77884: Stage = Growth (fight resource 12) ÷ 100; "Empowered" = an Empower buff,
  // tag 5100311).
  minion(new RegExp(`^Minions summoned by the supported skill prepare the Empower Skill every ${N}\\s*s$`, "i"), (m) => ({ kind: "prepareEmpower", seconds: num(m[1]), recipe: 358195744 })),
  minion(new RegExp(`^When Minions summoned by the supported skill are at Stage (\\d+) or higher, ${N}% chance to use an Enhanced Skill$`, "i"), (m) => ({ kind: "stageEnhancedChance", stage: num(m[1]), value: num(m[2]), recipe: 855769 })),
  minion(new RegExp(`^When Minions summoned by the supported skill are at Stage (\\d+) or higher, ${N}% additional Empower Duration for them$`, "i"), (m) => ({ kind: "stageEmpowerDuration", stage: num(m[1]), value: num(m[2]), recipe: 672719 })),
  minion(new RegExp(`^When Minions summoned by the supported skill are at Stage (\\d+) or higher and Empowered, ${N}% additional damage for them$`, "i"), (m) => ({ kind: "stageEmpoweredAdditional", stage: num(m[1]), value: num(m[2]), recipe: 77884 })),
  // Summon Thunder Magus: Heavy Arrow (recipe 402813792: Stage ≥ P1 and an Empower buff → field 2600171 +P2 base projectiles).
  minion(new RegExp(`^When Minions summoned by the supported skill are at Stage (\\d+) or higher and are Empowered, ${N} Base Projectile Quantity for their Enhanced Skill$`, "i"), (m) => ({ kind: "stageEmpoweredProjectile", stage: num(m[1]), value: num(m[2]), recipe: 402813792 })),
  // Summon Frost Magus: Ice Crusher (recipe 185155792: field 2600201 +P1 explosions for the Enhanced Skill).
  minion(/^The Enhanced Skill of Minions summoned by the supported skill will generate (\d+) additional explosion\(s\)$/i, (m) => ({ kind: "enhancedExplosions", value: num(m[1]), recipe: 185155792 })),
  // Summon Fire Magus: Aflame (recipe 234473712: field 2600211 double casting chance P1; P2 triple when double) and Wicked Spirit (recipes
  // 73824272: field 2600211 +P1; 93661312: +P1% additional Critical Strike Damage for each casting of a double cast).
  minion(new RegExp(`^When a Minion summoned by the supported skill casts an Enhanced Skill, ${N}% chance to trigger double casting, which makes the skill generate 2 consecutive explosions$`, "i"), (m) => ({ kind: "doubleCastEnhanced", value: num(m[1]), recipe: 234473712 })),
  minion(new RegExp(`^When triggering double casting, ${N}% chance to trigger triple casting$`, "i"), (m) => ({ kind: "tripleCast", value: num(m[1]), recipe: 234473712 })),
  minion(new RegExp(`^${N}% double casting chance for Minions summoned by the supported skill$`, "i"), (m) => ({ kind: "doubleCastChance", value: num(m[1]), recipe: 73824272 })),
  minion(new RegExp(`^When a Minion summoned by the supported skill triggers double casting, the skill ${N}% additional Critical Strike Damage for each casting$`, "i"), (m) => ({ kind: "doubleCastCrit", value: num(m[1]), recipe: 93661312 })),
  // Summon Fire Magus: Flowing Flames (recipes 737266112: attr 5719 additional on the hit tag 5000003; 864162112: on damage over time).
  minion(new RegExp(`^${N}% additional Hit Damage for Minions summoned by the supported skill$`, "i"), (m) => ({ kind: "rowAdditional", rowKind: "hit", value: num(m[1]), recipe: 737266112 })),
  minion(new RegExp(`^${N}% additional Damage Over Time for Minions summoned by the supported skill$`, "i"), (m) => ({ kind: "rowAdditional", rowKind: "persistent", value: num(m[1]), recipe: 864162112 })),
  // Summon Spider Tank: Steamroll (recipe 912869632: after P1 hits on an enemy by the Minions, the next Minion hit triggers a Pulse of P3% of
  // the projectile damage; the Pulse's own hits do not count).
  minion(/^After an enemy is hit (\d+) time\(s\) by Minions summoned by the supported skill, the next hit from a Minion triggers a Pulse centered on the enemy, dealing Physical Attack Damage to enemies within a [\d.]+\s*m radius\.? Hits from the Pulse will not trigger this effect$/i, (m) => ({ kind: "steamrollTrigger", hits: num(m[1]), recipe: 912869632 })),
  minion(new RegExp(`^Pulse Damage is ${N}% of Projectile Damage$`, "i"), (m) => ({ kind: "steamrollPulse", value: num(m[1]), recipe: 912869632, condition: "batch6:pulseAfterHits" })),
  // Summon Machine Guard: Iron Fist (recipe 421063872: attr 5719 additional on the named Minion skill's tag).
  minion(new RegExp(`^${N}% additional damage for the (Onslaught Punch|Overpower) cast by Minions summoned by the supported skill$`, "i"), (m) => ({ kind: "skillAdditional", value: num(m[1]), skill: m[2], recipe: 421063872, condition: "batch6:minionSkill" })),
  // Summon Machine Guard: Pummel (recipe 248115472: on casting Onslaught Punch a P1 s buff: +P2% additional damage for Overpower).
  minion(new RegExp(`^Upon casting (Onslaught Punch), Minions summoned by the supported skill gain a buff that lasts for ${N}\\s*s\\. While the buff is active: ${N}% additional damage for the (Overpower) of Minions summoned by the supported skill$`, "i"), (m) => ({ kind: "afterSkillBuff", trigger: m[1], seconds: num(m[2]), value: num(m[3]), skill: m[4], recipe: 248115472 })),
  // Summon Machine Guard: Crushing Blow (recipe 387981792: on casting Dark Gate, the next Onslaught Punch +P1% additional).
  minion(new RegExp(`^When casting Dark Gate ?, Minions summoned by the supported skill gain a buff: ${N}% additional damage for the next (Onslaught Punch)$`, "i"), (m) => ({ kind: "darkGateNextSkill", value: num(m[1]), skill: m[2], recipe: 387981792, condition: "batch6:darkGateNextSkill" })),
  // Summon Grim Phantom: Shriek's "+31 additional damage" (the reference data text drops the "%"; read as +31% additional) while its Dark Gate buff lasts.
  minion(new RegExp(`^While the buff is active, ${N}%? additional damage for Minions summoned by the supported skill$`, "i"), (m) => ({ kind: "darkGateAdditional", value: num(m[1]) })),
  // Summon Spider Tank: Focus Fire (recipe 695059072: while the Dark Gate buff lasts, +P2% additional Attack Speed per P1 Command, up to P3).
  minion(new RegExp(`^While the buff is active, ${N}% additional Attack Speed for Minions summoned by the supported skill for every (\\d+) Command the summoner has, stacking up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ kind: "darkGateAttackSpeedCommand", value: num(m[1]), per: num(m[2]), cap: num(m[3]), recipe: 695059072 })),
  // Summon Grim Phantom: Spur (recipe 383281952: gate Command ≥ P1 → attr 6002 additional on the Destructive Light Cannon).
  minion(new RegExp(`^${N}% additional Cast Speed for the (Destructive Light Cannon) cast by Minions summoned by the supported skill when having at least (\\d+) Command$`, "i"), (m) => ({ kind: "skillCastSpeedCommand", value: num(m[1]), skill: m[2], need: num(m[3]), recipe: 383281952, condition: "batch6:minionSkillCommand" })),
  // Summon Grim Phantom: Flicker (recipe 638111552): the automatic summon interval ÷ (1 + the summoner's Cooldown Recovery Speed).
  minion(/^The Interval for the supported skill to automatically summon Minions is affected by Cooldown Recovery Speed$/i, () => ({ kind: "autoSummonCdr", recipe: 638111552 })),
  // Summon Rock Magus: Forging (recipes 622058752: attr 6007 additional on the Ultimate tag 6000403; 238258000: +P1% additional Hit Damage
  // (multiplies) per Ultimate use in the last P2 s, up to P3).
  minion(new RegExp(`^${N}% additional Cooldown Recovery Speed for the Ultimate of Minions summoned by the supported skill$`, "i"), (m) => ({ kind: "ultimateCdr", value: num(m[1]), recipe: 622058752 })),
  minion(new RegExp(`^For each time Minions summoned by the supported skill use their Ultimate ?, ${N}% additional Hit Damage \\(multiplies\\) for their Ultimate ?\\.? Lasts for ${N}\\s*s\\.? Stacks up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ kind: "ultimateStacks", value: num(m[1]), seconds: num(m[2]), cap: num(m[3]), recipe: 238258000 })),
  // Summon Frost Magus: Vengeance (recipes 389996032: Empower skills (6001230) castable only by a trigger; 965361472: the summoner's Cooldown
  // Recovery Speed (attr 60071, increased and additional) × P1% copied to the Minions).
  minion(/^Minions summoned by the supported skill can no longer actively use Empower Skills$/i, () => ({ kind: "noEmpower", triggerable: true, recipe: 389996032 })),
  minion(new RegExp(`^${N}% of the bonus and additional bonus to Cooldown Recovery Speed is also applied to the Cooldown Recovery Speed of Minions summoned by the supported skill$`, "i"), (m) => ({ kind: "summonerCdrShare", value: num(m[1]), recipe: 965361472 })),
  // Summon Erosion Magus: Wicked (recipes 142765584: Enhanced chance (field 2012070) 0, no Empower / Enhanced / Ultimate use or trigger;
  // 49684132: the Origin buff (10650) converts every Spirit Magus's Physical and Elemental damage to Erosion) and its per-Minion line.
  minion(/^Minions summoned by the supported skill can only use Base Skills$/i, () => ({ kind: "baseOnly", recipe: 142765584 })),
  minion(new RegExp(`^Origin of Spirit Magus provided by the supported skill gains an additional effect: Converts ${N}% of Physical and Elemental Damage to Erosion Damage for all Spirit Magi$`, "i"), (m) => ({ kind: "wickedConversion", value: num(m[1]), recipe: 49684132, condition: "batch6:originEffect" })),
  minion(new RegExp(`^Origin of Spirit Magus provided by the supported skill gains an additional effect: ${N}% additional Erosion Damage for all Spirit Magi for each Minion you have$`, "i"), (m) => ({ kind: "wickedPerMinion", value: num(m[1]) })),
  // Summon Erosion Magus: Plague Source: the summoner's Origin of Erosion gains "+X% additional Erosion Damage" (src/planner.js derived line).
  minion(new RegExp(`^Origin of Spirit Magus provided by the supported skill gains an additional effect: ${N}% additional Erosion Damage ${N}% Sealed Mana Compensation for the supported skill$`, "i"), (m) => ({ kind: "plagueSource", value: num(m[1]) })),
  // Summon Erosion Magus: Frequent Quake (recipe 507705920: while Withering Payback's buff 11170 lasts, a Base / Enhanced Skill (or the
  // Ultimate with Malignant's label 3100341) every (P1 + field 2600334) s, ÷ Cast Speed with Malady's label 3100342) and its duration line.
  minion(new RegExp(`^While the Empower Skill of Minions summoned by the supported skill lasts, triggers a Base or Enhanced Skill on the enemy with the highest Rarity within ${N}\\s*m every ${N}\\s*s\\. This is determined by the Enhanced Skill chance$`, "i"), (m) => ({ kind: "empowerTrigger", seconds: num(m[2]), recipe: 507705920 })),
  minion(new RegExp(`^${N}% additional duration for the Empower Skill of Minions summoned by the supported skill$`, "i"), (m) => ({ kind: "empowerDuration", value: num(m[1]) })),
  // Summon Erosion Magus: Malady (recipes 155705440: label 3100342; 262916960: attr 6002 additional on the Enhanced tag 6000401) and
  // Malignant (890652160: label 3100341; 204016240: field 2600334 +P1 s).
  minion(/^While the Empower Skill of Minions summoned by the supported skill lasts, the interval of automatically triggered skills is affected by their Cast Speed$/i, () => ({ kind: "triggerCastSpeed", recipe: 155705440 })),
  minion(new RegExp(`^${N}% additional Cast Speed for the Enhanced Skill of Minions summoned by the supported skill$`, "i"), (m) => ({ kind: "enhancedCastSpeed", value: num(m[1]), recipe: 262916960 })),
  minion(/^While the Empower Skill of Minions summoned by the supported skill lasts, triggers the Ultimate instead of a Base or Enhanced Skill$/i, () => ({ kind: "triggerUltimate", recipe: 890652160 })),
  minion(new RegExp(`^While the Empower Skill of Minions summoned by the supported skill lasts, ${N}\\s*s to the Triggered Skill's Interval$`, "i"), (m) => ({ kind: "triggerInterval", value: num(m[1]), recipe: 204016240 })),
  // ---- Sentry supports (the Sentry skill's hit profile; applyBatch6SentryEdits) ----
  // Arrow Einherjar: Arrowstorm (recipe 199926752): +1 base projectile once the Sentry holds its 5 buff stacks.
  sentry(new RegExp(`^${N} Base Projectile Quantity when the Sentries deployed by the supported skill reach max buffs$`, "i"), (m) => ({ kind: "maxBuffProjectile", value: num(m[1]), recipe: 199926752 })),
  // Flame Core: Lone Vanguard (recipe 675954432: +P2% additional Hit Damage per +P1 Max Sentry Quantity, 1 by default) and its distance line.
  sentry(new RegExp(`^For every ${N} Max Sentry Quantity, ${N}% additional Hit Damage for the supported skill \\(Sentry Skills have \\+1 Max Sentry Quantity by default\\)$`, "i"), (m) => ({ kind: "perMaxSentryQuantity", per: num(m[1]), value: num(m[2]), recipe: 675954432 })),
  sentry(new RegExp(`^Damage dealt by Sentries deployed by the supported skill is additionally increased based on the distance between them and the enemy, up to ${N}% additional damage to enemies in proximity$`, "i"), (m) => ({ kind: "sentryProximity", value: num(m[1]) })),
  // Ghost Blade Einherjar: Prestige (recipe 293832224), Unbroken (872615744 / 864955584), Heroes (779412224), Eruption (912594944).
  sentry(new RegExp(`^${N}% additional Detonation Hit Damage for every ${N}% Multistrike chance of the Sentry deployed by the supported skill\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ kind: "detonationPerMultistrike", value: num(m[1]), per: num(m[2]), cap: num(m[3]), recipe: 293832224 })),
  sentry(/^Sentries deployed by the supported skill no longer stop after performing a Multistrike and no longer cause explosions$/i, () => ({ kind: "unbroken", recipe: 872615744 })),
  neutral("sentry", new RegExp(`^${N} Projectile Quantity for every ${N}% Multistrike chance of the Sentry deployed by the supported skill$`, "i"), "Not on dummy", "Ghost Blade Einherjar: Projectile Quantity bonuses apply to Target Quantity and its blades are not affected by them, so the extra targets are other enemies"),
  sentry(new RegExp(`^${N}% additional Multistrike Damage Increment for every (\\d+) Sentry\\(ies\\) deployed by the supported skill$`, "i"), (m) => ({ kind: "multistrikeIncrementPerSentry", value: num(m[1]), per: num(m[2]), recipe: 779412224 })),
  unmodeled("sentry", new RegExp(`^When a Sentry deployed by the supported skill casts a skill, ${N}% chance for that cast's Multistrike Count to reach the max$`, "i"), "multistrikeMax", "the Sentry's Max Multistrike Count is unpublished (the model reads the skill's +100% Multistrike chance as one repeat; open question sentry-batch6-readings)"),
  // Thunder Core: Electric Field (recipe 455061504): +P2% additional Sentry Cast Frequency per Numbed enemy within P1 m, up to P3.
  sentry(new RegExp(`^For each Numbed enemy within ${N}\\s*m of a Sentry generated by this skill, ${N}% additional Sentry Cast Frequency\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ kind: "numbedCastFrequency", value: num(m[2]), cap: num(m[3]), recipe: 455061504 })),
  // Frost Core: Puncture (recipe 385876032): Penetrations raise later hits on other enemies.
  neutral("sentry", new RegExp(`^For every 1 time the Projectiles of a Sentry deployed by the supported skill Penetrate, ${N}% additional Hit Damage$`, "i"), "Not on dummy", "a projectile penetrates the dummy and goes on: the bonus reaches only later hits on other enemies"),
  // Mind Control: Enthrall (recipe 381878112): links to the build's Minions, +P1% additional damage per Minion linked, up to P2.
  { family: "conditionalAdditional", pattern: new RegExp(`^The supported skill links to your own Minions whenever possible, removing ${N}% of Minions' Life per second\\. This skill deals ${N}% additional damage to enemies for every Minion it is linked to, up to (\\d+) Minions$`, "i"), build: (m) => ({ value: num(m[2]), cap: num(m[3]), condition: "linkedMinions", batch6: true, recipe: 381878112 }) }
];

// Arrow Einherjar: Fellowship's "+X% additional Duration for the supported skill" (a generic duration clause, family "duration"):
// read on these Sentry skills by applyBatch6SentryEdits (the Sentry stack average follows the Sentry's duration).
export const BATCH6_DURATION_SKILLS = new Set(["Arrow Einherjar"]);

const MINION_READINGS = {
  steamrollTrigger: ["Provisional", "every (N + 1)th Minion hit on the dummy triggers the Pulse (the next clause's damage)"],
  steamrollPulse: ["Provisional", "a Pulse at X% of the projectile damage per N + 1 Minion hits, on the Minion's projectile hits"],
  darkGateBuff: ["Provisional", "Dark Gate's buff for the next clauses: while Dark Gate is on the board, held min(1, buff seconds ÷ Dark Gate's cooldown) of the time (src/minion-cores.js darkGateState; src/minion-sentry-batch6.js)"],
  troopHalve: ["In calc", "every Synthetic Troop skill's max Minions halved, rounding up, at least 1 (a penalty; the planner applies it build-wide)"],
  replenish: ["In calc", "the Synthetic Troop Minions are at their max from the start: the cold-start summon ramp is skipped (with own buffs pre-built they already are)"],
  critRatingCommand: ["Provisional", "flat Critical Strike Rating on the Minions while the summoner's Command reaches the threshold (full Command, switch fullCommand)"],
  commandGain: ["Provisional", "a Command source while the Minions deal damage (src/minion-cores.js commandState; full Command, switch fullCommand)"],
  clusterMinion: ["Provisional", "+X% additional Minion Damage on every Minion of the build × the Minions this module keeps out (src/planner.js derived line)"],
  severSummoner: ["Provisional", "+X% additional damage for the player while this module's Minions are out (src/planner.js derived line)"],
  minionCdr: ["In calc", "additional Cooldown Recovery Speed on the Minions' cooldowns"],
  savageGrowth: ["Provisional", "Savage Growth's buff (+150 initial Growth falling to +60 over 5 s) every 8 Minion casts, time-averaged into the Magus's Growth"],
  prepareEmpower: ["Provisional", "triggers the Empower Skill every N s when the Magus cannot use it by itself (Vengeance); otherwise the Magus already casts it on cooldown"],
  stageEnhancedChance: ["In calc", "+X% Enhanced-skill chance at the Stage threshold"],
  stageEmpowerDuration: ["In calc", "the Empower Skill's buff lasts longer at the Stage threshold"],
  stageEmpoweredAdditional: ["In calc", "joins the Empower Skill's buff at the Stage threshold"],
  stageEmpoweredProjectile: ["Provisional", "+1 projectile on the Enhanced Skill while Empowered at the Stage threshold (its projectiles hit the same enemy, each later one keeping 30% (the text's 70% falloff is the share lost), +5% per +1 Projectile Quantity)"],
  enhancedExplosions: ["Provisional", "the Enhanced Skill's extra explosions hit the dummy"],
  doubleCastEnhanced: ["Provisional", "Enhanced Skill double casting: 2 explosions (3 on a triple cast) at the chance"],
  tripleCast: ["Provisional", "a double cast becomes a triple cast at this chance"],
  doubleCastChance: ["Provisional", "joins the Enhanced Skill's double casting chance"],
  doubleCastCrit: ["Provisional", "the explosions of a double / triple cast take +X% additional Critical Strike Damage"],
  rowAdditional: ["In calc", "additional damage on the Minion's hit rows (Hit Damage) or Persistent rows (Damage Over Time)"],
  skillAdditional: ["In calc", "additional damage on the named Minion skill's hits"],
  afterSkillBuff: ["In calc", "a timed buff after each use of the trigger skill, on the named skill's hits that land inside it (the cycle)"],
  darkGateNextSkill: ["Provisional", "the share of the named skill's uses that follow a Dark Gate cast, min(1, Dark Gate casts/s ÷ its uses/s)"],
  darkGateAdditional: ["Provisional", "additional damage × the Dark Gate buff's uptime"],
  darkGateAttackSpeedCommand: ["Provisional", "additional Attack Speed per Command × the Dark Gate buff's uptime"],
  skillCastSpeedCommand: ["Provisional", "the named Minion skill's use time ÷ (1 + X%) while the summoner's Command reaches the threshold"],
  autoSummonCdr: ["Provisional", "the automatic summon interval ÷ the summoner's Cooldown Recovery Speed (only the cold-start ramp; with own buffs pre-built every Minion is out)"],
  ultimateCdr: ["In calc", "additional Cooldown Recovery Speed on the Ultimate's cooldown when it is in the cycle"],
  ultimateStacks: ["In calc", "(1 + X%) per Ultimate use in the last N s, counting this one, up to the cap, on the Ultimate's hits"],
  noEmpower: ["In calc", "the Empower Skill leaves the cycle (only a trigger casts it)"],
  summonerCdrShare: ["Provisional", "the summoner's Cooldown Recovery Speed lines on the Minions' cooldowns"],
  baseOnly: ["In calc", "Enhanced-skill chance 0; the Empower Skill and the Ultimate leave the cycle"],
  wickedConversion: ["Provisional", "every Spirit Magus's Physical and Elemental damage is dealt as Erosion"],
  wickedPerMinion: ["Provisional", "+X% additional Erosion Damage on every Spirit Magus × the build's Minions"],
  plagueSource: ["Provisional", "the summoner's Origin of Erosion adds +X% additional Erosion Damage (src/planner.js derived line); its Sealed Mana Compensation part has no DPS effect"],
  empowerTrigger: ["Provisional", "a Base / Enhanced Skill triggered on the dummy (the Boss, the highest Rarity) every N s while the Empower Skill's buff lasts"],
  empowerDuration: ["In calc", "the Empower Skill's buff duration × (1 + X%)"],
  triggerCastSpeed: ["Provisional", "the triggered interval ÷ the Magus's Cast Speed"],
  enhancedCastSpeed: ["In calc", "the Enhanced Skill's use time ÷ (1 + X%)"],
  triggerUltimate: ["Provisional", "the triggered skill is the Ultimate"],
  triggerInterval: ["Provisional", "+N s on the triggered interval"]
};

/**
 * Badge of a batch-6 clause (src/support-effects.js clauseStatus).
 * @returns {{ status, reason, consumers }}
 */
export function batch6Status(clause, ctx = {}) {
  const s = (status, reason, consumers = []) => ({ status, reason, consumers });
  if (clause.neutral) return s(clause.neutral, clause.reason);
  if (clause.notModeled) return s("Not modeled", clause.reason);
  const engine = ctx.engine;
  if (clause.family === "minion") {
    if (engine !== "minion") return s("No DPS effect", "the setup summons no modeled Minion");
    // Chunk 10: the behaviour tree casts Onslaught Punch only with the threat 8 to 15 m away, or after a kill: never beside the dummy.
    if (clause.skill === "Onslaught Punch" || clause.trigger === "Onslaught Punch") return s("Not on dummy", `the Machine Guard casts Onslaught Punch only with the threat 8 to 15 m away, or after a kill (AI 256312, src/minion-profiles.js${clause.recipe ? `, game recipe ${clause.recipe}` : ""})`);
    const [status, reason] = MINION_READINGS[clause.kind] || ["Not modeled", "no batch-6 reader for this clause"];
    return s(status, `${reason} (src/minion-sentry-batch6.js${clause.recipe ? `, game recipe ${clause.recipe}` : ""})`, ["minion"]);
  }
  if (clause.family === "sentry") {
    if (engine !== "skill-hit" || !ctx.sentry) return s("Inactive", "the supported skill is not a modeled Sentry skill");
    const status = clause.kind === "maxBuffProjectile" ? s("No DPS effect", "the extra arrow joins the 3-arrow fan: ceil(4 / 2) = ceil(3 / 2) = 2 arrows reach the dummy standing close, 1 at range (src/shotgun-effect.js fan rule)")
      : s(["perMaxSentryQuantity", "detonationPerMultistrike", "multistrikeIncrementPerSentry"].includes(clause.kind) ? "In calc" : "Provisional", `${SENTRY_READINGS[clause.kind] || "the Sentry's hit profile"} (src/minion-sentry-batch6.js applyBatch6SentryEdits${clause.recipe ? `; game recipe ${clause.recipe}` : ""})`, ["skill-hit"]);
    return status;
  }
  if (clause.family === "conditionalAdditional") {
    if (clause.active == null) return s("Provisional", clause.conditionText || "condition not resolved (no planner state)", [engine]);
    if (!clause.active) return s("Inactive", clause.conditionText);
    return s("Provisional", clause.conditionText, [engine]);
  }
  return s("Not modeled", "no batch-6 reader for this clause");
}
const SENTRY_READINGS = {
  perMaxSentryQuantity: "+X% additional Hit Damage × the Max Sentry Quantity (1 by default + Max Sentry Quantity lines)",
  sentryProximity: "the Sentry deployed next to the dummy: the full proximity bonus (best case)",
  detonationPerMultistrike: "+X% per 1% of the Sentry's Multistrike chance (its own +100%) on the Explosion hits, up to the cap",
  unbroken: "no 1 s Multistrike lock and no Explosion: the blade and its Multistrike repeat every attack interval",
  multistrikeIncrementPerSentry: "the Multistrike damage increment × (1 + X% × Sentries deployed)",
  numbedCastFrequency: "+X% additional Cast Frequency while the dummy is Numbed (one enemy)"
};

/** Mind Control: Enthrall's links to the build's Minions (src/support-effects.js resolveSupportEffects; planner condition minionsOwned). */
export function resolveBatch6Clause(clause, full = {}) {
  if (clause.condition !== "linkedMinions") return {};
  const state = full.conditions;
  if (!state || !Number.isFinite(state.minionsOwned)) return { active: null, appliedValue: 0, conditionText: "condition not resolved (no planner state)" };
  const stacks = MIND_CONTROL.baseStacks + Math.max(0, Number(state.maxChanneledStacksBuild) || 0);
  const links = MIND_CONTROL.baseLinks + stacks;
  const linked = Math.max(0, Math.min(clause.cap, state.minionsOwned, links - 1));
  if (!linked) return { active: false, appliedValue: 0, conditionText: "the build keeps no modeled Minion out" };
  return { active: true, appliedValue: round(clause.value * linked), provisional: true,
    conditionText: `${linked} Minion${linked === 1 ? "" : "s"} linked: min(${clause.cap}, the build's ${state.minionsOwned} Minions, ${links} links − 1 kept on the dummy; ${MIND_CONTROL.baseLinks} + 1 per channeled stack, ${stacks} stacks) × ${clause.value}% (game recipe ${clause.recipe}; provisional; the 10% Minion Life drain is not a DPS effect)` };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Minion skill and module mechanics (the skills' own reference data / game text; read in minionBatch6Plan). Each entry quotes its line.
// Module: Huge Ember Automaton / Dwarven Automaton / Ratlin Stormer Captain "Converts 100% of Physical Damage dealt by Minions summoned
// by this skill to Fire Damage" (game recipe 3729581), Module: Lean Phantom "… to Erosion Damage" (8643389), Module: Aember Winged Beast
// "… to Cold Damage" (8751869): the conversions in src/minion-profiles.js.
export const MODULE_MECHANICS = {
  // Module: Ent Great Elder "Minions summoned by this skill gain Profane on hit. Interval: 1s" (recipe 2068877: buff 3492 on hit, 1 s
  // gate): Profane held from the first hit, +7% additional Erosion Damage on the Ent Great Elder's Erosion hits.
  "Module: Ent Great Elder": { kind: "profane", recipe: 2068877, text: "Minions summoned by this skill gain Profane on hit, read as Profane held from the first hit (+7% additional Erosion Damage, game buff 3492)" },
  // Module: God of Swords "+3% Attack Speed for every Critical Strike landed by Minions summoned by this skill recently. Stacks up to 30
  // time(s)" (recipe 15794277: each crit (trigger 1000030, crit tag 5001010) a 4 s stack of attr 60011 increased on that Minion): stacks
  // = min(30, the Minion's crit chance × hits per second × 4 s), on its attack-speed skills.
  "Module: God of Swords": { kind: "critAttackSpeed", percent: 3, cap: 30, recipe: 15794277, text: "+3% Attack Speed for every Critical Strike landed by Minions summoned by this skill recently, read with stacks = min(30, crit chance × hits per second × 4 s) on its attack-speed skills" },
  // Module: Ichi Storm "45% of the Projectile Speed bonus of Minions summoned by this skill is also applied to the additional bonus for
  // Projectile Damage" (recipe 4906773: attr 60051 increased × 0.45 → 57191 additional on the Projectile tag 6001110), with "+1%
  // Projectile Speed for Minions summoned by this skill for every +1% Projectile Speed" (the summoner's Projectile Speed lines).
  "Module: Ichi Storm": { kind: "projectileSpeedShare", share: 45, recipe: 4906773, text: "45% of the Projectile Speed bonus of Minions summoned by this skill is also applied to the additional bonus for Projectile Damage, read from the Minion and summoner Projectile Speed lines" },
  // Module: Punisher "+2% additional damage for every +5% Skill Area of Minions summoned by this skill" (recipe 15577197: attr 62011
  // increased ÷ 5 × 2 → 57191 additional): the Minion Skill Area lines plus Impaling Thrust's +60% Skill Area buff for its 4 s.
  "Module: Punisher": { kind: "skillAreaShare", per: 5, percent: 2, recipe: 15577197, text: "+2% additional damage for every +5% Skill Area of Minions summoned by this skill, read from the Minion Skill Area lines and Impaling Thrust's buff" },
  // Module: Sand Giant "+2 to Parabolic Projectile Split Quantity for Minions summoned by this skill" (recipe 8363485: field 2006214) with
  // Gravelshot "The skill's Projectiles' effect after splitting -50% additional damage": each split lands on the dummy at −50% (the
  // Three Birds reading of splits, CLAUDE.md core talent answers), so Gravelshot deals 1 + 2 × 0.5 hits per use.
  "Module: Sand Giant": { kind: "splits", splits: 2, afterSplit: -50, skill: "Gravelshot", recipe: 8363485, text: "+2 to Parabolic Projectile Split Quantity for Minions summoned by this skill, read as 2 splits of Gravelshot on the dummy" },
  // Module: Trog 2nd General "+1% additional damage for Minions summoned by this skill for every 5 Strength the summoner has".
  "Module: Trog 2nd General": { kind: "summonerStrength", per: 5, percent: 1, text: "+1% additional damage for Minions summoned by this skill for every 5 Strength the summoner has, read from the stat sheet Strength" },
  // Module: Trog Mage "+1 to Barrage Skill Total Waves for Minions summoned by this skill" (recipe 8131861: field 2501030): Rockfall's
  // one-rock-per-cast count gains one rock per extra wave on the dummy.
  "Module: Trog Mage": { kind: "barrageWaves", waves: 1, skill: "Rockfall", recipe: 8131861, text: "+1 to Barrage Skill Total Waves for Minions summoned by this skill, read as one more Rockfall rock on the dummy per cast" },
  // Module: Tyrant "+1% additional damage for Minions summoned by this skill for every +1% Steep Strike chance the summoner has" (recipe
  // 1245021: the summoner's attr 20110022 (total) ÷ 1 → 57191 additional): the summoner's own "+X% Steep Strike chance" lines.
  "Module: Tyrant": { kind: "summonerSteep", per: 1, percent: 1, recipe: 1245021, text: "+1% additional damage for Minions summoned by this skill for every +1% Steep Strike chance the summoner has, read from the summoner's Steep Strike chance lines" }
};
export const MINION_SKILL_MECHANICS = {
  // Blazing Spin "When at Stage 4 or higher, while the skill lasts, hitting an enemy affected by this skill grants a stack of buff.
  // Interval: 0.01s. Each stack of the buff +14% Critical Strike Damage for 2 s, stacking up to 15 time(s)" (game affix 83835, recipe
  // 83835: on hit while buff 10500 holds): stacks = min(15, the Magus's hits per second on the dummy × 2 s) in Blazing Spin's buff.
  "Blazing Spin": { kind: "critDamageStacks", affix: 83835, text: "When at Stage 4 or higher, while the skill lasts, hitting an enemy affected by this skill grants a stack of buff, each stack +14% Critical Strike Damage for 2 s, stacking up to 15 time(s), read in Blazing Spin's buff" },
  // Bleak Grass "When at Stage 3 or higher, enemies take +4% additional Erosion Damage (multiplies) for 2 s after being hit by the skill.
  // Stacks up to 4 time(s)": stacks = min(4, Bleak Grass hits per second × 2 s), (1.04)^stacks on the Magus's own Erosion hits.
  "Bleak Grass": { kind: "erosionTaken", percent: 4, seconds: 2, cap: 4, stage: 3, text: "When at Stage 3 or higher, enemies take +4% additional Erosion Damage (multiplies) for 2 s after being hit by the skill, stacking up to 4 time(s), read on the Magus's Erosion hits" },
  // Burst Hammer "If the summoner has Tenacity Blessing stacks when casting this skill, consumes 1 stack of Tenacity Blessing to make this
  // cast deal +30% additional damage" (recipe 4857301: gate buff 340 Tenacity Blessing; next action +P1% additional).
  "Burst Hammer": { kind: "tenacity", percent: 30, recipe: 4857301, text: "If the summoner has Tenacity Blessing stacks when casting this skill, consumes 1 stack of Tenacity Blessing to make this cast deal +30% additional damage, read from the Blessing model" },
  // Firebird "For every enemy hit by the Projectiles fired by this skill, gains 1 stack of a buff: Adds 10% of Cold Damage as Fire Damage.
  // Stacks up to 8 time(s). Lasts for 4s" (recipe 995550144): stacks = min(8, Firebird hits in 4 s) on the Goblin Priest's Cold hits.
  "Firebird": { kind: "coldAsFire", percent: 10, cap: 8, seconds: 4, recipe: 995550144, text: "For every enemy hit by the Projectiles fired by this skill, gains 1 stack of a buff: Adds 10% of Cold Damage as Fire Damage, read on the Goblin Priest's Cold hits" },
  // Flickering Shadow "Removes 1 stack of Wilt and +75% additional damage for this skill when hitting a Wilted enemy" (recipe 16414165:
  // gate Wilt buff 150 on the target) with Sin of the Fallen "+100% Wilt Chance for this skill and adds 5 - 5 Base Wilt Damage" (recipe
  // 3994941): the share of Flickering Shadow hits that find Wilt = 1 when the build keeps the dummy Wilted, else min(1, Sin of the Fallen
  // hits per second ÷ Flickering Shadow hits per second) (each Sin of the Fallen hit puts one Wilt stack on the dummy and the next
  // Flickering Shadow hit removes it).
  "Flickering Shadow": { kind: "wiltedShare", percent: 75, recipe: 16414165, text: "Removes 1 stack of Wilt and +75% additional damage for this skill when hitting a Wilted enemy, read on its share of hits that find Wilt" },
  "Sin of the Fallen": { kind: "wiltSource", recipe: 3994941, text: "+100% Wilt Chance for this skill and adds 5 - 5 Base Wilt Damage, read as the Wilt stack each hit puts on the dummy for Flickering Shadow's bonus" },
  // Frost Release "Stacks up to 5 time(s)" and "Multiple stacks of the skill effect multiply.": a recast while its next-use bonuses remain
  // multiplies them (src/minion-damage-model.js cycle). "When at Stage 4 or higher, triggers this skill after casting 5 other skills":
  // every 5th other cast triggers Frost Release (its hit and its buff; no use time).
  "Frost Release": { kind: "frostRelease", every: 5, stage: 4, text: "Stacks up to 5 time(s), and multiple stacks of the skill effect multiply on a recast; when at Stage 4 or higher, triggers this skill after casting 5 other skills (the cycle)" },
  // Gold Rush "+6% additional damage for each enemy affected. Stacks up to 10 time(s)" (game affix 776024640): one enemy affected, the
  // Rock Magus's Euphoria (src/minion-profiles.js Gold Rush selfBuff).
  "Gold Rush": { kind: "read", affix: 776024640, text: "+6% additional damage for each enemy affected, stacking up to 10 time(s), read with one enemy affected (the dummy) in the Rock Magus's Euphoria" },
  // Impaling Thrust "Gains a buff when casting this skill: +60% Skill Area and +40% additional Area Damage for 4 s": the Punisher's Area
  // skills' hits inside the 4 s (src/minion-damage-model.js cycle), and the Punisher module's Skill Area line.
  "Impaling Thrust": { kind: "areaBuff", additionalPercent: 40, skillAreaPercent: 60, seconds: 4, text: "Gains a buff when casting this skill: +60% Skill Area and +40% additional Area Damage for 4 s, read on the Punisher's Area hits inside it" },
  // Towering Mountains "When this skill deals damage, +5% additional damage for each enemy in the area of effect. Stacks up to 8
  // time(s)": one enemy (the dummy), +5% on the Rock Magus's Ultimate.
  "Towering Mountains": { kind: "perEnemy", percent: 5, text: "When this skill deals damage, +5% additional damage for each enemy in the area of effect, read with one enemy (the dummy)" },
  // Withering Payback "While the skill lasts, when at Stage 4 or higher, +1 spike(s) launched by the Enhanced Skill" (game affix 67262800,
  // recipe 67262800: field 2600333): Bleak Grass +1 spike and its Spike Explosion (2 more hits) while the buff lasts.
  "Withering Payback": { kind: "extraSpike", affix: 67262800, hitsPerSpike: 2, stage: 4, text: "While the skill lasts, when at Stage 4 or higher, +1 spike(s) launched by the Enhanced Skill, read as Bleak Grass's extra spike and Spike Explosion" }
};
// Neutral own-text lines (one sentence each: the census corpus reads them).
export const NEUTRAL_OWN_TEXT = {
  "Withering Payback": "While the skill lasts, triggers a Base or Enhanced Skill on the enemy when taking damage, determined by the Enhanced Skill chance (game affix 638142080, trigger 1000040 on the Magus taking damage): not on the dummy, which never attacks",
  "Groundslam": "Gains a buff when casting this skill: -25% additional damage dealt by enemies within 10m nearby, a defence with no DPS effect (the dummy never attacks)",
  "Lightning Surge": "Projectile Quantity bonuses increase the number of enemies targeted by Chain of Lightning: other enemies, not on the dummy; Projectile Quantity does not increase: no DPS effect",
  "Rootsurge": "The Projectiles fired by this skill are not affected by Projectile Quantity bonuses: one Rootsurge hit per cast in the model, no DPS effect",
  "Flickering Shadow": "This skill cannot inflict Wilt: the Minion model inflicts no Minion ailments, no DPS effect",
  "Summon Spider Tank": "+2 Projectile Quantity for Minions summoned by this skill when having at least 10 Command: Aimed Shot's projectiles cannot hit the same enemy, so the extra projectiles need other enemies (not on the dummy); the max amount of Projectiles that can be fired by Minions summoned by this skill are 5, a cap with no DPS effect on one dummy",
  "Safeguard Ring": "The Sentry lasts 6.1s; Skill's max base Sentry quantity is 1; The skill can only place 1 Sentry: a defensive Sentry (damage taken, damage dealt by enemies) with no DPS effect"
};

// Sentry skills' own text and its reading (one line each: the census corpus reads them; applyBatch6SentryEdits and the profiles in
// src/attack-hit-profiles.js / src/skill-hit-profiles.js apply them).
export const SENTRY_OWN_TEXT = [
  ["Ghost Blade Einherjar", "+100% Multistrike chance for the Sentry/Sentries placed by this skill, read as one Multistrike repeat after each attack (the Ghost Blade cycle)"],
  ["Ghost Blade Einherjar", "Multistrikes deal 15% increasing damage for every 1 Sentry(ies) deployed by this skill, read as the repeat's increment × the Sentries deployed (applyBatch6SentryEdits)"],
  ["Ghost Blade Einherjar", "Sentries placed by this skill can only attack again 1 s after launching a Multistrike, and the interval is affected by Sentry Cast Frequency bonus: the 1 s lock in the Ghost Blade cycle, Cast Frequency scaled"],
  ["Ghost Blade Einherjar", "Projectile Quantity bonuses also apply to Target Quantity: more targets are other enemies, not on the dummy"],
  ["Ghost Blade Einherjar", "Projectiles fired by the skill are not affected by Projectile Quantity bonuses: no DPS effect on one dummy"],
  ["Arrow Einherjar", "Sentries placed by this skill gain 1 stack of buff every 1 s, stacking up to 5 time(s), read as the +8% additional Sentry Damage (multiplies) per stack averaged over the Sentry's life"],
  ["Frost Core", "If you are within 10m from the Sentry placed by the skill, the Sentry deals +32% additional damage to Frozen enemies, read while the dummy is Frozen (you stand within 10 m of the Sentry)"],
  ["Scorching Pulse", "If there's any Flame Core within 15m when this skill is used, then this skill is triggered again after 1 s, read with a Flame Core on the board: 2 pulses and 2 Reaps per cast"]
];

// The Minion skills whose Empower buff joins a Magus's Empower Skill (Withering Payback's spike, Thundercloud Surge's Heavy Arrow).
const EMPOWER_SKILL_OF = { "erosion-magus": "Withering Payback", "thunder-magus": "Thundercloud Surge", "fire-magus": "Blazing Spin", "frost-magus": "Frost Release", "rock-magus": "Gold Rush" };

/** The plain unscoped lines of the summoner: Σ of "+X% <stat>" (multiplier applied). */
function summonerSum(modifierTexts = [], pattern) {
  return sum(modifierTexts.flatMap((line) => {
    if (line.origin === "derived" && !line.lineEffect) return [];
    const match = clean(line.text).match(pattern);
    return match ? [num(match[1]) * (line.multiplier ?? 1)] : [];
  }));
}

/**
 * The planner's inputs for batch 6 (src/planner.js): the summoner's stats the module lines read and the build-wide Spirit Magus effects.
 * @returns {{ summoner, darkGate, commandPoints, enemyAilments, minionsOwned, wicked, troopHalved, prebuilt }}
 */
export function batch6MinionContext({ setups = [], activeNames = new Set(), modifierTexts = [], stats = {}, blessings = null, darkGate = null, commandPoints = 0, enemyAilments = [], minionsOwned = 0, prebuilt = true, wicked = null } = {}) {
  const active = setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name));
  const has = (setup, name) => (setup.supports || []).some((support) => support.enabled !== false && support.name === name);
  const halving = active.find((setup) => has(setup, "Mechanical Modification")) || null;
  const tenacity = (blessings?.entries || []).find((entry) => /Tenacity/i.test(entry.name || ""));
  const cdrIncreased = summonerSum(modifierTexts, /^\+?([+-]?\d+(?:\.\d+)?)% Cooldown Recovery Speed$/i);
  const cdrAdditional = modifierTexts.reduce((factor, line) => { const match = clean(line.text).match(/^\+?([+-]?\d+(?:\.\d+)?)% additional Cooldown Recovery Speed$/i); return factor * (match ? 1 + num(match[1]) * (line.multiplier ?? 1) / 100 : 1); }, 1);
  return {
    summoner: {
      strength: Math.max(0, Number(stats.strength) || 0),
      steepStrikeChancePercent: summonerSum(modifierTexts, /^\+?([+-]?\d+(?:\.\d+)?)% Steep Strike chance$/i),
      projectileSpeedPercent: summonerSum(modifierTexts, /^\+?([+-]?\d+(?:\.\d+)?)% Projectile Speed$/i),
      tenacityBlessing: { stacks: Number(tenacity?.stacks) || 0, source: tenacity ? `${tenacity.name} (Blessing model)` : null },
      cooldownRecovery: { increasedPercent: cdrIncreased, additionalFactor: cdrAdditional }
    },
    darkGate: darkGate ? { active: Boolean(darkGate.active), cooldownSeconds: darkGate.cooldownSeconds } : null,
    commandPoints: Math.max(0, Number(commandPoints) || 0), enemyAilments: [...enemyAilments], minionsOwned: Math.max(0, Number(minionsOwned) || 0), prebuilt,
    // Wicked's Origin effects for every Spirit Magus (batch6BuildLines: { conversion, perMinion }).
    wicked: wicked || null,
    troopHalved: halving ? { source: `${halving.name}: Mechanical Modification` } : null
  };
}

/** Dedupe a Minion's batch-6 clauses: one per support and clause (the highest value), as the Minion model's support lines. */
export function dedupeBatch6Clauses(clauses = []) {
  const map = new Map();
  for (const clause of clauses) {
    const key = `${clause.support}|${clause.baseText ?? clause.text}`;
    if (!map.has(key) || (Number(map.get(key).value) || 0) < (Number(clause.value) || 0)) map.set(key, clause);
  }
  return [...map.values()];
}

/**
 * The batch-6 plan of one Minion (src/minion-damage-model.js calculateMinion), in two steps: `early` before the Spirit Magus state
 * (Savage Growth's Growth), `plan` after it (everything else).
 */
export function minionBatch6Early({ profile, clauses = [], basicUseSeconds = 0.8 } = {}) {
  const savage = clauses.find((clause) => clause.kind === "savageGrowth");
  if (!savage || profile?.family !== "spirit-magus") return { extraGrowth: 0, savage: null };
  // Buff 10970 = game affix 308909 [150, 60]: "+150 initial Growth. The buff will reduce to +60 in 5s" (read as a linear fall: 105 on
  // average over its 5 s); a new buff after the next 8 casts once it ends: uptime = 5 ÷ (5 + 8 casts' time).
  const start = skillBuffValue("Savage Growth", 308909, { param: 0 }) ?? 150;
  const end = skillBuffValue("Savage Growth", 308909, { param: 1 }) ?? 60;
  const castsSeconds = savage.casts * Math.max(0.05, basicUseSeconds);
  const uptime = savage.seconds / (savage.seconds + castsSeconds);
  const extraGrowth = round((start + end) / 2 * uptime);
  return { extraGrowth, savage: { start, end, uptime: round(uptime), castsSeconds: round(castsSeconds), text: `Savage Growth: +${start} → +${end} initial Growth over ${savage.seconds} s (game affix 308909), a new buff after ${savage.casts} Minion casts (${round(castsSeconds)} s): uptime ${round(uptime)}, +${extraGrowth} Growth time-averaged (provisional)` } };
}

/**
 * @param {object} p
 * @param {object} p.profile resolved MINION_PROFILES entry
 * @param {object[]} p.clauses deduped batch-6 clauses of the Minion's setups
 * @param {object|null} p.context batch6MinionContext output (null on direct calls: the summoner reads nothing)
 * @param {object[]} p.modifierTexts the build's lines
 * @param {number} p.stage the Spirit Magus Stage (1 for other Minions)
 * @param {boolean} p.magus Spirit Magus family
 */
export function minionBatch6Plan({ profile, clauses = [], context = null, modifierTexts = [], stage = 1, magus = false } = {}) {
  const plan = { lines: { additional: [], critRating: [], speed: [], cooldownRecovery: [] }, inactive: [], notes: [], assumptions: [], applied: [],
    enhancedChanceDelta: 0, enhancedChanceFixed: null, blockEmpower: null, blockUltimate: null, prepareEmpowerSeconds: null, empowerDurationFactor: 1, empowerBuffAdditional: [],
    skill: {}, afterSkillBuffs: [], quake: null, frostReleaseTrigger: null, ultimateStacks: null, conversionToErosion: null, troop: { halve: null, replenish: null },
    multiCast: null, darkGateNext: [], rateAdditional: [], autoSummonCdr: false, skillMechanics: [] };
  const skillMod = (name) => (plan.skill[name] ??= { hitsFactor: 1, hitsAdd: 0, additional: [], speedFactor: 1, notes: [] });
  const off = (clause, reason) => plan.inactive.push({ source: clause.source, text: clean(clause.text), value: 0, reason, origin: "support" });
  const on = (clause, text) => plan.applied.push({ source: clause.source, kind: clause.kind, text: `${clean(clause.text)}${text ? ` — ${text}` : ""}` });
  const names = new Set((profile?.skills || []).map((entry) => entry.name));
  const empowerSkill = EMPOWER_SKILL_OF[profile?.key] || null;
  const command = context?.commandPoints ?? 0;
  const darkGate = context?.darkGate || null;
  const summoner = context?.summoner || null;
  for (const clause of clauses) {
    const stageNeed = clause.stage ?? 0;
    if (stageNeed && (!magus || stage < stageNeed)) { off(clause, magus ? `the Magus is at Stage ${stage} < ${stageNeed}` : `the ${profile.minion} has no Growth (only Spirit Magi have Stages)`); continue; }
    switch (clause.kind) {
      case "replenish": plan.troop.replenish = clause.source; on(clause, "the Minions are at their max from the start"); break;
      case "troopHalve": if (["module", "synthetic-troop"].includes(profile?.family)) plan.troop.halve = clause.source; on(clause, "the troops' max halved"); break;
      case "critRatingCommand":
        if (command >= clause.need) { plan.lines.critRating.push({ kind: "critRating", value: clause.value, flat: true, source: clause.source, text: `${clean(clause.text)} (Command ${round(command)} ≥ ${clause.need}; game recipe 2240)` }); on(clause); }
        else off(clause, context ? `the summoner's Command ${round(command)} < ${clause.need}` : "the summoner's Command is read by the planner");
        break;
      case "commandGain": on(clause, "a Command source (src/planner.js)"); break;
      case "clusterMinion": case "severSummoner": case "plagueSource": on(clause, "a derived build line (src/planner.js)"); break;
      case "minionCdr": plan.lines.cooldownRecovery.push({ kind: "cooldownRecovery", value: clause.value, additional: true, source: clause.source, text: `${clean(clause.text)} (game recipe 12460589)` }); on(clause); break;
      case "savageGrowth": on(clause, "time-averaged Growth"); break;
      case "prepareEmpower": plan.prepareEmpowerSeconds = Math.min(plan.prepareEmpowerSeconds ?? Infinity, clause.seconds); plan.prepareSource = clause.source; break;
      case "stageEnhancedChance": plan.enhancedChanceDelta += clause.value; on(clause, `Stage ${stage} ≥ ${stageNeed}`); break;
      case "stageEmpowerDuration": plan.empowerDurationFactor *= 1 + clause.value / 100; on(clause, `Stage ${stage} ≥ ${stageNeed}`); break;
      case "empowerDuration": plan.empowerDurationFactor *= 1 + clause.value / 100; on(clause); break;
      case "stageEmpoweredAdditional": plan.empowerBuffAdditional.push({ source: clause.source, text: `${clean(clause.text)} (Stage ${stage} ≥ ${stageNeed}; joins the Empower Skill's buff; game recipe 77884)`, value: clause.value }); on(clause); break;
      case "stageEmpoweredProjectile": plan.heavyArrow = { value: clause.value, source: clause.source, text: clean(clause.text) }; on(clause, `Stage ${stage} ≥ ${stageNeed}, while Empowered`); break;
      case "enhancedExplosions": {
        const enhanced = (profile?.skills || []).find((entry) => entry.role === "enhanced");
        if (!enhanced) { off(clause, `the ${profile.minion} has no Enhanced Skill`); break; }
        skillMod(enhanced.name).hitsAdd += clause.value * (enhanced.hitsPerUse ?? 1);
        skillMod(enhanced.name).notes.push(`${clean(clause.text)}: ${enhanced.name} +${clause.value} explosions per cast on the dummy (game recipe 185155792; provisional)`);
        on(clause); break;
      }
      case "doubleCastEnhanced": case "doubleCastChance": (plan.multiCast ??= { double: 0, triple: 0, critPercent: 0, sources: [] }).double += clause.value; plan.multiCast.sources.push(clause.source); on(clause); break;
      case "tripleCast": (plan.multiCast ??= { double: 0, triple: 0, critPercent: 0, sources: [] }).triple += clause.value; on(clause); break;
      case "doubleCastCrit": (plan.multiCast ??= { double: 0, triple: 0, critPercent: 0, sources: [] }).critPercent += clause.value; on(clause); break;
      case "rowAdditional": plan.lines.additional.push({ kind: "additional", value: clause.value, rowKind: clause.rowKind, source: clause.source, text: `${clean(clause.text)} (on the ${clause.rowKind === "hit" ? "hit" : "Persistent (damage over time)"} rows; game recipe ${clause.recipe})` }); on(clause); break;
      case "skillAdditional":
        if (!names.has(clause.skill)) { off(clause, `the ${profile.minion} has no ${clause.skill}`); break; }
        plan.lines.additional.push({ kind: "additional", value: clause.value, skillName: clause.skill, source: clause.source, text: `${clean(clause.text)} (game recipe ${clause.recipe})` }); on(clause); break;
      case "afterSkillBuff":
        if (!names.has(clause.trigger) || !names.has(clause.skill)) { off(clause, `the ${profile.minion} has no ${clause.trigger} / ${clause.skill}`); break; }
        plan.afterSkillBuffs.push({ trigger: clause.trigger, skills: [clause.skill], additionalPercent: clause.value, durationSeconds: clause.seconds, source: `${clause.source}: ${clause.trigger} buff` }); on(clause); break;
      case "darkGateBuff": break;
      case "steamrollTrigger": break;
      case "steamrollPulse": {
        const trigger = clauses.find((item) => item.kind === "steamrollTrigger" && item.support === clause.support);
        (plan.steamroll ??= []).push({ source: clause.source, percent: clause.value, hits: trigger?.hits ?? 12 });
        on(clause); break;
      }
      case "darkGateNextSkill": case "darkGateAdditional": case "darkGateAttackSpeedCommand": {
        if (!darkGate?.active) { off(clause, context ? "no Dark Gate on the board (its cast gives the buff)" : "Dark Gate's cadence is read by the planner"); break; }
        const buffSeconds = sum(clauses.filter((item) => item.kind === "darkGateBuff" && item.support === clause.support).map((item) => item.seconds)) || 2;
        const uptime = Math.min(1, buffSeconds / Math.max(0.01, darkGate.cooldownSeconds));
        if (clause.kind === "darkGateNextSkill") { if (!names.has(clause.skill)) { off(clause, `the ${profile.minion} has no ${clause.skill}`); break; } plan.darkGateNext.push({ ...clause, darkGateCastsPerSecond: 1 / Math.max(0.01, darkGate.cooldownSeconds) }); on(clause); break; }
        if (clause.kind === "darkGateAdditional") { const value = round(clause.value * uptime); plan.lines.additional.push({ kind: "additional", value, source: clause.source, text: `${clean(clause.text)} × ${round(uptime)} Dark Gate buff uptime (${buffSeconds} s per cast, Dark Gate every ${round(darkGate.cooldownSeconds)} s; "+${clause.value}" read as +${clause.value}% additional; provisional)` }); on(clause); break; }
        const counted = Math.min(clause.cap, command / clause.per);
        if (!counted) { off(clause, "no Command (full Command, switch fullCommand)"); break; }
        const value = round(clause.value * counted * uptime);
        plan.lines.speed.push({ kind: "speed", value, additional: true, attack: true, cast: false, source: clause.source, text: `${clean(clause.text)}: ${clause.value}% × ${round(counted)} (Command ${round(command)}) × ${round(uptime)} Dark Gate buff uptime (game recipe ${clause.recipe}; provisional)` });
        on(clause); break;
      }
      case "skillCastSpeedCommand":
        if (!names.has(clause.skill)) { off(clause, `the ${profile.minion} has no ${clause.skill}`); break; }
        if (command < clause.need) { off(clause, context ? `the summoner's Command ${round(command)} < ${clause.need}` : "the summoner's Command is read by the planner"); break; }
        skillMod(clause.skill).speedFactor *= 1 + clause.value / 100;
        skillMod(clause.skill).notes.push(`${clean(clause.text)}: ${clause.skill}'s use time ÷ ${round(1 + clause.value / 100)} (Command ${round(command)}; game recipe ${clause.recipe}; provisional: the cannon's use time is borrowed from the summon's Split)`);
        on(clause); break;
      case "autoSummonCdr": plan.autoSummonCdr = true; on(clause); break;
      case "ultimateCdr": plan.lines.cooldownRecovery.push({ kind: "cooldownRecovery", value: clause.value, additional: true, skillRole: "ultimate", source: clause.source, text: `${clean(clause.text)} (game recipe 622058752)` }); on(clause); break;
      case "ultimateStacks": plan.ultimateStacks = { percent: clause.value, seconds: clause.seconds, cap: clause.cap, source: clause.source }; on(clause); break;
      case "noEmpower": if (!plan.blockEmpower) plan.blockEmpower = { reason: `${clause.source}: "${clean(clause.text)}"`, triggerable: true }; on(clause); break;
      case "baseOnly": plan.blockEmpower = { reason: `${clause.source}: "${clean(clause.text)}"`, triggerable: false }; plan.blockUltimate = clause.source; plan.enhancedChanceFixed = 0; on(clause); break;
      case "summonerCdrShare": {
        const cdr = summoner?.cooldownRecovery;
        if (!cdr || (!cdr.increasedPercent && cdr.additionalFactor === 1)) { off(clause, context ? "the summoner has no Cooldown Recovery Speed lines" : "the summoner's Cooldown Recovery Speed is read by the planner"); break; }
        const share = clause.value / 100;
        if (cdr.increasedPercent) plan.lines.cooldownRecovery.push({ kind: "cooldownRecovery", value: round(cdr.increasedPercent * share), additional: false, source: clause.source, text: `${clean(clause.text)}: ${round(cdr.increasedPercent)}% × ${round(share)} (the summoner's Cooldown Recovery Speed; game recipe 965361472)` });
        if (cdr.additionalFactor !== 1) plan.lines.cooldownRecovery.push({ kind: "cooldownRecovery", value: round((cdr.additionalFactor - 1) * 100 * share), additional: true, source: clause.source, text: `${clean(clause.text)}: ×${round(cdr.additionalFactor)} additional × ${round(share)} (game recipe 965361472)` });
        on(clause); break;
      }
      case "wickedConversion": case "wickedPerMinion": on(clause, "every Spirit Magus of the build (src/planner.js)"); break;
      case "empowerTrigger": (plan.quake ??= { seconds: 0, extraSeconds: 0, castSpeed: false, ultimate: false }).seconds = clause.seconds; plan.quake.source = clause.source; on(clause); break;
      case "triggerCastSpeed": (plan.quake ??= { seconds: 0, extraSeconds: 0, castSpeed: false, ultimate: false }).castSpeed = true; plan.quake.castSpeedSource = clause.source; break;
      case "triggerUltimate": (plan.quake ??= { seconds: 0, extraSeconds: 0, castSpeed: false, ultimate: false }).ultimate = true; plan.quake.ultimateSource = clause.source; break;
      case "triggerInterval": (plan.quake ??= { seconds: 0, extraSeconds: 0, castSpeed: false, ultimate: false }).extraSeconds += clause.value; break;
      case "enhancedCastSpeed": {
        const enhanced = (profile?.skills || []).find((entry) => entry.role === "enhanced");
        if (!enhanced) { off(clause, `the ${profile.minion} has no Enhanced Skill`); break; }
        skillMod(enhanced.name).speedFactor *= Math.max(0.01, 1 + clause.value / 100);
        skillMod(enhanced.name).notes.push(`${clean(clause.text)}: ${enhanced.name}'s use time ÷ ${round(1 + clause.value / 100)} (game recipe 262916960)`);
        on(clause); break;
      }
      default: break;
    }
  }
  // Frequent Quake's trigger needs its own clause; Malady / Malignant alone change the Empower trigger that never fires on the dummy.
  if (plan.quake && !plan.quake.seconds) {
    for (const clause of clauses.filter((item) => ["triggerCastSpeed", "triggerUltimate", "triggerInterval"].includes(item.kind))) off(clause, "no triggered skill on the dummy: Withering Payback's own trigger needs the Magus to take damage (the dummy never attacks); Frequent Quake's trigger is not installed");
    plan.quake = null;
  } else if (plan.quake) for (const clause of clauses.filter((item) => ["triggerCastSpeed", "triggerUltimate", "triggerInterval"].includes(item.kind))) on(clause, "on Frequent Quake's trigger");
  // Harvest Time's preparation matters only when the Magus cannot cast its Empower Skill by itself.
  for (const clause of clauses.filter((item) => item.kind === "prepareEmpower")) {
    if (plan.blockEmpower?.triggerable) on(clause, `triggers ${empowerSkill || "the Empower Skill"} every max(${clause.seconds} s, its cooldown)`);
    else if (plan.blockEmpower) off(clause, "the Magus can use only Base Skills (Wicked): its Empower Skill cannot be triggered either");
    else plan.notes.push(`${clause.source}: "${clean(clause.text)}" adds no cast: the Magus already casts ${empowerSkill || "its Empower Skill"} whenever its cooldown is ready (No DPS effect here).`);
  }
  // Double casting (Aflame / Wicked Spirit): expected explosions per Enhanced cast and the share that comes from a double / triple cast.
  if (plan.multiCast) {
    const enhanced = (profile?.skills || []).find((entry) => entry.role === "enhanced");
    const hasEnhancedDouble = clauses.some((item) => item.kind === "doubleCastEnhanced");
    if (!enhanced || !hasEnhancedDouble) { for (const clause of clauses.filter((item) => ["doubleCastChance", "doubleCastCrit", "tripleCast"].includes(item.kind))) off(clause, !enhanced ? `the ${profile.minion} has no Enhanced Skill` : "no double casting on this Magus: only Aflame lets the Enhanced Skill double cast"); plan.multiCast = null; }
    else {
      const d = Math.min(1, plan.multiCast.double / 100), t = Math.min(1, plan.multiCast.triple / 100);
      const factor = 1 + d * (1 + t);
      const multiShare = d * (2 + t) / factor;
      plan.multiCast = { ...plan.multiCast, skill: enhanced.name, doubleChance: d, tripleChance: t, hitsFactor: factor, multiShare, critFactor: 1 + plan.multiCast.critPercent / 100 };
      plan.notes.push(`${enhanced.name}: double casting ${round(d * 100)}% (triple ${round(t * 100)}% of those): ×${round(factor)} explosions per cast; ${round(multiShare * 100)}% of the explosions come from a double / triple cast${plan.multiCast.critPercent ? ` and take +${plan.multiCast.critPercent}% additional Critical Strike Damage` : ""} (game recipes 234473712 / 73824272 / 93661312; provisional: every explosion lands on the dummy).`);
    }
  }
  // Wicked (another or this Erosion Magus): every Spirit Magus's damage as Erosion, +X% additional Erosion per Minion owned.
  if (magus && context?.wicked) {
    const conversion = context.wicked.conversion;
    if (conversion) plan.conversionToErosion = { percent: conversion.percent, source: conversion.source };
    if (context.wicked.perMinion) {
      const owned = Math.max(0, context.minionsOwned || 0);
      const value = round(context.wicked.perMinion.value * owned);
      if (value) plan.lines.additional.push({ kind: "additional", value, type: "Erosion", source: context.wicked.perMinion.source, text: `+${context.wicked.perMinion.value}% additional Erosion Damage for all Spirit Magi × ${owned} Minions owned (Wicked's Origin effect; provisional: one term)` });
    }
  }
  // Mechanical Modification's halving (game affix 101070083: label 3016001 on every Synthetic Troop skill, once).
  if (context?.troopHalved && ["module", "synthetic-troop"].includes(profile?.family)) plan.troop.halve = context.troopHalved.source;
  // Frost Release's own text: its stacks multiply on a recast while next-use bonuses remain; at Stage 4 every 5 other casts trigger it.
  if (names.has("Frost Release")) plan.frostRelease = { stacking: true, triggerEvery: magus && stage >= MINION_SKILL_MECHANICS["Frost Release"].stage ? MINION_SKILL_MECHANICS["Frost Release"].every : null };
  // The skills' own text (module summons, Minion skills).
  const own = MODULE_MECHANICS[profile?.summon];
  if (own) plan.skillMechanics.push({ summon: profile.summon, ...own });
  for (const entry of profile?.skills || []) if (MINION_SKILL_MECHANICS[entry.name]) plan.skillMechanics.push({ skill: entry.name, ...MINION_SKILL_MECHANICS[entry.name] });
  return plan;
}

/**
 * The Minion's skill rates the batch-6 mechanics read, estimated from the profile's timings before the cycle runs (specials whenever
 * their cooldown allows, the Base / Enhanced slot filling the rest): uses per second per skill, the slot's uses and hits per second, and
 * the Minion's hits per second (one Minion).
 */
export function estimateMinionRates({ entries = [], attackSpeedFactor = 1, castSpeedFactor = 1, enhancedShare = 0, cooldownFactor = 1 } = {}) {
  const speedOf = (entry) => (entry.timing?.speedType === "attack-speed" ? attackSpeedFactor : entry.timing?.speedType === "cast-speed" ? castSpeedFactor : 1) * (entry.batch6SpeedFactor || 1);
  const useOf = (entry) => (entry.timing ? entry.timing.useTime / Math.max(1e-6, speedOf(entry)) : null);
  const uses = new Map();
  let busy = 0;
  for (const entry of entries.filter((item) => item.role === "special" && item.timing && !item.batch6Blocked)) {
    const use = useOf(entry);
    const cooldown = (entry.timing.cooldown || 0) / Math.max(0.01, cooldownFactor);
    const rate = 1 / Math.max(use, cooldown || use);
    uses.set(entry.name, rate);
    busy += rate * use;
  }
  const basic = entries.find((item) => item.role === "basic" && item.timing) || null;
  const enhanced = entries.find((item) => item.role === "enhanced" && item.timing) || null;
  const share = basic && enhanced ? enhancedShare : 0;
  const slotUse = basic ? (1 - share) * useOf(basic) + (share > 0 ? share * useOf(enhanced) : 0) : 0;
  const slotUsesPerSecond = basic && slotUse > 0 ? Math.max(0, 1 - busy) / slotUse : 0;
  if (basic) uses.set(basic.name, slotUsesPerSecond * (1 - share));
  if (enhanced && share > 0) uses.set(enhanced.name, slotUsesPerSecond * share);
  const hitsOf = (entry) => (entry && !entry.buffOnly ? entry.hitsPerUse ?? 1 : 0);
  const slotHitsPerSecond = slotUsesPerSecond * ((1 - share) * hitsOf(basic) + share * hitsOf(enhanced));
  const minionHitsPerSecond = entries.reduce((total, entry) => total + (uses.get(entry.name) || 0) * hitsOf(entry), 0);
  return { usesPerSecond: (name) => uses.get(name) || 0, slotUsesPerSecond, slotHitsPerSecond, minionHitsPerSecond };
}

/**
 * The batch-6 changes to the Minion's skill entries (src/minion-profiles.js shapes) before src/minion-damage-model.js builds their hit
 * layers: the plan's per-skill hit counts, speeds, Empower blocks and durations, Wicked's conversion, double casting, and the own-text
 * mechanics that need the skills' rates (Blazing Spin's crit stacks, Bleak Grass's debuff, Firebird, Flickering Shadow, Punisher, God
 * of Swords, Ichi Storm, Trog 2nd General, Tyrant, Sand Giant, Trog Mage, Burst Hammer, Towering Mountains, Impaling Thrust, Crushing
 * Blow's next-punch share, Heavy Arrow, Withering Payback's spike, Steamroll's Pulse).
 * @returns {{ entries, additional, inactive, notes, rates }} entries: edited copies (the profile's are frozen)
 */
export function applyBatch6SkillMechanics({ plan, profile, entries: rawEntries = [], context = null, modifierTexts = [], stage = 1, enhancedShare = 0, critChance = 0.05, attackSpeedFactor = 1, castSpeedFactor = 1, attackSpeedIncreasedPercent = 0, cooldownFactor = 1 }) {
  const out = { additional: [], inactive: [], notes: [], entries: rawEntries, rates: null };
  if (!plan) return out;
  const entries = rawEntries.map((raw) => {
    const entry = { ...raw, extraAdditional: [...(raw.extraAdditional || [])] };
    const mod = plan.skill[raw.name];
    if (mod) { entry.hitsPerUse = (entry.hitsPerUse ?? 1) * mod.hitsFactor + mod.hitsAdd; entry.batch6SpeedFactor = mod.speedFactor; entry.batch6Notes = [...mod.notes]; }
    if (typeof entry.selfBuff === "function") entry.selfBuff = entry.selfBuff(stage);
    const empower = (raw.tags || []).includes("Empower");
    if (empower && plan.blockEmpower) entry.batch6Blocked = { ...plan.blockEmpower, prepareSeconds: plan.blockEmpower.triggerable ? plan.prepareEmpowerSeconds : null };
    if (empower && entry.selfBuff && plan.empowerDurationFactor !== 1) entry.selfBuff = { ...entry.selfBuff, durationSeconds: entry.selfBuff.durationSeconds * plan.empowerDurationFactor, batch6Duration: `× ${round(plan.empowerDurationFactor)} Empower Duration` };
    if (raw.role === "ultimate" && plan.blockUltimate) entry.batch6Blocked = { reason: plan.blockUltimate, triggerable: false };
    if (plan.multiCast && raw.name === plan.multiCast.skill) { entry.hitsPerUse = (entry.hitsPerUse ?? 1) * plan.multiCast.hitsFactor; entry.multiCast = { share: plan.multiCast.multiShare, critFactor: plan.multiCast.critFactor }; }
    // Wicked's Origin: Physical and Elemental rows dealt as Erosion (both types' lines apply, as the model's other conversions).
    if (plan.conversionToErosion && entry.type && entry.type !== "Erosion") entry.conversion = { from: entry.baseType || entry.type, to: "Erosion", percent: plan.conversionToErosion.percent, source: plan.conversionToErosion.source };
    if (plan.conversionToErosion && entry.type && entry.type !== "Erosion") entry.type = "Erosion";
    return entry;
  });
  out.entries = entries;
  const rates = estimateMinionRates({ entries, attackSpeedFactor, castSpeedFactor, enhancedShare, cooldownFactor });
  out.rates = rates;
  const skills = entries;
  const find = (name) => skills.find((item) => item.name === name) || null;
  // A damaging profile entry (a damage row with a non-zero percent; buff-only Empower skills deal none).
  const deals = (item) => !item.buffOnly && (item.percentByLevel || []).some((value) => value > 0);
  const extra = (skill, value, source, text) => skill.extraAdditional.push({ source, text, value: round(value), batch6: true });
  const inactive = (source, text, reason) => out.inactive.push({ source, text, value: 0, reason, origin: "skill" });
  for (const mech of plan.skillMechanics) {
    const label = mech.summon || mech.skill;
    switch (mech.kind) {
      case "profane": {
        const erosion = skills.some((item) => item.type === "Erosion" && !item.buffOnly);
        if (erosion) out.additional.push({ kind: "additional", value: PROFANE_PERCENT, type: "Erosion", source: `${label}: Profane`, text: `+${PROFANE_PERCENT}% additional Erosion Damage (Profane on hit, game buff 3492, held from the first hit; game recipe ${mech.recipe})` });
        else inactive(label, "Minions summoned by this skill gain Profane on hit", `the ${profile.minion} deals no Erosion damage`);
        break;
      }
      case "critAttackSpeed": {
        const attackSkills = skills.filter((item) => item.timing?.speedType === "attack-speed" && deals(item));
        if (!attackSkills.length) { inactive(label, "+3% Attack Speed for every Critical Strike landed by Minions summoned by this skill recently", `the ${profile.minion}'s skills use cast speed or a fixed use time (Split), so Attack Speed changes no use`); break; }
        const hits = rates.minionHitsPerSecond;
        const stacks = Math.min(mech.cap, critChance * hits * RECENT_SECONDS);
        // Increased Attack Speed joins the Minion's increased pool: its attack-speed skills' speed × (1 + (Σ + X)) ÷ (1 + Σ).
        if (stacks > 0) for (const skill of attackSkills) { skill.batch6SpeedFactor = (skill.batch6SpeedFactor || 1) * (1 + (attackSpeedIncreasedPercent + mech.percent * stacks) / 100) / Math.max(1e-6, 1 + attackSpeedIncreasedPercent / 100); (skill.batch6Notes ??= []).push(`+${mech.percent}% Attack Speed × ${round(stacks)} crits in the last ${RECENT_SECONDS} s (crit chance ${round(critChance * 100)}% × ${round(hits)} hits/s; ${label}, game recipe ${mech.recipe}; provisional)`); }
        break;
      }
      case "projectileSpeedShare": {
        const own = summonerSumMinion(modifierTexts, /^\+?([+-]?\d+(?:\.\d+)?)% (?:Projectile Speed for Minions|Minion Projectile Speed)$/i);
        const fromSummoner = context?.summoner?.projectileSpeedPercent || 0;
        const speed = own + fromSummoner;
        const projectile = skills.some((item) => (item.tags || []).includes("Projectile") && deals(item));
        if (!projectile) { inactive(label, "45% of the Projectile Speed bonus of Minions summoned by this skill is also applied to the additional bonus for Projectile Damage", `the ${profile.minion} has no Projectile skill`); break; }
        if (!speed) { inactive(label, "45% of the Projectile Speed bonus of Minions summoned by this skill is also applied to the additional bonus for Projectile Damage", context ? "no Projectile Speed bonus on the Minions or the summoner" : "the summoner's Projectile Speed is read by the planner"); break; }
        out.additional.push({ kind: "additional", value: round(speed * mech.share / 100), skillTag: "Projectile", source: `${label}: Projectile Speed`, text: `+${round(speed * mech.share / 100)}% additional Projectile Damage (${mech.share}% of the Minions' +${round(speed)}% Projectile Speed: ${round(own)}% Minion lines + ${round(fromSummoner)}% the summoner's; game recipe ${mech.recipe})` });
        break;
      }
      case "skillAreaShare": {
        const area = summonerSumMinion(modifierTexts, /^\+?([+-]?\d+(?:\.\d+)?)% Skill Area for Minions(?: summoned by the supported skill)?$/i);
        const impaling = find("Impaling Thrust");
        const share = impaling && rates.usesPerSecond(impaling.name) > 0 ? Math.min(1, MINION_SKILL_MECHANICS["Impaling Thrust"].seconds * rates.usesPerSecond(impaling.name)) : 0;
        const steps = (bonus) => Math.floor(Math.max(0, bonus) / mech.per + 1e-9) * mech.percent;
        const value = round(steps(area) * (1 - share) + steps(area + MINION_SKILL_MECHANICS["Impaling Thrust"].skillAreaPercent) * share);
        if (value) out.additional.push({ kind: "additional", value, source: `${label}: Skill Area`, text: `+${mech.percent}% additional damage per +${mech.per}% Skill Area: ${round(area)}% from Minion Skill Area lines${share ? `, +${MINION_SKILL_MECHANICS["Impaling Thrust"].skillAreaPercent}% while Impaling Thrust's buff lasts (${round(share * 100)}% of the time)` : ""} (game recipe ${mech.recipe}; time-averaged)` });
        else inactive(label, "+2% additional damage for every +5% Skill Area of Minions summoned by this skill", "no Skill Area bonus on the Minions");
        break;
      }
      case "splits": {
        const skill = find(mech.skill);
        if (!skill) break;
        skill.hitsPerUse *= 1 + mech.splits * (1 + mech.afterSplit / 100);
        out.notes.push(`${mech.skill}: +${mech.splits} Parabolic Projectile Split Quantity (${label}): each split lands on the dummy at ${mech.afterSplit}% additional damage, ${round(1 + mech.splits * (1 + mech.afterSplit / 100))} hits per use (game recipe ${mech.recipe}; provisional, the Three Birds reading of splits).`);
        break;
      }
      case "summonerStrength": {
        const strength = context?.summoner?.strength || 0;
        const value = Math.floor(strength / mech.per + 1e-9) * mech.percent;
        if (value) out.additional.push({ kind: "additional", value, source: `${label}: the summoner's Strength`, text: `+${mech.percent}% additional damage per ${mech.per} Strength: ${round(strength)} Strength (stat sheet)` });
        else inactive(label, "+1% additional damage for Minions summoned by this skill for every 5 Strength the summoner has", context ? "the summoner has under 5 Strength" : "the summoner's Strength is read by the planner");
        break;
      }
      case "barrageWaves": {
        const skill = find(mech.skill);
        if (!skill) break;
        skill.hitsPerUse += mech.waves;
        out.notes.push(`${mech.skill}: +${mech.waves} Barrage wave (${label}): one more rock on the dummy per cast (game recipe ${mech.recipe}; provisional: the model counts one rock per wave).`);
        break;
      }
      case "summonerSteep": {
        const steep = context?.summoner?.steepStrikeChancePercent || 0;
        const value = round(Math.floor(steep / mech.per + 1e-9) * mech.percent);
        if (value > 0) out.additional.push({ kind: "additional", value, source: `${label}: the summoner's Steep Strike chance`, text: `+${mech.percent}% additional damage per +${mech.per}% Steep Strike chance: the summoner's ${round(steep)}% (its "+X% Steep Strike chance" lines; game recipe ${mech.recipe}; provisional)` });
        else inactive(label, "+1% additional damage for Minions summoned by this skill for every +1% Steep Strike chance the summoner has", context ? "the summoner has no Steep Strike chance lines" : "the summoner's Steep Strike chance is read by the planner");
        break;
      }
      case "critDamageStacks": {
        const spin = find(mech.skill);
        if (!spin?.selfBuff) break;
        if (stage < 4) { inactive(mech.skill, "Blazing Spin: +14% Critical Strike Damage per stack on hitting an affected enemy", `the Magus is at Stage ${stage} < 4`); break; }
        const values = skillBuffValues("Blazing Spin", mech.affix);
        const hits = rates.slotHitsPerSecond + 1;
        const stacks = Math.min(values.cap, hits * values.seconds);
        spin.selfBuff = { ...spin.selfBuff, critDamagePercent: (spin.selfBuff.critDamagePercent || 0) + values.percent * stacks, batch6: `Stage ${stage}: +${values.percent}% Critical Strike Damage × ${round(stacks)} stacks (the Magus's ${round(hits)} hits/s on the affected dummy × ${values.seconds} s, up to ${values.cap}; game affix ${mech.affix}; provisional)` };
        out.notes.push(`Blazing Spin: ${spin.selfBuff.batch6}.`);
        break;
      }
      case "erosionTaken": {
        const grass = find(mech.skill);
        if (!grass) break;
        if (stage < mech.stage) { inactive(mech.skill, "Bleak Grass: enemies take +4% additional Erosion Damage (multiplies) per stack", `the Magus is at Stage ${stage} < ${mech.stage}`); break; }
        const hitsPerSecond = enhancedShare * rates.slotUsesPerSecond * (grass.hitsPerUse || 1);
        const stacks = Math.min(mech.cap, hitsPerSecond * mech.seconds);
        if (!(stacks > 0)) { inactive(mech.skill, "Bleak Grass: enemies take +4% additional Erosion Damage (multiplies) per stack", "Bleak Grass is never used (0% Enhanced-skill chance)"); break; }
        const value = round(((1 + mech.percent / 100) ** stacks - 1) * 100);
        out.additional.push({ kind: "additional", value, type: "Erosion", source: "Bleak Grass: Erosion Damage taken (Stage 3)", text: `+${mech.percent}% additional Erosion Damage taken (multiplies) × ${round(stacks)} stacks (${round(hitsPerSecond)} Bleak Grass hits/s × ${mech.seconds} s, up to ${mech.cap}) on the Magus's Erosion hits (provisional: the player's Erosion hits do not read this Minion debuff)` });
        break;
      }
      case "tenacity": {
        const skill = find(mech.skill);
        if (!skill) break;
        const held = context?.summoner?.tenacityBlessing?.stacks || 0;
        if (held > 0) extra(skill, mech.percent, `${mech.skill}: Tenacity Blessing`, `+${mech.percent}% additional damage on each cast: the summoner holds ${round(held)} Tenacity Blessing stacks (Blessing model; game recipe ${mech.recipe}; the consumed stack is regained by the build's Blessing gains: provisional)`);
        else inactive(mech.skill, "Burst Hammer: +30% additional damage while the summoner has Tenacity Blessing", context ? "the summoner holds no Tenacity Blessing" : "the summoner's Blessings are read by the planner");
        break;
      }
      case "coldAsFire": {
        const cold = skills.filter((item) => (item.baseType === "Cold" || item.type === "Cold") && deals(item) && rates.usesPerSecond(item.name) > 0);
        if (!cold.length) { inactive(mech.skill, "Firebird: Adds 10% of Cold Damage as Fire Damage per stack", `no Cold hit of the ${profile.minion} in its cycle (Frostclaw is not its filler)`); break; }
        const stacks = Math.min(mech.cap, rates.usesPerSecond(mech.skill) * mech.seconds);
        for (const skill of cold) extra(skill, mech.percent * stacks, `${mech.skill}: Cold as Fire`, `+${round(mech.percent * stacks)}% of its Cold damage added as Fire (${round(stacks)} Firebird stacks; game recipe ${mech.recipe}; provisional)`);
        break;
      }
      case "wiltedShare": {
        const skill = find(mech.skill);
        if (!skill) break;
        const playerWilt = (context?.enemyAilments || []).includes("Wilt");
        const sin = find("Sin of the Fallen");
        const share = playerWilt ? 1 : Math.min(1, (sin ? rates.usesPerSecond("Sin of the Fallen") * (sin.hitsPerUse || 1) : 0) / Math.max(1e-9, rates.usesPerSecond(mech.skill) * (skill.hitsPerUse || 1)));
        if (share > 0) extra(skill, mech.percent * share, `${mech.skill}: Wilted enemy`, `+${mech.percent}% additional damage × ${round(share)} of its hits on a Wilted dummy (${playerWilt ? "the build keeps the dummy Wilted" : "each Sin of the Fallen hit's Wilt stack is removed by the next Flickering Shadow hit"}; game recipe ${mech.recipe}; provisional)`);
        break;
      }
      case "perEnemy": {
        const skill = find(mech.skill);
        if (skill) extra(skill, mech.percent, `${mech.skill}: enemies in its area`, `+${mech.percent}% additional damage × 1 enemy in its area (the dummy)`);
        break;
      }
      case "areaBuff": {
        const skill = find(mech.skill);
        if (skill?.selfBuff == null && skill) skill.selfBuff = { additionalPercent: mech.additionalPercent, skillTags: ["Area"], durationSeconds: mech.seconds, source: `Impaling Thrust: +${mech.additionalPercent}% additional Area Damage for ${mech.seconds} s after casting` };
        break;
      }
      case "extraSpike": {
        const empower = find(mech.skill);
        if (!empower?.selfBuff) break;
        if (stage < mech.stage) { inactive(mech.skill, "Withering Payback: +1 spike launched by the Enhanced Skill", `the Magus is at Stage ${stage} < ${mech.stage}`); break; }
        const values = skillBuffValue("Withering Payback", mech.affix, { param: 1 }) ?? 1;
        empower.selfBuff = { ...empower.selfBuff, enhancedExtraHits: (empower.selfBuff.enhancedExtraHits || 0) + values * mech.hitsPerSpike };
        out.notes.push(`Withering Payback (Stage ${stage}): +${values} spike while it lasts: Bleak Grass +${values * mech.hitsPerSpike} hits (spike and Spike Explosion) per cast (game affix ${mech.affix}; provisional).`);
        break;
      }
      default: break;
    }
  }
  // Steamroll is a support: Spider Tank pulses (game recipe 912869632: after P1 hits on an enemy the next Minion hit triggers a Pulse of P3%
  // of the projectile damage; the Pulse's own hits do not count).
  for (const clause of plan.steamroll || []) {
    const shot = skills.find((item) => item.role === "basic" && deals(item));
    if (!shot) continue;
    extra(shot, clause.percent / (clause.hits + 1), `${clause.source}: Pulse`, `a Pulse at ${clause.percent}% of the projectile damage after every ${clause.hits} hits (the ${clause.hits + 1}th hit triggers it): +${round(clause.percent / (clause.hits + 1))}% per hit on average (game recipe 912869632; provisional)`);
  }
  // Crushing Blow: the share of Onslaught Punch uses that follow a Dark Gate cast.
  for (const clause of plan.darkGateNext) {
    const skill = find(clause.skill);
    if (!skill) continue;
    const share = Math.min(1, clause.darkGateCastsPerSecond / Math.max(1e-9, rates.usesPerSecond(clause.skill)));
    extra(skill, clause.value * share, clause.source, `${clean(clause.text)}: × ${round(share)} of its uses follow a Dark Gate cast (Dark Gate every ${round(1 / clause.darkGateCastsPerSecond)} s; game recipe ${clause.recipe}; provisional)`);
  }
  // Heavy Arrow (Stage 5, while Empowered): Thunderlight Arrow +1 base projectile on the dummy keeping 30% (the 70% falloff is the share lost;
  // client repeat multiplier, user decision 2026-11-05), +5% per +1 Projectile Quantity.
  if (plan.heavyArrow) {
    const empower = find(EMPOWER_SKILL_OF[profile.key]);
    if (empower?.selfBuff) empower.selfBuff = { ...empower.selfBuff, enhancedExtraHits: (empower.selfBuff.enhancedExtraHits || 0) + 0.3 * plan.heavyArrow.value, enhancedAdditionalPercent: (empower.selfBuff.enhancedAdditionalPercent || 0) + 5 * plan.heavyArrow.value };
  }
  return out;
}

const summonerSumMinion = (modifierTexts, pattern) => sum(modifierTexts.flatMap((line) => { const match = clean(line.text).match(pattern); return match ? [num(match[1]) * (line.multiplier ?? 1)] : []; }));

// Blazing Spin's stack buff (game affix 83835: [P1 crit damage, P2 seconds, P3 cap, P4 stage]).
function skillBuffValues(name, affix) {
  return { percent: skillBuffValue(name, affix, { param: 0 }) ?? 14, seconds: skillBuffValue(name, affix, { param: 1 }) ?? 2, cap: skillBuffValue(name, affix, { param: 2 }) ?? 15 };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Sentries (src/skill-hit-model.js calculateSkillHit, after the batch-5 edits).
const SENTRY_QUANTITY_LINE = /^(?:Max Sentry Quantity \+?(\d+)|\+?(\d+) (?:to )?Max Sentry Quantity|\+?(\d+) Sentries that can be deployed at a time)$/i;
/**
 * An edited copy of a Sentry skill's hit profile (or the Scorching Pulse profile) for this setup's batch-6 clauses and the skills' own
 * text: Ghost Blade Einherjar's Multistrike increment per Sentry, Heroes, Prestige, Unbroken; Arrow Einherjar's stacks over a longer
 * Fellowship Sentry; Flame Core: Lone Vanguard; Frost Core's Frozen bonus; Thunder Core: Electric Field; Scorching Pulse's Flame Core
 * retrigger.
 * @returns {{ profile, notes, edited }}
 */
export function applyBatch6SentryEdits(profile, effects, { modifierTexts = [], enemyAilments = null, boardSkillNames = null, deployCap = Infinity } = {}) {
  if (!profile) return { profile, notes: [], edited: false };
  const clauses = (effects?.clauses || []).filter((clause) => clause.batch6 && clause.family === "sentry" && !clause.neutral && !clause.notModeled && ["In calc", "Provisional"].includes(clause.status));
  // The enemy-ailment model's object carries the dummy's unit buff set (W8 step 2): its types; the names otherwise. The model names Freeze
  // "Frozen" (state 4000110); Frost Core below asked for "Freeze", a name neither holds, until W8 step 3.
  const buffSet = enemyBuffSet(enemyAilments);
  const ailments = new Set(buffSet ? buffSet.types() : (enemyAilments?.types || []).map((type) => type.name).concat(Array.isArray(enemyAilments) ? enemyAilments : []));
  const name = profile.name;
  const durationLines = BATCH6_DURATION_SKILLS.has(name) ? (effects?.duration || []).filter((line) => ["In calc", "Provisional"].includes(line.status)) : [];
  const own = ["Ghost Blade Einherjar", "Frost Core", "Scorching Pulse"].includes(name);
  if (!clauses.length && !durationLines.length && !own) return { profile, notes: [], edited: false };
  const notes = [];
  const next = { ...profile, components: profile.components.map((component) => ({ ...component, perUse: component.perUse && typeof component.perUse === "object" ? { ...component.perUse } : component.perUse, extraAdditional: [...(component.extraAdditional || [])] })), notes: [...(profile.notes || [])] };
  const find = (key) => next.components.find((component) => component.key === key);
  const kind = (k) => clauses.filter((clause) => clause.kind === k);
  // "The supported skill can only deploy N Sentry(ies)" (Flame Core: Lone Vanguard) caps the Sentries deployed, as in src/skill-hit-model.js.
  const cap = Math.min(deployCap, ...(effects?.clauses || []).map((clause) => Number(String(clause.text ?? "").match(/The supported skill can only deploy (\d+) Sentr/i)?.[1])).filter((value) => value > 0));
  const quantity = Math.max(1, Math.min(cap, 1 +Math.floor(sum(modifierTexts.flatMap((line) => String(line.text ?? "").split(/\r?\n/).flatMap((part) => { const match = clean(part).match(SENTRY_QUANTITY_LINE); return match ? [num(match[1] ?? match[2] ?? match[3]) * (line.multiplier ?? 1)] : []; }))))));
  const maxQuantity = 1 + Math.floor(sum(modifierTexts.flatMap((line) => String(line.text ?? "").split(/\r?\n/).flatMap((part) => { const match = clean(part).match(SENTRY_QUANTITY_LINE); return match ? [num(match[1] ?? match[2] ?? match[3]) * (line.multiplier ?? 1)] : []; }))));
  if (name === "Ghost Blade Einherjar") {
    // Ghost Blade Einherjar "Multistrikes deal 15% increasing damage for every 1 Sentry(ies) deployed by this skill": the repeat's
    // increment × the Sentries deployed; Heroes: × (1 + X% per Sentry). Hits per cycle = 1 + (1 + increment).
    const heroes = kind("multistrikeIncrementPerSentry");
    const increment = 0.15 * quantity * (1 + sum(heroes.map((clause) => clause.value * Math.floor(quantity / (clause.per || 1)))) / 100);
    const perCycle = 1 + (1 + increment);
    const unbroken = kind("unbroken").length > 0;
    for (const key of ["blade", "explosion"]) {
      const component = find(key);
      if (!component?.perUse) continue;
      component.perUse.perTick = perCycle;
      if (unbroken) component.perUse.intervalSeconds = ({ weaponAttacksPerSecond }) => weaponAttacksPerSecond > 0 ? 1 / weaponAttacksPerSecond : Infinity;
    }
    if (perCycle !== 2.15) notes.push(`Ghost Blade Einherjar: the Multistrike repeat at +${round(increment * 100)}% (15% × ${quantity} Sentr${quantity === 1 ? "y" : "ies"} deployed${heroes.length ? `, × ${round(1 + sum(heroes.map((clause) => clause.value * quantity)) / 100)} Heroes` : ""}): ${round(perCycle)} hits per cycle (provisional).`);
    if (unbroken) { next.components = next.components.filter((component) => component.key !== "explosion"); notes.push("Ghost Blade Einherjar: Unbroken: no 1 s lock after a Multistrike and no Explosion: the blade and its repeat every attack interval (game recipe 872615744; provisional)."); }
    for (const clause of kind("detonationPerMultistrike")) {
      const explosion = find("explosion");
      if (!explosion) continue;
      const chance = 100;
      const value = round(clause.value * Math.min(clause.cap, chance / (clause.per || 1)));
      explosion.extraAdditional.push({ source: clause.source, text: `${clean(clause.text)}: × ${chance}% Multistrike chance (the skill's own +100%; build Multistrike lines are not read on this Sentry) = +${value}% on the Explosion (game recipe ${clause.recipe})`, value });
    }
  }
  if (name === "Arrow Einherjar" && durationLines.length) {
    // Arrow Einherjar "Sentries placed by this skill gain 1 stack of buff every 1 s. Stacks up to 5 time(s)" (+8% additional Sentry Damage
    // (multiplies) per stack): averaged over the Sentry's life, 8 s × (1 + Σ increased) × Π(1 + additional) Duration.
    const factor = Math.max(0.01, 1 + sum(durationLines.filter((line) => !line.additional).map((line) => line.value)) / 100) * durationLines.filter((line) => line.additional).reduce((product, line) => product * (1 + line.value / 100), 1);
    const life = 8 * factor;
    const component = find("arrows");
    if (component) {
      const average = arrowStackAverage(life);
      component.extraAdditional = component.extraAdditional.map((line) => /Sentry buff stacks/.test(line.source) ? { ...line, text: `+8% additional Sentry Damage (multiplies) per stack, 1 stack every 1 s up to 5, averaged over the ${round(life)} s Sentry (${durationLines.map((line) => line.support).join(", ")}): ×${round(1 + average / 100)} (provisional)`, value: average } : line);
      notes.push(`Arrow Einherjar: Sentry duration ${round(life)} s (${durationLines.map((line) => `${line.text} (${line.support})`).join(", ")}): its 5 buff stacks are held for a longer share of its life (provisional).`);
    }
  }
  if (name === "Flame Core") {
    const component = find("sentry");
    for (const clause of kind("perMaxSentryQuantity")) if (component) component.extraAdditional.push({ source: clause.source, text: `${clean(clause.text)}: ${maxQuantity} Max Sentry Quantity × ${clause.value}% (game recipe ${clause.recipe})`, value: round(clause.value * Math.floor(maxQuantity / (clause.per || 1))), hitOnly: true });
    for (const clause of kind("sentryProximity")) if (component) component.extraAdditional.push({ source: clause.source, text: `${clean(clause.text)}: the Sentry deployed next to the dummy (best case; provisional)`, value: clause.value });
  }
  if (name === "Frost Core" && (ailments.has("Frozen") || ailments.has("Freeze"))) {
    // Frost Core "If you are within 10m from the Sentry placed by the skill, the Sentry deals +32% additional damage to Frozen enemies":
    // the player stands by the Sentry at the dummy (within 10 m, best case) and the dummy is Frozen (≥ 100 Frostbite Rating).
    const component = find("sentry");
    if (component) { component.extraAdditional.push({ source: "Frost Core: Frozen enemies", text: "+32% additional damage to Frozen enemies (the dummy is Frozen; you stand within 10 m of the Sentry)", value: 32 }); notes.push("Frost Core: +32% additional damage against the Frozen dummy (you within 10 m of the Sentry, best case)."); }
  }
  if (name === "Thunder Core" && ailments.has("Numbed")) {
    for (const clause of kind("numbedCastFrequency")) {
      next.sentry = { ...(next.sentry || {}), castFrequency: [...(next.sentry?.castFrequency || []), { text: `${clean(clause.text)} (1 Numbed enemy: the dummy; game recipe ${clause.recipe})`, value: clause.value, additional: true }] };
    }
  }
  if (name === "Scorching Pulse" && boardSkillNames?.has?.("Flame Core")) {
    // Scorching Pulse "If there's any Flame Core within 15m when this skill is used, then this skill is triggered again after 1 s" (game
    // recipe 200000322): with a Flame Core on the board (deployed by the dummy, best case) each cast is followed by a triggered pulse 1 s
    // later (the triggered pulse does not trigger again: provisional), so 2 pulses and 2 built-in Reaps per cast.
    const hit = find("hit");
    if (hit) { hit.perUse = (typeof hit.perUse === "number" ? hit.perUse : 1) * 2; next.builtInReaping = next.builtInReaping ? { ...next.builtInReaping, reapsPerUse: 2 } : null; notes.push("Scorching Pulse: a Flame Core is on the board: each cast is triggered again 1 s later (game recipe 200000322): 2 pulses and 2 Reaps per cast (provisional)."); }
  }
  next.notes.push(...notes);
  return { profile: next, notes, edited: notes.length > 0 || clauses.length > 0 };
}
/** Arrow Einherjar's average stack factor over a Sentry of `life` seconds (one stack per 1 s, up to 5, +8% multiplies). */
export function arrowStackAverage(life = 8) {
  let total = 0;
  for (let second = 0; second < Math.ceil(life); second++) total += Math.min(1, life - second) * 1.08 ** Math.min(5, second);
  return (total / life - 1) * 100;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Build lines (src/planner.js, with the census #2 support buffs): Modularization: Cluster's Minion Damage for every Minion, Sever's
// summoner damage, Plague Source's Origin of Erosion and Wicked's Spirit Magus effects (passed to batch6MinionContext).
/**
 * @param {object} p
 * @param {(setup) => number} p.minionCountFor the Minions a summon setup keeps out (src/minion-damage-model.js minionCountOut)
 * @returns {{ lines, entries, wicked }}
 */
/** The setup that halves the Synthetic Troop max (Mechanical Modification, game affix 101070083, once), or null. */
export function troopHalvingSource({ setups = [], activeNames = new Set() } = {}) {
  const setup = setups.find((item) => item.enabled !== false && activeNames.has(item.name) && (item.supports || []).some((support) => support.enabled !== false && support.name === "Mechanical Modification"));
  return setup ? `${setup.name}: Mechanical Modification` : null;
}

export function batch6BuildLines({ setups = [], activeNames = new Set(), minionCountFor = () => 0, originEffectFactor = 1 } = {}) {
  const lines = [], entries = [];
  let wicked = null;
  for (const setup of setups) {
    if (setup.enabled === false || !activeNames.has(setup.name)) continue;
    for (const clause of (setup.supportEffects?.clauses || []).filter((item) => item.batch6 && item.family === "minion" && ["In calc", "Provisional"].includes(item.status))) {
      const source = `${setup.name}: ${clause.support}`;
      if (clause.kind === "clusterMinion") {
        const count = Math.max(0, Number(minionCountFor(setup)) || 0);
        const value = round(clause.value * count);
        if (value) lines.push({ text: `+${value}% additional Minion Damage`, source: `${source} (${clause.value}% × ${count} Minions summoned by ${setup.name}; game recipe 14593005; provisional: one term)`, origin: "derived", multiplier: 1, supportBuff: true });
        entries.push({ setupKey: setup.setupKey, support: clause.support, value, text: `${source}: +${clause.value}% additional Minion Damage × ${count} Minions` });
      } else if (clause.kind === "severSummoner") {
        const count = Math.max(0, Number(minionCountFor(setup)) || 0);
        if (count > 0) lines.push({ text: `+${clause.value}% additional damage`, source: `${source} (its Minions are out; game recipe 11991501)`, origin: "derived", multiplier: 1, supportBuff: true });
        entries.push({ setupKey: setup.setupKey, support: clause.support, value: count > 0 ? clause.value : 0, text: `${source}: +${clause.value}% additional damage for the summoner${count > 0 ? "" : " (no Minion out)"}` });
      } else if (clause.kind === "plagueSource") {
        const value = round(clause.value * originEffectFactor);
        lines.push({ text: `+${value}% additional Erosion Damage`, source: `${source} (Origin of Erosion's additional effect${originEffectFactor !== 1 ? `, ×${round(originEffectFactor)} Origin effect` : ""}; provisional)`, origin: "derived", multiplier: 1, supportBuff: true });
        entries.push({ setupKey: setup.setupKey, support: clause.support, value, text: `${source}: the summoner's Origin of Erosion +${value}% additional Erosion Damage` });
      } else if (clause.kind === "wickedConversion") (wicked ??= {}).conversion = { percent: clause.value, source };
      else if (clause.kind === "wickedPerMinion") (wicked ??= {}).perMinion = { value: clause.value, source };
    }
  }
  return { lines, entries, wicked };
}

/** Maniacal Army's Command gain as the derived "+N Command per second" line (src/minion-cores.js commandState reads it). */
export function maniacalArmyCommandLines({ setups = [], activeNames = new Set(), troopSummon = () => false } = {}) {
  const stone = supportStone("Maniacal Army");
  const args = (stone?.base || []).find(([id]) => id === 750969)?.[1] || [15];
  const value = gameLevelValue(args[0], 20) ?? 15;
  return setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && troopSummon(setup) && (setup.supports || []).some((support) => support.enabled !== false && support.name === "Maniacal Army"))
    .map((setup) => ({ text: `+${value} Command per second`, source: `${setup.name}: Maniacal Army (buff 10960 while its Minions deal damage; game recipe 750969)`, origin: "derived", multiplier: 1 }));
}

