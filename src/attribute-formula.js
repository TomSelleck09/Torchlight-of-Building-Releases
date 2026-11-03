// Parser and evaluator for the game's character-panel formulas (ConfigView/config_attributes_show, extracted to
// src/data/game/attribute-formulas.generated.js by scripts/build-attribute-formulas.mjs).
//
// Grammar (documented from the data: a census of all 1,341 SS14 formulas, 2026-10-17). The formulas are Lua
// expressions over bracketed references:
//
//   formula  := expr ('|' expr)*                  '|' separates the values of a multi-value row ("min | max",
//                                                 "current (uncapped)"); [S<id>:<n>] reads the n-th value
//   expr     := or
//   or       := and ('or' and)*                   Lua: a or b  = a when a is truthy, else b
//   and      := compare ('and' compare)*          Lua: a and b = a when a is false, else b. Numbers, 0 included,
//                                                 are truthy, so "cond and x or y" is the Lua ternary (with x = 0 too)
//   compare  := sum (('==' | '~=' | '<' | '>' | '<=' | '>=') sum)*
//   sum      := product (('+' | '-') product)*
//   product  := unary (('*' | '/' | '%') unary)*
//   unary    := ('-' | 'not') unary | power
//   power    := atom ('^' unary)?                 right-associative; binds tighter than a leading minus (Lua)
//   atom     := number | reference | '(' expr ')' | name '(' expr (',' expr)* ')'
//   name     := math.min | math.max | math.floor | math.ceil | math.abs   (any other name evaluates to unknown)
//
// Operators seen in the data: + - * / ^ == < > <= and or, math.min / math.max / math.floor, '|'.
//
// References (the bracket's first letters pick the kind):
//   [S<id>] / [S<id>:<n>]       another panel row (rows build on rows); n is 1-based
//   [A<attr>]                   the attribute's value (e.g. [A5127] Max Fire Resistance 60 + flat)
//   [A<attr>X]                  its "increased" factor 1 + Σ%; several are added with "-(n-1)", so increases of
//                               the types in one damage chain add in one pool
//   [A<attr>E]                  its "additional" factor Π(1 + %); always multiplied
//   [A<attr>B]                  its base (flat) part; with <min> / <max> the ends of an added-damage range
//   …#<tags>                    tag filter: '|' separates tags ([A5107X#5100309|5100001|5100003]: Fire increased
//                               in the DoT + ailment + Ignite context), '+' joins tags of one item ([A4801#0+6001110])
//   [O…]                        the same attribute aggregates for the Minion
//   [L<id>] / [N<id>]           flags (cannot deal Fire, Lucky, …) for the hero / the Minion
//   [F<id>] / [M<id>]           final combat values (Affliction per second, ailment chances, …) / the Minion's
//   [D<attr>(,<hand>)…]         the skill's (or the weapon's, hand 0 / 1) own base damage, with <min> / <max>
//   [weapon:<attr>,<hand>…]     the weapon's local value (local crit rating, accuracy)
//   [userdefine:<n>]            a value computed in the client's Lua (casts per second, attack speed, …); not in data
//
// Evaluation never guesses: a reference the caller's resolver does not answer, an unknown function, or a type error
// (arithmetic on a boolean) makes the result unknown and is listed in `unknown` / `errors`. Lua short-circuits, so a
// branch that is not taken does not need its inputs.

export const UNKNOWN = Symbol("unknown");

// ---- Tokenizer --------------------------------------------------------------------------------------------------------

const OPERATORS = ["==", "~=", "<=", ">=", "<", ">", "+", "-", "*", "/", "%", "^", "(", ")", ",", "|"];

export function tokenizeFormula(text) {
  const source = String(text ?? "");
  const tokens = [];
  let at = 0;
  while (at < source.length) {
    const char = source[at];
    if (/\s/.test(char)) { at += 1; continue; }
    if (char === "[") {
      const end = source.indexOf("]", at);
      if (end < 0) throw new SyntaxError(`Unclosed reference at ${at} in ${source}`);
      tokens.push({ type: "ref", text: source.slice(at + 1, end), at });
      at = end + 1;
      continue;
    }
    const number = source.slice(at).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) { tokens.push({ type: "num", value: Number(number[0]), at }); at += number[0].length; continue; }
    const word = source.slice(at).match(/^[A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*/);
    if (word) { tokens.push({ type: ["and", "or", "not"].includes(word[0]) ? word[0] : "name", text: word[0], at }); at += word[0].length; continue; }
    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, at));
    if (operator) { tokens.push({ type: "op", text: operator, at }); at += operator.length; continue; }
    throw new SyntaxError(`Unexpected '${char}' at ${at} in ${source}`);
  }
  return tokens;
}

// ---- References -------------------------------------------------------------------------------------------------------

const parseTags = (spec) => (spec ? spec.split("|").map((item) => item.split("+").map(Number)) : null);

// Parse the text inside one [...] into a reference object. Unknown shapes become { kind: "unknown" }.
export function parseReference(text) {
  const raw = String(text);
  let match = raw.match(/^S(\d+)(?::(\d+))?$/);
  if (match) return { kind: "S", id: Number(match[1]), index: match[2] ? Number(match[2]) : 1, raw };
  match = raw.match(/^([AO])(\d+)([XEB])?(?:#([\d|+]+))?(?:<(min|max)>)?$/);
  if (match) return { kind: match[1], id: Number(match[2]), part: match[3] ?? null, tags: parseTags(match[4]), range: match[5] ?? null, raw };
  match = raw.match(/^([LNFM])(\d+)(?:#([\d|+]+))?$/);
  if (match) return { kind: match[1], id: Number(match[2]), tags: parseTags(match[3]), raw };
  match = raw.match(/^D(\d+)(?:,(\d+))?(?:#([\d|+]+))?(?:<(min|max)>)?$/);
  if (match) return { kind: "D", id: Number(match[1]), hand: match[2] === undefined ? null : Number(match[2]), tags: parseTags(match[3]), range: match[4] ?? null, raw };
  match = raw.match(/^userdefine:(\d+)$/);
  if (match) return { kind: "userdefine", id: Number(match[1]), raw };
  match = raw.match(/^weapon:(\d+),(\d+)(?:#([\d|+]+))?$/);
  if (match) return { kind: "weapon", id: Number(match[1]), hand: Number(match[2]), tags: parseTags(match[3]), raw };
  return { kind: "unknown", raw };
}

// Canonical text of a reference (its bracket text), used as a map key and in `unknown` lists.
export const referenceKey = (ref) => ref.raw;

// ---- Parser -----------------------------------------------------------------------------------------------------------

const COMPARE = new Set(["==", "~=", "<", ">", "<=", ">="]);

export function parseFormula(text) {
  const tokens = tokenizeFormula(text);
  let position = 0;
  const peek = () => tokens[position];
  const isOp = (op) => peek()?.type === "op" && peek().text === op;
  const next = () => tokens[position++];
  const expect = (op) => { if (!isOp(op)) throw new SyntaxError(`Expected '${op}' at token ${position} in ${text}`); next(); };

  function atom() {
    const token = next();
    if (!token) throw new SyntaxError(`Unexpected end of formula: ${text}`);
    if (token.type === "num") return { type: "num", value: token.value };
    if (token.type === "ref") return { type: "ref", ref: parseReference(token.text) };
    if (token.type === "op" && token.text === "(") { const inner = expression(); expect(")"); return inner; }
    if (token.type === "name") {
      expect("(");
      const args = [];
      if (!isOp(")")) { args.push(expression()); while (isOp(",")) { next(); args.push(expression()); } }
      expect(")");
      return { type: "call", name: token.text, args };
    }
    throw new SyntaxError(`Unexpected token '${token.text ?? token.type}' at ${token.at} in ${text}`);
  }
  function power() {
    const base = atom();
    if (isOp("^")) { next(); return { type: "binary", op: "^", left: base, right: unary() }; }
    return base;
  }
  function unary() {
    if (isOp("-")) { next(); return { type: "unary", op: "-", arg: unary() }; }
    if (peek()?.type === "not") { next(); return { type: "unary", op: "not", arg: unary() }; }
    return power();
  }
  function binaryLevel(operand, ops) {
    return () => {
      let left = operand();
      while (peek()?.type === "op" && ops.has(peek().text)) { const op = next().text; left = { type: "binary", op, left, right: operand() }; }
      return left;
    };
  }
  const product = binaryLevel(unary, new Set(["*", "/", "%"]));
  const sum = binaryLevel(product, new Set(["+", "-"]));
  const compare = binaryLevel(sum, COMPARE);
  function and() { let left = compare(); while (peek()?.type === "and") { next(); left = { type: "and", left, right: compare() }; } return left; }
  function expression() { let left = and(); while (peek()?.type === "or") { next(); left = { type: "or", left, right: and() }; } return left; }

  const values = [expression()];
  while (isOp("|")) { next(); values.push(expression()); }
  if (position !== tokens.length) throw new SyntaxError(`Unexpected '${peek().text ?? peek().type}' at ${peek().at} in ${text}`);
  return { type: "formula", values };
}

const parseCache = new Map();
export function parseFormulaCached(text) {
  if (!parseCache.has(text)) parseCache.set(text, parseFormula(text));
  return parseCache.get(text);
}

// Every reference in a parsed formula (or AST node), in order of appearance.
export function formulaReferences(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.type === "ref") out.push(node.ref);
  for (const child of [node.left, node.right, node.arg, ...(node.args ?? []), ...(node.values ?? [])]) formulaReferences(child, out);
  return out;
}

// ---- Evaluator --------------------------------------------------------------------------------------------------------

const FUNCTIONS = {
  "math.min": (...args) => Math.min(...args),
  "math.max": (...args) => Math.max(...args),
  "math.floor": (value) => Math.floor(value),
  "math.ceil": (value) => Math.ceil(value),
  "math.abs": (value) => Math.abs(value),
};

const truthy = (value) => value !== false && value !== null && value !== undefined;

// Evaluate one AST node. resolve(ref) returns a number (or boolean), or undefined when the value is not known.
// state collects { unknown: Set<reference key>, errors: [] }.
export function evaluateNode(node, resolve, state = { unknown: new Set(), errors: [] }) {
  const fail = (reason) => { state.unknown.add(reason); return UNKNOWN; };
  const numeric = (value, what) => {
    if (value === UNKNOWN) return UNKNOWN;
    if (typeof value !== "number") { state.errors.push(`${what}: ${typeof value} operand`); return UNKNOWN; }
    return value;
  };
  switch (node.type) {
    case "num": return node.value;
    case "ref": {
      if (node.ref.kind === "unknown") return fail(`reference:${node.ref.raw}`);
      const value = resolve(node.ref);
      return value === undefined || value === null || (typeof value === "number" && Number.isNaN(value)) ? fail(referenceKey(node.ref)) : value;
    }
    case "unary": {
      const value = evaluateNode(node.arg, resolve, state);
      if (value === UNKNOWN) return UNKNOWN;
      if (node.op === "not") return !truthy(value);
      const number = numeric(value, "unary -");
      return number === UNKNOWN ? UNKNOWN : -number;
    }
    case "and": {
      const left = evaluateNode(node.left, resolve, state);
      if (left === UNKNOWN) return UNKNOWN;
      return truthy(left) ? evaluateNode(node.right, resolve, state) : left;
    }
    case "or": {
      const left = evaluateNode(node.left, resolve, state);
      if (left === UNKNOWN) return UNKNOWN;
      return truthy(left) ? left : evaluateNode(node.right, resolve, state);
    }
    case "binary": {
      if (node.op === "*" && state.zeroAbsorbs) {
        // Opt-in: an exact 0 factor makes the product 0 whatever the other (finite) factor is. The unknown inputs of
        // the absorbed factor are listed in state.absorbed instead of state.unknown.
        const leftState = { unknown: new Set(), errors: [], zeroAbsorbs: true, absorbed: state.absorbed };
        const rightState = { unknown: new Set(), errors: [], zeroAbsorbs: true, absorbed: state.absorbed };
        const left = evaluateNode(node.left, resolve, leftState), right = evaluateNode(node.right, resolve, rightState);
        const zero = (value, own) => value === 0 && !own.errors.length;
        if ((zero(left, leftState) && right === UNKNOWN && !rightState.errors.length) || (zero(right, rightState) && left === UNKNOWN && !leftState.errors.length)) {
          (left === UNKNOWN ? leftState : rightState).unknown.forEach((item) => state.absorbed?.add(item));
          return 0;
        }
        for (const child of [leftState, rightState]) { child.unknown.forEach((item) => state.unknown.add(item)); state.errors.push(...child.errors); }
        if (left === UNKNOWN || right === UNKNOWN) return UNKNOWN;
        const a = numeric(left, "*"), b = numeric(right, "*");
        return a === UNKNOWN || b === UNKNOWN ? UNKNOWN : a * b;
      }
      const left = evaluateNode(node.left, resolve, state), right = evaluateNode(node.right, resolve, state);
      if (left === UNKNOWN || right === UNKNOWN) return UNKNOWN;
      if (node.op === "==") return left === right;
      if (node.op === "~=") return left !== right;
      const a = numeric(left, node.op), b = numeric(right, node.op);
      if (a === UNKNOWN || b === UNKNOWN) return UNKNOWN;
      switch (node.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b; // Lua float division: x / 0 = ±inf, 0 / 0 = nan
        case "%": return a - Math.floor(a / b) * b;
        case "^": return a ** b;
        case "<": return a < b;
        case ">": return a > b;
        case "<=": return a <= b;
        case ">=": return a >= b;
        default: state.errors.push(`operator ${node.op}`); return UNKNOWN;
      }
    }
    case "call": {
      const fn = FUNCTIONS[node.name];
      if (!fn) return fail(`function:${node.name}`);
      const args = node.args.map((arg) => evaluateNode(arg, resolve, state));
      if (args.includes(UNKNOWN)) return UNKNOWN;
      const numbers = args.map((arg) => numeric(arg, node.name));
      return numbers.includes(UNKNOWN) ? UNKNOWN : fn(...numbers);
    }
    default:
      state.errors.push(`node ${node.type}`);
      return UNKNOWN;
  }
}

// Evaluate a formula text (or parsed formula). Returns { values, value, complete, unknown, errors, absorbed }; value
// is the first value; complete is true when every value is a known number. options.zeroAbsorbs: see "binary" above.
export function evaluateFormula(formula, resolve, options = {}) {
  const parsed = typeof formula === "string" ? parseFormulaCached(formula) : formula;
  const state = { unknown: new Set(), errors: [], zeroAbsorbs: Boolean(options.zeroAbsorbs), absorbed: new Set() };
  const values = parsed.values.map((node) => {
    const value = evaluateNode(node, resolve, state);
    return value === UNKNOWN ? null : value;
  });
  const complete = values.every((value) => typeof value === "number") && !state.errors.length;
  return { values, value: values[0], complete, unknown: [...state.unknown], errors: state.errors, absorbed: [...state.absorbed] };
}

// ---- Panel evaluator (rows that reference rows) -----------------------------------------------------------------------

// rows: the ATTRIBUTE_FORMULAS list (or any list of { id, formula }). resolve(ref, { row, root }) answers every non-S
// reference; row is the row whose formula holds the reference, root the row being evaluated. overrides: Map or object
// rowId -> number | number[] that replaces a row's own formula (rows the client fills in code). Each evaluate(rootId)
// call memoizes rows for that root only (attribute values may depend on the root's tag context). zeroAbsorbs: passed to
// evaluateFormula (a 0 factor absorbs an unknown one; the absorbed inputs are listed in `absorbed`).
export function createPanelEvaluator({ rows, resolve, overrides = {}, zeroAbsorbs = false } = {}) {
  const byId = rows instanceof Map ? rows : new Map((rows ?? []).map((row) => [row.id, row]));
  const override = overrides instanceof Map ? (id) => overrides.get(id) : (id) => overrides[id];
  function evaluate(rootId, { trace = false } = {}) {
    const root = byId.get(rootId);
    const memo = new Map();
    const visiting = new Set();
    const steps = [];
    function rowResult(id) {
      if (memo.has(id)) return memo.get(id);
      const replaced = override(id);
      if (replaced !== undefined && replaced !== null) {
        const values = Array.isArray(replaced) ? replaced : [replaced];
        const result = { id, values, value: values[0], complete: values.every((value) => typeof value === "number"), unknown: [], errors: [], overridden: true };
        memo.set(id, result);
        return result;
      }
      const row = byId.get(id);
      if (!row) { const result = { id, values: [null], value: null, complete: false, unknown: [`row:S${id}`], errors: [] }; memo.set(id, result); return result; }
      if (visiting.has(id)) { const result = { id, values: [null], value: null, complete: false, unknown: [], errors: [`cycle at S${id}`] }; return result; }
      visiting.add(id);
      // Child rows' reasons are attached after the evaluation, so a child absorbed by a 0 factor (zeroAbsorbs) moves its
      // reasons to `absorbed` instead of `unknown`.
      const children = new Map(), errors = [];
      let result;
      try {
        result = evaluateFormula(row.formula, (ref) => {
          if (ref.kind === "S") {
            const child = rowResult(ref.id);
            children.set(referenceKey(ref), child);
            const value = child.values[ref.index - 1];
            return value === undefined ? null : value;
          }
          return resolve ? resolve(ref, { row, root }) : undefined;
        }, { zeroAbsorbs });
      } catch (error) {
        result = { values: [null], value: null, complete: false, unknown: [], errors: [`parse: ${error.message}`], absorbed: [] };
      }
      visiting.delete(id);
      const unknown = new Set(), absorbed = new Set();
      // A child row that is unknown for its own reasons: list those reasons, not the row reference.
      const expand = (item, into) => {
        const child = children.get(item);
        if (child && (child.unknown.length || child.errors.length)) {
          child.unknown.forEach((reason) => into.add(reason));
          (child.absorbed ?? []).forEach((reason) => absorbed.add(reason));
          if (into === unknown) child.errors.forEach((error) => errors.push(error));
        }
        else into.add(item);
      };
      result.unknown.forEach((item) => expand(item, unknown));
      result.absorbed.forEach((item) => expand(item, absorbed));
      for (const [key, child] of children) {
        if (result.unknown.includes(key) || result.absorbed.includes(key)) continue;
        child.errors.forEach((error) => errors.push(error));
        (child.absorbed ?? []).forEach((reason) => absorbed.add(reason));
      }
      errors.push(...result.errors);
      const final = { id, name: row.name ?? null, values: result.values, value: result.values[0], complete: result.complete && !unknown.size && !errors.length, unknown: [...unknown], errors: [...new Set(errors)], absorbed: [...absorbed] };
      memo.set(id, final);
      if (trace) steps.push(final);
      return final;
    }
    const result = rowResult(rootId);
    return { ...result, row: root ?? null, ...(trace ? { steps } : {}) };
  }
  return { evaluate, rows: byId };
}
