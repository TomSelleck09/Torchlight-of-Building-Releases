import { skillProgressionSs13 } from "./data/skills/skill-progression-ss13.generated.js";
import { scorchingBeamSs13 } from "./data/skills/scorching-beam-ss13.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";
import { SKILL_HIT_PROFILES } from "./skill-hit-profiles.js";
import { ATTACK_HIT_PROFILES } from "./attack-hit-profiles.js";
import { skillHitDamageSs13 } from "./data/skills/skill-hit-damage-ss13.generated.js";
import { skillHitDamageNewSkills } from "./data/skills/skill-hit-damage-new-skills.generated.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { tlidbSkillCatalogSs13 } from "./data/catalogs/tlidb-ss13.js";
import { MINION_SKILL_PROFILES } from "./minion-profiles.js";
import { VENDETTA_PROFILES } from "./vendetta-model.js";

// Damage-source profiles: what each skill setup deals, from game data and TLIDB text.
//
// Every enabled setup whose text deals damage gets a profile ({ kind, damageType, delivery,
// engine }). `engine` names the calculation that models it:
//   "scorching-beam" — the calibrated Scorching Beam hit / Ignite path (src/planner.js).
//   "skill-dot"      — a skill whose own damage is a damage-over-time status refreshed by
//                      each use (src/skill-dot-model.js): Wilting Beam.
//   null             — the planner knows the skill deals damage but has no model for it; the
//                      source is listed as "damage not modeled" instead of being dropped.
// Ailments and Reaping are pooled per target by the planner (every active DoT is reaped).
//
// Wilting Beam (TLIDB SS13, https://tlidb.com/en/Wilting_Beam): "Deals 981 Spell Erosion Damage
// every second · Lasts for 2s · Damage Over Time statuses inflicted by the skill can't be spread
// (excludes Ailments)"; "Reaping: Reaps enemies within the Beam Area, dealing 0.5s of Damage Over
// Time. Cooldown: 1.25s."; "Channels up to 5 stacks."; cast interval 0.333 s; mana 8; no
// "effectiveness of added damage" stat is published.
// Game data (config_skill_damage group 431, tools/bin/reverse-engineering/config-logic, read
// 2026-10-10): 20 level rows; the per-second value sits at payload +0x28/+0x30 (both equal) and
// matches TLIDB at every level checked (Lv1 18, Lv2 20, Lv19 822, Lv20 981). The row's +0x10 word
// is 2 (hit rows such as Scorching Beam's 461 carry 1), the type key at +0x20 is 0x151a, and the
// +0x08 double is 182 at every level (Scorching Beam's is its added-damage effectiveness, 38 → 41);
// the meaning of 182 for a DoT skill is not mapped and no added flat damage is applied to the DoT.
// The level-1 description (Chinese) describes a channeled spell beam dealing Erosion damage over
// time; the Reaping line is TLIDB's, not yet located in extracted game data (config_skill is not
// extracted, and none of the 42 node-631 Reap affixes in the affix catalog carries 0.5 s / 1.25 s).
// Past Lv.20 the base is frozen and the skill gains the generic +10% / +8% additional damage per
// level (TLIDB Skill Level; src/engine.js skillLevelDamageMultiplier).
//
// Game records read 2026-10-10 (gamedata-2026-10-10 SkillEditor config_skill_data_354890 / 833277,
// "kuweishexian"): max channel level 5 + field 2006050 (the "+N Max Channeled Stacks" field); the
// Reap is a "reaction_check_level → xuli level meet → reaction_shouge" branch, i.e. it fires when the
// channel stacks reach the maximum, with affix 879177 "The skill reaps P1 s of Damage Over Time when
// reaching max channeled stacks. Cooldown: P2 s" (node 631 reapTime p0, calcReapTimeIncress → Reaping
// Duration applies; node 252 cooldown p1; targets within 20 m carrying buff 10232 "s_kuweishexian_dot",
// the beam's DoT status whose damageId is group 431). TLIDB gives P1 = 0.5 s, P2 = 1.25 s.
// User-confirmed 2026-10-10: Reaping Recovery Speed, Reaping Duration and Affliction all scale this
// Reap; "+1 Beams" does not add DoT statuses (one status per target, refreshed); Aim's Projectile/Beam
// additional damage applies to the beam's DoT.
// Per-stack damage: affix 298562592 "Increases Wilting Beam Damage for every channeled stack" exists in
// the affix catalog, but its rows add stacks of buff 10233 (absent from both config_char_buff extracts)
// and write a constant attr 5719 mod 4 = 100 for "this skill"; no TLIDB line states a per-stack value,
// so no per-stack magnitude is modeled until the buff record or an in-game 1-stack vs 5-stack tick
// comparison fixes it.

const dotLine = /Deals (\d+(?:\.\d+)?) (?:Spell |Attack )?(\w+) Damage every second/i;
const hitLine = /Deals (\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?) (?:Spell |Attack )?(\w+) Damage\b/i;
const dotRange = /Deals (\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))? (?:Spell |Attack )?(\w+) Damage to enemies within it every ([\d.]+)s/i;

function wiltingBeamPerSecondAtLevel(level) {
  const entry = skillProgressionSs13["Wilting Beam"];
  const capped = Math.max(1, Math.min(20, Math.floor(level)));
  if (capped >= 20) return 981;
  const change = entry?.levels?.[String(capped)]?.changes?.find(([, text]) => dotLine.test(text));
  const value = change ? Number(change[1].match(dotLine)[1]) : NaN;
  return Number.isFinite(value) ? value : 981;
}

const WILTING_BEAM = Object.freeze({
  name: "Wilting Beam",
  kind: "dot", engine: "skill-dot",
  damageType: "Erosion", spell: true,
  tags: ["Spell", "Channeled", "Erosion", "Persistent", "Area", "Beam", "Intelligence"],
  delivery: "channel-beam", castIntervalSeconds: 0.333, channeled: true, beam: true, maxChanneledStacks: 5,
  // The DoT status: refreshed by every beam use; one status per target (user-confirmed 2026-10-10:
  // "+1 Beams" does not add separate statuses).
  dot: { durationSeconds: 2, perSecondAtLevel: wiltingBeamPerSecondAtLevel, stacking: "strongest", referenceLevel: 20, referencePerSecond: 981 },
  // Built-in Reaping: on reaching max channeled stacks (game record, affix 879177), 0.5 s of its DoT,
  // 1.25 s cooldown (TLIDB values). The planner sets usesPerSecond and usesPerTrigger = max − start + 1:
  // the channel starts at base 1 + Min Channeled Stacks (user-observed 2026-10-10: 1, and 3 with Channel
  // Preparation Lv16) and, provisionally, restarts there after the max-stack Reap (src/planner.js).
  // In-game runs 2026-10-10 (research/wilting-beam-test-2026-10-10.md): recount ≈ DoT DPS × 1.32–1.36 (10 s
  // average) with min stacks 1 or 3, consistent with a cooldown-bound 0.5 s / 1.25 s Reap.
  builtInReaping: { source: "Wilting Beam: Reaping (built-in)", trigger: "max channeled stacks", baseDurationSeconds: 0.5, baseRecoverySeconds: 1.25, builtIn: true, note: "Fires when the channel reaches max stacks (game record), limited by its cooldown; Reaping Duration, Reaping Recovery Speed and Affliction scale it (user-confirmed 2026-10-10)." },
  canInflictHitAilments: false,
  sources: { tlidb: "https://tlidb.com/en/Wilting_Beam", gameData: "config_skill_damage group 431 (levels 1–20)" }
});

const SCORCHING_BEAM = Object.freeze({
  name: "Scorching Beam",
  kind: "hit", engine: "scorching-beam",
  damageType: "Fire", spell: true,
  tags: scorchingBeamSs13.tags.map((tag) => tag[0].toUpperCase() + tag.slice(1)),
  delivery: "channel-beam", castIntervalSeconds: scorchingBeamSs13.baseCastIntervalSeconds, channeled: true, beam: true, maxChanneledStacks: scorchingBeamSs13.baseMaxChanneledStacks,
  hits: scorchingBeamSs13.hits,
  builtInReaping: null,
  canInflictHitAilments: true,
  sources: { tlidb: scorchingBeamSs13.source, gameData: "config_skill_damage groups 461/462 (levels 1–20)" }
});

// Skill-DoT profiles built from a config_skill_damage DoT row (src/data/skills/skill-hit-damage-ss13.generated.js),
// the Wilting Beam shape: a status the skill refreshes, strongest application, levels 1–20 from the game rows and
// frozen past 20. `refreshPerSecond` fixes the application cadence when it is not the main skill's channel rate
// (a cooldown-bound area); `recast` gives a Terra skill's recast cadence (planner: recast.perSecond(cast-speed factor)). Batches 1 and 3 of
// research/skill-inventory-2026-10-11.md (2026-10-11).
const catalogTags = (name) => (tlidbSkillCatalogSs13.find((entry) => entry.name === name)?.tags || []);
const TERRA_CHARGE_DOT = { source: "Terra Charge", text: "+26% additional damage for the skill for every Terra Charge consumed (TLIDB; max 1 stack, 1 per 0.5 s: observed on the in-game Frost Terra Lv16 tooltip 2026-10-12, so every cast at up to 2 casts/s consumes one)", value: 26, category: "Additional damage" };
// Terra recast cadence (spell-terra DoT profiles): one Terra at a time (max base Terra quantity 1), so a recast replaces
// the Terra and its new ground effect applies the 2 s status again (strongest application: it refreshes, it does not
// stack). Best case, as in the user's Frost Terra Lv16 run (2026-10-12: recast whenever a Terra Charge was available),
// the skill is recast every max(use time, Terra Charge interval): the use time from the game Split file (speed type
// "fixed" ignores Cast Speed), and 1 Terra Charge per 0.5 s (in-game tooltip; the Split file's 0.5 s cooldown), so at most
// 2 casts/s and every cast consumes a full charge. Casting faster than the charge would add no DoT uptime and lose the
// Terra Charge bonus. Cooldown Recovery Speed on the charge gain is not applied (unsourced).
function terraRecast(name) {
  const timing = skillTimingSs13[name];
  if (!timing) return null;
  const useTimeSeconds = timing.useTime ?? 1, speedType = timing.speedType || "fixed", chargeIntervalSeconds = timing.cooldown || 0.5;
  return Object.freeze({
    useTimeSeconds, speedType, chargeIntervalSeconds, source: `game Split ${timing.splitId}: use time ${useTimeSeconds} s (${speedType}), Terra Charge every ${chargeIntervalSeconds} s`,
    perSecond: (castSpeedFactor = 1) => 1 / Math.max(speedType === "cast-speed" && castSpeedFactor > 0 ? useTimeSeconds / castSpeedFactor : useTimeSeconds, chargeIntervalSeconds)
  });
}
function dotProfile(name, { groupId, durationSeconds, delivery, channeled = false, castIntervalSeconds = null, refreshPerSecond = null, extraAdditional = [], perAdditionalMaxStackAdditionalPercent = null, notes = [], gameNote = "", unmodeled = [], randomRoll = null }) {
  const table = skillHitDamageSs13[name] || skillHitDamageNewSkills[name];
  const group = (table?.groups || []).find((item) => item.id === groupId) || null;
  const row = (level) => group?.levels?.[String(Math.max(1, Math.min(20, Math.floor(level || 20))))]?.entries?.[0] || null;
  const perSecondAtLevel = (level) => row(level)?.min ?? 0;
  const tags = catalogTags(name);
  const damageType = row(20)?.type || null;
  return Object.freeze({
    name, kind: "dot", engine: group ? "skill-dot" : null, damageType, spell: tags.includes("Spell"), tags,
    delivery, castIntervalSeconds, channeled, beam: tags.includes("Beam"), maxChanneledStacks: channeled ? skillTimingSs13[name]?.channel?.maxStacks ?? 5 : null,
    dot: { durationSeconds, perSecondAtLevel, stacking: "strongest", referenceLevel: 20, referencePerSecond: perSecondAtLevel(20) },
    refreshPerSecond, recast: delivery === "spell-terra" ? terraRecast(name) : null, extraAdditional, perAdditionalMaxStackAdditionalPercent,
    builtInReaping: null, canInflictHitAilments: false, randomRoll: randomRoll ? Object.freeze({ ...randomRoll }) : null,
    notes, unmodeled, reason: group ? null : `no game DoT row linked for ${name}`,
    sources: { tlidb: table?.tlidb || null, gameData: group ? `config_skill_damage group ${groupId} (levels 1–20, DoT row${gameNote ? `; ${gameNote}` : ""})` : null, timing: skillTimingSs13[name] ? `SkillEditor Split ${skillTimingSs13[name].splitId}` : null }
  });
}

const SKILL_DOT_PROFILES = Object.freeze(Object.fromEntries([
  // Batch 1: spell channels whose own damage is a status (Wilting Beam shape: refreshed by every channel use).
  dotProfile("Mind Control", { groupId: 251, durationSeconds: 2, delivery: "channel-other", channeled: true, castIntervalSeconds: 0.333, perAdditionalMaxStackAdditionalPercent: 21.5,
    notes: ["Mind Control: one Link reaches the single dummy (3 + 1 per channeled stack links need other enemies); the DoT (TLIDB: lasts 2 s) is refreshed by every channel use. The 0.5% Max Life per second per link is leech, not damage."] }),
  dotProfile("Path of Flames", { groupId: 161, durationSeconds: 2, delivery: "channel-other", channeled: true, castIntervalSeconds: 0.333, perAdditionalMaxStackAdditionalPercent: 21.5,
    notes: ["Path of Flames: the Fire Path's DoT (TLIDB: lasts 2 s) is taken as refreshed every channel use with the dummy standing on the path (best case; laying the path needs the character to move). The dash hit at max stacks (group 162) carries 0 damage in every game row and is not modeled."] }),
  // Batch 3: Terra ground effects whose only damage is the DoT, with the Terra Charge line. Cadence: recast whenever a
  // Terra Charge is available (terraRecast above; Frost Terra Lv16 dummy run 2026-10-12, tests/frost-terra-dummy-reference.test.js:
  // the 2 s status stays up, uptime 1). The earlier once-per-6 s reading came from the Flame Jet Lv16 run (2026-10-11), which
  // is kept for the skill-hit Terras (src/skill-hit-profiles.js); the two runs disagree for the DoT share (see the test).
  dotProfile("Frost Terra", { groupId: 271, durationSeconds: 2, delivery: "spell-terra", extraAdditional: [{ ...TERRA_CHARGE_DOT, source: "Frost Terra: Terra Charge" }],
    notes: ["Frost Terra: TLIDB: the Terra lasts 6 s (one at a time); 484 Persistent Cold Damage every second for 2 s. Best case: recast whenever a Terra Charge is available (1 per 0.5 s, use time 1 s fixed), so each new Terra re-applies the 2 s status and it stays up. \"Inflicts Frostbite when this skill deals damage\": the dummy is Frostbitten (Base Frostbite Rating 10: +10% additional Cold Damage taken, src/combat-states.js)."] }),
  dotProfile("Thornfield", { groupId: 1201, durationSeconds: 2, delivery: "spell-terra", extraAdditional: [{ ...TERRA_CHARGE_DOT, source: "Thornfield: Terra Charge" }],
    notes: ["Thornfield: TLIDB: the Terra lasts 6 s (one at a time); 486 Persistent Physical Damage every second for 2 s. Best case: recast whenever a Terra Charge is available (as Frost Terra; not checked in game for Thornfield), so the 2 s status stays up. \"1.25% additional damage for this skill for every 100 Max Life, up to +100%\" is not applied (the character's Max Life is not read here); the self True Damage has no DPS effect."] }),
  // Black Hole (Empower): a 4 s area ticking every 0.5 s (game description; DoT row 561), one per 10 s cooldown (game Split 430451).
  dotProfile("Black Hole", { groupId: 561, durationSeconds: 4, delivery: "spell-area", refreshPerSecond: 1 / 10,
    notes: ["Black Hole: game Split 430451: 0.8 s cast, 10 s cooldown (TLIDB's \"Effect Cooldown: 1 s\" is the Affliction effect's); the dummy sits in the hole for its 4 s, so the DoT runs 4 s of every 10 s. Cooldown Recovery Speed is not applied to this cadence. Its 100 Affliction on DoT and the Euphoria (+3.5% additional DoT per 10 Affliction) are not modeled."], gameNote: "ticks every 0.5 s for 4 s" }),
  // Voltaic Ripple (new skill, 2026-10-15): DoT row 1261 (src/data/skills/skill-hit-damage-new-skills.generated.js; Lv.1–20 equal
  // the TLIDB level table, 580 Lightning per second at Lv.20). TLIDB: an electric ring inflicting Voltage for 2 s, 1 s cast,
  // 2 s cooldown, one Terra at a time; the cooldown bounds the cadence at one cast per 2 s, which re-applies the 2 s status as
  // it ends (uptime 1; casting faster is not possible and Cooldown Recovery Speed cannot raise an uptime of 1).
  dotProfile("Voltaic Ripple", { groupId: 1261, durationSeconds: 2, delivery: "spell-terra", refreshPerSecond: 1 / 2,
    extraAdditional: [{ source: "Voltaic Ripple: Terra Charge", text: "+26% additional damage for the skill for every Terra Charge consumed (TLIDB; max 1 stack, 1 per 0.5 s, so every cast, one per 2 s cooldown, consumes one)", value: 26, category: "Additional damage" }],
    // Voltage's random roll (src/lucky-damage.js, read by src/skill-dot-model.js): ×1 without Lucky, the best of two with Lucky Damage.
    randomRoll: { label: "Voltage roll", minPercent: 50, maxPercent: 150 },
    notes: ["Voltaic Ripple: \"This damage changes randomly between 50% and 150%\" averages to 100% (the midpoint), so the listed value is the plain average; with Lucky Damage the game rolls twice and keeps the higher (manual \"Lucky & Unlucky\"), 50% + 100% × 2/3 = 116.67%, ×1.1667 (Very Lucky: best of three, ×1.25). The dummy is read as inside the ring for the whole 2 s (best case). A faster cadence (Cooldown Recovery Speed, an Activation Medium trigger) cannot raise the uptime above 1."], gameNote: "Voltage, 2 s" })
].map((profile) => [profile.name, profile])));

// Generic spell hits (engine "skill-hit", src/skill-hit-model.js): the batch-2a profiles from
// src/skill-hit-profiles.js (game damage rows + Split timing), registered beside the dedicated ones.
// Weapon Attack Damage skills (src/attack-hit-profiles.js) share the engine with the weapon model (src/weapon-damage-model.js).
// Minion skills ("% of Base Damage": Spirit Magus, Synthetic Troop and Modularization skills) go through the Minion
// engine (src/minion-damage-model.js, engine "minion"); a setup of any of a Minion's skills activates that Minion.
// Vendetta / Endless Vendetta (src/vendetta-model.js, engine "trigger-main") deal no damage of their own: they trigger the Main Skill.
export const SKILL_DAMAGE_PROFILES = Object.freeze({ ...SKILL_HIT_PROFILES, ...ATTACK_HIT_PROFILES, ...SKILL_DOT_PROFILES, ...MINION_SKILL_PROFILES, ...VENDETTA_PROFILES, "Scorching Beam": SCORCHING_BEAM, "Wilting Beam": WILTING_BEAM });

const effectsOf = (setup) => [...(allSkillEffectsSs13[setup?.name] || []), ...(setup?.effects || [])].join("\n");

// Profile for any setup from its published text when no dedicated profile exists: kind and damage
// type only (engine null → "damage not modeled").
export function inferDamageProfile(setup) {
  if (!setup?.name) return null;
  if (SKILL_DAMAGE_PROFILES[setup.name]) return SKILL_DAMAGE_PROFILES[setup.name];
  const text = effectsOf(setup);
  let match = text.match(dotRange);
  if (match) return { name: setup.name, kind: "dot", engine: null, damageType: match[3], tags: setup.tags || [], delivery: "area-tick", tickSeconds: Number(match[4]), reason: `${match[3]} damage over time every ${match[4]} s (area tick) has no model yet` };
  match = text.match(dotLine);
  if (match) return { name: setup.name, kind: "dot", engine: null, damageType: match[2], tags: setup.tags || [], delivery: "unknown", reason: `${match[2]} damage over time skill without a delivery model` };
  match = text.match(hitLine);
  if (match) return { name: setup.name, kind: "hit", engine: null, damageType: match[3], tags: setup.tags || [], delivery: "unknown", reason: `${match[3]} hits (${match[1]}–${match[2]} at Lv.20) need a hit model (cast rate, added damage, crit) for this skill` };
  return null;
}

/**
 * Every setup that deals damage of its own, with its modeling status.
 * @returns {{ setupKey, name, role, enabled, active, profile, status: "modeled"|"inactive"|"not modeled", reason }[]}
 */
export function collectSkillDamageSources({ setups = [], activeNames = new Set() } = {}) {
  const sources = [];
  for (const setup of setups) {
    if (setup.enabled === false) continue;
    const profile = inferDamageProfile(setup);
    if (!profile) continue;
    const active = activeNames.has(setup.name);
    const status = !active ? "inactive" : profile.engine ? "modeled" : "not modeled";
    const reason = !active ? "switched off on the board" : profile.engine === "minion" ? `minion engine (${profile.summon})` : profile.engine === "trigger-main" ? "triggers the Main Skill (trigger-main engine)" : profile.engine ? `${profile.engine} engine` : profile.reason || "no damage model for this skill";
    sources.push({ setupKey: setup.setupKey || setup.instanceId || setup.name, name: setup.name, role: setup.role, enabled: setup.enabled !== false, active, profile, status, reason });
  }
  return sources;
}
