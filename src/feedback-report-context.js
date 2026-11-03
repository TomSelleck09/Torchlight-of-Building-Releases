import { statSheetModel } from "./stat-sheet.js";
import { summarizeRecount } from "./dummy-recount.js";
import { RECOUNT_SPAN_SECONDS } from "./dummy-recount-panel.js";
import { heroById } from "./data/heroes/hero-catalog-ss13.js";

// "Report calculation" (src/app.js → src/feedback-links.js calculationReportUrl): the active skill, hero and the planner's
// figures for that skill, read from the same stat-sheet model and recount timeline the Character panel shows. The figures
// ignore the recount card's click-to-exclude toggles, so a report always carries every modeled source. Reads only.

/** { skill, hero, figures: { sustainedDps, fiveSecondDamage, twentySecondDps, recountLast5sDps } } for the selected skill. */
export function calculationReportContext(planner, selectedKey) {
  const model = statSheetModel(planner, selectedKey);
  const timeline = planner?.dummyRecount?.timeline;
  const recount = timeline ? summarizeRecount(timeline, { span: RECOUNT_SPAN_SECONDS }) : null;
  const finite = (value) => (Number.isFinite(value) ? value : null);
  return {
    skill: model.skill?.name || "",
    hero: heroById(planner?.state?.hero?.selectedHeroId)?.name || "",
    figures: {
      sustainedDps: finite(model.totalDps),
      fiveSecondDamage: finite(model.dummyFiveSecondDamage),
      twentySecondDps: finite(model.dummyDps),
      recountLast5sDps: finite(recount?.last5sDps)
    }
  };
}
