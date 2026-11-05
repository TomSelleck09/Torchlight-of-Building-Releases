// Thea – Wisdom of The Gods, Prophecy of Revelation (60 slot): "Replaces some Talents on the No. 4 activated Talent Panel (only supports
// panels belonging to the God of Might, Goddess of Knowledge, or Goddess of Hunting)". The replaced talents and their replacements come
// from the client's talent-group table (encrypted-scripts full pass 2026-11-03 finding 3: 12 class trees, 48 talents, each replaced by
// its record ending 01), written in the catalogue's form from the readable config_talent rows
// (src/data/talents/prophecy-of-revelation-ss14.generated.js, scripts/build-prophecy-of-revelation.mjs). The 4th activated panel is the
// 4th selected tree (state.talents.selectedTrees[3]); the replacement keeps the node's coordinate and its allocated points (all 48 are
// one-point Legendary Medium talents on both sides) and reads its own record (`talentGameId` for src/recipe-interpreter.js lineGameIds).
import { PROPHECY_OF_REVELATION_SS14 } from "./data/talents/prophecy-of-revelation-ss14.generated.js";

export const PROPHECY_OF_REVELATION_PANEL_INDEX = 3;
export const PROPHECY_OF_REVELATION_TEXT = /^Replaces some Talents on the No\. 4 activated Talent Panel/i;

const byTree = new Map();
for (const row of PROPHECY_OF_REVELATION_SS14) {
  if (!byTree.has(row.tree)) byTree.set(row.tree, new Map());
  byTree.get(row.tree).set(row.coordinate.join(","), row);
}

/** The replacements on one class tree, by "column,row" (empty for a tree the trait does not support). */
export function prophecyReplacementsFor(tree) {
  return byTree.get(tree) || new Map();
}

/** Whether the build's hero trait lines carry Prophecy of Revelation's talent replacement (the trait picked with its slot memory). */
export function prophecyOfRevelationInLines(lines = []) {
  return lines.some((line) => String(line?.text ?? line ?? "").split(/\n/).some((part) => PROPHECY_OF_REVELATION_TEXT.test(part.trim())));
}

/** A panel's catalogue nodes with the replacements applied (the panel at index 3 of the selected trees only). */
export function withProphecyReplacements(nodes = [], tree, panelIndex, active) {
  if (!active || panelIndex !== PROPHECY_OF_REVELATION_PANEL_INDEX) return nodes;
  const replacements = prophecyReplacementsFor(tree);
  if (!replacements.size) return nodes;
  return nodes.map((node) => {
    const row = replacements.get(node.coordinate.join(","));
    return row ? { ...node, description: row.description, maxRank: row.maxRank, talentGameId: row.id, prophecyOfRevelation: { originalId: row.originalId, originalDescription: node.description } } : node;
  });
}
