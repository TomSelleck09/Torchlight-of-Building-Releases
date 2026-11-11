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
// Max Combo Points (2026-11-08, research/build-7t-claim-audit-2026-11-08.md gap 1): game field 2012115 (Combo Point upper limit)
// defaults to 99999 in config_char_field and no record writes it (0 of 12,148 affixes, no Split), so the points a Finisher
// consumes are not capped. The skill texts' "up to 4" caps what the points buy, not the points: Crescent Slash "up to 4 additional
// hit(s)", Spectral Slash "up to 4 Clone(s)" (COMBO_POINT_COUNT_CAP, the Finisher's hit / Clone count); Amplification and the
// per-point lines read every consumed point. (Before: a cap of 4 on the points, read from those texts.) Only Crescent Slash is
// observed (1 point per Starter, the Finisher consumes 2: user-confirmed); the other Combo skills reuse it (provisional).
export const COMBO_POINTS_PER_STARTER = 1;
export const COMBO_STARTERS_PER_CYCLE = 2;
export const MAX_COMBO_POINTS_DEFAULT = 99999;
export const COMBO_POINT_COUNT_CAP = 4;

/** The Finisher's extra hits or Clones bought by the consumed points: "up to 4" in the skill texts. */
export function comboCountFromPoints(points) {
  return Math.min(COMBO_POINT_COUNT_CAP, Math.max(0, points));
}

/** Points a Finisher consumes: Starters × points per Starter, capped by the Max Combo Points field (2012115, 99999). */
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
// provisional: the per-Starter sum is not observed in game). The Finisher consumes Starters × points (field 2012115 does not cap it).
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
//   sequence holds"): the cycle holds 1 + N Finishers; the first consumes the Starters' points, each later one only the points gained
//   since the previous Finisher's consume (SS14 client 0x141defa80; finisherConsumedPoints below; replaces manual 1001013029's reading).
// - "+X% Combo Finisher Amplification" (Heart of Animitta, 601825024: field 2006257): sums with the skill's own Amplification.
// - "Gains N Combo Point(s) on Critical Strike from Combo Finishers. Each skill cast can only trigger this effect once" (313241984):
//   the point is gained after the Finisher consumed the counter, so the next Finisher (the next sequence's first after the last one)
//   consumes it: expected points N × P(the previous Finisher cast crits), capped by the max Combo Points (provisional, open question
//   combo-cycle-extras).
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

// Each Finisher of a sequence consumes the Combo Points held when it is created (SS14 client, static reading of the private copy, 2026-11-09;
// first seen in research/attack-life-consume-2026-11-09.md §9). The cast routine 0x141df2c00 creates one skill instance per Combo step and calls
// 0x141defa80 on it: the step kind (1, 2 Starters; 3 Finisher) is counted in the skill's step map, and the map is cleared when the
// Finisher count reaches field 2012108 (Combo Finisher charges; the step chooser 0x142048020 repeats the Finisher while its count is
// below that field); a Starter adds field 2012116 to fight resource 22 (Combo Points); every instance is stamped with field 2012104 =
// resource 22's value at that moment; then a Finisher changes resource 22 by −100% of its current value (0x142072720). So with
// "+N Combo Finisher charge(s)" the first Finisher consumes the Starters' points and every later Finisher only the points gained since
// the previous Finisher's consume: "Gains N Combo Point(s) on Critical Strike from Combo Finishers" (313241984: trigger 1000033 on a
// crit hit with the Finisher tag, once per cast by label 3100521, node 627 resource 22 +N). The Finisher's first hit (Spectral Slash's
// slash, Crescent Slash's first hit) lands at its fire point, before the next step's instance is created, so a Finisher's crit points
// reach the next Finisher (inferred: the crit gain read on the cast's first crit hit); the last Finisher's carry into the next sequence's
// first. Manual 1001013028 / 1001013029 ("the additional finishers will inherit the Combo Points generated by the Combo Starter"; "both
// Finishers will consume 10 points each") describe the other reading; the client code is followed. Expected values per Finisher, each
// on the same crit-cast chance (as the single-Finisher reading).
export function finisherConsumedPoints({ starterPoints, finishers = 1, pointsOnCrit = 0, critCastChance = 0, maxPoints = MAX_COMBO_POINTS_DEFAULT } = {}) {
  const count = Math.max(1, Math.floor(Number(finishers) || 1));
  const first = expectedConsumedWithCritPoints(starterPoints, pointsOnCrit, critCastChance, maxPoints);
  const later = expectedConsumedWithCritPoints(0, pointsOnCrit, critCastChance, maxPoints);
  return [first, ...Array.from({ length: count - 1 }, () => later)];
}

/** The Finishers of one sequence as weighted instances: the first at its expected consumed points (as the single-Finisher reading),
 * each later one split by whether the previous Finisher's cast crit (its points then the N gained, else 0), so a whole-Clone or
 * whole-hit count and the per-point factors read each outcome's own points. Weights sum to 1 per Finisher. */
export function finisherChargeInstances({ starterPoints, finishers = 1, pointsOnCrit = 0, critCastChance = 0, maxPoints = MAX_COMBO_POINTS_DEFAULT } = {}) {
  const [first, ...later] = finisherConsumedPoints({ starterPoints, finishers, pointsOnCrit, critCastChance, maxPoints });
  const p = Math.max(0, Math.min(1, Number(critCastChance) || 0)), gained = Math.min(maxPoints, Math.max(0, Number(pointsOnCrit) || 0));
  const instances = [{ index: 0, points: first, weight: 1 }];
  later.forEach((_, k) => {
    const index = k + 1;
    if (!(gained > 0) || !(p > 0)) instances.push({ index, points: 0, weight: 1 });
    else if (p >= 1) instances.push({ index, points: gained, weight: 1 });
    else instances.push({ index, points: gained, weight: p, outcome: "crit" }, { index, points: 0, weight: 1 - p, outcome: "none" });
  });
  return instances;
}
