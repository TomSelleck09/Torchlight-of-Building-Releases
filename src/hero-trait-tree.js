// Hero trait trees (SS14, 2026-10-15): the heroes whose 45 / 60 / 75 traits are picked on a tree instead of one per level.
// Selena – Dance of the Deep (since SS13), Thea – Wisdom of The Gods (revamped in SS14) and Youga – The Ultimate One (new in
// SS14) share the rules Selena's tree had (src/selena-dance-tree.js keeps her old exports on top of this module):
// - the tree comes from reference data (tools/import-hero-traits.mjs: `tree.nodes` with each node's parent; the base trait is the
//   root); a node can be picked once its parent is picked (the base trait counts as picked);
// - `hero.treeTraits[heroId]` is row-indexed: index 0 / 1 / 2 = the Lv.45 / 60 / 75 memory row ("" for an empty row, trailing
//   empty rows trimmed). Each pick takes the level of the memory in its row (src/hero-memory-rules.js slotTraitLevel);
// - placement rule (user-corrected 2026-10-13 for Selena): a trait whose parent is not the base trait sits in a later row
//   than its parent; a pick can be dragged to another row (moved, or swapped with the row's trait) when every trait still
//   satisfies the rule.
// Youga – The Ultimate One: the revived affix "+1 Max Youga Count in the Universe" (patch notes 2026-10-15, "Activate the first
// three traits in sequence to claim my privilege: command a fourth Hero Trait, immediately raised to its maximum level") on an
// equipped memory opens a fourth row (index 3). It can hold a pick only while the three memory rows are filled, it has no
// memory, and its trait is at level 5 (the maximum).
import { allHeroTraitsSs13 } from "./data/heroes/all-hero-traits-ss13.generated.js";
import { normalizeRevivedAffix } from "./data/heroes/memory-revival-ss13.js";
import { revivedAffixCounts } from "./hero-exclusive-revivals.js";

export const TREE_ROW_LEVELS = [45, 60, 75];
export const TREE_ROW_NAMES = ["Memory of Origin", "Memory of Discipline", "Memory of Progress"];
export const EXTRA_PICK_AFFIX = "+1 Max Youga Count in the Universe";
export const EXTRA_PICK_LEVEL = 5;
export const EXTRA_ROW_NAME = "the fourth trait row";
export const SELENA_DANCE_HERO_ID = "selena-dance-of-the-deep";
const EXTRA_PICK_HEROES = new Set(["youga-the-ultimate-one"]);

// Board coordinates (the Trait Path tab, src/app.js): x across 0–400 (x / 4 = % of the board), y in px; the base trait on
// the first row, then one row per tree depth.
const BOARD_ROWS = [46, 105, 175, 235];
const BOARD_LEFT = 45, BOARD_RIGHT = 355;
// Selena's board keeps its earlier hand layout (Silencing Severance on the left; reference data draws Dreambreaker's Gyre there).
const SELENA_LAYOUT = {
  "Dance of the Deep": [200, 46], "Silencing Severance": [45, 105], "Dreambreaker's Gyre": [145, 105], "The Paradise I Curse": [255, 105],
  "Crimson Endless Dance": [355, 105], "Drenched Hem": [45, 175], "Layered Hem": [145, 175], "The Cycle I Resist": [255, 175], "Lonely Ensemble": [145, 235]
};

// Layered layout from the tree: one row per depth; leaves take evenly spaced columns in trait-card order (reference data lists a
// branch's traits together), a parent sits over the middle of its children. Thea's reference data tree is drawn this way already;
// Youga's reference data tree is radial and is laid out the same way here so it fits the board.
function layeredLayout(base, nodes, order) {
  const children = new Map();
  for (const node of nodes) if (node.parent) children.set(node.parent, [...(children.get(node.parent) || []), node.name]);
  for (const list of children.values()) list.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const leaves = [];
  const walk = (name) => { const kids = children.get(name) || []; if (!kids.length && name !== base) leaves.push(name); kids.forEach(walk); };
  walk(base);
  const step = leaves.length > 1 ? (BOARD_RIGHT - BOARD_LEFT) / (leaves.length - 1) : 0;
  const position = new Map();
  const place = (name, depth) => {
    const kids = children.get(name) || [];
    kids.forEach((kid) => place(kid, depth + 1));
    const x = kids.length ? kids.reduce((sum, kid) => sum + position.get(kid)[0], 0) / kids.length : BOARD_LEFT + leaves.indexOf(name) * step;
    position.set(name, [Math.round(x * 10) / 10, BOARD_ROWS[Math.min(depth, BOARD_ROWS.length - 1)]]);
  };
  place(base, 0);
  return position;
}

const trees = new Map();
/**
 * The tree of a hero, or null for a hero who picks one trait per level: { heroId, base, nodes: [{ name, x, y, parent?, base? }],
 * rows: 3, extraPick: { affix, level } | null }. A first-tier node's parent is the base trait.
 */
export function heroTraitTree(heroId) {
  if (trees.has(heroId)) return trees.get(heroId);
  const data = allHeroTraitsSs13[heroId];
  let tree = null;
  if (data?.tree?.nodes?.length) {
    // Node order (board and focus order): Selena keeps her earlier board order; the others follow reference data's trait cards.
    const order = heroId === SELENA_DANCE_HERO_ID ? Object.keys(SELENA_LAYOUT) : data.traits.map((trait) => trait.name);
    const base = data.traits.find((trait) => trait.level === 1)?.name || data.tree.nodes.find((node) => !node.parent)?.name;
    const layout = heroId === SELENA_DANCE_HERO_ID ? new Map(Object.entries(SELENA_LAYOUT)) : layeredLayout(base, data.tree.nodes, order);
    const nodes = [...data.tree.nodes].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name)).map((node) => {
      const [x, y] = layout.get(node.name) || [200, BOARD_ROWS[0]];
      return node.name === base ? { name: node.name, x, y, base: true } : { name: node.name, x, y, parent: node.parent };
    });
    nodes.sort((a, b) => (b.base ? 1 : 0) - (a.base ? 1 : 0));
    tree = { heroId, base, nodes, rows: TREE_ROW_LEVELS.length, extraPick: EXTRA_PICK_HEROES.has(heroId) ? { affix: EXTRA_PICK_AFFIX, level: EXTRA_PICK_LEVEL } : null };
  }
  trees.set(heroId, tree);
  return tree;
}
// Board placement at the board's width in px (2026-10-15). The tree's x runs 0–400 across the board; a node's art is 44 px
// (52 px for the base trait), so two node centres closer than TREE_NODE_SIZE would overlap. The narrowest board is about
// 210 px (the Hero panel's 250 px column, 1101–1500 px windows; the panel is hidden at 1050 px and below), where Youga's
// five-node row would sit 46 px apart. When every row keeps its nodes TREE_NODE_SIZE apart at this width (Selena's and
// Thea's trees at every width, Youga's on wide boards) the layout is the tree's own, scaled to the width. Otherwise each row
// is fitted to the width: nodes keep their left-to-right order and move apart as little as possible, and a row with more
// nodes than fit wraps into staggered lines (node i on line i mod k) TREE_LINE_GAP px apart; the rows below move down.
export const TREE_NODE_SIZE = 48;
export const TREE_MIN_BOARD_WIDTH = 200;
export const TREE_LINE_GAP = 62;
const TREE_EDGE = 26; // a node centre's least distance from the board's side edges (half the art plus a 4 px margin)
const TREE_BOTTOM = 40; // the board below the last row's centre (275 px board, last row at 235)

/** Node centres in px for a board `width` px wide: { nodes: [{ name, x, y, base?, parent? }], height } (height in px). */
export function treeBoardLayout(tree, width) {
  const W = Math.max(Number(width) || 0, TREE_MIN_BOARD_WIDTH);
  const scaled = (tree?.nodes || []).map((node) => ({ ...node, x: Math.round(node.x / 400 * W * 10) / 10 }));
  const rowYs = [...new Set(scaled.map((node) => node.y))].sort((a, b) => a - b);
  const rowNodes = rowYs.map((y) => scaled.filter((node) => node.y === y).sort((a, b) => a.x - b.x));
  const fits = rowNodes.every((row) => row.every((node, index) => !index || node.x - row[index - 1].x >= TREE_NODE_SIZE));
  if (fits) return { nodes: scaled, height: Math.max(...rowYs, 0) + TREE_BOTTOM };
  const left = TREE_EDGE, right = W - TREE_EDGE, perLine = Math.max(1, Math.floor((right - left) / TREE_NODE_SIZE) + 1);
  // Order-keeping fit of wanted x positions into [left, right] with TREE_NODE_SIZE between neighbours (it fits: n ≤ perLine).
  const spread = (wanted) => {
    const xs = [];
    wanted.forEach((x, index) => { xs.push(Math.max(x, left, index ? xs[index - 1] + TREE_NODE_SIZE : -Infinity)); });
    for (let index = xs.length - 1; index >= 0; index -= 1) xs[index] = Math.min(xs[index], right, index < xs.length - 1 ? xs[index + 1] - TREE_NODE_SIZE : Infinity);
    return xs.map((x) => Math.round(x * 10) / 10);
  };
  const placed = new Map();
  let y = rowYs[0] ?? 0;
  rowNodes.forEach((row, rowIndex) => {
    if (rowIndex) y += rowYs[rowIndex] - rowYs[rowIndex - 1];
    const lines = Math.ceil(row.length / perLine);
    for (let line = 0; line < lines; line += 1) {
      const members = row.filter((_, index) => index % lines === line), xs = spread(members.map((node) => node.x));
      members.forEach((node, index) => placed.set(node.name, { ...node, x: xs[index], y: y + line * TREE_LINE_GAP }));
    }
    y += (lines - 1) * TREE_LINE_GAP;
  });
  return { nodes: scaled.map((node) => placed.get(node.name)), height: y + TREE_BOTTOM };
}

export const heroHasTraitTree = (heroId) => Boolean(heroTraitTree(heroId));
export const treeHeroIds = () => Object.keys(allHeroTraitsSs13).filter(heroHasTraitTree);

/** Whether an equipped memory of this hero carries "+1 Max Youga Count in the Universe" (the extra pick's source). */
export function extraPickMemory(hero = {}, heroId = hero?.selectedHeroId) {
  if (!heroTraitTree(heroId)?.extraPick) return null;
  const ids = Object.entries(hero?.equippedMemoryIds || {}).filter(([key, id]) => id && (!key.includes(":") || key.startsWith(`${heroId}:`))).map(([, id]) => id);
  // Only the counted revived memory reads (Q-H11, provisional; src/hero-exclusive-revivals.js).
  return (hero?.memoryInventory || []).find((memory) => ids.includes(memory.id) && normalizeRevivedAffix(memory.revivedAffix || "") === EXTRA_PICK_AFFIX && revivedAffixCounts(hero, memory)) || null;
}
/** Rows the hero can fill now: 3, or 4 for Youga – The Ultimate One with the extra-pick memory equipped. */
export function heroTreeCapacity(hero = {}, heroId = hero?.selectedHeroId) {
  const tree = heroTraitTree(heroId);
  if (!tree) return 0;
  return tree.rows + (extraPickMemory(hero, heroId) ? 1 : 0);
}
/** Rows the tree can ever have (the stored form keeps a fourth pick while its memory is unequipped). */
export const treeMaxCapacity = (tree) => tree ? tree.rows + (tree.extraPick ? 1 : 0) : 0;

/**
 * The placement rules of one tree at a capacity (3 or 4 rows). `values` are row-indexed names.
 */
export function treeRules(tree, capacity = tree?.rows || 3) {
  const ROWS = Math.max(1, capacity), MEMORY_ROWS = tree?.rows || 3;
  const byName = new Map((tree?.nodes || []).filter((node) => !node.base).map((node) => [node.name, node]));
  const parentOf = (name) => { const parent = byName.get(name)?.parent; return parent && parent !== tree.base ? parent : ""; };
  const pad = (rows) => Array.from({ length: ROWS }, (_, index) => rows[index] || "");
  const trim = (rows) => { const out = [...rows]; while (out.length && !out[out.length - 1]) out.pop(); return out; };
  const rowName = (row) => row < MEMORY_ROWS ? TREE_ROW_NAMES[row] : EXTRA_ROW_NAME;

  function rowsError(rows = []) {
    const padded = pad(rows);
    for (let row = 0; row < padded.length; row += 1) {
      const name = padded[row], parent = parentOf(name);
      if (!name) continue;
      if (row >= MEMORY_ROWS && padded.slice(0, MEMORY_ROWS).some((other) => !other)) return `${name} needs the three memory rows filled first`;
      if (!parent) continue;
      const parentRow = padded.indexOf(parent);
      if (parentRow < 0) return `Select ${parent} first`;
      if (parentRow >= row) return `${name} must sit in a later row than ${parent}`;
    }
    return "";
  }

  const assignments = (count, used = []) => count === 0 ? [used] : Array.from({ length: ROWS }, (_, row) => row).filter((row) => !used.includes(row)).flatMap((row) => assignments(count - 1, [...used, row]));

  // Drops unknown names, duplicates and nodes whose parent is not picked (a stored child before its parent is kept once the
  // parent is in), keeps at most `capacity` picks, and only when the stored rows break the placement rule re-seats the
  // picks: the legal layout that moves the fewest picks from their stored row, then the smallest total shift, then the
  // earliest stored pick in the earliest row.
  function normalize(values = []) {
    const entries = [];
    (Array.isArray(values) ? values : []).forEach((name, index) => { if (byName.has(name) && !entries.some((entry) => entry.name === name)) entries.push({ name, index }); });
    const kept = [];
    let changed = true;
    while (changed && kept.length < ROWS) {
      changed = false;
      for (const entry of entries) {
        if (kept.length >= ROWS) break;
        if (kept.includes(entry)) continue;
        const parent = parentOf(entry.name);
        if (parent && !kept.some((other) => other.name === parent)) continue;
        kept.push(entry); changed = true;
      }
    }
    kept.sort((a, b) => a.index - b.index);
    let best = null;
    for (const rows of assignments(kept.length)) {
      const layout = pad([]);
      kept.forEach((entry, index) => { layout[rows[index]] = entry.name; });
      if (rowsError(layout)) continue;
      const score = [kept.filter((entry, index) => rows[index] !== entry.index).length, kept.reduce((sum, entry, index) => sum + Math.abs(rows[index] - Math.min(entry.index, ROWS)), 0), ...rows];
      const differ = best ? score.findIndex((value, index) => value !== best.score[index]) : 0;
      if (!best || (differ >= 0 && score[differ] < best.score[differ])) best = { score, layout };
    }
    return trim(best?.layout || []);
  }

  // Pick or remove a node. Returns { rows, error }: on refusal `rows` is the unchanged (normalized) selection and `error` names
  // the reason. A new pick fills the first empty row that satisfies the placement rule. Removing a trait clears its row and
  // its descendants' rows; the other rows stay put (re-seated only if a fourth-row pick lost its three memory rows).
  function toggle(values, name) {
    const rows = normalize(values), node = byName.get(name);
    if (!node) return { rows, error: "" };
    const padded = pad(rows);
    if (padded.includes(name)) {
      const removed = new Set([name]);
      let grew = true;
      while (grew) { grew = false; for (const entry of byName.values()) { if (removed.has(entry.parent) && !removed.has(entry.name)) { removed.add(entry.name); grew = true; } } }
      const left = trim(padded.map((value) => removed.has(value) ? "" : value));
      return { rows: rowsError(left) ? normalize(left) : left, error: "" };
    }
    const parent = parentOf(name);
    if (parent && !padded.includes(parent)) return { rows, error: `Select ${parent} first` };
    if (!padded.includes("")) return { rows, error: `Remove a trait first: the path holds ${ROWS} traits` };
    const row = padded.findIndex((value, index) => !value && !rowsError(padded.map((other, at) => at === index ? name : other)));
    if (row < 0) return { rows, error: parent ? `${name} needs an empty row below ${parent} (${rowName(padded.indexOf(parent))})` : `${name} has no free row` };
    padded[row] = name;
    return { rows: trim(padded), error: "" };
  }

  // Move the trait in row `from` to row `to`: a drop on an occupied row swaps the two, on an empty row moves it. Returns
  // { rows, error }; a move after which any trait would break the placement rule is refused.
  function move(values, from, to) {
    const rows = normalize(values), padded = pad(rows), name = padded[from];
    if (!name || !(to >= 0 && to < ROWS) || from === to) return { rows, error: "" };
    const other = padded[to];
    padded[to] = name; padded[from] = other;
    const error = rowsError(padded);
    return error ? { rows, error } : { rows: trim(padded), error: "" };
  }

  return { capacity: ROWS, rowsError, normalize, toggle, move, rowName, picks: (values = []) => normalize(values).filter(Boolean) };
}

/**
 * The stored rows of a tree hero (read-time migration). Selena's earlier `hero.selenaDanceTraits` (the same row-indexed
 * form) when the state carries it: src/planner-state.js drops that field when it normalizes a state, so a state that still
 * has it was written by an earlier writer after its last normalization and the field is the newer value. Else
 * `hero.treeTraits[heroId]`; else the hero's earlier one-per-level picks ("<heroId>:level45 / 60 / 75" in `selectedTraits`;
 * Thea – Wisdom of The Gods before the SS14 tree) in row order, which the rules then normalize (picks of traits the tree no
 * longer has drop).
 */
export function storedTreeRows(hero = {}, heroId = hero?.selectedHeroId) {
  if (heroId === SELENA_DANCE_HERO_ID && Array.isArray(hero?.selenaDanceTraits)) return hero.selenaDanceTraits;
  if (Array.isArray(hero?.treeTraits?.[heroId])) return hero.treeTraits[heroId];
  return TREE_ROW_LEVELS.map((level) => hero?.selectedTraits?.[`${heroId}:level${level}`] || "");
}

/** The hero's picks, row-indexed and normalized at the rows it can fill now ([] for a hero without a tree). */
export function heroTreeSelections(hero = {}, heroId = hero?.selectedHeroId) {
  const tree = heroTraitTree(heroId);
  return tree ? treeRules(tree, heroTreeCapacity(hero, heroId)).normalize(storedTreeRows(hero, heroId)) : [];
}
/** The placement rules for the hero's tree at the rows it can fill now (null without a tree). */
export function heroTreeRules(hero = {}, heroId = hero?.selectedHeroId) {
  const tree = heroTraitTree(heroId);
  return tree ? treeRules(tree, heroTreeCapacity(hero, heroId)) : null;
}

/** The memory slot keys a tree row reads (first match wins), or null for the extra row. */
export function treeRowSlotKeys(heroId, row) {
  const level = TREE_ROW_LEVELS[row];
  return level ? [`${heroId}:level${level}`, `level${level}`] : null;
}
/** The level key the trait tooltip reads for a tree row ("<heroId>:level45" …, "<heroId>:extra" for the fourth row). */
export const treeRowLevelKey = (heroId, row) => TREE_ROW_LEVELS[row] ? `${heroId}:level${TREE_ROW_LEVELS[row]}` : `${heroId}:extra`;

/**
 * The stored `hero.treeTraits` map after migration: one normalized row array per tree hero (at the tree's largest
 * capacity, so a fourth pick survives while its memory is unequipped). The current hero reads storedTreeRows; another
 * tree hero takes its stored `treeTraits[heroId]` (as is, even when empty), else the first non-empty of its saved loadout's
 * earlier fields and the top-level earlier fields (Selena's `selenaDanceTraits`, a revamped hero's `<heroId>:levelNN`).
 */
export function migrateTreeTraits(hero = {}) {
  const result = {};
  for (const heroId of treeHeroIds()) {
    const rules = treeRules(heroTraitTree(heroId), treeMaxCapacity(heroTraitTree(heroId)));
    if (hero?.selectedHeroId === heroId) { result[heroId] = rules.normalize(storedTreeRows(hero, heroId)); continue; }
    if (Array.isArray(hero?.treeTraits?.[heroId])) { result[heroId] = rules.normalize(hero.treeTraits[heroId]); continue; }
    const sources = [hero?.heroLoadouts?.[heroId], hero].filter(Boolean);
    result[heroId] = sources.map((source) => rules.normalize(storedTreeRows({ selenaDanceTraits: source.selenaDanceTraits, selectedTraits: source.selectedTraits }, heroId))).find((rows) => rows.length) || [];
  }
  return result;
}
