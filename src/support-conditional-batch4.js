// Skill-mechanics census batch 4 (backlog B2 of research/skill-mechanics-census-2026-10-27.md §3; user-approved 2026-10-28):
// Magnificent / Noble supports' conditional additional damage whose condition the planner already holds. One generic rule shape
// per clause: { condition, value, scope }, where
//   - the value is the clause's own number (the stone's level map, or the configured tier roll and stars: src/support-effects.js
//     supportClauses substitutes it before the rule reads the text);
//   - the scope comes from the clause's game recipe (named on each rule): the skill's whole damage (attr 5719 / 57191 on "this
//     skill" 5000002, so its hits, its own DoT and its ailments: appliedValue; trigger 1000031 alone does not narrow it: the DoT value
//     raises it too, research/core-formulas-chunk0-2026-10-31.md §14), its hits only (the hit tag 5000003 or a skill-type tag on the
//     write: hitOnly), one hit group (a component of the skill's profile: componentParts; a Shadow Strike's Shadows: shadowParts),
//     or a mechanic read elsewhere (the Combo Finisher, Demolisher consumption, Barrage waves, a Minion skill);
//   - the condition is settled here from the planner's state (src/planner.js supportConditions): the dummy profile (a Boss, so an
//     Elite, within 10 m, never attacks; src/dummy-target.js), the enemy-ailment model's states, the Frostbite Rating, Fervor,
//     Command, the Life / Mana state, the stat sheet, the hit pass's rates, and this setup's other supports.
// Every rule carries `census: true, batch4: true`; src/support-effects.js resolveCensusCondition hands those clauses to
// resolveBatch4Condition below, and their badge is censusStatus's (In calc, Provisional for a provisional reading, Inactive with the
// reason when the condition does not hold). Without a planner state (direct engine calls, the census) nothing is applied (Provisional).
// Provisional readings: open questions support-conditional-batch4-* in src/open-questions.js.
import { dummyTarget, explicitRadiusHolds, DISTANT_STANDING_METERS } from "./dummy-target.js";
import { WEAPON_WORDS, RECENTLY_SECONDS } from "./line-conditions.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";

const N = "([+-]?\\d+(?:\\.\\d+)?)";
const num = (value) => Number(String(value).replace("−", "-"));
const round = (value) => Math.round(value * 10000) / 10000;
// The cold-start window own buffs ramp over when "Own buffs built before engaging" is off (the sustained 20 s run).
const COLD_WINDOW_SECONDS = 20;
// The Max Fervor Rating held by a skill whose own text grants Fervor per strike, while it keeps striking the dummy (src/combat-states.js
// BUFF_VALUES.fervorMax, the Attack Focus reading in src/support-effects.js).
const FERVOR_MAX_RATING = 100;
// Mind Control: "Initially has 3 maximum links" / "+1 maximum link for every channeled stack" / "Channels up to 5 stacks" (reference data).
const MIND_CONTROL_BASE_LINKS = 3;
const BASE_CHANNEL_STACKS = 5;
// Frost Terra Lv16 tooltip: max base Terra quantity 1 (user-confirmed 2026-10-12).
const FROST_TERRA_QUANTITY = 1;

const rule = (pattern, build) => ({ family: "conditionalAdditional", pattern, build: (m) => ({ ...build(m), census: true, batch4: true }) });

export const BATCH4_SUPPORT_RULES = [
  // ---- Target states (the dummy profile, the enemy-ailment model, src/combat-states.js) ----
  // Hound's Fangs: Pounce (Noble; recipe 11129141: on a hit (trigger 1000031) of the Massive Fang (tag 6101382) against an Elite target
  // (5001990), attr 5719 additional). The dummy is a Boss, so an Elite.
  rule(new RegExp(`^${N}% additional Damage for Massive Fangs against Elites$`, "i"), (m) => ({ value: num(m[1]), condition: "targetElite", component: "massive", recipe: 11129141 })),
  // Icy Blade: Quick Freeze (Magnificent; recipe 542191872: field 2600081, the Steep Strike's explosion damage against a Frozen enemy).
  rule(new RegExp(`^When the supported skill's Steep Strike hits a Frozen enemy, explosions generated deal ${N}% additional Hit Damage$`, "i"), (m) => ({ value: num(m[1]), condition: "frozenTarget", component: "explosion", recipe: 542191872 })),
  // Frost Spike: Ice Fission (Noble; recipe 149395712: attr 5719 additional on {this skill, Shadow Strike Shadows 6020014} against a
  // Frozen target 4000110): the Shadows' hits only (src/skill-hit-model.js shadowState reads shadowParts).
  rule(new RegExp(`^${N}% additional Phantom Damage when the supported skill hits a Frozen enemy$`, "i"), (m) => ({ value: num(m[1]), condition: "frozenTarget", shadow: true, recipe: 149395712 })),
  // Ice Shot: Ice Blast (Magnificent; recipe 49531540: on a hit with the hit tag 5000003, node 632 per 1 Frostbite Rating on the target
  // (attr 47) → 57191 additional P1, up to P2).
  rule(new RegExp(`^When a Projectile of the supported skill hits, for every 1 Frostbite Rating the enemy has, ${N}% additional damage, up to ${N}%$`, "i"), (m) => ({ value: num(m[1]), cap: num(m[2]), condition: "perFrostbiteRating", hitOnly: true, recipe: 49531540 })),
  // Thundercloud: Alarmed Awakening (Magnificent; recipe 130466624: on hit (1000033) with Numbed on the enemy, 1 s gate: consumes 1 Numbed
  // stack and adds buff 10093 for 1 s; while it lasts, attr 5719 additional on this skill's damage (trigger 1000031, no Hit tag)).
  rule(new RegExp(`^The supported skill consumes 1 stack of Numbed on the enemy on hit, dealing ${N}% additional damage to the enemy over the next ${N}\\s*s\\.? Interval: ${N}\\s*s$`, "i"), (m) => ({ value: num(m[1]), seconds: num(m[2]), interval: num(m[3]), condition: "numbedConsumed", recipe: 130466624 })),
  // Bombard: Smokescreen (Noble; recipe 37659840: trigger 1000031, no Hit tag, while the target has buff 11071, attr 5719 additional; buff 11071 is
  // the debuff the skill's own landing area inflicts: stone affix 884212800).
  rule(new RegExp(`^The supported skill deals ${N}% additional damage to debuffed enemies$`, "i"), (m) => ({ value: num(m[1]), condition: "ownAreaDebuff", recipe: 37659840 })),
  // Ice Lances: Ice Corrosion (Magnificent; recipe 666890432 row 1: attr 5719 additional on this skill against a target on a Frost Terra
  // (state 4015180): the skill's whole damage) and Ice Lances: Permafrost's stacking line (775322752: label 3100141 switches row 2 on,
  // the bonus × the Frost Terra Quantity, on hits).
  rule(new RegExp(`^The supported skill deals ${N}% additional damage to enemies on a Frost Terra$`, "i"), (m) => ({ value: num(m[1]), condition: "onFrostTerra", recipe: 666890432 })),
  rule(/^The supported skill's additional damage bonus against enemies on a Frost Terra can be stacked, with the number of stacks equal to the Frost Terra Quantity$/i, () => ({ value: 0, condition: "frostTerraStacks", recipe: 775322752 })),
  // ---- Position (best case: the dummy where the skill's area is strongest; Distance group) ----
  // Groundshaker: Epicenter (Magnificent; recipe 940763584: attr 5901 Center Damage Bonus additional, this skill): its full "up to" value
  // with the dummy at the centre; read on the skill's hits.
  rule(new RegExp(`^The supported skill deals up to ${N}% additional damage to enemies at the Center$`, "i"), (m) => ({ value: num(m[1]), condition: "atCentre", hitOnly: true, recipe: 940763584 })),
  // Thornfield: Retribution (Noble; recipe 91144320: one stack every P1 s while the player has buff 371 (inside this skill's Terra), up to
  // P3; attr 5902 additional × stacks on this skill (its damage over time)).
  rule(new RegExp(`^${N}% additional damage for the supported skill every ${N}\\s*s while within the supported skill's Terra\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ value: num(m[1]), every: num(m[2]), cap: num(m[3]), condition: "withinOwnTerra", recipe: 91144320 })),
  // Whirlwind Blade: Unsheath (Magnificent; recipe 609118912: field 2600124, the flying projectiles' Hit Damage, read by the skill's script).
  rule(new RegExp(`^${N}% additional Hit Damage when the supported skill's Projectiles are flying in the air$`, "i"), (m) => ({ value: num(m[1]), condition: "projectilesFlying", hitOnly: true, recipe: 609118912 })),
  // Path of Flames: Raging Boil (Noble; recipe 204199344: when this skill inflicts its debuff on an Elite (trigger 1000150, gate tag
  // 5001990) while channeling (buff 10156), a 2 s stack of buff 10157 (up to 8); attr 5719 additional × stacks).
  rule(new RegExp(`^${N}% additional damage for the supported skill for ${N}\\s*s when passing by an Elite while channeling the supported skill\\. Stacks up to (\\d+) times\\.? The effect has a ${N}\\s*s interval against the same target\\. The interval refreshes immediately when you are ${N}\\s*m away from the target$`, "i"), (m) => ({ value: num(m[1]), seconds: num(m[2]), cap: num(m[3]), interval: num(m[4]), condition: "eliteWhileChanneling", recipe: 204199344 })),
  // ---- Fervor Rating (src/combat-states.js; heldFervor below) ----
  // Focused Shot: Aspire (Magnificent; recipe 790276800: a stack per use (1000074) while Fervor Rating (resource 1) ≥ 100; lost below P3;
  // attr 5719 additional × stacks, up to P2).
  rule(new RegExp(`^While having 100 Fervor Rating\\s*,\\s*${N}% additional damage for the supported skill every time it is used\\. Stacks up to (\\d+) time\\(s\\)\\. The damage bonus is lost when Fervor Rating is lower than (\\d+)$`, "i"), (m) => ({ value: num(m[1]), cap: num(m[2]), need: 100, lostBelow: num(m[3]), perUse: true, condition: "fervorStacks", recipe: 790276800 })),
  // Focused Shot: Building Momentum (Noble; recipe 747337280: a stack every P2 s while Fervor Rating ≥ P1, all lost below it; attr 5719
  // additional × stacks, up to P4).
  rule(new RegExp(`^(?:The supported skill )?${N}% additional damage every ${N}\\s*s when you have at least (\\d+) Fervor Rating\\s*,\\s*stacking up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ value: num(m[1]), every: num(m[2]), need: num(m[3]), cap: num(m[4]), condition: "fervorStacks", recipe: 747337280 })),
  // Focused Slash: Fervor (Noble; recipe 405438400: on casting a Steep Strike (tags this skill + 5006010), node 627 consumes P1 Fervor
  // Rating and node 624 gives that action +P2% additional (57191); the recipe has no Rating gate): on the Steep Strike component.
  rule(new RegExp(`^The supported skill's Steep Strike consumes ${N} Fervor Rating to make the skill deal ${N}% additional damage$`, "i"), (m) => ({ value: num(m[2]), consumed: num(m[1]), condition: "steepStrikeFervor", component: "steep", recipe: 405438400 })),
  // ---- Combo (src/skill-hit-model.js reads the Finisher lines with the cycle's consumed Combo Points) ----
  // Serpent Beam: Inferno (Magnificent; recipe 157536544: on casting a Combo Finisher, a 4 s stack (count P2); each stack attr 57191
  // additional on the Finisher's hits, multiplied): stacks = min(P2, Finishers in 4 s) at one Finisher per cycle.
  rule(new RegExp(`^${N}% additional Hit Damage for Combo Finishers for each time the supported skill casts a Combo Finisher recently\\. Stacks up to (\\d+) time\\(s\\) \\(multiplies\\)$`, "i"), (m) => ({ value: num(m[1]), cap: num(m[2]), condition: "finishersRecently", component: "finisher", recipe: 157536544 })),
  // ---- Channel stacks, Projectile Quantity, Skill Area (this setup's other supports + the build's lines) ----
  // Split Shot: Rapid Advance (Noble; recipe 201300080: per P1 of the additional Max Channeled Stacks (field 20060502) → 57191 additional
  // P2, up to P3 × P2).
  rule(new RegExp(`^${N}% additional damage for the supported skill for every \\+?1 to additional Max Channeled Stacks, stacking up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ value: num(m[1]), cap: num(m[2]), condition: "additionalChannelStacks", recipe: 201300080 })),
  // Split Shot: Collaboration (Noble; recipe 113773000: per +P1 Projectile Quantity (field 20061082) → 57191 additional P2).
  rule(new RegExp(`^${N}% additional damage for the supported skill for every \\+?1 Projectile Quantity$`, "i"), (m) => ({ value: num(m[1]), condition: "perProjectileQuantity", recipe: 113773000 })),
  // Blazing Bullet: Ignition Point (Noble; recipe 261391040: gate GetAttr(6201 Skill Area) − 1 ≥ P1 / 100 → attr 5719 additional P2).
  rule(new RegExp(`^${N}% additional damage for the supported skill when the bonus and additional bonus to Skill Area reach at least ${N}%$`, "i"), (m) => ({ value: num(m[1]), threshold: num(m[2]), condition: "skillAreaAtLeast", recipe: 261391040 })),
  // Berserking Blade: Rampage (Noble; recipe 553331072: Skill Area increased (62011 mod 3) and additional (mod 4) × P1 / 100 → 57191
  // additional on the Steep Strike (5006010)).
  rule(new RegExp(`^${N}% of the bonuses and additional bonuses to Skill Area is also applied to the skill's additional Steep Strike Damage$`, "i"), (m) => ({ value: num(m[1]), condition: "skillAreaToSteep", component: "steep", recipe: 553331072 })),
  // Mind Control: Concentrate (Magnificent; recipe 169011504: field 2600291, per link below the maximum, read by the skill's script).
  rule(new RegExp(`^${N}% additional damage for this skill for every link less than maximum links$`, "i"), (m) => ({ value: num(m[1]), condition: "linksBelowMax", recipe: 169011504 })),
  // ---- Stats and resources ----
  // Lightning Shot: Crossed Lightning (Noble; recipe 355082880: gate GetRoundInt(Dexterity) ≥ P1 → attr 5719 additional P2).
  rule(new RegExp(`^When having at least (\\d+) Dexterity, ${N}% additional damage for the supported skill$`, "i"), (m) => ({ value: num(m[2]), need: num(m[1]), stat: "dexterity", condition: "statAtLeast", recipe: 355082880 })),
  // Moon Strike: Lunar Eclipse (Noble; recipe 972991104: node 130 seals P1% Max Mana; node 119 per P2 Mana sealed (stat 40) → 57191
  // additional P3, up to P4).
  rule(new RegExp(`^When the supported skill is installed, seal ${N}% Max Mana For every ${N} Mana sealed, ${N}% additional damage for the supported skill, up to ${N}% additional damage$`, "i"), (m) => ({ value: num(m[3]), ownSeal: num(m[1]), every: num(m[2]), cap: num(m[4]), condition: "manaSealed", recipe: 972991104 })),
  // Berserking Blade: Desperation (Magnificent; recipe 793633792: node 119 per 1% missing Life (stat 11) → 57191 additional P1 / 5, up to P2).
  rule(new RegExp(`^For every (\\d+)% Life lost, ${N}% additional damage for the supported skill, up to ${N}% additional damage$`, "i"), (m) => ({ value: num(m[2]), every: num(m[1]), cap: num(m[3]), condition: "lifeLostPer", recipe: 793633792 })),
  // ---- Recent uses and hits (the hit pass's rates; "recently" = 4 s, game hyperlink 103) ----
  // Lightning Beam: Relentless (Magnificent; recipe 670705280: a 2 s stack per use (1000074), up to P2; attr 5719 additional × stacks).
  rule(new RegExp(`^For ${N}\\s*s, ${N}% additional damage for the supported skill every time it is used\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ value: num(m[2]), seconds: num(m[1]), cap: num(m[3]), condition: "usesRecently", recipe: 670705280 })),
  // Moon's Dawn: Resplendence (Magnificent; recipe 801932480: once per use on hit (1000033) a 4 s stack of buff 12100 on the enemy; on a
  // trigger 1000031, no Hit tag: attr 5719 additional × stacks on this skill's damage, up to P2).
  rule(new RegExp(`^Enemies take ${N}% additional damage from the supported skill each time they were hit by the supported skill recently\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ value: num(m[1]), seconds: RECENTLY_SECONDS, cap: num(m[2]), condition: "usesRecently", recipe: 801932480 })),
  // Shadow Swamp: Overlapping Waves (Noble; recipe 169621872: each Shadow Shot hit (tag 6101307) adds a 4 s stack of buff 10131 on the
  // target, up to 66; this skill's damage (1000031, no Hit tag) takes attr 5719 additional × stacks).
  rule(new RegExp(`^For every time the enemy has been hit by Shadow Shot recently, the supported skill deals ${N}% additional damage to it\\. Stacks up to (\\d+) times$`, "i"), (m) => ({ value: num(m[1]), seconds: RECENTLY_SECONDS, cap: num(m[2]), skill: "Shadow Shot", condition: "otherSkillHitsRecently", recipe: 169621872 })),
  // Icebound Beam: Frostbitten (Magnificent; recipe 921903104: the Beam's hits add a 1 s debuff stack, up to 8; this skill's hits
  // (1000031, no Hit tag) and its ailments take attr 5719 additional × stacks).
  rule(new RegExp(`^The supported skill's Beam inflicts 1 stack of debuff that lasts for ${N}\\s*s on enemies on hit, with each stack of debuff additionally increasing the skill's damage by ${N}%\\s*\\.? Stacks up to (\\d+) times$`, "i"), (m) => ({ value: num(m[2]), seconds: num(m[1]), cap: num(m[3]), condition: "ownHitStacks", recipe: 921903104 })),
  // ---- Hit groups and mechanics read elsewhere ----
  // Hammer of Ash: Upheaval (Magnificent; recipe 146244704: field 2600031, the explosion damage of its Ember Projectiles): the profile's
  // "explosion" hit group (group 12, the projectile-hit row).
  rule(new RegExp(`^${N}% additional Hit Damage for the explosions of the supported skill's Projectiles$`, "i"), (m) => ({ value: num(m[1]), condition: "component", component: "explosion", recipe: 146244704 })),
  // Groundshaker: Cripple (Noble; recipe 88992: on consuming a Demolisher Charge (trigger 1001300), node 624 +P1% additional for that
  // cast): the hit model's Demolisher-consumed reading (src/skill-hit-model.js DEMOLISHER_CONSUMED_LINE, game affix 175116's rule).
  rule(new RegExp(`^When the cast of the Supported Skill consumes Demolisher Charge\\s*,\\s*${N}% additional damage for that cast$`, "i"), (m) => ({ value: num(m[1]), condition: "demolisherConsumed", recipe: 88992 })),
  // Inexhaustible Barrage: Bombard (Magnificent; recipe 32746360: field 2501029, the per-wave damage increase, on {cannon 5000728, this
  // skill}): the Barrage wave reading (src/skill-hit-model.js barrageWaveState) while a cannon is held.
  rule(new RegExp(`^${N}% damage increase per wave for the supported skill when using a cannon$`, "i"), (m) => ({ value: num(m[1]), weapon: "cannon", condition: "barrageWithWeapon", recipe: 32746360 })),
  // ---- Not modeled, with the reason (a hit the profile does not carry) ----
  // Burning Shot: Fiery Blast (Magnificent; recipe 797540160: field 2600051, the explosion's damage per Ignite stack): the explosion is
  // Burning Shot's True Damage burst on Ignited enemies: not modeled, the profile has no explosion hit (src/attack-hit-profiles.js note).
  rule(new RegExp(`^When a Projectile of the supported skill hits, ${N}% additional damage for the explosion for every stack of Ignite the enemy has$`, "i"), (m) => ({ value: num(m[1]), condition: "unmodeledHit", unmodeled: true, conditionText: "Not modeled: Burning Shot's explosion (its True Damage burst on an Ignited enemy, game field 2600051) is not a modeled hit of the Burning Shot profile", reason: "Burning Shot's explosion (its True Damage burst on an Ignited enemy, game field 2600051) is not a modeled hit of the Burning Shot profile", recipe: 797540160 }))
];

// Combo Finisher lines (family "combo"; src/skill-hit-model.js reads them with the cycle's consumed Combo Points).
const combo = (pattern, build) => ({ family: "combo", pattern, build: (m) => ({ ...build(m), census: true, batch4: true }) });
export const BATCH4_COMBO_RULES = [
  // Crescent Slash: Rising (Noble; stone 10003813). Game files (SS13 SkillEditor splits and config_skill_damage, checked 2026-10-28):
  // - "Changes the Combo Finisher … to a massive sword slash that only deals damage once" is stone affix 237556064: node 107 sets
  //   label 3100501 on this skill ("碎月弧光斩-终结技改为上挑攻击", Crescent Slash: Finisher changed to an upward slash). The skill
  //   stone 2490 lists two Finisher splits, both tagged Combo Finisher 6000412 with damage index 2 = damage row 952 (Lv16 90% /
  //   Lv20 100% Weapon Attack Damage; the skill has no other Finisher row: 950 Starter 1, 951 Starter 2, 952 Finisher): 104229 (the
  //   normal Finisher: a hit loop that reads field 2012104, the Combo Points held, and 2600541, "Crescent Slash extra attack count")
  //   and 837369 (one fire_attack → fire_damage event, no Combo Point or extra-attack read). So the massive slash is one hit of row 952,
  //   not a larger damage value; the label → 837369 switch itself sits in the encrypted scripts (read from the label's name).
  // - recipe 468001344: node 114 per Combo Point consumed (field 20121042) → attr 57191 (damage, all: hits and the ailments it inflicts)
  //   additional P1 on the Combo Finisher tag 6000412, up to P1 × P2, one term. The Finisher still consumes the points (recipe
  //   236274304 reads them on its cast), so the skill's Combo Finisher Amplification also applies (game manual 1001013024).
  // - The T-roll "−X% additional damage for the supported skill" (config_modifier 771032640–771032642, affix class 825739: attr 5719
  //   additional on this skill 5000002) and the 5★ +20% (825739) reach the whole skill: Starters, Finisher and their ailments.
  combo(new RegExp(`^${N}% additional damage for the Combo Finisher of the supported skill for every 1 Combo Point consumed, stacking up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ value: num(m[1]), cap: num(m[2]), kind: "perConsumedPoint", recipe: 468001344, comboReason: "one additional term on the Combo Finisher: X% × the cycle's consumed Combo Points, up to the cap, on its hits and, averaged by the Finisher hits' share of the skill's hits, on its ailments (attr 57191, damage (all), on the Combo Finisher tag 6000412: game recipe 468001344; the ailment averaging is provisional; src/skill-hit-model.js, src/ailment-applications.js)" })),
  combo(/^Changes the Combo Finisher of the supported skill to a massive sword slash that only deals damage once$/i, () => ({ value: 0, kind: "singleHitFinisher", comboReason: "the Finisher deals one hit of its own damage row (952) per cycle instead of 1 + 1 per consumed Combo Point (game files: stone affix 237556064 → label 3100501; the single-hit Finisher split 837369 has damage row 952 and no hit loop; src/skill-hit-model.js)" })),
  // Gale Slash: Brutality (Noble; recipe 867824320: per Combo Point consumed → attr 48031 (Critical Strike Damage) additional on the
  // Finisher, up to P1 × P2): the Finisher's crit damage × (1 + X × points).
  combo(new RegExp(`^${N}% additional Critical Strike Damage for the Combo Finisher of the supported skill for each Combo Point consumed, stacking up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ value: num(m[1]), cap: num(m[2]), kind: "critDamagePerConsumedPoint", recipe: 867824320, comboProvisional: true, comboReason: "the Combo Finisher's Critical Strike Damage × (1 + X% × the cycle's consumed Combo Points), on its crit share (src/skill-hit-model.js; game recipe 867824320; provisional: additional crit damage read as a multiplier on the crit damage)" }))
];

// Minion skill lines (family "minion"; settled here, read by src/minion-damage-model.js on the named Minion skill's hits).
const minion = (pattern, build) => ({ family: "minion", pattern, build: (m) => ({ ...build(m), census: true, batch4: true }) });
export const BATCH4_MINION_RULES = [
  // Summon Grim Phantom: Spur (Magnificent; recipe 209936832: gate Command (resource 9) ≥ P1 → attr 5719 additional P2 on the Minion's
  // Destructive Light Cannon (6101327)).
  minion(new RegExp(`^${N}% additional damage for the Destructive Light Cannon cast by Minions summoned by the supported skill when having at least (\\d+) Command$`, "i"), (m) => ({ value: num(m[1]), need: num(m[2]), minionSkill: "Destructive Light Cannon", condition: "minionCommandAtLeast", recipe: 209936832 })),
  // Summon Grim Phantom: Glare (Magnificent; recipe 328562272: every P1-th High Energy Beam cast (6101326) gets node 624 +P3% additional
  // per P2 Command, up to P4 stacks): averaged over the casts.
  minion(new RegExp(`^For every (\\d+) time\\(s\\) a Minion summoned by the supported skill casts High Energy Beam, ${N}% additional damage for that cast for every (\\d+) Command the character has, stacking up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ value: num(m[2]), everyCasts: num(m[1]), perCommand: num(m[3]), cap: num(m[4]), minionSkill: "High Energy Beam", condition: "minionCommandEveryCasts", recipe: 328562272 }))
];

// Neutral detail lines of these supports (badge only).
export const BATCH4_NEUTRAL_RULES = [
  // Focused Shot: Building Momentum: the Fervor loss when the skill is not used within 1 s never happens while it is used continuously.
  { family: "nonDamage", pattern: /^If the supported skill is not used within [\d.]+\s*s, lose [\d.]+ Fervor Rating every [\d.]+\s*s$/i, build: () => ({ reason: "the dummy figures use the skill continuously, so the Fervor Rating loss never starts" }) },
  // Shackles of Malice: Spite (Noble; recipe 916043584: label 3100283 makes the skill count the Curses on yourself, field 2600281 per Curse):
  // the training dummy never attacks or curses, so no Curse affects you.
  { family: "notOnDummy", pattern: new RegExp(`^When the chain hits and explodes, the explosion deals ${N}% additional Hit Damage \\(multiplies\\) for every Curse affecting you$`, "i"), build: () => ({ reason: "it counts the Curses affecting you (game recipe 916043584, label 3100283); the training dummy never attacks or curses, so none does" }) }
];

export const BATCH4_RULES = [...BATCH4_SUPPORT_RULES, ...BATCH4_COMBO_RULES, ...BATCH4_MINION_RULES, ...BATCH4_NEUTRAL_RULES];
// Supports whose clauses read the hit pass's rates (uses, hits, another skill's hits): src/planner.js runs the rate pass for them.
export const BATCH4_RATE_SUPPORTS = new Set(["Thundercloud: Alarmed Awakening (Magnificent)", "Serpent Beam: Inferno (Magnificent)", "Lightning Beam: Relentless (Magnificent)", "Moon's Dawn: Resplendence (Magnificent)", "Shadow Swamp: Overlapping Waves (Noble)", "Icebound Beam: Frostbitten (Magnificent)", "Focused Shot: Aspire (Magnificent)"]);

// ---------------------------------------------------------------------------------------------------------------------------
// Helpers.
const lineValue = (texts, pattern) => texts.reduce((total, text) => { const match = String(text).match(pattern); return total + (match ? num(match[1]) : 0); }, 0);
// This setup's other supports' lines (src/support-effects.js resolveSupportEffects: full.setupClauseTexts()).
const setupTexts = (full) => (typeof full.setupClauseTexts === "function" ? full.setupClauseTexts() : []);
const SUPPORT_CHANNEL_MAX = /^\+?(\d+) Max Channeled Stacks for the supported skill$/i;
const SUPPORT_PROJECTILES = /^(?:Projectile Quantity of the supported skill \+?(\d+)|\+?(\d+) Projectile Quantity for the supported skill)$/i;
const SUPPORT_AREA = /^([+-]?\d+(?:\.\d+)?)% Skill Area for the supported skill$/i;
const SUPPORT_AREA_ADDITIONAL = /^([+-]?\d+(?:\.\d+)?)% additional Skill Area for the supported skill$/i;
function additionalChannelStacks(full, state) {
  const own = lineValue(setupTexts(full), SUPPORT_CHANNEL_MAX);
  const build = Math.max(0, Number(state.maxChanneledStacksBuild) || 0);
  return { own, build, total: own + build };
}
function projectileQuantityBonus(full, state) {
  const own = setupTexts(full).reduce((total, text) => { const match = String(text).match(SUPPORT_PROJECTILES); return total + (match ? num(match[1] ?? match[2]) : 0); }, 0);
  const build = Number(state.projectileQuantityBuild) || 0;
  return { own, build, total: own + build };
}
function skillAreaState(full, state) {
  const texts = setupTexts(full);
  const sheet = Number(state.skillAreaPercent) || 0;
  const supportIncreased = lineValue(texts, SUPPORT_AREA);
  const additional = texts.flatMap((text) => { const match = String(text).match(SUPPORT_AREA_ADDITIONAL); return match ? [num(match[1])] : []; });
  const increased = sheet + supportIncreased;
  const total = ((1 + increased / 100) * additional.reduce((product, value) => product * (1 + value / 100), 1) - 1) * 100;
  return { sheet, supportIncreased, increased, additional, additionalSum: additional.reduce((a, b) => a + b, 0), total };
}
// Own-buff stacks: at their cap with own buffs built before engaging; else the 20 s window's average of a linear build from 0 at
// `perSecond` stacks per second (provisional).
function ownStacks(cap, perSecond, prebuilt) {
  if (prebuilt) return { stacks: cap, text: `held at ${cap} (own buffs built before engaging)` };
  if (!(perSecond > 0)) return { stacks: cap, text: `held at ${cap} (build rate not measured)` };
  const full = cap / perSecond;
  const average = full >= COLD_WINDOW_SECONDS ? perSecond * COLD_WINDOW_SECONDS / 2 : (cap * COLD_WINDOW_SECONDS - cap * full / 2) / COLD_WINDOW_SECONDS;
  return { stacks: average, text: `own buffs not built before engaging: ${round(perSecond)} stacks/s from 0, ${round(average)} on average over ${COLD_WINDOW_SECONDS} s (provisional)` };
}
const skillGainsFervor = (skillName) => (allSkillEffectsSs13[skillName] || []).some((text) => /Gains Fervor when this skill hits/i.test(String(text)));
function heldFervor(full, state) {
  const own = Number(state.fervorRating) || 0;
  if (own > 0) return { rating: own, text: `the build's Fervor Rating ${round(own)} (src/combat-states.js)` };
  if (skillGainsFervor(full.skillName)) return { rating: FERVOR_MAX_RATING, text: `${full.skillName} "Gains Fervor when this skill hits": the Max Fervor Rating ${FERVOR_MAX_RATING} while it keeps hitting the dummy` };
  return { rating: 0, text: "no Fervor source (the build has no Fervor and the skill gains none)" };
}
const hasComponent = (full, key) => (full.profile?.components || []).some((component) => component.key === key);

/**
 * Settle one batch-4 clause (src/support-effects.js resolveCensusCondition hands every `batch4` clause here).
 * @returns {{ active, appliedValue, conditionText, provisional?, componentParts?, shadowParts?, demolisherConsumedValue?, barragePerWave?, minionSkill?, unmodeled? }}
 */
export function resolveBatch4Condition(clause, full, siblings = [], setupKey = null) {
  const state = full.conditions;
  if (clause.condition === "unmodeledHit") return { active: false, appliedValue: 0, unmodeled: true, conditionText: clause.reason };
  if (!state) return { active: null, appliedValue: 0, conditionText: "condition not resolved (no planner state)" };
  const hits = full.engine === "skill-hit" || full.engine === "scorching-beam";
  const on = (conditionText, extra = {}) => ({ active: true, appliedValue: 0, conditionText, ...extra });
  const off = (conditionText) => ({ active: false, appliedValue: 0, conditionText });
  // Whole-skill value, a hit group's, or the Shadows'.
  const apply = (value, conditionText, extra = {}) => {
    const applied = round(value);
    if (clause.shadow) return on(conditionText, { shadowParts: [{ value: applied }], ...extra });
    if (clause.component) return on(conditionText, { componentParts: [{ component: clause.component, value: applied }], ...extra });
    return on(conditionText, { appliedValue: applied, ...extra });
  };
  const facts = state.critHitsBySetup?.get?.(setupKey) || null;
  const usesRate = facts && Number.isFinite(facts.usesPerSecond) ? facts.usesPerSecond : null;
  const hitsRate = facts && Number.isFinite(facts.hitsPerSecond) ? facts.hitsPerSecond : null;
  const prebuilt = state.prebuiltSelfBuffs !== false;
  const recipe = clause.recipe ? `game recipe ${clause.recipe}` : "game recipe";
  if (clause.component && hits && !hasComponent(full, clause.component)) return off(`${full.skillName || "the supported skill"} has no modeled "${clause.component}" hit group`);
  switch (clause.condition) {
    case "targetElite":
      if (!hits) return off("the bonus is on the skill's hits; the supported skill deals none");
      return dummyTarget.elite ? apply(clause.value, `the training dummy counts as an Elite (a Boss; src/dummy-target.js): +${clause.value}% on the Massive Fang's hits (${recipe})`) : off("the dummy is not an Elite");
    case "frozenTarget": {
      if (!hits) return off("the supported skill deals no hits");
      const rating = Number(state.frostbiteRating) || 0;
      if (rating < 100) return off(`the dummy is not Frozen (Frostbite Rating ${round(rating)} < 100; Freeze needs 100, user-confirmed 2026-10-18)`);
      return apply(clause.value, `the dummy is Frozen (Frostbite Rating ${round(rating)} ≥ 100, user-confirmed 2026-10-18): +${clause.value}% on ${clause.shadow ? "the Shadows' (Phantoms') hits" : `the ${clause.component} hits`} (${recipe})`);
    }
    case "perFrostbiteRating": {
      if (!hits) return off("the supported skill deals no hits");
      const rating = Math.max(0, Number(state.frostbiteRating) || 0);
      const applied = Math.min(clause.cap, clause.value * rating);
      return applied > 0 ? apply(applied, `the dummy's Frostbite Rating ${round(rating)} (src/combat-states.js) × ${clause.value}% = +${round(applied)}% (up to +${clause.cap}%; ${recipe}, on the skill's hits)`) : off("the dummy carries no Frostbite Rating");
    }
    case "numbedConsumed": {
      if (!hits) return off("the supported skill deals no hits");
      if (!(state.enemyAilments || []).includes("Numbed")) return off("the dummy is not Numbed (enemy-ailment model)");
      // Buff 10093 lasts `seconds`; the next one starts on the first hit after the `interval` gate: average gap half a hit interval.
      const uptime = hitsRate == null ? 1 : hitsRate > 0 ? clause.seconds / (clause.interval + 1 / (2 * hitsRate)) : 0;
      const factor = Math.min(1, uptime);
      return factor > 0 ? apply(clause.value * factor, `the dummy is Numbed: one Numbed stack consumed per ${clause.interval} s gate, +${clause.value}% on the skill's hits for ${clause.seconds} s → uptime ${round(factor)}${hitsRate == null ? " (hit rate not measured yet)" : ` (${round(hitsRate)} hits/s: ${clause.seconds} s ÷ (${clause.interval} s + half a hit interval))`}; the consumed stack is not taken off the Numbed model (${recipe}; provisional)`, { provisional: true }) : off("the supported skill does not hit");
    }
    case "ownAreaDebuff":
      if (!hits) return off("the supported skill deals no hits");
      return apply(clause.value, `the skill's own landing area debuffs the dummy (buff 11071, stone affix 884212800), held while the skill is used (best case; ${recipe}; provisional)`, { provisional: true });
    case "onFrostTerra": {
      const permafrost = full.setupSupportNames?.has?.("Ice Lances: Permafrost (Noble)");
      if (!state.frostTerraOnBoard && !permafrost) return off("no Frost Terra under the dummy (no active Frost Terra on the skill board, no Ice Lances: Permafrost on this skill)");
      return apply(clause.value, `the dummy stands on a Frost Terra (${[state.frostTerraOnBoard ? "the board's Frost Terra" : null, permafrost ? "Ice Lances: Permafrost's Lv. 20 Frost Terra every 1.5 s" : null].filter(Boolean).join(" and ")}; best case: the Terra is placed under the dummy; ${recipe}; provisional)`, { provisional: true });
    }
    case "frostTerraStacks": {
      const corrosion = full.setupSupportNames?.has?.("Ice Lances: Ice Corrosion (Magnificent)");
      if (!corrosion) return off("the supported skill has no Frost Terra bonus to stack (Ice Lances: Ice Corrosion is not installed)");
      return on(`the Frost Terra bonus stacks × the Frost Terra Quantity: ${FROST_TERRA_QUANTITY} (Frost Terra's max base Terra quantity, user-confirmed 2026-10-12), so no extra stack (${recipe}; provisional)`, { provisional: true });
    }
    case "atCentre":
      if (!hits) return off("the supported skill deals no hits");
      return apply(clause.value, `the dummy at the centre of the skill's area (best case): its full +${clause.value}% (attr 5901 Center Damage Bonus, ${recipe}; read on the skill's hits: provisional)`, { provisional: true });
    case "withinOwnTerra": {
      if (state.nearTarget === false) return off(`standing ${DISTANT_STANDING_METERS} m away (Distance group: Distant): read as outside the skill's Terra under the dummy`);
      const held = ownStacks(clause.cap, 1 / clause.every, prebuilt);
      return apply(clause.value * held.stacks, `standing inside the skill's Terra on the dummy (Distance group: Nearby, best case): one stack per ${clause.every} s, ${held.text}: +${clause.value}% × ${round(held.stacks)} (attr 5902 on the skill's damage over time; ${recipe}; provisional)`, { provisional: true });
    }
    case "projectilesFlying":
      if (!hits) return off("the supported skill deals no hits");
      return apply(clause.value, `the projectiles hit the dummy while flying (best case: the share of hits landing while they hover at the end of their flight is not published; ${recipe}; provisional)`, { provisional: true });
    case "eliteWhileChanneling": {
      if (!dummyTarget.elite) return off("the dummy is not an Elite");
      if (!full.channeled && !full.tags?.has?.("Channeled")) return off("the supported skill is not channeled");
      // One Elite: one stack per `interval` against it, each lasting `seconds`.
      const stacks = Math.min(clause.cap, Math.max(1, clause.seconds / clause.interval));
      return apply(clause.value * stacks, `one Elite (the training dummy) touched while channeling: one stack per ${clause.interval} s interval, each ${clause.seconds} s, so ${round(stacks)} held (moving 2 m away to refresh the interval sooner is not modeled; ${recipe}; provisional)`, { provisional: true });
    }
    case "fervorStacks": {
      const fervor = heldFervor(full, state);
      if (fervor.rating < clause.need) return off(`${fervor.text}: below ${clause.need}`);
      const held = ownStacks(clause.cap, clause.perUse ? usesRate : 1 / clause.every, prebuilt);
      return apply(clause.value * held.stacks, `${fervor.text} ≥ ${clause.need}: ${clause.perUse ? "one stack per use" : `one stack per ${clause.every} s`}, ${held.text}: +${clause.value}% × ${round(held.stacks)} (${recipe})`, { provisional: !prebuilt || fervor.rating === FERVOR_MAX_RATING && !(Number(state.fervorRating) > 0) });
    }
    case "steepStrikeFervor":
      return apply(clause.value, `on the Steep Strike's hits (${recipe}: the cast that launches a Steep Strike takes it; the recipe has no Fervor gate); the ${clause.consumed} Fervor Rating each Steep Strike consumes is not taken off the held Rating (provisional)`, { provisional: true });
    case "finishersRecently": {
      if (!full.combo) return off("the supported skill has no modeled Combo cycle");
      const stacks = usesRate == null ? clause.cap : Math.min(clause.cap, usesRate * RECENTLY_SECONDS);
      const applied = ((1 + clause.value / 100) ** stacks - 1) * 100;
      return stacks > 0 ? apply(applied, `${usesRate == null ? "Finisher rate not measured yet: held at the cap" : `one Finisher per cycle: ${round(usesRate)} cycles/s × ${RECENTLY_SECONDS} s`} = ${round(stacks)} stacks (up to ${clause.cap}): (1 + ${clause.value}%)^${round(stacks)} (multiplies) on the Finisher's hits (${recipe}; provisional)`, { provisional: true }) : off("no Combo Finisher cast");
    }
    case "additionalChannelStacks": {
      const stacks = additionalChannelStacks(full, state);
      const counted = Math.min(clause.cap, stacks.total);
      return counted > 0 ? apply(clause.value * counted, `+${stacks.total} additional Max Channeled Stacks (this skill's supports ${stacks.own}, the build's lines ${stacks.build}), counted up to ${clause.cap}: +${clause.value}% × ${round(counted)}, one term (${recipe}); the channel the support turns the skill into is not modeled (its cadence stays the cast model's; provisional)`, { provisional: true }) : off("no additional Max Channeled Stacks (no \"+N Max Channeled Stacks\" line on the skill or the build)");
    }
    case "perProjectileQuantity": {
      const quantity = projectileQuantityBonus(full, state);
      return quantity.total > 0 ? apply(clause.value * quantity.total, `+${quantity.total} Projectile Quantity (this skill's supports ${quantity.own}, the build's lines ${quantity.build}; the skill's own "+N" text is not counted, as the Hound's Fangs reading): +${clause.value}% × ${quantity.total} (${recipe}; provisional)`, { provisional: true }) : off("no Projectile Quantity bonus on the skill or the build");
    }
    case "skillAreaAtLeast": {
      const area = skillAreaState(full, state);
      const text = `Skill Area bonus ${round(area.total)}% ((1 + ${round(area.increased)}% increased: stat sheet ${round(area.sheet)}% + this skill's supports ${round(area.supportIncreased)}%)${area.additional.length ? ` × ${area.additional.map((value) => `(1 + ${value}%)`).join(" × ")}` : ""} − 1)`;
      return area.total >= clause.threshold ? apply(clause.value, `${text} ≥ ${clause.threshold}% (${recipe}; build-wide additional Skill Area lines are not read: provisional)`, { provisional: true }) : off(`${text} < ${clause.threshold}%`);
    }
    case "skillAreaToSteep": {
      const area = skillAreaState(full, state);
      const bonus = area.increased + area.additionalSum;
      return bonus > 0 ? apply(clause.value / 100 * bonus, `${clause.value}% × (${round(area.increased)}% increased Skill Area (stat sheet ${round(area.sheet)}% + this skill's supports ${round(area.supportIncreased)}%) + ${round(area.additionalSum)}% additional) = +${round(clause.value / 100 * bonus)}% on the Steep Strike's hits (${recipe}; provisional)`, { provisional: true }) : off("no Skill Area bonus on the skill or the build");
    }
    case "linksBelowMax": {
      const stacks = additionalChannelStacks(full, state);
      const maxLinks = MIND_CONTROL_BASE_LINKS + BASE_CHANNEL_STACKS + stacks.total;
      const below = Math.max(0, maxLinks - 1);
      return below > 0 ? apply(clause.value * below, `one link (the training dummy) of ${maxLinks} maximum (${MIND_CONTROL_BASE_LINKS} + 1 per channeled stack at the full channel of ${BASE_CHANNEL_STACKS + stacks.total}; skill text): +${clause.value}% × ${below} (${recipe}; provisional)`, { provisional: true }) : off("the maximum links are all used");
    }
    case "statAtLeast": {
      const value = Math.round(Number(state[clause.stat]) || 0);
      return value >= clause.need ? apply(clause.value, `${value} Dexterity (stat sheet) ≥ ${clause.need} (${recipe})`) : off(`${value} Dexterity (stat sheet) < ${clause.need}`);
    }
    case "manaSealed": {
      const maxMana = Math.max(0, Number(state.maxMana) || 0);
      const sealedPercent = Math.min(100, Math.max(0, 100 - (Number(state.manaRemainingPercent ?? 100))) + clause.ownSeal);
      const amount = maxMana * sealedPercent / 100;
      const steps = Math.floor(amount / clause.every + 1e-9);
      const applied = Math.min(clause.cap, clause.value * steps);
      return applied > 0 ? apply(applied, `${round(sealedPercent)}% of ${round(maxMana)} Max Mana sealed (the Aura seals + this support's own ${clause.ownSeal}%) = ${round(amount)} Mana ÷ ${clause.every} = ${steps} × ${clause.value}% = +${round(applied)}% (up to +${clause.cap}%; ${recipe}; provisional: whole steps)`, { provisional: true }) : off(`${round(amount)} Mana sealed, under ${clause.every}`);
    }
    case "lifeLostPer": {
      const lost = state.life === "low" ? Math.max(0, Number(state.lifeLostPercent) || 0) : 0;
      const applied = Math.min(clause.cap, clause.value * lost / clause.every);
      const why = state.lifeLostReason || state.lifeReason || "Full Life";
      return applied > 0 ? apply(applied, `${round(lost)}% Life lost (${why}) ÷ ${clause.every} × ${clause.value}% = +${round(applied)}% (up to +${clause.cap}%; ${recipe})`) : off(`no Life lost (${why})`);
    }
    case "usesRecently": {
      const stacks = usesRate == null ? clause.cap : Math.min(clause.cap, usesRate * clause.seconds);
      return stacks > 0 ? apply(clause.value * stacks, `${usesRate == null ? "use rate not measured yet: held at the cap" : `${round(usesRate)} uses/s × ${clause.seconds} s`} = ${round(stacks)} stacks (up to ${clause.cap}): +${clause.value}% × ${round(stacks)} (${recipe}${clause.hitOnly ? "; on the skill's hits" : ""}; provisional)`, { provisional: true }) : off("the supported skill is not used");
    }
    case "otherSkillHitsRecently": {
      if (!hits) return off("the supported skill deals no hits");
      const byName = state.hitsBySkill || null;
      if (!byName) return { active: null, appliedValue: 0, conditionText: `${clause.skill}'s hits per second are not measured yet (the planner's hit pass)` };
      const rate = Number(byName[clause.skill]) || 0;
      const stacks = Math.min(clause.cap, rate * clause.seconds);
      return stacks > 0 ? apply(clause.value * stacks, `${clause.skill}: ${round(rate)} hits/s on the dummy × ${clause.seconds} s = ${round(stacks)} stacks (up to ${clause.cap}): +${clause.value}% × ${round(stacks)} on the skill's hits (${recipe}; provisional)`, { provisional: true }) : off(`${clause.skill} lands no modeled hits on the dummy`);
    }
    case "ownHitStacks": {
      if (!hits) return off("the supported skill deals no hits");
      const stacks = hitsRate == null ? clause.cap : Math.min(clause.cap, hitsRate * clause.seconds);
      return stacks > 0 ? apply(clause.value * stacks, `${hitsRate == null ? "hit rate not measured yet: held at the cap" : `${round(hitsRate)} hits/s × ${clause.seconds} s`} = ${round(stacks)} debuff stacks (up to ${clause.cap}; every hit of the skill counted as a Beam hit): +${clause.value}% × ${round(stacks)} (${recipe}; provisional)`, { provisional: true }) : off("the supported skill does not hit");
    }
    case "component":
      return apply(clause.value, `on the "${clause.component}" hit group (${recipe})`);
    case "demolisherConsumed":
      if (!full.profile?.demolisher) return off("the supported skill has no modeled Demolisher Charge");
      return on(`on uses that consume a Demolisher Charge (the hit model's Demolisher share; ${recipe}, the rule of game affix 175116)`, { demolisherConsumedValue: clause.value });
    case "barrageWithWeapon": {
      const held = state.weaponTypes || [];
      const allowed = WEAPON_WORDS[clause.weapon] || [];
      if (!held.some((type) => allowed.includes(type))) return off(`no ${clause.weapon} held (${allowed.join(" / ")})`);
      if (!full.tags?.has?.("Barrage")) return off("the supported skill is not a Barrage skill");
      return on(`holding a ${clause.weapon}: +${clause.value}% damage increase per Barrage wave (the Barrage wave reading, src/skill-hit-model.js barrageWaveState; ${recipe})`, { barragePerWave: clause.value, provisional: true });
    }
    // Minion skills: the summoner's Command (src/minion-cores.js commandState), on the named Minion skill's hits.
    case "minionCommandAtLeast": {
      const points = Math.max(0, Number(state.commandPoints) || 0);
      return points >= clause.need ? on(`the summoner's Command ${round(points)} ≥ ${clause.need} (src/minion-cores.js commandState: full Command, switch "fullCommand"): +${clause.value}% on ${clause.minionSkill}'s hits (${recipe})`, { appliedValue: clause.value, minionSkill: clause.minionSkill }) : off(points ? `the summoner's Command ${round(points)} < ${clause.need}` : (state.commandReason || "no Command"));
    }
    case "minionCommandEveryCasts": {
      const points = Math.max(0, Number(state.commandPoints) || 0);
      if (!points) return off(state.commandReason || "no Command");
      const counted = Math.min(clause.cap, points / clause.perCommand);
      const applied = clause.value * counted / clause.everyCasts;
      return on(`the summoner's Command ${round(points)} ÷ ${clause.perCommand} = ${round(counted)} (up to ${clause.cap}) × ${clause.value}% on every ${clause.everyCasts}th ${clause.minionSkill} cast, averaged over its casts: +${round(applied)}% (${recipe}; provisional)`, { appliedValue: round(applied), minionSkill: clause.minionSkill, provisional: true });
    }
    default: return { active: null, appliedValue: 0, conditionText: "unknown condition" };
  }
}
