// Ignite inputs through the game's attribute data (research/ignite-attribute-mapping-2026-10-09.md).
//
// Resolves each planner modifier line to the game affix it came from (src/data/affix-index-ss13.generated.js),
// classifies every attribute / field / effect write of that affix into an Ignite ledger bucket using the
// tag rules of §3.1, and compares the result with the bucket the planner's regex path uses today (§4).
// Nothing here feeds calculatePlanner: it is a cross-check (tests and scripts/ignite-crosscheck.js).
//
// The attribute side (resolveAffixLine … attributeIgniteLedger) is pure and only needs src/affix-shape.js.
// compareIgniteLedgers reproduces the regex side by calling the planner's own line parsers, so it imports them.

import { baseShape, lineNumbers, shape } from "./affix-shape.js";
import { normalizePercentageText } from "./percentage-text.js";
import { rowReferences } from "./recipe-interpreter.js";
import { collectNormalizedGearModifiers, aggregateSlateEffects } from "./engine.js";
import { parseTalentEffects } from "./candidate-sources.js";
import { parseKismetEffect } from "./kismet-effects.js";
import { nativePactspiritNodeEffect } from "./pactspirit-levels.js";
import { parseReapingSource } from "./reaping-sources.js";
import { parseBlessingRecovery } from "./blessing-gear-effects.js";
import { parseBlurSource } from "./blur-sources.js";
import { selenaScorchingBeamTalentSetupSs13 } from "./data/talents/selena-scorching-beam-ss13.js";

// ---------------------------------------------------------------------------------------------
// Tags (§2.1). Names from the executable's EConfigAttrTag / EConfigSkillTag / EConfigCharState enums.
export const IGNITE_TAGS = Object.freeze({
  THIS_SKILL: 5000002, // E_gaijineng: supported skill / this skill
  HIT: 5000003, // E_jizhong_shanghailiucheng: hit damage flow
  DOT_FLOW: 5000004, // E_chixu_shanghailiucheng: DoT damage flow
  DOT: 5100309, // E_chixushanghaizhuangtai: DoT status
  AILMENT: 5100001, // E_yichangzhuangtai
  ELEMENTAL_AILMENT: 5100002, // E_yuansuzhuangtai
  IGNITE: 5100003, // E_dianranzhuangtai
  TRAUMA: 5100006,
  WILT: 5100007,
  SPELL: 6001100,
  CHANNELED: 6000030,
  AREA: 6000130,
  BEAM: 6000380,
  FIRE_SKILL: 6001030,
  MAIN_SKILL: 6020000,
  ATTACK: 6001090,
  CRIT: 5001010,
  MINION: 5002060,
  ELITE: 5001990,
  BOSS: 5002000,
  RARE: 5002030, // E_elite is monster rarity "Rare", not the Elite rule
  AURA_STATUS: 5100305,
  BLUR_STATUS: 5100205,
  FOCUS_BLESSING_STATUS: 5100210,
  // Character states (EConfigCharState)
  IGNITED: 4000130,
  CURSED: 4000560,
  MAX_AFFLICTION: 4000900,
  BLUR: 4000060,
  BARD: 4030400,
});
const T = IGNITE_TAGS;

// Scorching Beam: Spell / Fire / Channeled / Area / Beam, the main skill, and "this skill".
export const scorchingBeamSkillTags = Object.freeze(new Set([T.SPELL, T.CHANNELED, T.AREA, T.BEAM, T.FIRE_SKILL, T.MAIN_SKILL, T.THIS_SKILL]));
// States that hold on the training dummy under the best-case rules (Boss within 10 m, Ignited, Cursed,
// at max Affliction, Blur and Bard active).
export const DUMMY_STATE_TAGS = Object.freeze(new Set([T.IGNITED, T.CURSED, T.MAX_AFFLICTION, T.BLUR, T.BARD, T.ELITE, T.BOSS]));

const STATE_NAMES = {
  [T.IGNITED]: "target Ignited", [T.CURSED]: "target Cursed", [T.MAX_AFFLICTION]: "target at max Affliction",
  [T.BLUR]: "Blur active", [T.BARD]: "Bard form", [T.ELITE]: "target Elite", [T.BOSS]: "target Boss",
  // config_char_state names (completeness pass 2026-10-25, research/recipe-interpreter-step1-2026-10-25.md §8.5): 4000110 冰封 is
  // Frozen and 4000112 冰结 Frostbite; 4000150 中毒 is Wilted and 4000160 流血 Traumatized (the step-1 labels had both pairs swapped);
  // 4000530 双持 is Dual Wielding. Labels only: nothing keys off these strings.
  4000120: "target Shocked", 4000121: "target Numbed", 4000110: "target Frozen", 4000112: "target Frostbitten",
  4000150: "target Wilted", 4000160: "target Traumatized", 4000411: "at Full Life", 4000530: "Dual Wielding",
};
const isStateTag = (tag) => (tag >= 4000000 && tag < 5000000) || tag === T.ELITE || tag === T.BOSS || tag === T.RARE;
const isSkillTypeTag = (tag) => tag >= 6000000 && tag < 7000000;

// Ledger buckets (§3.2). Indirect buckets are their own layers.
export const BUCKETS = Object.freeze({
  baseIgnite: "Base Ignite",
  baseIgniteFromFlat: "Base Ignite from added flat damage",
  increased: "Increased damage",
  additional: "Additional damage",
  additionalIgnite: "Additional Ignite damage",
  stageA: "Additional ailment damage at application (3604)",
  stageAIncreased: "Increased ailment damage at application (3604)",
  enhancement: "Ailment Damage Enhancement (pooled factor)",
  damageToLife: "Additional damage applied to Life",
  targetDamageTaken: "Additional damage taken (target)",
  chance: "Ignite application chance",
  durationIncreased: "Increased Ignite duration",
  durationAdditional: "Additional Ignite duration",
  limit: "Active Ignite limit",
  extraStacks: "Additional Ignite stacks inflicted",
  afflictionEffect: "Affliction effect",
  afflictionEffectAdditional: "Additional Affliction effect",
  afflictionPerSecond: "Affliction per second",
  firePenetration: "Fire penetration",
  targetFireResistance: "Target Fire Resistance",
  reapingDuration: "Reaping Duration",
  reapingDurationAdditional: "Reaping Duration (additional)",
  reapingRecovery: "Reaping Recovery Speed",
  reapingRecoveryAdditional: "Reaping Recovery Speed (additional)",
  reapingSource: "Reaping source",
  intelligence: "Intelligence (main-stat damage)",
  skillLevel: "Indirect: skill level",
  castRate: "Indirect: cast rate",
  auraEffect: "Indirect: Aura Effect",
  blur: "Indirect: Blur",
  focusBlessing: "Indirect: Focus Blessing",
  fireInfiltration: "Combat: Fire Infiltration",
  curseSlots: "Indirect: curse slots",
  maxMinDamage: "Additional max/min damage (Ignite use unknown)",
  unresolved: "Unresolved: record outside the affix catalog",
});
export const EXCLUDED = "excluded";

// ---------------------------------------------------------------------------------------------
// Line → affix writes

const P_REF = /\bp(\d+)\b/g;
function pRefsOf(...values) {
  const out = new Set();
  const visit = (v) => {
    if (v == null) return;
    if (typeof v === "string") for (const m of v.matchAll(P_REF)) out.add(Number(m[1]));
    else if (Array.isArray(v)) v.forEach(visit);
    else if (typeof v === "object") Object.values(v).forEach(visit);
  };
  values.forEach(visit);
  return [...out].sort((a, b) => a - b);
}

// Gate strings from the index ("10{tag=4000060} & 188{probability=p0}") -> [{ node, text, tag? }].
function parseGates(cond) {
  if (!cond) return [];
  return String(cond).split(" & ").map((text) => {
    const m = text.match(/(?:^|:)(\d+)\{/);
    const tag = text.match(/\btag=(\d+)/);
    return { node: m ? Number(m[1]) : null, text, ...(tag ? { tag: Number(tag[1]) } : {}) };
  });
}

// One index write -> normalized write { kind, id, mod, tags, ... } (or null for nodes handled elsewhere).
function normalizeWrite(raw, base) {
  const p = raw.params || {};
  const common = { ...base, node: raw.node ?? 101, tags: raw.tags || {}, cond: raw.cond, pRefs: pRefsOf(raw.value, raw.upper, raw.params) };
  if (raw.to?.includes(8)) common.onEnemy = true;
  if (raw.to?.includes(3)) common.onMinion = true;
  if (raw.attr !== undefined) {
    const w = { ...common, kind: "attr", id: raw.attr, mod: raw.mod, value: raw.value, upper: raw.upper };
    if (raw.via !== undefined) w.viaCarrier = raw.via; // node 306 timed buff carrier
    return w;
  }
  switch (raw.node) {
    case 108: return { ...common, kind: "field", id: p.field, value: p.value };
    case 343: return { ...common, kind: "extraStacks", id: p.keyValue, keyType: p.keyType, value: p.layerNum, probability: p.probability };
    case 381: return { ...common, kind: "flatToBase", id: p.ailmentType, value: p.percent, upper: p.percentMax };
    case 114: return { ...common, kind: "convert", id: p.to, mod: p.toMod, from: p.from, fromValue: p.fromValue, value: p.toLowerValue, upper: p.toUpperValue, tags: p.toTags || {} };
    case 119: return { ...common, kind: "perStat", id: p.to, mod: p.toMod, from: p.from, fromValue: p.fromValue, value: p.toLowerValue, upper: p.toUpperValue, tags: p.toTags || {} };
    case 631: return { ...common, kind: "reap", id: null, value: p.reapTime };
    case 627: return { ...common, kind: "resource", id: p.resourceType, value: p.numValue, percent: p.curPercent };
    case 301: return { ...common, kind: "gainBuff", id: p.buff, value: p.num };
    case 302: return { ...common, kind: "refreshBuff", id: p.buff };
    case 1017: return { ...common, kind: "talentGrant", id: p.talentId };
    case 306: return null; // buff carrier; its buffAttr children are the writes
    case 111: return null; // row routing, handled in rowsToWrites
    default: return { ...common, kind: "node", id: raw.node, value: undefined };
  }
}

// The rows of an index entry no node names: what installing the affix starts when the entry lists no `entryRows`.
const namedRows = (entry) => new Set((entry.rows || []).flatMap((row) => (row.writes || []).flatMap((w) => rowReferences({ n: w.node, p: w.params }))));
export function indexEntryRows(entry) {
  const named = namedRows(entry);
  return (entry.rows || []).map((row, index) => row.no ?? index + 1).filter((no) => !named.has(no));
}
// Every row number some start reaches, from the entry rows down the row references.
function runningRowNumbers(entry) {
  const rows = entry.rows || [];
  const byNumber = new Map(rows.map((row, index) => [row.no ?? index + 1, row]));
  const running = new Set();
  const pending = [...(entry.entryRows ?? indexEntryRows(entry))];
  while (pending.length) {
    const no = pending.pop();
    if (running.has(no) || !byNumber.has(no)) continue;
    running.add(no);
    pending.push(...(byNumber.get(no).writes || []).flatMap((w) => rowReferences({ n: w.node, p: w.params })));
  }
  return running;
}

// Every write of an index entry, with row conditions, triggers, enemy/minion routing (node 111),
// and node 629 buff injections expanded (values bound from the injection's own arguments).
function entryWrites(entry) {
  const rows = entry.rows || [];
  // Nodes name rows by number, not by place (src/recipe-interpreter.js rowReferences): row number -> receiver.
  const routed = new Map();
  for (const row of rows) for (const w of row.writes || []) {
    if (w.node !== 111) continue;
    for (const n of w.params?.affixes || []) routed.set(n, w.to?.includes(8) ? "enemy" : w.to?.includes(3) ? "minion" : "self");
  }
  const running = runningRowNumbers(entry);
  const out = [];
  rows.forEach((row, index) => {
    const no = row.no ?? index + 1;
    if (!running.has(no)) return; // nothing starts this row
    const gates = parseGates(row.cond);
    const base = { affixId: entry.id, row: index, trigger: row.trigger?.id, triggerTags: row.trigger?.tags, gates };
    if (routed.get(no) === "enemy") base.onEnemy = true;
    if (routed.get(no) === "minion") base.onMinion = true;
    for (const raw of row.writes || []) {
      if (raw.node === 629) {
        for (const inst of raw.inst || []) for (const innerRow of inst.rows || []) for (const innerRaw of innerRow.writes || []) {
          const w = normalizeWrite(innerRaw, { ...base, gates: [...gates, ...parseGates(innerRow.cond)], trigger: base.trigger ?? innerRow.trigger?.id });
          if (w) out.push({ ...w, viaBuff: raw.params?.buffId, viaAffix: inst.id, viaArg: inst.args, pRefs: [] });
        }
        continue;
      }
      const w = normalizeWrite(raw, base);
      if (w) out.push(w);
    }
  });
  return out;
}

// Normalized writes of one indexed affix (its whole-template entry), or null when the id is not indexed.
export function writesForAffixId(index, id) {
  let partEntry = null;
  for (const entries of Object.values(index)) for (const entry of entries) {
    if (entry.id !== id) continue;
    if (!entry.part) return entryWrites(entry);
    partEntry ??= entry;
  }
  return partEntry ? entryWrites(partEntry) : null;
}

const signatureOf = (writes) => writes.map((w) => `${w.kind}:${w.id}/${w.mod ?? "-"}@${w.onEnemy ? "e" : w.onMinion ? "m" : "s"}${JSON.stringify(w.tags)}${w.viaBuff ?? ""}`).sort().join(" ");
const ORIGIN_CATEGORY = { gear: "gear", talent: "talent", core: "talent", prism: "talent", slate: "slate", pact: "pact", kismet: "pact", memory: "hero" };

// Resolve one planner line. Whole-template matches win over one-line-of-a-multi-line-affix matches;
// a part match keeps only the writes bound to that part's $Pn$. Several distinct write signatures stay
// ambiguous unless the line's origin picks one (index `source` labels).
export function resolveAffixLine(text, index, { origin } = {}) {
  const candidates = [{ text, prefixed: false }];
  const stripped = String(text).replace(/^[^:%]{2,60}:\s+/, "");
  if (stripped !== text) candidates.push({ text: stripped, prefixed: true });
  for (const candidate of candidates) {
    const key = shape(candidate.text);
    const entries = index[key];
    if (!entries?.length) continue;
    const via = [baseShape(candidate.text) !== key ? "alias" : null, candidate.prefixed ? "prefix" : null].filter(Boolean).join("+") || "direct";
    const whole = entries.filter((e) => !e.part);
    const pool = whole.length ? whole : entries;
    const resolved = pool.map((entry) => {
      let writes = entryWrites(entry);
      if (entry.part) {
        const own = new Set(entry.order || []);
        writes = writes.filter((w) => w.pRefs.some((p) => own.has(p)));
      }
      const numbers = extractLineValues(candidate.text);
      const params = bindOrder(numbers, entry.order);
      return { entry, writes, params, signature: signatureOf(writes) };
    });
    let groups = [...new Set(resolved.map((r) => r.signature))];
    let chosen = resolved;
    let ambiguous = groups.length > 1;
    let resolvedBy = null;
    if (ambiguous && origin) {
      const category = ORIGIN_CATEGORY[origin];
      const byOrigin = resolved.filter((r) => r.entry.source?.includes(category));
      if (byOrigin.length && new Set(byOrigin.map((r) => r.signature)).size === 1) { chosen = byOrigin; ambiguous = false; resolvedBy = "origin"; groups = [byOrigin[0].signature]; }
    }
    const first = chosen[0];
    const alternatives = [...new Set(chosen.map((r) => r.signature))].map((sig) => {
      const group = chosen.filter((r) => r.signature === sig);
      return { ids: group.map((r) => r.entry.id), writes: group[0].writes, params: group[0].params };
    });
    return {
      alternatives,
      text, shape: key, via, ids: chosen.map((r) => r.entry.id), allIds: resolved.map((r) => r.entry.id),
      part: Boolean(first.entry.part), writes: first.writes, params: first.params, ambiguous, resolvedBy,
      empty: chosen.every((r) => !(r.entry.rows || []).some((row) => row.writes?.length || row.cond)),
    };
  }
  return null;
}

// Numbers of a planner line in reading order (placeholder order once bound; ranges give two values).
export function extractLineValues(text) {
  return lineNumbers(normalizePercentageText(text));
}

function bindOrder(numbers, order) {
  if (!order) return {};
  if (numbers.length !== order.length) return null;
  const out = {};
  order.forEach((p, i) => { if (!(`p${p}` in out)) out[`p${p}`] = numbers[i]; });
  return out;
}

// Evaluate an index value ("p0", "p0*scale", number, "rpn:<postfix>") for bound parameters.
// `values` is { p0, p1, ... } or an array [p0, p1, ...]. Talent ranks: × multiplier.
// GetEffectScale: × effectScale (1 for gear and talents; 1 + Blur Effect inside buff 220).
export function writeValue(write, values, { multiplier = 1, effectScale = 1, field = "value" } = {}) {
  const expr = write?.[field];
  const params = Array.isArray(values) ? Object.fromEntries(values.map((v, i) => [`p${i}`, v])) : (values || {});
  const raw = evaluate(expr, params, effectScale);
  return raw == null || Number.isNaN(raw) ? null : raw * multiplier;
}

function evaluate(expr, params, scale) {
  if (expr == null) return null;
  if (typeof expr === "number") return expr;
  if (typeof expr === "boolean") return expr ? 1 : 0;
  const s = String(expr);
  let m = s.match(/^p(\d+)$/);
  if (m) return params[`p${m[1]}`] ?? NaN;
  m = s.match(/^p(\d+)\*scale$/);
  if (m) return (params[`p${m[1]}`] ?? NaN) * scale;
  if (!s.startsWith("rpn:")) return Number.isFinite(Number(s)) ? Number(s) : NaN;
  const stack = [];
  for (const token of s.slice(4).trim().split(/\s+/)) {
    if (/^p\d+$/.test(token)) stack.push(params[token] ?? NaN);
    else if (token === "scale") stack.push(scale);
    else if (/^-?[\d.]+(e-?\d+)?$/.test(token)) stack.push(Number(token));
    else if (["*", "/", "+", "-"].includes(token)) {
      const b = stack.pop(), a = stack.pop();
      stack.push(token === "*" ? a * b : token === "/" ? a / b : token === "+" ? a + b : a - b);
    } else return NaN; // calls such as GetAttr(...) are not evaluated here
  }
  return stack.length === 1 ? stack[0] : NaN;
}

// ---------------------------------------------------------------------------------------------
// Classification (§3.1 eligibility, §3.2 buckets)

const STAGE_B_ATTRS = new Set([5719, 57191, 5107, 51071, 5727, 57271]);
const STAGE_B_ALLOWED = new Set([T.IGNITE, T.AILMENT, T.ELEMENTAL_AILMENT, T.DOT, T.DOT_FLOW, T.THIS_SKILL]);
const IGNITE_SCOPE = new Set([T.IGNITE, T.AILMENT, T.ELEMENTAL_AILMENT, T.THIS_SKILL]);
// Trailing-1 attribute IDs (57191, 60081 …) are a buff/derived layer of the four-digit attribute [inference].
const baseAttr = (id) => (id >= 10000 && id < 100000 && id % 10 === 1 ? Math.floor(id / 10) : id);

const excluded = (reason, extra = {}) => ({ bucket: EXCLUDED, reason, ...extra });

function conditionOf(write, states) {
  const tags = write.tags || {};
  const required = [...(tags.others || []), ...(tags.mine || []).filter(isStateTag)];
  const forbidden = [...(tags.notOthers || []), ...(tags.notMine || [])].filter(isStateTag);
  for (const gate of write.gates || []) if (gate.node === 10 && gate.tag) required.push(gate.tag);
  const otherGates = (write.gates || []).filter((g) => !(g.node === 10 && g.tag));
  const parts = [
    ...required.map((t) => STATE_NAMES[t] || `state ${t}`),
    ...forbidden.map((t) => `not ${STATE_NAMES[t] || `state ${t}`}`),
    ...(write.trigger ? [`trigger ${write.trigger}`] : []),
    ...otherGates.map((g) => `gate ${g.text}`),
    ...(write.cond ? [`filter ${write.cond}`] : []),
  ];
  if (!parts.length) return null;
  const stateKnown = !write.trigger && !otherGates.length && !write.cond;
  const holds = stateKnown && states ? required.every((t) => states.has(t)) && !forbidden.some((t) => states.has(t)) : null;
  return { text: parts.join("; "), required, forbidden, trigger: write.trigger ?? null, holds };
}

// Non-state `mine` tags of a write.
const skillMine = (write) => (write.tags?.mine || []).filter((t) => !isStateTag(t));

// One write -> { bucket, layer, condition } or { bucket: EXCLUDED, reason }.
export function classifyIgniteWrite(write, { skillTags = scorchingBeamSkillTags, states = DUMMY_STATE_TAGS } = {}) {
  if (!write) return excluded("no write");
  const mine = skillMine(write);
  const condition = conditionOf(write, states);
  const ok = (bucket, layer, extra = {}) => ({ bucket, layer: layer ?? BUCKETS[bucket], condition, ...extra });
  if (write.onMinion || (write.tags?.mine || []).includes(T.MINION)) return excluded("minion only");
  const attr = write.kind === "attr" || write.kind === "perStat" || write.kind === "convert" ? baseAttr(write.id) : null;
  const viaLayer = write.viaBuff !== undefined ? ` via buff ${write.viaBuff}` : "";
  const perStat = write.kind === "perStat" || write.kind === "convert" ? ` per stat ${write.from}` : "";

  if (write.onEnemy) {
    if (write.kind === "attr" && (attr === 5101 || attr === 5741)) return ok("targetFireResistance", `${BUCKETS.targetFireResistance} (enemy-side mod ${write.mod})`);
    if (write.kind === "attr" && attr === 5720 && write.mod === 4) return ok("targetDamageTaken");
    if (write.kind === "reap") return ok("reapingSource");
    if (write.kind === "resource" && write.id === 6) return ok("reapingSource", `${BUCKETS.reapingSource} (removes target Affliction on Reap)`);
    return excluded(`enemy-side ${write.kind} ${write.id}/${write.mod ?? "-"} is not an Ignite input`);
  }

  switch (write.kind) {
    case "talentGrant": return ok("unresolved", `Unresolved: talent grant (node 1017, talentId ${write.id})`);
    case "reap": return ok("reapingSource");
    case "extraStacks":
      if (write.id !== T.IGNITE) return excluded(`extra stacks of ${write.id}`);
      if (mine.some((t) => t !== T.THIS_SKILL)) return excluded(`extra stacks with tags ${mine.join(",")}`);
      return ok("extraStacks", undefined, { pairKey: "extraStacks" });
    case "flatToBase": return write.id === 3 ? ok("baseIgniteFromFlat") : excluded(`flat-to-base for ailment type ${write.id}`);
    case "gainBuff":
      if (write.id === 220) return ok("blur", `${BUCKETS.blur} (gains Blur, buff 220)`);
      if (write.id === 380) return ok("focusBlessing", `${BUCKETS.focusBlessing} (buff 380 on trigger ${write.trigger ?? "-"})`);
      if (write.id === 3441) return ok("fireInfiltration");
      if (write.id === 3491) return ok("unresolved", "Unresolved: buff 3491 (Torment, config_char_buff)");
      return excluded(`gains buff ${write.id}`);
    case "refreshBuff": return write.id === 220 ? ok("blur", `${BUCKETS.blur} (refreshes Blur)`) : excluded(`refreshes buff ${write.id}`);
    case "resource": return write.id === 2 ? ok("blur", `${BUCKETS.blur} (Blur Rating gain)`) : excluded(`resource ${write.id}`);
    case "node": return excluded(`effect node ${write.id}`);
    case "field": return classifyField(write, mine, skillTags, ok);
    default: break;
  }

  // Attribute writes (101, buffAttr, per-stat 119 / conversion 114 targets).
  if (write.kind === "convert" && write.id === 20064672) return ok("afflictionPerSecond", `${BUCKETS.afflictionPerSecond} (converted from ${write.from})`);
  if (write.kind === "perStat" && write.id === 20064672) return ok("afflictionPerSecond", `${BUCKETS.afflictionPerSecond} (per stat ${write.from})`);
  if (STAGE_B_ATTRS.has(write.id) || STAGE_B_ATTRS.has(attr)) {
    if (attr === 5107 || attr === 5727 || attr === 5719) {
      if (write.mod === 2) return excluded("added flat damage (hit)");
      if (mine.includes(T.HIT)) return excluded("hit only (5000003)");
      const skillType = mine.find(isSkillTypeTag);
      if (skillType) return excluded(`skill-type tag ${skillType} on the damage event (stage B)`);
      const foreign = mine.find((t) => !STAGE_B_ALLOWED.has(t));
      if (foreign) return excluded(`tag ${foreign} is not on the Ignite damage event`);
      const layer = `${write.mod === 3 ? BUCKETS.increased : BUCKETS.additional}${perStat}${viaLayer}`;
      if (write.mod === 3) return ok("increased", layer);
      if (write.mod === 4) return mine.includes(T.IGNITE) ? ok("additionalIgnite", `${BUCKETS.additionalIgnite}${perStat}${viaLayer}`) : ok("additional", layer);
      return excluded(`attr ${write.id} mod ${write.mod}`);
    }
  }
  switch (attr) {
    case 5823: return write.mod === 2 && mine.every((t) => t === T.THIS_SKILL) ? ok("baseIgnite") : excluded(`base Ignite mod ${write.mod} tags ${mine.join(",")}`);
    case 3604: {
      if (!mine.includes(T.IGNITE)) return excluded("stage-A ailment bonus for another ailment");
      const crit = mine.includes(T.CRIT);
      const foreign = mine.filter((t) => t !== T.IGNITE && t !== T.CRIT && !skillTags.has(t));
      if (foreign.length) return excluded(`skill tag ${foreign.join(",")} is not on the inflicting skill (stage A)`);
      const extra = crit ? { critOnly: true } : {};
      if (write.mod === 4) return ok("stageA", crit ? `${BUCKETS.stageA} (crit-applied Ignites only)` : undefined, extra);
      if (write.mod === 3) return ok("stageAIncreased", undefined, extra);
      return excluded(`3604 mod ${write.mod}`);
    }
    case 3601: {
      if (mine.some((t) => t !== T.IGNITE && t !== T.AILMENT && t !== T.ELEMENTAL_AILMENT)) return excluded(`ailment duration for ${mine.join(",")}`);
      if (write.mod === 3) return ok("durationIncreased");
      if (write.mod === 4) return ok("durationAdditional");
      return excluded(`3601 mod ${write.mod}`);
    }
    case 3440: return write.mod === 1 && mine.includes(T.IGNITE) ? ok("limit") : excluded(`buff limit for ${mine.join(",") || "untagged"}`);
    case 5724: {
      if (mine.some((t) => t !== T.IGNITE && t !== T.THIS_SKILL && t !== T.AILMENT)) return excluded(`Affliction effect for ${mine.join(",")}`);
      if (write.mod === 3) return ok("afflictionEffect");
      if (write.mod === 4) return ok("afflictionEffectAdditional");
      return excluded(`5724 mod ${write.mod}`);
    }
    case 5104: {
      if (mine.includes(T.CRIT)) return ok("firePenetration", `${BUCKETS.firePenetration} (crit-applied only)`, { critOnly: true });
      if (mine.some((t) => !IGNITE_SCOPE.has(t))) return excluded(`Fire penetration for ${mine.join(",")}`);
      return ok("firePenetration");
    }
    case 6008: {
      if (mine.some((t) => t !== T.IGNITE && t !== T.THIS_SKILL)) return excluded(`Reaping Duration share of ${mine.join(",")} (not Ignite)`);
      if (write.mod === 3) return ok("reapingDuration", `${BUCKETS.reapingDuration}${viaLayer}${write.viaCarrier ? " (timed buff)" : ""}`);
      if (write.mod === 4) return ok("reapingDurationAdditional");
      return excluded(`6008 mod ${write.mod}`);
    }
    case 6009: {
      if (write.mod === 3) return ok("reapingRecovery");
      if (write.mod === 4) return ok("reapingRecoveryAdditional");
      return excluded(`6009 mod ${write.mod}`);
    }
    case 3: return ok("intelligence");
    case 6002: {
      const foreign = mine.filter((t) => !skillTags.has(t));
      return foreign.length ? excluded(`cast speed for ${foreign.join(",")}`) : ok("castRate");
    }
    case 3401: {
      const all = write.tags?.mine || [];
      if (all.includes(T.AURA_STATUS)) return ok("auraEffect");
      if (all.includes(T.BLUR_STATUS)) return ok("blur", `${BUCKETS.blur} (Blur Effect)`);
      return excluded(`buff effect for ${all.join(",") || "untagged"}`);
    }
    case 3442: return (write.tags?.mine || []).includes(T.FOCUS_BLESSING_STATUS) ? ok("focusBlessing", `${BUCKETS.focusBlessing} (max stacks)`) : excluded("max stacks of another buff");
    case 5806: case 5812: return write.mod === 4 ? ok("maxMinDamage") : excluded(`${attr} mod ${write.mod}`);
    default: return excluded(`attr ${write.id}/${write.mod ?? "-"} is not an Ignite input`);
  }
}

function classifyField(write, mine, skillTags, ok) {
  switch (write.id) {
    case 2006480: case 2006591: {
      const foreign = mine.filter((t) => !skillTags.has(t) && t !== T.IGNITE);
      if (foreign.length) return excluded(`Ignite chance for ${foreign.join(",")}`);
      const notIgnited = (write.tags?.notOthers || []).includes(T.IGNITED);
      return ok("chance", notIgnited ? `${BUCKETS.chance} (only vs a not-yet-Ignited target)` : write.id === 2006591 ? `${BUCKETS.chance} (elemental ailment chance)` : undefined);
    }
    case 2006249: return mine.every((t) => t === T.AILMENT || t === T.IGNITE) ? ok("enhancement") : excluded(`damage enhancement for ${mine.join(",")}`);
    case 2010024: {
      const foreign = mine.filter((t) => !skillTags.has(t));
      return foreign.length ? excluded(`damage to Life for ${foreign.join(",")}`) : ok("damageToLife");
    }
    case 2006467: return ok("afflictionPerSecond");
    case 2600611: return ok("extraStacks", `${BUCKETS.extraStacks} (field 2600611)`, { pairKey: "extraStacks" });
    case 2006400: return ok("skillLevel");
    case 2010090: return ok("curseSlots");
    case 2006510: case 2006520: return excluded(`chance for another ailment (field ${write.id})`);
    default: return excluded(`field ${write.id} is not an Ignite input`);
  }
}

// ---------------------------------------------------------------------------------------------
// Ledger over a build's modifier lines

// { lines: [{ text, origin, source, multiplier, ids, via, writes: [{ write, class }], buckets: { bucket: value } , condition }],
//   unmatched: [line], unresolved: [line], ambiguous: [line] }
export function attributeIgniteLedger(modifierTexts, index, { skillTags = scorchingBeamSkillTags, states = DUMMY_STATE_TAGS, effectScales = {} } = {}) {
  const lines = [], unmatched = [], unresolved = [], ambiguous = [];
  for (const line of modifierTexts || []) {
    // Lines the planner derived (resolved conditions, combat states: src/line-effects.js) are not tooltip affixes.
    if (line.lineEffect) continue;
    const resolved = resolveAffixLine(line.text, index, { origin: line.origin });
    const base = { text: line.text, origin: line.origin, source: line.source, multiplier: line.multiplier ?? 1, ...(line.pactDestiny ? { pactDestiny: line.pactDestiny } : {}) };
    if (!resolved) { const out = { ...base, status: "unmatched", writes: [], buckets: {} }; lines.push(out); unmatched.push(out); continue; }
    const classify = (list) => list.map((write) => ({ write, class: classifyIgniteWrite(write, { skillTags, states }) }));
    const writes = classify(resolved.writes);
    // An ambiguous shape whose candidates all land in the same Ignite buckets is not ambiguous for Ignite.
    let isAmbiguous = resolved.ambiguous;
    if (isAmbiguous) {
      const bucketSet = (list) => [...new Set(list.map((w) => w.class.bucket).filter((b) => b !== EXCLUDED))].sort().join(",");
      isAmbiguous = new Set(resolved.alternatives.map((alt) => bucketSet(classify(alt.writes)))).size > 1;
    }
    const buckets = {}, seenPairs = new Set();
    const conditions = [];
    for (const { write, class: c } of writes) {
      if (c.bucket === EXCLUDED || c.bucket === "unresolved") continue;
      if (c.pairKey) { if (seenPairs.has(c.pairKey)) continue; seenPairs.add(c.pairKey); }
      const params = write.viaArg ? write.viaArg : resolved.params;
      const scale = write.viaBuff !== undefined ? (effectScales[write.viaBuff] ?? 1) : 1;
      const value = writeValue(write, params, { multiplier: base.multiplier, effectScale: scale });
      const upper = write.upper !== undefined && write.upper !== 0 ? writeValue(write, params, { multiplier: base.multiplier, effectScale: scale, field: "upper" }) : null;
      const current = buckets[c.bucket];
      if (upper != null) buckets[c.bucket] = { min: (current?.min ?? 0) + (value ?? 0), max: (current?.max ?? 0) + upper };
      else buckets[c.bucket] = (typeof current === "number" ? current : 0) + (value ?? 0);
      if (c.condition) conditions.push(c.condition.text);
    }
    const hasUnresolved = writes.some((w) => w.class.bucket === "unresolved") || resolved.empty;
    const status = isAmbiguous ? "ambiguous" : Object.keys(buckets).length ? "bucketed" : hasUnresolved ? "unresolved" : "none";
    const out = { ...base, status, ids: resolved.ids, via: resolved.via, shape: resolved.shape, ambiguous: isAmbiguous, ambiguousShape: resolved.ambiguous, writes, buckets, condition: conditions.length ? [...new Set(conditions)].join(" | ") : null };
    lines.push(out);
    if (status === "unresolved") unresolved.push(out);
    if (isAmbiguous) ambiguous.push(out);
  }
  return { lines, unmatched, unresolved, ambiguous };
}

// Sum of a bucket over ledger lines (numbers, or { min, max } for ranges). Optional filter on lines.
export function sumBucket(ledger, bucket, filter = () => true) {
  let total = null;
  for (const line of ledger.lines) {
    if (!filter(line) || line.status !== "bucketed" || !(bucket in line.buckets)) continue;
    const v = line.buckets[bucket];
    if (typeof v === "number") total = (typeof total === "number" ? total : 0) + v;
    else total = { min: (total?.min ?? 0) + v.min, max: (total?.max ?? 0) + v.max };
  }
  return total ?? 0;
}

// ---------------------------------------------------------------------------------------------
// Regex side: the bucket the planner's own parsers put each line in today (§1, §4 method).

const GEAR_KEYS = {
  "damagePercent:increased": "increased", "damageOverTimePercent:increased": "increased", "elementalDamagePercent:increased": "increased",
  "additionalIgniteDamagePercent:more": "additionalIgnite", "additionalFireDamagePercent:more": "additional",
  "baseIgniteDamage:flat": "baseIgnite", "additionalIgniteStacks:flat": "extraStacks",
  "igniteChancePercent:increased": "chance", "damagingAilmentChancePercent:increased": "chance", "ailmentChancePercent:increased": "chance",
  "igniteDurationPercent:increased": "durationIncreased", "ailmentDurationPercent:increased": "durationIncreased",
  "igniteLimit:flat": "limit", "afflictionEffectPercent:increased": "afflictionEffect",
  "afflictionPerSecond:flat": "afflictionPerSecond", "afflictionPerSecondPerAfflictionEffectPercent:ratio": "afflictionPerSecond",
  "ailmentDamageEnhancementPercent:increased": "enhancement",
  "reapingDurationPercent:increased": "reapingDuration", "reapingRecoverySpeedPercent:increased": "reapingRecovery",
  "intelligence:flat": "intelligence", "auraEffectPercent:increased": "auraEffect", "deepPainAuraEffectPercent:increased": "auraEffect",
  "blurEffectPercent:increased": "blur", "fireSkillLevel:flat": "skillLevel", "spellSkillLevel:flat": "skillLevel",
  "castSpeedPercent:increased": "castRate", "castSpeedPercent:more": "castRate",
};
const TALENT_KEYS = {
  baseIgniteDamage: "baseIgnite", damagePercent: "increased", damageOverTimePercent: "increased", fireDamageOverTimePercent: "increased",
  additionalDamageToLifePercent: "damageToLife", additionalIgniteStacks: "extraStacks",
  igniteChancePercent: "chance", damagingAilmentChancePercent: "chance", ailmentChancePercent: "chance",
  igniteDurationPercent: "durationIncreased", ailmentDurationPercent: "durationIncreased", igniteLimit: "limit",
  afflictionEffectPercent: "afflictionEffect", afflictionPerSecond: "afflictionPerSecond",
  firePenetrationAgainstIgnitedPercent: "firePenetration", reapingDurationPercent: "reapingDuration", reapingRecoverySpeedPercent: "reapingRecovery",
  igniteChanceAgainstNotIgnitedPercent: "chance", // conditional chance: theoretical-sources.js → 5 s / 20 s windows only
  enemyAllResistanceAtMaxAfflictionPercent: "targetFireResistance", // time share at max Affliction (max-affliction-resistance.js)
  attackAndCastSpeedPercent: "castRate", castSpeedPercent: "castRate", channeledAttackAndCastSpeedPercent: "castRate",
  focusBlessingStacksOnReap: "focusBlessing", inflictsFireInfiltrationAgainstIgnited: "fireInfiltration",
  auraEffectPercent: "auraEffect",
};
const SLATE_KEYS = {
  baseIgniteDamage: "baseIgnite", additionalIgniteStacks: "extraStacks", igniteChancePercent: "chance", damagingAilmentChancePercent: "chance",
  ailmentChancePercent: "chance", igniteDurationPercent: "durationIncreased", ailmentDurationPercent: "durationIncreased", igniteLimit: "limit",
  additionalFireDamagePercent: "additional", additionalDamageToLifePercent: "damageToLife", dazeAdditionalAilmentDamagePercent: "additional",
  maxFocusBlessingStacks: "focusBlessing", auraEffectPercent: "auraEffect", attackAndCastSpeedPercent: "castRate", castSpeedPercent: "castRate",
  reapingRecoverySpeedPercent: "reapingRecovery", igniteChanceAgainstNotIgnitedPercent: "chance", enemyAllResistanceAtMaxAfflictionPercent: "targetFireResistance",
};
const PACT_KEYS = {
  damagePercent: "increased", elementalDamagePercent: "increased", fireDamagePercent: "increased", damageOverTimePercent: "increased",
  chanceToIgniteTargetsPercent: "chance", additionalIgniteDurationPercent: "durationAdditional", ailmentDurationPercent: "durationIncreased",
  afflictionEffectPercent: "afflictionEffect", reapingDurationPercent: "reapingDuration", reapingRecoverySpeedPercent: "reapingRecovery",
  outgoingAdditionalDamagePercent: "additional", additionalDamageOverTimePercent: "additional", igniteLimit: "limit",
  castSpeedPercent: "castRate", attackAndCastSpeedPercent: "castRate", auraEffectPercent: "auraEffect",
};
const MEMORY_KEYS = {
  damagePercent: "increased", damageOverTimePercent: "increased", elementalDamagePercent: "increased", firedamage: "increased",
  afflictionEffectPercent: "afflictionEffect", reapingDurationPercent: "reapingDuration", reapingRecoverySpeedPercent: "reapingRecovery",
  intelligence: "intelligence", castSpeedPercent: "castRate",
};
const CORE_KEYS = { afflictionPerSecond: "afflictionPerSecond", additionalAfflictionEffectPercent: "afflictionEffectAdditional", additionalDamagePercent: "additional", additionalDamageOverTimePercent: "additional" };

const SKILL_LEVEL = /([+-]\d+)\s+(?:to\s+)?([A-Za-z]+(?:\s+[A-Za-z]+){0,2})\s+(?:Skill Levels?\b|Skills['’]? Levels?\b)/i; // skill-level-bonuses.js
const BLUR_DOT = /^Blur gains an additional effect:\s*\+([\d.]+)% (additional )?Damage Over Time for (?:each|every 1) Blur Rating$/i; // blur-effects.js
const firstNumber = (text) => Math.abs(extractLineValues(text)[0] ?? NaN);

function capturedTalentNode(source) {
  const m = String(source || "").match(/^(.+) talent \((-?\d+),(-?\d+)\)$/);
  if (!m) return null;
  const panel = selenaScorchingBeamTalentSetupSs13.panels.find((p) => p.name === m[1]);
  return panel?.allocatedNodes.find((n) => String(n.coordinate) === `${m[2]},${m[3]}`) || null;
}

// Which captured key a talent clause maps to (the captured data has effectsPerRank / effects keys, not clause text).
function capturedTalentKey(node, text) {
  const effects = { ...(node.effectsPerRank || {}), ...(node.effects || {}) };
  const keys = Object.keys(effects);
  const parsed = Object.keys(parseTalentEffects(text).effects);
  const same = parsed.find((k) => keys.includes(k));
  if (same) return { key: same, how: "captured effectsPerRank (same key as parseTalentEffects)" };
  if (/minion/i.test(text)) return { key: null, how: "captured talent data omits minion clauses" };
  const n = firstNumber(text);
  const byValue = keys.filter((k) => typeof effects[k] === "number" && Math.abs(effects[k]) === n);
  if (byValue.length === 1) return { key: byValue[0], how: "captured effectsPerRank (value match)" };
  if (keys.length === 1) return { key: keys[0], how: "captured effectsPerRank (single key)" };
  const words = text.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const scored = (byValue.length ? byValue : keys).map((k) => ({ k, s: words.filter((w) => k.toLowerCase().includes(w.slice(0, 5))).length })).sort((a, b) => b.s - a.s);
  return scored[0]?.s ? { key: scored[0].k, how: "captured effectsPerRank (keyword match)" } : { key: null, how: "captured node has no key for this clause" };
}

function recognizedBucket(note, text) {
  if (!note) return null;
  if (/^Inactive|Curse limit reached/i.test(note)) return { bucket: null, note };
  if (/Intelligence/i.test(note)) return { bucket: "intelligence", note };
  if (/^Increased damage/i.test(note)) return { bucket: "increased", note };
  if (/^Additional Ignite damage/i.test(note)) return { bucket: "additionalIgnite", note };
  if (/^Additional damage/i.test(note)) return { bucket: "additional", note };
  if (/^Fire penetration/i.test(note)) return { bucket: "firePenetration", note };
  if (/^Damage vs/i.test(note)) return { bucket: /additional/i.test(text) ? "additional" : "increased", note };
  if (/^Torment/i.test(note)) return { bucket: "additional", note };
  return { bucket: null, note };
}

// Lines read by the auxiliary models (Blur, skill level, curses, Reaping sources, blessings).
// calculateBlurEffects and collectBlurSources read gear, talent nodes and slates (not cores, pacts, kismets or memories).
const BLUR_ORIGINS = new Set(["gear", "talent", "slate"]);
function auxiliaryBucket(line) {
  const text = normalizePercentageText(line.text).replace(/^Feline Steps:\s*/i, "");
  const blurOrigin = BLUR_ORIGINS.has(line.origin);
  const blurDot = blurOrigin && text.match(BLUR_DOT);
  if (blurDot) return { bucket: blurDot[2] ? "additional" : "increased", key: "blur DoT", how: "blur-effects.js" };
  if (blurOrigin && /^Daze$|additional Ailment Damage while Blur is active/i.test(text)) return { bucket: "additional", key: "Daze", how: "blur-effects.js (Daze)" };
  if (blurOrigin && /^\+?[\d.]+% Blur Effect$/i.test(text)) return { bucket: "blur", key: "blurEffectPercent", how: "blur-effects.js (own regex)" };
  if (blurOrigin && (/^Refreshes Blur upon gaining Blur/i.test(text) || /Blur Rating per second/i.test(text))) return { bucket: "blur", key: "blur source", how: "blur-effects.js" };
  if (blurOrigin && parseBlurSource(text, line.source)) return { bucket: "blur", key: "blur source", how: "blur-sources.js" };
  if (SKILL_LEVEL.test(text)) return { bucket: "skillLevel", key: "skill level", how: "skill-level-bonuses.js" };
  if (/^You can (?:cast|inflict) (\d+) additional Curses?$/i.test(text)) return { bucket: "curseSlots", key: "curse limit", how: "curse-limit.js" };
  if ((line.origin === "gear" || line.origin === "pact") && parseReapingSource(text, line.source)) return { bucket: "reapingSource", key: "reaping source", how: "reaping-sources.js" };
  if (line.origin === "gear" && /^Reaping removes/i.test(text)) return { bucket: "reapingSource", key: "afflictionRemovedPercent", how: "reaping-sources.js" };
  if (line.origin === "gear" && parseBlessingRecovery(line.text)) return { bucket: "reapingRecovery", key: "blessing reaping recovery", how: "blessing-gear-effects.js" };
  if (/(?:gain(?:s)?|grant(?:s)?) (?:\d+ stacks?(?:\(s\))? of |a stack(?: of)? )?Focus Blessing\b|^\+\d+ (?:to )?Max Focus Blessing Stacks$/i.test(text)) return { bucket: "focusBlessing", key: "Focus Blessing", how: "blessing-model.js" };
  return null;
}

// The bucket the regex path uses for one modifier line: { bucket | null, key, how }.
export function regexIgniteBucket(line, { mechanics, heroMemories, coreTalents } = {}) {
  const text = normalizePercentageText(line.text);
  let parsed = null;
  if (line.origin === "gear") {
    const mods = collectNormalizedGearModifiers([{ name: line.source, slot: "crosscheck", modifiers: [line.text] }]);
    if (mods.length) {
      const keys = mods.map((m) => `${m.stat}:${m.type}`);
      const bucket = keys.map((k) => GEAR_KEYS[k]).find(Boolean) ?? null;
      parsed = { bucket, key: keys.join("+"), how: "engine.js modifierPatterns" };
    }
  } else if (line.origin === "talent") {
    const node = capturedTalentNode(line.source);
    if (node) {
      const { key, how } = capturedTalentKey(node, text);
      if (key) parsed = { bucket: TALENT_KEYS[key] ?? null, key, how };
      else if (/minion/i.test(text)) parsed = { bucket: null, key: "minion clause", how };
    } else {
      const keys = Object.keys(parseTalentEffects(text).effects);
      if (keys.length) parsed = { bucket: keys.map((k) => TALENT_KEYS[k]).find(Boolean) ?? null, key: keys.join("+"), how: "candidate-sources.js parseTalentEffects" };
    }
  } else if (line.origin === "slate") {
    const totals = aggregateSlateEffects({ slates: [{ id: "crosscheck", fixed: [line.text] }] });
    const keys = Object.keys(totals).filter((k) => totals[k]);
    if (keys.length) parsed = { bucket: keys.map((k) => SLATE_KEYS[k]).find(Boolean) ?? null, key: keys.join("+"), how: "engine.js slateNumericEffects" };
  } else if (line.origin === "kismet") {
    const effect = parseKismetEffect(text);
    if (effect) parsed = { bucket: PACT_KEYS[effect.stat] ?? null, key: effect.stat, how: "kismet-effects.js parseKismetEffect" };
  } else if (line.origin === "pact") {
    const effect = line.pactDestiny ? { stat: line.pactDestiny } : nativePactspiritNodeEffect({ effect: text });
    if (line.pactDestiny) parsed = { bucket: PACT_KEYS[effect.stat] ?? null, key: effect.stat, how: "engine.js calculatePactCandidate (Destiny node)" };
    else if (effect) parsed = { bucket: PACT_KEYS[effect.stat] ?? null, key: effect.stat, how: "pactspirit-levels.js nativePactspiritNodeEffect" };
    else if (/^\+([0-9.]+)% additional damage$/i.test(text)) parsed = { bucket: "additional", key: "outgoingAdditionalDamagePercent", how: "engine.js calculatePactCandidate" };
    else if (/^\+([0-9.]+)% additional Reaping Recovery Speed$/i.test(text)) parsed = { bucket: "reapingRecoveryAdditional", key: "additionalReapingRecoverySpeedPercent", how: "engine.js calculatePactCandidate → theoretical-sources.js (multiplies Reaping recovery)" };
    else if (/additional damage taken$/i.test(text)) parsed = { bucket: null, key: "additionalDamageTakenPercent", how: "engine.js calculatePactCandidate (defense)" };
  } else if (line.origin === "memory") {
    const found = (heroMemories?.lines || []).find((m) => normalizePercentageText(m.text) === text);
    if (found) parsed = { bucket: MEMORY_KEYS[found.stat] ?? null, key: found.stat, how: "hero-memory-model.js" };
  } else if (line.origin === "core") {
    const name = String(line.source).replace(/^.* core: /, "");
    if (/Ignite limit/i.test(text) && name === "Starfire") parsed = { bucket: "limit", key: "Starfire", how: "planner.js igniteLimit" };
    const coreLine = (coreTalents?.lines || []).find((c) => c.source === name && Math.abs(c.value) === firstNumber(text) && CORE_KEYS[c.stat]
      && (c.stat !== "afflictionPerSecond" || /Affliction inflicted per second/i.test(text))
      && (c.stat !== "additionalAfflictionEffectPercent" || /Affliction effect/i.test(text))
      && (!/DamageOverTime/.test(c.stat) || /Damage Over Time/i.test(text)));
    if (coreLine) parsed = { bucket: CORE_KEYS[coreLine.stat], key: coreLine.stat, how: "core-talent-model.js" };
  }
  if (parsed?.bucket) return parsed;
  const note = mechanics?.recognized?.get?.(text);
  const fromMechanics = recognizedBucket(note, text);
  if (fromMechanics?.bucket) return { bucket: fromMechanics.bucket, key: `build-mechanics: ${note}`, how: "build-mechanics.js" };
  const aux = auxiliaryBucket(line);
  if (aux) return aux;
  if (parsed) return { ...parsed, bucket: null, unused: true };
  if (fromMechanics) return { bucket: null, key: `build-mechanics: ${note}`, how: "build-mechanics.js", unused: true };
  return { bucket: null, key: null, how: "unparsed" };
}

// Regex buckets that count as the same layer as an attribute bucket.
const EQUIVALENT = {
  additional: new Set(["additional", "stageA"]),
  additionalIgnite: new Set(["additionalIgnite"]),
};
const sameLayer = (regexBucket, attrBuckets) => attrBuckets.some((b) => b === regexBucket || EQUIVALENT[regexBucket]?.has(b));

export const VERDICTS = Object.freeze({
  AGREE: "agree", AGREE_NONE: "agree-none", REGEX_DROPS: "regex-drops", DISAGREE: "disagree",
  UNRESOLVED: "unresolved", UNMATCHED: "unmatched", AMBIGUOUS: "ambiguous",
});

// Per-line comparison. planner: { modifierTexts, mechanics, heroMemories?, coreTalents? } (a calculatePlanner result).
export function compareIgniteLedgers(planner, attributeLedger) {
  const context = { mechanics: planner.mechanics, heroMemories: planner.heroMemories, coreTalents: planner.coreTalents };
  return attributeLedger.lines.map((line) => {
    const regex = regexIgniteBucket(line, context);
    const attrBuckets = Object.keys(line.buckets || {});
    let verdict;
    if (line.status === "unmatched") verdict = VERDICTS.UNMATCHED;
    else if (line.status === "ambiguous") verdict = VERDICTS.AMBIGUOUS;
    else if (line.status === "unresolved") verdict = VERDICTS.UNRESOLVED;
    else if (!attrBuckets.length) verdict = regex.bucket ? VERDICTS.DISAGREE : VERDICTS.AGREE_NONE;
    else if (!regex.bucket) verdict = VERDICTS.REGEX_DROPS;
    else verdict = sameLayer(regex.bucket, attrBuckets) ? VERDICTS.AGREE : VERDICTS.DISAGREE;
    const reasons = (line.writes || []).filter((w) => w.class.bucket === EXCLUDED).map((w) => w.class.reason);
    return {
      text: line.text, origin: line.origin, source: line.source, ids: line.ids || [], via: line.via,
      regexBucket: regex.bucket, regexKey: regex.key, regexHow: regex.how,
      attrBucket: attrBuckets.length ? attrBuckets.join("+") : null, attrValue: line.buckets, condition: line.condition,
      excludedReasons: [...new Set(reasons)], verdict,
    };
  });
}

// Attribute ledger + comparison + verdict counts for one calculatePlanner result.
export function crossCheckIgnite(planner, index, context = {}) {
  const ledger = attributeIgniteLedger(planner.modifierTexts, index, context);
  const comparison = compareIgniteLedgers(planner, ledger);
  const counts = {};
  for (const row of comparison) counts[row.verdict] = (counts[row.verdict] || 0) + 1;
  return { ledger, comparison, counts, total: comparison.length, resolved: comparison.length - (counts.unmatched || 0) };
}
