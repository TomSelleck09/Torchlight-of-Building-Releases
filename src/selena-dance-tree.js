// Selena – Dance of the Deep's trait path. Since 2026-10-15 every trait tree (Selena, Thea – Wisdom of The Gods, Youga – The
// Ultimate One) runs on src/hero-trait-tree.js; these exports keep Selena's earlier names. Her picks now live in
// `hero.treeTraits["selena-dance-of-the-deep"]` (row-indexed, the same form `hero.selenaDanceTraits` had; that field is
// migrated on read: src/hero-trait-tree.js storedTreeRows / migrateTreeTraits).
import { heroTraitTree, treeRules, TREE_ROW_LEVELS, TREE_ROW_NAMES, SELENA_DANCE_HERO_ID } from "./hero-trait-tree.js";

const tree = heroTraitTree(SELENA_DANCE_HERO_ID);
const rules = treeRules(tree, tree.rows);

export const selenaDanceTreeSs13 = { maxSelections: rules.capacity, nodes: tree.nodes };

/** The hero-trait memory rows (45 / 60 / 75): row-indexed picks sit in row SELENA_DANCE_ROW_LEVELS[i]. */
export const SELENA_DANCE_ROW_LEVELS = TREE_ROW_LEVELS;
export const SELENA_DANCE_ROW_NAMES = TREE_ROW_NAMES;

/**
 * Placement rule (user-corrected, 2026-10-13): a trait with a prerequisite node (a parent other than the base) must sit in
 * a later row than its prerequisite; rows run Origin (Lv.45) < Discipline (Lv.60) < Progress (Lv.75). So a child never
 * sits in Origin, and Gyre (Origin) → Layered Hem (Discipline) → Lonely Ensemble (Progress) is a valid path.
 * Returns "" when every picked row satisfies the rule, else the reason.
 */
export const selenaDanceRowsError = (rows = []) => rules.rowsError(rows);

/** The picked trait names in row order, empty rows skipped. */
export const selenaDancePicks = (values = []) => rules.picks(values);

/**
 * Row-indexed (user, 2026-10-13): index 0 / 1 / 2 = the Lv.45 / 60 / 75 memory row, "" for an empty row, trailing empty rows
 * trimmed. Older saves stored plain pick order (a parent always before its child), which is the same array and already
 * satisfies the placement rule. Normalizing drops unknown names, duplicates and nodes whose parent is not picked, keeps at
 * most 3 picks, and only when the stored rows break the placement rule re-seats the picks (src/hero-trait-tree.js).
 */
export const normalizeSelenaDanceSelections = (values = []) => rules.normalize(values);

/** Pick or remove a node: { rows, error } (src/hero-trait-tree.js treeRules().toggle). */
export const toggleSelenaDanceSelection = (values, name) => rules.toggle(values, name);
export const toggleSelenaDanceNode = (values, name) => rules.toggle(values, name).rows;

/** Move the trait in row `from` to row `to` (swap when occupied): { rows, error }. */
export const moveSelenaDanceTrait = (values, from, to) => rules.move(values, from, to);
