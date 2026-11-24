// The skill board's Energy budget from the SS14 client tables (2026-11-22; research/energy-budget-2026-11-22.md;
// scripts/build-energy-tables.mjs → src/data/game/energy-ss14.generated.js).
//
// Max Energy = the character level's Energy + the equipped gear's Energy (+ "+N Max Energy" lines: Effortless Command, src/planner.js).
// - Level: config_cost_level holds 5 at level 1 and 1 at each level after; read as the Energy gained on reaching each level, so a
//   character at level L has L + 4 (handbook 20020: "You get energy by leveling up and from gear that have energy stats"). The sum is
//   inferred; it equals the Selena capture's 102 at her level 98, the constant every build read before (open question
//   skill-energy-level-sum).
// - Sockets: config_skill_slots gives each support socket's cost, 0 / 10 / 15 / 50 / 100 on an Active slot and 10 / 10 / 15 / 50 / 100 on
//   a Passive slot, the same as the SS13 capture's tables; the skill itself costs nothing.
// - Gear: each item's own Energy (its stored `energy`). In game it is rolled in a range by item type and item level (config_item_cost:
//   1 to 61 or 2 to 122 at item level 80 and above); the crafter stores the range's top, so a build made by hand reads the most its gear
//   can hold.
import { LEVEL_ENERGY_GAINS, SKILL_SLOT_ENERGY_COSTS } from "./data/game/energy-ss14.generated.js";

/** The Energy a character at `level` (1..100) has from levels: the sum of config_cost_level's rows 1..level. */
export function characterLevelEnergy(level) {
  const capped = Math.max(1, Math.min(LEVEL_ENERGY_GAINS.length, Math.floor(Number(level) || 1)));
  return LEVEL_ENERGY_GAINS.slice(0, capped).reduce((sum, gain) => sum + gain, 0);
}

/**
 * The skill board's Energy profile for one build: the captured profile's setup bookkeeping (enabledSupportSlotsBySetup, observed
 * figures) with the game's socket costs and the character level's Energy. `characterLevel` is src/planner.js buildCharacterLevel's
 * { level, stored }.
 */
export function skillEnergyProfile(baseProfile, characterLevel) {
  const level = characterLevel?.level ?? 100;
  return {
    ...baseProfile,
    activeSlotCosts: [...SKILL_SLOT_ENERGY_COSTS.active],
    passiveSlotCosts: [...SKILL_SLOT_ENERGY_COSTS.passive],
    nonEquipmentEnergy: characterLevelEnergy(level),
    nonEquipmentEnergySource: { characterLevel: level, stored: Boolean(characterLevel?.stored), table: "config_cost_level" }
  };
}
