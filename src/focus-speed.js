// Focus Speed (attr 7030, default 1). Game manual 1001012924: "Focus Pts gained are affected by Focus Speed bonuses"; 1001012925: "Focus
// Pts = Base value × (1 + all non-additional bonus percentages) × (1 + additional bonus percentage 1) × …". So a Focus skill's gain
// rate scales, and with it its uses where the gain bounds them (the rate models: Acute Strikes, Thunderstrikes, Corrosion Orb hits,
// Glacial Spikes), up to the skill's own consumption gate. The game's "+X% Focus Speed" rows (15788317, 748100224: attr 7030 mod 3, no
// tags) reach every Focus skill. Chunk 2, 2026-11-01 (the memory random family 402xxxx rows, gear and talents carry the same line).
// The supports' "for the supported skill" clauses (chunk 8, 2026-11-01): Focus Acceleration writes attr 7030 mod 3 and joins the sum,
// Acuteness Focus: Sharpening (recipe 324076064) mod 4, a factor of its own. Not read: Transcendence's conditional line.
const FOCUS_SPEED_LINE = /^\+?(-?\d+(?:\.\d+)?)% Focus Speed$/i;
const clean = (line) => String(line?.text ?? "").replace(/\s+/g, " ").replace(/\s+%/g, "%").trim();

/** Σ "+X% Focus Speed" of the build. */
export function focusSpeedPercent(modifierTexts = []) {
  return modifierTexts.reduce((total, line) => {
    const match = line?.lineEffect ? null : clean(line).match(FOCUS_SPEED_LINE);
    return match ? total + Number(match[1]) * (line.multiplier ?? 1) : total;
  }, 0);
}

export const isFocusRateProfile = (profile) => profile?.useModel?.kind === "rate" && / Focus$/.test(String(profile?.name || ""));

/** A copy of a Focus skill's profile with its Focus Pts gain scaled; the profile as it is without a Focus Speed bonus. */
export function applyFocusSpeed(profile, modifierTexts = [], supportLines = []) {
  if (!isFocusRateProfile(profile)) return profile;
  const percent = focusSpeedPercent(modifierTexts) + supportLines.filter((line) => !line.additional).reduce((total, line) => total + line.value, 0);
  const additional = supportLines.filter((line) => line.additional).reduce((total, line) => total * Math.max(0, 1 + line.value / 100), 1);
  if (!percent && additional === 1) return profile;
  const factor = Math.max(0, 1 + percent / 100) * additional, model = profile.useModel;
  const usesPerSecond = Math.min(model.maxUsesPerSecond ?? Infinity, model.usesPerSecond * factor);
  return {
    ...profile,
    ...(profile.focus ? { focus: { ...profile.focus, pointsPerSecond: profile.focus.pointsPerSecond * factor } } : {}),
    useModel: { ...model, usesPerSecond, firstUseSeconds: factor > 0 ? model.firstUseSeconds / factor : model.firstUseSeconds, note: `${model.note || ""}; +${percent}% Focus Speed: Focus Pts gained ×${factor} (game manual 1001012924)` }
  };
}
