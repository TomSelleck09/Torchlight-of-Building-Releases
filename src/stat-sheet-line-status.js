import { normalizePercentageText } from "./percentage-text.js";
import { refineCoverage } from "./line-coverage.js";

// A line a stat sheet section's sub-model does not use (heroMemories / blessings / resistances / lowResources / block `.unsupported`)
// is not a line the planner ignores: those lists mean "not this section's input". The row shows the line's real status from the
// tooltip badges' machinery (src/line-coverage.js), and only a line no reader takes stays Not modeled (user request 2026-10-30).
export const STAT_LINE_STATUSES = new Set(["In calc", "Counted in stats", "No DPS effect", "Not on dummy", "Inactive", "Provisional", "Partly modeled", "Not modeled", "Planner only"]);

const SLATE_PREFIX = /^[^:|·]+:\s*[^:|·]*Talent[^:|·]*:\s*/i; // "Magister: Legendary Medium Talent: …" (as src/calculation-coverage.js slateLineCoverage).
const cache = new WeakMap();

/** The badge status of a modifier line ({ text }) in this build. Cached per planner: the Calculations tab and the sidebar re-read it. */
export function statLineStatus(line, planner) {
  const text = normalizePercentageText(String(line?.text ?? "")).replace(SLATE_PREFIX, "").trim();
  if (!planner) return refineCoverage("Not modeled", text, planner);
  if (!cache.has(planner)) cache.set(planner, new Map());
  const known = cache.get(planner);
  if (!known.has(text)) known.set(text, refineCoverage("Not modeled", text, planner));
  return known.get(text);
}
