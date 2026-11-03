import { slateCells } from "./slate-board.js";
import { slateCoreName } from "./granted-core-lines.js";
import { slateLineNumberForms } from "./data/slates/slate-line-number-forms.generated.js";

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

// User-confirmed 2026-10-13 (Space Rift) and 2026-10-30 (Sparks of Moth Fire, When Sparks Set the Prairie Ablaze): no link boost. Their
// talents are replicated ones, and hyperlink 15000401 says Effect Increase "Does not affect Core Talents or replicated Talents". They
// still count as slates on the line (`includeExempt`).
const JUDGMENT_EXEMPT = new Set(["Space Rift", "Sparks of Moth Fire", "When Sparks Set the Prairie Ablaze"]);
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
 * A boost rounds half up (user-supplied Google AI answer 2026-10-30, not an in-game test; open question judgment-whole-value-rounding):
 * +1 × 1.4 = 1.4 stays +1 (user-confirmed 2026-10-15), +1 × 1.5 = 1.5 is +2, so +50% is the breakpoint for a "+1" line. A reduction
 * rounds toward the base, UP, and never below 1 for a base of 1 or more (2026-10-15 user answer: Judgment's own Brand talents at −30%
 * keep "+1" at +1). Shared by the calc (candidate-sources) and the slate tooltip / inspector through scaleJudgmentAffix.
 */
export function judgmentWholeValue(base, percent = 0, { nearest = false } = {}) {
  const factor = 1 + percent / 100;
  const scaled = base * factor;
  // `nearest`: a Contamination projection, the record's GetRoundInt with no floor of 1 (chunk 6, research/slates-chunk6-2026-11-01.md F2).
  if (factor >= 1 || nearest) return Math.floor(scaled + 0.5 + 1e-9);
  const rounded = Math.ceil(scaled - 1e-9) || 0;
  return base >= 1 && factor > 0 ? Math.max(1, rounded) : rounded;
}

// Chunk 6 (2026-11-01): the numbers of a slate clause follow its game record, not the wording. GetEffectScale[]*X scales, GetRoundInt[...]
// rounds, a constant argument or a number written in the template stays (src/data/slates/slate-line-number-forms.generated.js; proven per
// record, the link from Judgment to GetEffectScale inferred: research/slates-chunk6-2026-11-01.md §4). A clause the table does not list and
// the records do not hold (a saved wording) keeps the text rule below.
const NUMBER = /([+\-−]?)(\d+(?:\.\d+)?)(%?)/g;
const TALENT_PREFIX = /^[^:·|]+:\s*[^:·|]*(?:Talent|Node)[^:·|]*:\s*/i;
/** A slate clause with its numbers masked: the key of the number forms table. */
export const slateLineMask = (clause) => String(clause).toLowerCase().replace(/[+\-−]?\d+(?:\.\d+)?/g, "#").replace(/stack\(s\)|stacks/g, "stack").replace(/time\(s\)|times/g, "time").replace(/\s+/g, " ").replace(/\.$/, "").trim();
function clauseForms(clause) {
  const forms = slateLineNumberForms[slateLineMask(clause)];
  return forms !== undefined && forms.length === [...clause.matchAll(NUMBER)].length ? forms : null;
}

function scaleClause(effect, fromPercent, toPercent, projection) {
  const forms = clauseForms(effect);
  // Batch 1 (2026-10-27): the Numbed / Deterioration extra stacks and "+N to Max Frostbite Rating" are integer counts too (before, a
  // boosted "1.4 additional stack(s) of Numbed" stopped parsing).
  const discrete = /^\s*(?:additional\s+stack(?:\(s\)|s)?\s+of\s+(?:Ignite|Numbed|Deterioration)|(?:to\s+)?Max\s+Frostbite\s+Rating|stack(?:\(s\)|s)?\s+of\s+(?:Tenacity|Focus|Agility)\s+Blessing|(?:Tenacity|Focus|Agility)\s+Blessing\s+stacks?|(?:to\s+)?Max\s+(?:Focus|Tenacity|Agility)\s+Blessing\s+Stacks?|(?:to\s+)?(?:Max|Min)\s+Channeled\s+Stacks?)/i;
  let position = -1;
  return effect.replace(NUMBER, (token, sign, digits, percent, offset) => {
    position += 1;
    const form = forms?.[position];
    if (form === "c") return token;
    const before = effect.slice(Math.max(0, offset - 18), offset).toLowerCase();
    // Condition parameters stay: "up to", "within", "every", "per", "Lv.", the "in the last N s" window (2026-10-15, now that Judgment's
    // own Brand talents are scaled: Druid's "Regained in the last 8s"), and an "Interval:" or "Cooldown:".
    if (!form && (/\b(?:up to|within|every|per|lv\.|in the last|interval:|cooldown:)\s*$/.test(before) || /max active divinity/i.test(effect))) return token;
    const after = effect.slice(offset + token.length);
    const whole = form ? form === "w" : !percent && (discrete.test(after) || /channeled stacks\s*$/i.test(before));
    const skillLevel = !form && !percent && /^\s+(?:to\s+)?(?:All|Active|Passive|Main|[A-Za-z]+)\s+(?:Skill Levels?|Skills['’]? Levels?)\b/i.test(after);
    if (skillLevel || whole) {
      // Integer-only affixes (judgmentWholeValue): a boost rounds half up, a reduction rounds toward the base. A stored,
      // already-boosted value first returns to its whole base roll (nearest integer), then takes the new effect.
      const base = fromPercent ? Math.round(Number(digits) / (1 + fromPercent / 100)) : Number(digits);
      return `${sign}${judgmentWholeValue(base, toPercent, { nearest: projection })}${percent}`;
    }
    const scaled = Number(digits) * (1 + toPercent / 100) / (1 + fromPercent / 100);
    return `${sign}${Math.round(scaled * 1000) / 1000}${percent}`;
  });
}

export function scaleJudgmentAffix(affix, fromPercent = 0, toPercent = 0, { sealedManaException = true, projection = false } = {}) {
  if (!affix || fromPercent === toPercent) return affix;
  // User-confirmed 2026-10-13 (in-game panel: Sealed Mana Compensation 8%, not 13.6%): Judgment does not boost Sealed Mana
  // Compensation lines; its other boosts stay as they are. A Contamination projection scales them (`sealedManaException` false).
  if (sealedManaException && /Sealed Mana Compensation/i.test(affix)) return affix;
  // User-confirmed 2026-10-21: Judgment boosts only a slate's non-core affixes; core talent lines (Pedigree form "<tree>: Lv.N Core
  // Talent: Name — …" or a bare core name) are never boosted, same as a talent-panel core.
  if (slateCoreName(affix)) return affix;
  // The talent prefix alone: a clause's own colon ("Interval: 1 s") is part of the clause (chunk 6, F1: before, only what followed it scaled).
  const prefix = String(affix).match(TALENT_PREFIX)?.[0] ?? "";
  const scaledEffect = affix.slice(prefix.length).split(/(\s+·\s+)/).map((clause, index) => (index % 2 ? clause : scaleClause(clause, fromPercent, toPercent, projection))).join("");
  return prefix + scaledEffect
    .replace(/Inflicts (\d+) additional stack(?:\(s\)|s)? of Ignite/i,(_,count)=>`Inflicts ${count} additional ${Number(count)===1?"stack":"stacks"} of Ignite`)
    .replace(/\b(Gains?) (\d+) stack\(s\) of (Tenacity|Focus) Blessing\b/gi,(_,verb,count,type)=>`${verb} ${count} ${Number(count)===1?"stack":"stacks"} of ${type} Blessing`)
    .replace(/\b(Gains?) (\d+) (Tenacity|Focus) Blessing stack\b/gi,(_,verb,count,type)=>`${verb} ${count} ${type} Blessing ${Number(count)===1?"stack":"stacks"}`);
}
