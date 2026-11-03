// Conditions supplied by the build are assumed active in normal combat.
// The dummy profile (src/dummy-target.js) settles two target circumstances:
// it counts as a Boss (so an Elite) and the player stands within 10 m, so
// "Elite within 10 m" is automatic too. Other target circumstances stay manual.
export const automaticCombatConditionIds = Object.freeze([
  "blockedRecently", "blur", "tideContact", "onTheTide", "waveAria", "idyll",
  "fireInfiltration", "entangledPain", "scorch", "affliction", "aim", "nearbyElite",
  // User rule (2026-10-10): moving is constant, so movement-driven stacks (Kismet: Civet) are full.
  "moving"
]);

// Config tab "Set all to best case" (user 2026-10-30): the Best case switch on, every condition and assumption switch at its
// default (choice pins and stored "off"s gone), and the Advanced values back to the planner's defaults (Aim uptime Auto, the
// derived Scorch stacks and Well-Fought Battle stacks).
const BEST_CASE_VALUE_KEYS = Object.freeze(["afflictionAverage", "afflictionPeak", "targetFireResistancePercent", "aimUptimePercent", "auraAffectedAllies", "idyllStacks", "extraMaxChanneledStacks", "extraInitialChanneledStacks", "firesAllureScorchStacks", "aimBattleStacks"]);
export function bestCaseCombat(combat = {}, defaults = {}) {
  const next = { ...combat, conditionMode: "auto", conditions: { ...(defaults.conditions || {}) }, bestCaseOverrides: {} };
  for (const key of BEST_CASE_VALUE_KEYS) { if (key in defaults) next[key] = defaults[key]; else delete next[key]; }
  return next;
}

export function requestedCombatConditions(combat = {}) {
  const conditions = { ...(combat.conditions || {}) };
  // Own buffs built before the fight (2026-10-14): a stored conditions.prebuiltSelfBuffs false no longer counts, because the
  // blank build behind new and imported builds (src/app.js) stored it false without the user choosing it, so it cannot be
  // told apart from that bug. The user's choice lives in combat.bestCaseOverrides.prebuiltSelfBuffs (applied below).
  conditions.prebuiltSelfBuffs = true;
  if (combat.conditionMode !== "manual") {
    for (const id of automaticCombatConditionIds) conditions[id] = true;
  }
  // Best-case assumption switches (Config tab "Best-case assumptions" list; src/planner.js bestCaseAssumptions): a stored
  // switch wins in both modes, so Hit or blocked recently (automatic above) can still be turned off. "Set all to best case"
  // clears them.
  for (const [id, on] of Object.entries(combat.bestCaseOverrides || {})) if (typeof on === "boolean") conditions[id] = on;
  return conditions;
}
