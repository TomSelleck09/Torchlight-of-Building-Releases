// Empower Skills' Euphoria buffs and Warcry Skills' own buffs on the build's damage (unmodeled-DPS census 2026-10-26 items #1, #3
// and #7; research/unmodeled-dps-census-2026-10-26.md §2.1 / §3). One model for every buff skill without a damage engine of its own,
// generalized from Bull's Rage's Euphoria (src/empower-effects.js, 2026-10-14):
//
//   value   = the buff's game value at the skill's level (config_char_buff via SKILL_BUFFS, src/game-skill-data.js gameLevelValue)
//             × Empower Effect (Empower skills: src/empower-effects.js empowerEffectFactor: Mass Effect, Well-Fought Battle, "+X%
//             Empower Skill Effect", Storm's Command's −99%) or × Warcry Effect (Warcries: "+X% Warcry Effect" increased,
//             "+X% additional Warcry Effect" multiplies);
//   period  = max(trigger interval, effective cooldown): an Activation Medium trigger (Max Multistrike Count, "every X s", Boss /
//             Elite: the dummy is a Boss within 10 m) or an item's chance trigger, capped by the cooldown (rule user-confirmed
//             2026-10-12 for Activation Medium: Boss); without a trigger the skill is cast whenever its cooldown is ready (best
//             case, as Bull's Rage and Aim); effective cooldown = base ÷ (1 + Σ Cooldown Recovery Speed) ÷ Π(1 + additional);
//             every Empower buff skill has a game cooldown (chunk 9: Split headers); a Spirit Magus's own Empower Skill is the Minion model's;
//   uptime  = min(1, duration ÷ period), duration = the skill text's "Lasts N s" × the support duration clauses;
//   ledger  = one time-averaged derived line, value × uptime, in the bucket the buff's game text names (Spell / Attack / Melee /
//             Projectile / Sentry / Slash-Strike / Demolisher skills' damage, damage over time, Minion / Spirit Magi damage, Mark
//             Effect, Numbed Effect, Lucky Damage, Spirit Magus Growth, Cast / Attack Speed);
//   windows = a periodic timed part (src/timed-effects.js): the first use lands at the skill's use time (a manual or cooldown
//             skill), 0 s for an "Always attempts to trigger" medium, one interval in for "every X s" mediums, the first Max
//             Multistrike Count event and item triggers (CLAUDE.md, user decision 2026-10-22); then one per period. Damage lines on
//             skill hits and DoTs follow it; speed, Minion, Mark, Numbed, Lucky and Growth lines keep the steady average in the
//             windows (provisional).
//
// One enemy is affected on the dummy, so "for each enemy affected" buffs hold 1 stack. Provisional readings are listed in
// src/open-questions.js (`empower-buff-*`, `warcry-buff-*`).
import { SKILL_BUFFS } from "./data/game/skill-game-values.generated.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { skillProgressionSs13 } from "./data/skills/skill-progression-ss13.generated.js";
import { gameLevelValue } from "./game-skill-data.js";
import { normalizePercentageText } from "./percentage-text.js";
import { warcryShares } from "./storm-command.js";

const N = "([+-]?\\d+(?:\\.\\d+)?)";
const round = (value) => Math.round(value * 10000) / 10000;
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const PLAIN_COOLDOWN = new RegExp(`^${N}% (additional )?Cooldown Recovery Speed$`, "i");

/** A buff value from the game's config_char_buff record of `skill` (SKILL_BUFFS) at `level`: affix `id`, argument `index`. */
export function skillBuffValue(skill, id, level, index = 0) {
  const rows = SKILL_BUFFS[skill]?.rows || {};
  for (const row of Object.values(rows)) for (const [affix, args] of row) if (affix === id) return gameLevelValue(args?.[index], Math.max(1, Math.floor(level || 20)));
  return null;
}

// Arcane Circle's and Speed Phantom's stack buffs (config_char_buff 10752, 10930) carry no affix: their reference data level tables.
function progressionValue(skill, pattern, level) {
  const entry = skillProgressionSs13[skill];
  const at = String(Math.max(1, Math.min(40, Math.floor(level || 20))));
  const text = entry?.levels?.[at]?.changes?.map(([, change]) => String(change)).find((change) => pattern.test(change)) || entry?.reference || "";
  return Number(text.match(pattern)?.[1]) || 0;
}

const ARCANE_CIRCLE_BOSS_STACKS = 5;
const cooldownOf = (name) => { const value = Number(skillTimingSs13[name]?.cooldown); return value > 0 ? value : null; };
const useTimeOf = (name) => { const value = Number(skillTimingSs13[name]?.useTime); return value > 0 ? value : 1; };

/**
 * When a buff is up: the period between casts, the duration, the uptime and the first cast.
 * @param {object} p
 * @param {string} p.name skill
 * @param {object[]} p.clauses the setup's support clauses (src/support-effects.js)
 * @param {object[]} p.modifierTexts the build's lines (plain Cooldown Recovery Speed)
 * @param {number} p.durationSeconds the skill text's duration
 * @param {number|null} p.cooldownSeconds base cooldown (null: no cooldown record, recast when the buff ends)
 * @param {object[]} p.extraCooldownLines more cooldown lines ({ source, text, value, additional })
 * @param {number|null} p.multistrikeEventsPerSecond Max Multistrike Count events per second (null before the hit pass)
 * @param {object|null} p.item an item's chance trigger { chancePercent, cooldownSeconds, hitsPerSecond, source } or interval trigger
 *   { intervalSeconds, source }
 * @param {number} p.refreshPerSecond duration refreshes per second (Burst of Anger's Elite hits): the chain lasts (e^{λD} − 1) ÷ λ
 */
export function buffTiming({ name, clauses = [], modifierTexts = [], durationSeconds = 6, cooldownSeconds = null, extraCooldownLines = [], multistrikeEventsPerSecond = null, item = null, refreshPerSecond = 0, useTimeSeconds = null } = {}) {
  const cooldownLines = item ? [] : [
    ...clauses.filter((clause) => clause.family === "cooldown" && Number.isFinite(clause.value)).map((clause) => ({ source: clause.source, text: clause.text, value: clause.value, additional: Boolean(clause.additional) })),
    ...modifierTexts.filter((line) => line.origin !== "derived").flatMap((line) => { const match = clean(line.text).match(PLAIN_COOLDOWN); return match ? [{ source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1), additional: Boolean(match[2]) }] : []; }),
    ...extraCooldownLines
  ];
  const cooldownFactor = Math.max(1e-9, 1 + cooldownLines.filter((line) => !line.additional).reduce((sum, line) => sum + line.value, 0) / 100) * cooldownLines.filter((line) => line.additional).reduce((product, line) => product * (1 + line.value / 100), 1);
  const cooldown = item ? (item.cooldownSeconds ?? null) : cooldownSeconds > 0 ? cooldownSeconds / cooldownFactor : null;
  // Multi-Coupling Equation (recipe 359477504): attr 3402 mod 3 on the Empower state tag 5100311, summed with the duration clauses.
  const traitDurationLines = modifierTexts.filter((line) => line.origin !== "derived").flatMap((line) => { const match = clean(line.text).match(/^([+-]?[\d.]+)% Empower and Defensive Skill Effect Duration$/i); return match ? [{ source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1), additional: false }] : []; });
  // General Skill Effect Duration (attr 3402, no tag; 2026-11-01): every Empower buff record (45 of 45 with tag 5100311) and the four
  // Warcry records carry tag 5100310, the tag the audited trait buffs read it by. Item-triggered copies are the same buff records.
  // Steady Accumulation's "Additional -30% Skill Effect Duration" (record 569597: attr 3402 mod 4 on tag 5100310; chunk 4) is its own factor.
  const generalDurationLines = modifierTexts.flatMap((line) => { const match = clean(line.text).match(/^(Additional )?([+-]?[\d.]+)% Skill Effect Duration$/i); return match ? [{ source: line.source, text: line.text, value: Number(match[2]) * (line.multiplier ?? 1), additional: Boolean(match[1]) }] : []; });
  const durationLines = [...(item ? [] : [...clauses.filter((clause) => clause.family === "duration" && Number.isFinite(clause.value)).map((clause) => ({ source: clause.source, text: clause.text, value: clause.value, additional: Boolean(clause.additional) })), ...traitDurationLines]), ...generalDurationLines];
  const baseDuration = durationSeconds * Math.max(0, 1 + durationLines.filter((line) => !line.additional).reduce((sum, line) => sum + line.value, 0) / 100) * durationLines.filter((line) => line.additional).reduce((product, line) => product * (1 + line.value / 100), 1);
  // A chance to refresh the duration on each qualifying hit (rate λ): the buff ends at the first gap longer than its duration;
  // the expected chain of a Poisson stream is (e^{λD} − 1) ÷ λ (provisional; capped at 1 h).
  const lambda = Math.max(0, Number(refreshPerSecond) || 0);
  const duration = lambda > 0 ? Math.min(3600, (Math.exp(Math.min(50, lambda * baseDuration)) - 1) / lambda) : baseDuration;
  const trigger = item ? null : clauses.find((clause) => clause.family === "trigger" && ["maxMultistrike", "interval", "target"].includes(clause.kind) && clause.interval > 0) || null;
  const events = Number.isFinite(multistrikeEventsPerSecond) ? multistrikeEventsPerSecond : null;
  let triggerInterval = null, cadence, firstUseSeconds;
  const use = useTimeSeconds ?? useTimeOf(name);
  if (item?.chancePercent != null) {
    // Recipe 607440 (and its kin): on hit (trigger 1000033), probability P1, then a 4 s cooldown gate: the next successful hit after
    // the cooldown triggers it, every cooldown + 1 ÷ (hits/s × chance) on average (before the hit pass: the cooldown).
    const h = Number(item.hitsPerSecond), p = item.chancePercent / 100;
    triggerInterval = (item.cooldownSeconds || 0) + (h > 0 && p > 0 ? 1 / (h * p) : 0);
    cadence = `triggered by ${item.source}: ${item.chancePercent}% chance on hit, cooldown ${item.cooldownSeconds} s${h > 0 ? `, ${round(h)} hits/s: every ${item.cooldownSeconds} + 1 ÷ (${round(h)} × ${round(p)}) = ${round(triggerInterval)} s` : " (hit rate not measured yet: every cooldown)"} (game recipe 607440; provisional)`;
    firstUseSeconds = triggerInterval;
  } else if (item?.intervalSeconds > 0) {
    triggerInterval = item.intervalSeconds;
    cadence = item.when ? `triggered by ${item.source} every ${round(item.intervalSeconds)} s (${item.when}; provisional)` : `triggered by ${item.source} on hit at most every ${item.intervalSeconds} s (the build hits far more often; provisional)`;
    firstUseSeconds = triggerInterval;
  } else if (trigger) {
    if (trigger.kind === "maxMultistrike") triggerInterval = events == null ? trigger.interval : events > 0 ? Math.max(trigger.interval, 1 / events) : null;
    else triggerInterval = trigger.interval;
    const label = trigger.kind === "maxMultistrike" ? "Activation Medium: Multistrike" : trigger.kind === "target" ? `the ${trigger.target === "boss" ? "Boss" : "Elite"} trigger (the dummy is a Boss within 10 m)` : "the interval trigger";
    cadence = triggerInterval == null ? `${label} finds no Max Multistrike Count events, so it is cast whenever its ${round(cooldown)} s cooldown is ready (best case)`
      : `triggered by ${label} every max(${round(triggerInterval)} s${trigger.kind === "maxMultistrike" && events != null ? ` = max(${trigger.interval} s, 1 ÷ ${round(events)} Max Multistrike Count events/s)` : ""}, cooldown ${cooldown == null ? "none" : `${round(cooldown)} s`}) (rule user-confirmed 2026-10-12 for Activation Medium: Boss)`;
    firstUseSeconds = triggerInterval == null ? use : trigger.startsReady ? 0 : triggerInterval;
  } else {
    cadence = cooldown == null ? `no cooldown record: recast when the buff ends (uptime 1; best case, provisional)` : `cast whenever its ${round(cooldown)} s cooldown is ready (best case, provisional)`;
    firstUseSeconds = use;
  }
  const period = Math.max(triggerInterval ?? 0, cooldown ?? 0) || duration;
  const uptime = period > 0 ? Math.min(1, duration / period) : 1;
  return { cooldownSeconds: cooldown == null ? null : round(cooldown), cooldownLines, durationSeconds: round(duration), baseDurationSeconds: round(baseDuration), durationLines, triggerIntervalSeconds: triggerInterval == null ? null : round(triggerInterval), eventsPerSecond: events, periodSeconds: round(period), uptime: round(uptime), uptimeExact: uptime, firstUseSeconds: round(firstUseSeconds), cadence, refreshPerSecond: lambda };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Empower Skills. Each spec: the buff's duration (skill text), and `effects(level, ctx)` → the buff's lines at full strength
// (before Empower Effect): { kind, value, text(v), reach, note } where kind is "damage" (a skill-hit / DoT line), "speed", "minion",
// "mark", "numbed", "lucky", "growth"; plus the parts it does not model ("unmodeled") and why it is inactive ("inactive").
// Durations: the reference data / game skill descriptions ("Lasts 6s", "The Sentry lasts 5s", "The Projectile lasts for 4s").
const spec = (durationSeconds, durationSource, effects, extra = {}) => ({ durationSeconds, durationSource, effects, ...extra });
export const EMPOWER_BUFF_SPECS = Object.freeze({
  "Bull's Rage": spec(6, "skill text: Lasts 6s", (level) => ({ lines: [{ kind: "damage", value: skillBuffValue("Bull's Rage", 200000285, level), text: (v) => `+${v}% additional Melee Skill Damage`, reach: "hit", scope: "Melee skills' hits" }] })),
  "Secret Origin Unleash": spec(6, "skill text: Lasts 6s", (level, ctx) => {
    const perStack = skillBuffValue("Secret Origin Unleash", 737724, level, 0) ?? 3, cap = skillBuffValue("Secret Origin Unleash", 737724, level, 1) ?? 8;
    const stacks = Math.min(cap, Math.max(0, Math.floor(ctx.focusBlessingStacks || 0)));
    return { lines: [
      { kind: "damage", value: skillBuffValue("Secret Origin Unleash", 181188384, level), text: (v) => `+${v}% additional Spell Damage`, reach: "hit", scope: "Spell skills' hits and a Spell skill's own damage over time" },
      ...(stacks > 0 ? [{ kind: "speed", value: perStack * stacks, text: (v) => `+${v}% Cast Speed`, scope: `Cast Speed: +${perStack}% × ${stacks} Focus Blessing stacks (Blessing model, up to ${cap})` }] : [])
    ], notes: stacks > 0 ? [] : ["its Cast Speed per Focus Blessing stack: no Focus Blessing held (Blessing model)"] };
  }),
  // Mana Boil (chunk 9): Split 801113 adds buff 10040 with duration -1 (for good), so the Euphoria has no timer and ends only at 0 Mana. The drain is the
  // record's one level curve, field 1026, 3 at every level, with no unit in the tables. Read as held while Mana is left unsealed (best case: the build's
  // restoration covers the drain); with all Mana sealed the Mana is 0 and it never holds (open question empower-buff-mana-boil).
  "Mana Boil": spec(null, "Split 801113: no duration (-1), 'Loses the Euphoria effect when Mana drops to 0'", (level, ctx) => ((ctx.manaLeftPercent ?? 100) > 0
    ? { held: true, lines: [{ kind: "damage", value: skillBuffValue("Mana Boil", 101010272, level), text: (v) => `+${v}% additional Spell Damage`, reach: "hit", scope: "Spell skills' hits and a Spell skill's own damage over time, held while Mana is left unsealed (best case; open question empower-buff-mana-boil)" }] }
    : { lines: [], inactive: "all Mana is sealed: 'Loses the Euphoria effect when Mana drops to 0'" })),
  "Star Stalker": spec(4, "skill text: The Projectile lasts for 4s (the character stays inside its area, which moves at the character's Movement Speed: best case)", (level) => ({ lines: [{ kind: "damage", value: skillBuffValue("Star Stalker", 200000403, level), text: (v) => `+${v}% additional Damage Over Time`, reach: "dot", scope: "every damage over time (ailments, skill DoTs)" }] })),
  // Archery Bond / Thunderlight Bond "Skill's max base Sentry quantity is 1": one Sentry at a time, its buff's uptime min(1, duration ÷ the
  // recast period) (census batch 6).
  // The speed lines (records 320413824 on [Attack, Projectile], 367259744 on [Spell, Projectile]) reach a skill with both tags only. "Projectile Quantity is
  // fixed at 1" (254952, a field set on the buff): src/planner.js reads `projectileFixed` on every Projectile hit while the Sentry is up all the time.
  "Archery Bond": spec(6, "skill text: Sentry lasts 6s, max base Sentry quantity 1: one Sentry (the player stands within its 4 m: best case)", (level) => ({ projectileFixed: true, lines: [
    { kind: "damage", value: skillBuffValue("Archery Bond", 200000401, level), text: (v) => `+${v}% additional Projectile Damage`, reach: "hit", scope: "Projectile skills' hits" },
    { kind: "tagSpeed", tags: ["Attack", "Projectile"], value: skillBuffValue("Archery Bond", 320413824, level), text: (v) => `+${v}% Attack Speed for Attack Projectile Skills`, scope: "Attack Projectile skills' Attack Speed" },
    { kind: "tagSpeed", tags: ["Spell", "Projectile"], value: skillBuffValue("Archery Bond", 367259744, level), text: (v) => `+${v}% Cast Speed for Spell Projectile Skills`, scope: "Spell Projectile skills' Cast Speed" }
  ] })),
  "Burst of Anger": spec(6, "skill text: Lasts for 6s", (level, ctx) => ({ lines: [
    { kind: "damage", value: skillBuffValue("Burst of Anger", 984527104, level), text: (v) => `+${v}% additional Attack Damage`, reach: "hit", scope: "Attack skills' hits" },
    ...(!ctx.hasAttackAggression ? [{ kind: "damage", value: 5, empower: false, text: (v) => `+${v}% additional Attack Damage`, reach: "hit", label: "Attack Aggression", scope: "Attack Aggression (game keyword 10000100: +5% additional Attack Damage)" },
      { kind: "speed", value: 5, empower: false, text: (v) => `+${v}% additional Attack Speed`, label: "Attack Aggression", scope: "Attack Aggression (game keyword 10000100: +5% additional Attack Speed)" }] : [])
  ], notes: [ctx.hasAttackAggression ? "its Attack Aggression: the build already holds Attack Aggression" : null, "+100% chance to refresh Duration on defeat: Not on dummy", "Physique (field 2010019) is the body's size: No DPS effect"].filter(Boolean) }),
  { refresh: { id: 299204, label: "+10% chance to refresh the skill's Duration upon hitting an Elite (the dummy is a Boss, so an Elite)" } }),
  "Fixate": spec(6, "skill text: Lasts 6s", (level) => ({ lines: [
    { kind: "damage", value: skillBuffValue("Fixate", 880031744, level), text: (v) => `+${v}% additional damage`, reach: "all", scope: "all your damage (1 enemy affected: 1 stack)" },
    { kind: "mark", value: skillBuffValue("Fixate", 853114432, level), text: (v) => `+${v}% Mark Effect`, scope: "Mark Effect (1 enemy affected: 1 stack)" }
  ] }), { marks: true }),
  // Record 848323 (chunk 9): a Boss entering the circle adds 1 + 4 stacks of buff 10752 (rows 1 and 3; a Rare monster 1 + 1), up to 15, so the dummy gives 5
  // stacks, not 1. The value per stack is in no buff record (10752 has no affix): reference data's level table.
  "Arcane Circle": spec(6, "Split 956492: add-buff 10754 for 6 s (the skill text's Lasts 6s)", (level) => ({ lines: [{ kind: "damage", value: round(progressionValue("Arcane Circle", /([+-]?\d+(?:\.\d+)?)% additional Spell Damage/i, level) * ARCANE_CIRCLE_BOSS_STACKS), text: (v) => `+${v}% additional Spell Damage`, reach: "hit", scope: `Spell skills' hits (the Boss dummy enters the circle: ${ARCANE_CIRCLE_BOSS_STACKS} stacks, record 848323)` }] })),
  "Elemental Shock": spec(6, "skill text: Lasts 6s", (level) => ({ lines: [{ kind: "minion", value: skillBuffValue("Elemental Shock", 101010432, level), text: (v) => `+${v}% additional Minion Elemental Damage`, scope: "Minions' Elemental damage" }] })),
  // Split 869203 (chunk 9): add-buff 10580 for 3 s against the 5 s cooldown. "Gains N Command" (recipe 493545312: fight resource 9, once per cast, × Effect)
  // joins the Command sources as N ÷ the period, the planner's per-second reader of a level that returns (provisional).
  "Dark Gate": spec(3, "Split 869203: add-buff 10580 for 3 s", (level) => ({ lines: [
    { kind: "minion", value: skillBuffValue("Dark Gate", 696798592, level), text: (v) => `+${v}% additional Minion Damage`, scope: "Minion damage" },
    { kind: "command", value: skillBuffValue("Dark Gate", 493545312, level), text: (v) => `+${v} Command per second`, scope: "Command, one gain per cast (recipe 493545312)" }
  ] })),
  // Rising Edge (recipe 758568064, chunk 9): a stack per cast of a Summon-tagged skill (trigger 1000069, tag 6000180), up to P2, while the 6 s buff lasts. Best
  // case the Summon skills on the board are cast whenever ready: r casts/s fill the stacks over the buff, so the mean over the buff is r × D ÷ 2 below the cap
  // and cap × (1 − cap ÷ (2 r D)) past it (open question empower-buff-rising-edge).
  "Rising Edge": spec(6, "skill text: Lasts 6s", (level, ctx) => {
    const per = skillBuffValue("Rising Edge", 758568064, level), cap = skillBuffValue("Rising Edge", 758568064, level, 1) ?? 5, rate = Number(ctx.summonCastsPerSecond) || 0;
    if (!(rate > 0)) return { lines: [], inactive: "no Summon skill on the board to cast while it lasts" };
    const reached = rate * 6, stacks = reached <= cap ? reached / 2 : cap * (1 - cap / (2 * reached));
    return { lines: [{ kind: "minion", value: round(per * stacks), text: (v) => `+${v}% additional Minion Damage`, scope: `Minion damage: +${per}% × ${round(stacks)} mean stacks over the buff (${round(rate)} Summon casts/s, up to ${cap}; game recipe 758568064; provisional)` }] };
  }),
  // Machine Army "This skill +100% additional Status Effect for every 1 Minion owned, stacking up to 7 time(s)." (census batch 6, game recipe
  // 638203072: attr 3401 additional, l0 × 100%, on this skill): its buff's value × (1 + 100% × the Minions owned, up to 7), one more
  // multiplier on top of the build's Empower Effect (provisional: "Minion owned" read as the Minions on the field the stacks count).
  "Machine Army": spec(6, "skill text: Lasts 6s", (level, ctx) => {
    const per = skillBuffValue("Machine Army", 954191744, level), stacks = Math.min(7, Math.max(0, Math.floor(ctx.minionCount || 0)));
    const status = 1 + stacks;
    return stacks > 0 ? { lines: [{ kind: "minion", value: round(per * stacks * status), text: (v) => `+${v}% additional Minion Damage`, scope: `Minion damage: +${per}% × ${stacks} Minions on the field (up to 7), × ${status} from "+100% additional Status Effect for every 1 Minion owned" (game recipe 638203072; provisional)` }],
      notes: [`This skill +100% additional Status Effect for every 1 Minion owned, stacking up to 7 time(s): × ${status} (${stacks} Minions owned)`] } : { lines: [], inactive: "no modeled Minion on the field" };
  }),
  // Dazzling Bloom "While the skill lasts, Spirit Magi deal higher damage to rarer enemies, up to +22 additional damage" (game affix 392194:
  // the full value against a Boss (5002000), a quarter per rarity step below): the dummy is a Boss, so the Spirit Magi take the full value.
  "Dazzling Bloom": spec(3, "skill text: Lasts for 3s", (level, ctx) => ctx.spiritMagi ? { lines: [{ kind: "minion", value: skillBuffValue("Dazzling Bloom", 392194, level), text: (v) => `+${v}% additional Spirit Magi Damage`, scope: "Spirit Magi damage, at its maximum: the dummy is a Boss, the rarest enemy" }],
    notes: ["While the skill lasts, Spirit Magi deal higher damage to rarer enemies, up to the full additional damage against the Boss dummy (game affix 392194)"] } : { lines: [], inactive: "no modeled Spirit Magus" }),
  "Nourishment of Life": spec(6, "skill text: an area that follows the caster for 6s (the Spirit Magi stay in it: best case)", (level, ctx) => ctx.spiritMagi ? { lines: [{ kind: "growth", value: skillBuffValue("Nourishment of Life", 980559, level), text: (v) => `+${v} initial Growth for Spirit Magi`, scope: "Spirit Magus Growth (time-averaged; provisional)" }] } : { lines: [], inactive: "no modeled Spirit Magus" }),
  // Black Hole (chunk 9): buff 10681 for 4 s, record 650898752: P2% additional Damage Over Time per P1 Affliction on an enemy in the hole (node 632 from stat 53,
  // tag 5100309). The hole's own DoT inflicts 100 Affliction per second (skill text), so the dummy reads 100 while it stands in it: 10 steps. That Affliction itself is not joined to the rate.
  "Black Hole": spec(4, "Split 430451: add-buff 10681 for 4 s", (level) => ({ lines: [{ kind: "damage", value: round(skillBuffValue("Black Hole", 650898752, level, 1) * 10), text: (v) => `+${v}% additional Damage Over Time`, reach: "dot", scope: "every damage over time on the dummy in the hole, at its 100 Affliction (10 steps of 10)" }],
    unmodeled: ["the hole's 100 Affliction per second (Effect Cooldown 1 s) is not joined to the Affliction rate"] })),
  // Centralized Loading (chunk 9, never audited before; no Empower tag, so no Empower Effect): Split 214316 adds buff 16170 for 1 s on a 1 s cooldown, record
  // 101010146 "+35% Projectile Damage" at Lv20, increased. Cast on cooldown (best case, its own use time is not taken from the Main Skill, as the Empower Skills').
  "Centralized Loading": spec(1, "Split 214316: add-buff 16170 for 1 s", (level) => ({ lines: [{ kind: "damage", value: skillBuffValue("Centralized Loading", 101010146, level), text: (v) => `+${v}% Projectile Damage`, reach: "hit", scope: "Projectile skills' hits (increased)" }],
    unmodeled: [`+${skillBuffValue("Centralized Loading", 984069, level) ?? 30}% chance to +${skillBuffValue("Centralized Loading", 984069, level, 1) ?? 2} Projectile Quantity on Horizontal Projectile Skills (extra projectiles reach one dummy only on a Shotgun skill; open question mobility-skill-readings)`] })),
  // Speed Phantom (chunk 9): recipe 594989 gives 1 stack per enemy a Remnant explosion hits, +4 on a Boss (row 3), so its 2 Remnants fill the 8 stacks on the
  // dummy, not 1 per explosion. Buff 10930 has no affix: 2.5% per stack from reference data, 1.2 s from the skill text. The dash breaks a channel: inactive with a channeled Main Skill.
  "Speed Phantom": spec(1.2, "skill text: lasting for 1.2s", (level, ctx) => (ctx.mainChanneled ? { lines: [], inactive: "the dash interrupts the channeled Main Skill" } : { lines: [{ kind: "damage", value: round(progressionValue("Speed Phantom", /([+-]?\d+(?:\.\d+)?)% additional Spell Damage/i, level) * 8), text: (v) => `+${v}% additional Spell Damage`, reach: "hit", scope: "Spell skills' hits at 8 stacks (2 Remnants × 5 stacks on the Boss dummy, record 594989)" }] })),
  "Thunderlight Bond": spec(5, "skill text: The Sentry lasts 5s, max base Sentry quantity 1: one Sentry (the player stays by it: best case)", (level, ctx) => ({ lines: [
    { kind: "numbed", value: skillBuffValue("Thunderlight Bond", 709616384, level), text: (v) => `+${v}% Numbed Effect`, scope: ctx.numbed ? "Numbed Effect on the dummy's Numbed" : "Numbed Effect (the build inflicts no Numbed)" },
    { kind: "lucky", value: 0, empower: false, text: () => "Lucky Damage", scope: "Lucky Damage while the buff is persistent (uptime 1)" }
  ] })),
  "Harmonious Field": spec(6, "skill text: Lasts for 6s (the Sentries stand in the area that follows the caster: best case)", (level, ctx) => ({ lines: [{ kind: "damage", value: skillBuffValue("Harmonious Field", 960295424, level), text: (v) => `+${v}% additional Sentry Damage`, reach: "hit", scope: "Sentry skills' hits" }],
    extraEffect: { value: 33 * (ctx.prebuiltSelfBuffs ? (Number(skillTimingSs13["Harmonious Field"]?.channel?.maxStacks) || 5) : 1), text: `+33% additional Empower Effect per channeled stack × ${ctx.prebuiltSelfBuffs ? (Number(skillTimingSs13["Harmonious Field"]?.channel?.maxStacks) || 5) : 1} stacks (${ctx.prebuiltSelfBuffs ? "channeled to max before engaging" : "cold start: 1 stack"}; skill text, provisional)` } }), { recastOnExpiry: true })
});

/** Skills whose buff this module models (support coverage: src/empower-effects.js EMPOWER_BUFF_SKILLS). */
export const EMPOWER_BUFF_NAMES = Object.freeze(Object.keys(EMPOWER_BUFF_SPECS));

const ITEM_PAIR = /^\+?(\d+(?:\.\d+)?) ?% chance to trigger Lv\. (\d+) ([\w' ]+?) and ([\w' ]+?) on hit\. Cooldown: ([\d.]+) ?s\.?$/i;
/** "+X% chance to trigger Lv. N A and B on hit. Cooldown: T s" (recipe 607440 and kin): { chancePercent, level, names, cooldownSeconds }. */
export function parseChanceTriggerPair(text) {
  const match = clean(text).match(ITEM_PAIR);
  return match ? { chancePercent: Number(match[1]), level: Number(match[2]), names: [match[3].trim(), match[4].trim()], cooldownSeconds: Number(match[5]) } : null;
}

const MODELED_KINDS = new Set(["damage", "speed", "tagSpeed", "minion", "mark", "numbed", "lucky", "growth", "command"]);
// A buff with no timer (Mana Boil) is held from its first cast: a duration past any cadence, so its uptime is 1.
const HELD_SECONDS = 3600;

/**
 * One Empower buff entry: the timing, the lines at full strength and their averages, the derived lines and timed parts.
 * @param {object} p { name, level, setup, clauses, effect ({ factor, sources }), empowerScaled, modifierTexts, ctx, item, multistrikeEventsPerSecond, setupKey }
 */
export function empowerBuffEntry({ name, level, clauses = [], effect = { factor: 1, sources: [] }, empowerScaled = true, modifierTexts = [], ctx = {}, item = null, multistrikeEventsPerSecond = null, setupKey = null }) {
  const definition = EMPOWER_BUFF_SPECS[name];
  if (!definition) return null;
  const read = definition.effects(level, ctx) || {};
  const extraFactor = read.extraEffect ? 1 + read.extraEffect.value / 100 : 1;
  const factor = (empowerScaled ? effect.factor : 1) * extraFactor;
  const refresh = definition.refresh ? (skillBuffValue(name, definition.refresh.id, level) ?? 10) / 100 * (Number(ctx.hitsPerSecond) || 0) : 0;
  const durationSeconds = definition.durationSeconds ?? (read.held ? HELD_SECONDS : null);
  const timing = durationSeconds == null ? null : buffTiming({ name, clauses, modifierTexts, durationSeconds, cooldownSeconds: item || definition.recastOnExpiry ? null : cooldownOf(name), multistrikeEventsPerSecond, item, refreshPerSecond: refresh });
  const uptime = timing?.uptime ?? 0;
  // Growth sets the Spirit Magus Stage, a step (Stage = ⌊Growth ÷ 100⌋): a part-time Growth gain is not averaged as Growth; it is
  // applied only when the buff is always up (open question empower-buff-nourishment).
  const steppedOut = (read.lines || []).filter((line) => line.kind === "growth" && uptime < 1 - 1e-9);
  if (steppedOut.length) read.unmodeled = [...(read.unmodeled || []), ...steppedOut.map((line) => `${line.text(round(line.value * factor))} only ${uptime} of the time: Growth sets the Stage in steps, so a time share is not averaged (applied when the buff is always up; open question empower-buff-nourishment)`)];
  const lines = (read.lines || []).filter((line) => Number.isFinite(line.value) && !steppedOut.includes(line)).map((line) => {
    const scale = line.empower === false ? 1 : factor;
    const full = round(line.value * scale);
    // A per-cast gain (Dark Gate's Command) averages over the period, not the uptime.
    const average = line.kind === "command" ? round(line.value * scale / Math.max(1e-9, timing?.periodSeconds || 1)) : round(line.value * scale * (timing?.uptimeExact ?? uptime));
    return { ...line, full, average, text: line.kind === "lucky" ? "Lucky Damage" : line.text(line.kind === "lucky" ? 0 : average), fullText: line.kind === "lucky" ? "Lucky Damage" : line.text(full) };
  });
  const label = (line) => `${name}: ${line.label || "Euphoria"}`;
  const sourceOf = (line) => `${label(line)} (${line.kind === "lucky" ? "uptime 1" : `${round(line.value)}${line.kind === "growth" || line.kind === "command" ? "" : "%"}${line.empower === false ? "" : ` × ${round(factor)} Empower Effect`} × ${uptime} uptime`}${item ? `; ${item.source}` : ""})`;
  const lucky = lines.find((line) => line.kind === "lucky");
  if (lucky) lucky.active = uptime >= 1 - 1e-9;
  const derived = lines.filter((line) => ["damage", "speed", "minion", "growth", "mark", "command"].includes(line.kind) && line.average !== 0).map((line) => ({ text: line.text, source: sourceOf(line), origin: "buff", multiplier: 1, empower: true, empowerBuff: name, kind: line.kind, derivedFrom: sourceOf(line), lineEffect: { conditional: true, key: "empowerBuff", conditionText: `${name} up ${uptime} of the time (time-averaged; provisional)`, provisional: true } }));
  const timed = lines.filter((line) => line.kind === "damage" && line.full !== 0 && timing).map((line) => ({ percent: line.full, reach: line.reach, sourcePrefix: label(line), schedule: { kind: "periodic", durationSeconds: timing.durationSeconds, periodSeconds: timing.periodSeconds, startSeconds: timing.firstUseSeconds } }));
  const unmodeled = read.unmodeled || [];
  const modeled = lines.filter((line) => MODELED_KINDS.has(line.kind) && (line.kind !== "lucky" || line.active));
  const active = !read.inactive && modeled.length > 0 && uptime > 0;
  const status = read.inactive ? "Inactive" : !modeled.length ? (unmodeled.length ? "Not modeled" : "Inactive") : unmodeled.length ? "Partly modeled" : "In calc";
  const factorText = empowerScaled ? ` × Empower Effect ${round(effect.factor)}${read.extraEffect ? ` × ${round(extraFactor)} (${read.extraEffect.text})` : ""}` : "";
  const lineText = lines.map((line) => line.kind === "lucky" ? (line.active ? "Lucky Damage (persistent: uptime 1)" : `Lucky Damage only while persistent (uptime ${uptime} < 1): not applied`) : `${line.fullText} for ${line.scope} → ${line.text} on average`).join("; ");
  const text = read.inactive ? `${name}${item ? ` (${item.source})` : ""} Lv.${level}: inactive (${read.inactive}).`
    : `${name}${item ? ` (${item.source})` : ""} Lv.${level} Euphoria${factorText}: ${lineText || "nothing modeled"}${timing ? `; lasts ${read.held ? "while Mana lasts" : `${timing.durationSeconds} s`}${timing.refreshPerSecond ? ` (6 s, refreshed by ${round(timing.refreshPerSecond)} Elite-hit refreshes/s)` : ""} (${definition.durationSource}); ${timing.cadence}; uptime min(1, ${timing.durationSeconds} ÷ ${timing.periodSeconds}) = ${uptime}; first use at ${timing.firstUseSeconds} s in the 5 s / 20 s windows` : ""}${(read.notes || []).length ? `; ${read.notes.join("; ")}` : ""}${unmodeled.length ? `; not modeled: ${unmodeled.join("; ")}` : ""} (provisional).`;
  return { setupKey, skill: name, kind: "euphoria", projectileFixed: Boolean(read.projectileFixed) && uptime >= 1 - 1e-9, item: item ? { source: item.source, chancePercent: item.chancePercent ?? null, cooldownSeconds: item.cooldownSeconds ?? item.intervalSeconds ?? null, text: item.text } : null, level, base: lines[0]?.value ?? 0, factor: round(factor), value: lines[0]?.average ?? 0, full: lines[0]?.full ?? 0, uptime, active, status, reason: text, empowerScaled, sources: effect.sources || [], euphoria: timing ? { ...timing, level, base: lines[0]?.value ?? 0, value: lines[0]?.full ?? 0, average: lines[0]?.average ?? 0 } : null, lines, derived, timed, unmodeled, marks: Boolean(definition.marks) && active, text };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Warcry Skills' own buffs (game buffs 10350 / 10390 / 11350 / 11800; reference data texts "Lasts 3s" / "3.5s"). Each grants its bonus per
// enemy affected, up to 8: 1 on the dummy. Value × Warcry Effect × uptime, cast whenever the cooldown is ready (the Warcry engine of
// src/storm-command.js: 8 s, Fearless Warcry has no record: 8 s; switch warcriesOnCooldown).
export const WARCRY_BUFF_SPECS = Object.freeze({
  "Fearless Warcry": { durationSeconds: 3, lines: (level) => [
    { value: skillBuffValue("Fearless Warcry", 978301, level), text: (v) => `+${v}% additional Slash-Strike Skill Damage`, reach: "hit", scope: "Slash-Strike skills' hits" },
    { value: skillBuffValue("Fearless Warcry", 904110, level), text: (v) => `+${v}% additional Ailment Damage dealt by Slash-Strike Skills`, reach: "dot", scope: "ailments a Slash-Strike skill inflicts" }
  ] },
  "Raging Warcry": { durationSeconds: 3.5, lines: (level) => [
    { value: skillBuffValue("Raging Warcry", 974303424, level), text: (v) => `+${v}% additional Demolisher Skill Damage`, reach: "hit", scope: "Demolisher skills' hits" },
    { value: skillBuffValue("Raging Warcry", 146702464, level), text: (v) => `+${v}% additional Ailment Damage dealt by Demolisher Skills`, reach: "dot", scope: "ailments a Demolisher skill inflicts" }
  ], unmodeled: (level) => [`+${skillBuffValue("Raging Warcry", 975432, level)}% Demolisher Charge Recovery Speed per enemy affected (the Demolisher Charge cadence does not read it)`] },
  // Charging Warcry (chunk 9): buff 10340, record 809656064, one write of additional damage and one of Ailment Damage on the Shadow Strike tag 6001210.
  // reference data's catalog text prints the Tracking Area line twice and drops this one.
  "Charging Warcry": { durationSeconds: 3, lines: (level) => [
    { value: skillBuffValue("Charging Warcry", 809656064, level), text: (v) => `+${v}% additional Shadow Strike Skill Damage`, reach: "hit", scope: "Shadow Strike skills' hits" },
    { value: skillBuffValue("Charging Warcry", 809656064, level), text: (v) => `+${v}% additional Ailment Damage dealt by Shadow Strike Skills`, reach: "dot", scope: "ailments a Shadow Strike skill inflicts" }
  ] },
  "Shockwave Warcry": { durationSeconds: 3, lines: (level) => [
    { value: skillBuffValue("Shockwave Warcry", 127872560, level), text: (v) => `+${v}% additional Combo Finisher Damage`, reach: "hit", scope: "Combo Finisher hits" },
    // The same affix's Ailment Damage part (attr 3604 mod 4 on the Combo Finisher tag with the ailment tags): read per inflicting Combo
    // skill on the share of its ailment applications its Finisher hits make (src/ailment-applications.js; census item #9, provisional).
    { value: skillBuffValue("Shockwave Warcry", 127872560, level), text: (v) => `+${v}% additional Ailment Damage dealt by Combo Finishers`, reach: "finisherAilment", scope: "ailments the Combo Finishers inflict (their share of the Combo skill's applications)" }
  ] },
  "Commanding Warcry": { durationSeconds: 3, lines: (level) => [
    { value: skillBuffValue("Commanding Warcry", 4007101, level), text: (v) => `+${v}% additional Minion Damage`, minion: true, scope: "Minion damage" }
  ] }
});
export const WARCRY_BUFF_NAMES = Object.freeze(Object.keys(WARCRY_BUFF_SPECS));

const WARCRY_EFFECT = new RegExp(`^${N}% Warcry Effect$`, "i");
const WARCRY_ADDITIONAL = new RegExp(`${N}% additional Warcry Effect`, "i");
const WARCRY_COOLDOWN = new RegExp(`${N}% (additional )?Warcry Cooldown Recovery Speed`, "i");

// Kismet: Lion (chunk 13, record 872646272): a node 306 carrier on casting a Warcry, 4 s each, so the stacks are the Warcries cast in the last 4 s, up to N.
const WARCRY_RECENT = new RegExp(`^For each time Warcry has been cast recently, ${N}% Warcry Effect\\. Stacks up to (\\d+) time\\(s\\)$`, "i");
/** Warcries cast in the last 4 s: 4 s ÷ each board Warcry's cooldown (the Warcry engine's cooldowns, src/storm-command.js). */
export function warcryCastsRecently(warcries = [], modifierTexts = []) {
  return warcryShares({ warcries, modifierTexts, windowSeconds: 4 }).reduce((sum, share) => sum + 4 / Math.max(1e-9, share.cooldownSeconds), 0);
}

/** Warcry Effect from the build's lines: increased Σ, additional Π (the joined "+X% additional Warcry Effect and …" lines too). */
export function warcryEffectFactor(modifierTexts = [], { castsRecently = 0 } = {}) {
  const sources = [];
  let increased = 0, additional = 1;
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const text = clean(line.text);
    let match = text.match(WARCRY_RECENT);
    if (match) { const stacks = Math.min(Number(match[2]), castsRecently), value = Number(match[1]) * stacks * (line.multiplier ?? 1); increased += value; sources.push({ source: line.source, text, value, reading: `increased, ${round(stacks)} stacks` }); continue; }
    match = text.match(WARCRY_EFFECT);
    if (match) { const value = Number(match[1]) * (line.multiplier ?? 1); increased += value; sources.push({ source: line.source, text, value, reading: "increased" }); continue; }
    match = text.match(WARCRY_ADDITIONAL);
    if (match) { const value = Number(match[1]) * (line.multiplier ?? 1); additional *= 1 + value / 100; sources.push({ source: line.source, text, value, reading: "additional (multiplies)" }); }
  }
  return { factor: (1 + increased / 100) * additional, increasedPercent: round(increased), additionalFactor: round(additional), sources };
}

/** "+X% [additional] Warcry Cooldown Recovery Speed" lines (the joined Warcry Effect lines included). */
export function warcryCooldownLines(modifierTexts = []) {
  return modifierTexts.filter((line) => line.origin !== "derived").flatMap((line) => { const text = clean(line.text); const match = text.match(WARCRY_COOLDOWN); return match ? [{ source: line.source, text, value: Number(match[1]) * (line.multiplier ?? 1), additional: Boolean(match[2]) }] : []; });
}

// The enemies a Warcry counts (chunk 9): its Split's area clamps them between addFloor (0, field 2403110) and addLimit (8, field 2403111). "+N to the minimum number of
// enemies affected by Warcry" (recipe 628528704) raises the floor, "For each different Warcry cast, +N … for T s" (606769024) does so per Warcry held, "Doubles Max Warcry
// Skill Effects" (277108064) raises the limit by 8. One dummy: max(1, floor), at most the limit.
const WARCRY_FLOOR = /^\+?(\d+(?:\.\d+)?) to the minimum number of enemies affected by Warcry$/i;
const WARCRY_FLOOR_PER_CAST = /^For each different Warcry cast, \+?(\d+(?:\.\d+)?) to the minimum number of enemies affected by Warcry for [\d.]+ ?s$/i;
const WARCRY_LIMIT_DOUBLED = /^Doubles Max Warcry Skill Effects$/i;
export function warcryEnemiesAffected(modifierTexts = [], warcriesHeld = 1) {
  let floor = 0, limit = 8;
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const text = clean(line.text), plain = text.match(WARCRY_FLOOR), perCast = text.match(WARCRY_FLOOR_PER_CAST);
    if (plain) floor += Number(plain[1]) * (line.multiplier ?? 1);
    if (perCast) floor += Number(perCast[1]) * (line.multiplier ?? 1) * warcriesHeld;
    if (WARCRY_LIMIT_DOUBLED.test(text)) limit = 16;
  }
  return Math.min(limit, Math.max(1, floor));
}

/**
 * One Warcry buff entry.
 * @param {object} p { name, level, setupKey, clauses (the setup's support clauses), modifierTexts, effect (warcryEffectFactor), item ({ intervalSeconds, source }), warcriesHeld }
 */
export function warcryBuffEntry({ name, level, setupKey = null, clauses = [], modifierTexts = [], effect = { factor: 1, sources: [] }, item = null, warcriesHeld = 1 }) {
  const definition = WARCRY_BUFF_SPECS[name];
  if (!definition) return null;
  const enemies = warcryEnemiesAffected(modifierTexts, warcriesHeld);
  const extra = warcryCooldownLines(modifierTexts);
  // The Warcry engine's cooldown (src/storm-command.js warcryShares: 8 s, or the game record) with the Warcry-scoped lines.
  const share = item ? null : warcryShares({ warcries: [{ name, setupKey, cooldownClauses: [...clauses.filter((clause) => clause.family === "cooldown" && Number.isFinite(clause.value)).map((clause) => ({ source: clause.source, text: clause.text, value: clause.value, additional: Boolean(clause.additional) })), ...extra] }], modifierTexts, windowSeconds: definition.durationSeconds })[0];
  const timing = buffTiming({ name, clauses: clauses.filter((clause) => clause.family === "duration"), modifierTexts, durationSeconds: definition.durationSeconds, cooldownSeconds: share?.cooldownSeconds ?? null, item, useTimeSeconds: useTimeOf(name) || 0.8 });
  const lines = definition.lines(level).filter((line) => Number.isFinite(line.value)).map((line) => { const full = round(line.value * enemies * effect.factor); const average = round(full * timing.uptimeExact); return { ...line, full, average, text: line.text(average), fullText: line.text(full) }; });
  const unmodeled = definition.unmodeled ? definition.unmodeled(level) : [];
  const sourceOf = (line) => `${name}: Warcry buff (${round(line.value)}% × ${enemies} enemy affected × ${round(effect.factor)} Warcry Effect × ${timing.uptime} uptime${item ? `; ${item.source}` : ""})`;
  const derived = lines.filter((line) => line.average !== 0).map((line) => ({ text: line.text, source: sourceOf(line), origin: "buff", multiplier: 1, warcryBuff: name, kind: line.minion ? "minion" : "damage", derivedFrom: sourceOf(line), lineEffect: { conditional: true, key: "empowerBuff", conditionText: `${name} up ${timing.uptime} of the time (time-averaged; provisional)`, provisional: true } }));
  const timed = lines.filter((line) => !line.minion && line.full !== 0).map((line) => ({ percent: line.full, reach: line.reach, sourcePrefix: `${name}: Warcry buff`, schedule: { kind: "periodic", durationSeconds: timing.durationSeconds, periodSeconds: timing.periodSeconds, startSeconds: timing.firstUseSeconds } }));
  const cooldownText = item ? timing.cadence : `cast whenever its ${timing.cooldownSeconds} s cooldown is ready (${share?.cooldownSourced ? "game skill data" : "no game cooldown record: read as 8 s"}; best case, switch "Warcries cast on cooldown")`;
  const text = `${name}${item ? ` (${item.source})` : ""} Lv.${level}: ${lines.map((line) => `${line.fullText} for ${line.scope}`).join("; ")} (per enemy affected: ${enemies} on the dummy) × Warcry Effect ${round(effect.factor)}; lasts ${timing.durationSeconds} s (skill text); ${cooldownText}; uptime ${timing.uptime} → ${lines.map((line) => line.text).join("; ")} on average; first cast at ${timing.firstUseSeconds} s in the 5 s / 20 s windows${unmodeled.length ? `; not modeled: ${unmodeled.join("; ")}` : ""} (provisional).`;
  return { setupKey, skill: name, kind: "warcry", item: item ? { source: item.source, intervalSeconds: item.intervalSeconds, text: item.text } : null, level, base: lines[0]?.value ?? 0, factor: round(effect.factor), value: lines[0]?.average ?? 0, full: lines[0]?.full ?? 0, uptime: timing.uptime, active: lines.length > 0 && timing.uptime > 0, status: unmodeled.length ? "Partly modeled" : "In calc", empowerScaled: false, sources: effect.sources, euphoria: timing, lines, derived, timed, unmodeled, text };
}

/**
 * Timed parts (src/timed-effects.js) of the buff entries for the 5 s / 20 s windows and the recount: a hit line reaches the skill
 * hits whose components read it (their additional lines carry the buff's source), a DoT line every damage over time.
 */
export function empowerTimedParts(entries = [], skillHits = []) {
  const parts = [];
  for (const entry of entries) {
    if (!entry?.active) continue;
    for (const part of entry.timed || []) {
      if (part.reach === "dot" || part.reach === "all") parts.push({ type: null, reach: "dot", percent: part.percent, schedule: part.schedule, source: part.sourcePrefix });
      if (part.reach === "hit" || part.reach === "all") {
        const keys = skillHits.filter((hit) => hit.modeled && hit.key && (hit.components || []).some((component) => (component.additional || []).some((line) => String(line.source || "").startsWith(part.sourcePrefix)))).map((hit) => hit.key);
        if (keys.length) parts.push({ type: null, reach: "hit", keys, percent: part.percent, schedule: part.schedule, source: part.sourcePrefix });
      }
    }
  }
  return parts;
}
