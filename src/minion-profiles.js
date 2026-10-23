import { minionSkillDamageSs13 } from "./data/skills/minion-skill-damage-ss13.generated.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { tlidbSkillCatalogSs13 } from "./data/catalogs/tlidb-ss13.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";

// Minion sources (2026-10-11): which Minion each "% of Base Damage" skill belongs to, what that Minion does on a single
// training dummy, and the summon-skill text that shapes it. One source per Minion type; a catalog setup of any of the
// Minion's skills activates the whole Minion (in game the Module / Summon skill is one stone; the TLIDB catalog lists the
// Minion's skills as separate "main" entries sharing the module icon). Since 2026-10-21 (user decision) only the summon is a
// board skill, as in game: every Minion's own skills are excluded from the skill picker and a saved setup of one migrates to
// its summon (src/minion-skill-owners.js; ownership from the game files, src/data/skills/minion-skill-owners-ss13.generated.js,
// which also supplies the module summons' catalog entries; tests/minion-skill-owners.test.js checks the lists below against it).
//
// Sourced:
// - Skill rows: src/data/skills/minion-skill-damage-ss13.generated.js (config_skill_damage: percent of Base Damage per
//   level, row kind hit / persistent, typed entry's damage type; research/base-damage-skills-2026-10-11.md).
// - Timing: src/data/skills/skill-timing-ss13.generated.js (SkillEditor Split: use time, speed type, cooldown). Spirit
//   Magus skills link only the summon's Split (1 s fixed), so their TLIDB cast time is the fallback (flagged).
// - Minion count: the summon skill's TLIDB text ("This skill summons up to N Minions (LvX:N)"); Module summons carry a
//   "{%s:1}" placeholder in the game text and TLIDB publishes no Module page, so one Minion is assumed (flagged).
// - Conversions: TLIDB summon text (Grim Phantom, Thunder Magus, Erosion Magus); Huge Ember Automaton 100% Physical →
//   Fire (user-confirmed module text 2026-10-11). Other modules whose Physical skill rows carry an elemental catalog tag
//   (Medium Ember / Dwarven / Ratlin / Lean Phantom / Aember Winged Beast) are read the same way, provisionally.
// - Special-skill self buffs: TLIDB skill text (Searing Crush "+50% additional damage dealt for 5 s when casting";
//   High Court Covenant "+300 Critical Strike Rating and +75% Critical Strike Damage for 4 s").
// - Module tooltip (user, 2026-10-11): "Cast Speed 1.25" (the summon cast), "Cooldown 4.0 sec" at Lv.1 and Lv.20 on
//   Goblin Priest, God of Swords and Huge Ember Automaton alike. The minion skills' Split cooldowns differ per module
//   (Searing Crush 10 s, High Court Covenant 8 s, Tailsweep 4 s), so the 4.0 s is read as the summon's own cooldown and the
//   Split cooldown as the special skill's (flagged where they disagree).
//
// Use pattern (assumption, flagged): the Minion uses its special skill whenever its cooldown is ready and its basic skill
// otherwise; hits land at the end of each use; the Minion is in range the whole time (the dummy stands still).

const catalog = new Map(tlidbSkillCatalogSs13.map((entry) => [entry.name, entry]));
const effectsOf = (name) => (allSkillEffectsSs13[name] || []).join("\n");

// "This skill summons up to 2 Minions (Lv1:2) (Lv3:2) (Lv4:3) (Lv17:3) (Lv18:4) (Lv25:4) (Lv26:4) (Lv34:4)"
function countByLevelFromText(name) {
  const text = effectsOf(name);
  const line = text.split("\n").find((part) => /summons up to \d+ Minions?/i.test(part));
  if (!line) return null;
  const steps = [...line.matchAll(/\(Lv(\d+):(\d+)\)/g)].map((match) => [Number(match[1]), Number(match[2])]).sort((a, b) => a[0] - b[0]);
  const base = Number(line.match(/summons up to (\d+)/i)[1]);
  return { source: `TLIDB ${name}: "${line.trim()}"`, at: (level) => steps.reduce((count, [at, value]) => level >= at ? value : count, base) };
}

const conv = (from, to, source) => ({ from, to, percent: 100, source });
const text = (note) => ({ basis: "text", note });
const provisional = (note) => ({ basis: "provisional", note });

// A hit skill of the Minion: `hitsPerUse` on a single dummy (1 unless the text says the extra hits can land on the same
// enemy), `role` basic (no cooldown; filler) or special (cooldown-bound; used when ready).
const skill = (name, role, extra = {}) => ({ name, role, hitsPerUse: 1, ...text("one hit per use on the single dummy"), ...extra });

const MODULE_SUMMON = { summonCastSeconds: 1.25, summonCastSource: "module tooltip Cast Speed 1.25 (user, 2026-10-11)", summonCooldownSeconds: 4, summonCooldownSource: "module tooltip Cooldown 4.0 s (user, 2026-10-11; same on every module checked)" };
// Module Minions (user-supplied 2026-10-21, Google AI Mode answer, not an in-game test): one per cast, up to 4 by default. The TLIDB
// SS14 Module pages agree ("This skill summons up to 4 Minions"); the game text's Max Minion Quantity is a placeholder. The count
// itself (lines that raise or cap it, the cold-start ramp, the "troopMaxMinions" switch) is resolved in src/minion-damage-model.js,
// with the same rules for the Synthetic Troop summons (user decision 2026-10-21).
const MODULE_COUNT = { source: "up to 4 Minions, one per cast (user-supplied 2026-10-21, Google AI Mode answer, not an in-game test; TLIDB SS14 Module pages: \"This skill summons up to 4 Minions\")", at: () => 4, max: 4, assumed: true };
const SPIRIT_COUNT = { source: "TLIDB: \"This skill summons up to 1 Minions (Lv1:1)\"", at: () => 1 };

const magusTiming = (name, cast, speedType, cooldown = 0) => ({ timingFallback: { useTime: cast, speedType, cooldown, source: `TLIDB ${name} cast speed ${cast} s (the linked Split is the summon's)${cooldown ? `; ${cooldown} s cooldown from the designer note on game group 692 (provisional)` : ""}` } });
const EMPOWER_COOLDOWN = 4;
const EMPOWER_NOTE = (name, effect) => provisional(`${name} is the Magus's Empower Skill: cast whenever its assumed ${EMPOWER_COOLDOWN} s cooldown is ready (designer note on game group 692), granting the Magus Euphoria for 6 s (${effect})`);
const ENHANCED_NOTE = (name, extra = "") => provisional(`${name} is the Enhanced Skill: it replaces a Base Skill cast at the Enhanced-skill chance (manual rule 1001012024; Stage 2 +30%)${extra}`);
const ULTIMATE_NOTE = (name) => text(`${name} is the Ultimate: only cast in Full Bloom (manual rule 1001012027), so it is shown per hit and left out of the cycle`);
function magus(key, minion, summon, speedType, conversion, skills, notes = []) {
  return { key, minion, summon, family: "spirit-magus", count: SPIRIT_COUNT, summonCastSeconds: 1, summonCastSource: "summon Split use time 1 s (fixed)", skills, conversion: conversion ? [conversion] : [],
    notes: [`${summon}: the Base, Enhanced and Empower skills are in the cycle; Nourishment (Iris – Growing Breeze) is read from the hero trait text when present; the Ultimate (Full Bloom) is not in the cycle.`, ...notes] };
}
const SPIRIT_MAGI = [
  magus("fire-magus", "Fire Magus", "Summon Fire Magus", "cast-speed", null, [
    skill("Blazing Dance", "basic", magusTiming("Blazing Dance", 0.8, "cast-speed")),
    skill("Blazing Incineration", "enhanced", { ...ENHANCED_NOTE("Blazing Incineration"), ...magusTiming("Blazing Incineration", 0.8, "cast-speed"), stageBonus: (stage) => stage >= 3 ? { additionalPercent: 30, text: "+30% additional damage for this skill at Stage 3 or higher (TLIDB)" } : null }),
    skill("Blazing Spin", "special", { ...EMPOWER_NOTE("Blazing Spin", "+435% Critical Strike Rating; its own Persistent Fire row ticks every second for the 6 s"), ...magusTiming("Blazing Spin", 0.6, "cast-speed", EMPOWER_COOLDOWN), persistentSeconds: 6, selfBuff: { critRatingPercent: 435, durationSeconds: 6, source: "TLIDB Blazing Spin: +435% Critical Strike Rating while the skill lasts (6 s)" } }),
    skill("Molten Rising", "ultimate", { ...ULTIMATE_NOTE("Molten Rising"), ...magusTiming("Molten Rising", 1.5, "cast-speed") })
  ], ["Blazing Spin: the Stage 4 \"+14% Critical Strike Damage per hit on an affected enemy, up to 15 stacks for 2 s\" is not modeled.", "Blazing Incineration: the \"+10% additional Damage if the skill has dealt a Critical Strike recently\" and the Stage 3 Skill Area stacks are not applied."]),
  magus("frost-magus", "Frost Magus", "Summon Frost Magus", "cast-speed", null, [
    skill("Glacier Ripples", "basic", magusTiming("Glacier Ripples", 0.8, "cast-speed")),
    skill("Permafrost Cast", "enhanced", { ...ENHANCED_NOTE("Permafrost Cast"), ...magusTiming("Permafrost Cast", 0.8, "cast-speed") }),
    skill("Frost Release", "special", { ...EMPOWER_NOTE("Frost Release", "the next 5 uses of other skills deal +81% additional Hit Damage, −15 points per cast: 81 / 66 / 51 / 36 / 21; its own Cold hit lands on cast"), ...magusTiming("Frost Release", 0.6, "cast-speed", EMPOWER_COOLDOWN), selfBuff: { nextUses: [81, 66, 51, 36, 21], durationSeconds: 6, source: "TLIDB Frost Release: the next 5 uses of other non-Channeled Skills deal +81% additional Hit Damage while the skill lasts (6 s), −15% to this bonus after casting another skill (read as percentage points)" } }),
    skill("Ice Earthshaker", "ultimate", { ...ULTIMATE_NOTE("Ice Earthshaker"), ...magusTiming("Ice Earthshaker", 1.5, "cast-speed") })
  ], ["Permafrost Cast / Ice Earthshaker: the Frostbite they inflict and the Stage 3 \"+1% additional damage per 3 Frostbite Rating\" are not modeled (Minion-applied ailments are open)."]),
  magus("thunder-magus", "Thunder Magus", "Summon Thunder Magus", "attack-speed", conv("Physical", "Lightning", "TLIDB Summon Thunder Magus: Converts 100% of Spirit Magi's Physical Damage to Lightning Damage"), [
    skill("Lightning Star", "basic", magusTiming("Lightning Star", 0.8, "attack-speed")),
    skill("Thunderlight Arrow", "enhanced", { ...ENHANCED_NOTE("Thunderlight Arrow", "; at Stage 3+ its extra projectile can hit the same enemy with a 70% Shotgun falloff (1.7 hits) and adds +5% additional damage"), ...magusTiming("Thunderlight Arrow", 0.8, "attack-speed"), stageBonus: (stage) => stage >= 3 ? { additionalPercent: 5, hitsPerUse: 1 + 0.7, text: "+1 Base Projectile Quantity at Stage 3 or higher: +5% additional damage per +1 Projectile Quantity, and the projectiles can hit the same enemy (70% Shotgun falloff → 1.7 hits per cast)" } : null }),
    // Chain of Lightning (2026-10-21, user decision to model it): the game gives the Empower a damage row (config_skill_damage
    // group 703, Physical → Lightning by the summon, 126% at Lv.20; tooltip line skill_des|des_config|19142 "Chain of Lightning:
    // Deals … Damage equal to X of Base Damage"; stone 1916: Minion Skill, Empower, Chain). TLIDB's card omits it. No text gives
    // its cadence: one Chain of Lightning hit per cast is read, landing on cast like Frost Release's own hit (provisional; open
    // question "thunder-magus-chain-of-lightning").
    skill("Thundercloud Surge", "special", { ...EMPOWER_NOTE("Thundercloud Surge", "+35% additional Attack Speed; +25% additional damage at Stage 4 or higher; one Chain of Lightning hit per cast (game row 703; cadence provisional)"), ...magusTiming("Thundercloud Surge", 0.6, "attack-speed", EMPOWER_COOLDOWN), selfBuff: (stage) => ({ attackSpeedAdditionalPercent: 35, additionalPercent: stage >= 4 ? 25 : 0, durationSeconds: 6, source: "TLIDB Thundercloud Surge: +35% additional Attack Speed while the skill lasts (6 s); at Stage 4 or higher +25% additional damage" }) }),
    skill("Lightning Surge", "ultimate", { ...ULTIMATE_NOTE("Lightning Surge"), ...magusTiming("Lightning Surge", 1.5, "attack-speed") })
  ]),
  magus("rock-magus", "Rock Magus", "Summon Rock Magus", "attack-speed", null, [
    skill("Shattered Stone", "basic", magusTiming("Shattered Stone", 0.8, "attack-speed")),
    skill("Rock Blast", "enhanced", { ...ENHANCED_NOTE("Rock Blast", "; every use launches 3 strikes, all read as landing on the single dummy"), ...magusTiming("Rock Blast", 0.4, "attack-speed"), hitsPerUse: 3, stageBonus: (stage) => stage >= 3 ? { additionalPercent: 3.5, text: "+3.5% additional damage for each enemy within 8 m at Stage 3 or higher (one enemy: the dummy)" } : null }),
    skill("Gold Rush", "special", { ...EMPOWER_NOTE("Gold Rush", "+6% additional damage per enemy affected (the dummy); at Stage 4 or higher +120% additional Empower Effect with a Boss within 10 m, the dummy being a Boss"), ...magusTiming("Gold Rush", 0.6, "attack-speed", EMPOWER_COOLDOWN), buffOnly: true, selfBuff: (stage) => ({ additionalPercent: 6 * (stage >= 4 ? 2.2 : 1), durationSeconds: 6, source: "TLIDB Gold Rush: +6% additional damage for each enemy affected (6 s); Stage 4+: +120% additional Empower Effect with a boss within 10 m" }) }),
    skill("Towering Mountains", "ultimate", { ...ULTIMATE_NOTE("Towering Mountains"), ...magusTiming("Towering Mountains", 1.5, "attack-speed") })
  ], ["Gold Rush: the build's own Empower Effect lines are not applied to the Magus's Euphoria."]),
  magus("erosion-magus", "Erosion Magus", "Summon Erosion Magus", "cast-speed", conv("Physical", "Erosion", "TLIDB Summon Erosion Magus: Converts 100% of Physical Damage to Erosion Damage for Spirit Magi"), [
    skill("Scattered Mud", "basic", magusTiming("Scattered Mud", 0.8, "cast-speed")),
    skill("Bleak Grass", "enhanced", { ...ENHANCED_NOTE("Bleak Grass", "; the Spike and its Spike Explosion (both 162% of Base Damage on TLIDB, one game row) are read as two hits per cast"), ...magusTiming("Bleak Grass", 0.8, "cast-speed"), hitsPerUse: 2 }),
    skill("Withering Payback", "special", { ...EMPOWER_NOTE("Withering Payback", "+20% additional Erosion Damage; its damage-taken trigger never fires on the dummy"), ...magusTiming("Withering Payback", 0.6, "cast-speed", EMPOWER_COOLDOWN), buffOnly: true, selfBuff: { additionalPercent: 20, types: ["Erosion"], durationSeconds: 6, source: "TLIDB Withering Payback: +20% additional Erosion Damage while the skill lasts (6 s)" } }),
    skill("World of Thorns", "ultimate", { ...ULTIMATE_NOTE("World of Thorns"), ...magusTiming("World of Thorns", 1.5, "cast-speed") })
  ], ["Bleak Grass: the Stage 3 \"+4% additional Erosion Damage taken\" stacks and the Stage 4 extra spike are not applied."])
];

const DEFINITIONS = [
  // --- Modularization (Synthetic Troop) modules: 20 ---
  { key: "goblin-priest", minion: "Goblin Priest", summon: "Module: Goblin Priest", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Firebird", "basic", provisional("TLIDB: the projectiles return after max range; one hit per cast is counted (the return pass and the Cold-as-Fire stacks are not modeled)")), skill("Frostclaw", "special")],
    conversion: [{ from: "Cold", to: "Fire", percent: 99, source: "TLIDB Frostclaw: Converts 99% of the skill's Cold Damage to Fire Damage", skills: ["Frostclaw"] }] },
  { key: "trog-2nd-general", minion: "Trog 2nd General", summon: "Module: Trog 2nd General", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Earthshatter", "basic")] },
  { key: "nether-bulwark", minion: "Nether Bulwark", summon: "Module: Nether Bulwark", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Aember Rain", "basic", provisional("TLIDB shows Aimed Shot's text for Aember Rain; one hit per cast is counted"))],
    conversion: [conv("Physical", "Erosion", "catalog tags Erosion for a Physical game row (provisional reading of the module's conversion)")] },
  { key: "dwarven-automaton", minion: "Dwarven Automaton", summon: "Module: Dwarven Automaton", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Molten Barrage", "basic"), skill("All-Out Volley", "special", provisional("TLIDB: a volley; one projectile hit per cast is counted on the single dummy"))],
    conversion: [conv("Physical", "Fire", "catalog tags Fire for Physical game rows (provisional reading of the module's conversion)")] },
  { key: "trog-mage", minion: "Trog Mage", summon: "Module: Trog Mage", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Rockfall", "basic", provisional("TLIDB: a Barrage; one rock per cast is counted on the single dummy"))] },
  { key: "goblin-priest-of-elements", minion: "Goblin Priest of Elements", summon: "Module: Goblin Priest of Elements", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Thunderfall", "basic", provisional("TLIDB: the lightning bolts can hit the same enemy with a 95% Shotgun falloff; one bolt per cast is counted (bolt count unpublished)"))] },
  { key: "medium-ember-automaton", minion: "Medium Ember Automaton", summon: "Module: Medium Ember Automaton", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Kinetic Thrust", "basic"), skill("Groundslam", "special")] },
  { key: "huge-ember-automaton", minion: "Huge Ember Automaton", summon: "Module: Huge Ember Automaton", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [
      skill("Overstrike", "basic", text("game text: attacks a square area in front, one hit per use (Split 163968: 0.7 s, attack-speed type)")),
      skill("Searing Crush", "special", { ...text("game text: charges forward dealing damage to enemies in the path (Split 164416: one bump-attack damage event, 2.4 s use, 10 s cooldown)"), selfBuff: { additionalPercent: 50, durationSeconds: 5, source: "TLIDB Searing Crush: gains a buff when casting: +50% additional damage dealt for 5 s (Chinese line, 2026-10-11)" } })
    ],
    conversion: [conv("Physical", "Fire", "module text (user-confirmed 2026-10-11): converts 100% Physical Damage to Fire Damage")] },
  { key: "ent-great-elder", minion: "Ent Great Elder", summon: "Module: Ent Great Elder", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Sweep", "basic"), skill("Rootsurge", "special")] },
  { key: "ratlin-stormer-captain", minion: "Ratlin Stormer Captain", summon: "Module: Ratlin Stormer Captain", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Blitz Strike", "basic"), skill("Burst Hammer", "special", { ...provisional("TLIDB: the pummel and explosion can hit the same enemy (64% Shotgun falloff) → 1.64 hits per cast"), hitsPerUse: 1.64, extraAdditional: [{ source: "Blitz Strike → Burst Hammer", text: "+100% additional damage for the next Burst Hammer cast after casting Blitz Strike (TLIDB; Blitz Strike is the filler, so every Burst Hammer follows one)", value: 100 }] })],
    conversion: [conv("Physical", "Fire", "catalog tags Fire for Physical game rows (provisional reading of the module's conversion)")] },
  { key: "chief-machinist", minion: "Chief Machinist", summon: "Module: Chief Machinist", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Firebomb", "basic", provisional("game text: a bomb-throwing Drone attacks many circular areas; one bomb hit per cast is counted on the single dummy")), skill("Pyromania", "special", { ...provisional("game text: a Flame Terra in a square area; Persistent damage per second while the dummy stands in it; its duration is unpublished, so 4 s per cast is assumed"), persistentSeconds: 4 })] },
  { key: "lean-phantom", minion: "Lean Phantom", summon: "Module: Lean Phantom", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Flickering Shadow", "basic"), skill("Sin of the Fallen", "special")],
    conversion: [conv("Physical", "Erosion", "catalog tags Erosion for Physical game rows (provisional reading of the module's conversion)")] },
  { key: "god-of-swords", minion: "God of Swords", summon: "Module: God of Swords", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Blade of Glory", "basic"), skill("High Court Covenant", "special", { selfBuff: { critRating: 300, critDamagePercent: 75, durationSeconds: 4, source: "TLIDB High Court Covenant: gains a buff when casting: +300 Critical Strike Rating and +75% Critical Strike Damage for 4 s" } })] },
  { key: "tyrant", minion: "Tyrant", summon: "Module: Tyrant", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Ravaging Slash", "basic")] },
  { key: "ichi-storm", minion: "Ichi Storm", summon: "Module: Ichi Storm", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Auric Shot", "basic")] },
  { key: "sand-giant", minion: "Sand Giant", summon: "Module: Sand Giant", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Gravelshot", "basic")] },
  { key: "einherjar-elder-sage", minion: "Einherjar Elder Sage", summon: "Module: Einherjar Elder Sage", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Javelin of Judgment", "basic"), skill("Divine Judgment", "special", provisional("TLIDB: Lucky Damage and +60% additional Max Damage for 4 s after casting are not modeled"))] },
  { key: "aember-winged-beast", minion: "Aember Winged Beast", summon: "Module: Aember Winged Beast", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Tailsweep", "basic"), skill("Spikeburst", "special", provisional("TLIDB: a projectile burst with Shotgun falloff; one projectile hit per cast is counted"))],
    conversion: [conv("Physical", "Cold", "catalog tags Cold for Physical game rows (provisional reading of the module's conversion)")] },
  { key: "punisher", minion: "Punisher", summon: "Module: Punisher", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON, skills: [skill("Twinstrike", "basic"), skill("Impaling Thrust", "special")] },
  { key: "eumbra-corroder", minion: "Eumbra Corroder", summon: "Module: Eumbra Corroder", family: "module", count: MODULE_COUNT, ...MODULE_SUMMON,
    skills: [skill("Undercurrent", "basic", provisional("TLIDB shows Aimed Shot's text for Undercurrent; one hit per cast is counted"))],
    conversion: [conv("Physical", "Erosion", "catalog tags Erosion for a Physical game row (provisional reading of the module's conversion)")] },
  // --- Synthetic Troop summons: 3 ---
  { key: "machine-guard", minion: "Machine Guard", summon: "Summon Machine Guard", family: "synthetic-troop", count: countByLevelFromText("Summon Machine Guard"), summonCastSeconds: 0.8, summonCastSource: "Split 572453 use time 0.8 s",
    skills: [skill("Overpower", "basic", { ...text("TLIDB cast 0.7 s (the linked Split 149357 reads 1 s fixed; TLIDB is used, flagged)"), timingFallback: { useTime: 0.7, speedType: "attack-speed", cooldown: 0, source: "TLIDB Overpower cast speed 0.7 s" } }), skill("Onslaught Punch", "special", { ...provisional("no cooldown is decoded for Onslaught Punch (its Split is the summon's); a 4 s special cooldown is assumed"), timingFallback: { useTime: 0.8, speedType: "attack-speed", cooldown: 4, source: "TLIDB Onslaught Punch cast speed 0.8 s; 4 s cooldown assumed" } })] },
  { key: "spider-tank", minion: "Spider Tank", summon: "Summon Spider Tank", family: "synthetic-troop", count: countByLevelFromText("Summon Spider Tank"), summonCastSeconds: 0.8, summonCastSource: "Split 521008 use time 0.8 s",
    skills: [skill("Aimed Shot", "basic", { ...text("TLIDB cast 0.7 s (the linked Split 521008 is the summon's 0.8 s; TLIDB is used, flagged)"), timingFallback: { useTime: 0.7, speedType: "attack-speed", cooldown: 0, source: "TLIDB Aimed Shot cast speed 0.7 s" } })],
    notes: ["Summon Spider Tank: \"+3% additional Spider Tank Damage for every Spider Tank summoned\" is applied per Minion summoned; the Command-gated projectile lines are not modeled (Command is not read)."],
    perMinionAdditionalPercent: 3 },
  { key: "grim-phantom", minion: "Grim Phantom", summon: "Summon Grim Phantom", family: "synthetic-troop", count: countByLevelFromText("Summon Grim Phantom"), summonCastSeconds: 1, summonCastSource: "Split 841187 use time 1 s (fixed); the skill re-summons every 1 s", autoSummonSeconds: 1,
    skills: [skill("High Energy Beam", "basic", provisional("TLIDB: the beams can hit the same enemy with a 70% Shotgun falloff; one beam in the base state")), skill("Destructive Light Cannon", "special", provisional("the 5 s cooldown decoded on the summon's Split (841187) is read as the cannon's"))],
    conversion: [conv("Physical", "Lightning", "TLIDB Summon Grim Phantom: Converts 100% of Physical Damage dealt by the Minions summoned by this skill to Lightning Damage")] },
  // --- Spirit Magi: 5 (2026-10-12: Base, Enhanced and Empower skills; the Ultimate needs Full Bloom) ---
  // Manual rules 1001012022–34 (config_multi_language_en): each Spirit Magus has a Base Skill ("most frequently used"), an
  // Enhanced Skill ("chance to change the skill into a stronger Enhanced Skill when Spirit Magi use a Base Skill"; "at Stage
  // 2, +30% chance"; "at Stage 3, the effect of Enhanced Skills is enhanced"), an Empower Skill ("a positive effect that
  // increases damage for a period of time and has a cooldown"; "at Stage 4, Empower Skills gain new effects") and an
  // Ultimate ("in Full Bloom, Spirit Magi use their Ultimate with extremely high strength and a cooldown"; only The Forsaken
  // Iris – Growing Breeze gives Full Bloom, rule 1001012027). The Magus casts all of them on its own AI; the summon setup
  // activates the Magus (its alias below). Timing: the Magus skills link only the summon's Split (1 s fixed) — the Thunder
  // Magus pair links a Module's file (488960 is "模组-暗域壁垒", Nether Bulwark) — so TLIDB cast times are used (flagged).
  // The Empower cooldown is the designer note on game group 692 ("cooldown 4 s"; the same note reads a 3 s duration where
  // TLIDB says 6 s). User-supplied 2026-10-21 (Google AI Mode answer, not an in-game test): the base Empower cooldown is 4 s in
  // game; TLIDB's 10 s (SS13 and SS14 cards) is outdated. Attack-tagged Magi (Thunder, Rock) use attack-speed; Spell Magi cast-speed.
  ...SPIRIT_MAGI
];


function buildProfile(definition) {
  const skills = definition.skills.map((entry) => {
    const row = minionSkillDamageSs13[entry.name] || null;
    const timing = skillTimingSs13[entry.name] || null;
    const useTiming = entry.timingFallback || (timing && !(definition.family === "spirit-magus") ? { useTime: timing.useTime, speedType: timing.speedType, cooldown: timing.cooldown || 0, source: `SkillEditor Split ${timing.splitId}` } : null);
    const conversion = (definition.conversion || []).find((rule) => rule.from === row?.type && (!rule.skills || rule.skills.includes(entry.name))) || null;
    // Role from the decoded timing: a skill without a cooldown is the filler ("basic"), one with a cooldown is used
    // whenever ready ("special"). The declared role is kept for reference where the two disagree.
    const role = ["enhanced", "ultimate"].includes(entry.role) ? entry.role : useTiming ? (useTiming.cooldown > 0 ? "special" : "basic") : entry.role;
    return Object.freeze({
      ...entry, declaredRole: entry.role, role, groupId: row?.groupId ?? null, kind: row?.kind || "hit", baseType: row?.type || null,
      type: conversion ? conversion.to : row?.type || null, conversion,
      percentByLevel: row?.percentByLevel || null, addedEffectivenessByLevel: row?.addedEffectivenessByLevel || null,
      timing: useTiming, tags: catalog.get(entry.name)?.tags || [], tlidb: catalog.get(entry.name)?.source || null
    });
  });
  const notes = [...(definition.notes || [])];
  if (skills.length && !skills.some((item) => item.role === "basic" && item.timing)) notes.push(`${definition.summon}: every decoded skill of the ${definition.minion} has a cooldown (${skills.map((item) => `${item.name} ${item.timing?.cooldown ?? "?"} s`).join(", ")}), so the Minion idles between uses in the model; an unlisted basic attack, if it has one, is not in the catalog.`);
  for (const item of skills) if (item.timing && item.declaredRole !== item.role) notes.push(`${definition.summon}: ${item.name} is read as the ${item.role} skill from its Split timing (${item.timing.useTime} s, cooldown ${item.timing.cooldown} s), not as the ${item.declaredRole} the catalog order suggests.`);
  // Alias setups that activate the Minion without a damage row of their own: the summon skill itself ("Summon Machine Guard",
  // "Summon Frost Magus", "Module: Goblin Priest" is the board setup; its Minion skills are what the cycle casts). Since
  // 2026-10-21 the summon is the only board setup of a Minion (src/minion-skill-owners.js): its own skills are never picked.
  // They are damage sources of the Minion engine (src/skill-damage-profiles.js).
  const aliases = [...(["synthetic-troop", "spirit-magus", "module"].includes(definition.family) ? [definition.summon] : []), ...(definition.aliases || [])];
  return Object.freeze({ ...definition, notes, skills, aliases, skillNames: skills.map((item) => item.name), engine: skills.some((item) => item.percentByLevel) ? "minion" : null });
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
    sources: { tlidb: entry.tlidb, gameData: entry.groupId ? `config_skill_damage group ${entry.groupId} (% of Minion Base Damage, levels 1–20)` : null, timing: entry.timing?.source || null }
  })]),
  ...(profile.aliases || []).filter((name) => !profile.skillNames.includes(name)).map((name) => [name, Object.freeze({
    name, kind: "minion", engine: profile.engine, damageType: profile.skills[0]?.type || null, dealtTypes: [...new Set(profile.skills.map((entry) => entry.type).filter(Boolean))], tags: catalog.get(name)?.tags || [],
    delivery: "minion", minionKey: profile.key, minion: profile.minion, summon: profile.summon, family: profile.family, minionRole: "alias", alias: true,
    canInflictHitAilments: false, builtInReaping: null,
    reason: profile.engine ? null : `no game damage row for the ${profile.minion}'s skills`,
    note: name === profile.summon ? `${name}: the summon skill activates the ${profile.minion}; its damage is the Minion's skill cycle (${profile.skillNames.join(", ")}).` : `${name}: activates the ${profile.minion} in the planner.`,
    sources: { tlidb: catalog.get(name)?.source || null, gameData: profile.skills.map((entry) => entry.groupId).filter(Boolean).map((id) => `config_skill_damage group ${id}`).join(" / ") || null, timing: profile.summonCastSource || null }
  })])
])));
