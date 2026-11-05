// Trigger rows of a modifier line's game recipe, and which of your event sources they hear (wiring audit W2, 2026-11-03;
// research/wiring-audit-triggers-2026-11-03.md, gaps 1 and 3 to 5).
//
// A recipe row opened by a trigger id (`r[i].tr = { id ≥ 1000000, tags: { mine, others, notMine }, once }`) runs once for every event of
// that id the row's holder raises, when every `mine` tag is on the event and no `notMine` tag is. The event belongs to the unit that holds
// the row, so a line you carry hears your events, not your Minions' or the follower's (those go to their own rows). Trigger ids read here
// (src/recipe-interpreter.js TRIGGERS; evidence classes from the audit):
//   1000033 your hits (inferred: the "on hit" templates)
//   1000030 your damage: hits and DoT damage (table: the "you or Minions deal damage" pairs with 1000047; the "when dealing Damage Over
//           Time" templates sit on it with event tag 5000004)
//   1000031 one record's damage calculation: a hit, or a DoT's value being set (proven: client 0x141c337c0)
//   1000047 your Minions' damage (table: the same pairs)
//   1000074 a use you cast yourself; 1000060 a triggered use (table: 67 "when casting / using" affixes pair the two)
//   1000069 a cast, manual or triggered (inferred)
// A row with none of these (an aura, a held state) is not an event row: `heard` leaves it to the caller.
import { affixRecipesLoaded, interpretLine, loadAffixRecipes } from "./recipe-interpreter.js";
import { normalizePercentageText } from "./percentage-text.js";

let RECIPES = null;
try { RECIPES = (await loadAffixRecipes())?.AFFIX_RECIPES || null; } catch { RECIPES = null; }

export const TRIGGER_IDS = Object.freeze({ hit: 1000033, damage: 1000030, damageCalc: 1000031, minionDamage: 1000047, manualUse: 1000074, triggeredUse: 1000060, cast: 1000069, inflict: 1000150, inflictStacks: 1000160, reap: 1000032 });
// The server tick: a ticking DoT raises one damage event (1000030) per tick (wiring audit W2 gap 4; one event per DoT record per tick is
// inferred: the client's Damage loop runs every DoT each frame, research/tick-engine-prototype-2026-10-31.md; open question
// dot-damage-trigger-events).
export const DOT_TICKS_PER_SECOND = 30;

const ids = (value) => [].concat(value ?? []).flat().map(Number).filter(Number.isFinite);
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const cache = new Map();

// Two or more tag objects on a trigger are alternatives (sourced: research/recipe-interpreter-step1-2026-10-25.md §8): the table keeps their union in
// `tags` and each object in `alt` (5 rows of the table, one on a fixture: Profane on inflicting Wilt or Deterioration, 190801728). `alt` is given
// only when the row has it; a caller matching tags reads an event as fitting when any alternative fits (src/trigger-bus.js rowTags, W10 step 4b).
const alternatives = (tr) => Array.isArray(tr?.alt) && tr.alt.length ? { alt: tr.alt.map((item) => ({ mine: ids(item?.mine), notMine: ids(item?.notMine) })) } : {};

/**
 * The trigger rows of an affix recipe by game id: [{ row, index, trigger, mine, others, notMine, once, nodes, alt? }]: `index` the row's place in the
 * recipe (`r[index]`, src/crowd-control-recipes.js and affixTriggerRowAt number rows so), `nodes` its effect node numbers (a Reap is 631).
 */
export function affixTriggerRows(id) {
  const recipe = RECIPES?.[id];
  if (!recipe) return [];
  return (recipe.r || []).map((row, index) => row.tr && Number(row.tr.id) >= 1000000 ? { row: row.no ?? index + 1, index, trigger: Number(row.tr.id), mine: ids(row.tr.tags?.mine), others: ids(row.tr.tags?.others), notMine: ids(row.tr.tags?.notMine), once: Boolean(row.tr.once), nodes: (row.e || []).map((node) => node?.n), ...alternatives(row.tr) } : null).filter(Boolean);
}

/** The trigger of one recipe row by its place in the recipe (`r[index]`, as src/crowd-control-recipes.js numbers rows), or null. */
export function affixTriggerRowAt(id, index) {
  const row = RECIPES?.[id]?.r?.[index];
  return row?.tr && Number(row.tr.id) >= 1000000 ? { row: row.no ?? index + 1, trigger: Number(row.tr.id), mine: ids(row.tr.tags?.mine), others: ids(row.tr.tags?.others), notMine: ids(row.tr.tags?.notMine), once: Boolean(row.tr.once), ...alternatives(row.tr) } : null;
}

/**
 * A modifier line's recipe id and trigger rows (through the line's game ids, else its wording; src/recipe-interpreter.js interpretLine),
 * or null when no recipe resolves (the browser before the table loads, a planner-made line).
 */
export function lineTriggerRows(line) {
  if (!RECIPES || !affixRecipesLoaded() || !line) return null;
  const text = clean(line.text);
  if (!text) return null;
  const key = `${line.origin}|${line.source}|${text}`;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  try {
    const chosen = interpretLine(text, { line, multiplier: Number(line.multiplier ?? 1) || 1, origin: line.origin ?? null })?.chosen;
    if (chosen?.id && RECIPES[chosen.id]) out = { id: chosen.id, rows: affixTriggerRows(chosen.id) };
  } catch { out = null; }
  cache.set(key, out);
  return out;
}

/** Whether an event carrying `tags` (a Set of game tag ids) fits a row's trigger tags: every `mine` on it, no `notMine`. */
export function rowTagsFit(row, tags) {
  return row.mine.every((tag) => tags.has(tag)) && !row.notMine.some((tag) => tags.has(tag));
}

/**
 * Which of a row's events your build raises, from the sources the caller knows: `hit` (your hits), `dot` (your DoT ticks), `dotSet` (a DoT
 * value set; defaults to `dot`), `minion` (your Minions' damage), `manualUse`, `triggeredUse`, `cast`. Returns null for a trigger this
 * helper does not rate (the caller keeps its own reading).
 */
export function triggerHeard(trigger, sources = {}) {
  const has = (key) => Boolean(sources[key]);
  switch (Number(trigger)) {
    case TRIGGER_IDS.hit: return has("hit");
    case TRIGGER_IDS.damage: return has("hit") || has("dot");
    case TRIGGER_IDS.damageCalc: return has("hit") || (sources.dotSet === undefined ? has("dot") : has("dotSet"));
    case TRIGGER_IDS.minionDamage: return has("minion");
    case TRIGGER_IDS.manualUse: return sources.manualUse === undefined ? null : has("manualUse");
    case TRIGGER_IDS.triggeredUse: return sources.triggeredUse === undefined ? null : has("triggeredUse");
    case TRIGGER_IDS.cast: return sources.cast === undefined ? null : has("cast");
    default: return null;
  }
}

/** Whether any event row of a line hears one of your sources (null: no rated event row, or no recipe). */
export function lineHeard(line, sources = {}) {
  const rows = lineTriggerRows(line)?.rows || [];
  const verdicts = rows.map((row) => triggerHeard(row.trigger, sources)).filter((value) => value !== null);
  return verdicts.length ? verdicts.some(Boolean) : null;
}

/**
 * The timed stack carriers of an affix recipe by game id (W10 step 3a, src/trigger-bus.js): each trigger row whose node 306 adds a timed buff
 * (`mode`, `duration` in s, `count` the stack cap as written: a number or a parameter name) and the attributes its node-b writes carry through
 * it ([{ attr, mod, value }], `value` as written). Fire Swordsman's "+X% Reaping Duration for each recent Reaping" (476089 row 2, 706259) and
 * Scorching Pulse's stack (16649485) are such rows on trigger 1000032.
 */
export function affixStackCarriers(id) {
  const recipe = RECIPES?.[id];
  if (!recipe) return [];
  const out = [];
  (recipe.r || []).forEach((row, index) => {
    if (!row.tr || !(Number(row.tr.id) >= 1000000)) return;
    const carriers = (row.e || []).filter((node) => node.n === 306);
    if (!carriers.length) return;
    const writes = (row.e || []).filter((node) => node.n === "b" && node.via === 306).map((node) => ({ attr: Number(node.a), mod: Number(node.m), value: node.v }));
    for (const node of carriers) out.push({ index, row: row.no ?? index + 1, trigger: Number(row.tr.id), mode: Number(node.p?.mode), durationSeconds: Number(node.p?.duration), count: node.p?.count, writes });
  });
  return out;
}
