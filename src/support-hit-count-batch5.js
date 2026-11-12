// Skill-mechanics census batch 5 (backlog B3 of research/skill-mechanics-census-2026-10-27.md §3; user-approved 2026-10-28):
// support (and skill) clauses that change how many hits land on the one training dummy, or how often: Shotgun Effect gained or its
// coefficient changed, extra waves, Projectile Quantity fixed or per wave, secondary pulses / explosions, extra Finisher instances,
// cooldowns and damage intervals, Focus Pts per trigger, duration-scaled stacks and Steep Strike overrides.
//
// Shape (the precedent of src/support-conditional-batch4.js):
//   - BATCH5_RULES classify a clause (family "hitCount", `batch5: true`, a `kind` and the clause's own numbers, already the stone's /
//     tier roll's values: src/support-effects.js supportClauses substitutes them before the rule reads the text). Neutral clauses get
//     family "notOnDummy" / "nonDamage" with the reason.
//   - resolveBatch5Clause settles what needs the planner's state (the held weapon, Max Spell Burst, the hit pass's crit share).
//   - batch5Status gives the badge (In calc / Provisional when the supported skill's profile carries the hit group the clause changes;
//     Inactive with the reason otherwise).
//   - applyBatch5ProfileEdits returns an edited copy of the skill's hit profile (src/skill-hit-profiles.js / src/attack-hit-profiles.js
//     shapes) that src/skill-hit-model.js calculateSkillHit uses in place of the original; its notes list every change.
// Values: the clause text (stone / tier values). Scopes: the game recipes named per rule. Counts the recipes leave to the skill's script
// (a label or field the script reads) follow the skill text and the planner's single-target rules (src/shotgun-effect.js: linear falloff
// 1 + k × (hits − 1), k the share each repeat hit keeps: the hit rule's table, 100 − a text's "falloff coefficient X%" (client repeat
// multiplier, user decision 2026-11-05); a projectile fan lands every projectile standing close, one at range; extra projectiles reach the
// dummy only when the skill can hit the same enemy). Provisional readings: open questions hit-count-batch5-* in src/open-questions.js.
import { skillHitDamageSs13 } from "./data/skills/skill-hit-damage-ss13.generated.js";
import { skillHitDamageNewSkills } from "./data/skills/skill-hit-damage-new-skills.generated.js";
import { WEAPON_WORDS } from "./line-conditions.js";
import { shotgunTotal, keptShareFromCoefficient } from "./shotgun-effect.js";

const N = "([+-]?\\d+(?:\\.\\d+)?)";
const num = (value) => Number(String(value).replace("−", "-"));
const round = (value) => Math.round(value * 10000) / 10000;
const rule = (pattern, build) => ({ family: "hitCount", pattern, build: (m) => ({ ...build(m), batch5: true }) });
const neutral = (family, pattern, reason) => ({ family, pattern, build: () => ({ reason, batch5: true }) });

// Chain Lightning: "+2 Jumps" (reference data skill text; the profile reads one hit per cast on one dummy).
const CHAIN_LIGHTNING_JUMPS = 2;
// Split Shot: "1 + 2 projectiles" (reference data) and its hit rule's repeatDmgDecPercent 23, the share kept (src/shotgun-effect.js; the text's 77% is lost).
const SPLIT_SHOT = { projectiles: 3, factor: 0.23 };
// Sparkle: "Projectiles hit once every 0.25s", "Projectile Duration: 1.5s" (reference data); no coefficient in its text.
// factor (2026-11-08, SS14 client 0x1423e3d40): Split 564131's moving projectiles (reaction_normal_shot / reaction_cast_chain_shot, speed
// 1600) have hit rules in brother group −1 with table [(1, 36)] and bCalcPercentOnSameEntity 0, so they count no earlier hit and every
// projectile keeps 100% once Magnetic Field lands the extra ones (field 2006262 is added only at or above the table's first key, so
// Magnetic Field's "−20% base damage coefficient for subsequent Projectiles" never reaches them). The table applies only to the stationary
// projectiles (the _still shots, brother group 2) and the chain (row 282, group 3). Was 36% kept (2026-11-05), 64% before.
const SPARKLE = { interval: 0.25, duration: 1.5, factor: 1 };
// Hound's Fangs: Volley (2026-11-08): Split 679413's "reaction_repeat small" fires 10 Small Fangs (repeat 10, shrinkRepeatTimeToNumOfActualTargetsFound
// false, so all 10 at the one dummy) whose hit rule is brother group −1 with an empty table, bHitBrother 1 and bHitParent 1: no Shotgun
// falloff, each at 100% (client 0x1423e3d40 returns 1.0 on an empty table). Was the default 30% kept.
const FANG_VOLLEY_KEPT = 1;
// Whirlwind Blade: "deals damage once every 0.25s", "automatically recovered after 5 s" (reference data).
const WHIRLWIND_BLADE = { interval: 0.25, duration: 5 };
// Lightning Storm: "strikes once every 0.5 s for 5 s" (reference data; src/skill-hit-profiles.js).
const LIGHTNING_STORM = { interval: 0.5, duration: 5 };
// Frost Spike: "Icy Blade … Fires 2 Projectiles in its base state"; "This skill's Projectile Quantity is not affected by bonuses" (reference data).
// Glaciate (recipe 240150160, node 436 → Split 173720; 2026-11-08): the Thrust (stab, brother group −1, empty table) fires the Icy Blades on
// its hit through reaction_stab_repeat (repeat 2, no shrink to targets found) of a 1-projectile shot whose rule is brother group 2, table
// [(1, 30)], bHitParent 1 (so a blade can hit the Thrust's victim) and bHitBrother 1. The Thrust's group −1 state is never counted, so the
// first blade keeps 100% and the second 30%: 1 + 0.3 × (2 − 1) blade hits per use (was 2 × 0.3, read as each blade a repeat of the Thrust).
const FROST_SPIKE_BLADES = 2;
// Icebound Beam: Chilling Spike's large Icy Blades: Split 127219 reaction_big_shot hit rule, brother group 2, table [(1, 35)] (the share kept).
const LARGE_BLADE_KEPT = 0.35;
// Ring of Blades: "Generates 1 Projectile for each channeling, up to 5 Projectile(s)" (reference data).
export const RING_OF_BLADES_MAX_PROJECTILES = 5;
// Skills whose hit count follows their skill Duration (the storm's strikes over its duration): support "Duration" lines read here.
export const BATCH5_DURATION_SKILLS = new Map([["Lightning Storm", LIGHTNING_STORM]]);

export const BATCH5_RULES = [
  // ---- Shotgun Effect gained, its coefficient, where the projectiles aim ----
  // Split Shot: Volley / Sparkle: Magnetic Field (recipe 483352160: label 3050340 "has Shotgun Effect", read by the skill's script): the
  // skill's projectiles can hit the same enemy at the Shotgun coefficient.
  rule(/^The supported skill has Shotgun Effect$/i, () => ({ kind: "shotgunGained", recipe: 483352160 })),
  // Electrifying Shot: Close-Range (chunk 8; recipe 322672192, node 436 → Split 410757: bHitBrother 1, repeatDmgDecPercent 30).
  rule(new RegExp(`^The supported skill has Shotgun Effect\\. The Shotgun Effect falloff coefficient is ${N}%, but it has a shorter range$`, "i"), (m) => ({ kind: "shotgunGained", coefficient: keptShareFromCoefficient(num(m[1])), recipe: 322672192 })),
  // Charged Pummel: Drastic Shift (chunk 8; recipe 283486432: label 3100163 moves the per-stack bonus to the Electric Field, field 2600371).
  rule(new RegExp(`^${N}% additional damage and ${N}% additional Skill Area for the Electric Field per channeled stack when the supported skill consumes Demolisher Charge, but Pummel Damage no longer additionally increases$`, "i"), (m) => ({ kind: "drasticShift", value: num(m[1]), recipe: 283486432 })),
  // Ice Shot: Batter (chunk 8; recipe 389080480: the hit rule's child variant, bHitParent 1, row 22: the Explosion now reaches the projectile's target).
  rule(/^The supported skill's explosions can hit enemies hit by Projectiles$/i, () => ({ kind: "batterExplosion", recipe: 389080480 })),
  // Hammer of Ash: Blast Quake (chunk 8; recipe 280343040: label on the skill, 2 more explosions).
  rule(/^The supported skill's Projectiles always Penetrate their targets and cause (\d+) additional explosion\(s\)$/i, (m) => ({ kind: "blastQuake", value: num(m[1]), recipe: 280343040 })),
  // Flame Jet: Furnace, Scorched Earth (chunk 8; the fields lieyanshifang_toushewushuliang and lieyanshifang_jiangdijiange).
  rule(/^\+?(\d+) erupted Fire Bomb\(s\) for the supported skill$/i, (m) => ({ kind: "eruptionBombs", value: num(m[1]) })),
  rule(new RegExp(`^${N}% Eruption Interval for the supported skill$`, "i"), (m) => ({ kind: "eruptionInterval", value: num(m[1]) })),
  // Bombard: Guided (chunk 8; recipe 515488160, node 232 mode 2 → Split 556715: repeatTimes 5, base 795922 has 4; rows 81 / 82 unchanged).
  rule(/^The supported skill can attack (\d+) additional time with its tracking radius increased to [\d.]+\s*m and tracking angle to 360°$/i, (m) => ({ kind: "guidedShell", value: num(m[1]), recipe: 515488160 })),
  rule(/^The supported skill's Projectiles will be fired as a volley$/i, () => ({ kind: "volley" })),
  // Sparkle: Magnetic Field (858241472) and Rain of Arrows: Tracking (770714432): field 2006262 "base damage coefficient for subsequent
  // effects of Shotgun Effect", added to the coefficient.
  rule(new RegExp(`^${N}% base damage coefficient for subsequent (Projectiles|effects) of Shotgun Effect for the supported skill$`, "i"), (m) => ({ kind: "coefficientAdd", value: num(m[1]), recipe: /Projectiles/i.test(m[2]) ? 858241472 : 770714432 })),
  // Rain of Arrows: Tracking (917935744: label 3100331): every arrow aims at the enemy (the "all" reach instead of "half").
  rule(/^The supported skill's Projectiles are guaranteed to aim at enemies$/i, () => ({ kind: "aimAll", recipe: 917935744 })),
  // Corrosion Focus: Splash (156132704: node 114 converts Projectile Quantity (20061082) into launched Projectiles (26004522), P2 per
  // P1, up to P3; the Orb's coefficient line).
  rule(new RegExp(`^For every \\+?${N} to Projectile Quantity, the supported skill launches ${N} additional Projectile\\(s\\), up to ${N} additional Projectile\\(s\\)$`, "i"), (m) => ({ kind: "splashProjectiles", every: num(m[1]), per: num(m[2]), cap: num(m[3]), recipe: 156132704 })),
  rule(new RegExp(`^Corrosion Orb's Shotgun Effect falloff coefficient is ${N}%$`, "i"), (m) => ({ kind: "coefficientSet", value: num(m[1]) })),
  // Chain Lightning: Merge (493240160: label 3100011) and Web of Lightning: the extra chains (one per Jump) can hit the dummy only with Merge.
  rule(new RegExp(`^Multiple Chain Lightnings released by the supported skill can target the same enemy, but will prioritize different enemies\\. The Shotgun Effect falloff coefficient of the supported skill is ${N}%$`, "i"), (m) => ({ kind: "chainMerge", value: num(m[1]), recipe: 493240160 })),
  rule(/^For every 1 Jump, the supported skill releases 1 additional Chain Lightning \(does not target the same enemy\)\. Each Chain Lightning can only Jump 1 time\(s\)$/i, () => ({ kind: "chainWeb" })),
  // Frost Spike: Glaciate (240150160: node 436, the skill's own logic 173720): the Icy Blades also hit the Thrust's target, at 30% Shotgun
  // (here the text's 30% equals the row 402 hit rule's table 30 in Split 173720, the share kept).
  rule(new RegExp(`^Icy Blades launched by the supported skill also deal damage to enemies hit by Thrust, and the Icy Blades have a ${N}% Shotgun Effect$`, "i"), (m) => ({ kind: "glaciate", value: num(m[1]), recipe: 240150160 })),
  // Hound's Fangs: Volley: 10 Small Fangs instead of each Massive Fang, which can hit the same enemy (default 30% kept).
  rule(/^No longer fires Massive Fangs when Bite Charge reaches 10 stacks or higher, and instead continuously fires a total of (\d+) Small Fangs at nearby enemies$/i, (m) => ({ kind: "fangVolley", value: num(m[1]) })),
  rule(/^Small Fangs fired this way can hit the same enemy$/i, () => ({ kind: "fangVolleyDetail" })),
  // ---- Waves ----
  // Blizzard: Hail (647786: field 2501030, total waves).
  rule(new RegExp(`^${N} total waves for the supported skill$`, "i"), (m) => ({ kind: "totalWaves", value: num(m[1]), recipe: 647786 })),
  rule(/^All waves of the supported skill will be released at the same time$/i, () => ({ kind: "wavesTogether" })),
  rule(/^All waves of the supported skill are considered the last wave$/i, () => ({ kind: "allLastWave" })),
  // Frost Impact: Ice Cluster / Chilling Surge / Chilling Buildup (491348000: field 2600041, per wave launched).
  rule(/^The supported skill generates (\d+) additional waves of Ice Spikes, but each wave of Ice Spikes no longer additionally increases damage$/i, (m) => ({ kind: "iceWaves", value: num(m[1]) })),
  rule(/^Each wave of the supported skill's Ice Spikes no longer additionally increases damage$/i, () => ({ kind: "noWaveBonus" })),
  rule(new RegExp(`^${N}% additional Hit Damage for each wave of Ice Spikes launched by the supported skill$`, "i"), (m) => ({ kind: "waveBonus", value: num(m[1]), recipe: 491348000 })),
  // Inexhaustible Barrage: Landslide (542893760: field 2600311 on {cannon 5000728, this skill}) and Bombard (552171392: on each Barrage
  // wave (trigger 1001320, gun 5000727 / 5000726), node 624 +P1 Projectile Quantity (20061082) to the next loop action).
  rule(new RegExp(`^There is a ${N}% chance to replenish 1 barrage wave after each barrage wave of the supported skill while using a cannon$`, "i"), (m) => ({ kind: "replenishWave", value: num(m[1]), weapon: "cannon", recipe: 542893760 })),
  rule(/^The replenished barrage wave will not trigger this effect$/i, () => ({ kind: "replenishDetail" })),
  rule(new RegExp(`^For every Barrage wave, ${N} Projectile Quantity for the supported skill when using a gun$`, "i"), (m) => ({ kind: "waveProjectiles", value: num(m[1]), weapon: "gun", recipe: 552171392 })),
  // Carpet Bombardment (86612: field 2501031, the Barrage wave interval).
  rule(new RegExp(`^${N}% Wave Interval for the supported skill$`, "i"), (m) => ({ kind: "waveInterval", value: num(m[1]), recipe: 86612 })),
  // Fallen Star: Starfall (3647565: a Charge (buff 11790) per hit (trigger 1000033, not by Starfall 6300043); at P1 stacks, behind a 1 s
  // gate, the next cast is a Starfall; field 2600681 its +P2% additional Hit Damage).
  rule(new RegExp(`^Gains 1 stack of Charge when the supported skill hits\\. At (\\d+) Charge stack\\(s\\), the supported skill casts an additional wave of Starfall\\s*${N}% additional Hit Damage for this skill when casting Starfall$`, "i"), (m) => ({ kind: "starfall", every: num(m[1]), value: num(m[2]), recipe: 3647565 })),
  // ---- Pulses, secondary explosions, extra projectiles ----
  // Psionic Missile: Emission (12079597: label 3100643; 15168309: label 3100642) and Convergence (11568069: field 2600722).
  rule(/^Generates a pulse after all projectiles fired by the supported skill land, dealing additional damage once$/i, () => ({ kind: "pulseDetail", recipe: 12079597 })),
  rule(new RegExp(`^Pulse Damage is equal to ${N}% of Explosion Damage$`, "i"), (m) => ({ kind: "pulse", value: num(m[1]), recipe: 12079597 })),
  rule(/^Projectiles fired by the supported skill always land dispersed$/i, () => ({ kind: "dispersed", recipe: 15168309 })),
  rule(/^Projectiles fired by the supported skill always land together$/i, () => ({ kind: "together" })),
  rule(new RegExp(`^${N}% additional damage for subsequent projectile explosions in the same skill cast for each projectile fired by the supported skill, up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ kind: "convergence", value: num(m[1]), cap: num(m[2]), recipe: 11568069 })),
  // Blazing Bullet: Dual Resonance (132511360: node 336 fixes field 2006215, Projectile Quantity, at 1; 30121770: label 3100031).
  rule(/^The Projectile Quantity of the supported skill is fixed at 1$/i, () => ({ kind: "projectileFixed", recipe: 132511360 })),
  rule(new RegExp(`^When an explosion of the supported skill hits, there is a ${N}% chance to generate a smaller secondary explosion at the enemy's location, which deals the same damage as the original explosion\\s*Multiple secondary explosions can hit the same enemy, and the Shotgun Effect falloff coefficient is ${N}%$`, "i"), (m) => ({ kind: "secondaryExplosion", chance: num(m[1]), value: num(m[2]), recipe: 30121770 })),
  // Blazing Meteor: Detonation (Ash explosions per Projectile Quantity bonus; the Projectile Quantity line above).
  rule(new RegExp(`^${N} Ash explosion count for the supported skill for every \\+?(\\d+) to Projectile Quantity it has, up to \\+?(\\d+)$`, "i"), (m) => ({ kind: "ashCount", per: num(m[1]), every: num(m[2]), cap: num(m[3]) })),
  // Icebound Beam: Chilling Spike: 4 large Icy Blades at max channeled stacks (the volley the profile fires every 5 channel uses).
  rule(new RegExp(`^At max channeled stacks, generates (\\d+) additional large Icy Blade Projectiles that always Penetrate and deal ${N}% of Base Icy Blade Projectile Damage$`, "i"), (m) => ({ kind: "largeBlades", count: num(m[1]), value: num(m[2]) })),
  // Fire Burst: Violent Blast (705496384: on a crit hit (1000033, crit tag 5001010, not by its own triggered casts 6101357), once per
  // cast, the skill is triggered on the target) and Converge (112674344: field 2600261, explosions of those triggered casts).
  rule(/^When the supported skill lands a Critical Strike, triggers the supported skill on the target once$/i, () => ({ kind: "critRetrigger", recipe: 705496384 })),
  rule(/^The skill triggered by this effect won't trigger this effect again$/i, () => ({ kind: "critRetriggerDetail", recipe: 705496384 })),
  rule(/^When the supported skill is triggered by its own Critical Strike, explodes (\d+) additional time\(s\)$/i, (m) => ({ kind: "converge", value: num(m[1]), recipe: 112674344 })),
  // Sparkle: Static Electricity (472151840: field 2600113).
  rule(new RegExp(`^When a Projectile of the supported skill vanishes, ${N}% chance to generate a stationary Projectile where the Projectile vanished\\. The new Projectile will not trigger this effect again$`, "i"), (m) => ({ kind: "stationary", value: num(m[1]), recipe: 472151840 })),
  // ---- Combo Finishers ----
  // Serpent Beam: Twin Blaze (406323424: label 3100511), Gale Slash: Soaring (27436140: label 3100531), Spectral Slash: Legion (506057920:
  // node 700 adds Clones (26005922) per entity within P1 m, up to P2).
  rule(/^When casting the Combo Finisher of the supported skill, creates a Fire Snake at your side that recasts the finisher once$/i, () => ({ kind: "finisherRepeat", value: 1, recipe: 406323424 })),
  rule(/^The supported skill's Combo Finisher now deals an instance of damage again after a brief delay$/i, () => ({ kind: "finisherRepeat", value: 1, recipe: 27436140 })),
  rule(/^The supported skill no longer deals additional damage based on Attack Speed bonus$/i, () => ({ kind: "noAttackSpeedDamage", recipe: 27436140 })),
  rule(new RegExp(`^The supported skill's Combo Finisher generates 1 additional Clone for each enemy within ${N} m, up to (\\d+)$`, "i"), (m) => ({ kind: "extraClone", meters: num(m[1]), cap: num(m[2]), recipe: 506057920 })),
  // ---- Cooldowns, intervals, durations, Focus Pts ----
  rule(new RegExp(`^The supported skill only attacks once and has a ${N}\\s*s cooldown$`, "i"), (m) => ({ kind: "attackOnce", value: num(m[1]) })),
  rule(/^The supported skill can now be triggered$/i, () => ({ kind: "triggerable" })),
  rule(new RegExp(`^The supported skill now has a ${N}\\s*s cooldown$`, "i"), (m) => ({ kind: "setCooldown", value: num(m[1]) })),
  rule(new RegExp(`^${N}\\s*s to the cooldown of the supported skill$`, "i"), (m) => ({ kind: "addCooldown", value: num(m[1]) })),
  // Thunder Focus: Haste / Overflow, Acuteness Focus: Piercing Agony / Dull Pain (166478464 / 712912384: fields 2600462 / 2600431).
  rule(new RegExp(`^${N} Focus Pts required to trigger the supported skill$`, "i"), (m) => ({ kind: "focusRequired", value: num(m[1]), recipe: 166478464 })),
  // Acuteness Focus: Dull Pain: Acute Smash on up to 1 enemy instead of the Acute Strike, at +X% additional Hit Damage.
  rule(new RegExp(`^The supported skill no longer casts Acute Strike\. Instead it casts Acute Smash on up to 1 enemy\. ${N}% additional Hit Damage dealt by Smash$`, "i"), (m) => ({ kind: "smash", value: num(m[1]) })),
  // Sparkle: Strobe (45197912: field 2600111) and Whirlwind Blade: Swift Slash (24750512: field 2600121; 113254192: label 3100171).
  rule(new RegExp(`^${N}\\s*s Damage Interval for the supported skill's Projectiles$`, "i"), (m) => ({ kind: "damageInterval", value: num(m[1]), recipe: 45197912 })),
  rule(/^Bonuses and additional bonuses to Cast Speed are also applied to the Damage Interval of the supported skill's Projectiles$/i, () => ({ kind: "intervalCastSpeed", recipe: 113254192 })),
  rule(/^The supported skill's Eruption Interval is no longer affected by Cast Speed$/i, () => ({ kind: "eruptionFixed" })),
  // Lightning Storm: Surging Thunder (234412672: fields 2600151–2600153) and Whirlwind Blade: Sharpen (362224192: fields 2600122 / 2600123).
  rule(new RegExp(`^For every ${N}\\s*s duration of the supported skill, ${N}% additional damage and ${N}% base radius\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ kind: "durationStacks", every: num(m[1]), value: num(m[2]), cap: num(m[4]), recipe: 234412672 })),
  rule(new RegExp(`^For every ${N}\\s*s duration of the supported skill's Projectiles, ${N}% additional Hit Damage, stacking up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ kind: "projectileDurationStacks", every: num(m[1]), value: num(m[2]), cap: num(m[3]), recipe: 362224192 })),
  // Ring of Blades: Blade Formation (5798517: node 114 converts Projectile Quantity into Max Projectiles (26006012), P2 per P1, up to P3).
  rule(new RegExp(`^${N} Max Projectiles for the supported skill for every \\+?(\\d+) Projectile Quantity, up to \\+?(\\d+)$`, "i"), (m) => ({ kind: "maxProjectiles", per: num(m[1]), every: num(m[2]), cap: num(m[3]), recipe: 5798517 })),
  // ---- Steep Strike ----
  rule(/^The supported skill is guaranteed to perform a Steep Strike$/i, () => ({ kind: "steepForced", value: 1 })),
  rule(/^The supported skill no longer launches Steep Strike$/i, () => ({ kind: "steepForced", value: 0 })),
  rule(/^The supported skill cannot obtain Steep Strike attempts with Steep Strike Chance$/i, () => ({ kind: "steepForced", value: 0, chanceOnly: true })),
  rule(new RegExp(`^For every \\+?1% Steep Strike chance, ${N}% additional Hit Damage for this skill's Steep Strike form$`, "i"), (m) => ({ kind: "steepPerChance", value: num(m[1]) })),
  // ---- Spell Burst consumption (Fire Burst: Heart of Flame 136539824, Prairie Fire 236915184): the Spell Burst casts' hits ----
  { family: "spellBurst", pattern: new RegExp(`^When the supported skill activates Spell Burst\\s*,\\s*skills cast by Spell Burst deal ${N}% additional Hit Damage to enemies at the center for every (\\d+) stack\\(s\\) of Spell Burst Charge consumed\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ kind: "hitAdditional", perConsumed: num(m[1]), every: num(m[2]), cap: num(m[3]), value: 0, batch5: true, burstKind: "heartOfFlame", recipe: 136539824 }) },
  { family: "spellBurst", pattern: new RegExp(`^${N}% additional Hit Damage for skills cast by Spell Burst each time Spell Burst is activated by the supported skill\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), build: (m) => ({ kind: "hitAdditional", perActivation: num(m[1]), cap: num(m[2]), value: 0, batch5: true, burstKind: "prairieFire", recipe: 236915184 }) },
  // ---- Multistrike: Corrosive Throw: Augmentation (661214080: field 2006252, the initial Multistrike Count; src/skill-hit-model.js) ----
  { family: "multistrike", pattern: /^\+?(\d+) initial Multistrike Count for the supported skill$/i, build: (m) => ({ value: num(m[1]), kind: "initial", batch5: true, recipe: 661214080 }) },
  // ---- Lightning Storm: Surging Thunder's tier line: Cooldown Recovery Speed of the supported skill ----
  { family: "cooldown", pattern: new RegExp(`^${N}% (additional )?Cooldown Recovery Speed$`, "i"), build: (m) => ({ value: num(m[1]), additional: Boolean(m[2]), batch5: true }) },
  // ---- Neutral on the one dummy ----
  neutral("notOnDummy", /^For every \+?1% Double Damage Chance the supported skill has, \+?1% chance to double Projectile Quantity$/i, "Electrifying Shot's extra projectiles cannot hit the same enemy (its text does not say they can; the Ice Lances rule, 2026-10-12), so a doubled Projectile Quantity adds nothing on the one dummy"),
  neutral("notOnDummy", /^Lucky Damage also affects the Projectile Quantity of the supported skill's forks$/i, "Moon's Dawn's forked Moonblades need other enemies (src/skill-hit-profiles.js), so their quantity changes nothing on the one dummy"),
  neutral("nonDamage", /^The supported skill can now only hit 1 enemy$/i, "one enemy is the training dummy either way"),
  neutral("nonDamage", new RegExp(`^The bonus and additional bonus to Cast Speed are also applied to the Interval of Glacial Spikes generated by the supported skill, up to ${N}%$`, "i"), "Ice Focus's Glacial Spikes are bound by the Focus Pts gained (75 Pts/s ÷ 45 per Spike generation, src/skill-hit-profiles.js), not by the 0.5 s interval, so a shorter interval adds no Spike"),
  neutral("nonDamage", new RegExp(`^The max jump distance of the supported skill's Combo Finisher is increased to ${N} m$`, "i"), "jump distance"),
  neutral("nonDamage", /^The supported skill no longer causes explosions on hit$/i, "Burning Shot's explosion (its True Damage burst on an Ignited enemy) is not a modeled hit of its profile, so removing it changes no figure"),
  neutral("nonDamage", /^Projectiles from the supported skill always Penetrate$/i, "Penetration needs enemies behind the target")
];

// The hit pass reads crit rates for these (src/planner.js runs the rate pass for them).
export const BATCH5_RATE_SUPPORTS = new Set(["Fire Burst: Violent Blast (Magnificent)", "Fire Burst: Converge (Noble)"]);

// Per kind: the skills whose profile it changes and the hit groups it needs (src/skill-hit-profiles.js / src/attack-hit-profiles.js keys).
const NEEDS = {
  shotgunGained: { "Split Shot": "hit", Sparkle: "hit", "Electrifying Shot": "shot" }, guidedShell: { Bombard: "explosions" }, drasticShift: { "Charged Pummel": "field" }, batterExplosion: { "Ice Shot": "lance" }, blastQuake: { "Hammer of Ash": "explosion" }, eruptionBombs: { "Flame Jet": "bombs" }, eruptionInterval: { "Flame Jet": "bombs" }, volley: { "Split Shot": "hit" }, coefficientAdd: { Sparkle: "hit", "Rain of Arrows": "arrows" },
  aimAll: { "Rain of Arrows": "arrows" }, splashProjectiles: { "Corrosion Focus": "orb", "Precise: Corrosion Focus": "orb" }, coefficientSet: { "Corrosion Focus": "orb", "Precise: Corrosion Focus": "orb" },
  chainMerge: { "Chain Lightning": "hit" }, chainWeb: { "Chain Lightning": "hit" }, glaciate: { "Frost Spike": "thrust" }, fangVolley: { "Hound's Fangs": "massive" }, fangVolleyDetail: { "Hound's Fangs": "massive" },
  totalWaves: { Blizzard: "waves" }, wavesTogether: { Blizzard: "waves" }, allLastWave: { Blizzard: "waves" },
  iceWaves: { "Frost Impact": "waves" }, noWaveBonus: { "Frost Impact": "waves" }, waveBonus: { "Frost Impact": "waves" },
  replenishWave: { "Inexhaustible Barrage": "waves" }, replenishDetail: { "Inexhaustible Barrage": "waves" }, waveProjectiles: { "Inexhaustible Barrage": "waves" },
  waveInterval: { "Fallen Star": "comets" }, starfall: { "Fallen Star": "comets" },
  pulseDetail: { "Psionic Missile": "hit" }, pulse: { "Psionic Missile": "hit" }, dispersed: { "Psionic Missile": "hit" }, together: { "Psionic Missile": "hit" }, convergence: { "Psionic Missile": "hit" },
  projectileFixed: { "Blazing Bullet": "bomb", "Blazing Meteor": "meteor" }, secondaryExplosion: { "Blazing Bullet": "explosion" }, ashCount: { "Blazing Meteor": "ash" },
  largeBlades: { "Icebound Beam": "blades" }, critRetrigger: { "Fire Burst": "hit" }, critRetriggerDetail: { "Fire Burst": "hit" }, converge: { "Fire Burst": "hit" },
  stationary: { Sparkle: "hit" }, finisherRepeat: { "Serpent Beam": "finisher", "Gale Slash": "finisher" }, noAttackSpeedDamage: { "Gale Slash": "finisher" }, extraClone: { "Spectral Slash": "finisher" },
  attackOnce: { Bombard: "explosions" }, triggerable: { Bombard: "explosions" }, setCooldown: { "Burning Shot": "shot" }, addCooldown: { "Shadow Shot": "hit" },
  smash: { "Acuteness Focus": "strike", "Precise: Acuteness Focus": "strike" },
  focusRequired: { "Thunder Focus": "thunderstrike", "Precise: Thunder Focus": "thunderstrike", "Acuteness Focus": "strike", "Precise: Acuteness Focus": "strike" },
  damageInterval: { Sparkle: "hit", "Whirlwind Blade": "hit" }, intervalCastSpeed: { "Whirlwind Blade": "hit" }, eruptionFixed: { "Flame Jet": "bombs" },
  durationStacks: { "Lightning Storm": "hit" }, projectileDurationStacks: { "Whirlwind Blade": "hit" }, maxProjectiles: { "Ring of Blades": "blades" },
  steepForced: { "Focused Slash": "steep", Whirlwind: "steep", "Icy Blade": "steep" }, steepPerChance: { "Icy Blade": "steep" }
};
const READINGS = {
  shotgunGained: "the skill's projectiles can hit the dummy repeatedly: its volley is a fan that lands every projectile standing close (one at range), each after the first keeping the hit rule's share (Split Shot 23%: its hit rule's repeatDmgDecPercent 23, the text's 77% lost; Sparkle 100%: its moving projectiles' rule is in brother group −1, which counts no earlier hit); extra Projectile Quantity joins the fan",
  volley: "the projectiles fly as one fan (the Shotgun Effect line's reach)",
  coefficientAdd: "added to the share each later effect keeps (game field 2006262, client: (table + field) × 0.01): a negative value makes each projectile / effect after the first deal that much less",
  aimAll: "every arrow aims at the dummy (all reach, not the fallen-projectile default half)",
  splashProjectiles: "1 + min(cap, ⌊Projectile Quantity ÷ every⌋) Orb projectiles land on the dummy (game recipe 156132704), each after the first at the Orb's Shotgun coefficient",
  coefficientSet: "the Corrosion Orb's projectiles after the first keep 100% − this coefficient (the share lost; linear falloff)",
  chainMerge: "with Web of Lightning's extra chains (one per Jump, 2 base Jumps) every chain hits the dummy, each after the first keeping 100% − this coefficient (the share lost)",
  glaciate: "the Icy Blades (game damage row 402) also hit the Thrust's target: the first at 100%, each later one keeping this coefficient (their own hit rule, brother group 2; the Thrust's group −1 rule is never counted)",
  fangVolley: "10 Small Fangs per 10 casts instead of 1 Massive Fang, all on the dummy at 100% each (their hit rule, brother group −1 with an empty table, takes no Shotgun falloff)",
  totalWaves: "more Blizzard waves per cast (game field 2501030), all landing on the dummy",
  allLastWave: "every wave takes the last wave's Barrage per-wave bonus (src/skill-hit-model.js barrage per-wave reading)",
  iceWaves: "more Ice Spike waves per attack, without the skill's per-wave bonus",
  noWaveBonus: "the skill's own +30% per wave is gone (penalty)",
  waveBonus: "wave k of the attack (the first 0) takes +X% × k additional Hit Damage, one term (game field 2600041; linear)",
  replenishWave: "each wave has this chance to add one more wave that cannot add another: waves × (1 + chance), while a cannon is held",
  waveProjectiles: "each Barrage wave adds +X Projectile Quantity to the next one (node 624, next loop action): wave k fires k more projectiles, while a gun is held",
  waveInterval: "the comet waves fall at the shorter interval (Fallen Star's comet waves are its Barrage waves)",
  starfall: "one Starfall wave (the comets again at the bonus) per 50 comet hits on the dummy (Starfall's own comets add no Charge; its 1 s gate binds only above 50 hits/s)",
  pulse: "one pulse per cast at this share of the explosion's damage, as its own hit",
  dispersed: "extra projectiles land dispersed around the target: about half of them reach the dummy (ceil(n / 2))",
  together: "every projectile lands on the target (the skill's own reading already)",
  convergence: "each explosion after the first in a cast takes +X% × min(cap, projectiles fired), one term",
  projectileFixed: "Projectile Quantity fixed at 1: no extra projectiles (penalty)",
  secondaryExplosion: "each explosion has this chance to generate a secondary one, which can generate another: p ÷ (1 − p) secondaries per explosion on the dummy, each keeping 100% − the coefficient (the share lost)",
  ashCount: "each detonation explodes the Ash 1 + min(cap, per × ⌊Projectile Quantity ÷ every⌋) times on the dummy",
  largeBlades: "every Icy Blade volley (each fifth channel use) adds the large blades at this share of the base blade damage: the first large blade at 100%, each later one keeping 35% (their own hit rule, brother group 2, table 35; the regular blades' group −1 rule is never counted)",
  critRetrigger: "each cast that crits triggers one more cast on the dummy (the triggered one cannot trigger again): casts × (1 + crit share of the casts), measured on the hit pass",
  converge: "the crit-triggered casts explode 1 + N times",
  stationary: "this chance of a stationary projectile at the dummy after each projectile vanishes, hitting it for another 1.5 s (no falloff: not simultaneous)",
  finisherRepeat: "the Combo Finisher deals its damage once more per cycle",
  noAttackSpeedDamage: "the skill's \"0.2% additional damage per +1% Attack Speed\" is gone (penalty)",
  extraClone: "+5 Clones: the dummy, a Boss within range, counts as 5 enemies (record 506057920 calcCountByRarity; Enemy Count: each Boss counts as 5), up to the clause's 5, each keeping the Clones' 30% (their 70% Shotgun falloff is the share lost)",
  attackOnce: "one explosion per use instead of 4, and the cooldown caps the use rate (penalty)",
  guidedShell: "5 shells per use, not 4 (Split 556715's repeat count)",
  drasticShift: "the Demolisher per-stack bonus moves from the Pummel to the Electric Field",
  batterExplosion: "the Explosion (row 22) now also hits the projectile's target: one more hit per shot",
  blastQuake: "2 more explosions per attack, each at the Explosion's repeat share (30% kept)",
  eruptionBombs: "more Fire Bombs per eruption, all landing on the dummy (the skill's best case)",
  eruptionInterval: "the eruptions' interval, longer or shorter",
  triggerable: "Activation Medium triggers on the skill are read like any skill's (src/skill-hit-model.js)",
  setCooldown: "the cooldown caps the use rate (penalty)",
  addCooldown: "added to the skill's cooldown, which caps the use rate (penalty)",
  smash: "the trigger casts one Acute Smash on the dummy instead of the Acute Strike, read with the Acute Strike's damage row (Acute Smash's own row is not decoded) at +X% additional Hit Damage",
  focusRequired: "Focus Pts per triggered strike: uses per second = Focus Pts gained per second ÷ (100 + N)",
  damageInterval: "added to the projectile's damage interval: hits per projectile = duration ÷ interval",
  intervalCastSpeed: "the projectile's damage interval ÷ the Cast Speed factor",
  eruptionFixed: "the Fire Bomb eruptions keep the base 0.7 s interval (penalty)",
  durationStacks: "stacks = min(cap, the storm's duration ÷ every) (static reading of \"for every X s duration\"), one additional term on its strikes",
  projectileDurationStacks: "stacks = min(cap, the blade's 5 s duration ÷ every) (static reading), one additional term on its hits",
  maxProjectiles: "the blades are min(channeled stacks, 5 + min(cap, per × ⌊Projectile Quantity ÷ every⌋)) (skill text: up to 5 Projectiles)",
  steepForced: "the Steep Strike share of attacks"
};
// The Enemy Count rule (game text on "each enemy": each Boss counts as 5), read by Legion's calcCountByRarity (record 506057920).
export const LEGION_BOSS_ENEMY_COUNT = 5;
const PROVISIONAL = new Set(["smash", "shotgunGained", "volley", "coefficientAdd", "splashProjectiles", "coefficientSet", "chainMerge", "glaciate", "fangVolley", "allLastWave", "waveBonus", "replenishWave", "waveProjectiles", "waveInterval", "starfall", "pulse", "dispersed", "convergence", "secondaryExplosion", "ashCount", "largeBlades", "critRetrigger", "converge", "stationary", "finisherRepeat", "intervalCastSpeed", "durationStacks", "projectileDurationStacks", "maxProjectiles"]);

/** Settle the clauses that read the planner's state (src/support-effects.js resolveSupportEffects). */
export function resolveBatch5Clause(clause, full, setupKey = null) {
  const state = full.conditions;
  if (clause.family === "spellBurst" && clause.burstKind) {
    const max = state ? Math.max(0, Number(state.maxSpellBurst) || 0) : null;
    if (clause.burstKind === "heartOfFlame") {
      // Each activation consumes the full Spell Burst (Max Spell Burst stacks); the dummy at the centre (best case).
      const steps = max == null ? clause.cap : Math.min(clause.cap, Math.floor(max / clause.every));
      return { value: round(clause.perConsumed * steps), conditionText: `${max == null ? `held at ${clause.cap}` : `Max Spell Burst ${max} consumed per activation ÷ ${clause.every} = ${steps} (up to ${clause.cap})`} × +${clause.perConsumed}% on the Spell Burst casts' hits, the dummy at the centre (best case; game recipe ${clause.recipe}; provisional)` };
    }
    // Prairie Fire: one stack per activation, no duration published: held at the cap with own buffs built before engaging (provisional).
    const held = state?.prebuiltSelfBuffs === false ? 1 : clause.cap;
    return { value: round(clause.perActivation * held), conditionText: `${held} stack(s) × +${clause.perActivation}% (one per Spell Burst activation, no duration published: held at the cap with own buffs built before engaging; game recipe ${clause.recipe}; provisional)` };
  }
  if (clause.kind === "critRetrigger" || clause.kind === "converge") {
    const facts = state?.critHitsBySetup?.get?.(setupKey) || null;
    const hits = Number(facts?.hitsPerSecond) || 0, crits = Number(facts?.critHitsPerSecond) || 0;
    return { critShare: facts && hits > 0 ? Math.min(1, crits / hits) : null };
  }
  if (clause.weapon) {
    const held = state?.weaponTypes || null;
    if (!held) return { active: null };
    const allowed = WEAPON_WORDS[clause.weapon] || [];
    return { active: held.some((type) => allowed.includes(type)), heldText: held.join(" / ") || "no weapon" };
  }
  return {};
}

const componentKeys = (profile) => new Set((profile?.components || []).map((component) => component.key));
const has = (setupSupports, name) => Boolean(setupSupports?.has?.(name));

/** Badge of a batch-5 "hitCount" clause on its setup ({ status, reason, consumers }). */
export function batch5Status(clause, full) {
  const s = (status, reason, consumers = []) => ({ status, reason, consumers });
  const skill = full.skillName;
  const needs = NEEDS[clause.kind] || {};
  if (full.engine !== "skill-hit") return s("Not modeled", `read on the skill-hit model only (${Object.keys(needs).join(", ") || "the supported skill"})`);
  const key = needs[skill];
  if (!key) return s("Inactive", `changes ${Object.keys(needs).join(" / ")} only`);
  // A context without the skill's profile (a disabled support's badge, src/skill-coverage.js): the reading, unresolved.
  if (!full.profile) return s("Provisional", `${READINGS[clause.kind] || "read by the hit model"} (src/support-hit-count-batch5.js; the skill's hit profile is not in this context)`, ["skill-hit"]);
  if (!componentKeys(full.profile).has(key)) return s("Inactive", `${skill} has no modeled "${key}" hit group`);
  const reading = READINGS[clause.kind] || "read by the hit model";
  const done = (text) => s(PROVISIONAL.has(clause.kind) ? "Provisional" : "In calc", `${text} (src/support-hit-count-batch5.js${clause.recipe ? `; game recipe ${clause.recipe}` : ""}${PROVISIONAL.has(clause.kind) ? "; provisional" : ""})`, ["skill-hit"]);
  switch (clause.kind) {
    case "chainWeb": return has(full.setupSupportNames, "Chain Lightning: Merge (Noble)") ? done("the extra Chain Lightnings (one per Jump) hit the dummy through Chain Lightning: Merge") : s("Not on dummy", "the extra Chain Lightnings do not target the same enemy (they need other enemies; Chain Lightning: Merge lets them hit the dummy)");
    case "chainMerge": return has(full.setupSupportNames, "Chain Lightning: Web of Lightning (Magnificent)") ? done(reading) : s("Inactive", "only one Chain Lightning per cast without Chain Lightning: Web of Lightning (extra chains), so nothing repeats on the dummy");
    case "replenishWave": case "waveProjectiles":
      if (clause.active === false) return s("Inactive", `needs a ${clause.weapon} (${(WEAPON_WORDS[clause.weapon] || []).join(" / ")}); held: ${clause.heldText}`);
      return clause.active == null ? s("Provisional", `${reading}; the held weapon is not known here`, ["skill-hit"]) : done(reading);
    case "waveInterval": return done(reading);
    // Sparkle: Magnetic Field's field 2006262 (2026-11-08): the moving projectiles' hit rule (Split 564131) is in brother group −1, so the
    // multiplier stays 1.0 and the field is never added; only the stationary projectiles (Static Electricity, group 2) and the chain (row 282,
    // not a modeled hit) can take it, and the planner counts the stationary ones without falloff.
    case "coefficientAdd": if (skill === "Sparkle") return has(full.setupSupportNames, "Sparkle: Static Electricity (Noble)") ? s("Not modeled", "applies only to Sparkle's stationary projectiles (Split 564131 _still shots, brother group 2, table 36) after the first of a cast; the planner counts the stationary projectiles without falloff, and the moving projectiles' group −1 rule never takes the field") : s("No DPS effect", "Sparkle's moving projectiles have their hit rule in brother group −1 (Split 564131), which counts no earlier hit, so the multiplier stays 1.0 and field 2006262 is never added (client 0x1423e3d40); the stationary projectiles and the chain that could take it are not on this setup / not modeled hits"); return done(reading);
    case "critRetrigger": case "converge":
      if (clause.kind === "converge" && !has(full.setupSupportNames, "Fire Burst: Violent Blast (Magnificent)")) return s("Inactive", "Fire Burst is triggered by its own Critical Strike only with Fire Burst: Violent Blast");
      return clause.critShare == null ? s("Provisional", `${reading}; the crit share is measured on the planner's hit pass (none here)`, ["skill-hit"]) : done(`${reading}: crit share ${round(clause.critShare * 100)}%`);
    case "steepPerChance": return s("Inactive", "with Icy Blade: Hidden Edge the skill obtains no Steep Strike from Steep Strike chance; its other Steep Strike attempts (on Frozen enemies, on inflicting Freeze) are not modeled, so no modeled Steep Strike takes the bonus");
    case "steepForced": return done(clause.value ? "every attack is a Steep Strike (the Steep Strike share is 1)" : clause.chanceOnly ? "Steep Strike chance grants no Steep Strike: the share is 0 (penalty); the skill's Freeze-granted attempts are not modeled" : "no attack is a Steep Strike (the share is 0; penalty)");
    case "projectileFixed": return done(`${reading}; ${skill}'s extra projectiles were not counted on the dummy anyway, so no figure moves unless a Projectile Quantity line would have`);
    case "together": return s("In calc", `${reading} (src/skill-hit-profiles.js Psionic Missile projectileVolley)`, ["skill-hit"]);
    case "fangVolleyDetail": case "replenishDetail": case "critRetriggerDetail": case "pulseDetail": case "wavesTogether":
      return s("In calc", clause.kind === "wavesTogether" ? "Blizzard's waves already all land on the dummy, and it has no per-wave cast-time cost, so releasing them together changes no count (No change)" : "describes the effect the clause beside it counts", ["skill-hit"]);
    default: return done(reading);
  }
}

/** Badge of a "+N Projectile Quantity" line on a skill whose projectile rule a batch-5 support changes, or null. */
export function batch5ProjectileVolleyStatus(skillName, supportNames) {
  const with_ = (name) => has(supportNames, name);
  if ((skillName === "Split Shot" && with_("Split Shot: Volley (Magnificent)")) || (skillName === "Sparkle" && with_("Sparkle: Magnetic Field (Magnificent)"))) return { status: "Provisional", reason: `the supported skill has Shotgun Effect (${skillName === "Split Shot" ? "Split Shot: Volley" : "Sparkle: Magnetic Field"}): the extra projectiles join its fan, all reach the dummy standing close, each after the first keeping the hit rule's share (src/support-hit-count-batch5.js; provisional)` };
  if (/^(?:Precise: )?Corrosion Focus$/.test(skillName || "") && with_("Corrosion Focus: Splash (Noble)")) return { status: "Provisional", reason: "Corrosion Focus: Splash: 1 additional Orb projectile per +2 Projectile Quantity (up to 2), all on the dummy at the Orb's coefficient (src/support-hit-count-batch5.js; provisional)" };
  if (skillName === "Blazing Meteor" && with_("Blazing Meteor: Detonation (Noble)")) return { status: "In calc", reason: "Projectile Quantity is fixed at 1; its bonuses raise Detonation's Ash explosion count (src/support-hit-count-batch5.js)" };
  if (skillName === "Blazing Bullet" && with_("Blazing Bullet: Dual Resonance (Noble)")) return { status: "No DPS effect", reason: "Blazing Bullet: Dual Resonance fixes the Projectile Quantity at 1 (its Projectile Size lines have no effect on one dummy)" };
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Profile edits.
const groupOf = (skill, id) => (skillHitDamageSs13[skill] || skillHitDamageNewSkills[skill])?.groups?.find((group) => group.id === id) || null;
const applied = (clause) => ["In calc", "Provisional"].includes(clause.status);

/**
 * The skill's hit profile with this setup's batch-5 clauses applied: { profile, notes, edited }.
 * @param {object} profile a SKILL_HIT_PROFILES / ATTACK_HIT_PROFILES entry
 * @param {object} effects resolveSupportEffects output for the setup (its `clauses` and `duration`)
 * @param {object} context { weapon } (the held weapon types for the cannon / gun clauses when the planner state is absent)
 */
export function applyBatch5ProfileEdits(profile, effects, { weapon = null } = {}) {
  const clauses = (effects?.clauses || []).filter((clause) => clause.batch5 && clause.family === "hitCount" && applied(clause));
  const durations = BATCH5_DURATION_SKILLS.has(profile?.name) ? (effects?.duration || []).filter((line) => ["In calc", "Provisional"].includes(line.status)) : [];
  // Blizzard: Freezing Point swaps the skill for Split 207367: no casting action (1 s fixed) and the clause's cooldown.
  const freezingPoint = profile?.name === "Blizzard" ? (effects?.clauses || []).find((clause) => clause.family === "empower" && clause.kind === "timing") : null;
  if (freezingPoint && profile.timing) profile = { ...profile, timing: { ...profile.timing, useTime: 1, speedType: "fixed", cooldown: freezingPoint.cooldown }, sources: { ...profile.sources, timing: "SkillEditor Split 207367 (Blizzard: Freezing Point)" } };
  if (!profile || (!clauses.length && !durations.length)) return { profile, notes: [], edited: Boolean(freezingPoint) };
  const notes = [];
  const components = profile.components.map((component) => ({ ...component, perUse: component.perUse && typeof component.perUse === "object" ? { ...component.perUse, ...(component.perUse.falloff ? { falloff: { ...component.perUse.falloff } } : {}) } : component.perUse, extraAdditional: [...(component.extraAdditional || [])] }));
  const next = { ...profile, components, notes: [...(profile.notes || [])] };
  const find = (key) => components.find((component) => component.key === key);
  const kinds = new Map();
  for (const clause of clauses) kinds.set(clause.kind, [...(kinds.get(clause.kind) || []), clause]);
  const first = (kind) => kinds.get(kind)?.[0] || null;
  const note = (clause, text) => notes.push(`${profile.name}: ${clause.support}: ${text} (src/support-hit-count-batch5.js${clause.recipe ? `, game recipe ${clause.recipe}` : ""}${PROVISIONAL.has(clause.kind) ? "; provisional" : ""}).`);
  const held = (word) => { const types = [weapon?.mainHand?.weapon ? weapon.mainHand.type : null, weapon?.offHand?.weapon ? weapon.offHand.type : null].filter(Boolean); return types.some((type) => (WEAPON_WORDS[word] || []).includes(type)); };
  const weaponOk = (clause) => clause.active === true || (clause.active == null && held(clause.weapon));
  const setCooldown = (seconds, add = false) => {
    const timing = next.timing && Number.isFinite(next.timing.useTime) ? next.timing : null;
    if (timing) { next.timing = { ...timing, cooldown: add ? (timing.cooldown || 0) + seconds : Math.max(timing.cooldown || 0, seconds) }; return next.timing.cooldown; }
    const fallback = next.timingFallback || { useTime: 1, speedType: "attack-speed", cooldown: 0, cdTimes: 0, source: "Reference data" };
    next.timingFallback = { ...fallback, cooldown: add ? (fallback.cooldown || 0) + seconds : Math.max(fallback.cooldown || 0, seconds) };
    return next.timingFallback.cooldown;
  };
  // Sparkle / Whirlwind Blade: one projectile hitting every interval over its duration (the profiles' fixed counts as a tick spec).
  const tickSpec = (component, { interval, duration }) => {
    if (typeof component.perUse === "number") component.perUse = { perTick: component.perUse / (duration / interval), intervalSeconds: interval, castSpeedScaled: false, durationSeconds: duration };
    return component.perUse;
  };

  // ---- Shotgun Effect gained / coefficient / reach ----
  if (first("shotgunGained")) {
    const clause = first("shotgunGained");
    if (profile.name === "Split Shot") {
      const hit = find("hit");
      hit.perUse = { perTick: 1, falloff: { count: SPLIT_SHOT.projectiles, factor: SPLIT_SHOT.factor, reach: "fan", projectile: true } };
      next.projectileVolley = { factor: SPLIT_SHOT.factor, reach: "fan", note: "Split Shot: Volley: the projectiles fly as a volley with Shotgun Effect", status: "Split Shot: Volley gives Shotgun Effect: the 1 + 2 projectiles and extra Projectile Quantity fly as a fan, all reach the dummy standing close, each after the first keeping 23%" };
      note(clause, `Shotgun Effect: the 1 + 2 projectiles fly as one fan (with "fired as a volley"), all reach the dummy standing close, each after the first keeping ${SPLIT_SHOT.factor * 100}% (its hit rule's repeatDmgDecPercent 23)`);
    } else if (profile.name === "Electrifying Shot") {
      // Close-Range (chunk 8): recipe 322672192 swaps the skill for Split 410757, hit rule bHitBrother 1 and repeatDmgDecPercent 30.
      find("shot").perUse = { perTick: 1, falloff: { count: 1, factor: clause.coefficient, reach: "fan", projectile: true } };
      next.projectileVolley = { factor: clause.coefficient, reach: "fan", note: "Electrifying Shot: Close-Range: Shotgun Effect", status: "Electrifying Shot: Close-Range gives Shotgun Effect: extra Projectile Quantity flies as a fan, all reach the dummy standing close, each after the first keeping 30% (the text's 70% is lost)" };
      note(clause, `Shotgun Effect keeping ${round(clause.coefficient * 100)}% (hit rule table 30): extra projectiles from Projectile Quantity fly as a fan, all reach the dummy standing close (Split 410757)`);
    } else if (profile.name === "Sparkle") {
      // `groupNone`: the hit rule is in brother group −1 (no earlier hit counted), so field 2006262 never reaches it (coefficientAdd below).
      const spec = tickSpec(find("hit"), SPARKLE);
      spec.falloff = { count: 1, factor: SPARKLE.factor, reach: "fan", groupNone: true, projectile: true };
      next.projectileVolley = { factor: SPARKLE.factor, reach: "fan", groupNone: true, note: "Sparkle: Magnetic Field: Shotgun Effect", status: "Sparkle: Magnetic Field gives Shotgun Effect: extra Projectile Quantity flies as a fan, all reach the dummy standing close, each at 100% (the moving projectiles' hit rule, Split 564131, is in brother group −1: no earlier hit is counted)" };
      note(clause, "Shotgun Effect: extra projectiles from Projectile Quantity fly as a fan, all reach the dummy standing close, each at 100% (Split 564131: the moving projectiles' hit rule is in brother group −1 with bCalcPercentOnSameEntity 0, so its table 36 never applies; client 0x1423e3d40)");
    }
  }
  if (first("aimAll")) { const arrows = find("arrows"); if (arrows?.perUse?.falloff) { arrows.perUse.falloff.reach = "all"; note(first("aimAll"), `every arrow aims at the dummy: all ${arrows.perUse.falloff.count} reach it (was ceil(n / 2))`); } }
  if (first("coefficientSet")) {
    const clause = first("coefficientSet"), splash = first("splashProjectiles");
    next.projectileVolley = { factor: keptShareFromCoefficient(clause.value), reach: "all", perQuantity: splash ? splash.every / Math.max(1, splash.per) : 1, maxExtra: splash ? splash.cap : 0, note: `Corrosion Focus: Splash: ${splash ? `1 additional Orb projectile per +${splash.every} Projectile Quantity, up to ${splash.cap}` : "no additional projectile"}, all landing on the dummy, each after the first keeping ${100 - clause.value}% (the ${clause.value}% coefficient is the share lost)`, status: `Corrosion Focus: Splash: +1 Orb projectile per +${splash?.every ?? 2} Projectile Quantity (up to ${splash?.cap ?? 2}), all on the dummy, each after the first keeping ${100 - clause.value}%` };
    note(clause, `the Corrosion Orb's extra projectiles (1 per +${splash?.every ?? 2} Projectile Quantity, up to ${splash?.cap ?? 2}) all land on the dummy, each after the first keeping ${100 - clause.value}% (the ${clause.value}% coefficient is the share lost)`);
  }
  // Field 2006262 joins the table value only at or above the table's first key (client 0x1423e3d40), so a falloff whose rule sits in brother
  // group −1 (`groupNone`: no earlier hit counted, the multiplier stays 1.0) takes none of it.
  for (const clause of kinds.get("coefficientAdd") || []) {
    let reached = 0;
    for (const component of components) if (component.perUse?.falloff && !component.perUse.falloff.groupNone) { component.perUse.falloff.factor = Math.max(0, round(component.perUse.falloff.factor + clause.value / 100)); reached += 1; }
    if (next.projectileVolley && !next.projectileVolley.groupNone) { next.projectileVolley = { ...next.projectileVolley, factor: Math.max(0, round(next.projectileVolley.factor + clause.value / 100)) }; reached += 1; }
    note(clause, reached ? `${clause.value}% to the Shotgun coefficient of every effect after the first (game field 2006262)` : `${clause.value}% to the Shotgun coefficient (game field 2006262): no modeled hit takes it (the hit rule of the projectiles it would reach is in brother group −1, which counts no earlier hit)`);
  }
  if (first("chainMerge") && first("chainWeb")) {
    const clause = first("chainMerge");
    const kept = keptShareFromCoefficient(clause.value);
    find("hit").perUse = { perTick: 1, falloff: { count: 1 + CHAIN_LIGHTNING_JUMPS, factor: kept, reach: "all" } };
    note(clause, `with Web of Lightning's 1 extra chain per Jump (${CHAIN_LIGHTNING_JUMPS} base Jumps), ${1 + CHAIN_LIGHTNING_JUMPS} Chain Lightnings hit the dummy, each after the first keeping 100% − ${clause.value}%: 1 + ${kept} × ${CHAIN_LIGHTNING_JUMPS} = ×${round(shotgunTotal(1 + CHAIN_LIGHTNING_JUMPS, kept))}`);
  }
  if (first("glaciate")) {
    const clause = first("glaciate"), group = groupOf("Frost Spike", 402);
    if (group) {
      const blades = shotgunTotal(FROST_SPIKE_BLADES, clause.value / 100);
      components.push({ key: "icyBlades", label: "Icy Blades (Glaciate)", kind: "hit", groupId: 402, group, perUse: blades, basis: "provisional", note: `Frost Spike: Glaciate: the ${FROST_SPIKE_BLADES} Icy Blades (game row 402) also hit the Thrust's target, the first at 100% and each later one keeping ${clause.value}% (Split 173720: the blades' rule is brother group 2, table 30; the Thrust's group −1 rule is never counted)`, extraAdditional: [...(find("thrust")?.extraAdditional || [])] });
      note(clause, `the ${FROST_SPIKE_BLADES} Icy Blades (its Projectile Quantity is not affected by bonuses) hit the Thrust's target too, the first at 100% and each later one at ${clause.value}%: +${round(blades)} Icy Blade hits per use (client repeat multiplier; Split 173720)`);
    }
  }
  if (first("fangVolley")) {
    const clause = first("fangVolley"), massive = find("massive"), small = find("small");
    const every = typeof massive.perUse === "number" && massive.perUse > 0 ? Math.round(1 / massive.perUse) : 10;
    massive.perUse = 0;
    if (small?.group) components.push({ ...small, key: "volley", label: `Small Fangs (Volley, ${clause.value} per Bite Charge cycle)`, perUse: { perTick: 1, everyUses: every, falloff: { count: clause.value, factor: FANG_VOLLEY_KEPT, reach: "all", groupNone: true, projectile: true } }, basis: "provisional", note: `Hound's Fangs: Volley: ${clause.value} Small Fangs instead of the Massive Fang every ${every} casts, all on the dummy (they can hit the same enemy), each at 100% (Split 679413: their hit rule is brother group −1 with an empty table, no Shotgun falloff)` });
    note(clause, `no Massive Fang; ${clause.value} Small Fangs every ${every} casts on the dummy, each at 100%: ×${round(shotgunTotal(clause.value, FANG_VOLLEY_KEPT))} (Split 679413: brother group −1, empty table)`);
  }
  // ---- Projectile Quantity fixed, dispersed, pulses, convergence ----
  if (first("projectileFixed")) { next.projectileQuantityFixed = true; next.projectileVolley = null; note(first("projectileFixed"), "Projectile Quantity fixed at 1: no extra projectile reaches the dummy"); }
  if (first("dispersed") && next.projectileVolley) { next.projectileVolley = { ...next.projectileVolley, reach: "half", status: `${next.projectileVolley.status}; with Psionic Missile: Emission they land dispersed: ceil(n / 2) reach the dummy (provisional)` }; note(first("dispersed"), "the projectiles land dispersed: ceil(n / 2) of a volley reach the dummy (was all)"); }
  if (first("convergence") && next.projectileVolley) { const clause = first("convergence"); next.projectileVolley = { ...next.projectileVolley, subsequentAdditional: { value: clause.value, cap: clause.cap, source: clause.source } }; note(clause, `each explosion after the first takes +${clause.value}% × min(${clause.cap}, projectiles fired)`); }
  if (first("pulse")) {
    const clause = first("pulse"), hit = find("hit");
    next.projectileComponent = "hit";
    components.push({ ...hit, key: "pulse", label: `Pulse (${clause.value}% of the explosion)`, perUse: 1, basis: "provisional", note: "Psionic Missile: Emission: one pulse after the projectiles land, dealing this share of the Explosion's damage once", extraAdditional: [...hit.extraAdditional, { source: clause.source, text: `Pulse Damage is ${clause.value}% of Explosion Damage (game recipe 12079597)`, value: clause.value - 100 }] });
    note(clause, `one pulse per cast at ${clause.value}% of the explosion (its own hit; no Shotgun falloff applied to it)`);
  }
  if (first("secondaryExplosion")) {
    const clause = first("secondaryExplosion"), explosion = find("explosion");
    const p = Math.min(0.95, clause.chance / 100), secondaries = p / (1 - p), kept = keptShareFromCoefficient(clause.value), factor = 1 + kept * secondaries;
    if (typeof explosion.perUse === "number") explosion.perUse = explosion.perUse * factor;
    note(clause, `${clause.chance}% chance per explosion hit, each secondary an explosion that can generate another: ${round(secondaries)} secondaries per explosion, each keeping ${round(kept * 100)}% (the ${clause.value}% coefficient is the share lost): explosion hits ×${round(factor)}`);
  }
  if (first("ashCount")) { const clause = first("ashCount"); find("ash").quantityBonus = { per: clause.per, every: clause.every, cap: clause.cap, source: clause.source }; note(clause, `the Ash explodes 1 + min(${clause.cap}, ${clause.per} × ⌊Projectile Quantity ÷ ${clause.every}⌋) times per detonation`); }
  if (first("largeBlades")) {
    const clause = first("largeBlades"), blades = find("blades");
    // Split 127219 reaction_big_shot: the large blades' own hit rule (brother group 2, table [(1, 35)], bHitBrother 1) makes them siblings of
    // one another only; the regular blades' rule (group −1) is never counted (client 0x1423e3d40, 2026-11-08), so the first large blade
    // deals 100% and each later one keeps 35%: 1 + 0.35 × (count − 1) per volley (was count × 0.35, every large blade a repeat of the volley).
    const factor = LARGE_BLADE_KEPT, perVolley = shotgunTotal(clause.count, factor);
    components.push({ ...blades, key: "largeBlades", label: `Large Icy Blades (Chilling Spike)`, perUse: { perTick: perVolley, everyUses: blades.perUse?.everyUses || 5 }, basis: "provisional", note: `Icebound Beam: Chilling Spike: ${clause.count} large Icy Blades at ${clause.value}% of the base Icy Blade damage with every volley, the first at 100% and each later one keeping ${round(factor * 100)}% (their hit rule, brother group 2): ×${round(perVolley)}`, extraAdditional: [...blades.extraAdditional, { source: clause.source, text: `${clause.value}% of Base Icy Blade Projectile Damage`, value: clause.value - 100 }] });
    note(clause, `${clause.count} large Icy Blades (${clause.value}% damage) with each volley, the first at 100% and each later one keeping ${round(factor * 100)}% (brother group 2): ×${round(perVolley)}`);
  }
  if (first("critRetrigger")) {
    const clause = first("critRetrigger"), converge = first("converge"), hit = find("hit");
    if (clause.critShare != null && typeof hit.perUse === "number") {
      const explosions = 1 + (converge ? converge.value : 0), factor = 1 + clause.critShare * explosions;
      hit.perUse *= factor;
      note(clause, `${round(clause.critShare * 100)}% of casts crit (the hit pass) and trigger one more cast${converge ? ` that explodes ${explosions} times (Converge)` : ""}: hits ×${round(factor)}`);
    }
  }
  if (first("stationary")) {
    const clause = first("stationary"), spec = tickSpec(find("hit"), SPARKLE);
    spec.perTick *= 1 + clause.value / 100;
    note(clause, `${clause.value}% chance of a stationary projectile at the dummy after each projectile vanishes: hits ×${round(1 + clause.value / 100)}`);
  }
  // ---- Waves ----
  for (const clause of kinds.get("totalWaves") || []) { const waves = find("waves"); if (typeof waves.perUse === "number") { waves.perUse += clause.value; note(clause, `${waves.perUse} waves per cast (all on the dummy)`); } }
  if (first("allLastWave")) { find("waves").allLastWave = true; note(first("allLastWave"), "every wave takes the last wave's Barrage per-wave bonus"); }
  if (first("iceWaves") || first("noWaveBonus")) {
    // Split 428171: field 2600044 raises the repeat count of the charged branch, so these act on the Demolisher waves, not the attack's first wave.
    const spikes = find("waves");
    spikes.extraAdditional = spikes.extraAdditional.filter((line) => line.source !== "Frost Impact: wave bonus");
    spikes.noWaveBonus = true;
    for (const clause of kinds.get("iceWaves") || []) { if (typeof spikes.perUse === "number") spikes.perUse += clause.value; note(clause, `${spikes.perUse} Ice Spike waves after the first on an attack that consumes a Demolisher Charge, without the skill's per-wave bonus`); }
    if (first("noWaveBonus")) note(first("noWaveBonus"), "the skill's +30% per wave is gone");
  }
  if (first("waveBonus")) {
    // Waves 1 to N follow the charged attack's first wave (wave 0): their average k is (N + 1) ÷ 2.
    const clause = first("waveBonus"), spikes = find("waves"), waves = typeof spikes.perUse === "number" ? spikes.perUse : 3;
    const average = (waves + 1) / 2 * clause.value;
    spikes.extraAdditional.push({ source: clause.source, text: `${clause.text}: wave k (the attack's first 0) +${clause.value}% × k, averaged over the ${waves} waves after it = +${round(average)}% (game field 2600041; linear: provisional)`, value: average });
    note(clause, `wave k takes +${clause.value}% × k: +${round(average)}% over the ${waves} waves after the first`);
  }
  for (const clause of kinds.get("replenishWave") || []) {
    if (!weaponOk(clause)) continue;
    const waves = find("waves"), base = waves.perUse.countAtStacks, factor = 1 + clause.value / 100;
    if (typeof base === "function") { waves.perUse.countAtStacks = (stacks) => base(stacks) * factor; note(clause, `waves × ${factor} with a cannon (each wave ${clause.value}% to add one that cannot add another)`); }
  }
  for (const clause of kinds.get("waveProjectiles") || []) {
    if (!weaponOk(clause)) continue;
    const waves = find("waves");
    if (waves.perUse?.falloff) { waves.perUse.falloff.extraPerWave = (waves.perUse.falloff.extraPerWave || 0) + clause.value; note(clause, `with a gun, wave k fires ${clause.value} × k more projectiles (each wave's Projectile Quantity bonus for the next)`); }
  }
  for (const clause of kinds.get("waveInterval") || []) {
    const comets = find("comets");
    if (comets?.perUse?.intervalSeconds) { comets.perUse.intervalSeconds = round(comets.perUse.intervalSeconds * Math.max(0.01, 1 + clause.value / 100)); note(clause, `comet waves every ${comets.perUse.intervalSeconds} s before Cast Speed (${clause.value}% Wave Interval)`); }
  }
  if (first("starfall")) {
    const clause = first("starfall"), comets = find("comets");
    const reached = comets.perUse?.falloff?.count || 3;
    const share = reached / clause.every;
    components.push({ ...comets, key: "starfall", label: "Starfall waves", perUse: { ...comets.perUse, perTick: (comets.perUse?.perTick || 1) * share }, basis: "provisional", note: `Fallen Star: Starfall: one Starfall wave per ${clause.every} comet hits (${reached} per wave), at +${clause.value}% additional Hit Damage`, extraAdditional: [...comets.extraAdditional, { source: clause.source, text: `+${clause.value}% additional Hit Damage for this skill when casting Starfall (game field 2600681)`, value: clause.value }] });
    note(clause, `${reached} comet hits per wave ÷ ${clause.every} = ${round(share)} Starfall waves per comet wave, each at +${clause.value}% (Starfall's own comets add no Charge, game tag 6300043; its 1 s gate binds only above ${clause.every} hits/s)`);
  }
  // ---- Combo Finishers ----
  for (const clause of kinds.get("finisherRepeat") || []) { const finisher = find("finisher"); if (typeof finisher.perUse === "number") { finisher.perUse += clause.value * (finisher.perUse); note(clause, "the Combo Finisher deals its hit(s) once more per cycle"); } }
  if (first("noAttackSpeedDamage")) { next.additionalPerAttackSpeedPercent = 0; note(first("noAttackSpeedDamage"), "no additional damage from the Attack Speed bonus"); }
  // Legion (record 506057920): node 700 on the Clone count (26005922) with calcCountByRarity, within p0 m, up to p1: the Enemy Count rule
  // ("each Boss counts as 5") counts the training dummy, a Boss within 10 m (user-confirmed), as 5 enemies, so min(p1, 5) Clones
  // (2026-11-08, research/build-7t-claim-audit-2026-11-08.md gap 2; before: 1, the dummy as one enemy).
  if (first("extraClone")) { const clause = first("extraClone"), finisher = find("finisher"); const clones = Math.min(clause.cap ?? LEGION_BOSS_ENEMY_COUNT, LEGION_BOSS_ENEMY_COUNT); finisher.extraClones = clones; if (finisher.perUse?.falloff) finisher.perUse.falloff.count += clones; note(clause, `+${clones} Clone(s): the dummy is a Boss within ${clause.meters} m and counts as ${LEGION_BOSS_ENEMY_COUNT} enemies (calcCountByRarity), up to ${clause.cap}`); }
  // ---- Cooldowns, intervals, durations, Focus Pts ----
  if (first("batterExplosion")) {
    const group = groupOf("Ice Shot", 22);
    if (group) components.push({ key: "explosion", label: "Explosion (Batter)", kind: "hit", groupId: 22, group, perUse: 1, basis: "provisional", note: "Ice Shot: Batter: the Explosion (row 22) reaches the projectile's target (recipe 389080480)" });
    note(first("batterExplosion"), group ? "one Explosion per shot on the dummy" : "row 22 not in the hit tables");
  }
  if (first("blastQuake")) {
    const clause = first("blastQuake"), component = find("explosion");
    if (component && typeof component.perUse === "number") component.perUse *= 1 + clause.value;
    note(clause, `${1 + clause.value} explosions per attack, each keeping 30% as a repeat hit (provisional)`);
  }
  if (first("eruptionBombs")) {
    const clause = first("eruptionBombs"), bombs = find("bombs");
    if (bombs?.perUse && typeof bombs.perUse === "object") bombs.perUse.perTick += clause.value;
    note(clause, `${bombs?.perUse?.perTick} Fire Bombs per eruption`);
  }
  for (const clause of kinds.get("eruptionInterval") || []) {
    const bombs = find("bombs");
    if (bombs?.perUse && typeof bombs.perUse === "object") bombs.perUse.intervalSeconds *= Math.max(0.01, 1 + clause.value / 100);
    note(clause, `eruption interval ${Math.round(bombs?.perUse?.intervalSeconds * 1000) / 1000} s`);
  }
  if (first("drasticShift")) {
    const clause = first("drasticShift"), pummel = find("pummel"), field = find("field");
    if (pummel) pummel.demolisher = null;
    if (field) field.demolisher = { perStackAdditionalPercent: clause.value, text: `+${clause.value}% additional damage for the Electric Field per channeled stack when consuming Demolisher Charge` };
    note(clause, "the Demolisher per-stack bonus moves to the Electric Field");
  }
  if (first("guidedShell")) {
    const clause = first("guidedShell");
    const component = find("explosions");
    if (component && typeof component.perUse === "number") component.perUse += clause.value;
    note(clause, `${component?.perUse} explosions per use (Split 556715 repeats 5 shells)`);
  }
  if (first("attackOnce")) {
    const clause = first("attackOnce");
    const component = find("explosions");
    if (component && typeof component.perUse === "number") component.perUse = 1;
    note(clause, `one explosion per use (was 4); cooldown ${setCooldown(clause.value)} s`);
  }
  for (const clause of kinds.get("setCooldown") || []) note(clause, `cooldown ${setCooldown(clause.value)} s`);
  for (const clause of kinds.get("addCooldown") || []) note(clause, `cooldown ${setCooldown(clause.value, true)} s`);
  for (const clause of kinds.get("focusRequired") || []) {
    const focus = next.focus;
    if (!focus || !(focus.pointsPerSecond > 0) || focus.pointsPerUse !== 100) continue;
    const required = Math.max(1, focus.pointsPerUse + clause.value);
    next.focus = { ...focus, pointsPerUse: required };
    next.useModel = { ...next.useModel, usesPerSecond: focus.pointsPerSecond / required, firstUseSeconds: required / focus.pointsPerSecond, note: `${next.useModel?.note || ""}; ${clause.support}: ${required} Focus Pts per strike` };
    note(clause, `${required} Focus Pts per strike: ${round(focus.pointsPerSecond / required)} strikes/s at ${round(focus.pointsPerSecond)} Pts/s`);
  }
  if (first("smash")) { const clause = first("smash"), strike = find("strike"); strike.extraAdditional.push({ source: clause.source, text: `Acute Smash: +${clause.value}% additional Hit Damage dealt by Smash (read on the Acute Strike's row; provisional)`, value: clause.value }); note(clause, `one Acute Smash per trigger at +${clause.value}% (the Acute Strike's damage row)`); }
  for (const clause of kinds.get("damageInterval") || []) {
    const rule = profile.name === "Sparkle" ? SPARKLE : profile.name === "Whirlwind Blade" ? WHIRLWIND_BLADE : null;
    if (!rule) continue;
    const spec = tickSpec(find("hit"), rule);
    spec.intervalSeconds = Math.max(0.01, round(spec.intervalSeconds + clause.value));
    note(clause, `the projectile hits every ${spec.intervalSeconds} s${first("intervalCastSpeed") ? " ÷ the Cast Speed factor" : ""} for ${spec.durationSeconds} s`);
  }
  if (first("intervalCastSpeed")) { const spec = tickSpec(find("hit"), WHIRLWIND_BLADE); spec.castSpeedScaled = true; if (!first("damageInterval")) note(first("intervalCastSpeed"), "the projectile's damage interval ÷ the Cast Speed factor"); }
  if (first("eruptionFixed")) { const bombs = find("bombs"); if (bombs?.perUse) bombs.perUse.castSpeedScaled = false; note(first("eruptionFixed"), "the Fire Bomb eruptions keep the base 0.7 s interval (Cast Speed no longer shortens it)"); }
  if ((durations.length || first("durationStacks")) && BATCH5_DURATION_SKILLS.has(profile.name) && find("hit")) {
    const increased = durations.filter((line) => !line.additional).reduce((total, line) => total + line.value, 0);
    const factor = Math.max(0, 1 + increased / 100) * durations.filter((line) => line.additional).reduce((product, line) => product * Math.max(0, 1 + line.value / 100), 1);
    const rule = BATCH5_DURATION_SKILLS.get(profile.name), hit = find("hit"), seconds = rule.duration * factor;
    if (durations.length && typeof hit.perUse === "number") { hit.perUse *= factor; notes.push(`${profile.name}: Duration ×${round(factor)} (${durations.map((line) => `${line.text} (${line.source})`).join(", ")}): the storm lasts ${round(seconds)} s, so ${round(hit.perUse)} strikes per cast (src/support-hit-count-batch5.js; provisional).`); }
    const clause = first("durationStacks");
    if (clause) {
      const stacks = Math.min(clause.cap, Math.floor(seconds / clause.every + 1e-9));
      hit.extraAdditional.push({ source: clause.source, text: `${clause.text}: ${round(seconds)} s duration ÷ ${clause.every} s = ${stacks} stacks (up to ${clause.cap}) × ${clause.value}% (static reading; provisional)`, value: clause.value * stacks });
      note(clause, `${stacks} stacks at ${round(seconds)} s duration: +${round(clause.value * stacks)}% on its strikes`);
    }
  }
  if (first("projectileDurationStacks")) {
    const clause = first("projectileDurationStacks"), hit = find("hit");
    const stacks = Math.min(clause.cap, Math.floor(WHIRLWIND_BLADE.duration / clause.every + 1e-9));
    hit.extraAdditional.push({ source: clause.source, text: `${clause.text}: ${WHIRLWIND_BLADE.duration} s ÷ ${clause.every} s = ${stacks} stacks (up to ${clause.cap}) × ${clause.value}% (static reading; provisional)`, value: clause.value * stacks });
    note(clause, `${stacks} stacks at the blade's ${WHIRLWIND_BLADE.duration} s duration: +${round(clause.value * stacks)}% on its hits`);
  }
  if (first("maxProjectiles")) { const clause = first("maxProjectiles"), blades = find("blades"); blades.perUse = { ...blades.perUse, maxCountBonus: { per: clause.per, every: clause.every, cap: clause.cap, source: clause.source } }; note(clause, `the blades are capped at ${RING_OF_BLADES_MAX_PROJECTILES} + min(${clause.cap}, ${clause.per} × ⌊Projectile Quantity ÷ ${clause.every}⌋)`); }
  // ---- Steep Strike ----
  if (first("steepForced") && next.steepStrike) {
    const clause = kinds.get("steepForced").find((item) => item.value === 0) || first("steepForced");
    next.steepStrike = { ...next.steepStrike, forcedShare: clause.value, forcedSource: clause.source };
    note(clause, clause.value ? "every attack is a Steep Strike" : "no attack is a Steep Strike");
  }
  next.notes.push(...notes);
  return { profile: Object.freeze(next), notes, edited: true };
}
