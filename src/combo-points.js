// Combo Points (game manual, config_multi_language_en manual_rule_des):
//   1001013023 "Combo Points Gained From Combo Starters": "The number of Combo Points gained from each Combo Starter is
//              affected by this stat." The base count per Starter is not published.
//   1001013024 "Combo Finisher Amplification": "When casting a Combo Finisher, its Hit Damage is additionally increased by an
//              amount equal to Consumed Combo Points * Combo Finisher Amplification."
//   1001013029 (Combo Starter/Finisher Charges example): "If Combo Starter 1 and 2 generate 10 Combo Points in total, both
//              Finishers will consume 10 points each" — a cycle is Starter 1 + Starter 2 + Finisher, and the Finisher
//              consumes what the two Starters generated.
// Observed (user, 2026-10-12, Crescent Slash Lv16, no-gear Lv94 Iris + Nameless Sword): "one combo point with each attack,
// then at 3 it finishes and resets to 0"; the cycle is 3 attacks and the 3rd attack is the Finisher, which consumes the
// points. Two Starters × 1 point = 2 consumed points per Finisher. The 20 s dummy run (avg 316, last 5 s 315) matches
// 2 consumed points (steady 306, -3%); 3 consumed points (4 Finisher hits, +90%) would give 364 (+15%). See
// User-confirmed follow-up: the counter reads 0, 1, 2 and never shows 3; the 3rd attack (the Finisher) resets it to 0,
// so a Finisher consumes 2 points.
// research/residual-batch-2026-10-12.md run 5 (S-COMBO) and tests/crescent-slash-dummy-reference.test.js.
// Max Combo Points per skill text: Crescent Slash "up to 4 additional hit(s)", Spectral Slash "up to 4 Clone(s)", Gale
// Slash "Stacks up to 4 time(s)" — the cap (4) is above the 2 points a cycle generates, so it does not bind at base.
// Serpent Beam's text gives no cap. Only Crescent Slash is observed; the other Combo skills reuse 1 point per Starter
// (provisional).
export const COMBO_POINTS_PER_STARTER = 1;
export const COMBO_STARTERS_PER_CYCLE = 2;
export const MAX_COMBO_POINTS_DEFAULT = 4;

/** Points a Finisher consumes: Starters × points per Starter, capped by the skill's max Combo Points (text). */
export function consumedComboPoints({ starters = COMBO_STARTERS_PER_CYCLE, pointsPerStarter = COMBO_POINTS_PER_STARTER, maxPoints = MAX_COMBO_POINTS_DEFAULT } = {}) {
  return Math.min(maxPoints ?? Infinity, starters * pointsPerStarter);
}

export const CONSUMED_COMBO_POINTS = consumedComboPoints();

/** The Finisher's additional Hit Damage from an Amplification percent: Amplification × consumed Combo Points (manual). */
export function finisherAmplificationPercent(amplificationPercent, consumedPoints = CONSUMED_COMBO_POINTS) {
  return amplificationPercent * consumedPoints;
}

// "+N Combo Points gained from Combo Starters" (gear: craft and Vorax affix 709372224) and "… for the supported skill" (supports:
// 395397824) write one stat, game field 2012116 (manual 1001013023: "The number of Combo Points gained from each Combo Starter
// is affected by this stat"), so they add to the 1 point per Starter observed on Crescent Slash (gear affix batch B, 2026-10-22;
// provisional: the per-Starter sum is not observed in game). The Finisher consumes Starters × points, capped at the max Combo
// Points (4 in every Combo skill text that names one).
export const COMBO_POINTS_GAINED_LINE = /^\+(\d+(?:\.\d+)?) Combo Points gained from Combo Starters$/;
export function comboPointState(modifierTexts = [], supportLines = []) {
  const sources = [];
  for (const line of modifierTexts) {
    const match = String(line?.text ?? "").replace(/\s+/g, " ").trim().match(COMBO_POINTS_GAINED_LINE);
    if (match) sources.push({ source: line.source ?? null, text: match[0], value: Number(match[1]) * (line.multiplier ?? 1) });
  }
  for (const line of supportLines) if (line?.value) sources.push({ source: line.source ?? null, text: line.text, value: Number(line.value) });
  const perStarter = COMBO_POINTS_PER_STARTER + sources.reduce((total, line) => total + line.value, 0);
  const consumed = consumedComboPoints({ pointsPerStarter: perStarter });
  return { perStarter, consumed, sources, changed: consumed !== CONSUMED_COMBO_POINTS };
}
