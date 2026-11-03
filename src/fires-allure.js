// The later Volcano on/off test contradicts the proposed duration immunity.
// Use ordinary duration scaling provisionally; exact Scorch timing is pending.
export function firesAllureDurationSources(sources) {
  return sources;
}

// `fixedResistance`: false, true (fixed at 0: Fueling) or the fixed value (Ice to Blaze's Frostbitten line, hero trait audit B2).
export function calculateFiresAllure({ active, limit, canApply, nearby = true, stacks, baseResistance, fixedResistance = false }) {
  const fixedValue = fixedResistance === true ? 0 : Number.isFinite(fixedResistance) ? fixedResistance : null;
  const activeStacks = active && canApply ? Math.max(0, Math.min(limit, Number.isFinite(stacks) ? stacks : limit)) : 0;
  // Scorch buff 131 applies -20 to every resistance at ordinary effect scale;
  // Fire's Allure separately applies -10 Fire Resistance per stack within 10m.
  const scorchBaseResistanceReductionPercent = activeStacks > 0 && fixedValue == null ? 20 : 0;
  const allureFireResistanceReductionPercent = activeStacks > 0 && nearby && fixedValue == null ? activeStacks * 10 : 0;
  const reduction = scorchBaseResistanceReductionPercent + allureFireResistanceReductionPercent;
  return { active, activeStacks, nearby, scorchBaseResistanceReductionPercent, allureFireResistanceReductionPercent, resistanceReductionPercent: reduction,
    effectiveResistancePercent: fixedValue != null ? fixedValue : baseResistance - reduction,
    stackAssumption: Number.isFinite(stacks) ? "Configured active Scorch stacks" : "Maximum Scorch stacks · best case",
    durationAssumption: "4-second base; duration scaling provisional pending timing test" };
}
