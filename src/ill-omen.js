// Ill Omen (reference data Ill_Omen page; user answers 2026-10-13). Pure module: the planner passes the build's lines and
// states, this returns the Ominous sources, the Cumulative Efficiency e, the three target-tier tiles of the
// "Ill Omen (beyond the dummy)" card and the best-case factor folded into the main damage figures.
//
// Rules:
// - An enemy affected by the Ominous curse gains 1 Ill Omen stack each time the Damage Over Time, Reaping Damage,
//   Spacetime Turbulence Damage and additional damage it takes reaches 8% of Max Life (non-Elite) or 5% (Elite),
//   ÷ (1 + e). Max 10 stacks. Hits do not build stacks.
// - e = Σ "+X% Ill Omen Cumulative Efficiency" (gear, slates incl. copies, talents, Blending, kismets), capped at 100%
//   (user). Reap Purification's −50% joins the sum before the cap.
// - Without Reap Purification: Normal / Magic are eliminated at 10 stacks; an Elite takes True Damage = 20% of Max Life
//   at 10 stacks, the stacks are consumed and it loops (user); a supreme Boss fires once (user).
// - With Reap Purification ("Ill Omen Effect is converted to: Enemies take True Damage equal to 2.5% of Max Life when
//   gaining 1 stack"): every stack deals 2.5% Max Life, continuous on every tier (the user's source says it bypasses the
//   Boss lockout: provisional); no elimination for normals.
// - Main damage figures (user 2026-10-13: "add Ill Omen to the main DPS stat"): a best-case combat condition (`illOmen`)
//   adds True Damage = (DoT + Reaping damage) × the Elite-loop factor 0.4 × (1 + e), or 2.5 × (1 + e) / 5 with Reap
//   Purification. True Damage: no further multipliers. The training dummy itself never triggers Ill Omen.

export const ILL_OMEN_MAX_STACKS = 10;
export const ILL_OMEN_NORMAL_THRESHOLD_PERCENT = 8;
export const ILL_OMEN_ELITE_THRESHOLD_PERCENT = 5;
export const ILL_OMEN_ELITE_TRUE_DAMAGE_PERCENT = 20;
export const ILL_OMEN_EFFICIENCY_CAP_PERCENT = 100;

const EFFICIENCY = /^([+-]?\d+(?:\.\d+)?)% Ill Omen Cumulative Efficiency( while Blur is active)?$/i;
const PURIFICATION = /^Ill Omen Effect is (?:converted to|becomes): Enemies take True Damage equal to (\d+(?:\.\d+)?)% of Max Life when gaining 1 stack of Ill Omen$/i;
const NETHER_KING = /^Ill Omen gains an additional effect: \+(\d+(?:\.\d+)?)% additional damage taken$/i;
const PARADISE = /^Enemies within the Main Terra Skill's area are cursed with Lv\. (\d+) Ominous$/i;
// Gear / slate / other lines that curse with Ominous ("Nearby enemies within 15 m are cursed by Lv. 20 Ominous",
// "[Inexorable Doom] …", a "Triggers Lv. N Ominous Curse …" trigger).
const OMINOUS_LINE = /cursed (?:by|with) Lv\. (\d+) Ominous\b|Triggers? Lv\. (\d+) Ominous Curse/i;

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const fmt = (value) => String(round(value));

/**
 * @param {object} input
 * @param {Array<{text,source,origin,multiplier}>} input.modifierTexts every text modifier of the build
 * @param {Set<string>} [input.activeNames] active skill names (the Ominous curse skill, Putrid Toad Distillate)
 * @param {object|null} [input.dance] planner.danceOfTheDeep (The Paradise I Curse: `cursed`)
 * @param {object} [input.conditions] resolved combat conditions (`blur` for "while Blur is active" lines)
 * @param {boolean} [input.enabled] the `illOmen` combat condition (default on)
 * @returns {object|null} null when the build applies no Ominous
 */
export function resolveIllOmen({ modifierTexts = [], activeNames = new Set(), dance = null, conditions = {}, enabled = true } = {}) {
  const sources = [];
  const efficiencyLines = [];
  const notModeled = [];
  let purification = null;
  for (const line of modifierTexts) {
    const text = String(line.text || "").trim();
    const scale = Number.isFinite(line.multiplier) ? line.multiplier : 1;
    const paradise = text.match(PARADISE);
    if (paradise) {
      if (dance?.cursed) sources.push({ kind: "trait", source: line.source, text, level: Number(paradise[1]) });
      continue;
    }
    const ominous = text.match(OMINOUS_LINE);
    if (ominous) { sources.push({ kind: line.origin === "gear" ? "gear" : "line", source: line.source, text, level: Number(ominous[1] || ominous[2]) }); continue; }
    const efficiency = text.match(EFFICIENCY);
    if (efficiency) {
      const value = Number(efficiency[1]) * scale;
      const blurOnly = Boolean(efficiency[2]);
      efficiencyLines.push({ source: line.source, text, value: round(value, 4), active: !blurOnly || Boolean(conditions.blur), condition: blurOnly ? "while Blur is active" : null });
      continue;
    }
    const purified = text.match(PURIFICATION);
    if (purified) { purification = { source: line.source, text, perStackPercent: Number(purified[1]) }; continue; }
    const nether = text.match(NETHER_KING);
    if (nether) notModeled.push({ source: line.source, text, reason: `+${nether[1]}% additional damage taken by enemies with Ill Omen: not modeled` });
  }
  if (activeNames.has("Ominous")) sources.push({ kind: "skill", source: "Skill: Ominous", text: "Cursed enemies can gain Ill Omen", level: null });
  if (!sources.length) return null;
  if (activeNames.has("Putrid Toad Distillate")) notModeled.push({ source: "Skill: Putrid Toad Distillate", text: "30.5% Ill Omen Cumulative Efficiency while Blur is active (Elixir)", reason: "Elixir charged by defeating enemies; its Blur uptime is not modeled, so its Cumulative Efficiency is not counted" });

  const counted = efficiencyLines.filter((line) => line.active);
  const rawPercent = round(counted.reduce((sum, line) => sum + line.value, 0), 4);
  const capped = rawPercent > ILL_OMEN_EFFICIENCY_CAP_PERCENT;
  const percent = Math.max(-100, Math.min(ILL_OMEN_EFFICIENCY_CAP_PERCENT, rawPercent));
  const scale = 1 + percent / 100;
  const perStack = purification?.perStackPercent ?? null;
  const normalStack = scale > 0 ? ILL_OMEN_NORMAL_THRESHOLD_PERCENT / scale : Infinity;
  const eliteStack = scale > 0 ? ILL_OMEN_ELITE_THRESHOLD_PERCENT / scale : Infinity;
  const normalFull = ILL_OMEN_MAX_STACKS * normalStack;
  const eliteFull = ILL_OMEN_MAX_STACKS * eliteStack;

  // Multipliers on the damage that builds stacks (DoT, Reaping, additional damage): extra True Damage ÷ damage dealt.
  const eliteFactor = perStack != null ? perStack / eliteStack : ILL_OMEN_ELITE_TRUE_DAMAGE_PERCENT / eliteFull;
  const normalFactor = perStack != null ? perStack / normalStack : null;
  const tiles = perStack != null ? [
    { key: "normal", label: "Normal / Magic (mapping)", multiplier: 1 + normalFactor, value: `×${fmt(1 + normalFactor)}`, explanation: `+${fmt(perStack)}% Max Life True Damage per stack, every ${fmt(normalStack)}% of life dealt (no elimination with Reap Purification)` },
    { key: "elite", label: "Rare / Elite", multiplier: 1 + eliteFactor, value: `×${fmt(1 + eliteFactor)}`, explanation: `+${fmt(perStack)}% Max Life True Damage per stack, every ${fmt(eliteStack)}% of life dealt` },
    { key: "boss", label: "Boss execute", multiplier: 1 + eliteFactor, value: `×${fmt(1 + eliteFactor)}`, explanation: `Continuous: +${fmt(perStack)}% Max Life per stack every ${fmt(eliteStack)}% of life dealt (Reap Purification bypasses the Boss lockout; provisional)`, provisional: true }
  ] : [
    { key: "normal", label: "Normal / Magic (mapping)", multiplier: 100 / normalFull, lifeDealtPercent: normalFull, value: `×${fmt(100 / normalFull)}`, explanation: `Eliminated after ${fmt(normalFull)}% of life dealt (10 × 8% ÷ ${fmt(scale)})` },
    { key: "elite", label: "Rare / Elite", multiplier: 1 + eliteFactor, lifeDealtPercent: eliteFull, value: `×${fmt(1 + eliteFactor)}`, explanation: `+20% Max Life True Damage every ${fmt(eliteFull)}% of life dealt; the stacks are consumed and it loops` },
    { key: "boss", label: "Boss execute", multiplier: null, lifeDealtPercent: eliteFull, value: "+20% Max Life", explanation: `20% of Max Life once, after ${fmt(eliteFull)}% of life dealt (10 × 5% ÷ ${fmt(scale)})` }
  ];

  const sourceText = [...new Set(sources.map((item) => item.kind === "skill" ? "Ominous (skill)" : `${item.source}${item.level ? ` (Lv. ${item.level} Ominous)` : ""}`))].join(", ");
  const efficiencyText = counted.length ? `${counted.map((line) => `${line.value >= 0 ? "+" : ""}${fmt(line.value)}% (${line.source})`).join(" ")} = ${fmt(rawPercent)}%${capped ? `, capped at ${ILL_OMEN_EFFICIENCY_CAP_PERCENT}%` : ""}` : "0% (no Cumulative Efficiency lines)";
  const inactive = efficiencyLines.filter((line) => !line.active).map((line) => `${line.source}: ${line.text} (Blur inactive)`);
  const factorText = perStack != null
    ? `Elite / Boss: ${fmt(perStack)}% ÷ (5% ÷ ${fmt(scale)}) = ×${fmt(eliteFactor)} of DoT + Reaping as True Damage; Normal: ${fmt(perStack)}% ÷ (8% ÷ ${fmt(scale)}) = ×${fmt(normalFactor)}`
    : `Elite: 20% ÷ (10 × 5% ÷ ${fmt(scale)}) = 0.4 × ${fmt(scale)} = ×${fmt(eliteFactor)} of DoT + Reaping as True Damage; Normal: 100% ÷ (10 × 8% ÷ ${fmt(scale)}); Boss: once at ${fmt(eliteFull)}%`;
  const working = [
    `Stacks build from Damage Over Time, Reaping and additional damage (not hits): 1 stack per 8% (non-Elite) / 5% (Elite) of Max Life ÷ (1 + e), max 10.`,
    `e = ${efficiencyText}.`,
    factorText + ".",
    inactive.length ? `Not counted: ${inactive.join("; ")}.` : "",
    notModeled.length ? `Not modeled: ${notModeled.map((item) => `${item.source}: ${item.text} (${item.reason})`).join("; ")}.` : ""
  ].filter(Boolean).join(" ");
  const applied = enabled !== false;
  const mainText = perStack != null
    ? `Ill Omen: Reap Purification, +${fmt(perStack)}% Max Life True Damage per stack every ${fmt(eliteStack)}% of life dealt (Elite; ×${fmt(eliteFactor)} of DoT + Reaping)`
    : `Ill Omen: Elite loop, +20% Max Life True Damage every ${fmt(eliteFull)}% of life dealt = 50% ÷ (1 + ${fmt(percent)}%) (×${fmt(eliteFactor)} of DoT + Reaping)`;
  return {
    sources,
    ominousSource: sourceText,
    efficiency: { lines: efficiencyLines, rawPercent, percent, capped, capPercent: ILL_OMEN_EFFICIENCY_CAP_PERCENT },
    reapPurification: purification ? { active: true, ...purification } : { active: false },
    notModeled,
    stackThresholdPercent: { normal: normalStack, elite: eliteStack },
    tiles,
    working,
    main: {
      applied,
      tier: "Elite",
      factor: applied ? eliteFactor : 0,
      eliteFactor,
      short: perStack != null ? `Reap Purification, +${fmt(perStack)}% Max Life per stack every ${fmt(eliteStack)}% of life dealt` : `Elite loop, +20% Max Life every ${fmt(eliteFull)}% of life dealt`,
      text: applied ? `${mainText} (best case; the training dummy never triggers it).` : "Ill Omen: off (condition off); the dummy figures leave it out."
    }
  };
}

/** The extra Ill Omen True Damage per second for a window: (DoT + Reaping DPS) × factor. */
export function illOmenDps(illOmen, stackBuildingDps) {
  const factor = illOmen?.main?.factor || 0;
  return factor > 0 && stackBuildingDps > 0 ? stackBuildingDps * factor : 0;
}
