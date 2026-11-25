// Number-agnostic matching of displayed English game text to the game's own Chinese text (display only).
// Used by src/data/i18n/zh-cn.generated.js at runtime and by scripts/build-zh-cn-text.mjs when it builds that table.
// No dependencies, no planner imports: the calculation, the item reader and every stored state stay English.
//
// A line's "slots" are its numbers in reading order (a rolled "(10–20)" range, a signed "+12.5", a template's "$+P1$",
// "{%s:1}", "%d"); its key is the line with every slot replaced by "#", rich text stripped, case, whitespace, dashes and
// trailing punctuation folded. A table line entry is [zhTemplate, checks?]: zhTemplate holds "{i}" (slot i of the English
// line, as shown), "{i-}" (slot i without a leading "+") or "{i+}" (slot i with a "+" added when it has no sign); checks lists
// [i, literal] pairs: slot i of the English template is that literal number and the Chinese text keeps its own copy, so the
// line's slot must equal it.

const SLOT = /[+\-−]?\$[+-]?[A-Za-z]{0,3}\d+\$|[+\-−]?\$dyna\[\d+\]\$|[+\-−]?\{%[sd](?::\d+)?\}|[+\-−]?%[ds]|[+\-−]?\(\s*[+\-−]?\d+(?:\.\d+)?%?(?:\s*\/\s*[+\-−]?\d+(?:\.\d+)?%?)+\s*\)|[+\-−]?\(\s*[+\-−]?\d+(?:\.\d+)?\s*[–—~-]\s*[+\-−]?\d+(?:\.\d+)?\s*\)|[+\-−]?\d+(?:\.\d+)?/g;

// Strip the game's rich text: <e id=N>…</e>, <RichText …>…</>, <p>…</p>; keep the inner text.
export function stripRichText(text) {
  return String(text ?? "")
    .replace(/<e id=\d+>/g, "").replace(/<\/e>/g, "")
    .replace(/<RichText[^>]*>/g, "").replace(/<\/>/g, "")
    .replace(/<\/?p>/g, "");
}

// The slots of a text: [{ text, start, end, param?, signed }]. A "-" right after a digit, ")" or a placeholder ("$P1$-$P2$")
// is a separator, not a sign.
export function textSlots(text) {
  const source = String(text ?? "");
  const out = [];
  for (const match of source.matchAll(SLOT)) {
    let value = match[0], start = match.index;
    if (/^[-−]/.test(value) && /[\d)$}]$/.test(source.slice(Math.max(0, start - 1), start))) { value = value.slice(1); start += 1; }
    const param = value.match(/\$[+-]?([A-Za-z]{0,3}\d+)\$/)?.[1]?.toLowerCase() ?? value.match(/\$dyna\[(\d+)\]\$/)?.[1]?.replace(/^/, "y")
      ?? value.match(/\{%[sd]:(\d+)\}/)?.[1]?.replace(/^/, "h") ?? (/^[+\-−]?(?:\{%[sd]\}|%[ds])$/.test(value) ? "positional" : null);
    const signed = /^\+|^\$\+/.test(value) || /\$\+/.test(value);
    out.push({ text: value, start, end: start + value.length, param, signed });
  }
  let positional = 0;
  for (const slot of out) if (slot.param === "positional") slot.param = `d${positional++}`;
  return out;
}

// The number-agnostic key of one line.
export function lineKey(text) {
  const source = stripRichText(text);
  const slots = textSlots(source);
  let out = "", at = 0;
  for (const slot of slots) { out += source.slice(at, slot.start) + "#"; at = slot.end; }
  out += source.slice(at);
  return foldKey(out);
}

const foldKey = (text) => String(text)
  .replace(/[–—−~]/g, "-")
  .replace(/[’‘`]/g, "'").replace(/[“”]/g, "\"")
  .replace(/\s+/g, "")
  .replace(/[.,;:!。，；：！]+$/g, "")
  .toLowerCase();

// The key of a name.
export function nameKey(text) {
  return stripRichText(text).replace(/[–—−]/g, "-").replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

// Fills a compiled Chinese template with the slots of the English line.
export function fillTemplate(template, slots) {
  return template.replace(/\{(\d+)([+-]?)\}/g, (whole, index, mode) => {
    const slot = slots[Number(index)];
    if (!slot) return whole;
    let value = slot.text.replace(/−/g, "-");
    if (mode === "-") value = value.replace(/^\+/, "");
    if (mode === "+" && !/^[+-]/.test(value)) value = `+${value}`;
    return value;
  });
}

const numericEqual = (a, b) => {
  const clean = (value) => String(value).replace(/^[+−-]/, (sign) => (sign === "+" ? "" : "-")).replace(/−/g, "-");
  const x = clean(a), y = clean(b);
  return x === y || (Number.isFinite(Number(x)) && Number(x) === Number(y));
};

// Chooses the first entry whose literal checks the line meets (null when none does). An entry is a template string or
// [template, checks].
function pickEntry(entries, slots) {
  for (const entry of entries) {
    const [template, checks] = typeof entry === "string" ? [entry, null] : entry;
    if (!checks || checks.every(([index, literal]) => slots[index] && numericEqual(slots[index].text, literal))) return template;
  }
  return null;
}

// Translates one line (no separators) against a line table { [lineKey]: entry | entry[] } (a lone entry with no checks is
// stored as its template string). Returns the Chinese text or null.
export function translateLine(lines, text) {
  const source = stripRichText(text).trim();
  if (!source) return null;
  const found = lines[lineKey(source)];
  if (found == null) return null;
  const template = pickEntry(typeof found === "string" ? [found] : found, textSlots(source));
  return template == null ? null : fillTemplate(template, textSlots(source));
}

// The separators a displayed text joins its game lines with, tried in this order after the whole text.
// "/" joins name lists ("God of Might/Goddess of Hunting/…" in a prism's core line). A written "\n" (backslash, n) in a
// catalog text is read as a line break (translateGameText).
export const LINE_SEPARATORS = ["\n", " | ", " · ", "; ", "/"];

// A phrase is a game row whose placeholders take words as well as numbers ("All $P1$ within the area also gain: $P2$",
// "Deals {%s:2} {%s:3} Damage equal to {%s:1} of Base Damage"): [pattern source (anchored, case-insensitive, one group per
// placeholder), Chinese template with "{gN}" for group N, a lower-case fragment the text must contain (a fast pre-check)].
const phraseCache = new WeakMap();
const compiledPhrases = (phrases) => {
  let compiled = phraseCache.get(phrases);
  if (!compiled) phraseCache.set(phrases, (compiled = phrases.map(([source, template, fragment]) => [new RegExp(source, "i"), template, fragment || ""])));
  return compiled;
};
const NUM = "[+\\-−]?(?:\\d+(?:\\.\\d+)?|\\(\\s*[+\\-−]?\\d+(?:\\.\\d+)?\\s*[–—~-]\\s*[+\\-−]?\\d+(?:\\.\\d+)?\\s*\\))%?";
const NUMERIC_VALUE = new RegExp(`^${NUM}(?:\\s*[-–]\\s*${NUM})?$`);
// Words a reference text glues together ("SpellLightning").
const unglue = (text) => text.replace(/\b(Spell|Attack)(Fire|Cold|Lightning|Physical|Erosion)\b/g, "$1 $2");
const phraseFold = (text) => text.toLowerCase().replace(/\s+/g, " ");

// Builds translateGameText(kind, english, { partial }) over a table { names, kindNames, lines, phrases }.
// Order: the kind's own name, any name, the whole text as one line, a "Name:" header (its colon kept as "："), a phrase
// (each word group translated by the same rules), then clause by clause on the first separator present. Returns null
// unless every clause is translated, or the text with the untranslated clauses left in English when { partial: true }.
// Last-resort splits for texts that join game lines with a plain space: before a sentence, or before a clause that starts
// with a signed number ("… for the supported skill +5% additional …"). The pieces are rejoined with a space.
const LOOSE_SPLITS = [/(?<=[.!?])\s+(?=[A-Z+\-−(\d])/, /(?<=[A-Za-z%)])\s+(?=[+\-−]\(?\d)/];
const CJK = /[㐀-鿿]/;

export function makeTranslator(table) {
  const names = table.names || {}, kindNames = table.kindNames || {}, lines = table.lines || {}, phrases = table.phrases || [];
  // table.nameOf(kind, key) replaces the two maps (the build uses it to choose and record names per kind).
  const name = (kind, text) => {
    const key = nameKey(text);
    if (!key) return null;
    return (table.nameOf ? table.nameOf(kind, key) : kindNames[kind]?.[key] ?? names[key]) ?? null;
  };
  const pieces = (kind, list, partial, depth, joiner) => {
    const parts = list.map((part) => {
      const lead = part.match(/^\s*/)[0], trail = part.match(/\s*$/)[0];
      const core = part.trim();
      if (!core) return part;
      const done = one(kind, core, partial, depth + 1);
      return done == null ? null : `${lead}${done}${trail}`;
    });
    if (parts.every((part) => part != null)) return parts.join(joiner);
    if (partial) return list.map((part, index) => parts[index] ?? part).join(joiner);
    return null;
  };
  const one = (kind, text, partial, depth) => {
    const source = String(text ?? "");
    if (!source.trim()) return source;
    if (CJK.test(source) && !/[A-Za-z]{2}/.test(stripRichText(source).replace(/[A-Z]{2,}|Lv\./g, ""))) return source; // already Chinese
    const direct = name(kind, source) ?? translateLine(lines, source);
    if (direct != null) return direct;
    const header = source.match(/^(\s*)(.+?)\s*[:：]\s*$/);
    if (header) { const head = name(kind, header[2]) ?? translateLine(lines, header[2]); if (head != null) return `${header[1]}${head}：`; }
    const bracket = source.match(/^(\s*)\[([^\]]+)\]\s*(.+)$/s);
    if (bracket) {
      const label = name("core", bracket[2]) ?? name(kind, bracket[2]);
      const rest = label == null ? null : one(kind, bracket[3], partial, depth + 1);
      if (label != null && rest != null) return `${bracket[1]}[${label}] ${rest}`;
    }
    if (depth < 4 && phrases.length) {
      const plain = unglue(stripRichText(source).trim()), folded = phraseFold(plain);
      for (const [index, [pattern, template, fragment]] of compiledPhrases(phrases).entries()) {
        if (fragment && !folded.includes(fragment)) continue;
        const match = pattern.exec(plain);
        if (!match) continue;
        // A word group is mostly a damage type or tag ("Deals {%s:2} {%s:3} Damage"): the skill tag's rendering first.
        const groups = match.slice(1).map((value) => {
          const part = String(value ?? "").trim();
          return NUMERIC_VALUE.test(part) ? part.replace(/−/g, "-") : name("tag", part) ?? one(kind, part, false, depth + 1);
        });
        if (groups.every((group) => group != null)) { table.onPhrase?.(index, plain); return template.replace(/\{g(\d+)\}/g, (whole, group) => groups[Number(group)] ?? whole); }
      }
    }
    if (depth < 4) for (const separator of LINE_SEPARATORS) if (source.includes(separator)) return pieces(kind, source.split(separator), partial, depth, separator);
    if (depth < 4) for (const split of LOOSE_SPLITS) {
      const list = source.split(split);
      if (list.length > 1) { const done = pieces(kind, list, false, depth, " "); if (done != null) return done; }
    }
    // "Prefix: Name" the game has no row for as a whole ("Tartarus: Thunder Spike"): the prefix as a name (the game's own
    // "Tartarus: X" rows give it), the rest by the same rules, joined with "：" as those rows are.
    const prefixed = source.match(/^([^:\n]{2,40}):\s+([^\n]+)$/);
    if (prefixed && depth < 4) {
      const head = name(kind, prefixed[1]);
      const rest = head == null ? null : one(kind, prefixed[2], false, depth + 1);
      if (head != null && rest != null) return `${head}：${rest}`;
    }
    if (partial && depth < 4) for (const split of LOOSE_SPLITS) { const list = source.split(split); if (list.length > 1) return pieces(kind, list, true, depth, " "); }
    return null;
  };
  // Renders call this for the same texts again and again: remember the answers (bounded).
  const cache = new Map();
  return function translateGameText(kind, english, { partial = false } = {}) {
    if (english == null) return null;
    const id = `${kind}\u0000${partial ? 1 : 0}\u0000${english}`;
    if (cache.has(id)) return cache.get(id);
    const result = one(kind, String(english).replace(/\\n/g, "\n"), partial, 0);
    if (cache.size >= 20000) cache.clear();
    cache.set(id, result);
    return result;
  };
}
