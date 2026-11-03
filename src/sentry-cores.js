import { normalizePercentageText } from "./percentage-text.js";
import { skillGameTagsSs13 } from "./data/skills/support-eligibility-ss13.generated.js";

// Sentry core mechanics (core audit batch B7, research/core-talents-audit-2026-10-18.md §5). Sentry quantity is read by the hit model
// (src/skill-hit-model.js sentryQuantity); Heat Up's cast-recently buff by src/line-conditions.js (sentryCastRecently); Co-resonance's
// Cast / Attack Speed → Cast Frequency by src/skill-hit-model.js.

const norm = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim().replace(/^\[[^\]]+\]\s*/, "");
const round = (value) => Math.round(value * 10000) / 10000;

// ---- Overly Modified (God of Machines core) --------------------------------------------------------------------------------
// Game affix 734641: two node 624 rows on the cast event 1000069, each a buff on that cast's damage (attr 57191, the combat-layer
// additional damage): P1 (+30%) for a cast of a Sentry-tagged skill (6000360), P2 (−50%) for a cast of an Active skill (6000200) that
// is not a Sentry. Read per skill on its own hits and its own damage over time (src/planner.js grantedSetupLines). Minions are not the
// player's casts (manual rule 1001011821). The ailments a skill inflicts inherit its classification, and Reaps settle those scaled DoTs
// (user-supplied 2026-10-19, Google AI Mode answer, not tested in game; src/ailment-applications.js). Scorching Beam's hit ledger and
// Ignite path take it as additional lines (src/planner.js, chunk 4, 2026-11-01).
const OVERLY = /^\+?([+-]?\d+(?:\.\d+)?)% additional Sentry Damage, ([+-]?\d+(?:\.\d+)?)% non-Sentry Active Skill damage$/i;

/** Overly Modified lines of the build: { sentryPercent, nonSentryPercent, sources } or null. */
export function overlyModifiedState(modifierTexts = []) {
  const sources = [];
  for (const line of modifierTexts) {
    const match = norm(line.text).match(OVERLY);
    if (match) sources.push({ source: line.source, text: norm(line.text), sentry: Number(match[1]) * (line.multiplier ?? 1), nonSentry: Number(match[2]) * (line.multiplier ?? 1) });
  }
  if (!sources.length) return null;
  // Several copies: each is its own buff on the cast (multiplied).
  const product = (key) => (sources.reduce((value, item) => value * (1 + item[key] / 100), 1) - 1) * 100;
  return { sentryPercent: product("sentry"), nonSentryPercent: product("nonSentry"), sources };
}

/** Whether a setup is a Sentry skill / an Active skill (game stone tags first, catalog tags otherwise). */
export function setupSkillKind(setup) {
  const tags = new Set(setup?.tags || []);
  const game = new Set(skillGameTagsSs13[setup?.name]?.tags || []);
  const sentry = tags.has("Sentry") || game.has(6000360);
  const active = game.size ? game.has(6000200) : !tags.has("Passive") && !["aura", "support"].includes(setup?.role);
  return { sentry, active };
}

/** The Overly Modified additional line for one setup's own damage, or null (src/planner.js grantedSetupLines). */
export function overlyModifiedLine(state, setup) {
  if (!state || !setup) return null;
  const { sentry, active } = setupSkillKind(setup);
  const value = sentry ? state.sentryPercent : active ? state.nonSentryPercent : 0;
  if (!value) return null;
  const which = sentry ? "a Sentry Skill" : "a non-Sentry Active Skill";
  return { source: state.sources.map((item) => item.source).join(" + "), text: `${value >= 0 ? "+" : ""}${round(value)}% additional damage (Overly Modified: ${setup.name} is ${which}; game affix 734641, a buff on the cast)`, value: round(value), category: "Additional damage", overlyModified: sentry ? "sentry" : "nonSentry" };
}
