// Skill and support levels as the player sets them: the saved value is the BASE level
// (the gem's own level, 1–40 in the selector). "+N level" sources from gear, talents and
// slates are added on top by the planner to give the effective level.
export const MIN_BASE_LEVEL = 1;
export const MAX_BASE_LEVEL = 40;

// Clamps a saved base level to the selector range. Missing or non-numeric values are
// returned unchanged so callers keep their own defaults.
export function clampBaseLevel(value) {
  if (value === null || value === "" || !Number.isFinite(Number(value))) return value;
  return Math.max(MIN_BASE_LEVEL, Math.min(MAX_BASE_LEVEL, Math.trunc(Number(value))));
}

// The level the skill selector starts from for an installed setup: its base level, never
// the effective level (saving the effective level as the base would add the bonus twice).
export function selectorBaseLevel(setup, fallback = 20) {
  const level = clampBaseLevel(setup?.baseLevel ?? setup?.effectiveLevel);
  return Number.isFinite(level) ? level : fallback;
}
