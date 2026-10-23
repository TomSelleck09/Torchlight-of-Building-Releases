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
export function slateCells(slate, placement) {
  if (!placement) return [];
  return slateOffsets(slate,placement.rotation||0,placement.flipX||1,placement.flipY||1).map(([column,row])=>({column:placement.column+column,row:placement.row+row}));
}
export function canPlaceSlate(slate, placement, placements, slates) {
  const cells=slateCells(slate,placement);
  if (!cells.length||cells.some((cell)=>!SLATE_BOARD_CELLS.has(key(cell.column,cell.row)))) return false;
  if (isOverlaySlate(slate)) return true;
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
// Residence of Stars (TLIDB): "Copies the Medium Talents on the adjacent slate to this slate. Unable to copy Legendary Medium
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
