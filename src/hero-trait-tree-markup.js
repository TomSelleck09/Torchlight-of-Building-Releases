// Markup of the trait-tree rows that need no planner state (2026-10-15; rendered by src/app.js renderHeroTraitTree).
// Youga – The Ultimate One's fourth row comes from the revived memory affix "+1 Max Youga Count in the Universe"
// (src/hero-trait-tree.js): it has no memory of its own, so its memory cell holds a "+1 Youga Count" chip, and its level
// cell reads the fixed maximum level (5) with a "MAX" caption. Hovering the row (outside its trait) shows where it comes
// from; the trait's own tooltip carries the same note.
import { escapeHtml } from "./html.js";
import { TREE_ROW_LEVELS, EXTRA_PICK_AFFIX, EXTRA_PICK_LEVEL, treeRowLevelKey } from "./hero-trait-tree.js";

export const EXTRA_ROW_CHIP = "+1 Youga Count";
export const EXTRA_ROW_NOTE = `This fourth trait row comes from the "${EXTRA_PICK_AFFIX}" memory affix. Its trait is at max level (${EXTRA_PICK_LEVEL}) and needs the three memory rows filled first.`;

/** Planner tooltip content (hero-trait style) for the fourth row. */
export function treeExtraRowTooltipHtml() {
  return `<div class="hero-trait-tooltip-head"><strong>${escapeHtml(EXTRA_ROW_CHIP)}</strong><em>Level ${EXTRA_PICK_LEVEL} · Max</em></div><div class="hero-trait-effects"><p>${escapeHtml(EXTRA_ROW_NOTE)}</p></div>`;
}

/**
 * The fourth row as a trait column (layout step 2, 2026-10-30): the head reads the fixed level "5" / "MAX", the chip sits where
 * a memory would, and the column holds its pick (draggable like the memory columns' picks; bright and gold-ringed with its LV.5 pill,
 * the same markup as src/app.js renderHeroTraitTree). `artwork(src, alt, className)` is the planner's art helper.
 */
export function treeExtraRowMarkup(heroId, traits = [], selections = [], artwork = () => "") {
  const row = TREE_ROW_LEVELS.length, pick = selections[row], trait = pick ? traits.find((item) => item.name === pick && item.level > 1) : null;
  const head = `<header class="hero-col-head"><span class="tier-level tier-level-max"><strong>${EXTRA_PICK_LEVEL}</strong><small>MAX</small></span></header>`;
  const foot = `<div class="hero-col-memory"><span class="tree-extra-row-chip">${escapeHtml(EXTRA_ROW_CHIP).replace(" ", "&nbsp;")}</span></div>`; // "+1 Youga" / "Count"
  const attributes = `data-selena-dance-row="${row}" data-tree-extra-row-tooltip aria-label="Fourth trait row, ${escapeHtml(EXTRA_ROW_CHIP)}, level ${EXTRA_PICK_LEVEL} (max)"`;
  if (!trait) return `<div class="hero-trait-col hero-col-empty tree-extra-row" ${attributes}>${head}<div class="hero-col-choices"></div>${foot}</div>`;
  const name = escapeHtml(trait.name);
  return `<div class="hero-trait-col tree-extra-row" ${attributes}>${head}<div class="hero-col-choices"><button type="button" class="hero-choice selected selena-dance-pick" data-selena-dance-pick="${row}" data-hero-trait-tooltip="${name}" data-hero-trait-level-key="${escapeHtml(treeRowLevelKey(heroId, row))}" aria-label="${name}, level ${EXTRA_PICK_LEVEL}" aria-pressed="true"><span class="hero-choice-icon">${artwork(trait.icon, trait.name, "hero-choice-art")}</span><span class="hero-choice-name">${name}</span><span class="hero-choice-level">LV.${EXTRA_PICK_LEVEL}</span></button></div>${foot}</div>`;
}
