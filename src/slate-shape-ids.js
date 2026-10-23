// Divinity Slate geometry for "Import from game" (research/slate-shape-import-2026-10-19.md, "Second board").
//
// The login dump logs each equipped slate's anchor cell (Index = column x 10 + row), its Direction (quarter turns,
// clockwise on screen) and, for Divinity Slates, a ShapeId. The anchor is the shape's pivot: the cell the game turns the
// slate about. Three logged boards (2026-10-12 fixture, 2026-10-19 19:49 and 21:29 logins) each admit exactly one legal
// tiling when every slate may take any pivot; the pivots below are the ones those tilings use.
//
// Direction:
// - A missing Direction is 0. The dump prints Direction 1, 2 and 3 but never 0: the omitted value is the zero one.
// - Each table below holds a shape at Direction 2, so game Direction d turns it by ((d + 2) mod 4) x 90 degrees clockwise.
//   For crafted slates that orientation is the item icon (UI_TalantNG_<code>_0_Icon, Direction 0) turned half way round;
//   for legendary slates it is the planner's drawing (the in-game preview), as calibrated on 2026-10-12.
// - Nether King's Divinity slates log no Direction (and no ShapeId); Judgment sits in the planner's drawing. A logged
//   Direction on one of them is read as d quarter turns of that drawing (provisional; never seen).
//
// Crafted slates (ShapeId 10X1): X is the shape's place in the order Z1, Z2, L1, L2, O1, T1. The game's item_base table
// lists each god's six crafted bases 2600G1..2600G6 with the icons Z1, Z2, L1, L2, O1, T1 in that order, and the logged
// ShapeIds 1011 / 1021 / 1031 / 1041 / 1061 are confirmed on boards. The ShapeId names the slate's current shape; it can
// differ from the base's icon. The game never mirrors a slate, so Z2 / L2 are the mirror images of Z1 / L1, pivot included.
// plannerIndex is the planner's crafted shape key <god>-<index> (Z, L, O, T); the planner places Z2 / L2 flipped.
//
// A shape with no confirmed pivot (anchor null) gets every cell as a candidate pivot; the board solver below keeps a
// candidate only when it is the single position that fits beside the other slates, and parks the slate otherwise.
import { SLATE_BOARD_CELLS, isOverlaySlate, slateOffsets, slateTransformRules } from "./slate-board.js";

export const CRAFTED_SLATE_SHAPES = {
  1011: { code: "Z1", plannerIndex: 0, cells: [[0,0],[0,1],[1,1],[1,2]], anchor: [0,1] },
  1021: { code: "Z2", plannerIndex: 0, cells: [[1,0],[0,1],[1,1],[0,2]], anchor: [1,1] },
  1031: { code: "L1", plannerIndex: 1, cells: [[0,0],[1,0],[2,0],[2,1]], anchor: [2,0] },
  1041: { code: "L2", plannerIndex: 1, cells: [[0,0],[1,0],[2,0],[0,1]], anchor: [0,0] },
  // O1: the id follows the game's base order (not yet seen on a board); its pivot is unknown.
  1051: { code: "O1", plannerIndex: 2, cells: [[0,0],[1,0],[0,1],[1,1]], anchor: null, provisionalId: true },
  1061: { code: "T1", plannerIndex: 3, cells: [[1,0],[0,1],[1,1],[2,1]], anchor: [1,1] }
};

/**
 * Legendary and Nether King slates by planner name. shapeIds: the ShapeIds logged for the slate so far. anchor: the pivot in
 * the planner's drawing (null: not calibrated). parkReason: never placed by the importer (geometry unconfirmed).
 */
export const LEGENDARY_SLATE_GEOMETRY = {
  "Sparks of Moth Fire": { shapeIds: [2010], anchor: [0,0] },
  "When Sparks Set the Prairie Ablaze": { shapeIds: [2012], anchor: [0,0] },
  "Fallen Starlight": { shapeIds: [2020], anchor: [0,0] },
  "A Corner of Divinity": { shapeIds: [2030], anchor: [1,0] },
  "Pedigree of Gods": { shapeIds: [2090], anchor: [1,1] },
  // Never logged yet: the pivot is unknown; neither turns in the planner. Footprints match the in-game previews
  // (reference/slates, 2026-09-20); Residence of Stars' is the same at every quarter turn (turnKeepsFootprint).
  "Space Rift": { shapeIds: [], anchor: null },
  "Residence of Stars": { shapeIds: [], anchor: null },
  // Game text (config_multi_language, SS13 and SS14): a Nether King's Divinity is placed by its Source, "the grid where the
  // Anchor is located", and "automatically changes shape according to the location of the Source"; each Offspring (the
  // Source counts as one) is one cell holding one Brand Talent. Judgment's pivot is calibrated; the others are not.
  "Nether King's Divinity: Judgment": { nether: true, anchor: [0,0] },
  "Nether King's Divinity: Contamination": { nether: true, anchor: null },
  "Nether King's Divinity: Offspring": { nether: true, anchor: null, parkReason: "the planner's Offspring pattern is read as the game's Banishment, and whether its cells sit under other slates (as Judgment's do) is unconfirmed" }
};

/**
 * Game slate names the planner knows under another name. "Offspring" is the game's word for a Nether King's Divinity's cells,
 * not a slate type; the game's three types are Judgment, Contamination and Banishment (item_base 394004-394006), so the
 * planner's third Nether King slate, "Offspring" (the diagonal pattern of reference/slates/Nether King Offspring.png), is read
 * as Banishment (provisional: the preview shows no name, and the shape changes with the Source's location).
 */
export const GAME_SLATE_NAME_ALIASES = { "Nether King's Divinity: Banishment": "Nether King's Divinity: Offspring" };

/** Game slates the planner cannot draw, with the reason (listed as not imported). */
export const UNDRAWN_GAME_SLATES = {
  "Nether King's Broken Divinity: Judgment": "Broken Divinity slates (no longer dropped since SS14) have their own pattern, which the planner does not draw",
  "Nether King's Broken Divinity: Contamination": "Broken Divinity slates (no longer dropped since SS14) have their own pattern, which the planner does not draw",
  "Nether King's Broken Divinity: Banishment": "Broken Divinity slates (no longer dropped since SS14) have their own pattern, which the planner does not draw"
};

/** The Direction a slate takes when the dump leaves it out. */
export const DEFAULT_GAME_DIRECTION = 0;

const directionValue = (direction) => (direction == null || direction === "" ? DEFAULT_GAME_DIRECTION : Number(direction));

/** The crafted shape for a logged ShapeId, or null when the id is not in the table. */
export const craftedSlateShapeForId = (shapeId) => CRAFTED_SLATE_SHAPES[Number(shapeId)] || null;

/** Clockwise turn (degrees) from the Direction-2 orientation for a logged Direction (missing: 0); null if not a quarter turn. */
export const gameDirectionTurn = (direction) => {
  const value = directionValue(direction);
  return Number.isInteger(value) ? ((((value + 2) % 4) + 4) % 4) * 90 : null;
};

/** Clockwise turn (degrees) of a Nether King slate's planner drawing for a logged Direction (missing: none). */
export const netherDirectionTurn = (direction) => {
  const value = directionValue(direction);
  return Number.isInteger(value) ? (((value % 4) + 4) % 4) * 90 : null;
};

/** God names of the crafted slate bases ("Goddess of Deception's Divinity", "God of Machines' Divinity"). */
export const craftedSlateGod = (baseName) => String(baseName || "").replace(/'s? Divinity$/, "") || null;

/** The planner's god key for a god name (the keys of the crafted shape catalog). */
export const plannerGodKey = (god) => ({ "Goddess of Deception": "deception", "Goddess of Hunting": "hunting", "Goddess of Knowledge": "knowledge", "God of Machines": "machines", "God of Might": "might", "God of War": "war" }[god] || null);

const cellKey = ([column, row]) => `${column},${row}`;
const setKey = (cells) => cells.map(cellKey).sort().join(" ");
const indexOfCell = (shape, cell) => shape.findIndex(([column, row]) => column === cell[0] && row === cell[1]);

/**
 * True when turning `shape` clockwise by `turn` degrees leaves its footprint unchanged (the same cells up to a shift): Space
 * Rift's column at half turns; Residence of Stars at every quarter turn (its eight-cell pinwheel, as in the in-game preview
 * reference/slates/residence of stars.png, is the same at all four). A slate the planner never turns can take such a turn.
 */
export const turnKeepsFootprint = (shape, turn) => setKey(slateOffsets({ shape }, turn)) === setKey(slateOffsets({ shape }, 0));

/**
 * Board cells of `shape` turned clockwise by `turn` degrees with shape cell `pivot` on the logged cell `index`
 * (column x 10 + row). One candidate per pivot (every cell when the pivot is unknown); off-board candidates are dropped.
 */
export function slatePlacementCandidates(shape, turn, pivot, index) {
  const offsets = slateOffsets({ shape }, turn, 1, 1);
  const column = Math.floor(Number(index) / 10), row = Number(index) % 10;
  const pivots = pivot ? [indexOfCell(shape, pivot)] : shape.map((_, cell) => cell);
  const seen = new Set();
  return pivots.flatMap((cell) => {
    const anchor = offsets[cell];
    const cells = offsets.map(([dc, dr]) => [column - anchor[0] + dc, row - anchor[1] + dr]);
    const key = setKey(cells);
    if (seen.has(key) || !cells.every((entry) => SLATE_BOARD_CELLS.has(cellKey(entry)))) return [];
    seen.add(key);
    return [{ cells, pivotKnown: Boolean(pivot) }];
  });
}

const FLIPS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
/**
 * The planner placement (column, row, rotation, flipX, flipY) whose cells are `cells`, within the slate's planner transform
 * rules (src/slate-board.js slateTransformRules), or null. `preferredRotation` is tried first, then unflipped and least
 * turned first.
 */
export function plannerPlacementForCells(slate, plannerShape, cells, preferredRotation = null) {
  const rules = slateTransformRules(slate);
  const column = Math.min(...cells.map(([value]) => value)), row = Math.min(...cells.map(([, value]) => value));
  const target = setKey(cells.map(([c, r]) => [c - column, r - row]));
  const rotations = rules.rotate ? [...new Set([preferredRotation ?? 0, 0, 90, 180, 270])] : [0];
  for (const [flipX, flipY] of rules.flip ? FLIPS : [[1, 1]]) {
    for (const rotation of rotations) if (setKey(slateOffsets({ shape: plannerShape }, rotation, flipX, flipY)) === target) return { column, row, rotation, flipX, flipY, mirrored: flipX * flipY === -1 };
  }
  return null;
}

/**
 * Picks one board position per slate. `slates`: [{ overlay, candidates: [{ cells, cost, ... }] }]; cost 0 for a calibrated
 * reading, 1 for an uncalibrated one. A slate may also stay off the board (cost 1000), so the solver first places as many
 * slates as possible, then prefers calibrated readings. Returns per slate { status: "placed", candidate } when every best
 * assignment puts it on the same cells, { status: "ambiguous", options } when best assignments disagree, and
 * { status: "unplaced" } when none places it. Null when the search is too large (the caller falls back to calibrated
 * readings in log order).
 */
export function solveSlateBoard(slates, { maxSolutions = 64, maxNodes = 200000 } = {}) {
  const UNPLACED = 1000;
  const order = slates.map((_, index) => index).sort((a, b) => slates[a].candidates.length - slates[b].candidates.length);
  const pick = slates.map(() => null), occupied = new Set();
  let best = Infinity, solutions = [], nodes = 0, aborted = false;
  const visit = (depth, cost) => {
    if (aborted || cost > best) return;
    if (++nodes > maxNodes) { aborted = true; return; }
    if (depth === order.length) {
      if (cost < best) { best = cost; solutions = []; }
      if (solutions.length < maxSolutions) solutions.push([...pick]);
      return;
    }
    const index = order[depth], slate = slates[index], overlay = Boolean(slate.overlay);
    for (const candidate of [...slate.candidates].sort((a, b) => a.cost - b.cost)) {
      if (cost + candidate.cost > best) continue;
      const keys = candidate.cells.map(cellKey);
      if (!overlay && keys.some((key) => occupied.has(key))) continue;
      if (!overlay) keys.forEach((key) => occupied.add(key));
      pick[index] = candidate;
      visit(depth + 1, cost + candidate.cost);
      pick[index] = null;
      if (!overlay) keys.forEach((key) => occupied.delete(key));
    }
    visit(depth + 1, cost + UNPLACED);
  };
  visit(0, 0);
  if (aborted) return null;
  return slates.map((_, index) => {
    const picks = solutions.map((solution) => solution[index]);
    if (picks.every((entry) => entry === null)) return { status: "unplaced" };
    const keys = new Set(picks.map((entry) => (entry ? setKey(entry.cells) : "")));
    return keys.size === 1 ? { status: "placed", candidate: picks[0] } : { status: "ambiguous", options: [...keys].filter(Boolean).length };
  });
}

export { isOverlaySlate };
