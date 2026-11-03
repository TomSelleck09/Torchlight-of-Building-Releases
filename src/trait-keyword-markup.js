// Hero trait keyword markup for the trait tooltip (src/app.js): the hero's linked terms (src/inline-keywords.js
// heroTraitKeywords) in the keyword style, and a definitions block that holding Alt reveals (body.revival-alt-held, the same
// key as the revived-memory and core-slate details).
import { escapeHtml } from "./html.js";
import { heroTraitKeyword, heroTraitKeywordSegments, heroTraitKeywordsIn } from "./inline-keywords.js";

/** A stretch of trait text as HTML, with the hero's keywords in the keyword style. */
export function traitKeywordTextHtml(heroId, text) {
  return heroTraitKeywordSegments(heroId, text).map((segment) => segment.keyword
    ? `<span class="keyword-roll-name trait-keyword" data-trait-keyword="${escapeHtml(segment.keyword)}">${escapeHtml(segment.text)}</span>`
    : escapeHtml(segment.text)).join("");
}

/**
 * The skill-tooltip note on a trait-granted skill or support (src/trait-board-grants.js `traitGranted`): which trait grants
 * it, its energy (the skill takes none, its supports and Clockwork Core's socket cost energy as usual), and what it replaces; "" for anything else.
 */
export function traitGrantNoteHtml(entry) {
  const grant = entry?.traitGranted;
  if (!grant) return "";
  const kept = "it stays in your build and is left out of the calculation";
  const text = Number.isInteger(grant.row)
    ? `Granted by ${grant.trait} (${grant.keyword}) · Lv. ${entry.effectiveLevel ?? 20} trait skill in Active slot ${grant.row + 1}, the skill takes no energy (its supports do)${grant.replaces ? ` · Replaces ${grant.replaces}: ${kept}` : ""}`
    : `Granted by ${grant.trait} · second support slot, costs energy like any support${grant.replaces ? ` · Replaces ${grant.replaces}: ${kept}` : ""}`;
  return `<p class="trait-grant-note">${escapeHtml(text)}</p>`;
}

/** The Alt hint and the definitions of the hero's keywords in `lines` (each once, in order); "" when the lines have none. */
export function traitKeywordDetailsHtml(heroId, lines = []) {
  const names = heroTraitKeywordsIn(heroId, lines);
  if (!names.length) return "";
  const definitions = names.map((name) => {
    const entry = heroTraitKeyword(heroId, name);
    return `<div class="trait-keyword-definition" data-trait-keyword-definition="${escapeHtml(name)}"><span class="keyword-roll-name">${escapeHtml(name)}</span><em>${escapeHtml(entry.kind || "Keyword")}</em>${entry.effect.map((line) => `<span class="trait-keyword-line">${escapeHtml(line)}</span>`).join("")}</div>`;
  }).join("");
  return `<small class="trait-keyword-hint">Hold Alt for details</small><div class="trait-keyword-details">${definitions}</div>`;
}
