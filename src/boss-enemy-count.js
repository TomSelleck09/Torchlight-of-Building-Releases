// The Boss dummy counts as BOSS_ENEMY_COUNT (5) enemies for the records whose node 700 (count of enemies, "for each enemy within N m")
// or count gate ("when there are at least N enemies within M m", gate 4 `count`) carries `calcCountByRarity` (the game's Enemy Count text:
// "each Boss counts as 5 monsters"). Ten records carry it in the extraction: the revived Affliction Effect family 1393437, Nether Grasp:
// Devour 10990381, Double Thrusts: Restless 164098032, Precise: Domain Expansion's buff affixes 263618880 / 495834240 / 687124224, Blazing
// Scorch 357258688, Reckless Aggression 370519520, Thunder Core: Electric Field 455061504, Spectral Slash: Legion 506057920
// (research/support-revived-review-2026-11-13.md §3 G1). Per-enemy records without the flag (14773965, 137974192) count the dummy as 1.
import { AFFIX_RECIPES } from "./data/game/affix-recipes.generated.js";
import { BOSS_ENEMY_COUNT } from "./dummy-target.js";

export { BOSS_ENEMY_COUNT };

const flagged = new Map();
/** True when the game record counts a Boss as BOSS_ENEMY_COUNT enemies (`calcCountByRarity` on one of its nodes). */
export function recordCountsBossAsFive(id) {
  const key = String(id);
  if (!flagged.has(key)) flagged.set(key, JSON.stringify(AFFIX_RECIPES[key] ?? null).includes("\"calcCountByRarity\":true"));
  return flagged.get(key);
}

let templates = null;
const NUMBER = "[+-]?\\d+(?:\\.\\d+)?";
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The flagged records' text templates as patterns ($P1$ / $+P1$ a number with an optional sign), for lines read by wording. */
function flaggedTemplates() {
  if (templates) return templates;
  templates = [];
  for (const [id, recipe] of Object.entries(AFFIX_RECIPES)) {
    if (!recipe?.t || !recordCountsBossAsFive(id)) continue;
    const parts = String(recipe.t).split(/\$\+?P\d\$/);
    const body = parts.map((part) => escape(part.replace(/\s+/g, " ")).replace(/ /g, "\\s*")).join(NUMBER);
    templates.push({ id: Number(id), pattern: new RegExp(`^\\s*${body}\\s*$`, "i") });
  }
  return templates;
}

/** The flagged record a line's wording renders (its numbers filled in), or null. */
export function bossCountedRecordFor(text) {
  const clean = String(text ?? "").replace(/[−–]/g, "-").replace(/\s+/g, " ").trim();
  return flaggedTemplates().find((item) => item.pattern.test(clean))?.id ?? null;
}
