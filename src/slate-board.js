import { NETHER_KING_GROWTH } from "./data/slates/nether-king-growth-ss14.js";

export const SLATE_BOARD_ROWS = [
  [3, 4], [2, 3, 4, 5], [1, 2, 3, 4, 5, 6],
  [1, 2, 3, 4, 5, 6], [2, 3, 4, 5], [3, 4]
];
const key = (column, row) => `${column},${row}`;
export const SLATE_BOARD_CELLS = new Set(SLATE_BOARD_ROWS.flatMap((columns, row) => columns.map((column) => key(column, row + 1))));
export function slateTransformRules(slate) {
  const name=typeof slate==="string"?slate:slate?.template||slate?.name;
  if(name==="Space Rift"||name==="Residence of Stars")return {rotate:false,flip:false};
  if(name==="Pedigree of Gods")return {rotate:false,flip:true};
  return {rotate:true,flip:true};
}
// How a slate's art is drawn for its pose (user request 2026-11-11). The shape always turns and flips as placed. Pedigree of Gods'
// art is a portrait: it never turns upside down, so its vertical flip is dropped and its horizontal mirror is flipX × flipY
// (its capture's transparent corners then still sit off the cells: Pedigree has no rotation). Every other slate's art follows the pose.
export function slateArtTransform(slate, rotation = 0, flipX = 1, flipY = 1) {
  const name=typeof slate==="string"?slate:slate?.template||slate?.name;
  const fx=Number(flipX)===-1?-1:1,fy=Number(flipY)===-1?-1:1;
  if(name==="Pedigree of Gods")return {rotation:0,flipX:fx*fy,flipY:1};
  return {rotation:Number(rotation)||0,flipX:fx,flipY:fy};
}
// Nether King's Divinity: Judgment marks three cells that other slates sit on (its own cells do not block them): the
// 2026-10-19 board holds 22 cells of other slates plus Judgment's three on a 24-cell board, and its only legal tiling puts
// a crafted slate on a Judgment cell. The default build's captured Judgment carries overlay: true for the same reason.
export const OVERLAY_SLATE_TEMPLATES = ["Nether King's Divinity: Judgment"];
export const isOverlaySlate = (slate) => Boolean(slate?.overlay) || OVERLAY_SLATE_TEMPLATES.includes(slate?.template || slate?.name);
export function slateOffsets(slate, rotation = 0, flipX = 1, flipY = 1) {
  let cells=(slate.shape || Array.from({length:slate.size?.[1]||1},(_,row)=>Array.from({length:slate.size?.[0]||1},(_,column)=>[column,row])).flat()).map(([column,row])=>[column,row]);
  const turns=(((rotation%360)+360)%360)/90;
  for(let turn=0;turn<turns;turn+=1) cells=cells.map(([column,row])=>[-row,column]);
  cells=cells.map(([column,row])=>[column*flipX,row*flipY]);
  const minColumn=Math.min(...cells.map(([column])=>column));
  const minRow=Math.min(...cells.map(([,row])=>row));
  return cells.map(([column,row])=>[column-minColumn,row-minRow]);
}
export function slateSize(slate, rotation = 0, flipX = 1, flipY = 1) { const cells=slateOffsets(slate,rotation,flipX,flipY); return [Math.max(...cells.map(([column])=>column))+1,Math.max(...cells.map(([,row])=>row))+1]; }

// ---- Nether King's Divinity growth (user-stated 2026-11-11; src/data/slates/nether-king-growth-ss14.js) -------------------------------
// User, in game: "When you add one talent node filled in then the first square of the slate is present, then the second, then the
// third." So the slate's cells are the first N cells of the game's growth order (config_devil_block_shape_s15), N = its filled Brand talent
// nodes, at least the Source (the client always grows it): 0 or 1 Brand the Source, 2 the Source and the first Offspring, 3 all three.
// GrowCount = N - 1, 0 to 2 (the table's range; the three Brand slots each sit on one cell, the log's effectDevilBlockIdx 1-3). The
// crafter has said the same since the start ("0–1 → 1 block, 2 → 2, 3 → Authority"). The cells not grown yet are not on the board
// (the client occupies and draws GrownCells only). Its placement keeps the whole drawing's frame, so the full drawing must fit the board
// (the game's Source positions always hold the fully grown shape) while only the grown cells block, touch or count.
/** The filled Brand talent nodes of a slate (`filledBrands` when a reader cleared its Brands, e.g. a slate past its Max Active count). */
export function netherKingFilledBrands(slate) {
  if (Number.isFinite(slate?.filledBrands)) return slate.filledBrands;
  const brands = slate?.affixGroups?.brand ? slate.affixGroups.brand : slate?.brands || [];
  return brands.filter(Boolean).length;
}
const sameDrawing = (shape, drawing) => Array.isArray(shape) && shape.length === drawing.length && shape.every(([column, row], index) => column === drawing[index][0] && row === drawing[index][1]);
/** A Nether King's Divinity drawn in the planner's growth drawing: its growth record, else null (every other slate never grows). */
export function netherKingGrowthFor(slate) {
  const growth = NETHER_KING_GROWTH[slate?.template || slate?.name];
  return growth && sameDrawing(slate.shape, growth.drawing.shape) ? growth : null;
}
/** The slate's GrowCount: its filled Brand talent nodes less the Source's, 0 to the type's maximum (null for a slate that does not grow). */
export function netherKingGrowCount(slate) {
  const growth = netherKingGrowthFor(slate);
  return growth ? Math.max(0, Math.min(growth.maxGrowCount, netherKingFilledBrands(slate) - 1)) : null;
}
/**
 * The growth rank of each drawn cell (0 the Source, then each Offspring in growth order). On the board, a drawing whose cells are the
 * game's shape at one of its Source positions takes that position's order (the game fixes the shape by where the Source sits, so a
 * turned or flipped drawing on those cells still grows from that Source); elsewhere (a position the game does not allow, or parked) the
 * drawing's own order under its turn and flips.
 */
function growthRanks(slate, growth, placement) {
  if (Number.isFinite(placement?.column) && Number.isFinite(placement?.row)) {
    const cells = slateOffsets(slate, placement.rotation || 0, placement.flipX || 1, placement.flipY || 1).map(([column, row]) => [placement.column + column, placement.row + row]);
    for (const order of Object.values(growth.sources)) {
      const game = order.slice(0, cells.length);
      const ranks = cells.map(([column, row]) => game.findIndex(([c, r]) => c === column && r === row));
      if (ranks.every((rank) => rank >= 0) && new Set(ranks).size === ranks.length) return ranks;
    }
  }
  return growth.drawing.order;
}
/** Indexes (into the slate's drawn shape) of the cells grown so far, in drawing order; null for a slate that does not grow. */
export function slateGrownIndexes(slate, placement = null) {
  const growth = netherKingGrowthFor(slate);
  if (!growth) return null;
  const growCount = netherKingGrowCount(slate);
  return growthRanks(slate, growth, placement).flatMap((rank, index) => (rank <= growCount ? [index] : []));
}
/**
 * The crafter's preview (user request 2026-11-12): a Nether King's Divinity drawn in its own unturned frame with `filledBrands` Brand
 * talent nodes filled, so the card grows as the editor's Brands are filled or cleared. `shape` the drawing, `size` its frame [width,
 * height], `grown` the grown cells' drawing indexes (the drawing's own order, as for a parked slate). Null for any other slate.
 */
export function netherKingPreviewGrowth(name, filledBrands) {
  const growth = NETHER_KING_GROWTH[name];
  if (!growth) return null;
  const count = Math.max(0, Math.min(3, Number(filledBrands) || 0));
  const slate = { name, shape: growth.drawing.shape, filledBrands: count };
  return { shape: growth.drawing.shape, size: slateSize(slate, 0), grown: slateGrownIndexes(slate) };
}
/**
 * Saved Contamination placements (slate geometryVersion 4) were made for the two-cell drawing (Source and the cell below, the frame's
 * top-left the Source when unturned). The three-cell drawing (2026-11-12) adds the cell above the Source, so the frame moves. Each saved
 * placement is moved so the same board cells grow in the same order: its Source and first Offspring stay where they were (the pose kept
 * when it can be; the drawing's whole frame on the board). A placement no pose can keep (its above cell would leave the board: a Source
 * the game does not allow) keeps its Source where one fits, else it is dropped (the slate stays equipped, off the board). Returns a new
 * placements object; other slates are untouched.
 */
const OLD_CONTAMINATION_SHAPE = [[0,0],[0,1]];
const CONTAMINATION = "Nether King's Divinity: Contamination";
const POSES = [0, 90, 180, 270].flatMap((rotation) => [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([flipX, flipY]) => ({ rotation, flipX, flipY })));
function rankedCells(slate, growth, placement) {
  const offsets = slateOffsets(slate, placement.rotation || 0, placement.flipX || 1, placement.flipY || 1);
  const cells = offsets.map(([column, row]) => [placement.column + column, placement.row + row]);
  const ranks = growthRanks(slate, growth, placement);
  return cells.map((cell, index) => ({ cell: key(cell[0], cell[1]), rank: ranks[index] })).sort((a, b) => a.rank - b.rank).map((entry) => entry.cell);
}
export function migrateContaminationPlacements(placements, slates) {
  if (!placements || typeof placements !== "object") return placements;
  const growth = NETHER_KING_GROWTH[CONTAMINATION];
  const oldGrowth = { ...growth, drawing: { shape: OLD_CONTAMINATION_SHAPE, order: [0, 1] } };
  const ids = new Set((slates || []).filter((slate) => (slate?.template || slate?.name) === CONTAMINATION).map((slate) => slate.id));
  let next = placements;
  for (const id of Object.keys(placements)) {
    const placement = placements[id];
    if (!ids.has(id) || !placement || !Number.isFinite(placement.column) || !Number.isFinite(placement.row)) continue;
    const [source, offspring] = rankedCells({ shape: OLD_CONTAMINATION_SHAPE }, oldGrowth, placement);
    const slate = { name: CONTAMINATION, shape: growth.drawing.shape };
    const pose = { rotation: placement.rotation || 0, flipX: placement.flipX || 1, flipY: placement.flipY || 1 };
    const poses = [pose, ...POSES.filter((other) => other.rotation !== pose.rotation || other.flipX !== pose.flipX || other.flipY !== pose.flipY)];
    let best = null, fallback = null;
    for (const candidate of poses) {
      for (let row = 1; row <= 6 && !best; row += 1) for (let column = 1; column <= 6 && !best; column += 1) {
        const at = { column, row, ...candidate };
        if (slateFootprint(slate, at).some((cell) => !SLATE_BOARD_CELLS.has(key(cell.column, cell.row)))) continue;
        const ranked = rankedCells(slate, growth, at);
        if (ranked[0] === source && ranked[1] === offspring) best = at;
        else if (!fallback && ranked[0] === source) fallback = at;
      }
      if (best) break;
    }
    const moved = best || fallback;
    if (next === placements) next = { ...placements };
    if (moved) next[id] = { ...placement, column: moved.column, row: moved.row, rotation: moved.rotation, flipX: moved.flipX, flipY: moved.flipY };
    else delete next[id];
  }
  return next;
}
/** Every cell of the slate's drawing at `placement`, grown or not. */
export function slateFootprint(slate, placement) {
  if (!placement) return [];
  return slateOffsets(slate,placement.rotation||0,placement.flipX||1,placement.flipY||1).map(([column,row])=>({column:placement.column+column,row:placement.row+row}));
}
/** The board cells the slate occupies at `placement`: its whole drawing, or a Nether King's Divinity's grown cells only. */
export function slateCells(slate, placement) {
  const cells = slateFootprint(slate, placement);
  const grown = cells.length ? slateGrownIndexes(slate, placement) : null;
  return grown ? cells.filter((_, index) => grown.includes(index)) : cells;
}
export function canPlaceSlate(slate, placement, placements, slates) {
  if (!placement) return false;
  const footprint=slateFootprint(slate,placement);
  if (!footprint.length||footprint.some((cell)=>!SLATE_BOARD_CELLS.has(key(cell.column,cell.row)))) return false;
  if (isOverlaySlate(slate)) return true;
  const cells=slateCells(slate,placement);
  const occupied=new Set();
  for (const other of slates) if (other.id!==slate.id&&!isOverlaySlate(other)&&placements[other.id]) for (const cell of slateCells(other,placements[other.id])) occupied.add(key(cell.column,cell.row));
  return cells.every((cell)=>!occupied.has(key(cell.column,cell.row)));
}
export function adjacentSlateIds(slate, placements, slates) {
  const own=slateCells(slate,placements[slate.id]); if (!own.length) return [];
  const ownKeys=new Set(own.map((cell)=>key(cell.column,cell.row)));
  const rule=slate.copyRule||"";
  const direction=rule.includes("above")?"above":rule.includes("below")?"below":rule.includes("on the left")?"left":rule.includes("on the right")?"right":null;
  return slates.filter((other)=>other.id!==slate.id&&placements[other.id]).filter((other)=>slateCells(other,placements[other.id]).some((cell)=>{
    if(direction==="above")return ownKeys.has(key(cell.column,cell.row+1));
    if(direction==="below")return ownKeys.has(key(cell.column,cell.row-1));
    if(direction==="left")return ownKeys.has(key(cell.column+1,cell.row));
    if(direction==="right")return ownKeys.has(key(cell.column-1,cell.row));
    if(rule)return ownKeys.has(key(cell.column-1,cell.row))||ownKeys.has(key(cell.column+1,cell.row))||ownKeys.has(key(cell.column,cell.row-1))||ownKeys.has(key(cell.column,cell.row+1));
    for(let dc=-1;dc<=1;dc+=1) for(let dr=-1;dr<=1;dr+=1) if((dc||dr)&&ownKeys.has(key(cell.column+dc,cell.row+dr))) return true;
    return false;
  })).map((other)=>other.id);
}
// Slates whose effect copies talents from adjacent slates (their tooltip lists the copied affixes).
export const COPY_SLATE_TEMPLATES = ["Sparks of Moth Fire", "When Sparks Set the Prairie Ablaze", "Space Rift", "Residence of Stars"];
export const isCopySlate = (slate) => COPY_SLATE_TEMPLATES.includes(slate?.template || slate?.name);
// Space Rift copies "the Medium Talents, Legendary Medium Talents, and Ultimate Nether King Talents" on the adjacent
// slate on its left (or right, per its rolled rule). Slate talent lines read "Tree: Talent type: effect"; Nether King
// Medium / Legendary Medium nodes count as Medium / Legendary Medium (provisional). Micro, Core and untyped lines
// (captured slates without a talent type) are not copied.
const spaceRiftEligible = /^[^:]+:\s*(?:Medium Talent|Legendary Medium Talent|Ultimate Nether King Talent Node|Medium Nether King Talent Node|Legendary Medium Nether King Talent Node):/i;
export const isSpaceRiftCopyable = (affix) => !!affix && !/^Copies?\b/i.test(affix) && spaceRiftEligible.test(affix);
// Residence of Stars (reference data): "Copies the Medium Talents on the adjacent slate to this slate. Unable to copy Legendary Medium
// Talents." Read as every edge-adjacent slate's own Medium Talents (Nether King Medium nodes count as Medium, as for Space
// Rift); provisional (src/open-questions.js slate-residence-of-stars-copy).
const residenceEligible = /^[^:]+:\s*(?:Medium Talent|Medium Nether King Talent Node):/i;
export const isResidenceCopyable = (affix) => !!affix && !/^Copies?\b/i.test(affix) && residenceEligible.test(affix);
const COPY_LIST_RULES = { "Space Rift": isSpaceRiftCopyable, "Residence of Stars": isResidenceCopyable };
export function copiedSlateAffixes(slate, placements, slates, affixesForSlate = (item) => item.fixed || item.affixes || []) {
  const template=slate.template || slate.name;
  // Copies are never copied again (user answer 2026-10-22; game hyperlink 758 Replicate, the keyword in every copy rule: "You can only
  // copy the original Talents on the Divinity Slate and cannot copy Talents obtained via other replication effects"). `affixesForSlate`
  // gives a slate's own talents (the calc passes baseTalentAffixes: no copied or projected line), and a copy slate's own rule line is
  // not a talent, so a Sparks of Moth Fire, Prairie, Space Rift or Residence of Stars beside a copy slate copies nothing from it.
  const ownTalents=(source)=>(affixesForSlate(source)||[]).filter((affix)=>affix&&!/^Copies?\b/i.test(affix));
  if(COPY_LIST_RULES[template]){
    const neighbors=new Set(adjacentSlateIds(slate,placements,slates));
    return slates.filter((item)=>neighbors.has(item.id)).flatMap((source)=>ownTalents(source).filter(COPY_LIST_RULES[template]).map((affix)=>({source:source.name,affix})));
  }
  if(template!=="Sparks of Moth Fire"&&template!=="When Sparks Set the Prairie Ablaze")return [];
  // "Copies the last Talent … Unable to copy the Core Talent": the source's last original talent, nothing when that is a core.
  const lastTalent=(source)=>{
    const affix=ownTalents(source).at(-1);
    return affix&&!/\bCore Talent\b/i.test(affix)?affix:null;
  };
  const neighbors=new Set(adjacentSlateIds(slate,placements,slates));
  return slates.filter((item)=>neighbors.has(item.id)).flatMap((source)=>{
    const affix=lastTalent(source);
    return affix?[{source:source.name,affix}]:[];
  });
}
export function autoPlaceSlates(slates) {
  const ordered=[...slates].sort((a,b)=>(b.shape?.length||b.size?.[0]*b.size?.[1])-(a.shape?.length||a.size?.[0]*a.size?.[1])); const placements={};
  const search=(index)=>{ if(index===ordered.length)return true; const slate=ordered[index]; const rotations=slateTransformRules(slate).rotate?[slate.initialRotation||0,0,90,180,270].filter((value,index,array)=>array.indexOf(value)===index):[0];
    for(const rotation of rotations) for(let row=1;row<=6;row+=1) for(let column=1;column<=6;column+=1){const candidate={column,row,rotation};if(!canPlaceSlate(slate,candidate,placements,ordered))continue;placements[slate.id]=candidate;if(search(index+1))return true;delete placements[slate.id];} return false;};
  search(0); return placements;
}
