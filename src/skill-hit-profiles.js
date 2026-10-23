import { skillHitDamageSs13 } from "./data/skills/skill-hit-damage-ss13.generated.js";
import { skillHitDamageNewSkills } from "./data/skills/skill-hit-damage-new-skills.generated.js";
import { finisherAmplificationPercent, CONSUMED_COMBO_POINTS } from "./combo-points.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { tlidbSkillCatalogSs13 } from "./data/catalogs/tlidb-ss13.js";
import { skillProgressionSs13 } from "./data/skills/skill-progression-ss13.generated.js";
import { shotgunProfileNote } from "./shotgun-effect.js";

// Damage profiles for the generic spell-hit engine (src/skill-hit-model.js, engine "skill-hit").
// Batch 2a of research/skill-inventory-2026-10-11.md: the 24 flat-base spell hits whose TLIDB values match a
// config_skill_damage group row for row. Per skill:
//   - components: one per game damage group the skill deals on a single training dummy. Hit components
//     carry how many hits land per use ("perUse": a number, or a tick spec { perTick, intervalSeconds,
//     castSpeedScaled, falloff } for ground effects and barrages); DoT components (ground-effect
//     "Persistent damage every second") go through the skill-DoT engine (src/skill-dot-model.js) as a
//     status refreshed while the target stands in the area.
//   - base: src/data/skills/skill-hit-damage-ss13.generated.js (typed min/max per level 1–20 and the +0x08
//     "effectiveness of added damage" per group);
//   - timing: src/data/skills/skill-timing-ss13.generated.js (use time, speed type, cooldown, charges), a
//     TLIDB fallback where no Split file is linked (or `useTlidbTiming` when the linked file is another skill's),
//     and a use model: "cast" (one use per cast), "terra" (one ground effect or sentry at a time; recast when it
//     expires, so uses/s = 1 / duration), "channel" (one use per channel interval, stacks held at max; batch 1)
//     or "rate" (a trigger cadence the profile fixes, e.g. Focus points; batch 3);
//   - `basis` "text" = the count follows the skill text / game description for a single target; "provisional"
//     = the text allows more hits than one on one target but the landing share is not sourced, so the best
//     case is taken and flagged (planner warning) until an in-game count fixes it.
// Everything that needs more than one target (chains, jumps, splits, extra projectiles that cannot hit the same
// enemy, on-kill effects) is left out. Hit ailments (Ignite / Frostbite / Shock from these hits) are a follow-up.

const catalog = new Map(tlidbSkillCatalogSs13.map((entry) => [entry.name, entry]));

const text = (note) => ({ basis: "text", note });
const provisional = (note) => ({ basis: "provisional", note });
const TERRA_CHARGE = { value: 26, text: "+26% additional damage for the skill for every Terra Charge consumed (TLIDB; max 1 stack, 1 per 0.5 s, so every cast consumes one — assumption)" };
const SHOTGUN_NOTE = (count, factor, reach = "all") => shotgunProfileNote(count, factor, reach);
const terra = (durationSeconds = 6, note = "TLIDB: the ground effect lasts 6 s; one at a time (max base Terra quantity 1), recast when it expires (best case: continuous uptime)") => ({ kind: "terra", durationSeconds, note });

const DEFINITIONS = [
  // --- batch 2a, part 1 (2026-10-11) ---
  { name: "Chain Lightning", delivery: "spell-chain", components: [{ key: "hit", label: "Chain Lightning", groupId: 211, perUse: 1, ...text("+2 Jumps need other enemies: one hit per cast on a single dummy") }] },
  { name: "Fire Burst", delivery: "spell-area", components: [{ key: "hit", label: "Fire Burst", groupId: 521, perUse: 1, ...text("one area hit per cast") }], notes: ["Game description (group 521): extra damage to enemies at the centre of the area; the magnitude is not in the decoded row, so the plain hit is used."], timingFallback: { useTime: 0.8, speedType: "cast-speed", cooldown: 0, cdTimes: 0, source: "TLIDB cast speed 0.8 s (no Split skill file linked for Fire Burst)" } },
  { name: "Frigid Transmission", delivery: "spell-area", components: [{ key: "hit", label: "Frigid Transmission", groupId: 471, perUse: 1, ...text("one area hit per cast; 3 s cooldown (game)") }], notes: ["The Frostbite-on-Cold-hit buff it grants is not applied yet (hit ailments are a follow-up)."] },
  { name: "Ice Lances", delivery: "spell-projectile", components: [{ key: "hit", label: "Ice Lances", groupId: 291, perUse: 1, ...text("TLIDB: the projectiles cannot hit the same enemy, so one lance per cast reaches the dummy") }] },
  { name: "Lightning Beam", delivery: "spell-beam", components: [{ key: "hit", label: "Lightning Beam", groupId: 900, perUse: 1, ...text("one beam hit per cast") }], notes: ["Thunderbolts (one every 2 casts, up to 3, 6 s) are not modeled: their own hit rate is not published."] },
  { name: "Lightning Storm", delivery: "spell-area", components: [{ key: "hit", label: "Lightning Storm strikes", groupId: 571, perUse: 10, ...provisional("TLIDB: strikes once every 0.5 s for 5 s = 10 strikes per storm; best case assumes every strike lands on the dummy") }], notes: ["Lightning Storm: 2 s cooldown (game); storms overlap (up to 40), so each cast adds 10 strikes over 5 s."] },
  { name: "Ring of Ice", delivery: "spell-area", components: [{ key: "hit", label: "Icy Ring", groupId: 231, perUse: 1, ...text("one ring hit per cast") }], notes: ["Ring of Ice: game Split 345002 use time 0.65 s vs TLIDB 0.8 s; the game value is used (flagged)."] },
  { name: "Sparkle", delivery: "spell-projectile", components: [{ key: "hit", label: "Sparkle", groupId: 281, perUse: 6, ...provisional("TLIDB: projectiles hit once every 0.25 s for 1.5 s = 6 hits per projectile; best case assumes the projectile stays on the dummy") }] },
  { name: "Thunderbolt Overload", delivery: "spell-projectile", components: [{ key: "hit", label: "Thunderbolt Overload", groupId: 531, perUse: 1, ...text("splits beyond the first need other targets: one hit per cast") }], conversion: [{ from: "Physical", to: "Lightning", percent: 100, source: "TLIDB: Converts 100% of the skill's Physical Damage to Lightning Damage" }], notes: ["Thunderbolt Overload: the Physical base is dealt as Lightning; both Physical and Lightning modifiers are applied to the converted component (provisional rule, not yet checked in game)."] },
  { name: "Whirlwind Blade", delivery: "spell-projectile", components: [{ key: "hit", label: "Whirlwind Blade", groupId: 910, perUse: 20, ...provisional("TLIDB: one projectile dealing damage every 0.25 s, recovered after 5 s = 20 hits per blade; best case assumes the blade stays on the dummy (projectiles can hit the same enemy)") }], notes: ["Whirlwind Blade: the primary Split file (606567, recall) has a fixed 1 s use time and a 0.1 s cooldown; the linked throw file (537296) reads 0.65 s. TLIDB publishes 1 s. The 1 s fixed value is used (flagged)."] },
  // --- batch 2a, part 2 (2026-10-11): multi-component, Terra, Combo, built-in Reap ---
  { name: "Blizzard", delivery: "spell-area", components: [{ key: "waves", label: "Blizzard waves", groupId: 141, perUse: 3, ...text("TLIDB: 1 wave + 2 total waves; game description (group 141): the three waves can hit the same enemy") }],
    selfDebuffTaken: [{ types: ["Cold"], value: 10, text: "+10% additional Cold Damage taken (TLIDB: Blizzard's hit debuff; game description: Cold and Lightning Resistance reduced for 5 s)" }],
    notes: ["Blizzard: use time 1 s fixed with a 2 s cooldown (game); the drop-speed cast-speed scaling (up to +100%) changes when waves land, not how many, so it is not applied. Game description reads a 0.9 s base cast; the Split file's 1 s is used."] },
  { name: "Chromatic Shot", delivery: "spell-projectile", components: [{ key: "hit", label: "Chromatic Shot projectiles", groupId: 41, perUse: { perTick: 1, falloff: { count: 3, factor: 0.8, reach: "fan" } }, basis: "observed", note: `TLIDB: 1 + "Projectile Quantity of this skill +2" = 3 projectiles that "can hit the same enemy"; "This skill's Shotgun Effect falloff coefficient is 80%"; ${SHOTGUN_NOTE(3, 0.8, "fan")}. Dummy runs (no-gear Lv.94 Iris, Lv16, 2026-10-12, at the then 70% coefficient): 2 of 3 land within 6 m, 3 of 5 with Multiple Projectiles, one at about 10 m` }], notes: ["Chromatic Shot: the on-kill True Damage explosion (25% Max Life) does not apply to the dummy."] },
  { name: "Fallen Star", delivery: "spell-terra", useModel: terra(6, "No duration is published for the Comet Terra; 6 s is assumed from the other Terra skills (provisional)"), terraCharge: TERRA_CHARGE,
    components: [{ key: "comets", label: "Comets", groupId: 1221, perUse: { perTick: 1, intervalSeconds: 0.8, castSpeedScaled: true, falloff: { count: 3, factor: 0.7, reach: "all" } }, ...provisional(`TLIDB: a wave every 0.8 s (cast-speed scaled), 3 comets per wave; ${SHOTGUN_NOTE(3, 0.7, "all")} (game data: the comets are fallen projectiles that all aim at the enemy, aimEmemyPercent 100); best case: every wave lands on the dummy`) }],
    notes: ["Fallen Star: \"80% of the damage increase per Barrage Wave is also applied to Comet Damage\" has no published per-wave value and is not modeled."] },
  { name: "Flame Jet", delivery: "spell-terra", useModel: terra(), terraCharge: TERRA_CHARGE, parabolicSplit: { components: ["bombs"], additionalPercent: -50, text: "The skill's Projectiles' effect after splitting -50% additional damage (skill text)" },
    components: [
      { key: "bombs", label: "Fire Bombs", groupId: 265, perUse: { perTick: 2, intervalSeconds: 0.7, castSpeedScaled: true }, ...provisional("TLIDB: 2 Fire Bombs every 0.7 s (cast-speed scaled) while the Terra lasts; best case assumes both land on the dummy. The \"-50% additional damage after splitting\" line applies to the split bombs only (Parabolic Projectile Splits; user-supplied 2026-10-19, provisional).") },
      { key: "eruption", label: "Fire Terra Eruption", groupId: 264, perUse: 1, ...text("game description: the eruption is the explosion when the Flame Terra ends, once per Terra") },
      { key: "terra-dot", label: "Flame Terra", groupId: 263, kind: "dot", durationSeconds: 2, appliedPerUse: true, ...text("TLIDB: 373 Persistent Fire Damage every second for 2 s; applied once per Terra cast, so 2 s of each 6 s Terra (Flame Jet Lv16 dummy run 2026-10-11: 21 s average 121 = hits + DoT × 2/6; a continuously refreshed status would read ~192)") }
    ],
    notes: ["Flame Jet: group 266 (Fire 5, chain-linked only) is not modeled; its role is not described."] },
  { name: "Frost Shield", delivery: "spell-other", components: [{ key: "shield", label: "Frost Shield orbits", groupId: 191, perUse: 20, ...provisional("game description: 3 orbiting shields that damage enemies they touch at most every 0.25 s for the buff duration (TLIDB 5 s, game description 4 s); best case taken as one shield in contact for 5 s = 20 hits per cast (3 shields would be 60)") }],
    notes: ["Frost Shield: 6 s cooldown (game; the description says 10 s). Its -29% Physical / Fire damage taken is defensive (no DPS effect)."] },
  { name: "Haunting Abomination", delivery: "spell-terra", useModel: terra(), terraCharge: TERRA_CHARGE,
    components: [{ key: "ticks", label: "Haunting Terra hits", groupId: 830, perUse: { perTick: 1, intervalSeconds: 0.65, castSpeedScaled: true }, ...text("TLIDB: hits enemies within the Terra every 0.65 s (cast-speed scaled) for 6 s") }],
    notes: ["Haunting Abomination: group 831 (Erosion 202, chain-linked only, described as another skill's slash) is not modeled. The Terra's growing area has no DPS effect on one dummy."] },
  { name: "Nether Grasp", delivery: "spell-terra", useModel: terra(), terraCharge: TERRA_CHARGE,
    components: [
      { key: "grasp", label: "Nether Grasp hits", groupId: 1252, perUse: { perTick: 1, intervalSeconds: 0.5, castSpeedScaled: false }, ...text("TLIDB: a Nether Grasp hits every 0.5 s while the Terra lasts") },
      { key: "terra-dot", label: "Corrosion Terra", groupId: 1251, kind: "dot", durationSeconds: 2, appliedPerUse: true, ...text("TLIDB: 562 Persistent Erosion Damage every second for 2 s; applied once per Terra cast (2 s of each 6 s Terra), the reading the Flame Jet Lv16 run fixed for the same wording") }
    ],
    notes: ["Nether Grasp: its Reap only eliminates enemies under 10% Life (no settled duration is published), so no Reaping source is modeled for it."] },
  { name: "Scorching Pulse", delivery: "spell-area", components: [{ key: "hit", label: "Scorching Pulse", groupId: 541, perUse: 1, ...text("one area hit per cast; 5 s cooldown (game)") }],
    builtInReaping: { source: "Scorching Pulse: Reaping (built-in)", trigger: "skill use", baseDurationSeconds: 1.25, builtIn: true, note: "TLIDB: Reaps 1.25 s of Damage Over Time when the skill hits; one Reap per use (cooldown-bound), Reaping Duration and Affliction scale it (assumed like other Reaps)." },
    notes: ["Scorching Pulse: the Flame Core re-trigger (a second pulse 1 s later when a Flame Core is within 15 m) is not modeled."] },
  { name: "Serpent Beam", delivery: "spell-combo", cycle: { useTimeSeconds: 0.65 * 2 + 0.65 / (1 - 0.33), steps: [{ seconds: 0.65, keys: ["starters"], share: 0.5 }, { seconds: 0.65, keys: ["starters"], share: 0.5 }, { seconds: 0.65 / (1 - 0.33), keys: ["finisher"] }], note: "Combo cycle: Starter 1 (0.65 s) + Starter 2 (0.65 s) + Finisher at -33% additional Cast Speed (0.65 / 0.67 = 0.97 s) = 2.27 s base, scaled by cast speed" },
    components: [
      { key: "starters", label: "Combo Starters", groupId: 960, perUse: 2, ...text("two Combo Starter hits per cycle (groups 960 / 961 share the same values)") },
      { key: "finisher", label: "Combo Finisher", groupId: 962, perUse: 1, extraAdditional: [{ source: "Serpent Beam: Combo Finisher Amplification", text: `+30% Combo Finisher Amplification for this skill × ${CONSUMED_COMBO_POINTS} consumed Combo Points = +${finisherAmplificationPercent(30)}% additional Finisher Hit Damage (TLIDB value; game manual 1001013024; 1 Combo Point per Starter observed on Crescent Slash 2026-10-12, reused here, provisional)`, value: finisherAmplificationPercent(30), amplification: 30 }], ...text("one Combo Finisher hit per cycle") }
    ],
    conversion: [{ from: "Physical", to: "Fire", percent: 100, source: "TLIDB: Converts 100% of the skill's Physical Damage to Fire Damage" }],
    notes: ["Serpent Beam: the Physical base is dealt as Fire; both Physical and Fire modifiers apply (provisional rule). Refractions and Serpent Bind spreading need other enemies and are not modeled."] },
  { name: "Shadow Shot", delivery: "spell-projectile", components: [{ key: "hit", label: "Shadow Shot projectile", groupId: 91, perUse: 1, ...text("game description (group 91): the explosion does not hit the unit the projectile hit, so one hit per cast on a single dummy") }],
    notes: ["Shadow Shot: the Explosion (group 92) misses the projectile's own target; groups 93 / 94 (Erosion 56–85, chain-linked only) are not described and not modeled. Moving a Shadow Swamp on hit is not modeled."] },
  { name: "Shadow Swamp", delivery: "spell-terra", useModel: terra(),
    components: [
      { key: "explosion", label: "Explosion", groupId: 102, perUse: 1, ...text("one explosion per cast") },
      { key: "terra-dot", label: "Swamp Terra", groupId: 101, kind: "dot", durationSeconds: 2, appliedPerUse: true, ...text("TLIDB: 546 Persistent Erosion Damage every second for 2 s; applied once per Terra cast (2 s of each 6 s Terra), the reading the Flame Jet Lv16 run fixed for the same wording") }
    ],
    notes: ["Shadow Swamp: its Terra Charge bonus applies only when Shadow Shot moves the swamp, so it is not applied; Weakened has no DPS effect."] },
  { name: "Split Firebolt", delivery: "spell-projectile", components: [{ key: "hit", label: "Fireball", groupId: 131, perUse: 1, ...text("game description (group 131): the explosion and the small fireballs do not hit the unit the big fireball hit, so one hit per cast on a single dummy") }],
    notes: ["Split Firebolt: the Fireball Explosion (132) and Small Fireballs (133 / 134) miss the fireball's own target and are not modeled on the dummy."] },
  { name: "Storm Field", delivery: "spell-terra", useModel: terra(), terraCharge: TERRA_CHARGE,
    components: [
      { key: "currents", label: "Currents", groupId: 1231, perUse: { perTick: 1, intervalSeconds: 0.8, castSpeedScaled: true }, ...text("TLIDB: Currents generated every 0.8 s (cast-speed scaled)") },
      { key: "thunderstrike", label: "Thunderstrike", groupId: 1241, perUse: { perTick: 1, intervalSeconds: 0.8, castSpeedScaled: true }, ...provisional("one Thunderstrike per Currents generation assumed (the trigger is not described); the +3% per target hit by Currents is one target") }
    ] },
  { name: "Tidewell", delivery: "spell-terra", useModel: terra(), terraCharge: TERRA_CHARGE,
    components: [{ key: "torrents", label: "Torrents", groupId: 1211, perUse: { perTick: 1, intervalSeconds: 0.8, castSpeedScaled: true, falloff: { count: 2, factor: 0.7, reach: "all" } }, ...provisional(`TLIDB: an eruption every 0.8 s (cast-speed scaled) firing 2 Torrents; ${SHOTGUN_NOTE(2, 0.7, "all")}; best case: every eruption lands`) }],
    notes: ["Tidewell: +5% additional Hit Damage per Slow stack on the enemy is not applied (Slow stack count on the dummy unknown)."] },
  // --- batch 1 (2026-10-11): spell channels. One "use" is one channel interval (game doSpeed 0.333 s, cast-speed
  // scaled); the channel holds its max stacks (own buffs pre-built, user 2026-10-09), so per-stack effects are taken
  // at the full stack count. Channel stacks: base from the Split struct (skill-timing data) + "+N Max Channeled
  // Stacks" supports / lines; the skill's own "+21.5% additional damage for every +1 additional Max Channeled
  // Stack(s)" line is `channel.perAdditionalMaxStackAdditionalPercent`. The attack channels (Charged Pummel,
  // Inexhaustible Barrage, Savage Charge, Whirlwind) deal Weapon Attack Damage and wait for the weapon model.
  { name: "Icebound Beam", delivery: "channel-beam", useModel: channel(),
    components: [
      { key: "beam", label: "Cold Beam", groupId: 800, perUse: 1, ...text("one beam hit per channel use (TLIDB: not affected by beam quantity bonuses)") },
      { key: "blades", label: "Icy Blade projectiles", groupId: 801, perUse: { perTick: 1, everyUses: 5, falloff: { count: 2, factor: 0.65, reach: "all" } }, ...provisional(`game description (group 800): a projectile volley every 5 channel stacks; TLIDB: 1 base + 1 Projectile Quantity, ${SHOTGUN_NOTE(2, 0.65, "all")} per volley (game data: the Icy Blade shot has no spread angle, so the volley flies one line; its hit rule's repeat decrease 35 matches the 65% coefficient); every fifth use fires it (the stack counter is assumed to keep cycling at max stacks)`) }
    ],
    notes: ["Icebound Beam: beam reflections → projectile jumps need other enemies and are not modeled."] },
  { name: "Howling Gale", delivery: "channel-other", useModel: channel(), channel: { perAdditionalMaxStackAdditionalPercent: 21.5 },
    components: [{ key: "gale", label: "Gale", groupId: 780, perUse: { perTick: 1, intervalSeconds: 1 / 1.5, castSpeedScaled: true }, ...provisional("TLIDB: Gale Base Attack Frequency 1.5 (Cast Speed bonuses and additional bonuses also apply); one Gale assumed to stay on the dummy while channeling, so 1.5 × cast speed hits/s") }],
    notes: ["Howling Gale: the Gale's duration (+2.5 s per channeled stack) only matters after the channel ends; continuous channeling is assumed. The game description for group 780 reads as another skill's (fan-shaped attack, attack-speed stacks) and is not used."] },
  { name: "Ring of Blades", delivery: "channel-other", useModel: channel(), channel: { perAdditionalMaxStackAdditionalPercent: 21.5 }, useTlidbTiming: true,
    timingFallback: { useTime: 0.333, speedType: "cast-speed", cooldown: 0, cdTimes: 0, source: "TLIDB cast speed 0.333 s (the inventory's Split link 795922 is Bombard's attack file, 1 s attack-speed, and is not used)" },
    // In-game runs 2026-10-11 (research/ring-of-blades-test-2026-10-11.md, Lv16 alone, standing still): the dummy took
    // about 5 hits/s (recount 433 / 472 / 451 at 89.4 per hit) and only +3–8% more with Quick Decision's +24.5% cast
    // speed, so each of the 5 blades of a full channel hits the single target about once per second, independent of
    // cast speed. TLIDB's "once every 0.25 s at the fastest" is a cap the orbit does not reach on one target. No orbit
    // period field is decoded from the game data (no Split file is linked for this skill), so the 1 s is observed.
    components: [{ key: "blades", label: "Blades", groupId: 790, perUse: { perSecondPerStack: 1, castSpeedScaled: false }, basis: "observed", note: "one hit per blade per second on a single target (in-game runs 2026-10-11: ≈5 hits/s at 5 stacks, unchanged by +24.5% cast speed); blades = channeled stacks (TLIDB: one Projectile per channel stack, up to the max); TLIDB's 0.25 s per-target cap is not reached" }],
    notes: ["Ring of Blades: the blades' orbit is not Cast Speed scaled (observed 2026-10-11); the 5 s persistence after channeling is not needed under continuous channeling."] },
  { name: "Thundercloud", delivery: "channel-other", useModel: channel(),
    components: [{ key: "strikes", label: "Thundercloud strikes", groupId: 71, perUse: { perTick: 1, castSpeedScaled: false, intervalAtStacks: (stacks) => 1 - 0.75 * Math.min(1, Math.max(0, stacks - 1) / 8) }, ...provisional("game description (group 71): strike interval from 1 s down to 0.25 s as channeled stacks rise (TLIDB: frequency reaches max at 9 stacks); read as linear in the interval from 1 stack (1 s) to 9 stacks (0.25 s), so 0.625 s at the 5-stack full channel; the strike is assumed not Cast Speed scaled, and one strike reaches the single dummy (3 targets / +1 Jump need other enemies)") }],
    notes: ["Thundercloud: TLIDB publishes only the Lv.20 text; levels 1–19 come from game group 71. The game description reads a 0.25 s base channel time; the Split file's 0.333 s is used."] },
  // --- batch 3 (2026-10-11): secondary skills with flat-base hits of their own ---
  { name: "Ice Bond", delivery: "sentry-beam", useModel: { kind: "terra", label: "sentry", durationSeconds: 8, note: "TLIDB: the Ice Sentry lasts 8 s and the skill's max base Sentry quantity is 1; recast when it expires (best case: continuous uptime; the 1 s cooldown and 0.8 s cast fit inside)" },
    components: [{ key: "sentry", label: "Ice Sentry beam", groupId: 750, perUse: { perTick: 1, intervalSeconds: 0.25, castSpeedScaled: false }, ...text("TLIDB: deals damage once every 0.25 s for the 8 s the Sentry lasts (not affected by beam quantity bonuses)") }],
    notes: ["Ice Bond: the Sentry's hits are taken as the character's own Spell Cold hits (no Sentry scaling rule is modeled). Its Euphoria (+28% additional Cold Damage for other skills against Frostbitten enemies) is not applied. The game description for group 750 says Fire; the typed rows say Cold and are used."] },
  { name: "Speed Phantom", delivery: "spell-area", components: [{ key: "remnant", label: "Remnant explosion", groupId: 890, perUse: 1, ...provisional("one Remnant explosion hit per use assumed (TLIDB: Remnants last 0.65 s, up to 2; the game description says the charge is only used when the target is far)") }],
    notes: ["Speed Phantom: 1 s fixed use, 3 s cooldown (game). Its Euphoria (+2.5% additional Spell Damage per enemy hit, up to 8 stacks, 1.2 s) buffs other skills and is not applied."] },
  { name: "Corrosion Focus", delivery: "focus-orb", useModel: { kind: "rate", usesPerSecond: 6.5 / 0.1 / 50, firstUseSeconds: 100 / (6.5 / 0.1), readyWhenPrebuilt: true, note: "TLIDB: 6.5 Focus Pts every 0.1 s (65/s); each Corrosion Orb area hit consumes 50 Focus Pts when another skill is cast (0.15 s interval), so the Focus gain bounds it at 1.3 hits/s (best case: other skills are cast often enough; Focus Speed bonuses are not applied)" },
    components: [{ key: "orb", label: "Corrosion Orb", groupId: 631, perUse: 1, ...provisional("one Corrosion Orb area hit per 50 Focus Pts (TLIDB); the 100-point trigger that creates the Orb is counted as its first hit") }],
    notes: ["Corrosion Focus: the Focus buff itself (additional Erosion Damage, Wilt chance, Base Wilt) is the aura model's; only the Orb hits are modeled here."] },
  { name: "Precise: Corrosion Focus", delivery: "focus-orb", useModel: { kind: "rate", usesPerSecond: 6.5 / 0.1 / 50, firstUseSeconds: 100 / (6.5 / 0.1), readyWhenPrebuilt: true, note: "TLIDB: 6.5 Focus Pts every 0.1 s (65/s); each Corrosion Orb area hit consumes 50 Focus Pts when another skill is cast (0.15 s interval), so the Focus gain bounds it at 1.3 hits/s (best case: other skills are cast often enough; Focus Speed bonuses are not applied)" },
    components: [{ key: "orb", label: "Corrosion Orb", groupId: 632, perUse: 1, ...provisional("one Corrosion Orb area hit per 50 Focus Pts (TLIDB); the 100-point trigger that creates the Orb is counted as its first hit") }],
    notes: ["Precise: Corrosion Focus: the Focus buff itself is the aura model's; only the Orb hits are modeled here."] },
  // --- Sentry batch (2026-10-12): the three spell Cores ---
  // Manual rule 1001011723: "Sentries' stats are inherited from the player, so their damage stat calculation should be the
  // same as the player's" (no Spell Burst / Multistrike); rule 1001011721: a Sentry's hits count as the player's; rule
  // 1001011724: the Sentry's cadence is Cast Frequency, not Cast Speed. TLIDB: one Sentry at a time (max base Sentry
  // quantity 1) lasting 8 s, dealing its hit once every 1 s; recast on expiry (best case: continuous uptime). "+X% Sentry
  // Damage" lines reach these skills through the Sentry tag (src/damage-line-classifier.js).
  { name: "Flame Core", delivery: "spell-sentry", useModel: sentry(), sentry: { castFrequency: [{ text: "+20% additional Cast Frequency while the player is within 10 m of the Sentry (TLIDB; the user stands within 10 m of the dummy)", value: 20, additional: true }] },
    components: [{ key: "sentry", label: "Flame Core", groupId: 451, perUse: { perTick: 1, intervalSeconds: 1, castSpeedScaled: false, castFrequencyScaled: true }, ...text("TLIDB: deals damage 1 time every 1 s for the 8 s the Sentry lasts (interval scaled by Cast Frequency)") }],
    notes: ["Flame Core: game group 840 (a Cold 50–75 row reached only through the stone's skill graph) is not the Core's hit and is left out. The game description for group 451 reads an older design (every 0.5 s for 4 s, 4 s cooldown); TLIDB's 1 s / 8 s text is used."] },
  { name: "Frost Core", delivery: "spell-sentry", useModel: sentry(), sentry: {},
    components: [{ key: "sentry", label: "Frost Core", groupId: 331, perUse: { perTick: 1, intervalSeconds: 1, castSpeedScaled: false, castFrequencyScaled: true }, ...text("TLIDB: deals damage once every 1 s for the 8 s the Sentry lasts (one projectile; not affected by Projectile Quantity bonuses)") }],
    notes: ["Frost Core: \"+32% additional damage to Frozen enemies\" within 10 m needs Freeze (100 or more Frostbite Rating), which the planner does not give the dummy; not applied. Its +2 Penetration changes nothing on one target."] },
  { name: "Thunder Core", delivery: "spell-sentry", useModel: sentry(), sentry: {},
    components: [{ key: "sentry", label: "Thunder Core", groupId: 850, perUse: { perTick: 1, intervalSeconds: 1, castSpeedScaled: false, castFrequencyScaled: true }, ...provisional("TLIDB: deals damage once every 1 s for the 8 s the Sentry lasts; within 10 m its casts can Jump at the same enemy repeatedly with a 70% Shotgun falloff, but the Jump count is unpublished, so one hit per cast is counted") }] },

  // --- Last unmodeled skills (2026-10-12) ---
  // Shackles of Malice: no Split file is linked (stone 2450 references none), so TLIDB's 1 s cast is used. Game rows 920 (Malice
  // Chain) / 921 (Explosion): Erosion-typed, effectiveness 124 (= TLIDB's 124%), 9–9 at Lv.1 → 667–667 at Lv.20, an adjacent
  // pair matching the two components (their descriptions are stale dev notes of other skills; tools/build-skill-hit-damage.mjs).
  // TLIDB: the chain Jumps 2 times (other enemies); on hitting a Cursed enemy it explodes, removes all Curse Effects from it and
  // the explosion gets +25% additional Hit Damage per Curse Effect (multiplies).
  { name: "Shackles of Malice", delivery: "spell-chain", timingFallback: { useTime: 1, speedType: "cast-speed", cooldown: 0, cdTimes: 0, source: "TLIDB cast speed 1 s (no Split skill file is linked for Shackles of Malice)" },
    components: [
      { key: "chain", label: "Malice Chain", groupId: 920, perUse: 1, ...text("one chain hit per cast on a single dummy (the 2 Jumps need other enemies)") },
      { key: "explosion", label: "Explosion", groupId: 921, perUse: 1, requiresCursed: true, additionalPerCursePercent: 25, ...provisional("TLIDB: the chain explodes on hitting a Cursed enemy and removes its Curse Effects; one explosion per cast on a Cursed dummy, assuming the build's curses are back on the dummy before the next chain (skill curses recast every 0.5 s; gear-triggered curses on hit)") }
    ],
    notes: ["Shackles of Malice: the Explosion needs the dummy to be Cursed (the planner's curse models decide) and its +25% per Curse Effect uses the planner's curse count on the dummy; with no curse in the build only the Malice Chain lands."] },
  // Ice Focus: Split 376726 "寒冰贯注" (Focus, fixed 1 s, no cooldown; Glacial Spike damage row 641 "reaction_hanbingjianci_damage",
  // repeat-attack / probability reactions whose values are not decoded) and Split 448084 "寒冰贯注-持续" (the Ice Storm follower,
  // BuffAreaFollower, DoT row 643: Cold 6 → 312 per second at Lv.20, unpublished on TLIDB; not modeled until observed).
  // TLIDB: 30 Focus Pts per hit on Frostbitten enemies (0.4 s interval) → 75 Pts/s at best; the Ice Storm appears at 100 Pts and
  // consumes 45 Pts every 0.5 s (90 Pts/s) to generate Glacial Spikes, so the Focus gain bounds the Spikes at 75 / 45 = 1.667
  // consumptions per second (the Corrosion / Acuteness Focus rate shape). The Spike count per consumption is unpublished: one
  // Spike per consumption on the single dummy (provisional). Focus Speed lines are not applied. Frostbite is required.
  ...["Ice Focus", "Precise: Ice Focus"].map((name, index) => ({ name, delivery: "focus-storm",
    useModel: { kind: "rate", usesPerSecond: 30 / 0.4 / 45, firstUseSeconds: 100 / (30 / 0.4), readyWhenPrebuilt: true, note: "TLIDB: 30 Focus Pts per hit on Frostbitten enemies, interval 0.4 s (75 Pts/s at best, assuming the build hits at least every 0.4 s); the Ice Storm needs 100 Pts and consumes 45 Pts every 0.5 s per Glacial Spike generation, so the gain bounds it at 1.667 generations/s (Focus Speed bonuses are not applied)" },
    requiresEnemyAilment: "Frostbite", requiresEnemyAilmentNote: "TLIDB: Focus Pts are only gained from damage to Frostbitten enemies",
    components: [{ key: "spike", label: "Glacial Spike", groupId: 641 + index, perUse: 1, ...provisional("one Glacial Spike on the dummy per 45-Pt consumption (the Spike count per generation is unpublished; the game file's repeat-attack probability reactions are not decoded); the 100-Pt trigger that creates the storm is counted as its first generation") }],
    notes: [`${name}: the Focus buff itself (additional Cold Damage) is the aura model's; only the Glacial Spikes are modeled here. Game DoT row 643 (Ice Storm follower, Split 448084: 312 Cold per second at Lv.20) is unpublished on TLIDB and is not modeled until an in-game run shows the storm ticking.`] })),

  // --- New damaging skills (2026-10-15) ---
  // Rows: src/data/skills/skill-hit-damage-new-skills.generated.js (tools/build-new-skill-hit-damage.mjs): the current
  // client's config_skill_damage groups, whose Lv.20 values and effectiveness equal the TLIDB cards and whose Lv.1–19 rows
  // equal every published TLIDB level row. No Split file is decoded for these skills, so the use time is TLIDB's cast speed
  // (the skill-progression stat; the card header shows its inverse, e.g. "1.54" for 0.649 s). Typed ranges average to their
  // midpoint in the hit engine. Voltaic Ripple deals only damage over time and is a skill-DoT profile
  // (src/skill-damage-profiles.js).
  { name: "Psionic Missile", delivery: "spell-projectile", timingFallback: newSkillTiming("Psionic Missile", 0.649),
    projectileVolley: { factor: 0.8, reach: "all", note: "the first projectile explodes at the targeted location and the rest land around it, and they can hit the same enemy (TLIDB card), so every one lands, each after the first at 80%",
      status: "TLIDB: \"Multiple projectiles can hit the same enemy. This skill's Shotgun Effect falloff coefficient is 80%\"; the extra projectiles land around the targeted location, so all are read as reaching the dummy, each after the first at ×0.8 (linear Shotgun falloff)" },
    components: [{ key: "hit", label: "Psionic Missile", groupId: 1271, perUse: 1, ...text("TLIDB: fires 1 projectile that explodes on landing, so one hit per cast; extra projectiles from Projectile Quantity land around the target and can hit the same enemy at the 80% Shotgun Effect coefficient") }],
    notes: ["Psionic Missile: game row 1272 (Physical 943–1571 at Lv.20, effectiveness 233%: 1.5 × the missile's row) has no line on the TLIDB card and is not modeled."] },
  { name: "Homing Frost Bolt", delivery: "spell-projectile", timingFallback: newSkillTiming("Homing Frost Bolt", 0.649),
    projectileVolley: { factor: 0.6, reach: "all", perQuantity: 2, maxExtra: 2, note: "1 additional Frost Bolt for every +2 Projectile Quantity, up to +2; the bolts launch at an enemy and can hit the same enemy, so every bolt lands on the single dummy, each after the first at 60%",
      status: "TLIDB: 1 additional Frost Bolt for every +2 Projectile Quantity (up to +2); the bolts launch at an enemy and can hit the same enemy, so all reach the dummy, each after the first at ×0.6 (linear Shotgun falloff)" },
    components: [{ key: "hit", label: "Frost Bolt", groupId: 1281, perUse: 1,
      extraAdditional: [{ source: "Homing Frost Bolt: unfired Frost Bolts", text: "+4% additional damage for this skill for every 1 unfired Frost Bolt, up to +24% (TLIDB); best case: held at the +24% cap", value: 24 }],
      ...text("TLIDB: each cast generates 1 Frost Bolt that condenses (1 s, Cast Speed at 55% efficiency) and then launches at an enemy, so one hit per cast on the dummy; the condensation delays the hit, not the rate") }],
    notes: ["Homing Frost Bolt: the unfired-bolt bonus is taken at its +24% cap (best case). Game row 1282 (Cold 317–475 at Lv.20, effectiveness 73%: 0.4 × the bolt's row) has no line on the TLIDB card and is not modeled."] },
  { name: "Splitting Lightning Bolt", delivery: "spell-projectile", timingFallback: newSkillTiming("Splitting Lightning Bolt", 0.8),
    components: [{ key: "hit", label: "Electric spear", groupId: 1291, perUse: 1, ...text("TLIDB (Forking Thunder): the spear forks into 2 Secondary Projectiles on hitting an enemy, up to 2 times; the card does not say forked projectiles can hit the same enemy, so one spear hit per cast on the single dummy") }],
    notes: ["Splitting Lightning Bolt: game row 1292 (the spear's values) is read as the forked Secondary Projectiles, which need other enemies. Projectile Quantity raises only the fork count. \"+4 Penetration for this skill\" changes nothing on one target."] },
  { name: "Moon's Dawn", delivery: "spell-projectile", timingFallback: newSkillTiming("Moon's Dawn", 0.8),
    components: [{ key: "moonblade", label: "Moonblade", groupId: 1301, perUse: 1, ...text("TLIDB: one Moonblade slash per cast that always Penetrates, so one hit per cast on the dummy") }],
    notes: ["Moon's Dawn: the Moonblade forks into 1–7 Secondary Moonblades (game row 1302: 146–244 Physical at Lv.20) on hit; the card does not say forked Moonblades can hit the same enemy, so they need other enemies and are not counted on the single dummy (the 1–7 count would average to 4 if it is a random roll). The Projectile Size and Skill Area lines change nothing on one target."] },
  { name: "Blazing Meteor", delivery: "spell-projectile", timingFallback: newSkillTiming("Blazing Meteor", 0.649),
    components: [
      { key: "meteor", label: "Blazing Meteor", groupId: 1311, perUse: 1, ...text("TLIDB: fires 1 projectile, one hit per cast") },
      { key: "ash", label: "Ash explosion", groupId: 1312, perUse: 1, ...text("TLIDB: each hit generates 1 Ash, and a projectile of this skill detonates it (1 explosion, then the Ash disappears); read as each cast's projectile detonating the Ash the previous hit left on the dummy, so one explosion per cast in the steady state (the first cast has none)") }
    ] },
  { name: "Hound's Fangs", delivery: "spell-projectile", timingFallback: newSkillTiming("Hound's Fangs", 0.649), additionalPerProjectileQuantityPercent: 8,
    components: [
      { key: "small", label: "Small Fang", groupId: 1321, perUse: 1, ...text("TLIDB: Small Fangs fly toward up to 3 enemies, so one Small Fang per cast reaches the single dummy") },
      { key: "massive", label: "Massive Fang", groupId: 1322, perUse: 0.1, ...text("TLIDB: each cast gains 1 Bite Charge; a cast at 10 or more stacks consumes 10 to fire a Massive Fang (area, within 8 m) as well, so the sustained rate is 1 Massive Fang per 10 casts (read as fired beside that cast's Small Fangs; if it replaces them, 10 Small + 1 Massive per 11 casts)") }
    ],
    notes: ["Hound's Fangs: the sustained Bite Charge rate is used for every window (Max Bite Charge 15 pre-built would front-load one extra Massive Fang early in a window; not modeled). \"+8% additional Damage for every +1 Projectile Quantity of this skill\" reads the Projectile Quantity from supports and build-wide lines."] }
];

/** TLIDB cast-speed timing for a skill with no decoded Split file. */
function newSkillTiming(name, useTime) { return { useTime, speedType: "cast-speed", cooldown: 0, cdTimes: 0, source: `TLIDB cast speed ${useTime} s (no Split skill file is decoded for ${name})` }; }

/** Sentry use model: one Sentry at a time (max base Sentry quantity 1), lasting `durationSeconds`; recast when it expires. */
function sentry(durationSeconds = 8, note = `TLIDB: the Sentry lasts ${durationSeconds} s and the skill's max base Sentry quantity is 1; recast when it expires (best case: continuous uptime)`) { return { kind: "terra", label: "sentry", durationSeconds, note }; }

function channel(note = "channel: one use per channel interval (game doSpeed, Cast Speed scaled); the channel is held at its max stacks (own buffs pre-built)") { return { kind: "channel", note }; }

const mainStats = (tags = []) => tags.filter((tag) => ["Strength", "Dexterity", "Intelligence"].includes(tag));

function buildProfile(definition) {
  const entry = catalog.get(definition.name) || {};
  const table = skillHitDamageSs13[definition.name] || skillHitDamageNewSkills[definition.name];
  const groupById = new Map((table?.groups || []).map((group) => [group.id, group]));
  const timing = definition.useTlidbTiming ? null : skillTimingSs13[definition.name] || null;
  const gameTiming = skillTimingSs13[definition.name] || null;
  const tags = entry.tags || [];
  // A component may carry its own synthetic group (TLIDB per-level percents where the game row is not linked: Ghost Blade's blade).
  const components = definition.components.map((component) => ({ ...component, kind: component.kind || "hit", group: component.group || groupById.get(component.groupId) || null }));
  const hitComponents = components.filter((component) => component.kind === "hit" && component.group);
  // Weapon Attack Damage skills (src/attack-hit-profiles.js): their rows carry no typed entries; the base is the weapon's
  // damage × the row's +0x08 percentage, so the dealt types are the weapon's (Physical for every published base).
  const weaponScaling = definition.weaponScaling || null;
  const dealt = [...new Set(hitComponents.flatMap((component) => component.group.levels?.["20"]?.entries?.map((item) => item.type) || []))];
  if (weaponScaling && !dealt.length) dealt.push(...(weaponScaling.baseTypes || ["Physical"]));
  const conversion = definition.conversion || [];
  const converted = [...new Set(dealt.map((type) => conversion.find((rule) => rule.from === type && rule.percent >= 100)?.to || type))];
  return Object.freeze({
    name: definition.name,
    kind: "hit", engine: hitComponents.length ? "skill-hit" : null,
    damageType: converted[0] || dealt[0] || null, dealtTypes: converted, baseTypes: dealt,
    spell: tags.includes("Spell"), tags, mainStats: mainStats(tags),
    delivery: definition.delivery, channeled: definition.useModel?.kind === "channel", beam: tags.includes("Beam"),
    // Channel stacks: the Split struct's base max (skill-timing data; 5 when the struct is missing) and the skill's
    // own per-additional-max-stack line; the engine adds the setup's supports and the build's lines.
    channel: ["channel", "channel-release"].includes(definition.useModel?.kind) ? { baseMaxStacks: gameTiming?.channel?.maxStacks ?? 5, baseMaxSource: gameTiming?.channel ? `SkillEditor Split ${gameTiming.splitId} channel struct (maxStacks ${gameTiming.channel.maxStacks})` : "base 5 assumed (no channel struct decoded)", castIntervalSeconds: definition.timingFallback?.useTime ?? gameTiming?.useTime ?? 0.333, ...(definition.channel || {}) } : null,
    components,
    // Attack skills: weapon scaling (restriction, base types), the skill's own attack-speed line and Demolisher Charge cadence.
    weaponScaling, attack: Boolean(weaponScaling), attackSpeed: definition.attackSpeed || null, demolisher: definition.demolisher || null,
    // Tags whose scoped lines the skill text borrows (Moon Strike: Spell Damage lines also apply to its Attack Damage).
    lineScopeTags: definition.lineScopeTags || [],
    // "X% additional damage for this skill for every +1% Attack Speed" (Gale Slash); profile-level warnings the planner shows.
    additionalPerAttackSpeedPercent: definition.additionalPerAttackSpeedPercent || 0, warnings: definition.warnings || [],
    useModel: definition.useModel || { kind: "cast" },
    cycle: definition.cycle || null,
    // Slash-Strike skills (src/attack-hit-profiles.js; 2026-10-14): own Steep Strike chance and how the chance acts
    // (src/skill-hit-model.js steepStrikeState).
    steepStrike: definition.steepStrike || null,
    terraCharge: definition.terraCharge || null,
    // Sentry skills (manual rules 1001011720–24): the player's layers apply; `sentry` carries the Cast Frequency inputs.
    sentry: definition.sentry || null,
    // A trigger that needs an ailment on the target (Ice Focus: Frostbite); the engine marks the skill inactive without it.
    requiresEnemyAilment: definition.requiresEnemyAilment || null, requiresEnemyAilmentNote: definition.requiresEnemyAilmentNote || null,
    selfDebuffTaken: definition.selfDebuffTaken || [],
    // The skill's own projectile rule from its card (coefficient, reach, Projectile Quantity per extra projectile; read by
    // src/skill-hit-model.js instead of the shared text rule) and "+X% additional Damage per +1 Projectile Quantity".
    projectileVolley: definition.projectileVolley || null,
    additionalPerProjectileQuantityPercent: definition.additionalPerProjectileQuantityPercent || 0,
    // Parabolic Projectile Splits (Three Birds with One Stone; user-supplied 2026-10-19): the components a split lands as again and
    // the skill's after-split damage (src/skill-hit-model.js).
    parabolicSplit: definition.parabolicSplit || null,
    // A Shadow Strike skill's own Shadow Quantity (Wilt Spike: +1 at max buff stacks; src/skill-hit-model.js shadowState).
    ownShadowQuantity: definition.ownShadowQuantity || null,
    // Parts of the skill that would change dummy damage and are not modeled (src/skill-coverage.js: Partly modeled).
    unmodeled: definition.unmodeled || [],
    conversion,
    timing, timingFallback: definition.timingFallback || null,
    canInflictHitAilments: true, hitAilmentsModeled: false,
    builtInReaping: definition.builtInReaping || null,
    notes: definition.notes || [],
    reason: hitComponents.length ? null : "no game damage group linked for this skill",
    sources: { tlidb: entry.source || table?.tlidb || null, gameData: hitComponents.length ? `config_skill_damage group${hitComponents.length > 1 ? "s" : ""} ${hitComponents.map((component) => component.group?.synthetic ? `${component.group.synthetic} (${component.label})` : component.groupId).join(" / ")} (levels 1–20)` : null, timing: timing ? `SkillEditor Split ${timing.splitId}` : definition.timingFallback?.source || null }
  });
}

export const SKILL_HIT_PROFILES = Object.freeze(Object.fromEntries(DEFINITIONS.map((definition) => [definition.name, buildProfile(definition)])));

/** Build a profile from a definition outside this file (src/attack-hit-profiles.js shares the builder). */
export function buildSkillHitProfile(definition) { return buildProfile(definition); }

const rowAt = (group, level) => group?.levels?.[String(Math.max(1, Math.min(20, Math.floor(level || 20))))] || null;

/**
 * Base hit components at a level: one per hit group (levels 1–20; frozen past 20) with conversion applied.
 * A group yields one typed part per damage type (row entries, or the weapon's damage types); the parts of one group are ONE
 * strike, so each carries the group's `strikeKey` and hit-event counting (src/skill-hit-model.js strikeHitsPerUse) counts the
 * group once (2026-10-15: Thunder Slash's Physical→Lightning and Lightning weapon parts had doubled its hits per second).
 * Weapon Attack Damage rows (no typed entries) take `weapon.damageByType` × the row's percentage (src/weapon-damage-model.js);
 * without a weapon they yield no components.
 */
export function skillHitBaseAtLevel(profile, level, weapon = null) {
  const capped = Math.max(1, Math.min(20, Math.floor(level || 20)));
  const components = [];
  for (const component of profile.components.filter((item) => item.kind === "hit" && item.group)) {
    const row = rowAt(component.group, capped);
    if (!row) continue;
    if (profile.weaponScaling && !row.entries.length) {
      const percent = row.effectiveness;
      for (const [type, range] of Object.entries(weapon?.damageByType || {})) {
        const rule = profile.conversion.find((item) => item.from === type && item.percent >= 100);
        // Alternate dual wielding (weapon.hands; user-confirmed 2026-10-14): each hand's own range at the same %, so the hit
        // model can apply each hand's crit to its own swings; min/max stay the two hands' average.
        const hands = weapon?.hands ? weapon.hands.map((hand) => ({ hand: hand.hand, share: hand.share, min: (hand.damageByType[type]?.min || 0) * percent / 100, max: (hand.damageByType[type]?.max || 0) * percent / 100 })) : null;
        components.push({ componentKey: component.key, strikeKey: component.key, label: component.label, type: rule ? rule.to : type, originalType: type, min: range.min * percent / 100, max: range.max * percent / 100, hands, converted: Boolean(rule), effectiveness: percent, weaponPercent: percent, weaponDamage: { min: range.min, max: range.max }, perUse: component.perUse, basis: component.basis, note: component.note, extraAdditional: component.extraAdditional || [], extraIncreased: component.extraIncreased || [], demolisher: component.demolisher || null, steep: component.steep || null, comboPerPoint: component.comboPerPoint || null, source: `${profile.name} · ${component.label} Lv.${capped}: ${percent}% Weapon Attack Damage (config_skill_damage group ${component.groupId} +0x08)` });
      }
      continue;
    }
    for (const entry of row.entries) {
      const rule = profile.conversion.find((item) => item.from === entry.type && item.percent >= 100);
      components.push({ componentKey: component.key, strikeKey: component.key, label: component.label, type: rule ? rule.to : entry.type, originalType: entry.type, min: entry.min, max: entry.max, converted: Boolean(rule), effectiveness: row.effectiveness, perUse: component.perUse, basis: component.basis, note: component.note, extraAdditional: component.extraAdditional || [], requiresCursed: Boolean(component.requiresCursed), additionalPerCursePercent: component.additionalPerCursePercent || 0, steep: component.steep || null, comboPerPoint: component.comboPerPoint || null, source: `${profile.name} · ${component.label} Lv.${capped} (config_skill_damage group ${component.groupId})` });
    }
  }
  return { level: capped, effectiveness: components[0]?.effectiveness ?? null, components, weaponPercents: profile.weaponScaling ? Object.fromEntries(profile.components.filter((item) => item.kind === "hit" && item.group).map((item) => [item.key, rowAt(item.group, capped)?.effectiveness ?? null])) : null };
}

/** The skill's own damage-over-time components as skill-DoT profiles (src/skill-dot-model.js). */
export function skillHitDotComponents(profile) {
  return (profile?.components || []).filter((component) => component.kind === "dot" && component.group).map((component) => {
    const perSecondAtLevel = (level) => rowAt(component.group, level)?.entries?.[0]?.min ?? 0;
    const type = component.group.levels?.["20"]?.entries?.[0]?.type || profile.damageType;
    return Object.freeze({
      name: `${profile.name}: ${component.label}`, parentName: profile.name, componentKey: component.key,
      kind: "dot", engine: "skill-dot", damageType: type, spell: profile.spell, tags: profile.tags,
      delivery: profile.delivery, channeled: false, beam: false,
      dot: { durationSeconds: component.durationSeconds, perSecondAtLevel, stacking: "strongest", referenceLevel: 20, referencePerSecond: perSecondAtLevel(20) },
      // Applications per second: once per Terra cast (1 / Terra duration) when appliedPerUse on a Terra skill; null for a
      // cast skill whose every use lays one (Corrosive Shot: the planner uses the hit's own use rate); a refresh rate otherwise.
      refreshPerSecond: component.appliedPerUse ? (profile.useModel?.kind === "terra" ? 1 / (profile.useModel?.durationSeconds || 6) : null) : (component.refreshPerSecond || 2),
      extraAdditional: profile.terraCharge ? [{ source: `${profile.name}: Terra Charge`, text: profile.terraCharge.text, value: profile.terraCharge.value, category: "Additional damage" }] : [],
      basis: component.basis, note: component.note,
      builtInReaping: null, canInflictHitAilments: false,
      sources: { tlidb: profile.sources.tlidb, gameData: `config_skill_damage group ${component.groupId} (levels 1–20, DoT row)` }
    });
  });
}

/** Use timing for the profile: game Split data first, the TLIDB fallback otherwise. */
export function skillHitTiming(profile) {
  const timing = profile.timing;
  if (timing && Number.isFinite(timing.useTime)) return { useTimeSeconds: timing.useTime, speedType: timing.speedType, cooldownSeconds: timing.cooldown || 0, charges: timing.cdTimes || 0, source: profile.sources.timing, tlidbCastSeconds: Number(String(skillProgressionSs13[profile.name]?.stats?.["cast speed"] || "").replace(/[^\d.]/g, "")) || null, agreesWithTlidb: timing.checks?.cast === "agree" };
  const fallback = profile.timingFallback;
  if (fallback) return { useTimeSeconds: fallback.useTime, speedType: fallback.speedType, cooldownSeconds: fallback.cooldown || 0, charges: fallback.cdTimes || 0, source: fallback.source, tlidbCastSeconds: fallback.useTime, agreesWithTlidb: true };
  return null;
}
