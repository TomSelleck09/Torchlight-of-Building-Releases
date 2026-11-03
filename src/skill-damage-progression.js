import { skillLevelDamageMultiplier } from "./engine.js";

export function leveledSkillDamage(skill) {
  if (skill?.role !== "main") return { additionalPercent: null, ranges: [] };
  // No upper clamp: past Lv.40 the level multiplier continues at +8% per level (engine.js).
  const level = Math.max(1, Math.trunc(Number(skill.effectiveLevel) || 1));
  if (level < 20) return { additionalPercent: null, ranges: [] };
  const multiplier = skillLevelDamageMultiplier(level);
  const ranges = Object.entries(skill.databaseLevel20 || {})
    .filter(([key, value]) => /Damage$/.test(key) && Array.isArray(value) && value.length === 2 && value.every(Number.isFinite))
    .map(([key, value]) => ({ key, base: value, leveled: value.map((amount) => Math.round(amount * multiplier)) }));
  return { additionalPercent: Math.round((multiplier - 1) * 1000) / 10, ranges };
}
