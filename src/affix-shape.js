// Shared line normalisation for matching planner modifier lines to game affix templates.
// Used by the planner at runtime (src/data/affix-index-ss13.generated.js keys) and by
// tools/report-tli-affix-coverage.mjs / tools/build-tli-affix-index.mjs. No dependencies.

// Paraphrase aliases: planner wording -> game template wording. They rewrite the shaped string, so
// they act on both the template and the line side and can only add matches, never remove one.
// Keep the list explicit; every rule is pinned in tests/ignite-attribute-map.test.js.
export const SHAPE_ALIASES = [
  { name: 'stacks of Ignite', from: /\bstacks? of ignite\b/g, to: 'stack(s) of ignite' },
  { name: '+N Max X Blessing Stacks', from: /^# max ([a-z]+) blessing stacks$/, to: '# to max $1 blessing stacks' },
  { name: '; N s recovery against the same target', from: /; # s recovery against the same target$/, to: '. the effect has a # s recovery time against the same target' },
  { name: '; interval N s', from: /; interval # s$/, to: '. interval: #s' },
  { name: '; stacks up to N times', from: /; stacks up to # times$/, to: '. stacks up to # time(s)' },
  { name: 'leading minus sign', from: /(^|\s)−#/g, to: '$1#' },
  { name: ', up to N stacks', from: /, up to # stacks$/, to: ', stacking up to # times' },
];
export function applyShapeAliases(shaped) {
  let out = shaped;
  for (const { from, to } of SHAPE_ALIASES) out = out.replace(from, to);
  return out;
}

// One shape for game templates and planner lines: placeholders and numbers become '#',
// signs, ranges and punctuation collapse, case and whitespace are ignored; then SHAPE_ALIASES.
export function shape(s) {
  return applyShapeAliases(baseShape(s));
}

// shape() without SHAPE_ALIASES (tells whether a match needed an alias).
const NUM = /[+-]?\(?[+-]?\d+(?:\.\d+)?(?:\s*[-–~]\s*[+-]?\d+(?:\.\d+)?)?\)?/g;
export function baseShape(s) {
  return String(s)
    .replace(/<e id=\d+>(.*?)<\/e>/g, '$1')
    .replace(/\$[+-]?P\d+\$/g, '#')
    .replace(/\\n/g, ' ')
    .replace(/\b(spell|attack)(fire|cold|lightning|physical|erosion)\b/gi, '$1 $2')
    .replace(/\(\s*[+-]?[\d.]+(?:\s*\/\s*[+-]?[\d.]+)+\s*\)/g, '#') // per-level lists: ( 18 / 23 / 28 )
    .replace(/\s+([.,%])/g, '$1')
    .replace(/\+\s+(?=\d)/g, '+')
    .replace(NUM, '#')
    .replace(/#\s*[-–~]\s*#/g, '#')
    .replace(/#\s+%/g, '#%')
    .replace(/[+]/g, '')
    .replace(/[.,;:!]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Zero-based parameter indexes in the order their $Pn$ placeholders appear in a game template.
// "Adds $P2$ - $P3$ Fire Damage per $P1$ Intelligence" -> [1, 2, 0].
export function placeholderOrder(template) {
  return [...String(template).matchAll(/\$[+-]?P(\d+)\$/g)].map((m) => Number(m[1]) - 1);
}

// Numbers of a planner line in reading order. A '-' (or U+2212 '−') is a sign only when it does not
// follow a number (so "10 - 20" is two numbers, "-20%" is negative). Per-level lists and rolled
// "(a-b)" ranges yield every number they contain; callers must handle those cases.
export function lineNumbers(line) {
  const out = [];
  const re = /([+\-−]?)(\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(line))) {
    const separator = /[\d)]$/.test(line.slice(0, m.index).trimEnd());
    const negative = (m[1] === '-' || m[1] === '−') && !separator;
    out.push((negative ? -1 : 1) * Number(m[2]));
  }
  return out;
}

// Bind a planner line's numbers to parameter slots using an index entry's `order`.
// Returns { p0: n, p1: n, ... } or null when the counts differ.
export function bindParams(line, order) {
  const numbers = lineNumbers(line);
  if (!order || numbers.length !== order.length) return null;
  const out = {};
  order.forEach((p, i) => { if (!(`p${p}` in out)) out[`p${p}`] = numbers[i]; });
  return out;
}
