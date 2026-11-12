// Nether King's Divinity growth (SS14): which board cells a Nether King's Divinity occupies as its Offspring grow.
//
// Our own mapping, derived 2026-11-11 from the client's data tables (read-only, the private copy of the 2026-11-03 decrypted
// scripts; no table text is copied here): config_devil_block_attribute_s15 (each type's ShapeGroup and AllowPosition),
// config_devil_block_shape_s15 (the cells per ShapeGroup x Source position x GrowCount: `Shape` the grown cells, `Shape0` the
// ungrown preview cells) and config_talent_block_board (board position id -> [column, row], the planner's own board coordinates).
// - Every shape nests: the GrowCount k shape is the GrowCount k - 1 shape plus one cell (Key 2, then Key 3), and Shape + Shape0 is the
//   same at every GrowCount, so a Source position fixes one growth order. GrowCount runs 0 to 2 for Judgment (group 4),
//   Contamination (group 5) and Banishment (group 6); the retired Broken shapes (groups 1 to 3) stop at 1.
// - The client occupies the board with the grown cells only (TalentBlockMgr:GetDevilBlockShapeCells always adds the Source;
//   TalentBlockDevilItem:GetShapeGridPosList and the board's used-cell count read GrownCells), so ungrown cells block nothing.
// - GrowCount is the server's per-item growCount. User-stated 2026-11-11 (in game): "all of the pieces don't get added until you add in
//   the brand talent nodes. When you add one talent node filled in then the first square of the slate is present, then the second, then
//   the third"; game text 15000102: "Branding the Nether King's Divinity causes it to Proliferate Offsprings outward". The planner draws
//   one cell per filled Brand talent node in growth order, at least the Source: GrowCount = Brands - 1, 0 to maxGrowCount (each of the
//   three Brand slots sits on one cell, the log's talentSlotList effectDevilBlockIdx 1-3; src/slate-board.js slateGrownIndexes).
//
// `sources`: for each allowed Source cell ("column,row"), the fully grown cells in growth order (Source, Key 2, Key 3).
// `drawing`: the planner's drawn shape (src/app.js / src/slate-judgment.js legendarySlateShapes) and the index of each drawn cell in
// growth order (Source first). Contamination is drawn with all three cells since 2026-11-12 (user request): the Source, the cell below
// it, then the cell above it (drawing [[0,1],[0,2],[0,0]], frame row 0 the top cell). Before, it was two cells (Source and below,
// placed by the Source); src/planner-state.js migrates saved placements (slate geometryVersion 4 -> 5) so each keeps its grown cells.
export const NETHER_KING_GROWTH = {
  "Nether King's Divinity: Judgment": {
    group: 4, growDes: "Clockwise", maxGrowCount: 2,
    drawing: { shape: [[0,0],[3,0],[3,3]], order: [0, 1, 2] },
    sources: {
      "2,2": [[2,2],[5,2],[5,5]], "5,2": [[5,2],[5,5],[2,5]], "2,5": [[2,5],[2,2],[5,2]], "5,5": [[5,5],[2,5],[2,2]]
    }
  },
  "Nether King's Divinity: Contamination": {
    group: 5, growDes: "Both Ends", maxGrowCount: 2,
    drawing: { shape: [[0,1],[0,2],[0,0]], order: [0, 1, 2] },
    sources: {
      "3,2": [[3,2],[3,3],[3,1]], "4,2": [[4,2],[4,3],[4,1]], "2,3": [[2,3],[2,4],[2,2]], "3,3": [[3,3],[3,4],[3,2]],
      "4,3": [[4,3],[4,4],[4,2]], "5,3": [[5,3],[5,4],[5,2]], "2,4": [[2,4],[2,5],[2,3]], "3,4": [[3,4],[3,5],[3,3]],
      "4,4": [[4,4],[4,5],[4,3]], "5,4": [[5,4],[5,5],[5,3]], "3,5": [[3,5],[3,6],[3,4]], "4,5": [[4,5],[4,6],[4,4]]
    }
  },
  // The planner's "Offspring" slate is the game's Banishment (src/slate-shape-ids.js GAME_SLATE_NAME_ALIASES).
  "Nether King's Divinity: Offspring": {
    group: 6, growDes: "Diagonal", maxGrowCount: 2,
    drawing: { shape: [[2,0],[1,1],[0,2]], order: [0, 1, 2] },
    sources: {
      "3,1": [[3,1],[2,2],[1,3]], "6,3": [[6,3],[5,2],[4,1]], "1,4": [[1,4],[2,5],[3,6]], "4,6": [[4,6],[5,5],[6,4]]
    }
  }
};
