import { effectiveGearModifierTexts } from "./engine.js";
import { normalizePercentageText } from "./percentage-text.js";

export function parseBlessingRecovery(text) {
  const clean = normalizePercentageText(text).replace(/^Feline Steps:\s*/i, "").trim();
  const match = clean.match(/^\+([\d.]+)% Reaping Recovery Speed for every stack of any Blessing[.;]?\s*Stacks up to (\d+) time(?:\(s\)|s)?[.]?$/i);
  return match ? { perStack: Number(match[1]), cap: Number(match[2]) } : null;
}

export function blessingRecoverySources(equipment, blessings) {
  const totalStacks = (blessings?.entries || []).reduce((sum, blessing) => sum + blessing.stacks, 0);
  return (equipment?.candidateItems || []).flatMap(item => effectiveGearModifierTexts(item).flatMap(text => {
    const parsed = parseBlessingRecovery(text);
    if (!parsed) return [];
    const stacks = Math.min(parsed.cap, totalStacks);
    return [{ source: item.name, text, ...parsed, totalStacks, stacks, value: parsed.perStack * stacks }];
  }));
}
