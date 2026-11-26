// The per-pass line intake (unification step 1, slice 1b, 2026-11-25; research/attribute-pool-unification-design-2026-11-24.md §3.2 row 1):
// one reading of each modifier line per planner pass, `compileLineWrites(modifierTexts, state)`. Read by the generic hits under
// TLI_POOL_INTAKE=pass (slice 2a) and by the late adapters (src/build-mechanics.js addLateDamageTakenLine / addLateMechanicsLine, slices
// 3a / 3b), the default since slice 6; TLI_POOL_INTAKE=call never reads it.
//   - read(line, callState): the generic skill hit's line reading (src/skill-hit-model.js calculateSkillHit's line loop), part by part:
//     the channel readings (maxChanneledStacksLine, classifyChannelLine), the text reading (classifyHitLine), the recipe facts
//     (hitRecipeReader's, src/recipe-hit-layers.js hitRecipePartFacts), the recipe reading (hitLineFromFacts), the picked one
//     (pickHitReading) and its source kind. Compiled on demand and memoised by the original line object, the part and every reading input
//     (`stateKey`), so a line made after the intake (a per-call line, a hero extra, a late push onto the pass list) is read the same way.
//   - recordFor({ heldAttrs, conversions }): the build pool's record layer of the pass list (src/attribute-pool-build.js compileRecordLines),
//     compiled when asked (the planner never asks yet: the held buffs it needs come after the intake is made).
// Mode (TLI_POOL_INTAKE): "call" the hit model reads each line itself and never touches the intake; "shadow" it also reads the
// intake and compares every part it read (lineIntakeShadowReport(), a side channel: never the planner result); "pass" (slice 2a; the
// default since slice 6, 2026-11-26) the hit
// model takes each part's readings (the channel readings and `parsed`) from the intake instead of reading the line itself, and builds the
// part object, its ledger entry and its writes per call as before (src/skill-hit-model.js line loop; scripts/hit-pool-trace.mjs proves the
// order); the late adapters take a late line's reading from it and keep their legacy shape guards (phase a). A memoised reading is
// shared by every call of the pass: nothing downstream mutates it (the mutation check below, on in
// scripts/hit-pool-trace.mjs); a memo entry whose line changed text or source since it was read is read again (counted as stale).
// Browser-safe: src/ imports only.
import { classifyHitLine, splitHitLineText } from "./skill-hit-lines.js";
import { anyHitRecipeMode, hitPathMode, critPathMode, speedPathMode, hitRecipePartFacts, resolvedIntoKeys, resolvedIntoKey, hitLineFromFacts, pickHitReading } from "./recipe-hit-layers.js";
import { maxChanneledStacksLine, classifyChannelLine } from "./channeled-stack-lines.js";
import { lineKeyOf, SYNTHETIC, UNIT_OF, compileRecordLines, heldRecordAttrs, resolveLine } from "./attribute-pool-build.js";
import { heldBuffWrites } from "./unit-buff-writes.js";
import { affixRecipe } from "./recipe-interpreter.js";
import { admits } from "./attribute-pool.js";
import { HIT_ATTRS } from "./attribute-pool-hit.js";

// ---------------------------------------------------------------------------------------------------------------------------
// Fact providers and runtime-valued writes (unification step 1, slice 4a, shadow: nothing reads them yet).
//   - A fact registry: `facts.provide(name, fn)` names a runtime value an RPN call reads (GetCostValue(i) …); `call(name, args)`.
//   - evaluateWithFacts(rpn, params, facts): a postfix evaluator for the recipes' "rpn:" values whose calls (Name(arg, …), arguments
//     comma-separated postfix sub-expressions, nested calls split by paren depth) are answered by the registry or a built-in; an unknown
//     call gives null and its name in `dynamic` (never a guess). src/recipe-interpreter.js `evaluate` is left as it is: its tokenizer's
//     split text reaches the condition texts (badge and reason strings).
//   - intake.dynamic: the pass list's node-101 writes whose value is such an expression (Indifference, record 759880384:
//     GetMaxMin(0, (GetCostValue(1) − GetCostValue(0)) ÷ p0 × p1, p2) on 5719 mod 4, untagged and on the Minion tag), with the raw
//     expression from the recipe table and the line's bound parameters.
/** A provider registry: provide(name, fn) (fn(...args) → number), has(name), call(name, args), names(). */
export function createFactRegistry() {
  const providers = new Map();
  const registry = {
    provide(name, fn) { if (typeof fn === "function") providers.set(String(name), fn); return registry; },
    has: (name) => providers.has(String(name)),
    call: (name, args = []) => providers.get(String(name))(...args),
    names: () => [...providers.keys()]
  };
  return registry;
}
// Built-in calls (pure). GetMaxMin(lo, x, hi): x held between lo and hi (inferred from its use: Indifference's "up to +50%" is
// GetMaxMin(0, …, p2) with p2 = 50).
const BUILTIN_CALLS = Object.freeze({ GetMaxMin: (lo, x, hi) => Math.min(Math.max(x, lo), hi) });
// Split `text` at depth-0 separators (whitespace, or commas).
function splitTop(text, commas = false) {
  const out = [];
  let depth = 0, current = "";
  for (const char of String(text)) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    const split = depth === 0 && (commas ? char === "," : /\s/.test(char));
    if (split) { if (current.trim() !== "" || commas) out.push(current.trim()); current = ""; continue; }
    current += char;
  }
  if (current.trim() !== "" || (commas && out.length)) out.push(current.trim());
  return out;
}
const CALL = /^([A-Za-z_]\w*)\(([\s\S]*)\)$/;
const OPERATORS = new Set(["*", "/", "+", "-", "%"]);
const callOf = (facts, name) => (BUILTIN_CALLS[name] ? BUILTIN_CALLS[name]
  : typeof facts?.has === "function" ? (facts.has(name) ? (...args) => facts.call(name, args) : null)
  : typeof facts?.[name] === "function" ? facts[name] : null);
/**
 * A recipe value with runtime calls: { value, dynamic } like src/recipe-interpreter.js `evaluate` (`value` null when any part is
 * unknown; `dynamic` the unknown names). `facts`: a registry (createFactRegistry) or an object of functions by name.
 */
export function evaluateWithFacts(expr, params = {}, facts = null, { scale = 1, outer = {} } = {}) {
  if (expr === undefined || expr === null) return { value: null, dynamic: [] };
  if (typeof expr === "number") return { value: expr, dynamic: [] };
  if (typeof expr === "boolean") return { value: expr ? 1 : 0, dynamic: [] };
  const s = String(expr).trim();
  const dynamic = [];
  const token = (t) => {
    if (/^p\d+$/.test(t)) return params[t] ?? NaN;
    if (/^d\d+$/.test(t)) return outer[`p${Number(t.slice(1)) - 1}`] ?? NaN;
    return NaN;
  };
  const run = (source) => {
    const stack = [];
    for (const t of splitTop(source)) {
      if (/^[pd]\d+$/.test(t)) { const v = token(t); if (!Number.isFinite(v)) dynamic.push(t); stack.push(v); }
      else if (t === "scale") stack.push(scale);
      else if (/^-?[\d.]+(e-?\d+)?$/.test(t)) stack.push(Number(t));
      else if (t === "neg") stack.push(-stack.pop());
      else if (OPERATORS.has(t)) {
        const b = stack.pop(), a = stack.pop();
        stack.push(t === "*" ? a * b : t === "/" ? a / b : t === "+" ? a + b : t === "-" ? a - b : a % b);
      } else {
        const call = t.match(CALL);
        const fn = call ? callOf(facts, call[1]) : null;
        if (!fn) { dynamic.push(call ? call[1] : t); stack.push(NaN); continue; }
        const args = splitTop(call[2], true).map((arg) => run(arg));
        const value = args.every(Number.isFinite) ? Number(fn(...args)) : NaN;
        stack.push(value);
      }
    }
    return stack.length === 1 ? stack[0] : NaN;
  };
  if (/^[pd]\d+$/.test(s)) { const v = token(s); return { value: Number.isFinite(v) ? v : null, dynamic: Number.isFinite(v) ? [] : [s] }; }
  if (!s.startsWith("rpn:")) return Number.isFinite(Number(s)) ? { value: Number(s), dynamic: [] } : { value: null, dynamic: [s] };
  const result = run(s.slice(4).trim());
  const value = Number.isFinite(result) ? result : null;
  return { value, dynamic: value === null && !dynamic.length ? ["malformed"] : [...new Set(dynamic)] };
}
const sameTags = (a, b) => canonical(a ?? null) === canonical(b ?? null);
/**
 * The node-101 writes of a line list whose value is a runtime expression (the record's own "rpn:" value; src/attribute-pool-build.js
 * staticWrite drops them as dynamic), in list order: { lineKey, line, lineIndex, affixId, row, unit, attr, mod, tags, rpn, params,
 * multiplier, effect }. A raw node is paired to its interpreted effect by row, attribute, mod and tags (never by index).
 */
export function compileDynamicWrites(modifierTexts = []) {
  const out = [];
  modifierTexts.forEach((line, lineIndex) => {
    if (!line || line.lineEffect || SYNTHETIC.has(line.origin)) return;
    const resolved = resolveLine(line);
    const chosen = resolved?.chosen;
    const effects = chosen?.result?.effects || [];
    const recipe = chosen && effects.length ? affixRecipe(chosen.id) : null;
    if (!recipe) return;
    const used = new Set();
    for (const effect of effects) {
      if (effect.kind !== "attr" || effect.node !== 101 || Number.isFinite(effect.value) || !effect.dynamic?.length) continue;
      const nodes = recipe.r?.[effect.row]?.e || [];
      const at = nodes.findIndex((node, index) => !used.has(index) && node.n === 101 && node.a === effect.attr && node.m === effect.mod && sameTags(node.tg, effect.tagIds) && typeof node.v === "string" && node.v.startsWith("rpn:"));
      if (at < 0) continue;
      used.add(at);
      out.push({ lineKey: lineKeyOf(line.source, line.text), line, lineIndex, affixId: chosen.id, row: effect.row, unit: UNIT_OF[effect.target ?? "self"] ?? null, attr: effect.attr, mod: effect.mod, tags: effect.tagIds ?? null, rpn: nodes[at].v, params: { ...(chosen.params || {}) }, multiplier: Number(line.multiplier ?? 1) || 1, effect });
    }
  });
  return out;
}
/** A runtime-valued write's value with these facts (× the line's rank multiplier, as the record layer scales a static write). */
export function dynamicWriteValue(write, facts) {
  const { value, dynamic } = evaluateWithFacts(write.rpn, write.params, facts);
  return { value: value === null ? null : value * write.multiplier, dynamic };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Mode.
let override = null;
const flagOf = (name, value) => value ?? globalThis[name] ?? globalThis.process?.env?.[name] ?? null;
// Slice 6 (2026-11-26): "pass" is the default; TLI_POOL_INTAKE=call keeps the old path, "shadow" the audit; any other value reads "pass".
export const intakeMode = () => { const value = flagOf("TLI_POOL_INTAKE", override); return value === "call" || value === "shadow" ? value : "pass"; };
export const setIntakeMode = (mode) => { override = mode === "call" || mode === "pass" || mode === "shadow" ? mode : null; };

// ---------------------------------------------------------------------------------------------------------------------------
// The intake.
// Memo hits and misses of every intake's readPart (diagnostics: the shadow is a staleness test only where later calls hit the memo).
const memoCounts = { hits: 0, misses: 0, stale: 0, intakeParts: 0 };
// The mutation check (diagnostics, off unless globalThis.__lineIntakeMutationCheck = { entries: [], violations: [], checks: 0 }): each
// memoised reading's canonical form is kept when it is made and compared again at every memo hit and at checkLineIntakeMutations().
const mutationCheck = () => { const check = globalThis.__lineIntakeMutationCheck; return check && Array.isArray(check.entries) ? check : null; };
const readingSnapshot = (reading) => canonical({ channel: reading.channel, textParsed: reading.textParsed, recipeFacts: reading.recipeFacts, recipeParsed: reading.recipeParsed, parsed: reading.parsed, sourceKind: reading.sourceKind, text: reading.line.text, compoundText: reading.line.compoundText ?? null });
function verifyReading(check, entry, when) {
  check.checks = (check.checks || 0) + 1;
  if (readingSnapshot(entry.reading) !== entry.snapshot) { check.violations.push({ source: entry.reading.line.source ?? null, text: entry.reading.line.text, when }); entry.snapshot = readingSnapshot(entry.reading); }
}
/** Re-check every memoised reading the mutation check holds: { checks, violations, invalidations } (invalidations: stale memo entries). */
export function checkLineIntakeMutations() {
  const check = mutationCheck();
  if (!check) return null;
  for (const entry of check.entries) verifyReading(check, entry, "end of run");
  return { checks: check.checks, violations: check.violations.slice(), invalidations: memoCounts.stale };
}
// The line fields a reading reads (classifyHitLine the text; hitRecipePartFacts the text, origin, lineEffect and lineGameIds' fields; the
// resolved-into key the source; maxChanneledStacksLine the ring slot; sourceKind the origin and lineEffect), by identity.
const LINE_INPUTS = ["text", "source", "origin", "slot", "lineEffect", "grantedCore", "pactDestiny", "reflectedFrom", "talentGameId"];
const lineInputs = (item) => LINE_INPUTS.map((field) => item?.[field]);
const sameLineInputs = (inputs, item) => LINE_INPUTS.every((field, index) => inputs[index] === item?.[field]);
const isModelLine =(line) => Boolean(line?.lineEffect) || SYNTHETIC.has(line?.origin);
/** A reading's source kind: "recipe" a game record placed it, "model" a planner-made line's text reading, "text" a catalog line's text reading. */
export const sourceKindOf = (line, parsed) => (!parsed ? null : parsed.recipe ? "recipe" : isModelLine(line) ? "model" : "text");

export function createLineIntake({ lines = [], state = {} } = {}) {
  const parts = new WeakMap(); // original line → its parts ({ line, partKey }), splitHitLineText's split
  const readings = new WeakMap(); // original line → Map<`${part}|${stateKey}`, part reading>
  const ids = new WeakMap();
  let nextId = 1;
  const idOf = (value) => { if (value == null || typeof value !== "object") return "-"; if (!ids.has(value)) ids.set(value, nextId++); return ids.get(value); };
  const stateKey = ({ targetCursed = false, enemyAilments = null, recipeState = null } = {}, resolvedInto) =>
    `${+Boolean(targetCursed)}|${recipeState ? `${+Boolean(recipeState.targetCursed)}${+Boolean(recipeState.sealedLifeAndMana)}` : "-"}|${+Boolean(resolvedInto)}|${hitPathMode()}${critPathMode()}${speedPathMode()}|${idOf(enemyAilments)}`;
  const partsOf = (item) => {
    let held = parts.get(item);
    if (!held || !sameLineInputs(held.inputs, item)) {
      const texts = splitHitLineText(item.text);
      const list = (texts.length > 1 ? texts.map((text) => ({ ...item, text, compoundText: item.text })) : [item]).map((line) => ({ line, partKey: resolvedIntoKey(line) }));
      parts.set(item, (held = { inputs: lineInputs(item), list }));
    }
    return held.list;
  };
  // `baseKeys`: the call-constant part of the key for each resolved bit (a call reads it once: readerFor).
  const readKeyed = (item, index, callState, keyFor) => {
    const { line, partKey } = partsOf(item)[index];
    const resolvedInto = callState.resolvedInto instanceof Set ? callState.resolvedInto.has(partKey) : Boolean(callState.resolvedInto);
    const key = `${index}|${keyFor(resolvedInto)}`;
    let memo = readings.get(item);
    if (!memo) readings.set(item, (memo = new Map()));
    const held = memo.get(key);
    if (held) {
      // A line object whose reading inputs changed since it was read (never seen on fixtures): read again (counted as stale).
      if (sameLineInputs(held.inputs, item)) {
        memoCounts.hits += 1;
        const check = held.check && mutationCheck();
        if (check) verifyReading(check, held.check, "memo hit");
        return held.reading;
      }
      memoCounts.stale += 1;
    }
    memoCounts.misses += 1;
    const reading = compilePart(item, line, partKey, resolvedInto, callState);
    const check = mutationCheck();
    const checkEntry = check ? { reading, snapshot: readingSnapshot(reading) } : null;
    if (checkEntry) check.entries.push(checkEntry);
    memo.set(key, { inputs: lineInputs(item), reading, check: checkEntry });
    return reading;
  };
  const readPart = (item, index, callState = {}) => readKeyed(item, index, callState, (resolvedInto) => stateKey(callState, resolvedInto));
  /** A call's reader: (item, index) → part reading, the call-constant key computed once (the hit model's line loop, pass mode). */
  const readerFor = (callState = {}) => {
    const keys = [stateKey(callState, false), stateKey(callState, true)];
    const keyFor = (resolvedInto) => keys[+resolvedInto];
    return (item, index) => { memoCounts.intakeParts += 1; return readKeyed(item, index, callState, keyFor); };
  };
  const compilePart = (item, line, partKey, resolvedInto, callState) => {
    const textParsed = classifyHitLine(line.text, { targetCursed: callState.targetCursed ?? false, enemyAilments: callState.enemyAilments ?? null });
    const recipeFacts = anyHitRecipeMode() ? hitRecipePartFacts(line, resolvedInto) : undefined;
    const recipeParsed = recipeFacts ? hitLineFromFacts(recipeFacts, textParsed, callState.recipeState ?? null) : undefined;
    const parsed = pickHitReading(textParsed, recipeParsed);
    const reading = {
      line, partKey, resolvedInto,
      channel: { ringStacks: maxChanneledStacksLine(line), channelParsed: classifyChannelLine(line.text), stackParsed: classifyChannelLine(line.text) },
      textParsed, recipeFacts, recipeParsed, parsed, sourceKind: sourceKindOf(item, parsed)
    };
    return reading;
  };
  // The runtime-valued writes of the pass list, memoised by the list's length: a line pushed after the first ask (the pass list grows
  // through the planner) compiles them again, so a reader never sees a stale list (slice 4c).
  let dynamicMemo = null, dynamicLength = -1;
  const intake = {
    lines, state, sealed: false,
    /** The fact providers (slice 4a): the planner registers GetCostValue (the board's Energy) after its allocation. */
    facts: createFactRegistry(),
    /** The pass list's runtime-valued writes (compileDynamicWrites), compiled when asked and again after the list grew. */
    get dynamic() { if (!dynamicMemo || dynamicLength !== lines.length) { dynamicMemo = compileDynamicWrites(lines); dynamicLength = lines.length; } return dynamicMemo; },
    /** A runtime-valued write's value with this intake's facts. */
    dynamicValue: (write) => dynamicWriteValue(write, intake.facts),
    /** One line's reading: { line, lineKey, parts: [part reading] }. */
    read(item, callState = {}) {
      return { line: item, lineKey: lineKeyOf(item.source, item.text), parts: partsOf(item).map((_, index) => readPart(item, index, callState)) };
    },
    readPart,
    readerFor,
    /** The parts of a line (the objects the readings name), splitHitLineText's split of the original line. */
    partsOf: (item) => partsOf(item).map((part) => part.line),
    /** hitRecipeReader's resolved-into set of a call's list (src/recipe-hit-layers.js resolvedIntoKeys). */
    resolvedIntoSet: (list = lines) => resolvedIntoKeys(list),
    /** The record layer of the pass list (compileRecordLines' items, in list order). */
    recordFor({ heldAttrs = null, playerBuffs = state.playerBuffs ?? null, conversions = state.conversions ?? "legacy" } = {}) {
      return compileRecordLines(lines, { heldAttrs: heldAttrs ?? heldRecordAttrs(heldBuffWrites(playerBuffs)), conversions });
    },
    get record() { return intake.recordFor(); }
  };
  return intake;
}

/** The design's name: an intake of a list (`state`: { playerBuffs, conversions } for its record layer). */
export const compileLineWrites = (modifierTexts = [], state = {}) => createLineIntake({ lines: modifierTexts, state });

// ---------------------------------------------------------------------------------------------------------------------------
// Shadow comparison (the hit model's line loop in "shadow" mode): a side channel, never the planner result.
const report = [];
const counts = { calls: 0, parts: 0, compared: 0, late: 0, lateFallback: 0, facts: 0, factsNonEmpty: 0, partQueries: 0, partQueriesNonEmpty: 0, perStackRecords: 0, triggeredOnlyWrites: 0, mainQueries: 0 };
let corrupt = null; // a test hook: (field, value) → value, to prove the shadow reports a difference
export const lineIntakeShadowReport = () => report.slice();
// Slice 4a / 4b findings: coverage differences the shadow lists apart from value mismatches (a record the intake does not see, a Main-scoped
// record-layer write the hit never reads). Never the planner result.
const findings = [];
export const lineIntakeShadowFindings = () => findings.slice();
export function noteStepFinding(kind, { label = null, field, detail = null }) { findings.push({ kind, label, field: `${kind}:${field}`, detail }); }
export const lineIntakeShadowCounts = () => ({ ...counts, memoHits: memoCounts.hits, memoMisses: memoCounts.misses, memoStale: memoCounts.stale, intakeParts: memoCounts.intakeParts });
export function clearLineIntakeShadowReport() { report.length = 0; counts.calls = 0; counts.parts = 0; counts.compared = 0; counts.late = 0; counts.lateFallback = 0; counts.facts = 0; counts.factsNonEmpty = 0; counts.partQueries = 0; counts.partQueriesNonEmpty = 0; counts.perStackRecords = 0; counts.triggeredOnlyWrites = 0; counts.mainQueries = 0; findings.length = 0; memoCounts.hits = 0; memoCounts.misses = 0; memoCounts.stale = 0; memoCounts.intakeParts = 0; }
export const setLineIntakeShadowCorruption = (fn) => { corrupt = typeof fn === "function" ? fn : null; };

/**
 * The shadow of one late adapter call (src/build-mechanics.js addLateDamageTakenLine / addLateMechanicsLine, slices 3a / 3b): `legacy` and
 * `intake` the pushes each reading would make; a difference goes to the report under `field`.
 */
export function reportLateShadow({ label = null, line = null, field, legacy, intake }) {
  counts.late += 1;
  counts.compared += 1;
  const mine = corrupt ? corrupt(field, intake, line) : intake;
  const a = canonical(legacy), b = canonical(mine);
  if (a !== b) report.push({ label, source: line?.source ?? null, text: line?.text ?? null, compoundText: line?.compoundText ?? null, field, legacy: a, intake: b });
}

/** A late adapter accepted a line by its legacy shape guard that the intake does not read the same way: the guard's own number is used. */
export function noteLateFallback() { counts.lateFallback += 1; }

/**
 * The shadow of one slice-4a / 4b comparison (fact-provided values, part queries): `kind` "facts" or "partQueries"; `legacy` today's
 * value or set, `intake` the new reading's; `nonEmpty` whether the compared set held anything (non-vacuity counts); a difference goes to
 * the report under `field` (prefixed by the kind).
 */
export function reportStepShadow(kind, { label = null, line = null, field, legacy, intake, nonEmpty = false }) {
  counts[kind] += 1;
  if (nonEmpty) counts[`${kind}NonEmpty`] += 1;
  const mine = corrupt ? corrupt(field, intake, line) : intake;
  const a = canonical(legacy), b = canonical(mine);
  if (a !== b) report.push({ label, source: line?.source ?? null, text: line?.text ?? null, compoundText: line?.compoundText ?? null, field: `${kind}:${field}`, legacy: a, intake: b });
}

/** The field the per-stack records read (records 328531744 / 996307264: node 114 from encoded field 20060502, fromMod 1). */
export const STACKS_ABOVE_BASE_FIELD = "field:2006050";
const round4 = (value) => Math.round(value * 10000) / 10000;
/**
 * Slice 4a's per-stack shadow (one hit call, TLI_POOL_INTAKE=shadow): the held node 114 records whose source is STACKS_ABOVE_BASE_FIELD
 * and whose line is in this call's list, each evaluated on a throwaway child of the hit's pool holding the call's stacks above the base as
 * that field (`hitPool.factChild`), with the hit's query, against the legacy per-stack entries (src/skill-hit-model.js channelState /
 * stackLineState: value × stacks increased, value × stacks ÷ per additional), by line key and bucket, in order. Returns the counts.
 */
export function shadowPerStackFacts({ hitPool, modifierTexts = [], channelLines = [], additionalMaxStacks = 0, label = null }) {
  if (!hitPool) return null;
  const callKeys = new Set(modifierTexts.map((line) => lineKeyOf(line?.source, line?.compoundText ?? line?.text)));
  const records = hitPool.pool.allConversions("player").filter((record) => record.from === STACKS_ABOVE_BASE_FIELD);
  const inCall = records.filter((record) => callKeys.has(record.lineKey));
  const legacyLines = channelLines.filter((line) => line.kind === "perStackIncreased" || line.kind === "perStackAdditional");
  if (!inCall.length && !legacyLines.length) return { records: 0, legacy: 0 };
  const query = hitPool.hitQuery();
  const child = hitPool.factChild({ [STACKS_ABOVE_BASE_FIELD]: additionalMaxStacks });
  const legacy = legacyLines.map((line) => ({ lineKey: lineKeyOf(line.source, line.compoundText ?? line.text), mod: line.kind === "perStackIncreased" ? 3 : 4, value: line.kind === "perStackIncreased" ? line.value * additionalMaxStacks : line.value * additionalMaxStacks / line.per }));
  const intake = inCall.map((record) => ({ lineKey: record.lineKey, mod: record.toMod, admitted: admits(record.requirement, query), value: child.conversionValue(record, query) }));
  // Bucket and value per line, in order (an exact ===: canonical numbers); the admission apart (a record the query does not admit is a
  // reach difference).
  const byKey = (list) => list.map((item) => ({ lineKey: item.lineKey, mod: item.mod, value: item.value })).sort((a, b) => (a.lineKey < b.lineKey ? -1 : a.lineKey > b.lineKey ? 1 : a.mod - b.mod));
  reportStepShadow("facts", { label, field: "perStack:entries", legacy: byKey(legacy), intake: byKey(intake), nonEmpty: legacy.length + intake.length > 0 });
  counts.perStackRecords += inCall.length;
  reportStepShadow("facts", { label, field: "perStack:admitted", legacy: legacy.length, intake: intake.filter((item) => item.admitted).length });
  return { records: inCall.length, legacy: legacy.length, notInCall: records.length - inCall.length, values: intake.map((item) => round4(item.value)) };
}

// Slice 4c switch counters (TLI_POOL_INTAKE=pass): how often each consumer took the pool's selection ("pool") and how often it kept the
// legacy reading because the pool's selection or value differed from it ("fallback"), by consumer. Bounded (numbers only).
const switchCounts = { perStackPool: 0, perStackFallback: 0, indifferencePool: 0, indifferenceFallback: 0, triggeredPool: 0, triggeredFallback: 0 };
export const lineIntakeSwitchCounts = () => ({ ...switchCounts });
export function clearLineIntakeSwitchCounts() { for (const key of Object.keys(switchCounts)) switchCounts[key] = 0; }
export const noteSwitch = (key) => { switchCounts[key] += 1; };

/**
 * Slice 4c's per-stack selection (one hit call, TLI_POOL_INTAKE=pass): the held node 114 records whose source is STACKS_ABOVE_BASE_FIELD,
 * that the hit query admits and whose line is in this call's list, matched one to one to the call's per-stack channel lines by line key
 * (`lineKeyOf(source, compoundText ?? text)`) and bucket (perStackIncreased mod 3, perStackAdditional mod 4), each valued on a fact child
 * holding the call's stacks above the base. Returns a Map(channel line → value), or null when the pool's selection is not today's matched
 * set (a line with no record, an admitted record with no line) or a value is not === today's: the caller keeps the legacy reading then
 * (counted as a fallback; the shadow lists the difference). The records stay held (`heldBy`), so the traced query never adds them again.
 */
export function selectPerStackRecords({ hitPool, modifierTexts = [], channelLines = [], additionalMaxStacks = 0 }) {
  const legacy = channelLines.filter((line) => line.kind === "perStackIncreased" || line.kind === "perStackAdditional");
  if (!legacy.length || !hitPool) return null;
  const query = hitPool.hitQuery();
  const records = hitPool.pool.allConversions("player").filter((record) => record.from === STACKS_ABOVE_BASE_FIELD && admits(record.requirement, query));
  const used = new Set();
  const matched = [];
  for (const line of legacy) {
    const key = lineKeyOf(line.source, line.compoundText ?? line.text), mod = line.kind === "perStackIncreased" ? 3 : 4;
    const record = records.find((item) => !used.has(item) && item.lineKey === key && item.toMod === mod);
    if (!record) { switchCounts.perStackFallback += 1; return null; }
    used.add(record);
    matched.push([line, record]);
  }
  // An admitted record of this call's lines with no line here is a reach difference (the shadow lists it): keep today's set.
  const callKeys = new Set(modifierTexts.map((line) => lineKeyOf(line?.source, line?.compoundText ?? line?.text)));
  if (records.some((record) => !used.has(record) && callKeys.has(record.lineKey))) { switchCounts.perStackFallback += 1; return null; }
  const child = hitPool.factChild({ [STACKS_ABOVE_BASE_FIELD]: additionalMaxStacks });
  const values = new Map();
  for (const [line, record] of matched) {
    const value = child.conversionValue(record, query);
    const today = line.kind === "perStackIncreased" ? line.value * additionalMaxStacks : line.value * additionalMaxStacks / line.per;
    if (value !== today) { switchCounts.perStackFallback += 1; return null; }
    values.set(line, value);
  }
  switchCounts.perStackPool += 1;
  return values;
}

/** The reading-layer damage and taken writes (you and the dummy, increased and additional) only the Triggered part query admits. */
function triggeredOnlyWrites(hitPool) {
  const plain = hitPool.hitQuery();
  const triggered = hitPool.hitQuery({ triggered: true });
  const attrs = [...new Set([...Object.values(HIT_ATTRS.damage), ...Object.values(HIT_ATTRS.taken)].filter((attr) => typeof attr === "number"))];
  const out = [];
  for (const unit of ["player", "dummy"]) for (const attr of attrs) for (const write of hitPool.pool.writesOf(unit, attr)) {
    if (write.layer !== "reading" || (write.mod !== 3 && write.mod !== 4)) continue;
    if (admits(write.requirement, triggered) && !admits(write.requirement, plain)) out.push({ source: write.entry?.source ?? write.source?.line ?? null, mod: write.mod, value: round4(write.value) });
  }
  return out;
}

/**
 * Slice 4c's Triggered selection (one hit call, TLI_POOL_INTAKE=pass): the increased items of the build's triggered-skill lines
 * (src/combat-states.js triggeredSkillAdditional: "+X% damage for Triggered Skills", record 101010633) come from the writes only the
 * Triggered part query (6000080, slice 4b) admits on this call's pool, matched one to one to today's items by source and value rounded to
 * 4 decimals (as today), each item keeping its text, category, scope and place; the additional items (Hair-trigger, record 281: no
 * attribute write) are kept as they are. Returns the list, or the given one when there is nothing to select, no pool, or the pool's
 * selection is not today's (a write with no item, an item with no write: counted as a fallback; the shadow lists it). The pool is only
 * the selection: nothing reads these writes through the Triggered query, so pushTriggered stays the one place they are counted.
 */
export function selectTriggeredItems({ hitPool, items = [] }) {
  if (!hitPool) return items;
  const expected = items.filter((line) => line.increased);
  const writes = triggeredOnlyWrites(hitPool);
  if (!expected.length && !writes.length) return items;
  const used = new Set();
  const picked = new Map();
  for (const item of expected) {
    const write = writes.find((candidate) => !used.has(candidate) && candidate.mod === 3 && candidate.source === (item.source ?? null) && candidate.value === round4(item.value));
    if (!write) { switchCounts.triggeredFallback += 1; return items; }
    used.add(write);
    picked.set(item, write);
  }
  if (writes.some((write) => !used.has(write))) { switchCounts.triggeredFallback += 1; return items; }
  switchCounts.triggeredPool += 1;
  return items.map((item) => (picked.has(item) ? { ...item, source: picked.get(item).source, value: picked.get(item).value } : item));
}

/**
 * Slice 4b's part-query shadow (one hit call): the Triggered part query (6000080) against the plain hit query, write by write on your and
 * the dummy's damage and taken attributes, increased and additional: the writes only the Triggered query admits must be the increased
 * items of the build's triggered-skill lines (src/combat-states.js triggeredSkillAdditional), by source and value rounded to 4 decimals.
 * The Main part query (6020000, on the Main Skill only) against the plain one on every reading-layer write and unheld conversion record of
 * both units: the admitted sets must be equal. Record-layer writes that differ (a Main-scoped record write the hit never reads) are listed
 * apart. Returns the counts.
 */
export function shadowPartQueries({ hitPool, triggeredSkillAdditional = [], mainSkill = false, label = null }) {
  if (!hitPool) return null;
  const plain = hitPool.hitQuery();
  const onlyTriggered = triggeredOnlyWrites(hitPool);
  const sorted = (list) => list.slice().sort((a, b) => canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0);
  const expected = triggeredSkillAdditional.filter((line) => line.increased).map((line) => ({ source: line.source ?? null, mod: 3, value: round4(line.value) }));
  reportStepShadow("partQueries", { label, field: "triggered", legacy: sorted(expected), intake: sorted(onlyTriggered), nonEmpty: expected.length + onlyTriggered.length > 0 });
  counts.triggeredOnlyWrites += onlyTriggered.length;
  const main = hitPool.hitQuery({ main: true });
  if (main !== plain) counts.mainQueries += 1;
  const differ = { reading: [], record: [], conversions: [] };
  for (const unit of ["player", "dummy"]) {
    for (const write of hitPool.pool.allWrites(unit)) {
      if (admits(write.requirement, plain) === admits(write.requirement, main)) continue;
      (write.layer === "reading" ? differ.reading : differ.record).push({ unit, attr: write.attr, mod: write.mod, layer: write.layer, source: write.entry?.source ?? write.source?.line ?? write.source?.name ?? null });
    }
    for (const record of hitPool.pool.allConversions(unit)) if (!record.heldBy && admits(record.requirement, plain) !== admits(record.requirement, main)) differ.conversions.push({ unit, to: record.to, lineKey: record.lineKey });
  }
  reportStepShadow("partQueries", { label, field: "main", legacy: [], intake: [...differ.reading, ...differ.conversions], nonEmpty: mainSkill && main !== plain });
  if (differ.record.length) noteStepFinding("partQueries", { label, field: "main:recordLayer", detail: differ.record });
  return { onlyTriggered: onlyTriggered.length, expected: expected.length, mainDiffer: differ.reading.length + differ.conversions.length, recordOnly: differ.record.length, mainSkill, mainQueried: main !== plain };
}

// A comparable form: Sets and Maps as sorted entries, object keys sorted, -0 / NaN / undefined kept apart.
export function canonical(value) {
  if (value === undefined) return "u";
  if (value === null) return "n";
  if (typeof value === "number") return Object.is(value, -0) ? "#-0" : `#${String(value)}`;
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "T" : "F";
  if (typeof value === "function") return `f:${value.name}`;
  if (value instanceof Set) return `S[${[...value].map(canonical).sort().join(",")}]`;
  if (value instanceof Map) return `M[${[...value].map(([k, v]) => `${canonical(k)}=${canonical(v)}`).sort().join(",")}]`;
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return `?${String(value)}`;
}

/**
 * The shadow of one hit call: `intake` (the pass's, or a local one of the call's list), `callState` the call's reading inputs (its list's
 * resolved-into set included), `label` the setup. Returns { origin(part) → [item, index] registry, check(part, field, legacy) }.
 */
export function shadowCall(intake, callState, label = null) {
  counts.calls += 1;
  const origin = new Map();
  return {
    register(part, item, index) { origin.set(part, [item, index]); },
    begin(part) { counts.parts += 1; const [item, index] = origin.get(part) ?? [part, 0]; return intake.readPart(item, index, callState); },
    check(reading, part, field, legacy) {
      counts.compared += 1;
      let mine;
      if (field === "partText") mine = reading.line.text;
      else if (field === "ringStacks" || field === "channelParsed" || field === "stackParsed") mine = reading.channel[field];
      else mine = reading[field];
      if (corrupt) mine = corrupt(field, mine, part);
      const a = canonical(legacy), b = canonical(mine);
      if (a !== b) report.push({ label, source: part.source ?? null, text: part.text, compoundText: part.compoundText ?? null, field, legacy: a, intake: b });
    }
  };
}
