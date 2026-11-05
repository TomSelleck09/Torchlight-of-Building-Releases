// Crowd control holders from the game recipes (wiring audit gap 1, 2026-11-03; research/wiring-audit-2026-11-03.md "Gaps, ranked").
// Every catalog line whose game row applies a buff with the crowd control tag 5100101 (config_char_buff: Paralysis 230, Slow 260,
// Weaken 270, Taunt 280, Blind 20060) holds that type on the dummy at its trigger's rate × chance × the buff's duration. Before this,
// only a few wordings were read by regex (src/combat-states.js), so "25% chance to inflict a stack of Slow on hit" and the others
// counted for no crowd control reader (Wings of Light, Self-Delusion, the pact counter 75106, First Flake, Judgment vs Paralyzed).
//
// One line → its recipe (src/recipe-interpreter.js interpretLine, the line's game ids through lineGameIds) → the rows whose effects
// apply one of those buffs (nodes 301 gain, 374 add stacks, 342 grant) → per row:
//   event     the row's trigger (TRIGGERS in src/recipe-interpreter.js): 1000033 your hit, 1000030 your damage (hits, and a ticking DoT
//             of yours every server tick: wiring audit W2 gap 4, provisional), 1000047 your Minions' damage (Minion hits), 1000060 a
//             triggered skill use (the reading src/combat-states.js already used for 279824224), 1001200 / 1001210 a Regain, 1000069 a
//             cast of a skill carrying the trigger's skill tag (Dazzling Bloom 6101268: only with that skill on the board).
//   chance    gate 188 `probability` (none: every event); gate 184 (`bUseBuffCfgId`) needs that buff held (Agility Blessing 320).
//   duration  the node's own duration, or the record's default for duration -2: 4 s for these five buffs (CLAUDE.md, follower chunk
//             14: "A status added with duration -2 takes its record's default: Paralysis, Slow, Weaken, Taunt, Blind 4 s").
//   radius    a node condition 189 `range` (game units / 100 m) is checked against the standing distance (src/dummy-target.js).
// Support clauses (wiring audit W6a item 1, 2026-11-03; research/wiring-audit-producers-2026-11-03.md gap 1): a support's stone affix
// is read the same way by its game id (supportRecipeCrowdControl); its "this skill" rows (trigger tag 5000002) count the supported
// setup's own events, a row a node 111 hands to "Minions summoned by the supported skill" counts those Minions' hits ("minionHit") or
// fires once per gate-206 cooldown ("interval": Precise: Protection Field's Taunt).
// A row with a gate or trigger the planner cannot rate is left out (the line keeps its other readings). Knockback (240) is instant,
// Frostbite / Freeze are ailments (src/enemy-ailments.js) and Sacrificial Pawn (82128) is Thea's module: none is held here.
import { affixRecipesLoaded, evaluate, interpretLine, loadAffixRecipes } from "./recipe-interpreter.js";
import { normalizePercentageText } from "./percentage-text.js";

let RECIPES = null;
try { RECIPES = (await loadAffixRecipes())?.AFFIX_RECIPES || null; } catch { RECIPES = null; }

export const CROWD_CONTROL_BUFF_TYPES = Object.freeze({ 230: "Paralysis", 260: "Slow", 270: "Weaken", 280: "Taunt", 20060: "Blinding" });
export const CROWD_CONTROL_DEFAULT_SECONDS = 4;
const BUFF_NODES = new Set([301, 374, 342]);
// Trigger → the event whose rate the hold reads (names: src/recipe-interpreter.js TRIGGERS).
export const CROWD_CONTROL_EVENTS = Object.freeze({ 1000033: "hit", 1000030: "damage", 1000047: "minionDamage", 1000060: "triggered", 1001200: "regain", 1001210: "regain", 1000069: "cast" });
const KNOWN_GATES = new Set([188, 184]);

const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const cache = new Map();

/**
 * The crowd control a modifier line's game recipe applies, or null.
 * @returns {null | { id: number, rows: { row: number, event: string|null, trigger: number|null, triggerTags: number[], chancePercent: number,
 *   types: { type: string, buff: number, durationSeconds: number }[], radiusMeters: number|null, requiresBuffs: number[], unknown: string[] }[] }}
 */
export function recipeCrowdControl(line) {
  if (!RECIPES || !affixRecipesLoaded() || !line) return null;
  const text = clean(line.text);
  if (!text) return null;
  const multiplier = Number(line.multiplier ?? 1) || 1;
  const key = `${line.origin}|${line.source}|${text}|${multiplier}`;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  try {
    const resolved = interpretLine(text, { line, multiplier, origin: line.origin ?? null });
    out = crowdControlRows(resolved?.chosen, multiplier);
  } catch { out = null; }
  cache.set(key, out);
  return out;
}

// Locals the recipe table drops (it keeps no LocalVariable rows; read from the raw config_affix_effect rows with
// tools/inspect-tli-affix-effect.mjs, 2026-11-03). Each names what the planner reads for `l0`:
//   296793 Defense Form, row 2: l0 = GetFightResource(9) on filter target 4 (the Minion's summoner): the summoner's Command.
//   937559104 Tidewell: Undertow, row 2 (trigger 1001300, the supported skill consuming Terra Charge): l0 = GetEnergyRank(-1) ÷ p0 × p1,
//     the Terra Charges that use consumed ÷ P1 × P2 (no floor), read by row 1's gate-188 probability on the hits of that use.
const DROPPED_LOCALS = Object.freeze({ 296793: "command", 937559104: "terraChargeConsumed" });
// Target states a trigger's `others` tags name that the planner can settle: 4015180 the target stands on a Frost Terra (寒霜地面).
const TARGET_STATE_TAGS = Object.freeze({ 4015180: "frostTerra" });

/**
 * The crowd control rows of one bound recipe reading (`chosen` from interpretLine). Shared by modifier lines and support clauses.
 * A row a node 111 hands to the holder's Minions (filter target 3: "Minions summoned by the supported skill") runs on those Minions:
 * its 1000033 is their hit ("minionHit"), and a row with no trigger and a gate-206 cooldown fires once per cooldown while one is out
 * ("interval"). A gate-206 cooldown on a triggered row caps its event rate at 1 ÷ cooldown. Gate / node-condition 189 is the radius,
 * a node-condition 188 the chance (Defense Form keeps its chance on the buff node).
 */
function crowdControlRows(chosen, multiplier = 1, buffTypes = CROWD_CONTROL_BUFF_TYPES) {
  const recipe = chosen ? RECIPES[chosen.id] : null;
  const effects = (chosen?.result?.effects || []).filter((effect) => BUFF_NODES.has(effect.node) && buffTypes[effect.buff]);
  if (!recipe || !effects.length) return null;
  const params = chosen.params || {};
  const value = (expr) => evaluate(expr, params, { scale: 1 }).value;
  // Rows a node 111 hands to Minions (filter target 3).
  const minionRows = new Set();
  for (const raw of recipe.r || []) for (const node of raw.e || []) if (node.n === 111 && [].concat(node.to || []).includes(3)) for (const no of [].concat(node.p?.affixes || [])) minionRows.add(Number(no));
  const byRow = new Map();
  for (const effect of effects) { if (!byRow.has(effect.row)) byRow.set(effect.row, []); byRow.get(effect.row).push(effect); }
  const rows = [];
  for (const [index, list] of byRow) {
    const raw = recipe.r?.[index];
    if (!raw) continue;
    const rowNo = raw.no ?? index + 1;
    const runner = minionRows.has(rowNo) ? "minion" : "you";
    const trigger = Number(raw.tr?.id) || null;
    const unknown = [];
    let chancePercent = 100, chanceLocal = null, cooldownSeconds = null, radiusMeters = null;
    const requiresBuffs = [];
    const readChance = (expr, where) => {
      const number = value(expr);
      if (Number.isFinite(number)) { chancePercent = Math.max(0, number) * multiplier; return; }
      const local = DROPPED_LOCALS[chosen.id];
      if (local && /\bl0\b/.test(JSON.stringify(expr))) { chanceLocal = { kind: local, p0: Number(params.p0), p1: Number(params.p1) }; return; }
      unknown.push(`${where} 188 probability not a number`);
    };
    const readRange = (expr) => { const range = value(expr); if (Number.isFinite(range)) radiusMeters = radiusMeters === null ? range / 100 : Math.min(radiusMeters, range / 100); };
    for (const gate of raw.g || []) {
      if (gate.n === 188) readChance(gate.p?.probability, "gate");
      else if (gate.n === 184 && gate.p?.bUseBuffCfgId && Number(gate.p?.buff) > 0) requiresBuffs.push(Number(gate.p.buff));
      else if (gate.n === 206) { const seconds = value(gate.p?.cooldown); if (Number.isFinite(seconds) && seconds > 0) cooldownSeconds = seconds; else unknown.push("gate 206 cooldown not a number"); }
      else if (gate.n === 189) readRange(gate.p?.range);
      else if (!KNOWN_GATES.has(gate.n)) unknown.push(`gate ${gate.n}`);
    }
    let event = trigger ? CROWD_CONTROL_EVENTS[trigger] ?? null : null;
    if (runner === "minion") event = trigger === 1000033 ? "minionHit" : !trigger && cooldownSeconds ? "interval" : null;
    if (!event) unknown.push(trigger ? `trigger ${trigger}${runner === "minion" ? " on the Minions" : ""}` : "no trigger");
    const requiresTargetStates = [];
    for (const tag of [].concat(raw.tr?.tags?.others ?? []).map(Number).filter(Number.isFinite)) { if (TARGET_STATE_TAGS[tag]) requiresTargetStates.push(TARGET_STATE_TAGS[tag]); else unknown.push(`trigger target tag ${tag}`); }
    const types = [];
    for (const effect of list) {
      const node = (raw.e || []).find((item) => item.n === effect.node && Number(item.p?.buff ?? item.p?.buffCfgId ?? item.p?.id) === effect.buff);
      for (const condition of [].concat(node?.c || []).flat()) {
        if (condition?.n === 189) readRange(condition.p?.range);
        else if (condition?.n === 188) readChance(condition.p?.probability, "node");
      }
      const duration = Number(effect.duration);
      // `recordDefault`: the node names no duration of its own (-2, the record's default), so a caller holding another buff can read that buff's.
      const own = Number.isFinite(duration) && duration > 0;
      types.push({ type: buffTypes[effect.buff], buff: effect.buff, durationSeconds: own ? duration : CROWD_CONTROL_DEFAULT_SECONDS, ...(own ? {} : { recordDefault: true }) });
    }
    const triggerTags = [].concat(raw.tr?.tags?.mine ?? []).map(Number).filter(Number.isFinite);
    // A node 623 on the row consumes stacks of a buff of the holder's when it runs (16750813: 1 Agility Blessing per Regain). The planner's holds do
    // not read it (a gate-184 Blessing reads as held); the tick engine's trigger bus does (src/trigger-bus.js, W10 step 3c).
    const consumesBuffs = (raw.e || []).filter((node) => node.n === 623 && Number(node.p?.buffCfgId) > 0).map((node) => ({ buff: Number(node.p.buffCfgId), stacks: Number(node.p?.num) > 0 ? Number(node.p.num) : 1 }));
    rows.push({ row: index, event, trigger, triggerTags, runner, chancePercent, ...(chanceLocal ? { chanceLocal } : {}), cooldownSeconds, types, radiusMeters, requiresBuffs, ...(consumesBuffs.length ? { consumesBuffs } : {}), requiresTargetStates, unknown });
  }
  return rows.length ? { id: chosen.id, rows } : null;
}

// Any buff a line's record puts on the dummy, read like the crowd control rows (W10, src/trigger-bus.js): Intimidated (buff 35063) for the
// trigger bus. `buffTypes` maps a buff id to its name; a duration -2 reads the 4 s these records default to (the caller checks its own buff).
const buffCache = new Map();
export function recipeBuffHolds(line, buffTypes) {
  if (!RECIPES || !affixRecipesLoaded() || !line || !buffTypes) return null;
  const text = clean(line.text);
  if (!text) return null;
  const multiplier = Number(line.multiplier ?? 1) || 1;
  const key = `${Object.keys(buffTypes).join(",")}|${line.origin}|${line.source}|${text}|${multiplier}`;
  if (buffCache.has(key)) return buffCache.get(key);
  let out = null;
  try {
    const resolved = interpretLine(text, { line, multiplier, origin: line.origin ?? null });
    out = crowdControlRows(resolved?.chosen, multiplier, buffTypes);
  } catch { out = null; }
  buffCache.set(key, out);
  return out;
}

/**
 * The rows of the build's lines that spend a stack of a buff of yours when Regaining (W10 step 4a): a node 623 on a 1001200 / 1001210 row (16750813
 * "Upon Regaining, consumes 1 stack of Agility Blessing to inflict Paralysis, Weaken, Slow, and Taunt": gate 184 on buff 320, then node 623 num 1,
 * one row per pool). The spend has no range condition of its own (the 189 range sits on the crowd control nodes), so it runs at either distance.
 * @returns {{ recipeId, row, trigger, pool: "life" | "energyShield", buff, stacks, requiresBuffs, source, text }[]}
 */
export function regainBlessingSpends(lines = []) {
  const out = [];
  for (const line of lines) {
    if (!line || line.origin === "derived" || line.lineEffect) continue;
    const reading = recipeCrowdControl(line);
    for (const row of reading?.rows || []) {
      if (row.event !== "regain" || row.unknown.length || !row.consumesBuffs?.length) continue;
      for (const item of row.consumesBuffs) out.push({ recipeId: reading.id, row: row.row, trigger: row.trigger, pool: row.trigger === 1001210 ? "energyShield" : "life", buff: item.buff, stacks: item.stacks, requiresBuffs: [...row.requiresBuffs], source: line.source, text: clean(line.text) });
    }
  }
  return out;
}

const supportCache = new Map();
/**
 * The crowd control a support clause's stone affix applies (wiring audit W6a item 1, 2026-11-03), or null: the clause's own game id
 * (`planner.supportEffects[…].clauses[].game.id`, config_skill_stone) binds the clause text to its record. Rows on "this skill"
 * (trigger tag 5000002) read the supported setup's own events (src/combat-states.js supportCrowdControl).
 */
export function supportRecipeCrowdControl({ id, text } = {}) {
  if (!RECIPES || !affixRecipesLoaded() || !Number(id) || !RECIPES[id]) return null;
  const body = clean(text);
  const key = `${id}|${body}`;
  if (supportCache.has(key)) return supportCache.get(key);
  let out = null;
  try {
    const resolved = body ? interpretLine(body, { ids: [Number(id)], origin: "support" }) : null;
    const chosen = resolved?.chosen?.id === Number(id) ? resolved.chosen : null;
    out = chosen ? crowdControlRows(chosen, 1) : null;
  } catch { out = null; }
  supportCache.set(key, out);
  return out;
}

/** A dropped local's chance, in percent (DROPPED_LOCALS), from the context; null when it cannot be read. */
export function crowdControlLocalChance(row, { command = null, terraChargesConsumed = null } = {}) {
  const local = row.chanceLocal;
  if (!local) return row.chancePercent;
  if (!(local.p0 > 0) || !Number.isFinite(local.p1)) return null;
  // Defense Form: GetFloorInt(l0 ÷ p0) × p1 with l0 the summoner's Command (row 2's node-188 probability).
  if (local.kind === "command") return Number.isFinite(command) ? Math.max(0, Math.floor(command / local.p0) * local.p1) : null;
  // Tidewell: Undertow: l0 = Terra Charges consumed ÷ p0 × p1 (row 2, no floor); row 1's probability is l0 itself.
  if (local.kind === "terraChargeConsumed") return Number.isFinite(terraChargesConsumed) ? Math.max(0, terraChargesConsumed / local.p0 * local.p1) : null;
  return null;
}

/** Each event's rate per second for a row (null: not measured yet), from the state the planner hands src/combat-states.js. */
export function crowdControlEventRate(row, { rates = null, regainPerSecond = 0, skillCasts = [] } = {}) {
  const base = crowdControlBaseRate(row, { rates, regainPerSecond, skillCasts });
  // A gate-206 cooldown on a triggered row: at most one event per cooldown.
  if (row.cooldownSeconds > 0 && row.event !== "interval" && base !== null) return Math.min(base, 1 / row.cooldownSeconds);
  return base;
}

function crowdControlBaseRate(row, { rates = null, regainPerSecond = 0, skillCasts = [] } = {}) {
  switch (row.event) {
    case "interval": return 1 / row.cooldownSeconds;
    case "minionHit": return rates ? Number(rates.minionHitsPerSecond) || 0 : null;
    case "hit": return rates ? Number(rates.hitsPerSecond) || 0 : null;
    // Your damage (1000030): your hits and your DoT's damage events, one per server tick while a DoT of yours ticks (wiring audit W2
    // gap 4, 2026-11-03; src/trigger-rows.js DOT_TICKS_PER_SECOND; provisional).
    case "damage": return rates ? (Number(rates.hitsPerSecond) || 0) + (Number(rates.dotTicksPerSecond) || 0) : null;
    case "minionDamage": return rates ? Number(rates.minionHitsPerSecond) || 0 : null;
    case "triggered": return rates ? Number(rates.triggeredUsesPerSecond) || 0 : null;
    case "regain": return Number(regainPerSecond) || 0;
    case "cast": {
      const casters = (skillCasts || []).filter((skill) => row.triggerTags.length && row.triggerTags.every((tag) => (skill.tagIds || []).includes(tag)));
      if (!casters.length) return 0;
      if (casters.some((skill) => skill.perSecond === null || skill.perSecond === undefined)) return null;
      return casters.reduce((sum, skill) => sum + (Number(skill.perSecond) || 0), 0);
    }
    default: return 0;
  }
}

/** Whether any line's recipe holds crowd control (the planner's hit pass then measures the event rates). */
export function anyRecipeCrowdControl(lines = [], skip = () => false) {
  return lines.some((line) => line?.origin !== "derived" && !line?.lineEffect && !skip(line) && recipeCrowdControl(line));
}
