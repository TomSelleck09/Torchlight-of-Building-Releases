import { minionSkillDamageSs13 } from "./data/skills/minion-skill-damage-ss13.generated.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { refdataSkillCatalogSs13 } from "./data/catalogs/refdata-ss13.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";

// Minion sources (2026-10-11): which Minion each "% of Base Damage" skill belongs to, what that Minion does on a single
// training dummy, and the summon-skill text that shapes it. One source per Minion type; a catalog setup of any of the
// Minion's skills activates the whole Minion (in game the Module / Summon skill is one stone; the reference data catalog lists the
// Minion's skills as separate "main" entries sharing the module icon). Since 2026-10-21 (user decision) only the summon is a
// board skill, as in game: every Minion's own skills are excluded from the skill picker and a saved setup of one migrates to
// its summon (src/minion-skill-owners.js; ownership from the game files, src/data/skills/minion-skill-owners-ss13.generated.js,
// which also supplies the module summons' catalog entries; tests/minion-skill-owners.test.js checks the lists below against it).
//
// Sourced:
// - Skill rows: src/data/skills/minion-skill-damage-ss13.generated.js (config_skill_damage: percent of Base Damage per
//   level, row kind hit / persistent, typed entry's damage type; research/base-damage-skills-2026-10-11.md).
// - Timing (chunk 10, 2026-11-01; research/minions-chunk10-2026-11-01.md §2): src/data/skills/skill-timing-ss13.generated.js, through the game's own link:
//   summon stone → config_skill_stone_summon_npc_index → the NPC's stone list (config_npc) → each stone's first Split. The old links matched Splits by
//   icon: 14 Minion skills read the summon's 0.8 s and 4 s, or a sibling's. `timingFallback` is the reference data figure, used only where no stone links.
// - Minion count: the summon skill's reference data text ("This skill summons up to N Minions (LvX:N)"); Module summons carry a
//   "{%s:1}" placeholder in the game text, so the count below is the user-supplied one (flagged).
// - Conversions: reference data summon text (Grim Phantom, Thunder Magus, Erosion Magus); Huge Ember Automaton 100% Physical →
//   Fire (user-confirmed module text 2026-10-11). Dwarven Automaton, Ratlin Stormer Captain (Fire), Lean Phantom (Erosion) and
//   Aember Winged Beast (Cold) carry the same reference data SS14 module line (game recipes 3729581 / 8643389 / 8751869; census batch 6);
//   Nether Bulwark and Eumbra Corroder, whose Physical rows carry an elemental catalog tag, are read the same way, provisionally.
// - Special-skill self buffs: reference data skill text (Searing Crush "+50% additional damage dealt for 5 s when casting";
//   High Court Covenant "+300 Critical Strike Rating and +75% Critical Strike Damage for 4 s").
// - Module tooltip (user, 2026-10-11): "Cast Speed 1.25" read as the summon cast time, "Cooldown 4.0 sec" at Lv.1 and Lv.20 on every module.
//   Game files (chunk 10): all 20 module summon Splits read 0.8 s (Cast Speed) with cooldown 4, so the 4.0 s is the summon's own cooldown, settled; the
//   Minions' skills have their own (Searing Crush 10 s, High Court Covenant 8 s, Tailsweep 4 s). 1.25 is then casts per second, 1 ÷ 0.8: conflict C-M1 in
//   the research note, not changed here (the user's reading of the tooltip).
//
// Use pattern (game files, chunk 10): the behaviour trees. A module or Synthetic Troop (AIEditor subtree 666170, CastSkills, after 488927's
// SetSkillPrioritiesByCfgOrder) casts the first ready stone in its NPC list; a Spirit Magus (subtree 893044) walks [Empower, 999, Ultimate] with 999 the
// Enhanced roll on field 2012070 else the Base Skill, and in Full Bloom (state 4015290) 999 moves behind the Ultimate. Both wait only on the use before.
// Hits land at the end of each use; the Minion is in range the whole time (the dummy stands still).

const catalog = new Map(refdataSkillCatalogSs13.map((entry) => [entry.name, entry]));
const effectsOf = (name) => (allSkillEffectsSs13[name] || []).join("\n");

// "This skill summons up to 2 Minions (Lv1:2) (Lv3:2) (Lv4:3) (Lv17:3) (Lv18:4) (Lv25:4) (Lv26:4) (Lv34:4)"
function countByLevelFromText(name) {
  const text = effectsOf(name);
  const line = text.split("\n").find((part) => /summons up to \d+ Minions?/i.test(part));
  if (!line) return null;
  const steps = [...line.matchAll(/\(Lv(\d+):(\d+)\)/g)].map((match) => [Number(match[1]), Number(match[2])]).sort((a, b) => a[0] - b[0]);
  const base = Number(line.match(/summons up to (\d+)/i)[1]);
  return { source: `Reference data ${name}: "${line.trim()}"`, at: (level) => steps.reduce((count, [at, value]) => level >= at ? value : count, base) };
}

const conv = (from, to, source) => ({ from, to, percent: 100, source });
const text = (note) => ({ basis: "text", note });
const provisional = (note) => ({ basis: "provisional", note });

// A hit skill of the Minion: `hitsPerUse` on a single dummy (1 unless the text says the extra hits can land on the same
// enemy), `role` basic (no cooldown; filler) or special (cooldown-bound; used when ready).
const skill = (name, role, extra = {}) => ({ name, role, hitsPerUse: 1, ...text("one hit per use on the single dummy"), ...extra });

const MODULE_SUMMON = { summonCastSeconds: 1.25, summonCastSource: "module tooltip Cast Speed 1.25 (user, 2026-10-11)", summonCooldownSeconds: 4, summonCooldownSource: "the summon's own cooldown: 4 s on all 20 module summon Splits, the tooltip's Cooldown 4.0" };
// Module Minions (user-supplied 2026-10-21, Google AI Mode answer, not an in-game test): one per cast, up to 4 by default. The reference data
// SS14 Module pages agree ("This skill summons up to 4 Minions"); the game text's Max Minion Quantity is a placeholder. The count
// itself (lines that raise or cap it, the cold-start ramp, the "troopMaxMinions" switch) is resolved in src/minion-damage-model.js,
// with the same rules for the Synthetic Troop summons (user decision 2026-10-21).
const MODULE_COUNT = { source: "up to 4 Minions, one per cast (user-supplied 2026-10-21, Google AI Mode answer, not an in-game test; reference data SS14 Module pages: \"This skill summons up to 4 Minions\")", at: () => 4, max: 4, assumed: true };
const SPIRIT_COUNT = { source: "Reference data: \"This skill summons up to 1 Minions (Lv1:1)\"", at: () => 1 };

const magusTiming = (name, cast, speedType, cooldown = 0) => ({ timingFallback: { useTime: cast, speedType, cooldown, source: `Reference data ${name} cast speed ${cast} s (the linked Split is the summon's)${cooldown ? `; ${cooldown} s cooldown from its game Split (stones xx03: Frost 455088, Fire 887688, Thunder 186574, Rock 507275, Erosion 225000)` : ""}` } });
const EMPOWER_COOLDOWN = 10; // Split header `cd` of all five Empower stones (2026-10-31; research/hero-iris-chunk1-2026-10-31.md F1)
const EMPOWER_NOTE = (name, effect) => provisional(`${name} is the Magus's Empower Skill: cast whenever its ${EMPOWER_COOLDOWN} s cooldown is ready (game Split and the Magus's behaviour tree), granting the Magus Euphoria for 6 s (${effect})`);
const ENHANCED_NOTE = (name, extra = "") => provisional(`${name} is the Enhanced Skill: it replaces a Base Skill cast at the Enhanced-skill chance (manual rule 1001012024; Stage 2 +30%)${extra}`);
const ULTIMATE_NOTE = (name) => text(`${name} is the Ultimate: only cast in Full Bloom (manual rule 1001012027), so it is shown per hit and left out of the cycle`);
function magus(key, minion, summon, speedType, conversion, skills, notes = []) {
  return { key, minion, summon, family: "spirit-magus", count: SPIRIT_COUNT, summonCastSeconds: 1, summonCastSource: "summon Split use time 1 s (fixed)", skills, conversion: conversion ? [conversion] : [],
    notes: [`${summon}: the Base, Enhanced and Empower skills are in the cycle; Nourishment (Iris – Growing Breeze) is read from the hero trait text when present; the Ultimate (Full Bloom) is not in the cycle.`, ...notes] };
}
const SPIRIT_MAGI = [
  magus("fire-magus", "Fire Magus", "Summon Fire Magus", "cast-speed", null, [
    skill("Blazing Dance", "basic", magusTiming("Blazing Dance", 0.8, "cast-speed")),
    skill("Blazing Incineration", "enhanced", { ...ENHANCED_NOTE("Blazing Incineration"), ...magusTiming("Blazing Incineration", 0.8, "cast-speed"), stageBonus: (stage) => stage >= 3 ? { additionalPercent: 30, text: "+30% additional damage for this skill at Stage 3 or higher" } : null }),
    skill("Blazing Spin", "special", { ...EMPOWER_NOTE("Blazing Spin", "+435% Critical Strike Rating; its own Persistent Fire row ticks every second for the 6 s"), ...magusTiming("Blazing Spin", 0.6, "cast-speed", EMPOWER_COOLDOWN), persistentSeconds: 6, selfBuff: { critRatingPercent: 435, durationSeconds: 6, source: "Blazing Spin: +435% Critical Strike Rating while the skill lasts (6 s)" } }),
    skill("Molten Rising", "ultimate", { ...ULTIMATE_NOTE("Molten Rising"), ...magusTiming("Molten Rising", 1.5, "cast-speed") })
  ], ["Blazing Spin: the Stage 4 \"+14% Critical Strike Damage per hit on an affected enemy, up to 15 stacks for 2 s\" is not modeled.", "Blazing Incineration: the \"+10% additional Damage if the skill has dealt a Critical Strike recently\" and the Stage 3 Skill Area stacks are not applied."]),
  magus("frost-magus", "Frost Magus", "Summon Frost Magus", "cast-speed", null, [
    skill("Glacier Ripples", "basic", magusTiming("Glacier Ripples", 0.8, "cast-speed")),
    skill("Permafrost Cast", "enhanced", { ...ENHANCED_NOTE("Permafrost Cast"), ...magusTiming("Permafrost Cast", 0.8, "cast-speed") }),
    skill("Frost Release", "special", { ...EMPOWER_NOTE("Frost Release", "the next 5 uses of other skills deal +81% additional Hit Damage, −15 points per cast: 81 / 66 / 51 / 36 / 21; its own Cold hit lands on cast"), ...magusTiming("Frost Release", 0.6, "cast-speed", EMPOWER_COOLDOWN), selfBuff: { nextUses: [81, 66, 51, 36, 21], durationSeconds: 6, source: "Frost Release: the next 5 uses of other non-Channeled Skills deal +81% additional Hit Damage while the skill lasts (6 s), −15% to this bonus after casting another skill (read as percentage points)" } }),
    skill("Ice Earthshaker", "ultimate", { ...ULTIMATE_NOTE("Ice Earthshaker"), ...magusTiming("Ice Earthshaker", 1.5, "cast-speed") })
  ], ["Permafrost Cast / Ice Earthshaker: the Frostbite they inflict and the Stage 3 \"+1% additional damage per 3 Frostbite Rating\" are not modeled (Minion-applied ailments are open).",
    "Permafrost Cast / Ice Earthshaker \"Inflicts Frostbite when this skill deals Hit Cold Damage\": not modeled: the Frostbite Rating a Minion hit inflicts is unpublished, and the dummy's ailment states settle before the Minion pass (open question minion-batch6-unread).",
    "Frost Release \"+15% Cold Resistance Penetration while this skill lasts\": not applied: Frost Release's game buff record (config_char_buff 10520) holds only the next-use affix 32117, so the reference data line has no game value (open question minion-batch6-unread)."]),
  magus("thunder-magus", "Thunder Magus", "Summon Thunder Magus", "attack-speed", conv("Physical", "Lightning", "Summon Thunder Magus: Converts 100% of Spirit Magi's Physical Damage to Lightning Damage"), [
    skill("Lightning Star", "basic", magusTiming("Lightning Star", 0.8, "attack-speed")),
    skill("Thunderlight Arrow", "enhanced", { ...ENHANCED_NOTE("Thunderlight Arrow", "; at Stage 3+ its extra projectile can hit the same enemy with a 70% Shotgun falloff (1.7 hits) and adds +5% additional damage"), ...magusTiming("Thunderlight Arrow", 0.8, "attack-speed"), stageBonus: (stage) => stage >= 3 ? { additionalPercent: 5, hitsPerUse: 1 + 0.7, text: "+1 Base Projectile Quantity at Stage 3 or higher: +5% additional damage per +1 Projectile Quantity, and the projectiles can hit the same enemy (70% Shotgun falloff → 1.7 hits per cast)" } : null }),
    // Chain of Lightning (2026-10-21, user decision to model it): the game gives the Empower a damage row (config_skill_damage
    // group 703, Physical → Lightning by the summon, 126% at Lv.20; tooltip line skill_des|des_config|19142 "Chain of Lightning:
    // Deals … Damage equal to X of Base Damage"; stone 1916: Minion Skill, Empower, Chain). reference data's card omits it. No text gives
    // its cadence: one Chain of Lightning hit per cast is read, landing on cast like Frost Release's own hit (provisional; open
    // question "thunder-magus-chain-of-lightning").
    skill("Thundercloud Surge", "special", { ...EMPOWER_NOTE("Thundercloud Surge", "+35% additional Attack Speed; +25% additional damage at Stage 4 or higher; one Chain of Lightning hit per cast (game row 703; cadence provisional)"), ...magusTiming("Thundercloud Surge", 0.6, "attack-speed", EMPOWER_COOLDOWN), selfBuff: (stage) => ({ attackSpeedAdditionalPercent: 35, additionalPercent: stage >= 4 ? 25 : 0, durationSeconds: 6, source: "Thundercloud Surge: +35% additional Attack Speed while the skill lasts (6 s); at Stage 4 or higher +25% additional damage" }) }),
    skill("Lightning Surge", "ultimate", { ...ULTIMATE_NOTE("Lightning Surge"), ...magusTiming("Lightning Surge", 1.5, "attack-speed") })
  ]),
  magus("rock-magus", "Rock Magus", "Summon Rock Magus", "attack-speed", null, [
    skill("Shattered Stone", "basic", magusTiming("Shattered Stone", 0.8, "attack-speed")),
    skill("Rock Blast", "enhanced", { ...ENHANCED_NOTE("Rock Blast", "; every use launches 3 strikes, all read as landing on the single dummy"), ...magusTiming("Rock Blast", 0.4, "attack-speed"), hitsPerUse: 3, stageBonus: (stage) => stage >= 3 ? { additionalPercent: 3.5, text: "+3.5% additional damage for each enemy within 8 m at Stage 3 or higher (one enemy: the dummy)" } : null }),
    skill("Gold Rush", "special", { ...EMPOWER_NOTE("Gold Rush", "+6% additional damage per enemy affected (the dummy); at Stage 4 or higher +120% additional Empower Effect with a Boss within 10 m, the dummy being a Boss"), ...magusTiming("Gold Rush", 0.6, "attack-speed", EMPOWER_COOLDOWN), buffOnly: true, selfBuff: (stage) => ({ additionalPercent: 6 * (stage >= 4 ? 2.2 : 1), durationSeconds: 6, source: "Gold Rush: +6% additional damage for each enemy affected (6 s); Stage 4+: +120% additional Empower Effect with a boss within 10 m" }) }),
    skill("Towering Mountains", "ultimate", { ...ULTIMATE_NOTE("Towering Mountains"), ...magusTiming("Towering Mountains", 1.5, "attack-speed") })
  ], ["Gold Rush: the build's own Empower Effect lines are not applied to the Magus's Euphoria."]),
  magus("erosion-magus", "Erosion Magus", "Summon Erosion Magus", "cast-speed", conv("Physical", "Erosion", "Summon Erosion Magus: Converts 100% of Physical Damage to Erosion Damage for Spirit Magi"), [
    skill("Scattered Mud", "basic", magusTiming("Scattered Mud", 0.8, "cast-speed")),
    skill("Bleak Grass", "enhanced", { ...ENHANCED_NOTE("Bleak Grass", "; the Spike and its Spike Explosion (both 162% of Base Damage in the reference data, one game row) are read as two hits per cast"), ...magusTiming("Bleak Grass", 0.8, "cast-speed"), hitsPerUse: 2 }),
    skill("Withering Payback", "special", { ...EMPOWER_NOTE("Withering Payback", "+20% additional Erosion Damage; its damage-taken trigger never fires on the dummy"), ...magusTiming("Withering Payback", 0.6, "cast-speed", EMPOWER_COOLDOWN), buffOnly: true, selfBuff: { additionalPercent: 20, types: ["Erosion"], durationSeconds: 6, source: "Withering Payback: +20% additional Erosion Damage while the skill lasts (6 s)" } }),
    skill("World of Thorns", "ultimate", { ...ULTIMATE_NOTE("World of Thorns"), ...magusTiming("World of Thorns", 1.5, "cast-speed") })
  ], ["Bleak Grass: the Stage 3 \"+4% additional Erosion Damage taken\" stacks and the Stage 4 extra spike are not applied."])
];

const DEFINITIONS = [
  // --- Modularization (Synthetic Troop) modules: 20 ---
  { key: "goblin-priest", minion: "Goblin Priest", summon: "Module: Goblin Priest", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Firebird", "special", provisional("Reference data: the projectiles return after max range; one hit per cast is counted: its 5 fan projectiles are siblings with bHitBrother 0 (Split 884952; the return pass and the Cold-as-Fire stacks are not modeled)")), skill("Frostclaw", "basic")],
    conversion: [{ from: "Cold", to: "Fire", percent: 99, source: "Frostclaw: Converts 99% of the skill's Cold Damage to Fire Damage", skills: ["Frostclaw"] }] },
  { key: "trog-2nd-general", minion: "Trog 2nd General", summon: "Module: Trog 2nd General", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Earthshatter", "basic")] },
  { key: "nether-bulwark", minion: "Nether Bulwark", summon: "Module: Nether Bulwark", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Aember Rain", "basic", provisional("one hit per cast is counted at row 1011 (the reference data shows Aimed Shot's text and has no page for this module; game group 671 is Aimed Shot's row of Summon Spider Tank, linked here only through that reference data text, so it is not this Minion's damage). Its Split 926200 holds monster rows 108120009 / 10 and no Split holds row 1011: open question minion-module-monster-rows"))],
    conversion: [conv("Physical", "Erosion", "catalog tags Erosion for a Physical game row (provisional reading of the module's conversion)")] },
  { key: "dwarven-automaton", minion: "Dwarven Automaton", summon: "Module: Dwarven Automaton", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Molten Barrage", "special"), skill("All-Out Volley", "basic", provisional("Reference data: a volley; one projectile hit per cast is counted on the single dummy (Split 639224: 3 projectiles, bHitBrother 0)"))],
    conversion: [conv("Physical", "Fire", "SS14 Module: Dwarven Automaton \"Converts 100% of Physical Damage dealt by Minions summoned by this skill to Fire Damage\" (game recipe 3729581; census batch 6, was read from the catalog's Fire tag)")] },
  { key: "trog-mage", minion: "Trog Mage", summon: "Module: Trog Mage", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Rockfall", "basic", provisional("Reference data: a Barrage; one rock per cast is counted on the single dummy"))] },
  { key: "goblin-priest-of-elements", minion: "Goblin Priest of Elements", summon: "Module: Goblin Priest of Elements", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Thunderfall", "basic", { ...provisional("Split 163136: 6 repeats 2.5 m apart along a line, 3 bolts of 2 m radius each, can hit the same enemy at a 95% Shotgun coefficient (hit rule 5). The dummy between two repeats takes 6 bolts: 1 + 0.95 × 5 = 5.75 (best case, open question minion-hit-counts)"), hitsPerUse: 1 + 0.95 * 5 })] },
  { key: "medium-ember-automaton", minion: "Medium Ember Automaton", summon: "Module: Medium Ember Automaton", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Kinetic Thrust", "basic"), skill("Groundslam", "special")] },
  { key: "huge-ember-automaton", minion: "Huge Ember Automaton", summon: "Module: Huge Ember Automaton", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [
      skill("Overstrike", "basic", text("game text: attacks a square area in front, one hit per use (Split 163968: 0.7 s, attack-speed type)")),
      skill("Searing Crush", "special", { ...text("game text: charges forward dealing damage to enemies in the path (Split 164416: one bump-attack damage event, 2.4 s use, 10 s cooldown)"), selfBuff: { additionalPercent: 50, durationSeconds: 5, source: "Searing Crush: gains a buff when casting: +50% additional damage dealt for 5 s (Chinese line, 2026-10-11)" } })
    ],
    conversion: [conv("Physical", "Fire", "module text (user-confirmed 2026-10-11): Module: Huge Ember Automaton \"Converts 100% of Physical Damage dealt by Minions summoned by this skill to Fire Damage\" (game recipe 3729581)")] },
  { key: "ent-great-elder", minion: "Ent Great Elder", summon: "Module: Ent Great Elder", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Sweep", "basic"), skill("Rootsurge", "special")] },
  { key: "ratlin-stormer-captain", minion: "Ratlin Stormer Captain", summon: "Module: Ratlin Stormer Captain", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Blitz Strike", "special", { selfBuff: { nextUses: [100], durationSeconds: 999, source: "Blitz Strike: +100% additional damage for the next Burst Hammer cast after casting this skill (Blitz Strike has the 8 s cooldown, Burst Hammer is the filler: Split 567472, Split 734152)" } }), skill("Burst Hammer", "basic", { ...provisional("Reference data: the pummel and explosion can hit the same enemy (64% Shotgun falloff) → 1.64 hits per cast (Split 734152: 3 repeats 4 m apart, 3 m radius: two reach one dummy)"), hitsPerUse: 1.64 })],
    conversion: [conv("Physical", "Fire", "SS14 Module: Ratlin Stormer Captain \"Converts 100% of Physical Damage dealt by Minions summoned by this skill to Fire Damage\" (game recipe 3729581; census batch 6, was read from the catalog's Fire tag)")] },
  { key: "chief-machinist", minion: "Chief Machinist", summon: "Module: Chief Machinist", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Firebomb", "special", provisional("game text: a bomb-throwing Drone attacks many circular areas; one bomb hit per cast is counted on the single dummy (Split 982112: 3 bombs, bHitBrother 0)")), skill("Pyromania", "basic", { ...text("game text: a Flame Terra in a square area; Persistent damage per second while the dummy stands in it; 3 s per cast (Split 559344's buff area)"), persistentSeconds: 3 })] },
  { key: "lean-phantom", minion: "Lean Phantom", summon: "Module: Lean Phantom", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Flickering Shadow", "basic"), skill("Sin of the Fallen", "special")],
    conversion: [conv("Physical", "Erosion", "SS14 Module: Lean Phantom \"Converts 100% of Physical Damage dealt by Minions summoned by this skill to Erosion Damage\" (game recipe 8643389; census batch 6, was read from the catalog's Erosion tag)")] },
  { key: "god-of-swords", minion: "God of Swords", summon: "Module: God of Swords", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Blade of Glory", "basic"), skill("High Court Covenant", "special", { selfBuff: { critRating: 300, critDamagePercent: 75, durationSeconds: 4, source: "High Court Covenant: gains a buff when casting: +300 Critical Strike Rating and +75% Critical Strike Damage for 4 s" } })] },
  { key: "tyrant", minion: "Tyrant", summon: "Module: Tyrant", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Ravaging Slash", "basic")] },
  { key: "ichi-storm", minion: "Ichi Storm", summon: "Module: Ichi Storm", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Auric Shot", "basic")] },
  { key: "sand-giant", minion: "Sand Giant", summon: "Module: Sand Giant", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Gravelshot", "basic")] },
  { key: "einherjar-elder-sage", minion: "Einherjar Elder Sage", summon: "Module: Einherjar Elder Sage", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Javelin of Judgment", "basic"), skill("Divine Judgment", "special", provisional("Reference data: Lucky Damage and +60% additional Max Damage for 4 s after casting are not modeled"))] },
  { key: "aember-winged-beast", minion: "Aember Winged Beast", summon: "Module: Aember Winged Beast", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Tailsweep", "special"), skill("Spikeburst", "basic", { ...provisional("Split 960088: 5 projectiles, bHitBrother 1, Shotgun coefficient 64% (reference data too). A fan lands ceil(5 ÷ 2) = 3 close: 1 + 0.64 × 2 = 2.28 (the Shotgun rule, open question minion-hit-counts)"), hitsPerUse: 1 + 0.64 * 2 })],
    conversion: [conv("Physical", "Cold", "SS14 Module: Aember Winged Beast \"Converts 100% of Physical Damage dealt by Minions summoned by this skill to Cold Damage\" (game recipe 8751869; census batch 6, was read from the catalog's Cold tag)")] },
  { key: "punisher", minion: "Punisher", summon: "Module: Punisher", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Twinstrike", "basic", { ...text("two strikes per use: Split 777128's reaction_attack2, 0.1 s after the first, with bHitParent 1"), hitsPerUse: 2 }), skill("Impaling Thrust", "special")] },
  { key: "eumbra-corroder", minion: "Eumbra Corroder", summon: "Module: Eumbra Corroder", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Undercurrent", "basic", provisional("The reference data shows Aimed Shot's text for Undercurrent; one hit per cast is counted (its own game row 1181; game group 671 is Aimed Shot's row of Summon Spider Tank, linked here only through that reference data text, so it is not this Minion's damage)"))],
    conversion: [conv("Physical", "Erosion", "catalog tags Erosion for a Physical game row (provisional reading of the module's conversion)")] },
  // --- Synthetic Troop summons: 3 ---
  { key: "machine-guard", minion: "Machine Guard", summon: "Summon Machine Guard", family: "synthetic-troop", count: countByLevelFromText("Summon Machine Guard"), summonCastSeconds: 0.8, summonCastSource: "Split 572453 use time 0.8 s",
    skills: [skill("Overpower", "basic"), skill("Onslaught Punch", "special", { ...text("the behaviour tree (AI 256312) forces it only with the threat 8 to 15 m away, or on state 4015310 after a kill (Machine Guard: a support's recipe 591143552); Overpower is first in the NPC's list and has no cooldown, so the Guard beside the dummy never casts it"), aiGate: "the Guard casts Onslaught Punch only with the threat 8 to 15 m away, or after a kill" })] },
  { key: "spider-tank", minion: "Spider Tank", summon: "Summon Spider Tank", family: "synthetic-troop", count: countByLevelFromText("Summon Spider Tank"), summonCastSeconds: 0.8, summonCastSource: "Split 521008 use time 0.8 s",
    skills: [skill("Aimed Shot", "basic")],
    notes: ["Summon Spider Tank: \"+3% additional Spider Tank Damage for every Spider Tank summoned\" is applied per Minion summoned; the Command-gated projectile lines are not modeled (Command is not read)."],
    perMinionAdditionalPercent: 3 },
  { key: "grim-phantom", minion: "Grim Phantom", summon: "Summon Grim Phantom", family: "synthetic-troop", count: countByLevelFromText("Summon Grim Phantom"), summonCastSeconds: 1, summonCastSource: "Split 841187 use time 1 s (fixed); the skill re-summons every 1 s", autoSummonSeconds: 1,
    skills: [skill("High Energy Beam", "basic", provisional("Reference data: the beams can hit the same enemy with a 70% Shotgun falloff; one beam in the base state")), skill("Destructive Light Cannon", "special", { ...provisional("the behaviour tree (AI 396035) casts it only on state 4080010; no readable record sets that state. The 5 s cooldown of the summon's Split (841187) is read as its cadence (open question minion-grim-cannon-cadence)"), cycle: { cooldownSeconds: 5 } })],
    conversion: [conv("Physical", "Lightning", "Summon Grim Phantom: Converts 100% of Physical Damage dealt by the Minions summoned by this skill to Lightning Damage")] },
  // --- Spirit Magi: 5 (2026-10-12: Base, Enhanced and Empower skills; the Ultimate needs Full Bloom) ---
  // Manual rules 1001012022–34 (config_multi_language_en): each Spirit Magus has a Base Skill ("most frequently used"), an
  // Enhanced Skill ("chance to change the skill into a stronger Enhanced Skill when Spirit Magi use a Base Skill"; "at Stage
  // 2, +30% chance"; "at Stage 3, the effect of Enhanced Skills is enhanced"), an Empower Skill ("a positive effect that
  // increases damage for a period of time and has a cooldown"; "at Stage 4, Empower Skills gain new effects") and an
  // Ultimate ("in Full Bloom, Spirit Magi use their Ultimate with extremely high strength and a cooldown"; only The Forsaken
  // Iris – Growing Breeze gives Full Bloom, rule 1001012027). The Magus casts all of them on its own AI; the summon setup
  // activates the Magus (its alias below). Timing: each skill's stone Split (chunk 10); magusTiming's reference data figures only stand where no stone links.
  // The Empower cooldown is 10 s: the Split header of all five Empower stones (2026-10-31, chunk 1 Iris), with reference data's card. It replaces
  // the 4 s of the designer note on game group 692 (the same note reads a 3 s duration where the Split reads 6 s) and the Google AI Mode
  // answer of 2026-10-21 (not an in-game test). Attack-tagged Magi (Thunder, Rock) use attack-speed; Spell Magi cast-speed.
  ...SPIRIT_MAGI
];


function buildProfile(definition) {
  const skills = definition.skills.map((entry) => {
    const row = minionSkillDamageSs13[entry.name] || null;
    const timing = skillTimingSs13[entry.name] || null;
    // The stone's Split (chunk 10). `cycle` holds a cadence the tree sets from elsewhere (Grim Phantom's cannon).
    const useTiming = timing?.stoneId ? { useTime: timing.useTime, speedType: timing.speedType, cooldown: entry.cycle?.cooldownSeconds ?? timing.cooldown ?? 0, fixedTime: timing.fixedTime || 0, source: `SkillEditor Split ${timing.splitId} (stone ${timing.stoneId})` } : entry.timingFallback || null;
    const conversion = (definition.conversion || []).find((rule) => rule.from === row?.type && (!rule.skills || rule.skills.includes(entry.name))) || null;
    // Role from the decoded timing: a skill without a cooldown is the filler ("basic"), one with a cooldown is used whenever ready ("special"), as the
    // trees pick (the NPC lists put the cooldown skill first). The declared role is kept for reference. `aiGate`: the tree keeps it out of the dummy's cycle.
    const role = entry.aiGate ? "gated" : ["enhanced", "ultimate"].includes(entry.role) ? entry.role : useTiming ? (useTiming.cooldown > 0 ? "special" : "basic") : entry.role;
    return Object.freeze({
      ...entry, declaredRole: entry.role, role, groupId: row?.groupId ?? null, kind: row?.kind || "hit", baseType: row?.type || null,
      type: conversion ? conversion.to : row?.type || null, conversion,
      percentByLevel: row?.percentByLevel || null, addedEffectivenessByLevel: row?.addedEffectivenessByLevel || null,
      timing: useTiming, tags: catalog.get(entry.name)?.tags || [], refdata: catalog.get(entry.name)?.source || null
    });
  });
  const notes = [...(definition.notes || [])];
  if (skills.length && !skills.some((item) => item.role === "basic" && item.timing)) notes.push(`${definition.summon}: every decoded skill of the ${definition.minion} has a cooldown (${skills.map((item) => `${item.name} ${item.timing?.cooldown ?? "?"} s`).join(", ")}), so the Minion idles between uses in the model; an unlisted basic attack, if it has one, is not in the catalog.`);
  for (const item of skills) if (item.timing && item.aiGate) notes.push(`${definition.summon}: ${item.aiGate}, so it is out of the cycle on the dummy.`);
  // The birth skill: the tree's Spawn subtree casts it first, in the NPC's speed type, before any other skill.
  const spawn = skillTimingSs13[definition.summon]?.npc?.spawn || null;
  // Alias setups that activate the Minion without a damage row of their own: the summon skill itself ("Summon Machine Guard",
  // "Summon Frost Magus", "Module: Goblin Priest" is the board setup; its Minion skills are what the cycle casts). Since
  // 2026-10-21 the summon is the only board setup of a Minion (src/minion-skill-owners.js): its own skills are never picked.
  // They are damage sources of the Minion engine (src/skill-damage-profiles.js).
  const aliases = [...(["synthetic-troop", "spirit-magus", "module"].includes(definition.family) ? [definition.summon] : []), ...(definition.aliases || [])];
  return Object.freeze({ ...definition, notes, skills, aliases, spawn, skillNames: skills.map((item) => item.name), engine: skills.some((item) => item.percentByLevel) ? "minion" : null });
}

export const MINION_PROFILES = Object.freeze(Object.fromEntries(DEFINITIONS.map((definition) => [definition.key, buildProfile(definition)])));

/** Minion profile that owns a catalog skill name, or null. */
export function minionProfileForSkill(name) {
  return Object.values(MINION_PROFILES).find((profile) => profile.skillNames.includes(name)) || null;
}

/**
 * Damage-source profiles (src/skill-damage-profiles.js shape) for every Minion skill: engine "minion". The Minion's
 * alias setups (its summon skill, a Spirit Magus's Empower skill) map to the same Minion with `alias: true`.
 */
export const MINION_SKILL_PROFILES = Object.freeze(Object.fromEntries(Object.values(MINION_PROFILES).flatMap((profile) => [
  ...profile.skills.map((entry) => [entry.name, Object.freeze({
    name: entry.name, kind: "minion", engine: profile.engine && (entry.percentByLevel || entry.buffOnly) ? "minion" : null, damageType: entry.type || profile.skills[0]?.type || null, dealtTypes: entry.type ? [entry.type] : [...new Set(profile.skills.map((item) => item.type).filter(Boolean))], tags: entry.tags,
    delivery: "minion", minionKey: profile.key, minion: profile.minion, summon: profile.summon, family: profile.family, minionRole: entry.role,
    canInflictHitAilments: false, builtInReaping: null,
    reason: entry.percentByLevel || entry.buffOnly ? null : `no game damage row for ${entry.name}`,
    note: entry.buffOnly ? `${entry.name}: the ${profile.minion}'s Empower Skill (a buff, no damage row of its own); it activates the Magus, whose cycle is modeled.` : entry.role === "ultimate" ? `${entry.name}: the ${profile.minion}'s Ultimate; it activates the Magus, but its own cast needs Full Bloom and is not in the cycle.` : null,
    sources: { refdata: entry.refdata, gameData: entry.groupId ? `config_skill_damage group ${entry.groupId} (% of Minion Base Damage, levels 1–20)` : null, timing: entry.timing?.source || null }
  })]),
  ...(profile.aliases || []).filter((name) => !profile.skillNames.includes(name)).map((name) => [name, Object.freeze({
    name, kind: "minion", engine: profile.engine, damageType: profile.skills[0]?.type || null, dealtTypes: [...new Set(profile.skills.map((entry) => entry.type).filter(Boolean))], tags: catalog.get(name)?.tags || [],
    delivery: "minion", minionKey: profile.key, minion: profile.minion, summon: profile.summon, family: profile.family, minionRole: "alias", alias: true,
    canInflictHitAilments: false, builtInReaping: null,
    reason: profile.engine ? null : `no game damage row for the ${profile.minion}'s skills`,
    note: name === profile.summon ? `${name}: the summon skill activates the ${profile.minion}; its damage is the Minion's skill cycle (${profile.skillNames.join(", ")}).` : `${name}: activates the ${profile.minion} in the planner.`,
    sources: { refdata: catalog.get(name)?.source || null, gameData: profile.skills.map((entry) => entry.groupId).filter(Boolean).map((id) => `config_skill_damage group ${id}`).join(" / ") || null, timing: profile.summonCastSource || null }
  })])
])));
