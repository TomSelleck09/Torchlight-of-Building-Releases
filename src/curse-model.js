import { curseGameValue } from "./curse-effects.js";

// Scorch and Entangled Pain at the setup's level. Game mode (default; research/recipe-interpreter-step1-2026-10-25.md §17): the curse's
// debuff record (config_char_buff 16080 Scorch "+X% additional Fire Damage taken" / 16110 Entangled Pain "+X% additional Damage Over
// Time taken", both {1: 20, 21: 40, 41: 50}), which reproduces the captured in-game values exactly (Scorch Lv31 45%, Entangled Pain
// Lv26 42.5%). Scorch's "10% chance to be Ignited when hit" is the record's fixed 504868 [10]. TLI_BUFF_PATH=text: the captured level
// endpoints (Lv.20 database value, linear to the captured level).
// Curse Effect: both debuffs write p0 × GetEffectScale (200000312, 101010425, 504868), as the other curses do, so a curse on the bar reads
// its level value × (1 + Curse Effect). Pass the build's total as `curseEffectPercent`. With no such setup the fallback stands unscaled.
const GAME_KEYS = { cursedEnemyAdditionalFireDamageTakenPercent: "Scorch", cursedEnemyAdditionalDamageOverTimeTakenPercent: "Entangled Pain" };
export function curseEffects(setups = [], curseEffectPercent = 0) {
  const scale = 1 + curseEffectPercent / 100;
  const atLevel = (setup, name, key, fallback) => {
    const game = GAME_KEYS[key] === name ? curseGameValue(name, setup.effectiveLevel ?? setup.baseLevel + setup.addedLevels) : null;
    if (game != null) return game;
    const at20 = setup.databaseLevel20?.[key];
    const captured = setup.observed?.[key];
    const level = setup.effectiveLevel ?? setup.baseLevel + setup.addedLevels;
    const capturedLevel = setup.baseLevel + setup.addedLevels;
    if (!Number.isFinite(at20)) return captured ?? fallback;
    if (!Number.isFinite(captured) || level <= 20 || !(capturedLevel > 20)) return at20;
    return at20 + (captured - at20) * (level - 20) / (capturedLevel - 20);
  };
  const effect = (name, key, fallback) => {
    const setup = setups.find(item => item.name === name);
    return setup ? atLevel(setup, name, key, fallback) * scale : fallback;
  };
  return {
    scorchDamagePercent: effect("Scorch", "cursedEnemyAdditionalFireDamageTakenPercent", 45),
    scorchSelfIgniteChancePercent: effect("Scorch", "chanceToBeIgnitedWhenHitByCursedEnemyPercent", 10),
    entangledPainDamagePercent: effect("Entangled Pain", "cursedEnemyAdditionalDamageOverTimeTakenPercent", 42.5)
  };
}
