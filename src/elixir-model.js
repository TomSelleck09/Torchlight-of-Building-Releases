// Elixir Skills on the training dummy (core audit batch B8: Tailored Remedy, Miraculous Touch; research/core-talents-audit-2026-10-18.md §5).
//
// Sourced:
// - The Elixir Skills' text (reference data, src/data/catalogs/refdata-ss13.js): "Casts this skill and gains an Elixir Effect: <values> Lasts
//   for 3s" (the Lv20 row; values by level come from the game's buff records, see elixirTextAtLevel), and "Defeating enemies can increase the Charging Progress of this skill. At 15 Charging
//   Progress, gains 1 Charge." Restoration Elixirs (Tonics) restore Life / Mana instead. The game skill data gives every Elixir
//   3 charges and a 0.5 s cooldown (src/data/skills/skill-timing-ss13.generated.js).
// - Miraculous Touch (Ethereal Prism core, talent 80002000): affix 558153024 "Elixir Skills gain P1 Charging Progress every
//   second" (node 434: P1 ÷ 30 per server tick, filtered to Elixir-tagged skills). Gear lines of the same wording read the same.
// - Tailored Remedy (Steel Vanguard core, talent 62001400; SS14 record 4104733 + 16269445, the SS13 -40% duration line is gone):
//   "+60% additional Elixir Skill Effect while affected by no more than 2 Elixir Skills" (attr 3631 Inflicted Elixir Effect,
//   additional, while fewer than 3 Elixir buffs are on the player) and "The Restoration Effect from Elixir Skills cannot be
//   removed" (a flag on Restoration effects: defence / recovery only).
//
// Reading (provisional where marked):
// - The dummy is never defeated, so kill-based Charging Progress is 0 there; an Elixir recharges only from "Elixir Skills gain
//   N Charging Progress every second" lines: charges per second = N ÷ 15, capped by the 0.5 s cooldown. Each charge is cast
//   at once (best case), and its effect lasts 3 s × (1 + Σ Elixir Duration) × Π(1 + additional): uptime = min(1, casts per
//   second × duration). The charges held when the fight starts are not counted (the sustained reading; the 5 s / 20 s windows
//   use the same average).
// - Elixir Skill Effect scales the effect values: value × (1 + Σ "+X% Elixir Skill Effect") × Π(1 + "+X% additional Elixir Skill
//   Effect") × Tailored Remedy (the planner's reducer for every "Effect" pool; Life Tonic's text says its Restoration "is also
//   affected by Elixir Effect", i.e. Elixir Effects are). Tailored Remedy holds while at most 2 Elixir Skills have uptime (a
//   build with more is not split by time: provisional).
// - Each value line of an Elixir Effect becomes one time-averaged derived plain line (value × Elixir Skill Effect × uptime) that
//   every engine reads like the same plain line. State lines (Has Blur, Damage triggers Lucky, the Ignite → Scorch swap, the
//   Energy Shield rules) cannot be averaged and are not modeled; Prism Butterfly's Infiltrations are read in src/combat-states.js (chunk 9). "Triggers the Elixir
//   Skill …" lines are not read.
// - A setup's own supports (chunk 9; Sage note §10): Hyper Metabolism's Charging Progress per second (recipe 160618912), Medicinal Buildup's share of the skill's
//   Charging Progress back on each cast (558427712: a charge costs 15 × (1 − X%)), and the Duration clauses ("+X% Duration for the supported skill", attr 3402 on this
//   skill: Extended, Shortened, the Activation Mediums' tiers), increased in one sum, additional each a factor. General "+X% Skill Effect Duration" (attr 3402, no tag)
//   reaches the buff too: every Elixir buff carries tag 5100310, the tag the Empower, Warcry and trait buffs read it by. It joins the same attribute, so it sums with
//   the clauses, and Elixir Duration (attr 3630) stays its own factor (inferred, as Sage's Scattered Spore).
// - Miraculous Gain ("Triggers Miraculous Gain when casting an Elixir Skill"; hyperlink 814: randomly one of four effects for 6 s,
//   up to 4 times within 1 s). Game record 910275584 (chunk 4, 2026-11-01): one Probability node with bAverage and no weights over 13
//   children: ten Lv. 20 skill casts (node 2320), buff 20420 (2 s, the Main Skill every 0.2 s: 10 casts, checkCD on), God of War's
//   Blessing, buff 20421 (6 s: +1 max stack of each Blessing and a fill every 1 s). So each outcome is 1/13, not the 25% of the
//   2026-10-19 Google AI Mode answer; "uniform over the children" is the inferred link. Averaged (miraculousGainState): the Main Skill
//   gains 1/13 × 10 uses per Elixir cast; the Blessings sit at max for min(1, 1/13 × Elixir casts per second × 6 s) of the time. The
//   Lv. 20 skills (10/13 of the outcomes), God of War's Blessing and the +1 max stack are not modeled.
import { refdataSkillCatalogSs13 } from "./data/catalogs/refdata-ss13.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { normalizePercentageText } from "./percentage-text.js";
import { SKILL_BUFFS } from "./data/game/skill-game-values.generated.js";
import { skillProgressionSs13 } from "./data/skills/skill-progression-ss13.generated.js";
import { buffDataMode, gameLevelValue } from "./game-skill-data.js";

export const ELIXIR_PROGRESS_LINE = /^Elixir Skills gain (\d+(?:\.\d+)?) Charging Progress every second$/i;
export const ELIXIR_EFFECT_LINE = /^([+-]\d+(?:\.\d+)?)% Elixir Skill Effect$/i;
export const ELIXIR_ADDITIONAL_EFFECT_LINE = /^([+-]\d+(?:\.\d+)?)% additional Elixir Skill Effect$/i;
export const TAILORED_REMEDY_LINE = /^\+(\d+(?:\.\d+)?)% additional Elixir Skill Effect (?:while affected by|when equipped with) no more than (\d+) Elixir Skills?$/i;
export const ELIXIR_DURATION_LINE = /^([+-]\d+(?:\.\d+)?)% (additional )?Elixir Skill (?:Effect )?Duration$/i;
const SKILL_EFFECT_DURATION_LINE = /^(Additional )?([+-]?\d+(?:\.\d+)?)% Skill Effect Duration$/i;
export const RESTORATION_KEPT_LINE = /^The Restoration Effect from Elixir Skills cannot be removed$/i;
export const MIRACULOUS_GAIN_LINE = /^Triggers Miraculous Gain when casting an Elixir Skill$/i;
// Sage – Licorice Note's Artificial Moon line (hero trait audit B8): an additional Elixir Skill Effect for the Scent Bottle Elixirs
// only (setups with `bottle`), not for an Elixir the player placed on the skill board.
export const BOTTLE_ADDITIONAL_EFFECT_LINE = /^([+-]\d+(?:\.\d+)?)% additional Elixir Skill Effect for the Elixir Skills from any Scent Bottle$/i;
// Elixir Fairies "1.5% Elixir Skill Effect for every Elixir Skill cast recently. Stacks up to 12 time(s)" (game recipe 8977413, 2026-10-28:
// on casting an Elixir Skill (trigger 1000069, tag 6000420) a 4 s timed stack, mode 3, up to 12, each +P1% increased Inflicted Elixir
// Effect, attr 3631): stacks = min(cap, the Elixirs' casts per second × 4 s), joined to the increased Elixir Skill Effect (provisional:
// each stack its own 4 s timer, regular casts).
export const ELIXIR_EFFECT_PER_CAST_LINE = /^\+?(\d+(?:\.\d+)?)% Elixir Skill Effect for every Elixir Skill cast recently\. Stacks up to (\d+) time\(s\)$/i;
const ELIXIR_RECENT_SECONDS = 4;
const DEFAULT_PROGRESS_PER_CHARGE = 15;
const DEFAULT_DURATION_SECONDS = 3;
const round = (value) => Math.round(value * 10000) / 10000;
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const bottleLabel = (setup) => setup.bottle === "special" ? " (Special Scent Bottle)" : setup.bottle ? " (Basic Scent Bottle)" : "";

// Value lines an Elixir Effect carries that scale linearly (time-averaged as derived lines), each with whether it can move dummy damage.
const VALUE_LINES = [
  { pattern: /^([+-])(\d+(?:\.\d+)?)% (Critical Strike Rating|Hit Damage|Damage Over Time|Affliction Effect|Attack and Cast Speed)$/i, damage: true },
  { pattern: /^(\d+(?:\.\d+)?)% (Elemental Resistance Penetration for Spell Skills)$/i, damage: true, unsigned: true },
  { pattern: /^Adds (\d+(?:\.\d+)?)% of (Physical Damage) (as|to) (Fire|Cold|Lightning) Damage$/i, damage: true, adds: true },
  { pattern: /^([+-])(\d+(?:\.\d+)?)% (Movement Speed|Projectile Speed|Elemental and Erosion Resistance|Max Elemental Resistance|Defense)(?:, up to [+-]?\d+(?:\.\d+)?%)?$/i, damage: false },
  { pattern: /^([+-])(\d+) (Armor|Evasion)$/i, damage: false, flat: true }
];

// The catalog's Elixir text is the Lv20 row. The game's buff record (config_char_buff via SKILL_BUFFS; 2026-10-30) holds each value as a
// level map or a fixed number: a number of the text that is a level map's Lv20 value takes that map's value at the skill's level; a
// fixed argument (Tenacity Dew's +4% Max Elemental Resistance, Scorpion Stinger's +15% Movement Speed, the "up to" caps) stays as
// printed. The Tonics have no buff record: their restoration lines come from the reference data level table (skillProgressionSs13). The
// Elixir's level is its setup's effective level; a Basic Scent Bottle Elixir takes the same level lines (src/planner.js
// bottleElixirLevel). TLI_BUFF_PATH=text keeps the Lv20 text.
const CATALOG_LEVEL = 20;
function levelMapsAtCatalogLevel(name) {
  const rows = SKILL_BUFFS[name]?.rows;
  const list = rows ? rows[Object.keys(rows)[0]] : [];
  return new Map((list || []).flatMap(([, args]) => args.filter(Array.isArray).map((arg) => [gameLevelValue(arg, CATALOG_LEVEL), arg])));
}
/** One line of an Elixir's text at `level` (no level, or no game record: the line as printed). */
export function elixirTextAtLevel(name, text, level) {
  const at = Number(level);
  if (level == null || !Number.isFinite(at) || at === CATALOG_LEVEL || buffDataMode() === "text") return text;
  const maps = levelMapsAtCatalogLevel(name);
  if (!maps.size) return text;
  return String(text).replace(/\d+(?:\.\d+)?/g, (number) => maps.has(Number(number)) ? String(gameLevelValue(maps.get(Number(number)), at)) : number);
}

/** Which numbers of a printed Elixir line scale with level (one flag per number), or null for a line the game record does not cover. */
export function elixirLineScales(name, line) {
  const entry = refdataSkillCatalogSs13.find((item) => item.name === name);
  const maps = (entry?.tags || []).includes("Elixir") ? levelMapsAtCatalogLevel(name) : new Map();
  if (!maps.size) return null;
  const shape = (text) => String(text).replace(/\d+(?:\.\d+)?/g, "#");
  const effects = (entry.effects || []).map(String).join("\n").split("\n");
  const printed = effects.find((text) => shape(text) === shape(line));
  return printed ? [...printed.matchAll(/\d+(?:\.\d+)?/g)].map((match) => maps.has(Number(match[0]))) : null;
}

/** The Elixir Effect of one Elixir Skill from its catalog text, at `level` (omitted: the printed Lv20 values): kind, value lines, state lines, duration, progress per charge. */
export function elixirSkillProfile(name, level) {
  const effects = (refdataSkillCatalogSs13.find((entry) => entry.name === name)?.effects || []).map(String);
  const effectText = effects.find((text) => /^Casts this skill and gains (?:an Elixir Effect|restoration):/i.test(text)) || "";
  const kind = /gains an Elixir Effect:/i.test(effectText) ? "effect" : /gains restoration:/i.test(effectText) ? "restoration" : "unknown";
  const levelChanges = level == null || buffDataMode() === "text" ? [] : skillProgressionSs13[name]?.levels?.[Math.max(1, Math.min(40, Number(level)))]?.changes || [];
  const lines = effectText.split(/\n/).map((line, index) => elixirTextAtLevel(name, clean(levelChanges.find(([at]) => at === index)?.[1] ?? line), level)).slice(1).filter(Boolean);
  const durationLine = lines.find((line) => /^Lasts (?:for )?(\d+(?:\.\d+)?) ?s\.?$/i.test(line));
  const durationSeconds = Number(durationLine?.match(/(\d+(?:\.\d+)?)/)?.[1]) || DEFAULT_DURATION_SECONDS;
  const body = lines.filter((line) => line !== durationLine);
  const values = [], states = [];
  for (const text of kind === "effect" ? body : []) {
    const rule = VALUE_LINES.find((item) => item.pattern.test(text));
    // A state line that could change dummy damage (Has Blur, Lucky, the Ignite → Scorch swap, Infiltrations) vs defence / on-kill.
    // Read elsewhere: Lucky (src/lucky-damage.js) and the Infiltrations (src/combat-states.js), so `unread` in the setup's text leaves them out.
    if (rule) values.push({ text, damage: rule.damage, rule }); else states.push({ text, damage: /Damage|Ignite|Scorch|Blur|Ill Omen|Critical|Penetration/i.test(text) && !/damage taken|defeated|bypasses Energy Shield|triggers Lucky|Infiltration/i.test(text) });
  }
  const progressPerCharge = Number(effects.join("\n").match(/At (\d+(?:\.\d+)?) Charging Progress, gains 1 Charge/i)?.[1]) || DEFAULT_PROGRESS_PER_CHARGE;
  const timing = skillTimingSs13[name] || {};
  // Restoration Elixirs (hero trait audit B8, Sage's Elixir of Immortality): "Restores X% Max Life / Max Mana within N s".
  const restoration = kind === "restoration" ? body : [];
  const restores = (pool) => Number(restoration.map((line) => line.match(new RegExp(`^Restores (\\d+(?:\\.\\d+)?)% Max ${pool} within`, "i"))?.[1]).find(Boolean)) || 0;
  const restorationSeconds = Number(restoration.map((line) => line.match(/within (\d+(?:\.\d+)?) ?s/i)?.[1]).find(Boolean)) || 0;
  return { name, level: level == null ? CATALOG_LEVEL : Number(level), kind, values, states, restoration, restoresLifePercent: restores("Life"), restoresManaPercent: restores("Mana"), restorationSeconds, durationSeconds, progressPerCharge, cooldownSeconds: Number(timing.cooldown) > 0 ? Number(timing.cooldown) : 0.5, charges: Number(timing.cdTimes) || 1 };
}

// The scaled text of one value line (value × factor), keeping its wording.
function scaledText(value, factor) {
  const match = value.text.match(value.rule.pattern);
  const scale = (number) => round(Number(number) * factor);
  if (value.rule.adds) return `Adds ${scale(match[1])}% of ${match[2]} ${match[3]} ${match[4]} Damage`;
  if (value.rule.unsigned) return `${scale(match[1])}% ${match[2]}`;
  if (value.rule.flat) return `${match[1]}${scale(match[2])} ${match[3]}`;
  return `${match[1]}${scale(match[2])}% ${match[3]}`;
}

/**
 * @param {object} p { elixirs: [{ name, setupKey, level?, bottle?, extraProgressPerSecond?, extraProgressSources? }], lines: modifier lines
 *   with `clean` (non-derived) }. A Sage Scent Bottle Elixir (hero trait audit B8, src/sage-traits.js) carries `bottle` ("basic" or "special"):
 *   it takes the bottle-only "+X% additional Elixir Skill Effect for the Elixir Skills from any Scent Bottle" lines on top of the
 *   build's, and its own Charging Progress per second from the Functional Ingredient. Each setup carries its own `effectFactor`
 *   and `activeShare` (an Effect Elixir's uptime; a Restoration Elixir's restoring time share).
 * @returns {null | { setups, progressPerSecond, progressSources, effectFactor, increasedPercent, additionalFactor, effectSources,
 *   tailored, durationSources, derived: [{ text, source, conditionText }], hasDamageEffect }}
 */
export function resolveElixirs({ elixirs = [], lines = [] } = {}) {
  const read = (pattern) => lines.flatMap((line) => { const match = (line.clean ?? clean(line.text)).match(pattern); return match ? [{ line, match, value: Number(match[1]) * (line.multiplier ?? 1) }] : []; });
  const progress = read(ELIXIR_PROGRESS_LINE);
  const progressPerSecond = progress.reduce((sum, item) => sum + item.value, 0);
  const increased = read(ELIXIR_EFFECT_LINE), additional = read(ELIXIR_ADDITIONAL_EFFECT_LINE);
  const tailoredLines = read(TAILORED_REMEDY_LINE);
  const durations = read(ELIXIR_DURATION_LINE);
  const durationFactor = Math.max(0, 1 + durations.filter((item) => !item.match[2]).reduce((sum, item) => sum + item.value, 0) / 100) * durations.filter((item) => item.match[2]).reduce((product, item) => product * (1 + item.value / 100), 1);
  // General Skill Effect Duration (attr 3402): "Additional" lines multiply (record 569597), as src/empower-buffs.js buffTiming.
  const generalDuration = read(SKILL_EFFECT_DURATION_LINE).map((item) => ({ value: Number(item.match[2]) * (item.line.multiplier ?? 1), additional: Boolean(item.match[1]) }));
  const seen = new Set();
  const setups = elixirs.filter((setup) => { if (seen.has(setup.name)) return false; seen.add(setup.name); return true; }).map((setup) => {
    const profile = elixirSkillProfile(setup.name, setup.level);
    const clauses = setup.supportClauses || [];
    const charging = clauses.filter((clause) => clause.family === "elixirCharging");
    const extraProgress = Math.max(0, Number(setup.extraProgressPerSecond) || 0) + charging.filter((clause) => clause.kind === "perSecond").reduce((sum, clause) => sum + clause.value, 0);
    const ownProgress = progressPerSecond + extraProgress;
    const refund = Math.min(99, charging.filter((clause) => clause.kind === "refund").reduce((sum, clause) => sum + clause.value, 0));
    const chargesPerSecond = ownProgress / (profile.progressPerCharge * (1 - refund / 100));
    const castsPerSecond = Math.min(chargesPerSecond, 1 / profile.cooldownSeconds);
    // The skill's own Duration: this setup's clauses and the general lines, one attribute.
    const skillDuration = [...generalDuration, ...clauses.filter((clause) => clause.family === "duration" && Number.isFinite(clause.value)).map((clause) => ({ value: clause.value, additional: Boolean(clause.additional) }))];
    const skillDurationFactor = Math.max(0, 1 + skillDuration.filter((item) => !item.additional).reduce((sum, item) => sum + item.value, 0) / 100) * skillDuration.filter((item) => item.additional).reduce((product, item) => product * (1 + item.value / 100), 1);
    const durationSeconds = profile.durationSeconds * durationFactor * skillDurationFactor;
    const uptime = profile.kind === "effect" ? Math.min(1, castsPerSecond * durationSeconds) : 0;
    // A Restoration Elixir's restoring time ("within N s", also affected by Elixir Duration per the Tonics' text).
    const activeShare = profile.kind === "effect" ? uptime : Math.min(1, castsPerSecond * profile.restorationSeconds * durationFactor * skillDurationFactor);
    return { ...profile, setupKey: setup.setupKey, bottle: setup.bottle || null, progressPerSecond: round(ownProgress), extraProgressPerSecond: round(extraProgress), extraProgressSources: setup.extraProgressSources || [],
      chargesPerSecond: round(chargesPerSecond), castsPerSecond: round(castsPerSecond), durationSeconds: round(durationSeconds), uptime: round(uptime), activeShare: round(activeShare) };
  });
  const upCount = setups.filter((setup) => setup.uptime > 0).length;
  const equipped = setups.length;
  const tailored = tailoredLines.map((item) => {
    const limit = Number(item.match[2]);
    const affected = /affected by/i.test(item.line.clean ?? item.line.text);
    const count = affected ? upCount : equipped;
    const holds = upCount > 0 && count <= limit;
    return { source: item.line.source, text: item.line.clean ?? clean(item.line.text), value: item.value, limit, count, holds };
  });
  const tailoredFactor = tailored.filter((item) => item.holds).reduce((product, item) => product * (1 + item.value / 100), 1);
  // Per Elixir cast recently (Elixir Fairies; recipe 8977413): min(cap, every Elixir's casts per second × 4 s) stacks of +X% each.
  const castsPerSecond = setups.reduce((sum, setup) => sum + (Number(setup.castsPerSecond) || 0), 0);
  const perCast = read(ELIXIR_EFFECT_PER_CAST_LINE).map((item) => { const stacks = Math.min(Number(item.match[2]), castsPerSecond * ELIXIR_RECENT_SECONDS); return { ...item, stacks: round(stacks), value: item.value * stacks }; }).filter((item) => item.value > 0);
  const increasedPercent = [...increased, ...perCast].reduce((sum, item) => sum + item.value, 0);
  const additionalFactor = additional.reduce((product, item) => product * (1 + item.value / 100), 1) * tailoredFactor;
  const effectFactor = Math.max(0, 1 + increasedPercent / 100) * additionalFactor;
  const effectSources = [...increased.map((item) => ({ source: item.line.source, text: item.line.clean, value: item.value, kind: "increased" })), ...perCast.map((item) => ({ source: item.line.source, text: item.line.clean, value: round(item.value), kind: "increased", condition: `${item.stacks} Elixir casts in the last ${ELIXIR_RECENT_SECONDS} s (${round(castsPerSecond)} casts/s; game recipe 8977413; provisional)` })), ...additional.map((item) => ({ source: item.line.source, text: item.line.clean, value: item.value, kind: "additional" })), ...tailored.filter((item) => item.holds).map((item) => ({ source: item.source, text: item.text, value: item.value, kind: "additional", condition: `${item.count} Elixir Skill${item.count === 1 ? "" : "s"} ${/affected/i.test(item.text) ? "up" : "equipped"} ≤ ${item.limit}` }))];
  // Scent Bottle Elixirs (Sage): the bottle-only additional lines on top of the build's Elixir Skill Effect.
  const bottleLines = read(BOTTLE_ADDITIONAL_EFFECT_LINE);
  const bottleFactor = bottleLines.reduce((product, item) => product * (1 + item.value / 100), 1);
  const bottleSources = bottleLines.map((item) => ({ source: item.line.source, text: item.line.clean, value: item.value, kind: "additional", condition: "Scent Bottle Elixirs only" }));
  const derived = [];
  for (const setup of setups) {
    setup.effectFactor = round(effectFactor * (setup.bottle ? bottleFactor : 1));
    setup.effectSources = setup.bottle ? [...effectSources, ...bottleSources] : effectSources;
    const factor = setup.effectFactor;
    setup.effectLines = setup.values.map((value) => {
      const scaled = setup.uptime > 0 ? scaledText(value, factor * setup.uptime) : null;
      if (scaled) derived.push({ text: scaled, source: `${setup.name} (Elixir Effect × ${round(factor)} Elixir Skill Effect × ${setup.uptime} uptime)`, conditionText: `${setup.name}${bottleLabel(setup)}: ${value.text} ×${round(factor)} Elixir Skill Effect × ${setup.uptime} uptime (${setup.castsPerSecond} casts/s × ${setup.durationSeconds} s; provisional)`, damage: value.damage, setupKey: setup.setupKey, uptime: setup.uptime });
      return { text: value.text, damage: value.damage, derivedText: scaled };
    });
  }
  const hasDamageEffect = setups.some((setup) => setup.uptime > 0 && setup.values.some((value) => value.damage));
  // The character panel's Elixir state (stat sheet only, 2026-10-30; no damage reader sees it). The Sage capture's panel reads Elixir
  // Effect 173 and Additional Elixir Effect 60 (×4.368): the combat factor's lines without the time-averaged Scent of Ambition (a
  // `combatOnly` line) and with one recent cast per Elixir up (2 → +3%) instead of the combat casts in 4 s (provisional, open question
  // `elixir-panel-state`). An Elixir up less than all the time stays time-averaged.
  const panelShown = (item) => !item.line.combatOnly;
  const panelPerCast = read(ELIXIR_EFFECT_PER_CAST_LINE).map((item) => { const stacks = Math.min(Number(item.match[2]), upCount); return { ...item, stacks, value: item.value * stacks }; }).filter((item) => item.value > 0);
  const panelIncreased = [...increased.filter(panelShown), ...panelPerCast].reduce((sum, item) => sum + item.value, 0);
  const panelAdditional = additional.filter(panelShown).reduce((product, item) => product * (1 + item.value / 100), 1) * tailoredFactor;
  const panelFactor = Math.max(0, 1 + panelIncreased / 100) * panelAdditional;
  const panelLines = upCount ? setups.flatMap((setup) => setup.uptime > 0 ? setup.values.map((value) => ({ text: scaledText(value, panelFactor * (setup.bottle ? bottleFactor : 1) * setup.uptime), source: `${setup.name} (Elixir Effect: ${value.text} × ${round(panelFactor * (setup.bottle ? bottleFactor : 1))} panel Elixir Skill Effect × ${setup.uptime} uptime)`, origin: "elixir", multiplier: 1 })) : []) : [];
  const panelEffectLines = upCount ? [
    ...increased.filter((item) => item.line.elixirEffectExtra && panelShown(item)).map((item) => ({ text: item.line.clean, source: item.line.source, origin: "elixir", multiplier: 1 })),
    ...panelPerCast.map((item) => ({ text: `+${round(item.value)}% Elixir Skill Effect`, source: `${item.line.source} (${item.stacks} recent Elixir casts: one per Elixir up, the panel's state; provisional)`, origin: "elixir", multiplier: 1 })),
    ...tailored.filter((item) => item.holds).map((item) => ({ text: `+${round(item.value)}% additional Elixir Skill Effect`, source: `${item.source} (${item.count} Elixir Skill${item.count === 1 ? "" : "s"} ≤ ${item.limit})`, origin: "elixir", multiplier: 1, contributions: [{ stat: "game:elixirEffect", bucket: "additional", value: item.value }] }))
  ] : [];
  const panel = { effectFactor: round(panelFactor), increasedPercent: round(panelIncreased), additionalFactor: round(panelAdditional), recentCasts: panelPerCast[0]?.stacks ?? 0, combatRecentCasts: perCast[0]?.stacks ?? 0, combatOnly: additional.filter((item) => !panelShown(item)).map((item) => item.line.source), lines: panelLines, effectLines: panelEffectLines, partTime: setups.filter((setup) => setup.uptime > 0 && setup.uptime < 1).map((setup) => ({ name: setup.name, uptime: setup.uptime })) };
  return {
    setups, progressPerSecond: round(progressPerSecond), progressSources: progress.map((item) => ({ source: item.line.source, text: item.line.clean, value: item.value })),
    effectFactor: round(effectFactor), increasedPercent: round(increasedPercent), additionalFactor: round(additionalFactor), effectSources,
    tailored, durationFactor: round(durationFactor), durationSources: durations.map((item) => ({ source: item.line.source, text: item.line.clean, value: item.value, additional: Boolean(item.match[2]) })),
    derived, hasDamageEffect, upCount, bottleFactor: round(bottleFactor), bottleSources, panel
  };
}

/**
 * Lines the stat sheet adds to the standard rows while an Elixir is up (src/stat-sheet.js; never read by a damage path): the Elixir
 * Effects at the panel's factor, the lines that build the "Elixir Skill Effect" row itself, the "while an Elixir Skill is active"
 * buffs as the planner resolved them, and a held Hasten (the panel carries it: Sage capture Cast Speed Additional Bonus −21.97 =
 * 0.7225 × 1.08 − 1). Empty without an Elixir up, so such a build's sheet is unchanged.
 */
export function elixirPanelLines(planner) {
  const panel = planner?.lineEffects?.combat?.elixir?.panel;
  if (!panel?.lines?.length) return [];
  const texts = planner.modifierTexts || [];
  const buff = (line, origin) => ({ text: line.text, source: line.source, origin, multiplier: 1 });
  const whileActive = texts.filter((line) => line.origin === "buff" && /^an Elixir Skill is active/i.test(line.lineEffect?.conditionText || "")).map((line) => buff(line, "elixir"));
  const heldHasten = texts.some((line) => line.origin !== "buff" && !line.lineEffect?.conditional && /^Has Hasten$/i.test(String(line.text).trim()));
  const hasten = heldHasten ? texts.filter((line) => line.origin === "buff" && /^Hasten \(/.test(String(line.source)) && /additional (?:Attack|Cast) Speed$/i.test(String(line.text))).map((line) => buff(line, "held")) : [];
  return [...panel.lines, ...panel.effectLines, ...whileActive, ...hasten];
}

/** The row note for a stat that carries Elixir buffs. */
export function elixirPanelNote(panel) {
  if (!panel?.lines?.length) return "";
  const parts = [`Includes the active Elixir buffs at the character panel's Elixir Skill Effect ×${panel.effectFactor} (+${panel.increasedPercent}% × ${panel.additionalFactor} additional).`];
  const higher = [...panel.combatOnly.map((source) => source.replace(/\s*\(.*$/, "").replace(/^Hero trait: /, "")), ...(panel.recentCasts !== panel.combatRecentCasts ? [`${panel.combatRecentCasts} Elixir casts in 4 s against the panel's ${panel.recentCasts}`] : [])];
  if (higher.length) parts.push(`The combat figures use the in-fight value: ${higher.join(", ")}.`);
  if (panel.partTime.length) parts.push(`Time-averaged by uptime: ${panel.partTime.map((item) => `${item.name} ${Math.round(item.uptime * 1000) / 10}%`).join(", ")}.`);
  return parts.join(" ");
}

/** One sentence on an Elixir Skill's state, for badges and the assumptions. */
export function elixirSetupText(setup, elixirs) {
  if (setup.kind === "restoration") return `${setup.name}: a Restoration Elixir (restores Life / Mana): no damage effect`;
  const where = bottleLabel(setup);
  if (!(setup.uptime > 0)) return `${setup.name}${where}: charged by defeating enemies (${setup.progressPerCharge} Charging Progress per charge); the dummy is never defeated and the build has no "Elixir Skills gain N Charging Progress every second" line${setup.bottle ? " or Functional Ingredient progress" : ""}, so no Elixir Effect is up on the dummy`;
  const values = setup.effectLines.filter((line) => line.derivedText).map((line) => `${line.text} → ${line.derivedText}`).join("; ");
  const unread = setup.states.filter((line) => line.damage);
  const progress = setup.extraProgressPerSecond > 0 ? `${setup.progressPerSecond ?? elixirs.progressPerSecond} Charging Progress/s (${elixirs.progressPerSecond} from the build's lines + ${setup.extraProgressPerSecond} from the Functional Ingredient)` : `${setup.progressPerSecond ?? elixirs.progressPerSecond} Charging Progress/s`;
  return `${setup.name}${where}: ${progress} ÷ ${setup.progressPerCharge} per charge = ${setup.castsPerSecond} casts/s, each lasting ${setup.durationSeconds} s: uptime ${Math.round(setup.uptime * 1000) / 10}% × Elixir Skill Effect ×${setup.effectFactor ?? elixirs.effectFactor}${values ? ` (${values})` : ""}${unread.length ? `; not modeled: ${unread.map((line) => line.text).join("; ")}` : ""} (provisional)`;
}

export const MIRACULOUS_GAIN_SHARE = 1 / 13;
export const MIRACULOUS_GAIN_SECONDS = 6;
export const MIRACULOUS_GAIN_TRIGGERS = 10;

/**
 * Miraculous Gain averaged over the Elixir casts (user-supplied 2026-10-19): { gainsPerSecond, blessingShare,
 * mainSkillUsesPerSecond, sources, text } or null without the line or without an Elixir cast on the dummy.
 */
export function miraculousGainState(elixirs = null, lines = []) {
  const sources = lines.filter((line) => MIRACULOUS_GAIN_LINE.test(line.clean ?? clean(line.text)));
  if (!sources.length || !elixirs?.setups?.length) return null;
  const gainsPerSecond = elixirs.setups.reduce((sum, setup) => sum + (setup.castsPerSecond || 0), 0);
  if (!(gainsPerSecond > 0)) return null;
  const blessingShare = Math.min(1, MIRACULOUS_GAIN_SHARE * gainsPerSecond * MIRACULOUS_GAIN_SECONDS);
  const mainSkillUsesPerSecond = MIRACULOUS_GAIN_SHARE * MIRACULOUS_GAIN_TRIGGERS * gainsPerSecond;
  const text = `Miraculous Gain on ${round(gainsPerSecond)} Elixir casts/s (one per ${round(1 / gainsPerSecond)} s): one of 13 equal outcomes (game record 910275584): the Main Skill triggered ${MIRACULOUS_GAIN_TRIGGERS} times → +${round(mainSkillUsesPerSecond)} Main Skill uses/s; Tenacity / Agility / Focus Blessings at max ${round(blessingShare * 100)}% of the time (1/13 × ${MIRACULOUS_GAIN_SECONDS} s per cast); the Lv. 20 Empower / Defensive Skill and 5 stacks of God of War's Blessing are not modeled`;
  return { gainsPerSecond: round(gainsPerSecond), blessingShare: round(blessingShare), mainSkillUsesPerSecond: round(mainSkillUsesPerSecond), sources: sources.map((line) => line.source), text };
}
