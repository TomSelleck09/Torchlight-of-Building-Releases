// Quick Ritual, Daze, Instant Smash, and Vile are read from their text by build-mechanics,
// blur-effects, and the ailment/Reaping engines. Fiery Fantasy is applied per ailment.
export const modeledCoreTalents = ["Affliction", "Subtle Impact", "Indifference", "Fueling", "True Flame", "Starfire", "Off The Beaten Track", "Fire's Allure", "Fiery Fantasy", "Quick Ritual", "Daze", "Instant Smash", "Vile"];
// Cores read from their text whose badge depends on the build (src/line-coverage.js): Conductive changes Numbed's base effect
// (src/combat-states.js), In calc only where the build inflicts Numbed. Not in modeledCoreTalents, which badges a core In calc
// unconditionally.
export const conditionalTextCoreTalents = ["Conductive"];
// Defensive cores: no effect on dummy damage.
export const noDamageCoreTalents = ["Holiness"];

// Fiery Fantasy (reference data): +3% additional <Ailment> Damage, up to +150%, for every +1% <Ailment> Chance above 100%.
export function fieryFantasyAdditionalPercent(rawChancePercent) {
  return Math.min(150, 3 * Math.max(0, rawChancePercent - 100));
}

export function calculateCoreTalents(activeCores, { remainingEnergy = 0, blur = false, ignited = false, afflictionRating = 0, afflictionEffectPercent = 0, additionalAfflictionEffectFactor = 1 } = {}) {
  const lines = [];
  const add = (source, stat, value, condition = "Unconditional") => { if (value) lines.push({ source, stat, value, condition }); };
  if (activeCores.has("Affliction")) {
    add("Affliction", "afflictionPerSecond", 30);
    add("Affliction", "additionalAfflictionEffectPercent", 30);
  }
  if (activeCores.has("Subtle Impact") && blur) add("Subtle Impact", "additionalDamageOverTimePercent", 30, "Blur active");
  // Game record 759880384: GetMaxMin(0, (GetCostValue(1) − GetCostValue(0)) ÷ 5 × 1, 50). No GetFloorInt, so 33 Energy left is +6.6%.
  if (activeCores.has("Indifference")) add("Indifference", "additionalDamagePercent", Math.min(50, Math.max(0, remainingEnergy) / 5), "Remaining Energy");
  if (activeCores.has("True Flame") && ignited) add("True Flame", "additionalFireHitDamagePercent", Math.max(0, afflictionRating) * (1 + afflictionEffectPercent / 100) * additionalAfflictionEffectFactor * 0.65, "Enemy Ignited; configured Affliction");
  return { lines, firesAllure: activeCores.has("Fire's Allure"), fixesFireResistance: activeCores.has("Fueling") };
}
