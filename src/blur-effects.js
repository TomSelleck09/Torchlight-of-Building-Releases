import { effectiveGearModifierTexts } from "./engine.js";
import { normalizePercentageText } from "./percentage-text.js";
import { FIXED_BLUR_RATING } from "./blur-sources.js";
import { slateTalentLines } from "./nether-king-authority.js";

export function calculateBlurEffects({ equipment, talents = [], slates = [], active = false, recentlyEnded = false, hasSource = false } = {}) {
  const texts = [], ratingGainSources = [];
  const add = (text, source, multiplier = 1) => texts.push({ text: normalizePercentageText(text), source, multiplier });
  for (const item of equipment?.candidateItems || []) for (const text of effectiveGearModifierTexts(item)) {
    add(text, item.name);
    const gain = text.match(/^Grants ([\d.]+) Blur Rating per second when equipped in the right Ring slot$/i);
    if (gain && item.slot === "rightRing") ratingGainSources.push({ source: item.name, value: Number(gain[1]) });
  }
  for (const panel of talents) for (const node of panel.allocatedNodes || []) if (node.rank > 0 && !node.replacedBy) for (const text of (node.description || "").split("|")) add(text.trim(), panel.name, node.rank * (node.inverseEffectMultiplier ?? 1));
  // Selected cores (talent batch T4): the Warlock core Daze and the Shadowmaster core Stealth Stab are Blur effects
  // too. Daze is one state (a boolean below), so a Daze slate plus the Daze core still count once (cores never stack, user rule 2026-10-21; Q7).
  for (const panel of talents) for (const core of panel.activeCores || []) for (const text of (core.description || "").split("|")) add(text.trim(), `${panel.name} core: ${core.name}`);
  for (const slate of slates) for (const text of slateTalentLines(slate)) add(text.replace(/^.*:\s*/, ""), slate.name);
  // Blur Effect can close a longer modifier: Valerie's Night Stroll (corroded) "Refreshes Blur upon gaining
  // Blur , Interval: 1s. +49% Blur Effect" is one line, so the clause after a sentence break counts too.
  const effectPercent = texts.reduce((sum, line) => sum + (Number(line.text.match(/(?:^|[.;]\s+)([+-]?[\d.]+)% Blur Effect$/i)?.[1]) || 0) * line.multiplier, 0);
  // A fixed Blur Rating ("Has 120 points of fixed Blur Rating", src/blur-sources.js FIXED_BLUR_RATING) replaces the held 100, past
  // that cap like a fixed Fervor Rating (legendary audit batch 1; the highest fixed value is used: provisional).
  const fixedRatings = texts.map((line) => Number(line.text.match(FIXED_BLUR_RATING)?.[1])).filter((value) => value > 0);
  const rating = active ? (fixedRatings.length ? Math.max(...fixedRatings) : 100) : 0;
  const damageSources = [], movementSources = [];
  let stealth = false, refresh = false, daze = false;
  for (const line of texts) {
    if (line.multiplier <= 0) continue;
    const dot = line.text.match(/^Blur gains an additional effect:\s*\+([\d.]+)% (additional )?Damage Over Time for (?:each|every 1) Blur Rating$/i);
    if (dot && active) damageSources.push({ source: line.source + " · Blur", value: Number(dot[1]) * line.multiplier * rating * (1 + effectPercent / 100), additional: Boolean(dot[2]) });
    if (/\bDaze\b|additional Ailment Damage while Blur is active/i.test(line.text)) daze = true;
    if (/Stealth Stab|additional damage taken while Blur is active/i.test(line.text)) stealth = true;
    if (/^Refreshes Blur upon gaining Blur/i.test(line.text)) refresh = true;
    const movement = line.text.replace(/^Feline Steps:\s*/i, "").match(/^\+([\d.]+)% Movement Speed$/i);
    if (movement) movementSources.push({ source: line.source, value: Number(movement[1]) * line.multiplier });
  }
  if (daze && active) damageSources.push({ source: "Daze · Blur active", value: 25, additional: true });
  const afterEnd = !active && hasSource && recentlyEnded && stealth;
  if (afterEnd) damageSources.push({ source: "Stealth Stab · within 3s after Blur ends", value: 25, additional: true, hit: true });
  const ratingGainPerSecond = ratingGainSources.reduce((sum, source) => sum + source.value, 0);
  return { crowdControlEffectPercent: daze && active ? 40 : 0, active, rating, effectPercent, damageSources, movementSources, refresh, afterEnd, stealth, ratingGainSources, ratingGainPerSecond, ratingDecayPerSecond: 10, netRatingPerSecond: active ? ratingGainPerSecond - 10 : 0, damageTakenFactor: active && stealth ? 0.85 : 1, avoidancePercent: rating * 0.25 * (1 + effectPercent / 100) };
}
