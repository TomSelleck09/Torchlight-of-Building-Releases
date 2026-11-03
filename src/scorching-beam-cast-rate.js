import { selenaScorchingBeamStrippedBaseline } from "./data/stats/selena-scorching-beam-stripped-baseline.js";
import { speedPathMode } from "./recipe-hit-layers.js";

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

// Conditional Aim speed uses its configured uptime in the five-second forecast.
// `speedAdjust` (recipe step 3, research/recipe-interpreter-step1-2026-10-25.md §15): src/recipe-hit-aggregates.js speedRecipeAdjuster —
// each line the game recipe places takes the recipe's Cast Speed (6002 by skill tag), and every additional Cast Speed write (mod 4) is its
// own factor; TLI_SPEED_PATH=text keeps the text ledger (which sums the gear additional lines with Quick Decision into one term).
export function scorchingBeamCastRate({ blessings, ceaselessTide = false, main, talentSlate, equipment, pact, aimCastSpeedPercent = 0, lineSpeed = null, speedAdjust = null } = {}) {
  const baseRate = selenaScorchingBeamStrippedBaseline.damage.castsPerSecond;
  const talent = talentSlate?.candidateTalent || {};
  const slate = talentSlate?.candidateSlate || {};
  const gear = equipment?.candidate || {};
  const spirits = pact?.totals || {};
  // Scorching Beam is a Channeled Skill, so channel-only speed applies to it.
  const channeledCounted = number(talent.channeledAttackAndCastSpeedPercent) + number(slate.channeledAttackAndCastSpeedPercent) !== 0;
  const recipe = speedAdjust && speedPathMode() === "recipe" ? speedAdjust(main, { channeledCounted }) : null;
  const increasedPercent = number(recipe?.increased) + number(blessings?.castSpeedPercent) + number(aimCastSpeedPercent) + number(talent.attackAndCastSpeedPercent) + number(talent.castSpeedPercent) + number(talent.channeledAttackAndCastSpeedPercent)
    // Talent and slate lines share one parser (src/talent-text-effects.js); before talent batch T1 only captured
    // Selena nodes filled the talent keys, and slates had no channel-only key.
    + number(slate.attackAndCastSpeedPercent) + number(slate.castSpeedPercent) + number(slate.channeledAttackAndCastSpeedPercent)
    + number(gear["castSpeedPercent:increased"])
    + number(spirits.attackAndCastSpeedPercent) + number(spirits.castSpeedPercent)
    // Conditional and per-stat lines the shared resolver made active (src/line-effects.js, talent batch chunk 2).
    + number(lineSpeed?.increasedPercent);
  const supportPercent = (main?.supports || []).filter((support) => support.enabled !== false && support.name === "Quick Decision")
    .reduce((total, support) => total + (Number(support.effects?.join(" ").match(/([+-]\d+(?:\.\d+)?)\s*%\s+additional Attack and Cast Speed/i)?.[1]) || 0), 0);
  const additionalPercent = number(gear["castSpeedPercent:more"]) + supportPercent;
  const increasedFactor = Math.max(0, 1 + increasedPercent / 100);
  // Recipe: the support's and each line's additional Cast Speed multiply on their own; what the gear key holds beyond the lines stays one term.
  const gearRemainder = recipe ? number(gear["castSpeedPercent:more"]) - number(recipe.textAdditional) : 0;
  const additionalTerms = recipe ? [supportPercent, ...recipe.additional.map((line) => number(line.value)), ...(Math.abs(gearRemainder) > 1e-9 ? [gearRemainder] : [])] : [additionalPercent];
  const additionalFactor = additionalTerms.reduce((factor, value) => factor * Math.max(0, 1 + value / 100), 1) * (ceaselessTide ? 0.8 : 1)
    * (lineSpeed?.additionalPercents || []).reduce((factor, value) => factor * Math.max(0, 1 + number(value) / 100), 1);
  return {
    recipe: recipe ? { mode: "recipe", additionalLines: recipe.additional, unread: { differences: recipe.differences } } : { mode: speedAdjust ? speedPathMode() : "text" },
    baseRate,
    ceaselessTideSpeedFactor: ceaselessTide ? 0.8 : 1,
    aimCastSpeedPercent: number(aimCastSpeedPercent),
    increasedPercent,
    additionalPercent,
    castsPerSecond: baseRate * increasedFactor * additionalFactor
  };
}
