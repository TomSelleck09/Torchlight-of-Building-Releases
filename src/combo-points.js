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

// Combo cycle extras (census item #9, 2026-10-27; game recipes, Combo Starter tag 6000411, Combo Finisher tag 6000412):
// - "+X% additional Attack and Cast Speed for Combo Starters" (599932864: attr 6001 / 6002 mod 4 on 6000411) and "… for Combo
//   Finishers" (856471424 on 6000412): an additional speed factor on those steps of the cycle (each line its own factor).
// - "+X% Critical Strike Damage for Combo Finishers" (727988544: attr 4803 flat on 6000412): added to the Finisher hits' crit damage.
// - "+X% additional damage for every 1 Combo Point consumed on Critical Strike from Combo Finishers" (Bodhi Girdle, 157017744: node 114
//   from the consumed-points field 2012104 to additional damage on {6000412, Critical Strike 5001010}): X × consumed points on the
//   Finisher's crits, one additional factor per line.
// - "+X% Double Damage Chance for Combo Finishers for every N Combo Point(s) consumed" (Kismet: Ascetic, 707968384: node 114 to the
//   Double Damage chance on 6000412): X × consumed ÷ N joins the Finisher hits' Double Damage chance.
// - "+N Combo Finisher charge(s)" (Heart of Animitta; Dual Kismet: Peerless; 440107424: field 2012108 "how many Combo Finisher 1 the
//   sequence holds"): the cycle holds 1 + N Finishers, each consuming the points the Starters generated (manual 1001013029).
// - "+X% Combo Finisher Amplification" (Heart of Animitta, 601825024: field 2006257): sums with the skill's own Amplification.
// - "Gains N Combo Point(s) on Critical Strike from Combo Finishers. Each skill cast can only trigger this effect once" (313241984):
//   the point is gained after the Finisher resets the counter, so the next cycle's Finisher consumes it too: expected extra points
//   per Finisher = N × P(the previous Finisher cast crits), capped by the max Combo Points (provisional, open question combo-cycle-extras).
// - "The time before Combo Sequence resets is fixed at 0.3s" (Peerless): the cycle is played without pauses (best case): no DPS effect.
const COMBO_EXTRA_PATTERNS = Object.freeze({
  starterSpeed: /^\+?([+-]?\d+(?:\.\d+)?)% additional Attack and Cast Speed for Combo Starters$/i,
  finisherSpeed: /^\+?([+-]?\d+(?:\.\d+)?)% additional Attack and Cast Speed for Combo Finishers$/i,
  finisherCritDamage: /^\+?([+-]?\d+(?:\.\d+)?)% Critical Strike Damage for Combo Finishers$/i,
  critPerPoint: /^\+?([+-]?\d+(?:\.\d+)?)% additional damage for every (\d+(?:\.\d+)?) Combo Points? consumed on Critical Strike from Combo Finishers$/i,
  doubleDamagePerPoint: /^\+?([+-]?\d+(?:\.\d+)?)% Double Damage Chance for Combo Finishers for every (\d+(?:\.\d+)?) Combo Point\(?s?\)? consumed$/i,
  finisherCharges: /^\+(\d+) Combo Finisher charges?(?:\(s\))?$/i,
  amplification: /^\+?([+-]?\d+(?:\.\d+)?)% Combo Finisher Amplification$/i,
  pointOnFinisherCrit: /^Gains (\d+) Combo Points? ?(?:\(s\))? on Critical Strikes? from Combo Finishers\b/i,
  sequenceReset: /^The time before Combo Sequence resets is fixed at [\d.]+ ?s$/i
});
export const COMBO_EXTRA_LINE = new RegExp(Object.values(COMBO_EXTRA_PATTERNS).map((pattern) => `(?:${pattern.source})`).join("|"), "i");

const comboClean = (text) => String(text ?? "").replace(/\s+/g, " ").replace(/\s+([,.])/g, "$1").trim();

/** The Combo cycle extras of a build's modifier lines (see above). Values carry the line's multiplier. */
export function comboExtraState(modifierTexts = []) {
  const state = { starterSpeed: [], finisherSpeed: [], finisherCritDamage: [], critPerPoint: [], doubleDamagePerPoint: [], finisherCharges: [], amplification: [], pointOnFinisherCrit: [], sequenceReset: [] };
  for (const line of modifierTexts) {
    for (const part of String(line?.text ?? "").split(/\r?\n/)) {
      const text = comboClean(part);
      for (const [kind, pattern] of Object.entries(COMBO_EXTRA_PATTERNS)) {
        const match = text.match(pattern);
        if (!match) continue;
        const multiplier = line.multiplier ?? 1;
        const entry = { source: line.source ?? null, text, kind };
        if (kind === "critPerPoint" || kind === "doubleDamagePerPoint") Object.assign(entry, { value: Number(match[1]) * multiplier, perPoints: Number(match[2]) || 1 });
        else if (kind === "pointOnFinisherCrit" || kind === "finisherCharges") entry.value = Number(match[1]);
        else if (kind !== "sequenceReset") entry.value = Number(match[1]) * multiplier;
        state[kind].push(entry);
        break;
      }
    }
  }
  const product = (lines) => lines.reduce((total, line) => total * Math.max(0, 1 + line.value / 100), 1);
  return {
    ...state,
    starterSpeedFactor: product(state.starterSpeed),
    finisherSpeedFactor: product(state.finisherSpeed),
    extraFinishers: state.finisherCharges.reduce((total, line) => total + line.value, 0),
    pointsOnCrit: state.pointOnFinisherCrit.reduce((total, line) => total + line.value, 0),
    any: Object.values(state).some((lines) => lines.length > 0)
  };
}

/** Expected consumed points with "Gains N Combo Point(s) on Critical Strike from Combo Finishers": the base consumption plus N on
 * the share p of Finisher casts that crit (the gained points carry into the next Finisher), each capped by the max Combo Points. */
export function expectedConsumedWithCritPoints(baseConsumed, pointsOnCrit, critCastChance, maxPoints = MAX_COMBO_POINTS_DEFAULT) {
  if (!(pointsOnCrit > 0) || !(critCastChance > 0)) return baseConsumed;
  const p = Math.min(1, critCastChance);
  return (1 - p) * Math.min(maxPoints, baseConsumed) + p * Math.min(maxPoints, baseConsumed + pointsOnCrit);
}
