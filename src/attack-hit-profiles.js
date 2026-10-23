import { buildSkillHitProfile } from "./skill-hit-profiles.js";
import { finisherAmplificationPercent, CONSUMED_COMBO_POINTS, COMBO_POINTS_PER_STARTER } from "./combo-points.js";
import { weaponRestriction } from "./weapon-damage-model.js";
import { skillProgressionSs13 } from "./data/skills/skill-progression-ss13.generated.js";
import { shotgunProfileNote } from "./shotgun-effect.js";

// Attack batch, first slice (2026-10-11): the six "Weapon Attack Damage" skills deferred from batches 1 and 3 of
// research/skill-inventory-2026-10-11.md (plus the two Precise Focus variants), modeled through the skill-hit engine
// (src/skill-hit-model.js) with the weapon model (src/weapon-damage-model.js):
//   hit = weapon damage × (row % Weapon Attack Damage) + added flat to Attacks × the same %, then the shared layers.
// Per level the % is the +0x08 double of the skill's config_skill_damage rows (src/data/skills/skill-hit-damage-ss13.generated.js;
// equal to TLIDB's "Deals X% Weapon Attack Damage" at every level for the four channels). Timing: the Split files
// (src/data/skills/skill-timing-ss13.generated.js; 1 s, speed type 1 = attack speed). Each skill's "+100% additional
// Attack Speed for this skill" is its own TLIDB line. Cadences the text leaves open are "provisional" (planner warning).

const text = (note) => ({ basis: "text", note });
const provisional = (note) => ({ basis: "provisional", note });
const restriction = (text) => weaponRestriction(text);
const ownSpeed = { additionalPercent: 100, source: "TLIDB skill text: +100% additional Attack Speed for this skill" };
const DEMOLISHER = { everySeconds: 3, source: "TLIDB: the skill gains Demolisher Charge once every 3 s" };
const SHOTGUN_NOTE = (count, factor, reach = "all") => shotgunProfileNote(count, factor, reach);
// Thunder Focus charges 5 Focus Pts per 2 m moved; standing still on the dummy it never triggers. The user's best-case
// policy (meters moved recently) needs a movement rate, which no game figure fixes here: 6 m/s is an unsourced placeholder
// (flagged in the profile note and as a planner warning).
export const THUNDER_FOCUS_ASSUMED_METERS_PER_SECOND = 6;

const ASH_DEMOLISHER = { additionalPercent: 215, text: "+215% additional Hit Damage when the skill consumes Demolisher Charge (TLIDB; Hammer of Ash Lv16 run 2026-10-12: floating hit ~610 = 193.6 × 3.15)" };
// Steep Strike (Slash-Strike skills) and the Whirlwind Lv16 reference run (research/attack-weapon-tests-2026-10-12.md).
const STEEP_NOTE = "TLIDB: \"This skill +20% Steep Strike chance\"; a Steep Strike replaces the Sweep Slash on 20% of attacks (observed: the Whirlwind Lv16 run 2026-10-12 sits between the no-Steep and replacing readings; the extra-hit reading overshoots by 22%). Since 2026-10-14 the share follows the summed chance: own + supports + build-wide lines (src/skill-hit-model.js steepStrikeState).";
const WHIRLWIND_RUN_NOTE = "Whirlwind Lv16 dummy run 2026-10-12 (Nameless Sword 130 Physical, 1.5 Attack Speed, +100% own: 3 attacks/s): recount 409 flat over 20 s, floating hit 116 = 130 × 179% × 0.5 Physical armour; the panel's Attack DPS 358 = 116.35 × 3 × 1.025 (no Steep Strikes, with crit). The model gives 428 (Steep Strike replacing 20% of sweeps).";
const BLAZING_PENETRATION = { source: "Blazing Bullet: Projectile Penetration", text: "+7% additional damage for every 1 Projectile Penetration this skill has × the skill's own +2 Penetration = +14% (TLIDB; build-wide Penetration lines are not read)", value: 14 };
const channelRelease = (note) => ({ kind: "channel-release", note });
const channel = (note = "channel: one use per attack interval (weapon attack speed scaled); the channel is held at its max stacks (own buffs pre-built)") => ({ kind: "channel", note });

// Ghost Blade cycle (provisional reading of the TLIDB text): each attack (blade + explosion) is followed by its guaranteed
// Multistrike repeat ("+100% Multistrike chance"; "Multistrikes deal 15% increasing damage for every 1 Sentry deployed" →
// the repeat at ×1.15 with one Sentry), after which the Sentry "can only attack again 1 s after launching a Multistrike"
// (the interval is Cast Frequency scaled). So per cycle: 1 + 1.15 = 2.15 hits of each component over 1 ÷ attacks per second + 1 s.
const GHOST_BLADE_HITS_PER_CYCLE = 1 + 1.15;
const GHOST_BLADE_CYCLE = ({ weaponAttacksPerSecond }) => weaponAttacksPerSecond > 0 ? 1 / weaponAttacksPerSecond + 1 : Infinity;
const GHOST_BLADE_NOTE = (part) => `TLIDB: one ${part} hit per attack plus its guaranteed Multistrike repeat at +15% (one Sentry) = 2.15 hits per cycle; the cycle is one attack interval (1 ÷ weapon attacks per second) plus the 1 s Multistrike lock, both Cast Frequency scaled (provisional reading of the Multistrike text)`;
// Arrow Einherjar stacks: +8% additional per stack (multiplies), one stack per second up to 5, over an 8 s Sentry.
const ARROW_STACK_AVERAGE_PERCENT = ((1 + 1.08 + 1.08 ** 2 + 1.08 ** 3 + 1.08 ** 4 + 3 * 1.08 ** 5) / 8 - 1) * 100;

const DEFINITIONS = [
  { name: "Whirlwind", delivery: "attack-melee", useModel: channel(), attackSpeed: ownSpeed,
    weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to swords, axes, hammers, cudgels, and tin staffs") },
    components: slashStrike(51, 52, { sweepNote: "TLIDB: continuously deals Weapon Attack Damage to enemies around the caster while channeling; one strike per attack interval, a Sweep Slash on the 80% that are not Steep Strikes" }),
    notes: ["Whirlwind: the game description (group 51) reads \"attack skill with extra attack speed, circular area radius 300\". TLIDB's text adds a chance, equal to the Steep Strike chance, to deal damage in a large area at max channeled stacks; that area hit is not modeled. The -30% Movement Speed has no DPS effect.", WHIRLWIND_RUN_NOTE] },
  { name: "Charged Pummel", delivery: "attack-melee", useModel: channelRelease("channel to max stacks, then release: the Pummel hits when channeling ends (TLIDB), so one cycle = max stacks × attack interval"), attackSpeed: ownSpeed, demolisher: DEMOLISHER,
    weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to two-handed axes, two-handed hammers, cudgels, and tin staffs") },
    conversion: [{ from: "Physical", to: "Lightning", percent: 100, source: "TLIDB: Converts 100% of the skill's Physical Damage to Lightning Damage" }],
    components: [
      { key: "pummel", label: "Pummel", groupId: 181, perUse: 1, demolisher: { perStackAdditionalPercent: 70, text: "+70% additional Hit Damage for the Pummel per channeled stack when consuming Demolisher Charge (TLIDB)" }, ...text("one Pummel per release (TLIDB: the Pummel hits when channeling ends); its Demolisher bonus is 70% × channeled stacks on the cycles that consume a charge") },
      { key: "field", label: "Electric Field", groupId: 182, perUse: { perTick: 1, intervalSeconds: 0.3, attackSpeedScaled: false, durationAtStacks: (stacks) => 2 + 0.2 * stacks }, demolisher: { gated: true }, ...provisional("TLIDB: the Electric Field appears when the Pummel consumes Demolisher Charge, lasts 2 s + 0.2 s per channeled stack and deals damage every 0.3 s (not read as attack-speed scaled); the dummy is assumed to stand in it for its whole duration") }
    ],
    notes: ["Charged Pummel: the Physical weapon damage is dealt as Lightning (both Physical and Lightning modifiers apply: provisional conversion rule). The game description (group 181) reads 50% Physical→Lightning and a 0.5 s field tick over 5 s; TLIDB's 100% / 0.3 s / 2 s text is used."] },
  { name: "Savage Charge", delivery: "attack-melee", useModel: channelRelease("channel to max stacks while charging forward, then release: the Savage Strike launches when channeling stops at max stacks (TLIDB), so one cycle = max stacks × attack interval"), attackSpeed: ownSpeed, demolisher: DEMOLISHER,
    weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to two-handed axes, two-handed hammers, cudgels, and tin staffs") },
    components: [
      { key: "charge", label: "Charge", groupId: 301, perUse: { perStack: 1 }, ...provisional("TLIDB: the Charge \"continuously\" damages enemies it passes through while channeling, with no published interval; read as one Charge hit per channel stack (attack interval) on the dummy") },
      { key: "strike", label: "Savage Strike", groupId: 302, perUse: 1, demolisher: { additionalPercent: 90, text: "+90% additional Hit Damage when consuming Demolisher Charge (TLIDB)" }, ...text("one Savage Strike per release at max stacks (TLIDB)") }
    ],
    notes: ["Savage Charge: the forced forward movement is assumed to keep the dummy in the Charge area (best case). The game description (group 301) reads Physical→Fire; TLIDB lists no conversion and the rows are Physical, so no conversion is applied. +12% Skill Area per stack has no DPS effect on one dummy."] },
  { name: "Inexhaustible Barrage", delivery: "attack-ranged", useModel: channelRelease("channel to max stacks, then release: the barrage waves drop when channeling ends (TLIDB), so one cycle = max stacks × attack interval"), attackSpeed: ownSpeed,
    weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to guns and cannons") },
    components: [
      { key: "waves", label: "Barrage waves", groupId: 441, perUse: { perTick: 1, countAtStacks: (stacks) => 1 + stacks, falloff: { count: 6, factor: 0.7, reach: "all" } }, ...provisional(`TLIDB: 1 base wave + 1 per channeled stack at the end of channeling (6 at 5 stacks), each wave 1 Projectile + \"Projectile Quantity of this skill +5\" read as 6 projectiles per wave on the single target; ${SHOTGUN_NOTE(6, 0.7, "all")} (game data: the barrage is fallen projectiles that all aim at the enemy, aimEmemyPercent 100)`) }
    ],
    notes: ["Inexhaustible Barrage: \"25% of the skill's additional Projectile Speed bonus also applies to the skill's additional damage\" (cap 200%) is not read (no Projectile Speed total). The game description (group 441) is a dev note (\"fixed 3 waves for now\"); TLIDB's 1 + stacks is used. Crossbows are neither guns nor cannons on TLIDB's wording and are left out of the restriction."] },
  // Focus skills (role aura): the Focus buff itself (additional Physical / Lightning Damage, Trauma chance, Base Trauma) is
  // the aura model's; only the triggered weapon hit is modeled here, as a trigger rate (the Corrosion Focus shape).
  ...["Acuteness Focus", "Precise: Acuteness Focus"].map((name, index) => ({ name, delivery: "focus-strike",
    useModel: { kind: "rate", usesPerSecond: 25 / 0.2 / 100, firstUseSeconds: 100 / (25 / 0.2), readyWhenPrebuilt: true, note: "TLIDB: 25 Focus Pts per Melee hit, interval 0.2 s (so at most 125 Pts/s), 100 Pts per Acute Strike: 1.25 Acute Strikes/s at best, assuming the build lands Melee hits at least every 0.2 s (best case; a slower Melee hit rate lowers it proportionally)" },
    weaponScaling: { baseTypes: ["Physical"], restriction: null },
    components: [{ key: "strike", label: "Acute Strike", groupId: 601 + index, perUse: 1, ...provisional("one Acute Strike on the dummy per trigger (TLIDB: on up to 4 enemies within 5 m of the target hit); the Spikes are read as this one hit") }],
    notes: [`${name}: the game row's +0x08 is 525% at Lv.20 (389% at Lv.1) and is used as the Weapon Attack Damage %; TLIDB's damage line reads 479% (355%) while its \"effectiveness of added damage\" reads 525% — the 0.912 ratio is unexplained (open). Triggers need the build's Melee hits; standing still with a non-Melee main skill they never fire.`] })),
  ...["Thunder Focus", "Precise: Thunder Focus"].map((name, index) => ({ name, delivery: "focus-strike",
    useModel: { kind: "rate", usesPerSecond: THUNDER_FOCUS_ASSUMED_METERS_PER_SECOND * 5 / 2 / 100, firstUseSeconds: 100 / (THUNDER_FOCUS_ASSUMED_METERS_PER_SECOND * 5 / 2), readyWhenPrebuilt: true, note: `TLIDB: 5 Focus Pts per 2 m moved, 100 Pts per Thunderstrike when a non-Mobility Attack Skill is used; movement at an assumed ${THUNDER_FOCUS_ASSUMED_METERS_PER_SECOND} m/s (unsourced placeholder) gives ${THUNDER_FOCUS_ASSUMED_METERS_PER_SECOND * 5 / 2 / 100} Thunderstrikes/s; standing still it never triggers` },
    weaponScaling: { baseTypes: ["Physical"], restriction: null },
    conversion: [{ from: "Physical", to: "Lightning", percent: 100, source: "TLIDB: Converts 100% of the skill's Physical Damage to Lightning Damage" }],
    components: [{ key: "thunderstrike", label: "Thunderstrike", groupId: 621 + index, perUse: 1, ...provisional("one Thunderstrike on the dummy per trigger (TLIDB: a fan-shaped area in front for Melee triggers, a square for Ranged)") }],
    notes: [`${name}: the trigger rate rests on an unsourced movement speed placeholder (${THUNDER_FOCUS_ASSUMED_METERS_PER_SECOND} m/s); the Physical weapon damage is dealt as Lightning (provisional conversion rule). The game description (group 621) is an older Shock-triggered design and is not used.`] })),

  // --- Attack batch, second slice (2026-10-12): the remaining Weapon Attack Damage skills (18 melee, 14 ranged) ---
  // Each is one use per attack interval (Split use time, attack-speed scaled; TLIDB's 1 s where no Split file is linked)
  // unless the text fixes a Combo cycle. Hits per use follow the skill text / game description on a single dummy; counts
  // the text leaves open (Steep Strike chance, Multistrike, Shotgun projectiles, Combo Points) are "provisional".
  // Melee
  { name: "Leap Attack", delivery: "attack-melee", timingFallback: ONE_SECOND("Leap Attack"), attackSpeed: { additionalPercent: -40, source: "TLIDB skill text: -40% additional Attack Speed for this skill" },
    weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to unarmed, swords, axes, hammers, cudgels, and tin staffs") },
    components: [{ key: "slam", label: "Leap Attack", groupId: 31, perUse: 1, extraIncreased: [{ source: "Leap Attack: Demolisher buff", text: "+20% damage to the skill per bonus gained (one enemy hit = 1 bonus), 2 s buff per 4 s Demolisher Charge: +20% × 0.5 uptime (expected-value reading, provisional)", value: 10 }], ...text("game description (group 31): a circular area hit on landing; one hit per leap") }],
    notes: ["Leap Attack: a Mobility attack with no cooldown decoded (no Split file; TLIDB 1 s cast), assumed usable back to back at its attack rate (best case). \"75% of Movement Speed bonuses also apply to the additional Attack Speed of the skill (up to +60%)\" is not read (no Movement Speed total). The buff's Skill Area has no DPS effect on one dummy."] },
  // Hammer of Ash Lv16 dummy run 2026-10-12 (research/attack-weapon-tests-2026-10-12.md; Nameless Sword 130 Physical, 1.5
  // Attack Speed): the panel's Main-Hand Attack Speed 1.50/s and Attack DPS 298 = 193.6 × 1.5 × 1.025 show one attack per
  // weapon interval, not the 0.2 s the Split file / TLIDB publish (which would be 7.5/s); the floating hit ~610 = 130 × 304% ×
  // 0.49 × 3.15 is the Demolisher Pummel; the 20 s recount 611 (run 2: 518 over 25 s with an idle last 5 s ≈ 647 over the 20 s
  // hit) needs about 1.7 Pummel-equivalents per attack: Pummel + one Explosion on the same enemy at the 70% Shotgun falloff
  // (TLIDB: "the pummel and explosion can hit the same enemy; Shotgun falloff 70%") gives 649; the 3 projectile explosions with
  // falloff would give 1,400 and the Pummel alone 447.
  { name: "Hammer of Ash", delivery: "attack-melee", demolisher: DEMOLISHER, useTlidbTiming: true,
    timingFallback: { useTime: 1, speedType: "attack-speed", cooldown: 0, cdTimes: 0, source: "observed: one attack per weapon interval (Hammer of Ash Lv16 run 2026-10-12: panel 1.50/s, 298 DPS = 193.6 × 1.5 × 1.025); the Split 758458 / TLIDB 0.2 s is not the attack interval" },
    weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to swords, axes, hammers, cudgels, tin staffs, and unarmed") },
    conversion: convert("Fire"),
    components: [
      { key: "pummel", label: "Pummel", groupId: 11, perUse: 1, demolisher: ASH_DEMOLISHER, ...text("one Pummel per attack (game description: a circular area slam, radius 200); the Lv16 run's floating ~610 hit is the Demolisher Pummel (193.6 × 3.15)") },
      { key: "explosion", label: "Explosion", groupId: 12, perUse: 0.7, basis: "observed", note: "TLIDB: the pummel and the explosion can hit the same enemy with a 70% Shotgun falloff: one Explosion per attack at ×0.7 as the second hit on the dummy (group 12 is the projectile-hit row; TLIDB's Explosion line has no further game group). The Lv16 run (611 / ≈647 over 20 s) fits Pummel + 0.7 Explosion (649) and rules out the 3 projectile explosions (1,400) and the Pummel alone (447); whether Demolisher also boosts the Explosion is open (it would give 759)." }
    ],
    notes: [CONVERSION_NOTE("Hammer of Ash", "Fire"), "Hammer of Ash: the game description (group 11) reads 50% Physical→Fire; TLIDB's 100% is used (the run's 194 per Pummel = 130 × 304% × 0.7 × 0.7 confirms Fire mitigation). The 3 Ember Projectiles fly outward from the slam and are not counted on a single dummy (observed)."] },
  { name: "Focused Slash", delivery: "attack-melee", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to swords, axes, and hammers") },
    components: slashStrike(61, 62),
    notes: ["Focused Slash: Fervor (\"0.4% additional damage for this skill for every 1 Fervor Rating\") is not applied — no Fervor Rating total is modeled. The game description's per-hit Attack Speed stacks (2–5% × 8 for 5 s) are not in TLIDB's text and are not applied."] },
  { name: "Frost Impact", delivery: "attack-melee", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to swords, axes, hammers, cudgels, tin staffs, and unarmed") },
    conversion: convert("Cold"),
    components: [{ key: "spikes", label: "Ice Spikes", groupId: 151, perUse: 3, extraAdditional: [{ source: "Frost Impact: wave bonus", text: "+30% additional Hit Damage (multiplies) for each wave of Ice Spikes: waves at ×1, ×1.3 and ×1.69 average ×1.33 over the 3 waves (provisional reading: the first wave carries no bonus)", value: (1 + 1.3 + 1.69) / 3 * 100 - 100 }], ...text("game description (group 151): three successive waves of Ice Spikes that can hit the same enemy") }],
    notes: [CONVERSION_NOTE("Frost Impact", "Cold"), "Frost Impact: its Demolisher Charge (every 3 s) only speeds the spike waves and carries no damage line; the Freeze interplay needs Frostbite the build may not have and is not modeled. The game description reads 50% Physical→Cold; TLIDB's 100% is used."] },
  { name: "Berserking Blade", delivery: "attack-melee", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to swords, axes, and cudgels") },
    components: slashStrike(171, 172),
    notes: ["Berserking Blade: its buff stacks (on defeating an enemy or hitting an Elite; the dummy counts as an Elite) only raise Skill Area, so they have no DPS effect on one dummy."] },
  { name: "Double Thrusts", delivery: "attack-melee", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to duel wielding One-Handed Swords, Claws, and Daggers.") },
    components: [{ key: "thrusts", label: "Thrusts", groupId: 241, perUse: 2, ...text("game description (group 241): two successive hits per use") }],
    notes: ["Double Thrusts: a Shadow Strike skill — Shadow Quantity is 0 by default (game manual 1001010820); gear / support Shadow Quantity repeats both thrusts per Shadow (src/skill-hit-model.js shadowState). \"+30% additional Trauma Damage on the second thrust if the first inflicts Trauma\" is not applied; its +20% Trauma chance reaches the ailment model through the skill text."] },
  { name: "Flame Slash", delivery: "attack-melee", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to swords, axes, and hammers") },
    conversion: convert("Fire"),
    components: slashStrike(421, 422, { steepNote: "TLIDB: \"This skill +20% Steep Strike chance\"; read as a 20% chance per Sweep Slash of a Steep Strike (one fire torrent at the base Skill Area: +2 torrents per 115% Area bonus, torrents stack with a 50% Shotgun falloff) on the dummy. Build-wide Area lines are not read yet; Steep Strike chance is summed since 2026-10-14 (src/skill-hit-model.js steepStrikeState)." }),
    notes: [CONVERSION_NOTE("Flame Slash", "Fire")] },
  { name: "Icy Blade", delivery: "attack-melee", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to swords, axes, and hammers") },
    conversion: convert("Cold"),
    components: [
      ...slashStrike(411, 412),
      { key: "explosion", label: "Explosion", groupId: 413, perUse: 0.2 * 0.7, steep: { role: "steep", perSteep: 0.7 }, ...provisional("TLIDB: the Explosion is part of the Steep Strike and can hit the same enemy as it with a 70% Shotgun falloff: one Explosion per Steep Strike (0.2 per use) at ×0.7 as the second hit of the pair") }
    ],
    notes: [CONVERSION_NOTE("Icy Blade", "Cold"), "Icy Blade: the extra Steep Strike attempts on Frozen enemies / on inflicting Freeze need Freeze (100 or more Frostbite Rating), which the dummy does not carry here, so they are not applied."] },
  { name: "Frost Spike", delivery: "attack-melee", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to One-Handed Swords, Claws and Daggers.") },
    conversion: convert("Cold"),
    components: [{ key: "thrust", label: "Thrust", groupId: 401, perUse: 1, ...text("one Thrust per use; the Icy Blade projectiles (group 402) launch backwards from the hit enemy's position and cannot hit the same unit (game description), so they miss a single dummy") }],
    notes: [CONVERSION_NOTE("Frost Spike", "Cold"), "Frost Spike: a Shadow Strike skill — Shadow Quantity is 0 by default (game manual 1001010820); gear / support Shadow Quantity repeats the Thrust per Shadow (src/skill-hit-model.js shadowState). The Frostbite Rating lines (+10% additional damage at 30, +1 Projectile at 60) are not applied (no Frostbite Rating on the dummy is modeled); \"+8% additional damage for every +1 Projectile Quantity\" is 0 at the base quantity (the skill's quantity ignores bonuses)."] },
  { name: "Wilt Spike", delivery: "attack-melee", ownShadowQuantity: { value: 1, text: "Shadow Quantity +1 when buff reaches max stacks (TLIDB); the 5 stacks are held (1 per hit, 4 s; own buffs pre-built)" }, weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to One-Handed Swords, Claws and Daggers.") },
    conversion: convert("Erosion"),
    components: [{ key: "thrust", label: "Thrust", groupId: 391, perUse: 1, extraAdditional: [{ source: "Wilt Spike: buff stacks", text: "+3% additional Erosion Damage (multiplies) per buff stack, 5 stacks held (1 per hit, 4 s; own buffs pre-built): 1.03^5 = +15.93%", value: (Math.pow(1.03, 5) - 1) * 100 }], ...text("one Thrust per use") }],
    notes: [CONVERSION_NOTE("Wilt Spike", "Erosion"), "Wilt Spike: a Shadow Strike skill — \"Shadow Quantity +1 when buff reaches max stacks\" is held with the 5 stacks (own buffs pre-built), plus gear / support Shadow Quantity (src/skill-hit-model.js shadowState; provisional). \"+20% chance to Wilt\" and \"Adds 5 - 5 Base Wilt Damage to this skill\" reach the ailment model through the skill text (src/ailment-applications.js)."] },
  { name: "Groundshaker", delivery: "attack-melee", demolisher: DEMOLISHER,
    weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to swords, axes, hammers, cudgels, tin staffs, and unarmed") },
    components: [
      { key: "fission", label: "Fission", groupId: 501, perUse: 1, ...text("one Fission area hit per use (game description: a circular area of radius 230 in front)") },
      { key: "fissure", label: "Fissure Secondary Damage", groupId: 502, perUse: 1, demolisher: { gated: true }, ...provisional("the Fissure (game description: \"Steep Strike area damage\") is read as the Demolisher Charge consumption effect — its spread follows Demolisher Charge Restoration Speed (TLIDB) — so it lands once per use that consumes a charge (one charge every 3 s at best)") }
    ],
    notes: ["Groundshaker: the +10% additional Skill Area on consuming Demolisher Charge has no DPS effect on one dummy."] },
  { name: "Moon Strike", delivery: "attack-melee", lineScopeTags: ["Spell"],
    weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to dual-wielding one-handed swords, one-handed axes, daggers, canes, wands, rods, and scepters") },
    components: slashStrike(760, 761),
    notes: ["Moon Strike: \"Spell Damage bonus and additional bonus also apply to the skill's Attack Damage\" (TLIDB) — Spell-scoped lines reach its hits. \"+1% additional damage for every 100 Max Mana, up to +70%\" is not applied (Max Mana is not read here)."] },
  // Steep Strike chance (2026-10-14; TLIDB skill text): "This skill cannot obtain Steep Strike attempts with Steep Strike Chance";
  // "The skill's Multistrikes gain 2% additional damage increment for every +1% Steep Strike chance". So the chance never adds
  // Steep Strikes here (its Steep Strikes come only from "a Steep Strike for every 2 Multistrikes during Sweep Slash", the
  // steep component below); it raises the Multistrike damage increment instead (src/skill-hit-model.js steepStrikeState).
  // Steep Strike attempts (2026-10-14; user-supplied mechanism, provisional): one stored attempt per 2 Multistrikes (repeat
  // attacks); a use with a stored attempt spends it and is a Steep Strike, replacing its Sweep Slash (TLIDB "When having Steep
  // Strike attempts, launches a Steep Strike"). Steep Strikes per use = min(1, repeat attacks per use ÷ 2) from the planner's
  // Multistrike sequence, or 1 inside Big Stride's window (src/skill-hit-model.js steepAttemptShare; per-attack check and the held
// window confirmed by a user-supplied answer 2026-10-15). Blade Cluster (2026-10-15): × (1 + 2) Steep Strike hits per launched
// Steep Strike (steepStrikeState clusterHits). The perUse values below
  // are the defaults the model replaces (the steep markers): before 2026-10-14 the Steep Strike was a flat 0.1 extra hit per use.
  { name: "Thunder Slash", delivery: "attack-melee", steepStrike: { ownChancePercent: 0, fromChance: false, multistrikeIncrementPerChancePercent: 2, multistrikeAttempts: { perRepeats: 2, ownRepeatsPerUse: 0.2, source: "user-supplied mechanism (2026-10-14): 1 Steep Strike attempt per 2 Multistrikes; TLIDB: \"gains one Steep Strike attempt for every two Sweep Slashes\" during Multistrike" }, source: "TLIDB Thunder Slash: \"This skill cannot obtain Steep Strike attempts with Steep Strike Chance\"; \"The skill's Multistrikes gain 2% additional damage increment for every +1% Steep Strike chance\"" }, weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to swords, axes, and hammers") },
    conversion: convert("Lightning"),
    components: [
      { key: "sweep", label: "Sweep Slash", groupId: 820, perUse: 1.2, steep: { role: "sweep" }, ...provisional("one Sweep Slash per use plus the skill's +20% Multistrike chance, read as a 20% chance of one repeated Sweep Slash (provisional reading of Multistrike; build-wide Multistrike lines are not read); a Steep Strike replaces a use's Sweep Slash, so the count is 1.2 − Steep Strikes per use") },
      { key: "steep", label: "Steep Strike", groupId: 821, perUse: 0.1, steep: { role: "steep", perSteep: 1 }, ...provisional("Steep Strikes per use = min(1, repeat attacks per use ÷ 2) from stored attempts (user-supplied mechanism 2026-10-14), 1 inside Big Stride's window while Moved recently holds; Steep Strike chance cannot grant it (TLIDB). Before 2026-10-14: a flat 0.1 per use") }
    ],
    notes: [CONVERSION_NOTE("Thunder Slash", "Lightning"), "Thunder Slash: \"+6% Attack Speed for this skill for every attack made during Multistrike\" is not applied. Steep Strike chance never grants it Steep Strikes (TLIDB); it raises the Multistrike damage increment instead (2% per +1%; src/skill-hit-model.js steepStrikeState)."] },
  { name: "Thunder Spike", delivery: "attack-melee", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to One-Handed Swords, Claws and Daggers.") },
    conversion: convert("Lightning"),
    components: [{ key: "spike", label: "Thunder Spike", groupId: 730, perUse: 1, ...text("one Thunder Spike per use") }],
    notes: [CONVERSION_NOTE("Thunder Spike", "Lightning"), "Thunder Spike: a Shadow Strike skill — Shadow Quantity is 0 by default (game manual 1001010820); gear / support Shadow Quantity repeats the spike per Shadow (src/skill-hit-model.js shadowState). The Numbed stack its True Body applies every 1 s is in the skill text, which the enemy-ailment model does not read (it reads supports), so Numbed is not counted from it."] },
  { name: "Crescent Slash", delivery: "attack-melee", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to swords, axes, and hammers") },
    cycle: { useTimeSeconds: 1 + 1 / 0.6 + 1 / 0.6, steps: [{ seconds: 1, keys: ["starter1"] }, { seconds: 1 / 0.6, keys: ["starter2"] }, { seconds: 1 / 0.6, keys: ["finisher"] }], note: "Combo cycle (observed 2026-10-12: 3 attacks, the 3rd is the Finisher): Starter 1 (1 s) + Starter 2 at -40% additional Attack Speed (1 / 0.6 = 1.667 s) + Finisher at -40% (1.667 s) = 4.333 s base, scaled by attack speed" },
    components: [
      { key: "starter1", label: "Combo Starter 1", groupId: 950, perUse: 1, ...text("one Starter 1 hit per cycle") },
      { key: "starter2", label: "Combo Starter 2", groupId: 951, perUse: 6, ...text("TLIDB: Starter 2 deals 6 hits of damage in total") },
      { key: "finisher", label: "Combo Finisher", groupId: 952, perUse: 1 + CONSUMED_COMBO_POINTS, comboPerPoint: "hits", extraAdditional: [FINISHER_AMPLIFICATION("Crescent Slash", { observed: true })], basis: "observed", note: `TLIDB: the Finisher deals 1 hit + 1 additional hit per Combo Point consumed (up to 4). Observed 2026-10-12 (user): 1 Combo Point per attack, a 3-attack cycle whose 3rd attack is the Finisher, so it consumes the ${CONSUMED_COMBO_POINTS} points of the two Starters: ${1 + CONSUMED_COMBO_POINTS} Finisher hits (20 s dummy run avg 316 vs 306 modeled; tests/crescent-slash-dummy-reference.test.js)` }
    ],
    notes: ["Crescent Slash: \"-25% additional damage when this skill is triggered\" does not apply to a self-cast skill; Moon Halo stacks and the Skill Area lines have no DPS effect on one dummy."] },
  { name: "Gale Slash", delivery: "attack-melee", additionalPerAttackSpeedPercent: 0.2,
    weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to One-Handed Swords, One-Handed Axes, and One-Handed Hammers") },
    cycle: { useTimeSeconds: 1 / 1.2 + 1 + 1 / 0.5, steps: [{ seconds: 1 / 1.2, keys: ["starter1"] }, { seconds: 1, keys: ["starter2"] }, { seconds: 1 / 0.5, keys: ["finisher"] }], note: "Combo cycle: Starter 1 at +20% additional Attack Speed (1 / 1.2 = 0.833 s) + Starter 2 (1 s) + Finisher at -50% (2 s) = 3.833 s base, scaled by attack speed" },
    components: [
      { key: "starter1", label: "Combo Starter 1", groupId: 970, perUse: 1, ...text("one Starter 1 hit per cycle (the charge forward is assumed to reach the dummy)") },
      { key: "starter2", label: "Combo Starter 2", groupId: 971, perUse: 1, ...text("one Starter 2 hit per cycle") },
      { key: "finisher", label: "Combo Finisher", groupId: 972, perUse: 1, extraAdditional: [FINISHER_AMPLIFICATION("Gale Slash")], ...text("one Finisher hit per cycle") }
    ],
    notes: ["Gale Slash: the three groups (970–972) carry the same values, so the Starter / Finisher mapping does not change the figure. \"1.5% additional Critical Strike Rating for this skill per buff stack\" (Wind Wake) is not applied; the skill cannot be triggered or supported by Activation Mediums."] },
  { name: "Spectral Slash", delivery: "attack-melee", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to swords, axes, and hammers") },
    cycle: { useTimeSeconds: 1 + 1 + 1 / 0.6, steps: [{ seconds: 1, keys: ["starter1"] }, { seconds: 1, keys: ["starter2"] }, { seconds: 1 / 0.6, keys: ["finisher"] }], note: "Combo cycle: Starter 1 (1 s) + Starter 2 (1 s) + Finisher at -40% additional Attack Speed (1 / 0.6 = 1.667 s) = 3.667 s base, scaled by attack speed" },
    components: [
      { key: "starter1", label: "Combo Starter 1", groupId: 980, perUse: 1, ...text("one Starter 1 hit per cycle (TLIDB: it can only hit 1 enemy)") },
      { key: "starter2", label: "Combo Starter 2", groupId: 981, perUse: 1, ...text("one Starter 2 hit per cycle") },
      { key: "finisher", label: "Combo Finisher (Clones)", groupId: 982, perUse: { perTick: 1, falloff: { count: 3, factor: 0.7, reach: "all" } }, comboPerPoint: "clones", extraAdditional: [FINISHER_AMPLIFICATION("Spectral Slash")], ...provisional(`TLIDB: the Finisher generates 1 additional Clone per Combo Point consumed (up to 4) with a 70% Shotgun falloff between Clones; 1 base Clone + 2 Combo Points from the two Starters = 3 Clones (the base Clone count is read, not published; 1 Combo Point per Starter is observed on Crescent Slash 2026-10-12 and reused here, provisional); ${SHOTGUN_NOTE(3, 0.7, "all")} (Clones, not a projectile fan)`) }
    ],
    notes: ["Spectral Slash: group 983 (101% at Lv.20, chain-linked only) is not described and not modeled; Mark spreading needs other enemies; \"-12% additional damage when this skill is triggered\" does not apply to a self-cast skill."] },
  // Ranged
  { name: "Ice Shot", delivery: "attack-ranged", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to Bows, Crossbows, Firearms and Cannons") },
    conversion: convert("Cold"),
    components: [{ key: "lance", label: "Icy Lances", groupId: 21, perUse: 1, ...text("one projectile per shot; the Explosion (group 22) does not hit the unit the projectile hit (game description), so it misses a single dummy") }],
    notes: [CONVERSION_NOTE("Ice Shot", "Cold"), "Ice Shot: \"Inflicts Frostbite when this skill deals Hit Cold Damage\" is skill text the enemy-ailment model does not read (it reads supports); Frostbite only slows. The game description reads 50% Physical→Cold; TLIDB's 100% is used."] },
  { name: "Bombard", delivery: "attack-ranged", parabolicSplit: { components: ["explosions"], additionalPercent: -50, text: "The skill's Projectiles' effect after splitting -50% additional damage (skill text)" }, weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to cannons") },
    conversion: convert("Fire"),
    components: [
      { key: "shells", label: "Cannon Shells", groupId: 81, perUse: 4, ...provisional("TLIDB: fires 4 projectiles in a row; game description: they pick different targets and repeat on the same target when there are not enough, so all 4 land on a single dummy; whether the shell's own hit (group 81) lands in addition to its explosion is not described — both are counted (best case)") },
      { key: "explosions", label: "Explosions", groupId: 82, perUse: 4, ...provisional("one explosion per shell (game description: each shell explodes on landing, radius 300); 4 per use on the dummy (best case)") }
    ],
    notes: [CONVERSION_NOTE("Bombard", "Fire"), "Bombard: \"the Projectiles' effect after splitting -50% additional damage\" applies to the split explosions (Parabolic Projectile Splits; user-supplied 2026-10-19, provisional)."] },
  { name: "Marked Rain of Arrows", delivery: "attack-ranged", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to Ranged weapons") },
    conversion: convert("Fire"),
    components: [
      { key: "marked", label: "Marked Arrow", groupId: 111, perUse: 1, ...text("TLIDB: 1 Marked Arrow (not affected by Projectile Quantity); game group 111 is flat 35% at every level (value link flagged low)") },
      { key: "explosive", label: "Explosive Arrows", groupId: 112, perUse: { perTick: 1, falloff: { count: 5, factor: 0.7, reach: "all" } }, ...provisional(`TLIDB: 1 + 4 Explosive Arrows that can hit the same enemy; ${SHOTGUN_NOTE(5, 0.7, "all")} (game data: the arrows fall on an area and all aim at the enemy, aimEmemyPercent 100)`) }
    ],
    notes: [CONVERSION_NOTE("Marked Rain of Arrows", "Fire"), "Marked Rain of Arrows: the Mark's bonus (game description: +60% damage against Marked enemies) is not in TLIDB's text and is not applied."] },
  { name: "Rocket Jump", delivery: "attack-ranged", timingFallback: ONE_SECOND("Rocket Jump"), weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to cannons") },
    conversion: convert("Fire"),
    components: [{ key: "blast", label: "Rocket Jump", groupId: 121, perUse: 1, ...text("game description (group 121): a circular area hit at the cannon's blast, radius 200; one per use") }],
    notes: [CONVERSION_NOTE("Rocket Jump", "Fire"), "Rocket Jump: a Mobility attack with no cooldown decoded (no Split file; TLIDB 1 s cast), assumed usable back to back at its attack rate (best case); the Movement Speed → Attack Speed line is not read. Its +20% Ignite chance reaches the ailment model through the skill text. The game description reads 50% Physical→Fire; TLIDB's 100% is used."] },
  { name: "Split Shot", delivery: "attack-ranged", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to Bows, Crossbows, Firearms and Cannons") },
    components: [{ key: "hit", label: "Split Shot", groupId: 221, perUse: 1, ...text("TLIDB: 1 + 2 projectiles that cannot hit the same enemy, so one hits the dummy (the 77% Shotgun falloff never applies to it)") }],
    notes: ["Split Shot: group 222 (the same values, undescribed) is read as the after-defeat projectiles and is not modeled on the dummy."] },
  { name: "Lightning Shot", delivery: "attack-ranged", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to Bows, Crossbows, Firearms and Cannons") },
    conversion: convert("Lightning"),
    components: [
      { key: "arrow", label: "Lightning Arrow", groupId: 381, perUse: 1, ...text("one projectile per shot") },
      { key: "lightning", label: "Lightning", groupId: 382, perUse: 3, ...provisional("game description (group 381): on hit, 3 lightning bolts strike enemies within 500 of the hit unit, and the developer note says the chain cannot exclude the hit unit — all 3 are taken to hit the dummy (best case)") }
    ],
    notes: [CONVERSION_NOTE("Lightning Shot", "Lightning")] },
  { name: "Corrosive Shot", delivery: "attack-ranged", parabolicSplit: { components: ["explosion"], additionalPercent: -50, text: "The skill's Projectiles' effect after splitting -50% additional damage (skill text)" }, weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to guns and cannons") },
    conversion: convert("Erosion"),
    terraCharge: { value: 26, dotOnly: true, text: "+26% additional damage dealt to enemies on the Terra for every Terra Charge consumed (TLIDB; max 1 stack, 1 per 0.5 s: observed on the in-game Frost Terra Lv16 tooltip 2026-10-12, so every shot at up to 2 shots/s consumes one); applied to the Corrosion Terra's DoT only" },
    components: [
      { key: "explosion", label: "Explosion", groupId: 371, perUse: 1, ...text("one explosion per shot (the parabolic projectile lands on the dummy)") },
      { key: "terra-dot", label: "Corrosion Terra", groupId: 372, kind: "dot", durationSeconds: 2, appliedPerUse: true, ...text("TLIDB: the Corrosion Terra lasts 3 s and deals 57 Persistent Erosion Damage every second for 2 s; applied once per shot (the Flame Jet reading of this wording), so the status is refreshed at the attack rate") }
    ],
    notes: [CONVERSION_NOTE("Corrosive Shot", "Erosion"), "Corrosive Shot: \"+30% chance to Wilt\" reaches the ailment model through the skill text; \"+30% additional Wilt Damage for this skill\" is not applied to a non-main skill's Wilt yet. The game description reads a 5 s Terra; TLIDB's 3 s / 2 s is used."] },
  { name: "Burning Shot", delivery: "attack-ranged", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to Ranged weapons") },
    conversion: convert("Fire"),
    components: [{ key: "shot", label: "Burning Shot", groupId: 361, perUse: 1, ...text("one projectile per shot") }],
    notes: [CONVERSION_NOTE("Burning Shot", "Fire"), "Burning Shot: \"+25% Ignite chance\" reaches the ailment model through the skill text; \"+30% additional Ignite Damage for this skill\" is not applied to a non-main skill's Ignite yet. The True Damage explosion on hitting an Ignited enemy (100% of its Ignite DPS, 5 s cooldown per enemy) is not modeled."] },
  { name: "Electrifying Shot", delivery: "attack-ranged", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to guns and cannons") },
    conversion: convert("Lightning"),
    components: [{ key: "shot", label: "Electrifying Shot", groupId: 351, perUse: 1, ...text("one projectile per shot (it always penetrates; one dummy)") }],
    notes: [CONVERSION_NOTE("Electrifying Shot", "Lightning")] },
  { name: "Corrosive Throw", delivery: "attack-ranged", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to One-Handed Swords, Claws, Daggers and Unarmed.") },
    conversion: convert("Erosion"),
    components: [{ key: "throw", label: "Corrosive Throw", groupId: 341, perUse: 1.2, ...provisional("TLIDB: 1 + 2 projectiles that cannot hit the same enemy, so one hits the dummy; the skill's +20% Multistrike chance is read as a 20% chance of one repeated throw (provisional reading of Multistrike); the Multistrike projectile stacks only add projectiles, which cannot hit the same enemy") }],
    notes: [CONVERSION_NOTE("Corrosive Throw", "Erosion")] },
  { name: "Rain of Arrows", delivery: "attack-ranged", timingFallback: ONE_SECOND("Rain of Arrows"), weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to bows and crossbows") },
    components: [{ key: "arrows", label: "Arrows", groupId: 311, perUse: { perTick: 1, falloff: { count: 15, factor: 0.7, reach: "half" } }, ...provisional(`TLIDB: 1 + 14 projectiles that can hit the same enemy; ${SHOTGUN_NOTE(15, 0.7, "half")} (the Rain of Arrows: Tracking support makes the arrows "guaranteed to aim at enemies", so without it only part of them do; the fallen-projectile default aim share is 50%; the skill's own Split is not decoded)`) }],
    notes: ["Rain of Arrows: \"25% of the skill's additional Projectile Speed bonus also applies to the skill's additional damage\" is not read (no Projectile Speed total)."] },
  { name: "Focused Shot", delivery: "attack-ranged", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to Ranged weapons") },
    components: [{ key: "shot", label: "Focused Shot", groupId: 511, perUse: 1, ...text("one projectile per shot") }],
    notes: ["Focused Shot: the Fervor distance bonus (up to +4% additional damage per 10 Fervor Rating) is not applied — no Fervor Rating total is modeled; the game description's Focus stacks (+5% Critical Strike Damage × 8) are not in TLIDB's text and are not applied."] },
  { name: "Blink Arrow", delivery: "attack-ranged", timingFallback: ONE_SECOND("Blink Arrow"), weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to bows and crossbows") },
    components: [{ key: "arrow", label: "Blink Arrow", groupId: 710, perUse: 1, ...text("one projectile per use (it always penetrates; the game description's 2 bounces need other enemies)") }],
    notes: ["Blink Arrow: the skill-timing table's \"Blink\" entry (Split 774004, 1 s fixed, 3 s cooldown) is the Blink skill's file, not Blink Arrow's (524662, not decoded), so TLIDB's 1 s attack-speed cast is used. A Mobility attack with no cooldown decoded, assumed usable back to back (best case); the Movement Speed → Attack Speed line is not read; its buff is Movement Speed only."] },
  { name: "Blazing Bullet", delivery: "attack-ranged", weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to Bows, Crossbows, Firearms and Cannons") },
    conversion: convert("Fire"),
    components: [
      { key: "bomb", label: "Blazing Bomb", groupId: 810, perUse: 1, extraAdditional: [BLAZING_PENETRATION], ...text("one projectile per shot") },
      { key: "explosion", label: "Blazing Explosion", groupId: 811, perUse: 1, extraAdditional: [BLAZING_PENETRATION], ...text("TLIDB: projectiles and their explosion can hit the same enemy; one explosion per shot") }
    ],
    notes: [CONVERSION_NOTE("Blazing Bullet", "Fire")] },

  // --- Last unmodeled skills (2026-10-12): the two dash attacks ---
  // Spiral Strike (Split 456215, one of the 11 files whose header the decoder rejects; read by hand: doSpeed 1 s, extraSpeed
  // 0.25 s, onceFixedTime 0.667 s, the usually-1.0 double 0.8; component strings "fire_bumpattack_damage", "AttackSpeed",
  // "scaleTime"). TLIDB / skill_des: "Deals 87% Weapon Attack Damage multiple times. The caster's Attack Speed makes the skill
  // deal damage more times." Reading: the dash is a fixed 0.667 s bump attack (Searing Crush's charge uses onceFixedTime the same
  // way) dealing a hit every 0.25 s with the interval attack-speed scaled, so hits per use = 0.667 ÷ (0.25 ÷ attack-speed factor)
  // = 2.67 × factor (4 at 1.5 attacks/s). No in-game count exists yet: provisional.
  { name: "Spiral Strike", delivery: "attack-melee", timingFallback: { useTime: 1, speedType: "attack-speed", cooldown: 0, cdTimes: 0, source: "Split 456215 doSpeed 1 s, attack-speed scaled (header read by hand; the decoder rejects this file's header)" },
    weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to One-Handed Swords, Claws and Daggers.") },
    conversion: convert("Erosion"),
    components: [{ key: "dash", label: "Spiral Strike hits", groupId: 740, perUse: { perTick: 1, intervalSeconds: 0.25, attackSpeedScaled: true, durationSeconds: 2 / 3 }, ...provisional("Split 456215: a 0.667 s bump-attack dash (onceFixedTime) hitting every 0.25 s (extraSpeed) with the interval attack-speed scaled (TLIDB: Attack Speed makes it deal damage more times), so 2.67 × attack-speed factor hits per use on a dummy that stays in the dash path") }],
    notes: [CONVERSION_NOTE("Spiral Strike", "Erosion"), "Spiral Strike: a Mobility attack with no cooldown (Split 456215 cd 0), assumed usable back to back at its attack rate with the dummy on the dash path (best case). \"+20% chance to Wilt\" reaches the ailment model through the skill text; the Movement Speed → Attack Speed line is not read (no Movement Speed total)."] },
  // Swift Shadow Raid: game row 720 (154% → 271%, a 20-level value match; the row's description is a stale bouncing-projectile
  // note) and no skill stone / Split file. TLIDB publishes a 0.25 s cast; the Hammer of Ash Lv16 run 2026-10-12 showed a
  // published 0.2 s attack cast running at one attack per weapon interval, so the same observed rule is used here (provisional).
  { name: "Swift Shadow Raid", delivery: "attack-ranged", timingFallback: { useTime: 1, speedType: "attack-speed", cooldown: 0, cdTimes: 0, source: "one attack per weapon interval (the Hammer of Ash Lv16 run 2026-10-12 rule for a sub-second published attack cast; TLIDB publishes 0.25 s and no Split file is linked)" },
    weaponScaling: { baseTypes: ["Physical"], restriction: restriction("Limited to Bows, Crossbows, Guns and Canes") },
    components: [{ key: "dash", label: "Swift Shadow Raid", groupId: 720, perUse: 1, ...text("TLIDB: dashes forward dealing 271% Weapon Attack Damage to enemies on the path; one hit per dash on the dummy") }],
    notes: ["Swift Shadow Raid: a Mobility attack with no cooldown published, assumed usable back to back at its attack rate with the dummy on the dash path (best case); TLIDB's 0.25 s cast is not used as the attack interval (Hammer of Ash reading; an in-game dash count would settle it). The Movement Speed → Attack Speed line is not read. Its hits are Physical (no conversion on TLIDB); it is not Melee-tagged, so Melee lines do not reach it."] },

  // --- Sentry batch (2026-10-12): the two Attack Sentries (Einherjar) ---
  // Manual rule 1001011723: Sentries inherit the player's stats, so the weapon model and the player's layers apply; rule
  // 1001011724: their cadence is Cast Frequency. TLIDB: "Base Sentry Cast Frequency is 100% of average Weapon Attack
  // Speed", read as one attack per 1 ÷ weapon attacks per second (the build's Attack Speed bonuses do not scale it; Cast
  // Frequency lines do). One Sentry at a time (max base Sentry quantity 1) lasting 8 s, recast on expiry (best case).
  { name: "Ghost Blade Einherjar", delivery: "attack-sentry", useModel: SENTRY(), sentry: { weaponAttackSpeed: true, note: "Attack Sentry: base Cast Frequency = 100% of the weapon's average Attack Speed (TLIDB), scaled by Cast Frequency lines (manual rule 1001011724), not by the build's Attack Speed" },
    weaponScaling: { baseTypes: ["Physical"], restriction: null },
    conversion: [{ from: "Physical", to: "Erosion", percent: 100, source: "TLIDB: Converts 100% of the Physical Damage dealt by the Sentries placed by this skill to Erosion Damage" }],
    components: [
      // Since the 2026-10-14 game patch TLIDB lists the blade at 93% (its level line 12: 69% → 93%, the game's row 860) and the
      // Explosion at 185% (line 15: 137% → 185%; was the blade's 107% → 144%).
      { key: "blade", label: "Ghost Blade", groupId: 860, perUse: { perTick: GHOST_BLADE_HITS_PER_CYCLE, intervalSeconds: GHOST_BLADE_CYCLE, castFrequencyScaled: true }, ...provisional(GHOST_BLADE_NOTE("blade")) },
      { key: "explosion", label: "Explosion", groupId: "tlidb", group: tlidbWeaponGroup("Ghost Blade Einherjar", 15, 185), perUse: { perTick: GHOST_BLADE_HITS_PER_CYCLE, intervalSeconds: GHOST_BLADE_CYCLE, castFrequencyScaled: true }, ...provisional(GHOST_BLADE_NOTE("explosion")) }
    ],
    notes: ["Ghost Blade Einherjar: the Explosion's 185% Weapon Attack Damage row is not linked in the game data (no config_skill_damage group carries 185% at Lv.20), so its per-level percent is TLIDB's (137% at Lv.1 → 185% at Lv.20); the blade's row 860 (69% → 93%) is the game's. The Physical weapon damage is dealt as Erosion (provisional conversion rule). Build-wide Multistrike lines are not read; the skill's own +100% Multistrike chance is taken as one repeat per attack."] },
  { name: "Arrow Einherjar", delivery: "attack-sentry", useModel: SENTRY(), sentry: { weaponAttackSpeed: true, note: "Attack Sentry: base Cast Frequency = 100% of the weapon's average Attack Speed (TLIDB), scaled by Cast Frequency lines (manual rule 1001011724), not by the build's Attack Speed" },
    weaponScaling: { baseTypes: ["Physical"], restriction: null },
    components: [{ key: "arrows", label: "Arrow Einherjar", groupId: 861, perUse: { perTick: 1, intervalSeconds: ({ weaponAttacksPerSecond }) => weaponAttacksPerSecond > 0 ? 0.9 / weaponAttacksPerSecond : Infinity, castFrequencyScaled: true, falloff: { count: 3, factor: 0.7, reach: "fan" } },
      extraAdditional: [{ source: "Arrow Einherjar: Sentry buff stacks", text: `+8% additional Sentry Damage (multiplies) per stack, 1 stack every 1 s up to 5, averaged over the 8 s Sentry: (1 + 1.08 + 1.08² + 1.08³ + 1.08⁴ + 3 × 1.08⁵) ÷ 8 = ×${Math.round((1 + ARROW_STACK_AVERAGE_PERCENT / 100) * 10000) / 10000} (provisional: the stacks start at 0 on placement and the hits are spread evenly over the Sentry's life)`, value: ARROW_STACK_AVERAGE_PERCENT }],
      ...provisional(`TLIDB: 3 projectiles per attack that can hit the same enemy; ${SHOTGUN_NOTE(3, 0.7, "fan")} (no spread data decoded for the Sentry: the fan reading of Chromatic Shot is reused); attack interval = 1 ÷ weapon attacks per second × 0.9 ("-10% interval for every 1 Sentry placed by this skill", one Sentry), scaled by Cast Frequency`) }],
    notes: ["Arrow Einherjar: the game row 861 (137% → 185% Weapon Attack Damage) matches TLIDB at Lv.20. Its hits are Physical (no conversion on TLIDB)."] }
];

/** Sentry use model (src/skill-hit-profiles.js shape): one Sentry at a time lasting 8 s, recast when it expires. */
function SENTRY(durationSeconds = 8) { return { kind: "terra", label: "sentry", durationSeconds, note: `TLIDB: the Sentry lasts ${durationSeconds} s and the skill's max base Sentry quantity is 1; recast when it expires (best case: continuous uptime)` }; }

/**
 * TLIDB per-level "Deals X% Weapon Attack Damage" as a synthetic hit group for a component whose game row is not linked
 * (Ghost Blade's blade). `changeIndex` is the effect line's index in the TLIDB level table; Lv.20 is the skill text's value.
 */
function tlidbWeaponGroup(name, changeIndex, lv20Percent) {
  const entry = skillProgressionSs13[name];
  const levels = {};
  let percent = null;
  for (let level = 1; level <= 20; level++) {
    const change = (entry?.levels?.[String(level)]?.changes || []).find(([index]) => index === changeIndex);
    const match = change ? String(change[1]).match(/(\d+(?:\.\d+)?)% Weapon Attack Damage/) : null;
    if (match) percent = Number(match[1]);
    if (level === 20) percent = lv20Percent;
    levels[String(level)] = { kind: "hit", effectiveness: percent ?? lv20Percent, entries: [] };
  }
  return { id: `tlidb:${name}`, synthetic: "TLIDB level table", kind: "hit", levels };
}

function ONE_SECOND(name) { return { useTime: 1, speedType: "attack-speed", cooldown: 0, cdTimes: 0, source: `TLIDB cast speed 1 s, attack-speed scaled (no Split skill file is linked for ${name})` }; }
function convert(to) { return [{ from: "Physical", to, percent: 100, source: `TLIDB: Converts 100% of the skill's Physical Damage to ${to} Damage` }]; }
function CONVERSION_NOTE(name, to) { return `${name}: the Physical weapon damage is dealt as ${to} (both Physical and ${to} modifiers apply: provisional conversion rule).`; }
// "+30% Combo Finisher Amplification for this skill" (TLIDB): the Finisher's Hit Damage is additionally increased by consumed
// Combo Points × Amplification (game manual 1001013024; src/combo-points.js). Before 2026-10-12 it was read as +30% flat.
// Crescent Slash's 1 point per Starter / 2 consumed is observed (2026-10-12); the other Combo skills reuse it (provisional).
function FINISHER_AMPLIFICATION(name, { observed = false } = {}) { const value = finisherAmplificationPercent(30); return { source: `${name}: Combo Finisher Amplification`, text: `+30% Combo Finisher Amplification for this skill × ${CONSUMED_COMBO_POINTS} consumed Combo Points = +${value}% additional Finisher Hit Damage (TLIDB value; manual rule; ${COMBO_POINTS_PER_STARTER} Combo Point per Starter ${observed ? "observed on Crescent Slash 2026-10-12" : "observed on Crescent Slash 2026-10-12, reused here (provisional)"})`, value, amplification: 30 }; }
// Slash-Strike skills: each attack is a Sweep Slash, or a Steep Strike on the skill's own 20% Steep Strike chance (the
// Steep Strike replaces the Sweep Slash). Whirlwind Lv16 dummy run 2026-10-12 (research/attack-weapon-tests-2026-10-12.md):
// 409 avg vs 358 with no Steep Strikes, 428 with 20% replacing, 501 with 20% extra hits — the replacing reading is the
// closest (+4.6%). 2026-10-14: the perUse values below are the own-chance defaults; src/skill-hit-model.js steepStrikeState
// replaces them with the share from the summed chance (own + supports + build-wide lines), marked by `steep`.
function slashStrike(sweepGroup, steepGroup, { sweepNote = "a Sweep Slash on the 80% of attacks that are not Steep Strikes", steepNote = STEEP_NOTE } = {}) {
  return [
    { key: "sweep", label: "Sweep Slash", groupId: sweepGroup, perUse: 0.8, steep: { role: "sweep" }, ...text(sweepNote) },
    { key: "steep", label: "Steep Strike", groupId: steepGroup, perUse: 0.2, steep: { role: "steep", perSteep: 1 }, basis: "observed", note: steepNote }
  ];
}
// Every Slash-Strike profile built from slashStrike carries the TLIDB "This skill +20% Steep Strike chance" (Whirlwind, Focused
// Slash, Berserking Blade, Flame Slash, Icy Blade, Moon Strike: checked against the catalog text 2026-10-14).
const withSteepStrike = (definition) => definition.steepStrike || !definition.components.some((component) => component.steep) ? definition
  : { ...definition, steepStrike: { ownChancePercent: 20, fromChance: true, source: `TLIDB ${definition.name}: "This skill +20% Steep Strike chance"` } };

export const ATTACK_HIT_PROFILES = Object.freeze(Object.fromEntries(DEFINITIONS.map((definition) => [definition.name, buildSkillHitProfile(withSteepStrike(definition))])));
