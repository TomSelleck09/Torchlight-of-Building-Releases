// Planner-wide search (Ctrl+F; user request 2026-10-26): finds any text of the current build, including the text that is
// only in another tab, a tooltip, a collapsed section or an editor (gear and inventory affixes, talents, slates, pacts,
// memories, skills and supports, the follower, Config and the stat sheet / damage path). The planner (src/app.js) builds
// the index from the same functions that render those tooltips and panels; this module holds the pure parts: turning
// rendered HTML into searchable lines, the index, matching, grouping and highlighting. It never touches planner state.
import { escapeHtml } from "./html.js";
import { normalizePercentageText } from "./percentage-text.js";

/** Result groups, in display order. */
export const PLANNER_SEARCH_AREAS = Object.freeze(["Gear", "Inventory", "Talents", "Slates", "Pacts", "Memories & Hero", "Skills", "Follower", "Config", "Stats & Damage", "Builds"]);

/**
 * The search areas of the page the user is on (user request 2026-10-26: the search finds only what this page holds).
 * Workspace view "builds" → Builds (the saved builds of the library), "character" (Stats) → Stats & Damage,
 * "configuration" (Config) → Config; every other view is the planner page (talents, skills, equipment, pacts, overview;
 * the Follower panel is in its hero panel).
 */
export function areasForPage(view) {
  if (view === "builds") return ["Builds"];
  if (view === "character") return ["Stats & Damage"];
  if (view === "configuration") return ["Config"];
  return ["Gear", "Inventory", "Talents", "Slates", "Pacts", "Memories & Hero", "Skills", "Follower"];
}
export const PLANNER_SEARCH_MIN_LENGTH = 2;
export const PLANNER_SEARCH_LIMIT = 300;
export const PLANNER_SEARCH_DEBOUNCE_MS = 80;
/** The search follows the first result once typing has settled for this long (the panel stays open). */
export const PLANNER_SEARCH_FOLLOW_MS = 250;

/** One line of text as it is displayed: whitespace collapsed, "25 %" read as "25%". */
export function normalizeSearchText(text) {
  return normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", times: "×", minus: "−", ndash: "–", mdash: "—", middot: "·", hellip: "…", rarr: "→", larr: "←", uarr: "↑", darr: "↓", deg: "°", plusmn: "±", le: "≤", ge: "≥", bull: "•", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };
export function decodeHtmlEntities(text) {
  return String(text ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? match;
    const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match;
  });
}

// Markup that is not build text: coverage badges ("In calc"), affix tier and kind badges ("T1", "P"), and the interaction
// hints in tooltip footers ("Click to edit · Right-click to remove").
const DROPPED_MARKUP = [
  /<footer\b[^>]*>[\s\S]*?<\/footer>/gi,
  /<(\w+)\b[^>]*\bclass="[^"]*\b(?:calc-coverage|affix-tier-badge)\b[^"]*"[^>]*>[^<]*<\/\1>/gi,
  /<(b|i)\b[^>]*\bclass="(?:calculated|neutral|pending)"[^>]*>[^<]*<\/\1>/gi,
  /<i>[A-Z]{1,2}<\/i>/g,
  /<small\b[^>]*\bclass="[^"]*(?:hint|skill-tooltip-source)[^"]*"[^>]*>[\s\S]*?<\/small>/gi
];
// A keyword roll's effect lines are spans shown one per line (src/app.js modifierTextMarkup).
const LINE_SPAN = /<span\b[^>]*\bclass="[^"]*\bkeyword-roll-line\b[^"]*"[^>]*>/gi;
const BLOCK_TAG = /<\/?(?:p|li|div|section|article|header|aside|nav|h[1-6]|ul|ol|dl|dt|dd|tr|td|th|table|thead|tbody|summary|details|label|br|hr|small|figcaption|blockquote|footer)\b[^>]*>/gi;
const BOUNDARY = "\u0001";
// Where two inline elements meet, a space separates a word or a closing "%" / ")" from a following word, sign or "("
// ("Reaping Recovery Speed" + "+18%"), but a number keeps its sign and unit ("+" + "25" + "%").
const JOIN = new RegExp(`([^${BOUNDARY}])${BOUNDARY}+(?=([^${BOUNDARY}]))`, "gsu");
// A word, "%" or ")" before a word, number, sign or "(" ("Injury Buffer" + "-15% …"); a digit only before a word, "+", "−"
// or "(" (so "10" + "-" + "20" stays a range).
const spaceBetween = (left, right) => /[\p{L}%)\]]/u.test(left) ? /[\p{L}\p{N}+\-−(]/u.test(right) : /\p{N}/u.test(left) && /[\p{L}+−(]/u.test(right);
function joinAtBoundaries(text) {
  return text.replace(JOIN, (match, left, right) => spaceBetween(left, right) ? `${left} ` : left).replaceAll(BOUNDARY, "");
}

/**
 * Searchable lines of an HTML fragment (a tooltip or panel string): one line per block element or "\n", inline markup
 * removed. Adjacent inline elements keep a space between two words ("<span>Spell</span><span>Fire</span>" reads
 * "Spell Fire") but not inside a number ("+<b>25</b>%" reads "+25%").
 */
export function htmlToSearchLines(html) {
  let text = String(html ?? "");
  for (const pattern of DROPPED_MARKUP) text = text.replace(pattern, " ");
  text = text.replace(/<(script|style|template|svg)\b[\s\S]*?<\/\1>/gi, " ").replace(BLOCK_TAG, "\n").replace(LINE_SPAN, "\n").replace(/<[^>]*>/g, BOUNDARY);
  text = joinAtBoundaries(text);
  return decodeHtmlEntities(text).split(/\n/).map(normalizeSearchText).filter((line) => /[\p{L}\p{N}]/u.test(line));
}

/**
 * The lines without those that only begin another line (a talent's title "Reaping recovery speed" above its effect row
 * "Reaping recovery speed +18%": every match of the short line is a match of the long one) and without a heading that
 * repeats another line with a colon ("Scorching Beam:" above the effects of "Scorching Beam").
 */
export function withoutPrefixLines(lines) {
  const list = (lines || []).map(normalizeSearchText).filter(Boolean);
  const all = new Set(list);
  return list.filter((line) => !(line.endsWith(":") && all.has(line.slice(0, -1).trimEnd()))
    && !list.some((other) => other.length > line.length && other.startsWith(`${line} `)));
}

/**
 * A search index: `add(area, location, text, target)` takes plain text (split on line breaks) or an array of lines;
 * `addHtml` takes rendered HTML. One entry per distinct (location, line) pair, in the order added.
 * `target` (optional): what opening the result shows; `target.key` names the element that glows while it matches.
 */
export function createSearchIndex() {
  const entries = [];
  const seen = new Set();
  const addLines = (area, location, lines, target = null) => {
    const place = normalizeSearchText(location);
    for (const raw of lines) {
      for (const part of String(raw ?? "").split(/\r?\n/)) {
        const text = normalizeSearchText(part);
        if (!text) continue;
        const key = `${place}\u0000${text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ area, location: place, text, target });
      }
    }
  };
  return {
    entries,
    add(area, location, text, target = null) { addLines(area, location, Array.isArray(text) ? text : [text], target); },
    addHtml(area, location, html, target = null) { addLines(area, location, htmlToSearchLines(html), target); }
  };
}

/** The query's words, lower case. */
export function searchWords(query) {
  const needle = normalizeSearchText(query).toLowerCase();
  return needle ? needle.split(" ") : [];
}

function occurrences(haystack, needle) {
  const ranges = [];
  if (!needle) return ranges;
  for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + needle.length)) ranges.push([index, index + needle.length]);
  return ranges;
}

function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Where `query` matches `text` (case-insensitive), as merged [start, end) ranges to highlight; null when it does not.
 * The whole query matches as a substring; otherwise a query of several words matches when every word is in the line
 * ("reaping recovery" finds "+25% Reaping Recovery Speed"). Queries shorter than 2 characters match nothing.
 */
export function matchSearchLine(text, query) {
  const needle = normalizeSearchText(query).toLowerCase();
  if (needle.length < PLANNER_SEARCH_MIN_LENGTH) return null;
  const haystack = String(text ?? "").toLowerCase();
  // toLowerCase keeps the length for the planner's text; a character that changes length disables highlighting only.
  const exact = haystack.length === String(text ?? "").length;
  const whole = occurrences(haystack, needle);
  if (whole.length) return exact ? whole : [];
  const words = needle.split(" ");
  if (words.length < 2) return null;
  const ranges = [];
  for (const word of words) {
    const found = occurrences(haystack, word);
    if (!found.length) return null;
    ranges.push(...found);
  }
  return exact ? mergeRanges(ranges) : [];
}

/**
 * Matches `query` against the index entries. Returns { query, total, shown, truncated, groups, targets }: `groups` in
 * PLANNER_SEARCH_AREAS order (unknown areas after them), each { area, results: [{ entry, ranges }] } in index order;
 * at most `limit` results are kept (the first ones in group order), `total` counts every match. `targets`: the target of
 * every match by its key (the first one for each key), past the limit too, for the glow.
 */
export function searchPlannerIndex(index, query, { limit = PLANNER_SEARCH_LIMIT } = {}) {
  const entries = Array.isArray(index) ? index : index?.entries || [];
  const byArea = new Map();
  const targets = new Map();
  let total = 0;
  for (const entry of entries) {
    const ranges = matchSearchLine(entry.text, query);
    if (!ranges) continue;
    total += 1;
    if (!byArea.has(entry.area)) byArea.set(entry.area, []);
    byArea.get(entry.area).push({ entry, ranges });
    if (entry.target?.key && !targets.has(entry.target.key)) targets.set(entry.target.key, entry.target);
  }
  const order = [...PLANNER_SEARCH_AREAS, ...[...byArea.keys()].filter((area) => !PLANNER_SEARCH_AREAS.includes(area))];
  const groups = [];
  let shown = 0;
  for (const area of order) {
    const results = byArea.get(area);
    if (!results?.length || shown >= limit) continue;
    const kept = results.slice(0, limit - shown);
    shown += kept.length;
    groups.push({ area, results: kept });
  }
  return { query: normalizeSearchText(query), total, shown, truncated: shown < total, groups, targets };
}

/** The results in display order (the order ↑ / ↓ moves through). */
export function flatSearchResults(search) {
  return (search?.groups || []).flatMap((group) => group.results);
}

/**
 * A result's identity across queries and index rebuilds (area, location and line): the search follows the first result
 * only when this changes, so typing on while the same result stays first does not reveal it again. "" for no result.
 */
export function searchResultKey(result) {
  const entry = result?.entry;
  return entry ? `${entry.area}\u0000${entry.location}\u0000${entry.text}` : "";
}

/**
 * How far to scroll the page down (px; negative scrolls up) so a revealed element sits `gap` px below the docked search
 * panel instead of under it; 0 when they do not overlap (or the panel is closed). Rects are viewport rects
 * ({ top, bottom, left, right }).
 */
export function scrollClearOfPanel(target, panel, gap = 8) {
  if (!target || !panel) return 0;
  const overlaps = target.right > panel.left && target.left < panel.right && target.bottom > panel.top && target.top < panel.bottom;
  return overlaps ? Math.round(target.top - (panel.bottom + gap)) : 0;
}

/**
 * The searchable lines of one saved build on the Builds page (src/app.js renderBuilds): what its card shows (the
 * status label, the name, "hero · Updated date") and its details (the hero's trait and the notes, line by line).
 * `hero`: { name, trait } or null; `updated`: the card's date text.
 */
export function buildCardSearchLines(build, { hero = null, active = false, updated = "" } = {}) {
  return [active ? "Active build" : "Saved build", build?.name, `${hero?.name || "No hero selected"}${updated ? ` · Updated ${updated}` : ""}`, hero?.trait, ...String(build?.notes ?? "").split(/\r?\n/)]
    .map(normalizeSearchText).filter(Boolean);
}

/** The targets that glow for a search, by key: every matching result's target (results without a target add none). */
export function searchTargetsByKey(search) {
  if (search?.targets instanceof Map) return new Map(search.targets);
  const targets = new Map();
  for (const result of flatSearchResults(search)) {
    const target = result.entry.target;
    if (target?.key && !targets.has(target.key)) targets.set(target.key, target);
  }
  return targets;
}

/** The glow target keys of a search (see searchTargetsByKey). */
export function searchTargetKeys(search) {
  return new Set(searchTargetsByKey(search).keys());
}

/** `text` as escaped HTML with every range wrapped in <mark>. */
export function highlightSearchText(text, ranges) {
  const source = String(text ?? "");
  let html = "";
  let offset = 0;
  for (const [start, end] of ranges || []) {
    if (start < offset || end > source.length || end <= start) continue;
    html += `${escapeHtml(source.slice(offset, start))}<mark>${escapeHtml(source.slice(start, end))}</mark>`;
    offset = end;
  }
  return html + escapeHtml(source.slice(offset));
}

/** The match count line: "12 matches", "1 match", "No matches on this page"; "" below the minimum query length. */
export function searchCountLabel(search) {
  if (!search || normalizeSearchText(search.query).length < PLANNER_SEARCH_MIN_LENGTH) return "";
  if (!search.total) return "No matches on this page";
  return `${search.total} match${search.total === 1 ? "" : "es"}`;
}

/** The highlight chip's text: `Highlighting "<query>"`, the query cut to `max` characters. */
export function highlightChipLabel(query, max = 24) {
  const text = normalizeSearchText(query);
  return `Highlighting "${text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text}"`;
}

/**
 * What Ctrl+F (Cmd+F on macOS; no Alt or Shift) does: "open" the planner search; with the focus already in the planner
 * search input, "native" lets the browser's own find open (nothing prevented). null for any
 * other key.
 */
export function plannerSearchShortcut(event, { inputFocused = false } = {}) {
  if (!event || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return null;
  if (String(event.key || "").toLowerCase() !== "f") return null;
  if (!inputFocused) return "open";
  return "native";
}

// ---- Rendered panels (browser) ------------------------------------------------------------------------------------
// A panel without a tooltip function (Config, stat sheet, damage path, Pact summary) is read from its rendered markup:
// one row per block element (its own text, inline children included), with the element's child-index path from the
// panel root so the same row is found again in the live panel. Works on any DOM tree (a <template>'s content too).
const ROW_BLOCKS = new Set(["P", "LI", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "ASIDE", "NAV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "DL", "DT", "DD", "TR", "TABLE", "THEAD", "TBODY", "SUMMARY", "DETAILS", "LABEL", "BUTTON", "FIGCAPTION", "BLOCKQUOTE", "FORM", "FIELDSET"]);
const ROW_SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "SVG", "NOSCRIPT", "OPTION", "TEXTAREA"]);
const ROW_BADGE = /(?:^|\s)(?:calc-coverage|affix-tier-badge)(?:\s|$)/;

// Inline elements read as their own row: a keyword roll's effect line, and a label / value chip (a span holding a label
// span and a <strong> / <b> value, as the Effective HP layers).
function isRowSpan(element) {
  if (element.tagName !== "SPAN") return false;
  if (/(?:^|\s)keyword-roll-line(?:\s|$)/.test(typeof element.className === "string" ? element.className : "")) return true;
  const children = element.children;
  return children?.length === 2 && children[0].tagName === "SPAN" && (children[1].tagName === "STRONG" || children[1].tagName === "B")
    && [...element.childNodes].every((child) => child.nodeType !== 3 || !child.nodeValue.trim());
}

function isRowBadge(element) {
  const className = typeof element.className === "string" ? element.className : "";
  if (ROW_BADGE.test(className)) return true;
  return (element.tagName === "B" || element.tagName === "I") && /^(?:calculated|neutral|pending)$/.test(className.trim());
}

/** Child-index path of `element` under `root` ([] for the root itself; null when it is not inside). */
export function elementPath(element, root) {
  const path = [];
  for (let node = element; node && node !== root; node = node.parentNode) {
    const parent = node.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, node));
  }
  return path;
}

/** The element at `path` under `root`, or null. */
export function elementAtPath(root, path) {
  let node = root;
  for (const index of path || []) {
    node = node?.children?.[index];
    if (!node) return null;
  }
  return node || null;
}

/**
 * Rows of rendered markup: [{ element, text, label, path }] in document order. `text` includes the values shown in
 * number / text inputs and selects; `label` is the row's own text without them (what the element's textContent holds).
 */
export function domSearchRows(root) {
  const rows = new Map();
  const order = [];
  const append = (block, text, value = false) => {
    if (!rows.has(block)) { rows.set(block, []); order.push(block); }
    rows.get(block).push({ text, value });
  };
  const blockOf = (node) => {
    for (let element = node.parentNode; element && element !== root; element = element.parentNode) if (ROW_BLOCKS.has(element.tagName) || isRowSpan(element)) return element;
    return root;
  };
  const walk = (node) => {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 3) { if (child.nodeValue.trim()) append(blockOf(child), child.nodeValue); continue; }
      if (child.nodeType !== 1) continue;
      const tag = String(child.tagName || "").toUpperCase();
      if (ROW_SKIP.has(tag) || isRowBadge(child)) continue;
      if (tag === "INPUT" && ["number", "text"].includes(String(child.type || "text").toLowerCase()) && child.value) append(blockOf(child), ` ${child.value} `, true);
      if (tag === "SELECT") { const option = child.options?.[child.selectedIndex]; if (option?.textContent) append(blockOf(child), ` ${option.textContent} `, true); continue; }
      walk(child);
    }
  };
  walk(root);
  return order.map((element) => {
    const parts = rows.get(element);
    return { element, text: joinTextParts(parts.map((part) => part.text)), label: joinTextParts(parts.filter((part) => !part.value).map((part) => part.text)), path: element === root ? [] : elementPath(element, root) };
  }).filter((row) => /[\p{L}\p{N}]/u.test(row.text));
}

/**
 * The row label of `element` itself, as domSearchRows reads it when the element is a row: its own text without the rows
 * nested in it (a "?" help button inside a heading row), badges and form values. Finding a row again in the live panel
 * compares this, not the element's whole textContent.
 */
export function elementRowLabel(element) {
  const parts = [];
  const walk = (node) => {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 3) { if (child.nodeValue.trim()) parts.push(child.nodeValue); continue; }
      if (child.nodeType !== 1) continue;
      const tag = String(child.tagName || "").toUpperCase();
      if (ROW_SKIP.has(tag) || ROW_BLOCKS.has(tag) || tag === "SELECT" || isRowSpan(child) || isRowBadge(child)) continue;
      walk(child);
    }
  };
  if (element) walk(element);
  return joinTextParts(parts);
}

// Text pieces of one row (one per text node), joined as htmlToSearchLines joins inline elements.
function joinTextParts(parts) {
  return normalizeSearchText(joinAtBoundaries(parts.join(BOUNDARY)));
}
