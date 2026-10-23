import { slateCells } from "./slate-board.js";
import { slateCoreName } from "./granted-core-lines.js";

// Same cells as src/app.js godSlateCapturedShapes (the board draws those; pinned in tests/slate-shape-import.test.js).
const godShapes = {
  deception: [null, [[0,0],[0,1],[1,1],[2,1]], [[0,0],[1,0],[0,1],[1,1]], [[1,0],[0,1],[1,1],[2,1]]],
  hunting: [null, [[1,0],[1,1],[0,2],[1,2]], [[0,0],[1,0],[0,1],[1,1]], [[0,0],[0,1],[1,1],[0,2]]],
  knowledge: [null, [[0,0],[1,0],[0,1],[0,2]], [[0,0],[1,0],[0,1],[1,1]], [[1,0],[0,1],[1,1],[2,1]]],
  machines: [null, [[0,0],[1,0],[0,1],[0,2]], [[0,0],[1,0],[0,1],[1,1]], [[1,0],[0,1],[1,1],[2,1]]],
  might: [null, [[0,0],[1,0],[2,0],[2,1]], [[0,0],[1,0],[0,1],[1,1]], [[1,0],[0,1],[1,1],[2,1]]],
  war: [null, [[0,0],[1,0],[2,0],[2,1]], [[0,0],[1,0],[0,1],[1,1]], [[1,0],[0,1],[1,1],[1,2]]]
};
export const legendarySlateShapes = {"Fallen Starlight":[[0,0],[0,1]],"Space Rift":[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5]],"A Corner of Divinity":[[0,0],[1,0],[1,1]],"Residence of Stars":[[2,0],[0,1],[1,1],[2,1],[1,2],[2,2],[3,2],[1,3]],"Pedigree of Gods":[[0,0],[1,0],[0,1],[1,1],[2,1],[1,2],[2,2]],"Sparks of Moth Fire":[[0,0]],"When Sparks Set the Prairie Ablaze":[[0,0]],"Nether King's Divinity: Judgment":[[0,0],[3,0],[3,3]],"Nether King's Divinity: Contamination":[[0,0],[0,1]],"Nether King's Divinity: Offspring":[[2,0],[1,1],[0,2]]};
export function craftedSlateShape(shape, name, god) {
  if (legendarySlateShapes[name]) return legendarySlateShapes[name];
  const godKey = ({"Goddess of Deception":"deception","Goddess of Hunting":"hunting","Goddess of Knowledge":"knowledge","God of Machines":"machines","God of Might":"might","God of War":"war"}[god] || "deception");
  const index = Number(String(shape).match(/-(\d+)$/)?.[1]);
  if (Number.isInteger(index)) return godShapes[godKey]?.[index] || (godKey === "deception" ? [[0,0],[1,0],[1,1],[2,1]] : [[1,0],[2,0],[0,1],[1,1]]);
  return {corner:[[0,0],[0,1],[1,1]],line:[[0,0],[0,1]],tee:[[0,0],[1,0],[1,1]],single:[[0,0]]}[shape] || [[0,0]];
}

const JUDGMENT_EXEMPT = new Set(["Space Rift"]);
// Judgment's Authority (patch notes 2026-10-15): "Effects of the Divinity Slate Talents on Offspring and the links between
// Offspring: 70% → 40%; your own Brand Talent effects: -30%".
export const JUDGMENT_LINK_EFFECT_PERCENT = 40;
export const JUDGMENT_OWN_BRAND_EFFECT_PERCENT = -30;
const isJudgment =(slate) => (slate.template || slate.name) === "Nether King's Divinity: Judgment";
const isActive = (slate) => isJudgment(slate) && (slate.affixGroups?.brand ? slate.affixGroups.brand.filter(Boolean).length === 3 : (slate.brands || []).filter(Boolean).length === 3);
/** An active Judgment (three Brand talents): its Authority applies, so its own Brand talents take -30%. */
export const isActiveJudgment = (slate) => Boolean(slate) && isActive(slate);

/**
 * The Judgment effect percent one affix of a slate takes: an active, placed Judgment's own Brand talents take its Authority's
 * -30%; everything else takes the link's +40% while the slate sits on a Judgment line (0 otherwise). Shared by the calc
 * (candidate-sources) and the slate tooltip / inspector so both show the same numbers.
 */
export function judgmentAffixTargetPercent(slate, affix, { linked = false, ownAuthority = false, linkPercent: boost = JUDGMENT_LINK_EFFECT_PERCENT } = {}) {
  // `linkPercent`: the boost after Judgment's Effect Increase Multipliers (src/nether-king-authority.js judgmentLinkPercentFor).
  const linkPercent = linked ? boost : 0;
  if (!ownAuthority) return linkPercent;
  const brand = (slate?.brands || []).includes(affix) || (slate?.affixGroups?.brand || []).filter(Boolean).includes(affix);
  return brand ? JUDGMENT_OWN_BRAND_EFFECT_PERCENT : linkPercent;
}

// `includeExempt`: also the slates that sit on a line but take no boost (Space Rift), for the Ultimate nodes that count "every 1
// Divinity Slate along the connecting line" (slates audit 2026-10-22, provisional).
export function judgmentAffectedSlateIds(slates, placements, equippedIds, { includeExempt = false } = {}) {
  const equipped = new Set(equippedIds);
  const affected = new Set();
  for (const judgment of slates.filter((slate) => equipped.has(slate.id) && placements?.[slate.id] && isActive(slate))) {
    const corners = slateCells(judgment, placements[judgment.id]);
    const bend = corners.find((cell) => corners.some((other) => other !== cell && other.column === cell.column) && corners.some((other) => other !== cell && other.row === cell.row));
    if (!bend) continue;
    const vertical = corners.find((cell) => cell !== bend && cell.column === bend.column);
    const horizontal = corners.find((cell) => cell !== bend && cell.row === bend.row);
    const between = (value, start, end) => value > Math.min(start, end) && value < Math.max(start, end);
    for (const slate of slates) {
      if (slate.id === judgment.id || !equipped.has(slate.id) || !placements[slate.id]) continue;
      // User-confirmed 2026-10-13: Space Rift does not receive Judgment's affix-effect bonus.
      if (!includeExempt && JUDGMENT_EXEMPT.has(slate.template || slate.name)) continue;
      if (slateCells(slate, placements[slate.id]).some((cell) =>
        (cell.row === bend.row && between(cell.column, bend.column, horizontal.column)) ||
        (cell.column === bend.column && between(cell.row, bend.row, vertical.row)))) affected.add(slate.id);
    }
  }
  return affected;
}

/**
 * An integer-only affix value (skill levels, Blessing / Ignite / Channeled stacks) after a Judgment effect of `percent`.
 * 2026-10-15 Judgment rounding (user): a boost rounds DOWN ("no more rounding up": +1 × 1.4 stays +1); a reduction rounds toward
 * the base, UP, and never below 1 for a base of 1 or more (2026-10-15 user answer: Judgment's own Brand talents at −30% keep "+1"
 * at +1). Shared by the calc (candidate-sources) and the slate tooltip / inspector through scaleJudgmentAffix.
 */
export function judgmentWholeValue(base, percent = 0) {
  const factor = 1 + percent / 100;
  const scaled = base * factor;
  if (factor >= 1) return Math.floor(scaled + 1e-9);
  const rounded = Math.ceil(scaled - 1e-9) || 0;
  return base >= 1 && factor > 0 ? Math.max(1, rounded) : rounded;
}

export function scaleJudgmentAffix(affix, fromPercent = 0, toPercent = 0, { sealedManaException = true } = {}) {
  if (!affix || fromPercent === toPercent) return affix;
  // User-confirmed 2026-10-13 (in-game panel: Sealed Mana Compensation 8%, not 13.6%): Judgment does not boost Sealed Mana
  // Compensation lines; its other boosts stay as they are. A Contamination projection scales them (`sealedManaException` false).
  if (sealedManaException && /Sealed Mana Compensation/i.test(affix)) return affix;
  // User-confirmed 2026-10-21: Judgment boosts only a slate's non-core affixes; core talent lines (Pedigree form "<tree>: Lv.N Core
  // Talent: Name — …" or a bare core name) are never boosted, same as a talent-panel core.
  if (slateCoreName(affix)) return affix;
  const separator = affix.lastIndexOf(": ");
  const prefix = separator < 0 ? "" : affix.slice(0, separator + 2);
  const effect = separator < 0 ? affix : affix.slice(separator + 2);
  const discrete = /^\s*(?:additional\s+stack(?:\(s\)|s)?\s+of\s+Ignite|stack(?:\(s\)|s)?\s+of\s+(?:Tenacity|Focus|Agility)\s+Blessing|(?:Tenacity|Focus|Agility)\s+Blessing\s+stacks?|(?:to\s+)?Max\s+(?:Focus|Tenacity|Agility)\s+Blessing\s+Stacks?|(?:to\s+)?(?:Max|Min)\s+Channeled\s+Stacks?)/i;
  const scaledEffect = effect.replace(/([+\-−]?)(\d+(?:\.\d+)?)(%?)/g, (token, sign, digits, percent, offset) => {
    const before = effect.slice(Math.max(0, offset - 18), offset).toLowerCase();
    // Condition parameters stay: "up to", "within", "every", "per", "Lv.", and the "in the last N s" window (2026-10-15, now
    // that Judgment's own Brand talents are scaled: Druid's "Regained in the last 8s").
    if (/\b(?:up to|within|every|per|lv\.|in the last)\s*$/.test(before) || /max active divinity/i.test(effect)) return token;
    const after = effect.slice(offset + token.length);
    const whole = !percent && (discrete.test(after) || /channeled stacks\s*$/i.test(before));
    const skillLevel = !percent && /^\s+(?:to\s+)?(?:All|Active|Passive|Main|[A-Za-z]+)\s+(?:Skill Levels?|Skills['’]? Levels?)\b/i.test(after);
    if (skillLevel || whole) {
      // Integer-only affixes (judgmentWholeValue): a boost rounds down, a reduction rounds toward the base. A stored,
      // already-boosted value first returns to its whole base roll (nearest integer), then takes the new effect.
      const base = fromPercent ? Math.round(Number(digits) / (1 + fromPercent / 100)) : Number(digits);
      return `${sign}${judgmentWholeValue(base, toPercent)}${percent}`;
    }
    const scaled = Number(digits) * (1 + toPercent / 100) / (1 + fromPercent / 100);
    return `${sign}${Math.round(scaled * 1000) / 1000}${percent}`;
  });
  return prefix + scaledEffect
    .replace(/Inflicts (\d+) additional stack(?:\(s\)|s)? of Ignite/i,(_,count)=>`Inflicts ${count} additional ${Number(count)===1?"stack":"stacks"} of Ignite`)
    .replace(/\b(Gains?) (\d+) stack\(s\) of (Tenacity|Focus) Blessing\b/gi,(_,verb,count,type)=>`${verb} ${count} ${Number(count)===1?"stack":"stacks"} of ${type} Blessing`)
    .replace(/\b(Gains?) (\d+) (Tenacity|Focus) Blessing stack\b/gi,(_,verb,count,type)=>`${verb} ${count} ${type} Blessing ${Number(count)===1?"stack":"stacks"}`);
}
