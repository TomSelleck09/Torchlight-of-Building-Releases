// The attribute writes of the buffs held on a unit buff set (W9 step 2, 2026-11-03; for step 3, the tagged attribute pool:
// research/unified-state-design-2026-11-03.md §4). Read only: it lists, it does not sum (the pool does).
//
// A held buff with a game record (its `buff` id) has affix rows in config_char_buff (src/data/game/skill-game-values.generated.js
// SKILL_BUFFS[name] = { id, rows: { mode: [[affix, args, stacks?]] } }: row "0" the buff's base form, the Blessings' higher rows their
// changed base effects); each affix's recipe (src/data/game/affix-recipes.generated.js) writes attributes with node 101: { a: attribute,
// m: mod (1 flat, 2 added min / max, 3 increased, 4 additional, 5 total), v / u: the value expressions, tg: the tag requirement (mine /
// others / notMine lists; objects are alternatives) }. A value expression reads the affix's parameters (p0, p1 …) at the buff's level
// (gameLevelValue on a level map) and `scale` (GetEffectScale: the buff's effect multiplier, Aura Effect for an Aura, Focus Buff Effect,
// Empower / Warcry / Elixir Skill Effect, Blessing Effect), as src/focus-buffs.js reads them.
//
// Each write is listed with its buff, affix, row, attribute, mod, tags and value at the entry's level and effect; `stacks` and `share`
// say how the pool should weigh it (a stacked buff per stack; a part-time buff at its steady share, or per tick from its series). Writes
// the evaluator cannot read here (a GetMaxMin, a buff-stack function, a field or conversion node) keep their expression (`expression`) and
// `value: null`, so the pool sees them and settles them itself. What the rows do not hold (the Blessings' per-stack additional damage
// affixes 571337024 / 821039424 sit in the record's second affix list, which SKILL_BUFFS does not carry; a buff with no record: Origin,
// the follower's buffs) is listed in `missing`.
import { SKILL_BUFFS } from "./data/game/skill-game-values.generated.js";
import { AFFIX_RECIPES } from "./data/game/affix-recipes.generated.js";
import { gameLevelValue } from "./game-skill-data.js";
import { UnitBuffSet } from "./unit-buff-set.js";
import { OWN_BUFF_RECORD_TABLE } from "./data/game/own-buff-records.generated.js";

// The skill buffs' rows (SKILL_BUFFS), then the keyword buffs' (Aggression, Hasten, Fortitude, Profane: the own-buff table's fifth column).
const BUFF_BY_ID = new Map(Object.entries(SKILL_BUFFS).map(([name, record]) => [record.id, { name, ...record }]));
for (const [id, row] of Object.entries(OWN_BUFF_RECORD_TABLE)) if (row[4] && !BUFF_BY_ID.has(Number(id))) BUFF_BY_ID.set(Number(id), { name: row[0], id: Number(id), rows: row[4] });
/** The config_char_buff rows of a buff id ({ name, id, rows }), or null when the generated tables do not hold it. */
export const buffRecordRows = (id) => BUFF_BY_ID.get(Number(id)) ?? null;
// The Blessings' per-stack additional damage (Agility 571337024 p0 2, Focus 821039424 p0 5: src/blessing-model.js) sits in the config_char_buff
// row's second affix list (ids with no arguments; in the recipe table since W9 step 4, scripts/build-affix-recipes.mjs), not in the
// SKILL_BUFFS rows read here: the Blessing model's `additionalDamagePercent` holds it.
const BLESSING_MISSING = "the per-stack additional damage affix (Agility 571337024, Focus 821039424) is in the record's second affix list, not the rows read here: the Blessing model's additionalDamagePercent holds it";

// A value expression: "p0", "p1", "rpn:p0 scale *" (the common forms), or anything else (kept as an expression).
function evaluate(expression, params, scale) {
  if (expression == null) return null;
  const text = String(expression).trim();
  let match = text.match(/^p(\d+)$/);
  if (match) return params[Number(match[1])] ?? null;
  match = text.match(/^rpn:p(\d+) scale \*$/);
  if (match) { const value = params[Number(match[1])]; return Number.isFinite(value) ? value * scale : null; }
  match = text.match(/^rpn:p(\d+)$/);
  if (match) return params[Number(match[1])] ?? null;
  return undefined;
}
const tagsOf = (tg) => (tg == null ? null : Array.isArray(tg) ? tg : [tg]);

/**
 * The attribute writes of one buff record at a level and effect scale.
 * @param {number} buff config_char_buff id
 * @param {object} options { level = 20, effect = 1 (GetEffectScale), row = "0" (the record's mode row) }
 * @returns {{ buff, name, row, writes: object[], other: object[], missing: string|null }}
 */
export function buffRecordWrites(buff, { level = 20, effect = 1, row = "0" } = {}) {
  const record = buffRecordRows(buff);
  if (!record) return { buff, name: null, row, writes: [], other: [], missing: "no config_char_buff rows in the generated table" };
  const writes = [], other = [];
  const scale = Number.isFinite(effect) ? effect : 1;
  for (const [affix, args = [], stacks] of record.rows?.[row] ?? []) {
    const params = args.map((arg) => gameLevelValue(arg, level));
    const recipe = AFFIX_RECIPES[affix];
    if (!recipe) { other.push({ affix, params, reason: "affix not in the recipe table" }); continue; }
    (recipe.r || []).forEach((recipeRow, rowIndex) => {
      for (const effectNode of recipeRow.e || []) {
        if (effectNode.n !== 101 || effectNode.a == null) { other.push({ affix, recipeRow: rowIndex, node: effectNode.n, params: effectNode.p ?? null, template: recipe.t ?? null }); continue; }
        const value = evaluate(effectNode.v, params, scale), upper = effectNode.u != null ? evaluate(effectNode.u, params, scale) : null;
        writes.push({ buff: record.id, buffName: record.name, affix, recipeRow: rowIndex, attr: effectNode.a, mod: effectNode.m ?? null, tags: tagsOf(effectNode.tg), value: value === undefined ? null : value, upper: upper === undefined ? null : upper,
          ...(value === undefined || upper === undefined ? { expression: { v: effectNode.v ?? null, u: effectNode.u ?? null }, params } : {}), scaled: /\bscale\b/.test(`${effectNode.v ?? ""} ${effectNode.u ?? ""}`), template: recipe.t ?? null, ...(recipeRow.g ? { gates: recipeRow.g } : {}), ...(recipeRow.tr ? { trigger: recipeRow.tr } : {}), ...(stacks ? { stackRange: stacks } : {}) });
      }
    });
  }
  return { buff: record.id, name: record.name, row, writes, other, missing: null };
}

/**
 * The attribute writes each held buff on a set contributes (step 3's input): one item per entry with a share above 0 (or every entry with
 * `{ all: true }`), each with its writes at the entry's level and effect (`level`, `effect` on the entry; Blessings at row "0" × their
 * stacks). Entries with no record are listed with `missing`.
 * @param {UnitBuffSet} set a unit buff set (the player's: planner.playerBuffs)
 * @param {object} options { all = false, stage = null, defaultLevel = 20 }
 */
export function heldBuffWrites(set, { all = false, stage = null, defaultLevel = 20 } = {}) {
  if (!(set instanceof UnitBuffSet)) return [];
  const out = [], seen = new Set();
  for (const entry of set.list) {
    if ((!all && !(entry.share > 0)) || entry.view != null || (stage && entry.stage !== stage)) continue;
    // One buff counts once (Aim is both a board Empower and a timed buff with its series: the first entry, the timed one, is kept), and an
    // Aura's own Armor buff on the "armor" stage is that Aura's write already. A combat Armor item with no record of its own (Iron
    // Fortification, the follower's Fortify Line, Prophecy of Shelter) is its one write on attr 4001.
    if (entry.buff != null) { if (seen.has(entry.buff)) continue; seen.add(entry.buff); }
    if (entry.stage === "armor" && entry.duplicateOf) continue;
    const level = Number.isFinite(entry.level) ? entry.level : defaultLevel, effect = Number.isFinite(entry.effect) ? entry.effect : 1;
    const read = entry.buff != null ? buffRecordWrites(entry.buff, { level, effect, row: entry.row ?? "0" })
      : entry.stage === "armor" && Number.isFinite(entry.attr) ? { writes: [{ buff: null, buffName: null, affix: null, attr: entry.attr, mod: entry.mod, tags: null, value: entry.value, upper: null, scaled: false, template: entry.text, source: entry.source }], other: [], missing: null }
      : { writes: [], other: [], missing: "no game buff record (name only)" };
    out.push({ name: entry.name, label: entry.label ?? null, stage: entry.stage, buff: entry.buff, tags: entry.tags, states: entry.states, inflictedBy: entry.inflictedBy, share: entry.share, uptime: Number.isFinite(entry.uptime) ? entry.uptime : null, stacks: entry.stacks ?? null, perStack: entry.stage === "blessing", level, effect, writes: read.writes, other: read.other, missing: entry.stage === "blessing" && entry.label !== "Tenacity" ? BLESSING_MISSING : read.missing });
  }
  return out;
}
