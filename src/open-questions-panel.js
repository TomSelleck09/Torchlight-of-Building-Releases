import { escapeHtml } from "./html.js";
import { extraSectionMarkup } from "./damage-path-views.js";
import { openQuestionsFor } from "./open-questions.js";

// "Open questions" panel at the bottom of Character → Damage path (src/damage-path-panel.js): the same collapsible panel as
// the paths' Damage components / Timing sections (extraSectionMarkup), open by default, with the count in its header. The
// body starts with the intro line and the copy button (its handler lives in src/app.js), then one collapsed row per
// registry entry that applies to the build (src/open-questions.js). Presentation only. A build with no applicable entry
// renders nothing. Each row's body ends with "Submit an answer": a button that opens the in-planner answer dialog
// (src/feedback-dialog.js, wired in src/app.js), which then opens the pre-filled GitHub issue form.
// It sits in the row body, not its summary, so clicking it toggles neither the row nor the panel.

const row = (entry) => `<details class="stat-sheet-row open-question" data-open-question="${escapeHtml(entry.id)}"><summary><span class="open-question-title">${escapeHtml(entry.title)}</span><b class="calc-coverage pending">${escapeHtml(entry.evidence)}</b></summary><div class="open-question-body"><p><strong>Question:</strong> ${escapeHtml(entry.question)}</p><p><strong>Planner now:</strong> ${escapeHtml(entry.current)}</p><p><strong>Alternatives:</strong></p><ul class="open-question-alternatives">${entry.alternatives.map((alt) => `<li>${escapeHtml(alt.reading)} — ${escapeHtml(alt.effect)}</li>`).join("")}</ul><p><strong>How to test:</strong> ${escapeHtml(entry.test)}</p><p class="open-question-source">Source: ${escapeHtml(entry.source)}</p><p class="open-question-submit-row"><button type="button" class="button button-secondary open-question-submit" data-submit-open-question="${escapeHtml(entry.id)}">Submit an answer</button></p></div></details>`;

/** Markup for the given entries; "" when there are none. */
export function openQuestionsSectionMarkup(entries = []) {
  if (!entries.length) return "";
  const intro = `<div class="open-questions-intro"><p>Interactions the planner isn't sure about for this build. In-game tests or corrections welcome.</p><button type="button" class="button button-secondary open-questions-copy" data-copy-open-questions>Copy questions</button><p class="open-questions-note">Answers are posted publicly on GitHub (free account needed). Include how you tested it.</p></div>`;
  return extraSectionMarkup({ title: "Open questions", count: entries.length, open: true, className: "open-questions", attrs: "data-open-questions", body: `${intro}${entries.map(row).join("")}` });
}

/** The section for this planner result (its own state). */
export function openQuestionsPanelMarkup(planner) {
  return openQuestionsSectionMarkup(openQuestionsFor(planner, planner?.state));
}
